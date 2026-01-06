/**
 * PnL 日志记录器
 * PnL Logger
 *
 * 功能 / Features:
 * 1. 使用 pino 高性能日志记录 / High-performance logging with pino
 * 2. 实时记录 PnL 到文件 / Real-time PnL logging to file
 * 3. 支持日志轮转 / Log rotation support
 * 4. 输出格式兼容 Grafana / Grafana-compatible output format
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

// 导入 pino 日志库 / Import pino logging library
import pino from 'pino';

// 导入文件系统模块 / Import file system module
import fs from 'fs';

// 导入路径模块 / Import path module
import path from 'path';

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 日志级别
 * Log levels
 */
const LOG_LEVEL = {
  TRACE: 'trace',   // 追踪 / Trace
  DEBUG: 'debug',   // 调试 / Debug
  INFO: 'info',     // 信息 / Info
  WARN: 'warn',     // 警告 / Warning
  ERROR: 'error',   // 错误 / Error
  FATAL: 'fatal',   // 致命 / Fatal
};

/**
 * 日志类型
 * Log types
 */
const LOG_TYPE = {
  PNL: 'pnl',               // PnL 日志 / PnL log
  TRADE: 'trade',           // 交易日志 / Trade log
  POSITION: 'position',     // 持仓日志 / Position log
  BALANCE: 'balance',       // 余额日志 / Balance log
  SIGNAL: 'signal',         // 信号日志 / Signal log
  RISK: 'risk',             // 风控日志 / Risk log
  SYSTEM: 'system',         // 系统日志 / System log
  METRIC: 'metric',         // 指标日志 / Metric log
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 日志目录配置 / Log Directory Configuration
  // ============================================

  // 日志根目录 / Log root directory
  logDir: './logs',

  // PnL 日志子目录 / PnL log subdirectory
  pnlDir: 'pnl',

  // 交易日志子目录 / Trade log subdirectory
  tradeDir: 'trades',

  // 系统日志子目录 / System log subdirectory
  systemDir: 'system',

  // ============================================
  // 日志文件配置 / Log File Configuration
  // ============================================

  // PnL 日志文件前缀 / PnL log file prefix
  pnlFilePrefix: 'pnl',

  // 交易日志文件前缀 / Trade log file prefix
  tradeFilePrefix: 'trades',

  // 系统日志文件前缀 / System log file prefix
  systemFilePrefix: 'system',

  // 日志文件扩展名 / Log file extension
  fileExtension: '.log',

  // ============================================
  // 日志轮转配置 / Log Rotation Configuration
  // ============================================

  // 是否按日期轮转 / Rotate by date
  rotateByDate: true,

  // 日期格式 / Date format (YYYY-MM-DD)
  dateFormat: 'YYYY-MM-DD',

  // 最大保留天数 / Max retention days
  maxRetentionDays: 30,

  // 最大单文件大小 (字节) / Max single file size (bytes)
  maxFileSize: 100 * 1024 * 1024,  // 100MB

  // ============================================
  // 日志格式配置 / Log Format Configuration
  // ============================================

  // 日志级别 / Log level
  level: LOG_LEVEL.INFO,

  // 是否美化输出 (开发环境) / Pretty print (development)
  prettyPrint: false,

  // 时间戳格式 / Timestamp format
  timestampFormat: 'iso',  // 'iso' | 'epoch' | 'unix'

  // 是否包含堆栈跟踪 / Include stack trace
  includeStackTrace: true,

  // ============================================
  // 实时记录配置 / Real-time Logging Configuration
  // ============================================

  // PnL 记录间隔 (毫秒) / PnL logging interval (ms)
  pnlInterval: 1000,  // 1秒 / 1 second

  // 持仓记录间隔 (毫秒) / Position logging interval (ms)
  positionInterval: 5000,  // 5秒 / 5 seconds

  // 余额记录间隔 (毫秒) / Balance logging interval (ms)
  balanceInterval: 60000,  // 1分钟 / 1 minute

  // ============================================
  // Grafana 兼容配置 / Grafana Compatibility Configuration
  // ============================================

  // 是否启用 Grafana 兼容模式 / Enable Grafana-compatible mode
  grafanaCompatible: true,

  // 指标标签 / Metric labels
  metricLabels: {
    app: 'quant-trading-system',  // 应用名称 / Application name
    env: 'production',             // 环境 / Environment
  },
};

// ============================================
// 辅助函数 / Helper Functions
// ============================================

/**
 * 获取当前日期字符串
 * Get current date string
 *
 * @param {string} format - 日期格式 / Date format
 * @returns {string} 日期字符串 / Date string
 */
function getDateString(format = 'YYYY-MM-DD') {
  // 获取当前时间 / Get current time
  const now = new Date();

  // 提取年月日 / Extract year, month, day
  const year = now.getFullYear();                              // 年 / Year
  const month = String(now.getMonth() + 1).padStart(2, '0');   // 月 / Month
  const day = String(now.getDate()).padStart(2, '0');          // 日 / Day

  // 根据格式返回 / Return based on format
  if (format === 'YYYY-MM-DD') {
    return `${year}-${month}-${day}`;
  }

  // 默认返回完整格式 / Default return full format
  return `${year}-${month}-${day}`;
}

/**
 * 确保目录存在
 * Ensure directory exists
 *
 * @param {string} dirPath - 目录路径 / Directory path
 */
function ensureDirectoryExists(dirPath) {
  // 如果目录不存在，创建它 / If directory doesn't exist, create it
  if (!fs.existsSync(dirPath)) {
    // 递归创建目录 / Create directory recursively
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ============================================
// 主类 / Main Class
// ============================================

/**
 * PnL 日志记录器
 * PnL Logger
 */
export class PnLLogger extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 日志记录器实例 / Logger instances
    this.loggers = {
      pnl: null,       // PnL 日志器 / PnL logger
      trade: null,     // 交易日志器 / Trade logger
      system: null,    // 系统日志器 / System logger
    };

    // 日志文件流 / Log file streams
    this.streams = {
      pnl: null,       // PnL 文件流 / PnL file stream
      trade: null,     // 交易文件流 / Trade file stream
      system: null,    // 系统文件流 / System file stream
    };

    // 当前日期 (用于日志轮转) / Current date (for log rotation)
    this.currentDate = getDateString();

    // 定时器引用 / Timer references
    this.timers = {
      pnl: null,        // PnL 记录定时器 / PnL logging timer
      position: null,   // 持仓记录定时器 / Position logging timer
      balance: null,    // 余额记录定时器 / Balance logging timer
      rotation: null,   // 日志轮转检查定时器 / Log rotation check timer
    };

    // 数据源引用 (由外部设置) / Data source references (set externally)
    this.dataSources = {
      riskManager: null,    // 风控管理器 / Risk manager
      positionManager: null, // 仓位管理器 / Position manager
      accountManager: null,  // 账户管理器 / Account manager
    };

    // 统计信息 / Statistics
    this.stats = {
      pnlLogsCount: 0,      // PnL 日志计数 / PnL log count
      tradeLogsCount: 0,    // 交易日志计数 / Trade log count
      systemLogsCount: 0,   // 系统日志计数 / System log count
      errorsCount: 0,       // 错误计数 / Error count
    };

    // 是否正在运行 / Whether running
    this.running = false;

    // 初始化日志目录 / Initialize log directories
    this._initDirectories();

    // 初始化日志记录器 / Initialize loggers
    this._initLoggers();
  }

  // ============================================
  // 初始化方法 / Initialization Methods
  // ============================================

  /**
   * 初始化日志目录
   * Initialize log directories
   * @private
   */
  _initDirectories() {
    // 获取日志根目录 / Get log root directory
    const logDir = this.config.logDir;

    // 确保根目录存在 / Ensure root directory exists
    ensureDirectoryExists(logDir);

    // 确保 PnL 目录存在 / Ensure PnL directory exists
    ensureDirectoryExists(path.join(logDir, this.config.pnlDir));

    // 确保交易目录存在 / Ensure trade directory exists
    ensureDirectoryExists(path.join(logDir, this.config.tradeDir));

    // 确保系统目录存在 / Ensure system directory exists
    ensureDirectoryExists(path.join(logDir, this.config.systemDir));
  }

  /**
   * 初始化日志记录器
   * Initialize loggers
   * @private
   */
  _initLoggers() {
    // 创建 PnL 日志器 / Create PnL logger
    this.loggers.pnl = this._createLogger('pnl');

    // 创建交易日志器 / Create trade logger
    this.loggers.trade = this._createLogger('trade');

    // 创建系统日志器 / Create system logger
    this.loggers.system = this._createLogger('system');
  }

  /**
   * 创建日志记录器
   * Create logger
   *
   * @param {string} type - 日志类型 / Log type
   * @returns {Object} pino 日志器实例 / pino logger instance
   * @private
   */
  _createLogger(type) {
    // 获取日志文件路径 / Get log file path
    const filePath = this._getLogFilePath(type);

    // 创建文件写入流 / Create file write stream
    const stream = fs.createWriteStream(filePath, {
      flags: 'a',  // 追加模式 / Append mode
    });

    // 保存流引用 / Save stream reference
    this.streams[type] = stream;

    // pino 配置选项 / pino configuration options
    const pinoOptions = {
      // 日志级别 / Log level
      level: this.config.level,

      // 基础字段 / Base fields
      base: {
        // 日志类型 / Log type
        logType: type,

        // 应用名称 / Application name
        app: this.config.metricLabels.app,

        // 环境 / Environment
        env: this.config.metricLabels.env,
      },

      // 时间戳配置 / Timestamp configuration
      timestamp: () => {
        // 根据配置格式化时间戳 / Format timestamp based on config
        if (this.config.timestampFormat === 'iso') {
          return `,"time":"${new Date().toISOString()}"`;
        } else if (this.config.timestampFormat === 'epoch') {
          return `,"time":${Date.now()}`;
        } else {
          return `,"time":${Math.floor(Date.now() / 1000)}`;
        }
      },

      // 格式化器 / Formatters
      formatters: {
        // 级别格式化 / Level formatter
        level: (label) => {
          return { level: label };
        },
      },
    };

    // 如果启用美化输出 / If pretty print enabled
    if (this.config.prettyPrint) {
      // 创建带美化的日志器 / Create logger with pretty print
      return pino({
        ...pinoOptions,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,            // 颜色输出 / Colorize output
            translateTime: 'SYS:standard',  // 时间格式 / Time format
          },
        },
      });
    }

    // 创建多目标日志器 / Create multi-destination logger
    // 只写入文件，控制台输出由 main.js 的 _log 方法处理，避免重复
    // Only write to file, console output handled by main.js _log method to avoid duplication
    const multiStream = pino.multistream([
      // 文件流 / File stream
      { stream: stream },
    ]);

    // 返回 pino 日志器 / Return pino logger
    return pino(pinoOptions, multiStream);
  }

  /**
   * 获取日志文件路径
   * Get log file path
   *
   * @param {string} type - 日志类型 / Log type
   * @returns {string} 文件路径 / File path
   * @private
   */
  _getLogFilePath(type) {
    // 获取子目录 / Get subdirectory
    let subDir;
    let prefix;

    // 根据类型选择目录和前缀 / Choose directory and prefix based on type
    switch (type) {
      case 'pnl':
        subDir = this.config.pnlDir;
        prefix = this.config.pnlFilePrefix;
        break;
      case 'trade':
        subDir = this.config.tradeDir;
        prefix = this.config.tradeFilePrefix;
        break;
      case 'system':
      default:
        subDir = this.config.systemDir;
        prefix = this.config.systemFilePrefix;
        break;
    }

    // 获取日期字符串 / Get date string
    const dateStr = this.config.rotateByDate ? `-${this.currentDate}` : '';

    // 构建文件名 / Build filename
    const filename = `${prefix}${dateStr}${this.config.fileExtension}`;

    // 返回完整路径 / Return full path
    return path.join(this.config.logDir, subDir, filename);
  }

  // ============================================
  // 生命周期方法 / Lifecycle Methods
  // ============================================

  /**
   * 设置数据源
   * Set data sources
   *
   * @param {Object} sources - 数据源对象 / Data sources object
   */
  setDataSources(sources) {
    // 设置风控管理器 / Set risk manager
    if (sources.riskManager) {
      this.dataSources.riskManager = sources.riskManager;
    }

    // 设置仓位管理器 / Set position manager
    if (sources.positionManager) {
      this.dataSources.positionManager = sources.positionManager;
    }

    // 设置账户管理器 / Set account manager
    if (sources.accountManager) {
      this.dataSources.accountManager = sources.accountManager;
    }
  }

  /**
   * 启动日志记录
   * Start logging
   */
  start() {
    // 标记为运行中 / Mark as running
    this.running = true;

    // 启动 PnL 定时记录 / Start PnL scheduled logging
    this.timers.pnl = setInterval(
      () => this._logPnLSnapshot(),
      this.config.pnlInterval
    );

    // 启动持仓定时记录 / Start position scheduled logging
    this.timers.position = setInterval(
      () => this._logPositionSnapshot(),
      this.config.positionInterval
    );

    // 启动余额定时记录 / Start balance scheduled logging
    this.timers.balance = setInterval(
      () => this._logBalanceSnapshot(),
      this.config.balanceInterval
    );

    // 启动日志轮转检查 (每分钟) / Start log rotation check (every minute)
    this.timers.rotation = setInterval(
      () => this._checkLogRotation(),
      60000
    );

    // 记录启动日志 / Log startup
    this.logSystem('info', '日志记录器已启动 / Logger started');

    // 发出启动事件 / Emit start event
    this.emit('started');
  }

  /**
   * 停止日志记录
   * Stop logging
   */
  stop() {
    // 标记为停止 / Mark as stopped
    this.running = false;

    // 清除所有定时器 / Clear all timers
    Object.values(this.timers).forEach(timer => {
      if (timer) {
        clearInterval(timer);
      }
    });

    // 重置定时器引用 / Reset timer references
    this.timers = {
      pnl: null,
      position: null,
      balance: null,
      rotation: null,
    };

    // 记录停止日志 / Log shutdown
    this.logSystem('info', '日志记录器已停止 / Logger stopped');

    // 关闭文件流 / Close file streams
    Object.values(this.streams).forEach(stream => {
      if (stream) {
        stream.end();
      }
    });

    // 发出停止事件 / Emit stop event
    this.emit('stopped');
  }

  // ============================================
  // PnL 日志方法 / PnL Logging Methods
  // ============================================

  /**
   * 记录 PnL 快照
   * Log PnL snapshot
   * @private
   */
  _logPnLSnapshot() {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.dataSources.riskManager) {
      return;
    }

    try {
      // 获取风控状态 / Get risk status
      const status = this.dataSources.riskManager.getStatus();

      // 构建 PnL 数据 / Build PnL data
      const pnlData = {
        // 记录类型 / Record type
        type: LOG_TYPE.PNL,

        // 时间戳 (毫秒) / Timestamp (ms)
        timestamp: Date.now(),

        // 每日权益 / Daily equity
        dailyEquity: status.dailyEquity,

        // 当前回撤 / Current drawdown
        drawdown: status.dailyEquity?.currentDrawdown || 0,

        // 风险级别 / Risk level
        riskLevel: status.riskLevel,

        // 交易状态 / Trading status
        tradingAllowed: status.tradingAllowed,

        // 账户数据 / Account data
        accounts: status.accounts?.map(acc => ({
          exchange: acc.exchange,           // 交易所 / Exchange
          equity: acc.equity,               // 权益 / Equity
          usedMargin: acc.usedMargin,       // 已用保证金 / Used margin
          available: acc.available,         // 可用余额 / Available balance
        })) || [],
      };

      // 记录到 PnL 日志 / Log to PnL log
      this.loggers.pnl.info(pnlData, 'pnl_snapshot');

      // 更新统计 / Update statistics
      this.stats.pnlLogsCount++;

      // 发出 PnL 记录事件 / Emit PnL logged event
      this.emit('pnlLogged', pnlData);

    } catch (error) {
      // 记录错误 / Log error
      this.logSystem('error', `PnL 快照记录失败: ${error.message}`);
      this.stats.errorsCount++;
    }
  }

  /**
   * 记录实时 PnL
   * Log real-time PnL
   *
   * @param {Object} pnlData - PnL 数据 / PnL data
   */
  logPnL(pnlData) {
    // 添加类型和时间戳 / Add type and timestamp
    const logData = {
      type: LOG_TYPE.PNL,
      timestamp: Date.now(),
      ...pnlData,
    };

    // 记录到 PnL 日志 / Log to PnL log
    this.loggers.pnl.info(logData, 'pnl_update');

    // 更新统计 / Update statistics
    this.stats.pnlLogsCount++;
  }

  /**
   * 记录持仓快照
   * Log position snapshot
   * @private
   */
  _logPositionSnapshot() {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 如果没有仓位管理器，跳过 / If no position manager, skip
    if (!this.dataSources.positionManager) {
      return;
    }

    try {
      // 获取所有活跃仓位 / Get all active positions
      const positions = this.dataSources.positionManager.getActivePositions
        ? this.dataSources.positionManager.getActivePositions()
        : [];

      // 构建持仓数据 / Build position data
      const positionData = {
        // 记录类型 / Record type
        type: LOG_TYPE.POSITION,

        // 时间戳 / Timestamp
        timestamp: Date.now(),

        // 仓位数量 / Position count
        count: positions.length,

        // 仓位列表 / Position list
        positions: positions.map(pos => ({
          symbol: pos.symbol,           // 交易对 / Symbol
          side: pos.side,               // 方向 / Side
          size: pos.openSize,           // 大小 / Size
          entryPrice: pos.openPrice,    // 开仓价 / Entry price
          unrealizedPnl: pos.unrealizedPnl || 0,  // 未实现盈亏 / Unrealized PnL
        })),
      };

      // 记录到 PnL 日志 / Log to PnL log
      this.loggers.pnl.info(positionData, 'position_snapshot');

    } catch (error) {
      // 记录错误 / Log error
      this.logSystem('error', `持仓快照记录失败: ${error.message}`);
      this.stats.errorsCount++;
    }
  }

  /**
   * 记录余额快照
   * Log balance snapshot
   * @private
   */
  _logBalanceSnapshot() {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.dataSources.riskManager) {
      return;
    }

    try {
      // 获取风控状态 / Get risk status
      const status = this.dataSources.riskManager.getStatus();

      // 构建余额数据 / Build balance data
      const balanceData = {
        // 记录类型 / Record type
        type: LOG_TYPE.BALANCE,

        // 时间戳 / Timestamp
        timestamp: Date.now(),

        // 账户余额列表 / Account balance list
        balances: status.accounts || [],

        // 总权益 / Total equity
        totalEquity: status.accounts?.reduce((sum, acc) => sum + (acc.equity || 0), 0) || 0,

        // 总已用保证金 / Total used margin
        totalUsedMargin: status.accounts?.reduce((sum, acc) => sum + (acc.usedMargin || 0), 0) || 0,
      };

      // 记录到 PnL 日志 / Log to PnL log
      this.loggers.pnl.info(balanceData, 'balance_snapshot');

    } catch (error) {
      // 记录错误 / Log error
      this.logSystem('error', `余额快照记录失败: ${error.message}`);
      this.stats.errorsCount++;
    }
  }

  // ============================================
  // 交易日志方法 / Trade Logging Methods
  // ============================================

  /**
   * 记录交易
   * Log trade
   *
   * @param {Object} trade - 交易数据 / Trade data
   */
  logTrade(trade) {
    // 构建交易日志数据 / Build trade log data
    const tradeData = {
      // 记录类型 / Record type
      type: LOG_TYPE.TRADE,

      // 时间戳 / Timestamp
      timestamp: Date.now(),

      // 交易 ID / Trade ID
      tradeId: trade.id || trade.orderId,

      // 交易对 / Symbol
      symbol: trade.symbol,

      // 方向 / Side
      side: trade.side,

      // 数量 / Amount
      amount: trade.amount || trade.filled,

      // 价格 / Price
      price: trade.price || trade.average,

      // 费用 / Fee
      fee: trade.fee,

      // 交易所 / Exchange
      exchange: trade.exchange,

      // PnL (如果有) / PnL (if available)
      pnl: trade.pnl,

      // 订单类型 / Order type
      orderType: trade.type,

      // 额外信息 / Extra info
      info: trade.info,
    };

    // 记录到交易日志 / Log to trade log
    this.loggers.trade.info(tradeData, 'trade_executed');

    // 更新统计 / Update statistics
    this.stats.tradeLogsCount++;

    // 发出交易记录事件 / Emit trade logged event
    this.emit('tradeLogged', tradeData);
  }

  /**
   * 记录订单
   * Log order
   *
   * @param {string} action - 动作 / Action (created, canceled, filled, etc.)
   * @param {Object} order - 订单数据 / Order data
   */
  logOrder(action, order) {
    // 构建订单日志数据 / Build order log data
    const orderData = {
      // 记录类型 / Record type
      type: LOG_TYPE.TRADE,

      // 子类型 / Subtype
      subtype: 'order',

      // 时间戳 / Timestamp
      timestamp: Date.now(),

      // 动作 / Action
      action,

      // 订单 ID / Order ID
      orderId: order.id || order.clientOrderId,

      // 交易对 / Symbol
      symbol: order.symbol,

      // 方向 / Side
      side: order.side,

      // 数量 / Amount
      amount: order.amount,

      // 价格 / Price
      price: order.price,

      // 状态 / Status
      status: order.status,

      // 已成交数量 / Filled amount
      filled: order.filled,

      // 交易所 / Exchange
      exchange: order.exchange || order.exchangeId,
    };

    // 记录到交易日志 / Log to trade log
    this.loggers.trade.info(orderData, `order_${action}`);
  }

  // ============================================
  // 系统日志方法 / System Logging Methods
  // ============================================

  /**
   * 记录系统日志
   * Log system message
   *
   * @param {string} level - 日志级别 / Log level
   * @param {string} message - 消息 / Message
   * @param {Object} data - 额外数据 / Extra data
   */
  logSystem(level, message, data = {}) {
    // 构建系统日志数据 / Build system log data
    const logData = {
      // 记录类型 / Record type
      type: LOG_TYPE.SYSTEM,

      // 时间戳 / Timestamp
      timestamp: Date.now(),

      // 消息 / Message
      message,

      // 额外数据 / Extra data
      ...data,
    };

    // 根据级别记录 / Log based on level
    switch (level) {
      case LOG_LEVEL.TRACE:
        this.loggers.system.trace(logData);
        break;
      case LOG_LEVEL.DEBUG:
        this.loggers.system.debug(logData);
        break;
      case LOG_LEVEL.INFO:
        this.loggers.system.info(logData);
        break;
      case LOG_LEVEL.WARN:
        this.loggers.system.warn(logData);
        break;
      case LOG_LEVEL.ERROR:
        this.loggers.system.error(logData);
        break;
      case LOG_LEVEL.FATAL:
        this.loggers.system.fatal(logData);
        break;
      default:
        this.loggers.system.info(logData);
    }

    // 更新统计 / Update statistics
    this.stats.systemLogsCount++;
  }

  /**
   * 记录风控事件
   * Log risk event
   *
   * @param {string} event - 事件类型 / Event type
   * @param {Object} data - 事件数据 / Event data
   */
  logRiskEvent(event, data) {
    // 构建风控日志数据 / Build risk log data
    const riskData = {
      // 记录类型 / Record type
      type: LOG_TYPE.RISK,

      // 时间戳 / Timestamp
      timestamp: Date.now(),

      // 事件类型 / Event type
      event,

      // 事件数据 / Event data
      ...data,
    };

    // 记录到系统日志 (警告级别) / Log to system log (warn level)
    this.loggers.system.warn(riskData, `risk_${event}`);

    // 发出风控事件 / Emit risk event
    this.emit('riskEventLogged', riskData);
  }

  // ============================================
  // Grafana 兼容方法 / Grafana Compatibility Methods
  // ============================================

  /**
   * 记录指标 (Grafana 兼容格式)
   * Log metric (Grafana-compatible format)
   *
   * @param {string} name - 指标名称 / Metric name
   * @param {number} value - 指标值 / Metric value
   * @param {Object} labels - 标签 / Labels
   */
  logMetric(name, value, labels = {}) {
    // 如果未启用 Grafana 兼容模式，跳过 / If Grafana mode not enabled, skip
    if (!this.config.grafanaCompatible) {
      return;
    }

    // 构建指标数据 / Build metric data
    const metricData = {
      // 记录类型 / Record type
      type: LOG_TYPE.METRIC,

      // 时间戳 (纳秒，Grafana Loki 格式) / Timestamp (nanoseconds, Grafana Loki format)
      timestamp: Date.now() * 1000000,

      // 指标名称 / Metric name
      metric: name,

      // 指标值 / Metric value
      value,

      // 合并标签 / Merged labels
      labels: {
        ...this.config.metricLabels,
        ...labels,
      },
    };

    // 记录到 PnL 日志 / Log to PnL log
    this.loggers.pnl.info(metricData, 'metric');
  }

  /**
   * 批量记录指标
   * Log multiple metrics
   *
   * @param {Array} metrics - 指标数组 / Metrics array
   */
  logMetrics(metrics) {
    // 遍历记录每个指标 / Log each metric
    metrics.forEach(({ name, value, labels }) => {
      this.logMetric(name, value, labels);
    });
  }

  // ============================================
  // 日志轮转方法 / Log Rotation Methods
  // ============================================

  /**
   * 检查日志轮转
   * Check log rotation
   * @private
   */
  _checkLogRotation() {
    // 如果未启用日期轮转，跳过 / If date rotation not enabled, skip
    if (!this.config.rotateByDate) {
      return;
    }

    // 获取当前日期 / Get current date
    const today = getDateString();

    // 如果日期没变，跳过 / If date hasn't changed, skip
    if (today === this.currentDate) {
      return;
    }

    // 更新当前日期 / Update current date
    this.currentDate = today;

    // 记录轮转日志 / Log rotation
    this.logSystem('info', `日志轮转: ${today} / Log rotation: ${today}`);

    // 关闭旧流 / Close old streams
    Object.values(this.streams).forEach(stream => {
      if (stream) {
        stream.end();
      }
    });

    // 重新初始化日志记录器 / Re-initialize loggers
    this._initLoggers();

    // 清理旧日志文件 / Clean up old log files
    this._cleanupOldLogs();
  }

  /**
   * 清理旧日志文件
   * Clean up old log files
   * @private
   */
  _cleanupOldLogs() {
    // 计算截止日期 / Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxRetentionDays);

    // 遍历所有日志目录 / Iterate all log directories
    const dirs = [this.config.pnlDir, this.config.tradeDir, this.config.systemDir];

    dirs.forEach(subDir => {
      // 获取目录路径 / Get directory path
      const dirPath = path.join(this.config.logDir, subDir);

      // 如果目录不存在，跳过 / If directory doesn't exist, skip
      if (!fs.existsSync(dirPath)) {
        return;
      }

      // 读取目录内容 / Read directory contents
      const files = fs.readdirSync(dirPath);

      // 遍历文件 / Iterate files
      files.forEach(file => {
        // 获取文件完整路径 / Get full file path
        const filePath = path.join(dirPath, file);

        // 获取文件状态 / Get file stats
        const stats = fs.statSync(filePath);

        // 如果文件超过保留期限，删除 / If file exceeds retention, delete
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          this.logSystem('info', `已删除旧日志: ${file} / Deleted old log: ${file}`);
        }
      });
    });
  }

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() {
    return {
      // 日志计数 / Log counts
      ...this.stats,

      // 是否运行中 / Whether running
      running: this.running,

      // 当前日期 / Current date
      currentDate: this.currentDate,

      // 日志目录 / Log directory
      logDir: this.config.logDir,
    };
  }

  /**
   * 获取最新日志文件路径
   * Get latest log file paths
   *
   * @returns {Object} 日志文件路径 / Log file paths
   */
  getLogFilePaths() {
    return {
      pnl: this._getLogFilePath('pnl'),
      trade: this._getLogFilePath('trade'),
      system: this._getLogFilePath('system'),
    };
  }
}

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export {
  LOG_LEVEL,
  LOG_TYPE,
  DEFAULT_CONFIG,
};

// 默认导出 / Default export
export default PnLLogger;
