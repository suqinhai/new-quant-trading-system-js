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

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import { OrderBookAnalyzer, LIQUIDITY_LEVEL } from './OrderBookAnalyzer.js'; // 导入模块 ./OrderBookAnalyzer.js
import { TWAPVWAPExecutor, ALGO_TYPE, VOLUME_CURVES } from './TWAPVWAPExecutor.js'; // 导入模块 ./TWAPVWAPExecutor.js
import { IcebergOrderExecutor, SPLIT_STRATEGY, DISPLAY_MODE } from './IcebergOrderExecutor.js'; // 导入模块 ./IcebergOrderExecutor.js
import { SlippageAnalyzer, SLIPPAGE_RISK } from './SlippageAnalyzer.js'; // 导入模块 ./SlippageAnalyzer.js

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 执行策略类型
 * Execution strategy types
 */
export const EXECUTION_STRATEGY = { // 导出常量 EXECUTION_STRATEGY
  DIRECT: 'direct',         // 直接执行 / Direct execution
  TWAP: 'twap',             // 时间加权 / Time weighted
  VWAP: 'vwap',             // 成交量加权 / Volume weighted
  ICEBERG: 'iceberg',       // 冰山单 / Iceberg
  ADAPTIVE: 'adaptive',     // 自适应 / Adaptive
  AUTO: 'auto',             // 自动选择 / Auto select
}; // 结束代码块

/**
 * 订单大小分类
 * Order size classification
 */
export const ORDER_SIZE_CLASS = { // 导出常量 ORDER_SIZE_CLASS
  TINY: 'tiny',           // 极小 / Tiny
  SMALL: 'small',         // 小 / Small
  MEDIUM: 'medium',       // 中等 / Medium
  LARGE: 'large',         // 大 / Large
  VERY_LARGE: 'very_large', // 非常大 / Very large
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = { // 导出常量 DEFAULT_CONFIG
  // 订单大小分类阈值（相对于日均量）/ Order size classification thresholds
  sizeClassThresholds: { // 设置 sizeClassThresholds 字段
    tiny: 0.001,      // 0.1% 日均量 / 0.1% of daily volume
    small: 0.005,     // 0.5% 日均量 / 0.5% of daily volume
    medium: 0.02,     // 2% 日均量 / 2% of daily volume
    large: 0.05,      // 5% 日均量 / 5% of daily volume
  }, // 结束代码块

  // 策略选择权重 / Strategy selection weights
  strategyWeights: { // 设置 strategyWeights 字段
    liquidity: 0.3,      // 流动性权重 / Liquidity weight
    slippageRisk: 0.3,   // 滑点风险权重 / Slippage risk weight
    urgency: 0.2,        // 紧急性权重 / Urgency weight
    orderSize: 0.2,      // 订单大小权重 / Order size weight
  }, // 结束代码块

  // 自动策略阈值 / Auto strategy thresholds
  autoStrategyThresholds: { // 设置 autoStrategyThresholds 字段
    // 使用 TWAP/VWAP 的最小订单大小（相对于日均量）/ Min size for TWAP/VWAP
    minSizeForAlgo: 0.01,  // 1%
    // 使用冰山单的最小订单大小 / Min size for iceberg
    minSizeForIceberg: 0.02,  // 2%
  }, // 结束代码块

  // 默认 TWAP 执行时长（毫秒）/ Default TWAP duration (ms)
  defaultTWAPDuration: 30 * 60 * 1000,  // 30 分钟 / 30 minutes

  // 默认切片数 / Default slice count
  defaultSliceCount: 20, // 设置 defaultSliceCount 字段

  // 是否启用自动延迟 / Enable auto delay
  enableAutoDelay: true, // 设置 enableAutoDelay 字段

  // 是否启用滑点记录 / Enable slippage recording
  enableSlippageRecording: true, // 设置 enableSlippageRecording 字段

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 设置 verbose 字段
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 执行 Alpha 引擎
 * Execution Alpha Engine
 */
export class ExecutionAlphaEngine extends EventEmitter { // 导出类 ExecutionAlphaEngine
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

    // 初始化子组件 / Initialize sub-components
    this.orderBookAnalyzer = new OrderBookAnalyzer(config.orderBookAnalyzer); // 设置 orderBookAnalyzer
    this.twapVwapExecutor = new TWAPVWAPExecutor(config.twapVwapExecutor); // 设置 twapVwapExecutor
    this.icebergExecutor = new IcebergOrderExecutor(config.icebergExecutor); // 设置 icebergExecutor
    this.slippageAnalyzer = new SlippageAnalyzer(config.slippageAnalyzer); // 设置 slippageAnalyzer

    // 订单执行器引用 / Order executor reference
    this.orderExecutor = null; // 设置 orderExecutor

    // 活跃执行任务 / Active execution tasks
    this.activeTasks = new Map(); // 设置 activeTasks

    // 执行历史 / Execution history
    this.executionHistory = []; // 设置 executionHistory

    // 日均成交量缓存 / Daily volume cache
    this.dailyVolumeCache = new Map(); // 设置 dailyVolumeCache

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalExecutions: 0, // 设置 totalExecutions 字段
      directExecutions: 0, // 设置 directExecutions 字段
      twapExecutions: 0, // 设置 twapExecutions 字段
      vwapExecutions: 0, // 设置 vwapExecutions 字段
      icebergExecutions: 0, // 设置 icebergExecutions 字段
      avgSlippage: 0, // 设置 avgSlippage 字段
      totalSaved: 0,  // 相对于直接市价单节省的成本 / Cost saved vs direct market orders
    }; // 结束代码块

    // 设置事件转发 / Setup event forwarding
    this._setupEventForwarding(); // 调用 _setupEventForwarding
  } // 结束代码块

  // ============================================
  // 初始化 / Initialization
  // ============================================

  /**
   * 初始化引擎
   * Initialize engine
   *
   * @param {Object} dependencies - 依赖项 / Dependencies
   */
  async init(dependencies = {}) { // 执行语句
    const { orderExecutor, exchanges } = dependencies; // 解构赋值

    this.orderExecutor = orderExecutor; // 设置 orderExecutor

    // 初始化子组件 / Initialize sub-components
    this.twapVwapExecutor.init({ // 访问 twapVwapExecutor
      orderExecutor, // 执行语句
      orderBookAnalyzer: this.orderBookAnalyzer, // 设置 orderBookAnalyzer 字段
    }); // 结束代码块

    this.icebergExecutor.init({ // 访问 icebergExecutor
      orderExecutor, // 执行语句
      orderBookAnalyzer: this.orderBookAnalyzer, // 设置 orderBookAnalyzer 字段
    }); // 结束代码块

    // 如果有交易所，同步日均成交量 / If exchanges provided, sync daily volumes
    if (exchanges) { // 条件判断 exchanges
      await this._syncDailyVolumes(exchanges); // 等待异步结果
    } // 结束代码块

    this.log('执行 Alpha 引擎初始化完成 / Execution Alpha Engine initialized', 'info'); // 调用 log
  } // 结束代码块

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
  async smartExecute(params) { // 执行语句
    const { // 解构赋值
      exchangeId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句
      size, // 执行语句
      strategy = EXECUTION_STRATEGY.AUTO, // 赋值 strategy
      urgency = 'normal',        // low, normal, high, critical
      maxSlippage = 0.005,       // 最大可接受滑点 / Max acceptable slippage
      limitPrice = null,         // 限价 / Limit price
      options = {}, // 赋值 options
    } = params; // 执行语句

    // 生成执行 ID / Generate execution ID
    const executionId = `exec_${symbol}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; // 定义常量 executionId

    // 记录开始时间 / Record start time
    const startTime = Date.now(); // 定义常量 startTime

    try { // 尝试执行
      // 1. 获取市场分析 / Get market analysis
      const marketAnalysis = await this.analyzeMarket(symbol, size, side); // 定义常量 marketAnalysis

      // 2. 确定执行策略 / Determine execution strategy
      const selectedStrategy = strategy === EXECUTION_STRATEGY.AUTO // 定义常量 selectedStrategy
        ? this._selectOptimalStrategy(marketAnalysis, size, urgency) // 执行语句
        : strategy; // 执行语句

      // 3. 检查是否需要延迟执行 / Check if execution should be delayed
      if (this.config.enableAutoDelay && urgency !== 'critical') { // 条件判断 this.config.enableAutoDelay && urgency !== 'c...
        const delayCheck = this.slippageAnalyzer.shouldDelayExecution(symbol, size); // 定义常量 delayCheck
        if (delayCheck.shouldDelay) { // 条件判断 delayCheck.shouldDelay
          this.log( // 调用 log
            `建议延迟执行 ${delayCheck.delayMs}ms: ${delayCheck.reason} / ` + // 执行语句
            `Recommend delay ${delayCheck.delayMs}ms`, // 执行语句
            'info' // 执行语句
          ); // 结束调用或参数

          // 如果不是高紧急度，等待 / If not high urgency, wait
          if (urgency === 'low') { // 条件判断 urgency === 'low'
            await this._sleep(delayCheck.delayMs); // 等待异步结果
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      // 4. 执行订单 / Execute order
      let result; // 定义变量 result

      this.log( // 调用 log
        `执行订单: ${symbol} ${side} ${size}, 策略: ${selectedStrategy} / ` + // 执行语句
        `Executing: ${symbol} ${side} ${size}, strategy: ${selectedStrategy}`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数

      switch (selectedStrategy) { // 分支选择 selectedStrategy
        case EXECUTION_STRATEGY.TWAP: // 分支 EXECUTION_STRATEGY.TWAP
          result = await this._executeTWAP(executionId, params, marketAnalysis); // 赋值 result
          this.stats.twapExecutions++; // 访问 stats
          break; // 跳出循环或分支

        case EXECUTION_STRATEGY.VWAP: // 分支 EXECUTION_STRATEGY.VWAP
          result = await this._executeVWAP(executionId, params, marketAnalysis); // 赋值 result
          this.stats.vwapExecutions++; // 访问 stats
          break; // 跳出循环或分支

        case EXECUTION_STRATEGY.ICEBERG: // 分支 EXECUTION_STRATEGY.ICEBERG
          result = await this._executeIceberg(executionId, params, marketAnalysis); // 赋值 result
          this.stats.icebergExecutions++; // 访问 stats
          break; // 跳出循环或分支

        case EXECUTION_STRATEGY.ADAPTIVE: // 分支 EXECUTION_STRATEGY.ADAPTIVE
          result = await this._executeAdaptive(executionId, params, marketAnalysis); // 赋值 result
          break; // 跳出循环或分支

        case EXECUTION_STRATEGY.DIRECT: // 分支 EXECUTION_STRATEGY.DIRECT
        default: // 默认分支
          result = await this._executeDirect(executionId, params, marketAnalysis); // 赋值 result
          this.stats.directExecutions++; // 访问 stats
          break; // 跳出循环或分支
      } // 结束代码块

      // 5. 记录执行结果 / Record execution result
      const endTime = Date.now(); // 定义常量 endTime
      const executionRecord = { // 定义常量 executionRecord
        executionId, // 执行语句
        symbol, // 执行语句
        side, // 执行语句
        size, // 执行语句
        strategy: selectedStrategy, // 设置 strategy 字段
        urgency, // 执行语句
        startTime, // 执行语句
        endTime, // 执行语句
        duration: endTime - startTime, // 设置 duration 字段
        executedSize: result.executedSize || size, // 设置 executedSize 字段
        avgPrice: result.avgPrice, // 设置 avgPrice 字段
        slippage: result.slippage, // 设置 slippage 字段
        success: result.success, // 设置 success 字段
        marketAnalysis: { // 设置 marketAnalysis 字段
          liquidityLevel: marketAnalysis.liquidityAssessment?.level, // 设置 liquidityLevel 字段
          slippageRisk: marketAnalysis.slippageRisk?.riskLevel, // 设置 slippageRisk 字段
          impactCost: marketAnalysis.impactEstimation?.impactBps, // 设置 impactCost 字段
        }, // 结束代码块
      }; // 结束代码块

      this.executionHistory.push(executionRecord); // 访问 executionHistory
      this.stats.totalExecutions++; // 访问 stats

      // 6. 记录滑点数据（用于未来优化）/ Record slippage data for future optimization
      if (this.config.enableSlippageRecording && result.slippage !== undefined) { // 条件判断 this.config.enableSlippageRecording && result...
        this.slippageAnalyzer.recordSlippage({ // 访问 slippageAnalyzer
          symbol, // 执行语句
          slippage: result.slippage, // 设置 slippage 字段
          side, // 执行语句
          size, // 执行语句
          expectedPrice: result.expectedPrice, // 设置 expectedPrice 字段
          actualPrice: result.avgPrice, // 设置 actualPrice 字段
          spread: marketAnalysis.depthAnalysis?.spread, // 设置 spread 字段
        }); // 结束代码块
      } // 结束代码块

      // 7. 发出完成事件 / Emit completion event
      this.emit('executionCompleted', executionRecord); // 调用 emit

      // 返回结果 / Return result
      return { // 返回结果
        success: true, // 设置 success 字段
        executionId, // 执行语句
        ...result, // 展开对象或数组
        strategy: selectedStrategy, // 设置 strategy 字段
        marketAnalysis, // 执行语句
      }; // 结束代码块

    } catch (error) { // 执行语句
      // 记录失败 / Record failure
      this.log(`执行失败: ${error.message} / Execution failed`, 'error'); // 调用 log

      this.emit('executionFailed', { // 调用 emit
        executionId, // 执行语句
        symbol, // 执行语句
        side, // 执行语句
        size, // 执行语句
        error: error.message, // 设置 error 字段
      }); // 结束代码块

      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 分析市场状况
   * Analyze market conditions
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} orderSize - 订单大小 / Order size
   * @param {string} side - 买卖方向 / Side
   * @returns {Object} 市场分析结果 / Market analysis result
   */
  async analyzeMarket(symbol, orderSize, side) { // 执行语句
    // 获取盘口数据 / Get order book data
    const orderBook = this.orderBookAnalyzer.getCachedOrderBook(symbol); // 定义常量 orderBook

    // 分析盘口深度 / Analyze order book depth
    let depthAnalysis = null; // 定义变量 depthAnalysis
    let liquidityAssessment = null; // 定义变量 liquidityAssessment
    let impactEstimation = null; // 定义变量 impactEstimation

    if (orderBook) { // 条件判断 orderBook
      depthAnalysis = this.orderBookAnalyzer.analyzeDepth(orderBook, symbol); // 赋值 depthAnalysis
      liquidityAssessment = this.orderBookAnalyzer.assessLiquidity(symbol, orderSize, depthAnalysis); // 赋值 liquidityAssessment
      impactEstimation = this.orderBookAnalyzer.estimateImpactCost(symbol, side, orderSize, orderBook); // 赋值 impactEstimation
    } // 结束代码块

    // 获取滑点风险评估 / Get slippage risk assessment
    const slippageRisk = this.slippageAnalyzer.getCurrentRisk(symbol); // 定义常量 slippageRisk

    // 获取最优执行时间 / Get optimal execution time
    const optimalTime = this.slippageAnalyzer.getOptimalExecutionTime(symbol); // 定义常量 optimalTime

    // 订单大小分类 / Order size classification
    const sizeClass = this._classifyOrderSize(symbol, orderSize); // 定义常量 sizeClass

    // 盘口趋势 / Order book trend
    const trend = this.orderBookAnalyzer.analyzeTrend(symbol, 60000); // 定义常量 trend

    return { // 返回结果
      symbol, // 执行语句
      orderSize, // 执行语句
      side, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段

      // 盘口分析 / Order book analysis
      depthAnalysis, // 执行语句
      liquidityAssessment, // 执行语句
      impactEstimation, // 执行语句
      trend, // 执行语句

      // 滑点风险 / Slippage risk
      slippageRisk, // 执行语句

      // 最优执行时间 / Optimal execution time
      optimalTime, // 执行语句

      // 订单大小分类 / Order size class
      sizeClass, // 执行语句

      // 综合评估 / Comprehensive assessment
      overallRisk: this._calculateOverallRisk(liquidityAssessment, slippageRisk, impactEstimation), // 设置 overallRisk 字段
    }; // 结束代码块
  } // 结束代码块

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
  async getRecommendation(symbol, orderSize, side, options = {}) { // 执行语句
    const { urgency = 'normal' } = options; // 解构赋值

    // 分析市场 / Analyze market
    const analysis = await this.analyzeMarket(symbol, orderSize, side); // 定义常量 analysis

    // 选择最优策略 / Select optimal strategy
    const recommendedStrategy = this._selectOptimalStrategy(analysis, orderSize, urgency); // 定义常量 recommendedStrategy

    // 生成详细建议 / Generate detailed recommendations
    const recommendations = []; // 定义常量 recommendations

    // 策略建议 / Strategy recommendation
    recommendations.push({ // 调用 recommendations.push
      type: 'strategy', // 设置 type 字段
      strategy: recommendedStrategy, // 设置 strategy 字段
      reason: this._getStrategyReason(recommendedStrategy, analysis), // 设置 reason 字段
    }); // 结束代码块

    // 时机建议 / Timing recommendation
    if (analysis.slippageRisk?.riskLevel === SLIPPAGE_RISK.HIGH || // 条件判断 analysis.slippageRisk?.riskLevel === SLIPPAGE...
        analysis.slippageRisk?.riskLevel === SLIPPAGE_RISK.VERY_HIGH) { // 执行语句
      recommendations.push({ // 调用 recommendations.push
        type: 'timing', // 设置 type 字段
        recommendation: '建议等待更好的执行时机 / Recommend waiting for better timing', // 设置 recommendation 字段
        optimalTime: analysis.optimalTime?.optimalTime, // 设置 optimalTime 字段
      }); // 结束代码块
    } // 结束代码块

    // 拆单建议 / Split recommendation
    if (analysis.impactEstimation?.impactLevel === 'high' || // 条件判断 analysis.impactEstimation?.impactLevel === 'h...
        analysis.impactEstimation?.impactLevel === 'extreme') { // 执行语句
      const suggestedSplits = Math.ceil(orderSize / (analysis.impactEstimation.filledSize / 3)); // 定义常量 suggestedSplits
      recommendations.push({ // 调用 recommendations.push
        type: 'split', // 设置 type 字段
        recommendation: `建议拆分为 ${suggestedSplits} 个子订单 / Recommend splitting into ${suggestedSplits} sub-orders`, // 设置 recommendation 字段
        suggestedSplits, // 执行语句
      }); // 结束代码块
    } // 结束代码块

    return { // 返回结果
      symbol, // 执行语句
      orderSize, // 执行语句
      side, // 执行语句
      urgency, // 执行语句
      recommendedStrategy, // 执行语句
      recommendations, // 执行语句
      analysis, // 执行语句
      expectedImpact: analysis.impactEstimation?.impactBps || 0, // 设置 expectedImpact 字段
      riskLevel: analysis.overallRisk, // 设置 riskLevel 字段
    }; // 结束代码块
  } // 结束代码块

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
  async _executeDirect(executionId, params, analysis) { // 执行语句
    const { exchangeId, symbol, side, size, limitPrice } = params; // 解构赋值

    // 记录预期价格 / Record expected price
    const expectedPrice = side === 'buy' // 定义常量 expectedPrice
      ? analysis.depthAnalysis?.bestAsk // 执行语句
      : analysis.depthAnalysis?.bestBid; // 执行语句

    // 使用订单执行器直接执行 / Execute directly using order executor
    if (this.orderExecutor) { // 条件判断 this.orderExecutor
      const result = await this.orderExecutor.executeSmartLimitOrder({ // 定义常量 result
        exchangeId, // 执行语句
        symbol, // 执行语句
        side, // 执行语句
        amount: size, // 设置 amount 字段
        price: limitPrice || expectedPrice, // 设置 price 字段
        options: { executionId }, // 设置 options 字段
      }); // 结束代码块

      // 计算滑点 / Calculate slippage
      const avgPrice = result.orderInfo?.avgPrice || expectedPrice; // 定义常量 avgPrice
      const slippage = expectedPrice // 定义常量 slippage
        ? (side === 'buy' // 执行语句
          ? (avgPrice - expectedPrice) / expectedPrice // 执行语句
          : (expectedPrice - avgPrice) / expectedPrice) // 执行语句
        : 0; // 执行语句

      return { // 返回结果
        success: true, // 设置 success 字段
        executedSize: result.orderInfo?.filledAmount || size, // 设置 executedSize 字段
        avgPrice, // 执行语句
        expectedPrice, // 执行语句
        slippage, // 执行语句
        orders: [result], // 设置 orders 字段
      }; // 结束代码块
    } // 结束代码块

    // 模拟执行 / Simulated execution
    return { // 返回结果
      success: true, // 设置 success 字段
      executedSize: size, // 设置 executedSize 字段
      avgPrice: expectedPrice, // 设置 avgPrice 字段
      expectedPrice, // 执行语句
      slippage: 0, // 设置 slippage 字段
      simulated: true, // 设置 simulated 字段
    }; // 结束代码块
  } // 结束代码块

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
  async _executeTWAP(executionId, params, analysis) { // 执行语句
    const { exchangeId, symbol, side, size, options = {} } = params; // 解构赋值

    // 根据紧急程度调整执行时长 / Adjust duration based on urgency
    let duration = options.duration || this.config.defaultTWAPDuration; // 定义变量 duration
    if (params.urgency === 'high') { // 条件判断 params.urgency === 'high'
      duration = duration / 2; // 赋值 duration
    } else if (params.urgency === 'low') { // 执行语句
      duration = duration * 1.5; // 赋值 duration
    } // 结束代码块

    // 创建 TWAP 任务 / Create TWAP task
    const task = this.twapVwapExecutor.createTWAPTask({ // 定义常量 task
      exchangeId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句
      totalSize: size, // 设置 totalSize 字段
      duration, // 执行语句
      sliceCount: options.sliceCount || this.config.defaultSliceCount, // 设置 sliceCount 字段
      maxSlippage: params.maxSlippage, // 设置 maxSlippage 字段
      limitPrice: params.limitPrice, // 设置 limitPrice 字段
    }); // 结束代码块

    // 保存到活跃任务 / Save to active tasks
    this.activeTasks.set(executionId, { // 访问 activeTasks
      type: 'twap', // 设置 type 字段
      taskId: task.taskId, // 设置 taskId 字段
      task, // 执行语句
    }); // 结束代码块

    // 启动执行 / Start execution
    await this.twapVwapExecutor.startTask(task.taskId); // 等待异步结果

    // 获取最终结果 / Get final result
    const expectedPrice = analysis.depthAnalysis?.midPrice || 0; // 定义常量 expectedPrice
    const slippage = expectedPrice && task.avgExecutionPrice // 定义常量 slippage
      ? (side === 'buy' // 执行语句
        ? (task.avgExecutionPrice - expectedPrice) / expectedPrice // 执行语句
        : (expectedPrice - task.avgExecutionPrice) / expectedPrice) // 执行语句
      : 0; // 执行语句

    return { // 返回结果
      success: task.status === 'completed', // 设置 success 字段
      executedSize: task.executedSize, // 设置 executedSize 字段
      avgPrice: task.avgExecutionPrice, // 设置 avgPrice 字段
      expectedPrice, // 执行语句
      slippage, // 执行语句
      taskId: task.taskId, // 设置 taskId 字段
      completionRate: task.completionRate, // 设置 completionRate 字段
      sliceCount: task.slices.length, // 设置 sliceCount 字段
    }; // 结束代码块
  } // 结束代码块

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
  async _executeVWAP(executionId, params, analysis) { // 执行语句
    const { exchangeId, symbol, side, size, options = {} } = params; // 解构赋值

    // 创建 VWAP 任务 / Create VWAP task
    const task = this.twapVwapExecutor.createVWAPTask({ // 定义常量 task
      exchangeId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句
      totalSize: size, // 设置 totalSize 字段
      duration: options.duration || this.config.defaultTWAPDuration, // 设置 duration 字段
      sliceCount: options.sliceCount || this.config.defaultSliceCount, // 设置 sliceCount 字段
      volumeCurve: options.volumeCurve || VOLUME_CURVES.crypto, // 设置 volumeCurve 字段
      maxSlippage: params.maxSlippage, // 设置 maxSlippage 字段
      limitPrice: params.limitPrice, // 设置 limitPrice 字段
    }); // 结束代码块

    // 保存到活跃任务 / Save to active tasks
    this.activeTasks.set(executionId, { // 访问 activeTasks
      type: 'vwap', // 设置 type 字段
      taskId: task.taskId, // 设置 taskId 字段
      task, // 执行语句
    }); // 结束代码块

    // 启动执行 / Start execution
    await this.twapVwapExecutor.startTask(task.taskId); // 等待异步结果

    // 获取最终结果 / Get final result
    const expectedPrice = analysis.depthAnalysis?.midPrice || 0; // 定义常量 expectedPrice
    const slippage = expectedPrice && task.avgExecutionPrice // 定义常量 slippage
      ? (side === 'buy' // 执行语句
        ? (task.avgExecutionPrice - expectedPrice) / expectedPrice // 执行语句
        : (expectedPrice - task.avgExecutionPrice) / expectedPrice) // 执行语句
      : 0; // 执行语句

    return { // 返回结果
      success: task.status === 'completed', // 设置 success 字段
      executedSize: task.executedSize, // 设置 executedSize 字段
      avgPrice: task.avgExecutionPrice, // 设置 avgPrice 字段
      expectedPrice, // 执行语句
      slippage, // 执行语句
      taskId: task.taskId, // 设置 taskId 字段
      completionRate: task.completionRate, // 设置 completionRate 字段
      sliceCount: task.slices.length, // 设置 sliceCount 字段
    }; // 结束代码块
  } // 结束代码块

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
  async _executeIceberg(executionId, params, analysis) { // 执行语句
    const { exchangeId, symbol, side, size, options = {} } = params; // 解构赋值

    // 根据流动性选择拆单策略 / Select split strategy based on liquidity
    let splitStrategy = SPLIT_STRATEGY.ADAPTIVE; // 定义变量 splitStrategy
    if (analysis.liquidityAssessment?.level === LIQUIDITY_LEVEL.VERY_LOW) { // 条件判断 analysis.liquidityAssessment?.level === LIQUI...
      splitStrategy = SPLIT_STRATEGY.LIQUIDITY; // 赋值 splitStrategy
    } else if (analysis.liquidityAssessment?.level === LIQUIDITY_LEVEL.LOW) { // 执行语句
      splitStrategy = SPLIT_STRATEGY.RANDOM; // 赋值 splitStrategy
    } // 结束代码块

    // 创建冰山单 / Create iceberg order
    const iceberg = this.icebergExecutor.createIcebergOrder({ // 定义常量 iceberg
      exchangeId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句
      totalSize: size, // 设置 totalSize 字段
      displayMode: DISPLAY_MODE.DYNAMIC, // 设置 displayMode 字段
      splitStrategy, // 执行语句
      limitPrice: params.limitPrice, // 设置 limitPrice 字段
      liquidityInfo: { // 设置 liquidityInfo 字段
        bidDepth: analysis.depthAnalysis?.bidDepth?.totalVolume || 0, // 设置 bidDepth 字段
        askDepth: analysis.depthAnalysis?.askDepth?.totalVolume || 0, // 设置 askDepth 字段
        spread: analysis.depthAnalysis?.spread || 0, // 设置 spread 字段
      }, // 结束代码块
    }); // 结束代码块

    // 保存到活跃任务 / Save to active tasks
    this.activeTasks.set(executionId, { // 访问 activeTasks
      type: 'iceberg', // 设置 type 字段
      icebergId: iceberg.icebergId, // 设置 icebergId 字段
      iceberg, // 执行语句
    }); // 结束代码块

    // 启动执行 / Start execution
    await this.icebergExecutor.startIceberg(iceberg.icebergId); // 等待异步结果

    // 获取最终结果 / Get final result
    const expectedPrice = analysis.depthAnalysis?.midPrice || 0; // 定义常量 expectedPrice
    const slippage = expectedPrice && iceberg.avgExecutionPrice // 定义常量 slippage
      ? (side === 'buy' // 执行语句
        ? (iceberg.avgExecutionPrice - expectedPrice) / expectedPrice // 执行语句
        : (expectedPrice - iceberg.avgExecutionPrice) / expectedPrice) // 执行语句
      : 0; // 执行语句

    return { // 返回结果
      success: iceberg.status === 'completed', // 设置 success 字段
      executedSize: iceberg.executedSize, // 设置 executedSize 字段
      avgPrice: iceberg.avgExecutionPrice, // 设置 avgPrice 字段
      expectedPrice, // 执行语句
      slippage, // 执行语句
      icebergId: iceberg.icebergId, // 设置 icebergId 字段
      subOrdersCount: iceberg.subOrders.length, // 设置 subOrdersCount 字段
    }; // 结束代码块
  } // 结束代码块

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
  async _executeAdaptive(executionId, params, analysis) { // 执行语句
    // 自适应策略：根据实时条件动态调整
    // Adaptive strategy: dynamically adjust based on real-time conditions

    // 首先尝试冰山单方式执行大部分
    // First try iceberg execution for most of the order
    const icebergSize = params.size * 0.7; // 定义常量 icebergSize
    const directSize = params.size * 0.3; // 定义常量 directSize

    // 并行执行 / Execute in parallel
    const icebergPromise = this._executeIceberg( // 定义常量 icebergPromise
      `${executionId}_iceberg`, // 执行语句
      { ...params, size: icebergSize }, // 执行语句
      analysis // 执行语句
    ); // 结束调用或参数

    // 等待冰山单完成一部分后，执行剩余部分
    // After iceberg completes partially, execute remaining
    const icebergResult = await icebergPromise; // 定义常量 icebergResult

    // 剩余部分用直接执行
    // Execute remaining directly
    const remainingSize = params.size - icebergResult.executedSize; // 定义常量 remainingSize
    let directResult = { executedSize: 0, avgPrice: 0 }; // 定义变量 directResult

    if (remainingSize > 0) { // 条件判断 remainingSize > 0
      directResult = await this._executeDirect( // 赋值 directResult
        `${executionId}_direct`, // 执行语句
        { ...params, size: remainingSize }, // 执行语句
        analysis // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 合并结果 / Merge results
    const totalExecuted = icebergResult.executedSize + directResult.executedSize; // 定义常量 totalExecuted
    const avgPrice = totalExecuted > 0 // 定义常量 avgPrice
      ? (icebergResult.executedSize * icebergResult.avgPrice + // 执行语句
         directResult.executedSize * directResult.avgPrice) / totalExecuted // 执行语句
      : 0; // 执行语句

    const expectedPrice = analysis.depthAnalysis?.midPrice || 0; // 定义常量 expectedPrice
    const slippage = expectedPrice && avgPrice // 定义常量 slippage
      ? (params.side === 'buy' // 执行语句
        ? (avgPrice - expectedPrice) / expectedPrice // 执行语句
        : (expectedPrice - avgPrice) / expectedPrice) // 执行语句
      : 0; // 执行语句

    return { // 返回结果
      success: icebergResult.success && (remainingSize === 0 || directResult.success), // 设置 success 字段
      executedSize: totalExecuted, // 设置 executedSize 字段
      avgPrice, // 执行语句
      expectedPrice, // 执行语句
      slippage, // 执行语句
      components: { // 设置 components 字段
        iceberg: icebergResult, // 设置 iceberg 字段
        direct: directResult, // 设置 direct 字段
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

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
  _selectOptimalStrategy(analysis, orderSize, urgency) { // 调用 _selectOptimalStrategy
    const { liquidityAssessment, slippageRisk, impactEstimation, sizeClass } = analysis; // 解构赋值

    // 紧急情况：直接执行 / Critical urgency: direct execution
    if (urgency === 'critical') { // 条件判断 urgency === 'critical'
      return EXECUTION_STRATEGY.DIRECT; // 返回结果
    } // 结束代码块

    // 极小订单：直接执行 / Tiny orders: direct execution
    if (sizeClass === ORDER_SIZE_CLASS.TINY) { // 条件判断 sizeClass === ORDER_SIZE_CLASS.TINY
      return EXECUTION_STRATEGY.DIRECT; // 返回结果
    } // 结束代码块

    // 小订单 + 高流动性：直接执行 / Small orders + high liquidity: direct
    if (sizeClass === ORDER_SIZE_CLASS.SMALL && // 条件判断 sizeClass === ORDER_SIZE_CLASS.SMALL &&
        (liquidityAssessment?.level === LIQUIDITY_LEVEL.HIGH || // 执行语句
         liquidityAssessment?.level === LIQUIDITY_LEVEL.VERY_HIGH)) { // 执行语句
      return EXECUTION_STRATEGY.DIRECT; // 返回结果
    } // 结束代码块

    // 高冲击成本 或 低流动性：冰山单 / High impact or low liquidity: iceberg
    if (impactEstimation?.impactLevel === 'extreme' || // 条件判断 impactEstimation?.impactLevel === 'extreme' ||
        impactEstimation?.impactLevel === 'high' || // 执行语句
        liquidityAssessment?.level === LIQUIDITY_LEVEL.VERY_LOW) { // 执行语句
      return EXECUTION_STRATEGY.ICEBERG; // 返回结果
    } // 结束代码块

    // 中等大小 + 高滑点风险：TWAP / Medium size + high slippage risk: TWAP
    if ((sizeClass === ORDER_SIZE_CLASS.MEDIUM || sizeClass === ORDER_SIZE_CLASS.LARGE) && // 条件判断 (sizeClass === ORDER_SIZE_CLASS.MEDIUM || siz...
        (slippageRisk?.riskLevel === SLIPPAGE_RISK.HIGH || // 执行语句
         slippageRisk?.riskLevel === SLIPPAGE_RISK.VERY_HIGH)) { // 执行语句
      return EXECUTION_STRATEGY.TWAP; // 返回结果
    } // 结束代码块

    // 大订单 + 不紧急：VWAP / Large orders + not urgent: VWAP
    if ((sizeClass === ORDER_SIZE_CLASS.LARGE || sizeClass === ORDER_SIZE_CLASS.VERY_LARGE) && // 条件判断 (sizeClass === ORDER_SIZE_CLASS.LARGE || size...
        urgency === 'low') { // 赋值 urgency
      return EXECUTION_STRATEGY.VWAP; // 返回结果
    } // 结束代码块

    // 中等大小：TWAP / Medium size: TWAP
    if (sizeClass === ORDER_SIZE_CLASS.MEDIUM) { // 条件判断 sizeClass === ORDER_SIZE_CLASS.MEDIUM
      return EXECUTION_STRATEGY.TWAP; // 返回结果
    } // 结束代码块

    // 默认：直接执行 / Default: direct execution
    return EXECUTION_STRATEGY.DIRECT; // 返回结果
  } // 结束代码块

  /**
   * 分类订单大小
   * Classify order size
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} orderSize - 订单大小 / Order size
   * @returns {string} 大小分类 / Size class
   * @private
   */
  _classifyOrderSize(symbol, orderSize) { // 调用 _classifyOrderSize
    const dailyVolume = this.dailyVolumeCache.get(symbol) || 0; // 定义常量 dailyVolume

    if (dailyVolume === 0) { // 条件判断 dailyVolume === 0
      // 无法分类，根据绝对值估算 / Cannot classify, estimate by absolute value
      return ORDER_SIZE_CLASS.MEDIUM; // 返回结果
    } // 结束代码块

    const ratio = orderSize / dailyVolume; // 定义常量 ratio
    const thresholds = this.config.sizeClassThresholds; // 定义常量 thresholds

    if (ratio <= thresholds.tiny) return ORDER_SIZE_CLASS.TINY; // 条件判断 ratio <= thresholds.tiny
    if (ratio <= thresholds.small) return ORDER_SIZE_CLASS.SMALL; // 条件判断 ratio <= thresholds.small
    if (ratio <= thresholds.medium) return ORDER_SIZE_CLASS.MEDIUM; // 条件判断 ratio <= thresholds.medium
    if (ratio <= thresholds.large) return ORDER_SIZE_CLASS.LARGE; // 条件判断 ratio <= thresholds.large
    return ORDER_SIZE_CLASS.VERY_LARGE; // 返回结果
  } // 结束代码块

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
  _calculateOverallRisk(liquidityAssessment, slippageRisk, impactEstimation) { // 调用 _calculateOverallRisk
    let riskScore = 0; // 定义变量 riskScore
    let factors = 0; // 定义变量 factors

    // 流动性风险 / Liquidity risk
    if (liquidityAssessment) { // 条件判断 liquidityAssessment
      const liquidityScore = { // 定义常量 liquidityScore
        [LIQUIDITY_LEVEL.VERY_HIGH]: 10, // 执行语句
        [LIQUIDITY_LEVEL.HIGH]: 20, // 执行语句
        [LIQUIDITY_LEVEL.MEDIUM]: 50, // 执行语句
        [LIQUIDITY_LEVEL.LOW]: 70, // 执行语句
        [LIQUIDITY_LEVEL.VERY_LOW]: 90, // 执行语句
      }[liquidityAssessment.level] || 50; // 执行语句

      riskScore += liquidityScore; // 执行语句
      factors++; // 执行语句
    } // 结束代码块

    // 滑点风险 / Slippage risk
    if (slippageRisk) { // 条件判断 slippageRisk
      riskScore += slippageRisk.riskScore || 50; // 执行语句
      factors++; // 执行语句
    } // 结束代码块

    // 冲击成本风险 / Impact cost risk
    if (impactEstimation) { // 条件判断 impactEstimation
      const impactScore = { // 定义常量 impactScore
        low: 20, // 设置 low 字段
        medium: 50, // 设置 medium 字段
        high: 75, // 设置 high 字段
        extreme: 95, // 设置 extreme 字段
      }[impactEstimation.impactLevel] || 50; // 执行语句

      riskScore += impactScore; // 执行语句
      factors++; // 执行语句
    } // 结束代码块

    // 计算平均 / Calculate average
    const avgScore = factors > 0 ? riskScore / factors : 50; // 定义常量 avgScore

    // 转换为风险等级 / Convert to risk level
    if (avgScore <= 20) return 'very_low'; // 条件判断 avgScore <= 20
    if (avgScore <= 40) return 'low'; // 条件判断 avgScore <= 40
    if (avgScore <= 60) return 'medium'; // 条件判断 avgScore <= 60
    if (avgScore <= 80) return 'high'; // 条件判断 avgScore <= 80
    return 'very_high'; // 返回结果
  } // 结束代码块

  /**
   * 获取策略原因
   * Get strategy reason
   *
   * @param {string} strategy - 策略 / Strategy
   * @param {Object} analysis - 分析 / Analysis
   * @returns {string} 原因 / Reason
   * @private
   */
  _getStrategyReason(strategy, analysis) { // 调用 _getStrategyReason
    switch (strategy) { // 分支选择 strategy
      case EXECUTION_STRATEGY.DIRECT: // 分支 EXECUTION_STRATEGY.DIRECT
        return '订单较小或流动性充足，直接执行效率最高 / Small order or high liquidity, direct execution is most efficient'; // 返回结果

      case EXECUTION_STRATEGY.TWAP: // 分支 EXECUTION_STRATEGY.TWAP
        return '中等大小订单，时间均匀分布可降低市场冲击 / Medium order, time distribution reduces market impact'; // 返回结果

      case EXECUTION_STRATEGY.VWAP: // 分支 EXECUTION_STRATEGY.VWAP
        return '大订单配合成交量分布执行，跟踪市场节奏 / Large order executed with volume distribution, following market rhythm'; // 返回结果

      case EXECUTION_STRATEGY.ICEBERG: // 分支 EXECUTION_STRATEGY.ICEBERG
        return '流动性不足或冲击成本高，隐藏真实订单量 / Low liquidity or high impact, hiding real order size'; // 返回结果

      case EXECUTION_STRATEGY.ADAPTIVE: // 分支 EXECUTION_STRATEGY.ADAPTIVE
        return '复杂市场条件，动态调整执行策略 / Complex market conditions, dynamically adjusting execution'; // 返回结果

      default: // 默认分支
        return '基于市场分析选择最优策略 / Optimal strategy based on market analysis'; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 设置事件转发
   * Setup event forwarding
   *
   * @private
   */
  _setupEventForwarding() { // 调用 _setupEventForwarding
    // TWAP/VWAP 事件 / TWAP/VWAP events
    this.twapVwapExecutor.on('taskCompleted', (data) => { // 访问 twapVwapExecutor
      this.emit('algoTaskCompleted', { type: 'twap/vwap', ...data }); // 调用 emit
    }); // 结束代码块

    this.twapVwapExecutor.on('sliceExecuted', (data) => { // 访问 twapVwapExecutor
      this.emit('algoSliceExecuted', data); // 调用 emit
    }); // 结束代码块

    // 冰山单事件 / Iceberg events
    this.icebergExecutor.on('icebergCompleted', (data) => { // 访问 icebergExecutor
      this.emit('algoTaskCompleted', { type: 'iceberg', ...data }); // 调用 emit
    }); // 结束代码块

    this.icebergExecutor.on('subOrderCompleted', (data) => { // 访问 icebergExecutor
      this.emit('algoSliceExecuted', data); // 调用 emit
    }); // 结束代码块

    // 滑点警告 / Slippage warnings
    this.slippageAnalyzer.on('slippageWarning', (data) => { // 访问 slippageAnalyzer
      this.emit('slippageWarning', data); // 调用 emit
    }); // 结束代码块
  } // 结束代码块

  /**
   * 同步日均成交量
   * Sync daily volumes
   *
   * @param {Object} exchanges - 交易所实例 / Exchange instances
   * @private
   */
  async _syncDailyVolumes(exchanges) { // 执行语句
    // 这里可以从交易所获取日均成交量 / Can fetch daily volumes from exchanges
    // 简化实现，实际应该从市场数据服务获取 / Simplified, should get from market data service
    this.log('日均成交量同步完成 / Daily volumes synced', 'info'); // 调用 log
  } // 结束代码块

  /**
   * 休眠
   * Sleep
   *
   * @param {number} ms - 毫秒数 / Milliseconds
   * @private
   */
  _sleep(ms) { // 调用 _sleep
    return new Promise(resolve => setTimeout(resolve, ms)); // 返回结果
  } // 结束代码块

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
  updateOrderBook(symbol, orderBook) { // 调用 updateOrderBook
    this.orderBookAnalyzer.updateOrderBook(symbol, orderBook); // 访问 orderBookAnalyzer
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
    this.orderBookAnalyzer.updateDailyVolume(symbol, volume); // 访问 orderBookAnalyzer
  } // 结束代码块

  /**
   * 获取活跃任务
   * Get active tasks
   *
   * @returns {Array} 活跃任务列表 / Active task list
   */
  getActiveTasks() { // 调用 getActiveTasks
    return Array.from(this.activeTasks.entries()).map(([id, task]) => ({ // 返回结果
      executionId: id, // 设置 executionId 字段
      ...task, // 展开对象或数组
    })); // 结束代码块
  } // 结束代码块

  /**
   * 获取执行历史
   * Get execution history
   *
   * @param {number} limit - 限制数量 / Limit
   * @returns {Array} 历史记录 / History
   */
  getExecutionHistory(limit = 100) { // 调用 getExecutionHistory
    return this.executionHistory.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      ...this.stats, // 展开对象或数组
      activeTasks: this.activeTasks.size, // 设置 activeTasks 字段
      historyCount: this.executionHistory.length, // 设置 historyCount 字段
      orderBookAnalyzer: this.orderBookAnalyzer.getStats(), // 设置 orderBookAnalyzer 字段
      twapVwap: this.twapVwapExecutor.getStats(), // 设置 twapVwap 字段
      iceberg: this.icebergExecutor.getStats(), // 设置 iceberg 字段
      slippage: this.slippageAnalyzer.getStats(), // 设置 slippage 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取滑点热力图
   * Get slippage heatmap
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 热力图数据 / Heatmap data
   */
  getSlippageHeatmap(symbol) { // 调用 getSlippageHeatmap
    return this.slippageAnalyzer.getPeriodHeatmap(symbol); // 返回结果
  } // 结束代码块

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') { // 调用 log
    if (!this.config.verbose && level === 'info') { // 条件判断 !this.config.verbose && level === 'info'
      return; // 返回结果
    } // 结束代码块

    const prefix = '[ExecutionAlpha]'; // 定义常量 prefix
    const fullMessage = `${prefix} ${message}`; // 定义常量 fullMessage

    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      default: // 默认分支
        console.log(fullMessage); // 控制台输出
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 默认导出 / Default export
export default ExecutionAlphaEngine; // 默认导出
