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
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入 WebSocket 库 / Import WebSocket library
import WebSocket from 'ws'; // 导入模块 ws

// 导入 Redis 客户端 / Import Redis client
import Redis from 'ioredis'; // 导入模块 ioredis

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * WebSocket 端点配置
 * WebSocket endpoint configuration
 */
const WS_ENDPOINTS = { // 定义常量 WS_ENDPOINTS
  // Binance 端点 / Binance endpoints
  binance: { // 设置 binance 字段
    spot: 'wss://stream.binance.com:9443/ws',           // 现货 / Spot
    futures: 'wss://fstream.binance.com/ws',            // U 本位永续 / USDT-M futures
    delivery: 'wss://dstream.binance.com/ws',           // 币本位 / COIN-M futures
  }, // 结束代码块
  // Bybit 端点 / Bybit endpoints
  bybit: { // 设置 bybit 字段
    spot: 'wss://stream.bybit.com/v5/public/spot',      // 现货 / Spot
    linear: 'wss://stream.bybit.com/v5/public/linear',  // USDT 永续 / USDT perpetual
    inverse: 'wss://stream.bybit.com/v5/public/inverse', // 反向合约 / Inverse perpetual
  }, // 结束代码块
  // OKX 端点 / OKX endpoints
  okx: { // 设置 okx 字段
    public: 'wss://ws.okx.com:8443/ws/v5/public',       // 公共频道 / Public channel
    business: 'wss://ws.okx.com:8443/ws/v5/business',   // 业务频道 / Business channel
  }, // 结束代码块
  // Deribit 端点 / Deribit endpoints
  deribit: { // 设置 deribit 字段
    public: 'wss://www.deribit.com/ws/api/v2',          // 生产环境 / Production
    testnet: 'wss://test.deribit.com/ws/api/v2',        // 测试网 / Testnet
  }, // 结束代码块
  // Gate.io 端点 / Gate.io endpoints
  gate: { // 设置 gate 字段
    spot: 'wss://api.gateio.ws/ws/v4/',                 // 现货 / Spot
    futures: 'wss://fx-ws.gateio.ws/v4/ws/usdt',        // USDT 永续 / USDT perpetual
    delivery: 'wss://fx-ws.gateio.ws/v4/ws/btc',        // BTC 永续 / BTC perpetual
  }, // 结束代码块
  // Bitget 端点 / Bitget endpoints
  bitget: { // 设置 bitget 字段
    spot: 'wss://ws.bitget.com/v2/ws/public',           // 现货公共频道 / Spot public channel
    futures: 'wss://ws.bitget.com/v2/ws/public',        // 合约公共频道 / Futures public channel
    private: 'wss://ws.bitget.com/v2/ws/private',       // 私有频道 / Private channel
  }, // 结束代码块
  // KuCoin 端点 / KuCoin endpoints
  // 注意: KuCoin 需要先获取动态 token，这里仅作为备用 / Note: KuCoin requires dynamic token, these are fallbacks
  kucoin: { // 设置 kucoin 字段
    spot: 'wss://ws-api-spot.kucoin.com',               // 现货公共频道 / Spot public channel
    futures: 'wss://ws-api-futures.kucoin.com',         // 合约公共频道 / Futures public channel
    // REST API 端点用于获取 WebSocket token / REST API endpoints to get WebSocket token
    spotTokenApi: 'https://api.kucoin.com/api/v1/bullet-public', // 设置 spotTokenApi 字段
    futuresTokenApi: 'https://api-futures.kucoin.com/api/v1/bullet-public', // 设置 futuresTokenApi 字段
  }, // 结束代码块
  // Kraken 端点 / Kraken endpoints
  kraken: { // 设置 kraken 字段
    spot: 'wss://ws.kraken.com',                        // 现货公共频道 / Spot public channel
    spotPrivate: 'wss://ws-auth.kraken.com',            // 现货私有频道 / Spot private channel
    futures: 'wss://futures.kraken.com/ws/v1',          // 合约公共频道 / Futures public channel
  }, // 结束代码块
}; // 结束代码块

/**
 * 数据类型枚举
 * Data type enumeration
 */
const DATA_TYPES = { // 定义常量 DATA_TYPES
  TICKER: 'ticker',           // 行情快照 / Ticker snapshot
  DEPTH: 'depth',             // 深度数据 / Order book depth
  TRADE: 'trade',             // 成交数据 / Trade data
  FUNDING_RATE: 'fundingRate', // 资金费率 / Funding rate
  KLINE: 'kline',             // K线数据 / Candlestick data
}; // 结束代码块

/**
 * Redis 键前缀配置
 * Redis key prefix configuration
 */
const REDIS_KEYS = { // 定义常量 REDIS_KEYS
  TICKER_HASH: 'market:ticker:',         // 行情哈希键前缀 / Ticker hash key prefix
  DEPTH_HASH: 'market:depth:',           // 深度哈希键前缀 / Depth hash key prefix
  TRADE_STREAM: 'market:trades:',        // 成交流键前缀 / Trade stream key prefix
  FUNDING_HASH: 'market:funding:',       // 资金费率哈希键前缀 / Funding hash key prefix
  KLINE_HASH: 'market:kline:',           // K线哈希键前缀 / Kline hash key prefix
  CHANNEL: 'market_data',                // 发布频道名称 / Publish channel name
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // Redis 配置 / Redis configuration
  redis: { // 设置 redis 字段
    host: process.env.REDIS_HOST || 'localhost',        // Redis 主机 / Redis host
    port: parseInt(process.env.REDIS_PORT || '6379', 10),  // Redis 端口 / Redis port
    password: process.env.REDIS_PASSWORD || null,       // Redis 密码 / Redis password
    db: parseInt(process.env.REDIS_DB || '0', 10),      // Redis 数据库 / Redis database
    keyPrefix: '',            // 键前缀 / Key prefix
  }, // 结束代码块
  // 重连配置 / Reconnection configuration
  reconnect: { // 设置 reconnect 字段
    enabled: true,            // 是否启用自动重连 / Enable auto reconnect
    maxAttempts: 10,          // 最大重连次数 / Maximum reconnection attempts
    baseDelay: 1000,          // 基础延迟毫秒 / Base delay in milliseconds
    maxDelay: 30000,          // 最大延迟毫秒 / Maximum delay in milliseconds
  }, // 结束代码块
  // 心跳配置 / Heartbeat configuration
  heartbeat: { // 设置 heartbeat 字段
    enabled: true,            // 是否启用心跳 / Enable heartbeat
    interval: 20000,          // 心跳间隔毫秒 / Heartbeat interval in milliseconds
    timeout: 30000,           // 心跳超时毫秒 / Heartbeat timeout in milliseconds
  }, // 结束代码块
  // 流配置 / Stream configuration
  stream: { // 设置 stream 字段
    maxLen: 10000,            // 最大流长度 / Maximum stream length
    trimApprox: true,         // 近似裁剪 / Approximate trimming
  }, // 结束代码块
  // WebSocket 连接池配置 / WebSocket connection pool configuration
  connectionPool: { // 设置 connectionPool 字段
    maxSubscriptionsPerConnection: 100,  // 每个连接的最大订阅数 / Max subscriptions per connection
    useCombinedStream: true,             // 是否使用 Binance Combined Stream / Use Binance Combined Stream
  }, // 结束代码块
  // 数据超时配置 / Data timeout configuration
  dataTimeout: { // 设置 dataTimeout 字段
    enabled: true,            // 是否启用数据超时检测 / Enable data timeout detection
    timeout: 30000,           // 无数据超时毫秒 / No data timeout in milliseconds
    checkInterval: 5000,      // 检查间隔毫秒 / Check interval in milliseconds
  }, // 结束代码块
  // Cache configuration
  cache: { // 设置 cache 字段
    maxCandles: 1000, // 设置 maxCandles 字段
    historyCandles: 200, // 设置 historyCandles 字段
  }, // 结束代码块
}; // 结束代码块

/**
 * 实时行情数据引擎类
 * Real-time Market Data Engine Class
 *
 * 同时管理多个交易所的 WebSocket 连接，提供统一的行情数据接口
 * Manages WebSocket connections for multiple exchanges, provides unified market data interface
 */
export class MarketDataEngine extends EventEmitter { // 导出类 MarketDataEngine
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
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 合并默认配置 / Merge default configuration
    this.config = { // 设置 config
      // Redis 配置 / Redis configuration
      redis: { ...DEFAULT_CONFIG.redis, ...config.redis }, // 设置 redis 字段
      enableRedis: config.enableRedis ?? true, // 设置 enableRedis 字段
      // 重连配置 / Reconnection configuration
      reconnect: { ...DEFAULT_CONFIG.reconnect, ...config.reconnect }, // 设置 reconnect 字段
      // 心跳配置 / Heartbeat configuration
      heartbeat: { ...DEFAULT_CONFIG.heartbeat, ...config.heartbeat }, // 设置 heartbeat 字段
      // 流配置 / Stream configuration
      stream: { ...DEFAULT_CONFIG.stream, ...config.stream }, // 设置 stream 字段
      // 连接池配置 / Connection pool configuration
      connectionPool: { ...DEFAULT_CONFIG.connectionPool, ...config.connectionPool }, // 设置 connectionPool 字段
      // 数据超时配置 / Data timeout configuration
      dataTimeout: { ...DEFAULT_CONFIG.dataTimeout, ...config.dataTimeout }, // 设置 dataTimeout 字段
      // Cache configuration
      cache: { ...DEFAULT_CONFIG.cache, ...config.cache }, // 设置 cache 字段
      // 启用的交易所 / Enabled exchanges
      exchanges: config.exchanges || ['binance', 'bybit', 'okx'], // 设置 exchanges 字段
      // 交易类型 (swap = 永续合约) / Trading type (swap = perpetual)
      tradingType: config.tradingType || 'swap', // 设置 tradingType 字段
    }; // 结束代码块

    const maxCandles = Number.isFinite(this.config.cache.maxCandles) // 定义常量 maxCandles
      ? this.config.cache.maxCandles // 执行语句
      : DEFAULT_CONFIG.cache.maxCandles; // 执行语句
    const historyCandles = Number.isFinite(this.config.cache.historyCandles) // 定义常量 historyCandles
      ? this.config.cache.historyCandles // 执行语句
      : DEFAULT_CONFIG.cache.historyCandles; // 执行语句

    this.config.cache.maxCandles = Math.max(1, maxCandles); // 访问 config
    this.config.cache.historyCandles = Math.max( // 访问 config
      1, // 执行语句
      Math.min(historyCandles, this.config.cache.maxCandles) // 调用 Math.min
    ); // 结束调用或参数

    // ============================================
    // 内部状态 / Internal State
    // ============================================

    // WebSocket 连接映射 { exchange: WebSocket } (单连接模式) / WebSocket connection map (single connection mode)
    // 或 { exchange: Map<connectionId, WebSocket> } (连接池模式) / Or connection pool mode
    this.connections = new Map(); // 设置 connections

    // 连接池映射 { exchange: Map<connectionId, { ws, subscriptions: Set, lastDataTime }> }
    // Connection pool map for exchanges that need multiple connections
    this.connectionPools = new Map(); // 设置 connectionPools

    // 连接状态映射 { exchange: { connected, reconnecting, attempt } } / Connection status map
    this.connectionStatus = new Map(); // 设置 connectionStatus

    // 订阅映射 { exchange: Set<subscriptionKey> } / Subscription map
    this.subscriptions = new Map(); // 设置 subscriptions

    // 订阅到连接的映射 { exchange: Map<subscriptionKey, connectionId> }
    // Maps subscriptions to their connection IDs
    this.subscriptionToConnection = new Map(); // 设置 subscriptionToConnection

    // 心跳定时器映射 { exchange: timer } 或 { exchange: Map<connectionId, timer> }
    // Heartbeat timer map
    this.heartbeatTimers = new Map(); // 设置 heartbeatTimers

    // 数据超时检测定时器映射 { exchange: timer } 或 { exchange: Map<connectionId, timer> }
    // Data timeout check timer map
    this.dataTimeoutTimers = new Map(); // 设置 dataTimeoutTimers

    // 最后数据接收时间映射 { exchange: timestamp } 或 { exchange: Map<connectionId, timestamp> }
    // Last data received time map
    this.lastDataTime = new Map(); // 设置 lastDataTime

    // 时间同步数据 { exchange: { offset, lastSync } } / Time sync data
    this.timeSync = new Map(); // 设置 timeSync

    // Redis 客户端实例 / Redis client instance
    this.redis = null; // 设置 redis

    // Redis 发布客户端 (用于 pub/sub) / Redis publish client (for pub/sub)
    this.redisPub = null; // 设置 redisPub

    // 运行状态标志 / Running status flag
    this.running = false; // 设置 running

    // 初始化状态标志 / Initialization status flag
    this.initialized = false; // 设置 initialized

    // 数据缓存 / Data cache
    this.cache = { // 设置 cache
      tickers: new Map(),     // { symbol: ticker } 行情缓存 / Ticker cache
      depths: new Map(),      // { symbol: depth } 深度缓存 / Depth cache
      fundingRates: new Map(), // { symbol: fundingRate } 资金费率缓存 / Funding rate cache
      klines: new Map(),      // { symbol: kline[] } K线缓存 / Kline cache
      lastEmittedFundingRates: new Map(), // { cacheKey: fundingRate } 最后发出的资金费率 / Last emitted funding rates for deduplication
    }; // 结束代码块

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      messagesReceived: 0,    // 接收的消息数 / Messages received
      messagesPublished: 0,   // 发布的消息数 / Messages published
      errors: 0,              // 错误数 / Error count
      reconnections: 0,       // 重连次数 / Reconnection count
      startTime: null,        // 启动时间 / Start time
    }; // 结束代码块

    // 日志前缀 / Log prefix
    this.logPrefix = '[MarketDataEngine]'; // 设置 logPrefix

    // 初始化每个交易所的状态 / Initialize status for each exchange
    this._initializeExchangeStatus(); // 调用 _initializeExchangeStatus
  } // 结束代码块

  // ============================================
  // 公共方法 / Public Methods
  // ============================================

  /**
   * 启动行情引擎
   * Start market data engine
   *
   * @returns {Promise<void>}
   */
  async start() { // 执行语句
    // 如果已经运行，直接返回 / If already running, return
    if (this.running) { // 条件判断 this.running
      console.log(`${this.logPrefix} 引擎已在运行 / Engine already running`); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    console.log(`${this.logPrefix} [链路] 正在启动行情引擎... / Starting market data engine...`); // 控制台输出
    console.log(`${this.logPrefix} [链路] 配置的交易所列表 / Configured exchanges: [${this.config.exchanges.join(', ')}]`); // 控制台输出

    try { // 尝试执行
      // 1. 初始化 Redis 连接 / Initialize Redis connection
      if (this.config.enableRedis) { // 条件判断 this.config.enableRedis
        await this._initializeRedis(); // 等待异步结果
      } else { // 执行语句
        console.log(`${this.logPrefix} Redis 已禁用 / Redis disabled`); // 控制台输出
      } // 结束代码块

      // 2. 连接所有交易所 WebSocket / Connect to all exchange WebSockets
      await this._connectAllExchanges(); // 等待异步结果

      // 3. 更新运行状态 / Update running status
      this.running = true; // 设置 running

      // 4. 记录启动时间 / Record start time
      this.stats.startTime = Date.now(); // 访问 stats

      // 5. 标记为已初始化 / Mark as initialized
      this.initialized = true; // 设置 initialized

      // 6. 发出启动事件 / Emit start event
      this.emit('started'); // 调用 emit

      console.log(`${this.logPrefix} 行情引擎启动成功 / Market data engine started successfully`); // 控制台输出

    } catch (error) { // 执行语句
      // 记录错误 / Log error
      console.error(`${this.logPrefix} 启动失败 / Start failed:`, error.message); // 控制台输出

      // 发出错误事件 / Emit error event
      this.emit('error', error); // 调用 emit

      // 抛出错误 / Throw error
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 停止行情引擎
   * Stop market data engine
   *
   * @returns {Promise<void>}
   */
  async stop() { // 执行语句
    // 如果未运行，直接返回 / If not running, return
    if (!this.running) { // 条件判断 !this.running
      console.log(`${this.logPrefix} 引擎未在运行 / Engine not running`); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    console.log(`${this.logPrefix} 正在停止行情引擎... / Stopping market data engine...`); // 控制台输出

    // 更新运行状态 / Update running status
    this.running = false; // 设置 running

    // 1. 断开所有 WebSocket 连接 / Disconnect all WebSocket connections
    await this._disconnectAllExchanges(); // 等待异步结果

    // 2. 关闭 Redis 连接 / Close Redis connections
    if (this.config.enableRedis) { // 条件判断 this.config.enableRedis
      await this._closeRedis(); // 等待异步结果
    } // 结束代码块

    // 3. 清理心跳定时器 / Clear heartbeat timers
    this._clearAllHeartbeats(); // 调用 _clearAllHeartbeats

    // 4. 发出停止事件 / Emit stop event
    this.emit('stopped'); // 调用 emit

    console.log(`${this.logPrefix} 行情引擎已停止 / Market data engine stopped`); // 控制台输出
  } // 结束代码块

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
  async subscribe(symbol, dataTypes = [DATA_TYPES.TICKER], exchanges = null) { // 执行语句
    // 使用所有启用的交易所或指定的交易所 / Use all enabled exchanges or specified ones
    const targetExchanges = exchanges || this.config.exchanges; // 定义常量 targetExchanges

    // 验证数据类型 / Validate data types
    const validDataTypes = Object.values(DATA_TYPES); // 定义常量 validDataTypes
    for (const dt of dataTypes) { // 循环 const dt of dataTypes
      if (!validDataTypes.includes(dt)) { // 条件判断 !validDataTypes.includes(dt)
        throw new Error(`无效的数据类型 / Invalid data type: ${dt}`); // 抛出异常
      } // 结束代码块
    } // 结束代码块

    console.log(`${this.logPrefix} [链路] 订阅行情: ${symbol} 类型=[${dataTypes.join(', ')}] 交易所=[${targetExchanges.join(', ')}] / Subscribing market data`); // 控制台输出

    // 在每个交易所订阅 / Subscribe on each exchange
    for (const exchange of targetExchanges) { // 循环 const exchange of targetExchanges
      // 检查交易所是否启用 / Check if exchange is enabled
      if (!this.connections.has(exchange)) { // 条件判断 !this.connections.has(exchange)
        console.warn(`${this.logPrefix} 交易所未连接 / Exchange not connected: ${exchange}`); // 控制台输出
        continue; // 继续下一轮循环
      } // 结束代码块

      // 订阅每种数据类型 / Subscribe to each data type
      for (const dataType of dataTypes) { // 循环 const dataType of dataTypes
        await this._subscribeToExchange(exchange, symbol, dataType); // 等待异步结果
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 取消订阅交易对行情
   * Unsubscribe from symbol market data
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array<string>} dataTypes - 数据类型数组 / Data type array
   * @param {Array<string>} exchanges - 交易所数组 (可选) / Exchange array (optional)
   * @returns {Promise<void>}
   */
  async unsubscribe(symbol, dataTypes = [DATA_TYPES.TICKER], exchanges = null) { // 执行语句
    // 使用所有启用的交易所或指定的交易所 / Use all enabled exchanges or specified ones
    const targetExchanges = exchanges || this.config.exchanges; // 定义常量 targetExchanges

    console.log(`${this.logPrefix} 取消订阅 / Unsubscribing: ${symbol} [${dataTypes.join(', ')}] from [${targetExchanges.join(', ')}]`); // 控制台输出

    // 在每个交易所取消订阅 / Unsubscribe on each exchange
    for (const exchange of targetExchanges) { // 循环 const exchange of targetExchanges
      // 检查交易所是否启用 / Check if exchange is enabled
      if (!this.connections.has(exchange)) { // 条件判断 !this.connections.has(exchange)
        continue; // 继续下一轮循环
      } // 结束代码块

      // 取消订阅每种数据类型 / Unsubscribe from each data type
      for (const dataType of dataTypes) { // 循环 const dataType of dataTypes
        await this._unsubscribeFromExchange(exchange, symbol, dataType); // 等待异步结果
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 批量订阅多个交易对
   * Batch subscribe to multiple symbols
   *
   * @param {Array<string>} symbols - 交易对数组 / Trading pair array
   * @param {Array<string>} dataTypes - 数据类型数组 / Data type array
   * @param {Array<string>} exchanges - 交易所数组 (可选) / Exchange array (optional)
   * @returns {Promise<void>}
   */
  async batchSubscribe(symbols, dataTypes = [DATA_TYPES.TICKER], exchanges = null) { // 执行语句
    console.log(`${this.logPrefix} 批量订阅 / Batch subscribing: ${symbols.length} symbols`); // 控制台输出

    // 并行订阅所有交易对 / Subscribe to all symbols in parallel
    const promises = symbols.map(symbol => this.subscribe(symbol, dataTypes, exchanges)); // 定义函数 promises

    // 等待所有订阅完成 / Wait for all subscriptions to complete
    await Promise.all(promises); // 等待异步结果
  } // 结束代码块

  /**
   * 批量取消订阅多个交易对
   * Batch unsubscribe from multiple symbols
   *
   * @param {Array<string>} symbols - 交易对数组 / Trading pair array
   * @param {Array<string>} dataTypes - 数据类型数组 / Data type array
   * @param {Array<string>} exchanges - 交易所数组 (可选) / Exchange array (optional)
   * @returns {Promise<void>}
   */
  async batchUnsubscribe(symbols, dataTypes = [DATA_TYPES.TICKER], exchanges = null) { // 执行语句
    console.log(`${this.logPrefix} 批量取消订阅 / Batch unsubscribing: ${symbols.length} symbols`); // 控制台输出

    // 并行取消订阅所有交易对 / Unsubscribe from all symbols in parallel
    const promises = symbols.map(symbol => this.unsubscribe(symbol, dataTypes, exchanges)); // 定义函数 promises

    // 等待所有取消订阅完成 / Wait for all unsubscriptions to complete
    await Promise.all(promises); // 等待异步结果
  } // 结束代码块

  /**
   * 获取缓存的行情数据
   * Get cached ticker data
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} exchange - 交易所 (可选) / Exchange (optional)
   * @returns {Object|null} 行情数据 / Ticker data
   */
  getTicker(symbol, exchange = null) { // 调用 getTicker
    // 构建缓存键 / Build cache key
    const key = exchange ? `${exchange}:${symbol}` : symbol; // 定义常量 key

    // 返回缓存数据 / Return cached data
    return this.cache.tickers.get(key) || null; // 返回结果
  } // 结束代码块

  /**
   * 获取缓存的深度数据
   * Get cached depth data
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} exchange - 交易所 (可选) / Exchange (optional)
   * @returns {Object|null} 深度数据 / Depth data
   */
  getDepth(symbol, exchange = null) { // 调用 getDepth
    // 构建缓存键 / Build cache key
    const key = exchange ? `${exchange}:${symbol}` : symbol; // 定义常量 key

    // 返回缓存数据 / Return cached data
    return this.cache.depths.get(key) || null; // 返回结果
  } // 结束代码块

  /**
   * 获取缓存的资金费率
   * Get cached funding rate
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} exchange - 交易所 (可选) / Exchange (optional)
   * @returns {Object|null} 资金费率数据 / Funding rate data
   */
  getFundingRate(symbol, exchange = null) { // 调用 getFundingRate
    // 构建缓存键 / Build cache key
    const key = exchange ? `${exchange}:${symbol}` : symbol; // 定义常量 key

    // 返回缓存数据 / Return cached data
    return this.cache.fundingRates.get(key) || null; // 返回结果
  } // 结束代码块

  /**
   * 获取所有交易所的连接状态
   * Get connection status for all exchanges
   *
   * @returns {Object} 连接状态对象 / Connection status object
   */
  getConnectionStatus() { // 调用 getConnectionStatus
    // 构建状态对象 / Build status object
    const status = {}; // 定义常量 status

    // 遍历所有交易所 / Iterate all exchanges
    for (const [exchange, state] of this.connectionStatus) { // 循环 const [exchange, state] of this.connectionStatus
      status[exchange] = { // 执行语句
        connected: state.connected,       // 是否已连接 / Is connected
        reconnecting: state.reconnecting, // 是否正在重连 / Is reconnecting
        attempt: state.attempt,           // 当前重连次数 / Current reconnection attempt
      }; // 结束代码块
    } // 结束代码块

    return status; // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息对象 / Statistics object
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      ...this.stats, // 展开对象或数组
      // 运行时长秒数 / Running duration in seconds
      uptimeSeconds: this.stats.startTime // 设置 uptimeSeconds 字段
        ? Math.floor((Date.now() - this.stats.startTime) / 1000) // 执行语句
        : 0, // 执行语句
      // 每个交易所的订阅数 / Subscription count per exchange
      subscriptions: this._getSubscriptionCounts(), // 设置 subscriptions 字段
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 私有方法 - 初始化 / Private Methods - Initialization
  // ============================================

  /**
   * 初始化每个交易所的状态
   * Initialize status for each exchange
   * @private
   */
  _initializeExchangeStatus() { // 调用 _initializeExchangeStatus
    // 遍历所有启用的交易所 / Iterate all enabled exchanges
    for (const exchange of this.config.exchanges) { // 循环 const exchange of this.config.exchanges
      // 初始化连接状态 / Initialize connection status
      this.connectionStatus.set(exchange, { // 访问 connectionStatus
        connected: false,       // 是否已连接 / Is connected
        reconnecting: false,    // 是否正在重连 / Is reconnecting
        attempt: 0,             // 重连次数 / Reconnection attempt count
      }); // 结束代码块

      // 初始化订阅集合 / Initialize subscription set
      this.subscriptions.set(exchange, new Set()); // 访问 subscriptions

      // 初始化订阅到连接的映射 / Initialize subscription to connection mapping
      this.subscriptionToConnection.set(exchange, new Map()); // 访问 subscriptionToConnection

      // 初始化连接池 / Initialize connection pool
      this.connectionPools.set(exchange, new Map()); // 访问 connectionPools

      // 初始化最后数据接收时间 / Initialize last data received time
      this.lastDataTime.set(exchange, new Map()); // 访问 lastDataTime

      // 初始化时间同步数据 / Initialize time sync data
      this.timeSync.set(exchange, { // 访问 timeSync
        offset: 0,              // 时间偏移毫秒 / Time offset in milliseconds
        lastSync: 0,            // 最后同步时间 / Last sync time
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 初始化 Redis 连接
   * Initialize Redis connection
   * @private
   */
  async _initializeRedis() { // 执行语句
    console.log(`${this.logPrefix} 正在连接 Redis... / Connecting to Redis...`); // 控制台输出

    // 创建 Redis 客户端 / Create Redis client
    this.redis = new Redis({ // 设置 redis
      host: this.config.redis.host,       // 主机 / Host
      port: this.config.redis.port,       // 端口 / Port
      password: this.config.redis.password, // 密码 / Password
      db: this.config.redis.db,           // 数据库 / Database
      keyPrefix: this.config.redis.keyPrefix, // 键前缀 / Key prefix
      // 连接选项 / Connection options
      retryStrategy: (times) => { // 设置 retryStrategy 字段
        // 重试策略: 指数退避，最大 30 秒 / Retry strategy: exponential backoff, max 30s
        const delay = Math.min(times * 100, 30000); // 定义常量 delay
        return delay; // 返回结果
      }, // 结束代码块
      maxRetriesPerRequest: 3,            // 每请求最大重试次数 / Max retries per request
      enableReadyCheck: true,             // 启用就绪检查 / Enable ready check
      lazyConnect: false,                 // 立即连接 / Connect immediately
    }); // 结束代码块

    // 创建发布专用客户端 / Create dedicated publish client
    this.redisPub = this.redis.duplicate(); // 设置 redisPub

    // 监听 Redis 错误 / Listen for Redis errors
    this.redis.on('error', (error) => { // 访问 redis
      console.error(`${this.logPrefix} Redis 错误 / Redis error:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
    }); // 结束代码块

    // 监听 Redis 连接 / Listen for Redis connection
    this.redis.on('connect', () => { // 访问 redis
      console.log(`${this.logPrefix} Redis 已连接 / Redis connected`); // 控制台输出
    }); // 结束代码块

    // 等待 Redis 就绪 / Wait for Redis ready
    await new Promise((resolve, reject) => { // 等待异步结果
      // 如果已经就绪 / If already ready
      if (this.redis.status === 'ready') { // 条件判断 this.redis.status === 'ready'
        resolve(); // 调用 resolve
        return; // 返回结果
      } // 结束代码块

      // 监听就绪事件 / Listen for ready event
      this.redis.once('ready', resolve); // 访问 redis

      // 监听错误事件 / Listen for error event
      this.redis.once('error', reject); // 访问 redis

      // 超时处理 / Timeout handling
      setTimeout(() => { // 设置延时任务
        reject(new Error('Redis 连接超时 / Redis connection timeout')); // 调用 reject
      }, 10000); // 执行语句
    }); // 结束代码块

    console.log(`${this.logPrefix} Redis 连接成功 / Redis connected successfully`); // 控制台输出
  } // 结束代码块

  /**
   * 关闭 Redis 连接
   * Close Redis connection
   * @private
   */
  async _closeRedis() { // 执行语句
    // 关闭主客户端 / Close main client
    if (this.redis) { // 条件判断 this.redis
      await this.redis.quit(); // 等待异步结果
      this.redis = null; // 设置 redis
    } // 结束代码块

    // 关闭发布客户端 / Close publish client
    if (this.redisPub) { // 条件判断 this.redisPub
      await this.redisPub.quit(); // 等待异步结果
      this.redisPub = null; // 设置 redisPub
    } // 结束代码块

    console.log(`${this.logPrefix} Redis 连接已关闭 / Redis connections closed`); // 控制台输出
  } // 结束代码块

  // ============================================
  // 私有方法 - WebSocket 连接 / Private Methods - WebSocket Connection
  // ============================================

  /**
   * 连接所有交易所
   * Connect to all exchanges
   * @private
   */
  async _connectAllExchanges() { // 执行语句
    console.log(`${this.logPrefix} 正在连接所有交易所... / Connecting to all exchanges...`); // 控制台输出

    // 并行连接所有交易所 / Connect to all exchanges in parallel
    const promises = this.config.exchanges.map(exchange => // 定义函数 promises
      this._connectExchange(exchange) // 调用 _connectExchange
    ); // 结束调用或参数

    // 等待所有连接完成 / Wait for all connections to complete
    await Promise.allSettled(promises); // 等待异步结果
  } // 结束代码块

  /**
   * 断开所有交易所连接
   * Disconnect from all exchanges
   * @private
   */
  async _disconnectAllExchanges() { // 执行语句
    console.log(`${this.logPrefix} 正在断开所有交易所连接... / Disconnecting from all exchanges...`); // 控制台输出

    // 遍历所有连接池 / Iterate all connection pools
    for (const [exchange, pool] of this.connectionPools) { // 循环 const [exchange, pool] of this.connectionPools
      // 停止所有数据超时检测 / Stop all data timeout checks
      this._stopDataTimeoutCheck(exchange); // 调用 _stopDataTimeoutCheck

      // 遍历连接池中的所有连接 / Iterate all connections in the pool
      for (const [connectionId, connInfo] of pool) { // 循环 const [connectionId, connInfo] of pool
        // 停止心跳 / Stop heartbeat
        this._stopHeartbeatForConnection(exchange, connectionId); // 调用 _stopHeartbeatForConnection

        // 关闭连接 / Close connection
        if (connInfo.ws && connInfo.ws.readyState === WebSocket.OPEN) { // 条件判断 connInfo.ws && connInfo.ws.readyState === Web...
          connInfo.ws.close(1000, 'Client disconnect'); // 调用 connInfo.ws.close
        } // 结束代码块
      } // 结束代码块

      // 清空连接池 / Clear connection pool
      pool.clear(); // 调用 pool.clear
    } // 结束代码块

    // 遍历旧的单连接映射 (向后兼容) / Iterate old single connection map (backward compatibility)
    for (const [exchange, ws] of this.connections) { // 循环 const [exchange, ws] of this.connections
      // 停止心跳 / Stop heartbeat
      this._stopHeartbeat(exchange); // 调用 _stopHeartbeat

      // 关闭连接 / Close connection
      if (ws && ws.readyState === WebSocket.OPEN) { // 条件判断 ws && ws.readyState === WebSocket.OPEN
        ws.close(1000, 'Client disconnect'); // 调用 ws.close
      } // 结束代码块

      // 更新状态 / Update status
      const status = this.connectionStatus.get(exchange); // 定义常量 status
      if (status) { // 条件判断 status
        status.connected = false; // 赋值 status.connected
        status.reconnecting = false; // 赋值 status.reconnecting
      } // 结束代码块
    } // 结束代码块

    // 清空连接映射 / Clear connections map
    this.connections.clear(); // 访问 connections
  } // 结束代码块

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
  _generateConnectionId() { // 调用 _generateConnectionId
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; // 返回结果
  } // 结束代码块

  /**
   * 获取 Binance 的 Combined Stream URL
   * Get Binance Combined Stream URL
   *
   * @param {Array<string>} streams - 流名称数组 / Stream name array
   * @returns {string} Combined Stream URL
   * @private
   */
  _getBinanceCombinedStreamUrl(streams) { // 调用 _getBinanceCombinedStreamUrl
    const tradingType = this.config.tradingType; // 定义常量 tradingType
    const streamBaseUrl = tradingType === 'spot' // 定义常量 streamBaseUrl
      ? 'wss://stream.binance.com:9443/stream' // 执行语句
      : 'wss://fstream.binance.com/stream'; // 执行语句
    const wsBaseUrl = tradingType === 'spot' // 定义常量 wsBaseUrl
      ? 'wss://stream.binance.com:9443/ws' // 执行语句
      : 'wss://fstream.binance.com/ws'; // 执行语句

    // 如果没有流，返回基础 URL / If no streams, return WS base URL
    if (!streams || streams.length === 0) { // 条件判断 !streams || streams.length === 0
      return wsBaseUrl; // 返回结果
    } // 结束代码块

    // 构建 Combined Stream URL / Build Combined Stream URL
    return `${streamBaseUrl}?streams=${streams.join('/')}`; // 返回结果
  } // 结束代码块

  /**
   * 将订阅键转换为 Binance 流名称
   * Convert subscription key to Binance stream name
   *
   * @param {string} subKey - 订阅键 (格式: dataType:symbol) / Subscription key (format: dataType:symbol)
   * @returns {string} Binance 流名称 / Binance stream name
   * @private
   */
  _subscriptionKeyToBinanceStream(subKey) { // 调用 _subscriptionKeyToBinanceStream
    const [dataType, symbol] = subKey.split(':'); // 解构赋值
    const binanceSymbol = symbol.replace('/', '').toLowerCase(); // 定义常量 binanceSymbol

    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        return `${binanceSymbol}@ticker`; // 返回结果
      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        return `${binanceSymbol}@depth20@100ms`; // 返回结果
      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        return `${binanceSymbol}@trade`; // 返回结果
      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        return `${binanceSymbol}@markPrice@1s`; // 返回结果
      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        return `${binanceSymbol}@kline_1h`; // 返回结果
      default: // 默认分支
        return `${binanceSymbol}@ticker`; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 为 Binance 创建新的 Combined Stream 连接
   * Create new Combined Stream connection for Binance
   *
   * @param {Array<string>} subscriptionKeys - 订阅键数组 / Subscription key array
   * @returns {Promise<string>} 连接 ID / Connection ID
   * @private
   */
  async _createBinanceCombinedStreamConnection(subscriptionKeys = []) { // 执行语句
    const exchange = 'binance'; // 定义常量 exchange
    const connectionId = this._generateConnectionId(); // 定义常量 connectionId

    // 转换订阅键为流名称 / Convert subscription keys to stream names
    const streams = subscriptionKeys.map(key => this._subscriptionKeyToBinanceStream(key)); // 定义函数 streams

    // 获取 Combined Stream URL / Get Combined Stream URL
    const wsUrl = this._getBinanceCombinedStreamUrl(streams); // 定义常量 wsUrl

    console.log(`${this.logPrefix} Binance 创建 Combined Stream 连接 / Creating Combined Stream connection: ${connectionId}, streams: ${streams.length}`); // 控制台输出

    return new Promise((resolve, reject) => { // 返回结果
      try { // 尝试执行
        const ws = new WebSocket(wsUrl); // 定义常量 ws

        ws.on('open', () => { // 注册事件监听
          console.log(`${this.logPrefix} Binance Combined Stream 连接成功 / Connected: ${connectionId}`); // 控制台输出

          // 创建连接信息对象 / Create connection info object
          const connInfo = { // 定义常量 connInfo
            ws, // 执行语句
            subscriptions: new Set(subscriptionKeys), // 设置 subscriptions 字段
            lastDataTime: Date.now(), // 设置 lastDataTime 字段
            connectionId, // 执行语句
          }; // 结束代码块

          // 存储到连接池 / Store in connection pool
          const pool = this.connectionPools.get(exchange); // 定义常量 pool
          pool.set(connectionId, connInfo); // 调用 pool.set

          // 更新订阅到连接的映射 / Update subscription to connection mapping
          const subToConn = this.subscriptionToConnection.get(exchange); // 定义常量 subToConn
          for (const subKey of subscriptionKeys) { // 循环 const subKey of subscriptionKeys
            subToConn.set(subKey, connectionId); // 调用 subToConn.set
          } // 结束代码块

          // 更新最后数据时间 / Update last data time
          const lastDataTimeMap = this.lastDataTime.get(exchange); // 定义常量 lastDataTimeMap
          lastDataTimeMap.set(connectionId, Date.now()); // 调用 lastDataTimeMap.set

          // 更新连接状态 / Update connection status
          const status = this.connectionStatus.get(exchange); // 定义常量 status
          status.connected = true; // 赋值 status.connected
          status.reconnecting = false; // 赋值 status.reconnecting
          status.attempt = 0; // 赋值 status.attempt

          // 启动心跳 / Start heartbeat
          this._startHeartbeatForConnection(exchange, connectionId); // 调用 _startHeartbeatForConnection

          // 启动数据超时检测 / Start data timeout check
          this._startDataTimeoutCheck(exchange, connectionId); // 调用 _startDataTimeoutCheck

          resolve(connectionId); // 调用 resolve
        }); // 结束代码块

        ws.on('message', (data) => { // 注册事件监听
          // 更新最后数据接收时间 / Update last data received time
          const lastDataTimeMap = this.lastDataTime.get(exchange); // 定义常量 lastDataTimeMap
          if (lastDataTimeMap) { // 条件判断 lastDataTimeMap
            lastDataTimeMap.set(connectionId, Date.now()); // 调用 lastDataTimeMap.set
          } // 结束代码块

          // 处理消息 / Handle message
          this._handleBinanceCombinedStreamMessage(connectionId, data); // 调用 _handleBinanceCombinedStreamMessage
        }); // 结束代码块

        ws.on('error', (error) => { // 注册事件监听
          console.error(`${this.logPrefix} Binance Combined Stream 错误 / Error [${connectionId}]:`, error.message); // 控制台输出
          this.stats.errors++; // 访问 stats
          this.emit('error', { exchange, connectionId, error }); // 调用 emit
        }); // 结束代码块

        ws.on('close', (code, reason) => { // 注册事件监听
          console.log(`${this.logPrefix} Binance Combined Stream 关闭 / Closed [${connectionId}] - Code: ${code}`); // 控制台输出

          // 停止心跳 / Stop heartbeat
          this._stopHeartbeatForConnection(exchange, connectionId); // 调用 _stopHeartbeatForConnection

          // 停止数据超时检测 / Stop data timeout check
          this._stopDataTimeoutCheckForConnection(exchange, connectionId); // 调用 _stopDataTimeoutCheckForConnection

          // 从连接池移除 / Remove from connection pool
          const pool = this.connectionPools.get(exchange); // 定义常量 pool
          const connInfo = pool.get(connectionId); // 定义常量 connInfo

          if (connInfo) { // 条件判断 connInfo
            // 获取此连接的所有订阅 / Get all subscriptions for this connection
            const subscriptionsToReconnect = Array.from(connInfo.subscriptions); // 定义常量 subscriptionsToReconnect
            pool.delete(connectionId); // 调用 pool.delete

            // 从订阅到连接映射中移除 / Remove from subscription to connection mapping
            const subToConn = this.subscriptionToConnection.get(exchange); // 定义常量 subToConn
            for (const subKey of subscriptionsToReconnect) { // 循环 const subKey of subscriptionsToReconnect
              subToConn.delete(subKey); // 调用 subToConn.delete
            } // 结束代码块

            // 如果有订阅需要重连，则尝试重连 / If there are subscriptions to reconnect, attempt reconnection
            if (this.running && this.config.reconnect.enabled && subscriptionsToReconnect.length > 0) { // 条件判断 this.running && this.config.reconnect.enabled...
              this._attemptBinanceCombinedStreamReconnect(subscriptionsToReconnect); // 调用 _attemptBinanceCombinedStreamReconnect
            } // 结束代码块
          } // 结束代码块

          // 检查是否还有活跃连接 / Check if there are still active connections
          if (pool.size === 0) { // 条件判断 pool.size === 0
            const status = this.connectionStatus.get(exchange); // 定义常量 status
            status.connected = false; // 赋值 status.connected
          } // 结束代码块

          this.emit('disconnected', { exchange, connectionId, code, reason: reason.toString() }); // 调用 emit
        }); // 结束代码块

        ws.on('pong', () => { // 注册事件监听
          const lastDataTimeMap = this.lastDataTime.get(exchange); // 定义常量 lastDataTimeMap
          if (lastDataTimeMap) { // 条件判断 lastDataTimeMap
            lastDataTimeMap.set(connectionId, Date.now()); // 调用 lastDataTimeMap.set
          } // 结束代码块
        }); // 结束代码块

      } catch (error) { // 执行语句
        console.error(`${this.logPrefix} 创建 Binance Combined Stream 失败 / Failed to create Combined Stream:`, error.message); // 控制台输出
        reject(error); // 调用 reject
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 处理 Binance Combined Stream 消息
   * Handle Binance Combined Stream message
   *
   * @param {string} connectionId - 连接 ID / Connection ID
   * @param {Buffer|string} rawData - 原始消息数据 / Raw message data
   * @private
   */
  _handleBinanceCombinedStreamMessage(connectionId, rawData) { // 调用 _handleBinanceCombinedStreamMessage
    try { // 尝试执行
      const message = JSON.parse(rawData.toString()); // 定义常量 message

      // Combined Stream 消息格式: { stream: "btcusdt@ticker", data: {...} }
      if (message.stream && message.data) { // 条件判断 message.stream && message.data
        // 转换为标准消息格式并处理 / Convert to standard message format and process
        this._handleMessage('binance', JSON.stringify(message.data)); // 调用 _handleMessage
      } else { // 执行语句
        // 非数据消息 (如订阅确认) / Non-data message (e.g., subscription confirmation)
        this._handleMessage('binance', rawData); // 调用 _handleMessage
      } // 结束代码块
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 解析 Binance Combined Stream 消息失败 / Failed to parse Combined Stream message:`, error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  /**
   * 尝试重连 Binance Combined Stream
   * Attempt to reconnect Binance Combined Stream
   *
   * @param {Array<string>} subscriptionKeys - 需要重新订阅的订阅键 / Subscription keys to resubscribe
   * @private
   */
  async _attemptBinanceCombinedStreamReconnect(subscriptionKeys) { // 执行语句
    const exchange = 'binance'; // 定义常量 exchange
    const status = this.connectionStatus.get(exchange); // 定义常量 status

    // 计算延迟 / Calculate delay
    const delay = Math.min( // 定义常量 delay
      this.config.reconnect.baseDelay * Math.pow(2, status.attempt), // 访问 config
      this.config.reconnect.maxDelay // 访问 config
    ); // 结束调用或参数

    console.log(`${this.logPrefix} Binance Combined Stream 将在 ${delay}ms 后重连 / Will reconnect in ${delay}ms, subscriptions: ${subscriptionKeys.length}`); // 控制台输出

    setTimeout(async () => { // 设置延时任务
      if (!this.running) return; // 条件判断 !this.running

      try { // 尝试执行
        // 按配置的最大订阅数分组 / Group by configured max subscriptions
        const maxSubs = this.config.connectionPool.maxSubscriptionsPerConnection; // 定义常量 maxSubs
        const chunks = []; // 定义常量 chunks
        for (let i = 0; i < subscriptionKeys.length; i += maxSubs) { // 循环 let i = 0; i < subscriptionKeys.length; i += ...
          chunks.push(subscriptionKeys.slice(i, i + maxSubs)); // 调用 chunks.push
        } // 结束代码块

        // 为每个分组创建新连接 / Create new connection for each chunk
        for (const chunk of chunks) { // 循环 const chunk of chunks
          await this._createBinanceCombinedStreamConnection(chunk); // 等待异步结果
        } // 结束代码块

        status.attempt = 0; // 赋值 status.attempt
      } catch (error) { // 执行语句
        status.attempt++; // 执行语句
        if (status.attempt < this.config.reconnect.maxAttempts) { // 条件判断 status.attempt < this.config.reconnect.maxAtt...
          this._attemptBinanceCombinedStreamReconnect(subscriptionKeys); // 调用 _attemptBinanceCombinedStreamReconnect
        } else { // 执行语句
          console.error(`${this.logPrefix} Binance Combined Stream 重连失败，已达最大重试次数 / Reconnect failed, max attempts reached`); // 控制台输出
        } // 结束代码块
      } // 结束代码块
    }, delay); // 执行语句
  } // 结束代码块

  /**
   * 获取或创建 Binance 连接用于新订阅
   * Get or create Binance connection for new subscription
   *
   * @param {string} subKey - 订阅键 / Subscription key
   * @returns {Promise<string>} 连接 ID / Connection ID
   * @private
   */
  async _getOrCreateBinanceConnection(subKey) { // 执行语句
    const exchange = 'binance'; // 定义常量 exchange
    const pool = this.connectionPools.get(exchange); // 定义常量 pool
    const maxSubs = this.config.connectionPool.maxSubscriptionsPerConnection; // 定义常量 maxSubs

    // 查找有空余容量的连接 / Find connection with available capacity
    for (const [connectionId, connInfo] of pool) { // 循环 const [connectionId, connInfo] of pool
      if (connInfo.subscriptions.size < maxSubs) { // 条件判断 connInfo.subscriptions.size < maxSubs
        return connectionId; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 没有可用连接，创建新连接 / No available connection, create new one
    return await this._createBinanceCombinedStreamConnection([subKey]); // 返回结果
  } // 结束代码块

  /**
   * 向 Binance 连接添加订阅
   * Add subscription to Binance connection
   *
   * @param {string} connectionId - 连接 ID / Connection ID
   * @param {string} subKey - 订阅键 / Subscription key
   * @private
   */
  _addSubscriptionToBinanceConnection(connectionId, subKey) { // 调用 _addSubscriptionToBinanceConnection
    const exchange = 'binance'; // 定义常量 exchange
    const pool = this.connectionPools.get(exchange); // 定义常量 pool
    const connInfo = pool.get(connectionId); // 定义常量 connInfo

    if (!connInfo || !connInfo.ws || connInfo.ws.readyState !== WebSocket.OPEN) { // 条件判断 !connInfo || !connInfo.ws || connInfo.ws.read...
      console.warn(`${this.logPrefix} Binance connection not available: ${connectionId}`); // 控制台输出
      return false; // 返回结果
    } // 结束代码块

    if (connInfo.subscriptions.has(subKey)) { // 条件判断 connInfo.subscriptions.has(subKey)
      const subToConn = this.subscriptionToConnection.get(exchange); // 定义常量 subToConn
      subToConn.set(subKey, connectionId); // 调用 subToConn.set
      return true; // 返回结果
    } // 结束代码块

    // Add to connection's subscription set
    connInfo.subscriptions.add(subKey); // 调用 connInfo.subscriptions.add

    // Update subscription to connection mapping
    const subToConn = this.subscriptionToConnection.get(exchange); // 定义常量 subToConn
    subToConn.set(subKey, connectionId); // 调用 subToConn.set

    // Send subscription message
    const stream = this._subscriptionKeyToBinanceStream(subKey); // 定义常量 stream
    const message = { // 定义常量 message
      method: 'SUBSCRIBE', // 设置 method 字段
      params: [stream], // 设置 params 字段
      id: Date.now(), // 设置 id 字段
    }; // 结束代码块
    connInfo.ws.send(JSON.stringify(message)); // 调用 connInfo.ws.send

    console.log(`${this.logPrefix} Binance subscribed [${connectionId}]: ${subKey}`); // 控制台输出
    return true; // 返回结果
  } // 结束代码块

  /**
   * 从 Binance 连接移除订阅
   * Remove subscription from Binance connection
   *
   * @param {string} subKey - 订阅键 / Subscription key
   * @private
   */
  _removeSubscriptionFromBinanceConnection(subKey) { // 调用 _removeSubscriptionFromBinanceConnection
    const exchange = 'binance'; // 定义常量 exchange
    const subToConn = this.subscriptionToConnection.get(exchange); // 定义常量 subToConn
    const connectionId = subToConn.get(subKey); // 定义常量 connectionId

    if (!connectionId) return; // 条件判断 !connectionId

    const pool = this.connectionPools.get(exchange); // 定义常量 pool
    const connInfo = pool.get(connectionId); // 定义常量 connInfo

    if (connInfo) { // 条件判断 connInfo
      // 从连接的订阅集合移除 / Remove from connection's subscription set
      connInfo.subscriptions.delete(subKey); // 调用 connInfo.subscriptions.delete

      // 发送取消订阅消息 / Send unsubscribe message
      if (connInfo.ws && connInfo.ws.readyState === WebSocket.OPEN) { // 条件判断 connInfo.ws && connInfo.ws.readyState === Web...
        const stream = this._subscriptionKeyToBinanceStream(subKey); // 定义常量 stream
        const message = { // 定义常量 message
          method: 'UNSUBSCRIBE', // 设置 method 字段
          params: [stream], // 设置 params 字段
          id: Date.now(), // 设置 id 字段
        }; // 结束代码块
        connInfo.ws.send(JSON.stringify(message)); // 调用 connInfo.ws.send
      } // 结束代码块

      console.log(`${this.logPrefix} Binance 已取消订阅 / Unsubscribed [${connectionId}]: ${subKey}`); // 控制台输出
    } // 结束代码块

    // 从映射中移除 / Remove from mapping
    subToConn.delete(subKey); // 调用 subToConn.delete
  } // 结束代码块

  /**
   * 连接到指定交易所
   * Connect to specified exchange
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  async _connectExchange(exchange) { // 执行语句
    // KuCoin 需要特殊处理：先获取动态 WebSocket URL 和 token
    // KuCoin requires special handling: get dynamic WebSocket URL and token first
    let wsUrl; // 定义变量 wsUrl
    let connectId = null; // 定义变量 connectId

    if (exchange === 'kucoin') { // 条件判断 exchange === 'kucoin'
      try { // 尝试执行
        const wsInfo = await this._getKuCoinWebSocketInfo(); // 定义常量 wsInfo
        wsUrl = wsInfo.url; // 赋值 wsUrl
        connectId = wsInfo.connectId; // 赋值 connectId
        console.log(`${this.logPrefix} KuCoin WebSocket token 已获取 / KuCoin WebSocket token obtained`); // 控制台输出
      } catch (error) { // 执行语句
        console.error(`${this.logPrefix} 获取 KuCoin WebSocket token 失败 / Failed to get KuCoin WebSocket token:`, error.message); // 控制台输出
        throw error; // 抛出异常
      } // 结束代码块
    } else { // 执行语句
      // 其他交易所使用静态 URL / Other exchanges use static URL
      wsUrl = this._getWsUrl(exchange); // 赋值 wsUrl
    } // 结束代码块

    console.log(`${this.logPrefix} 正在连接 / Connecting to ${exchange}: ${wsUrl}`); // 控制台输出

    return new Promise((resolve, reject) => { // 返回结果
      try { // 尝试执行
        // 创建 WebSocket 连接 / Create WebSocket connection
        const ws = new WebSocket(wsUrl); // 定义常量 ws

        // 连接打开事件 / Connection open event
        ws.on('open', () => { // 注册事件监听
          console.log(`${this.logPrefix} ${exchange} WebSocket 已连接 / WebSocket connected`); // 控制台输出

          // 存储连接 / Store connection
          this.connections.set(exchange, ws); // 访问 connections

          // 更新连接状态 / Update connection status
          const status = this.connectionStatus.get(exchange); // 定义常量 status
          status.connected = true; // 赋值 status.connected
          status.reconnecting = false; // 赋值 status.reconnecting
          status.attempt = 0; // 赋值 status.attempt

          // 初始化最后数据时间 / Initialize last data time
          this._updateLastDataTime(exchange); // 调用 _updateLastDataTime

          // 同步时间 / Sync time
          this._syncTime(exchange); // 调用 _syncTime

          // 启动心跳 / Start heartbeat
          this._startHeartbeat(exchange); // 调用 _startHeartbeat

          // 启动数据超时检测 / Start data timeout check
          this._startDataTimeoutCheck(exchange); // 调用 _startDataTimeoutCheck

          // 重新订阅 / Resubscribe
          this._resubscribe(exchange); // 调用 _resubscribe

          // 发出连接事件 / Emit connected event
          this.emit('connected', { exchange }); // 调用 emit

          // 解析 Promise / Resolve promise
          resolve(); // 调用 resolve
        }); // 结束代码块

        // 接收消息事件 / Message received event
        ws.on('message', (data) => { // 注册事件监听
          // 更新最后数据接收时间 / Update last data received time
          this._updateLastDataTime(exchange); // 调用 _updateLastDataTime

          // 处理消息 / Handle message
          this._handleMessage(exchange, data); // 调用 _handleMessage
        }); // 结束代码块

        // 错误事件 / Error event
        ws.on('error', (error) => { // 注册事件监听
          console.error(`${this.logPrefix} ${exchange} WebSocket 错误 / WebSocket error:`, error.message); // 控制台输出

          // 增加错误计数 / Increment error count
          this.stats.errors++; // 访问 stats

          // 发出错误事件 / Emit error event
          this.emit('error', { exchange, error }); // 调用 emit

          // 如果尚未连接，拒绝 Promise / If not connected yet, reject promise
          const status = this.connectionStatus.get(exchange); // 定义常量 status
          if (!status.connected) { // 条件判断 !status.connected
            reject(error); // 调用 reject
          } // 结束代码块
        }); // 结束代码块

        // 关闭事件 / Close event
        ws.on('close', (code, reason) => { // 注册事件监听
          console.log(`${this.logPrefix} ${exchange} WebSocket 关闭 / WebSocket closed - Code: ${code}`); // 控制台输出

          // 更新连接状态 / Update connection status
          const status = this.connectionStatus.get(exchange); // 定义常量 status
          status.connected = false; // 赋值 status.connected

          // 停止心跳 / Stop heartbeat
          this._stopHeartbeat(exchange); // 调用 _stopHeartbeat

          // 停止数据超时检测 / Stop data timeout check
          this._stopDataTimeoutCheck(exchange); // 调用 _stopDataTimeoutCheck

          // 从连接映射中移除 / Remove from connections map
          this.connections.delete(exchange); // 访问 connections

          // 发出断开连接事件 / Emit disconnected event
          this.emit('disconnected', { exchange, code, reason: reason.toString() }); // 调用 emit

          // 尝试重连 / Attempt reconnection
          if (this.running && this.config.reconnect.enabled) { // 条件判断 this.running && this.config.reconnect.enabled
            this._attemptReconnect(exchange); // 调用 _attemptReconnect
          } // 结束代码块
        }); // 结束代码块

        // Pong 事件 (心跳响应) / Pong event (heartbeat response)
        ws.on('pong', () => { // 注册事件监听
          // 更新最后数据时间 / Update last data time
          this._updateLastDataTime(exchange); // 调用 _updateLastDataTime

          // 更新时间同步 / Update time sync
          const sync = this.timeSync.get(exchange); // 定义常量 sync
          if (sync) { // 条件判断 sync
            sync.lastSync = Date.now(); // 赋值 sync.lastSync
          } // 结束代码块
        }); // 结束代码块

      } catch (error) { // 执行语句
        // 记录错误 / Log error
        console.error(`${this.logPrefix} 连接 ${exchange} 失败 / Failed to connect to ${exchange}:`, error.message); // 控制台输出

        // 拒绝 Promise / Reject promise
        reject(error); // 调用 reject
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取交易所的 WebSocket URL
   * Get WebSocket URL for exchange
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @returns {string} WebSocket URL
   * @private
   */
  _getWsUrl(exchange) { // 调用 _getWsUrl
    // 获取交易类型 / Get trading type
    const tradingType = this.config.tradingType; // 定义常量 tradingType

    // 根据交易所返回对应 URL / Return URL based on exchange
    switch (exchange) { // 分支选择 exchange
      case 'binance': // 分支 'binance'
        // Binance: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot' // 返回结果
          ? WS_ENDPOINTS.binance.spot // 执行语句
          : WS_ENDPOINTS.binance.futures; // 执行语句

      case 'bybit': // 分支 'bybit'
        // Bybit: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot' // 返回结果
          ? WS_ENDPOINTS.bybit.spot // 执行语句
          : WS_ENDPOINTS.bybit.linear; // 执行语句

      case 'okx': // 分支 'okx'
        // OKX: 使用公共端点 / Use public endpoint
        return WS_ENDPOINTS.okx.public; // 返回结果

      case 'deribit': // 分支 'deribit'
        // Deribit: 根据 sandbox 配置选择端点 / Select endpoint based on sandbox config
        return this.config.sandbox // 返回结果
          ? WS_ENDPOINTS.deribit.testnet // 执行语句
          : WS_ENDPOINTS.deribit.public; // 执行语句

      case 'gate': // 分支 'gate'
        // Gate.io: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot' // 返回结果
          ? WS_ENDPOINTS.gate.spot // 执行语句
          : WS_ENDPOINTS.gate.futures; // 执行语句

      case 'bitget': // 分支 'bitget'
        // Bitget: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot' // 返回结果
          ? WS_ENDPOINTS.bitget.spot // 执行语句
          : WS_ENDPOINTS.bitget.futures; // 执行语句

      case 'kucoin': // 分支 'kucoin'
        // KuCoin: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot' // 返回结果
          ? WS_ENDPOINTS.kucoin.spot // 执行语句
          : WS_ENDPOINTS.kucoin.futures; // 执行语句

      case 'kraken': // 分支 'kraken'
        // Kraken: 根据交易类型选择端点 / Select endpoint based on trading type
        return tradingType === 'spot' // 返回结果
          ? WS_ENDPOINTS.kraken.spot // 执行语句
          : WS_ENDPOINTS.kraken.futures; // 执行语句

      default: // 默认分支
        // 不支持的交易所 / Unsupported exchange
        throw new Error(`不支持的交易所 / Unsupported exchange: ${exchange}`); // 抛出异常
    } // 结束代码块
  } // 结束代码块

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
  async _getKuCoinWebSocketInfo() { // 执行语句
    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot'; // 定义常量 isSpot
    const apiUrl = isSpot // 定义常量 apiUrl
      ? WS_ENDPOINTS.kucoin.spotTokenApi // 执行语句
      : WS_ENDPOINTS.kucoin.futuresTokenApi; // 执行语句

    try { // 尝试执行
      // 调用 KuCoin REST API 获取 WebSocket token / Call KuCoin REST API to get WebSocket token
      const response = await fetch(apiUrl, { // 定义常量 response
        method: 'POST', // 设置 method 字段
        headers: { // 设置 headers 字段
          'Content-Type': 'application/json', // 设置 Content-Type 字段
        }, // 结束代码块
      }); // 结束代码块

      // 检查响应状态 / Check response status
      if (!response.ok) { // 条件判断 !response.ok
        throw new Error(`HTTP error! status: ${response.status}`); // 抛出异常
      } // 结束代码块

      // 解析响应 / Parse response
      const result = await response.json(); // 定义常量 result

      // 检查返回码 / Check return code
      if (result.code !== '200000') { // 条件判断 result.code !== '200000'
        throw new Error(`KuCoin API error: ${result.msg || result.code}`); // 抛出异常
      } // 结束代码块

      // 获取数据 / Get data
      const data = result.data; // 定义常量 data

      // 获取 WebSocket 服务器信息 / Get WebSocket server info
      // KuCoin 返回的服务器列表中选择第一个 / Select the first server from KuCoin's server list
      const server = data.instanceServers[0]; // 定义常量 server
      const token = data.token; // 定义常量 token

      // 构建 WebSocket URL / Build WebSocket URL
      // 格式: wss://server.endpoint?token=xxx&connectId=xxx
      const connectId = `${Date.now()}`; // 定义常量 connectId
      const wsUrl = `${server.endpoint}?token=${token}&connectId=${connectId}`; // 定义常量 wsUrl

      // 存储 ping 间隔用于心跳 / Store ping interval for heartbeat
      this._kucoinPingInterval = server.pingInterval || 18000; // 设置 _kucoinPingInterval
      this._kucoinPingTimeout = server.pingTimeout || 10000; // 设置 _kucoinPingTimeout

      console.log(`${this.logPrefix} KuCoin WebSocket 服务器 / KuCoin WebSocket server: ${server.endpoint}`); // 控制台输出
      console.log(`${this.logPrefix} KuCoin Ping 间隔 / KuCoin Ping interval: ${this._kucoinPingInterval}ms`); // 控制台输出

      return { // 返回结果
        url: wsUrl, // 设置 url 字段
        token, // 执行语句
        connectId, // 执行语句
        pingInterval: server.pingInterval, // 设置 pingInterval 字段
        pingTimeout: server.pingTimeout, // 设置 pingTimeout 字段
      }; // 结束代码块

    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 获取 KuCoin WebSocket 信息失败 / Failed to get KuCoin WebSocket info:`, error.message); // 控制台输出
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 尝试重新连接
   * Attempt reconnection
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _attemptReconnect(exchange) { // 调用 _attemptReconnect
    // 获取连接状态 / Get connection status
    const status = this.connectionStatus.get(exchange); // 定义常量 status

    // 如果正在重连，返回 / If already reconnecting, return
    if (status.reconnecting) { // 条件判断 status.reconnecting
      return; // 返回结果
    } // 结束代码块

    // 检查重连次数 / Check reconnection attempts
    if (status.attempt >= this.config.reconnect.maxAttempts) { // 条件判断 status.attempt >= this.config.reconnect.maxAt...
      console.error(`${this.logPrefix} ${exchange} 达到最大重连次数 / Maximum reconnection attempts reached`); // 控制台输出

      // 发出重连失败事件 / Emit reconnection failed event
      this.emit('reconnectFailed', { exchange }); // 调用 emit
      return; // 返回结果
    } // 结束代码块

    // 更新重连状态 / Update reconnection status
    status.reconnecting = true; // 赋值 status.reconnecting
    status.attempt++; // 执行语句
    this.stats.reconnections++; // 访问 stats

    // 计算延迟 (指数退避 + 随机抖动) / Calculate delay (exponential backoff + random jitter)
    const baseDelay = this.config.reconnect.baseDelay; // 定义常量 baseDelay
    const maxDelay = this.config.reconnect.maxDelay; // 定义常量 maxDelay
    const exponentialDelay = baseDelay * Math.pow(2, status.attempt - 1); // 定义常量 exponentialDelay
    const jitter = Math.random() * 1000;  // 0-1 秒随机抖动 / 0-1 second random jitter
    const delay = Math.min(exponentialDelay + jitter, maxDelay); // 定义常量 delay

    console.log(`${this.logPrefix} ${exchange} ${delay.toFixed(0)}ms 后尝试第 ${status.attempt} 次重连 / Attempting reconnection #${status.attempt} in ${delay.toFixed(0)}ms`); // 控制台输出

    // 延迟重连 / Delayed reconnection
    setTimeout(async () => { // 设置延时任务
      // 如果引擎已停止，不重连 / If engine stopped, don't reconnect
      if (!this.running) { // 条件判断 !this.running
        status.reconnecting = false; // 赋值 status.reconnecting
        return; // 返回结果
      } // 结束代码块

      try { // 尝试执行
        // 尝试连接 / Attempt connection
        await this._connectExchange(exchange); // 等待异步结果

      } catch (error) { // 执行语句
        // 重连失败，继续尝试 / Reconnection failed, continue trying
        console.error(`${this.logPrefix} ${exchange} 重连失败 / Reconnection failed:`, error.message); // 控制台输出
        status.reconnecting = false; // 赋值 status.reconnecting

        // 继续重连 / Continue reconnecting
        this._attemptReconnect(exchange); // 调用 _attemptReconnect
      } // 结束代码块
    }, delay); // 执行语句
  } // 结束代码块

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
  _startHeartbeat(exchange) { // 调用 _startHeartbeat
    // 如果心跳未启用，返回 / If heartbeat not enabled, return
    if (!this.config.heartbeat.enabled) { // 条件判断 !this.config.heartbeat.enabled
      return; // 返回结果
    } // 结束代码块

    // 停止现有心跳 / Stop existing heartbeat
    this._stopHeartbeat(exchange); // 调用 _stopHeartbeat

    // 获取 WebSocket 连接 / Get WebSocket connection
    const ws = this.connections.get(exchange); // 定义常量 ws
    if (!ws) { // 条件判断 !ws
      return; // 返回结果
    } // 结束代码块

    // 确定心跳间隔 / Determine heartbeat interval
    // KuCoin 使用服务器返回的间隔，其他交易所使用配置的间隔
    // KuCoin uses server-returned interval, others use configured interval
    let heartbeatInterval = this.config.heartbeat.interval; // 定义变量 heartbeatInterval
    if (exchange === 'kucoin' && this._kucoinPingInterval) { // 条件判断 exchange === 'kucoin' && this._kucoinPingInte...
      // KuCoin 要求在 pingTimeout 之前发送 ping
      // KuCoin requires sending ping before pingTimeout
      heartbeatInterval = this._kucoinPingInterval; // 赋值 heartbeatInterval
    } // 结束代码块

    // 创建心跳定时器 / Create heartbeat timer
    const timer = setInterval(() => { // 定义函数 timer
      // 检查连接状态 / Check connection status
      if (ws.readyState === WebSocket.OPEN) { // 条件判断 ws.readyState === WebSocket.OPEN
        // 根据交易所发送不同的心跳 / Send different heartbeat based on exchange
        if (exchange === 'bybit') { // 条件判断 exchange === 'bybit'
          // Bybit 使用 ping 消息 / Bybit uses ping message
          ws.send(JSON.stringify({ op: 'ping' })); // 调用 ws.send
        } else if (exchange === 'okx') { // 执行语句
          // OKX 使用 ping 字符串 / OKX uses ping string
          ws.send('ping'); // 调用 ws.send
        } else if (exchange === 'deribit') { // 执行语句
          // Deribit 使用 JSON-RPC 2.0 格式的 test 方法 / Deribit uses JSON-RPC 2.0 test method
          ws.send(JSON.stringify({ // 调用 ws.send
            jsonrpc: '2.0', // 设置 jsonrpc 字段
            method: 'public/test', // 设置 method 字段
            id: Date.now(), // 设置 id 字段
            params: {}, // 设置 params 字段
          })); // 结束代码块
        } else if (exchange === 'gate') { // 执行语句
          // Gate.io 使用 ping 消息 / Gate.io uses ping message
          // 现货和合约使用不同的格式 / Spot and futures use different formats
          const pingMessage = this.config.tradingType === 'spot' // 定义常量 pingMessage
            ? { time: Math.floor(Date.now() / 1000), channel: 'spot.ping' } // 执行语句
            : { time: Math.floor(Date.now() / 1000), channel: 'futures.ping' }; // 执行语句
          ws.send(JSON.stringify(pingMessage)); // 调用 ws.send
        } else if (exchange === 'bitget') { // 执行语句
          // Bitget 使用 ping 字符串 / Bitget uses ping string
          ws.send('ping'); // 调用 ws.send
        } else if (exchange === 'kucoin') { // 执行语句
          // KuCoin 使用 JSON 格式的 ping 消息 / KuCoin uses JSON format ping message
          // 格式: {"id":"xxx","type":"ping"}
          ws.send(JSON.stringify({ // 调用 ws.send
            id: Date.now().toString(), // 设置 id 字段
            type: 'ping', // 设置 type 字段
          })); // 结束代码块
        } else if (exchange === 'kraken') { // 执行语句
          // Kraken 根据交易类型使用不同的心跳格式 / Kraken uses different heartbeat format based on trading type
          if (this.config.tradingType === 'spot') { // 条件判断 this.config.tradingType === 'spot'
            // 现货使用 ping 事件 / Spot uses ping event
            ws.send(JSON.stringify({ event: 'ping' })); // 调用 ws.send
          } else { // 执行语句
            // 合约使用 heartbeat 事件 / Futures uses heartbeat event
            ws.send(JSON.stringify({ event: 'heartbeat' })); // 调用 ws.send
          } // 结束代码块
        } else { // 执行语句
          // Binance 使用 WebSocket ping / Binance uses WebSocket ping
          ws.ping(); // 调用 ws.ping
        } // 结束代码块
      } // 结束代码块
    }, heartbeatInterval); // 执行语句

    // 存储定时器 / Store timer
    this.heartbeatTimers.set(exchange, timer); // 访问 heartbeatTimers
  } // 结束代码块

  /**
   * 停止心跳
   * Stop heartbeat
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _stopHeartbeat(exchange) { // 调用 _stopHeartbeat
    // 获取定时器 / Get timer
    const timer = this.heartbeatTimers.get(exchange); // 定义常量 timer

    // 清除定时器 / Clear timer
    if (timer) { // 条件判断 timer
      clearInterval(timer); // 调用 clearInterval
      this.heartbeatTimers.delete(exchange); // 访问 heartbeatTimers
    } // 结束代码块
  } // 结束代码块

  /**
   * 清除所有心跳
   * Clear all heartbeats
   * @private
   */
  _clearAllHeartbeats() { // 调用 _clearAllHeartbeats
    // 遍历所有定时器 / Iterate all timers
    for (const [exchange, timer] of this.heartbeatTimers) { // 循环 const [exchange, timer] of this.heartbeatTimers
      if (timer instanceof Map) { // 条件判断 timer instanceof Map
        // 连接池模式 / Connection pool mode
        for (const [, t] of timer) { // 循环 const [, t] of timer
          clearInterval(t); // 调用 clearInterval
        } // 结束代码块
      } else { // 执行语句
        clearInterval(timer); // 调用 clearInterval
      } // 结束代码块
    } // 结束代码块

    // 清空映射 / Clear map
    this.heartbeatTimers.clear(); // 访问 heartbeatTimers
  } // 结束代码块

  /**
   * 为连接池中的特定连接启动心跳
   * Start heartbeat for specific connection in pool
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} connectionId - 连接 ID / Connection ID
   * @private
   */
  _startHeartbeatForConnection(exchange, connectionId) { // 调用 _startHeartbeatForConnection
    if (!this.config.heartbeat.enabled) return; // 条件判断 !this.config.heartbeat.enabled

    const pool = this.connectionPools.get(exchange); // 定义常量 pool
    const connInfo = pool?.get(connectionId); // 定义常量 connInfo
    if (!connInfo || !connInfo.ws) return; // 条件判断 !connInfo || !connInfo.ws

    // 获取或创建心跳定时器映射 / Get or create heartbeat timer map
    let timerMap = this.heartbeatTimers.get(exchange); // 定义变量 timerMap
    if (!(timerMap instanceof Map)) { // 条件判断 !(timerMap instanceof Map)
      timerMap = new Map(); // 赋值 timerMap
      this.heartbeatTimers.set(exchange, timerMap); // 访问 heartbeatTimers
    } // 结束代码块

    // 停止现有心跳 / Stop existing heartbeat
    const existingTimer = timerMap.get(connectionId); // 定义常量 existingTimer
    if (existingTimer) { // 条件判断 existingTimer
      clearInterval(existingTimer); // 调用 clearInterval
    } // 结束代码块

    const heartbeatInterval = this.config.heartbeat.interval; // 定义常量 heartbeatInterval

    const timer = setInterval(() => { // 定义函数 timer
      if (connInfo.ws && connInfo.ws.readyState === WebSocket.OPEN) { // 条件判断 connInfo.ws && connInfo.ws.readyState === Web...
        // Binance 使用 WebSocket ping / Binance uses WebSocket ping
        connInfo.ws.ping(); // 调用 connInfo.ws.ping
      } // 结束代码块
    }, heartbeatInterval); // 执行语句

    timerMap.set(connectionId, timer); // 调用 timerMap.set
  } // 结束代码块

  /**
   * 停止连接池中特定连接的心跳
   * Stop heartbeat for specific connection in pool
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} connectionId - 连接 ID / Connection ID
   * @private
   */
  _stopHeartbeatForConnection(exchange, connectionId) { // 调用 _stopHeartbeatForConnection
    const timerMap = this.heartbeatTimers.get(exchange); // 定义常量 timerMap
    if (timerMap instanceof Map) { // 条件判断 timerMap instanceof Map
      const timer = timerMap.get(connectionId); // 定义常量 timer
      if (timer) { // 条件判断 timer
        clearInterval(timer); // 调用 clearInterval
        timerMap.delete(connectionId); // 调用 timerMap.delete
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

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
  _startDataTimeoutCheck(exchange, connectionId = null) { // 调用 _startDataTimeoutCheck
    if (!this.config.dataTimeout.enabled) return; // 条件判断 !this.config.dataTimeout.enabled

    const checkInterval = this.config.dataTimeout.checkInterval; // 定义常量 checkInterval
    const timeout = this.config.dataTimeout.timeout; // 定义常量 timeout

    // 获取或创建数据超时定时器映射 / Get or create data timeout timer map
    let timerMap = this.dataTimeoutTimers.get(exchange); // 定义变量 timerMap
    if (!timerMap) { // 条件判断 !timerMap
      timerMap = new Map(); // 赋值 timerMap
      this.dataTimeoutTimers.set(exchange, timerMap); // 访问 dataTimeoutTimers
    } // 结束代码块

    const timerId = connectionId || 'default'; // 定义常量 timerId

    // 停止现有检测 / Stop existing check
    const existingTimer = timerMap.get(timerId); // 定义常量 existingTimer
    if (existingTimer) { // 条件判断 existingTimer
      clearInterval(existingTimer); // 调用 clearInterval
    } // 结束代码块

    const timer = setInterval(() => { // 定义函数 timer
      this._checkDataTimeout(exchange, connectionId); // 调用 _checkDataTimeout
    }, checkInterval); // 执行语句

    timerMap.set(timerId, timer); // 调用 timerMap.set

    console.log(`${this.logPrefix} ${exchange} 数据超时检测已启动 / Data timeout check started${connectionId ? ` [${connectionId}]` : ''}`); // 控制台输出
  } // 结束代码块

  /**
   * 停止数据超时检测
   * Stop data timeout check
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _stopDataTimeoutCheck(exchange) { // 调用 _stopDataTimeoutCheck
    const timerMap = this.dataTimeoutTimers.get(exchange); // 定义常量 timerMap
    if (timerMap) { // 条件判断 timerMap
      for (const [, timer] of timerMap) { // 循环 const [, timer] of timerMap
        clearInterval(timer); // 调用 clearInterval
      } // 结束代码块
      timerMap.clear(); // 调用 timerMap.clear
    } // 结束代码块
  } // 结束代码块

  /**
   * 停止特定连接的数据超时检测
   * Stop data timeout check for specific connection
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} connectionId - 连接 ID / Connection ID
   * @private
   */
  _stopDataTimeoutCheckForConnection(exchange, connectionId) { // 调用 _stopDataTimeoutCheckForConnection
    const timerMap = this.dataTimeoutTimers.get(exchange); // 定义常量 timerMap
    if (timerMap) { // 条件判断 timerMap
      const timer = timerMap.get(connectionId); // 定义常量 timer
      if (timer) { // 条件判断 timer
        clearInterval(timer); // 调用 clearInterval
        timerMap.delete(connectionId); // 调用 timerMap.delete
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查数据超时并触发重连
   * Check data timeout and trigger reconnection
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} connectionId - 连接 ID (可选) / Connection ID (optional)
   * @private
   */
  _checkDataTimeout(exchange, connectionId = null) { // 调用 _checkDataTimeout
    const timeout = this.config.dataTimeout.timeout; // 定义常量 timeout
    const now = Date.now(); // 定义常量 now

    if (connectionId) { // 条件判断 connectionId
      // 连接池模式 / Connection pool mode
      const lastDataTimeMap = this.lastDataTime.get(exchange); // 定义常量 lastDataTimeMap
      const lastTime = lastDataTimeMap?.get(connectionId); // 定义常量 lastTime

      if (lastTime && (now - lastTime) > timeout) { // 条件判断 lastTime && (now - lastTime) > timeout
        console.warn(`${this.logPrefix} ${exchange} [${connectionId}] 数据超时 (${now - lastTime}ms)，触发重连 / Data timeout, triggering reconnection`); // 控制台输出

        // 获取连接信息 / Get connection info
        const pool = this.connectionPools.get(exchange); // 定义常量 pool
        const connInfo = pool?.get(connectionId); // 定义常量 connInfo

        if (connInfo && connInfo.ws) { // 条件判断 connInfo && connInfo.ws
          // 关闭连接触发重连 / Close connection to trigger reconnection
          connInfo.ws.close(4000, 'Data timeout'); // 调用 connInfo.ws.close
        } // 结束代码块
      } // 结束代码块
    } else { // 执行语句
      // 单连接模式 / Single connection mode
      const lastTimeMap = this.lastDataTime.get(exchange); // 定义常量 lastTimeMap
      const lastTime = lastTimeMap?.get('default') || 0; // 定义常量 lastTime

      if (lastTime && (now - lastTime) > timeout) { // 条件判断 lastTime && (now - lastTime) > timeout
        console.warn(`${this.logPrefix} ${exchange} 数据超时 (${now - lastTime}ms)，触发重连 / Data timeout, triggering reconnection`); // 控制台输出

        const ws = this.connections.get(exchange); // 定义常量 ws
        if (ws) { // 条件判断 ws
          ws.close(4000, 'Data timeout'); // 调用 ws.close
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新最后数据接收时间 (用于单连接模式)
   * Update last data received time (for single connection mode)
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _updateLastDataTime(exchange) { // 调用 _updateLastDataTime
    let lastDataTimeMap = this.lastDataTime.get(exchange); // 定义变量 lastDataTimeMap
    if (!lastDataTimeMap) { // 条件判断 !lastDataTimeMap
      lastDataTimeMap = new Map(); // 赋值 lastDataTimeMap
      this.lastDataTime.set(exchange, lastDataTimeMap); // 访问 lastDataTime
    } // 结束代码块
    lastDataTimeMap.set('default', Date.now()); // 调用 lastDataTimeMap.set
  } // 结束代码块

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
  _normalizeSymbol(symbol) { // 调用 _normalizeSymbol
    // 移除永续合约的 :USDT 后缀 / Remove perpetual contract :USDT suffix
    // BTC/USDT:USDT -> BTC/USDT
    // ETH/USDT:USDT -> ETH/USDT
    return symbol.replace(/:USDT$/, ''); // 返回结果
  } // 结束代码块

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
  async _subscribeToExchange(exchange, symbol, dataType) { // 执行语句
    // 标准化交易对格式 / Normalize symbol format
    // 确保订阅键与数据键格式一致 / Ensure subscription key matches data key format
    const normalizedSymbol = this._normalizeSymbol(symbol); // 定义常量 normalizedSymbol

    // 构建订阅键 / Build subscription key
    const subKey = `${dataType}:${normalizedSymbol}`; // 定义常量 subKey

    // 获取订阅集合 / Get subscription set
    const subs = this.subscriptions.get(exchange); // 定义常量 subs

    // 如果已订阅，跳过 / If already subscribed, skip
    if (subs.has(subKey)) { // 条件判断 subs.has(subKey)
      return; // 返回结果
    } // 结束代码块

    // Binance 使用 Combined Stream 连接池 / Binance uses Combined Stream connection pool
    if (exchange === 'binance' && this.config.connectionPool.useCombinedStream) { // 条件判断 exchange === 'binance' && this.config.connect...
      try { // 尝试执行
        // 获取或创建连接 / Get or create connection
        const connectionId = await this._getOrCreateBinanceConnection(subKey); // 定义常量 connectionId

        // 添加订阅到连接 / Add subscription to connection
        if (this._addSubscriptionToBinanceConnection(connectionId, subKey)) { // 条件判断 this._addSubscriptionToBinanceConnection(conn...
          // 添加到全局订阅集合 / Add to global subscription set
          subs.add(subKey); // 调用 subs.add
        } // 结束代码块
      } catch (error) { // 执行语句
        console.error(`${this.logPrefix} Binance 订阅失败 / Subscription failed: ${subKey}`, error.message); // 控制台输出
      } // 结束代码块
      return; // 返回结果
    } // 结束代码块

    // 其他交易所使用单连接模式 / Other exchanges use single connection mode
    const ws = this.connections.get(exchange); // 定义常量 ws
    if (!ws || ws.readyState !== WebSocket.OPEN) { // 条件判断 !ws || ws.readyState !== WebSocket.OPEN
      console.warn(`${this.logPrefix} ${exchange} 未连接，跳过订阅 / Not connected, skipping subscription`); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    // 添加到订阅集合 / Add to subscription set
    subs.add(subKey); // 调用 subs.add

    // 构建订阅消息 / Build subscription message
    const message = this._buildSubscribeMessage(exchange, symbol, dataType); // 定义常量 message

    // 发送订阅消息 / Send subscription message
    ws.send(JSON.stringify(message)); // 调用 ws.send

    console.log(`${this.logPrefix} ${exchange} 已订阅 / Subscribed: ${subKey}`); // 控制台输出
  } // 结束代码块

  /**
   * 在指定交易所取消订阅
   * Unsubscribe from specified exchange
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @private
   */
  async _unsubscribeFromExchange(exchange, symbol, dataType) { // 执行语句
    // 标准化交易对格式 / Normalize symbol format
    // 确保订阅键与数据键格式一致 / Ensure subscription key matches data key format
    const normalizedSymbol = this._normalizeSymbol(symbol); // 定义常量 normalizedSymbol

    // 构建订阅键 / Build subscription key
    const subKey = `${dataType}:${normalizedSymbol}`; // 定义常量 subKey

    // 获取订阅集合 / Get subscription set
    const subs = this.subscriptions.get(exchange); // 定义常量 subs

    // 如果未订阅，跳过 / If not subscribed, skip
    if (!subs.has(subKey)) { // 条件判断 !subs.has(subKey)
      return; // 返回结果
    } // 结束代码块

    // 从订阅集合移除 / Remove from subscription set
    subs.delete(subKey); // 调用 subs.delete

    // Binance 使用 Combined Stream 连接池 / Binance uses Combined Stream connection pool
    if (exchange === 'binance' && this.config.connectionPool.useCombinedStream) { // 条件判断 exchange === 'binance' && this.config.connect...
      this._removeSubscriptionFromBinanceConnection(subKey); // 调用 _removeSubscriptionFromBinanceConnection
      return; // 返回结果
    } // 结束代码块

    // 其他交易所使用单连接模式 / Other exchanges use single connection mode
    const ws = this.connections.get(exchange); // 定义常量 ws
    if (!ws || ws.readyState !== WebSocket.OPEN) { // 条件判断 !ws || ws.readyState !== WebSocket.OPEN
      return; // 返回结果
    } // 结束代码块

    // 构建取消订阅消息 / Build unsubscribe message
    const message = this._buildUnsubscribeMessage(exchange, symbol, dataType); // 定义常量 message

    // 发送取消订阅消息 / Send unsubscribe message
    ws.send(JSON.stringify(message)); // 调用 ws.send

    console.log(`${this.logPrefix} ${exchange} 已取消订阅 / Unsubscribed: ${subKey}`); // 控制台输出
  } // 结束代码块

  /**
   * 重新订阅
   * Resubscribe to channels
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @private
   */
  _resubscribe(exchange) { // 调用 _resubscribe
    // 获取订阅集合 / Get subscription set
    const subs = this.subscriptions.get(exchange); // 定义常量 subs
    if (!subs || subs.size === 0) { // 条件判断 !subs || subs.size === 0
      return; // 返回结果
    } // 结束代码块

    console.log(`${this.logPrefix} ${exchange} 正在重新订阅 ${subs.size} 个频道 / Resubscribing to ${subs.size} channels`); // 控制台输出

    // 先复制订阅列表，避免在迭代时修改 Set / Copy subscriptions first to avoid modifying Set during iteration
    const subsArray = Array.from(subs); // 定义常量 subsArray

    // 清空订阅集合 / Clear subscription set
    subs.clear(); // 调用 subs.clear

    // 遍历复制的订阅列表 / Iterate copied subscription list
    for (const subKey of subsArray) { // 循环 const subKey of subsArray
      // 解析订阅键 / Parse subscription key
      const [dataType, symbol] = subKey.split(':'); // 解构赋值

      // 重新订阅 / Resubscribe
      this._subscribeToExchange(exchange, symbol, dataType); // 调用 _subscribeToExchange
    } // 结束代码块
  } // 结束代码块

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
  _buildSubscribeMessage(exchange, symbol, dataType) { // 调用 _buildSubscribeMessage
    // 根据交易所构建不同的消息 / Build different messages for different exchanges
    switch (exchange) { // 分支选择 exchange
      case 'binance': // 分支 'binance'
        return this._buildBinanceSubscribeMessage(symbol, dataType); // 返回结果

      case 'bybit': // 分支 'bybit'
        return this._buildBybitSubscribeMessage(symbol, dataType); // 返回结果

      case 'okx': // 分支 'okx'
        return this._buildOKXSubscribeMessage(symbol, dataType); // 返回结果

      case 'deribit': // 分支 'deribit'
        return this._buildDeribitSubscribeMessage(symbol, dataType); // 返回结果

      case 'gate': // 分支 'gate'
        return this._buildGateSubscribeMessage(symbol, dataType); // 返回结果

      case 'bitget': // 分支 'bitget'
        return this._buildBitgetSubscribeMessage(symbol, dataType); // 返回结果

      case 'kucoin': // 分支 'kucoin'
        return this._buildKuCoinSubscribeMessage(symbol, dataType); // 返回结果

      case 'kraken': // 分支 'kraken'
        return this._buildKrakenSubscribeMessage(symbol, dataType); // 返回结果

      default: // 默认分支
        throw new Error(`不支持的交易所 / Unsupported exchange: ${exchange}`); // 抛出异常
    } // 结束代码块
  } // 结束代码块

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
  _buildUnsubscribeMessage(exchange, symbol, dataType) { // 调用 _buildUnsubscribeMessage
    // 获取订阅消息 / Get subscribe message
    const subMsg = this._buildSubscribeMessage(exchange, symbol, dataType); // 定义常量 subMsg

    // 根据交易所修改操作类型 / Modify operation type based on exchange
    switch (exchange) { // 分支选择 exchange
      case 'binance': // 分支 'binance'
        return { ...subMsg, method: 'UNSUBSCRIBE' }; // 返回结果

      case 'bybit': // 分支 'bybit'
        return { ...subMsg, op: 'unsubscribe' }; // 返回结果

      case 'okx': // 分支 'okx'
        return { ...subMsg, op: 'unsubscribe' }; // 返回结果

      case 'deribit': // 分支 'deribit'
        // Deribit 取消订阅只需修改方法名 / Deribit unsubscribe just needs to change method name
        return { // 返回结果
          ...subMsg, // 展开对象或数组
          method: subMsg.method.replace('subscribe', 'unsubscribe'), // 设置 method 字段
        }; // 结束代码块

      case 'gate': // 分支 'gate'
        // Gate.io 取消订阅使用相同格式但 event 为 unsubscribe / Gate.io unsubscribe uses same format but event is unsubscribe
        return { ...subMsg, event: 'unsubscribe' }; // 返回结果

      case 'bitget': // 分支 'bitget'
        // Bitget 取消订阅使用相同格式但 op 为 unsubscribe / Bitget unsubscribe uses same format but op is unsubscribe
        return { ...subMsg, op: 'unsubscribe' }; // 返回结果

      case 'kucoin': // 分支 'kucoin'
        // KuCoin 取消订阅使用相同格式但 type 为 unsubscribe / KuCoin unsubscribe uses same format but type is unsubscribe
        return { ...subMsg, type: 'unsubscribe' }; // 返回结果

      case 'kraken': // 分支 'kraken'
        // Kraken 取消订阅使用相同格式但 event 为 unsubscribe / Kraken unsubscribe uses same format but event is unsubscribe
        return { ...subMsg, event: 'unsubscribe' }; // 返回结果

      default: // 默认分支
        return subMsg; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 构建 Binance 订阅消息
   * Build Binance subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildBinanceSubscribeMessage(symbol, dataType) { // 调用 _buildBinanceSubscribeMessage
    // 转换交易对格式: BTC/USDT -> btcusdt / Convert symbol format
    const binanceSymbol = symbol.replace('/', '').toLowerCase(); // 定义常量 binanceSymbol

    // 根据数据类型构建流名称 / Build stream name based on data type
    let stream; // 定义变量 stream
    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        // 24 小时行情 / 24h ticker
        stream = `${binanceSymbol}@ticker`; // 赋值 stream
        break; // 跳出循环或分支

      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        // 深度数据 (20 档，100ms 更新) / Depth data (20 levels, 100ms update)
        stream = `${binanceSymbol}@depth20@100ms`; // 赋值 stream
        break; // 跳出循环或分支

      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        // 逐笔成交 / Trade data
        stream = `${binanceSymbol}@trade`; // 赋值 stream
        break; // 跳出循环或分支

      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        // 标记价格和资金费率 / Mark price and funding rate
        stream = `${binanceSymbol}@markPrice@1s`; // 赋值 stream
        break; // 跳出循环或分支

      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        // K线数据 (1小时) / Kline data (1 hour)
        stream = `${binanceSymbol}@kline_1h`; // 赋值 stream
        break; // 跳出循环或分支

      default: // 默认分支
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`); // 抛出异常
    } // 结束代码块

    // 返回订阅消息 / Return subscription message
    return { // 返回结果
      method: 'SUBSCRIBE',    // 订阅操作 / Subscribe operation
      params: [stream],       // 流名称数组 / Stream name array
      id: Date.now(),         // 请求 ID / Request ID
    }; // 结束代码块
  } // 结束代码块

  /**
   * 构建 Bybit 订阅消息
   * Build Bybit subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildBybitSubscribeMessage(symbol, dataType) { // 调用 _buildBybitSubscribeMessage
    // 转换交易对格式: BTC/USDT -> BTCUSDT / Convert symbol format
    const bybitSymbol = symbol.replace('/', ''); // 定义常量 bybitSymbol

    // 根据数据类型构建主题 / Build topic based on data type
    let topic; // 定义变量 topic
    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        // 行情数据 / Ticker data
        topic = `tickers.${bybitSymbol}`; // 赋值 topic
        break; // 跳出循环或分支

      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        // 深度数据 (50 档) / Depth data (50 levels)
        topic = `orderbook.50.${bybitSymbol}`; // 赋值 topic
        break; // 跳出循环或分支

      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        // 逐笔成交 / Trade data
        topic = `publicTrade.${bybitSymbol}`; // 赋值 topic
        break; // 跳出循环或分支

      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        // 行情数据 (包含资金费率) / Ticker data (includes funding rate)
        topic = `tickers.${bybitSymbol}`; // 赋值 topic
        break; // 跳出循环或分支

      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        // K线数据 (60分钟) / Kline data (60 minutes)
        topic = `kline.60.${bybitSymbol}`; // 赋值 topic
        break; // 跳出循环或分支

      default: // 默认分支
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`); // 抛出异常
    } // 结束代码块

    // 返回订阅消息 / Return subscription message
    return { // 返回结果
      op: 'subscribe',        // 订阅操作 / Subscribe operation
      args: [topic],          // 主题数组 / Topic array
    }; // 结束代码块
  } // 结束代码块

  /**
   * 构建 OKX 订阅消息
   * Build OKX subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildOKXSubscribeMessage(symbol, dataType) { // 调用 _buildOKXSubscribeMessage
    // 转换交易对格式: BTC/USDT -> BTC-USDT-SWAP / Convert symbol format
    // 对于永续合约添加 -SWAP 后缀 / Add -SWAP suffix for perpetual
    const okxSymbol = this.config.tradingType === 'spot' // 定义常量 okxSymbol
      ? symbol.replace('/', '-') // 执行语句
      : `${symbol.replace('/', '-')}-SWAP`; // 执行语句

    // 根据数据类型构建参数 / Build args based on data type
    let args; // 定义变量 args
    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        // 行情数据 / Ticker data
        args = [{ channel: 'tickers', instId: okxSymbol }]; // 赋值 args
        break; // 跳出循环或分支

      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        // 深度数据 (5 档快速更新) / Depth data (5 levels fast update)
        args = [{ channel: 'books5', instId: okxSymbol }]; // 赋值 args
        break; // 跳出循环或分支

      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        // 逐笔成交 / Trade data
        args = [{ channel: 'trades', instId: okxSymbol }]; // 赋值 args
        break; // 跳出循环或分支

      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        // 资金费率 / Funding rate
        args = [{ channel: 'funding-rate', instId: okxSymbol }]; // 赋值 args
        break; // 跳出循环或分支

      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        // K线数据 (1小时) / Kline data (1 hour)
        args = [{ channel: 'candle1H', instId: okxSymbol }]; // 赋值 args
        break; // 跳出循环或分支

      default: // 默认分支
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`); // 抛出异常
    } // 结束代码块

    // 返回订阅消息 / Return subscription message
    return { // 返回结果
      op: 'subscribe',        // 订阅操作 / Subscribe operation
      args,                   // 参数数组 / Args array
    }; // 结束代码块
  } // 结束代码块

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
  _buildDeribitSubscribeMessage(symbol, dataType) { // 调用 _buildDeribitSubscribeMessage
    // 转换交易对格式: BTC/USDT -> BTC-PERPETUAL / Convert symbol format
    // Deribit 永续合约格式: BTC-PERPETUAL, ETH-PERPETUAL / Deribit perpetual format
    const base = symbol.split('/')[0]; // 定义常量 base
    const deribitSymbol = `${base}-PERPETUAL`; // 定义常量 deribitSymbol

    // 根据数据类型构建频道 / Build channel based on data type
    let channels = []; // 定义变量 channels
    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        // 行情数据 / Ticker data
        channels = [`ticker.${deribitSymbol}.100ms`]; // 赋值 channels
        break; // 跳出循环或分支

      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        // 深度数据 (10 档) / Depth data (10 levels)
        channels = [`book.${deribitSymbol}.10.100ms`]; // 赋值 channels
        break; // 跳出循环或分支

      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        // 逐笔成交 / Trade data
        channels = [`trades.${deribitSymbol}.100ms`]; // 赋值 channels
        break; // 跳出循环或分支

      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        // 永续合约状态 (包含资金费率) / Perpetual state (includes funding rate)
        channels = [`perpetual.${deribitSymbol}.100ms`]; // 赋值 channels
        break; // 跳出循环或分支

      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        // K线数据 (1小时) / Kline data (1 hour)
        channels = [`chart.trades.${deribitSymbol}.60`]; // 赋值 channels
        break; // 跳出循环或分支

      default: // 默认分支
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`); // 抛出异常
    } // 结束代码块

    // 返回 JSON-RPC 2.0 格式的订阅消息 / Return JSON-RPC 2.0 format subscription message
    return { // 返回结果
      jsonrpc: '2.0',               // JSON-RPC 版本 / JSON-RPC version
      method: 'public/subscribe',   // 订阅方法 / Subscribe method
      id: Date.now(),               // 请求 ID / Request ID
      params: { // 设置 params 字段
        channels,                   // 频道数组 / Channel array
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

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
  _buildGateSubscribeMessage(symbol, dataType) { // 调用 _buildGateSubscribeMessage
    // 转换交易对格式: BTC/USDT -> BTC_USDT (现货) 或 BTC_USDT (合约)
    // Convert symbol format: BTC/USDT -> BTC_USDT (spot) or BTC_USDT (futures)
    const gateSymbol = symbol.replace('/', '_'); // 定义常量 gateSymbol

    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot'; // 定义常量 isSpot
    const prefix = isSpot ? 'spot' : 'futures'; // 定义常量 prefix

    // 根据数据类型构建频道和 payload / Build channel and payload based on data type
    let channel; // 定义变量 channel
    let payload; // 定义变量 payload

    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        // 行情数据 / Ticker data
        channel = `${prefix}.tickers`; // 赋值 channel
        payload = [gateSymbol]; // 赋值 payload
        break; // 跳出循环或分支

      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        // 深度数据 / Depth data
        // 现货: spot.order_book_update, 合约: futures.order_book_update
        // Spot: spot.order_book_update, Futures: futures.order_book_update
        channel = isSpot ? 'spot.order_book_update' : 'futures.order_book_update'; // 赋值 channel
        // 参数: [symbol, interval, depth] / Args: [symbol, interval, depth]
        payload = isSpot ? [gateSymbol, '100ms'] : [gateSymbol, '20', '0']; // 赋值 payload
        break; // 跳出循环或分支

      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        // 逐笔成交 / Trade data
        channel = `${prefix}.trades`; // 赋值 channel
        payload = [gateSymbol]; // 赋值 payload
        break; // 跳出循环或分支

      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        // 资金费率 (仅合约) / Funding rate (futures only)
        if (isSpot) { // 条件判断 isSpot
          throw new Error('资金费率仅适用于合约 / Funding rate only available for futures'); // 抛出异常
        } // 结束代码块
        // 使用 tickers 频道获取资金费率信息 / Use tickers channel to get funding rate info
        channel = 'futures.tickers'; // 赋值 channel
        payload = [gateSymbol]; // 赋值 payload
        break; // 跳出循环或分支

      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        // K线数据 / Kline data
        channel = `${prefix}.candlesticks`; // 赋值 channel
        // 参数: [interval, symbol] / Args: [interval, symbol]
        payload = ['1h', gateSymbol]; // 赋值 payload
        break; // 跳出循环或分支

      default: // 默认分支
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`); // 抛出异常
    } // 结束代码块

    // 返回 Gate.io 格式的订阅消息 / Return Gate.io format subscription message
    return { // 返回结果
      time: Math.floor(Date.now() / 1000),  // Unix 时间戳 (秒) / Unix timestamp (seconds)
      channel,                               // 频道名称 / Channel name
      event: 'subscribe',                    // 订阅事件 / Subscribe event
      payload,                               // 订阅参数 / Subscription payload
    }; // 结束代码块
  } // 结束代码块

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
  _buildBitgetSubscribeMessage(symbol, dataType) { // 调用 _buildBitgetSubscribeMessage
    // 转换交易对格式: BTC/USDT -> BTCUSDT (现货) 或 BTCUSDT (合约)
    // Convert symbol format: BTC/USDT -> BTCUSDT (spot) or BTCUSDT (futures)
    const bitgetSymbol = symbol.replace('/', ''); // 定义常量 bitgetSymbol

    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot'; // 定义常量 isSpot
    const instType = isSpot ? 'SPOT' : 'USDT-FUTURES'; // 定义常量 instType

    // 根据数据类型构建频道和参数 / Build channel and args based on data type
    let channel; // 定义变量 channel
    let instId = bitgetSymbol; // 定义变量 instId

    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        // 行情数据 / Ticker data
        channel = 'ticker'; // 赋值 channel
        break; // 跳出循环或分支

      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        // 深度数据 / Depth data
        // Bitget 深度频道格式 / Bitget depth channel format
        channel = 'books15';  // 15档深度 / 15 levels depth
        break; // 跳出循环或分支

      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        // 逐笔成交 / Trade data
        channel = 'trade'; // 赋值 channel
        break; // 跳出循环或分支

      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        // 资金费率 (仅合约) / Funding rate (futures only)
        if (isSpot) { // 条件判断 isSpot
          throw new Error('资金费率仅适用于合约 / Funding rate only available for futures'); // 抛出异常
        } // 结束代码块
        // Bitget 使用 ticker 频道获取资金费率 / Bitget uses ticker channel for funding rate
        channel = 'ticker'; // 赋值 channel
        break; // 跳出循环或分支

      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        // K线数据 / Kline data
        // Bitget K线频道格式: candle1H / Bitget kline channel format: candle1H
        channel = 'candle1H'; // 赋值 channel
        break; // 跳出循环或分支

      default: // 默认分支
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`); // 抛出异常
    } // 结束代码块

    // 返回 Bitget V2 格式的订阅消息 / Return Bitget V2 format subscription message
    return { // 返回结果
      op: 'subscribe', // 设置 op 字段
      args: [{ // 设置 args 字段
        instType,      // 产品类型 / Instrument type
        channel,       // 频道名称 / Channel name
        instId,        // 产品 ID / Instrument ID
      }], // 执行语句
    }; // 结束代码块
  } // 结束代码块

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
  _buildKuCoinSubscribeMessage(symbol, dataType) { // 调用 _buildKuCoinSubscribeMessage
    // 转换交易对格式: BTC/USDT -> BTC-USDT
    // Convert symbol format: BTC/USDT -> BTC-USDT
    const kucoinSymbol = symbol.replace('/', '-'); // 定义常量 kucoinSymbol

    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot'; // 定义常量 isSpot

    // 生成唯一消息 ID / Generate unique message ID
    const messageId = Date.now().toString(); // 定义常量 messageId

    // 根据数据类型构建主题 / Build topic based on data type
    let topic; // 定义变量 topic

    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        // 行情数据 / Ticker data
        // 现货: /market/ticker:BTC-USDT
        // 合约: /contractMarket/tickerV2:XBTUSDTM
        if (isSpot) { // 条件判断 isSpot
          topic = `/market/ticker:${kucoinSymbol}`; // 赋值 topic
        } else { // 执行语句
          // 合约交易对格式: BTC-USDT -> XBTUSDTM (需要特殊处理)
          const futuresSymbol = this._toKuCoinFuturesSymbol(symbol); // 定义常量 futuresSymbol
          topic = `/contractMarket/tickerV2:${futuresSymbol}`; // 赋值 topic
        } // 结束代码块
        break; // 跳出循环或分支

      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        // 深度数据 / Depth data
        if (isSpot) { // 条件判断 isSpot
          // 现货使用 level2Depth5 (5档) 或 level2Depth50 (50档)
          topic = `/spotMarket/level2Depth5:${kucoinSymbol}`; // 赋值 topic
        } else { // 执行语句
          const futuresSymbol = this._toKuCoinFuturesSymbol(symbol); // 定义常量 futuresSymbol
          topic = `/contractMarket/level2Depth5:${futuresSymbol}`; // 赋值 topic
        } // 结束代码块
        break; // 跳出循环或分支

      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        // 逐笔成交 / Trade data
        if (isSpot) { // 条件判断 isSpot
          topic = `/market/match:${kucoinSymbol}`; // 赋值 topic
        } else { // 执行语句
          const futuresSymbol = this._toKuCoinFuturesSymbol(symbol); // 定义常量 futuresSymbol
          topic = `/contractMarket/execution:${futuresSymbol}`; // 赋值 topic
        } // 结束代码块
        break; // 跳出循环或分支

      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        // 资金费率 (仅合约) / Funding rate (futures only)
        if (isSpot) { // 条件判断 isSpot
          throw new Error('资金费率仅适用于合约 / Funding rate only available for futures'); // 抛出异常
        } // 结束代码块
        const futuresSymbol = this._toKuCoinFuturesSymbol(symbol); // 定义常量 futuresSymbol
        topic = `/contract/instrument:${futuresSymbol}`; // 赋值 topic
        break; // 跳出循环或分支

      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        // K线数据 / Kline data
        if (isSpot) { // 条件判断 isSpot
          // 现货K线: /market/candles:BTC-USDT_1hour
          topic = `/market/candles:${kucoinSymbol}_1hour`; // 赋值 topic
        } else { // 执行语句
          const futuresSymbol = this._toKuCoinFuturesSymbol(symbol); // 定义常量 futuresSymbol
          topic = `/contractMarket/candle:${futuresSymbol}_1hour`; // 赋值 topic
        } // 结束代码块
        break; // 跳出循环或分支

      default: // 默认分支
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`); // 抛出异常
    } // 结束代码块

    // 返回 KuCoin 格式的订阅消息 / Return KuCoin format subscription message
    return { // 返回结果
      id: messageId,           // 消息 ID / Message ID
      type: 'subscribe',       // 订阅类型 / Subscribe type
      topic,                   // 主题 / Topic
      privateChannel: false,   // 公共频道 / Public channel
      response: true,          // 需要响应 / Need response
    }; // 结束代码块
  } // 结束代码块

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
  _buildKrakenSubscribeMessage(symbol, dataType) { // 调用 _buildKrakenSubscribeMessage
    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot'; // 定义常量 isSpot

    if (isSpot) { // 条件判断 isSpot
      // 现货订阅格式 / Spot subscription format
      return this._buildKrakenSpotSubscribeMessage(symbol, dataType); // 返回结果
    } else { // 执行语句
      // 合约订阅格式 / Futures subscription format
      return this._buildKrakenFuturesSubscribeMessage(symbol, dataType); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 构建 Kraken 现货订阅消息
   * Build Kraken spot subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildKrakenSpotSubscribeMessage(symbol, dataType) { // 调用 _buildKrakenSpotSubscribeMessage
    // 转换交易对格式: BTC/USDT -> XBT/USDT (Kraken 使用 XBT 代替 BTC)
    // Convert symbol format: BTC/USDT -> XBT/USDT (Kraken uses XBT instead of BTC)
    const krakenSymbol = this._toKrakenSpotSymbol(symbol); // 定义常量 krakenSymbol

    // 根据数据类型构建订阅名称 / Build subscription name based on data type
    let subscription; // 定义变量 subscription

    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        // 行情数据 / Ticker data
        subscription = { name: 'ticker' }; // 赋值 subscription
        break; // 跳出循环或分支

      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        // 深度数据 (10档) / Depth data (10 levels)
        subscription = { name: 'book', depth: 10 }; // 赋值 subscription
        break; // 跳出循环或分支

      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        // 逐笔成交 / Trade data
        subscription = { name: 'trade' }; // 赋值 subscription
        break; // 跳出循环或分支

      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        // 现货不支持资金费率 / Spot doesn't support funding rate
        throw new Error('资金费率仅适用于合约 / Funding rate only available for futures'); // 抛出异常

      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        // K线数据 (60分钟) / Kline data (60 minutes)
        subscription = { name: 'ohlc', interval: 60 }; // 赋值 subscription
        break; // 跳出循环或分支

      default: // 默认分支
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`); // 抛出异常
    } // 结束代码块

    // 返回 Kraken 现货格式的订阅消息 / Return Kraken spot format subscription message
    return { // 返回结果
      event: 'subscribe',      // 订阅事件 / Subscribe event
      pair: [krakenSymbol],    // 交易对数组 / Trading pair array
      subscription,            // 订阅配置 / Subscription config
    }; // 结束代码块
  } // 结束代码块

  /**
   * 构建 Kraken 合约订阅消息
   * Build Kraken futures subscription message
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} dataType - 数据类型 / Data type
   * @returns {Object} 订阅消息对象 / Subscription message object
   * @private
   */
  _buildKrakenFuturesSubscribeMessage(symbol, dataType) { // 调用 _buildKrakenFuturesSubscribeMessage
    // 转换交易对格式: BTC/USDT -> PI_XBTUSD (Kraken Futures 格式)
    // Convert symbol format: BTC/USDT -> PI_XBTUSD (Kraken Futures format)
    const krakenFuturesSymbol = this._toKrakenFuturesSymbol(symbol); // 定义常量 krakenFuturesSymbol

    // 根据数据类型构建 feed / Build feed based on data type
    let feed; // 定义变量 feed

    switch (dataType) { // 分支选择 dataType
      case DATA_TYPES.TICKER: // 分支 DATA_TYPES.TICKER
        // 行情数据 / Ticker data
        feed = 'ticker'; // 赋值 feed
        break; // 跳出循环或分支

      case DATA_TYPES.DEPTH: // 分支 DATA_TYPES.DEPTH
        // 深度数据 / Depth data
        feed = 'book'; // 赋值 feed
        break; // 跳出循环或分支

      case DATA_TYPES.TRADE: // 分支 DATA_TYPES.TRADE
        // 逐笔成交 / Trade data
        feed = 'trade'; // 赋值 feed
        break; // 跳出循环或分支

      case DATA_TYPES.FUNDING_RATE: // 分支 DATA_TYPES.FUNDING_RATE
        // 资金费率 / Funding rate
        feed = 'ticker';  // Kraken Futures ticker 包含资金费率 / includes funding rate
        break; // 跳出循环或分支

      case DATA_TYPES.KLINE: // 分支 DATA_TYPES.KLINE
        // K线数据 (Kraken Futures 暂不支持 WebSocket K线)
        // Kline data (Kraken Futures doesn't support WebSocket kline yet)
        throw new Error('Kraken 合约暂不支持 WebSocket K线订阅 / Kraken futures does not support WebSocket kline subscription'); // 抛出异常

      default: // 默认分支
        throw new Error(`不支持的数据类型 / Unsupported data type: ${dataType}`); // 抛出异常
    } // 结束代码块

    // 返回 Kraken Futures 格式的订阅消息 / Return Kraken Futures format subscription message
    return { // 返回结果
      event: 'subscribe',              // 订阅事件 / Subscribe event
      feed,                            // 数据类型 / Feed type
      product_ids: [krakenFuturesSymbol], // 产品 ID 数组 / Product ID array
    }; // 结束代码块
  } // 结束代码块

  /**
   * 转换为 Kraken 现货交易对格式
   * Convert to Kraken spot symbol format
   *
   * @param {string} symbol - 标准交易对 (如 BTC/USDT) / Standard symbol
   * @returns {string} Kraken 现货交易对 (如 XBT/USDT) / Kraken spot symbol
   * @private
   */
  _toKrakenSpotSymbol(symbol) { // 调用 _toKrakenSpotSymbol
    // BTC/USDT -> XBT/USDT, ETH/USDT -> ETH/USDT
    const [base, quote] = symbol.split('/'); // 解构赋值
    // Kraken 使用 XBT 代替 BTC / Kraken uses XBT instead of BTC
    const krakenBase = base === 'BTC' ? 'XBT' : base; // 定义常量 krakenBase
    return `${krakenBase}/${quote}`; // 返回结果
  } // 结束代码块

  /**
   * 转换为 Kraken 合约交易对格式
   * Convert to Kraken futures symbol format
   *
   * @param {string} symbol - 标准交易对 (如 BTC/USDT) / Standard symbol
   * @returns {string} Kraken 合约交易对 (如 PI_XBTUSD) / Kraken futures symbol
   * @private
   */
  _toKrakenFuturesSymbol(symbol) { // 调用 _toKrakenFuturesSymbol
    // BTC/USDT -> PI_XBTUSD, ETH/USDT -> PI_ETHUSD
    const [base, quote] = symbol.split('/'); // 解构赋值
    // Kraken Futures 使用 XBT 代替 BTC / Kraken Futures uses XBT instead of BTC
    const krakenBase = base === 'BTC' ? 'XBT' : base; // 定义常量 krakenBase
    // 永续合约前缀为 PI_ / Perpetual prefix is PI_
    // 报价货币: USDT -> USD / Quote currency: USDT -> USD
    const krakenQuote = quote === 'USDT' ? 'USD' : quote; // 定义常量 krakenQuote
    return `PI_${krakenBase}${krakenQuote}`; // 返回结果
  } // 结束代码块

  /**
   * 从 Kraken 现货交易对转换为标准格式
   * Convert from Kraken spot symbol to standard format
   *
   * @param {string} symbol - Kraken 现货交易对 (如 XBT/USDT) / Kraken spot symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _fromKrakenSpotSymbol(symbol) { // 调用 _fromKrakenSpotSymbol
    // XBT/USDT -> BTC/USDT, ETH/USDT -> ETH/USDT
    const [base, quote] = symbol.split('/'); // 解构赋值
    // XBT -> BTC
    const standardBase = base === 'XBT' ? 'BTC' : base; // 定义常量 standardBase
    return `${standardBase}/${quote}`; // 返回结果
  } // 结束代码块

  /**
   * 从 Kraken 合约交易对转换为标准格式
   * Convert from Kraken futures symbol to standard format
   *
   * @param {string} symbol - Kraken 合约交易对 (如 PI_XBTUSD) / Kraken futures symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _fromKrakenFuturesSymbol(symbol) { // 调用 _fromKrakenFuturesSymbol
    // PI_XBTUSD -> BTC/USDT, PI_ETHUSD -> ETH/USDT
    // 移除 PI_ 前缀 / Remove PI_ prefix
    const withoutPrefix = symbol.replace(/^PI_/, ''); // 定义常量 withoutPrefix
    // 分离基础货币和报价货币 / Separate base and quote
    const quoteMatch = withoutPrefix.match(/(USD|EUR|GBP)$/); // 定义常量 quoteMatch
    if (quoteMatch) { // 条件判断 quoteMatch
      const quote = quoteMatch[1]; // 定义常量 quote
      let base = withoutPrefix.slice(0, -quote.length); // 定义变量 base
      // XBT -> BTC
      if (base === 'XBT') { // 条件判断 base === 'XBT'
        base = 'BTC'; // 赋值 base
      } // 结束代码块
      // USD -> USDT
      const standardQuote = quote === 'USD' ? 'USDT' : quote; // 定义常量 standardQuote
      return `${base}/${standardQuote}`; // 返回结果
    } // 结束代码块
    return symbol; // 返回结果
  } // 结束代码块

  /**
   * 转换为 KuCoin 合约交易对格式
   * Convert to KuCoin futures symbol format
   *
   * @param {string} symbol - 标准交易对 (如 BTC/USDT) / Standard symbol
   * @returns {string} KuCoin 合约交易对 (如 XBTUSDTM) / KuCoin futures symbol
   * @private
   */
  _toKuCoinFuturesSymbol(symbol) { // 调用 _toKuCoinFuturesSymbol
    // BTC/USDT -> XBTUSDTM, ETH/USDT -> ETHUSDTM
    const [base, quote] = symbol.split('/'); // 解构赋值
    // KuCoin 合约中 BTC 使用 XBT / KuCoin futures uses XBT for BTC
    const futuresBase = base === 'BTC' ? 'XBT' : base; // 定义常量 futuresBase
    return `${futuresBase}${quote}M`; // 返回结果
  } // 结束代码块

  /**
   * 从 KuCoin 合约交易对转换为标准格式
   * Convert from KuCoin futures symbol to standard format
   *
   * @param {string} symbol - KuCoin 合约交易对 (如 XBTUSDTM) / KuCoin futures symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _fromKuCoinFuturesSymbol(symbol) { // 调用 _fromKuCoinFuturesSymbol
    // XBTUSDTM -> BTC/USDT, ETHUSDTM -> ETH/USDT
    // 移除末尾的 M / Remove trailing M
    const withoutM = symbol.slice(0, -1); // 定义常量 withoutM
    // 分离基础货币和报价货币 / Separate base and quote
    const quoteMatch = withoutM.match(/(USDT|USD|BTC)$/); // 定义常量 quoteMatch
    if (quoteMatch) { // 条件判断 quoteMatch
      const quote = quoteMatch[1]; // 定义常量 quote
      let base = withoutM.slice(0, -quote.length); // 定义变量 base
      // XBT -> BTC
      if (base === 'XBT') { // 条件判断 base === 'XBT'
        base = 'BTC'; // 赋值 base
      } // 结束代码块
      return `${base}/${quote}`; // 返回结果
    } // 结束代码块
    return symbol; // 返回结果
  } // 结束代码块

  /**
   * 获取订阅数量统计
   * Get subscription counts
   *
   * @returns {Object} 每个交易所的订阅数 / Subscription count per exchange
   * @private
   */
  _getSubscriptionCounts() { // 调用 _getSubscriptionCounts
    const counts = {}; // 定义常量 counts

    // 遍历所有交易所 / Iterate all exchanges
    for (const [exchange, subs] of this.subscriptions) { // 循环 const [exchange, subs] of this.subscriptions
      counts[exchange] = subs.size; // 执行语句
    } // 结束代码块

    return counts; // 返回结果
  } // 结束代码块

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
  _handleMessage(exchange, data) { // 调用 _handleMessage
    // 增加消息计数 / Increment message count
    this.stats.messagesReceived++; // 访问 stats

    try { // 尝试执行
      // 转换为字符串 / Convert to string
      const dataStr = data.toString(); // 定义常量 dataStr

      // 处理非 JSON 响应 (如 OKX 的 "pong", Bitget 的 "pong") / Handle non-JSON responses
      if (dataStr === 'pong' || dataStr === 'ping') { // 条件判断 dataStr === 'pong' || dataStr === 'ping'
        // 心跳响应，忽略 / Heartbeat response, ignore
        return; // 返回结果
      } // 结束代码块

      // 解析 JSON 数据 / Parse JSON data
      const message = JSON.parse(dataStr); // 定义常量 message

      // 根据交易所处理消息 / Handle message based on exchange
      switch (exchange) { // 分支选择 exchange
        case 'binance': // 分支 'binance'
          this._handleBinanceMessage(message); // 调用 _handleBinanceMessage
          break; // 跳出循环或分支

        case 'bybit': // 分支 'bybit'
          this._handleBybitMessage(message); // 调用 _handleBybitMessage
          break; // 跳出循环或分支

        case 'okx': // 分支 'okx'
          this._handleOKXMessage(message); // 调用 _handleOKXMessage
          break; // 跳出循环或分支

        case 'deribit': // 分支 'deribit'
          this._handleDeribitMessage(message); // 调用 _handleDeribitMessage
          break; // 跳出循环或分支

        case 'gate': // 分支 'gate'
          this._handleGateMessage(message); // 调用 _handleGateMessage
          break; // 跳出循环或分支

        case 'bitget': // 分支 'bitget'
          this._handleBitgetMessage(message); // 调用 _handleBitgetMessage
          break; // 跳出循环或分支

        case 'kucoin': // 分支 'kucoin'
          this._handleKuCoinMessage(message); // 调用 _handleKuCoinMessage
          break; // 跳出循环或分支

        case 'kraken': // 分支 'kraken'
          this._handleKrakenMessage(message); // 调用 _handleKrakenMessage
          break; // 跳出循环或分支
      } // 结束代码块

    } catch (error) { // 执行语句
      // 记录解析错误 / Log parsing error
      console.error(`${this.logPrefix} ${exchange} 消息解析错误 / Message parsing error:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 Binance 消息
   * Handle Binance message
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleBinanceMessage(message) { // 调用 _handleBinanceMessage
    // 忽略订阅响应 / Ignore subscription responses
    if (message.result === null || message.id) { // 条件判断 message.result === null || message.id
      return; // 返回结果
    } // 结束代码块

    // 获取事件类型 / Get event type
    const eventType = message.e; // 定义常量 eventType

    // 根据事件类型处理 / Handle based on event type
    switch (eventType) { // 分支选择 eventType
      case '24hrTicker': // 分支 '24hrTicker'
        // 处理行情数据 / Handle ticker data
        this._processTicker('binance', message); // 调用 _processTicker
        break; // 跳出循环或分支

      case 'depthUpdate': // 分支 'depthUpdate'
        // 处理深度更新 / Handle depth update
        this._processDepth('binance', message); // 调用 _processDepth
        break; // 跳出循环或分支

      case 'trade': // 分支 'trade'
        // 处理成交数据 / Handle trade data
        this._processTrade('binance', message); // 调用 _processTrade
        break; // 跳出循环或分支

      case 'markPriceUpdate': // 分支 'markPriceUpdate'
        // 处理标记价格和资金费率 / Handle mark price and funding rate
        this._processFundingRate('binance', message); // 调用 _processFundingRate
        break; // 跳出循环或分支

      case 'kline': // 分支 'kline'
        // 处理K线数据 / Handle kline data
        this._processKline('binance', message); // 调用 _processKline
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 Bybit 消息
   * Handle Bybit message
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleBybitMessage(message) { // 调用 _handleBybitMessage
    // 处理 pong 响应 / Handle pong response
    if (message.op === 'pong' || message.ret_msg === 'pong') { // 条件判断 message.op === 'pong' || message.ret_msg === ...
      return; // 返回结果
    } // 结束代码块

    // 忽略订阅响应 / Ignore subscription responses
    if (message.success !== undefined) { // 条件判断 message.success !== undefined
      return; // 返回结果
    } // 结束代码块

    // 获取主题和数据 / Get topic and data
    const { topic, data } = message; // 解构赋值

    // 如果没有主题或数据，返回 / If no topic or data, return
    if (!topic || !data) { // 条件判断 !topic || !data
      return; // 返回结果
    } // 结束代码块

    // 根据主题类型处理 / Handle based on topic type
    if (topic.startsWith('tickers.')) { // 条件判断 topic.startsWith('tickers.')
      // 处理行情数据 / Handle ticker data
      this._processTicker('bybit', message); // 调用 _processTicker
    } else if (topic.startsWith('orderbook.')) { // 执行语句
      // 处理深度数据 / Handle depth data
      this._processDepth('bybit', message); // 调用 _processDepth
    } else if (topic.startsWith('publicTrade.')) { // 执行语句
      // 处理成交数据 / Handle trade data
      this._processTrade('bybit', message); // 调用 _processTrade
    } else if (topic.startsWith('kline.')) { // 执行语句
      // 处理K线数据 / Handle kline data
      this._processKline('bybit', message); // 调用 _processKline
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 OKX 消息
   * Handle OKX message
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleOKXMessage(message) { // 调用 _handleOKXMessage
    // 处理 pong 响应 / Handle pong response
    if (message === 'pong') { // 条件判断 message === 'pong'
      return; // 返回结果
    } // 结束代码块

    // 忽略事件消息 (订阅响应等) / Ignore event messages (subscription responses, etc.)
    if (message.event) { // 条件判断 message.event
      return; // 返回结果
    } // 结束代码块

    // 获取参数和数据 / Get args and data
    const { arg, data } = message; // 解构赋值

    // 如果没有参数或数据，返回 / If no args or data, return
    if (!arg || !data || data.length === 0) { // 条件判断 !arg || !data || data.length === 0
      return; // 返回结果
    } // 结束代码块

    // 获取频道类型 / Get channel type
    const channel = arg.channel; // 定义常量 channel

    // 根据频道类型处理 / Handle based on channel type
    switch (channel) { // 分支选择 channel
      case 'tickers': // 分支 'tickers'
        // 处理行情数据 / Handle ticker data
        this._processTicker('okx', message); // 调用 _processTicker
        break; // 跳出循环或分支

      case 'books5': // 分支 'books5'
        // 处理深度数据 / Handle depth data
        this._processDepth('okx', message); // 调用 _processDepth
        break; // 跳出循环或分支

      case 'trades': // 分支 'trades'
        // 处理成交数据 / Handle trade data
        this._processTrade('okx', message); // 调用 _processTrade
        break; // 跳出循环或分支

      case 'funding-rate': // 分支 'funding-rate'
        // 处理资金费率 / Handle funding rate
        this._processFundingRate('okx', message); // 调用 _processFundingRate
        break; // 跳出循环或分支

      default: // 默认分支
        // 检查是否是K线频道 (candle1H, candle1D 等) / Check if it's a kline channel (candle1H, candle1D, etc.)
        if (channel.startsWith('candle')) { // 条件判断 channel.startsWith('candle')
          this._processKline('okx', message); // 调用 _processKline
        } // 结束代码块
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块

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
  _handleDeribitMessage(message) { // 调用 _handleDeribitMessage
    // 处理心跳响应 (public/test) / Handle heartbeat response
    if (message.result && message.result.version) { // 条件判断 message.result && message.result.version
      return; // 返回结果
    } // 结束代码块

    // 忽略订阅响应 / Ignore subscription responses
    if (message.result && Array.isArray(message.result)) { // 条件判断 message.result && Array.isArray(message.result)
      return; // 返回结果
    } // 结束代码块

    // 检查是否是推送消息 / Check if it's a push message
    if (!message.params || !message.params.channel || !message.params.data) { // 条件判断 !message.params || !message.params.channel ||...
      return; // 返回结果
    } // 结束代码块

    // 获取频道和数据 / Get channel and data
    const channel = message.params.channel; // 定义常量 channel
    const data = message.params.data; // 定义常量 data

    // 根据频道类型处理 / Handle based on channel type
    if (channel.startsWith('ticker.')) { // 条件判断 channel.startsWith('ticker.')
      // 处理行情数据 / Handle ticker data
      this._processTicker('deribit', { channel, data }); // 调用 _processTicker
    } else if (channel.startsWith('book.')) { // 执行语句
      // 处理深度数据 / Handle depth data
      this._processDepth('deribit', { channel, data }); // 调用 _processDepth
    } else if (channel.startsWith('trades.')) { // 执行语句
      // 处理成交数据 / Handle trade data
      this._processTrade('deribit', { channel, data }); // 调用 _processTrade
    } else if (channel.startsWith('perpetual.')) { // 执行语句
      // 处理永续合约数据 (资金费率) / Handle perpetual data (funding rate)
      this._processFundingRate('deribit', { channel, data }); // 调用 _processFundingRate
    } else if (channel.startsWith('chart.trades.')) { // 执行语句
      // 处理K线数据 / Handle kline data
      this._processKline('deribit', { channel, data }); // 调用 _processKline
    } // 结束代码块
  } // 结束代码块

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
  _handleGateMessage(message) { // 调用 _handleGateMessage
    // 处理 pong 响应 / Handle pong response
    if (message.channel && (message.channel.endsWith('.pong') || message.channel.endsWith('.ping'))) { // 条件判断 message.channel && (message.channel.endsWith(...
      return; // 返回结果
    } // 结束代码块

    // 忽略订阅响应 / Ignore subscription responses
    if (message.event === 'subscribe' || message.event === 'unsubscribe') { // 条件判断 message.event === 'subscribe' || message.even...
      return; // 返回结果
    } // 结束代码块

    // 检查是否是更新消息 / Check if it's an update message
    if (message.event !== 'update' || !message.result) { // 条件判断 message.event !== 'update' || !message.result
      return; // 返回结果
    } // 结束代码块

    // 获取频道和数据 / Get channel and result
    const channel = message.channel; // 定义常量 channel
    const result = message.result; // 定义常量 result

    // 判断频道类型 / Determine channel type
    // 现货频道: spot.xxx, 合约频道: futures.xxx / Spot channels: spot.xxx, Futures channels: futures.xxx
    if (channel.endsWith('.tickers')) { // 条件判断 channel.endsWith('.tickers')
      // 处理行情数据 / Handle ticker data
      // 同时检查是否包含资金费率信息 (合约) / Also check for funding rate info (futures)
      this._processTicker('gate', { channel, result }); // 调用 _processTicker
      // 如果是合约，也处理资金费率 / If futures, also process funding rate
      if (channel.startsWith('futures.') && result.funding_rate !== undefined) { // 条件判断 channel.startsWith('futures.') && result.fund...
        this._processFundingRate('gate', { channel, result }); // 调用 _processFundingRate
      } // 结束代码块
    } else if (channel.endsWith('.order_book_update') || channel.endsWith('.order_book')) { // 执行语句
      // 处理深度数据 / Handle depth data
      this._processDepth('gate', { channel, result }); // 调用 _processDepth
    } else if (channel.endsWith('.trades')) { // 执行语句
      // 处理成交数据 / Handle trade data
      this._processTrade('gate', { channel, result }); // 调用 _processTrade
    } else if (channel.endsWith('.candlesticks')) { // 执行语句
      // 处理K线数据 / Handle kline data
      this._processKline('gate', { channel, result }); // 调用 _processKline
    } // 结束代码块
  } // 结束代码块

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
  _handleBitgetMessage(message) { // 调用 _handleBitgetMessage
    // 忽略订阅响应 / Ignore subscription responses
    if (message.event === 'subscribe' || message.event === 'unsubscribe') { // 条件判断 message.event === 'subscribe' || message.even...
      return; // 返回结果
    } // 结束代码块

    // 忽略错误响应 / Ignore error responses
    if (message.event === 'error') { // 条件判断 message.event === 'error'
      console.error(`${this.logPrefix} Bitget WebSocket 错误 / Error:`, message.msg || message); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    // 获取参数和数据 / Get args and data
    const { arg, data, action } = message; // 解构赋值

    // 如果没有参数或数据，返回 / If no args or data, return
    if (!arg || !data || data.length === 0) { // 条件判断 !arg || !data || data.length === 0
      return; // 返回结果
    } // 结束代码块

    // 获取频道类型 / Get channel type
    const channel = arg.channel; // 定义常量 channel

    // 根据频道类型处理 / Handle based on channel type
    switch (channel) { // 分支选择 channel
      case 'ticker': // 分支 'ticker'
        // 处理行情数据 / Handle ticker data
        this._processTicker('bitget', message); // 调用 _processTicker
        // 如果是合约，也处理资金费率 / If futures, also process funding rate
        if (arg.instType !== 'SPOT' && data[0].fundingRate !== undefined) { // 条件判断 arg.instType !== 'SPOT' && data[0].fundingRat...
          this._processFundingRate('bitget', message); // 调用 _processFundingRate
        } // 结束代码块
        break; // 跳出循环或分支

      case 'books5': // 分支 'books5'
      case 'books15': // 分支 'books15'
      case 'books': // 分支 'books'
        // 处理深度数据 / Handle depth data
        this._processDepth('bitget', message); // 调用 _processDepth
        break; // 跳出循环或分支

      case 'trade': // 分支 'trade'
        // 处理成交数据 / Handle trade data
        this._processTrade('bitget', message); // 调用 _processTrade
        break; // 跳出循环或分支

      default: // 默认分支
        // 检查是否是K线频道 (candle1H, candle1D 等) / Check if it's a kline channel
        if (channel.startsWith('candle')) { // 条件判断 channel.startsWith('candle')
          this._processKline('bitget', message); // 调用 _processKline
        } // 结束代码块
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块

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
  _handleKuCoinMessage(message) { // 调用 _handleKuCoinMessage
    // 忽略欢迎消息 / Ignore welcome message
    if (message.type === 'welcome') { // 条件判断 message.type === 'welcome'
      return; // 返回结果
    } // 结束代码块

    // 忽略订阅响应 / Ignore subscription responses
    if (message.type === 'ack') { // 条件判断 message.type === 'ack'
      return; // 返回结果
    } // 结束代码块

    // 忽略 ping/pong 消息 / Ignore ping/pong messages
    if (message.type === 'ping' || message.type === 'pong') { // 条件判断 message.type === 'ping' || message.type === '...
      return; // 返回结果
    } // 结束代码块

    // 忽略错误响应 / Ignore error responses
    if (message.type === 'error') { // 条件判断 message.type === 'error'
      console.error(`${this.logPrefix} KuCoin WebSocket 错误 / Error:`, message.data || message); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    // 如果不是消息类型，返回 / If not message type, return
    if (message.type !== 'message') { // 条件判断 message.type !== 'message'
      return; // 返回结果
    } // 结束代码块

    // 获取主题和数据 / Get topic and data
    const { topic, subject, data } = message; // 解构赋值

    // 如果没有主题或数据，返回 / If no topic or data, return
    if (!topic || !data) { // 条件判断 !topic || !data
      return; // 返回结果
    } // 结束代码块

    // 根据主题类型处理 / Handle based on topic type
    if (topic.includes('/market/ticker:') || topic.includes('/contractMarket/tickerV2:')) { // 条件判断 topic.includes('/market/ticker:') || topic.in...
      // 处理行情数据 / Handle ticker data
      this._processTicker('kucoin', message); // 调用 _processTicker
    } else if (topic.includes('level2Depth') || topic.includes('orderbook')) { // 执行语句
      // 处理深度数据 / Handle depth data
      this._processDepth('kucoin', message); // 调用 _processDepth
    } else if (topic.includes('/market/match:') || topic.includes('/contractMarket/execution:')) { // 执行语句
      // 处理成交数据 / Handle trade data
      this._processTrade('kucoin', message); // 调用 _processTrade
    } else if (topic.includes('/contract/instrument:')) { // 执行语句
      // 处理资金费率数据 / Handle funding rate data
      this._processFundingRate('kucoin', message); // 调用 _processFundingRate
    } else if (topic.includes('/market/candles:') || topic.includes('/contractMarket/candle:')) { // 执行语句
      // 处理K线数据 / Handle kline data
      this._processKline('kucoin', message); // 调用 _processKline
    } // 结束代码块
  } // 结束代码块

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
  _handleKrakenMessage(message) { // 调用 _handleKrakenMessage
    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot'; // 定义常量 isSpot

    if (isSpot) { // 条件判断 isSpot
      this._handleKrakenSpotMessage(message); // 调用 _handleKrakenSpotMessage
    } else { // 执行语句
      this._handleKrakenFuturesMessage(message); // 调用 _handleKrakenFuturesMessage
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 Kraken 现货消息
   * Handle Kraken spot message
   *
   * @param {Object|Array} message - 消息对象或数组 / Message object or array
   * @private
   */
  _handleKrakenSpotMessage(message) { // 调用 _handleKrakenSpotMessage
    // 处理事件消息 (对象格式) / Handle event messages (object format)
    if (message && typeof message === 'object' && !Array.isArray(message)) { // 条件判断 message && typeof message === 'object' && !Ar...
      const event = message.event; // 定义常量 event

      // 忽略系统消息 / Ignore system messages
      if (event === 'systemStatus' || event === 'heartbeat' || event === 'pong') { // 条件判断 event === 'systemStatus' || event === 'heartb...
        return; // 返回结果
      } // 结束代码块

      // 忽略订阅响应 / Ignore subscription responses
      if (event === 'subscriptionStatus') { // 条件判断 event === 'subscriptionStatus'
        if (message.status === 'error') { // 条件判断 message.status === 'error'
          console.error(`${this.logPrefix} Kraken 订阅错误 / Subscription error:`, message.errorMessage); // 控制台输出
        } // 结束代码块
        return; // 返回结果
      } // 结束代码块

      return; // 返回结果
    } // 结束代码块

    // 处理数据消息 (数组格式) / Handle data messages (array format)
    // 格式: [channelID, data, channelName, pair]
    if (Array.isArray(message) && message.length >= 4) { // 条件判断 Array.isArray(message) && message.length >= 4
      const [channelId, data, channelName, pair] = message; // 解构赋值

      // 根据频道名称处理 / Handle based on channel name
      if (channelName === 'ticker') { // 条件判断 channelName === 'ticker'
        // 处理行情数据 / Handle ticker data
        this._processTicker('kraken', { data, pair, channelName }); // 调用 _processTicker
      } else if (channelName === 'book-10' || channelName.startsWith('book')) { // 执行语句
        // 处理深度数据 / Handle depth data
        this._processDepth('kraken', { data, pair, channelName }); // 调用 _processDepth
      } else if (channelName === 'trade') { // 执行语句
        // 处理成交数据 / Handle trade data
        this._processTrade('kraken', { data, pair, channelName }); // 调用 _processTrade
      } else if (channelName.startsWith('ohlc')) { // 执行语句
        // 处理K线数据 / Handle kline data
        this._processKline('kraken', { data, pair, channelName }); // 调用 _processKline
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 Kraken 合约消息
   * Handle Kraken futures message
   *
   * @param {Object} message - 消息对象 / Message object
   * @private
   */
  _handleKrakenFuturesMessage(message) { // 调用 _handleKrakenFuturesMessage
    // 忽略非对象消息 / Ignore non-object messages
    if (!message || typeof message !== 'object') { // 条件判断 !message || typeof message !== 'object'
      return; // 返回结果
    } // 结束代码块

    // 处理事件消息 / Handle event messages
    const event = message.event; // 定义常量 event
    if (event) { // 条件判断 event
      // 忽略系统消息 / Ignore system messages
      if (event === 'info' || event === 'heartbeat') { // 条件判断 event === 'info' || event === 'heartbeat'
        return; // 返回结果
      } // 结束代码块

      // 忽略订阅响应 / Ignore subscription responses
      if (event === 'subscribed' || event === 'unsubscribed') { // 条件判断 event === 'subscribed' || event === 'unsubscr...
        return; // 返回结果
      } // 结束代码块

      // 处理错误 / Handle errors
      if (event === 'error') { // 条件判断 event === 'error'
        console.error(`${this.logPrefix} Kraken Futures 错误 / Error:`, message.message || message); // 控制台输出
        return; // 返回结果
      } // 结束代码块

      return; // 返回结果
    } // 结束代码块

    // 处理数据消息 / Handle data messages
    const feed = message.feed; // 定义常量 feed
    if (!feed) { // 条件判断 !feed
      return; // 返回结果
    } // 结束代码块

    // 根据 feed 类型处理 / Handle based on feed type
    if (feed === 'ticker' || feed === 'ticker_lite') { // 条件判断 feed === 'ticker' || feed === 'ticker_lite'
      // 处理行情数据 / Handle ticker data
      this._processTicker('kraken', message); // 调用 _processTicker
      // 如果是 ticker，也处理资金费率 / If ticker, also process funding rate
      if (message.funding_rate !== undefined) { // 条件判断 message.funding_rate !== undefined
        this._processFundingRate('kraken', message); // 调用 _processFundingRate
      } // 结束代码块
    } else if (feed === 'book' || feed === 'book_snapshot') { // 执行语句
      // 处理深度数据 / Handle depth data
      this._processDepth('kraken', message); // 调用 _processDepth
    } else if (feed === 'trade' || feed === 'trade_snapshot') { // 执行语句
      // 处理成交数据 / Handle trade data
      this._processTrade('kraken', message); // 调用 _processTrade
    } // 结束代码块
  } // 结束代码块

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
  _processTicker(exchange, message) { // 调用 _processTicker
    // 标准化行情数据 / Normalize ticker data
    const ticker = this._normalizeTicker(exchange, message); // 定义常量 ticker

    // 如果标准化失败，返回 / If normalization failed, return
    if (!ticker) { // 条件判断 !ticker
      return; // 返回结果
    } // 结束代码块

    // 计算统一时间戳 / Calculate unified timestamp
    ticker.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, ticker.exchangeTimestamp); // 赋值 ticker.unifiedTimestamp

    // 更新缓存 / Update cache
    const cacheKey = `${exchange}:${ticker.symbol}`; // 定义常量 cacheKey
    this.cache.tickers.set(cacheKey, ticker); // 访问 cache

    // 存储到 Redis Hash / Store to Redis Hash
    this._storeToRedisHash(REDIS_KEYS.TICKER_HASH, cacheKey, ticker); // 调用 _storeToRedisHash

    // 发布到 Redis Channel / Publish to Redis Channel
    this._publishToChannel(DATA_TYPES.TICKER, ticker); // 调用 _publishToChannel

    // 链路日志: 发出 ticker 事件 / Chain log: Emit ticker event
    // 注: 仅调试时启用，避免日志过多 / Note: Only enable for debugging to avoid log flood
    if (process.env.LOG_LEVEL === 'debug') { // 条件判断 process.env.LOG_LEVEL === 'debug'
      console.log(`${this.logPrefix} [链路] 发出ticker事件: ${ticker.exchange}:${ticker.symbol} 价格=${ticker.last}`); // 控制台输出
    } // 结束代码块

    // 发出事件 / Emit event
    this.emit('ticker', ticker); // 调用 emit
  } // 结束代码块

  /**
   * 处理深度数据
   * Process depth data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @private
   */
  _processDepth(exchange, message) { // 调用 _processDepth
    // 标准化深度数据 / Normalize depth data
    const depth = this._normalizeDepth(exchange, message); // 定义常量 depth

    // 如果标准化失败，返回 / If normalization failed, return
    if (!depth) { // 条件判断 !depth
      return; // 返回结果
    } // 结束代码块

    // 计算统一时间戳 / Calculate unified timestamp
    depth.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, depth.exchangeTimestamp); // 赋值 depth.unifiedTimestamp

    // 更新缓存 / Update cache
    const cacheKey = `${exchange}:${depth.symbol}`; // 定义常量 cacheKey
    this.cache.depths.set(cacheKey, depth); // 访问 cache

    // 存储到 Redis Hash / Store to Redis Hash
    this._storeToRedisHash(REDIS_KEYS.DEPTH_HASH, cacheKey, depth); // 调用 _storeToRedisHash

    // 发布到 Redis Channel / Publish to Redis Channel
    this._publishToChannel(DATA_TYPES.DEPTH, depth); // 调用 _publishToChannel

    // 发出事件 / Emit event
    this.emit('depth', depth); // 调用 emit
  } // 结束代码块

  /**
   * 处理成交数据
   * Process trade data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @private
   */
  _processTrade(exchange, message) { // 调用 _processTrade
    // 标准化成交数据 / Normalize trade data
    const trades = this._normalizeTrade(exchange, message); // 定义常量 trades

    // 如果标准化失败，返回 / If normalization failed, return
    if (!trades || trades.length === 0) { // 条件判断 !trades || trades.length === 0
      return; // 返回结果
    } // 结束代码块

    // 处理每笔成交 / Process each trade
    for (const trade of trades) { // 循环 const trade of trades
      // 计算统一时间戳 / Calculate unified timestamp
      trade.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, trade.exchangeTimestamp); // 赋值 trade.unifiedTimestamp

      // 存储到 Redis Stream / Store to Redis Stream
      const streamKey = `${REDIS_KEYS.TRADE_STREAM}${exchange}:${trade.symbol}`; // 定义常量 streamKey
      this._storeToRedisStream(streamKey, trade); // 调用 _storeToRedisStream

      // 发布到 Redis Channel / Publish to Redis Channel
      this._publishToChannel(DATA_TYPES.TRADE, trade); // 调用 _publishToChannel

      // 发出事件 / Emit event
      this.emit('trade', trade); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理资金费率数据
   * Process funding rate data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @private
   */
  _processFundingRate(exchange, message) { // 调用 _processFundingRate
    // 标准化资金费率数据 / Normalize funding rate data
    const fundingRate = this._normalizeFundingRate(exchange, message); // 定义常量 fundingRate

    // 如果标准化失败，返回 / If normalization failed, return
    if (!fundingRate) { // 条件判断 !fundingRate
      return; // 返回结果
    } // 结束代码块

    // 计算统一时间戳 / Calculate unified timestamp
    fundingRate.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, fundingRate.exchangeTimestamp); // 赋值 fundingRate.unifiedTimestamp

    // 更新缓存 / Update cache
    const cacheKey = `${exchange}:${fundingRate.symbol}`; // 定义常量 cacheKey
    this.cache.fundingRates.set(cacheKey, fundingRate); // 访问 cache

    // 去重检查: 如果资金费率没有变化，跳过发送 / Dedup check: skip if funding rate hasn't changed
    const lastEmitted = this.cache.lastEmittedFundingRates.get(cacheKey); // 定义常量 lastEmitted
    if (lastEmitted && lastEmitted.fundingRate === fundingRate.fundingRate && lastEmitted.nextFundingTime === fundingRate.nextFundingTime) { // 条件判断 lastEmitted && lastEmitted.fundingRate === fu...
      // 费率和下次结算时间都没变，跳过发送 / Rate and next funding time unchanged, skip emit
      return; // 返回结果
    } // 结束代码块

    // 存储到 Redis Hash / Store to Redis Hash
    this._storeToRedisHash(REDIS_KEYS.FUNDING_HASH, cacheKey, fundingRate); // 调用 _storeToRedisHash

    // 发布到 Redis Channel / Publish to Redis Channel
    this._publishToChannel(DATA_TYPES.FUNDING_RATE, fundingRate); // 调用 _publishToChannel

    // 链路日志: 发出资金费率事件 / Chain log: Emit funding rate event
    console.log( // 控制台输出
      `${this.logPrefix} [链路] 发出fundingRate事件: ${fundingRate.exchange}:${fundingRate.symbol} ` + // 执行语句
      `费率=${fundingRate.fundingRate} / Emitting fundingRate event` // 执行语句
    ); // 结束调用或参数

    // 更新最后发出的资金费率缓存 / Update last emitted funding rate cache
    this.cache.lastEmittedFundingRates.set(cacheKey, { // 访问 cache
      fundingRate: fundingRate.fundingRate, // 设置 fundingRate 字段
      nextFundingTime: fundingRate.nextFundingTime, // 设置 nextFundingTime 字段
    }); // 结束代码块

    // 发出事件 / Emit event
    this.emit('fundingRate', fundingRate); // 调用 emit
  } // 结束代码块

  /**
   * 处理K线数据
   * Process kline (candlestick) data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @private
   */
  _processKline(exchange, message) { // 调用 _processKline
    // 标准化K线数据 / Normalize kline data
    const candle = this._normalizeKline(exchange, message); // 定义常量 candle

    // 如果标准化失败，返回 / If normalization failed, return
    if (!candle) { // 条件判断 !candle
      return; // 返回结果
    } // 结束代码块

    // 计算统一时间戳 / Calculate unified timestamp
    candle.unifiedTimestamp = this._calculateUnifiedTimestamp(exchange, candle.exchangeTimestamp); // 赋值 candle.unifiedTimestamp

    // 更新缓存 / Update cache
    const cacheKey = `${exchange}:${candle.symbol}`; // 定义常量 cacheKey
    if (!this.cache.klines.has(cacheKey)) { // 条件判断 !this.cache.klines.has(cacheKey)
      this.cache.klines.set(cacheKey, []); // 访问 cache
    } // 结束代码块
    const klineCache = this.cache.klines.get(cacheKey); // 定义常量 klineCache
    const { maxCandles, historyCandles } = this.config.cache; // 解构赋值

    // 如果是同一根K线更新，替换最后一根 / If same candle update, replace last one
    if (klineCache.length > 0 && klineCache[klineCache.length - 1].openTime === candle.openTime) { // 条件判断 klineCache.length > 0 && klineCache[klineCach...
      klineCache[klineCache.length - 1] = candle; // 执行语句
    } else { // 执行语句
      // 新K线，添加到缓存 / New candle, add to cache
      klineCache.push(candle); // 调用 klineCache.push
      // 限制缓存大小 / Limit cache size
      if (klineCache.length > maxCandles) { // 条件判断 klineCache.length > maxCandles
        klineCache.shift(); // 调用 klineCache.shift
      } // 结束代码块
    } // 结束代码块

    // 存储到 Redis Hash / Store to Redis Hash
    this._storeToRedisHash(REDIS_KEYS.KLINE_HASH, cacheKey, candle); // 调用 _storeToRedisHash

    // 发布到 Redis Channel / Publish to Redis Channel
    this._publishToChannel(DATA_TYPES.KLINE, candle); // 调用 _publishToChannel

    // 链路日志: 仅在 K 线闭合时记录 (减少日志量) / Chain log: Only log when candle is closed (reduce log volume)
    if (candle.isClosed) { // 条件判断 candle.isClosed
      console.log( // 控制台输出
        `${this.logPrefix} [链路] K线闭合: ${candle.exchange}:${candle.symbol} ` + // 执行语句
        `close=${candle.close} / Candle closed` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 发出 candle 事件 (用于策略) / Emit candle event (for strategies)
    this.emit('candle', { // 调用 emit
      ...candle, // 展开对象或数组
      history: klineCache.slice(-historyCandles), // Attach recent candles history
    }); // 结束代码块
  } // 结束代码块

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
  _normalizeTicker(exchange, message) { // 调用 _normalizeTicker
    try { // 尝试执行
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) { // 分支选择 exchange
        case 'binance': // 分支 'binance'
          return this._normalizeBinanceTicker(message); // 返回结果

        case 'bybit': // 分支 'bybit'
          return this._normalizeBybitTicker(message); // 返回结果

        case 'okx': // 分支 'okx'
          return this._normalizeOKXTicker(message); // 返回结果

        case 'deribit': // 分支 'deribit'
          return this._normalizeDeribitTicker(message); // 返回结果

        case 'gate': // 分支 'gate'
          return this._normalizeGateTicker(message); // 返回结果

        case 'bitget': // 分支 'bitget'
          return this._normalizeBitgetTicker(message); // 返回结果

        case 'kucoin': // 分支 'kucoin'
          return this._normalizeKuCoinTicker(message); // 返回结果

        case 'kraken': // 分支 'kraken'
          return this._normalizeKrakenTicker(message); // 返回结果

        default: // 默认分支
          return null; // 返回结果
      } // 结束代码块
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 标准化行情数据失败 / Failed to normalize ticker:`, error.message); // 控制台输出
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Binance 行情数据
   * Normalize Binance ticker data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeBinanceTicker(data) { // 调用 _normalizeBinanceTicker
    // 转换交易对格式 / Convert symbol format
    const symbol = this._binanceToStandardSymbol(data.s); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Bybit 行情数据
   * Normalize Bybit ticker data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeBybitTicker(message) { // 调用 _normalizeBybitTicker
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bybitToStandardSymbol(data.symbol); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 OKX 行情数据
   * Normalize OKX ticker data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的行情数据 / Normalized ticker data
   * @private
   */
  _normalizeOKXTicker(message) { // 调用 _normalizeOKXTicker
    // 获取数据 / Get data
    const data = message.data[0]; // 定义常量 data

    // 转换交易对格式 / Convert symbol format
    const symbol = this._okxToStandardSymbol(message.arg.instId); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化深度数据
   * Normalize depth data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object|null} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeDepth(exchange, message) { // 调用 _normalizeDepth
    try { // 尝试执行
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) { // 分支选择 exchange
        case 'binance': // 分支 'binance'
          return this._normalizeBinanceDepth(message); // 返回结果

        case 'bybit': // 分支 'bybit'
          return this._normalizeBybitDepth(message); // 返回结果

        case 'okx': // 分支 'okx'
          return this._normalizeOKXDepth(message); // 返回结果

        case 'deribit': // 分支 'deribit'
          return this._normalizeDeribitDepth(message); // 返回结果

        case 'gate': // 分支 'gate'
          return this._normalizeGateDepth(message); // 返回结果

        case 'bitget': // 分支 'bitget'
          return this._normalizeBitgetDepth(message); // 返回结果

        case 'kucoin': // 分支 'kucoin'
          return this._normalizeKuCoinDepth(message); // 返回结果

        case 'kraken': // 分支 'kraken'
          return this._normalizeKrakenDepth(message); // 返回结果

        default: // 默认分支
          return null; // 返回结果
      } // 结束代码块
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 标准化深度数据失败 / Failed to normalize depth:`, error.message); // 控制台输出
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Binance 深度数据
   * Normalize Binance depth data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeBinanceDepth(data) { // 调用 _normalizeBinanceDepth
    // 转换交易对格式 / Convert symbol format
    const symbol = this._binanceToStandardSymbol(data.s); // 定义常量 symbol

    return { // 返回结果
      exchange: 'binance',                    // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.b || []).map(([price, amount]) => [ // 设置 bids 字段
        parseFloat(price), // 调用 parseFloat
        parseFloat(amount), // 调用 parseFloat
      ]), // 结束数组或索引
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.a || []).map(([price, amount]) => [ // 设置 asks 字段
        parseFloat(price), // 调用 parseFloat
        parseFloat(amount), // 调用 parseFloat
      ]), // 结束数组或索引
      exchangeTimestamp: data.E,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Bybit 深度数据
   * Normalize Bybit depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeBybitDepth(message) { // 调用 _normalizeBybitDepth
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data

    // 提取交易对 / Extract symbol
    const symbol = this._bybitToStandardSymbol(data.s); // 定义常量 symbol

    return { // 返回结果
      exchange: 'bybit',                      // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.b || []).map(([price, amount]) => [ // 设置 bids 字段
        parseFloat(price), // 调用 parseFloat
        parseFloat(amount), // 调用 parseFloat
      ]), // 结束数组或索引
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.a || []).map(([price, amount]) => [ // 设置 asks 字段
        parseFloat(price), // 调用 parseFloat
        parseFloat(amount), // 调用 parseFloat
      ]), // 结束数组或索引
      exchangeTimestamp: parseInt(message.ts), // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 OKX 深度数据
   * Normalize OKX depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeOKXDepth(message) { // 调用 _normalizeOKXDepth
    // 获取数据 / Get data
    const data = message.data[0]; // 定义常量 data

    // 转换交易对格式 / Convert symbol format
    const symbol = this._okxToStandardSymbol(message.arg.instId); // 定义常量 symbol

    return { // 返回结果
      exchange: 'okx',                        // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.bids || []).map(([price, amount]) => [ // 设置 bids 字段
        parseFloat(price), // 调用 parseFloat
        parseFloat(amount), // 调用 parseFloat
      ]), // 结束数组或索引
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(([price, amount]) => [ // 设置 asks 字段
        parseFloat(price), // 调用 parseFloat
        parseFloat(amount), // 调用 parseFloat
      ]), // 结束数组或索引
      exchangeTimestamp: parseInt(data.ts),   // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化成交数据
   * Normalize trade data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array|null} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeTrade(exchange, message) { // 调用 _normalizeTrade
    try { // 尝试执行
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) { // 分支选择 exchange
        case 'binance': // 分支 'binance'
          return [this._normalizeBinanceTrade(message)]; // 返回结果

        case 'bybit': // 分支 'bybit'
          return this._normalizeBybitTrade(message); // 返回结果

        case 'okx': // 分支 'okx'
          return this._normalizeOKXTrade(message); // 返回结果

        case 'deribit': // 分支 'deribit'
          return this._normalizeDeribitTrade(message); // 返回结果

        case 'gate': // 分支 'gate'
          return this._normalizeGateTrade(message); // 返回结果

        case 'bitget': // 分支 'bitget'
          return this._normalizeBitgetTrade(message); // 返回结果

        case 'kucoin': // 分支 'kucoin'
          return [this._normalizeKuCoinTrade(message)]; // 返回结果

        case 'kraken': // 分支 'kraken'
          return this._normalizeKrakenTrade(message); // 返回结果

        default: // 默认分支
          return null; // 返回结果
      } // 结束代码块
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 标准化成交数据失败 / Failed to normalize trade:`, error.message); // 控制台输出
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Binance 成交数据
   * Normalize Binance trade data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的成交数据 / Normalized trade data
   * @private
   */
  _normalizeBinanceTrade(data) { // 调用 _normalizeBinanceTrade
    // 转换交易对格式 / Convert symbol format
    const symbol = this._binanceToStandardSymbol(data.s); // 定义常量 symbol

    return { // 返回结果
      exchange: 'binance',                    // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      tradeId: data.t.toString(),             // 成交 ID / Trade ID
      price: parseFloat(data.p),              // 成交价格 / Trade price
      amount: parseFloat(data.q),             // 成交数量 / Trade amount
      side: data.m ? 'sell' : 'buy',          // 主动方向 (m=true 表示买方是 maker) / Aggressor side
      exchangeTimestamp: data.T,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Bybit 成交数据
   * Normalize Bybit trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeBybitTrade(message) { // 调用 _normalizeBybitTrade
    // 获取数据数组 / Get data array
    const dataArray = message.data; // 定义常量 dataArray

    // 提取交易对 / Extract symbol
    const topic = message.topic; // 定义常量 topic
    const symbolPart = topic.split('.')[1]; // 定义常量 symbolPart
    const symbol = this._bybitToStandardSymbol(symbolPart); // 定义常量 symbol

    // 标准化每笔成交 / Normalize each trade
    return dataArray.map(data => ({ // 返回结果
      exchange: 'bybit',                      // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      tradeId: data.i,                        // 成交 ID / Trade ID
      price: parseFloat(data.p),              // 成交价格 / Trade price
      amount: parseFloat(data.v),             // 成交数量 / Trade amount
      side: data.S.toLowerCase(),             // 主动方向 / Aggressor side
      exchangeTimestamp: parseInt(data.T),    // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    })); // 结束代码块
  } // 结束代码块

  /**
   * 标准化 OKX 成交数据
   * Normalize OKX trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeOKXTrade(message) { // 调用 _normalizeOKXTrade
    // 获取数据数组 / Get data array
    const dataArray = message.data; // 定义常量 dataArray

    // 转换交易对格式 / Convert symbol format
    const symbol = this._okxToStandardSymbol(message.arg.instId); // 定义常量 symbol

    // 标准化每笔成交 / Normalize each trade
    return dataArray.map(data => ({ // 返回结果
      exchange: 'okx',                        // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      tradeId: data.tradeId,                  // 成交 ID / Trade ID
      price: parseFloat(data.px),             // 成交价格 / Trade price
      amount: parseFloat(data.sz),            // 成交数量 / Trade amount
      side: data.side,                        // 主动方向 / Aggressor side
      exchangeTimestamp: parseInt(data.ts),   // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    })); // 结束代码块
  } // 结束代码块

  /**
   * 标准化资金费率数据
   * Normalize funding rate data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object|null} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeFundingRate(exchange, message) { // 调用 _normalizeFundingRate
    try { // 尝试执行
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) { // 分支选择 exchange
        case 'binance': // 分支 'binance'
          return this._normalizeBinanceFundingRate(message); // 返回结果

        case 'bybit': // 分支 'bybit'
          // Bybit 资金费率在 ticker 中 / Bybit funding rate is in ticker
          return null; // 返回结果

        case 'okx': // 分支 'okx'
          return this._normalizeOKXFundingRate(message); // 返回结果

        case 'deribit': // 分支 'deribit'
          return this._normalizeDeribitFundingRate(message); // 返回结果

        case 'gate': // 分支 'gate'
          return this._normalizeGateFundingRate(message); // 返回结果

        case 'bitget': // 分支 'bitget'
          return this._normalizeBitgetFundingRate(message); // 返回结果

        case 'kucoin': // 分支 'kucoin'
          return this._normalizeKuCoinFundingRate(message); // 返回结果

        case 'kraken': // 分支 'kraken'
          return this._normalizeKrakenFundingRate(message); // 返回结果

        default: // 默认分支
          return null; // 返回结果
      } // 结束代码块
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 标准化资金费率数据失败 / Failed to normalize funding rate:`, error.message); // 控制台输出
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Binance 资金费率数据
   * Normalize Binance funding rate data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeBinanceFundingRate(data) { // 调用 _normalizeBinanceFundingRate
    // 转换交易对格式 / Convert symbol format
    const symbol = this._binanceToStandardSymbol(data.s); // 定义常量 symbol

    return { // 返回结果
      exchange: 'binance',                    // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      markPrice: parseFloat(data.p),          // 标记价格 / Mark price
      indexPrice: parseFloat(data.i),         // 指数价格 / Index price
      fundingRate: parseFloat(data.r),        // 当前资金费率 / Current funding rate
      nextFundingTime: data.T,                // 下次资金费率时间 / Next funding time
      exchangeTimestamp: data.E,              // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 OKX 资金费率数据
   * Normalize OKX funding rate data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeOKXFundingRate(message) { // 调用 _normalizeOKXFundingRate
    // 获取数据 / Get data
    const data = message.data[0]; // 定义常量 data

    // 转换交易对格式 / Convert symbol format
    const symbol = this._okxToStandardSymbol(message.arg.instId); // 定义常量 symbol

    return { // 返回结果
      exchange: 'okx',                        // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      fundingRate: parseFloat(data.fundingRate), // 当前资金费率 / Current funding rate
      nextFundingRate: data.nextFundingRate ? parseFloat(data.nextFundingRate) : null, // 预测资金费率 / Predicted funding rate
      nextFundingTime: parseInt(data.fundingTime), // 下次资金费率时间 / Next funding time
      exchangeTimestamp: parseInt(data.ts),   // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),             // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化K线数据
   * Normalize kline (candlestick) data
   *
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object|null} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeKline(exchange, message) { // 调用 _normalizeKline
    try { // 尝试执行
      // 根据交易所标准化 / Normalize based on exchange
      switch (exchange) { // 分支选择 exchange
        case 'binance': // 分支 'binance'
          return this._normalizeBinanceKline(message); // 返回结果

        case 'bybit': // 分支 'bybit'
          return this._normalizeBybitKline(message); // 返回结果

        case 'okx': // 分支 'okx'
          return this._normalizeOKXKline(message); // 返回结果

        case 'deribit': // 分支 'deribit'
          return this._normalizeDeribitKline(message); // 返回结果

        case 'gate': // 分支 'gate'
          return this._normalizeGateKline(message); // 返回结果

        case 'bitget': // 分支 'bitget'
          return this._normalizeBitgetKline(message); // 返回结果

        case 'kucoin': // 分支 'kucoin'
          return this._normalizeKuCoinKline(message); // 返回结果

        case 'kraken': // 分支 'kraken'
          return this._normalizeKrakenKline(message); // 返回结果

        default: // 默认分支
          return null; // 返回结果
      } // 结束代码块
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 标准化K线数据失败 / Failed to normalize kline:`, error.message); // 控制台输出
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Binance K线数据
   * Normalize Binance kline data
   *
   * @param {Object} data - 原始数据 / Raw data
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeBinanceKline(data) { // 调用 _normalizeBinanceKline
    // Binance kline 数据结构 / Binance kline data structure
    // { e: 'kline', E: eventTime, s: symbol, k: { t, T, s, i, o, c, h, l, v, ... } }
    const k = data.k; // 定义常量 k
    const symbol = this._binanceToStandardSymbol(data.s); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Bybit K线数据
   * Normalize Bybit kline data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeBybitKline(message) { // 调用 _normalizeBybitKline
    // Bybit kline 数据结构 / Bybit kline data structure
    // { topic: 'kline.60.BTCUSDT', data: [{ start, end, interval, open, close, high, low, volume, ... }] }
    const data = message.data[0]; // 定义常量 data
    const topic = message.topic; // 定义常量 topic
    const symbolMatch = topic.match(/kline\.\d+\.(\w+)/); // 定义常量 symbolMatch
    const rawSymbol = symbolMatch ? symbolMatch[1] : ''; // 定义常量 rawSymbol
    const symbol = this._bybitToStandardSymbol(rawSymbol); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 OKX K线数据
   * Normalize OKX kline data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeOKXKline(message) { // 调用 _normalizeOKXKline
    // OKX kline 数据结构 / OKX kline data structure
    // { arg: { channel, instId }, data: [[ts, o, h, l, c, vol, volCcy, ...]] }
    const data = message.data[0]; // 定义常量 data
    const symbol = this._okxToStandardSymbol(message.arg.instId); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeDeribitTicker(message) { // 调用 _normalizeDeribitTicker
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data
    const channel = message.channel; // 定义常量 channel

    // 从频道提取交易对 / Extract symbol from channel
    // 格式: ticker.BTC-PERPETUAL.100ms -> BTC-PERPETUAL
    const symbolMatch = channel.match(/ticker\.(.+)\.100ms/); // 定义常量 symbolMatch
    const deribitSymbol = symbolMatch ? symbolMatch[1] : ''; // 定义常量 deribitSymbol
    const symbol = this._deribitToStandardSymbol(deribitSymbol); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeDeribitDepth(message) { // 调用 _normalizeDeribitDepth
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data
    const channel = message.channel; // 定义常量 channel

    // 从频道提取交易对 / Extract symbol from channel
    // 格式: book.BTC-PERPETUAL.10.100ms -> BTC-PERPETUAL
    const symbolMatch = channel.match(/book\.(.+)\.\d+\.100ms/); // 定义常量 symbolMatch
    const deribitSymbol = symbolMatch ? symbolMatch[1] : ''; // 定义常量 deribitSymbol
    const symbol = this._deribitToStandardSymbol(deribitSymbol); // 定义常量 symbol

    return { // 返回结果
      exchange: 'deribit',                    // 交易所 / Exchange
      symbol,                                  // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      // Deribit 格式: [action, price, amount] -> [price, amount]
      bids: (data.bids || []).map(item => [ // 设置 bids 字段
        parseFloat(Array.isArray(item) ? item[1] : item.price), // 调用 parseFloat
        parseFloat(Array.isArray(item) ? item[2] : item.amount), // 调用 parseFloat
      ]), // 结束数组或索引
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(item => [ // 设置 asks 字段
        parseFloat(Array.isArray(item) ? item[1] : item.price), // 调用 parseFloat
        parseFloat(Array.isArray(item) ? item[2] : item.amount), // 调用 parseFloat
      ]), // 结束数组或索引
      exchangeTimestamp: data.timestamp,       // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),              // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeDeribitTrade(message) { // 调用 _normalizeDeribitTrade
    // 获取数据数组 / Get data array
    const dataArray = Array.isArray(message.data) ? message.data : [message.data]; // 定义常量 dataArray
    const channel = message.channel; // 定义常量 channel

    // 从频道提取交易对 / Extract symbol from channel
    // 格式: trades.BTC-PERPETUAL.100ms -> BTC-PERPETUAL
    const symbolMatch = channel.match(/trades\.(.+)\.100ms/); // 定义常量 symbolMatch
    const deribitSymbol = symbolMatch ? symbolMatch[1] : ''; // 定义常量 deribitSymbol
    const symbol = this._deribitToStandardSymbol(deribitSymbol); // 定义常量 symbol

    // 标准化每笔成交 / Normalize each trade
    return dataArray.map(data => ({ // 返回结果
      exchange: 'deribit',                       // 交易所 / Exchange
      symbol,                                     // 交易对 / Trading pair
      tradeId: data.trade_id?.toString() || '',  // 成交 ID / Trade ID
      price: parseFloat(data.price || 0),        // 成交价格 / Trade price
      amount: parseFloat(data.amount || 0),      // 成交数量 / Trade amount
      side: data.direction || 'buy',             // 主动方向 / Aggressor side
      exchangeTimestamp: data.timestamp,          // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                 // 本地时间戳 / Local timestamp
    })); // 结束代码块
  } // 结束代码块

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
  _normalizeDeribitFundingRate(message) { // 调用 _normalizeDeribitFundingRate
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data
    const channel = message.channel; // 定义常量 channel

    // 从频道提取交易对 / Extract symbol from channel
    // 格式: perpetual.BTC-PERPETUAL.100ms -> BTC-PERPETUAL
    const symbolMatch = channel.match(/perpetual\.(.+)\.100ms/); // 定义常量 symbolMatch
    const deribitSymbol = symbolMatch ? symbolMatch[1] : ''; // 定义常量 deribitSymbol
    const symbol = this._deribitToStandardSymbol(deribitSymbol); // 定义常量 symbol

    return { // 返回结果
      exchange: 'deribit',                                // 交易所 / Exchange
      symbol,                                              // 交易对 / Trading pair
      markPrice: parseFloat(data.mark_price || 0),        // 标记价格 / Mark price
      indexPrice: parseFloat(data.index_price || 0),      // 指数价格 / Index price
      fundingRate: parseFloat(data.current_funding || 0), // 当前资金费率 / Current funding rate
      interest: parseFloat(data.interest || 0),           // 利率 / Interest rate
      nextFundingTime: null,                               // Deribit 不提供 / Not provided by Deribit
      exchangeTimestamp: data.timestamp,                   // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                          // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeDeribitKline(message) { // 调用 _normalizeDeribitKline
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data
    const channel = message.channel; // 定义常量 channel

    // 从频道提取交易对和时间间隔 / Extract symbol and interval from channel
    // 格式: chart.trades.BTC-PERPETUAL.60 -> BTC-PERPETUAL, 60
    const channelMatch = channel.match(/chart\.trades\.(.+)\.(\d+)/); // 定义常量 channelMatch
    const deribitSymbol = channelMatch ? channelMatch[1] : ''; // 定义常量 deribitSymbol
    const intervalMinutes = channelMatch ? parseInt(channelMatch[2]) : 60; // 定义常量 intervalMinutes
    const symbol = this._deribitToStandardSymbol(deribitSymbol); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeGateTicker(message) { // 调用 _normalizeGateTicker
    // 获取数据 / Get data
    const data = message.result; // 定义常量 data
    const channel = message.channel; // 定义常量 channel
    const isSpot = channel.startsWith('spot.'); // 定义常量 isSpot

    // 转换交易对格式 / Convert symbol format
    // 现货: currency_pair (BTC_USDT), 合约: contract (BTC_USDT)
    const gateSymbol = isSpot ? data.currency_pair : data.contract; // 定义常量 gateSymbol
    const symbol = this._gateToStandardSymbol(gateSymbol); // 定义常量 symbol

    // 获取时间戳 / Get timestamp
    const timestamp = data.t ? parseInt(data.t) * 1000 : Date.now(); // 定义常量 timestamp

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeGateDepth(message) { // 调用 _normalizeGateDepth
    // 获取数据 / Get data
    const data = message.result; // 定义常量 data
    const channel = message.channel; // 定义常量 channel
    const isSpot = channel.startsWith('spot.'); // 定义常量 isSpot

    // 转换交易对格式 / Convert symbol format
    const gateSymbol = data.s || data.contract; // 定义常量 gateSymbol
    const symbol = this._gateToStandardSymbol(gateSymbol); // 定义常量 symbol

    // 获取时间戳 / Get timestamp
    const timestamp = data.t ? parseInt(data.t) * 1000 : Date.now(); // 定义常量 timestamp

    return { // 返回结果
      exchange: 'gate',                          // 交易所 / Exchange
      symbol,                                     // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.bids || []).map(item => { // 设置 bids 字段
        // Gate.io 格式: [price, amount] 或 { p: price, s: amount }
        if (Array.isArray(item)) { // 条件判断 Array.isArray(item)
          return [parseFloat(item[0]), parseFloat(item[1])]; // 返回结果
        } // 结束代码块
        return [parseFloat(item.p || 0), parseFloat(item.s || 0)]; // 返回结果
      }), // 结束代码块
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(item => { // 设置 asks 字段
        if (Array.isArray(item)) { // 条件判断 Array.isArray(item)
          return [parseFloat(item[0]), parseFloat(item[1])]; // 返回结果
        } // 结束代码块
        return [parseFloat(item.p || 0), parseFloat(item.s || 0)]; // 返回结果
      }), // 结束代码块
      exchangeTimestamp: timestamp,               // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                 // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeGateTrade(message) { // 调用 _normalizeGateTrade
    // 获取数据 / Get data
    const result = message.result; // 定义常量 result
    const channel = message.channel; // 定义常量 channel
    const isSpot = channel.startsWith('spot.'); // 定义常量 isSpot

    // Gate.io 可能返回单个成交或成交数组 / Gate.io may return single trade or trade array
    const trades = Array.isArray(result) ? result : [result]; // 定义常量 trades

    // 标准化每笔成交 / Normalize each trade
    return trades.map(data => { // 返回结果
      // 转换交易对格式 / Convert symbol format
      const gateSymbol = isSpot ? data.currency_pair : data.contract; // 定义常量 gateSymbol
      const symbol = this._gateToStandardSymbol(gateSymbol); // 定义常量 symbol

      // 获取时间戳 / Get timestamp
      const timestamp = data.create_time // 定义常量 timestamp
        ? parseInt(data.create_time) * 1000 // 执行语句
        : (data.create_time_ms ? parseInt(data.create_time_ms) : Date.now()); // 执行语句

      return { // 返回结果
        exchange: 'gate',                        // 交易所 / Exchange
        symbol,                                   // 交易对 / Trading pair
        tradeId: data.id?.toString() || '',      // 成交 ID / Trade ID
        price: parseFloat(data.price || 0),      // 成交价格 / Trade price
        amount: parseFloat(data.amount || data.size || 0), // 成交数量 / Trade amount
        side: data.side || (data.size > 0 ? 'buy' : 'sell'), // 主动方向 / Aggressor side
        exchangeTimestamp: timestamp,             // 交易所时间戳 / Exchange timestamp
        localTimestamp: Date.now(),               // 本地时间戳 / Local timestamp
      }; // 结束代码块
    }); // 结束代码块
  } // 结束代码块

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
  _normalizeGateFundingRate(message) { // 调用 _normalizeGateFundingRate
    // 获取数据 / Get data
    const data = message.result; // 定义常量 data

    // 转换交易对格式 / Convert symbol format
    const gateSymbol = data.contract; // 定义常量 gateSymbol
    const symbol = this._gateToStandardSymbol(gateSymbol); // 定义常量 symbol

    // 获取时间戳 / Get timestamp
    const timestamp = data.t ? parseInt(data.t) * 1000 : Date.now(); // 定义常量 timestamp

    return { // 返回结果
      exchange: 'gate',                               // 交易所 / Exchange
      symbol,                                          // 交易对 / Trading pair
      markPrice: parseFloat(data.mark_price || 0),    // 标记价格 / Mark price
      indexPrice: parseFloat(data.index_price || 0),  // 指数价格 / Index price
      fundingRate: parseFloat(data.funding_rate || 0), // 当前资金费率 / Current funding rate
      fundingRateIndicative: data.funding_rate_indicative // 设置 fundingRateIndicative 字段
        ? parseFloat(data.funding_rate_indicative) // 执行语句
        : null,                                        // 预测资金费率 / Predicted funding rate
      nextFundingTime: Date.now() + 8 * 3600 * 1000,  // 下次资金费率时间 (8小时后) / Next funding time (8h later)
      exchangeTimestamp: timestamp,                    // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                      // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeGateKline(message) { // 调用 _normalizeGateKline
    // 获取数据 / Get data
    const data = message.result; // 定义常量 data
    const channel = message.channel; // 定义常量 channel
    const isSpot = channel.startsWith('spot.'); // 定义常量 isSpot

    // 转换交易对格式 / Convert symbol format
    // K线数据中使用 n (name) 字段存储交易对 / Kline data uses n (name) field for symbol
    const gateSymbol = data.n || data.contract; // 定义常量 gateSymbol
    const symbol = this._gateToStandardSymbol(gateSymbol); // 定义常量 symbol

    // 获取时间戳 / Get timestamp
    const openTime = data.t ? parseInt(data.t) * 1000 : Date.now(); // 定义常量 openTime

    // 获取时间间隔 (从 a 字段或默认 1 小时) / Get interval (from a field or default 1 hour)
    const interval = data.a || '1h'; // 定义常量 interval

    // 计算收盘时间 (根据时间间隔) / Calculate close time (based on interval)
    let intervalMs = 3600000; // 默认 1 小时 / Default 1 hour
    if (interval.endsWith('m')) { // 条件判断 interval.endsWith('m')
      intervalMs = parseInt(interval) * 60 * 1000; // 赋值 intervalMs
    } else if (interval.endsWith('h')) { // 执行语句
      intervalMs = parseInt(interval) * 3600 * 1000; // 赋值 intervalMs
    } else if (interval.endsWith('d')) { // 执行语句
      intervalMs = parseInt(interval) * 86400 * 1000; // 赋值 intervalMs
    } // 结束代码块

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeBitgetTicker(message) { // 调用 _normalizeBitgetTicker
    // 获取数据 / Get data
    const data = message.data[0]; // 定义常量 data
    const arg = message.arg; // 定义常量 arg

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId); // 定义常量 symbol

    // 获取时间戳 / Get timestamp
    const timestamp = data.ts ? parseInt(data.ts) : Date.now(); // 定义常量 timestamp

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeBitgetDepth(message) { // 调用 _normalizeBitgetDepth
    // 获取数据 / Get data
    const data = message.data[0]; // 定义常量 data
    const arg = message.arg; // 定义常量 arg

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId); // 定义常量 symbol

    // 获取时间戳 / Get timestamp
    const timestamp = data.ts ? parseInt(data.ts) : Date.now(); // 定义常量 timestamp

    return { // 返回结果
      exchange: 'bitget',                          // 交易所 / Exchange
      symbol,                                       // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.bids || []).map(item => [ // 设置 bids 字段
        parseFloat(item[0]), // 调用 parseFloat
        parseFloat(item[1]), // 调用 parseFloat
      ]), // 结束数组或索引
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(item => [ // 设置 asks 字段
        parseFloat(item[0]), // 调用 parseFloat
        parseFloat(item[1]), // 调用 parseFloat
      ]), // 结束数组或索引
      exchangeTimestamp: timestamp,                 // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                   // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeBitgetTrade(message) { // 调用 _normalizeBitgetTrade
    // 获取数据数组 / Get data array
    const dataArray = message.data; // 定义常量 dataArray
    const arg = message.arg; // 定义常量 arg

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId); // 定义常量 symbol

    // 标准化每笔成交 / Normalize each trade
    return dataArray.map(data => ({ // 返回结果
      exchange: 'bitget',                          // 交易所 / Exchange
      symbol,                                       // 交易对 / Trading pair
      tradeId: data.tradeId?.toString() || '',     // 成交 ID / Trade ID
      price: parseFloat(data.price || data.px || 0), // 成交价格 / Trade price
      amount: parseFloat(data.size || data.sz || 0), // 成交数量 / Trade amount
      side: data.side?.toLowerCase() || 'buy',     // 主动方向 / Aggressor side
      exchangeTimestamp: parseInt(data.ts || Date.now()), // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                   // 本地时间戳 / Local timestamp
    })); // 结束代码块
  } // 结束代码块

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
  _normalizeBitgetFundingRate(message) { // 调用 _normalizeBitgetFundingRate
    // 获取数据 / Get data
    const data = message.data[0]; // 定义常量 data
    const arg = message.arg; // 定义常量 arg

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId); // 定义常量 symbol

    // 获取时间戳 / Get timestamp
    const timestamp = data.ts ? parseInt(data.ts) : Date.now(); // 定义常量 timestamp

    return { // 返回结果
      exchange: 'bitget',                                // 交易所 / Exchange
      symbol,                                             // 交易对 / Trading pair
      markPrice: parseFloat(data.markPrice || 0),        // 标记价格 / Mark price
      indexPrice: parseFloat(data.indexPrice || 0),      // 指数价格 / Index price
      fundingRate: parseFloat(data.fundingRate || 0),    // 当前资金费率 / Current funding rate
      nextFundingTime: data.nextFundingTime ? parseInt(data.nextFundingTime) : null, // 下次资金费率时间 / Next funding time
      exchangeTimestamp: timestamp,                       // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                         // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeBitgetKline(message) { // 调用 _normalizeBitgetKline
    // 获取数据 / Get data
    const data = message.data[0]; // 定义常量 data
    const arg = message.arg; // 定义常量 arg

    // 转换交易对格式 / Convert symbol format
    const symbol = this._bitgetToStandardSymbol(arg.instId); // 定义常量 symbol

    // 获取时间间隔 (从频道名称提取) / Get interval (extract from channel name)
    const channel = arg.channel; // 定义常量 channel
    const interval = channel.replace('candle', '') || '1H'; // 定义常量 interval

    // 解析K线数据 / Parse kline data
    // Bitget K线格式: [ts, open, high, low, close, volume, quoteVolume, ...]
    const openTime = parseInt(data[0]); // 定义常量 openTime

    // 计算收盘时间 (根据时间间隔) / Calculate close time (based on interval)
    let intervalMs = 3600000; // 默认 1 小时 / Default 1 hour
    const intervalLower = interval.toLowerCase(); // 定义常量 intervalLower
    if (intervalLower.endsWith('m')) { // 条件判断 intervalLower.endsWith('m')
      intervalMs = parseInt(intervalLower) * 60 * 1000; // 赋值 intervalMs
    } else if (intervalLower.endsWith('h')) { // 执行语句
      intervalMs = parseInt(intervalLower) * 3600 * 1000; // 赋值 intervalMs
    } else if (intervalLower.endsWith('d') || intervalLower.endsWith('day')) { // 执行语句
      intervalMs = 86400 * 1000; // 赋值 intervalMs
    } else if (intervalLower.endsWith('w') || intervalLower.endsWith('week')) { // 执行语句
      intervalMs = 7 * 86400 * 1000; // 赋值 intervalMs
    } // 结束代码块

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _binanceToStandardSymbol(binanceSymbol) { // 调用 _binanceToStandardSymbol
    // 常见的计价货币 / Common quote currencies
    const quotes = ['USDT', 'BUSD', 'USDC', 'BTC', 'ETH', 'BNB', 'USD']; // 定义常量 quotes

    // 尝试匹配计价货币 / Try to match quote currency
    for (const quote of quotes) { // 循环 const quote of quotes
      if (binanceSymbol.endsWith(quote)) { // 条件判断 binanceSymbol.endsWith(quote)
        const base = binanceSymbol.slice(0, -quote.length); // 定义常量 base
        return `${base}/${quote}`; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 如果无法匹配，返回原始格式 / If no match, return original
    return binanceSymbol; // 返回结果
  } // 结束代码块

  /**
   * 将 Bybit 交易对转换为标准格式
   * Convert Bybit symbol to standard format
   *
   * @param {string} bybitSymbol - Bybit 交易对 (如 BTCUSDT) / Bybit symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _bybitToStandardSymbol(bybitSymbol) { // 调用 _bybitToStandardSymbol
    // 常见的计价货币 / Common quote currencies
    const quotes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH']; // 定义常量 quotes

    // 尝试匹配计价货币 / Try to match quote currency
    for (const quote of quotes) { // 循环 const quote of quotes
      if (bybitSymbol.endsWith(quote)) { // 条件判断 bybitSymbol.endsWith(quote)
        const base = bybitSymbol.slice(0, -quote.length); // 定义常量 base
        return `${base}/${quote}`; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 如果无法匹配，返回原始格式 / If no match, return original
    return bybitSymbol; // 返回结果
  } // 结束代码块

  /**
   * 将 OKX 交易对转换为标准格式
   * Convert OKX symbol to standard format
   *
   * @param {string} okxSymbol - OKX 交易对 (如 BTC-USDT-SWAP) / OKX symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _okxToStandardSymbol(okxSymbol) { // 调用 _okxToStandardSymbol
    // OKX 格式: BTC-USDT 或 BTC-USDT-SWAP / OKX format
    // 移除 -SWAP, -FUTURES 等后缀 / Remove -SWAP, -FUTURES suffixes
    const parts = okxSymbol.split('-'); // 定义常量 parts

    // 如果至少有两部分，返回 BASE/QUOTE 格式 / If at least two parts, return BASE/QUOTE format
    if (parts.length >= 2) { // 条件判断 parts.length >= 2
      return `${parts[0]}/${parts[1]}`; // 返回结果
    } // 结束代码块

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return okxSymbol; // 返回结果
  } // 结束代码块

  /**
   * 将 Deribit 交易对转换为标准格式
   * Convert Deribit symbol to standard format
   *
   * @param {string} deribitSymbol - Deribit 交易对 (如 BTC-PERPETUAL) / Deribit symbol
   * @returns {string} 标准交易对 (如 BTC/USD) / Standard symbol
   * @private
   */
  _deribitToStandardSymbol(deribitSymbol) { // 调用 _deribitToStandardSymbol
    // Deribit 永续合约格式: BTC-PERPETUAL -> BTC/USD
    // Deribit perpetual format: BTC-PERPETUAL -> BTC/USD
    if (deribitSymbol.endsWith('-PERPETUAL')) { // 条件判断 deribitSymbol.endsWith('-PERPETUAL')
      const base = deribitSymbol.replace('-PERPETUAL', ''); // 定义常量 base
      return `${base}/USD`; // 返回结果
    } // 结束代码块

    // Deribit 期货格式: BTC-28MAR25 -> BTC/USD (带到期日)
    // Deribit futures format: BTC-28MAR25 -> BTC/USD (with expiry)
    const futuresMatch = deribitSymbol.match(/^([A-Z]+)-(\d{1,2}[A-Z]{3}\d{2})$/); // 定义常量 futuresMatch
    if (futuresMatch) { // 条件判断 futuresMatch
      return `${futuresMatch[1]}/USD`; // 返回结果
    } // 结束代码块

    // Deribit 期权格式: BTC-28MAR25-50000-C -> BTC/USD (期权)
    // Deribit options format: BTC-28MAR25-50000-C -> BTC/USD (options)
    const optionsMatch = deribitSymbol.match(/^([A-Z]+)-/); // 定义常量 optionsMatch
    if (optionsMatch) { // 条件判断 optionsMatch
      return `${optionsMatch[1]}/USD`; // 返回结果
    } // 结束代码块

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return deribitSymbol; // 返回结果
  } // 结束代码块

  /**
   * 将 Gate.io 交易对转换为标准格式
   * Convert Gate.io symbol to standard format
   *
   * @param {string} gateSymbol - Gate.io 交易对 (如 BTC_USDT) / Gate.io symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _gateToStandardSymbol(gateSymbol) { // 调用 _gateToStandardSymbol
    // Gate.io 格式: BTC_USDT -> BTC/USDT
    // Gate.io format: BTC_USDT -> BTC/USDT
    if (!gateSymbol) { // 条件判断 !gateSymbol
      return ''; // 返回结果
    } // 结束代码块

    // 使用下划线分割 / Split by underscore
    const parts = gateSymbol.split('_'); // 定义常量 parts

    // 如果有两部分，返回 BASE/QUOTE 格式 / If two parts, return BASE/QUOTE format
    if (parts.length >= 2) { // 条件判断 parts.length >= 2
      return `${parts[0]}/${parts[1]}`; // 返回结果
    } // 结束代码块

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return gateSymbol; // 返回结果
  } // 结束代码块

  /**
   * 将 Bitget 交易对转换为标准格式
   * Convert Bitget symbol to standard format
   *
   * @param {string} bitgetSymbol - Bitget 交易对 (如 BTCUSDT) / Bitget symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _bitgetToStandardSymbol(bitgetSymbol) { // 调用 _bitgetToStandardSymbol
    // Bitget 格式: BTCUSDT -> BTC/USDT
    // Bitget format: BTCUSDT -> BTC/USDT
    if (!bitgetSymbol) { // 条件判断 !bitgetSymbol
      return ''; // 返回结果
    } // 结束代码块

    // 常见的计价货币 / Common quote currencies
    const quotes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH']; // 定义常量 quotes

    // 尝试匹配计价货币 / Try to match quote currency
    for (const quote of quotes) { // 循环 const quote of quotes
      if (bitgetSymbol.endsWith(quote)) { // 条件判断 bitgetSymbol.endsWith(quote)
        const base = bitgetSymbol.slice(0, -quote.length); // 定义常量 base
        return `${base}/${quote}`; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return bitgetSymbol; // 返回结果
  } // 结束代码块

  /**
   * 将 KuCoin 现货交易对转换为标准格式
   * Convert KuCoin spot symbol to standard format
   *
   * @param {string} kucoinSymbol - KuCoin 交易对 (如 BTC-USDT) / KuCoin symbol
   * @returns {string} 标准交易对 (如 BTC/USDT) / Standard symbol
   * @private
   */
  _kucoinToStandardSymbol(kucoinSymbol) { // 调用 _kucoinToStandardSymbol
    // KuCoin 现货格式: BTC-USDT -> BTC/USDT
    // KuCoin spot format: BTC-USDT -> BTC/USDT
    if (!kucoinSymbol) { // 条件判断 !kucoinSymbol
      return ''; // 返回结果
    } // 结束代码块

    // 使用短横线分割 / Split by hyphen
    const parts = kucoinSymbol.split('-'); // 定义常量 parts

    // 如果有两部分，返回 BASE/QUOTE 格式 / If two parts, return BASE/QUOTE format
    if (parts.length >= 2) { // 条件判断 parts.length >= 2
      return `${parts[0]}/${parts[1]}`; // 返回结果
    } // 结束代码块

    // 如果无法解析，返回原始格式 / If cannot parse, return original
    return kucoinSymbol; // 返回结果
  } // 结束代码块

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
  _normalizeKuCoinTicker(message) { // 调用 _normalizeKuCoinTicker
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data
    const topic = message.topic; // 定义常量 topic

    // 从主题提取交易对 / Extract symbol from topic
    // 现货格式: /market/ticker:BTC-USDT -> BTC-USDT
    // 合约格式: /contractMarket/tickerV2:XBTUSDTM -> XBTUSDTM
    let symbol; // 定义变量 symbol
    const isSpot = topic.includes('/market/ticker:'); // 定义常量 isSpot
    if (isSpot) { // 条件判断 isSpot
      const kucoinSymbol = topic.split(':')[1]; // 定义常量 kucoinSymbol
      symbol = this._kucoinToStandardSymbol(kucoinSymbol); // 赋值 symbol
    } else { // 执行语句
      const futuresSymbol = topic.split(':')[1]; // 定义常量 futuresSymbol
      symbol = this._fromKuCoinFuturesSymbol(futuresSymbol); // 赋值 symbol
    } // 结束代码块

    // 获取时间戳 / Get timestamp
    const timestamp = data.time || data.ts || Date.now(); // 定义常量 timestamp

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 KuCoin 深度数据
   * Normalize KuCoin depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeKuCoinDepth(message) { // 调用 _normalizeKuCoinDepth
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data
    const topic = message.topic; // 定义常量 topic

    // 从主题提取交易对 / Extract symbol from topic
    let symbol; // 定义变量 symbol
    const isSpot = topic.includes('/spotMarket/') || topic.includes('/market/'); // 定义常量 isSpot
    if (isSpot) { // 条件判断 isSpot
      const kucoinSymbol = topic.split(':')[1]; // 定义常量 kucoinSymbol
      symbol = this._kucoinToStandardSymbol(kucoinSymbol); // 赋值 symbol
    } else { // 执行语句
      const futuresSymbol = topic.split(':')[1]; // 定义常量 futuresSymbol
      symbol = this._fromKuCoinFuturesSymbol(futuresSymbol); // 赋值 symbol
    } // 结束代码块

    // 获取时间戳 / Get timestamp
    const timestamp = data.timestamp || data.ts || Date.now(); // 定义常量 timestamp

    return { // 返回结果
      exchange: 'kucoin',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      // 买单 [[价格, 数量], ...] / Bids [[price, amount], ...]
      bids: (data.bids || []).map(item => [ // 设置 bids 字段
        parseFloat(Array.isArray(item) ? item[0] : item.price), // 调用 parseFloat
        parseFloat(Array.isArray(item) ? item[1] : item.size), // 调用 parseFloat
      ]), // 结束数组或索引
      // 卖单 [[价格, 数量], ...] / Asks [[price, amount], ...]
      asks: (data.asks || []).map(item => [ // 设置 asks 字段
        parseFloat(Array.isArray(item) ? item[0] : item.price), // 调用 parseFloat
        parseFloat(Array.isArray(item) ? item[1] : item.size), // 调用 parseFloat
      ]), // 结束数组或索引
      exchangeTimestamp: parseInt(timestamp),            // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 KuCoin 成交数据
   * Normalize KuCoin trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的成交数据 / Normalized trade data
   * @private
   */
  _normalizeKuCoinTrade(message) { // 调用 _normalizeKuCoinTrade
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data
    const topic = message.topic; // 定义常量 topic

    // 从主题提取交易对 / Extract symbol from topic
    let symbol; // 定义变量 symbol
    const isSpot = topic.includes('/market/match:'); // 定义常量 isSpot
    if (isSpot) { // 条件判断 isSpot
      const kucoinSymbol = topic.split(':')[1]; // 定义常量 kucoinSymbol
      symbol = this._kucoinToStandardSymbol(kucoinSymbol); // 赋值 symbol
    } else { // 执行语句
      const futuresSymbol = topic.split(':')[1]; // 定义常量 futuresSymbol
      symbol = this._fromKuCoinFuturesSymbol(futuresSymbol); // 赋值 symbol
    } // 结束代码块

    // 获取时间戳 / Get timestamp
    const timestamp = data.time || data.ts || Date.now(); // 定义常量 timestamp

    return { // 返回结果
      exchange: 'kucoin',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      tradeId: data.tradeId || data.sequence || '',     // 成交 ID / Trade ID
      price: parseFloat(data.price || 0),               // 成交价格 / Trade price
      amount: parseFloat(data.size || data.qty || 0),   // 成交数量 / Trade amount
      side: data.side || (data.makerOrderId ? 'buy' : 'sell'), // 主动方向 / Aggressor side
      exchangeTimestamp: parseInt(timestamp),            // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 KuCoin 资金费率数据
   * Normalize KuCoin funding rate data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeKuCoinFundingRate(message) { // 调用 _normalizeKuCoinFundingRate
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data
    const topic = message.topic; // 定义常量 topic

    // 从主题提取交易对 / Extract symbol from topic
    const futuresSymbol = topic.split(':')[1]; // 定义常量 futuresSymbol
    const symbol = this._fromKuCoinFuturesSymbol(futuresSymbol); // 定义常量 symbol

    // 获取时间戳 / Get timestamp
    const timestamp = data.timestamp || data.ts || Date.now(); // 定义常量 timestamp

    return { // 返回结果
      exchange: 'kucoin',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      fundingRate: parseFloat(data.fundingRate || data.currentFundingRate || 0), // 当前资金费率 / Current funding rate
      fundingTime: data.fundingTime || null,            // 资金费率结算时间 / Funding settlement time
      nextFundingRate: data.predictedFundingFeeRate ? parseFloat(data.predictedFundingFeeRate) : null, // 预测下次资金费率 / Predicted next funding rate
      exchangeTimestamp: parseInt(timestamp),            // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 KuCoin K线数据
   * Normalize KuCoin kline data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeKuCoinKline(message) { // 调用 _normalizeKuCoinKline
    // 获取数据 / Get data
    const data = message.data; // 定义常量 data
    const topic = message.topic; // 定义常量 topic

    // 从主题提取交易对和时间间隔 / Extract symbol and interval from topic
    // 格式: /market/candles:BTC-USDT_1hour
    const topicParts = topic.split(':')[1].split('_'); // 定义常量 topicParts
    const isSpot = topic.includes('/market/candles:'); // 定义常量 isSpot

    let symbol; // 定义变量 symbol
    let interval = '1h'; // 定义变量 interval

    if (isSpot) { // 条件判断 isSpot
      symbol = this._kucoinToStandardSymbol(topicParts[0]); // 赋值 symbol
      interval = topicParts[1] || '1hour'; // 赋值 interval
    } else { // 执行语句
      symbol = this._fromKuCoinFuturesSymbol(topicParts[0]); // 赋值 symbol
      interval = topicParts[1] || '1hour'; // 赋值 interval
    } // 结束代码块

    // 获取K线数据 / Get candle data
    const candles = Array.isArray(data.candles) ? data.candles : [data]; // 定义常量 candles
    const candle = candles[0]; // 定义常量 candle

    // 获取时间戳 / Get timestamp
    const openTime = candle[0] ? parseInt(candle[0]) * 1000 : Date.now(); // 定义常量 openTime

    // 计算收盘时间 / Calculate close time
    let intervalMs = 3600000; // 默认 1 小时 / Default 1 hour
    if (interval.includes('min')) { // 条件判断 interval.includes('min')
      intervalMs = parseInt(interval) * 60 * 1000; // 赋值 intervalMs
    } else if (interval.includes('hour')) { // 执行语句
      intervalMs = parseInt(interval) * 3600 * 1000; // 赋值 intervalMs
    } else if (interval.includes('day')) { // 执行语句
      intervalMs = parseInt(interval) * 86400 * 1000; // 赋值 intervalMs
    } // 结束代码块

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeKrakenTicker(message) { // 调用 _normalizeKrakenTicker
    // 判断是现货还是合约 / Determine if spot or futures
    const isSpot = this.config.tradingType === 'spot'; // 定义常量 isSpot

    if (isSpot) { // 条件判断 isSpot
      return this._normalizeKrakenSpotTicker(message); // 返回结果
    } else { // 执行语句
      return this._normalizeKrakenFuturesTicker(message); // 返回结果
    } // 结束代码块
  } // 结束代码块

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
  _normalizeKrakenSpotTicker(message) { // 调用 _normalizeKrakenSpotTicker
    const data = message.data; // 定义常量 data
    const pair = message.pair; // 定义常量 pair
    const symbol = this._fromKrakenSpotSymbol(pair); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _normalizeKrakenFuturesTicker(message) { // 调用 _normalizeKrakenFuturesTicker
    const symbol = this._fromKrakenFuturesSymbol(message.product_id); // 定义常量 symbol

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Kraken 深度数据
   * Normalize Kraken depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeKrakenDepth(message) { // 调用 _normalizeKrakenDepth
    const isSpot = this.config.tradingType === 'spot'; // 定义常量 isSpot

    if (isSpot) { // 条件判断 isSpot
      return this._normalizeKrakenSpotDepth(message); // 返回结果
    } else { // 执行语句
      return this._normalizeKrakenFuturesDepth(message); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Kraken 现货深度数据
   * Normalize Kraken spot depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeKrakenSpotDepth(message) { // 调用 _normalizeKrakenSpotDepth
    const data = message.data; // 定义常量 data
    const pair = message.pair; // 定义常量 pair
    const symbol = this._fromKrakenSpotSymbol(pair); // 定义常量 symbol

    // Kraken 现货深度格式: { as: [[price, vol, timestamp], ...], bs: [...] }
    // as = asks, bs = bids
    const asks = (data.as || data.a || []).map(([price, amount]) => [ // 定义函数 asks
      parseFloat(price), // 调用 parseFloat
      parseFloat(amount), // 调用 parseFloat
    ]); // 结束数组或索引

    const bids = (data.bs || data.b || []).map(([price, amount]) => [ // 定义函数 bids
      parseFloat(price), // 调用 parseFloat
      parseFloat(amount), // 调用 parseFloat
    ]); // 结束数组或索引

    return { // 返回结果
      exchange: 'kraken',                    // 交易所 / Exchange
      symbol,                                 // 交易对 / Trading pair
      bids,                                   // 买单 / Bids
      asks,                                   // 卖单 / Asks
      exchangeTimestamp: Date.now(),         // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),            // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Kraken 合约深度数据
   * Normalize Kraken futures depth data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的深度数据 / Normalized depth data
   * @private
   */
  _normalizeKrakenFuturesDepth(message) { // 调用 _normalizeKrakenFuturesDepth
    const symbol = this._fromKrakenFuturesSymbol(message.product_id); // 定义常量 symbol

    // Kraken Futures 深度格式: { bids: [{price, qty}, ...], asks: [...] }
    const bids = (message.bids || []).map(item => [ // 定义函数 bids
      parseFloat(item.price || item[0]), // 调用 parseFloat
      parseFloat(item.qty || item[1]), // 调用 parseFloat
    ]); // 结束数组或索引

    const asks = (message.asks || []).map(item => [ // 定义函数 asks
      parseFloat(item.price || item[0]), // 调用 parseFloat
      parseFloat(item.qty || item[1]), // 调用 parseFloat
    ]); // 结束数组或索引

    return { // 返回结果
      exchange: 'kraken',                        // 交易所 / Exchange
      symbol,                                     // 交易对 / Trading pair
      bids,                                       // 买单 / Bids
      asks,                                       // 卖单 / Asks
      exchangeTimestamp: message.timestamp || Date.now(), // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Kraken 成交数据
   * Normalize Kraken trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeKrakenTrade(message) { // 调用 _normalizeKrakenTrade
    const isSpot = this.config.tradingType === 'spot'; // 定义常量 isSpot

    if (isSpot) { // 条件判断 isSpot
      return this._normalizeKrakenSpotTrade(message); // 返回结果
    } else { // 执行语句
      return this._normalizeKrakenFuturesTrade(message); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Kraken 现货成交数据
   * Normalize Kraken spot trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeKrakenSpotTrade(message) { // 调用 _normalizeKrakenSpotTrade
    const data = message.data; // 定义常量 data
    const pair = message.pair; // 定义常量 pair
    const symbol = this._fromKrakenSpotSymbol(pair); // 定义常量 symbol

    // Kraken 现货成交格式: [[price, volume, time, side, orderType, misc], ...]
    if (!Array.isArray(data)) { // 条件判断 !Array.isArray(data)
      return []; // 返回结果
    } // 结束代码块

    return data.map((trade, index) => ({ // 返回结果
      exchange: 'kraken',                               // 交易所 / Exchange
      symbol,                                            // 交易对 / Trading pair
      tradeId: `${Date.now()}_${index}`,                // 成交 ID / Trade ID
      price: parseFloat(trade[0]),                      // 成交价格 / Trade price
      amount: parseFloat(trade[1]),                     // 成交数量 / Trade amount
      side: trade[3] === 'b' ? 'buy' : 'sell',          // 方向 / Side
      exchangeTimestamp: parseFloat(trade[2]) * 1000,   // 时间戳 (秒->毫秒) / Timestamp
      localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
    })); // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Kraken 合约成交数据
   * Normalize Kraken futures trade data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Array} 标准化的成交数据数组 / Normalized trade data array
   * @private
   */
  _normalizeKrakenFuturesTrade(message) { // 调用 _normalizeKrakenFuturesTrade
    const symbol = this._fromKrakenFuturesSymbol(message.product_id); // 定义常量 symbol

    // 单笔成交 / Single trade
    if (message.price !== undefined) { // 条件判断 message.price !== undefined
      return [{ // 返回结果
        exchange: 'kraken',                               // 交易所 / Exchange
        symbol,                                            // 交易对 / Trading pair
        tradeId: message.uid || message.trade_id || `${Date.now()}`, // 成交 ID / Trade ID
        price: parseFloat(message.price),                 // 成交价格 / Trade price
        amount: parseFloat(message.qty || message.size),  // 成交数量 / Trade amount
        side: message.side?.toLowerCase() || 'buy',       // 方向 / Side
        exchangeTimestamp: message.time || Date.now(),    // 交易所时间戳 / Exchange timestamp
        localTimestamp: Date.now(),                        // 本地时间戳 / Local timestamp
      }]; // 执行语句
    } // 结束代码块

    // 批量成交 / Batch trades
    const trades = message.trades || []; // 定义常量 trades
    return trades.map(trade => ({ // 返回结果
      exchange: 'kraken', // 设置 exchange 字段
      symbol, // 执行语句
      tradeId: trade.uid || trade.trade_id || `${Date.now()}_${Math.random()}`, // 设置 tradeId 字段
      price: parseFloat(trade.price), // 设置 price 字段
      amount: parseFloat(trade.qty || trade.size), // 设置 amount 字段
      side: trade.side?.toLowerCase() || 'buy', // 设置 side 字段
      exchangeTimestamp: trade.time || Date.now(), // 设置 exchangeTimestamp 字段
      localTimestamp: Date.now(), // 设置 localTimestamp 字段
    })); // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Kraken 资金费率数据
   * Normalize Kraken funding rate data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的资金费率数据 / Normalized funding rate data
   * @private
   */
  _normalizeKrakenFundingRate(message) { // 调用 _normalizeKrakenFundingRate
    // Kraken 资金费率在 ticker 消息中 / Kraken funding rate is in ticker message
    const symbol = this._fromKrakenFuturesSymbol(message.product_id); // 定义常量 symbol

    return { // 返回结果
      exchange: 'kraken',                                    // 交易所 / Exchange
      symbol,                                                 // 交易对 / Trading pair
      markPrice: parseFloat(message.markPrice || 0),         // 标记价格 / Mark price
      indexPrice: parseFloat(message.indexPrice || 0),       // 指数价格 / Index price
      fundingRate: parseFloat(message.funding_rate || 0),    // 当前资金费率 / Current funding rate
      nextFundingTime: message.next_funding_rate_time,       // 下次资金费率时间 / Next funding time
      exchangeTimestamp: message.time || Date.now(),         // 交易所时间戳 / Exchange timestamp
      localTimestamp: Date.now(),                             // 本地时间戳 / Local timestamp
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化 Kraken K线数据
   * Normalize Kraken kline data
   *
   * @param {Object} message - 原始消息 / Raw message
   * @returns {Object} 标准化的K线数据 / Normalized kline data
   * @private
   */
  _normalizeKrakenKline(message) { // 调用 _normalizeKrakenKline
    const data = message.data; // 定义常量 data
    const pair = message.pair; // 定义常量 pair
    const symbol = this._fromKrakenSpotSymbol(pair); // 定义常量 symbol

    // Kraken OHLC 格式: [time, etime, open, high, low, close, vwap, volume, count]
    // 从频道名称获取间隔 / Get interval from channel name
    const channelName = message.channelName || ''; // 定义常量 channelName
    const intervalMatch = channelName.match(/ohlc-(\d+)/); // 定义常量 intervalMatch
    const intervalMinutes = intervalMatch ? parseInt(intervalMatch[1]) : 60; // 定义常量 intervalMinutes

    // 获取最新的 K 线数据 / Get latest candle data
    const candle = Array.isArray(data) ? data : [data]; // 定义常量 candle
    const latest = candle[candle.length - 1] || candle; // 定义常量 latest

    const openTime = parseFloat(latest[0] || 0) * 1000;  // 转换为毫秒 / Convert to ms
    const closeTime = parseFloat(latest[1] || 0) * 1000; // 定义常量 closeTime

    return { // 返回结果
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
    }; // 结束代码块
  } // 结束代码块

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
  _syncTime(exchange) { // 调用 _syncTime
    // 获取时间同步数据 / Get time sync data
    const sync = this.timeSync.get(exchange); // 定义常量 sync

    // 更新最后同步时间 / Update last sync time
    sync.lastSync = Date.now(); // 赋值 sync.lastSync

    // 初始偏移为 0 / Initial offset is 0
    // 后续可以通过接收到的消息动态计算 / Can be calculated dynamically from received messages
    sync.offset = 0; // 赋值 sync.offset
  } // 结束代码块

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
  _calculateUnifiedTimestamp(exchange, exchangeTimestamp) { // 调用 _calculateUnifiedTimestamp
    // 获取当前本地时间 / Get current local time
    const localTimestamp = Date.now(); // 定义常量 localTimestamp

    // 如果交易所时间戳无效，返回本地时间 / If exchange timestamp invalid, return local time
    if (!exchangeTimestamp || isNaN(exchangeTimestamp)) { // 条件判断 !exchangeTimestamp || isNaN(exchangeTimestamp)
      return localTimestamp; // 返回结果
    } // 结束代码块

    // 计算平均值作为统一时间戳 / Calculate average as unified timestamp
    // 公式: (exchangeTime + localTime) / 2
    // 这样可以减少单方面时间误差的影响 / This reduces the impact of one-sided time errors
    const unifiedTimestamp = Math.round((exchangeTimestamp + localTimestamp) / 2); // 定义常量 unifiedTimestamp

    return unifiedTimestamp; // 返回结果
  } // 结束代码块

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
  async _storeToRedisHash(keyPrefix, field, data) { // 执行语句
    // 检查 Redis 连接 / Check Redis connection
    if (!this.redis) { // 条件判断 !this.redis
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 构建完整键 / Build full key
      const key = `${keyPrefix}${data.symbol}`; // 定义常量 key

      // 存储为 JSON 字符串 / Store as JSON string
      await this.redis.hset(key, field, JSON.stringify(data)); // 等待异步结果

    } catch (error) { // 执行语句
      // 记录错误但不抛出 / Log error but don't throw
      console.error(`${this.logPrefix} Redis Hash 存储失败 / Redis Hash store failed:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 存储数据到 Redis Stream
   * Store data to Redis Stream
   *
   * @param {string} streamKey - 流键 / Stream key
   * @param {Object} data - 数据对象 / Data object
   * @private
   */
  async _storeToRedisStream(streamKey, data) { // 执行语句
    // 检查 Redis 连接 / Check Redis connection
    if (!this.redis) { // 条件判断 !this.redis
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 构建流条目数据 / Build stream entry data
      const entries = []; // 定义常量 entries

      // 将对象转换为键值对数组 / Convert object to key-value pairs
      for (const [key, value] of Object.entries(data)) { // 循环 const [key, value] of Object.entries(data)
        entries.push(key, typeof value === 'object' ? JSON.stringify(value) : String(value)); // 调用 entries.push
      } // 结束代码块

      // 添加到流，使用 MAXLEN 限制长度 / Add to stream with MAXLEN limit
      await this.redis.xadd( // 等待异步结果
        streamKey,                              // 流键 / Stream key
        'MAXLEN',                               // MAXLEN 命令 / MAXLEN command
        this.config.stream.trimApprox ? '~' : '', // 近似裁剪 / Approximate trimming
        this.config.stream.maxLen,              // 最大长度 / Maximum length
        '*',                                    // 自动生成 ID / Auto-generate ID
        ...entries                              // 键值对 / Key-value pairs
      ); // 结束调用或参数

    } catch (error) { // 执行语句
      // 记录错误但不抛出 / Log error but don't throw
      console.error(`${this.logPrefix} Redis Stream 存储失败 / Redis Stream store failed:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 发布数据到 Redis Channel
   * Publish data to Redis Channel
   *
   * @param {string} dataType - 数据类型 / Data type
   * @param {Object} data - 数据对象 / Data object
   * @private
   */
  async _publishToChannel(dataType, data) { // 执行语句
    // 检查 Redis 发布客户端 / Check Redis publish client
    if (!this.redisPub) { // 条件判断 !this.redisPub
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 构建发布消息 / Build publish message
      const message = JSON.stringify({ // 定义常量 message
        type: dataType,         // 数据类型 / Data type
        data,                   // 数据内容 / Data content
        timestamp: Date.now(),  // 发布时间戳 / Publish timestamp
      }); // 结束代码块

      // 发布到 channel / Publish to channel
      await this.redisPub.publish(REDIS_KEYS.CHANNEL, message); // 等待异步结果

      // 增加发布计数 / Increment publish count
      this.stats.messagesPublished++; // 访问 stats

    } catch (error) { // 执行语句
      // 记录错误但不抛出 / Log error but don't throw
      console.error(`${this.logPrefix} Redis 发布失败 / Redis publish failed:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出数据类型常量 / Export data type constants
export { DATA_TYPES }; // 导出命名成员

// 导出 Redis 键常量 / Export Redis key constants
export { REDIS_KEYS }; // 导出命名成员

// 导出默认类 / Export default class
export default MarketDataEngine; // 默认导出
