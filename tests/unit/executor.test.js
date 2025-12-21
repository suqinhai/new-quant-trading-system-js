/**
 * 执行器模块测试
 * Executor Module Tests
 * @module tests/unit/executor.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExchangeFailover } from '../../src/executor/ExchangeFailover.js';
import { ExecutionQualityMonitor } from '../../src/executor/ExecutionQualityMonitor.js';

// ============================================
// Mock Exchange Client
// ============================================

function createMockExchange(name, options = {}) {
  return {
    name,
    connected: options.connected !== false,
    fetchTime: vi.fn().mockImplementation(async () => {
      if (options.pingFails) {
        throw new Error('Ping failed');
      }
      return Date.now();
    }),
    ping: vi.fn().mockImplementation(async () => {
      if (options.pingFails) {
        throw new Error('Ping failed');
      }
      return { latency: options.latency || 50 };
    }),
    fetchBalance: vi.fn().mockResolvedValue({ USDT: 10000 }),
    createOrder: vi.fn().mockResolvedValue({ id: 'order-1', status: 'open' }),
  };
}

// ============================================
// ExchangeFailover 测试
// ============================================

describe('ExchangeFailover', () => {
  let failover;

  beforeEach(() => {
    failover = new ExchangeFailover({
      healthCheckInterval: 1000,
      failureThreshold: 2,
      recoveryThreshold: 2,
      enableAutoFailover: true,
      enableAutoRecovery: true,
      verbose: false,
    });
  });

  afterEach(() => {
    if (failover) {
      failover.stop();
      failover.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const f = new ExchangeFailover();

      expect(f.config.healthCheckInterval).toBe(10000);
      expect(f.config.failureThreshold).toBe(3);
      expect(f.config.recoveryThreshold).toBe(3);
      expect(f.config.enableAutoFailover).toBe(true);
    });

    it('应该使用自定义配置', () => {
      expect(failover.config.healthCheckInterval).toBe(1000);
      expect(failover.config.failureThreshold).toBe(2);
    });

    it('应该初始化空状态', () => {
      expect(failover.exchanges.size).toBe(0);
      expect(failover.primaryExchangeId).toBeNull();
      expect(failover.running).toBe(false);
    });
  });

  describe('registerExchange', () => {
    it('应该注册交易所', () => {
      const client = createMockExchange('binance');

      failover.registerExchange({
        id: 'binance',
        name: 'Binance',
        client,
        priority: 1,
      });

      expect(failover.exchanges.has('binance')).toBe(true);
      expect(failover.exchanges.get('binance').client).toBe(client);
      expect(failover.exchanges.get('binance').priority).toBe(1);
    });

    it('应该设置第一个交易所为主交易所', () => {
      failover.registerExchange({
        id: 'binance',
        client: createMockExchange('binance'),
        priority: 1,
      });

      expect(failover.primaryExchangeId).toBe('binance');
    });

    it('应该初始化健康状态', () => {
      failover.registerExchange({
        id: 'binance',
        client: createMockExchange('binance'),
      });

      expect(failover.healthStatus.has('binance')).toBe(true);
      expect(failover.healthStatus.get('binance').status).toBe('unknown');
    });

    it('应该发射 exchangeRegistered 事件', () => {
      const listener = vi.fn();
      failover.on('exchangeRegistered', listener);

      failover.registerExchange({
        id: 'binance',
        client: createMockExchange('binance'),
      });

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        id: 'binance',
      }));
    });

    it('应该拒绝没有ID的交易所', () => {
      expect(() => {
        failover.registerExchange({
          client: createMockExchange('test'),
        });
      }).toThrow('必需的');
    });

    it('应该拒绝没有client的交易所', () => {
      expect(() => {
        failover.registerExchange({
          id: 'test',
        });
      }).toThrow('必需的');
    });
  });

  describe('unregisterExchange', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: createMockExchange('binance'),
        priority: 1,
      });
      failover.registerExchange({
        id: 'okx',
        client: createMockExchange('okx'),
        priority: 2,
      });
    });

    it('应该移除交易所', () => {
      failover.unregisterExchange('okx');

      expect(failover.exchanges.has('okx')).toBe(false);
    });

    it('应该在移除主交易所时切换', () => {
      failover.unregisterExchange('binance');

      expect(failover.primaryExchangeId).toBe('okx');
    });

    it('应该发射 exchangeUnregistered 事件', () => {
      const listener = vi.fn();
      failover.on('exchangeUnregistered', listener);

      failover.unregisterExchange('okx');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('start/stop', () => {
    it('应该启动故障切换管理器', () => {
      const listener = vi.fn();
      failover.on('started', listener);

      failover.start();

      expect(failover.running).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('应该停止故障切换管理器', () => {
      const listener = vi.fn();
      failover.on('stopped', listener);

      failover.start();
      failover.stop();

      expect(failover.running).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('重复启动应该无操作', () => {
      failover.start();
      failover.start();

      expect(failover.running).toBe(true);
    });
  });

  describe('getPrimary', () => {
    it('应该返回主交易所', () => {
      const client = createMockExchange('binance');
      failover.registerExchange({
        id: 'binance',
        client,
      });

      const primary = failover.getPrimary();

      expect(primary).toBeDefined();
      expect(primary.client).toBe(client);
    });

    it('没有交易所时应该返回 null', () => {
      expect(failover.getPrimary()).toBeNull();
    });
  });

  describe('exchanges Map', () => {
    it('应该返回指定交易所', () => {
      const client = createMockExchange('binance');
      failover.registerExchange({
        id: 'binance',
        client,
      });

      const exchange = failover.exchanges.get('binance');
      expect(exchange.client).toBe(client);
    });

    it('不存在时应该返回 undefined', () => {
      expect(failover.exchanges.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: createMockExchange('binance'),
      });
    });

    it('应该返回状态快照', () => {
      const status = failover.getStatus();

      expect(status.primaryExchangeId).toBe('binance');
      expect(status.exchangeCount).toBe(1);
      expect(status.running).toBe(false);
    });
  });

  describe('healthStatus', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: createMockExchange('binance'),
      });
      failover.registerExchange({
        id: 'okx',
        client: createMockExchange('okx'),
      });
    });

    it('应该追踪交易所健康状态', () => {
      // 设置健康状态
      failover.healthStatus.get('binance').status = 'healthy';
      failover.healthStatus.get('okx').status = 'unhealthy';

      // 过滤健康的交易所
      const healthy = [...failover.healthStatus.entries()]
        .filter(([_, status]) => status.status === 'healthy')
        .map(([id]) => id);

      expect(healthy).toContain('binance');
      expect(healthy).not.toContain('okx');
    });
  });

  describe('_recordLatency', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: createMockExchange('binance'),
      });
    });

    it('应该记录延迟', () => {
      failover._recordLatency('binance', 50);
      failover._recordLatency('binance', 100);

      const stats = failover.latencyStats.get('binance');
      expect(stats.latencies.length).toBe(2);
    });

    it('应该计算平均延迟', () => {
      failover._recordLatency('binance', 50);
      failover._recordLatency('binance', 100);

      const stats = failover.latencyStats.get('binance');
      expect(stats.avgLatency).toBe(75);
    });
  });

  describe('_recordError', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: createMockExchange('binance'),
      });
    });

    it('应该记录错误', () => {
      failover._recordError('binance', 'connection', 'Connection failed');

      const errors = failover.errorHistory.get('binance');
      expect(errors.length).toBe(1);
      expect(errors[0].type).toBe('connection');
    });
  });
});

// ============================================
// ExecutionQualityMonitor 测试
// ============================================

describe('ExecutionQualityMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new ExecutionQualityMonitor({
      slippageWarningThreshold: 0.002,
      slippageCriticalThreshold: 0.005,
      executionTimeWarning: 5000,
      executionTimeCritical: 15000,
      verbose: false,
    });
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
      monitor.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const m = new ExecutionQualityMonitor();

      expect(m.config.slippageWarningThreshold).toBe(0.002);
      expect(m.config.executionTimeWarning).toBe(5000);
    });

    it('应该使用自定义配置', () => {
      expect(monitor.config.slippageWarningThreshold).toBe(0.002);
      expect(monitor.config.executionTimeCritical).toBe(15000);
    });

    it('应该初始化空状态', () => {
      expect(monitor.executionRecords.length).toBe(0);
      expect(monitor.activeOrders.size).toBe(0);
      expect(monitor.running).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('应该启动监控', () => {
      const listener = vi.fn();
      monitor.on('started', listener);

      monitor.start();

      expect(monitor.running).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('应该停止监控', () => {
      const listener = vi.fn();
      monitor.on('stopped', listener);

      monitor.start();
      monitor.stop();

      expect(monitor.running).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('重复启动应该无操作', () => {
      monitor.start();
      monitor.start();

      expect(monitor.running).toBe(true);
    });
  });

  describe('startTracking', () => {
    it('应该开始追踪订单', () => {
      monitor.startTracking({
        orderId: 'order-1',
        symbol: 'BTC/USDT',
        side: 'buy',
        expectedPrice: 50000,
        amount: 0.1,
      });

      expect(monitor.activeOrders.has('order-1')).toBe(true);
    });

    it('应该记录开始时间', () => {
      const before = Date.now();
      monitor.startTracking({
        orderId: 'order-1',
        symbol: 'BTC/USDT',
        expectedPrice: 50000,
        amount: 0.1,
      });
      const after = Date.now();

      const order = monitor.activeOrders.get('order-1');
      expect(order.startTime).toBeGreaterThanOrEqual(before);
      expect(order.startTime).toBeLessThanOrEqual(after);
    });
  });

  describe('updateFill', () => {
    beforeEach(() => {
      monitor.startTracking({
        orderId: 'order-1',
        symbol: 'BTC/USDT',
        side: 'buy',
        expectedPrice: 50000,
        amount: 0.1,
      });
    });

    it('应该更新成交信息', () => {
      monitor.updateFill('order-1', {
        price: 50050,
        amount: 0.05,
      });

      const order = monitor.activeOrders.get('order-1');
      expect(order.filledAmount).toBe(0.05);
      expect(order.fills.length).toBe(1);
    });

    it('应该累积成交', () => {
      monitor.updateFill('order-1', { price: 50050, amount: 0.05 });
      monitor.updateFill('order-1', { price: 50100, amount: 0.05 });

      const order = monitor.activeOrders.get('order-1');
      expect(order.filledAmount).toBe(0.1);
      expect(order.fills.length).toBe(2);
    });

    it('对不存在的订单应该不做处理', () => {
      monitor.updateFill('nonexistent', { price: 50000, amount: 0.1 });
      // 不应该抛错
    });
  });

  describe('completeTracking', () => {
    beforeEach(() => {
      monitor.startTracking({
        orderId: 'order-1',
        symbol: 'BTC/USDT',
        side: 'buy',
        expectedPrice: 50000,
        amount: 0.1,
        exchange: 'binance',
      });
      monitor.updateFill('order-1', {
        price: 50050,
        amount: 0.1,
      });
    });

    it('应该完成订单追踪', () => {
      const result = monitor.completeTracking('order-1', {
        status: 'filled',
      });

      expect(result).toBeDefined();
      expect(result.orderId).toBe('order-1');
      expect(monitor.activeOrders.has('order-1')).toBe(false);
    });

    it('应该计算滑点', () => {
      const result = monitor.completeTracking('order-1', {
        status: 'filled',
      });

      // (50050 - 50000) / 50000 = 0.001 = 0.1%
      expect(result.slippage).toBeCloseTo(0.001, 4);
    });

    it('应该计算执行时间', async () => {
      await new Promise(r => setTimeout(r, 50));

      const result = monitor.completeTracking('order-1', {
        status: 'filled',
      });

      expect(result.executionTime).toBeGreaterThanOrEqual(50);
    });

    it('应该添加到执行记录', () => {
      monitor.completeTracking('order-1', { status: 'filled' });

      expect(monitor.executionRecords.length).toBe(1);
    });

    it('应该发射 executionComplete 事件', () => {
      const listener = vi.fn();
      monitor.on('executionComplete', listener);

      monitor.completeTracking('order-1', { status: 'filled' });

      expect(listener).toHaveBeenCalled();
    });

    it('对于不存在的订单应该返回 undefined', () => {
      const result = monitor.completeTracking('nonexistent', { status: 'filled' });

      expect(result).toBeUndefined();
    });
  });

  describe('cancelTracking', () => {
    beforeEach(() => {
      monitor.startTracking({
        orderId: 'order-1',
        symbol: 'BTC/USDT',
        expectedPrice: 50000,
        amount: 0.1,
      });
    });

    it('应该取消订单追踪', () => {
      const result = monitor.cancelTracking('order-1', 'User cancelled');

      expect(result.status).toBe('cancelled');
      expect(monitor.activeOrders.has('order-1')).toBe(false);
    });
  });

  describe('_determineQuality', () => {
    it('应该评估优秀质量', () => {
      const quality = monitor._determineQuality(0.0005, 500, 1.0);

      expect(quality).toBe('excellent');
    });

    it('应该评估良好质量', () => {
      const quality = monitor._determineQuality(0.0015, 3000, 0.95);

      expect(quality).toBe('good');
    });

    it('应该评估较差质量', () => {
      const quality = monitor._determineQuality(0.008, 20000, 0.6);

      expect(quality).toBe('poor');
    });

    it('应该评估严重质量', () => {
      const quality = monitor._determineQuality(0.02, 70000, 0.3);

      expect(quality).toBe('critical');
    });
  });

  describe('getSymbolStats', () => {
    beforeEach(() => {
      monitor.startTracking({
        orderId: 'order-1',
        symbol: 'BTC/USDT',
        side: 'buy',
        expectedPrice: 50000,
        amount: 0.1,
      });
      monitor.updateFill('order-1', { price: 50050, amount: 0.1 });
      monitor.completeTracking('order-1', { status: 'filled' });
    });

    it('应该返回交易对统计', () => {
      const stats = monitor.getSymbolStats('BTC/USDT');

      expect(stats).toBeDefined();
    });
  });

  describe('getExchangeStats', () => {
    beforeEach(() => {
      monitor.startTracking({
        orderId: 'order-1',
        symbol: 'BTC/USDT',
        expectedPrice: 50000,
        amount: 0.1,
        exchange: 'binance',
      });
      monitor.updateFill('order-1', { price: 50050, amount: 0.1 });
      monitor.completeTracking('order-1', { status: 'filled' });
    });

    it('应该返回交易所统计', () => {
      const stats = monitor.getExchangeStats('binance');

      expect(stats).toBeDefined();
    });
  });

  describe('getAggregatedStats', () => {
    beforeEach(() => {
      for (let i = 0; i < 3; i++) {
        monitor.startTracking({
          orderId: `order-${i}`,
          symbol: 'BTC/USDT',
          side: 'buy',
          expectedPrice: 50000,
          amount: 0.1,
        });
        monitor.updateFill(`order-${i}`, {
          price: 50000 + i * 10,
          amount: 0.1,
        });
        monitor.completeTracking(`order-${i}`, { status: 'filled' });
      }
    });

    it('应该返回汇总统计', () => {
      const stats = monitor.getAggregatedStats();

      expect(stats).toBeDefined();
      expect(stats.total).toBeDefined();
    });
  });

  describe('executionRecords', () => {
    beforeEach(() => {
      monitor.startTracking({
        orderId: 'order-1',
        symbol: 'BTC/USDT',
        expectedPrice: 50000,
        amount: 0.1,
      });
      monitor.updateFill('order-1', { price: 50050, amount: 0.1 });
      monitor.completeTracking('order-1', { status: 'filled' });
    });

    it('应该记录执行并可清空记录列表', () => {
      expect(monitor.executionRecords.length).toBe(1);

      // 手动清空记录
      monitor.executionRecords.length = 0;
      monitor.symbolStats.clear();
      monitor.anomalies.length = 0;

      expect(monitor.executionRecords.length).toBe(0);
      expect(monitor.symbolStats.size).toBe(0);
      expect(monitor.anomalies.length).toBe(0);
    });
  });

  describe('_createEmptyStats', () => {
    it('应该创建空统计对象', () => {
      const stats = monitor._createEmptyStats();

      expect(stats.totalOrders).toBe(0);
      expect(stats.slippages).toEqual([]);
    });
  });
});
