/**
 * 统一风控系统
 * Unified Risk Management System
 *
 * 整合所有风控模块的统一入口
 * Unified entry point for all risk management modules
 *
 * 模块包括 / Modules included:
 * 1. BlackSwanProtector - 黑天鹅事件保护 / Black swan protection
 * 2. LiquidityRiskMonitor - 流动性风险监控 / Liquidity risk monitoring
 * 3. MultiAccountRiskAggregator - 跨账户风险汇总 / Multi-account risk aggregation
 * 4. PortfolioRiskManager - 组合风控管理 / Portfolio risk management
 * 5. RiskManager - 单账户风控 / Single account risk management
 */

import EventEmitter from 'eventemitter3';
import { BlackSwanProtector, CIRCUIT_BREAKER_LEVEL, BLACK_SWAN_TYPE } from './BlackSwanProtector.js';
import { LiquidityRiskMonitor, LIQUIDITY_LEVEL, EXECUTION_STRATEGY } from './LiquidityRiskMonitor.js';
import { MultiAccountRiskAggregator, ACCOUNT_STATUS, GLOBAL_RISK_LEVEL } from './MultiAccountRiskAggregator.js';
import { PortfolioRiskManager, PORTFOLIO_RISK_LEVEL, RISK_ACTION } from './PortfolioRiskManager.js';
import { RiskManager } from './RiskManager.js';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 风控系统状态
 * Risk system status
 */
const SYSTEM_STATUS = {
  INITIALIZING: 'initializing',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // 是否启用黑天鹅保护 / Enable black swan protection
  enableBlackSwanProtection: true,

  // 是否启用流动性监控 / Enable liquidity monitoring
  enableLiquidityMonitoring: true,

  // 是否启用跨账户风控 / Enable multi-account risk management
  enableMultiAccountRisk: true,

  // 是否启用组合风控 / Enable portfolio risk management
  enablePortfolioRisk: true,

  // 日志配置 / Logging configuration
  verbose: true,
  logPrefix: '[RiskSystem]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 统一风控系统
 * Unified Risk Management System
 */
export class RiskSystem extends EventEmitter {
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

    // 系统状态 / System status
    this.status = SYSTEM_STATUS.INITIALIZING;

    // 风控模块实例 / Risk module instances
    this.modules = {
      blackSwanProtector: null,
      liquidityMonitor: null,
      multiAccountAggregator: null,
      portfolioRiskManager: null,
      accountRiskManagers: new Map(), // 账户级别风控管理器
    };

    // 执行器引用 / Executor reference
    this.executor = null;

    // 事件历史 / Event history
    this.eventHistory = [];

    // 统计数据 / Statistics
    this.statistics = {
      totalChecks: 0,
      triggeredEvents: 0,
      blockedOrders: 0,
      emergencyActions: 0,
      startTime: Date.now(),
    };
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化风控系统
   * Initialize risk system
   *
   * @param {Object} options - 初始化选项 / Initialization options
   */
  async init(options = {}) {
    const {
      executor,
      initialEquity,
      blackSwanConfig,
      liquidityConfig,
      multiAccountConfig,
      portfolioConfig,
    } = options;

    this.executor = executor;

    try {
      // 1. 初始化黑天鹅保护器 / Initialize black swan protector
      if (this.config.enableBlackSwanProtection) {
        this.modules.blackSwanProtector = new BlackSwanProtector(blackSwanConfig);
        await this.modules.blackSwanProtector.init({ executor });
        this._setupBlackSwanEvents();
        this.log('黑天鹅保护器初始化完成 / Black swan protector initialized', 'info');
      }

      // 2. 初始化流动性监控器 / Initialize liquidity monitor
      if (this.config.enableLiquidityMonitoring) {
        this.modules.liquidityMonitor = new LiquidityRiskMonitor(liquidityConfig);
        this._setupLiquidityEvents();
        this.log('流动性监控器初始化完成 / Liquidity monitor initialized', 'info');
      }

      // 3. 初始化跨账户风险汇总器 / Initialize multi-account aggregator
      if (this.config.enableMultiAccountRisk) {
        this.modules.multiAccountAggregator = new MultiAccountRiskAggregator(multiAccountConfig);
        await this.modules.multiAccountAggregator.init({ initialEquity });
        this._setupMultiAccountEvents();
        this.log('跨账户风险汇总器初始化完成 / Multi-account aggregator initialized', 'info');
      }

      // 4. 初始化组合风控管理器 / Initialize portfolio risk manager
      if (this.config.enablePortfolioRisk) {
        this.modules.portfolioRiskManager = new PortfolioRiskManager(portfolioConfig);
        await this.modules.portfolioRiskManager.init({
          executor,
          initialEquity,
        });
        this._setupPortfolioEvents();
        this.log('组合风控管理器初始化完成 / Portfolio risk manager initialized', 'info');
      }

      // 连接模块 / Connect modules
      this._connectModules();

      this.status = SYSTEM_STATUS.RUNNING;
      this.log('统一风控系统初始化完成 / Unified risk system initialized', 'info');

      this.emit('initialized', {
        modules: this.getModuleStatus(),
        timestamp: Date.now(),
      });

    } catch (error) {
      this.status = SYSTEM_STATUS.ERROR;
      this.log(`初始化失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 启动风控系统
   * Start risk system
   */
  start() {
    if (this.status === SYSTEM_STATUS.RUNNING) {
      this.log('系统已在运行中 / System already running', 'info');
      return;
    }

    // 启动所有模块 / Start all modules
    if (this.modules.blackSwanProtector) {
      this.modules.blackSwanProtector.start();
    }

    if (this.modules.liquidityMonitor) {
      this.modules.liquidityMonitor.start();
    }

    if (this.modules.multiAccountAggregator) {
      this.modules.multiAccountAggregator.start();
    }

    if (this.modules.portfolioRiskManager) {
      this.modules.portfolioRiskManager.start();
    }

    this.status = SYSTEM_STATUS.RUNNING;
    this.log('统一风控系统已启动 / Unified risk system started', 'info');
    this.emit('started');
  }

  /**
   * 停止风控系统
   * Stop risk system
   */
  stop() {
    if (this.status === SYSTEM_STATUS.STOPPED) {
      return;
    }

    // 停止所有模块 / Stop all modules
    if (this.modules.blackSwanProtector) {
      this.modules.blackSwanProtector.stop();
    }

    if (this.modules.liquidityMonitor) {
      this.modules.liquidityMonitor.stop();
    }

    if (this.modules.multiAccountAggregator) {
      this.modules.multiAccountAggregator.stop();
    }

    if (this.modules.portfolioRiskManager) {
      this.modules.portfolioRiskManager.stop();
    }

    this.status = SYSTEM_STATUS.STOPPED;
    this.log('统一风控系统已停止 / Unified risk system stopped', 'info');
    this.emit('stopped');
  }

  // ============================================
  // 模块连接 / Module Connection
  // ============================================

  /**
   * 连接模块
   * Connect modules
   * @private
   */
  _connectModules() {
    // 将黑天鹅保护器连接到组合风控 / Connect black swan protector to portfolio risk
    if (this.modules.blackSwanProtector && this.modules.portfolioRiskManager) {
      this.modules.blackSwanProtector.portfolioRiskManager = this.modules.portfolioRiskManager;
    }

    // 将流动性监控器的警告传递给组合风控 / Pass liquidity warnings to portfolio risk
    if (this.modules.liquidityMonitor && this.modules.portfolioRiskManager) {
      this.modules.liquidityMonitor.on('liquidityWarning', (warning) => {
        this.modules.portfolioRiskManager.emit('liquidityWarning', warning);
      });
    }

    this.log('模块连接完成 / Modules connected', 'info');
  }

  // ============================================
  // 事件设置 / Event Setup
  // ============================================

  /**
   * 设置黑天鹅事件
   * Setup black swan events
   * @private
   */
  _setupBlackSwanEvents() {
    const protector = this.modules.blackSwanProtector;

    protector.on('circuitBreakerTriggered', (event) => {
      this._recordEvent('blackSwan', 'circuitBreaker', event);
      this.emit('riskEvent', { module: 'blackSwan', type: 'circuitBreaker', ...event });
      this.statistics.triggeredEvents++;
    });

    protector.on('emergencyClose', (event) => {
      this._recordEvent('blackSwan', 'emergencyClose', event);
      this.emit('riskEvent', { module: 'blackSwan', type: 'emergencyClose', ...event });
      this.statistics.emergencyActions++;
    });

    protector.on('recovered', (event) => {
      this._recordEvent('blackSwan', 'recovered', event);
      this.emit('riskEvent', { module: 'blackSwan', type: 'recovered', ...event });
    });
  }

  /**
   * 设置流动性事件
   * Setup liquidity events
   * @private
   */
  _setupLiquidityEvents() {
    const monitor = this.modules.liquidityMonitor;

    monitor.on('liquidityWarning', (event) => {
      this._recordEvent('liquidity', 'warning', event);
      this.emit('riskEvent', { module: 'liquidity', type: 'warning', ...event });
    });
  }

  /**
   * 设置跨账户事件
   * Setup multi-account events
   * @private
   */
  _setupMultiAccountEvents() {
    const aggregator = this.modules.multiAccountAggregator;

    aggregator.on('riskLevelChanged', (event) => {
      this._recordEvent('multiAccount', 'riskLevelChanged', event);
      this.emit('riskEvent', { module: 'multiAccount', type: 'riskLevelChanged', ...event });
    });

    aggregator.on('globalEmergency', (event) => {
      this._recordEvent('multiAccount', 'globalEmergency', event);
      this.emit('riskEvent', { module: 'multiAccount', type: 'globalEmergency', ...event });
      this.statistics.emergencyActions++;
    });

    aggregator.on('accountWarning', (event) => {
      this._recordEvent('multiAccount', 'accountWarning', event);
      this.emit('riskEvent', { module: 'multiAccount', type: 'accountWarning', ...event });
    });
  }

  /**
   * 设置组合风控事件
   * Setup portfolio risk events
   * @private
   */
  _setupPortfolioEvents() {
    const manager = this.modules.portfolioRiskManager;

    manager.on('riskLevelChanged', (event) => {
      this._recordEvent('portfolio', 'riskLevelChanged', event);
      this.emit('riskEvent', { module: 'portfolio', type: 'riskLevelChanged', ...event });
    });

    manager.on('emergencyClose', (event) => {
      this._recordEvent('portfolio', 'emergencyClose', event);
      this.emit('riskEvent', { module: 'portfolio', type: 'emergencyClose', ...event });
      this.statistics.emergencyActions++;
    });

    manager.on('tradingPaused', (event) => {
      this._recordEvent('portfolio', 'tradingPaused', event);
      this.emit('riskEvent', { module: 'portfolio', type: 'tradingPaused', ...event });
    });
  }

  // ============================================
  // 数据更新接口 / Data Update Interface
  // ============================================

  /**
   * 更新市场数据
   * Update market data
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} data - 市场数据 / Market data
   */
  updateMarketData(symbol, data) {
    const { price, volume, orderBook } = data;

    // 更新黑天鹅保护器 / Update black swan protector
    if (this.modules.blackSwanProtector && price) {
      this.modules.blackSwanProtector.updatePrice(symbol, price, volume, orderBook);
    }

    // 更新流动性监控器 / Update liquidity monitor
    if (this.modules.liquidityMonitor) {
      if (orderBook) {
        this.modules.liquidityMonitor.updateOrderBook(symbol, orderBook);
      }
      if (data.trade) {
        this.modules.liquidityMonitor.updateTrade(symbol, data.trade);
      }
    }
  }

  /**
   * 更新账户数据
   * Update account data
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} data - 账户数据 / Account data
   */
  updateAccountData(accountId, data) {
    // 更新跨账户风险汇总器 / Update multi-account aggregator
    if (this.modules.multiAccountAggregator) {
      this.modules.multiAccountAggregator.updateAccount(accountId, data);
    }

    // 更新组合风控管理器 / Update portfolio risk manager
    if (this.modules.portfolioRiskManager) {
      this.modules.portfolioRiskManager.updateStrategyState(accountId, {
        equity: data.equity,
        positionValue: data.positionValue,
        positions: data.positions,
      });
    }
  }

  /**
   * 注册账户
   * Register account
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} config - 账户配置 / Account config
   */
  registerAccount(accountId, config = {}) {
    // 注册到跨账户风险汇总器 / Register to multi-account aggregator
    if (this.modules.multiAccountAggregator) {
      this.modules.multiAccountAggregator.registerAccount(accountId, config);
    }

    // 注册到组合风控管理器 / Register to portfolio risk manager
    if (this.modules.portfolioRiskManager) {
      this.modules.portfolioRiskManager.registerStrategy(accountId, config);
    }

    // 创建账户级别风控管理器 / Create account-level risk manager
    const accountRiskManager = new RiskManager(config.riskConfig);
    this.modules.accountRiskManagers.set(accountId, accountRiskManager);

    // 将账户风控管理器注册到跨账户汇总器 / Register account risk manager to aggregator
    if (this.modules.multiAccountAggregator) {
      this.modules.multiAccountAggregator.setAccountRiskManager(accountId, accountRiskManager);
    }

    this.log(`账户已注册: ${accountId}`, 'info');
  }

  // ============================================
  // 订单检查 / Order Checking
  // ============================================

  /**
   * 检查订单风险
   * Check order risk
   *
   * @param {Object} order - 订单信息 / Order info
   * @returns {Object} 检查结果 / Check result
   */
  checkOrder(order) {
    this.statistics.totalChecks++;

    const result = {
      allowed: true,
      reasons: [],
      warnings: [],
      checks: {},
    };

    const { accountId, symbol, side, amount, price } = order;

    // 1. 检查黑天鹅状态 / Check black swan status
    if (this.modules.blackSwanProtector) {
      const bsStatus = this.modules.blackSwanProtector.getStatus();
      if (bsStatus.circuitBreakerState.level !== CIRCUIT_BREAKER_LEVEL.NORMAL) {
        result.allowed = false;
        result.reasons.push(`熔断中: ${bsStatus.circuitBreakerState.reason}`);
        result.checks.blackSwan = { passed: false, level: bsStatus.circuitBreakerState.level };
      } else {
        result.checks.blackSwan = { passed: true };
      }
    }

    // 2. 检查流动性风险 / Check liquidity risk
    if (this.modules.liquidityMonitor && result.allowed) {
      const liquidityCheck = this.modules.liquidityMonitor.checkOrderRisk(order);
      result.checks.liquidity = liquidityCheck;

      if (!liquidityCheck.allowed) {
        result.allowed = false;
        result.reasons.push(...liquidityCheck.warnings);
      } else {
        result.warnings.push(...liquidityCheck.warnings);
        if (liquidityCheck.recommendations) {
          result.recommendations = liquidityCheck.recommendations;
        }
        if (liquidityCheck.splitPlan) {
          result.splitPlan = liquidityCheck.splitPlan;
        }
      }
    }

    // 3. 检查跨账户风险 / Check multi-account risk
    if (this.modules.multiAccountAggregator && result.allowed) {
      const maCheck = this.modules.multiAccountAggregator.checkOrder(accountId, order);
      result.checks.multiAccount = maCheck;

      if (!maCheck.allowed) {
        result.allowed = false;
        result.reasons.push(...maCheck.reasons);
      }
      result.warnings.push(...maCheck.warnings);
    }

    // 4. 检查组合风控 / Check portfolio risk
    if (this.modules.portfolioRiskManager && result.allowed) {
      const portfolioCheck = this.modules.portfolioRiskManager.checkOrder({
        strategyId: accountId,
        symbol,
        side,
        amount,
        price,
      });
      result.checks.portfolio = portfolioCheck;

      if (!portfolioCheck.allowed) {
        result.allowed = false;
        result.reasons.push(...portfolioCheck.reasons);
      }
      result.warnings.push(...portfolioCheck.warnings);
    }

    // 5. 检查账户级别风控 / Check account-level risk
    const accountRiskManager = this.modules.accountRiskManagers.get(accountId);
    if (accountRiskManager && result.allowed) {
      const accountCheck = accountRiskManager.checkOpenPosition({
        symbol,
        side,
        amount,
        price,
      });
      result.checks.account = accountCheck;

      if (!accountCheck.allowed) {
        result.allowed = false;
        result.reasons.push(...accountCheck.reasons);
      }
    }

    // 统计被阻止的订单 / Count blocked orders
    if (!result.allowed) {
      this.statistics.blockedOrders++;
      this._recordEvent('orderCheck', 'blocked', { order, result });
    }

    return result;
  }

  /**
   * 获取滑点预估
   * Get slippage estimation
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 方向 / Side
   * @param {number} amount - 数量 / Amount
   * @returns {Object} 滑点预估 / Slippage estimation
   */
  estimateSlippage(symbol, side, amount) {
    if (!this.modules.liquidityMonitor) {
      return { success: false, error: '流动性监控器未启用' };
    }

    return this.modules.liquidityMonitor.estimateSlippage(symbol, side, amount);
  }

  /**
   * 获取大单拆分建议
   * Get large order splitting recommendation
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 方向 / Side
   * @param {number} amount - 数量 / Amount
   * @returns {Object} 拆分建议 / Splitting recommendation
   */
  getOrderSplitRecommendation(symbol, side, amount) {
    if (!this.modules.liquidityMonitor) {
      return { success: false, error: '流动性监控器未启用' };
    }

    return this.modules.liquidityMonitor.getOrderSplitRecommendation(symbol, side, amount);
  }

  // ============================================
  // 紧急操作 / Emergency Operations
  // ============================================

  /**
   * 手动触发熔断
   * Manual trigger circuit breaker
   *
   * @param {string} level - 熔断级别 / Circuit breaker level
   * @param {string} reason - 原因 / Reason
   */
  async triggerCircuitBreaker(level, reason = '手动触发') {
    if (!this.modules.blackSwanProtector) {
      this.log('黑天鹅保护器未启用', 'error');
      return;
    }

    await this.modules.blackSwanProtector.manualTrigger(level, reason);
  }

  /**
   * 手动解除熔断
   * Manual recover from circuit breaker
   */
  recoverFromCircuitBreaker() {
    if (this.modules.blackSwanProtector) {
      this.modules.blackSwanProtector.manualRecover();
    }
  }

  /**
   * 暂停所有交易
   * Pause all trading
   *
   * @param {string} reason - 原因 / Reason
   */
  pauseAllTrading(reason = '手动暂停') {
    if (this.modules.portfolioRiskManager) {
      this.modules.portfolioRiskManager.pauseTrading(reason);
    }

    if (this.modules.multiAccountAggregator) {
      this.modules.multiAccountAggregator.globalState.tradingAllowed = false;
      this.modules.multiAccountAggregator.globalState.pauseReason = reason;
    }

    this.log(`所有交易已暂停: ${reason}`, 'warn');
    this.emit('tradingPaused', { reason, timestamp: Date.now() });
  }

  /**
   * 恢复所有交易
   * Resume all trading
   */
  resumeAllTrading() {
    if (this.modules.portfolioRiskManager) {
      this.modules.portfolioRiskManager.resumeTrading();
    }

    if (this.modules.multiAccountAggregator) {
      this.modules.multiAccountAggregator.resumeTrading();
    }

    this.log('所有交易已恢复', 'info');
    this.emit('tradingResumed', { timestamp: Date.now() });
  }

  // ============================================
  // 状态和报告 / Status and Reports
  // ============================================

  /**
   * 获取模块状态
   * Get module status
   *
   * @returns {Object} 模块状态 / Module status
   */
  getModuleStatus() {
    return {
      blackSwanProtector: this.modules.blackSwanProtector
        ? this.modules.blackSwanProtector.getStatus()
        : null,
      liquidityMonitor: this.modules.liquidityMonitor
        ? this.modules.liquidityMonitor.getStatus()
        : null,
      multiAccountAggregator: this.modules.multiAccountAggregator
        ? this.modules.multiAccountAggregator.getGlobalStatus()
        : null,
      portfolioRiskManager: this.modules.portfolioRiskManager
        ? this.modules.portfolioRiskManager.getStatus()
        : null,
    };
  }

  /**
   * 获取综合风险报告
   * Get comprehensive risk report
   *
   * @returns {Object} 综合风险报告 / Comprehensive risk report
   */
  getRiskReport() {
    return {
      timestamp: Date.now(),
      systemStatus: this.status,
      statistics: { ...this.statistics },
      modules: {
        blackSwan: this.modules.blackSwanProtector
          ? this.modules.blackSwanProtector.getStatus()
          : null,
        liquidity: this.modules.liquidityMonitor
          ? this.modules.liquidityMonitor.getStatus()
          : null,
        multiAccount: this.modules.multiAccountAggregator
          ? this.modules.multiAccountAggregator.getRiskReport()
          : null,
        portfolio: this.modules.portfolioRiskManager
          ? this.modules.portfolioRiskManager.getRiskReport()
          : null,
      },
      recentEvents: this.eventHistory.slice(-50),
    };
  }

  /**
   * 获取流动性评分
   * Get liquidity score
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 流动性评分 / Liquidity score
   */
  getLiquidityScore(symbol) {
    if (!this.modules.liquidityMonitor) {
      return { error: '流动性监控器未启用' };
    }

    return this.modules.liquidityMonitor.getLiquidityScore(symbol);
  }

  // ============================================
  // 辅助方法 / Helper Methods
  // ============================================

  /**
   * 记录事件
   * Record event
   *
   * @param {string} module - 模块 / Module
   * @param {string} type - 类型 / Type
   * @param {Object} data - 数据 / Data
   * @private
   */
  _recordEvent(module, type, data) {
    this.eventHistory.push({
      module,
      type,
      data,
      timestamp: Date.now(),
    });

    // 限制历史长度 / Limit history length
    if (this.eventHistory.length > 1000) {
      this.eventHistory = this.eventHistory.slice(-1000);
    }
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

// 导出主类 / Export main class
export default RiskSystem;

// 导出所有子模块 / Export all sub-modules
export {
  BlackSwanProtector,
  LiquidityRiskMonitor,
  MultiAccountRiskAggregator,
  PortfolioRiskManager,
  RiskManager,
};

// 导出常量 / Export constants
export {
  SYSTEM_STATUS,
  CIRCUIT_BREAKER_LEVEL,
  BLACK_SWAN_TYPE,
  LIQUIDITY_LEVEL,
  EXECUTION_STRATEGY,
  ACCOUNT_STATUS,
  GLOBAL_RISK_LEVEL,
  PORTFOLIO_RISK_LEVEL,
  RISK_ACTION,
};
