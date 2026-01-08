/**
 * 通知客户端
 * Notification Client
 *
 * 策略容器使用此客户端发送通知请求到共享通知服务
 * Strategy containers use this client to send notification requests to shared notification service
 *
 * 通过 Redis Pub/Sub 发送通知请求，由 NotificationService 统一处理
 * Sends notification requests via Redis Pub/Sub, handled by NotificationService
 */

// 导入 Redis 客户端 / Import Redis client
import Redis from 'ioredis';

/**
 * Redis 键配置 (与 NotificationService 保持一致)
 * Redis key configuration (keep consistent with NotificationService)
 */
const REDIS_KEYS = {
  // 通知请求频道 / Notification request channel
  NOTIFICATION_REQUEST: 'notification:request',

  // 服务状态 / Service status
  SERVICE_STATUS: 'notification:service:status',
  SERVICE_HEARTBEAT: 'notification:service:heartbeat',
};

/**
 * 消息类型
 * Message types
 */
export const MESSAGE_TYPE = {
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
export const MESSAGE_PRIORITY = {
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

  // 来源标识 / Source identifier
  source: process.env.INSTANCE_NAME || process.env.SERVICE_NAME || 'unknown',

  // 是否在服务不可用时回退到本地日志 / Fallback to local log when service unavailable
  fallbackToLog: true,

  // 服务检查间隔 (毫秒) / Service check interval (ms)
  serviceCheckInterval: 30000,
};

/**
 * 通知客户端类
 * Notification Client Class
 */
export class NotificationClient {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 合并配置 / Merge configuration
    this.config = {
      redis: { ...DEFAULT_CONFIG.redis, ...config.redis },
      source: config.source || DEFAULT_CONFIG.source,
      fallbackToLog: config.fallbackToLog !== undefined ? config.fallbackToLog : DEFAULT_CONFIG.fallbackToLog,
      serviceCheckInterval: config.serviceCheckInterval || DEFAULT_CONFIG.serviceCheckInterval,
    };

    // Redis 客户端 / Redis client
    this.redis = null;

    // 连接状态 / Connection status
    this.connected = false;

    // 服务可用状态 / Service available status
    this.serviceAvailable = false;

    // 服务检查定时器 / Service check timer
    this.serviceCheckTimer = null;

    // 日志前缀 / Log prefix
    this.logPrefix = `[NotificationClient:${this.config.source}]`;
  }

  /**
   * 连接到 Redis
   * Connect to Redis
   *
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) {
      return;
    }

    console.log(`${this.logPrefix} 正在连接 Redis... / Connecting to Redis...`);

    try {
      // 创建 Redis 连接 / Create Redis connection
      this.redis = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });

      // 等待连接 / Wait for connection
      await new Promise((resolve, reject) => {
        this.redis.once('ready', resolve);
        this.redis.once('error', reject);
      });

      this.connected = true;
      console.log(`${this.logPrefix} Redis 连接成功 / Redis connected`);

      // 检查通知服务状态 / Check notification service status
      await this._checkServiceStatus();

      // 启动定期检查 / Start periodic check
      this._startServiceCheck();

    } catch (error) {
      console.error(`${this.logPrefix} Redis 连接失败 / Redis connection failed:`, error.message);
      throw error;
    }
  }

  /**
   * 断开连接
   * Disconnect
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    // 停止服务检查 / Stop service check
    if (this.serviceCheckTimer) {
      clearInterval(this.serviceCheckTimer);
      this.serviceCheckTimer = null;
    }

    // 断开 Redis / Disconnect Redis
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }

    this.connected = false;
    console.log(`${this.logPrefix} 已断开连接 / Disconnected`);
  }

  /**
   * 发送通知
   * Send notification
   *
   * @param {Object} options - 通知选项 / Notification options
   * @param {string} options.type - 消息类型 / Message type
   * @param {string} options.message - 消息内容 / Message content
   * @param {number} options.priority - 优先级 / Priority
   * @param {Object} options.data - 附加数据 / Additional data
   * @returns {Promise<boolean>} 是否成功 / Success status
   */
  async send(options) {
    const {
      type = MESSAGE_TYPE.SYSTEM,
      message,
      priority = MESSAGE_PRIORITY.NORMAL,
      data = {},
    } = options;

    // 验证参数 / Validate parameters
    if (!message) {
      console.warn(`${this.logPrefix} 消息内容不能为空 / Message content cannot be empty`);
      return false;
    }

    // 构建请求 / Build request
    const request = {
      type,
      message,
      priority,
      source: this.config.source,
      data,
      timestamp: Date.now(),
    };

    // 如果未连接，尝试连接 / If not connected, try to connect
    if (!this.connected) {
      try {
        await this.connect();
      } catch (error) {
        this._fallbackLog(request);
        return false;
      }
    }

    // 检查服务是否可用 / Check if service is available
    if (!this.serviceAvailable) {
      await this._checkServiceStatus();
    }

    // 如果服务不可用，回退到本地日志 / If service unavailable, fallback to local log
    if (!this.serviceAvailable) {
      this._fallbackLog(request);
      return false;
    }

    try {
      // 发布通知请求 / Publish notification request
      await this.redis.publish(REDIS_KEYS.NOTIFICATION_REQUEST, JSON.stringify(request));
      return true;

    } catch (error) {
      console.error(`${this.logPrefix} 发送通知失败 / Failed to send notification:`, error.message);
      this._fallbackLog(request);
      return false;
    }
  }

  // ============================================
  // 便捷方法 / Convenience Methods
  // ============================================

  /**
   * 发送警报
   * Send alert
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 附加数据 / Additional data
   * @returns {Promise<boolean>}
   */
  async sendAlert(message, data = {}) {
    return this.send({
      type: MESSAGE_TYPE.ALERT,
      message,
      priority: MESSAGE_PRIORITY.HIGH,
      data,
    });
  }

  /**
   * 发送交易通知
   * Send trade notification
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 交易数据 / Trade data
   * @returns {Promise<boolean>}
   */
  async sendTrade(message, data = {}) {
    return this.send({
      type: MESSAGE_TYPE.TRADE,
      message,
      priority: MESSAGE_PRIORITY.NORMAL,
      data,
    });
  }

  /**
   * 发送持仓通知
   * Send position notification
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 持仓数据 / Position data
   * @returns {Promise<boolean>}
   */
  async sendPosition(message, data = {}) {
    return this.send({
      type: MESSAGE_TYPE.POSITION,
      message,
      priority: MESSAGE_PRIORITY.NORMAL,
      data,
    });
  }

  /**
   * 发送日报
   * Send daily report
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 报告数据 / Report data
   * @returns {Promise<boolean>}
   */
  async sendDailyReport(message, data = {}) {
    return this.send({
      type: MESSAGE_TYPE.DAILY_REPORT,
      message,
      priority: MESSAGE_PRIORITY.LOW,
      data,
    });
  }

  /**
   * 发送系统消息
   * Send system message
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 附加数据 / Additional data
   * @returns {Promise<boolean>}
   */
  async sendSystem(message, data = {}) {
    return this.send({
      type: MESSAGE_TYPE.SYSTEM,
      message,
      priority: MESSAGE_PRIORITY.NORMAL,
      data,
    });
  }

  /**
   * 发送性能报告
   * Send performance report
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 性能数据 / Performance data
   * @returns {Promise<boolean>}
   */
  async sendPerformance(message, data = {}) {
    return this.send({
      type: MESSAGE_TYPE.PERFORMANCE,
      message,
      priority: MESSAGE_PRIORITY.LOW,
      data,
    });
  }

  /**
   * 发送紧急通知
   * Send urgent notification
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 附加数据 / Additional data
   * @returns {Promise<boolean>}
   */
  async sendUrgent(message, data = {}) {
    return this.send({
      type: MESSAGE_TYPE.ALERT,
      message,
      priority: MESSAGE_PRIORITY.URGENT,
      data,
    });
  }

  /**
   * 发送严重警报
   * Send critical alert
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 附加数据 / Additional data
   * @returns {Promise<boolean>}
   */
  async sendCritical(message, data = {}) {
    return this.send({
      type: MESSAGE_TYPE.ALERT,
      message,
      priority: MESSAGE_PRIORITY.CRITICAL,
      data,
    });
  }

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 检查通知服务状态
   * Check notification service status
   *
   * @private
   */
  async _checkServiceStatus() {
    try {
      const heartbeat = await this.redis.get(REDIS_KEYS.SERVICE_HEARTBEAT);

      if (!heartbeat) {
        this.serviceAvailable = false;
        return;
      }

      const data = JSON.parse(heartbeat);
      const age = Date.now() - data.timestamp;

      // 心跳超过 30 秒认为服务不可用 / Heartbeat over 30s means service unavailable
      if (age > 30000) {
        this.serviceAvailable = false;
        console.warn(`${this.logPrefix} 通知服务心跳过期 (${age}ms) / Notification service heartbeat expired`);
      } else {
        this.serviceAvailable = true;
      }

    } catch (error) {
      this.serviceAvailable = false;
      console.warn(`${this.logPrefix} 检查服务状态失败 / Failed to check service status:`, error.message);
    }
  }

  /**
   * 启动服务检查定时器
   * Start service check timer
   *
   * @private
   */
  _startServiceCheck() {
    if (this.serviceCheckTimer) {
      return;
    }

    this.serviceCheckTimer = setInterval(async () => {
      await this._checkServiceStatus();
    }, this.config.serviceCheckInterval);
  }

  /**
   * 回退到本地日志
   * Fallback to local log
   *
   * @param {Object} request - 通知请求 / Notification request
   * @private
   */
  _fallbackLog(request) {
    if (!this.config.fallbackToLog) {
      return;
    }

    const { type, message, priority, source } = request;
    const priorityName = Object.keys(MESSAGE_PRIORITY).find(
      key => MESSAGE_PRIORITY[key] === priority
    ) || 'UNKNOWN';

    console.log(`${this.logPrefix} [FALLBACK] [${type}] [${priorityName}] ${message}`);
  }

  /**
   * 检查服务是否可用
   * Check if service is available
   *
   * @returns {Promise<boolean>}
   */
  async isServiceAvailable() {
    await this._checkServiceStatus();
    return this.serviceAvailable;
  }

  /**
   * 获取服务状态
   * Get service status
   *
   * @returns {Promise<Object|null>}
   */
  async getServiceStatus() {
    try {
      const heartbeat = await this.redis.get(REDIS_KEYS.SERVICE_HEARTBEAT);
      if (!heartbeat) {
        return null;
      }
      return JSON.parse(heartbeat);
    } catch (error) {
      return null;
    }
  }
}

// 导出创建函数 / Export creation function
export function createNotificationClient(config) {
  return new NotificationClient(config);
}

export default NotificationClient;
