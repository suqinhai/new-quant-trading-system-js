/**
 * 跨账户风险汇总器
 * Multi-Account Risk Aggregator
 *
 * 功能 / Features:
 * 1. 多账户统一监控 / Unified multi-account monitoring
 * 2. 总风险敞口计算 / Total risk exposure calculation
 * 3. 跨账户相关性分析 / Cross-account correlation analysis
 * 4. 统一风险限额管理 / Unified risk limit management
 * 5. 账户间风险传导检测 / Inter-account risk contagion detection
 * 6. 全局紧急处理 / Global emergency handling
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 账户状态
 * Account status
 */
const ACCOUNT_STATUS = { // 定义常量 ACCOUNT_STATUS
  ACTIVE: 'active',           // 活跃 / Active
  INACTIVE: 'inactive',       // 非活跃 / Inactive
  WARNING: 'warning',         // 警告 / Warning
  SUSPENDED: 'suspended',     // 暂停 / Suspended
  ERROR: 'error',             // 错误 / Error
}; // 结束代码块

/**
 * 全局风险级别
 * Global risk level
 */
const GLOBAL_RISK_LEVEL = { // 定义常量 GLOBAL_RISK_LEVEL
  LOW: 'low',             // 低 / Low
  NORMAL: 'normal',       // 正常 / Normal
  ELEVATED: 'elevated',   // 升高 / Elevated
  HIGH: 'high',           // 高 / High
  CRITICAL: 'critical',   // 严重 / Critical
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 全局风险限额 / Global Risk Limits
  // ============================================

  // 总最大权益敞口 (USD) / Maximum total equity exposure (USD)
  maxTotalEquity: 10000000, // 总最大权益敞口 (USD)

  // 总最大仓位价值 (USD) / Maximum total position value (USD)
  maxTotalPositionValue: 5000000, // 总最大仓位价值 (USD)

  // 全局最大杠杆 / Global maximum leverage
  maxGlobalLeverage: 3.0, // 最大全局杠杆

  // 全局最大回撤 / Global maximum drawdown
  maxGlobalDrawdown: 0.15, // 最大全局回撤

  // 单日最大亏损 / Maximum daily loss
  maxDailyLoss: 0.05, // 最大每日亏损

  // ============================================
  // 账户限额 / Per-Account Limits
  // ============================================

  // 单账户最大权益占比 / Maximum single account equity ratio
  maxSingleAccountRatio: 0.40, // 单账户最大权益占比

  // 单账户最大仓位占比 / Maximum single account position ratio
  maxSingleAccountPositionRatio: 0.30, // 单账户最大仓位占比

  // ============================================
  // 相关性限制 / Correlation Limits
  // ============================================

  // 账户间高相关性阈值 / High correlation threshold between accounts
  accountCorrelationThreshold: 0.70, // 账户间高相关性阈值

  // 高相关账户对最大数量 / Maximum high correlation account pairs
  maxHighCorrelationPairs: 2, // 高相关账户对最大数量

  // ============================================
  // 集中度限制 / Concentration Limits
  // ============================================

  // 单一交易所最大敞口比例 / Maximum single exchange exposure ratio
  maxSingleExchangeRatio: 0.50, // 单一交易所最大敞口比例

  // 单一币种最大敞口比例 / Maximum single currency exposure ratio
  maxSingleCurrencyRatio: 0.30, // 单一币种最大敞口比例

  // 单一交易对最大敞口比例 / Maximum single symbol exposure ratio
  maxSingleSymbolRatio: 0.20, // 单一交易对最大敞口比例

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 检查间隔 (毫秒) / Check interval (ms)
  checkInterval: 10000, // 10秒 / 10 seconds

  // 账户超时时间 (毫秒) / Account timeout (ms)
  accountTimeout: 60000, // 1分钟 / 1 minute

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志

  // 日志前缀 / Log prefix
  logPrefix: '[MultiAccountRisk]', // 日志前缀
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 跨账户风险汇总器
 * Multi-Account Risk Aggregator
 */
export class MultiAccountRiskAggregator extends EventEmitter { // 导出类 MultiAccountRiskAggregator
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

    // 账户数据 / Account data
    // 格式: { accountId: { exchange, equity, positions, pnl, status, ... } }
    this.accounts = new Map(); // 设置 accounts

    // 账户风控管理器引用 / Account risk manager references
    // 格式: { accountId: RiskManager }
    this.accountRiskManagers = new Map(); // 设置 accountRiskManagers

    // 全局状态 / Global state
    this.globalState = { // 设置 globalState
      totalEquity: 0, // 总Equity
      totalPositionValue: 0, // 总持仓Value
      globalLeverage: 0, // 全局杠杆
      globalDrawdown: 0, // 全局回撤
      dailyPnL: 0, // 每日PnL
      dailyPnLPercent: 0, // 每日PnL百分比
      riskLevel: GLOBAL_RISK_LEVEL.NORMAL, // 风险级别
      tradingAllowed: true, // 交易Allowed
      pauseReason: null, // 暂停Reason
    }; // 结束代码块

    // 峰值权益 (用于计算回撤) / Peak equity (for drawdown calculation)
    this.peakEquity = 0; // 设置 peakEquity

    // 每日起始权益 / Daily start equity
    this.dailyStartEquity = 0; // 设置 dailyStartEquity

    // 账户历史收益 (用于相关性分析) / Account historical returns (for correlation analysis)
    // 格式: { accountId: [return1, return2, ...] }
    this.accountReturns = new Map(); // 设置 accountReturns

    // 风险事件历史 / Risk event history
    this.riskEvents = []; // 设置 riskEvents

    // 敞口分析缓存 / Exposure analysis cache
    this.exposureAnalysis = null; // 设置 exposureAnalysis
    this.exposureAnalysisTime = 0; // 设置 exposureAnalysisTime

    // 运行状态 / Running state
    this.running = false; // 设置 running

    // 定时器 / Timer
    this.checkTimer = null; // 设置 checkTimer
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化
   * Initialize
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) { // 执行语句
    const { initialEquity } = options; // 解构赋值

    if (initialEquity) { // 条件判断 initialEquity
      this.globalState.totalEquity = initialEquity; // 访问 globalState
      this.peakEquity = initialEquity; // 设置 peakEquity
      this.dailyStartEquity = initialEquity; // 设置 dailyStartEquity
    } // 结束代码块

    this.log('跨账户风险汇总器初始化完成 / Multi-account risk aggregator initialized', 'info'); // 调用 log
  } // 结束代码块

  /**
   * 启动
   * Start
   */
  start() { // 调用 start
    if (this.running) return; // 条件判断 this.running

    this.running = true; // 设置 running

    // 启动定时检查 / Start periodic check
    this.checkTimer = setInterval( // 设置 checkTimer
      () => this._performGlobalRiskCheck(), // 定义箭头函数
      this.config.checkInterval // 访问 config
    ); // 结束调用或参数

    this.log('跨账户风险汇总器已启动 / Multi-account risk aggregator started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止
   * Stop
   */
  stop() { // 调用 stop
    if (!this.running) return; // 条件判断 !this.running

    this.running = false; // 设置 running

    if (this.checkTimer) { // 条件判断 this.checkTimer
      clearInterval(this.checkTimer); // 调用 clearInterval
      this.checkTimer = null; // 设置 checkTimer
    } // 结束代码块

    this.log('跨账户风险汇总器已停止 / Multi-account risk aggregator stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 账户管理 / Account Management
  // ============================================

  /**
   * 注册账户
   * Register account
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} config - 账户配置 / Account config
   */
  registerAccount(accountId, config = {}) { // 调用 registerAccount
    const account = { // 定义常量 account
      id: accountId, // ID
      exchange: config.exchange || 'unknown', // 交易所
      subAccount: config.subAccount || null, // sub账户
      equity: config.initialEquity || 0, // equity
      availableBalance: config.initialEquity || 0, // available余额
      positions: [], // 持仓
      positionValue: 0, // 持仓Value
      unrealizedPnL: 0, // 未实现PnL
      realizedPnL: 0, // 已实现PnL
      dailyPnL: 0, // 每日PnL
      leverage: 0, // 杠杆
      status: ACCOUNT_STATUS.ACTIVE, // 状态
      lastUpdate: Date.now(), // last更新
      registeredAt: Date.now(), // registeredAt
      riskBudget: config.riskBudget || 0, // 风险Budget
      maxPositionRatio: config.maxPositionRatio || this.config.maxSingleAccountPositionRatio, // 最大持仓比例
    }; // 结束代码块

    this.accounts.set(accountId, account); // 访问 accounts

    // 初始化账户收益历史 / Initialize account returns history
    this.accountReturns.set(accountId, []); // 访问 accountReturns

    this.log(`注册账户: ${accountId} (${config.exchange}) / Account registered: ${accountId}`, 'info'); // 调用 log
    this.emit('accountRegistered', { accountId, config }); // 调用 emit

    // 更新全局状态 / Update global state
    this._updateGlobalState(); // 调用 _updateGlobalState
  } // 结束代码块

  /**
   * 注销账户
   * Unregister account
   *
   * @param {string} accountId - 账户ID / Account ID
   */
  unregisterAccount(accountId) { // 调用 unregisterAccount
    if (!this.accounts.has(accountId)) return; // 条件判断 !this.accounts.has(accountId)

    this.accounts.delete(accountId); // 访问 accounts
    this.accountReturns.delete(accountId); // 访问 accountReturns
    this.accountRiskManagers.delete(accountId); // 访问 accountRiskManagers

    this.log(`注销账户: ${accountId} / Account unregistered: ${accountId}`, 'info'); // 调用 log
    this.emit('accountUnregistered', { accountId }); // 调用 emit

    // 更新全局状态 / Update global state
    this._updateGlobalState(); // 调用 _updateGlobalState
  } // 结束代码块

  /**
   * 更新账户数据
   * Update account data
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} data - 账户数据 / Account data
   */
  updateAccount(accountId, data) { // 调用 updateAccount
    let account = this.accounts.get(accountId); // 定义变量 account

    if (!account) { // 条件判断 !account
      // 自动注册账户 / Auto-register account
      this.registerAccount(accountId, { exchange: data.exchange }); // 调用 registerAccount
      account = this.accounts.get(accountId); // 赋值 account
    } // 结束代码块

    const previousEquity = account.equity; // 定义常量 previousEquity

    // 更新账户数据 / Update account data
    Object.assign(account, { // 调用 Object.assign
      ...data, // 展开对象或数组
      lastUpdate: Date.now(), // last更新
    }); // 结束代码块

    // 计算仓位价值 / Calculate position value
    if (data.positions) { // 条件判断 data.positions
      account.positionValue = data.positions.reduce((sum, pos) => { // 赋值 account.positionValue
        return sum + Math.abs(pos.size || pos.amount) * (pos.markPrice || pos.entryPrice || 0); // 返回结果
      }, 0); // 执行语句

      // 计算杠杆 / Calculate leverage
      account.leverage = account.equity > 0 // 赋值 account.leverage
        ? account.positionValue / account.equity // 执行语句
        : 0; // 执行语句
    } // 结束代码块

    // 记录收益用于相关性分析 / Record return for correlation analysis
    if (previousEquity > 0 && account.equity > 0) { // 条件判断 previousEquity > 0 && account.equity > 0
      const accountReturn = (account.equity - previousEquity) / previousEquity; // 定义常量 accountReturn
      const returns = this.accountReturns.get(accountId); // 定义常量 returns
      returns.push(accountReturn); // 调用 returns.push

      // 限制历史长度 / Limit history length
      if (returns.length > 100) { // 条件判断 returns.length > 100
        returns.shift(); // 调用 returns.shift
      } // 结束代码块
    } // 结束代码块

    // 更新全局状态 / Update global state
    this._updateGlobalState(); // 调用 _updateGlobalState

    // 检查账户级别风险 / Check account-level risk
    this._checkAccountRisk(accountId); // 调用 _checkAccountRisk
  } // 结束代码块

  /**
   * 设置账户风控管理器
   * Set account risk manager
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} riskManager - 风控管理器 / Risk manager
   */
  setAccountRiskManager(accountId, riskManager) { // 调用 setAccountRiskManager
    this.accountRiskManagers.set(accountId, riskManager); // 访问 accountRiskManagers

    // 监听账户风控事件 / Listen to account risk events
    if (riskManager && typeof riskManager.on === 'function') { // 条件判断 riskManager && typeof riskManager.on === 'fun...
      riskManager.on('riskTriggered', (event) => { // 注册事件监听
        this._handleAccountRiskEvent(accountId, event); // 调用 _handleAccountRiskEvent
      }); // 结束代码块

      riskManager.on('tradingDisabled', (event) => { // 注册事件监听
        this._handleAccountStatusChange(accountId, ACCOUNT_STATUS.SUSPENDED, event.reason); // 调用 _handleAccountStatusChange
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 全局状态更新 / Global State Update
  // ============================================

  /**
   * 更新全局状态
   * Update global state
   * @private
   */
  _updateGlobalState() { // 调用 _updateGlobalState
    let totalEquity = 0; // 定义变量 totalEquity
    let totalPositionValue = 0; // 定义变量 totalPositionValue
    let totalDailyPnL = 0; // 定义变量 totalDailyPnL

    // 汇总所有账户 / Aggregate all accounts
    for (const [, account] of this.accounts) { // 循环 const [, account] of this.accounts
      if (account.status === ACCOUNT_STATUS.ACTIVE || // 条件判断 account.status === ACCOUNT_STATUS.ACTIVE ||
          account.status === ACCOUNT_STATUS.WARNING) { // 赋值 account.status
        totalEquity += account.equity || 0; // 执行语句
        totalPositionValue += account.positionValue || 0; // 执行语句
        totalDailyPnL += account.dailyPnL || 0; // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 更新全局状态 / Update global state
    this.globalState.totalEquity = totalEquity; // 访问 globalState
    this.globalState.totalPositionValue = totalPositionValue; // 访问 globalState
    this.globalState.dailyPnL = totalDailyPnL; // 访问 globalState

    // 更新峰值权益 / Update peak equity
    if (totalEquity > this.peakEquity) { // 条件判断 totalEquity > this.peakEquity
      this.peakEquity = totalEquity; // 设置 peakEquity
    } // 结束代码块

    // 计算全局杠杆 / Calculate global leverage
    this.globalState.globalLeverage = totalEquity > 0 // 访问 globalState
      ? totalPositionValue / totalEquity // 执行语句
      : 0; // 执行语句

    // 计算全局回撤 / Calculate global drawdown
    this.globalState.globalDrawdown = this.peakEquity > 0 // 访问 globalState
      ? (this.peakEquity - totalEquity) / this.peakEquity // 执行语句
      : 0; // 执行语句

    // 计算日收益率 / Calculate daily return
    this.globalState.dailyPnLPercent = this.dailyStartEquity > 0 // 访问 globalState
      ? totalDailyPnL / this.dailyStartEquity // 执行语句
      : 0; // 执行语句

    // 更新敞口分析 / Update exposure analysis
    this._updateExposureAnalysis(); // 调用 _updateExposureAnalysis
  } // 结束代码块

  // ============================================
  // 风险检查 / Risk Checks
  // ============================================

  /**
   * 执行全局风险检查
   * Perform global risk check
   * @private
   */
  async _performGlobalRiskCheck() { // 执行语句
    if (!this.running) return; // 条件判断 !this.running

    // 检查日期重置 / Check date reset
    this._checkDailyReset(); // 调用 _checkDailyReset

    // 检查账户超时 / Check account timeout
    this._checkAccountTimeouts(); // 调用 _checkAccountTimeouts

    const riskResults = []; // 定义常量 riskResults

    // 1. 检查总权益限额 / Check total equity limit
    riskResults.push(this._checkEquityLimit()); // 调用 riskResults.push

    // 2. 检查总仓位限额 / Check total position limit
    riskResults.push(this._checkPositionLimit()); // 调用 riskResults.push

    // 3. 检查全局杠杆 / Check global leverage
    riskResults.push(this._checkGlobalLeverage()); // 调用 riskResults.push

    // 4. 检查全局回撤 / Check global drawdown
    riskResults.push(this._checkGlobalDrawdown()); // 调用 riskResults.push

    // 5. 检查每日亏损 / Check daily loss
    riskResults.push(this._checkDailyLoss()); // 调用 riskResults.push

    // 6. 检查账户集中度 / Check account concentration
    riskResults.push(this._checkAccountConcentration()); // 调用 riskResults.push

    // 7. 检查敞口集中度 / Check exposure concentration
    riskResults.push(this._checkExposureConcentration()); // 调用 riskResults.push

    // 8. 检查账户间相关性 / Check inter-account correlation
    riskResults.push(this._checkAccountCorrelation()); // 调用 riskResults.push

    // 更新全局风险级别 / Update global risk level
    this._updateGlobalRiskLevel(riskResults); // 调用 _updateGlobalRiskLevel

    // 执行风控动作 / Execute risk actions
    await this._executeGlobalRiskActions(riskResults); // 等待异步结果
  } // 结束代码块

  /**
   * 检查账户风险
   * Check account risk
   *
   * @param {string} accountId - 账户ID / Account ID
   * @private
   */
  _checkAccountRisk(accountId) { // 调用 _checkAccountRisk
    const account = this.accounts.get(accountId); // 定义常量 account
    if (!account) return; // 条件判断 !account

    const warnings = []; // 定义常量 warnings

    // 检查账户权益占比 / Check account equity ratio
    if (this.globalState.totalEquity > 0) { // 条件判断 this.globalState.totalEquity > 0
      const equityRatio = account.equity / this.globalState.totalEquity; // 定义常量 equityRatio
      if (equityRatio > this.config.maxSingleAccountRatio) { // 条件判断 equityRatio > this.config.maxSingleAccountRatio
        warnings.push(`账户权益占比过高: ${(equityRatio * 100).toFixed(1)}%`); // 调用 warnings.push
      } // 结束代码块
    } // 结束代码块

    // 检查账户杠杆 / Check account leverage
    if (account.leverage > this.config.maxGlobalLeverage) { // 条件判断 account.leverage > this.config.maxGlobalLeverage
      warnings.push(`账户杠杆过高: ${account.leverage.toFixed(2)}x`); // 调用 warnings.push
    } // 结束代码块

    // 检查账户仓位占比 / Check account position ratio
    if (this.globalState.totalPositionValue > 0) { // 条件判断 this.globalState.totalPositionValue > 0
      const positionRatio = account.positionValue / this.globalState.totalPositionValue; // 定义常量 positionRatio
      if (positionRatio > this.config.maxSingleAccountPositionRatio) { // 条件判断 positionRatio > this.config.maxSingleAccountP...
        warnings.push(`账户仓位占比过高: ${(positionRatio * 100).toFixed(1)}%`); // 调用 warnings.push
      } // 结束代码块
    } // 结束代码块

    // 如果有警告，更新账户状态 / Update account status if warnings
    if (warnings.length > 0) { // 条件判断 warnings.length > 0
      account.status = ACCOUNT_STATUS.WARNING; // 赋值 account.status
      this.emit('accountWarning', { accountId, warnings }); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查权益限额
   * Check equity limit
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkEquityLimit() { // 调用 _checkEquityLimit
    const result = { // 定义常量 result
      type: 'equityLimit', // 类型
      passed: true, // passed
      message: null, // 消息
    }; // 结束代码块

    if (this.globalState.totalEquity > this.config.maxTotalEquity) { // 条件判断 this.globalState.totalEquity > this.config.ma...
      result.passed = false; // 赋值 result.passed
      result.message = `总权益超限: $${(this.globalState.totalEquity / 1e6).toFixed(2)}M > $${(this.config.maxTotalEquity / 1e6).toFixed(2)}M`; // 赋值 result.message
      result.severity = 'warning'; // 赋值 result.severity
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查仓位限额
   * Check position limit
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkPositionLimit() { // 调用 _checkPositionLimit
    const result = { // 定义常量 result
      type: 'positionLimit', // 类型
      passed: true, // passed
      message: null, // 消息
    }; // 结束代码块

    if (this.globalState.totalPositionValue > this.config.maxTotalPositionValue) { // 条件判断 this.globalState.totalPositionValue > this.co...
      result.passed = false; // 赋值 result.passed
      result.message = `总仓位超限: $${(this.globalState.totalPositionValue / 1e6).toFixed(2)}M > $${(this.config.maxTotalPositionValue / 1e6).toFixed(2)}M`; // 赋值 result.message
      result.severity = 'high'; // 赋值 result.severity
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查全局杠杆
   * Check global leverage
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkGlobalLeverage() { // 调用 _checkGlobalLeverage
    const result = { // 定义常量 result
      type: 'globalLeverage', // 类型
      passed: true, // passed
      message: null, // 消息
    }; // 结束代码块

    if (this.globalState.globalLeverage > this.config.maxGlobalLeverage) { // 条件判断 this.globalState.globalLeverage > this.config...
      result.passed = false; // 赋值 result.passed
      result.message = `全局杠杆超限: ${this.globalState.globalLeverage.toFixed(2)}x > ${this.config.maxGlobalLeverage}x`; // 赋值 result.message
      result.severity = 'high'; // 赋值 result.severity
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查全局回撤
   * Check global drawdown
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkGlobalDrawdown() { // 调用 _checkGlobalDrawdown
    const result = { // 定义常量 result
      type: 'globalDrawdown', // 类型
      passed: true, // passed
      message: null, // 消息
    }; // 结束代码块

    if (this.globalState.globalDrawdown > this.config.maxGlobalDrawdown) { // 条件判断 this.globalState.globalDrawdown > this.config...
      result.passed = false; // 赋值 result.passed
      result.message = `全局回撤超限: ${(this.globalState.globalDrawdown * 100).toFixed(2)}% > ${(this.config.maxGlobalDrawdown * 100).toFixed(0)}%`; // 赋值 result.message
      result.severity = 'critical'; // 赋值 result.severity
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查每日亏损
   * Check daily loss
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkDailyLoss() { // 调用 _checkDailyLoss
    const result = { // 定义常量 result
      type: 'dailyLoss', // 类型
      passed: true, // passed
      message: null, // 消息
    }; // 结束代码块

    if (this.globalState.dailyPnLPercent < -this.config.maxDailyLoss) { // 条件判断 this.globalState.dailyPnLPercent < -this.conf...
      result.passed = false; // 赋值 result.passed
      result.message = `每日亏损超限: ${(this.globalState.dailyPnLPercent * 100).toFixed(2)}% < -${(this.config.maxDailyLoss * 100).toFixed(0)}%`; // 赋值 result.message
      result.severity = 'critical'; // 赋值 result.severity
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查账户集中度
   * Check account concentration
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkAccountConcentration() { // 调用 _checkAccountConcentration
    const result = { // 定义常量 result
      type: 'accountConcentration', // 类型
      passed: true, // passed
      message: null, // 消息
      details: [], // details
    }; // 结束代码块

    for (const [accountId, account] of this.accounts) { // 循环 const [accountId, account] of this.accounts
      if (this.globalState.totalEquity > 0) { // 条件判断 this.globalState.totalEquity > 0
        const ratio = account.equity / this.globalState.totalEquity; // 定义常量 ratio
        if (ratio > this.config.maxSingleAccountRatio) { // 条件判断 ratio > this.config.maxSingleAccountRatio
          result.passed = false; // 赋值 result.passed
          result.details.push({ // 调用 result.details.push
            accountId, // 执行语句
            ratio, // 执行语句
            limit: this.config.maxSingleAccountRatio, // 限制
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    if (!result.passed) { // 条件判断 !result.passed
      result.message = `账户集中度过高: ${result.details.map((d) => `${d.accountId}(${(d.ratio * 100).toFixed(1)}%)`).join(', ')}`; // 赋值 result.message
      result.severity = 'warning'; // 赋值 result.severity
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 更新敞口分析
   * Update exposure analysis
   * @private
   */
  _updateExposureAnalysis() { // 调用 _updateExposureAnalysis
    const now = Date.now(); // 定义常量 now

    // 缓存5秒 / Cache for 5 seconds
    if (this.exposureAnalysis && now - this.exposureAnalysisTime < 5000) { // 条件判断 this.exposureAnalysis && now - this.exposureA...
      return; // 返回结果
    } // 结束代码块

    // 按交易所汇总 / Aggregate by exchange
    const byExchange = new Map(); // 定义常量 byExchange

    // 按币种汇总 / Aggregate by currency
    const byCurrency = new Map(); // 定义常量 byCurrency

    // 按交易对汇总 / Aggregate by symbol
    const bySymbol = new Map(); // 定义常量 bySymbol

    for (const [, account] of this.accounts) { // 循环 const [, account] of this.accounts
      // 交易所敞口 / Exchange exposure
      const exchange = account.exchange || 'unknown'; // 定义常量 exchange
      byExchange.set(exchange, (byExchange.get(exchange) || 0) + account.positionValue); // 调用 byExchange.set

      // 遍历仓位 / Iterate positions
      if (account.positions) { // 条件判断 account.positions
        for (const pos of account.positions) { // 循环 const pos of account.positions
          const posValue = Math.abs(pos.size || pos.amount) * (pos.markPrice || pos.entryPrice || 0); // 定义常量 posValue

          // 交易对敞口 / Symbol exposure
          const symbol = pos.symbol; // 定义常量 symbol
          bySymbol.set(symbol, (bySymbol.get(symbol) || 0) + posValue); // 调用 bySymbol.set

          // 币种敞口 (提取基础货币) / Currency exposure (extract base currency)
          const baseCurrency = symbol ? symbol.replace(/[-_/].*$/, '').replace(/USDT?$/, '') : 'UNKNOWN'; // 定义常量 baseCurrency
          byCurrency.set(baseCurrency, (byCurrency.get(baseCurrency) || 0) + posValue); // 调用 byCurrency.set
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    this.exposureAnalysis = { // 设置 exposureAnalysis
      byExchange: Object.fromEntries(byExchange), // by交易所
      byCurrency: Object.fromEntries(byCurrency), // byCurrency
      bySymbol: Object.fromEntries(bySymbol), // by交易对
      totalPositionValue: this.globalState.totalPositionValue, // 总持仓Value
    }; // 结束代码块
    this.exposureAnalysisTime = now; // 设置 exposureAnalysisTime
  } // 结束代码块

  /**
   * 检查敞口集中度
   * Check exposure concentration
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkExposureConcentration() { // 调用 _checkExposureConcentration
    const result = { // 定义常量 result
      type: 'exposureConcentration', // 类型
      passed: true, // passed
      message: null, // 消息
      details: [], // details
    }; // 结束代码块

    if (!this.exposureAnalysis || this.globalState.totalPositionValue === 0) { // 条件判断 !this.exposureAnalysis || this.globalState.to...
      return result; // 返回结果
    } // 结束代码块

    const total = this.globalState.totalPositionValue; // 定义常量 total

    // 检查交易所集中度 / Check exchange concentration
    for (const [exchange, value] of Object.entries(this.exposureAnalysis.byExchange)) { // 循环 const [exchange, value] of Object.entries(thi...
      const ratio = value / total; // 定义常量 ratio
      if (ratio > this.config.maxSingleExchangeRatio) { // 条件判断 ratio > this.config.maxSingleExchangeRatio
        result.details.push({ // 调用 result.details.push
          type: 'exchange', // 类型
          name: exchange, // name
          ratio, // 执行语句
          limit: this.config.maxSingleExchangeRatio, // 限制
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 检查币种集中度 / Check currency concentration
    for (const [currency, value] of Object.entries(this.exposureAnalysis.byCurrency)) { // 循环 const [currency, value] of Object.entries(thi...
      const ratio = value / total; // 定义常量 ratio
      if (ratio > this.config.maxSingleCurrencyRatio) { // 条件判断 ratio > this.config.maxSingleCurrencyRatio
        result.details.push({ // 调用 result.details.push
          type: 'currency', // 类型
          name: currency, // name
          ratio, // 执行语句
          limit: this.config.maxSingleCurrencyRatio, // 限制
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 检查交易对集中度 / Check symbol concentration
    for (const [symbol, value] of Object.entries(this.exposureAnalysis.bySymbol)) { // 循环 const [symbol, value] of Object.entries(this....
      const ratio = value / total; // 定义常量 ratio
      if (ratio > this.config.maxSingleSymbolRatio) { // 条件判断 ratio > this.config.maxSingleSymbolRatio
        result.details.push({ // 调用 result.details.push
          type: 'symbol', // 类型
          name: symbol, // name
          ratio, // 执行语句
          limit: this.config.maxSingleSymbolRatio, // 限制
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    if (result.details.length > 0) { // 条件判断 result.details.length > 0
      result.passed = false; // 赋值 result.passed
      result.message = `敞口集中度过高: ${result.details.map((d) => `${d.name}(${(d.ratio * 100).toFixed(1)}%)`).join(', ')}`; // 赋值 result.message
      result.severity = 'warning'; // 赋值 result.severity
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查账户间相关性
   * Check inter-account correlation
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkAccountCorrelation() { // 调用 _checkAccountCorrelation
    const result = { // 定义常量 result
      type: 'accountCorrelation', // 类型
      passed: true, // passed
      message: null, // 消息
      highCorrelationPairs: [], // 最高CorrelationPairs
    }; // 结束代码块

    const accountIds = [...this.accounts.keys()]; // 定义常量 accountIds

    // 需要至少2个账户 / Need at least 2 accounts
    if (accountIds.length < 2) { // 条件判断 accountIds.length < 2
      return result; // 返回结果
    } // 结束代码块

    // 计算两两相关性 / Calculate pairwise correlation
    for (let i = 0; i < accountIds.length - 1; i++) { // 循环 let i = 0; i < accountIds.length - 1; i++
      for (let j = i + 1; j < accountIds.length; j++) { // 循环 let j = i + 1; j < accountIds.length; j++
        const returns1 = this.accountReturns.get(accountIds[i]); // 定义常量 returns1
        const returns2 = this.accountReturns.get(accountIds[j]); // 定义常量 returns2

        // 需要足够的数据点 / Need enough data points
        if (!returns1 || !returns2 || returns1.length < 10 || returns2.length < 10) { // 条件判断 !returns1 || !returns2 || returns1.length < 1...
          continue; // 继续下一轮循环
        } // 结束代码块

        const correlation = this._calculateCorrelation(returns1, returns2); // 定义常量 correlation

        if (Math.abs(correlation) >= this.config.accountCorrelationThreshold) { // 条件判断 Math.abs(correlation) >= this.config.accountC...
          result.highCorrelationPairs.push({ // 调用 result.highCorrelationPairs.push
            accounts: [accountIds[i], accountIds[j]], // accounts
            correlation, // 执行语句
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    if (result.highCorrelationPairs.length > this.config.maxHighCorrelationPairs) { // 条件判断 result.highCorrelationPairs.length > this.con...
      result.passed = false; // 赋值 result.passed
      result.message = `账户相关性过高: ${result.highCorrelationPairs.length}对 > ${this.config.maxHighCorrelationPairs}对`; // 赋值 result.message
      result.severity = 'warning'; // 赋值 result.severity
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 计算相关系数
   * Calculate correlation coefficient
   *
   * @param {Array} x - 数组1 / Array 1
   * @param {Array} y - 数组2 / Array 2
   * @returns {number} 相关系数 / Correlation coefficient
   * @private
   */
  _calculateCorrelation(x, y) { // 调用 _calculateCorrelation
    const n = Math.min(x.length, y.length); // 定义常量 n
    if (n < 2) return 0; // 条件判断 n < 2

    const xSlice = x.slice(-n); // 定义常量 xSlice
    const ySlice = y.slice(-n); // 定义常量 ySlice

    const meanX = xSlice.reduce((a, b) => a + b, 0) / n; // 定义函数 meanX
    const meanY = ySlice.reduce((a, b) => a + b, 0) / n; // 定义函数 meanY

    let numerator = 0; // 定义变量 numerator
    let denomX = 0; // 定义变量 denomX
    let denomY = 0; // 定义变量 denomY

    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      const dx = xSlice[i] - meanX; // 定义常量 dx
      const dy = ySlice[i] - meanY; // 定义常量 dy
      numerator += dx * dy; // 执行语句
      denomX += dx * dx; // 执行语句
      denomY += dy * dy; // 执行语句
    } // 结束代码块

    const denom = Math.sqrt(denomX * denomY); // 定义常量 denom
    return denom === 0 ? 0 : numerator / denom; // 返回结果
  } // 结束代码块

  // ============================================
  // 风险级别和动作 / Risk Level and Actions
  // ============================================

  /**
   * 更新全局风险级别
   * Update global risk level
   *
   * @param {Array} results - 检查结果 / Check results
   * @private
   */
  _updateGlobalRiskLevel(results) { // 调用 _updateGlobalRiskLevel
    const failedResults = results.filter((r) => !r.passed); // 定义函数 failedResults

    let newLevel = GLOBAL_RISK_LEVEL.LOW; // 定义变量 newLevel

    // 根据失败检查的严重程度确定风险级别 / Determine risk level based on severity
    for (const result of failedResults) { // 循环 const result of failedResults
      if (result.severity === 'critical') { // 条件判断 result.severity === 'critical'
        newLevel = GLOBAL_RISK_LEVEL.CRITICAL; // 赋值 newLevel
        break; // 跳出循环或分支
      } else if (result.severity === 'high' && newLevel !== GLOBAL_RISK_LEVEL.CRITICAL) { // 执行语句
        newLevel = GLOBAL_RISK_LEVEL.HIGH; // 赋值 newLevel
      } else if (result.severity === 'warning' && // 执行语句
                 newLevel !== GLOBAL_RISK_LEVEL.CRITICAL && // 执行语句
                 newLevel !== GLOBAL_RISK_LEVEL.HIGH) { // 执行语句
        newLevel = GLOBAL_RISK_LEVEL.ELEVATED; // 赋值 newLevel
      } // 结束代码块
    } // 结束代码块

    // 如果没有失败，检查接近限制的情况 / If no failures, check near-limit conditions
    if (failedResults.length === 0) { // 条件判断 failedResults.length === 0
      if (this.globalState.globalDrawdown > this.config.maxGlobalDrawdown * 0.7 || // 条件判断 this.globalState.globalDrawdown > this.config...
          this.globalState.globalLeverage > this.config.maxGlobalLeverage * 0.8) { // 访问 globalState
        newLevel = GLOBAL_RISK_LEVEL.ELEVATED; // 赋值 newLevel
      } else { // 执行语句
        newLevel = GLOBAL_RISK_LEVEL.NORMAL; // 赋值 newLevel
      } // 结束代码块
    } // 结束代码块

    // 如果风险级别变化，发出事件 / Emit event if risk level changed
    if (newLevel !== this.globalState.riskLevel) { // 条件判断 newLevel !== this.globalState.riskLevel
      const previousLevel = this.globalState.riskLevel; // 定义常量 previousLevel
      this.globalState.riskLevel = newLevel; // 访问 globalState

      this.emit('riskLevelChanged', { // 调用 emit
        previousLevel, // 执行语句
        currentLevel: newLevel, // current级别
        failedChecks: failedResults, // failedChecks
        timestamp: Date.now(), // 时间戳
      }); // 结束代码块

      this.log(`全局风险级别变更: ${previousLevel} -> ${newLevel}`, 'info'); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行全局风控动作
   * Execute global risk actions
   *
   * @param {Array} results - 检查结果 / Check results
   * @private
   */
  async _executeGlobalRiskActions(results) { // 执行语句
    const criticalFailures = results.filter((r) => !r.passed && r.severity === 'critical'); // 定义函数 criticalFailures

    if (criticalFailures.length > 0) { // 条件判断 criticalFailures.length > 0
      // 暂停所有交易 / Pause all trading
      this.globalState.tradingAllowed = false; // 访问 globalState
      this.globalState.pauseReason = criticalFailures.map((r) => r.message).join('; '); // 访问 globalState

      this.log(`🚨 全局交易暂停: ${this.globalState.pauseReason}`, 'error'); // 调用 log

      // 通知所有账户风控管理器 / Notify all account risk managers
      for (const [accountId, riskManager] of this.accountRiskManagers) { // 循环 const [accountId, riskManager] of this.accoun...
        if (riskManager && typeof riskManager.disableTrading === 'function') { // 条件判断 riskManager && typeof riskManager.disableTrad...
          riskManager.disableTrading('全局风险限制'); // 调用 riskManager.disableTrading
        } // 结束代码块
      } // 结束代码块

      // 发出紧急事件 / Emit emergency event
      this.emit('globalEmergency', { // 调用 emit
        failures: criticalFailures, // failures
        globalState: { ...this.globalState }, // 全局State
        timestamp: Date.now(), // 时间戳
      }); // 结束代码块

      // 记录风险事件 / Record risk event
      this._recordRiskEvent('globalEmergency', criticalFailures); // 调用 _recordRiskEvent
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 辅助方法 / Helper Methods
  // ============================================

  /**
   * 检查日期重置
   * Check daily reset
   * @private
   */
  _checkDailyReset() { // 调用 _checkDailyReset
    const now = new Date(); // 定义常量 now
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); // 定义常量 dayStart

    if (this._lastDayStart !== dayStart) { // 条件判断 this._lastDayStart !== dayStart
      this._lastDayStart = dayStart; // 设置 _lastDayStart
      this.dailyStartEquity = this.globalState.totalEquity; // 设置 dailyStartEquity

      // 重置所有账户的日盈亏 / Reset daily PnL for all accounts
      for (const [, account] of this.accounts) { // 循环 const [, account] of this.accounts
        account.dailyPnL = 0; // 赋值 account.dailyPnL
      } // 结束代码块

      // 恢复交易 (如果因为日亏损暂停) / Resume trading if paused due to daily loss
      if (this.globalState.pauseReason?.includes('每日亏损')) { // 条件判断 this.globalState.pauseReason?.includes('每日亏损')
        this.globalState.tradingAllowed = true; // 访问 globalState
        this.globalState.pauseReason = null; // 访问 globalState
        this.log('跨日重置: 交易已恢复 / Daily reset: Trading resumed', 'info'); // 调用 log
      } // 结束代码块

      this.log('跨日重置完成 / Daily reset completed', 'info'); // 调用 log
      this.emit('dailyReset'); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查账户超时
   * Check account timeouts
   * @private
   */
  _checkAccountTimeouts() { // 调用 _checkAccountTimeouts
    const now = Date.now(); // 定义常量 now

    for (const [accountId, account] of this.accounts) { // 循环 const [accountId, account] of this.accounts
      if (account.status === ACCOUNT_STATUS.ACTIVE && // 条件判断 account.status === ACCOUNT_STATUS.ACTIVE &&
          now - account.lastUpdate > this.config.accountTimeout) { // 执行语句
        account.status = ACCOUNT_STATUS.INACTIVE; // 赋值 account.status

        this.log(`账户超时: ${accountId}`, 'warn'); // 调用 log
        this.emit('accountTimeout', { accountId }); // 调用 emit
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理账户风控事件
   * Handle account risk event
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} event - 事件 / Event
   * @private
   */
  _handleAccountRiskEvent(accountId, event) { // 调用 _handleAccountRiskEvent
    this.log(`账户 ${accountId} 风控事件: ${event.message}`, 'warn'); // 调用 log

    // 记录风险事件 / Record risk event
    this._recordRiskEvent('accountRisk', { accountId, event }); // 调用 _recordRiskEvent

    // 发出汇总事件 / Emit aggregated event
    this.emit('accountRiskEvent', { accountId, event }); // 调用 emit
  } // 结束代码块

  /**
   * 处理账户状态变更
   * Handle account status change
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {string} status - 新状态 / New status
   * @param {string} reason - 原因 / Reason
   * @private
   */
  _handleAccountStatusChange(accountId, status, reason) { // 调用 _handleAccountStatusChange
    const account = this.accounts.get(accountId); // 定义常量 account
    if (account) { // 条件判断 account
      account.status = status; // 赋值 account.status
      this.emit('accountStatusChanged', { accountId, status, reason }); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录风险事件
   * Record risk event
   *
   * @param {string} type - 事件类型 / Event type
   * @param {Object} details - 详情 / Details
   * @private
   */
  _recordRiskEvent(type, details) { // 调用 _recordRiskEvent
    this.riskEvents.push({ // 访问 riskEvents
      type, // 执行语句
      details, // 执行语句
      globalState: { ...this.globalState }, // 全局State
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 限制历史长度 / Limit history length
    if (this.riskEvents.length > 500) { // 条件判断 this.riskEvents.length > 500
      this.riskEvents = this.riskEvents.slice(-500); // 设置 riskEvents
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 检查订单是否允许
   * Check if order is allowed
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} order - 订单信息 / Order info
   * @returns {Object} 检查结果 / Check result
   */
  checkOrder(accountId, order) { // 调用 checkOrder
    const result = { // 定义常量 result
      allowed: true, // allowed
      reasons: [], // reasons
      warnings: [], // warnings
    }; // 结束代码块

    // 检查全局交易状态 / Check global trading status
    if (!this.globalState.tradingAllowed) { // 条件判断 !this.globalState.tradingAllowed
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push(`全局交易已暂停: ${this.globalState.pauseReason}`); // 调用 result.reasons.push
      return result; // 返回结果
    } // 结束代码块

    // 检查账户状态 / Check account status
    const account = this.accounts.get(accountId); // 定义常量 account
    if (account && account.status === ACCOUNT_STATUS.SUSPENDED) { // 条件判断 account && account.status === ACCOUNT_STATUS....
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push('账户已暂停交易'); // 调用 result.reasons.push
      return result; // 返回结果
    } // 结束代码块

    // 检查风险级别 / Check risk level
    if (this.globalState.riskLevel === GLOBAL_RISK_LEVEL.CRITICAL) { // 条件判断 this.globalState.riskLevel === GLOBAL_RISK_LE...
      result.allowed = false; // 赋值 result.allowed
      result.reasons.push('全局风险级别过高'); // 调用 result.reasons.push
    } else if (this.globalState.riskLevel === GLOBAL_RISK_LEVEL.HIGH) { // 执行语句
      result.warnings.push('当前全局风险较高，建议谨慎操作'); // 调用 result.warnings.push
    } // 结束代码块

    // 检查订单对集中度的影响 / Check order impact on concentration
    if (order.symbol && this.exposureAnalysis) { // 条件判断 order.symbol && this.exposureAnalysis
      const orderValue = order.amount * (order.price || 0); // 定义常量 orderValue
      const currentSymbolExposure = this.exposureAnalysis.bySymbol[order.symbol] || 0; // 定义常量 currentSymbolExposure
      const newRatio = (currentSymbolExposure + orderValue) / (this.globalState.totalPositionValue + orderValue); // 定义常量 newRatio

      if (newRatio > this.config.maxSingleSymbolRatio) { // 条件判断 newRatio > this.config.maxSingleSymbolRatio
        result.allowed = false; // 赋值 result.allowed
        result.reasons.push(`交易对敞口将超限: ${(newRatio * 100).toFixed(1)}% > ${(this.config.maxSingleSymbolRatio * 100).toFixed(0)}%`); // 调用 result.reasons.push
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取全局状态
   * Get global status
   *
   * @returns {Object} 全局状态 / Global status
   */
  getGlobalStatus() { // 调用 getGlobalStatus
    return { // 返回结果
      running: this.running, // running
      globalState: { ...this.globalState }, // 全局State
      accountCount: this.accounts.size, // 账户数量
      activeAccountCount: [...this.accounts.values()].filter( // 活跃账户数量
        (a) => a.status === ACCOUNT_STATUS.ACTIVE // 定义箭头函数
      ).length, // 执行语句
      peakEquity: this.peakEquity, // peakEquity
      exposureAnalysis: this.exposureAnalysis, // exposureAnalysis
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取账户列表
   * Get account list
   *
   * @returns {Array} 账户列表 / Account list
   */
  getAccounts() { // 调用 getAccounts
    return [...this.accounts.entries()].map(([id, account]) => ({ // 返回结果
      id, // 执行语句
      exchange: account.exchange, // 交易所
      equity: account.equity, // equity
      positionValue: account.positionValue, // 持仓Value
      leverage: account.leverage, // 杠杆
      dailyPnL: account.dailyPnL, // 每日PnL
      status: account.status, // 状态
      lastUpdate: account.lastUpdate, // last更新
    })); // 结束代码块
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
      global: { // 全局
        totalEquity: this.globalState.totalEquity, // 总Equity
        totalPositionValue: this.globalState.totalPositionValue, // 总持仓Value
        globalLeverage: this.globalState.globalLeverage, // 全局杠杆
        globalDrawdown: this.globalState.globalDrawdown, // 全局回撤
        dailyPnL: this.globalState.dailyPnL, // 每日PnL
        dailyPnLPercent: this.globalState.dailyPnLPercent, // 每日PnL百分比
        riskLevel: this.globalState.riskLevel, // 风险级别
        tradingAllowed: this.globalState.tradingAllowed, // 交易Allowed
      }, // 结束代码块
      accounts: this.getAccounts(), // accounts
      exposureAnalysis: this.exposureAnalysis, // exposureAnalysis
      recentEvents: this.riskEvents.slice(-20), // recentEvents
      limits: { // limits
        maxTotalEquity: this.config.maxTotalEquity, // 最大总Equity
        maxTotalPositionValue: this.config.maxTotalPositionValue, // 最大总持仓Value
        maxGlobalLeverage: this.config.maxGlobalLeverage, // 最大全局杠杆
        maxGlobalDrawdown: this.config.maxGlobalDrawdown, // 最大全局回撤
        maxDailyLoss: this.config.maxDailyLoss, // 最大每日亏损
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 手动恢复交易
   * Manual resume trading
   */
  resumeTrading() { // 调用 resumeTrading
    this.globalState.tradingAllowed = true; // 访问 globalState
    this.globalState.pauseReason = null; // 访问 globalState

    // 恢复所有账户 / Resume all accounts
    for (const [, account] of this.accounts) { // 循环 const [, account] of this.accounts
      if (account.status === ACCOUNT_STATUS.SUSPENDED) { // 条件判断 account.status === ACCOUNT_STATUS.SUSPENDED
        account.status = ACCOUNT_STATUS.ACTIVE; // 赋值 account.status
      } // 结束代码块
    } // 结束代码块

    // 通知所有账户风控管理器 / Notify all account risk managers
    for (const [, riskManager] of this.accountRiskManagers) { // 循环 const [, riskManager] of this.accountRiskMana...
      if (riskManager && typeof riskManager.enableTrading === 'function') { // 条件判断 riskManager && typeof riskManager.enableTradi...
        riskManager.enableTrading(); // 调用 riskManager.enableTrading
      } // 结束代码块
    } // 结束代码块

    this.log('全局交易已手动恢复 / Global trading manually resumed', 'info'); // 调用 log
    this.emit('tradingResumed', { reason: 'manual' }); // 调用 emit
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

export { ACCOUNT_STATUS, GLOBAL_RISK_LEVEL, DEFAULT_CONFIG }; // 导出命名成员
export default MultiAccountRiskAggregator; // 默认导出
