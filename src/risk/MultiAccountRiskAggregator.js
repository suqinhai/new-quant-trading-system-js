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

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 账户状态
 * Account status
 */
const ACCOUNT_STATUS = {
  ACTIVE: 'active',           // 活跃 / Active
  INACTIVE: 'inactive',       // 非活跃 / Inactive
  WARNING: 'warning',         // 警告 / Warning
  SUSPENDED: 'suspended',     // 暂停 / Suspended
  ERROR: 'error',             // 错误 / Error
};

/**
 * 全局风险级别
 * Global risk level
 */
const GLOBAL_RISK_LEVEL = {
  LOW: 'low',             // 低 / Low
  NORMAL: 'normal',       // 正常 / Normal
  ELEVATED: 'elevated',   // 升高 / Elevated
  HIGH: 'high',           // 高 / High
  CRITICAL: 'critical',   // 严重 / Critical
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 全局风险限额 / Global Risk Limits
  // ============================================

  // 总最大权益敞口 (USD) / Maximum total equity exposure (USD)
  maxTotalEquity: 10000000, // $10M

  // 总最大仓位价值 (USD) / Maximum total position value (USD)
  maxTotalPositionValue: 5000000, // $5M

  // 全局最大杠杆 / Global maximum leverage
  maxGlobalLeverage: 3.0,

  // 全局最大回撤 / Global maximum drawdown
  maxGlobalDrawdown: 0.15, // 15%

  // 单日最大亏损 / Maximum daily loss
  maxDailyLoss: 0.05, // 5%

  // ============================================
  // 账户限额 / Per-Account Limits
  // ============================================

  // 单账户最大权益占比 / Maximum single account equity ratio
  maxSingleAccountRatio: 0.40, // 40%

  // 单账户最大仓位占比 / Maximum single account position ratio
  maxSingleAccountPositionRatio: 0.30, // 30%

  // ============================================
  // 相关性限制 / Correlation Limits
  // ============================================

  // 账户间高相关性阈值 / High correlation threshold between accounts
  accountCorrelationThreshold: 0.70,

  // 高相关账户对最大数量 / Maximum high correlation account pairs
  maxHighCorrelationPairs: 2,

  // ============================================
  // 集中度限制 / Concentration Limits
  // ============================================

  // 单一交易所最大敞口比例 / Maximum single exchange exposure ratio
  maxSingleExchangeRatio: 0.50, // 50%

  // 单一币种最大敞口比例 / Maximum single currency exposure ratio
  maxSingleCurrencyRatio: 0.30, // 30%

  // 单一交易对最大敞口比例 / Maximum single symbol exposure ratio
  maxSingleSymbolRatio: 0.20, // 20%

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 检查间隔 (毫秒) / Check interval (ms)
  checkInterval: 10000, // 10秒 / 10 seconds

  // 账户超时时间 (毫秒) / Account timeout (ms)
  accountTimeout: 60000, // 1分钟 / 1 minute

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[MultiAccountRisk]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 跨账户风险汇总器
 * Multi-Account Risk Aggregator
 */
export class MultiAccountRiskAggregator extends EventEmitter {
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

    // 账户数据 / Account data
    // 格式: { accountId: { exchange, equity, positions, pnl, status, ... } }
    this.accounts = new Map();

    // 账户风控管理器引用 / Account risk manager references
    // 格式: { accountId: RiskManager }
    this.accountRiskManagers = new Map();

    // 全局状态 / Global state
    this.globalState = {
      totalEquity: 0,
      totalPositionValue: 0,
      globalLeverage: 0,
      globalDrawdown: 0,
      dailyPnL: 0,
      dailyPnLPercent: 0,
      riskLevel: GLOBAL_RISK_LEVEL.NORMAL,
      tradingAllowed: true,
      pauseReason: null,
    };

    // 峰值权益 (用于计算回撤) / Peak equity (for drawdown calculation)
    this.peakEquity = 0;

    // 每日起始权益 / Daily start equity
    this.dailyStartEquity = 0;

    // 账户历史收益 (用于相关性分析) / Account historical returns (for correlation analysis)
    // 格式: { accountId: [return1, return2, ...] }
    this.accountReturns = new Map();

    // 风险事件历史 / Risk event history
    this.riskEvents = [];

    // 敞口分析缓存 / Exposure analysis cache
    this.exposureAnalysis = null;
    this.exposureAnalysisTime = 0;

    // 运行状态 / Running state
    this.running = false;

    // 定时器 / Timer
    this.checkTimer = null;
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化
   * Initialize
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) {
    const { initialEquity } = options;

    if (initialEquity) {
      this.globalState.totalEquity = initialEquity;
      this.peakEquity = initialEquity;
      this.dailyStartEquity = initialEquity;
    }

    this.log('跨账户风险汇总器初始化完成 / Multi-account risk aggregator initialized', 'info');
  }

  /**
   * 启动
   * Start
   */
  start() {
    if (this.running) return;

    this.running = true;

    // 启动定时检查 / Start periodic check
    this.checkTimer = setInterval(
      () => this._performGlobalRiskCheck(),
      this.config.checkInterval
    );

    this.log('跨账户风险汇总器已启动 / Multi-account risk aggregator started', 'info');
    this.emit('started');
  }

  /**
   * 停止
   * Stop
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.log('跨账户风险汇总器已停止 / Multi-account risk aggregator stopped', 'info');
    this.emit('stopped');
  }

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
  registerAccount(accountId, config = {}) {
    const account = {
      id: accountId,
      exchange: config.exchange || 'unknown',
      subAccount: config.subAccount || null,
      equity: config.initialEquity || 0,
      availableBalance: config.initialEquity || 0,
      positions: [],
      positionValue: 0,
      unrealizedPnL: 0,
      realizedPnL: 0,
      dailyPnL: 0,
      leverage: 0,
      status: ACCOUNT_STATUS.ACTIVE,
      lastUpdate: Date.now(),
      registeredAt: Date.now(),
      riskBudget: config.riskBudget || 0,
      maxPositionRatio: config.maxPositionRatio || this.config.maxSingleAccountPositionRatio,
    };

    this.accounts.set(accountId, account);

    // 初始化账户收益历史 / Initialize account returns history
    this.accountReturns.set(accountId, []);

    this.log(`注册账户: ${accountId} (${config.exchange}) / Account registered: ${accountId}`, 'info');
    this.emit('accountRegistered', { accountId, config });

    // 更新全局状态 / Update global state
    this._updateGlobalState();
  }

  /**
   * 注销账户
   * Unregister account
   *
   * @param {string} accountId - 账户ID / Account ID
   */
  unregisterAccount(accountId) {
    if (!this.accounts.has(accountId)) return;

    this.accounts.delete(accountId);
    this.accountReturns.delete(accountId);
    this.accountRiskManagers.delete(accountId);

    this.log(`注销账户: ${accountId} / Account unregistered: ${accountId}`, 'info');
    this.emit('accountUnregistered', { accountId });

    // 更新全局状态 / Update global state
    this._updateGlobalState();
  }

  /**
   * 更新账户数据
   * Update account data
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} data - 账户数据 / Account data
   */
  updateAccount(accountId, data) {
    let account = this.accounts.get(accountId);

    if (!account) {
      // 自动注册账户 / Auto-register account
      this.registerAccount(accountId, { exchange: data.exchange });
      account = this.accounts.get(accountId);
    }

    const previousEquity = account.equity;

    // 更新账户数据 / Update account data
    Object.assign(account, {
      ...data,
      lastUpdate: Date.now(),
    });

    // 计算仓位价值 / Calculate position value
    if (data.positions) {
      account.positionValue = data.positions.reduce((sum, pos) => {
        return sum + Math.abs(pos.size || pos.amount) * (pos.markPrice || pos.entryPrice || 0);
      }, 0);

      // 计算杠杆 / Calculate leverage
      account.leverage = account.equity > 0
        ? account.positionValue / account.equity
        : 0;
    }

    // 记录收益用于相关性分析 / Record return for correlation analysis
    if (previousEquity > 0 && account.equity > 0) {
      const accountReturn = (account.equity - previousEquity) / previousEquity;
      const returns = this.accountReturns.get(accountId);
      returns.push(accountReturn);

      // 限制历史长度 / Limit history length
      if (returns.length > 100) {
        returns.shift();
      }
    }

    // 更新全局状态 / Update global state
    this._updateGlobalState();

    // 检查账户级别风险 / Check account-level risk
    this._checkAccountRisk(accountId);
  }

  /**
   * 设置账户风控管理器
   * Set account risk manager
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} riskManager - 风控管理器 / Risk manager
   */
  setAccountRiskManager(accountId, riskManager) {
    this.accountRiskManagers.set(accountId, riskManager);

    // 监听账户风控事件 / Listen to account risk events
    if (riskManager && typeof riskManager.on === 'function') {
      riskManager.on('riskTriggered', (event) => {
        this._handleAccountRiskEvent(accountId, event);
      });

      riskManager.on('tradingDisabled', (event) => {
        this._handleAccountStatusChange(accountId, ACCOUNT_STATUS.SUSPENDED, event.reason);
      });
    }
  }

  // ============================================
  // 全局状态更新 / Global State Update
  // ============================================

  /**
   * 更新全局状态
   * Update global state
   * @private
   */
  _updateGlobalState() {
    let totalEquity = 0;
    let totalPositionValue = 0;
    let totalDailyPnL = 0;

    // 汇总所有账户 / Aggregate all accounts
    for (const [, account] of this.accounts) {
      if (account.status === ACCOUNT_STATUS.ACTIVE ||
          account.status === ACCOUNT_STATUS.WARNING) {
        totalEquity += account.equity || 0;
        totalPositionValue += account.positionValue || 0;
        totalDailyPnL += account.dailyPnL || 0;
      }
    }

    // 更新全局状态 / Update global state
    this.globalState.totalEquity = totalEquity;
    this.globalState.totalPositionValue = totalPositionValue;
    this.globalState.dailyPnL = totalDailyPnL;

    // 更新峰值权益 / Update peak equity
    if (totalEquity > this.peakEquity) {
      this.peakEquity = totalEquity;
    }

    // 计算全局杠杆 / Calculate global leverage
    this.globalState.globalLeverage = totalEquity > 0
      ? totalPositionValue / totalEquity
      : 0;

    // 计算全局回撤 / Calculate global drawdown
    this.globalState.globalDrawdown = this.peakEquity > 0
      ? (this.peakEquity - totalEquity) / this.peakEquity
      : 0;

    // 计算日收益率 / Calculate daily return
    this.globalState.dailyPnLPercent = this.dailyStartEquity > 0
      ? totalDailyPnL / this.dailyStartEquity
      : 0;

    // 更新敞口分析 / Update exposure analysis
    this._updateExposureAnalysis();
  }

  // ============================================
  // 风险检查 / Risk Checks
  // ============================================

  /**
   * 执行全局风险检查
   * Perform global risk check
   * @private
   */
  async _performGlobalRiskCheck() {
    if (!this.running) return;

    // 检查日期重置 / Check date reset
    this._checkDailyReset();

    // 检查账户超时 / Check account timeout
    this._checkAccountTimeouts();

    const riskResults = [];

    // 1. 检查总权益限额 / Check total equity limit
    riskResults.push(this._checkEquityLimit());

    // 2. 检查总仓位限额 / Check total position limit
    riskResults.push(this._checkPositionLimit());

    // 3. 检查全局杠杆 / Check global leverage
    riskResults.push(this._checkGlobalLeverage());

    // 4. 检查全局回撤 / Check global drawdown
    riskResults.push(this._checkGlobalDrawdown());

    // 5. 检查每日亏损 / Check daily loss
    riskResults.push(this._checkDailyLoss());

    // 6. 检查账户集中度 / Check account concentration
    riskResults.push(this._checkAccountConcentration());

    // 7. 检查敞口集中度 / Check exposure concentration
    riskResults.push(this._checkExposureConcentration());

    // 8. 检查账户间相关性 / Check inter-account correlation
    riskResults.push(this._checkAccountCorrelation());

    // 更新全局风险级别 / Update global risk level
    this._updateGlobalRiskLevel(riskResults);

    // 执行风控动作 / Execute risk actions
    await this._executeGlobalRiskActions(riskResults);
  }

  /**
   * 检查账户风险
   * Check account risk
   *
   * @param {string} accountId - 账户ID / Account ID
   * @private
   */
  _checkAccountRisk(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) return;

    const warnings = [];

    // 检查账户权益占比 / Check account equity ratio
    if (this.globalState.totalEquity > 0) {
      const equityRatio = account.equity / this.globalState.totalEquity;
      if (equityRatio > this.config.maxSingleAccountRatio) {
        warnings.push(`账户权益占比过高: ${(equityRatio * 100).toFixed(1)}%`);
      }
    }

    // 检查账户杠杆 / Check account leverage
    if (account.leverage > this.config.maxGlobalLeverage) {
      warnings.push(`账户杠杆过高: ${account.leverage.toFixed(2)}x`);
    }

    // 检查账户仓位占比 / Check account position ratio
    if (this.globalState.totalPositionValue > 0) {
      const positionRatio = account.positionValue / this.globalState.totalPositionValue;
      if (positionRatio > this.config.maxSingleAccountPositionRatio) {
        warnings.push(`账户仓位占比过高: ${(positionRatio * 100).toFixed(1)}%`);
      }
    }

    // 如果有警告，更新账户状态 / Update account status if warnings
    if (warnings.length > 0) {
      account.status = ACCOUNT_STATUS.WARNING;
      this.emit('accountWarning', { accountId, warnings });
    }
  }

  /**
   * 检查权益限额
   * Check equity limit
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkEquityLimit() {
    const result = {
      type: 'equityLimit',
      passed: true,
      message: null,
    };

    if (this.globalState.totalEquity > this.config.maxTotalEquity) {
      result.passed = false;
      result.message = `总权益超限: $${(this.globalState.totalEquity / 1e6).toFixed(2)}M > $${(this.config.maxTotalEquity / 1e6).toFixed(2)}M`;
      result.severity = 'warning';
    }

    return result;
  }

  /**
   * 检查仓位限额
   * Check position limit
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkPositionLimit() {
    const result = {
      type: 'positionLimit',
      passed: true,
      message: null,
    };

    if (this.globalState.totalPositionValue > this.config.maxTotalPositionValue) {
      result.passed = false;
      result.message = `总仓位超限: $${(this.globalState.totalPositionValue / 1e6).toFixed(2)}M > $${(this.config.maxTotalPositionValue / 1e6).toFixed(2)}M`;
      result.severity = 'high';
    }

    return result;
  }

  /**
   * 检查全局杠杆
   * Check global leverage
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkGlobalLeverage() {
    const result = {
      type: 'globalLeverage',
      passed: true,
      message: null,
    };

    if (this.globalState.globalLeverage > this.config.maxGlobalLeverage) {
      result.passed = false;
      result.message = `全局杠杆超限: ${this.globalState.globalLeverage.toFixed(2)}x > ${this.config.maxGlobalLeverage}x`;
      result.severity = 'high';
    }

    return result;
  }

  /**
   * 检查全局回撤
   * Check global drawdown
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkGlobalDrawdown() {
    const result = {
      type: 'globalDrawdown',
      passed: true,
      message: null,
    };

    if (this.globalState.globalDrawdown > this.config.maxGlobalDrawdown) {
      result.passed = false;
      result.message = `全局回撤超限: ${(this.globalState.globalDrawdown * 100).toFixed(2)}% > ${(this.config.maxGlobalDrawdown * 100).toFixed(0)}%`;
      result.severity = 'critical';
    }

    return result;
  }

  /**
   * 检查每日亏损
   * Check daily loss
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkDailyLoss() {
    const result = {
      type: 'dailyLoss',
      passed: true,
      message: null,
    };

    if (this.globalState.dailyPnLPercent < -this.config.maxDailyLoss) {
      result.passed = false;
      result.message = `每日亏损超限: ${(this.globalState.dailyPnLPercent * 100).toFixed(2)}% < -${(this.config.maxDailyLoss * 100).toFixed(0)}%`;
      result.severity = 'critical';
    }

    return result;
  }

  /**
   * 检查账户集中度
   * Check account concentration
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkAccountConcentration() {
    const result = {
      type: 'accountConcentration',
      passed: true,
      message: null,
      details: [],
    };

    for (const [accountId, account] of this.accounts) {
      if (this.globalState.totalEquity > 0) {
        const ratio = account.equity / this.globalState.totalEquity;
        if (ratio > this.config.maxSingleAccountRatio) {
          result.passed = false;
          result.details.push({
            accountId,
            ratio,
            limit: this.config.maxSingleAccountRatio,
          });
        }
      }
    }

    if (!result.passed) {
      result.message = `账户集中度过高: ${result.details.map((d) => `${d.accountId}(${(d.ratio * 100).toFixed(1)}%)`).join(', ')}`;
      result.severity = 'warning';
    }

    return result;
  }

  /**
   * 更新敞口分析
   * Update exposure analysis
   * @private
   */
  _updateExposureAnalysis() {
    const now = Date.now();

    // 缓存5秒 / Cache for 5 seconds
    if (this.exposureAnalysis && now - this.exposureAnalysisTime < 5000) {
      return;
    }

    // 按交易所汇总 / Aggregate by exchange
    const byExchange = new Map();

    // 按币种汇总 / Aggregate by currency
    const byCurrency = new Map();

    // 按交易对汇总 / Aggregate by symbol
    const bySymbol = new Map();

    for (const [, account] of this.accounts) {
      // 交易所敞口 / Exchange exposure
      const exchange = account.exchange || 'unknown';
      byExchange.set(exchange, (byExchange.get(exchange) || 0) + account.positionValue);

      // 遍历仓位 / Iterate positions
      if (account.positions) {
        for (const pos of account.positions) {
          const posValue = Math.abs(pos.size || pos.amount) * (pos.markPrice || pos.entryPrice || 0);

          // 交易对敞口 / Symbol exposure
          const symbol = pos.symbol;
          bySymbol.set(symbol, (bySymbol.get(symbol) || 0) + posValue);

          // 币种敞口 (提取基础货币) / Currency exposure (extract base currency)
          const baseCurrency = symbol ? symbol.replace(/[-_/].*$/, '').replace(/USDT?$/, '') : 'UNKNOWN';
          byCurrency.set(baseCurrency, (byCurrency.get(baseCurrency) || 0) + posValue);
        }
      }
    }

    this.exposureAnalysis = {
      byExchange: Object.fromEntries(byExchange),
      byCurrency: Object.fromEntries(byCurrency),
      bySymbol: Object.fromEntries(bySymbol),
      totalPositionValue: this.globalState.totalPositionValue,
    };
    this.exposureAnalysisTime = now;
  }

  /**
   * 检查敞口集中度
   * Check exposure concentration
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkExposureConcentration() {
    const result = {
      type: 'exposureConcentration',
      passed: true,
      message: null,
      details: [],
    };

    if (!this.exposureAnalysis || this.globalState.totalPositionValue === 0) {
      return result;
    }

    const total = this.globalState.totalPositionValue;

    // 检查交易所集中度 / Check exchange concentration
    for (const [exchange, value] of Object.entries(this.exposureAnalysis.byExchange)) {
      const ratio = value / total;
      if (ratio > this.config.maxSingleExchangeRatio) {
        result.details.push({
          type: 'exchange',
          name: exchange,
          ratio,
          limit: this.config.maxSingleExchangeRatio,
        });
      }
    }

    // 检查币种集中度 / Check currency concentration
    for (const [currency, value] of Object.entries(this.exposureAnalysis.byCurrency)) {
      const ratio = value / total;
      if (ratio > this.config.maxSingleCurrencyRatio) {
        result.details.push({
          type: 'currency',
          name: currency,
          ratio,
          limit: this.config.maxSingleCurrencyRatio,
        });
      }
    }

    // 检查交易对集中度 / Check symbol concentration
    for (const [symbol, value] of Object.entries(this.exposureAnalysis.bySymbol)) {
      const ratio = value / total;
      if (ratio > this.config.maxSingleSymbolRatio) {
        result.details.push({
          type: 'symbol',
          name: symbol,
          ratio,
          limit: this.config.maxSingleSymbolRatio,
        });
      }
    }

    if (result.details.length > 0) {
      result.passed = false;
      result.message = `敞口集中度过高: ${result.details.map((d) => `${d.name}(${(d.ratio * 100).toFixed(1)}%)`).join(', ')}`;
      result.severity = 'warning';
    }

    return result;
  }

  /**
   * 检查账户间相关性
   * Check inter-account correlation
   *
   * @returns {Object} 检查结果 / Check result
   * @private
   */
  _checkAccountCorrelation() {
    const result = {
      type: 'accountCorrelation',
      passed: true,
      message: null,
      highCorrelationPairs: [],
    };

    const accountIds = [...this.accounts.keys()];

    // 需要至少2个账户 / Need at least 2 accounts
    if (accountIds.length < 2) {
      return result;
    }

    // 计算两两相关性 / Calculate pairwise correlation
    for (let i = 0; i < accountIds.length - 1; i++) {
      for (let j = i + 1; j < accountIds.length; j++) {
        const returns1 = this.accountReturns.get(accountIds[i]);
        const returns2 = this.accountReturns.get(accountIds[j]);

        // 需要足够的数据点 / Need enough data points
        if (!returns1 || !returns2 || returns1.length < 10 || returns2.length < 10) {
          continue;
        }

        const correlation = this._calculateCorrelation(returns1, returns2);

        if (Math.abs(correlation) >= this.config.accountCorrelationThreshold) {
          result.highCorrelationPairs.push({
            accounts: [accountIds[i], accountIds[j]],
            correlation,
          });
        }
      }
    }

    if (result.highCorrelationPairs.length > this.config.maxHighCorrelationPairs) {
      result.passed = false;
      result.message = `账户相关性过高: ${result.highCorrelationPairs.length}对 > ${this.config.maxHighCorrelationPairs}对`;
      result.severity = 'warning';
    }

    return result;
  }

  /**
   * 计算相关系数
   * Calculate correlation coefficient
   *
   * @param {Array} x - 数组1 / Array 1
   * @param {Array} y - 数组2 / Array 2
   * @returns {number} 相关系数 / Correlation coefficient
   * @private
   */
  _calculateCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;

    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);

    const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
    const meanY = ySlice.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = xSlice[i] - meanX;
      const dy = ySlice[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom === 0 ? 0 : numerator / denom;
  }

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
  _updateGlobalRiskLevel(results) {
    const failedResults = results.filter((r) => !r.passed);

    let newLevel = GLOBAL_RISK_LEVEL.LOW;

    // 根据失败检查的严重程度确定风险级别 / Determine risk level based on severity
    for (const result of failedResults) {
      if (result.severity === 'critical') {
        newLevel = GLOBAL_RISK_LEVEL.CRITICAL;
        break;
      } else if (result.severity === 'high' && newLevel !== GLOBAL_RISK_LEVEL.CRITICAL) {
        newLevel = GLOBAL_RISK_LEVEL.HIGH;
      } else if (result.severity === 'warning' &&
                 newLevel !== GLOBAL_RISK_LEVEL.CRITICAL &&
                 newLevel !== GLOBAL_RISK_LEVEL.HIGH) {
        newLevel = GLOBAL_RISK_LEVEL.ELEVATED;
      }
    }

    // 如果没有失败，检查接近限制的情况 / If no failures, check near-limit conditions
    if (failedResults.length === 0) {
      if (this.globalState.globalDrawdown > this.config.maxGlobalDrawdown * 0.7 ||
          this.globalState.globalLeverage > this.config.maxGlobalLeverage * 0.8) {
        newLevel = GLOBAL_RISK_LEVEL.ELEVATED;
      } else {
        newLevel = GLOBAL_RISK_LEVEL.NORMAL;
      }
    }

    // 如果风险级别变化，发出事件 / Emit event if risk level changed
    if (newLevel !== this.globalState.riskLevel) {
      const previousLevel = this.globalState.riskLevel;
      this.globalState.riskLevel = newLevel;

      this.emit('riskLevelChanged', {
        previousLevel,
        currentLevel: newLevel,
        failedChecks: failedResults,
        timestamp: Date.now(),
      });

      this.log(`全局风险级别变更: ${previousLevel} -> ${newLevel}`, 'info');
    }
  }

  /**
   * 执行全局风控动作
   * Execute global risk actions
   *
   * @param {Array} results - 检查结果 / Check results
   * @private
   */
  async _executeGlobalRiskActions(results) {
    const criticalFailures = results.filter((r) => !r.passed && r.severity === 'critical');

    if (criticalFailures.length > 0) {
      // 暂停所有交易 / Pause all trading
      this.globalState.tradingAllowed = false;
      this.globalState.pauseReason = criticalFailures.map((r) => r.message).join('; ');

      this.log(`🚨 全局交易暂停: ${this.globalState.pauseReason}`, 'error');

      // 通知所有账户风控管理器 / Notify all account risk managers
      for (const [accountId, riskManager] of this.accountRiskManagers) {
        if (riskManager && typeof riskManager.disableTrading === 'function') {
          riskManager.disableTrading('全局风险限制');
        }
      }

      // 发出紧急事件 / Emit emergency event
      this.emit('globalEmergency', {
        failures: criticalFailures,
        globalState: { ...this.globalState },
        timestamp: Date.now(),
      });

      // 记录风险事件 / Record risk event
      this._recordRiskEvent('globalEmergency', criticalFailures);
    }
  }

  // ============================================
  // 辅助方法 / Helper Methods
  // ============================================

  /**
   * 检查日期重置
   * Check daily reset
   * @private
   */
  _checkDailyReset() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (this._lastDayStart !== dayStart) {
      this._lastDayStart = dayStart;
      this.dailyStartEquity = this.globalState.totalEquity;

      // 重置所有账户的日盈亏 / Reset daily PnL for all accounts
      for (const [, account] of this.accounts) {
        account.dailyPnL = 0;
      }

      // 恢复交易 (如果因为日亏损暂停) / Resume trading if paused due to daily loss
      if (this.globalState.pauseReason?.includes('每日亏损')) {
        this.globalState.tradingAllowed = true;
        this.globalState.pauseReason = null;
        this.log('跨日重置: 交易已恢复 / Daily reset: Trading resumed', 'info');
      }

      this.log('跨日重置完成 / Daily reset completed', 'info');
      this.emit('dailyReset');
    }
  }

  /**
   * 检查账户超时
   * Check account timeouts
   * @private
   */
  _checkAccountTimeouts() {
    const now = Date.now();

    for (const [accountId, account] of this.accounts) {
      if (account.status === ACCOUNT_STATUS.ACTIVE &&
          now - account.lastUpdate > this.config.accountTimeout) {
        account.status = ACCOUNT_STATUS.INACTIVE;

        this.log(`账户超时: ${accountId}`, 'warn');
        this.emit('accountTimeout', { accountId });
      }
    }
  }

  /**
   * 处理账户风控事件
   * Handle account risk event
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} event - 事件 / Event
   * @private
   */
  _handleAccountRiskEvent(accountId, event) {
    this.log(`账户 ${accountId} 风控事件: ${event.message}`, 'warn');

    // 记录风险事件 / Record risk event
    this._recordRiskEvent('accountRisk', { accountId, event });

    // 发出汇总事件 / Emit aggregated event
    this.emit('accountRiskEvent', { accountId, event });
  }

  /**
   * 处理账户状态变更
   * Handle account status change
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {string} status - 新状态 / New status
   * @param {string} reason - 原因 / Reason
   * @private
   */
  _handleAccountStatusChange(accountId, status, reason) {
    const account = this.accounts.get(accountId);
    if (account) {
      account.status = status;
      this.emit('accountStatusChanged', { accountId, status, reason });
    }
  }

  /**
   * 记录风险事件
   * Record risk event
   *
   * @param {string} type - 事件类型 / Event type
   * @param {Object} details - 详情 / Details
   * @private
   */
  _recordRiskEvent(type, details) {
    this.riskEvents.push({
      type,
      details,
      globalState: { ...this.globalState },
      timestamp: Date.now(),
    });

    // 限制历史长度 / Limit history length
    if (this.riskEvents.length > 500) {
      this.riskEvents = this.riskEvents.slice(-500);
    }
  }

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
  checkOrder(accountId, order) {
    const result = {
      allowed: true,
      reasons: [],
      warnings: [],
    };

    // 检查全局交易状态 / Check global trading status
    if (!this.globalState.tradingAllowed) {
      result.allowed = false;
      result.reasons.push(`全局交易已暂停: ${this.globalState.pauseReason}`);
      return result;
    }

    // 检查账户状态 / Check account status
    const account = this.accounts.get(accountId);
    if (account && account.status === ACCOUNT_STATUS.SUSPENDED) {
      result.allowed = false;
      result.reasons.push('账户已暂停交易');
      return result;
    }

    // 检查风险级别 / Check risk level
    if (this.globalState.riskLevel === GLOBAL_RISK_LEVEL.CRITICAL) {
      result.allowed = false;
      result.reasons.push('全局风险级别过高');
    } else if (this.globalState.riskLevel === GLOBAL_RISK_LEVEL.HIGH) {
      result.warnings.push('当前全局风险较高，建议谨慎操作');
    }

    // 检查订单对集中度的影响 / Check order impact on concentration
    if (order.symbol && this.exposureAnalysis) {
      const orderValue = order.amount * (order.price || 0);
      const currentSymbolExposure = this.exposureAnalysis.bySymbol[order.symbol] || 0;
      const newRatio = (currentSymbolExposure + orderValue) / (this.globalState.totalPositionValue + orderValue);

      if (newRatio > this.config.maxSingleSymbolRatio) {
        result.allowed = false;
        result.reasons.push(`交易对敞口将超限: ${(newRatio * 100).toFixed(1)}% > ${(this.config.maxSingleSymbolRatio * 100).toFixed(0)}%`);
      }
    }

    return result;
  }

  /**
   * 获取全局状态
   * Get global status
   *
   * @returns {Object} 全局状态 / Global status
   */
  getGlobalStatus() {
    return {
      running: this.running,
      globalState: { ...this.globalState },
      accountCount: this.accounts.size,
      activeAccountCount: [...this.accounts.values()].filter(
        (a) => a.status === ACCOUNT_STATUS.ACTIVE
      ).length,
      peakEquity: this.peakEquity,
      exposureAnalysis: this.exposureAnalysis,
    };
  }

  /**
   * 获取账户列表
   * Get account list
   *
   * @returns {Array} 账户列表 / Account list
   */
  getAccounts() {
    return [...this.accounts.entries()].map(([id, account]) => ({
      id,
      exchange: account.exchange,
      equity: account.equity,
      positionValue: account.positionValue,
      leverage: account.leverage,
      dailyPnL: account.dailyPnL,
      status: account.status,
      lastUpdate: account.lastUpdate,
    }));
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
      global: {
        totalEquity: this.globalState.totalEquity,
        totalPositionValue: this.globalState.totalPositionValue,
        globalLeverage: this.globalState.globalLeverage,
        globalDrawdown: this.globalState.globalDrawdown,
        dailyPnL: this.globalState.dailyPnL,
        dailyPnLPercent: this.globalState.dailyPnLPercent,
        riskLevel: this.globalState.riskLevel,
        tradingAllowed: this.globalState.tradingAllowed,
      },
      accounts: this.getAccounts(),
      exposureAnalysis: this.exposureAnalysis,
      recentEvents: this.riskEvents.slice(-20),
      limits: {
        maxTotalEquity: this.config.maxTotalEquity,
        maxTotalPositionValue: this.config.maxTotalPositionValue,
        maxGlobalLeverage: this.config.maxGlobalLeverage,
        maxGlobalDrawdown: this.config.maxGlobalDrawdown,
        maxDailyLoss: this.config.maxDailyLoss,
      },
    };
  }

  /**
   * 手动恢复交易
   * Manual resume trading
   */
  resumeTrading() {
    this.globalState.tradingAllowed = true;
    this.globalState.pauseReason = null;

    // 恢复所有账户 / Resume all accounts
    for (const [, account] of this.accounts) {
      if (account.status === ACCOUNT_STATUS.SUSPENDED) {
        account.status = ACCOUNT_STATUS.ACTIVE;
      }
    }

    // 通知所有账户风控管理器 / Notify all account risk managers
    for (const [, riskManager] of this.accountRiskManagers) {
      if (riskManager && typeof riskManager.enableTrading === 'function') {
        riskManager.enableTrading();
      }
    }

    this.log('全局交易已手动恢复 / Global trading manually resumed', 'info');
    this.emit('tradingResumed', { reason: 'manual' });
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

export { ACCOUNT_STATUS, GLOBAL_RISK_LEVEL, DEFAULT_CONFIG };
export default MultiAccountRiskAggregator;
