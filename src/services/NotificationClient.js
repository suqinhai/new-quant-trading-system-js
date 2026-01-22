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
import Redis from 'ioredis'; // 导入模块 ioredis

/**
 * Redis 键配置 (与 NotificationService 保持一致)
 * Redis key configuration (keep consistent with NotificationService)
 */
const REDIS_KEYS = { // 定义常量 REDIS_KEYS
  // 通知请求频道 / Notification request channel
  NOTIFICATION_REQUEST: 'notification:request', // NOTIFICATIONREQUEST权限

  // 服务状态 / Service status
  SERVICE_STATUS: 'notification:service:status', // SERVICE状态权限
  SERVICE_HEARTBEAT: 'notification:service:heartbeat', // SERVICEHEARTBEAT权限
}; // 结束代码块

/**
 * 消息类型
 * Message types
 */
export const MESSAGE_TYPE = { // 导出常量 MESSAGE_TYPE
  ALERT: 'alert', // 告警
  TRADE: 'trade', // 交易
  POSITION: 'position', // 持仓
  DAILY_REPORT: 'daily', // 每日REPORT
  SYSTEM: 'system', // 系统
  PERFORMANCE: 'performance', // PERFORMANCE
}; // 结束代码块

/**
 * 消息优先级
 * Message priority
 */
export const MESSAGE_PRIORITY = { // 导出常量 MESSAGE_PRIORITY
  LOW: 0, // 最低
  NORMAL: 1, // NORMAL
  HIGH: 2, // 最高
  URGENT: 3, // URGENT
  CRITICAL: 4, // CRITICAL
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // Redis 配置 / Redis configuration
  redis: { // Redis 配置
    host: process.env.REDIS_HOST || 'localhost', // 主机
    port: parseInt(process.env.REDIS_PORT || '6379', 10), // 端口
    password: process.env.REDIS_PASSWORD || null, // 密码
    db: parseInt(process.env.REDIS_DB || '0', 10), // db
  }, // 结束代码块

  // 来源标识 / Source identifier
  source: process.env.INSTANCE_NAME || process.env.SERVICE_NAME || 'unknown', // 来源

  // 是否在服务不可用时回退到本地日志 / Fallback to local log when service unavailable
  fallbackToLog: true, // 是否在服务不可用时回退到本地日志

  // 服务检查间隔 (毫秒) / Service check interval (ms)
  serviceCheckInterval: 30000, // 服务检查间隔 (毫秒)
}; // 结束代码块

/**
 * 通知客户端类
 * Notification Client Class
 */
export class NotificationClient { // 导出类 NotificationClient
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 合并配置 / Merge configuration
    this.config = { // 设置 config
      redis: { ...DEFAULT_CONFIG.redis, ...config.redis }, // redis
      source: config.source || DEFAULT_CONFIG.source, // 来源
      fallbackToLog: config.fallbackToLog !== undefined ? config.fallbackToLog : DEFAULT_CONFIG.fallbackToLog, // fallbackTo日志
      serviceCheckInterval: config.serviceCheckInterval || DEFAULT_CONFIG.serviceCheckInterval, // serviceCheck间隔
    }; // 结束代码块

    // Redis 客户端 / Redis client
    this.redis = null; // 设置 redis

    // 连接状态 / Connection status
    this.connected = false; // 设置 connected

    // 服务可用状态 / Service available status
    this.serviceAvailable = false; // 设置 serviceAvailable

    // 服务检查定时器 / Service check timer
    this.serviceCheckTimer = null; // 设置 serviceCheckTimer

    // 日志前缀 / Log prefix
    this.logPrefix = `[NotificationClient:${this.config.source}]`; // 设置 logPrefix
  } // 结束代码块

  /**
   * 连接到 Redis
   * Connect to Redis
   *
   * @returns {Promise<void>}
   */
  async connect() { // 执行语句
    if (this.connected) { // 条件判断 this.connected
      return; // 返回结果
    } // 结束代码块

    console.log(`${this.logPrefix} 正在连接 Redis... / Connecting to Redis...`); // 控制台输出

    try { // 尝试执行
      // 创建 Redis 连接 / Create Redis connection
      this.redis = new Redis({ // 设置 redis
        host: this.config.redis.host, // 主机
        port: this.config.redis.port, // 端口
        password: this.config.redis.password, // 密码
        db: this.config.redis.db, // db
        retryStrategy: (times) => Math.min(times * 100, 3000), // 重试策略
      }); // 结束代码块

      // 等待连接 / Wait for connection
      await new Promise((resolve, reject) => { // 等待异步结果
        this.redis.once('ready', resolve); // 访问 redis
        this.redis.once('error', reject); // 访问 redis
      }); // 结束代码块

      this.connected = true; // 设置 connected
      console.log(`${this.logPrefix} Redis 连接成功 / Redis connected`); // 控制台输出

      // 检查通知服务状态 / Check notification service status
      await this._checkServiceStatus(); // 等待异步结果

      // 启动定期检查 / Start periodic check
      this._startServiceCheck(); // 调用 _startServiceCheck

    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} Redis 连接失败 / Redis connection failed:`, error.message); // 控制台输出
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 断开连接
   * Disconnect
   *
   * @returns {Promise<void>}
   */
  async disconnect() { // 执行语句
    // 停止服务检查 / Stop service check
    if (this.serviceCheckTimer) { // 条件判断 this.serviceCheckTimer
      clearInterval(this.serviceCheckTimer); // 调用 clearInterval
      this.serviceCheckTimer = null; // 设置 serviceCheckTimer
    } // 结束代码块

    // 断开 Redis / Disconnect Redis
    if (this.redis) { // 条件判断 this.redis
      this.redis.disconnect(); // 访问 redis
      this.redis = null; // 设置 redis
    } // 结束代码块

    this.connected = false; // 设置 connected
    console.log(`${this.logPrefix} 已断开连接 / Disconnected`); // 控制台输出
  } // 结束代码块

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
  async send(options) { // 执行语句
    const { // 解构赋值
      type = MESSAGE_TYPE.SYSTEM, // 赋值 type
      message, // 执行语句
      priority = MESSAGE_PRIORITY.NORMAL, // 赋值 priority
      data = {}, // 赋值 data
    } = options; // 执行语句

    // 验证参数 / Validate parameters
    if (!message) { // 条件判断 !message
      console.warn(`${this.logPrefix} 消息内容不能为空 / Message content cannot be empty`); // 控制台输出
      return false; // 返回结果
    } // 结束代码块

    // 构建请求 / Build request
    const request = { // 定义常量 request
      type, // 执行语句
      message, // 执行语句
      priority, // 执行语句
      source: this.config.source, // 来源
      data, // 执行语句
      timestamp: Date.now(), // 时间戳
    }; // 结束代码块

    // 如果未连接，尝试连接 / If not connected, try to connect
    if (!this.connected) { // 条件判断 !this.connected
      try { // 尝试执行
        await this.connect(); // 等待异步结果
      } catch (error) { // 执行语句
        this._fallbackLog(request); // 调用 _fallbackLog
        return false; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 检查服务是否可用 / Check if service is available
    if (!this.serviceAvailable) { // 条件判断 !this.serviceAvailable
      await this._checkServiceStatus(); // 等待异步结果
    } // 结束代码块

    // 如果服务不可用，回退到本地日志 / If service unavailable, fallback to local log
    if (!this.serviceAvailable) { // 条件判断 !this.serviceAvailable
      this._fallbackLog(request); // 调用 _fallbackLog
      return false; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 发布通知请求 / Publish notification request
      await this.redis.publish(REDIS_KEYS.NOTIFICATION_REQUEST, JSON.stringify(request)); // 等待异步结果
      return true; // 返回结果

    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 发送通知失败 / Failed to send notification:`, error.message); // 控制台输出
      this._fallbackLog(request); // 调用 _fallbackLog
      return false; // 返回结果
    } // 结束代码块
  } // 结束代码块

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
  async sendAlert(message, data = {}) { // 执行语句
    return this.send({ // 返回结果
      type: MESSAGE_TYPE.ALERT, // 类型
      message, // 执行语句
      priority: MESSAGE_PRIORITY.HIGH, // priority
      data, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送交易通知
   * Send trade notification
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 交易数据 / Trade data
   * @returns {Promise<boolean>}
   */
  async sendTrade(message, data = {}) { // 执行语句
    return this.send({ // 返回结果
      type: MESSAGE_TYPE.TRADE, // 类型
      message, // 执行语句
      priority: MESSAGE_PRIORITY.NORMAL, // priority
      data, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送持仓通知
   * Send position notification
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 持仓数据 / Position data
   * @returns {Promise<boolean>}
   */
  async sendPosition(message, data = {}) { // 执行语句
    return this.send({ // 返回结果
      type: MESSAGE_TYPE.POSITION, // 类型
      message, // 执行语句
      priority: MESSAGE_PRIORITY.NORMAL, // priority
      data, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送日报
   * Send daily report
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 报告数据 / Report data
   * @returns {Promise<boolean>}
   */
  async sendDailyReport(message, data = {}) { // 执行语句
    return this.send({ // 返回结果
      type: MESSAGE_TYPE.DAILY_REPORT, // 类型
      message, // 执行语句
      priority: MESSAGE_PRIORITY.LOW, // priority
      data, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送系统消息
   * Send system message
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 附加数据 / Additional data
   * @returns {Promise<boolean>}
   */
  async sendSystem(message, data = {}) { // 执行语句
    return this.send({ // 返回结果
      type: MESSAGE_TYPE.SYSTEM, // 类型
      message, // 执行语句
      priority: MESSAGE_PRIORITY.NORMAL, // priority
      data, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送性能报告
   * Send performance report
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 性能数据 / Performance data
   * @returns {Promise<boolean>}
   */
  async sendPerformance(message, data = {}) { // 执行语句
    return this.send({ // 返回结果
      type: MESSAGE_TYPE.PERFORMANCE, // 类型
      message, // 执行语句
      priority: MESSAGE_PRIORITY.LOW, // priority
      data, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送紧急通知
   * Send urgent notification
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 附加数据 / Additional data
   * @returns {Promise<boolean>}
   */
  async sendUrgent(message, data = {}) { // 执行语句
    return this.send({ // 返回结果
      type: MESSAGE_TYPE.ALERT, // 类型
      message, // 执行语句
      priority: MESSAGE_PRIORITY.URGENT, // priority
      data, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发送严重警报
   * Send critical alert
   *
   * @param {string} message - 消息内容 / Message content
   * @param {Object} data - 附加数据 / Additional data
   * @returns {Promise<boolean>}
   */
  async sendCritical(message, data = {}) { // 执行语句
    return this.send({ // 返回结果
      type: MESSAGE_TYPE.ALERT, // 类型
      message, // 执行语句
      priority: MESSAGE_PRIORITY.CRITICAL, // priority
      data, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 检查通知服务状态
   * Check notification service status
   *
   * @private
   */
  async _checkServiceStatus() { // 执行语句
    try { // 尝试执行
      const heartbeat = await this.redis.get(REDIS_KEYS.SERVICE_HEARTBEAT); // 定义常量 heartbeat

      if (!heartbeat) { // 条件判断 !heartbeat
        this.serviceAvailable = false; // 设置 serviceAvailable
        return; // 返回结果
      } // 结束代码块

      const data = JSON.parse(heartbeat); // 定义常量 data
      const age = Date.now() - data.timestamp; // 定义常量 age

      // 心跳超过 30 秒认为服务不可用 / Heartbeat over 30s means service unavailable
      if (age > 30000) { // 条件判断 age > 30000
        this.serviceAvailable = false; // 设置 serviceAvailable
        console.warn(`${this.logPrefix} 通知服务心跳过期 (${age}ms) / Notification service heartbeat expired`); // 控制台输出
      } else { // 执行语句
        this.serviceAvailable = true; // 设置 serviceAvailable
      } // 结束代码块

    } catch (error) { // 执行语句
      this.serviceAvailable = false; // 设置 serviceAvailable
      console.warn(`${this.logPrefix} 检查服务状态失败 / Failed to check service status:`, error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动服务检查定时器
   * Start service check timer
   *
   * @private
   */
  _startServiceCheck() { // 调用 _startServiceCheck
    if (this.serviceCheckTimer) { // 条件判断 this.serviceCheckTimer
      return; // 返回结果
    } // 结束代码块

    this.serviceCheckTimer = setInterval(async () => { // 设置 serviceCheckTimer
      await this._checkServiceStatus(); // 等待异步结果
    }, this.config.serviceCheckInterval); // 执行语句
  } // 结束代码块

  /**
   * 回退到本地日志
   * Fallback to local log
   *
   * @param {Object} request - 通知请求 / Notification request
   * @private
   */
  _fallbackLog(request) { // 调用 _fallbackLog
    if (!this.config.fallbackToLog) { // 条件判断 !this.config.fallbackToLog
      return; // 返回结果
    } // 结束代码块

    const { type, message, priority, source } = request; // 解构赋值
    const priorityName = Object.keys(MESSAGE_PRIORITY).find( // 定义常量 priorityName
      key => MESSAGE_PRIORITY[key] === priority // 赋值 key
    ) || 'UNKNOWN'; // 执行语句

    console.log(`${this.logPrefix} [FALLBACK] [${type}] [${priorityName}] ${message}`); // 控制台输出
  } // 结束代码块

  /**
   * 检查服务是否可用
   * Check if service is available
   *
   * @returns {Promise<boolean>}
   */
  async isServiceAvailable() { // 执行语句
    await this._checkServiceStatus(); // 等待异步结果
    return this.serviceAvailable; // 返回结果
  } // 结束代码块

  /**
   * 获取服务状态
   * Get service status
   *
   * @returns {Promise<Object|null>}
   */
  async getServiceStatus() { // 执行语句
    try { // 尝试执行
      const heartbeat = await this.redis.get(REDIS_KEYS.SERVICE_HEARTBEAT); // 定义常量 heartbeat
      if (!heartbeat) { // 条件判断 !heartbeat
        return null; // 返回结果
      } // 结束代码块
      return JSON.parse(heartbeat); // 返回结果
    } catch (error) { // 执行语句
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出创建函数 / Export creation function
export function createNotificationClient(config) { // 导出函数 createNotificationClient
  return new NotificationClient(config); // 返回结果
} // 结束代码块

export default NotificationClient; // 默认导出
