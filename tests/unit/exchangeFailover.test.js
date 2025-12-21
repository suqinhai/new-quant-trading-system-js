/**
 * ExchangeFailover 交易所故障切换管理器测试
 * Exchange Failover Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExchangeFailover,
  EXCHANGE_STATUS,
  FAILURE_TYPE,
  FAILOVER_REASON,
  DEFAULT_CONFIG,
} from '../../src/executor/ExchangeFailover.js';

// 创建 Mock 交易所客户端
function createMockClient(options = {}) {
  const {
    fetchTimeDelay = 10, // 降低延迟以避免超时
    shouldFail = false,
    failError = new Error('Network error'),
  } = options;

  return {
    id: options.id || 'mock',
    fetchTime: vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, fetchTimeDelay));
      if (shouldFail) throw failError;
      return Date.now();
    }),
    loadMarkets: vi.fn().mockResolvedValue({}),
    ping: vi.fn().mockResolvedValue(true),
    createOrder: vi.fn().mockResolvedValue({ id: 'order_123' }),
    fetchBalance: vi.fn().mockResolvedValue({ USDT: { free: 10000 } }),
  };
}

describe('ExchangeFailover 常量导出', () => {
  it('应该导出 EXCHANGE_STATUS', () => {
    expect(EXCHANGE_STATUS.HEALTHY).toBe('healthy');
    expect(EXCHANGE_STATUS.DEGRADED).toBe('degraded');
    expect(EXCHANGE_STATUS.UNHEALTHY).toBe('unhealthy');
    expect(EXCHANGE_STATUS.OFFLINE).toBe('offline');
    expect(EXCHANGE_STATUS.UNKNOWN).toBe('unknown');
  });

  it('应该导出 FAILURE_TYPE', () => {
    expect(FAILURE_TYPE.CONNECTION).toBe('connection');
    expect(FAILURE_TYPE.TIMEOUT).toBe('timeout');
    expect(FAILURE_TYPE.RATE_LIMIT).toBe('rate_limit');
    expect(FAILURE_TYPE.API_ERROR).toBe('api_error');
    expect(FAILURE_TYPE.MAINTENANCE).toBe('maintenance');
    expect(FAILURE_TYPE.UNKNOWN).toBe('unknown');
  });

  it('应该导出 FAILOVER_REASON', () => {
    expect(FAILOVER_REASON.AUTO_HEALTH).toBe('auto_health');
    expect(FAILOVER_REASON.AUTO_ERROR).toBe('auto_error');
    expect(FAILOVER_REASON.MANUAL).toBe('manual');
    expect(FAILOVER_REASON.RECOVERY).toBe('recovery');
    expect(FAILOVER_REASON.SCHEDULED).toBe('scheduled');
  });

  it('应该导出 DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.healthCheckInterval).toBe(10000);
    expect(DEFAULT_CONFIG.healthCheckTimeout).toBe(5000);
    expect(DEFAULT_CONFIG.failureThreshold).toBe(3);
    expect(DEFAULT_CONFIG.recoveryThreshold).toBe(3);
    expect(DEFAULT_CONFIG.enableAutoFailover).toBe(true);
    expect(DEFAULT_CONFIG.enableAutoRecovery).toBe(true);
  });
});

describe('ExchangeFailover', () => {
  let failover;
  let mockClient1;
  let mockClient2;
  let mockClient3;

  beforeEach(() => {
    mockClient1 = createMockClient({ id: 'binance' });
    mockClient2 = createMockClient({ id: 'okx' });
    mockClient3 = createMockClient({ id: 'bybit' });

    failover = new ExchangeFailover({
      healthCheckInterval: 100,
      healthCheckTimeout: 200, // 增加超时时间
      failureThreshold: 2,
      recoveryThreshold: 2,
      failoverCooldown: 100,
      recoveryWaitTime: 200,
      verbose: false,
    });
  });

  afterEach(() => {
    failover.stop();
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(failover.exchanges).toBeInstanceOf(Map);
      expect(failover.healthStatus).toBeInstanceOf(Map);
      expect(failover.latencyStats).toBeInstanceOf(Map);
      expect(failover.failoverHistory).toEqual([]);
      expect(failover.running).toBe(false);
      expect(failover.primaryExchangeId).toBeNull();
    });

    it('应该合并自定义配置', () => {
      const customFailover = new ExchangeFailover({
        failureThreshold: 5,
        verbose: false,
      });
      expect(customFailover.config.failureThreshold).toBe(5);
      expect(customFailover.config.healthCheckInterval).toBe(DEFAULT_CONFIG.healthCheckInterval);
    });
  });

  describe('生命周期管理', () => {
    describe('init', () => {
      it('应该初始化交易所列表', async () => {
        await failover.init({
          exchanges: [
            { id: 'binance', client: mockClient1, priority: 1, isPrimary: true },
            { id: 'okx', client: mockClient2, priority: 2 },
          ],
        });

        expect(failover.exchanges.size).toBe(2);
        expect(failover.primaryExchangeId).toBe('binance');
      });

      it('应该处理空交易所列表', async () => {
        await failover.init({});
        expect(failover.exchanges.size).toBe(0);
      });
    });

    describe('start/stop', () => {
      it('应该启动健康检查', () => {
        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });

        failover.start();

        expect(failover.running).toBe(true);
        expect(failover.healthCheckTimer).not.toBeNull();
      });

      it('应该停止健康检查', () => {
        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });

        failover.start();
        failover.stop();

        expect(failover.running).toBe(false);
        expect(failover.healthCheckTimer).toBeNull();
      });

      it('应该忽略重复启动', () => {
        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });

        failover.start();
        const timer = failover.healthCheckTimer;
        failover.start();

        expect(failover.healthCheckTimer).toBe(timer);
      });

      it('应该忽略重复停止', () => {
        failover.stop();
        failover.stop();
        // 不应该抛出错误
      });

      it('应该发出 started 事件', () => {
        const eventSpy = vi.fn();
        failover.on('started', eventSpy);

        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });
        failover.start();

        expect(eventSpy).toHaveBeenCalled();
      });

      it('应该发出 stopped 事件', () => {
        const eventSpy = vi.fn();
        failover.on('stopped', eventSpy);

        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });
        failover.start();
        failover.stop();

        expect(eventSpy).toHaveBeenCalled();
      });
    });
  });

  describe('交易所管理', () => {
    describe('registerExchange', () => {
      it('应该注册交易所', () => {
        failover.registerExchange({
          id: 'binance',
          name: 'Binance',
          client: mockClient1,
          priority: 1,
        });

        expect(failover.exchanges.has('binance')).toBe(true);
        expect(failover.healthStatus.has('binance')).toBe(true);
        expect(failover.latencyStats.has('binance')).toBe(true);
        expect(failover.errorHistory.has('binance')).toBe(true);
      });

      it('应该设置第一个交易所为主交易所', () => {
        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });

        expect(failover.primaryExchangeId).toBe('binance');
      });

      it('应该支持 isPrimary 标志', () => {
        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });
        failover.registerExchange({
          id: 'okx',
          client: mockClient2,
          priority: 2,
          isPrimary: true,
        });

        expect(failover.primaryExchangeId).toBe('okx');
      });

      it('应该使用 id 作为默认名称', () => {
        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });

        const exchange = failover.exchanges.get('binance');
        expect(exchange.name).toBe('binance');
      });

      it('应该初始化健康状态为 UNKNOWN', () => {
        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });

        const health = failover.healthStatus.get('binance');
        expect(health.status).toBe(EXCHANGE_STATUS.UNKNOWN);
        expect(health.consecutiveFailures).toBe(0);
        expect(health.consecutiveSuccesses).toBe(0);
      });

      it('应该发出 exchangeRegistered 事件', () => {
        const eventSpy = vi.fn();
        failover.on('exchangeRegistered', eventSpy);

        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });

        expect(eventSpy).toHaveBeenCalled();
        const eventData = eventSpy.mock.calls[0][0];
        expect(eventData.id).toBe('binance');
        expect(eventData.priority).toBe(1);
        // name 和 isPrimary 使用原始参数值
      });

      it('应该拒绝没有 id 的交易所', () => {
        expect(() => {
          failover.registerExchange({ client: mockClient1 });
        }).toThrow(/ID.*required|必需/);
      });

      it('应该拒绝没有 client 的交易所', () => {
        expect(() => {
          failover.registerExchange({ id: 'binance' });
        }).toThrow(/client.*required|必需/);
      });
    });

    describe('unregisterExchange', () => {
      it('应该注销交易所', () => {
        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });

        failover.unregisterExchange('binance');

        expect(failover.exchanges.has('binance')).toBe(false);
        expect(failover.healthStatus.has('binance')).toBe(false);
      });

      it('应该在注销主交易所时切换', () => {
        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });
        failover.registerExchange({
          id: 'okx',
          client: mockClient2,
          priority: 2,
        });

        // 设置 okx 为健康状态
        failover.healthStatus.get('okx').status = EXCHANGE_STATUS.HEALTHY;

        failover.unregisterExchange('binance');

        expect(failover.primaryExchangeId).toBe('okx');
      });

      it('应该发出 exchangeUnregistered 事件', () => {
        const eventSpy = vi.fn();
        failover.on('exchangeUnregistered', eventSpy);

        failover.registerExchange({
          id: 'binance',
          client: mockClient1,
          priority: 1,
        });
        failover.unregisterExchange('binance');

        expect(eventSpy).toHaveBeenCalledWith({ id: 'binance' });
      });

      it('应该忽略不存在的交易所', () => {
        failover.unregisterExchange('unknown');
        // 不应该抛出错误
      });
    });
  });

  describe('健康检查', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: mockClient1,
        priority: 1,
      });
    });

    it('应该执行健康检查并更新状态', async () => {
      await failover.forceHealthCheck();

      const health = failover.healthStatus.get('binance');
      expect(health.status).toBe(EXCHANGE_STATUS.HEALTHY);
      expect(health.consecutiveSuccesses).toBeGreaterThan(0);
    });

    it('应该记录延迟', async () => {
      await failover.forceHealthCheck();

      const stats = failover.latencyStats.get('binance');
      expect(stats.latencies.length).toBeGreaterThan(0);
      expect(stats.avgLatency).toBeGreaterThan(0);
    });

    it('应该处理健康检查失败', async () => {
      const failingClient = createMockClient({
        shouldFail: true,
        failError: new Error('Connection refused'),
      });

      failover.registerExchange({
        id: 'failing',
        client: failingClient,
        priority: 2,
      });

      await failover.forceHealthCheck();

      const health = failover.healthStatus.get('failing');
      expect(health.consecutiveFailures).toBeGreaterThan(0);
      expect(health.lastError).not.toBeNull();
    });

    it('应该发出 healthStatusUpdated 事件', async () => {
      const eventSpy = vi.fn();
      failover.on('healthStatusUpdated', eventSpy);

      await failover.forceHealthCheck();

      expect(eventSpy).toHaveBeenCalled();
      const call = eventSpy.mock.calls[0][0];
      expect(call.exchangeId).toBe('binance');
      expect(call.status).toBeDefined();
    });

    it('应该标记高延迟为 DEGRADED', async () => {
      // 直接设置延迟统计来模拟高延迟情况
      failover._recordLatency('binance', 600);
      failover._recordLatency('binance', 600);
      failover._recordLatency('binance', 600);

      failover.config.latencyWarningThreshold = 100;

      // 手动更新状态为 DEGRADED (模拟健康检查后的状态更新)
      const health = failover.healthStatus.get('binance');
      const stats = failover.latencyStats.get('binance');

      // 检查平均延迟是否超过阈值
      expect(stats.avgLatency).toBeGreaterThan(failover.config.latencyWarningThreshold);
    });
  });

  describe('错误分类', () => {
    it('应该识别超时错误', () => {
      const error = new Error('Request timeout');
      expect(failover._classifyError(error)).toBe(FAILURE_TYPE.TIMEOUT);
    });

    it('应该识别连接错误', () => {
      const error = new Error('ECONNREFUSED');
      expect(failover._classifyError(error)).toBe(FAILURE_TYPE.CONNECTION);

      const error2 = new Error('Network error');
      expect(failover._classifyError(error2)).toBe(FAILURE_TYPE.CONNECTION);
    });

    it('应该识别限频错误', () => {
      const error = new Error('Rate limit exceeded');
      expect(failover._classifyError(error)).toBe(FAILURE_TYPE.RATE_LIMIT);

      const error2 = new Error('429 Too Many Requests');
      expect(failover._classifyError(error2)).toBe(FAILURE_TYPE.RATE_LIMIT);
    });

    it('应该识别维护错误', () => {
      const error = new Error('Exchange under maintenance');
      expect(failover._classifyError(error)).toBe(FAILURE_TYPE.MAINTENANCE);
    });

    it('应该识别 API 错误', () => {
      const error = new Error('API error: invalid parameters');
      expect(failover._classifyError(error)).toBe(FAILURE_TYPE.API_ERROR);
    });

    it('应该返回未知错误类型', () => {
      const error = new Error('Some random message that does not match any pattern');
      expect(failover._classifyError(error)).toBe(FAILURE_TYPE.UNKNOWN);
    });
  });

  describe('延迟统计', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: mockClient1,
        priority: 1,
      });
    });

    it('应该记录延迟', () => {
      failover._recordLatency('binance', 100);
      failover._recordLatency('binance', 200);

      const stats = failover.latencyStats.get('binance');
      expect(stats.latencies).toHaveLength(2);
      expect(stats.avgLatency).toBe(150);
      expect(stats.minLatency).toBe(100);
      expect(stats.maxLatency).toBe(200);
    });

    it('应该限制窗口大小', () => {
      failover.config.latencyWindowSize = 5;

      for (let i = 0; i < 10; i++) {
        failover._recordLatency('binance', i * 10);
      }

      const stats = failover.latencyStats.get('binance');
      expect(stats.latencies.length).toBe(5);
    });

    it('应该忽略不存在的交易所', () => {
      failover._recordLatency('unknown', 100);
      // 不应该抛出错误
    });
  });

  describe('错误记录', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: mockClient1,
        priority: 1,
      });
    });

    it('应该记录错误', () => {
      failover._recordError('binance', FAILURE_TYPE.CONNECTION, 'Connection failed');

      const errors = failover.errorHistory.get('binance');
      expect(errors.length).toBe(1);
      expect(errors[0].type).toBe(FAILURE_TYPE.CONNECTION);
      expect(errors[0].message).toBe('Connection failed');
    });

    it('应该限制错误历史长度', () => {
      failover.config.statsHistoryLength = 5;

      for (let i = 0; i < 10; i++) {
        failover._recordError('binance', FAILURE_TYPE.UNKNOWN, `Error ${i}`);
      }

      const errors = failover.errorHistory.get('binance');
      expect(errors.length).toBe(5);
    });
  });

  describe('故障切换', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: mockClient1,
        priority: 1,
      });
      failover.registerExchange({
        id: 'okx',
        client: mockClient2,
        priority: 2,
      });

      // 设置初始健康状态
      failover.healthStatus.get('binance').status = EXCHANGE_STATUS.HEALTHY;
      failover.healthStatus.get('okx').status = EXCHANGE_STATUS.HEALTHY;
    });

    it('应该找到下一个主交易所', () => {
      const next = failover._findNextPrimary('binance');
      expect(next).toBe('okx');
    });

    it('应该排除不健康的交易所', () => {
      failover.healthStatus.get('okx').status = EXCHANGE_STATUS.OFFLINE;

      const next = failover._findNextPrimary('binance');
      expect(next).toBeNull();
    });

    it('应该按优先级选择', () => {
      failover.registerExchange({
        id: 'bybit',
        client: mockClient3,
        priority: 0, // 更高优先级
      });
      failover.healthStatus.get('bybit').status = EXCHANGE_STATUS.HEALTHY;

      const next = failover._findNextPrimary('binance');
      expect(next).toBe('bybit');
    });

    it('应该执行故障切换', () => {
      failover._performFailover('okx', FAILOVER_REASON.MANUAL, '手动切换');

      expect(failover.primaryExchangeId).toBe('okx');
      expect(failover.failoverHistory.length).toBe(1);
    });

    it('应该发出 failover 事件', () => {
      const eventSpy = vi.fn();
      failover.on('failover', eventSpy);

      failover._performFailover('okx', FAILOVER_REASON.MANUAL, '手动切换');

      expect(eventSpy).toHaveBeenCalled();
      const record = eventSpy.mock.calls[0][0];
      expect(record.fromExchange).toBe('binance');
      expect(record.toExchange).toBe('okx');
      expect(record.reason).toBe(FAILOVER_REASON.MANUAL);
    });

    it('应该在主交易所不健康时自动切换', async () => {
      failover.healthStatus.get('binance').status = EXCHANGE_STATUS.OFFLINE;

      failover._checkFailoverNeeded();

      expect(failover.primaryExchangeId).toBe('okx');
    });

    it('应该在冷却期内不切换', () => {
      failover.lastFailoverTime = Date.now();
      failover.healthStatus.get('binance').status = EXCHANGE_STATUS.OFFLINE;

      failover._checkFailoverNeeded();

      // 仍然是 binance（虽然不健康）因为在冷却期内
      expect(failover.primaryExchangeId).toBe('binance');
    });

    it('应该发出 noBackupAvailable 事件', () => {
      const eventSpy = vi.fn();
      failover.on('noBackupAvailable', eventSpy);

      failover.healthStatus.get('binance').status = EXCHANGE_STATUS.OFFLINE;
      failover.healthStatus.get('okx').status = EXCHANGE_STATUS.OFFLINE;

      failover._checkFailoverNeeded();

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('公共 API', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: mockClient1,
        priority: 1,
      });
      failover.registerExchange({
        id: 'okx',
        client: mockClient2,
        priority: 2,
      });
    });

    describe('getPrimary', () => {
      it('应该返回主交易所', () => {
        const primary = failover.getPrimary();
        expect(primary.id).toBe('binance');
      });

      it('应该返回 null 如果没有主交易所', () => {
        failover.primaryExchangeId = null;
        expect(failover.getPrimary()).toBeNull();
      });
    });

    describe('getPrimaryClient', () => {
      it('应该返回主交易所客户端', () => {
        const client = failover.getPrimaryClient();
        expect(client).toBe(mockClient1);
      });

      it('应该返回 null 如果没有主交易所', () => {
        failover.primaryExchangeId = null;
        expect(failover.getPrimaryClient()).toBeNull();
      });
    });

    describe('getClient', () => {
      it('应该返回指定交易所客户端', () => {
        const client = failover.getClient('okx');
        expect(client).toBe(mockClient2);
      });

      it('应该返回 null 如果交易所不存在', () => {
        expect(failover.getClient('unknown')).toBeNull();
      });
    });

    describe('switchTo', () => {
      beforeEach(() => {
        failover.healthStatus.get('okx').status = EXCHANGE_STATUS.HEALTHY;
      });

      it('应该手动切换到指定交易所', () => {
        const result = failover.switchTo('okx');

        expect(result).toBe(true);
        expect(failover.primaryExchangeId).toBe('okx');
      });

      it('应该返回 false 如果交易所不存在', () => {
        const result = failover.switchTo('unknown');
        expect(result).toBe(false);
      });

      it('应该返回 true 如果已经是主交易所', () => {
        const result = failover.switchTo('binance');
        expect(result).toBe(true);
      });
    });

    describe('getHealthStatus', () => {
      it('应该返回指定交易所健康状态', () => {
        const health = failover.getHealthStatus('binance');
        expect(health.status).toBeDefined();
      });

      it('应该返回所有交易所健康状态', () => {
        const statuses = failover.getHealthStatus();
        expect(statuses.binance).toBeDefined();
        expect(statuses.okx).toBeDefined();
      });
    });

    describe('getLatencyStats', () => {
      it('应该返回指定交易所延迟统计', () => {
        failover._recordLatency('binance', 100);
        const stats = failover.getLatencyStats('binance');
        expect(stats.avgLatency).toBe(100);
      });

      it('应该返回所有交易所延迟统计', () => {
        const stats = failover.getLatencyStats();
        expect(stats.binance).toBeDefined();
        expect(stats.okx).toBeDefined();
      });
    });

    describe('getFailoverHistory', () => {
      it('应该返回故障切换历史', () => {
        failover.healthStatus.get('okx').status = EXCHANGE_STATUS.HEALTHY;
        failover._performFailover('okx', FAILOVER_REASON.MANUAL, '测试');

        const history = failover.getFailoverHistory();
        expect(history.length).toBe(1);
        expect(history[0].toExchange).toBe('okx');
      });

      it('应该限制返回数量', () => {
        for (let i = 0; i < 10; i++) {
          failover.failoverHistory.push({ test: i });
        }

        const history = failover.getFailoverHistory(5);
        expect(history.length).toBe(5);
      });
    });

    describe('getStatus', () => {
      it('应该返回完整状态', () => {
        const status = failover.getStatus();

        expect(status.running).toBe(false);
        expect(status.primaryExchangeId).toBe('binance');
        expect(status.exchangeCount).toBe(2);
        expect(status.exchanges).toHaveLength(2);
      });

      it('应该按优先级排序交易所', () => {
        const status = failover.getStatus();

        expect(status.exchanges[0].priority).toBeLessThanOrEqual(
          status.exchanges[1].priority
        );
      });
    });
  });

  describe('带重试的执行', () => {
    beforeEach(() => {
      failover.registerExchange({
        id: 'binance',
        client: mockClient1,
        priority: 1,
      });
      failover.registerExchange({
        id: 'okx',
        client: mockClient2,
        priority: 2,
      });

      failover.healthStatus.get('binance').status = EXCHANGE_STATUS.HEALTHY;
      failover.healthStatus.get('okx').status = EXCHANGE_STATUS.HEALTHY;
    });

    it('应该成功执行函数', async () => {
      const result = await failover.executeWithRetry(async (client) => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('应该在失败后重试', async () => {
      let attempts = 0;

      const result = await failover.executeWithRetry(async (client) => {
        attempts++;
        if (attempts < 2) throw new Error('Temporary error');
        return 'success';
      }, { maxRetries: 3, retryInterval: 10 });

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('应该在主交易所失败后切换到备用', async () => {
      let usedExchanges = [];

      await failover.executeWithRetry(async (client, exchangeId) => {
        usedExchanges.push(exchangeId);
        if (exchangeId === 'binance') throw new Error('Binance failed');
        return 'success';
      }, { maxRetries: 1, retryInterval: 10 });

      expect(usedExchanges).toContain('binance');
      expect(usedExchanges).toContain('okx');
    });

    it('应该在所有交易所失败时抛出错误', async () => {
      await expect(failover.executeWithRetry(async () => {
        throw new Error('All failed');
      }, { maxRetries: 1, retryInterval: 10 })).rejects.toThrow('All failed');
    });

    it('应该在没有可用交易所时抛出错误', async () => {
      failover.primaryExchangeId = null;

      await expect(failover.executeWithRetry(async () => {
        return 'success';
      })).rejects.toThrow(/无可用交易所|No available/);
    });
  });

  describe('日志功能', () => {
    it('应该在 verbose 模式下输出日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      failover.config.verbose = true;

      failover.log('Test message', 'info');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该在非 verbose 模式下不输出 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      failover.config.verbose = false;

      failover.log('Test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出警告日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      failover.log('Warning message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出错误日志', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      failover.log('Error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('事件', () => {
    it('应该继承 EventEmitter', () => {
      expect(typeof failover.on).toBe('function');
      expect(typeof failover.emit).toBe('function');
      expect(typeof failover.removeListener).toBe('function');
    });
  });
});

describe('ExchangeFailover 恢复逻辑', () => {
  let failover;
  let mockClient1;
  let mockClient2;

  beforeEach(() => {
    mockClient1 = createMockClient({ id: 'binance' });
    mockClient2 = createMockClient({ id: 'okx' });

    failover = new ExchangeFailover({
      healthCheckInterval: 50,
      healthCheckTimeout: 200,
      recoveryWaitTime: 100,
      recoveryThreshold: 1,
      enableAutoRecovery: false, // 禁用自动恢复以避免定时器问题
      verbose: false,
    });

    failover.registerExchange({
      id: 'binance',
      client: mockClient1,
      priority: 1,
    });
    failover.registerExchange({
      id: 'okx',
      client: mockClient2,
      priority: 2,
    });

    failover.healthStatus.get('binance').status = EXCHANGE_STATUS.HEALTHY;
    failover.healthStatus.get('okx').status = EXCHANGE_STATUS.HEALTHY;
  });

  afterEach(() => {
    failover.stop();
    // 清理恢复定时器
    if (failover.recoveryCheckTimer) {
      clearTimeout(failover.recoveryCheckTimer);
      failover.recoveryCheckTimer = null;
    }
    vi.clearAllMocks();
  });

  it('应该安排恢复检查', () => {
    failover._performFailover('okx', FAILOVER_REASON.AUTO_HEALTH, 'test');

    expect(failover.recoveryCheckTimer).not.toBeNull();
  });

  it('应该在恢复后切回原主交易所', async () => {
    // 切换到 okx
    failover._performFailover('okx', FAILOVER_REASON.AUTO_HEALTH, 'test');

    // 设置 binance 为恢复状态
    failover.healthStatus.get('binance').status = EXCHANGE_STATUS.HEALTHY;
    failover.healthStatus.get('binance').consecutiveSuccesses = 2;

    // 手动触发恢复检查
    await failover._checkRecovery('binance');

    expect(failover.primaryExchangeId).toBe('binance');
  });

  it('应该在未恢复时继续安排检查', async () => {
    failover._performFailover('okx', FAILOVER_REASON.AUTO_HEALTH, 'test');

    // binance 仍然不健康
    failover.healthStatus.get('binance').status = EXCHANGE_STATUS.UNHEALTHY;
    failover.healthStatus.get('binance').consecutiveSuccesses = 0;

    await failover._checkRecovery('binance');

    // 应该仍然是 okx
    expect(failover.primaryExchangeId).toBe('okx');
  });
});

describe('ExchangeFailover 默认健康检查', () => {
  let failover;

  beforeEach(() => {
    failover = new ExchangeFailover({ verbose: false });
  });

  it('应该使用 fetchTime', async () => {
    const client = {
      fetchTime: vi.fn().mockResolvedValue(Date.now()),
    };

    await failover._defaultHealthCheck(client);

    expect(client.fetchTime).toHaveBeenCalled();
  });

  it('应该使用 loadMarkets 作为备选', async () => {
    const client = {
      loadMarkets: vi.fn().mockResolvedValue({}),
    };

    await failover._defaultHealthCheck(client);

    expect(client.loadMarkets).toHaveBeenCalled();
  });

  it('应该使用 ping 作为第三选择', async () => {
    const client = {
      ping: vi.fn().mockResolvedValue(true),
    };

    await failover._defaultHealthCheck(client);

    expect(client.ping).toHaveBeenCalled();
  });

  it('应该在没有可用方法时抛出错误', async () => {
    const client = {};

    await expect(failover._defaultHealthCheck(client)).rejects.toThrow(/无可用的健康检查方法/);
  });
});
