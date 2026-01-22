/**
 * Telegram 通知器
 * Telegram Notifier
 *
 * 功能 / Features:
 * 1. 每日自动发送绩效报告 / Daily automatic performance report
 * 2. 关键指标报警 (回撤、保证金率、掉线) / Critical alerts (drawdown, margin, disconnect)
 * 3. 交易通知 / Trade notifications
 * 4. 消息限流 / Message rate limiting
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

// 导入 Telegram Bot API / Import Telegram Bot API
import TelegramBot from 'node-telegram-bot-api'; // 导入模块 node-telegram-bot-api

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入加密工具 / Import crypto utilities
import { // 导入依赖
  loadEncryptedKeys, // 执行语句
  getMasterPassword, // 执行语句
  decryptValue, // 执行语句
  isEncrypted, // 执行语句
  hasEncryptedKeys, // 执行语句
} from '../utils/crypto.js'; // 执行语句

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 消息类型
 * Message type
 */
const MESSAGE_TYPE = { // 定义常量 MESSAGE_TYPE
  ALERT: 'alert',             // 警报 / Alert
  TRADE: 'trade',             // 交易 / Trade
  POSITION: 'position',       // 持仓 / Position
  DAILY_REPORT: 'daily',      // 日报 / Daily report
  SYSTEM: 'system',           // 系统 / System
  PERFORMANCE: 'performance', // 绩效 / Performance
}; // 结束代码块

/**
 * 消息优先级
 * Message priority
 */
const MESSAGE_PRIORITY = { // 定义常量 MESSAGE_PRIORITY
  LOW: 0,       // 低优先级 / Low priority
  NORMAL: 1,    // 正常 / Normal
  HIGH: 2,      // 高优先级 / High priority
  URGENT: 3,    // 紧急 / Urgent
  CRITICAL: 4,  // 严重 / Critical
}; // 结束代码块

/**
 * 警报类型
 * Alert type
 */
const ALERT_TYPE = { // 定义常量 ALERT_TYPE
  DRAWDOWN: 'drawdown',           // 回撤警报 / Drawdown alert
  MARGIN_RATE: 'marginRate',      // 保证金率警报 / Margin rate alert
  DISCONNECT: 'disconnect',       // 掉线警报 / Disconnect alert
  EMERGENCY_CLOSE: 'emergency',   // EMERGENCY平仓权限
  POSITION_LIMIT: 'positionLimit', // 仓位限制 / Position limit
  LIQUIDATION: 'liquidation',     // 强平警告 / Liquidation warning
}; // 结束代码块

/**
 * Emoji 映射
 * Emoji mapping
 */
const EMOJI = { // 定义常量 EMOJI
  // 警报相关 / Alert related
  WARNING: '⚠️',        // 警告 / Warning
  DANGER: '🚨',         // 危险 / Danger
  ERROR: '❌',          // 错误 / Error
  SUCCESS: '✅',        // 成功 / Success

  // 交易相关 / Trade related
  BUY: '🟢',            // 买入 / Buy
  SELL: '🔴',           // 卖出 / Sell
  PROFIT: '💰',         // 盈利 / Profit
  LOSS: '📉',           // 亏损 / Loss

  // 状态相关 / Status related
  ONLINE: '🟢',         // 在线 / Online
  OFFLINE: '🔴',        // 离线 / Offline
  CHART: '📊',          // 图表 / Chart
  CLOCK: '⏰',          // 时钟 / Clock
  ROBOT: '🤖',          // 机器人 / Robot
  MONEY: '💵',          // 金钱 / Money

  // 趋势相关 / Trend related
  UP: '📈',             // 上涨 / Up
  DOWN: '📉',           // 下跌 / Down
  FLAT: '➡️',          // 持平 / Flat
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // Telegram 配置 / Telegram Configuration
  // ============================================

  // Telegram Bot Token / Telegram Bot Token
  botToken: process.env.TELEGRAM_BOT_TOKEN || '', // Telegram Bot Token

  // 接收消息的 Chat ID / Chat ID to receive messages
  chatId: process.env.TELEGRAM_CHAT_ID || '', // 接收消息的 Chat ID

  // 是否启用 / Whether enabled
  enabled: true, // 启用

  // ============================================
  // 消息限流配置 / Message Rate Limit Configuration
  // ============================================

  // 每秒最大消息数 / Max messages per second
  maxMessagesPerSecond: 1, // 每秒最大消息数

  // 每分钟最大消息数 / Max messages per minute
  maxMessagesPerMinute: 20, // 每分钟最大消息数

  // 消息队列最大长度 / Max message queue length
  maxQueueLength: 100, // 消息队列最大长度

  // 消息发送间隔 (毫秒) / Message send interval (ms)
  sendInterval: 1000, // 消息发送间隔 (毫秒)

  // ============================================
  // 日报配置 / Daily Report Configuration
  // ============================================

  // 是否启用日报 / Enable daily report
  dailyReportEnabled: true, // 每日Report启用

  // 日报发送时间 (小时) / Daily report send hour (0-23)
  dailyReportHour: 23, // 日报发送时间 (小时)

  // 日报发送时间 (分钟) / Daily report send minute (0-59)
  dailyReportMinute: 59, // 日报发送时间 (分钟)

  // 日报时区偏移 (小时) / Daily report timezone offset (hours)
  timezoneOffset: 8,  // UTC+8 中国时区 / China timezone

  // ============================================
  // 警报配置 / Alert Configuration
  // ============================================

  // 是否启用警报 / Enable alerts
  alertEnabled: true, // 告警启用

  // 相同警报冷却时间 (毫秒) / Same alert cooldown (ms)
  alertCooldown: 300000,  // 5分钟 / 5 minutes

  // 紧急警报冷却时间 (毫秒) / Urgent alert cooldown (ms)
  urgentAlertCooldown: 60000,  // 1分钟 / 1 minute

  // ============================================
  // 交易通知配置 / Trade Notification Configuration
  // ============================================

  // 是否启用交易通知 / Enable trade notifications
  tradeNotifyEnabled: true, // 是否启用交易通知

  // ============================================
  // 消息格式配置 / Message Format Configuration
  // ============================================

  // 是否使用 Markdown / Use Markdown format
  useMarkdown: true, // 是否使用 Markdown

  // 是否静默发送 (无通知音) / Silent send (no notification sound)
  silentMode: false, // 是否静默发送 (无通知音)

  // 消息前缀 / Message prefix
  messagePrefix: '🤖 量化交易系统', // 消息前缀

  // 服务名称 (用于区分不同实例) / Service name (to distinguish different instances)
  // 优先级: SERVICE_NAME > PM2 进程名 > 空
  // Priority: SERVICE_NAME > PM2 process name > empty
  serviceName: process.env.SERVICE_NAME || (process.env.pm_id !== undefined ? process.env.name : ''), // Priority: SERVICE_NAME > PM2 process name > empty

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志

  // 日志前缀 / Log prefix
  logPrefix: '[Telegram]', // 日志前缀
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * Telegram 通知器
 * Telegram Notifier
 */
export class TelegramNotifier extends EventEmitter { // 导出类 TelegramNotifier
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // Telegram Bot 实例 / Telegram Bot instance
    this.bot = null; // 设置 bot

    // 消息队列 / Message queue
    this.messageQueue = []; // 设置 messageQueue

    // 消息发送定时器 / Message send timer
    this.sendTimer = null; // 设置 sendTimer

    // 日报定时器 / Daily report timer
    this.dailyReportTimer = null; // 设置 dailyReportTimer

    // 警报冷却映射 / Alert cooldown map
    // 格式: { alertKey: lastSentTimestamp }
    // Format: { alertKey: lastSentTimestamp }
    this.alertCooldowns = new Map(); // 设置 alertCooldowns

    // 消息统计 / Message statistics
    this.stats = { // 设置 stats
      totalSent: 0,          // 总发送数 / Total sent
      alertsSent: 0,         // 警报发送数 / Alerts sent
      tradesSent: 0,         // 交易通知发送数 / Trades sent
      dailyReportsSent: 0,   // 日报发送数 / Daily reports sent
      failedSent: 0,         // 发送失败数 / Failed count
      queueDropped: 0,       // 队列丢弃数 / Queue dropped
    }; // 结束代码块

    // 数据源引用 (由外部设置) / Data source references (set externally)
    this.dataSources = { // 设置 dataSources
      riskManager: null,      // 风控管理器 / Risk manager
      positionManager: null,  // 仓位管理器 / Position manager
      accountManager: null,   // 账户管理器 / Account manager
      executor: null,         // 订单执行器 / Order executor
    }; // 结束代码块

    // 是否已初始化 / Whether initialized
    this.initialized = false; // 设置 initialized

    // 是否正在运行 / Whether running
    this.running = false; // 设置 running
  } // 结束代码块

  // ============================================
  // 初始化和生命周期 / Initialization and Lifecycle
  // ============================================

  /**
   * 初始化通知器
   * Initialize notifier
   */
  async init() { // 执行语句
    // 如果已经初始化，跳过 / If already initialized, skip
    if (this.initialized) { // 条件判断 this.initialized
      return; // 返回结果
    } // 结束代码块

    // 尝试从加密存储获取凭证 / Try to get credentials from encrypted storage
    await this._loadCredentials(); // 等待异步结果

    // 检查必要配置 / Check required configuration
    if (!this.config.botToken) { // 条件判断 !this.config.botToken
      // Bot Token 未配置 / Bot token not configured
      this.log('Bot Token 未配置，Telegram 通知已禁用 / Bot token not configured, Telegram disabled', 'warn'); // 调用 log
      this.config.enabled = false; // 访问 config
      return; // 返回结果
    } // 结束代码块

    if (!this.config.chatId) { // 条件判断 !this.config.chatId
      // Chat ID 未配置 / Chat ID not configured
      this.log('Chat ID 未配置，Telegram 通知已禁用 / Chat ID not configured, Telegram disabled', 'warn'); // 调用 log
      this.config.enabled = false; // 访问 config
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 创建 Telegram Bot 实例 / Create Telegram Bot instance
      // polling: false 因为我们只发送消息，不接收 / polling: false as we only send, not receive
      this.bot = new TelegramBot(this.config.botToken, { polling: false }); // 设置 bot

      // 测试连接 / Test connection
      const me = await this.bot.getMe(); // 定义常量 me

      // 记录日志 / Log
      this.log(`Bot 已连接: @${me.username} / Bot connected: @${me.username}`, 'info'); // 调用 log

      // 标记为已初始化 / Mark as initialized
      this.initialized = true; // 设置 initialized

      // 发出初始化事件 / Emit init event
      this.emit('initialized', { botUsername: me.username }); // 调用 emit

    } catch (error) { // 执行语句
      // 初始化失败 / Initialization failed
      this.log(`Bot 初始化失败: ${error.message} / Bot init failed`, 'error'); // 调用 log
      this.config.enabled = false; // 访问 config

      // 发出错误事件 / Emit error event
      this.emit('error', { type: 'init', error }); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 从加密存储或环境变量加载凭证
   * Load credentials from encrypted storage or environment variables
   * @private
   */
  async _loadCredentials() { // 执行语句
    const masterPassword = getMasterPassword(); // 定义常量 masterPassword

    // 优先从加密存储加载 / Prefer loading from encrypted storage
    if (masterPassword && hasEncryptedKeys()) { // 条件判断 masterPassword && hasEncryptedKeys()
      try { // 尝试执行
        const keys = loadEncryptedKeys(masterPassword); // 定义常量 keys

        if (keys?.telegram) { // 条件判断 keys?.telegram
          // 使用加密存储的凭证 / Use encrypted credentials
          if (keys.telegram.botToken) { // 条件判断 keys.telegram.botToken
            this.config.botToken = keys.telegram.botToken; // 访问 config
          } // 结束代码块
          if (keys.telegram.chatId) { // 条件判断 keys.telegram.chatId
            this.config.chatId = keys.telegram.chatId; // 访问 config
          } // 结束代码块
          this.log('使用加密存储的 Telegram 凭证 / Using encrypted Telegram credentials', 'info'); // 调用 log
          return; // 返回结果
        } // 结束代码块
      } catch (error) { // 执行语句
        this.log(`加载加密凭证失败: ${error.message} / Failed to load encrypted credentials`, 'warn'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 检查环境变量是否是加密值 / Check if env vars are encrypted values
    if (this.config.botToken && isEncrypted(this.config.botToken)) { // 条件判断 this.config.botToken && isEncrypted(this.conf...
      if (masterPassword) { // 条件判断 masterPassword
        try { // 尝试执行
          this.config.botToken = decryptValue(this.config.botToken, masterPassword); // 访问 config
        } catch (error) { // 执行语句
          this.log(`解密 Bot Token 失败 / Failed to decrypt bot token`, 'error'); // 调用 log
          this.config.botToken = ''; // 访问 config
        } // 结束代码块
      } else { // 执行语句
        this.log('Bot Token 已加密但未提供主密码 / Bot token encrypted but no master password', 'warn'); // 调用 log
        this.config.botToken = ''; // 访问 config
      } // 结束代码块
    } // 结束代码块

    if (this.config.chatId && isEncrypted(this.config.chatId)) { // 条件判断 this.config.chatId && isEncrypted(this.config...
      if (masterPassword) { // 条件判断 masterPassword
        try { // 尝试执行
          this.config.chatId = decryptValue(this.config.chatId, masterPassword); // 访问 config
        } catch (error) { // 执行语句
          this.log(`解密 Chat ID 失败 / Failed to decrypt chat ID`, 'error'); // 调用 log
          this.config.chatId = ''; // 访问 config
        } // 结束代码块
      } else { // 执行语句
        this.log('Chat ID 已加密但未提供主密码 / Chat ID encrypted but no master password', 'warn'); // 调用 log
        this.config.chatId = ''; // 访问 config
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 设置数据源
   * Set data sources
   *
   * @param {Object} sources - 数据源对象 / Data sources object
   */
  setDataSources(sources) { // 调用 setDataSources
    // 设置风控管理器 / Set risk manager
    if (sources.riskManager) { // 条件判断 sources.riskManager
      this.dataSources.riskManager = sources.riskManager; // 访问 dataSources
    } // 结束代码块

    // 设置仓位管理器 / Set position manager
    if (sources.positionManager) { // 条件判断 sources.positionManager
      this.dataSources.positionManager = sources.positionManager; // 访问 dataSources
    } // 结束代码块

    // 设置账户管理器 / Set account manager
    if (sources.accountManager) { // 条件判断 sources.accountManager
      this.dataSources.accountManager = sources.accountManager; // 访问 dataSources
    } // 结束代码块

    // 设置订单执行器 / Set order executor
    if (sources.executor) { // 条件判断 sources.executor
      this.dataSources.executor = sources.executor; // 访问 dataSources
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动通知器
   * Start notifier
   */
  start() { // 调用 start
    // 如果未启用或未初始化，跳过 / If not enabled or not initialized, skip
    if (!this.config.enabled || !this.initialized) { // 条件判断 !this.config.enabled || !this.initialized
      this.log('通知器未启用或未初始化 / Notifier not enabled or not initialized', 'warn'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    // 标记为运行中 / Mark as running
    this.running = true; // 设置 running

    // 启动消息发送定时器 / Start message send timer
    this.sendTimer = setInterval( // 设置 sendTimer
      () => this._processMessageQueue(), // 定义箭头函数
      this.config.sendInterval // 访问 config
    ); // 结束调用或参数

    // 启动日报定时器 / Start daily report timer
    if (this.config.dailyReportEnabled) { // 条件判断 this.config.dailyReportEnabled
      this._scheduleDailyReport(); // 调用 _scheduleDailyReport
    } // 结束代码块

    // 记录日志 / Log
    this.log('通知器已启动 / Notifier started', 'info'); // 调用 log

    // 发送启动通知 / Send startup notification
    this.sendSystemMessage('系统启动 / System started', MESSAGE_PRIORITY.NORMAL); // 调用 sendSystemMessage

    // 发出启动事件 / Emit start event
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止通知器
   * Stop notifier
   */
  stop() { // 调用 stop
    // 标记为停止 / Mark as stopped
    this.running = false; // 设置 running

    // 清除消息发送定时器 / Clear message send timer
    if (this.sendTimer) { // 条件判断 this.sendTimer
      clearInterval(this.sendTimer); // 调用 clearInterval
      this.sendTimer = null; // 设置 sendTimer
    } // 结束代码块

    // 清除日报定时器 / Clear daily report timer
    if (this.dailyReportTimer) { // 条件判断 this.dailyReportTimer
      clearTimeout(this.dailyReportTimer); // 调用 clearTimeout
      this.dailyReportTimer = null; // 设置 dailyReportTimer
    } // 结束代码块

    // 发送停止通知 / Send shutdown notification
    this.sendSystemMessage('系统停止 / System stopped', MESSAGE_PRIORITY.HIGH); // 调用 sendSystemMessage

    // 处理剩余队列 / Process remaining queue
    this._flushQueue(); // 调用 _flushQueue

    // 记录日志 / Log
    this.log('通知器已停止 / Notifier stopped', 'info'); // 调用 log

    // 发出停止事件 / Emit stop event
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 消息发送方法 / Message Sending Methods
  // ============================================

  /**
   * 发送消息 (核心方法)
   * Send message (core method)
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} options - 选项 / Options
   * @returns {Promise<boolean>} 是否成功 / Whether successful
   */
  async sendMessage(message, options = {}) { // 执行语句
    // 如果未启用，跳过 / If not enabled, skip
    if (!this.config.enabled || !this.initialized) { // 条件判断 !this.config.enabled || !this.initialized
      return false; // 返回结果
    } // 结束代码块

    // 解构选项 / Destructure options
    const { // 解构赋值
      priority = MESSAGE_PRIORITY.NORMAL,  // 优先级 / Priority
      type = MESSAGE_TYPE.SYSTEM,           // 类型 / Type
      silent = this.config.silentMode,      // 静默 / Silent
      immediate = false,                     // 立即发送 / Immediate send
    } = options; // 执行语句

    // 构建消息对象 / Build message object
    const messageObj = { // 定义常量 messageObj
      // 消息内容 / Message content
      content: message, // content

      // 优先级 / Priority
      priority, // 执行语句

      // 类型 / Type
      type, // 执行语句

      // 静默模式 / Silent mode
      silent, // 执行语句

      // 创建时间 / Creation time
      createdAt: Date.now(), // createdAt
    }; // 结束代码块

    // 如果是紧急/严重消息或要求立即发送 / If urgent/critical or immediate required
    if (priority >= MESSAGE_PRIORITY.URGENT || immediate) { // 条件判断 priority >= MESSAGE_PRIORITY.URGENT || immediate
      // 直接发送 / Send directly
      return await this._sendMessageDirect(messageObj); // 返回结果
    } // 结束代码块

    // 检查队列长度 / Check queue length
    if (this.messageQueue.length >= this.config.maxQueueLength) { // 条件判断 this.messageQueue.length >= this.config.maxQu...
      // 队列已满，丢弃低优先级消息 / Queue full, drop low priority messages
      this.stats.queueDropped++; // 访问 stats

      // 如果当前消息优先级较高，移除队列中最低优先级的 / If current higher priority, remove lowest
      const lowestIndex = this._findLowestPriorityIndex(); // 定义常量 lowestIndex
      if (lowestIndex !== -1 && this.messageQueue[lowestIndex].priority < priority) { // 条件判断 lowestIndex !== -1 && this.messageQueue[lowes...
        // 移除最低优先级消息 / Remove lowest priority message
        this.messageQueue.splice(lowestIndex, 1); // 访问 messageQueue
      } else { // 执行语句
        // 丢弃当前消息 / Drop current message
        return false; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 添加到队列 / Add to queue
    this.messageQueue.push(messageObj); // 访问 messageQueue

    // 按优先级排序 / Sort by priority
    this.messageQueue.sort((a, b) => b.priority - a.priority); // 访问 messageQueue

    // 返回成功 / Return success
    return true; // 返回结果
  } // 结束代码块

  /**
   * 直接发送消息
   * Send message directly
   *
   * @param {Object} messageObj - 消息对象 / Message object
   * @returns {Promise<boolean>} 是否成功 / Whether successful
   * @private
   */
  async _sendMessageDirect(messageObj) { // 执行语句
    try { // 尝试执行
      // 构建发送选项 / Build send options
      const sendOptions = { // 定义常量 sendOptions
        // 静默模式 / Silent mode
        disable_notification: messageObj.silent, // 静默模式
      }; // 结束代码块

      // 如果使用 Markdown / If using Markdown
      if (this.config.useMarkdown) { // 条件判断 this.config.useMarkdown
        sendOptions.parse_mode = 'Markdown'; // 赋值 sendOptions.parse_mode
      } // 结束代码块

      // 发送消息 / Send message
      await this.bot.sendMessage( // 等待异步结果
        this.config.chatId, // 访问 config
        messageObj.content, // 执行语句
        sendOptions // 执行语句
      ); // 结束调用或参数

      // 更新统计 / Update statistics
      this.stats.totalSent++; // 访问 stats

      // 根据类型更新统计 / Update statistics by type
      switch (messageObj.type) { // 分支选择 messageObj.type
        case MESSAGE_TYPE.ALERT: // 分支 MESSAGE_TYPE.ALERT
          this.stats.alertsSent++; // 访问 stats
          break; // 跳出循环或分支
        case MESSAGE_TYPE.TRADE: // 分支 MESSAGE_TYPE.TRADE
          this.stats.tradesSent++; // 访问 stats
          break; // 跳出循环或分支
        case MESSAGE_TYPE.DAILY_REPORT: // 分支 MESSAGE_TYPE.DAILY_REPORT
          this.stats.dailyReportsSent++; // 访问 stats
          break; // 跳出循环或分支
      } // 结束代码块

      // 发出消息发送事件 / Emit message sent event
      this.emit('messageSent', { type: messageObj.type, priority: messageObj.priority }); // 调用 emit

      // 返回成功 / Return success
      return true; // 返回结果

    } catch (error) { // 执行语句
      // 发送失败 / Send failed
      this.stats.failedSent++; // 访问 stats

      // 记录错误 / Log error
      this.log(`消息发送失败: ${error.message} / Message send failed`, 'error'); // 调用 log

      // 发出错误事件 / Emit error event
      this.emit('error', { type: 'send', error, message: messageObj }); // 调用 emit

      // 返回失败 / Return failure
      return false; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理消息队列
   * Process message queue
   * @private
   */
  async _processMessageQueue() { // 执行语句
    // 如果队列为空或未运行，跳过 / If queue empty or not running, skip
    if (this.messageQueue.length === 0 || !this.running) { // 条件判断 this.messageQueue.length === 0 || !this.running
      return; // 返回结果
    } // 结束代码块

    // 取出队首消息 / Get first message
    const messageObj = this.messageQueue.shift(); // 定义常量 messageObj

    // 发送消息 / Send message
    await this._sendMessageDirect(messageObj); // 等待异步结果
  } // 结束代码块

  /**
   * 刷新队列 (发送所有剩余消息)
   * Flush queue (send all remaining messages)
   * @private
   */
  async _flushQueue() { // 执行语句
    // 发送所有剩余消息 / Send all remaining messages
    while (this.messageQueue.length > 0) { // 循环条件 this.messageQueue.length > 0
      const messageObj = this.messageQueue.shift(); // 定义常量 messageObj
      await this._sendMessageDirect(messageObj); // 等待异步结果

      // 等待一小段时间避免限流 / Wait briefly to avoid rate limit
      await new Promise(resolve => setTimeout(resolve, 100)); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 查找最低优先级消息索引
   * Find lowest priority message index
   *
   * @returns {number} 索引 / Index
   * @private
   */
  _findLowestPriorityIndex() { // 调用 _findLowestPriorityIndex
    // 如果队列为空 / If queue empty
    if (this.messageQueue.length === 0) { // 条件判断 this.messageQueue.length === 0
      return -1; // 返回结果
    } // 结束代码块

    // 查找最低优先级 / Find lowest priority
    let lowestIndex = 0; // 定义变量 lowestIndex
    let lowestPriority = this.messageQueue[0].priority; // 定义变量 lowestPriority

    for (let i = 1; i < this.messageQueue.length; i++) { // 循环 let i = 1; i < this.messageQueue.length; i++
      if (this.messageQueue[i].priority < lowestPriority) { // 条件判断 this.messageQueue[i].priority < lowestPriority
        lowestPriority = this.messageQueue[i].priority; // 赋值 lowestPriority
        lowestIndex = i; // 赋值 lowestIndex
      } // 结束代码块
    } // 结束代码块

    return lowestIndex; // 返回结果
  } // 结束代码块

  // ============================================
  // 警报方法 / Alert Methods
  // ============================================

  /**
   * 发送警报
   * Send alert
   *
   * @param {string} alertType - 警报类型 / Alert type
   * @param {string} message - 消息 / Message
   * @param {Object} data - 数据 / Data
   * @returns {Promise<boolean>} 是否成功 / Whether successful
   */
  async sendAlert(alertType, message, data = {}) { // 执行语句
    // 如果警报未启用 / If alerts not enabled
    if (!this.config.alertEnabled) { // 条件判断 !this.config.alertEnabled
      return false; // 返回结果
    } // 结束代码块

    // 检查冷却 / Check cooldown
    const alertKey = `${alertType}:${data.symbol || 'global'}`; // 定义常量 alertKey
    if (this._isAlertOnCooldown(alertKey, alertType)) { // 条件判断 this._isAlertOnCooldown(alertKey, alertType)
      // 仍在冷却中 / Still on cooldown
      return false; // 返回结果
    } // 结束代码块

    // 确定优先级 / Determine priority
    let priority = MESSAGE_PRIORITY.HIGH; // 定义变量 priority
    if (alertType === ALERT_TYPE.EMERGENCY_CLOSE || alertType === ALERT_TYPE.MARGIN_RATE) { // 条件判断 alertType === ALERT_TYPE.EMERGENCY_CLOSE || a...
      priority = MESSAGE_PRIORITY.CRITICAL; // 赋值 priority
    } else if (alertType === ALERT_TYPE.LIQUIDATION) { // 执行语句
      priority = MESSAGE_PRIORITY.URGENT; // 赋值 priority
    } // 结束代码块

    // 格式化警报消息 / Format alert message
    const formattedMessage = this._formatAlertMessage(alertType, message, data); // 定义常量 formattedMessage

    // 发送消息 / Send message
    const result = await this.sendMessage(formattedMessage, { // 定义常量 result
      type: MESSAGE_TYPE.ALERT, // 类型
      priority, // 执行语句
      immediate: priority >= MESSAGE_PRIORITY.URGENT, // immediate
    }); // 结束代码块

    // 如果发送成功，更新冷却 / If sent, update cooldown
    if (result) { // 条件判断 result
      this._updateAlertCooldown(alertKey); // 调用 _updateAlertCooldown
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 发送回撤警报
   * Send drawdown alert
   *
   * @param {number} drawdown - 回撤比例 / Drawdown ratio
   * @param {number} threshold - 阈值 / Threshold
   * @param {Object} details - 详情 / Details
   */
  async sendDrawdownAlert(drawdown, threshold, details = {}) { // 执行语句
    // 构建消息 / Build message
    const message = `当日回撤: ${(drawdown * 100).toFixed(2)}% (阈值: ${(threshold * 100).toFixed(0)}%)`; // 定义常量 message

    // 发送警报 / Send alert
    await this.sendAlert(ALERT_TYPE.DRAWDOWN, message, { // 等待异步结果
      drawdown, // 执行语句
      threshold, // 执行语句
      ...details, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送保证金率警报
   * Send margin rate alert
   *
   * @param {number} marginRate - 保证金率 / Margin rate
   * @param {number} threshold - 阈值 / Threshold
   * @param {Object} details - 详情 / Details
   */
  async sendMarginRateAlert(marginRate, threshold, details = {}) { // 执行语句
    // 构建消息 / Build message
    const message = `保证金率过低: ${(marginRate * 100).toFixed(2)}% (阈值: ${(threshold * 100).toFixed(0)}%)`; // 定义常量 message

    // 发送警报 / Send alert
    await this.sendAlert(ALERT_TYPE.MARGIN_RATE, message, { // 等待异步结果
      marginRate, // 执行语句
      threshold, // 执行语句
      ...details, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送掉线警报
   * Send disconnect alert
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {string} reason - 原因 / Reason
   */
  async sendDisconnectAlert(exchangeName, reason = '') { // 执行语句
    // 构建消息 / Build message
    const message = `${exchangeName} 连接断开${reason ? `: ${reason}` : ''}`; // 定义常量 message

    // 发送警报 / Send alert
    await this.sendAlert(ALERT_TYPE.DISCONNECT, message, { // 等待异步结果
      exchange: exchangeName, // 交易所
      reason, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送紧急平仓警报
   * Send emergency close alert
   *
   * @param {string} reason - 原因 / Reason
   * @param {Object} details - 详情 / Details
   */
  async sendEmergencyCloseAlert(reason, details = {}) { // 执行语句
    // 构建消息 / Build message
    const message = `触发紧急平仓: ${reason}`; // 定义常量 message

    // 发送警报 / Send alert
    await this.sendAlert(ALERT_TYPE.EMERGENCY_CLOSE, message, { // 等待异步结果
      reason, // 执行语句
      ...details, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送强平预警
   * Send liquidation warning
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} currentPrice - 当前价格 / Current price
   * @param {number} liquidationPrice - 强平价格 / Liquidation price
   * @param {number} distance - 距离百分比 / Distance percentage
   */
  async sendLiquidationWarning(symbol, currentPrice, liquidationPrice, distance) { // 执行语句
    // 构建消息 / Build message
    const message = `${symbol} 接近强平: 当前 ${currentPrice.toFixed(2)} 强平 ${liquidationPrice.toFixed(2)} 距离 ${(distance * 100).toFixed(2)}%`; // 定义常量 message

    // 发送警报 / Send alert
    await this.sendAlert(ALERT_TYPE.LIQUIDATION, message, { // 等待异步结果
      symbol, // 执行语句
      currentPrice, // 执行语句
      liquidationPrice, // 执行语句
      distance, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 检查警报是否在冷却中
   * Check if alert is on cooldown
   *
   * @param {string} alertKey - 警报键 / Alert key
   * @param {string} alertType - 警报类型 / Alert type
   * @returns {boolean} 是否在冷却 / Whether on cooldown
   * @private
   */
  _isAlertOnCooldown(alertKey, alertType) { // 调用 _isAlertOnCooldown
    // 获取最后发送时间 / Get last sent time
    const lastSent = this.alertCooldowns.get(alertKey); // 定义常量 lastSent

    // 如果没有记录，不在冷却 / If no record, not on cooldown
    if (!lastSent) { // 条件判断 !lastSent
      return false; // 返回结果
    } // 结束代码块

    // 确定冷却时间 / Determine cooldown time
    let cooldown = this.config.alertCooldown; // 定义变量 cooldown
    if (alertType === ALERT_TYPE.EMERGENCY_CLOSE || alertType === ALERT_TYPE.MARGIN_RATE) { // 条件判断 alertType === ALERT_TYPE.EMERGENCY_CLOSE || a...
      cooldown = this.config.urgentAlertCooldown; // 赋值 cooldown
    } // 结束代码块

    // 检查是否超过冷却时间 / Check if past cooldown time
    return (Date.now() - lastSent) < cooldown; // 返回结果
  } // 结束代码块

  /**
   * 更新警报冷却时间
   * Update alert cooldown
   *
   * @param {string} alertKey - 警报键 / Alert key
   * @private
   */
  _updateAlertCooldown(alertKey) { // 调用 _updateAlertCooldown
    // 更新冷却时间 / Update cooldown time
    this.alertCooldowns.set(alertKey, Date.now()); // 访问 alertCooldowns
  } // 结束代码块

  /**
   * 格式化警报消息
   * Format alert message
   *
   * @param {string} alertType - 警报类型 / Alert type
   * @param {string} message - 消息 / Message
   * @param {Object} data - 数据 / Data
   * @returns {string} 格式化后的消息 / Formatted message
   * @private
   */
  _formatAlertMessage(alertType, message, data) { // 调用 _formatAlertMessage
    // 选择 emoji / Choose emoji
    let emoji = EMOJI.WARNING; // 定义变量 emoji
    if (alertType === ALERT_TYPE.EMERGENCY_CLOSE || alertType === ALERT_TYPE.MARGIN_RATE) { // 条件判断 alertType === ALERT_TYPE.EMERGENCY_CLOSE || a...
      emoji = EMOJI.DANGER; // 赋值 emoji
    } else if (alertType === ALERT_TYPE.DISCONNECT) { // 执行语句
      emoji = EMOJI.OFFLINE; // 赋值 emoji
    } // 结束代码块

    // 构建标题 (带服务名) / Build title (with service name)
    const header = this._getMessageHeader(); // 定义常量 header
    const title = `${emoji} *风控警报 / Risk Alert*`; // 定义常量 title

    // 构建内容 / Build content
    const lines = [ // 定义常量 lines
      `*${header}*`, // 执行语句
      title, // 执行语句
      '', // 执行语句
      `*类型:* ${alertType}`, // 执行语句
      `*详情:* ${message}`, // 执行语句
      `*时间:* ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`, // 执行语句
    ]; // 结束数组或索引

    // 如果有额外数据 / If extra data
    if (data.exchange) { // 条件判断 data.exchange
      lines.push(`*交易所:* ${data.exchange}`); // 调用 lines.push
    } // 结束代码块
    if (data.symbol) { // 条件判断 data.symbol
      lines.push(`*交易对:* ${data.symbol}`); // 调用 lines.push
    } // 结束代码块

    // 返回格式化消息 / Return formatted message
    return lines.join('\n'); // 返回结果
  } // 结束代码块

  // ============================================
  // 交易通知方法 / Trade Notification Methods
  // ============================================

  /**
   * 发送交易通知
   * Send trade notification
   *
   * @param {Object} trade - 交易数据 / Trade data
   * @param {string} mode - 运行模式 (live/shadow) / Running mode
   */
  async sendTradeNotification(trade, mode = 'unknown') { // 执行语句
    // 如果交易通知未启用 / If trade notifications not enabled
    if (!this.config.tradeNotifyEnabled) { // 条件判断 !this.config.tradeNotifyEnabled
      return; // 返回结果
    } // 结束代码块

    // 格式化交易消息 / Format trade message
    const message = this._formatTradeMessage(trade, mode); // 定义常量 message

    // 发送消息 / Send message
    await this.sendMessage(message, { // 等待异步结果
      type: MESSAGE_TYPE.TRADE, // 类型
      priority: MESSAGE_PRIORITY.NORMAL, // priority
    }); // 结束代码块
  } // 结束代码块

  /**
   * 格式化交易消息
   * Format trade message
   *
   * @param {Object} trade - 交易数据 / Trade data
   * @param {string} mode - 运行模式 / Running mode
   * @returns {string} 格式化后的消息 / Formatted message
   * @private
   */
  _formatTradeMessage(trade, mode = 'unknown') { // 调用 _formatTradeMessage
    // 选择 emoji / Choose emoji
    const sideEmoji = trade.side === 'buy' ? EMOJI.BUY : EMOJI.SELL; // 定义常量 sideEmoji
    const pnlEmoji = (trade.pnl || 0) >= 0 ? EMOJI.PROFIT : EMOJI.LOSS; // 定义常量 pnlEmoji

    // 模式显示 / Mode display
    const modeEmoji = mode === 'live' ? '🔴' : '⚪'; // 定义常量 modeEmoji
    const modeText = mode === 'live' ? '实盘 / Live' : (mode === 'shadow' ? '影子 / Shadow' : mode); // 定义常量 modeText

    // 计算交易金额 / Calculate trade value
    const tradeValue = ((trade.amount || 0) * (trade.price || 0)).toFixed(2); // 定义常量 tradeValue

    // 格式化成交时间 / Format execution time
    const execTime = trade.timestamp ? new Date(trade.timestamp) : new Date(); // 定义常量 execTime
    const timeStr = execTime.toLocaleString('zh-CN', { // 定义常量 timeStr
      year: 'numeric', // 年
      month: '2-digit', // 月
      day: '2-digit', // 天
      hour: '2-digit', // 小时
      minute: '2-digit', // 分钟
      second: '2-digit', // 秒
      hour12: false, // hour12
    }); // 结束代码块

    // 构建标题 (带服务名) / Build title (with service name)
    const header = this._getMessageHeader(); // 定义常量 header
    const title = `${sideEmoji} *交易成交 / Trade Executed*`; // 定义常量 title

    // 构建内容 / Build content
    const lines = [ // 定义常量 lines
      `*${header}*`, // 执行语句
      title, // 执行语句
      '', // 执行语句
      `${modeEmoji} *模式:* ${modeText}`, // 执行语句
      `*币种:* ${trade.symbol}`, // 执行语句
      `*方向:* ${trade.side === 'buy' ? '买入 / Buy' : '卖出 / Sell'}`, // 执行语句
      `*数量:* ${trade.amount}`, // 执行语句
      `*价格:* ${trade.price}`, // 执行语句
      `*交易金额:* ${tradeValue} USDT`, // 执行语句
    ]; // 结束数组或索引

    // 如果有 PnL / If has PnL
    if (trade.pnl !== undefined && trade.pnl !== null) { // 条件判断 trade.pnl !== undefined && trade.pnl !== null
      lines.push(`*盈亏:* ${pnlEmoji} ${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)} USDT`); // 调用 lines.push
    } // 结束代码块

    // 添加成交时间 / Add execution time
    lines.push(`*成交时间:* ${timeStr}`); // 调用 lines.push

    // 返回格式化消息 / Return formatted message
    return lines.join('\n'); // 返回结果
  } // 结束代码块

  // ============================================
  // 日报方法 / Daily Report Methods
  // ============================================

  /**
   * 调度日报发送
   * Schedule daily report
   * @private
   */
  _scheduleDailyReport() { // 调用 _scheduleDailyReport
    // 计算距离下次发送的时间 / Calculate time until next send
    const now = new Date(); // 定义常量 now

    // 目标发送时间 (今天) / Target send time (today)
    const targetTime = new Date( // 定义常量 targetTime
      now.getFullYear(), // 调用 now.getFullYear
      now.getMonth(), // 调用 now.getMonth
      now.getDate(), // 调用 now.getDate
      this.config.dailyReportHour, // 访问 config
      this.config.dailyReportMinute, // 访问 config
      0 // 执行语句
    ); // 结束调用或参数

    // 如果目标时间已过，设为明天 / If target time passed, set to tomorrow
    if (targetTime <= now) { // 条件判断 targetTime <= now
      targetTime.setDate(targetTime.getDate() + 1); // 调用 targetTime.setDate
    } // 结束代码块

    // 计算延迟时间 / Calculate delay
    const delay = targetTime.getTime() - now.getTime(); // 定义常量 delay

    // 记录日志 / Log
    this.log(`日报将在 ${targetTime.toISOString()} 发送 / Daily report scheduled`, 'info'); // 调用 log

    // 设置定时器 / Set timer
    this.dailyReportTimer = setTimeout(async () => { // 设置 dailyReportTimer
      // 发送日报 / Send daily report
      await this._sendDailyReport(); // 等待异步结果

      // 重新调度 / Reschedule
      this._scheduleDailyReport(); // 调用 _scheduleDailyReport
    }, delay); // 执行语句
  } // 结束代码块

  /**
   * 发送每日绩效报告
   * Send daily performance report
   * @private
   */
  async _sendDailyReport() { // 执行语句
    // 收集绩效数据 / Collect performance data
    const reportData = await this._collectReportData(); // 定义常量 reportData

    // 格式化报告 / Format report
    const message = this._formatDailyReport(reportData); // 定义常量 message

    // 发送报告 / Send report
    await this.sendMessage(message, { // 等待异步结果
      type: MESSAGE_TYPE.DAILY_REPORT, // 类型
      priority: MESSAGE_PRIORITY.HIGH, // priority
      immediate: true, // immediate
    }); // 结束代码块

    // 记录日志 / Log
    this.log('每日报告已发送 / Daily report sent', 'info'); // 调用 log
  } // 结束代码块

  /**
   * 手动发送日报
   * Manual send daily report
   */
  async sendDailyReport() { // 执行语句
    await this._sendDailyReport(); // 等待异步结果
  } // 结束代码块

  /**
   * 收集报告数据
   * Collect report data
   *
   * @returns {Object} 报告数据 / Report data
   * @private
   */
  async _collectReportData() { // 执行语句
    // 初始化数据对象 / Initialize data object
    const data = { // 定义常量 data
      // 日期 / Date
      date: new Date().toLocaleDateString('zh-CN'), // date

      // 权益数据 / Equity data
      equity: { // equity
        start: 0,       // 起始权益 / Start equity
        end: 0,         // 结束权益 / End equity
        peak: 0,        // 最高权益 / Peak equity
        change: 0,      // 变化 / Change
        changePercent: 0, // 变化百分比 / Change percentage
      }, // 结束代码块

      // PnL 数据 / PnL data
      pnl: { // 盈亏
        realized: 0,    // 已实现 / Realized
        unrealized: 0,  // 未实现 / Unrealized
        total: 0,       // 总计 / Total
      }, // 结束代码块

      // 交易数据 / Trade data
      trades: { // 成交
        count: 0,       // 交易次数 / Trade count
        wins: 0,        // 盈利次数 / Win count
        losses: 0,      // 亏损次数 / Loss count
        winRate: 0,     // 胜率 / Win rate
      }, // 结束代码块

      // 持仓数据 / Position data
      positions: { // 持仓
        count: 0,       // 持仓数量 / Position count
        long: 0,        // 多头数量 / Long count
        short: 0,       // 空头数量 / Short count
      }, // 结束代码块

      // 风控数据 / Risk data
      risk: { // 风险
        maxDrawdown: 0, // 最大回撤 / Max drawdown
        marginRate: 0,  // 保证金率 / Margin rate
        alerts: 0,      // 警报次数 / Alert count
      }, // 结束代码块
    }; // 结束代码块

    // 从风控管理器获取数据 / Get data from risk manager
    if (this.dataSources.riskManager) { // 条件判断 this.dataSources.riskManager
      try { // 尝试执行
        const status = this.dataSources.riskManager.getStatus(); // 定义常量 status

        // 权益数据 / Equity data
        if (status.dailyEquity) { // 条件判断 status.dailyEquity
          data.equity.start = status.dailyEquity.startEquity || 0; // 赋值 data.equity.start
          data.equity.peak = status.dailyEquity.peakEquity || 0; // 赋值 data.equity.peak
          data.risk.maxDrawdown = status.dailyEquity.currentDrawdown || 0; // 赋值 data.risk.maxDrawdown
        } // 结束代码块

        // 当前权益 / Current equity
        if (status.accounts && status.accounts.length > 0) { // 条件判断 status.accounts && status.accounts.length > 0
          data.equity.end = status.accounts.reduce((sum, acc) => sum + (acc.equity || 0), 0); // 赋值 data.equity.end
          data.risk.marginRate = status.accounts.reduce((sum, acc) => sum + (acc.equity || 0), 0) / // 赋值 data.risk.marginRate
            Math.max(1, status.accounts.reduce((sum, acc) => sum + (acc.usedMargin || 0), 0)); // 调用 Math.max
        } // 结束代码块

        // 计算权益变化 / Calculate equity change
        data.equity.change = data.equity.end - data.equity.start; // 赋值 data.equity.change
        data.equity.changePercent = data.equity.start > 0 // 赋值 data.equity.changePercent
          ? (data.equity.change / data.equity.start) * 100 // 执行语句
          : 0; // 执行语句

        // 警报次数 / Alert count
        data.risk.alerts = (status.recentTriggers || []).length; // 赋值 data.risk.alerts

      } catch (error) { // 执行语句
        this.log(`获取风控数据失败: ${error.message} / Failed to get risk data`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 从仓位管理器获取数据 / Get data from position manager
    if (this.dataSources.positionManager) { // 条件判断 this.dataSources.positionManager
      try { // 尝试执行
        const positions = this.dataSources.positionManager.getActivePositions // 定义常量 positions
          ? this.dataSources.positionManager.getActivePositions() // 执行语句
          : []; // 执行语句

        data.positions.count = positions.length; // 赋值 data.positions.count
        data.positions.long = positions.filter(p => p.side === 'long').length; // 赋值 data.positions.long
        data.positions.short = positions.filter(p => p.side === 'short').length; // 赋值 data.positions.short

        // 计算未实现盈亏 / Calculate unrealized PnL
        data.pnl.unrealized = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0); // 赋值 data.pnl.unrealized

      } catch (error) { // 执行语句
        this.log(`获取持仓数据失败: ${error.message} / Failed to get position data`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 计算总 PnL / Calculate total PnL
    data.pnl.total = data.pnl.realized + data.pnl.unrealized; // 赋值 data.pnl.total

    // 返回数据 / Return data
    return data; // 返回结果
  } // 结束代码块

  /**
   * 格式化每日报告
   * Format daily report
   *
   * @param {Object} data - 报告数据 / Report data
   * @returns {string} 格式化后的报告 / Formatted report
   * @private
   */
  _formatDailyReport(data) { // 调用 _formatDailyReport
    // 选择盈亏 emoji / Choose PnL emoji
    const pnlEmoji = data.equity.change >= 0 ? EMOJI.UP : EMOJI.DOWN; // 定义常量 pnlEmoji
    const profitEmoji = data.pnl.total >= 0 ? EMOJI.PROFIT : EMOJI.LOSS; // 定义常量 profitEmoji

    // 获取带服务名的标题 / Get header with service name
    const header = this._getMessageHeader(); // 定义常量 header

    // 构建报告 / Build report
    const lines = [ // 定义常量 lines
      `*${header}*`, // 执行语句
      `${EMOJI.CHART} *每日绩效报告 / Daily Performance Report*`, // 执行语句
      `📅 ${data.date}`, // 执行语句
      '', // 执行语句
      `━━━━━━━━━━━━━━━━━━━━`, // 执行语句
      `${EMOJI.MONEY} *权益概览 / Equity Overview*`, // 执行语句
      `起始: ${data.equity.start.toFixed(2)} USDT`, // 执行语句
      `当前: ${data.equity.end.toFixed(2)} USDT`, // 执行语句
      `${pnlEmoji} 变化: ${data.equity.change >= 0 ? '+' : ''}${data.equity.change.toFixed(2)} (${data.equity.changePercent >= 0 ? '+' : ''}${data.equity.changePercent.toFixed(2)}%)`, // 执行语句
      `最高: ${data.equity.peak.toFixed(2)} USDT`, // 执行语句
      '', // 执行语句
      `━━━━━━━━━━━━━━━━━━━━`, // 执行语句
      `${profitEmoji} *盈亏统计 / PnL Summary*`, // 执行语句
      `已实现: ${data.pnl.realized >= 0 ? '+' : ''}${data.pnl.realized.toFixed(2)} USDT`, // 执行语句
      `未实现: ${data.pnl.unrealized >= 0 ? '+' : ''}${data.pnl.unrealized.toFixed(2)} USDT`, // 执行语句
      `总计: ${data.pnl.total >= 0 ? '+' : ''}${data.pnl.total.toFixed(2)} USDT`, // 执行语句
      '', // 执行语句
      `━━━━━━━━━━━━━━━━━━━━`, // 执行语句
      `📊 *持仓情况 / Positions*`, // 执行语句
      `总持仓: ${data.positions.count}`, // 执行语句
      `多头: ${data.positions.long} | 空头: ${data.positions.short}`, // 执行语句
      '', // 执行语句
      `━━━━━━━━━━━━━━━━━━━━`, // 执行语句
      `${EMOJI.WARNING} *风控指标 / Risk Metrics*`, // 执行语句
      `最大回撤: ${(data.risk.maxDrawdown * 100).toFixed(2)}%`, // 执行语句
      `保证金率: ${(data.risk.marginRate * 100).toFixed(2)}%`, // 执行语句
      `今日警报: ${data.risk.alerts} 次`, // 执行语句
    ]; // 结束数组或索引

    // 返回格式化报告 / Return formatted report
    return lines.join('\n'); // 返回结果
  } // 结束代码块

  // ============================================
  // 系统消息方法 / System Message Methods
  // ============================================

  /**
   * 发送系统消息
   * Send system message
   *
   * @param {string} message - 消息 / Message
   * @param {number} priority - 优先级 / Priority
   */
  async sendSystemMessage(message, priority = MESSAGE_PRIORITY.NORMAL) { // 执行语句
    // 获取带服务名的标题 / Get header with service name
    const header = this._getMessageHeader(); // 定义常量 header

    // 格式化系统消息 / Format system message
    const formattedMessage = [ // 定义常量 formattedMessage
      `${EMOJI.ROBOT} *${header}*`, // 执行语句
      '', // 执行语句
      message, // 执行语句
      '', // 执行语句
      `_${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}_`, // 执行语句
    ].join('\n'); // 执行语句

    // 发送消息 / Send message
    await this.sendMessage(formattedMessage, { // 等待异步结果
      type: MESSAGE_TYPE.SYSTEM, // 类型
      priority, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      // 统计数据 / Statistics
      ...this.stats, // 展开对象或数组

      // 队列长度 / Queue length
      queueLength: this.messageQueue.length, // 队列Length

      // 是否运行中 / Whether running
      running: this.running, // running

      // 是否已初始化 / Whether initialized
      initialized: this.initialized, // initialized

      // 是否启用 / Whether enabled
      enabled: this.config.enabled, // 启用
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
    // 构建完整消息 / Build complete message
    const fullMessage = `${this.config.logPrefix} ${message}`; // 定义常量 fullMessage

    // 根据级别输出 / Output based on level
    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'info': // 分支 'info'
      default: // 默认
        if (this.config.verbose) { // 条件判断 this.config.verbose
          console.log(fullMessage); // 控制台输出
        } // 结束代码块
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取消息标题 (包含服务名)
   * Get message header (includes service name)
   *
   * @returns {string} 消息标题 / Message header
   * @private
   */
  _getMessageHeader() { // 调用 _getMessageHeader
    // 如果配置了服务名，添加到标题中 / If service name configured, add to header
    if (this.config.serviceName) { // 条件判断 this.config.serviceName
      return `${this.config.messagePrefix} [${this.config.serviceName}]`; // 返回结果
    } // 结束代码块
    return this.config.messagePrefix; // 返回结果
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export { // 导出命名成员
  MESSAGE_TYPE, // 执行语句
  MESSAGE_PRIORITY, // 执行语句
  ALERT_TYPE, // 执行语句
  EMOJI, // 执行语句
  DEFAULT_CONFIG, // 执行语句
}; // 结束代码块

// 默认导出 / Default export
export default TelegramNotifier; // 默认导出
