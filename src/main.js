#!/usr/bin/env node // 执行语句

/**
 * 量化交易系统主入口
 * Quant Trading System Main Entry
 *
 * 支持三种运行模式 / Supports three running modes:
 * 1. backtest - 回测模式 / Backtest mode
 * 2. shadow   - 影子模式 (真实行情，模拟下单) / Shadow mode (real market, simulated orders)
 * 3. live     - 实盘模式 (真实交易) / Live mode (real trading)
 *
 * 使用方式 / Usage:
 * - node src/main.js backtest --strategy fundingArb
 * - node src/main.js shadow
 * - node src/main.js live
 *
 * PM2 支持 / PM2 Support:
 * - pm2 start src/main.js --name quant-live -- live
 * - pm2 start src/main.js --name quant-shadow -- shadow
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

// 导入环境变量支持 / Import environment variable support
import 'dotenv/config'; // 加载模块 dotenv/config

// 导入路径模块 / Import path module
import path from 'path'; // 导入模块 path

// 导入文件 URL 转换 / Import file URL conversion
import { fileURLToPath } from 'url'; // 导入模块 url

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 导入项目模块 / Import Project Modules
// ============================================

// 导入配置加载器 / Import configuration loader
import { loadConfig } from '../config/index.js'; // 导入模块 ../config/index.js

// 导入交易所工厂 / Import exchange factory
import { ExchangeFactory } from './exchange/index.js'; // 导入模块 ./exchange/index.js

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from './marketdata/index.js'; // 导入模块 ./marketdata/index.js

// 导入策略注册表 / Import strategy registry
import { StrategyRegistry } from './strategies/index.js'; // 导入模块 ./strategies/index.js

// 导入风控模块 / Import risk module
import { AdvancedRiskManager } from './risk/index.js'; // 导入模块 ./risk/index.js

// 导入智能订单执行器 / Import smart order executor
import { SmartOrderExecutor } from './executor/index.js'; // 导入模块 ./executor/index.js

// 导入日志模块 / Import logger module
import createLoggerModule from './logger/index.js'; // 导入模块 ./logger/index.js

// 导入回测引擎 / Import backtest engine
import { BacktestEngine, BacktestRunner } from './backtest/index.js'; // 导入模块 ./backtest/index.js

// 导入行情订阅器 (用于共享行情服务模式) / Import market data subscriber (for shared market data service mode)
import { MarketDataSubscriber } from './services/index.js'; // 导入模块 ./services/index.js

// ============================================
// 常量定义 / Constants Definition
// ============================================

// 获取当前文件路径 / Get current file path
const __filename = fileURLToPath(import.meta.url); // 定义常量 __filename

// 获取当前目录路径 / Get current directory path
const __dirname = path.dirname(__filename); // 定义常量 __dirname

/**
 * 运行模式枚举
 * Running mode enum
 */
const RUN_MODE = { // 定义常量 RUN_MODE
  BACKTEST: 'backtest',   // 回测权限
  SHADOW: 'shadow',       // 影子模式 / Shadow mode
  LIVE: 'live',           // 实盘模式 / Live mode
}; // 结束代码块

/**
 * 系统状态枚举
 * System status enum
 */
const SYSTEM_STATUS = { // 定义常量 SYSTEM_STATUS
  STOPPED: 'stopped',     // STOPPED权限
  STARTING: 'starting',   // STARTING权限
  RUNNING: 'running',     // 运行中 / Running
  STOPPING: 'stopping',   // STOPPING权限
  ERROR: 'error',         // 错误 / Error
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_OPTIONS = { // 定义常量 DEFAULT_OPTIONS
  // 策略配置 / Strategy configuration
  strategy: 'FundingArb',           // 默认策略 / Default strategy

  // 交易对配置 / Symbol configuration
  symbols: ['BTC/USDT'],       // 默认交易对 / Default symbols

  // 回测配置 / Backtest configuration
  startDate: null,                   // 开始日期 / Start date
  endDate: null,                     // 结束日期 / End date
  initialCapital: 100,            // 初始资金 / Initial capital

  // 交易所配置 / Exchange configuration
  exchange: 'binance',               // 默认交易所 / Default exchange

  // 日志配置 / Logging configuration
  verbose: true,                     // 详细日志 / Verbose logging
}; // 结束代码块

// ============================================
// 命令行解析 / CLI Argument Parsing
// ============================================

/**
 * 解析命令行参数
 * Parse command line arguments
 *
 * @returns {Object} 解析后的参数 / Parsed arguments
 */
function parseArgs() { // 定义函数 parseArgs
  // 获取命令行参数 / Get command line arguments
  const args = process.argv.slice(2); // 定义常量 args

  // 初始化结果对象 / Initialize result object
  const result = { // 定义常量 result
    mode: null,           // 运行模式 / Running mode
    strategy: null,       // 策略名称 / Strategy name
    symbols: [],          // 交易对列表 / Symbol list
    exchange: null,       // 交易所 / Exchange
    startDate: null,      // 开始日期 / Start date
    endDate: null,        // 结束日期 / End date
    capital: null,        // 初始资金 / Initial capital
    config: null,         // 配置文件路径 / Config file path
    verbose: false,       // 详细模式 / Verbose mode
    help: false,          // 帮助 / Help
  }; // 结束代码块

  // 遍历参数 / Iterate arguments
  for (let i = 0; i < args.length; i++) { // 循环 let i = 0; i < args.length; i++
    // 获取当前参数 / Get current argument
    const arg = args[i]; // 定义常量 arg

    // 检查是否为模式参数 / Check if mode argument
    if (arg === 'backtest' || arg === 'shadow' || arg === 'live') { // 条件判断 arg === 'backtest' || arg === 'shadow' || arg...
      // 设置运行模式 / Set running mode
      result.mode = arg; // 赋值 result.mode
      continue; // 继续下一轮循环
    } // 结束代码块

    // 检查是否为选项参数 / Check if option argument
    switch (arg) { // 分支选择 arg
      // 策略选项 / Strategy option
      case '--strategy': // 分支 '--strategy'
      case '-s': // 分支 '-s'
        // 获取下一个参数作为值 / Get next argument as value
        result.strategy = args[++i]; // 赋值 result.strategy
        break; // 跳出循环或分支

      // 交易对选项 / Symbol option
      case '--symbol': // 分支 '--symbol'
      case '--symbols': // 分支 '--symbols'
        // 获取下一个参数并按逗号分割 / Get next argument and split by comma
        result.symbols = args[++i]?.split(',') || []; // 赋值 result.symbols
        break; // 跳出循环或分支

      // 交易所选项 / Exchange option
      case '--exchange': // 分支 '--exchange'
      case '-e': // 分支 '-e'
        // 获取下一个参数作为值 / Get next argument as value
        result.exchange = args[++i]; // 赋值 result.exchange
        break; // 跳出循环或分支

      // 开始日期选项 / Start date option
      case '--start': // 分支 '--start'
      case '--start-date': // 分支 '--start-date'
        // 获取下一个参数作为值 / Get next argument as value
        result.startDate = args[++i]; // 赋值 result.startDate
        break; // 跳出循环或分支

      // 结束日期选项 / End date option
      case '--end': // 分支 '--end'
      case '--end-date': // 分支 '--end-date'
        // 获取下一个参数作为值 / Get next argument as value
        result.endDate = args[++i]; // 赋值 result.endDate
        break; // 跳出循环或分支

      // 初始资金选项 / Initial capital option
      case '--capital': // 分支 '--capital'
      case '-c': // 分支 '-c'
        // 获取下一个参数并转换为数字 / Get next argument and convert to number
        result.capital = parseFloat(args[++i]); // 赋值 result.capital
        break; // 跳出循环或分支

      // 配置文件选项 / Config file option
      case '--config': // 分支 '--config'
        // 获取下一个参数作为值 / Get next argument as value
        result.config = args[++i]; // 赋值 result.config
        break; // 跳出循环或分支

      // 详细模式选项 / Verbose option
      case '--verbose': // 分支 '--verbose'
      case '-v': // 分支 '-v'
        // 启用详细模式 / Enable verbose mode
        result.verbose = true; // 赋值 result.verbose
        break; // 跳出循环或分支

      // 帮助选项 / Help option
      case '--help': // 分支 '--help'
      case '-h': // 分支 '-h'
        // 显示帮助 / Show help
        result.help = true; // 赋值 result.help
        break; // 跳出循环或分支

      // 未知选项 / Unknown option
      default: // 默认
        // 如果以 -- 开头，警告未知选项 / If starts with --, warn unknown option
        if (arg.startsWith('-')) { // 条件判断 arg.startsWith('-')
          console.warn(`警告: 未知选项 ${arg} / Warning: Unknown option ${arg}`); // 控制台输出
        } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  // 返回解析结果 / Return parsed result
  return result; // 返回结果
} // 结束代码块

/**
 * 显示帮助信息
 * Show help information
 */
function showHelp() { // 定义函数 showHelp
  // 帮助文本 / Help text
  const helpText = `
╔════════════════════════════════════════════════════════════════╗
║          量化交易系统 / Quant Trading System                    ║
╚════════════════════════════════════════════════════════════════╝

使用方式 / Usage:
  node src/main.js <mode> [options]

运行模式 / Modes:
  backtest    回测模式 - 使用历史数据测试策略
              Backtest mode - Test strategy with historical data

  shadow      影子模式 - 使用真实行情，但不真实下单
              Shadow mode - Real market data, simulated orders

  live        实盘模式 - 真实交易
              Live mode - Real trading

选项 / Options:
  --strategy, -s <name>     策略名称 / Strategy name
                            可选: SMA, RSI, MACD, BollingerBands, Grid, FundingArb,
                                  ATRBreakout, BollingerWidth, VolatilityRegime,
                                  RegimeSwitching, OrderFlow
                            Available: SMA, RSI, MACD, BollingerBands, Grid, FundingArb,
                                       ATRBreakout, BollingerWidth, VolatilityRegime,
                                       RegimeSwitching, OrderFlow

  --symbol, --symbols <s>   交易对 (逗号分隔) / Symbols (comma separated)
                            例如 / Example: BTC/USDT,ETH/USDT

  --exchange, -e <name>     交易所名称 / Exchange name
                            可选: binance, okx, bybit
                            Available: binance, okx, bybit

  --start <date>            回测开始日期 / Backtest start date
                            格式 / Format: YYYY-MM-DD

  --end <date>              回测结束日期 / Backtest end date
                            格式 / Format: YYYY-MM-DD

  --capital, -c <amount>    初始资金 (USDT) / Initial capital (USDT)

  --config <path>           配置文件路径 / Config file path

  --verbose, -v             详细日志输出 / Verbose logging

  --help, -h                显示此帮助信息 / Show this help

示例 / Examples:
  # 回测 FundingArb 策略
  node src/main.js backtest --strategy FundingArb --start 2024-01-01 --end 2024-06-01

  # 影子模式运行 Grid 策略
  node src/main.js shadow --strategy Grid --symbols BTC/USDT

  # 实盘运行
  node src/main.js live --strategy FundingArb

PM2 示例 / PM2 Examples:
  pm2 start src/main.js --name quant-live -- live --strategy FundingArb
  pm2 start src/main.js --name quant-shadow -- shadow --verbose

环境变量 / Environment Variables:
  BINANCE_API_KEY       Binance API 密钥 / Binance API key
  BINANCE_SECRET        Binance API 密钥 / Binance API secret
  TELEGRAM_BOT_TOKEN    Telegram 机器人令牌 / Telegram bot token
  TELEGRAM_CHAT_ID      Telegram 聊天 ID / Telegram chat ID
`; // 执行语句

  // 输出帮助信息 / Output help information
  console.log(helpText); // 控制台输出
} // 结束代码块

// ============================================
// 主运行器类 / Main Runner Class
// ============================================

/**
 * 量化交易系统主运行器
 * Quant Trading System Main Runner
 */
class TradingSystemRunner extends EventEmitter { // 定义类 TradingSystemRunner(继承EventEmitter)
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} options - 配置选项 / Configuration options
   */
  constructor(options = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 合并选项 / Merge options
    this.options = { ...DEFAULT_OPTIONS, ...options }; // 设置 options

    // 运行模式 / Running mode
    this.mode = options.mode || RUN_MODE.SHADOW; // 设置 mode

    // 系统状态 / System status
    this.status = SYSTEM_STATUS.STOPPED; // 设置 status

    // 系统配置 (从配置文件加载) / System configuration (loaded from config file)
    this.config = null; // 设置 config

    // ============================================
    // 组件实例 / Component Instances
    // ============================================

    // 交易所实例 / Exchange instance
    this.exchange = null; // 设置 exchange

    // 行情引擎 / Market data engine
    this.marketDataEngine = null; // 设置 marketDataEngine

    // 策略实例 / Strategy instance
    this.strategy = null; // 设置 strategy

    // 风控管理器 / Risk manager
    this.riskManager = null; // 设置 riskManager

    // 订单执行器 / Order executor
    this.executor = null; // 设置 executor

    // 日志模块 / Logger module
    this.loggerModule = null; // 设置 loggerModule

    // 回测引擎 (仅回测模式) / Backtest engine (backtest mode only)
    this.backtestEngine = null; // 设置 backtestEngine

    // ============================================
    // 运行时状态 / Runtime State
    // ============================================

    // 启动时间 / Start time
    this.startTime = null; // 设置 startTime

    // 信号计数 / Signal count
    this.signalCount = 0; // 设置 signalCount

    // 订单计数 / Order count
    this.orderCount = 0; // 设置 orderCount

    // 错误计数 / Error count
    this.errorCount = 0; // 设置 errorCount

    // 是否正在关闭 / Whether shutting down
    this.isShuttingDown = false; // 设置 isShuttingDown

    // ============================================
    // 行情统计计数器 / Market Data Statistics Counters
    // ============================================

    // 行情更新计数 / Market data update counts
    this._marketDataStats = { // 设置 _marketDataStats
      tickerCount: 0, // ticker数量
      candleCount: 0, // candle数量
      orderbookCount: 0, // orderbook数量
      fundingRateCount: 0, // 资金费率频率数量
      tradeCount: 0, // 交易数量
      symbols: new Set(), // 交易对列表
      exchanges: new Set(), // 交易所
      lastDataAt: null, // last数据At
      lastDataType: null, // last数据类型
      lastSymbol: null, // last交易对
      lastExchange: null, // last交易所
    }; // 结束代码块

    // 行情统计定时器 / Market data stats timer
    this._marketDataStatsTimer = null; // 设置 _marketDataStatsTimer
  } // 结束代码块

  // ============================================
  // 初始化方法 / Initialization Methods
  // ============================================

  /**
   * 初始化系统
   * Initialize system
   */
  async initialize() { // 执行语句
    // 输出启动信息 / Output startup info
    this._printBanner(); // 调用 _printBanner

    // 更新状态 / Update status
    this.status = SYSTEM_STATUS.STARTING; // 设置 status

    // 输出日志 / Output log
    this._log('info', `初始化系统 (模式: ${this.mode}) / Initializing system (mode: ${this.mode})`); // 调用 _log

    try { // 尝试执行
      // 1. 加载配置 / Load configuration
      this._log('info', '加载配置... / Loading configuration...'); // 调用 _log
      this.config = loadConfig(); // 设置 config

      // 2. 初始化日志模块 / Initialize logger module
      this._log('info', '初始化日志模块... / Initializing logger module...'); // 调用 _log
      await this._initLoggerModule(); // 等待异步结果

      // 3. 根据模式初始化 / Initialize based on mode
      if (this.mode === RUN_MODE.BACKTEST) { // 条件判断 this.mode === RUN_MODE.BACKTEST
        // 回测模式初始化 / Backtest mode initialization
        await this._initBacktestMode(); // 等待异步结果
      } else { // 执行语句
        // 影子/实盘模式初始化 / Shadow/live mode initialization
        await this._initTradingMode(); // 等待异步结果
      } // 结束代码块

      // 4. 绑定系统事件 / Bind system events
      this._bindSystemEvents(); // 调用 _bindSystemEvents

      // 输出日志 / Output log
      this._log('info', '系统初始化完成 / System initialization complete'); // 调用 _log

      // 发出初始化完成事件 / Emit initialized event
      this.emit('initialized'); // 调用 emit

    } catch (error) { // 执行语句
      // 输出错误日志 / Output error log
      this._log('error', `初始化失败: ${error.message} / Initialization failed`); // 调用 _log

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.ERROR; // 设置 status

      // 抛出错误 / Throw error
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 初始化日志模块
   * Initialize logger module
   * @private
   */
  async _initLoggerModule() { // 执行语句
    // 创建日志模块 / Create logger module
    this.loggerModule = createLoggerModule({ // 设置 loggerModule
      // Telegram 配置 / Telegram configuration
      telegram: { // Telegram 配置
        botToken: process.env.TELEGRAM_BOT_TOKEN,   // 机器人令牌
        chatId: process.env.TELEGRAM_CHAT_ID,       // 聊天ID
        enabled: process.env.TELEGRAM_ENABLED === 'true',  // 通过环境变量控制 / Controlled by env variable
      }, // 结束代码块

      // PnL 日志配置 / PnL logger configuration
      pnlLogger: { // PnL 日志配置
        logDir: this.config.logging?.dir || './logs',  // 日志目录 / Log directory
      }, // 结束代码块

      // 指标导出配置 / Metrics exporter configuration
      metricsExporter: { // 指标Exporter
        httpEnabled: this.mode !== RUN_MODE.BACKTEST,  // 非回测模式启用 / Enable in non-backtest mode
        httpPort: parseInt(process.env.METRICS_PORT, 10) || this.config.server?.metricsPort || 9090,  // HTTP 端口 / HTTP port
      }, // 结束代码块

      // 告警管理器配置 / Alert Manager configuration
      alertManager: { // 告警Manager
        emailEnabled: !!process.env.SMTP_HOST,  // 如果配置了SMTP则启用邮件 / Enable email if SMTP configured
        enableTelegram: process.env.TELEGRAM_ENABLED === 'true',  // Telegram 告警 / Telegram alerts
        smtpHost: process.env.SMTP_HOST, // smtp主机
        smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587, // smtp端口
        smtpUser: process.env.SMTP_USER, // smtp用户
        smtpPass: process.env.SMTP_PASS, // smtpPass
        alertEmailTo: process.env.ALERT_EMAIL_TO, // 告警邮箱To
        emailLevelThreshold: 'danger',  // danger 及以上级别发邮件 / Send email for danger level and above
      }, // 结束代码块
    }); // 结束代码块

    // 如果是实盘或影子模式，初始化 Telegram / If live or shadow mode, initialize Telegram
    if (this.mode !== RUN_MODE.BACKTEST) { // 条件判断 this.mode !== RUN_MODE.BACKTEST
      // 初始化 Telegram / Initialize Telegram
      await this.loggerModule.telegramNotifier.init(); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 初始化回测模式
   * Initialize backtest mode
   * @private
   */
  async _initBacktestMode() { // 执行语句
    // 输出日志 / Output log
    this._log('info', '初始化回测模式... / Initializing backtest mode...'); // 调用 _log

    // 创建回测引擎 / Create backtest engine
    this.backtestEngine = new BacktestEngine({ // 设置 backtestEngine
      // 初始资金 / Initial capital
      initialCapital: this.options.capital || DEFAULT_OPTIONS.initialCapital, // 初始资金

      // 手续费率 / Commission rate
      commissionRate: 0.0004,  // 手续费频率

      // 滑点 / Slippage
      slippage: 0.0001,  // 滑点
    }); // 结束代码块

    // 加载策略 / Load strategy
    const strategyName = this.options.strategy || DEFAULT_OPTIONS.strategy; // 定义常量 strategyName
    this._log('info', `加载策略: ${strategyName} / Loading strategy: ${strategyName}`); // 调用 _log

    // 获取策略类 / Get strategy class
    const StrategyClass = await StrategyRegistry.get(strategyName); // 定义常量 StrategyClass

    // 创建策略实例 / Create strategy instance
    this.strategy = new StrategyClass({ // 设置 strategy
      // 交易对 / Symbols
      symbols: this.options.symbols.length > 0 ? this.options.symbols : DEFAULT_OPTIONS.symbols, // 交易对列表
    }); // 结束代码块
  } // 结束代码块

  /**
   * 初始化交易模式 (影子/实盘)
   * Initialize trading mode (shadow/live)
   * @private
   */
  async _initTradingMode() { // 执行语句
    // 输出日志 / Output log
    this._log('info', `初始化${this.mode === RUN_MODE.LIVE ? '实盘' : '影子'}模式... / Initializing ${this.mode} mode...`); // 调用 _log

    // 1. 创建交易所实例 / Create exchange instance
    await this._initExchange(); // 等待异步结果

    // 2. 创建行情引擎 / Create market data engine
    await this._initMarketDataEngine(); // 等待异步结果

    // 3. 创建风控管理器 / Create risk manager
    this._initRiskManager(); // 调用 _initRiskManager

    // 4. 创建订单执行器 / Create order executor
    this._initOrderExecutor(); // 调用 _initOrderExecutor

    // 5. 加载策略 / Load strategy
    await this._initStrategy(); // 等待异步结果

    // 6. 连接数据源到日志模块 / Connect data sources to logger module
    this._connectLoggerDataSources(); // 调用 _connectLoggerDataSources
  } // 结束代码块

  /**
   * 初始化交易所
   * Initialize exchange
   * @private
   */
  async _initExchange() { // 执行语句
    // 初始化交易所映射 / Initialize exchanges map
    this.exchanges = new Map(); // 设置 exchanges

    // 检查是否使用共享行情模式 / Check if using shared market data mode
    // 共享模式下跳过 API 预检查和市场信息加载（由 market-data 服务统一处理）
    // In shared mode, skip API preflight and market loading (handled by market-data service)
    const useSharedMarketData = process.env.USE_SHARED_MARKET_DATA === 'true' || // 定义常量 useSharedMarketData
                                 this.config.marketData?.useShared === true; // 访问 config

    if (useSharedMarketData) { // 条件判断 useSharedMarketData
      this._log('info', '共享行情模式: 策略容器使用轻量连接 (跳过API预检查) / Shared mode: Using lightweight connection'); // 调用 _log
    } // 结束代码块

    // 获取主交易所名称 / Get primary exchange name
    const primaryExchangeName = this.options.exchange || this.config.exchange?.default || 'binance'; // 定义常量 primaryExchangeName

    // 获取所有支持的交易所列表 / Get all supported exchanges
    const supportedExchanges = ['binance', 'okx', 'bybit', 'gate', 'deribit', 'bitget', 'kucoin']; // 定义常量 supportedExchanges

    // 遍历所有支持的交易所 / Iterate all supported exchanges
    for (const exchangeName of supportedExchanges) { // 循环 const exchangeName of supportedExchanges
      // 获取交易所配置 / Get exchange configuration
      const exchangeConfig = this.config.exchange?.[exchangeName] || {}; // 定义常量 exchangeConfig

      // 检查是否启用 / Check if enabled
      const isEnabled = exchangeConfig.enabled !== false; // 定义常量 isEnabled

      // 获取 API 密钥 (支持多种环境变量命名) / Get API credentials
      const upperName = exchangeName.toUpperCase(); // 定义常量 upperName
      const apiKey = exchangeConfig.apiKey || // 定义常量 apiKey
                     process.env[`${upperName}_API_KEY`]; // 执行语句
      const secret = exchangeConfig.secret || // 定义常量 secret
                     process.env[`${upperName}_SECRET`] || // 执行语句
                     process.env[`${upperName}_API_SECRET`]; // 执行语句
      // OKX 需要 passphrase / OKX requires passphrase
      const password = exchangeConfig.password || // 定义常量 password
                       process.env[`${upperName}_PASSPHRASE`] || // 执行语句
                       process.env[`${upperName}_PASSWORD`]; // 执行语句

      // 如果没有 API 密钥或未启用，跳过 / If no API key or not enabled, skip
      if (!isEnabled || !apiKey || !secret) { // 条件判断 !isEnabled || !apiKey || !secret
        if (this.options.verbose) { // 条件判断 this.options.verbose
          this._log('debug', `跳过交易所 ${exchangeName}: enabled=${isEnabled}, hasKey=${!!apiKey}, hasSecret=${!!secret}`); // 调用 _log
        } // 结束代码块
        continue; // 继续下一轮循环
      } // 结束代码块

      // 输出日志 / Output log
      this._log('info', `连接交易所: ${exchangeName} / Connecting exchange: ${exchangeName}`); // 调用 _log

      // 调试：显示密码状态 / Debug: show password status
      if (exchangeName === 'okx') { // 条件判断 exchangeName === 'okx'
        this._log('debug', `OKX 配置: hasPassword=${!!password}, fromConfig=${!!exchangeConfig.password}, fromEnv=${!!process.env.OKX_PASSPHRASE}`); // 调用 _log
      } // 结束代码块

      const sandbox = exchangeConfig.sandbox || // 定义常量 sandbox
                      process.env[`${upperName}_SANDBOX`] === 'true' || // 执行语句
                      process.env[`${upperName}_TESTNET`] === 'true'; // 执行语句

      try { // 尝试执行
        // 创建交易所实例 / Create exchange instance
        const exchangeOptions = { // 定义常量 exchangeOptions
          // API 密钥 / API key
          apiKey, // 执行语句

          // API 密钥 / API secret
          secret, // 执行语句

          // 是否沙盒模式 / Sandbox mode
          sandbox, // 执行语句

          // 默认类型 (合约) / Default type (futures)
          defaultType: 'swap', // 默认类型 (合约)

          // 选项 / Options
          options: { // options
            // 默认保证金模式 / Default margin mode
            defaultMarginMode: 'cross', // 默认保证金模式
          }, // 结束代码块
        }; // 结束代码块

        // OKX 需要 password (passphrase) / OKX requires password (passphrase)
        if (password) { // 条件判断 password
          exchangeOptions.password = password; // 赋值 exchangeOptions.password
        } // 结束代码块

        const exchange = ExchangeFactory.create(exchangeName, exchangeOptions); // 定义常量 exchange

        // 连接交易所 / Connect exchange
        // 共享模式: 轻量连接 (跳过预检查和市场加载，由 market-data 服务处理)
        // 非共享模式: 完整连接 (执行预检查和市场加载)
        // Shared mode: lightweight connect (skip preflight and market loading)
        // Non-shared mode: full connect (with preflight and market loading)
        await exchange.connect({ // 等待异步结果
          skipPreflight: useSharedMarketData, // skipPreflight
          loadMarkets: !useSharedMarketData, // loadMarkets
        }); // 结束代码块

        // 保存到映射 / Save to map
        this.exchanges.set(exchangeName, exchange); // 访问 exchanges

        // 如果是主交易所，设置为默认 / If primary exchange, set as default
        if (exchangeName === primaryExchangeName) { // 条件判断 exchangeName === primaryExchangeName
          this.exchange = exchange; // 设置 exchange
        } // 结束代码块

        // 输出日志 / Output log
        this._log('info', `交易所连接成功: ${exchangeName} / Exchange connected: ${exchangeName}`); // 调用 _log

      } catch (error) { // 执行语句
        this._log('warn', `交易所 ${exchangeName} 连接失败: ${error.message} / Exchange connection failed`); // 调用 _log
      } // 结束代码块
    } // 结束代码块

    // 如果没有设置主交易所，使用第一个连接成功的 / If no primary exchange set, use first connected
    if (!this.exchange && this.exchanges.size > 0) { // 条件判断 !this.exchange && this.exchanges.size > 0
      this.exchange = this.exchanges.values().next().value; // 设置 exchange
    } // 结束代码块

    // 输出连接的交易所数量 / Output connected exchanges count
    this._log('info', `已连接 ${this.exchanges.size} 个交易所 / Connected ${this.exchanges.size} exchanges: ${Array.from(this.exchanges.keys()).join(', ')}`); // 调用 _log
  } // 结束代码块

  /**
   * 初始化行情引擎
   * Initialize market data engine
   * @private
   */
  async _initMarketDataEngine() { // 执行语句
    // 输出日志 / Output log
    this._log('info', '初始化行情引擎... / Initializing market data engine...'); // 调用 _log

    // 检查是否使用共享行情服务 / Check if using shared market data service
    const useSharedMarketData = process.env.USE_SHARED_MARKET_DATA === 'true' || // 定义常量 useSharedMarketData
                                 this.config.marketData?.useShared === true; // 访问 config

    if (useSharedMarketData) { // 条件判断 useSharedMarketData
      // 使用共享行情服务模式 / Use shared market data service mode
      this._log('info', '使用共享行情服务模式 / Using shared market data service mode'); // 调用 _log

      // 创建行情订阅器 / Create market data subscriber
      this.marketDataSubscriber = new MarketDataSubscriber({ // 设置 marketDataSubscriber
        redis: { // redis
          host: this.config.database?.redis?.host || process.env.REDIS_HOST || 'localhost', // 主机
          port: this.config.database?.redis?.port || parseInt(process.env.REDIS_PORT || '6379', 10), // 端口
          password: this.config.database?.redis?.password || process.env.REDIS_PASSWORD || null, // 密码
          db: this.config.database?.redis?.db || parseInt(process.env.REDIS_DB || '0', 10), // db
        }, // 结束代码块
      }); // 结束代码块

      // 连接到 Redis / Connect to Redis
      await this.marketDataSubscriber.connect(); // 等待异步结果

      // 检查行情服务是否在线 / Check if market data service is online
      const serviceAlive = await this.marketDataSubscriber.checkServiceStatus(); // 定义常量 serviceAlive
      if (!serviceAlive) { // 条件判断 !serviceAlive
        this._log('warn', '⚠️ 共享行情服务离线，等待连接... / Shared market data service offline, waiting...'); // 调用 _log
      } else { // 执行语句
        this._log('info', '✓ 共享行情服务在线 / Shared market data service online'); // 调用 _log
      } // 结束代码块

      // 订阅行情服务离线/在线事件 / Subscribe to service offline/online events
      this.marketDataSubscriber.on('serviceOffline', () => { // 访问 marketDataSubscriber
        this._log('warn', '⚠️ 共享行情服务离线 / Shared market data service offline'); // 调用 _log
        this.emit('marketDataServiceOffline'); // 调用 emit
      }); // 结束代码块

      this.marketDataSubscriber.on('serviceOnline', () => { // 访问 marketDataSubscriber
        this._log('info', '✓ 共享行情服务恢复 / Shared market data service restored'); // 调用 _log
        this.emit('marketDataServiceOnline'); // 调用 emit
      }); // 结束代码块

      // 设置 marketDataEngine 为 null (使用订阅器替代)
      // Set marketDataEngine to null (using subscriber instead)
      this.marketDataEngine = null; // 设置 marketDataEngine

      return; // 返回结果
    } // 结束代码块

    // 原有逻辑：独立创建行情引擎 / Original logic: Create independent market data engine
    // 获取已连接的交易所列表 (基于已配置密钥的交易所)
    // Get connected exchanges list (based on exchanges with configured API keys)
    const connectedExchanges = Array.from(this.exchanges.keys()); // 定义常量 connectedExchanges

    // 输出连接的交易所 / Output connected exchanges
    this._log('info', `行情引擎将连接以下交易所 / MarketDataEngine will connect to: ${connectedExchanges.join(', ')}`); // 调用 _log

    // 创建行情引擎 / Create market data engine
    // 注意: MarketDataEngine 构造函数只接受一个 config 参数
    // Note: MarketDataEngine constructor only accepts one config parameter
    this.marketDataEngine = new MarketDataEngine({ // 设置 marketDataEngine
      // 是否启用 WebSocket / Enable WebSocket
      enableWebSocket: true, // 是否启用 WebSocket

      // 是否启用 Redis 缓存 / Enable Redis cache
      enableRedis: !!this.config.database?.redis?.enabled, // 是否启用 Redis 缓存

      // Redis 配置 / Redis configuration
      redis: this.config.database?.redis?.enabled ? { // Redis 配置
        host: this.config.database?.redis?.host || 'localhost', // 主机
        port: this.config.database?.redis?.port || 6379, // 端口
        password: this.config.database?.redis?.password || null, // 密码
        db: this.config.database?.redis?.db || 0, // db
      } : undefined, // 执行语句

      // 传入已配置密钥的交易所列表 (动态) / Pass exchanges with configured API keys (dynamic)
      exchanges: connectedExchanges, // 传入已配置密钥的交易所列表 (动态)

      // 交易类型 / Trading type
      tradingType: this.config.trading?.type || 'futures', // 交易类型

      // Cache configuration
      cache: this.config.marketData?.cache, // Cache configuration
    }); // 结束代码块
  } // 结束代码块

  /**
   * 初始化风控管理器
   * Initialize risk manager
   * @private
   */
  _initRiskManager() { // 调用 _initRiskManager
    // 输出日志 / Output log
    this._log('info', '初始化风控管理器... / Initializing risk manager...'); // 调用 _log

    // 创建风控管理器 / Create risk manager
    this.riskManager = new AdvancedRiskManager({ // 设置 riskManager
      // 最大仓位比例 / Max position ratio
      maxPositionRatio: this.config.risk?.maxPositionRatio || 0.3, // 最大仓位比例

      // 每日最大回撤 / Max daily drawdown
      maxDailyDrawdown: this.config.risk?.maxDrawdown || 0.1, // 最大每日回撤

      // 最大杠杆 / Max leverage
      maxLeverage: this.config.risk?.maxLeverage || 3, // 最大杠杆

      // 是否启用详细日志 / Enable verbose logging
      verbose: this.options.verbose, // 是否启用详细日志
    }); // 结束代码块
  } // 结束代码块

  /**
   * 初始化订单执行器
   * Initialize order executor
   * @private
   */
  _initOrderExecutor() { // 调用 _initOrderExecutor
    // 输出日志 / Output log
    this._log('info', '初始化订单执行器... / Initializing order executor...'); // 调用 _log

    // 是否为影子模式 / Whether shadow mode
    const isShadowMode = this.mode === RUN_MODE.SHADOW; // 定义常量 isShadowMode

    // 创建订单执行器 / Create order executor
    this.executor = new SmartOrderExecutor({ // 设置 executor
      // 交易所实例映射 / Exchange instance mapping
      exchanges: { // 交易所实例映射
        [this.options.exchange || 'binance']: this.exchange, // 执行语句
      }, // 结束代码块

      // 是否为影子模式 (干跑) / Shadow mode (dry run)
      dryRun: isShadowMode, // 是否为影子模式 (干跑)

      // 默认重试次数 / Default retry count
      maxRetries: 3, // 默认重试次数

      // 是否启用详细日志 / Enable verbose logging
      verbose: this.options.verbose, // 是否启用详细日志
    }); // 结束代码块

    // 如果是影子模式，输出提示 / If shadow mode, output notice
    if (isShadowMode) { // 条件判断 isShadowMode
      this._log('warn', '⚠️ 影子模式: 订单将不会真实执行 / Shadow mode: Orders will not be actually executed'); // 调用 _log
    } // 结束代码块
  } // 结束代码块

  /**
   * 初始化策略
   * Initialize strategy
   * @private
   */
  async _initStrategy() { // 执行语句
    // 获取策略名称 / Get strategy name
    const strategyName = this.options.strategy || DEFAULT_OPTIONS.strategy; // 定义常量 strategyName

    // 输出日志 / Output log
    this._log('info', `加载策略: ${strategyName} / Loading strategy: ${strategyName}`); // 调用 _log

    // 获取策略类 / Get strategy class
    const StrategyClass = await StrategyRegistry.get(strategyName); // 定义常量 StrategyClass

    // 获取交易对 / Get symbols
    const symbols = this.options.symbols.length > 0 // 定义常量 symbols
      ? this.options.symbols // 执行语句
      : DEFAULT_OPTIONS.symbols; // 执行语句

    // 创建策略实例 / Create strategy instance
    const maxCandleHistory = this.config?.marketData?.cache?.maxCandles; // 定义常量 maxCandleHistory

    this.strategy = new StrategyClass({ // 设置 strategy
      // 交易对 / Symbols
      symbols, // 执行语句
      maxCandleHistory, // 执行语句
      maxCandles: maxCandleHistory, // 最大Candles

      // 策略配置 / Strategy configuration
      ...this.config.strategy?.[strategyName], // 展开对象或数组
    }); // 结束代码块

    // 创建交易引擎适配器 (用于影子/实盘模式)
    // Create trading engine adapter (for shadow/live mode)
    this._createEngineAdapter(); // 调用 _createEngineAdapter

    // 设置交易所 / Set exchange
    if (this.strategy.setExchange) { // 条件判断 this.strategy.setExchange
      this.strategy.setExchange(this.exchange); // 访问 strategy
    } // 结束代码块

    // 调用策略的 onInit 方法，传递所有已连接的交易所
    // Call strategy's onInit method with all connected exchanges
    if (this.strategy.onInit && typeof this.strategy.onInit === 'function') { // 条件判断 this.strategy.onInit && typeof this.strategy....
      await this.strategy.onInit(this.exchanges); // 等待异步结果
    } // 结束代码块

    // 初始化策略 / Initialize strategy
    if (this.strategy.initialize) { // 条件判断 this.strategy.initialize
      await this.strategy.initialize(); // 等待异步结果
    } // 结束代码块

    // 输出日志 / Output log
    this._log('info', `策略已加载: ${strategyName}, 交易对: ${symbols.join(', ')} / Strategy loaded`); // 调用 _log
  } // 结束代码块

  /**
   * 创建交易引擎适配器
   * Create trading engine adapter
   * @private
   */
  _createEngineAdapter() { // 调用 _createEngineAdapter
    // 创建虚拟持仓存储 (用于影子模式跟踪持仓)
    // Create virtual position storage (for shadow mode position tracking)
    this._virtualPositions = new Map(); // 设置 _virtualPositions

    // 创建价格缓存 (用于同步获取最新价格) / Create price cache (for sync price access)
    this._lastPrices = new Map(); // 设置 _lastPrices

    // 创建引擎适配器对象 / Create engine adapter object
    const engineAdapter = { // 定义常量 engineAdapter
      // 交易所引用 / Exchange references
      exchanges: this.exchanges, // 交易所

      // 更新最新价格缓存 / Update last price cache
      updatePrice: (symbol, price) => { // 更新最新价格缓存
        if (price && !isNaN(price)) { // 条件判断 price && !isNaN(price)
          this._lastPrices.set(symbol, price); // 访问 _lastPrices
        } // 结束代码块
      }, // 结束代码块

      // 获取缓存的最新价格 (同步) / Get cached last price (sync)
      getLastPrice: (symbol) => { // 获取缓存的最新价格 (同步)
        return this._lastPrices.get(symbol) || 0; // 返回结果
      }, // 结束代码块

      // 获取当前价格 / Get current price
      getCurrentPrice: async (symbol) => { // getCurrent价格
        try { // 尝试执行
          const exchangeId = Object.keys(this.exchanges)[0]; // 定义常量 exchangeId
          const exchange = this.exchanges[exchangeId]; // 定义常量 exchange
          if (exchange) { // 条件判断 exchange
            const ticker = await exchange.fetchTicker(symbol); // 定义常量 ticker
            return ticker.last || ticker.close; // 返回结果
          } // 结束代码块
        } catch (error) { // 执行语句
          this._log('warn', `获取价格失败 / Failed to get price: ${error.message}`); // 调用 _log
        } // 结束代码块
        return null; // 返回结果
      }, // 结束代码块

      // 获取持仓 / Get position
      getPosition: (symbol) => { // get持仓
        return this._virtualPositions.get(symbol) || { amount: 0, avgPrice: 0 }; // 返回结果
      }, // 结束代码块

      // 获取资金 / Get capital
      getCapital: () => { // get资金
        return this.options.capital ?? this.config.trading?.initialCapital ?? 10000; // 返回结果
      }, // 结束代码块

      // 获取权益 / Get equity
      getEquity: () => { // getEquity
        return this.options.capital ?? this.config.trading?.initialCapital ?? 10000; // 返回结果
      }, // 结束代码块

      // 买入 / Buy
      buy: (symbol, amount, options = {}) => { // buy
        // 链路日志: 引擎适配器收到买入请求 / Chain log: Engine adapter received buy request
        this._log('info', `[链路] 引擎适配器收到买入: ${symbol} 数量=${amount} / Engine adapter buy`); // 调用 _log

        // 获取价格: 优先使用传入的价格, 否则使用缓存的最新价格
        // Get price: prefer passed price, otherwise use cached last price
        const price = options.price || engineAdapter.getLastPrice(symbol); // 定义常量 price

        // 发出信号让 main.js 处理 / Emit signal for main.js to handle
        const signal = { // 定义常量 signal
          type: 'buy', // 类型
          side: 'buy', // 方向
          symbol, // 执行语句
          amount, // 执行语句
          price, // 执行语句
          timestamp: Date.now(), // 时间戳
        }; // 结束代码块
        this.strategy.emit('signal', signal); // 访问 strategy

        // 更新虚拟持仓 / Update virtual position
        const position = this._virtualPositions.get(symbol) || { amount: 0, avgPrice: 0 }; // 定义常量 position
        position.amount += amount; // 执行语句
        this._virtualPositions.set(symbol, position); // 访问 _virtualPositions

        return signal; // 返回结果
      }, // 结束代码块

      // 卖出 / Sell
      sell: (symbol, amount, options = {}) => { // sell
        // 链路日志: 引擎适配器收到卖出请求 / Chain log: Engine adapter received sell request
        this._log('info', `[链路] 引擎适配器收到卖出: ${symbol} 数量=${amount} / Engine adapter sell`); // 调用 _log

        // 获取价格: 优先使用传入的价格, 否则使用缓存的最新价格
        // Get price: prefer passed price, otherwise use cached last price
        const price = options.price || engineAdapter.getLastPrice(symbol); // 定义常量 price

        // 发出信号让 main.js 处理 / Emit signal for main.js to handle
        const signal = { // 定义常量 signal
          type: 'sell', // 类型
          side: 'sell', // 方向
          symbol, // 执行语句
          amount, // 执行语句
          price, // 执行语句
          timestamp: Date.now(), // 时间戳
        }; // 结束代码块
        this.strategy.emit('signal', signal); // 访问 strategy

        // 更新虚拟持仓 / Update virtual position
        const position = this._virtualPositions.get(symbol) || { amount: 0, avgPrice: 0 }; // 定义常量 position
        position.amount -= amount; // 执行语句
        if (position.amount <= 0) { // 条件判断 position.amount <= 0
          position.amount = 0; // 赋值 position.amount
        } // 结束代码块
        this._virtualPositions.set(symbol, position); // 访问 _virtualPositions

        return signal; // 返回结果
      }, // 结束代码块

      // 按百分比买入 / Buy by percentage
      buyPercent: (symbol, percent) => { // buy百分比
        // 链路日志: 引擎适配器收到按比例买入请求 / Chain log: Engine adapter received buyPercent request
        this._log('info', `[链路] 引擎适配器收到按比例买入: ${symbol} 比例=${percent}% / Engine adapter buyPercent`); // 调用 _log

        const capital = engineAdapter.getCapital(); // 定义常量 capital
        const price = engineAdapter.getLastPrice(symbol); // 定义常量 price
        if (!price || !isFinite(price) || price <= 0 || !capital || capital <= 0) { // 条件判断 !price || !isFinite(price) || price <= 0 || !...
          this._log('warn', `[链路] 买入失败: 无有效价格或资金 ${symbol} price=${price} capital=${capital}`); // 调用 _log
          return null; // 返回结果
        } // 结束代码块
        const amount = (capital * percent / 100) / price; // 定义常量 amount
        return engineAdapter.buy(symbol, amount, { price }); // 返回结果
      }, // 结束代码块

      // 平仓 / Close position
      closePosition: (symbol) => { // 平仓
        // 链路日志: 引擎适配器收到平仓请求 / Chain log: Engine adapter received closePosition request
        this._log('info', `[链路] 引擎适配器收到平仓: ${symbol} / Engine adapter closePosition`); // 调用 _log

        const position = this._virtualPositions.get(symbol); // 定义常量 position
        if (position && position.amount > 0) { // 条件判断 position && position.amount > 0
          return engineAdapter.sell(symbol, position.amount); // 返回结果
        } // 结束代码块
        return null; // 返回结果
      }, // 结束代码块
    }; // 结束代码块

    // 设置引擎适配器给策略 / Set engine adapter to strategy
    this.strategy.engine = engineAdapter; // 访问 strategy
  } // 结束代码块

  /**
   * 连接日志数据源
   * Connect logger data sources
   * @private
   */
  _connectLoggerDataSources() { // 调用 _connectLoggerDataSources
    // 设置数据源到日志模块 / Set data sources to logger module
    this.loggerModule.setDataSources({ // 访问 loggerModule
      // 风控管理器 / Risk manager
      riskManager: this.riskManager, // 风险Manager

      // 订单执行器 / Order executor
      executor: this.executor, // executor
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 事件绑定方法 / Event Binding Methods
  // ============================================

  /**
   * 绑定系统事件
   * Bind system events
   * @private
   */
  _bindSystemEvents() { // 调用 _bindSystemEvents
    // 绑定进程信号 / Bind process signals
    this._bindProcessSignals(); // 调用 _bindProcessSignals

    // 如果是交易模式，绑定交易事件 / If trading mode, bind trading events
    if (this.mode !== RUN_MODE.BACKTEST) { // 条件判断 this.mode !== RUN_MODE.BACKTEST
      // 绑定行情事件 / Bind market data events
      this._bindMarketDataEvents(); // 调用 _bindMarketDataEvents

      // 绑定策略事件 / Bind strategy events
      this._bindStrategyEvents(); // 调用 _bindStrategyEvents

      // 绑定风控事件 / Bind risk events
      this._bindRiskEvents(); // 调用 _bindRiskEvents

      // 绑定执行器事件 / Bind executor events
      this._bindExecutorEvents(); // 调用 _bindExecutorEvents
    } // 结束代码块
  } // 结束代码块

  /**
   * 绑定进程信号
   * Bind process signals
   * @private
   */
  _bindProcessSignals() { // 调用 _bindProcessSignals
    // SIGTERM 信号 (PM2 停止) / SIGTERM signal (PM2 stop)
    process.on('SIGTERM', async () => { // 注册事件监听
      // 输出日志 / Output log
      this._log('info', '收到 SIGTERM 信号 / Received SIGTERM signal'); // 调用 _log

      // 优雅关闭 / Graceful shutdown
      await this.shutdown(); // 等待异步结果
    }); // 结束代码块

    // SIGINT 信号 (Ctrl+C) / SIGINT signal (Ctrl+C)
    process.on('SIGINT', async () => { // 注册事件监听
      // 输出日志 / Output log
      this._log('info', '收到 SIGINT 信号 / Received SIGINT signal'); // 调用 _log

      // 优雅关闭 / Graceful shutdown
      await this.shutdown(); // 等待异步结果
    }); // 结束代码块

    // PM2 热重载信号 / PM2 hot reload signal
    process.on('message', async (msg) => { // 注册事件监听
      // 检查是否为关闭消息 / Check if shutdown message
      if (msg === 'shutdown') { // 条件判断 msg === 'shutdown'
        // 输出日志 / Output log
        this._log('info', '收到 PM2 shutdown 消息 / Received PM2 shutdown message'); // 调用 _log

        // 优雅关闭 / Graceful shutdown
        await this.shutdown(); // 等待异步结果

        // 发送 ready 消息给 PM2 / Send ready message to PM2
        if (process.send) { // 条件判断 process.send
          process.send('ready'); // 调用 process.send
        } // 结束代码块
      } // 结束代码块
    }); // 结束代码块

    // 未捕获异常处理 / Uncaught exception handling
    process.on('uncaughtException', async (error) => { // 注册事件监听
      // 输出错误日志 / Output error log
      this._log('error', `未捕获异常: ${error.message} / Uncaught exception`); // 调用 _log
      console.error(error); // 控制台输出

      // 增加错误计数 / Increment error count
      this.errorCount++; // 访问 errorCount

      // 记录到日志模块 / Log to logger module
      if (this.loggerModule) { // 条件判断 this.loggerModule
        this.loggerModule.alertManager?.triggerAlert({ // 访问 loggerModule
          category: 'system', // category
          level: 'critical', // 级别
          title: '未捕获异常 / Uncaught Exception', // title
          message: error.message, // 消息
          data: { stack: error.stack }, // 数据
        }); // 结束代码块
      } // 结束代码块

      // 优雅关闭 / Graceful shutdown
      await this.shutdown(1); // 等待异步结果
    }); // 结束代码块

    // 未处理 Promise 拒绝 / Unhandled promise rejection
    process.on('unhandledRejection', async (reason) => { // 注册事件监听
      // 输出错误日志 / Output error log
      this._log('error', `未处理的 Promise 拒绝: ${reason} / Unhandled Promise rejection`); // 调用 _log

      // 增加错误计数 / Increment error count
      this.errorCount++; // 访问 errorCount
    }); // 结束代码块
  } // 结束代码块

  /**
   * 绑定行情事件
   * Bind market data events
   * @private
   */
  _bindMarketDataEvents() { // 调用 _bindMarketDataEvents
    // 共享行情模式: 使用 marketDataSubscriber / Shared mode: use marketDataSubscriber
    if (this.marketDataSubscriber && !this.marketDataEngine) { // 条件判断 this.marketDataSubscriber && !this.marketData...
      this._bindSharedMarketDataEvents(); // 调用 _bindSharedMarketDataEvents
      return; // 返回结果
    } // 结束代码块

    // 如果没有行情引擎，跳过 / If no market data engine, skip
    if (!this.marketDataEngine) { // 条件判断 !this.marketDataEngine
      return; // 返回结果
    } // 结束代码块

    // Ticker 更新事件 / Ticker update event
    this.marketDataEngine.on('ticker', (data) => { // 访问 marketDataEngine
      // 更新统计 / Update stats
      this._marketDataStats.tickerCount++; // 访问 _marketDataStats
      if (data.symbol) this._marketDataStats.symbols.add(data.symbol); // 条件判断 data.symbol
      if (data.exchange) this._marketDataStats.exchanges.add(data.exchange); // 条件判断 data.exchange
      this._recordMarketDataEvent('ticker', data); // 调用 _recordMarketDataEvent

      // 更新价格缓存 / Update price cache
      if (data.symbol && (data.last || data.close)) { // 条件判断 data.symbol && (data.last || data.close)
        this._lastPrices?.set(data.symbol, data.last || data.close); // 访问 _lastPrices
      } // 结束代码块

      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onTicker) { // 条件判断 this.strategy && this.strategy.onTicker
        this.strategy.onTicker(data); // 访问 strategy
      } // 结束代码块
    }); // 结束代码块

    // K 线更新事件 / Candle update event
    this.marketDataEngine.on('candle', (data) => { // 访问 marketDataEngine
      // 更新统计 / Update stats
      this._marketDataStats.candleCount++; // 访问 _marketDataStats
      if (data.symbol) this._marketDataStats.symbols.add(data.symbol); // 条件判断 data.symbol
      if (data.exchange) this._marketDataStats.exchanges.add(data.exchange); // 条件判断 data.exchange
      this._recordMarketDataEvent('candle', data); // 调用 _recordMarketDataEvent

      // 更新价格缓存 / Update price cache
      if (data.symbol && data.close) { // 条件判断 data.symbol && data.close
        this._lastPrices?.set(data.symbol, data.close); // 访问 _lastPrices
      } // 结束代码块

      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onCandle) { // 条件判断 this.strategy && this.strategy.onCandle
        this.strategy.onCandle(data); // 访问 strategy
      } // 结束代码块
    }); // 结束代码块

    // 订单簿更新事件 / Order book update event
    this.marketDataEngine.on('orderbook', (data) => { // 访问 marketDataEngine
      // 更新统计 / Update stats
      this._marketDataStats.orderbookCount++; // 访问 _marketDataStats
      if (data.symbol) this._marketDataStats.symbols.add(data.symbol); // 条件判断 data.symbol
      if (data.exchange) this._marketDataStats.exchanges.add(data.exchange); // 条件判断 data.exchange
      this._recordMarketDataEvent('orderbook', data); // 调用 _recordMarketDataEvent

      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onOrderBook) { // 条件判断 this.strategy && this.strategy.onOrderBook
        this.strategy.onOrderBook(data); // 访问 strategy
      } // 结束代码块
    }); // 结束代码块

    // 资金费率更新事件 / Funding rate update event
    this.marketDataEngine.on('fundingRate', (data) => { // 访问 marketDataEngine
      // 更新统计 / Update stats
      this._marketDataStats.fundingRateCount++; // 访问 _marketDataStats
      if (data.symbol) this._marketDataStats.symbols.add(data.symbol); // 条件判断 data.symbol
      if (data.exchange) this._marketDataStats.exchanges.add(data.exchange); // 条件判断 data.exchange
      this._recordMarketDataEvent('fundingRate', data); // 调用 _recordMarketDataEvent

      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onFundingRate) { // 条件判断 this.strategy && this.strategy.onFundingRate
        this.strategy.onFundingRate(data); // 访问 strategy
      } // 结束代码块
    }); // 结束代码块

    // 行情错误事件 / Market data error event
    this.marketDataEngine.on('error', (error) => { // 访问 marketDataEngine
      // 输出错误日志 / Output error log
      this._log('error', `行情错误: ${error.message} / Market data error`); // 调用 _log

      // 增加错误计数 / Increment error count
      this.errorCount++; // 访问 errorCount
    }); // 结束代码块

    // 启动行情统计定时记录 (每分钟) / Start market data stats logging (every minute)
    this._marketDataStatsTimer = setInterval(() => { // 设置 _marketDataStatsTimer
      this._logMarketDataStats(); // 调用 _logMarketDataStats
    }, 60000); // 执行语句
  } // 结束代码块

  /**
   * 绑定共享行情模式事件
   * Bind shared market data mode events
   * @private
   */
  _bindSharedMarketDataEvents() { // 调用 _bindSharedMarketDataEvents
    if (!this.marketDataSubscriber) { // 条件判断 !this.marketDataSubscriber
      return; // 返回结果
    } // 结束代码块

    this._log('info', '绑定共享行情事件监听器 / Binding shared market data event listeners'); // 调用 _log

    // Ticker 更新事件 / Ticker update event
    this.marketDataSubscriber.on('ticker', (data) => { // 访问 marketDataSubscriber
      // 更新统计 / Update stats
      this._marketDataStats.tickerCount++; // 访问 _marketDataStats
      if (data.symbol) this._marketDataStats.symbols.add(data.symbol); // 条件判断 data.symbol
      if (data.exchange) this._marketDataStats.exchanges.add(data.exchange); // 条件判断 data.exchange
      this._recordMarketDataEvent('ticker', data); // 调用 _recordMarketDataEvent

      // 更新价格缓存 / Update price cache
      if (data.symbol && (data.last || data.close)) { // 条件判断 data.symbol && (data.last || data.close)
        this._lastPrices?.set(data.symbol, data.last || data.close); // 访问 _lastPrices
      } // 结束代码块

      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onTicker) { // 条件判断 this.strategy && this.strategy.onTicker
        this.strategy.onTicker(data); // 访问 strategy
      } // 结束代码块
    }); // 结束代码块

    // K 线更新事件 / Kline update event
    // 注意: MarketDataSubscriber 发出 'kline' 事件, 策略期望 'candle' 格式
    // Note: MarketDataSubscriber emits 'kline' event, strategy expects 'candle' format
    this.marketDataSubscriber.on('kline', (data) => { // 访问 marketDataSubscriber
      // 更新统计 / Update stats
      this._marketDataStats.candleCount++; // 访问 _marketDataStats
      if (data.symbol) this._marketDataStats.symbols.add(data.symbol); // 条件判断 data.symbol
      if (data.exchange) this._marketDataStats.exchanges.add(data.exchange); // 条件判断 data.exchange
      this._recordMarketDataEvent('kline', data); // 调用 _recordMarketDataEvent

      // 更新价格缓存 / Update price cache
      if (data.symbol && data.close) { // 条件判断 data.symbol && data.close
        this._lastPrices?.set(data.symbol, data.close); // 访问 _lastPrices
      } // 结束代码块

      // 只处理已闭合的 K 线 / Only process closed candles
      if (data.isClosed) { // 条件判断 data.isClosed
        this._log('debug', `[共享行情] 收到闭合K线: ${data.exchange}:${data.symbol} close=${data.close} / Received closed kline`); // 调用 _log
      } // 结束代码块

      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onCandle) { // 条件判断 this.strategy && this.strategy.onCandle
        this.strategy.onCandle(data); // 访问 strategy
      } // 结束代码块
    }); // 结束代码块

    // 深度数据事件 / Depth update event
    this.marketDataSubscriber.on('depth', (data) => { // 访问 marketDataSubscriber
      // 更新统计 / Update stats
      this._marketDataStats.orderbookCount++; // 访问 _marketDataStats
      if (data.symbol) this._marketDataStats.symbols.add(data.symbol); // 条件判断 data.symbol
      if (data.exchange) this._marketDataStats.exchanges.add(data.exchange); // 条件判断 data.exchange
      this._recordMarketDataEvent('depth', data); // 调用 _recordMarketDataEvent

      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onOrderBook) { // 条件判断 this.strategy && this.strategy.onOrderBook
        this.strategy.onOrderBook(data); // 访问 strategy
      } // 结束代码块
    }); // 结束代码块

    // 成交数据事件 / Trade update event
    this.marketDataSubscriber.on('trade', (data) => { // 访问 marketDataSubscriber
      // 更新统计 / Update stats
      this._marketDataStats.tradeCount++; // 访问 _marketDataStats
      if (data.symbol) this._marketDataStats.symbols.add(data.symbol); // 条件判断 data.symbol
      if (data.exchange) this._marketDataStats.exchanges.add(data.exchange); // 条件判断 data.exchange
      this._recordMarketDataEvent('trade', data); // 调用 _recordMarketDataEvent

      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onTrade) { // 条件判断 this.strategy && this.strategy.onTrade
        this.strategy.onTrade(data); // 访问 strategy
      } // 结束代码块
    }); // 结束代码块

    // 资金费率更新事件 / Funding rate update event
    this.marketDataSubscriber.on('fundingRate', (data) => { // 访问 marketDataSubscriber
      // 更新统计 / Update stats
      this._marketDataStats.fundingRateCount++; // 访问 _marketDataStats
      if (data.symbol) this._marketDataStats.symbols.add(data.symbol); // 条件判断 data.symbol
      if (data.exchange) this._marketDataStats.exchanges.add(data.exchange); // 条件判断 data.exchange
      this._recordMarketDataEvent('fundingRate', data); // 调用 _recordMarketDataEvent

      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onFundingRate) { // 条件判断 this.strategy && this.strategy.onFundingRate
        this.strategy.onFundingRate(data); // 访问 strategy
      } // 结束代码块
    }); // 结束代码块

    // 错误事件 / Error event
    this.marketDataSubscriber.on('error', (error) => { // 访问 marketDataSubscriber
      // 输出错误日志 / Output error log
      this._log('error', `共享行情错误: ${error.message} / Shared market data error`); // 调用 _log

      // 增加错误计数 / Increment error count
      this.errorCount++; // 访问 errorCount
    }); // 结束代码块

    // 启动行情统计定时记录 (每分钟) / Start market data stats logging (every minute)
    this._marketDataStatsTimer = setInterval(() => { // 设置 _marketDataStatsTimer
      this._logMarketDataStats(); // 调用 _logMarketDataStats
    }, 60000); // 执行语句
  } // 结束代码块

  _recordMarketDataEvent(dataType, data) { // 调用 _recordMarketDataEvent
    this._marketDataStats.lastDataAt = Date.now(); // 访问 _marketDataStats
    this._marketDataStats.lastDataType = dataType; // 访问 _marketDataStats
    if (data?.symbol) { // 条件判断 data?.symbol
      this._marketDataStats.lastSymbol = data.symbol; // 访问 _marketDataStats
    } // 结束代码块
    if (data?.exchange) { // 条件判断 data?.exchange
      this._marketDataStats.lastExchange = data.exchange; // 访问 _marketDataStats
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录行情数据统计
   * Log market data statistics
   * @private
   */
  _logMarketDataStats() { // 调用 _logMarketDataStats
    const lastAt = this._marketDataStats.lastDataAt // 定义常量 lastAt
      ? new Date(this._marketDataStats.lastDataAt).toISOString() // 执行语句
      : 'n/a'; // 执行语句
    const lastType = this._marketDataStats.lastDataType || 'n/a'; // 定义常量 lastType
    const lastSymbol = this._marketDataStats.lastSymbol || 'n/a'; // 定义常量 lastSymbol
    const lastExchange = this._marketDataStats.lastExchange || 'n/a'; // 定义常量 lastExchange

    this._log( // 调用 _log
      'info', // 执行语句
      `Market data stats (1m): ticker=${this._marketDataStats.tickerCount}, candle=${this._marketDataStats.candleCount}, orderbook=${this._marketDataStats.orderbookCount}, trade=${this._marketDataStats.tradeCount}, fundingRate=${this._marketDataStats.fundingRateCount}, last=${lastAt} ${lastType} ${lastExchange}:${lastSymbol}` // 执行语句
    ); // 结束调用或参数

    // 如果没有日志模块，跳过 / If no logger module, skip
    if (!this.loggerModule || !this.loggerModule.pnlLogger) { // 条件判断 !this.loggerModule || !this.loggerModule.pnlL...
      return; // 返回结果
    } // 结束代码块

    // 记录统计 / Log stats
    this.loggerModule.pnlLogger.logMarketDataStats({ // 访问 loggerModule
      period: '1m', // 周期
      tickerCount: this._marketDataStats.tickerCount, // ticker数量
      candleCount: this._marketDataStats.candleCount, // candle数量
      orderbookCount: this._marketDataStats.orderbookCount, // orderbook数量
      tradeCount: this._marketDataStats.tradeCount, // 交易数量
      fundingRateCount: this._marketDataStats.fundingRateCount, // 资金费率频率数量
      symbols: Array.from(this._marketDataStats.symbols), // 交易对列表
      exchanges: Array.from(this._marketDataStats.exchanges), // 交易所
      lastDataAt: this._marketDataStats.lastDataAt, // last数据At
      lastDataType: this._marketDataStats.lastDataType, // last数据类型
      lastSymbol: this._marketDataStats.lastSymbol, // last交易对
      lastExchange: this._marketDataStats.lastExchange, // last交易所
    }); // 结束代码块

    // 重置计数器 / Reset counters
    this._marketDataStats.tickerCount = 0; // 访问 _marketDataStats
    this._marketDataStats.candleCount = 0; // 访问 _marketDataStats
    this._marketDataStats.orderbookCount = 0; // 访问 _marketDataStats
    this._marketDataStats.tradeCount = 0; // 访问 _marketDataStats
    this._marketDataStats.fundingRateCount = 0; // 访问 _marketDataStats
  } // 结束代码块

  /**
   * 绑定策略事件
   * Bind strategy events
   * @private
   */
  _bindStrategyEvents() { // 调用 _bindStrategyEvents
    // 如果没有策略，跳过 / If no strategy, skip
    if (!this.strategy) { // 条件判断 !this.strategy
      return; // 返回结果
    } // 结束代码块

    // 信号事件 / Signal event
    this.strategy.on('signal', async (signal) => { // 访问 strategy
      // 链路日志: 系统收到策略信号 / Chain log: System received strategy signal
      this._log('info', `[链路] 系统收到策略信号: ${signal.symbol} ${signal.side} 数量=${signal.amount} / System received signal`); // 调用 _log

      // 增加信号计数 / Increment signal count
      this.signalCount++; // 访问 signalCount

      // 记录信号到日志文件 / Log signal to file
      if (this.loggerModule && this.loggerModule.pnlLogger) { // 条件判断 this.loggerModule && this.loggerModule.pnlLogger
        this.loggerModule.pnlLogger.logSignal({ // 访问 loggerModule
          ...signal, // 展开对象或数组
          strategy: this.options.strategy || 'unknown', // 策略
        }); // 结束代码块
      } // 结束代码块

      // 处理信号 / Handle signal
      await this._handleSignal(signal); // 等待异步结果
    }); // 结束代码块

    // 策略错误事件 / Strategy error event
    this.strategy.on('error', (error) => { // 访问 strategy
      // 输出错误日志 / Output error log
      this._log('error', `策略错误: ${error.message} / Strategy error`); // 调用 _log

      // 增加错误计数 / Increment error count
      this.errorCount++; // 访问 errorCount
    }); // 结束代码块
  } // 结束代码块

  /**
   * 绑定风控事件
   * Bind risk events
   * @private
   */
  _bindRiskEvents() { // 调用 _bindRiskEvents
    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.riskManager) { // 条件判断 !this.riskManager
      return; // 返回结果
    } // 结束代码块

    // 风控警报事件 / Risk alert event
    this.riskManager.on('alert', (alert) => { // 访问 riskManager
      // 输出警告日志 / Output warning log
      this._log('warn', `风控警报: ${alert.message} / Risk alert`); // 调用 _log

      // 触发日志模块警报 / Trigger logger module alert
      if (this.loggerModule) { // 条件判断 this.loggerModule
        this.loggerModule.alertManager?.handleRiskAlert(alert); // 访问 loggerModule
      } // 结束代码块
    }); // 结束代码块

    // 紧急平仓事件 / Emergency close event
    this.riskManager.on('emergencyClose', async (data) => { // 访问 riskManager
      // 输出错误日志 / Output error log
      this._log('error', `触发紧急平仓: ${data.reason} / Emergency close triggered`); // 调用 _log

      // 执行紧急平仓 / Execute emergency close
      await this._handleEmergencyClose(data); // 等待异步结果
    }); // 结束代码块

    // 交易暂停事件 / Trading paused event
    this.riskManager.on('tradingPaused', (data) => { // 访问 riskManager
      // 输出警告日志 / Output warning log
      this._log('warn', `交易已暂停: ${data.reason} / Trading paused`); // 调用 _log
    }); // 结束代码块
  } // 结束代码块

  /**
   * 绑定执行器事件
   * Bind executor events
   * @private
   */
  _bindExecutorEvents() { // 调用 _bindExecutorEvents
    // 如果没有执行器，跳过 / If no executor, skip
    if (!this.executor) { // 条件判断 !this.executor
      return; // 返回结果
    } // 结束代码块

    // 订单成交事件 / Order filled event
    this.executor.on('orderFilled', (data) => { // 访问 executor
      // 提取订单信息 (执行器发出的是 { orderInfo, exchangeOrder })
      // Extract order info (executor emits { orderInfo, exchangeOrder })
      const orderInfo = data.orderInfo || data; // 定义常量 orderInfo
      const exchangeOrder = data.exchangeOrder; // 定义常量 exchangeOrder

      // 构建交易对象供日志和通知使用 / Build trade object for logging and notifications
      const trade = { // 定义常量 trade
        symbol: orderInfo.symbol, // 交易对
        side: orderInfo.side, // 方向
        amount: orderInfo.filledAmount || orderInfo.amount, // 数量
        price: orderInfo.avgPrice || orderInfo.currentPrice, // 价格
        pnl: orderInfo.pnl, // 盈亏
        timestamp: orderInfo.updatedAt || Date.now(), // 时间戳
        orderId: orderInfo.exchangeOrderId || orderInfo.clientOrderId, // 订单ID
        dryRun: exchangeOrder?.info?.dryRun || false, // dryRun
      }; // 结束代码块

      // 链路日志: 订单成交 / Chain log: Order filled
      this._log('info', `[链路] 订单成交: ${trade.symbol} ${trade.side} ${trade.amount} @ ${trade.price} / Order filled`); // 调用 _log

      // 增加订单计数 / Increment order count
      this.orderCount++; // 访问 orderCount

      // 记录到日志模块 / Log to logger module
      if (this.loggerModule) { // 条件判断 this.loggerModule
        this.loggerModule.pnlLogger.logTrade(trade); // 访问 loggerModule
        this.loggerModule.telegramNotifier.sendTradeNotification(trade, this.mode); // 访问 loggerModule
      } // 结束代码块
    }); // 结束代码块

    // 订单失败事件 / Order failed event
    this.executor.on('orderFailed', (data) => { // 访问 executor
      // 链路日志: 订单失败 / Chain log: Order failed
      this._log('error', `[链路] 订单失败: ${data.error} ${data.order?.symbol || ''} ${data.order?.side || ''} / Order failed`); // 调用 _log

      // 增加错误计数 / Increment error count
      this.errorCount++; // 访问 errorCount

      // 触发警报 / Trigger alert
      if (this.loggerModule) { // 条件判断 this.loggerModule
        this.loggerModule.alertManager?.triggerOrderFailedAlert(data.order, new Error(data.error)); // 访问 loggerModule
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 运行方法 / Running Methods
  // ============================================

  /**
   * 启动系统
   * Start system
   */
  async start() { // 执行语句
    // 检查状态 / Check status
    if (this.status === SYSTEM_STATUS.RUNNING) { // 条件判断 this.status === SYSTEM_STATUS.RUNNING
      this._log('warn', '系统已在运行 / System is already running'); // 调用 _log
      return; // 返回结果
    } // 结束代码块

    // 输出日志 / Output log
    this._log('info', '启动系统... / Starting system...'); // 调用 _log

    try { // 尝试执行
      // 根据模式启动 / Start based on mode
      if (this.mode === RUN_MODE.BACKTEST) { // 条件判断 this.mode === RUN_MODE.BACKTEST
        // 运行回测 / Run backtest
        await this._runBacktest(); // 等待异步结果
      } else { // 执行语句
        // 运行交易 / Run trading
        await this._runTrading(); // 等待异步结果
      } // 结束代码块

    } catch (error) { // 执行语句
      // 输出错误日志 / Output error log
      this._log('error', `启动失败: ${error.message} / Start failed`); // 调用 _log

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.ERROR; // 设置 status

      // 抛出错误 / Throw error
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 运行回测
   * Run backtest
   * @private
   */
  async _runBacktest() { // 执行语句
    // 输出日志 / Output log
    this._log('info', '开始回测... / Starting backtest...'); // 调用 _log

    // 更新状态 / Update status
    this.status = SYSTEM_STATUS.RUNNING; // 设置 status

    // 记录开始时间 / Record start time
    this.startTime = Date.now(); // 设置 startTime

    try { // 尝试执行
      // 创建回测运行器 / Create backtest runner
      const runner = new BacktestRunner({ // 定义常量 runner
        // 数据目录 / Data directory
        dataDir: './data/historical', // 数据Dir

        // 结果输出目录 / Results output directory
        outputDir: './backtest-results', // outputDir
      }); // 结束代码块

      // 获取交易对 / Get symbols
      const symbols = this.options.symbols.length > 0 ? this.options.symbols : DEFAULT_OPTIONS.symbols; // 定义常量 symbols

      // 回测配置 / Backtest configuration
      const backtestConfig = { // 定义常量 backtestConfig
        // 策略实例 / Strategy instance
        strategy: this.strategy, // 策略

        // 交易对 (使用第一个) / Symbol (use first one)
        symbol: symbols[0].replace(':USDT', ''), // 交易对 (使用第一个)

        // 时间周期 / Timeframe
        timeframe: '1h', // 时间周期

        // 开始日期 / Start date
        startDate: this.options.startDate || '2024-01-01', // 启动Date

        // 结束日期 / End date
        endDate: this.options.endDate || new Date().toISOString().split('T')[0], // endDate

        // 初始资金 / Initial capital
        initialCapital: this.options.capital || DEFAULT_OPTIONS.initialCapital, // 初始资金

        // 手续费率 / Commission rate
        commissionRate: 0.0004, // 手续费频率

        // 滑点 / Slippage
        slippage: 0.0001, // 滑点
      }; // 结束代码块

      // 运行回测 / Run backtest
      const results = await runner.run(backtestConfig); // 定义常量 results

      // 输出结果 / Output results
      this._printBacktestResults(results); // 调用 _printBacktestResults

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.STOPPED; // 设置 status

      // 返回结果 / Return results
      return results; // 返回结果

    } catch (error) { // 执行语句
      // 输出错误日志 / Output error log
      this._log('error', `回测失败: ${error.message} / Backtest failed`); // 调用 _log

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.ERROR; // 设置 status

      // 抛出错误 / Throw error
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 运行交易
   * Run trading
   * @private
   */
  async _runTrading() { // 执行语句
    // 输出日志 / Output log
    this._log('info', `开始${this.mode === RUN_MODE.LIVE ? '实盘' : '影子'}交易... / Starting ${this.mode} trading...`); // 调用 _log

    // 更新状态 / Update status
    this.status = SYSTEM_STATUS.RUNNING; // 设置 status

    // 记录开始时间 / Record start time
    this.startTime = Date.now(); // 设置 startTime

    // 1. 启动日志模块 / Start logger module
    if (this.loggerModule) { // 条件判断 this.loggerModule
      await this.loggerModule.startAll(); // 等待异步结果
    } // 结束代码块

    // 2. 启动风控管理器 / Start risk manager
    if (this.riskManager) { // 条件判断 this.riskManager
      this.riskManager.start(); // 访问 riskManager
    } // 结束代码块

    // 3. 启动行情引擎 / Start market data engine (必须先启动才能订阅)
    if (this.marketDataEngine) { // 条件判断 this.marketDataEngine
      await this.marketDataEngine.start(); // 等待异步结果
    } // 结束代码块

    // 4. 订阅行情 / Subscribe to market data
    await this._subscribeMarketData(); // 等待异步结果

    // 5. 启动策略 (如果策略有 start 方法) / Start strategy (if strategy has start method)
    if (this.strategy && typeof this.strategy.start === 'function') { // 条件判断 this.strategy && typeof this.strategy.start =...
      this._log('info', '启动策略... / Starting strategy...'); // 调用 _log
      await this.strategy.start(); // 等待异步结果
    } // 结束代码块

    // 6. 发送 PM2 ready 信号 / Send PM2 ready signal
    if (process.send) { // 条件判断 process.send
      process.send('ready'); // 调用 process.send
    } // 结束代码块

    // 输出日志 / Output log
    this._log('info', '✅ 系统已启动，等待交易信号... / System started, waiting for signals...'); // 调用 _log

    // 输出状态信息 / Output status info
    this._printStatus(); // 调用 _printStatus

    // 发出启动事件 / Emit started event
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 订阅行情数据
   * Subscribe to market data
   * @private
   */
  async _subscribeMarketData() { // 执行语句
    // 检查是否使用共享行情模式 / Check if using shared market data mode
    const useSharedMarketData = this.marketDataSubscriber && !this.marketDataEngine; // 定义常量 useSharedMarketData

    // 获取基础交易对 / Get base symbols
    const baseSymbols = this.options.symbols.length > 0 // 定义常量 baseSymbols
      ? this.options.symbols // 执行语句
      : DEFAULT_OPTIONS.symbols; // 执行语句

    // 获取策略所需的额外交易对 / Get additional symbols required by strategy
    let strategySymbols = []; // 定义变量 strategySymbols
    if (this.strategy && typeof this.strategy.getRequiredSymbols === 'function') { // 条件判断 this.strategy && typeof this.strategy.getRequ...
      strategySymbols = this.strategy.getRequiredSymbols(); // 赋值 strategySymbols
    } // 结束代码块

    // 合并并去重 / Merge and deduplicate
    const symbolSet = new Set([...baseSymbols, ...strategySymbols]); // 定义常量 symbolSet
    const symbols = Array.from(symbolSet); // 定义常量 symbols

    // 获取策略所需的数据类型 / Get data types required by strategy
    let requiredDataTypes = ['ticker', 'depth', 'trade', 'fundingRate', 'kline']; // 默认全部 / Default all
    if (this.strategy && typeof this.strategy.getRequiredDataTypes === 'function') { // 条件判断 this.strategy && typeof this.strategy.getRequ...
      requiredDataTypes = this.strategy.getRequiredDataTypes(); // 赋值 requiredDataTypes
    } // 结束代码块

    // 输出日志 / Output log
    this._log('info', `订阅行情: ${symbols.join(', ')} / Subscribing market data`); // 调用 _log
    this._log('info', `数据类型: ${requiredDataTypes.join(', ')} / Data types`); // 调用 _log
    if (strategySymbols.length > 0) { // 条件判断 strategySymbols.length > 0
      this._log('info', `策略额外需要的交易对: ${strategySymbols.join(', ')} / Strategy required symbols`); // 调用 _log
    } // 结束代码块

    // 共享行情模式：使用 MarketDataSubscriber / Shared mode: use MarketDataSubscriber
    if (useSharedMarketData) { // 条件判断 useSharedMarketData
      this._log('info', '使用共享行情订阅器 / Using shared market data subscriber'); // 调用 _log

      // 获取已连接的交易所列表 / Get connected exchanges
      const connectedExchanges = Array.from(this.exchanges.keys()); // 定义常量 connectedExchanges

      // 遍历订阅 / Iterate and subscribe
      for (const symbol of symbols) { // 循环 const symbol of symbols
        for (const dataType of requiredDataTypes) { // 循环 const dataType of requiredDataTypes
          // 为每个交易所订阅 / Subscribe for each exchange
          for (const exchange of connectedExchanges) { // 循环 const exchange of connectedExchanges
            try { // 尝试执行
              await this.marketDataSubscriber.subscribe(exchange, symbol, [dataType]); // 等待异步结果
            } catch (err) { // 执行语句
              this._log('warn', `订阅失败 ${exchange}:${symbol}:${dataType}: ${err.message} / Subscribe failed`); // 调用 _log
            } // 结束代码块
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      // 预加载历史 K 线数据 (共享模式也需要预加载) / Preload historical candles (also needed in shared mode)
      if (requiredDataTypes.includes('kline')) { // 条件判断 requiredDataTypes.includes('kline')
        await this._preloadHistoricalCandles(symbols); // 等待异步结果
      } // 结束代码块

      return; // 返回结果
    } // 结束代码块

    // 独立模式：使用 MarketDataEngine / Independent mode: use MarketDataEngine
    if (!this.marketDataEngine) { // 条件判断 !this.marketDataEngine
      throw new Error('MarketDataEngine 未初始化 / MarketDataEngine not initialized'); // 抛出异常
    } // 结束代码块

    // 遍历订阅 / Iterate and subscribe
    for (const symbol of symbols) { // 循环 const symbol of symbols
      // 按策略需求订阅数据类型 / Subscribe based on strategy requirements
      for (const dataType of requiredDataTypes) { // 循环 const dataType of requiredDataTypes
        await this.marketDataEngine.subscribe(symbol, [dataType]); // 等待异步结果
      } // 结束代码块
    } // 结束代码块

    // 预加载历史 K 线数据 (仅当策略需要 kline 时) / Preload historical candle data (only if kline required)
    if (requiredDataTypes.includes('kline')) { // 条件判断 requiredDataTypes.includes('kline')
      await this._preloadHistoricalCandles(symbols); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 预加载历史 K 线数据
   * Preload historical candle data
   * @param {Array<string>} symbols - 交易对列表 / Symbol list
   * @private
   */
  async _preloadHistoricalCandles(symbols) { // 执行语句
    // 如果没有策略，跳过 / If no strategy, skip
    if (!this.strategy) { // 条件判断 !this.strategy
      return; // 返回结果
    } // 结束代码块

    // 输出日志 / Output log
    this._log('info', '预加载历史 K 线数据... / Preloading historical candle data...'); // 调用 _log

    // 获取 K 线时间周期 (默认 1h) / Get kline timeframe (default 1h)
    const timeframe = this.config?.strategy?.timeframe || '1h'; // 定义常量 timeframe

    // Get history limit (default 200, enough for complex strategies like cointegration, multi-timeframe)
    const maxCandles = this.config?.marketData?.cache?.maxCandles; // 定义常量 maxCandles
    const limit = Number.isFinite(maxCandles) ? Math.max(1, maxCandles) : 200; // 定义常量 limit

    for (const symbol of symbols) { // 循环 const symbol of symbols
      try { // 尝试执行
        // 使用交易所 API 获取历史 K 线 / Use exchange API to fetch historical candles
        const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit); // 定义常量 ohlcv

        if (ohlcv && ohlcv.length > 0) { // 条件判断 ohlcv && ohlcv.length > 0
          // 传递给策略初始化历史 / Pass to strategy to initialize history
          if (this.strategy.initCandleHistory) { // 条件判断 this.strategy.initCandleHistory
            this.strategy.initCandleHistory(symbol, ohlcv); // 访问 strategy
          } // 结束代码块

          this._log('info', `已加载 ${symbol} 历史 K 线: ${ohlcv.length} 根 (${timeframe}) / Loaded historical candles`); // 调用 _log
        } else { // 执行语句
          this._log('warn', `${symbol} 无历史 K 线数据 / No historical candle data`); // 调用 _log
        } // 结束代码块
      } catch (error) { // 执行语句
        // 记录错误但继续 / Log error but continue
        this._log('error', `加载 ${symbol} 历史 K 线失败: ${error.message} / Failed to load historical candles`); // 调用 _log
      } // 结束代码块
    } // 结束代码块

    this._log('info', '历史 K 线预加载完成 / Historical candle preloading completed'); // 调用 _log
  } // 结束代码块

  // ============================================
  // 信号处理方法 / Signal Handling Methods
  // ============================================

  /**
   * 处理交易信号
   * Handle trading signal
   *
   * @param {Object} signal - 交易信号 / Trading signal
   * @private
   */
  async _handleSignal(signal) { // 执行语句
    try { // 尝试执行
      // 链路日志: 开始处理信号 / Chain log: Start handling signal
      this._log('info', `[链路] 开始处理信号: ${signal.symbol} ${signal.side} / Start handling signal`); // 调用 _log

      // 1. 风控检查 / Risk check
      if (this.riskManager) { // 条件判断 this.riskManager
        // 链路日志: 进入风控检查 / Chain log: Entering risk check
        this._log('info', `[链路] 进入风控检查: ${signal.symbol} ${signal.side} 数量=${signal.amount} / Entering risk check`); // 调用 _log

        // 获取检查结果 / Get check result
        const riskCheck = this.riskManager.checkOrder({ // 定义常量 riskCheck
          symbol: signal.symbol, // 交易对
          side: signal.side, // 方向
          amount: signal.amount, // 数量
          price: signal.price, // 价格
        }); // 结束代码块

        // 如果风控拒绝 / If risk rejected
        if (!riskCheck.allowed) { // 条件判断 !riskCheck.allowed
          // 链路日志: 风控拒绝 / Chain log: Risk rejected
          this._log('warn', `[链路] 风控拒绝信号: ${riskCheck.reason} / Risk rejected signal`); // 调用 _log

          // 发出信号拒绝事件 / Emit signal rejected event
          this.emit('signalRejected', { signal, reason: riskCheck.reason }); // 调用 emit

          // 返回 / Return
          return; // 返回结果
        } // 结束代码块

        // 链路日志: 风控通过 / Chain log: Risk check passed
        this._log('info', `[链路] 风控检查通过: ${signal.symbol} ${signal.side} / Risk check passed`); // 调用 _log
      } // 结束代码块

      // 2. 执行订单 / Execute order
      if (this.executor) { // 条件判断 this.executor
        // 获取交易所 ID / Get exchange ID
        const exchangeId = this.options.exchange || 'binance'; // 定义常量 exchangeId

        // 构建订单参数 / Build order parameters
        const orderParams = { // 定义常量 orderParams
          exchangeId, // 执行语句
          symbol: signal.symbol, // 交易对
          side: signal.side, // 方向
          amount: signal.amount, // 数量
          price: signal.price, // 价格
          type: signal.orderType || 'market', // 类型
        }; // 结束代码块

        // 链路日志: 提交订单到执行器 / Chain log: Submitting order to executor
        this._log('info', `[链路] 提交订单到执行器: ${exchangeId} ${signal.symbol} ${signal.side} 数量=${signal.amount} 类型=${orderParams.type} / Submitting order to executor`); // 调用 _log

        // 执行订单 / Execute order
        const result = await this.executor.executeOrder(orderParams); // 定义常量 result

        // 输出日志 / Output log
        if (result.success) { // 条件判断 result.success
          // 链路日志: 订单执行成功 / Chain log: Order executed successfully
          this._log('info', `[链路] 订单执行成功: orderId=${result.orderId} ${signal.symbol} ${signal.side} / Order executed successfully`); // 调用 _log
        } else { // 执行语句
          // 链路日志: 订单执行失败 / Chain log: Order execution failed
          this._log('error', `[链路] 订单执行失败: ${result.error} ${signal.symbol} ${signal.side} / Order execution failed`); // 调用 _log
        } // 结束代码块

        // 发出订单执行事件 / Emit order executed event
        this.emit('orderExecuted', { signal, result }); // 调用 emit
      } else { // 执行语句
        // 链路日志: 无执行器 / Chain log: No executor
        this._log('warn', `[链路] 无订单执行器，信号未执行 / No executor, signal not executed`); // 调用 _log
      } // 结束代码块

    } catch (error) { // 执行语句
      // 链路日志: 信号处理异常 / Chain log: Signal handling exception
      this._log('error', `[链路] 信号处理异常: ${error.message} / Signal handling exception`); // 调用 _log

      // 增加错误计数 / Increment error count
      this.errorCount++; // 访问 errorCount

      // 发出信号错误事件 / Emit signal error event
      this.emit('signalError', { signal, error: error.message }); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理紧急平仓
   * Handle emergency close
   *
   * @param {Object} data - 紧急平仓数据 / Emergency close data
   * @private
   */
  async _handleEmergencyClose(data) { // 执行语句
    // 输出日志 / Output log
    this._log('error', `执行紧急平仓: ${data.reason} / Executing emergency close`); // 调用 _log

    try { // 尝试执行
      // 如果有执行器 / If has executor
      if (this.executor) { // 条件判断 this.executor
        // 获取交易所 ID / Get exchange ID
        const exchangeId = this.options.exchange || 'binance'; // 定义常量 exchangeId

        // 执行紧急平仓 / Execute emergency close
        const result = await this.executor.emergencyCloseAll(exchangeId); // 定义常量 result

        // 输出日志 / Output log
        this._log('info', `紧急平仓完成: 已平仓 ${result.closedCount} 个仓位 / Emergency close complete`); // 调用 _log

        // 发送通知 / Send notification
        if (this.loggerModule) { // 条件判断 this.loggerModule
          this.loggerModule.alertManager?.triggerEmergencyCloseCompletedAlert(result); // 访问 loggerModule
        } // 结束代码块
      } // 结束代码块

    } catch (error) { // 执行语句
      // 输出错误日志 / Output error log
      this._log('error', `紧急平仓失败: ${error.message} / Emergency close failed`); // 调用 _log
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 关闭方法 / Shutdown Methods
  // ============================================

  /**
   * 优雅关闭
   * Graceful shutdown
   *
   * @param {number} exitCode - 退出码 / Exit code
   */
  async shutdown(exitCode = 0) { // 执行语句
    // 如果已在关闭中，跳过 / If already shutting down, skip
    if (this.isShuttingDown) { // 条件判断 this.isShuttingDown
      return; // 返回结果
    } // 结束代码块

    // 标记为关闭中 / Mark as shutting down
    this.isShuttingDown = true; // 设置 isShuttingDown

    // 输出日志 / Output log
    this._log('info', '开始优雅关闭... / Starting graceful shutdown...'); // 调用 _log

    // 更新状态 / Update status
    this.status = SYSTEM_STATUS.STOPPING; // 设置 status

    try { // 尝试执行
      // 1. 停止策略 / Stop strategy
      if (this.strategy && this.strategy.stop) { // 条件判断 this.strategy && this.strategy.stop
        this._log('info', '停止策略... / Stopping strategy...'); // 调用 _log
        await this.strategy.stop(); // 等待异步结果
      } // 结束代码块

      // 2. 取消所有挂单 / Cancel all pending orders
      if (this.executor && this.mode === RUN_MODE.LIVE) { // 条件判断 this.executor && this.mode === RUN_MODE.LIVE
        this._log('info', '取消所有挂单... / Canceling all pending orders...'); // 调用 _log
        try { // 尝试执行
          const exchangeId = this.options.exchange || 'binance'; // 定义常量 exchangeId
          await this.executor.cancelAllPendingOrders(exchangeId); // 等待异步结果
        } catch (e) { // 执行语句
          this._log('warn', `取消挂单失败: ${e.message} / Failed to cancel orders`); // 调用 _log
        } // 结束代码块
      } // 结束代码块

      // 3. 停止行情引擎 / Stop market data engine
      if (this.marketDataEngine) { // 条件判断 this.marketDataEngine
        this._log('info', '停止行情引擎... / Stopping market data engine...'); // 调用 _log
        this.marketDataEngine.stop(); // 访问 marketDataEngine
      } // 结束代码块

      // 3.5 清理行情统计定时器 / Clear market data stats timer
      if (this._marketDataStatsTimer) { // 条件判断 this._marketDataStatsTimer
        clearInterval(this._marketDataStatsTimer); // 调用 clearInterval
        this._marketDataStatsTimer = null; // 设置 _marketDataStatsTimer
      } // 结束代码块

      // 4. 停止风控管理器 / Stop risk manager
      if (this.riskManager) { // 条件判断 this.riskManager
        this._log('info', '停止风控管理器... / Stopping risk manager...'); // 调用 _log
        this.riskManager.stop(); // 访问 riskManager
      } // 结束代码块

      // 5. 停止日志模块 / Stop logger module
      if (this.loggerModule) { // 条件判断 this.loggerModule
        this._log('info', '停止日志模块... / Stopping logger module...'); // 调用 _log
        await this.loggerModule.stopAll(); // 等待异步结果
      } // 结束代码块

      // 6. 关闭交易所连接 / Close exchange connection
      if (this.exchange && this.exchange.close) { // 条件判断 this.exchange && this.exchange.close
        this._log('info', '关闭交易所连接... / Closing exchange connection...'); // 调用 _log
        await this.exchange.close(); // 等待异步结果
      } // 结束代码块

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.STOPPED; // 设置 status

      // 输出日志 / Output log
      this._log('info', '✅ 系统已安全关闭 / System safely shutdown'); // 调用 _log

      // 输出统计信息 / Output statistics
      this._printFinalStats(); // 调用 _printFinalStats

      // 发出关闭事件 / Emit shutdown event
      this.emit('shutdown'); // 调用 emit

    } catch (error) { // 执行语句
      // 输出错误日志 / Output error log
      this._log('error', `关闭过程出错: ${error.message} / Shutdown error`); // 调用 _log
    } // 结束代码块

    // 退出进程 / Exit process
    process.exit(exitCode); // 退出进程
  } // 结束代码块

  // ============================================
  // 输出方法 / Output Methods
  // ============================================

  /**
   * 输出启动横幅
   * Print startup banner
   * @private
   */
  _printBanner() { // 调用 _printBanner
    // 横幅文本 / Banner text
    const banner = `
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║      ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗               ║
║     ██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝               ║
║     ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║                  ║
║     ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║                  ║
║     ╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║                  ║
║      ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝                  ║
║                                                                  ║
║              量化交易系统 / Quant Trading System                   ║
║                       v1.0.0                                     ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`; // 执行语句

    // 输出横幅 / Output banner
    console.log(banner); // 控制台输出
  } // 结束代码块

  /**
   * 输出当前状态
   * Print current status
   * @private
   */
  _printStatus() { // 调用 _printStatus
    // 状态信息 / Status info
    const statusInfo = `
┌──────────────────────────────────────────────────────────────────┐
│ 系统状态 / System Status                                          │
├──────────────────────────────────────────────────────────────────┤
│ 运行模式 / Mode:        ${this.mode.padEnd(41)}│
│ 策略 / Strategy:        ${(this.options.strategy || DEFAULT_OPTIONS.strategy).padEnd(41)}│
│ 交易对 / Symbols:       ${(this.options.symbols.join(', ') || DEFAULT_OPTIONS.symbols.join(', ')).substring(0, 41).padEnd(41)}│
│ 交易所 / Exchange:      ${(this.options.exchange || 'binance').padEnd(41)}│
│ 启动时间 / Start Time:  ${new Date(this.startTime).toISOString().padEnd(41)}│
└──────────────────────────────────────────────────────────────────┘
`; // 执行语句

    // 输出状态 / Output status
    console.log(statusInfo); // 控制台输出
  } // 结束代码块

  /**
   * 输出回测结果
   * Print backtest results
   *
   * @param {Object} results - 回测结果 / Backtest results
   * @private
   */
  _printBacktestResults(results) { // 调用 _printBacktestResults
    // 格式化数值 / Format value
    const fmt = (val, suffix = '') => { // 定义函数 fmt
      if (val === null || val === undefined) return 'N/A'.padEnd(12); // 条件判断 val === null || val === undefined
      return (typeof val === 'number' ? val.toFixed(2) + suffix : String(val)).padEnd(12); // 返回结果
    }; // 结束代码块

    // 结果信息 / Results info
    const resultsInfo = `
╔════════════════════════════════════════════════════════════════════════════════╗
║                         回测结果 / Backtest Results                              ║
╠════════════════════════════════════════════════════════════════════════════════╣
║                              账户统计 / Account                                  ║
╠────────────────────────────────────────────────────────────────────────────────╣
║ 初始资金 / Initial:     ${fmt(results.initialCapital)}    最终资金 / Final:      ${fmt(results.finalEquity)}    ║
║ 总收益 / Return:        ${fmt(results.totalReturn, '%')}    收益额 / Amount:       ${fmt(results.totalReturnAmount)}    ║
╠────────────────────────────────────────────────────────────────────────────────╣
║                           核心指标 / Core Metrics                                ║
╠────────────────────────────────────────────────────────────────────────────────╣
║ 1.年化收益 / Annual:    ${fmt(results.annualReturn, '%')}    2.最大回撤 / MaxDD:    ${fmt(results.maxDrawdownPercent, '%')}    ║
║ 3.Calmar比率:           ${fmt(results.calmarRatio)}    4.Sharpe比率:          ${fmt(results.sharpeRatio)}    ║
║ 5.换手率(年) / Turn:    ${fmt(results.turnoverRate, '%')}    6.交易成本率 / Cost:   ${fmt(results.tradingCostRate, '%')}    ║
║ 7.胜率 / Win Rate:      ${fmt(results.winRate, '%')}    8.盈亏比 / PF:         ${fmt(results.profitFactor)}    ║
╠────────────────────────────────────────────────────────────────────────────────╣
║                           高级指标 / Advanced                                    ║
╠────────────────────────────────────────────────────────────────────────────────╣
║ 9.实盘偏差 / Live Dev:  ${fmt(results.liveVsBacktestDeviation, '%')}    10.样本外年化 / OOS:   ${fmt(results.outOfSampleReturn, '%')}    ║
║ 11.IC均值 / IC Mean:    ${fmt(results.icMean)}    12.ICIR:               ${fmt(results.icir)}    ║
║ 13.容量(亿) / Cap:      ${fmt(results.capacityEstimate)}    14.前10占比 / Top10:   ${fmt(results.top10HoldingRatio, '%')}    ║
║ 15.最大仓位 / MaxPos:   ${fmt(results.maxPositionRatio, '%')}    16.成交额占比 / Vol:   ${fmt(results.avgDailyVolumeRatio, '%')}    ║
║ 17.风控次数 / Risk:     ${fmt(results.riskControlTriggers)}    18.曲线相关 / Corr:    ${fmt(results.equityCurveCorrelation)}    ║
╠────────────────────────────────────────────────────────────────────────────────╣
║                           交易统计 / Trade Stats                                 ║
╠────────────────────────────────────────────────────────────────────────────────╣
║ 交易次数 / Trades:      ${fmt(results.totalTrades)}    盈利次数 / Wins:       ${fmt(results.winningTrades)}    ║
║ 亏损次数 / Losses:      ${fmt(results.losingTrades)}    总手续费 / Comm:       ${fmt(results.totalCommission)}    ║
╚════════════════════════════════════════════════════════════════════════════════╝
`; // 执行语句

    // 输出结果 / Output results
    console.log(resultsInfo); // 控制台输出
  } // 结束代码块

  /**
   * 输出最终统计
   * Print final statistics
   * @private
   */
  _printFinalStats() { // 调用 _printFinalStats
    // 计算运行时间 / Calculate running time
    const runningTime = this.startTime // 定义常量 runningTime
      ? Math.floor((Date.now() - this.startTime) / 1000) // 执行语句
      : 0; // 执行语句

    // 统计信息 / Statistics info
    const statsInfo = `
┌──────────────────────────────────────────────────────────────────┐
│ 运行统计 / Running Statistics                                     │
├──────────────────────────────────────────────────────────────────┤
│ 运行时间 / Running Time:  ${String(runningTime + ' 秒 / seconds').padEnd(40)}│
│ 信号数量 / Signal Count:  ${String(this.signalCount).padEnd(40)}│
│ 订单数量 / Order Count:   ${String(this.orderCount).padEnd(40)}│
│ 错误数量 / Error Count:   ${String(this.errorCount).padEnd(40)}│
└──────────────────────────────────────────────────────────────────┘
`; // 执行语句

    // 输出统计 / Output statistics
    console.log(statsInfo); // 控制台输出
  } // 结束代码块

  /**
   * 日志输出
   * Log output
   *
   * @param {string} level - 日志级别 / Log level
   * @param {string} message - 日志消息 / Log message
   * @private
   */
  _log(level, message) { // 调用 _log
    // 获取时间戳 / Get timestamp
    const timestamp = new Date().toISOString(); // 定义常量 timestamp

    // 级别前缀映射 / Level prefix mapping
    const levelPrefix = { // 定义常量 levelPrefix
      info: 'ℹ️ ', // info
      warn: '⚠️ ', // warn
      error: '❌', // 错误
      debug: '🔍', // debug
    }; // 结束代码块

    // 获取前缀 / Get prefix
    const prefix = levelPrefix[level] || ''; // 定义常量 prefix

    // 构建完整消息 / Build full message
    const fullMessage = `[${timestamp}] ${prefix} ${message}`; // 定义常量 fullMessage

    // 根据级别输出 / Output based on level
    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'debug': // 分支 'debug'
        if (this.options.verbose) { // 条件判断 this.options.verbose
          console.log(fullMessage); // 控制台输出
        } // 结束代码块
        break; // 跳出循环或分支
      case 'info': // 分支 'info'
      default: // 默认
        console.log(fullMessage); // 控制台输出
    } // 结束代码块

    // 记录到日志模块 / Log to logger module
    if (this.loggerModule && this.loggerModule.pnlLogger) { // 条件判断 this.loggerModule && this.loggerModule.pnlLogger
      this.loggerModule.pnlLogger.logSystem(level, message); // 访问 loggerModule
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 获取系统状态
   * Get system status
   *
   * @returns {Object} 系统状态 / System status
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      // 系统状态 / System status
      status: this.status, // 状态系统状态

      // 运行模式 / Running mode
      mode: this.mode, // 运行模式

      // 启动时间 / Start time
      startTime: this.startTime, // 启动时间

      // 运行时间 / Running time
      uptime: this.startTime ? Date.now() - this.startTime : 0, // uptime

      // 统计信息 / Statistics
      stats: { // stats
        signalCount: this.signalCount, // 信号数量
        orderCount: this.orderCount, // 订单数量
        errorCount: this.errorCount, // 错误数量
      }, // 结束代码块

      // 组件状态 / Component status
      components: { // components组件状态
        exchange: !!this.exchange, // 交易所
        marketData: !!this.marketDataEngine, // 市场数据
        strategy: !!this.strategy, // 策略
        riskManager: !!this.riskManager, // 风险Manager
        executor: !!this.executor, // executor
        logger: !!this.loggerModule, // 日志
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 主入口函数 / Main Entry Function
// ============================================

/**
 * 主函数
 * Main function
 */
async function main() { // 定义函数 main
  // 解析命令行参数 / Parse command line arguments
  const args = parseArgs(); // 定义常量 args

  // 如果请求帮助，显示帮助并退出 / If help requested, show help and exit
  if (args.help) { // 条件判断 args.help
    showHelp(); // 调用 showHelp
    process.exit(0); // 退出进程
  } // 结束代码块

  // 如果没有指定模式，显示帮助并退出 / If no mode specified, show help and exit
  if (!args.mode) { // 条件判断 !args.mode
    console.error('错误: 请指定运行模式 (backtest, shadow, live) / Error: Please specify running mode'); // 控制台输出
    console.log('使用 --help 查看帮助 / Use --help for help'); // 控制台输出
    process.exit(1); // 退出进程
  } // 结束代码块

  // 验证模式 / Validate mode
  if (!Object.values(RUN_MODE).includes(args.mode)) { // 条件判断 !Object.values(RUN_MODE).includes(args.mode)
    console.error(`错误: 无效的运行模式 "${args.mode}" / Error: Invalid running mode`); // 控制台输出
    console.log('有效模式: backtest, shadow, live / Valid modes: backtest, shadow, live'); // 控制台输出
    process.exit(1); // 退出进程
  } // 结束代码块

  // 创建运行器实例 / Create runner instance
  const runner = new TradingSystemRunner({ // 定义常量 runner
    // 运行模式 / Running mode
    mode: args.mode, // 运行模式

    // 策略名称 / Strategy name
    strategy: args.strategy, // 策略

    // 交易对 / Symbols
    symbols: args.symbols, // 交易对列表

    // 交易所 / Exchange
    exchange: args.exchange, // 交易所

    // 开始日期 / Start date
    startDate: args.startDate, // 启动Date

    // 结束日期 / End date
    endDate: args.endDate, // endDate

    // 初始资金 / Initial capital
    capital: args.capital, // 资金

    // 详细模式 / Verbose mode
    verbose: args.verbose, // 详细模式
  }); // 结束代码块

  try { // 尝试执行
    // 初始化系统 / Initialize system
    await runner.initialize(); // 等待异步结果

    // 启动系统 / Start system
    await runner.start(); // 等待异步结果

  } catch (error) { // 执行语句
    // 输出错误 / Output error
    console.error(`启动失败: ${error.message} / Start failed`); // 控制台输出
    console.error(error.stack); // 控制台输出

    // 退出 / Exit
    process.exit(1); // 退出进程
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

// 导出主运行器类 / Export main runner class
export { TradingSystemRunner }; // 导出命名成员

// 导出常量 / Export constants
export { RUN_MODE, SYSTEM_STATUS }; // 导出命名成员

// 导出解析函数 / Export parse function
export { parseArgs, showHelp }; // 导出命名成员

// 默认导出主函数 / Default export main function
export default main; // 默认导出

// ============================================
// 执行主函数 / Execute Main Function
// ============================================

// 运行主函数 / Run main function
main(); // 调用 main
