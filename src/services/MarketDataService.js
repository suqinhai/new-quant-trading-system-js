/**
 * 共享行情服务
 * Shared Market Data Service
 *
 * 作为独立进程运行，通过 Redis Pub/Sub 分发行情数据给各策略容器
 * Runs as an independent process, distributes market data to strategy containers via Redis Pub/Sub
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入 Redis 客户端 / Import Redis client
import Redis from 'ioredis'; // 导入模块 ioredis

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from '../marketdata/MarketDataEngine.js'; // 导入模块 ../marketdata/MarketDataEngine.js

// 导入交易所工厂 / Import exchange factory
import { ExchangeFactory } from '../exchange/ExchangeFactory.js'; // 导入模块 ../exchange/ExchangeFactory.js

// 导入配置加载器 / Import configuration loader
import { loadConfig } from '../../config/index.js'; // 导入模块 ../../config/index.js

const SYSTEM_CONFIG = loadConfig(); // 定义常量 SYSTEM_CONFIG

/**
 * 获取已配置 API 密钥的交易所列表
 * Get list of exchanges with configured API keys
 * @returns {string[]} 已配置的交易所列表 / List of configured exchanges
 */
function getConfiguredExchanges() { // 定义函数 getConfiguredExchanges
  const config = loadConfig(); // 定义常量 config
  const exchangeConfig = config.exchange || {}; // 定义常量 exchangeConfig
  const configuredExchanges = []; // 定义常量 configuredExchanges
  const enabledExchanges = []; // 定义常量 enabledExchanges

  // 支持的交易所列表 / Supported exchanges list
  const supportedExchanges = ['binance', 'okx', 'gate', 'bybit', 'bitget', 'kucoin', 'kraken', 'deribit']; // 定义常量 supportedExchanges

  for (const exchange of supportedExchanges) { // 循环 const exchange of supportedExchanges
    const exchangeSettings = exchangeConfig[exchange]; // 定义常量 exchangeSettings
    // 收集启用的交易所 / Collect enabled exchanges
    if (exchangeSettings && exchangeSettings.enabled !== false) { // 条件判断 exchangeSettings && exchangeSettings.enabled !== false
      enabledExchanges.push(exchange); // 调用 enabledExchanges.push
    } // 结束代码块
    // 检查是否配置了 apiKey / Check if apiKey is configured
    if (exchangeSettings && exchangeSettings.apiKey) { // 条件判断 exchangeSettings && exchangeSettings.apiKey
      configuredExchanges.push(exchange); // 调用 configuredExchanges.push
    } // 结束代码块
  } // 结束代码块

  // 如果没有配置 API Key，回退到启用的交易所 / If no API keys, fall back to enabled exchanges
  if (configuredExchanges.length === 0 && enabledExchanges.length > 0) { // 条件判断 configuredExchanges.length === 0 && enabledExchanges.length > 0
    console.warn('[MarketDataService] 未检测到已配置的 API Key，使用已启用交易所列表 / No API keys detected, using enabled exchanges'); // 控制台输出
    return enabledExchanges; // 返回结果
  } // 结束代码块

  // 如果没有配置任何交易所，返回默认列表 / If no exchange configured, return default list
  if (configuredExchanges.length === 0) { // 条件判断 configuredExchanges.length === 0
    console.warn('[MarketDataService] 未检测到已配置的交易所，使用默认列表 / No configured exchanges detected, using defaults'); // 控制台输出
    return ['binance', 'okx', 'bybit']; // 返回结果
  } // 结束代码块

  console.log(`[MarketDataService] 检测到已配置的交易所 / Detected configured exchanges: ${configuredExchanges.join(', ')}`); // 控制台输出
  return configuredExchanges; // 返回结果
} // 结束代码块

/**
 * Redis 键前缀配置
 * Redis key prefix configuration
 */
const REDIS_KEYS = { // 定义常量 REDIS_KEYS
  // 行情数据频道前缀 / Market data channel prefix
  TICKER: 'market:ticker', // TICKER权限
  DEPTH: 'market:depth', // DEPTH权限
  TRADE: 'market:trade', // 交易权限
  FUNDING: 'market:funding', // 资金费率权限
  KLINE: 'market:kline', // KLINE权限
  UNIFIED_CHANNEL: 'market_data', // UNIFIEDCHANNEL

  // 服务状态键 / Service status key
  SERVICE_STATUS: 'market:service:status', // SERVICE状态权限
  SERVICE_HEARTBEAT: 'market:service:heartbeat', // SERVICEHEARTBEAT权限

  // 订阅列表 / Subscription list
  SUBSCRIPTIONS: 'market:subscriptions', // SUBSCRIPTIONS权限
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

  // 交易所列表 (优先环境变量，否则动态获取已配置的交易所)
  // Exchange list (prefer env var, otherwise dynamically get configured exchanges)
  exchanges: process.env.MARKET_DATA_EXCHANGES // Exchange list (prefer env var, otherwise dynamically get configured exchanges)
    ? process.env.MARKET_DATA_EXCHANGES.split(',') // 读取环境变量 MARKET_DATA_EXCHANGES
    : getConfiguredExchanges(), // 执行语句

  // 交易所配置映射 / Exchange config map
  exchangeConfigs: SYSTEM_CONFIG.exchange || {}, // 交易所配置映射

  // 交易类型 (swap = 永续合约) / Trading type (swap = perpetual)
  tradingType: process.env.TRADING_TYPE || 'swap', // 交易类型 (swap = 永续合约)

  // Cache configuration
  cache: SYSTEM_CONFIG.marketData?.cache || {}, // Cache configuration

  // 心跳间隔 (毫秒) / Heartbeat interval (ms)
  heartbeatInterval: 5000, // 心跳间隔 (毫秒)

  // 是否订阅所有交易对 / Whether to subscribe to all symbols
  subscribeAll: process.env.SUBSCRIBE_ALL !== 'false', // 是否订阅所有交易对

  // 指定订阅的交易对 (逗号分隔) / Specified symbols to subscribe (comma separated)
  symbols: process.env.MARKET_DATA_SYMBOLS ? process.env.MARKET_DATA_SYMBOLS.split(',') : [], // 指定订阅的交易对 (逗号分隔)
}; // 结束代码块

/**
 * 共享行情服务类
 * Shared Market Data Service Class
 *
 * 功能 / Features:
 * 1. 启动 MarketDataEngine 连接所有交易所 WebSocket
 * 2. 将行情数据通过 Redis Pub/Sub 分发
 * 3. 提供服务状态监控和心跳
 * 4. 支持动态订阅管理
 */
export class MarketDataService extends EventEmitter { // 导出类 MarketDataService
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
      redis: { ...DEFAULT_CONFIG.redis, ...config.redis }, // redis
      exchanges: config.exchanges || DEFAULT_CONFIG.exchanges, // 交易所
      exchangeConfigs: config.exchangeConfigs || DEFAULT_CONFIG.exchangeConfigs, // 交易所配置
      tradingType: config.tradingType || DEFAULT_CONFIG.tradingType, // 交易类型
      cache: { ...DEFAULT_CONFIG.cache, ...config.cache }, // cache
      heartbeatInterval: config.heartbeatInterval || DEFAULT_CONFIG.heartbeatInterval, // heartbeat间隔
      subscribeAll: config.subscribeAll ?? DEFAULT_CONFIG.subscribeAll, // subscribeAll
      symbols: config.symbols || DEFAULT_CONFIG.symbols, // 交易对列表
    }; // 结束代码块

    // 行情引擎实例 / Market data engine instance
    this.marketDataEngine = null; // 设置 marketDataEngine

    // Redis 客户端 / Redis client
    this.redis = null; // 设置 redis

    // Redis 发布客户端 / Redis publish client
    this.redisPub = null; // 设置 redisPub

    // Redis 订阅客户端 (用于接收订阅请求) / Redis subscribe client (for receiving subscription requests)
    this.redisSub = null; // 设置 redisSub

    // 心跳定时器 / Heartbeat timer
    this.heartbeatTimer = null; // 设置 heartbeatTimer

    // 运行状态 / Running status
    this.running = false; // 设置 running

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      startTime: null, // 启动时间
      tickersPublished: 0, // tickersPublished
      depthsPublished: 0, // depthsPublished
      tradesPublished: 0, // 成交Published
      fundingsPublished: 0, // fundingsPublished
      klinesPublished: 0, // klinesPublished
      errors: 0, // 错误列表
    }; // 结束代码块

    // 日志前缀 / Log prefix
    this.logPrefix = '[MarketDataService]'; // 设置 logPrefix
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

    console.log(`${this.logPrefix} 正在启动共享行情服务... / Starting shared market data service...`); // 控制台输出
    console.log(`${this.logPrefix} 配置 / Config:`, { // 控制台输出
      exchanges: this.config.exchanges, // 交易所
      tradingType: this.config.tradingType, // 交易类型
      subscribeAll: this.config.subscribeAll, // subscribeAll
      symbolsCount: this.config.symbols.length, // 交易对列表数量
    }); // 结束代码块

    try { // 尝试执行
      // 1. 初始化 Redis 连接 / Initialize Redis connection
      await this._initRedis(); // 等待异步结果

      // 2. 初始化行情引擎 / Initialize market data engine
      await this._initMarketDataEngine(); // 等待异步结果

      // 3. 绑定事件处理 / Bind event handlers
      this._bindEventHandlers(); // 调用 _bindEventHandlers

      // 4. Start market data engine
      await this.marketDataEngine.start(); // 等待异步结果

      // 5. Start heartbeat
      this._startHeartbeat(); // 调用 _startHeartbeat

      // 6. Subscribe to symbols
      await this._subscribeSymbols(); // 等待异步结果

      // 7. Start subscription request listener
      await this._startSubscriptionListener(); // 等待异步结果

      // 更新状态 / Update status
      this.running = true; // 设置 running
      this.stats.startTime = Date.now(); // 访问 stats

      // 发布服务状态 / Publish service status
      await this._publishServiceStatus('running'); // 等待异步结果

      console.log(`${this.logPrefix} 共享行情服务已启动 / Shared market data service started`); // 控制台输出
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
      // 1. 停止心跳 / Stop heartbeat
      if (this.heartbeatTimer) { // 条件判断 this.heartbeatTimer
        clearInterval(this.heartbeatTimer); // 调用 clearInterval
        this.heartbeatTimer = null; // 设置 heartbeatTimer
      } // 结束代码块

      // 2. 发布停止状态 / Publish stopping status
      await this._publishServiceStatus('stopped'); // 等待异步结果

      // 3. 停止行情引擎 / Stop market data engine
      if (this.marketDataEngine) { // 条件判断 this.marketDataEngine
        await this.marketDataEngine.stop(); // 等待异步结果
      } // 结束代码块

      // 4. 关闭 Redis 连接 / Close Redis connections
      if (this.redisSub) { // 条件判断 this.redisSub
        this.redisSub.disconnect(); // 访问 redisSub
      } // 结束代码块
      if (this.redisPub) { // 条件判断 this.redisPub
        this.redisPub.disconnect(); // 访问 redisPub
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
    const engineStats = this.marketDataEngine?.getStats() || {}; // 定义常量 engineStats

    return { // 返回结果
      running: this.running, // running
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0, // uptime
      exchanges: this.config.exchanges, // 交易所
      stats: { // stats
        ...this.stats, // 展开对象或数组
        ...engineStats, // 展开对象或数组
      }, // 结束代码块
      connections: this.marketDataEngine?.getConnectionStatus() || {}, // connections
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
      host: this.config.redis.host, // 主机
      port: this.config.redis.port, // 端口
      password: this.config.redis.password, // 密码
      db: this.config.redis.db, // db
      retryStrategy: (times) => Math.min(times * 100, 3000), // 重试策略
    }; // 结束代码块

    // 主连接 (用于状态存储) / Main connection (for status storage)
    this.redis = new Redis(redisConfig); // 设置 redis

    // 发布连接 / Publish connection
    this.redisPub = new Redis(redisConfig); // 设置 redisPub

    // 订阅连接 / Subscribe connection
    this.redisSub = new Redis(redisConfig); // 设置 redisSub

    // 等待连接 / Wait for connection
    await Promise.all([ // 等待异步结果
      new Promise((resolve, reject) => { // 创建 Promise 实例
        this.redis.once('ready', resolve); // 访问 redis
        this.redis.once('error', reject); // 访问 redis
      }), // 结束代码块
      new Promise((resolve, reject) => { // 创建 Promise 实例
        this.redisPub.once('ready', resolve); // 访问 redisPub
        this.redisPub.once('error', reject); // 访问 redisPub
      }), // 结束代码块
      new Promise((resolve, reject) => { // 创建 Promise 实例
        this.redisSub.once('ready', resolve); // 访问 redisSub
        this.redisSub.once('error', reject); // 访问 redisSub
      }), // 结束代码块
    ]); // 结束数组或索引

    console.log(`${this.logPrefix} Redis 连接成功 / Redis connected`); // 控制台输出
  } // 结束代码块

  /**
   * 初始化行情引擎
   * Initialize market data engine
   *
   * @private
   */
  async _initMarketDataEngine() { // 执行语句
    console.log(`${this.logPrefix} 正在初始化行情引擎... / Initializing market data engine...`); // 控制台输出

      this.marketDataEngine = new MarketDataEngine({ // 设置 marketDataEngine
        // 启用 WebSocket / Enable WebSocket
        enableWebSocket: true, // 启用 WebSocket

        // 禁用内部 Redis (我们自己处理发布) / Disable internal Redis (we handle publishing ourselves)
        enableRedis: false, // 禁用内部 Redis (我们自己处理发布)

        // 交易所列表 / Exchange list
        exchanges: this.config.exchanges, // 交易所列表

        // 交易所配置 / Exchange configs
        exchangeConfigs: this.config.exchangeConfigs, // 交易所配置

        // 交易类型 / Trading type
        tradingType: this.config.tradingType, // 交易类型

        // Cache configuration
        cache: this.config.cache, // Cache configuration
      }); // 结束代码块

    console.log(`${this.logPrefix} 行情引擎初始化完成 / Market data engine initialized`); // 控制台输出
  } // 结束代码块

  /**
   * 绑定事件处理器
   * Bind event handlers
   *
   * @private
   */
  _bindEventHandlers() { // 调用 _bindEventHandlers
    // 处理 ticker 数据 / Handle ticker data
    this.marketDataEngine.on('ticker', (ticker) => { // 访问 marketDataEngine
      this._publishMarketData('ticker', ticker); // 调用 _publishMarketData
    }); // 结束代码块

    // 处理 depth 数据 / Handle depth data
    this.marketDataEngine.on('depth', (depth) => { // 访问 marketDataEngine
      this._publishMarketData('depth', depth); // 调用 _publishMarketData
    }); // 结束代码块

    // 处理 trade 数据 / Handle trade data
    this.marketDataEngine.on('trade', (trade) => { // 访问 marketDataEngine
      this._publishMarketData('trade', trade); // 调用 _publishMarketData
    }); // 结束代码块

    // 处理 funding rate 数据 / Handle funding rate data
    this.marketDataEngine.on('fundingRate', (funding) => { // 访问 marketDataEngine
      this._publishMarketData('fundingRate', funding); // 调用 _publishMarketData
    }); // 结束代码块

    // 处理 kline 数据 / Handle kline data
    // MarketDataEngine emits 'candle' events for klines.
    this.marketDataEngine.on('candle', (kline) => { // 访问 marketDataEngine
      this._publishMarketData('kline', kline); // 调用 _publishMarketData
    }); // 结束代码块

    // 处理错误 / Handle errors
    this.marketDataEngine.on('error', (error) => { // 访问 marketDataEngine
      console.error(`${this.logPrefix} 行情引擎错误 / Market data engine error:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
      this.emit('error', error); // 调用 emit
    }); // 结束代码块

    // 处理重连 / Handle reconnection
    this.marketDataEngine.on('reconnected', (exchange) => { // 访问 marketDataEngine
      console.log(`${this.logPrefix} 交易所重连成功 / Exchange reconnected: ${exchange}`); // 控制台输出
      this.emit('reconnected', exchange); // 调用 emit
    }); // 结束代码块
  } // 结束代码块

  /**
   * 发布行情数据到 Redis
   * Publish market data to Redis
   *
   * @param {string} dataType - 数据类型 / Data type
   * @param {Object} data - 数据 / Data
   * @private
   */
  async _publishMarketData(dataType, data) { // 执行语句
    try { // 尝试执行
      const normalizedType = dataType === 'fundingRate' ? 'funding' : dataType; // 定义常量 normalizedType
      const channelPrefix = REDIS_KEYS[normalizedType.toUpperCase()]; // 定义常量 channelPrefix
      if (!channelPrefix) { // 条件判断 !channelPrefix
        console.error(`${this.logPrefix} Unknown data type for publish: ${dataType}`); // 控制台输出
        return; // 返回结果
      } // 结束代码块
      // 构建频道名 / Build channel name
      const exchange = data.exchange || 'unknown'; // 定义常量 exchange
      // 标准化交易对格式，移除 :USDT 后缀 / Normalize symbol format, remove :USDT suffix
      const symbol = (data.symbol || 'unknown').replace(/:USDT$/, ''); // 定义常量 symbol
      const channel = `${channelPrefix}:${exchange}:${symbol}`; // 定义常量 channel

      // 添加时间戳 / Add timestamp
      const message = JSON.stringify({ // 定义常量 message
        ...data, // 展开对象或数组
        publishedAt: Date.now(), // publishedAt
      }); // 结束代码块

      // 发布到 Redis / Publish to Redis
      await this.redisPub.publish(channel, message); // 等待异步结果

      const unifiedMessage = JSON.stringify({ // 定义常量 unifiedMessage
        type: dataType === 'funding' ? 'fundingRate' : dataType, // 类型
        data, // 执行语句
        timestamp: Date.now(), // 时间戳
      }); // 结束代码块
      await this.redisPub.publish(REDIS_KEYS.UNIFIED_CHANNEL, unifiedMessage); // 等待异步结果

      // 同时发布到通用频道 (用于广播) / Also publish to general channel (for broadcast)
      const generalChannel = `${channelPrefix}:${exchange}:*`; // 定义常量 generalChannel
      // await this.redisPub.publish(generalChannel, message);

      // 更新统计 / Update stats
      const statsKey = `${normalizedType}sPublished`; // 定义常量 statsKey
      if (this.stats[statsKey] !== undefined) { // 条件判断 this.stats[statsKey] !== undefined
        this.stats[statsKey]++; // 访问 stats
      } // 结束代码块

    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 发布数据失败 / Failed to publish data:`, error.message); // 控制台输出
      this.stats.errors++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 订阅交易对
   * Subscribe to symbols
   *
   * @private
   */
  async _subscribeSymbols() { // 执行语句
    console.log(`${this.logPrefix} 正在订阅交易对... / Subscribing to symbols...`); // 控制台输出

    // 如果指定了交易对，只订阅指定的 / If symbols specified, subscribe only to those
    if (this.config.symbols.length > 0) { // 条件判断 this.config.symbols.length > 0
      for (const exchange of this.config.exchanges) { // 循环 const exchange of this.config.exchanges
        for (const symbol of this.config.symbols) { // 循环 const symbol of this.config.symbols
          await this.marketDataEngine.subscribe(symbol, ['ticker', 'depth'], [exchange]); // 等待异步结果
        } // 结束代码块
      } // 结束代码块
      console.log(`${this.logPrefix} 已订阅 ${this.config.symbols.length} 个指定交易对 / Subscribed to ${this.config.symbols.length} specified symbols`); // 控制台输出
      return; // 返回结果
    } // 结束代码块

    // 订阅所有交易对 (通过 subscribeAll) / Subscribe to all symbols (via subscribeAll)
    if (this.config.subscribeAll) { // 条件判断 this.config.subscribeAll
      for (const exchange of this.config.exchanges) { // 循环 const exchange of this.config.exchanges
        try { // 尝试执行
          // 获取交易所支持的交易对 / Get exchange supported symbols
          const exchangeInstance = ExchangeFactory.getInstance(exchange, { // 定义常量 exchangeInstance
            defaultType: this.config.tradingType, // 默认类型
          }); // 结束代码块

          // 连接交易所获取市场信息 / Connect exchange to get market info
          if (!exchangeInstance.connected) { // 条件判断 !exchangeInstance.connected
            await exchangeInstance.connect(); // 等待异步结果
          } // 结束代码块

            const markets = exchangeInstance.markets || {}; // 定义常量 markets
            const symbols = Object.keys(markets).filter((s) => { // 定义函数 symbols
              const market = markets[s]; // 定义常量 market
              const tradingType = (this.config.tradingType || '').toLowerCase(); // 定义常量 tradingType
              // 根据交易类型筛选 / Filter by trading type
              if (tradingType === 'spot') { // 条件判断 tradingType === 'spot'
                return market.type === 'spot' || market.spot === true; // 返回结果
              } // 结束代码块
              if (tradingType === 'future' || tradingType === 'futures') { // 条件判断 tradingType === 'future' || tradingType === 'futures'
                return market.type === 'future' || market.future === true; // 返回结果
              } // 结束代码块
              if (tradingType === 'option' || tradingType === 'options') { // 条件判断 tradingType === 'option' || tradingType === 'options'
                return market.type === 'option' || market.option === true; // 返回结果
              } // 结束代码块
              // 默认订阅永续合约 / Default to perpetual swaps
              return market.type === 'swap' || market.swap === true; // 返回结果
            }); // 结束代码块

          console.log(`${this.logPrefix} ${exchange} 发现 ${symbols.length} 个交易对 / ${exchange} found ${symbols.length} symbols`); // 控制台输出

          // 订阅 ticker 和 depth / Subscribe to ticker and depth
          for (const symbol of symbols.slice(0, 100)) { // 限制前 100 个 / Limit to first 100
            await this.marketDataEngine.subscribe(symbol, ['ticker'], [exchange]); // 等待异步结果
          } // 结束代码块

        } catch (error) { // 执行语句
          console.error(`${this.logPrefix} 订阅 ${exchange} 交易对失败 / Failed to subscribe ${exchange} symbols:`, error.message); // 控制台输出
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动心跳
   * Start heartbeat
   *
   * @private
   */
  _startHeartbeat() { // 调用 _startHeartbeat
    const publishHeartbeat = async () => { // 定义函数 publishHeartbeat
      try { // 尝试执行
        const status = this.getStatus(); // 定义常量 status
        await this.redis.set( // 等待异步结果
          REDIS_KEYS.SERVICE_HEARTBEAT, // 执行语句
          JSON.stringify({ // 调用 JSON.stringify
            timestamp: Date.now(), // 时间戳
            status: 'alive', // 状态
            uptime: status.uptime, // uptime
            stats: status.stats, // stats
          }), // 结束代码块
          'EX', // 执行语句
          30 // 30s expiry / 30 seconds expiry
        ); // 结束调用或参数
      } catch (error) { // 执行语句
        console.error(`${this.logPrefix} Heartbeat update failed:`, error.message); // 控制台输出
      } // 结束代码块
    }; // 结束代码块

    // Publish an initial heartbeat to avoid startup gaps.
    publishHeartbeat(); // 调用 publishHeartbeat

    this.heartbeatTimer = setInterval(publishHeartbeat, this.config.heartbeatInterval); // 设置 heartbeatTimer
  } // 结束代码块

  /**
   * 启动订阅请求监听
   * Start subscription request listener
   *
   * @private
   */
  async _startSubscriptionListener() { // 执行语句
    // 订阅请求频道 / Subscribe to request channel
    const requestChannel = 'market:subscribe:request'; // 定义常量 requestChannel

    await this.redisSub.subscribe(requestChannel); // 等待异步结果

    this.redisSub.on('message', async (channel, message) => { // 访问 redisSub
      if (channel !== requestChannel) return; // 条件判断 channel !== requestChannel

      try { // 尝试执行
        const request = JSON.parse(message); // 定义常量 request
        const { action, exchange, symbol, dataTypes } = request; // 解构赋值

        if (action === 'subscribe') { // 条件判断 action === 'subscribe'
          await this.marketDataEngine.subscribe(symbol, dataTypes || ['ticker'], [exchange]); // 等待异步结果
          console.log(`${this.logPrefix} 动态订阅 / Dynamic subscribe: ${exchange}:${symbol}`); // 控制台输出
        } else if (action === 'unsubscribe') { // 执行语句
          await this.marketDataEngine.unsubscribe(symbol, dataTypes || ['ticker'], [exchange]); // 等待异步结果
          console.log(`${this.logPrefix} 取消订阅 / Unsubscribe: ${exchange}:${symbol}`); // 控制台输出
        } // 结束代码块
      } catch (error) { // 执行语句
        console.error(`${this.logPrefix} 处理订阅请求失败 / Failed to handle subscription request:`, error.message); // 控制台输出
      } // 结束代码块
    }); // 结束代码块

    console.log(`${this.logPrefix} 订阅请求监听已启动 / Subscription request listener started`); // 控制台输出
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
          timestamp: Date.now(), // 时间戳
          exchanges: this.config.exchanges, // 交易所
          pid: process.pid, // pid
        }), // 结束代码块
        'EX', // 执行语句
        60 // 60秒过期 / 60 seconds expiry
      ); // 结束调用或参数
    } catch (error) { // 执行语句
      console.error(`${this.logPrefix} 发布服务状态失败 / Failed to publish service status:`, error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出默认实例创建函数 / Export default instance creation function
export function createMarketDataService(config) { // 导出函数 createMarketDataService
  return new MarketDataService(config); // 返回结果
} // 结束代码块

export default MarketDataService; // 默认导出
