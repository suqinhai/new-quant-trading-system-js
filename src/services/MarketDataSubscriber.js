/**
 * 行情数据订阅器
 * Market Data Subscriber
 *
 * 供策略容器使用，通过 Redis Pub/Sub 订阅共享行情服务的数据
 * Used by strategy containers to subscribe to shared market data service via Redis Pub/Sub
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入 Redis 客户端 / Import Redis client
import Redis from 'ioredis';

/**
 * Redis 键前缀配置 (与 MarketDataService 保持一致)
 * Redis key prefix configuration (consistent with MarketDataService)
 */
const REDIS_KEYS = {
  TICKER: 'market:ticker',
  DEPTH: 'market:depth',
  TRADE: 'market:trade',
  FUNDING: 'market:funding',
  KLINE: 'market:kline',
  SERVICE_STATUS: 'market:service:status',
  SERVICE_HEARTBEAT: 'market:service:heartbeat',
  SUBSCRIBE_REQUEST: 'market:subscribe:request',
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || null,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  // 重连配置 / Reconnection configuration
  reconnect: {
    maxAttempts: 10,
    baseDelay: 1000,
    maxDelay: 30000,
  },
};

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
export class MarketDataSubscriber extends EventEmitter {
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
      reconnect: { ...DEFAULT_CONFIG.reconnect, ...config.reconnect },
    };

    // Redis 订阅客户端 / Redis subscribe client
    this.redisSub = null;

    // Redis 普通客户端 (用于发送订阅请求和检查状态) / Redis normal client (for sending requests and checking status)
    this.redis = null;

    // 当前订阅的频道 / Currently subscribed channels
    this.subscriptions = new Map(); // channel -> { exchange, symbol, dataType }

    // 连接状态 / Connection status
    this.connected = false;

    // 行情服务状态 / Market data service status
    this.serviceAlive = false;

    // 心跳检查定时器 / Heartbeat check timer
    this.heartbeatCheckTimer = null;

    // 统计信息 / Statistics
    this.stats = {
      messagesReceived: 0,
      tickersReceived: 0,
      depthsReceived: 0,
      tradesReceived: 0,
      fundingsReceived: 0,
      klinesReceived: 0,
      errors: 0,
      lastMessageAt: null,
    };

    // 日志前缀 / Log prefix
    this.logPrefix = '[MarketDataSubscriber]';
  }

  /**
   * 连接到 Redis
   * Connect to Redis
   *
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) {
      console.warn(`${this.logPrefix} 已连接 / Already connected`);
      return;
    }

    console.log(`${this.logPrefix} 正在连接 Redis... / Connecting to Redis...`);

    const redisConfig = {
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
      retryStrategy: (times) => {
        if (times > this.config.reconnect.maxAttempts) {
          return null; // 停止重试 / Stop retrying
        }
        return Math.min(times * this.config.reconnect.baseDelay, this.config.reconnect.maxDelay);
      },
    };

    // 创建订阅连接 / Create subscribe connection
    this.redisSub = new Redis(redisConfig);

    // 创建普通连接 / Create normal connection
    this.redis = new Redis(redisConfig);

    // 等待连接 / Wait for connection
    await Promise.all([
      new Promise((resolve, reject) => {
        this.redisSub.once('ready', resolve);
        this.redisSub.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        this.redis.once('ready', resolve);
        this.redis.once('error', reject);
      }),
    ]);

    // 绑定消息处理 / Bind message handler
    this.redisSub.on('message', (channel, message) => {
      this._handleMessage(channel, message);
    });

    // 绑定模式消息处理 / Bind pattern message handler
    this.redisSub.on('pmessage', (pattern, channel, message) => {
      this._handleMessage(channel, message);
    });

    // 处理错误 / Handle errors
    this.redisSub.on('error', (error) => {
      console.error(`${this.logPrefix} Redis 订阅错误 / Redis subscribe error:`, error.message);
      this.stats.errors++;
      this.emit('error', error);
    });

    // 处理重连 / Handle reconnection
    this.redisSub.on('reconnecting', () => {
      console.log(`${this.logPrefix} Redis 正在重连... / Redis reconnecting...`);
    });

    this.connected = true;

    // 启动心跳检查 / Start heartbeat check
    this._startHeartbeatCheck();

    console.log(`${this.logPrefix} Redis 连接成功 / Redis connected`);
    this.emit('connected');
  }

  /**
   * 断开连接
   * Disconnect
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }

    console.log(`${this.logPrefix} 正在断开连接... / Disconnecting...`);

    // 停止心跳检查 / Stop heartbeat check
    if (this.heartbeatCheckTimer) {
      clearInterval(this.heartbeatCheckTimer);
      this.heartbeatCheckTimer = null;
    }

    // 关闭 Redis 连接 / Close Redis connections
    if (this.redisSub) {
      this.redisSub.disconnect();
      this.redisSub = null;
    }

    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }

    this.connected = false;
    this.subscriptions.clear();

    console.log(`${this.logPrefix} 已断开连接 / Disconnected`);
    this.emit('disconnected');
  }

  /**
   * 订阅交易对行情
   * Subscribe to symbol market data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Symbol
   * @param {string|Array<string>} dataTypes - 数据类型 / Data types (ticker, depth, trade, funding, kline)
   * @returns {Promise<void>}
   */
  async subscribe(exchange, symbol, dataTypes = 'ticker') {
    if (!this.connected) {
      throw new Error('未连接到 Redis / Not connected to Redis');
    }

    // 标准化数据类型 / Normalize data types
    const types = Array.isArray(dataTypes) ? dataTypes : [dataTypes];

    for (const dataType of types) {
      const channel = this._buildChannel(exchange, symbol, dataType);

      // 检查是否已订阅 / Check if already subscribed
      if (this.subscriptions.has(channel)) {
        continue;
      }

      // 订阅频道 / Subscribe to channel
      await this.redisSub.subscribe(channel);

      // 记录订阅 / Record subscription
      this.subscriptions.set(channel, { exchange, symbol, dataType });

      console.log(`${this.logPrefix} 已订阅 / Subscribed: ${channel}`);
    }

    // 发送订阅请求到行情服务 (请求订阅该交易对) / Send subscribe request to market data service
    await this._sendSubscribeRequest('subscribe', exchange, symbol, types);
  }

  /**
   * 取消订阅
   * Unsubscribe
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Symbol
   * @param {string|Array<string>} dataTypes - 数据类型 / Data types
   * @returns {Promise<void>}
   */
  async unsubscribe(exchange, symbol, dataTypes = 'ticker') {
    if (!this.connected) {
      return;
    }

    const types = Array.isArray(dataTypes) ? dataTypes : [dataTypes];

    for (const dataType of types) {
      const channel = this._buildChannel(exchange, symbol, dataType);

      if (!this.subscriptions.has(channel)) {
        continue;
      }

      // 取消订阅 / Unsubscribe
      await this.redisSub.unsubscribe(channel);

      // 移除记录 / Remove record
      this.subscriptions.delete(channel);

      console.log(`${this.logPrefix} 已取消订阅 / Unsubscribed: ${channel}`);
    }

    // 发送取消订阅请求 / Send unsubscribe request
    await this._sendSubscribeRequest('unsubscribe', exchange, symbol, types);
  }

  /**
   * 使用模式订阅 (订阅某个交易所的所有交易对)
   * Subscribe using pattern (subscribe to all symbols of an exchange)
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Promise<void>}
   */
  async subscribePattern(exchange, dataType = 'ticker') {
    if (!this.connected) {
      throw new Error('未连接到 Redis / Not connected to Redis');
    }

    const pattern = `${REDIS_KEYS[dataType.toUpperCase()]}:${exchange}:*`;

    await this.redisSub.psubscribe(pattern);

    console.log(`${this.logPrefix} 已订阅模式 / Subscribed pattern: ${pattern}`);
  }

  /**
   * 检查行情服务是否在线
   * Check if market data service is online
   *
   * @returns {Promise<boolean>}
   */
  async checkServiceStatus() {
    if (!this.connected) {
      return false;
    }

    try {
      const heartbeat = await this.redis.get(REDIS_KEYS.SERVICE_HEARTBEAT);

      if (!heartbeat) {
        this.serviceAlive = false;
        return false;
      }

      const data = JSON.parse(heartbeat);
      const age = Date.now() - data.timestamp;

      // 如果心跳超过 30 秒，认为服务离线 / If heartbeat is older than 30 seconds, consider service offline
      this.serviceAlive = age < 30000;

      return this.serviceAlive;
    } catch (error) {
      console.error(`${this.logPrefix} 检查服务状态失败 / Failed to check service status:`, error.message);
      return false;
    }
  }

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() {
    return {
      ...this.stats,
      connected: this.connected,
      serviceAlive: this.serviceAlive,
      subscriptionsCount: this.subscriptions.size,
      subscriptions: Array.from(this.subscriptions.keys()),
    };
  }

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

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
  _buildChannel(exchange, symbol, dataType) {
    const prefix = REDIS_KEYS[dataType.toUpperCase()] || REDIS_KEYS.TICKER;
    return `${prefix}:${exchange}:${symbol}`;
  }

  /**
   * 处理接收到的消息
   * Handle received message
   *
   * @param {string} channel - 频道名 / Channel name
   * @param {string} message - 消息内容 / Message content
   * @private
   */
  _handleMessage(channel, message) {
    try {
      // 解析消息 / Parse message
      const data = JSON.parse(message);

      // 更新统计 / Update stats
      this.stats.messagesReceived++;
      this.stats.lastMessageAt = Date.now();

      // 解析数据类型 / Parse data type
      const parts = channel.split(':');
      const dataType = parts[1]; // ticker, depth, trade, funding, kline

      // 更新对应统计 / Update corresponding stats
      if (this.stats[`${dataType}sReceived`] !== undefined) {
        this.stats[`${dataType}sReceived`]++;
      }

      // 发射事件 / Emit event
      this.emit(dataType, data);

      // 发射通用事件 / Emit generic event
      this.emit('data', { type: dataType, data });

    } catch (error) {
      console.error(`${this.logPrefix} 解析消息失败 / Failed to parse message:`, error.message);
      this.stats.errors++;
    }
  }

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
  async _sendSubscribeRequest(action, exchange, symbol, dataTypes) {
    try {
      await this.redis.publish(REDIS_KEYS.SUBSCRIBE_REQUEST, JSON.stringify({
        action,
        exchange,
        symbol,
        dataTypes,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error(`${this.logPrefix} 发送订阅请求失败 / Failed to send subscribe request:`, error.message);
    }
  }

  /**
   * 启动心跳检查
   * Start heartbeat check
   *
   * @private
   */
  _startHeartbeatCheck() {
    this.heartbeatCheckTimer = setInterval(async () => {
      const wasAlive = this.serviceAlive;
      const isAlive = await this.checkServiceStatus();

      if (wasAlive && !isAlive) {
        console.warn(`${this.logPrefix} 行情服务离线 / Market data service offline`);
        this.emit('serviceOffline');
      } else if (!wasAlive && isAlive) {
        console.log(`${this.logPrefix} 行情服务恢复 / Market data service restored`);
        this.emit('serviceOnline');
      }
    }, 10000); // 每 10 秒检查 / Check every 10 seconds
  }
}

// 导出创建函数 / Export creation function
export function createMarketDataSubscriber(config) {
  return new MarketDataSubscriber(config);
}

export default MarketDataSubscriber;
