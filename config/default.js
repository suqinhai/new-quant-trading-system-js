/**
 * 默认配置文件
 * Default Configuration File
 *
 * 系统默认配置，会被环境变量覆盖
 * System default configuration, can be overridden by environment variables
 */

export default {
  // ============================================
  // 交易所配置 / Exchange Configuration
  // ============================================
  exchange: {
    // 默认交易所 / Default exchange
    default: 'binance',

    // Binance 配置 / Binance configuration
    binance: {
      // 是否启用 / Whether enabled
      enabled: true,

      // 是否使用沙盒模式 / Whether to use sandbox mode
      sandbox: false,

      // API 请求超时 (毫秒) / API request timeout (ms)
      timeout: 30000,

      // 是否启用限速 / Whether to enable rate limiting
      enableRateLimit: true,

      // 默认交易类型: 'spot' | 'future' | 'swap'
      defaultType: 'spot',

      // 选项 / Options
      options: {
        // 默认时间周期 / Default timeframe
        defaultTimeframe: '1h',

        // 调整 K 线时间 / Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // OKX 配置 / OKX configuration
    okx: {
      // 是否启用 / Whether enabled
      enabled: true,

      // 是否使用沙盒模式 / Whether to use sandbox mode
      sandbox: false,

      // API 请求超时 (毫秒) / API request timeout (ms)
      timeout: 30000,

      // 是否启用限速 / Whether to enable rate limiting
      enableRateLimit: true,

      // 默认交易类型: 'spot' | 'swap' | 'future'
      defaultType: 'spot',
    },
  },

  // ============================================
  // 行情配置 / Market Data Configuration
  // ============================================
  marketData: {
    // WebSocket 配置 / WebSocket configuration
    websocket: {
      // 心跳间隔 (毫秒) / Heartbeat interval (ms)
      pingInterval: 30000,

      // 超时时间 (毫秒) / Timeout (ms)
      pongTimeout: 10000,

      // 重连延迟 (毫秒) / Reconnect delay (ms)
      reconnectDelay: 5000,

      // 最大重连次数 / Max reconnection attempts
      maxReconnectAttempts: 10,
    },

    // 数据聚合配置 / Data aggregation configuration
    aggregator: {
      // 聚合间隔 (毫秒) / Aggregation interval (ms)
      aggregateInterval: 1000,

      // 套利检测阈值 (百分比) / Arbitrage detection threshold (%)
      arbitrageThreshold: 0.5,
    },

    // 缓存配置 / Cache configuration
    cache: {
      // K线缓存大小 / Candle cache size
      maxCandles: 1000,

      // 行情缓存过期时间 (毫秒) / Ticker cache expiry (ms)
      tickerExpiry: 5000,
    },
  },

  // ============================================
  // 策略配置 / Strategy Configuration
  // ============================================
  strategy: {
    // 默认策略 / Default strategy
    default: 'sma',

    // 默认参数 / Default parameters
    defaults: {
      // 默认时间周期 / Default timeframe
      timeframe: '1h',

      // 默认资金比例 / Default capital ratio
      capitalRatio: 0.1,

      // 默认止损比例 / Default stop loss ratio
      stopLoss: 0.02,

      // 默认止盈比例 / Default take profit ratio
      takeProfit: 0.04,
    },

    // SMA 策略默认参数 / SMA strategy defaults
    sma: {
      fastPeriod: 10,
      slowPeriod: 20,
    },

    // RSI 策略默认参数 / RSI strategy defaults
    rsi: {
      period: 14,
      overbought: 70,
      oversold: 30,
    },

    // 布林带策略默认参数 / Bollinger Bands strategy defaults
    bollingerBands: {
      period: 20,
      stdDev: 2,
    },

    // MACD 策略默认参数 / MACD strategy defaults
    macd: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    },

    // 网格策略默认参数 / Grid strategy defaults
    grid: {
      gridCount: 10,
      gridSpacing: 0.01,
    },
  },

  // ============================================
  // 风控配置 / Risk Management Configuration
  // ============================================
  risk: {
    // 全局风控开关 / Global risk management switch
    enabled: true,

    // 最大持仓比例 / Maximum position ratio
    maxPositionRatio: 0.3,

    // 单笔最大风险 / Maximum risk per trade
    maxRiskPerTrade: 0.02,

    // 每日最大亏损 (USDT) / Maximum daily loss (USDT)
    maxDailyLoss: 1000,

    // 最大回撤比例 / Maximum drawdown ratio
    maxDrawdown: 0.2,

    // 最大持仓数量 / Maximum number of positions
    maxPositions: 5,

    // 最大杠杆倍数 / Maximum leverage
    maxLeverage: 3,

    // 仓位计算方法: 'fixed' | 'risk_based' | 'kelly' | 'atr_based'
    positionSizing: 'risk_based',

    // 止损配置 / Stop loss configuration
    stopLoss: {
      // 是否启用 / Whether enabled
      enabled: true,

      // 默认止损比例 / Default stop loss ratio
      defaultRatio: 0.02,

      // 是否启用追踪止损 / Whether to enable trailing stop
      trailingStop: true,

      // 追踪止损回撤比例 / Trailing stop drawdown ratio
      trailingRatio: 0.015,
    },

    // 止盈配置 / Take profit configuration
    takeProfit: {
      // 是否启用 / Whether enabled
      enabled: true,

      // 默认止盈比例 / Default take profit ratio
      defaultRatio: 0.04,

      // 是否启用分批止盈 / Whether to enable partial take profit
      partialTakeProfit: false,

      // 分批止盈比例 / Partial take profit ratios
      partialRatios: [0.5, 0.3, 0.2],
    },

    // 黑名单交易对 / Blacklisted symbols
    blacklist: [],

    // 白名单交易对 (空表示全部允许) / Whitelisted symbols (empty means all allowed)
    whitelist: [],
  },

  // ============================================
  // 订单执行配置 / Order Execution Configuration
  // ============================================
  executor: {
    // 最大重试次数 / Maximum retry attempts
    maxRetries: 3,

    // 重试延迟 (毫秒) / Retry delay (ms)
    retryDelay: 1000,

    // 最大滑点 (百分比) / Maximum slippage (%)
    maxSlippage: 0.5,

    // 订单超时 (毫秒) / Order timeout (ms)
    orderTimeout: 30000,

    // 是否启用 TWAP / Whether to enable TWAP
    enableTWAP: true,

    // TWAP 配置 / TWAP configuration
    twap: {
      // 拆分阈值 (USDT) / Split threshold (USDT)
      splitThreshold: 10000,

      // 拆分份数 / Number of splits
      splitCount: 5,

      // 拆分间隔 (毫秒) / Split interval (ms)
      splitInterval: 2000,
    },

    // 并发订单数量 / Concurrent order count
    concurrency: 3,
  },

  // ============================================
  // 回测配置 / Backtest Configuration
  // ============================================
  backtest: {
    // 初始资金 (USDT) / Initial capital (USDT)
    initialCapital: 10000,

    // 手续费率 / Commission rate
    commission: 0.001,

    // 滑点模拟 / Slippage simulation
    slippage: 0.0005,

    // 数据目录 / Data directory
    dataDir: 'data/historical',

    // 结果输出目录 / Results output directory
    outputDir: 'data/backtest_results',
  },

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================
  monitor: {
    // 指标收集间隔 (毫秒) / Metrics collection interval (ms)
    collectInterval: 10000,

    // 健康检查间隔 (毫秒) / Health check interval (ms)
    healthCheckInterval: 30000,

    // 内存警告阈值 (MB) / Memory warning threshold (MB)
    memoryWarningThreshold: 512,

    // CPU 警告阈值 (%) / CPU warning threshold (%)
    cpuWarningThreshold: 80,

    // Prometheus 配置 / Prometheus configuration
    prometheus: {
      // 是否启用 / Whether enabled
      enabled: true,

      // 端口 / Port
      port: 9090,
    },
  },

  // ============================================
  // 告警配置 / Alert Configuration
  // ============================================
  alert: {
    // 告警冷却时间 (毫秒) / Alert cooldown (ms)
    cooldown: 60000,

    // 邮件告警 / Email alerts
    email: {
      enabled: false,
      // 其他配置从环境变量读取 / Other config from env
    },

    // Telegram 告警 / Telegram alerts
    telegram: {
      enabled: false,
      // 其他配置从环境变量读取 / Other config from env
    },

    // 钉钉告警 / DingTalk alerts
    dingtalk: {
      enabled: false,
      // 其他配置从环境变量读取 / Other config from env
    },

    // Webhook 告警 / Webhook alerts
    webhook: {
      enabled: false,
      // 其他配置从环境变量读取 / Other config from env
    },
  },

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================
  logging: {
    // 日志级别: 'error' | 'warn' | 'info' | 'debug'
    level: 'info',

    // 日志目录 / Log directory
    dir: 'logs',

    // 是否输出到控制台 / Whether to output to console
    console: true,

    // 是否输出到文件 / Whether to output to file
    file: true,

    // 单个日志文件最大大小 (字节) / Max size per log file (bytes)
    maxSize: 10 * 1024 * 1024,  // 10MB

    // 保留日志文件数量 / Number of log files to keep
    maxFiles: 5,
  },

  // ============================================
  // 数据库配置 / Database Configuration
  // ============================================
  database: {
    // 数据库类型: 'sqlite' | 'mysql' | 'postgresql' | 'mongodb'
    type: 'sqlite',

    // SQLite 配置 / SQLite configuration
    sqlite: {
      filename: 'data/trading.db',
    },

    // MySQL/PostgreSQL 配置 / MySQL/PostgreSQL configuration
    // (从环境变量读取 / Read from env)

    // Redis 配置 / Redis configuration
    redis: {
      enabled: false,
      // 其他配置从环境变量读取 / Other config from env
    },
  },

  // ============================================
  // 服务端口配置 / Service Port Configuration
  // ============================================
  server: {
    // HTTP API 端口 / HTTP API port
    httpPort: 3000,

    // WebSocket 端口 / WebSocket port
    wsPort: 3001,

    // 仪表盘端口 / Dashboard port
    dashboardPort: 8080,
  },
};
