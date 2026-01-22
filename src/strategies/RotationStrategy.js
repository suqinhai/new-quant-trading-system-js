/**
 * 强弱轮动策略
 * Strength Rotation Strategy (Top N / Bottom N)
 *
 * 基于多币种强弱排名的轮动策略
 * Rotation strategy based on strength ranking across multiple assets
 *
 * 策略原理 / Strategy Principle:
 * 1. 根据综合强弱指标对所有资产进行排名
 * 2. 持有最强的 Top N 资产，做空最弱的 Bottom N 资产
 * 3. 当排名发生变化时，进行轮动调仓
 * 4. 支持多种强弱指标：相对强弱(RS)、动量、波动率调整收益等
 *
 * 1. Rank all assets by comprehensive strength metrics
 * 2. Hold strongest Top N assets, short weakest Bottom N assets
 * 3. Rotate positions when rankings change
 * 4. Support various strength metrics: RS, momentum, vol-adjusted returns, etc.
 */

// 导入横截面策略基类 / Import cross-sectional base strategy
import { // 导入依赖
  CrossSectionalStrategy, // 执行语句
  CROSS_SECTIONAL_TYPES, // 执行语句
  RANK_DIRECTION, // 执行语句
  POSITION_TYPE, // 执行语句
} from './CrossSectionalStrategy.js'; // 执行语句

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 强弱指标类型
 * Strength metric types
 */
export const STRENGTH_METRICS = { // 导出常量 STRENGTH_METRICS
  RELATIVE_STRENGTH: 'relative_strength',   // RELATIVESTRENGTH
  MOMENTUM: 'momentum',                      // 动量
  RISK_ADJUSTED: 'risk_adjusted',            // 风险ADJUSTED
  TREND_STRENGTH: 'trend_strength',          // TRENDSTRENGTH
  COMPOSITE: 'composite',                    // COMPOSITE
}; // 结束代码块

/**
 * 轮动触发类型
 * Rotation trigger types
 */
export const ROTATION_TRIGGERS = { // 导出常量 ROTATION_TRIGGERS
  PERIODIC: 'periodic',           // PERIODIC
  RANK_CHANGE: 'rank_change',     // RANK修改
  THRESHOLD: 'threshold',         // 阈值
  HYBRID: 'hybrid',               // HYBRID
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  name: 'RotationStrategy', // name

  // 监控的交易对列表 / Symbols to monitor
  // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
  symbols: [ // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', // 执行语句
    'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', // 执行语句
    'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'ETC/USDT', // 执行语句
    'FIL/USDT', 'APT/USDT', 'OP/USDT', 'ARB/USDT', 'INJ/USDT', // 执行语句
  ], // 结束数组或索引

  // 基准资产 (用于计算相对强弱) / Benchmark asset
  benchmarkSymbol: 'BTC/USDT', // 基准资产 (用于计算相对强弱)

  // ============================================
  // 轮动配置 / Rotation Configuration
  // ============================================

  // 回看周期 / Lookback period
  lookbackPeriod: 14, // 回看周期

  // 短期回看 / Short-term lookback
  shortLookback: 7, // short回溯

  // 长期回看 / Long-term lookback
  longLookback: 30, // long回溯

  // 强弱指标 / Strength metric
  strengthMetric: STRENGTH_METRICS.COMPOSITE, // strength指标

  // 轮动触发类型 / Rotation trigger type
  rotationTrigger: ROTATION_TRIGGERS.HYBRID, // rotationTrigger轮动触发类型

  // ============================================
  // 选股配置 / Selection Configuration
  // ============================================

  // Top N 数量 / Top N count
  topN: 5, // Top N 数量

  // Bottom N 数量 / Bottom N count
  bottomN: 3, // Bottom N 数量

  // 排名方向 / Ranking direction
  rankDirection: RANK_DIRECTION.DESCENDING, // rankDirection

  // 最小强弱分数阈值 / Minimum strength score threshold
  minStrengthScore: 0.02, // 最小强弱分数阈值

  // 最大强弱分数阈值 (用于做空) / Max strength score threshold (for short)
  maxWeakScore: -0.02, // 最大强弱分数阈值 (用于做空)

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 仓位类型 / Position type
  positionType: POSITION_TYPE.LONG_SHORT, // 持仓类型仓位类型

  // 单个资产最大仓位 / Max position per asset
  maxPositionPerAsset: 0.12, // 单个资产最大仓位

  // 单边总仓位 / Total position per side
  maxPositionPerSide: 0.6, // 最大持仓每方向

  // 等权重 / Equal weight
  equalWeight: false, // equalWeight

  // 使用强弱加权 / Use strength-weighted
  strengthWeighted: true, // strengthWeighted

  // ============================================
  // 轮动触发配置 / Rotation Trigger Configuration
  // ============================================

  // 轮动周期 (毫秒) / Rotation period (ms)
  rebalancePeriod: 4 * 60 * 60 * 1000, // 每4小时 / Every 4 hours

  // 最小排名变化触发轮动 / Min rank change to trigger rotation
  minRankChangeToRotate: 3, // 最小排名变化触发轮动

  // 强弱分数变化阈值 / Strength score change threshold
  strengthChangeThreshold: 0.05, // 强弱分数变化阈值

  // 是否在强弱反转时立即轮动 / Rotate immediately on strength reversal
  rotateOnReversal: true, // 是否在强弱反转时立即轮动

  // ============================================
  // 缓冲区配置 / Buffer Zone Configuration
  // ============================================

  // 是否使用缓冲区 (防止频繁轮动) / Use buffer zone
  useBufferZone: true, // 是否使用缓冲区 (防止频繁轮动)

  // 缓冲区大小 (排名) / Buffer zone size (ranks)
  bufferZoneSize: 2, // 缓冲区大小 (排名)

  // 最小持仓周期 (毫秒) / Minimum holding period (ms)
  minHoldingPeriod: 24 * 60 * 60 * 1000, // 最小持仓周期 (毫秒)

  // ============================================
  // 相对强弱配置 / Relative Strength Configuration
  // ============================================

  // 是否计算相对强弱 / Calculate relative strength
  calculateRelativeStrength: true, // 是否计算相对强弱

  // RS阈值 (强势) / RS threshold (strong)
  rsStrongThreshold: 1.05, // RS阈值 (强势)

  // RS阈值 (弱势) / RS threshold (weak)
  rsWeakThreshold: 0.95, // RS阈值 (弱势)

  // ============================================
  // 趋势过滤配置 / Trend Filter Configuration
  // ============================================

  // 是否使用趋势过滤 / Use trend filter
  useTrendFilter: true, // 是否使用趋势过滤

  // 趋势判断周期 / Trend period
  trendPeriod: 20, // 趋势判断周期

  // 只在上涨趋势中做多 / Only long in uptrend
  longOnlyInUptrend: false, // 只在上涨趋势中做多

  // 只在下跌趋势中做空 / Only short in downtrend
  shortOnlyInDowntrend: false, // 只在下跌趋势中做空

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  stopLoss: 0.10, // 止损
  takeProfit: 0.25, // 止盈
  maxDrawdown: 0.15, // 最大回撤

  // 是否使用动态止损 / Use dynamic stop loss
  useDynamicStopLoss: true, // 是否使用动态止损

  // 动态止损 ATR 乘数 / Dynamic stop loss ATR multiplier
  atrStopMultiplier: 2.5, // 动态止损 ATR 乘数

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  verbose: true, // 详细日志
  logPrefix: '[Rotation]', // 日志前缀
}; // 结束代码块

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 强弱轮动策略
 * Strength Rotation Strategy
 */
export class RotationStrategy extends CrossSectionalStrategy { // 导出类 RotationStrategy
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) { // 构造函数
    // 合并配置 / Merge configuration
    const config = { ...DEFAULT_CONFIG, ...params }; // 定义常量 config

    // 调用父类构造函数 / Call parent constructor
    super(config); // 调用父类

    // 设置策略类型 / Set strategy type
    this.strategyType = CROSS_SECTIONAL_TYPES.ROTATION; // 设置 strategyType

    // 强弱分数历史 / Strength score history
    this.strengthHistory = new Map(); // 设置 strengthHistory

    // 相对强弱缓存 / Relative strength cache
    this.relativeStrength = new Map(); // 设置 relativeStrength

    // 入场时间记录 / Entry time records
    this.entryTimes = new Map(); // 设置 entryTimes

    // 上次轮动时间 / Last rotation time
    this.lastRotationTime = 0; // 设置 lastRotationTime

    // 轮动历史 / Rotation history
    this.rotationHistory = []; // 设置 rotationHistory

    // ATR 缓存 / ATR cache
    this.atrCache = new Map(); // 设置 atrCache
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 轮动策略只需要 K 线数据 / Rotation strategy only needs kline
    return ['kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化策略
   * Initialize strategy
   */
  async onInit() { // 执行语句
    this.log('强弱轮动策略初始化', 'info'); // 调用 log
    this.log(`强弱指标: ${this.config.strengthMetric}`, 'info'); // 调用 log
    this.log(`轮动触发: ${this.config.rotationTrigger}`, 'info'); // 调用 log
    this.log(`Top N: ${this.config.topN}, Bottom N: ${this.config.bottomN}`, 'info'); // 调用 log

    // 调用父类初始化 / Call parent init
    await super.onInit(); // 等待异步结果
  } // 结束代码块

  /**
   * 计算强弱分数
   * Calculate strength score
   *
   * @param {Object} metrics - 资产指标 / Asset metrics
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 强弱分数 / Strength score
   */
  calculateStrengthScore(metrics, symbol) { // 调用 calculateStrengthScore
    if (!metrics) return 0; // 条件判断 !metrics

    switch (this.config.strengthMetric) { // 分支选择 this.config.strengthMetric
      case STRENGTH_METRICS.RELATIVE_STRENGTH: // 分支 STRENGTH_METRICS.RELATIVE_STRENGTH
        return this._calculateRelativeStrength(symbol); // 返回结果

      case STRENGTH_METRICS.MOMENTUM: // 分支 STRENGTH_METRICS.MOMENTUM
        return metrics.momentum || 0; // 返回结果

      case STRENGTH_METRICS.RISK_ADJUSTED: // 分支 STRENGTH_METRICS.RISK_ADJUSTED
        return metrics.sharpe || 0; // 返回结果

      case STRENGTH_METRICS.TREND_STRENGTH: // 分支 STRENGTH_METRICS.TREND_STRENGTH
        return this._calculateTrendStrength(metrics); // 返回结果

      case STRENGTH_METRICS.COMPOSITE: // 分支 STRENGTH_METRICS.COMPOSITE
      default: // 默认
        return this._calculateCompositeStrength(metrics, symbol); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算相对强弱
   * Calculate relative strength
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 相对强弱值 / Relative strength value
   * @private
   */
  _calculateRelativeStrength(symbol) { // 调用 _calculateRelativeStrength
    // 获取资产和基准的指标 / Get metrics for asset and benchmark
    const assetMetrics = this.assetManager.getMetrics(symbol); // 定义常量 assetMetrics
    const benchmarkMetrics = this.assetManager.getMetrics(this.config.benchmarkSymbol); // 定义常量 benchmarkMetrics

    if (!assetMetrics || !benchmarkMetrics) { // 条件判断 !assetMetrics || !benchmarkMetrics
      return 0; // 返回结果
    } // 结束代码块

    // 计算相对强弱: 资产收益 / 基准收益
    // Calculate RS: asset return / benchmark return
    const assetReturn = assetMetrics.returns || 0; // 定义常量 assetReturn
    const benchmarkReturn = benchmarkMetrics.returns || 0; // 定义常量 benchmarkReturn

    // 避免除以零 / Avoid division by zero
    if (Math.abs(benchmarkReturn) < 0.0001) { // 条件判断 Math.abs(benchmarkReturn) < 0.0001
      return assetReturn > 0 ? 1.1 : (assetReturn < 0 ? 0.9 : 1.0); // 返回结果
    } // 结束代码块

    // RS = (1 + asset_return) / (1 + benchmark_return)
    const rs = (1 + assetReturn) / (1 + benchmarkReturn); // 定义常量 rs

    // 保存到缓存 / Save to cache
    this.relativeStrength.set(symbol, rs); // 访问 relativeStrength

    return rs - 1; // 转换为超额收益 / Convert to excess return
  } // 结束代码块

  /**
   * 计算趋势强度
   * Calculate trend strength
   *
   * @param {Object} metrics - 资产指标 / Asset metrics
   * @returns {number} 趋势强度 / Trend strength
   * @private
   */
  _calculateTrendStrength(metrics) { // 调用 _calculateTrendStrength
    if (!metrics) return 0; // 条件判断 !metrics

    // 综合动量和波动率 / Combine momentum and volatility
    const momentum = metrics.momentum || 0; // 定义常量 momentum
    const volatility = metrics.volatility || 0.01; // 定义常量 volatility

    // 趋势强度 = 动量 / 波动率 (信噪比)
    // Trend strength = momentum / volatility (SNR)
    return momentum / volatility; // 返回结果
  } // 结束代码块

  /**
   * 计算复合强弱分数
   * Calculate composite strength score
   *
   * @param {Object} metrics - 资产指标 / Asset metrics
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 复合强弱分数 / Composite strength score
   * @private
   */
  _calculateCompositeStrength(metrics, symbol) { // 调用 _calculateCompositeStrength
    if (!metrics) return 0; // 条件判断 !metrics

    // 各项指标 / Individual metrics
    const momentum = metrics.momentum || 0; // 定义常量 momentum
    const returns = metrics.returns || 0; // 定义常量 returns
    const sharpe = metrics.sharpe || 0; // 定义常量 sharpe
    const rs = this._calculateRelativeStrength(symbol); // 定义常量 rs
    const trendStrength = this._calculateTrendStrength(metrics); // 定义常量 trendStrength

    // RSI 调整因子 / RSI adjustment factor
    const rsi = metrics.rsi || 50; // 定义常量 rsi
    const rsiAdjust = rsi > 70 ? 0.9 : (rsi < 30 ? 1.1 : 1.0); // 定义常量 rsiAdjust

    // 复合分数 / Composite score
    const compositeScore = ( // 定义常量 compositeScore
      momentum * 0.25 + // 执行语句
      returns * 0.20 + // 执行语句
      sharpe * 0.20 + // 执行语句
      rs * 0.20 + // 执行语句
      trendStrength * 0.15 // 执行语句
    ) * rsiAdjust; // 执行语句

    return compositeScore; // 返回结果
  } // 结束代码块

  /**
   * 计算 ATR
   * Calculate ATR
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} ATR值 / ATR value
   * @private
   */
  _calculateATR(symbol) { // 调用 _calculateATR
    const history = this.assetManager.getHistory(symbol); // 定义常量 history
    if (history.length < 14) return 0; // 条件判断 history.length < 14

    const period = 14; // 定义常量 period
    const recent = history.slice(-period); // 定义常量 recent
    let atrSum = 0; // 定义变量 atrSum

    for (let i = 1; i < recent.length; i++) { // 循环 let i = 1; i < recent.length; i++
      const high = recent[i].high; // 定义常量 high
      const low = recent[i].low; // 定义常量 low
      const prevClose = recent[i - 1].close; // 定义常量 prevClose

      const tr = Math.max( // 定义常量 tr
        high - low, // 执行语句
        Math.abs(high - prevClose), // 调用 Math.abs
        Math.abs(low - prevClose) // 调用 Math.abs
      ); // 结束调用或参数
      atrSum += tr; // 执行语句
    } // 结束代码块

    const atr = atrSum / (period - 1); // 定义常量 atr
    this.atrCache.set(symbol, atr); // 访问 atrCache
    return atr; // 返回结果
  } // 结束代码块

  /**
   * 获取排名 (覆盖父类)
   * Get ranking (override parent)
   *
   * @returns {Array} 排名列表 / Ranking list
   */
  getCurrentRanking() { // 调用 getCurrentRanking
    const ranking = []; // 定义常量 ranking

    for (const symbol of this.config.symbols) { // 循环 const symbol of this.config.symbols
      const metrics = this.assetManager.getMetrics(symbol); // 定义常量 metrics
      if (!metrics) continue; // 条件判断 !metrics

      // 计算强弱分数 / Calculate strength score
      const strengthScore = this.calculateStrengthScore(metrics, symbol); // 定义常量 strengthScore

      // 趋势过滤 / Trend filter
      if (this.config.useTrendFilter) { // 条件判断 this.config.useTrendFilter
        const trend = this._detectTrend(symbol); // 定义常量 trend

        // 如果只在上涨趋势做多，跳过非上涨资产
        // If long only in uptrend, skip non-uptrending assets
        if (this.config.longOnlyInUptrend && trend <= 0 && strengthScore > 0) { // 条件判断 this.config.longOnlyInUptrend && trend <= 0 &...
          continue; // 继续下一轮循环
        } // 结束代码块

        // 如果只在下跌趋势做空，跳过非下跌资产
        // If short only in downtrend, skip non-downtrending assets
        if (this.config.shortOnlyInDowntrend && trend >= 0 && strengthScore < 0) { // 条件判断 this.config.shortOnlyInDowntrend && trend >= ...
          continue; // 继续下一轮循环
        } // 结束代码块
      } // 结束代码块

      // 记录强弱历史 / Record strength history
      this._recordStrengthHistory(symbol, strengthScore); // 调用 _recordStrengthHistory

      ranking.push({ // 调用 ranking.push
        symbol, // 执行语句
        value: strengthScore, // value
        metrics, // 执行语句
        relativeStrength: this.relativeStrength.get(symbol) || 1, // relativeStrength
        atr: this._calculateATR(symbol), // ATR
      }); // 结束代码块
    } // 结束代码块

    // 排序 / Sort
    ranking.sort((a, b) => { // 调用 ranking.sort
      if (this.config.rankDirection === RANK_DIRECTION.DESCENDING) { // 条件判断 this.config.rankDirection === RANK_DIRECTION....
        return b.value - a.value; // 返回结果
      } // 结束代码块
      return a.value - b.value; // 返回结果
    }); // 结束代码块

    // 添加排名 / Add rank
    ranking.forEach((item, index) => { // 调用 ranking.forEach
      item.rank = index + 1; // 赋值 item.rank
    }); // 结束代码块

    return ranking; // 返回结果
  } // 结束代码块

  /**
   * 检测趋势
   * Detect trend
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 趋势 (1=上涨, -1=下跌, 0=震荡) / Trend
   * @private
   */
  _detectTrend(symbol) { // 调用 _detectTrend
    const history = this.assetManager.getHistory(symbol); // 定义常量 history
    if (history.length < this.config.trendPeriod) return 0; // 条件判断 history.length < this.config.trendPeriod

    const recent = history.slice(-this.config.trendPeriod); // 定义常量 recent
    const firstPrice = recent[0].close; // 定义常量 firstPrice
    const lastPrice = recent[recent.length - 1].close; // 定义常量 lastPrice

    // 计算趋势斜率 / Calculate trend slope
    const slope = (lastPrice - firstPrice) / firstPrice; // 定义常量 slope

    // 计算SMA / Calculate SMA
    const smaSum = recent.reduce((sum, c) => sum + c.close, 0); // 定义函数 smaSum
    const sma = smaSum / recent.length; // 定义常量 sma

    // 综合判断 / Combined judgment
    if (lastPrice > sma && slope > 0.02) return 1;  // 上涨
    if (lastPrice < sma && slope < -0.02) return -1; // 下跌
    return 0; // 震荡
  } // 结束代码块

  /**
   * 记录强弱历史
   * Record strength history
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} score - 强弱分数 / Strength score
   * @private
   */
  _recordStrengthHistory(symbol, score) { // 调用 _recordStrengthHistory
    if (!this.strengthHistory.has(symbol)) { // 条件判断 !this.strengthHistory.has(symbol)
      this.strengthHistory.set(symbol, []); // 访问 strengthHistory
    } // 结束代码块

    const history = this.strengthHistory.get(symbol); // 定义常量 history
    history.push({ // 调用 history.push
      score, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 保留最近 30 条 / Keep last 30 records
    if (history.length > 30) { // 条件判断 history.length > 30
      history.shift(); // 调用 history.shift
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查是否应该轮动
   * Check if should rotate
   *
   * @param {Array} ranking - 当前排名 / Current ranking
   * @returns {boolean} 是否轮动 / Whether to rotate
   * @private
   */
  _shouldRotate(ranking) { // 调用 _shouldRotate
    const now = Date.now(); // 定义常量 now

    switch (this.config.rotationTrigger) { // 分支选择 this.config.rotationTrigger
      case ROTATION_TRIGGERS.PERIODIC: // 分支 ROTATION_TRIGGERS.PERIODIC
        return now - this.lastRotationTime >= this.config.rebalancePeriod; // 返回结果

      case ROTATION_TRIGGERS.RANK_CHANGE: // 分支 ROTATION_TRIGGERS.RANK_CHANGE
        return this._checkSignificantRankChange(ranking); // 返回结果

      case ROTATION_TRIGGERS.THRESHOLD: // 分支 ROTATION_TRIGGERS.THRESHOLD
        return this._checkStrengthThreshold(ranking); // 返回结果

      case ROTATION_TRIGGERS.HYBRID: // 分支 ROTATION_TRIGGERS.HYBRID
      default: // 默认
        // 满足周期条件，或者排名/强弱变化显著
        // Meet period condition, or significant rank/strength change
        const periodicTrigger = now - this.lastRotationTime >= this.config.rebalancePeriod; // 定义常量 periodicTrigger
        const rankChangeTrigger = this._checkSignificantRankChange(ranking); // 定义常量 rankChangeTrigger
        const thresholdTrigger = this._checkStrengthThreshold(ranking); // 定义常量 thresholdTrigger

        return periodicTrigger || (rankChangeTrigger && thresholdTrigger); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查显著排名变化
   * Check significant rank change
   *
   * @param {Array} ranking - 当前排名 / Current ranking
   * @returns {boolean} 是否有显著变化 / Whether significant change
   * @private
   */
  _checkSignificantRankChange(ranking) { // 调用 _checkSignificantRankChange
    // 检查当前持仓的排名变化 / Check rank changes for current positions
    for (const [symbol, position] of this.portfolioManager.currentPositions) { // 循环 const [symbol, position] of this.portfolioMan...
      const rankingItem = ranking.find(r => r.symbol === symbol); // 定义函数 rankingItem
      if (!rankingItem) continue; // 条件判断 !rankingItem

      // 检查缓冲区 / Check buffer zone
      if (this.config.useBufferZone) { // 条件判断 this.config.useBufferZone
        if (position.side === 'long') { // 条件判断 position.side === 'long'
          // 多头：如果排名下降超出 topN + buffer，触发轮动
          // Long: if rank drops below topN + buffer, trigger rotation
          if (rankingItem.rank > this.config.topN + this.config.bufferZoneSize) { // 条件判断 rankingItem.rank > this.config.topN + this.co...
            return true; // 返回结果
          } // 结束代码块
        } else { // 执行语句
          // 空头：如果排名上升超出 bottomN + buffer，触发轮动
          // Short: if rank rises above bottomN + buffer, trigger rotation
          const bottomThreshold = ranking.length - this.config.bottomN - this.config.bufferZoneSize; // 定义常量 bottomThreshold
          if (rankingItem.rank < bottomThreshold) { // 条件判断 rankingItem.rank < bottomThreshold
            return true; // 返回结果
          } // 结束代码块
        } // 结束代码块
      } else { // 执行语句
        // 无缓冲区：严格按 topN/bottomN
        // No buffer: strict topN/bottomN
        if (position.side === 'long' && rankingItem.rank > this.config.topN) { // 条件判断 position.side === 'long' && rankingItem.rank ...
          return true; // 返回结果
        } // 结束代码块
        if (position.side === 'short') { // 条件判断 position.side === 'short'
          const bottomThreshold = ranking.length - this.config.bottomN; // 定义常量 bottomThreshold
          if (rankingItem.rank < bottomThreshold) { // 条件判断 rankingItem.rank < bottomThreshold
            return true; // 返回结果
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return false; // 返回结果
  } // 结束代码块

  /**
   * 检查强弱阈值
   * Check strength threshold
   *
   * @param {Array} ranking - 当前排名 / Current ranking
   * @returns {boolean} 是否触发 / Whether triggered
   * @private
   */
  _checkStrengthThreshold(ranking) { // 调用 _checkStrengthThreshold
    // 检查当前持仓的强弱分数变化 / Check strength score changes for current positions
    for (const [symbol, position] of this.portfolioManager.currentPositions) { // 循环 const [symbol, position] of this.portfolioMan...
      const history = this.strengthHistory.get(symbol); // 定义常量 history
      if (!history || history.length < 2) continue; // 条件判断 !history || history.length < 2

      const currentScore = history[history.length - 1].score; // 定义常量 currentScore
      const prevScore = history[history.length - 2].score; // 定义常量 prevScore
      const change = currentScore - prevScore; // 定义常量 change

      // 检查强弱反转 / Check strength reversal
      if (this.config.rotateOnReversal) { // 条件判断 this.config.rotateOnReversal
        if (position.side === 'long' && currentScore < this.config.maxWeakScore) { // 条件判断 position.side === 'long' && currentScore < th...
          this.log(`${symbol} 强弱反转: ${prevScore.toFixed(4)} -> ${currentScore.toFixed(4)}`, 'warn'); // 调用 log
          return true; // 返回结果
        } // 结束代码块
        if (position.side === 'short' && currentScore > this.config.minStrengthScore) { // 条件判断 position.side === 'short' && currentScore > t...
          this.log(`${symbol} 强弱反转: ${prevScore.toFixed(4)} -> ${currentScore.toFixed(4)}`, 'warn'); // 调用 log
          return true; // 返回结果
        } // 结束代码块
      } // 结束代码块

      // 检查强弱变化阈值 / Check strength change threshold
      if (Math.abs(change) >= this.config.strengthChangeThreshold) { // 条件判断 Math.abs(change) >= this.config.strengthChang...
        return true; // 返回结果
      } // 结束代码块
    } // 结束代码块

    return false; // 返回结果
  } // 结束代码块

  /**
   * 选择资产 (覆盖父类)
   * Select assets (override parent)
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Object} 做多和做空资产 / Long and short assets
   */
  _selectAssets(ranking) { // 调用 _selectAssets
    let longAssets = []; // 定义变量 longAssets
    let shortAssets = []; // 定义变量 shortAssets

    // 选择做多资产 (Top N, 且强弱分数 > 最小阈值)
    // Select long assets (Top N, and strength score > min threshold)
    if (this.config.positionType !== POSITION_TYPE.SHORT_ONLY) { // 条件判断 this.config.positionType !== POSITION_TYPE.SH...
      const topCandidates = ranking.slice(0, this.config.topN); // 定义常量 topCandidates

      for (const candidate of topCandidates) { // 循环 const candidate of topCandidates
        // 检查强弱阈值 / Check strength threshold
        if (candidate.value >= this.config.minStrengthScore) { // 条件判断 candidate.value >= this.config.minStrengthScore
          // 检查最小持仓周期 / Check min holding period
          if (!this._canClose(candidate.symbol)) { // 条件判断 !this._canClose(candidate.symbol)
            // 如果还在最小持仓周期内，保持现有仓位
            // If still in min holding period, keep existing position
            const existing = this.portfolioManager.currentPositions.get(candidate.symbol); // 定义常量 existing
            if (existing && existing.side === 'long') { // 条件判断 existing && existing.side === 'long'
              longAssets.push(candidate); // 调用 longAssets.push
              continue; // 继续下一轮循环
            } // 结束代码块
          } // 结束代码块

          longAssets.push(candidate); // 调用 longAssets.push
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 选择做空资产 (Bottom N, 且强弱分数 < 最大阈值)
    // Select short assets (Bottom N, and strength score < max threshold)
    if (this.config.positionType !== POSITION_TYPE.LONG_ONLY) { // 条件判断 this.config.positionType !== POSITION_TYPE.LO...
      const bottomCandidates = ranking.slice(-this.config.bottomN); // 定义常量 bottomCandidates

      for (const candidate of bottomCandidates) { // 循环 const candidate of bottomCandidates
        // 检查强弱阈值 / Check strength threshold
        if (candidate.value <= this.config.maxWeakScore) { // 条件判断 candidate.value <= this.config.maxWeakScore
          // 检查最小持仓周期 / Check min holding period
          if (!this._canClose(candidate.symbol)) { // 条件判断 !this._canClose(candidate.symbol)
            const existing = this.portfolioManager.currentPositions.get(candidate.symbol); // 定义常量 existing
            if (existing && existing.side === 'short') { // 条件判断 existing && existing.side === 'short'
              shortAssets.push(candidate); // 调用 shortAssets.push
              continue; // 继续下一轮循环
            } // 结束代码块
          } // 结束代码块

          shortAssets.push(candidate); // 调用 shortAssets.push
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 强弱加权 / Strength weighting
    if (this.config.strengthWeighted) { // 条件判断 this.config.strengthWeighted
      longAssets = this._applyStrengthWeighting(longAssets, 'long'); // 赋值 longAssets
      shortAssets = this._applyStrengthWeighting(shortAssets, 'short'); // 赋值 shortAssets
    } // 结束代码块

    return { longAssets, shortAssets }; // 返回结果
  } // 结束代码块

  /**
   * 检查是否可以平仓
   * Check if can close
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {boolean} 是否可以平仓 / Whether can close
   * @private
   */
  _canClose(symbol) { // 调用 _canClose
    const entryTime = this.entryTimes.get(symbol); // 定义常量 entryTime
    if (!entryTime) return true; // 条件判断 !entryTime

    return Date.now() - entryTime >= this.config.minHoldingPeriod; // 返回结果
  } // 结束代码块

  /**
   * 应用强弱加权
   * Apply strength weighting
   *
   * @param {Array} assets - 资产列表 / Asset list
   * @param {string} side - 方向 / Side
   * @returns {Array} 加权后的资产 / Weighted assets
   * @private
   */
  _applyStrengthWeighting(assets, side) { // 调用 _applyStrengthWeighting
    if (assets.length === 0) return assets; // 条件判断 assets.length === 0

    // 计算强弱分数的绝对值之和 / Calculate sum of absolute strength scores
    const totalStrength = assets.reduce((sum, a) => sum + Math.abs(a.value), 0); // 定义函数 totalStrength
    if (totalStrength === 0) return assets; // 条件判断 totalStrength === 0

    // 按强弱分数分配权重 / Allocate weights by strength score
    return assets.map(a => { // 返回结果
      const strengthWeight = Math.abs(a.value) / totalStrength; // 定义常量 strengthWeight
      const baseWeight = this.config.maxPositionPerSide / assets.length; // 定义常量 baseWeight

      // 混合等权重和强弱加权 / Mix equal weight and strength weight
      const weight = baseWeight * 0.5 + strengthWeight * this.config.maxPositionPerSide * 0.5; // 定义常量 weight

      return { // 返回结果
        ...a, // 展开对象或数组
        weight: Math.min(weight, this.config.maxPositionPerAsset), // weight
      }; // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 执行再平衡 (覆盖父类)
   * Execute rebalancing (override parent)
   * @private
   */
  async _executeRebalance() { // 执行语句
    // 获取排名 / Get ranking
    const ranking = this.getCurrentRanking(); // 定义常量 ranking

    // 检查是否应该轮动 / Check if should rotate
    if (!this._shouldRotate(ranking)) { // 条件判断 !this._shouldRotate(ranking)
      if (this.config.verbose) { // 条件判断 this.config.verbose
        this.log('未触发轮动条件', 'debug'); // 调用 log
      } // 结束代码块
      return; // 返回结果
    } // 结束代码块

    // 记录轮动 / Record rotation
    this.lastRotationTime = Date.now(); // 设置 lastRotationTime
    this.rotationHistory.push({ // 访问 rotationHistory
      timestamp: this.lastRotationTime, // 时间戳
      ranking: ranking.slice(0, 10).map(r => ({ symbol: r.symbol, rank: r.rank, score: r.value })), // ranking
    }); // 结束代码块

    // 调用父类执行再平衡 / Call parent to execute rebalance
    await super._executeRebalance(); // 等待异步结果

    this.log(`轮动完成，时间: ${new Date().toISOString()}`, 'info'); // 调用 log
  } // 结束代码块

  /**
   * 开仓 (覆盖父类)
   * Open position (override parent)
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} target - 目标仓位 / Target position
   * @private
   */
  async _openPosition(symbol, target) { // 执行语句
    // 记录入场时间 / Record entry time
    this.entryTimes.set(symbol, Date.now()); // 访问 entryTimes

    // 如果使用动态止损，计算止损价格 / If using dynamic stop, calculate stop price
    if (this.config.useDynamicStopLoss) { // 条件判断 this.config.useDynamicStopLoss
      const atr = this.atrCache.get(symbol) || 0; // 定义常量 atr
      const metrics = this.assetManager.getMetrics(symbol); // 定义常量 metrics
      if (metrics && atr > 0) { // 条件判断 metrics && atr > 0
        const dynamicStop = atr * this.config.atrStopMultiplier / metrics.latestPrice; // 定义常量 dynamicStop
        this.log(`${symbol} 动态止损: ${(dynamicStop * 100).toFixed(2)}%`, 'info'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 调用父类方法 / Call parent method
    await super._openPosition(symbol, target); // 等待异步结果
  } // 结束代码块

  /**
   * 平仓 (覆盖父类)
   * Close position (override parent)
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} reason - 原因 / Reason
   * @private
   */
  async _closePosition(symbol, reason) { // 执行语句
    // 清除记录 / Clear records
    this.entryTimes.delete(symbol); // 访问 entryTimes

    // 调用父类方法 / Call parent method
    await super._closePosition(symbol, reason); // 等待异步结果
  } // 结束代码块

  /**
   * 获取策略状态 (覆盖父类)
   * Get strategy status (override parent)
   *
   * @returns {Object} 策略状态 / Strategy status
   */
  getStatus() { // 调用 getStatus
    const baseStatus = super.getStatus(); // 定义常量 baseStatus

    return { // 返回结果
      ...baseStatus, // 展开对象或数组
      strengthMetric: this.config.strengthMetric, // strength指标
      rotationTrigger: this.config.rotationTrigger, // rotationTrigger
      lastRotationTime: this.lastRotationTime, // lastRotation时间
      rotationCount: this.rotationHistory.length, // rotation数量
      relativeStrength: Object.fromEntries(this.relativeStrength), // relativeStrength
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取轮动历史
   * Get rotation history
   *
   * @returns {Array} 轮动历史 / Rotation history
   */
  getRotationHistory() { // 调用 getRotationHistory
    return this.rotationHistory; // 返回结果
  } // 结束代码块

  /**
   * 获取强弱排名详情
   * Get strength ranking details
   *
   * @returns {Array} 排名详情 / Ranking details
   */
  getStrengthRankingDetails() { // 调用 getStrengthRankingDetails
    const ranking = this.getCurrentRanking(); // 定义常量 ranking

    return ranking.map(item => ({ // 返回结果
      symbol: item.symbol, // 交易对
      rank: item.rank, // rank
      strengthScore: item.value, // strength分数
      relativeStrength: this.relativeStrength.get(item.symbol) || 1, // relativeStrength
      isStrong: item.value >= this.config.minStrengthScore, // 是否Strong
      isWeak: item.value <= this.config.maxWeakScore, // 是否Weak
      inTopN: item.rank <= this.config.topN, // 在TopN
      inBottomN: item.rank > ranking.length - this.config.bottomN, // 在BottomN
    })); // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { // 导出命名成员
  DEFAULT_CONFIG as ROTATION_DEFAULT_CONFIG, // 执行语句
}; // 结束代码块

export default RotationStrategy; // 默认导出
