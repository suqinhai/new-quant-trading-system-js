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

    // Gate.io 配置 / Gate.io configuration
    gate: {
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

      // 选项 / Options
      options: {
        // 调整时间戳 / Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // Deribit 配置 / Deribit configuration
    deribit: {
      // 是否启用 / Whether enabled
      enabled: true,

      // 是否使用沙盒模式 (测试网) / Whether to use sandbox mode (testnet)
      sandbox: false,

      // API 请求超时 (毫秒) / API request timeout (ms)
      timeout: 30000,

      // 是否启用限速 / Whether to enable rate limiting
      enableRateLimit: true,

      // 默认交易类型: 'swap' | 'future' | 'option'
      // Deribit 专注于衍生品，默认为永续合约
      // Deribit focuses on derivatives, default to perpetual
      defaultType: 'swap',

      // 选项 / Options
      options: {
        // 调整时间戳 / Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // Bitget 配置 / Bitget configuration
    bitget: {
      // 是否启用 / Whether enabled
      enabled: true,

      // 是否使用沙盒模式 (测试网) / Whether to use sandbox mode (testnet)
      sandbox: false,

      // API 请求超时 (毫秒) / API request timeout (ms)
      timeout: 30000,

      // 是否启用限速 / Whether to enable rate limiting
      enableRateLimit: true,

      // 默认交易类型: 'spot' | 'swap' | 'future'
      defaultType: 'spot',

      // 选项 / Options
      options: {
        // 调整时间戳 / Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // KuCoin 配置 / KuCoin configuration
    kucoin: {
      // 是否启用 / Whether enabled
      enabled: true,

      // 是否使用沙盒模式 (测试网) / Whether to use sandbox mode (testnet)
      // 测试网: sandbox.kucoin.com | 生产: api.kucoin.com
      sandbox: false,

      // API 请求超时 (毫秒) / API request timeout (ms)
      timeout: 30000,

      // 是否启用限速 / Whether to enable rate limiting
      enableRateLimit: true,

      // 默认交易类型: 'spot' | 'swap' | 'future'
      // KuCoin 支持现货和合约交易 / KuCoin supports spot and futures trading
      defaultType: 'spot',

      // 选项 / Options
      options: {
        // 调整时间戳 / Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // Kraken 配置 / Kraken configuration
    kraken: {
      // 是否启用 / Whether enabled
      enabled: true,

      // 是否使用沙盒模式 (测试网) / Whether to use sandbox mode (testnet)
      // 现货: 无测试网 | 合约测试网: demo-futures.kraken.com
      sandbox: false,

      // API 请求超时 (毫秒) / API request timeout (ms)
      timeout: 30000,

      // 是否启用限速 / Whether to enable rate limiting
      enableRateLimit: true,

      // 默认交易类型: 'spot' | 'swap' | 'future'
      // Kraken 支持现货和合约交易 / Kraken supports spot and futures trading
      defaultType: 'spot',

      // 选项 / Options
      options: {
        // 调整时间戳 / Adjust for time difference
        adjustForTimeDifference: true,
      },
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

    // ============================================
    // 波动率策略默认参数 / Volatility Strategy Defaults
    // ============================================

    // ATR 突破策略默认参数 / ATR Breakout strategy defaults
    atrBreakout: {
      atrPeriod: 14,
      atrMultiplier: 2.0,
      baselinePeriod: 20,
      useTrailingStop: true,
      stopLossMultiplier: 1.5,
      positionPercent: 95,
    },

    // 布林宽度策略默认参数 / Bollinger Width strategy defaults
    bollingerWidth: {
      bbPeriod: 20,
      bbStdDev: 2.0,
      kcPeriod: 20,
      kcMultiplier: 1.5,
      squeezeThreshold: 20,
      useMomentumConfirm: true,
      positionPercent: 95,
    },

    // 波动率 Regime 策略默认参数 / Volatility Regime strategy defaults
    volatilityRegime: {
      atrPeriod: 14,
      volatilityLookback: 100,
      lowVolThreshold: 25,
      highVolThreshold: 75,
      extremeVolThreshold: 95,
      adxThreshold: 25,
      disableInExtreme: true,
      positionPercent: 95,
    },

    // ============================================
    // 订单流策略默认参数 / Order Flow Strategy Defaults
    // ============================================

    // 订单流/成交行为策略默认参数 / Order Flow strategy defaults
    orderFlow: {
      // 成交量突增参数 / Volume spike parameters
      volumeMAPeriod: 20,           // 成交量均线周期
      volumeSpikeMultiplier: 2.0,   // 成交量突增倍数阈值

      // VWAP 参数 / VWAP parameters
      vwapPeriod: 20,               // VWAP 计算周期
      vwapDeviationThreshold: 1.0,  // VWAP 偏离阈值 (%)

      // 大单参数 / Large order parameters
      largeOrderMultiplier: 3.0,    // 大单判定阈值
      largeOrderRatioThreshold: 0.6, // 大单比例阈值

      // Taker 参数 / Taker parameters
      takerWindow: 10,              // Taker 计算窗口
      takerBuyThreshold: 0.6,       // 看涨阈值
      takerSellThreshold: 0.4,      // 看跌阈值

      // 信号参数 / Signal parameters
      minSignalsForEntry: 2,        // 入场所需最少信号数

      // 启用开关 / Enable flags
      useVolumeSpike: true,         // 是否启用成交量突增
      useVWAPDeviation: true,       // 是否启用 VWAP 偏离
      useLargeOrderRatio: true,     // 是否启用大单比例
      useTakerBuyRatio: true,       // 是否启用 Taker Buy Ratio

      // 风控参数 / Risk parameters
      stopLossPercent: 1.5,         // 止损百分比
      takeProfitPercent: 3.0,       // 止盈百分比
      useTrailingStop: true,        // 是否启用跟踪止损
      trailingStopPercent: 1.0,     // 跟踪止损百分比

      // 仓位参数 / Position parameters
      positionPercent: 95,          // 仓位百分比
    },

    // ============================================
    // 多周期共振策略默认参数 / Multi-Timeframe Resonance Strategy Defaults
    // ============================================

    // 多周期共振策略默认参数 / Multi-Timeframe strategy defaults
    multiTimeframe: {
      // ============================================
      // 1H 大周期参数 (趋势判断) / 1H Major Timeframe Parameters
      // ============================================
      h1ShortPeriod: 10,            // 1H 短期均线周期
      h1LongPeriod: 30,             // 1H 长期均线周期

      // ============================================
      // 15M 中周期参数 (回调判断) / 15M Medium Timeframe Parameters
      // ============================================
      m15RsiPeriod: 14,             // 15M RSI 周期
      m15RsiPullbackLong: 40,       // 多头回调 RSI 阈值 (低于此值认为回调到位)
      m15RsiPullbackShort: 60,      // 空头回调 RSI 阈值 (高于此值认为回调到位)
      m15PullbackPercent: 1.5,      // 价格回撤百分比阈值

      // ============================================
      // 5M 小周期参数 (进场触发) / 5M Minor Timeframe Parameters
      // ============================================
      m5RsiPeriod: 14,              // 5M RSI 周期
      m5RsiOversold: 30,            // 5M RSI 超卖阈值
      m5RsiOverbought: 70,          // 5M RSI 超买阈值
      m5ShortPeriod: 5,             // 5M 短期均线周期
      m5LongPeriod: 15,             // 5M 长期均线周期

      // ============================================
      // 出场参数 / Exit Parameters
      // ============================================
      takeProfitPercent: 3.0,       // 止盈百分比
      stopLossPercent: 1.5,         // 止损百分比
      useTrendExit: true,           // 是否使用趋势反转出场

      // ============================================
      // 仓位参数 / Position Parameters
      // ============================================
      positionPercent: 95,          // 仓位百分比
    },

    // ============================================
    // 市场状态切换策略默认参数 / Regime Switching Strategy Defaults
    // ============================================

    // Regime 切换元策略默认参数 / Regime Switching meta strategy defaults
    regimeSwitching: {
      // 信号聚合方式: 'weighted' | 'majority' | 'any'
      // Signal aggregation mode
      signalAggregation: 'weighted',

      // 加权信号阈值 / Weighted signal threshold
      weightedThreshold: 0.5,

      // 状态切换时是否平仓 / Close position on regime change
      closeOnRegimeChange: true,

      // 极端情况是否强制平仓 / Force close on extreme regime
      forceCloseOnExtreme: true,

      // 默认仓位比例 / Default position percent
      positionPercent: 95,

      // Regime 检测参数 / Regime detection parameters
      regimeParams: {
        // ADX 周期 / ADX period
        adxPeriod: 14,

        // ADX 趋势阈值 / ADX trend threshold
        adxTrendThreshold: 25,

        // ADX 强趋势阈值 / ADX strong trend threshold
        adxStrongTrendThreshold: 40,

        // 布林带周期 / Bollinger Bands period
        bbPeriod: 20,

        // ATR 周期 / ATR period
        atrPeriod: 14,

        // 低波动率百分位 / Low volatility percentile
        lowVolPercentile: 25,

        // 高波动率百分位 / High volatility percentile
        highVolPercentile: 75,

        // 极端波动率百分位 / Extreme volatility percentile
        extremeVolPercentile: 95,

        // Hurst 指数计算周期 / Hurst exponent period
        hurstPeriod: 50,

        // 最小状态持续 K 线数 / Minimum regime duration in candles
        minRegimeDuration: 3,
      },

      // 子策略参数 / Sub-strategy parameters
      strategyParams: {
        SMA: {
          shortPeriod: 10,
          longPeriod: 30,
        },
        MACD: {
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
        },
        RSI: {
          period: 14,
          overbought: 70,
          oversold: 30,
        },
        BollingerBands: {
          period: 20,
          stdDev: 2,
        },
        Grid: {
          gridCount: 10,
          gridSpacing: 0.01,
        },
        ATRBreakout: {
          atrPeriod: 14,
          atrMultiplier: 2.0,
        },
        OrderFlow: {
          volumeSpikeMultiplier: 2.0,
          vwapDeviationThreshold: 1.0,
          takerBuyThreshold: 0.6,
          minSignalsForEntry: 2,
        },
        MultiTimeframe: {
          h1ShortPeriod: 10,
          h1LongPeriod: 30,
          m15RsiPullbackLong: 40,
          m5RsiOversold: 30,
          takeProfitPercent: 3.0,
          stopLossPercent: 1.5,
        },
      },

      // Regime 策略映射 / Regime strategy mapping
      // 可自定义覆盖 / Can be customized
      regimeMap: {
        trending_up: {
          strategies: ['SMA', 'MACD', 'MultiTimeframe', 'WeightedCombo'],
          weights: { SMA: 0.25, MACD: 0.2, MultiTimeframe: 0.2, WeightedCombo: 0.35 },
        },
        trending_down: {
          strategies: ['SMA', 'MACD', 'WeightedCombo'],
          weights: { SMA: 0.35, MACD: 0.25, WeightedCombo: 0.4 },
        },
        ranging: {
          strategies: ['RSI', 'BollingerBands', 'Grid', 'WeightedCombo'],
          weights: { RSI: 0.2, BollingerBands: 0.25, Grid: 0.2, WeightedCombo: 0.35 },
        },
        high_volatility: {
          strategies: ['ATRBreakout', 'OrderFlow', 'WeightedCombo'],
          weights: { ATRBreakout: 0.35, OrderFlow: 0.3, WeightedCombo: 0.35 },
        },
        extreme: {
          strategies: [],
          weights: {},
        },
      },
    },

    // ============================================
    // 加权组合策略默认参数 / Weighted Combo Strategy Defaults
    // ============================================

    // 加权组合策略默认参数 / Weighted Combo strategy defaults
    weightedCombo: {
      // ============================================
      // 策略权重配置 / Strategy Weight Configuration
      // ============================================

      // 策略权重 (总和应为 1.0) / Strategy weights (should sum to 1.0)
      strategyWeights: {
        SMA: 0.4,           // SMA 趋势策略权重 40%
        RSI: 0.2,           // RSI 超买超卖策略权重 20%
        MACD: 0.4,          // MACD 策略权重 40%
      },

      // 交易阈值 / Trading thresholds
      buyThreshold: 0.7,    // 总分 >= 0.7 买入
      sellThreshold: 0.3,   // 总分 <= 0.3 卖出

      // ============================================
      // 子策略参数 / Sub-strategy Parameters
      // ============================================

      smaParams: {
        shortPeriod: 10,
        longPeriod: 30,
      },
      rsiParams: {
        period: 14,
        overbought: 70,
        oversold: 30,
      },
      macdParams: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      },
      bbParams: {
        period: 20,
        stdDev: 2,
      },
      atrParams: {
        period: 14,
        multiplier: 2,
      },

      // ============================================
      // 动态权重调整 / Dynamic Weight Adjustment
      // ============================================

      // 是否启用动态权重 / Enable dynamic weights
      dynamicWeights: true,

      // 权重调整因子 (0-1) / Weight adjustment factor
      adjustmentFactor: 0.2,

      // 评估周期 (交易次数) / Evaluation period (trade count)
      evaluationPeriod: 20,

      // 最小权重 / Minimum weight
      minWeight: 0.05,

      // 最大权重 / Maximum weight
      maxWeight: 0.6,

      // ============================================
      // 相关性限制 / Correlation Limit
      // ============================================

      // 是否启用相关性限制 / Enable correlation limit
      correlationLimit: true,

      // 最大允许相关性 / Maximum allowed correlation
      maxCorrelation: 0.7,

      // 相关性惩罚系数 / Correlation penalty factor
      correlationPenaltyFactor: 0.5,

      // 相关性矩阵 / Correlation matrix
      correlationMatrix: {
        'SMA-MACD': 0.6,            // SMA 和 MACD 相关性较高
        'SMA-RSI': 0.3,             // SMA 和 RSI 相关性中等
        'RSI-BollingerBands': 0.4,  // RSI 和布林带相关性中等
        'MACD-BollingerBands': 0.5, // MACD 和布林带相关性中等
        'SMA-BollingerBands': 0.5,  // SMA 和布林带相关性中等
      },

      // ============================================
      // 熔断机制 / Circuit Breaker
      // ============================================

      // 是否启用熔断 / Enable circuit breaker
      circuitBreaker: true,

      // 连续亏损次数触发熔断 / Consecutive losses to trigger
      consecutiveLossLimit: 5,

      // 最大回撤触发熔断 (百分比) / Max drawdown to trigger
      maxDrawdownLimit: 0.15,

      // 最低胜率触发熔断 / Minimum win rate to trigger
      minWinRate: 0.3,

      // 评估窗口 (交易次数) / Evaluation window (trade count)
      evaluationWindow: 30,

      // 冷却时间 (毫秒) / Cooling period (ms)
      coolingPeriod: 3600000,  // 1 小时

      // 是否自动恢复 / Auto recover
      autoRecover: true,

      // ============================================
      // 止盈止损 / Take Profit & Stop Loss
      // ============================================

      takeProfitPercent: 3.0,   // 止盈百分比
      stopLossPercent: 1.5,     // 止损百分比

      // ============================================
      // 仓位参数 / Position Parameters
      // ============================================

      positionPercent: 95,      // 仓位百分比
    },

    // ============================================
    // 横截面策略默认参数 / Cross-Sectional Strategy Defaults
    // ============================================

    // 横截面策略基础参数 / Cross-Sectional base strategy defaults
    crossSectional: {
      // ============================================
      // 监控交易对列表 / Symbols to monitor
      // ============================================
      symbols: [
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
        'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT',
      ],

      // ============================================
      // 基础参数 / Basic Parameters
      // ============================================
      lookbackPeriod: 20,                    // 回看周期 (K线数量)
      rebalancePeriod: 24 * 60 * 60 * 1000,  // 再平衡周期 (毫秒, 默认每天)

      // ============================================
      // 排名配置 / Ranking Configuration
      // ============================================
      topN: 3,                              // 选取 Top N 个做多
      bottomN: 3,                           // 选取 Bottom N 个做空
      rankingMetric: 'returns',             // 排名指标: returns, sharpe, momentum, volatility
      rankDirection: 'descending',          // 排名方向: ascending, descending

      // ============================================
      // 仓位配置 / Position Configuration
      // ============================================
      positionType: 'long_short',           // 仓位类型: long_only, short_only, long_short, market_neutral
      maxPositionPerAsset: 0.15,            // 单个资产最大仓位比例
      maxPositionPerSide: 0.5,              // 单边总仓位比例
      minPositionSize: 0.01,                // 最小仓位比例
      equalWeight: true,                    // 是否等权重

      // ============================================
      // 风控配置 / Risk Control Configuration
      // ============================================
      stopLoss: 0.05,                       // 止损比例
      takeProfit: 0.15,                     // 止盈比例
      maxDrawdown: 0.10,                    // 最大回撤
      maxCorrelation: 0.8,                  // 最大相关性 (避免持有高度相关资产)

      // ============================================
      // 过滤器配置 / Filter Configuration
      // ============================================
      minDailyVolume: 10000000,             // 最小日均成交量 (USDT)
      minPrice: 0.0001,                     // 最小价格
      excludedSymbols: [],                  // 排除的交易对
    },

    // 动量排名策略默认参数 / Momentum Rank strategy defaults
    momentumRank: {
      // 继承横截面策略基础参数 / Inherits from crossSectional
      lookbackPeriod: 20,
      rebalancePeriod: 24 * 60 * 60 * 1000,
      topN: 5,
      bottomN: 0,                           // 只做多不做空
      rankingMetric: 'momentum',            // 使用动量排名
      positionType: 'long_only',

      // 动量计算参数 / Momentum calculation parameters
      shortMomentumPeriod: 5,               // 短期动量周期
      longMomentumPeriod: 20,               // 长期动量周期
      momentumSmoothing: 3,                 // 动量平滑周期
      useRelativeMomentum: true,            // 是否使用相对动量

      // 仓位参数 / Position parameters
      maxPositionPerAsset: 0.2,
      positionPercent: 95,
    },

    // 轮动策略默认参数 / Rotation strategy defaults
    rotation: {
      // 基础参数 / Basic parameters
      lookbackPeriod: 14,
      rebalancePeriod: 7 * 24 * 60 * 60 * 1000, // 每周再平衡
      topN: 3,
      bottomN: 0,
      positionType: 'long_only',

      // 轮动参数 / Rotation parameters
      rotationMode: 'performance',          // 轮动模式: performance, volatility, mixed
      holdingPeriod: 7 * 24 * 60 * 60 * 1000, // 持有周期 (毫秒)
      minHoldingScore: 0.6,                 // 最小持有得分

      // 动量参数 / Momentum parameters
      momentumWeight: 0.6,                  // 动量权重
      volatilityWeight: 0.2,                // 波动率权重
      volumeWeight: 0.2,                    // 成交量权重

      // 仓位参数 / Position parameters
      maxPositionPerAsset: 0.33,
      positionPercent: 95,
    },

    // 资金费率极值策略默认参数 / Funding Rate Extreme strategy defaults
    fundingRateExtreme: {
      // 基础参数 / Basic parameters
      lookbackPeriod: 24,                   // 24小时回看
      rebalancePeriod: 8 * 60 * 60 * 1000,  // 每8小时再平衡 (与资金费率周期对齐)

      // 资金费率阈值 / Funding rate thresholds
      extremeHighThreshold: 0.001,          // 极端高费率阈值 (0.1%)
      extremeLowThreshold: -0.001,          // 极端低费率阈值 (-0.1%)
      normalHighThreshold: 0.0005,          // 正常高费率阈值 (0.05%)
      normalLowThreshold: -0.0005,          // 正常低费率阈值 (-0.05%)

      // 策略模式 / Strategy mode
      mode: 'contrarian',                   // 模式: contrarian (逆向), trend (顺势)

      // 过滤条件 / Filter conditions
      minFundingRateHistory: 24,            // 最小资金费率历史数量
      minAverageDailyVolume: 50000000,      // 最小日均成交量

      // 仓位参数 / Position parameters
      topN: 3,
      bottomN: 3,
      positionType: 'long_short',
      maxPositionPerAsset: 0.15,
      positionPercent: 95,
    },

    // 跨交易所价差策略默认参数 / Cross-Exchange Spread strategy defaults
    crossExchangeSpread: {
      // 基础参数 / Basic parameters
      exchanges: ['binance', 'okx'],        // 监控的交易所
      lookbackPeriod: 20,
      rebalancePeriod: 60 * 1000,           // 每分钟检查 (套利策略需要高频)

      // 价差阈值 / Spread thresholds
      minSpreadThreshold: 0.002,            // 最小价差阈值 (0.2%)
      entrySpreadThreshold: 0.005,          // 入场价差阈值 (0.5%)
      exitSpreadThreshold: 0.001,           // 出场价差阈值 (0.1%)

      // 套利模式 / Arbitrage mode
      mode: 'statistical',                  // 模式: simple (简单), statistical (统计)
      meanReversionPeriod: 50,              // 均值回归周期
      stdDevThreshold: 2.0,                 // 标准差阈值

      // 执行参数 / Execution parameters
      maxSlippage: 0.001,                   // 最大滑点
      simultaneousExecution: true,          // 是否同时执行
      executionTimeout: 5000,               // 执行超时 (毫秒)

      // 仓位参数 / Position parameters
      maxPositionPerPair: 0.1,              // 每对最大仓位
      positionPercent: 95,
    },

    // ============================================
    // 统计套利策略默认参数 / Statistical Arbitrage Strategy Defaults
    // ============================================

    // 统计套利策略默认参数 / Statistical Arbitrage strategy defaults
    statisticalArbitrage: {
      // ============================================
      // 策略类型配置 / Strategy Type Configuration
      // ============================================
      // 套利类型: pairs_trading, cointegration, cross_exchange, perpetual_spot, triangular
      arbType: 'pairs_trading',

      // ============================================
      // 配对配置 / Pairs Configuration
      // ============================================

      // 候选配对列表 / Candidate pairs list
      candidatePairs: [
        { assetA: 'BTC/USDT', assetB: 'ETH/USDT' },
        { assetA: 'ETH/USDT', assetB: 'BNB/USDT' },
        { assetA: 'SOL/USDT', assetB: 'AVAX/USDT' },
      ],

      // 最大同时持有配对数 / Max active pairs
      maxActivePairs: 5,

      // 回看周期 (用于计算统计量) / Lookback period for statistics
      lookbackPeriod: 60,

      // 协整检验周期 / Cointegration test period
      cointegrationTestPeriod: 100,

      // ============================================
      // 协整检验配置 / Cointegration Test Configuration
      // ============================================

      // ADF检验显著性水平 / ADF test significance level
      adfSignificanceLevel: 0.05,

      // 最小相关性阈值 / Minimum correlation threshold
      minCorrelation: 0.7,

      // 半衰期限制 (天) / Half-life limits (days)
      minHalfLife: 1,
      maxHalfLife: 30,

      // ============================================
      // 信号配置 / Signal Configuration
      // ============================================

      // Z-Score开仓阈值 / Z-Score entry threshold
      entryZScore: 2.0,

      // Z-Score平仓阈值 / Z-Score exit threshold
      exitZScore: 0.5,

      // Z-Score止损阈值 / Z-Score stop loss threshold
      stopLossZScore: 4.0,

      // 最大持仓时间 (毫秒) / Max holding period (ms)
      maxHoldingPeriod: 7 * 24 * 60 * 60 * 1000, // 7天 / 7 days

      // ============================================
      // 跨交易所套利配置 / Cross-Exchange Arbitrage Configuration
      // ============================================

      // 价差开仓阈值 (百分比) / Spread entry threshold (%)
      spreadEntryThreshold: 0.003, // 0.3%

      // 价差平仓阈值 (百分比) / Spread exit threshold (%)
      spreadExitThreshold: 0.001, // 0.1%

      // 交易成本 (单边) / Trading cost (one side)
      tradingCost: 0.001, // 0.1%

      // 滑点估计 / Slippage estimate
      slippageEstimate: 0.0005, // 0.05%

      // ============================================
      // 永续-现货基差配置 / Perpetual-Spot Basis Configuration
      // ============================================

      // 基差入场阈值 (年化) / Basis entry threshold (annualized)
      basisEntryThreshold: 0.15, // 15%

      // 基差出场阈值 (年化) / Basis exit threshold (annualized)
      basisExitThreshold: 0.05, // 5%

      // 资金费率阈值 (8小时) / Funding rate threshold (8h)
      fundingRateThreshold: 0.001, // 0.1%

      // ============================================
      // 仓位管理 / Position Management
      // ============================================

      // 单个配对最大仓位 / Max position per pair
      maxPositionPerPair: 0.1, // 10%

      // 总最大仓位 / Max total position
      maxTotalPosition: 0.5, // 50%

      // 仓位对称 / Symmetric position
      symmetricPosition: true,

      // ============================================
      // 风险控制 / Risk Control
      // ============================================

      // 单配对最大亏损 / Max loss per pair
      maxLossPerPair: 0.02, // 2%

      // 总最大回撤 / Max drawdown
      maxDrawdown: 0.10, // 10%

      // 连续亏损次数触发冷却 / Consecutive loss limit
      consecutiveLossLimit: 3,

      // 冷却时间 (毫秒) / Cooling period (ms)
      coolingPeriod: 24 * 60 * 60 * 1000, // 24小时 / 24 hours
    },

    // ============================================
    // 因子投资策略默认参数 / Factor Investing Strategy Defaults
    // ============================================

    // 因子投资策略默认参数 / Factor Investing strategy defaults
    factorInvesting: {
      // ============================================
      // 监控交易对列表 / Symbols to monitor
      // ============================================
      symbols: [
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
        'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT',
        'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'FIL/USDT',
      ],

      // ============================================
      // 因子类别配置 / Factor Category Configuration
      // ============================================
      factorConfig: {
        // 动量因子 / Momentum factors
        momentum: {
          enabled: true,
          totalWeight: 0.35,
          factors: {
            'Momentum_7d': { weight: 0.4 },
            'Momentum_30d': { weight: 0.35 },
            'RiskAdj_Momentum_7d': { weight: 0.25 },
          },
        },

        // 波动率因子 / Volatility factors
        volatility: {
          enabled: true,
          totalWeight: 0.15,
          factors: {
            'BB_Width_20': { weight: 0.5 },
            'ATR_Ratio': { weight: 0.3 },
            'Keltner_Squeeze': { weight: 0.2 },
          },
        },

        // 资金流向因子 / Money flow factors
        moneyFlow: {
          enabled: true,
          totalWeight: 0.25,
          factors: {
            'MFI_14': { weight: 0.4 },
            'OBV_Slope_20': { weight: 0.3 },
            'CMF_20': { weight: 0.3 },
          },
        },

        // 换手率因子 / Turnover factors
        turnover: {
          enabled: true,
          totalWeight: 0.15,
          factors: {
            'Vol_MA_Ratio_20': { weight: 0.4 },
            'Relative_Volume': { weight: 0.35 },
            'Abnormal_Volume': { weight: 0.25 },
          },
        },

        // 资金费率因子 / Funding rate factors
        fundingRate: {
          enabled: false, // 需要实时数据 / Requires live data
          totalWeight: 0.1,
          factors: {
            'Funding_Percentile': { weight: 0.5 },
            'Funding_ZScore': { weight: 0.3 },
            'Funding_Extreme_Signal': { weight: 0.2 },
          },
        },

        // 大单因子 / Large order factors
        largeOrder: {
          enabled: false, // 需要成交明细 / Requires trade details
          totalWeight: 0.1,
          factors: {
            'LargeOrder_Imbalance': { weight: 0.4 },
            'LargeOrder_Net_Flow': { weight: 0.3 },
            'Whale_Activity': { weight: 0.3 },
          },
        },
      },

      // ============================================
      // 标准化与组合配置 / Normalization & Combination Config
      // ============================================

      // 标准化方法: zscore, min_max, percentile, rank, robust
      normalizationMethod: 'zscore',

      // 组合方法: weighted_sum, weighted_average, rank_average, ic_weighted, equal
      combinationMethod: 'weighted_average',

      // ============================================
      // 选股配置 / Stock Selection Configuration
      // ============================================

      // 做多 Top N 个资产 / Long top N assets
      topN: 5,

      // 做空 Bottom N 个资产 / Short bottom N assets
      bottomN: 5,

      // 仓位类型: long_only, short_only, long_short, market_neutral
      positionType: 'long_short',

      // 权重分配方法: equal, score_weighted, volatility_parity, risk_parity
      weightMethod: 'equal',

      // ============================================
      // 再平衡配置 / Rebalancing Configuration
      // ============================================

      // 再平衡周期 (毫秒) / Rebalance period (ms)
      rebalancePeriod: 24 * 60 * 60 * 1000, // 每天 / Daily

      // 最小变化阈值 (低于此不调仓) / Minimum change threshold
      minRebalanceThreshold: 0.05, // 5%

      // 换手限制 / Turnover limit
      maxTurnover: 0.3, // 单次最大换手 30%

      // ============================================
      // 仓位管理 / Position Management
      // ============================================

      // 单资产最大仓位 / Max position per asset
      maxPositionPerAsset: 0.15, // 15%

      // 单边最大仓位 / Max position per side
      maxPositionPerSide: 0.5, // 50%

      // 总仓位百分比 / Total position percent
      positionPercent: 95,

      // ============================================
      // 风险控制 / Risk Control
      // ============================================

      // 单资产止损 / Stop loss per asset
      stopLoss: 0.05, // 5%

      // 单资产止盈 / Take profit per asset
      takeProfit: 0.15, // 15%

      // 总组合最大回撤 / Max portfolio drawdown
      maxDrawdown: 0.10, // 10%

      // 是否启用波动率缩放 / Enable volatility scaling
      volatilityScaling: true,

      // 目标波动率 (年化) / Target volatility (annualized)
      targetVolatility: 0.20, // 20%

      // ============================================
      // 过滤器配置 / Filter Configuration
      // ============================================

      // 最小日均成交量 (USDT) / Minimum daily volume
      minDailyVolume: 10000000,

      // 最小价格 / Minimum price
      minPrice: 0.0001,

      // 最小因子有效数据点 / Minimum valid data points for factors
      minDataPoints: 30,

      // 排除的交易对 / Excluded symbols
      excludedSymbols: [],
    },

    // ============================================
    // 风控驱动策略默认参数 / Risk-Driven Strategy Defaults
    // ============================================

    // 风控驱动策略默认参数 / Risk-Driven strategy defaults
    riskDriven: {
      // ============================================
      // 风险模式配置 / Risk Mode Configuration
      // ============================================

      // 风险模式: target_volatility, risk_parity, max_drawdown, volatility_breakout, correlation_monitor, combined
      riskMode: 'combined',

      // ============================================
      // 目标波动率参数 / Target Volatility Parameters
      // ============================================

      // 目标年化波动率 / Target annualized volatility
      targetVolatility: 0.15, // 15%

      // 波动率计算回看周期 / Volatility lookback period
      volatilityLookback: 20,

      // 波动率调整速度 (0-1) / Volatility adjustment speed
      volatilityAdjustSpeed: 0.3,

      // 最小仓位比例 / Minimum position ratio
      minPositionRatio: 0.1,

      // 最大仓位比例 / Maximum position ratio
      maxPositionRatio: 1.5,

      // ============================================
      // 最大回撤控制参数 / Max Drawdown Control Parameters
      // ============================================

      // 最大回撤阈值 / Max drawdown threshold
      maxDrawdown: 0.15, // 15%

      // 预警回撤阈值 / Warning drawdown threshold
      warningDrawdown: 0.10, // 10%

      // 严重回撤阈值 / Critical drawdown threshold
      criticalDrawdown: 0.20, // 20%

      // 紧急回撤阈值 / Emergency drawdown threshold
      emergencyDrawdown: 0.25, // 25%

      // 回撤减仓速度 / Drawdown reduce speed
      drawdownReduceSpeed: 0.5,

      // ============================================
      // 波动率突破参数 / Volatility Breakout Parameters
      // ============================================

      // 波动率突破阈值 (倍数) / Volatility breakout threshold (multiplier)
      volatilityBreakoutThreshold: 2.0,

      // 波动率突破回看周期 / Volatility breakout lookback period
      volatilityBreakoutLookback: 60,

      // 强制减仓比例 / Force reduce ratio
      forceReduceRatio: 0.5,

      // ============================================
      // 风险平价参数 / Risk Parity Parameters
      // ============================================

      // 风险平价再平衡阈值 / Risk parity rebalance threshold
      riskParityRebalanceThreshold: 0.1,

      // ============================================
      // 相关性监控参数 / Correlation Monitor Parameters
      // ============================================

      // 相关性计算回看周期 / Correlation lookback period
      correlationLookback: 30,

      // 相关性阈值 / Correlation threshold
      correlationThreshold: 0.8,

      // 相关性突增倍数 / Correlation spike multiplier
      correlationSpikeMultiplier: 1.5,

      // 监控资产列表 / Assets to monitor
      assets: ['BTC/USDT', 'ETH/USDT'],

      // ============================================
      // 仓位参数 / Position Parameters
      // ============================================

      // 仓位百分比 / Position percent
      positionPercent: 95,
    },

    // ============================================
    // 自适应参数策略默认参数 / Adaptive Strategy Defaults
    // ============================================

    // 自适应参数策略默认参数 / Adaptive strategy defaults
    adaptive: {
      // ============================================
      // 自适应模式配置 / Adaptive Mode Configuration
      // ============================================

      // 自适应模式: full, sma_only, rsi_only, bb_only, custom
      adaptiveMode: 'full',

      // 启用开关 / Enable flags
      enableSMAAdaptive: true,       // 启用 SMA 周期自适应
      enableRSIAdaptive: true,       // 启用 RSI 阈值自适应
      enableBBAdaptive: true,        // 启用布林带自适应

      // ============================================
      // SMA 自适应参数 / SMA Adaptive Parameters
      // ============================================

      // 基准周期 / Base periods
      smaBaseFast: 10,               // 快线基准周期
      smaBaseSlow: 30,               // 慢线基准周期

      // 波动率调整范围 (0.5 = 可缩短/延长 50%) / Volatility adjustment range
      smaPeriodAdjustRange: 0.5,

      // 波动率阈值 / Volatility thresholds
      smaVolLowThreshold: 25,        // 低波动百分位
      smaVolHighThreshold: 75,       // 高波动百分位

      // ============================================
      // RSI 自适应参数 / RSI Adaptive Parameters
      // ============================================

      // RSI 周期 / RSI period
      rsiPeriod: 14,

      // 基准阈值 / Base thresholds
      rsiBaseOversold: 30,           // 基准超卖阈值
      rsiBaseOverbought: 70,         // 基准超买阈值

      // 趋势市阈值 / Trending market thresholds
      rsiTrendingOversold: 25,       // 趋势市超卖
      rsiTrendingOverbought: 75,     // 趋势市超买

      // 震荡市阈值 / Ranging market thresholds
      rsiRangingOversold: 35,        // 震荡市超卖
      rsiRangingOverbought: 65,      // 震荡市超买

      // ============================================
      // 布林带自适应参数 / Bollinger Bands Adaptive Parameters
      // ============================================

      // 布林带周期 / Bollinger period
      bbPeriod: 20,

      // 标准差调整范围 / Std dev adjustment range
      bbBaseStdDev: 2.0,             // 基准标准差
      bbMinStdDev: 1.5,              // 低波动时标准差
      bbMaxStdDev: 3.0,              // 高波动时标准差

      // ATR 参考参数 / ATR reference parameters
      atrPeriod: 14,
      atrLookback: 100,

      // ============================================
      // 信号融合参数 / Signal Fusion Parameters
      // ============================================

      // 信号权重 / Signal weights
      smaWeight: 0.4,                // SMA 信号权重
      rsiWeight: 0.3,                // RSI 信号权重
      bbWeight: 0.3,                 // 布林带信号权重

      // 信号确认阈值 / Signal threshold
      signalThreshold: 0.5,

      // 趋势过滤 / Trend filter
      useTrendFilter: true,
      trendMAPeriod: 50,

      // ============================================
      // 市场状态检测参数 / Market Regime Detection Parameters
      // ============================================

      adxPeriod: 14,                 // ADX 周期
      adxTrendThreshold: 25,         // ADX 趋势阈值
      extremeVolPercentile: 95,      // 极端波动率百分位

      // ============================================
      // 仓位参数 / Position Parameters
      // ============================================

      positionPercent: 95,           // 仓位百分比
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

    // ============================================
    // 执行 Alpha 配置 / Execution Alpha Configuration
    // ============================================
    executionAlpha: {
      // 是否启用执行 Alpha / Whether to enable Execution Alpha
      enabled: true,

      // 订单大小分类阈值（相对于日均量）/ Order size classification thresholds
      sizeClassThresholds: {
        tiny: 0.001,      // 0.1% 日均量 / 0.1% of daily volume
        small: 0.005,     // 0.5% 日均量 / 0.5% of daily volume
        medium: 0.02,     // 2% 日均量 / 2% of daily volume
        large: 0.05,      // 5% 日均量 / 5% of daily volume
      },

      // 策略选择权重 / Strategy selection weights
      strategyWeights: {
        liquidity: 0.3,      // 流动性权重 / Liquidity weight
        slippageRisk: 0.3,   // 滑点风险权重 / Slippage risk weight
        urgency: 0.2,        // 紧急性权重 / Urgency weight
        orderSize: 0.2,      // 订单大小权重 / Order size weight
      },

      // 自动策略阈值 / Auto strategy thresholds
      autoStrategyThresholds: {
        minSizeForAlgo: 0.01,     // 1% 日均量使用 TWAP/VWAP / 1% for TWAP/VWAP
        minSizeForIceberg: 0.02,  // 2% 日均量使用冰山单 / 2% for iceberg
      },

      // 默认 TWAP 执行时长（毫秒）/ Default TWAP duration (ms)
      defaultTWAPDuration: 30 * 60 * 1000,  // 30 分钟 / 30 minutes

      // 默认切片数 / Default slice count
      defaultSliceCount: 20,

      // 是否启用自动延迟（高滑点时段）/ Enable auto delay (high slippage periods)
      enableAutoDelay: true,

      // 是否启用滑点记录 / Enable slippage recording
      enableSlippageRecording: true,

      // 是否启用详细日志 / Enable verbose logging
      verbose: false,

      // 盘口分析配置 / Order book analyzer configuration
      orderBookAnalyzer: {
        // 深度分析层数 / Depth analysis levels
        depthLevels: 20,
        // 流动性评估阈值 / Liquidity assessment thresholds
        liquidityThresholds: {
          veryLow: 0.1,   // 10% 可执行
          low: 0.3,       // 30%
          medium: 0.6,    // 60%
          high: 0.9,      // 90%
        },
      },

      // 滑点分析配置 / Slippage analyzer configuration
      slippageAnalyzer: {
        // 历史数据回看周期 / Historical lookback period
        lookbackPeriod: 100,
        // 高风险时段（UTC 小时）/ High risk periods (UTC hours)
        highRiskHours: [0, 8, 16],  // 整点结算时段
        // 预警滑点阈值 / Warning slippage threshold
        warningThreshold: 0.005,  // 0.5%
        // 严重滑点阈值 / Critical slippage threshold
        criticalThreshold: 0.01,  // 1%
      },

      // 冰山单配置 / Iceberg order configuration
      iceberg: {
        // 默认拆分策略: random, linear, adaptive
        defaultSplitStrategy: 'adaptive',
        // 默认显示模式: fixed, random, dynamic
        defaultDisplayMode: 'dynamic',
        // 最小拆分份数 / Minimum split count
        minSplitCount: 5,
        // 最大拆分份数 / Maximum split count
        maxSplitCount: 50,
        // 随机化范围 / Randomization range
        randomizationRange: 0.2,  // ±20%
      },

      // TWAP/VWAP 配置 / TWAP/VWAP configuration
      twapVwap: {
        // 默认算法: twap, vwap, adaptive
        defaultAlgo: 'adaptive',
        // 最小切片间隔（毫秒）/ Minimum slice interval (ms)
        minSliceInterval: 5000,   // 5 秒
        // 最大切片间隔（毫秒）/ Maximum slice interval (ms)
        maxSliceInterval: 300000, // 5 分钟
        // 是否使用市场条件调整 / Use market condition adjustment
        useMarketConditionAdjust: true,
        // 成交量曲线类型: uniform, u_shaped, front_loaded, back_loaded
        defaultVolumeCurve: 'u_shaped',
      },
    },
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
