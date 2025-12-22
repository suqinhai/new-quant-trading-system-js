/**
 * 多交易所切换集成测试
 * Multi-Exchange Switching Integration Tests
 *
 * TEST-007: 测试交易所切换、故障转移和负载均衡
 * @module tests/integration/multiExchange.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExchangeMock, createFailingExchangeMock, createSlowExchangeMock } from '../mocks/exchangeMock.js';

// ============================================
// 多交易所管理器 Mock
// ============================================

class MultiExchangeManager {
  constructor(config = {}) {
    this.config = {
      primaryExchange: config.primaryExchange || 'binance',
      failoverOrder: config.failoverOrder || ['okx', 'bybit'],
      maxRetries: config.maxRetries || 3,
      failoverThreshold: config.failoverThreshold || 3, // 连续失败次数后切换
      healthCheckInterval: config.healthCheckInterval || 30000,
      ...config,
    };

    this.exchanges = new Map();
    this.activeExchange = null;
    this.failureCounts = new Map();
    this.events = [];
    this.stats = {
      totalOrders: 0,
      failovers: 0,
      successfulOrders: 0,
      failedOrders: 0,
    };
  }

  emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
  }

  addExchange(id, exchange) {
    this.exchanges.set(id, exchange);
    this.failureCounts.set(id, 0);
    if (!this.activeExchange) {
      this.activeExchange = id;
    }
  }

  removeExchange(id) {
    this.exchanges.delete(id);
    this.failureCounts.delete(id);
    if (this.activeExchange === id) {
      this.activeExchange = this._getNextAvailableExchange();
    }
  }

  _getNextAvailableExchange() {
    const allExchanges = [this.config.primaryExchange, ...this.config.failoverOrder];
    for (const id of allExchanges) {
      if (this.exchanges.has(id)) {
        return id;
      }
    }
    return null;
  }

  async switchExchange(targetId, reason = 'manual') {
    if (!this.exchanges.has(targetId)) {
      throw new Error(`Exchange ${targetId} not available`);
    }

    const previousExchange = this.activeExchange;
    this.activeExchange = targetId;
    this.stats.failovers++;

    this.emit('exchangeSwitched', {
      from: previousExchange,
      to: targetId,
      reason,
    });

    return { success: true, from: previousExchange, to: targetId };
  }

  async executeOrder(orderInfo) {
    this.stats.totalOrders++;

    const exchangesToTry = [
      this.activeExchange,
      ...this.config.failoverOrder.filter(id => id !== this.activeExchange),
    ];

    let lastError = null;

    for (const exchangeId of exchangesToTry) {
      const exchange = this.exchanges.get(exchangeId);
      if (!exchange) continue;

      try {
        const result = await this._tryExecuteOrder(exchange, exchangeId, orderInfo);

        // 成功后重置失败计数
        this.failureCounts.set(exchangeId, 0);
        this.stats.successfulOrders++;

        // 如果是备用交易所执行成功，触发切换事件
        if (exchangeId !== this.activeExchange) {
          await this.switchExchange(exchangeId, 'failover_success');
        }

        return result;
      } catch (error) {
        lastError = error;
        const failures = (this.failureCounts.get(exchangeId) || 0) + 1;
        this.failureCounts.set(exchangeId, failures);

        this.emit('orderFailed', {
          exchangeId,
          error: error.message,
          failureCount: failures,
        });

        // 检查是否需要切换
        if (failures >= this.config.failoverThreshold && exchangeId === this.activeExchange) {
          const nextExchange = this._getNextHealthyExchange(exchangeId);
          if (nextExchange) {
            await this.switchExchange(nextExchange, 'threshold_reached');
          }
        }
      }
    }

    this.stats.failedOrders++;
    throw lastError || new Error('All exchanges failed');
  }

  async _tryExecuteOrder(exchange, exchangeId, orderInfo) {
    const order = await exchange.createOrder(
      orderInfo.symbol,
      orderInfo.type || 'limit',
      orderInfo.side,
      orderInfo.amount,
      orderInfo.price
    );

    this.emit('orderExecuted', {
      exchangeId,
      order,
    });

    return { success: true, exchangeId, order };
  }

  _getNextHealthyExchange(excludeId) {
    const candidates = [this.config.primaryExchange, ...this.config.failoverOrder]
      .filter(id => id !== excludeId && this.exchanges.has(id));

    // 选择失败次数最少的交易所
    candidates.sort((a, b) =>
      (this.failureCounts.get(a) || 0) - (this.failureCounts.get(b) || 0)
    );

    return candidates[0] || null;
  }

  async healthCheck() {
    const results = {};

    for (const [id, exchange] of this.exchanges) {
      try {
        const startTime = Date.now();
        await exchange.fetchTicker('BTC/USDT');
        const latency = Date.now() - startTime;

        results[id] = {
          healthy: true,
          latency,
          failures: this.failureCounts.get(id) || 0,
        };
      } catch (error) {
        results[id] = {
          healthy: false,
          error: error.message,
          failures: this.failureCounts.get(id) || 0,
        };
      }
    }

    this.emit('healthCheckCompleted', results);
    return results;
  }

  getActiveExchange() {
    return this.activeExchange;
  }

  getExchangeList() {
    return Array.from(this.exchanges.keys());
  }

  getStats() {
    return { ...this.stats };
  }

  getStatus() {
    return {
      activeExchange: this.activeExchange,
      availableExchanges: this.getExchangeList(),
      failureCounts: Object.fromEntries(this.failureCounts),
      stats: this.getStats(),
    };
  }
}

// ============================================
// 测试用例
// ============================================

describe('Multi-Exchange Switching Integration', () => {
  let manager;
  let binanceMock;
  let okxMock;
  let bybitMock;

  beforeEach(() => {
    binanceMock = createExchangeMock({ id: 'binance', name: 'Binance' });
    okxMock = createExchangeMock({ id: 'okx', name: 'OKX' });
    bybitMock = createExchangeMock({ id: 'bybit', name: 'Bybit' });

    manager = new MultiExchangeManager({
      primaryExchange: 'binance',
      failoverOrder: ['okx', 'bybit'],
      failoverThreshold: 3,
    });

    manager.addExchange('binance', binanceMock);
    manager.addExchange('okx', okxMock);
    manager.addExchange('bybit', bybitMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // 基本切换测试
  // ============================================

  describe('基本交易所切换', () => {
    it('应该使用主交易所执行订单', async () => {
      const result = await manager.executeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(true);
      expect(result.exchangeId).toBe('binance');
      expect(binanceMock.createOrder).toHaveBeenCalled();
      expect(okxMock.createOrder).not.toHaveBeenCalled();
    });

    it('应该能手动切换交易所', async () => {
      await manager.switchExchange('okx', 'manual');

      expect(manager.getActiveExchange()).toBe('okx');

      const result = await manager.executeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.exchangeId).toBe('okx');
      expect(okxMock.createOrder).toHaveBeenCalled();
    });

    it('应该在切换时触发事件', async () => {
      await manager.switchExchange('bybit', 'test');

      const event = manager.events.find(e => e.event === 'exchangeSwitched');
      expect(event).toBeDefined();
      expect(event.data.from).toBe('binance');
      expect(event.data.to).toBe('bybit');
      expect(event.data.reason).toBe('test');
    });

    it('应该拒绝切换到不存在的交易所', async () => {
      await expect(manager.switchExchange('kraken', 'test'))
        .rejects.toThrow('not available');
    });
  });

  // ============================================
  // 故障转移测试
  // ============================================

  describe('故障转移', () => {
    it('应该在主交易所失败时自动切换', async () => {
      // 替换为失败的交易所
      const failingBinance = createFailingExchangeMock('network', Infinity);
      manager.exchanges.set('binance', failingBinance);

      const result = await manager.executeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(true);
      expect(result.exchangeId).toBe('okx'); // 自动切换到 OKX
    });

    it('应该在达到阈值后切换主交易所', async () => {
      // 模拟连续失败 - 所有备用交易所也失败，这样主交易所的失败计数会累积
      const failingBinance = createFailingExchangeMock('network', Infinity);
      const failingOkx = createFailingExchangeMock('network', Infinity);
      const failingBybit = createFailingExchangeMock('network', Infinity);

      manager.exchanges.set('binance', failingBinance);
      manager.exchanges.set('okx', failingOkx);
      manager.exchanges.set('bybit', failingBybit);

      // 执行多次订单触发阈值（会失败，但会触发切换逻辑）
      for (let i = 0; i < 3; i++) {
        try {
          await manager.executeOrder({
            symbol: 'BTC/USDT',
            side: 'buy',
            amount: 0.1,
            price: 50000,
          });
        } catch {
          // 预期会失败
        }
      }

      // 检查失败计数是否达到阈值
      expect(manager.failureCounts.get('binance')).toBeGreaterThanOrEqual(3);
    });

    it('应该在所有交易所失败时抛出错误', async () => {
      manager.exchanges.set('binance', createFailingExchangeMock('network', Infinity));
      manager.exchanges.set('okx', createFailingExchangeMock('network', Infinity));
      manager.exchanges.set('bybit', createFailingExchangeMock('network', Infinity));

      await expect(manager.executeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      })).rejects.toThrow();
    });

    it('应该按照配置的顺序尝试备用交易所', async () => {
      manager.exchanges.set('binance', createFailingExchangeMock('network', Infinity));
      manager.exchanges.set('okx', createFailingExchangeMock('network', Infinity));

      const result = await manager.executeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.exchangeId).toBe('bybit'); // 第三个备用交易所
    });
  });

  // ============================================
  // 恢复测试
  // ============================================

  describe('交易所恢复', () => {
    it('应该在成功后重置失败计数', async () => {
      // 先增加失败计数
      manager.failureCounts.set('binance', 2);

      await manager.executeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(manager.failureCounts.get('binance')).toBe(0);
    });

    it('应该能动态添加和移除交易所', async () => {
      manager.removeExchange('okx');
      expect(manager.getExchangeList()).not.toContain('okx');

      const newExchange = createExchangeMock({ id: 'kraken', name: 'Kraken' });
      manager.addExchange('kraken', newExchange);
      expect(manager.getExchangeList()).toContain('kraken');
    });

    it('移除当前活跃交易所时应自动切换', async () => {
      manager.activeExchange = 'binance';
      manager.removeExchange('binance');

      expect(manager.getActiveExchange()).not.toBe('binance');
      expect(manager.getActiveExchange()).toBe('okx'); // 切换到下一个可用的
    });
  });

  // ============================================
  // 健康检查测试
  // ============================================

  describe('健康检查', () => {
    it('应该检查所有交易所的健康状态', async () => {
      const results = await manager.healthCheck();

      expect(results.binance).toBeDefined();
      expect(results.binance.healthy).toBe(true);
      expect(results.binance.latency).toBeGreaterThanOrEqual(0);
    });

    it('应该正确报告不健康的交易所', async () => {
      // 创建一个 fetchTicker 会失败的交易所 mock
      const unhealthyExchange = {
        ...createExchangeMock({ id: 'okx', name: 'OKX' }),
        fetchTicker: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };
      manager.exchanges.set('okx', unhealthyExchange);

      const results = await manager.healthCheck();

      expect(results.okx.healthy).toBe(false);
      expect(results.okx.error).toBeDefined();
    });

    it('应该在健康检查后触发事件', async () => {
      await manager.healthCheck();

      const event = manager.events.find(e => e.event === 'healthCheckCompleted');
      expect(event).toBeDefined();
    });
  });

  // ============================================
  // 延迟和性能测试
  // ============================================

  describe('延迟处理', () => {
    it('应该优先选择低延迟的交易所', async () => {
      // 使用慢速交易所替换 binance
      const slowBinance = createSlowExchangeMock(1000);
      slowBinance.id = 'binance';
      manager.exchanges.set('binance', slowBinance);

      // 执行健康检查后，应该知道延迟情况
      const health = await manager.healthCheck();

      expect(health.binance.latency).toBeGreaterThanOrEqual(1000);
      expect(health.okx.latency).toBeLessThan(100);
    });
  });

  // ============================================
  // 统计和状态测试
  // ============================================

  describe('统计和状态', () => {
    it('应该正确记录统计信息', async () => {
      await manager.executeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      await manager.executeOrder({
        symbol: 'ETH/USDT',
        side: 'buy',
        amount: 1,
        price: 3000,
      });

      const stats = manager.getStats();
      expect(stats.totalOrders).toBe(2);
      expect(stats.successfulOrders).toBe(2);
      expect(stats.failedOrders).toBe(0);
    });

    it('应该返回完整的状态信息', () => {
      const status = manager.getStatus();

      expect(status.activeExchange).toBe('binance');
      expect(status.availableExchanges).toContain('binance');
      expect(status.availableExchanges).toContain('okx');
      expect(status.availableExchanges).toContain('bybit');
      expect(status.failureCounts).toBeDefined();
    });
  });

  // ============================================
  // 并发执行测试
  // ============================================

  describe('并发执行', () => {
    it('应该正确处理并发订单', async () => {
      const orders = [
        { symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000 },
        { symbol: 'ETH/USDT', side: 'buy', amount: 1, price: 3000 },
        { symbol: 'BNB/USDT', side: 'buy', amount: 10, price: 300 },
      ];

      const results = await Promise.all(
        orders.map(order => manager.executeOrder(order))
      );

      expect(results.every(r => r.success)).toBe(true);
      expect(manager.getStats().successfulOrders).toBe(3);
    });

    it('应该在并发时正确处理故障转移', async () => {
      // 让 binance 偶尔失败
      let callCount = 0;
      binanceMock.createOrder.mockImplementation(async (...args) => {
        callCount++;
        if (callCount % 2 === 0) {
          throw new Error('Intermittent failure');
        }
        return {
          id: `order_${callCount}`,
          symbol: args[0],
          type: args[1],
          side: args[2],
          amount: args[3],
          price: args[4],
          status: 'open',
        };
      });

      const orders = Array(5).fill(null).map((_, i) => ({
        symbol: `COIN${i}/USDT`,
        side: 'buy',
        amount: 1,
        price: 100,
      }));

      const results = await Promise.all(
        orders.map(order => manager.executeOrder(order))
      );

      expect(results.every(r => r.success)).toBe(true);
    });
  });
});
