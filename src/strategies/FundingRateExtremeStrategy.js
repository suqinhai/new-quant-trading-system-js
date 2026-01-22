/**
 * 资金费率极值横截面策略
 * Funding Rate Extreme Cross-Sectional Strategy
 *
 * 跨多币种的资金费率极值对冲策略
 * Cross-sectional strategy exploiting extreme funding rates across multiple assets
 *
 * 策略原理 / Strategy Principle:
 * 1. 监控多个币种的资金费率
 * 2. 识别资金费率处于极值的币种 (极高或极低)
 * 3. 做空高费率币种 (收取资金费)，做多低费率币种 (支付较少资金费)
 * 4. 利用费率均值回归特性获利
 *
 * 1. Monitor funding rates across multiple assets
 * 2. Identify assets with extreme funding rates (very high or very low)
 * 3. Short high-rate assets (receive funding), long low-rate assets (pay less)
 * 4. Profit from funding rate mean reversion
 */

// 导入横截面策略基类 / Import cross-sectional base strategy
import { // 导入依赖
  CrossSectionalStrategy, // 执行语句
  CROSS_SECTIONAL_TYPES, // 执行语句
  RANK_DIRECTION, // 执行语句
  POSITION_TYPE, // 执行语句
} from './CrossSectionalStrategy.js'; // 执行语句

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 资金费率结算频率
 * Funding rate settlement frequency
 */
export const FUNDING_FREQUENCY = { // 导出常量 FUNDING_FREQUENCY
  HOURLY: 'hourly',       // HOURLY
  EIGHT_HOURLY: '8h',     // EIGHTHOURLY
  FOUR_HOURLY: '4h',      // FOURHOURLY
}; // 结束代码块

/**
 * 极值判断方法
 * Extreme value detection method
 */
export const EXTREME_DETECTION = { // 导出常量 EXTREME_DETECTION
  PERCENTILE: 'percentile',       // PERCENTILE
  Z_SCORE: 'z_score',             // Z分数
  ABSOLUTE: 'absolute',           // ABSOLUTE
  HISTORICAL: 'historical',       // HISTORICAL
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  name: 'FundingRateExtremeStrategy', // name

  // 监控的永续合约交易对 / Perpetual swap symbols to monitor
  symbols: [ // 监控的永续合约交易对
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', // 执行语句
    'XRP/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', // 执行语句
    'DOT/USDT', 'MATIC/USDT', 'LINK/USDT', 'UNI/USDT', // 执行语句
    'ATOM/USDT', 'LTC/USDT', 'ETC/USDT', 'OP/USDT', // 执行语句
    'ARB/USDT', 'APT/USDT', 'INJ/USDT', 'FIL/USDT', // 执行语句
  ], // 结束数组或索引

  // 资金费率结算频率 / Funding settlement frequency
  fundingFrequency: FUNDING_FREQUENCY.EIGHT_HOURLY, // 资金费率结算频率

  // ============================================
  // 极值检测配置 / Extreme Detection Configuration
  // ============================================

  // 极值检测方法 / Extreme detection method
  extremeDetection: EXTREME_DETECTION.PERCENTILE, // 极端Detection

  // 高费率阈值 (百分位) / High rate threshold (percentile)
  highRatePercentile: 90, // 高费率阈值 (百分位)

  // 低费率阈值 (百分位) / Low rate threshold (percentile)
  lowRatePercentile: 10, // 低费率阈值 (百分位)

  // 绝对值阈值 (年化) / Absolute threshold (annualized)
  absoluteHighThreshold: 0.50,   // 绝对值阈值 (年化)
  absoluteLowThreshold: -0.20,   // absolute最低阈值

  // Z分数阈值 / Z-score threshold
  zScoreThreshold: 2.0, // Z分数阈值

  // 历史回看周期 (天) / Historical lookback (days)
  historicalLookback: 30, // 历史回看周期 (天)

  // ============================================
  // 排名配置 / Ranking Configuration
  // ============================================

  // 选取高费率 Top N 做空 / Select top N high rates for short
  topN: 3, // 选取高费率 Top N 做空

  // 选取低费率 Bottom N 做多 / Select bottom N low rates for long
  bottomN: 3, // 选取低费率 Bottom N 做多

  // 最小年化费率利差 / Minimum annualized rate spread
  minAnnualizedSpread: 0.20,  // 最小年化费率利差

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 仓位类型 / Position type
  positionType: POSITION_TYPE.LONG_SHORT, // 持仓类型仓位类型

  // 单个资产最大仓位 / Max position per asset
  maxPositionPerAsset: 0.10, // 单个资产最大仓位

  // 单边总仓位 / Total position per side
  maxPositionPerSide: 0.40, // 最大持仓每方向

  // 杠杆倍数 / Leverage
  leverage: 3, // 杠杆

  // 市场中性 (多空等量) / Market neutral
  marketNeutral: true, // 市场中性 (多空等量)

  // ============================================
  // 持仓配置 / Holding Configuration
  // ============================================

  // 目标持仓周期 (小时) / Target holding period (hours)
  targetHoldingHours: 8, // 目标持仓周期 (小时)

  // 最大持仓周期 (小时) / Max holding period (hours)
  maxHoldingHours: 72, // 最大持仓周期 (小时)

  // 最小持仓周期 (小时) / Min holding period (hours)
  minHoldingHours: 4, // 最小持仓周期 (小时)

  // ============================================
  // 再平衡配置 / Rebalancing Configuration
  // ============================================

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 1 * 60 * 60 * 1000, // 每小时 / Every hour

  // 费率刷新间隔 (毫秒) / Rate refresh interval (ms)
  rateRefreshInterval: 60 * 1000,  // 费率刷新间隔 (毫秒)

  // ============================================
  // 平仓条件 / Close Conditions
  // ============================================

  // 费率回归阈值 (相对于入场时) / Rate reversion threshold
  rateReversionThreshold: 0.50,  // 费率回归阈值 (相对于入场时)

  // 费率反转阈值 / Rate reversal threshold
  rateReversalThreshold: -0.10,  // 费率反转阈值

  // 价格止损 / Price stop loss
  priceStopLoss: 0.05, // 价格止损

  // 综合止损 (价格损失 - 费率收益) / Combined stop loss
  combinedStopLoss: 0.03, // 综合止损 (价格损失 - 费率收益)

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 最大单日费率损失 / Max daily funding loss
  maxDailyFundingLoss: 0.005,  // 最大单日费率损失

  // 最大净敞口 / Max net exposure
  maxNetExposure: 0.10, // 最大NetExposure

  // 最大相关性 / Max correlation between positions
  maxCorrelation: 0.8, // 最大Correlation

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  verbose: true, // 详细日志
  logPrefix: '[FundingExtreme]', // 日志前缀
}; // 结束代码块

/**
 * 年化倍数
 * Annualization multiplier
 */
const ANNUALIZATION_MULTIPLIERS = { // 定义常量 ANNUALIZATION_MULTIPLIERS
  [FUNDING_FREQUENCY.HOURLY]: 24 * 365, // 执行语句
  [FUNDING_FREQUENCY.EIGHT_HOURLY]: 3 * 365, // 执行语句
  [FUNDING_FREQUENCY.FOUR_HOURLY]: 6 * 365, // 执行语句
}; // 结束代码块

// ============================================
// 辅助类 / Helper Classes
// ============================================

/**
 * 资金费率数据管理器
 * Funding Rate Data Manager
 */
export class FundingRateDataManager extends EventEmitter { // 导出类 FundingRateDataManager
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Configuration
   */
  constructor(config) { // 构造函数
    super(); // 调用父类

    this.config = config; // 设置 config

    // 当前费率 / Current rates
    // 格式: { symbol: { rate, predictedRate, timestamp, exchange } }
    this.currentRates = new Map(); // 设置 currentRates

    // 历史费率 / Historical rates
    // 格式: { symbol: [{ rate, timestamp }, ...] }
    this.rateHistory = new Map(); // 设置 rateHistory

    // 费率统计 / Rate statistics
    this.rateStats = new Map(); // 设置 rateStats
  } // 结束代码块

  /**
   * 更新资金费率
   * Update funding rate
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} rateData - 费率数据 / Rate data
   */
  updateRate(symbol, rateData) { // 调用 updateRate
    // 保存当前费率 / Save current rate
    this.currentRates.set(symbol, { // 访问 currentRates
      rate: rateData.fundingRate || 0, // 频率
      predictedRate: rateData.fundingRatePredicted || rateData.fundingRate || 0, // predicted频率
      nextFundingTime: rateData.fundingTimestamp || 0, // next资金费率时间
      markPrice: rateData.markPrice || 0, // mark价格
      indexPrice: rateData.indexPrice || 0, // index价格
      timestamp: Date.now(), // 时间戳
      exchange: rateData.exchange || 'unknown', // 交易所
    }); // 结束代码块

    // 记录到历史 / Record to history
    if (!this.rateHistory.has(symbol)) { // 条件判断 !this.rateHistory.has(symbol)
      this.rateHistory.set(symbol, []); // 访问 rateHistory
    } // 结束代码块

    const history = this.rateHistory.get(symbol); // 定义常量 history
    history.push({ // 调用 history.push
      rate: rateData.fundingRate || 0, // 频率
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 保留最近7天的数据 / Keep last 7 days of data
    const maxRecords = 7 * 24 * 3; // 每8小时一次，7天
    if (history.length > maxRecords) { // 条件判断 history.length > maxRecords
      history.shift(); // 调用 history.shift
    } // 结束代码块

    // 更新统计 / Update statistics
    this._updateStats(symbol); // 调用 _updateStats

    // 发出更新事件 / Emit update event
    this.emit('rateUpdated', { symbol, rate: this.currentRates.get(symbol) }); // 调用 emit
  } // 结束代码块

  /**
   * 更新统计数据
   * Update statistics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  _updateStats(symbol) { // 调用 _updateStats
    const history = this.rateHistory.get(symbol); // 定义常量 history
    if (!history || history.length < 2) return; // 条件判断 !history || history.length < 2

    const rates = history.map(h => h.rate); // 定义函数 rates

    // 计算统计 / Calculate statistics
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length; // 定义函数 mean
    const variance = rates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rates.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std
    const min = Math.min(...rates); // 定义常量 min
    const max = Math.max(...rates); // 定义常量 max

    // 计算百分位数 / Calculate percentiles
    const sorted = [...rates].sort((a, b) => a - b); // 定义函数 sorted
    const p10 = sorted[Math.floor(sorted.length * 0.1)]; // 定义常量 p10
    const p90 = sorted[Math.floor(sorted.length * 0.9)]; // 定义常量 p90

    this.rateStats.set(symbol, { // 访问 rateStats
      mean, // 执行语句
      std, // 执行语句
      min, // 执行语句
      max, // 执行语句
      p10, // 执行语句
      p90, // 执行语句
      count: rates.length, // 数量
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取当前费率
   * Get current rate
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 费率数据 / Rate data
   */
  getCurrentRate(symbol) { // 调用 getCurrentRate
    return this.currentRates.get(symbol) || null; // 返回结果
  } // 结束代码块

  /**
   * 获取所有当前费率
   * Get all current rates
   *
   * @returns {Map} 费率映射 / Rate map
   */
  getAllCurrentRates() { // 调用 getAllCurrentRates
    return this.currentRates; // 返回结果
  } // 结束代码块

  /**
   * 获取费率统计
   * Get rate statistics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 统计数据 / Statistics
   */
  getStats(symbol) { // 调用 getStats
    return this.rateStats.get(symbol) || null; // 返回结果
  } // 结束代码块

  /**
   * 计算年化费率
   * Calculate annualized rate
   *
   * @param {number} rate - 单期费率 / Single period rate
   * @returns {number} 年化费率 / Annualized rate
   */
  annualizeRate(rate) { // 调用 annualizeRate
    const multiplier = ANNUALIZATION_MULTIPLIERS[this.config.fundingFrequency] || (3 * 365); // 定义常量 multiplier
    return rate * multiplier; // 返回结果
  } // 结束代码块

  /**
   * 计算Z分数
   * Calculate Z-score
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} Z分数 / Z-score
   */
  calculateZScore(symbol) { // 调用 calculateZScore
    const current = this.getCurrentRate(symbol); // 定义常量 current
    const stats = this.getStats(symbol); // 定义常量 stats

    if (!current || !stats || stats.std === 0) { // 条件判断 !current || !stats || stats.std === 0
      return 0; // 返回结果
    } // 结束代码块

    return (current.rate - stats.mean) / stats.std; // 返回结果
  } // 结束代码块

  /**
   * 获取百分位排名
   * Get percentile rank
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 百分位 (0-100) / Percentile
   */
  getPercentileRank(symbol) { // 调用 getPercentileRank
    const current = this.getCurrentRate(symbol); // 定义常量 current
    const history = this.rateHistory.get(symbol); // 定义常量 history

    if (!current || !history || history.length === 0) { // 条件判断 !current || !history || history.length === 0
      return 50; // 默认中位数
    } // 结束代码块

    const rates = history.map(h => h.rate); // 定义函数 rates
    const currentRate = current.rate; // 定义常量 currentRate

    // 计算百分位 / Calculate percentile
    const below = rates.filter(r => r < currentRate).length; // 定义函数 below
    return (below / rates.length) * 100; // 返回结果
  } // 结束代码块

  /**
   * 清除数据
   * Clear data
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   */
  clear(symbol = null) { // 调用 clear
    if (symbol) { // 条件判断 symbol
      this.currentRates.delete(symbol); // 访问 currentRates
      this.rateHistory.delete(symbol); // 访问 rateHistory
      this.rateStats.delete(symbol); // 访问 rateStats
    } else { // 执行语句
      this.currentRates.clear(); // 访问 currentRates
      this.rateHistory.clear(); // 访问 rateHistory
      this.rateStats.clear(); // 访问 rateStats
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 资金费率极值横截面策略
 * Funding Rate Extreme Cross-Sectional Strategy
 */
export class FundingRateExtremeStrategy extends CrossSectionalStrategy { // 导出类 FundingRateExtremeStrategy
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
    this.strategyType = CROSS_SECTIONAL_TYPES.FUNDING_RATE_EXTREME; // 设置 strategyType

    // 资金费率管理器 / Funding rate manager
    this.fundingManager = new FundingRateDataManager(config); // 设置 fundingManager

    // 入场费率记录 / Entry rate records
    this.entryRates = new Map(); // 设置 entryRates

    // 累计费率收益 / Cumulative funding income
    this.cumulativeFundingIncome = new Map(); // 设置 cumulativeFundingIncome

    // 入场时间 / Entry times
    this.entryTimes = new Map(); // 设置 entryTimes

    // 统计 / Statistics
    this.fundingStats = { // 设置 fundingStats
      totalFundingIncome: 0, // 总资金费率Income
      fundingPayments: 0, // 资金费率Payments
      settlementsCount: 0, // settlements数量
    }; // 结束代码块

    // 设置费率更新监听 / Set up rate update listener
    this._setupFundingListeners(); // 调用 _setupFundingListeners
  } // 结束代码块

  /**
   * 设置费率监听
   * Set up funding listeners
   * @private
   */
  _setupFundingListeners() { // 调用 _setupFundingListeners
    this.fundingManager.on('rateUpdated', ({ symbol, rate }) => { // 访问 fundingManager
      // 检查是否持有该资产 / Check if holding this asset
      const position = this.portfolioManager.currentPositions.get(symbol); // 定义常量 position
      if (position) { // 条件判断 position
        this._recordFundingPayment(symbol, position, rate); // 调用 _recordFundingPayment
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录资金费率结算
   * Record funding payment
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} position - 仓位 / Position
   * @param {Object} rate - 费率数据 / Rate data
   * @private
   */
  _recordFundingPayment(symbol, position, rate) { // 调用 _recordFundingPayment
    // 计算费率收益/支出 / Calculate funding income/expense
    // 做多支付费率，做空收取费率
    // Long pays funding, short receives funding
    const fundingMultiplier = position.side === 'long' ? -1 : 1; // 定义常量 fundingMultiplier
    const fundingIncome = fundingMultiplier * rate.rate * position.weight; // 定义常量 fundingIncome

    // 累计费率收益 / Accumulate funding income
    const current = this.cumulativeFundingIncome.get(symbol) || 0; // 定义常量 current
    this.cumulativeFundingIncome.set(symbol, current + fundingIncome); // 访问 cumulativeFundingIncome

    // 更新统计 / Update statistics
    this.fundingStats.totalFundingIncome += fundingIncome; // 访问 fundingStats
    this.fundingStats.settlementsCount++; // 访问 fundingStats

    if (this.config.verbose) { // 条件判断 this.config.verbose
      this.log( // 调用 log
        `${symbol} 费率结算: ${fundingMultiplier > 0 ? '+' : ''}${(fundingIncome * 100).toFixed(4)}%`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 资金费率极值策略需要 Ticker 和资金费率数据 / Funding rate extreme needs ticker and funding rate
    return ['ticker', 'fundingRate']; // 返回结果
  } // 结束代码块

  /**
   * 初始化策略
   * Initialize strategy
   */
  async onInit() { // 执行语句
    this.log('资金费率极值策略初始化', 'info'); // 调用 log
    this.log(`极值检测: ${this.config.extremeDetection}`, 'info'); // 调用 log
    this.log(`最小年化利差: ${(this.config.minAnnualizedSpread * 100).toFixed(1)}%`, 'info'); // 调用 log

    // 调用父类初始化 / Call parent init
    await super.onInit(); // 等待异步结果
  } // 结束代码块

  /**
   * 处理资金费率更新
   * Handle funding rate update
   *
   * @param {Object} data - 费率数据 / Rate data
   */
  async onFundingRate(data) { // 执行语句
    if (!this.running) return; // 条件判断 !this.running

    // 更新费率管理器 / Update rate manager
    if (data.symbol && data.fundingRate !== undefined) { // 条件判断 data.symbol && data.fundingRate !== undefined
      this.fundingManager.updateRate(data.symbol, data); // 访问 fundingManager
    } // 结束代码块

    // 检查并更新信号 / Check and update signals
    await this._checkAndUpdateSignals(); // 等待异步结果
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
      const rate = this.fundingManager.getCurrentRate(symbol); // 定义常量 rate
      if (!rate) continue; // 条件判断 !rate

      const stats = this.fundingManager.getStats(symbol); // 定义常量 stats

      // 检查是否为极值 / Check if extreme
      const extremeScore = this._calculateExtremeScore(symbol, rate, stats); // 定义常量 extremeScore

      // 计算年化费率 / Calculate annualized rate
      const annualizedRate = this.fundingManager.annualizeRate(rate.rate); // 定义常量 annualizedRate

      ranking.push({ // 调用 ranking.push
        symbol, // 执行语句
        value: rate.rate, // value
        annualizedRate, // 执行语句
        extremeScore, // 执行语句
        zScore: this.fundingManager.calculateZScore(symbol), // Z分数
        percentile: this.fundingManager.getPercentileRank(symbol), // percentile
        predictedRate: rate.predictedRate, // predicted频率
        nextFundingTime: rate.nextFundingTime, // next资金费率时间
        stats, // 执行语句
      }); // 结束代码块
    } // 结束代码块

    // 按费率排序 (降序: 高费率在前)
    // Sort by rate (descending: high rates first)
    ranking.sort((a, b) => b.value - a.value); // 调用 ranking.sort

    // 添加排名 / Add rank
    ranking.forEach((item, index) => { // 调用 ranking.forEach
      item.rank = index + 1; // 赋值 item.rank
    }); // 结束代码块

    return ranking; // 返回结果
  } // 结束代码块

  /**
   * 计算极值分数
   * Calculate extreme score
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} rate - 费率数据 / Rate data
   * @param {Object} stats - 统计数据 / Statistics
   * @returns {number} 极值分数 (-1到1，正表示高极值，负表示低极值)
   * @private
   */
  _calculateExtremeScore(symbol, rate, stats) { // 调用 _calculateExtremeScore
    switch (this.config.extremeDetection) { // 分支选择 this.config.extremeDetection
      case EXTREME_DETECTION.PERCENTILE: { // 分支 EXTREME_DETECTION.PERCENTILE: {
        const percentile = this.fundingManager.getPercentileRank(symbol); // 定义常量 percentile
        // 转换为-1到1的分数
        // Convert to score from -1 to 1
        return (percentile - 50) / 50; // 返回结果
      } // 结束代码块

      case EXTREME_DETECTION.Z_SCORE: { // 分支 EXTREME_DETECTION.Z_SCORE: {
        const zScore = this.fundingManager.calculateZScore(symbol); // 定义常量 zScore
        // 归一化Z分数
        // Normalize Z-score
        return Math.max(-1, Math.min(1, zScore / this.config.zScoreThreshold)); // 返回结果
      } // 结束代码块

      case EXTREME_DETECTION.ABSOLUTE: { // 分支 EXTREME_DETECTION.ABSOLUTE: {
        const annualized = this.fundingManager.annualizeRate(rate.rate); // 定义常量 annualized
        if (annualized >= this.config.absoluteHighThreshold) { // 条件判断 annualized >= this.config.absoluteHighThreshold
          return annualized / this.config.absoluteHighThreshold; // 返回结果
        } else if (annualized <= this.config.absoluteLowThreshold) { // 执行语句
          return annualized / Math.abs(this.config.absoluteLowThreshold); // 返回结果
        } // 结束代码块
        return 0; // 返回结果
      } // 结束代码块

      case EXTREME_DETECTION.HISTORICAL: // 分支 EXTREME_DETECTION.HISTORICAL
      default: { // 默认
        if (!stats) return 0; // 条件判断 !stats
        const range = stats.max - stats.min; // 定义常量 range
        if (range === 0) return 0; // 条件判断 range === 0
        return (rate.rate - stats.mean) / (range / 2); // 返回结果
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查是否为高极值
   * Check if high extreme
   *
   * @param {Object} item - 排名项 / Ranking item
   * @returns {boolean} 是否高极值 / Whether high extreme
   * @private
   */
  _isHighExtreme(item) { // 调用 _isHighExtreme
    switch (this.config.extremeDetection) { // 分支选择 this.config.extremeDetection
      case EXTREME_DETECTION.PERCENTILE: // 分支 EXTREME_DETECTION.PERCENTILE
        return item.percentile >= this.config.highRatePercentile; // 返回结果

      case EXTREME_DETECTION.Z_SCORE: // 分支 EXTREME_DETECTION.Z_SCORE
        return item.zScore >= this.config.zScoreThreshold; // 返回结果

      case EXTREME_DETECTION.ABSOLUTE: // 分支 EXTREME_DETECTION.ABSOLUTE
        return item.annualizedRate >= this.config.absoluteHighThreshold; // 返回结果

      case EXTREME_DETECTION.HISTORICAL: // 分支 EXTREME_DETECTION.HISTORICAL
      default: // 默认
        return item.extremeScore >= 0.8; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查是否为低极值
   * Check if low extreme
   *
   * @param {Object} item - 排名项 / Ranking item
   * @returns {boolean} 是否低极值 / Whether low extreme
   * @private
   */
  _isLowExtreme(item) { // 调用 _isLowExtreme
    switch (this.config.extremeDetection) { // 分支选择 this.config.extremeDetection
      case EXTREME_DETECTION.PERCENTILE: // 分支 EXTREME_DETECTION.PERCENTILE
        return item.percentile <= this.config.lowRatePercentile; // 返回结果

      case EXTREME_DETECTION.Z_SCORE: // 分支 EXTREME_DETECTION.Z_SCORE
        return item.zScore <= -this.config.zScoreThreshold; // 返回结果

      case EXTREME_DETECTION.ABSOLUTE: // 分支 EXTREME_DETECTION.ABSOLUTE
        return item.annualizedRate <= this.config.absoluteLowThreshold; // 返回结果

      case EXTREME_DETECTION.HISTORICAL: // 分支 EXTREME_DETECTION.HISTORICAL
      default: // 默认
        return item.extremeScore <= -0.8; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 选择资产 (覆盖父类)
   * Select assets (override parent)
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Object} 做多和做空资产 / Long and short assets
   */
  _selectAssets(ranking) { // 调用 _selectAssets
    // 筛选高极值资产 (做空) / Filter high extreme assets (for short)
    const highExtremes = ranking.filter(item => this._isHighExtreme(item)); // 定义函数 highExtremes

    // 筛选低极值资产 (做多) / Filter low extreme assets (for long)
    const lowExtremes = ranking.filter(item => this._isLowExtreme(item)); // 定义函数 lowExtremes

    // 选择 Top N 高极值做空 / Select top N high extremes for short
    const shortCandidates = highExtremes.slice(0, this.config.topN); // 定义常量 shortCandidates

    // 选择 Bottom N 低极值做多 / Select bottom N low extremes for long
    const longCandidates = lowExtremes.slice(0, this.config.bottomN); // 定义常量 longCandidates

    // 检查利差是否足够 / Check if spread is sufficient
    const avgHighRate = shortCandidates.length > 0 // 定义常量 avgHighRate
      ? shortCandidates.reduce((sum, c) => sum + c.annualizedRate, 0) / shortCandidates.length // 定义箭头函数
      : 0; // 执行语句
    const avgLowRate = longCandidates.length > 0 // 定义常量 avgLowRate
      ? longCandidates.reduce((sum, c) => sum + c.annualizedRate, 0) / longCandidates.length // 定义箭头函数
      : 0; // 执行语句
    const spread = avgHighRate - avgLowRate; // 定义常量 spread

    if (spread < this.config.minAnnualizedSpread) { // 条件判断 spread < this.config.minAnnualizedSpread
      this.log( // 调用 log
        `利差不足: ${(spread * 100).toFixed(2)}% < ${(this.config.minAnnualizedSpread * 100).toFixed(2)}%`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数
      return { longAssets: [], shortAssets: [] }; // 返回结果
    } // 结束代码块

    // 计算权重 / Calculate weights
    let shortAssets = this._calculateWeights(shortCandidates, 'short'); // 定义变量 shortAssets
    let longAssets = this._calculateWeights(longCandidates, 'long'); // 定义变量 longAssets

    // 市场中性调整 / Market neutral adjustment
    if (this.config.marketNeutral) { // 条件判断 this.config.marketNeutral
      const result = this._adjustForMarketNeutral(longAssets, shortAssets); // 定义常量 result
      longAssets = result.longAssets; // 赋值 longAssets
      shortAssets = result.shortAssets; // 赋值 shortAssets
    } // 结束代码块

    this.log( // 调用 log
      `选择: 做多${longAssets.length}个(平均费率${(avgLowRate * 100).toFixed(4)}%), ` + // 执行语句
      `做空${shortAssets.length}个(平均费率${(avgHighRate * 100).toFixed(4)}%), ` + // 执行语句
      `利差${(spread * 100).toFixed(2)}%`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数

    return { longAssets, shortAssets }; // 返回结果
  } // 结束代码块

  /**
   * 计算权重
   * Calculate weights
   *
   * @param {Array} assets - 资产列表 / Asset list
   * @param {string} side - 方向 / Side
   * @returns {Array} 带权重的资产 / Assets with weights
   * @private
   */
  _calculateWeights(assets, side) { // 调用 _calculateWeights
    if (assets.length === 0) return []; // 条件判断 assets.length === 0

    // 按极值程度加权 / Weight by extreme degree
    const totalExtreme = assets.reduce((sum, a) => sum + Math.abs(a.extremeScore), 0); // 定义函数 totalExtreme

    return assets.map(asset => { // 返回结果
      const extremeWeight = totalExtreme > 0 // 定义常量 extremeWeight
        ? Math.abs(asset.extremeScore) / totalExtreme // 执行语句
        : 1 / assets.length; // 执行语句

      const weight = Math.min( // 定义常量 weight
        extremeWeight * this.config.maxPositionPerSide, // 执行语句
        this.config.maxPositionPerAsset // 访问 config
      ); // 结束调用或参数

      return { // 返回结果
        ...asset, // 展开对象或数组
        side, // 执行语句
        weight: Math.max(weight, 0.02), // weight
      }; // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 调整为市场中性
   * Adjust for market neutral
   *
   * @param {Array} longAssets - 做多资产 / Long assets
   * @param {Array} shortAssets - 做空资产 / Short assets
   * @returns {Object} 调整后的资产 / Adjusted assets
   * @private
   */
  _adjustForMarketNeutral(longAssets, shortAssets) { // 调用 _adjustForMarketNeutral
    const longWeight = longAssets.reduce((sum, a) => sum + a.weight, 0); // 定义函数 longWeight
    const shortWeight = shortAssets.reduce((sum, a) => sum + a.weight, 0); // 定义函数 shortWeight

    if (longWeight === 0 || shortWeight === 0) { // 条件判断 longWeight === 0 || shortWeight === 0
      return { longAssets, shortAssets }; // 返回结果
    } // 结束代码块

    // 调整到相同权重 / Adjust to same weight
    const targetWeight = Math.min(longWeight, shortWeight, this.config.maxPositionPerSide); // 定义常量 targetWeight

    const longScale = targetWeight / longWeight; // 定义常量 longScale
    const shortScale = targetWeight / shortWeight; // 定义常量 shortScale

    return { // 返回结果
      longAssets: longAssets.map(a => ({ ...a, weight: a.weight * longScale })), // longAssets
      shortAssets: shortAssets.map(a => ({ ...a, weight: a.weight * shortScale })), // shortAssets
    }; // 结束代码块
  } // 结束代码块

  /**
   * 检查并更新信号 (覆盖父类)
   * Check and update signals (override parent)
   * @private
   */
  async _checkAndUpdateSignals() { // 执行语句
    // 检查现有仓位的平仓条件 / Check close conditions for existing positions
    await this._checkCloseConditions(); // 等待异步结果

    // 调用父类方法 / Call parent method
    await super._checkAndUpdateSignals(); // 等待异步结果
  } // 结束代码块

  /**
   * 检查平仓条件
   * Check close conditions
   * @private
   */
  async _checkCloseConditions() { // 执行语句
    for (const [symbol, position] of this.portfolioManager.currentPositions) { // 循环 const [symbol, position] of this.portfolioMan...
      const currentRate = this.fundingManager.getCurrentRate(symbol); // 定义常量 currentRate
      const entryRate = this.entryRates.get(symbol); // 定义常量 entryRate
      const entryTime = this.entryTimes.get(symbol); // 定义常量 entryTime

      if (!currentRate || !entryRate) continue; // 条件判断 !currentRate || !entryRate

      let shouldClose = false; // 定义变量 shouldClose
      let closeReason = ''; // 定义变量 closeReason

      // 条件1: 费率回归 / Condition 1: Rate reversion
      const rateReversion = position.side === 'short' // 定义常量 rateReversion
        ? (entryRate.rate - currentRate.rate) / Math.abs(entryRate.rate) // 执行语句
        : (currentRate.rate - entryRate.rate) / Math.abs(entryRate.rate); // 执行语句

      if (rateReversion >= this.config.rateReversionThreshold) { // 条件判断 rateReversion >= this.config.rateReversionThr...
        shouldClose = true; // 赋值 shouldClose
        closeReason = `费率回归: ${(rateReversion * 100).toFixed(2)}%`; // 赋值 closeReason
      } // 结束代码块

      // 条件2: 费率反转 / Condition 2: Rate reversal
      const annualizedCurrent = this.fundingManager.annualizeRate(currentRate.rate); // 定义常量 annualizedCurrent
      if (position.side === 'short' && annualizedCurrent < this.config.rateReversalThreshold) { // 条件判断 position.side === 'short' && annualizedCurren...
        shouldClose = true; // 赋值 shouldClose
        closeReason = `费率反转: 年化${(annualizedCurrent * 100).toFixed(2)}%`; // 赋值 closeReason
      } // 结束代码块
      if (position.side === 'long' && annualizedCurrent > -this.config.rateReversalThreshold) { // 条件判断 position.side === 'long' && annualizedCurrent...
        // 对于做多低费率，如果费率变为正值，可能需要平仓
        if (annualizedCurrent > this.config.absoluteHighThreshold * 0.5) { // 条件判断 annualizedCurrent > this.config.absoluteHighT...
          shouldClose = true; // 赋值 shouldClose
          closeReason = `费率变高: 年化${(annualizedCurrent * 100).toFixed(2)}%`; // 赋值 closeReason
        } // 结束代码块
      } // 结束代码块

      // 条件3: 最大持仓时间 / Condition 3: Max holding time
      const holdingHours = (Date.now() - entryTime) / (60 * 60 * 1000); // 定义常量 holdingHours
      if (holdingHours >= this.config.maxHoldingHours) { // 条件判断 holdingHours >= this.config.maxHoldingHours
        shouldClose = true; // 赋值 shouldClose
        closeReason = `达到最大持仓时间: ${holdingHours.toFixed(1)}小时`; // 赋值 closeReason
      } // 结束代码块

      // 条件4: 综合止损 / Condition 4: Combined stop loss
      const fundingIncome = this.cumulativeFundingIncome.get(symbol) || 0; // 定义常量 fundingIncome
      const priceMetrics = this.assetManager.getMetrics(symbol); // 定义常量 priceMetrics
      if (priceMetrics && position.entryPrice) { // 条件判断 priceMetrics && position.entryPrice
        const pricePnl = position.side === 'long' // 定义常量 pricePnl
          ? (priceMetrics.latestPrice - position.entryPrice) / position.entryPrice // 执行语句
          : (position.entryPrice - priceMetrics.latestPrice) / position.entryPrice; // 执行语句
        const combinedPnl = pricePnl + fundingIncome; // 定义常量 combinedPnl

        if (combinedPnl < -this.config.combinedStopLoss) { // 条件判断 combinedPnl < -this.config.combinedStopLoss
          shouldClose = true; // 赋值 shouldClose
          closeReason = `综合止损: 价格${(pricePnl * 100).toFixed(2)}% + 费率${(fundingIncome * 100).toFixed(2)}%`; // 赋值 closeReason
        } // 结束代码块
      } // 结束代码块

      // 执行平仓 / Execute close
      if (shouldClose) { // 条件判断 shouldClose
        // 检查最小持仓时间 / Check min holding time
        if (holdingHours < this.config.minHoldingHours) { // 条件判断 holdingHours < this.config.minHoldingHours
          this.log(`${symbol} 跳过平仓: 未达最小持仓时间 ${holdingHours.toFixed(1)}/${this.config.minHoldingHours}小时`, 'info'); // 调用 log
          continue; // 继续下一轮循环
        } // 结束代码块

        this.log(`${symbol} 平仓条件触发: ${closeReason}`, 'info'); // 调用 log
        await this._closePosition(symbol, closeReason); // 等待异步结果
      } // 结束代码块
    } // 结束代码块
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
    // 记录入场费率 / Record entry rate
    const currentRate = this.fundingManager.getCurrentRate(symbol); // 定义常量 currentRate
    if (currentRate) { // 条件判断 currentRate
      this.entryRates.set(symbol, { ...currentRate }); // 访问 entryRates
    } // 结束代码块

    // 记录入场时间 / Record entry time
    this.entryTimes.set(symbol, Date.now()); // 访问 entryTimes

    // 初始化费率收益 / Initialize funding income
    this.cumulativeFundingIncome.set(symbol, 0); // 访问 cumulativeFundingIncome

    // 记录入场价格 / Record entry price
    const metrics = this.assetManager.getMetrics(symbol); // 定义常量 metrics
    if (metrics) { // 条件判断 metrics
      target.entryPrice = metrics.latestPrice; // 赋值 target.entryPrice
    } // 结束代码块

    // 调用父类方法 / Call parent method
    await super._openPosition(symbol, target); // 等待异步结果

    // 记录开仓详情 / Log open details
    if (currentRate) { // 条件判断 currentRate
      this.log( // 调用 log
        `${symbol} 开${target.side}: 费率${(currentRate.rate * 100).toFixed(4)}% ` + // 执行语句
        `(年化${(this.fundingManager.annualizeRate(currentRate.rate) * 100).toFixed(2)}%)`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数
    } // 结束代码块
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
    // 记录费率收益 / Log funding income
    const fundingIncome = this.cumulativeFundingIncome.get(symbol) || 0; // 定义常量 fundingIncome
    this.log(`${symbol} 累计费率收益: ${(fundingIncome * 100).toFixed(4)}%`, 'info'); // 调用 log

    // 清除记录 / Clear records
    this.entryRates.delete(symbol); // 访问 entryRates
    this.entryTimes.delete(symbol); // 访问 entryTimes
    this.cumulativeFundingIncome.delete(symbol); // 访问 cumulativeFundingIncome

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

    // 计算当前利差 / Calculate current spread
    const ranking = this.getCurrentRanking(); // 定义常量 ranking
    const highRates = ranking.slice(0, this.config.topN); // 定义常量 highRates
    const lowRates = ranking.slice(-this.config.bottomN); // 定义常量 lowRates

    const avgHighRate = highRates.length > 0 // 定义常量 avgHighRate
      ? highRates.reduce((sum, r) => sum + r.annualizedRate, 0) / highRates.length // 定义箭头函数
      : 0; // 执行语句
    const avgLowRate = lowRates.length > 0 // 定义常量 avgLowRate
      ? lowRates.reduce((sum, r) => sum + r.annualizedRate, 0) / lowRates.length // 定义箭头函数
      : 0; // 执行语句

    return { // 返回结果
      ...baseStatus, // 展开对象或数组
      extremeDetection: this.config.extremeDetection, // 极端Detection
      fundingStats: this.fundingStats, // 资金费率Stats
      currentSpread: avgHighRate - avgLowRate, // current价差
      avgHighRate, // 执行语句
      avgLowRate, // 执行语句
      positionsWithFunding: Array.from(this.cumulativeFundingIncome.entries()).map(([symbol, income]) => ({ // 持仓With资金费率
        symbol, // 执行语句
        fundingIncome: income, // 资金费率Income
        entryRate: this.entryRates.get(symbol)?.rate, // 入场频率
        currentRate: this.fundingManager.getCurrentRate(symbol)?.rate, // current频率
      })), // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取费率排名详情
   * Get funding rate ranking details
   *
   * @returns {Array} 排名详情 / Ranking details
   */
  getFundingRateRankingDetails() { // 调用 getFundingRateRankingDetails
    const ranking = this.getCurrentRanking(); // 定义常量 ranking

    return ranking.map(item => ({ // 返回结果
      symbol: item.symbol, // 交易对
      rank: item.rank, // rank
      currentRate: item.value, // current频率
      annualizedRate: item.annualizedRate, // annualized频率
      extremeScore: item.extremeScore, // 极端分数
      zScore: item.zScore, // Z分数
      percentile: item.percentile, // percentile
      predictedRate: item.predictedRate, // predicted频率
      isHighExtreme: this._isHighExtreme(item), // 是否最高极端
      isLowExtreme: this._isLowExtreme(item), // 是否最低极端
      recommendedAction: this._isHighExtreme(item) ? 'short' : (this._isLowExtreme(item) ? 'long' : 'none'), // recommendedAction
    })); // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { // 导出命名成员
  DEFAULT_CONFIG as FUNDING_EXTREME_DEFAULT_CONFIG, // 执行语句
}; // 结束代码块

export default FundingRateExtremeStrategy; // 默认导出
