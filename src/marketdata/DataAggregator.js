/**
 * 行情数据聚合器
 * Market Data Aggregator
 *
 * 聚合多个交易所的行情数据，提供统一的数据访问接口
 * Aggregates market data from multiple exchanges, provides unified data access interface
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from './MarketDataEngine.js';

/**
 * 行情数据聚合器类
 * Market Data Aggregator Class
 */
export class DataAggregator extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 行情引擎实例映射 / Market data engine instances map
    this.engines = new Map();

    // 聚合数据缓存 / Aggregated data cache
    this.aggregatedData = {
      tickers: new Map(),      // 所有交易所的行情 / Tickers from all exchanges
      bestPrices: new Map(),   // 最优价格 / Best prices across exchanges
      spreads: new Map(),      // 价差数据 / Spread data
    };

    // 配置 / Configuration
    this.config = {
      // 数据更新间隔 (毫秒) / Data update interval (ms)
      updateInterval: config.updateInterval || 1000,

      // 是否启用价格聚合 / Whether to enable price aggregation
      enableAggregation: config.enableAggregation !== false,

      // 是否启用套利检测 / Whether to enable arbitrage detection
      enableArbitrageDetection: config.enableArbitrageDetection || false,

      // 套利阈值 (百分比) / Arbitrage threshold (percentage)
      arbitrageThreshold: config.arbitrageThreshold || 0.1,
    };

    // 更新定时器 / Update timer
    this.updateTimer = null;
  }

  /**
   * 添加交易所数据源
   * Add exchange data source
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {Object} options - 选项 / Options
   * @returns {MarketDataEngine} 行情引擎实例 / Market data engine instance
   */
  addExchange(exchangeName, options = {}) {
    // 检查是否已存在 / Check if already exists
    if (this.engines.has(exchangeName)) {
      console.warn(`[Aggregator] 交易所已存在: ${exchangeName} / Exchange already exists: ${exchangeName}`);
      return this.engines.get(exchangeName);
    }

    // 创建行情引擎 / Create market data engine
    const engine = new MarketDataEngine({
      exchange: exchangeName,
      type: options.type || 'spot',
    });

    // 绑定事件处理 / Bind event handlers
    this._bindEngineEvents(engine, exchangeName);

    // 保存引擎实例 / Save engine instance
    this.engines.set(exchangeName, engine);

    console.log(`[Aggregator] 已添加交易所: ${exchangeName} / Added exchange: ${exchangeName}`);

    return engine;
  }

  /**
   * 移除交易所数据源
   * Remove exchange data source
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @returns {Promise<void>}
   */
  async removeExchange(exchangeName) {
    // 获取引擎实例 / Get engine instance
    const engine = this.engines.get(exchangeName);

    // 如果不存在，返回 / If not exists, return
    if (!engine) {
      return;
    }

    // 断开连接 / Disconnect
    await engine.disconnect();

    // 移除实例 / Remove instance
    this.engines.delete(exchangeName);

    // 清理该交易所的缓存数据 / Clean up cached data for this exchange
    this._cleanExchangeData(exchangeName);

    console.log(`[Aggregator] 已移除交易所: ${exchangeName} / Removed exchange: ${exchangeName}`);
  }

  /**
   * 连接所有交易所
   * Connect to all exchanges
   * @returns {Promise<void>}
   */
  async connectAll() {
    // 并行连接所有交易所 / Connect to all exchanges in parallel
    const connectPromises = [];

    for (const [name, engine] of this.engines) {
      connectPromises.push(
        engine.connect().catch(error => {
          console.error(`[Aggregator] 连接 ${name} 失败 / Failed to connect ${name}:`, error.message);
        })
      );
    }

    // 等待所有连接完成 / Wait for all connections
    await Promise.all(connectPromises);

    // 启动数据聚合 / Start data aggregation
    if (this.config.enableAggregation) {
      this._startAggregation();
    }

    console.log('[Aggregator] 所有交易所连接完成 / All exchanges connected');
  }

  /**
   * 断开所有交易所
   * Disconnect from all exchanges
   * @returns {Promise<void>}
   */
  async disconnectAll() {
    // 停止数据聚合 / Stop data aggregation
    this._stopAggregation();

    // 并行断开所有交易所 / Disconnect from all exchanges in parallel
    const disconnectPromises = [];

    for (const [name, engine] of this.engines) {
      disconnectPromises.push(
        engine.disconnect().catch(error => {
          console.error(`[Aggregator] 断开 ${name} 失败 / Failed to disconnect ${name}:`, error.message);
        })
      );
    }

    // 等待所有断开完成 / Wait for all disconnections
    await Promise.all(disconnectPromises);

    console.log('[Aggregator] 所有交易所已断开 / All exchanges disconnected');
  }

  /**
   * 订阅交易对
   * Subscribe to trading pair
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array<string>} exchanges - 交易所列表 (可选，默认全部) / Exchange list (optional, default all)
   * @returns {Promise<void>}
   */
  async subscribe(symbol, exchanges = null) {
    // 如果未指定交易所，使用全部 / If no exchanges specified, use all
    const targetExchanges = exchanges || Array.from(this.engines.keys());

    // 遍历交易所进行订阅 / Iterate exchanges to subscribe
    for (const exchangeName of targetExchanges) {
      const engine = this.engines.get(exchangeName);

      if (!engine) {
        console.warn(`[Aggregator] 交易所不存在: ${exchangeName} / Exchange not found: ${exchangeName}`);
        continue;
      }

      try {
        // 订阅行情 / Subscribe to ticker
        await engine.subscribeTicker(symbol);

        // 订阅订单簿 / Subscribe to orderbook
        await engine.subscribeOrderbook(symbol);

        console.log(`[Aggregator] 已在 ${exchangeName} 订阅 ${symbol} / Subscribed to ${symbol} on ${exchangeName}`);
      } catch (error) {
        console.error(`[Aggregator] 订阅失败 ${exchangeName}/${symbol} / Subscribe failed:`, error.message);
      }
    }
  }

  /**
   * 获取交易对在所有交易所的行情
   * Get ticker for trading pair across all exchanges
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 各交易所行情 / Tickers from each exchange
   */
  getTickers(symbol) {
    const tickers = {};

    // 遍历所有交易所 / Iterate all exchanges
    for (const [exchangeName, engine] of this.engines) {
      const ticker = engine.getTicker(symbol);
      if (ticker) {
        tickers[exchangeName] = ticker;
      }
    }

    return tickers;
  }

  /**
   * 获取交易对的最优价格
   * Get best price for trading pair
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 最优价格信息 / Best price info
   */
  getBestPrice(symbol) {
    // 从缓存获取 / Get from cache
    return this.aggregatedData.bestPrices.get(symbol) || null;
  }

  /**
   * 获取交易对在各交易所的价差
   * Get spread for trading pair across exchanges
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 价差信息 / Spread info
   */
  getSpread(symbol) {
    // 从缓存获取 / Get from cache
    return this.aggregatedData.spreads.get(symbol) || null;
  }

  /**
   * 获取套利机会
   * Get arbitrage opportunities
   * @returns {Array} 套利机会列表 / Arbitrage opportunities list
   */
  getArbitrageOpportunities() {
    const opportunities = [];

    // 遍历所有价差数据 / Iterate all spread data
    for (const [symbol, spread] of this.aggregatedData.spreads) {
      // 检查是否有套利机会 / Check for arbitrage opportunity
      if (spread.spreadPercent >= this.config.arbitrageThreshold) {
        opportunities.push({
          symbol,                           // 交易对 / Trading pair
          buyExchange: spread.lowestAsk.exchange,   // 买入交易所 / Buy exchange
          buyPrice: spread.lowestAsk.price,         // 买入价格 / Buy price
          sellExchange: spread.highestBid.exchange, // 卖出交易所 / Sell exchange
          sellPrice: spread.highestBid.price,       // 卖出价格 / Sell price
          spreadPercent: spread.spreadPercent,      // 价差百分比 / Spread percentage
          potentialProfit: spread.spreadPercent,    // 潜在利润 / Potential profit
        });
      }
    }

    // 按价差排序 / Sort by spread
    opportunities.sort((a, b) => b.spreadPercent - a.spreadPercent);

    return opportunities;
  }

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 绑定引擎事件
   * Bind engine events
   * @private
   */
  _bindEngineEvents(engine, exchangeName) {
    // 行情更新事件 / Ticker update event
    engine.on('ticker', (ticker) => {
      // 保存到聚合数据 / Save to aggregated data
      const key = `${exchangeName}:${ticker.symbol}`;
      this.aggregatedData.tickers.set(key, {
        ...ticker,
        exchange: exchangeName,
      });

      // 转发事件 / Forward event
      this.emit('ticker', {
        ...ticker,
        exchange: exchangeName,
      });
    });

    // 订单簿更新事件 / Orderbook update event
    engine.on('orderbook', (orderbook) => {
      // 转发事件 / Forward event
      this.emit('orderbook', {
        ...orderbook,
        exchange: exchangeName,
      });
    });

    // 成交事件 / Trade event
    engine.on('trade', (trade) => {
      // 转发事件 / Forward event
      this.emit('trade', {
        ...trade,
        exchange: exchangeName,
      });
    });

    // K 线事件 / Kline event
    engine.on('kline', (kline) => {
      // 转发事件 / Forward event
      this.emit('kline', {
        ...kline,
        exchange: exchangeName,
      });
    });

    // 连接事件 / Connected event
    engine.on('connected', () => {
      this.emit('exchangeConnected', { exchange: exchangeName });
    });

    // 断开事件 / Disconnected event
    engine.on('disconnected', (info) => {
      this.emit('exchangeDisconnected', { exchange: exchangeName, ...info });
    });

    // 错误事件 / Error event
    engine.on('error', (error) => {
      this.emit('error', { exchange: exchangeName, error });
    });
  }

  /**
   * 启动数据聚合
   * Start data aggregation
   * @private
   */
  _startAggregation() {
    // 停止现有定时器 / Stop existing timer
    this._stopAggregation();

    // 启动聚合定时器 / Start aggregation timer
    this.updateTimer = setInterval(() => {
      this._aggregateData();
    }, this.config.updateInterval);

    console.log('[Aggregator] 数据聚合已启动 / Data aggregation started');
  }

  /**
   * 停止数据聚合
   * Stop data aggregation
   * @private
   */
  _stopAggregation() {
    // 清除定时器 / Clear timer
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * 聚合数据
   * Aggregate data
   * @private
   */
  _aggregateData() {
    // 按交易对分组数据 / Group data by symbol
    const symbolGroups = new Map();

    // 遍历所有行情数据 / Iterate all ticker data
    for (const [key, ticker] of this.aggregatedData.tickers) {
      const symbol = ticker.symbol;

      // 获取或创建分组 / Get or create group
      if (!symbolGroups.has(symbol)) {
        symbolGroups.set(symbol, []);
      }

      // 添加到分组 / Add to group
      symbolGroups.get(symbol).push(ticker);
    }

    // 计算每个交易对的最优价格和价差 / Calculate best prices and spreads for each symbol
    for (const [symbol, tickers] of symbolGroups) {
      // 计算最优价格 / Calculate best prices
      this._calculateBestPrice(symbol, tickers);

      // 计算价差 / Calculate spread
      this._calculateSpread(symbol, tickers);
    }

    // 如果启用套利检测，检查套利机会 / If arbitrage detection enabled, check opportunities
    if (this.config.enableArbitrageDetection) {
      this._checkArbitrageOpportunities();
    }
  }

  /**
   * 计算最优价格
   * Calculate best price
   * @private
   */
  _calculateBestPrice(symbol, tickers) {
    // 如果没有行情数据，返回 / If no ticker data, return
    if (tickers.length === 0) {
      return;
    }

    // 找到最低卖价和最高买价 / Find lowest ask and highest bid
    let lowestAsk = { price: Infinity, exchange: null };
    let highestBid = { price: 0, exchange: null };

    for (const ticker of tickers) {
      // 更新最低卖价 / Update lowest ask
      if (ticker.ask && ticker.ask < lowestAsk.price) {
        lowestAsk = { price: ticker.ask, exchange: ticker.exchange };
      }

      // 更新最高买价 / Update highest bid
      if (ticker.bid && ticker.bid > highestBid.price) {
        highestBid = { price: ticker.bid, exchange: ticker.exchange };
      }
    }

    // 保存最优价格 / Save best prices
    this.aggregatedData.bestPrices.set(symbol, {
      symbol,
      lowestAsk,
      highestBid,
      timestamp: Date.now(),
    });
  }

  /**
   * 计算价差
   * Calculate spread
   * @private
   */
  _calculateSpread(symbol, tickers) {
    // 获取最优价格 / Get best prices
    const bestPrice = this.aggregatedData.bestPrices.get(symbol);

    // 如果没有最优价格，返回 / If no best prices, return
    if (!bestPrice || !bestPrice.lowestAsk.price || !bestPrice.highestBid.price) {
      return;
    }

    // 计算价差 / Calculate spread
    const spread = bestPrice.highestBid.price - bestPrice.lowestAsk.price;

    // 计算价差百分比 / Calculate spread percentage
    const spreadPercent = (spread / bestPrice.lowestAsk.price) * 100;

    // 保存价差数据 / Save spread data
    this.aggregatedData.spreads.set(symbol, {
      symbol,
      lowestAsk: bestPrice.lowestAsk,
      highestBid: bestPrice.highestBid,
      spread,
      spreadPercent,
      timestamp: Date.now(),
    });
  }

  /**
   * 检查套利机会
   * Check arbitrage opportunities
   * @private
   */
  _checkArbitrageOpportunities() {
    // 获取套利机会 / Get arbitrage opportunities
    const opportunities = this.getArbitrageOpportunities();

    // 如果有套利机会，发出事件 / If opportunities exist, emit event
    if (opportunities.length > 0) {
      this.emit('arbitrageOpportunity', opportunities);
    }
  }

  /**
   * 清理交易所数据
   * Clean exchange data
   * @private
   */
  _cleanExchangeData(exchangeName) {
    // 清理行情缓存 / Clean ticker cache
    for (const key of this.aggregatedData.tickers.keys()) {
      if (key.startsWith(`${exchangeName}:`)) {
        this.aggregatedData.tickers.delete(key);
      }
    }
  }
}

// 导出默认类 / Export default class
export default DataAggregator;
