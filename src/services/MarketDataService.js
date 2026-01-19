/**
 * 共享行情服务
 * Shared Market Data Service
 *
 * 作为独立进程运行，通过 Redis Pub/Sub 分发行情数据给各策略容器
 * Runs as an independent process, distributes market data to strategy containers via Redis Pub/Sub
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入 Redis 客户端 / Import Redis client
import Redis from 'ioredis';

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from '../marketdata/MarketDataEngine.js';

// 导入交易所工厂 / Import exchange factory
import { ExchangeFactory } from '../exchange/ExchangeFactory.js';

// 导入配置加载器 / Import configuration loader
import { loadConfig } from '../../config/index.js';

const SYSTEM_CONFIG = loadConfig();

/**
 * 获取已配置 API 密钥的交易所列表
 * Get list of exchanges with configured API keys
 * @returns {string[]} 已配置的交易所列表 / List of configured exchanges
 */
function getConfiguredExchanges() {
  const config = loadConfig();
  const exchangeConfig = config.exchange || {};
  const configuredExchanges = [];

  // 支持的交易所列表 / Supported exchanges list
  const supportedExchanges = ['binance', 'okx', 'gate', 'bybit', 'bitget', 'kucoin', 'kraken', 'deribit'];

  for (const exchange of supportedExchanges) {
    const exchangeSettings = exchangeConfig[exchange];
    // 检查是否配置了 apiKey / Check if apiKey is configured
    if (exchangeSettings && exchangeSettings.apiKey) {
      configuredExchanges.push(exchange);
    }
  }

  // 如果没有配置任何交易所，返回默认列表 / If no exchange configured, return default list
  if (configuredExchanges.length === 0) {
    console.warn('[MarketDataService] 未检测到已配置的交易所，使用默认列表 / No configured exchanges detected, using defaults');
    return ['binance'];
  }

  console.log(`[MarketDataService] 检测到已配置的交易所 / Detected configured exchanges: ${configuredExchanges.join(', ')}`);
  return configuredExchanges;
}

/**
 * Redis 键前缀配置
 * Redis key prefix configuration
 */
const REDIS_KEYS = {
  // 行情数据频道前缀 / Market data channel prefix
  TICKER: 'market:ticker',
  DEPTH: 'market:depth',
  TRADE: 'market:trade',
  FUNDING: 'market:funding',
  KLINE: 'market:kline',
  UNIFIED_CHANNEL: 'market_data',

  // 服务状态键 / Service status key
  SERVICE_STATUS: 'market:service:status',
  SERVICE_HEARTBEAT: 'market:service:heartbeat',

  // 订阅列表 / Subscription list
  SUBSCRIPTIONS: 'market:subscriptions',
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

  // 交易所列表 (优先环境变量，否则动态获取已配置的交易所)
  // Exchange list (prefer env var, otherwise dynamically get configured exchanges)
  exchanges: process.env.MARKET_DATA_EXCHANGES
    ? process.env.MARKET_DATA_EXCHANGES.split(',')
    : getConfiguredExchanges(),

  // 交易类型 (swap = 永续合约) / Trading type (swap = perpetual)
  tradingType: process.env.TRADING_TYPE || 'swap',

  // Cache configuration
  cache: SYSTEM_CONFIG.marketData?.cache || {},

  // 心跳间隔 (毫秒) / Heartbeat interval (ms)
  heartbeatInterval: 5000,

  // 是否订阅所有交易对 / Whether to subscribe to all symbols
  subscribeAll: process.env.SUBSCRIBE_ALL !== 'false',

  // 指定订阅的交易对 (逗号分隔) / Specified symbols to subscribe (comma separated)
  symbols: process.env.MARKET_DATA_SYMBOLS ? process.env.MARKET_DATA_SYMBOLS.split(',') : [],
};

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
export class MarketDataService extends EventEmitter {
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
      exchanges: config.exchanges || DEFAULT_CONFIG.exchanges,
      tradingType: config.tradingType || DEFAULT_CONFIG.tradingType,
      cache: { ...DEFAULT_CONFIG.cache, ...config.cache },
      heartbeatInterval: config.heartbeatInterval || DEFAULT_CONFIG.heartbeatInterval,
      subscribeAll: config.subscribeAll ?? DEFAULT_CONFIG.subscribeAll,
      symbols: config.symbols || DEFAULT_CONFIG.symbols,
    };

    // 行情引擎实例 / Market data engine instance
    this.marketDataEngine = null;

    // Redis 客户端 / Redis client
    this.redis = null;

    // Redis 发布客户端 / Redis publish client
    this.redisPub = null;

    // Redis 订阅客户端 (用于接收订阅请求) / Redis subscribe client (for receiving subscription requests)
    this.redisSub = null;

    // 心跳定时器 / Heartbeat timer
    this.heartbeatTimer = null;

    // 运行状态 / Running status
    this.running = false;

    // 统计信息 / Statistics
    this.stats = {
      startTime: null,
      tickersPublished: 0,
      depthsPublished: 0,
      tradesPublished: 0,
      fundingsPublished: 0,
      klinesPublished: 0,
      errors: 0,
    };

    // 日志前缀 / Log prefix
    this.logPrefix = '[MarketDataService]';
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

    console.log(`${this.logPrefix} 正在启动共享行情服务... / Starting shared market data service...`);
    console.log(`${this.logPrefix} 配置 / Config:`, {
      exchanges: this.config.exchanges,
      tradingType: this.config.tradingType,
      subscribeAll: this.config.subscribeAll,
      symbolsCount: this.config.symbols.length,
    });

    try {
      // 1. 初始化 Redis 连接 / Initialize Redis connection
      await this._initRedis();

      // 2. 初始化行情引擎 / Initialize market data engine
      await this._initMarketDataEngine();

      // 3. 绑定事件处理 / Bind event handlers
      this._bindEventHandlers();

      // 4. Start market data engine
      await this.marketDataEngine.start();

      // 5. Start heartbeat
      this._startHeartbeat();

      // 6. Subscribe to symbols
      await this._subscribeSymbols();

      // 7. Start subscription request listener
      await this._startSubscriptionListener();

      // 更新状态 / Update status
      this.running = true;
      this.stats.startTime = Date.now();

      // 发布服务状态 / Publish service status
      await this._publishServiceStatus('running');

      console.log(`${this.logPrefix} 共享行情服务已启动 / Shared market data service started`);
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
      // 1. 停止心跳 / Stop heartbeat
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      // 2. 发布停止状态 / Publish stopping status
      await this._publishServiceStatus('stopped');

      // 3. 停止行情引擎 / Stop market data engine
      if (this.marketDataEngine) {
        await this.marketDataEngine.stop();
      }

      // 4. 关闭 Redis 连接 / Close Redis connections
      if (this.redisSub) {
        this.redisSub.disconnect();
      }
      if (this.redisPub) {
        this.redisPub.disconnect();
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
    const engineStats = this.marketDataEngine?.getStats() || {};

    return {
      running: this.running,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      exchanges: this.config.exchanges,
      stats: {
        ...this.stats,
        ...engineStats,
      },
      connections: this.marketDataEngine?.getConnectionStatus() || {},
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

    // 主连接 (用于状态存储) / Main connection (for status storage)
    this.redis = new Redis(redisConfig);

    // 发布连接 / Publish connection
    this.redisPub = new Redis(redisConfig);

    // 订阅连接 / Subscribe connection
    this.redisSub = new Redis(redisConfig);

    // 等待连接 / Wait for connection
    await Promise.all([
      new Promise((resolve, reject) => {
        this.redis.once('ready', resolve);
        this.redis.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        this.redisPub.once('ready', resolve);
        this.redisPub.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        this.redisSub.once('ready', resolve);
        this.redisSub.once('error', reject);
      }),
    ]);

    console.log(`${this.logPrefix} Redis 连接成功 / Redis connected`);
  }

  /**
   * 初始化行情引擎
   * Initialize market data engine
   *
   * @private
   */
  async _initMarketDataEngine() {
    console.log(`${this.logPrefix} 正在初始化行情引擎... / Initializing market data engine...`);

    this.marketDataEngine = new MarketDataEngine({
      // 启用 WebSocket / Enable WebSocket
      enableWebSocket: true,

      // 禁用内部 Redis (我们自己处理发布) / Disable internal Redis (we handle publishing ourselves)
      enableRedis: false,

      // 交易所列表 / Exchange list
      exchanges: this.config.exchanges,

      // 交易类型 / Trading type
      tradingType: this.config.tradingType,

      // Cache configuration
      cache: this.config.cache,
    });

    console.log(`${this.logPrefix} 行情引擎初始化完成 / Market data engine initialized`);
  }

  /**
   * 绑定事件处理器
   * Bind event handlers
   *
   * @private
   */
  _bindEventHandlers() {
    // 处理 ticker 数据 / Handle ticker data
    this.marketDataEngine.on('ticker', (ticker) => {
      this._publishMarketData('ticker', ticker);
    });

    // 处理 depth 数据 / Handle depth data
    this.marketDataEngine.on('depth', (depth) => {
      this._publishMarketData('depth', depth);
    });

    // 处理 trade 数据 / Handle trade data
    this.marketDataEngine.on('trade', (trade) => {
      this._publishMarketData('trade', trade);
    });

    // 处理 funding rate 数据 / Handle funding rate data
    this.marketDataEngine.on('fundingRate', (funding) => {
      this._publishMarketData('fundingRate', funding);
    });

    // 处理 kline 数据 / Handle kline data
    // MarketDataEngine emits 'candle' events for klines.
    this.marketDataEngine.on('candle', (kline) => {
      this._publishMarketData('kline', kline);
    });

    // 处理错误 / Handle errors
    this.marketDataEngine.on('error', (error) => {
      console.error(`${this.logPrefix} 行情引擎错误 / Market data engine error:`, error.message);
      this.stats.errors++;
      this.emit('error', error);
    });

    // 处理重连 / Handle reconnection
    this.marketDataEngine.on('reconnected', (exchange) => {
      console.log(`${this.logPrefix} 交易所重连成功 / Exchange reconnected: ${exchange}`);
      this.emit('reconnected', exchange);
    });
  }

  /**
   * 发布行情数据到 Redis
   * Publish market data to Redis
   *
   * @param {string} dataType - 数据类型 / Data type
   * @param {Object} data - 数据 / Data
   * @private
   */
  async _publishMarketData(dataType, data) {
    try {
      const normalizedType = dataType === 'fundingRate' ? 'funding' : dataType;
      const channelPrefix = REDIS_KEYS[normalizedType.toUpperCase()];
      if (!channelPrefix) {
        console.error(`${this.logPrefix} Unknown data type for publish: ${dataType}`);
        return;
      }
      // 构建频道名 / Build channel name
      const exchange = data.exchange || 'unknown';
      // 标准化交易对格式，移除 :USDT 后缀 / Normalize symbol format, remove :USDT suffix
      const symbol = (data.symbol || 'unknown').replace(/:USDT$/, '');
      const channel = `${channelPrefix}:${exchange}:${symbol}`;

      // 添加时间戳 / Add timestamp
      const message = JSON.stringify({
        ...data,
        publishedAt: Date.now(),
      });

      // 发布到 Redis / Publish to Redis
      await this.redisPub.publish(channel, message);

      const unifiedMessage = JSON.stringify({
        type: dataType === 'funding' ? 'fundingRate' : dataType,
        data,
        timestamp: Date.now(),
      });
      await this.redisPub.publish(REDIS_KEYS.UNIFIED_CHANNEL, unifiedMessage);

      // 同时发布到通用频道 (用于广播) / Also publish to general channel (for broadcast)
      const generalChannel = `${channelPrefix}:${exchange}:*`;
      // await this.redisPub.publish(generalChannel, message);

      // 更新统计 / Update stats
      const statsKey = `${normalizedType}sPublished`;
      if (this.stats[statsKey] !== undefined) {
        this.stats[statsKey]++;
      }

    } catch (error) {
      console.error(`${this.logPrefix} 发布数据失败 / Failed to publish data:`, error.message);
      this.stats.errors++;
    }
  }

  /**
   * 订阅交易对
   * Subscribe to symbols
   *
   * @private
   */
  async _subscribeSymbols() {
    console.log(`${this.logPrefix} 正在订阅交易对... / Subscribing to symbols...`);

    // 如果指定了交易对，只订阅指定的 / If symbols specified, subscribe only to those
    if (this.config.symbols.length > 0) {
      for (const exchange of this.config.exchanges) {
        for (const symbol of this.config.symbols) {
          await this.marketDataEngine.subscribe(symbol, ['ticker', 'depth'], [exchange]);
        }
      }
      console.log(`${this.logPrefix} 已订阅 ${this.config.symbols.length} 个指定交易对 / Subscribed to ${this.config.symbols.length} specified symbols`);
      return;
    }

    // 订阅所有交易对 (通过 subscribeAll) / Subscribe to all symbols (via subscribeAll)
    if (this.config.subscribeAll) {
      for (const exchange of this.config.exchanges) {
        try {
          // 获取交易所支持的交易对 / Get exchange supported symbols
          const exchangeInstance = ExchangeFactory.getInstance(exchange, {
            defaultType: this.config.tradingType,
          });

          // 连接交易所获取市场信息 / Connect exchange to get market info
          if (!exchangeInstance.connected) {
            await exchangeInstance.connect();
          }

          const markets = exchangeInstance.markets || {};
          const symbols = Object.keys(markets).filter((s) => {
            const market = markets[s];
            // 只订阅永续合约 / Only subscribe to perpetual swaps
            return market.type === 'swap' || market.swap === true;
          });

          console.log(`${this.logPrefix} ${exchange} 发现 ${symbols.length} 个交易对 / ${exchange} found ${symbols.length} symbols`);

          // 订阅 ticker 和 depth / Subscribe to ticker and depth
          for (const symbol of symbols.slice(0, 100)) { // 限制前 100 个 / Limit to first 100
            await this.marketDataEngine.subscribe(symbol, ['ticker'], [exchange]);
          }

        } catch (error) {
          console.error(`${this.logPrefix} 订阅 ${exchange} 交易对失败 / Failed to subscribe ${exchange} symbols:`, error.message);
        }
      }
    }
  }

  /**
   * 启动心跳
   * Start heartbeat
   *
   * @private
   */
  _startHeartbeat() {
    const publishHeartbeat = async () => {
      try {
        const status = this.getStatus();
        await this.redis.set(
          REDIS_KEYS.SERVICE_HEARTBEAT,
          JSON.stringify({
            timestamp: Date.now(),
            status: 'alive',
            uptime: status.uptime,
            stats: status.stats,
          }),
          'EX',
          30 // 30s expiry / 30 seconds expiry
        );
      } catch (error) {
        console.error(`${this.logPrefix} Heartbeat update failed:`, error.message);
      }
    };

    // Publish an initial heartbeat to avoid startup gaps.
    publishHeartbeat();

    this.heartbeatTimer = setInterval(publishHeartbeat, this.config.heartbeatInterval);
  }

  /**
   * 启动订阅请求监听
   * Start subscription request listener
   *
   * @private
   */
  async _startSubscriptionListener() {
    // 订阅请求频道 / Subscribe to request channel
    const requestChannel = 'market:subscribe:request';

    await this.redisSub.subscribe(requestChannel);

    this.redisSub.on('message', async (channel, message) => {
      if (channel !== requestChannel) return;

      try {
        const request = JSON.parse(message);
        const { action, exchange, symbol, dataTypes } = request;

        if (action === 'subscribe') {
          await this.marketDataEngine.subscribe(symbol, dataTypes || ['ticker'], [exchange]);
          console.log(`${this.logPrefix} 动态订阅 / Dynamic subscribe: ${exchange}:${symbol}`);
        } else if (action === 'unsubscribe') {
          await this.marketDataEngine.unsubscribe(symbol, dataTypes || ['ticker'], [exchange]);
          console.log(`${this.logPrefix} 取消订阅 / Unsubscribe: ${exchange}:${symbol}`);
        }
      } catch (error) {
        console.error(`${this.logPrefix} 处理订阅请求失败 / Failed to handle subscription request:`, error.message);
      }
    });

    console.log(`${this.logPrefix} 订阅请求监听已启动 / Subscription request listener started`);
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
          exchanges: this.config.exchanges,
          pid: process.pid,
        }),
        'EX',
        60 // 60秒过期 / 60 seconds expiry
      );
    } catch (error) {
      console.error(`${this.logPrefix} 发布服务状态失败 / Failed to publish service status:`, error.message);
    }
  }
}

// 导出默认实例创建函数 / Export default instance creation function
export function createMarketDataService(config) {
  return new MarketDataService(config);
}

export default MarketDataService;
