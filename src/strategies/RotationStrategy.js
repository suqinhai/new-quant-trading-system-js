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
import {
  CrossSectionalStrategy,
  CROSS_SECTIONAL_TYPES,
  RANK_DIRECTION,
  POSITION_TYPE,
} from './CrossSectionalStrategy.js';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 强弱指标类型
 * Strength metric types
 */
export const STRENGTH_METRICS = {
  RELATIVE_STRENGTH: 'relative_strength',   // 相对强弱 (相对于基准)
  MOMENTUM: 'momentum',                      // 动量
  RISK_ADJUSTED: 'risk_adjusted',            // 风险调整收益
  TREND_STRENGTH: 'trend_strength',          // 趋势强度
  COMPOSITE: 'composite',                    // 复合指标
};

/**
 * 轮动触发类型
 * Rotation trigger types
 */
export const ROTATION_TRIGGERS = {
  PERIODIC: 'periodic',           // 周期性轮动
  RANK_CHANGE: 'rank_change',     // 排名变化触发
  THRESHOLD: 'threshold',         // 阈值触发
  HYBRID: 'hybrid',               // 混合触发
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  name: 'RotationStrategy',

  // 监控的交易对列表 / Symbols to monitor
  // 注意: 永续合约需要使用 :USDT 后缀格式
  symbols: [
    'BTC/USDT:USDT', 'ETH/USDT:USDT', 'BNB/USDT:USDT', 'SOL/USDT:USDT', 'XRP/USDT:USDT',
    'ADA/USDT:USDT', 'AVAX/USDT:USDT', 'DOGE/USDT:USDT', 'DOT/USDT:USDT', 'MATIC/USDT:USDT',
    'LINK/USDT:USDT', 'UNI/USDT:USDT', 'ATOM/USDT:USDT', 'LTC/USDT:USDT', 'ETC/USDT:USDT',
    'FIL/USDT:USDT', 'APT/USDT:USDT', 'OP/USDT:USDT', 'ARB/USDT:USDT', 'INJ/USDT:USDT',
  ],

  // 基准资产 (用于计算相对强弱) / Benchmark asset
  benchmarkSymbol: 'BTC/USDT:USDT',

  // ============================================
  // 轮动配置 / Rotation Configuration
  // ============================================

  // 回看周期 / Lookback period
  lookbackPeriod: 14,

  // 短期回看 / Short-term lookback
  shortLookback: 7,

  // 长期回看 / Long-term lookback
  longLookback: 30,

  // 强弱指标 / Strength metric
  strengthMetric: STRENGTH_METRICS.COMPOSITE,

  // 轮动触发类型 / Rotation trigger type
  rotationTrigger: ROTATION_TRIGGERS.HYBRID,

  // ============================================
  // 选股配置 / Selection Configuration
  // ============================================

  // Top N 数量 / Top N count
  topN: 5,

  // Bottom N 数量 / Bottom N count
  bottomN: 3,

  // 排名方向 / Ranking direction
  rankDirection: RANK_DIRECTION.DESCENDING,

  // 最小强弱分数阈值 / Minimum strength score threshold
  minStrengthScore: 0.02,

  // 最大强弱分数阈值 (用于做空) / Max strength score threshold (for short)
  maxWeakScore: -0.02,

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 仓位类型 / Position type
  positionType: POSITION_TYPE.LONG_SHORT,

  // 单个资产最大仓位 / Max position per asset
  maxPositionPerAsset: 0.12,

  // 单边总仓位 / Total position per side
  maxPositionPerSide: 0.6,

  // 等权重 / Equal weight
  equalWeight: false,

  // 使用强弱加权 / Use strength-weighted
  strengthWeighted: true,

  // ============================================
  // 轮动触发配置 / Rotation Trigger Configuration
  // ============================================

  // 轮动周期 (毫秒) / Rotation period (ms)
  rebalancePeriod: 4 * 60 * 60 * 1000, // 每4小时 / Every 4 hours

  // 最小排名变化触发轮动 / Min rank change to trigger rotation
  minRankChangeToRotate: 3,

  // 强弱分数变化阈值 / Strength score change threshold
  strengthChangeThreshold: 0.05,

  // 是否在强弱反转时立即轮动 / Rotate immediately on strength reversal
  rotateOnReversal: true,

  // ============================================
  // 缓冲区配置 / Buffer Zone Configuration
  // ============================================

  // 是否使用缓冲区 (防止频繁轮动) / Use buffer zone
  useBufferZone: true,

  // 缓冲区大小 (排名) / Buffer zone size (ranks)
  bufferZoneSize: 2,

  // 最小持仓周期 (毫秒) / Minimum holding period (ms)
  minHoldingPeriod: 24 * 60 * 60 * 1000, // 至少1天

  // ============================================
  // 相对强弱配置 / Relative Strength Configuration
  // ============================================

  // 是否计算相对强弱 / Calculate relative strength
  calculateRelativeStrength: true,

  // RS阈值 (强势) / RS threshold (strong)
  rsStrongThreshold: 1.05,

  // RS阈值 (弱势) / RS threshold (weak)
  rsWeakThreshold: 0.95,

  // ============================================
  // 趋势过滤配置 / Trend Filter Configuration
  // ============================================

  // 是否使用趋势过滤 / Use trend filter
  useTrendFilter: true,

  // 趋势判断周期 / Trend period
  trendPeriod: 20,

  // 只在上涨趋势中做多 / Only long in uptrend
  longOnlyInUptrend: false,

  // 只在下跌趋势中做空 / Only short in downtrend
  shortOnlyInDowntrend: false,

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  stopLoss: 0.10,
  takeProfit: 0.25,
  maxDrawdown: 0.15,

  // 是否使用动态止损 / Use dynamic stop loss
  useDynamicStopLoss: true,

  // 动态止损 ATR 乘数 / Dynamic stop loss ATR multiplier
  atrStopMultiplier: 2.5,

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  verbose: true,
  logPrefix: '[Rotation]',
};

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 强弱轮动策略
 * Strength Rotation Strategy
 */
export class RotationStrategy extends CrossSectionalStrategy {
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
    this.strategyType = CROSS_SECTIONAL_TYPES.ROTATION;

    // 强弱分数历史 / Strength score history
    this.strengthHistory = new Map();

    // 相对强弱缓存 / Relative strength cache
    this.relativeStrength = new Map();

    // 入场时间记录 / Entry time records
    this.entryTimes = new Map();

    // 上次轮动时间 / Last rotation time
    this.lastRotationTime = 0;

    // 轮动历史 / Rotation history
    this.rotationHistory = [];

    // ATR 缓存 / ATR cache
    this.atrCache = new Map();
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 轮动策略只需要 K 线数据 / Rotation strategy only needs kline
    return ['kline'];
  }

  /**
   * 初始化策略
   * Initialize strategy
   */
  async onInit() {
    this.log('强弱轮动策略初始化', 'info');
    this.log(`强弱指标: ${this.config.strengthMetric}`, 'info');
    this.log(`轮动触发: ${this.config.rotationTrigger}`, 'info');
    this.log(`Top N: ${this.config.topN}, Bottom N: ${this.config.bottomN}`, 'info');

    // 调用父类初始化 / Call parent init
    await super.onInit();
  }

  /**
   * 计算强弱分数
   * Calculate strength score
   *
   * @param {Object} metrics - 资产指标 / Asset metrics
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 强弱分数 / Strength score
   */
  calculateStrengthScore(metrics, symbol) {
    if (!metrics) return 0;

    switch (this.config.strengthMetric) {
      case STRENGTH_METRICS.RELATIVE_STRENGTH:
        return this._calculateRelativeStrength(symbol);

      case STRENGTH_METRICS.MOMENTUM:
        return metrics.momentum || 0;

      case STRENGTH_METRICS.RISK_ADJUSTED:
        return metrics.sharpe || 0;

      case STRENGTH_METRICS.TREND_STRENGTH:
        return this._calculateTrendStrength(metrics);

      case STRENGTH_METRICS.COMPOSITE:
      default:
        return this._calculateCompositeStrength(metrics, symbol);
    }
  }

  /**
   * 计算相对强弱
   * Calculate relative strength
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 相对强弱值 / Relative strength value
   * @private
   */
  _calculateRelativeStrength(symbol) {
    // 获取资产和基准的指标 / Get metrics for asset and benchmark
    const assetMetrics = this.assetManager.getMetrics(symbol);
    const benchmarkMetrics = this.assetManager.getMetrics(this.config.benchmarkSymbol);

    if (!assetMetrics || !benchmarkMetrics) {
      return 0;
    }

    // 计算相对强弱: 资产收益 / 基准收益
    // Calculate RS: asset return / benchmark return
    const assetReturn = assetMetrics.returns || 0;
    const benchmarkReturn = benchmarkMetrics.returns || 0;

    // 避免除以零 / Avoid division by zero
    if (Math.abs(benchmarkReturn) < 0.0001) {
      return assetReturn > 0 ? 1.1 : (assetReturn < 0 ? 0.9 : 1.0);
    }

    // RS = (1 + asset_return) / (1 + benchmark_return)
    const rs = (1 + assetReturn) / (1 + benchmarkReturn);

    // 保存到缓存 / Save to cache
    this.relativeStrength.set(symbol, rs);

    return rs - 1; // 转换为超额收益 / Convert to excess return
  }

  /**
   * 计算趋势强度
   * Calculate trend strength
   *
   * @param {Object} metrics - 资产指标 / Asset metrics
   * @returns {number} 趋势强度 / Trend strength
   * @private
   */
  _calculateTrendStrength(metrics) {
    if (!metrics) return 0;

    // 综合动量和波动率 / Combine momentum and volatility
    const momentum = metrics.momentum || 0;
    const volatility = metrics.volatility || 0.01;

    // 趋势强度 = 动量 / 波动率 (信噪比)
    // Trend strength = momentum / volatility (SNR)
    return momentum / volatility;
  }

  /**
   * 计算复合强弱分数
   * Calculate composite strength score
   *
   * @param {Object} metrics - 资产指标 / Asset metrics
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 复合强弱分数 / Composite strength score
   * @private
   */
  _calculateCompositeStrength(metrics, symbol) {
    if (!metrics) return 0;

    // 各项指标 / Individual metrics
    const momentum = metrics.momentum || 0;
    const returns = metrics.returns || 0;
    const sharpe = metrics.sharpe || 0;
    const rs = this._calculateRelativeStrength(symbol);
    const trendStrength = this._calculateTrendStrength(metrics);

    // RSI 调整因子 / RSI adjustment factor
    const rsi = metrics.rsi || 50;
    const rsiAdjust = rsi > 70 ? 0.9 : (rsi < 30 ? 1.1 : 1.0);

    // 复合分数 / Composite score
    const compositeScore = (
      momentum * 0.25 +
      returns * 0.20 +
      sharpe * 0.20 +
      rs * 0.20 +
      trendStrength * 0.15
    ) * rsiAdjust;

    return compositeScore;
  }

  /**
   * 计算 ATR
   * Calculate ATR
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} ATR值 / ATR value
   * @private
   */
  _calculateATR(symbol) {
    const history = this.assetManager.getHistory(symbol);
    if (history.length < 14) return 0;

    const period = 14;
    const recent = history.slice(-period);
    let atrSum = 0;

    for (let i = 1; i < recent.length; i++) {
      const high = recent[i].high;
      const low = recent[i].low;
      const prevClose = recent[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      atrSum += tr;
    }

    const atr = atrSum / (period - 1);
    this.atrCache.set(symbol, atr);
    return atr;
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
      const metrics = this.assetManager.getMetrics(symbol);
      if (!metrics) continue;

      // 计算强弱分数 / Calculate strength score
      const strengthScore = this.calculateStrengthScore(metrics, symbol);

      // 趋势过滤 / Trend filter
      if (this.config.useTrendFilter) {
        const trend = this._detectTrend(symbol);

        // 如果只在上涨趋势做多，跳过非上涨资产
        // If long only in uptrend, skip non-uptrending assets
        if (this.config.longOnlyInUptrend && trend <= 0 && strengthScore > 0) {
          continue;
        }

        // 如果只在下跌趋势做空，跳过非下跌资产
        // If short only in downtrend, skip non-downtrending assets
        if (this.config.shortOnlyInDowntrend && trend >= 0 && strengthScore < 0) {
          continue;
        }
      }

      // 记录强弱历史 / Record strength history
      this._recordStrengthHistory(symbol, strengthScore);

      ranking.push({
        symbol,
        value: strengthScore,
        metrics,
        relativeStrength: this.relativeStrength.get(symbol) || 1,
        atr: this._calculateATR(symbol),
      });
    }

    // 排序 / Sort
    ranking.sort((a, b) => {
      if (this.config.rankDirection === RANK_DIRECTION.DESCENDING) {
        return b.value - a.value;
      }
      return a.value - b.value;
    });

    // 添加排名 / Add rank
    ranking.forEach((item, index) => {
      item.rank = index + 1;
    });

    return ranking;
  }

  /**
   * 检测趋势
   * Detect trend
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {number} 趋势 (1=上涨, -1=下跌, 0=震荡) / Trend
   * @private
   */
  _detectTrend(symbol) {
    const history = this.assetManager.getHistory(symbol);
    if (history.length < this.config.trendPeriod) return 0;

    const recent = history.slice(-this.config.trendPeriod);
    const firstPrice = recent[0].close;
    const lastPrice = recent[recent.length - 1].close;

    // 计算趋势斜率 / Calculate trend slope
    const slope = (lastPrice - firstPrice) / firstPrice;

    // 计算SMA / Calculate SMA
    const smaSum = recent.reduce((sum, c) => sum + c.close, 0);
    const sma = smaSum / recent.length;

    // 综合判断 / Combined judgment
    if (lastPrice > sma && slope > 0.02) return 1;  // 上涨
    if (lastPrice < sma && slope < -0.02) return -1; // 下跌
    return 0; // 震荡
  }

  /**
   * 记录强弱历史
   * Record strength history
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} score - 强弱分数 / Strength score
   * @private
   */
  _recordStrengthHistory(symbol, score) {
    if (!this.strengthHistory.has(symbol)) {
      this.strengthHistory.set(symbol, []);
    }

    const history = this.strengthHistory.get(symbol);
    history.push({
      score,
      timestamp: Date.now(),
    });

    // 保留最近 30 条 / Keep last 30 records
    if (history.length > 30) {
      history.shift();
    }
  }

  /**
   * 检查是否应该轮动
   * Check if should rotate
   *
   * @param {Array} ranking - 当前排名 / Current ranking
   * @returns {boolean} 是否轮动 / Whether to rotate
   * @private
   */
  _shouldRotate(ranking) {
    const now = Date.now();

    switch (this.config.rotationTrigger) {
      case ROTATION_TRIGGERS.PERIODIC:
        return now - this.lastRotationTime >= this.config.rebalancePeriod;

      case ROTATION_TRIGGERS.RANK_CHANGE:
        return this._checkSignificantRankChange(ranking);

      case ROTATION_TRIGGERS.THRESHOLD:
        return this._checkStrengthThreshold(ranking);

      case ROTATION_TRIGGERS.HYBRID:
      default:
        // 满足周期条件，或者排名/强弱变化显著
        // Meet period condition, or significant rank/strength change
        const periodicTrigger = now - this.lastRotationTime >= this.config.rebalancePeriod;
        const rankChangeTrigger = this._checkSignificantRankChange(ranking);
        const thresholdTrigger = this._checkStrengthThreshold(ranking);

        return periodicTrigger || (rankChangeTrigger && thresholdTrigger);
    }
  }

  /**
   * 检查显著排名变化
   * Check significant rank change
   *
   * @param {Array} ranking - 当前排名 / Current ranking
   * @returns {boolean} 是否有显著变化 / Whether significant change
   * @private
   */
  _checkSignificantRankChange(ranking) {
    // 检查当前持仓的排名变化 / Check rank changes for current positions
    for (const [symbol, position] of this.portfolioManager.currentPositions) {
      const rankingItem = ranking.find(r => r.symbol === symbol);
      if (!rankingItem) continue;

      // 检查缓冲区 / Check buffer zone
      if (this.config.useBufferZone) {
        if (position.side === 'long') {
          // 多头：如果排名下降超出 topN + buffer，触发轮动
          // Long: if rank drops below topN + buffer, trigger rotation
          if (rankingItem.rank > this.config.topN + this.config.bufferZoneSize) {
            return true;
          }
        } else {
          // 空头：如果排名上升超出 bottomN + buffer，触发轮动
          // Short: if rank rises above bottomN + buffer, trigger rotation
          const bottomThreshold = ranking.length - this.config.bottomN - this.config.bufferZoneSize;
          if (rankingItem.rank < bottomThreshold) {
            return true;
          }
        }
      } else {
        // 无缓冲区：严格按 topN/bottomN
        // No buffer: strict topN/bottomN
        if (position.side === 'long' && rankingItem.rank > this.config.topN) {
          return true;
        }
        if (position.side === 'short') {
          const bottomThreshold = ranking.length - this.config.bottomN;
          if (rankingItem.rank < bottomThreshold) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 检查强弱阈值
   * Check strength threshold
   *
   * @param {Array} ranking - 当前排名 / Current ranking
   * @returns {boolean} 是否触发 / Whether triggered
   * @private
   */
  _checkStrengthThreshold(ranking) {
    // 检查当前持仓的强弱分数变化 / Check strength score changes for current positions
    for (const [symbol, position] of this.portfolioManager.currentPositions) {
      const history = this.strengthHistory.get(symbol);
      if (!history || history.length < 2) continue;

      const currentScore = history[history.length - 1].score;
      const prevScore = history[history.length - 2].score;
      const change = currentScore - prevScore;

      // 检查强弱反转 / Check strength reversal
      if (this.config.rotateOnReversal) {
        if (position.side === 'long' && currentScore < this.config.maxWeakScore) {
          this.log(`${symbol} 强弱反转: ${prevScore.toFixed(4)} -> ${currentScore.toFixed(4)}`, 'warn');
          return true;
        }
        if (position.side === 'short' && currentScore > this.config.minStrengthScore) {
          this.log(`${symbol} 强弱反转: ${prevScore.toFixed(4)} -> ${currentScore.toFixed(4)}`, 'warn');
          return true;
        }
      }

      // 检查强弱变化阈值 / Check strength change threshold
      if (Math.abs(change) >= this.config.strengthChangeThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * 选择资产 (覆盖父类)
   * Select assets (override parent)
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Object} 做多和做空资产 / Long and short assets
   */
  _selectAssets(ranking) {
    let longAssets = [];
    let shortAssets = [];

    // 选择做多资产 (Top N, 且强弱分数 > 最小阈值)
    // Select long assets (Top N, and strength score > min threshold)
    if (this.config.positionType !== POSITION_TYPE.SHORT_ONLY) {
      const topCandidates = ranking.slice(0, this.config.topN);

      for (const candidate of topCandidates) {
        // 检查强弱阈值 / Check strength threshold
        if (candidate.value >= this.config.minStrengthScore) {
          // 检查最小持仓周期 / Check min holding period
          if (!this._canClose(candidate.symbol)) {
            // 如果还在最小持仓周期内，保持现有仓位
            // If still in min holding period, keep existing position
            const existing = this.portfolioManager.currentPositions.get(candidate.symbol);
            if (existing && existing.side === 'long') {
              longAssets.push(candidate);
              continue;
            }
          }

          longAssets.push(candidate);
        }
      }
    }

    // 选择做空资产 (Bottom N, 且强弱分数 < 最大阈值)
    // Select short assets (Bottom N, and strength score < max threshold)
    if (this.config.positionType !== POSITION_TYPE.LONG_ONLY) {
      const bottomCandidates = ranking.slice(-this.config.bottomN);

      for (const candidate of bottomCandidates) {
        // 检查强弱阈值 / Check strength threshold
        if (candidate.value <= this.config.maxWeakScore) {
          // 检查最小持仓周期 / Check min holding period
          if (!this._canClose(candidate.symbol)) {
            const existing = this.portfolioManager.currentPositions.get(candidate.symbol);
            if (existing && existing.side === 'short') {
              shortAssets.push(candidate);
              continue;
            }
          }

          shortAssets.push(candidate);
        }
      }
    }

    // 强弱加权 / Strength weighting
    if (this.config.strengthWeighted) {
      longAssets = this._applyStrengthWeighting(longAssets, 'long');
      shortAssets = this._applyStrengthWeighting(shortAssets, 'short');
    }

    return { longAssets, shortAssets };
  }

  /**
   * 检查是否可以平仓
   * Check if can close
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {boolean} 是否可以平仓 / Whether can close
   * @private
   */
  _canClose(symbol) {
    const entryTime = this.entryTimes.get(symbol);
    if (!entryTime) return true;

    return Date.now() - entryTime >= this.config.minHoldingPeriod;
  }

  /**
   * 应用强弱加权
   * Apply strength weighting
   *
   * @param {Array} assets - 资产列表 / Asset list
   * @param {string} side - 方向 / Side
   * @returns {Array} 加权后的资产 / Weighted assets
   * @private
   */
  _applyStrengthWeighting(assets, side) {
    if (assets.length === 0) return assets;

    // 计算强弱分数的绝对值之和 / Calculate sum of absolute strength scores
    const totalStrength = assets.reduce((sum, a) => sum + Math.abs(a.value), 0);
    if (totalStrength === 0) return assets;

    // 按强弱分数分配权重 / Allocate weights by strength score
    return assets.map(a => {
      const strengthWeight = Math.abs(a.value) / totalStrength;
      const baseWeight = this.config.maxPositionPerSide / assets.length;

      // 混合等权重和强弱加权 / Mix equal weight and strength weight
      const weight = baseWeight * 0.5 + strengthWeight * this.config.maxPositionPerSide * 0.5;

      return {
        ...a,
        weight: Math.min(weight, this.config.maxPositionPerAsset),
      };
    });
  }

  /**
   * 执行再平衡 (覆盖父类)
   * Execute rebalancing (override parent)
   * @private
   */
  async _executeRebalance() {
    // 获取排名 / Get ranking
    const ranking = this.getCurrentRanking();

    // 检查是否应该轮动 / Check if should rotate
    if (!this._shouldRotate(ranking)) {
      if (this.config.verbose) {
        this.log('未触发轮动条件', 'debug');
      }
      return;
    }

    // 记录轮动 / Record rotation
    this.lastRotationTime = Date.now();
    this.rotationHistory.push({
      timestamp: this.lastRotationTime,
      ranking: ranking.slice(0, 10).map(r => ({ symbol: r.symbol, rank: r.rank, score: r.value })),
    });

    // 调用父类执行再平衡 / Call parent to execute rebalance
    await super._executeRebalance();

    this.log(`轮动完成，时间: ${new Date().toISOString()}`, 'info');
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
    // 记录入场时间 / Record entry time
    this.entryTimes.set(symbol, Date.now());

    // 如果使用动态止损，计算止损价格 / If using dynamic stop, calculate stop price
    if (this.config.useDynamicStopLoss) {
      const atr = this.atrCache.get(symbol) || 0;
      const metrics = this.assetManager.getMetrics(symbol);
      if (metrics && atr > 0) {
        const dynamicStop = atr * this.config.atrStopMultiplier / metrics.latestPrice;
        this.log(`${symbol} 动态止损: ${(dynamicStop * 100).toFixed(2)}%`, 'info');
      }
    }

    // 调用父类方法 / Call parent method
    await super._openPosition(symbol, target);
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
    // 清除记录 / Clear records
    this.entryTimes.delete(symbol);

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

    return {
      ...baseStatus,
      strengthMetric: this.config.strengthMetric,
      rotationTrigger: this.config.rotationTrigger,
      lastRotationTime: this.lastRotationTime,
      rotationCount: this.rotationHistory.length,
      relativeStrength: Object.fromEntries(this.relativeStrength),
    };
  }

  /**
   * 获取轮动历史
   * Get rotation history
   *
   * @returns {Array} 轮动历史 / Rotation history
   */
  getRotationHistory() {
    return this.rotationHistory;
  }

  /**
   * 获取强弱排名详情
   * Get strength ranking details
   *
   * @returns {Array} 排名详情 / Ranking details
   */
  getStrengthRankingDetails() {
    const ranking = this.getCurrentRanking();

    return ranking.map(item => ({
      symbol: item.symbol,
      rank: item.rank,
      strengthScore: item.value,
      relativeStrength: this.relativeStrength.get(item.symbol) || 1,
      isStrong: item.value >= this.config.minStrengthScore,
      isWeak: item.value <= this.config.maxWeakScore,
      inTopN: item.rank <= this.config.topN,
      inBottomN: item.rank > ranking.length - this.config.bottomN,
    }));
  }
}

// ============================================
// 导出 / Exports
// ============================================

export {
  DEFAULT_CONFIG as ROTATION_DEFAULT_CONFIG,
};

export default RotationStrategy;
