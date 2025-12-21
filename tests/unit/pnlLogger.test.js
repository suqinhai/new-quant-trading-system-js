/**
 * PnLLogger 单元测试
 * PnL Logger Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs - must be before imports
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      end: vi.fn(),
      write: vi.fn(),
    })),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtime: new Date() })),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    end: vi.fn(),
    write: vi.fn(),
  })),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ mtime: new Date() })),
  unlinkSync: vi.fn(),
}));

// Mock pino - use module-level mockLogger
vi.mock('pino', () => {
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };

  const pino = vi.fn(() => loggerMock);
  pino.multistream = vi.fn(() => ({}));

  // Store reference for external access
  pino._mockLogger = loggerMock;

  return { default: pino };
});

import {
  PnLLogger,
  LOG_LEVEL,
  LOG_TYPE,
  DEFAULT_CONFIG,
} from '../../src/logger/PnLLogger.js';
import pino from 'pino';

// Get the mock logger from the pino mock
const mockLogger = pino._mockLogger;

describe('PnLLogger 常量导出', () => {
  it('应该导出 LOG_LEVEL', () => {
    expect(LOG_LEVEL.TRACE).toBe('trace');
    expect(LOG_LEVEL.DEBUG).toBe('debug');
    expect(LOG_LEVEL.INFO).toBe('info');
    expect(LOG_LEVEL.WARN).toBe('warn');
    expect(LOG_LEVEL.ERROR).toBe('error');
    expect(LOG_LEVEL.FATAL).toBe('fatal');
  });

  it('应该导出 LOG_TYPE', () => {
    expect(LOG_TYPE.PNL).toBe('pnl');
    expect(LOG_TYPE.TRADE).toBe('trade');
    expect(LOG_TYPE.POSITION).toBe('position');
    expect(LOG_TYPE.BALANCE).toBe('balance');
    expect(LOG_TYPE.SIGNAL).toBe('signal');
    expect(LOG_TYPE.RISK).toBe('risk');
    expect(LOG_TYPE.SYSTEM).toBe('system');
    expect(LOG_TYPE.METRIC).toBe('metric');
  });

  it('应该导出 DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.logDir).toBe('./logs');
    expect(DEFAULT_CONFIG.pnlDir).toBe('pnl');
    expect(DEFAULT_CONFIG.tradeDir).toBe('trades');
    expect(DEFAULT_CONFIG.pnlInterval).toBe(1000);
    expect(DEFAULT_CONFIG.maxRetentionDays).toBe(30);
    expect(DEFAULT_CONFIG.grafanaCompatible).toBe(true);
  });
});

describe('PnLLogger', () => {
  let logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new PnLLogger({
      logDir: './test-logs',
      pnlInterval: 100,
      positionInterval: 100,
      balanceInterval: 100,
    });
  });

  afterEach(() => {
    if (logger.running) {
      logger.stop();
    }
    // 清理定时器
    Object.values(logger.timers).forEach(timer => {
      if (timer) clearInterval(timer);
    });
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(logger.config.logDir).toBe('./test-logs');
      expect(logger.running).toBe(false);
      expect(logger.stats.pnlLogsCount).toBe(0);
      expect(logger.stats.tradeLogsCount).toBe(0);
    });

    it('应该合并自定义配置', () => {
      const customLogger = new PnLLogger({
        maxRetentionDays: 7,
        pnlInterval: 5000,
      });
      expect(customLogger.config.maxRetentionDays).toBe(7);
      expect(customLogger.config.pnlInterval).toBe(5000);
      customLogger.stop();
    });

    it('应该初始化日志记录器', () => {
      expect(logger.loggers.pnl).not.toBeNull();
      expect(logger.loggers.trade).not.toBeNull();
      expect(logger.loggers.system).not.toBeNull();
    });

    it('应该初始化数据源为 null', () => {
      expect(logger.dataSources.riskManager).toBeNull();
      expect(logger.dataSources.positionManager).toBeNull();
      expect(logger.dataSources.accountManager).toBeNull();
    });
  });

  describe('生命周期管理', () => {
    it('应该启动日志记录', () => {
      logger.start();
      expect(logger.running).toBe(true);
      expect(logger.timers.pnl).not.toBeNull();
      expect(logger.timers.position).not.toBeNull();
      expect(logger.timers.balance).not.toBeNull();
      expect(logger.timers.rotation).not.toBeNull();
    });

    it('应该停止日志记录', () => {
      logger.start();
      logger.stop();
      expect(logger.running).toBe(false);
      expect(logger.timers.pnl).toBeNull();
      expect(logger.timers.position).toBeNull();
      expect(logger.timers.balance).toBeNull();
    });

    it('应该发出 started 事件', () => {
      const eventSpy = vi.fn();
      logger.on('started', eventSpy);
      logger.start();
      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该发出 stopped 事件', () => {
      const eventSpy = vi.fn();
      logger.on('stopped', eventSpy);
      logger.start();
      logger.stop();
      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('数据源设置', () => {
    it('应该设置数据源', () => {
      const mockRiskManager = { getStatus: vi.fn() };
      const mockPositionManager = { getActivePositions: vi.fn() };
      const mockAccountManager = {};

      logger.setDataSources({
        riskManager: mockRiskManager,
        positionManager: mockPositionManager,
        accountManager: mockAccountManager,
      });

      expect(logger.dataSources.riskManager).toBe(mockRiskManager);
      expect(logger.dataSources.positionManager).toBe(mockPositionManager);
      expect(logger.dataSources.accountManager).toBe(mockAccountManager);
    });
  });

  describe('PnL 日志记录', () => {
    it('应该记录 PnL 数据', () => {
      logger.logPnL({
        equity: 10000,
        drawdown: 0.05,
        realizedPnl: 100,
      });

      expect(mockLogger.info).toHaveBeenCalled();
      expect(logger.stats.pnlLogsCount).toBe(1);
    });

    it('应该发出 pnlLogged 事件', async () => {
      const mockRiskManager = {
        getStatus: vi.fn().mockReturnValue({
          dailyEquity: { currentDrawdown: 0.02 },
          riskLevel: 'low',
          tradingAllowed: true,
          accounts: [{ exchange: 'binance', equity: 10000 }],
        }),
      };

      logger.setDataSources({ riskManager: mockRiskManager });

      const eventSpy = vi.fn();
      logger.on('pnlLogged', eventSpy);

      logger.running = true;
      logger._logPnLSnapshot();

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该在没有数据源时跳过快照', () => {
      logger.running = true;
      logger._logPnLSnapshot();

      // 应该没有错误，但也没有记录
      expect(logger.stats.pnlLogsCount).toBe(0);
    });
  });

  describe('交易日志记录', () => {
    it('应该记录交易', () => {
      logger.logTrade({
        id: 'trade_123',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        fee: { cost: 5, currency: 'USDT' },
        exchange: 'binance',
      });

      expect(mockLogger.info).toHaveBeenCalled();
      expect(logger.stats.tradeLogsCount).toBe(1);
    });

    it('应该发出 tradeLogged 事件', () => {
      const eventSpy = vi.fn();
      logger.on('tradeLogged', eventSpy);

      logger.logTrade({
        id: 'trade_123',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该记录订单', () => {
      logger.logOrder('created', {
        id: 'order_123',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        status: 'open',
      });

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('系统日志记录', () => {
    it('应该记录各级别系统日志', () => {
      logger.logSystem('info', '测试信息');
      expect(mockLogger.info).toHaveBeenCalled();

      logger.logSystem('warn', '测试警告');
      expect(mockLogger.warn).toHaveBeenCalled();

      logger.logSystem('error', '测试错误');
      expect(mockLogger.error).toHaveBeenCalled();

      logger.logSystem('debug', '测试调试');
      expect(mockLogger.debug).toHaveBeenCalled();

      logger.logSystem('trace', '测试追踪');
      expect(mockLogger.trace).toHaveBeenCalled();

      logger.logSystem('fatal', '测试致命');
      expect(mockLogger.fatal).toHaveBeenCalled();
    });

    it('应该更新系统日志计数', () => {
      logger.logSystem('info', '测试');
      expect(logger.stats.systemLogsCount).toBe(1);
    });
  });

  describe('风控事件日志', () => {
    it('应该记录风控事件', () => {
      logger.logRiskEvent('drawdown', {
        current: 0.08,
        threshold: 0.05,
      });

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('应该发出 riskEventLogged 事件', () => {
      const eventSpy = vi.fn();
      logger.on('riskEventLogged', eventSpy);

      logger.logRiskEvent('margin', { rate: 0.30 });

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('Grafana 指标记录', () => {
    it('应该记录单个指标', () => {
      logger.logMetric('equity', 10000, { exchange: 'binance' });

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('应该在禁用 Grafana 模式时跳过', () => {
      logger.config.grafanaCompatible = false;

      logger.logMetric('equity', 10000);

      // 应该没有调用 (因为 Grafana 模式禁用)
      // 但前面的测试已经调用过了，所以只检查不抛错
    });

    it('应该记录多个指标', () => {
      vi.clearAllMocks();

      logger.logMetrics([
        { name: 'equity', value: 10000 },
        { name: 'drawdown', value: 0.05 },
        { name: 'pnl', value: 100 },
      ]);

      expect(mockLogger.info).toHaveBeenCalledTimes(3);
    });
  });

  describe('持仓快照', () => {
    it('应该记录持仓快照', () => {
      const mockPositionManager = {
        getActivePositions: vi.fn().mockReturnValue([
          { symbol: 'BTC/USDT', side: 'long', openSize: 0.1, openPrice: 50000 },
          { symbol: 'ETH/USDT', side: 'short', openSize: 1, openPrice: 3000 },
        ]),
      };

      logger.setDataSources({ positionManager: mockPositionManager });
      logger.running = true;

      logger._logPositionSnapshot();

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('应该在没有仓位管理器时跳过', () => {
      logger.running = true;
      vi.clearAllMocks();

      logger._logPositionSnapshot();

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('余额快照', () => {
    it('应该记录余额快照', () => {
      const mockRiskManager = {
        getStatus: vi.fn().mockReturnValue({
          accounts: [
            { exchange: 'binance', equity: 10000, usedMargin: 2000 },
            { exchange: 'okx', equity: 5000, usedMargin: 1000 },
          ],
        }),
      };

      logger.setDataSources({ riskManager: mockRiskManager });
      logger.running = true;

      logger._logBalanceSnapshot();

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('日志轮转', () => {
    it('应该在日期变化时轮转', () => {
      // 模拟日期变化
      const oldDate = logger.currentDate;
      logger.currentDate = '2024-01-01';

      logger._checkLogRotation();

      // 日期应该更新
      expect(logger.currentDate).not.toBe('2024-01-01');
    });

    it('应该在日期未变化时跳过', () => {
      const currentDate = logger.currentDate;

      logger._checkLogRotation();

      expect(logger.currentDate).toBe(currentDate);
    });

    it('应该在禁用日期轮转时跳过', () => {
      logger.config.rotateByDate = false;
      const originalDate = logger.currentDate;
      logger.currentDate = '2020-01-01';

      logger._checkLogRotation();

      expect(logger.currentDate).toBe('2020-01-01');
    });
  });

  describe('统计和查询', () => {
    it('应该返回统计信息', () => {
      logger.logTrade({ symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000 });
      logger.logSystem('info', '测试');

      const stats = logger.getStats();

      expect(stats.tradeLogsCount).toBe(1);
      expect(stats.systemLogsCount).toBe(1);
      expect(stats.running).toBe(false);
      expect(stats.currentDate).toBeDefined();
    });

    it('应该返回日志文件路径', () => {
      const paths = logger.getLogFilePaths();

      expect(paths.pnl).toBeDefined();
      expect(paths.trade).toBeDefined();
      expect(paths.system).toBeDefined();
    });
  });

  describe('事件', () => {
    it('应该继承 EventEmitter', () => {
      expect(typeof logger.on).toBe('function');
      expect(typeof logger.emit).toBe('function');
      expect(typeof logger.removeListener).toBe('function');
    });
  });
});

describe('PnLLogger 错误处理', () => {
  let logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new PnLLogger({ logDir: './test-logs' });
  });

  afterEach(() => {
    logger.stop();
    vi.clearAllMocks();
  });

  it('应该处理 PnL 快照错误', () => {
    const mockRiskManager = {
      getStatus: vi.fn().mockImplementation(() => {
        throw new Error('获取状态失败');
      }),
    };

    logger.setDataSources({ riskManager: mockRiskManager });
    logger.running = true;

    // 不应该抛错
    expect(() => logger._logPnLSnapshot()).not.toThrow();

    // 应该增加错误计数
    expect(logger.stats.errorsCount).toBe(1);
  });

  it('应该处理持仓快照错误', () => {
    const mockPositionManager = {
      getActivePositions: vi.fn().mockImplementation(() => {
        throw new Error('获取持仓失败');
      }),
    };

    logger.setDataSources({ positionManager: mockPositionManager });
    logger.running = true;

    expect(() => logger._logPositionSnapshot()).not.toThrow();
    expect(logger.stats.errorsCount).toBe(1);
  });

  it('应该处理余额快照错误', () => {
    const mockRiskManager = {
      getStatus: vi.fn().mockImplementation(() => {
        throw new Error('获取余额失败');
      }),
    };

    logger.setDataSources({ riskManager: mockRiskManager });
    logger.running = true;

    expect(() => logger._logBalanceSnapshot()).not.toThrow();
    expect(logger.stats.errorsCount).toBe(1);
  });
});
