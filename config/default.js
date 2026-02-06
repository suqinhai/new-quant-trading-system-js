/**
 * 榛樿閰嶇疆鏂囦欢
 * Default Configuration File
 *
 * 绯荤粺榛樿閰嶇疆锛屼細琚幆澧冨彉閲忚鐩?
 * System default configuration, can be overridden by environment variables
 */

export default {
  // ============================================
  // 浜ゆ槗鎵€閰嶇疆 / Exchange Configuration
  // ============================================
  exchange: {
    // 榛樿浜ゆ槗鎵€ / Default exchange
    default: 'binance',

    // Binance 閰嶇疆 / Binance configuration
    binance: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 鏄惁浣跨敤娌欑洅妯″紡 / Whether to use sandbox mode
      sandbox: false,

      // API 璇锋眰瓒呮椂 (姣) / API request timeout (ms)
      timeout: 30000,

      // 鏄惁鍚敤闄愰€?/ Whether to enable rate limiting
      enableRateLimit: true,

      // 榛樿浜ゆ槗绫诲瀷: 'spot' | 'future' | 'swap'
      defaultType: 'swap',

      // 閫夐」 / Options
      options: {
        // 榛樿鏃堕棿鍛ㄦ湡 / Default timeframe
        defaultTimeframe: '1h',

        // 璋冩暣 K 绾挎椂闂?/ Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // OKX 閰嶇疆 / OKX configuration
    okx: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 鏄惁浣跨敤娌欑洅妯″紡 / Whether to use sandbox mode
      sandbox: false,

      // API 璇锋眰瓒呮椂 (姣) / API request timeout (ms)
      timeout: 30000,

      // 鏄惁鍚敤闄愰€?/ Whether to enable rate limiting
      enableRateLimit: true,

      // 榛樿浜ゆ槗绫诲瀷: 'spot' | 'swap' | 'future'
      defaultType: 'swap',
    },

    // Gate.io 閰嶇疆 / Gate.io configuration
    gate: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 鏄惁浣跨敤娌欑洅妯″紡 / Whether to use sandbox mode
      sandbox: false,

      // API 璇锋眰瓒呮椂 (姣) / API request timeout (ms)
      timeout: 30000,

      // 鏄惁鍚敤闄愰€?/ Whether to enable rate limiting
      enableRateLimit: true,

      // 榛樿浜ゆ槗绫诲瀷: 'spot' | 'swap' | 'future'
      defaultType: 'swap',

      // 閫夐」 / Options
      options: {
        // 璋冩暣鏃堕棿鎴?/ Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // Deribit 閰嶇疆 / Deribit configuration
    deribit: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 鏄惁浣跨敤娌欑洅妯″紡 (娴嬭瘯缃? / Whether to use sandbox mode (testnet)
      sandbox: false,

      // API 璇锋眰瓒呮椂 (姣) / API request timeout (ms)
      timeout: 30000,

      // 鏄惁鍚敤闄愰€?/ Whether to enable rate limiting
      enableRateLimit: true,

      // 榛樿浜ゆ槗绫诲瀷: 'swap' | 'future' | 'option'
      // Deribit 涓撴敞浜庤鐢熷搧锛岄粯璁や负姘哥画鍚堢害
      // Deribit focuses on derivatives, default to perpetual
      defaultType: 'swap',

      // 閫夐」 / Options
      options: {
        // 璋冩暣鏃堕棿鎴?/ Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // Bitget 閰嶇疆 / Bitget configuration
    bitget: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 鏄惁浣跨敤娌欑洅妯″紡 (娴嬭瘯缃? / Whether to use sandbox mode (testnet)
      sandbox: false,

      // API 璇锋眰瓒呮椂 (姣) / API request timeout (ms)
      timeout: 30000,

      // 鏄惁鍚敤闄愰€?/ Whether to enable rate limiting
      enableRateLimit: true,

      // 榛樿浜ゆ槗绫诲瀷: 'spot' | 'swap' | 'future'
      defaultType: 'swap',

      // 閫夐」 / Options
      options: {
        // 璋冩暣鏃堕棿鎴?/ Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // KuCoin 閰嶇疆 / KuCoin configuration
    kucoin: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 鏄惁浣跨敤娌欑洅妯″紡 (娴嬭瘯缃? / Whether to use sandbox mode (testnet)
      // 娴嬭瘯缃? sandbox.kucoin.com | 鐢熶骇: api.kucoin.com
      sandbox: false,

      // API 璇锋眰瓒呮椂 (姣) / API request timeout (ms)
      timeout: 30000,

      // 鏄惁鍚敤闄愰€?/ Whether to enable rate limiting
      enableRateLimit: true,

      // 榛樿浜ゆ槗绫诲瀷: 'spot' | 'swap' | 'future'
      // KuCoin 鏀寔鐜拌揣鍜屽悎绾︿氦鏄?/ KuCoin supports spot and futures trading
      defaultType: 'swap',

      // 閫夐」 / Options
      options: {
        // 璋冩暣鏃堕棿鎴?/ Adjust for time difference
        adjustForTimeDifference: true,
      },
    },

    // Kraken 閰嶇疆 / Kraken configuration
    kraken: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 鏄惁浣跨敤娌欑洅妯″紡 (娴嬭瘯缃? / Whether to use sandbox mode (testnet)
      // 鐜拌揣: 鏃犳祴璇曠綉 | 鍚堢害娴嬭瘯缃? demo-futures.kraken.com
      sandbox: false,

      // API 璇锋眰瓒呮椂 (姣) / API request timeout (ms)
      timeout: 30000,

      // 鏄惁鍚敤闄愰€?/ Whether to enable rate limiting
      enableRateLimit: true,

      // 榛樿浜ゆ槗绫诲瀷: 'spot' | 'swap' | 'future'
      // Kraken 鏀寔鐜拌揣鍜屽悎绾︿氦鏄?/ Kraken supports spot and futures trading
      defaultType: 'swap',

      // 閫夐」 / Options
      options: {
        // 璋冩暣鏃堕棿鎴?/ Adjust for time difference
        adjustForTimeDifference: true,
      },
    },
  },

  // ============================================
  // 琛屾儏閰嶇疆 / Market Data Configuration
  // ============================================
  marketData: {
    // WebSocket 閰嶇疆 / WebSocket configuration
    websocket: {
      // 蹇冭烦闂撮殧 (姣) / Heartbeat interval (ms)
      pingInterval: 30000,

      // 瓒呮椂鏃堕棿 (姣) / Timeout (ms)
      pongTimeout: 10000,

      // 閲嶈繛寤惰繜 (姣) / Reconnect delay (ms)
      reconnectDelay: 5000,

      // 鏈€澶ч噸杩炴鏁?/ Max reconnection attempts
      maxReconnectAttempts: 10,
    },

    // 鏁版嵁鑱氬悎閰嶇疆 / Data aggregation configuration
    aggregator: {
      // 鑱氬悎闂撮殧 (姣) / Aggregation interval (ms)
      aggregateInterval: 1000,

      // 濂楀埄妫€娴嬮槇鍊?(鐧惧垎姣? / Arbitrage detection threshold (%)
      arbitrageThreshold: 0.5,
    },

    // 缂撳瓨閰嶇疆 / Cache configuration
    cache: {
      // K绾跨紦瀛樺ぇ灏?/ Candle cache size
      maxCandles: 1000,

      // 琛屾儏缂撳瓨杩囨湡鏃堕棿 (姣) / Ticker cache expiry (ms)
      tickerExpiry: 5000,
    },
  },

  // ============================================
  // Account Configuration
  // ============================================
  account: {
    sharedBalance: {
      enabled: false,
      role: 'auto',
      ttlMs: 5000,
      staleMaxMs: 15000,
      lockTtlMs: 8000,
      waitTimeoutMs: 2000,
    },
  },

  // ============================================
  // 浜ゆ槗閰嶇疆 / Trading Configuration
  // ============================================
  trading: {
    // 鍒濆璧勯噾 (USDT) / Initial capital (USDT)
    initialCapital: 10000,
  },

  // ============================================
  // 绛栫暐閰嶇疆 / Strategy Configuration
  // ============================================
  strategy: {
    // 榛樿绛栫暐 / Default strategy
    default: 'sma',

    // 榛樿鍙傛暟 / Default parameters
    defaults: {
      // 榛樿鏃堕棿鍛ㄦ湡 / Default timeframe
      timeframe: '1h',

      // 榛樿璧勯噾姣斾緥 / Default capital ratio
      capitalRatio: 0.1,

      // 榛樿姝㈡崯姣斾緥 / Default stop loss ratio
      stopLoss: 0.02,

      // 榛樿姝㈢泩姣斾緥 / Default take profit ratio
      takeProfit: 0.04,
    },

    // SMA 绛栫暐榛樿鍙傛暟 / SMA strategy defaults
    sma: {
      fastPeriod: 10,
      slowPeriod: 20,
    },

    // RSI 绛栫暐榛樿鍙傛暟 / RSI strategy defaults
    rsi: {
      period: 14,
      overbought: 70,
      oversold: 30,
    },

    // 甯冩灄甯︾瓥鐣ラ粯璁ゅ弬鏁?/ Bollinger Bands strategy defaults
    bollingerBands: {
      period: 20,
      stdDev: 2,
    },

    // MACD 绛栫暐榛樿鍙傛暟 / MACD strategy defaults
    macd: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
    },

    // 缃戞牸绛栫暐榛樿鍙傛暟 / Grid strategy defaults
    grid: {
      gridCount: 10,
      // 缃戞牸瀹藉害鐧惧垎姣?(鍩轰簬褰撳墠浠锋牸)锛?.1 琛ㄧず涓婁笅鍚?5%
      // Grid width percentage (based on current price), 0.1 means 5% above and below
      gridWidthPercent: 0.1,
      // 鏄惁浣跨敤鍔ㄦ€佷环鏍煎垵濮嬪寲 (浠庝氦鏄撴墍鑾峰彇褰撳墠浠锋牸)
      // Whether to use dynamic price initialization (get current price from exchange)
      useDynamicPrice: true,
      // 价格长期超出区间时自动调整网格
      // Auto adjust grid when price stays out of range
      autoRecenter: true,
      // 调整方式: 'recenter' | 'expand'
      outOfRangeAction: 'recenter',
      // 连续超出多少 tick 触发 (0 表示仅按时间触发)
      outOfRangeRecenterTicks: 0,
      // 超出持续时间触发 (ms)
      outOfRangeRecenterMs: 30 * 60 * 1000,
      // 最小重置间隔 (ms)
      minRecenterIntervalMs: 10 * 60 * 1000,
      // 重置时宽度倍数
      recenterWidthMultiplier: 1.0,
      // 扩网缓冲比例
      expandBufferPercent: 0.05,
      // 是否允许有持仓时调整
      allowRecenterWithPosition: false,
    },

    // ============================================
    // 娉㈠姩鐜囩瓥鐣ラ粯璁ゅ弬鏁?/ Volatility Strategy Defaults
    // ============================================

    // ATR 绐佺牬绛栫暐榛樿鍙傛暟 / ATR Breakout strategy defaults
    atrBreakout: {
      atrPeriod: 14,
      atrMultiplier: 2.0,
      baselinePeriod: 20,
      useTrailingStop: true,
      stopLossMultiplier: 1.5,
      positionPercent: 95,
    },

    // 甯冩灄瀹藉害绛栫暐榛樿鍙傛暟 / Bollinger Width strategy defaults
    bollingerWidth: {
      bbPeriod: 20,
      bbStdDev: 2.0,
      kcPeriod: 20,
      kcMultiplier: 1.5,
      squeezeThreshold: 20,
      useMomentumConfirm: true,
      positionPercent: 95,
    },

    // 娉㈠姩鐜?Regime 绛栫暐榛樿鍙傛暟 / Volatility Regime strategy defaults
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
    // 璁㈠崟娴佺瓥鐣ラ粯璁ゅ弬鏁?/ Order Flow Strategy Defaults
    // ============================================

    // 璁㈠崟娴?鎴愪氦琛屼负绛栫暐榛樿鍙傛暟 / Order Flow strategy defaults
    orderFlow: {
      // 鎴愪氦閲忕獊澧炲弬鏁?/ Volume spike parameters
      volumeMAPeriod: 20,           // 鎴愪氦閲忓潎绾垮懆鏈?
      volumeSpikeMultiplier: 2.0,   // 鎴愪氦閲忕獊澧炲€嶆暟闃堝€?

      // VWAP 鍙傛暟 / VWAP parameters
      vwapPeriod: 20,               // VWAP 璁＄畻鍛ㄦ湡
      vwapDeviationThreshold: 1.0,  // VWAP 鍋忕闃堝€?(%)

      // 澶у崟鍙傛暟 / Large order parameters
      largeOrderMultiplier: 3.0,    // 澶у崟鍒ゅ畾闃堝€?
      largeOrderRatioThreshold: 0.6, // 澶у崟姣斾緥闃堝€?

      // Taker 鍙傛暟 / Taker parameters
      takerWindow: 10,              // Taker 璁＄畻绐楀彛
      takerBuyThreshold: 0.6,       // 鐪嬫定闃堝€?
      takerSellThreshold: 0.4,      // 鐪嬭穼闃堝€?

      // 淇″彿鍙傛暟 / Signal parameters
      minSignalsForEntry: 2,        // 鍏ュ満鎵€闇€鏈€灏戜俊鍙锋暟

      // 鍚敤寮€鍏?/ Enable flags
      useVolumeSpike: true,         // 鏄惁鍚敤鎴愪氦閲忕獊澧?
      useVWAPDeviation: true,       // 鏄惁鍚敤 VWAP 鍋忕
      useLargeOrderRatio: true,     // 鏄惁鍚敤澶у崟姣斾緥
      useTakerBuyRatio: true,       // 鏄惁鍚敤 Taker Buy Ratio

      // 椋庢帶鍙傛暟 / Risk parameters
      stopLossPercent: 1.5,         // 姝㈡崯鐧惧垎姣?
      takeProfitPercent: 3.0,       // 姝㈢泩鐧惧垎姣?
      useTrailingStop: true,        // 鏄惁鍚敤璺熻釜姝㈡崯
      trailingStopPercent: 1.0,     // 璺熻釜姝㈡崯鐧惧垎姣?

      // 浠撲綅鍙傛暟 / Position parameters
      positionPercent: 95,          // 浠撲綅鐧惧垎姣?
    },

    // ============================================
    // 澶氬懆鏈熷叡鎸瓥鐣ラ粯璁ゅ弬鏁?/ Multi-Timeframe Resonance Strategy Defaults
    // ============================================

    // 澶氬懆鏈熷叡鎸瓥鐣ラ粯璁ゅ弬鏁?/ Multi-Timeframe strategy defaults
    multiTimeframe: {
      // ============================================
      // 1H 澶у懆鏈熷弬鏁?(瓒嬪娍鍒ゆ柇) / 1H Major Timeframe Parameters
      // ============================================
      h1ShortPeriod: 10,            // 1H 鐭湡鍧囩嚎鍛ㄦ湡
      h1LongPeriod: 30,             // 1H 闀挎湡鍧囩嚎鍛ㄦ湡

      // ============================================
      // 15M 涓懆鏈熷弬鏁?(鍥炶皟鍒ゆ柇) / 15M Medium Timeframe Parameters
      // ============================================
      m15RsiPeriod: 14,             // 15M RSI 鍛ㄦ湡
      m15RsiPullbackLong: 40,       // 澶氬ご鍥炶皟 RSI 闃堝€?(浣庝簬姝ゅ€艰涓哄洖璋冨埌浣?
      m15RsiPullbackShort: 60,      // 绌哄ご鍥炶皟 RSI 闃堝€?(楂樹簬姝ゅ€艰涓哄洖璋冨埌浣?
      m15PullbackPercent: 1.5,      // 浠锋牸鍥炴挙鐧惧垎姣旈槇鍊?

      // ============================================
      // 5M 灏忓懆鏈熷弬鏁?(杩涘満瑙﹀彂) / 5M Minor Timeframe Parameters
      // ============================================
      m5RsiPeriod: 14,              // 5M RSI 鍛ㄦ湡
      m5RsiOversold: 30,            // 5M RSI 瓒呭崠闃堝€?
      m5RsiOverbought: 70,          // 5M RSI 瓒呬拱闃堝€?
      m5ShortPeriod: 5,             // 5M 鐭湡鍧囩嚎鍛ㄦ湡
      m5LongPeriod: 15,             // 5M 闀挎湡鍧囩嚎鍛ㄦ湡

      // ============================================
      // 鍑哄満鍙傛暟 / Exit Parameters
      // ============================================
      takeProfitPercent: 3.0,       // 姝㈢泩鐧惧垎姣?
      stopLossPercent: 1.5,         // 姝㈡崯鐧惧垎姣?
      useTrendExit: true,           // 鏄惁浣跨敤瓒嬪娍鍙嶈浆鍑哄満

      // ============================================
      // 浠撲綅鍙傛暟 / Position Parameters
      // ============================================
      positionPercent: 95,          // 浠撲綅鐧惧垎姣?
    },

    // ============================================
    // 甯傚満鐘舵€佸垏鎹㈢瓥鐣ラ粯璁ゅ弬鏁?/ Regime Switching Strategy Defaults
    // ============================================

    // Regime 鍒囨崲鍏冪瓥鐣ラ粯璁ゅ弬鏁?/ Regime Switching meta strategy defaults
    regimeSwitching: {
      // 淇″彿鑱氬悎鏂瑰紡: 'weighted' | 'majority' | 'any'
      // Signal aggregation mode
      signalAggregation: 'weighted',

      // 鍔犳潈淇″彿闃堝€?/ Weighted signal threshold
      weightedThreshold: 0.5,

      // 鐘舵€佸垏鎹㈡椂鏄惁骞充粨 / Close position on regime change
      closeOnRegimeChange: true,

      // 鏋佺鎯呭喌鏄惁寮哄埗骞充粨 / Force close on extreme regime
      forceCloseOnExtreme: true,

      // 榛樿浠撲綅姣斾緥 / Default position percent
      positionPercent: 95,

      // Regime 妫€娴嬪弬鏁?/ Regime detection parameters
      regimeParams: {
        // ADX 鍛ㄦ湡 / ADX period
        adxPeriod: 14,

        // ADX 瓒嬪娍闃堝€?/ ADX trend threshold
        adxTrendThreshold: 25,

        // ADX 寮鸿秼鍔块槇鍊?/ ADX strong trend threshold
        adxStrongTrendThreshold: 40,

        // 甯冩灄甯﹀懆鏈?/ Bollinger Bands period
        bbPeriod: 20,

        // ATR 鍛ㄦ湡 / ATR period
        atrPeriod: 14,

        // 浣庢尝鍔ㄧ巼鐧惧垎浣?/ Low volatility percentile
        lowVolPercentile: 25,

        // 楂樻尝鍔ㄧ巼鐧惧垎浣?/ High volatility percentile
        highVolPercentile: 80,

        // 鏋佺娉㈠姩鐜囩櫨鍒嗕綅 / Extreme volatility percentile
        extremeVolPercentile: 98,

        // Hurst 鎸囨暟璁＄畻鍛ㄦ湡 / Hurst exponent period
        hurstPeriod: 50,

        // 鏈€灏忕姸鎬佹寔缁?K 绾挎暟 / Minimum regime duration in candles
        minRegimeDuration: 5,
      },

      // 瀛愮瓥鐣ュ弬鏁?/ Sub-strategy parameters
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
          gridWidthPercent: 0.1,
          useDynamicPrice: true,
          autoRecenter: true,
          outOfRangeAction: 'recenter',
          outOfRangeRecenterTicks: 0,
          outOfRangeRecenterMs: 30 * 60 * 1000,
          minRecenterIntervalMs: 10 * 60 * 1000,
          recenterWidthMultiplier: 1.0,
          expandBufferPercent: 0.05,
          allowRecenterWithPosition: false,
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

      // Regime 绛栫暐鏄犲皠 / Regime strategy mapping
      // 鍙嚜瀹氫箟瑕嗙洊 / Can be customized
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
    // 鍔犳潈缁勫悎绛栫暐榛樿鍙傛暟 / Weighted Combo Strategy Defaults
    // ============================================

    // 鍔犳潈缁勫悎绛栫暐榛樿鍙傛暟 / Weighted Combo strategy defaults
    weightedCombo: {
      // ============================================
      // 绛栫暐鏉冮噸閰嶇疆 / Strategy Weight Configuration
      // ============================================

      // 绛栫暐鏉冮噸 (鎬诲拰搴斾负 1.0) / Strategy weights (should sum to 1.0)
      strategyWeights: {
        SMA: 0.4,           // SMA 瓒嬪娍绛栫暐鏉冮噸 40%
        RSI: 0.2,           // RSI 瓒呬拱瓒呭崠绛栫暐鏉冮噸 20%
        MACD: 0.4,          // MACD 绛栫暐鏉冮噸 40%
      },

      // 浜ゆ槗闃堝€?/ Trading thresholds
      // 闄嶄綆闃堝€煎鍔犱俊鍙烽鐜?/ Lower thresholds to increase signal frequency
      buyThreshold: 0.8,    // 鎬诲垎 >= 0.8 涔板叆
      sellThreshold: 0.2,   // 鎬诲垎 <= 0.2 鍗栧嚭

      // ============================================
      // 瀛愮瓥鐣ュ弬鏁?/ Sub-strategy Parameters
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
      // 鍔ㄦ€佹潈閲嶈皟鏁?/ Dynamic Weight Adjustment
      // ============================================

      // 鏄惁鍚敤鍔ㄦ€佹潈閲?/ Enable dynamic weights
      dynamicWeights: true,

      // 鏉冮噸璋冩暣鍥犲瓙 (0-1) / Weight adjustment factor
      adjustmentFactor: 0.2,

      // 璇勪及鍛ㄦ湡 (浜ゆ槗娆℃暟) / Evaluation period (trade count)
      evaluationPeriod: 20,

      // 鏈€灏忔潈閲?/ Minimum weight
      minWeight: 0.05,

      // 鏈€澶ф潈閲?/ Maximum weight
      maxWeight: 0.6,

      // ============================================
      // 鐩稿叧鎬ч檺鍒?/ Correlation Limit
      // ============================================

      // 鏄惁鍚敤鐩稿叧鎬ч檺鍒?/ Enable correlation limit
      correlationLimit: true,

      // 鏈€澶у厑璁哥浉鍏虫€?/ Maximum allowed correlation
      maxCorrelation: 0.7,

      // 鐩稿叧鎬ф儵缃氱郴鏁?/ Correlation penalty factor
      correlationPenaltyFactor: 0.5,

      // 鐩稿叧鎬х煩闃?/ Correlation matrix
      correlationMatrix: {
        'SMA-MACD': 0.6,            // SMA 鍜?MACD 鐩稿叧鎬ц緝楂?
        'SMA-RSI': 0.3,             // SMA 鍜?RSI 鐩稿叧鎬т腑绛?
        'RSI-BollingerBands': 0.4,  // RSI 鍜屽竷鏋楀甫鐩稿叧鎬т腑绛?
        'MACD-BollingerBands': 0.5, // MACD 鍜屽竷鏋楀甫鐩稿叧鎬т腑绛?
        'SMA-BollingerBands': 0.5,  // SMA 鍜屽竷鏋楀甫鐩稿叧鎬т腑绛?
      },

      // ============================================
      // 鐔旀柇鏈哄埗 / Circuit Breaker
      // ============================================

      // 鏄惁鍚敤鐔旀柇 / Enable circuit breaker
      circuitBreaker: true,

      // 杩炵画浜忔崯娆℃暟瑙﹀彂鐔旀柇 / Consecutive losses to trigger
      consecutiveLossLimit: 5,

      // 鏈€澶у洖鎾よЕ鍙戠啍鏂?(鐧惧垎姣? / Max drawdown to trigger
      maxDrawdownLimit: 0.15,

      // 鏈€浣庤儨鐜囪Е鍙戠啍鏂?/ Minimum win rate to trigger
      minWinRate: 0.3,

      // 璇勪及绐楀彛 (浜ゆ槗娆℃暟) / Evaluation window (trade count)
      evaluationWindow: 30,

      // 鍐峰嵈鏃堕棿 (姣) / Cooling period (ms)
      coolingPeriod: 3600000,  // 1 灏忔椂

      // 鏄惁鑷姩鎭㈠ / Auto recover
      autoRecover: true,

      // ============================================
      // 姝㈢泩姝㈡崯 / Take Profit & Stop Loss
      // ============================================

      takeProfitPercent: 3.0,   // 姝㈢泩鐧惧垎姣?
      stopLossPercent: 1.5,     // 姝㈡崯鐧惧垎姣?

      // ============================================
      // 浠撲綅鍙傛暟 / Position Parameters
      // ============================================

      positionPercent: 95,      // 浠撲綅鐧惧垎姣?
    },

    // ============================================
    // 妯埅闈㈢瓥鐣ラ粯璁ゅ弬鏁?/ Cross-Sectional Strategy Defaults
    // ============================================

    // 妯埅闈㈢瓥鐣ュ熀纭€鍙傛暟 / Cross-Sectional base strategy defaults
    crossSectional: {
      // ============================================
      // 鐩戞帶浜ゆ槗瀵瑰垪琛?/ Symbols to monitor
      // ============================================
      symbols: [
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
        'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT',
      ],

      // ============================================
      // 鍩虹鍙傛暟 / Basic Parameters
      // ============================================
      lookbackPeriod: 20,                    // 鍥炵湅鍛ㄦ湡 (K绾挎暟閲?
      rebalancePeriod: 24 * 60 * 60 * 1000,  // 鍐嶅钩琛″懆鏈?(姣, 榛樿姣忓ぉ)

      // ============================================
      // 鎺掑悕閰嶇疆 / Ranking Configuration
      // ============================================
      topN: 3,                              // 閫夊彇 Top N 涓仛澶?
      bottomN: 3,                           // 閫夊彇 Bottom N 涓仛绌?
      rankingMetric: 'returns',             // 鎺掑悕鎸囨爣: returns, sharpe, momentum, volatility
      rankDirection: 'descending',          // 鎺掑悕鏂瑰悜: ascending, descending

      // ============================================
      // 浠撲綅閰嶇疆 / Position Configuration
      // ============================================
      positionType: 'long_short',           // 浠撲綅绫诲瀷: long_only, short_only, long_short, market_neutral
      maxPositionPerAsset: 0.15,            // 鍗曚釜璧勪骇鏈€澶т粨浣嶆瘮渚?
      maxPositionPerSide: 0.5,              // 鍗曡竟鎬讳粨浣嶆瘮渚?
      minPositionSize: 0.01,                // 鏈€灏忎粨浣嶆瘮渚?
      equalWeight: true,                    // 鏄惁绛夋潈閲?

      // ============================================
      // 椋庢帶閰嶇疆 / Risk Control Configuration
      // ============================================
      stopLoss: 0.05,                       // 姝㈡崯姣斾緥
      takeProfit: 0.15,                     // 姝㈢泩姣斾緥
      maxDrawdown: 0.10,                    // 鏈€澶у洖鎾?
      maxCorrelation: 0.8,                  // 鏈€澶х浉鍏虫€?(閬垮厤鎸佹湁楂樺害鐩稿叧璧勪骇)

      // ============================================
      // 杩囨护鍣ㄩ厤缃?/ Filter Configuration
      // ============================================
      minDailyVolume: 10000000,             // 鏈€灏忔棩鍧囨垚浜ら噺 (USDT)
      minPrice: 0.0001,                     // 鏈€灏忎环鏍?
      excludedSymbols: [],                  // 鎺掗櫎鐨勪氦鏄撳
    },

    // 鍔ㄩ噺鎺掑悕绛栫暐榛樿鍙傛暟 / Momentum Rank strategy defaults
    momentumRank: {
      // 缁ф壙妯埅闈㈢瓥鐣ュ熀纭€鍙傛暟 / Inherits from crossSectional
      lookbackPeriod: 20,
      rebalancePeriod: 24 * 60 * 60 * 1000,
      topN: 5,
      bottomN: 0,                           // 鍙仛澶氫笉鍋氱┖
      rankingMetric: 'momentum',            // 浣跨敤鍔ㄩ噺鎺掑悕
      positionType: 'long_only',

      // 鍔ㄩ噺璁＄畻鍙傛暟 / Momentum calculation parameters
      shortMomentumPeriod: 5,               // 鐭湡鍔ㄩ噺鍛ㄦ湡
      longMomentumPeriod: 20,               // 闀挎湡鍔ㄩ噺鍛ㄦ湡
      momentumSmoothing: 3,                 // 鍔ㄩ噺骞虫粦鍛ㄦ湡
      useRelativeMomentum: true,            // 鏄惁浣跨敤鐩稿鍔ㄩ噺

      // 浠撲綅鍙傛暟 / Position parameters
      maxPositionPerAsset: 0.2,
      positionPercent: 95,
    },

    // 杞姩绛栫暐榛樿鍙傛暟 / Rotation strategy defaults
    rotation: {
      // 鍩虹鍙傛暟 / Basic parameters
      lookbackPeriod: 14,
      rebalancePeriod: 7 * 24 * 60 * 60 * 1000, // 姣忓懆鍐嶅钩琛?
      topN: 3,
      bottomN: 0,
      positionType: 'long_only',

      // 杞姩鍙傛暟 / Rotation parameters
      rotationMode: 'performance',          // 杞姩妯″紡: performance, volatility, mixed
      holdingPeriod: 7 * 24 * 60 * 60 * 1000, // 鎸佹湁鍛ㄦ湡 (姣)
      minHoldingScore: 0.6,                 // 鏈€灏忔寔鏈夊緱鍒?

      // 鍔ㄩ噺鍙傛暟 / Momentum parameters
      momentumWeight: 0.6,                  // 鍔ㄩ噺鏉冮噸
      volatilityWeight: 0.2,                // 娉㈠姩鐜囨潈閲?
      volumeWeight: 0.2,                    // 鎴愪氦閲忔潈閲?

      // 浠撲綅鍙傛暟 / Position parameters
      maxPositionPerAsset: 0.33,
      positionPercent: 95,
    },

    // 璧勯噾璐圭巼鏋佸€肩瓥鐣ラ粯璁ゅ弬鏁?/ Funding Rate Extreme strategy defaults
    fundingRateExtreme: {
      // 鍩虹鍙傛暟 / Basic parameters
      lookbackPeriod: 24,                   // 24灏忔椂鍥炵湅
      rebalancePeriod: 8 * 60 * 60 * 1000,  // 姣?灏忔椂鍐嶅钩琛?(涓庤祫閲戣垂鐜囧懆鏈熷榻?

      // 璧勯噾璐圭巼闃堝€?/ Funding rate thresholds
      extremeHighThreshold: 0.001,          // 鏋佺楂樿垂鐜囬槇鍊?(0.1%)
      extremeLowThreshold: -0.001,          // 鏋佺浣庤垂鐜囬槇鍊?(-0.1%)
      normalHighThreshold: 0.0005,          // 姝ｅ父楂樿垂鐜囬槇鍊?(0.05%)
      normalLowThreshold: -0.0005,          // 姝ｅ父浣庤垂鐜囬槇鍊?(-0.05%)

      // 绛栫暐妯″紡 / Strategy mode
      mode: 'contrarian',                   // 妯″紡: contrarian (閫嗗悜), trend (椤哄娍)

      // 杩囨护鏉′欢 / Filter conditions
      minFundingRateHistory: 24,            // 鏈€灏忚祫閲戣垂鐜囧巻鍙叉暟閲?
      minAverageDailyVolume: 50000000,      // 鏈€灏忔棩鍧囨垚浜ら噺

      // 浠撲綅鍙傛暟 / Position parameters
      topN: 3,
      bottomN: 3,
      positionType: 'long_short',
      maxPositionPerAsset: 0.15,
      positionPercent: 95,
    },

    // 璺ㄤ氦鏄撴墍浠峰樊绛栫暐榛樿鍙傛暟 / Cross-Exchange Spread strategy defaults
    crossExchangeSpread: {
      // 鍩虹鍙傛暟 / Basic parameters
      exchanges: ['binance', 'okx'],        // 鐩戞帶鐨勪氦鏄撴墍
      lookbackPeriod: 20,
      rebalancePeriod: 60 * 1000,           // 姣忓垎閽熸鏌?(濂楀埄绛栫暐闇€瑕侀珮棰?

      // 浠峰樊闃堝€?/ Spread thresholds
      minSpreadThreshold: 0.002,            // 鏈€灏忎环宸槇鍊?(0.2%)
      entrySpreadThreshold: 0.005,          // 鍏ュ満浠峰樊闃堝€?(0.5%)
      exitSpreadThreshold: 0.001,           // 鍑哄満浠峰樊闃堝€?(0.1%)

      // 濂楀埄妯″紡 / Arbitrage mode
      mode: 'statistical',                  // 妯″紡: simple (绠€鍗?, statistical (缁熻)
      meanReversionPeriod: 50,              // 鍧囧€煎洖褰掑懆鏈?
      stdDevThreshold: 2.0,                 // 鏍囧噯宸槇鍊?

      // 鎵ц鍙傛暟 / Execution parameters
      maxSlippage: 0.001,                   // 鏈€澶ф粦鐐?
      simultaneousExecution: true,          // 鏄惁鍚屾椂鎵ц
      executionTimeout: 5000,               // 鎵ц瓒呮椂 (姣)

      // 浠撲綅鍙傛暟 / Position parameters
      maxPositionPerPair: 0.1,              // 姣忓鏈€澶т粨浣?
      positionPercent: 95,
    },

    // ============================================
    // 缁熻濂楀埄绛栫暐榛樿鍙傛暟 / Statistical Arbitrage Strategy Defaults
    // ============================================

    // 缁熻濂楀埄绛栫暐榛樿鍙傛暟 / Statistical Arbitrage strategy defaults
    statisticalArbitrage: {
      // ============================================
      // 绛栫暐绫诲瀷閰嶇疆 / Strategy Type Configuration
      // ============================================
      // 濂楀埄绫诲瀷: pairs_trading, cointegration, cross_exchange, perpetual_spot, triangular
      arbType: 'pairs_trading',

      // ============================================
      // 閰嶅閰嶇疆 / Pairs Configuration
      // ============================================

      // 鍊欓€夐厤瀵瑰垪琛?/ Candidate pairs list
      candidatePairs: [
        { assetA: 'BTC/USDT', assetB: 'ETH/USDT' },
        { assetA: 'ETH/USDT', assetB: 'BNB/USDT' },
        { assetA: 'SOL/USDT', assetB: 'AVAX/USDT' },
      ],

      // 鏈€澶у悓鏃舵寔鏈夐厤瀵规暟 / Max active pairs
      maxActivePairs: 5,

      // 鍥炵湅鍛ㄦ湡 (鐢ㄤ簬璁＄畻缁熻閲? / Lookback period for statistics
      lookbackPeriod: 60,

      // 鍗忔暣妫€楠屽懆鏈?/ Cointegration test period
      cointegrationTestPeriod: 100,

      // ============================================
      // 鍗忔暣妫€楠岄厤缃?/ Cointegration Test Configuration
      // ============================================

      // ADF妫€楠屾樉钁楁€ф按骞?/ ADF test significance level
      adfSignificanceLevel: 0.05,

      // 鏈€灏忕浉鍏虫€ч槇鍊?/ Minimum correlation threshold
      minCorrelation: 0.7,

      // 鍗婅“鏈熼檺鍒?(澶? / Half-life limits (days)
      minHalfLife: 1,
      maxHalfLife: 30,

      // ============================================
      // 淇″彿閰嶇疆 / Signal Configuration
      // ============================================

      // Z-Score寮€浠撻槇鍊?/ Z-Score entry threshold
      entryZScore: 2.0,

      // Z-Score骞充粨闃堝€?/ Z-Score exit threshold
      exitZScore: 0.5,

      // Z-Score姝㈡崯闃堝€?/ Z-Score stop loss threshold
      stopLossZScore: 4.0,

      // 鏈€澶ф寔浠撴椂闂?(姣) / Max holding period (ms)
      maxHoldingPeriod: 7 * 24 * 60 * 60 * 1000, // 7澶?/ 7 days

      // ============================================
      // 璺ㄤ氦鏄撴墍濂楀埄閰嶇疆 / Cross-Exchange Arbitrage Configuration
      // ============================================

      // 浠峰樊寮€浠撻槇鍊?(鐧惧垎姣? / Spread entry threshold (%)
      spreadEntryThreshold: 0.003, // 0.3%

      // 浠峰樊骞充粨闃堝€?(鐧惧垎姣? / Spread exit threshold (%)
      spreadExitThreshold: 0.001, // 0.1%

      // 浜ゆ槗鎴愭湰 (鍗曡竟) / Trading cost (one side)
      tradingCost: 0.001, // 0.1%

      // 婊戠偣浼拌 / Slippage estimate
      slippageEstimate: 0.0005, // 0.05%

      // ============================================
      // 姘哥画-鐜拌揣鍩哄樊閰嶇疆 / Perpetual-Spot Basis Configuration
      // ============================================

      // 鍩哄樊鍏ュ満闃堝€?(骞村寲) / Basis entry threshold (annualized)
      basisEntryThreshold: 0.15, // 15%

      // 鍩哄樊鍑哄満闃堝€?(骞村寲) / Basis exit threshold (annualized)
      basisExitThreshold: 0.05, // 5%

      // 璧勯噾璐圭巼闃堝€?(8灏忔椂) / Funding rate threshold (8h)
      fundingRateThreshold: 0.001, // 0.1%

      // ============================================
      // 浠撲綅绠＄悊 / Position Management
      // ============================================

      // 鍗曚釜閰嶅鏈€澶т粨浣?/ Max position per pair
      maxPositionPerPair: 0.1, // 10%

      // 鎬绘渶澶т粨浣?/ Max total position
      maxTotalPosition: 0.5, // 50%

      // 浠撲綅瀵圭О / Symmetric position
      symmetricPosition: true,

      // ============================================
      // 椋庨櫓鎺у埗 / Risk Control
      // ============================================

      // 鍗曢厤瀵规渶澶т簭鎹?/ Max loss per pair
      maxLossPerPair: 0.02, // 2%

      // 鎬绘渶澶у洖鎾?/ Max drawdown
      maxDrawdown: 0.10, // 10%

      // 杩炵画浜忔崯娆℃暟瑙﹀彂鍐峰嵈 / Consecutive loss limit
      consecutiveLossLimit: 3,

      // 鍐峰嵈鏃堕棿 (姣) / Cooling period (ms)
      coolingPeriod: 24 * 60 * 60 * 1000, // 24灏忔椂 / 24 hours
    },

    // ============================================
    // 鍥犲瓙鎶曡祫绛栫暐榛樿鍙傛暟 / Factor Investing Strategy Defaults
    // ============================================

    // 鍥犲瓙鎶曡祫绛栫暐榛樿鍙傛暟 / Factor Investing strategy defaults
    factorInvesting: {
      // ============================================
      // 鐩戞帶浜ゆ槗瀵瑰垪琛?/ Symbols to monitor
      // ============================================
      symbols: [
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
        'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT',
        'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'FIL/USDT',
      ],

      // ============================================
      // 鍥犲瓙绫诲埆閰嶇疆 / Factor Category Configuration
      // ============================================
      factorConfig: {
        // 鍔ㄩ噺鍥犲瓙 / Momentum factors
        momentum: {
          enabled: true,
          totalWeight: 0.35,
          factors: {
            'Momentum_7d': { weight: 0.4 },
            'Momentum_30d': { weight: 0.35 },
            'RiskAdj_Momentum_7d': { weight: 0.25 },
          },
        },

        // 娉㈠姩鐜囧洜瀛?/ Volatility factors
        volatility: {
          enabled: true,
          totalWeight: 0.15,
          factors: {
            'BB_Width_20': { weight: 0.5 },
            'ATR_Ratio': { weight: 0.3 },
            'Keltner_Squeeze': { weight: 0.2 },
          },
        },

        // 璧勯噾娴佸悜鍥犲瓙 / Money flow factors
        moneyFlow: {
          enabled: true,
          totalWeight: 0.25,
          factors: {
            'MFI_14': { weight: 0.4 },
            'OBV_Slope_20': { weight: 0.3 },
            'CMF_20': { weight: 0.3 },
          },
        },

        // 鎹㈡墜鐜囧洜瀛?/ Turnover factors
        turnover: {
          enabled: true,
          totalWeight: 0.15,
          factors: {
            'Vol_MA_Ratio_20': { weight: 0.4 },
            'Relative_Volume': { weight: 0.35 },
            'Abnormal_Volume': { weight: 0.25 },
          },
        },

        // 璧勯噾璐圭巼鍥犲瓙 / Funding rate factors
        fundingRate: {
          enabled: false, // 闇€瑕佸疄鏃舵暟鎹?/ Requires live data
          totalWeight: 0.1,
          factors: {
            'Funding_Percentile': { weight: 0.5 },
            'Funding_ZScore': { weight: 0.3 },
            'Funding_Extreme_Signal': { weight: 0.2 },
          },
        },

        // 澶у崟鍥犲瓙 / Large order factors
        largeOrder: {
          enabled: false, // 闇€瑕佹垚浜ゆ槑缁?/ Requires trade details
          totalWeight: 0.1,
          factors: {
            'LargeOrder_Imbalance': { weight: 0.4 },
            'LargeOrder_Net_Flow': { weight: 0.3 },
            'Whale_Activity': { weight: 0.3 },
          },
        },
      },

      // ============================================
      // 鏍囧噯鍖栦笌缁勫悎閰嶇疆 / Normalization & Combination Config
      // ============================================

      // 鏍囧噯鍖栨柟娉? zscore, min_max, percentile, rank, robust
      normalizationMethod: 'zscore',

      // 缁勫悎鏂规硶: weighted_sum, weighted_average, rank_average, ic_weighted, equal
      combinationMethod: 'weighted_average',

      // ============================================
      // 閫夎偂閰嶇疆 / Stock Selection Configuration
      // ============================================

      // 鍋氬 Top N 涓祫浜?/ Long top N assets
      topN: 5,

      // 鍋氱┖ Bottom N 涓祫浜?/ Short bottom N assets
      bottomN: 5,

      // 浠撲綅绫诲瀷: long_only, short_only, long_short, market_neutral
      positionType: 'long_short',

      // 鏉冮噸鍒嗛厤鏂规硶: equal, score_weighted, volatility_parity, risk_parity
      weightMethod: 'equal',

      // ============================================
      // 鍐嶅钩琛￠厤缃?/ Rebalancing Configuration
      // ============================================

      // 鍐嶅钩琛″懆鏈?(姣) / Rebalance period (ms)
      rebalancePeriod: 24 * 60 * 60 * 1000, // 姣忓ぉ / Daily

      // 鏈€灏忓彉鍖栭槇鍊?(浣庝簬姝や笉璋冧粨) / Minimum change threshold
      minRebalanceThreshold: 0.05, // 5%

      // 鎹㈡墜闄愬埗 / Turnover limit
      maxTurnover: 0.3, // 鍗曟鏈€澶ф崲鎵?30%

      // ============================================
      // 浠撲綅绠＄悊 / Position Management
      // ============================================

      // 鍗曡祫浜ф渶澶т粨浣?/ Max position per asset
      maxPositionPerAsset: 0.15, // 15%

      // 鍗曡竟鏈€澶т粨浣?/ Max position per side
      maxPositionPerSide: 0.5, // 50%

      // 鎬讳粨浣嶇櫨鍒嗘瘮 / Total position percent
      positionPercent: 95,

      // ============================================
      // 椋庨櫓鎺у埗 / Risk Control
      // ============================================

      // 鍗曡祫浜ф鎹?/ Stop loss per asset
      stopLoss: 0.05, // 5%

      // 鍗曡祫浜ф鐩?/ Take profit per asset
      takeProfit: 0.15, // 15%

      // 鎬荤粍鍚堟渶澶у洖鎾?/ Max portfolio drawdown
      maxDrawdown: 0.10, // 10%

      // 鏄惁鍚敤娉㈠姩鐜囩缉鏀?/ Enable volatility scaling
      volatilityScaling: true,

      // 鐩爣娉㈠姩鐜?(骞村寲) / Target volatility (annualized)
      targetVolatility: 0.20, // 20%

      // ============================================
      // 杩囨护鍣ㄩ厤缃?/ Filter Configuration
      // ============================================

      // 鏈€灏忔棩鍧囨垚浜ら噺 (USDT) / Minimum daily volume
      minDailyVolume: 10000000,

      // 鏈€灏忎环鏍?/ Minimum price
      minPrice: 0.0001,

      // 鏈€灏忓洜瀛愭湁鏁堟暟鎹偣 / Minimum valid data points for factors
      minDataPoints: 30,

      // 鎺掗櫎鐨勪氦鏄撳 / Excluded symbols
      excludedSymbols: [],
    },

    // ============================================
    // 椋庢帶椹卞姩绛栫暐榛樿鍙傛暟 / Risk-Driven Strategy Defaults
    // ============================================

    // 椋庢帶椹卞姩绛栫暐榛樿鍙傛暟 / Risk-Driven strategy defaults
    riskDriven: {
      // ============================================
      // 椋庨櫓妯″紡閰嶇疆 / Risk Mode Configuration
      // ============================================

      // 椋庨櫓妯″紡: target_volatility, risk_parity, max_drawdown, volatility_breakout, correlation_monitor, combined
      riskMode: 'combined',

      // ============================================
      // 鐩爣娉㈠姩鐜囧弬鏁?/ Target Volatility Parameters
      // ============================================

      // 鐩爣骞村寲娉㈠姩鐜?/ Target annualized volatility
      targetVolatility: 0.15, // 15%

      // 娉㈠姩鐜囪绠楀洖鐪嬪懆鏈?/ Volatility lookback period
      volatilityLookback: 20,

      // 娉㈠姩鐜囪皟鏁撮€熷害 (0-1) / Volatility adjustment speed
      volatilityAdjustSpeed: 0.3,

      // 鏈€灏忎粨浣嶆瘮渚?/ Minimum position ratio
      minPositionRatio: 0.1,

      // 鏈€澶т粨浣嶆瘮渚?/ Maximum position ratio
      maxPositionRatio: 1.5,

      // ============================================
      // 鏈€澶у洖鎾ゆ帶鍒跺弬鏁?/ Max Drawdown Control Parameters
      // ============================================

      // 鏈€澶у洖鎾ら槇鍊?/ Max drawdown threshold
      maxDrawdown: 0.15, // 15%

      // 棰勮鍥炴挙闃堝€?/ Warning drawdown threshold
      warningDrawdown: 0.10, // 10%

      // 涓ラ噸鍥炴挙闃堝€?/ Critical drawdown threshold
      criticalDrawdown: 0.20, // 20%

      // 绱ф€ュ洖鎾ら槇鍊?/ Emergency drawdown threshold
      emergencyDrawdown: 0.25, // 25%

      // 鍥炴挙鍑忎粨閫熷害 / Drawdown reduce speed
      drawdownReduceSpeed: 0.5,

      // ============================================
      // 娉㈠姩鐜囩獊鐮村弬鏁?/ Volatility Breakout Parameters
      // ============================================

      // 娉㈠姩鐜囩獊鐮撮槇鍊?(鍊嶆暟) / Volatility breakout threshold (multiplier)
      volatilityBreakoutThreshold: 2.0,

      // 娉㈠姩鐜囩獊鐮村洖鐪嬪懆鏈?/ Volatility breakout lookback period
      volatilityBreakoutLookback: 60,

      // 寮哄埗鍑忎粨姣斾緥 / Force reduce ratio
      forceReduceRatio: 0.5,

      // ============================================
      // 椋庨櫓骞充环鍙傛暟 / Risk Parity Parameters
      // ============================================

      // 椋庨櫓骞充环鍐嶅钩琛￠槇鍊?/ Risk parity rebalance threshold
      riskParityRebalanceThreshold: 0.1,

      // ============================================
      // 鐩稿叧鎬х洃鎺у弬鏁?/ Correlation Monitor Parameters
      // ============================================

      // 鐩稿叧鎬ц绠楀洖鐪嬪懆鏈?/ Correlation lookback period
      correlationLookback: 30,

      // 鐩稿叧鎬ч槇鍊?/ Correlation threshold
      correlationThreshold: 0.8,

      // 鐩稿叧鎬х獊澧炲€嶆暟 / Correlation spike multiplier
      correlationSpikeMultiplier: 1.5,

      // 鐩戞帶璧勪骇鍒楄〃 / Assets to monitor
      assets: ['BTC/USDT', 'ETH/USDT'],

      // ============================================
      // 浠撲綅鍙傛暟 / Position Parameters
      // ============================================

      // 浠撲綅鐧惧垎姣?/ Position percent
      positionPercent: 95,
    },

    // ============================================
    // 鑷€傚簲鍙傛暟绛栫暐榛樿鍙傛暟 / Adaptive Strategy Defaults
    // ============================================

    // 鑷€傚簲鍙傛暟绛栫暐榛樿鍙傛暟 / Adaptive strategy defaults
    adaptive: {
      // ============================================
      // 鑷€傚簲妯″紡閰嶇疆 / Adaptive Mode Configuration
      // ============================================

      // 鑷€傚簲妯″紡: full, sma_only, rsi_only, bb_only, custom
      adaptiveMode: 'full',

      // 鍚敤寮€鍏?/ Enable flags
      enableSMAAdaptive: true,       // 鍚敤 SMA 鍛ㄦ湡鑷€傚簲
      enableRSIAdaptive: true,       // 鍚敤 RSI 闃堝€艰嚜閫傚簲
      enableBBAdaptive: true,        // 鍚敤甯冩灄甯﹁嚜閫傚簲

      // ============================================
      // SMA 鑷€傚簲鍙傛暟 / SMA Adaptive Parameters
      // ============================================

      // 鍩哄噯鍛ㄦ湡 / Base periods
      smaBaseFast: 10,               // 蹇嚎鍩哄噯鍛ㄦ湡
      smaBaseSlow: 30,               // 鎱㈢嚎鍩哄噯鍛ㄦ湡

      // 娉㈠姩鐜囪皟鏁磋寖鍥?(0.5 = 鍙缉鐭?寤堕暱 50%) / Volatility adjustment range
      smaPeriodAdjustRange: 0.5,

      // 娉㈠姩鐜囬槇鍊?/ Volatility thresholds
      smaVolLowThreshold: 25,        // 浣庢尝鍔ㄧ櫨鍒嗕綅
      smaVolHighThreshold: 75,       // 楂樻尝鍔ㄧ櫨鍒嗕綅

      // ============================================
      // RSI 鑷€傚簲鍙傛暟 / RSI Adaptive Parameters
      // ============================================

      // RSI 鍛ㄦ湡 / RSI period
      rsiPeriod: 14,

      // 鍩哄噯闃堝€?/ Base thresholds
      rsiBaseOversold: 30,           // 鍩哄噯瓒呭崠闃堝€?
      rsiBaseOverbought: 70,         // 鍩哄噯瓒呬拱闃堝€?

      // 瓒嬪娍甯傞槇鍊?/ Trending market thresholds
      rsiTrendingOversold: 25,       // 瓒嬪娍甯傝秴鍗?
      rsiTrendingOverbought: 75,     // 瓒嬪娍甯傝秴涔?

      // 闇囪崱甯傞槇鍊?/ Ranging market thresholds
      rsiRangingOversold: 35,        // 闇囪崱甯傝秴鍗?
      rsiRangingOverbought: 65,      // 闇囪崱甯傝秴涔?

      // ============================================
      // 甯冩灄甯﹁嚜閫傚簲鍙傛暟 / Bollinger Bands Adaptive Parameters
      // ============================================

      // 甯冩灄甯﹀懆鏈?/ Bollinger period
      bbPeriod: 20,

      // 鏍囧噯宸皟鏁磋寖鍥?/ Std dev adjustment range
      bbBaseStdDev: 2.0,             // 鍩哄噯鏍囧噯宸?
      bbMinStdDev: 1.5,              // 浣庢尝鍔ㄦ椂鏍囧噯宸?
      bbMaxStdDev: 3.0,              // 楂樻尝鍔ㄦ椂鏍囧噯宸?

      // ATR 鍙傝€冨弬鏁?/ ATR reference parameters
      atrPeriod: 14,
      atrLookback: 100,

      // ============================================
      // 淇″彿铻嶅悎鍙傛暟 / Signal Fusion Parameters
      // ============================================

      // 淇″彿鏉冮噸 / Signal weights
      smaWeight: 0.4,                // SMA 淇″彿鏉冮噸
      rsiWeight: 0.3,                // RSI 淇″彿鏉冮噸
      bbWeight: 0.3,                 // 甯冩灄甯︿俊鍙锋潈閲?

      // 淇″彿纭闃堝€?/ Signal threshold
      signalThreshold: 0.5,

      // 瓒嬪娍杩囨护 / Trend filter
      useTrendFilter: true,
      trendMAPeriod: 50,

      // ============================================
      // 甯傚満鐘舵€佹娴嬪弬鏁?/ Market Regime Detection Parameters
      // ============================================

      adxPeriod: 14,                 // ADX 鍛ㄦ湡
      adxTrendThreshold: 25,         // ADX 瓒嬪娍闃堝€?
      extremeVolPercentile: 95,      // 鏋佺娉㈠姩鐜囩櫨鍒嗕綅

      // ============================================
      // 浠撲綅鍙傛暟 / Position Parameters
      // ============================================

      positionPercent: 95,           // 浠撲綅鐧惧垎姣?
    },
  },

  // ============================================
  // 椋庢帶閰嶇疆 / Risk Management Configuration
  // ============================================
  risk: {
    // 鍏ㄥ眬椋庢帶寮€鍏?/ Global risk management switch
    enabled: true,

    // 鏈€澶ф寔浠撴瘮渚?/ Maximum position ratio
    maxPositionRatio: 0.3,

    // 鍗曠瑪鏈€澶ч闄?/ Maximum risk per trade
    maxRiskPerTrade: 0.02,

    // 姣忔棩鏈€澶т簭鎹?(USDT) / Maximum daily loss (USDT)
    maxDailyLoss: 1000,

    // 鏈€澶у洖鎾ゆ瘮渚?/ Maximum drawdown ratio
    maxDrawdown: 0.2,

    // 鏈€澶ф寔浠撴暟閲?/ Maximum number of positions
    maxPositions: 5,

    // 鏈€澶ф潬鏉嗗€嶆暟 / Maximum leverage
    maxLeverage: 3,

    // 浠撲綅璁＄畻鏂规硶: 'fixed' | 'risk_based' | 'kelly' | 'atr_based'
    positionSizing: 'risk_based',

    // 姝㈡崯閰嶇疆 / Stop loss configuration
    stopLoss: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 榛樿姝㈡崯姣斾緥 / Default stop loss ratio
      defaultRatio: 0.02,

      // 鏄惁鍚敤杩借釜姝㈡崯 / Whether to enable trailing stop
      trailingStop: true,

      // 杩借釜姝㈡崯鍥炴挙姣斾緥 / Trailing stop drawdown ratio
      trailingRatio: 0.015,
    },

    // 姝㈢泩閰嶇疆 / Take profit configuration
    takeProfit: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 榛樿姝㈢泩姣斾緥 / Default take profit ratio
      defaultRatio: 0.04,

      // 鏄惁鍚敤鍒嗘壒姝㈢泩 / Whether to enable partial take profit
      partialTakeProfit: false,

      // 鍒嗘壒姝㈢泩姣斾緥 / Partial take profit ratios
      partialRatios: [0.5, 0.3, 0.2],
    },

    // 榛戝悕鍗曚氦鏄撳 / Blacklisted symbols
    blacklist: [],

    // 鐧藉悕鍗曚氦鏄撳 (绌鸿〃绀哄叏閮ㄥ厑璁? / Whitelisted symbols (empty means all allowed)
    whitelist: [],
  },

  // ============================================
  // 璁㈠崟鎵ц閰嶇疆 / Order Execution Configuration
  // ============================================
  executor: {
    // 鏈€澶ч噸璇曟鏁?/ Maximum retry attempts
    maxRetries: 3,

    // 閲嶈瘯寤惰繜 (姣) / Retry delay (ms)
    retryDelay: 1000,

    // 鏈€澶ф粦鐐?(鐧惧垎姣? / Maximum slippage (%)
    maxSlippage: 0.5,

    // 璁㈠崟瓒呮椂 (姣) / Order timeout (ms)
    orderTimeout: 30000,

    // 鏄惁鍚敤 TWAP / Whether to enable TWAP
    enableTWAP: true,

    // TWAP 閰嶇疆 / TWAP configuration
    twap: {
      // 鎷嗗垎闃堝€?(USDT) / Split threshold (USDT)
      splitThreshold: 10000,

      // 鎷嗗垎浠芥暟 / Number of splits
      splitCount: 5,

      // 鎷嗗垎闂撮殧 (姣) / Split interval (ms)
      splitInterval: 2000,
    },

    // 骞跺彂璁㈠崟鏁伴噺 / Concurrent order count
    concurrency: 3,

    // ============================================
    // 鎵ц Alpha 閰嶇疆 / Execution Alpha Configuration
    // ============================================
    executionAlpha: {
      // 鏄惁鍚敤鎵ц Alpha / Whether to enable Execution Alpha
      enabled: true,

      // 璁㈠崟澶у皬鍒嗙被闃堝€硷紙鐩稿浜庢棩鍧囬噺锛? Order size classification thresholds
      sizeClassThresholds: {
        tiny: 0.001,      // 0.1% 鏃ュ潎閲?/ 0.1% of daily volume
        small: 0.005,     // 0.5% 鏃ュ潎閲?/ 0.5% of daily volume
        medium: 0.02,     // 2% 鏃ュ潎閲?/ 2% of daily volume
        large: 0.05,      // 5% 鏃ュ潎閲?/ 5% of daily volume
      },

      // 绛栫暐閫夋嫨鏉冮噸 / Strategy selection weights
      strategyWeights: {
        liquidity: 0.3,      // 娴佸姩鎬ф潈閲?/ Liquidity weight
        slippageRisk: 0.3,   // 婊戠偣椋庨櫓鏉冮噸 / Slippage risk weight
        urgency: 0.2,        // 绱ф€ユ€ф潈閲?/ Urgency weight
        orderSize: 0.2,      // 璁㈠崟澶у皬鏉冮噸 / Order size weight
      },

      // 鑷姩绛栫暐闃堝€?/ Auto strategy thresholds
      autoStrategyThresholds: {
        minSizeForAlgo: 0.01,     // 1% 鏃ュ潎閲忎娇鐢?TWAP/VWAP / 1% for TWAP/VWAP
        minSizeForIceberg: 0.02,  // 2% 鏃ュ潎閲忎娇鐢ㄥ啺灞卞崟 / 2% for iceberg
      },

      // 榛樿 TWAP 鎵ц鏃堕暱锛堟绉掞級/ Default TWAP duration (ms)
      defaultTWAPDuration: 30 * 60 * 1000,  // 30 鍒嗛挓 / 30 minutes

      // 榛樿鍒囩墖鏁?/ Default slice count
      defaultSliceCount: 20,

      // 鏄惁鍚敤鑷姩寤惰繜锛堥珮婊戠偣鏃舵锛? Enable auto delay (high slippage periods)
      enableAutoDelay: true,

      // 鏄惁鍚敤婊戠偣璁板綍 / Enable slippage recording
      enableSlippageRecording: true,

      // 鏄惁鍚敤璇︾粏鏃ュ織 / Enable verbose logging
      verbose: false,

      // 鐩樺彛鍒嗘瀽閰嶇疆 / Order book analyzer configuration
      orderBookAnalyzer: {
        // 娣卞害鍒嗘瀽灞傛暟 / Depth analysis levels
        depthLevels: 20,
        // 娴佸姩鎬ц瘎浼伴槇鍊?/ Liquidity assessment thresholds
        liquidityThresholds: {
          veryLow: 0.1,   // 10% 鍙墽琛?
          low: 0.3,       // 30%
          medium: 0.6,    // 60%
          high: 0.9,      // 90%
        },
      },

      // 婊戠偣鍒嗘瀽閰嶇疆 / Slippage analyzer configuration
      slippageAnalyzer: {
        // 鍘嗗彶鏁版嵁鍥炵湅鍛ㄦ湡 / Historical lookback period
        lookbackPeriod: 100,
        // 楂橀闄╂椂娈碉紙UTC 灏忔椂锛? High risk periods (UTC hours)
        highRiskHours: [0, 8, 16],  // 鏁寸偣缁撶畻鏃舵
        // 棰勮婊戠偣闃堝€?/ Warning slippage threshold
        warningThreshold: 0.005,  // 0.5%
        // 涓ラ噸婊戠偣闃堝€?/ Critical slippage threshold
        criticalThreshold: 0.01,  // 1%
      },

      // 鍐板北鍗曢厤缃?/ Iceberg order configuration
      iceberg: {
        // 榛樿鎷嗗垎绛栫暐: random, linear, adaptive
        defaultSplitStrategy: 'adaptive',
        // 榛樿鏄剧ず妯″紡: fixed, random, dynamic
        defaultDisplayMode: 'dynamic',
        // 鏈€灏忔媶鍒嗕唤鏁?/ Minimum split count
        minSplitCount: 5,
        // 鏈€澶ф媶鍒嗕唤鏁?/ Maximum split count
        maxSplitCount: 50,
        // 闅忔満鍖栬寖鍥?/ Randomization range
        randomizationRange: 0.2,  // 卤20%
      },

      // TWAP/VWAP 閰嶇疆 / TWAP/VWAP configuration
      twapVwap: {
        // 榛樿绠楁硶: twap, vwap, adaptive
        defaultAlgo: 'adaptive',
        // 鏈€灏忓垏鐗囬棿闅旓紙姣锛? Minimum slice interval (ms)
        minSliceInterval: 5000,   // 5 绉?
        // 鏈€澶у垏鐗囬棿闅旓紙姣锛? Maximum slice interval (ms)
        maxSliceInterval: 300000, // 5 鍒嗛挓
        // 鏄惁浣跨敤甯傚満鏉′欢璋冩暣 / Use market condition adjustment
        useMarketConditionAdjust: true,
        // 鎴愪氦閲忔洸绾跨被鍨? uniform, u_shaped, front_loaded, back_loaded
        defaultVolumeCurve: 'u_shaped',
      },
    },
  },

  // ============================================
  // 鍥炴祴閰嶇疆 / Backtest Configuration
  // ============================================
  backtest: {
    // 鍒濆璧勯噾 (USDT) / Initial capital (USDT)
    initialCapital: 10000,

    // 鎵嬬画璐圭巼 / Commission rate
    commission: 0.001,

    // 婊戠偣妯℃嫙 / Slippage simulation
    slippage: 0.0005,

    // 鏁版嵁鐩綍 / Data directory
    dataDir: 'data/historical',

    // 缁撴灉杈撳嚭鐩綍 / Results output directory
    outputDir: 'data/backtest_results',
  },

  // ============================================
  // 鐩戞帶閰嶇疆 / Monitoring Configuration
  // ============================================
  monitor: {
    // 鎸囨爣鏀堕泦闂撮殧 (姣) / Metrics collection interval (ms)
    collectInterval: 10000,

    // 鍋ュ悍妫€鏌ラ棿闅?(姣) / Health check interval (ms)
    healthCheckInterval: 30000,

    // 鍐呭瓨璀﹀憡闃堝€?(MB) / Memory warning threshold (MB)
    memoryWarningThreshold: 512,

    // CPU 璀﹀憡闃堝€?(%) / CPU warning threshold (%)
    cpuWarningThreshold: 80,

    // Prometheus 閰嶇疆 / Prometheus configuration
    prometheus: {
      // 鏄惁鍚敤 / Whether enabled
      enabled: true,

      // 绔彛 / Port
      port: 9090,
    },
  },

  // ============================================
  // 鍛婅閰嶇疆 / Alert Configuration
  // ============================================
  alert: {
    // 鍛婅鍐峰嵈鏃堕棿 (姣) / Alert cooldown (ms)
    cooldown: 60000,

    // 閭欢鍛婅 / Email alerts
    email: {
      enabled: false,
      // 鍏朵粬閰嶇疆浠庣幆澧冨彉閲忚鍙?/ Other config from env
    },

    // Telegram 鍛婅 / Telegram alerts
    telegram: {
      enabled: false,
      // 鍏朵粬閰嶇疆浠庣幆澧冨彉閲忚鍙?/ Other config from env
    },

    // 閽夐拤鍛婅 / DingTalk alerts
    dingtalk: {
      enabled: false,
      // 鍏朵粬閰嶇疆浠庣幆澧冨彉閲忚鍙?/ Other config from env
    },

    // Webhook 鍛婅 / Webhook alerts
    webhook: {
      enabled: false,
      // 鍏朵粬閰嶇疆浠庣幆澧冨彉閲忚鍙?/ Other config from env
    },
  },

  // ============================================
  // 鏃ュ織閰嶇疆 / Logging Configuration
  // ============================================
  logging: {
    // 鏃ュ織绾у埆: 'error' | 'warn' | 'info' | 'debug'
    level: 'info',

    // 鏃ュ織鐩綍 / Log directory
    dir: 'logs',

    // 鏄惁杈撳嚭鍒版帶鍒跺彴 / Whether to output to console
    console: true,

    // 鏄惁杈撳嚭鍒版枃浠?/ Whether to output to file
    file: true,

    // 鍗曚釜鏃ュ織鏂囦欢鏈€澶уぇ灏?(瀛楄妭) / Max size per log file (bytes)
    maxSize: 10 * 1024 * 1024,  // 10MB

    // 淇濈暀鏃ュ織鏂囦欢鏁伴噺 / Number of log files to keep
    maxFiles: 5,
  },

  // ============================================
  // Storage Configuration (Redis only)
  // ============================================
  database: {
    // Redis configuration
    redis: {
      enabled: false,
      // Other config from env
    },
  },

  // ============================================
  // 鏈嶅姟绔彛閰嶇疆 / Service Port Configuration
  // ============================================
  server: {
    // HTTP API 绔彛 / HTTP API port
    httpPort: 3000,

    // WebSocket 绔彛 / WebSocket port
    wsPort: 3001,

    // 浠〃鐩樼鍙?/ Dashboard port
    dashboardPort: 8080,
  },
};

