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
import pino from 'pino'; // 导入模块 pino

// 导入文件系统模块 / Import file system module
import fs from 'fs'; // 导入模块 fs

// 导入路径模块 / Import path module
import path from 'path'; // 导入模块 path

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 日志级别
 * Log levels
 */
const LOG_LEVEL = { // 定义常量 LOG_LEVEL
  TRACE: 'trace',   // 追踪 / Trace
  DEBUG: 'debug',   // 调试 / Debug
  INFO: 'info',     // 信息 / Info
  WARN: 'warn',     // 警告 / Warning
  ERROR: 'error',   // 错误 / Error
  FATAL: 'fatal',   // 致命 / Fatal
}; // 结束代码块

/**
 * 日志类型
 * Log types
 */
const LOG_TYPE = { // 定义常量 LOG_TYPE
  PNL: 'pnl',               // PnL 日志 / PnL log
  TRADE: 'trade',           // 交易日志 / Trade log
  POSITION: 'position',     // 持仓日志 / Position log
  BALANCE: 'balance',       // 余额权限
  SIGNAL: 'signal',         // 信号日志 / Signal log
  RISK: 'risk',             // 风控日志 / Risk log
  SYSTEM: 'system',         // 系统日志 / System log
  METRIC: 'metric',         // 指标日志 / Metric log
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 日志目录配置 / Log Directory Configuration
  // ============================================

  // 日志根目录 / Log root directory
  logDir: './logs', // 日志Dir

  // PnL 日志子目录 / PnL log subdirectory
  pnlDir: 'pnl', // PnL 日志子目录

  // 交易日志子目录 / Trade log subdirectory
  tradeDir: 'trades', // 交易Dir

  // 系统日志子目录 / System log subdirectory
  systemDir: 'system', // 系统Dir

  // ============================================
  // 日志文件配置 / Log File Configuration
  // ============================================

  // PnL 日志文件前缀 / PnL log file prefix
  pnlFilePrefix: 'pnl', // PnL 日志文件前缀

  // 交易日志文件前缀 / Trade log file prefix
  tradeFilePrefix: 'trades', // 交易日志文件前缀

  // 系统日志文件前缀 / System log file prefix
  systemFilePrefix: 'system', // 系统日志文件前缀

  // 日志文件扩展名 / Log file extension
  fileExtension: '.log', // 文件Extension

  // ============================================
  // 日志轮转配置 / Log Rotation Configuration
  // ============================================

  // 是否按日期轮转 / Rotate by date
  rotateByDate: true, // rotateByDate

  // 日期格式 / Date format (YYYY-MM-DD)
  dateFormat: 'YYYY-MM-DD', // date格式

  // 最大保留天数 / Max retention days
  maxRetentionDays: 30, // 最大保留天数

  // 最大单文件大小 (字节) / Max single file size (bytes)
  maxFileSize: 100 * 1024 * 1024,  // 最大单文件大小 (字节)

  // ============================================
  // 日志格式配置 / Log Format Configuration
  // ============================================

  // 日志级别 / Log level
  level: LOG_LEVEL.INFO, // 级别

  // 是否美化输出 (开发环境) / Pretty print (development)
  prettyPrint: false, // 是否美化输出 (开发环境)

  // 时间戳格式 / Timestamp format
  timestampFormat: 'iso',  // 时间戳格式

  // 是否包含堆栈跟踪 / Include stack trace
  includeStackTrace: true, // 是否包含堆栈跟踪

  // ============================================
  // 实时记录配置 / Real-time Logging Configuration
  // ============================================

  // PnL 记录间隔 (毫秒) / PnL logging interval (ms)
  pnlInterval: 600000,  // 10分钟 / 10 minutes

  // 持仓记录间隔 (毫秒) / Position logging interval (ms)
  positionInterval: 5000,  // 5秒 / 5 seconds

  // 余额记录间隔 (毫秒) / Balance logging interval (ms)
  balanceInterval: 60000,  // 1分钟 / 1 minute

  // ============================================
  // Grafana 兼容配置 / Grafana Compatibility Configuration
  // ============================================

  // 是否启用 Grafana 兼容模式 / Enable Grafana-compatible mode
  grafanaCompatible: true, // 是否启用 Grafana 兼容模式

  // 指标标签 / Metric labels
  metricLabels: { // 指标Labels
    app: 'quant-trading-system',  // 应用名称 / Application name
    env: 'production',             // 环境 / Environment
  }, // 结束代码块
}; // 结束代码块

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
function getDateString(format = 'YYYY-MM-DD') { // 定义函数 getDateString
  // 获取当前时间 / Get current time
  const now = new Date(); // 定义常量 now

  // 提取年月日 / Extract year, month, day
  const year = now.getFullYear();                              // 年 / Year
  const month = String(now.getMonth() + 1).padStart(2, '0');   // 月 / Month
  const day = String(now.getDate()).padStart(2, '0');          // 日 / Day

  // 根据格式返回 / Return based on format
  if (format === 'YYYY-MM-DD') { // 条件判断 format === 'YYYY-MM-DD'
    return `${year}-${month}-${day}`; // 返回结果
  } // 结束代码块

  // 默认返回完整格式 / Default return full format
  return `${year}-${month}-${day}`; // 返回结果
} // 结束代码块

/**
 * 确保目录存在
 * Ensure directory exists
 *
 * @param {string} dirPath - 目录路径 / Directory path
 */
function ensureDirectoryExists(dirPath) { // 定义函数 ensureDirectoryExists
  // 如果目录不存在，创建它 / If directory doesn't exist, create it
  if (!fs.existsSync(dirPath)) { // 条件判断 !fs.existsSync(dirPath)
    // 递归创建目录 / Create directory recursively
    fs.mkdirSync(dirPath, { recursive: true }); // 调用 fs.mkdirSync
  } // 结束代码块
} // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * PnL 日志记录器
 * PnL Logger
 */
export class PnLLogger extends EventEmitter { // 导出类 PnLLogger
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 日志记录器实例 / Logger instances
    this.loggers = { // 设置 loggers
      pnl: null,       // PnL 日志器 / PnL logger
      trade: null,     // 交易日志器 / Trade logger
      system: null,    // 系统日志器 / System logger
    }; // 结束代码块

    // 日志文件流 / Log file streams
    this.streams = { // 设置 streams
      pnl: null,       // PnL 文件流 / PnL file stream
      trade: null,     // 交易文件流 / Trade file stream
      system: null,    // 系统文件流 / System file stream
    }; // 结束代码块

    // 当前日期 (用于日志轮转) / Current date (for log rotation)
    this.currentDate = getDateString(); // 设置 currentDate

    // 定时器引用 / Timer references
    this.timers = { // 设置 timers
      pnl: null,        // PnL 记录定时器 / PnL logging timer
      position: null,   // 持仓记录定时器 / Position logging timer
      balance: null,    // 余额记录定时器 / Balance logging timer
      rotation: null,   // 日志轮转检查定时器 / Log rotation check timer
    }; // 结束代码块

    // 数据源引用 (由外部设置) / Data source references (set externally)
    this.dataSources = { // 设置 dataSources
      riskManager: null,    // 风控管理器 / Risk manager
      positionManager: null, // 仓位管理器 / Position manager
      accountManager: null,  // 账户管理器 / Account manager
    }; // 结束代码块

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      pnlLogsCount: 0,      // PnL 日志计数 / PnL log count
      tradeLogsCount: 0,    // 交易日志计数 / Trade log count
      systemLogsCount: 0,   // 系统日志计数 / System log count
      errorsCount: 0,       // 错误计数 / Error count
    }; // 结束代码块

    // 是否正在运行 / Whether running
    this.running = false; // 设置 running

    // 初始化日志目录 / Initialize log directories
    this._initDirectories(); // 调用 _initDirectories

    // 初始化日志记录器 / Initialize loggers
    this._initLoggers(); // 调用 _initLoggers
  } // 结束代码块

  // ============================================
  // 初始化方法 / Initialization Methods
  // ============================================

  /**
   * 初始化日志目录
   * Initialize log directories
   * @private
   */
  _initDirectories() { // 调用 _initDirectories
    // 获取日志根目录 / Get log root directory
    const logDir = this.config.logDir; // 定义常量 logDir

    // 确保根目录存在 / Ensure root directory exists
    ensureDirectoryExists(logDir); // 调用 ensureDirectoryExists

    // 确保 PnL 目录存在 / Ensure PnL directory exists
    ensureDirectoryExists(path.join(logDir, this.config.pnlDir)); // 调用 ensureDirectoryExists

    // 确保交易目录存在 / Ensure trade directory exists
    ensureDirectoryExists(path.join(logDir, this.config.tradeDir)); // 调用 ensureDirectoryExists

    // 确保系统目录存在 / Ensure system directory exists
    ensureDirectoryExists(path.join(logDir, this.config.systemDir)); // 调用 ensureDirectoryExists
  } // 结束代码块

  /**
   * 初始化日志记录器
   * Initialize loggers
   * @private
   */
  _initLoggers() { // 调用 _initLoggers
    // 创建 PnL 日志器 / Create PnL logger
    this.loggers.pnl = this._createLogger('pnl'); // 访问 loggers

    // 创建交易日志器 / Create trade logger
    this.loggers.trade = this._createLogger('trade'); // 访问 loggers

    // 创建系统日志器 / Create system logger
    this.loggers.system = this._createLogger('system'); // 访问 loggers
  } // 结束代码块

  /**
   * 创建日志记录器
   * Create logger
   *
   * @param {string} type - 日志类型 / Log type
   * @returns {Object} pino 日志器实例 / pino logger instance
   * @private
   */
  _createLogger(type) { // 调用 _createLogger
    // 获取日志文件路径 / Get log file path
    const filePath = this._getLogFilePath(type); // 定义常量 filePath

    // 创建文件写入流 / Create file write stream
    const stream = fs.createWriteStream(filePath, { // 定义常量 stream
      flags: 'a',  // 追加模式 / Append mode
    }); // 结束代码块

    // 保存流引用 / Save stream reference
    this.streams[type] = stream; // 访问 streams

    // pino 配置选项 / pino configuration options
    const pinoOptions = { // 定义常量 pinoOptions
      // 日志级别 / Log level
      level: this.config.level, // 级别

      // 消息字段名 (统一为 message) / Message key (unified as message)
      messageKey: 'message', // 消息字段名 (统一为 message)

      // 基础字段 / Base fields
      base: { // base
        // 日志类型 / Log type
        logType: type, // 日志类型

        // 应用名称 / Application name
        app: this.config.metricLabels.app, // app

        // 环境 / Environment
        env: this.config.metricLabels.env, // env
      }, // 结束代码块

      // 时间戳配置 / Timestamp configuration
      timestamp: () => { // 时间戳
        // 根据配置格式化时间戳 / Format timestamp based on config
        if (this.config.timestampFormat === 'iso') { // 条件判断 this.config.timestampFormat === 'iso'
          return `,"time":"${new Date().toISOString()}"`; // 返回结果
        } else if (this.config.timestampFormat === 'epoch') { // 执行语句
          return `,"time":${Date.now()}`; // 返回结果
        } else { // 执行语句
          return `,"time":${Math.floor(Date.now() / 1000)}`; // 返回结果
        } // 结束代码块
      }, // 结束代码块

      // 格式化器 / Formatters
      formatters: { // formatters
        // 级别格式化 / Level formatter
        level: (label) => { // 级别
          return { level: label }; // 返回结果
        }, // 结束代码块
      }, // 结束代码块
    }; // 结束代码块

    // 如果启用美化输出 / If pretty print enabled
    if (this.config.prettyPrint) { // 条件判断 this.config.prettyPrint
      // 创建带美化的日志器 / Create logger with pretty print
      return pino({ // 返回结果
        ...pinoOptions, // 展开对象或数组
        transport: { // transport
          target: 'pino-pretty', // target
          options: { // options
            colorize: true,            // 颜色输出 / Colorize output
            translateTime: 'SYS:standard',  // 时间格式 / Time format
          }, // 结束代码块
        }, // 结束代码块
      }); // 结束代码块
    } // 结束代码块

    // 创建多目标日志器 / Create multi-destination logger
    // 只写入文件，控制台输出由 main.js 的 _log 方法处理，避免重复
    // Only write to file, console output handled by main.js _log method to avoid duplication
    const multiStream = pino.multistream([ // 定义常量 multiStream
      // 文件流 / File stream
      { stream: stream }, // 执行语句
    ]); // 结束数组或索引

    // 返回 pino 日志器 / Return pino logger
    return pino(pinoOptions, multiStream); // 返回结果
  } // 结束代码块

  /**
   * 获取日志文件路径
   * Get log file path
   *
   * @param {string} type - 日志类型 / Log type
   * @returns {string} 文件路径 / File path
   * @private
   */
  _getLogFilePath(type) { // 调用 _getLogFilePath
    // 获取子目录 / Get subdirectory
    let subDir; // 定义变量 subDir
    let prefix; // 定义变量 prefix

    // 根据类型选择目录和前缀 / Choose directory and prefix based on type
    switch (type) { // 分支选择 type
      case 'pnl': // 分支 'pnl'
        subDir = this.config.pnlDir; // 赋值 subDir
        prefix = this.config.pnlFilePrefix; // 赋值 prefix
        break; // 跳出循环或分支
      case 'trade': // 分支 'trade'
        subDir = this.config.tradeDir; // 赋值 subDir
        prefix = this.config.tradeFilePrefix; // 赋值 prefix
        break; // 跳出循环或分支
      case 'system': // 分支 'system'
      default: // 默认
        subDir = this.config.systemDir; // 赋值 subDir
        prefix = this.config.systemFilePrefix; // 赋值 prefix
        break; // 跳出循环或分支
    } // 结束代码块

    // 获取日期字符串 / Get date string
    const dateStr = this.config.rotateByDate ? `-${this.currentDate}` : ''; // 定义常量 dateStr

    // 构建文件名 / Build filename
    const filename = `${prefix}${dateStr}${this.config.fileExtension}`; // 定义常量 filename

    // 返回完整路径 / Return full path
    return path.join(this.config.logDir, subDir, filename); // 返回结果
  } // 结束代码块

  // ============================================
  // 生命周期方法 / Lifecycle Methods
  // ============================================

  /**
   * 设置数据源
   * Set data sources
   *
   * @param {Object} sources - 数据源对象 / Data sources object
   */
  setDataSources(sources) { // 调用 setDataSources
    // 设置风控管理器 / Set risk manager
    if (sources.riskManager) { // 条件判断 sources.riskManager
      this.dataSources.riskManager = sources.riskManager; // 访问 dataSources
    } // 结束代码块

    // 设置仓位管理器 / Set position manager
    if (sources.positionManager) { // 条件判断 sources.positionManager
      this.dataSources.positionManager = sources.positionManager; // 访问 dataSources
    } // 结束代码块

    // 设置账户管理器 / Set account manager
    if (sources.accountManager) { // 条件判断 sources.accountManager
      this.dataSources.accountManager = sources.accountManager; // 访问 dataSources
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动日志记录
   * Start logging
   */
  start() { // 调用 start
    // 标记为运行中 / Mark as running
    this.running = true; // 设置 running

    // 启动 PnL 定时记录 / Start PnL scheduled logging
    this.timers.pnl = setInterval( // 访问 timers
      () => this._logPnLSnapshot(), // 定义箭头函数
      this.config.pnlInterval // 访问 config
    ); // 结束调用或参数

    // 启动持仓定时记录 / Start position scheduled logging
    this.timers.position = setInterval( // 访问 timers
      () => this._logPositionSnapshot(), // 定义箭头函数
      this.config.positionInterval // 访问 config
    ); // 结束调用或参数

    // 启动余额定时记录 / Start balance scheduled logging
    this.timers.balance = setInterval( // 访问 timers
      () => this._logBalanceSnapshot(), // 定义箭头函数
      this.config.balanceInterval // 访问 config
    ); // 结束调用或参数

    // 启动日志轮转检查 (每分钟) / Start log rotation check (every minute)
    this.timers.rotation = setInterval( // 访问 timers
      () => this._checkLogRotation(), // 定义箭头函数
      60000 // 执行语句
    ); // 结束调用或参数

    // 记录启动日志 / Log startup
    this.logSystem('info', '日志记录器已启动 / Logger started'); // 调用 logSystem

    // 发出启动事件 / Emit start event
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止日志记录
   * Stop logging
   */
  stop() { // 调用 stop
    // 标记为停止 / Mark as stopped
    this.running = false; // 设置 running

    // 清除所有定时器 / Clear all timers
    Object.values(this.timers).forEach(timer => { // 调用 Object.values
      if (timer) { // 条件判断 timer
        clearInterval(timer); // 调用 clearInterval
      } // 结束代码块
    }); // 结束代码块

    // 重置定时器引用 / Reset timer references
    this.timers = { // 设置 timers
      pnl: null, // 盈亏
      position: null, // 持仓
      balance: null, // 余额
      rotation: null, // rotation
    }; // 结束代码块

    // 记录停止日志 / Log shutdown
    this.logSystem('info', '日志记录器已停止 / Logger stopped'); // 调用 logSystem

    // 关闭文件流 / Close file streams
    Object.values(this.streams).forEach(stream => { // 调用 Object.values
      if (stream) { // 条件判断 stream
        stream.end(); // 调用 stream.end
      } // 结束代码块
    }); // 结束代码块

    // 发出停止事件 / Emit stop event
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // PnL 日志方法 / PnL Logging Methods
  // ============================================

  /**
   * 记录 PnL 快照
   * Log PnL snapshot
   * @private
   */
  _logPnLSnapshot() { // 调用 _logPnLSnapshot
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.dataSources.riskManager) { // 条件判断 !this.dataSources.riskManager
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 获取风控状态 / Get risk status
      const status = this.dataSources.riskManager.getStatus(); // 定义常量 status

      // 构建 PnL 数据 / Build PnL data
      const pnlData = { // 定义常量 pnlData
        // 记录类型 / Record type
        type: LOG_TYPE.PNL, // 类型记录类型

        // 时间戳 (毫秒) / Timestamp (ms)
        timestamp: Date.now(), // 时间戳 (毫秒)

        // 每日权益 / Daily equity
        dailyEquity: status.dailyEquity, // 每日Equity

        // 当前回撤 / Current drawdown
        drawdown: status.dailyEquity?.currentDrawdown || 0, // 回撤

        // 风险级别 / Risk level
        riskLevel: status.riskLevel, // 风险级别

        // 交易状态 / Trading status
        tradingAllowed: status.tradingAllowed, // 交易Allowed交易状态

        // 账户数据 / Account data
        accounts: status.accounts?.map(acc => ({ // accounts
          exchange: acc.exchange,           // 交易所 / Exchange
          equity: acc.equity,               // 权益 / Equity
          usedMargin: acc.usedMargin,       // 已用保证金 / Used margin
          available: acc.available,         // 可用余额 / Available balance
        })) || [], // 执行语句
      }; // 结束代码块

      // 记录到 PnL 日志 / Log to PnL log
      this.loggers.pnl.info(pnlData, 'pnl_snapshot'); // 访问 loggers

      // 更新统计 / Update statistics
      this.stats.pnlLogsCount++; // 访问 stats

      // 发出 PnL 记录事件 / Emit PnL logged event
      this.emit('pnlLogged', pnlData); // 调用 emit

    } catch (error) { // 执行语句
      // 记录错误 / Log error
      this.logSystem('error', `PnL 快照记录失败: ${error.message}`); // 调用 logSystem
      this.stats.errorsCount++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录实时 PnL
   * Log real-time PnL
   *
   * @param {Object} pnlData - PnL 数据 / PnL data
   */
  logPnL(pnlData) { // 调用 logPnL
    // 添加类型和时间戳 / Add type and timestamp
    const logData = { // 定义常量 logData
      type: LOG_TYPE.PNL, // 类型
      timestamp: Date.now(), // 时间戳
      ...pnlData, // 展开对象或数组
    }; // 结束代码块

    // 记录到 PnL 日志 / Log to PnL log
    this.loggers.pnl.info(logData, 'pnl_update'); // 访问 loggers

    // 更新统计 / Update statistics
    this.stats.pnlLogsCount++; // 访问 stats
  } // 结束代码块

  /**
   * 记录持仓快照
   * Log position snapshot
   * @private
   */
  _logPositionSnapshot() { // 调用 _logPositionSnapshot
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 如果没有仓位管理器，跳过 / If no position manager, skip
    if (!this.dataSources.positionManager) { // 条件判断 !this.dataSources.positionManager
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 获取所有活跃仓位 / Get all active positions
      const positions = this.dataSources.positionManager.getActivePositions // 定义常量 positions
        ? this.dataSources.positionManager.getActivePositions() // 执行语句
        : []; // 执行语句

      // 构建持仓数据 / Build position data
      const positionData = { // 定义常量 positionData
        // 记录类型 / Record type
        type: LOG_TYPE.POSITION, // 类型记录类型

        // 时间戳 / Timestamp
        timestamp: Date.now(), // 时间戳

        // 仓位数量 / Position count
        count: positions.length, // 仓位数量

        // 仓位列表 / Position list
        positions: positions.map(pos => ({ // 仓位列表
          symbol: pos.symbol,           // 交易对 / Symbol
          side: pos.side,               // 方向 / Side
          size: pos.openSize,           // 大小 / Size
          entryPrice: pos.openPrice,    // 开仓价 / Entry price
          unrealizedPnl: pos.unrealizedPnl || 0,  // 未实现盈亏 / Unrealized PnL
        })), // 结束代码块
      }; // 结束代码块

      // 记录到 PnL 日志 / Log to PnL log
      this.loggers.pnl.info(positionData, 'position_snapshot'); // 访问 loggers

    } catch (error) { // 执行语句
      // 记录错误 / Log error
      this.logSystem('error', `持仓快照记录失败: ${error.message}`); // 调用 logSystem
      this.stats.errorsCount++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录余额快照
   * Log balance snapshot
   * @private
   */
  _logBalanceSnapshot() { // 调用 _logBalanceSnapshot
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.dataSources.riskManager) { // 条件判断 !this.dataSources.riskManager
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 获取风控状态 / Get risk status
      const status = this.dataSources.riskManager.getStatus(); // 定义常量 status

      // 构建余额数据 / Build balance data
      const balanceData = { // 定义常量 balanceData
        // 记录类型 / Record type
        type: LOG_TYPE.BALANCE, // 类型记录类型

        // 时间戳 / Timestamp
        timestamp: Date.now(), // 时间戳

        // 账户余额列表 / Account balance list
        balances: status.accounts || [], // 账户余额列表

        // 总权益 / Total equity
        totalEquity: status.accounts?.reduce((sum, acc) => sum + (acc.equity || 0), 0) || 0, // 总Equity

        // 总已用保证金 / Total used margin
        totalUsedMargin: status.accounts?.reduce((sum, acc) => sum + (acc.usedMargin || 0), 0) || 0, // 总Used保证金
      }; // 结束代码块

      // 记录到 PnL 日志 / Log to PnL log
      this.loggers.pnl.info(balanceData, 'balance_snapshot'); // 访问 loggers

    } catch (error) { // 执行语句
      // 记录错误 / Log error
      this.logSystem('error', `余额快照记录失败: ${error.message}`); // 调用 logSystem
      this.stats.errorsCount++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 交易日志方法 / Trade Logging Methods
  // ============================================

  /**
   * 记录交易
   * Log trade
   *
   * @param {Object} trade - 交易数据 / Trade data
   */
  logTrade(trade) { // 调用 logTrade
    // 构建交易日志数据 / Build trade log data
    const tradeData = { // 定义常量 tradeData
      // 记录类型 / Record type
      type: LOG_TYPE.TRADE, // 类型记录类型

      // 时间戳 / Timestamp
      timestamp: Date.now(), // 时间戳

      // 交易 ID / Trade ID
      tradeId: trade.id || trade.orderId, // 交易ID

      // 交易对 / Symbol
      symbol: trade.symbol, // 交易对

      // 方向 / Side
      side: trade.side, // 方向

      // 数量 / Amount
      amount: trade.amount || trade.filled, // 数量

      // 价格 / Price
      price: trade.price || trade.average, // 价格

      // 费用 / Fee
      fee: trade.fee, // 手续费

      // 交易所 / Exchange
      exchange: trade.exchange, // 交易所

      // PnL (如果有) / PnL (if available)
      pnl: trade.pnl, // PnL (如果有)

      // 订单类型 / Order type
      orderType: trade.type, // 订单类型

      // 额外信息 / Extra info
      info: trade.info, // info
    }; // 结束代码块

    // 记录到交易日志 / Log to trade log
    this.loggers.trade.info(tradeData, 'trade_executed'); // 访问 loggers

    // 更新统计 / Update statistics
    this.stats.tradeLogsCount++; // 访问 stats

    // 发出交易记录事件 / Emit trade logged event
    this.emit('tradeLogged', tradeData); // 调用 emit
  } // 结束代码块

  /**
   * 记录订单
   * Log order
   *
   * @param {string} action - 动作 / Action (created, canceled, filled, etc.)
   * @param {Object} order - 订单数据 / Order data
   */
  logOrder(action, order) { // 调用 logOrder
    // 构建订单日志数据 / Build order log data
    const orderData = { // 定义常量 orderData
      // 记录类型 / Record type
      type: LOG_TYPE.TRADE, // 类型记录类型

      // 子类型 / Subtype
      subtype: 'order', // subtype子类型

      // 时间戳 / Timestamp
      timestamp: Date.now(), // 时间戳

      // 动作 / Action
      action, // 执行语句

      // 订单 ID / Order ID
      orderId: order.id || order.clientOrderId, // 订单ID

      // 交易对 / Symbol
      symbol: order.symbol, // 交易对

      // 方向 / Side
      side: order.side, // 方向

      // 数量 / Amount
      amount: order.amount, // 数量

      // 价格 / Price
      price: order.price, // 价格

      // 状态 / Status
      status: order.status, // 状态

      // 已成交数量 / Filled amount
      filled: order.filled, // 已成交数量

      // 交易所 / Exchange
      exchange: order.exchange || order.exchangeId, // 交易所
    }; // 结束代码块

    // 记录到交易日志 / Log to trade log
    this.loggers.trade.info(orderData, `order_${action}`); // 访问 loggers
  } // 结束代码块

  // ============================================
  // 信号日志方法 / Signal Logging Methods
  // ============================================

  /**
   * 记录策略信号
   * Log strategy signal
   *
   * @param {Object} signal - 信号数据 / Signal data
   */
  logSignal(signal) { // 调用 logSignal
    // 构建信号日志数据 / Build signal log data
    const signalData = { // 定义常量 signalData
      // 记录类型 / Record type
      type: LOG_TYPE.SIGNAL, // 类型记录类型

      // 时间戳 / Timestamp
      timestamp: Date.now(), // 时间戳

      // 策略名称 / Strategy name
      strategy: signal.strategy || 'unknown', // 策略

      // 交易对 / Symbol
      symbol: signal.symbol, // 交易对

      // 信号类型 (buy/sell/hold) / Signal type
      signalType: signal.type || signal.side, // 信号类型 (buy/sell/hold)

      // 信号强度 (可选) / Signal strength (optional)
      strength: signal.strength, // 信号强度 (可选)

      // 信号原因 / Signal reason
      reason: signal.reason, // reason

      // 当前价格 / Current price
      price: signal.price, // 价格

      // 建议数量 / Suggested amount
      amount: signal.amount, // 建议数量

      // 指标数据 (可选) / Indicator data (optional)
      indicators: signal.indicators, // 指标数据 (可选)

      // 额外信息 / Extra info
      extra: signal.extra, // extra
    }; // 结束代码块

    // 记录到交易日志 / Log to trade log
    this.loggers.trade.info(signalData, 'strategy_signal'); // 访问 loggers

    // 发出信号记录事件 / Emit signal logged event
    this.emit('signalLogged', signalData); // 调用 emit
  } // 结束代码块

  // ============================================
  // 行情数据日志方法 / Market Data Logging Methods
  // ============================================

  /**
   * 记录行情数据快照
   * Log market data snapshot
   *
   * @param {Object} data - 行情数据 / Market data
   */
  logMarketData(data) { // 调用 logMarketData
    // 构建行情日志数据 / Build market data log
    const marketData = { // 定义常量 marketData
      // 记录类型 / Record type
      type: 'market_data', // 类型记录类型

      // 时间戳 / Timestamp
      timestamp: Date.now(), // 时间戳

      // 交易对 / Symbol
      symbol: data.symbol, // 交易对

      // 数据类型 (ticker/candle/orderbook/fundingRate) / Data type
      dataType: data.dataType, // 数据类型 (ticker/candle/orderbook/fundingRate)

      // 交易所 / Exchange
      exchange: data.exchange, // 交易所

      // 价格信息 / Price info
      price: data.price || data.close || data.last, // 价格

      // 成交量 (如果有) / Volume (if available)
      volume: data.volume, // 成交量 (如果有)

      // 买卖价 (如果有) / Bid/Ask (if available)
      bid: data.bid, // 买卖价 (如果有)
      ask: data.ask, // ask

      // K 线数据 (如果有) / Candle data (if available)
      open: data.open, // K 线数据 (如果有)
      high: data.high, // 最高
      low: data.low, // 最低
      close: data.close, // 收盘

      // 资金费率 (如果有) / Funding rate (if available)
      fundingRate: data.fundingRate, // 资金费率 (如果有)

      // 额外信息 / Extra info
      extra: data.extra, // extra
    }; // 结束代码块

    // 记录到系统日志 / Log to system log
    this.loggers.system.info(marketData, 'market_data_update'); // 访问 loggers
  } // 结束代码块

  /**
   * 记录行情统计摘要
   * Log market data statistics summary
   *
   * @param {Object} stats - 统计数据 / Statistics data
   */
  logMarketDataStats(stats) { // 调用 logMarketDataStats
    // 构建统计日志数据 / Build stats log data
    const statsData = { // 定义常量 statsData
      // 记录类型 / Record type
      type: 'market_stats', // 类型记录类型

      // 时间戳 / Timestamp
      timestamp: Date.now(), // 时间戳

      // 统计时间范围 / Stats time range
      period: stats.period || '1m', // 周期

      // Ticker 更新计数 / Ticker update count
      tickerCount: stats.tickerCount || 0, // Ticker 更新计数

      // K 线更新计数 / Candle update count
      candleCount: stats.candleCount || 0, // candle数量

      // 订单簿更新计数 / Orderbook update count
      orderbookCount: stats.orderbookCount || 0, // orderbook数量

      // 资金费率更新计数 / Funding rate update count
      fundingRateCount: stats.fundingRateCount || 0, // 资金费率更新计数

      // 交易对列表 / Symbol list
      symbols: stats.symbols || [], // 交易对列表

      // 交易所列表 / Exchange list
      exchanges: stats.exchanges || [], // 交易所列表
    }; // 结束代码块

    // 记录到系统日志 / Log to system log
    this.loggers.system.info(statsData, 'market_data_stats'); // 访问 loggers
  } // 结束代码块

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
  logSystem(level, message, data = {}) { // 调用 logSystem
    // 构建系统日志数据 / Build system log data
    const logData = { // 定义常量 logData
      // 记录类型 / Record type
      type: LOG_TYPE.SYSTEM, // 类型记录类型

      // 时间戳 / Timestamp
      timestamp: Date.now(), // 时间戳

      // 消息 / Message
      message, // 执行语句

      // 额外数据 / Extra data
      ...data, // 展开对象或数组
    }; // 结束代码块

    // 根据级别记录 / Log based on level
    switch (level) { // 分支选择 level
      case LOG_LEVEL.TRACE: // 分支 LOG_LEVEL.TRACE
        this.loggers.system.trace(logData); // 访问 loggers
        break; // 跳出循环或分支
      case LOG_LEVEL.DEBUG: // 分支 LOG_LEVEL.DEBUG
        this.loggers.system.debug(logData); // 访问 loggers
        break; // 跳出循环或分支
      case LOG_LEVEL.INFO: // 分支 LOG_LEVEL.INFO
        this.loggers.system.info(logData); // 访问 loggers
        break; // 跳出循环或分支
      case LOG_LEVEL.WARN: // 分支 LOG_LEVEL.WARN
        this.loggers.system.warn(logData); // 访问 loggers
        break; // 跳出循环或分支
      case LOG_LEVEL.ERROR: // 分支 LOG_LEVEL.ERROR
        this.loggers.system.error(logData); // 访问 loggers
        break; // 跳出循环或分支
      case LOG_LEVEL.FATAL: // 分支 LOG_LEVEL.FATAL
        this.loggers.system.fatal(logData); // 访问 loggers
        break; // 跳出循环或分支
      default: // 默认
        this.loggers.system.info(logData); // 访问 loggers
    } // 结束代码块

    // 更新统计 / Update statistics
    this.stats.systemLogsCount++; // 访问 stats
  } // 结束代码块

  /**
   * 记录风控事件
   * Log risk event
   *
   * @param {string} event - 事件类型 / Event type
   * @param {Object} data - 事件数据 / Event data
   */
  logRiskEvent(event, data) { // 调用 logRiskEvent
    // 构建风控日志数据 / Build risk log data
    const riskData = { // 定义常量 riskData
      // 记录类型 / Record type
      type: LOG_TYPE.RISK, // 类型记录类型

      // 时间戳 / Timestamp
      timestamp: Date.now(), // 时间戳

      // 事件类型 / Event type
      event, // 执行语句

      // 事件数据 / Event data
      ...data, // 展开对象或数组
    }; // 结束代码块

    // 记录到系统日志 (警告级别) / Log to system log (warn level)
    this.loggers.system.warn(riskData, `risk_${event}`); // 访问 loggers

    // 发出风控事件 / Emit risk event
    this.emit('riskEventLogged', riskData); // 调用 emit
  } // 结束代码块

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
  logMetric(name, value, labels = {}) { // 调用 logMetric
    // 如果未启用 Grafana 兼容模式，跳过 / If Grafana mode not enabled, skip
    if (!this.config.grafanaCompatible) { // 条件判断 !this.config.grafanaCompatible
      return; // 返回结果
    } // 结束代码块

    // 构建指标数据 / Build metric data
    const metricData = { // 定义常量 metricData
      // 记录类型 / Record type
      type: LOG_TYPE.METRIC, // 类型记录类型

      // 时间戳 (纳秒，Grafana Loki 格式) / Timestamp (nanoseconds, Grafana Loki format)
      timestamp: Date.now() * 1000000, // 时间戳 (纳秒，Grafana Loki 格式)

      // 指标名称 / Metric name
      metric: name, // 指标

      // 指标值 / Metric value
      value, // 执行语句

      // 合并标签 / Merged labels
      labels: { // labels
        ...this.config.metricLabels, // 展开对象或数组
        ...labels, // 展开对象或数组
      }, // 结束代码块
    }; // 结束代码块

    // 记录到 PnL 日志 / Log to PnL log
    this.loggers.pnl.info(metricData, 'metric'); // 访问 loggers
  } // 结束代码块

  /**
   * 批量记录指标
   * Log multiple metrics
   *
   * @param {Array} metrics - 指标数组 / Metrics array
   */
  logMetrics(metrics) { // 调用 logMetrics
    // 遍历记录每个指标 / Log each metric
    metrics.forEach(({ name, value, labels }) => { // 调用 metrics.forEach
      this.logMetric(name, value, labels); // 调用 logMetric
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 日志轮转方法 / Log Rotation Methods
  // ============================================

  /**
   * 检查日志轮转
   * Check log rotation
   * @private
   */
  _checkLogRotation() { // 调用 _checkLogRotation
    // 如果未启用日期轮转，跳过 / If date rotation not enabled, skip
    if (!this.config.rotateByDate) { // 条件判断 !this.config.rotateByDate
      return; // 返回结果
    } // 结束代码块

    // 获取当前日期 / Get current date
    const today = getDateString(); // 定义常量 today

    // 如果日期没变，跳过 / If date hasn't changed, skip
    if (today === this.currentDate) { // 条件判断 today === this.currentDate
      return; // 返回结果
    } // 结束代码块

    // 更新当前日期 / Update current date
    this.currentDate = today; // 设置 currentDate

    // 记录轮转日志 / Log rotation
    this.logSystem('info', `日志轮转: ${today} / Log rotation: ${today}`); // 调用 logSystem

    // 关闭旧流 / Close old streams
    Object.values(this.streams).forEach(stream => { // 调用 Object.values
      if (stream) { // 条件判断 stream
        stream.end(); // 调用 stream.end
      } // 结束代码块
    }); // 结束代码块

    // 重新初始化日志记录器 / Re-initialize loggers
    this._initLoggers(); // 调用 _initLoggers

    // 清理旧日志文件 / Clean up old log files
    this._cleanupOldLogs(); // 调用 _cleanupOldLogs
  } // 结束代码块

  /**
   * 清理旧日志文件
   * Clean up old log files
   * @private
   */
  _cleanupOldLogs() { // 调用 _cleanupOldLogs
    // 计算截止日期 / Calculate cutoff date
    const cutoffDate = new Date(); // 定义常量 cutoffDate
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxRetentionDays); // 调用 cutoffDate.setDate

    // 遍历所有日志目录 / Iterate all log directories
    const dirs = [this.config.pnlDir, this.config.tradeDir, this.config.systemDir]; // 定义常量 dirs

    dirs.forEach(subDir => { // 调用 dirs.forEach
      // 获取目录路径 / Get directory path
      const dirPath = path.join(this.config.logDir, subDir); // 定义常量 dirPath

      // 如果目录不存在，跳过 / If directory doesn't exist, skip
      if (!fs.existsSync(dirPath)) { // 条件判断 !fs.existsSync(dirPath)
        return; // 返回结果
      } // 结束代码块

      // 读取目录内容 / Read directory contents
      const files = fs.readdirSync(dirPath); // 定义常量 files

      // 遍历文件 / Iterate files
      files.forEach(file => { // 调用 files.forEach
        // 获取文件完整路径 / Get full file path
        const filePath = path.join(dirPath, file); // 定义常量 filePath

        // 获取文件状态 / Get file stats
        const stats = fs.statSync(filePath); // 定义常量 stats

        // 如果文件超过保留期限，删除 / If file exceeds retention, delete
        if (stats.mtime < cutoffDate) { // 条件判断 stats.mtime < cutoffDate
          fs.unlinkSync(filePath); // 调用 fs.unlinkSync
          this.logSystem('info', `已删除旧日志: ${file} / Deleted old log: ${file}`); // 调用 logSystem
        } // 结束代码块
      }); // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      // 日志计数 / Log counts
      ...this.stats, // 展开对象或数组

      // 是否运行中 / Whether running
      running: this.running, // running

      // 当前日期 / Current date
      currentDate: this.currentDate, // currentDate

      // 日志目录 / Log directory
      logDir: this.config.logDir, // 日志Dir
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取最新日志文件路径
   * Get latest log file paths
   *
   * @returns {Object} 日志文件路径 / Log file paths
   */
  getLogFilePaths() { // 调用 getLogFilePaths
    return { // 返回结果
      pnl: this._getLogFilePath('pnl'), // 盈亏
      trade: this._getLogFilePath('trade'), // 交易
      system: this._getLogFilePath('system'), // 系统
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export { // 导出命名成员
  LOG_LEVEL, // 执行语句
  LOG_TYPE, // 执行语句
  DEFAULT_CONFIG, // 执行语句
}; // 结束代码块

// 默认导出 / Default export
export default PnLLogger; // 默认导出
