/**
 * 流动性风险监控器
 * Liquidity Risk Monitor
 *
 * 功能 / Features:
 * 1. 订单簿深度分析 / Order book depth analysis
 * 2. 滑点预估 / Slippage estimation
 * 3. 大单拆分建议 / Large order splitting recommendation
 * 4. 流动性评分 / Liquidity scoring
 * 5. 市场冲击成本计算 / Market impact cost calculation
 * 6. 最优执行策略建议 / Optimal execution strategy recommendation
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 流动性级别
 * Liquidity level
 */
const LIQUIDITY_LEVEL = { // 定义常量 LIQUIDITY_LEVEL
  EXCELLENT: 'excellent',   // 优秀 / Excellent
  GOOD: 'good',             // 良好 / Good
  MODERATE: 'moderate',     // 中等 / Moderate
  POOR: 'poor',             // 较差 / Poor
  CRITICAL: 'critical',     // 危险 / Critical
}; // 结束代码块

/**
 * 执行策略
 * Execution strategy
 */
const EXECUTION_STRATEGY = { // 定义常量 EXECUTION_STRATEGY
  IMMEDIATE: 'immediate',           // 立即执行 / Immediate execution
  TWAP: 'twap',                     // 时间加权平均价格 / Time-weighted average price
  VWAP: 'vwap',                     // 成交量加权平均价格 / Volume-weighted average price
  ICEBERG: 'iceberg',               // 冰山订单 / Iceberg order
  ADAPTIVE: 'adaptive',             // 自适应 / Adaptive
  WAIT_FOR_LIQUIDITY: 'wait',       // 等待流动性 / Wait for liquidity
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 深度分析配置 / Depth Analysis Configuration
  // ============================================

  // 分析的深度档位数 / Number of depth levels to analyze
  depthLevels: 20, // 设置 depthLevels 字段

  // 深度数据更新间隔 (毫秒) / Depth data update interval (ms)
  updateInterval: 1000, // 设置 updateInterval 字段

  // 深度历史保留数量 / Depth history retention count
  historyLength: 100, // 设置 historyLength 字段

  // ============================================
  // 滑点估算配置 / Slippage Estimation Configuration
  // ============================================

  // 滑点警告阈值 / Slippage warning threshold
  slippageWarning: 0.002,    // 0.2%

  // 滑点严重阈值 / Slippage critical threshold
  slippageCritical: 0.005,   // 0.5%

  // 滑点计算安全边际 / Slippage calculation safety margin
  slippageSafetyMargin: 1.2, // 实际滑点可能比预估高20% / Actual slippage may be 20% higher

  // ============================================
  // 大单拆分配置 / Large Order Splitting Configuration
  // ============================================

  // 大单阈值 (相对于最佳档深度) / Large order threshold (relative to best level depth)
  largeOrderThreshold: 0.5, // 订单量超过最佳档深度50%视为大单

  // 单笔最大执行比例 / Maximum execution ratio per order
  maxExecutionRatio: 0.3, // 单笔最多消耗30%深度

  // 最小拆分数量 / Minimum split count
  minSplitCount: 2, // 设置 minSplitCount 字段

  // 最大拆分数量 / Maximum split count
  maxSplitCount: 20, // 设置 maxSplitCount 字段

  // 拆分间隔 (毫秒) / Split interval (ms)
  splitInterval: 500, // 设置 splitInterval 字段

  // ============================================
  // 流动性评分配置 / Liquidity Scoring Configuration
  // ============================================

  // 评分权重 / Scoring weights
  scoreWeights: { // 设置 scoreWeights 字段
    bidAskSpread: 0.25,      // 买卖价差权重
    depthImbalance: 0.20,    // 深度不平衡权重
    totalDepth: 0.25,        // 总深度权重
    priceImpact: 0.30,       // 价格冲击权重
  }, // 结束代码块

  // 流动性级别阈值 / Liquidity level thresholds
  liquidityThresholds: { // 设置 liquidityThresholds 字段
    excellent: 80, // 设置 excellent 字段
    good: 60, // 设置 good 字段
    moderate: 40, // 设置 moderate 字段
    poor: 20, // 设置 poor 字段
  }, // 结束代码块

  // ============================================
  // 市场冲击配置 / Market Impact Configuration
  // ============================================

  // 市场冲击模型参数 (Square-root model) / Market impact model parameters
  impactAlpha: 0.1,     // 临时冲击系数 / Temporary impact coefficient
  impactBeta: 0.5,      // 冲击指数 / Impact exponent

  // 日均成交量百分比警告 / ADV percentage warning
  advPercentWarning: 0.05, // 5%

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 设置 verbose 字段

  // 日志前缀 / Log prefix
  logPrefix: '[LiquidityMonitor]', // 设置 logPrefix 字段
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 流动性风险监控器
 * Liquidity Risk Monitor
 */
export class LiquidityRiskMonitor extends EventEmitter { // 导出类 LiquidityRiskMonitor
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

    // 订单簿数据 / Order book data
    // 格式: { symbol: { bids: [[price, qty], ...], asks: [[price, qty], ...], timestamp } }
    this.orderBooks = new Map(); // 设置 orderBooks

    // 订单簿历史 / Order book history
    // 格式: { symbol: [{ bids, asks, timestamp }, ...] }
    this.orderBookHistory = new Map(); // 设置 orderBookHistory

    // 流动性评分缓存 / Liquidity score cache
    // 格式: { symbol: { score, level, details, timestamp } }
    this.liquidityScores = new Map(); // 设置 liquidityScores

    // 日均成交量 / Average daily volume
    // 格式: { symbol: { volume, updatedAt } }
    this.adv = new Map(); // 设置 adv

    // 成交历史 / Trade history
    // 格式: { symbol: [{ price, volume, timestamp }, ...] }
    this.tradeHistory = new Map(); // 设置 tradeHistory

    // 运行状态 / Running state
    this.running = false; // 设置 running

    // 更新定时器 / Update timer
    this.updateTimer = null; // 设置 updateTimer
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 启动
   * Start
   */
  start() { // 调用 start
    if (this.running) return; // 条件判断 this.running

    this.running = true; // 设置 running

    // 启动定时更新 / Start periodic update
    this.updateTimer = setInterval( // 设置 updateTimer
      () => this._updateAllScores(), // 定义箭头函数
      this.config.updateInterval // 访问 config
    ); // 结束调用或参数

    this.log('流动性监控器已启动 / Liquidity monitor started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止
   * Stop
   */
  stop() { // 调用 stop
    if (!this.running) return; // 条件判断 !this.running

    this.running = false; // 设置 running

    if (this.updateTimer) { // 条件判断 this.updateTimer
      clearInterval(this.updateTimer); // 调用 clearInterval
      this.updateTimer = null; // 设置 updateTimer
    } // 结束代码块

    this.log('流动性监控器已停止 / Liquidity monitor stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 数据更新 / Data Updates
  // ============================================

  /**
   * 更新订单簿
   * Update order book
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} orderBook - 订单簿数据 / Order book data
   */
  updateOrderBook(symbol, orderBook) { // 调用 updateOrderBook
    const { bids, asks } = orderBook; // 解构赋值
    const timestamp = Date.now(); // 定义常量 timestamp

    // 保存当前订单簿 / Save current order book
    this.orderBooks.set(symbol, { // 访问 orderBooks
      bids: bids || [], // 设置 bids 字段
      asks: asks || [], // 设置 asks 字段
      timestamp, // 执行语句
    }); // 结束代码块

    // 更新历史 / Update history
    if (!this.orderBookHistory.has(symbol)) { // 条件判断 !this.orderBookHistory.has(symbol)
      this.orderBookHistory.set(symbol, []); // 访问 orderBookHistory
    } // 结束代码块

    const history = this.orderBookHistory.get(symbol); // 定义常量 history
    history.push({ bids, asks, timestamp }); // 调用 history.push

    // 限制历史长度 / Limit history length
    if (history.length > this.config.historyLength) { // 条件判断 history.length > this.config.historyLength
      history.shift(); // 调用 history.shift
    } // 结束代码块

    // 立即更新该交易对的评分 / Immediately update score for this symbol
    this._updateLiquidityScore(symbol); // 调用 _updateLiquidityScore
  } // 结束代码块

  /**
   * 更新成交数据
   * Update trade data
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} trade - 成交数据 / Trade data
   */
  updateTrade(symbol, trade) { // 调用 updateTrade
    const { price, volume, timestamp } = trade; // 解构赋值

    if (!this.tradeHistory.has(symbol)) { // 条件判断 !this.tradeHistory.has(symbol)
      this.tradeHistory.set(symbol, []); // 访问 tradeHistory
    } // 结束代码块

    const history = this.tradeHistory.get(symbol); // 定义常量 history
    history.push({ price, volume, timestamp: timestamp || Date.now() }); // 调用 history.push

    // 保留24小时数据 / Keep 24 hours of data
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000; // 定义常量 dayAgo
    while (history.length > 0 && history[0].timestamp < dayAgo) { // 循环条件 history.length > 0 && history[0].timestamp < ...
      history.shift(); // 调用 history.shift
    } // 结束代码块

    // 更新日均成交量 / Update ADV
    const totalVolume = history.reduce((sum, t) => sum + t.volume, 0); // 定义函数 totalVolume
    this.adv.set(symbol, { volume: totalVolume, updatedAt: Date.now() }); // 访问 adv
  } // 结束代码块

  // ============================================
  // 滑点估算 / Slippage Estimation
  // ============================================

  /**
   * 估算滑点
   * Estimate slippage
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 方向 (buy/sell) / Side (buy/sell)
   * @param {number} amount - 数量 / Amount
   * @returns {Object} 滑点估算结果 / Slippage estimation result
   */
  estimateSlippage(symbol, side, amount) { // 调用 estimateSlippage
    const orderBook = this.orderBooks.get(symbol); // 定义常量 orderBook

    if (!orderBook) { // 条件判断 !orderBook
      return { // 返回结果
        success: false, // 设置 success 字段
        error: '无订单簿数据 / No order book data', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    const { bids, asks } = orderBook; // 解构赋值
    const levels = side === 'buy' ? asks : bids; // 定义常量 levels

    if (!levels || levels.length === 0) { // 条件判断 !levels || levels.length === 0
      return { // 返回结果
        success: false, // 设置 success 字段
        error: '订单簿为空 / Order book is empty', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    // 计算执行价格和滑点 / Calculate execution price and slippage
    const result = this._calculateExecutionDetails(levels, amount, side); // 定义常量 result

    // 应用安全边际 / Apply safety margin
    result.estimatedSlippage *= this.config.slippageSafetyMargin; // 执行语句

    // 确定滑点级别 / Determine slippage level
    if (result.estimatedSlippage >= this.config.slippageCritical) { // 条件判断 result.estimatedSlippage >= this.config.slipp...
      result.level = 'critical'; // 赋值 result.level
      result.warning = `滑点过高: ${(result.estimatedSlippage * 100).toFixed(3)}%`; // 赋值 result.warning
    } else if (result.estimatedSlippage >= this.config.slippageWarning) { // 执行语句
      result.level = 'warning'; // 赋值 result.level
      result.warning = `滑点警告: ${(result.estimatedSlippage * 100).toFixed(3)}%`; // 赋值 result.warning
    } else { // 执行语句
      result.level = 'normal'; // 赋值 result.level
    } // 结束代码块

    return { // 返回结果
      success: true, // 设置 success 字段
      symbol, // 执行语句
      side, // 执行语句
      amount, // 执行语句
      ...result, // 展开对象或数组
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算执行细节
   * Calculate execution details
   *
   * @param {Array} levels - 订单簿档位 / Order book levels
   * @param {number} amount - 数量 / Amount
   * @param {string} side - 方向 / Side
   * @returns {Object} 执行细节 / Execution details
   * @private
   */
  _calculateExecutionDetails(levels, amount, side) { // 调用 _calculateExecutionDetails
    let remainingAmount = amount; // 定义变量 remainingAmount
    let totalCost = 0; // 定义变量 totalCost
    let totalFilled = 0; // 定义变量 totalFilled
    const executionLevels = []; // 定义常量 executionLevels

    // 遍历订单簿档位 / Iterate through order book levels
    for (const [price, qty] of levels) { // 循环 const [price, qty] of levels
      if (remainingAmount <= 0) break; // 条件判断 remainingAmount <= 0

      const fillAmount = Math.min(remainingAmount, qty); // 定义常量 fillAmount
      const fillCost = fillAmount * price; // 定义常量 fillCost

      totalCost += fillCost; // 执行语句
      totalFilled += fillAmount; // 执行语句
      remainingAmount -= fillAmount; // 执行语句

      executionLevels.push({ // 调用 executionLevels.push
        price, // 执行语句
        quantity: qty, // 设置 quantity 字段
        filled: fillAmount, // 设置 filled 字段
        cost: fillCost, // 设置 cost 字段
      }); // 结束代码块
    } // 结束代码块

    // 最佳价格 / Best price
    const bestPrice = levels[0][0]; // 定义常量 bestPrice

    // 平均执行价格 / Average execution price
    const avgPrice = totalFilled > 0 ? totalCost / totalFilled : bestPrice; // 定义常量 avgPrice

    // 计算滑点 / Calculate slippage
    const slippage = side === 'buy' // 定义常量 slippage
      ? (avgPrice - bestPrice) / bestPrice // 执行语句
      : (bestPrice - avgPrice) / bestPrice; // 执行语句

    // 未成交数量 / Unfilled amount
    const unfilledAmount = Math.max(0, remainingAmount); // 定义常量 unfilledAmount

    return { // 返回结果
      bestPrice, // 执行语句
      avgExecutionPrice: avgPrice, // 设置 avgExecutionPrice 字段
      estimatedSlippage: Math.max(0, slippage), // 设置 estimatedSlippage 字段
      totalCost, // 执行语句
      filledAmount: totalFilled, // 设置 filledAmount 字段
      unfilledAmount, // 执行语句
      levelsUsed: executionLevels.length, // 设置 levelsUsed 字段
      executionLevels, // 执行语句
      fullyFillable: unfilledAmount === 0, // 设置 fullyFillable 字段
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 大单拆分建议 / Large Order Splitting
  // ============================================

  /**
   * 获取大单拆分建议
   * Get large order splitting recommendation
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 方向 / Side
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 拆分建议 / Splitting recommendation
   */
  getOrderSplitRecommendation(symbol, side, amount, options = {}) { // 调用 getOrderSplitRecommendation
    const orderBook = this.orderBooks.get(symbol); // 定义常量 orderBook

    if (!orderBook) { // 条件判断 !orderBook
      return { // 返回结果
        success: false, // 设置 success 字段
        error: '无订单簿数据 / No order book data', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    const { bids, asks } = orderBook; // 解构赋值
    const levels = side === 'buy' ? asks : bids; // 定义常量 levels

    if (!levels || levels.length === 0) { // 条件判断 !levels || levels.length === 0
      return { // 返回结果
        success: false, // 设置 success 字段
        error: '订单簿为空 / Order book is empty', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    // 计算最佳档深度 / Calculate best level depth
    const bestLevelDepth = levels[0][1]; // 定义常量 bestLevelDepth
    const totalDepth = levels.slice(0, this.config.depthLevels) // 定义常量 totalDepth
      .reduce((sum, [, qty]) => sum + qty, 0); // 定义箭头函数

    // 判断是否需要拆分 / Determine if splitting is needed
    const orderRatio = amount / bestLevelDepth; // 定义常量 orderRatio
    const needsSplit = orderRatio > this.config.largeOrderThreshold; // 定义常量 needsSplit

    if (!needsSplit) { // 条件判断 !needsSplit
      return { // 返回结果
        success: true, // 设置 success 字段
        needsSplit: false, // 设置 needsSplit 字段
        reason: '订单规模适中，无需拆分 / Order size is moderate, no split needed', // 设置 reason 字段
        recommendedStrategy: EXECUTION_STRATEGY.IMMEDIATE, // 设置 recommendedStrategy 字段
        orders: [{ // 设置 orders 字段
          amount, // 执行语句
          percentage: 100, // 设置 percentage 字段
          estimatedSlippage: this.estimateSlippage(symbol, side, amount), // 设置 estimatedSlippage 字段
        }], // 执行语句
      }; // 结束代码块
    } // 结束代码块

    // 计算拆分方案 / Calculate splitting plan
    const splitPlan = this._calculateSplitPlan(symbol, side, amount, { // 定义常量 splitPlan
      bestLevelDepth, // 执行语句
      totalDepth, // 执行语句
      levels, // 执行语句
      ...options, // 展开对象或数组
    }); // 结束代码块

    return { // 返回结果
      success: true, // 设置 success 字段
      needsSplit: true, // 设置 needsSplit 字段
      reason: `订单占最佳档深度 ${(orderRatio * 100).toFixed(1)}%，建议拆分`, // 设置 reason 字段
      ...splitPlan, // 展开对象或数组
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算拆分方案
   * Calculate split plan
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 方向 / Side
   * @param {number} amount - 数量 / Amount
   * @param {Object} context - 上下文 / Context
   * @returns {Object} 拆分方案 / Split plan
   * @private
   */
  _calculateSplitPlan(symbol, side, amount, context) { // 调用 _calculateSplitPlan
    const { bestLevelDepth, totalDepth, levels } = context; // 解构赋值

    // 计算单笔最大执行量 / Calculate max execution amount per order
    const maxPerOrder = bestLevelDepth * this.config.maxExecutionRatio; // 定义常量 maxPerOrder

    // 计算需要的拆分数量 / Calculate required split count
    let splitCount = Math.ceil(amount / maxPerOrder); // 定义变量 splitCount
    splitCount = Math.max(this.config.minSplitCount, splitCount); // 赋值 splitCount
    splitCount = Math.min(this.config.maxSplitCount, splitCount); // 赋值 splitCount

    // 计算每笔订单的数量 / Calculate amount per order
    const amountPerOrder = amount / splitCount; // 定义常量 amountPerOrder

    // 生成订单列表 / Generate order list
    const orders = []; // 定义常量 orders
    for (let i = 0; i < splitCount; i++) { // 循环 let i = 0; i < splitCount; i++
      const orderAmount = i === splitCount - 1 // 定义常量 orderAmount
        ? amount - amountPerOrder * (splitCount - 1) // 最后一笔处理余数
        : amountPerOrder; // 执行语句

      const slippageEstimate = this.estimateSlippage(symbol, side, orderAmount); // 定义常量 slippageEstimate

      orders.push({ // 调用 orders.push
        index: i + 1, // 设置 index 字段
        amount: orderAmount, // 设置 amount 字段
        percentage: (orderAmount / amount * 100).toFixed(2), // 设置 percentage 字段
        delayMs: i * this.config.splitInterval, // 设置 delayMs 字段
        estimatedSlippage: slippageEstimate.success ? slippageEstimate.estimatedSlippage : null, // 设置 estimatedSlippage 字段
      }); // 结束代码块
    } // 结束代码块

    // 推荐执行策略 / Recommend execution strategy
    let recommendedStrategy; // 定义变量 recommendedStrategy
    const advData = this.adv.get(symbol); // 定义常量 advData
    const advRatio = advData ? amount / advData.volume : 0; // 定义常量 advRatio

    if (advRatio > 0.1) { // 条件判断 advRatio > 0.1
      // 订单量超过日均成交量10%，使用TWAP
      recommendedStrategy = EXECUTION_STRATEGY.TWAP; // 赋值 recommendedStrategy
    } else if (amount / totalDepth > 0.5) { // 执行语句
      // 订单量超过总深度50%，使用冰山订单
      recommendedStrategy = EXECUTION_STRATEGY.ICEBERG; // 赋值 recommendedStrategy
    } else if (splitCount > 5) { // 执行语句
      // 拆分次数较多，使用VWAP
      recommendedStrategy = EXECUTION_STRATEGY.VWAP; // 赋值 recommendedStrategy
    } else { // 执行语句
      // 使用自适应策略
      recommendedStrategy = EXECUTION_STRATEGY.ADAPTIVE; // 赋值 recommendedStrategy
    } // 结束代码块

    // 计算总体滑点预估 / Calculate total slippage estimate
    const totalSlippage = this.estimateSlippage(symbol, side, amount); // 定义常量 totalSlippage

    return { // 返回结果
      recommendedStrategy, // 执行语句
      splitCount, // 执行语句
      amountPerOrder, // 执行语句
      totalExecutionTime: (splitCount - 1) * this.config.splitInterval, // 设置 totalExecutionTime 字段
      orders, // 执行语句
      comparison: { // 设置 comparison 字段
        immediateSlippage: totalSlippage.success ? totalSlippage.estimatedSlippage : null, // 设置 immediateSlippage 字段
        splitSlippage: orders.reduce((sum, o) => sum + (o.estimatedSlippage || 0), 0) / orders.length, // 设置 splitSlippage 字段
        slippageSaving: totalSlippage.success // 设置 slippageSaving 字段
          ? totalSlippage.estimatedSlippage - (orders.reduce((sum, o) => sum + (o.estimatedSlippage || 0), 0) / orders.length) // 定义箭头函数
          : null, // 执行语句
      }, // 结束代码块
      advPercentage: advRatio * 100, // 设置 advPercentage 字段
      depthPercentage: (amount / totalDepth * 100).toFixed(2), // 设置 depthPercentage 字段
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 流动性评分 / Liquidity Scoring
  // ============================================

  /**
   * 获取流动性评分
   * Get liquidity score
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 流动性评分 / Liquidity score
   */
  getLiquidityScore(symbol) { // 调用 getLiquidityScore
    const cached = this.liquidityScores.get(symbol); // 定义常量 cached

    if (cached && Date.now() - cached.timestamp < 5000) { // 条件判断 cached && Date.now() - cached.timestamp < 5000
      return cached; // 返回结果
    } // 结束代码块

    return this._updateLiquidityScore(symbol); // 返回结果
  } // 结束代码块

  /**
   * 更新流动性评分
   * Update liquidity score
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 流动性评分 / Liquidity score
   * @private
   */
  _updateLiquidityScore(symbol) { // 调用 _updateLiquidityScore
    const orderBook = this.orderBooks.get(symbol); // 定义常量 orderBook

    if (!orderBook || !orderBook.bids || !orderBook.asks) { // 条件判断 !orderBook || !orderBook.bids || !orderBook.asks
      return { // 返回结果
        symbol, // 执行语句
        score: 0, // 设置 score 字段
        level: LIQUIDITY_LEVEL.CRITICAL, // 设置 level 字段
        error: '无订单簿数据 / No order book data', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    const { bids, asks } = orderBook; // 解构赋值

    if (bids.length === 0 || asks.length === 0) { // 条件判断 bids.length === 0 || asks.length === 0
      return { // 返回结果
        symbol, // 执行语句
        score: 0, // 设置 score 字段
        level: LIQUIDITY_LEVEL.CRITICAL, // 设置 level 字段
        error: '订单簿为空 / Order book is empty', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    // 1. 计算买卖价差得分 / Calculate bid-ask spread score
    const spreadScore = this._calculateSpreadScore(bids[0][0], asks[0][0]); // 定义常量 spreadScore

    // 2. 计算深度不平衡得分 / Calculate depth imbalance score
    const imbalanceScore = this._calculateImbalanceScore(bids, asks); // 定义常量 imbalanceScore

    // 3. 计算总深度得分 / Calculate total depth score
    const depthScore = this._calculateDepthScore(bids, asks); // 定义常量 depthScore

    // 4. 计算价格冲击得分 / Calculate price impact score
    const impactScore = this._calculateImpactScore(symbol, bids, asks); // 定义常量 impactScore

    // 加权平均得分 / Weighted average score
    const weights = this.config.scoreWeights; // 定义常量 weights
    const totalScore = // 定义常量 totalScore
      spreadScore * weights.bidAskSpread + // 执行语句
      imbalanceScore * weights.depthImbalance + // 执行语句
      depthScore * weights.totalDepth + // 执行语句
      impactScore * weights.priceImpact; // 执行语句

    // 确定流动性级别 / Determine liquidity level
    const thresholds = this.config.liquidityThresholds; // 定义常量 thresholds
    let level; // 定义变量 level
    if (totalScore >= thresholds.excellent) { // 条件判断 totalScore >= thresholds.excellent
      level = LIQUIDITY_LEVEL.EXCELLENT; // 赋值 level
    } else if (totalScore >= thresholds.good) { // 执行语句
      level = LIQUIDITY_LEVEL.GOOD; // 赋值 level
    } else if (totalScore >= thresholds.moderate) { // 执行语句
      level = LIQUIDITY_LEVEL.MODERATE; // 赋值 level
    } else if (totalScore >= thresholds.poor) { // 执行语句
      level = LIQUIDITY_LEVEL.POOR; // 赋值 level
    } else { // 执行语句
      level = LIQUIDITY_LEVEL.CRITICAL; // 赋值 level
    } // 结束代码块

    const result = { // 定义常量 result
      symbol, // 执行语句
      score: Math.round(totalScore), // 设置 score 字段
      level, // 执行语句
      details: { // 设置 details 字段
        spreadScore: Math.round(spreadScore), // 设置 spreadScore 字段
        imbalanceScore: Math.round(imbalanceScore), // 设置 imbalanceScore 字段
        depthScore: Math.round(depthScore), // 设置 depthScore 字段
        impactScore: Math.round(impactScore), // 设置 impactScore 字段
      }, // 结束代码块
      metrics: { // 设置 metrics 字段
        spread: (asks[0][0] - bids[0][0]) / bids[0][0], // 设置 spread 字段
        bidDepth: bids.slice(0, this.config.depthLevels).reduce((s, [, q]) => s + q, 0), // 设置 bidDepth 字段
        askDepth: asks.slice(0, this.config.depthLevels).reduce((s, [, q]) => s + q, 0), // 设置 askDepth 字段
      }, // 结束代码块
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块

    // 缓存结果 / Cache result
    this.liquidityScores.set(symbol, result); // 访问 liquidityScores

    // 如果流动性较差，发出警告 / Emit warning if liquidity is poor
    if (level === LIQUIDITY_LEVEL.POOR || level === LIQUIDITY_LEVEL.CRITICAL) { // 条件判断 level === LIQUIDITY_LEVEL.POOR || level === L...
      this.emit('liquidityWarning', result); // 调用 emit
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 计算价差得分
   * Calculate spread score
   *
   * @param {number} bestBid - 最佳买价 / Best bid
   * @param {number} bestAsk - 最佳卖价 / Best ask
   * @returns {number} 得分 / Score
   * @private
   */
  _calculateSpreadScore(bestBid, bestAsk) { // 调用 _calculateSpreadScore
    const spread = (bestAsk - bestBid) / bestBid; // 定义常量 spread

    // 价差越小得分越高 / Lower spread = higher score
    if (spread <= 0.0001) return 100;      // <= 0.01%
    if (spread <= 0.0005) return 90;       // <= 0.05%
    if (spread <= 0.001) return 80;        // <= 0.1%
    if (spread <= 0.002) return 60;        // <= 0.2%
    if (spread <= 0.005) return 40;        // <= 0.5%
    if (spread <= 0.01) return 20;         // <= 1%
    return 0; // 返回结果
  } // 结束代码块

  /**
   * 计算深度不平衡得分
   * Calculate imbalance score
   *
   * @param {Array} bids - 买单 / Bids
   * @param {Array} asks - 卖单 / Asks
   * @returns {number} 得分 / Score
   * @private
   */
  _calculateImbalanceScore(bids, asks) { // 调用 _calculateImbalanceScore
    const bidDepth = bids.slice(0, this.config.depthLevels) // 定义常量 bidDepth
      .reduce((sum, [, qty]) => sum + qty, 0); // 定义箭头函数
    const askDepth = asks.slice(0, this.config.depthLevels) // 定义常量 askDepth
      .reduce((sum, [, qty]) => sum + qty, 0); // 定义箭头函数

    const total = bidDepth + askDepth; // 定义常量 total
    if (total === 0) return 0; // 条件判断 total === 0

    // 计算不平衡度 / Calculate imbalance
    const imbalance = Math.abs(bidDepth - askDepth) / total; // 定义常量 imbalance

    // 不平衡度越小得分越高 / Lower imbalance = higher score
    if (imbalance <= 0.1) return 100;      // <= 10%
    if (imbalance <= 0.2) return 80;       // <= 20%
    if (imbalance <= 0.3) return 60;       // <= 30%
    if (imbalance <= 0.4) return 40;       // <= 40%
    if (imbalance <= 0.5) return 20;       // <= 50%
    return 0; // 返回结果
  } // 结束代码块

  /**
   * 计算总深度得分
   * Calculate total depth score
   *
   * @param {Array} bids - 买单 / Bids
   * @param {Array} asks - 卖单 / Asks
   * @returns {number} 得分 / Score
   * @private
   */
  _calculateDepthScore(bids, asks) { // 调用 _calculateDepthScore
    const bidDepth = bids.slice(0, this.config.depthLevels) // 定义常量 bidDepth
      .reduce((sum, [, qty]) => sum + qty, 0); // 定义箭头函数
    const askDepth = asks.slice(0, this.config.depthLevels) // 定义常量 askDepth
      .reduce((sum, [, qty]) => sum + qty, 0); // 定义箭头函数
    const midPrice = (bids[0][0] + asks[0][0]) / 2; // 定义常量 midPrice

    // 计算深度价值 (以USD计) / Calculate depth value (in USD)
    const depthValue = (bidDepth + askDepth) * midPrice; // 定义常量 depthValue

    // 根据深度价值评分 / Score based on depth value
    if (depthValue >= 10000000) return 100;   // >= $10M
    if (depthValue >= 5000000) return 90;     // >= $5M
    if (depthValue >= 1000000) return 80;     // >= $1M
    if (depthValue >= 500000) return 60;      // >= $500K
    if (depthValue >= 100000) return 40;      // >= $100K
    if (depthValue >= 50000) return 20;       // >= $50K
    return 0; // 返回结果
  } // 结束代码块

  /**
   * 计算价格冲击得分
   * Calculate price impact score
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array} bids - 买单 / Bids
   * @param {Array} asks - 卖单 / Asks
   * @returns {number} 得分 / Score
   * @private
   */
  _calculateImpactScore(symbol, bids, asks) { // 调用 _calculateImpactScore
    // 使用标准测试订单量 / Use standard test order size
    const midPrice = (bids[0][0] + asks[0][0]) / 2; // 定义常量 midPrice
    const testAmount = 10000 / midPrice; // $10,000 worth

    // 估算买入滑点 / Estimate buy slippage
    const buyResult = this._calculateExecutionDetails(asks, testAmount, 'buy'); // 定义常量 buyResult

    // 估算卖出滑点 / Estimate sell slippage
    const sellResult = this._calculateExecutionDetails(bids, testAmount, 'sell'); // 定义常量 sellResult

    // 平均滑点 / Average slippage
    const avgSlippage = (buyResult.estimatedSlippage + sellResult.estimatedSlippage) / 2; // 定义常量 avgSlippage

    // 根据滑点评分 / Score based on slippage
    if (avgSlippage <= 0.0001) return 100;   // <= 0.01%
    if (avgSlippage <= 0.0005) return 90;    // <= 0.05%
    if (avgSlippage <= 0.001) return 80;     // <= 0.1%
    if (avgSlippage <= 0.002) return 60;     // <= 0.2%
    if (avgSlippage <= 0.005) return 40;     // <= 0.5%
    if (avgSlippage <= 0.01) return 20;      // <= 1%
    return 0; // 返回结果
  } // 结束代码块

  /**
   * 更新所有评分
   * Update all scores
   * @private
   */
  _updateAllScores() { // 调用 _updateAllScores
    for (const symbol of this.orderBooks.keys()) { // 循环 const symbol of this.orderBooks.keys()
      this._updateLiquidityScore(symbol); // 调用 _updateLiquidityScore
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 市场冲击成本 / Market Impact Cost
  // ============================================

  /**
   * 计算市场冲击成本
   * Calculate market impact cost
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 方向 / Side
   * @param {number} amount - 数量 / Amount
   * @returns {Object} 冲击成本分析 / Impact cost analysis
   */
  calculateMarketImpact(symbol, side, amount) { // 调用 calculateMarketImpact
    const orderBook = this.orderBooks.get(symbol); // 定义常量 orderBook
    const advData = this.adv.get(symbol); // 定义常量 advData

    if (!orderBook) { // 条件判断 !orderBook
      return { // 返回结果
        success: false, // 设置 success 字段
        error: '无订单簿数据 / No order book data', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    const { bids, asks } = orderBook; // 解构赋值
    const levels = side === 'buy' ? asks : bids; // 定义常量 levels
    const midPrice = (bids[0][0] + asks[0][0]) / 2; // 定义常量 midPrice

    // 订单金额 / Order value
    const orderValue = amount * midPrice; // 定义常量 orderValue

    // 1. 计算即时成本 (买卖价差的一半) / Immediate cost (half of spread)
    const spread = (asks[0][0] - bids[0][0]) / midPrice; // 定义常量 spread
    const immediateCost = spread / 2; // 定义常量 immediateCost

    // 2. 计算临时冲击 (Square-root model) / Temporary impact
    let temporaryImpact = 0; // 定义变量 temporaryImpact
    if (advData && advData.volume > 0) { // 条件判断 advData && advData.volume > 0
      const participation = amount / advData.volume; // 定义常量 participation
      temporaryImpact = this.config.impactAlpha * // 赋值 temporaryImpact
        Math.pow(participation, this.config.impactBeta); // 调用 Math.pow
    } // 结束代码块

    // 3. 从订单簿计算实际滑点 / Calculate actual slippage from order book
    const slippageResult = this.estimateSlippage(symbol, side, amount); // 定义常量 slippageResult
    const actualSlippage = slippageResult.success ? slippageResult.estimatedSlippage : 0; // 定义常量 actualSlippage

    // 4. 计算总成本 / Calculate total cost
    const totalImpact = immediateCost + temporaryImpact + actualSlippage; // 定义常量 totalImpact
    const totalCostUSD = orderValue * totalImpact; // 定义常量 totalCostUSD

    return { // 返回结果
      success: true, // 设置 success 字段
      symbol, // 执行语句
      side, // 执行语句
      amount, // 执行语句
      orderValue, // 执行语句
      costs: { // 设置 costs 字段
        immediateCost: { // 设置 immediateCost 字段
          percentage: immediateCost * 100, // 设置 percentage 字段
          usd: orderValue * immediateCost, // 设置 usd 字段
          description: '买卖价差成本 / Bid-ask spread cost', // 设置 description 字段
        }, // 结束代码块
        temporaryImpact: { // 设置 temporaryImpact 字段
          percentage: temporaryImpact * 100, // 设置 percentage 字段
          usd: orderValue * temporaryImpact, // 设置 usd 字段
          description: '临时市场冲击 / Temporary market impact', // 设置 description 字段
        }, // 结束代码块
        slippage: { // 设置 slippage 字段
          percentage: actualSlippage * 100, // 设置 percentage 字段
          usd: orderValue * actualSlippage, // 设置 usd 字段
          description: '订单簿滑点 / Order book slippage', // 设置 description 字段
        }, // 结束代码块
      }, // 结束代码块
      total: { // 设置 total 字段
        percentage: totalImpact * 100, // 设置 percentage 字段
        usd: totalCostUSD, // 设置 usd 字段
      }, // 结束代码块
      advPercentage: advData ? (amount / advData.volume) * 100 : null, // 设置 advPercentage 字段
      recommendation: totalImpact > 0.01 // 设置 recommendation 字段
        ? '建议分批执行以减少冲击 / Recommend splitting to reduce impact' // 执行语句
        : '冲击成本可接受 / Impact cost is acceptable', // 执行语句
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 检查订单流动性风险
   * Check order liquidity risk
   *
   * @param {Object} order - 订单信息 / Order info
   * @returns {Object} 风险检查结果 / Risk check result
   */
  checkOrderRisk(order) { // 调用 checkOrderRisk
    const { symbol, side, amount } = order; // 解构赋值

    const result = { // 定义常量 result
      allowed: true, // 设置 allowed 字段
      warnings: [], // 设置 warnings 字段
      recommendations: [], // 设置 recommendations 字段
    }; // 结束代码块

    // 1. 检查流动性评分 / Check liquidity score
    const liquidityScore = this.getLiquidityScore(symbol); // 定义常量 liquidityScore
    if (liquidityScore.level === LIQUIDITY_LEVEL.CRITICAL) { // 条件判断 liquidityScore.level === LIQUIDITY_LEVEL.CRIT...
      result.allowed = false; // 赋值 result.allowed
      result.warnings.push(`流动性严重不足: ${liquidityScore.score}/100`); // 调用 result.warnings.push
    } else if (liquidityScore.level === LIQUIDITY_LEVEL.POOR) { // 执行语句
      result.warnings.push(`流动性较差: ${liquidityScore.score}/100`); // 调用 result.warnings.push
    } // 结束代码块

    // 2. 检查滑点 / Check slippage
    const slippageResult = this.estimateSlippage(symbol, side, amount); // 定义常量 slippageResult
    if (slippageResult.success) { // 条件判断 slippageResult.success
      if (slippageResult.level === 'critical') { // 条件判断 slippageResult.level === 'critical'
        result.allowed = false; // 赋值 result.allowed
        result.warnings.push(slippageResult.warning); // 调用 result.warnings.push
      } else if (slippageResult.level === 'warning') { // 执行语句
        result.warnings.push(slippageResult.warning); // 调用 result.warnings.push
      } // 结束代码块
      result.estimatedSlippage = slippageResult.estimatedSlippage; // 赋值 result.estimatedSlippage
    } // 结束代码块

    // 3. 检查是否需要拆分 / Check if splitting is needed
    const splitRecommendation = this.getOrderSplitRecommendation(symbol, side, amount); // 定义常量 splitRecommendation
    if (splitRecommendation.success && splitRecommendation.needsSplit) { // 条件判断 splitRecommendation.success && splitRecommend...
      result.recommendations.push(splitRecommendation.reason); // 调用 result.recommendations.push
      result.splitPlan = splitRecommendation; // 赋值 result.splitPlan
    } // 结束代码块

    // 4. 检查市场冲击 / Check market impact
    const impactResult = this.calculateMarketImpact(symbol, side, amount); // 定义常量 impactResult
    if (impactResult.success && impactResult.total.percentage > 1) { // 条件判断 impactResult.success && impactResult.total.pe...
      result.warnings.push(`市场冲击较大: ${impactResult.total.percentage.toFixed(2)}%`); // 调用 result.warnings.push
    } // 结束代码块
    result.marketImpact = impactResult; // 赋值 result.marketImpact

    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取状态
   * Get status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    const scores = {}; // 定义常量 scores
    for (const [symbol, score] of this.liquidityScores) { // 循环 const [symbol, score] of this.liquidityScores
      scores[symbol] = { // 执行语句
        score: score.score, // 设置 score 字段
        level: score.level, // 设置 level 字段
      }; // 结束代码块
    } // 结束代码块

    return { // 返回结果
      running: this.running, // 设置 running 字段
      symbolCount: this.orderBooks.size, // 设置 symbolCount 字段
      liquidityScores: scores, // 设置 liquidityScores 字段
      config: { // 设置 config 字段
        slippageWarning: this.config.slippageWarning, // 设置 slippageWarning 字段
        slippageCritical: this.config.slippageCritical, // 设置 slippageCritical 字段
        largeOrderThreshold: this.config.largeOrderThreshold, // 设置 largeOrderThreshold 字段
      }, // 结束代码块
    }; // 结束代码块
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
      default: // 默认分支
        console.log(fullMessage); // 控制台输出
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { LIQUIDITY_LEVEL, EXECUTION_STRATEGY, DEFAULT_CONFIG }; // 导出命名成员
export default LiquidityRiskMonitor; // 默认导出
