/**
 * 警报管理器
 * Alert Manager
 *
 * 功能 / Features:
 * 1. 统一管理所有风控警报 / Unified management of all risk alerts
 * 2. 多通道通知 (Telegram, 日志, 事件) / Multi-channel notifications
 * 3. 警报冷却和去重 / Alert cooldown and deduplication
 * 4. 警报历史记录 / Alert history logging
 * 5. 警报升级机制 / Alert escalation mechanism
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入邮件发送库 / Import email library
import nodemailer from 'nodemailer';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 警报级别
 * Alert level
 */
const ALERT_LEVEL = {
  INFO: 'info',           // 信息 / Information
  WARNING: 'warning',     // 警告 / Warning
  DANGER: 'danger',       // 危险 / Danger
  CRITICAL: 'critical',   // 严重 / Critical
  EMERGENCY: 'emergency', // 紧急 / Emergency
};

/**
 * 警报类别
 * Alert category
 */
const ALERT_CATEGORY = {
  RISK: 'risk',               // 风控 / Risk control
  POSITION: 'position',       // 持仓 / Position
  MARGIN: 'margin',           // 保证金 / Margin
  DRAWDOWN: 'drawdown',       // 回撤 / Drawdown
  CONNECTION: 'connection',   // 连接 / Connection
  EXECUTION: 'execution',     // 执行 / Execution
  SYSTEM: 'system',           // 系统 / System
  MARKET: 'market',           // 市场 / Market
};

/**
 * 警报动作
 * Alert action
 */
const ALERT_ACTION = {
  NOTIFY_ONLY: 'notify',          // 仅通知 / Notify only
  LOG_ONLY: 'log',                // 仅日志 / Log only
  PAUSE_TRADING: 'pause',         // 暂停交易 / Pause trading
  REDUCE_POSITION: 'reduce',      // 减仓 / Reduce position
  EMERGENCY_CLOSE: 'emergency',   // 紧急平仓 / Emergency close
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 警报冷却配置 / Alert Cooldown Configuration
  // ============================================

  // 默认冷却时间 (毫秒) / Default cooldown (ms)
  defaultCooldown: 300000,  // 5分钟 / 5 minutes

  // 各级别冷却时间 / Cooldown by level
  cooldownByLevel: {
    [ALERT_LEVEL.INFO]: 600000,        // 10分钟 / 10 minutes
    [ALERT_LEVEL.WARNING]: 300000,     // 5分钟 / 5 minutes
    [ALERT_LEVEL.DANGER]: 120000,      // 2分钟 / 2 minutes
    [ALERT_LEVEL.CRITICAL]: 60000,     // 1分钟 / 1 minute
    [ALERT_LEVEL.EMERGENCY]: 30000,    // 30秒 / 30 seconds
  },

  // ============================================
  // 警报升级配置 / Alert Escalation Configuration
  // ============================================

  // 是否启用警报升级 / Enable alert escalation
  escalationEnabled: true,

  // 升级触发次数 / Escalation trigger count
  escalationTriggerCount: 3,

  // 升级时间窗口 (毫秒) / Escalation time window (ms)
  escalationWindow: 600000,  // 10分钟 / 10 minutes

  // ============================================
  // 通知渠道配置 / Notification Channel Configuration
  // ============================================

  // 启用 Telegram 通知 / Enable Telegram notifications
  telegramEnabled: true,

  // 启用日志记录 / Enable logging
  loggingEnabled: true,

  // 启用事件发射 / Enable event emission
  eventsEnabled: true,

  // 启用邮件通知 / Enable email notifications
  emailEnabled: false,

  // ============================================
  // 邮件配置 / Email Configuration
  // ============================================

  // SMTP 主机 / SMTP host
  smtpHost: process.env.SMTP_HOST || '',

  // SMTP 端口 / SMTP port
  smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,

  // SMTP 用户 / SMTP user
  smtpUser: process.env.SMTP_USER || '',

  // SMTP 密码 / SMTP password
  smtpPass: process.env.SMTP_PASS || '',

  // 告警接收邮箱 / Alert recipient email
  alertEmailTo: process.env.ALERT_EMAIL_TO || '',

  // 邮件发送级别 (只有 >= 此级别才发邮件) / Email level threshold
  // 可选: warning, danger, critical, emergency
  emailLevelThreshold: 'danger',

  // ============================================
  // 历史记录配置 / History Configuration
  // ============================================

  // 最大历史记录数 / Max history records
  maxHistorySize: 1000,

  // 历史记录保留时间 (毫秒) / History retention time (ms)
  historyRetention: 86400000,  // 24小时 / 24 hours

  // ============================================
  // 阈值配置 / Threshold Configuration
  // ============================================

  // 回撤阈值 / Drawdown thresholds
  drawdownThresholds: {
    warning: 0.05,    // 5% 警告 / 5% warning
    danger: 0.08,     // 8% 危险 / 8% danger
    critical: 0.10,   // 10% 严重 / 10% critical
  },

  // 保证金率阈值 / Margin rate thresholds
  marginRateThresholds: {
    warning: 0.50,    // 50% 警告 / 50% warning
    danger: 0.40,     // 40% 危险 / 40% danger
    critical: 0.35,   // 35% 严重 / 35% critical
  },

  // 仓位集中度阈值 / Position concentration thresholds
  concentrationThresholds: {
    warning: 0.10,    // 10% 警告 / 10% warning
    danger: 0.15,     // 15% 危险 / 15% danger
  },

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[AlertMgr]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 警报管理器
 * Alert Manager
 */
export class AlertManager extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 通知器引用 / Notifier references
    this.notifiers = {
      telegram: null,   // Telegram 通知器 / Telegram notifier
      pnlLogger: null,  // PnL 日志记录器 / PnL logger
    };

    // 数据源引用 / Data source references
    this.dataSources = {
      riskManager: null,      // 风控管理器 / Risk manager
      positionManager: null,  // 仓位管理器 / Position manager
    };

    // 警报冷却映射 / Alert cooldown map
    // 格式: { alertKey: lastTriggeredTime }
    // Format: { alertKey: lastTriggeredTime }
    this.cooldowns = new Map();

    // 警报计数映射 (用于升级) / Alert count map (for escalation)
    // 格式: { alertKey: [{ timestamp }] }
    // Format: { alertKey: [{ timestamp }] }
    this.alertCounts = new Map();

    // 警报历史 / Alert history
    this.history = [];

    // 活跃警报映射 / Active alerts map
    // 格式: { alertId: alertObject }
    // Format: { alertId: alertObject }
    this.activeAlerts = new Map();

    // 统计信息 / Statistics
    this.stats = {
      totalAlerts: 0,           // 总警报数 / Total alerts
      byLevel: {                // 按级别统计 / By level
        [ALERT_LEVEL.INFO]: 0,
        [ALERT_LEVEL.WARNING]: 0,
        [ALERT_LEVEL.DANGER]: 0,
        [ALERT_LEVEL.CRITICAL]: 0,
        [ALERT_LEVEL.EMERGENCY]: 0,
      },
      byCategory: {},           // 按类别统计 / By category
      escalations: 0,           // 升级次数 / Escalation count
      suppressed: 0,            // 抑制次数 / Suppressed count
    };

    // 是否正在运行 / Whether running
    this.running = false;

    // 检查定时器 / Check timer
    this.checkTimer = null;

    // 邮件发送器 / Email transporter
    this.emailTransporter = null;

    // 初始化邮件发送器 / Initialize email transporter
    this._initEmailTransporter();
  }

  // ============================================
  // 初始化和生命周期 / Initialization and Lifecycle
  // ============================================

  /**
   * 设置通知器
   * Set notifiers
   *
   * @param {Object} notifiers - 通知器对象 / Notifiers object
   */
  setNotifiers(notifiers) {
    // 设置 Telegram 通知器 / Set Telegram notifier
    if (notifiers.telegram) {
      this.notifiers.telegram = notifiers.telegram;
    }

    // 设置 PnL 日志记录器 / Set PnL logger
    if (notifiers.pnlLogger) {
      this.notifiers.pnlLogger = notifiers.pnlLogger;
    }
  }

  /**
   * 设置数据源
   * Set data sources
   *
   * @param {Object} sources - 数据源对象 / Data sources object
   */
  setDataSources(sources) {
    // 设置风控管理器 / Set risk manager
    if (sources.riskManager) {
      this.dataSources.riskManager = sources.riskManager;

      // 订阅风控事件 / Subscribe to risk events
      this._subscribeToRiskEvents(sources.riskManager);
    }

    // 设置仓位管理器 / Set position manager
    if (sources.positionManager) {
      this.dataSources.positionManager = sources.positionManager;
    }
  }

  /**
   * 订阅风控管理器事件
   * Subscribe to risk manager events
   *
   * @param {Object} riskManager - 风控管理器 / Risk manager
   * @private
   */
  _subscribeToRiskEvents(riskManager) {
    // 订阅警报事件 / Subscribe to alert event
    riskManager.on('alert', (data) => {
      this.handleRiskAlert(data);
    });

    // 订阅紧急平仓事件 / Subscribe to emergency close event
    riskManager.on('emergencyClose', (data) => {
      this.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.EMERGENCY,
        title: '紧急平仓 / Emergency Close',
        message: data.reason,
        data,
        action: ALERT_ACTION.EMERGENCY_CLOSE,
      });
    });

    // 订阅交易暂停事件 / Subscribe to trading paused event
    riskManager.on('tradingPaused', (data) => {
      this.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.DANGER,
        title: '交易暂停 / Trading Paused',
        message: data.reason,
        data,
        action: ALERT_ACTION.PAUSE_TRADING,
      });
    });

    // 订阅风控触发事件 / Subscribe to risk triggered event
    riskManager.on('riskTriggered', (data) => {
      this.handleRiskTrigger(data);
    });
  }

  /**
   * 启动警报管理器
   * Start alert manager
   */
  start() {
    // 标记为运行中 / Mark as running
    this.running = true;

    // 启动定期清理 / Start periodic cleanup
    this.checkTimer = setInterval(
      () => this._cleanup(),
      60000  // 每分钟清理 / Cleanup every minute
    );

    // 记录日志 / Log
    this.log('警报管理器已启动 / Alert manager started', 'info');

    // 发出启动事件 / Emit start event
    this.emit('started');
  }

  /**
   * 停止警报管理器
   * Stop alert manager
   */
  stop() {
    // 标记为停止 / Mark as stopped
    this.running = false;

    // 清除定时器 / Clear timer
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    // 记录日志 / Log
    this.log('警报管理器已停止 / Alert manager stopped', 'info');

    // 发出停止事件 / Emit stop event
    this.emit('stopped');
  }

  // ============================================
  // 核心警报方法 / Core Alert Methods
  // ============================================

  /**
   * 触发警报 (核心方法)
   * Trigger alert (core method)
   *
   * @param {Object} alertConfig - 警报配置 / Alert configuration
   * @returns {Object|null} 警报对象或 null (如果被抑制) / Alert object or null (if suppressed)
   */
  triggerAlert(alertConfig) {
    // 解构配置 / Destructure config
    const {
      category,                              // 类别 / Category
      level = ALERT_LEVEL.WARNING,           // 级别 / Level
      title,                                 // 标题 / Title
      message,                               // 消息 / Message
      data = {},                             // 数据 / Data
      action = ALERT_ACTION.NOTIFY_ONLY,     // 动作 / Action
      symbol = null,                         // 交易对 / Symbol
      exchange = null,                       // 交易所 / Exchange
    } = alertConfig;

    // 生成警报键 / Generate alert key
    const alertKey = this._generateAlertKey(category, level, symbol, exchange);

    // 检查冷却 / Check cooldown
    if (this._isOnCooldown(alertKey, level)) {
      // 在冷却中，记录抑制 / On cooldown, record suppression
      this.stats.suppressed++;

      // 记录日志 / Log
      if (this.config.verbose) {
        this.log(`警报被抑制 (冷却中): ${alertKey} / Alert suppressed (cooldown)`, 'info');
      }

      return null;
    }

    // 创建警报对象 / Create alert object
    const alert = {
      // 警报 ID / Alert ID
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

      // 警报键 / Alert key
      key: alertKey,

      // 类别 / Category
      category,

      // 级别 / Level
      level,

      // 标题 / Title
      title,

      // 消息 / Message
      message,

      // 数据 / Data
      data,

      // 动作 / Action
      action,

      // 交易对 / Symbol
      symbol,

      // 交易所 / Exchange
      exchange,

      // 时间戳 / Timestamp
      timestamp: Date.now(),

      // 是否已升级 / Whether escalated
      escalated: false,
    };

    // 检查升级 / Check escalation
    const shouldEscalate = this._checkEscalation(alertKey);
    if (shouldEscalate) {
      // 升级警报级别 / Escalate alert level
      alert.level = this._escalateLevel(alert.level);
      alert.escalated = true;
      alert.title = `[升级] ${alert.title} / [Escalated] ${alert.title}`;

      // 更新统计 / Update statistics
      this.stats.escalations++;
    }

    // 更新冷却 / Update cooldown
    this._updateCooldown(alertKey);

    // 记录警报计数 (用于升级检测) / Record alert count (for escalation detection)
    this._recordAlertCount(alertKey);

    // 更新统计 / Update statistics
    this._updateStats(alert);

    // 添加到历史 / Add to history
    this._addToHistory(alert);

    // 添加到活跃警报 / Add to active alerts
    this.activeAlerts.set(alert.id, alert);

    // 发送通知 / Send notifications
    this._sendNotifications(alert);

    // 发出警报事件 / Emit alert event
    this.emit('alert', alert);

    // 记录日志 / Log
    this.log(`警报触发: [${level}] ${title} - ${message} / Alert triggered`, level === ALERT_LEVEL.INFO ? 'info' : 'warn');

    // 返回警报对象 / Return alert object
    return alert;
  }

  /**
   * 处理风控警报
   * Handle risk alert
   *
   * @param {Object} data - 警报数据 / Alert data
   */
  handleRiskAlert(data) {
    // 根据警报类型分发 / Dispatch based on alert type
    switch (data.details?.type) {
      case 'marginRate':
        // 保证金率警报 / Margin rate alert
        this._handleMarginRateAlert(data);
        break;

      case 'dailyDrawdown':
        // 回撤警报 / Drawdown alert
        this._handleDrawdownAlert(data);
        break;

      case 'positionConcentration':
        // 仓位集中度警报 / Position concentration alert
        this._handlePositionConcentrationAlert(data);
        break;

      case 'liquidationRisk':
        // 强平风险警报 / Liquidation risk alert
        this._handleLiquidationAlert(data);
        break;

      default:
        // 通用风控警报 / Generic risk alert
        this.triggerAlert({
          category: ALERT_CATEGORY.RISK,
          level: ALERT_LEVEL.WARNING,
          title: '风控警报 / Risk Alert',
          message: data.message || '风控指标异常',
          data,
        });
    }
  }

  /**
   * 处理风控触发
   * Handle risk trigger
   *
   * @param {Object} data - 触发数据 / Trigger data
   */
  handleRiskTrigger(data) {
    // 确定级别 / Determine level
    let level = ALERT_LEVEL.WARNING;
    if (data.type === 'emergencyClose') {
      level = ALERT_LEVEL.EMERGENCY;
    } else if (data.type === 'pauseTrading') {
      level = ALERT_LEVEL.DANGER;
    } else if (data.type === 'reduceAltcoins') {
      level = ALERT_LEVEL.CRITICAL;
    }

    // 触发警报 / Trigger alert
    this.triggerAlert({
      category: ALERT_CATEGORY.RISK,
      level,
      title: `风控触发: ${data.type}`,
      message: data.reason,
      data: data.details,
    });
  }

  /**
   * 处理保证金率警报
   * Handle margin rate alert
   *
   * @param {Object} data - 警报数据 / Alert data
   * @private
   */
  _handleMarginRateAlert(data) {
    // 获取保证金率 / Get margin rate
    const marginRate = data.details?.marginRate || 0;

    // 确定级别 / Determine level
    let level = ALERT_LEVEL.WARNING;
    if (marginRate < this.config.marginRateThresholds.critical) {
      level = ALERT_LEVEL.CRITICAL;
    } else if (marginRate < this.config.marginRateThresholds.danger) {
      level = ALERT_LEVEL.DANGER;
    }

    // 触发警报 / Trigger alert
    this.triggerAlert({
      category: ALERT_CATEGORY.MARGIN,
      level,
      title: '保证金率警报 / Margin Rate Alert',
      message: `保证金率: ${(marginRate * 100).toFixed(2)}%`,
      data: data.details,
      action: level === ALERT_LEVEL.CRITICAL ? ALERT_ACTION.EMERGENCY_CLOSE : ALERT_ACTION.NOTIFY_ONLY,
    });

    // 发送 Telegram 通知 / Send Telegram notification
    if (this.notifiers.telegram) {
      this.notifiers.telegram.sendMarginRateAlert(
        marginRate,
        data.details?.threshold || this.config.marginRateThresholds.warning,
        data.details
      );
    }
  }

  /**
   * 处理回撤警报
   * Handle drawdown alert
   *
   * @param {Object} data - 警报数据 / Alert data
   * @private
   */
  _handleDrawdownAlert(data) {
    // 获取回撤 / Get drawdown
    const drawdown = data.details?.drawdown || 0;

    // 确定级别 / Determine level
    let level = ALERT_LEVEL.WARNING;
    let action = ALERT_ACTION.NOTIFY_ONLY;

    if (drawdown > this.config.drawdownThresholds.critical) {
      level = ALERT_LEVEL.CRITICAL;
      action = ALERT_ACTION.PAUSE_TRADING;
    } else if (drawdown > this.config.drawdownThresholds.danger) {
      level = ALERT_LEVEL.DANGER;
      action = ALERT_ACTION.PAUSE_TRADING;
    }

    // 触发警报 / Trigger alert
    this.triggerAlert({
      category: ALERT_CATEGORY.DRAWDOWN,
      level,
      title: '回撤警报 / Drawdown Alert',
      message: `当日回撤: ${(drawdown * 100).toFixed(2)}%`,
      data: data.details,
      action,
    });

    // 发送 Telegram 通知 / Send Telegram notification
    if (this.notifiers.telegram) {
      this.notifiers.telegram.sendDrawdownAlert(
        drawdown,
        data.details?.threshold || this.config.drawdownThresholds.warning,
        data.details
      );
    }
  }

  /**
   * 处理仓位集中度警报
   * Handle position concentration alert
   *
   * @param {Object} data - 警报数据 / Alert data
   * @private
   */
  _handlePositionConcentrationAlert(data) {
    // 获取超标币种 / Get exceeded symbols
    const exceededSymbols = data.details?.exceededSymbols || [];

    // 为每个超标币种触发警报 / Trigger alert for each exceeded symbol
    for (const item of exceededSymbols) {
      // 确定级别 / Determine level
      let level = ALERT_LEVEL.WARNING;
      if (item.ratio > this.config.concentrationThresholds.danger) {
        level = ALERT_LEVEL.DANGER;
      }

      // 触发警报 / Trigger alert
      this.triggerAlert({
        category: ALERT_CATEGORY.POSITION,
        level,
        title: '仓位集中度警报 / Position Concentration Alert',
        message: `${item.symbol} 占比: ${(item.ratio * 100).toFixed(2)}%`,
        data: item,
        symbol: item.symbol,
      });
    }
  }

  /**
   * 处理强平风险警报
   * Handle liquidation risk alert
   *
   * @param {Object} data - 警报数据 / Alert data
   * @private
   */
  _handleLiquidationAlert(data) {
    // 获取接近强平的仓位 / Get positions near liquidation
    const nearLiquidation = data.details?.nearLiquidation || [];

    // 为每个仓位触发警报 / Trigger alert for each position
    for (const pos of nearLiquidation) {
      // 触发警报 / Trigger alert
      this.triggerAlert({
        category: ALERT_CATEGORY.POSITION,
        level: ALERT_LEVEL.CRITICAL,
        title: '强平风险警报 / Liquidation Risk Alert',
        message: `${pos.symbol} 距离强平: ${(pos.distance * 100).toFixed(2)}%`,
        data: pos,
        symbol: pos.symbol,
        action: ALERT_ACTION.REDUCE_POSITION,
      });

      // 发送 Telegram 通知 / Send Telegram notification
      if (this.notifiers.telegram) {
        this.notifiers.telegram.sendLiquidationWarning(
          pos.symbol,
          pos.currentPrice,
          pos.liquidationPrice,
          pos.distance
        );
      }
    }
  }

  // ============================================
  // 连接警报方法 / Connection Alert Methods
  // ============================================

  /**
   * 触发连接断开警报
   * Trigger disconnect alert
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} reason - 原因 / Reason
   */
  triggerDisconnectAlert(exchange, reason = '') {
    // 触发警报 / Trigger alert
    this.triggerAlert({
      category: ALERT_CATEGORY.CONNECTION,
      level: ALERT_LEVEL.DANGER,
      title: '连接断开 / Connection Lost',
      message: `${exchange} 连接已断开${reason ? `: ${reason}` : ''}`,
      data: { exchange, reason },
      exchange,
    });

    // 发送 Telegram 通知 / Send Telegram notification
    if (this.notifiers.telegram) {
      this.notifiers.telegram.sendDisconnectAlert(exchange, reason);
    }
  }

  /**
   * 触发连接恢复通知
   * Trigger reconnect notification
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   */
  triggerReconnectNotification(exchange) {
    // 触发警报 / Trigger alert
    this.triggerAlert({
      category: ALERT_CATEGORY.CONNECTION,
      level: ALERT_LEVEL.INFO,
      title: '连接恢复 / Connection Restored',
      message: `${exchange} 连接已恢复`,
      data: { exchange },
      exchange,
    });
  }

  // ============================================
  // 执行警报方法 / Execution Alert Methods
  // ============================================

  /**
   * 触发订单执行失败警报
   * Trigger order execution failed alert
   *
   * @param {Object} orderInfo - 订单信息 / Order info
   * @param {Error} error - 错误 / Error
   */
  triggerOrderFailedAlert(orderInfo, error) {
    // 触发警报 / Trigger alert
    this.triggerAlert({
      category: ALERT_CATEGORY.EXECUTION,
      level: ALERT_LEVEL.WARNING,
      title: '订单执行失败 / Order Execution Failed',
      message: `${orderInfo.symbol} ${orderInfo.side} 失败: ${error.message}`,
      data: { orderInfo, error: error.message },
      symbol: orderInfo.symbol,
      exchange: orderInfo.exchangeId,
    });
  }

  /**
   * 触发紧急平仓完成通知
   * Trigger emergency close completed notification
   *
   * @param {Object} result - 平仓结果 / Close result
   */
  triggerEmergencyCloseCompletedAlert(result) {
    // 触发警报 / Trigger alert
    this.triggerAlert({
      category: ALERT_CATEGORY.RISK,
      level: ALERT_LEVEL.CRITICAL,
      title: '紧急平仓完成 / Emergency Close Completed',
      message: `已平仓 ${result.closedCount || 0} 个仓位`,
      data: result,
    });
  }

  // ============================================
  // 冷却和升级方法 / Cooldown and Escalation Methods
  // ============================================

  /**
   * 生成警报键
   * Generate alert key
   *
   * @param {string} category - 类别 / Category
   * @param {string} level - 级别 / Level
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所 / Exchange
   * @returns {string} 警报键 / Alert key
   * @private
   */
  _generateAlertKey(category, level, symbol, exchange) {
    // 构建键 / Build key
    const parts = [category, level];

    // 添加交易对 / Add symbol
    if (symbol) {
      parts.push(symbol);
    }

    // 添加交易所 / Add exchange
    if (exchange) {
      parts.push(exchange);
    }

    // 返回键 / Return key
    return parts.join(':');
  }

  /**
   * 检查是否在冷却中
   * Check if on cooldown
   *
   * @param {string} alertKey - 警报键 / Alert key
   * @param {string} level - 警报级别 / Alert level
   * @returns {boolean} 是否在冷却 / Whether on cooldown
   * @private
   */
  _isOnCooldown(alertKey, level) {
    // 获取最后触发时间 / Get last triggered time
    const lastTriggered = this.cooldowns.get(alertKey);

    // 如果没有记录，不在冷却 / If no record, not on cooldown
    if (!lastTriggered) {
      return false;
    }

    // 获取冷却时间 / Get cooldown time
    const cooldown = this.config.cooldownByLevel[level] || this.config.defaultCooldown;

    // 检查是否超过冷却时间 / Check if past cooldown time
    return (Date.now() - lastTriggered) < cooldown;
  }

  /**
   * 更新冷却时间
   * Update cooldown
   *
   * @param {string} alertKey - 警报键 / Alert key
   * @private
   */
  _updateCooldown(alertKey) {
    // 更新冷却时间 / Update cooldown time
    this.cooldowns.set(alertKey, Date.now());
  }

  /**
   * 记录警报计数
   * Record alert count
   *
   * @param {string} alertKey - 警报键 / Alert key
   * @private
   */
  _recordAlertCount(alertKey) {
    // 获取或创建计数数组 / Get or create count array
    if (!this.alertCounts.has(alertKey)) {
      this.alertCounts.set(alertKey, []);
    }

    // 获取计数数组 / Get count array
    const counts = this.alertCounts.get(alertKey);

    // 添加当前时间戳 / Add current timestamp
    counts.push({ timestamp: Date.now() });

    // 清理过期记录 / Clean up expired records
    const windowStart = Date.now() - this.config.escalationWindow;
    const filtered = counts.filter(c => c.timestamp >= windowStart);
    this.alertCounts.set(alertKey, filtered);
  }

  /**
   * 检查是否需要升级
   * Check if escalation needed
   *
   * @param {string} alertKey - 警报键 / Alert key
   * @returns {boolean} 是否需要升级 / Whether escalation needed
   * @private
   */
  _checkEscalation(alertKey) {
    // 如果未启用升级 / If escalation not enabled
    if (!this.config.escalationEnabled) {
      return false;
    }

    // 获取计数数组 / Get count array
    const counts = this.alertCounts.get(alertKey) || [];

    // 检查是否达到升级阈值 / Check if reached escalation threshold
    return counts.length >= this.config.escalationTriggerCount;
  }

  /**
   * 升级警报级别
   * Escalate alert level
   *
   * @param {string} currentLevel - 当前级别 / Current level
   * @returns {string} 升级后级别 / Escalated level
   * @private
   */
  _escalateLevel(currentLevel) {
    // 级别顺序 / Level order
    const levelOrder = [
      ALERT_LEVEL.INFO,
      ALERT_LEVEL.WARNING,
      ALERT_LEVEL.DANGER,
      ALERT_LEVEL.CRITICAL,
      ALERT_LEVEL.EMERGENCY,
    ];

    // 获取当前索引 / Get current index
    const currentIndex = levelOrder.indexOf(currentLevel);

    // 如果已经是最高级别，返回当前 / If already highest, return current
    if (currentIndex === -1 || currentIndex >= levelOrder.length - 1) {
      return currentLevel;
    }

    // 返回升级后级别 / Return escalated level
    return levelOrder[currentIndex + 1];
  }

  // ============================================
  // 通知方法 / Notification Methods
  // ============================================

  /**
   * 发送通知
   * Send notifications
   *
   * @param {Object} alert - 警报对象 / Alert object
   * @private
   */
  _sendNotifications(alert) {
    // 发送日志通知 / Send log notification
    if (this.config.loggingEnabled && this.notifiers.pnlLogger) {
      this.notifiers.pnlLogger.logRiskEvent(alert.category, {
        level: alert.level,
        title: alert.title,
        message: alert.message,
        data: alert.data,
      });
    }

    // 发送事件通知 / Send event notification
    if (this.config.eventsEnabled) {
      this.emit('alertTriggered', alert);
    }

    // 如果是紧急级别，立即发送 Telegram / If emergency, send Telegram immediately
    if (alert.level === ALERT_LEVEL.EMERGENCY && this.notifiers.telegram) {
      this.notifiers.telegram.sendAlert(
        alert.category,
        alert.message,
        alert.data
      );
    }

    // 发送邮件通知 / Send email notification
    if (this.config.emailEnabled && this._shouldSendEmail(alert.level)) {
      this._sendEmailNotification(alert);
    }
  }

  /**
   * 判断是否应该发送邮件
   * Check if should send email
   *
   * @param {string} level - 警报级别 / Alert level
   * @returns {boolean} 是否发送 / Whether to send
   * @private
   */
  _shouldSendEmail(level) {
    const levelOrder = [
      ALERT_LEVEL.INFO,
      ALERT_LEVEL.WARNING,
      ALERT_LEVEL.DANGER,
      ALERT_LEVEL.CRITICAL,
      ALERT_LEVEL.EMERGENCY,
    ];

    const currentIndex = levelOrder.indexOf(level);
    const thresholdIndex = levelOrder.indexOf(this.config.emailLevelThreshold);

    return currentIndex >= thresholdIndex;
  }

  /**
   * 初始化邮件发送器
   * Initialize email transporter
   * @private
   */
  _initEmailTransporter() {
    // 检查是否启用邮件 / Check if email enabled
    if (!this.config.emailEnabled) {
      return;
    }

    // 检查必要配置 / Check required configuration
    if (!this.config.smtpHost || !this.config.smtpUser || !this.config.smtpPass) {
      this.log('邮件配置不完整，已禁用邮件通知 / Email config incomplete, disabled', 'warn');
      this.config.emailEnabled = false;
      return;
    }

    try {
      // 创建邮件发送器 / Create email transporter
      this.emailTransporter = nodemailer.createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpPort === 465,
        auth: {
          user: this.config.smtpUser,
          pass: this.config.smtpPass,
        },
      });

      this.log('邮件发送器初始化成功 / Email transporter initialized', 'info');
    } catch (error) {
      this.log(`邮件发送器初始化失败: ${error.message} / Email init failed`, 'error');
      this.config.emailEnabled = false;
    }
  }

  /**
   * 发送邮件通知
   * Send email notification
   *
   * @param {Object} alert - 警报对象 / Alert object
   * @private
   */
  async _sendEmailNotification(alert) {
    if (!this.emailTransporter) {
      return;
    }

    try {
      // 构建邮件内容 / Build email content
      const subject = `[${alert.level.toUpperCase()}] ${alert.title}`;
      const html = this._buildEmailHtml(alert);

      // 发送邮件 / Send email
      await this.emailTransporter.sendMail({
        from: this.config.smtpUser,
        to: this.config.alertEmailTo,
        subject,
        html,
      });

      this.log(`邮件通知已发送: ${alert.title} / Email sent`, 'info');
    } catch (error) {
      this.log(`邮件发送失败: ${error.message} / Email send failed`, 'error');
    }
  }

  /**
   * 构建邮件 HTML
   * Build email HTML
   *
   * @param {Object} alert - 警报对象 / Alert object
   * @returns {string} HTML 内容 / HTML content
   * @private
   */
  _buildEmailHtml(alert) {
    const levelColors = {
      [ALERT_LEVEL.INFO]: '#17a2b8',
      [ALERT_LEVEL.WARNING]: '#ffc107',
      [ALERT_LEVEL.DANGER]: '#fd7e14',
      [ALERT_LEVEL.CRITICAL]: '#dc3545',
      [ALERT_LEVEL.EMERGENCY]: '#ff0000',
    };

    const color = levelColors[alert.level] || '#6c757d';
    const timestamp = new Date(alert.timestamp).toLocaleString('zh-CN');

    return `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <div style="background-color: ${color}; color: white; padding: 15px; border-radius: 5px 5px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">${alert.title}</h2>
        </div>
        <div style="padding: 20px; background-color: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 5px 5px;">
          <p style="margin: 0 0 10px;"><strong>级别 / Level:</strong> ${alert.level.toUpperCase()}</p>
          <p style="margin: 0 0 10px;"><strong>类别 / Category:</strong> ${alert.category}</p>
          <p style="margin: 0 0 10px;"><strong>时间 / Time:</strong> ${timestamp}</p>
          <p style="margin: 0 0 10px;"><strong>消息 / Message:</strong></p>
          <p style="background-color: white; padding: 10px; border-radius: 3px; margin: 0 0 10px; border: 1px solid #dee2e6;">${alert.message}</p>
          ${Object.keys(alert.data || {}).length > 0 ? `
            <p style="margin: 0 0 10px;"><strong>详情 / Details:</strong></p>
            <pre style="background-color: white; padding: 10px; border-radius: 3px; margin: 0; overflow-x: auto; border: 1px solid #dee2e6; font-size: 12px;">${JSON.stringify(alert.data, null, 2)}</pre>
          ` : ''}
        </div>
        <div style="margin-top: 15px; font-size: 12px; color: #6c757d; text-align: center;">
          量化交易系统风控警报 / Quant Trading System Risk Alert
        </div>
      </div>
    `;
  }

  // ============================================
  // 统计和历史方法 / Statistics and History Methods
  // ============================================

  /**
   * 更新统计
   * Update statistics
   *
   * @param {Object} alert - 警报对象 / Alert object
   * @private
   */
  _updateStats(alert) {
    // 更新总数 / Update total
    this.stats.totalAlerts++;

    // 更新级别统计 / Update level statistics
    if (this.stats.byLevel[alert.level] !== undefined) {
      this.stats.byLevel[alert.level]++;
    }

    // 更新类别统计 / Update category statistics
    if (!this.stats.byCategory[alert.category]) {
      this.stats.byCategory[alert.category] = 0;
    }
    this.stats.byCategory[alert.category]++;
  }

  /**
   * 添加到历史
   * Add to history
   *
   * @param {Object} alert - 警报对象 / Alert object
   * @private
   */
  _addToHistory(alert) {
    // 添加到历史 / Add to history
    this.history.push({
      id: alert.id,
      category: alert.category,
      level: alert.level,
      title: alert.title,
      message: alert.message,
      timestamp: alert.timestamp,
      escalated: alert.escalated,
    });

    // 限制历史大小 / Limit history size
    if (this.history.length > this.config.maxHistorySize) {
      this.history = this.history.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * 定期清理
   * Periodic cleanup
   * @private
   */
  _cleanup() {
    // 当前时间 / Current time
    const now = Date.now();

    // 清理过期冷却 / Clean up expired cooldowns
    const maxCooldown = Math.max(...Object.values(this.config.cooldownByLevel));
    for (const [key, timestamp] of this.cooldowns) {
      if (now - timestamp > maxCooldown) {
        this.cooldowns.delete(key);
      }
    }

    // 清理过期警报计数 / Clean up expired alert counts
    const windowStart = now - this.config.escalationWindow;
    for (const [key, counts] of this.alertCounts) {
      const filtered = counts.filter(c => c.timestamp >= windowStart);
      if (filtered.length === 0) {
        this.alertCounts.delete(key);
      } else {
        this.alertCounts.set(key, filtered);
      }
    }

    // 清理过期历史 / Clean up expired history
    const historyStart = now - this.config.historyRetention;
    this.history = this.history.filter(h => h.timestamp >= historyStart);

    // 清理过期活跃警报 / Clean up expired active alerts
    const activeExpiry = now - 3600000;  // 1小时 / 1 hour
    for (const [id, alert] of this.activeAlerts) {
      if (alert.timestamp < activeExpiry) {
        this.activeAlerts.delete(id);
      }
    }
  }

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 获取活跃警报
   * Get active alerts
   *
   * @param {Object} filter - 过滤条件 / Filter conditions
   * @returns {Array} 活跃警报列表 / Active alerts list
   */
  getActiveAlerts(filter = {}) {
    // 转换为数组 / Convert to array
    let alerts = Array.from(this.activeAlerts.values());

    // 按级别过滤 / Filter by level
    if (filter.level) {
      alerts = alerts.filter(a => a.level === filter.level);
    }

    // 按类别过滤 / Filter by category
    if (filter.category) {
      alerts = alerts.filter(a => a.category === filter.category);
    }

    // 按时间排序 (最新优先) / Sort by time (newest first)
    alerts.sort((a, b) => b.timestamp - a.timestamp);

    // 返回结果 / Return result
    return alerts;
  }

  /**
   * 获取警报历史
   * Get alert history
   *
   * @param {Object} filter - 过滤条件 / Filter conditions
   * @returns {Array} 警报历史列表 / Alert history list
   */
  getHistory(filter = {}) {
    // 复制历史 / Copy history
    let history = [...this.history];

    // 按级别过滤 / Filter by level
    if (filter.level) {
      history = history.filter(h => h.level === filter.level);
    }

    // 按类别过滤 / Filter by category
    if (filter.category) {
      history = history.filter(h => h.category === filter.category);
    }

    // 按时间范围过滤 / Filter by time range
    if (filter.since) {
      history = history.filter(h => h.timestamp >= filter.since);
    }

    // 按时间排序 (最新优先) / Sort by time (newest first)
    history.sort((a, b) => b.timestamp - a.timestamp);

    // 限制数量 / Limit count
    if (filter.limit) {
      history = history.slice(0, filter.limit);
    }

    // 返回结果 / Return result
    return history;
  }

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() {
    return {
      // 统计数据 / Statistics
      ...this.stats,

      // 活跃警报数 / Active alerts count
      activeAlertsCount: this.activeAlerts.size,

      // 历史记录数 / History count
      historyCount: this.history.length,

      // 是否运行中 / Whether running
      running: this.running,
    };
  }

  /**
   * 清除指定警报
   * Clear specific alert
   *
   * @param {string} alertId - 警报 ID / Alert ID
   * @returns {boolean} 是否成功 / Whether successful
   */
  clearAlert(alertId) {
    // 从活跃警报中移除 / Remove from active alerts
    return this.activeAlerts.delete(alertId);
  }

  /**
   * 清除所有活跃警报
   * Clear all active alerts
   */
  clearAllAlerts() {
    // 清空活跃警报 / Clear active alerts
    this.activeAlerts.clear();

    // 记录日志 / Log
    this.log('所有活跃警报已清除 / All active alerts cleared', 'info');
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    // 构建完整消息 / Build complete message
    const fullMessage = `${this.config.logPrefix} ${message}`;

    // 根据级别输出 / Output based on level
    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'info':
      default:
        if (this.config.verbose) {
          console.log(fullMessage);
        }
        break;
    }
  }
}

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export {
  ALERT_LEVEL,
  ALERT_CATEGORY,
  ALERT_ACTION,
  DEFAULT_CONFIG,
};

// 默认导出 / Default export
export default AlertManager;
