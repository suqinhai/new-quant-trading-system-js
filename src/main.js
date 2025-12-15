#!/usr/bin/env node

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
import 'dotenv/config';

// 导入路径模块 / Import path module
import path from 'path';

// 导入文件 URL 转换 / Import file URL conversion
import { fileURLToPath } from 'url';

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// ============================================
// 导入项目模块 / Import Project Modules
// ============================================

// 导入配置加载器 / Import configuration loader
import { loadConfig } from '../config/index.js';

// 导入交易所工厂 / Import exchange factory
import { ExchangeFactory } from './exchange/index.js';

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from './marketdata/index.js';

// 导入策略注册表 / Import strategy registry
import { StrategyRegistry } from './strategies/index.js';

// 导入风控模块 / Import risk module
import { AdvancedRiskManager } from './risk/index.js';

// 导入智能订单执行器 / Import smart order executor
import { SmartOrderExecutor } from './executor/index.js';

// 导入日志模块 / Import logger module
import createLoggerModule from './logger/index.js';

// 导入回测引擎 / Import backtest engine
import { BacktestEngine, BacktestRunner } from './backtest/index.js';

// ============================================
// 常量定义 / Constants Definition
// ============================================

// 获取当前文件路径 / Get current file path
const __filename = fileURLToPath(import.meta.url);

// 获取当前目录路径 / Get current directory path
const __dirname = path.dirname(__filename);

/**
 * 运行模式枚举
 * Running mode enum
 */
const RUN_MODE = {
  BACKTEST: 'backtest',   // 回测模式 / Backtest mode
  SHADOW: 'shadow',       // 影子模式 / Shadow mode
  LIVE: 'live',           // 实盘模式 / Live mode
};

/**
 * 系统状态枚举
 * System status enum
 */
const SYSTEM_STATUS = {
  STOPPED: 'stopped',     // 已停止 / Stopped
  STARTING: 'starting',   // 启动中 / Starting
  RUNNING: 'running',     // 运行中 / Running
  STOPPING: 'stopping',   // 停止中 / Stopping
  ERROR: 'error',         // 错误 / Error
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_OPTIONS = {
  // 策略配置 / Strategy configuration
  strategy: 'FundingArb',           // 默认策略 / Default strategy

  // 交易对配置 / Symbol configuration
  symbols: ['BTC/USDT:USDT'],       // 默认交易对 / Default symbols

  // 回测配置 / Backtest configuration
  startDate: null,                   // 开始日期 / Start date
  endDate: null,                     // 结束日期 / End date
  initialCapital: 10000,             // 初始资金 / Initial capital

  // 交易所配置 / Exchange configuration
  exchange: 'binance',               // 默认交易所 / Default exchange

  // 日志配置 / Logging configuration
  verbose: true,                     // 详细日志 / Verbose logging
};

// ============================================
// 命令行解析 / CLI Argument Parsing
// ============================================

/**
 * 解析命令行参数
 * Parse command line arguments
 *
 * @returns {Object} 解析后的参数 / Parsed arguments
 */
function parseArgs() {
  // 获取命令行参数 / Get command line arguments
  const args = process.argv.slice(2);

  // 初始化结果对象 / Initialize result object
  const result = {
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
  };

  // 遍历参数 / Iterate arguments
  for (let i = 0; i < args.length; i++) {
    // 获取当前参数 / Get current argument
    const arg = args[i];

    // 检查是否为模式参数 / Check if mode argument
    if (arg === 'backtest' || arg === 'shadow' || arg === 'live') {
      // 设置运行模式 / Set running mode
      result.mode = arg;
      continue;
    }

    // 检查是否为选项参数 / Check if option argument
    switch (arg) {
      // 策略选项 / Strategy option
      case '--strategy':
      case '-s':
        // 获取下一个参数作为值 / Get next argument as value
        result.strategy = args[++i];
        break;

      // 交易对选项 / Symbol option
      case '--symbol':
      case '--symbols':
        // 获取下一个参数并按逗号分割 / Get next argument and split by comma
        result.symbols = args[++i]?.split(',') || [];
        break;

      // 交易所选项 / Exchange option
      case '--exchange':
      case '-e':
        // 获取下一个参数作为值 / Get next argument as value
        result.exchange = args[++i];
        break;

      // 开始日期选项 / Start date option
      case '--start':
      case '--start-date':
        // 获取下一个参数作为值 / Get next argument as value
        result.startDate = args[++i];
        break;

      // 结束日期选项 / End date option
      case '--end':
      case '--end-date':
        // 获取下一个参数作为值 / Get next argument as value
        result.endDate = args[++i];
        break;

      // 初始资金选项 / Initial capital option
      case '--capital':
      case '-c':
        // 获取下一个参数并转换为数字 / Get next argument and convert to number
        result.capital = parseFloat(args[++i]);
        break;

      // 配置文件选项 / Config file option
      case '--config':
        // 获取下一个参数作为值 / Get next argument as value
        result.config = args[++i];
        break;

      // 详细模式选项 / Verbose option
      case '--verbose':
      case '-v':
        // 启用详细模式 / Enable verbose mode
        result.verbose = true;
        break;

      // 帮助选项 / Help option
      case '--help':
      case '-h':
        // 显示帮助 / Show help
        result.help = true;
        break;

      // 未知选项 / Unknown option
      default:
        // 如果以 -- 开头，警告未知选项 / If starts with --, warn unknown option
        if (arg.startsWith('-')) {
          console.warn(`警告: 未知选项 ${arg} / Warning: Unknown option ${arg}`);
        }
    }
  }

  // 返回解析结果 / Return parsed result
  return result;
}

/**
 * 显示帮助信息
 * Show help information
 */
function showHelp() {
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
                            可选: SMA, RSI, MACD, Grid, FundingArb
                            Available: SMA, RSI, MACD, Grid, FundingArb

  --symbol, --symbols <s>   交易对 (逗号分隔) / Symbols (comma separated)
                            例如 / Example: BTC/USDT:USDT,ETH/USDT:USDT

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
  node src/main.js shadow --strategy Grid --symbols BTC/USDT:USDT

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
`;

  // 输出帮助信息 / Output help information
  console.log(helpText);
}

// ============================================
// 主运行器类 / Main Runner Class
// ============================================

/**
 * 量化交易系统主运行器
 * Quant Trading System Main Runner
 */
class TradingSystemRunner extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} options - 配置选项 / Configuration options
   */
  constructor(options = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 合并选项 / Merge options
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // 运行模式 / Running mode
    this.mode = options.mode || RUN_MODE.SHADOW;

    // 系统状态 / System status
    this.status = SYSTEM_STATUS.STOPPED;

    // 系统配置 (从配置文件加载) / System configuration (loaded from config file)
    this.config = null;

    // ============================================
    // 组件实例 / Component Instances
    // ============================================

    // 交易所实例 / Exchange instance
    this.exchange = null;

    // 行情引擎 / Market data engine
    this.marketDataEngine = null;

    // 策略实例 / Strategy instance
    this.strategy = null;

    // 风控管理器 / Risk manager
    this.riskManager = null;

    // 订单执行器 / Order executor
    this.executor = null;

    // 日志模块 / Logger module
    this.loggerModule = null;

    // 回测引擎 (仅回测模式) / Backtest engine (backtest mode only)
    this.backtestEngine = null;

    // ============================================
    // 运行时状态 / Runtime State
    // ============================================

    // 启动时间 / Start time
    this.startTime = null;

    // 信号计数 / Signal count
    this.signalCount = 0;

    // 订单计数 / Order count
    this.orderCount = 0;

    // 错误计数 / Error count
    this.errorCount = 0;

    // 是否正在关闭 / Whether shutting down
    this.isShuttingDown = false;
  }

  // ============================================
  // 初始化方法 / Initialization Methods
  // ============================================

  /**
   * 初始化系统
   * Initialize system
   */
  async initialize() {
    // 输出启动信息 / Output startup info
    this._printBanner();

    // 更新状态 / Update status
    this.status = SYSTEM_STATUS.STARTING;

    // 输出日志 / Output log
    this._log('info', `初始化系统 (模式: ${this.mode}) / Initializing system (mode: ${this.mode})`);

    try {
      // 1. 加载配置 / Load configuration
      this._log('info', '加载配置... / Loading configuration...');
      this.config = loadConfig();

      // 2. 初始化日志模块 / Initialize logger module
      this._log('info', '初始化日志模块... / Initializing logger module...');
      await this._initLoggerModule();

      // 3. 根据模式初始化 / Initialize based on mode
      if (this.mode === RUN_MODE.BACKTEST) {
        // 回测模式初始化 / Backtest mode initialization
        await this._initBacktestMode();
      } else {
        // 影子/实盘模式初始化 / Shadow/live mode initialization
        await this._initTradingMode();
      }

      // 4. 绑定系统事件 / Bind system events
      this._bindSystemEvents();

      // 输出日志 / Output log
      this._log('info', '系统初始化完成 / System initialization complete');

      // 发出初始化完成事件 / Emit initialized event
      this.emit('initialized');

    } catch (error) {
      // 输出错误日志 / Output error log
      this._log('error', `初始化失败: ${error.message} / Initialization failed`);

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.ERROR;

      // 抛出错误 / Throw error
      throw error;
    }
  }

  /**
   * 初始化日志模块
   * Initialize logger module
   * @private
   */
  async _initLoggerModule() {
    // 创建日志模块 / Create logger module
    this.loggerModule = createLoggerModule({
      // Telegram 配置 / Telegram configuration
      telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,   // Bot Token
        chatId: process.env.TELEGRAM_CHAT_ID,       // Chat ID
        enabled: this.mode === RUN_MODE.LIVE,       // 仅实盘启用 / Only enable in live mode
      },

      // PnL 日志配置 / PnL logger configuration
      pnlLogger: {
        logDir: this.config.logging?.dir || './logs',  // 日志目录 / Log directory
      },

      // 指标导出配置 / Metrics exporter configuration
      metricsExporter: {
        httpEnabled: this.mode !== RUN_MODE.BACKTEST,  // 非回测模式启用 / Enable in non-backtest mode
        httpPort: this.config.server?.metricsPort || 9090,  // HTTP 端口 / HTTP port
      },
    });

    // 如果是实盘或影子模式，初始化 Telegram / If live or shadow mode, initialize Telegram
    if (this.mode !== RUN_MODE.BACKTEST) {
      // 初始化 Telegram / Initialize Telegram
      await this.loggerModule.telegramNotifier.init();
    }
  }

  /**
   * 初始化回测模式
   * Initialize backtest mode
   * @private
   */
  async _initBacktestMode() {
    // 输出日志 / Output log
    this._log('info', '初始化回测模式... / Initializing backtest mode...');

    // 创建回测引擎 / Create backtest engine
    this.backtestEngine = new BacktestEngine({
      // 初始资金 / Initial capital
      initialCapital: this.options.capital || DEFAULT_OPTIONS.initialCapital,

      // 手续费率 / Commission rate
      commissionRate: 0.0004,  // 0.04%

      // 滑点 / Slippage
      slippage: 0.0001,  // 0.01%
    });

    // 加载策略 / Load strategy
    const strategyName = this.options.strategy || DEFAULT_OPTIONS.strategy;
    this._log('info', `加载策略: ${strategyName} / Loading strategy: ${strategyName}`);

    // 获取策略类 / Get strategy class
    const StrategyClass = await StrategyRegistry.get(strategyName);

    // 创建策略实例 / Create strategy instance
    this.strategy = new StrategyClass({
      // 交易对 / Symbols
      symbols: this.options.symbols.length > 0 ? this.options.symbols : DEFAULT_OPTIONS.symbols,
    });
  }

  /**
   * 初始化交易模式 (影子/实盘)
   * Initialize trading mode (shadow/live)
   * @private
   */
  async _initTradingMode() {
    // 输出日志 / Output log
    this._log('info', `初始化${this.mode === RUN_MODE.LIVE ? '实盘' : '影子'}模式... / Initializing ${this.mode} mode...`);

    // 1. 创建交易所实例 / Create exchange instance
    await this._initExchange();

    // 2. 创建行情引擎 / Create market data engine
    await this._initMarketDataEngine();

    // 3. 创建风控管理器 / Create risk manager
    this._initRiskManager();

    // 4. 创建订单执行器 / Create order executor
    this._initOrderExecutor();

    // 5. 加载策略 / Load strategy
    await this._initStrategy();

    // 6. 连接数据源到日志模块 / Connect data sources to logger module
    this._connectLoggerDataSources();
  }

  /**
   * 初始化交易所
   * Initialize exchange
   * @private
   */
  async _initExchange() {
    // 获取交易所名称 / Get exchange name
    const exchangeName = this.options.exchange || this.config.exchange?.default || 'binance';

    // 输出日志 / Output log
    this._log('info', `连接交易所: ${exchangeName} / Connecting exchange: ${exchangeName}`);

    // 获取交易所配置 / Get exchange configuration
    const exchangeConfig = this.config.exchange?.[exchangeName] || {};

    // 创建交易所实例 / Create exchange instance
    this.exchange = ExchangeFactory.create(exchangeName, {
      // API 密钥 / API key
      apiKey: exchangeConfig.apiKey || process.env[`${exchangeName.toUpperCase()}_API_KEY`],

      // API 密钥 / API secret
      secret: exchangeConfig.secret || process.env[`${exchangeName.toUpperCase()}_SECRET`],

      // 是否沙盒模式 / Sandbox mode
      sandbox: exchangeConfig.sandbox || false,

      // 默认类型 (合约) / Default type (futures)
      defaultType: 'swap',

      // 选项 / Options
      options: {
        // 默认保证金模式 / Default margin mode
        defaultMarginMode: 'cross',
      },
    });

    // 加载市场信息 / Load market info
    await this.exchange.loadMarkets();

    // 输出日志 / Output log
    this._log('info', `交易所连接成功: ${exchangeName} / Exchange connected: ${exchangeName}`);
  }

  /**
   * 初始化行情引擎
   * Initialize market data engine
   * @private
   */
  async _initMarketDataEngine() {
    // 输出日志 / Output log
    this._log('info', '初始化行情引擎... / Initializing market data engine...');

    // 创建行情引擎 / Create market data engine
    this.marketDataEngine = new MarketDataEngine(this.exchange, {
      // 是否启用 WebSocket / Enable WebSocket
      enableWebSocket: true,

      // 是否启用 Redis 缓存 / Enable Redis cache
      enableRedis: !!this.config.database?.redis?.enabled,

      // Redis URL
      redisUrl: this.config.database?.redis?.url,
    });
  }

  /**
   * 初始化风控管理器
   * Initialize risk manager
   * @private
   */
  _initRiskManager() {
    // 输出日志 / Output log
    this._log('info', '初始化风控管理器... / Initializing risk manager...');

    // 创建风控管理器 / Create risk manager
    this.riskManager = new AdvancedRiskManager({
      // 最大仓位比例 / Max position ratio
      maxPositionRatio: this.config.risk?.maxPositionRatio || 0.3,

      // 每日最大回撤 / Max daily drawdown
      maxDailyDrawdown: this.config.risk?.maxDrawdown || 0.1,

      // 最大杠杆 / Max leverage
      maxLeverage: this.config.risk?.maxLeverage || 3,

      // 是否启用详细日志 / Enable verbose logging
      verbose: this.options.verbose,
    });
  }

  /**
   * 初始化订单执行器
   * Initialize order executor
   * @private
   */
  _initOrderExecutor() {
    // 输出日志 / Output log
    this._log('info', '初始化订单执行器... / Initializing order executor...');

    // 是否为影子模式 / Whether shadow mode
    const isShadowMode = this.mode === RUN_MODE.SHADOW;

    // 创建订单执行器 / Create order executor
    this.executor = new SmartOrderExecutor({
      // 交易所实例映射 / Exchange instance mapping
      exchanges: {
        [this.options.exchange || 'binance']: this.exchange,
      },

      // 是否为影子模式 (干跑) / Shadow mode (dry run)
      dryRun: isShadowMode,

      // 默认重试次数 / Default retry count
      maxRetries: 3,

      // 是否启用详细日志 / Enable verbose logging
      verbose: this.options.verbose,
    });

    // 如果是影子模式，输出提示 / If shadow mode, output notice
    if (isShadowMode) {
      this._log('warn', '⚠️ 影子模式: 订单将不会真实执行 / Shadow mode: Orders will not be actually executed');
    }
  }

  /**
   * 初始化策略
   * Initialize strategy
   * @private
   */
  async _initStrategy() {
    // 获取策略名称 / Get strategy name
    const strategyName = this.options.strategy || DEFAULT_OPTIONS.strategy;

    // 输出日志 / Output log
    this._log('info', `加载策略: ${strategyName} / Loading strategy: ${strategyName}`);

    // 获取策略类 / Get strategy class
    const StrategyClass = await StrategyRegistry.get(strategyName);

    // 获取交易对 / Get symbols
    const symbols = this.options.symbols.length > 0
      ? this.options.symbols
      : DEFAULT_OPTIONS.symbols;

    // 创建策略实例 / Create strategy instance
    this.strategy = new StrategyClass({
      // 交易对 / Symbols
      symbols,

      // 策略配置 / Strategy configuration
      ...this.config.strategy?.[strategyName],
    });

    // 设置交易所 / Set exchange
    if (this.strategy.setExchange) {
      this.strategy.setExchange(this.exchange);
    }

    // 初始化策略 / Initialize strategy
    if (this.strategy.initialize) {
      await this.strategy.initialize();
    }

    // 输出日志 / Output log
    this._log('info', `策略已加载: ${strategyName}, 交易对: ${symbols.join(', ')} / Strategy loaded`);
  }

  /**
   * 连接日志数据源
   * Connect logger data sources
   * @private
   */
  _connectLoggerDataSources() {
    // 设置数据源到日志模块 / Set data sources to logger module
    this.loggerModule.setDataSources({
      // 风控管理器 / Risk manager
      riskManager: this.riskManager,

      // 订单执行器 / Order executor
      executor: this.executor,
    });
  }

  // ============================================
  // 事件绑定方法 / Event Binding Methods
  // ============================================

  /**
   * 绑定系统事件
   * Bind system events
   * @private
   */
  _bindSystemEvents() {
    // 绑定进程信号 / Bind process signals
    this._bindProcessSignals();

    // 如果是交易模式，绑定交易事件 / If trading mode, bind trading events
    if (this.mode !== RUN_MODE.BACKTEST) {
      // 绑定行情事件 / Bind market data events
      this._bindMarketDataEvents();

      // 绑定策略事件 / Bind strategy events
      this._bindStrategyEvents();

      // 绑定风控事件 / Bind risk events
      this._bindRiskEvents();

      // 绑定执行器事件 / Bind executor events
      this._bindExecutorEvents();
    }
  }

  /**
   * 绑定进程信号
   * Bind process signals
   * @private
   */
  _bindProcessSignals() {
    // SIGTERM 信号 (PM2 停止) / SIGTERM signal (PM2 stop)
    process.on('SIGTERM', async () => {
      // 输出日志 / Output log
      this._log('info', '收到 SIGTERM 信号 / Received SIGTERM signal');

      // 优雅关闭 / Graceful shutdown
      await this.shutdown();
    });

    // SIGINT 信号 (Ctrl+C) / SIGINT signal (Ctrl+C)
    process.on('SIGINT', async () => {
      // 输出日志 / Output log
      this._log('info', '收到 SIGINT 信号 / Received SIGINT signal');

      // 优雅关闭 / Graceful shutdown
      await this.shutdown();
    });

    // PM2 热重载信号 / PM2 hot reload signal
    process.on('message', async (msg) => {
      // 检查是否为关闭消息 / Check if shutdown message
      if (msg === 'shutdown') {
        // 输出日志 / Output log
        this._log('info', '收到 PM2 shutdown 消息 / Received PM2 shutdown message');

        // 优雅关闭 / Graceful shutdown
        await this.shutdown();

        // 发送 ready 消息给 PM2 / Send ready message to PM2
        if (process.send) {
          process.send('ready');
        }
      }
    });

    // 未捕获异常处理 / Uncaught exception handling
    process.on('uncaughtException', async (error) => {
      // 输出错误日志 / Output error log
      this._log('error', `未捕获异常: ${error.message} / Uncaught exception`);
      console.error(error);

      // 增加错误计数 / Increment error count
      this.errorCount++;

      // 记录到日志模块 / Log to logger module
      if (this.loggerModule) {
        this.loggerModule.alertManager?.triggerAlert({
          category: 'system',
          level: 'critical',
          title: '未捕获异常 / Uncaught Exception',
          message: error.message,
          data: { stack: error.stack },
        });
      }

      // 优雅关闭 / Graceful shutdown
      await this.shutdown(1);
    });

    // 未处理 Promise 拒绝 / Unhandled promise rejection
    process.on('unhandledRejection', async (reason) => {
      // 输出错误日志 / Output error log
      this._log('error', `未处理的 Promise 拒绝: ${reason} / Unhandled Promise rejection`);

      // 增加错误计数 / Increment error count
      this.errorCount++;
    });
  }

  /**
   * 绑定行情事件
   * Bind market data events
   * @private
   */
  _bindMarketDataEvents() {
    // 如果没有行情引擎，跳过 / If no market data engine, skip
    if (!this.marketDataEngine) {
      return;
    }

    // Ticker 更新事件 / Ticker update event
    this.marketDataEngine.on('ticker', (data) => {
      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onTicker) {
        this.strategy.onTicker(data);
      }
    });

    // K 线更新事件 / Candle update event
    this.marketDataEngine.on('candle', (data) => {
      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onCandle) {
        this.strategy.onCandle(data);
      }
    });

    // 订单簿更新事件 / Order book update event
    this.marketDataEngine.on('orderbook', (data) => {
      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onOrderBook) {
        this.strategy.onOrderBook(data);
      }
    });

    // 资金费率更新事件 / Funding rate update event
    this.marketDataEngine.on('fundingRate', (data) => {
      // 传递给策略 / Pass to strategy
      if (this.strategy && this.strategy.onFundingRate) {
        this.strategy.onFundingRate(data);
      }
    });

    // 行情错误事件 / Market data error event
    this.marketDataEngine.on('error', (error) => {
      // 输出错误日志 / Output error log
      this._log('error', `行情错误: ${error.message} / Market data error`);

      // 增加错误计数 / Increment error count
      this.errorCount++;
    });
  }

  /**
   * 绑定策略事件
   * Bind strategy events
   * @private
   */
  _bindStrategyEvents() {
    // 如果没有策略，跳过 / If no strategy, skip
    if (!this.strategy) {
      return;
    }

    // 信号事件 / Signal event
    this.strategy.on('signal', async (signal) => {
      // 输出日志 / Output log
      this._log('info', `收到信号: ${signal.symbol} ${signal.side} / Received signal`);

      // 增加信号计数 / Increment signal count
      this.signalCount++;

      // 处理信号 / Handle signal
      await this._handleSignal(signal);
    });

    // 策略错误事件 / Strategy error event
    this.strategy.on('error', (error) => {
      // 输出错误日志 / Output error log
      this._log('error', `策略错误: ${error.message} / Strategy error`);

      // 增加错误计数 / Increment error count
      this.errorCount++;
    });
  }

  /**
   * 绑定风控事件
   * Bind risk events
   * @private
   */
  _bindRiskEvents() {
    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.riskManager) {
      return;
    }

    // 风控警报事件 / Risk alert event
    this.riskManager.on('alert', (alert) => {
      // 输出警告日志 / Output warning log
      this._log('warn', `风控警报: ${alert.message} / Risk alert`);

      // 触发日志模块警报 / Trigger logger module alert
      if (this.loggerModule) {
        this.loggerModule.alertManager?.handleRiskAlert(alert);
      }
    });

    // 紧急平仓事件 / Emergency close event
    this.riskManager.on('emergencyClose', async (data) => {
      // 输出错误日志 / Output error log
      this._log('error', `触发紧急平仓: ${data.reason} / Emergency close triggered`);

      // 执行紧急平仓 / Execute emergency close
      await this._handleEmergencyClose(data);
    });

    // 交易暂停事件 / Trading paused event
    this.riskManager.on('tradingPaused', (data) => {
      // 输出警告日志 / Output warning log
      this._log('warn', `交易已暂停: ${data.reason} / Trading paused`);
    });
  }

  /**
   * 绑定执行器事件
   * Bind executor events
   * @private
   */
  _bindExecutorEvents() {
    // 如果没有执行器，跳过 / If no executor, skip
    if (!this.executor) {
      return;
    }

    // 订单成交事件 / Order filled event
    this.executor.on('orderFilled', (order) => {
      // 输出日志 / Output log
      this._log('info', `订单成交: ${order.symbol} ${order.side} ${order.amount} @ ${order.price} / Order filled`);

      // 增加订单计数 / Increment order count
      this.orderCount++;

      // 记录到日志模块 / Log to logger module
      if (this.loggerModule) {
        this.loggerModule.pnlLogger.logTrade(order);
        this.loggerModule.telegramNotifier.sendTradeNotification(order);
      }
    });

    // 订单失败事件 / Order failed event
    this.executor.on('orderFailed', (data) => {
      // 输出错误日志 / Output error log
      this._log('error', `订单失败: ${data.error} / Order failed`);

      // 增加错误计数 / Increment error count
      this.errorCount++;

      // 触发警报 / Trigger alert
      if (this.loggerModule) {
        this.loggerModule.alertManager?.triggerOrderFailedAlert(data.order, new Error(data.error));
      }
    });
  }

  // ============================================
  // 运行方法 / Running Methods
  // ============================================

  /**
   * 启动系统
   * Start system
   */
  async start() {
    // 检查状态 / Check status
    if (this.status === SYSTEM_STATUS.RUNNING) {
      this._log('warn', '系统已在运行 / System is already running');
      return;
    }

    // 输出日志 / Output log
    this._log('info', '启动系统... / Starting system...');

    try {
      // 根据模式启动 / Start based on mode
      if (this.mode === RUN_MODE.BACKTEST) {
        // 运行回测 / Run backtest
        await this._runBacktest();
      } else {
        // 运行交易 / Run trading
        await this._runTrading();
      }

    } catch (error) {
      // 输出错误日志 / Output error log
      this._log('error', `启动失败: ${error.message} / Start failed`);

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.ERROR;

      // 抛出错误 / Throw error
      throw error;
    }
  }

  /**
   * 运行回测
   * Run backtest
   * @private
   */
  async _runBacktest() {
    // 输出日志 / Output log
    this._log('info', '开始回测... / Starting backtest...');

    // 更新状态 / Update status
    this.status = SYSTEM_STATUS.RUNNING;

    // 记录开始时间 / Record start time
    this.startTime = Date.now();

    try {
      // 创建回测运行器 / Create backtest runner
      const runner = new BacktestRunner({
        // 策略名称 / Strategy name
        strategyName: this.options.strategy || DEFAULT_OPTIONS.strategy,

        // 交易对 / Symbols
        symbols: this.options.symbols.length > 0 ? this.options.symbols : DEFAULT_OPTIONS.symbols,

        // 开始日期 / Start date
        startDate: this.options.startDate || '2024-01-01',

        // 结束日期 / End date
        endDate: this.options.endDate || new Date().toISOString().split('T')[0],

        // 初始资金 / Initial capital
        initialCapital: this.options.capital || DEFAULT_OPTIONS.initialCapital,

        // 交易所 / Exchange
        exchange: this.options.exchange || 'binance',
      });

      // 运行回测 / Run backtest
      const results = await runner.run();

      // 输出结果 / Output results
      this._printBacktestResults(results);

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.STOPPED;

      // 返回结果 / Return results
      return results;

    } catch (error) {
      // 输出错误日志 / Output error log
      this._log('error', `回测失败: ${error.message} / Backtest failed`);

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.ERROR;

      // 抛出错误 / Throw error
      throw error;
    }
  }

  /**
   * 运行交易
   * Run trading
   * @private
   */
  async _runTrading() {
    // 输出日志 / Output log
    this._log('info', `开始${this.mode === RUN_MODE.LIVE ? '实盘' : '影子'}交易... / Starting ${this.mode} trading...`);

    // 更新状态 / Update status
    this.status = SYSTEM_STATUS.RUNNING;

    // 记录开始时间 / Record start time
    this.startTime = Date.now();

    // 1. 启动日志模块 / Start logger module
    if (this.loggerModule) {
      await this.loggerModule.startAll();
    }

    // 2. 启动风控管理器 / Start risk manager
    if (this.riskManager) {
      this.riskManager.start();
    }

    // 3. 订阅行情 / Subscribe to market data
    await this._subscribeMarketData();

    // 4. 启动行情引擎 / Start market data engine
    if (this.marketDataEngine) {
      this.marketDataEngine.start();
    }

    // 5. 发送 PM2 ready 信号 / Send PM2 ready signal
    if (process.send) {
      process.send('ready');
    }

    // 输出日志 / Output log
    this._log('info', '✅ 系统已启动，等待交易信号... / System started, waiting for signals...');

    // 输出状态信息 / Output status info
    this._printStatus();

    // 发出启动事件 / Emit started event
    this.emit('started');
  }

  /**
   * 订阅行情数据
   * Subscribe to market data
   * @private
   */
  async _subscribeMarketData() {
    // 获取交易对 / Get symbols
    const symbols = this.options.symbols.length > 0
      ? this.options.symbols
      : DEFAULT_OPTIONS.symbols;

    // 输出日志 / Output log
    this._log('info', `订阅行情: ${symbols.join(', ')} / Subscribing market data`);

    // 遍历订阅 / Iterate and subscribe
    for (const symbol of symbols) {
      // 订阅 ticker / Subscribe ticker
      this.marketDataEngine.subscribe(symbol, 'ticker');

      // 订阅 K 线 / Subscribe candles
      this.marketDataEngine.subscribe(symbol, 'candle', { timeframe: '1m' });

      // 订阅订单簿 / Subscribe order book
      this.marketDataEngine.subscribe(symbol, 'orderbook');
    }
  }

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
  async _handleSignal(signal) {
    try {
      // 1. 风控检查 / Risk check
      if (this.riskManager) {
        // 获取检查结果 / Get check result
        const riskCheck = this.riskManager.checkOrder({
          symbol: signal.symbol,
          side: signal.side,
          amount: signal.amount,
          price: signal.price,
        });

        // 如果风控拒绝 / If risk rejected
        if (!riskCheck.allowed) {
          // 输出警告日志 / Output warning log
          this._log('warn', `风控拒绝信号: ${riskCheck.reason} / Risk rejected signal`);

          // 发出信号拒绝事件 / Emit signal rejected event
          this.emit('signalRejected', { signal, reason: riskCheck.reason });

          // 返回 / Return
          return;
        }
      }

      // 2. 执行订单 / Execute order
      if (this.executor) {
        // 获取交易所 ID / Get exchange ID
        const exchangeId = this.options.exchange || 'binance';

        // 构建订单参数 / Build order parameters
        const orderParams = {
          exchangeId,
          symbol: signal.symbol,
          side: signal.side,
          amount: signal.amount,
          price: signal.price,
          type: signal.orderType || 'market',
        };

        // 执行订单 / Execute order
        const result = await this.executor.executeOrder(orderParams);

        // 输出日志 / Output log
        if (result.success) {
          this._log('info', `订单执行成功: ${result.orderId} / Order executed successfully`);
        } else {
          this._log('error', `订单执行失败: ${result.error} / Order execution failed`);
        }

        // 发出订单执行事件 / Emit order executed event
        this.emit('orderExecuted', { signal, result });
      }

    } catch (error) {
      // 输出错误日志 / Output error log
      this._log('error', `信号处理失败: ${error.message} / Signal handling failed`);

      // 增加错误计数 / Increment error count
      this.errorCount++;

      // 发出信号错误事件 / Emit signal error event
      this.emit('signalError', { signal, error: error.message });
    }
  }

  /**
   * 处理紧急平仓
   * Handle emergency close
   *
   * @param {Object} data - 紧急平仓数据 / Emergency close data
   * @private
   */
  async _handleEmergencyClose(data) {
    // 输出日志 / Output log
    this._log('error', `执行紧急平仓: ${data.reason} / Executing emergency close`);

    try {
      // 如果有执行器 / If has executor
      if (this.executor) {
        // 获取交易所 ID / Get exchange ID
        const exchangeId = this.options.exchange || 'binance';

        // 执行紧急平仓 / Execute emergency close
        const result = await this.executor.emergencyCloseAll(exchangeId);

        // 输出日志 / Output log
        this._log('info', `紧急平仓完成: 已平仓 ${result.closedCount} 个仓位 / Emergency close complete`);

        // 发送通知 / Send notification
        if (this.loggerModule) {
          this.loggerModule.alertManager?.triggerEmergencyCloseCompletedAlert(result);
        }
      }

    } catch (error) {
      // 输出错误日志 / Output error log
      this._log('error', `紧急平仓失败: ${error.message} / Emergency close failed`);
    }
  }

  // ============================================
  // 关闭方法 / Shutdown Methods
  // ============================================

  /**
   * 优雅关闭
   * Graceful shutdown
   *
   * @param {number} exitCode - 退出码 / Exit code
   */
  async shutdown(exitCode = 0) {
    // 如果已在关闭中，跳过 / If already shutting down, skip
    if (this.isShuttingDown) {
      return;
    }

    // 标记为关闭中 / Mark as shutting down
    this.isShuttingDown = true;

    // 输出日志 / Output log
    this._log('info', '开始优雅关闭... / Starting graceful shutdown...');

    // 更新状态 / Update status
    this.status = SYSTEM_STATUS.STOPPING;

    try {
      // 1. 停止策略 / Stop strategy
      if (this.strategy && this.strategy.stop) {
        this._log('info', '停止策略... / Stopping strategy...');
        await this.strategy.stop();
      }

      // 2. 取消所有挂单 / Cancel all pending orders
      if (this.executor && this.mode === RUN_MODE.LIVE) {
        this._log('info', '取消所有挂单... / Canceling all pending orders...');
        try {
          const exchangeId = this.options.exchange || 'binance';
          await this.executor.cancelAllPendingOrders(exchangeId);
        } catch (e) {
          this._log('warn', `取消挂单失败: ${e.message} / Failed to cancel orders`);
        }
      }

      // 3. 停止行情引擎 / Stop market data engine
      if (this.marketDataEngine) {
        this._log('info', '停止行情引擎... / Stopping market data engine...');
        this.marketDataEngine.stop();
      }

      // 4. 停止风控管理器 / Stop risk manager
      if (this.riskManager) {
        this._log('info', '停止风控管理器... / Stopping risk manager...');
        this.riskManager.stop();
      }

      // 5. 停止日志模块 / Stop logger module
      if (this.loggerModule) {
        this._log('info', '停止日志模块... / Stopping logger module...');
        await this.loggerModule.stopAll();
      }

      // 6. 关闭交易所连接 / Close exchange connection
      if (this.exchange && this.exchange.close) {
        this._log('info', '关闭交易所连接... / Closing exchange connection...');
        await this.exchange.close();
      }

      // 更新状态 / Update status
      this.status = SYSTEM_STATUS.STOPPED;

      // 输出日志 / Output log
      this._log('info', '✅ 系统已安全关闭 / System safely shutdown');

      // 输出统计信息 / Output statistics
      this._printFinalStats();

      // 发出关闭事件 / Emit shutdown event
      this.emit('shutdown');

    } catch (error) {
      // 输出错误日志 / Output error log
      this._log('error', `关闭过程出错: ${error.message} / Shutdown error`);
    }

    // 退出进程 / Exit process
    process.exit(exitCode);
  }

  // ============================================
  // 输出方法 / Output Methods
  // ============================================

  /**
   * 输出启动横幅
   * Print startup banner
   * @private
   */
  _printBanner() {
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
`;

    // 输出横幅 / Output banner
    console.log(banner);
  }

  /**
   * 输出当前状态
   * Print current status
   * @private
   */
  _printStatus() {
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
`;

    // 输出状态 / Output status
    console.log(statusInfo);
  }

  /**
   * 输出回测结果
   * Print backtest results
   *
   * @param {Object} results - 回测结果 / Backtest results
   * @private
   */
  _printBacktestResults(results) {
    // 结果信息 / Results info
    const resultsInfo = `
╔══════════════════════════════════════════════════════════════════╗
║                    回测结果 / Backtest Results                     ║
╠══════════════════════════════════════════════════════════════════╣
║ 初始资金 / Initial Capital:    ${String(results.initialCapital || 0).padEnd(30)}  ║
║ 最终资金 / Final Capital:      ${String(results.finalCapital || 0).padEnd(30)}  ║
║ 总收益 / Total Return:         ${String((results.totalReturn * 100 || 0).toFixed(2) + '%').padEnd(30)}  ║
║ 年化收益 / Annual Return:      ${String((results.annualReturn * 100 || 0).toFixed(2) + '%').padEnd(30)}  ║
║ 最大回撤 / Max Drawdown:       ${String((results.maxDrawdown * 100 || 0).toFixed(2) + '%').padEnd(30)}  ║
║ 夏普比率 / Sharpe Ratio:       ${String((results.sharpeRatio || 0).toFixed(2)).padEnd(30)}  ║
║ 胜率 / Win Rate:               ${String((results.winRate * 100 || 0).toFixed(2) + '%').padEnd(30)}  ║
║ 交易次数 / Total Trades:       ${String(results.totalTrades || 0).padEnd(30)}  ║
╚══════════════════════════════════════════════════════════════════╝
`;

    // 输出结果 / Output results
    console.log(resultsInfo);
  }

  /**
   * 输出最终统计
   * Print final statistics
   * @private
   */
  _printFinalStats() {
    // 计算运行时间 / Calculate running time
    const runningTime = this.startTime
      ? Math.floor((Date.now() - this.startTime) / 1000)
      : 0;

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
`;

    // 输出统计 / Output statistics
    console.log(statsInfo);
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} level - 日志级别 / Log level
   * @param {string} message - 日志消息 / Log message
   * @private
   */
  _log(level, message) {
    // 获取时间戳 / Get timestamp
    const timestamp = new Date().toISOString();

    // 级别前缀映射 / Level prefix mapping
    const levelPrefix = {
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌',
      debug: '🔍',
    };

    // 获取前缀 / Get prefix
    const prefix = levelPrefix[level] || '';

    // 构建完整消息 / Build full message
    const fullMessage = `[${timestamp}] ${prefix} ${message}`;

    // 根据级别输出 / Output based on level
    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'debug':
        if (this.options.verbose) {
          console.log(fullMessage);
        }
        break;
      case 'info':
      default:
        console.log(fullMessage);
    }

    // 记录到日志模块 / Log to logger module
    if (this.loggerModule && this.loggerModule.pnlLogger) {
      this.loggerModule.pnlLogger.logSystem(level, message);
    }
  }

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 获取系统状态
   * Get system status
   *
   * @returns {Object} 系统状态 / System status
   */
  getStatus() {
    return {
      // 系统状态 / System status
      status: this.status,

      // 运行模式 / Running mode
      mode: this.mode,

      // 启动时间 / Start time
      startTime: this.startTime,

      // 运行时间 / Running time
      uptime: this.startTime ? Date.now() - this.startTime : 0,

      // 统计信息 / Statistics
      stats: {
        signalCount: this.signalCount,
        orderCount: this.orderCount,
        errorCount: this.errorCount,
      },

      // 组件状态 / Component status
      components: {
        exchange: !!this.exchange,
        marketData: !!this.marketDataEngine,
        strategy: !!this.strategy,
        riskManager: !!this.riskManager,
        executor: !!this.executor,
        logger: !!this.loggerModule,
      },
    };
  }
}

// ============================================
// 主入口函数 / Main Entry Function
// ============================================

/**
 * 主函数
 * Main function
 */
async function main() {
  // 解析命令行参数 / Parse command line arguments
  const args = parseArgs();

  // 如果请求帮助，显示帮助并退出 / If help requested, show help and exit
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // 如果没有指定模式，显示帮助并退出 / If no mode specified, show help and exit
  if (!args.mode) {
    console.error('错误: 请指定运行模式 (backtest, shadow, live) / Error: Please specify running mode');
    console.log('使用 --help 查看帮助 / Use --help for help');
    process.exit(1);
  }

  // 验证模式 / Validate mode
  if (!Object.values(RUN_MODE).includes(args.mode)) {
    console.error(`错误: 无效的运行模式 "${args.mode}" / Error: Invalid running mode`);
    console.log('有效模式: backtest, shadow, live / Valid modes: backtest, shadow, live');
    process.exit(1);
  }

  // 创建运行器实例 / Create runner instance
  const runner = new TradingSystemRunner({
    // 运行模式 / Running mode
    mode: args.mode,

    // 策略名称 / Strategy name
    strategy: args.strategy,

    // 交易对 / Symbols
    symbols: args.symbols,

    // 交易所 / Exchange
    exchange: args.exchange,

    // 开始日期 / Start date
    startDate: args.startDate,

    // 结束日期 / End date
    endDate: args.endDate,

    // 初始资金 / Initial capital
    capital: args.capital,

    // 详细模式 / Verbose mode
    verbose: args.verbose,
  });

  try {
    // 初始化系统 / Initialize system
    await runner.initialize();

    // 启动系统 / Start system
    await runner.start();

  } catch (error) {
    // 输出错误 / Output error
    console.error(`启动失败: ${error.message} / Start failed`);
    console.error(error.stack);

    // 退出 / Exit
    process.exit(1);
  }
}

// ============================================
// 导出 / Exports
// ============================================

// 导出主运行器类 / Export main runner class
export { TradingSystemRunner };

// 导出常量 / Export constants
export { RUN_MODE, SYSTEM_STATUS };

// 导出解析函数 / Export parse function
export { parseArgs, showHelp };

// 默认导出主函数 / Default export main function
export default main;

// ============================================
// 执行主函数 / Execute Main Function
// ============================================

// 运行主函数 / Run main function
main();
