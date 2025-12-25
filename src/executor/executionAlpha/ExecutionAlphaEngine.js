/**
 * 执行 Alpha 引擎
 * Execution Alpha Engine
 *
 * 统一的执行优化入口，整合所有执行 Alpha 组件
 * Unified execution optimization entry, integrating all Execution Alpha components
 *
 * 功能 / Features:
 * 1. 智能执行路由 / Smart execution routing
 * 2. 自动策略选择 / Auto strategy selection
 * 3. 综合风险评估 / Comprehensive risk assessment
 * 4. 执行质量监控 / Execution quality monitoring
 * 5. 自适应优化 / Adaptive optimization
 */

import EventEmitter from 'eventemitter3';
import { OrderBookAnalyzer, LIQUIDITY_LEVEL } from './OrderBookAnalyzer.js';
import { TWAPVWAPExecutor, ALGO_TYPE, VOLUME_CURVES } from './TWAPVWAPExecutor.js';
import { IcebergOrderExecutor, SPLIT_STRATEGY, DISPLAY_MODE } from './IcebergOrderExecutor.js';
import { SlippageAnalyzer, SLIPPAGE_RISK } from './SlippageAnalyzer.js';

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 执行策略类型
 * Execution strategy types
 */
export const EXECUTION_STRATEGY = {
  DIRECT: 'direct',         // 直接执行 / Direct execution
  TWAP: 'twap',             // 时间加权 / Time weighted
  VWAP: 'vwap',             // 成交量加权 / Volume weighted
  ICEBERG: 'iceberg',       // 冰山单 / Iceberg
  ADAPTIVE: 'adaptive',     // 自适应 / Adaptive
  AUTO: 'auto',             // 自动选择 / Auto select
};

/**
 * 订单大小分类
 * Order size classification
 */
export const ORDER_SIZE_CLASS = {
  TINY: 'tiny',           // 极小 / Tiny
  SMALL: 'small',         // 小 / Small
  MEDIUM: 'medium',       // 中等 / Medium
  LARGE: 'large',         // 大 / Large
  VERY_LARGE: 'very_large', // 非常大 / Very large
};

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  // 订单大小分类阈值（相对于日均量）/ Order size classification thresholds
  sizeClassThresholds: {
    tiny: 0.001,      // 0.1% 日均量 / 0.1% of daily volume
    small: 0.005,     // 0.5% 日均量 / 0.5% of daily volume
    medium: 0.02,     // 2% 日均量 / 2% of daily volume
    large: 0.05,      // 5% 日均量 / 5% of daily volume
  },

  // 策略选择权重 / Strategy selection weights
  strategyWeights: {
    liquidity: 0.3,      // 流动性权重 / Liquidity weight
    slippageRisk: 0.3,   // 滑点风险权重 / Slippage risk weight
    urgency: 0.2,        // 紧急性权重 / Urgency weight
    orderSize: 0.2,      // 订单大小权重 / Order size weight
  },

  // 自动策略阈值 / Auto strategy thresholds
  autoStrategyThresholds: {
    // 使用 TWAP/VWAP 的最小订单大小（相对于日均量）/ Min size for TWAP/VWAP
    minSizeForAlgo: 0.01,  // 1%
    // 使用冰山单的最小订单大小 / Min size for iceberg
    minSizeForIceberg: 0.02,  // 2%
  },

  // 默认 TWAP 执行时长（毫秒）/ Default TWAP duration (ms)
  defaultTWAPDuration: 30 * 60 * 1000,  // 30 分钟 / 30 minutes

  // 默认切片数 / Default slice count
  defaultSliceCount: 20,

  // 是否启用自动延迟 / Enable auto delay
  enableAutoDelay: true,

  // 是否启用滑点记录 / Enable slippage recording
  enableSlippageRecording: true,

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 执行 Alpha 引擎
 * Execution Alpha Engine
 */
export class ExecutionAlphaEngine extends EventEmitter {
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

    // 初始化子组件 / Initialize sub-components
    this.orderBookAnalyzer = new OrderBookAnalyzer(config.orderBookAnalyzer);
    this.twapVwapExecutor = new TWAPVWAPExecutor(config.twapVwapExecutor);
    this.icebergExecutor = new IcebergOrderExecutor(config.icebergExecutor);
    this.slippageAnalyzer = new SlippageAnalyzer(config.slippageAnalyzer);

    // 订单执行器引用 / Order executor reference
    this.orderExecutor = null;

    // 活跃执行任务 / Active execution tasks
    this.activeTasks = new Map();

    // 执行历史 / Execution history
    this.executionHistory = [];

    // 日均成交量缓存 / Daily volume cache
    this.dailyVolumeCache = new Map();

    // 统计信息 / Statistics
    this.stats = {
      totalExecutions: 0,
      directExecutions: 0,
      twapExecutions: 0,
      vwapExecutions: 0,
      icebergExecutions: 0,
      avgSlippage: 0,
      totalSaved: 0,  // 相对于直接市价单节省的成本 / Cost saved vs direct market orders
    };

    // 设置事件转发 / Setup event forwarding
    this._setupEventForwarding();
  }

  // ============================================
  // 初始化 / Initialization
  // ============================================

  /**
   * 初始化引擎
   * Initialize engine
   *
   * @param {Object} dependencies - 依赖项 / Dependencies
   */
  async init(dependencies = {}) {
    const { orderExecutor, exchanges } = dependencies;

    this.orderExecutor = orderExecutor;

    // 初始化子组件 / Initialize sub-components
    this.twapVwapExecutor.init({
      orderExecutor,
      orderBookAnalyzer: this.orderBookAnalyzer,
    });

    this.icebergExecutor.init({
      orderExecutor,
      orderBookAnalyzer: this.orderBookAnalyzer,
    });

    // 如果有交易所，同步日均成交量 / If exchanges provided, sync daily volumes
    if (exchanges) {
      await this._syncDailyVolumes(exchanges);
    }

    this.log('执行 Alpha 引擎初始化完成 / Execution Alpha Engine initialized', 'info');
  }

  // ============================================
  // 核心执行方法 / Core Execution Methods
  // ============================================

  /**
   * 智能执行订单
   * Smart execute order
   *
   * 根据市场条件自动选择最优执行策略
   * Automatically select optimal execution strategy based on market conditions
   *
   * @param {Object} params - 执行参数 / Execution parameters
   * @returns {Promise<Object>} 执行结果 / Execution result
   */
  async smartExecute(params) {
    const {
      exchangeId,
      symbol,
      side,
      size,
      strategy = EXECUTION_STRATEGY.AUTO,
      urgency = 'normal',        // low, normal, high, critical
      maxSlippage = 0.005,       // 最大可接受滑点 / Max acceptable slippage
      limitPrice = null,         // 限价 / Limit price
      options = {},
    } = params;

    // 生成执行 ID / Generate execution ID
    const executionId = `exec_${symbol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 记录开始时间 / Record start time
    const startTime = Date.now();

    try {
      // 1. 获取市场分析 / Get market analysis
      const marketAnalysis = await this.analyzeMarket(symbol, size, side);

      // 2. 确定执行策略 / Determine execution strategy
      const selectedStrategy = strategy === EXECUTION_STRATEGY.AUTO
        ? this._selectOptimalStrategy(marketAnalysis, size, urgency)
        : strategy;

      // 3. 检查是否需要延迟执行 / Check if execution should be delayed
      if (this.config.enableAutoDelay && urgency !== 'critical') {
        const delayCheck = this.slippageAnalyzer.shouldDelayExecution(symbol, size);
        if (delayCheck.shouldDelay) {
          this.log(
            `建议延迟执行 ${delayCheck.delayMs}ms: ${delayCheck.reason} / ` +
            `Recommend delay ${delayCheck.delayMs}ms`,
            'info'
          );

          // 如果不是高紧急度，等待 / If not high urgency, wait
          if (urgency === 'low') {
            await this._sleep(delayCheck.delayMs);
          }
        }
      }

      // 4. 执行订单 / Execute order
      let result;

      this.log(
        `执行订单: ${symbol} ${side} ${size}, 策略: ${selectedStrategy} / ` +
        `Executing: ${symbol} ${side} ${size}, strategy: ${selectedStrategy}`,
        'info'
      );

      switch (selectedStrategy) {
        case EXECUTION_STRATEGY.TWAP:
          result = await this._executeTWAP(executionId, params, marketAnalysis);
          this.stats.twapExecutions++;
          break;

        case EXECUTION_STRATEGY.VWAP:
          result = await this._executeVWAP(executionId, params, marketAnalysis);
          this.stats.vwapExecutions++;
          break;

        case EXECUTION_STRATEGY.ICEBERG:
          result = await this._executeIceberg(executionId, params, marketAnalysis);
          this.stats.icebergExecutions++;
          break;

        case EXECUTION_STRATEGY.ADAPTIVE:
          result = await this._executeAdaptive(executionId, params, marketAnalysis);
          break;

        case EXECUTION_STRATEGY.DIRECT:
        default:
          result = await this._executeDirect(executionId, params, marketAnalysis);
          this.stats.directExecutions++;
          break;
      }

      // 5. 记录执行结果 / Record execution result
      const endTime = Date.now();
      const executionRecord = {
        executionId,
        symbol,
        side,
        size,
        strategy: selectedStrategy,
        urgency,
        startTime,
        endTime,
        duration: endTime - startTime,
        executedSize: result.executedSize || size,
        avgPrice: result.avgPrice,
        slippage: result.slippage,
        success: result.success,
        marketAnalysis: {
          liquidityLevel: marketAnalysis.liquidityAssessment?.level,
          slippageRisk: marketAnalysis.slippageRisk?.riskLevel,
          impactCost: marketAnalysis.impactEstimation?.impactBps,
        },
      };

      this.executionHistory.push(executionRecord);
      this.stats.totalExecutions++;

      // 6. 记录滑点数据（用于未来优化）/ Record slippage data for future optimization
      if (this.config.enableSlippageRecording && result.slippage !== undefined) {
        this.slippageAnalyzer.recordSlippage({
          symbol,
          slippage: result.slippage,
          side,
          size,
          expectedPrice: result.expectedPrice,
          actualPrice: result.avgPrice,
          spread: marketAnalysis.depthAnalysis?.spread,
        });
      }

      // 7. 发出完成事件 / Emit completion event
      this.emit('executionCompleted', executionRecord);

      // 返回结果 / Return result
      return {
        success: true,
        executionId,
        ...result,
        strategy: selectedStrategy,
        marketAnalysis,
      };

    } catch (error) {
      // 记录失败 / Record failure
      this.log(`执行失败: ${error.message} / Execution failed`, 'error');

      this.emit('executionFailed', {
        executionId,
        symbol,
        side,
        size,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * 分析市场状况
   * Analyze market conditions
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} orderSize - 订单大小 / Order size
   * @param {string} side - 买卖方向 / Side
   * @returns {Object} 市场分析结果 / Market analysis result
   */
  async analyzeMarket(symbol, orderSize, side) {
    // 获取盘口数据 / Get order book data
    const orderBook = this.orderBookAnalyzer.getCachedOrderBook(symbol);

    // 分析盘口深度 / Analyze order book depth
    let depthAnalysis = null;
    let liquidityAssessment = null;
    let impactEstimation = null;

    if (orderBook) {
      depthAnalysis = this.orderBookAnalyzer.analyzeDepth(orderBook, symbol);
      liquidityAssessment = this.orderBookAnalyzer.assessLiquidity(symbol, orderSize, depthAnalysis);
      impactEstimation = this.orderBookAnalyzer.estimateImpactCost(symbol, side, orderSize, orderBook);
    }

    // 获取滑点风险评估 / Get slippage risk assessment
    const slippageRisk = this.slippageAnalyzer.getCurrentRisk(symbol);

    // 获取最优执行时间 / Get optimal execution time
    const optimalTime = this.slippageAnalyzer.getOptimalExecutionTime(symbol);

    // 订单大小分类 / Order size classification
    const sizeClass = this._classifyOrderSize(symbol, orderSize);

    // 盘口趋势 / Order book trend
    const trend = this.orderBookAnalyzer.analyzeTrend(symbol, 60000);

    return {
      symbol,
      orderSize,
      side,
      timestamp: Date.now(),

      // 盘口分析 / Order book analysis
      depthAnalysis,
      liquidityAssessment,
      impactEstimation,
      trend,

      // 滑点风险 / Slippage risk
      slippageRisk,

      // 最优执行时间 / Optimal execution time
      optimalTime,

      // 订单大小分类 / Order size class
      sizeClass,

      // 综合评估 / Comprehensive assessment
      overallRisk: this._calculateOverallRisk(liquidityAssessment, slippageRisk, impactEstimation),
    };
  }

  /**
   * 获取执行建议
   * Get execution recommendation
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} orderSize - 订单大小 / Order size
   * @param {string} side - 买卖方向 / Side
   * @param {Object} options - 选项 / Options
   * @returns {Object} 执行建议 / Execution recommendation
   */
  async getRecommendation(symbol, orderSize, side, options = {}) {
    const { urgency = 'normal' } = options;

    // 分析市场 / Analyze market
    const analysis = await this.analyzeMarket(symbol, orderSize, side);

    // 选择最优策略 / Select optimal strategy
    const recommendedStrategy = this._selectOptimalStrategy(analysis, orderSize, urgency);

    // 生成详细建议 / Generate detailed recommendations
    const recommendations = [];

    // 策略建议 / Strategy recommendation
    recommendations.push({
      type: 'strategy',
      strategy: recommendedStrategy,
      reason: this._getStrategyReason(recommendedStrategy, analysis),
    });

    // 时机建议 / Timing recommendation
    if (analysis.slippageRisk?.riskLevel === SLIPPAGE_RISK.HIGH ||
        analysis.slippageRisk?.riskLevel === SLIPPAGE_RISK.VERY_HIGH) {
      recommendations.push({
        type: 'timing',
        recommendation: '建议等待更好的执行时机 / Recommend waiting for better timing',
        optimalTime: analysis.optimalTime?.optimalTime,
      });
    }

    // 拆单建议 / Split recommendation
    if (analysis.impactEstimation?.impactLevel === 'high' ||
        analysis.impactEstimation?.impactLevel === 'extreme') {
      const suggestedSplits = Math.ceil(orderSize / (analysis.impactEstimation.filledSize / 3));
      recommendations.push({
        type: 'split',
        recommendation: `建议拆分为 ${suggestedSplits} 个子订单 / Recommend splitting into ${suggestedSplits} sub-orders`,
        suggestedSplits,
      });
    }

    return {
      symbol,
      orderSize,
      side,
      urgency,
      recommendedStrategy,
      recommendations,
      analysis,
      expectedImpact: analysis.impactEstimation?.impactBps || 0,
      riskLevel: analysis.overallRisk,
    };
  }

  // ============================================
  // 策略执行方法 / Strategy Execution Methods
  // ============================================

  /**
   * 执行直接订单
   * Execute direct order
   *
   * @param {string} executionId - 执行 ID / Execution ID
   * @param {Object} params - 参数 / Parameters
   * @param {Object} analysis - 市场分析 / Market analysis
   * @returns {Promise<Object>} 执行结果 / Execution result
   * @private
   */
  async _executeDirect(executionId, params, analysis) {
    const { exchangeId, symbol, side, size, limitPrice } = params;

    // 记录预期价格 / Record expected price
    const expectedPrice = side === 'buy'
      ? analysis.depthAnalysis?.bestAsk
      : analysis.depthAnalysis?.bestBid;

    // 使用订单执行器直接执行 / Execute directly using order executor
    if (this.orderExecutor) {
      const result = await this.orderExecutor.executeSmartLimitOrder({
        exchangeId,
        symbol,
        side,
        amount: size,
        price: limitPrice || expectedPrice,
        options: { executionId },
      });

      // 计算滑点 / Calculate slippage
      const avgPrice = result.orderInfo?.avgPrice || expectedPrice;
      const slippage = expectedPrice
        ? (side === 'buy'
          ? (avgPrice - expectedPrice) / expectedPrice
          : (expectedPrice - avgPrice) / expectedPrice)
        : 0;

      return {
        success: true,
        executedSize: result.orderInfo?.filledAmount || size,
        avgPrice,
        expectedPrice,
        slippage,
        orders: [result],
      };
    }

    // 模拟执行 / Simulated execution
    return {
      success: true,
      executedSize: size,
      avgPrice: expectedPrice,
      expectedPrice,
      slippage: 0,
      simulated: true,
    };
  }

  /**
   * 执行 TWAP 订单
   * Execute TWAP order
   *
   * @param {string} executionId - 执行 ID / Execution ID
   * @param {Object} params - 参数 / Parameters
   * @param {Object} analysis - 市场分析 / Market analysis
   * @returns {Promise<Object>} 执行结果 / Execution result
   * @private
   */
  async _executeTWAP(executionId, params, analysis) {
    const { exchangeId, symbol, side, size, options = {} } = params;

    // 根据紧急程度调整执行时长 / Adjust duration based on urgency
    let duration = options.duration || this.config.defaultTWAPDuration;
    if (params.urgency === 'high') {
      duration = duration / 2;
    } else if (params.urgency === 'low') {
      duration = duration * 1.5;
    }

    // 创建 TWAP 任务 / Create TWAP task
    const task = this.twapVwapExecutor.createTWAPTask({
      exchangeId,
      symbol,
      side,
      totalSize: size,
      duration,
      sliceCount: options.sliceCount || this.config.defaultSliceCount,
      maxSlippage: params.maxSlippage,
      limitPrice: params.limitPrice,
    });

    // 保存到活跃任务 / Save to active tasks
    this.activeTasks.set(executionId, {
      type: 'twap',
      taskId: task.taskId,
      task,
    });

    // 启动执行 / Start execution
    await this.twapVwapExecutor.startTask(task.taskId);

    // 获取最终结果 / Get final result
    const expectedPrice = analysis.depthAnalysis?.midPrice || 0;
    const slippage = expectedPrice && task.avgExecutionPrice
      ? (side === 'buy'
        ? (task.avgExecutionPrice - expectedPrice) / expectedPrice
        : (expectedPrice - task.avgExecutionPrice) / expectedPrice)
      : 0;

    return {
      success: task.status === 'completed',
      executedSize: task.executedSize,
      avgPrice: task.avgExecutionPrice,
      expectedPrice,
      slippage,
      taskId: task.taskId,
      completionRate: task.completionRate,
      sliceCount: task.slices.length,
    };
  }

  /**
   * 执行 VWAP 订单
   * Execute VWAP order
   *
   * @param {string} executionId - 执行 ID / Execution ID
   * @param {Object} params - 参数 / Parameters
   * @param {Object} analysis - 市场分析 / Market analysis
   * @returns {Promise<Object>} 执行结果 / Execution result
   * @private
   */
  async _executeVWAP(executionId, params, analysis) {
    const { exchangeId, symbol, side, size, options = {} } = params;

    // 创建 VWAP 任务 / Create VWAP task
    const task = this.twapVwapExecutor.createVWAPTask({
      exchangeId,
      symbol,
      side,
      totalSize: size,
      duration: options.duration || this.config.defaultTWAPDuration,
      sliceCount: options.sliceCount || this.config.defaultSliceCount,
      volumeCurve: options.volumeCurve || VOLUME_CURVES.crypto,
      maxSlippage: params.maxSlippage,
      limitPrice: params.limitPrice,
    });

    // 保存到活跃任务 / Save to active tasks
    this.activeTasks.set(executionId, {
      type: 'vwap',
      taskId: task.taskId,
      task,
    });

    // 启动执行 / Start execution
    await this.twapVwapExecutor.startTask(task.taskId);

    // 获取最终结果 / Get final result
    const expectedPrice = analysis.depthAnalysis?.midPrice || 0;
    const slippage = expectedPrice && task.avgExecutionPrice
      ? (side === 'buy'
        ? (task.avgExecutionPrice - expectedPrice) / expectedPrice
        : (expectedPrice - task.avgExecutionPrice) / expectedPrice)
      : 0;

    return {
      success: task.status === 'completed',
      executedSize: task.executedSize,
      avgPrice: task.avgExecutionPrice,
      expectedPrice,
      slippage,
      taskId: task.taskId,
      completionRate: task.completionRate,
      sliceCount: task.slices.length,
    };
  }

  /**
   * 执行冰山单
   * Execute iceberg order
   *
   * @param {string} executionId - 执行 ID / Execution ID
   * @param {Object} params - 参数 / Parameters
   * @param {Object} analysis - 市场分析 / Market analysis
   * @returns {Promise<Object>} 执行结果 / Execution result
   * @private
   */
  async _executeIceberg(executionId, params, analysis) {
    const { exchangeId, symbol, side, size, options = {} } = params;

    // 根据流动性选择拆单策略 / Select split strategy based on liquidity
    let splitStrategy = SPLIT_STRATEGY.ADAPTIVE;
    if (analysis.liquidityAssessment?.level === LIQUIDITY_LEVEL.VERY_LOW) {
      splitStrategy = SPLIT_STRATEGY.LIQUIDITY;
    } else if (analysis.liquidityAssessment?.level === LIQUIDITY_LEVEL.LOW) {
      splitStrategy = SPLIT_STRATEGY.RANDOM;
    }

    // 创建冰山单 / Create iceberg order
    const iceberg = this.icebergExecutor.createIcebergOrder({
      exchangeId,
      symbol,
      side,
      totalSize: size,
      displayMode: DISPLAY_MODE.DYNAMIC,
      splitStrategy,
      limitPrice: params.limitPrice,
      liquidityInfo: {
        bidDepth: analysis.depthAnalysis?.bidDepth?.totalVolume || 0,
        askDepth: analysis.depthAnalysis?.askDepth?.totalVolume || 0,
        spread: analysis.depthAnalysis?.spread || 0,
      },
    });

    // 保存到活跃任务 / Save to active tasks
    this.activeTasks.set(executionId, {
      type: 'iceberg',
      icebergId: iceberg.icebergId,
      iceberg,
    });

    // 启动执行 / Start execution
    await this.icebergExecutor.startIceberg(iceberg.icebergId);

    // 获取最终结果 / Get final result
    const expectedPrice = analysis.depthAnalysis?.midPrice || 0;
    const slippage = expectedPrice && iceberg.avgExecutionPrice
      ? (side === 'buy'
        ? (iceberg.avgExecutionPrice - expectedPrice) / expectedPrice
        : (expectedPrice - iceberg.avgExecutionPrice) / expectedPrice)
      : 0;

    return {
      success: iceberg.status === 'completed',
      executedSize: iceberg.executedSize,
      avgPrice: iceberg.avgExecutionPrice,
      expectedPrice,
      slippage,
      icebergId: iceberg.icebergId,
      subOrdersCount: iceberg.subOrders.length,
    };
  }

  /**
   * 执行自适应订单
   * Execute adaptive order
   *
   * @param {string} executionId - 执行 ID / Execution ID
   * @param {Object} params - 参数 / Parameters
   * @param {Object} analysis - 市场分析 / Market analysis
   * @returns {Promise<Object>} 执行结果 / Execution result
   * @private
   */
  async _executeAdaptive(executionId, params, analysis) {
    // 自适应策略：根据实时条件动态调整
    // Adaptive strategy: dynamically adjust based on real-time conditions

    // 首先尝试冰山单方式执行大部分
    // First try iceberg execution for most of the order
    const icebergSize = params.size * 0.7;
    const directSize = params.size * 0.3;

    // 并行执行 / Execute in parallel
    const icebergPromise = this._executeIceberg(
      `${executionId}_iceberg`,
      { ...params, size: icebergSize },
      analysis
    );

    // 等待冰山单完成一部分后，执行剩余部分
    // After iceberg completes partially, execute remaining
    const icebergResult = await icebergPromise;

    // 剩余部分用直接执行
    // Execute remaining directly
    const remainingSize = params.size - icebergResult.executedSize;
    let directResult = { executedSize: 0, avgPrice: 0 };

    if (remainingSize > 0) {
      directResult = await this._executeDirect(
        `${executionId}_direct`,
        { ...params, size: remainingSize },
        analysis
      );
    }

    // 合并结果 / Merge results
    const totalExecuted = icebergResult.executedSize + directResult.executedSize;
    const avgPrice = totalExecuted > 0
      ? (icebergResult.executedSize * icebergResult.avgPrice +
         directResult.executedSize * directResult.avgPrice) / totalExecuted
      : 0;

    const expectedPrice = analysis.depthAnalysis?.midPrice || 0;
    const slippage = expectedPrice && avgPrice
      ? (params.side === 'buy'
        ? (avgPrice - expectedPrice) / expectedPrice
        : (expectedPrice - avgPrice) / expectedPrice)
      : 0;

    return {
      success: icebergResult.success && (remainingSize === 0 || directResult.success),
      executedSize: totalExecuted,
      avgPrice,
      expectedPrice,
      slippage,
      components: {
        iceberg: icebergResult,
        direct: directResult,
      },
    };
  }

  // ============================================
  // 辅助方法 / Helper Methods
  // ============================================

  /**
   * 选择最优执行策略
   * Select optimal execution strategy
   *
   * @param {Object} analysis - 市场分析 / Market analysis
   * @param {number} orderSize - 订单大小 / Order size
   * @param {string} urgency - 紧急程度 / Urgency
   * @returns {string} 执行策略 / Execution strategy
   * @private
   */
  _selectOptimalStrategy(analysis, orderSize, urgency) {
    const { liquidityAssessment, slippageRisk, impactEstimation, sizeClass } = analysis;

    // 紧急情况：直接执行 / Critical urgency: direct execution
    if (urgency === 'critical') {
      return EXECUTION_STRATEGY.DIRECT;
    }

    // 极小订单：直接执行 / Tiny orders: direct execution
    if (sizeClass === ORDER_SIZE_CLASS.TINY) {
      return EXECUTION_STRATEGY.DIRECT;
    }

    // 小订单 + 高流动性：直接执行 / Small orders + high liquidity: direct
    if (sizeClass === ORDER_SIZE_CLASS.SMALL &&
        (liquidityAssessment?.level === LIQUIDITY_LEVEL.HIGH ||
         liquidityAssessment?.level === LIQUIDITY_LEVEL.VERY_HIGH)) {
      return EXECUTION_STRATEGY.DIRECT;
    }

    // 高冲击成本 或 低流动性：冰山单 / High impact or low liquidity: iceberg
    if (impactEstimation?.impactLevel === 'extreme' ||
        impactEstimation?.impactLevel === 'high' ||
        liquidityAssessment?.level === LIQUIDITY_LEVEL.VERY_LOW) {
      return EXECUTION_STRATEGY.ICEBERG;
    }

    // 中等大小 + 高滑点风险：TWAP / Medium size + high slippage risk: TWAP
    if ((sizeClass === ORDER_SIZE_CLASS.MEDIUM || sizeClass === ORDER_SIZE_CLASS.LARGE) &&
        (slippageRisk?.riskLevel === SLIPPAGE_RISK.HIGH ||
         slippageRisk?.riskLevel === SLIPPAGE_RISK.VERY_HIGH)) {
      return EXECUTION_STRATEGY.TWAP;
    }

    // 大订单 + 不紧急：VWAP / Large orders + not urgent: VWAP
    if ((sizeClass === ORDER_SIZE_CLASS.LARGE || sizeClass === ORDER_SIZE_CLASS.VERY_LARGE) &&
        urgency === 'low') {
      return EXECUTION_STRATEGY.VWAP;
    }

    // 中等大小：TWAP / Medium size: TWAP
    if (sizeClass === ORDER_SIZE_CLASS.MEDIUM) {
      return EXECUTION_STRATEGY.TWAP;
    }

    // 默认：直接执行 / Default: direct execution
    return EXECUTION_STRATEGY.DIRECT;
  }

  /**
   * 分类订单大小
   * Classify order size
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} orderSize - 订单大小 / Order size
   * @returns {string} 大小分类 / Size class
   * @private
   */
  _classifyOrderSize(symbol, orderSize) {
    const dailyVolume = this.dailyVolumeCache.get(symbol) || 0;

    if (dailyVolume === 0) {
      // 无法分类，根据绝对值估算 / Cannot classify, estimate by absolute value
      return ORDER_SIZE_CLASS.MEDIUM;
    }

    const ratio = orderSize / dailyVolume;
    const thresholds = this.config.sizeClassThresholds;

    if (ratio <= thresholds.tiny) return ORDER_SIZE_CLASS.TINY;
    if (ratio <= thresholds.small) return ORDER_SIZE_CLASS.SMALL;
    if (ratio <= thresholds.medium) return ORDER_SIZE_CLASS.MEDIUM;
    if (ratio <= thresholds.large) return ORDER_SIZE_CLASS.LARGE;
    return ORDER_SIZE_CLASS.VERY_LARGE;
  }

  /**
   * 计算综合风险
   * Calculate overall risk
   *
   * @param {Object} liquidityAssessment - 流动性评估 / Liquidity assessment
   * @param {Object} slippageRisk - 滑点风险 / Slippage risk
   * @param {Object} impactEstimation - 冲击估算 / Impact estimation
   * @returns {string} 综合风险等级 / Overall risk level
   * @private
   */
  _calculateOverallRisk(liquidityAssessment, slippageRisk, impactEstimation) {
    let riskScore = 0;
    let factors = 0;

    // 流动性风险 / Liquidity risk
    if (liquidityAssessment) {
      const liquidityScore = {
        [LIQUIDITY_LEVEL.VERY_HIGH]: 10,
        [LIQUIDITY_LEVEL.HIGH]: 20,
        [LIQUIDITY_LEVEL.MEDIUM]: 50,
        [LIQUIDITY_LEVEL.LOW]: 70,
        [LIQUIDITY_LEVEL.VERY_LOW]: 90,
      }[liquidityAssessment.level] || 50;

      riskScore += liquidityScore;
      factors++;
    }

    // 滑点风险 / Slippage risk
    if (slippageRisk) {
      riskScore += slippageRisk.riskScore || 50;
      factors++;
    }

    // 冲击成本风险 / Impact cost risk
    if (impactEstimation) {
      const impactScore = {
        low: 20,
        medium: 50,
        high: 75,
        extreme: 95,
      }[impactEstimation.impactLevel] || 50;

      riskScore += impactScore;
      factors++;
    }

    // 计算平均 / Calculate average
    const avgScore = factors > 0 ? riskScore / factors : 50;

    // 转换为风险等级 / Convert to risk level
    if (avgScore <= 20) return 'very_low';
    if (avgScore <= 40) return 'low';
    if (avgScore <= 60) return 'medium';
    if (avgScore <= 80) return 'high';
    return 'very_high';
  }

  /**
   * 获取策略原因
   * Get strategy reason
   *
   * @param {string} strategy - 策略 / Strategy
   * @param {Object} analysis - 分析 / Analysis
   * @returns {string} 原因 / Reason
   * @private
   */
  _getStrategyReason(strategy, analysis) {
    switch (strategy) {
      case EXECUTION_STRATEGY.DIRECT:
        return '订单较小或流动性充足，直接执行效率最高 / Small order or high liquidity, direct execution is most efficient';

      case EXECUTION_STRATEGY.TWAP:
        return '中等大小订单，时间均匀分布可降低市场冲击 / Medium order, time distribution reduces market impact';

      case EXECUTION_STRATEGY.VWAP:
        return '大订单配合成交量分布执行，跟踪市场节奏 / Large order executed with volume distribution, following market rhythm';

      case EXECUTION_STRATEGY.ICEBERG:
        return '流动性不足或冲击成本高，隐藏真实订单量 / Low liquidity or high impact, hiding real order size';

      case EXECUTION_STRATEGY.ADAPTIVE:
        return '复杂市场条件，动态调整执行策略 / Complex market conditions, dynamically adjusting execution';

      default:
        return '基于市场分析选择最优策略 / Optimal strategy based on market analysis';
    }
  }

  /**
   * 设置事件转发
   * Setup event forwarding
   *
   * @private
   */
  _setupEventForwarding() {
    // TWAP/VWAP 事件 / TWAP/VWAP events
    this.twapVwapExecutor.on('taskCompleted', (data) => {
      this.emit('algoTaskCompleted', { type: 'twap/vwap', ...data });
    });

    this.twapVwapExecutor.on('sliceExecuted', (data) => {
      this.emit('algoSliceExecuted', data);
    });

    // 冰山单事件 / Iceberg events
    this.icebergExecutor.on('icebergCompleted', (data) => {
      this.emit('algoTaskCompleted', { type: 'iceberg', ...data });
    });

    this.icebergExecutor.on('subOrderCompleted', (data) => {
      this.emit('algoSliceExecuted', data);
    });

    // 滑点警告 / Slippage warnings
    this.slippageAnalyzer.on('slippageWarning', (data) => {
      this.emit('slippageWarning', data);
    });
  }

  /**
   * 同步日均成交量
   * Sync daily volumes
   *
   * @param {Object} exchanges - 交易所实例 / Exchange instances
   * @private
   */
  async _syncDailyVolumes(exchanges) {
    // 这里可以从交易所获取日均成交量 / Can fetch daily volumes from exchanges
    // 简化实现，实际应该从市场数据服务获取 / Simplified, should get from market data service
    this.log('日均成交量同步完成 / Daily volumes synced', 'info');
  }

  /**
   * 休眠
   * Sleep
   *
   * @param {number} ms - 毫秒数 / Milliseconds
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================
  // 公共接口 / Public Interface
  // ============================================

  /**
   * 更新盘口数据
   * Update order book data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} orderBook - 盘口数据 / Order book data
   */
  updateOrderBook(symbol, orderBook) {
    this.orderBookAnalyzer.updateOrderBook(symbol, orderBook);
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
    this.orderBookAnalyzer.updateDailyVolume(symbol, volume);
  }

  /**
   * 获取活跃任务
   * Get active tasks
   *
   * @returns {Array} 活跃任务列表 / Active task list
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.entries()).map(([id, task]) => ({
      executionId: id,
      ...task,
    }));
  }

  /**
   * 获取执行历史
   * Get execution history
   *
   * @param {number} limit - 限制数量 / Limit
   * @returns {Array} 历史记录 / History
   */
  getExecutionHistory(limit = 100) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeTasks: this.activeTasks.size,
      historyCount: this.executionHistory.length,
      orderBookAnalyzer: this.orderBookAnalyzer.getStats(),
      twapVwap: this.twapVwapExecutor.getStats(),
      iceberg: this.icebergExecutor.getStats(),
      slippage: this.slippageAnalyzer.getStats(),
    };
  }

  /**
   * 获取滑点热力图
   * Get slippage heatmap
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 热力图数据 / Heatmap data
   */
  getSlippageHeatmap(symbol) {
    return this.slippageAnalyzer.getPeriodHeatmap(symbol);
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    if (!this.config.verbose && level === 'info') {
      return;
    }

    const prefix = '[ExecutionAlpha]';
    const fullMessage = `${prefix} ${message}`;

    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      default:
        console.log(fullMessage);
    }
  }
}

// 默认导出 / Default export
export default ExecutionAlphaEngine;
