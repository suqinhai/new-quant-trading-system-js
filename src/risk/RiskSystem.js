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

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import { BlackSwanProtector, CIRCUIT_BREAKER_LEVEL, BLACK_SWAN_TYPE } from './BlackSwanProtector.js'; // 导入模块 ./BlackSwanProtector.js
import { LiquidityRiskMonitor, LIQUIDITY_LEVEL, EXECUTION_STRATEGY } from './LiquidityRiskMonitor.js'; // 导入模块 ./LiquidityRiskMonitor.js
import { MultiAccountRiskAggregator, ACCOUNT_STATUS, GLOBAL_RISK_LEVEL } from './MultiAccountRiskAggregator.js'; // 导入模块 ./MultiAccountRiskAggregator.js
import { PortfolioRiskManager, PORTFOLIO_RISK_LEVEL, RISK_ACTION } from './PortfolioRiskManager.js'; // 导入模块 ./PortfolioRiskManager.js
import { RiskManager } from './RiskManager.js'; // 导入模块 ./RiskManager.js

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 风控系统状态
 * Risk system status
 */
const SYSTEM_STATUS = { // 定义常量 SYSTEM_STATUS
  INITIALIZING: 'initializing', // 设置 INITIALIZING 字段
  RUNNING: 'running', // 设置 RUNNING 字段
  PAUSED: 'paused', // 设置 PAUSED 字段
  STOPPED: 'stopped', // 设置 STOPPED 字段
  ERROR: 'error', // 设置 ERROR 字段
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // 是否启用黑天鹅保护 / Enable black swan protection
  enableBlackSwanProtection: true, // 设置 enableBlackSwanProtection 字段

  // 是否启用流动性监控 / Enable liquidity monitoring
  enableLiquidityMonitoring: true, // 设置 enableLiquidityMonitoring 字段

  // 是否启用跨账户风控 / Enable multi-account risk management
  enableMultiAccountRisk: true, // 设置 enableMultiAccountRisk 字段

  // 是否启用组合风控 / Enable portfolio risk management
  enablePortfolioRisk: true, // 设置 enablePortfolioRisk 字段

  // 日志配置 / Logging configuration
  verbose: true, // 设置 verbose 字段
  logPrefix: '[RiskSystem]', // 设置 logPrefix 字段
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 统一风控系统
 * Unified Risk Management System
 */
export class RiskSystem extends EventEmitter { // 导出类 RiskSystem
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

    // 系统状态 / System status
    this.status = SYSTEM_STATUS.INITIALIZING; // 设置 status

    // 风控模块实例 / Risk module instances
    this.modules = { // 设置 modules
      blackSwanProtector: null, // 设置 blackSwanProtector 字段
      liquidityMonitor: null, // 设置 liquidityMonitor 字段
      multiAccountAggregator: null, // 设置 multiAccountAggregator 字段
      portfolioRiskManager: null, // 设置 portfolioRiskManager 字段
      accountRiskManagers: new Map(), // 账户级别风控管理器
    }; // 结束代码块

    // 执行器引用 / Executor reference
    this.executor = null; // 设置 executor

    // 事件历史 / Event history
    this.eventHistory = []; // 设置 eventHistory

    // 统计数据 / Statistics
    this.statistics = { // 设置 statistics
      totalChecks: 0, // 设置 totalChecks 字段
      triggeredEvents: 0, // 设置 triggeredEvents 字段
      blockedOrders: 0, // 设置 blockedOrders 字段
      emergencyActions: 0, // 设置 emergencyActions 字段
      startTime: Date.now(), // 设置 startTime 字段
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化风控系统
   * Initialize risk system
   *
   * @param {Object} options - 初始化选项 / Initialization options
   */
  async init(options = {}) { // 执行语句
    const { // 解构赋值
      executor, // 执行语句
      initialEquity, // 执行语句
      blackSwanConfig, // 执行语句
      liquidityConfig, // 执行语句
      multiAccountConfig, // 执行语句
      portfolioConfig, // 执行语句
    } = options; // 执行语句

    this.executor = executor; // 设置 executor

    try { // 尝试执行
      // 1. 初始化黑天鹅保护器 / Initialize black swan protector
      if (this.config.enableBlackSwanProtection) { // 条件判断 this.config.enableBlackSwanProtection
        this.modules.blackSwanProtector = new BlackSwanProtector(blackSwanConfig); // 访问 modules
        await this.modules.blackSwanProtector.init({ executor }); // 等待异步结果
        this._setupBlackSwanEvents(); // 调用 _setupBlackSwanEvents
        this.log('黑天鹅保护器初始化完成 / Black swan protector initialized', 'info'); // 调用 log
      } // 结束代码块

      // 2. 初始化流动性监控器 / Initialize liquidity monitor
      if (this.config.enableLiquidityMonitoring) { // 条件判断 this.config.enableLiquidityMonitoring
        this.modules.liquidityMonitor = new LiquidityRiskMonitor(liquidityConfig); // 访问 modules
        this._setupLiquidityEvents(); // 调用 _setupLiquidityEvents
        this.log('流动性监控器初始化完成 / Liquidity monitor initialized', 'info'); // 调用 log
      } // 结束代码块

      // 3. 初始化跨账户风险汇总器 / Initialize multi-account aggregator
      if (this.config.enableMultiAccountRisk) { // 条件判断 this.config.enableMultiAccountRisk
        this.modules.multiAccountAggregator = new MultiAccountRiskAggregator(multiAccountConfig); // 访问 modules
        await this.modules.multiAccountAggregator.init({ initialEquity }); // 等待异步结果
        this._setupMultiAccountEvents(); // 调用 _setupMultiAccountEvents
        this.log('跨账户风险汇总器初始化完成 / Multi-account aggregator initialized', 'info'); // 调用 log
      } // 结束代码块

      // 4. 初始化组合风控管理器 / Initialize portfolio risk manager
      if (this.config.enablePortfolioRisk) { // 条件判断 this.config.enablePortfolioRisk
        this.modules.portfolioRiskManager = new PortfolioRiskManager(portfolioConfig); // 访问 modules
        await this.modules.portfolioRiskManager.init({ // 等待异步结果
          executor, // 执行语句
          initialEquity, // 执行语句
        }); // 结束代码块
        this._setupPortfolioEvents(); // 调用 _setupPortfolioEvents
        this.log('组合风控管理器初始化完成 / Portfolio risk manager initialized', 'info'); // 调用 log
      } // 结束代码块

      // 连接模块 / Connect modules
      this._connectModules(); // 调用 _connectModules

      this.status = SYSTEM_STATUS.RUNNING; // 设置 status
      this.log('统一风控系统初始化完成 / Unified risk system initialized', 'info'); // 调用 log

      this.emit('initialized', { // 调用 emit
        modules: this.getModuleStatus(), // 设置 modules 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块

    } catch (error) { // 执行语句
      this.status = SYSTEM_STATUS.ERROR; // 设置 status
      this.log(`初始化失败: ${error.message}`, 'error'); // 调用 log
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动风控系统
   * Start risk system
   */
  start() { // 调用 start
    if (this.status === SYSTEM_STATUS.RUNNING) { // 条件判断 this.status === SYSTEM_STATUS.RUNNING
      this.log('系统已在运行中 / System already running', 'info'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    // 启动所有模块 / Start all modules
    if (this.modules.blackSwanProtector) { // 条件判断 this.modules.blackSwanProtector
      this.modules.blackSwanProtector.start(); // 访问 modules
    } // 结束代码块

    if (this.modules.liquidityMonitor) { // 条件判断 this.modules.liquidityMonitor
      this.modules.liquidityMonitor.start(); // 访问 modules
    } // 结束代码块

    if (this.modules.multiAccountAggregator) { // 条件判断 this.modules.multiAccountAggregator
      this.modules.multiAccountAggregator.start(); // 访问 modules
    } // 结束代码块

    if (this.modules.portfolioRiskManager) { // 条件判断 this.modules.portfolioRiskManager
      this.modules.portfolioRiskManager.start(); // 访问 modules
    } // 结束代码块

    this.status = SYSTEM_STATUS.RUNNING; // 设置 status
    this.log('统一风控系统已启动 / Unified risk system started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止风控系统
   * Stop risk system
   */
  stop() { // 调用 stop
    if (this.status === SYSTEM_STATUS.STOPPED) { // 条件判断 this.status === SYSTEM_STATUS.STOPPED
      return; // 返回结果
    } // 结束代码块

    // 停止所有模块 / Stop all modules
    if (this.modules.blackSwanProtector) { // 条件判断 this.modules.blackSwanProtector
      this.modules.blackSwanProtector.stop(); // 访问 modules
    } // 结束代码块

    if (this.modules.liquidityMonitor) { // 条件判断 this.modules.liquidityMonitor
      this.modules.liquidityMonitor.stop(); // 访问 modules
    } // 结束代码块

    if (this.modules.multiAccountAggregator) { // 条件判断 this.modules.multiAccountAggregator
      this.modules.multiAccountAggregator.stop(); // 访问 modules
    } // 结束代码块

    if (this.modules.portfolioRiskManager) { // 条件判断 this.modules.portfolioRiskManager
      this.modules.portfolioRiskManager.stop(); // 访问 modules
    } // 结束代码块

    this.status = SYSTEM_STATUS.STOPPED; // 设置 status
    this.log('统一风控系统已停止 / Unified risk system stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 模块连接 / Module Connection
  // ============================================

  /**
   * 连接模块
   * Connect modules
   * @private
   */
  _connectModules() { // 调用 _connectModules
    // 将黑天鹅保护器连接到组合风控 / Connect black swan protector to portfolio risk
    if (this.modules.blackSwanProtector && this.modules.portfolioRiskManager) { // 条件判断 this.modules.blackSwanProtector && this.modul...
      this.modules.blackSwanProtector.portfolioRiskManager = this.modules.portfolioRiskManager; // 访问 modules
    } // 结束代码块

    // 将流动性监控器的警告传递给组合风控 / Pass liquidity warnings to portfolio risk
    if (this.modules.liquidityMonitor && this.modules.portfolioRiskManager) { // 条件判断 this.modules.liquidityMonitor && this.modules...
      this.modules.liquidityMonitor.on('liquidityWarning', (warning) => { // 访问 modules
        this.modules.portfolioRiskManager.emit('liquidityWarning', warning); // 访问 modules
      }); // 结束代码块
    } // 结束代码块

    this.log('模块连接完成 / Modules connected', 'info'); // 调用 log
  } // 结束代码块

  // ============================================
  // 事件设置 / Event Setup
  // ============================================

  /**
   * 设置黑天鹅事件
   * Setup black swan events
   * @private
   */
  _setupBlackSwanEvents() { // 调用 _setupBlackSwanEvents
    const protector = this.modules.blackSwanProtector; // 定义常量 protector

    protector.on('circuitBreakerTriggered', (event) => { // 注册事件监听
      this._recordEvent('blackSwan', 'circuitBreaker', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'blackSwan', type: 'circuitBreaker', ...event }); // 调用 emit
      this.statistics.triggeredEvents++; // 访问 statistics
    }); // 结束代码块

    protector.on('emergencyClose', (event) => { // 注册事件监听
      this._recordEvent('blackSwan', 'emergencyClose', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'blackSwan', type: 'emergencyClose', ...event }); // 调用 emit
      this.statistics.emergencyActions++; // 访问 statistics
    }); // 结束代码块

    protector.on('recovered', (event) => { // 注册事件监听
      this._recordEvent('blackSwan', 'recovered', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'blackSwan', type: 'recovered', ...event }); // 调用 emit
    }); // 结束代码块
  } // 结束代码块

  /**
   * 设置流动性事件
   * Setup liquidity events
   * @private
   */
  _setupLiquidityEvents() { // 调用 _setupLiquidityEvents
    const monitor = this.modules.liquidityMonitor; // 定义常量 monitor

    monitor.on('liquidityWarning', (event) => { // 注册事件监听
      this._recordEvent('liquidity', 'warning', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'liquidity', type: 'warning', ...event }); // 调用 emit
    }); // 结束代码块
  } // 结束代码块

  /**
   * 设置跨账户事件
   * Setup multi-account events
   * @private
   */
  _setupMultiAccountEvents() { // 调用 _setupMultiAccountEvents
    const aggregator = this.modules.multiAccountAggregator; // 定义常量 aggregator

    aggregator.on('riskLevelChanged', (event) => { // 注册事件监听
      this._recordEvent('multiAccount', 'riskLevelChanged', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'multiAccount', type: 'riskLevelChanged', ...event }); // 调用 emit
    }); // 结束代码块

    aggregator.on('globalEmergency', (event) => { // 注册事件监听
      this._recordEvent('multiAccount', 'globalEmergency', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'multiAccount', type: 'globalEmergency', ...event }); // 调用 emit
      this.statistics.emergencyActions++; // 访问 statistics
    }); // 结束代码块

    aggregator.on('accountWarning', (event) => { // 注册事件监听
      this._recordEvent('multiAccount', 'accountWarning', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'multiAccount', type: 'accountWarning', ...event }); // 调用 emit
    }); // 结束代码块
  } // 结束代码块

  /**
   * 设置组合风控事件
   * Setup portfolio risk events
   * @private
   */
  _setupPortfolioEvents() { // 调用 _setupPortfolioEvents
    const manager = this.modules.portfolioRiskManager; // 定义常量 manager

    manager.on('riskLevelChanged', (event) => { // 注册事件监听
      this._recordEvent('portfolio', 'riskLevelChanged', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'portfolio', type: 'riskLevelChanged', ...event }); // 调用 emit
    }); // 结束代码块

    manager.on('emergencyClose', (event) => { // 注册事件监听
      this._recordEvent('portfolio', 'emergencyClose', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'portfolio', type: 'emergencyClose', ...event }); // 调用 emit
      this.statistics.emergencyActions++; // 访问 statistics
    }); // 结束代码块

    manager.on('tradingPaused', (event) => { // 注册事件监听
      this._recordEvent('portfolio', 'tradingPaused', event); // 调用 _recordEvent
      this.emit('riskEvent', { module: 'portfolio', type: 'tradingPaused', ...event }); // 调用 emit
    }); // 结束代码块
  } // 结束代码块

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
  updateMarketData(symbol, data) { // 调用 updateMarketData
    const { price, volume, orderBook } = data; // 解构赋值

    // 更新黑天鹅保护器 / Update black swan protector
    if (this.modules.blackSwanProtector && price) { // 条件判断 this.modules.blackSwanProtector && price
      this.modules.blackSwanProtector.updatePrice(symbol, price, volume, orderBook); // 访问 modules
    } // 结束代码块

    // 更新流动性监控器 / Update liquidity monitor
    if (this.modules.liquidityMonitor) { // 条件判断 this.modules.liquidityMonitor
      if (orderBook) { // 条件判断 orderBook
        this.modules.liquidityMonitor.updateOrderBook(symbol, orderBook); // 访问 modules
      } // 结束代码块
      if (data.trade) { // 条件判断 data.trade
        this.modules.liquidityMonitor.updateTrade(symbol, data.trade); // 访问 modules
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新账户数据
   * Update account data
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} data - 账户数据 / Account data
   */
  updateAccountData(accountId, data) { // 调用 updateAccountData
    // 更新跨账户风险汇总器 / Update multi-account aggregator
    if (this.modules.multiAccountAggregator) { // 条件判断 this.modules.multiAccountAggregator
      this.modules.multiAccountAggregator.updateAccount(accountId, data); // 访问 modules
    } // 结束代码块

    // 更新组合风控管理器 / Update portfolio risk manager
    if (this.modules.portfolioRiskManager) { // 条件判断 this.modules.portfolioRiskManager
      this.modules.portfolioRiskManager.updateStrategyState(accountId, { // 访问 modules
        equity: data.equity, // 设置 equity 字段
        positionValue: data.positionValue, // 设置 positionValue 字段
        positions: data.positions, // 设置 positions 字段
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 注册账户
   * Register account
   *
   * @param {string} accountId - 账户ID / Account ID
   * @param {Object} config - 账户配置 / Account config
   */
  registerAccount(accountId, config = {}) { // 调用 registerAccount
    // 注册到跨账户风险汇总器 / Register to multi-account aggregator
    if (this.modules.multiAccountAggregator) { // 条件判断 this.modules.multiAccountAggregator
      this.modules.multiAccountAggregator.registerAccount(accountId, config); // 访问 modules
    } // 结束代码块

    // 注册到组合风控管理器 / Register to portfolio risk manager
    if (this.modules.portfolioRiskManager) { // 条件判断 this.modules.portfolioRiskManager
      this.modules.portfolioRiskManager.registerStrategy(accountId, config); // 访问 modules
    } // 结束代码块

    // 创建账户级别风控管理器 / Create account-level risk manager
    const accountRiskManager = new RiskManager(config.riskConfig); // 定义常量 accountRiskManager
    this.modules.accountRiskManagers.set(accountId, accountRiskManager); // 访问 modules

    // 将账户风控管理器注册到跨账户汇总器 / Register account risk manager to aggregator
    if (this.modules.multiAccountAggregator) { // 条件判断 this.modules.multiAccountAggregator
      this.modules.multiAccountAggregator.setAccountRiskManager(accountId, accountRiskManager); // 访问 modules
    } // 结束代码块

    this.log(`账户已注册: ${accountId}`, 'info'); // 调用 log
  } // 结束代码块

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
  checkOrder(order) { // 调用 checkOrder
    this.statistics.totalChecks++; // 访问 statistics

    const result = { // 定义常量 result
      allowed: true, // 设置 allowed 字段
      reasons: [], // 设置 reasons 字段
      warnings: [], // 设置 warnings 字段
      checks: {}, // 设置 checks 字段
    }; // 结束代码块

    const { accountId, symbol, side, amount, price } = order; // 解构赋值

    // 1. 检查黑天鹅状态 / Check black swan status
    if (this.modules.blackSwanProtector) { // 条件判断 this.modules.blackSwanProtector
      const bsStatus = this.modules.blackSwanProtector.getStatus(); // 定义常量 bsStatus
      if (bsStatus.circuitBreakerState.level !== CIRCUIT_BREAKER_LEVEL.NORMAL) { // 条件判断 bsStatus.circuitBreakerState.level !== CIRCUI...
        result.allowed = false; // 赋值 result.allowed
        result.reasons.push(`熔断中: ${bsStatus.circuitBreakerState.reason}`); // 调用 result.reasons.push
        result.checks.blackSwan = { passed: false, level: bsStatus.circuitBreakerState.level }; // 赋值 result.checks.blackSwan
      } else { // 执行语句
        result.checks.blackSwan = { passed: true }; // 赋值 result.checks.blackSwan
      } // 结束代码块
    } // 结束代码块

    // 2. 检查流动性风险 / Check liquidity risk
    if (this.modules.liquidityMonitor && result.allowed) { // 条件判断 this.modules.liquidityMonitor && result.allowed
      const liquidityCheck = this.modules.liquidityMonitor.checkOrderRisk(order); // 定义常量 liquidityCheck
      result.checks.liquidity = liquidityCheck; // 赋值 result.checks.liquidity

      if (!liquidityCheck.allowed) { // 条件判断 !liquidityCheck.allowed
        result.allowed = false; // 赋值 result.allowed
        result.reasons.push(...liquidityCheck.warnings); // 调用 result.reasons.push
      } else { // 执行语句
        result.warnings.push(...liquidityCheck.warnings); // 调用 result.warnings.push
        if (liquidityCheck.recommendations) { // 条件判断 liquidityCheck.recommendations
          result.recommendations = liquidityCheck.recommendations; // 赋值 result.recommendations
        } // 结束代码块
        if (liquidityCheck.splitPlan) { // 条件判断 liquidityCheck.splitPlan
          result.splitPlan = liquidityCheck.splitPlan; // 赋值 result.splitPlan
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 3. 检查跨账户风险 / Check multi-account risk
    if (this.modules.multiAccountAggregator && result.allowed) { // 条件判断 this.modules.multiAccountAggregator && result...
      const maCheck = this.modules.multiAccountAggregator.checkOrder(accountId, order); // 定义常量 maCheck
      result.checks.multiAccount = maCheck; // 赋值 result.checks.multiAccount

      if (!maCheck.allowed) { // 条件判断 !maCheck.allowed
        result.allowed = false; // 赋值 result.allowed
        result.reasons.push(...maCheck.reasons); // 调用 result.reasons.push
      } // 结束代码块
      result.warnings.push(...maCheck.warnings); // 调用 result.warnings.push
    } // 结束代码块

    // 4. 检查组合风控 / Check portfolio risk
    if (this.modules.portfolioRiskManager && result.allowed) { // 条件判断 this.modules.portfolioRiskManager && result.a...
      const portfolioCheck = this.modules.portfolioRiskManager.checkOrder({ // 定义常量 portfolioCheck
        strategyId: accountId, // 设置 strategyId 字段
        symbol, // 执行语句
        side, // 执行语句
        amount, // 执行语句
        price, // 执行语句
      }); // 结束代码块
      result.checks.portfolio = portfolioCheck; // 赋值 result.checks.portfolio

      if (!portfolioCheck.allowed) { // 条件判断 !portfolioCheck.allowed
        result.allowed = false; // 赋值 result.allowed
        result.reasons.push(...portfolioCheck.reasons); // 调用 result.reasons.push
      } // 结束代码块
      result.warnings.push(...portfolioCheck.warnings); // 调用 result.warnings.push
    } // 结束代码块

    // 5. 检查账户级别风控 / Check account-level risk
    const accountRiskManager = this.modules.accountRiskManagers.get(accountId); // 定义常量 accountRiskManager
    if (accountRiskManager && result.allowed) { // 条件判断 accountRiskManager && result.allowed
      const accountCheck = accountRiskManager.checkOpenPosition({ // 定义常量 accountCheck
        symbol, // 执行语句
        side, // 执行语句
        amount, // 执行语句
        price, // 执行语句
      }); // 结束代码块
      result.checks.account = accountCheck; // 赋值 result.checks.account

      if (!accountCheck.allowed) { // 条件判断 !accountCheck.allowed
        result.allowed = false; // 赋值 result.allowed
        result.reasons.push(...accountCheck.reasons); // 调用 result.reasons.push
      } // 结束代码块
    } // 结束代码块

    // 统计被阻止的订单 / Count blocked orders
    if (!result.allowed) { // 条件判断 !result.allowed
      this.statistics.blockedOrders++; // 访问 statistics
      this._recordEvent('orderCheck', 'blocked', { order, result }); // 调用 _recordEvent
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取滑点预估
   * Get slippage estimation
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 方向 / Side
   * @param {number} amount - 数量 / Amount
   * @returns {Object} 滑点预估 / Slippage estimation
   */
  estimateSlippage(symbol, side, amount) { // 调用 estimateSlippage
    if (!this.modules.liquidityMonitor) { // 条件判断 !this.modules.liquidityMonitor
      return { success: false, error: '流动性监控器未启用' }; // 返回结果
    } // 结束代码块

    return this.modules.liquidityMonitor.estimateSlippage(symbol, side, amount); // 返回结果
  } // 结束代码块

  /**
   * 获取大单拆分建议
   * Get large order splitting recommendation
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 方向 / Side
   * @param {number} amount - 数量 / Amount
   * @returns {Object} 拆分建议 / Splitting recommendation
   */
  getOrderSplitRecommendation(symbol, side, amount) { // 调用 getOrderSplitRecommendation
    if (!this.modules.liquidityMonitor) { // 条件判断 !this.modules.liquidityMonitor
      return { success: false, error: '流动性监控器未启用' }; // 返回结果
    } // 结束代码块

    return this.modules.liquidityMonitor.getOrderSplitRecommendation(symbol, side, amount); // 返回结果
  } // 结束代码块

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
  async triggerCircuitBreaker(level, reason = '手动触发') { // 执行语句
    if (!this.modules.blackSwanProtector) { // 条件判断 !this.modules.blackSwanProtector
      this.log('黑天鹅保护器未启用', 'error'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    await this.modules.blackSwanProtector.manualTrigger(level, reason); // 等待异步结果
  } // 结束代码块

  /**
   * 手动解除熔断
   * Manual recover from circuit breaker
   */
  recoverFromCircuitBreaker() { // 调用 recoverFromCircuitBreaker
    if (this.modules.blackSwanProtector) { // 条件判断 this.modules.blackSwanProtector
      this.modules.blackSwanProtector.manualRecover(); // 访问 modules
    } // 结束代码块
  } // 结束代码块

  /**
   * 暂停所有交易
   * Pause all trading
   *
   * @param {string} reason - 原因 / Reason
   */
  pauseAllTrading(reason = '手动暂停') { // 调用 pauseAllTrading
    if (this.modules.portfolioRiskManager) { // 条件判断 this.modules.portfolioRiskManager
      this.modules.portfolioRiskManager.pauseTrading(reason); // 访问 modules
    } // 结束代码块

    if (this.modules.multiAccountAggregator) { // 条件判断 this.modules.multiAccountAggregator
      this.modules.multiAccountAggregator.globalState.tradingAllowed = false; // 访问 modules
      this.modules.multiAccountAggregator.globalState.pauseReason = reason; // 访问 modules
    } // 结束代码块

    this.log(`所有交易已暂停: ${reason}`, 'warn'); // 调用 log
    this.emit('tradingPaused', { reason, timestamp: Date.now() }); // 调用 emit
  } // 结束代码块

  /**
   * 恢复所有交易
   * Resume all trading
   */
  resumeAllTrading() { // 调用 resumeAllTrading
    if (this.modules.portfolioRiskManager) { // 条件判断 this.modules.portfolioRiskManager
      this.modules.portfolioRiskManager.resumeTrading(); // 访问 modules
    } // 结束代码块

    if (this.modules.multiAccountAggregator) { // 条件判断 this.modules.multiAccountAggregator
      this.modules.multiAccountAggregator.resumeTrading(); // 访问 modules
    } // 结束代码块

    this.log('所有交易已恢复', 'info'); // 调用 log
    this.emit('tradingResumed', { timestamp: Date.now() }); // 调用 emit
  } // 结束代码块

  // ============================================
  // 状态和报告 / Status and Reports
  // ============================================

  /**
   * 获取模块状态
   * Get module status
   *
   * @returns {Object} 模块状态 / Module status
   */
  getModuleStatus() { // 调用 getModuleStatus
    return { // 返回结果
      blackSwanProtector: this.modules.blackSwanProtector // 设置 blackSwanProtector 字段
        ? this.modules.blackSwanProtector.getStatus() // 执行语句
        : null, // 执行语句
      liquidityMonitor: this.modules.liquidityMonitor // 设置 liquidityMonitor 字段
        ? this.modules.liquidityMonitor.getStatus() // 执行语句
        : null, // 执行语句
      multiAccountAggregator: this.modules.multiAccountAggregator // 设置 multiAccountAggregator 字段
        ? this.modules.multiAccountAggregator.getGlobalStatus() // 执行语句
        : null, // 执行语句
      portfolioRiskManager: this.modules.portfolioRiskManager // 设置 portfolioRiskManager 字段
        ? this.modules.portfolioRiskManager.getStatus() // 执行语句
        : null, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取综合风险报告
   * Get comprehensive risk report
   *
   * @returns {Object} 综合风险报告 / Comprehensive risk report
   */
  getRiskReport() { // 调用 getRiskReport
    return { // 返回结果
      timestamp: Date.now(), // 设置 timestamp 字段
      systemStatus: this.status, // 设置 systemStatus 字段
      statistics: { ...this.statistics }, // 设置 statistics 字段
      modules: { // 设置 modules 字段
        blackSwan: this.modules.blackSwanProtector // 设置 blackSwan 字段
          ? this.modules.blackSwanProtector.getStatus() // 执行语句
          : null, // 执行语句
        liquidity: this.modules.liquidityMonitor // 设置 liquidity 字段
          ? this.modules.liquidityMonitor.getStatus() // 执行语句
          : null, // 执行语句
        multiAccount: this.modules.multiAccountAggregator // 设置 multiAccount 字段
          ? this.modules.multiAccountAggregator.getRiskReport() // 执行语句
          : null, // 执行语句
        portfolio: this.modules.portfolioRiskManager // 设置 portfolio 字段
          ? this.modules.portfolioRiskManager.getRiskReport() // 执行语句
          : null, // 执行语句
      }, // 结束代码块
      recentEvents: this.eventHistory.slice(-50), // 设置 recentEvents 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取流动性评分
   * Get liquidity score
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 流动性评分 / Liquidity score
   */
  getLiquidityScore(symbol) { // 调用 getLiquidityScore
    if (!this.modules.liquidityMonitor) { // 条件判断 !this.modules.liquidityMonitor
      return { error: '流动性监控器未启用' }; // 返回结果
    } // 结束代码块

    return this.modules.liquidityMonitor.getLiquidityScore(symbol); // 返回结果
  } // 结束代码块

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
  _recordEvent(module, type, data) { // 调用 _recordEvent
    this.eventHistory.push({ // 访问 eventHistory
      module, // 执行语句
      type, // 执行语句
      data, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块

    // 限制历史长度 / Limit history length
    if (this.eventHistory.length > 1000) { // 条件判断 this.eventHistory.length > 1000
      this.eventHistory = this.eventHistory.slice(-1000); // 设置 eventHistory
    } // 结束代码块
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
      default: // 默认分支
        console.log(fullMessage); // 控制台输出
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

// 导出主类 / Export main class
export default RiskSystem; // 默认导出

// 导出所有子模块 / Export all sub-modules
export { // 导出命名成员
  BlackSwanProtector, // 执行语句
  LiquidityRiskMonitor, // 执行语句
  MultiAccountRiskAggregator, // 执行语句
  PortfolioRiskManager, // 执行语句
  RiskManager, // 执行语句
}; // 结束代码块

// 导出常量 / Export constants
export { // 导出命名成员
  SYSTEM_STATUS, // 执行语句
  CIRCUIT_BREAKER_LEVEL, // 执行语句
  BLACK_SWAN_TYPE, // 执行语句
  LIQUIDITY_LEVEL, // 执行语句
  EXECUTION_STRATEGY, // 执行语句
  ACCOUNT_STATUS, // 执行语句
  GLOBAL_RISK_LEVEL, // 执行语句
  PORTFOLIO_RISK_LEVEL, // 执行语句
  RISK_ACTION, // 执行语句
}; // 结束代码块
