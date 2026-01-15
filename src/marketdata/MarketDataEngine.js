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
  // Gate.io 端点 / Gate.io endpoints
  gate: {
    spot: 'wss://api.gateio.ws/ws/v4/',                 // 现货 / Spot
    futures: 'wss://fx-ws.gateio.ws/v4/ws/usdt',        // USDT 永续 / USDT perpetual
    delivery: 'wss://fx-ws.gateio.ws/v4/ws/btc',        // BTC 永续 / BTC perpetual
  },
  // Bitget 端点 / Bitget endpoints
  bitget: {
    spot: 'wss://ws.bitget.com/v2/ws/public',           // 现货公共频道 / Spot public channel
    futures: 'wss://ws.bitget.com/v2/ws/public',        // 合约公共频道 / Futures public channel
    private: 'wss://ws.bitget.com/v2/ws/private',       // 私有频道 / Private channel
  },
  // KuCoin 端点 / KuCoin endpoints
  // 注意: KuCoin 需要先获取动态 token，这里仅作为备用 / Note: KuCoin requires dynamic token, these are fallbacks
  kucoin: {
    spot: 'wss://ws-api-spot.kucoin.com',               // 现货公共频道 / Spot public channel
    futures: 'wss://ws-api-futures.kucoin.com',         // 合约公共频道 / Futures public channel
    // REST API 端点用于获取 WebSocket token / REST API endpoints to get WebSocket token
    spotTokenApi: 'https://api.kucoin.com/api/v1/bullet-public',
    futuresTokenApi: 'https://api-futures.kucoin.com/api/v1/bullet-public',
  },
  // Kraken 端点 / Kraken endpoints
  kraken: {
    spot: 'wss://ws.kraken.com',                        // 现货公共频道 / Spot public channel
    spotPrivate: 'wss://ws-auth.kraken.com',            // 现货私有频道 / Spot private channel
    futures: 'wss://futures.kraken.com/ws/v1',          // 合约公共频道 / Futures public channel
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
  // WebSocket 连接池配置 / WebSocket connection pool configuration
  connectionPool: {
    maxSubscriptionsPerConnection: 100,  // 每个连接的最大订阅数 / Max subscriptions per connection
    useCombinedStream: true,             // 是否使用 Binance Combined Stream / Use Binance Combined Stream
  },
  // 数据超时配置 / Data timeout configuration
  dataTimeout: {
    enabled: true,            // 是否启用数据超时检测 / Enable data timeout detection
    timeout: 30000,           // 无数据超时毫秒 / No data timeout in milliseconds
    checkInterval: 5000,      // 检查间隔毫秒 / Check interval in milliseconds
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
      enableRedis: config.enableRedis ?? true,
      // 重连配置 / Reconnection configuration
      reconnect: { ...DEFAULT_CONFIG.reconnect, ...config.reconnect },
      // 心跳配置 / Heartbeat configuration
      heartbeat: { ...DEFAULT_CONFIG.heartbeat, ...config.heartbeat },
      // 流配置 / Stream configuration
      stream: { ...DEFAULT_CONFIG.stream, ...config.stream },
      // 连接池配置 / Connection pool configuration
      connectionPool: { ...DEFAULT_CONFIG.connectionPool, ...config.connectionPool },
      // 数据超时配置 / Data timeout configuration
      dataTimeout: { ...DEFAULT_CONFIG.dataTimeout, ...config.dataTimeout },
      // 启用的交易所 / Enabled exchanges
      exchanges: config.exchanges || ['binance', 'bybit', 'okx'],
      // 交易类型 (swap = 永续合约) / Trading type (swap = perpetual)
      tradingType: config.tradingType || 'swap',
    };

    // ============================================
    // 内部状态 / Internal State
    // ============================================

    // WebSocket 连接映射 { exchange: WebSocket } (单连接模式) / WebSocket connection map (single connection mode)
    // 或 { exchange: Map<connectionId, WebSocket> } (连接池模式) / Or connection pool mode
    this.connections = new Map();

    // 连接池映射 { exchange: Map<connectionId, { ws, subscriptions: Set, lastDataTime }> }
    // Connection pool map for exchanges that need multiple connections
    this.connectionPools = new Map();

    // 连接状态映射 { exchange: { connected, reconnecting, attempt } } / Connection status map
    this.connectionStatus = new Map();

    // 订阅映射 { exchange: Set<subscriptionKey> } / Subscription map
    this.subscriptions = new Map();

    // 订阅到连接的映射 { exchange: Map<subscriptionKey, connectionId> }
    // Maps subscriptions to their connection IDs
    this.subscriptionToConnection = new Map();

    // 心跳定时器映射 { exchange: timer } 或 { exchange: Map<connectionId, timer> }
    // Heartbeat timer map
    this.heartbeatTimers = new Map();

    // 数据超时检测定时器映射 { exchange: timer } 或 { exchange: Map<connectionId, timer> }
    // Data timeout check timer map
    this.dataTimeoutTimers = new Map();

    // 最后数据接收时间映射 { exchange: timestamp } 或 { exchange: Map<connectionId, timestamp> }
    // Last data received time map
    this.lastDataTime = new Map();

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
      lastEmittedFundingRates: new Map(), // { cacheKey: fundingRate } 最后发出的资金费率 / Last emitted funding rates for deduplication
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

    console.log(`${this.logPrefix} [链路] 正在启动行情引擎... / Starting market data engine...`);
    console.log(`${this.logPrefix} [链路] 配置的交易所列表 / Configured exchanges: [${this.config.exchanges.join(', ')}]`);

    try {
      // 1. 初始化 Redis 连接 / Initialize Redis connection
      if (this.config.enableRedis) {
        await this._initializeRedis();
      } else {
        console.log(`${this.logPrefix} Redis 已禁用 / Redis disabled`);
      }

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
    if (this.config.enableRedis) {
      await this._closeRedis();
    }

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

    console.log(`${this.logPrefix} [链路] 订阅行情: ${symbol} 类型=[${dataTypes.join(', ')}] 交易所=[${targetExchanges.join(', ')}] / Subscribing market data`);

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

      // 初始化订阅到连接的映射 / Initialize subscription to connection mapping
      this.subscriptionToConnection.set(exchange, new Map());

      // 初始化连接池 / Initialize connection pool
      this.connectionPools.set(exchange, new Map());

      // 初始化最后数据接收时间 / Initialize last data received time
      this.lastDataTime.set(exchange, new Map());

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

    // 遍历所有连接池 / Iterate all connection pools
    for (const [exchange, pool] of this.connectionPools) {
      // 停止所有数据超时检测 / Stop all data timeout checks
      this._stopDataTimeoutCheck(exchange);

      // 遍历连接池中的所有连接 / Iterate all connections in the pool
      for (const [connectionId, connInfo] of pool) {
        // 停止心跳 / Stop heartbeat
        this._stopHeartbeatForConnection(exchange, connectionId);

        // 关闭连接 / Close connection
        if (connInfo.ws && connInfo.ws.readyState === WebSocket.OPEN) {
          connInfo.ws.close(1000, 'Client disconnect');
        }
      }

      // 清空连接池 / Clear connection pool
      pool.clear();
    }

    // 遍历旧的单连接映射 (向后兼容) / Iterate old single connection map (backward compatibility)
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

  // ============================================
  // 私有方法 - Binance Combined Stream / Private Methods - Binance Combined Stream
  // ============================================

  /**
   * 生成唯一的连接 ID
   * Generate unique connection ID
   *
   * @returns {string} 连接 ID / Connection ID
   * @private
   */
  _generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取 Binance 的 Combined Stream URL
   * Get Binance Combined Stream URL
   *
   * @param {Array<string>} streams - 流名称数组 / Stream name array
   * @returns {string} Combined Stream URL
   * @private
   */
  _getBinanceCombinedStreamUrl(streams) {
    const tradingType = this.config.tradingType;
    const streamBaseUrl = tradingType === 'spot'
      ? 'wss://stream.binance.com:9443/stream'
      : 'wss://fstream.binance.com/stream';
    const wsBaseUrl = tradingType === 'spot'
      ? 'wss://stream.binance.com:9443/ws'
      : 'wss://fstream.binance.com/ws';

    // 如果没有流，返回基础 URL / If no streams, return WS base URL
    if (!streams || streams.length === 0) {
      return wsBaseUrl;
    }

    // 构建 Combined Stream URL / Build Combined Stream URL
    return `${streamBaseUrl}?streams=${streams.join('/')}`;
  }

  /**
   * 将订阅键转换为 Binance 流名称
   * Convert subscription key to Binance stream name
   *
   * @param {string} subKey - 订阅键 (格式: dataType:symbol) / Subscription key (format: dataType:symbol)
   * @returns {string} Binance 流名称 / Binance stream name
   * @private
   */
  _subscriptionKeyToBinanceStream(subKey) {
    const [dataType, symbol] = subKey.split(':');
    const binanceSymbol = symbol.replace('/', '').toLowerCase();

    switch (dataType) {
      case DATA_TYPES.TICKER:
        return `${binanceSymbol}@ticker`;
      case DATA_TYPES.DEPTH:
        return `${binanceSymbol}@depth20@100ms`;
      case DATA_TYPES.TRADE:
        return `${binanceSymbol}@trade`;
      case DATA_TYPES.FUNDING_RATE:
        return `${binanceSymbol}@markPrice@1s`;
      case DATA_TYPES.KLINE:
        return `${binanceSymbol}@kline_1h`;
      default:
        return `${binanceSymbol}@ticker`;
    }
  }

  /**
   * 为 Binance 创建新的 Combined Stream 连接
   * Create new Combined Stream connection for Binance
   *
   * @param {Array<string>} subscriptionKeys - 订阅键数组 / Subscription key array
   * @returns {Promise<string>} 连接 ID / Connection ID
   * @private
   */
  async _createBinanceCombinedStreamConnection(subscriptionKeys = []) {
    const exchange = 'binance';
    const connectionId = this._generateConnectionId();

    // 转换订阅键为流名称 / Convert subscription keys to stream names
    const streams = subscriptionKeys.map(key => this._subscriptionKeyToBinanceStream(key));

    // 获取 Combined Stream URL / Get Combined Stream URL
    const wsUrl = this._getBinanceCombinedStreamUrl(streams);

    console.log(`${this.logPrefix} Binance 创建 Combined Stream 连接 / Creating Combined Stream connection: ${connectionId}, streams: ${streams.length}`);

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
          console.log(`${this.logPrefix} Binance Combined Stream 连接成功 / Connected: ${connectionId}`);

          // 创建连接信息对象 / Create connection info object
          const connInfo = {
            ws,
            subscriptions: new Set(subscriptionKeys),
            lastDataTime: Date.now(),
            connectionId,
          };

          // 存储到连接池 / Store in connection pool
          const pool = this.connectionPools.get(exchange);
          pool.set(connectionId, connInfo);

          // 更新订阅到连接的映射 / Update subscription to connection mapping
          const subToConn = this.subscriptionToConnection.get(exchange);
          for (const subKey of subscriptionKeys) {
            subToConn.set(subKey, connectionId);
          }

          // 更新最后数据时间 / Update last data time
          const lastDataTimeMap = this.lastDataTime.get(exchange);
          lastDataTimeMap.set(connectionId, Date.now());

          // 更新连接状态 / Update connection status
          const status = this.connectionStatus.get(exchange);
          status.connected = true;
          status.reconnecting = false;
          status.attempt = 0;

          // 启动心跳 / Start heartbeat
          this._startHeartbeatForConnection(exchange, connectionId);

          // 启动数据超时检测 / Start data timeout check
          this._startDataTimeoutCheck(exchange, connectionId);

          resolve(connectionId);
        });

        ws.on('message', (data) => {
          // 更新最后数据接收时间 / Update last data received time
          const lastDataTimeMap = this.lastDataTime.get(exchange);
          if (lastDataTimeMap) {
            lastDataTimeMap.set(connectionId, Date.now());
          }

          // 处理消息 / Handle message
          this._handleBinanceCombinedStreamMessage(connectionId, data);
        });

        ws.on('error', (error) => {
          console.error(`${this.logPrefix} Binance Combined Stream 错误 / Error [${connectionId}]:`, error.message);
          this.stats.errors++;
          this.emit('error', { exchange, connectionId, error });
        });

        ws.on('close', (code, reason) => {
          console.log(`${this.logPrefix} Binance Combined Stream 关闭 / Closed [${connectionId}] - Code: ${code}`);

          // 停止心跳 / Stop heartbeat
          this._stopHeartbeatForConnection(exchange, connectionId);

          // 停止数据超时检测 / Stop data timeout check
          this._stopDataTimeoutCheckForConnection(exchange, connectionId);

          // 从连接池移除 / Remove from connection pool
          const pool = this.connectionPools.get(exchange);
          const connInfo = pool.get(connectionId);

          if (connInfo) {
            // 获取此连接的所有订阅 / Get all subscriptions for this connection
            const subscriptionsToReconnect = Array.from(connInfo.subscriptions);
            pool.delete(connectionId);

            // 从订阅到连接映射中移除 / Remove from subscription to connection mapping
            const subToConn = this.subscriptionToConnection.get(exchange);
            for (const subKey of subscriptionsToReconnect) {
              subToConn.delete(subKey);
            }

            // 如果有订阅需要重连，则尝试重连 / If there are subscriptions to reconnect, attempt reconnection
            if (this.running && this.config.reconnect.enabled && subscriptionsToReconnect.length > 0) {
              this._attemptBinanceCombinedStreamReconnect(subscriptionsToReconnect);
            }
          }

          // 检查是否还有活跃连接 / Check if there are still active connections
          if (pool.size === 0) {
            const status = this.connectionStatus.get(exchange);
            status.connected = false;
          }

          this.emit('disconnected', { exchange, connectionId, code, reason: reason.toString() });
        });

        ws.on('pong', () => {
          const lastDataTimeMap = this.lastDataTime.get(exchange);
          if (lastDataTimeMap) {
            lastDataTimeMap.set(connectionId, Date.now());
          }
        });

      } catch (error) {
        console.error(`${this.logPrefix} 创建 Binance Combined Stream 失败 / Failed to create Combined Stream:`, error.message);
        reject(error);
      }
    });
  }

  /**
   * 处理 Binance Combined Stream 消息
   * Handle Binance Combined Stream message
   *
   * @param {string} connectionId - 连接 ID / Connection ID
   * @param {Buffer|string} rawData - 原始消息数据 / Raw message data
   * @private
   */
  _handleBinanceCombinedStreamMessage(connectionId, rawData) {
    try {
      const message = JSON.parse(rawData.toString());

      // Combined Stream 消息格式: { stream: "btcusdt@ticker", data: {...} }
      if (message.stream && message.data) {
        // 转换为标准消息格式并处理 / Convert to standard message format and process
        this._handleMessage('binance', JSON.stringify(message.data));
      } else {
        // 非数据消息 (如订阅确认) / Non-data message (e.g., subscription confirmation)
        this._handleMessage('binance', rawData);
      }
    } catch (error) {
      console.error(`${this.logPrefix} 解析 Binance Combined Stream 消息失败 / Failed to parse Combined Stream message:`, error.message);
    }
  }

  /**
   * 尝试重连 Binance Combined Stream
   * Attempt to reconnect Binance Combined Stream
   *
   * @param {Array<string>} subscriptionKeys - 需要重新订阅的订阅键 / Subscription keys to resubscribe
   * @private
   */
  async _attemptBinanceCombinedStreamReconnect(subscriptionKeys) {
    const exchange = 'binance';
    const status = this.connectionStatus.get(exchange);

    // 计算延迟 / Calculate delay
    const delay = Math.min(
      this.config.reconnect.baseDelay * Math.pow(2, status.attempt),
      this.config.reconnect.maxDelay
    );

    console.log(`${this.logPrefix} Binance Combined Stream 将在 ${delay}ms 后重连 / Will reconnect in ${delay}ms, subscriptions: ${subscriptionKeys.length}`);

    setTimeout(async () => {
      if (!this.running) return;

      try {
        // 按配置的最大订阅数分组 / Group by configured max subscriptions
        const maxSubs = this.config.connectionPool.maxSubscriptionsPerConnection;
        const chunks = [];
        for (let i = 0; i < subscriptionKeys.length; i += maxSubs) {
          chunks.push(subscriptionKeys.slice(i, i + maxSubs));
        }

        // 为每个分组创建新连接 / Create new connection for each chunk
        for (const chunk of chunks) {
          await this._createBinanceCombinedStreamConnection(chunk);
        }

        status.attempt = 0;
      } catch (error) {
        status.attempt++;
        if (status.attempt < this.config.reconnect.maxAttempts) {
          this._attemptBinanceCombinedStreamReconnect(subscriptionKeys);
        } else {
          console.error(`${this.logPrefix} Binance Combined Stream 重连失败，已达最大重试次数 / Reconnect failed, max attempts reached`);
        }
      }
    }, delay);
  }

  /**
   * 获取或创建 Binance 连接用于新订阅
   * Get or create Binance connection for new subscription
   *
   * @param {string} subKey - 订阅键 / Subscription key
   * @returns {Promise<string>} 连接 ID / Connection ID
   * @private
   */
  async _getOrCreateBinanceConnection(subKey) {
    const exchange = 'binance';
    const pool = this.connectionPools.get(exchange);
    const maxSubs = this.config.connectionPool.maxSubscriptionsPerConnection;

    // 查找有空余容量的连接 / Find connection with available capacity
    for (const [connectionId, connInfo] of pool) {
      if (connInfo.subscriptions.size < maxSubs) {
        return connectionId;
      }
    }

    // 没有可用连接，创建新连接 / No available connection, create new one
    return await this._createBinanceCombinedStreamConnection([subKey]);
  }

  /**
   * 向 Binance 连接添加订阅
   * Add subscription to Binance connection
   *
   * @param {string} connectionId - 连接 ID / Connection ID
   * @param {string} subKey - 订阅键 / Subscription key
   * @private
   */
  _addSubscriptionToBinanceConnection(connectionId, subKey) {
    const exchange = 'binance';
    const pool = this.connectionPools.get(exchange);
    const connInfo = pool.get(connectionId);

    if (!connInfo || !connInfo.ws || connInfo.ws.readyState !== WebSocket.OPEN) {
      console.warn(`${this.logPrefix} Binance connection not available: ${connectionId}`);
      return false;
    }

    if (connInfo.subscriptions.has(subKey)) {
      const subToConn = this.subscriptionToConnection.get(exchange);
      subToConn.set(subKey, connectionId);
      return true;
    }

    // Add to connection's subscription set
    connInfo.subscriptions.add(subKey);

    // Update subscription to connection mapping
    const subToConn = this.subscriptionToConnection.get(exchange);
    subToConn.set(subKey, connectionId);

    // Send subscription message
    const stream = this._subscriptionKeyToBinanceStream(subKey);
    const message = {
      method: 'SUBSCRIBE',
      params: [stream],
      id: Date.now(),
    };
    connInfo.ws.send(JSON.stringify(message));

    console.log(`${this.logPrefix} Binance subscribed [${connectionId}]: ${subKey}`);
    return true;
  }

  /**
   * 从 Binance 连接移除订阅
   * Remove subscription from Binance connection
   *
   * @param {string} subKey - 订阅键 / Subscription key
   * @private
   */
  _removeSubscriptionFromBinanceConnection(subKey) {
    const exchange = 'binance';
    const subToConn = this.subscriptionToConnection.get(exchange);
    const connectionId = subToConn.get(subKey);

    if (!connectionId) return;

    const pool = this.connectionPools.get(exchange);
    const connInfo = pool.get(connectionId);

    if (connInfo) {
      // 从连接的订阅集合移除 / Remove from connection's subscription set
      connInfo.subscriptions.delete(subKey);

      // 发送取消订阅消息 / Send unsubscribe message
      if (connInfo.ws && connInfo.ws.readyState === WebSocket.OPEN) {
        const stream = this._subscriptionKeyToBinanceStream(subKey);
        const message = {
          method: 'UNSUBSCRIBE',
          params: [stream],
          id: Date.now(),
        };
        connInfo.ws.send(JSON.stringify(message));
      }

      console.log(`${this.logPrefix} Binance 已取消订阅 / Unsubscribed [${connectionId}]: ${subKey}`);
    }

    // 从映射中移除 / Remove from mapping
    subToConn.delete(subKey);
  }

  /**
   * 连接到指定交易所
   * Connect to specified exchange
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  async _connectExchange(exchange) {
    // KuCoin 需要特殊处理：先获取动态 WebSocket URL 和 token
    // KuCoin requires special handling: get dynamic WebSocket URL and token first
    let wsUrl;
    let connectId = null;

    if (exchange === 'kucoin') {
      try {
        const wsInfo = await this._getKuCoinWebSocketInfo();
        wsUrl = wsInfo.url;
        connectId = wsInfo.connectId;
        console.log(`${this.logPrefix} KuCoin WebSocket token 已获取 / KuCoin WebSocket token obtained`);
      } catch (error) {
        console.error(`${this.logPrefix} 获取 KuCoin WebSocket token 失败 / Failed to get KuCoin WebSocket token:`, error.message);
        throw error;
      }
    } else {
      // 其他交易所使用静态 URL / Other exchanges use static URL
      wsUrl = this._getWsUrl(exchange);
    }

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

          // 初始化最后数据时间 / Initialize last data time
          this._updateLastDataTime(exchange);

          // 同步时间 / Sync time
          this._syncTime(exchange);

          // 启动心跳 / Start heartbeat
          this._startHeartbeat(exchange);

          // 启动数据超时检测 / Start data timeout check
          this._startDataTimeoutCheck(exchange);

          // 重新订阅 / Resubscribe
          this._resubscribe(exchange);

          // 发出连接事件 / Emit connected event
          this.emit('connected', { exchange });

          // 解析 Promise / Resolve promise
          resolve();
        });

        // 接收消息事件 / Message received event
        ws.on('message', (data) => {
          // 更新最后数据接收时间 / Update last data received time
          this._updateLastDataTime(exchange);

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

          // 停止数据超时检测 / Stop data timeout check
          this._stopDataTimeoutCheck(exchange);

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
          // 更新最后数据时间 / Update last data time
          this._updateLastDataTime(exchange);

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

      case 'gate':
        // Gate.io: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot'
          ? WS_ENDPOINTS.gate.spot
          : WS_ENDPOINTS.gate.futures;

      case 'bitget':
        // Bitget: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot'
          ? WS_ENDPOINTS.bitget.spot
          : WS_ENDPOINTS.bitget.futures;

      case 'kucoin':
        // KuCoin: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot'
          ? WS_ENDPOINTS.kucoin.spot
          : WS_ENDPOINTS.kucoin.futures;

      case 'kraken':
        // Kraken: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot'
          ? WS_ENDPOINTS.kraken.spot
          : WS_ENDPOINTS.kraken.futures;

      default:
        // 不支持的交易所 / Unsupported exchange
        throw new Error(`不支持的交易所 / Unsupported exchange: ${exchange}`);
    }
  }

  /**
   * 获取 KuCoin WebSocket 连接信息
   * Get KuCoin WebSocket connection info
   *
   * KuCoin 要求先调用 REST API 获取动态的 WebSocket 服务器地址和 token
   * KuCoin requires calling REST API first to get dynamic WebSocket server URL and token
   *
   * @returns {Promise<Object>} WebSocket 连接信息 / WebSocket connection info
   * @private
   */
  async _getKuCoinWebSocketInfo() {
    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot';
    const apiUrl = isSpot
      ? WS_ENDPOINTS.kucoin.spotTokenApi
      : WS_ENDPOINTS.kucoin.futuresTokenApi;

    try {
      // 调用 KuCoin REST API 获取 WebSocket token / Call KuCoin REST API to get WebSocket token
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // 检查响应状态 / Check response status
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 解析响应 / Parse response
      const result = await response.json();

      // 检查返回码 / Check return code
      if (result.code !== '200000') {
        throw new Error(`KuCoin API error: ${result.msg || result.code}`);
      }

      // 获取数据 / Get data
      const data = result.data;

      // 获取 WebSocket 服务器信息 / Get WebSocket server info
      // KuCoin 返回的服务器列表中选择第一个 / Select the first server from KuCoin's server list
      const server = data.instanceServers[0];
      const token = data.token;

      // 构建 WebSocket URL / Build WebSocket URL
      // 格式: wss://server.endpoint?token=xxx&connectId=xxx
      const connectId = `${Date.now()}`;
      const wsUrl = `${server.endpoint}?token=${token}&connectId=${connectId}`;

      // 存储 ping 间隔用于心跳 / Store ping interval for heartbeat
      this._kucoinPingInterval = server.pingInterval || 18000;
      this._kucoinPingTimeout = server.pingTimeout || 10000;

      console.log(`${this.logPrefix} KuCoin WebSocket 服务器 / KuCoin WebSocket server: ${server.endpoint}`);
      console.log(`${this.logPrefix} KuCoin Ping 间隔 / KuCoin Ping interval: ${this._kucoinPingInterval}ms`);

      return {
        url: wsUrl,
        token,
        connectId,
        pingInterval: server.pingInterval,
        pingTimeout: server.pingTimeout,
      };

    } catch (error) {
      console.error(`${this.logPrefix} 获取 KuCoin WebSocket 信息失败 / Failed to get KuCoin WebSocket info:`, error.message);
      throw error;
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

    // 确定心跳间隔 / Determine heartbeat interval
    // KuCoin 使用服务器返回的间隔，其他交易所使用配置的间隔
    // KuCoin uses server-returned interval, others use configured interval
    let heartbeatInterval = this.config.heartbeat.interval;
    if (exchange === 'kucoin' && this._kucoinPingInterval) {
      // KuCoin 要求在 pingTimeout 之前发送 ping
      // KuCoin requires sending ping before pingTimeout
      heartbeatInterval = this._kucoinPingInterval;
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
        } else if (exchange === 'gate') {
          // Gate.io 使用 ping 消息 / Gate.io uses ping message
          // 现货和合约使用不同的格式 / Spot and futures use different formats
          const pingMessage = this.config.tradingType === 'spot'
            ? { time: Math.floor(Date.now() / 1000), channel: 'spot.ping' }
            : { time: Math.floor(Date.now() / 1000), channel: 'futures.ping' };
          ws.send(JSON.stringify(pingMessage));
        } else if (exchange === 'bitget') {
          // Bitget 使用 ping 字符串 / Bitget uses ping string
          ws.send('ping');
        } else if (exchange === 'kucoin') {
          // KuCoin 使用 JSON 格式的 ping 消息 / KuCoin uses JSON format ping message
          // 格式: {"id":"xxx","type":"ping"}
          ws.send(JSON.stringify({
            id: Date.now().toString(),
            type: 'ping',
          }));
        } else if (exchange === 'kraken') {
          // Kraken 根据交易类型使用不同的心跳格式 / Kraken uses different heartbeat format based on trading type
          if (this.config.tradingType === 'spot') {
            // 现货使用 ping 事件 / Spot uses ping event
            ws.send(JSON.stringify({ event: 'ping' }));
          } else {
            // 合约使用 heartbeat 事件 / Futures uses heartbeat event
            ws.send(JSON.stringify({ event: 'heartbeat' }));
          }
        } else {
          // Binance 使用 WebSocket ping / Binance uses WebSocket ping
          ws.ping();
        }
      }
    }, heartbeatInterval);

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
      if (timer instanceof Map) {
        // 连接池模式 / Connection pool mode
        for (const [, t] of timer) {
          clearInterval(t);
        }
      } else {
        clearInterval(timer);
      }
    }

    // 清空映射 / Clear map
    this.heartbeatTimers.clear();
  }

  /**
   * 为连接池中的特定连接启动心跳
   * Start heartbeat for specific connection in pool
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} connectionId - 连接 ID / Connection ID
   * @private
   */
  _startHeartbeatForConnection(exchange, connectionId) {
    if (!this.config.heartbeat.enabled) return;

    const pool = this.connectionPools.get(exchange);
    const connInfo = pool?.get(connectionId);
    if (!connInfo || !connInfo.ws) return;

    // 获取或创建心跳定时器映射 / Get or create heartbeat timer map
    let timerMap = this.heartbeatTimers.get(exchange);
    if (!(timerMap instanceof Map)) {
      timerMap = new Map();
      this.heartbeatTimers.set(exchange, timerMap);
    }

    // 停止现有心跳 / Stop existing heartbeat
    const existingTimer = timerMap.get(connectionId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    const heartbeatInterval = this.config.heartbeat.interval;

    const timer = setInterval(() => {
      if (connInfo.ws && connInfo.ws.readyState === WebSocket.OPEN) {
        // Binance 使用 WebSocket ping / Binance uses WebSocket ping
        connInfo.ws.ping();
      }
    }, heartbeatInterval);

    timerMap.set(connectionId, timer);
  }

  /**
   * 停止连接池中特定连接的心跳
   * Stop heartbeat for specific connection in pool
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} connectionId - 连接 ID / Connection ID
   * @private
   */
  _stopHeartbeatForConnection(exchange, connectionId) {
    const timerMap = this.heartbeatTimers.get(exchange);
    if (timerMap instanceof Map) {
      const timer = timerMap.get(connectionId);
      if (timer) {
        clearInterval(timer);
        timerMap.delete(connectionId);
      }
    }
  }

  // ============================================
  // 私有方法 - 数据超时检测 / Private Methods - Data Timeout Detection
  // ============================================

  /**
   * 启动数据超时检测
   * Start data timeout check
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} connectionId - 连接 ID (可选，用于连接池模式) / Connection ID (optional, for connection pool mode)
   * @private
   */
  _startDataTimeoutCheck(exchange, connectionId = null) {
    if (!this.config.dataTimeout.enabled) return;

    const checkInterval = this.config.dataTimeout.checkInterval;
    const timeout = this.config.dataTimeout.timeout;

    // 获取或创建数据超时定时器映射 / Get or create data timeout timer map
    let timerMap = this.dataTimeoutTimers.get(exchange);
    if (!timerMap) {
      timerMap = new Map();
      this.dataTimeoutTimers.set(exchange, timerMap);
    }

    const timerId = connectionId || 'default';

    // 停止现有检测 / Stop existing check
    const existingTimer = timerMap.get(timerId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    const timer = setInterval(() => {
      this._checkDataTimeout(exchange, connectionId);
    }, checkInterval);

    timerMap.set(timerId, timer);

    console.log(`${this.logPrefix} ${exchange} 数据超时检测已启动 / Data timeout check started${connectionId ? ` [${connectionId}]` : ''}`);
  }

  /**
   * 停止数据超时检测
   * Stop data timeout check
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _stopDataTimeoutCheck(exchange) {
    const timerMap = this.dataTimeoutTimers.get(exchange);
    if (timerMap) {
      for (const [, timer] of timerMap) {
        clearInterval(timer);
      }
      timerMap.clear();
    }
  }

  /**
   * 停止特定连接的数据超时检测
   * Stop data timeout check for specific connection
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} connectionId - 连接 ID / Connection ID
   * @private
   */
  _stopDataTimeoutCheckForConnection(exchange, connectionId) {
    const timerMap = this.dataTimeoutTimers.get(exchange);
    if (timerMap) {
      const timer = timerMap.get(connectionId);
      if (timer) {
        clearInterval(timer);
        timerMap.delete(connectionId);
      }
    }
  }

  /**
   * 检查数据超时并触发重连
   * Check data timeout and trigger reconnection
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} connectionId - 连接 ID (可选) / Connection ID (optional)
   * @private
   */
  _checkDataTimeout(exchange, connectionId = null) {
    const timeout = this.config.dataTimeout.timeout;
    const now = Date.now();

    if (connectionId) {
      // 连接池模式 / Connection pool mode
      const lastDataTimeMap = this.lastDataTime.get(exchange);
      const lastTime = lastDataTimeMap?.get(connectionId);

      if (lastTime && (now - lastTime) > timeout) {
        console.warn(`${this.logPrefix} ${exchange} [${connectionId}] 数据超时 (${now - lastTime}ms)，触发重连 / Data timeout, triggering reconnection`);

        // 获取连接信息 / Get connection info
        const pool = this.connectionPools.get(exchange);
        const connInfo = pool?.get(connectionId);

        if (connInfo && connInfo.ws) {
          // 关闭连接触发重连 / Close connection to trigger reconnection
          connInfo.ws.close(4000, 'Data timeout');
        }
      }
    } else {
      // 单连接模式 / Single connection mode
      const lastTimeMap = this.lastDataTime.get(exchange);
      const lastTime = lastTimeMap?.get('default') || 0;

      if (lastTime && (now - lastTime) > timeout) {
        console.warn(`${this.logPrefix} ${exchange} 数据超时 (${now - lastTime}ms)，触发重连 / Data timeout, triggering reconnection`);

        const ws = this.connections.get(exchange);
        if (ws) {
          ws.close(4000, 'Data timeout');
        }
      }
    }
  }

  /**
   * 更新最后数据接收时间 (用于单连接模式)
   * Update last data received time (for single connection mode)
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _updateLastDataTime(exchange) {
    let lastDataTimeMap = this.lastDataTime.get(exchange);
    if (!lastDataTimeMap) {
      lastDataTimeMap = new Map();
      this.lastDataTime.set(exchange, lastDataTimeMap);
    }
    lastDataTimeMap.set('default', Date.now());
  }

  /**
   * 标准化交易对格式
   * Normalize symbol format
   *
   * 移除永续合约的 :USDT 后缀，确保订阅键与数据键格式一致
   * Remove :USDT suffix for perpetual contracts to ensure subscription key matches data key format
   *
   * @param {string} symbol - 交易对 / Trading pair (e.g., BTC/USDT:USDT or BTC/USDT)
   * @returns {string} 标准化的交易对 / Normalized symbol (e.g., BTC/USDT)
   * @private
   */
  _normalizeSymbol(symbol) {
    // 移除永续合约的 :USDT 后缀 / Remove perpetual contract :USDT suffix
    // BTC/USDT:USDT -> BTC/USDT
    // ETH/USDT:USDT -> ETH/USDT
    return symbol.replace(/:USDT$/, '');
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
    // 标准化交易对格式 / Normalize symbol format
    // 确保订阅键与数据键格式一致 / Ensure subscription key matches data key format
    const normalizedSymbol = this._normalizeSymbol(symbol);

    // 构建订阅键 / Build subscription key
    const subKey = `${dataType}:${normalizedSymbol}`;

    // 获取订阅集合 / Get subscription set
    const subs = this.subscriptions.get(exchange);

    // 如果已订阅，跳过 / If already subscribed, skip
    if (subs.has(subKey)) {
      return;
    }

    // Binance 使用 Combined Stream 连接池 / Binance uses Combined Stream connection pool
    if (exchange === 'binance' && this.config.connectionPool.useCombinedStream) {
      try {
        // 获取或创建连接 / Get or create connection
        const connectionId = await this._getOrCreateBinanceConnection(subKey);

        // 添加订阅到连接 / Add subscription to connection
        if (this._addSubscriptionToBinanceConnection(connectionId, subKey)) {
          // 添加到全局订阅集合 / Add to global subscription set
          subs.add(subKey);
        }
      } catch (error) {
        console.error(`${this.logPrefix} Binance 订阅失败 / Subscription failed: ${subKey}`, error.message);
      }
      return;
    }

    // 其他交易所使用单连接模式 / Other exchanges use single connection mode
    const ws = this.connections.get(exchange);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(`${this.logPrefix} ${exchange} 未连接，跳过订阅 / Not connected, skipping subscription`);
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
    // 标准化交易对格式 / Normalize symbol format
    // 确保订阅键与数据键格式一致 / Ensure subscription key matches data key format
    const normalizedSymbol = this._normalizeSymbol(symbol);

    // 构建订阅键 / Build subscription key
    const subKey = `${dataType}:${normalizedSymbol}`;

    // 获取订阅集合 / Get subscription set
    const subs = this.subscriptions.get(exchange);

    // 如果未订阅，跳过 / If not subscribed, skip
    if (!subs.has(subKey)) {
      return;
    }

    // 从订阅集合移除 / Remove from subscription set
    subs.delete(subKey);

    // Binance 使用 Combined Stream 连接池 / Binance uses Combined Stream connection pool
    if (exchange === 'binance' && this.config.connectionPool.useCombinedStream) {
      this._removeSubscriptionFromBinanceConnection(subKey);
      return;
    }

    // 其他交易所使用单连接模式 / Other exchanges use single connection mode
    const ws = this.connections.get(exchange);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

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

    // 先复制订阅列表，避免在迭代时修改 Set / Copy subscriptions first to avoid modifying Set during iteration
    const subsArray = Array.from(subs);

    // 清空订阅集合 / Clear subscription set
    subs.clear();

    // 遍历复制的订阅列表 / Iterate copied subscription list
    for (const subKey of subsArray) {
      // 解析订阅键 / Parse subscription key
      const [dataType, symbol] = subKey.split(':');

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

      case 'gate':
        return this._buildGateSubscribeMessage(symbol, dataType);

      case 'bitget':
        return this._buildBitgetSubscribeMessage(symbol, dataType);

      case 'kucoin':
        return this._buildKuCoinSubscribeMessage(symbol, dataType);

      case 'kraken':
        return this._buildKrakenSubscribeMessage(symbol, dataType);

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

      case 'gate':
        // Gate.io 取消订阅使用相同格式但 event 为 unsubscribe / Gate.io unsubscribe uses same format but event is unsubscribe
        return { ...subMsg, event: 'unsubscribe' };

      case 'bitget':
        // Bitget 取消订阅使用相同格式但 op 为 unsubscribe / Bitget unsubscribe uses same format but op is unsubscribe
        return { ...subMsg, op: 'unsubscribe' };

      case 'kucoin':
        // KuCoin 取消订阅使用相同格式但 type 为 unsubscribe / KuCoin unsubscribe uses same format but type is unsubscribe
        return { ...subMsg, type: 'unsubscribe' };

      case 'kraken':
        // Kraken 取消订阅使用相同格式但 event 为 unsubscribe / Kraken unsubscribe uses same format but event is unsubscribe
        return { ...subMsg, event: 'unsubscribe' };

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
   * 构建 Gate.io 订阅消息
   * Build Gate.io subscription message
   *
   * Gate.io WebSocket 订阅格式 / Gate.io WebSocket subscription format:
   * 现货 / Spot: { time, channel: 'spot.xxx', event: 'subscribe', payload: [...] }
   * 合约 / Futures: { time, channel: 'futures.xxx', event: 'subscribe', payload: [...] }
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildGateSubscribeMessage(symbol, dataType) {
    // 转换交易对格式: BTC/USDT -> BTC_USDT (现货) 或 BTC_USDT (合约)
    // Convert symbol format: BTC/USDT -> BTC_USDT (spot) or BTC_USDT (futures)
    const gateSymbol = symbol.replace('/', '_');

    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot';
    const prefix = isSpot ? 'spot' : 'futures';

    // 根据数据类型构建频道和 payload / Build channel and payload based on data type
    let channel;
    let payload;

    switch (dataType) {
      case DATA_TYPES.TICKER:
        // 行情数据 / Ticker data
        channel = `${prefix}.tickers`;
        payload = [gateSymbol];
        break;

      case DATA_TYPES.DEPTH:
        // 深度数据 / Depth data
        // 现货: spot.order_book_update, 合约: futures.order_book_update
        // Spot: spot.order_book_update, Futures: futures.order_book_update
        channel = isSpot ? 'spot.order_book_update' : 'futures.order_book_update';
        // 参数: [symbol, interval, depth] / Args: [symbol, interval, depth]
        payload = isSpot ? [gateSymbol, '100ms'] : [gateSymbol, '20', '0'];
        break;

      case DATA_TYPES.TRADE:
        // 逐笔成交 / Trade data
        channel = `${prefix}.trades`;
        payload = [gateSymbol];
        break;

      case DATA_TYPES.FUNDING_RATE:
        // 资金费率 (仅合约) / Funding rate (futures only)
        if (isSpot) {
          throw new Error('资金费率仅适用于合约 / Funding rate only available for futures');
        }
        // 使用 tickers 频道获取资金费率信息 / Use tickers channel to get funding rate info
        channel = 'futures.tickers';
        payload = [gateSymbol];
        break;

      case DATA_TYPES.KLINE:
        // K线数据 / Kline data
        channel = `${prefix}.candlesticks`;
        // 参数: [interval, symbol] / Args: [interval, symbol]
        payload = ['1h', gateSymbol];
        break;

      default:
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`);
    }

    // 返回 Gate.io 格式的订阅消息 / Return Gate.io format subscription message
    return {
      time: Math.floor(Date.now() / 1000),  // Unix 时间戳 (秒) / Unix timestamp (seconds)
      channel,                               // 频道名称 / Channel name
      event: 'subscribe',                    // 订阅事件 / Subscribe event
      payload,                               // 订阅参数 / Subscription payload
    };
  }

  /**
   * 构建 Bitget 订阅消息
   * Build Bitget subscription message
   *
   * Bitget WebSocket V2 订阅格式 / Bitget WebSocket V2 subscription format:
   * { op: 'subscribe', args: [{ instType, channel, instId }] }
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildBitgetSubscribeMessage(symbol, dataType) {
    // 转换交易对格式: BTC/USDT -> BTCUSDT (现货) 或 BTCUSDT (合约)
    // Convert symbol format: BTC/USDT -> BTCUSDT (spot) or BTCUSDT (futures)
    const bitgetSymbol = symbol.replace('/', '');

    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot';
    const instType = isSpot ? 'SPOT' : 'USDT-FUTURES';

    // 根据数据类型构建频道和参数 / Build channel and args based on data type
    let channel;
    let instId = bitgetSymbol;

    switch (dataType) {
      case DATA_TYPES.TICKER:
        // 行情数据 / Ticker data
        channel = 'ticker';
        break;

      case DATA_TYPES.DEPTH:
        // 深度数据 / Depth data
        // Bitget 深度频道格式 / Bitget depth channel format
        channel = 'books15';  // 15档深度 / 15 levels depth
        break;

      case DATA_TYPES.TRADE:
        // 逐笔成交 / Trade data
        channel = 'trade';
        break;

      case DATA_TYPES.FUNDING_RATE:
        // 资金费率 (仅合约) / Funding rate (futures only)
        if (isSpot) {
          throw new Error('资金费率仅适用于合约 / Funding rate only available for futures');
        }
        // Bitget 使用 ticker 频道获取资金费率 / Bitget uses ticker channel for funding rate
        channel = 'ticker';
        break;

      case DATA_TYPES.KLINE:
        // K线数据 / Kline data
        // Bitget K线频道格式: candle1H / Bitget kline channel format: candle1H
        channel = 'candle1H';
        break;

      default:
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`);
    }

    // 返回 Bitget V2 格式的订阅消息 / Return Bitget V2 format subscription message
    return {
      op: 'subscribe',
      args: [{
        instType,      // 产品类型 / Instrument type
        channel,       // 频道名称 / Channel name
        instId,        // 产品 ID / Instrument ID
      }],
    };
  }

  /**
   * 构建 KuCoin 订阅消息
   * Build KuCoin subscription message
   *
   * KuCoin WebSocket 订阅格式 / KuCoin WebSocket subscription format:
   * { id: messageId, type: 'subscribe', topic: '/market/ticker:BTC-USDT', privateChannel: false, response: true }
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildKuCoinSubscribeMessage(symbol, dataType) {
    // 转换交易对格式: BTC/USDT -> BTC-USDT
    // Convert symbol format: BTC/USDT -> BTC-USDT
    const kucoinSymbol = symbol.replace('/', '-');

    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot';

    // 生成唯一消息 ID / Generate unique message ID
    const messageId = Date.now().toString();

    // 根据数据类型构建主题 / Build topic based on data type
    let topic;

    switch (dataType) {
      case DATA_TYPES.TICKER:
        // 行情数据 / Ticker data
        // 现货: /market/ticker:BTC-USDT
        // 合约: /contractMarket/tickerV2:XBTUSDTM
        if (isSpot) {
          topic = `/market/ticker:${kucoinSymbol}`;
        } else {
          // 合约交易对格式: BTC-USDT -> XBTUSDTM (需要特殊处理)
          const futuresSymbol = this._toKuCoinFuturesSymbol(symbol);
          topic = `/contractMarket/tickerV2:${futuresSymbol}`;
        }
        break;

      case DATA_TYPES.DEPTH:
        // 深度数据 / Depth data
        if (isSpot) {
          // 现货使用 level2Depth5 (5档) 或 level2Depth50 (50档)
          topic = `/spotMarket/level2Depth5:${kucoinSymbol}`;
        } else {
          const futuresSymbol = this._toKuCoinFuturesSymbol(symbol);
          topic = `/contractMarket/level2Depth5:${futuresSymbol}`;
        }
        break;

      case DATA_TYPES.TRADE:
        // 逐笔成交 / Trade data
        if (isSpot) {
          topic = `/market/match:${kucoinSymbol}`;
        } else {
          const futuresSymbol = this._toKuCoinFuturesSymbol(symbol);
          topic = `/contractMarket/execution:${futuresSymbol}`;
        }
        break;

      case DATA_TYPES.FUNDING_RATE:
        // 资金费率 (仅合约) / Funding rate (futures only)
        if (isSpot) {
          throw new Error('资金费率仅适用于合约 / Funding rate only available for futures');
        }
        const futuresSymbol = this._toKuCoinFuturesSymbol(symbol);
        topic = `/contract/instrument:${futuresSymbol}`;
        break;

      case DATA_TYPES.KLINE:
        // K线数据 / Kline data
        if (isSpot) {
          // 现货K线: /market/candles:BTC-USDT_1hour
          topic = `/market/candles:${kucoinSymbol}_1hour`;
        } else {
          const futuresSymbol = this._toKuCoinFuturesSymbol(symbol);
          topic = `/contractMarket/candle:${futuresSymbol}_1hour`;
        }
        break;

      default:
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`);
    }

    // 返回 KuCoin 格式的订阅消息 / Return KuCoin format subscription message
    return {
      id: messageId,           // 消息 ID / Message ID
      type: 'subscribe',       // 订阅类型 / Subscribe type
      topic,                   // 主题 / Topic
      privateChannel: false,   // 公共频道 / Public channel
      response: true,          // 需要响应 / Need response
    };
  }

  /**
   * 构建 Kraken 订阅消息
   * Build Kraken subscription message
   *
   * Kraken WebSocket 订阅格式 / Kraken WebSocket subscription format:
   * 现货 / Spot: { event: 'subscribe', pair: ['XBT/USD'], subscription: { name: 'ticker' } }
   * 合约 / Futures: { event: 'subscribe', product_ids: ['PI_XBTUSD'], feed: 'ticker' }
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildKrakenSubscribeMessage(symbol, dataType) {
    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot';

    if (isSpot) {
      // 现货订阅格式 / Spot subscription format
      return this._buildKrakenSpotSubscribeMessage(symbol, dataType);
    } else {
      // 合约订阅格式 / Futures subscription format
      return this._buildKrakenFuturesSubscribeMessage(symbol, dataType);
    }
  }

  /**
   * 构建 Kraken 现货订阅消息
   * Build Kraken spot subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildKrakenSpotSubscribeMessage(symbol, dataType) {
    // 转换交易对格式: BTC/USDT -> XBT/USDT (Kraken 使用 XBT 代替 BTC)
    // Convert symbol format: BTC/USDT -> XBT/USDT (Kraken uses XBT instead of BTC)
    const krakenSymbol = this._toKrakenSpotSymbol(symbol);

    // 根据数据类型构建订阅名称 / Build subscription name based on data type
    let subscription;

    switch (dataType) {
      case DATA_TYPES.TICKER:
        // 行情数据 / Ticker data
        subscription = { name: 'ticker' };
        break;

      case DATA_TYPES.DEPTH:
        // 深度数据 (10档) / Depth data (10 levels)
        subscription = { name: 'book', depth: 10 };
        break;

      case DATA_TYPES.TRADE:
        // 逐笔成交 / Trade data
        subscription = { name: 'trade' };
        break;

      case DATA_TYPES.FUNDING_RATE:
        // 现货不支持资金费率 / Spot doesn't support funding rate
        throw new Error('资金费率仅适用于合约 / Funding rate only available for futures');

      case DATA_TYPES.KLINE:
        // K线数据 (60分钟) / Kline data (60 minutes)
        subscription = { name: 'ohlc', interval: 60 };
        break;

      default:
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`);
    }

    // 返回 Kraken 现货格式的订阅消息 / Return Kraken spot format subscription message
    return {
      event: 'subscribe',      // 订阅事件 / Subscribe event
      pair: [krakenSymbol],    // 交易对数组 / Trading pair array
      subscription,            // 订阅配置 / Subscription config
    };
  }

  /**
   * 构建 Kraken 合约订阅消息
   * Build Kraken futures subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildKrakenFuturesSubscribeMessage(symbol, dataType) {
    // 转换交易对格式: BTC/USDT -> PI_XBTUSD (Kraken Futures 格式)
    // Convert symbol format: BTC/USDT -> PI_XBTUSD (Kraken Futures format)
    const krakenFuturesSymbol = this._toKrakenFuturesSymbol(symbol);

    // 根据数据类型构建 feed / Build feed based on data type
    let feed;

    switch (dataType) {
      case DATA_TYPES.TICKER:
        // 行情数据 / Ticker data
        feed = 'ticker';
        break;

      case DATA_TYPES.DEPTH:
        // 深度数据 / Depth data
        feed = 'book';
        break;

      case DATA_TYPES.TRADE:
        // 逐笔成交 / Trade data
        feed = 'trade';
        break;

      case DATA_TYPES.FUNDING_RATE:
        // 资金费率 / Funding rate
        feed = 'ticker';  // Kraken Futures ticker 包含资金费率 / includes funding rate
        break;

      case DATA_TYPES.KLINE:
        // K线数据 (Kraken Futures 暂不支持 WebSocket K线)
        // Kline data (Kraken Futures doesn't support WebSocket kline yet)
        throw new Error('Kraken 合约暂不支持 WebSocket K线订阅 / Kraken futures does not support WebSocket kline subscription');

      default:
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`);
    }

    // 返回 Kraken Futures 格式的订阅消息 / Return Kraken Futures format subscription message
    return {
      event: 'subscribe',              // 订阅事件 / Subscribe event
      feed,                            // 数据类型 / Feed type
      product_ids: [krakenFuturesSymbol], // 产品 ID 数组 / Product ID array
    };
  }

  /**
   * 转换为 Kraken 现货交易对格式
   * Convert to Kraken spot symbol format
   *
   * @param {string} symbol - 标准交易对 (如 BTC/USDT) / Standard symbol
   * @returns {string} Kraken 现货交易对 (如 XBT/USDT) / Kraken spot symbol
   * @private
   */
  _toKrakenSpotSymbol(symbol) {
    // BTC/USDT -> XBT/USDT, ETH/USDT -> ETH/USDT
    const [base, quote] = symbol.split('/');
    // Kraken 使用 XBT 代替 BTC / Kraken uses XBT instead of BTC
    const krakenBase = base === 'BTC' ? 'XBT' : base;
    return `${krakenBase}/${quote}`;
  }

  /**
   * 转换为 Kraken 合约交易对格式
   * Convert to Kraken futures symbol format
   *
   * @param {string} symbol - 标准交易对 (如 BTC/USDT) / Standard symbol
   * @returns {string} Kraken 合约交易对 (如 PI_XBTUSD) / Kraken futures symbol
   * @private
   */
  _toKrakenFuturesSymbol(symbol) {
    // BTC/USDT -> PI_XBTUSD, ETH/USDT -> PI_ETHUSD
    const [base, quote] = symbol.split('/');
    // Kraken Futures 使用 XBT 代替 BTC / Kraken Futures uses XBT instead of BTC
    const krakenBase = base === 'BTC' ? 'XBT' : base;
    // 永续合约前缀为 PI_ / Perpetual prefix is PI_
    // 报价货币: USDT -> USD / Quote currency: USDT -> USD
    const krakenQuote = quote === 'USDT' ? 'USD' : quote;
    return `PI_${krakenBase}${krakenQuote}`;
  }

  /**
   * 从 Kraken 现货交易对转换为标准格式
   * Convert from Kraken spot symbol to standard format
   *
   * @param {string} symbol - Kraken 现货交易对 (如 XBT/USDT) / Kraken spot symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _fromKrakenSpotSymbol(symbol) {
    // XBT/USDT -> BTC/USDT, ETH/USDT -> ETH/USDT
    const [base, quote] = symbol.split('/');
    // XBT -> BTC
    const standardBase = base === 'XBT' ? 'BTC' : base;
    return `${standardBase}/${quote}`;
  }

  /**
   * 从 Kraken 合约交易对转换为标准格式
   * Convert from Kraken futures symbol to standard format
   *
   * @param {string} symbol - Kraken 合约交易对 (如 PI_XBTUSD) / Kraken futures symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _fromKrakenFuturesSymbol(symbol) {
    // PI_XBTUSD -> BTC/USDT, PI_ETHUSD -> ETH/USDT
    // 移除 PI_ 前缀 / Remove PI_ prefix
    const withoutPrefix = symbol.replace(/^PI_/, '');
    // 分离基础货币和报价货币 / Separate base and quote
    const quoteMatch = withoutPrefix.match(/(USD|EUR|GBP)$/);
    if (quoteMatch) {
      const quote = quoteMatch[1];
      let base = withoutPrefix.slice(0, -quote.length);
      // XBT -> BTC
      if (base === 'XBT') {
        base = 'BTC';
      }
      // USD -> USDT
      const standardQuote = quote === 'USD' ? 'USDT' : quote;
      return `${base}/${standardQuote}`;
    }
    return symbol;
  }

  /**
   * 转换为 KuCoin 合约交易对格式
   * Convert to KuCoin futures symbol format
   *
   * @param {string} symbol - 标准交易对 (如 BTC/USDT) / Standard symbol
   * @returns {string} KuCoin 合约交易对 (如 XBTUSDTM) / KuCoin futures symbol
   * @private
   */
  _toKuCoinFuturesSymbol(symbol) {
    // BTC/USDT -> XBTUSDTM, ETH/USDT -> ETHUSDTM
    const [base, quote] = symbol.split('/');
    // KuCoin 合约中 BTC 使用 XBT / KuCoin futures uses XBT for BTC
    const futuresBase = base === 'BTC' ? 'XBT' : base;
    return `${futuresBase}${quote}M`;
  }

  /**
   * 从 KuCoin 合约交易对转换为标准格式
   * Convert from KuCoin futures symbol to standard format
   *
   * @param {string} symbol - KuCoin 合约交易对 (如 XBTUSDTM) / KuCoin futures symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _fromKuCoinFuturesSymbol(symbol) {
    // XBTUSDTM -> BTC/USDT, ETHUSDTM -> ETH/USDT
    // 移除末尾的 M / Remove trailing M
    const withoutM = symbol.slice(0, -1);
    // 分离基础货币和报价货币 / Separate base and quote
    const quoteMatch = withoutM.match(/(USDT|USD|BTC)$/);
    if (quoteMatch) {
      const quote = quoteMatch[1];
      let base = withoutM.slice(0, -quote.length);
      // XBT -> BTC
      if (base === 'XBT') {
        base = 'BTC';
      }
      return `${base}/${quote}`;
    }
    return symbol;
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

      // 处理非 JSON 响应 (如 OKX 的 "pong", Bitget 的 "pong") / Handle non-JSON responses
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

        case 'gate':
          this._handleGateMessage(message);
          break;

        case 'bitget':
          this._handleBitgetMessage(message);
          break;

        case 'kucoin':
          this._handleKuCoinMessage(message);
          break;

        case 'kraken':
          this._handleKrakenMessage(message);
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

  /**
   * 处理 Gate.io 消息
   * Handle Gate.io message
   *
   * Gate.io WebSocket 推送格式 / Gate.io WebSocket push format:
   * { time, channel: 'spot.xxx' | 'futures.xxx', event: 'update', result: {...} }
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleGateMessage(message) {
    // 处理 pong 响应 / Handle pong response
    if (message.channel && (message.channel.endsWith('.pong') || message.channel.endsWith('.ping'))) {
      return;
    }

    // 忽略订阅响应 / Ignore subscription responses
    if (message.event === 'subscribe' || message.event === 'unsubscribe') {
      return;
    }

    // 检查是否是更新消息 / Check if it's an update message
    if (message.event !== 'update' || !message.result) {
      return;
    }

    // 获取频道和数据 / Get channel and result
    const channel = message.channel;
    const result = message.result;

    // 判断频道类型 / Determine channel type
    // 现货频道: spot.xxx, 合约频道: futures.xxx / Spot channels: spot.xxx, Futures channels: futures.xxx
    if (channel.endsWith('.tickers')) {
      // 处理行情数据 / Handle ticker data
      // 同时检查是否包含资金费率信息 (合约) / Also check for funding rate info (futures)
      this._processTicker('gate', { channel, result });
      // 如果是合约，也处理资金费率 / If futures, also process funding rate
      if (channel.startsWith('futures.') && result.funding_rate !== undefined) {
        this._processFundingRate('gate', { channel, result });
      }
    } else if (channel.endsWith('.order_book_update') || channel.endsWith('.order_book')) {
      // 处理深度数据 / Handle depth data
      this._processDepth('gate', { channel, result });
    } else if (channel.endsWith('.trades')) {
      // 处理成交数据 / Handle trade data
      this._processTrade('gate', { channel, result });
    } else if (channel.endsWith('.candlesticks')) {
      // 处理K线数据 / Handle kline data
      this._processKline('gate', { channel, result });
    }
  }

  /**
   * 处理 Bitget 消息
   * Handle Bitget message
   *
   * Bitget WebSocket V2 推送格式 / Bitget WebSocket V2 push format:
   * { action: 'snapshot' | 'update', arg: { instType, channel, instId }, data: [...] }
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleBitgetMessage(message) {
    // 忽略订阅响应 / Ignore subscription responses
    if (message.event === 'subscribe' || message.event === 'unsubscribe') {
      return;
    }

    // 忽略错误响应 / Ignore error responses
    if (message.event === 'error') {
      console.error(`${this.logPrefix} Bitget WebSocket 错误 / Error:`, message.msg || message);
      return;
    }

    // 获取参数和数据 / Get args and data
    const { arg, data, action } = message;

    // 如果没有参数或数据，返回 / If no args or data, return
    if (!arg || !data || data.length === 0) {
      return;
    }

    // 获取频道类型 / Get channel type
    const channel = arg.channel;

    // 根据频道类型处理 / Handle based on channel type
    switch (channel) {
      case 'ticker':
        // 处理行情数据 / Handle ticker data
        this._processTicker('bitget', message);
        // 如果是合约，也处理资金费率 / If futures, also process funding rate
        if (arg.instType !== 'SPOT' && data[0].fundingRate !== undefined) {
          this._processFundingRate('bitget', message);
        }
        break;

      case 'books5':
      case 'books15':
      case 'books':
        // 处理深度数据 / Handle depth data
        this._processDepth('bitget', message);
        break;

      case 'trade':
        // 处理成交数据 / Handle trade data
        this._processTrade('bitget', message);
        break;

      default:
        // 检查是否是K线频道 (candle1H, candle1D 等) / Check if it's a kline channel
        if (channel.startsWith('candle')) {
          this._processKline('bitget', message);
        }
        break;
    }
  }

  /**
   * 处理 KuCoin 消息
   * Handle KuCoin message
   *
   * KuCoin WebSocket 推送格式 / KuCoin WebSocket push format:
   * { type: 'message', topic: '/market/ticker:BTC-USDT', subject: 'trade.ticker', data: {...} }
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleKuCoinMessage(message) {
    // 忽略欢迎消息 / Ignore welcome message
    if (message.type === 'welcome') {
      return;
    }

    // 忽略订阅响应 / Ignore subscription responses
    if (message.type === 'ack') {
      return;
    }

    // 忽略 ping/pong 消息 / Ignore ping/pong messages
    if (message.type === 'ping' || message.type === 'pong') {
      return;
    }

    // 忽略错误响应 / Ignore error responses
    if (message.type === 'error') {
      console.error(`${this.logPrefix} KuCoin WebSocket 错误 / Error:`, message.data || message);
      return;
    }

    // 如果不是消息类型，返回 / If not message type, return
    if (message.type !== 'message') {
      return;
    }

    // 获取主题和数据 / Get topic and data
    const { topic, subject, data } = message;

    // 如果没有主题或数据，返回 / If no topic or data, return
    if (!topic || !data) {
      return;
    }

    // 根据主题类型处理 / Handle based on topic type
    if (topic.includes('/market/ticker:') || topic.includes('/contractMarket/tickerV2:')) {
      // 处理行情数据 / Handle ticker data
      this._processTicker('kucoin', message);
    } else if (topic.includes('level2Depth') || topic.includes('orderbook')) {
      // 处理深度数据 / Handle depth data
      this._processDepth('kucoin', message);
    } else if (topic.includes('/market/match:') || topic.includes('/contractMarket/execution:')) {
      // 处理成交数据 / Handle trade data
      this._processTrade('kucoin', message);
    } else if (topic.includes('/contract/instrument:')) {
      // 处理资金费率数据 / Handle funding rate data
      this._processFundingRate('kucoin', message);
    } else if (topic.includes('/market/candles:') || topic.includes('/contractMarket/candle:')) {
      // 处理K线数据 / Handle kline data
      this._processKline('kucoin', message);
    }
  }

  /**
   * 处理 Kraken 消息
   * Handle Kraken message
   *
   * Kraken WebSocket 推送格式 / Kraken WebSocket push format:
   * 现货 / Spot:
   * - 系统消息: { event: 'systemStatus' | 'heartbeat' | 'subscriptionStatus', ... }
   * - 数据消息: [channelID, data, channelName, pair]  (数组格式)
   *
   * 合约 / Futures:
   * - 系统消息: { event: 'info' | 'subscribed' | 'heartbeat', ... }
   * - 数据消息: { feed: 'ticker' | 'trade' | 'book', product_id: 'PI_XBTUSD', ... }
   *
   * @param {Object|Array} message - 消息对象或数组 / Message object or array
   * @private
   */
  _handleKrakenMessage(message) {
    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot';

    if (isSpot) {
      this._handleKrakenSpotMessage(message);
    } else {
      this._handleKrakenFuturesMessage(message);
    }
  }

  /**
   * 处理 Kraken 现货消息
   * Handle Kraken spot message
   *
   * @param {Object|Array} message - 消息对象或数组 / Message object or array
   * @private
   */
  _handleKrakenSpotMessage(message) {
    // 处理事件消息 (对象格式) / Handle event messages (object format)
    if (message && typeof message === 'object' && !Array.isArray(message)) {
      const event = message.event;

      // 忽略系统消息 / Ignore system messages
      if (event === 'systemStatus' || event === 'heartbeat' || event === 'pong') {
        return;
      }

      // 忽略订阅响应 / Ignore subscription responses
      if (event === 'subscriptionStatus') {
        if (message.status === 'error') {
          console.error(`${this.logPrefix} Kraken 订阅错误 / Subscription error:`, message.errorMessage);
        }
        return;
      }

      return;
    }

    // 处理数据消息 (数组格式) / Handle data messages (array format)
    // 格式: [channelID, data, channelName, pair]
    if (Array.isArray(message) && message.length >= 4) {
      const [channelId, data, channelName, pair] = message;

      // 根据频道名称处理 / Handle based on channel name
      if (channelName === 'ticker') {
        // 处理行情数据 / Handle ticker data
        this._processTicker('kraken', { data, pair, channelName });
      } else if (channelName === 'book-10' || channelName.startsWith('book')) {
        // 处理深度数据 / Handle depth data
        this._processDepth('kraken', { data, pair, channelName });
      } else if (channelName === 'trade') {
        // 处理成交数据 / Handle trade data
        this._processTrade('kraken', { data, pair, channelName });
      } else if (channelName.startsWith('ohlc')) {
        // 处理K线数据 / Handle kline data
        this._processKline('kraken', { data, pair, channelName });
      }
    }
  }

  /**
   * 处理 Kraken 合约消息
   * Handle Kraken futures message
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleKrakenFuturesMessage(message) {
    // 忽略非对象消息 / Ignore non-object messages
    if (!message || typeof message !== 'object') {
      return;
    }

    // 处理事件消息 / Handle event messages
    const event = message.event;
    if (event) {
      // 忽略系统消息 / Ignore system messages
      if (event === 'info' || event === 'heartbeat') {
        return;
      }

      // 忽略订阅响应 / Ignore subscription responses
      if (event === 'subscribed' || event === 'unsubscribed') {
        return;
      }

      // 处理错误 / Handle errors
      if (event === 'error') {
        console.error(`${this.logPrefix} Kraken Futures 错误 / Error:`, message.message || message);
        return;
      }

      return;
    }

    // 处理数据消息 / Handle data messages
    const feed = message.feed;
    if (!feed) {
      return;
    }

    // 根据 feed 类型处理 / Handle based on feed type
    if (feed === 'ticker' || feed === 'ticker_lite') {
      // 处理行情数据 / Handle ticker data
      this._processTicker('kraken', message);
      // 如果是 ticker，也处理资金费率 / If ticker, also process funding rate
      if (message.funding_rate !== undefined) {
        this._processFundingRate('kraken', message);
      }
    } else if (feed === 'book' || feed === 'book_snapshot') {
      // 处理深度数据 / Handle depth data
      this._processDepth('kraken', message);
    } else if (feed === 'trade' || feed === 'trade_snapshot') {
      // 处理成交数据 / Handle trade data
      this._processTrade('kraken', message);
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

    // 链路日志: 发出 ticker 事件 / Chain log: Emit ticker event
    // 注: 仅调试时启用，避免日志过多 / Note: Only enable for debugging to avoid log flood
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`${this.logPrefix} [链路] 发出ticker事件: ${ticker.exchange}:${ticker.symbol} 价格=${ticker.last}`);
    }

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

    // 去重检查: 如果资金费率没有变化，跳过发送 / Dedup check: skip if funding rate hasn't changed
    const lastEmitted = this.cache.lastEmittedFundingRates.get(cacheKey);
    if (lastEmitted && lastEmitted.fundingRate === fundingRate.fundingRate && lastEmitted.nextFundingTime === fundingRate.nextFundingTime) {
      // 费率和下次结算时间都没变，跳过发送 / Rate and next funding time unchanged, skip emit
      return;
    }

    // 存储到 Redis Hash / Store to Redis Hash
    this._storeToRedisHash(REDIS_KEYS.FUNDING_HASH, cacheKey, fundingRate);

    // 发布到 Redis Channel / Publish to Redis Channel
    this._publishToChannel(DATA_TYPES.FUNDING_RATE, fundingRate);

    // 链路日志: 发出资金费率事件 / Chain log: Emit funding rate event
    console.log(
      `${this.logPrefix} [链路] 发出fundingRate事件: ${fundingRate.exchange}:${fundingRate.symbol} ` +
      `费率=${fundingRate.fundingRate} / Emitting fundingRate event`
    );

    // 更新最后发出的资金费率缓存 / Update last emitted funding rate cache
    this.cache.lastEmittedFundingRates.set(cacheKey, {
      fundingRate: fundingRate.fundingRate,
      nextFundingTime: fundingRate.nextFundingTime,
    });

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

    // 链路日志: 仅在 K 线闭合时记录 (减少日志量) / Chain log: Only log when candle is closed (reduce log volume)
    if (candle.isClosed) {
      console.log(
        `${this.logPrefix} [链路] K线闭合: ${candle.exchange}:${candle.symbol} ` +
        `close=${candle.close} / Candle closed`
      );
    }

    // 发出 candle 事件 (用于策略) / Emit candle event (for strategies)
    this.emit('candle', {
      ...candle,
      history: klineCache.slice(-200), // 附带最近200根K线历史 / Attach last 200 candles history
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

        case 'gate':
          return this._normalizeGateTicker(message);

        case 'bitget':
          return this._normalizeBitgetTicker(message);

        case 'kucoin':
          return this._normalizeKuCoinTicker(message);

        case 'kraken':
          return this._normalizeKrakenTicker(message);

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

        case 'gate':
          return this._normalizeGateDepth(message);

        case 'bitget':
          return this._normalizeBitgetDepth(message);

        case 'kucoin':
          return this._normalizeKuCoinDepth(message);

        case 'kraken':
          return this._normalizeKrakenDepth(message);

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

        case 'gate':
          return this._normalizeGateTrade(message);

        case 'bitget':
          return this._normalizeBitgetTrade(message);

        case 'kucoin':
          return [this._normalizeKuCoinTrade(message)];

        case 'kraken':
          return this._normalizeKrakenTrade(message);

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

        case 'gate':
          return this._normalizeGateFundingRate(message);

        case 'bitget':
          return this._normalizeBitgetFundingRate(message);

        case 'kucoin':
          return this._normalizeKuCoinFundingRate(message);

        case 'kraken':
          return this._normalizeKrakenFundingRate(message);

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

        case 'gate':
          return this._normalizeGateKline(message);

        case 'bitget':
          return this._normalizeBitgetKline(message);

        case 'kucoin':
          return this._normalizeKuCoinKline(message);

        case 'kraken':
          return this._normalizeKrakenKline(message);

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

  /**
   * 标准化 Gate.io 行情数据
   * Normalize Gate.io ticker data
   *
   * Gate.io WebSocket 推送格式 / Gate.io WebSocket push format:
   * 现货 / Spot: { currency_pair, last, ... }
   * 合约 / Futures: { contract, last, funding_rate, ... }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeGateTicker(message) {
    // 获取数据 / Get data
    const data = message.result;
    const channel = message.channel;
    const isSpot = channel.startsWith('spot.');

    // 转换交易对格式 / Convert symbol format
    // 现货: currency_pair (BTC_USDT), 合约: contract (BTC_USDT)
    const gateSymbol = isSpot ? data.currency_pair : data.contract;
    const symbol = this._gateToStandardSymbol(gateSymbol);

    // 获取时间戳 / Get timestamp
    const timestamp = data.t ? parseInt(data.t) * 1000 : Date.now();

    return {
      exchange: 'gate',                         // 交易所 / Exchange
      symbol,                                    // 交易对 / Trading pair
      last: parseFloat(data.last || 0),         // 最新价 / Last price
      bid: parseFloat(data.highest_bid || 0),   // 最佳买价 / Best bid
      bidSize: 0,                                // Gate.io ticker 不提供 / Not provided
      ask: parseFloat(data.lowest_ask || 0),    // 最佳卖价 / Best ask
      askSize: 0,                                // Gate.io ticker 不提供 / Not provided
      open: parseFloat(data.open_24h || data.last || 0), // 开盘价 / Open price
      high: parseFloat(data.high_24h || 0),     // 最高价 / High price
      low: parseFloat(data.low_24h || 0),       // 最低价 / Low price
      volume: parseFloat(data.base_volume || data.volume_24h || 0), // 成交量 / Volume
      quoteVolume: parseFloat(data.quote_volume || data.volume_24h_usd || 0), // 成交额 / Quote volume
      change: parseFloat(data.change_utc8 || data.change_percentage || 0), // 涨跌额 / Price change
      changePercent: parseFloat(data.change_percentage || 0), // 涨跌幅 / Price change percent
      // 合约特有字段 / Futures-specific fields
      markPrice: data.mark_price ? parseFloat(data.mark_price) : null, // 标记价格 / Mark price
      indexPrice: data.index_price ? parseFloat(data.index_price) : null, // 指数价格 / Index price
      fundingRate: data.funding_rate ? parseFloat(data.funding_rate) : null, // 资金费率 / Funding rate
      nextFundingTime: data.funding_rate_indicative ? Date.now() + 8 * 3600 * 1000 : null, // 下次资金费率时间 / Next funding time
      exchangeTimestamp: timestamp,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Gate.io 深度数据
   * Normalize Gate.io depth data
   *
   * Gate.io WebSocket 推送格式 / Gate.io WebSocket push format:
   * { s: symbol, bids: [[price, amount]], asks: [[price, amount]], ... }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeGateDepth(message) {
    // 获取数据 / Get data
    const data = message.result;
    const channel = message.channel;
    const isSpot = channel.startsWith('spot.');

    // 转换交易对格式 / Convert symbol format
    const gateSymbol = data.s || data.contract;
    const symbol = this._gateToStandardSymbol(gateSymbol);

    // 获取时间戳 / Get timestamp
    const timestamp = data.t ? parseInt(data.t) * 1000 : Date.now();

    return {
      exchange: 'gate',                          // 交易所 / Exchange
      symbol,                                     // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.bids || []).map(item => {
        // Gate.io 格式: [price, amount] 或 { p: price, s: amount }
        if (Array.isArray(item)) {
          return [parseFloat(item[0]), parseFloat(item[1])];
        }
        return [parseFloat(item.p || 0), parseFloat(item.s || 0)];
      }),
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(item => {
        if (Array.isArray(item)) {
          return [parseFloat(item[0]), parseFloat(item[1])];
        }
        return [parseFloat(item.p || 0), parseFloat(item.s || 0)];
      }),
      exchangeTimestamp: timestamp,               // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                 // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Gate.io 成交数据
   * Normalize Gate.io trade data
   *
   * Gate.io WebSocket 推送格式 / Gate.io WebSocket push format:
   * 现货 / Spot: { id, create_time, side, currency_pair, amount, price }
   * 合约 / Futures: { id, create_time, contract, size, price }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeGateTrade(message) {
    // 获取数据 / Get data
    const result = message.result;
    const channel = message.channel;
    const isSpot = channel.startsWith('spot.');

    // Gate.io 可能返回单个成交或成交数组 / Gate.io may return single trade or trade array
    const trades = Array.isArray(result) ? result : [result];

    // 标准化每笔成交 / Normalize each trade
    return trades.map(data => {
      // 转换交易对格式 / Convert symbol format
      const gateSymbol = isSpot ? data.currency_pair : data.contract;
      const symbol = this._gateToStandardSymbol(gateSymbol);

      // 获取时间戳 / Get timestamp
      const timestamp = data.create_time
        ? parseInt(data.create_time) * 1000
        : (data.create_time_ms ? parseInt(data.create_time_ms) : Date.now());

      return {
        exchange: 'gate',                        // 交易所 / Exchange
        symbol,                                   // 交易对 / Trading pair
        tradeId: data.id?.toString() || '',      // 成交 ID / Trade ID
        price: parseFloat(data.price || 0),      // 成交价格 / Trade price
        amount: parseFloat(data.amount || data.size || 0), // 成交数量 / Trade amount
        side: data.side || (data.size > 0 ? 'buy' : 'sell'), // 主动方向 / Aggressor side
        exchangeTimestamp: timestamp,             // 交易所时间戳 / Exchange timestamp
        localTimestamp: Date.now(),               // 本地时间戳 / Local timestamp
      };
    });
  }

  /**
   * 标准化 Gate.io 资金费率数据
   * Normalize Gate.io funding rate data
   *
   * Gate.io 资金费率在 tickers 中推送 / Gate.io funding rate is pushed in tickers
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeGateFundingRate(message) {
    // 获取数据 / Get data
    const data = message.result;

    // 转换交易对格式 / Convert symbol format
    const gateSymbol = data.contract;
    const symbol = this._gateToStandardSymbol(gateSymbol);

    // 获取时间戳 / Get timestamp
    const timestamp = data.t ? parseInt(data.t) * 1000 : Date.now();

    return {
      exchange: 'gate',                               // 交易所 / Exchange
      symbol,                                          // 交易对 / Trading pair
      markPrice: parseFloat(data.mark_price || 0),    // 标记价格 / Mark price
      indexPrice: parseFloat(data.index_price || 0),  // 指数价格 / Index price
      fundingRate: parseFloat(data.funding_rate || 0), // 当前资金费率 / Current funding rate
      fundingRateIndicative: data.funding_rate_indicative
        ? parseFloat(data.funding_rate_indicative)
        : null,                                        // 预测资金费率 / Predicted funding rate
      nextFundingTime: Date.now() + 8 * 3600 * 1000,  // 下次资金费率时间 (8小时后) / Next funding time (8h later)
      exchangeTimestamp: timestamp,                    // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                      // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Gate.io K线数据
   * Normalize Gate.io kline data
   *
   * Gate.io WebSocket K线格式 / Gate.io WebSocket kline format:
   * { t, v, c, h, l, o, n } 或 { t, v, c, h, l, o, a }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeGateKline(message) {
    // 获取数据 / Get data
    const data = message.result;
    const channel = message.channel;
    const isSpot = channel.startsWith('spot.');

    // 转换交易对格式 / Convert symbol format
    // K线数据中使用 n (name) 字段存储交易对 / Kline data uses n (name) field for symbol
    const gateSymbol = data.n || data.contract;
    const symbol = this._gateToStandardSymbol(gateSymbol);

    // 获取时间戳 / Get timestamp
    const openTime = data.t ? parseInt(data.t) * 1000 : Date.now();

    // 获取时间间隔 (从 a 字段或默认 1 小时) / Get interval (from a field or default 1 hour)
    const interval = data.a || '1h';

    // 计算收盘时间 (根据时间间隔) / Calculate close time (based on interval)
    let intervalMs = 3600000; // 默认 1 小时 / Default 1 hour
    if (interval.endsWith('m')) {
      intervalMs = parseInt(interval) * 60 * 1000;
    } else if (interval.endsWith('h')) {
      intervalMs = parseInt(interval) * 3600 * 1000;
    } else if (interval.endsWith('d')) {
      intervalMs = parseInt(interval) * 86400 * 1000;
    }

    return {
      exchange: 'gate',                        // 交易所 / Exchange
      symbol,                                   // 交易对 / Trading pair
      interval,                                 // 时间间隔 / Time interval
      openTime,                                 // 开盘时间 / Open time
      closeTime: openTime + intervalMs,         // 收盘时间 / Close time
      open: parseFloat(data.o || 0),           // 开盘价 / Open price
      high: parseFloat(data.h || 0),           // 最高价 / High price
      low: parseFloat(data.l || 0),            // 最低价 / Low price
      close: parseFloat(data.c || 0),          // 收盘价 / Close price
      volume: parseFloat(data.v || 0),         // 成交量 / Volume
      quoteVolume: parseFloat(data.v || 0) * parseFloat(data.c || 0), // 成交额 (估算) / Quote volume (estimated)
      trades: 0,                                // Gate.io 不提供 / Not provided by Gate.io
      isClosed: true,                           // 是否收盘 / Is candle closed
      exchangeTimestamp: openTime,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),               // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Bitget 行情数据
   * Normalize Bitget ticker data
   *
   * Bitget WebSocket V2 推送格式 / Bitget WebSocket V2 push format:
   * { arg: { instType, channel, instId }, data: [{ last, open24h, high24h, low24h, ... }] }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeBitgetTicker(message) {
    // 获取数据 / Get data
    const data = message.data[0];
    const arg = message.arg;

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId);

    // 获取时间戳 / Get timestamp
    const timestamp = data.ts ? parseInt(data.ts) : Date.now();

    return {
      exchange: 'bitget',                              // 交易所 / Exchange
      symbol,                                           // 交易对 / Trading pair
      last: parseFloat(data.lastPr || data.last || 0), // 最新价 / Last price
      bid: parseFloat(data.bidPr || data.bid1 || 0),   // 最佳买价 / Best bid
      bidSize: parseFloat(data.bidSz || data.bidSz1 || 0), // 最佳买量 / Best bid size
      ask: parseFloat(data.askPr || data.ask1 || 0),   // 最佳卖价 / Best ask
      askSize: parseFloat(data.askSz || data.askSz1 || 0), // 最佳卖量 / Best ask size
      open: parseFloat(data.open24h || data.openUtc0 || 0), // 开盘价 / Open price
      high: parseFloat(data.high24h || 0),             // 最高价 / High price
      low: parseFloat(data.low24h || 0),               // 最低价 / Low price
      volume: parseFloat(data.baseVolume || data.vol24h || 0), // 成交量 / Volume
      quoteVolume: parseFloat(data.quoteVolume || data.usdtVolume || 0), // 成交额 / Quote volume
      change: parseFloat(data.change24h || 0),         // 涨跌额 / Price change
      changePercent: parseFloat(data.changeUtc24h || data.change24h || 0) * 100, // 涨跌幅 / Price change percent
      // 合约特有字段 / Futures-specific fields
      markPrice: data.markPrice ? parseFloat(data.markPrice) : null, // 标记价格 / Mark price
      indexPrice: data.indexPrice ? parseFloat(data.indexPrice) : null, // 指数价格 / Index price
      fundingRate: data.fundingRate ? parseFloat(data.fundingRate) : null, // 资金费率 / Funding rate
      nextFundingTime: data.nextFundingTime ? parseInt(data.nextFundingTime) : null, // 下次资金费率时间 / Next funding time
      exchangeTimestamp: timestamp,                     // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                       // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Bitget 深度数据
   * Normalize Bitget depth data
   *
   * Bitget WebSocket V2 推送格式 / Bitget WebSocket V2 push format:
   * { arg: { instType, channel, instId }, data: [{ asks: [...], bids: [...], ts }] }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeBitgetDepth(message) {
    // 获取数据 / Get data
    const data = message.data[0];
    const arg = message.arg;

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId);

    // 获取时间戳 / Get timestamp
    const timestamp = data.ts ? parseInt(data.ts) : Date.now();

    return {
      exchange: 'bitget',                          // 交易所 / Exchange
      symbol,                                       // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.bids || []).map(item => [
        parseFloat(item[0]),
        parseFloat(item[1]),
      ]),
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(item => [
        parseFloat(item[0]),
        parseFloat(item[1]),
      ]),
      exchangeTimestamp: timestamp,                 // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                   // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Bitget 成交数据
   * Normalize Bitget trade data
   *
   * Bitget WebSocket V2 推送格式 / Bitget WebSocket V2 push format:
   * { arg: { instType, channel, instId }, data: [{ tradeId, px, sz, side, ts }] }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeBitgetTrade(message) {
    // 获取数据数组 / Get data array
    const dataArray = message.data;
    const arg = message.arg;

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId);

    // 标准化每笔成交 / Normalize each trade
    return dataArray.map(data => ({
      exchange: 'bitget',                          // 交易所 / Exchange
      symbol,                                       // 交易对 / Trading pair
      tradeId: data.tradeId?.toString() || '',     // 成交 ID / Trade ID
      price: parseFloat(data.price || data.px || 0), // 成交价格 / Trade price
      amount: parseFloat(data.size || data.sz || 0), // 成交数量 / Trade amount
      side: data.side?.toLowerCase() || 'buy',     // 主动方向 / Aggressor side
      exchangeTimestamp: parseInt(data.ts || Date.now()), // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                   // 本地时间戳 / Local timestamp
    }));
  }

  /**
   * 标准化 Bitget 资金费率数据
   * Normalize Bitget funding rate data
   *
   * Bitget 资金费率在 ticker 中推送 / Bitget funding rate is pushed in ticker
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeBitgetFundingRate(message) {
    // 获取数据 / Get data
    const data = message.data[0];
    const arg = message.arg;

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId);

    // 获取时间戳 / Get timestamp
    const timestamp = data.ts ? parseInt(data.ts) : Date.now();

    return {
      exchange: 'bitget',                                // 交易所 / Exchange
      symbol,                                             // 交易对 / Trading pair
      markPrice: parseFloat(data.markPrice || 0),        // 标记价格 / Mark price
      indexPrice: parseFloat(data.indexPrice || 0),      // 指数价格 / Index price
      fundingRate: parseFloat(data.fundingRate || 0),    // 当前资金费率 / Current funding rate
      nextFundingTime: data.nextFundingTime ? parseInt(data.nextFundingTime) : null, // 下次资金费率时间 / Next funding time
      exchangeTimestamp: timestamp,                       // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                         // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Bitget K线数据
   * Normalize Bitget kline data
   *
   * Bitget WebSocket V2 推送格式 / Bitget WebSocket V2 push format:
   * { arg: { instType, channel, instId }, data: [[ts, o, h, l, c, vol, ...]] }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeBitgetKline(message) {
    // 获取数据 / Get data
    const data = message.data[0];
    const arg = message.arg;

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId);

    // 获取时间间隔 (从频道名称提取) / Get interval (extract from channel name)
    const channel = arg.channel;
    const interval = channel.replace('candle', '') || '1H';

    // 解析K线数据 / Parse kline data
    // Bitget K线格式: [ts, open, high, low, close, volume, quoteVolume, ...]
    const openTime = parseInt(data[0]);

    // 计算收盘时间 (根据时间间隔) / Calculate close time (based on interval)
    let intervalMs = 3600000; // 默认 1 小时 / Default 1 hour
    const intervalLower = interval.toLowerCase();
    if (intervalLower.endsWith('m')) {
      intervalMs = parseInt(intervalLower) * 60 * 1000;
    } else if (intervalLower.endsWith('h')) {
      intervalMs = parseInt(intervalLower) * 3600 * 1000;
    } else if (intervalLower.endsWith('d') || intervalLower.endsWith('day')) {
      intervalMs = 86400 * 1000;
    } else if (intervalLower.endsWith('w') || intervalLower.endsWith('week')) {
      intervalMs = 7 * 86400 * 1000;
    }

    return {
      exchange: 'bitget',                        // 交易所 / Exchange
      symbol,                                     // 交易对 / Trading pair
      interval,                                   // 时间间隔 / Time interval
      openTime,                                   // 开盘时间 / Open time
      closeTime: openTime + intervalMs,           // 收盘时间 / Close time
      open: parseFloat(data[1] || 0),            // 开盘价 / Open price
      high: parseFloat(data[2] || 0),            // 最高价 / High price
      low: parseFloat(data[3] || 0),             // 最低价 / Low price
      close: parseFloat(data[4] || 0),           // 收盘价 / Close price
      volume: parseFloat(data[5] || 0),          // 成交量 / Volume
      quoteVolume: parseFloat(data[6] || 0),     // 成交额 / Quote volume
      trades: 0,                                  // Bitget 不提供 / Not provided by Bitget
      isClosed: true,                             // 是否收盘 / Is candle closed
      exchangeTimestamp: openTime,                // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                 // 本地时间戳 / Local timestamp
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

  /**
   * 将 Gate.io 交易对转换为标准格式
   * Convert Gate.io symbol to standard format
   *
   * @param {string} gateSymbol - Gate.io 交易对 (如 BTC_USDT) / Gate.io symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _gateToStandardSymbol(gateSymbol) {
    // Gate.io 格式: BTC_USDT -> BTC/USDT
    // Gate.io format: BTC_USDT -> BTC/USDT
    if (!gateSymbol) {
      return '';
    }

    // 使用下划线分割 / Split by underscore
    const parts = gateSymbol.split('_');

    // 如果有两部分，返回 BASE/QUOTE 格式 / If two parts, return BASE/QUOTE format
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return gateSymbol;
  }

  /**
   * 将 Bitget 交易对转换为标准格式
   * Convert Bitget symbol to standard format
   *
   * @param {string} bitgetSymbol - Bitget 交易对 (如 BTCUSDT) / Bitget symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _bitgetToStandardSymbol(bitgetSymbol) {
    // Bitget 格式: BTCUSDT -> BTC/USDT
    // Bitget format: BTCUSDT -> BTC/USDT
    if (!bitgetSymbol) {
      return '';
    }

    // 常见的计价货币 / Common quote currencies
    const quotes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH'];

    // 尝试匹配计价货币 / Try to match quote currency
    for (const quote of quotes) {
      if (bitgetSymbol.endsWith(quote)) {
        const base = bitgetSymbol.slice(0, -quote.length);
        return `${base}/${quote}`;
      }
    }

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return bitgetSymbol;
  }

  /**
   * 将 KuCoin 现货交易对转换为标准格式
   * Convert KuCoin spot symbol to standard format
   *
   * @param {string} kucoinSymbol - KuCoin 交易对 (如 BTC-USDT) / KuCoin symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _kucoinToStandardSymbol(kucoinSymbol) {
    // KuCoin 现货格式: BTC-USDT -> BTC/USDT
    // KuCoin spot format: BTC-USDT -> BTC/USDT
    if (!kucoinSymbol) {
      return '';
    }

    // 使用短横线分割 / Split by hyphen
    const parts = kucoinSymbol.split('-');

    // 如果有两部分，返回 BASE/QUOTE 格式 / If two parts, return BASE/QUOTE format
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return kucoinSymbol;
  }

  /**
   * 标准化 KuCoin 行情数据
   * Normalize KuCoin ticker data
   *
   * KuCoin WebSocket 推送格式 / KuCoin WebSocket push format:
   * { type: 'message', topic: '/market/ticker:BTC-USDT', data: { price, size, ... } }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeKuCoinTicker(message) {
    // 获取数据 / Get data
    const data = message.data;
    const topic = message.topic;

    // 从主题提取交易对 / Extract symbol from topic
    // 现货格式: /market/ticker:BTC-USDT -> BTC-USDT
    // 合约格式: /contractMarket/tickerV2:XBTUSDTM -> XBTUSDTM
    let symbol;
    const isSpot = topic.includes('/market/ticker:');
    if (isSpot) {
      const kucoinSymbol = topic.split(':')[1];
      symbol = this._kucoinToStandardSymbol(kucoinSymbol);
    } else {
      const futuresSymbol = topic.split(':')[1];
      symbol = this._fromKuCoinFuturesSymbol(futuresSymbol);
    }

    // 获取时间戳 / Get timestamp
    const timestamp = data.time || data.ts || Date.now();

    return {
      exchange: 'kucoin',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      last: parseFloat(data.price || data.lastTradePrice || 0), // 最新价 / Last price
      bid: parseFloat(data.bestBid || data.bestBidPrice || 0), // 最佳买价 / Best bid
      bidSize: parseFloat(data.bestBidSize || 0),       // 最佳买量 / Best bid size
      ask: parseFloat(data.bestAsk || data.bestAskPrice || 0), // 最佳卖价 / Best ask
      askSize: parseFloat(data.bestAskSize || 0),       // 最佳卖量 / Best ask size
      open: parseFloat(data.open24h || 0),              // 开盘价 / Open price
      high: parseFloat(data.high24h || 0),              // 最高价 / High price
      low: parseFloat(data.low24h || 0),                // 最低价 / Low price
      volume: parseFloat(data.vol24h || data.volume || 0), // 成交量 / Volume
      quoteVolume: parseFloat(data.volValue24h || data.turnover || 0), // 成交额 / Quote volume
      change: parseFloat(data.changePrice || 0),        // 涨跌额 / Price change
      changePercent: parseFloat(data.changeRate || 0) * 100, // 涨跌幅 / Price change percent
      // 合约特有字段 / Futures-specific fields
      markPrice: data.markPrice ? parseFloat(data.markPrice) : null, // 标记价格 / Mark price
      indexPrice: data.indexPrice ? parseFloat(data.indexPrice) : null, // 指数价格 / Index price
      fundingRate: data.fundingRate ? parseFloat(data.fundingRate) : null, // 资金费率 / Funding rate
      exchangeTimestamp: parseInt(timestamp),            // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 KuCoin 深度数据
   * Normalize KuCoin depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeKuCoinDepth(message) {
    // 获取数据 / Get data
    const data = message.data;
    const topic = message.topic;

    // 从主题提取交易对 / Extract symbol from topic
    let symbol;
    const isSpot = topic.includes('/spotMarket/') || topic.includes('/market/');
    if (isSpot) {
      const kucoinSymbol = topic.split(':')[1];
      symbol = this._kucoinToStandardSymbol(kucoinSymbol);
    } else {
      const futuresSymbol = topic.split(':')[1];
      symbol = this._fromKuCoinFuturesSymbol(futuresSymbol);
    }

    // 获取时间戳 / Get timestamp
    const timestamp = data.timestamp || data.ts || Date.now();

    return {
      exchange: 'kucoin',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.bids || []).map(item => [
        parseFloat(Array.isArray(item) ? item[0] : item.price),
        parseFloat(Array.isArray(item) ? item[1] : item.size),
      ]),
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(item => [
        parseFloat(Array.isArray(item) ? item[0] : item.price),
        parseFloat(Array.isArray(item) ? item[1] : item.size),
      ]),
      exchangeTimestamp: parseInt(timestamp),            // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 KuCoin 成交数据
   * Normalize KuCoin trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的成交数据 / Normalized trade data
   * @private
   */
  _normalizeKuCoinTrade(message) {
    // 获取数据 / Get data
    const data = message.data;
    const topic = message.topic;

    // 从主题提取交易对 / Extract symbol from topic
    let symbol;
    const isSpot = topic.includes('/market/match:');
    if (isSpot) {
      const kucoinSymbol = topic.split(':')[1];
      symbol = this._kucoinToStandardSymbol(kucoinSymbol);
    } else {
      const futuresSymbol = topic.split(':')[1];
      symbol = this._fromKuCoinFuturesSymbol(futuresSymbol);
    }

    // 获取时间戳 / Get timestamp
    const timestamp = data.time || data.ts || Date.now();

    return {
      exchange: 'kucoin',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      tradeId: data.tradeId || data.sequence || '',     // 成交 ID / Trade ID
      price: parseFloat(data.price || 0),               // 成交价格 / Trade price
      amount: parseFloat(data.size || data.qty || 0),   // 成交数量 / Trade amount
      side: data.side || (data.makerOrderId ? 'buy' : 'sell'), // 主动方向 / Aggressor side
      exchangeTimestamp: parseInt(timestamp),            // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 KuCoin 资金费率数据
   * Normalize KuCoin funding rate data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeKuCoinFundingRate(message) {
    // 获取数据 / Get data
    const data = message.data;
    const topic = message.topic;

    // 从主题提取交易对 / Extract symbol from topic
    const futuresSymbol = topic.split(':')[1];
    const symbol = this._fromKuCoinFuturesSymbol(futuresSymbol);

    // 获取时间戳 / Get timestamp
    const timestamp = data.timestamp || data.ts || Date.now();

    return {
      exchange: 'kucoin',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      fundingRate: parseFloat(data.fundingRate || data.currentFundingRate || 0), // 当前资金费率 / Current funding rate
      fundingTime: data.fundingTime || null,            // 资金费率结算时间 / Funding settlement time
      nextFundingRate: data.predictedFundingFeeRate ? parseFloat(data.predictedFundingFeeRate) : null, // 预测下次资金费率 / Predicted next funding rate
      exchangeTimestamp: parseInt(timestamp),            // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 KuCoin K线数据
   * Normalize KuCoin kline data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeKuCoinKline(message) {
    // 获取数据 / Get data
    const data = message.data;
    const topic = message.topic;

    // 从主题提取交易对和时间间隔 / Extract symbol and interval from topic
    // 格式: /market/candles:BTC-USDT_1hour
    const topicParts = topic.split(':')[1].split('_');
    const isSpot = topic.includes('/market/candles:');

    let symbol;
    let interval = '1h';

    if (isSpot) {
      symbol = this._kucoinToStandardSymbol(topicParts[0]);
      interval = topicParts[1] || '1hour';
    } else {
      symbol = this._fromKuCoinFuturesSymbol(topicParts[0]);
      interval = topicParts[1] || '1hour';
    }

    // 获取K线数据 / Get candle data
    const candles = Array.isArray(data.candles) ? data.candles : [data];
    const candle = candles[0];

    // 获取时间戳 / Get timestamp
    const openTime = candle[0] ? parseInt(candle[0]) * 1000 : Date.now();

    // 计算收盘时间 / Calculate close time
    let intervalMs = 3600000; // 默认 1 小时 / Default 1 hour
    if (interval.includes('min')) {
      intervalMs = parseInt(interval) * 60 * 1000;
    } else if (interval.includes('hour')) {
      intervalMs = parseInt(interval) * 3600 * 1000;
    } else if (interval.includes('day')) {
      intervalMs = parseInt(interval) * 86400 * 1000;
    }

    return {
      exchange: 'kucoin',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      interval,                                          // 时间间隔 / Time interval
      openTime,                                          // 开盘时间 / Open time
      closeTime: openTime + intervalMs,                  // 收盘时间 / Close time
      open: parseFloat(candle[1] || 0),                 // 开盘价 / Open price
      close: parseFloat(candle[2] || 0),                // 收盘价 / Close price
      high: parseFloat(candle[3] || 0),                 // 最高价 / High price
      low: parseFloat(candle[4] || 0),                  // 最低价 / Low price
      volume: parseFloat(candle[5] || 0),               // 成交量 / Volume
      quoteVolume: parseFloat(candle[6] || 0),          // 成交额 / Quote volume
      trades: 0,                                         // KuCoin 不提供 / Not provided by KuCoin
      isClosed: true,                                    // 是否收盘 / Is candle closed
      exchangeTimestamp: openTime,                       // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    };
  }

  // ============================================
  // Kraken 数据标准化方法 / Kraken Data Normalization Methods
  // ============================================

  /**
   * 标准化 Kraken 行情数据
   * Normalize Kraken ticker data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeKrakenTicker(message) {
    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot';

    if (isSpot) {
      return this._normalizeKrakenSpotTicker(message);
    } else {
      return this._normalizeKrakenFuturesTicker(message);
    }
  }

  /**
   * 标准化 Kraken 现货行情数据
   * Normalize Kraken spot ticker data
   *
   * 现货数据格式 / Spot data format:
   * { data: { a: [askPrice, wholeLotVol, lotVol], b: [bidPrice, ...], c: [close, vol], v: [vol24h], ... }, pair: 'XBT/USD' }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeKrakenSpotTicker(message) {
    const data = message.data;
    const pair = message.pair;
    const symbol = this._fromKrakenSpotSymbol(pair);

    return {
      exchange: 'kraken',                           // 交易所 / Exchange
      symbol,                                        // 交易对 / Trading pair
      last: parseFloat(data.c?.[0] || 0),           // 最新价 / Last price
      bid: parseFloat(data.b?.[0] || 0),            // 最佳买价 / Best bid
      bidSize: parseFloat(data.b?.[2] || 0),        // 最佳买量 / Best bid size
      ask: parseFloat(data.a?.[0] || 0),            // 最佳卖价 / Best ask
      askSize: parseFloat(data.a?.[2] || 0),        // 最佳卖量 / Best ask size
      open: parseFloat(data.o?.[0] || 0),           // 开盘价 / Open price
      high: parseFloat(data.h?.[0] || 0),           // 最高价 / High price
      low: parseFloat(data.l?.[0] || 0),            // 最低价 / Low price
      volume: parseFloat(data.v?.[1] || 0),         // 24小时成交量 / 24h volume
      quoteVolume: 0,                                // Kraken 不提供 / Not provided
      change: 0,                                     // 需要计算 / Needs calculation
      changePercent: parseFloat(data.p?.[1] || 0),  // VWAP 变化 / VWAP change
      exchangeTimestamp: Date.now(),                 // Kraken 不提供时间戳 / Not provided
      localTimestamp: Date.now(),                    // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Kraken 合约行情数据
   * Normalize Kraken futures ticker data
   *
   * 合约数据格式 / Futures data format:
   * { feed: 'ticker', product_id: 'PI_XBTUSD', bid: 50000, ask: 50001, ... }
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeKrakenFuturesTicker(message) {
    const symbol = this._fromKrakenFuturesSymbol(message.product_id);

    return {
      exchange: 'kraken',                                // 交易所 / Exchange
      symbol,                                             // 交易对 / Trading pair
      last: parseFloat(message.last || 0),               // 最新价 / Last price
      bid: parseFloat(message.bid || 0),                 // 最佳买价 / Best bid
      bidSize: parseFloat(message.bid_size || 0),        // 最佳买量 / Best bid size
      ask: parseFloat(message.ask || 0),                 // 最佳卖价 / Best ask
      askSize: parseFloat(message.ask_size || 0),        // 最佳卖量 / Best ask size
      open: parseFloat(message.open24h || 0),            // 开盘价 / Open price
      high: parseFloat(message.high24h || 0),            // 最高价 / High price
      low: parseFloat(message.low24h || 0),              // 最低价 / Low price
      volume: parseFloat(message.vol24h || 0),           // 成交量 / Volume
      quoteVolume: parseFloat(message.volumeQuote || 0), // 成交额 / Quote volume
      change: parseFloat(message.change24h || 0),        // 涨跌额 / Price change
      changePercent: parseFloat(message.change24hPct || 0), // 涨跌幅 / Price change percent
      markPrice: parseFloat(message.markPrice || 0),     // 标记价格 / Mark price
      indexPrice: parseFloat(message.indexPrice || 0),   // 指数价格 / Index price
      fundingRate: parseFloat(message.funding_rate || 0), // 资金费率 / Funding rate
      nextFundingTime: message.next_funding_rate_time,   // 下次资金费率时间 / Next funding time
      exchangeTimestamp: message.time || Date.now(),     // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                         // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Kraken 深度数据
   * Normalize Kraken depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeKrakenDepth(message) {
    const isSpot = this.config.tradingType === 'spot';

    if (isSpot) {
      return this._normalizeKrakenSpotDepth(message);
    } else {
      return this._normalizeKrakenFuturesDepth(message);
    }
  }

  /**
   * 标准化 Kraken 现货深度数据
   * Normalize Kraken spot depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeKrakenSpotDepth(message) {
    const data = message.data;
    const pair = message.pair;
    const symbol = this._fromKrakenSpotSymbol(pair);

    // Kraken 现货深度格式: { as: [[price, vol, timestamp], ...], bs: [...] }
    // as = asks, bs = bids
    const asks = (data.as || data.a || []).map(([price, amount]) => [
      parseFloat(price),
      parseFloat(amount),
    ]);

    const bids = (data.bs || data.b || []).map(([price, amount]) => [
      parseFloat(price),
      parseFloat(amount),
    ]);

    return {
      exchange: 'kraken',                    // 交易所 / Exchange
      symbol,                                 // 交易对 / Trading pair
      bids,                                   // 买单 / Bids
      asks,                                   // 卖单 / Asks
      exchangeTimestamp: Date.now(),         // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),            // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Kraken 合约深度数据
   * Normalize Kraken futures depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeKrakenFuturesDepth(message) {
    const symbol = this._fromKrakenFuturesSymbol(message.product_id);

    // Kraken Futures 深度格式: { bids: [{price, qty}, ...], asks: [...] }
    const bids = (message.bids || []).map(item => [
      parseFloat(item.price || item[0]),
      parseFloat(item.qty || item[1]),
    ]);

    const asks = (message.asks || []).map(item => [
      parseFloat(item.price || item[0]),
      parseFloat(item.qty || item[1]),
    ]);

    return {
      exchange: 'kraken',                        // 交易所 / Exchange
      symbol,                                     // 交易对 / Trading pair
      bids,                                       // 买单 / Bids
      asks,                                       // 卖单 / Asks
      exchangeTimestamp: message.timestamp || Date.now(), // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Kraken 成交数据
   * Normalize Kraken trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeKrakenTrade(message) {
    const isSpot = this.config.tradingType === 'spot';

    if (isSpot) {
      return this._normalizeKrakenSpotTrade(message);
    } else {
      return this._normalizeKrakenFuturesTrade(message);
    }
  }

  /**
   * 标准化 Kraken 现货成交数据
   * Normalize Kraken spot trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeKrakenSpotTrade(message) {
    const data = message.data;
    const pair = message.pair;
    const symbol = this._fromKrakenSpotSymbol(pair);

    // Kraken 现货成交格式: [[price, volume, time, side, orderType, misc], ...]
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((trade, index) => ({
      exchange: 'kraken',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      tradeId: `${Date.now()}_${index}`,                // 成交 ID / Trade ID
      price: parseFloat(trade[0]),                      // 成交价格 / Trade price
      amount: parseFloat(trade[1]),                     // 成交数量 / Trade amount
      side: trade[3] === 'b' ? 'buy' : 'sell',          // 方向 / Side
      exchangeTimestamp: parseFloat(trade[2]) * 1000,   // 时间戳 (秒->毫秒) / Timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    }));
  }

  /**
   * 标准化 Kraken 合约成交数据
   * Normalize Kraken futures trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeKrakenFuturesTrade(message) {
    const symbol = this._fromKrakenFuturesSymbol(message.product_id);

    // 单笔成交 / Single trade
    if (message.price !== undefined) {
      return [{
        exchange: 'kraken',                               // 交易所 / Exchange
        symbol,                                            // 交易对 / Trading pair
        tradeId: message.uid || message.trade_id || `${Date.now()}`, // 成交 ID / Trade ID
        price: parseFloat(message.price),                 // 成交价格 / Trade price
        amount: parseFloat(message.qty || message.size),  // 成交数量 / Trade amount
        side: message.side?.toLowerCase() || 'buy',       // 方向 / Side
        exchangeTimestamp: message.time || Date.now(),    // 交易所时间戳 / Exchange timestamp
        localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
      }];
    }

    // 批量成交 / Batch trades
    const trades = message.trades || [];
    return trades.map(trade => ({
      exchange: 'kraken',
      symbol,
      tradeId: trade.uid || trade.trade_id || `${Date.now()}_${Math.random()}`,
      price: parseFloat(trade.price),
      amount: parseFloat(trade.qty || trade.size),
      side: trade.side?.toLowerCase() || 'buy',
      exchangeTimestamp: trade.time || Date.now(),
      localTimestamp: Date.now(),
    }));
  }

  /**
   * 标准化 Kraken 资金费率数据
   * Normalize Kraken funding rate data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeKrakenFundingRate(message) {
    // Kraken 资金费率在 ticker 消息中 / Kraken funding rate is in ticker message
    const symbol = this._fromKrakenFuturesSymbol(message.product_id);

    return {
      exchange: 'kraken',                                    // 交易所 / Exchange
      symbol,                                                 // 交易对 / Trading pair
      markPrice: parseFloat(message.markPrice || 0),         // 标记价格 / Mark price
      indexPrice: parseFloat(message.indexPrice || 0),       // 指数价格 / Index price
      fundingRate: parseFloat(message.funding_rate || 0),    // 当前资金费率 / Current funding rate
      nextFundingTime: message.next_funding_rate_time,       // 下次资金费率时间 / Next funding time
      exchangeTimestamp: message.time || Date.now(),         // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                             // 本地时间戳 / Local timestamp
    };
  }

  /**
   * 标准化 Kraken K线数据
   * Normalize Kraken kline data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeKrakenKline(message) {
    const data = message.data;
    const pair = message.pair;
    const symbol = this._fromKrakenSpotSymbol(pair);

    // Kraken OHLC 格式: [time, etime, open, high, low, close, vwap, volume, count]
    // 从频道名称获取间隔 / Get interval from channel name
    const channelName = message.channelName || '';
    const intervalMatch = channelName.match(/ohlc-(\d+)/);
    const intervalMinutes = intervalMatch ? parseInt(intervalMatch[1]) : 60;

    // 获取最新的 K 线数据 / Get latest candle data
    const candle = Array.isArray(data) ? data : [data];
    const latest = candle[candle.length - 1] || candle;

    const openTime = parseFloat(latest[0] || 0) * 1000;  // 转换为毫秒 / Convert to ms
    const closeTime = parseFloat(latest[1] || 0) * 1000;

    return {
      exchange: 'kraken',                              // 交易所 / Exchange
      symbol,                                           // 交易对 / Trading pair
      interval: `${intervalMinutes}m`,                 // 时间间隔 / Time interval
      openTime,                                         // 开盘时间 / Open time
      closeTime,                                        // 收盘时间 / Close time
      open: parseFloat(latest[2] || 0),                // 开盘价 / Open price
      high: parseFloat(latest[3] || 0),                // 最高价 / High price
      low: parseFloat(latest[4] || 0),                 // 最低价 / Low price
      close: parseFloat(latest[5] || 0),               // 收盘价 / Close price
      vwap: parseFloat(latest[6] || 0),                // 成交量加权平均价 / VWAP
      volume: parseFloat(latest[7] || 0),              // 成交量 / Volume
      quoteVolume: 0,                                   // Kraken 不提供 / Not provided
      trades: parseInt(latest[8] || 0),                // 成交笔数 / Trade count
      isClosed: closeTime <= Date.now(),               // 是否收盘 / Is candle closed
      exchangeTimestamp: openTime,                      // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                       // 本地时间戳 / Local timestamp
    };
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
