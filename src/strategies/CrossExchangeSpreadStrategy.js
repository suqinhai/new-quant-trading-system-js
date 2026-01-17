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
import {
  CrossSectionalStrategy,
  CROSS_SECTIONAL_TYPES,
  POSITION_TYPE,
} from './CrossSectionalStrategy.js';

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 支持的交易所
 * Supported exchanges
 */
export const SUPPORTED_EXCHANGES = {
  BINANCE: 'binance',
  BYBIT: 'bybit',
  OKX: 'okx',
  GATE: 'gate',
  HUOBI: 'huobi',
  KUCOIN: 'kucoin',
};

/**
 * 价差类型
 * Spread types
 */
export const SPREAD_TYPES = {
  SPOT_SPOT: 'spot_spot',           // 现货-现货
  PERP_PERP: 'perp_perp',           // 永续-永续
  SPOT_PERP: 'spot_perp',           // 现货-永续
  FUTURES_SPOT: 'futures_spot',     // 期货-现货
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  name: 'CrossExchangeSpreadStrategy',

  // 监控的交易对列表 / Symbols to monitor
  // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
  symbols: [
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
    'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT',
  ],

  // 监控的交易所 / Exchanges to monitor
  // 注意: 需要与系统实际连接的交易所保持一致
  // Note: Should match exchanges actually connected by the system
  exchanges: [
    SUPPORTED_EXCHANGES.BINANCE,
    SUPPORTED_EXCHANGES.OKX,
    SUPPORTED_EXCHANGES.GATE,
  ],

  // 价差类型 / Spread type
  spreadType: SPREAD_TYPES.PERP_PERP,

  // ============================================
  // 价差配置 / Spread Configuration
  // ============================================

  // 最小价差阈值 (开仓) / Minimum spread threshold (open)
  minSpreadToOpen: 0.003,  // 0.3%

  // 平仓价差阈值 / Close spread threshold
  closeSpreadThreshold: 0.001,  // 0.1%

  // 紧急平仓价差 (价差反向) / Emergency close spread (spread reversal)
  emergencyCloseSpread: -0.002,  // -0.2%

  // 最大价差 (避免异常数据) / Max spread (avoid anomalous data)
  maxSpread: 0.05,  // 5%

  // ============================================
  // 排名配置 / Ranking Configuration
  // ============================================

  // 选取 Top N 个价差机会 / Select top N spread opportunities
  topN: 5,

  // 最小排名分数 / Minimum ranking score
  minRankingScore: 0.002,

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 单个套利机会最大仓位 / Max position per opportunity
  maxPositionPerOpportunity: 0.08,

  // 总套利仓位 / Total arbitrage position
  maxTotalPosition: 0.40,

  // 最小仓位 / Minimum position
  minPositionSize: 0.01,

  // 杠杆 / Leverage
  leverage: 3,

  // ============================================
  // 执行配置 / Execution Configuration
  // ============================================

  // 是否同时下单 / Simultaneous order execution
  simultaneousExecution: true,

  // 最大滑点 / Max slippage
  maxSlippage: 0.001,  // 0.1%

  // 订单类型 / Order type
  orderType: 'market',

  // 订单超时 (毫秒) / Order timeout (ms)
  orderTimeout: 5000,

  // ============================================
  // 再平衡配置 / Rebalancing Configuration
  // ============================================

  // 价差检查间隔 (毫秒) / Spread check interval (ms)
  spreadCheckInterval: 1000,

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 5 * 60 * 1000,  // 每5分钟

  // ============================================
  // 仓位平衡配置 / Position Balance Configuration
  // ============================================

  // 仓位不平衡阈值 / Position imbalance threshold
  imbalanceThreshold: 0.05,  // 5%

  // 自动再平衡 / Auto rebalance
  autoRebalance: true,

  // ============================================
  // 成本配置 / Cost Configuration
  // ============================================

  // 交易手续费 (taker) / Trading fee (taker)
  tradingFee: 0.0005,  // 0.05%

  // 是否计算资金费差异 / Consider funding rate difference
  considerFundingDiff: true,

  // 提现/转账成本 / Withdrawal/transfer cost
  transferCost: 0,

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 单笔止损 / Per-trade stop loss
  stopLoss: 0.02,

  // 最大持仓时间 (毫秒) / Max holding time (ms)
  maxHoldingTime: 24 * 60 * 60 * 1000,  // 24小时

  // 最大单日亏损 / Max daily loss
  maxDailyLoss: 0.02,

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  verbose: true,
  logPrefix: '[CrossExchangeSpread]',
};

// ============================================
// 辅助类 / Helper Classes
// ============================================

/**
 * 跨交易所价格管理器
 * Cross-Exchange Price Manager
 */
export class CrossExchangePriceManager extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Configuration
   */
  constructor(config) {
    super();

    this.config = config;

    // 价格数据
    // 格式: { symbol: { exchange: { bid, ask, mid, timestamp } } }
    this.prices = new Map();

    // 价差数据
    // 格式: { key: { symbol, buyExchange, sellExchange, spread, ... } }
    this.spreads = new Map();

    // 历史价差 / Historical spreads
    this.spreadHistory = new Map();
  }

  /**
   * 更新价格
   * Update price
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所 / Exchange
   * @param {Object} priceData - 价格数据 / Price data
   */
  updatePrice(symbol, exchange, priceData) {
    // 初始化交易对价格映射 / Initialize symbol price map
    if (!this.prices.has(symbol)) {
      this.prices.set(symbol, new Map());
    }

    const symbolPrices = this.prices.get(symbol);

    // 保存价格 / Save price
    symbolPrices.set(exchange, {
      bid: priceData.bid || priceData.last,
      ask: priceData.ask || priceData.last,
      mid: (priceData.bid + priceData.ask) / 2 || priceData.last,
      last: priceData.last,
      volume: priceData.volume || 0,
      timestamp: Date.now(),
    });

    // 更新价差 / Update spreads
    this._updateSpreads(symbol);

    // 发出更新事件 / Emit update event
    this.emit('priceUpdated', { symbol, exchange, price: symbolPrices.get(exchange) });
  }

  /**
   * 更新价差
   * Update spreads
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  _updateSpreads(symbol) {
    const symbolPrices = this.prices.get(symbol);
    if (!symbolPrices || symbolPrices.size < 2) return;

    const exchanges = Array.from(symbolPrices.keys());

    // 计算所有交易所对的价差 / Calculate spreads for all exchange pairs
    for (let i = 0; i < exchanges.length; i++) {
      for (let j = i + 1; j < exchanges.length; j++) {
        const ex1 = exchanges[i];
        const ex2 = exchanges[j];

        const price1 = symbolPrices.get(ex1);
        const price2 = symbolPrices.get(ex2);

        // 检查价格有效性 / Check price validity
        if (!price1 || !price2) continue;
        if (Date.now() - price1.timestamp > 10000) continue;  // 超过10秒的数据无效
        if (Date.now() - price2.timestamp > 10000) continue;

        // 计算价差 (以买入ex1、卖出ex2为正方向)
        // Calculate spread (buy ex1, sell ex2 as positive direction)
        // 价差 = (ex2卖价 - ex1买价) / ex1买价
        // Spread = (ex2 ask - ex1 bid) / ex1 bid
        const spread1to2 = (price2.bid - price1.ask) / price1.ask;
        const spread2to1 = (price1.bid - price2.ask) / price2.ask;

        // 取最佳方向 / Take best direction
        if (spread1to2 > spread2to1) {
          // 买ex1，卖ex2
          const key = `${symbol}:${ex1}:${ex2}`;
          this.spreads.set(key, {
            symbol,
            buyExchange: ex1,
            sellExchange: ex2,
            spread: spread1to2,
            buyPrice: price1.ask,
            sellPrice: price2.bid,
            timestamp: Date.now(),
          });
        } else {
          // 买ex2，卖ex1
          const key = `${symbol}:${ex2}:${ex1}`;
          this.spreads.set(key, {
            symbol,
            buyExchange: ex2,
            sellExchange: ex1,
            spread: spread2to1,
            buyPrice: price2.ask,
            sellPrice: price1.bid,
            timestamp: Date.now(),
          });
        }

        // 记录历史 / Record history
        this._recordSpreadHistory(symbol, Math.max(spread1to2, spread2to1));
      }
    }
  }

  /**
   * 记录价差历史
   * Record spread history
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} spread - 价差 / Spread
   * @private
   */
  _recordSpreadHistory(symbol, spread) {
    if (!this.spreadHistory.has(symbol)) {
      this.spreadHistory.set(symbol, []);
    }

    const history = this.spreadHistory.get(symbol);
    history.push({
      spread,
      timestamp: Date.now(),
    });

    // 保留最近1000条 / Keep last 1000 records
    if (history.length > 1000) {
      history.shift();
    }
  }

  /**
   * 获取所有价差机会
   * Get all spread opportunities
   *
   * @returns {Array} 价差机会列表 / Spread opportunity list
   */
  getAllSpreadOpportunities() {
    const opportunities = [];

    for (const [key, spread] of this.spreads) {
      // 检查价差有效性 / Check spread validity
      if (Date.now() - spread.timestamp > 5000) continue;  // 超过5秒的数据无效
      if (spread.spread < this.config.minSpreadToOpen) continue;
      if (spread.spread > this.config.maxSpread) continue;  // 异常数据

      opportunities.push({
        ...spread,
        key,
        netSpread: spread.spread - this.config.tradingFee * 2,  // 扣除双边手续费
      });
    }

    // 按净价差排序 / Sort by net spread
    opportunities.sort((a, b) => b.netSpread - a.netSpread);

    return opportunities;
  }

  /**
   * 获取特定交易对的最佳价差
   * Get best spread for a symbol
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 最佳价差机会 / Best spread opportunity
   */
  getBestSpread(symbol) {
    const opportunities = this.getAllSpreadOpportunities()
      .filter(o => o.symbol === symbol);

    return opportunities.length > 0 ? opportunities[0] : null;
  }

  /**
   * 获取价格
   * Get price
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所 / Exchange
   * @returns {Object|null} 价格数据 / Price data
   */
  getPrice(symbol, exchange) {
    const symbolPrices = this.prices.get(symbol);
    return symbolPrices?.get(exchange) || null;
  }

  /**
   * 获取价差统计
   * Get spread statistics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 统计数据 / Statistics
   */
  getSpreadStats(symbol) {
    const history = this.spreadHistory.get(symbol);
    if (!history || history.length < 10) return null;

    const spreads = history.map(h => h.spread);
    const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const variance = spreads.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / spreads.length;
    const std = Math.sqrt(variance);

    return {
      mean,
      std,
      min: Math.min(...spreads),
      max: Math.max(...spreads),
      count: spreads.length,
    };
  }

  /**
   * 清除数据
   * Clear data
   */
  clear() {
    this.prices.clear();
    this.spreads.clear();
    this.spreadHistory.clear();
  }
}

/**
 * 套利仓位管理器
 * Arbitrage Position Manager
 */
export class ArbitragePositionManager extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Configuration
   */
  constructor(config) {
    super();

    this.config = config;

    // 活跃套利仓位 / Active arbitrage positions
    // 格式: { id: { symbol, buyExchange, sellExchange, buyPosition, sellPosition, ... } }
    this.positions = new Map();

    // 仓位ID计数器 / Position ID counter
    this.positionIdCounter = 0;

    // 统计 / Statistics
    this.stats = {
      totalOpened: 0,
      totalClosed: 0,
      totalProfit: 0,
      totalLoss: 0,
    };
  }

  /**
   * 开启套利仓位
   * Open arbitrage position
   *
   * @param {Object} opportunity - 套利机会 / Arbitrage opportunity
   * @param {number} size - 仓位大小 / Position size
   * @returns {Object} 开仓结果 / Open result
   */
  openPosition(opportunity, size) {
    const id = `ARB_${++this.positionIdCounter}_${Date.now()}`;

    const position = {
      id,
      symbol: opportunity.symbol,
      buyExchange: opportunity.buyExchange,
      sellExchange: opportunity.sellExchange,
      buyPrice: opportunity.buyPrice,
      sellPrice: opportunity.sellPrice,
      openSpread: opportunity.spread,
      size,
      openTime: Date.now(),
      status: 'active',
      realizedPnl: 0,
      fundingIncome: 0,
    };

    this.positions.set(id, position);
    this.stats.totalOpened++;

    this.emit('positionOpened', position);

    return { id, position };
  }

  /**
   * 关闭套利仓位
   * Close arbitrage position
   *
   * @param {string} id - 仓位ID / Position ID
   * @param {Object} closeData - 平仓数据 / Close data
   * @returns {Object} 平仓结果 / Close result
   */
  closePosition(id, closeData) {
    const position = this.positions.get(id);
    if (!position) {
      throw new Error(`Position not found: ${id}`);
    }

    // 计算PnL / Calculate PnL
    const buyPnl = closeData.buyClosePrice
      ? (closeData.buyClosePrice - position.buyPrice) / position.buyPrice * position.size
      : 0;
    const sellPnl = closeData.sellClosePrice
      ? (position.sellPrice - closeData.sellClosePrice) / position.sellPrice * position.size
      : 0;

    position.closeTime = Date.now();
    position.buyClosePrice = closeData.buyClosePrice;
    position.sellClosePrice = closeData.sellClosePrice;
    position.closeSpread = closeData.closeSpread || 0;
    position.realizedPnl = buyPnl + sellPnl - this.config.tradingFee * 4 * position.size;  // 开平各两边
    position.status = 'closed';
    position.closeReason = closeData.reason || 'manual';

    // 更新统计 / Update statistics
    this.stats.totalClosed++;
    if (position.realizedPnl > 0) {
      this.stats.totalProfit += position.realizedPnl;
    } else {
      this.stats.totalLoss += Math.abs(position.realizedPnl);
    }

    this.emit('positionClosed', position);

    return { id, position };
  }

  /**
   * 获取活跃仓位
   * Get active positions
   *
   * @returns {Array} 活跃仓位列表 / Active position list
   */
  getActivePositions() {
    const active = [];
    for (const [id, position] of this.positions) {
      if (position.status === 'active') {
        active.push({ id, ...position });
      }
    }
    return active;
  }

  /**
   * 获取总敞口
   * Get total exposure
   *
   * @returns {number} 总敞口 / Total exposure
   */
  getTotalExposure() {
    let total = 0;
    for (const position of this.positions.values()) {
      if (position.status === 'active') {
        total += position.size;
      }
    }
    return total;
  }

  /**
   * 获取统计
   * Get statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeCount: this.getActivePositions().length,
      totalExposure: this.getTotalExposure(),
      netProfit: this.stats.totalProfit - this.stats.totalLoss,
    };
  }
}

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 跨交易所价差策略
 * Cross-Exchange Spread Strategy
 */
export class CrossExchangeSpreadStrategy extends CrossSectionalStrategy {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 合并配置 / Merge configuration
    const config = { ...DEFAULT_CONFIG, ...params };

    // 调用父类构造函数 / Call parent constructor
    super(config);

    // 设置策略类型 / Set strategy type
    this.strategyType = CROSS_SECTIONAL_TYPES.CROSS_EXCHANGE_SPREAD;

    // 价格管理器 / Price manager
    this.priceManager = new CrossExchangePriceManager(config);

    // 套利仓位管理器 / Arbitrage position manager
    this.arbPositionManager = new ArbitragePositionManager(config);

    // 交易所实例 / Exchange instances
    this.exchanges = new Map();

    // 设置监听器 / Set up listeners
    this._setupListeners();
  }

  /**
   * 设置监听器
   * Set up listeners
   * @private
   */
  _setupListeners() {
    // 监听价格更新 / Listen for price updates
    this.priceManager.on('priceUpdated', ({ symbol }) => {
      if (this.running) {
        this._checkSpreadOpportunities(symbol);
      }
    });

    // 监听仓位开启 / Listen for position opened
    this.arbPositionManager.on('positionOpened', (position) => {
      this.log(
        `套利开仓: ${position.symbol} 买@${position.buyExchange} 卖@${position.sellExchange} ` +
        `价差${(position.openSpread * 100).toFixed(3)}%`,
        'info'
      );
    });

    // 监听仓位关闭 / Listen for position closed
    this.arbPositionManager.on('positionClosed', (position) => {
      this.log(
        `套利平仓: ${position.symbol} PnL: ${(position.realizedPnl * 100).toFixed(4)}% ` +
        `原因: ${position.closeReason}`,
        'info'
      );
    });
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 跨交易所价差策略只需要 Ticker 数据 / Cross-exchange spread only needs ticker
    return ['ticker'];
  }

  /**
   * 初始化策略
   * Initialize strategy
   *
   * @param {Map} exchanges - 交易所实例 / Exchange instances
   */
  async onInit(exchanges) {
    this.log('跨交易所价差策略初始化', 'info');
    this.log(`交易所: ${this.config.exchanges.join(', ')}`, 'info');
    this.log(`最小价差: ${(this.config.minSpreadToOpen * 100).toFixed(2)}%`, 'info');

    // 保存交易所实例 / Save exchange instances
    if (exchanges) {
      this.exchanges = exchanges;
    }

    // 调用父类初始化 / Call parent init
    await super.onInit();
  }

  /**
   * 处理Ticker更新
   * Handle ticker update
   *
   * @param {Object} data - Ticker数据 / Ticker data
   */
  async onTicker(data) {
    if (!this.running) return;

    // 更新价格管理器 / Update price manager
    if (data.symbol && data.exchange) {
      this.priceManager.updatePrice(data.symbol, data.exchange, {
        bid: data.bid,
        ask: data.ask,
        last: data.last,
        volume: data.volume,
      });
    }
  }

  /**
   * 检查价差机会
   * Check spread opportunities
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  async _checkSpreadOpportunities(symbol) {
    // 检查现有仓位的平仓条件 / Check close conditions for existing positions
    await this._checkCloseConditions();

    // 获取最佳价差 / Get best spread
    const bestSpread = this.priceManager.getBestSpread(symbol);

    if (!bestSpread) return;

    // 检查是否满足开仓条件 / Check if opening conditions are met
    if (bestSpread.netSpread < this.config.minSpreadToOpen) return;

    // 检查是否已有该交易对的仓位 / Check if already has position for this symbol
    const existingPosition = this.arbPositionManager.getActivePositions()
      .find(p => p.symbol === symbol);

    if (existingPosition) {
      // 已有仓位，跳过 / Already has position, skip
      return;
    }

    // 检查总敞口 / Check total exposure
    const currentExposure = this.arbPositionManager.getTotalExposure();
    if (currentExposure >= this.config.maxTotalPosition) {
      return;
    }

    // 开仓 / Open position
    await this._openArbitragePosition(bestSpread);
  }

  /**
   * 开启套利仓位
   * Open arbitrage position
   *
   * @param {Object} opportunity - 套利机会 / Opportunity
   * @private
   */
  async _openArbitragePosition(opportunity) {
    // 计算仓位大小 / Calculate position size
    const currentExposure = this.arbPositionManager.getTotalExposure();
    const availableSize = this.config.maxTotalPosition - currentExposure;
    const size = Math.min(availableSize, this.config.maxPositionPerOpportunity);

    if (size < this.config.minPositionSize) {
      return;
    }

    // 开仓 / Open position
    const result = this.arbPositionManager.openPosition(opportunity, size);

    // 设置信号 / Set signal
    this.setBuySignal(
      `跨所套利: ${opportunity.symbol} 买@${opportunity.buyExchange} 卖@${opportunity.sellExchange} ` +
      `价差${(opportunity.netSpread * 100).toFixed(3)}%`
    );

    // 发出事件 / Emit event
    this.emit('arbitrageOpened', result);
  }

  /**
   * 检查平仓条件
   * Check close conditions
   * @private
   */
  async _checkCloseConditions() {
    const activePositions = this.arbPositionManager.getActivePositions();

    for (const position of activePositions) {
      // 获取当前价格 / Get current prices
      const buyPrice = this.priceManager.getPrice(position.symbol, position.buyExchange);
      const sellPrice = this.priceManager.getPrice(position.symbol, position.sellExchange);

      if (!buyPrice || !sellPrice) continue;

      // 计算当前价差 / Calculate current spread
      const currentSpread = (sellPrice.bid - buyPrice.ask) / buyPrice.ask;

      let shouldClose = false;
      let closeReason = '';

      // 条件1: 价差收窄 / Condition 1: Spread narrowed
      if (currentSpread <= this.config.closeSpreadThreshold) {
        shouldClose = true;
        closeReason = `价差收窄: ${(currentSpread * 100).toFixed(3)}%`;
      }

      // 条件2: 价差反向 / Condition 2: Spread reversed
      if (currentSpread <= this.config.emergencyCloseSpread) {
        shouldClose = true;
        closeReason = `价差反向: ${(currentSpread * 100).toFixed(3)}%`;
      }

      // 条件3: 超时 / Condition 3: Timeout
      const holdingTime = Date.now() - position.openTime;
      if (holdingTime >= this.config.maxHoldingTime) {
        shouldClose = true;
        closeReason = `超时: ${(holdingTime / 3600000).toFixed(1)}小时`;
      }

      // 条件4: 止损 / Condition 4: Stop loss
      const estimatedPnl = currentSpread - position.openSpread;
      if (estimatedPnl <= -this.config.stopLoss) {
        shouldClose = true;
        closeReason = `止损: 预估损失${(estimatedPnl * 100).toFixed(3)}%`;
      }

      // 执行平仓 / Execute close
      if (shouldClose) {
        this.arbPositionManager.closePosition(position.id, {
          buyClosePrice: buyPrice.bid,
          sellClosePrice: sellPrice.ask,
          closeSpread: currentSpread,
          reason: closeReason,
        });

        this.setSellSignal(`套利平仓: ${position.symbol} ${closeReason}`);
      }
    }
  }

  /**
   * 获取排名 (覆盖父类)
   * Get ranking (override parent)
   *
   * @returns {Array} 排名列表 / Ranking list
   */
  getCurrentRanking() {
    const opportunities = this.priceManager.getAllSpreadOpportunities();

    return opportunities.map((opp, index) => ({
      symbol: opp.symbol,
      value: opp.netSpread,
      rank: index + 1,
      buyExchange: opp.buyExchange,
      sellExchange: opp.sellExchange,
      spread: opp.spread,
      netSpread: opp.netSpread,
      buyPrice: opp.buyPrice,
      sellPrice: opp.sellPrice,
      stats: this.priceManager.getSpreadStats(opp.symbol),
    }));
  }

  /**
   * 执行再平衡 (覆盖父类)
   * Execute rebalancing (override parent)
   * @private
   */
  async _executeRebalance() {
    // 跨交易所价差策略不使用父类的再平衡逻辑
    // Cross-exchange spread strategy doesn't use parent's rebalance logic
    // 而是实时监控价差
    // Instead, it monitors spreads in real-time

    // 检查仓位平衡 / Check position balance
    if (this.config.autoRebalance) {
      await this._checkPositionBalance();
    }

    // 标记已再平衡 / Mark as rebalanced
    this.portfolioManager.markRebalanced();
  }

  /**
   * 检查仓位平衡
   * Check position balance
   * @private
   */
  async _checkPositionBalance() {
    const activePositions = this.arbPositionManager.getActivePositions();

    for (const position of activePositions) {
      // 这里可以实现仓位再平衡逻辑
      // Here can implement position rebalancing logic
      // 例如: 当买卖两边仓位不平衡时进行调整
      // e.g., adjust when buy/sell sides are imbalanced
    }
  }

  /**
   * 获取策略状态 (覆盖父类)
   * Get strategy status (override parent)
   *
   * @returns {Object} 策略状态 / Strategy status
   */
  getStatus() {
    const baseStatus = super.getStatus();
    const arbStats = this.arbPositionManager.getStats();
    const opportunities = this.priceManager.getAllSpreadOpportunities();

    return {
      ...baseStatus,
      spreadType: this.config.spreadType,
      exchanges: this.config.exchanges,
      arbitrageStats: arbStats,
      activeArbitrages: this.arbPositionManager.getActivePositions(),
      topOpportunities: opportunities.slice(0, 5).map(o => ({
        symbol: o.symbol,
        buyExchange: o.buyExchange,
        sellExchange: o.sellExchange,
        netSpread: (o.netSpread * 100).toFixed(3) + '%',
      })),
    };
  }

  /**
   * 获取所有价差机会
   * Get all spread opportunities
   *
   * @returns {Array} 价差机会列表 / Spread opportunity list
   */
  getSpreadOpportunities() {
    return this.priceManager.getAllSpreadOpportunities();
  }

  /**
   * 获取套利统计
   * Get arbitrage statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getArbitrageStats() {
    return this.arbPositionManager.getStats();
  }

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
  async manualOpenArbitrage(symbol, buyExchange, sellExchange, size) {
    const buyPrice = this.priceManager.getPrice(symbol, buyExchange);
    const sellPrice = this.priceManager.getPrice(symbol, sellExchange);

    if (!buyPrice || !sellPrice) {
      throw new Error('Price data not available');
    }

    const spread = (sellPrice.bid - buyPrice.ask) / buyPrice.ask;

    return this.arbPositionManager.openPosition({
      symbol,
      buyExchange,
      sellExchange,
      buyPrice: buyPrice.ask,
      sellPrice: sellPrice.bid,
      spread,
    }, size);
  }

  /**
   * 手动关闭套利
   * Manual close arbitrage
   *
   * @param {string} id - 仓位ID / Position ID
   * @returns {Object} 平仓结果 / Close result
   */
  async manualCloseArbitrage(id) {
    const position = this.arbPositionManager.positions.get(id);
    if (!position) {
      throw new Error(`Position not found: ${id}`);
    }

    const buyPrice = this.priceManager.getPrice(position.symbol, position.buyExchange);
    const sellPrice = this.priceManager.getPrice(position.symbol, position.sellExchange);

    return this.arbPositionManager.closePosition(id, {
      buyClosePrice: buyPrice?.bid || position.buyPrice,
      sellClosePrice: sellPrice?.ask || position.sellPrice,
      reason: 'manual',
    });
  }

  /**
   * 关闭所有套利仓位
   * Close all arbitrage positions
   *
   * @returns {Array} 平仓结果列表 / Close result list
   */
  async closeAllArbitrages() {
    const results = [];
    const activePositions = this.arbPositionManager.getActivePositions();

    for (const position of activePositions) {
      try {
        const result = await this.manualCloseArbitrage(position.id);
        results.push(result);
      } catch (error) {
        results.push({ id: position.id, error: error.message });
      }
    }

    return results;
  }
}

// ============================================
// 导出 / Exports
// ============================================

export {
  DEFAULT_CONFIG as CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG,
};

export default CrossExchangeSpreadStrategy;
