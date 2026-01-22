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

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 熔断级别
 * Circuit breaker level
 */
const CIRCUIT_BREAKER_LEVEL = { // 定义常量 CIRCUIT_BREAKER_LEVEL
  NORMAL: 'normal',           // 正常 / Normal
  LEVEL_1: 'level_1',         // 一级警告 / Level 1 warning
  LEVEL_2: 'level_2',         // 二级警告 / Level 2 warning
  LEVEL_3: 'level_3',         // 三级熔断 / Level 3 circuit break
  EMERGENCY: 'emergency',     // 紧急状态 / Emergency state
}; // 结束代码块

/**
 * 黑天鹅事件类型
 * Black swan event types
 */
const BLACK_SWAN_TYPE = { // 定义常量 BLACK_SWAN_TYPE
  FLASH_CRASH: 'flash_crash',           // 闪崩 / Flash crash
  FLASH_RALLY: 'flash_rally',           // 暴涨 / Flash rally
  VOLATILITY_SPIKE: 'volatility_spike', // 波动率飙升 / Volatility spike
  LIQUIDITY_CRISIS: 'liquidity_crisis', // 流动性危机 / Liquidity crisis
  SPREAD_BLOWOUT: 'spread_blowout',     // 价差BLOWOUT权限
  EXCHANGE_ANOMALY: 'exchange_anomaly', // 交易所异常 / Exchange anomaly
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 价格变动阈值 / Price Change Thresholds
  // ============================================

  // 1分钟内价格变动警告阈值 / 1-minute price change warning threshold
  priceChange1mWarning: 0.03,    // 1分钟内价格变动警告阈值

  // 1分钟内价格变动熔断阈值 / 1-minute price change circuit breaker threshold
  priceChange1mCircuitBreaker: 0.05, // 1分钟内价格变动熔断阈值

  // 5分钟内价格变动警告阈值 / 5-minute price change warning threshold
  priceChange5mWarning: 0.05,    // 5分钟内价格变动警告阈值

  // 5分钟内价格变动熔断阈值 / 5-minute price change circuit breaker threshold
  priceChange5mCircuitBreaker: 0.08, // 5分钟内价格变动熔断阈值

  // 15分钟内价格变动紧急阈值 / 15-minute price change emergency threshold
  priceChange15mEmergency: 0.15, // 15分钟内价格变动紧急阈值

  // ============================================
  // 波动率阈值 / Volatility Thresholds
  // ============================================

  // 波动率突变倍数 (相对于历史波动率) / Volatility spike multiplier (relative to historical)
  volatilitySpikeMultiplier: 3.0, // 波动率突变倍数 (相对于历史波动率)

  // 历史波动率计算窗口 (小时) / Historical volatility calculation window (hours)
  volatilityWindow: 24, // 历史波动率计算窗口 (小时)

  // 超高波动率阈值 (年化) / Ultra high volatility threshold (annualized)
  ultraHighVolatility: 2.0, // 超高波动率阈值 (年化)

  // ============================================
  // 点差阈值 / Spread Thresholds
  // ============================================

  // 点差扩大警告倍数 / Spread widening warning multiplier
  spreadWarningMultiplier: 3.0, // 点差扩大警告倍数

  // 点差扩大熔断倍数 / Spread widening circuit breaker multiplier
  spreadCircuitBreakerMultiplier: 5.0, // 点差扩大熔断倍数

  // 最大可接受点差 (百分比) / Maximum acceptable spread (percentage)
  maxSpreadPercent: 0.02, // 最大可接受点差 (百分比)

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
  enableAutoRecovery: true, // 启用自动Recovery

  // 恢复检测间隔 (毫秒) / Recovery detection interval (ms)
  recoveryCheckInterval: 60 * 1000, // 1分钟 / 1 minute

  // 市场稳定判定时间 (毫秒) / Market stability confirmation time (ms)
  stabilityConfirmationTime: 10 * 60 * 1000, // 10分钟 / 10 minutes

  // ============================================
  // 紧急平仓配置 / Emergency Close Configuration
  // ============================================

  // 启用自动紧急平仓 / Enable auto emergency close
  enableAutoEmergencyClose: true, // 启用自动紧急平仓

  // 紧急平仓在熔断级别 / Emergency close at circuit breaker level
  emergencyCloseLevel: CIRCUIT_BREAKER_LEVEL.LEVEL_3, // 紧急平仓在熔断级别

  // 部分平仓比例 (一级/二级熔断) / Partial close ratio (level 1/2 circuit breaker)
  partialCloseRatioLevel1: 0.25, // 部分平仓比例 (一级/二级熔断)
  partialCloseRatioLevel2: 0.50, // partial收盘比例Level2

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 价格更新超时 (毫秒) / Price update timeout (ms)
  priceUpdateTimeout: 10 * 1000, // 10秒 / 10 seconds

  // 检查间隔 (毫秒) / Check interval (ms)
  checkInterval: 1000, // 1秒 / 1 second

  // 价格历史保留数量 / Price history retention count
  priceHistoryLength: 1000, // 价格历史保留数量

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志

  // 日志前缀 / Log prefix
  logPrefix: '[BlackSwanProtector]', // 日志前缀
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 黑天鹅事件保护器
 * Black Swan Event Protector
 */
export class BlackSwanProtector extends EventEmitter { // 导出类 BlackSwanProtector
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 当前熔断状态 / Current circuit breaker state
    this.circuitBreakerState = { // 设置 circuitBreakerState
      level: CIRCUIT_BREAKER_LEVEL.NORMAL, // 级别
      triggeredAt: null, // triggeredAt
      reason: null, // reason
      eventType: null, // 事件类型
      affectedSymbols: [], // affected交易对列表
      cooldownUntil: null, // 冷却Until
    }; // 结束代码块

    // 价格历史 / Price history
    // 格式: { symbol: [{ price, timestamp, volume }, ...] }
    this.priceHistory = new Map(); // 设置 priceHistory

    // 基准价格 (用于计算变动) / Baseline prices (for calculating changes)
    // 格式: { symbol: { price1m, price5m, price15m, timestamp } }
    this.baselinePrices = new Map(); // 设置 baselinePrices

    // 历史波动率 / Historical volatility
    // 格式: { symbol: { volatility, updatedAt } }
    this.historicalVolatility = new Map(); // 设置 historicalVolatility

    // 基准点差 / Baseline spreads
    // 格式: { symbol: { spread, updatedAt } }
    this.baselineSpreads = new Map(); // 设置 baselineSpreads

    // 基准深度 / Baseline depth
    // 格式: { symbol: { bidDepth, askDepth, updatedAt } }
    this.baselineDepths = new Map(); // 设置 baselineDepths

    // 事件历史 / Event history
    this.eventHistory = []; // 设置 eventHistory

    // 执行器引用 / Executor reference
    this.executor = null; // 设置 executor

    // 组合风控引用 / Portfolio risk manager reference
    this.portfolioRiskManager = null; // 设置 portfolioRiskManager

    // 定时器 / Timers
    this.checkTimer = null; // 设置 checkTimer
    this.recoveryTimer = null; // 设置 recoveryTimer

    // 运行状态 / Running state
    this.running = false; // 设置 running

    // 最后价格更新时间 / Last price update time
    this.lastPriceUpdate = new Map(); // 设置 lastPriceUpdate

    // 市场稳定开始时间 / Market stability start time
    this.stabilityStartTime = null; // 设置 stabilityStartTime
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化
   * Initialize
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) { // 执行语句
    const { executor, portfolioRiskManager } = options; // 解构赋值

    this.executor = executor; // 设置 executor
    this.portfolioRiskManager = portfolioRiskManager; // 设置 portfolioRiskManager

    this.log('黑天鹅保护器初始化完成 / Black swan protector initialized', 'info'); // 调用 log
  } // 结束代码块

  /**
   * 启动
   * Start
   */
  start() { // 调用 start
    if (this.running) return; // 条件判断 this.running

    this.running = true; // 设置 running

    // 启动定时检查 / Start periodic check
    this.checkTimer = setInterval( // 设置 checkTimer
      () => this._performCheck(), // 定义箭头函数
      this.config.checkInterval // 访问 config
    ); // 结束调用或参数

    // 启动恢复检测 / Start recovery detection
    if (this.config.enableAutoRecovery) { // 条件判断 this.config.enableAutoRecovery
      this.recoveryTimer = setInterval( // 设置 recoveryTimer
        () => this._checkRecovery(), // 定义箭头函数
        this.config.recoveryCheckInterval // 访问 config
      ); // 结束调用或参数
    } // 结束代码块

    this.log('黑天鹅保护器已启动 / Black swan protector started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止
   * Stop
   */
  stop() { // 调用 stop
    if (!this.running) return; // 条件判断 !this.running

    this.running = false; // 设置 running

    if (this.checkTimer) { // 条件判断 this.checkTimer
      clearInterval(this.checkTimer); // 调用 clearInterval
      this.checkTimer = null; // 设置 checkTimer
    } // 结束代码块

    if (this.recoveryTimer) { // 条件判断 this.recoveryTimer
      clearInterval(this.recoveryTimer); // 调用 clearInterval
      this.recoveryTimer = null; // 设置 recoveryTimer
    } // 结束代码块

    this.log('黑天鹅保护器已停止 / Black swan protector stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

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
  updatePrice(symbol, price, volume = 0, orderBook = null) { // 调用 updatePrice
    const now = Date.now(); // 定义常量 now

    // 更新价格历史 / Update price history
    if (!this.priceHistory.has(symbol)) { // 条件判断 !this.priceHistory.has(symbol)
      this.priceHistory.set(symbol, []); // 访问 priceHistory
    } // 结束代码块

    const history = this.priceHistory.get(symbol); // 定义常量 history
    history.push({ price, timestamp: now, volume }); // 调用 history.push

    // 限制历史长度 / Limit history length
    if (history.length > this.config.priceHistoryLength) { // 条件判断 history.length > this.config.priceHistoryLength
      history.shift(); // 调用 history.shift
    } // 结束代码块

    // 更新最后价格时间 / Update last price time
    this.lastPriceUpdate.set(symbol, now); // 访问 lastPriceUpdate

    // 更新基准价格 / Update baseline prices
    this._updateBaselinePrices(symbol, price, now); // 调用 _updateBaselinePrices

    // 如果有订单簿数据，更新点差和深度 / If order book data available, update spread and depth
    if (orderBook) { // 条件判断 orderBook
      this._updateSpreadAndDepth(symbol, orderBook); // 调用 _updateSpreadAndDepth
    } // 结束代码块

    // 检测异常 / Detect anomalies
    this._detectAnomalies(symbol, price, orderBook); // 调用 _detectAnomalies
  } // 结束代码块

  /**
   * 更新基准价格
   * Update baseline prices
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} price - 价格 / Price
   * @param {number} now - 当前时间 / Current time
   * @private
   */
  _updateBaselinePrices(symbol, price, now) { // 调用 _updateBaselinePrices
    if (!this.baselinePrices.has(symbol)) { // 条件判断 !this.baselinePrices.has(symbol)
      this.baselinePrices.set(symbol, { // 访问 baselinePrices
        price1m: price, // price1m
        price5m: price, // price5m
        price15m: price, // price15m
        timestamp1m: now, // timestamp1m
        timestamp5m: now, // timestamp5m
        timestamp15m: now, // timestamp15m
      }); // 结束代码块
      return; // 返回结果
    } // 结束代码块

    const baseline = this.baselinePrices.get(symbol); // 定义常量 baseline

    // 更新1分钟基准 / Update 1-minute baseline
    if (now - baseline.timestamp1m >= 60 * 1000) { // 条件判断 now - baseline.timestamp1m >= 60 * 1000
      baseline.price1m = price; // 赋值 baseline.price1m
      baseline.timestamp1m = now; // 赋值 baseline.timestamp1m
    } // 结束代码块

    // 更新5分钟基准 / Update 5-minute baseline
    if (now - baseline.timestamp5m >= 5 * 60 * 1000) { // 条件判断 now - baseline.timestamp5m >= 5 * 60 * 1000
      baseline.price5m = price; // 赋值 baseline.price5m
      baseline.timestamp5m = now; // 赋值 baseline.timestamp5m
    } // 结束代码块

    // 更新15分钟基准 / Update 15-minute baseline
    if (now - baseline.timestamp15m >= 15 * 60 * 1000) { // 条件判断 now - baseline.timestamp15m >= 15 * 60 * 1000
      baseline.price15m = price; // 赋值 baseline.price15m
      baseline.timestamp15m = now; // 赋值 baseline.timestamp15m
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新点差和深度
   * Update spread and depth
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} orderBook - 订单簿 / Order book
   * @private
   */
  _updateSpreadAndDepth(symbol, orderBook) { // 调用 _updateSpreadAndDepth
    const { bids, asks } = orderBook; // 解构赋值

    if (!bids || !asks || bids.length === 0 || asks.length === 0) { // 条件判断 !bids || !asks || bids.length === 0 || asks.l...
      return; // 返回结果
    } // 结束代码块

    const bestBid = bids[0][0]; // 定义常量 bestBid
    const bestAsk = asks[0][0]; // 定义常量 bestAsk
    const spread = (bestAsk - bestBid) / bestBid; // 定义常量 spread

    // 计算深度 / Calculate depth
    const bidDepth = bids.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0); // 定义函数 bidDepth
    const askDepth = asks.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0); // 定义函数 askDepth

    const now = Date.now(); // 定义常量 now

    // 初始化或更新基准 / Initialize or update baseline
    if (!this.baselineSpreads.has(symbol)) { // 条件判断 !this.baselineSpreads.has(symbol)
      this.baselineSpreads.set(symbol, { spread, updatedAt: now }); // 访问 baselineSpreads
      this.baselineDepths.set(symbol, { bidDepth, askDepth, updatedAt: now }); // 访问 baselineDepths
    } else { // 执行语句
      // 使用指数移动平均更新基准 / Update baseline using EMA
      const existingSpread = this.baselineSpreads.get(symbol); // 定义常量 existingSpread
      const alpha = 0.1; // 定义常量 alpha
      existingSpread.spread = alpha * spread + (1 - alpha) * existingSpread.spread; // 赋值 existingSpread.spread

      const existingDepth = this.baselineDepths.get(symbol); // 定义常量 existingDepth
      existingDepth.bidDepth = alpha * bidDepth + (1 - alpha) * existingDepth.bidDepth; // 赋值 existingDepth.bidDepth
      existingDepth.askDepth = alpha * askDepth + (1 - alpha) * existingDepth.askDepth; // 赋值 existingDepth.askDepth
    } // 结束代码块
  } // 结束代码块

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
  _detectAnomalies(symbol, currentPrice, orderBook) { // 调用 _detectAnomalies
    // 如果已在紧急状态且未过冷却期，跳过检测 / Skip if in emergency and not past cooldown
    if (this.circuitBreakerState.cooldownUntil && // 条件判断 this.circuitBreakerState.cooldownUntil &&
        Date.now() < this.circuitBreakerState.cooldownUntil) { // 调用 Date.now
      return; // 返回结果
    } // 结束代码块

    const anomalies = []; // 定义常量 anomalies

    // 1. 检测价格闪崩/暴涨 / Detect flash crash/rally
    const priceAnomaly = this._detectPriceAnomaly(symbol, currentPrice); // 定义常量 priceAnomaly
    if (priceAnomaly) { // 条件判断 priceAnomaly
      anomalies.push(priceAnomaly); // 调用 anomalies.push
    } // 结束代码块

    // 2. 检测波动率突变 / Detect volatility spike
    const volatilityAnomaly = this._detectVolatilitySpike(symbol); // 定义常量 volatilityAnomaly
    if (volatilityAnomaly) { // 条件判断 volatilityAnomaly
      anomalies.push(volatilityAnomaly); // 调用 anomalies.push
    } // 结束代码块

    // 3. 检测点差异常 / Detect spread anomaly
    if (orderBook) { // 条件判断 orderBook
      const spreadAnomaly = this._detectSpreadAnomaly(symbol, orderBook); // 定义常量 spreadAnomaly
      if (spreadAnomaly) { // 条件判断 spreadAnomaly
        anomalies.push(spreadAnomaly); // 调用 anomalies.push
      } // 结束代码块

      // 4. 检测深度消失 / Detect depth disappearance
      const depthAnomaly = this._detectDepthAnomaly(symbol, orderBook); // 定义常量 depthAnomaly
      if (depthAnomaly) { // 条件判断 depthAnomaly
        anomalies.push(depthAnomaly); // 调用 anomalies.push
      } // 结束代码块
    } // 结束代码块

    // 处理检测到的异常 / Process detected anomalies
    if (anomalies.length > 0) { // 条件判断 anomalies.length > 0
      this._processAnomalies(symbol, anomalies); // 调用 _processAnomalies
    } // 结束代码块
  } // 结束代码块

  /**
   * 检测价格异常
   * Detect price anomaly
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} currentPrice - 当前价格 / Current price
   * @returns {Object|null} 异常信息 / Anomaly info
   * @private
   */
  _detectPriceAnomaly(symbol, currentPrice) { // 调用 _detectPriceAnomaly
    const baseline = this.baselinePrices.get(symbol); // 定义常量 baseline
    if (!baseline) return null; // 条件判断 !baseline

    // 计算各时间窗口的价格变动 / Calculate price changes for each time window
    const change1m = (currentPrice - baseline.price1m) / baseline.price1m; // 定义常量 change1m
    const change5m = (currentPrice - baseline.price5m) / baseline.price5m; // 定义常量 change5m
    const change15m = (currentPrice - baseline.price15m) / baseline.price15m; // 定义常量 change15m

    const absChange1m = Math.abs(change1m); // 定义常量 absChange1m
    const absChange5m = Math.abs(change5m); // 定义常量 absChange5m
    const absChange15m = Math.abs(change15m); // 定义常量 absChange15m

    // 确定事件类型 / Determine event type
    const isFlashCrash = change1m < 0 || change5m < 0; // 定义常量 isFlashCrash
    const eventType = isFlashCrash ? BLACK_SWAN_TYPE.FLASH_CRASH : BLACK_SWAN_TYPE.FLASH_RALLY; // 定义常量 eventType

    // 检查各级别阈值 / Check thresholds for each level
    if (absChange15m >= this.config.priceChange15mEmergency) { // 条件判断 absChange15m >= this.config.priceChange15mEme...
      return { // 返回结果
        type: eventType, // 类型
        level: CIRCUIT_BREAKER_LEVEL.EMERGENCY, // 级别
        message: `15分钟内价格变动 ${(change15m * 100).toFixed(2)}% 触发紧急状态`, // 消息
        details: { change1m, change5m, change15m, currentPrice, baseline }, // details
      }; // 结束代码块
    } // 结束代码块

    if (absChange5m >= this.config.priceChange5mCircuitBreaker) { // 条件判断 absChange5m >= this.config.priceChange5mCircu...
      return { // 返回结果
        type: eventType, // 类型
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_3, // 级别
        message: `5分钟内价格变动 ${(change5m * 100).toFixed(2)}% 触发三级熔断`, // 消息
        details: { change1m, change5m, change15m, currentPrice, baseline }, // details
      }; // 结束代码块
    } // 结束代码块

    if (absChange5m >= this.config.priceChange5mWarning) { // 条件判断 absChange5m >= this.config.priceChange5mWarning
      return { // 返回结果
        type: eventType, // 类型
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2, // 级别
        message: `5分钟内价格变动 ${(change5m * 100).toFixed(2)}% 触发二级警告`, // 消息
        details: { change1m, change5m, change15m, currentPrice, baseline }, // details
      }; // 结束代码块
    } // 结束代码块

    if (absChange1m >= this.config.priceChange1mCircuitBreaker) { // 条件判断 absChange1m >= this.config.priceChange1mCircu...
      return { // 返回结果
        type: eventType, // 类型
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2, // 级别
        message: `1分钟内价格变动 ${(change1m * 100).toFixed(2)}% 触发二级警告`, // 消息
        details: { change1m, change5m, change15m, currentPrice, baseline }, // details
      }; // 结束代码块
    } // 结束代码块

    if (absChange1m >= this.config.priceChange1mWarning) { // 条件判断 absChange1m >= this.config.priceChange1mWarning
      return { // 返回结果
        type: eventType, // 类型
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_1, // 级别
        message: `1分钟内价格变动 ${(change1m * 100).toFixed(2)}% 触发一级警告`, // 消息
        details: { change1m, change5m, change15m, currentPrice, baseline }, // details
      }; // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 检测波动率突变
   * Detect volatility spike
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object|null} 异常信息 / Anomaly info
   * @private
   */
  _detectVolatilitySpike(symbol) { // 调用 _detectVolatilitySpike
    const history = this.priceHistory.get(symbol); // 定义常量 history
    if (!history || history.length < 60) return null; // 需要至少60个数据点

    // 计算最近1小时的波动率 / Calculate volatility for last hour
    const recentPrices = history.slice(-60).map((h) => h.price); // 定义函数 recentPrices
    const recentVolatility = this._calculateVolatility(recentPrices); // 定义常量 recentVolatility

    // 获取历史波动率 / Get historical volatility
    let historicalVol = this.historicalVolatility.get(symbol); // 定义变量 historicalVol

    if (!historicalVol) { // 条件判断 !historicalVol
      // 初始化历史波动率 / Initialize historical volatility
      historicalVol = { volatility: recentVolatility, updatedAt: Date.now() }; // 赋值 historicalVol
      this.historicalVolatility.set(symbol, historicalVol); // 访问 historicalVolatility
      return null; // 返回结果
    } // 结束代码块

    // 检查波动率是否突变 / Check if volatility spiked
    const spikeRatio = recentVolatility / historicalVol.volatility; // 定义常量 spikeRatio

    if (spikeRatio >= this.config.volatilitySpikeMultiplier) { // 条件判断 spikeRatio >= this.config.volatilitySpikeMult...
      // 年化波动率 / Annualized volatility
      const annualizedVol = recentVolatility * Math.sqrt(365 * 24); // 定义常量 annualizedVol

      let level = CIRCUIT_BREAKER_LEVEL.LEVEL_1; // 定义变量 level
      if (annualizedVol >= this.config.ultraHighVolatility) { // 条件判断 annualizedVol >= this.config.ultraHighVolatility
        level = CIRCUIT_BREAKER_LEVEL.LEVEL_3; // 赋值 level
      } else if (spikeRatio >= this.config.volatilitySpikeMultiplier * 2) { // 执行语句
        level = CIRCUIT_BREAKER_LEVEL.LEVEL_2; // 赋值 level
      } // 结束代码块

      return { // 返回结果
        type: BLACK_SWAN_TYPE.VOLATILITY_SPIKE, // 类型
        level, // 执行语句
        message: `波动率突变: ${spikeRatio.toFixed(1)}倍 (年化 ${(annualizedVol * 100).toFixed(0)}%)`, // 消息
        details: { // details
          recentVolatility, // 执行语句
          historicalVolatility: historicalVol.volatility, // historical波动率
          spikeRatio, // 执行语句
          annualizedVol, // 执行语句
        }, // 结束代码块
      }; // 结束代码块
    } // 结束代码块

    // 更新历史波动率 (EMA) / Update historical volatility (EMA)
    const alpha = 0.05; // 定义常量 alpha
    historicalVol.volatility = alpha * recentVolatility + (1 - alpha) * historicalVol.volatility; // 赋值 historicalVol.volatility
    historicalVol.updatedAt = Date.now(); // 赋值 historicalVol.updatedAt

    return null; // 返回结果
  } // 结束代码块

  /**
   * 计算波动率
   * Calculate volatility
   *
   * @param {Array} prices - 价格数组 / Price array
   * @returns {number} 波动率 / Volatility
   * @private
   */
  _calculateVolatility(prices) { // 调用 _calculateVolatility
    if (prices.length < 2) return 0; // 条件判断 prices.length < 2

    // 计算收益率 / Calculate returns
    const returns = []; // 定义常量 returns
    for (let i = 1; i < prices.length; i++) { // 循环 let i = 1; i < prices.length; i++
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]); // 调用 returns.push
    } // 结束代码块

    // 计算标准差 / Calculate standard deviation
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length; // 定义函数 mean
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length; // 定义函数 variance

    return Math.sqrt(variance); // 返回结果
  } // 结束代码块

  /**
   * 检测点差异常
   * Detect spread anomaly
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} orderBook - 订单簿 / Order book
   * @returns {Object|null} 异常信息 / Anomaly info
   * @private
   */
  _detectSpreadAnomaly(symbol, orderBook) { // 调用 _detectSpreadAnomaly
    const { bids, asks } = orderBook; // 解构赋值

    if (!bids || !asks || bids.length === 0 || asks.length === 0) { // 条件判断 !bids || !asks || bids.length === 0 || asks.l...
      return null; // 返回结果
    } // 结束代码块

    const bestBid = bids[0][0]; // 定义常量 bestBid
    const bestAsk = asks[0][0]; // 定义常量 bestAsk
    const currentSpread = (bestAsk - bestBid) / bestBid; // 定义常量 currentSpread

    // 检查绝对点差 / Check absolute spread
    if (currentSpread >= this.config.maxSpreadPercent) { // 条件判断 currentSpread >= this.config.maxSpreadPercent
      return { // 返回结果
        type: BLACK_SWAN_TYPE.SPREAD_BLOWOUT, // 类型
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2, // 级别
        message: `点差过大: ${(currentSpread * 100).toFixed(3)}% >= ${(this.config.maxSpreadPercent * 100).toFixed(2)}%`, // 消息
        details: { currentSpread, bestBid, bestAsk }, // details
      }; // 结束代码块
    } // 结束代码块

    // 检查相对点差变化 / Check relative spread change
    const baselineSpread = this.baselineSpreads.get(symbol); // 定义常量 baselineSpread
    if (baselineSpread) { // 条件判断 baselineSpread
      const spreadRatio = currentSpread / baselineSpread.spread; // 定义常量 spreadRatio

      if (spreadRatio >= this.config.spreadCircuitBreakerMultiplier) { // 条件判断 spreadRatio >= this.config.spreadCircuitBreak...
        return { // 返回结果
          type: BLACK_SWAN_TYPE.SPREAD_BLOWOUT, // 类型
          level: CIRCUIT_BREAKER_LEVEL.LEVEL_3, // 级别
          message: `点差扩大 ${spreadRatio.toFixed(1)}倍 触发熔断`, // 消息
          details: { // details
            currentSpread, // 执行语句
            baselineSpread: baselineSpread.spread, // 基线价差
            spreadRatio, // 执行语句
          }, // 结束代码块
        }; // 结束代码块
      } // 结束代码块

      if (spreadRatio >= this.config.spreadWarningMultiplier) { // 条件判断 spreadRatio >= this.config.spreadWarningMulti...
        return { // 返回结果
          type: BLACK_SWAN_TYPE.SPREAD_BLOWOUT, // 类型
          level: CIRCUIT_BREAKER_LEVEL.LEVEL_1, // 级别
          message: `点差扩大 ${spreadRatio.toFixed(1)}倍 警告`, // 消息
          details: { // details
            currentSpread, // 执行语句
            baselineSpread: baselineSpread.spread, // 基线价差
            spreadRatio, // 执行语句
          }, // 结束代码块
        }; // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 检测深度消失
   * Detect depth disappearance
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} orderBook - 订单簿 / Order book
   * @returns {Object|null} 异常信息 / Anomaly info
   * @private
   */
  _detectDepthAnomaly(symbol, orderBook) { // 调用 _detectDepthAnomaly
    const { bids, asks } = orderBook; // 解构赋值

    if (!bids || !asks) return null; // 条件判断 !bids || !asks

    const bidDepth = bids.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0); // 定义函数 bidDepth
    const askDepth = asks.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0); // 定义函数 askDepth

    const baselineDepth = this.baselineDepths.get(symbol); // 定义常量 baselineDepth
    if (!baselineDepth) return null; // 条件判断 !baselineDepth

    const bidReduction = 1 - (bidDepth / baselineDepth.bidDepth); // 定义常量 bidReduction
    const askReduction = 1 - (askDepth / baselineDepth.askDepth); // 定义常量 askReduction
    const maxReduction = Math.max(bidReduction, askReduction); // 定义常量 maxReduction

    if (maxReduction >= this.config.depthDisappearanceCircuitBreaker) { // 条件判断 maxReduction >= this.config.depthDisappearanc...
      return { // 返回结果
        type: BLACK_SWAN_TYPE.LIQUIDITY_CRISIS, // 类型
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_3, // 级别
        message: `流动性危机: 深度减少 ${(maxReduction * 100).toFixed(1)}%`, // 消息
        details: { // details
          bidDepth, // 执行语句
          askDepth, // 执行语句
          baselineBidDepth: baselineDepth.bidDepth, // 基线BidDepth
          baselineAskDepth: baselineDepth.askDepth, // 基线AskDepth
          bidReduction, // 执行语句
          askReduction, // 执行语句
        }, // 结束代码块
      }; // 结束代码块
    } // 结束代码块

    if (maxReduction >= this.config.depthDisappearanceWarning) { // 条件判断 maxReduction >= this.config.depthDisappearanc...
      return { // 返回结果
        type: BLACK_SWAN_TYPE.LIQUIDITY_CRISIS, // 类型
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_1, // 级别
        message: `流动性警告: 深度减少 ${(maxReduction * 100).toFixed(1)}%`, // 消息
        details: { // details
          bidDepth, // 执行语句
          askDepth, // 执行语句
          baselineBidDepth: baselineDepth.bidDepth, // 基线BidDepth
          baselineAskDepth: baselineDepth.askDepth, // 基线AskDepth
          bidReduction, // 执行语句
          askReduction, // 执行语句
        }, // 结束代码块
      }; // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

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
  _processAnomalies(symbol, anomalies) { // 调用 _processAnomalies
    // 找出最严重的异常 / Find most severe anomaly
    const levelPriority = { // 定义常量 levelPriority
      [CIRCUIT_BREAKER_LEVEL.NORMAL]: 0, // 执行语句
      [CIRCUIT_BREAKER_LEVEL.LEVEL_1]: 1, // 执行语句
      [CIRCUIT_BREAKER_LEVEL.LEVEL_2]: 2, // 执行语句
      [CIRCUIT_BREAKER_LEVEL.LEVEL_3]: 3, // 执行语句
      [CIRCUIT_BREAKER_LEVEL.EMERGENCY]: 4, // 执行语句
    }; // 结束代码块

    const mostSevere = anomalies.reduce((a, b) => // 定义函数 mostSevere
      (levelPriority[a.level] || 0) > (levelPriority[b.level] || 0) ? a : b // 执行语句
    ); // 结束调用或参数

    // 如果新异常比当前状态更严重，更新状态 / Update state if new anomaly is more severe
    if (levelPriority[mostSevere.level] > levelPriority[this.circuitBreakerState.level]) { // 条件判断 levelPriority[mostSevere.level] > levelPriori...
      this._triggerCircuitBreaker(symbol, mostSevere); // 调用 _triggerCircuitBreaker
    } // 结束代码块

    // 记录事件 / Record event
    this._recordEvent(symbol, mostSevere); // 调用 _recordEvent
  } // 结束代码块

  /**
   * 触发熔断
   * Trigger circuit breaker
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} anomaly - 异常信息 / Anomaly info
   * @private
   */
  async _triggerCircuitBreaker(symbol, anomaly) { // 执行语句
    const now = Date.now(); // 定义常量 now

    // 计算冷却时间 / Calculate cooldown time
    let cooldown; // 定义变量 cooldown
    switch (anomaly.level) { // 分支选择 anomaly.level
      case CIRCUIT_BREAKER_LEVEL.EMERGENCY: // 分支 CIRCUIT_BREAKER_LEVEL.EMERGENCY
        cooldown = this.config.emergencyCooldown; // 赋值 cooldown
        break; // 跳出循环或分支
      case CIRCUIT_BREAKER_LEVEL.LEVEL_3: // 分支 CIRCUIT_BREAKER_LEVEL.LEVEL_3
        cooldown = this.config.level3Cooldown; // 赋值 cooldown
        break; // 跳出循环或分支
      case CIRCUIT_BREAKER_LEVEL.LEVEL_2: // 分支 CIRCUIT_BREAKER_LEVEL.LEVEL_2
        cooldown = this.config.level2Cooldown; // 赋值 cooldown
        break; // 跳出循环或分支
      case CIRCUIT_BREAKER_LEVEL.LEVEL_1: // 分支 CIRCUIT_BREAKER_LEVEL.LEVEL_1
        cooldown = this.config.level1Cooldown; // 赋值 cooldown
        break; // 跳出循环或分支
      default: // 默认
        cooldown = 0; // 赋值 cooldown
    } // 结束代码块

    // 更新熔断状态 / Update circuit breaker state
    const previousLevel = this.circuitBreakerState.level; // 定义常量 previousLevel
    this.circuitBreakerState = { // 设置 circuitBreakerState
      level: anomaly.level, // 级别
      triggeredAt: now, // triggeredAt
      reason: anomaly.message, // reason
      eventType: anomaly.type, // 事件类型
      affectedSymbols: [symbol], // affected交易对列表
      cooldownUntil: now + cooldown, // 冷却Until
      details: anomaly.details, // details
    }; // 结束代码块

    // 重置市场稳定计时 / Reset market stability timer
    this.stabilityStartTime = null; // 设置 stabilityStartTime

    this.log(`🚨 熔断触发: ${anomaly.level} - ${anomaly.message}`, 'error'); // 调用 log

    // 发出事件 / Emit event
    this.emit('circuitBreakerTriggered', { // 调用 emit
      previousLevel, // 执行语句
      currentLevel: anomaly.level, // current级别
      symbol, // 执行语句
      anomaly, // 执行语句
      timestamp: now, // 时间戳
    }); // 结束代码块

    // 通知组合风控管理器 / Notify portfolio risk manager
    if (this.portfolioRiskManager) { // 条件判断 this.portfolioRiskManager
      this.portfolioRiskManager.emit('blackSwanEvent', { // 访问 portfolioRiskManager
        level: anomaly.level, // 级别
        type: anomaly.type, // 类型
        symbol, // 执行语句
        message: anomaly.message, // 消息
      }); // 结束代码块
    } // 结束代码块

    // 执行熔断动作 / Execute circuit breaker actions
    await this._executeCircuitBreakerActions(anomaly); // 等待异步结果
  } // 结束代码块

  /**
   * 执行熔断动作
   * Execute circuit breaker actions
   *
   * @param {Object} anomaly - 异常信息 / Anomaly info
   * @private
   */
  async _executeCircuitBreakerActions(anomaly) { // 执行语句
    if (!this.config.enableAutoEmergencyClose) { // 条件判断 !this.config.enableAutoEmergencyClose
      this.log('自动紧急平仓已禁用 / Auto emergency close disabled', 'info'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    const { level } = anomaly; // 解构赋值

    // 根据熔断级别执行不同动作 / Execute different actions based on level
    switch (level) { // 分支选择 level
      case CIRCUIT_BREAKER_LEVEL.EMERGENCY: // 分支 CIRCUIT_BREAKER_LEVEL.EMERGENCY
        // 紧急状态: 全部平仓 / Emergency: close all positions
        await this._emergencyCloseAll('黑天鹅事件紧急平仓'); // 等待异步结果
        break; // 跳出循环或分支

      case CIRCUIT_BREAKER_LEVEL.LEVEL_3: // 分支 CIRCUIT_BREAKER_LEVEL.LEVEL_3
        // 三级熔断: 可选择全部平仓 / Level 3: optionally close all
        if (this.config.emergencyCloseLevel === CIRCUIT_BREAKER_LEVEL.LEVEL_3) { // 条件判断 this.config.emergencyCloseLevel === CIRCUIT_B...
          await this._emergencyCloseAll('三级熔断紧急平仓'); // 等待异步结果
        } else { // 执行语句
          await this._partialClose(this.config.partialCloseRatioLevel2); // 等待异步结果
        } // 结束代码块
        break; // 跳出循环或分支

      case CIRCUIT_BREAKER_LEVEL.LEVEL_2: // 分支 CIRCUIT_BREAKER_LEVEL.LEVEL_2
        // 二级警告: 部分平仓 / Level 2: partial close
        await this._partialClose(this.config.partialCloseRatioLevel2); // 等待异步结果
        break; // 跳出循环或分支

      case CIRCUIT_BREAKER_LEVEL.LEVEL_1: // 分支 CIRCUIT_BREAKER_LEVEL.LEVEL_1
        // 一级警告: 少量减仓或仅警告 / Level 1: small reduction or warning only
        await this._partialClose(this.config.partialCloseRatioLevel1); // 等待异步结果
        break; // 跳出循环或分支

      default: // 默认
        break; // 跳出循环或分支
    } // 结束代码块

    // 暂停新交易 / Pause new trades
    if (this.portfolioRiskManager && level !== CIRCUIT_BREAKER_LEVEL.LEVEL_1) { // 条件判断 this.portfolioRiskManager && level !== CIRCUI...
      this.portfolioRiskManager.pauseTrading(`熔断: ${anomaly.message}`); // 访问 portfolioRiskManager
    } // 结束代码块
  } // 结束代码块

  /**
   * 紧急全部平仓
   * Emergency close all positions
   *
   * @param {string} reason - 原因 / Reason
   * @private
   */
  async _emergencyCloseAll(reason) { // 执行语句
    this.log(`🚨 执行紧急平仓: ${reason}`, 'error'); // 调用 log

    if (this.executor && typeof this.executor.emergencyCloseAll === 'function') { // 条件判断 this.executor && typeof this.executor.emergen...
      try { // 尝试执行
        await this.executor.emergencyCloseAll({ reason }); // 等待异步结果
        this.log('✓ 紧急平仓完成 / Emergency close completed', 'info'); // 调用 log
      } catch (error) { // 执行语句
        this.log(`✗ 紧急平仓失败: ${error.message}`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    this.emit('emergencyClose', { reason, timestamp: Date.now() }); // 调用 emit
  } // 结束代码块

  /**
   * 部分平仓
   * Partial close
   *
   * @param {number} ratio - 平仓比例 / Close ratio
   * @private
   */
  async _partialClose(ratio) { // 执行语句
    this.log(`📉 执行部分平仓: ${(ratio * 100).toFixed(0)}%`, 'warn'); // 调用 log

    if (this.executor && typeof this.executor.reduceAllPositions === 'function') { // 条件判断 this.executor && typeof this.executor.reduceA...
      try { // 尝试执行
        await this.executor.reduceAllPositions(ratio); // 等待异步结果
        this.log(`✓ 部分平仓完成 (${(ratio * 100).toFixed(0)}%)`, 'info'); // 调用 log
      } catch (error) { // 执行语句
        this.log(`✗ 部分平仓失败: ${error.message}`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    this.emit('partialClose', { ratio, timestamp: Date.now() }); // 调用 emit
  } // 结束代码块

  // ============================================
  // 恢复检测 / Recovery Detection
  // ============================================

  /**
   * 检查市场恢复
   * Check market recovery
   * @private
   */
  _checkRecovery() { // 调用 _checkRecovery
    // 如果不在熔断状态，无需检查 / If not in circuit breaker state, no need to check
    if (this.circuitBreakerState.level === CIRCUIT_BREAKER_LEVEL.NORMAL) { // 条件判断 this.circuitBreakerState.level === CIRCUIT_BR...
      return; // 返回结果
    } // 结束代码块

    const now = Date.now(); // 定义常量 now

    // 检查是否过了冷却期 / Check if past cooldown
    if (this.circuitBreakerState.cooldownUntil && now < this.circuitBreakerState.cooldownUntil) { // 条件判断 this.circuitBreakerState.cooldownUntil && now...
      return; // 返回结果
    } // 结束代码块

    // 检查市场是否稳定 / Check if market is stable
    const isStable = this._isMarketStable(); // 定义常量 isStable

    if (isStable) { // 条件判断 isStable
      if (!this.stabilityStartTime) { // 条件判断 !this.stabilityStartTime
        this.stabilityStartTime = now; // 设置 stabilityStartTime
        this.log('市场开始稳定 / Market starting to stabilize', 'info'); // 调用 log
      } // 结束代码块

      // 检查是否稳定足够长时间 / Check if stable long enough
      if (now - this.stabilityStartTime >= this.config.stabilityConfirmationTime) { // 条件判断 now - this.stabilityStartTime >= this.config....
        this._recoverFromCircuitBreaker(); // 调用 _recoverFromCircuitBreaker
      } // 结束代码块
    } else { // 执行语句
      // 重置稳定计时 / Reset stability timer
      this.stabilityStartTime = null; // 设置 stabilityStartTime
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查市场是否稳定
   * Check if market is stable
   *
   * @returns {boolean} 是否稳定 / Whether stable
   * @private
   */
  _isMarketStable() { // 调用 _isMarketStable
    // 检查所有受影响的交易对 / Check all affected symbols
    for (const symbol of this.circuitBreakerState.affectedSymbols) { // 循环 const symbol of this.circuitBreakerState.affe...
      const history = this.priceHistory.get(symbol); // 定义常量 history
      if (!history || history.length < 10) { // 条件判断 !history || history.length < 10
        return false; // 返回结果
      } // 结束代码块

      // 检查最近10个价格点的波动率 / Check volatility of recent 10 price points
      const recentPrices = history.slice(-10).map((h) => h.price); // 定义函数 recentPrices
      const volatility = this._calculateVolatility(recentPrices); // 定义常量 volatility

      // 如果波动率仍然较高，认为不稳定 / If volatility still high, consider unstable
      if (volatility > 0.01) { // 1%以上波动
        return false; // 返回结果
      } // 结束代码块

      // 检查点差是否恢复正常 / Check if spread returned to normal
      const baselineSpread = this.baselineSpreads.get(symbol); // 定义常量 baselineSpread
      if (baselineSpread) { // 条件判断 baselineSpread
        // 这里需要当前点差数据，暂时假设正常
      } // 结束代码块
    } // 结束代码块

    return true; // 返回结果
  } // 结束代码块

  /**
   * 从熔断状态恢复
   * Recover from circuit breaker
   * @private
   */
  _recoverFromCircuitBreaker() { // 调用 _recoverFromCircuitBreaker
    const previousLevel = this.circuitBreakerState.level; // 定义常量 previousLevel

    // 重置熔断状态 / Reset circuit breaker state
    this.circuitBreakerState = { // 设置 circuitBreakerState
      level: CIRCUIT_BREAKER_LEVEL.NORMAL, // 级别
      triggeredAt: null, // triggeredAt
      reason: null, // reason
      eventType: null, // 事件类型
      affectedSymbols: [], // affected交易对列表
      cooldownUntil: null, // 冷却Until
    }; // 结束代码块

    this.stabilityStartTime = null; // 设置 stabilityStartTime

    this.log('✓ 市场恢复正常，熔断解除 / Market recovered, circuit breaker lifted', 'info'); // 调用 log

    // 恢复交易 / Resume trading
    if (this.portfolioRiskManager) { // 条件判断 this.portfolioRiskManager
      this.portfolioRiskManager.resumeTrading(); // 访问 portfolioRiskManager
    } // 结束代码块

    // 发出事件 / Emit event
    this.emit('recovered', { // 调用 emit
      previousLevel, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 定时检查 / Periodic Check
  // ============================================

  /**
   * 执行定时检查
   * Perform periodic check
   * @private
   */
  _performCheck() { // 调用 _performCheck
    const now = Date.now(); // 定义常量 now

    // 检查价格更新超时 / Check price update timeout
    for (const [symbol, lastUpdate] of this.lastPriceUpdate) { // 循环 const [symbol, lastUpdate] of this.lastPriceU...
      if (now - lastUpdate > this.config.priceUpdateTimeout) { // 条件判断 now - lastUpdate > this.config.priceUpdateTim...
        this.log(`⚠️ ${symbol} 价格更新超时 / Price update timeout`, 'warn'); // 调用 log

        this.emit('priceUpdateTimeout', { // 调用 emit
          symbol, // 执行语句
          lastUpdate, // 执行语句
          timeout: this.config.priceUpdateTimeout, // 超时
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

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
  _recordEvent(symbol, anomaly) { // 调用 _recordEvent
    this.eventHistory.push({ // 访问 eventHistory
      symbol, // 执行语句
      ...anomaly, // 展开对象或数组
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 限制历史长度 / Limit history length
    if (this.eventHistory.length > 500) { // 条件判断 this.eventHistory.length > 500
      this.eventHistory = this.eventHistory.slice(-500); // 设置 eventHistory
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 获取当前状态
   * Get current status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      running: this.running, // running
      circuitBreakerState: { ...this.circuitBreakerState }, // circuitBreakerState
      stabilityStartTime: this.stabilityStartTime, // stability启动时间
      recentEvents: this.eventHistory.slice(-20), // recentEvents
      config: { // 配置
        priceChange1mWarning: this.config.priceChange1mWarning, // 价格Change1m警告
        priceChange5mCircuitBreaker: this.config.priceChange5mCircuitBreaker, // 价格Change5mCircuitBreaker
        volatilitySpikeMultiplier: this.config.volatilitySpikeMultiplier, // 波动率尖峰倍数
        enableAutoEmergencyClose: this.config.enableAutoEmergencyClose, // 启用自动Emergency收盘
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 手动触发熔断
   * Manual trigger circuit breaker
   *
   * @param {string} level - 熔断级别 / Circuit breaker level
   * @param {string} reason - 原因 / Reason
   */
  async manualTrigger(level, reason = '手动触发') { // 执行语句
    await this._triggerCircuitBreaker('MANUAL', { // 等待异步结果
      type: BLACK_SWAN_TYPE.EXCHANGE_ANOMALY, // 类型
      level, // 执行语句
      message: reason, // 消息
      details: { manual: true }, // details
    }); // 结束代码块
  } // 结束代码块

  /**
   * 手动恢复
   * Manual recovery
   */
  manualRecover() { // 调用 manualRecover
    this._recoverFromCircuitBreaker(); // 调用 _recoverFromCircuitBreaker
  } // 结束代码块

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') { // 调用 log
    if (!this.config.verbose && level === 'info') return; // 条件判断 !this.config.verbose && level === 'info'

    const fullMessage = `${this.config.logPrefix} ${message}`; // 定义常量 fullMessage

    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'info': // 分支 'info'
      default: // 默认
        console.log(fullMessage); // 控制台输出
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { CIRCUIT_BREAKER_LEVEL, BLACK_SWAN_TYPE, DEFAULT_CONFIG }; // 导出命名成员
export default BlackSwanProtector; // 默认导出
