/**
 * 盘口厚度分析器
 * Order Book Analyzer
 *
 * 功能 / Features:
 * 1. 盘口深度分析 / Order book depth analysis
 * 2. 流动性评估 / Liquidity assessment
 * 3. 冲击成本预估 / Market impact estimation
 * 4. 最优执行价位计算 / Optimal execution price calculation
 * 5. 买卖压力分析 / Buy/sell pressure analysis
 */

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 流动性等级
 * Liquidity levels
 */
export const LIQUIDITY_LEVEL = {
  VERY_HIGH: 'very_high',   // 非常高 / Very high
  HIGH: 'high',             // 高 / High
  MEDIUM: 'medium',         // 中等 / Medium
  LOW: 'low',               // 低 / Low
  VERY_LOW: 'very_low',     // 非常低 / Very low
};

/**
 * 压力方向
 * Pressure direction
 */
export const PRESSURE_DIRECTION = {
  BUY: 'buy',       // 买压 / Buy pressure
  SELL: 'sell',     // 卖压 / Sell pressure
  NEUTRAL: 'neutral', // 中性 / Neutral
};

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  // 分析深度（档位数）/ Analysis depth (levels)
  depthLevels: 20,

  // 冲击成本阈值 / Impact cost thresholds
  impactCostThresholds: {
    low: 0.001,      // 0.1% 低冲击 / Low impact
    medium: 0.003,   // 0.3% 中等冲击 / Medium impact
    high: 0.01,      // 1% 高冲击 / High impact
  },

  // 流动性评估阈值（相对于日均成交量）/ Liquidity thresholds (relative to daily volume)
  liquidityThresholds: {
    veryHigh: 0.1,   // 10% 日均量 / 10% of daily volume
    high: 0.05,      // 5% 日均量 / 5% of daily volume
    medium: 0.02,    // 2% 日均量 / 2% of daily volume
    low: 0.01,       // 1% 日均量 / 1% of daily volume
  },

  // 买卖压力不平衡阈值 / Buy/sell imbalance threshold
  imbalanceThreshold: 0.3, // 30% 差异视为不平衡 / 30% difference considered imbalanced

  // 盘口数据缓存时间（毫秒）/ Order book cache time (ms)
  cacheTime: 100,

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 盘口厚度分析器
 * Order Book Analyzer
 */
export class OrderBookAnalyzer extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    super();

    // 合并配置 / Merge config
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 盘口数据缓存 / Order book cache
    // 格式: { symbol: { bids, asks, timestamp, exchange } }
    this.orderBookCache = new Map();

    // 历史盘口快照（用于趋势分析）/ Historical snapshots (for trend analysis)
    // 格式: { symbol: [{ timestamp, bidDepth, askDepth, spread }] }
    this.historicalSnapshots = new Map();

    // 日均成交量缓存 / Daily volume cache
    // 格式: { symbol: volume }
    this.dailyVolumeCache = new Map();

    // 统计信息 / Statistics
    this.stats = {
      analyzedOrders: 0,          // 分析的订单数 / Analyzed orders
      impactEstimations: 0,        // 冲击预估次数 / Impact estimations
      accurateEstimations: 0,      // 准确预估次数 / Accurate estimations
      totalSlippageEstimated: 0,   // 总预估滑点 / Total estimated slippage
      totalSlippageActual: 0,      // 总实际滑点 / Total actual slippage
    };
  }

  // ============================================
  // 核心分析方法 / Core Analysis Methods
  // ============================================

  /**
   * 分析盘口深度
   * Analyze order book depth
   *
   * @param {Object} orderBook - 盘口数据 / Order book data
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 深度分析结果 / Depth analysis result
   */
  analyzeDepth(orderBook, symbol) {
    // 提取买卖盘 / Extract bids and asks
    const { bids = [], asks = [] } = orderBook;

    // 计算买盘深度 / Calculate bid depth
    const bidDepth = this._calculateDepth(bids, this.config.depthLevels);

    // 计算卖盘深度 / Calculate ask depth
    const askDepth = this._calculateDepth(asks, this.config.depthLevels);

    // 计算买卖价差 / Calculate spread
    const bestBid = bids[0]?.[0] || 0;
    const bestAsk = asks[0]?.[0] || 0;
    const spread = bestAsk > 0 ? (bestAsk - bestBid) / bestAsk : 0;
    const midPrice = (bestBid + bestAsk) / 2;

    // 计算买卖压力 / Calculate buy/sell pressure
    const pressure = this._calculatePressure(bidDepth, askDepth);

    // 计算流动性分布 / Calculate liquidity distribution
    const liquidityDistribution = this._calculateLiquidityDistribution(bids, asks, midPrice);

    // 缓存盘口数据 / Cache order book data
    this.orderBookCache.set(symbol, {
      bids,
      asks,
      timestamp: Date.now(),
      bestBid,
      bestAsk,
      midPrice,
    });

    // 保存历史快照 / Save historical snapshot
    this._saveHistoricalSnapshot(symbol, {
      timestamp: Date.now(),
      bidDepth,
      askDepth,
      spread,
      midPrice,
    });

    // 返回分析结果 / Return analysis result
    return {
      // 最佳买价 / Best bid
      bestBid,

      // 最佳卖价 / Best ask
      bestAsk,

      // 中间价 / Mid price
      midPrice,

      // 买卖价差 / Spread
      spread,

      // 买卖价差（基点）/ Spread in basis points
      spreadBps: spread * 10000,

      // 买盘深度 / Bid depth
      bidDepth: {
        totalVolume: bidDepth.totalVolume,
        totalValue: bidDepth.totalValue,
        levels: bidDepth.levels,
        weightedAvgPrice: bidDepth.weightedAvgPrice,
      },

      // 卖盘深度 / Ask depth
      askDepth: {
        totalVolume: askDepth.totalVolume,
        totalValue: askDepth.totalValue,
        levels: askDepth.levels,
        weightedAvgPrice: askDepth.weightedAvgPrice,
      },

      // 买卖压力 / Buy/sell pressure
      pressure,

      // 流动性分布 / Liquidity distribution
      liquidityDistribution,

      // 分析时间 / Analysis timestamp
      timestamp: Date.now(),
    };
  }

  /**
   * 评估流动性等级
   * Assess liquidity level
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} orderSize - 订单大小 / Order size
   * @param {Object} depthAnalysis - 深度分析结果 / Depth analysis result
   * @returns {Object} 流动性评估结果 / Liquidity assessment result
   */
  assessLiquidity(symbol, orderSize, depthAnalysis) {
    // 获取日均成交量 / Get daily volume
    const dailyVolume = this.dailyVolumeCache.get(symbol) || 0;

    // 计算订单占比 / Calculate order ratio
    const orderRatio = dailyVolume > 0 ? orderSize / dailyVolume : 1;

    // 判断流动性等级 / Determine liquidity level
    let level;
    const thresholds = this.config.liquidityThresholds;

    if (orderRatio <= thresholds.low / 10) {
      level = LIQUIDITY_LEVEL.VERY_HIGH;
    } else if (orderRatio <= thresholds.low) {
      level = LIQUIDITY_LEVEL.HIGH;
    } else if (orderRatio <= thresholds.medium) {
      level = LIQUIDITY_LEVEL.MEDIUM;
    } else if (orderRatio <= thresholds.high) {
      level = LIQUIDITY_LEVEL.LOW;
    } else {
      level = LIQUIDITY_LEVEL.VERY_LOW;
    }

    // 计算盘口能承载的量 / Calculate absorbable volume
    const bidAbsorb = depthAnalysis.bidDepth.totalVolume;
    const askAbsorb = depthAnalysis.askDepth.totalVolume;

    // 计算可承载比例 / Calculate absorption ratio
    const bidAbsorbRatio = bidAbsorb > 0 ? Math.min(orderSize / bidAbsorb, 1) : 1;
    const askAbsorbRatio = askAbsorb > 0 ? Math.min(orderSize / askAbsorb, 1) : 1;

    // 返回评估结果 / Return assessment result
    return {
      // 流动性等级 / Liquidity level
      level,

      // 订单占日均量比例 / Order to daily volume ratio
      orderRatio,

      // 日均成交量 / Daily volume
      dailyVolume,

      // 买盘可吸收比例 / Bid absorption ratio
      bidAbsorbRatio,

      // 卖盘可吸收比例 / Ask absorption ratio
      askAbsorbRatio,

      // 建议 / Recommendations
      recommendations: this._generateLiquidityRecommendations(level, orderRatio, depthAnalysis),

      // 风险等级 (1-5) / Risk level (1-5)
      riskLevel: this._calculateRiskLevel(level, orderRatio),
    };
  }

  /**
   * 预估冲击成本
   * Estimate market impact cost
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} side - 买卖方向 / Side (buy/sell)
   * @param {number} orderSize - 订单大小 / Order size
   * @param {Object} orderBook - 盘口数据 / Order book data
   * @returns {Object} 冲击成本预估 / Impact cost estimation
   */
  estimateImpactCost(symbol, side, orderSize, orderBook) {
    // 更新统计 / Update stats
    this.stats.impactEstimations++;

    // 选择相应的盘口数据 / Select appropriate order book side
    const orders = side === 'buy' ? orderBook.asks : orderBook.bids;

    // 如果没有盘口数据 / If no order book data
    if (!orders || orders.length === 0) {
      return {
        estimatedPrice: 0,
        impactCost: 1,  // 100% 冲击（无法执行）/ 100% impact (cannot execute)
        impactBps: 10000,
        filledLevels: 0,
        remainingSize: orderSize,
        canExecute: false,
      };
    }

    // 模拟成交 / Simulate execution
    let remainingSize = orderSize;
    let totalCost = 0;
    let filledLevels = 0;

    for (const [price, volume] of orders) {
      if (remainingSize <= 0) break;

      // 计算这一档可成交的量 / Calculate fillable volume at this level
      const fillVolume = Math.min(remainingSize, volume);

      // 累加成本 / Accumulate cost
      totalCost += fillVolume * price;

      // 减少剩余量 / Reduce remaining size
      remainingSize -= fillVolume;

      // 记录穿透档位 / Record filled levels
      filledLevels++;
    }

    // 计算成交均价 / Calculate average fill price
    const filledSize = orderSize - remainingSize;
    const avgFillPrice = filledSize > 0 ? totalCost / filledSize : 0;

    // 计算冲击成本 / Calculate impact cost
    const bestPrice = orders[0][0];
    const impactCost = bestPrice > 0 ? Math.abs(avgFillPrice - bestPrice) / bestPrice : 0;

    // 判断冲击等级 / Determine impact level
    let impactLevel;
    const thresholds = this.config.impactCostThresholds;

    if (impactCost <= thresholds.low) {
      impactLevel = 'low';
    } else if (impactCost <= thresholds.medium) {
      impactLevel = 'medium';
    } else if (impactCost <= thresholds.high) {
      impactLevel = 'high';
    } else {
      impactLevel = 'extreme';
    }

    // 返回预估结果 / Return estimation result
    return {
      // 预估成交均价 / Estimated average price
      estimatedPrice: avgFillPrice,

      // 最优价格 / Best price
      bestPrice,

      // 冲击成本（比例）/ Impact cost (ratio)
      impactCost,

      // 冲击成本（基点）/ Impact cost (bps)
      impactBps: impactCost * 10000,

      // 冲击等级 / Impact level
      impactLevel,

      // 穿透档位数 / Filled levels
      filledLevels,

      // 已成交量 / Filled size
      filledSize,

      // 剩余未成交量 / Remaining size
      remainingSize,

      // 是否可完全成交 / Can fully execute
      canExecute: remainingSize === 0,

      // 完全成交比例 / Fill ratio
      fillRatio: filledSize / orderSize,

      // 建议 / Suggestions
      suggestions: this._generateImpactSuggestions(impactLevel, filledLevels, orderSize, filledSize),
    };
  }

  /**
   * 计算最优执行价位
   * Calculate optimal execution price
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} side - 买卖方向 / Side
   * @param {number} orderSize - 订单大小 / Order size
   * @param {Object} orderBook - 盘口数据 / Order book data
   * @param {Object} options - 选项 / Options
   * @returns {Object} 最优价位建议 / Optimal price suggestion
   */
  calculateOptimalPrice(symbol, side, orderSize, orderBook, options = {}) {
    const {
      targetFillRatio = 1.0,    // 目标成交比例 / Target fill ratio
      maxImpactBps = 10,        // 最大可接受冲击（基点）/ Max acceptable impact (bps)
      urgency = 'normal',       // 紧迫程度 / Urgency level
    } = options;

    // 获取盘口分析 / Get depth analysis
    const depthAnalysis = this.analyzeDepth(orderBook, symbol);

    // 选择相应盘口 / Select appropriate side
    const isBuy = side === 'buy';
    const orders = isBuy ? orderBook.asks : orderBook.bids;
    const bestPrice = isBuy ? depthAnalysis.bestAsk : depthAnalysis.bestBid;
    const oppositePrice = isBuy ? depthAnalysis.bestBid : depthAnalysis.bestAsk;

    // 如果无盘口数据 / If no order book data
    if (!orders || orders.length === 0 || bestPrice === 0) {
      return {
        optimalPrice: 0,
        canExecute: false,
        reason: '无盘口数据 / No order book data',
      };
    }

    // 根据紧迫程度调整策略 / Adjust strategy based on urgency
    let priceStrategy;
    switch (urgency) {
      case 'high':
        // 紧急：使用略激进的价格 / Urgent: use slightly aggressive price
        priceStrategy = 'aggressive';
        break;
      case 'low':
        // 不紧急：耐心挂单 / Not urgent: patient limit order
        priceStrategy = 'passive';
        break;
      default:
        // 正常：平衡策略 / Normal: balanced strategy
        priceStrategy = 'balanced';
    }

    // 计算不同价格策略 / Calculate different price strategies
    let optimalPrice;
    let expectedFill;
    let expectedImpact;

    switch (priceStrategy) {
      case 'aggressive':
        // 激进：穿透到能成交目标量的价位 / Aggressive: penetrate to fill target
        const impactResult = this.estimateImpactCost(symbol, side, orderSize * targetFillRatio, orderBook);
        optimalPrice = impactResult.estimatedPrice;
        expectedFill = impactResult.fillRatio;
        expectedImpact = impactResult.impactBps;
        break;

      case 'passive':
        // 被动：挂在对手盘最优价之内 / Passive: place inside spread
        const spreadMid = (bestPrice + oppositePrice) / 2;
        optimalPrice = isBuy
          ? Math.min(spreadMid, bestPrice * (1 - maxImpactBps / 10000))
          : Math.max(spreadMid, bestPrice * (1 + maxImpactBps / 10000));
        expectedFill = 0.3;  // 预期30%成交 / Expected 30% fill
        expectedImpact = 0;
        break;

      default:
        // 平衡：在最优价附近，控制冲击 / Balanced: near best price, control impact
        optimalPrice = isBuy
          ? bestPrice * (1 + maxImpactBps / 20000)  // 允许一半的冲击 / Allow half the impact
          : bestPrice * (1 - maxImpactBps / 20000);
        expectedFill = 0.7;  // 预期70%成交 / Expected 70% fill
        expectedImpact = maxImpactBps / 2;
    }

    // 返回结果 / Return result
    return {
      // 最优价格 / Optimal price
      optimalPrice,

      // 当前最优对手价 / Current best opposite price
      bestPrice,

      // 盘口中间价 / Mid price
      midPrice: depthAnalysis.midPrice,

      // 价格策略 / Price strategy
      priceStrategy,

      // 预期成交比例 / Expected fill ratio
      expectedFill,

      // 预期冲击（基点）/ Expected impact (bps)
      expectedImpact,

      // 是否可执行 / Can execute
      canExecute: true,

      // 买卖价差 / Spread
      spread: depthAnalysis.spread,

      // 买卖压力 / Pressure
      pressure: depthAnalysis.pressure,
    };
  }

  /**
   * 分析盘口变化趋势
   * Analyze order book trend
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} lookbackPeriod - 回看周期（毫秒）/ Lookback period (ms)
   * @returns {Object} 趋势分析结果 / Trend analysis result
   */
  analyzeTrend(symbol, lookbackPeriod = 60000) {
    // 获取历史快照 / Get historical snapshots
    const snapshots = this.historicalSnapshots.get(symbol) || [];

    // 过滤指定时间范围内的快照 / Filter snapshots within time range
    const cutoffTime = Date.now() - lookbackPeriod;
    const recentSnapshots = snapshots.filter(s => s.timestamp >= cutoffTime);

    // 如果数据不足 / If insufficient data
    if (recentSnapshots.length < 2) {
      return {
        hasTrend: false,
        reason: '历史数据不足 / Insufficient historical data',
      };
    }

    // 计算买盘深度变化 / Calculate bid depth change
    const firstSnapshot = recentSnapshots[0];
    const lastSnapshot = recentSnapshots[recentSnapshots.length - 1];

    const bidDepthChange = (lastSnapshot.bidDepth - firstSnapshot.bidDepth) / firstSnapshot.bidDepth;
    const askDepthChange = (lastSnapshot.askDepth - firstSnapshot.askDepth) / firstSnapshot.askDepth;
    const spreadChange = lastSnapshot.spread - firstSnapshot.spread;
    const priceChange = (lastSnapshot.midPrice - firstSnapshot.midPrice) / firstSnapshot.midPrice;

    // 判断趋势方向 / Determine trend direction
    let trendDirection;
    if (bidDepthChange > 0.1 && askDepthChange < -0.05) {
      trendDirection = 'bullish';  // 看涨 / Bullish
    } else if (askDepthChange > 0.1 && bidDepthChange < -0.05) {
      trendDirection = 'bearish';  // 看跌 / Bearish
    } else {
      trendDirection = 'neutral';  // 中性 / Neutral
    }

    // 返回趋势分析 / Return trend analysis
    return {
      // 是否有明显趋势 / Has clear trend
      hasTrend: trendDirection !== 'neutral',

      // 趋势方向 / Trend direction
      trendDirection,

      // 买盘深度变化 / Bid depth change
      bidDepthChange,

      // 卖盘深度变化 / Ask depth change
      askDepthChange,

      // 价差变化 / Spread change
      spreadChange,

      // 价格变化 / Price change
      priceChange,

      // 分析时段 / Analysis period
      periodMs: lookbackPeriod,

      // 样本数 / Sample count
      sampleCount: recentSnapshots.length,

      // 建议 / Suggestions
      suggestions: this._generateTrendSuggestions(trendDirection, bidDepthChange, askDepthChange),
    };
  }

  // ============================================
  // 数据管理方法 / Data Management Methods
  // ============================================

  /**
   * 更新盘口数据
   * Update order book data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} orderBook - 盘口数据 / Order book data
   */
  updateOrderBook(symbol, orderBook) {
    // 缓存新数据 / Cache new data
    this.orderBookCache.set(symbol, {
      ...orderBook,
      timestamp: Date.now(),
    });

    // 自动分析深度 / Auto analyze depth
    const analysis = this.analyzeDepth(orderBook, symbol);

    // 发出事件 / Emit event
    this.emit('orderBookUpdated', { symbol, analysis });
  }

  /**
   * 更新日均成交量
   * Update daily volume
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} volume - 日均成交量 / Daily volume
   */
  updateDailyVolume(symbol, volume) {
    this.dailyVolumeCache.set(symbol, volume);
  }

  /**
   * 获取缓存的盘口数据
   * Get cached order book data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 盘口数据 / Order book data
   */
  getCachedOrderBook(symbol) {
    const cached = this.orderBookCache.get(symbol);

    // 检查是否过期 / Check if expired
    if (cached && Date.now() - cached.timestamp < this.config.cacheTime) {
      return cached;
    }

    return null;
  }

  /**
   * 记录实际成交结果（用于校准预估准确度）
   * Record actual execution result (for calibrating estimation accuracy)
   *
   * @param {Object} executionResult - 实际成交结果 / Actual execution result
   */
  recordActualExecution(executionResult) {
    const {
      estimatedImpact,
      actualImpact,
    } = executionResult;

    // 更新统计 / Update statistics
    this.stats.totalSlippageEstimated += estimatedImpact || 0;
    this.stats.totalSlippageActual += actualImpact || 0;

    // 检查预估准确度 / Check estimation accuracy
    if (estimatedImpact && actualImpact) {
      const accuracy = 1 - Math.abs(estimatedImpact - actualImpact) / Math.max(estimatedImpact, actualImpact);
      if (accuracy > 0.8) {
        this.stats.accurateEstimations++;
      }
    }

    this.stats.analyzedOrders++;
  }

  // ============================================
  // 内部辅助方法 / Internal Helper Methods
  // ============================================

  /**
   * 计算盘口深度
   * Calculate order book depth
   *
   * @param {Array} orders - 订单列表 [[price, volume], ...] / Order list
   * @param {number} levels - 分析档位数 / Number of levels to analyze
   * @returns {Object} 深度信息 / Depth info
   * @private
   */
  _calculateDepth(orders, levels) {
    // 如果没有订单 / If no orders
    if (!orders || orders.length === 0) {
      return {
        totalVolume: 0,
        totalValue: 0,
        levels: 0,
        weightedAvgPrice: 0,
      };
    }

    // 截取指定档位 / Take specified levels
    const limitedOrders = orders.slice(0, levels);

    // 累计计算 / Cumulative calculation
    let totalVolume = 0;
    let totalValue = 0;

    for (const [price, volume] of limitedOrders) {
      totalVolume += volume;
      totalValue += price * volume;
    }

    // 计算加权平均价 / Calculate weighted average price
    const weightedAvgPrice = totalVolume > 0 ? totalValue / totalVolume : 0;

    // 返回结果 / Return result
    return {
      totalVolume,
      totalValue,
      levels: limitedOrders.length,
      weightedAvgPrice,
    };
  }

  /**
   * 计算买卖压力
   * Calculate buy/sell pressure
   *
   * @param {Object} bidDepth - 买盘深度 / Bid depth
   * @param {Object} askDepth - 卖盘深度 / Ask depth
   * @returns {Object} 压力分析 / Pressure analysis
   * @private
   */
  _calculatePressure(bidDepth, askDepth) {
    const totalDepth = bidDepth.totalVolume + askDepth.totalVolume;

    // 如果无深度数据 / If no depth data
    if (totalDepth === 0) {
      return {
        direction: PRESSURE_DIRECTION.NEUTRAL,
        ratio: 0.5,
        imbalance: 0,
      };
    }

    // 计算买盘占比 / Calculate bid ratio
    const bidRatio = bidDepth.totalVolume / totalDepth;
    const askRatio = askDepth.totalVolume / totalDepth;

    // 计算不平衡度 / Calculate imbalance
    const imbalance = Math.abs(bidRatio - askRatio);

    // 判断方向 / Determine direction
    let direction;
    if (imbalance < this.config.imbalanceThreshold) {
      direction = PRESSURE_DIRECTION.NEUTRAL;
    } else if (bidRatio > askRatio) {
      direction = PRESSURE_DIRECTION.BUY;
    } else {
      direction = PRESSURE_DIRECTION.SELL;
    }

    // 返回结果 / Return result
    return {
      direction,
      ratio: bidRatio,
      imbalance,
      bidVolume: bidDepth.totalVolume,
      askVolume: askDepth.totalVolume,
    };
  }

  /**
   * 计算流动性分布
   * Calculate liquidity distribution
   *
   * @param {Array} bids - 买盘 / Bids
   * @param {Array} asks - 卖盘 / Asks
   * @param {number} midPrice - 中间价 / Mid price
   * @returns {Object} 流动性分布 / Liquidity distribution
   * @private
   */
  _calculateLiquidityDistribution(bids, asks, midPrice) {
    // 定义价格区间（相对于中间价的偏离度）/ Define price ranges (deviation from mid price)
    const ranges = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05]; // 0.1%, 0.2%, 0.5%, 1%, 2%, 5%

    const distribution = {
      bids: {},
      asks: {},
    };

    // 计算各区间的流动性 / Calculate liquidity in each range
    for (const range of ranges) {
      const label = `${(range * 100).toFixed(1)}%`;

      // 买盘区间 / Bid range
      const bidThreshold = midPrice * (1 - range);
      distribution.bids[label] = bids
        .filter(([price]) => price >= bidThreshold)
        .reduce((sum, [, vol]) => sum + vol, 0);

      // 卖盘区间 / Ask range
      const askThreshold = midPrice * (1 + range);
      distribution.asks[label] = asks
        .filter(([price]) => price <= askThreshold)
        .reduce((sum, [, vol]) => sum + vol, 0);
    }

    return distribution;
  }

  /**
   * 保存历史快照
   * Save historical snapshot
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} snapshot - 快照数据 / Snapshot data
   * @private
   */
  _saveHistoricalSnapshot(symbol, snapshot) {
    // 获取或创建快照数组 / Get or create snapshot array
    if (!this.historicalSnapshots.has(symbol)) {
      this.historicalSnapshots.set(symbol, []);
    }

    const snapshots = this.historicalSnapshots.get(symbol);

    // 添加新快照 / Add new snapshot
    snapshots.push(snapshot);

    // 保留最近5分钟的数据 / Keep last 5 minutes of data
    const cutoff = Date.now() - 5 * 60 * 1000;
    const filtered = snapshots.filter(s => s.timestamp >= cutoff);

    // 更新快照数组 / Update snapshot array
    this.historicalSnapshots.set(symbol, filtered);
  }

  /**
   * 生成流动性建议
   * Generate liquidity recommendations
   *
   * @param {string} level - 流动性等级 / Liquidity level
   * @param {number} orderRatio - 订单占比 / Order ratio
   * @param {Object} depthAnalysis - 深度分析 / Depth analysis
   * @returns {Array} 建议列表 / Recommendation list
   * @private
   */
  _generateLiquidityRecommendations(level, orderRatio, depthAnalysis) {
    const recommendations = [];

    switch (level) {
      case LIQUIDITY_LEVEL.VERY_LOW:
        recommendations.push('强烈建议拆分订单 / Strongly recommend splitting order');
        recommendations.push('使用TWAP/VWAP执行 / Use TWAP/VWAP execution');
        recommendations.push('考虑延长执行时间 / Consider extending execution time');
        break;

      case LIQUIDITY_LEVEL.LOW:
        recommendations.push('建议拆分订单 / Recommend splitting order');
        recommendations.push('使用冰山单 / Use iceberg order');
        break;

      case LIQUIDITY_LEVEL.MEDIUM:
        recommendations.push('可适度拆分 / May split moderately');
        recommendations.push('监控滑点 / Monitor slippage');
        break;

      case LIQUIDITY_LEVEL.HIGH:
      case LIQUIDITY_LEVEL.VERY_HIGH:
        recommendations.push('流动性充足 / Liquidity is sufficient');
        break;
    }

    // 根据价差添加建议 / Add recommendations based on spread
    if (depthAnalysis.spreadBps > 10) {
      recommendations.push('价差较大，建议使用限价单 / Large spread, recommend limit orders');
    }

    return recommendations;
  }

  /**
   * 计算风险等级
   * Calculate risk level
   *
   * @param {string} level - 流动性等级 / Liquidity level
   * @param {number} orderRatio - 订单占比 / Order ratio
   * @returns {number} 风险等级 (1-5) / Risk level (1-5)
   * @private
   */
  _calculateRiskLevel(level, orderRatio) {
    const levelMap = {
      [LIQUIDITY_LEVEL.VERY_HIGH]: 1,
      [LIQUIDITY_LEVEL.HIGH]: 2,
      [LIQUIDITY_LEVEL.MEDIUM]: 3,
      [LIQUIDITY_LEVEL.LOW]: 4,
      [LIQUIDITY_LEVEL.VERY_LOW]: 5,
    };

    return levelMap[level] || 3;
  }

  /**
   * 生成冲击成本建议
   * Generate impact cost suggestions
   *
   * @param {string} impactLevel - 冲击等级 / Impact level
   * @param {number} filledLevels - 穿透档位 / Filled levels
   * @param {number} orderSize - 订单大小 / Order size
   * @param {number} filledSize - 已成交量 / Filled size
   * @returns {Array} 建议列表 / Suggestion list
   * @private
   */
  _generateImpactSuggestions(impactLevel, filledLevels, orderSize, filledSize) {
    const suggestions = [];

    if (impactLevel === 'extreme') {
      suggestions.push('冲击成本过高，强烈建议拆单 / Impact too high, strongly recommend splitting');
      suggestions.push(`建议拆分为 ${Math.ceil(orderSize / filledSize * 2)} 个子订单 / Suggest splitting into ${Math.ceil(orderSize / filledSize * 2)} sub-orders`);
    } else if (impactLevel === 'high') {
      suggestions.push('冲击成本较高，建议使用VWAP执行 / High impact, recommend VWAP execution');
    } else if (impactLevel === 'medium') {
      suggestions.push('冲击成本中等，可考虑分批执行 / Medium impact, consider batch execution');
    }

    if (filledLevels > 10) {
      suggestions.push(`需穿透 ${filledLevels} 档，建议延长执行时间 / Penetrating ${filledLevels} levels, suggest extending execution time`);
    }

    return suggestions;
  }

  /**
   * 生成趋势建议
   * Generate trend suggestions
   *
   * @param {string} trendDirection - 趋势方向 / Trend direction
   * @param {number} bidDepthChange - 买盘变化 / Bid depth change
   * @param {number} askDepthChange - 卖盘变化 / Ask depth change
   * @returns {Array} 建议列表 / Suggestion list
   * @private
   */
  _generateTrendSuggestions(trendDirection, bidDepthChange, askDepthChange) {
    const suggestions = [];

    if (trendDirection === 'bullish') {
      suggestions.push('买盘增厚，可能有上涨压力 / Bid depth increasing, possible upward pressure');
      suggestions.push('买单可适当提高报价 / Buy orders may raise price slightly');
    } else if (trendDirection === 'bearish') {
      suggestions.push('卖盘增厚，可能有下跌压力 / Ask depth increasing, possible downward pressure');
      suggestions.push('卖单可适当降低报价 / Sell orders may lower price slightly');
    }

    return suggestions;
  }

  // ============================================
  // 统计和监控 / Statistics and Monitoring
  // ============================================

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() {
    const estimationAccuracy = this.stats.impactEstimations > 0
      ? this.stats.accurateEstimations / this.stats.impactEstimations
      : 0;

    return {
      ...this.stats,
      estimationAccuracy,
      cachedSymbols: this.orderBookCache.size,
      historySymbols: this.historicalSnapshots.size,
    };
  }

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      analyzedOrders: 0,
      impactEstimations: 0,
      accurateEstimations: 0,
      totalSlippageEstimated: 0,
      totalSlippageActual: 0,
    };
  }

  /**
   * 清理过期数据
   * Clean up expired data
   */
  cleanup() {
    const now = Date.now();

    // 清理过期盘口缓存 / Clean expired order book cache
    for (const [symbol, data] of this.orderBookCache) {
      if (now - data.timestamp > this.config.cacheTime * 10) {
        this.orderBookCache.delete(symbol);
      }
    }

    // 清理过期历史快照 / Clean expired historical snapshots
    const cutoff = now - 10 * 60 * 1000; // 10 分钟 / 10 minutes
    for (const [symbol, snapshots] of this.historicalSnapshots) {
      const filtered = snapshots.filter(s => s.timestamp >= cutoff);
      if (filtered.length === 0) {
        this.historicalSnapshots.delete(symbol);
      } else {
        this.historicalSnapshots.set(symbol, filtered);
      }
    }
  }
}

// 默认导出 / Default export
export default OrderBookAnalyzer;
