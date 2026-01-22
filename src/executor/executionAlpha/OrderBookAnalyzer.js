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

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 流动性等级
 * Liquidity levels
 */
export const LIQUIDITY_LEVEL = { // 导出常量 LIQUIDITY_LEVEL
  VERY_HIGH: 'very_high',   // 非常高 / Very high
  HIGH: 'high',             // 高 / High
  MEDIUM: 'medium',         // 中等 / Medium
  LOW: 'low',               // 低 / Low
  VERY_LOW: 'very_low',     // 非常低 / Very low
}; // 结束代码块

/**
 * 压力方向
 * Pressure direction
 */
export const PRESSURE_DIRECTION = { // 导出常量 PRESSURE_DIRECTION
  BUY: 'buy',       // 买压 / Buy pressure
  SELL: 'sell',     // 卖压 / Sell pressure
  NEUTRAL: 'neutral', // 中性 / Neutral
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = { // 导出常量 DEFAULT_CONFIG
  // 分析深度（档位数）/ Analysis depth (levels)
  depthLevels: 20, // 设置 depthLevels 字段

  // 冲击成本阈值 / Impact cost thresholds
  impactCostThresholds: { // 设置 impactCostThresholds 字段
    low: 0.001,      // 0.1% 低冲击 / Low impact
    medium: 0.003,   // 0.3% 中等冲击 / Medium impact
    high: 0.01,      // 1% 高冲击 / High impact
  }, // 结束代码块

  // 流动性评估阈值（相对于日均成交量）/ Liquidity thresholds (relative to daily volume)
  liquidityThresholds: { // 设置 liquidityThresholds 字段
    veryHigh: 0.1,   // 10% 日均量 / 10% of daily volume
    high: 0.05,      // 5% 日均量 / 5% of daily volume
    medium: 0.02,    // 2% 日均量 / 2% of daily volume
    low: 0.01,       // 1% 日均量 / 1% of daily volume
  }, // 结束代码块

  // 买卖压力不平衡阈值 / Buy/sell imbalance threshold
  imbalanceThreshold: 0.3, // 30% 差异视为不平衡 / 30% difference considered imbalanced

  // 盘口数据缓存时间（毫秒）/ Order book cache time (ms)
  cacheTime: 100, // 设置 cacheTime 字段

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 设置 verbose 字段
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 盘口厚度分析器
 * Order Book Analyzer
 */
export class OrderBookAnalyzer extends EventEmitter { // 导出类 OrderBookAnalyzer
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 合并配置 / Merge config
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 盘口数据缓存 / Order book cache
    // 格式: { symbol: { bids, asks, timestamp, exchange } }
    this.orderBookCache = new Map(); // 设置 orderBookCache

    // 历史盘口快照（用于趋势分析）/ Historical snapshots (for trend analysis)
    // 格式: { symbol: [{ timestamp, bidDepth, askDepth, spread }] }
    this.historicalSnapshots = new Map(); // 设置 historicalSnapshots

    // 日均成交量缓存 / Daily volume cache
    // 格式: { symbol: volume }
    this.dailyVolumeCache = new Map(); // 设置 dailyVolumeCache

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      analyzedOrders: 0,          // 分析的订单数 / Analyzed orders
      impactEstimations: 0,        // 冲击预估次数 / Impact estimations
      accurateEstimations: 0,      // 准确预估次数 / Accurate estimations
      totalSlippageEstimated: 0,   // 总预估滑点 / Total estimated slippage
      totalSlippageActual: 0,      // 总实际滑点 / Total actual slippage
    }; // 结束代码块
  } // 结束代码块

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
  analyzeDepth(orderBook, symbol) { // 调用 analyzeDepth
    // 提取买卖盘 / Extract bids and asks
    const { bids = [], asks = [] } = orderBook; // 解构赋值

    // 计算买盘深度 / Calculate bid depth
    const bidDepth = this._calculateDepth(bids, this.config.depthLevels); // 定义常量 bidDepth

    // 计算卖盘深度 / Calculate ask depth
    const askDepth = this._calculateDepth(asks, this.config.depthLevels); // 定义常量 askDepth

    // 计算买卖价差 / Calculate spread
    const bestBid = bids[0]?.[0] || 0; // 定义常量 bestBid
    const bestAsk = asks[0]?.[0] || 0; // 定义常量 bestAsk
    const spread = bestAsk > 0 ? (bestAsk - bestBid) / bestAsk : 0; // 定义常量 spread
    const midPrice = (bestBid + bestAsk) / 2; // 定义常量 midPrice

    // 计算买卖压力 / Calculate buy/sell pressure
    const pressure = this._calculatePressure(bidDepth, askDepth); // 定义常量 pressure

    // 计算流动性分布 / Calculate liquidity distribution
    const liquidityDistribution = this._calculateLiquidityDistribution(bids, asks, midPrice); // 定义常量 liquidityDistribution

    // 缓存盘口数据 / Cache order book data
    this.orderBookCache.set(symbol, { // 访问 orderBookCache
      bids, // 执行语句
      asks, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
      bestBid, // 执行语句
      bestAsk, // 执行语句
      midPrice, // 执行语句
    }); // 结束代码块

    // 保存历史快照 / Save historical snapshot
    this._saveHistoricalSnapshot(symbol, { // 调用 _saveHistoricalSnapshot
      timestamp: Date.now(), // 设置 timestamp 字段
      bidDepth, // 执行语句
      askDepth, // 执行语句
      spread, // 执行语句
      midPrice, // 执行语句
    }); // 结束代码块

    // 返回分析结果 / Return analysis result
    return { // 返回结果
      // 最佳买价 / Best bid
      bestBid, // 执行语句

      // 最佳卖价 / Best ask
      bestAsk, // 执行语句

      // 中间价 / Mid price
      midPrice, // 执行语句

      // 买卖价差 / Spread
      spread, // 执行语句

      // 买卖价差（基点）/ Spread in basis points
      spreadBps: spread * 10000, // 设置 spreadBps 字段

      // 买盘深度 / Bid depth
      bidDepth: { // 设置 bidDepth 字段
        totalVolume: bidDepth.totalVolume, // 设置 totalVolume 字段
        totalValue: bidDepth.totalValue, // 设置 totalValue 字段
        levels: bidDepth.levels, // 设置 levels 字段
        weightedAvgPrice: bidDepth.weightedAvgPrice, // 设置 weightedAvgPrice 字段
      }, // 结束代码块

      // 卖盘深度 / Ask depth
      askDepth: { // 设置 askDepth 字段
        totalVolume: askDepth.totalVolume, // 设置 totalVolume 字段
        totalValue: askDepth.totalValue, // 设置 totalValue 字段
        levels: askDepth.levels, // 设置 levels 字段
        weightedAvgPrice: askDepth.weightedAvgPrice, // 设置 weightedAvgPrice 字段
      }, // 结束代码块

      // 买卖压力 / Buy/sell pressure
      pressure, // 执行语句

      // 流动性分布 / Liquidity distribution
      liquidityDistribution, // 执行语句

      // 分析时间 / Analysis timestamp
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 评估流动性等级
   * Assess liquidity level
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} orderSize - 订单大小 / Order size
   * @param {Object} depthAnalysis - 深度分析结果 / Depth analysis result
   * @returns {Object} 流动性评估结果 / Liquidity assessment result
   */
  assessLiquidity(symbol, orderSize, depthAnalysis) { // 调用 assessLiquidity
    // 获取日均成交量 / Get daily volume
    const dailyVolume = this.dailyVolumeCache.get(symbol) || 0; // 定义常量 dailyVolume

    // 计算订单占比 / Calculate order ratio
    const orderRatio = dailyVolume > 0 ? orderSize / dailyVolume : 1; // 定义常量 orderRatio

    // 判断流动性等级 / Determine liquidity level
    let level; // 定义变量 level
    const thresholds = this.config.liquidityThresholds; // 定义常量 thresholds

    if (orderRatio <= thresholds.low / 10) { // 条件判断 orderRatio <= thresholds.low / 10
      level = LIQUIDITY_LEVEL.VERY_HIGH; // 赋值 level
    } else if (orderRatio <= thresholds.low) { // 执行语句
      level = LIQUIDITY_LEVEL.HIGH; // 赋值 level
    } else if (orderRatio <= thresholds.medium) { // 执行语句
      level = LIQUIDITY_LEVEL.MEDIUM; // 赋值 level
    } else if (orderRatio <= thresholds.high) { // 执行语句
      level = LIQUIDITY_LEVEL.LOW; // 赋值 level
    } else { // 执行语句
      level = LIQUIDITY_LEVEL.VERY_LOW; // 赋值 level
    } // 结束代码块

    // 计算盘口能承载的量 / Calculate absorbable volume
    const bidAbsorb = depthAnalysis.bidDepth.totalVolume; // 定义常量 bidAbsorb
    const askAbsorb = depthAnalysis.askDepth.totalVolume; // 定义常量 askAbsorb

    // 计算可承载比例 / Calculate absorption ratio
    const bidAbsorbRatio = bidAbsorb > 0 ? Math.min(orderSize / bidAbsorb, 1) : 1; // 定义常量 bidAbsorbRatio
    const askAbsorbRatio = askAbsorb > 0 ? Math.min(orderSize / askAbsorb, 1) : 1; // 定义常量 askAbsorbRatio

    // 返回评估结果 / Return assessment result
    return { // 返回结果
      // 流动性等级 / Liquidity level
      level, // 执行语句

      // 订单占日均量比例 / Order to daily volume ratio
      orderRatio, // 执行语句

      // 日均成交量 / Daily volume
      dailyVolume, // 执行语句

      // 买盘可吸收比例 / Bid absorption ratio
      bidAbsorbRatio, // 执行语句

      // 卖盘可吸收比例 / Ask absorption ratio
      askAbsorbRatio, // 执行语句

      // 建议 / Recommendations
      recommendations: this._generateLiquidityRecommendations(level, orderRatio, depthAnalysis), // 设置 recommendations 字段

      // 风险等级 (1-5) / Risk level (1-5)
      riskLevel: this._calculateRiskLevel(level, orderRatio), // 设置 riskLevel 字段
    }; // 结束代码块
  } // 结束代码块

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
  estimateImpactCost(symbol, side, orderSize, orderBook) { // 调用 estimateImpactCost
    // 更新统计 / Update stats
    this.stats.impactEstimations++; // 访问 stats

    // 选择相应的盘口数据 / Select appropriate order book side
    const orders = side === 'buy' ? orderBook.asks : orderBook.bids; // 定义常量 orders

    // 如果没有盘口数据 / If no order book data
    if (!orders || orders.length === 0) { // 条件判断 !orders || orders.length === 0
      return { // 返回结果
        estimatedPrice: 0, // 设置 estimatedPrice 字段
        impactCost: 1,  // 100% 冲击（无法执行）/ 100% impact (cannot execute)
        impactBps: 10000, // 设置 impactBps 字段
        filledLevels: 0, // 设置 filledLevels 字段
        remainingSize: orderSize, // 设置 remainingSize 字段
        canExecute: false, // 设置 canExecute 字段
      }; // 结束代码块
    } // 结束代码块

    // 模拟成交 / Simulate execution
    let remainingSize = orderSize; // 定义变量 remainingSize
    let totalCost = 0; // 定义变量 totalCost
    let filledLevels = 0; // 定义变量 filledLevels

    for (const [price, volume] of orders) { // 循环 const [price, volume] of orders
      if (remainingSize <= 0) break; // 条件判断 remainingSize <= 0

      // 计算这一档可成交的量 / Calculate fillable volume at this level
      const fillVolume = Math.min(remainingSize, volume); // 定义常量 fillVolume

      // 累加成本 / Accumulate cost
      totalCost += fillVolume * price; // 执行语句

      // 减少剩余量 / Reduce remaining size
      remainingSize -= fillVolume; // 执行语句

      // 记录穿透档位 / Record filled levels
      filledLevels++; // 执行语句
    } // 结束代码块

    // 计算成交均价 / Calculate average fill price
    const filledSize = orderSize - remainingSize; // 定义常量 filledSize
    const avgFillPrice = filledSize > 0 ? totalCost / filledSize : 0; // 定义常量 avgFillPrice

    // 计算冲击成本 / Calculate impact cost
    const bestPrice = orders[0][0]; // 定义常量 bestPrice
    const impactCost = bestPrice > 0 ? Math.abs(avgFillPrice - bestPrice) / bestPrice : 0; // 定义常量 impactCost

    // 判断冲击等级 / Determine impact level
    let impactLevel; // 定义变量 impactLevel
    const thresholds = this.config.impactCostThresholds; // 定义常量 thresholds

    if (impactCost <= thresholds.low) { // 条件判断 impactCost <= thresholds.low
      impactLevel = 'low'; // 赋值 impactLevel
    } else if (impactCost <= thresholds.medium) { // 执行语句
      impactLevel = 'medium'; // 赋值 impactLevel
    } else if (impactCost <= thresholds.high) { // 执行语句
      impactLevel = 'high'; // 赋值 impactLevel
    } else { // 执行语句
      impactLevel = 'extreme'; // 赋值 impactLevel
    } // 结束代码块

    // 返回预估结果 / Return estimation result
    return { // 返回结果
      // 预估成交均价 / Estimated average price
      estimatedPrice: avgFillPrice, // 设置 estimatedPrice 字段

      // 最优价格 / Best price
      bestPrice, // 执行语句

      // 冲击成本（比例）/ Impact cost (ratio)
      impactCost, // 执行语句

      // 冲击成本（基点）/ Impact cost (bps)
      impactBps: impactCost * 10000, // 设置 impactBps 字段

      // 冲击等级 / Impact level
      impactLevel, // 执行语句

      // 穿透档位数 / Filled levels
      filledLevels, // 执行语句

      // 已成交量 / Filled size
      filledSize, // 执行语句

      // 剩余未成交量 / Remaining size
      remainingSize, // 执行语句

      // 是否可完全成交 / Can fully execute
      canExecute: remainingSize === 0, // 设置 canExecute 字段

      // 完全成交比例 / Fill ratio
      fillRatio: filledSize / orderSize, // 设置 fillRatio 字段

      // 建议 / Suggestions
      suggestions: this._generateImpactSuggestions(impactLevel, filledLevels, orderSize, filledSize), // 设置 suggestions 字段
    }; // 结束代码块
  } // 结束代码块

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
  calculateOptimalPrice(symbol, side, orderSize, orderBook, options = {}) { // 调用 calculateOptimalPrice
    const { // 解构赋值
      targetFillRatio = 1.0,    // 目标成交比例 / Target fill ratio
      maxImpactBps = 10,        // 最大可接受冲击（基点）/ Max acceptable impact (bps)
      urgency = 'normal',       // 紧迫程度 / Urgency level
    } = options; // 执行语句

    // 获取盘口分析 / Get depth analysis
    const depthAnalysis = this.analyzeDepth(orderBook, symbol); // 定义常量 depthAnalysis

    // 选择相应盘口 / Select appropriate side
    const isBuy = side === 'buy'; // 定义常量 isBuy
    const orders = isBuy ? orderBook.asks : orderBook.bids; // 定义常量 orders
    const bestPrice = isBuy ? depthAnalysis.bestAsk : depthAnalysis.bestBid; // 定义常量 bestPrice
    const oppositePrice = isBuy ? depthAnalysis.bestBid : depthAnalysis.bestAsk; // 定义常量 oppositePrice

    // 如果无盘口数据 / If no order book data
    if (!orders || orders.length === 0 || bestPrice === 0) { // 条件判断 !orders || orders.length === 0 || bestPrice =...
      return { // 返回结果
        optimalPrice: 0, // 设置 optimalPrice 字段
        canExecute: false, // 设置 canExecute 字段
        reason: '无盘口数据 / No order book data', // 设置 reason 字段
      }; // 结束代码块
    } // 结束代码块

    // 根据紧迫程度调整策略 / Adjust strategy based on urgency
    let priceStrategy; // 定义变量 priceStrategy
    switch (urgency) { // 分支选择 urgency
      case 'high': // 分支 'high'
        // 紧急：使用略激进的价格 / Urgent: use slightly aggressive price
        priceStrategy = 'aggressive'; // 赋值 priceStrategy
        break; // 跳出循环或分支
      case 'low': // 分支 'low'
        // 不紧急：耐心挂单 / Not urgent: patient limit order
        priceStrategy = 'passive'; // 赋值 priceStrategy
        break; // 跳出循环或分支
      default: // 默认分支
        // 正常：平衡策略 / Normal: balanced strategy
        priceStrategy = 'balanced'; // 赋值 priceStrategy
    } // 结束代码块

    // 计算不同价格策略 / Calculate different price strategies
    let optimalPrice; // 定义变量 optimalPrice
    let expectedFill; // 定义变量 expectedFill
    let expectedImpact; // 定义变量 expectedImpact

    switch (priceStrategy) { // 分支选择 priceStrategy
      case 'aggressive': // 分支 'aggressive'
        // 激进：穿透到能成交目标量的价位 / Aggressive: penetrate to fill target
        const impactResult = this.estimateImpactCost(symbol, side, orderSize * targetFillRatio, orderBook); // 定义常量 impactResult
        optimalPrice = impactResult.estimatedPrice; // 赋值 optimalPrice
        expectedFill = impactResult.fillRatio; // 赋值 expectedFill
        expectedImpact = impactResult.impactBps; // 赋值 expectedImpact
        break; // 跳出循环或分支

      case 'passive': // 分支 'passive'
        // 被动：挂在对手盘最优价之内 / Passive: place inside spread
        const spreadMid = (bestPrice + oppositePrice) / 2; // 定义常量 spreadMid
        optimalPrice = isBuy // 赋值 optimalPrice
          ? Math.min(spreadMid, bestPrice * (1 - maxImpactBps / 10000)) // 执行语句
          : Math.max(spreadMid, bestPrice * (1 + maxImpactBps / 10000)); // 执行语句
        expectedFill = 0.3;  // 预期30%成交 / Expected 30% fill
        expectedImpact = 0; // 赋值 expectedImpact
        break; // 跳出循环或分支

      default: // 默认分支
        // 平衡：在最优价附近，控制冲击 / Balanced: near best price, control impact
        optimalPrice = isBuy // 赋值 optimalPrice
          ? bestPrice * (1 + maxImpactBps / 20000)  // 允许一半的冲击 / Allow half the impact
          : bestPrice * (1 - maxImpactBps / 20000); // 执行语句
        expectedFill = 0.7;  // 预期70%成交 / Expected 70% fill
        expectedImpact = maxImpactBps / 2; // 赋值 expectedImpact
    } // 结束代码块

    // 返回结果 / Return result
    return { // 返回结果
      // 最优价格 / Optimal price
      optimalPrice, // 执行语句

      // 当前最优对手价 / Current best opposite price
      bestPrice, // 执行语句

      // 盘口中间价 / Mid price
      midPrice: depthAnalysis.midPrice, // 设置 midPrice 字段

      // 价格策略 / Price strategy
      priceStrategy, // 执行语句

      // 预期成交比例 / Expected fill ratio
      expectedFill, // 执行语句

      // 预期冲击（基点）/ Expected impact (bps)
      expectedImpact, // 执行语句

      // 是否可执行 / Can execute
      canExecute: true, // 设置 canExecute 字段

      // 买卖价差 / Spread
      spread: depthAnalysis.spread, // 设置 spread 字段

      // 买卖压力 / Pressure
      pressure: depthAnalysis.pressure, // 设置 pressure 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 分析盘口变化趋势
   * Analyze order book trend
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} lookbackPeriod - 回看周期（毫秒）/ Lookback period (ms)
   * @returns {Object} 趋势分析结果 / Trend analysis result
   */
  analyzeTrend(symbol, lookbackPeriod = 60000) { // 调用 analyzeTrend
    // 获取历史快照 / Get historical snapshots
    const snapshots = this.historicalSnapshots.get(symbol) || []; // 定义常量 snapshots

    // 过滤指定时间范围内的快照 / Filter snapshots within time range
    const cutoffTime = Date.now() - lookbackPeriod; // 定义常量 cutoffTime
    const recentSnapshots = snapshots.filter(s => s.timestamp >= cutoffTime); // 定义函数 recentSnapshots

    // 如果数据不足 / If insufficient data
    if (recentSnapshots.length < 2) { // 条件判断 recentSnapshots.length < 2
      return { // 返回结果
        hasTrend: false, // 设置 hasTrend 字段
        reason: '历史数据不足 / Insufficient historical data', // 设置 reason 字段
      }; // 结束代码块
    } // 结束代码块

    // 计算买盘深度变化 / Calculate bid depth change
    const firstSnapshot = recentSnapshots[0]; // 定义常量 firstSnapshot
    const lastSnapshot = recentSnapshots[recentSnapshots.length - 1]; // 定义常量 lastSnapshot

    const bidDepthChange = (lastSnapshot.bidDepth - firstSnapshot.bidDepth) / firstSnapshot.bidDepth; // 定义常量 bidDepthChange
    const askDepthChange = (lastSnapshot.askDepth - firstSnapshot.askDepth) / firstSnapshot.askDepth; // 定义常量 askDepthChange
    const spreadChange = lastSnapshot.spread - firstSnapshot.spread; // 定义常量 spreadChange
    const priceChange = (lastSnapshot.midPrice - firstSnapshot.midPrice) / firstSnapshot.midPrice; // 定义常量 priceChange

    // 判断趋势方向 / Determine trend direction
    let trendDirection; // 定义变量 trendDirection
    if (bidDepthChange > 0.1 && askDepthChange < -0.05) { // 条件判断 bidDepthChange > 0.1 && askDepthChange < -0.05
      trendDirection = 'bullish';  // 看涨 / Bullish
    } else if (askDepthChange > 0.1 && bidDepthChange < -0.05) { // 执行语句
      trendDirection = 'bearish';  // 看跌 / Bearish
    } else { // 执行语句
      trendDirection = 'neutral';  // 中性 / Neutral
    } // 结束代码块

    // 返回趋势分析 / Return trend analysis
    return { // 返回结果
      // 是否有明显趋势 / Has clear trend
      hasTrend: trendDirection !== 'neutral', // 设置 hasTrend 字段

      // 趋势方向 / Trend direction
      trendDirection, // 执行语句

      // 买盘深度变化 / Bid depth change
      bidDepthChange, // 执行语句

      // 卖盘深度变化 / Ask depth change
      askDepthChange, // 执行语句

      // 价差变化 / Spread change
      spreadChange, // 执行语句

      // 价格变化 / Price change
      priceChange, // 执行语句

      // 分析时段 / Analysis period
      periodMs: lookbackPeriod, // 设置 periodMs 字段

      // 样本数 / Sample count
      sampleCount: recentSnapshots.length, // 设置 sampleCount 字段

      // 建议 / Suggestions
      suggestions: this._generateTrendSuggestions(trendDirection, bidDepthChange, askDepthChange), // 设置 suggestions 字段
    }; // 结束代码块
  } // 结束代码块

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
  updateOrderBook(symbol, orderBook) { // 调用 updateOrderBook
    // 缓存新数据 / Cache new data
    this.orderBookCache.set(symbol, { // 访问 orderBookCache
      ...orderBook, // 展开对象或数组
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块

    // 自动分析深度 / Auto analyze depth
    const analysis = this.analyzeDepth(orderBook, symbol); // 定义常量 analysis

    // 发出事件 / Emit event
    this.emit('orderBookUpdated', { symbol, analysis }); // 调用 emit
  } // 结束代码块

  /**
   * 更新日均成交量
   * Update daily volume
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} volume - 日均成交量 / Daily volume
   */
  updateDailyVolume(symbol, volume) { // 调用 updateDailyVolume
    this.dailyVolumeCache.set(symbol, volume); // 访问 dailyVolumeCache
  } // 结束代码块

  /**
   * 获取缓存的盘口数据
   * Get cached order book data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 盘口数据 / Order book data
   */
  getCachedOrderBook(symbol) { // 调用 getCachedOrderBook
    const cached = this.orderBookCache.get(symbol); // 定义常量 cached

    // 检查是否过期 / Check if expired
    if (cached && Date.now() - cached.timestamp < this.config.cacheTime) { // 条件判断 cached && Date.now() - cached.timestamp < thi...
      return cached; // 返回结果
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 记录实际成交结果（用于校准预估准确度）
   * Record actual execution result (for calibrating estimation accuracy)
   *
   * @param {Object} executionResult - 实际成交结果 / Actual execution result
   */
  recordActualExecution(executionResult) { // 调用 recordActualExecution
    const { // 解构赋值
      estimatedImpact, // 执行语句
      actualImpact, // 执行语句
    } = executionResult; // 执行语句

    // 更新统计 / Update statistics
    this.stats.totalSlippageEstimated += estimatedImpact || 0; // 访问 stats
    this.stats.totalSlippageActual += actualImpact || 0; // 访问 stats

    // 检查预估准确度 / Check estimation accuracy
    if (estimatedImpact && actualImpact) { // 条件判断 estimatedImpact && actualImpact
      const accuracy = 1 - Math.abs(estimatedImpact - actualImpact) / Math.max(estimatedImpact, actualImpact); // 定义常量 accuracy
      if (accuracy > 0.8) { // 条件判断 accuracy > 0.8
        this.stats.accurateEstimations++; // 访问 stats
      } // 结束代码块
    } // 结束代码块

    this.stats.analyzedOrders++; // 访问 stats
  } // 结束代码块

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
  _calculateDepth(orders, levels) { // 调用 _calculateDepth
    // 如果没有订单 / If no orders
    if (!orders || orders.length === 0) { // 条件判断 !orders || orders.length === 0
      return { // 返回结果
        totalVolume: 0, // 设置 totalVolume 字段
        totalValue: 0, // 设置 totalValue 字段
        levels: 0, // 设置 levels 字段
        weightedAvgPrice: 0, // 设置 weightedAvgPrice 字段
      }; // 结束代码块
    } // 结束代码块

    // 截取指定档位 / Take specified levels
    const limitedOrders = orders.slice(0, levels); // 定义常量 limitedOrders

    // 累计计算 / Cumulative calculation
    let totalVolume = 0; // 定义变量 totalVolume
    let totalValue = 0; // 定义变量 totalValue

    for (const [price, volume] of limitedOrders) { // 循环 const [price, volume] of limitedOrders
      totalVolume += volume; // 执行语句
      totalValue += price * volume; // 执行语句
    } // 结束代码块

    // 计算加权平均价 / Calculate weighted average price
    const weightedAvgPrice = totalVolume > 0 ? totalValue / totalVolume : 0; // 定义常量 weightedAvgPrice

    // 返回结果 / Return result
    return { // 返回结果
      totalVolume, // 执行语句
      totalValue, // 执行语句
      levels: limitedOrders.length, // 设置 levels 字段
      weightedAvgPrice, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算买卖压力
   * Calculate buy/sell pressure
   *
   * @param {Object} bidDepth - 买盘深度 / Bid depth
   * @param {Object} askDepth - 卖盘深度 / Ask depth
   * @returns {Object} 压力分析 / Pressure analysis
   * @private
   */
  _calculatePressure(bidDepth, askDepth) { // 调用 _calculatePressure
    const totalDepth = bidDepth.totalVolume + askDepth.totalVolume; // 定义常量 totalDepth

    // 如果无深度数据 / If no depth data
    if (totalDepth === 0) { // 条件判断 totalDepth === 0
      return { // 返回结果
        direction: PRESSURE_DIRECTION.NEUTRAL, // 设置 direction 字段
        ratio: 0.5, // 设置 ratio 字段
        imbalance: 0, // 设置 imbalance 字段
      }; // 结束代码块
    } // 结束代码块

    // 计算买盘占比 / Calculate bid ratio
    const bidRatio = bidDepth.totalVolume / totalDepth; // 定义常量 bidRatio
    const askRatio = askDepth.totalVolume / totalDepth; // 定义常量 askRatio

    // 计算不平衡度 / Calculate imbalance
    const imbalance = Math.abs(bidRatio - askRatio); // 定义常量 imbalance

    // 判断方向 / Determine direction
    let direction; // 定义变量 direction
    if (imbalance < this.config.imbalanceThreshold) { // 条件判断 imbalance < this.config.imbalanceThreshold
      direction = PRESSURE_DIRECTION.NEUTRAL; // 赋值 direction
    } else if (bidRatio > askRatio) { // 执行语句
      direction = PRESSURE_DIRECTION.BUY; // 赋值 direction
    } else { // 执行语句
      direction = PRESSURE_DIRECTION.SELL; // 赋值 direction
    } // 结束代码块

    // 返回结果 / Return result
    return { // 返回结果
      direction, // 执行语句
      ratio: bidRatio, // 设置 ratio 字段
      imbalance, // 执行语句
      bidVolume: bidDepth.totalVolume, // 设置 bidVolume 字段
      askVolume: askDepth.totalVolume, // 设置 askVolume 字段
    }; // 结束代码块
  } // 结束代码块

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
  _calculateLiquidityDistribution(bids, asks, midPrice) { // 调用 _calculateLiquidityDistribution
    // 定义价格区间（相对于中间价的偏离度）/ Define price ranges (deviation from mid price)
    const ranges = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05]; // 0.1%, 0.2%, 0.5%, 1%, 2%, 5%

    const distribution = { // 定义常量 distribution
      bids: {}, // 设置 bids 字段
      asks: {}, // 设置 asks 字段
    }; // 结束代码块

    // 计算各区间的流动性 / Calculate liquidity in each range
    for (const range of ranges) { // 循环 const range of ranges
      const label = `${(range * 100).toFixed(1)}%`; // 定义常量 label

      // 买盘区间 / Bid range
      const bidThreshold = midPrice * (1 - range); // 定义常量 bidThreshold
      distribution.bids[label] = bids // 执行语句
        .filter(([price]) => price >= bidThreshold) // 定义箭头函数
        .reduce((sum, [, vol]) => sum + vol, 0); // 定义箭头函数

      // 卖盘区间 / Ask range
      const askThreshold = midPrice * (1 + range); // 定义常量 askThreshold
      distribution.asks[label] = asks // 执行语句
        .filter(([price]) => price <= askThreshold) // 定义箭头函数
        .reduce((sum, [, vol]) => sum + vol, 0); // 定义箭头函数
    } // 结束代码块

    return distribution; // 返回结果
  } // 结束代码块

  /**
   * 保存历史快照
   * Save historical snapshot
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} snapshot - 快照数据 / Snapshot data
   * @private
   */
  _saveHistoricalSnapshot(symbol, snapshot) { // 调用 _saveHistoricalSnapshot
    // 获取或创建快照数组 / Get or create snapshot array
    if (!this.historicalSnapshots.has(symbol)) { // 条件判断 !this.historicalSnapshots.has(symbol)
      this.historicalSnapshots.set(symbol, []); // 访问 historicalSnapshots
    } // 结束代码块

    const snapshots = this.historicalSnapshots.get(symbol); // 定义常量 snapshots

    // 添加新快照 / Add new snapshot
    snapshots.push(snapshot); // 调用 snapshots.push

    // 保留最近5分钟的数据 / Keep last 5 minutes of data
    const cutoff = Date.now() - 5 * 60 * 1000; // 定义常量 cutoff
    const filtered = snapshots.filter(s => s.timestamp >= cutoff); // 定义函数 filtered

    // 更新快照数组 / Update snapshot array
    this.historicalSnapshots.set(symbol, filtered); // 访问 historicalSnapshots
  } // 结束代码块

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
  _generateLiquidityRecommendations(level, orderRatio, depthAnalysis) { // 调用 _generateLiquidityRecommendations
    const recommendations = []; // 定义常量 recommendations

    switch (level) { // 分支选择 level
      case LIQUIDITY_LEVEL.VERY_LOW: // 分支 LIQUIDITY_LEVEL.VERY_LOW
        recommendations.push('强烈建议拆分订单 / Strongly recommend splitting order'); // 调用 recommendations.push
        recommendations.push('使用TWAP/VWAP执行 / Use TWAP/VWAP execution'); // 调用 recommendations.push
        recommendations.push('考虑延长执行时间 / Consider extending execution time'); // 调用 recommendations.push
        break; // 跳出循环或分支

      case LIQUIDITY_LEVEL.LOW: // 分支 LIQUIDITY_LEVEL.LOW
        recommendations.push('建议拆分订单 / Recommend splitting order'); // 调用 recommendations.push
        recommendations.push('使用冰山单 / Use iceberg order'); // 调用 recommendations.push
        break; // 跳出循环或分支

      case LIQUIDITY_LEVEL.MEDIUM: // 分支 LIQUIDITY_LEVEL.MEDIUM
        recommendations.push('可适度拆分 / May split moderately'); // 调用 recommendations.push
        recommendations.push('监控滑点 / Monitor slippage'); // 调用 recommendations.push
        break; // 跳出循环或分支

      case LIQUIDITY_LEVEL.HIGH: // 分支 LIQUIDITY_LEVEL.HIGH
      case LIQUIDITY_LEVEL.VERY_HIGH: // 分支 LIQUIDITY_LEVEL.VERY_HIGH
        recommendations.push('流动性充足 / Liquidity is sufficient'); // 调用 recommendations.push
        break; // 跳出循环或分支
    } // 结束代码块

    // 根据价差添加建议 / Add recommendations based on spread
    if (depthAnalysis.spreadBps > 10) { // 条件判断 depthAnalysis.spreadBps > 10
      recommendations.push('价差较大，建议使用限价单 / Large spread, recommend limit orders'); // 调用 recommendations.push
    } // 结束代码块

    return recommendations; // 返回结果
  } // 结束代码块

  /**
   * 计算风险等级
   * Calculate risk level
   *
   * @param {string} level - 流动性等级 / Liquidity level
   * @param {number} orderRatio - 订单占比 / Order ratio
   * @returns {number} 风险等级 (1-5) / Risk level (1-5)
   * @private
   */
  _calculateRiskLevel(level, orderRatio) { // 调用 _calculateRiskLevel
    const levelMap = { // 定义常量 levelMap
      [LIQUIDITY_LEVEL.VERY_HIGH]: 1, // 执行语句
      [LIQUIDITY_LEVEL.HIGH]: 2, // 执行语句
      [LIQUIDITY_LEVEL.MEDIUM]: 3, // 执行语句
      [LIQUIDITY_LEVEL.LOW]: 4, // 执行语句
      [LIQUIDITY_LEVEL.VERY_LOW]: 5, // 执行语句
    }; // 结束代码块

    return levelMap[level] || 3; // 返回结果
  } // 结束代码块

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
  _generateImpactSuggestions(impactLevel, filledLevels, orderSize, filledSize) { // 调用 _generateImpactSuggestions
    const suggestions = []; // 定义常量 suggestions

    if (impactLevel === 'extreme') { // 条件判断 impactLevel === 'extreme'
      suggestions.push('冲击成本过高，强烈建议拆单 / Impact too high, strongly recommend splitting'); // 调用 suggestions.push
      suggestions.push(`建议拆分为 ${Math.ceil(orderSize / filledSize * 2)} 个子订单 / Suggest splitting into ${Math.ceil(orderSize / filledSize * 2)} sub-orders`); // 调用 suggestions.push
    } else if (impactLevel === 'high') { // 执行语句
      suggestions.push('冲击成本较高，建议使用VWAP执行 / High impact, recommend VWAP execution'); // 调用 suggestions.push
    } else if (impactLevel === 'medium') { // 执行语句
      suggestions.push('冲击成本中等，可考虑分批执行 / Medium impact, consider batch execution'); // 调用 suggestions.push
    } // 结束代码块

    if (filledLevels > 10) { // 条件判断 filledLevels > 10
      suggestions.push(`需穿透 ${filledLevels} 档，建议延长执行时间 / Penetrating ${filledLevels} levels, suggest extending execution time`); // 调用 suggestions.push
    } // 结束代码块

    return suggestions; // 返回结果
  } // 结束代码块

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
  _generateTrendSuggestions(trendDirection, bidDepthChange, askDepthChange) { // 调用 _generateTrendSuggestions
    const suggestions = []; // 定义常量 suggestions

    if (trendDirection === 'bullish') { // 条件判断 trendDirection === 'bullish'
      suggestions.push('买盘增厚，可能有上涨压力 / Bid depth increasing, possible upward pressure'); // 调用 suggestions.push
      suggestions.push('买单可适当提高报价 / Buy orders may raise price slightly'); // 调用 suggestions.push
    } else if (trendDirection === 'bearish') { // 执行语句
      suggestions.push('卖盘增厚，可能有下跌压力 / Ask depth increasing, possible downward pressure'); // 调用 suggestions.push
      suggestions.push('卖单可适当降低报价 / Sell orders may lower price slightly'); // 调用 suggestions.push
    } // 结束代码块

    return suggestions; // 返回结果
  } // 结束代码块

  // ============================================
  // 统计和监控 / Statistics and Monitoring
  // ============================================

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() { // 调用 getStats
    const estimationAccuracy = this.stats.impactEstimations > 0 // 定义常量 estimationAccuracy
      ? this.stats.accurateEstimations / this.stats.impactEstimations // 执行语句
      : 0; // 执行语句

    return { // 返回结果
      ...this.stats, // 展开对象或数组
      estimationAccuracy, // 执行语句
      cachedSymbols: this.orderBookCache.size, // 设置 cachedSymbols 字段
      historySymbols: this.historicalSnapshots.size, // 设置 historySymbols 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() { // 调用 resetStats
    this.stats = { // 设置 stats
      analyzedOrders: 0, // 设置 analyzedOrders 字段
      impactEstimations: 0, // 设置 impactEstimations 字段
      accurateEstimations: 0, // 设置 accurateEstimations 字段
      totalSlippageEstimated: 0, // 设置 totalSlippageEstimated 字段
      totalSlippageActual: 0, // 设置 totalSlippageActual 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 清理过期数据
   * Clean up expired data
   */
  cleanup() { // 调用 cleanup
    const now = Date.now(); // 定义常量 now

    // 清理过期盘口缓存 / Clean expired order book cache
    for (const [symbol, data] of this.orderBookCache) { // 循环 const [symbol, data] of this.orderBookCache
      if (now - data.timestamp > this.config.cacheTime * 10) { // 条件判断 now - data.timestamp > this.config.cacheTime ...
        this.orderBookCache.delete(symbol); // 访问 orderBookCache
      } // 结束代码块
    } // 结束代码块

    // 清理过期历史快照 / Clean expired historical snapshots
    const cutoff = now - 10 * 60 * 1000; // 10 分钟 / 10 minutes
    for (const [symbol, snapshots] of this.historicalSnapshots) { // 循环 const [symbol, snapshots] of this.historicalS...
      const filtered = snapshots.filter(s => s.timestamp >= cutoff); // 定义函数 filtered
      if (filtered.length === 0) { // 条件判断 filtered.length === 0
        this.historicalSnapshots.delete(symbol); // 访问 historicalSnapshots
      } else { // 执行语句
        this.historicalSnapshots.set(symbol, filtered); // 访问 historicalSnapshots
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 默认导出 / Default export
export default OrderBookAnalyzer; // 默认导出
