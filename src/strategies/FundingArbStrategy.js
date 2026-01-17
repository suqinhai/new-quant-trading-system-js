/**
 * 跨交易所资金费率套利策略
 * Cross-Exchange Funding Rate Arbitrage Strategy
 *
 * 功能 / Features:
 * 1. 实时监听 Binance/Bybit/OKX 的当前和下一期资金费率
 *    Real-time monitoring of current and next funding rates from Binance/Bybit/OKX
 * 2. 计算年化利差，当 > 15% 时开反向对冲仓位
 *    Calculate annualized spread, open hedged positions when > 15%
 * 3. 库存控制 + 自动再平衡
 *    Inventory control + automatic rebalancing
 * 4. 完整日志和 PnL 计算
 *    Complete logging and PnL calculation
 *
 * 策略原理 / Strategy Principle:
 * - 当某交易所资金费率显著高于另一交易所时，在高费率交易所开空（收取资金费），
 *   在低费率交易所开多（支付较少资金费），赚取利差
 * - When one exchange has significantly higher funding rate, short on high rate exchange
 *   (receive funding) and long on low rate exchange (pay less funding), earn the spread
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

// 导入策略基类 / Import base strategy
import { BaseStrategy } from './BaseStrategy.js';

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 支持的交易所列表
 * Supported exchanges list
 */
const SUPPORTED_EXCHANGES = ['binance', 'bybit', 'okx', 'gate', 'deribit', 'bitget'];

/**
 * 资金费率结算间隔 (毫秒)
 * Funding rate settlement interval (ms)
 * 大多数交易所每 8 小时结算一次 / Most exchanges settle every 8 hours
 */
const FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000;

/**
 * 每年的资金费率结算次数
 * Funding settlements per year
 * 365天 × 3次/天 = 1095次 / 365 days × 3 times/day = 1095 times
 */
const FUNDING_SETTLEMENTS_PER_YEAR = 365 * 3;

/**
 * 仓位方向
 * Position side
 */
const POSITION_SIDE = {
  LONG: 'long',     // 多头 / Long
  SHORT: 'short',   // 空头 / Short
  NONE: 'none',     // 无持仓 / No position
};

/**
 * 套利机会状态
 * Arbitrage opportunity status
 */
const ARB_STATUS = {
  ACTIVE: 'active',       // 活跃中 / Active
  CLOSED: 'closed',       // 已关闭 / Closed
  PENDING: 'pending',     // 待处理 / Pending
};

/**
 * 默认策略配置
 * Default strategy configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 交易对配置 / Symbol Configuration
  // ============================================

  // 监控的交易对列表 / Symbols to monitor
  symbols: ['BTC/USDT', 'ETH/USDT'],

  // ============================================
  // 套利阈值配置 / Arbitrage Threshold Configuration
  // ============================================

  // 最小年化利差开仓阈值 (15% = 0.15) / Minimum annualized spread to open position
  minAnnualizedSpread: 0.15,

  // 平仓年化利差阈值 (5% = 0.05) / Close position spread threshold
  closeSpreadThreshold: 0.05,

  // 紧急平仓阈值 (年化利差反向超过此值) / Emergency close threshold
  emergencyCloseThreshold: -0.10,

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 每个套利机会的最大仓位 (USDT) / Max position per arbitrage opportunity
  maxPositionSize: 10000,

  // 最小仓位 (USDT) / Minimum position size
  minPositionSize: 100,

  // 单次开仓比例 (占最大仓位) / Single position ratio
  positionRatio: 0.25,

  // 总最大持仓 (USDT) / Total max position
  totalMaxPosition: 50000,

  // ============================================
  // 杠杆配置 / Leverage Configuration
  // ============================================

  // 默认杠杆倍数 / Default leverage
  leverage: 5,

  // 最大杠杆倍数 / Maximum leverage
  maxLeverage: 10,

  // ============================================
  // 再平衡配置 / Rebalancing Configuration
  // ============================================

  // 仓位不平衡阈值 (10% = 0.1) / Position imbalance threshold
  imbalanceThreshold: 0.10,

  // 再平衡检查间隔 (毫秒) / Rebalancing check interval (ms)
  rebalanceInterval: 60000,

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 资金费率刷新间隔 (毫秒) / Funding rate refresh interval (ms)
  fundingRefreshInterval: 30000,

  // 仓位刷新间隔 (毫秒) / Position refresh interval (ms)
  positionRefreshInterval: 10000,

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 最大单日亏损 (USDT) / Max daily loss
  maxDailyLoss: 500,

  // 最大回撤比例 / Max drawdown ratio
  maxDrawdown: 0.10,

  // 强平缓冲比例 / Liquidation buffer ratio
  liquidationBuffer: 0.20,

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[FundingArb]',
};

// ============================================
// 辅助类 / Helper Classes
// ============================================

/**
 * 资金费率数据管理器
 * Funding Rate Data Manager
 *
 * 负责收集和管理来自多个交易所的资金费率数据
 * Responsible for collecting and managing funding rate data from multiple exchanges
 */
class FundingRateManager extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 保存配置 / Save config
    this.config = config;

    // 资金费率数据存储 / Funding rate data storage
    // 格式: { symbol: { exchange: { current, predicted, timestamp } } }
    // Format: { symbol: { exchange: { current, predicted, timestamp } } }
    this.fundingRates = new Map();

    // 交易所实例引用 / Exchange instance references
    this.exchanges = new Map();

    // 刷新定时器 / Refresh timer
    this.refreshTimer = null;

    // 是否正在运行 / Whether running
    this.running = false;
  }

  /**
   * 设置交易所实例
   * Set exchange instances
   *
   * @param {Map} exchanges - 交易所实例映射 / Exchange instance map
   */
  setExchanges(exchanges) {
    // 保存交易所引用 / Save exchange references
    this.exchanges = exchanges;
  }

  /**
   * 启动资金费率监控
   * Start funding rate monitoring
   */
  async start() {
    // 标记为运行中 / Mark as running
    this.running = true;

    // 立即刷新一次 / Refresh immediately
    await this.refreshAllFundingRates();

    // 设置定时刷新 / Set refresh timer
    this.refreshTimer = setInterval(
      () => this.refreshAllFundingRates(),
      this.config.fundingRefreshInterval
    );

    // 记录日志 / Log
    console.log(`${this.config.logPrefix} 资金费率监控已启动 / Funding rate monitoring started`);
  }

  /**
   * 停止资金费率监控
   * Stop funding rate monitoring
   */
  stop() {
    // 标记为停止 / Mark as stopped
    this.running = false;

    // 清除定时器 / Clear timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // 记录日志 / Log
    console.log(`${this.config.logPrefix} 资金费率监控已停止 / Funding rate monitoring stopped`);
  }

  /**
   * 刷新所有交易所的资金费率
   * Refresh funding rates from all exchanges
   */
  async refreshAllFundingRates() {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 遍历所有交易对 / Iterate all symbols
    for (const symbol of this.config.symbols) {
      // 遍历所有交易所 / Iterate all exchanges
      for (const [exchangeName, exchange] of this.exchanges) {
        // 尝试获取资金费率 / Try to fetch funding rate
        try {
          // 调用交易所 API 获取资金费率 / Call exchange API to get funding rate
          const fundingData = await exchange.fetchFundingRate(symbol);

          // 保存资金费率数据 / Save funding rate data
          this._saveFundingRate(symbol, exchangeName, fundingData);

        } catch (error) {
          // 记录错误但不中断 / Log error but don't interrupt
          console.error(
            `${this.config.logPrefix} 获取 ${exchangeName} ${symbol} 资金费率失败: ${error.message}`
          );
        }
      }
    }

    // 发出资金费率更新事件 / Emit funding rate updated event
    this.emit('updated', this.fundingRates);
  }

  /**
   * 保存资金费率数据
   * Save funding rate data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} data - 资金费率数据 / Funding rate data
   * @private
   */
  _saveFundingRate(symbol, exchange, data) {
    // 如果该交易对不存在，初始化 / If symbol doesn't exist, initialize
    if (!this.fundingRates.has(symbol)) {
      this.fundingRates.set(symbol, new Map());
    }

    // 获取该交易对的费率映射 / Get rate map for this symbol
    const symbolRates = this.fundingRates.get(symbol);

    // 保存该交易所的费率数据 / Save rate data for this exchange
    symbolRates.set(exchange, {
      // 当前资金费率 / Current funding rate
      current: data.fundingRate || 0,

      // 预测资金费率 (下一期) / Predicted funding rate (next period)
      predicted: data.fundingRatePredicted || data.fundingRate || 0,

      // 下次结算时间戳 / Next funding timestamp
      fundingTimestamp: data.fundingTimestamp || 0,

      // 标记价格 / Mark price
      markPrice: data.markPrice || 0,

      // 指数价格 / Index price
      indexPrice: data.indexPrice || 0,

      // 更新时间 / Update timestamp
      timestamp: Date.now(),
    });
  }

  /**
   * 获取指定交易对的所有交易所资金费率
   * Get funding rates for a symbol from all exchanges
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Map} 交易所资金费率映射 / Exchange funding rate map
   */
  getFundingRates(symbol) {
    // 返回该交易对的费率数据，如果不存在返回空 Map
    // Return rate data for this symbol, or empty Map if not exists
    return this.fundingRates.get(symbol) || new Map();
  }

  /**
   * 获取指定交易所的资金费率
   * Get funding rate for a specific exchange
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所名称 / Exchange name
   * @returns {Object|null} 资金费率数据 / Funding rate data
   */
  getFundingRate(symbol, exchange) {
    // 获取该交易对的费率 / Get rates for this symbol
    const symbolRates = this.fundingRates.get(symbol);

    // 如果不存在，返回 null / If not exists, return null
    if (!symbolRates) {
      return null;
    }

    // 返回指定交易所的费率 / Return rate for specified exchange
    return symbolRates.get(exchange) || null;
  }

  /**
   * 计算两个交易所之间的资金费率利差
   * Calculate funding rate spread between two exchanges
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} longExchange - 做多交易所 / Long exchange
   * @param {string} shortExchange - 做空交易所 / Short exchange
   * @returns {Object} 利差信息 / Spread information
   */
  calculateSpread(symbol, longExchange, shortExchange) {
    // 获取两个交易所的费率 / Get rates from both exchanges
    const longRate = this.getFundingRate(symbol, longExchange);
    const shortRate = this.getFundingRate(symbol, shortExchange);

    // 如果任一费率不存在，返回空结果 / If any rate missing, return empty result
    if (!longRate || !shortRate) {
      return {
        valid: false,
        reason: '缺少资金费率数据 / Missing funding rate data',
      };
    }

    // 计算单期利差 / Calculate single period spread
    // 做空交易所收取资金费，做多交易所支付资金费
    // Short exchange receives funding, long exchange pays funding
    // 利差 = 空方收取 - 多方支付 = shortRate - longRate
    // Spread = short receives - long pays = shortRate - longRate
    const currentSpread = shortRate.current - longRate.current;

    // 计算预测利差 / Calculate predicted spread
    const predictedSpread = shortRate.predicted - longRate.predicted;

    // 计算年化利差 / Calculate annualized spread
    // 年化利差 = 单期利差 × 年结算次数
    // Annualized spread = single period spread × settlements per year
    const annualizedSpread = currentSpread * FUNDING_SETTLEMENTS_PER_YEAR;

    // 计算预测年化利差 / Calculate predicted annualized spread
    const predictedAnnualizedSpread = predictedSpread * FUNDING_SETTLEMENTS_PER_YEAR;

    // 返回利差信息 / Return spread information
    return {
      // 数据有效 / Data valid
      valid: true,

      // 交易对 / Symbol
      symbol,

      // 做多交易所 / Long exchange
      longExchange,

      // 做空交易所 / Short exchange
      shortExchange,

      // 做多交易所费率 / Long exchange rate
      longRate: longRate.current,

      // 做空交易所费率 / Short exchange rate
      shortRate: shortRate.current,

      // 当前单期利差 / Current single period spread
      currentSpread,

      // 预测单期利差 / Predicted single period spread
      predictedSpread,

      // 年化利差 / Annualized spread
      annualizedSpread,

      // 预测年化利差 / Predicted annualized spread
      predictedAnnualizedSpread,

      // 下次结算时间 (取较近的) / Next funding time (take closer one)
      nextFundingTime: Math.min(longRate.fundingTimestamp, shortRate.fundingTimestamp),

      // 更新时间 / Update timestamp
      timestamp: Date.now(),
    };
  }

  /**
   * 找出最佳套利机会
   * Find best arbitrage opportunity
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 最佳套利机会 / Best arbitrage opportunity
   */
  findBestOpportunity(symbol) {
    // 获取该交易对的所有费率 / Get all rates for this symbol
    const symbolRates = this.fundingRates.get(symbol);

    // 如果没有数据，返回 null / If no data, return null
    if (!symbolRates || symbolRates.size < 2) {
      return null;
    }

    // 获取所有交易所名称 / Get all exchange names
    const exchanges = Array.from(symbolRates.keys());

    // 最佳机会 / Best opportunity
    let bestOpportunity = null;

    // 最大年化利差 / Maximum annualized spread
    let maxAnnualizedSpread = 0;

    // 遍历所有交易所组合 / Iterate all exchange combinations
    for (let i = 0; i < exchanges.length; i++) {
      for (let j = 0; j < exchanges.length; j++) {
        // 跳过相同交易所 / Skip same exchange
        if (i === j) {
          continue;
        }

        // 计算利差 (i 做多, j 做空) / Calculate spread (i long, j short)
        const spread = this.calculateSpread(symbol, exchanges[i], exchanges[j]);

        // 如果利差有效且大于当前最大 / If spread valid and greater than current max
        if (spread.valid && spread.annualizedSpread > maxAnnualizedSpread) {
          // 更新最佳机会 / Update best opportunity
          maxAnnualizedSpread = spread.annualizedSpread;
          bestOpportunity = spread;
        }
      }
    }

    // 返回最佳机会 / Return best opportunity
    return bestOpportunity;
  }
}

/**
 * 仓位管理器
 * Position Manager
 *
 * 负责管理跨交易所的对冲仓位
 * Responsible for managing hedged positions across exchanges
 */
class PositionManager extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 保存配置 / Save config
    this.config = config;

    // 交易所实例引用 / Exchange instance references
    this.exchanges = new Map();

    // 活跃套利仓位 / Active arbitrage positions
    // 格式: { id: { symbol, longExchange, shortExchange, longPosition, shortPosition, ... } }
    // Format: { id: { symbol, longExchange, shortExchange, longPosition, shortPosition, ... } }
    this.arbPositions = new Map();

    // 仓位 ID 计数器 / Position ID counter
    this.positionIdCounter = 0;

    // 总已用保证金 / Total used margin
    this.totalUsedMargin = 0;

    // 刷新定时器 / Refresh timer
    this.refreshTimer = null;

    // 是否正在运行 / Whether running
    this.running = false;
  }

  /**
   * 设置交易所实例
   * Set exchange instances
   *
   * @param {Map} exchanges - 交易所实例映射 / Exchange instance map
   */
  setExchanges(exchanges) {
    // 保存交易所引用 / Save exchange references
    this.exchanges = exchanges;
  }

  /**
   * 启动仓位管理
   * Start position management
   */
  async start() {
    // 标记为运行中 / Mark as running
    this.running = true;

    // 立即刷新一次 / Refresh immediately
    await this.refreshAllPositions();

    // 设置定时刷新 / Set refresh timer
    this.refreshTimer = setInterval(
      () => this.refreshAllPositions(),
      this.config.positionRefreshInterval
    );

    // 记录日志 / Log
    console.log(`${this.config.logPrefix} 仓位管理已启动 / Position management started`);
  }

  /**
   * 停止仓位管理
   * Stop position management
   */
  stop() {
    // 标记为停止 / Mark as stopped
    this.running = false;

    // 清除定时器 / Clear timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // 记录日志 / Log
    console.log(`${this.config.logPrefix} 仓位管理已停止 / Position management stopped`);
  }

  /**
   * 刷新所有仓位信息
   * Refresh all position information
   */
  async refreshAllPositions() {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 遍历所有套利仓位 / Iterate all arbitrage positions
    for (const [id, arbPosition] of this.arbPositions) {
      // 尝试刷新仓位 / Try to refresh position
      try {
        // 刷新多头仓位 / Refresh long position
        const longExchange = this.exchanges.get(arbPosition.longExchange);
        if (longExchange) {
          const longPositions = await longExchange.fetchPositions([arbPosition.symbol]);
          arbPosition.longPosition = longPositions.find(
            p => p.symbol === arbPosition.symbol && p.side === 'long'
          ) || null;
        }

        // 刷新空头仓位 / Refresh short position
        const shortExchange = this.exchanges.get(arbPosition.shortExchange);
        if (shortExchange) {
          const shortPositions = await shortExchange.fetchPositions([arbPosition.symbol]);
          arbPosition.shortPosition = shortPositions.find(
            p => p.symbol === arbPosition.symbol && p.side === 'short'
          ) || null;
        }

        // 更新时间戳 / Update timestamp
        arbPosition.lastUpdate = Date.now();

        // 检查仓位是否已平仓 / Check if positions are closed
        this._checkPositionStatus(id, arbPosition);

      } catch (error) {
        // 记录错误但不中断 / Log error but don't interrupt
        console.error(
          `${this.config.logPrefix} 刷新套利仓位 ${id} 失败: ${error.message}`
        );
      }
    }

    // 更新总保证金 / Update total margin
    this._updateTotalMargin();

    // 发出仓位更新事件 / Emit positions updated event
    this.emit('updated', this.arbPositions);
  }

  /**
   * 检查仓位状态
   * Check position status
   *
   * @param {string} id - 仓位 ID / Position ID
   * @param {Object} arbPosition - 套利仓位 / Arbitrage position
   * @private
   */
  _checkPositionStatus(id, arbPosition) {
    // 获取多空仓位大小 / Get long and short position sizes
    const longSize = arbPosition.longPosition?.contracts || 0;
    const shortSize = arbPosition.shortPosition?.contracts || 0;

    // 如果两边都平仓了 / If both sides are closed
    if (longSize === 0 && shortSize === 0) {
      // 更新状态为已关闭 / Update status to closed
      arbPosition.status = ARB_STATUS.CLOSED;

      // 计算最终 PnL / Calculate final PnL
      this._calculateFinalPnl(arbPosition);

      // 发出仓位关闭事件 / Emit position closed event
      this.emit('positionClosed', { id, position: arbPosition });

      // 记录日志 / Log
      console.log(
        `${this.config.logPrefix} 套利仓位 ${id} 已关闭，PnL: ${arbPosition.realizedPnl.toFixed(2)} USDT`
      );
    }
  }

  /**
   * 更新总保证金
   * Update total margin
   * @private
   */
  _updateTotalMargin() {
    // 重置总保证金 / Reset total margin
    this.totalUsedMargin = 0;

    // 遍历所有活跃仓位 / Iterate all active positions
    for (const arbPosition of this.arbPositions.values()) {
      // 只计算活跃仓位 / Only count active positions
      if (arbPosition.status !== ARB_STATUS.ACTIVE) {
        continue;
      }

      // 累加保证金 / Accumulate margin
      const longMargin = arbPosition.longPosition?.collateral || 0;
      const shortMargin = arbPosition.shortPosition?.collateral || 0;
      this.totalUsedMargin += longMargin + shortMargin;
    }
  }

  /**
   * 开启套利仓位
   * Open arbitrage position
   *
   * @param {Object} opportunity - 套利机会 / Arbitrage opportunity
   * @param {number} size - 仓位大小 (USDT) / Position size (USDT)
   * @returns {Object} 开仓结果 / Open position result
   */
  async openPosition(opportunity, size) {
    // 生成仓位 ID / Generate position ID
    const id = `ARB_${++this.positionIdCounter}_${Date.now()}`;

    // 获取交易所实例 / Get exchange instances
    const longExchange = this.exchanges.get(opportunity.longExchange);
    const shortExchange = this.exchanges.get(opportunity.shortExchange);

    // 验证交易所 / Validate exchanges
    if (!longExchange || !shortExchange) {
      throw new Error('交易所实例不存在 / Exchange instance not found');
    }

    // 记录日志 / Log
    console.log(
      `${this.config.logPrefix} 开启套利仓位 ${id}: ${opportunity.symbol} ` +
      `多头@${opportunity.longExchange} 空头@${opportunity.shortExchange} ` +
      `年化利差: ${(opportunity.annualizedSpread * 100).toFixed(2)}%`
    );

    // 获取当前价格 / Get current price
    const ticker = await longExchange.fetchTicker(opportunity.symbol);
    const price = ticker.last || ticker.close;

    // 计算合约数量 / Calculate contract amount
    // 数量 = 仓位大小 / 价格 / 杠杆
    // Amount = size / price / leverage
    const amount = size / price;

    // 结果对象 / Result object
    const result = {
      id,
      success: false,
      longOrder: null,
      shortOrder: null,
      error: null,
    };

    try {
      // 设置杠杆 / Set leverage
      await longExchange.setLeverage(this.config.leverage, opportunity.symbol);
      await shortExchange.setLeverage(this.config.leverage, opportunity.symbol);

      // 同时下单 (减少价格风险) / Place orders simultaneously (reduce price risk)
      const [longOrder, shortOrder] = await Promise.all([
        // 多头订单 / Long order
        longExchange.createOrder(
          opportunity.symbol,   // 交易对 / Symbol
          'buy',                // 方向 / Side
          'market',             // 类型 / Type
          amount                // 数量 / Amount
        ),
        // 空头订单 / Short order
        shortExchange.createOrder(
          opportunity.symbol,   // 交易对 / Symbol
          'sell',               // 方向 / Side
          'market',             // 类型 / Type
          amount                // 数量 / Amount
        ),
      ]);

      // 保存订单结果 / Save order results
      result.longOrder = longOrder;
      result.shortOrder = shortOrder;
      result.success = true;

      // 创建套利仓位记录 / Create arbitrage position record
      const arbPosition = {
        // 仓位 ID / Position ID
        id,

        // 交易对 / Symbol
        symbol: opportunity.symbol,

        // 做多交易所 / Long exchange
        longExchange: opportunity.longExchange,

        // 做空交易所 / Short exchange
        shortExchange: opportunity.shortExchange,

        // 多头仓位 (待刷新) / Long position (to be refreshed)
        longPosition: null,

        // 空头仓位 (待刷新) / Short position (to be refreshed)
        shortPosition: null,

        // 开仓时的年化利差 / Annualized spread at open
        openSpread: opportunity.annualizedSpread,

        // 开仓价格 / Open price
        openPrice: price,

        // 开仓数量 / Open amount
        openAmount: amount,

        // 开仓大小 (USDT) / Open size (USDT)
        openSize: size,

        // 多头开仓均价 / Long entry price
        longEntryPrice: longOrder.average || price,

        // 空头开仓均价 / Short entry price
        shortEntryPrice: shortOrder.average || price,

        // 已实现 PnL / Realized PnL
        realizedPnl: 0,

        // 累计资金费用收入 / Cumulative funding income
        fundingIncome: 0,

        // 累计交易手续费 / Cumulative trading fees
        tradingFees: (longOrder.fee?.cost || 0) + (shortOrder.fee?.cost || 0),

        // 状态 / Status
        status: ARB_STATUS.ACTIVE,

        // 开仓时间 / Open time
        openTime: Date.now(),

        // 最后更新时间 / Last update time
        lastUpdate: Date.now(),
      };

      // 保存到仓位映射 / Save to position map
      this.arbPositions.set(id, arbPosition);

      // 发出仓位开启事件 / Emit position opened event
      this.emit('positionOpened', { id, position: arbPosition, orders: { longOrder, shortOrder } });

      // 记录日志 / Log
      console.log(
        `${this.config.logPrefix} ✓ 套利仓位 ${id} 开仓成功 ` +
        `多头: ${longOrder.filled} @ ${longOrder.average} ` +
        `空头: ${shortOrder.filled} @ ${shortOrder.average}`
      );

    } catch (error) {
      // 保存错误 / Save error
      result.error = error;

      // 记录错误 / Log error
      console.error(
        `${this.config.logPrefix} ✗ 套利仓位 ${id} 开仓失败: ${error.message}`
      );

      // 尝试回滚 (如果一边成功了) / Try to rollback (if one side succeeded)
      await this._rollbackFailedOpen(result, opportunity.symbol);
    }

    // 返回结果 / Return result
    return result;
  }

  /**
   * 回滚失败的开仓
   * Rollback failed open
   *
   * @param {Object} result - 开仓结果 / Open result
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  async _rollbackFailedOpen(result, symbol) {
    // 如果多头订单成功，平掉 / If long order succeeded, close it
    if (result.longOrder && result.longOrder.filled > 0) {
      try {
        const exchange = this.exchanges.get(result.longOrder.exchange);
        await exchange.createOrder(symbol, 'sell', 'market', result.longOrder.filled, undefined, {
          reduceOnly: true,
        });
        console.log(`${this.config.logPrefix} 已回滚多头仓位 / Rolled back long position`);
      } catch (error) {
        console.error(`${this.config.logPrefix} 回滚多头仓位失败: ${error.message}`);
      }
    }

    // 如果空头订单成功，平掉 / If short order succeeded, close it
    if (result.shortOrder && result.shortOrder.filled > 0) {
      try {
        const exchange = this.exchanges.get(result.shortOrder.exchange);
        await exchange.createOrder(symbol, 'buy', 'market', result.shortOrder.filled, undefined, {
          reduceOnly: true,
        });
        console.log(`${this.config.logPrefix} 已回滚空头仓位 / Rolled back short position`);
      } catch (error) {
        console.error(`${this.config.logPrefix} 回滚空头仓位失败: ${error.message}`);
      }
    }
  }

  /**
   * 关闭套利仓位
   * Close arbitrage position
   *
   * @param {string} id - 仓位 ID / Position ID
   * @param {string} reason - 平仓原因 / Close reason
   * @returns {Object} 平仓结果 / Close result
   */
  async closePosition(id, reason = 'manual') {
    // 获取套利仓位 / Get arbitrage position
    const arbPosition = this.arbPositions.get(id);

    // 验证仓位存在 / Validate position exists
    if (!arbPosition) {
      throw new Error(`套利仓位不存在 / Arbitrage position not found: ${id}`);
    }

    // 验证仓位活跃 / Validate position is active
    if (arbPosition.status !== ARB_STATUS.ACTIVE) {
      throw new Error(`套利仓位已关闭 / Arbitrage position already closed: ${id}`);
    }

    // 获取交易所实例 / Get exchange instances
    const longExchange = this.exchanges.get(arbPosition.longExchange);
    const shortExchange = this.exchanges.get(arbPosition.shortExchange);

    // 记录日志 / Log
    console.log(
      `${this.config.logPrefix} 关闭套利仓位 ${id}: ${arbPosition.symbol} 原因: ${reason}`
    );

    // 结果对象 / Result object
    const result = {
      id,
      success: false,
      longOrder: null,
      shortOrder: null,
      error: null,
      reason,
    };

    try {
      // 获取当前仓位大小 / Get current position sizes
      const longSize = arbPosition.longPosition?.contracts || arbPosition.openAmount;
      const shortSize = arbPosition.shortPosition?.contracts || arbPosition.openAmount;

      // 同时平仓 / Close simultaneously
      const [longOrder, shortOrder] = await Promise.all([
        // 平多头 / Close long
        longExchange.createOrder(
          arbPosition.symbol,   // 交易对 / Symbol
          'sell',               // 方向 / Side
          'market',             // 类型 / Type
          longSize,             // 数量 / Amount
          undefined,            // 价格 / Price
          { reduceOnly: true }  // 只减仓 / Reduce only
        ),
        // 平空头 / Close short
        shortExchange.createOrder(
          arbPosition.symbol,   // 交易对 / Symbol
          'buy',                // 方向 / Side
          'market',             // 类型 / Type
          shortSize,            // 数量 / Amount
          undefined,            // 价格 / Price
          { reduceOnly: true }  // 只减仓 / Reduce only
        ),
      ]);

      // 保存订单结果 / Save order results
      result.longOrder = longOrder;
      result.shortOrder = shortOrder;
      result.success = true;

      // 更新仓位状态 / Update position status
      arbPosition.status = ARB_STATUS.CLOSED;
      arbPosition.closeTime = Date.now();
      arbPosition.closeReason = reason;
      arbPosition.longClosePrice = longOrder.average;
      arbPosition.shortClosePrice = shortOrder.average;

      // 累加交易费用 / Add trading fees
      arbPosition.tradingFees += (longOrder.fee?.cost || 0) + (shortOrder.fee?.cost || 0);

      // 计算最终 PnL / Calculate final PnL
      this._calculateFinalPnl(arbPosition);

      // 发出仓位关闭事件 / Emit position closed event
      this.emit('positionClosed', { id, position: arbPosition, orders: { longOrder, shortOrder } });

      // 记录日志 / Log
      console.log(
        `${this.config.logPrefix} ✓ 套利仓位 ${id} 平仓成功 ` +
        `PnL: ${arbPosition.realizedPnl.toFixed(2)} USDT ` +
        `(资金费: ${arbPosition.fundingIncome.toFixed(2)}, 手续费: -${arbPosition.tradingFees.toFixed(2)})`
      );

    } catch (error) {
      // 保存错误 / Save error
      result.error = error;

      // 记录错误 / Log error
      console.error(
        `${this.config.logPrefix} ✗ 套利仓位 ${id} 平仓失败: ${error.message}`
      );
    }

    // 返回结果 / Return result
    return result;
  }

  /**
   * 计算最终 PnL
   * Calculate final PnL
   *
   * @param {Object} arbPosition - 套利仓位 / Arbitrage position
   * @private
   */
  _calculateFinalPnl(arbPosition) {
    // 计算多头 PnL / Calculate long PnL
    const longPnl = arbPosition.longPosition?.realizedPnl || 0;

    // 计算空头 PnL / Calculate short PnL
    const shortPnl = arbPosition.shortPosition?.realizedPnl || 0;

    // 如果有平仓价格，计算价差 PnL / If has close prices, calculate price PnL
    let pricePnl = 0;
    if (arbPosition.longClosePrice && arbPosition.shortClosePrice) {
      // 多头 PnL = (平仓价 - 开仓价) × 数量
      // Long PnL = (close price - entry price) × amount
      const longPricePnl = (arbPosition.longClosePrice - arbPosition.longEntryPrice) * arbPosition.openAmount;

      // 空头 PnL = (开仓价 - 平仓价) × 数量
      // Short PnL = (entry price - close price) × amount
      const shortPricePnl = (arbPosition.shortEntryPrice - arbPosition.shortClosePrice) * arbPosition.openAmount;

      pricePnl = longPricePnl + shortPricePnl;
    }

    // 总 PnL = 价差 PnL + 资金费收入 - 交易费用
    // Total PnL = price PnL + funding income - trading fees
    arbPosition.realizedPnl = pricePnl + arbPosition.fundingIncome - arbPosition.tradingFees;
  }

  /**
   * 记录资金费率收入
   * Record funding rate income
   *
   * @param {string} id - 仓位 ID / Position ID
   * @param {number} income - 资金费收入 / Funding income
   */
  recordFundingIncome(id, income) {
    // 获取套利仓位 / Get arbitrage position
    const arbPosition = this.arbPositions.get(id);

    // 如果仓位存在且活跃 / If position exists and active
    if (arbPosition && arbPosition.status === ARB_STATUS.ACTIVE) {
      // 累加资金费收入 / Add funding income
      arbPosition.fundingIncome += income;

      // 更新时间戳 / Update timestamp
      arbPosition.lastUpdate = Date.now();

      // 记录日志 / Log
      if (this.config.verbose) {
        console.log(
          `${this.config.logPrefix} 仓位 ${id} 资金费收入: ${income.toFixed(4)} USDT ` +
          `累计: ${arbPosition.fundingIncome.toFixed(4)} USDT`
        );
      }
    }
  }

  /**
   * 检查仓位是否需要再平衡
   * Check if positions need rebalancing
   *
   * @param {string} id - 仓位 ID / Position ID
   * @returns {Object|null} 再平衡信息 / Rebalancing info
   */
  checkRebalanceNeeded(id) {
    // 获取套利仓位 / Get arbitrage position
    const arbPosition = this.arbPositions.get(id);

    // 如果仓位不存在或不活跃 / If position not exists or not active
    if (!arbPosition || arbPosition.status !== ARB_STATUS.ACTIVE) {
      return null;
    }

    // 获取多空仓位大小 / Get long and short position sizes
    const longSize = arbPosition.longPosition?.contracts || 0;
    const shortSize = arbPosition.shortPosition?.contracts || 0;

    // 如果任一仓位为 0 / If any position is 0
    if (longSize === 0 || shortSize === 0) {
      return null;
    }

    // 计算不平衡比例 / Calculate imbalance ratio
    const avgSize = (longSize + shortSize) / 2;
    const imbalance = Math.abs(longSize - shortSize) / avgSize;

    // 如果不平衡超过阈值 / If imbalance exceeds threshold
    if (imbalance > this.config.imbalanceThreshold) {
      return {
        id,
        symbol: arbPosition.symbol,
        longSize,
        shortSize,
        imbalance,
        needsRebalance: true,
        action: longSize > shortSize ? 'reduce_long' : 'reduce_short',
        adjustAmount: Math.abs(longSize - shortSize) / 2,
      };
    }

    // 不需要再平衡 / No rebalancing needed
    return null;
  }

  /**
   * 获取所有活跃仓位
   * Get all active positions
   *
   * @returns {Array} 活跃仓位列表 / Active position list
   */
  getActivePositions() {
    // 过滤活跃仓位 / Filter active positions
    const active = [];
    for (const [id, position] of this.arbPositions) {
      if (position.status === ARB_STATUS.ACTIVE) {
        active.push({ id, ...position });
      }
    }
    return active;
  }

  /**
   * 获取总 PnL
   * Get total PnL
   *
   * @returns {Object} PnL 统计 / PnL statistics
   */
  getTotalPnl() {
    // 统计对象 / Statistics object
    const stats = {
      // 已实现 PnL / Realized PnL
      realizedPnl: 0,

      // 未实现 PnL / Unrealized PnL
      unrealizedPnl: 0,

      // 资金费收入 / Funding income
      fundingIncome: 0,

      // 交易费用 / Trading fees
      tradingFees: 0,

      // 活跃仓位数 / Active position count
      activeCount: 0,

      // 已关闭仓位数 / Closed position count
      closedCount: 0,
    };

    // 遍历所有仓位 / Iterate all positions
    for (const position of this.arbPositions.values()) {
      // 累加资金费收入 / Add funding income
      stats.fundingIncome += position.fundingIncome;

      // 累加交易费用 / Add trading fees
      stats.tradingFees += position.tradingFees;

      // 根据状态统计 / Count by status
      if (position.status === ARB_STATUS.ACTIVE) {
        // 活跃仓位 / Active position
        stats.activeCount++;

        // 计算未实现 PnL / Calculate unrealized PnL
        const longPnl = position.longPosition?.unrealizedPnl || 0;
        const shortPnl = position.shortPosition?.unrealizedPnl || 0;
        stats.unrealizedPnl += longPnl + shortPnl;

      } else if (position.status === ARB_STATUS.CLOSED) {
        // 已关闭仓位 / Closed position
        stats.closedCount++;

        // 累加已实现 PnL / Add realized PnL
        stats.realizedPnl += position.realizedPnl;
      }
    }

    // 返回统计 / Return statistics
    return stats;
  }
}

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 跨交易所资金费率套利策略
 * Cross-Exchange Funding Rate Arbitrage Strategy
 */
export class FundingArbStrategy extends BaseStrategy {
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

    // 设置策略名称 / Set strategy name
    this.name = 'FundingArbStrategy';

    // 保存配置 / Save config
    this.config = config;

    // 交易所实例映射 / Exchange instance map
    this.exchanges = new Map();

    // 资金费率管理器 / Funding rate manager
    this.fundingManager = new FundingRateManager(config);

    // 仓位管理器 / Position manager
    this.positionManager = new PositionManager(config);

    // PnL 统计 / PnL statistics
    this.pnlStats = {
      // 每日 PnL / Daily PnL
      dailyPnl: 0,

      // 今日开始时间 / Today start time
      dayStart: this._getDayStart(),

      // 累计 PnL / Cumulative PnL
      totalPnl: 0,

      // 最高权益 / Peak equity
      peakEquity: 0,

      // 当前回撤 / Current drawdown
      currentDrawdown: 0,
    };

    // 再平衡定时器 / Rebalancing timer
    this.rebalanceTimer = null;

    // 是否正在运行 / Whether running
    this.running = false;

    // 设置事件监听 / Set up event listeners
    this._setupEventListeners();
  }

  /**
   * 设置事件监听
   * Set up event listeners
   * @private
   */
  _setupEventListeners() {
    // 监听资金费率更新 / Listen for funding rate updates
    this.fundingManager.on('updated', () => {
      // 检查套利机会 / Check arbitrage opportunities
      this._checkArbitrageOpportunities();
    });

    // 监听仓位更新 / Listen for position updates
    this.positionManager.on('updated', () => {
      // 更新 PnL 统计 / Update PnL statistics
      this._updatePnlStats();
    });

    // 监听仓位开启 / Listen for position opened
    this.positionManager.on('positionOpened', (data) => {
      // 发出信号 / Emit signal
      this.emit('positionOpened', data);
    });

    // 监听仓位关闭 / Listen for position closed
    this.positionManager.on('positionClosed', (data) => {
      // 更新 PnL / Update PnL
      this.pnlStats.dailyPnl += data.position.realizedPnl;
      this.pnlStats.totalPnl += data.position.realizedPnl;

      // 发出信号 / Emit signal
      this.emit('positionClosed', data);
    });
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 资金费率套利策略需要 Ticker 和资金费率数据 / Funding arbitrage needs ticker and funding rate
    return ['ticker', 'fundingRate'];
  }

  /**
   * 初始化策略
   * Initialize strategy
   *
   * @param {Map} exchanges - 交易所实例映射 / Exchange instance map
   */
  async onInit(exchanges) {
    // 保存交易所引用 / Save exchange references
    this.exchanges = exchanges || new Map();

    // 设置交易所给管理器（如果有交易所） / Set exchanges to managers (if available)
    if (exchanges) {
      this.fundingManager.setExchanges(exchanges);
      this.positionManager.setExchanges(exchanges);
    }

    // 记录日志 / Log
    this.log(`策略初始化: 监控 ${this.config.symbols.length} 个交易对`, 'info');
    if (exchanges && exchanges.size > 0) {
      this.log(`交易所: ${Array.from(exchanges.keys()).join(', ')}`, 'info');

      // 跨交易所套利警告 / Cross-exchange arbitrage warning
      if (exchanges.size < 2) {
        this.log(
          `⚠️ 警告: 跨交易所资金费率套利需要至少2个交易所，当前只有${exchanges.size}个。` +
          `套利机会检查将只能比较来自MarketDataEngine的不同来源数据。` +
          `/ Warning: Cross-exchange funding arbitrage requires at least 2 exchanges.`,
          'warn'
        );
      }
    } else {
      this.log(`回测模式: 无实时交易所连接`, 'info');
    }
    this.log(`最小年化利差: ${(this.config.minAnnualizedSpread * 100).toFixed(1)}%`, 'info');
    this.log(`最大仓位: ${this.config.maxPositionSize} USDT`, 'info');

    // 调用父类初始化 / Call parent initialization
    await super.onInit();
  }

  /**
   * 启动策略
   * Start strategy
   */
  async start() {
    // 标记为运行中 / Mark as running
    this.running = true;

    // 启动资金费率监控 / Start funding rate monitoring
    await this.fundingManager.start();

    // 启动仓位管理 / Start position management
    await this.positionManager.start();

    // 启动再平衡检查 / Start rebalancing check
    this.rebalanceTimer = setInterval(
      () => this._checkRebalancing(),
      this.config.rebalanceInterval
    );

    // 记录日志 / Log
    this.log('策略已启动 / Strategy started', 'info');

    // 发出启动事件 / Emit start event
    this.emit('started');
  }

  /**
   * 停止策略
   * Stop strategy
   */
  async stop() {
    // 标记为停止 / Mark as stopped
    this.running = false;

    // 停止资金费率监控 / Stop funding rate monitoring
    this.fundingManager.stop();

    // 停止仓位管理 / Stop position management
    this.positionManager.stop();

    // 清除再平衡定时器 / Clear rebalancing timer
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }

    // 记录日志 / Log
    this.log('策略已停止 / Strategy stopped', 'info');

    // 发出停止事件 / Emit stop event
    this.emit('stopped');
  }

  /**
   * 检查套利机会
   * Check arbitrage opportunities
   * @private
   */
  async _checkArbitrageOpportunities() {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 检查风控 / Check risk control
    if (!this._checkRiskControl()) {
      this.log('风控检查未通过，跳过套利检查 / Risk control check failed', 'warn');
      return;
    }

    // 检查是否有交易所连接 / Check if exchanges are connected
    if (!this.exchanges || this.exchanges.size === 0) {
      this.log('警告: 无交易所连接，无法执行套利检查 / Warning: No exchanges connected', 'warn');
      return;
    }

    // 遍历所有交易对 / Iterate all symbols
    for (const symbol of this.config.symbols) {
      // 查找最佳机会 / Find best opportunity
      const opportunity = this.fundingManager.findBestOpportunity(symbol);

      // 如果没有机会，记录日志 / If no opportunity, log it
      if (!opportunity) {
        if (this.config.verbose) {
          // 获取当前资金费率数据用于调试 / Get current funding rate data for debugging
          const rates = this.fundingManager.getFundingRates(symbol);
          const ratesInfo = rates.size > 0
            ? Array.from(rates.entries()).map(([ex, data]) => `${ex}:${(data.current * 100).toFixed(4)}%`).join(', ')
            : '无数据';
          this.log(`${symbol} 无套利机会 (费率: ${ratesInfo}) / No arbitrage opportunity`, 'debug');
        }
        continue;
      }

      // 记录发现的机会 / Log found opportunity
      this.log(
        `${symbol} 发现机会: 多@${opportunity.longExchange}(${(opportunity.longRate * 100).toFixed(4)}%) ` +
        `空@${opportunity.shortExchange}(${(opportunity.shortRate * 100).toFixed(4)}%) ` +
        `年化利差: ${(opportunity.annualizedSpread * 100).toFixed(2)}% ` +
        `(阈值: ${(this.config.minAnnualizedSpread * 100).toFixed(2)}%)`,
        'info'
      );

      // 检查年化利差是否达到阈值 / Check if annualized spread meets threshold
      if (opportunity.annualizedSpread >= this.config.minAnnualizedSpread) {
        // 检查是否已有该交易对的仓位 / Check if already has position for this symbol
        const existingPosition = this._findExistingPosition(
          symbol,
          opportunity.longExchange,
          opportunity.shortExchange
        );

        if (existingPosition) {
          // 已有仓位，考虑加仓 / Already has position, consider adding
          await this._considerAddingPosition(existingPosition, opportunity);
        } else {
          // 没有仓位，开新仓 / No position, open new one
          await this._openNewPosition(opportunity);
        }
      }

      // 检查是否需要平仓 / Check if need to close positions
      await this._checkCloseConditions(symbol);
    }
  }

  /**
   * 查找已存在的仓位
   * Find existing position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} longExchange - 做多交易所 / Long exchange
   * @param {string} shortExchange - 做空交易所 / Short exchange
   * @returns {Object|null} 已存在的仓位 / Existing position
   * @private
   */
  _findExistingPosition(symbol, longExchange, shortExchange) {
    // 获取活跃仓位 / Get active positions
    const activePositions = this.positionManager.getActivePositions();

    // 查找匹配的仓位 / Find matching position
    return activePositions.find(
      p => p.symbol === symbol &&
           p.longExchange === longExchange &&
           p.shortExchange === shortExchange
    ) || null;
  }

  /**
   * 考虑加仓
   * Consider adding to position
   *
   * @param {Object} existingPosition - 已存在的仓位 / Existing position
   * @param {Object} opportunity - 套利机会 / Arbitrage opportunity
   * @private
   */
  async _considerAddingPosition(existingPosition, opportunity) {
    // 计算当前仓位大小 / Calculate current position size
    const currentSize = existingPosition.openSize;

    // 如果已达最大仓位，跳过 / If already at max, skip
    if (currentSize >= this.config.maxPositionSize) {
      return;
    }

    // 计算可加仓大小 / Calculate addable size
    const addSize = Math.min(
      this.config.maxPositionSize * this.config.positionRatio,
      this.config.maxPositionSize - currentSize
    );

    // 如果加仓大小太小，跳过 / If add size too small, skip
    if (addSize < this.config.minPositionSize) {
      return;
    }

    // 检查总仓位限制 / Check total position limit
    if (this.positionManager.totalUsedMargin + addSize > this.config.totalMaxPosition) {
      return;
    }

    // 记录日志 / Log
    this.log(
      `考虑加仓 ${existingPosition.id}: ${opportunity.symbol} ` +
      `年化利差: ${(opportunity.annualizedSpread * 100).toFixed(2)}%`,
      'info'
    );

    // 注意: 这里简化处理，实际应该开新仓位而不是加仓
    // Note: Simplified here, should open new position instead of adding
    // 可以根据需求实现加仓逻辑 / Can implement add logic as needed
  }

  /**
   * 开新仓位
   * Open new position
   *
   * @param {Object} opportunity - 套利机会 / Arbitrage opportunity
   * @private
   */
  async _openNewPosition(opportunity) {
    // 计算仓位大小 / Calculate position size
    const size = Math.min(
      this.config.maxPositionSize * this.config.positionRatio,
      this.config.totalMaxPosition - this.positionManager.totalUsedMargin
    );

    // 如果仓位太小，跳过 / If size too small, skip
    if (size < this.config.minPositionSize) {
      this.log(
        `仓位太小，跳过: ${size.toFixed(2)} USDT < ${this.config.minPositionSize} USDT`,
        'warn'
      );
      return;
    }

    // 记录日志 / Log
    this.log(
      `发现套利机会: ${opportunity.symbol} ` +
      `多@${opportunity.longExchange} 空@${opportunity.shortExchange} ` +
      `年化利差: ${(opportunity.annualizedSpread * 100).toFixed(2)}% ` +
      `开仓: ${size.toFixed(2)} USDT`,
      'info'
    );

    // 开启仓位 / Open position
    try {
      const result = await this.positionManager.openPosition(opportunity, size);

      if (result.success) {
        // 发出开仓信号 / Emit open signal
        this.setBuySignal(
          `套利开仓: ${opportunity.symbol} 年化${(opportunity.annualizedSpread * 100).toFixed(1)}%`
        );
      }
    } catch (error) {
      this.log(`开仓失败: ${error.message}`, 'error');
    }
  }

  /**
   * 检查平仓条件
   * Check close conditions
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  async _checkCloseConditions(symbol) {
    // 获取活跃仓位 / Get active positions
    const activePositions = this.positionManager.getActivePositions()
      .filter(p => p.symbol === symbol);

    // 遍历活跃仓位 / Iterate active positions
    for (const position of activePositions) {
      // 计算当前利差 / Calculate current spread
      const currentSpread = this.fundingManager.calculateSpread(
        symbol,
        position.longExchange,
        position.shortExchange
      );

      // 如果利差无效，跳过 / If spread invalid, skip
      if (!currentSpread.valid) {
        continue;
      }

      // 检查平仓条件 / Check close conditions
      let shouldClose = false;
      let closeReason = '';

      // 条件 1: 利差低于平仓阈值 / Condition 1: Spread below close threshold
      if (currentSpread.annualizedSpread < this.config.closeSpreadThreshold) {
        shouldClose = true;
        closeReason = `利差收窄: ${(currentSpread.annualizedSpread * 100).toFixed(2)}%`;
      }

      // 条件 2: 利差反向超过紧急阈值 / Condition 2: Spread reversed beyond emergency threshold
      if (currentSpread.annualizedSpread < this.config.emergencyCloseThreshold) {
        shouldClose = true;
        closeReason = `利差反向: ${(currentSpread.annualizedSpread * 100).toFixed(2)}%`;
      }

      // 如果需要平仓 / If should close
      if (shouldClose) {
        this.log(`平仓条件触发 ${position.id}: ${closeReason}`, 'info');

        try {
          const result = await this.positionManager.closePosition(position.id, closeReason);

          if (result.success) {
            // 发出平仓信号 / Emit close signal
            this.setSellSignal(`套利平仓: ${symbol} ${closeReason}`);
          }
        } catch (error) {
          this.log(`平仓失败: ${error.message}`, 'error');
        }
      }
    }
  }

  /**
   * 检查再平衡
   * Check rebalancing
   * @private
   */
  async _checkRebalancing() {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 获取活跃仓位 / Get active positions
    const activePositions = this.positionManager.getActivePositions();

    // 遍历活跃仓位 / Iterate active positions
    for (const position of activePositions) {
      // 检查是否需要再平衡 / Check if needs rebalancing
      const rebalanceInfo = this.positionManager.checkRebalanceNeeded(position.id);

      // 如果需要再平衡 / If needs rebalancing
      if (rebalanceInfo && rebalanceInfo.needsRebalance) {
        this.log(
          `仓位 ${position.id} 需要再平衡: ` +
          `多头=${rebalanceInfo.longSize.toFixed(4)} 空头=${rebalanceInfo.shortSize.toFixed(4)} ` +
          `不平衡=${(rebalanceInfo.imbalance * 100).toFixed(2)}%`,
          'warn'
        );

        // 执行再平衡 / Execute rebalancing
        await this._executeRebalance(position, rebalanceInfo);
      }
    }
  }

  /**
   * 执行再平衡
   * Execute rebalancing
   *
   * @param {Object} position - 仓位 / Position
   * @param {Object} rebalanceInfo - 再平衡信息 / Rebalancing info
   * @private
   */
  async _executeRebalance(position, rebalanceInfo) {
    // 获取需要调整的交易所 / Get exchange to adjust
    const exchangeName = rebalanceInfo.action === 'reduce_long'
      ? position.longExchange
      : position.shortExchange;

    const exchange = this.exchanges.get(exchangeName);

    // 如果交易所不存在，跳过 / If exchange not exists, skip
    if (!exchange) {
      return;
    }

    try {
      // 确定方向 / Determine side
      const side = rebalanceInfo.action === 'reduce_long' ? 'sell' : 'buy';

      // 下单调整 / Place order to adjust
      const order = await exchange.createOrder(
        position.symbol,
        side,
        'market',
        rebalanceInfo.adjustAmount,
        undefined,
        { reduceOnly: true }
      );

      this.log(
        `再平衡完成 ${position.id}: ${side} ${rebalanceInfo.adjustAmount.toFixed(4)} @ ${exchangeName}`,
        'info'
      );

    } catch (error) {
      this.log(`再平衡失败: ${error.message}`, 'error');
    }
  }

  /**
   * 检查风控
   * Check risk control
   *
   * @returns {boolean} 是否通过风控 / Whether passed risk control
   * @private
   */
  _checkRiskControl() {
    // 检查每日亏损限制 / Check daily loss limit
    if (this.pnlStats.dailyPnl < -this.config.maxDailyLoss) {
      this.log(
        `每日亏损超限: ${this.pnlStats.dailyPnl.toFixed(2)} USDT < -${this.config.maxDailyLoss} USDT`,
        'warn'
      );
      return false;
    }

    // 检查最大回撤 / Check max drawdown
    if (this.pnlStats.currentDrawdown > this.config.maxDrawdown) {
      this.log(
        `回撤超限: ${(this.pnlStats.currentDrawdown * 100).toFixed(2)}% > ${(this.config.maxDrawdown * 100).toFixed(2)}%`,
        'warn'
      );
      return false;
    }

    // 通过风控 / Passed risk control
    return true;
  }

  /**
   * 更新 PnL 统计
   * Update PnL statistics
   * @private
   */
  _updatePnlStats() {
    // 检查是否跨天 / Check if crossed day
    const currentDayStart = this._getDayStart();
    if (currentDayStart > this.pnlStats.dayStart) {
      // 重置每日 PnL / Reset daily PnL
      this.log(
        `跨天重置: 昨日 PnL=${this.pnlStats.dailyPnl.toFixed(2)} USDT`,
        'info'
      );
      this.pnlStats.dailyPnl = 0;
      this.pnlStats.dayStart = currentDayStart;
    }

    // 获取仓位统计 / Get position statistics
    const posStats = this.positionManager.getTotalPnl();

    // 计算当前权益 / Calculate current equity
    // 假设初始资金为 totalMaxPosition / Assume initial capital is totalMaxPosition
    const currentEquity = this.config.totalMaxPosition +
                          posStats.realizedPnl +
                          posStats.unrealizedPnl;

    // 更新峰值 / Update peak
    if (currentEquity > this.pnlStats.peakEquity) {
      this.pnlStats.peakEquity = currentEquity;
    }

    // 计算回撤 / Calculate drawdown
    if (this.pnlStats.peakEquity > 0) {
      this.pnlStats.currentDrawdown =
        (this.pnlStats.peakEquity - currentEquity) / this.pnlStats.peakEquity;
    }
  }

  /**
   * 获取当天开始时间戳
   * Get day start timestamp
   *
   * @returns {number} 当天开始时间戳 / Day start timestamp
   * @private
   */
  _getDayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  /**
   * 获取策略状态
   * Get strategy status
   *
   * @returns {Object} 策略状态 / Strategy status
   */
  getStatus() {
    // 获取仓位统计 / Get position statistics
    const posStats = this.positionManager.getTotalPnl();

    // 返回状态 / Return status
    return {
      // 策略名称 / Strategy name
      name: this.name,

      // 是否运行中 / Whether running
      running: this.running,

      // 监控的交易对 / Monitored symbols
      symbols: this.config.symbols,

      // 交易所 / Exchanges
      exchanges: Array.from(this.exchanges.keys()),

      // 活跃仓位数 / Active position count
      activePositions: posStats.activeCount,

      // 已关闭仓位数 / Closed position count
      closedPositions: posStats.closedCount,

      // 已实现 PnL / Realized PnL
      realizedPnl: posStats.realizedPnl,

      // 未实现 PnL / Unrealized PnL
      unrealizedPnl: posStats.unrealizedPnl,

      // 资金费收入 / Funding income
      fundingIncome: posStats.fundingIncome,

      // 交易费用 / Trading fees
      tradingFees: posStats.tradingFees,

      // 每日 PnL / Daily PnL
      dailyPnl: this.pnlStats.dailyPnl,

      // 累计 PnL / Total PnL
      totalPnl: this.pnlStats.totalPnl,

      // 当前回撤 / Current drawdown
      currentDrawdown: this.pnlStats.currentDrawdown,

      // 已用保证金 / Used margin
      usedMargin: this.positionManager.totalUsedMargin,

      // 更新时间 / Update timestamp
      timestamp: Date.now(),
    };
  }

  /**
   * 获取所有套利机会
   * Get all arbitrage opportunities
   *
   * @returns {Array} 套利机会列表 / Arbitrage opportunity list
   */
  getOpportunities() {
    // 结果数组 / Result array
    const opportunities = [];

    // 遍历所有交易对 / Iterate all symbols
    for (const symbol of this.config.symbols) {
      // 获取最佳机会 / Get best opportunity
      const opportunity = this.fundingManager.findBestOpportunity(symbol);

      // 如果有机会，添加到结果 / If has opportunity, add to result
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }

    // 按年化利差排序 / Sort by annualized spread
    opportunities.sort((a, b) => b.annualizedSpread - a.annualizedSpread);

    // 返回结果 / Return result
    return opportunities;
  }

  /**
   * 手动开仓
   * Manual open position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} longExchange - 做多交易所 / Long exchange
   * @param {string} shortExchange - 做空交易所 / Short exchange
   * @param {number} size - 仓位大小 / Position size
   * @returns {Object} 开仓结果 / Open result
   */
  async manualOpen(symbol, longExchange, shortExchange, size) {
    // 构建机会对象 / Build opportunity object
    const opportunity = this.fundingManager.calculateSpread(symbol, longExchange, shortExchange);

    // 验证机会 / Validate opportunity
    if (!opportunity.valid) {
      throw new Error(`无法获取利差信息: ${opportunity.reason}`);
    }

    // 开仓 / Open position
    return await this.positionManager.openPosition(opportunity, size);
  }

  /**
   * 手动平仓
   * Manual close position
   *
   * @param {string} id - 仓位 ID / Position ID
   * @returns {Object} 平仓结果 / Close result
   */
  async manualClose(id) {
    // 平仓 / Close position
    return await this.positionManager.closePosition(id, 'manual');
  }

  /**
   * 平掉所有仓位
   * Close all positions
   *
   * @returns {Array} 平仓结果列表 / Close results list
   */
  async closeAllPositions() {
    // 获取活跃仓位 / Get active positions
    const activePositions = this.positionManager.getActivePositions();

    // 结果数组 / Result array
    const results = [];

    // 遍历平仓 / Iterate and close
    for (const position of activePositions) {
      try {
        const result = await this.positionManager.closePosition(position.id, 'close_all');
        results.push(result);
      } catch (error) {
        results.push({
          id: position.id,
          success: false,
          error: error.message,
        });
      }
    }

    // 返回结果 / Return results
    return results;
  }

  /**
   * 处理资金费率更新事件
   * Handle funding rate update event
   *
   * @param {Object} data - 资金费率数据 / Funding rate data
   * @returns {Promise<void>}
   */
  async onFundingRate(data) {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 记录收到资金费率更新 / Log funding rate update received
    if (this.config.verbose) {
      this.log(
        `收到资金费率更新: ${data.symbol} ${data.exchange} rate=${(data.fundingRate * 100).toFixed(4)}%`,
        'debug'
      );
    }

    // 保存资金费率数据到管理器 / Save funding rate data to manager
    if (data.symbol && data.exchange && data.fundingRate !== undefined) {
      this.fundingManager._saveFundingRate(data.symbol, data.exchange, {
        fundingRate: data.fundingRate,
        fundingRatePredicted: data.fundingRatePredicted || data.fundingRate,
        fundingTimestamp: data.fundingTimestamp || Date.now(),
        markPrice: data.markPrice || 0,
        indexPrice: data.indexPrice || 0,
      });
    }

    // 检查套利机会 / Check arbitrage opportunities
    await this._checkArbitrageOpportunities();
  }

  /**
   * 处理 Ticker 更新事件
   * Handle ticker update event
   *
   * @param {Object} data - Ticker 数据 / Ticker data
   * @returns {Promise<void>}
   */
  async onTicker(data) {
    // Ticker 更新时记录价格但不触发套利检查 (资金费率套利主要依赖资金费率事件)
    // Log price on ticker update but don't trigger arbitrage check (funding arb mainly relies on funding rate events)
    if (this.config.verbose) {
      this.log(`Ticker 更新: ${data.symbol} price=${data.last}`, 'debug');
    }
  }

  /**
   * 处理 K 线更新事件
   * Handle candle update event
   *
   * @param {Object} data - K 线数据 / Candle data
   * @returns {Promise<void>}
   */
  async onCandle(data) {
    // K 线更新时可以定期检查套利机会 / Check arbitrage opportunities periodically on candle update
    if (this.running) {
      await this._checkArbitrageOpportunities();
    }
  }

  /**
   * 每个 K 线/tick 触发的方法 (回测模式)
   * Method triggered on each candle/tick (backtest mode)
   *
   * @param {Object} candle - 当前 K 线数据 / Current candle data
   * @param {Array} history - 历史 K 线数据 / Historical candle data
   * @returns {Promise<void>}
   */
  async onTick(candle, history) {
    // 在回测模式下，模拟资金费率套利逻辑
    // In backtest mode, simulate funding rate arbitrage logic

    // 如果没有交易所连接（回测模式），使用模拟逻辑
    // If no exchange connection (backtest mode), use simulated logic
    if (!this.exchanges || this.exchanges.size === 0) {
      // 回测模式下的简化处理
      // Simplified handling in backtest mode
      await this._backtestOnTick(candle, history);
      return;
    }

    // 实盘模式：检查套利机会
    // Live mode: check arbitrage opportunities
    await this._checkArbitrageOpportunities();
  }

  /**
   * 回测模式下的 onTick 处理
   * onTick handling in backtest mode
   *
   * @param {Object} candle - 当前 K 线数据 / Current candle data
   * @param {Array} history - 历史 K 线数据 / Historical candle data
   * @private
   */
  async _backtestOnTick(candle, history) {
    // 在回测模式下，我们模拟资金费率套利
    // In backtest mode, we simulate funding rate arbitrage

    // 资金费率套利策略在回测中需要多交易所数据
    // Funding rate arbitrage strategy needs multi-exchange data in backtest
    // 由于回测数据通常只有单交易所，这里提供简化的模拟
    // Since backtest data usually only has single exchange, provide simplified simulation

    // 检查是否有足够的历史数据 / Check if enough history
    if (!history || history.length < 24) {
      return;
    }

    // 获取当前价格 / Get current price
    const currentPrice = candle.close;

    // 模拟资金费率 (基于价格波动) / Simulate funding rate (based on price volatility)
    // 这是一个简化的模拟，实际资金费率取决于多种因素
    // This is a simplified simulation, actual funding rate depends on many factors
    const priceChange24h = (currentPrice - history[history.length - 24].close) / history[history.length - 24].close;

    // 计算价格波动率 (用于模拟资金费率波动)
    // Calculate price volatility (for simulating funding rate fluctuation)
    const prices = history.slice(-24).map(c => c.close);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
    const volatility = Math.sqrt(variance) / avgPrice;

    // 模拟资金费率：结合价格变化和波动率
    // Simulated funding rate: combining price change and volatility
    // 实际资金费率通常在 -0.1% 到 0.3% 之间 (每8小时)
    // Actual funding rate is usually between -0.1% to 0.3% (per 8 hours)
    const baseRate = priceChange24h * 0.01; // 基于趋势
    const volatilityRate = volatility * 0.5; // 基于波动
    const simulatedFundingRate = baseRate + (Math.random() - 0.5) * volatilityRate;

    // 年化利差 / Annualized spread
    // 假设两个交易所之间存在利差 (模拟跨所套利场景)
    // Assume spread exists between two exchanges (simulate cross-exchange arbitrage)
    const spreadMultiplier = 1 + volatility * 10; // 波动越大，利差越大
    const annualizedSpread = Math.abs(simulatedFundingRate) * FUNDING_SETTLEMENTS_PER_YEAR * spreadMultiplier;

    // 获取当前持仓状态 / Get current position state
    const hasPosition = this.getState('hasPosition', false);
    const positionSide = this.getState('positionSide', null);
    const entryPrice = this.getState('entryPrice', 0);
    const entryTime = this.getState('entryTime', 0);

    // 持仓时长 (小时) / Position duration (hours)
    const holdingHours = hasPosition ? (candle.timestamp - entryTime) / (60 * 60 * 1000) : 0;

    // 开仓逻辑 / Open position logic
    if (!hasPosition && annualizedSpread >= this.config.minAnnualizedSpread) {
      // 发现套利机会 / Found arbitrage opportunity
      const side = simulatedFundingRate > 0 ? 'short' : 'long';

      // 计算仓位大小 / Calculate position size
      const capital = this.getCapital();
      const positionSize = Math.min(
        capital * this.config.positionRatio,
        this.config.maxPositionSize
      );

      // 执行开仓 / Execute open
      if (positionSize >= this.config.minPositionSize) {
        const amount = positionSize / currentPrice;

        if (side === 'long') {
          this.buy(candle.symbol || 'BTC/USDT', amount);
        } else {
          this.sell(candle.symbol || 'BTC/USDT', amount);
        }

        // 记录状态 / Record state
        this.setState('hasPosition', true);
        this.setState('positionSide', side);
        this.setState('entryPrice', currentPrice);
        this.setState('entryTime', candle.timestamp);
        this.setState('openSpread', annualizedSpread);

        // 设置信号 / Set signal
        this.setBuySignal(
          `模拟套利开仓: ${side} @ ${currentPrice.toFixed(2)} 年化利差: ${(annualizedSpread * 100).toFixed(2)}%`
        );

        this.log(
          `[回测] 开仓: ${side} ${amount.toFixed(4)} @ ${currentPrice.toFixed(2)} 年化利差: ${(annualizedSpread * 100).toFixed(2)}%`,
          'info'
        );
      }
    }

    // 平仓逻辑 / Close position logic
    if (hasPosition) {
      let shouldClose = false;
      let closeReason = '';

      // 条件1: 利差收窄 / Condition 1: Spread narrowed
      if (annualizedSpread < this.config.closeSpreadThreshold) {
        shouldClose = true;
        closeReason = `利差收窄: ${(annualizedSpread * 100).toFixed(2)}%`;
      }

      // 条件2: 持仓超过8小时 (模拟一个资金费率结算周期)
      // Condition 2: Held for more than 8 hours (simulate one funding settlement period)
      if (holdingHours >= 8) {
        // 模拟收取/支付资金费后平仓
        // Simulate closing after receiving/paying funding
        shouldClose = true;
        closeReason = `结算周期结束: 持仓${holdingHours.toFixed(1)}小时`;
      }

      // 条件3: 价格反向移动过大 (止损)
      // Condition 3: Price moved against position too much (stop loss)
      const priceMove = (currentPrice - entryPrice) / entryPrice;
      const adverseMove = positionSide === 'long' ? -priceMove : priceMove;
      if (adverseMove > 0.02) { // 2% 止损
        shouldClose = true;
        closeReason = `止损: 价格反向移动 ${(adverseMove * 100).toFixed(2)}%`;
      }

      // 执行平仓 / Execute close
      if (shouldClose) {
        this.closePosition(candle.symbol || 'BTC/USDT');

        // 计算模拟 PnL / Calculate simulated PnL
        const pricePnl = positionSide === 'long'
          ? (currentPrice - entryPrice) / entryPrice
          : (entryPrice - currentPrice) / entryPrice;

        // 模拟资金费收入 (如果持仓超过8小时)
        // Simulate funding income (if held for more than 8 hours)
        const fundingIncome = holdingHours >= 8 ? this.getState('openSpread', 0) / FUNDING_SETTLEMENTS_PER_YEAR : 0;

        // 重置状态 / Reset state
        this.setState('hasPosition', false);
        this.setState('positionSide', null);
        this.setState('entryPrice', 0);
        this.setState('entryTime', 0);

        // 设置信号 / Set signal
        this.setSellSignal(closeReason);

        this.log(
          `[回测] 平仓: ${closeReason} 价格PnL: ${(pricePnl * 100).toFixed(2)}% 资金费: ${(fundingIncome * 100).toFixed(4)}%`,
          'info'
        );
      }
    }
  }

  /**
   * 日志输出 (覆盖父类方法)
   * Log output (override parent method)
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    // 构建前缀 / Build prefix
    const prefix = this.config.logPrefix;

    // 调用父类方法 / Call parent method
    super.log(`${prefix} ${message}`, level);
  }
}

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export {
  SUPPORTED_EXCHANGES,
  FUNDING_INTERVAL_MS,
  FUNDING_SETTLEMENTS_PER_YEAR,
  POSITION_SIDE,
  ARB_STATUS,
  DEFAULT_CONFIG,
};

// 导出辅助类 / Export helper classes
export {
  FundingRateManager,
  PositionManager,
};

// 默认导出策略类 / Default export strategy class
export default FundingArbStrategy;
