/**
 * 实时行情数据引擎
 * Real-time Market Data Engine
 *
 * 功能 / Features:
 * 1. 同时连接 Binance/Bybit/OKX WebSocket / Connect to Binance/Bybit/OKX WebSocket simultaneously
 * 2. 订阅 ticker、depth、trade、fundingRate / Subscribe to ticker, depth, trade, fundingRate
 * 3. 统一时间戳（exchange time + local time 平均）/ Unified timestamp (average of exchange + local time)
 * 4. 数据存入 Redis（hash + stream）并发布到 channel / Store in Redis (hash + stream) and publish to channel
 * 5. 支持动态添加/删除 symbol / Support dynamic add/remove symbols
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入 WebSocket 库 / Import WebSocket library
import WebSocket from 'ws';

// 导入 Redis 客户端 / Import Redis client
import Redis from 'ioredis';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * WebSocket 端点配置
 * WebSocket endpoint configuration
 */
const WS_ENDPOINTS = {
  // Binance 端点 / Binance endpoints
  binance: {
    spot: 'wss://stream.binance.com:9443/ws',           // 现货 / Spot
    futures: 'wss://fstream.binance.com/ws',            // U 本位永续 / USDT-M futures
    delivery: 'wss://dstream.binance.com/ws',           // 币本位 / COIN-M futures
  },
  // Bybit 端点 / Bybit endpoints
  bybit: {
    spot: 'wss://stream.bybit.com/v5/public/spot',      // 现货 / Spot
    linear: 'wss://stream.bybit.com/v5/public/linear',  // USDT 永续 / USDT perpetual
    inverse: 'wss://stream.bybit.com/v5/public/inverse', // 反向合约 / Inverse perpetual
  },
  // OKX 端点 / OKX endpoints
  okx: {
    public: 'wss://ws.okx.com:8443/ws/v5/public',       // 公共频道 / Public channel
    business: 'wss://ws.okx.com:8443/ws/v5/business',   // 业务频道 / Business channel
  },
  // Deribit 端点 / Deribit endpoints
  deribit: {
    public: 'wss://www.deribit.com/ws/api/v2',          // 生产环境 / Production
    testnet: 'wss://test.deribit.com/ws/api/v2',        // 测试网 / Testnet
  },
};

/**
 * 数据类型枚举
 * Data type enumeration
 */
const DATA_TYPES = {
  TICKER: 'ticker',           // 行情快照 / Ticker snapshot
  DEPTH: 'depth',             // 深度数据 / Order book depth
  TRADE: 'trade',             // 成交数据 / Trade data
  FUNDING_RATE: 'fundingRate', // 资金费率 / Funding rate
  KLINE: 'kline',             // K线数据 / Candlestick data
};

/**
 * Redis 键前缀配置
 * Redis key prefix configuration
 */
const REDIS_KEYS = {
  TICKER_HASH: 'market:ticker:',         // 行情哈希键前缀 / Ticker hash key prefix
  DEPTH_HASH: 'market:depth:',           // 深度哈希键前缀 / Depth hash key prefix
  TRADE_STREAM: 'market:trades:',        // 成交流键前缀 / Trade stream key prefix
  FUNDING_HASH: 'market:funding:',       // 资金费率哈希键前缀 / Funding hash key prefix
  KLINE_HASH: 'market:kline:',           // K线哈希键前缀 / Kline hash key prefix
  CHANNEL: 'market_data',                // 发布频道名称 / Publish channel name
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // Redis 配置 / Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',        // Redis 主机 / Redis host
    port: parseInt(process.env.REDIS_PORT || '6379', 10),  // Redis 端口 / Redis port
    password: process.env.REDIS_PASSWORD || null,       // Redis 密码 / Redis password
    db: parseInt(process.env.REDIS_DB || '0', 10),      // Redis 数据库 / Redis database
    keyPrefix: '',            // 键前缀 / Key prefix
  },
  // 重连配置 / Reconnection configuration
  reconnect: {
    enabled: true,            // 是否启用自动重连 / Enable auto reconnect
    maxAttempts: 10,          // 最大重连次数 / Maximum reconnection attempts
    baseDelay: 1000,          // 基础延迟毫秒 / Base delay in milliseconds
    maxDelay: 30000,          // 最大延迟毫秒 / Maximum delay in milliseconds
  },
  // 心跳配置 / Heartbeat configuration
  heartbeat: {
    enabled: true,            // 是否启用心跳 / Enable heartbeat
    interval: 20000,          // 心跳间隔毫秒 / Heartbeat interval in milliseconds
    timeout: 30000,           // 心跳超时毫秒 / Heartbeat timeout in milliseconds
  },
  // 流配置 / Stream configuration
  stream: {
    maxLen: 10000,            // 最大流长度 / Maximum stream length
    trimApprox: true,         // 近似裁剪 / Approximate trimming
  },
};

/**
 * 实时行情数据引擎类
 * Real-time Market Data Engine Class
 *
 * 同时管理多个交易所的 WebSocket 连接，提供统一的行情数据接口
 * Manages WebSocket connections for multiple exchanges, provides unified market data interface
 */
export class MarketDataEngine extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   * @param {Object} config.redis - Redis 配置 / Redis configuration
   * @param {Object} config.reconnect - 重连配置 / Reconnection configuration
   * @param {Object} config.heartbeat - 心跳配置 / Heartbeat configuration
   * @param {Object} config.stream - 流配置 / Stream configuration
   * @param {Array<string>} config.exchanges - 启用的交易所列表 / Enabled exchanges
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 合并默认配置 / Merge default configuration
    this.config = {
      // Redis 配置 / Redis configuration
      redis: { ...DEFAULT_CONFIG.redis, ...config.redis },
      // 重连配置 / Reconnection configuration
      reconnect: { ...DEFAULT_CONFIG.reconnect, ...config.reconnect },
      // 心跳配置 / Heartbeat configuration
      heartbeat: { ...DEFAULT_CONFIG.heartbeat, ...config.heartbeat },
      // 流配置 / Stream configuration
      stream: { ...DEFAULT_CONFIG.stream, ...config.stream },
      // 启用的交易所 / Enabled exchanges
      exchanges: config.exchanges || ['binance', 'bybit', 'okx'],
      // 交易类型 / Trading type
      tradingType: config.tradingType || 'futures',
    };

    // ============================================
    // 内部状态 / Internal State
    // ============================================

    // WebSocket 连接映射 { exchange: WebSocket } / WebSocket connection map
    this.connections = new Map();

    // 连接状态映射 { exchange: { connected, reconnecting, attempt } } / Connection status map
    this.connectionStatus = new Map();

    // 订阅映射 { exchange: Set<subscriptionKey> } / Subscription map
    this.subscriptions = new Map();

    // 心跳定时器映射 { exchange: timer } / Heartbeat timer map
    this.heartbeatTimers = new Map();

    // 时间同步数据 { exchange: { offset, lastSync } } / Time sync data
    this.timeSync = new Map();

    // Redis 客户端实例 / Redis client instance
    this.redis = null;

    // Redis 发布客户端 (用于 pub/sub) / Redis publish client (for pub/sub)
    this.redisPub = null;

    // 运行状态标志 / Running status flag
    this.running = false;

    // 初始化状态标志 / Initialization status flag
    this.initialized = false;

    // 数据缓存 / Data cache
    this.cache = {
      tickers: new Map(),     // { symbol: ticker } 行情缓存 / Ticker cache
      depths: new Map(),      // { symbol: depth } 深度缓存 / Depth cache
      fundingRates: new Map(), // { symbol: fundingRate } 资金费率缓存 / Funding rate cache
      klines: new Map(),      // { symbol: kline[] } K线缓存 / Kline cache
    };

    // 统计信息 / Statistics
    this.stats = {
      messagesReceived: 0,    // 接收的消息数 / Messages received
      messagesPublished: 0,   // 发布的消息数 / Messages published
      errors: 0,              // 错误数 / Error count
      reconnections: 0,       // 重连次数 / Reconnection count
      startTime: null,        // 启动时间 / Start time
    };

    // 日志前缀 / Log prefix
    this.logPrefix = '[MarketDataEngine]';

    // 初始化每个交易所的状态 / Initialize status for each exchange
    this._initializeExchangeStatus();
  }

  // ============================================
  // 公共方法 / Public Methods
  // ============================================

  /**
   * 启动行情引擎
   * Start market data engine
   *
   * @returns {Promise<void>}
   */
  async start() {
    // 如果已经运行，直接返回 / If already running, return
    if (this.running) {
      console.log(`${this.logPrefix} 引擎已在运行 / Engine already running`);
      return;
    }

    console.log(`${this.logPrefix} 正在启动行情引擎... / Starting market data engine...`);

    try {
      // 1. 初始化 Redis 连接 / Initialize Redis connection
      await this._initializeRedis();

      // 2. 连接所有交易所 WebSocket / Connect to all exchange WebSockets
      await this._connectAllExchanges();

      // 3. 更新运行状态 / Update running status
      this.running = true;

      // 4. 记录启动时间 / Record start time
      this.stats.startTime = Date.now();

      // 5. 标记为已初始化 / Mark as initialized
      this.initialized = true;

      // 6. 发出启动事件 / Emit start event
      this.emit('started');

      console.log(`${this.logPrefix} 行情引擎启动成功 / Market data engine started successfully`);

    } catch (error) {
      // 记录错误 / Log error
      console.error(`${this.logPrefix} 启动失败 / Start failed:`, error.message);

      // 发出错误事件 / Emit error event
      this.emit('error', error);

      // 抛出错误 / Throw error
      throw error;
    }
  }

  /**
   * 停止行情引擎
   * Stop market data engine
   *
   * @returns {Promise<void>}
   */
  async stop() {
    // 如果未运行，直接返回 / If not running, return
    if (!this.running) {
      console.log(`${this.logPrefix} 引擎未在运行 / Engine not running`);
      return;
    }

    console.log(`${this.logPrefix} 正在停止行情引擎... / Stopping market data engine...`);

    // 更新运行状态 / Update running status
    this.running = false;

    // 1. 断开所有 WebSocket 连接 / Disconnect all WebSocket connections
    await this._disconnectAllExchanges();

    // 2. 关闭 Redis 连接 / Close Redis connections
    await this._closeRedis();

    // 3. 清理心跳定时器 / Clear heartbeat timers
    this._clearAllHeartbeats();

    // 4. 发出停止事件 / Emit stop event
    this.emit('stopped');

    console.log(`${this.logPrefix} 行情引擎已停止 / Market data engine stopped`);
  }

  /**
   * 订阅交易对行情
   * Subscribe to symbol market data
   *
   * @param {string} symbol - 交易对 (如 BTC/USDT) / Trading pair (e.g., BTC/USDT)
   * @param {Array<string>} dataTypes - 数据类型数组 / Data type array
   * @param {Array<string>} exchanges - 交易所数组 (可选，默认所有) / Exchange array (optional, default all)
   * @returns {Promise<void>}
   *
   * @example
   * // 订阅 BTC/USDT 的所有数据类型在所有交易所 / Subscribe to all data types for BTC/USDT on all exchanges
   * await engine.subscribe('BTC/USDT', ['ticker', 'depth', 'trade', 'fundingRate']);
   *
   * // 只在 Binance 订阅行情 / Subscribe to ticker only on Binance
   * await engine.subscribe('BTC/USDT', ['ticker'], ['binance']);
   */
  async subscribe(symbol, dataTypes = [DATA_TYPES.TICKER], exchanges = null) {
    // 使用所有启用的交易所或指定的交易所 / Use all enabled exchanges or specified ones
    const targetExchanges = exchanges || this.config.exchanges;

    // 验证数据类型 / Validate data types
    const validDataTypes = Object.values(DATA_TYPES);
    for (const dt of dataTypes) {
      if (!validDataTypes.includes(dt)) {
        throw new Error(`无效的数据类型 / Invalid data type: ${dt}`);
      }
    }

    console.log(`${this.logPrefix} 订阅 / Subscribing: ${symbol} [${dataTypes.join(', ')}] on [${targetExchanges.join(', ')}]`);

    // 在每个交易所订阅 / Subscribe on each exchange
    for (const exchange of targetExchanges) {
      // 检查交易所是否启用 / Check if exchange is enabled
      if (!this.connections.has(exchange)) {
        console.warn(`${this.logPrefix} 交易所未连接 / Exchange not connected: ${exchange}`);
        continue;
      }

      // 订阅每种数据类型 / Subscribe to each data type
      for (const dataType of dataTypes) {
        await this._subscribeToExchange(exchange, symbol, dataType);
      }
    }
  }

  /**
   * 取消订阅交易对行情
   * Unsubscribe from symbol market data
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array<string>} dataTypes - 数据类型数组 / Data type array
   * @param {Array<string>} exchanges - 交易所数组 (可选) / Exchange array (optional)
   * @returns {Promise<void>}
   */
  async unsubscribe(symbol, dataTypes = [DATA_TYPES.TICKER], exchanges = null) {
    // 使用所有启用的交易所或指定的交易所 / Use all enabled exchanges or specified ones
    const targetExchanges = exchanges || this.config.exchanges;

    console.log(`${this.logPrefix} 取消订阅 / Unsubscribing: ${symbol} [${dataTypes.join(', ')}] from [${targetExchanges.join(', ')}]`);

    // 在每个交易所取消订阅 / Unsubscribe on each exchange
    for (const exchange of targetExchanges) {
      // 检查交易所是否启用 / Check if exchange is enabled
      if (!this.connections.has(exchange)) {
        continue;
      }

      // 取消订阅每种数据类型 / Unsubscribe from each data type
      for (const dataType of dataTypes) {
        await this._unsubscribeFromExchange(exchange, symbol, dataType);
      }
    }
  }

  /**
   * 批量订阅多个交易对
   * Batch subscribe to multiple symbols
   *
   * @param {Array<string>} symbols - 交易对数组 / Trading pair array
   * @param {Array<string>} dataTypes - 数据类型数组 / Data type array
   * @param {Array<string>} exchanges - 交易所数组 (可选) / Exchange array (optional)
   * @returns {Promise<void>}
   */
  async batchSubscribe(symbols, dataTypes = [DATA_TYPES.TICKER], exchanges = null) {
    console.log(`${this.logPrefix} 批量订阅 / Batch subscribing: ${symbols.length} symbols`);

    // 并行订阅所有交易对 / Subscribe to all symbols in parallel
    const promises = symbols.map(symbol => this.subscribe(symbol, dataTypes, exchanges));

    // 等待所有订阅完成 / Wait for all subscriptions to complete
    await Promise.all(promises);
  }

  /**
   * 批量取消订阅多个交易对
   * Batch unsubscribe from multiple symbols
   *
   * @param {Array<string>} symbols - 交易对数组 / Trading pair array
   * @param {Array<string>} dataTypes - 数据类型数组 / Data type array
   * @param {Array<string>} exchanges - 交易所数组 (可选) / Exchange array (optional)
   * @returns {Promise<void>}
   */
  async batchUnsubscribe(symbols, dataTypes = [DATA_TYPES.TICKER], exchanges = null) {
    console.log(`${this.logPrefix} 批量取消订阅 / Batch unsubscribing: ${symbols.length} symbols`);

    // 并行取消订阅所有交易对 / Unsubscribe from all symbols in parallel
    const promises = symbols.map(symbol => this.unsubscribe(symbol, dataTypes, exchanges));

    // 等待所有取消订阅完成 / Wait for all unsubscriptions to complete
    await Promise.all(promises);
  }

  /**
   * 获取缓存的行情数据
   * Get cached ticker data
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} exchange - 交易所 (可选) / Exchange (optional)
   * @returns {Object|null} 行情数据 / Ticker data
   */
  getTicker(symbol, exchange = null) {
    // 构建缓存键 / Build cache key
    const key = exchange ? `${exchange}:${symbol}` : symbol;

    // 返回缓存数据 / Return cached data
    return this.cache.tickers.get(key) || null;
  }

  /**
   * 获取缓存的深度数据
   * Get cached depth data
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} exchange - 交易所 (可选) / Exchange (optional)
   * @returns {Object|null} 深度数据 / Depth data
   */
  getDepth(symbol, exchange = null) {
    // 构建缓存键 / Build cache key
    const key = exchange ? `${exchange}:${symbol}` : symbol;

    // 返回缓存数据 / Return cached data
    return this.cache.depths.get(key) || null;
  }

  /**
   * 获取缓存的资金费率
   * Get cached funding rate
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} exchange - 交易所 (可选) / Exchange (optional)
   * @returns {Object|null} 资金费率数据 / Funding rate data
   */
  getFundingRate(symbol, exchange = null) {
    // 构建缓存键 / Build cache key
    const key = exchange ? `${exchange}:${symbol}` : symbol;

    // 返回缓存数据 / Return cached data
    return this.cache.fundingRates.get(key) || null;
  }

  /**
   * 获取所有交易所的连接状态
   * Get connection status for all exchanges
   *
   * @returns {Object} 连接状态对象 / Connection status object
   */
  getConnectionStatus() {
    // 构建状态对象 / Build status object
    const status = {};

    // 遍历所有交易所 / Iterate all exchanges
    for (const [exchange, state] of this.connectionStatus) {
      status[exchange] = {
        connected: state.connected,       // 是否已连接 / Is connected
        reconnecting: state.reconnecting, // 是否正在重连 / Is reconnecting
        attempt: state.attempt,           // 当前重连次数 / Current reconnection attempt
      };
    }

    return status;
  }

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息对象 / Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      // 运行时长秒数 / Running duration in seconds
      uptimeSeconds: this.stats.startTime
        ? Math.floor((Date.now() - this.stats.startTime) / 1000)
        : 0,
      // 每个交易所的订阅数 / Subscription count per exchange
      subscriptions: this._getSubscriptionCounts(),
    };
  }

  // ============================================
  // 私有方法 - 初始化 / Private Methods - Initialization
  // ============================================

  /**
   * 初始化每个交易所的状态
   * Initialize status for each exchange
   * @private
   */
  _initializeExchangeStatus() {
    // 遍历所有启用的交易所 / Iterate all enabled exchanges
    for (const exchange of this.config.exchanges) {
      // 初始化连接状态 / Initialize connection status
      this.connectionStatus.set(exchange, {
        connected: false,       // 是否已连接 / Is connected
        reconnecting: false,    // 是否正在重连 / Is reconnecting
        attempt: 0,             // 重连次数 / Reconnection attempt count
      });

      // 初始化订阅集合 / Initialize subscription set
      this.subscriptions.set(exchange, new Set());

      // 初始化时间同步数据 / Initialize time sync data
      this.timeSync.set(exchange, {
        offset: 0,              // 时间偏移毫秒 / Time offset in milliseconds
        lastSync: 0,            // 最后同步时间 / Last sync time
      });
    }
  }

  /**
   * 初始化 Redis 连接
   * Initialize Redis connection
   * @private
   */
  async _initializeRedis() {
    console.log(`${this.logPrefix} 正在连接 Redis... / Connecting to Redis...`);

    // 创建 Redis 客户端 / Create Redis client
    this.redis = new Redis({
      host: this.config.redis.host,       // 主机 / Host
      port: this.config.redis.port,       // 端口 / Port
      password: this.config.redis.password, // 密码 / Password
      db: this.config.redis.db,           // 数据库 / Database
      keyPrefix: this.config.redis.keyPrefix, // 键前缀 / Key prefix
      // 连接选项 / Connection options
      retryStrategy: (times) => {
        // 重试策略: 指数退避，最大 30 秒 / Retry strategy: exponential backoff, max 30s
        const delay = Math.min(times * 100, 30000);
        return delay;
      },
      maxRetriesPerRequest: 3,            // 每请求最大重试次数 / Max retries per request
      enableReadyCheck: true,             // 启用就绪检查 / Enable ready check
      lazyConnect: false,                 // 立即连接 / Connect immediately
    });

    // 创建发布专用客户端 / Create dedicated publish client
    this.redisPub = this.redis.duplicate();

    // 监听 Redis 错误 / Listen for Redis errors
    this.redis.on('error', (error) => {
      console.error(`${this.logPrefix} Redis 错误 / Redis error:`, error.message);
      this.stats.errors++;
    });

    // 监听 Redis 连接 / Listen for Redis connection
    this.redis.on('connect', () => {
      console.log(`${this.logPrefix} Redis 已连接 / Redis connected`);
    });

    // 等待 Redis 就绪 / Wait for Redis ready
    await new Promise((resolve, reject) => {
      // 如果已经就绪 / If already ready
      if (this.redis.status === 'ready') {
        resolve();
        return;
      }

      // 监听就绪事件 / Listen for ready event
      this.redis.once('ready', resolve);

      // 监听错误事件 / Listen for error event
      this.redis.once('error', reject);

      // 超时处理 / Timeout handling
      setTimeout(() => {
        reject(new Error('Redis 连接超时 / Redis connection timeout'));
      }, 10000);
    });

    console.log(`${this.logPrefix} Redis 连接成功 / Redis connected successfully`);
  }

  /**
   * 关闭 Redis 连接
   * Close Redis connection
   * @private
   */
  async _closeRedis() {
    // 关闭主客户端 / Close main client
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    // 关闭发布客户端 / Close publish client
    if (this.redisPub) {
      await this.redisPub.quit();
      this.redisPub = null;
    }

    console.log(`${this.logPrefix} Redis 连接已关闭 / Redis connections closed`);
  }

  // ============================================
  // 私有方法 - WebSocket 连接 / Private Methods - WebSocket Connection
  // ============================================

  /**
   * 连接所有交易所
   * Connect to all exchanges
   * @private
   */
  async _connectAllExchanges() {
    console.log(`${this.logPrefix} 正在连接所有交易所... / Connecting to all exchanges...`);

    // 并行连接所有交易所 / Connect to all exchanges in parallel
    const promises = this.config.exchanges.map(exchange =>
      this._connectExchange(exchange)
    );

    // 等待所有连接完成 / Wait for all connections to complete
    await Promise.allSettled(promises);
  }

  /**
   * 断开所有交易所连接
   * Disconnect from all exchanges
   * @private
   */
  async _disconnectAllExchanges() {
    console.log(`${this.logPrefix} 正在断开所有交易所连接... / Disconnecting from all exchanges...`);

    // 遍历所有连接 / Iterate all connections
    for (const [exchange, ws] of this.connections) {
      // 停止心跳 / Stop heartbeat
      this._stopHeartbeat(exchange);

      // 关闭连接 / Close connection
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Client disconnect');
      }

      // 更新状态 / Update status
      const status = this.connectionStatus.get(exchange);
      if (status) {
        status.connected = false;
        status.reconnecting = false;
      }
    }

    // 清空连接映射 / Clear connections map
    this.connections.clear();
  }

  /**
   * 连接到指定交易所
   * Connect to specified exchange
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  async _connectExchange(exchange) {
    // 获取 WebSocket URL / Get WebSocket URL
    const wsUrl = this._getWsUrl(exchange);

    console.log(`${this.logPrefix} 正在连接 / Connecting to ${exchange}: ${wsUrl}`);

    return new Promise((resolve, reject) => {
      try {
        // 创建 WebSocket 连接 / Create WebSocket connection
        const ws = new WebSocket(wsUrl);

        // 连接打开事件 / Connection open event
        ws.on('open', () => {
          console.log(`${this.logPrefix} ${exchange} WebSocket 已连接 / WebSocket connected`);

          // 存储连接 / Store connection
          this.connections.set(exchange, ws);

          // 更新连接状态 / Update connection status
          const status = this.connectionStatus.get(exchange);
          status.connected = true;
          status.reconnecting = false;
          status.attempt = 0;

          // 同步时间 / Sync time
          this._syncTime(exchange);

          // 启动心跳 / Start heartbeat
          this._startHeartbeat(exchange);

          // 重新订阅 / Resubscribe
          this._resubscribe(exchange);

          // 发出连接事件 / Emit connected event
          this.emit('connected', { exchange });

          // 解析 Promise / Resolve promise
          resolve();
        });

        // 接收消息事件 / Message received event
        ws.on('message', (data) => {
          // 处理消息 / Handle message
          this._handleMessage(exchange, data);
        });

        // 错误事件 / Error event
        ws.on('error', (error) => {
          console.error(`${this.logPrefix} ${exchange} WebSocket 错误 / WebSocket error:`, error.message);

          // 增加错误计数 / Increment error count
          this.stats.errors++;

          // 发出错误事件 / Emit error event
          this.emit('error', { exchange, error });

          // 如果尚未连接，拒绝 Promise / If not connected yet, reject promise
          const status = this.connectionStatus.get(exchange);
          if (!status.connected) {
            reject(error);
          }
        });

        // 关闭事件 / Close event
        ws.on('close', (code, reason) => {
          console.log(`${this.logPrefix} ${exchange} WebSocket 关闭 / WebSocket closed - Code: ${code}`);

          // 更新连接状态 / Update connection status
          const status = this.connectionStatus.get(exchange);
          status.connected = false;

          // 停止心跳 / Stop heartbeat
          this._stopHeartbeat(exchange);

          // 从连接映射中移除 / Remove from connections map
          this.connections.delete(exchange);

          // 发出断开连接事件 / Emit disconnected event
          this.emit('disconnected', { exchange, code, reason: reason.toString() });

          // 尝试重连 / Attempt reconnection
          if (this.running && this.config.reconnect.enabled) {
            this._attemptReconnect(exchange);
          }
        });

        // Pong 事件 (心跳响应) / Pong event (heartbeat response)
        ws.on('pong', () => {
          // 更新时间同步 / Update time sync
          const sync = this.timeSync.get(exchange);
          if (sync) {
            sync.lastSync = Date.now();
          }
        });

      } catch (error) {
        // 记录错误 / Log error
        console.error(`${this.logPrefix} 连接 ${exchange} 失败 / Failed to connect to ${exchange}:`, error.message);

        // 拒绝 Promise / Reject promise
        reject(error);
      }
    });
  }

  /**
   * 获取交易所的 WebSocket URL
   * Get WebSocket URL for exchange
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @returns {string} WebSocket URL
   * @private
   */
  _getWsUrl(exchange) {
    // 获取交易类型 / Get trading type
    const tradingType = this.config.tradingType;

    // 根据交易所返回对应 URL / Return URL based on exchange
    switch (exchange) {
      case 'binance':
        // Binance: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot'
          ? WS_ENDPOINTS.binance.spot
          : WS_ENDPOINTS.binance.futures;

      case 'bybit':
        // Bybit: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot'
          ? WS_ENDPOINTS.bybit.spot
          : WS_ENDPOINTS.bybit.linear;

      case 'okx':
        // OKX: 使用公共端点 / Use public endpoint
        return WS_ENDPOINTS.okx.public;

      case 'deribit':
        // Deribit: 根据 sandbox 配置选择端点 / Select endpoint based on sandbox config
        return this.config.sandbox
          ? WS_ENDPOINTS.deribit.testnet
          : WS_ENDPOINTS.deribit.public;

      default:
        // 不支持的交易所 / Unsupported exchange
        throw new Error(`不支持的交易所 / Unsupported exchange: ${exchange}`);
    }
  }

  /**
   * 尝试重新连接
   * Attempt reconnection
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _attemptReconnect(exchange) {
    // 获取连接状态 / Get connection status
    const status = this.connectionStatus.get(exchange);

    // 如果正在重连，返回 / If already reconnecting, return
    if (status.reconnecting) {
      return;
    }

    // 检查重连次数 / Check reconnection attempts
    if (status.attempt >= this.config.reconnect.maxAttempts) {
      console.error(`${this.logPrefix} ${exchange} 达到最大重连次数 / Maximum reconnection attempts reached`);

      // 发出重连失败事件 / Emit reconnection failed event
      this.emit('reconnectFailed', { exchange });
      return;
    }

    // 更新重连状态 / Update reconnection status
    status.reconnecting = true;
    status.attempt++;
    this.stats.reconnections++;

    // 计算延迟 (指数退避 + 随机抖动) / Calculate delay (exponential backoff + random jitter)
    const baseDelay = this.config.reconnect.baseDelay;
    const maxDelay = this.config.reconnect.maxDelay;
    const exponentialDelay = baseDelay * Math.pow(2, status.attempt - 1);
    const jitter = Math.random() * 1000;  // 0-1 秒随机抖动 / 0-1 second random jitter
    const delay = Math.min(exponentialDelay + jitter, maxDelay);

    console.log(`${this.logPrefix} ${exchange} ${delay.toFixed(0)}ms 后尝试第 ${status.attempt} 次重连 / Attempting reconnection #${status.attempt} in ${delay.toFixed(0)}ms`);

    // 延迟重连 / Delayed reconnection
    setTimeout(async () => {
      // 如果引擎已停止，不重连 / If engine stopped, don't reconnect
      if (!this.running) {
        status.reconnecting = false;
        return;
      }

      try {
        // 尝试连接 / Attempt connection
        await this._connectExchange(exchange);

      } catch (error) {
        // 重连失败，继续尝试 / Reconnection failed, continue trying
        console.error(`${this.logPrefix} ${exchange} 重连失败 / Reconnection failed:`, error.message);
        status.reconnecting = false;

        // 继续重连 / Continue reconnecting
        this._attemptReconnect(exchange);
      }
    }, delay);
  }

  // ============================================
  // 私有方法 - 心跳 / Private Methods - Heartbeat
  // ============================================

  /**
   * 启动心跳
   * Start heartbeat
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _startHeartbeat(exchange) {
    // 如果心跳未启用，返回 / If heartbeat not enabled, return
    if (!this.config.heartbeat.enabled) {
      return;
    }

    // 停止现有心跳 / Stop existing heartbeat
    this._stopHeartbeat(exchange);

    // 获取 WebSocket 连接 / Get WebSocket connection
    const ws = this.connections.get(exchange);
    if (!ws) {
      return;
    }

    // 创建心跳定时器 / Create heartbeat timer
    const timer = setInterval(() => {
      // 检查连接状态 / Check connection status
      if (ws.readyState === WebSocket.OPEN) {
        // 根据交易所发送不同的心跳 / Send different heartbeat based on exchange
        if (exchange === 'bybit') {
          // Bybit 使用 ping 消息 / Bybit uses ping message
          ws.send(JSON.stringify({ op: 'ping' }));
        } else if (exchange === 'okx') {
          // OKX 使用 ping 字符串 / OKX uses ping string
          ws.send('ping');
        } else if (exchange === 'deribit') {
          // Deribit 使用 JSON-RPC 2.0 格式的 test 方法 / Deribit uses JSON-RPC 2.0 test method
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'public/test',
            id: Date.now(),
            params: {},
          }));
        } else {
          // Binance 使用 WebSocket ping / Binance uses WebSocket ping
          ws.ping();
        }
      }
    }, this.config.heartbeat.interval);

    // 存储定时器 / Store timer
    this.heartbeatTimers.set(exchange, timer);
  }

  /**
   * 停止心跳
   * Stop heartbeat
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _stopHeartbeat(exchange) {
    // 获取定时器 / Get timer
    const timer = this.heartbeatTimers.get(exchange);

    // 清除定时器 / Clear timer
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(exchange);
    }
  }

  /**
   * 清除所有心跳
   * Clear all heartbeats
   * @private
   */
  _clearAllHeartbeats() {
    // 遍历所有定时器 / Iterate all timers
    for (const [exchange, timer] of this.heartbeatTimers) {
      clearInterval(timer);
    }

    // 清空映射 / Clear map
    this.heartbeatTimers.clear();
  }

  // ============================================
  // 私有方法 - 订阅 / Private Methods - Subscription
  // ============================================

  /**
   * 在指定交易所订阅
   * Subscribe on specified exchange
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @private
   */
  async _subscribeToExchange(exchange, symbol, dataType) {
    // 获取 WebSocket 连接 / Get WebSocket connection
    const ws = this.connections.get(exchange);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(`${this.logPrefix} ${exchange} 未连接，跳过订阅 / Not connected, skipping subscription`);
      return;
    }

    // 构建订阅键 / Build subscription key
    const subKey = `${dataType}:${symbol}`;

    // 获取订阅集合 / Get subscription set
    const subs = this.subscriptions.get(exchange);

    // 如果已订阅，跳过 / If already subscribed, skip
    if (subs.has(subKey)) {
      return;
    }

    // 添加到订阅集合 / Add to subscription set
    subs.add(subKey);

    // 构建订阅消息 / Build subscription message
    const message = this._buildSubscribeMessage(exchange, symbol, dataType);

    // 发送订阅消息 / Send subscription message
    ws.send(JSON.stringify(message));

    console.log(`${this.logPrefix} ${exchange} 已订阅 / Subscribed: ${subKey}`);
  }

  /**
   * 在指定交易所取消订阅
   * Unsubscribe from specified exchange
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @private
   */
  async _unsubscribeFromExchange(exchange, symbol, dataType) {
    // 获取 WebSocket 连接 / Get WebSocket connection
    const ws = this.connections.get(exchange);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // 构建订阅键 / Build subscription key
    const subKey = `${dataType}:${symbol}`;

    // 获取订阅集合 / Get subscription set
    const subs = this.subscriptions.get(exchange);

    // 如果未订阅，跳过 / If not subscribed, skip
    if (!subs.has(subKey)) {
      return;
    }

    // 从订阅集合移除 / Remove from subscription set
    subs.delete(subKey);

    // 构建取消订阅消息 / Build unsubscribe message
    const message = this._buildUnsubscribeMessage(exchange, symbol, dataType);

    // 发送取消订阅消息 / Send unsubscribe message
    ws.send(JSON.stringify(message));

    console.log(`${this.logPrefix} ${exchange} 已取消订阅 / Unsubscribed: ${subKey}`);
  }

  /**
   * 重新订阅
   * Resubscribe to channels
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _resubscribe(exchange) {
    // 获取订阅集合 / Get subscription set
    const subs = this.subscriptions.get(exchange);
    if (!subs || subs.size === 0) {
      return;
    }

    console.log(`${this.logPrefix} ${exchange} 正在重新订阅 ${subs.size} 个频道 / Resubscribing to ${subs.size} channels`);

    // 遍历所有订阅 / Iterate all subscriptions
    for (const subKey of subs) {
      // 解析订阅键 / Parse subscription key
      const [dataType, symbol] = subKey.split(':');

      // 临时移除订阅键以允许重新订阅 / Temporarily remove to allow resubscription
      subs.delete(subKey);

      // 重新订阅 / Resubscribe
      this._subscribeToExchange(exchange, symbol, dataType);
    }
  }

  /**
   * 构建订阅消息
   * Build subscription message
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildSubscribeMessage(exchange, symbol, dataType) {
    // 根据交易所构建不同的消息 / Build different messages for different exchanges
    switch (exchange) {
      case 'binance':
        return this._buildBinanceSubscribeMessage(symbol, dataType);

      case 'bybit':
        return this._buildBybitSubscribeMessage(symbol, dataType);

      case 'okx':
        return this._buildOKXSubscribeMessage(symbol, dataType);

      case 'deribit':
        return this._buildDeribitSubscribeMessage(symbol, dataType);

      default:
        throw new Error(`不支持的交易所 / Unsupported exchange: ${exchange}`);
    }
  }

  /**
   * 构建取消订阅消息
   * Build unsubscribe message
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 取消订阅消息对象 / Unsubscribe message object
   * @private
   */
  _buildUnsubscribeMessage(exchange, symbol, dataType) {
    // 获取订阅消息 / Get subscribe message
    const subMsg = this._buildSubscribeMessage(exchange, symbol, dataType);

    // 根据交易所修改操作类型 / Modify operation type based on exchange
    switch (exchange) {
      case 'binance':
        return { ...subMsg, method: 'UNSUBSCRIBE' };

      case 'bybit':
        return { ...subMsg, op: 'unsubscribe' };

      case 'okx':
        return { ...subMsg, op: 'unsubscribe' };

      case 'deribit':
        // Deribit 取消订阅只需修改方法名 / Deribit unsubscribe just needs to change method name
        return {
          ...subMsg,
          method: subMsg.method.replace('subscribe', 'unsubscribe'),
        };

      default:
        return subMsg;
    }
  }

  /**
   * 构建 Binance 订阅消息
   * Build Binance subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildBinanceSubscribeMessage(symbol, dataType) {
    // 转换交易对格式: BTC/USDT -> btcusdt / Convert symbol format
    const binanceSymbol = symbol.replace('/', '').toLowerCase();

    // 根据数据类型构建流名称 / Build stream name based on data type
    let stream;
    switch (dataType) {
      case DATA_TYPES.TICKER:
        // 24 小时行情 / 24h ticker
        stream = `${binanceSymbol}@ticker`;
        break;

      case DATA_TYPES.DEPTH:
        // 深度数据 (20 档，100ms 更新) / Depth data (20 levels, 100ms update)
        stream = `${binanceSymbol}@depth20@100ms`;
        break;

      case DATA_TYPES.TRADE:
        // 逐笔成交 / Trade data
        stream = `${binanceSymbol}@trade`;
        break;

      case DATA_TYPES.FUNDING_RATE:
        // 标记价格和资金费率 / Mark price and funding rate
        stream = `${binanceSymbol}@markPrice@1s`;
        break;

      case DATA_TYPES.KLINE:
        // K线数据 (1小时) / Kline data (1 hour)
        stream = `${binanceSymbol}@kline_1h`;
        break;

      default:
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`);
    }

    // 返回订阅消息 / Return subscription message
    return {
      method: 'SUBSCRIBE',    // 订阅操作 / Subscribe operation
      params: [stream],       // 流名称数组 / Stream name array
      id: Date.now(),         // 请求 ID / Request ID
    };
  }

  /**
   * 构建 Bybit 订阅消息
   * Build Bybit subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildBybitSubscribeMessage(symbol, dataType) {
    // 转换交易对格式: BTC/USDT -> BTCUSDT / Convert symbol format
    const bybitSymbol = symbol.replace('/', '');

    // 根据数据类型构建主题 / Build topic based on data type
    let topic;
    switch (dataType) {
      case DATA_TYPES.TICKER:
        // 行情数据 / Ticker data
        topic = `tickers.${bybitSymbol}`;
        break;

      case DATA_TYPES.DEPTH:
        // 深度数据 (50 档) / Depth data (50 levels)
        topic = `orderbook.50.${bybitSymbol}`;
        break;

      case DATA_TYPES.TRADE:
        // 逐笔成交 / Trade data
        topic = `publicTrade.${bybitSymbol}`;
        break;

      case DATA_TYPES.FUNDING_RATE:
        // 行情数据 (包含资金费率) / Ticker data (includes funding rate)
        topic = `tickers.${bybitSymbol}`;
        break;

      case DATA_TYPES.KLINE:
        // K线数据 (60分钟) / Kline data (60 minutes)
        topic = `kline.60.${bybitSymbol}`;
        break;

      default:
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`);
    }

    // 返回订阅消息 / Return subscription message
    return {
      op: 'subscribe',        // 订阅操作 / Subscribe operation
      args: [topic],          // 主题数组 / Topic array
    };
  }

  /**
   * 构建 OKX 订阅消息
   * Build OKX subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildOKXSubscribeMessage(symbol, dataType) {
    // 转换交易对格式: BTC/USDT -> BTC-USDT-SWAP / Convert symbol format
    // 对于永续合约添加 -SWAP 后缀 / Add -SWAP suffix for perpetual
    const okxSymbol = this.config.tradingType === 'spot'
      ? symbol.replace('/', '-')
      : `${symbol.replace('/', '-')}-SWAP`;

    // 根据数据类型构建参数 / Build args based on data type
    let args;
    switch (dataType) {
      case DATA_TYPES.TICKER:
        // 行情数据 / Ticker data
        args = [{ channel: 'tickers', instId: okxSymbol }];
        break;

      case DATA_TYPES.DEPTH:
        // 深度数据 (5 档快速更新) / Depth data (5 levels fast update)
        args = [{ channel: 'books5', instId: okxSymbol }];
        break;

      case DATA_TYPES.TRADE:
        // 逐笔成交 / Trade data
        args = [{ channel: 'trades', instId: okxSymbol }];
        break;

      case DATA_TYPES.FUNDING_RATE:
        // 资金费率 / Funding rate
        args = [{ channel: 'funding-rate', instId: okxSymbol }];
        break;

      case DATA_TYPES.KLINE:
        // K线数据 (1小时) / Kline data (1 hour)
        args = [{ channel: 'candle1H', instId: okxSymbol }];
        break;

      default:
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`);
    }

    // 返回订阅消息 / Return subscription message
    return {
      op: 'subscribe',        // 订阅操作 / Subscribe operation
      args,                   // 参数数组 / Args array
    };
  }

  /**
   * 构建 Deribit 订阅消息
   * Build Deribit subscription message
   *
   * Deribit 使用 JSON-RPC 2.0 格式
   * Deribit uses JSON-RPC 2.0 format
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildDeribitSubscribeMessage(symbol, dataType) {
    // 转换交易对格式: BTC/USDT -> BTC-PERPETUAL / Convert symbol format
    // Deribit 永续合约格式: BTC-PERPETUAL, ETH-PERPETUAL / Deribit perpetual format
    const base = symbol.split('/')[0];
    const deribitSymbol = `${base}-PERPETUAL`;

    // 根据数据类型构建频道 / Build channel based on data type
    let channels = [];
    switch (dataType) {
      case DATA_TYPES.TICKER:
        // 行情数据 / Ticker data
        channels = [`ticker.${deribitSymbol}.100ms`];
        break;

      case DATA_TYPES.DEPTH:
        // 深度数据 (10 档) / Depth data (10 levels)
        channels = [`book.${deribitSymbol}.10.100ms`];
        break;

      case DATA_TYPES.TRADE:
        // 逐笔成交 / Trade data
        channels = [`trades.${deribitSymbol}.100ms`];
        break;

      case DATA_TYPES.FUNDING_RATE:
        // 永续合约状态 (包含资金费率) / Perpetual state (includes funding rate)
        channels = [`perpetual.${deribitSymbol}.100ms`];
        break;

      case DATA_TYPES.KLINE:
        // K线数据 (1小时) / Kline data (1 hour)
        channels = [`chart.trades.${deribitSymbol}.60`];
        break;

      default:
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`);
    }

    // 返回 JSON-RPC 2.0 格式的订阅消息 / Return JSON-RPC 2.0 format subscription message
    return {
      jsonrpc: '2.0',               // JSON-RPC 版本 / JSON-RPC version
      method: 'public/subscribe',   // 订阅方法 / Subscribe method
      id: Date.now(),               // 请求 ID / Request ID
      params: {
        channels,                   // 频道数组 / Channel array
      },
    };
  }

  /**
   * 获取订阅数量统计
   * Get subscription counts
   *
   * @returns {Object} 每个交易所的订阅数 / Subscription count per exchange
   * @private
   */
  _getSubscriptionCounts() {
    const counts = {};

    // 遍历所有交易所 / Iterate all exchanges
    for (const [exchange, subs] of this.subscriptions) {
      counts[exchange] = subs.size;
    }

    return counts;
  }

  // ============================================
  // 私有方法 - 消息处理 / Private Methods - Message Handling
  // ============================================

  /**
   * 处理接收到的消息
   * Handle received message
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Buffer|string} data - 原始数据 / Raw data
   * @private
   */
  _handleMessage(exchange, data) {
    // 增加消息计数 / Increment message count
    this.stats.messagesReceived++;

    try {
      // 转换为字符串 / Convert to string
      const dataStr = data.toString();

      // 处理非 JSON 响应 (如 OKX 的 "pong") / Handle non-JSON responses (like OKX's "pong")
      if (dataStr === 'pong' || dataStr === 'ping') {
        // 心跳响应，忽略 / Heartbeat response, ignore
        return;
      }

      // 解析 JSON 数据 / Parse JSON data
      const message = JSON.parse(dataStr);

      // 根据交易所处理消息 / Handle message based on exchange
      switch (exchange) {
        case 'binance':
          this._handleBinanceMessage(message);
          break;

        case 'bybit':
          this._handleBybitMessage(message);
          break;

        case 'okx':
          this._handleOKXMessage(message);
          break;

        case 'deribit':
          this._handleDeribitMessage(message);
          break;
      }

    } catch (error) {
      // 记录解析错误 / Log parsing error
      console.error(`${this.logPrefix} ${exchange} 消息解析错误 / Message parsing error:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * 处理 Binance 消息
   * Handle Binance message
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleBinanceMessage(message) {
    // 忽略订阅响应 / Ignore subscription responses
    if (message.result === null || message.id) {
      return;
    }

    // 获取事件类型 / Get event type
    const eventType = message.e;

    // 根据事件类型处理 / Handle based on event type
    switch (eventType) {
      case '24hrTicker':
        // 处理行情数据 / Handle ticker data
        this._processTicker('binance', message);
        break;

      case 'depthUpdate':
        // 处理深度更新 / Handle depth update
        this._processDepth('binance', message);
        break;

      case 'trade':
        // 处理成交数据 / Handle trade data
        this._processTrade('binance', message);
        break;

      case 'markPriceUpdate':
        // 处理标记价格和资金费率 / Handle mark price and funding rate
        this._processFundingRate('binance', message);
        break;

      case 'kline':
        // 处理K线数据 / Handle kline data
        this._processKline('binance', message);
        break;
    }
  }

  /**
   * 处理 Bybit 消息
   * Handle Bybit message
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleBybitMessage(message) {
    // 处理 pong 响应 / Handle pong response
    if (message.op === 'pong' || message.ret_msg === 'pong') {
      return;
    }

    // 忽略订阅响应 / Ignore subscription responses
    if (message.success !== undefined) {
      return;
    }

    // 获取主题和数据 / Get topic and data
    const { topic, data } = message;

    // 如果没有主题或数据，返回 / If no topic or data, return
    if (!topic || !data) {
      return;
    }

    // 根据主题类型处理 / Handle based on topic type
    if (topic.startsWith('tickers.')) {
      // 处理行情数据 / Handle ticker data
      this._processTicker('bybit', message);
    } else if (topic.startsWith('orderbook.')) {
      // 处理深度数据 / Handle depth data
      this._processDepth('bybit', message);
    } else if (topic.startsWith('publicTrade.')) {
      // 处理成交数据 / Handle trade data
      this._processTrade('bybit', message);
    } else if (topic.startsWith('kline.')) {
      // 处理K线数据 / Handle kline data
      this._processKline('bybit', message);
    }
  }

  /**
   * 处理 OKX 消息
   * Handle OKX message
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleOKXMessage(message) {
    // 处理 pong 响应 / Handle pong response
    if (message === 'pong') {
      return;
    }

    // 忽略事件消息 (订阅响应等) / Ignore event messages (subscription responses, etc.)
    if (message.event) {
      return;
    }

    // 获取参数和数据 / Get args and data
    const { arg, data } = message;

    // 如果没有参数或数据，返回 / If no args or data, return
    if (!arg || !data || data.length === 0) {
      return;
    }

    // 获取频道类型 / Get channel type
    const channel = arg.channel;

    // 根据频道类型处理 / Handle based on channel type
    switch (channel) {
      case 'tickers':
        // 处理行情数据 / Handle ticker data
        this._processTicker('okx', message);
        break;

      case 'books5':
        // 处理深度数据 / Handle depth data
        this._processDepth('okx', message);
        break;

      case 'trades':
        // 处理成交数据 / Handle trade data
        this._processTrade('okx', message);
        break;

      case 'funding-rate':
        // 处理资金费率 / Handle funding rate
        this._processFundingRate('okx', message);
        break;

      default:
        // 检查是否是K线频道 (candle1H, candle1D 等) / Check if it's a kline channel (candle1H, candle1D, etc.)
        if (channel.startsWith('candle')) {
          this._processKline('okx', message);
        }
        break;
    }
  }

  /**
   * 处理 Deribit 消息
   * Handle Deribit message
   *
   * Deribit 使用 JSON-RPC 2.0 格式
   * Deribit uses JSON-RPC 2.0 format
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleDeribitMessage(message) {
    // 处理心跳响应 (public/test) / Handle heartbeat response
    if (message.result && message.result.version) {
      return;
    }

    // 忽略订阅响应 / Ignore subscription responses
    if (message.result && Array.isArray(message.result)) {
      return;
    }

    // 检查是否是推送消息 / Check if it's a push message
    if (!message.params || !message.params.channel || !message.params.data) {
      return;
    }

    // 获取频道和数据 / Get channel and data
    const channel = message.params.channel;
    const data = message.params.data;

    // 根据频道类型处理 / Handle based on channel type
    if (channel.startsWith('ticker.')) {
      // 处理行情数据 / Handle ticker data
      this._processTicker('deribit', { channel, data });
    } else if (channel.startsWith('book.')) {
      // 处理深度数据 / Handle depth data
      this._processDepth('deribit', { channel, data });
    } else if (channel.startsWith('trades.')) {
      // 处理成交数据 / Handle trade data
      this._processTrade('deribit', { channel, data });
    } else if (channel.startsWith('perpetual.')) {
      // 处理永续合约数据 (资金费率) / Handle perpetual data (funding rate)
      this._processFundingRate('deribit', { channel, data });
    } else if (channel.startsWith('chart.trades.')) {
      // 处理K线数据 / Handle kline data
      this._processKline('deribit', { channel, data });
    }
  }

  // ============================================
  // 私有方法 - 数据处理 / Private Methods - Data Processing
  // ============================================

  /**
   * 处理行情数据
   * Process ticker data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @private
   */
  _processTicker(exchange, message) {
    // 标准化行情数据 / Normalize ticker data
    const ticker = this._normalizeTicker(exchange, message);

    // 如果标准化失败，返回 / If normalization failed, return
    if (!ticker) {
      return;
    }

    // 计算统一时间戳 / Calculate unified timestamp
    ticker.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, ticker.exchangeTimestamp);

    // 更新缓存 / Update cache
    const cacheKey = `${exchange}:${ticker.symbol}`;
    this.cache.tickers.set(cacheKey, ticker);

    // 存储到 Redis Hash / Store to Redis Hash
    this._storeToRedisHash(REDIS_KEYS.TICKER_HASH, cacheKey, ticker);

    // 发布到 Redis Channel / Publish to Redis Channel
    this._publishToChannel(DATA_TYPES.TICKER, ticker);

    // 发出事件 / Emit event
    this.emit('ticker', ticker);
  }

  /**
   * 处理深度数据
   * Process depth data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @private
   */
  _processDepth(exchange, message) {
    // 标准化深度数据 / Normalize depth data
    const depth = this._normalizeDepth(exchange, message);

    // 如果标准化失败，返回 / If normalization failed, return
    if (!depth) {
      return;
    }

    // 计算统一时间戳 / Calculate unified timestamp
    depth.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, depth.exchangeTimestamp);

    // 更新缓存 / Update cache
    const cacheKey = `${exchange}:${depth.symbol}`;
    this.cache.depths.set(cacheKey, depth);

    // 存储到 Redis Hash / Store to Redis Hash
    this._storeToRedisHash(REDIS_KEYS.DEPTH_HASH, cacheKey, depth);

    // 发布到 Redis Channel / Publish to Redis Channel
    this._publishToChannel(DATA_TYPES.DEPTH, depth);

    // 发出事件 / Emit event
    this.emit('depth', depth);
  }

  /**
   * 处理成交数据
   * Process trade data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @private
   */
  _processTrade(exchange, message) {
    // 标准化成交数据 / Normalize trade data
    const trades = this._normalizeTrade(exchange, message);

    // 如果标准化失败，返回 / If normalization failed, return
    if (!trades || trades.length === 0) {
      return;
    }

    // 处理每笔成交 / Process each trade
    for (const trade of trades) {
      // 计算统一时间戳 / Calculate unified timestamp
      trade.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, trade.exchangeTimestamp);

      // 存储到 Redis Stream / Store to Redis Stream
      const streamKey = `${REDIS_KEYS.TRADE_STREAM}${exchange}:${trade.symbol}`;
      this._storeToRedisStream(streamKey, trade);

      // 发布到 Redis Channel / Publish to Redis Channel
      this._publishToChannel(DATA_TYPES.TRADE, trade);

      // 发出事件 / Emit event
      this.emit('trade', trade);
    }
  }

  /**
   * 处理资金费率数据
   * Process funding rate data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @private
   */
  _processFundingRate(exchange, message) {
    // 标准化资金费率数据 / Normalize funding rate data
    const fundingRate = this._normalizeFundingRate(exchange, message);

    // 如果标准化失败，返回 / If normalization failed, return
    if (!fundingRate) {
      return;
    }

    // 计算统一时间戳 / Calculate unified timestamp
    fundingRate.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, fundingRate.exchangeTimestamp);

    // 更新缓存 / Update cache
    const cacheKey = `${exchange}:${fundingRate.symbol}`;
    this.cache.fundingRates.set(cacheKey, fundingRate);

    // 存储到 Redis Hash / Store to Redis Hash
    this._storeToRedisHash(REDIS_KEYS.FUNDING_HASH, cacheKey, fundingRate);

    // 发布到 Redis Channel / Publish to Redis Channel
    this._publishToChannel(DATA_TYPES.FUNDING_RATE, fundingRate);

    // 发出事件 / Emit event
    this.emit('fundingRate', fundingRate);
  }

  /**
   * 处理K线数据
   * Process kline (candlestick) data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @private
   */
  _processKline(exchange, message) {
    // 标准化K线数据 / Normalize kline data
    const candle = this._normalizeKline(exchange, message);

    // 如果标准化失败，返回 / If normalization failed, return
    if (!candle) {
      return;
    }

    // 计算统一时间戳 / Calculate unified timestamp
    candle.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, candle.exchangeTimestamp);

    // 更新缓存 / Update cache
    const cacheKey = `${exchange}:${candle.symbol}`;
    if (!this.cache.klines.has(cacheKey)) {
      this.cache.klines.set(cacheKey, []);
    }
    const klineCache = this.cache.klines.get(cacheKey);

    // 如果是同一根K线更新，替换最后一根 / If same candle update, replace last one
    if (klineCache.length > 0 && klineCache[klineCache.length - 1].openTime === candle.openTime) {
      klineCache[klineCache.length - 1] = candle;
    } else {
      // 新K线，添加到缓存 / New candle, add to cache
      klineCache.push(candle);
      // 限制缓存大小 / Limit cache size
      if (klineCache.length > 500) {
        klineCache.shift();
      }
    }

    // 存储到 Redis Hash / Store to Redis Hash
    this._storeToRedisHash(REDIS_KEYS.KLINE_HASH, cacheKey, candle);

    // 发布到 Redis Channel / Publish to Redis Channel
    this._publishToChannel(DATA_TYPES.KLINE, candle);

    // 发出 candle 事件 (用于策略) / Emit candle event (for strategies)
    this.emit('candle', {
      ...candle,
      history: klineCache.slice(-100), // 附带最近100根K线历史 / Attach last 100 candles history
    });
  }

  // ============================================
  // 私有方法 - 数据标准化 / Private Methods - Data Normalization
  // ============================================

  /**
   * 标准化行情数据
   * Normalize ticker data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object|null} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeTicker(exchange, message) {
    try {
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) {
        case 'binance':
          return this._normalizeBinanceTicker(message);

        case 'bybit':
          return this._normalizeBybitTicker(message);

        case 'okx':
          return this._normalizeOKXTicker(message);

        case 'deribit':
          return this._normalizeDeribitTicker(message);

        default:
          return null;
      }
    } catch (error) {
      console.error(`${this.logPrefix} 标准化行情数据失败 / Failed to normalize ticker:`, error.message);
      return null;
    }
  }

  /**
   * 标准化 Binance 行情数据
   * Normalize Binance ticker data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeBinanceTicker(data) {
    // 转换交易对格式 / Convert symbol format
    const symbol = this._binanceToStandardSymbol(data.s);

    return {
      exchange: 'binance',                    // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      last: parseFloat(data.c),               // 最新价 / Last price
      bid: parseFloat(data.b),                // 最佳买价 / Best bid
      bidSize: parseFloat(data.B),            // 最佳买量 / Best bid size
      ask: parseFloat(data.a),                // 最佳卖价 / Best ask
      askSize: parseFloat(data.A),            // 最佳卖量 / Best ask size
      open: parseFloat(data.o),               // 开盘价 / Open price
      high: parseFloat(data.h),               // 最高价 / High price
      low: parseFloat(data.l),                // 最低价 / Low price
      volume: parseFloat(data.v),             // 成交量 / Volume
      quoteVolume: parseFloat(data.q),        // 成交额 / Quote volume
      change: parseFloat(data.p),             // 涨跌额 / Price change
      changePercent: parseFloat(data.P),      // 涨跌幅 / Price change percent
      exchangeTimestamp: data.E,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Bybit 行情数据
   * Normalize Bybit ticker data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeBybitTicker(message) {
    // 获取数据 / Get data
    const data = message.data;

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bybitToStandardSymbol(data.symbol);

    return {
      exchange: 'bybit',                      // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      last: parseFloat(data.lastPrice),       // 最新价 / Last price
      bid: parseFloat(data.bid1Price),        // 最佳买价 / Best bid
      bidSize: parseFloat(data.bid1Size),     // 最佳买量 / Best bid size
      ask: parseFloat(data.ask1Price),        // 最佳卖价 / Best ask
      askSize: parseFloat(data.ask1Size),     // 最佳卖量 / Best ask size
      open: parseFloat(data.prevPrice24h),    // 开盘价 / Open price
      high: parseFloat(data.highPrice24h),    // 最高价 / High price
      low: parseFloat(data.lowPrice24h),      // 最低价 / Low price
      volume: parseFloat(data.volume24h),     // 成交量 / Volume
      quoteVolume: parseFloat(data.turnover24h), // 成交额 / Quote volume
      change: parseFloat(data.price24hPcnt) * parseFloat(data.prevPrice24h), // 涨跌额 / Price change
      changePercent: parseFloat(data.price24hPcnt) * 100, // 涨跌幅 / Price change percent
      fundingRate: data.fundingRate ? parseFloat(data.fundingRate) : null, // 资金费率 / Funding rate
      nextFundingTime: data.nextFundingTime ? parseInt(data.nextFundingTime) : null, // 下次资金费率时间 / Next funding time
      exchangeTimestamp: parseInt(message.ts), // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 OKX 行情数据
   * Normalize OKX ticker data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeOKXTicker(message) {
    // 获取数据 / Get data
    const data = message.data[0];

    // 转换交易对格式 / Convert symbol format
    const symbol = this._okxToStandardSymbol(message.arg.instId);

    return {
      exchange: 'okx',                        // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      last: parseFloat(data.last),            // 最新价 / Last price
      bid: parseFloat(data.bidPx),            // 最佳买价 / Best bid
      bidSize: parseFloat(data.bidSz),        // 最佳买量 / Best bid size
      ask: parseFloat(data.askPx),            // 最佳卖价 / Best ask
      askSize: parseFloat(data.askSz),        // 最佳卖量 / Best ask size
      open: parseFloat(data.open24h),         // 开盘价 / Open price
      high: parseFloat(data.high24h),         // 最高价 / High price
      low: parseFloat(data.low24h),           // 最低价 / Low price
      volume: parseFloat(data.vol24h),        // 成交量 / Volume
      quoteVolume: parseFloat(data.volCcy24h), // 成交额 / Quote volume
      change: parseFloat(data.last) - parseFloat(data.open24h), // 涨跌额 / Price change
      changePercent: ((parseFloat(data.last) - parseFloat(data.open24h)) / parseFloat(data.open24h)) * 100, // 涨跌幅 / Price change percent
      exchangeTimestamp: parseInt(data.ts),   // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化深度数据
   * Normalize depth data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object|null} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeDepth(exchange, message) {
    try {
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) {
        case 'binance':
          return this._normalizeBinanceDepth(message);

        case 'bybit':
          return this._normalizeBybitDepth(message);

        case 'okx':
          return this._normalizeOKXDepth(message);

        case 'deribit':
          return this._normalizeDeribitDepth(message);

        default:
          return null;
      }
    } catch (error) {
      console.error(`${this.logPrefix} 标准化深度数据失败 / Failed to normalize depth:`, error.message);
      return null;
    }
  }

  /**
   * 标准化 Binance 深度数据
   * Normalize Binance depth data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeBinanceDepth(data) {
    // 转换交易对格式 / Convert symbol format
    const symbol = this._binanceToStandardSymbol(data.s);

    return {
      exchange: 'binance',                    // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.b || []).map(([price, amount]) => [
        parseFloat(price),
        parseFloat(amount),
      ]),
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.a || []).map(([price, amount]) => [
        parseFloat(price),
        parseFloat(amount),
      ]),
      exchangeTimestamp: data.E,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Bybit 深度数据
   * Normalize Bybit depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeBybitDepth(message) {
    // 获取数据 / Get data
    const data = message.data;

    // 提取交易对 / Extract symbol
    const symbol = this._bybitToStandardSymbol(data.s);

    return {
      exchange: 'bybit',                      // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.b || []).map(([price, amount]) => [
        parseFloat(price),
        parseFloat(amount),
      ]),
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.a || []).map(([price, amount]) => [
        parseFloat(price),
        parseFloat(amount),
      ]),
      exchangeTimestamp: parseInt(message.ts), // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 OKX 深度数据
   * Normalize OKX depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeOKXDepth(message) {
    // 获取数据 / Get data
    const data = message.data[0];

    // 转换交易对格式 / Convert symbol format
    const symbol = this._okxToStandardSymbol(message.arg.instId);

    return {
      exchange: 'okx',                        // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.bids || []).map(([price, amount]) => [
        parseFloat(price),
        parseFloat(amount),
      ]),
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(([price, amount]) => [
        parseFloat(price),
        parseFloat(amount),
      ]),
      exchangeTimestamp: parseInt(data.ts),   // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化成交数据
   * Normalize trade data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array|null} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeTrade(exchange, message) {
    try {
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) {
        case 'binance':
          return [this._normalizeBinanceTrade(message)];

        case 'bybit':
          return this._normalizeBybitTrade(message);

        case 'okx':
          return this._normalizeOKXTrade(message);

        case 'deribit':
          return this._normalizeDeribitTrade(message);

        default:
          return null;
      }
    } catch (error) {
      console.error(`${this.logPrefix} 标准化成交数据失败 / Failed to normalize trade:`, error.message);
      return null;
    }
  }

  /**
   * 标准化 Binance 成交数据
   * Normalize Binance trade data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的成交数据 / Normalized trade data
   * @private
   */
  _normalizeBinanceTrade(data) {
    // 转换交易对格式 / Convert symbol format
    const symbol = this._binanceToStandardSymbol(data.s);

    return {
      exchange: 'binance',                    // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      tradeId: data.t.toString(),             // 成交 ID / Trade ID
      price: parseFloat(data.p),              // 成交价格 / Trade price
      amount: parseFloat(data.q),             // 成交数量 / Trade amount
      side: data.m ? 'sell' : 'buy',          // 主动方向 (m=true 表示买方是 maker) / Aggressor side
      exchangeTimestamp: data.T,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Bybit 成交数据
   * Normalize Bybit trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeBybitTrade(message) {
    // 获取数据数组 / Get data array
    const dataArray = message.data;

    // 提取交易对 / Extract symbol
    const topic = message.topic;
    const symbolPart = topic.split('.')[1];
    const symbol = this._bybitToStandardSymbol(symbolPart);

    // 标准化每笔成交 / Normalize each trade
    return dataArray.map(data => ({
      exchange: 'bybit',                      // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      tradeId: data.i,                        // 成交 ID / Trade ID
      price: parseFloat(data.p),              // 成交价格 / Trade price
      amount: parseFloat(data.v),             // 成交数量 / Trade amount
      side: data.S.toLowerCase(),             // 主动方向 / Aggressor side
      exchangeTimestamp: parseInt(data.T),    // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    }));
  }

  /**
   * 标准化 OKX 成交数据
   * Normalize OKX trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeOKXTrade(message) {
    // 获取数据数组 / Get data array
    const dataArray = message.data;

    // 转换交易对格式 / Convert symbol format
    const symbol = this._okxToStandardSymbol(message.arg.instId);

    // 标准化每笔成交 / Normalize each trade
    return dataArray.map(data => ({
      exchange: 'okx',                        // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      tradeId: data.tradeId,                  // 成交 ID / Trade ID
      price: parseFloat(data.px),             // 成交价格 / Trade price
      amount: parseFloat(data.sz),            // 成交数量 / Trade amount
      side: data.side,                        // 主动方向 / Aggressor side
      exchangeTimestamp: parseInt(data.ts),   // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    }));
  }

  /**
   * 标准化资金费率数据
   * Normalize funding rate data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object|null} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeFundingRate(exchange, message) {
    try {
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) {
        case 'binance':
          return this._normalizeBinanceFundingRate(message);

        case 'bybit':
          // Bybit 资金费率在 ticker 中 / Bybit funding rate is in ticker
          return null;

        case 'okx':
          return this._normalizeOKXFundingRate(message);

        case 'deribit':
          return this._normalizeDeribitFundingRate(message);

        default:
          return null;
      }
    } catch (error) {
      console.error(`${this.logPrefix} 标准化资金费率数据失败 / Failed to normalize funding rate:`, error.message);
      return null;
    }
  }

  /**
   * 标准化 Binance 资金费率数据
   * Normalize Binance funding rate data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeBinanceFundingRate(data) {
    // 转换交易对格式 / Convert symbol format
    const symbol = this._binanceToStandardSymbol(data.s);

    return {
      exchange: 'binance',                    // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      markPrice: parseFloat(data.p),          // 标记价格 / Mark price
      indexPrice: parseFloat(data.i),         // 指数价格 / Index price
      fundingRate: parseFloat(data.r),        // 当前资金费率 / Current funding rate
      nextFundingTime: data.T,                // 下次资金费率时间 / Next funding time
      exchangeTimestamp: data.E,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 OKX 资金费率数据
   * Normalize OKX funding rate data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeOKXFundingRate(message) {
    // 获取数据 / Get data
    const data = message.data[0];

    // 转换交易对格式 / Convert symbol format
    const symbol = this._okxToStandardSymbol(message.arg.instId);

    return {
      exchange: 'okx',                        // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      fundingRate: parseFloat(data.fundingRate), // 当前资金费率 / Current funding rate
      nextFundingRate: data.nextFundingRate ? parseFloat(data.nextFundingRate) : null, // 预测资金费率 / Predicted funding rate
      nextFundingTime: parseInt(data.fundingTime), // 下次资金费率时间 / Next funding time
      exchangeTimestamp: parseInt(data.ts),   // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化K线数据
   * Normalize kline (candlestick) data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object|null} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeKline(exchange, message) {
    try {
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) {
        case 'binance':
          return this._normalizeBinanceKline(message);

        case 'bybit':
          return this._normalizeBybitKline(message);

        case 'okx':
          return this._normalizeOKXKline(message);

        case 'deribit':
          return this._normalizeDeribitKline(message);

        default:
          return null;
      }
    } catch (error) {
      console.error(`${this.logPrefix} 标准化K线数据失败 / Failed to normalize kline:`, error.message);
      return null;
    }
  }

  /**
   * 标准化 Binance K线数据
   * Normalize Binance kline data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeBinanceKline(data) {
    // Binance kline 数据结构 / Binance kline data structure
    // { e: 'kline', E: eventTime, s: symbol, k: { t, T, s, i, o, c, h, l, v, ... } }
    const k = data.k;
    const symbol = this._binanceToStandardSymbol(data.s);

    return {
      exchange: 'binance',              // 交易所 / Exchange
      symbol,                            // 交易对 / Trading pair
      interval: k.i,                     // 时间间隔 / Time interval
      openTime: k.t,                     // 开盘时间 / Open time
      closeTime: k.T,                    // 收盘时间 / Close time
      open: parseFloat(k.o),             // 开盘价 / Open price
      high: parseFloat(k.h),             // 最高价 / High price
      low: parseFloat(k.l),              // 最低价 / Low price
      close: parseFloat(k.c),            // 收盘价 / Close price
      volume: parseFloat(k.v),           // 成交量 / Volume
      quoteVolume: parseFloat(k.q),      // 成交额 / Quote volume
      trades: k.n,                       // 成交笔数 / Number of trades
      isClosed: k.x,                     // 是否收盘 / Is candle closed
      exchangeTimestamp: data.E,         // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),        // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Bybit K线数据
   * Normalize Bybit kline data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeBybitKline(message) {
    // Bybit kline 数据结构 / Bybit kline data structure
    // { topic: 'kline.60.BTCUSDT', data: [{ start, end, interval, open, close, high, low, volume, ... }] }
    const data = message.data[0];
    const topic = message.topic;
    const symbolMatch = topic.match(/kline\.\d+\.(\w+)/);
    const rawSymbol = symbolMatch ? symbolMatch[1] : '';
    const symbol = this._bybitToStandardSymbol(rawSymbol);

    return {
      exchange: 'bybit',                 // 交易所 / Exchange
      symbol,                            // 交易对 / Trading pair
      interval: data.interval,           // 时间间隔 / Time interval
      openTime: data.start,              // 开盘时间 / Open time
      closeTime: data.end,               // 收盘时间 / Close time
      open: parseFloat(data.open),       // 开盘价 / Open price
      high: parseFloat(data.high),       // 最高价 / High price
      low: parseFloat(data.low),         // 最低价 / Low price
      close: parseFloat(data.close),     // 收盘价 / Close price
      volume: parseFloat(data.volume),   // 成交量 / Volume
      quoteVolume: parseFloat(data.turnover || 0), // 成交额 / Quote volume
      trades: 0,                         // Bybit 不提供成交笔数 / Bybit doesn't provide trade count
      isClosed: data.confirm,            // 是否收盘 / Is candle closed
      exchangeTimestamp: data.timestamp, // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),        // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 OKX K线数据
   * Normalize OKX kline data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeOKXKline(message) {
    // OKX kline 数据结构 / OKX kline data structure
    // { arg: { channel, instId }, data: [[ts, o, h, l, c, vol, volCcy, ...]] }
    const data = message.data[0];
    const symbol = this._okxToStandardSymbol(message.arg.instId);

    return {
      exchange: 'okx',                   // 交易所 / Exchange
      symbol,                            // 交易对 / Trading pair
      interval: message.arg.channel.replace('candle', ''), // 时间间隔 / Time interval
      openTime: parseInt(data[0]),       // 开盘时间 / Open time
      closeTime: parseInt(data[0]) + 3600000, // 收盘时间 (1小时后) / Close time (1 hour later)
      open: parseFloat(data[1]),         // 开盘价 / Open price
      high: parseFloat(data[2]),         // 最高价 / High price
      low: parseFloat(data[3]),          // 最低价 / Low price
      close: parseFloat(data[4]),        // 收盘价 / Close price
      volume: parseFloat(data[5]),       // 成交量 / Volume
      quoteVolume: parseFloat(data[6] || 0), // 成交额 / Quote volume
      trades: 0,                         // OKX 不提供成交笔数 / OKX doesn't provide trade count
      isClosed: data[8] === '1',         // 是否收盘 / Is candle closed
      exchangeTimestamp: parseInt(data[0]), // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),        // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Deribit 行情数据
   * Normalize Deribit ticker data
   *
   * Deribit WebSocket 推送格式 / Deribit WebSocket push format:
   * { channel: 'ticker.BTC-PERPETUAL.100ms', data: { ... } }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeDeribitTicker(message) {
    // 获取数据 / Get data
    const data = message.data;
    const channel = message.channel;

    // 从频道提取交易对 / Extract symbol from channel
    // 格式: ticker.BTC-PERPETUAL.100ms -> BTC-PERPETUAL
    const symbolMatch = channel.match(/ticker\.(.+)\.100ms/);
    const deribitSymbol = symbolMatch ? symbolMatch[1] : '';
    const symbol = this._deribitToStandardSymbol(deribitSymbol);

    return {
      exchange: 'deribit',                           // 交易所 / Exchange
      symbol,                                         // 交易对 / Trading pair
      last: parseFloat(data.last_price || 0),        // 最新价 / Last price
      bid: parseFloat(data.best_bid_price || 0),     // 最佳买价 / Best bid
      bidSize: parseFloat(data.best_bid_amount || 0), // 最佳买量 / Best bid size
      ask: parseFloat(data.best_ask_price || 0),     // 最佳卖价 / Best ask
      askSize: parseFloat(data.best_ask_amount || 0), // 最佳卖量 / Best ask size
      open: parseFloat(data.open_interest || 0),     // 持仓量 / Open interest (Deribit 没有 24h open)
      high: parseFloat(data.max_price || 0),         // 最高价 / High price
      low: parseFloat(data.min_price || 0),          // 最低价 / Low price
      volume: parseFloat(data.stats?.volume || 0),   // 成交量 / Volume
      quoteVolume: parseFloat(data.stats?.volume_usd || 0), // 成交额 / Quote volume
      change: 0,                                      // Deribit 不直接提供 / Not directly provided
      changePercent: parseFloat(data.stats?.price_change || 0), // 涨跌幅 / Price change percent
      markPrice: parseFloat(data.mark_price || 0),   // 标记价格 / Mark price
      indexPrice: parseFloat(data.index_price || 0), // 指数价格 / Index price
      fundingRate: parseFloat(data.current_funding || 0), // 当前资金费率 / Current funding rate
      exchangeTimestamp: data.timestamp,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                     // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Deribit 深度数据
   * Normalize Deribit depth data
   *
   * Deribit WebSocket 推送格式 / Deribit WebSocket push format:
   * { channel: 'book.BTC-PERPETUAL.10.100ms', data: { bids: [...], asks: [...] } }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeDeribitDepth(message) {
    // 获取数据 / Get data
    const data = message.data;
    const channel = message.channel;

    // 从频道提取交易对 / Extract symbol from channel
    // 格式: book.BTC-PERPETUAL.10.100ms -> BTC-PERPETUAL
    const symbolMatch = channel.match(/book\.(.+)\.\d+\.100ms/);
    const deribitSymbol = symbolMatch ? symbolMatch[1] : '';
    const symbol = this._deribitToStandardSymbol(deribitSymbol);

    return {
      exchange: 'deribit',                    // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      // Deribit 格式: [action, price, amount] -> [price, amount]
      bids: (data.bids || []).map(item => [
        parseFloat(Array.isArray(item) ? item[1] : item.price),
        parseFloat(Array.isArray(item) ? item[2] : item.amount),
      ]),
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(item => [
        parseFloat(Array.isArray(item) ? item[1] : item.price),
        parseFloat(Array.isArray(item) ? item[2] : item.amount),
      ]),
      exchangeTimestamp: data.timestamp,       // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),              // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Deribit 成交数据
   * Normalize Deribit trade data
   *
   * Deribit WebSocket 推送格式 / Deribit WebSocket push format:
   * { channel: 'trades.BTC-PERPETUAL.100ms', data: [{ trade_id, price, amount, direction, ... }] }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeDeribitTrade(message) {
    // 获取数据数组 / Get data array
    const dataArray = Array.isArray(message.data) ? message.data : [message.data];
    const channel = message.channel;

    // 从频道提取交易对 / Extract symbol from channel
    // 格式: trades.BTC-PERPETUAL.100ms -> BTC-PERPETUAL
    const symbolMatch = channel.match(/trades\.(.+)\.100ms/);
    const deribitSymbol = symbolMatch ? symbolMatch[1] : '';
    const symbol = this._deribitToStandardSymbol(deribitSymbol);

    // 标准化每笔成交 / Normalize each trade
    return dataArray.map(data => ({
      exchange: 'deribit',                       // 交易所 / Exchange
      symbol,                                     // 交易对 / Trading pair
      tradeId: data.trade_id?.toString() || '',  // 成交 ID / Trade ID
      price: parseFloat(data.price || 0),        // 成交价格 / Trade price
      amount: parseFloat(data.amount || 0),      // 成交数量 / Trade amount
      side: data.direction || 'buy',             // 主动方向 / Aggressor side
      exchangeTimestamp: data.timestamp,          // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                 // 本地时间戳 / Local timestamp
    }));
  }

  /**
   * 标准化 Deribit 资金费率数据
   * Normalize Deribit funding rate data
   *
   * Deribit WebSocket 推送格式 / Deribit WebSocket push format:
   * { channel: 'perpetual.BTC-PERPETUAL.100ms', data: { funding, ... } }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeDeribitFundingRate(message) {
    // 获取数据 / Get data
    const data = message.data;
    const channel = message.channel;

    // 从频道提取交易对 / Extract symbol from channel
    // 格式: perpetual.BTC-PERPETUAL.100ms -> BTC-PERPETUAL
    const symbolMatch = channel.match(/perpetual\.(.+)\.100ms/);
    const deribitSymbol = symbolMatch ? symbolMatch[1] : '';
    const symbol = this._deribitToStandardSymbol(deribitSymbol);

    return {
      exchange: 'deribit',                                // 交易所 / Exchange
      symbol,                                              // 交易对 / Trading pair
      markPrice: parseFloat(data.mark_price || 0),        // 标记价格 / Mark price
      indexPrice: parseFloat(data.index_price || 0),      // 指数价格 / Index price
      fundingRate: parseFloat(data.current_funding || 0), // 当前资金费率 / Current funding rate
      interest: parseFloat(data.interest || 0),           // 利率 / Interest rate
      nextFundingTime: null,                               // Deribit 不提供 / Not provided by Deribit
      exchangeTimestamp: data.timestamp,                   // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                          // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Deribit K线数据
   * Normalize Deribit kline data
   *
   * Deribit WebSocket 推送格式 / Deribit WebSocket push format:
   * { channel: 'chart.trades.BTC-PERPETUAL.60', data: { open, high, low, close, volume, ... } }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeDeribitKline(message) {
    // 获取数据 / Get data
    const data = message.data;
    const channel = message.channel;

    // 从频道提取交易对和时间间隔 / Extract symbol and interval from channel
    // 格式: chart.trades.BTC-PERPETUAL.60 -> BTC-PERPETUAL, 60
    const channelMatch = channel.match(/chart\.trades\.(.+)\.(\d+)/);
    const deribitSymbol = channelMatch ? channelMatch[1] : '';
    const intervalMinutes = channelMatch ? parseInt(channelMatch[2]) : 60;
    const symbol = this._deribitToStandardSymbol(deribitSymbol);

    return {
      exchange: 'deribit',                   // 交易所 / Exchange
      symbol,                                // 交易对 / Trading pair
      interval: `${intervalMinutes}m`,       // 时间间隔 / Time interval
      openTime: data.tick,                   // 开盘时间 / Open time
      closeTime: data.tick + intervalMinutes * 60 * 1000, // 收盘时间 / Close time
      open: parseFloat(data.open || 0),      // 开盘价 / Open price
      high: parseFloat(data.high || 0),      // 最高价 / High price
      low: parseFloat(data.low || 0),        // 最低价 / Low price
      close: parseFloat(data.close || 0),    // 收盘价 / Close price
      volume: parseFloat(data.volume || 0),  // 成交量 / Volume
      quoteVolume: parseFloat(data.cost || 0), // 成交额 / Quote volume
      trades: 0,                              // Deribit 不提供 / Not provided by Deribit
      isClosed: true,                         // K 线是否收盘 / Is candle closed
      exchangeTimestamp: data.tick,           // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    };
  }

  // ============================================
  // 私有方法 - 交易对转换 / Private Methods - Symbol Conversion
  // ============================================

  /**
   * 将 Binance 交易对转换为标准格式
   * Convert Binance symbol to standard format
   *
   * @param {string} binanceSymbol - Binance 交易对 (如 BTCUSDT) / Binance symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _binanceToStandardSymbol(binanceSymbol) {
    // 常见的计价货币 / Common quote currencies
    const quotes = ['USDT', 'BUSD', 'USDC', 'BTC', 'ETH', 'BNB', 'USD'];

    // 尝试匹配计价货币 / Try to match quote currency
    for (const quote of quotes) {
      if (binanceSymbol.endsWith(quote)) {
        const base = binanceSymbol.slice(0, -quote.length);
        return `${base}/${quote}`;
      }
    }

    // 如果无法匹配，返回原始格式 / If no match, return original
    return binanceSymbol;
  }

  /**
   * 将 Bybit 交易对转换为标准格式
   * Convert Bybit symbol to standard format
   *
   * @param {string} bybitSymbol - Bybit 交易对 (如 BTCUSDT) / Bybit symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _bybitToStandardSymbol(bybitSymbol) {
    // 常见的计价货币 / Common quote currencies
    const quotes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH'];

    // 尝试匹配计价货币 / Try to match quote currency
    for (const quote of quotes) {
      if (bybitSymbol.endsWith(quote)) {
        const base = bybitSymbol.slice(0, -quote.length);
        return `${base}/${quote}`;
      }
    }

    // 如果无法匹配，返回原始格式 / If no match, return original
    return bybitSymbol;
  }

  /**
   * 将 OKX 交易对转换为标准格式
   * Convert OKX symbol to standard format
   *
   * @param {string} okxSymbol - OKX 交易对 (如 BTC-USDT-SWAP) / OKX symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _okxToStandardSymbol(okxSymbol) {
    // OKX 格式: BTC-USDT 或 BTC-USDT-SWAP / OKX format
    // 移除 -SWAP, -FUTURES 等后缀 / Remove -SWAP, -FUTURES suffixes
    const parts = okxSymbol.split('-');

    // 如果至少有两部分，返回 BASE/QUOTE 格式 / If at least two parts, return BASE/QUOTE format
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return okxSymbol;
  }

  /**
   * 将 Deribit 交易对转换为标准格式
   * Convert Deribit symbol to standard format
   *
   * @param {string} deribitSymbol - Deribit 交易对 (如 BTC-PERPETUAL) / Deribit symbol
   * @returns {string} 标准交易对 (如 BTC/USD) / Standard symbol
   * @private
   */
  _deribitToStandardSymbol(deribitSymbol) {
    // Deribit 永续合约格式: BTC-PERPETUAL -> BTC/USD
    // Deribit perpetual format: BTC-PERPETUAL -> BTC/USD
    if (deribitSymbol.endsWith('-PERPETUAL')) {
      const base = deribitSymbol.replace('-PERPETUAL', '');
      return `${base}/USD`;
    }

    // Deribit 期货格式: BTC-28MAR25 -> BTC/USD (带到期日)
    // Deribit futures format: BTC-28MAR25 -> BTC/USD (with expiry)
    const futuresMatch = deribitSymbol.match(/^([A-Z]+)-(\d{1,2}[A-Z]{3}\d{2})$/);
    if (futuresMatch) {
      return `${futuresMatch[1]}/USD`;
    }

    // Deribit 期权格式: BTC-28MAR25-50000-C -> BTC/USD (期权)
    // Deribit options format: BTC-28MAR25-50000-C -> BTC/USD (options)
    const optionsMatch = deribitSymbol.match(/^([A-Z]+)-/);
    if (optionsMatch) {
      return `${optionsMatch[1]}/USD`;
    }

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return deribitSymbol;
  }

  // ============================================
  // 私有方法 - 时间同步 / Private Methods - Time Sync
  // ============================================

  /**
   * 同步时间
   * Sync time with exchange
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _syncTime(exchange) {
    // 获取时间同步数据 / Get time sync data
    const sync = this.timeSync.get(exchange);

    // 更新最后同步时间 / Update last sync time
    sync.lastSync = Date.now();

    // 初始偏移为 0 / Initial offset is 0
    // 后续可以通过接收到的消息动态计算 / Can be calculated dynamically from received messages
    sync.offset = 0;
  }

  /**
   * 计算统一时间戳
   * Calculate unified timestamp
   *
   * 使用交易所时间和本地时间的平均值，减少网络延迟影响
   * Uses average of exchange time and local time to reduce network latency impact
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {number} exchangeTimestamp - 交易所时间戳 / Exchange timestamp
   * @returns {number} 统一时间戳 / Unified timestamp
   * @private
   */
  _calculateUnifiedTimestamp(exchange, exchangeTimestamp) {
    // 获取当前本地时间 / Get current local time
    const localTimestamp = Date.now();

    // 如果交易所时间戳无效，返回本地时间 / If exchange timestamp invalid, return local time
    if (!exchangeTimestamp || isNaN(exchangeTimestamp)) {
      return localTimestamp;
    }

    // 计算平均值作为统一时间戳 / Calculate average as unified timestamp
    // 公式: (exchangeTime + localTime) / 2
    // 这样可以减少单方面时间误差的影响 / This reduces the impact of one-sided time errors
    const unifiedTimestamp = Math.round((exchangeTimestamp + localTimestamp) / 2);

    return unifiedTimestamp;
  }

  // ============================================
  // 私有方法 - Redis 操作 / Private Methods - Redis Operations
  // ============================================

  /**
   * 存储数据到 Redis Hash
   * Store data to Redis Hash
   *
   * @param {string} keyPrefix - 键前缀 / Key prefix
   * @param {string} field - 字段名 / Field name
   * @param {Object} data - 数据对象 / Data object
   * @private
   */
  async _storeToRedisHash(keyPrefix, field, data) {
    // 检查 Redis 连接 / Check Redis connection
    if (!this.redis) {
      return;
    }

    try {
      // 构建完整键 / Build full key
      const key = `${keyPrefix}${data.symbol}`;

      // 存储为 JSON 字符串 / Store as JSON string
      await this.redis.hset(key, field, JSON.stringify(data));

    } catch (error) {
      // 记录错误但不抛出 / Log error but don't throw
      console.error(`${this.logPrefix} Redis Hash 存储失败 / Redis Hash store failed:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * 存储数据到 Redis Stream
   * Store data to Redis Stream
   *
   * @param {string} streamKey - 流键 / Stream key
   * @param {Object} data - 数据对象 / Data object
   * @private
   */
  async _storeToRedisStream(streamKey, data) {
    // 检查 Redis 连接 / Check Redis connection
    if (!this.redis) {
      return;
    }

    try {
      // 构建流条目数据 / Build stream entry data
      const entries = [];

      // 将对象转换为键值对数组 / Convert object to key-value pairs
      for (const [key, value] of Object.entries(data)) {
        entries.push(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }

      // 添加到流，使用 MAXLEN 限制长度 / Add to stream with MAXLEN limit
      await this.redis.xadd(
        streamKey,                              // 流键 / Stream key
        'MAXLEN',                               // MAXLEN 命令 / MAXLEN command
        this.config.stream.trimApprox ? '~' : '', // 近似裁剪 / Approximate trimming
        this.config.stream.maxLen,              // 最大长度 / Maximum length
        '*',                                    // 自动生成 ID / Auto-generate ID
        ...entries                              // 键值对 / Key-value pairs
      );

    } catch (error) {
      // 记录错误但不抛出 / Log error but don't throw
      console.error(`${this.logPrefix} Redis Stream 存储失败 / Redis Stream store failed:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * 发布数据到 Redis Channel
   * Publish data to Redis Channel
   *
   * @param {string} dataType - 数据类型 / Data type
   * @param {Object} data - 数据对象 / Data object
   * @private
   */
  async _publishToChannel(dataType, data) {
    // 检查 Redis 发布客户端 / Check Redis publish client
    if (!this.redisPub) {
      return;
    }

    try {
      // 构建发布消息 / Build publish message
      const message = JSON.stringify({
        type: dataType,         // 数据类型 / Data type
        data,                   // 数据内容 / Data content
        timestamp: Date.now(),  // 发布时间戳 / Publish timestamp
      });

      // 发布到 channel / Publish to channel
      await this.redisPub.publish(REDIS_KEYS.CHANNEL, message);

      // 增加发布计数 / Increment publish count
      this.stats.messagesPublished++;

    } catch (error) {
      // 记录错误但不抛出 / Log error but don't throw
      console.error(`${this.logPrefix} Redis 发布失败 / Redis publish failed:`, error.message);
      this.stats.errors++;
    }
  }
}

// 导出数据类型常量 / Export data type constants
export { DATA_TYPES };

// 导出 Redis 键常量 / Export Redis key constants
export { REDIS_KEYS };

// 导出默认类 / Export default class
export default MarketDataEngine;
