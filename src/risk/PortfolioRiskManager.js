/**
 * 组合风控管理器
 * Portfolio Risk Manager
 *
 * 功能 / Features:
 * 1. 全局仓位监控 / Global position monitoring
 * 2. 组合回撤控制 / Portfolio drawdown control
 * 3. 策略间风险预算分配 / Risk budget allocation between strategies
 * 4. 相关性风险监控 / Correlation risk monitoring
 * 5. 动态去风险机制 / Dynamic de-risking mechanism
 * 6. 紧急状态处理 / Emergency state handling
 * 7. VaR和CVaR计算 / VaR and CVaR calculation
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

import EventEmitter from 'eventemitter3';
import Decimal from 'decimal.js';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 组合风险级别
 * Portfolio risk level
 */
const PORTFOLIO_RISK_LEVEL = {
  SAFE: 'safe',               // 安全 / Safe
  NORMAL: 'normal',           // 正常 / Normal
  ELEVATED: 'elevated',       // 升高 / Elevated
  HIGH: 'high',               // 高 / High
  CRITICAL: 'critical',       // 严重 / Critical
  EMERGENCY: 'emergency',     // 紧急 / Emergency
};

/**
 * 风控动作
 * Risk control action
 */
const RISK_ACTION = {
  NONE: 'none',                         // 无动作 / No action
  ALERT: 'alert',                       // 警报 / Alert
  REDUCE_EXPOSURE: 'reduce_exposure',   // 降低敞口 / Reduce exposure
  PAUSE_NEW_TRADES: 'pause_new_trades', // 暂停新开仓 / Pause new trades
  REDUCE_ALL: 'reduce_all',             // 全面减仓 / Reduce all positions
  EMERGENCY_CLOSE: 'emergency_close',   // 紧急平仓 / Emergency close
  REBALANCE: 'rebalance',               // 再平衡 / Rebalance
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 全局仓位限制 / Global Position Limits
  // ============================================

  // 最大总仓位比例 / Maximum total position ratio
  maxTotalPositionRatio: 0.60,

  // 仓位警告阈值 / Position warning threshold
  positionWarningRatio: 0.50,

  // 单策略最大仓位比例 / Maximum single strategy position ratio
  maxSingleStrategyRatio: 0.25,

  // 最大持仓数量 / Maximum number of positions
  maxPositionCount: 10,

  // ============================================
  // 组合回撤限制 / Portfolio Drawdown Limits
  // ============================================

  // 组合最大回撤 / Maximum portfolio drawdown
  maxPortfolioDrawdown: 0.15,

  // 回撤警告阈值 / Drawdown warning threshold
  drawdownWarningThreshold: 0.10,

  // 单日最大回撤 / Maximum daily drawdown
  maxDailyDrawdown: 0.05,

  // 单周最大回撤 / Maximum weekly drawdown
  maxWeeklyDrawdown: 0.10,

  // ============================================
  // 相关性风险限制 / Correlation Risk Limits
  // ============================================

  // 高相关性警告阈值 / High correlation warning threshold
  highCorrelationThreshold: 0.70,

  // 高相关策略对最大数量 / Maximum high correlation pairs
  maxHighCorrelationPairs: 2,

  // 相关性突变检测阈值 / Correlation regime change threshold
  correlationChangeThreshold: 0.30,

  // ============================================
  // VaR配置 / VaR Configuration
  // ============================================

  // VaR置信水平 / VaR confidence level
  varConfidenceLevel: 0.95,

  // VaR限制 (占总资金比例) / VaR limit (as ratio of total capital)
  maxVaR: 0.05,

  // CVaR限制 / CVaR limit
  maxCVaR: 0.08,

  // ============================================
  // 去风险配置 / De-risking Configuration
  // ============================================

  // 自动去风险启用 / Enable auto de-risking
  enableAutoDeRisk: true,

  // 去风险比例 / De-risk ratio
  deRiskRatio: 0.30,

  // 去风险冷却时间 (毫秒) / De-risk cooldown (ms)
  deRiskCooldown: 30 * 60 * 1000, // 30分钟 / 30 minutes

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 检查间隔 (毫秒) / Check interval (ms)
  checkInterval: 5000,

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[PortfolioRiskMgr]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 组合风控管理器
 * Portfolio Risk Manager
 */
export class PortfolioRiskManager extends EventEmitter {
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

    // 策略风控状态 / Strategy risk states
    // 格式: { strategyId: { positions, equity, allocation, riskBudget, ... } }
    this.strategyStates = new Map();

    // 组合状态 / Portfolio state
    this.portfolioState = {
      totalEquity: 0,
      totalPositionValue: 0,
      positionRatio: 0,
      peakEquity: 0,
      currentDrawdown: 0,
      dailyStartEquity: 0,
      dailyDrawdown: 0,
      weeklyStartEquity: 0,
      weeklyDrawdown: 0,
      riskLevel: PORTFOLIO_RISK_LEVEL.NORMAL,
      tradingAllowed: true,
      pauseReason: null,
    };

    // 风险预算 / Risk budgets
    // 格式: { strategyId: { budget, used, remaining } }
    this.riskBudgets = new Map();

    // 相关性分析器引用 / Correlation analyzer reference
    this.correlationAnalyzer = null;

    // 资金分配器引用 / Capital allocator reference
    this.capitalAllocator = null;

    // 订单执行器引用 / Order executor reference
    this.executor = null;

    // 风控触发历史 / Risk trigger history
    this.riskHistory = [];

    // 最后去风险时间 / Last de-risk time
    this.lastDeRiskTime = 0;

    // 定时器 / Timer
    this.checkTimer = null;

    // 运行状态 / Running state
    this.running = false;
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化风控管理器
   * Initialize risk manager
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) {
    const {
      correlationAnalyzer,
      capitalAllocator,
      executor,
      initialEquity,
    } = options;

    // 保存引用 / Save references
    this.correlationAnalyzer = correlationAnalyzer;
    this.capitalAllocator = capitalAllocator;
    this.executor = executor;

    // 初始化组合状态 / Initialize portfolio state
    if (initialEquity) {
      this.portfolioState.totalEquity = initialEquity;
      this.portfolioState.peakEquity = initialEquity;
      this.portfolioState.dailyStartEquity = initialEquity;
      this.portfolioState.weeklyStartEquity = initialEquity;
    }

    this.log('组合风控管理器初始化完成 / Portfolio risk manager initialized', 'info');
  }

  /**
   * 启动风控管理器
   * Start risk manager
   */
  start() {
    if (this.running) return;

    this.running = true;

    // 启动定时检查 / Start periodic check
    this.checkTimer = setInterval(
      () => this._performRiskCheck(),
      this.config.checkInterval
    );

    this.log('组合风控管理器已启动 / Portfolio risk manager started', 'info');
    this.emit('started');
  }

  /**
   * 停止风控管理器
   * Stop risk manager
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.log('组合风控管理器已停止 / Portfolio risk manager stopped', 'info');
    this.emit('stopped');
  }

  // ============================================
  // 策略注册 / Strategy Registration
  // ============================================

  /**
   * 注册策略
   * Register strategy
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} config - 策略配置 / Strategy config
   */
  registerStrategy(strategyId, config = {}) {
    this.strategyStates.set(strategyId, {
      id: strategyId,
      positions: [],
      positionValue: 0,
      equity: 0,
      allocation: config.allocation || 0,
      riskBudget: config.riskBudget || 0,
      dailyPnL: 0,
      tradingAllowed: true,
      registeredAt: Date.now(),
    });

    // 初始化风险预算 / Initialize risk budget
    this.riskBudgets.set(strategyId, {
      budget: config.riskBudget || this.portfolioState.totalEquity * 0.1,
      used: 0,
      remaining: config.riskBudget || this.portfolioState.totalEquity * 0.1,
    });

    this.log(`注册策略: ${strategyId} / Strategy registered: ${strategyId}`, 'info');
    this.emit('strategyRegistered', { strategyId, config });
  }

  /**
   * 更新策略状态
   * Update strategy state
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} state - 状态数据 / State data
   */
  updateStrategyState(strategyId, state) {
    const existing = this.strategyStates.get(strategyId);

    if (!existing) {
      this.registerStrategy(strategyId);
    }

    this.strategyStates.set(strategyId, {
      ...existing,
      ...state,
      updatedAt: Date.now(),
    });

    // 更新组合状态 / Update portfolio state
    this._updatePortfolioState();
  }

  // ============================================
  // 订单检查 / Order Checking
  // ============================================

  /**
   * 检查订单是否允许
   * Check if order is allowed
   *
   * @param {Object} order - 订单信息 / Order info
   * @returns {Object} 检查结果 / Check result
   */
  checkOrder(order) {
    const { strategyId, symbol, side, amount, price } = order;
    const orderValue = amount * price;

    const result = {
      allowed: true,
      reasons: [],
      warnings: [],
      riskLevel: this.portfolioState.riskLevel,
    };

    // 1. 检查组合交易状态 / Check portfolio trading status
    if (!this.portfolioState.tradingAllowed) {
      result.allowed = false;
      result.reasons.push(`组合交易已暂停: ${this.portfolioState.pauseReason}`);
      return result;
    }

    // 2. 检查策略交易状态 / Check strategy trading status
    const strategyState = this.strategyStates.get(strategyId);
    if (strategyState && !strategyState.tradingAllowed) {
      result.allowed = false;
      result.reasons.push(`策略 ${strategyId} 交易已暂停`);
      return result;
    }

    // 3. 检查全局仓位限制 / Check global position limit
    const newTotalPosition = this.portfolioState.totalPositionValue + orderValue;
    const newPositionRatio = newTotalPosition / this.portfolioState.totalEquity;

    if (newPositionRatio > this.config.maxTotalPositionRatio) {
      result.allowed = false;
      result.reasons.push(
        `超过全局仓位限制: ${(newPositionRatio * 100).toFixed(1)}% > ${(this.config.maxTotalPositionRatio * 100).toFixed(1)}%`
      );
    } else if (newPositionRatio > this.config.positionWarningRatio) {
      result.warnings.push(
        `接近全局仓位限制: ${(newPositionRatio * 100).toFixed(1)}%`
      );
    }

    // 4. 检查单策略仓位限制 / Check single strategy position limit
    if (strategyState) {
      const newStrategyPosition = strategyState.positionValue + orderValue;
      const strategyRatio = newStrategyPosition / this.portfolioState.totalEquity;

      if (strategyRatio > this.config.maxSingleStrategyRatio) {
        result.allowed = false;
        result.reasons.push(
          `策略 ${strategyId} 超过单策略仓位限制: ${(strategyRatio * 100).toFixed(1)}% > ${(this.config.maxSingleStrategyRatio * 100).toFixed(1)}%`
        );
      }
    }

    // 5. 检查风险预算 / Check risk budget
    const budget = this.riskBudgets.get(strategyId);
    if (budget) {
      const riskAmount = orderValue * 0.02; // 假设2%风险 / Assume 2% risk
      if (riskAmount > budget.remaining) {
        result.allowed = false;
        result.reasons.push(
          `策略 ${strategyId} 风险预算不足: 需要 ${riskAmount.toFixed(2)}, 剩余 ${budget.remaining.toFixed(2)}`
        );
      }
    }

    // 6. 检查回撤状态 / Check drawdown status
    if (this.portfolioState.currentDrawdown > this.config.drawdownWarningThreshold) {
      result.warnings.push(
        `当前组合回撤较高: ${(this.portfolioState.currentDrawdown * 100).toFixed(2)}%`
      );
    }

    // 7. 检查风险级别 / Check risk level
    if (this.portfolioState.riskLevel === PORTFOLIO_RISK_LEVEL.HIGH ||
        this.portfolioState.riskLevel === PORTFOLIO_RISK_LEVEL.CRITICAL) {
      result.warnings.push(`当前风险级别: ${this.portfolioState.riskLevel}`);

      // 高风险时减少订单量 / Reduce order size in high risk
      if (this.portfolioState.riskLevel === PORTFOLIO_RISK_LEVEL.CRITICAL) {
        result.suggestedReduction = 0.5;
        result.warnings.push('建议减少50%订单量 / Suggest reducing order size by 50%');
      }
    }

    return result;
  }

  // ============================================
  // 风控检查 / Risk Checks
  // ============================================

  /**
   * 执行风控检查
   * Perform risk check
   * @private
   */
  async _performRiskCheck() {
    if (!this.running) return;

    // 检查时间重置 / Check time resets
    this._checkTimeResets();

    // 1. 检查组合回撤 / Check portfolio drawdown
    const drawdownResult = this._checkPortfolioDrawdown();

    // 2. 检查全局仓位 / Check global position
    const positionResult = this._checkGlobalPosition();

    // 3. 检查相关性风险 / Check correlation risk
    const correlationResult = this._checkCorrelationRisk();

    // 4. 检查VaR / Check VaR
    const varResult = this._checkVaR();

    // 5. 更新风险级别 / Update risk level
    this._updateRiskLevel([drawdownResult, positionResult, correlationResult, varResult]);

    // 6. 执行风控动作 / Execute risk actions
    await this._executeRiskActions([drawdownResult, positionResult, correlationResult, varResult]);
  }

  /**
   * 检查组合回撤
   * Check portfolio drawdown
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkPortfolioDrawdown() {
    const result = {
      type: 'drawdown',
      action: RISK_ACTION.NONE,
      level: PORTFOLIO_RISK_LEVEL.NORMAL,
      details: {},
    };

    // 计算当前回撤 / Calculate current drawdown
    const { currentDrawdown, dailyDrawdown, weeklyDrawdown } = this.portfolioState;

    result.details = {
      currentDrawdown,
      dailyDrawdown,
      weeklyDrawdown,
      maxPortfolioDrawdown: this.config.maxPortfolioDrawdown,
      maxDailyDrawdown: this.config.maxDailyDrawdown,
      maxWeeklyDrawdown: this.config.maxWeeklyDrawdown,
    };

    // 检查组合最大回撤 / Check max portfolio drawdown
    if (currentDrawdown >= this.config.maxPortfolioDrawdown) {
      result.action = RISK_ACTION.EMERGENCY_CLOSE;
      result.level = PORTFOLIO_RISK_LEVEL.EMERGENCY;
      result.message = `组合回撤超限: ${(currentDrawdown * 100).toFixed(2)}% >= ${(this.config.maxPortfolioDrawdown * 100).toFixed(0)}%`;

      this.log(`⚠️ ${result.message}`, 'error');

    } else if (currentDrawdown >= this.config.drawdownWarningThreshold) {
      result.action = RISK_ACTION.REDUCE_EXPOSURE;
      result.level = PORTFOLIO_RISK_LEVEL.HIGH;
      result.message = `组合回撤警告: ${(currentDrawdown * 100).toFixed(2)}%`;

      this.log(`⚠️ ${result.message}`, 'warn');
    }

    // 检查单日回撤 / Check daily drawdown
    if (dailyDrawdown >= this.config.maxDailyDrawdown) {
      result.action = RISK_ACTION.PAUSE_NEW_TRADES;
      result.level = Math.max(result.level === PORTFOLIO_RISK_LEVEL.NORMAL ? 0 : 1, PORTFOLIO_RISK_LEVEL.HIGH);
      result.message = `单日回撤超限: ${(dailyDrawdown * 100).toFixed(2)}% >= ${(this.config.maxDailyDrawdown * 100).toFixed(0)}%`;

      this.log(`⚠️ ${result.message}`, 'error');
    }

    // 检查单周回撤 / Check weekly drawdown
    if (weeklyDrawdown >= this.config.maxWeeklyDrawdown) {
      result.action = RISK_ACTION.REDUCE_ALL;
      result.level = PORTFOLIO_RISK_LEVEL.CRITICAL;
      result.message = `单周回撤超限: ${(weeklyDrawdown * 100).toFixed(2)}% >= ${(this.config.maxWeeklyDrawdown * 100).toFixed(0)}%`;

      this.log(`⚠️ ${result.message}`, 'error');
    }

    return result;
  }

  /**
   * 检查全局仓位
   * Check global position
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkGlobalPosition() {
    const result = {
      type: 'position',
      action: RISK_ACTION.NONE,
      level: PORTFOLIO_RISK_LEVEL.NORMAL,
      details: {},
    };

    const { positionRatio, totalPositionValue, totalEquity } = this.portfolioState;

    result.details = {
      positionRatio,
      totalPositionValue,
      totalEquity,
      maxTotalPositionRatio: this.config.maxTotalPositionRatio,
    };

    if (positionRatio >= this.config.maxTotalPositionRatio) {
      result.action = RISK_ACTION.PAUSE_NEW_TRADES;
      result.level = PORTFOLIO_RISK_LEVEL.HIGH;
      result.message = `全局仓位超限: ${(positionRatio * 100).toFixed(2)}% >= ${(this.config.maxTotalPositionRatio * 100).toFixed(0)}%`;

      this.log(`⚠️ ${result.message}`, 'warn');

    } else if (positionRatio >= this.config.positionWarningRatio) {
      result.action = RISK_ACTION.ALERT;
      result.level = PORTFOLIO_RISK_LEVEL.ELEVATED;
      result.message = `全局仓位警告: ${(positionRatio * 100).toFixed(2)}%`;
    }

    // 检查持仓数量 / Check position count
    let totalPositionCount = 0;
    for (const [, state] of this.strategyStates) {
      totalPositionCount += (state.positions?.length || 0);
    }

    if (totalPositionCount > this.config.maxPositionCount) {
      result.action = RISK_ACTION.ALERT;
      result.level = PORTFOLIO_RISK_LEVEL.ELEVATED;
      result.details.positionCount = totalPositionCount;
      result.message = `持仓数量过多: ${totalPositionCount} > ${this.config.maxPositionCount}`;

      this.log(`⚠️ ${result.message}`, 'warn');
    }

    return result;
  }

  /**
   * 检查相关性风险
   * Check correlation risk
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkCorrelationRisk() {
    const result = {
      type: 'correlation',
      action: RISK_ACTION.NONE,
      level: PORTFOLIO_RISK_LEVEL.NORMAL,
      details: {},
    };

    if (!this.correlationAnalyzer) {
      return result;
    }

    // 获取高相关策略对 / Get high correlation pairs
    const highCorrPairs = this.correlationAnalyzer.findHighCorrelationPairs(
      this.config.highCorrelationThreshold
    );

    result.details = {
      highCorrelationPairs: highCorrPairs,
      threshold: this.config.highCorrelationThreshold,
    };

    if (highCorrPairs.length > this.config.maxHighCorrelationPairs) {
      result.action = RISK_ACTION.REBALANCE;
      result.level = PORTFOLIO_RISK_LEVEL.ELEVATED;
      result.message = `高相关策略对过多: ${highCorrPairs.length} > ${this.config.maxHighCorrelationPairs}`;

      this.log(`⚠️ ${result.message}`, 'warn');

      // 记录具体的高相关对 / Log specific high correlation pairs
      for (const pair of highCorrPairs) {
        this.log(`  高相关: ${pair.strategies.join(' <-> ')} = ${pair.correlation.toFixed(3)}`, 'warn');
      }
    }

    // 检测相关性突变 / Detect correlation regime change
    if (this.strategies && this.strategies.length >= 2) {
      const strategies = [...this.strategyStates.keys()];
      for (let i = 0; i < strategies.length - 1; i++) {
        for (let j = i + 1; j < strategies.length; j++) {
          const change = this.correlationAnalyzer.detectCorrelationRegimeChange(
            strategies[i],
            strategies[j],
            this.config.correlationChangeThreshold
          );

          if (change.detected) {
            result.action = RISK_ACTION.ALERT;
            result.details.regimeChange = change;
            this.log(`⚠️ 相关性突变: ${strategies[i]} - ${strategies[j]}: ${change.historicalCorrelation.toFixed(2)} -> ${change.recentCorrelation.toFixed(2)}`, 'warn');
          }
        }
      }
    }

    return result;
  }

  /**
   * 检查VaR
   * Check VaR
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkVaR() {
    const result = {
      type: 'var',
      action: RISK_ACTION.NONE,
      level: PORTFOLIO_RISK_LEVEL.NORMAL,
      details: {},
    };

    // 计算组合VaR / Calculate portfolio VaR
    const varResult = this._calculatePortfolioVaR();

    result.details = {
      var: varResult.var,
      cvar: varResult.cvar,
      maxVaR: this.config.maxVaR,
      maxCVaR: this.config.maxCVaR,
    };

    // 检查VaR限制 / Check VaR limit
    const varRatio = varResult.var / this.portfolioState.totalEquity;

    if (varRatio >= this.config.maxVaR) {
      result.action = RISK_ACTION.REDUCE_EXPOSURE;
      result.level = PORTFOLIO_RISK_LEVEL.HIGH;
      result.message = `VaR超限: ${(varRatio * 100).toFixed(2)}% >= ${(this.config.maxVaR * 100).toFixed(0)}%`;

      this.log(`⚠️ ${result.message}`, 'warn');
    }

    // 检查CVaR限制 / Check CVaR limit
    const cvarRatio = varResult.cvar / this.portfolioState.totalEquity;

    if (cvarRatio >= this.config.maxCVaR) {
      result.action = RISK_ACTION.REDUCE_ALL;
      result.level = PORTFOLIO_RISK_LEVEL.CRITICAL;
      result.message = `CVaR超限: ${(cvarRatio * 100).toFixed(2)}% >= ${(this.config.maxCVaR * 100).toFixed(0)}%`;

      this.log(`⚠️ ${result.message}`, 'error');
    }

    return result;
  }

  /**
   * 计算组合VaR
   * Calculate portfolio VaR
   *
   * @returns {Object} VaR结果 / VaR result
   * @private
   */
  _calculatePortfolioVaR() {
    // 收集策略收益数据 / Collect strategy return data
    const returns = [];

    for (const [, state] of this.strategyStates) {
      if (state.returns && state.returns.length > 0) {
        returns.push(...state.returns);
      }
    }

    if (returns.length < 10) {
      // 数据不足，使用简化估算 / Insufficient data, use simplified estimation
      const avgVolatility = 0.02; // 假设2%日波动率 / Assume 2% daily volatility
      const var95 = this.portfolioState.totalPositionValue * avgVolatility * 1.65;
      const cvar95 = var95 * 1.2;

      return { var: var95, cvar: cvar95, method: 'simplified' };
    }

    // 排序收益 / Sort returns
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const n = sortedReturns.length;

    // 计算VaR (历史模拟法) / Calculate VaR (historical simulation)
    const varIndex = Math.floor(n * (1 - this.config.varConfidenceLevel));
    const var95 = Math.abs(sortedReturns[varIndex]) * this.portfolioState.totalPositionValue;

    // 计算CVaR (条件VaR) / Calculate CVaR (Conditional VaR)
    const tailReturns = sortedReturns.slice(0, varIndex + 1);
    const cvar95 = Math.abs(tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length) *
                   this.portfolioState.totalPositionValue;

    return { var: var95, cvar: cvar95, method: 'historical' };
  }

  // ============================================
  // 风控动作执行 / Risk Action Execution
  // ============================================

  /**
   * 执行风控动作
   * Execute risk actions
   *
   * @param {Array} results - 检查结果列表 / Check results list
   * @private
   */
  async _executeRiskActions(results) {
    // 找出最严重的动作 / Find most severe action
    const actionPriority = {
      [RISK_ACTION.NONE]: 0,
      [RISK_ACTION.ALERT]: 1,
      [RISK_ACTION.REBALANCE]: 2,
      [RISK_ACTION.PAUSE_NEW_TRADES]: 3,
      [RISK_ACTION.REDUCE_EXPOSURE]: 4,
      [RISK_ACTION.REDUCE_ALL]: 5,
      [RISK_ACTION.EMERGENCY_CLOSE]: 6,
    };

    const mostSevere = results.reduce((a, b) =>
      (actionPriority[a.action] || 0) > (actionPriority[b.action] || 0) ? a : b
    );

    // 执行相应动作 / Execute corresponding action
    switch (mostSevere.action) {
      case RISK_ACTION.EMERGENCY_CLOSE:
        await this._emergencyClose(mostSevere);
        break;

      case RISK_ACTION.REDUCE_ALL:
        await this._reduceAllPositions(mostSevere);
        break;

      case RISK_ACTION.REDUCE_EXPOSURE:
        await this._reduceExposure(mostSevere);
        break;

      case RISK_ACTION.PAUSE_NEW_TRADES:
        this._pauseNewTrades(mostSevere);
        break;

      case RISK_ACTION.REBALANCE:
        this._triggerRebalance(mostSevere);
        break;

      case RISK_ACTION.ALERT:
        this._emitAlert(mostSevere);
        break;

      default:
        break;
    }
  }

  /**
   * 紧急平仓
   * Emergency close
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  async _emergencyClose(trigger) {
    this.log(`🚨 执行紧急平仓: ${trigger.message}`, 'error');

    // 暂停所有交易 / Pause all trading
    this.portfolioState.tradingAllowed = false;
    this.portfolioState.pauseReason = trigger.message;

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('emergencyClose', trigger);

    // 调用执行器平仓 / Call executor to close
    if (this.executor && typeof this.executor.emergencyCloseAll === 'function') {
      try {
        await this.executor.emergencyCloseAll();
        this.log('✓ 紧急平仓完成 / Emergency close completed', 'info');
      } catch (error) {
        this.log(`✗ 紧急平仓失败: ${error.message}`, 'error');
      }
    }

    this.emit('emergencyClose', trigger);
  }

  /**
   * 全面减仓
   * Reduce all positions
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  async _reduceAllPositions(trigger) {
    // 检查冷却时间 / Check cooldown
    if (Date.now() - this.lastDeRiskTime < this.config.deRiskCooldown) {
      this.log('去风险冷却中，跳过 / De-risk cooldown, skipping', 'info');
      return;
    }

    this.log(`📉 执行全面减仓: ${trigger.message}`, 'warn');

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('reduceAll', trigger);

    // 对每个策略执行减仓 / Reduce each strategy
    if (this.executor && this.config.enableAutoDeRisk) {
      for (const [strategyId, state] of this.strategyStates) {
        if (state.positions && state.positions.length > 0) {
          try {
            await this._reduceStrategyPositions(strategyId, this.config.deRiskRatio);
          } catch (error) {
            this.log(`减仓策略 ${strategyId} 失败: ${error.message}`, 'error');
          }
        }
      }

      this.lastDeRiskTime = Date.now();
    }

    this.emit('reduceAll', trigger);
  }

  /**
   * 降低敞口
   * Reduce exposure
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  async _reduceExposure(trigger) {
    // 检查冷却时间 / Check cooldown
    if (Date.now() - this.lastDeRiskTime < this.config.deRiskCooldown) {
      return;
    }

    this.log(`📉 降低敞口: ${trigger.message}`, 'warn');

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('reduceExposure', trigger);

    // 找出仓位最大的策略进行减仓 / Find strategy with largest position to reduce
    if (this.executor && this.config.enableAutoDeRisk) {
      let largestStrategy = null;
      let largestPosition = 0;

      for (const [strategyId, state] of this.strategyStates) {
        if (state.positionValue > largestPosition) {
          largestPosition = state.positionValue;
          largestStrategy = strategyId;
        }
      }

      if (largestStrategy) {
        try {
          await this._reduceStrategyPositions(largestStrategy, this.config.deRiskRatio / 2);
          this.lastDeRiskTime = Date.now();
        } catch (error) {
          this.log(`减仓策略 ${largestStrategy} 失败: ${error.message}`, 'error');
        }
      }
    }

    this.emit('reduceExposure', trigger);
  }

  /**
   * 减少策略仓位
   * Reduce strategy positions
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {number} ratio - 减仓比例 / Reduction ratio
   * @private
   */
  async _reduceStrategyPositions(strategyId, ratio) {
    const state = this.strategyStates.get(strategyId);
    if (!state || !state.positions) return;

    this.log(`减仓策略 ${strategyId}: ${(ratio * 100).toFixed(0)}%`, 'info');

    for (const position of state.positions) {
      const reduceAmount = Math.abs(position.size || position.amount) * ratio;

      if (reduceAmount > 0 && this.executor) {
        const closeSide = position.side === 'long' ? 'sell' : 'buy';

        try {
          await this.executor.executeMarketOrder({
            symbol: position.symbol,
            side: closeSide,
            amount: reduceAmount,
            reduceOnly: true,
          });
        } catch (error) {
          this.log(`减仓 ${position.symbol} 失败: ${error.message}`, 'error');
        }
      }
    }
  }

  /**
   * 暂停新开仓
   * Pause new trades
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  _pauseNewTrades(trigger) {
    if (!this.portfolioState.tradingAllowed) return;

    this.log(`⏸️ 暂停新开仓: ${trigger.message}`, 'warn');

    this.portfolioState.tradingAllowed = false;
    this.portfolioState.pauseReason = trigger.message;

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('pauseNewTrades', trigger);

    this.emit('tradingPaused', trigger);
  }

  /**
   * 触发再平衡
   * Trigger rebalance
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  _triggerRebalance(trigger) {
    this.log(`🔄 触发再平衡: ${trigger.message}`, 'info');

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('rebalance', trigger);

    if (this.capitalAllocator) {
      this.capitalAllocator.rebalance('risk_triggered');
    }

    this.emit('rebalanceTriggered', trigger);
  }

  /**
   * 发出警报
   * Emit alert
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  _emitAlert(trigger) {
    this.emit('alert', {
      level: trigger.level,
      type: trigger.type,
      message: trigger.message,
      details: trigger.details,
      timestamp: Date.now(),
    });
  }

  // ============================================
  // 状态更新 / State Updates
  // ============================================

  /**
   * 更新组合状态
   * Update portfolio state
   * @private
   */
  _updatePortfolioState() {
    // 计算总权益和总仓位 / Calculate total equity and position
    let totalEquity = 0;
    let totalPositionValue = 0;

    for (const [, state] of this.strategyStates) {
      totalEquity += state.equity || 0;
      totalPositionValue += state.positionValue || 0;
    }

    // 更新组合状态 / Update portfolio state
    this.portfolioState.totalEquity = totalEquity;
    this.portfolioState.totalPositionValue = totalPositionValue;
    this.portfolioState.positionRatio = totalEquity > 0
      ? totalPositionValue / totalEquity
      : 0;

    // 更新峰值权益 / Update peak equity
    if (totalEquity > this.portfolioState.peakEquity) {
      this.portfolioState.peakEquity = totalEquity;
    }

    // 计算回撤 / Calculate drawdowns
    this.portfolioState.currentDrawdown = this.portfolioState.peakEquity > 0
      ? (this.portfolioState.peakEquity - totalEquity) / this.portfolioState.peakEquity
      : 0;

    this.portfolioState.dailyDrawdown = this.portfolioState.dailyStartEquity > 0
      ? Math.max(0, (this.portfolioState.dailyStartEquity - totalEquity) / this.portfolioState.dailyStartEquity)
      : 0;

    this.portfolioState.weeklyDrawdown = this.portfolioState.weeklyStartEquity > 0
      ? Math.max(0, (this.portfolioState.weeklyStartEquity - totalEquity) / this.portfolioState.weeklyStartEquity)
      : 0;
  }

  /**
   * 更新风险级别
   * Update risk level
   *
   * @param {Array} results - 检查结果 / Check results
   * @private
   */
  _updateRiskLevel(results) {
    const levelPriority = {
      [PORTFOLIO_RISK_LEVEL.SAFE]: 0,
      [PORTFOLIO_RISK_LEVEL.NORMAL]: 1,
      [PORTFOLIO_RISK_LEVEL.ELEVATED]: 2,
      [PORTFOLIO_RISK_LEVEL.HIGH]: 3,
      [PORTFOLIO_RISK_LEVEL.CRITICAL]: 4,
      [PORTFOLIO_RISK_LEVEL.EMERGENCY]: 5,
    };

    // 找出最高风险级别 / Find highest risk level
    let highestLevel = PORTFOLIO_RISK_LEVEL.NORMAL;

    for (const result of results) {
      if ((levelPriority[result.level] || 0) > (levelPriority[highestLevel] || 0)) {
        highestLevel = result.level;
      }
    }

    // 如果风险级别变化，发出事件 / Emit event if risk level changed
    if (highestLevel !== this.portfolioState.riskLevel) {
      const previousLevel = this.portfolioState.riskLevel;
      this.portfolioState.riskLevel = highestLevel;

      this.emit('riskLevelChanged', {
        previousLevel,
        currentLevel: highestLevel,
        timestamp: Date.now(),
      });

      this.log(`风险级别变更: ${previousLevel} -> ${highestLevel}`, 'info');
    }
  }

  /**
   * 检查时间重置
   * Check time resets
   * @private
   */
  _checkTimeResets() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = dayStart - now.getDay() * 24 * 60 * 60 * 1000;

    // 检查日重置 / Check daily reset
    if (this._lastDayStart !== dayStart) {
      this._lastDayStart = dayStart;
      this.portfolioState.dailyStartEquity = this.portfolioState.totalEquity;
      this.portfolioState.dailyDrawdown = 0;

      // 恢复交易 (如果因为单日回撤暂停) / Resume trading if paused due to daily drawdown
      if (this.portfolioState.pauseReason?.includes('单日回撤')) {
        this.portfolioState.tradingAllowed = true;
        this.portfolioState.pauseReason = null;
        this.log('跨天重置: 交易已恢复 / Day reset: Trading resumed', 'info');
      }
    }

    // 检查周重置 / Check weekly reset
    if (this._lastWeekStart !== weekStart) {
      this._lastWeekStart = weekStart;
      this.portfolioState.weeklyStartEquity = this.portfolioState.totalEquity;
      this.portfolioState.weeklyDrawdown = 0;

      // 恢复交易 (如果因为单周回撤暂停) / Resume trading if paused due to weekly drawdown
      if (this.portfolioState.pauseReason?.includes('单周回撤')) {
        this.portfolioState.tradingAllowed = true;
        this.portfolioState.pauseReason = null;
        this.log('跨周重置: 交易已恢复 / Week reset: Trading resumed', 'info');
      }
    }
  }

  /**
   * 记录风控事件
   * Record risk event
   *
   * @param {string} type - 事件类型 / Event type
   * @param {Object} details - 详情 / Details
   * @private
   */
  _recordRiskEvent(type, details) {
    this.riskHistory.push({
      type,
      details,
      portfolioState: { ...this.portfolioState },
      timestamp: Date.now(),
    });

    // 限制历史长度 / Limit history length
    if (this.riskHistory.length > 200) {
      this.riskHistory = this.riskHistory.slice(-200);
    }
  }

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 手动恢复交易
   * Manual resume trading
   */
  resumeTrading() {
    this.portfolioState.tradingAllowed = true;
    this.portfolioState.pauseReason = null;

    this.log('交易已手动恢复 / Trading manually resumed', 'info');
    this.emit('tradingResumed', { reason: 'manual' });
  }

  /**
   * 手动暂停交易
   * Manual pause trading
   *
   * @param {string} reason - 原因 / Reason
   */
  pauseTrading(reason = '手动暂停') {
    this.portfolioState.tradingAllowed = false;
    this.portfolioState.pauseReason = reason;

    this.log(`交易已手动暂停: ${reason}`, 'info');
    this.emit('tradingPaused', { reason });
  }

  /**
   * 更新总权益
   * Update total equity
   *
   * @param {number} equity - 权益 / Equity
   */
  updateTotalEquity(equity) {
    this.portfolioState.totalEquity = equity;

    if (equity > this.portfolioState.peakEquity) {
      this.portfolioState.peakEquity = equity;
    }

    this._updatePortfolioState();
  }

  /**
   * 获取风控状态
   * Get risk status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    return {
      running: this.running,
      portfolioState: { ...this.portfolioState },
      strategyCount: this.strategyStates.size,
      strategies: Object.fromEntries(
        [...this.strategyStates].map(([id, state]) => [
          id,
          {
            positionValue: state.positionValue,
            equity: state.equity,
            tradingAllowed: state.tradingAllowed,
          },
        ])
      ),
      riskBudgets: Object.fromEntries(this.riskBudgets),
      recentRiskEvents: this.riskHistory.slice(-10),
      config: {
        maxTotalPositionRatio: this.config.maxTotalPositionRatio,
        maxPortfolioDrawdown: this.config.maxPortfolioDrawdown,
        maxDailyDrawdown: this.config.maxDailyDrawdown,
        highCorrelationThreshold: this.config.highCorrelationThreshold,
        maxVaR: this.config.maxVaR,
      },
    };
  }

  /**
   * 获取风险报告
   * Get risk report
   *
   * @returns {Object} 风险报告 / Risk report
   */
  getRiskReport() {
    return {
      timestamp: Date.now(),
      portfolio: {
        totalEquity: this.portfolioState.totalEquity,
        totalPositionValue: this.portfolioState.totalPositionValue,
        positionRatio: this.portfolioState.positionRatio,
        currentDrawdown: this.portfolioState.currentDrawdown,
        dailyDrawdown: this.portfolioState.dailyDrawdown,
        weeklyDrawdown: this.portfolioState.weeklyDrawdown,
        riskLevel: this.portfolioState.riskLevel,
        tradingAllowed: this.portfolioState.tradingAllowed,
      },
      var: this._calculatePortfolioVaR(),
      strategies: Object.fromEntries(this.strategyStates),
      riskBudgets: Object.fromEntries(this.riskBudgets),
      recentEvents: this.riskHistory.slice(-20),
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

export { PORTFOLIO_RISK_LEVEL, RISK_ACTION, DEFAULT_CONFIG };
export default PortfolioRiskManager;
