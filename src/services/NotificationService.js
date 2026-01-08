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
import EventEmitter from 'eventemitter3';

// 导入 Redis 客户端 / Import Redis client
import Redis from 'ioredis';

// 导入 Telegram Bot API / Import Telegram Bot API
import TelegramBot from 'node-telegram-bot-api';

// 导入加密工具 / Import crypto utilities
import {
  loadEncryptedKeys,
  getMasterPassword,
  decryptValue,
  isEncrypted,
  hasEncryptedKeys,
} from '../utils/crypto.js';

/**
 * Redis 键配置
 * Redis key configuration
 */
const REDIS_KEYS = {
  // 通知请求频道 / Notification request channel
  NOTIFICATION_REQUEST: 'notification:request',

  // 服务状态 / Service status
  SERVICE_STATUS: 'notification:service:status',
  SERVICE_HEARTBEAT: 'notification:service:heartbeat',

  // 消息统计 / Message statistics
  MESSAGE_STATS: 'notification:stats',
};

/**
 * 消息类型
 * Message types
 */
const MESSAGE_TYPE = {
  ALERT: 'alert',
  TRADE: 'trade',
  POSITION: 'position',
  DAILY_REPORT: 'daily',
  SYSTEM: 'system',
  PERFORMANCE: 'performance',
};

/**
 * 消息优先级
 * Message priority
 */
const MESSAGE_PRIORITY = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  URGENT: 3,
  CRITICAL: 4,
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // Redis 配置 / Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || null,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  // Telegram 配置 / Telegram configuration
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: process.env.TELEGRAM_ENABLED !== 'false',
  },

  // 限流配置 / Rate limit configuration
  rateLimit: {
    maxMessagesPerSecond: 1,
    maxMessagesPerMinute: 20,
    maxQueueLength: 100,
  },

  // 心跳间隔 / Heartbeat interval
  heartbeatInterval: 5000,

  // 消息聚合间隔 (毫秒) / Message aggregation interval (ms)
  aggregationInterval: 2000,
};

/**
 * 共享通知服务类
 * Shared Notification Service Class
 */
export class NotificationService extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    super();

    // 合并配置 / Merge configuration
    this.config = {
      redis: { ...DEFAULT_CONFIG.redis, ...config.redis },
      telegram: { ...DEFAULT_CONFIG.telegram, ...config.telegram },
      rateLimit: { ...DEFAULT_CONFIG.rateLimit, ...config.rateLimit },
      heartbeatInterval: config.heartbeatInterval || DEFAULT_CONFIG.heartbeatInterval,
      aggregationInterval: config.aggregationInterval || DEFAULT_CONFIG.aggregationInterval,
    };

    // Redis 客户端 / Redis clients
    this.redis = null;
    this.redisSub = null;

    // Telegram Bot 实例 / Telegram Bot instance
    this.telegramBot = null;

    // 消息队列 / Message queue
    this.messageQueue = [];

    // 限流计数器 / Rate limit counters
    this.rateLimitCounters = {
      second: 0,
      minute: 0,
      lastSecond: Date.now(),
      lastMinute: Date.now(),
    };

    // 定时器 / Timers
    this.heartbeatTimer = null;
    this.queueProcessTimer = null;

    // 运行状态 / Running status
    this.running = false;

    // 统计信息 / Statistics
    this.stats = {
      startTime: null,
      messagesSent: 0,
      messagesDropped: 0,
      errors: 0,
      byType: {},
      bySource: {},
    };

    // 日志前缀 / Log prefix
    this.logPrefix = '[NotificationService]';
  }

  /**
   * 启动服务
   * Start service
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.running) {
      console.warn(`${this.logPrefix} 服务已在运行 / Service is already running`);
      return;
    }

    console.log(`${this.logPrefix} 正在启动通知服务... / Starting notification service...`);

    try {
      // 1. 初始化 Redis 连接 / Initialize Redis connection
      await this._initRedis();

      // 2. 初始化 Telegram Bot / Initialize Telegram Bot
      await this._initTelegram();

      // 3. 启动消息监听 / Start message listener
      await this._startMessageListener();

      // 4. 启动消息队列处理 / Start queue processor
      this._startQueueProcessor();

      // 5. 启动心跳 / Start heartbeat
      this._startHeartbeat();

      // 更新状态 / Update status
      this.running = true;
      this.stats.startTime = Date.now();

      // 发布服务状态 / Publish service status
      await this._publishServiceStatus('running');

      // 发送启动通知 / Send startup notification
      await this._sendSystemMessage('🤖 通知服务已启动 / Notification service started');

      console.log(`${this.logPrefix} 通知服务已启动 / Notification service started`);
      this.emit('started');

    } catch (error) {
      console.error(`${this.logPrefix} 启动失败 / Start failed:`, error.message);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * 停止服务
   * Stop service
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.running) {
      return;
    }

    console.log(`${this.logPrefix} 正在停止服务... / Stopping service...`);

    try {
      // 发送停止通知 / Send stop notification
      await this._sendSystemMessage('🔴 通知服务已停止 / Notification service stopped');

      // 停止定时器 / Stop timers
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      if (this.queueProcessTimer) {
        clearInterval(this.queueProcessTimer);
        this.queueProcessTimer = null;
      }

      // 发布停止状态 / Publish stop status
      await this._publishServiceStatus('stopped');

      // 关闭 Redis 连接 / Close Redis connections
      if (this.redisSub) {
        this.redisSub.disconnect();
      }
      if (this.redis) {
        this.redis.disconnect();
      }

      this.running = false;
      console.log(`${this.logPrefix} 服务已停止 / Service stopped`);
      this.emit('stopped');

    } catch (error) {
      console.error(`${this.logPrefix} 停止服务时出错 / Error stopping service:`, error.message);
      throw error;
    }
  }

  /**
   * 获取服务状态
   * Get service status
   *
   * @returns {Object} 服务状态 / Service status
   */
  getStatus() {
    return {
      running: this.running,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      stats: this.stats,
      queueLength: this.messageQueue.length,
      telegramEnabled: this.config.telegram.enabled,
    };
  }

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 初始化 Redis 连接
   * Initialize Redis connection
   *
   * @private
   */
  async _initRedis() {
    console.log(`${this.logPrefix} 正在连接 Redis... / Connecting to Redis...`);

    const redisConfig = {
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    };

    // 主连接 / Main connection
    this.redis = new Redis(redisConfig);

    // 订阅连接 / Subscribe connection
    this.redisSub = new Redis(redisConfig);

    // 等待连接 / Wait for connection
    await Promise.all([
      new Promise((resolve, reject) => {
        this.redis.once('ready', resolve);
        this.redis.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        this.redisSub.once('ready', resolve);
        this.redisSub.once('error', reject);
      }),
    ]);

    console.log(`${this.logPrefix} Redis 连接成功 / Redis connected`);
  }

  /**
   * 初始化 Telegram Bot
   * Initialize Telegram Bot
   *
   * @private
   */
  async _initTelegram() {
    if (!this.config.telegram.enabled) {
      console.log(`${this.logPrefix} Telegram 已禁用 / Telegram disabled`);
      return;
    }

    let botToken = this.config.telegram.botToken;

    // 尝试从加密文件加载 / Try to load from encrypted file
    if (!botToken && hasEncryptedKeys()) {
      try {
        const masterPassword = getMasterPassword();
        if (masterPassword) {
          const keys = await loadEncryptedKeys(masterPassword);
          if (keys?.TELEGRAM_BOT_TOKEN) {
            botToken = isEncrypted(keys.TELEGRAM_BOT_TOKEN)
              ? decryptValue(keys.TELEGRAM_BOT_TOKEN, masterPassword)
              : keys.TELEGRAM_BOT_TOKEN;
          }
        }
      } catch (error) {
        console.warn(`${this.logPrefix} 无法加载加密的 Telegram Token / Cannot load encrypted Telegram token`);
      }
    }

    if (!botToken) {
      console.warn(`${this.logPrefix} 未配置 Telegram Bot Token / Telegram Bot Token not configured`);
      this.config.telegram.enabled = false;
      return;
    }

    console.log(`${this.logPrefix} 正在初始化 Telegram Bot... / Initializing Telegram Bot...`);

    this.telegramBot = new TelegramBot(botToken, { polling: false });

    // 验证 Bot / Verify Bot
    try {
      const me = await this.telegramBot.getMe();
      console.log(`${this.logPrefix} Telegram Bot 已连接: @${me.username} / Telegram Bot connected: @${me.username}`);
    } catch (error) {
      console.error(`${this.logPrefix} Telegram Bot 连接失败 / Telegram Bot connection failed:`, error.message);
      this.config.telegram.enabled = false;
    }
  }

  /**
   * 启动消息监听
   * Start message listener
   *
   * @private
   */
  async _startMessageListener() {
    // 订阅通知请求频道 / Subscribe to notification request channel
    await this.redisSub.subscribe(REDIS_KEYS.NOTIFICATION_REQUEST);

    this.redisSub.on('message', async (channel, message) => {
      if (channel !== REDIS_KEYS.NOTIFICATION_REQUEST) return;

      try {
        const request = JSON.parse(message);
        await this._handleNotificationRequest(request);
      } catch (error) {
        console.error(`${this.logPrefix} 处理通知请求失败 / Failed to handle notification request:`, error.message);
        this.stats.errors++;
      }
    });

    console.log(`${this.logPrefix} 消息监听已启动 / Message listener started`);
  }

  /**
   * 处理通知请求
   * Handle notification request
   *
   * @param {Object} request - 通知请求 / Notification request
   * @private
   */
  async _handleNotificationRequest(request) {
    const { type, message, priority = MESSAGE_PRIORITY.NORMAL, source, data } = request;

    // 更新统计 / Update stats
    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
    if (source) {
      this.stats.bySource[source] = (this.stats.bySource[source] || 0) + 1;
    }

    // 检查队列长度 / Check queue length
    if (this.messageQueue.length >= this.config.rateLimit.maxQueueLength) {
      console.warn(`${this.logPrefix} 消息队列已满，丢弃消息 / Message queue full, dropping message`);
      this.stats.messagesDropped++;
      return;
    }

    // 格式化消息 / Format message
    const formattedMessage = this._formatMessage(request);

    // 添加到队列 / Add to queue
    this.messageQueue.push({
      message: formattedMessage,
      priority,
      timestamp: Date.now(),
      source,
    });

    // 按优先级排序 / Sort by priority
    this.messageQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 格式化消息
   * Format message
   *
   * @param {Object} request - 通知请求 / Notification request
   * @returns {string} 格式化后的消息 / Formatted message
   * @private
   */
  _formatMessage(request) {
    const { type, message, source, data } = request;

    let prefix = '';
    switch (type) {
      case MESSAGE_TYPE.ALERT:
        prefix = '🚨';
        break;
      case MESSAGE_TYPE.TRADE:
        prefix = '💹';
        break;
      case MESSAGE_TYPE.POSITION:
        prefix = '📊';
        break;
      case MESSAGE_TYPE.DAILY_REPORT:
        prefix = '📋';
        break;
      case MESSAGE_TYPE.SYSTEM:
        prefix = '🤖';
        break;
      case MESSAGE_TYPE.PERFORMANCE:
        prefix = '📈';
        break;
      default:
        prefix = '📢';
    }

    // 添加来源标识 / Add source identifier
    const sourceTag = source ? `[${source}] ` : '';

    return `${prefix} ${sourceTag}${message}`;
  }

  /**
   * 启动队列处理器
   * Start queue processor
   *
   * @private
   */
  _startQueueProcessor() {
    this.queueProcessTimer = setInterval(async () => {
      await this._processQueue();
    }, 1000); // 每秒处理一次 / Process every second
  }

  /**
   * 处理消息队列
   * Process message queue
   *
   * @private
   */
  async _processQueue() {
    if (this.messageQueue.length === 0) {
      return;
    }

    // 重置限流计数器 / Reset rate limit counters
    const now = Date.now();
    if (now - this.rateLimitCounters.lastSecond >= 1000) {
      this.rateLimitCounters.second = 0;
      this.rateLimitCounters.lastSecond = now;
    }
    if (now - this.rateLimitCounters.lastMinute >= 60000) {
      this.rateLimitCounters.minute = 0;
      this.rateLimitCounters.lastMinute = now;
    }

    // 检查限流 / Check rate limit
    if (this.rateLimitCounters.second >= this.config.rateLimit.maxMessagesPerSecond) {
      return;
    }
    if (this.rateLimitCounters.minute >= this.config.rateLimit.maxMessagesPerMinute) {
      return;
    }

    // 取出消息 / Dequeue message
    const item = this.messageQueue.shift();
    if (!item) return;

    // 发送消息 / Send message
    try {
      await this._sendTelegramMessage(item.message);
      this.stats.messagesSent++;
      this.rateLimitCounters.second++;
      this.rateLimitCounters.minute++;
    } catch (error) {
      console.error(`${this.logPrefix} 发送消息失败 / Failed to send message:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * 发送 Telegram 消息
   * Send Telegram message
   *
   * @param {string} message - 消息内容 / Message content
   * @private
   */
  async _sendTelegramMessage(message) {
    if (!this.config.telegram.enabled || !this.telegramBot) {
      return;
    }

    const chatId = this.config.telegram.chatId;
    if (!chatId) {
      console.warn(`${this.logPrefix} 未配置 Chat ID / Chat ID not configured`);
      return;
    }

    await this.telegramBot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  }

  /**
   * 发送系统消息 (直接发送，不走队列)
   * Send system message (direct send, bypass queue)
   *
   * @param {string} message - 消息内容 / Message content
   * @private
   */
  async _sendSystemMessage(message) {
    try {
      await this._sendTelegramMessage(message);
    } catch (error) {
      console.error(`${this.logPrefix} 发送系统消息失败 / Failed to send system message:`, error.message);
    }
  }

  /**
   * 启动心跳
   * Start heartbeat
   *
   * @private
   */
  _startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      try {
        const status = this.getStatus();
        await this.redis.set(
          REDIS_KEYS.SERVICE_HEARTBEAT,
          JSON.stringify({
            timestamp: Date.now(),
            status: 'alive',
            uptime: status.uptime,
            stats: status.stats,
            queueLength: status.queueLength,
          }),
          'EX',
          30
        );
      } catch (error) {
        console.error(`${this.logPrefix} 心跳更新失败 / Heartbeat update failed:`, error.message);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * 发布服务状态
   * Publish service status
   *
   * @param {string} status - 状态 / Status
   * @private
   */
  async _publishServiceStatus(status) {
    try {
      await this.redis.set(
        REDIS_KEYS.SERVICE_STATUS,
        JSON.stringify({
          status,
          timestamp: Date.now(),
          pid: process.pid,
        }),
        'EX',
        60
      );
    } catch (error) {
      console.error(`${this.logPrefix} 发布服务状态失败 / Failed to publish service status:`, error.message);
    }
  }
}

// 导出创建函数 / Export creation function
export function createNotificationService(config) {
  return new NotificationService(config);
}

export default NotificationService;
