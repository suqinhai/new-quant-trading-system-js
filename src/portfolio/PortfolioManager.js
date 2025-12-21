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

import EventEmitter from 'eventemitter3';

// 导入核心模块 / Import core modules
import { CorrelationAnalyzer } from '../analytics/CorrelationAnalyzer.js';
import { CapitalAllocator, ALLOCATION_METHOD } from '../capital/CapitalAllocator.js';
import { PortfolioRiskManager, PORTFOLIO_RISK_LEVEL } from '../risk/PortfolioRiskManager.js';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 组合状态
 * Portfolio status
 */
const PORTFOLIO_STATUS = {
  INITIALIZING: 'initializing',   // 初始化中 / Initializing
  RUNNING: 'running',             // 运行中 / Running
  PAUSED: 'paused',               // 已暂停 / Paused
  REBALANCING: 'rebalancing',     // 再平衡中 / Rebalancing
  EMERGENCY: 'emergency',         // 紧急状态 / Emergency
  STOPPED: 'stopped',             // 已停止 / Stopped
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 组合配置 / Portfolio Configuration
  // ============================================

  // 总资金 / Total capital
  totalCapital: 100000,

  // 默认资金分配方法 / Default allocation method
  allocationMethod: ALLOCATION_METHOD.RISK_PARITY,

  // 自动再平衡 / Auto rebalancing
  autoRebalance: true,

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 24 * 60 * 60 * 1000, // 每天 / Daily

  // ============================================
  // 相关性配置 / Correlation Configuration
  // ============================================

  // 低相关性阈值 / Low correlation threshold
  lowCorrelationThreshold: 0.3,

  // 高相关性警告阈值 / High correlation warning threshold
  highCorrelationWarning: 0.7,

  // 相关性滚动窗口 / Correlation rolling window
  correlationWindow: 30,

  // ============================================
  // 风控配置 / Risk Configuration
  // ============================================

  // 最大组合回撤 / Maximum portfolio drawdown
  maxPortfolioDrawdown: 0.15,

  // 最大总仓位 / Maximum total position ratio
  maxTotalPositionRatio: 0.60,

  // 单策略最大仓位 / Maximum single strategy position
  maxSingleStrategyRatio: 0.25,

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 状态更新间隔 (毫秒) / Status update interval (ms)
  statusUpdateInterval: 10000,

  // 报告生成间隔 (毫秒) / Report generation interval (ms)
  reportInterval: 60000,

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[PortfolioMgr]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 组合管理器
 * Portfolio Manager
 */
export class PortfolioManager extends EventEmitter {
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

    // 状态 / Status
    this.status = PORTFOLIO_STATUS.STOPPED;

    // 策略列表 / Strategy list
    // 格式: { strategyId: { instance, config, state } }
    this.strategies = new Map();

    // 核心模块 / Core modules
    this.correlationAnalyzer = null;
    this.capitalAllocator = null;
    this.portfolioRiskManager = null;

    // 订单执行器引用 / Order executor reference
    this.executor = null;

    // 定时器 / Timers
    this.statusTimer = null;
    this.reportTimer = null;

    // 组合统计 / Portfolio statistics
    this.statistics = {
      totalEquity: this.config.totalCapital,
      totalPositionValue: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalTrades: 0,
      winRate: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
    };

    // 收益历史 / Returns history
    this.equityCurve = [];
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化组合管理器
   * Initialize portfolio manager
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) {
    this.status = PORTFOLIO_STATUS.INITIALIZING;
    this.log('初始化组合管理器 / Initializing portfolio manager', 'info');

    // 保存执行器引用 / Save executor reference
    this.executor = options.executor;

    // 1. 初始化相关性分析器 / Initialize correlation analyzer
    this.correlationAnalyzer = new CorrelationAnalyzer({
      rollingWindow: this.config.correlationWindow,
      lowCorrelationThreshold: this.config.lowCorrelationThreshold,
      highCorrelationWarning: this.config.highCorrelationWarning,
      verbose: this.config.verbose,
    });

    // 2. 初始化资金分配器 / Initialize capital allocator
    this.capitalAllocator = new CapitalAllocator({
      totalCapital: this.config.totalCapital,
      defaultMethod: this.config.allocationMethod,
      rebalancePeriod: this.config.rebalancePeriod,
      maxWeight: this.config.maxSingleStrategyRatio,
      verbose: this.config.verbose,
    });

    // 3. 初始化组合风控管理器 / Initialize portfolio risk manager
    this.portfolioRiskManager = new PortfolioRiskManager({
      maxPortfolioDrawdown: this.config.maxPortfolioDrawdown,
      maxTotalPositionRatio: this.config.maxTotalPositionRatio,
      maxSingleStrategyRatio: this.config.maxSingleStrategyRatio,
      verbose: this.config.verbose,
    });

    // 初始化风控管理器 / Initialize risk manager
    await this.portfolioRiskManager.init({
      correlationAnalyzer: this.correlationAnalyzer,
      capitalAllocator: this.capitalAllocator,
      executor: this.executor,
      initialEquity: this.config.totalCapital,
    });

    // 4. 绑定事件 / Bind events
    this._bindEvents();

    this.log('组合管理器初始化完成 / Portfolio manager initialized', 'info');
    this.emit('initialized');
  }

  /**
   * 启动组合管理器
   * Start portfolio manager
   */
  async start() {
    if (this.status === PORTFOLIO_STATUS.RUNNING) {
      return;
    }

    this.log('启动组合管理器 / Starting portfolio manager', 'info');

    // 启动核心模块 / Start core modules
    this.correlationAnalyzer.start();
    this.capitalAllocator.start();
    this.portfolioRiskManager.start();

    // 启动状态更新定时器 / Start status update timer
    this.statusTimer = setInterval(
      () => this._updateStatus(),
      this.config.statusUpdateInterval
    );

    // 启动报告生成定时器 / Start report generation timer
    this.reportTimer = setInterval(
      () => this._generateReport(),
      this.config.reportInterval
    );

    this.status = PORTFOLIO_STATUS.RUNNING;

    this.log('组合管理器已启动 / Portfolio manager started', 'info');
    this.emit('started');
  }

  /**
   * 停止组合管理器
   * Stop portfolio manager
   */
  async stop() {
    if (this.status === PORTFOLIO_STATUS.STOPPED) {
      return;
    }

    this.log('停止组合管理器 / Stopping portfolio manager', 'info');

    // 停止定时器 / Stop timers
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }

    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    // 停止核心模块 / Stop core modules
    this.correlationAnalyzer.stop();
    this.capitalAllocator.stop();
    this.portfolioRiskManager.stop();

    this.status = PORTFOLIO_STATUS.STOPPED;

    this.log('组合管理器已停止 / Portfolio manager stopped', 'info');
    this.emit('stopped');
  }

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
  addStrategy(strategyId, strategyInstance, config = {}) {
    if (this.strategies.has(strategyId)) {
      this.log(`策略已存在: ${strategyId} / Strategy already exists: ${strategyId}`, 'warn');
      return;
    }

    // 添加到策略列表 / Add to strategy list
    this.strategies.set(strategyId, {
      instance: strategyInstance,
      config,
      state: {
        equity: 0,
        positionValue: 0,
        positions: [],
        pnl: 0,
        trades: [],
        returns: [],
      },
    });

    // 注册到各模块 / Register to modules
    this.correlationAnalyzer.registerStrategy(strategyId, config);
    this.portfolioRiskManager.registerStrategy(strategyId, config);

    // 更新资金分配器的策略统计 / Update capital allocator strategy stats
    this.capitalAllocator.updateStrategyStats(strategyId, {
      expectedReturn: config.expectedReturn || 0.1,
      volatility: config.volatility || 0.15,
      winRate: config.winRate || 0.5,
      avgWin: config.avgWin || 1,
      avgLoss: config.avgLoss || 1,
    });

    // 绑定策略事件 / Bind strategy events
    this._bindStrategyEvents(strategyId, strategyInstance);

    this.log(`添加策略: ${strategyId} / Strategy added: ${strategyId}`, 'info');
    this.emit('strategyAdded', { strategyId, config });

    // 重新计算资金分配 / Recalculate allocation
    if (this.status === PORTFOLIO_STATUS.RUNNING) {
      this._recalculateAllocation();
    }
  }

  /**
   * 移除策略
   * Remove strategy
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   */
  removeStrategy(strategyId) {
    if (!this.strategies.has(strategyId)) {
      return;
    }

    // 从策略列表移除 / Remove from strategy list
    this.strategies.delete(strategyId);

    // 从各模块移除 / Remove from modules
    this.correlationAnalyzer.removeStrategy(strategyId);

    this.log(`移除策略: ${strategyId} / Strategy removed: ${strategyId}`, 'info');
    this.emit('strategyRemoved', { strategyId });

    // 重新计算资金分配 / Recalculate allocation
    if (this.status === PORTFOLIO_STATUS.RUNNING) {
      this._recalculateAllocation();
    }
  }

  /**
   * 更新策略状态
   * Update strategy state
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} state - 状态数据 / State data
   */
  updateStrategyState(strategyId, state) {
    const strategy = this.strategies.get(strategyId);

    if (!strategy) {
      return;
    }

    // 更新策略状态 / Update strategy state
    strategy.state = { ...strategy.state, ...state };

    // 同步到风控管理器 / Sync to risk manager
    this.portfolioRiskManager.updateStrategyState(strategyId, state);

    // 如果有收益数据，记录到相关性分析器 / If has return data, record to correlation analyzer
    if (state.dailyReturn !== undefined) {
      this.correlationAnalyzer.recordReturn(
        strategyId,
        state.dailyReturn,
        state.equity
      );
    }

    // 更新资金分配器的策略统计 / Update capital allocator stats
    if (state.winRate !== undefined || state.volatility !== undefined) {
      this.capitalAllocator.updateStrategyStats(strategyId, {
        winRate: state.winRate,
        volatility: state.volatility,
        expectedReturn: state.expectedReturn,
        avgWin: state.avgWin,
        avgLoss: state.avgLoss,
      });
    }
  }

  /**
   * 记录策略交易
   * Record strategy trade
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} trade - 交易记录 / Trade record
   */
  recordTrade(strategyId, trade) {
    const strategy = this.strategies.get(strategyId);

    if (!strategy) {
      return;
    }

    // 添加到交易历史 / Add to trade history
    strategy.state.trades.push({
      ...trade,
      timestamp: trade.timestamp || Date.now(),
    });

    // 更新统计 / Update statistics
    this.statistics.totalTrades++;

    if (trade.pnl > 0) {
      this.statistics.winRate =
        (this.statistics.winRate * (this.statistics.totalTrades - 1) + 1) /
        this.statistics.totalTrades;
    } else {
      this.statistics.winRate =
        (this.statistics.winRate * (this.statistics.totalTrades - 1)) /
        this.statistics.totalTrades;
    }

    this.emit('tradeRecorded', { strategyId, trade });
  }

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
  getAllocation(method = null) {
    // 更新协方差矩阵 / Update covariance matrix
    const covMatrix = this.correlationAnalyzer.buildCovarianceMatrix();
    this.capitalAllocator.setCovarianceMatrix(covMatrix);

    // 更新相关性矩阵 / Update correlation matrix
    const corrMatrix = this.correlationAnalyzer.buildCorrelationMatrix();
    this.capitalAllocator.setCorrelationMatrix(corrMatrix);

    // 计算分配 / Calculate allocation
    return this.capitalAllocator.calculateAllocation(method);
  }

  /**
   * 执行再平衡
   * Execute rebalancing
   *
   * @param {string} reason - 原因 / Reason
   * @returns {Object} 再平衡结果 / Rebalance result
   */
  async rebalance(reason = 'manual') {
    this.status = PORTFOLIO_STATUS.REBALANCING;
    this.log(`执行再平衡: ${reason} / Executing rebalance: ${reason}`, 'info');

    try {
      // 获取当前分配 / Get current allocation
      const currentAllocation = this.capitalAllocator.getCurrentAllocation();

      // 计算新分配 / Calculate new allocation
      const newAllocation = this.getAllocation();

      // 计算调整 / Calculate adjustments
      const adjustments = [];

      for (const [strategyId, newWeight] of Object.entries(newAllocation.weights)) {
        const currentWeight = currentAllocation.weights[strategyId] || 0;
        const change = newWeight - currentWeight;

        if (Math.abs(change) > 0.01) { // 大于1%的变化才执行
          adjustments.push({
            strategyId,
            currentWeight,
            newWeight,
            change,
            amount: change * this.config.totalCapital,
          });
        }
      }

      // 执行再平衡 / Execute rebalance
      const result = this.capitalAllocator.rebalance(reason);

      // 通知各策略新的资金分配 / Notify strategies of new allocation
      for (const [strategyId, alloc] of Object.entries(result.allocation.allocations)) {
        const strategy = this.strategies.get(strategyId);
        if (strategy && strategy.instance && strategy.instance.onAllocationChange) {
          strategy.instance.onAllocationChange(alloc);
        }
      }

      this.status = PORTFOLIO_STATUS.RUNNING;

      this.log(`再平衡完成 / Rebalance completed`, 'info');
      this.emit('rebalanced', { reason, result, adjustments });

      return { result, adjustments };

    } catch (error) {
      this.status = PORTFOLIO_STATUS.RUNNING;
      this.log(`再平衡失败: ${error.message} / Rebalance failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 重新计算资金分配
   * Recalculate allocation
   * @private
   */
  _recalculateAllocation() {
    if (this.strategies.size < 1) {
      return;
    }

    const allocation = this.getAllocation();

    this.log(`资金分配更新 / Allocation updated: ${JSON.stringify(allocation.weights)}`, 'info');
    this.emit('allocationUpdated', allocation);
  }

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
  checkOrder(order) {
    return this.portfolioRiskManager.checkOrder(order);
  }

  /**
   * 获取风险状态
   * Get risk status
   *
   * @returns {Object} 风险状态 / Risk status
   */
  getRiskStatus() {
    return this.portfolioRiskManager.getStatus();
  }

  /**
   * 暂停交易
   * Pause trading
   *
   * @param {string} reason - 原因 / Reason
   */
  pauseTrading(reason = '手动暂停') {
    this.status = PORTFOLIO_STATUS.PAUSED;
    this.portfolioRiskManager.pauseTrading(reason);

    this.log(`交易已暂停: ${reason} / Trading paused: ${reason}`, 'warn');
    this.emit('tradingPaused', { reason });
  }

  /**
   * 恢复交易
   * Resume trading
   */
  resumeTrading() {
    this.status = PORTFOLIO_STATUS.RUNNING;
    this.portfolioRiskManager.resumeTrading();

    this.log('交易已恢复 / Trading resumed', 'info');
    this.emit('tradingResumed');
  }

  // ============================================
  // 相关性分析 / Correlation Analysis
  // ============================================

  /**
   * 获取相关性矩阵
   * Get correlation matrix
   *
   * @returns {Object} 相关性矩阵 / Correlation matrix
   */
  getCorrelationMatrix() {
    return this.correlationAnalyzer.buildCorrelationMatrix();
  }

  /**
   * 获取低相关策略组合
   * Get low correlation strategy pairs
   *
   * @returns {Array} 低相关策略对 / Low correlation pairs
   */
  getLowCorrelationPairs() {
    return this.correlationAnalyzer.findLowCorrelationPairs();
  }

  /**
   * 获取最优策略组合
   * Get optimal strategy combination
   *
   * @param {number} count - 策略数量 / Strategy count
   * @returns {Object} 最优组合 / Optimal combination
   */
  getOptimalCombination(count = 3) {
    return this.correlationAnalyzer.getOptimalCombination(count);
  }

  /**
   * 获取相关性分析报告
   * Get correlation analysis report
   *
   * @returns {Object} 分析报告 / Analysis report
   */
  getCorrelationReport() {
    return this.correlationAnalyzer.getAnalysisReport();
  }

  // ============================================
  // 监控和报告 / Monitoring and Reporting
  // ============================================

  /**
   * 更新状态
   * Update status
   * @private
   */
  _updateStatus() {
    // 汇总所有策略状态 / Aggregate all strategy states
    let totalEquity = 0;
    let totalPositionValue = 0;
    let totalPnL = 0;

    for (const [, strategy] of this.strategies) {
      totalEquity += strategy.state.equity || 0;
      totalPositionValue += strategy.state.positionValue || 0;
      totalPnL += strategy.state.pnl || 0;
    }

    // 更新统计 / Update statistics
    this.statistics.totalEquity = totalEquity || this.config.totalCapital;
    this.statistics.totalPositionValue = totalPositionValue;
    this.statistics.realizedPnL = totalPnL;

    // 更新风控管理器 / Update risk manager
    this.portfolioRiskManager.updateTotalEquity(this.statistics.totalEquity);

    // 记录权益曲线 / Record equity curve
    this.equityCurve.push({
      timestamp: Date.now(),
      equity: this.statistics.totalEquity,
      positionValue: totalPositionValue,
    });

    // 限制历史长度 / Limit history length
    if (this.equityCurve.length > 10000) {
      this.equityCurve = this.equityCurve.slice(-10000);
    }

    // 为每个策略更新权益曲线 / Update equity curve for each strategy
    for (const [strategyId, strategy] of this.strategies) {
      if (strategy.state.equity) {
        this.correlationAnalyzer.recordReturn(
          strategyId,
          strategy.state.dailyReturn || 0,
          strategy.state.equity
        );
      }
    }

    this.emit('statusUpdated', this.statistics);
  }

  /**
   * 生成报告
   * Generate report
   * @private
   */
  _generateReport() {
    const report = this.getFullReport();

    this.log('生成组合报告 / Generating portfolio report', 'info');
    this.emit('reportGenerated', report);
  }

  /**
   * 获取完整报告
   * Get full report
   *
   * @returns {Object} 完整报告 / Full report
   */
  getFullReport() {
    return {
      timestamp: Date.now(),
      status: this.status,

      // 组合概览 / Portfolio overview
      portfolio: {
        totalCapital: this.config.totalCapital,
        totalEquity: this.statistics.totalEquity,
        totalPositionValue: this.statistics.totalPositionValue,
        positionRatio: this.statistics.totalPositionValue / this.statistics.totalEquity,
        realizedPnL: this.statistics.realizedPnL,
        totalReturn: (this.statistics.totalEquity - this.config.totalCapital) / this.config.totalCapital,
      },

      // 策略概览 / Strategy overview
      strategies: Object.fromEntries(
        [...this.strategies].map(([id, s]) => [id, {
          equity: s.state.equity,
          positionValue: s.state.positionValue,
          pnl: s.state.pnl,
          trades: s.state.trades.length,
        }])
      ),

      // 资金分配 / Capital allocation
      allocation: this.capitalAllocator.getCurrentAllocation(),

      // 相关性分析 / Correlation analysis
      correlation: {
        matrix: this.correlationAnalyzer.correlationMatrix,
        lowCorrelationPairs: this.correlationAnalyzer.findLowCorrelationPairs(),
        highCorrelationPairs: this.correlationAnalyzer.findHighCorrelationPairs(),
      },

      // 风险状态 / Risk status
      risk: this.portfolioRiskManager.getStatus(),

      // 权益曲线 (最近100个点) / Equity curve (last 100 points)
      equityCurve: this.equityCurve.slice(-100),
    };
  }

  /**
   * 获取组合状态
   * Get portfolio status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    return {
      status: this.status,
      strategyCount: this.strategies.size,
      strategies: [...this.strategies.keys()],
      statistics: this.statistics,
      config: {
        totalCapital: this.config.totalCapital,
        allocationMethod: this.config.allocationMethod,
        maxPortfolioDrawdown: this.config.maxPortfolioDrawdown,
        maxTotalPositionRatio: this.config.maxTotalPositionRatio,
      },
      modules: {
        correlationAnalyzer: this.correlationAnalyzer.getStatus(),
        capitalAllocator: this.capitalAllocator.getStatus(),
        portfolioRiskManager: this.portfolioRiskManager.getStatus(),
      },
    };
  }

  // ============================================
  // 事件绑定 / Event Binding
  // ============================================

  /**
   * 绑定事件
   * Bind events
   * @private
   */
  _bindEvents() {
    // 相关性分析器事件 / Correlation analyzer events
    this.correlationAnalyzer.on('highCorrelationWarning', (data) => {
      this.log(`高相关性警告: ${data.pairs.length}对策略 / High correlation warning: ${data.pairs.length} pairs`, 'warn');
      this.emit('highCorrelationWarning', data);
    });

    // 资金分配器事件 / Capital allocator events
    this.capitalAllocator.on('rebalanced', (data) => {
      this.log('资金分配器触发再平衡 / Capital allocator triggered rebalance', 'info');
      this.emit('allocationRebalanced', data);
    });

    // 组合风控管理器事件 / Portfolio risk manager events
    this.portfolioRiskManager.on('emergencyClose', (data) => {
      this.status = PORTFOLIO_STATUS.EMERGENCY;
      this.log(`🚨 紧急平仓: ${data.message}`, 'error');
      this.emit('emergencyClose', data);
    });

    this.portfolioRiskManager.on('tradingPaused', (data) => {
      this.status = PORTFOLIO_STATUS.PAUSED;
      this.emit('tradingPaused', data);
    });

    this.portfolioRiskManager.on('tradingResumed', (data) => {
      if (this.status === PORTFOLIO_STATUS.PAUSED) {
        this.status = PORTFOLIO_STATUS.RUNNING;
      }
      this.emit('tradingResumed', data);
    });

    this.portfolioRiskManager.on('riskLevelChanged', (data) => {
      this.log(`风险级别变更: ${data.previousLevel} -> ${data.currentLevel}`, 'info');
      this.emit('riskLevelChanged', data);
    });

    this.portfolioRiskManager.on('alert', (data) => {
      this.emit('riskAlert', data);
    });

    this.portfolioRiskManager.on('rebalanceTriggered', (data) => {
      if (this.config.autoRebalance) {
        this.rebalance('risk_triggered');
      }
    });
  }

  /**
   * 绑定策略事件
   * Bind strategy events
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} strategyInstance - 策略实例 / Strategy instance
   * @private
   */
  _bindStrategyEvents(strategyId, strategyInstance) {
    if (!strategyInstance || !strategyInstance.on) {
      return;
    }

    // 监听策略信号 / Listen to strategy signals
    strategyInstance.on('signal', (signal) => {
      // 检查订单 / Check order
      const check = this.checkOrder({
        strategyId,
        ...signal,
      });

      if (!check.allowed) {
        this.log(`策略 ${strategyId} 信号被风控拒绝: ${check.reasons.join(', ')}`, 'warn');
        this.emit('signalRejected', { strategyId, signal, check });
        return;
      }

      if (check.warnings.length > 0) {
        this.log(`策略 ${strategyId} 信号警告: ${check.warnings.join(', ')}`, 'warn');
      }

      this.emit('signalApproved', { strategyId, signal, check });
    });

    // 监听策略状态更新 / Listen to strategy state updates
    strategyInstance.on('stateUpdate', (state) => {
      this.updateStrategyState(strategyId, state);
    });

    // 监听策略交易 / Listen to strategy trades
    strategyInstance.on('trade', (trade) => {
      this.recordTrade(strategyId, trade);
    });
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

export { PORTFOLIO_STATUS, DEFAULT_CONFIG };
export default PortfolioManager;
