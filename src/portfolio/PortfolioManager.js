/**
 * 组合管理器
 * Portfolio Manager
 *
 * 整合相关性分析、资金分配和组合风控的顶层管理器
 * Top-level manager integrating correlation analysis, capital allocation, and portfolio risk
 *
 * 功能 / Features:
 * 1. 统一管理多个交易策略 / Unified management of multiple trading strategies
 * 2. 基于相关性的策略组合优化 / Correlation-based portfolio optimization
 * 3. 智能资金分配 / Intelligent capital allocation
 * 4. 组合级风险控制 / Portfolio-level risk control
 * 5. 实时监控和报告 / Real-time monitoring and reporting
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入核心模块 / Import core modules
import { CorrelationAnalyzer } from '../analytics/CorrelationAnalyzer.js'; // 导入模块 ../analytics/CorrelationAnalyzer.js
import { CapitalAllocator, ALLOCATION_METHOD } from '../capital/CapitalAllocator.js'; // 导入模块 ../capital/CapitalAllocator.js
import { PortfolioRiskManager, PORTFOLIO_RISK_LEVEL } from '../risk/PortfolioRiskManager.js'; // 导入模块 ../risk/PortfolioRiskManager.js

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 组合状态
 * Portfolio status
 */
const PORTFOLIO_STATUS = { // 定义常量 PORTFOLIO_STATUS
  INITIALIZING: 'initializing',   // 初始化中 / Initializing
  RUNNING: 'running',             // 运行中 / Running
  PAUSED: 'paused',               // 已暂停 / Paused
  REBALANCING: 'rebalancing',     // 再平衡中 / Rebalancing
  EMERGENCY: 'emergency',         // 紧急状态 / Emergency
  STOPPED: 'stopped',             // STOPPED权限
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 组合配置 / Portfolio Configuration
  // ============================================

  // 总资金 / Total capital
  totalCapital: 100000, // 总资金

  // 默认资金分配方法 / Default allocation method
  allocationMethod: ALLOCATION_METHOD.RISK_PARITY, // 默认资金分配方法

  // 自动再平衡 / Auto rebalancing
  autoRebalance: true, // 自动Rebalance

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 24 * 60 * 60 * 1000, // 每天 / Daily

  // ============================================
  // 相关性配置 / Correlation Configuration
  // ============================================

  // 低相关性阈值 / Low correlation threshold
  lowCorrelationThreshold: 0.3, // 低相关性阈值

  // 高相关性警告阈值 / High correlation warning threshold
  highCorrelationWarning: 0.7, // 高相关性警告阈值

  // 相关性滚动窗口 / Correlation rolling window
  correlationWindow: 30, // correlation窗口

  // ============================================
  // 风控配置 / Risk Configuration
  // ============================================

  // 最大组合回撤 / Maximum portfolio drawdown
  maxPortfolioDrawdown: 0.15, // 最大Portfolio回撤

  // 最大总仓位 / Maximum total position ratio
  maxTotalPositionRatio: 0.60, // 最大总持仓比例

  // 单策略最大仓位 / Maximum single strategy position
  maxSingleStrategyRatio: 0.25, // 最大Single策略比例

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 状态更新间隔 (毫秒) / Status update interval (ms)
  statusUpdateInterval: 10000, // 状态更新间隔 (毫秒)

  // 报告生成间隔 (毫秒) / Report generation interval (ms)
  reportInterval: 60000, // 报告生成间隔 (毫秒)

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志

  // 日志前缀 / Log prefix
  logPrefix: '[PortfolioMgr]', // 日志前缀
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 组合管理器
 * Portfolio Manager
 */
export class PortfolioManager extends EventEmitter { // 导出类 PortfolioManager
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

    // 状态 / Status
    this.status = PORTFOLIO_STATUS.STOPPED; // 设置 status

    // 策略列表 / Strategy list
    // 格式: { strategyId: { instance, config, state } }
    this.strategies = new Map(); // 设置 strategies

    // 核心模块 / Core modules
    this.correlationAnalyzer = null; // 设置 correlationAnalyzer
    this.capitalAllocator = null; // 设置 capitalAllocator
    this.portfolioRiskManager = null; // 设置 portfolioRiskManager

    // 订单执行器引用 / Order executor reference
    this.executor = null; // 设置 executor

    // 定时器 / Timers
    this.statusTimer = null; // 设置 statusTimer
    this.reportTimer = null; // 设置 reportTimer

    // 组合统计 / Portfolio statistics
    this.statistics = { // 设置 statistics
      totalEquity: this.config.totalCapital, // 总Equity
      totalPositionValue: 0, // 总持仓Value
      realizedPnL: 0, // 已实现PnL
      unrealizedPnL: 0, // 未实现PnL
      totalTrades: 0, // 总成交
      winRate: 0, // win频率
      sharpeRatio: 0, // sharpe比例
      maxDrawdown: 0, // 最大回撤
      currentDrawdown: 0, // current回撤
    }; // 结束代码块

    // 收益历史 / Returns history
    this.equityCurve = []; // 设置 equityCurve
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化组合管理器
   * Initialize portfolio manager
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) { // 执行语句
    this.status = PORTFOLIO_STATUS.INITIALIZING; // 设置 status
    this.log('初始化组合管理器 / Initializing portfolio manager', 'info'); // 调用 log

    // 保存执行器引用 / Save executor reference
    this.executor = options.executor; // 设置 executor

    // 1. 初始化相关性分析器 / Initialize correlation analyzer
    this.correlationAnalyzer = new CorrelationAnalyzer({ // 设置 correlationAnalyzer
      rollingWindow: this.config.correlationWindow, // 滚动窗口
      lowCorrelationThreshold: this.config.lowCorrelationThreshold, // 最低Correlation阈值
      highCorrelationWarning: this.config.highCorrelationWarning, // 最高Correlation警告
      verbose: this.config.verbose, // 详细日志
    }); // 结束代码块

    // 2. 初始化资金分配器 / Initialize capital allocator
    this.capitalAllocator = new CapitalAllocator({ // 设置 capitalAllocator
      totalCapital: this.config.totalCapital, // 总资金
      defaultMethod: this.config.allocationMethod, // 默认Method
      rebalancePeriod: this.config.rebalancePeriod, // rebalance周期
      maxWeight: this.config.maxSingleStrategyRatio, // 最大Weight
      verbose: this.config.verbose, // 详细日志
    }); // 结束代码块

    // 3. 初始化组合风控管理器 / Initialize portfolio risk manager
    this.portfolioRiskManager = new PortfolioRiskManager({ // 设置 portfolioRiskManager
      maxPortfolioDrawdown: this.config.maxPortfolioDrawdown, // 最大Portfolio回撤
      maxTotalPositionRatio: this.config.maxTotalPositionRatio, // 最大总持仓比例
      maxSingleStrategyRatio: this.config.maxSingleStrategyRatio, // 最大Single策略比例
      verbose: this.config.verbose, // 详细日志
    }); // 结束代码块

    // 初始化风控管理器 / Initialize risk manager
    await this.portfolioRiskManager.init({ // 等待异步结果
      correlationAnalyzer: this.correlationAnalyzer, // correlationAnalyzer
      capitalAllocator: this.capitalAllocator, // 资金Allocator
      executor: this.executor, // executor
      initialEquity: this.config.totalCapital, // 初始Equity
    }); // 结束代码块

    // 4. 绑定事件 / Bind events
    this._bindEvents(); // 调用 _bindEvents

    this.log('组合管理器初始化完成 / Portfolio manager initialized', 'info'); // 调用 log
    this.emit('initialized'); // 调用 emit
  } // 结束代码块

  /**
   * 启动组合管理器
   * Start portfolio manager
   */
  async start() { // 执行语句
    if (this.status === PORTFOLIO_STATUS.RUNNING) { // 条件判断 this.status === PORTFOLIO_STATUS.RUNNING
      return; // 返回结果
    } // 结束代码块

    this.log('启动组合管理器 / Starting portfolio manager', 'info'); // 调用 log

    // 启动核心模块 / Start core modules
    this.correlationAnalyzer.start(); // 访问 correlationAnalyzer
    this.capitalAllocator.start(); // 访问 capitalAllocator
    this.portfolioRiskManager.start(); // 访问 portfolioRiskManager

    // 启动状态更新定时器 / Start status update timer
    this.statusTimer = setInterval( // 设置 statusTimer
      () => this._updateStatus(), // 定义箭头函数
      this.config.statusUpdateInterval // 访问 config
    ); // 结束调用或参数

    // 启动报告生成定时器 / Start report generation timer
    this.reportTimer = setInterval( // 设置 reportTimer
      () => this._generateReport(), // 定义箭头函数
      this.config.reportInterval // 访问 config
    ); // 结束调用或参数

    this.status = PORTFOLIO_STATUS.RUNNING; // 设置 status

    this.log('组合管理器已启动 / Portfolio manager started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止组合管理器
   * Stop portfolio manager
   */
  async stop() { // 执行语句
    if (this.status === PORTFOLIO_STATUS.STOPPED) { // 条件判断 this.status === PORTFOLIO_STATUS.STOPPED
      return; // 返回结果
    } // 结束代码块

    this.log('停止组合管理器 / Stopping portfolio manager', 'info'); // 调用 log

    // 停止定时器 / Stop timers
    if (this.statusTimer) { // 条件判断 this.statusTimer
      clearInterval(this.statusTimer); // 调用 clearInterval
      this.statusTimer = null; // 设置 statusTimer
    } // 结束代码块

    if (this.reportTimer) { // 条件判断 this.reportTimer
      clearInterval(this.reportTimer); // 调用 clearInterval
      this.reportTimer = null; // 设置 reportTimer
    } // 结束代码块

    // 停止核心模块 / Stop core modules
    this.correlationAnalyzer.stop(); // 访问 correlationAnalyzer
    this.capitalAllocator.stop(); // 访问 capitalAllocator
    this.portfolioRiskManager.stop(); // 访问 portfolioRiskManager

    this.status = PORTFOLIO_STATUS.STOPPED; // 设置 status

    this.log('组合管理器已停止 / Portfolio manager stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 策略管理 / Strategy Management
  // ============================================

  /**
   * 添加策略
   * Add strategy
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} strategyInstance - 策略实例 / Strategy instance
   * @param {Object} config - 策略配置 / Strategy config
   */
  addStrategy(strategyId, strategyInstance, config = {}) { // 调用 addStrategy
    if (this.strategies.has(strategyId)) { // 条件判断 this.strategies.has(strategyId)
      this.log(`策略已存在: ${strategyId} / Strategy already exists: ${strategyId}`, 'warn'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    // 添加到策略列表 / Add to strategy list
    this.strategies.set(strategyId, { // 访问 strategies
      instance: strategyInstance, // instance
      config, // 执行语句
      state: { // state
        equity: 0, // equity
        positionValue: 0, // 持仓Value
        positions: [], // 持仓
        pnl: 0, // 盈亏
        trades: [], // 成交
        returns: [], // returns
      }, // 结束代码块
    }); // 结束代码块

    // 注册到各模块 / Register to modules
    this.correlationAnalyzer.registerStrategy(strategyId, config); // 访问 correlationAnalyzer
    this.portfolioRiskManager.registerStrategy(strategyId, config); // 访问 portfolioRiskManager

    // 更新资金分配器的策略统计 / Update capital allocator strategy stats
    this.capitalAllocator.updateStrategyStats(strategyId, { // 访问 capitalAllocator
      expectedReturn: config.expectedReturn || 0.1, // expectedReturn
      volatility: config.volatility || 0.15, // 波动率
      winRate: config.winRate || 0.5, // win频率
      avgWin: config.avgWin || 1, // avgWin
      avgLoss: config.avgLoss || 1, // avg亏损
    }); // 结束代码块

    // 绑定策略事件 / Bind strategy events
    this._bindStrategyEvents(strategyId, strategyInstance); // 调用 _bindStrategyEvents

    this.log(`添加策略: ${strategyId} / Strategy added: ${strategyId}`, 'info'); // 调用 log
    this.emit('strategyAdded', { strategyId, config }); // 调用 emit

    // 重新计算资金分配 / Recalculate allocation
    if (this.status === PORTFOLIO_STATUS.RUNNING) { // 条件判断 this.status === PORTFOLIO_STATUS.RUNNING
      this._recalculateAllocation(); // 调用 _recalculateAllocation
    } // 结束代码块
  } // 结束代码块

  /**
   * 移除策略
   * Remove strategy
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   */
  removeStrategy(strategyId) { // 调用 removeStrategy
    if (!this.strategies.has(strategyId)) { // 条件判断 !this.strategies.has(strategyId)
      return; // 返回结果
    } // 结束代码块

    // 从策略列表移除 / Remove from strategy list
    this.strategies.delete(strategyId); // 访问 strategies

    // 从各模块移除 / Remove from modules
    this.correlationAnalyzer.removeStrategy(strategyId); // 访问 correlationAnalyzer

    this.log(`移除策略: ${strategyId} / Strategy removed: ${strategyId}`, 'info'); // 调用 log
    this.emit('strategyRemoved', { strategyId }); // 调用 emit

    // 重新计算资金分配 / Recalculate allocation
    if (this.status === PORTFOLIO_STATUS.RUNNING) { // 条件判断 this.status === PORTFOLIO_STATUS.RUNNING
      this._recalculateAllocation(); // 调用 _recalculateAllocation
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新策略状态
   * Update strategy state
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} state - 状态数据 / State data
   */
  updateStrategyState(strategyId, state) { // 调用 updateStrategyState
    const strategy = this.strategies.get(strategyId); // 定义常量 strategy

    if (!strategy) { // 条件判断 !strategy
      return; // 返回结果
    } // 结束代码块

    // 更新策略状态 / Update strategy state
    strategy.state = { ...strategy.state, ...state }; // 赋值 strategy.state

    // 同步到风控管理器 / Sync to risk manager
    this.portfolioRiskManager.updateStrategyState(strategyId, state); // 访问 portfolioRiskManager

    // 如果有收益数据，记录到相关性分析器 / If has return data, record to correlation analyzer
    if (state.dailyReturn !== undefined) { // 条件判断 state.dailyReturn !== undefined
      this.correlationAnalyzer.recordReturn( // 访问 correlationAnalyzer
        strategyId, // 执行语句
        state.dailyReturn, // 执行语句
        state.equity // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 更新资金分配器的策略统计 / Update capital allocator stats
    if (state.winRate !== undefined || state.volatility !== undefined) { // 条件判断 state.winRate !== undefined || state.volatili...
      this.capitalAllocator.updateStrategyStats(strategyId, { // 访问 capitalAllocator
        winRate: state.winRate, // win频率
        volatility: state.volatility, // 波动率
        expectedReturn: state.expectedReturn, // expectedReturn
        avgWin: state.avgWin, // avgWin
        avgLoss: state.avgLoss, // avg亏损
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录策略交易
   * Record strategy trade
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} trade - 交易记录 / Trade record
   */
  recordTrade(strategyId, trade) { // 调用 recordTrade
    const strategy = this.strategies.get(strategyId); // 定义常量 strategy

    if (!strategy) { // 条件判断 !strategy
      return; // 返回结果
    } // 结束代码块

    // 添加到交易历史 / Add to trade history
    strategy.state.trades.push({ // 调用 strategy.state.trades.push
      ...trade, // 展开对象或数组
      timestamp: trade.timestamp || Date.now(), // 时间戳
    }); // 结束代码块

    // 更新统计 / Update statistics
    this.statistics.totalTrades++; // 访问 statistics

    if (trade.pnl > 0) { // 条件判断 trade.pnl > 0
      this.statistics.winRate = // 访问 statistics
        (this.statistics.winRate * (this.statistics.totalTrades - 1) + 1) / // 执行语句
        this.statistics.totalTrades; // 访问 statistics
    } else { // 执行语句
      this.statistics.winRate = // 访问 statistics
        (this.statistics.winRate * (this.statistics.totalTrades - 1)) / // 执行语句
        this.statistics.totalTrades; // 访问 statistics
    } // 结束代码块

    this.emit('tradeRecorded', { strategyId, trade }); // 调用 emit
  } // 结束代码块

  // ============================================
  // 资金分配 / Capital Allocation
  // ============================================

  /**
   * 获取资金分配
   * Get capital allocation
   *
   * @param {string} method - 分配方法 / Allocation method
   * @returns {Object} 分配结果 / Allocation result
   */
  getAllocation(method = null) { // 调用 getAllocation
    // 更新协方差矩阵 / Update covariance matrix
    const covMatrix = this.correlationAnalyzer.buildCovarianceMatrix(); // 定义常量 covMatrix
    this.capitalAllocator.setCovarianceMatrix(covMatrix); // 访问 capitalAllocator

    // 更新相关性矩阵 / Update correlation matrix
    const corrMatrix = this.correlationAnalyzer.buildCorrelationMatrix(); // 定义常量 corrMatrix
    this.capitalAllocator.setCorrelationMatrix(corrMatrix); // 访问 capitalAllocator

    // 计算分配 / Calculate allocation
    return this.capitalAllocator.calculateAllocation(method); // 返回结果
  } // 结束代码块

  /**
   * 执行再平衡
   * Execute rebalancing
   *
   * @param {string} reason - 原因 / Reason
   * @returns {Object} 再平衡结果 / Rebalance result
   */
  async rebalance(reason = 'manual') { // 执行语句
    this.status = PORTFOLIO_STATUS.REBALANCING; // 设置 status
    this.log(`执行再平衡: ${reason} / Executing rebalance: ${reason}`, 'info'); // 调用 log

    try { // 尝试执行
      // 获取当前分配 / Get current allocation
      const currentAllocation = this.capitalAllocator.getCurrentAllocation(); // 定义常量 currentAllocation

      // 计算新分配 / Calculate new allocation
      const newAllocation = this.getAllocation(); // 定义常量 newAllocation

      // 计算调整 / Calculate adjustments
      const adjustments = []; // 定义常量 adjustments

      for (const [strategyId, newWeight] of Object.entries(newAllocation.weights)) { // 循环 const [strategyId, newWeight] of Object.entri...
        const currentWeight = currentAllocation.weights[strategyId] || 0; // 定义常量 currentWeight
        const change = newWeight - currentWeight; // 定义常量 change

        if (Math.abs(change) > 0.01) { // 大于1%的变化才执行
          adjustments.push({ // 调用 adjustments.push
            strategyId, // 执行语句
            currentWeight, // 执行语句
            newWeight, // 执行语句
            change, // 执行语句
            amount: change * this.config.totalCapital, // 数量
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块

      // 执行再平衡 / Execute rebalance
      const result = this.capitalAllocator.rebalance(reason); // 定义常量 result

      // 通知各策略新的资金分配 / Notify strategies of new allocation
      for (const [strategyId, alloc] of Object.entries(result.allocation.allocations)) { // 循环 const [strategyId, alloc] of Object.entries(r...
        const strategy = this.strategies.get(strategyId); // 定义常量 strategy
        if (strategy && strategy.instance && strategy.instance.onAllocationChange) { // 条件判断 strategy && strategy.instance && strategy.ins...
          strategy.instance.onAllocationChange(alloc); // 调用 strategy.instance.onAllocationChange
        } // 结束代码块
      } // 结束代码块

      this.status = PORTFOLIO_STATUS.RUNNING; // 设置 status

      this.log(`再平衡完成 / Rebalance completed`, 'info'); // 调用 log
      this.emit('rebalanced', { reason, result, adjustments }); // 调用 emit

      return { result, adjustments }; // 返回结果

    } catch (error) { // 执行语句
      this.status = PORTFOLIO_STATUS.RUNNING; // 设置 status
      this.log(`再平衡失败: ${error.message} / Rebalance failed: ${error.message}`, 'error'); // 调用 log
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 重新计算资金分配
   * Recalculate allocation
   * @private
   */
  _recalculateAllocation() { // 调用 _recalculateAllocation
    if (this.strategies.size < 1) { // 条件判断 this.strategies.size < 1
      return; // 返回结果
    } // 结束代码块

    const allocation = this.getAllocation(); // 定义常量 allocation

    this.log(`资金分配更新 / Allocation updated: ${JSON.stringify(allocation.weights)}`, 'info'); // 调用 log
    this.emit('allocationUpdated', allocation); // 调用 emit
  } // 结束代码块

  // ============================================
  // 风险管理 / Risk Management
  // ============================================

  /**
   * 检查订单
   * Check order
   *
   * @param {Object} order - 订单信息 / Order info
   * @returns {Object} 检查结果 / Check result
   */
  checkOrder(order) { // 调用 checkOrder
    return this.portfolioRiskManager.checkOrder(order); // 返回结果
  } // 结束代码块

  /**
   * 获取风险状态
   * Get risk status
   *
   * @returns {Object} 风险状态 / Risk status
   */
  getRiskStatus() { // 调用 getRiskStatus
    return this.portfolioRiskManager.getStatus(); // 返回结果
  } // 结束代码块

  /**
   * 暂停交易
   * Pause trading
   *
   * @param {string} reason - 原因 / Reason
   */
  pauseTrading(reason = '手动暂停') { // 调用 pauseTrading
    this.status = PORTFOLIO_STATUS.PAUSED; // 设置 status
    this.portfolioRiskManager.pauseTrading(reason); // 访问 portfolioRiskManager

    this.log(`交易已暂停: ${reason} / Trading paused: ${reason}`, 'warn'); // 调用 log
    this.emit('tradingPaused', { reason }); // 调用 emit
  } // 结束代码块

  /**
   * 恢复交易
   * Resume trading
   */
  resumeTrading() { // 调用 resumeTrading
    this.status = PORTFOLIO_STATUS.RUNNING; // 设置 status
    this.portfolioRiskManager.resumeTrading(); // 访问 portfolioRiskManager

    this.log('交易已恢复 / Trading resumed', 'info'); // 调用 log
    this.emit('tradingResumed'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 相关性分析 / Correlation Analysis
  // ============================================

  /**
   * 获取相关性矩阵
   * Get correlation matrix
   *
   * @returns {Object} 相关性矩阵 / Correlation matrix
   */
  getCorrelationMatrix() { // 调用 getCorrelationMatrix
    return this.correlationAnalyzer.buildCorrelationMatrix(); // 返回结果
  } // 结束代码块

  /**
   * 获取低相关策略组合
   * Get low correlation strategy pairs
   *
   * @returns {Array} 低相关策略对 / Low correlation pairs
   */
  getLowCorrelationPairs() { // 调用 getLowCorrelationPairs
    return this.correlationAnalyzer.findLowCorrelationPairs(); // 返回结果
  } // 结束代码块

  /**
   * 获取最优策略组合
   * Get optimal strategy combination
   *
   * @param {number} count - 策略数量 / Strategy count
   * @returns {Object} 最优组合 / Optimal combination
   */
  getOptimalCombination(count = 3) { // 调用 getOptimalCombination
    return this.correlationAnalyzer.getOptimalCombination(count); // 返回结果
  } // 结束代码块

  /**
   * 获取相关性分析报告
   * Get correlation analysis report
   *
   * @returns {Object} 分析报告 / Analysis report
   */
  getCorrelationReport() { // 调用 getCorrelationReport
    return this.correlationAnalyzer.getAnalysisReport(); // 返回结果
  } // 结束代码块

  // ============================================
  // 监控和报告 / Monitoring and Reporting
  // ============================================

  /**
   * 更新状态
   * Update status
   * @private
   */
  _updateStatus() { // 调用 _updateStatus
    // 汇总所有策略状态 / Aggregate all strategy states
    let totalEquity = 0; // 定义变量 totalEquity
    let totalPositionValue = 0; // 定义变量 totalPositionValue
    let totalPnL = 0; // 定义变量 totalPnL

    for (const [, strategy] of this.strategies) { // 循环 const [, strategy] of this.strategies
      totalEquity += strategy.state.equity || 0; // 执行语句
      totalPositionValue += strategy.state.positionValue || 0; // 执行语句
      totalPnL += strategy.state.pnl || 0; // 执行语句
    } // 结束代码块

    // 更新统计 / Update statistics
    this.statistics.totalEquity = totalEquity || this.config.totalCapital; // 访问 statistics
    this.statistics.totalPositionValue = totalPositionValue; // 访问 statistics
    this.statistics.realizedPnL = totalPnL; // 访问 statistics

    // 更新风控管理器 / Update risk manager
    this.portfolioRiskManager.updateTotalEquity(this.statistics.totalEquity); // 访问 portfolioRiskManager

    // 记录权益曲线 / Record equity curve
    this.equityCurve.push({ // 访问 equityCurve
      timestamp: Date.now(), // 时间戳
      equity: this.statistics.totalEquity, // equity
      positionValue: totalPositionValue, // 持仓Value
    }); // 结束代码块

    // 限制历史长度 / Limit history length
    if (this.equityCurve.length > 10000) { // 条件判断 this.equityCurve.length > 10000
      this.equityCurve = this.equityCurve.slice(-10000); // 设置 equityCurve
    } // 结束代码块

    // 为每个策略更新权益曲线 / Update equity curve for each strategy
    for (const [strategyId, strategy] of this.strategies) { // 循环 const [strategyId, strategy] of this.strategies
      if (strategy.state.equity) { // 条件判断 strategy.state.equity
        this.correlationAnalyzer.recordReturn( // 访问 correlationAnalyzer
          strategyId, // 执行语句
          strategy.state.dailyReturn || 0, // 执行语句
          strategy.state.equity // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } // 结束代码块

    this.emit('statusUpdated', this.statistics); // 调用 emit
  } // 结束代码块

  /**
   * 生成报告
   * Generate report
   * @private
   */
  _generateReport() { // 调用 _generateReport
    const report = this.getFullReport(); // 定义常量 report

    this.log('生成组合报告 / Generating portfolio report', 'info'); // 调用 log
    this.emit('reportGenerated', report); // 调用 emit
  } // 结束代码块

  /**
   * 获取完整报告
   * Get full report
   *
   * @returns {Object} 完整报告 / Full report
   */
  getFullReport() { // 调用 getFullReport
    return { // 返回结果
      timestamp: Date.now(), // 时间戳
      status: this.status, // 状态

      // 组合概览 / Portfolio overview
      portfolio: { // portfolio
        totalCapital: this.config.totalCapital, // 总资金
        totalEquity: this.statistics.totalEquity, // 总Equity
        totalPositionValue: this.statistics.totalPositionValue, // 总持仓Value
        positionRatio: this.statistics.totalPositionValue / this.statistics.totalEquity, // 持仓比例
        realizedPnL: this.statistics.realizedPnL, // 已实现PnL
        totalReturn: (this.statistics.totalEquity - this.config.totalCapital) / this.config.totalCapital, // 总Return
      }, // 结束代码块

      // 策略概览 / Strategy overview
      strategies: Object.fromEntries( // 策略
        [...this.strategies].map(([id, s]) => [id, { // 定义箭头函数
          equity: s.state.equity, // equity
          positionValue: s.state.positionValue, // 持仓Value
          pnl: s.state.pnl, // 盈亏
          trades: s.state.trades.length, // 成交
        }]) // 执行语句
      ), // 结束调用或参数

      // 资金分配 / Capital allocation
      allocation: this.capitalAllocator.getCurrentAllocation(), // allocation

      // 相关性分析 / Correlation analysis
      correlation: { // correlation
        matrix: this.correlationAnalyzer.correlationMatrix, // matrix
        lowCorrelationPairs: this.correlationAnalyzer.findLowCorrelationPairs(), // 最低CorrelationPairs
        highCorrelationPairs: this.correlationAnalyzer.findHighCorrelationPairs(), // 最高CorrelationPairs
      }, // 结束代码块

      // 风险状态 / Risk status
      risk: this.portfolioRiskManager.getStatus(), // 风险风险状态

      // 权益曲线 (最近100个点) / Equity curve (last 100 points)
      equityCurve: this.equityCurve.slice(-100), // 权益曲线 (最近100个点)
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取组合状态
   * Get portfolio status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      status: this.status, // 状态
      strategyCount: this.strategies.size, // 策略数量
      strategies: [...this.strategies.keys()], // 策略
      statistics: this.statistics, // statistics
      config: { // 配置
        totalCapital: this.config.totalCapital, // 总资金
        allocationMethod: this.config.allocationMethod, // allocationMethod
        maxPortfolioDrawdown: this.config.maxPortfolioDrawdown, // 最大Portfolio回撤
        maxTotalPositionRatio: this.config.maxTotalPositionRatio, // 最大总持仓比例
      }, // 结束代码块
      modules: { // modules
        correlationAnalyzer: this.correlationAnalyzer.getStatus(), // correlationAnalyzer
        capitalAllocator: this.capitalAllocator.getStatus(), // 资金Allocator
        portfolioRiskManager: this.portfolioRiskManager.getStatus(), // portfolio风险Manager
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 事件绑定 / Event Binding
  // ============================================

  /**
   * 绑定事件
   * Bind events
   * @private
   */
  _bindEvents() { // 调用 _bindEvents
    // 相关性分析器事件 / Correlation analyzer events
    this.correlationAnalyzer.on('highCorrelationWarning', (data) => { // 访问 correlationAnalyzer
      this.log(`高相关性警告: ${data.pairs.length}对策略 / High correlation warning: ${data.pairs.length} pairs`, 'warn'); // 调用 log
      this.emit('highCorrelationWarning', data); // 调用 emit
    }); // 结束代码块

    // 资金分配器事件 / Capital allocator events
    this.capitalAllocator.on('rebalanced', (data) => { // 访问 capitalAllocator
      this.log('资金分配器触发再平衡 / Capital allocator triggered rebalance', 'info'); // 调用 log
      this.emit('allocationRebalanced', data); // 调用 emit
    }); // 结束代码块

    // 组合风控管理器事件 / Portfolio risk manager events
    this.portfolioRiskManager.on('emergencyClose', (data) => { // 访问 portfolioRiskManager
      this.status = PORTFOLIO_STATUS.EMERGENCY; // 设置 status
      this.log(`🚨 紧急平仓: ${data.message}`, 'error'); // 调用 log
      this.emit('emergencyClose', data); // 调用 emit
    }); // 结束代码块

    this.portfolioRiskManager.on('tradingPaused', (data) => { // 访问 portfolioRiskManager
      this.status = PORTFOLIO_STATUS.PAUSED; // 设置 status
      this.emit('tradingPaused', data); // 调用 emit
    }); // 结束代码块

    this.portfolioRiskManager.on('tradingResumed', (data) => { // 访问 portfolioRiskManager
      if (this.status === PORTFOLIO_STATUS.PAUSED) { // 条件判断 this.status === PORTFOLIO_STATUS.PAUSED
        this.status = PORTFOLIO_STATUS.RUNNING; // 设置 status
      } // 结束代码块
      this.emit('tradingResumed', data); // 调用 emit
    }); // 结束代码块

    this.portfolioRiskManager.on('riskLevelChanged', (data) => { // 访问 portfolioRiskManager
      this.log(`风险级别变更: ${data.previousLevel} -> ${data.currentLevel}`, 'info'); // 调用 log
      this.emit('riskLevelChanged', data); // 调用 emit
    }); // 结束代码块

    this.portfolioRiskManager.on('alert', (data) => { // 访问 portfolioRiskManager
      this.emit('riskAlert', data); // 调用 emit
    }); // 结束代码块

    this.portfolioRiskManager.on('rebalanceTriggered', (data) => { // 访问 portfolioRiskManager
      if (this.config.autoRebalance) { // 条件判断 this.config.autoRebalance
        this.rebalance('risk_triggered'); // 调用 rebalance
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 绑定策略事件
   * Bind strategy events
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} strategyInstance - 策略实例 / Strategy instance
   * @private
   */
  _bindStrategyEvents(strategyId, strategyInstance) { // 调用 _bindStrategyEvents
    if (!strategyInstance || !strategyInstance.on) { // 条件判断 !strategyInstance || !strategyInstance.on
      return; // 返回结果
    } // 结束代码块

    // 监听策略信号 / Listen to strategy signals
    strategyInstance.on('signal', (signal) => { // 注册事件监听
      // 检查订单 / Check order
      const check = this.checkOrder({ // 定义常量 check
        strategyId, // 执行语句
        ...signal, // 展开对象或数组
      }); // 结束代码块

      if (!check.allowed) { // 条件判断 !check.allowed
        this.log(`策略 ${strategyId} 信号被风控拒绝: ${check.reasons.join(', ')}`, 'warn'); // 调用 log
        this.emit('signalRejected', { strategyId, signal, check }); // 调用 emit
        return; // 返回结果
      } // 结束代码块

      if (check.warnings.length > 0) { // 条件判断 check.warnings.length > 0
        this.log(`策略 ${strategyId} 信号警告: ${check.warnings.join(', ')}`, 'warn'); // 调用 log
      } // 结束代码块

      this.emit('signalApproved', { strategyId, signal, check }); // 调用 emit
    }); // 结束代码块

    // 监听策略状态更新 / Listen to strategy state updates
    strategyInstance.on('stateUpdate', (state) => { // 注册事件监听
      this.updateStrategyState(strategyId, state); // 调用 updateStrategyState
    }); // 结束代码块

    // 监听策略交易 / Listen to strategy trades
    strategyInstance.on('trade', (trade) => { // 注册事件监听
      this.recordTrade(strategyId, trade); // 调用 recordTrade
    }); // 结束代码块
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
      default: // 默认
        console.log(fullMessage); // 控制台输出
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { PORTFOLIO_STATUS, DEFAULT_CONFIG }; // 导出命名成员
export default PortfolioManager; // 默认导出
