/**
 * 动量横截面策略
 * Momentum Cross-Sectional Strategy
 *
 * 基于多币种动量排名的横截面策略
 * Cross-sectional strategy based on momentum ranking across multiple assets
 *
 * 策略原理 / Strategy Principle:
 * 1. 计算所有资产在回看周期内的动量 (收益率/夏普比等)
 * 2. 按动量排名，做多Top N强势资产，做空Bottom N弱势资产
 * 3. 定期再平衡，保持组合与排名同步
 * 4. 可选市场中性模式，控制净敞口
 *
 * 1. Calculate momentum (returns/sharpe/etc.) for all assets over lookback period
 * 2. Rank by momentum, long Top N strong assets, short Bottom N weak assets
 * 3. Periodically rebalance to keep portfolio aligned with rankings
 * 4. Optional market-neutral mode to control net exposure
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
 * 动量指标类型
 * Momentum metric types
 */
export const MOMENTUM_METRICS = {
  RETURNS: 'returns',           // 累计收益率
  SHARPE: 'sharpe',             // 夏普比
  MOMENTUM: 'momentum',         // 价格动量 (ROC)
  RSI: 'rsi',                   // RSI
  RISK_ADJUSTED: 'risk_adjusted', // 风险调整后收益
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  // 策略名称 / Strategy name
  name: 'MomentumRankStrategy',

  // 监控的交易对列表 / Symbols to monitor
  symbols: [
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
    'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT',
    'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'ETC/USDT',
  ],

  // ============================================
  // 动量配置 / Momentum Configuration
  // ============================================

  // 动量计算周期 (K线数量) / Momentum calculation period
  lookbackPeriod: 20,

  // 短期动量周期 / Short-term momentum period
  shortMomentumPeriod: 5,

  // 长期动量周期 / Long-term momentum period
  longMomentumPeriod: 60,

  // 动量指标 / Momentum metric
  momentumMetric: MOMENTUM_METRICS.RETURNS,

  // 是否使用复合动量 / Use composite momentum
  useCompositeMomentum: true,

  // 复合动量权重 / Composite momentum weights
  compositeMomentumWeights: {
    returns: 0.4,       // 收益率权重
    sharpe: 0.3,        // 夏普比权重
    momentum: 0.2,      // 动量权重
    rsi: 0.1,           // RSI权重
  },

  // ============================================
  // 排名配置 / Ranking Configuration
  // ============================================

  // 选取 Top N 个做多 / Select top N for long
  topN: 3,

  // 选取 Bottom N 个做空 / Select bottom N for short
  bottomN: 3,

  // 排名方向 / Ranking direction
  rankDirection: RANK_DIRECTION.DESCENDING,

  // 最小排名变化触发再平衡 / Min rank change to trigger rebalance
  minRankChangeToRebalance: 2,

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 仓位类型 / Position type
  positionType: POSITION_TYPE.LONG_SHORT,

  // 单个资产最大仓位比例 / Max position per asset
  maxPositionPerAsset: 0.15,

  // 单边总仓位比例 / Total position per side
  maxPositionPerSide: 0.5,

  // 是否等权重 / Equal weight
  equalWeight: true,

  // 是否市场中性 / Market neutral
  marketNeutral: false,

  // ============================================
  // 再平衡配置 / Rebalancing Configuration
  // ============================================

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 1 * 60 * 60 * 1000, // 每小时 / Every hour

  // 是否在排名显著变化时再平衡 / Rebalance on significant rank change
  rebalanceOnRankChange: true,

  // 动量反转阈值 (排名变化) / Momentum reversal threshold
  momentumReversalThreshold: 5,

  // ============================================
  // 动量增强配置 / Momentum Enhancement Configuration
  // ============================================

  // 是否使用动量增强 / Use momentum enhancement
  useMomentumEnhancement: true,

  // 动量加速因子阈值 / Momentum acceleration threshold
  momentumAccelerationThreshold: 0.02,

  // 动量减速因子阈值 / Momentum deceleration threshold
  momentumDecelerationThreshold: -0.02,

  // 是否过滤动量反转 / Filter momentum reversals
  filterMomentumReversals: true,

  // ============================================
  // 波动率过滤配置 / Volatility Filter Configuration
  // ============================================

  // 是否使用波动率过滤 / Use volatility filter
  useVolatilityFilter: true,

  // 最小波动率 / Minimum volatility
  minVolatility: 0.01,

  // 最大波动率 / Maximum volatility
  maxVolatility: 0.20,

  // 波动率调整权重 / Volatility-adjusted weights
  volatilityAdjustedWeights: true,

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 单资产止损 / Per-asset stop loss
  stopLoss: 0.08,

  // 单资产止盈 / Per-asset take profit
  takeProfit: 0.20,

  // 组合最大回撤 / Portfolio max drawdown
  maxDrawdown: 0.15,

  // 是否使用跟踪止损 / Use trailing stop
  useTrailingStop: true,

  // 跟踪止损比例 / Trailing stop ratio
  trailingStopRatio: 0.05,

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  verbose: true,
  logPrefix: '[MomentumRank]',
};

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 动量横截面策略
 * Momentum Cross-Sectional Strategy
 */
export class MomentumRankStrategy extends CrossSectionalStrategy {
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
    this.strategyType = CROSS_SECTIONAL_TYPES.MOMENTUM_RANK;

    // 上一次排名 / Previous ranking
    this.previousRanking = [];

    // 动量加速度缓存 / Momentum acceleration cache
    this.momentumAcceleration = new Map();

    // 历史动量记录 / Historical momentum records
    this.momentumHistory = new Map();

    // 入场价格记录 / Entry price records
    this.entryPrices = new Map();

    // 最高价格记录 (用于跟踪止损) / Peak prices (for trailing stop)
    this.peakPrices = new Map();
  }

  /**
   * 初始化策略
   * Initialize strategy
   */
  async onInit() {
    this.log('动量横截面策略初始化', 'info');
    this.log(`动量指标: ${this.config.momentumMetric}`, 'info');
    this.log(`使用复合动量: ${this.config.useCompositeMomentum}`, 'info');

    // 调用父类初始化 / Call parent init
    await super.onInit();
  }

  /**
   * 计算复合动量分数
   * Calculate composite momentum score
   *
   * @param {Object} metrics - 资产指标 / Asset metrics
   * @returns {number} 复合动量分数 / Composite momentum score
   */
  calculateCompositeMomentum(metrics) {
    if (!this.config.useCompositeMomentum) {
      return metrics[this.config.momentumMetric] || 0;
    }

    const weights = this.config.compositeMomentumWeights;
    let score = 0;
    let totalWeight = 0;

    // 计算加权分数 / Calculate weighted score
    for (const [metric, weight] of Object.entries(weights)) {
      if (metrics[metric] !== undefined) {
        // 标准化指标值 / Normalize metric value
        let normalizedValue = metrics[metric];

        // RSI 需要转换为 [-1, 1] 范围 / RSI needs to be converted to [-1, 1] range
        if (metric === 'rsi') {
          normalizedValue = (metrics[metric] - 50) / 50;
        }

        score += normalizedValue * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * 获取排名 (覆盖父类方法)
   * Get ranking (override parent method)
   *
   * @returns {Array} 排名列表 / Ranking list
   */
  getCurrentRanking() {
    const ranking = [];

    // 收集所有资产的动量分数 / Collect momentum scores from all assets
    for (const symbol of this.config.symbols) {
      const metrics = this.assetManager.getMetrics(symbol);
      if (!metrics) continue;

      // 计算复合动量分数 / Calculate composite momentum score
      const momentumScore = this.calculateCompositeMomentum(metrics);

      // 计算动量加速度 / Calculate momentum acceleration
      const acceleration = this._calculateMomentumAcceleration(symbol, momentumScore);

      // 应用波动率过滤 / Apply volatility filter
      if (this.config.useVolatilityFilter) {
        if (metrics.volatility < this.config.minVolatility ||
            metrics.volatility > this.config.maxVolatility) {
          continue;
        }
      }

      // 过滤动量反转 / Filter momentum reversals
      if (this.config.filterMomentumReversals) {
        if (acceleration < this.config.momentumDecelerationThreshold) {
          // 动量正在快速减速，可能反转 / Momentum decelerating fast, may reverse
          continue;
        }
      }

      ranking.push({
        symbol,
        value: momentumScore,
        metrics,
        acceleration,
        volatility: metrics.volatility,
      });
    }

    // 排序 / Sort
    ranking.sort((a, b) => {
      if (this.config.rankDirection === RANK_DIRECTION.DESCENDING) {
        return b.value - a.value;
      } else {
        return a.value - b.value;
      }
    });

    // 添加排名 / Add rank
    ranking.forEach((item, index) => {
      item.rank = index + 1;
    });

    return ranking;
  }

  /**
   * 计算动量加速度
   * Calculate momentum acceleration
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} currentMomentum - 当前动量 / Current momentum
   * @returns {number} 加速度 / Acceleration
   * @private
   */
  _calculateMomentumAcceleration(symbol, currentMomentum) {
    // 获取历史动量 / Get historical momentum
    if (!this.momentumHistory.has(symbol)) {
      this.momentumHistory.set(symbol, []);
    }

    const history = this.momentumHistory.get(symbol);

    // 添加当前动量 / Add current momentum
    history.push({
      momentum: currentMomentum,
      timestamp: Date.now(),
    });

    // 保留最近10个记录 / Keep last 10 records
    if (history.length > 10) {
      history.shift();
    }

    // 计算加速度 / Calculate acceleration
    if (history.length < 2) {
      return 0;
    }

    const recent = history[history.length - 1].momentum;
    const previous = history[history.length - 2].momentum;

    const acceleration = recent - previous;

    // 保存加速度 / Save acceleration
    this.momentumAcceleration.set(symbol, acceleration);

    return acceleration;
  }

  /**
   * 选择资产 (覆盖父类方法)
   * Select assets (override parent method)
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Object} 做多和做空资产 / Long and short assets
   */
  _selectAssets(ranking) {
    let longAssets = [];
    let shortAssets = [];

    // 检查排名变化 / Check rank changes
    const rankChanges = this._checkRankChanges(ranking);

    // 选择做多资产 / Select long assets
    if (this.config.positionType !== POSITION_TYPE.SHORT_ONLY) {
      const candidates = ranking.slice(0, this.config.topN);

      for (const candidate of candidates) {
        // 动量增强检查 / Momentum enhancement check
        if (this.config.useMomentumEnhancement) {
          const acceleration = this.momentumAcceleration.get(candidate.symbol) || 0;

          // 只选择动量加速的资产 / Only select assets with accelerating momentum
          if (acceleration >= this.config.momentumAccelerationThreshold) {
            longAssets.push(candidate);
          } else if (acceleration > 0) {
            // 动量仍在增加但不够快，减少权重 / Momentum still increasing but not fast, reduce weight
            longAssets.push({
              ...candidate,
              weight: (candidate.weight || this.config.maxPositionPerAsset) * 0.7,
            });
          }
        } else {
          longAssets.push(candidate);
        }
      }
    }

    // 选择做空资产 / Select short assets
    if (this.config.positionType !== POSITION_TYPE.LONG_ONLY) {
      const candidates = ranking.slice(-this.config.bottomN);

      for (const candidate of candidates) {
        // 动量增强检查 / Momentum enhancement check
        if (this.config.useMomentumEnhancement) {
          const acceleration = this.momentumAcceleration.get(candidate.symbol) || 0;

          // 只选择动量减速的资产 / Only select assets with decelerating momentum
          if (acceleration <= this.config.momentumDecelerationThreshold) {
            shortAssets.push(candidate);
          } else if (acceleration < 0) {
            // 动量仍在减少但不够快，减少权重 / Momentum still decreasing but not fast, reduce weight
            shortAssets.push({
              ...candidate,
              weight: (candidate.weight || this.config.maxPositionPerAsset) * 0.7,
            });
          }
        } else {
          shortAssets.push(candidate);
        }
      }
    }

    // 市场中性调整 / Market neutral adjustment
    if (this.config.marketNeutral) {
      const longWeight = longAssets.reduce((sum, a) => sum + (a.weight || this.config.maxPositionPerAsset), 0);
      const shortWeight = shortAssets.reduce((sum, a) => sum + (a.weight || this.config.maxPositionPerAsset), 0);

      // 调整使多空权重相等 / Adjust to make long/short weights equal
      const targetWeight = (longWeight + shortWeight) / 2;
      const longScale = targetWeight / Math.max(longWeight, 0.001);
      const shortScale = targetWeight / Math.max(shortWeight, 0.001);

      longAssets = longAssets.map(a => ({
        ...a,
        weight: (a.weight || this.config.maxPositionPerAsset) * longScale,
      }));

      shortAssets = shortAssets.map(a => ({
        ...a,
        weight: (a.weight || this.config.maxPositionPerAsset) * shortScale,
      }));
    }

    // 波动率调整权重 / Volatility-adjusted weights
    if (this.config.volatilityAdjustedWeights) {
      longAssets = this._adjustWeightsByVolatility(longAssets);
      shortAssets = this._adjustWeightsByVolatility(shortAssets);
    }

    return { longAssets, shortAssets };
  }

  /**
   * 根据波动率调整权重
   * Adjust weights by volatility
   *
   * @param {Array} assets - 资产列表 / Asset list
   * @returns {Array} 调整后的资产 / Adjusted assets
   * @private
   */
  _adjustWeightsByVolatility(assets) {
    if (assets.length === 0) return assets;

    // 计算波动率倒数之和 / Calculate sum of inverse volatilities
    const invVolSum = assets.reduce((sum, a) => {
      const vol = a.volatility || this.config.minVolatility;
      return sum + 1 / vol;
    }, 0);

    // 按波动率倒数分配权重 (波动率越低，权重越高)
    // Allocate weights by inverse volatility (lower volatility = higher weight)
    const totalWeight = assets.reduce((sum, a) => sum + (a.weight || this.config.maxPositionPerAsset), 0);

    return assets.map(a => {
      const vol = a.volatility || this.config.minVolatility;
      const volWeight = (1 / vol) / invVolSum;
      return {
        ...a,
        weight: Math.min(totalWeight * volWeight, this.config.maxPositionPerAsset),
      };
    });
  }

  /**
   * 检查排名变化
   * Check rank changes
   *
   * @param {Array} currentRanking - 当前排名 / Current ranking
   * @returns {Object} 排名变化信息 / Rank change info
   * @private
   */
  _checkRankChanges(currentRanking) {
    const changes = {
      significant: false,
      newTopN: [],
      newBottomN: [],
      reversals: [],
    };

    if (this.previousRanking.length === 0) {
      this.previousRanking = currentRanking;
      return changes;
    }

    // 创建排名映射 / Create rank mapping
    const prevRankMap = new Map(
      this.previousRanking.map(item => [item.symbol, item.rank])
    );

    // 检查每个资产的排名变化 / Check rank change for each asset
    for (const item of currentRanking) {
      const prevRank = prevRankMap.get(item.symbol);
      if (prevRank === undefined) continue;

      const rankChange = prevRank - item.rank;

      // 检查是否进入 Top N / Check if entered Top N
      if (item.rank <= this.config.topN && prevRank > this.config.topN) {
        changes.newTopN.push(item.symbol);
      }

      // 检查是否进入 Bottom N / Check if entered Bottom N
      const bottomThreshold = currentRanking.length - this.config.bottomN;
      if (item.rank > bottomThreshold && prevRank <= bottomThreshold) {
        changes.newBottomN.push(item.symbol);
      }

      // 检查动量反转 / Check momentum reversal
      if (Math.abs(rankChange) >= this.config.momentumReversalThreshold) {
        changes.reversals.push({
          symbol: item.symbol,
          prevRank,
          currentRank: item.rank,
          change: rankChange,
        });
        changes.significant = true;
      }
    }

    // 更新上一次排名 / Update previous ranking
    this.previousRanking = currentRanking;

    return changes;
  }

  /**
   * 检查并更新信号 (覆盖父类)
   * Check and update signals (override parent)
   * @private
   */
  async _checkAndUpdateSignals() {
    // 检查止损止盈 / Check stop loss and take profit
    await this._checkStopLossAndTakeProfit();

    // 调用父类方法 / Call parent method
    await super._checkAndUpdateSignals();
  }

  /**
   * 检查止损止盈
   * Check stop loss and take profit
   * @private
   */
  async _checkStopLossAndTakeProfit() {
    for (const [symbol, position] of this.portfolioManager.currentPositions) {
      const metrics = this.assetManager.getMetrics(symbol);
      if (!metrics) continue;

      const currentPrice = metrics.latestPrice;
      const entryPrice = this.entryPrices.get(symbol) || currentPrice;
      const peakPrice = this.peakPrices.get(symbol) || currentPrice;

      // 更新最高价 / Update peak price
      if (position.side === 'long' && currentPrice > peakPrice) {
        this.peakPrices.set(symbol, currentPrice);
      } else if (position.side === 'short' && currentPrice < peakPrice) {
        this.peakPrices.set(symbol, currentPrice);
      }

      // 计算收益率 / Calculate return
      const returnRate = position.side === 'long'
        ? (currentPrice - entryPrice) / entryPrice
        : (entryPrice - currentPrice) / entryPrice;

      // 检查止损 / Check stop loss
      if (returnRate <= -this.config.stopLoss) {
        this.log(`止损触发: ${symbol} 亏损 ${(returnRate * 100).toFixed(2)}%`, 'warn');
        await this._closePosition(symbol, 'stop_loss');
        continue;
      }

      // 检查止盈 / Check take profit
      if (returnRate >= this.config.takeProfit) {
        this.log(`止盈触发: ${symbol} 盈利 ${(returnRate * 100).toFixed(2)}%`, 'info');
        await this._closePosition(symbol, 'take_profit');
        continue;
      }

      // 检查跟踪止损 / Check trailing stop
      if (this.config.useTrailingStop && returnRate > 0) {
        const trailingReturn = position.side === 'long'
          ? (currentPrice - peakPrice) / peakPrice
          : (peakPrice - currentPrice) / peakPrice;

        if (trailingReturn <= -this.config.trailingStopRatio) {
          this.log(`跟踪止损触发: ${symbol} 从高点回撤 ${(Math.abs(trailingReturn) * 100).toFixed(2)}%`, 'warn');
          await this._closePosition(symbol, 'trailing_stop');
        }
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
    // 记录入场价格 / Record entry price
    const metrics = this.assetManager.getMetrics(symbol);
    if (metrics) {
      this.entryPrices.set(symbol, metrics.latestPrice);
      this.peakPrices.set(symbol, metrics.latestPrice);
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
    this.entryPrices.delete(symbol);
    this.peakPrices.delete(symbol);

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
      momentumMetric: this.config.momentumMetric,
      useCompositeMomentum: this.config.useCompositeMomentum,
      marketNeutral: this.config.marketNeutral,
      momentumAcceleration: Object.fromEntries(this.momentumAcceleration),
      activePositions: Array.from(this.portfolioManager.currentPositions.entries()).map(([symbol, pos]) => ({
        symbol,
        side: pos.side,
        weight: pos.weight,
        rank: pos.rank,
        entryPrice: this.entryPrices.get(symbol),
        currentPrice: this.assetManager.getMetrics(symbol)?.latestPrice,
      })),
    };
  }

  /**
   * 获取动量排名详情
   * Get momentum ranking details
   *
   * @returns {Array} 排名详情 / Ranking details
   */
  getMomentumRankingDetails() {
    const ranking = this.getCurrentRanking();

    return ranking.map(item => ({
      symbol: item.symbol,
      rank: item.rank,
      momentumScore: item.value,
      acceleration: this.momentumAcceleration.get(item.symbol) || 0,
      volatility: item.volatility,
      returns: item.metrics?.returns,
      sharpe: item.metrics?.sharpe,
      rsi: item.metrics?.rsi,
      isLong: item.rank <= this.config.topN,
      isShort: item.rank > ranking.length - this.config.bottomN,
    }));
  }
}

// ============================================
// 导出 / Exports
// ============================================

export {
  DEFAULT_CONFIG as MOMENTUM_RANK_DEFAULT_CONFIG,
};

export default MomentumRankStrategy;
