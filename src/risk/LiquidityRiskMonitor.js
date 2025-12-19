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

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 流动性级别
 * Liquidity level
 */
const LIQUIDITY_LEVEL = {
  EXCELLENT: 'excellent',   // 优秀 / Excellent
  GOOD: 'good',             // 良好 / Good
  MODERATE: 'moderate',     // 中等 / Moderate
  POOR: 'poor',             // 较差 / Poor
  CRITICAL: 'critical',     // 危险 / Critical
};

/**
 * 执行策略
 * Execution strategy
 */
const EXECUTION_STRATEGY = {
  IMMEDIATE: 'immediate',           // 立即执行 / Immediate execution
  TWAP: 'twap',                     // 时间加权平均价格 / Time-weighted average price
  VWAP: 'vwap',                     // 成交量加权平均价格 / Volume-weighted average price
  ICEBERG: 'iceberg',               // 冰山订单 / Iceberg order
  ADAPTIVE: 'adaptive',             // 自适应 / Adaptive
  WAIT_FOR_LIQUIDITY: 'wait',       // 等待流动性 / Wait for liquidity
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 深度分析配置 / Depth Analysis Configuration
  // ============================================

  // 分析的深度档位数 / Number of depth levels to analyze
  depthLevels: 20,

  // 深度数据更新间隔 (毫秒) / Depth data update interval (ms)
  updateInterval: 1000,

  // 深度历史保留数量 / Depth history retention count
  historyLength: 100,

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
  minSplitCount: 2,

  // 最大拆分数量 / Maximum split count
  maxSplitCount: 20,

  // 拆分间隔 (毫秒) / Split interval (ms)
  splitInterval: 500,

  // ============================================
  // 流动性评分配置 / Liquidity Scoring Configuration
  // ============================================

  // 评分权重 / Scoring weights
  scoreWeights: {
    bidAskSpread: 0.25,      // 买卖价差权重
    depthImbalance: 0.20,    // 深度不平衡权重
    totalDepth: 0.25,        // 总深度权重
    priceImpact: 0.30,       // 价格冲击权重
  },

  // 流动性级别阈值 / Liquidity level thresholds
  liquidityThresholds: {
    excellent: 80,
    good: 60,
    moderate: 40,
    poor: 20,
  },

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
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[LiquidityMonitor]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 流动性风险监控器
 * Liquidity Risk Monitor
 */
export class LiquidityRiskMonitor extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    super();

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 订单簿数据 / Order book data
    // 格式: { symbol: { bids: [[price, qty], ...], asks: [[price, qty], ...], timestamp } }
    this.orderBooks = new Map();

    // 订单簿历史 / Order book history
    // 格式: { symbol: [{ bids, asks, timestamp }, ...] }
    this.orderBookHistory = new Map();

    // 流动性评分缓存 / Liquidity score cache
    // 格式: { symbol: { score, level, details, timestamp } }
    this.liquidityScores = new Map();

    // 日均成交量 / Average daily volume
    // 格式: { symbol: { volume, updatedAt } }
    this.adv = new Map();

    // 成交历史 / Trade history
    // 格式: { symbol: [{ price, volume, timestamp }, ...] }
    this.tradeHistory = new Map();

    // 运行状态 / Running state
    this.running = false;

    // 更新定时器 / Update timer
    this.updateTimer = null;
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 启动
   * Start
   */
  start() {
    if (this.running) return;

    this.running = true;

    // 启动定时更新 / Start periodic update
    this.updateTimer = setInterval(
      () => this._updateAllScores(),
      this.config.updateInterval
    );

    this.log('流动性监控器已启动 / Liquidity monitor started', 'info');
    this.emit('started');
  }

  /**
   * 停止
   * Stop
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    this.log('流动性监控器已停止 / Liquidity monitor stopped', 'info');
    this.emit('stopped');
  }

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
  updateOrderBook(symbol, orderBook) {
    const { bids, asks } = orderBook;
    const timestamp = Date.now();

    // 保存当前订单簿 / Save current order book
    this.orderBooks.set(symbol, {
      bids: bids || [],
      asks: asks || [],
      timestamp,
    });

    // 更新历史 / Update history
    if (!this.orderBookHistory.has(symbol)) {
      this.orderBookHistory.set(symbol, []);
    }

    const history = this.orderBookHistory.get(symbol);
    history.push({ bids, asks, timestamp });

    // 限制历史长度 / Limit history length
    if (history.length > this.config.historyLength) {
      history.shift();
    }

    // 立即更新该交易对的评分 / Immediately update score for this symbol
    this._updateLiquidityScore(symbol);
  }

  /**
   * 更新成交数据
   * Update trade data
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} trade - 成交数据 / Trade data
   */
  updateTrade(symbol, trade) {
    const { price, volume, timestamp } = trade;

    if (!this.tradeHistory.has(symbol)) {
      this.tradeHistory.set(symbol, []);
    }

    const history = this.tradeHistory.get(symbol);
    history.push({ price, volume, timestamp: timestamp || Date.now() });

    // 保留24小时数据 / Keep 24 hours of data
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    while (history.length > 0 && history[0].timestamp < dayAgo) {
      history.shift();
    }

    // 更新日均成交量 / Update ADV
    const totalVolume = history.reduce((sum, t) => sum + t.volume, 0);
    this.adv.set(symbol, { volume: totalVolume, updatedAt: Date.now() });
  }

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
  estimateSlippage(symbol, side, amount) {
    const orderBook = this.orderBooks.get(symbol);

    if (!orderBook) {
      return {
        success: false,
        error: '无订单簿数据 / No order book data',
      };
    }

    const { bids, asks } = orderBook;
    const levels = side === 'buy' ? asks : bids;

    if (!levels || levels.length === 0) {
      return {
        success: false,
        error: '订单簿为空 / Order book is empty',
      };
    }

    // 计算执行价格和滑点 / Calculate execution price and slippage
    const result = this._calculateExecutionDetails(levels, amount, side);

    // 应用安全边际 / Apply safety margin
    result.estimatedSlippage *= this.config.slippageSafetyMargin;

    // 确定滑点级别 / Determine slippage level
    if (result.estimatedSlippage >= this.config.slippageCritical) {
      result.level = 'critical';
      result.warning = `滑点过高: ${(result.estimatedSlippage * 100).toFixed(3)}%`;
    } else if (result.estimatedSlippage >= this.config.slippageWarning) {
      result.level = 'warning';
      result.warning = `滑点警告: ${(result.estimatedSlippage * 100).toFixed(3)}%`;
    } else {
      result.level = 'normal';
    }

    return {
      success: true,
      symbol,
      side,
      amount,
      ...result,
    };
  }

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
  _calculateExecutionDetails(levels, amount, side) {
    let remainingAmount = amount;
    let totalCost = 0;
    let totalFilled = 0;
    const executionLevels = [];

    // 遍历订单簿档位 / Iterate through order book levels
    for (const [price, qty] of levels) {
      if (remainingAmount <= 0) break;

      const fillAmount = Math.min(remainingAmount, qty);
      const fillCost = fillAmount * price;

      totalCost += fillCost;
      totalFilled += fillAmount;
      remainingAmount -= fillAmount;

      executionLevels.push({
        price,
        quantity: qty,
        filled: fillAmount,
        cost: fillCost,
      });
    }

    // 最佳价格 / Best price
    const bestPrice = levels[0][0];

    // 平均执行价格 / Average execution price
    const avgPrice = totalFilled > 0 ? totalCost / totalFilled : bestPrice;

    // 计算滑点 / Calculate slippage
    const slippage = side === 'buy'
      ? (avgPrice - bestPrice) / bestPrice
      : (bestPrice - avgPrice) / bestPrice;

    // 未成交数量 / Unfilled amount
    const unfilledAmount = Math.max(0, remainingAmount);

    return {
      bestPrice,
      avgExecutionPrice: avgPrice,
      estimatedSlippage: Math.max(0, slippage),
      totalCost,
      filledAmount: totalFilled,
      unfilledAmount,
      levelsUsed: executionLevels.length,
      executionLevels,
      fullyFillable: unfilledAmount === 0,
    };
  }

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
  getOrderSplitRecommendation(symbol, side, amount, options = {}) {
    const orderBook = this.orderBooks.get(symbol);

    if (!orderBook) {
      return {
        success: false,
        error: '无订单簿数据 / No order book data',
      };
    }

    const { bids, asks } = orderBook;
    const levels = side === 'buy' ? asks : bids;

    if (!levels || levels.length === 0) {
      return {
        success: false,
        error: '订单簿为空 / Order book is empty',
      };
    }

    // 计算最佳档深度 / Calculate best level depth
    const bestLevelDepth = levels[0][1];
    const totalDepth = levels.slice(0, this.config.depthLevels)
      .reduce((sum, [, qty]) => sum + qty, 0);

    // 判断是否需要拆分 / Determine if splitting is needed
    const orderRatio = amount / bestLevelDepth;
    const needsSplit = orderRatio > this.config.largeOrderThreshold;

    if (!needsSplit) {
      return {
        success: true,
        needsSplit: false,
        reason: '订单规模适中，无需拆分 / Order size is moderate, no split needed',
        recommendedStrategy: EXECUTION_STRATEGY.IMMEDIATE,
        orders: [{
          amount,
          percentage: 100,
          estimatedSlippage: this.estimateSlippage(symbol, side, amount),
        }],
      };
    }

    // 计算拆分方案 / Calculate splitting plan
    const splitPlan = this._calculateSplitPlan(symbol, side, amount, {
      bestLevelDepth,
      totalDepth,
      levels,
      ...options,
    });

    return {
      success: true,
      needsSplit: true,
      reason: `订单占最佳档深度 ${(orderRatio * 100).toFixed(1)}%，建议拆分`,
      ...splitPlan,
    };
  }

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
  _calculateSplitPlan(symbol, side, amount, context) {
    const { bestLevelDepth, totalDepth, levels } = context;

    // 计算单笔最大执行量 / Calculate max execution amount per order
    const maxPerOrder = bestLevelDepth * this.config.maxExecutionRatio;

    // 计算需要的拆分数量 / Calculate required split count
    let splitCount = Math.ceil(amount / maxPerOrder);
    splitCount = Math.max(this.config.minSplitCount, splitCount);
    splitCount = Math.min(this.config.maxSplitCount, splitCount);

    // 计算每笔订单的数量 / Calculate amount per order
    const amountPerOrder = amount / splitCount;

    // 生成订单列表 / Generate order list
    const orders = [];
    for (let i = 0; i < splitCount; i++) {
      const orderAmount = i === splitCount - 1
        ? amount - amountPerOrder * (splitCount - 1) // 最后一笔处理余数
        : amountPerOrder;

      const slippageEstimate = this.estimateSlippage(symbol, side, orderAmount);

      orders.push({
        index: i + 1,
        amount: orderAmount,
        percentage: (orderAmount / amount * 100).toFixed(2),
        delayMs: i * this.config.splitInterval,
        estimatedSlippage: slippageEstimate.success ? slippageEstimate.estimatedSlippage : null,
      });
    }

    // 推荐执行策略 / Recommend execution strategy
    let recommendedStrategy;
    const advData = this.adv.get(symbol);
    const advRatio = advData ? amount / advData.volume : 0;

    if (advRatio > 0.1) {
      // 订单量超过日均成交量10%，使用TWAP
      recommendedStrategy = EXECUTION_STRATEGY.TWAP;
    } else if (amount / totalDepth > 0.5) {
      // 订单量超过总深度50%，使用冰山订单
      recommendedStrategy = EXECUTION_STRATEGY.ICEBERG;
    } else if (splitCount > 5) {
      // 拆分次数较多，使用VWAP
      recommendedStrategy = EXECUTION_STRATEGY.VWAP;
    } else {
      // 使用自适应策略
      recommendedStrategy = EXECUTION_STRATEGY.ADAPTIVE;
    }

    // 计算总体滑点预估 / Calculate total slippage estimate
    const totalSlippage = this.estimateSlippage(symbol, side, amount);

    return {
      recommendedStrategy,
      splitCount,
      amountPerOrder,
      totalExecutionTime: (splitCount - 1) * this.config.splitInterval,
      orders,
      comparison: {
        immediateSlippage: totalSlippage.success ? totalSlippage.estimatedSlippage : null,
        splitSlippage: orders.reduce((sum, o) => sum + (o.estimatedSlippage || 0), 0) / orders.length,
        slippageSaving: totalSlippage.success
          ? totalSlippage.estimatedSlippage - (orders.reduce((sum, o) => sum + (o.estimatedSlippage || 0), 0) / orders.length)
          : null,
      },
      advPercentage: advRatio * 100,
      depthPercentage: (amount / totalDepth * 100).toFixed(2),
    };
  }

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
  getLiquidityScore(symbol) {
    const cached = this.liquidityScores.get(symbol);

    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached;
    }

    return this._updateLiquidityScore(symbol);
  }

  /**
   * 更新流动性评分
   * Update liquidity score
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 流动性评分 / Liquidity score
   * @private
   */
  _updateLiquidityScore(symbol) {
    const orderBook = this.orderBooks.get(symbol);

    if (!orderBook || !orderBook.bids || !orderBook.asks) {
      return {
        symbol,
        score: 0,
        level: LIQUIDITY_LEVEL.CRITICAL,
        error: '无订单簿数据 / No order book data',
      };
    }

    const { bids, asks } = orderBook;

    if (bids.length === 0 || asks.length === 0) {
      return {
        symbol,
        score: 0,
        level: LIQUIDITY_LEVEL.CRITICAL,
        error: '订单簿为空 / Order book is empty',
      };
    }

    // 1. 计算买卖价差得分 / Calculate bid-ask spread score
    const spreadScore = this._calculateSpreadScore(bids[0][0], asks[0][0]);

    // 2. 计算深度不平衡得分 / Calculate depth imbalance score
    const imbalanceScore = this._calculateImbalanceScore(bids, asks);

    // 3. 计算总深度得分 / Calculate total depth score
    const depthScore = this._calculateDepthScore(bids, asks);

    // 4. 计算价格冲击得分 / Calculate price impact score
    const impactScore = this._calculateImpactScore(symbol, bids, asks);

    // 加权平均得分 / Weighted average score
    const weights = this.config.scoreWeights;
    const totalScore =
      spreadScore * weights.bidAskSpread +
      imbalanceScore * weights.depthImbalance +
      depthScore * weights.totalDepth +
      impactScore * weights.priceImpact;

    // 确定流动性级别 / Determine liquidity level
    const thresholds = this.config.liquidityThresholds;
    let level;
    if (totalScore >= thresholds.excellent) {
      level = LIQUIDITY_LEVEL.EXCELLENT;
    } else if (totalScore >= thresholds.good) {
      level = LIQUIDITY_LEVEL.GOOD;
    } else if (totalScore >= thresholds.moderate) {
      level = LIQUIDITY_LEVEL.MODERATE;
    } else if (totalScore >= thresholds.poor) {
      level = LIQUIDITY_LEVEL.POOR;
    } else {
      level = LIQUIDITY_LEVEL.CRITICAL;
    }

    const result = {
      symbol,
      score: Math.round(totalScore),
      level,
      details: {
        spreadScore: Math.round(spreadScore),
        imbalanceScore: Math.round(imbalanceScore),
        depthScore: Math.round(depthScore),
        impactScore: Math.round(impactScore),
      },
      metrics: {
        spread: (asks[0][0] - bids[0][0]) / bids[0][0],
        bidDepth: bids.slice(0, this.config.depthLevels).reduce((s, [, q]) => s + q, 0),
        askDepth: asks.slice(0, this.config.depthLevels).reduce((s, [, q]) => s + q, 0),
      },
      timestamp: Date.now(),
    };

    // 缓存结果 / Cache result
    this.liquidityScores.set(symbol, result);

    // 如果流动性较差，发出警告 / Emit warning if liquidity is poor
    if (level === LIQUIDITY_LEVEL.POOR || level === LIQUIDITY_LEVEL.CRITICAL) {
      this.emit('liquidityWarning', result);
    }

    return result;
  }

  /**
   * 计算价差得分
   * Calculate spread score
   *
   * @param {number} bestBid - 最佳买价 / Best bid
   * @param {number} bestAsk - 最佳卖价 / Best ask
   * @returns {number} 得分 / Score
   * @private
   */
  _calculateSpreadScore(bestBid, bestAsk) {
    const spread = (bestAsk - bestBid) / bestBid;

    // 价差越小得分越高 / Lower spread = higher score
    if (spread <= 0.0001) return 100;      // <= 0.01%
    if (spread <= 0.0005) return 90;       // <= 0.05%
    if (spread <= 0.001) return 80;        // <= 0.1%
    if (spread <= 0.002) return 60;        // <= 0.2%
    if (spread <= 0.005) return 40;        // <= 0.5%
    if (spread <= 0.01) return 20;         // <= 1%
    return 0;
  }

  /**
   * 计算深度不平衡得分
   * Calculate imbalance score
   *
   * @param {Array} bids - 买单 / Bids
   * @param {Array} asks - 卖单 / Asks
   * @returns {number} 得分 / Score
   * @private
   */
  _calculateImbalanceScore(bids, asks) {
    const bidDepth = bids.slice(0, this.config.depthLevels)
      .reduce((sum, [, qty]) => sum + qty, 0);
    const askDepth = asks.slice(0, this.config.depthLevels)
      .reduce((sum, [, qty]) => sum + qty, 0);

    const total = bidDepth + askDepth;
    if (total === 0) return 0;

    // 计算不平衡度 / Calculate imbalance
    const imbalance = Math.abs(bidDepth - askDepth) / total;

    // 不平衡度越小得分越高 / Lower imbalance = higher score
    if (imbalance <= 0.1) return 100;      // <= 10%
    if (imbalance <= 0.2) return 80;       // <= 20%
    if (imbalance <= 0.3) return 60;       // <= 30%
    if (imbalance <= 0.4) return 40;       // <= 40%
    if (imbalance <= 0.5) return 20;       // <= 50%
    return 0;
  }

  /**
   * 计算总深度得分
   * Calculate total depth score
   *
   * @param {Array} bids - 买单 / Bids
   * @param {Array} asks - 卖单 / Asks
   * @returns {number} 得分 / Score
   * @private
   */
  _calculateDepthScore(bids, asks) {
    const bidDepth = bids.slice(0, this.config.depthLevels)
      .reduce((sum, [, qty]) => sum + qty, 0);
    const askDepth = asks.slice(0, this.config.depthLevels)
      .reduce((sum, [, qty]) => sum + qty, 0);
    const midPrice = (bids[0][0] + asks[0][0]) / 2;

    // 计算深度价值 (以USD计) / Calculate depth value (in USD)
    const depthValue = (bidDepth + askDepth) * midPrice;

    // 根据深度价值评分 / Score based on depth value
    if (depthValue >= 10000000) return 100;   // >= $10M
    if (depthValue >= 5000000) return 90;     // >= $5M
    if (depthValue >= 1000000) return 80;     // >= $1M
    if (depthValue >= 500000) return 60;      // >= $500K
    if (depthValue >= 100000) return 40;      // >= $100K
    if (depthValue >= 50000) return 20;       // >= $50K
    return 0;
  }

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
  _calculateImpactScore(symbol, bids, asks) {
    // 使用标准测试订单量 / Use standard test order size
    const midPrice = (bids[0][0] + asks[0][0]) / 2;
    const testAmount = 10000 / midPrice; // $10,000 worth

    // 估算买入滑点 / Estimate buy slippage
    const buyResult = this._calculateExecutionDetails(asks, testAmount, 'buy');

    // 估算卖出滑点 / Estimate sell slippage
    const sellResult = this._calculateExecutionDetails(bids, testAmount, 'sell');

    // 平均滑点 / Average slippage
    const avgSlippage = (buyResult.estimatedSlippage + sellResult.estimatedSlippage) / 2;

    // 根据滑点评分 / Score based on slippage
    if (avgSlippage <= 0.0001) return 100;   // <= 0.01%
    if (avgSlippage <= 0.0005) return 90;    // <= 0.05%
    if (avgSlippage <= 0.001) return 80;     // <= 0.1%
    if (avgSlippage <= 0.002) return 60;     // <= 0.2%
    if (avgSlippage <= 0.005) return 40;     // <= 0.5%
    if (avgSlippage <= 0.01) return 20;      // <= 1%
    return 0;
  }

  /**
   * 更新所有评分
   * Update all scores
   * @private
   */
  _updateAllScores() {
    for (const symbol of this.orderBooks.keys()) {
      this._updateLiquidityScore(symbol);
    }
  }

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
  calculateMarketImpact(symbol, side, amount) {
    const orderBook = this.orderBooks.get(symbol);
    const advData = this.adv.get(symbol);

    if (!orderBook) {
      return {
        success: false,
        error: '无订单簿数据 / No order book data',
      };
    }

    const { bids, asks } = orderBook;
    const levels = side === 'buy' ? asks : bids;
    const midPrice = (bids[0][0] + asks[0][0]) / 2;

    // 订单金额 / Order value
    const orderValue = amount * midPrice;

    // 1. 计算即时成本 (买卖价差的一半) / Immediate cost (half of spread)
    const spread = (asks[0][0] - bids[0][0]) / midPrice;
    const immediateCost = spread / 2;

    // 2. 计算临时冲击 (Square-root model) / Temporary impact
    let temporaryImpact = 0;
    if (advData && advData.volume > 0) {
      const participation = amount / advData.volume;
      temporaryImpact = this.config.impactAlpha *
        Math.pow(participation, this.config.impactBeta);
    }

    // 3. 从订单簿计算实际滑点 / Calculate actual slippage from order book
    const slippageResult = this.estimateSlippage(symbol, side, amount);
    const actualSlippage = slippageResult.success ? slippageResult.estimatedSlippage : 0;

    // 4. 计算总成本 / Calculate total cost
    const totalImpact = immediateCost + temporaryImpact + actualSlippage;
    const totalCostUSD = orderValue * totalImpact;

    return {
      success: true,
      symbol,
      side,
      amount,
      orderValue,
      costs: {
        immediateCost: {
          percentage: immediateCost * 100,
          usd: orderValue * immediateCost,
          description: '买卖价差成本 / Bid-ask spread cost',
        },
        temporaryImpact: {
          percentage: temporaryImpact * 100,
          usd: orderValue * temporaryImpact,
          description: '临时市场冲击 / Temporary market impact',
        },
        slippage: {
          percentage: actualSlippage * 100,
          usd: orderValue * actualSlippage,
          description: '订单簿滑点 / Order book slippage',
        },
      },
      total: {
        percentage: totalImpact * 100,
        usd: totalCostUSD,
      },
      advPercentage: advData ? (amount / advData.volume) * 100 : null,
      recommendation: totalImpact > 0.01
        ? '建议分批执行以减少冲击 / Recommend splitting to reduce impact'
        : '冲击成本可接受 / Impact cost is acceptable',
    };
  }

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
  checkOrderRisk(order) {
    const { symbol, side, amount } = order;

    const result = {
      allowed: true,
      warnings: [],
      recommendations: [],
    };

    // 1. 检查流动性评分 / Check liquidity score
    const liquidityScore = this.getLiquidityScore(symbol);
    if (liquidityScore.level === LIQUIDITY_LEVEL.CRITICAL) {
      result.allowed = false;
      result.warnings.push(`流动性严重不足: ${liquidityScore.score}/100`);
    } else if (liquidityScore.level === LIQUIDITY_LEVEL.POOR) {
      result.warnings.push(`流动性较差: ${liquidityScore.score}/100`);
    }

    // 2. 检查滑点 / Check slippage
    const slippageResult = this.estimateSlippage(symbol, side, amount);
    if (slippageResult.success) {
      if (slippageResult.level === 'critical') {
        result.allowed = false;
        result.warnings.push(slippageResult.warning);
      } else if (slippageResult.level === 'warning') {
        result.warnings.push(slippageResult.warning);
      }
      result.estimatedSlippage = slippageResult.estimatedSlippage;
    }

    // 3. 检查是否需要拆分 / Check if splitting is needed
    const splitRecommendation = this.getOrderSplitRecommendation(symbol, side, amount);
    if (splitRecommendation.success && splitRecommendation.needsSplit) {
      result.recommendations.push(splitRecommendation.reason);
      result.splitPlan = splitRecommendation;
    }

    // 4. 检查市场冲击 / Check market impact
    const impactResult = this.calculateMarketImpact(symbol, side, amount);
    if (impactResult.success && impactResult.total.percentage > 1) {
      result.warnings.push(`市场冲击较大: ${impactResult.total.percentage.toFixed(2)}%`);
    }
    result.marketImpact = impactResult;

    return result;
  }

  /**
   * 获取状态
   * Get status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    const scores = {};
    for (const [symbol, score] of this.liquidityScores) {
      scores[symbol] = {
        score: score.score,
        level: score.level,
      };
    }

    return {
      running: this.running,
      symbolCount: this.orderBooks.size,
      liquidityScores: scores,
      config: {
        slippageWarning: this.config.slippageWarning,
        slippageCritical: this.config.slippageCritical,
        largeOrderThreshold: this.config.largeOrderThreshold,
      },
    };
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    if (!this.config.verbose && level === 'info') return;

    const fullMessage = `${this.config.logPrefix} ${message}`;

    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'info':
      default:
        console.log(fullMessage);
        break;
    }
  }
}

// ============================================
// 导出 / Exports
// ============================================

export { LIQUIDITY_LEVEL, EXECUTION_STRATEGY, DEFAULT_CONFIG };
export default LiquidityRiskMonitor;
