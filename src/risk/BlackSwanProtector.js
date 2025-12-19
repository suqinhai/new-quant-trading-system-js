/**
 * 黑天鹅事件保护器
 * Black Swan Event Protector
 *
 * 功能 / Features:
 * 1. 极端行情检测 / Extreme market condition detection
 * 2. 价格闪崩监控 / Flash crash monitoring
 * 3. 波动率突变检测 / Volatility spike detection
 * 4. 自动熔断机制 / Automatic circuit breaker
 * 5. 紧急平仓执行 / Emergency position closing
 * 6. 市场恢复检测 / Market recovery detection
 */

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 熔断级别
 * Circuit breaker level
 */
const CIRCUIT_BREAKER_LEVEL = {
  NORMAL: 'normal',           // 正常 / Normal
  LEVEL_1: 'level_1',         // 一级警告 / Level 1 warning
  LEVEL_2: 'level_2',         // 二级警告 / Level 2 warning
  LEVEL_3: 'level_3',         // 三级熔断 / Level 3 circuit break
  EMERGENCY: 'emergency',     // 紧急状态 / Emergency state
};

/**
 * 黑天鹅事件类型
 * Black swan event types
 */
const BLACK_SWAN_TYPE = {
  FLASH_CRASH: 'flash_crash',           // 闪崩 / Flash crash
  FLASH_RALLY: 'flash_rally',           // 暴涨 / Flash rally
  VOLATILITY_SPIKE: 'volatility_spike', // 波动率飙升 / Volatility spike
  LIQUIDITY_CRISIS: 'liquidity_crisis', // 流动性危机 / Liquidity crisis
  SPREAD_BLOWOUT: 'spread_blowout',     // 点差扩大 / Spread blowout
  EXCHANGE_ANOMALY: 'exchange_anomaly', // 交易所异常 / Exchange anomaly
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 价格变动阈值 / Price Change Thresholds
  // ============================================

  // 1分钟内价格变动警告阈值 / 1-minute price change warning threshold
  priceChange1mWarning: 0.03,    // 3%

  // 1分钟内价格变动熔断阈值 / 1-minute price change circuit breaker threshold
  priceChange1mCircuitBreaker: 0.05, // 5%

  // 5分钟内价格变动警告阈值 / 5-minute price change warning threshold
  priceChange5mWarning: 0.05,    // 5%

  // 5分钟内价格变动熔断阈值 / 5-minute price change circuit breaker threshold
  priceChange5mCircuitBreaker: 0.08, // 8%

  // 15分钟内价格变动紧急阈值 / 15-minute price change emergency threshold
  priceChange15mEmergency: 0.15, // 15%

  // ============================================
  // 波动率阈值 / Volatility Thresholds
  // ============================================

  // 波动率突变倍数 (相对于历史波动率) / Volatility spike multiplier (relative to historical)
  volatilitySpikeMultiplier: 3.0,

  // 历史波动率计算窗口 (小时) / Historical volatility calculation window (hours)
  volatilityWindow: 24,

  // 超高波动率阈值 (年化) / Ultra high volatility threshold (annualized)
  ultraHighVolatility: 2.0, // 200%

  // ============================================
  // 点差阈值 / Spread Thresholds
  // ============================================

  // 点差扩大警告倍数 / Spread widening warning multiplier
  spreadWarningMultiplier: 3.0,

  // 点差扩大熔断倍数 / Spread widening circuit breaker multiplier
  spreadCircuitBreakerMultiplier: 5.0,

  // 最大可接受点差 (百分比) / Maximum acceptable spread (percentage)
  maxSpreadPercent: 0.02, // 2%

  // ============================================
  // 深度阈值 / Depth Thresholds
  // ============================================

  // 订单簿深度消失警告阈值 / Order book depth disappearance warning threshold
  depthDisappearanceWarning: 0.5, // 深度减少50% / 50% depth reduction

  // 订单簿深度消失熔断阈值 / Order book depth disappearance circuit breaker threshold
  depthDisappearanceCircuitBreaker: 0.8, // 深度减少80% / 80% depth reduction

  // ============================================
  // 熔断配置 / Circuit Breaker Configuration
  // ============================================

  // 一级熔断冷却时间 (毫秒) / Level 1 circuit breaker cooldown (ms)
  level1Cooldown: 5 * 60 * 1000, // 5分钟 / 5 minutes

  // 二级熔断冷却时间 (毫秒) / Level 2 circuit breaker cooldown (ms)
  level2Cooldown: 15 * 60 * 1000, // 15分钟 / 15 minutes

  // 三级熔断冷却时间 (毫秒) / Level 3 circuit breaker cooldown (ms)
  level3Cooldown: 60 * 60 * 1000, // 1小时 / 1 hour

  // 紧急状态冷却时间 (毫秒) / Emergency state cooldown (ms)
  emergencyCooldown: 4 * 60 * 60 * 1000, // 4小时 / 4 hours

  // 自动恢复启用 / Enable auto recovery
  enableAutoRecovery: true,

  // 恢复检测间隔 (毫秒) / Recovery detection interval (ms)
  recoveryCheckInterval: 60 * 1000, // 1分钟 / 1 minute

  // 市场稳定判定时间 (毫秒) / Market stability confirmation time (ms)
  stabilityConfirmationTime: 10 * 60 * 1000, // 10分钟 / 10 minutes

  // ============================================
  // 紧急平仓配置 / Emergency Close Configuration
  // ============================================

  // 启用自动紧急平仓 / Enable auto emergency close
  enableAutoEmergencyClose: true,

  // 紧急平仓在熔断级别 / Emergency close at circuit breaker level
  emergencyCloseLevel: CIRCUIT_BREAKER_LEVEL.LEVEL_3,

  // 部分平仓比例 (一级/二级熔断) / Partial close ratio (level 1/2 circuit breaker)
  partialCloseRatioLevel1: 0.25, // 25%
  partialCloseRatioLevel2: 0.50, // 50%

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 价格更新超时 (毫秒) / Price update timeout (ms)
  priceUpdateTimeout: 10 * 1000, // 10秒 / 10 seconds

  // 检查间隔 (毫秒) / Check interval (ms)
  checkInterval: 1000, // 1秒 / 1 second

  // 价格历史保留数量 / Price history retention count
  priceHistoryLength: 1000,

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[BlackSwanProtector]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 黑天鹅事件保护器
 * Black Swan Event Protector
 */
export class BlackSwanProtector extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    super();

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 当前熔断状态 / Current circuit breaker state
    this.circuitBreakerState = {
      level: CIRCUIT_BREAKER_LEVEL.NORMAL,
      triggeredAt: null,
      reason: null,
      eventType: null,
      affectedSymbols: [],
      cooldownUntil: null,
    };

    // 价格历史 / Price history
    // 格式: { symbol: [{ price, timestamp, volume }, ...] }
    this.priceHistory = new Map();

    // 基准价格 (用于计算变动) / Baseline prices (for calculating changes)
    // 格式: { symbol: { price1m, price5m, price15m, timestamp } }
    this.baselinePrices = new Map();

    // 历史波动率 / Historical volatility
    // 格式: { symbol: { volatility, updatedAt } }
    this.historicalVolatility = new Map();

    // 基准点差 / Baseline spreads
    // 格式: { symbol: { spread, updatedAt } }
    this.baselineSpreads = new Map();

    // 基准深度 / Baseline depth
    // 格式: { symbol: { bidDepth, askDepth, updatedAt } }
    this.baselineDepths = new Map();

    // 事件历史 / Event history
    this.eventHistory = [];

    // 执行器引用 / Executor reference
    this.executor = null;

    // 组合风控引用 / Portfolio risk manager reference
    this.portfolioRiskManager = null;

    // 定时器 / Timers
    this.checkTimer = null;
    this.recoveryTimer = null;

    // 运行状态 / Running state
    this.running = false;

    // 最后价格更新时间 / Last price update time
    this.lastPriceUpdate = new Map();

    // 市场稳定开始时间 / Market stability start time
    this.stabilityStartTime = null;
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化
   * Initialize
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) {
    const { executor, portfolioRiskManager } = options;

    this.executor = executor;
    this.portfolioRiskManager = portfolioRiskManager;

    this.log('黑天鹅保护器初始化完成 / Black swan protector initialized', 'info');
  }

  /**
   * 启动
   * Start
   */
  start() {
    if (this.running) return;

    this.running = true;

    // 启动定时检查 / Start periodic check
    this.checkTimer = setInterval(
      () => this._performCheck(),
      this.config.checkInterval
    );

    // 启动恢复检测 / Start recovery detection
    if (this.config.enableAutoRecovery) {
      this.recoveryTimer = setInterval(
        () => this._checkRecovery(),
        this.config.recoveryCheckInterval
      );
    }

    this.log('黑天鹅保护器已启动 / Black swan protector started', 'info');
    this.emit('started');
  }

  /**
   * 停止
   * Stop
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }

    this.log('黑天鹅保护器已停止 / Black swan protector stopped', 'info');
    this.emit('stopped');
  }

  // ============================================
  // 数据更新 / Data Updates
  // ============================================

  /**
   * 更新价格
   * Update price
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} price - 价格 / Price
   * @param {number} volume - 成交量 / Volume
   * @param {Object} orderBook - 订单簿 / Order book
   */
  updatePrice(symbol, price, volume = 0, orderBook = null) {
    const now = Date.now();

    // 更新价格历史 / Update price history
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol);
    history.push({ price, timestamp: now, volume });

    // 限制历史长度 / Limit history length
    if (history.length > this.config.priceHistoryLength) {
      history.shift();
    }

    // 更新最后价格时间 / Update last price time
    this.lastPriceUpdate.set(symbol, now);

    // 更新基准价格 / Update baseline prices
    this._updateBaselinePrices(symbol, price, now);

    // 如果有订单簿数据，更新点差和深度 / If order book data available, update spread and depth
    if (orderBook) {
      this._updateSpreadAndDepth(symbol, orderBook);
    }

    // 检测异常 / Detect anomalies
    this._detectAnomalies(symbol, price, orderBook);
  }

  /**
   * 更新基准价格
   * Update baseline prices
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} price - 价格 / Price
   * @param {number} now - 当前时间 / Current time
   * @private
   */
  _updateBaselinePrices(symbol, price, now) {
    if (!this.baselinePrices.has(symbol)) {
      this.baselinePrices.set(symbol, {
        price1m: price,
        price5m: price,
        price15m: price,
        timestamp1m: now,
        timestamp5m: now,
        timestamp15m: now,
      });
      return;
    }

    const baseline = this.baselinePrices.get(symbol);

    // 更新1分钟基准 / Update 1-minute baseline
    if (now - baseline.timestamp1m >= 60 * 1000) {
      baseline.price1m = price;
      baseline.timestamp1m = now;
    }

    // 更新5分钟基准 / Update 5-minute baseline
    if (now - baseline.timestamp5m >= 5 * 60 * 1000) {
      baseline.price5m = price;
      baseline.timestamp5m = now;
    }

    // 更新15分钟基准 / Update 15-minute baseline
    if (now - baseline.timestamp15m >= 15 * 60 * 1000) {
      baseline.price15m = price;
      baseline.timestamp15m = now;
    }
  }

  /**
   * 更新点差和深度
   * Update spread and depth
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} orderBook - 订单簿 / Order book
   * @private
   */
  _updateSpreadAndDepth(symbol, orderBook) {
    const { bids, asks } = orderBook;

    if (!bids || !asks || bids.length === 0 || asks.length === 0) {
      return;
    }

    const bestBid = bids[0][0];
    const bestAsk = asks[0][0];
    const spread = (bestAsk - bestBid) / bestBid;

    // 计算深度 / Calculate depth
    const bidDepth = bids.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0);
    const askDepth = asks.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0);

    const now = Date.now();

    // 初始化或更新基准 / Initialize or update baseline
    if (!this.baselineSpreads.has(symbol)) {
      this.baselineSpreads.set(symbol, { spread, updatedAt: now });
      this.baselineDepths.set(symbol, { bidDepth, askDepth, updatedAt: now });
    } else {
      // 使用指数移动平均更新基准 / Update baseline using EMA
      const existingSpread = this.baselineSpreads.get(symbol);
      const alpha = 0.1;
      existingSpread.spread = alpha * spread + (1 - alpha) * existingSpread.spread;

      const existingDepth = this.baselineDepths.get(symbol);
      existingDepth.bidDepth = alpha * bidDepth + (1 - alpha) * existingDepth.bidDepth;
      existingDepth.askDepth = alpha * askDepth + (1 - alpha) * existingDepth.askDepth;
    }
  }

  // ============================================
  // 异常检测 / Anomaly Detection
  // ============================================

  /**
   * 检测异常
   * Detect anomalies
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} currentPrice - 当前价格 / Current price
   * @param {Object} orderBook - 订单簿 / Order book
   * @private
   */
  _detectAnomalies(symbol, currentPrice, orderBook) {
    // 如果已在紧急状态且未过冷却期，跳过检测 / Skip if in emergency and not past cooldown
    if (this.circuitBreakerState.cooldownUntil &&
        Date.now() < this.circuitBreakerState.cooldownUntil) {
      return;
    }

    const anomalies = [];

    // 1. 检测价格闪崩/暴涨 / Detect flash crash/rally
    const priceAnomaly = this._detectPriceAnomaly(symbol, currentPrice);
    if (priceAnomaly) {
      anomalies.push(priceAnomaly);
    }

    // 2. 检测波动率突变 / Detect volatility spike
    const volatilityAnomaly = this._detectVolatilitySpike(symbol);
    if (volatilityAnomaly) {
      anomalies.push(volatilityAnomaly);
    }

    // 3. 检测点差异常 / Detect spread anomaly
    if (orderBook) {
      const spreadAnomaly = this._detectSpreadAnomaly(symbol, orderBook);
      if (spreadAnomaly) {
        anomalies.push(spreadAnomaly);
      }

      // 4. 检测深度消失 / Detect depth disappearance
      const depthAnomaly = this._detectDepthAnomaly(symbol, orderBook);
      if (depthAnomaly) {
        anomalies.push(depthAnomaly);
      }
    }

    // 处理检测到的异常 / Process detected anomalies
    if (anomalies.length > 0) {
      this._processAnomalies(symbol, anomalies);
    }
  }

  /**
   * 检测价格异常
   * Detect price anomaly
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} currentPrice - 当前价格 / Current price
   * @returns {Object|null} 异常信息 / Anomaly info
   * @private
   */
  _detectPriceAnomaly(symbol, currentPrice) {
    const baseline = this.baselinePrices.get(symbol);
    if (!baseline) return null;

    // 计算各时间窗口的价格变动 / Calculate price changes for each time window
    const change1m = (currentPrice - baseline.price1m) / baseline.price1m;
    const change5m = (currentPrice - baseline.price5m) / baseline.price5m;
    const change15m = (currentPrice - baseline.price15m) / baseline.price15m;

    const absChange1m = Math.abs(change1m);
    const absChange5m = Math.abs(change5m);
    const absChange15m = Math.abs(change15m);

    // 确定事件类型 / Determine event type
    const isFlashCrash = change1m < 0 || change5m < 0;
    const eventType = isFlashCrash ? BLACK_SWAN_TYPE.FLASH_CRASH : BLACK_SWAN_TYPE.FLASH_RALLY;

    // 检查各级别阈值 / Check thresholds for each level
    if (absChange15m >= this.config.priceChange15mEmergency) {
      return {
        type: eventType,
        level: CIRCUIT_BREAKER_LEVEL.EMERGENCY,
        message: `15分钟内价格变动 ${(change15m * 100).toFixed(2)}% 触发紧急状态`,
        details: { change1m, change5m, change15m, currentPrice, baseline },
      };
    }

    if (absChange5m >= this.config.priceChange5mCircuitBreaker) {
      return {
        type: eventType,
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_3,
        message: `5分钟内价格变动 ${(change5m * 100).toFixed(2)}% 触发三级熔断`,
        details: { change1m, change5m, change15m, currentPrice, baseline },
      };
    }

    if (absChange5m >= this.config.priceChange5mWarning) {
      return {
        type: eventType,
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2,
        message: `5分钟内价格变动 ${(change5m * 100).toFixed(2)}% 触发二级警告`,
        details: { change1m, change5m, change15m, currentPrice, baseline },
      };
    }

    if (absChange1m >= this.config.priceChange1mCircuitBreaker) {
      return {
        type: eventType,
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2,
        message: `1分钟内价格变动 ${(change1m * 100).toFixed(2)}% 触发二级警告`,
        details: { change1m, change5m, change15m, currentPrice, baseline },
      };
    }

    if (absChange1m >= this.config.priceChange1mWarning) {
      return {
        type: eventType,
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
        message: `1分钟内价格变动 ${(change1m * 100).toFixed(2)}% 触发一级警告`,
        details: { change1m, change5m, change15m, currentPrice, baseline },
      };
    }

    return null;
  }

  /**
   * 检测波动率突变
   * Detect volatility spike
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object|null} 异常信息 / Anomaly info
   * @private
   */
  _detectVolatilitySpike(symbol) {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length < 60) return null; // 需要至少60个数据点

    // 计算最近1小时的波动率 / Calculate volatility for last hour
    const recentPrices = history.slice(-60).map((h) => h.price);
    const recentVolatility = this._calculateVolatility(recentPrices);

    // 获取历史波动率 / Get historical volatility
    let historicalVol = this.historicalVolatility.get(symbol);

    if (!historicalVol) {
      // 初始化历史波动率 / Initialize historical volatility
      historicalVol = { volatility: recentVolatility, updatedAt: Date.now() };
      this.historicalVolatility.set(symbol, historicalVol);
      return null;
    }

    // 检查波动率是否突变 / Check if volatility spiked
    const spikeRatio = recentVolatility / historicalVol.volatility;

    if (spikeRatio >= this.config.volatilitySpikeMultiplier) {
      // 年化波动率 / Annualized volatility
      const annualizedVol = recentVolatility * Math.sqrt(365 * 24);

      let level = CIRCUIT_BREAKER_LEVEL.LEVEL_1;
      if (annualizedVol >= this.config.ultraHighVolatility) {
        level = CIRCUIT_BREAKER_LEVEL.LEVEL_3;
      } else if (spikeRatio >= this.config.volatilitySpikeMultiplier * 2) {
        level = CIRCUIT_BREAKER_LEVEL.LEVEL_2;
      }

      return {
        type: BLACK_SWAN_TYPE.VOLATILITY_SPIKE,
        level,
        message: `波动率突变: ${spikeRatio.toFixed(1)}倍 (年化 ${(annualizedVol * 100).toFixed(0)}%)`,
        details: {
          recentVolatility,
          historicalVolatility: historicalVol.volatility,
          spikeRatio,
          annualizedVol,
        },
      };
    }

    // 更新历史波动率 (EMA) / Update historical volatility (EMA)
    const alpha = 0.05;
    historicalVol.volatility = alpha * recentVolatility + (1 - alpha) * historicalVol.volatility;
    historicalVol.updatedAt = Date.now();

    return null;
  }

  /**
   * 计算波动率
   * Calculate volatility
   *
   * @param {Array} prices - 价格数组 / Price array
   * @returns {number} 波动率 / Volatility
   * @private
   */
  _calculateVolatility(prices) {
    if (prices.length < 2) return 0;

    // 计算收益率 / Calculate returns
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    // 计算标准差 / Calculate standard deviation
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }

  /**
   * 检测点差异常
   * Detect spread anomaly
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} orderBook - 订单簿 / Order book
   * @returns {Object|null} 异常信息 / Anomaly info
   * @private
   */
  _detectSpreadAnomaly(symbol, orderBook) {
    const { bids, asks } = orderBook;

    if (!bids || !asks || bids.length === 0 || asks.length === 0) {
      return null;
    }

    const bestBid = bids[0][0];
    const bestAsk = asks[0][0];
    const currentSpread = (bestAsk - bestBid) / bestBid;

    // 检查绝对点差 / Check absolute spread
    if (currentSpread >= this.config.maxSpreadPercent) {
      return {
        type: BLACK_SWAN_TYPE.SPREAD_BLOWOUT,
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2,
        message: `点差过大: ${(currentSpread * 100).toFixed(3)}% >= ${(this.config.maxSpreadPercent * 100).toFixed(2)}%`,
        details: { currentSpread, bestBid, bestAsk },
      };
    }

    // 检查相对点差变化 / Check relative spread change
    const baselineSpread = this.baselineSpreads.get(symbol);
    if (baselineSpread) {
      const spreadRatio = currentSpread / baselineSpread.spread;

      if (spreadRatio >= this.config.spreadCircuitBreakerMultiplier) {
        return {
          type: BLACK_SWAN_TYPE.SPREAD_BLOWOUT,
          level: CIRCUIT_BREAKER_LEVEL.LEVEL_3,
          message: `点差扩大 ${spreadRatio.toFixed(1)}倍 触发熔断`,
          details: {
            currentSpread,
            baselineSpread: baselineSpread.spread,
            spreadRatio,
          },
        };
      }

      if (spreadRatio >= this.config.spreadWarningMultiplier) {
        return {
          type: BLACK_SWAN_TYPE.SPREAD_BLOWOUT,
          level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
          message: `点差扩大 ${spreadRatio.toFixed(1)}倍 警告`,
          details: {
            currentSpread,
            baselineSpread: baselineSpread.spread,
            spreadRatio,
          },
        };
      }
    }

    return null;
  }

  /**
   * 检测深度消失
   * Detect depth disappearance
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} orderBook - 订单簿 / Order book
   * @returns {Object|null} 异常信息 / Anomaly info
   * @private
   */
  _detectDepthAnomaly(symbol, orderBook) {
    const { bids, asks } = orderBook;

    if (!bids || !asks) return null;

    const bidDepth = bids.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0);
    const askDepth = asks.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0);

    const baselineDepth = this.baselineDepths.get(symbol);
    if (!baselineDepth) return null;

    const bidReduction = 1 - (bidDepth / baselineDepth.bidDepth);
    const askReduction = 1 - (askDepth / baselineDepth.askDepth);
    const maxReduction = Math.max(bidReduction, askReduction);

    if (maxReduction >= this.config.depthDisappearanceCircuitBreaker) {
      return {
        type: BLACK_SWAN_TYPE.LIQUIDITY_CRISIS,
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_3,
        message: `流动性危机: 深度减少 ${(maxReduction * 100).toFixed(1)}%`,
        details: {
          bidDepth,
          askDepth,
          baselineBidDepth: baselineDepth.bidDepth,
          baselineAskDepth: baselineDepth.askDepth,
          bidReduction,
          askReduction,
        },
      };
    }

    if (maxReduction >= this.config.depthDisappearanceWarning) {
      return {
        type: BLACK_SWAN_TYPE.LIQUIDITY_CRISIS,
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
        message: `流动性警告: 深度减少 ${(maxReduction * 100).toFixed(1)}%`,
        details: {
          bidDepth,
          askDepth,
          baselineBidDepth: baselineDepth.bidDepth,
          baselineAskDepth: baselineDepth.askDepth,
          bidReduction,
          askReduction,
        },
      };
    }

    return null;
  }

  // ============================================
  // 异常处理 / Anomaly Processing
  // ============================================

  /**
   * 处理检测到的异常
   * Process detected anomalies
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} anomalies - 异常列表 / Anomaly list
   * @private
   */
  _processAnomalies(symbol, anomalies) {
    // 找出最严重的异常 / Find most severe anomaly
    const levelPriority = {
      [CIRCUIT_BREAKER_LEVEL.NORMAL]: 0,
      [CIRCUIT_BREAKER_LEVEL.LEVEL_1]: 1,
      [CIRCUIT_BREAKER_LEVEL.LEVEL_2]: 2,
      [CIRCUIT_BREAKER_LEVEL.LEVEL_3]: 3,
      [CIRCUIT_BREAKER_LEVEL.EMERGENCY]: 4,
    };

    const mostSevere = anomalies.reduce((a, b) =>
      (levelPriority[a.level] || 0) > (levelPriority[b.level] || 0) ? a : b
    );

    // 如果新异常比当前状态更严重，更新状态 / Update state if new anomaly is more severe
    if (levelPriority[mostSevere.level] > levelPriority[this.circuitBreakerState.level]) {
      this._triggerCircuitBreaker(symbol, mostSevere);
    }

    // 记录事件 / Record event
    this._recordEvent(symbol, mostSevere);
  }

  /**
   * 触发熔断
   * Trigger circuit breaker
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} anomaly - 异常信息 / Anomaly info
   * @private
   */
  async _triggerCircuitBreaker(symbol, anomaly) {
    const now = Date.now();

    // 计算冷却时间 / Calculate cooldown time
    let cooldown;
    switch (anomaly.level) {
      case CIRCUIT_BREAKER_LEVEL.EMERGENCY:
        cooldown = this.config.emergencyCooldown;
        break;
      case CIRCUIT_BREAKER_LEVEL.LEVEL_3:
        cooldown = this.config.level3Cooldown;
        break;
      case CIRCUIT_BREAKER_LEVEL.LEVEL_2:
        cooldown = this.config.level2Cooldown;
        break;
      case CIRCUIT_BREAKER_LEVEL.LEVEL_1:
        cooldown = this.config.level1Cooldown;
        break;
      default:
        cooldown = 0;
    }

    // 更新熔断状态 / Update circuit breaker state
    const previousLevel = this.circuitBreakerState.level;
    this.circuitBreakerState = {
      level: anomaly.level,
      triggeredAt: now,
      reason: anomaly.message,
      eventType: anomaly.type,
      affectedSymbols: [symbol],
      cooldownUntil: now + cooldown,
      details: anomaly.details,
    };

    // 重置市场稳定计时 / Reset market stability timer
    this.stabilityStartTime = null;

    this.log(`🚨 熔断触发: ${anomaly.level} - ${anomaly.message}`, 'error');

    // 发出事件 / Emit event
    this.emit('circuitBreakerTriggered', {
      previousLevel,
      currentLevel: anomaly.level,
      symbol,
      anomaly,
      timestamp: now,
    });

    // 通知组合风控管理器 / Notify portfolio risk manager
    if (this.portfolioRiskManager) {
      this.portfolioRiskManager.emit('blackSwanEvent', {
        level: anomaly.level,
        type: anomaly.type,
        symbol,
        message: anomaly.message,
      });
    }

    // 执行熔断动作 / Execute circuit breaker actions
    await this._executeCircuitBreakerActions(anomaly);
  }

  /**
   * 执行熔断动作
   * Execute circuit breaker actions
   *
   * @param {Object} anomaly - 异常信息 / Anomaly info
   * @private
   */
  async _executeCircuitBreakerActions(anomaly) {
    if (!this.config.enableAutoEmergencyClose) {
      this.log('自动紧急平仓已禁用 / Auto emergency close disabled', 'info');
      return;
    }

    const { level } = anomaly;

    // 根据熔断级别执行不同动作 / Execute different actions based on level
    switch (level) {
      case CIRCUIT_BREAKER_LEVEL.EMERGENCY:
        // 紧急状态: 全部平仓 / Emergency: close all positions
        await this._emergencyCloseAll('黑天鹅事件紧急平仓');
        break;

      case CIRCUIT_BREAKER_LEVEL.LEVEL_3:
        // 三级熔断: 可选择全部平仓 / Level 3: optionally close all
        if (this.config.emergencyCloseLevel === CIRCUIT_BREAKER_LEVEL.LEVEL_3) {
          await this._emergencyCloseAll('三级熔断紧急平仓');
        } else {
          await this._partialClose(this.config.partialCloseRatioLevel2);
        }
        break;

      case CIRCUIT_BREAKER_LEVEL.LEVEL_2:
        // 二级警告: 部分平仓 / Level 2: partial close
        await this._partialClose(this.config.partialCloseRatioLevel2);
        break;

      case CIRCUIT_BREAKER_LEVEL.LEVEL_1:
        // 一级警告: 少量减仓或仅警告 / Level 1: small reduction or warning only
        await this._partialClose(this.config.partialCloseRatioLevel1);
        break;

      default:
        break;
    }

    // 暂停新交易 / Pause new trades
    if (this.portfolioRiskManager && level !== CIRCUIT_BREAKER_LEVEL.LEVEL_1) {
      this.portfolioRiskManager.pauseTrading(`熔断: ${anomaly.message}`);
    }
  }

  /**
   * 紧急全部平仓
   * Emergency close all positions
   *
   * @param {string} reason - 原因 / Reason
   * @private
   */
  async _emergencyCloseAll(reason) {
    this.log(`🚨 执行紧急平仓: ${reason}`, 'error');

    if (this.executor && typeof this.executor.emergencyCloseAll === 'function') {
      try {
        await this.executor.emergencyCloseAll({ reason });
        this.log('✓ 紧急平仓完成 / Emergency close completed', 'info');
      } catch (error) {
        this.log(`✗ 紧急平仓失败: ${error.message}`, 'error');
      }
    }

    this.emit('emergencyClose', { reason, timestamp: Date.now() });
  }

  /**
   * 部分平仓
   * Partial close
   *
   * @param {number} ratio - 平仓比例 / Close ratio
   * @private
   */
  async _partialClose(ratio) {
    this.log(`📉 执行部分平仓: ${(ratio * 100).toFixed(0)}%`, 'warn');

    if (this.executor && typeof this.executor.reduceAllPositions === 'function') {
      try {
        await this.executor.reduceAllPositions(ratio);
        this.log(`✓ 部分平仓完成 (${(ratio * 100).toFixed(0)}%)`, 'info');
      } catch (error) {
        this.log(`✗ 部分平仓失败: ${error.message}`, 'error');
      }
    }

    this.emit('partialClose', { ratio, timestamp: Date.now() });
  }

  // ============================================
  // 恢复检测 / Recovery Detection
  // ============================================

  /**
   * 检查市场恢复
   * Check market recovery
   * @private
   */
  _checkRecovery() {
    // 如果不在熔断状态，无需检查 / If not in circuit breaker state, no need to check
    if (this.circuitBreakerState.level === CIRCUIT_BREAKER_LEVEL.NORMAL) {
      return;
    }

    const now = Date.now();

    // 检查是否过了冷却期 / Check if past cooldown
    if (this.circuitBreakerState.cooldownUntil && now < this.circuitBreakerState.cooldownUntil) {
      return;
    }

    // 检查市场是否稳定 / Check if market is stable
    const isStable = this._isMarketStable();

    if (isStable) {
      if (!this.stabilityStartTime) {
        this.stabilityStartTime = now;
        this.log('市场开始稳定 / Market starting to stabilize', 'info');
      }

      // 检查是否稳定足够长时间 / Check if stable long enough
      if (now - this.stabilityStartTime >= this.config.stabilityConfirmationTime) {
        this._recoverFromCircuitBreaker();
      }
    } else {
      // 重置稳定计时 / Reset stability timer
      this.stabilityStartTime = null;
    }
  }

  /**
   * 检查市场是否稳定
   * Check if market is stable
   *
   * @returns {boolean} 是否稳定 / Whether stable
   * @private
   */
  _isMarketStable() {
    // 检查所有受影响的交易对 / Check all affected symbols
    for (const symbol of this.circuitBreakerState.affectedSymbols) {
      const history = this.priceHistory.get(symbol);
      if (!history || history.length < 10) {
        return false;
      }

      // 检查最近10个价格点的波动率 / Check volatility of recent 10 price points
      const recentPrices = history.slice(-10).map((h) => h.price);
      const volatility = this._calculateVolatility(recentPrices);

      // 如果波动率仍然较高，认为不稳定 / If volatility still high, consider unstable
      if (volatility > 0.01) { // 1%以上波动
        return false;
      }

      // 检查点差是否恢复正常 / Check if spread returned to normal
      const baselineSpread = this.baselineSpreads.get(symbol);
      if (baselineSpread) {
        // 这里需要当前点差数据，暂时假设正常
      }
    }

    return true;
  }

  /**
   * 从熔断状态恢复
   * Recover from circuit breaker
   * @private
   */
  _recoverFromCircuitBreaker() {
    const previousLevel = this.circuitBreakerState.level;

    // 重置熔断状态 / Reset circuit breaker state
    this.circuitBreakerState = {
      level: CIRCUIT_BREAKER_LEVEL.NORMAL,
      triggeredAt: null,
      reason: null,
      eventType: null,
      affectedSymbols: [],
      cooldownUntil: null,
    };

    this.stabilityStartTime = null;

    this.log('✓ 市场恢复正常，熔断解除 / Market recovered, circuit breaker lifted', 'info');

    // 恢复交易 / Resume trading
    if (this.portfolioRiskManager) {
      this.portfolioRiskManager.resumeTrading();
    }

    // 发出事件 / Emit event
    this.emit('recovered', {
      previousLevel,
      timestamp: Date.now(),
    });
  }

  // ============================================
  // 定时检查 / Periodic Check
  // ============================================

  /**
   * 执行定时检查
   * Perform periodic check
   * @private
   */
  _performCheck() {
    const now = Date.now();

    // 检查价格更新超时 / Check price update timeout
    for (const [symbol, lastUpdate] of this.lastPriceUpdate) {
      if (now - lastUpdate > this.config.priceUpdateTimeout) {
        this.log(`⚠️ ${symbol} 价格更新超时 / Price update timeout`, 'warn');

        this.emit('priceUpdateTimeout', {
          symbol,
          lastUpdate,
          timeout: this.config.priceUpdateTimeout,
        });
      }
    }
  }

  // ============================================
  // 事件记录 / Event Recording
  // ============================================

  /**
   * 记录事件
   * Record event
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} anomaly - 异常信息 / Anomaly info
   * @private
   */
  _recordEvent(symbol, anomaly) {
    this.eventHistory.push({
      symbol,
      ...anomaly,
      timestamp: Date.now(),
    });

    // 限制历史长度 / Limit history length
    if (this.eventHistory.length > 500) {
      this.eventHistory = this.eventHistory.slice(-500);
    }
  }

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 获取当前状态
   * Get current status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    return {
      running: this.running,
      circuitBreakerState: { ...this.circuitBreakerState },
      stabilityStartTime: this.stabilityStartTime,
      recentEvents: this.eventHistory.slice(-20),
      config: {
        priceChange1mWarning: this.config.priceChange1mWarning,
        priceChange5mCircuitBreaker: this.config.priceChange5mCircuitBreaker,
        volatilitySpikeMultiplier: this.config.volatilitySpikeMultiplier,
        enableAutoEmergencyClose: this.config.enableAutoEmergencyClose,
      },
    };
  }

  /**
   * 手动触发熔断
   * Manual trigger circuit breaker
   *
   * @param {string} level - 熔断级别 / Circuit breaker level
   * @param {string} reason - 原因 / Reason
   */
  async manualTrigger(level, reason = '手动触发') {
    await this._triggerCircuitBreaker('MANUAL', {
      type: BLACK_SWAN_TYPE.EXCHANGE_ANOMALY,
      level,
      message: reason,
      details: { manual: true },
    });
  }

  /**
   * 手动恢复
   * Manual recovery
   */
  manualRecover() {
    this._recoverFromCircuitBreaker();
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    if (!this.config.verbose && level === 'info') return;

    const fullMessage = `${this.config.logPrefix} ${message}`;

    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'info':
      default:
        console.log(fullMessage);
        break;
    }
  }
}

// ============================================
// 导出 / Exports
// ============================================

export { CIRCUIT_BREAKER_LEVEL, BLACK_SWAN_TYPE, DEFAULT_CONFIG };
export default BlackSwanProtector;
