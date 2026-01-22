/**
 * 跨交易所价差策略
 * Cross-Exchange Spread Strategy
 *
 * 跨多个交易所的价差套利策略
 * Cross-sectional strategy exploiting price spreads across multiple exchanges
 *
 * 策略原理 / Strategy Principle:
 * 1. 同时监控多个交易所的同一币种价格
 * 2. 当价差超过阈值时，在低价交易所买入，高价交易所卖出
 * 3. 利用价格均值回归获利
 * 4. 支持永续合约和现货市场
 *
 * 1. Monitor same asset prices across multiple exchanges
 * 2. When spread exceeds threshold, buy on low-price exchange, sell on high-price
 * 3. Profit from price mean reversion
 * 4. Support perpetual swaps and spot markets
 */

// 导入横截面策略基类 / Import cross-sectional base strategy
import { // 导入依赖
  CrossSectionalStrategy, // 执行语句
  CROSS_SECTIONAL_TYPES, // 执行语句
  POSITION_TYPE, // 执行语句
} from './CrossSectionalStrategy.js'; // 执行语句

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 支持的交易所
 * Supported exchanges
 */
export const SUPPORTED_EXCHANGES = { // 导出常量 SUPPORTED_EXCHANGES
  BINANCE: 'binance', // BINANCE交易所配置
  BYBIT: 'bybit', // BYBIT交易所配置
  OKX: 'okx', // OKX交易所配置
  GATE: 'gate', // GATE交易所配置
  DERIBIT: 'deribit', // DERIBIT交易所配置
  HUOBI: 'huobi', // HUOBI
  KUCOIN: 'kucoin', // KUCOIN交易所配置
  KRAKEN: 'kraken', // KRAKEN交易所配置
}; // 结束代码块

/**
 * 价差类型
 * Spread types
 */
export const SPREAD_TYPES = { // 导出常量 SPREAD_TYPES
  SPOT_SPOT: 'spot_spot',           // SPOTSPOT
  PERP_PERP: 'perp_perp',           // PERPPERP
  SPOT_PERP: 'spot_perp',           // SPOTPERP
  FUTURES_SPOT: 'futures_spot',     // FUTURESSPOT
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  name: 'CrossExchangeSpreadStrategy', // name

  // 监控的交易对列表 / Symbols to monitor
  // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
  symbols: [ // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', // 执行语句
    'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', // 执行语句
  ], // 结束数组或索引

  // 监控的交易所 / Exchanges to monitor
  // 注意: 需要与系统实际连接的交易所保持一致
  // Note: Should match exchanges actually connected by the system
  exchanges: [ // Note: Should match exchanges actually connected by the system
    SUPPORTED_EXCHANGES.BINANCE, // 执行语句
    SUPPORTED_EXCHANGES.OKX, // 执行语句
    SUPPORTED_EXCHANGES.GATE, // 执行语句
  ], // 结束数组或索引

  // 交易对报价别名 / Quote alias mapping
  // 用于跨所对齐 (如 Deribit USD -> USDT)
  quoteAliases: { // Quote alias mapping
    deribit: { // Deribit quote aliases
      USD: 'USDT', // Map USD to USDT for cross-exchange comparison
    }, // 结束代码块
  }, // 结束代码块

  // 价差类型 / Spread type
  spreadType: SPREAD_TYPES.PERP_PERP, // 价差类型

  // ============================================
  // 价差配置 / Spread Configuration
  // ============================================

  // 最小价差阈值 (开仓) / Minimum spread threshold (open)
  minSpreadToOpen: 0.003,  // 最小价差阈值 (开仓)

  // 平仓价差阈值 / Close spread threshold
  closeSpreadThreshold: 0.001,  // 平仓价差阈值

  // 紧急平仓价差 (价差反向) / Emergency close spread (spread reversal)
  emergencyCloseSpread: -0.002,  // 紧急平仓价差 (价差反向)

  // 最大价差 (避免异常数据) / Max spread (avoid anomalous data)
  maxSpread: 0.05,  // 最大价差 (避免异常数据)

  // ============================================
  // 排名配置 / Ranking Configuration
  // ============================================

  // 选取 Top N 个价差机会 / Select top N spread opportunities
  topN: 5, // 选取 Top N 个价差机会

  // 最小排名分数 / Minimum ranking score
  minRankingScore: 0.002, // 最小Ranking分数

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 单个套利机会最大仓位 / Max position per opportunity
  maxPositionPerOpportunity: 0.08, // 单个套利机会最大仓位

  // 总套利仓位 / Total arbitrage position
  maxTotalPosition: 0.40, // 最大总持仓

  // 最小仓位 / Minimum position
  minPositionSize: 0.01, // 最小持仓大小

  // 杠杆 / Leverage
  leverage: 3, // 杠杆

  // ============================================
  // 执行配置 / Execution Configuration
  // ============================================

  // 是否同时下单 / Simultaneous order execution
  simultaneousExecution: true, // simultaneousExecution

  // 最大滑点 / Max slippage
  maxSlippage: 0.001,  // 最大滑点

  // 订单类型 / Order type
  orderType: 'market', // 订单类型

  // 订单超时 (毫秒) / Order timeout (ms)
  orderTimeout: 5000, // 订单超时 (毫秒)

  // ============================================
  // 再平衡配置 / Rebalancing Configuration
  // ============================================

  // 价差检查间隔 (毫秒) / Spread check interval (ms)
  spreadCheckInterval: 1000, // 价差检查间隔 (毫秒)

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 5 * 60 * 1000,  // 再平衡周期 (毫秒)

  // ============================================
  // 仓位平衡配置 / Position Balance Configuration
  // ============================================

  // 仓位不平衡阈值 / Position imbalance threshold
  imbalanceThreshold: 0.05,  // 仓位不平衡阈值

  // 自动再平衡 / Auto rebalance
  autoRebalance: true, // 自动Rebalance

  // ============================================
  // 成本配置 / Cost Configuration
  // ============================================

  // 交易手续费 (taker) / Trading fee (taker)
  tradingFee: 0.0005,  // 交易手续费 (taker)

  // 是否计算资金费差异 / Consider funding rate difference
  considerFundingDiff: true, // 是否计算资金费差异

  // 提现/转账成本 / Withdrawal/transfer cost
  transferCost: 0, // 提现/转账成本

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 单笔止损 / Per-trade stop loss
  stopLoss: 0.02, // 单笔止损

  // 最大持仓时间 (毫秒) / Max holding time (ms)
  maxHoldingTime: 24 * 60 * 60 * 1000,  // 最大持仓时间 (毫秒)

  // 最大单日亏损 / Max daily loss
  maxDailyLoss: 0.02, // 最大每日亏损

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  verbose: true, // 详细日志
  logPrefix: '[CrossExchangeSpread]', // 日志前缀
}; // 结束代码块

// ============================================
// 辅助类 / Helper Classes
// ============================================

/**
 * 跨交易所价格管理器
 * Cross-Exchange Price Manager
 */
export class CrossExchangePriceManager extends EventEmitter { // 导出类 CrossExchangePriceManager
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Configuration
   */
  constructor(config) { // 构造函数
    super(); // 调用父类

    this.config = config; // 设置 config

    // 价格数据
    // 格式: { symbol: { exchange: { bid, ask, mid, timestamp } } }
    this.prices = new Map(); // 设置 prices

    // 价差数据
    // 格式: { key: { symbol, buyExchange, sellExchange, spread, ... } }
    this.spreads = new Map(); // 设置 spreads

    // 历史价差 / Historical spreads
    this.spreadHistory = new Map(); // 设置 spreadHistory
  } // 结束代码块

  /**
   * 更新价格
   * Update price
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所 / Exchange
   * @param {Object} priceData - 价格数据 / Price data
   */
  updatePrice(symbol, exchange, priceData) { // 调用 updatePrice
    const normalizedSymbol = this._normalizeSymbol(symbol, exchange); // 定义常量 normalizedSymbol

    // 初始化交易对价格映射 / Initialize symbol price map
    if (!this.prices.has(normalizedSymbol)) { // 条件判断 !this.prices.has(normalizedSymbol)
      this.prices.set(normalizedSymbol, new Map()); // 访问 prices
    } // 结束代码块

    const symbolPrices = this.prices.get(normalizedSymbol); // 定义常量 symbolPrices

    // 保存价格 / Save price
    symbolPrices.set(exchange, { // 调用 symbolPrices.set
      bid: priceData.bid || priceData.last, // bid
      ask: priceData.ask || priceData.last, // ask
      mid: (priceData.bid + priceData.ask) / 2 || priceData.last, // mid
      last: priceData.last, // last
      volume: priceData.volume || 0, // 成交量
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 更新价差 / Update spreads
    this._updateSpreads(normalizedSymbol); // 调用 _updateSpreads

    // 发出更新事件 / Emit update event
    this.emit('priceUpdated', { symbol: normalizedSymbol, exchange, price: symbolPrices.get(exchange) }); // 调用 emit
  } // 结束代码块

  /**
   * 标准化交易对用于跨所比较
   * Normalize symbol for cross-exchange comparison
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所 / Exchange
   * @returns {string} 标准化后的交易对 / Normalized symbol
   * @private
   */
  _normalizeSymbol(symbol, exchange) { // 调用 _normalizeSymbol
    if (!symbol) return symbol; // 条件判断 !symbol
    const aliasMap = this.config.quoteAliases?.[exchange]; // 定义常量 aliasMap
    if (!aliasMap) return symbol; // 条件判断 !aliasMap

    const [pair, suffix] = symbol.split(':'); // 定义常量 pair, suffix
    const [base, quote] = pair.split('/'); // 定义常量 base, quote
    if (!base || !quote) return symbol; // 条件判断 !base || !quote

    const aliasQuote = aliasMap[quote]; // 定义常量 aliasQuote
    if (!aliasQuote) return symbol; // 条件判断 !aliasQuote

    const normalizedPair = `${base}/${aliasQuote}`; // 定义常量 normalizedPair
    return suffix ? `${normalizedPair}:${suffix}` : normalizedPair; // 返回结果
  } // 结束代码块

  /**
   * 更新价差
   * Update spreads
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  _updateSpreads(symbol) { // 调用 _updateSpreads
    const symbolPrices = this.prices.get(symbol); // 定义常量 symbolPrices
    if (!symbolPrices || symbolPrices.size < 2) return; // 条件判断 !symbolPrices || symbolPrices.size < 2

    const exchanges = Array.from(symbolPrices.keys()); // 定义常量 exchanges

    // 计算所有交易所对的价差 / Calculate spreads for all exchange pairs
    for (let i = 0; i < exchanges.length; i++) { // 循环 let i = 0; i < exchanges.length; i++
      for (let j = i + 1; j < exchanges.length; j++) { // 循环 let j = i + 1; j < exchanges.length; j++
        const ex1 = exchanges[i]; // 定义常量 ex1
        const ex2 = exchanges[j]; // 定义常量 ex2

        const price1 = symbolPrices.get(ex1); // 定义常量 price1
        const price2 = symbolPrices.get(ex2); // 定义常量 price2

        // 检查价格有效性 / Check price validity
        if (!price1 || !price2) continue; // 条件判断 !price1 || !price2
        if (Date.now() - price1.timestamp > 10000) continue;  // 超过10秒的数据无效
        if (Date.now() - price2.timestamp > 10000) continue; // 条件判断 Date.now() - price2.timestamp > 10000

        // 计算价差 (以买入ex1、卖出ex2为正方向)
        // Calculate spread (buy ex1, sell ex2 as positive direction)
        // 价差 = (ex2卖价 - ex1买价) / ex1买价
        // Spread = (ex2 ask - ex1 bid) / ex1 bid
        const spread1to2 = (price2.bid - price1.ask) / price1.ask; // 定义常量 spread1to2
        const spread2to1 = (price1.bid - price2.ask) / price2.ask; // 定义常量 spread2to1

        // 取最佳方向 / Take best direction
        if (spread1to2 > spread2to1) { // 条件判断 spread1to2 > spread2to1
          // 买ex1，卖ex2
          const key = `${symbol}:${ex1}:${ex2}`; // 定义常量 key
          this.spreads.set(key, { // 访问 spreads
            symbol, // 执行语句
            buyExchange: ex1, // buy交易所
            sellExchange: ex2, // sell交易所
            spread: spread1to2, // 价差
            buyPrice: price1.ask, // buy价格
            sellPrice: price2.bid, // sell价格
            timestamp: Date.now(), // 时间戳
          }); // 结束代码块
        } else { // 执行语句
          // 买ex2，卖ex1
          const key = `${symbol}:${ex2}:${ex1}`; // 定义常量 key
          this.spreads.set(key, { // 访问 spreads
            symbol, // 执行语句
            buyExchange: ex2, // buy交易所
            sellExchange: ex1, // sell交易所
            spread: spread2to1, // 价差
            buyPrice: price2.ask, // buy价格
            sellPrice: price1.bid, // sell价格
            timestamp: Date.now(), // 时间戳
          }); // 结束代码块
        } // 结束代码块

        // 记录历史 / Record history
        this._recordSpreadHistory(symbol, Math.max(spread1to2, spread2to1)); // 调用 _recordSpreadHistory
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录价差历史
   * Record spread history
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} spread - 价差 / Spread
   * @private
   */
  _recordSpreadHistory(symbol, spread) { // 调用 _recordSpreadHistory
    if (!this.spreadHistory.has(symbol)) { // 条件判断 !this.spreadHistory.has(symbol)
      this.spreadHistory.set(symbol, []); // 访问 spreadHistory
    } // 结束代码块

    const history = this.spreadHistory.get(symbol); // 定义常量 history
    history.push({ // 调用 history.push
      spread, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 保留最近1000条 / Keep last 1000 records
    if (history.length > 1000) { // 条件判断 history.length > 1000
      history.shift(); // 调用 history.shift
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取所有价差机会
   * Get all spread opportunities
   *
   * @returns {Array} 价差机会列表 / Spread opportunity list
   */
  getAllSpreadOpportunities() { // 调用 getAllSpreadOpportunities
    const opportunities = []; // 定义常量 opportunities

    for (const [key, spread] of this.spreads) { // 循环 const [key, spread] of this.spreads
      // 检查价差有效性 / Check spread validity
      if (Date.now() - spread.timestamp > 5000) continue;  // 超过5秒的数据无效
      if (spread.spread < this.config.minSpreadToOpen) continue; // 条件判断 spread.spread < this.config.minSpreadToOpen
      if (spread.spread > this.config.maxSpread) continue;  // 异常数据

      opportunities.push({ // 调用 opportunities.push
        ...spread, // 展开对象或数组
        key, // 执行语句
        netSpread: spread.spread - this.config.tradingFee * 2,  // net价差
      }); // 结束代码块
    } // 结束代码块

    // 按净价差排序 / Sort by net spread
    opportunities.sort((a, b) => b.netSpread - a.netSpread); // 调用 opportunities.sort

    return opportunities; // 返回结果
  } // 结束代码块

  /**
   * 获取特定交易对的最佳价差
   * Get best spread for a symbol
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 最佳价差机会 / Best spread opportunity
   */
  getBestSpread(symbol) { // 调用 getBestSpread
    const opportunities = this.getAllSpreadOpportunities() // 定义常量 opportunities
      .filter(o => o.symbol === symbol); // 定义箭头函数

    return opportunities.length > 0 ? opportunities[0] : null; // 返回结果
  } // 结束代码块

  /**
   * 获取价格
   * Get price
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所 / Exchange
   * @returns {Object|null} 价格数据 / Price data
   */
  getPrice(symbol, exchange) { // 调用 getPrice
    const symbolPrices = this.prices.get(symbol); // 定义常量 symbolPrices
    return symbolPrices?.get(exchange) || null; // 返回结果
  } // 结束代码块

  /**
   * 获取价差统计
   * Get spread statistics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 统计数据 / Statistics
   */
  getSpreadStats(symbol) { // 调用 getSpreadStats
    const history = this.spreadHistory.get(symbol); // 定义常量 history
    if (!history || history.length < 10) return null; // 条件判断 !history || history.length < 10

    const spreads = history.map(h => h.spread); // 定义函数 spreads
    const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length; // 定义函数 mean
    const variance = spreads.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / spreads.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std

    return { // 返回结果
      mean, // 执行语句
      std, // 执行语句
      min: Math.min(...spreads), // 最小
      max: Math.max(...spreads), // 最大
      count: spreads.length, // 数量
    }; // 结束代码块
  } // 结束代码块

  /**
   * 清除数据
   * Clear data
   */
  clear() { // 调用 clear
    this.prices.clear(); // 访问 prices
    this.spreads.clear(); // 访问 spreads
    this.spreadHistory.clear(); // 访问 spreadHistory
  } // 结束代码块
} // 结束代码块

/**
 * 套利仓位管理器
 * Arbitrage Position Manager
 */
export class ArbitragePositionManager extends EventEmitter { // 导出类 ArbitragePositionManager
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Configuration
   */
  constructor(config) { // 构造函数
    super(); // 调用父类

    this.config = config; // 设置 config

    // 活跃套利仓位 / Active arbitrage positions
    // 格式: { id: { symbol, buyExchange, sellExchange, buyPosition, sellPosition, ... } }
    this.positions = new Map(); // 设置 positions

    // 仓位ID计数器 / Position ID counter
    this.positionIdCounter = 0; // 设置 positionIdCounter

    // 统计 / Statistics
    this.stats = { // 设置 stats
      totalOpened: 0, // 总Opened
      totalClosed: 0, // 总Closed
      totalProfit: 0, // 总盈利
      totalLoss: 0, // 总亏损
    }; // 结束代码块
  } // 结束代码块

  /**
   * 开启套利仓位
   * Open arbitrage position
   *
   * @param {Object} opportunity - 套利机会 / Arbitrage opportunity
   * @param {number} size - 仓位大小 / Position size
   * @returns {Object} 开仓结果 / Open result
   */
  openPosition(opportunity, size) { // 调用 openPosition
    const id = `ARB_${++this.positionIdCounter}_${Date.now()}`; // 定义常量 id

    const position = { // 定义常量 position
      id, // 执行语句
      symbol: opportunity.symbol, // 交易对
      buyExchange: opportunity.buyExchange, // buy交易所
      sellExchange: opportunity.sellExchange, // sell交易所
      buyPrice: opportunity.buyPrice, // buy价格
      sellPrice: opportunity.sellPrice, // sell价格
      openSpread: opportunity.spread, // 开盘价差
      size, // 执行语句
      openTime: Date.now(), // 开盘时间
      status: 'active', // 状态
      realizedPnl: 0, // 已实现盈亏
      fundingIncome: 0, // 资金费率Income
    }; // 结束代码块

    this.positions.set(id, position); // 访问 positions
    this.stats.totalOpened++; // 访问 stats

    this.emit('positionOpened', position); // 调用 emit

    return { id, position }; // 返回结果
  } // 结束代码块

  /**
   * 关闭套利仓位
   * Close arbitrage position
   *
   * @param {string} id - 仓位ID / Position ID
   * @param {Object} closeData - 平仓数据 / Close data
   * @returns {Object} 平仓结果 / Close result
   */
  closePosition(id, closeData) { // 调用 closePosition
    const position = this.positions.get(id); // 定义常量 position
    if (!position) { // 条件判断 !position
      throw new Error(`Position not found: ${id}`); // 抛出异常
    } // 结束代码块

    // 计算PnL / Calculate PnL
    const buyPnl = closeData.buyClosePrice // 定义常量 buyPnl
      ? (closeData.buyClosePrice - position.buyPrice) / position.buyPrice * position.size // 执行语句
      : 0; // 执行语句
    const sellPnl = closeData.sellClosePrice // 定义常量 sellPnl
      ? (position.sellPrice - closeData.sellClosePrice) / position.sellPrice * position.size // 执行语句
      : 0; // 执行语句

    position.closeTime = Date.now(); // 赋值 position.closeTime
    position.buyClosePrice = closeData.buyClosePrice; // 赋值 position.buyClosePrice
    position.sellClosePrice = closeData.sellClosePrice; // 赋值 position.sellClosePrice
    position.closeSpread = closeData.closeSpread || 0; // 赋值 position.closeSpread
    position.realizedPnl = buyPnl + sellPnl - this.config.tradingFee * 4 * position.size;  // 开平各两边
    position.status = 'closed'; // 赋值 position.status
    position.closeReason = closeData.reason || 'manual'; // 赋值 position.closeReason

    // 更新统计 / Update statistics
    this.stats.totalClosed++; // 访问 stats
    if (position.realizedPnl > 0) { // 条件判断 position.realizedPnl > 0
      this.stats.totalProfit += position.realizedPnl; // 访问 stats
    } else { // 执行语句
      this.stats.totalLoss += Math.abs(position.realizedPnl); // 访问 stats
    } // 结束代码块

    this.emit('positionClosed', position); // 调用 emit

    return { id, position }; // 返回结果
  } // 结束代码块

  /**
   * 获取活跃仓位
   * Get active positions
   *
   * @returns {Array} 活跃仓位列表 / Active position list
   */
  getActivePositions() { // 调用 getActivePositions
    const active = []; // 定义常量 active
    for (const [id, position] of this.positions) { // 循环 const [id, position] of this.positions
      if (position.status === 'active') { // 条件判断 position.status === 'active'
        active.push({ id, ...position }); // 调用 active.push
      } // 结束代码块
    } // 结束代码块
    return active; // 返回结果
  } // 结束代码块

  /**
   * 获取总敞口
   * Get total exposure
   *
   * @returns {number} 总敞口 / Total exposure
   */
  getTotalExposure() { // 调用 getTotalExposure
    let total = 0; // 定义变量 total
    for (const position of this.positions.values()) { // 循环 const position of this.positions.values()
      if (position.status === 'active') { // 条件判断 position.status === 'active'
        total += position.size; // 执行语句
      } // 结束代码块
    } // 结束代码块
    return total; // 返回结果
  } // 结束代码块

  /**
   * 获取统计
   * Get statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      ...this.stats, // 展开对象或数组
      activeCount: this.getActivePositions().length, // 活跃数量
      totalExposure: this.getTotalExposure(), // 总Exposure
      netProfit: this.stats.totalProfit - this.stats.totalLoss, // net盈利
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 跨交易所价差策略
 * Cross-Exchange Spread Strategy
 */
export class CrossExchangeSpreadStrategy extends CrossSectionalStrategy { // 导出类 CrossExchangeSpreadStrategy
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) { // 构造函数
    // 合并配置 / Merge configuration
    const config = { ...DEFAULT_CONFIG, ...params }; // 定义常量 config

    // 调用父类构造函数 / Call parent constructor
    super(config); // 调用父类

    // 设置策略类型 / Set strategy type
    this.strategyType = CROSS_SECTIONAL_TYPES.CROSS_EXCHANGE_SPREAD; // 设置 strategyType

    // 价格管理器 / Price manager
    this.priceManager = new CrossExchangePriceManager(config); // 设置 priceManager

    // 套利仓位管理器 / Arbitrage position manager
    this.arbPositionManager = new ArbitragePositionManager(config); // 设置 arbPositionManager

    // 交易所实例 / Exchange instances
    this.exchanges = new Map(); // 设置 exchanges

    // 设置监听器 / Set up listeners
    this._setupListeners(); // 调用 _setupListeners
  } // 结束代码块

  /**
   * 设置监听器
   * Set up listeners
   * @private
   */
  _setupListeners() { // 调用 _setupListeners
    // 监听价格更新 / Listen for price updates
    this.priceManager.on('priceUpdated', ({ symbol }) => { // 访问 priceManager
      if (this.running) { // 条件判断 this.running
        this._checkSpreadOpportunities(symbol); // 调用 _checkSpreadOpportunities
      } // 结束代码块
    }); // 结束代码块

    // 监听仓位开启 / Listen for position opened
    this.arbPositionManager.on('positionOpened', (position) => { // 访问 arbPositionManager
      this.log( // 调用 log
        `套利开仓: ${position.symbol} 买@${position.buyExchange} 卖@${position.sellExchange} ` + // 执行语句
        `价差${(position.openSpread * 100).toFixed(3)}%`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数
    }); // 结束代码块

    // 监听仓位关闭 / Listen for position closed
    this.arbPositionManager.on('positionClosed', (position) => { // 访问 arbPositionManager
      this.log( // 调用 log
        `套利平仓: ${position.symbol} PnL: ${(position.realizedPnl * 100).toFixed(4)}% ` + // 执行语句
        `原因: ${position.closeReason}`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 跨交易所价差策略只需要 Ticker 数据 / Cross-exchange spread only needs ticker
    return ['ticker']; // 返回结果
  } // 结束代码块

  /**
   * 初始化策略
   * Initialize strategy
   *
   * @param {Map} exchanges - 交易所实例 / Exchange instances
   */
  async onInit(exchanges) { // 执行语句
    this.log('跨交易所价差策略初始化', 'info'); // 调用 log
    this.log(`交易所: ${this.config.exchanges.join(', ')}`, 'info'); // 调用 log
    this.log(`最小价差: ${(this.config.minSpreadToOpen * 100).toFixed(2)}%`, 'info'); // 调用 log

    // 保存交易所实例 / Save exchange instances
    if (exchanges) { // 条件判断 exchanges
      this.exchanges = exchanges; // 设置 exchanges
    } // 结束代码块

    // 调用父类初始化 / Call parent init
    await super.onInit(); // 等待异步结果
  } // 结束代码块

  /**
   * 处理Ticker更新
   * Handle ticker update
   *
   * @param {Object} data - Ticker数据 / Ticker data
   */
  async onTicker(data) { // 执行语句
    if (!this.running) return; // 条件判断 !this.running

    // 更新价格管理器 / Update price manager
    if (data.symbol && data.exchange) { // 条件判断 data.symbol && data.exchange
      this.priceManager.updatePrice(data.symbol, data.exchange, { // 访问 priceManager
        bid: data.bid, // bid
        ask: data.ask, // ask
        last: data.last, // last
        volume: data.volume, // 成交量
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查价差机会
   * Check spread opportunities
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  async _checkSpreadOpportunities(symbol) { // 执行语句
    // 检查现有仓位的平仓条件 / Check close conditions for existing positions
    await this._checkCloseConditions(); // 等待异步结果

    // 获取最佳价差 / Get best spread
    const bestSpread = this.priceManager.getBestSpread(symbol); // 定义常量 bestSpread

    if (!bestSpread) return; // 条件判断 !bestSpread

    // 检查是否满足开仓条件 / Check if opening conditions are met
    if (bestSpread.netSpread < this.config.minSpreadToOpen) return; // 条件判断 bestSpread.netSpread < this.config.minSpreadT...

    // 检查是否已有该交易对的仓位 / Check if already has position for this symbol
    const existingPosition = this.arbPositionManager.getActivePositions() // 定义常量 existingPosition
      .find(p => p.symbol === symbol); // 定义箭头函数

    if (existingPosition) { // 条件判断 existingPosition
      // 已有仓位，跳过 / Already has position, skip
      return; // 返回结果
    } // 结束代码块

    // 检查总敞口 / Check total exposure
    const currentExposure = this.arbPositionManager.getTotalExposure(); // 定义常量 currentExposure
    if (currentExposure >= this.config.maxTotalPosition) { // 条件判断 currentExposure >= this.config.maxTotalPosition
      return; // 返回结果
    } // 结束代码块

    // 开仓 / Open position
    await this._openArbitragePosition(bestSpread); // 等待异步结果
  } // 结束代码块

  /**
   * 开启套利仓位
   * Open arbitrage position
   *
   * @param {Object} opportunity - 套利机会 / Opportunity
   * @private
   */
  async _openArbitragePosition(opportunity) { // 执行语句
    // 计算仓位大小 / Calculate position size
    const currentExposure = this.arbPositionManager.getTotalExposure(); // 定义常量 currentExposure
    const availableSize = this.config.maxTotalPosition - currentExposure; // 定义常量 availableSize
    const size = Math.min(availableSize, this.config.maxPositionPerOpportunity); // 定义常量 size

    if (size < this.config.minPositionSize) { // 条件判断 size < this.config.minPositionSize
      return; // 返回结果
    } // 结束代码块

    // 开仓 / Open position
    const result = this.arbPositionManager.openPosition(opportunity, size); // 定义常量 result

    // 设置信号 / Set signal
    this.setBuySignal( // 调用 setBuySignal
      `跨所套利: ${opportunity.symbol} 买@${opportunity.buyExchange} 卖@${opportunity.sellExchange} ` + // 执行语句
      `价差${(opportunity.netSpread * 100).toFixed(3)}%` // 执行语句
    ); // 结束调用或参数

    // 发出事件 / Emit event
    this.emit('arbitrageOpened', result); // 调用 emit
  } // 结束代码块

  /**
   * 检查平仓条件
   * Check close conditions
   * @private
   */
  async _checkCloseConditions() { // 执行语句
    const activePositions = this.arbPositionManager.getActivePositions(); // 定义常量 activePositions

    for (const position of activePositions) { // 循环 const position of activePositions
      // 获取当前价格 / Get current prices
      const buyPrice = this.priceManager.getPrice(position.symbol, position.buyExchange); // 定义常量 buyPrice
      const sellPrice = this.priceManager.getPrice(position.symbol, position.sellExchange); // 定义常量 sellPrice

      if (!buyPrice || !sellPrice) continue; // 条件判断 !buyPrice || !sellPrice

      // 计算当前价差 / Calculate current spread
      const currentSpread = (sellPrice.bid - buyPrice.ask) / buyPrice.ask; // 定义常量 currentSpread

      let shouldClose = false; // 定义变量 shouldClose
      let closeReason = ''; // 定义变量 closeReason

      // 条件1: 价差收窄 / Condition 1: Spread narrowed
      if (currentSpread <= this.config.closeSpreadThreshold) { // 条件判断 currentSpread <= this.config.closeSpreadThres...
        shouldClose = true; // 赋值 shouldClose
        closeReason = `价差收窄: ${(currentSpread * 100).toFixed(3)}%`; // 赋值 closeReason
      } // 结束代码块

      // 条件2: 价差反向 / Condition 2: Spread reversed
      if (currentSpread <= this.config.emergencyCloseSpread) { // 条件判断 currentSpread <= this.config.emergencyCloseSp...
        shouldClose = true; // 赋值 shouldClose
        closeReason = `价差反向: ${(currentSpread * 100).toFixed(3)}%`; // 赋值 closeReason
      } // 结束代码块

      // 条件3: 超时 / Condition 3: Timeout
      const holdingTime = Date.now() - position.openTime; // 定义常量 holdingTime
      if (holdingTime >= this.config.maxHoldingTime) { // 条件判断 holdingTime >= this.config.maxHoldingTime
        shouldClose = true; // 赋值 shouldClose
        closeReason = `超时: ${(holdingTime / 3600000).toFixed(1)}小时`; // 赋值 closeReason
      } // 结束代码块

      // 条件4: 止损 / Condition 4: Stop loss
      const estimatedPnl = currentSpread - position.openSpread; // 定义常量 estimatedPnl
      if (estimatedPnl <= -this.config.stopLoss) { // 条件判断 estimatedPnl <= -this.config.stopLoss
        shouldClose = true; // 赋值 shouldClose
        closeReason = `止损: 预估损失${(estimatedPnl * 100).toFixed(3)}%`; // 赋值 closeReason
      } // 结束代码块

      // 执行平仓 / Execute close
      if (shouldClose) { // 条件判断 shouldClose
        this.arbPositionManager.closePosition(position.id, { // 访问 arbPositionManager
          buyClosePrice: buyPrice.bid, // buy收盘价格
          sellClosePrice: sellPrice.ask, // sell收盘价格
          closeSpread: currentSpread, // 收盘价差
          reason: closeReason, // reason
        }); // 结束代码块

        this.setSellSignal(`套利平仓: ${position.symbol} ${closeReason}`); // 调用 setSellSignal
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取排名 (覆盖父类)
   * Get ranking (override parent)
   *
   * @returns {Array} 排名列表 / Ranking list
   */
  getCurrentRanking() { // 调用 getCurrentRanking
    const opportunities = this.priceManager.getAllSpreadOpportunities(); // 定义常量 opportunities

    return opportunities.map((opp, index) => ({ // 返回结果
      symbol: opp.symbol, // 交易对
      value: opp.netSpread, // value
      rank: index + 1, // rank
      buyExchange: opp.buyExchange, // buy交易所
      sellExchange: opp.sellExchange, // sell交易所
      spread: opp.spread, // 价差
      netSpread: opp.netSpread, // net价差
      buyPrice: opp.buyPrice, // buy价格
      sellPrice: opp.sellPrice, // sell价格
      stats: this.priceManager.getSpreadStats(opp.symbol), // stats
    })); // 结束代码块
  } // 结束代码块

  /**
   * 执行再平衡 (覆盖父类)
   * Execute rebalancing (override parent)
   * @private
   */
  async _executeRebalance() { // 执行语句
    // 跨交易所价差策略不使用父类的再平衡逻辑
    // Cross-exchange spread strategy doesn't use parent's rebalance logic
    // 而是实时监控价差
    // Instead, it monitors spreads in real-time

    // 检查仓位平衡 / Check position balance
    if (this.config.autoRebalance) { // 条件判断 this.config.autoRebalance
      await this._checkPositionBalance(); // 等待异步结果
    } // 结束代码块

    // 标记已再平衡 / Mark as rebalanced
    this.portfolioManager.markRebalanced(); // 访问 portfolioManager
  } // 结束代码块

  /**
   * 检查仓位平衡
   * Check position balance
   * @private
   */
  async _checkPositionBalance() { // 执行语句
    const activePositions = this.arbPositionManager.getActivePositions(); // 定义常量 activePositions

    for (const position of activePositions) { // 循环 const position of activePositions
      // 这里可以实现仓位再平衡逻辑
      // Here can implement position rebalancing logic
      // 例如: 当买卖两边仓位不平衡时进行调整
      // e.g., adjust when buy/sell sides are imbalanced
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取策略状态 (覆盖父类)
   * Get strategy status (override parent)
   *
   * @returns {Object} 策略状态 / Strategy status
   */
  getStatus() { // 调用 getStatus
    const baseStatus = super.getStatus(); // 定义常量 baseStatus
    const arbStats = this.arbPositionManager.getStats(); // 定义常量 arbStats
    const opportunities = this.priceManager.getAllSpreadOpportunities(); // 定义常量 opportunities

    return { // 返回结果
      ...baseStatus, // 展开对象或数组
      spreadType: this.config.spreadType, // 价差类型
      exchanges: this.config.exchanges, // 交易所
      arbitrageStats: arbStats, // 套利Stats
      activeArbitrages: this.arbPositionManager.getActivePositions(), // 活跃Arbitrages
      topOpportunities: opportunities.slice(0, 5).map(o => ({ // topOpportunities
        symbol: o.symbol, // 交易对
        buyExchange: o.buyExchange, // buy交易所
        sellExchange: o.sellExchange, // sell交易所
        netSpread: (o.netSpread * 100).toFixed(3) + '%', // net价差
      })), // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取所有价差机会
   * Get all spread opportunities
   *
   * @returns {Array} 价差机会列表 / Spread opportunity list
   */
  getSpreadOpportunities() { // 调用 getSpreadOpportunities
    return this.priceManager.getAllSpreadOpportunities(); // 返回结果
  } // 结束代码块

  /**
   * 获取套利统计
   * Get arbitrage statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getArbitrageStats() { // 调用 getArbitrageStats
    return this.arbPositionManager.getStats(); // 返回结果
  } // 结束代码块

  /**
   * 手动开启套利
   * Manual open arbitrage
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} buyExchange - 买入交易所 / Buy exchange
   * @param {string} sellExchange - 卖出交易所 / Sell exchange
   * @param {number} size - 仓位大小 / Position size
   * @returns {Object} 开仓结果 / Open result
   */
  async manualOpenArbitrage(symbol, buyExchange, sellExchange, size) { // 执行语句
    const buyPrice = this.priceManager.getPrice(symbol, buyExchange); // 定义常量 buyPrice
    const sellPrice = this.priceManager.getPrice(symbol, sellExchange); // 定义常量 sellPrice

    if (!buyPrice || !sellPrice) { // 条件判断 !buyPrice || !sellPrice
      throw new Error('Price data not available'); // 抛出异常
    } // 结束代码块

    const spread = (sellPrice.bid - buyPrice.ask) / buyPrice.ask; // 定义常量 spread

    return this.arbPositionManager.openPosition({ // 返回结果
      symbol, // 执行语句
      buyExchange, // 执行语句
      sellExchange, // 执行语句
      buyPrice: buyPrice.ask, // buy价格
      sellPrice: sellPrice.bid, // sell价格
      spread, // 执行语句
    }, size); // 执行语句
  } // 结束代码块

  /**
   * 手动关闭套利
   * Manual close arbitrage
   *
   * @param {string} id - 仓位ID / Position ID
   * @returns {Object} 平仓结果 / Close result
   */
  async manualCloseArbitrage(id) { // 执行语句
    const position = this.arbPositionManager.positions.get(id); // 定义常量 position
    if (!position) { // 条件判断 !position
      throw new Error(`Position not found: ${id}`); // 抛出异常
    } // 结束代码块

    const buyPrice = this.priceManager.getPrice(position.symbol, position.buyExchange); // 定义常量 buyPrice
    const sellPrice = this.priceManager.getPrice(position.symbol, position.sellExchange); // 定义常量 sellPrice

    return this.arbPositionManager.closePosition(id, { // 返回结果
      buyClosePrice: buyPrice?.bid || position.buyPrice, // buy收盘价格
      sellClosePrice: sellPrice?.ask || position.sellPrice, // sell收盘价格
      reason: 'manual', // reason
    }); // 结束代码块
  } // 结束代码块

  /**
   * 关闭所有套利仓位
   * Close all arbitrage positions
   *
   * @returns {Array} 平仓结果列表 / Close result list
   */
  async closeAllArbitrages() { // 执行语句
    const results = []; // 定义常量 results
    const activePositions = this.arbPositionManager.getActivePositions(); // 定义常量 activePositions

    for (const position of activePositions) { // 循环 const position of activePositions
      try { // 尝试执行
        const result = await this.manualCloseArbitrage(position.id); // 定义常量 result
        results.push(result); // 调用 results.push
      } catch (error) { // 执行语句
        results.push({ id: position.id, error: error.message }); // 调用 results.push
      } // 结束代码块
    } // 结束代码块

    return results; // 返回结果
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { // 导出命名成员
  DEFAULT_CONFIG as CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG, // 执行语句
}; // 结束代码块

export default CrossExchangeSpreadStrategy; // 默认导出
