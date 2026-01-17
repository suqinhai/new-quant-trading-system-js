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
import {
  CrossSectionalStrategy,
  CROSS_SECTIONAL_TYPES,
  RANK_DIRECTION,
  POSITION_TYPE,
} from './CrossSectionalStrategy.js';

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 资金费率结算频率
 * Funding rate settlement frequency
 */
export const FUNDING_FREQUENCY = {
  HOURLY: 'hourly',       // 每小时 (1倍)
  EIGHT_HOURLY: '8h',     // 每8小时 (标准)
  FOUR_HOURLY: '4h',      // 每4小时 (2倍)
};

/**
 * 极值判断方法
 * Extreme value detection method
 */
export const EXTREME_DETECTION = {
  PERCENTILE: 'percentile',       // 百分位数
  Z_SCORE: 'z_score',             // Z分数
  ABSOLUTE: 'absolute',           // 绝对值
  HISTORICAL: 'historical',       // 历史对比
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  name: 'FundingRateExtremeStrategy',

  // 监控的永续合约交易对 / Perpetual swap symbols to monitor
  symbols: [
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT',
    'XRP/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT',
    'DOT/USDT', 'MATIC/USDT', 'LINK/USDT', 'UNI/USDT',
    'ATOM/USDT', 'LTC/USDT', 'ETC/USDT', 'OP/USDT',
    'ARB/USDT', 'APT/USDT', 'INJ/USDT', 'FIL/USDT',
  ],

  // 资金费率结算频率 / Funding settlement frequency
  fundingFrequency: FUNDING_FREQUENCY.EIGHT_HOURLY,

  // ============================================
  // 极值检测配置 / Extreme Detection Configuration
  // ============================================

  // 极值检测方法 / Extreme detection method
  extremeDetection: EXTREME_DETECTION.PERCENTILE,

  // 高费率阈值 (百分位) / High rate threshold (percentile)
  highRatePercentile: 90,

  // 低费率阈值 (百分位) / Low rate threshold (percentile)
  lowRatePercentile: 10,

  // 绝对值阈值 (年化) / Absolute threshold (annualized)
  absoluteHighThreshold: 0.50,   // 50% 年化
  absoluteLowThreshold: -0.20,   // -20% 年化

  // Z分数阈值 / Z-score threshold
  zScoreThreshold: 2.0,

  // 历史回看周期 (天) / Historical lookback (days)
  historicalLookback: 30,

  // ============================================
  // 排名配置 / Ranking Configuration
  // ============================================

  // 选取高费率 Top N 做空 / Select top N high rates for short
  topN: 3,

  // 选取低费率 Bottom N 做多 / Select bottom N low rates for long
  bottomN: 3,

  // 最小年化费率利差 / Minimum annualized rate spread
  minAnnualizedSpread: 0.20,  // 20%

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 仓位类型 / Position type
  positionType: POSITION_TYPE.LONG_SHORT,

  // 单个资产最大仓位 / Max position per asset
  maxPositionPerAsset: 0.10,

  // 单边总仓位 / Total position per side
  maxPositionPerSide: 0.40,

  // 杠杆倍数 / Leverage
  leverage: 3,

  // 市场中性 (多空等量) / Market neutral
  marketNeutral: true,

  // ============================================
  // 持仓配置 / Holding Configuration
  // ============================================

  // 目标持仓周期 (小时) / Target holding period (hours)
  targetHoldingHours: 8,

  // 最大持仓周期 (小时) / Max holding period (hours)
  maxHoldingHours: 72,

  // 最小持仓周期 (小时) / Min holding period (hours)
  minHoldingHours: 4,

  // ============================================
  // 再平衡配置 / Rebalancing Configuration
  // ============================================

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 1 * 60 * 60 * 1000, // 每小时 / Every hour

  // 费率刷新间隔 (毫秒) / Rate refresh interval (ms)
  rateRefreshInterval: 60 * 1000,  // 每分钟

  // ============================================
  // 平仓条件 / Close Conditions
  // ============================================

  // 费率回归阈值 (相对于入场时) / Rate reversion threshold
  rateReversionThreshold: 0.50,  // 费率回归50%时平仓

  // 费率反转阈值 / Rate reversal threshold
  rateReversalThreshold: -0.10,  // 费率反向超过-10%时平仓

  // 价格止损 / Price stop loss
  priceStopLoss: 0.05,

  // 综合止损 (价格损失 - 费率收益) / Combined stop loss
  combinedStopLoss: 0.03,

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 最大单日费率损失 / Max daily funding loss
  maxDailyFundingLoss: 0.005,  // 0.5%

  // 最大净敞口 / Max net exposure
  maxNetExposure: 0.10,

  // 最大相关性 / Max correlation between positions
  maxCorrelation: 0.8,

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  verbose: true,
  logPrefix: '[FundingExtreme]',
};

/**
 * 年化倍数
 * Annualization multiplier
 */
const ANNUALIZATION_MULTIPLIERS = {
  [FUNDING_FREQUENCY.HOURLY]: 24 * 365,
  [FUNDING_FREQUENCY.EIGHT_HOURLY]: 3 * 365,
  [FUNDING_FREQUENCY.FOUR_HOURLY]: 6 * 365,
};

// ============================================
// 辅助类 / Helper Classes
// ============================================

/**
 * 资金费率数据管理器
 * Funding Rate Data Manager
 */
export class FundingRateDataManager extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Configuration
   */
  constructor(config) {
    super();

    this.config = config;

    // 当前费率 / Current rates
    // 格式: { symbol: { rate, predictedRate, timestamp, exchange } }
    this.currentRates = new Map();

    // 历史费率 / Historical rates
    // 格式: { symbol: [{ rate, timestamp }, ...] }
    this.rateHistory = new Map();

    // 费率统计 / Rate statistics
    this.rateStats = new Map();
  }

  /**
   * 更新资金费率
   * Update funding rate
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} rateData - 费率数据 / Rate data
   */
  updateRate(symbol, rateData) {
    // 保存当前费率 / Save current rate
    this.currentRates.set(symbol, {
      rate: rateData.fundingRate || 0,
      predictedRate: rateData.fundingRatePredicted || rateData.fundingRate || 0,
      nextFundingTime: rateData.fundingTimestamp || 0,
      markPrice: rateData.markPrice || 0,
      indexPrice: rateData.indexPrice || 0,
      timestamp: Date.now(),
      exchange: rateData.exchange || 'unknown',
    });

    // 记录到历史 / Record to history
    if (!this.rateHistory.has(symbol)) {
      this.rateHistory.set(symbol, []);
    }

    const history = this.rateHistory.get(symbol);
    history.push({
      rate: rateData.fundingRate || 0,
      timestamp: Date.now(),
    });

    // 保留最近7天的数据 / Keep last 7 days of data
    const maxRecords = 7 * 24 * 3; // 每8小时一次，7天
    if (history.length > maxRecords) {
      history.shift();
    }

    // 更新统计 / Update statistics
    this._updateStats(symbol);

    // 发出更新事件 / Emit update event
    this.emit('rateUpdated', { symbol, rate: this.currentRates.get(symbol) });
  }

  /**
   * 更新统计数据
   * Update statistics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  _updateStats(symbol) {
    const history = this.rateHistory.get(symbol);
    if (!history || history.length < 2) return;

    const rates = history.map(h => h.rate);

    // 计算统计 / Calculate statistics
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rates.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...rates);
    const max = Math.max(...rates);

    // 计算百分位数 / Calculate percentiles
    const sorted = [...rates].sort((a, b) => a - b);
    const p10 = sorted[Math.floor(sorted.length * 0.1)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];

    this.rateStats.set(symbol, {
      mean,
      std,
      min,
      max,
      p10,
      p90,
      count: rates.length,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取当前费率
   * Get current rate
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 费率数据 / Rate data
   */
  getCurrentRate(symbol) {
    return this.currentRates.get(symbol) || null;
  }

  /**
   * 获取所有当前费率
   * Get all current rates
   *
   * @returns {Map} 费率映射 / Rate map
   */
  getAllCurrentRates() {
    return this.currentRates;
  }

  /**
   * 获取费率统计
   * Get rate statistics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 统计数据 / Statistics
   */
  getStats(symbol) {
    return this.rateStats.get(symbol) || null;
  }

  /**
   * 计算年化费率
   * Calculate annualized rate
   *
   * @param {number} rate - 单期费率 / Single period rate
   * @returns {number} 年化费率 / Annualized rate
   */
  annualizeRate(rate) {
    const multiplier = ANNUALIZATION_MULTIPLIERS[this.config.fundingFrequency] || (3 * 365);
    return rate * multiplier;
  }

  /**
   * 计算Z分数
   * Calculate Z-score
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} Z分数 / Z-score
   */
  calculateZScore(symbol) {
    const current = this.getCurrentRate(symbol);
    const stats = this.getStats(symbol);

    if (!current || !stats || stats.std === 0) {
      return 0;
    }

    return (current.rate - stats.mean) / stats.std;
  }

  /**
   * 获取百分位排名
   * Get percentile rank
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 百分位 (0-100) / Percentile
   */
  getPercentileRank(symbol) {
    const current = this.getCurrentRate(symbol);
    const history = this.rateHistory.get(symbol);

    if (!current || !history || history.length === 0) {
      return 50; // 默认中位数
    }

    const rates = history.map(h => h.rate);
    const currentRate = current.rate;

    // 计算百分位 / Calculate percentile
    const below = rates.filter(r => r < currentRate).length;
    return (below / rates.length) * 100;
  }

  /**
   * 清除数据
   * Clear data
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   */
  clear(symbol = null) {
    if (symbol) {
      this.currentRates.delete(symbol);
      this.rateHistory.delete(symbol);
      this.rateStats.delete(symbol);
    } else {
      this.currentRates.clear();
      this.rateHistory.clear();
      this.rateStats.clear();
    }
  }
}

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 资金费率极值横截面策略
 * Funding Rate Extreme Cross-Sectional Strategy
 */
export class FundingRateExtremeStrategy extends CrossSectionalStrategy {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 合并配置 / Merge configuration
    const config = { ...DEFAULT_CONFIG, ...params };

    // 调用父类构造函数 / Call parent constructor
    super(config);

    // 设置策略类型 / Set strategy type
    this.strategyType = CROSS_SECTIONAL_TYPES.FUNDING_RATE_EXTREME;

    // 资金费率管理器 / Funding rate manager
    this.fundingManager = new FundingRateDataManager(config);

    // 入场费率记录 / Entry rate records
    this.entryRates = new Map();

    // 累计费率收益 / Cumulative funding income
    this.cumulativeFundingIncome = new Map();

    // 入场时间 / Entry times
    this.entryTimes = new Map();

    // 统计 / Statistics
    this.fundingStats = {
      totalFundingIncome: 0,
      fundingPayments: 0,
      settlementsCount: 0,
    };

    // 设置费率更新监听 / Set up rate update listener
    this._setupFundingListeners();
  }

  /**
   * 设置费率监听
   * Set up funding listeners
   * @private
   */
  _setupFundingListeners() {
    this.fundingManager.on('rateUpdated', ({ symbol, rate }) => {
      // 检查是否持有该资产 / Check if holding this asset
      const position = this.portfolioManager.currentPositions.get(symbol);
      if (position) {
        this._recordFundingPayment(symbol, position, rate);
      }
    });
  }

  /**
   * 记录资金费率结算
   * Record funding payment
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} position - 仓位 / Position
   * @param {Object} rate - 费率数据 / Rate data
   * @private
   */
  _recordFundingPayment(symbol, position, rate) {
    // 计算费率收益/支出 / Calculate funding income/expense
    // 做多支付费率，做空收取费率
    // Long pays funding, short receives funding
    const fundingMultiplier = position.side === 'long' ? -1 : 1;
    const fundingIncome = fundingMultiplier * rate.rate * position.weight;

    // 累计费率收益 / Accumulate funding income
    const current = this.cumulativeFundingIncome.get(symbol) || 0;
    this.cumulativeFundingIncome.set(symbol, current + fundingIncome);

    // 更新统计 / Update statistics
    this.fundingStats.totalFundingIncome += fundingIncome;
    this.fundingStats.settlementsCount++;

    if (this.config.verbose) {
      this.log(
        `${symbol} 费率结算: ${fundingMultiplier > 0 ? '+' : ''}${(fundingIncome * 100).toFixed(4)}%`,
        'info'
      );
    }
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 资金费率极值策略需要 Ticker 和资金费率数据 / Funding rate extreme needs ticker and funding rate
    return ['ticker', 'fundingRate'];
  }

  /**
   * 初始化策略
   * Initialize strategy
   */
  async onInit() {
    this.log('资金费率极值策略初始化', 'info');
    this.log(`极值检测: ${this.config.extremeDetection}`, 'info');
    this.log(`最小年化利差: ${(this.config.minAnnualizedSpread * 100).toFixed(1)}%`, 'info');

    // 调用父类初始化 / Call parent init
    await super.onInit();
  }

  /**
   * 处理资金费率更新
   * Handle funding rate update
   *
   * @param {Object} data - 费率数据 / Rate data
   */
  async onFundingRate(data) {
    if (!this.running) return;

    // 更新费率管理器 / Update rate manager
    if (data.symbol && data.fundingRate !== undefined) {
      this.fundingManager.updateRate(data.symbol, data);
    }

    // 检查并更新信号 / Check and update signals
    await this._checkAndUpdateSignals();
  }

  /**
   * 获取排名 (覆盖父类)
   * Get ranking (override parent)
   *
   * @returns {Array} 排名列表 / Ranking list
   */
  getCurrentRanking() {
    const ranking = [];

    for (const symbol of this.config.symbols) {
      const rate = this.fundingManager.getCurrentRate(symbol);
      if (!rate) continue;

      const stats = this.fundingManager.getStats(symbol);

      // 检查是否为极值 / Check if extreme
      const extremeScore = this._calculateExtremeScore(symbol, rate, stats);

      // 计算年化费率 / Calculate annualized rate
      const annualizedRate = this.fundingManager.annualizeRate(rate.rate);

      ranking.push({
        symbol,
        value: rate.rate,
        annualizedRate,
        extremeScore,
        zScore: this.fundingManager.calculateZScore(symbol),
        percentile: this.fundingManager.getPercentileRank(symbol),
        predictedRate: rate.predictedRate,
        nextFundingTime: rate.nextFundingTime,
        stats,
      });
    }

    // 按费率排序 (降序: 高费率在前)
    // Sort by rate (descending: high rates first)
    ranking.sort((a, b) => b.value - a.value);

    // 添加排名 / Add rank
    ranking.forEach((item, index) => {
      item.rank = index + 1;
    });

    return ranking;
  }

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
  _calculateExtremeScore(symbol, rate, stats) {
    switch (this.config.extremeDetection) {
      case EXTREME_DETECTION.PERCENTILE: {
        const percentile = this.fundingManager.getPercentileRank(symbol);
        // 转换为-1到1的分数
        // Convert to score from -1 to 1
        return (percentile - 50) / 50;
      }

      case EXTREME_DETECTION.Z_SCORE: {
        const zScore = this.fundingManager.calculateZScore(symbol);
        // 归一化Z分数
        // Normalize Z-score
        return Math.max(-1, Math.min(1, zScore / this.config.zScoreThreshold));
      }

      case EXTREME_DETECTION.ABSOLUTE: {
        const annualized = this.fundingManager.annualizeRate(rate.rate);
        if (annualized >= this.config.absoluteHighThreshold) {
          return annualized / this.config.absoluteHighThreshold;
        } else if (annualized <= this.config.absoluteLowThreshold) {
          return annualized / Math.abs(this.config.absoluteLowThreshold);
        }
        return 0;
      }

      case EXTREME_DETECTION.HISTORICAL:
      default: {
        if (!stats) return 0;
        const range = stats.max - stats.min;
        if (range === 0) return 0;
        return (rate.rate - stats.mean) / (range / 2);
      }
    }
  }

  /**
   * 检查是否为高极值
   * Check if high extreme
   *
   * @param {Object} item - 排名项 / Ranking item
   * @returns {boolean} 是否高极值 / Whether high extreme
   * @private
   */
  _isHighExtreme(item) {
    switch (this.config.extremeDetection) {
      case EXTREME_DETECTION.PERCENTILE:
        return item.percentile >= this.config.highRatePercentile;

      case EXTREME_DETECTION.Z_SCORE:
        return item.zScore >= this.config.zScoreThreshold;

      case EXTREME_DETECTION.ABSOLUTE:
        return item.annualizedRate >= this.config.absoluteHighThreshold;

      case EXTREME_DETECTION.HISTORICAL:
      default:
        return item.extremeScore >= 0.8;
    }
  }

  /**
   * 检查是否为低极值
   * Check if low extreme
   *
   * @param {Object} item - 排名项 / Ranking item
   * @returns {boolean} 是否低极值 / Whether low extreme
   * @private
   */
  _isLowExtreme(item) {
    switch (this.config.extremeDetection) {
      case EXTREME_DETECTION.PERCENTILE:
        return item.percentile <= this.config.lowRatePercentile;

      case EXTREME_DETECTION.Z_SCORE:
        return item.zScore <= -this.config.zScoreThreshold;

      case EXTREME_DETECTION.ABSOLUTE:
        return item.annualizedRate <= this.config.absoluteLowThreshold;

      case EXTREME_DETECTION.HISTORICAL:
      default:
        return item.extremeScore <= -0.8;
    }
  }

  /**
   * 选择资产 (覆盖父类)
   * Select assets (override parent)
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Object} 做多和做空资产 / Long and short assets
   */
  _selectAssets(ranking) {
    // 筛选高极值资产 (做空) / Filter high extreme assets (for short)
    const highExtremes = ranking.filter(item => this._isHighExtreme(item));

    // 筛选低极值资产 (做多) / Filter low extreme assets (for long)
    const lowExtremes = ranking.filter(item => this._isLowExtreme(item));

    // 选择 Top N 高极值做空 / Select top N high extremes for short
    const shortCandidates = highExtremes.slice(0, this.config.topN);

    // 选择 Bottom N 低极值做多 / Select bottom N low extremes for long
    const longCandidates = lowExtremes.slice(0, this.config.bottomN);

    // 检查利差是否足够 / Check if spread is sufficient
    const avgHighRate = shortCandidates.length > 0
      ? shortCandidates.reduce((sum, c) => sum + c.annualizedRate, 0) / shortCandidates.length
      : 0;
    const avgLowRate = longCandidates.length > 0
      ? longCandidates.reduce((sum, c) => sum + c.annualizedRate, 0) / longCandidates.length
      : 0;
    const spread = avgHighRate - avgLowRate;

    if (spread < this.config.minAnnualizedSpread) {
      this.log(
        `利差不足: ${(spread * 100).toFixed(2)}% < ${(this.config.minAnnualizedSpread * 100).toFixed(2)}%`,
        'info'
      );
      return { longAssets: [], shortAssets: [] };
    }

    // 计算权重 / Calculate weights
    let shortAssets = this._calculateWeights(shortCandidates, 'short');
    let longAssets = this._calculateWeights(longCandidates, 'long');

    // 市场中性调整 / Market neutral adjustment
    if (this.config.marketNeutral) {
      const result = this._adjustForMarketNeutral(longAssets, shortAssets);
      longAssets = result.longAssets;
      shortAssets = result.shortAssets;
    }

    this.log(
      `选择: 做多${longAssets.length}个(平均费率${(avgLowRate * 100).toFixed(4)}%), ` +
      `做空${shortAssets.length}个(平均费率${(avgHighRate * 100).toFixed(4)}%), ` +
      `利差${(spread * 100).toFixed(2)}%`,
      'info'
    );

    return { longAssets, shortAssets };
  }

  /**
   * 计算权重
   * Calculate weights
   *
   * @param {Array} assets - 资产列表 / Asset list
   * @param {string} side - 方向 / Side
   * @returns {Array} 带权重的资产 / Assets with weights
   * @private
   */
  _calculateWeights(assets, side) {
    if (assets.length === 0) return [];

    // 按极值程度加权 / Weight by extreme degree
    const totalExtreme = assets.reduce((sum, a) => sum + Math.abs(a.extremeScore), 0);

    return assets.map(asset => {
      const extremeWeight = totalExtreme > 0
        ? Math.abs(asset.extremeScore) / totalExtreme
        : 1 / assets.length;

      const weight = Math.min(
        extremeWeight * this.config.maxPositionPerSide,
        this.config.maxPositionPerAsset
      );

      return {
        ...asset,
        side,
        weight: Math.max(weight, 0.02),
      };
    });
  }

  /**
   * 调整为市场中性
   * Adjust for market neutral
   *
   * @param {Array} longAssets - 做多资产 / Long assets
   * @param {Array} shortAssets - 做空资产 / Short assets
   * @returns {Object} 调整后的资产 / Adjusted assets
   * @private
   */
  _adjustForMarketNeutral(longAssets, shortAssets) {
    const longWeight = longAssets.reduce((sum, a) => sum + a.weight, 0);
    const shortWeight = shortAssets.reduce((sum, a) => sum + a.weight, 0);

    if (longWeight === 0 || shortWeight === 0) {
      return { longAssets, shortAssets };
    }

    // 调整到相同权重 / Adjust to same weight
    const targetWeight = Math.min(longWeight, shortWeight, this.config.maxPositionPerSide);

    const longScale = targetWeight / longWeight;
    const shortScale = targetWeight / shortWeight;

    return {
      longAssets: longAssets.map(a => ({ ...a, weight: a.weight * longScale })),
      shortAssets: shortAssets.map(a => ({ ...a, weight: a.weight * shortScale })),
    };
  }

  /**
   * 检查并更新信号 (覆盖父类)
   * Check and update signals (override parent)
   * @private
   */
  async _checkAndUpdateSignals() {
    // 检查现有仓位的平仓条件 / Check close conditions for existing positions
    await this._checkCloseConditions();

    // 调用父类方法 / Call parent method
    await super._checkAndUpdateSignals();
  }

  /**
   * 检查平仓条件
   * Check close conditions
   * @private
   */
  async _checkCloseConditions() {
    for (const [symbol, position] of this.portfolioManager.currentPositions) {
      const currentRate = this.fundingManager.getCurrentRate(symbol);
      const entryRate = this.entryRates.get(symbol);
      const entryTime = this.entryTimes.get(symbol);

      if (!currentRate || !entryRate) continue;

      let shouldClose = false;
      let closeReason = '';

      // 条件1: 费率回归 / Condition 1: Rate reversion
      const rateReversion = position.side === 'short'
        ? (entryRate.rate - currentRate.rate) / Math.abs(entryRate.rate)
        : (currentRate.rate - entryRate.rate) / Math.abs(entryRate.rate);

      if (rateReversion >= this.config.rateReversionThreshold) {
        shouldClose = true;
        closeReason = `费率回归: ${(rateReversion * 100).toFixed(2)}%`;
      }

      // 条件2: 费率反转 / Condition 2: Rate reversal
      const annualizedCurrent = this.fundingManager.annualizeRate(currentRate.rate);
      if (position.side === 'short' && annualizedCurrent < this.config.rateReversalThreshold) {
        shouldClose = true;
        closeReason = `费率反转: 年化${(annualizedCurrent * 100).toFixed(2)}%`;
      }
      if (position.side === 'long' && annualizedCurrent > -this.config.rateReversalThreshold) {
        // 对于做多低费率，如果费率变为正值，可能需要平仓
        if (annualizedCurrent > this.config.absoluteHighThreshold * 0.5) {
          shouldClose = true;
          closeReason = `费率变高: 年化${(annualizedCurrent * 100).toFixed(2)}%`;
        }
      }

      // 条件3: 最大持仓时间 / Condition 3: Max holding time
      const holdingHours = (Date.now() - entryTime) / (60 * 60 * 1000);
      if (holdingHours >= this.config.maxHoldingHours) {
        shouldClose = true;
        closeReason = `达到最大持仓时间: ${holdingHours.toFixed(1)}小时`;
      }

      // 条件4: 综合止损 / Condition 4: Combined stop loss
      const fundingIncome = this.cumulativeFundingIncome.get(symbol) || 0;
      const priceMetrics = this.assetManager.getMetrics(symbol);
      if (priceMetrics && position.entryPrice) {
        const pricePnl = position.side === 'long'
          ? (priceMetrics.latestPrice - position.entryPrice) / position.entryPrice
          : (position.entryPrice - priceMetrics.latestPrice) / position.entryPrice;
        const combinedPnl = pricePnl + fundingIncome;

        if (combinedPnl < -this.config.combinedStopLoss) {
          shouldClose = true;
          closeReason = `综合止损: 价格${(pricePnl * 100).toFixed(2)}% + 费率${(fundingIncome * 100).toFixed(2)}%`;
        }
      }

      // 执行平仓 / Execute close
      if (shouldClose) {
        // 检查最小持仓时间 / Check min holding time
        if (holdingHours < this.config.minHoldingHours) {
          this.log(`${symbol} 跳过平仓: 未达最小持仓时间 ${holdingHours.toFixed(1)}/${this.config.minHoldingHours}小时`, 'info');
          continue;
        }

        this.log(`${symbol} 平仓条件触发: ${closeReason}`, 'info');
        await this._closePosition(symbol, closeReason);
      }
    }
  }

  /**
   * 开仓 (覆盖父类)
   * Open position (override parent)
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} target - 目标仓位 / Target position
   * @private
   */
  async _openPosition(symbol, target) {
    // 记录入场费率 / Record entry rate
    const currentRate = this.fundingManager.getCurrentRate(symbol);
    if (currentRate) {
      this.entryRates.set(symbol, { ...currentRate });
    }

    // 记录入场时间 / Record entry time
    this.entryTimes.set(symbol, Date.now());

    // 初始化费率收益 / Initialize funding income
    this.cumulativeFundingIncome.set(symbol, 0);

    // 记录入场价格 / Record entry price
    const metrics = this.assetManager.getMetrics(symbol);
    if (metrics) {
      target.entryPrice = metrics.latestPrice;
    }

    // 调用父类方法 / Call parent method
    await super._openPosition(symbol, target);

    // 记录开仓详情 / Log open details
    if (currentRate) {
      this.log(
        `${symbol} 开${target.side}: 费率${(currentRate.rate * 100).toFixed(4)}% ` +
        `(年化${(this.fundingManager.annualizeRate(currentRate.rate) * 100).toFixed(2)}%)`,
        'info'
      );
    }
  }

  /**
   * 平仓 (覆盖父类)
   * Close position (override parent)
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} reason - 原因 / Reason
   * @private
   */
  async _closePosition(symbol, reason) {
    // 记录费率收益 / Log funding income
    const fundingIncome = this.cumulativeFundingIncome.get(symbol) || 0;
    this.log(`${symbol} 累计费率收益: ${(fundingIncome * 100).toFixed(4)}%`, 'info');

    // 清除记录 / Clear records
    this.entryRates.delete(symbol);
    this.entryTimes.delete(symbol);
    this.cumulativeFundingIncome.delete(symbol);

    // 调用父类方法 / Call parent method
    await super._closePosition(symbol, reason);
  }

  /**
   * 获取策略状态 (覆盖父类)
   * Get strategy status (override parent)
   *
   * @returns {Object} 策略状态 / Strategy status
   */
  getStatus() {
    const baseStatus = super.getStatus();

    // 计算当前利差 / Calculate current spread
    const ranking = this.getCurrentRanking();
    const highRates = ranking.slice(0, this.config.topN);
    const lowRates = ranking.slice(-this.config.bottomN);

    const avgHighRate = highRates.length > 0
      ? highRates.reduce((sum, r) => sum + r.annualizedRate, 0) / highRates.length
      : 0;
    const avgLowRate = lowRates.length > 0
      ? lowRates.reduce((sum, r) => sum + r.annualizedRate, 0) / lowRates.length
      : 0;

    return {
      ...baseStatus,
      extremeDetection: this.config.extremeDetection,
      fundingStats: this.fundingStats,
      currentSpread: avgHighRate - avgLowRate,
      avgHighRate,
      avgLowRate,
      positionsWithFunding: Array.from(this.cumulativeFundingIncome.entries()).map(([symbol, income]) => ({
        symbol,
        fundingIncome: income,
        entryRate: this.entryRates.get(symbol)?.rate,
        currentRate: this.fundingManager.getCurrentRate(symbol)?.rate,
      })),
    };
  }

  /**
   * 获取费率排名详情
   * Get funding rate ranking details
   *
   * @returns {Array} 排名详情 / Ranking details
   */
  getFundingRateRankingDetails() {
    const ranking = this.getCurrentRanking();

    return ranking.map(item => ({
      symbol: item.symbol,
      rank: item.rank,
      currentRate: item.value,
      annualizedRate: item.annualizedRate,
      extremeScore: item.extremeScore,
      zScore: item.zScore,
      percentile: item.percentile,
      predictedRate: item.predictedRate,
      isHighExtreme: this._isHighExtreme(item),
      isLowExtreme: this._isLowExtreme(item),
      recommendedAction: this._isHighExtreme(item) ? 'short' : (this._isLowExtreme(item) ? 'long' : 'none'),
    }));
  }
}

// ============================================
// 导出 / Exports
// ============================================

export {
  DEFAULT_CONFIG as FUNDING_EXTREME_DEFAULT_CONFIG,
};

export default FundingRateExtremeStrategy;
