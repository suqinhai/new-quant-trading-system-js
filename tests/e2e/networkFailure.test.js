/**
 * 网络故障恢复 E2E 测试
 * Network Failure Recovery E2E Tests
 *
 * 测试系统在各种网络故障场景下的恢复能力
 * @module tests/e2e/networkFailure.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  E2ETestEnvironment,
  testUtils,
  RUN_MODE,
} from './e2eTestFramework.js';
import { createFailingExchangeMock, createSlowExchangeMock } from '../mocks/exchangeMock.js';

// ============================================
// 网络故障模拟器
// ============================================

class NetworkSimulator {
  constructor() {
    this.isOnline = true;
    this.latency = 0;
    this.packetLoss = 0;
    this.listeners = new Set();
  }

  goOffline() {
    this.isOnline = false;
    this._notifyListeners('offline');
  }

  goOnline() {
    this.isOnline = true;
    this._notifyListeners('online');
  }

  setLatency(ms) {
    this.latency = ms;
    this._notifyListeners('latencyChange', { latency: ms });
  }

  setPacketLoss(rate) {
    this.packetLoss = Math.min(1, Math.max(0, rate));
    this._notifyListeners('packetLossChange', { rate: this.packetLoss });
  }

  simulateIntermittent(onDuration, offDuration, cycles = 3) {
    return new Promise(async (resolve) => {
      for (let i = 0; i < cycles; i++) {
        this.goOnline();
        await testUtils.delay(onDuration);
        this.goOffline();
        await testUtils.delay(offDuration);
      }
      this.goOnline();
      resolve();
    });
  }

  shouldDropPacket() {
    return Math.random() < this.packetLoss;
  }

  onStatusChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notifyListeners(event, data = {}) {
    for (const listener of this.listeners) {
      listener({ event, ...data, timestamp: Date.now() });
    }
  }

  reset() {
    this.isOnline = true;
    this.latency = 0;
    this.packetLoss = 0;
  }
}

// ============================================
// 带网络模拟的交易所 Mock
// ============================================

function createNetworkAwareExchangeMock(networkSim) {
  let orderIdCounter = 1000;

  return {
    id: 'binance',
    name: 'Binance',

    createOrder: async (symbol, type, side, amount, price) => {
      if (!networkSim.isOnline) {
        throw new Error('Network is offline');
      }

      if (networkSim.shouldDropPacket()) {
        throw new Error('Network timeout - packet lost');
      }

      if (networkSim.latency > 0) {
        await testUtils.delay(networkSim.latency);
      }

      return {
        id: `order_${++orderIdCounter}`,
        symbol,
        type,
        side,
        amount,
        price: price || 50000,
        status: 'filled',
        timestamp: Date.now(),
      };
    },

    cancelOrder: async (orderId) => {
      if (!networkSim.isOnline) {
        throw new Error('Network is offline');
      }

      if (networkSim.latency > 0) {
        await testUtils.delay(networkSim.latency);
      }

      return { id: orderId, status: 'canceled' };
    },

    fetchBalance: async () => {
      if (!networkSim.isOnline) {
        throw new Error('Network is offline');
      }

      return {
        USDT: { free: 10000, used: 0, total: 10000 },
        BTC: { free: 1, used: 0, total: 1 },
      };
    },

    fetchTicker: async (symbol) => {
      if (!networkSim.isOnline) {
        throw new Error('Network is offline');
      }

      return {
        symbol,
        last: 50000,
        bid: 49990,
        ask: 50010,
        timestamp: Date.now(),
      };
    },
  };
}

// ============================================
// 网络故障恢复 E2E 测试
// ============================================

describe('Network Failure Recovery E2E', () => {
  let env;
  let networkSim;

  beforeEach(async () => {
    networkSim = new NetworkSimulator();

    env = new E2ETestEnvironment({
      mode: RUN_MODE.SHADOW,
      initialEquity: 10000,
      symbols: ['BTC/USDT'],
      exchanges: ['binance'],
      executorConfig: {
        maxRetries: 5,
        retryDelay: 100,
      },
    });
    await env.setup();
    await env.start();
  });

  afterEach(async () => {
    await env.teardown();
    networkSim.reset();
  });

  // ============================================
  // 完全网络中断测试
  // ============================================

  describe('完全网络中断', () => {
    it('应该在网络中断时正确处理订单失败', async () => {
      const networkExchange = createNetworkAwareExchangeMock(networkSim);
      env.components.exchanges.set('binance', networkExchange);
      env.getExecutor().addExchange('binance', networkExchange);
      env.getExecutor().config.dryRun = false;

      // 网络离线
      networkSim.goOffline();

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getErrors().length > 0,
        { timeout: 3000 }
      );

      const errors = env.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('offline');
    });

    it('应该在网络恢复后自动重试成功', async () => {
      let attempts = 0;
      const recoveringExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          attempts++;
          if (attempts <= 2) {
            throw new Error('Network is offline');
          }
          return {
            id: `order_${Date.now()}`,
            symbol, type, side, amount,
            price: price || 50000,
            status: 'filled',
          };
        },
      };

      env.components.exchanges.set('binance', recoveringExchange);
      env.getExecutor().addExchange('binance', recoveringExchange);
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 3000 }
      );

      expect(attempts).toBe(3);
      expect(env.getEvents('orderFilled').length).toBe(1);
    });

    it('应该在长时间网络中断后正确恢复', async () => {
      const networkExchange = createNetworkAwareExchangeMock(networkSim);
      env.components.exchanges.set('binance', networkExchange);
      env.getExecutor().addExchange('binance', networkExchange);
      env.getExecutor().config.dryRun = false;

      // 网络离线
      networkSim.goOffline();

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.delay(500);

      // 网络恢复
      networkSim.goOnline();

      // 新订单应该成功
      strategy.generateSignal('sell');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 2000 }
      );

      expect(env.getEvents('orderFilled').length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 间歇性网络故障测试
  // ============================================

  describe('间歇性网络故障', () => {
    it('应该处理间歇性网络中断', async () => {
      let callCount = 0;
      const flakyExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          callCount++;
          // 模拟间歇性故障：每3次请求失败1次
          if (callCount % 3 === 0) {
            throw new Error('Network timeout');
          }
          return {
            id: `order_${callCount}`,
            symbol, type, side, amount,
            price: price || 50000,
            status: 'filled',
          };
        },
      };

      env.components.exchanges.set('binance', flakyExchange);
      env.getExecutor().addExchange('binance', flakyExchange);
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();

      // 发送多个订单
      for (let i = 0; i < 5; i++) {
        strategy.generateSignal(i % 2 === 0 ? 'buy' : 'sell');
      }

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 5,
        { timeout: 5000 }
      );

      // 所有订单最终应该成功（通过重试）
      expect(env.getEvents('orderFilled').length).toBe(5);
    });

    it('应该在网络抖动时保持订单状态一致', async () => {
      const orderStates = new Map();
      let orderCounter = 0;

      const jitterExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          orderCounter++;
          const orderId = `order_${orderCounter}`;

          // 随机延迟模拟网络抖动
          await testUtils.delay(Math.random() * 200);

          // 20% 概率超时
          if (Math.random() < 0.2) {
            throw new Error('Network jitter timeout');
          }

          const order = {
            id: orderId,
            symbol, type, side, amount,
            price: price || 50000,
            status: 'filled',
          };
          orderStates.set(orderId, order);
          return order;
        },
      };

      env.components.exchanges.set('binance', jitterExchange);
      env.getExecutor().addExchange('binance', jitterExchange);
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();

      // 发送多个并发订单
      for (let i = 0; i < 3; i++) {
        strategy.generateSignal('buy');
      }

      await testUtils.delay(2000);

      // 验证成功的订单状态一致
      const filledEvents = env.getEvents('orderFilled');
      for (const event of filledEvents) {
        expect(event.data.status).toBe('filled');
      }
    });
  });

  // ============================================
  // 高延迟网络测试
  // ============================================

  describe('高延迟网络', () => {
    it('应该处理高延迟响应', async () => {
      const networkExchange = createNetworkAwareExchangeMock(networkSim);
      env.components.exchanges.set('binance', networkExchange);
      env.getExecutor().addExchange('binance', networkExchange);
      env.getExecutor().config.dryRun = false;

      // 设置高延迟
      networkSim.setLatency(500);

      const strategy = env.getStrategy();
      const startTime = Date.now();

      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 5000 }
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(500);
      expect(env.getEvents('orderFilled').length).toBe(1);
    });

    it('应该在延迟逐渐增加时正常工作', async () => {
      let currentLatency = 50;
      const increasingLatencyExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          await testUtils.delay(currentLatency);
          currentLatency += 100; // 每次增加100ms

          return {
            id: `order_${Date.now()}`,
            symbol, type, side, amount,
            price: price || 50000,
            status: 'filled',
          };
        },
      };

      env.components.exchanges.set('binance', increasingLatencyExchange);
      env.getExecutor().addExchange('binance', increasingLatencyExchange);
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();

      // 发送多个订单
      for (let i = 0; i < 3; i++) {
        strategy.generateSignal('buy');
      }

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 3,
        { timeout: 10000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(3);
    });

    it('应该在高延迟时不阻塞其他操作', async () => {
      env.injectSlowExchange('binance', 500);

      const strategy = env.getStrategy();

      // 发送多个订单（应该并行处理）
      strategy.generateSignal('buy');
      strategy.generateSignal('sell');
      strategy.generateSignal('buy');

      const startTime = Date.now();

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 3,
        { timeout: 5000 }
      );

      const duration = Date.now() - startTime;

      // 如果并行处理，总时间应该接近单个订单的延迟，而不是3倍
      expect(duration).toBeLessThan(2000);
      expect(env.getEvents('orderFilled').length).toBe(3);
    });
  });

  // ============================================
  // 丢包测试
  // ============================================

  describe('网络丢包', () => {
    it('应该处理高丢包率网络', async () => {
      const networkExchange = createNetworkAwareExchangeMock(networkSim);
      env.components.exchanges.set('binance', networkExchange);
      env.getExecutor().addExchange('binance', networkExchange);
      env.getExecutor().config.dryRun = false;
      env.getExecutor().config.maxRetries = 10; // 增加重试次数

      // 50% 丢包率
      networkSim.setPacketLoss(0.5);

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0 || env.getErrors().length > 0,
        { timeout: 5000 }
      );

      // 由于高丢包率，可能成功也可能失败，但系统应该稳定
      const stats = env.getExecutor().getStats();
      expect(stats.totalOrders).toBe(1);
    });

    it('应该在丢包率下降后恢复正常', async () => {
      const networkExchange = createNetworkAwareExchangeMock(networkSim);
      env.components.exchanges.set('binance', networkExchange);
      env.getExecutor().addExchange('binance', networkExchange);
      env.getExecutor().config.dryRun = false;

      // 高丢包率
      networkSim.setPacketLoss(0.8);

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.delay(500);

      // 降低丢包率
      networkSim.setPacketLoss(0);

      // 新订单应该成功
      strategy.generateSignal('sell');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 3000 }
      );

      expect(env.getEvents('orderFilled').length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // DNS 故障测试
  // ============================================

  describe('DNS 故障', () => {
    it('应该处理 DNS 解析失败', async () => {
      const dnsFailExchange = {
        createOrder: async () => {
          const error = new Error('getaddrinfo ENOTFOUND api.exchange.com');
          error.code = 'ENOTFOUND';
          throw error;
        },
      };

      env.components.exchanges.set('binance', dnsFailExchange);
      env.getExecutor().addExchange('binance', dnsFailExchange);
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getErrors().length > 0,
        { timeout: 3000 }
      );

      const errors = env.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('ENOTFOUND');
    });

    it('应该在 DNS 恢复后重试成功', async () => {
      let attempts = 0;
      const recoveringDnsExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          attempts++;
          if (attempts <= 2) {
            const error = new Error('getaddrinfo ENOTFOUND');
            error.code = 'ENOTFOUND';
            throw error;
          }
          return {
            id: `order_${Date.now()}`,
            symbol, type, side, amount,
            price: price || 50000,
            status: 'filled',
          };
        },
      };

      env.components.exchanges.set('binance', recoveringDnsExchange);
      env.getExecutor().addExchange('binance', recoveringDnsExchange);
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 3000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(1);
    });
  });

  // ============================================
  // SSL/TLS 故障测试
  // ============================================

  describe('SSL/TLS 故障', () => {
    it('应该处理 SSL 证书错误', async () => {
      const sslFailExchange = {
        createOrder: async () => {
          const error = new Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
          error.code = 'CERT_HAS_EXPIRED';
          throw error;
        },
      };

      env.components.exchanges.set('binance', sslFailExchange);
      env.getExecutor().addExchange('binance', sslFailExchange);
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getErrors().length > 0,
        { timeout: 3000 }
      );

      const errors = env.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('应该处理 SSL 握手超时', async () => {
      const sslTimeoutExchange = {
        createOrder: async () => {
          await testUtils.delay(100);
          const error = new Error('SSL handshake timeout');
          error.code = 'ESSLHANDSHAKE';
          throw error;
        },
      };

      env.components.exchanges.set('binance', sslTimeoutExchange);
      env.getExecutor().addExchange('binance', sslTimeoutExchange);
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getErrors().length > 0,
        { timeout: 3000 }
      );

      expect(env.getErrors().length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 连接池耗尽测试
  // ============================================

  describe('连接池耗尽', () => {
    it('应该处理连接池耗尽', async () => {
      let connectionCount = 0;
      const maxConnections = 3;

      const limitedExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          connectionCount++;
          if (connectionCount > maxConnections) {
            const error = new Error('Connection pool exhausted');
            error.code = 'ECONNEXHAUSTED';
            throw error;
          }

          await testUtils.delay(100);
          connectionCount--;

          return {
            id: `order_${Date.now()}`,
            symbol, type, side, amount,
            price: price || 50000,
            status: 'filled',
          };
        },
      };

      env.components.exchanges.set('binance', limitedExchange);
      env.getExecutor().addExchange('binance', limitedExchange);
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();

      // 发送超过连接池限制的请求
      for (let i = 0; i < 5; i++) {
        strategy.generateSignal('buy');
      }

      await testUtils.delay(1000);

      // 系统应该处理了一些请求
      const stats = env.getExecutor().getStats();
      expect(stats.totalOrders).toBe(5);
    });
  });

  // ============================================
  // WebSocket 断开重连测试
  // ============================================

  describe('WebSocket 断开重连', () => {
    it('应该模拟 WebSocket 断开后重连', async () => {
      let wsConnected = true;
      let reconnectCount = 0;

      const wsExchange = {
        isConnected: () => wsConnected,

        connect: async () => {
          wsConnected = true;
          reconnectCount++;
          return true;
        },

        disconnect: async () => {
          wsConnected = false;
        },

        createOrder: async (symbol, type, side, amount, price) => {
          if (!wsConnected) {
            throw new Error('WebSocket not connected');
          }
          return {
            id: `order_${Date.now()}`,
            symbol, type, side, amount,
            price: price || 50000,
            status: 'filled',
          };
        },
      };

      env.components.exchanges.set('binance', wsExchange);
      env.getExecutor().addExchange('binance', wsExchange);
      env.getExecutor().config.dryRun = false;

      // 模拟 WS 断开
      await wsExchange.disconnect();

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.delay(100);

      // 重连
      await wsExchange.connect();

      // 新订单应该成功
      strategy.generateSignal('sell');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 2000 }
      );

      expect(reconnectCount).toBeGreaterThanOrEqual(1);
      expect(env.getEvents('orderFilled').length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 网络恢复验证测试
  // ============================================

  describe('网络恢复验证', () => {
    it('应该在网络恢复后验证系统状态正常', async () => {
      const networkExchange = createNetworkAwareExchangeMock(networkSim);
      env.components.exchanges.set('binance', networkExchange);
      env.getExecutor().addExchange('binance', networkExchange);
      env.getExecutor().config.dryRun = false;

      // 网络离线
      networkSim.goOffline();

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.delay(300);

      // 网络恢复
      networkSim.goOnline();

      // 连续发送多个订单测试恢复后的稳定性
      for (let i = 0; i < 5; i++) {
        strategy.generateSignal(i % 2 === 0 ? 'buy' : 'sell');
      }

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 5,
        { timeout: 5000 }
      );

      expect(env.getEvents('orderFilled').length).toBeGreaterThanOrEqual(5);

      // 验证系统状态
      const status = env.getStatus();
      expect(status.status).toBeDefined();
    });

    it('应该正确记录网络故障和恢复事件', async () => {
      const events = [];
      const networkExchange = createNetworkAwareExchangeMock(networkSim);

      networkSim.onStatusChange((event) => {
        events.push(event);
      });

      env.components.exchanges.set('binance', networkExchange);
      env.getExecutor().addExchange('binance', networkExchange);
      env.getExecutor().config.dryRun = false;

      // 模拟网络状态变化
      networkSim.goOffline();
      await testUtils.delay(100);
      networkSim.goOnline();
      await testUtils.delay(100);

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 2000 }
      );

      // 验证事件记录
      expect(events.some(e => e.event === 'offline')).toBe(true);
      expect(events.some(e => e.event === 'online')).toBe(true);
    });
  });

  // ============================================
  // 多重网络故障测试
  // ============================================

  describe('多重网络故障', () => {
    it('应该处理同时发生的多种网络问题', async () => {
      let callCount = 0;
      const complexFailureExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          callCount++;

          // 模拟各种网络问题
          if (callCount % 5 === 0) {
            throw new Error('Network timeout');
          }
          if (callCount % 7 === 0) {
            throw new Error('Connection reset');
          }
          if (callCount % 11 === 0) {
            throw new Error('DNS lookup failed');
          }

          // 随机延迟
          await testUtils.delay(Math.random() * 100);

          return {
            id: `order_${callCount}`,
            symbol, type, side, amount,
            price: price || 50000,
            status: 'filled',
          };
        },
      };

      env.components.exchanges.set('binance', complexFailureExchange);
      env.getExecutor().addExchange('binance', complexFailureExchange);
      env.getExecutor().config.dryRun = false;
      env.getExecutor().config.maxRetries = 5;

      const strategy = env.getStrategy();

      // 发送大量订单
      for (let i = 0; i < 10; i++) {
        strategy.generateSignal(i % 2 === 0 ? 'buy' : 'sell');
      }

      await testUtils.delay(3000);

      // 系统应该处理了所有请求（成功或失败）
      const stats = env.getExecutor().getStats();
      expect(stats.totalOrders).toBe(10);
      expect(stats.successfulOrders + stats.failedOrders).toBe(10);
    });
  });
});
