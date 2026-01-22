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

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import Decimal from 'decimal.js'; // 导入模块 decimal.js

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 组合风险级别
 * Portfolio risk level
 */
const PORTFOLIO_RISK_LEVEL = { // 定义常量 PORTFOLIO_RISK_LEVEL
  SAFE: 'safe',               // 安全 / Safe
  NORMAL: 'normal',           // 正常 / Normal
  ELEVATED: 'elevated',       // 升高 / Elevated
  HIGH: 'high',               // 高 / High
  CRITICAL: 'critical',       // 严重 / Critical
  EMERGENCY: 'emergency',     // 紧急 / Emergency
}; // 结束代码块

/**
 * 风控动作
 * Risk control action
 */
const RISK_ACTION = { // 定义常量 RISK_ACTION
  NONE: 'none',                         // 无动作 / No action
  ALERT: 'alert',                       // 警报 / Alert
  REDUCE_EXPOSURE: 'reduce_exposure',   // 降低敞口 / Reduce exposure
  PAUSE_NEW_TRADES: 'pause_new_trades', // 暂停新开仓 / Pause new trades
  REDUCE_ALL: 'reduce_all',             // 全面减仓 / Reduce all positions
  EMERGENCY_CLOSE: 'emergency_close',   // EMERGENCY平仓权限
  REBALANCE: 'rebalance',               // REBALANCE权限
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 全局仓位限制 / Global Position Limits
  // ============================================

  // 最大总仓位比例 / Maximum total position ratio
  maxTotalPositionRatio: 0.60, // 最大总仓位比例

  // 仓位警告阈值 / Position warning threshold
  positionWarningRatio: 0.50, // 仓位警告阈值

  // 单策略最大仓位比例 / Maximum single strategy position ratio
  maxSingleStrategyRatio: 0.25, // 单策略最大仓位比例

  // 最大持仓数量 / Maximum number of positions
  maxPositionCount: 10, // 最大持仓数量

  // ============================================
  // 组合回撤限制 / Portfolio Drawdown Limits
  // ============================================

  // 组合最大回撤 / Maximum portfolio drawdown
  maxPortfolioDrawdown: 0.15, // 最大Portfolio回撤

  // 回撤警告阈值 / Drawdown warning threshold
  drawdownWarningThreshold: 0.10, // 回撤警告阈值

  // 单日最大回撤 / Maximum daily drawdown
  maxDailyDrawdown: 0.05, // 最大每日回撤

  // 单周最大回撤 / Maximum weekly drawdown
  maxWeeklyDrawdown: 0.10, // 单周最大回撤

  // ============================================
  // 相关性风险限制 / Correlation Risk Limits
  // ============================================

  // 高相关性警告阈值 / High correlation warning threshold
  highCorrelationThreshold: 0.70, // 高相关性警告阈值

  // 高相关策略对最大数量 / Maximum high correlation pairs
  maxHighCorrelationPairs: 2, // 高相关策略对最大数量

  // 相关性突变检测阈值 / Correlation regime change threshold
  correlationChangeThreshold: 0.30, // 相关性突变检测阈值

  // ============================================
  // VaR配置 / VaR Configuration
  // ============================================

  // VaR置信水平 / VaR confidence level
  varConfidenceLevel: 0.95, // varConfidence级别

  // VaR限制 (占总资金比例) / VaR limit (as ratio of total capital)
  maxVaR: 0.05, // VaR限制 (占总资金比例)

  // CVaR限制 / CVaR limit
  maxCVaR: 0.08, // 最大CVaR

  // ============================================
  // 去风险配置 / De-risking Configuration
  // ============================================

  // 自动去风险启用 / Enable auto de-risking
  enableAutoDeRisk: true, // 启用自动De风险

  // 去风险比例 / De-risk ratio
  deRiskRatio: 0.30, // 去风险比例

  // 去风险冷却时间 (毫秒) / De-risk cooldown (ms)
  deRiskCooldown: 30 * 60 * 1000, // 30分钟 / 30 minutes

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 检查间隔 (毫秒) / Check interval (ms)
  checkInterval: 5000, // 检查间隔 (毫秒)

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志

  // 日志前缀 / Log prefix
  logPrefix: '[PortfolioRiskMgr]', // 日志前缀
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 组合风控管理器
 * Portfolio Risk Manager
 */
export class PortfolioRiskManager extends EventEmitter { // 导出类 PortfolioRiskManager
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

    // 策略风控状态 / Strategy risk states
    // 格式: { strategyId: { positions, equity, allocation, riskBudget, ... } }
    this.strategyStates = new Map(); // 设置 strategyStates

    // 组合状态 / Portfolio state
    this.portfolioState = { // 设置 portfolioState
      totalEquity: 0, // 总Equity
      totalPositionValue: 0, // 总持仓Value
      positionRatio: 0, // 持仓比例
      peakEquity: 0, // peakEquity
      currentDrawdown: 0, // current回撤
      dailyStartEquity: 0, // 每日启动Equity
      dailyDrawdown: 0, // 每日回撤
      weeklyStartEquity: 0, // weekly启动Equity
      weeklyDrawdown: 0, // weekly回撤
      riskLevel: PORTFOLIO_RISK_LEVEL.NORMAL, // 风险级别
      tradingAllowed: true, // 交易Allowed
      pauseReason: null, // 暂停Reason
    }; // 结束代码块

    // 风险预算 / Risk budgets
    // 格式: { strategyId: { budget, used, remaining } }
    this.riskBudgets = new Map(); // 设置 riskBudgets

    // 相关性分析器引用 / Correlation analyzer reference
    this.correlationAnalyzer = null; // 设置 correlationAnalyzer

    // 资金分配器引用 / Capital allocator reference
    this.capitalAllocator = null; // 设置 capitalAllocator

    // 订单执行器引用 / Order executor reference
    this.executor = null; // 设置 executor

    // 风控触发历史 / Risk trigger history
    this.riskHistory = []; // 设置 riskHistory

    // 最后去风险时间 / Last de-risk time
    this.lastDeRiskTime = 0; // 设置 lastDeRiskTime

    // 定时器 / Timer
    this.checkTimer = null; // 设置 checkTimer

    // 运行状态 / Running state
    this.running = false; // 设置 running
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化风控管理器
   * Initialize risk manager
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) { // 执行语句
    const { // 解构赋值
      correlationAnalyzer, // 执行语句
      capitalAllocator, // 执行语句
      executor, // 执行语句
      initialEquity, // 执行语句
    } = options; // 执行语句

    // 保存引用 / Save references
    this.correlationAnalyzer = correlationAnalyzer; // 设置 correlationAnalyzer
    this.capitalAllocator = capitalAllocator; // 设置 capitalAllocator
    this.executor = executor; // 设置 executor

    // 初始化组合状态 / Initialize portfolio state
    if (initialEquity) { // 条件判断 initialEquity
      this.portfolioState.totalEquity = initialEquity; // 访问 portfolioState
      this.portfolioState.peakEquity = initialEquity; // 访问 portfolioState
      this.portfolioState.dailyStartEquity = initialEquity; // 访问 portfolioState
      this.portfolioState.weeklyStartEquity = initialEquity; // 访问 portfolioState
    } // 结束代码块

    this.log('组合风控管理器初始化完成 / Portfolio risk manager initialized', 'info'); // 调用 log
  } // 结束代码块

  /**
   * 启动风控管理器
   * Start risk manager
   */
  start() { // 调用 start
    if (this.running) return; // 条件判断 this.running

    this.running = true; // 设置 running

    // 启动定时检查 / Start periodic check
    this.checkTimer = setInterval( // 设置 checkTimer
      () => this._performRiskCheck(), // 定义箭头函数
      this.config.checkInterval // 访问 config
    ); // 结束调用或参数

    this.log('组合风控管理器已启动 / Portfolio risk manager started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止风控管理器
   * Stop risk manager
   */
  stop() { // 调用 stop
    if (!this.running) return; // 条件判断 !this.running

    this.running = false; // 设置 running

    if (this.checkTimer) { // 条件判断 this.checkTimer
      clearInterval(this.checkTimer); // 调用 clearInterval
      this.checkTimer = null; // 设置 checkTimer
    } // 结束代码块

    this.log('组合风控管理器已停止 / Portfolio risk manager stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

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
  registerStrategy(strategyId, config = {}) { // 调用 registerStrategy
    this.strategyStates.set(strategyId, { // 访问 strategyStates
      id: strategyId, // ID
      positions: [], // 持仓
      positionValue: 0, // 持仓Value
      equity: 0, // equity
      allocation: config.allocation || 0, // allocation
      riskBudget: config.riskBudget || 0, // 风险Budget
      dailyPnL: 0, // 每日PnL
      tradingAllowed: true, // 交易Allowed
      registeredAt: Date.now(), // registeredAt
    }); // 结束代码块

    // 初始化风险预算 / Initialize risk budget
    this.riskBudgets.set(strategyId, { // 访问 riskBudgets
      budget: config.riskBudget || this.portfolioState.totalEquity * 0.1, // budget
      used: 0, // used
      remaining: config.riskBudget || this.portfolioState.totalEquity * 0.1, // remaining
    }); // 结束代码块

    this.log(`注册策略: ${strategyId} / Strategy registered: ${strategyId}`, 'info'); // 调用 log
    this.emit('strategyRegistered', { strategyId, config }); // 调用 emit
  } // 结束代码块

  /**
   * 更新策略状态
   * Update strategy state
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} state - 状态数据 / State data
   */
  updateStrategyState(strategyId, state) { // 调用 updateStrategyState
    const existing = this.strategyStates.get(strategyId); // 定义常量 existing

    if (!existing) { // 条件判断 !existing
      this.registerStrategy(strategyId); // 调用 registerStrategy
    } // 结束代码块

    this.strategyStates.set(strategyId, { // 访问 strategyStates
      ...existing, // 展开对象或数组
      ...state, // 展开对象或数组
      updatedAt: Date.now(), // updatedAt
    }); // 结束代码块

    // 更新组合状态 / Update portfolio state
    this._updatePortfolioState(); // 调用 _updatePortfolioState
  } // 结束代码块

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
  checkOrder(order) { // 调用 checkOrder
    const { strategyId, symbol, side, amount, price } = order; // 解构赋值
    const orderValue = amount * price; // 定义常量 orderValue

    const result = { // 定义常量 result
      allowed: true, // allowed
      reasons: [], // reasons
      warnings: [], // warnings
      riskLevel: this.portfolioState.riskLevel, // 风险级别
    }; // 结束代码块

    // 1. 检查组合交易状态 / Check portfolio trading status
    if (!this.portfolioState.tradingAllowed) { // 条件判断 !this.portfolioState.tradingAllowed
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push(`组合交易已暂停: ${this.portfolioState.pauseReason}`); // 调用 result.reasons.push
      return result; // 返回结果
    } // 结束代码块

    // 2. 检查策略交易状态 / Check strategy trading status
    const strategyState = this.strategyStates.get(strategyId); // 定义常量 strategyState
    if (strategyState && !strategyState.tradingAllowed) { // 条件判断 strategyState && !strategyState.tradingAllowed
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push(`策略 ${strategyId} 交易已暂停`); // 调用 result.reasons.push
      return result; // 返回结果
    } // 结束代码块

    // 3. 检查全局仓位限制 / Check global position limit
    const newTotalPosition = this.portfolioState.totalPositionValue + orderValue; // 定义常量 newTotalPosition
    const newPositionRatio = newTotalPosition / this.portfolioState.totalEquity; // 定义常量 newPositionRatio

    if (newPositionRatio > this.config.maxTotalPositionRatio) { // 条件判断 newPositionRatio > this.config.maxTotalPositi...
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push( // 调用 result.reasons.push
        `超过全局仓位限制: ${(newPositionRatio * 100).toFixed(1)}% > ${(this.config.maxTotalPositionRatio * 100).toFixed(1)}%` // 执行语句
      ); // 结束调用或参数
    } else if (newPositionRatio > this.config.positionWarningRatio) { // 执行语句
      result.warnings.push( // 调用 result.warnings.push
        `接近全局仓位限制: ${(newPositionRatio * 100).toFixed(1)}%` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 4. 检查单策略仓位限制 / Check single strategy position limit
    if (strategyState) { // 条件判断 strategyState
      const newStrategyPosition = strategyState.positionValue + orderValue; // 定义常量 newStrategyPosition
      const strategyRatio = newStrategyPosition / this.portfolioState.totalEquity; // 定义常量 strategyRatio

      if (strategyRatio > this.config.maxSingleStrategyRatio) { // 条件判断 strategyRatio > this.config.maxSingleStrategy...
        result.allowed = false; // 赋值 result.allowed
        result.reasons.push( // 调用 result.reasons.push
          `策略 ${strategyId} 超过单策略仓位限制: ${(strategyRatio * 100).toFixed(1)}% > ${(this.config.maxSingleStrategyRatio * 100).toFixed(1)}%` // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } // 结束代码块

    // 5. 检查风险预算 / Check risk budget
    const budget = this.riskBudgets.get(strategyId); // 定义常量 budget
    if (budget) { // 条件判断 budget
      const riskAmount = orderValue * 0.02; // 假设2%风险 / Assume 2% risk
      if (riskAmount > budget.remaining) { // 条件判断 riskAmount > budget.remaining
        result.allowed = false; // 赋值 result.allowed
        result.reasons.push( // 调用 result.reasons.push
          `策略 ${strategyId} 风险预算不足: 需要 ${riskAmount.toFixed(2)}, 剩余 ${budget.remaining.toFixed(2)}` // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } // 结束代码块

    // 6. 检查回撤状态 / Check drawdown status
    if (this.portfolioState.currentDrawdown > this.config.drawdownWarningThreshold) { // 条件判断 this.portfolioState.currentDrawdown > this.co...
      result.warnings.push( // 调用 result.warnings.push
        `当前组合回撤较高: ${(this.portfolioState.currentDrawdown * 100).toFixed(2)}%` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 7. 检查风险级别 / Check risk level
    if (this.portfolioState.riskLevel === PORTFOLIO_RISK_LEVEL.HIGH || // 条件判断 this.portfolioState.riskLevel === PORTFOLIO_R...
        this.portfolioState.riskLevel === PORTFOLIO_RISK_LEVEL.CRITICAL) { // 访问 portfolioState
      result.warnings.push(`当前风险级别: ${this.portfolioState.riskLevel}`); // 调用 result.warnings.push

      // 高风险时减少订单量 / Reduce order size in high risk
      if (this.portfolioState.riskLevel === PORTFOLIO_RISK_LEVEL.CRITICAL) { // 条件判断 this.portfolioState.riskLevel === PORTFOLIO_R...
        result.suggestedReduction = 0.5; // 赋值 result.suggestedReduction
        result.warnings.push('建议减少50%订单量 / Suggest reducing order size by 50%'); // 调用 result.warnings.push
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  // ============================================
  // 风控检查 / Risk Checks
  // ============================================

  /**
   * 执行风控检查
   * Perform risk check
   * @private
   */
  async _performRiskCheck() { // 执行语句
    if (!this.running) return; // 条件判断 !this.running

    // 检查时间重置 / Check time resets
    this._checkTimeResets(); // 调用 _checkTimeResets

    // 1. 检查组合回撤 / Check portfolio drawdown
    const drawdownResult = this._checkPortfolioDrawdown(); // 定义常量 drawdownResult

    // 2. 检查全局仓位 / Check global position
    const positionResult = this._checkGlobalPosition(); // 定义常量 positionResult

    // 3. 检查相关性风险 / Check correlation risk
    const correlationResult = this._checkCorrelationRisk(); // 定义常量 correlationResult

    // 4. 检查VaR / Check VaR
    const varResult = this._checkVaR(); // 定义常量 varResult

    // 5. 更新风险级别 / Update risk level
    this._updateRiskLevel([drawdownResult, positionResult, correlationResult, varResult]); // 调用 _updateRiskLevel

    // 6. 执行风控动作 / Execute risk actions
    await this._executeRiskActions([drawdownResult, positionResult, correlationResult, varResult]); // 等待异步结果
  } // 结束代码块

  /**
   * 检查组合回撤
   * Check portfolio drawdown
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkPortfolioDrawdown() { // 调用 _checkPortfolioDrawdown
    const result = { // 定义常量 result
      type: 'drawdown', // 类型
      action: RISK_ACTION.NONE, // action
      level: PORTFOLIO_RISK_LEVEL.NORMAL, // 级别
      details: {}, // details
    }; // 结束代码块

    // 计算当前回撤 / Calculate current drawdown
    const { currentDrawdown, dailyDrawdown, weeklyDrawdown } = this.portfolioState; // 解构赋值

    result.details = { // 赋值 result.details
      currentDrawdown, // 执行语句
      dailyDrawdown, // 执行语句
      weeklyDrawdown, // 执行语句
      maxPortfolioDrawdown: this.config.maxPortfolioDrawdown, // 最大Portfolio回撤
      maxDailyDrawdown: this.config.maxDailyDrawdown, // 最大每日回撤
      maxWeeklyDrawdown: this.config.maxWeeklyDrawdown, // 最大Weekly回撤
    }; // 结束代码块

    // 检查组合最大回撤 / Check max portfolio drawdown
    if (currentDrawdown >= this.config.maxPortfolioDrawdown) { // 条件判断 currentDrawdown >= this.config.maxPortfolioDr...
      result.action = RISK_ACTION.EMERGENCY_CLOSE; // 赋值 result.action
      result.level = PORTFOLIO_RISK_LEVEL.EMERGENCY; // 赋值 result.level
      result.message = `组合回撤超限: ${(currentDrawdown * 100).toFixed(2)}% >= ${(this.config.maxPortfolioDrawdown * 100).toFixed(0)}%`; // 赋值 result.message

      this.log(`⚠️ ${result.message}`, 'error'); // 调用 log

    } else if (currentDrawdown >= this.config.drawdownWarningThreshold) { // 执行语句
      result.action = RISK_ACTION.REDUCE_EXPOSURE; // 赋值 result.action
      result.level = PORTFOLIO_RISK_LEVEL.HIGH; // 赋值 result.level
      result.message = `组合回撤警告: ${(currentDrawdown * 100).toFixed(2)}%`; // 赋值 result.message

      this.log(`⚠️ ${result.message}`, 'warn'); // 调用 log
    } // 结束代码块

    // 检查单日回撤 / Check daily drawdown
    if (dailyDrawdown >= this.config.maxDailyDrawdown) { // 条件判断 dailyDrawdown >= this.config.maxDailyDrawdown
      result.action = RISK_ACTION.PAUSE_NEW_TRADES; // 赋值 result.action
      result.level = Math.max(result.level === PORTFOLIO_RISK_LEVEL.NORMAL ? 0 : 1, PORTFOLIO_RISK_LEVEL.HIGH); // 赋值 result.level
      result.message = `单日回撤超限: ${(dailyDrawdown * 100).toFixed(2)}% >= ${(this.config.maxDailyDrawdown * 100).toFixed(0)}%`; // 赋值 result.message

      this.log(`⚠️ ${result.message}`, 'error'); // 调用 log
    } // 结束代码块

    // 检查单周回撤 / Check weekly drawdown
    if (weeklyDrawdown >= this.config.maxWeeklyDrawdown) { // 条件判断 weeklyDrawdown >= this.config.maxWeeklyDrawdown
      result.action = RISK_ACTION.REDUCE_ALL; // 赋值 result.action
      result.level = PORTFOLIO_RISK_LEVEL.CRITICAL; // 赋值 result.level
      result.message = `单周回撤超限: ${(weeklyDrawdown * 100).toFixed(2)}% >= ${(this.config.maxWeeklyDrawdown * 100).toFixed(0)}%`; // 赋值 result.message

      this.log(`⚠️ ${result.message}`, 'error'); // 调用 log
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查全局仓位
   * Check global position
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkGlobalPosition() { // 调用 _checkGlobalPosition
    const result = { // 定义常量 result
      type: 'position', // 类型
      action: RISK_ACTION.NONE, // action
      level: PORTFOLIO_RISK_LEVEL.NORMAL, // 级别
      details: {}, // details
    }; // 结束代码块

    const { positionRatio, totalPositionValue, totalEquity } = this.portfolioState; // 解构赋值

    result.details = { // 赋值 result.details
      positionRatio, // 执行语句
      totalPositionValue, // 执行语句
      totalEquity, // 执行语句
      maxTotalPositionRatio: this.config.maxTotalPositionRatio, // 最大总持仓比例
    }; // 结束代码块

    if (positionRatio >= this.config.maxTotalPositionRatio) { // 条件判断 positionRatio >= this.config.maxTotalPosition...
      result.action = RISK_ACTION.PAUSE_NEW_TRADES; // 赋值 result.action
      result.level = PORTFOLIO_RISK_LEVEL.HIGH; // 赋值 result.level
      result.message = `全局仓位超限: ${(positionRatio * 100).toFixed(2)}% >= ${(this.config.maxTotalPositionRatio * 100).toFixed(0)}%`; // 赋值 result.message

      this.log(`⚠️ ${result.message}`, 'warn'); // 调用 log

    } else if (positionRatio >= this.config.positionWarningRatio) { // 执行语句
      result.action = RISK_ACTION.ALERT; // 赋值 result.action
      result.level = PORTFOLIO_RISK_LEVEL.ELEVATED; // 赋值 result.level
      result.message = `全局仓位警告: ${(positionRatio * 100).toFixed(2)}%`; // 赋值 result.message
    } // 结束代码块

    // 检查持仓数量 / Check position count
    let totalPositionCount = 0; // 定义变量 totalPositionCount
    for (const [, state] of this.strategyStates) { // 循环 const [, state] of this.strategyStates
      totalPositionCount += (state.positions?.length || 0); // 执行语句
    } // 结束代码块

    if (totalPositionCount > this.config.maxPositionCount) { // 条件判断 totalPositionCount > this.config.maxPositionC...
      result.action = RISK_ACTION.ALERT; // 赋值 result.action
      result.level = PORTFOLIO_RISK_LEVEL.ELEVATED; // 赋值 result.level
      result.details.positionCount = totalPositionCount; // 赋值 result.details.positionCount
      result.message = `持仓数量过多: ${totalPositionCount} > ${this.config.maxPositionCount}`; // 赋值 result.message

      this.log(`⚠️ ${result.message}`, 'warn'); // 调用 log
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查相关性风险
   * Check correlation risk
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkCorrelationRisk() { // 调用 _checkCorrelationRisk
    const result = { // 定义常量 result
      type: 'correlation', // 类型
      action: RISK_ACTION.NONE, // action
      level: PORTFOLIO_RISK_LEVEL.NORMAL, // 级别
      details: {}, // details
    }; // 结束代码块

    if (!this.correlationAnalyzer) { // 条件判断 !this.correlationAnalyzer
      return result; // 返回结果
    } // 结束代码块

    // 获取高相关策略对 / Get high correlation pairs
    const highCorrPairs = this.correlationAnalyzer.findHighCorrelationPairs( // 定义常量 highCorrPairs
      this.config.highCorrelationThreshold // 访问 config
    ); // 结束调用或参数

    result.details = { // 赋值 result.details
      highCorrelationPairs: highCorrPairs, // 最高CorrelationPairs
      threshold: this.config.highCorrelationThreshold, // 阈值
    }; // 结束代码块

    if (highCorrPairs.length > this.config.maxHighCorrelationPairs) { // 条件判断 highCorrPairs.length > this.config.maxHighCor...
      result.action = RISK_ACTION.REBALANCE; // 赋值 result.action
      result.level = PORTFOLIO_RISK_LEVEL.ELEVATED; // 赋值 result.level
      result.message = `高相关策略对过多: ${highCorrPairs.length} > ${this.config.maxHighCorrelationPairs}`; // 赋值 result.message

      this.log(`⚠️ ${result.message}`, 'warn'); // 调用 log

      // 记录具体的高相关对 / Log specific high correlation pairs
      for (const pair of highCorrPairs) { // 循环 const pair of highCorrPairs
        this.log(`  高相关: ${pair.strategies.join(' <-> ')} = ${pair.correlation.toFixed(3)}`, 'warn'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 检测相关性突变 / Detect correlation regime change
    if (this.strategies && this.strategies.length >= 2) { // 条件判断 this.strategies && this.strategies.length >= 2
      const strategies = [...this.strategyStates.keys()]; // 定义常量 strategies
      for (let i = 0; i < strategies.length - 1; i++) { // 循环 let i = 0; i < strategies.length - 1; i++
        for (let j = i + 1; j < strategies.length; j++) { // 循环 let j = i + 1; j < strategies.length; j++
          const change = this.correlationAnalyzer.detectCorrelationRegimeChange( // 定义常量 change
            strategies[i], // 执行语句
            strategies[j], // 执行语句
            this.config.correlationChangeThreshold // 访问 config
          ); // 结束调用或参数

          if (change.detected) { // 条件判断 change.detected
            result.action = RISK_ACTION.ALERT; // 赋值 result.action
            result.details.regimeChange = change; // 赋值 result.details.regimeChange
            this.log(`⚠️ 相关性突变: ${strategies[i]} - ${strategies[j]}: ${change.historicalCorrelation.toFixed(2)} -> ${change.recentCorrelation.toFixed(2)}`, 'warn'); // 调用 log
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查VaR
   * Check VaR
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkVaR() { // 调用 _checkVaR
    const result = { // 定义常量 result
      type: 'var', // 类型
      action: RISK_ACTION.NONE, // action
      level: PORTFOLIO_RISK_LEVEL.NORMAL, // 级别
      details: {}, // details
    }; // 结束代码块

    // 计算组合VaR / Calculate portfolio VaR
    const varResult = this._calculatePortfolioVaR(); // 定义常量 varResult

    result.details = { // 赋值 result.details
      var: varResult.var, // var
      cvar: varResult.cvar, // cvar
      maxVaR: this.config.maxVaR, // 最大VaR
      maxCVaR: this.config.maxCVaR, // 最大CVaR
    }; // 结束代码块

    // 检查VaR限制 / Check VaR limit
    const varRatio = varResult.var / this.portfolioState.totalEquity; // 定义常量 varRatio

    if (varRatio >= this.config.maxVaR) { // 条件判断 varRatio >= this.config.maxVaR
      result.action = RISK_ACTION.REDUCE_EXPOSURE; // 赋值 result.action
      result.level = PORTFOLIO_RISK_LEVEL.HIGH; // 赋值 result.level
      result.message = `VaR超限: ${(varRatio * 100).toFixed(2)}% >= ${(this.config.maxVaR * 100).toFixed(0)}%`; // 赋值 result.message

      this.log(`⚠️ ${result.message}`, 'warn'); // 调用 log
    } // 结束代码块

    // 检查CVaR限制 / Check CVaR limit
    const cvarRatio = varResult.cvar / this.portfolioState.totalEquity; // 定义常量 cvarRatio

    if (cvarRatio >= this.config.maxCVaR) { // 条件判断 cvarRatio >= this.config.maxCVaR
      result.action = RISK_ACTION.REDUCE_ALL; // 赋值 result.action
      result.level = PORTFOLIO_RISK_LEVEL.CRITICAL; // 赋值 result.level
      result.message = `CVaR超限: ${(cvarRatio * 100).toFixed(2)}% >= ${(this.config.maxCVaR * 100).toFixed(0)}%`; // 赋值 result.message

      this.log(`⚠️ ${result.message}`, 'error'); // 调用 log
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 计算组合VaR
   * Calculate portfolio VaR
   *
   * @returns {Object} VaR结果 / VaR result
   * @private
   */
  _calculatePortfolioVaR() { // 调用 _calculatePortfolioVaR
    // 收集策略收益数据 / Collect strategy return data
    const returns = []; // 定义常量 returns

    for (const [, state] of this.strategyStates) { // 循环 const [, state] of this.strategyStates
      if (state.returns && state.returns.length > 0) { // 条件判断 state.returns && state.returns.length > 0
        returns.push(...state.returns); // 调用 returns.push
      } // 结束代码块
    } // 结束代码块

    if (returns.length < 10) { // 条件判断 returns.length < 10
      // 数据不足，使用简化估算 / Insufficient data, use simplified estimation
      const avgVolatility = 0.02; // 假设2%日波动率 / Assume 2% daily volatility
      const var95 = this.portfolioState.totalPositionValue * avgVolatility * 1.65; // 定义常量 var95
      const cvar95 = var95 * 1.2; // 定义常量 cvar95

      return { var: var95, cvar: cvar95, method: 'simplified' }; // 返回结果
    } // 结束代码块

    // 排序收益 / Sort returns
    const sortedReturns = [...returns].sort((a, b) => a - b); // 定义函数 sortedReturns
    const n = sortedReturns.length; // 定义常量 n

    // 计算VaR (历史模拟法) / Calculate VaR (historical simulation)
    const varIndex = Math.floor(n * (1 - this.config.varConfidenceLevel)); // 定义常量 varIndex
    const var95 = Math.abs(sortedReturns[varIndex]) * this.portfolioState.totalPositionValue; // 定义常量 var95

    // 计算CVaR (条件VaR) / Calculate CVaR (Conditional VaR)
    const tailReturns = sortedReturns.slice(0, varIndex + 1); // 定义常量 tailReturns
    const cvar95 = Math.abs(tailReturns.reduce((a, b) => a + b, 0) / tailReturns.length) * // 定义函数 cvar95
                   this.portfolioState.totalPositionValue; // 访问 portfolioState

    return { var: var95, cvar: cvar95, method: 'historical' }; // 返回结果
  } // 结束代码块

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
  async _executeRiskActions(results) { // 执行语句
    // 找出最严重的动作 / Find most severe action
    const actionPriority = { // 定义常量 actionPriority
      [RISK_ACTION.NONE]: 0, // 执行语句
      [RISK_ACTION.ALERT]: 1, // 执行语句
      [RISK_ACTION.REBALANCE]: 2, // 执行语句
      [RISK_ACTION.PAUSE_NEW_TRADES]: 3, // 执行语句
      [RISK_ACTION.REDUCE_EXPOSURE]: 4, // 执行语句
      [RISK_ACTION.REDUCE_ALL]: 5, // 执行语句
      [RISK_ACTION.EMERGENCY_CLOSE]: 6, // 执行语句
    }; // 结束代码块

    const mostSevere = results.reduce((a, b) => // 定义函数 mostSevere
      (actionPriority[a.action] || 0) > (actionPriority[b.action] || 0) ? a : b // 执行语句
    ); // 结束调用或参数

    // 执行相应动作 / Execute corresponding action
    switch (mostSevere.action) { // 分支选择 mostSevere.action
      case RISK_ACTION.EMERGENCY_CLOSE: // 分支 RISK_ACTION.EMERGENCY_CLOSE
        await this._emergencyClose(mostSevere); // 等待异步结果
        break; // 跳出循环或分支

      case RISK_ACTION.REDUCE_ALL: // 分支 RISK_ACTION.REDUCE_ALL
        await this._reduceAllPositions(mostSevere); // 等待异步结果
        break; // 跳出循环或分支

      case RISK_ACTION.REDUCE_EXPOSURE: // 分支 RISK_ACTION.REDUCE_EXPOSURE
        await this._reduceExposure(mostSevere); // 等待异步结果
        break; // 跳出循环或分支

      case RISK_ACTION.PAUSE_NEW_TRADES: // 分支 RISK_ACTION.PAUSE_NEW_TRADES
        this._pauseNewTrades(mostSevere); // 调用 _pauseNewTrades
        break; // 跳出循环或分支

      case RISK_ACTION.REBALANCE: // 分支 RISK_ACTION.REBALANCE
        this._triggerRebalance(mostSevere); // 调用 _triggerRebalance
        break; // 跳出循环或分支

      case RISK_ACTION.ALERT: // 分支 RISK_ACTION.ALERT
        this._emitAlert(mostSevere); // 调用 _emitAlert
        break; // 跳出循环或分支

      default: // 默认
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块

  /**
   * 紧急平仓
   * Emergency close
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  async _emergencyClose(trigger) { // 执行语句
    this.log(`🚨 执行紧急平仓: ${trigger.message}`, 'error'); // 调用 log

    // 暂停所有交易 / Pause all trading
    this.portfolioState.tradingAllowed = false; // 访问 portfolioState
    this.portfolioState.pauseReason = trigger.message; // 访问 portfolioState

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('emergencyClose', trigger); // 调用 _recordRiskEvent

    // 调用执行器平仓 / Call executor to close
    if (this.executor && typeof this.executor.emergencyCloseAll === 'function') { // 条件判断 this.executor && typeof this.executor.emergen...
      try { // 尝试执行
        await this.executor.emergencyCloseAll(); // 等待异步结果
        this.log('✓ 紧急平仓完成 / Emergency close completed', 'info'); // 调用 log
      } catch (error) { // 执行语句
        this.log(`✗ 紧急平仓失败: ${error.message}`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    this.emit('emergencyClose', trigger); // 调用 emit
  } // 结束代码块

  /**
   * 全面减仓
   * Reduce all positions
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  async _reduceAllPositions(trigger) { // 执行语句
    // 检查冷却时间 / Check cooldown
    if (Date.now() - this.lastDeRiskTime < this.config.deRiskCooldown) { // 条件判断 Date.now() - this.lastDeRiskTime < this.confi...
      this.log('去风险冷却中，跳过 / De-risk cooldown, skipping', 'info'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    this.log(`📉 执行全面减仓: ${trigger.message}`, 'warn'); // 调用 log

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('reduceAll', trigger); // 调用 _recordRiskEvent

    // 对每个策略执行减仓 / Reduce each strategy
    if (this.executor && this.config.enableAutoDeRisk) { // 条件判断 this.executor && this.config.enableAutoDeRisk
      for (const [strategyId, state] of this.strategyStates) { // 循环 const [strategyId, state] of this.strategyStates
        if (state.positions && state.positions.length > 0) { // 条件判断 state.positions && state.positions.length > 0
          try { // 尝试执行
            await this._reduceStrategyPositions(strategyId, this.config.deRiskRatio); // 等待异步结果
          } catch (error) { // 执行语句
            this.log(`减仓策略 ${strategyId} 失败: ${error.message}`, 'error'); // 调用 log
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      this.lastDeRiskTime = Date.now(); // 设置 lastDeRiskTime
    } // 结束代码块

    this.emit('reduceAll', trigger); // 调用 emit
  } // 结束代码块

  /**
   * 降低敞口
   * Reduce exposure
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  async _reduceExposure(trigger) { // 执行语句
    // 检查冷却时间 / Check cooldown
    if (Date.now() - this.lastDeRiskTime < this.config.deRiskCooldown) { // 条件判断 Date.now() - this.lastDeRiskTime < this.confi...
      return; // 返回结果
    } // 结束代码块

    this.log(`📉 降低敞口: ${trigger.message}`, 'warn'); // 调用 log

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('reduceExposure', trigger); // 调用 _recordRiskEvent

    // 找出仓位最大的策略进行减仓 / Find strategy with largest position to reduce
    if (this.executor && this.config.enableAutoDeRisk) { // 条件判断 this.executor && this.config.enableAutoDeRisk
      let largestStrategy = null; // 定义变量 largestStrategy
      let largestPosition = 0; // 定义变量 largestPosition

      for (const [strategyId, state] of this.strategyStates) { // 循环 const [strategyId, state] of this.strategyStates
        if (state.positionValue > largestPosition) { // 条件判断 state.positionValue > largestPosition
          largestPosition = state.positionValue; // 赋值 largestPosition
          largestStrategy = strategyId; // 赋值 largestStrategy
        } // 结束代码块
      } // 结束代码块

      if (largestStrategy) { // 条件判断 largestStrategy
        try { // 尝试执行
          await this._reduceStrategyPositions(largestStrategy, this.config.deRiskRatio / 2); // 等待异步结果
          this.lastDeRiskTime = Date.now(); // 设置 lastDeRiskTime
        } catch (error) { // 执行语句
          this.log(`减仓策略 ${largestStrategy} 失败: ${error.message}`, 'error'); // 调用 log
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    this.emit('reduceExposure', trigger); // 调用 emit
  } // 结束代码块

  /**
   * 减少策略仓位
   * Reduce strategy positions
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {number} ratio - 减仓比例 / Reduction ratio
   * @private
   */
  async _reduceStrategyPositions(strategyId, ratio) { // 执行语句
    const state = this.strategyStates.get(strategyId); // 定义常量 state
    if (!state || !state.positions) return; // 条件判断 !state || !state.positions

    this.log(`减仓策略 ${strategyId}: ${(ratio * 100).toFixed(0)}%`, 'info'); // 调用 log

    for (const position of state.positions) { // 循环 const position of state.positions
      const reduceAmount = Math.abs(position.size || position.amount) * ratio; // 定义常量 reduceAmount

      if (reduceAmount > 0 && this.executor) { // 条件判断 reduceAmount > 0 && this.executor
        const closeSide = position.side === 'long' ? 'sell' : 'buy'; // 定义常量 closeSide

        try { // 尝试执行
          await this.executor.executeMarketOrder({ // 等待异步结果
            symbol: position.symbol, // 交易对
            side: closeSide, // 方向
            amount: reduceAmount, // 数量
            reduceOnly: true, // 减仓仅
          }); // 结束代码块
        } catch (error) { // 执行语句
          this.log(`减仓 ${position.symbol} 失败: ${error.message}`, 'error'); // 调用 log
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 暂停新开仓
   * Pause new trades
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  _pauseNewTrades(trigger) { // 调用 _pauseNewTrades
    if (!this.portfolioState.tradingAllowed) return; // 条件判断 !this.portfolioState.tradingAllowed

    this.log(`⏸️ 暂停新开仓: ${trigger.message}`, 'warn'); // 调用 log

    this.portfolioState.tradingAllowed = false; // 访问 portfolioState
    this.portfolioState.pauseReason = trigger.message; // 访问 portfolioState

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('pauseNewTrades', trigger); // 调用 _recordRiskEvent

    this.emit('tradingPaused', trigger); // 调用 emit
  } // 结束代码块

  /**
   * 触发再平衡
   * Trigger rebalance
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  _triggerRebalance(trigger) { // 调用 _triggerRebalance
    this.log(`🔄 触发再平衡: ${trigger.message}`, 'info'); // 调用 log

    // 记录风控事件 / Record risk event
    this._recordRiskEvent('rebalance', trigger); // 调用 _recordRiskEvent

    if (this.capitalAllocator) { // 条件判断 this.capitalAllocator
      this.capitalAllocator.rebalance('risk_triggered'); // 访问 capitalAllocator
    } // 结束代码块

    this.emit('rebalanceTriggered', trigger); // 调用 emit
  } // 结束代码块

  /**
   * 发出警报
   * Emit alert
   *
   * @param {Object} trigger - 触发信息 / Trigger info
   * @private
   */
  _emitAlert(trigger) { // 调用 _emitAlert
    this.emit('alert', { // 调用 emit
      level: trigger.level, // 级别
      type: trigger.type, // 类型
      message: trigger.message, // 消息
      details: trigger.details, // details
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 状态更新 / State Updates
  // ============================================

  /**
   * 更新组合状态
   * Update portfolio state
   * @private
   */
  _updatePortfolioState() { // 调用 _updatePortfolioState
    // 计算总权益和总仓位 / Calculate total equity and position
    let totalEquity = 0; // 定义变量 totalEquity
    let totalPositionValue = 0; // 定义变量 totalPositionValue

    for (const [, state] of this.strategyStates) { // 循环 const [, state] of this.strategyStates
      totalEquity += state.equity || 0; // 执行语句
      totalPositionValue += state.positionValue || 0; // 执行语句
    } // 结束代码块

    // 更新组合状态 / Update portfolio state
    this.portfolioState.totalEquity = totalEquity; // 访问 portfolioState
    this.portfolioState.totalPositionValue = totalPositionValue; // 访问 portfolioState
    this.portfolioState.positionRatio = totalEquity > 0 // 访问 portfolioState
      ? totalPositionValue / totalEquity // 执行语句
      : 0; // 执行语句

    // 更新峰值权益 / Update peak equity
    if (totalEquity > this.portfolioState.peakEquity) { // 条件判断 totalEquity > this.portfolioState.peakEquity
      this.portfolioState.peakEquity = totalEquity; // 访问 portfolioState
    } // 结束代码块

    // 计算回撤 / Calculate drawdowns
    this.portfolioState.currentDrawdown = this.portfolioState.peakEquity > 0 // 访问 portfolioState
      ? (this.portfolioState.peakEquity - totalEquity) / this.portfolioState.peakEquity // 执行语句
      : 0; // 执行语句

    this.portfolioState.dailyDrawdown = this.portfolioState.dailyStartEquity > 0 // 访问 portfolioState
      ? Math.max(0, (this.portfolioState.dailyStartEquity - totalEquity) / this.portfolioState.dailyStartEquity) // 执行语句
      : 0; // 执行语句

    this.portfolioState.weeklyDrawdown = this.portfolioState.weeklyStartEquity > 0 // 访问 portfolioState
      ? Math.max(0, (this.portfolioState.weeklyStartEquity - totalEquity) / this.portfolioState.weeklyStartEquity) // 执行语句
      : 0; // 执行语句
  } // 结束代码块

  /**
   * 更新风险级别
   * Update risk level
   *
   * @param {Array} results - 检查结果 / Check results
   * @private
   */
  _updateRiskLevel(results) { // 调用 _updateRiskLevel
    const levelPriority = { // 定义常量 levelPriority
      [PORTFOLIO_RISK_LEVEL.SAFE]: 0, // 执行语句
      [PORTFOLIO_RISK_LEVEL.NORMAL]: 1, // 执行语句
      [PORTFOLIO_RISK_LEVEL.ELEVATED]: 2, // 执行语句
      [PORTFOLIO_RISK_LEVEL.HIGH]: 3, // 执行语句
      [PORTFOLIO_RISK_LEVEL.CRITICAL]: 4, // 执行语句
      [PORTFOLIO_RISK_LEVEL.EMERGENCY]: 5, // 执行语句
    }; // 结束代码块

    // 找出最高风险级别 / Find highest risk level
    let highestLevel = PORTFOLIO_RISK_LEVEL.NORMAL; // 定义变量 highestLevel

    for (const result of results) { // 循环 const result of results
      if ((levelPriority[result.level] || 0) > (levelPriority[highestLevel] || 0)) { // 条件判断 (levelPriority[result.level] || 0) > (levelPr...
        highestLevel = result.level; // 赋值 highestLevel
      } // 结束代码块
    } // 结束代码块

    // 如果风险级别变化，发出事件 / Emit event if risk level changed
    if (highestLevel !== this.portfolioState.riskLevel) { // 条件判断 highestLevel !== this.portfolioState.riskLevel
      const previousLevel = this.portfolioState.riskLevel; // 定义常量 previousLevel
      this.portfolioState.riskLevel = highestLevel; // 访问 portfolioState

      this.emit('riskLevelChanged', { // 调用 emit
        previousLevel, // 执行语句
        currentLevel: highestLevel, // current级别
        timestamp: Date.now(), // 时间戳
      }); // 结束代码块

      this.log(`风险级别变更: ${previousLevel} -> ${highestLevel}`, 'info'); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查时间重置
   * Check time resets
   * @private
   */
  _checkTimeResets() { // 调用 _checkTimeResets
    const now = new Date(); // 定义常量 now
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); // 定义常量 dayStart
    const weekStart = dayStart - now.getDay() * 24 * 60 * 60 * 1000; // 定义常量 weekStart

    // 检查日重置 / Check daily reset
    if (this._lastDayStart !== dayStart) { // 条件判断 this._lastDayStart !== dayStart
      this._lastDayStart = dayStart; // 设置 _lastDayStart
      this.portfolioState.dailyStartEquity = this.portfolioState.totalEquity; // 访问 portfolioState
      this.portfolioState.dailyDrawdown = 0; // 访问 portfolioState

      // 恢复交易 (如果因为单日回撤暂停) / Resume trading if paused due to daily drawdown
      if (this.portfolioState.pauseReason?.includes('单日回撤')) { // 条件判断 this.portfolioState.pauseReason?.includes('单日...
        this.portfolioState.tradingAllowed = true; // 访问 portfolioState
        this.portfolioState.pauseReason = null; // 访问 portfolioState
        this.log('跨天重置: 交易已恢复 / Day reset: Trading resumed', 'info'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 检查周重置 / Check weekly reset
    if (this._lastWeekStart !== weekStart) { // 条件判断 this._lastWeekStart !== weekStart
      this._lastWeekStart = weekStart; // 设置 _lastWeekStart
      this.portfolioState.weeklyStartEquity = this.portfolioState.totalEquity; // 访问 portfolioState
      this.portfolioState.weeklyDrawdown = 0; // 访问 portfolioState

      // 恢复交易 (如果因为单周回撤暂停) / Resume trading if paused due to weekly drawdown
      if (this.portfolioState.pauseReason?.includes('单周回撤')) { // 条件判断 this.portfolioState.pauseReason?.includes('单周...
        this.portfolioState.tradingAllowed = true; // 访问 portfolioState
        this.portfolioState.pauseReason = null; // 访问 portfolioState
        this.log('跨周重置: 交易已恢复 / Week reset: Trading resumed', 'info'); // 调用 log
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录风控事件
   * Record risk event
   *
   * @param {string} type - 事件类型 / Event type
   * @param {Object} details - 详情 / Details
   * @private
   */
  _recordRiskEvent(type, details) { // 调用 _recordRiskEvent
    this.riskHistory.push({ // 访问 riskHistory
      type, // 执行语句
      details, // 执行语句
      portfolioState: { ...this.portfolioState }, // portfolioState
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 限制历史长度 / Limit history length
    if (this.riskHistory.length > 200) { // 条件判断 this.riskHistory.length > 200
      this.riskHistory = this.riskHistory.slice(-200); // 设置 riskHistory
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 手动恢复交易
   * Manual resume trading
   */
  resumeTrading() { // 调用 resumeTrading
    this.portfolioState.tradingAllowed = true; // 访问 portfolioState
    this.portfolioState.pauseReason = null; // 访问 portfolioState

    this.log('交易已手动恢复 / Trading manually resumed', 'info'); // 调用 log
    this.emit('tradingResumed', { reason: 'manual' }); // 调用 emit
  } // 结束代码块

  /**
   * 手动暂停交易
   * Manual pause trading
   *
   * @param {string} reason - 原因 / Reason
   */
  pauseTrading(reason = '手动暂停') { // 调用 pauseTrading
    this.portfolioState.tradingAllowed = false; // 访问 portfolioState
    this.portfolioState.pauseReason = reason; // 访问 portfolioState

    this.log(`交易已手动暂停: ${reason}`, 'info'); // 调用 log
    this.emit('tradingPaused', { reason }); // 调用 emit
  } // 结束代码块

  /**
   * 更新总权益
   * Update total equity
   *
   * @param {number} equity - 权益 / Equity
   */
  updateTotalEquity(equity) { // 调用 updateTotalEquity
    this.portfolioState.totalEquity = equity; // 访问 portfolioState

    if (equity > this.portfolioState.peakEquity) { // 条件判断 equity > this.portfolioState.peakEquity
      this.portfolioState.peakEquity = equity; // 访问 portfolioState
    } // 结束代码块

    this._updatePortfolioState(); // 调用 _updatePortfolioState
  } // 结束代码块

  /**
   * 获取风控状态
   * Get risk status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      running: this.running, // running
      portfolioState: { ...this.portfolioState }, // portfolioState
      strategyCount: this.strategyStates.size, // 策略数量
      strategies: Object.fromEntries( // 策略
        [...this.strategyStates].map(([id, state]) => [ // 定义箭头函数
          id, // 执行语句
          { // 开始代码块
            positionValue: state.positionValue, // 持仓Value
            equity: state.equity, // equity
            tradingAllowed: state.tradingAllowed, // 交易Allowed
          }, // 结束代码块
        ]) // 结束数组或索引
      ), // 结束调用或参数
      riskBudgets: Object.fromEntries(this.riskBudgets), // 风险Budgets
      recentRiskEvents: this.riskHistory.slice(-10), // recent风险Events
      config: { // 配置
        maxTotalPositionRatio: this.config.maxTotalPositionRatio, // 最大总持仓比例
        maxPortfolioDrawdown: this.config.maxPortfolioDrawdown, // 最大Portfolio回撤
        maxDailyDrawdown: this.config.maxDailyDrawdown, // 最大每日回撤
        highCorrelationThreshold: this.config.highCorrelationThreshold, // 最高Correlation阈值
        maxVaR: this.config.maxVaR, // 最大VaR
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取风险报告
   * Get risk report
   *
   * @returns {Object} 风险报告 / Risk report
   */
  getRiskReport() { // 调用 getRiskReport
    return { // 返回结果
      timestamp: Date.now(), // 时间戳
      portfolio: { // portfolio
        totalEquity: this.portfolioState.totalEquity, // 总Equity
        totalPositionValue: this.portfolioState.totalPositionValue, // 总持仓Value
        positionRatio: this.portfolioState.positionRatio, // 持仓比例
        currentDrawdown: this.portfolioState.currentDrawdown, // current回撤
        dailyDrawdown: this.portfolioState.dailyDrawdown, // 每日回撤
        weeklyDrawdown: this.portfolioState.weeklyDrawdown, // weekly回撤
        riskLevel: this.portfolioState.riskLevel, // 风险级别
        tradingAllowed: this.portfolioState.tradingAllowed, // 交易Allowed
      }, // 结束代码块
      var: this._calculatePortfolioVaR(), // var
      strategies: Object.fromEntries(this.strategyStates), // 策略
      riskBudgets: Object.fromEntries(this.riskBudgets), // 风险Budgets
      recentEvents: this.riskHistory.slice(-20), // recentEvents
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
      default: // 默认
        console.log(fullMessage); // 控制台输出
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { PORTFOLIO_RISK_LEVEL, RISK_ACTION, DEFAULT_CONFIG }; // 导出命名成员
export default PortfolioRiskManager; // 默认导出
