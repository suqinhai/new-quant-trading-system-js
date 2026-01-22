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
 * 动量指标类型
 * Momentum metric types
 */
export const MOMENTUM_METRICS = { // 导出常量 MOMENTUM_METRICS
  RETURNS: 'returns',           // RETURNS
  SHARPE: 'sharpe',             // SHARPE
  MOMENTUM: 'momentum',         // 动量
  RSI: 'rsi',                   // RSI
  RISK_ADJUSTED: 'risk_adjusted', // 风险ADJUSTED
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  // 策略名称 / Strategy name
  name: 'MomentumRankStrategy', // name

  // 监控的交易对列表 / Symbols to monitor
  // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
  symbols: [ // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', // 执行语句
    'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', // 执行语句
    'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'ETC/USDT', // 执行语句
  ], // 结束数组或索引

  // ============================================
  // 动量配置 / Momentum Configuration
  // ============================================

  // 动量计算周期 (K线数量) / Momentum calculation period
  lookbackPeriod: 20, // 动量计算周期 (K线数量)

  // 短期动量周期 / Short-term momentum period
  shortMomentumPeriod: 5, // 短期动量周期

  // 长期动量周期 / Long-term momentum period
  longMomentumPeriod: 60, // 长期动量周期

  // 动量指标 / Momentum metric
  momentumMetric: MOMENTUM_METRICS.RETURNS, // 动量指标

  // 是否使用复合动量 / Use composite momentum
  useCompositeMomentum: true, // 是否使用复合动量

  // 复合动量权重 / Composite momentum weights
  compositeMomentumWeights: { // composite动量Weights
    returns: 0.4,       // returns
    sharpe: 0.3,        // sharpe
    momentum: 0.2,      // 动量
    rsi: 0.1,           // RSI
  }, // 结束代码块

  // ============================================
  // 排名配置 / Ranking Configuration
  // ============================================

  // 选取 Top N 个做多 / Select top N for long
  topN: 3, // 选取 Top N 个做多

  // 选取 Bottom N 个做空 / Select bottom N for short
  bottomN: 3, // 选取 Bottom N 个做空

  // 排名方向 / Ranking direction
  rankDirection: RANK_DIRECTION.DESCENDING, // rankDirection

  // 最小排名变化触发再平衡 / Min rank change to trigger rebalance
  minRankChangeToRebalance: 2, // 最小排名变化触发再平衡

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 仓位类型 / Position type
  positionType: POSITION_TYPE.LONG_SHORT, // 持仓类型仓位类型

  // 单个资产最大仓位比例 / Max position per asset
  maxPositionPerAsset: 0.15, // 单个资产最大仓位比例

  // 单边总仓位比例 / Total position per side
  maxPositionPerSide: 0.5, // 单边总仓位比例

  // 是否等权重 / Equal weight
  equalWeight: true, // equalWeight

  // 是否市场中性 / Market neutral
  marketNeutral: false, // 市场Neutral

  // ============================================
  // 再平衡配置 / Rebalancing Configuration
  // ============================================

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 1 * 60 * 60 * 1000, // 每小时 / Every hour

  // 是否在排名显著变化时再平衡 / Rebalance on significant rank change
  rebalanceOnRankChange: true, // 是否在排名显著变化时再平衡

  // 动量反转阈值 (排名变化) / Momentum reversal threshold
  momentumReversalThreshold: 5, // 动量反转阈值 (排名变化)

  // ============================================
  // 动量增强配置 / Momentum Enhancement Configuration
  // ============================================

  // 是否使用动量增强 / Use momentum enhancement
  useMomentumEnhancement: true, // 是否使用动量增强

  // 动量加速因子阈值 / Momentum acceleration threshold
  momentumAccelerationThreshold: 0.02, // 动量加速因子阈值

  // 动量减速因子阈值 / Momentum deceleration threshold
  momentumDecelerationThreshold: -0.02, // 动量减速因子阈值

  // 是否过滤动量反转 / Filter momentum reversals
  filterMomentumReversals: true, // 是否过滤动量反转

  // ============================================
  // 波动率过滤配置 / Volatility Filter Configuration
  // ============================================

  // 是否使用波动率过滤 / Use volatility filter
  useVolatilityFilter: true, // 是否使用波动率过滤

  // 最小波动率 / Minimum volatility
  minVolatility: 0.01, // 最小波动率

  // 最大波动率 / Maximum volatility
  maxVolatility: 0.20, // 最大波动率

  // 波动率调整权重 / Volatility-adjusted weights
  volatilityAdjustedWeights: true, // 波动率AdjustedWeights

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 单资产止损 / Per-asset stop loss
  stopLoss: 0.08, // 单资产止损

  // 单资产止盈 / Per-asset take profit
  takeProfit: 0.20, // 单资产止盈

  // 组合最大回撤 / Portfolio max drawdown
  maxDrawdown: 0.15, // 最大回撤

  // 是否使用跟踪止损 / Use trailing stop
  useTrailingStop: true, // 是否使用跟踪止损

  // 跟踪止损比例 / Trailing stop ratio
  trailingStopRatio: 0.05, // 跟踪止损比例

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  verbose: true, // 详细日志
  logPrefix: '[MomentumRank]', // 日志前缀
}; // 结束代码块

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 动量横截面策略
 * Momentum Cross-Sectional Strategy
 */
export class MomentumRankStrategy extends CrossSectionalStrategy { // 导出类 MomentumRankStrategy
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
    this.strategyType = CROSS_SECTIONAL_TYPES.MOMENTUM_RANK; // 设置 strategyType

    // 上一次排名 / Previous ranking
    this.previousRanking = []; // 设置 previousRanking

    // 动量加速度缓存 / Momentum acceleration cache
    this.momentumAcceleration = new Map(); // 设置 momentumAcceleration

    // 历史动量记录 / Historical momentum records
    this.momentumHistory = new Map(); // 设置 momentumHistory

    // 入场价格记录 / Entry price records
    this.entryPrices = new Map(); // 设置 entryPrices

    // 最高价格记录 (用于跟踪止损) / Peak prices (for trailing stop)
    this.peakPrices = new Map(); // 设置 peakPrices
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 动量排名策略只需要 K 线数据 / Momentum rank strategy only needs kline
    return ['kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化策略
   * Initialize strategy
   */
  async onInit() { // 执行语句
    this.log('动量横截面策略初始化', 'info'); // 调用 log
    this.log(`动量指标: ${this.config.momentumMetric}`, 'info'); // 调用 log
    this.log(`使用复合动量: ${this.config.useCompositeMomentum}`, 'info'); // 调用 log

    // 调用父类初始化 / Call parent init
    await super.onInit(); // 等待异步结果
  } // 结束代码块

  /**
   * 计算复合动量分数
   * Calculate composite momentum score
   *
   * @param {Object} metrics - 资产指标 / Asset metrics
   * @returns {number} 复合动量分数 / Composite momentum score
   */
  calculateCompositeMomentum(metrics) { // 调用 calculateCompositeMomentum
    if (!this.config.useCompositeMomentum) { // 条件判断 !this.config.useCompositeMomentum
      return metrics[this.config.momentumMetric] || 0; // 返回结果
    } // 结束代码块

    const weights = this.config.compositeMomentumWeights; // 定义常量 weights
    let score = 0; // 定义变量 score
    let totalWeight = 0; // 定义变量 totalWeight

    // 计算加权分数 / Calculate weighted score
    for (const [metric, weight] of Object.entries(weights)) { // 循环 const [metric, weight] of Object.entries(weig...
      if (metrics[metric] !== undefined) { // 条件判断 metrics[metric] !== undefined
        // 标准化指标值 / Normalize metric value
        let normalizedValue = metrics[metric]; // 定义变量 normalizedValue

        // RSI 需要转换为 [-1, 1] 范围 / RSI needs to be converted to [-1, 1] range
        if (metric === 'rsi') { // 条件判断 metric === 'rsi'
          normalizedValue = (metrics[metric] - 50) / 50; // 赋值 normalizedValue
        } // 结束代码块

        score += normalizedValue * weight; // 执行语句
        totalWeight += weight; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return totalWeight > 0 ? score / totalWeight : 0; // 返回结果
  } // 结束代码块

  /**
   * 获取排名 (覆盖父类方法)
   * Get ranking (override parent method)
   *
   * @returns {Array} 排名列表 / Ranking list
   */
  getCurrentRanking() { // 调用 getCurrentRanking
    const ranking = []; // 定义常量 ranking

    // 收集所有资产的动量分数 / Collect momentum scores from all assets
    for (const symbol of this.config.symbols) { // 循环 const symbol of this.config.symbols
      const metrics = this.assetManager.getMetrics(symbol); // 定义常量 metrics
      if (!metrics) continue; // 条件判断 !metrics

      // 计算复合动量分数 / Calculate composite momentum score
      const momentumScore = this.calculateCompositeMomentum(metrics); // 定义常量 momentumScore

      // 计算动量加速度 / Calculate momentum acceleration
      const acceleration = this._calculateMomentumAcceleration(symbol, momentumScore); // 定义常量 acceleration

      // 应用波动率过滤 / Apply volatility filter
      if (this.config.useVolatilityFilter) { // 条件判断 this.config.useVolatilityFilter
        if (metrics.volatility < this.config.minVolatility || // 条件判断 metrics.volatility < this.config.minVolatilit...
            metrics.volatility > this.config.maxVolatility) { // 执行语句
          continue; // 继续下一轮循环
        } // 结束代码块
      } // 结束代码块

      // 过滤动量反转 / Filter momentum reversals
      if (this.config.filterMomentumReversals) { // 条件判断 this.config.filterMomentumReversals
        if (acceleration < this.config.momentumDecelerationThreshold) { // 条件判断 acceleration < this.config.momentumDecelerati...
          // 动量正在快速减速，可能反转 / Momentum decelerating fast, may reverse
          continue; // 继续下一轮循环
        } // 结束代码块
      } // 结束代码块

      ranking.push({ // 调用 ranking.push
        symbol, // 执行语句
        value: momentumScore, // value
        metrics, // 执行语句
        acceleration, // 执行语句
        volatility: metrics.volatility, // 波动率
      }); // 结束代码块
    } // 结束代码块

    // 排序 / Sort
    ranking.sort((a, b) => { // 调用 ranking.sort
      if (this.config.rankDirection === RANK_DIRECTION.DESCENDING) { // 条件判断 this.config.rankDirection === RANK_DIRECTION....
        return b.value - a.value; // 返回结果
      } else { // 执行语句
        return a.value - b.value; // 返回结果
      } // 结束代码块
    }); // 结束代码块

    // 添加排名 / Add rank
    ranking.forEach((item, index) => { // 调用 ranking.forEach
      item.rank = index + 1; // 赋值 item.rank
    }); // 结束代码块

    return ranking; // 返回结果
  } // 结束代码块

  /**
   * 计算动量加速度
   * Calculate momentum acceleration
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} currentMomentum - 当前动量 / Current momentum
   * @returns {number} 加速度 / Acceleration
   * @private
   */
  _calculateMomentumAcceleration(symbol, currentMomentum) { // 调用 _calculateMomentumAcceleration
    // 获取历史动量 / Get historical momentum
    if (!this.momentumHistory.has(symbol)) { // 条件判断 !this.momentumHistory.has(symbol)
      this.momentumHistory.set(symbol, []); // 访问 momentumHistory
    } // 结束代码块

    const history = this.momentumHistory.get(symbol); // 定义常量 history

    // 添加当前动量 / Add current momentum
    history.push({ // 调用 history.push
      momentum: currentMomentum, // 动量
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 保留最近10个记录 / Keep last 10 records
    if (history.length > 10) { // 条件判断 history.length > 10
      history.shift(); // 调用 history.shift
    } // 结束代码块

    // 计算加速度 / Calculate acceleration
    if (history.length < 2) { // 条件判断 history.length < 2
      return 0; // 返回结果
    } // 结束代码块

    const recent = history[history.length - 1].momentum; // 定义常量 recent
    const previous = history[history.length - 2].momentum; // 定义常量 previous

    const acceleration = recent - previous; // 定义常量 acceleration

    // 保存加速度 / Save acceleration
    this.momentumAcceleration.set(symbol, acceleration); // 访问 momentumAcceleration

    return acceleration; // 返回结果
  } // 结束代码块

  /**
   * 选择资产 (覆盖父类方法)
   * Select assets (override parent method)
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Object} 做多和做空资产 / Long and short assets
   */
  _selectAssets(ranking) { // 调用 _selectAssets
    let longAssets = []; // 定义变量 longAssets
    let shortAssets = []; // 定义变量 shortAssets

    // 检查排名变化 / Check rank changes
    const rankChanges = this._checkRankChanges(ranking); // 定义常量 rankChanges

    // 选择做多资产 / Select long assets
    if (this.config.positionType !== POSITION_TYPE.SHORT_ONLY) { // 条件判断 this.config.positionType !== POSITION_TYPE.SH...
      const candidates = ranking.slice(0, this.config.topN); // 定义常量 candidates

      for (const candidate of candidates) { // 循环 const candidate of candidates
        // 动量增强检查 / Momentum enhancement check
        if (this.config.useMomentumEnhancement) { // 条件判断 this.config.useMomentumEnhancement
          const acceleration = this.momentumAcceleration.get(candidate.symbol) || 0; // 定义常量 acceleration

          // 只选择动量加速的资产 / Only select assets with accelerating momentum
          if (acceleration >= this.config.momentumAccelerationThreshold) { // 条件判断 acceleration >= this.config.momentumAccelerat...
            longAssets.push(candidate); // 调用 longAssets.push
          } else if (acceleration > 0) { // 执行语句
            // 动量仍在增加但不够快，减少权重 / Momentum still increasing but not fast, reduce weight
            longAssets.push({ // 调用 longAssets.push
              ...candidate, // 展开对象或数组
              weight: (candidate.weight || this.config.maxPositionPerAsset) * 0.7, // weight
            }); // 结束代码块
          } // 结束代码块
        } else { // 执行语句
          longAssets.push(candidate); // 调用 longAssets.push
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 选择做空资产 / Select short assets
    if (this.config.positionType !== POSITION_TYPE.LONG_ONLY) { // 条件判断 this.config.positionType !== POSITION_TYPE.LO...
      const candidates = ranking.slice(-this.config.bottomN); // 定义常量 candidates

      for (const candidate of candidates) { // 循环 const candidate of candidates
        // 动量增强检查 / Momentum enhancement check
        if (this.config.useMomentumEnhancement) { // 条件判断 this.config.useMomentumEnhancement
          const acceleration = this.momentumAcceleration.get(candidate.symbol) || 0; // 定义常量 acceleration

          // 只选择动量减速的资产 / Only select assets with decelerating momentum
          if (acceleration <= this.config.momentumDecelerationThreshold) { // 条件判断 acceleration <= this.config.momentumDecelerat...
            shortAssets.push(candidate); // 调用 shortAssets.push
          } else if (acceleration < 0) { // 执行语句
            // 动量仍在减少但不够快，减少权重 / Momentum still decreasing but not fast, reduce weight
            shortAssets.push({ // 调用 shortAssets.push
              ...candidate, // 展开对象或数组
              weight: (candidate.weight || this.config.maxPositionPerAsset) * 0.7, // weight
            }); // 结束代码块
          } // 结束代码块
        } else { // 执行语句
          shortAssets.push(candidate); // 调用 shortAssets.push
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 市场中性调整 / Market neutral adjustment
    if (this.config.marketNeutral) { // 条件判断 this.config.marketNeutral
      const longWeight = longAssets.reduce((sum, a) => sum + (a.weight || this.config.maxPositionPerAsset), 0); // 定义函数 longWeight
      const shortWeight = shortAssets.reduce((sum, a) => sum + (a.weight || this.config.maxPositionPerAsset), 0); // 定义函数 shortWeight

      // 调整使多空权重相等 / Adjust to make long/short weights equal
      const targetWeight = (longWeight + shortWeight) / 2; // 定义常量 targetWeight
      const longScale = targetWeight / Math.max(longWeight, 0.001); // 定义常量 longScale
      const shortScale = targetWeight / Math.max(shortWeight, 0.001); // 定义常量 shortScale

      longAssets = longAssets.map(a => ({ // 赋值 longAssets
        ...a, // 展开对象或数组
        weight: (a.weight || this.config.maxPositionPerAsset) * longScale, // weight
      })); // 结束代码块

      shortAssets = shortAssets.map(a => ({ // 赋值 shortAssets
        ...a, // 展开对象或数组
        weight: (a.weight || this.config.maxPositionPerAsset) * shortScale, // weight
      })); // 结束代码块
    } // 结束代码块

    // 波动率调整权重 / Volatility-adjusted weights
    if (this.config.volatilityAdjustedWeights) { // 条件判断 this.config.volatilityAdjustedWeights
      longAssets = this._adjustWeightsByVolatility(longAssets); // 赋值 longAssets
      shortAssets = this._adjustWeightsByVolatility(shortAssets); // 赋值 shortAssets
    } // 结束代码块

    return { longAssets, shortAssets }; // 返回结果
  } // 结束代码块

  /**
   * 根据波动率调整权重
   * Adjust weights by volatility
   *
   * @param {Array} assets - 资产列表 / Asset list
   * @returns {Array} 调整后的资产 / Adjusted assets
   * @private
   */
  _adjustWeightsByVolatility(assets) { // 调用 _adjustWeightsByVolatility
    if (assets.length === 0) return assets; // 条件判断 assets.length === 0

    // 计算波动率倒数之和 / Calculate sum of inverse volatilities
    const invVolSum = assets.reduce((sum, a) => { // 定义函数 invVolSum
      const vol = a.volatility || this.config.minVolatility; // 定义常量 vol
      return sum + 1 / vol; // 返回结果
    }, 0); // 执行语句

    // 按波动率倒数分配权重 (波动率越低，权重越高)
    // Allocate weights by inverse volatility (lower volatility = higher weight)
    const totalWeight = assets.reduce((sum, a) => sum + (a.weight || this.config.maxPositionPerAsset), 0); // 定义函数 totalWeight

    return assets.map(a => { // 返回结果
      const vol = a.volatility || this.config.minVolatility; // 定义常量 vol
      const volWeight = (1 / vol) / invVolSum; // 定义常量 volWeight
      return { // 返回结果
        ...a, // 展开对象或数组
        weight: Math.min(totalWeight * volWeight, this.config.maxPositionPerAsset), // weight
      }; // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 检查排名变化
   * Check rank changes
   *
   * @param {Array} currentRanking - 当前排名 / Current ranking
   * @returns {Object} 排名变化信息 / Rank change info
   * @private
   */
  _checkRankChanges(currentRanking) { // 调用 _checkRankChanges
    const changes = { // 定义常量 changes
      significant: false, // significant
      newTopN: [], // newTopN
      newBottomN: [], // newBottomN
      reversals: [], // reversals
    }; // 结束代码块

    if (this.previousRanking.length === 0) { // 条件判断 this.previousRanking.length === 0
      this.previousRanking = currentRanking; // 设置 previousRanking
      return changes; // 返回结果
    } // 结束代码块

    // 创建排名映射 / Create rank mapping
    const prevRankMap = new Map( // 定义常量 prevRankMap
      this.previousRanking.map(item => [item.symbol, item.rank]) // 访问 previousRanking
    ); // 结束调用或参数

    // 检查每个资产的排名变化 / Check rank change for each asset
    for (const item of currentRanking) { // 循环 const item of currentRanking
      const prevRank = prevRankMap.get(item.symbol); // 定义常量 prevRank
      if (prevRank === undefined) continue; // 条件判断 prevRank === undefined

      const rankChange = prevRank - item.rank; // 定义常量 rankChange

      // 检查是否进入 Top N / Check if entered Top N
      if (item.rank <= this.config.topN && prevRank > this.config.topN) { // 条件判断 item.rank <= this.config.topN && prevRank > t...
        changes.newTopN.push(item.symbol); // 调用 changes.newTopN.push
      } // 结束代码块

      // 检查是否进入 Bottom N / Check if entered Bottom N
      const bottomThreshold = currentRanking.length - this.config.bottomN; // 定义常量 bottomThreshold
      if (item.rank > bottomThreshold && prevRank <= bottomThreshold) { // 条件判断 item.rank > bottomThreshold && prevRank <= bo...
        changes.newBottomN.push(item.symbol); // 调用 changes.newBottomN.push
      } // 结束代码块

      // 检查动量反转 / Check momentum reversal
      if (Math.abs(rankChange) >= this.config.momentumReversalThreshold) { // 条件判断 Math.abs(rankChange) >= this.config.momentumR...
        changes.reversals.push({ // 调用 changes.reversals.push
          symbol: item.symbol, // 交易对
          prevRank, // 执行语句
          currentRank: item.rank, // currentRank
          change: rankChange, // 修改
        }); // 结束代码块
        changes.significant = true; // 赋值 changes.significant
      } // 结束代码块
    } // 结束代码块

    // 更新上一次排名 / Update previous ranking
    this.previousRanking = currentRanking; // 设置 previousRanking

    return changes; // 返回结果
  } // 结束代码块

  /**
   * 检查并更新信号 (覆盖父类)
   * Check and update signals (override parent)
   * @private
   */
  async _checkAndUpdateSignals() { // 执行语句
    // 检查止损止盈 / Check stop loss and take profit
    await this._checkStopLossAndTakeProfit(); // 等待异步结果

    // 调用父类方法 / Call parent method
    await super._checkAndUpdateSignals(); // 等待异步结果
  } // 结束代码块

  /**
   * 检查止损止盈
   * Check stop loss and take profit
   * @private
   */
  async _checkStopLossAndTakeProfit() { // 执行语句
    for (const [symbol, position] of this.portfolioManager.currentPositions) { // 循环 const [symbol, position] of this.portfolioMan...
      const metrics = this.assetManager.getMetrics(symbol); // 定义常量 metrics
      if (!metrics) continue; // 条件判断 !metrics

      const currentPrice = metrics.latestPrice; // 定义常量 currentPrice
      const entryPrice = this.entryPrices.get(symbol) || currentPrice; // 定义常量 entryPrice
      const peakPrice = this.peakPrices.get(symbol) || currentPrice; // 定义常量 peakPrice

      // 更新最高价 / Update peak price
      if (position.side === 'long' && currentPrice > peakPrice) { // 条件判断 position.side === 'long' && currentPrice > pe...
        this.peakPrices.set(symbol, currentPrice); // 访问 peakPrices
      } else if (position.side === 'short' && currentPrice < peakPrice) { // 执行语句
        this.peakPrices.set(symbol, currentPrice); // 访问 peakPrices
      } // 结束代码块

      // 计算收益率 / Calculate return
      const returnRate = position.side === 'long' // 定义常量 returnRate
        ? (currentPrice - entryPrice) / entryPrice // 执行语句
        : (entryPrice - currentPrice) / entryPrice; // 执行语句

      // 检查止损 / Check stop loss
      if (returnRate <= -this.config.stopLoss) { // 条件判断 returnRate <= -this.config.stopLoss
        this.log(`止损触发: ${symbol} 亏损 ${(returnRate * 100).toFixed(2)}%`, 'warn'); // 调用 log
        await this._closePosition(symbol, 'stop_loss'); // 等待异步结果
        continue; // 继续下一轮循环
      } // 结束代码块

      // 检查止盈 / Check take profit
      if (returnRate >= this.config.takeProfit) { // 条件判断 returnRate >= this.config.takeProfit
        this.log(`止盈触发: ${symbol} 盈利 ${(returnRate * 100).toFixed(2)}%`, 'info'); // 调用 log
        await this._closePosition(symbol, 'take_profit'); // 等待异步结果
        continue; // 继续下一轮循环
      } // 结束代码块

      // 检查跟踪止损 / Check trailing stop
      if (this.config.useTrailingStop && returnRate > 0) { // 条件判断 this.config.useTrailingStop && returnRate > 0
        const trailingReturn = position.side === 'long' // 定义常量 trailingReturn
          ? (currentPrice - peakPrice) / peakPrice // 执行语句
          : (peakPrice - currentPrice) / peakPrice; // 执行语句

        if (trailingReturn <= -this.config.trailingStopRatio) { // 条件判断 trailingReturn <= -this.config.trailingStopRatio
          this.log(`跟踪止损触发: ${symbol} 从高点回撤 ${(Math.abs(trailingReturn) * 100).toFixed(2)}%`, 'warn'); // 调用 log
          await this._closePosition(symbol, 'trailing_stop'); // 等待异步结果
        } // 结束代码块
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
    // 记录入场价格 / Record entry price
    const metrics = this.assetManager.getMetrics(symbol); // 定义常量 metrics
    if (metrics) { // 条件判断 metrics
      this.entryPrices.set(symbol, metrics.latestPrice); // 访问 entryPrices
      this.peakPrices.set(symbol, metrics.latestPrice); // 访问 peakPrices
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
    this.entryPrices.delete(symbol); // 访问 entryPrices
    this.peakPrices.delete(symbol); // 访问 peakPrices

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
      momentumMetric: this.config.momentumMetric, // 动量指标
      useCompositeMomentum: this.config.useCompositeMomentum, // 是否使用Composite动量
      marketNeutral: this.config.marketNeutral, // 市场Neutral
      momentumAcceleration: Object.fromEntries(this.momentumAcceleration), // 动量Acceleration
      activePositions: Array.from(this.portfolioManager.currentPositions.entries()).map(([symbol, pos]) => ({ // 活跃持仓
        symbol, // 执行语句
        side: pos.side, // 方向
        weight: pos.weight, // weight
        rank: pos.rank, // rank
        entryPrice: this.entryPrices.get(symbol), // 入场价格
        currentPrice: this.assetManager.getMetrics(symbol)?.latestPrice, // current价格
      })), // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取动量排名详情
   * Get momentum ranking details
   *
   * @returns {Array} 排名详情 / Ranking details
   */
  getMomentumRankingDetails() { // 调用 getMomentumRankingDetails
    const ranking = this.getCurrentRanking(); // 定义常量 ranking

    return ranking.map(item => ({ // 返回结果
      symbol: item.symbol, // 交易对
      rank: item.rank, // rank
      momentumScore: item.value, // 动量分数
      acceleration: this.momentumAcceleration.get(item.symbol) || 0, // acceleration
      volatility: item.volatility, // 波动率
      returns: item.metrics?.returns, // returns
      sharpe: item.metrics?.sharpe, // sharpe
      rsi: item.metrics?.rsi, // RSI
      isLong: item.rank <= this.config.topN, // 是否Long
      isShort: item.rank > ranking.length - this.config.bottomN, // 是否Short
    })); // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { // 导出命名成员
  DEFAULT_CONFIG as MOMENTUM_RANK_DEFAULT_CONFIG, // 执行语句
}; // 结束代码块

export default MomentumRankStrategy; // 默认导出
