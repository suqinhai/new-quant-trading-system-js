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

// ============================================
// SmartOrderExecutor 测试
// ============================================

import SmartOrderExecutor, {
  SIDE,
  ORDER_TYPE,
  ORDER_STATUS,
  ERROR_TYPE,
  DEFAULT_CONFIG,
  AccountLockManager,
  RateLimitManager,
  NonceManager,
} from '../../src/executor/orderExecutor.js';

describe('SmartOrderExecutor Constants', () => {
  describe('SIDE', () => {
    it('应该包含买卖方向', () => {
      expect(SIDE.BUY).toBe('buy');
      expect(SIDE.SELL).toBe('sell');
    });
  });

  describe('ORDER_TYPE', () => {
    it('应该包含所有订单类型', () => {
      expect(ORDER_TYPE.MARKET).toBe('market');
      expect(ORDER_TYPE.LIMIT).toBe('limit');
      expect(ORDER_TYPE.POST_ONLY).toBe('post_only');
      expect(ORDER_TYPE.IOC).toBe('ioc');
      expect(ORDER_TYPE.FOK).toBe('fok');
    });
  });

  describe('ORDER_STATUS', () => {
    it('应该包含所有订单状态', () => {
      expect(ORDER_STATUS.PENDING).toBe('pending');
      expect(ORDER_STATUS.SUBMITTED).toBe('submitted');
      expect(ORDER_STATUS.PARTIAL).toBe('partial');
      expect(ORDER_STATUS.FILLED).toBe('filled');
      expect(ORDER_STATUS.CANCELED).toBe('canceled');
      expect(ORDER_STATUS.REJECTED).toBe('rejected');
      expect(ORDER_STATUS.EXPIRED).toBe('expired');
      expect(ORDER_STATUS.FAILED).toBe('failed');
    });
  });

  describe('ERROR_TYPE', () => {
    it('应该包含所有错误类型', () => {
      expect(ERROR_TYPE.RATE_LIMIT).toBe('rate_limit');
      expect(ERROR_TYPE.NONCE_CONFLICT).toBe('nonce');
      expect(ERROR_TYPE.INSUFFICIENT_BALANCE).toBe('balance');
      expect(ERROR_TYPE.INVALID_ORDER).toBe('invalid');
      expect(ERROR_TYPE.NETWORK).toBe('network');
      expect(ERROR_TYPE.EXCHANGE).toBe('exchange');
      expect(ERROR_TYPE.UNKNOWN).toBe('unknown');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('应该包含默认配置', () => {
      expect(DEFAULT_CONFIG.unfillTimeout).toBe(500);
      expect(DEFAULT_CONFIG.checkInterval).toBe(100);
      expect(DEFAULT_CONFIG.maxResubmitAttempts).toBe(5);
      expect(DEFAULT_CONFIG.priceSlippage).toBe(0.001);
      expect(DEFAULT_CONFIG.rateLimitInitialWait).toBe(1000);
      expect(DEFAULT_CONFIG.rateLimitMaxWait).toBe(30000);
      expect(DEFAULT_CONFIG.maxConcurrentPerAccount).toBe(5);
      expect(DEFAULT_CONFIG.maxConcurrentGlobal).toBe(20);
    });
  });
});

describe('AccountLockManager', () => {
  let lockManager;

  beforeEach(() => {
    lockManager = new AccountLockManager();
  });

  describe('构造函数', () => {
    it('应该初始化空锁映射', () => {
      expect(lockManager.locks.size).toBe(0);
    });

    it('应该创建全局队列', () => {
      expect(lockManager.globalQueue).toBeDefined();
    });
  });

  describe('getAccountQueue', () => {
    it('应该为新账户创建队列', () => {
      const queue = lockManager.getAccountQueue('account1');

      expect(queue).toBeDefined();
      expect(lockManager.locks.has('account1')).toBe(true);
    });

    it('应该返回已存在的队列', () => {
      const queue1 = lockManager.getAccountQueue('account1');
      const queue2 = lockManager.getAccountQueue('account1');

      expect(queue1).toBe(queue2);
    });

    it('应该为不同账户创建不同队列', () => {
      const queue1 = lockManager.getAccountQueue('account1');
      const queue2 = lockManager.getAccountQueue('account2');

      expect(queue1).not.toBe(queue2);
    });
  });

  describe('executeInQueue', () => {
    it('应该在队列中执行任务', async () => {
      const result = await lockManager.executeInQueue('account1', async () => {
        return 'result';
      });

      expect(result).toBe('result');
    });

    it('应该追踪活跃任务数', async () => {
      const promise = lockManager.executeInQueue('account1', async () => {
        const status = lockManager.getAccountStatus('account1');
        expect(status.activeCount).toBeGreaterThan(0);
        return 'done';
      });

      await promise;
    });
  });

  describe('getAccountStatus', () => {
    it('不存在的账户应该返回 exists: false', () => {
      const status = lockManager.getAccountStatus('nonexistent');

      expect(status.exists).toBe(false);
      expect(status.activeCount).toBe(0);
      expect(status.pendingCount).toBe(0);
    });

    it('存在的账户应该返回状态', () => {
      lockManager.getAccountQueue('account1');

      const status = lockManager.getAccountStatus('account1');

      expect(status.exists).toBe(true);
    });
  });

  describe('cleanupIdleAccounts', () => {
    it('应该清理空闲账户', () => {
      // 创建账户并设置过去的创建时间
      lockManager.getAccountQueue('account1');
      const lockInfo = lockManager.locks.get('account1');
      lockInfo.createdAt = Date.now() - 400000; // 超过5分钟

      lockManager.cleanupIdleAccounts(300000);

      expect(lockManager.locks.has('account1')).toBe(false);
    });

    it('不应该清理活跃账户', () => {
      lockManager.getAccountQueue('account1');

      lockManager.cleanupIdleAccounts(300000);

      expect(lockManager.locks.has('account1')).toBe(true);
    });
  });
});

describe('RateLimitManager', () => {
  let rateLimitManager;

  beforeEach(() => {
    rateLimitManager = new RateLimitManager({
      rateLimitInitialWait: 1000,
      rateLimitMaxWait: 30000,
      rateLimitBackoffMultiplier: 2,
    });
  });

  describe('构造函数', () => {
    it('应该保存配置', () => {
      expect(rateLimitManager.config.rateLimitInitialWait).toBe(1000);
    });

    it('应该初始化空状态映射', () => {
      expect(rateLimitManager.rateLimitStatus.size).toBe(0);
    });
  });

  describe('isRateLimited', () => {
    it('无状态时应该返回 false', () => {
      expect(rateLimitManager.isRateLimited('exchange1')).toBe(false);
    });

    it('等待时间已过应该返回 false', () => {
      rateLimitManager.rateLimitStatus.set('exchange1', {
        waitUntil: Date.now() - 1000,
        consecutiveErrors: 1,
      });

      expect(rateLimitManager.isRateLimited('exchange1')).toBe(false);
    });

    it('等待时间未过应该返回 true', () => {
      rateLimitManager.rateLimitStatus.set('exchange1', {
        waitUntil: Date.now() + 10000,
        consecutiveErrors: 1,
      });

      expect(rateLimitManager.isRateLimited('exchange1')).toBe(true);
    });
  });

  describe('getWaitTime', () => {
    it('无状态时应该返回 0', () => {
      expect(rateLimitManager.getWaitTime('exchange1')).toBe(0);
    });

    it('应该返回剩余等待时间', () => {
      rateLimitManager.rateLimitStatus.set('exchange1', {
        waitUntil: Date.now() + 5000,
      });

      const waitTime = rateLimitManager.getWaitTime('exchange1');
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(5000);
    });

    it('等待时间已过应该返回 0', () => {
      rateLimitManager.rateLimitStatus.set('exchange1', {
        waitUntil: Date.now() - 1000,
      });

      expect(rateLimitManager.getWaitTime('exchange1')).toBe(0);
    });
  });

  describe('recordRateLimitError', () => {
    it('应该创建新状态', () => {
      rateLimitManager.recordRateLimitError('exchange1', new Error('429'));

      expect(rateLimitManager.rateLimitStatus.has('exchange1')).toBe(true);
    });

    it('应该增加连续错误计数', () => {
      rateLimitManager.recordRateLimitError('exchange1', new Error('429'));
      rateLimitManager.recordRateLimitError('exchange1', new Error('429'));

      const status = rateLimitManager.rateLimitStatus.get('exchange1');
      expect(status.consecutiveErrors).toBe(2);
    });

    it('应该使用指数退避', () => {
      rateLimitManager.recordRateLimitError('exchange1', new Error('429'));
      const wait1 = rateLimitManager.getWaitTime('exchange1');

      rateLimitManager.recordRateLimitError('exchange1', new Error('429'));
      const wait2 = rateLimitManager.getWaitTime('exchange1');

      expect(wait2).toBeGreaterThan(wait1);
    });
  });

  describe('clearRateLimitStatus', () => {
    it('应该重置连续错误计数', () => {
      rateLimitManager.recordRateLimitError('exchange1', new Error('429'));
      rateLimitManager.recordRateLimitError('exchange1', new Error('429'));

      rateLimitManager.clearRateLimitStatus('exchange1');

      const status = rateLimitManager.rateLimitStatus.get('exchange1');
      expect(status.consecutiveErrors).toBe(0);
    });

    it('对不存在的交易所应该无操作', () => {
      rateLimitManager.clearRateLimitStatus('nonexistent');
      // 不应该抛错
    });
  });

  describe('waitForRateLimit', () => {
    it('无等待时间时应该立即返回', async () => {
      const start = Date.now();
      await rateLimitManager.waitForRateLimit('exchange1');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });
});

describe('NonceManager', () => {
  let nonceManager;

  beforeEach(() => {
    nonceManager = new NonceManager({
      timestampOffset: 0,
    });
  });

  describe('构造函数', () => {
    it('应该保存配置', () => {
      expect(nonceManager.config.timestampOffset).toBe(0);
    });

    it('应该初始化空状态映射', () => {
      expect(nonceManager.nonceStatus.size).toBe(0);
    });
  });

  describe('getNextNonce', () => {
    it('应该创建新状态', () => {
      nonceManager.getNextNonce('exchange1');

      expect(nonceManager.nonceStatus.has('exchange1')).toBe(true);
    });

    it('应该返回递增的 nonce', () => {
      const nonce1 = nonceManager.getNextNonce('exchange1');
      const nonce2 = nonceManager.getNextNonce('exchange1');

      expect(nonce2).toBeGreaterThan(nonce1);
    });

    it('应该基于时间戳', () => {
      const before = Date.now();
      const nonce = nonceManager.getNextNonce('exchange1');
      const after = Date.now();

      expect(nonce).toBeGreaterThanOrEqual(before);
      expect(nonce).toBeLessThanOrEqual(after + 1);
    });
  });

  describe('updateTimestampOffset', () => {
    it('应该更新时间戳偏移', () => {
      const serverTime = Date.now() + 1000;
      nonceManager.updateTimestampOffset('exchange1', serverTime);

      const status = nonceManager.nonceStatus.get('exchange1');
      expect(status.timestampOffset).toBeCloseTo(1000, -2);
    });

    it('应该创建新状态如果不存在', () => {
      nonceManager.updateTimestampOffset('exchange1', Date.now());

      expect(nonceManager.nonceStatus.has('exchange1')).toBe(true);
    });
  });

  describe('handleNonceConflict', () => {
    it('应该增加时间戳偏移', () => {
      nonceManager.getNextNonce('exchange1');
      const originalOffset = nonceManager.nonceStatus.get('exchange1').timestampOffset;

      nonceManager.handleNonceConflict('exchange1', new Error('nonce error'));

      const newOffset = nonceManager.nonceStatus.get('exchange1').timestampOffset;
      expect(newOffset).toBeGreaterThan(originalOffset);
    });

    it('应该从错误消息中提取服务器时间', () => {
      nonceManager.getNextNonce('exchange1');
      const error = new Error('timestamp: 1700000000000');

      nonceManager.handleNonceConflict('exchange1', error);

      const status = nonceManager.nonceStatus.get('exchange1');
      expect(status.timestampOffset).toBeDefined();
    });

    it('应该重置最后 nonce', () => {
      nonceManager.getNextNonce('exchange1');
      nonceManager.getNextNonce('exchange1');

      nonceManager.handleNonceConflict('exchange1', new Error('nonce'));

      const status = nonceManager.nonceStatus.get('exchange1');
      expect(status.lastNonce).toBe(0);
    });
  });

  describe('isNonceConflict', () => {
    it('应该检测 nonce 关键词', () => {
      expect(nonceManager.isNonceConflict(new Error('invalid nonce'))).toBe(true);
      expect(nonceManager.isNonceConflict(new Error('TIMESTAMP error'))).toBe(true);
      expect(nonceManager.isNonceConflict(new Error('recvwindow exceeded'))).toBe(true);
      expect(nonceManager.isNonceConflict(new Error('request timestamp'))).toBe(true);
      expect(nonceManager.isNonceConflict(new Error('Invalid Signature'))).toBe(true);
    });

    it('应该返回 false 对于非 nonce 错误', () => {
      expect(nonceManager.isNonceConflict(new Error('network error'))).toBe(false);
      expect(nonceManager.isNonceConflict(new Error('insufficient balance'))).toBe(false);
    });
  });
});

describe('SmartOrderExecutor', () => {
  let executor;
  let mockExchange;

  beforeEach(() => {
    executor = new SmartOrderExecutor({
      verbose: false,
      unfillTimeout: 100,
      checkInterval: 50,
      maxResubmitAttempts: 2,
    });

    mockExchange = {
      createOrder: vi.fn().mockResolvedValue({
        id: 'order-123',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: 0.1,
        price: 50000,
        filled: 0.1,
        remaining: 0,
        status: 'closed',
        average: 50000,
      }),
      cancelOrder: vi.fn().mockResolvedValue({ id: 'order-123', status: 'canceled' }),
      fetchOrder: vi.fn().mockResolvedValue({
        id: 'order-123',
        status: 'closed',
        filled: 0.1,
        amount: 0.1,
        average: 50000,
      }),
      fetchTicker: vi.fn().mockResolvedValue({
        symbol: 'BTC/USDT',
        bid: 49900,
        ask: 50100,
        last: 50000,
      }),
      fetchTime: vi.fn().mockResolvedValue(Date.now()),
    };
  });

  afterEach(() => {
    if (executor) {
      executor.stop();
      executor.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const e = new SmartOrderExecutor();

      expect(e.config.unfillTimeout).toBe(500);
      expect(e.config.checkInterval).toBe(100);
      expect(e.config.maxResubmitAttempts).toBe(5);
    });

    it('应该使用自定义配置', () => {
      expect(executor.config.unfillTimeout).toBe(100);
      expect(executor.config.maxResubmitAttempts).toBe(2);
    });

    it('应该初始化空交易所映射', () => {
      expect(executor.exchanges.size).toBe(0);
    });

    it('应该初始化管理器', () => {
      expect(executor.lockManager).toBeDefined();
      expect(executor.rateLimitManager).toBeDefined();
      expect(executor.nonceManager).toBeDefined();
    });

    it('应该初始化空活跃订单', () => {
      expect(executor.activeOrders.size).toBe(0);
    });

    it('应该初始化统计信息', () => {
      expect(executor.stats.totalOrders).toBe(0);
      expect(executor.stats.filledOrders).toBe(0);
      expect(executor.stats.canceledOrders).toBe(0);
      expect(executor.stats.failedOrders).toBe(0);
    });

    it('应该初始化为未运行状态', () => {
      expect(executor.running).toBe(false);
    });
  });

  describe('init', () => {
    it('应该接受 Map 类型的交易所', async () => {
      const exchanges = new Map();
      exchanges.set('binance', mockExchange);

      await executor.init(exchanges);

      expect(executor.exchanges.size).toBe(1);
      expect(executor.running).toBe(true);
    });

    it('应该接受对象类型的交易所', async () => {
      await executor.init({ binance: mockExchange });

      expect(executor.exchanges.size).toBe(1);
    });

    it('应该同步交易所时间', async () => {
      await executor.init({ binance: mockExchange });

      expect(mockExchange.fetchTime).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      await executor.init({ binance: mockExchange });
    });

    it('应该设置停止状态', () => {
      executor.stop();

      expect(executor.running).toBe(false);
    });

    it('应该清除所有订单监控', () => {
      // 添加一个订单监控
      executor.orderMonitors.set('order-1', setTimeout(() => {}, 10000));

      executor.stop();

      expect(executor.orderMonitors.size).toBe(0);
    });
  });

  describe('executeMarketOrder', () => {
    beforeEach(async () => {
      await executor.init({ binance: mockExchange });
    });

    it('应该执行市价单', async () => {
      const result = await executor.executeMarketOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(result.success).toBe(true);
      expect(result.orderInfo).toBeDefined();
    });

    it('应该更新统计信息', async () => {
      await executor.executeMarketOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(executor.stats.totalOrders).toBe(1);
      expect(executor.stats.filledOrders).toBe(1);
    });

    it('应该发射 orderFilled 事件', async () => {
      const listener = vi.fn();
      executor.on('orderFilled', listener);

      await executor.executeMarketOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(listener).toHaveBeenCalled();
    });

    it('交易所不存在时应该抛出错误', async () => {
      await expect(executor.executeMarketOrder({
        exchangeId: 'nonexistent',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      })).rejects.toThrow('Exchange not found');
    });

    it('应该处理 reduce-only 参数', async () => {
      await executor.executeMarketOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        reduceOnly: true,
      });

      expect(mockExchange.createOrder).toHaveBeenCalledWith(
        'BTC/USDT',
        'market',
        'sell',
        0.1,
        undefined,
        expect.objectContaining({ reduceOnly: true })
      );
    });
  });

  describe('cancelOrder', () => {
    beforeEach(async () => {
      await executor.init({ binance: mockExchange });
    });

    it('订单不存在时应该返回 false', async () => {
      const result = await executor.cancelOrder('nonexistent');

      expect(result).toBe(false);
    });

    it('应该发射 orderCanceled 事件', async () => {
      // 创建一个活跃订单
      executor.activeOrders.set('order-1', {
        clientOrderId: 'order-1',
        exchangeOrderId: 'exchange-order-1',
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        status: ORDER_STATUS.SUBMITTED,
      });

      const listener = vi.fn();
      executor.on('orderCanceled', listener);

      await executor.cancelOrder('order-1');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('cancelAllOrders', () => {
    beforeEach(async () => {
      await executor.init({ binance: mockExchange });

      // 添加一些活跃订单
      executor.activeOrders.set('order-1', {
        clientOrderId: 'order-1',
        exchangeOrderId: 'ex-1',
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        status: ORDER_STATUS.SUBMITTED,
      });
      executor.activeOrders.set('order-2', {
        clientOrderId: 'order-2',
        exchangeOrderId: 'ex-2',
        exchangeId: 'binance',
        symbol: 'ETH/USDT',
        status: ORDER_STATUS.SUBMITTED,
      });
    });

    it('应该取消所有订单', async () => {
      const count = await executor.cancelAllOrders();

      expect(count).toBe(2);
    });

    it('应该支持按交易所过滤', async () => {
      executor.activeOrders.set('order-3', {
        clientOrderId: 'order-3',
        exchangeOrderId: 'ex-3',
        exchangeId: 'okx',
        symbol: 'BTC/USDT',
        status: ORDER_STATUS.SUBMITTED,
      });

      const count = await executor.cancelAllOrders('binance');

      expect(count).toBe(2);
    });

    it('应该支持按交易对过滤', async () => {
      const count = await executor.cancelAllOrders(null, 'BTC/USDT');

      expect(count).toBe(1);
    });
  });

  describe('getOrderStatus', () => {
    it('订单存在时应该返回副本', () => {
      executor.activeOrders.set('order-1', {
        clientOrderId: 'order-1',
        symbol: 'BTC/USDT',
      });

      const status = executor.getOrderStatus('order-1');

      expect(status).toBeDefined();
      expect(status.clientOrderId).toBe('order-1');
    });

    it('订单不存在时应该返回 null', () => {
      expect(executor.getOrderStatus('nonexistent')).toBeNull();
    });
  });

  describe('getActiveOrders', () => {
    it('应该返回所有活跃订单', () => {
      executor.activeOrders.set('order-1', { clientOrderId: 'order-1' });
      executor.activeOrders.set('order-2', { clientOrderId: 'order-2' });

      const orders = executor.getActiveOrders();

      expect(orders.length).toBe(2);
    });

    it('应该返回副本', () => {
      executor.activeOrders.set('order-1', { clientOrderId: 'order-1' });

      const orders = executor.getActiveOrders();
      orders[0].clientOrderId = 'modified';

      expect(executor.activeOrders.get('order-1').clientOrderId).toBe('order-1');
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      executor.stats.totalOrders = 10;
      executor.stats.filledOrders = 8;

      const stats = executor.getStats();

      expect(stats.totalOrders).toBe(10);
      expect(stats.filledOrders).toBe(8);
      expect(stats.timestamp).toBeDefined();
    });

    it('应该包含活跃订单数', () => {
      executor.activeOrders.set('order-1', {});
      executor.activeOrders.set('order-2', {});

      const stats = executor.getStats();

      expect(stats.activeOrders).toBe(2);
    });
  });

  describe('getAccountStatus', () => {
    it('应该返回账户状态', () => {
      const status = executor.getAccountStatus('account1');

      expect(status).toBeDefined();
    });
  });

  describe('_analyzeError', () => {
    it('应该识别限频错误', () => {
      expect(executor._analyzeError({ status: 429 })).toBe(ERROR_TYPE.RATE_LIMIT);
      expect(executor._analyzeError({ message: 'rate limit exceeded' })).toBe(ERROR_TYPE.RATE_LIMIT);
      expect(executor._analyzeError({ message: 'too many requests' })).toBe(ERROR_TYPE.RATE_LIMIT);
    });

    it('应该识别余额不足错误', () => {
      expect(executor._analyzeError({ message: 'insufficient balance' })).toBe(ERROR_TYPE.INSUFFICIENT_BALANCE);
      expect(executor._analyzeError({ message: 'not enough margin' })).toBe(ERROR_TYPE.INSUFFICIENT_BALANCE);
    });

    it('应该识别无效订单错误', () => {
      expect(executor._analyzeError({ message: 'invalid order' })).toBe(ERROR_TYPE.INVALID_ORDER);
      expect(executor._analyzeError({ message: 'order rejected' })).toBe(ERROR_TYPE.INVALID_ORDER);
      expect(executor._analyzeError({ message: 'post only mode' })).toBe(ERROR_TYPE.INVALID_ORDER);
    });

    it('应该识别网络错误', () => {
      expect(executor._analyzeError({ message: 'network error' })).toBe(ERROR_TYPE.NETWORK);
      expect(executor._analyzeError({ message: 'connection timeout' })).toBe(ERROR_TYPE.NETWORK);
    });

    it('应该识别交易所错误', () => {
      expect(executor._analyzeError({ message: 'exchange error' })).toBe(ERROR_TYPE.EXCHANGE);
      expect(executor._analyzeError({ message: 'server unavailable' })).toBe(ERROR_TYPE.EXCHANGE);
    });

    it('应该返回未知错误', () => {
      expect(executor._analyzeError({ message: 'random error' })).toBe(ERROR_TYPE.UNKNOWN);
    });
  });

  describe('_buildOrderParams', () => {
    it('应该构建基本参数', () => {
      const params = executor._buildOrderParams({
        clientOrderId: 'client-1',
        postOnly: false,
        reduceOnly: false,
      });

      expect(params.type).toBe('limit');
      expect(params.params.clientOrderId).toBe('client-1');
    });

    it('应该添加 post-only 参数', () => {
      const params = executor._buildOrderParams({
        clientOrderId: 'client-1',
        postOnly: true,
        reduceOnly: false,
      });

      expect(params.params.postOnly).toBe(true);
      expect(params.params.timeInForce).toBe('PO');
    });

    it('应该添加 reduce-only 参数', () => {
      const params = executor._buildOrderParams({
        clientOrderId: 'client-1',
        postOnly: false,
        reduceOnly: true,
      });

      expect(params.params.reduceOnly).toBe(true);
    });

    it('应该合并用户选项', () => {
      const params = executor._buildOrderParams({
        clientOrderId: 'client-1',
        postOnly: false,
        reduceOnly: false,
        options: { customParam: 'value' },
      });

      expect(params.params.customParam).toBe('value');
    });
  });

  describe('log', () => {
    it('应该在 verbose 模式下输出日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      executor.config.verbose = true;
      executor.log('test message');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该始终输出错误', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      executor.config.verbose = false;
      executor.log('error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该始终输出警告', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      executor.config.verbose = false;
      executor.log('warn message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// NetworkPartitionHandler 测试
// ============================================

import { NetworkPartitionHandler } from '../../src/executor/NetworkPartitionHandler.js';

describe('NetworkPartitionHandler', () => {
  let handler;
  let mockExchangeClient;

  beforeEach(() => {
    handler = new NetworkPartitionHandler({
      syncCheckInterval: 1000,
      heartbeatInterval: 500,
      verbose: false,
    });

    mockExchangeClient = {
      fetchOpenOrders: vi.fn().mockResolvedValue([
        { id: 'order-1', symbol: 'BTC/USDT', side: 'buy', status: 'open' },
      ]),
      fetchPositions: vi.fn().mockResolvedValue([
        { symbol: 'BTC/USDT', side: 'long', size: 0.1 },
      ]),
      fetchBalance: vi.fn().mockResolvedValue({
        total: { USDT: 10000 },
        free: { USDT: 5000 },
      }),
      fetchTime: vi.fn().mockResolvedValue(Date.now()),
    };
  });

  afterEach(() => {
    if (handler) {
      handler.stop();
      handler.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const h = new NetworkPartitionHandler();

      expect(h.config.syncCheckInterval).toBe(30000);
      expect(h.config.heartbeatInterval).toBe(5000);
      expect(h.config.positionSizeTolerance).toBe(0.001);
    });

    it('应该使用自定义配置', () => {
      expect(handler.config.syncCheckInterval).toBe(1000);
      expect(handler.config.heartbeatInterval).toBe(500);
    });

    it('应该初始化本地状态', () => {
      expect(handler.localState.orders.size).toBe(0);
      expect(handler.localState.positions.size).toBe(0);
      expect(handler.localState.balances.size).toBe(0);
      expect(handler.localState.fills.size).toBe(0);
    });

    it('应该初始化远程状态', () => {
      expect(handler.remoteState.orders.size).toBe(0);
      expect(handler.remoteState.positions.size).toBe(0);
      expect(handler.remoteState.balances.size).toBe(0);
    });

    it('应该初始化为未运行状态', () => {
      expect(handler.running).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('应该启动处理器', () => {
      const listener = vi.fn();
      handler.on('started', listener);

      handler.start();

      expect(handler.running).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('应该设置定时器', () => {
      handler.start();

      expect(handler.syncCheckTimer).not.toBeNull();
      expect(handler.heartbeatTimer).not.toBeNull();
      expect(handler.fullSyncTimer).not.toBeNull();
    });

    it('应该停止处理器', () => {
      const listener = vi.fn();
      handler.on('stopped', listener);

      handler.start();
      handler.stop();

      expect(handler.running).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('应该清除定时器', () => {
      handler.start();
      handler.stop();

      expect(handler.syncCheckTimer).toBeNull();
      expect(handler.heartbeatTimer).toBeNull();
      expect(handler.fullSyncTimer).toBeNull();
    });

    it('重复启动应该无操作', () => {
      handler.start();
      handler.start();

      expect(handler.running).toBe(true);
    });

    it('未启动时停止应该无操作', () => {
      handler.stop();

      expect(handler.running).toBe(false);
    });
  });

  describe('本地状态管理', () => {
    describe('updateLocalOrder', () => {
      it('应该更新本地订单', () => {
        handler.updateLocalOrder('order-1', {
          symbol: 'BTC/USDT',
          side: 'buy',
        });

        expect(handler.localState.orders.has('order-1')).toBe(true);
        expect(handler.localState.orders.get('order-1').symbol).toBe('BTC/USDT');
      });

      it('应该添加更新时间戳', () => {
        handler.updateLocalOrder('order-1', { symbol: 'BTC/USDT' });

        const order = handler.localState.orders.get('order-1');
        expect(order.updatedAt).toBeDefined();
      });
    });

    describe('removeLocalOrder', () => {
      it('应该移除本地订单', () => {
        handler.updateLocalOrder('order-1', { symbol: 'BTC/USDT' });
        handler.removeLocalOrder('order-1');

        expect(handler.localState.orders.has('order-1')).toBe(false);
      });
    });

    describe('updateLocalPosition', () => {
      it('应该更新本地仓位', () => {
        handler.updateLocalPosition('BTC/USDT', {
          side: 'long',
          size: 0.1,
        });

        expect(handler.localState.positions.has('BTC/USDT')).toBe(true);
        expect(handler.localState.positions.get('BTC/USDT').size).toBe(0.1);
      });

      it('应该添加更新时间戳', () => {
        handler.updateLocalPosition('BTC/USDT', { size: 0.1 });

        const position = handler.localState.positions.get('BTC/USDT');
        expect(position.updatedAt).toBeDefined();
      });
    });

    describe('removeLocalPosition', () => {
      it('应该移除本地仓位', () => {
        handler.updateLocalPosition('BTC/USDT', { size: 0.1 });
        handler.removeLocalPosition('BTC/USDT');

        expect(handler.localState.positions.has('BTC/USDT')).toBe(false);
      });
    });

    describe('updateLocalBalance', () => {
      it('应该更新本地余额', () => {
        handler.updateLocalBalance('USDT', {
          total: 10000,
          free: 5000,
        });

        expect(handler.localState.balances.has('USDT')).toBe(true);
        expect(handler.localState.balances.get('USDT').total).toBe(10000);
      });
    });

    describe('recordLocalFill', () => {
      it('应该记录本地成交', () => {
        handler.recordLocalFill('fill-1', {
          orderId: 'order-1',
          price: 50000,
          amount: 0.1,
        });

        expect(handler.localState.fills.has('fill-1')).toBe(true);
        expect(handler.localState.fills.get('fill-1').price).toBe(50000);
      });

      it('应该添加记录时间戳', () => {
        handler.recordLocalFill('fill-1', { price: 50000 });

        const fill = handler.localState.fills.get('fill-1');
        expect(fill.recordedAt).toBeDefined();
      });
    });
  });

  describe('init', () => {
    it('应该保存交易所客户端', async () => {
      await handler.init({ exchangeClient: mockExchangeClient });

      expect(handler.exchangeClient).toBe(mockExchangeClient);
    });

    it('应该使用默认账户ID', async () => {
      await handler.init({ exchangeClient: mockExchangeClient });

      expect(handler.accountId).toBe('default');
    });

    it('应该使用自定义账户ID', async () => {
      await handler.init({
        exchangeClient: mockExchangeClient,
        accountId: 'account-1',
      });

      expect(handler.accountId).toBe('account-1');
    });
  });

  describe('syncStatus', () => {
    it('初始状态应该是 unknown', () => {
      expect(handler.syncStatus).toBe('unknown');
    });
  });

  describe('partitionStatus', () => {
    it('初始状态应该是 connected', () => {
      expect(handler.partitionStatus).toBe('connected');
    });
  });

  describe('heartbeatStats', () => {
    it('应该初始化心跳统计', () => {
      expect(handler.heartbeatStats.consecutiveFailures).toBe(0);
      expect(handler.heartbeatStats.lastSuccessTime).toBeNull();
      expect(handler.heartbeatStats.lastFailureTime).toBeNull();
    });
  });

  describe('inconsistencies', () => {
    it('应该初始化为空数组', () => {
      expect(handler.inconsistencies).toEqual([]);
    });
  });

  describe('repairHistory', () => {
    it('应该初始化为空数组', () => {
      expect(handler.repairHistory).toEqual([]);
    });
  });
});
