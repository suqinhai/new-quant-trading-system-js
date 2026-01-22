/**
 * 行情数据聚合器
 * Market Data Aggregator
 *
 * 聚合多个交易所的行情数据，提供统一的数据访问接口
 * Aggregates market data from multiple exchanges, provides unified data access interface
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入行情引擎 / Import market data engine
import { MarketDataEngine } from './MarketDataEngine.js'; // 导入模块 ./MarketDataEngine.js

/**
 * 行情数据聚合器类
 * Market Data Aggregator Class
 */
export class DataAggregator extends EventEmitter { // 导出类 DataAggregator
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 行情引擎实例映射 / Market data engine instances map
    this.engines = new Map(); // 设置 engines

    // 聚合数据缓存 / Aggregated data cache
    this.aggregatedData = { // 设置 aggregatedData
      tickers: new Map(),      // 所有交易所的行情 / Tickers from all exchanges
      bestPrices: new Map(),   // 最优价格 / Best prices across exchanges
      spreads: new Map(),      // 价差数据 / Spread data
    }; // 结束代码块

    // 配置 / Configuration
    this.config = { // 设置 config
      // 数据更新间隔 (毫秒) / Data update interval (ms)
      updateInterval: config.updateInterval || 1000, // 数据更新间隔 (毫秒)

      // 是否启用价格聚合 / Whether to enable price aggregation
      enableAggregation: config.enableAggregation !== false, // 是否启用价格聚合

      // 是否启用套利检测 / Whether to enable arbitrage detection
      enableArbitrageDetection: config.enableArbitrageDetection || false, // 是否启用套利检测

      // 套利阈值 (百分比) / Arbitrage threshold (percentage)
      arbitrageThreshold: config.arbitrageThreshold || 0.1, // 套利阈值 (百分比)
    }; // 结束代码块

    // 更新定时器 / Update timer
    this.updateTimer = null; // 设置 updateTimer
  } // 结束代码块

  /**
   * 添加交易所数据源
   * Add exchange data source
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {Object} options - 选项 / Options
   * @returns {MarketDataEngine} 行情引擎实例 / Market data engine instance
   */
  addExchange(exchangeName, options = {}) { // 调用 addExchange
    // 检查是否已存在 / Check if already exists
    if (this.engines.has(exchangeName)) { // 条件判断 this.engines.has(exchangeName)
      console.warn(`[Aggregator] 交易所已存在: ${exchangeName} / Exchange already exists: ${exchangeName}`); // 控制台输出
      return this.engines.get(exchangeName); // 返回结果
    } // 结束代码块

    // 创建行情引擎 / Create market data engine
    const engine = new MarketDataEngine({ // 定义常量 engine
      exchange: exchangeName, // 交易所
      type: options.type || 'spot', // 类型
    }); // 结束代码块

    // 绑定事件处理 / Bind event handlers
    this._bindEngineEvents(engine, exchangeName); // 调用 _bindEngineEvents

    // 保存引擎实例 / Save engine instance
    this.engines.set(exchangeName, engine); // 访问 engines

    console.log(`[Aggregator] 已添加交易所: ${exchangeName} / Added exchange: ${exchangeName}`); // 控制台输出

    return engine; // 返回结果
  } // 结束代码块

  /**
   * 移除交易所数据源
   * Remove exchange data source
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @returns {Promise<void>}
   */
  async removeExchange(exchangeName) { // 执行语句
    // 获取引擎实例 / Get engine instance
    const engine = this.engines.get(exchangeName); // 定义常量 engine

    // 如果不存在，返回 / If not exists, return
    if (!engine) { // 条件判断 !engine
      return; // 返回结果
    } // 结束代码块

    // 断开连接 / Disconnect
    await engine.stop(); // 等待异步结果

    // 移除实例 / Remove instance
    this.engines.delete(exchangeName); // 访问 engines

    // 清理该交易所的缓存数据 / Clean up cached data for this exchange
    this._cleanExchangeData(exchangeName); // 调用 _cleanExchangeData

    console.log(`[Aggregator] 已移除交易所: ${exchangeName} / Removed exchange: ${exchangeName}`); // 控制台输出
  } // 结束代码块

  /**
   * 连接所有交易所
   * Connect to all exchanges
   * @returns {Promise<void>}
   */
  async connectAll() { // 执行语句
    // 并行连接所有交易所 / Connect to all exchanges in parallel
    const connectPromises = []; // 定义常量 connectPromises

    for (const [name, engine] of this.engines) { // 循环 const [name, engine] of this.engines
      connectPromises.push( // 调用 connectPromises.push
        engine.start().catch(error => { // 调用 engine.start
          console.error(`[Aggregator] 连接 ${name} 失败 / Failed to connect ${name}:`, error.message); // 控制台输出
        }) // 结束代码块
      ); // 结束调用或参数
    } // 结束代码块

    // 等待所有连接完成 / Wait for all connections
    await Promise.all(connectPromises); // 等待异步结果

    // 启动数据聚合 / Start data aggregation
    if (this.config.enableAggregation) { // 条件判断 this.config.enableAggregation
      this._startAggregation(); // 调用 _startAggregation
    } // 结束代码块

    console.log('[Aggregator] 所有交易所连接完成 / All exchanges connected'); // 控制台输出
  } // 结束代码块

  /**
   * 断开所有交易所
   * Disconnect from all exchanges
   * @returns {Promise<void>}
   */
  async disconnectAll() { // 执行语句
    // 停止数据聚合 / Stop data aggregation
    this._stopAggregation(); // 调用 _stopAggregation

    // 并行断开所有交易所 / Disconnect from all exchanges in parallel
    const disconnectPromises = []; // 定义常量 disconnectPromises

    for (const [name, engine] of this.engines) { // 循环 const [name, engine] of this.engines
      disconnectPromises.push( // 调用 disconnectPromises.push
        engine.stop().catch(error => { // 调用 engine.stop
          console.error(`[Aggregator] 断开 ${name} 失败 / Failed to disconnect ${name}:`, error.message); // 控制台输出
        }) // 结束代码块
      ); // 结束调用或参数
    } // 结束代码块

    // 等待所有断开完成 / Wait for all disconnections
    await Promise.all(disconnectPromises); // 等待异步结果

    console.log('[Aggregator] 所有交易所已断开 / All exchanges disconnected'); // 控制台输出
  } // 结束代码块

  /**
   * 订阅交易对
   * Subscribe to trading pair
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Array<string>} exchanges - 交易所列表 (可选，默认全部) / Exchange list (optional, default all)
   * @returns {Promise<void>}
   */
  async subscribe(symbol, exchanges = null) { // 执行语句
    // 如果未指定交易所，使用全部 / If no exchanges specified, use all
    const targetExchanges = exchanges || Array.from(this.engines.keys()); // 定义常量 targetExchanges

    // 遍历交易所进行订阅 / Iterate exchanges to subscribe
    for (const exchangeName of targetExchanges) { // 循环 const exchangeName of targetExchanges
      const engine = this.engines.get(exchangeName); // 定义常量 engine

      if (!engine) { // 条件判断 !engine
        console.warn(`[Aggregator] 交易所不存在: ${exchangeName} / Exchange not found: ${exchangeName}`); // 控制台输出
        continue; // 继续下一轮循环
      } // 结束代码块

      try { // 尝试执行
        // 订阅行情 / Subscribe to ticker
        await engine.subscribeTicker(symbol); // 等待异步结果

        // 订阅订单簿 / Subscribe to orderbook
        await engine.subscribeOrderbook(symbol); // 等待异步结果

        console.log(`[Aggregator] 已在 ${exchangeName} 订阅 ${symbol} / Subscribed to ${symbol} on ${exchangeName}`); // 控制台输出
      } catch (error) { // 执行语句
        console.error(`[Aggregator] 订阅失败 ${exchangeName}/${symbol} / Subscribe failed:`, error.message); // 控制台输出
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取交易对在所有交易所的行情
   * Get ticker for trading pair across all exchanges
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 各交易所行情 / Tickers from each exchange
   */
  getTickers(symbol) { // 调用 getTickers
    const tickers = {}; // 定义常量 tickers

    // 遍历所有交易所 / Iterate all exchanges
    for (const [exchangeName, engine] of this.engines) { // 循环 const [exchangeName, engine] of this.engines
      const ticker = engine.getTicker(symbol); // 定义常量 ticker
      if (ticker) { // 条件判断 ticker
        tickers[exchangeName] = ticker; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return tickers; // 返回结果
  } // 结束代码块

  /**
   * 获取交易对的最优价格
   * Get best price for trading pair
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 最优价格信息 / Best price info
   */
  getBestPrice(symbol) { // 调用 getBestPrice
    // 从缓存获取 / Get from cache
    return this.aggregatedData.bestPrices.get(symbol) || null; // 返回结果
  } // 结束代码块

  /**
   * 获取交易对在各交易所的价差
   * Get spread for trading pair across exchanges
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 价差信息 / Spread info
   */
  getSpread(symbol) { // 调用 getSpread
    // 从缓存获取 / Get from cache
    return this.aggregatedData.spreads.get(symbol) || null; // 返回结果
  } // 结束代码块

  /**
   * 获取套利机会
   * Get arbitrage opportunities
   * @returns {Array} 套利机会列表 / Arbitrage opportunities list
   */
  getArbitrageOpportunities() { // 调用 getArbitrageOpportunities
    const opportunities = []; // 定义常量 opportunities

    // 遍历所有价差数据 / Iterate all spread data
    for (const [symbol, spread] of this.aggregatedData.spreads) { // 循环 const [symbol, spread] of this.aggregatedData...
      // 检查是否有套利机会 / Check for arbitrage opportunity
      if (spread.spreadPercent >= this.config.arbitrageThreshold) { // 条件判断 spread.spreadPercent >= this.config.arbitrage...
        opportunities.push({ // 调用 opportunities.push
          symbol,                           // 交易对 / Trading pair
          buyExchange: spread.lowestAsk.exchange,   // 买入交易所 / Buy exchange
          buyPrice: spread.lowestAsk.price,         // 买入价格 / Buy price
          sellExchange: spread.highestBid.exchange, // 卖出交易所 / Sell exchange
          sellPrice: spread.highestBid.price,       // 卖出价格 / Sell price
          spreadPercent: spread.spreadPercent,      // 价差百分比 / Spread percentage
          potentialProfit: spread.spreadPercent,    // 潜在利润 / Potential profit
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 按价差排序 / Sort by spread
    opportunities.sort((a, b) => b.spreadPercent - a.spreadPercent); // 调用 opportunities.sort

    return opportunities; // 返回结果
  } // 结束代码块

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 绑定引擎事件
   * Bind engine events
   * @private
   */
  _bindEngineEvents(engine, exchangeName) { // 调用 _bindEngineEvents
    // 行情更新事件 / Ticker update event
    engine.on('ticker', (ticker) => { // 注册事件监听
      // 保存到聚合数据 / Save to aggregated data
      const key = `${exchangeName}:${ticker.symbol}`; // 定义常量 key
      this.aggregatedData.tickers.set(key, { // 访问 aggregatedData
        ...ticker, // 展开对象或数组
        exchange: exchangeName, // 交易所
      }); // 结束代码块

      // 转发事件 / Forward event
      this.emit('ticker', { // 调用 emit
        ...ticker, // 展开对象或数组
        exchange: exchangeName, // 交易所
      }); // 结束代码块
    }); // 结束代码块

    // 订单簿更新事件 / Orderbook update event
    engine.on('orderbook', (orderbook) => { // 注册事件监听
      // 转发事件 / Forward event
      this.emit('orderbook', { // 调用 emit
        ...orderbook, // 展开对象或数组
        exchange: exchangeName, // 交易所
      }); // 结束代码块
    }); // 结束代码块

    // 成交事件 / Trade event
    engine.on('trade', (trade) => { // 注册事件监听
      // 转发事件 / Forward event
      this.emit('trade', { // 调用 emit
        ...trade, // 展开对象或数组
        exchange: exchangeName, // 交易所
      }); // 结束代码块
    }); // 结束代码块

    // K 线事件 / Kline event
    engine.on('kline', (kline) => { // 注册事件监听
      // 转发事件 / Forward event
      this.emit('kline', { // 调用 emit
        ...kline, // 展开对象或数组
        exchange: exchangeName, // 交易所
      }); // 结束代码块
    }); // 结束代码块

    // 连接事件 / Connected event
    engine.on('connected', () => { // 注册事件监听
      this.emit('exchangeConnected', { exchange: exchangeName }); // 调用 emit
    }); // 结束代码块

    // 断开事件 / Disconnected event
    engine.on('disconnected', (info) => { // 注册事件监听
      this.emit('exchangeDisconnected', { exchange: exchangeName, ...info }); // 调用 emit
    }); // 结束代码块

    // 错误事件 / Error event
    engine.on('error', (error) => { // 注册事件监听
      this.emit('error', { exchange: exchangeName, error }); // 调用 emit
    }); // 结束代码块
  } // 结束代码块

  /**
   * 启动数据聚合
   * Start data aggregation
   * @private
   */
  _startAggregation() { // 调用 _startAggregation
    // 停止现有定时器 / Stop existing timer
    this._stopAggregation(); // 调用 _stopAggregation

    // 启动聚合定时器 / Start aggregation timer
    this.updateTimer = setInterval(() => { // 设置 updateTimer
      this._aggregateData(); // 调用 _aggregateData
    }, this.config.updateInterval); // 执行语句

    console.log('[Aggregator] 数据聚合已启动 / Data aggregation started'); // 控制台输出
  } // 结束代码块

  /**
   * 停止数据聚合
   * Stop data aggregation
   * @private
   */
  _stopAggregation() { // 调用 _stopAggregation
    // 清除定时器 / Clear timer
    if (this.updateTimer) { // 条件判断 this.updateTimer
      clearInterval(this.updateTimer); // 调用 clearInterval
      this.updateTimer = null; // 设置 updateTimer
    } // 结束代码块
  } // 结束代码块

  /**
   * 聚合数据
   * Aggregate data
   * @private
   */
  _aggregateData() { // 调用 _aggregateData
    // 按交易对分组数据 / Group data by symbol
    const symbolGroups = new Map(); // 定义常量 symbolGroups

    // 遍历所有行情数据 / Iterate all ticker data
    for (const [key, ticker] of this.aggregatedData.tickers) { // 循环 const [key, ticker] of this.aggregatedData.ti...
      const symbol = ticker.symbol; // 定义常量 symbol

      // 获取或创建分组 / Get or create group
      if (!symbolGroups.has(symbol)) { // 条件判断 !symbolGroups.has(symbol)
        symbolGroups.set(symbol, []); // 调用 symbolGroups.set
      } // 结束代码块

      // 添加到分组 / Add to group
      symbolGroups.get(symbol).push(ticker); // 调用 symbolGroups.get
    } // 结束代码块

    // 计算每个交易对的最优价格和价差 / Calculate best prices and spreads for each symbol
    for (const [symbol, tickers] of symbolGroups) { // 循环 const [symbol, tickers] of symbolGroups
      // 计算最优价格 / Calculate best prices
      this._calculateBestPrice(symbol, tickers); // 调用 _calculateBestPrice

      // 计算价差 / Calculate spread
      this._calculateSpread(symbol, tickers); // 调用 _calculateSpread
    } // 结束代码块

    // 如果启用套利检测，检查套利机会 / If arbitrage detection enabled, check opportunities
    if (this.config.enableArbitrageDetection) { // 条件判断 this.config.enableArbitrageDetection
      this._checkArbitrageOpportunities(); // 调用 _checkArbitrageOpportunities
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算最优价格
   * Calculate best price
   * @private
   */
  _calculateBestPrice(symbol, tickers) { // 调用 _calculateBestPrice
    // 如果没有行情数据，返回 / If no ticker data, return
    if (tickers.length === 0) { // 条件判断 tickers.length === 0
      return; // 返回结果
    } // 结束代码块

    // 找到最低卖价和最高买价 / Find lowest ask and highest bid
    let lowestAsk = { price: Infinity, exchange: null }; // 定义变量 lowestAsk
    let highestBid = { price: 0, exchange: null }; // 定义变量 highestBid

    for (const ticker of tickers) { // 循环 const ticker of tickers
      // 更新最低卖价 / Update lowest ask
      if (ticker.ask && ticker.ask < lowestAsk.price) { // 条件判断 ticker.ask && ticker.ask < lowestAsk.price
        lowestAsk = { price: ticker.ask, exchange: ticker.exchange }; // 赋值 lowestAsk
      } // 结束代码块

      // 更新最高买价 / Update highest bid
      if (ticker.bid && ticker.bid > highestBid.price) { // 条件判断 ticker.bid && ticker.bid > highestBid.price
        highestBid = { price: ticker.bid, exchange: ticker.exchange }; // 赋值 highestBid
      } // 结束代码块
    } // 结束代码块

    // 保存最优价格 / Save best prices
    this.aggregatedData.bestPrices.set(symbol, { // 访问 aggregatedData
      symbol, // 执行语句
      lowestAsk, // 执行语句
      highestBid, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块
  } // 结束代码块

  /**
   * 计算价差
   * Calculate spread
   * @private
   */
  _calculateSpread(symbol, tickers) { // 调用 _calculateSpread
    // 获取最优价格 / Get best prices
    const bestPrice = this.aggregatedData.bestPrices.get(symbol); // 定义常量 bestPrice

    // 如果没有最优价格，返回 / If no best prices, return
    if (!bestPrice || !bestPrice.lowestAsk.price || !bestPrice.highestBid.price) { // 条件判断 !bestPrice || !bestPrice.lowestAsk.price || !...
      return; // 返回结果
    } // 结束代码块

    // 计算价差 / Calculate spread
    const spread = bestPrice.highestBid.price - bestPrice.lowestAsk.price; // 定义常量 spread

    // 计算价差百分比 / Calculate spread percentage
    const spreadPercent = (spread / bestPrice.lowestAsk.price) * 100; // 定义常量 spreadPercent

    // 保存价差数据 / Save spread data
    this.aggregatedData.spreads.set(symbol, { // 访问 aggregatedData
      symbol, // 执行语句
      lowestAsk: bestPrice.lowestAsk, // lowestAsk
      highestBid: bestPrice.highestBid, // highestBid
      spread, // 执行语句
      spreadPercent, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块
  } // 结束代码块

  /**
   * 检查套利机会
   * Check arbitrage opportunities
   * @private
   */
  _checkArbitrageOpportunities() { // 调用 _checkArbitrageOpportunities
    // 获取套利机会 / Get arbitrage opportunities
    const opportunities = this.getArbitrageOpportunities(); // 定义常量 opportunities

    // 如果有套利机会，发出事件 / If opportunities exist, emit event
    if (opportunities.length > 0) { // 条件判断 opportunities.length > 0
      this.emit('arbitrageOpportunity', opportunities); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 清理交易所数据
   * Clean exchange data
   * @private
   */
  _cleanExchangeData(exchangeName) { // 调用 _cleanExchangeData
    // 清理行情缓存 / Clean ticker cache
    for (const key of this.aggregatedData.tickers.keys()) { // 循环 const key of this.aggregatedData.tickers.keys()
      if (key.startsWith(`${exchangeName}:`)) { // 条件判断 key.startsWith(`${exchangeName}:`)
        this.aggregatedData.tickers.delete(key); // 访问 aggregatedData
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default DataAggregator; // 默认导出
