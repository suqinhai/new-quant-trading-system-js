/**
 * 共享通知服务
 * Shared Notification Service
 *
 * 作为独立进程运行，统一处理所有策略容器的通知请求
 * Runs as an independent process, handles notification requests from all strategy containers
 *
 * 功能 / Features:
 * 1. 通过 Redis Pub/Sub 接收通知请求
 * 2. 统一的 Telegram Bot 连接
 * 3. 消息聚合和限流
 * 4. 支持多种通知渠道 (Telegram, Email 等)
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入 Redis 客户端 / Import Redis client
import Redis from 'ioredis'; // 导入模块 ioredis

// 导入 Telegram Bot API / Import Telegram Bot API
import TelegramBot from 'node-telegram-bot-api'; // 导入模块 node-telegram-bot-api

// 导入加密工具 / Import crypto utilities
import { // 导入依赖
  loadEncryptedKeys, // 执行语句
  getMasterPassword, // 执行语句
  decryptValue, // 执行语句
  isEncrypted, // 执行语句
  hasEncryptedKeys, // 执行语句
} from '../utils/crypto.js'; // 执行语句

/**
 * Redis 键配置
 * Redis key configuration
 */
const REDIS_KEYS = { // 定义常量 REDIS_KEYS
  // 通知请求频道 / Notification request channel
  NOTIFICATION_REQUEST: 'notification:request', // 设置 NOTIFICATION_REQUEST 字段

  // 服务状态 / Service status
  SERVICE_STATUS: 'notification:service:status', // 设置 SERVICE_STATUS 字段
  SERVICE_HEARTBEAT: 'notification:service:heartbeat', // 设置 SERVICE_HEARTBEAT 字段

  // 消息统计 / Message statistics
  MESSAGE_STATS: 'notification:stats', // 设置 MESSAGE_STATS 字段
}; // 结束代码块

/**
 * 消息类型
 * Message types
 */
const MESSAGE_TYPE = { // 定义常量 MESSAGE_TYPE
  ALERT: 'alert', // 设置 ALERT 字段
  TRADE: 'trade', // 设置 TRADE 字段
  POSITION: 'position', // 设置 POSITION 字段
  DAILY_REPORT: 'daily', // 设置 DAILY_REPORT 字段
  SYSTEM: 'system', // 设置 SYSTEM 字段
  PERFORMANCE: 'performance', // 设置 PERFORMANCE 字段
}; // 结束代码块

/**
 * 消息优先级
 * Message priority
 */
const MESSAGE_PRIORITY = { // 定义常量 MESSAGE_PRIORITY
  LOW: 0, // 设置 LOW 字段
  NORMAL: 1, // 设置 NORMAL 字段
  HIGH: 2, // 设置 HIGH 字段
  URGENT: 3, // 设置 URGENT 字段
  CRITICAL: 4, // 设置 CRITICAL 字段
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // Redis 配置 / Redis configuration
  redis: { // 设置 redis 字段
    host: process.env.REDIS_HOST || 'localhost', // 读取环境变量 REDIS_HOST
    port: parseInt(process.env.REDIS_PORT || '6379', 10), // 读取环境变量 REDIS_PORT
    password: process.env.REDIS_PASSWORD || null, // 读取环境变量 REDIS_PASSWORD
    db: parseInt(process.env.REDIS_DB || '0', 10), // 读取环境变量 REDIS_DB
  }, // 结束代码块

  // Telegram 配置 / Telegram configuration
  telegram: { // 设置 telegram 字段
    botToken: process.env.TELEGRAM_BOT_TOKEN || '', // 读取环境变量 TELEGRAM_BOT_TOKEN
    chatId: process.env.TELEGRAM_CHAT_ID || '', // 读取环境变量 TELEGRAM_CHAT_ID
    enabled: process.env.TELEGRAM_ENABLED !== 'false', // 读取环境变量 TELEGRAM_ENABLED
  }, // 结束代码块

  // 限流配置 / Rate limit configuration
  rateLimit: { // 设置 rateLimit 字段
    maxMessagesPerSecond: 1, // 设置 maxMessagesPerSecond 字段
    maxMessagesPerMinute: 20, // 设置 maxMessagesPerMinute 字段
    maxQueueLength: 100, // 设置 maxQueueLength 字段
  }, // 结束代码块

  // 心跳间隔 / Heartbeat interval
  heartbeatInterval: 5000, // 设置 heartbeatInterval 字段

  // 消息聚合间隔 (毫秒) / Message aggregation interval (ms)
  aggregationInterval: 2000, // 设置 aggregationInterval 字段
}; // 结束代码块

/**
 * 共享通知服务类
 * Shared Notification Service Class
 */
export class NotificationService extends EventEmitter { // 导出类 NotificationService
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 合并配置 / Merge configuration
    this.config = { // 设置 config
      redis: { ...DEFAULT_CONFIG.redis, ...config.redis }, // 设置 redis 字段
      telegram: { ...DEFAULT_CONFIG.telegram, ...config.telegram }, // 设置 telegram 字段
      rateLimit: { ...DEFAULT_CONFIG.rateLimit, ...config.rateLimit }, // 设置 rateLimit 字段
      heartbeatInterval: config.heartbeatInterval || DEFAULT_CONFIG.heartbeatInterval, // 设置 heartbeatInterval 字段
      aggregationInterval: config.aggregationInterval || DEFAULT_CONFIG.aggregationInterval, // 设置 aggregationInterval 字段
    }; // 结束代码块

    // Redis 客户端 / Redis clients
    this.redis = null; // 设置 redis
    this.redisSub = null; // 设置 redisSub

    // Telegram Bot 实例 / Telegram Bot instance
    this.telegramBot = null; // 设置 telegramBot

    // 消息队列 / Message queue
    this.messageQueue = []; // 设置 messageQueue

    // 限流计数器 / Rate limit counters
    this.rateLimitCounters = { // 设置 rateLimitCounters
      second: 0, // 设置 second 字段
      minute: 0, // 设置 minute 字段
      lastSecond: Date.now(), // 设置 lastSecond 字段
      lastMinute: Date.now(), // 设置 lastMinute 字段
    }; // 结束代码块

    // 定时器 / Timers
    this.heartbeatTimer = null; // 设置 heartbeatTimer
    this.queueProcessTimer = null; // 设置 queueProcessTimer

    // 运行状态 / Running status
    this.running = false; // 设置 running

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      startTime: null, // 设置 startTime 字段
      messagesSent: 0, // 设置 messagesSent 字段
      messagesDropped: 0, // 设置 messagesDropped 字段
      errors: 0, // 设置 errors 字段
      byType: {}, // 设置 byType 字段
      bySource: {}, // 设置 bySource 字段
    }; // 结束代码块

    // 日志前缀 / Log prefix
    this.logPrefix = '[NotificationService]'; // 设置 logPrefix
  } // 结束代码块

  /**
   * 启动服务
   * Start service
   *
   * @returns {Promise<void>}
   */
  async start() { // 执行语句
    if (this.running) { // 条件判断 this.running
      console.warn(`${this.logPrefix} 服务已在运行 / Service is already running`); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    console.log(`${this.logPrefix} 正在启动通知服务... / Starting notification service...`); // 控制台输出

    try { // 尝试执行
      // 1. 初始化 Redis 连接 / Initialize Redis connection
      await this._initRedis(); // 等待异步结果

      // 2. 初始化 Telegram Bot / Initialize Telegram Bot
      await this._initTelegram(); // 等待异步结果

      // 3. 启动消息监听 / Start message listener
      await this._startMessageListener(); // 等待异步结果

      // 4. 启动消息队列处理 / Start queue processor
      this._startQueueProcessor(); // 调用 _startQueueProcessor

      // 5. 启动心跳 / Start heartbeat
      this._startHeartbeat(); // 调用 _startHeartbeat

      // 更新状态 / Update status
      this.running = true; // 设置 running
      this.stats.startTime = Date.now(); // 访问 stats

      // 发布服务状态 / Publish service status
      await this._publishServiceStatus('running'); // 等待异步结果

      // 发送启动通知 / Send startup notification
      await this._sendSystemMessage('🤖 通知服务已启动 / Notification service started'); // 等待异步结果

      console.log(`${this.logPrefix} 通知服务已启动 / Notification service started`); // 控制台输出
      this.emit('started'); // 调用 emit

    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 启动失败 / Start failed:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 停止服务
   * Stop service
   *
   * @returns {Promise<void>}
   */
  async stop() { // 执行语句
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    console.log(`${this.logPrefix} 正在停止服务... / Stopping service...`); // 控制台输出

    try { // 尝试执行
      // 发送停止通知 / Send stop notification
      await this._sendSystemMessage('🔴 通知服务已停止 / Notification service stopped'); // 等待异步结果

      // 停止定时器 / Stop timers
      if (this.heartbeatTimer) { // 条件判断 this.heartbeatTimer
        clearInterval(this.heartbeatTimer); // 调用 clearInterval
        this.heartbeatTimer = null; // 设置 heartbeatTimer
      } // 结束代码块

      if (this.queueProcessTimer) { // 条件判断 this.queueProcessTimer
        clearInterval(this.queueProcessTimer); // 调用 clearInterval
        this.queueProcessTimer = null; // 设置 queueProcessTimer
      } // 结束代码块

      // 发布停止状态 / Publish stop status
      await this._publishServiceStatus('stopped'); // 等待异步结果

      // 关闭 Redis 连接 / Close Redis connections
      if (this.redisSub) { // 条件判断 this.redisSub
        this.redisSub.disconnect(); // 访问 redisSub
      } // 结束代码块
      if (this.redis) { // 条件判断 this.redis
        this.redis.disconnect(); // 访问 redis
      } // 结束代码块

      this.running = false; // 设置 running
      console.log(`${this.logPrefix} 服务已停止 / Service stopped`); // 控制台输出
      this.emit('stopped'); // 调用 emit

    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 停止服务时出错 / Error stopping service:`, error.message); // 控制台输出
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取服务状态
   * Get service status
   *
   * @returns {Object} 服务状态 / Service status
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      running: this.running, // 设置 running 字段
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0, // 设置 uptime 字段
      stats: this.stats, // 设置 stats 字段
      queueLength: this.messageQueue.length, // 设置 queueLength 字段
      telegramEnabled: this.config.telegram.enabled, // 设置 telegramEnabled 字段
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 初始化 Redis 连接
   * Initialize Redis connection
   *
   * @private
   */
  async _initRedis() { // 执行语句
    console.log(`${this.logPrefix} 正在连接 Redis... / Connecting to Redis...`); // 控制台输出

    const redisConfig = { // 定义常量 redisConfig
      host: this.config.redis.host, // 设置 host 字段
      port: this.config.redis.port, // 设置 port 字段
      password: this.config.redis.password, // 设置 password 字段
      db: this.config.redis.db, // 设置 db 字段
      retryStrategy: (times) => Math.min(times * 100, 3000), // 设置 retryStrategy 字段
    }; // 结束代码块

    // 主连接 / Main connection
    this.redis = new Redis(redisConfig); // 设置 redis

    // 订阅连接 / Subscribe connection
    this.redisSub = new Redis(redisConfig); // 设置 redisSub

    // 等待连接 / Wait for connection
    await Promise.all([ // 等待异步结果
      new Promise((resolve, reject) => { // 创建 Promise 实例
        this.redis.once('ready', resolve); // 访问 redis
        this.redis.once('error', reject); // 访问 redis
      }), // 结束代码块
      new Promise((resolve, reject) => { // 创建 Promise 实例
        this.redisSub.once('ready', resolve); // 访问 redisSub
        this.redisSub.once('error', reject); // 访问 redisSub
      }), // 结束代码块
    ]); // 结束数组或索引

    console.log(`${this.logPrefix} Redis 连接成功 / Redis connected`); // 控制台输出
  } // 结束代码块

  /**
   * 初始化 Telegram Bot
   * Initialize Telegram Bot
   *
   * @private
   */
  async _initTelegram() { // 执行语句
    if (!this.config.telegram.enabled) { // 条件判断 !this.config.telegram.enabled
      console.log(`${this.logPrefix} Telegram 已禁用 / Telegram disabled`); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    let botToken = this.config.telegram.botToken; // 定义变量 botToken

    // 尝试从加密文件加载 / Try to load from encrypted file
    if (!botToken && hasEncryptedKeys()) { // 条件判断 !botToken && hasEncryptedKeys()
      try { // 尝试执行
        const masterPassword = getMasterPassword(); // 定义常量 masterPassword
        if (masterPassword) { // 条件判断 masterPassword
          const keys = await loadEncryptedKeys(masterPassword); // 定义常量 keys
          if (keys?.TELEGRAM_BOT_TOKEN) { // 条件判断 keys?.TELEGRAM_BOT_TOKEN
            botToken = isEncrypted(keys.TELEGRAM_BOT_TOKEN) // 赋值 botToken
              ? decryptValue(keys.TELEGRAM_BOT_TOKEN, masterPassword) // 执行语句
              : keys.TELEGRAM_BOT_TOKEN; // 执行语句
          } // 结束代码块
        } // 结束代码块
      } catch (error) { // 执行语句
        console.warn(`${this.logPrefix} 无法加载加密的 Telegram Token / Cannot load encrypted Telegram token`); // 控制台输出
      } // 结束代码块
    } // 结束代码块

    if (!botToken) { // 条件判断 !botToken
      console.warn(`${this.logPrefix} 未配置 Telegram Bot Token / Telegram Bot Token not configured`); // 控制台输出
      this.config.telegram.enabled = false; // 访问 config
      return; // 返回结果
    } // 结束代码块

    console.log(`${this.logPrefix} 正在初始化 Telegram Bot... / Initializing Telegram Bot...`); // 控制台输出

    this.telegramBot = new TelegramBot(botToken, { polling: false }); // 设置 telegramBot

    // 验证 Bot / Verify Bot
    try { // 尝试执行
      const me = await this.telegramBot.getMe(); // 定义常量 me
      console.log(`${this.logPrefix} Telegram Bot 已连接: @${me.username} / Telegram Bot connected: @${me.username}`); // 控制台输出
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} Telegram Bot 连接失败 / Telegram Bot connection failed:`, error.message); // 控制台输出
      this.config.telegram.enabled = false; // 访问 config
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动消息监听
   * Start message listener
   *
   * @private
   */
  async _startMessageListener() { // 执行语句
    // 订阅通知请求频道 / Subscribe to notification request channel
    await this.redisSub.subscribe(REDIS_KEYS.NOTIFICATION_REQUEST); // 等待异步结果

    this.redisSub.on('message', async (channel, message) => { // 访问 redisSub
      if (channel !== REDIS_KEYS.NOTIFICATION_REQUEST) return; // 条件判断 channel !== REDIS_KEYS.NOTIFICATION_REQUEST

      try { // 尝试执行
        const request = JSON.parse(message); // 定义常量 request
        await this._handleNotificationRequest(request); // 等待异步结果
      } catch (error) { // 执行语句
        console.error(`${this.logPrefix} 处理通知请求失败 / Failed to handle notification request:`, error.message); // 控制台输出
        this.stats.errors++; // 访问 stats
      } // 结束代码块
    }); // 结束代码块

    console.log(`${this.logPrefix} 消息监听已启动 / Message listener started`); // 控制台输出
  } // 结束代码块

  /**
   * 处理通知请求
   * Handle notification request
   *
   * @param {Object} request - 通知请求 / Notification request
   * @private
   */
  async _handleNotificationRequest(request) { // 执行语句
    const { type, message, priority = MESSAGE_PRIORITY.NORMAL, source, data } = request; // 解构赋值

    // 更新统计 / Update stats
    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1; // 访问 stats
    if (source) { // 条件判断 source
      this.stats.bySource[source] = (this.stats.bySource[source] || 0) + 1; // 访问 stats
    } // 结束代码块

    // 检查队列长度 / Check queue length
    if (this.messageQueue.length >= this.config.rateLimit.maxQueueLength) { // 条件判断 this.messageQueue.length >= this.config.rateL...
      console.warn(`${this.logPrefix} 消息队列已满，丢弃消息 / Message queue full, dropping message`); // 控制台输出
      this.stats.messagesDropped++; // 访问 stats
      return; // 返回结果
    } // 结束代码块

    // 格式化消息 / Format message
    const formattedMessage = this._formatMessage(request); // 定义常量 formattedMessage

    // 添加到队列 / Add to queue
    this.messageQueue.push({ // 访问 messageQueue
      message: formattedMessage, // 设置 message 字段
      priority, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
      source, // 执行语句
    }); // 结束代码块

    // 按优先级排序 / Sort by priority
    this.messageQueue.sort((a, b) => b.priority - a.priority); // 访问 messageQueue
  } // 结束代码块

  /**
   * 格式化消息
   * Format message
   *
   * @param {Object} request - 通知请求 / Notification request
   * @returns {string} 格式化后的消息 / Formatted message
   * @private
   */
  _formatMessage(request) { // 调用 _formatMessage
    const { type, message, source, data } = request; // 解构赋值

    let prefix = ''; // 定义变量 prefix
    switch (type) { // 分支选择 type
      case MESSAGE_TYPE.ALERT: // 分支 MESSAGE_TYPE.ALERT
        prefix = '🚨'; // 赋值 prefix
        break; // 跳出循环或分支
      case MESSAGE_TYPE.TRADE: // 分支 MESSAGE_TYPE.TRADE
        prefix = '💹'; // 赋值 prefix
        break; // 跳出循环或分支
      case MESSAGE_TYPE.POSITION: // 分支 MESSAGE_TYPE.POSITION
        prefix = '📊'; // 赋值 prefix
        break; // 跳出循环或分支
      case MESSAGE_TYPE.DAILY_REPORT: // 分支 MESSAGE_TYPE.DAILY_REPORT
        prefix = '📋'; // 赋值 prefix
        break; // 跳出循环或分支
      case MESSAGE_TYPE.SYSTEM: // 分支 MESSAGE_TYPE.SYSTEM
        prefix = '🤖'; // 赋值 prefix
        break; // 跳出循环或分支
      case MESSAGE_TYPE.PERFORMANCE: // 分支 MESSAGE_TYPE.PERFORMANCE
        prefix = '📈'; // 赋值 prefix
        break; // 跳出循环或分支
      default: // 默认分支
        prefix = '📢'; // 赋值 prefix
    } // 结束代码块

    // 添加来源标识 / Add source identifier
    const sourceTag = source ? `[${source}] ` : ''; // 定义常量 sourceTag

    return `${prefix} ${sourceTag}${message}`; // 返回结果
  } // 结束代码块

  /**
   * 启动队列处理器
   * Start queue processor
   *
   * @private
   */
  _startQueueProcessor() { // 调用 _startQueueProcessor
    this.queueProcessTimer = setInterval(async () => { // 设置 queueProcessTimer
      await this._processQueue(); // 等待异步结果
    }, 1000); // 每秒处理一次 / Process every second
  } // 结束代码块

  /**
   * 处理消息队列
   * Process message queue
   *
   * @private
   */
  async _processQueue() { // 执行语句
    if (this.messageQueue.length === 0) { // 条件判断 this.messageQueue.length === 0
      return; // 返回结果
    } // 结束代码块

    // 重置限流计数器 / Reset rate limit counters
    const now = Date.now(); // 定义常量 now
    if (now - this.rateLimitCounters.lastSecond >= 1000) { // 条件判断 now - this.rateLimitCounters.lastSecond >= 1000
      this.rateLimitCounters.second = 0; // 访问 rateLimitCounters
      this.rateLimitCounters.lastSecond = now; // 访问 rateLimitCounters
    } // 结束代码块
    if (now - this.rateLimitCounters.lastMinute >= 60000) { // 条件判断 now - this.rateLimitCounters.lastMinute >= 60000
      this.rateLimitCounters.minute = 0; // 访问 rateLimitCounters
      this.rateLimitCounters.lastMinute = now; // 访问 rateLimitCounters
    } // 结束代码块

    // 检查限流 / Check rate limit
    if (this.rateLimitCounters.second >= this.config.rateLimit.maxMessagesPerSecond) { // 条件判断 this.rateLimitCounters.second >= this.config....
      return; // 返回结果
    } // 结束代码块
    if (this.rateLimitCounters.minute >= this.config.rateLimit.maxMessagesPerMinute) { // 条件判断 this.rateLimitCounters.minute >= this.config....
      return; // 返回结果
    } // 结束代码块

    // 取出消息 / Dequeue message
    const item = this.messageQueue.shift(); // 定义常量 item
    if (!item) return; // 条件判断 !item

    // 发送消息 / Send message
    try { // 尝试执行
      await this._sendTelegramMessage(item.message); // 等待异步结果
      this.stats.messagesSent++; // 访问 stats
      this.rateLimitCounters.second++; // 访问 rateLimitCounters
      this.rateLimitCounters.minute++; // 访问 rateLimitCounters
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 发送消息失败 / Failed to send message:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 发送 Telegram 消息
   * Send Telegram message
   *
   * @param {string} message - 消息内容 / Message content
   * @private
   */
  async _sendTelegramMessage(message) { // 执行语句
    if (!this.config.telegram.enabled || !this.telegramBot) { // 条件判断 !this.config.telegram.enabled || !this.telegr...
      return; // 返回结果
    } // 结束代码块

    const chatId = this.config.telegram.chatId; // 定义常量 chatId
    if (!chatId) { // 条件判断 !chatId
      console.warn(`${this.logPrefix} 未配置 Chat ID / Chat ID not configured`); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    await this.telegramBot.sendMessage(chatId, message, { // 等待异步结果
      parse_mode: 'HTML', // 设置 parse_mode 字段
      disable_web_page_preview: true, // 设置 disable_web_page_preview 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送系统消息 (直接发送，不走队列)
   * Send system message (direct send, bypass queue)
   *
   * @param {string} message - 消息内容 / Message content
   * @private
   */
  async _sendSystemMessage(message) { // 执行语句
    try { // 尝试执行
      await this._sendTelegramMessage(message); // 等待异步结果
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 发送系统消息失败 / Failed to send system message:`, error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动心跳
   * Start heartbeat
   *
   * @private
   */
  _startHeartbeat() { // 调用 _startHeartbeat
    this.heartbeatTimer = setInterval(async () => { // 设置 heartbeatTimer
      try { // 尝试执行
        const status = this.getStatus(); // 定义常量 status
        await this.redis.set( // 等待异步结果
          REDIS_KEYS.SERVICE_HEARTBEAT, // 执行语句
          JSON.stringify({ // 调用 JSON.stringify
            timestamp: Date.now(), // 设置 timestamp 字段
            status: 'alive', // 设置 status 字段
            uptime: status.uptime, // 设置 uptime 字段
            stats: status.stats, // 设置 stats 字段
            queueLength: status.queueLength, // 设置 queueLength 字段
          }), // 结束代码块
          'EX', // 执行语句
          30 // 执行语句
        ); // 结束调用或参数
      } catch (error) { // 执行语句
        console.error(`${this.logPrefix} 心跳更新失败 / Heartbeat update failed:`, error.message); // 控制台输出
      } // 结束代码块
    }, this.config.heartbeatInterval); // 执行语句
  } // 结束代码块

  /**
   * 发布服务状态
   * Publish service status
   *
   * @param {string} status - 状态 / Status
   * @private
   */
  async _publishServiceStatus(status) { // 执行语句
    try { // 尝试执行
      await this.redis.set( // 等待异步结果
        REDIS_KEYS.SERVICE_STATUS, // 执行语句
        JSON.stringify({ // 调用 JSON.stringify
          status, // 执行语句
          timestamp: Date.now(), // 设置 timestamp 字段
          pid: process.pid, // 设置 pid 字段
        }), // 结束代码块
        'EX', // 执行语句
        60 // 执行语句
      ); // 结束调用或参数
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 发布服务状态失败 / Failed to publish service status:`, error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出创建函数 / Export creation function
export function createNotificationService(config) { // 导出函数 createNotificationService
  return new NotificationService(config); // 返回结果
} // 结束代码块

export default NotificationService; // 默认导出
