/**
 * 行情数据订阅器
 * Market Data Subscriber
 *
 * 供策略容器使用，通过 Redis Pub/Sub 订阅共享行情服务的数据
 * Used by strategy containers to subscribe to shared market data service via Redis Pub/Sub
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入 Redis 客户端 / Import Redis client
import Redis from 'ioredis'; // 导入模块 ioredis

/**
 * Redis 键前缀配置 (与 MarketDataService 保持一致)
 * Redis key prefix configuration (consistent with MarketDataService)
 */
const REDIS_KEYS = { // 定义常量 REDIS_KEYS
  TICKER: 'market:ticker', // 设置 TICKER 字段
  DEPTH: 'market:depth', // 设置 DEPTH 字段
  TRADE: 'market:trade', // 设置 TRADE 字段
  FUNDING: 'market:funding', // 设置 FUNDING 字段
  KLINE: 'market:kline', // 设置 KLINE 字段
  SERVICE_STATUS: 'market:service:status', // 设置 SERVICE_STATUS 字段
  SERVICE_HEARTBEAT: 'market:service:heartbeat', // 设置 SERVICE_HEARTBEAT 字段
  SUBSCRIBE_REQUEST: 'market:subscribe:request', // 设置 SUBSCRIBE_REQUEST 字段
  // 统一发布频道 (与 MarketDataEngine 一致) / Unified publish channel (consistent with MarketDataEngine)
  UNIFIED_CHANNEL: 'market_data', // 设置 UNIFIED_CHANNEL 字段
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  redis: { // 设置 redis 字段
    host: process.env.REDIS_HOST || 'localhost', // 读取环境变量 REDIS_HOST
    port: parseInt(process.env.REDIS_PORT || '6379', 10), // 读取环境变量 REDIS_PORT
    password: process.env.REDIS_PASSWORD || null, // 读取环境变量 REDIS_PASSWORD
    db: parseInt(process.env.REDIS_DB || '0', 10), // 读取环境变量 REDIS_DB
  }, // 结束代码块
  // 重连配置 / Reconnection configuration
  reconnect: { // 设置 reconnect 字段
    maxAttempts: 10, // 设置 maxAttempts 字段
    baseDelay: 1000, // 设置 baseDelay 字段
    maxDelay: 30000, // 设置 maxDelay 字段
  }, // 结束代码块
}; // 结束代码块

/**
 * 行情数据订阅器类
 * Market Data Subscriber Class
 *
 * 功能 / Features:
 * 1. 连接 Redis 订阅行情频道
 * 2. 解析并转发行情数据到本地事件
 * 3. 支持动态订阅/取消订阅
 * 4. 检测行情服务状态
 */
export class MarketDataSubscriber extends EventEmitter { // 导出类 MarketDataSubscriber
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
      reconnect: { ...DEFAULT_CONFIG.reconnect, ...config.reconnect }, // 设置 reconnect 字段
    }; // 结束代码块

    // Redis 订阅客户端 / Redis subscribe client
    this.redisSub = null; // 设置 redisSub

    // Redis 普通客户端 (用于发送订阅请求和检查状态) / Redis normal client (for sending requests and checking status)
    this.redis = null; // 设置 redis

    // 当前订阅的频道 / Currently subscribed channels
    this.subscriptions = new Map(); // channel -> { exchange, symbol, dataType }

    // 连接状态 / Connection status
    this.connected = false; // 设置 connected

    // 行情服务状态 / Market data service status
    this.serviceAlive = false; // 设置 serviceAlive

    // 心跳检查定时器 / Heartbeat check timer
    this.heartbeatCheckTimer = null; // 设置 heartbeatCheckTimer

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      messagesReceived: 0, // 设置 messagesReceived 字段
      tickersReceived: 0, // 设置 tickersReceived 字段
      depthsReceived: 0, // 设置 depthsReceived 字段
      tradesReceived: 0, // 设置 tradesReceived 字段
      fundingsReceived: 0, // 设置 fundingsReceived 字段
      klinesReceived: 0, // 设置 klinesReceived 字段
      errors: 0, // 设置 errors 字段
      lastMessageAt: null, // 设置 lastMessageAt 字段
    }; // 结束代码块

    // 日志前缀 / Log prefix
    this.logPrefix = '[MarketDataSubscriber]'; // 设置 logPrefix
  } // 结束代码块

  /**
   * 连接到 Redis
   * Connect to Redis
   *
   * @returns {Promise<void>}
   */
  async connect() { // 执行语句
    if (this.connected) { // 条件判断 this.connected
      console.warn(`${this.logPrefix} 已连接 / Already connected`); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    console.log(`${this.logPrefix} 正在连接 Redis... / Connecting to Redis...`); // 控制台输出

    const redisConfig = { // 定义常量 redisConfig
      host: this.config.redis.host, // 设置 host 字段
      port: this.config.redis.port, // 设置 port 字段
      password: this.config.redis.password, // 设置 password 字段
      db: this.config.redis.db, // 设置 db 字段
      retryStrategy: (times) => { // 设置 retryStrategy 字段
        if (times > this.config.reconnect.maxAttempts) { // 条件判断 times > this.config.reconnect.maxAttempts
          return null; // 停止重试 / Stop retrying
        } // 结束代码块
        return Math.min(times * this.config.reconnect.baseDelay, this.config.reconnect.maxDelay); // 返回结果
      }, // 结束代码块
    }; // 结束代码块

    // 创建订阅连接 / Create subscribe connection
    this.redisSub = new Redis(redisConfig); // 设置 redisSub

    // 创建普通连接 / Create normal connection
    this.redis = new Redis(redisConfig); // 设置 redis

    // 等待连接 / Wait for connection
    await Promise.all([ // 等待异步结果
      new Promise((resolve, reject) => { // 创建 Promise 实例
        this.redisSub.once('ready', resolve); // 访问 redisSub
        this.redisSub.once('error', reject); // 访问 redisSub
      }), // 结束代码块
      new Promise((resolve, reject) => { // 创建 Promise 实例
        this.redis.once('ready', resolve); // 访问 redis
        this.redis.once('error', reject); // 访问 redis
      }), // 结束代码块
    ]); // 结束数组或索引

    // 绑定消息处理 / Bind message handler
    this.redisSub.on('message', (channel, message) => { // 访问 redisSub
      this._handleMessage(channel, message); // 调用 _handleMessage
    }); // 结束代码块

    // 绑定模式消息处理 / Bind pattern message handler
    this.redisSub.on('pmessage', (pattern, channel, message) => { // 访问 redisSub
      this._handleMessage(channel, message); // 调用 _handleMessage
    }); // 结束代码块

    // 处理错误 / Handle errors
    this.redisSub.on('error', (error) => { // 访问 redisSub
      console.error(`${this.logPrefix} Redis 订阅错误 / Redis subscribe error:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
      this.emit('error', error); // 调用 emit
    }); // 结束代码块

    // 处理重连 / Handle reconnection
    this.redisSub.on('reconnecting', () => { // 访问 redisSub
      console.log(`${this.logPrefix} Redis 正在重连... / Redis reconnecting...`); // 控制台输出
    }); // 结束代码块

    // 订阅统一频道 (MarketDataEngine 发布到此频道)
    // Subscribe to unified channel (MarketDataEngine publishes to this channel)
    await this.redisSub.subscribe(REDIS_KEYS.UNIFIED_CHANNEL); // 等待异步结果
    console.log(`${this.logPrefix} 已订阅统一频道 / Subscribed to unified channel: ${REDIS_KEYS.UNIFIED_CHANNEL}`); // 控制台输出

    this.connected = true; // 设置 connected

    // 启动心跳检查 / Start heartbeat check
    this._startHeartbeatCheck(); // 调用 _startHeartbeatCheck

    console.log(`${this.logPrefix} Redis 连接成功 / Redis connected`); // 控制台输出
    this.emit('connected'); // 调用 emit
  } // 结束代码块

  /**
   * 断开连接
   * Disconnect
   *
   * @returns {Promise<void>}
   */
  async disconnect() { // 执行语句
    if (!this.connected) { // 条件判断 !this.connected
      return; // 返回结果
    } // 结束代码块

    console.log(`${this.logPrefix} 正在断开连接... / Disconnecting...`); // 控制台输出

    // 停止心跳检查 / Stop heartbeat check
    if (this.heartbeatCheckTimer) { // 条件判断 this.heartbeatCheckTimer
      clearInterval(this.heartbeatCheckTimer); // 调用 clearInterval
      this.heartbeatCheckTimer = null; // 设置 heartbeatCheckTimer
    } // 结束代码块

    // 关闭 Redis 连接 / Close Redis connections
    if (this.redisSub) { // 条件判断 this.redisSub
      this.redisSub.disconnect(); // 访问 redisSub
      this.redisSub = null; // 设置 redisSub
    } // 结束代码块

    if (this.redis) { // 条件判断 this.redis
      this.redis.disconnect(); // 访问 redis
      this.redis = null; // 设置 redis
    } // 结束代码块

    this.connected = false; // 设置 connected
    this.subscriptions.clear(); // 访问 subscriptions

    console.log(`${this.logPrefix} 已断开连接 / Disconnected`); // 控制台输出
    this.emit('disconnected'); // 调用 emit
  } // 结束代码块

  /**
   * 订阅交易对行情
   * Subscribe to symbol market data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Symbol
   * @param {string|Array<string>} dataTypes - 数据类型 / Data types (ticker, depth, trade, fundingRate, kline)
   * @returns {Promise<void>}
   */
  async subscribe(exchange, symbol, dataTypes = 'ticker') { // 执行语句
    if (!this.connected) { // 条件判断 !this.connected
      throw new Error('未连接到 Redis / Not connected to Redis'); // 抛出异常
    } // 结束代码块

    // 标准化数据类型 / Normalize data types
    const rawTypes = Array.isArray(dataTypes) ? dataTypes : [dataTypes]; // 定义常量 rawTypes
    const types = Array.from(new Set(rawTypes.map((dataType) => this._normalizeRequestedType(dataType)))); // 定义函数 types

    for (const dataType of types) { // 循环 const dataType of types
      const channel = this._buildChannel(exchange, symbol, dataType); // 定义常量 channel

      // 检查是否已订阅 / Check if already subscribed
      if (this.subscriptions.has(channel)) { // 条件判断 this.subscriptions.has(channel)
        continue; // 继续下一轮循环
      } // 结束代码块

      // 记录订阅过滤器 (统一频道已在 connect 时订阅，这里只记录过滤条件)
      // Record subscription filter (unified channel already subscribed in connect, only record filter here)
      this.subscriptions.set(channel, { exchange, symbol, dataType }); // 访问 subscriptions

      console.log(`${this.logPrefix} 已订阅 / Subscribed: ${channel}`); // 控制台输出
    } // 结束代码块

    // 发送订阅请求到行情服务 (请求订阅该交易对) / Send subscribe request to market data service
    await this._sendSubscribeRequest('subscribe', exchange, symbol, types); // 等待异步结果
  } // 结束代码块

  /**
   * 取消订阅
   * Unsubscribe
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Symbol
   * @param {string|Array<string>} dataTypes - 数据类型 / Data types
   * @returns {Promise<void>}
   */
  async unsubscribe(exchange, symbol, dataTypes = 'ticker') { // 执行语句
    if (!this.connected) { // 条件判断 !this.connected
      return; // 返回结果
    } // 结束代码块

    const rawTypes = Array.isArray(dataTypes) ? dataTypes : [dataTypes]; // 定义常量 rawTypes
    const types = Array.from(new Set(rawTypes.map((dataType) => this._normalizeRequestedType(dataType)))); // 定义函数 types

    for (const dataType of types) { // 循环 const dataType of types
      const channel = this._buildChannel(exchange, symbol, dataType); // 定义常量 channel

      if (!this.subscriptions.has(channel)) { // 条件判断 !this.subscriptions.has(channel)
        continue; // 继续下一轮循环
      } // 结束代码块

      // 移除订阅过滤器记录 / Remove subscription filter record
      this.subscriptions.delete(channel); // 访问 subscriptions

      console.log(`${this.logPrefix} 已取消订阅 / Unsubscribed: ${channel}`); // 控制台输出
    } // 结束代码块

    // 发送取消订阅请求 / Send unsubscribe request
    await this._sendSubscribeRequest('unsubscribe', exchange, symbol, types); // 等待异步结果
  } // 结束代码块

  /**
   * 使用模式订阅 (订阅某个交易所的所有交易对)
   * Subscribe using pattern (subscribe to all symbols of an exchange)
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Promise<void>}
   */
  async subscribePattern(exchange, dataType = 'ticker') { // 执行语句
    if (!this.connected) { // 条件判断 !this.connected
      throw new Error('未连接到 Redis / Not connected to Redis'); // 抛出异常
    } // 结束代码块

    const normalizedType = this._normalizeChannelType(dataType); // 定义常量 normalizedType
    const patternPrefix = REDIS_KEYS[normalizedType.toUpperCase()] || REDIS_KEYS.TICKER; // 定义常量 patternPrefix
    const pattern = `${patternPrefix}:${exchange}:*`; // 定义常量 pattern

    await this.redisSub.psubscribe(pattern); // 等待异步结果

    console.log(`${this.logPrefix} 已订阅模式 / Subscribed pattern: ${pattern}`); // 控制台输出
  } // 结束代码块

  /**
   * 检查行情服务是否在线
   * Check if market data service is online
   *
   * @returns {Promise<boolean>}
   */
  async checkServiceStatus() { // 执行语句
    if (!this.connected) { // 条件判断 !this.connected
      return false; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      const heartbeat = await this.redis.get(REDIS_KEYS.SERVICE_HEARTBEAT); // 定义常量 heartbeat

      if (!heartbeat) { // 条件判断 !heartbeat
        this.serviceAlive = false; // 设置 serviceAlive
        return false; // 返回结果
      } // 结束代码块

      const data = JSON.parse(heartbeat); // 定义常量 data
      const age = Date.now() - data.timestamp; // 定义常量 age

      // 如果心跳超过 30 秒，认为服务离线 / If heartbeat is older than 30 seconds, consider service offline
      this.serviceAlive = age < 30000; // 设置 serviceAlive

      return this.serviceAlive; // 返回结果
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 检查服务状态失败 / Failed to check service status:`, error.message); // 控制台输出
      return false; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      ...this.stats, // 展开对象或数组
      connected: this.connected, // 设置 connected 字段
      serviceAlive: this.serviceAlive, // 设置 serviceAlive 字段
      subscriptionsCount: this.subscriptions.size, // 设置 subscriptionsCount 字段
      subscriptions: Array.from(this.subscriptions.keys()), // 设置 subscriptions 字段
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  _normalizeRequestedType(dataType) { // 调用 _normalizeRequestedType
    return dataType === 'funding' ? 'fundingRate' : dataType; // 返回结果
  } // 结束代码块

  _normalizeChannelType(dataType) { // 调用 _normalizeChannelType
    return dataType === 'fundingRate' ? 'funding' : dataType; // 返回结果
  } // 结束代码块

  _normalizeEventType(dataType) { // 调用 _normalizeEventType
    return dataType === 'funding' ? 'fundingRate' : dataType; // 返回结果
  } // 结束代码块

  /**
   * 构建频道名
   * Build channel name
   *
   * @param {string} exchange - 交易所 / Exchange
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} dataType - 数据类型 / Data type
   * @returns {string} 频道名 / Channel name
   * @private
   */
  _buildChannel(exchange, symbol, dataType) { // 调用 _buildChannel
    const normalizedType = this._normalizeChannelType(dataType); // 定义常量 normalizedType
    const prefix = REDIS_KEYS[normalizedType.toUpperCase()] || REDIS_KEYS.TICKER; // 定义常量 prefix
    // 标准化交易对格式，移除 :USDT 后缀 / Normalize symbol format, remove :USDT suffix
    const normalizedSymbol = this._normalizeSymbol(symbol); // 定义常量 normalizedSymbol
    return `${prefix}:${exchange}:${normalizedSymbol}`; // 返回结果
  } // 结束代码块

  /**
   * 标准化交易对格式
   * Normalize symbol format
   *
   * @param {string} symbol - 交易对 / Trading pair (e.g., BTC/USDT:USDT or BTC/USDT)
   * @returns {string} 标准化的交易对 / Normalized symbol (e.g., BTC/USDT)
   * @private
   */
  _normalizeSymbol(symbol) { // 调用 _normalizeSymbol
    // 移除永续合约的 :USDT 后缀 / Remove perpetual contract :USDT suffix
    return symbol.replace(/:USDT$/, ''); // 返回结果
  } // 结束代码块

  /**
   * 处理接收到的消息
   * Handle received message
   *
   * @param {string} channel - 频道名 / Channel name
   * @param {string} message - 消息内容 / Message content
   * @private
   */
  _handleMessage(channel, message) { // 调用 _handleMessage
    try { // 尝试执行
      // 解析消息 / Parse message
      const parsed = JSON.parse(message); // 定义常量 parsed

      // 更新统计 / Update stats
      this.stats.messagesReceived++; // 访问 stats
      this.stats.lastMessageAt = Date.now(); // 访问 stats

      // 处理统一频道消息 / Handle unified channel message
      // 格式: { type: 'kline', data: {...}, timestamp: ... }
      if (channel === REDIS_KEYS.UNIFIED_CHANNEL) { // 条件判断 channel === REDIS_KEYS.UNIFIED_CHANNEL
        const { type: dataType, data } = parsed; // 解构赋值

        if (!dataType || !data) { // 条件判断 !dataType || !data
          return; // 返回结果
        } // 结束代码块

        const eventType = this._normalizeEventType(dataType); // 定义常量 eventType

        // 检查是否订阅了该数据 / Check if subscribed to this data
        const filterKey = this._buildChannel(data.exchange, data.symbol, eventType); // 定义常量 filterKey
        if (!this.subscriptions.has(filterKey)) { // 条件判断 !this.subscriptions.has(filterKey)
          return; // 未订阅，跳过 / Not subscribed, skip
        } // 结束代码块

        // 更新对应统计 / Update corresponding stats
        const statsType = this._normalizeChannelType(eventType); // 定义常量 statsType
        const statsKey = `${statsType}sReceived`; // 定义常量 statsKey
        if (this.stats[statsKey] !== undefined) { // 条件判断 this.stats[statsKey] !== undefined
          this.stats[statsKey]++; // 访问 stats
        } // 结束代码块

        // 发射事件 / Emit event
        this.emit(eventType, data); // 调用 emit

        // 发射通用事件 / Emit generic event
        this.emit('data', { type: eventType, data }); // 调用 emit

        return; // 返回结果
      } // 结束代码块

      // 处理旧的分散频道消息 (兼容模式) / Handle old separate channel message (compatibility mode)
      const parts = channel.split(':'); // 定义常量 parts
      const dataType = parts[1]; // ticker, depth, trade, funding, kline
      const eventType = this._normalizeEventType(dataType); // 定义常量 eventType

      // 更新对应统计 / Update corresponding stats
      const statsType = this._normalizeChannelType(eventType); // 定义常量 statsType
      if (this.stats[`${statsType}sReceived`] !== undefined) { // 条件判断 this.stats[`${statsType}sReceived`] !== undef...
        this.stats[`${statsType}sReceived`]++; // 访问 stats
      } // 结束代码块

      // 发射事件 / Emit event
      this.emit(eventType, parsed); // 调用 emit

      // 发射通用事件 / Emit generic event
      this.emit('data', { type: eventType, data: parsed }); // 调用 emit

    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 解析消息失败 / Failed to parse message:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 发送订阅请求到行情服务
   * Send subscribe request to market data service
   *
   * @param {string} action - 动作 (subscribe/unsubscribe) / Action
   * @param {string} exchange - 交易所 / Exchange
   * @param {string} symbol - 交易对 / Symbol
   * @param {Array<string>} dataTypes - 数据类型列表 / Data types
   * @private
   */
  async _sendSubscribeRequest(action, exchange, symbol, dataTypes) { // 执行语句
    try { // 尝试执行
      await this.redis.publish(REDIS_KEYS.SUBSCRIBE_REQUEST, JSON.stringify({ // 等待异步结果
        action, // 执行语句
        exchange, // 执行语句
        symbol, // 执行语句
        dataTypes, // 执行语句
        timestamp: Date.now(), // 设置 timestamp 字段
      })); // 结束代码块
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 发送订阅请求失败 / Failed to send subscribe request:`, error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动心跳检查
   * Start heartbeat check
   *
   * @private
   */
  _startHeartbeatCheck() { // 调用 _startHeartbeatCheck
    this.heartbeatCheckTimer = setInterval(async () => { // 设置 heartbeatCheckTimer
      const wasAlive = this.serviceAlive; // 定义常量 wasAlive
      const isAlive = await this.checkServiceStatus(); // 定义常量 isAlive

      if (wasAlive && !isAlive) { // 条件判断 wasAlive && !isAlive
        console.warn(`${this.logPrefix} 行情服务离线 / Market data service offline`); // 控制台输出
        this.emit('serviceOffline'); // 调用 emit
      } else if (!wasAlive && isAlive) { // 执行语句
        console.log(`${this.logPrefix} 行情服务恢复 / Market data service restored`); // 控制台输出
        this.emit('serviceOnline'); // 调用 emit
      } // 结束代码块
    }, 10000); // 每 10 秒检查 / Check every 10 seconds
  } // 结束代码块
} // 结束代码块

// 导出创建函数 / Export creation function
export function createMarketDataSubscriber(config) { // 导出函数 createMarketDataSubscriber
  return new MarketDataSubscriber(config); // 返回结果
} // 结束代码块

export default MarketDataSubscriber; // 默认导出
