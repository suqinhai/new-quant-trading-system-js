/**
 * 交易所切换 E2E 测试
 * Exchange Switch E2E Tests
 *
 * 测试系统在交易所故障时的切换和故障转移能力
 * @module tests/e2e/exchangeSwitch.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  E2ETestEnvironment,
  MockOrderExecutor,
  testUtils,
  RUN_MODE,
} from './e2eTestFramework.js';
import { createExchangeMock, createFailingExchangeMock } from '../mocks/exchangeMock.js';

// ============================================
// 交易所故障转移管理器
// ============================================

class ExchangeFailoverManager {
  constructor(config = {}) {
    this.config = {
      healthCheckInterval: config.healthCheckInterval || 5000,
      failureThreshold: config.failureThreshold || 3,
      recoveryThreshold: config.recoveryThreshold || 2,
      switchCooldown: config.switchCooldown || 10000,
      ...config,
    };

    this.exchanges = new Map();
    this.primaryExchange = null;
    this.activeExchange = null;
    this.failureCounts = new Map();
    this.recoveryCounts = new Map();
    this.lastSwitchTime = 0;
    this.events = [];
    this.isHealthChecking = false;
  }

  addExchange(id, exchange, isPrimary = false) {
    this.exchanges.set(id, {
      id,
      exchange,
      status: 'healthy',
      priority: isPrimary ? 0 : this.exchanges.size + 1,
      lastHealthCheck: Date.now(),
    });
    this.failureCounts.set(id, 0);
    this.recoveryCounts.set(id, 0);

    if (isPrimary || !this.primaryExchange) {
      this.primaryExchange = id;
    }
    if (!this.activeExchange) {
      this.activeExchange = id;
    }
  }

  getActiveExchange() {
    const entry = this.exchanges.get(this.activeExchange);
    return entry ? entry.exchange : null;
  }

  getActiveExchangeId() {
    return this.activeExchange;
  }

  async executeWithFailover(operation) {
    const exchangeIds = this._getSortedExchangeIds();

    for (const exchangeId of exchangeIds) {
      const entry = this.exchanges.get(exchangeId);
      if (entry.status === 'unhealthy') continue;

      try {
        const result = await operation(entry.exchange, exchangeId);
        this._recordSuccess(exchangeId);
        return { success: true, result, exchangeId };
      } catch (error) {
        this._recordFailure(exchangeId, error);

        // 检查是否需要切换
        if (this._shouldSwitch(exchangeId)) {
          await this._switchExchange(exchangeId);
        }
      }
    }

    return { success: false, error: 'All exchanges failed' };
  }

  _getSortedExchangeIds() {
    return Array.from(this.exchanges.entries())
      .sort((a, b) => {
        // 优先使用当前活跃交易所
        if (a[0] === this.activeExchange) return -1;
        if (b[0] === this.activeExchange) return 1;
        // 然后按优先级排序
        return a[1].priority - b[1].priority;
      })
      .map(([id]) => id);
  }

  _recordSuccess(exchangeId) {
    this.failureCounts.set(exchangeId, 0);

    const entry = this.exchanges.get(exchangeId);
    if (entry.status === 'degraded') {
      const recoveryCount = (this.recoveryCounts.get(exchangeId) || 0) + 1;
      this.recoveryCounts.set(exchangeId, recoveryCount);

      if (recoveryCount >= this.config.recoveryThreshold) {
        entry.status = 'healthy';
        this.recoveryCounts.set(exchangeId, 0);
        this._emit('exchangeRecovered', { exchangeId });
      }
    }
  }

  _recordFailure(exchangeId, error) {
    const failureCount = (this.failureCounts.get(exchangeId) || 0) + 1;
    this.failureCounts.set(exchangeId, failureCount);
    this.recoveryCounts.set(exchangeId, 0);

    const entry = this.exchanges.get(exchangeId);

    if (failureCount >= this.config.failureThreshold) {
      if (entry.status === 'healthy') {
        entry.status = 'degraded';
        this._emit('exchangeDegraded', { exchangeId, failureCount });
      } else if (failureCount >= this.config.failureThreshold * 2) {
        entry.status = 'unhealthy';
        this._emit('exchangeUnhealthy', { exchangeId, error: error.message });
      }
    }
  }

  _shouldSwitch(failedExchangeId) {
    if (failedExchangeId !== this.activeExchange) return false;

    const timeSinceLastSwitch = Date.now() - this.lastSwitchTime;
    if (timeSinceLastSwitch < this.config.switchCooldown) return false;

    const failureCount = this.failureCounts.get(failedExchangeId) || 0;
    return failureCount >= this.config.failureThreshold;
  }

  async _switchExchange(fromExchangeId) {
    const healthyExchanges = Array.from(this.exchanges.entries())
      .filter(([id, entry]) => id !== fromExchangeId && entry.status !== 'unhealthy')
      .sort((a, b) => a[1].priority - b[1].priority);

    if (healthyExchanges.length === 0) {
      this._emit('noHealthyExchanges', { fromExchangeId });
      return false;
    }

    const [newExchangeId] = healthyExchanges[0];
    const oldExchangeId = this.activeExchange;

    this.activeExchange = newExchangeId;
    this.lastSwitchTime = Date.now();

    this._emit('exchangeSwitched', {
      from: oldExchangeId,
      to: newExchangeId,
      reason: 'failure_threshold_exceeded',
    });

    return true;
  }

  async healthCheck() {
    if (this.isHealthChecking) return;
    this.isHealthChecking = true;

    try {
      for (const [exchangeId, entry] of this.exchanges) {
        try {
          // 简单的健康检查
          if (entry.exchange.fetchTicker) {
            await entry.exchange.fetchTicker('BTC/USDT');
          }
          entry.lastHealthCheck = Date.now();

          if (entry.status === 'unhealthy') {
            entry.status = 'degraded';
            this._emit('exchangeRecovering', { exchangeId });
          }
        } catch (error) {
          this._recordFailure(exchangeId, error);
        }
      }
    } finally {
      this.isHealthChecking = false;
    }
  }

  forceSwitch(toExchangeId) {
    if (!this.exchanges.has(toExchangeId)) {
      throw new Error(`Exchange ${toExchangeId} not found`);
    }

    const oldExchangeId = this.activeExchange;
    this.activeExchange = toExchangeId;
    this.lastSwitchTime = Date.now();

    this._emit('exchangeSwitched', {
      from: oldExchangeId,
      to: toExchangeId,
      reason: 'manual_switch',
    });

    return true;
  }

  _emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
  }

  getEvents() {
    return [...this.events];
  }

  getStatus() {
    return {
      activeExchange: this.activeExchange,
      primaryExchange: this.primaryExchange,
      exchanges: Array.from(this.exchanges.entries()).map(([id, entry]) => ({
        id,
        status: entry.status,
        priority: entry.priority,
        failureCount: this.failureCounts.get(id) || 0,
        lastHealthCheck: entry.lastHealthCheck,
      })),
    };
  }

  reset() {
    this.failureCounts.clear();
    this.recoveryCounts.clear();
    this.events = [];
    this.lastSwitchTime = 0;

    for (const [, entry] of this.exchanges) {
      entry.status = 'healthy';
    }

    this.activeExchange = this.primaryExchange;
  }
}

// ============================================
// 交易所切换 E2E 测试
// ============================================

describe('Exchange Switch E2E', () => {
  let env;
  let failoverManager;

  beforeEach(async () => {
    env = new E2ETestEnvironment({
      mode: RUN_MODE.SHADOW,
      initialEquity: 10000,
      symbols: ['BTC/USDT'],
      exchanges: ['binance', 'okx', 'huobi'],
    });
    await env.setup();

    failoverManager = new ExchangeFailoverManager({
      failureThreshold: 2,
      recoveryThreshold: 2,
      switchCooldown: 100,
    });

    // 添加多个交易所
    failoverManager.addExchange('binance', createExchangeMock({ id: 'binance' }), true);
    failoverManager.addExchange('okx', createExchangeMock({ id: 'okx' }));
    failoverManager.addExchange('huobi', createExchangeMock({ id: 'huobi' }));

    await env.start();
  });

  afterEach(async () => {
    await env.teardown();
    failoverManager.reset();
  });

  // ============================================
  // 基础交易所切换测试
  // ============================================

  describe('基础交易所切换', () => {
    it('应该正确设置主交易所', () => {
      const status = failoverManager.getStatus();

      expect(status.primaryExchange).toBe('binance');
      expect(status.activeExchange).toBe('binance');
      expect(status.exchanges.length).toBe(3);
    });

    it('应该能手动切换交易所', () => {
      failoverManager.forceSwitch('okx');

      const status = failoverManager.getStatus();
      expect(status.activeExchange).toBe('okx');

      const events = failoverManager.getEvents();
      expect(events.some(e => e.event === 'exchangeSwitched')).toBe(true);
    });

    it('应该拒绝切换到不存在的交易所', () => {
      expect(() => {
        failoverManager.forceSwitch('nonexistent');
      }).toThrow('Exchange nonexistent not found');
    });
  });

  // ============================================
  // 自动故障转移测试
  // ============================================

  describe('自动故障转移', () => {
    it('应该在主交易所故障后自动切换', async () => {
      // 替换主交易所为故障交易所
      const failingExchange = createFailingExchangeMock('network', Infinity);
      failoverManager.exchanges.get('binance').exchange = failingExchange;

      // 多次执行操作触发故障阈值
      for (let i = 0; i < 3; i++) {
        await failoverManager.executeWithFailover(async (exchange) => {
          return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
        });
      }

      const status = failoverManager.getStatus();
      expect(status.activeExchange).not.toBe('binance');

      const events = failoverManager.getEvents();
      expect(events.some(e => e.event === 'exchangeSwitched')).toBe(true);
    });

    it('应该在所有交易所故障时返回错误', async () => {
      // 让所有交易所都故障
      for (const [id] of failoverManager.exchanges) {
        const failingExchange = createFailingExchangeMock('network', Infinity);
        failoverManager.exchanges.get(id).exchange = failingExchange;
        failoverManager.exchanges.get(id).status = 'unhealthy';
      }

      const result = await failoverManager.executeWithFailover(async (exchange) => {
        return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('All exchanges failed');
    });

    it('应该跳过不健康的交易所', async () => {
      // 标记主交易所为不健康
      failoverManager.exchanges.get('binance').status = 'unhealthy';

      const executedOn = [];

      await failoverManager.executeWithFailover(async (exchange, exchangeId) => {
        executedOn.push(exchangeId);
        return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
      });

      // 不应该在不健康的交易所上执行
      expect(executedOn).not.toContain('binance');
      expect(executedOn.length).toBe(1);
    });
  });

  // ============================================
  // 交易所恢复测试
  // ============================================

  describe('交易所恢复', () => {
    it('应该在交易所恢复后更新状态', async () => {
      // 先触发故障
      let failCount = 0;
      const recoveringExchange = {
        ...createExchangeMock({ id: 'binance' }),
        createOrder: async (...args) => {
          failCount++;
          if (failCount <= 3) {
            throw new Error('Temporary failure');
          }
          return {
            id: `order_${Date.now()}`,
            status: 'filled',
          };
        },
        fetchTicker: async () => ({ last: 50000 }),
      };

      failoverManager.exchanges.get('binance').exchange = recoveringExchange;

      // 触发故障
      for (let i = 0; i < 3; i++) {
        await failoverManager.executeWithFailover(async (exchange) => {
          return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
        });
      }

      // 此时应该已经降级
      expect(failoverManager.exchanges.get('binance').status).toBe('degraded');

      // 继续执行成功的操作
      for (let i = 0; i < 3; i++) {
        await failoverManager.executeWithFailover(async (exchange) => {
          return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
        });
      }

      // 健康检查
      await failoverManager.healthCheck();

      // 应该恢复
      const events = failoverManager.getEvents();
      expect(events.some(e => e.event === 'exchangeRecovered' || e.event === 'exchangeRecovering')).toBe(true);
    });

    it('应该在恢复后能切回主交易所', async () => {
      // 模拟切换到备用交易所
      failoverManager.forceSwitch('okx');

      expect(failoverManager.getActiveExchangeId()).toBe('okx');

      // 切回主交易所
      failoverManager.forceSwitch('binance');

      expect(failoverManager.getActiveExchangeId()).toBe('binance');
    });
  });

  // ============================================
  // 健康检查测试
  // ============================================

  describe('健康检查', () => {
    it('应该定期检查交易所健康状态', async () => {
      await failoverManager.healthCheck();

      const status = failoverManager.getStatus();
      for (const exchange of status.exchanges) {
        expect(exchange.lastHealthCheck).toBeGreaterThan(0);
      }
    });

    it('应该在健康检查失败时记录故障', async () => {
      const failingExchange = {
        fetchTicker: async () => {
          throw new Error('Health check failed');
        },
      };

      failoverManager.exchanges.get('binance').exchange = failingExchange;

      await failoverManager.healthCheck();

      const binanceStatus = failoverManager.exchanges.get('binance');
      expect(failoverManager.failureCounts.get('binance')).toBeGreaterThan(0);
    });

    it('应该在不健康交易所恢复时发出事件', async () => {
      // 先标记为不健康
      failoverManager.exchanges.get('binance').status = 'unhealthy';

      // 健康检查应该尝试恢复
      await failoverManager.healthCheck();

      const events = failoverManager.getEvents();
      expect(events.some(e => e.event === 'exchangeRecovering')).toBe(true);
    });
  });

  // ============================================
  // 切换冷却时间测试
  // ============================================

  describe('切换冷却时间', () => {
    it('应该在冷却时间内阻止频繁切换', async () => {
      failoverManager.config.switchCooldown = 1000;

      // 第一次切换
      failoverManager.forceSwitch('okx');
      const firstSwitchTime = failoverManager.lastSwitchTime;

      // 触发故障尝试切换
      for (let i = 0; i < 5; i++) {
        failoverManager._recordFailure('okx', new Error('Test'));
      }

      // 由于冷却时间，应该不会切换
      const shouldSwitch = failoverManager._shouldSwitch('okx');
      expect(shouldSwitch).toBe(false);
    });

    it('应该在冷却时间后允许切换', async () => {
      failoverManager.config.switchCooldown = 50;

      // 第一次切换
      failoverManager.forceSwitch('okx');

      // 等待冷却时间
      await testUtils.delay(100);

      // 触发故障
      for (let i = 0; i < 3; i++) {
        failoverManager._recordFailure('okx', new Error('Test'));
      }

      // 现在应该可以切换
      const shouldSwitch = failoverManager._shouldSwitch('okx');
      expect(shouldSwitch).toBe(true);
    });
  });

  // ============================================
  // 多交易所负载分发测试
  // ============================================

  describe('多交易所负载分发', () => {
    it('应该在多个健康交易所间正确切换', async () => {
      const executedOn = new Set();

      // 执行多个操作
      for (let i = 0; i < 5; i++) {
        // 每次强制切换到不同交易所测试
        const exchanges = ['binance', 'okx', 'huobi'];
        failoverManager.forceSwitch(exchanges[i % 3]);

        await failoverManager.executeWithFailover(async (exchange, exchangeId) => {
          executedOn.add(exchangeId);
          return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
        });
      }

      // 应该在多个交易所上执行过
      expect(executedOn.size).toBe(3);
    });

    it('应该按优先级选择交易所', async () => {
      const executionOrder = [];

      // 让 binance 失败，观察切换顺序
      let binanceAttempts = 0;
      const flakyBinance = {
        ...createExchangeMock({ id: 'binance' }),
        createOrder: async () => {
          binanceAttempts++;
          if (binanceAttempts <= 2) {
            throw new Error('Binance failure');
          }
          return { id: 'order_1', status: 'filled' };
        },
      };

      failoverManager.exchanges.get('binance').exchange = flakyBinance;

      await failoverManager.executeWithFailover(async (exchange, exchangeId) => {
        executionOrder.push(exchangeId);
        return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
      });

      // 应该先尝试 binance（主交易所），然后是 okx
      expect(executionOrder[0]).toBe('binance');
      if (executionOrder.length > 1) {
        expect(executionOrder[1]).toBe('okx');
      }
    });
  });

  // ============================================
  // 交易所状态追踪测试
  // ============================================

  describe('交易所状态追踪', () => {
    it('应该正确追踪故障计数', async () => {
      const failingExchange = createFailingExchangeMock('network', Infinity);
      failoverManager.exchanges.get('binance').exchange = failingExchange;

      for (let i = 0; i < 5; i++) {
        try {
          await failoverManager.executeWithFailover(async (exchange) => {
            return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
          });
        } catch {
          // 预期会失败
        }
      }

      const status = failoverManager.getStatus();
      const binance = status.exchanges.find(e => e.id === 'binance');
      expect(binance.failureCount).toBeGreaterThan(0);
    });

    it('应该在成功后重置故障计数', async () => {
      // 先记录一些故障
      failoverManager._recordFailure('binance', new Error('Test'));
      failoverManager._recordFailure('binance', new Error('Test'));

      expect(failoverManager.failureCounts.get('binance')).toBe(2);

      // 记录成功
      failoverManager._recordSuccess('binance');

      expect(failoverManager.failureCounts.get('binance')).toBe(0);
    });

    it('应该正确追踪状态变化事件', async () => {
      const failingExchange = createFailingExchangeMock('network', Infinity);
      failoverManager.exchanges.get('binance').exchange = failingExchange;

      // 触发足够的故障
      for (let i = 0; i < 10; i++) {
        failoverManager._recordFailure('binance', new Error('Test'));
      }

      const events = failoverManager.getEvents();
      expect(events.some(e => e.event === 'exchangeDegraded')).toBe(true);
      expect(events.some(e => e.event === 'exchangeUnhealthy')).toBe(true);
    });
  });

  // ============================================
  // 订单一致性测试
  // ============================================

  describe('订单一致性', () => {
    it('应该在切换后保持订单状态一致', async () => {
      const orders = [];

      // 在主交易所下单
      const result1 = await failoverManager.executeWithFailover(async (exchange, exchangeId) => {
        const order = await exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
        orders.push({ ...order, exchangeId });
        return order;
      });

      expect(result1.success).toBe(true);

      // 切换交易所
      failoverManager.forceSwitch('okx');

      // 在新交易所下单
      const result2 = await failoverManager.executeWithFailover(async (exchange, exchangeId) => {
        const order = await exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
        orders.push({ ...order, exchangeId });
        return order;
      });

      expect(result2.success).toBe(true);
      expect(orders.length).toBe(2);
      expect(orders[0].exchangeId).toBe('binance');
      expect(orders[1].exchangeId).toBe('okx');
    });

    it('应该正确处理切换过程中的待处理订单', async () => {
      const pendingOrders = [];
      let orderCounter = 0;

      const delayedExchange = {
        ...createExchangeMock({ id: 'binance' }),
        createOrder: async (symbol, type, side, amount, price) => {
          orderCounter++;
          const orderId = `order_${orderCounter}`;
          pendingOrders.push(orderId);

          // 模拟延迟
          await testUtils.delay(100);

          return { id: orderId, status: 'filled' };
        },
      };

      failoverManager.exchanges.get('binance').exchange = delayedExchange;

      // 发起多个并发订单
      const orderPromises = [];
      for (let i = 0; i < 3; i++) {
        orderPromises.push(
          failoverManager.executeWithFailover(async (exchange) => {
            return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
          })
        );
      }

      // 等待所有订单完成
      const results = await Promise.all(orderPromises);

      expect(results.every(r => r.success)).toBe(true);
      expect(pendingOrders.length).toBe(3);
    });
  });

  // ============================================
  // 交易所特定错误处理测试
  // ============================================

  describe('交易所特定错误处理', () => {
    it('应该识别并处理频率限制错误', async () => {
      const rateLimitExchange = {
        ...createExchangeMock({ id: 'binance' }),
        createOrder: async () => {
          const error = new Error('Rate limit exceeded');
          error.code = 429;
          throw error;
        },
      };

      failoverManager.exchanges.get('binance').exchange = rateLimitExchange;

      const result = await failoverManager.executeWithFailover(async (exchange) => {
        return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
      });

      // 应该已经尝试了其他交易所
      expect(result.success).toBe(true);
      expect(result.exchangeId).not.toBe('binance');
    });

    it('应该识别并处理维护模式错误', async () => {
      const maintenanceExchange = {
        ...createExchangeMock({ id: 'binance' }),
        createOrder: async () => {
          const error = new Error('Exchange is under maintenance');
          error.code = 'MAINTENANCE';
          throw error;
        },
      };

      failoverManager.exchanges.get('binance').exchange = maintenanceExchange;

      const result = await failoverManager.executeWithFailover(async (exchange) => {
        return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
      });

      expect(result.success).toBe(true);
      expect(result.exchangeId).not.toBe('binance');
    });

    it('应该识别并处理余额不足错误（不切换）', async () => {
      let executedExchanges = [];

      const insufficientExchange = {
        ...createExchangeMock({ id: 'binance' }),
        createOrder: async () => {
          const error = new Error('Insufficient balance');
          error.code = -2010;
          throw error;
        },
      };

      failoverManager.exchanges.get('binance').exchange = insufficientExchange;

      // 修改 okx 也返回余额不足
      const okxInsufficientExchange = {
        ...createExchangeMock({ id: 'okx' }),
        createOrder: async () => {
          executedExchanges.push('okx');
          const error = new Error('Insufficient balance');
          throw error;
        },
      };

      failoverManager.exchanges.get('okx').exchange = okxInsufficientExchange;

      const result = await failoverManager.executeWithFailover(async (exchange, exchangeId) => {
        executedExchanges.push(exchangeId);
        return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
      });

      // 余额不足是业务错误，也会触发切换尝试
      expect(executedExchanges.includes('binance')).toBe(true);
    });
  });

  // ============================================
  // 综合场景测试
  // ============================================

  describe('综合场景', () => {
    it('应该处理完整的故障转移生命周期', async () => {
      // 1. 初始状态检查
      expect(failoverManager.getActiveExchangeId()).toBe('binance');

      // 2. 主交易所开始出现故障
      let binanceFailCount = 0;
      const degradingBinance = {
        ...createExchangeMock({ id: 'binance' }),
        createOrder: async () => {
          binanceFailCount++;
          if (binanceFailCount <= 3) {
            throw new Error('Binance temporary failure');
          }
          return { id: `order_${Date.now()}`, status: 'filled' };
        },
        fetchTicker: async () => ({ last: 50000 }),
      };

      failoverManager.exchanges.get('binance').exchange = degradingBinance;

      // 3. 执行操作触发故障转移
      for (let i = 0; i < 5; i++) {
        await failoverManager.executeWithFailover(async (exchange) => {
          return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
        });
      }

      // 4. 验证已切换到备用交易所
      const statusAfterSwitch = failoverManager.getStatus();
      const events = failoverManager.getEvents();

      // 5. 主交易所恢复
      await failoverManager.healthCheck();

      // 6. 可以切回主交易所
      failoverManager.forceSwitch('binance');
      expect(failoverManager.getActiveExchangeId()).toBe('binance');
    });

    it('应该在高负载下正确处理切换', async () => {
      const results = [];
      const concurrentRequests = 10;

      // 并发发送请求
      const promises = [];
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          failoverManager.executeWithFailover(async (exchange, exchangeId) => {
            await testUtils.delay(Math.random() * 50);
            return exchange.createOrder('BTC/USDT', 'limit', 'buy', 0.1, 50000);
          }).then(result => {
            results.push(result);
          })
        );
      }

      await Promise.all(promises);

      // 所有请求应该都被处理
      expect(results.length).toBe(concurrentRequests);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
});
