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
import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 支持的交易所列表
 * Supported exchanges list
 */
const SUPPORTED_EXCHANGES = ['binance', 'bybit', 'okx', 'gate', 'deribit', 'bitget']; // 定义常量 SUPPORTED_EXCHANGES

/**
 * 资金费率结算间隔 (毫秒)
 * Funding rate settlement interval (ms)
 * 大多数交易所每 8 小时结算一次 / Most exchanges settle every 8 hours
 */
const FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000; // 定义常量 FUNDING_INTERVAL_MS

/**
 * 每年的资金费率结算次数
 * Funding settlements per year
 * 365天 × 3次/天 = 1095次 / 365 days × 3 times/day = 1095 times
 */
const FUNDING_SETTLEMENTS_PER_YEAR = 365 * 3; // 定义常量 FUNDING_SETTLEMENTS_PER_YEAR

/**
 * 仓位方向
 * Position side
 */
const POSITION_SIDE = { // 定义常量 POSITION_SIDE
  LONG: 'long',     // 多头 / Long
  SHORT: 'short',   // 空头 / Short
  NONE: 'none',     // 无持仓 / No position
}; // 结束代码块

/**
 * 套利机会状态
 * Arbitrage opportunity status
 */
const ARB_STATUS = { // 定义常量 ARB_STATUS
  ACTIVE: 'active',       // 活跃中 / Active
  CLOSED: 'closed',       // 已关闭 / Closed
  PENDING: 'pending',     // 待处理 / Pending
}; // 结束代码块

/**
 * 默认策略配置
 * Default strategy configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 交易对配置 / Symbol Configuration
  // ============================================

  // 监控的交易对列表 / Symbols to monitor
  symbols: ['BTC/USDT', 'ETH/USDT'], // 设置 symbols 字段

  // ============================================
  // 套利阈值配置 / Arbitrage Threshold Configuration
  // ============================================

  // 最小年化利差开仓阈值 (15% = 0.15) / Minimum annualized spread to open position
  minAnnualizedSpread: 0.15, // 设置 minAnnualizedSpread 字段

  // 平仓年化利差阈值 (5% = 0.05) / Close position spread threshold
  closeSpreadThreshold: 0.05, // 设置 closeSpreadThreshold 字段

  // 紧急平仓阈值 (年化利差反向超过此值) / Emergency close threshold
  emergencyCloseThreshold: -0.10, // 设置 emergencyCloseThreshold 字段

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 每个套利机会的最大仓位 (USDT) / Max position per arbitrage opportunity
  maxPositionSize: 10000, // 设置 maxPositionSize 字段

  // 最小仓位 (USDT) / Minimum position size
  minPositionSize: 100, // 设置 minPositionSize 字段

  // 单次开仓比例 (占最大仓位) / Single position ratio
  positionRatio: 0.25, // 设置 positionRatio 字段

  // 总最大持仓 (USDT) / Total max position
  totalMaxPosition: 50000, // 设置 totalMaxPosition 字段

  // ============================================
  // 杠杆配置 / Leverage Configuration
  // ============================================

  // 默认杠杆倍数 / Default leverage
  leverage: 5, // 设置 leverage 字段

  // 最大杠杆倍数 / Maximum leverage
  maxLeverage: 10, // 设置 maxLeverage 字段

  // ============================================
  // 再平衡配置 / Rebalancing Configuration
  // ============================================

  // 仓位不平衡阈值 (10% = 0.1) / Position imbalance threshold
  imbalanceThreshold: 0.10, // 设置 imbalanceThreshold 字段

  // 再平衡检查间隔 (毫秒) / Rebalancing check interval (ms)
  rebalanceInterval: 60000, // 设置 rebalanceInterval 字段

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 资金费率刷新间隔 (毫秒) / Funding rate refresh interval (ms)
  fundingRefreshInterval: 30000, // 设置 fundingRefreshInterval 字段

  // 仓位刷新间隔 (毫秒) / Position refresh interval (ms)
  positionRefreshInterval: 10000, // 设置 positionRefreshInterval 字段

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 最大单日亏损 (USDT) / Max daily loss
  maxDailyLoss: 500, // 设置 maxDailyLoss 字段

  // 最大回撤比例 / Max drawdown ratio
  maxDrawdown: 0.10, // 设置 maxDrawdown 字段

  // 强平缓冲比例 / Liquidation buffer ratio
  liquidationBuffer: 0.20, // 设置 liquidationBuffer 字段

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 设置 verbose 字段

  // 日志前缀 / Log prefix
  logPrefix: '[FundingArb]', // 设置 logPrefix 字段
}; // 结束代码块

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
class FundingRateManager extends EventEmitter { // 定义类 FundingRateManager(继承EventEmitter)
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 保存配置 / Save config
    this.config = config; // 设置 config

    // 资金费率数据存储 / Funding rate data storage
    // 格式: { symbol: { exchange: { current, predicted, timestamp } } }
    // Format: { symbol: { exchange: { current, predicted, timestamp } } }
    this.fundingRates = new Map(); // 设置 fundingRates

    // 交易所实例引用 / Exchange instance references
    this.exchanges = new Map(); // 设置 exchanges

    // 刷新定时器 / Refresh timer
    this.refreshTimer = null; // 设置 refreshTimer

    // 是否正在运行 / Whether running
    this.running = false; // 设置 running
  } // 结束代码块

  /**
   * 设置交易所实例
   * Set exchange instances
   *
   * @param {Map} exchanges - 交易所实例映射 / Exchange instance map
   */
  setExchanges(exchanges) { // 调用 setExchanges
    // 保存交易所引用 / Save exchange references
    this.exchanges = exchanges; // 设置 exchanges
  } // 结束代码块

  /**
   * 启动资金费率监控
   * Start funding rate monitoring
   */
  async start() { // 执行语句
    // 标记为运行中 / Mark as running
    this.running = true; // 设置 running

    // 立即刷新一次 / Refresh immediately
    await this.refreshAllFundingRates(); // 等待异步结果

    // 设置定时刷新 / Set refresh timer
    this.refreshTimer = setInterval( // 设置 refreshTimer
      () => this.refreshAllFundingRates(), // 定义箭头函数
      this.config.fundingRefreshInterval // 访问 config
    ); // 结束调用或参数

    // 记录日志 / Log
    console.log(`${this.config.logPrefix} 资金费率监控已启动 / Funding rate monitoring started`); // 控制台输出
  } // 结束代码块

  /**
   * 停止资金费率监控
   * Stop funding rate monitoring
   */
  stop() { // 调用 stop
    // 标记为停止 / Mark as stopped
    this.running = false; // 设置 running

    // 清除定时器 / Clear timer
    if (this.refreshTimer) { // 条件判断 this.refreshTimer
      clearInterval(this.refreshTimer); // 调用 clearInterval
      this.refreshTimer = null; // 设置 refreshTimer
    } // 结束代码块

    // 记录日志 / Log
    console.log(`${this.config.logPrefix} 资金费率监控已停止 / Funding rate monitoring stopped`); // 控制台输出
  } // 结束代码块

  /**
   * 刷新所有交易所的资金费率
   * Refresh funding rates from all exchanges
   */
  async refreshAllFundingRates() { // 执行语句
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 遍历所有交易对 / Iterate all symbols
    for (const symbol of this.config.symbols) { // 循环 const symbol of this.config.symbols
      // 遍历所有交易所 / Iterate all exchanges
      for (const [exchangeName, exchange] of this.exchanges) { // 循环 const [exchangeName, exchange] of this.exchanges
        // 尝试获取资金费率 / Try to fetch funding rate
        try { // 尝试执行
          // 调用交易所 API 获取资金费率 / Call exchange API to get funding rate
          const fundingData = await exchange.fetchFundingRate(symbol); // 定义常量 fundingData

          // 保存资金费率数据 / Save funding rate data
          this._saveFundingRate(symbol, exchangeName, fundingData); // 调用 _saveFundingRate

        } catch (error) { // 执行语句
          // 记录错误但不中断 / Log error but don't interrupt
          console.error( // 控制台输出
            `${this.config.logPrefix} 获取 ${exchangeName} ${symbol} 资金费率失败: ${error.message}` // 执行语句
          ); // 结束调用或参数
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 发出资金费率更新事件 / Emit funding rate updated event
    this.emit('updated', this.fundingRates); // 调用 emit
  } // 结束代码块

  /**
   * 保存资金费率数据
   * Save funding rate data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所名称 / Exchange name
   * @param {Object} data - 资金费率数据 / Funding rate data
   * @private
   */
  _saveFundingRate(symbol, exchange, data) { // 调用 _saveFundingRate
    // 如果该交易对不存在，初始化 / If symbol doesn't exist, initialize
    if (!this.fundingRates.has(symbol)) { // 条件判断 !this.fundingRates.has(symbol)
      this.fundingRates.set(symbol, new Map()); // 访问 fundingRates
    } // 结束代码块

    // 获取该交易对的费率映射 / Get rate map for this symbol
    const symbolRates = this.fundingRates.get(symbol); // 定义常量 symbolRates

    // 保存该交易所的费率数据 / Save rate data for this exchange
    symbolRates.set(exchange, { // 调用 symbolRates.set
      // 当前资金费率 / Current funding rate
      current: data.fundingRate || 0, // 设置 current 字段

      // 预测资金费率 (下一期) / Predicted funding rate (next period)
      predicted: data.fundingRatePredicted || data.fundingRate || 0, // 设置 predicted 字段

      // 下次结算时间戳 / Next funding timestamp
      fundingTimestamp: data.fundingTimestamp || 0, // 设置 fundingTimestamp 字段

      // 标记价格 / Mark price
      markPrice: data.markPrice || 0, // 设置 markPrice 字段

      // 指数价格 / Index price
      indexPrice: data.indexPrice || 0, // 设置 indexPrice 字段

      // 更新时间 / Update timestamp
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取指定交易对的所有交易所资金费率
   * Get funding rates for a symbol from all exchanges
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Map} 交易所资金费率映射 / Exchange funding rate map
   */
  getFundingRates(symbol) { // 调用 getFundingRates
    // 返回该交易对的费率数据，如果不存在返回空 Map
    // Return rate data for this symbol, or empty Map if not exists
    return this.fundingRates.get(symbol) || new Map(); // 返回结果
  } // 结束代码块

  /**
   * 获取指定交易所的资金费率
   * Get funding rate for a specific exchange
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} exchange - 交易所名称 / Exchange name
   * @returns {Object|null} 资金费率数据 / Funding rate data
   */
  getFundingRate(symbol, exchange) { // 调用 getFundingRate
    // 获取该交易对的费率 / Get rates for this symbol
    const symbolRates = this.fundingRates.get(symbol); // 定义常量 symbolRates

    // 如果不存在，返回 null / If not exists, return null
    if (!symbolRates) { // 条件判断 !symbolRates
      return null; // 返回结果
    } // 结束代码块

    // 返回指定交易所的费率 / Return rate for specified exchange
    return symbolRates.get(exchange) || null; // 返回结果
  } // 结束代码块

  /**
   * 计算两个交易所之间的资金费率利差
   * Calculate funding rate spread between two exchanges
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} longExchange - 做多交易所 / Long exchange
   * @param {string} shortExchange - 做空交易所 / Short exchange
   * @returns {Object} 利差信息 / Spread information
   */
  calculateSpread(symbol, longExchange, shortExchange) { // 调用 calculateSpread
    // 获取两个交易所的费率 / Get rates from both exchanges
    const longRate = this.getFundingRate(symbol, longExchange); // 定义常量 longRate
    const shortRate = this.getFundingRate(symbol, shortExchange); // 定义常量 shortRate

    // 如果任一费率不存在，返回空结果 / If any rate missing, return empty result
    if (!longRate || !shortRate) { // 条件判断 !longRate || !shortRate
      return { // 返回结果
        valid: false, // 设置 valid 字段
        reason: '缺少资金费率数据 / Missing funding rate data', // 设置 reason 字段
      }; // 结束代码块
    } // 结束代码块

    // 计算单期利差 / Calculate single period spread
    // 做空交易所收取资金费，做多交易所支付资金费
    // Short exchange receives funding, long exchange pays funding
    // 利差 = 空方收取 - 多方支付 = shortRate - longRate
    // Spread = short receives - long pays = shortRate - longRate
    const currentSpread = shortRate.current - longRate.current; // 定义常量 currentSpread

    // 计算预测利差 / Calculate predicted spread
    const predictedSpread = shortRate.predicted - longRate.predicted; // 定义常量 predictedSpread

    // 计算年化利差 / Calculate annualized spread
    // 年化利差 = 单期利差 × 年结算次数
    // Annualized spread = single period spread × settlements per year
    const annualizedSpread = currentSpread * FUNDING_SETTLEMENTS_PER_YEAR; // 定义常量 annualizedSpread

    // 计算预测年化利差 / Calculate predicted annualized spread
    const predictedAnnualizedSpread = predictedSpread * FUNDING_SETTLEMENTS_PER_YEAR; // 定义常量 predictedAnnualizedSpread

    // 返回利差信息 / Return spread information
    return { // 返回结果
      // 数据有效 / Data valid
      valid: true, // 设置 valid 字段

      // 交易对 / Symbol
      symbol, // 执行语句

      // 做多交易所 / Long exchange
      longExchange, // 执行语句

      // 做空交易所 / Short exchange
      shortExchange, // 执行语句

      // 做多交易所费率 / Long exchange rate
      longRate: longRate.current, // 设置 longRate 字段

      // 做空交易所费率 / Short exchange rate
      shortRate: shortRate.current, // 设置 shortRate 字段

      // 当前单期利差 / Current single period spread
      currentSpread, // 执行语句

      // 预测单期利差 / Predicted single period spread
      predictedSpread, // 执行语句

      // 年化利差 / Annualized spread
      annualizedSpread, // 执行语句

      // 预测年化利差 / Predicted annualized spread
      predictedAnnualizedSpread, // 执行语句

      // 下次结算时间 (取较近的) / Next funding time (take closer one)
      nextFundingTime: Math.min(longRate.fundingTimestamp, shortRate.fundingTimestamp), // 设置 nextFundingTime 字段

      // 更新时间 / Update timestamp
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 找出最佳套利机会
   * Find best arbitrage opportunity
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 最佳套利机会 / Best arbitrage opportunity
   */
  findBestOpportunity(symbol) { // 调用 findBestOpportunity
    // 获取该交易对的所有费率 / Get all rates for this symbol
    const symbolRates = this.fundingRates.get(symbol); // 定义常量 symbolRates

    // 如果没有数据，返回 null / If no data, return null
    if (!symbolRates || symbolRates.size < 2) { // 条件判断 !symbolRates || symbolRates.size < 2
      return null; // 返回结果
    } // 结束代码块

    // 获取所有交易所名称 / Get all exchange names
    const exchanges = Array.from(symbolRates.keys()); // 定义常量 exchanges

    // 最佳机会 / Best opportunity
    let bestOpportunity = null; // 定义变量 bestOpportunity

    // 最大年化利差 / Maximum annualized spread
    let maxAnnualizedSpread = 0; // 定义变量 maxAnnualizedSpread

    // 遍历所有交易所组合 / Iterate all exchange combinations
    for (let i = 0; i < exchanges.length; i++) { // 循环 let i = 0; i < exchanges.length; i++
      for (let j = 0; j < exchanges.length; j++) { // 循环 let j = 0; j < exchanges.length; j++
        // 跳过相同交易所 / Skip same exchange
        if (i === j) { // 条件判断 i === j
          continue; // 继续下一轮循环
        } // 结束代码块

        // 计算利差 (i 做多, j 做空) / Calculate spread (i long, j short)
        const spread = this.calculateSpread(symbol, exchanges[i], exchanges[j]); // 定义常量 spread

        // 如果利差有效且大于当前最大 / If spread valid and greater than current max
        if (spread.valid && spread.annualizedSpread > maxAnnualizedSpread) { // 条件判断 spread.valid && spread.annualizedSpread > max...
          // 更新最佳机会 / Update best opportunity
          maxAnnualizedSpread = spread.annualizedSpread; // 赋值 maxAnnualizedSpread
          bestOpportunity = spread; // 赋值 bestOpportunity
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 返回最佳机会 / Return best opportunity
    return bestOpportunity; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 仓位管理器
 * Position Manager
 *
 * 负责管理跨交易所的对冲仓位
 * Responsible for managing hedged positions across exchanges
 */
class PositionManager extends EventEmitter { // 定义类 PositionManager(继承EventEmitter)
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 保存配置 / Save config
    this.config = config; // 设置 config

    // 交易所实例引用 / Exchange instance references
    this.exchanges = new Map(); // 设置 exchanges

    // 活跃套利仓位 / Active arbitrage positions
    // 格式: { id: { symbol, longExchange, shortExchange, longPosition, shortPosition, ... } }
    // Format: { id: { symbol, longExchange, shortExchange, longPosition, shortPosition, ... } }
    this.arbPositions = new Map(); // 设置 arbPositions

    // 仓位 ID 计数器 / Position ID counter
    this.positionIdCounter = 0; // 设置 positionIdCounter

    // 总已用保证金 / Total used margin
    this.totalUsedMargin = 0; // 设置 totalUsedMargin

    // 刷新定时器 / Refresh timer
    this.refreshTimer = null; // 设置 refreshTimer

    // 是否正在运行 / Whether running
    this.running = false; // 设置 running
  } // 结束代码块

  /**
   * 设置交易所实例
   * Set exchange instances
   *
   * @param {Map} exchanges - 交易所实例映射 / Exchange instance map
   */
  setExchanges(exchanges) { // 调用 setExchanges
    // 保存交易所引用 / Save exchange references
    this.exchanges = exchanges; // 设置 exchanges
  } // 结束代码块

  /**
   * 启动仓位管理
   * Start position management
   */
  async start() { // 执行语句
    // 标记为运行中 / Mark as running
    this.running = true; // 设置 running

    // 立即刷新一次 / Refresh immediately
    await this.refreshAllPositions(); // 等待异步结果

    // 设置定时刷新 / Set refresh timer
    this.refreshTimer = setInterval( // 设置 refreshTimer
      () => this.refreshAllPositions(), // 定义箭头函数
      this.config.positionRefreshInterval // 访问 config
    ); // 结束调用或参数

    // 记录日志 / Log
    console.log(`${this.config.logPrefix} 仓位管理已启动 / Position management started`); // 控制台输出
  } // 结束代码块

  /**
   * 停止仓位管理
   * Stop position management
   */
  stop() { // 调用 stop
    // 标记为停止 / Mark as stopped
    this.running = false; // 设置 running

    // 清除定时器 / Clear timer
    if (this.refreshTimer) { // 条件判断 this.refreshTimer
      clearInterval(this.refreshTimer); // 调用 clearInterval
      this.refreshTimer = null; // 设置 refreshTimer
    } // 结束代码块

    // 记录日志 / Log
    console.log(`${this.config.logPrefix} 仓位管理已停止 / Position management stopped`); // 控制台输出
  } // 结束代码块

  /**
   * 刷新所有仓位信息
   * Refresh all position information
   */
  async refreshAllPositions() { // 执行语句
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 遍历所有套利仓位 / Iterate all arbitrage positions
    for (const [id, arbPosition] of this.arbPositions) { // 循环 const [id, arbPosition] of this.arbPositions
      // 尝试刷新仓位 / Try to refresh position
      try { // 尝试执行
        // 刷新多头仓位 / Refresh long position
        const longExchange = this.exchanges.get(arbPosition.longExchange); // 定义常量 longExchange
        if (longExchange) { // 条件判断 longExchange
          const longPositions = await longExchange.fetchPositions([arbPosition.symbol]); // 定义常量 longPositions
          arbPosition.longPosition = longPositions.find( // 赋值 arbPosition.longPosition
            p => p.symbol === arbPosition.symbol && p.side === 'long' // 赋值 p
          ) || null; // 执行语句
        } // 结束代码块

        // 刷新空头仓位 / Refresh short position
        const shortExchange = this.exchanges.get(arbPosition.shortExchange); // 定义常量 shortExchange
        if (shortExchange) { // 条件判断 shortExchange
          const shortPositions = await shortExchange.fetchPositions([arbPosition.symbol]); // 定义常量 shortPositions
          arbPosition.shortPosition = shortPositions.find( // 赋值 arbPosition.shortPosition
            p => p.symbol === arbPosition.symbol && p.side === 'short' // 赋值 p
          ) || null; // 执行语句
        } // 结束代码块

        // 更新时间戳 / Update timestamp
        arbPosition.lastUpdate = Date.now(); // 赋值 arbPosition.lastUpdate

        // 检查仓位是否已平仓 / Check if positions are closed
        this._checkPositionStatus(id, arbPosition); // 调用 _checkPositionStatus

      } catch (error) { // 执行语句
        // 记录错误但不中断 / Log error but don't interrupt
        console.error( // 控制台输出
          `${this.config.logPrefix} 刷新套利仓位 ${id} 失败: ${error.message}` // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } // 结束代码块

    // 更新总保证金 / Update total margin
    this._updateTotalMargin(); // 调用 _updateTotalMargin

    // 发出仓位更新事件 / Emit positions updated event
    this.emit('updated', this.arbPositions); // 调用 emit
  } // 结束代码块

  /**
   * 检查仓位状态
   * Check position status
   *
   * @param {string} id - 仓位 ID / Position ID
   * @param {Object} arbPosition - 套利仓位 / Arbitrage position
   * @private
   */
  _checkPositionStatus(id, arbPosition) { // 调用 _checkPositionStatus
    // 获取多空仓位大小 / Get long and short position sizes
    const longSize = arbPosition.longPosition?.contracts || 0; // 定义常量 longSize
    const shortSize = arbPosition.shortPosition?.contracts || 0; // 定义常量 shortSize

    // 如果两边都平仓了 / If both sides are closed
    if (longSize === 0 && shortSize === 0) { // 条件判断 longSize === 0 && shortSize === 0
      // 更新状态为已关闭 / Update status to closed
      arbPosition.status = ARB_STATUS.CLOSED; // 赋值 arbPosition.status

      // 计算最终 PnL / Calculate final PnL
      this._calculateFinalPnl(arbPosition); // 调用 _calculateFinalPnl

      // 发出仓位关闭事件 / Emit position closed event
      this.emit('positionClosed', { id, position: arbPosition }); // 调用 emit

      // 记录日志 / Log
      console.log( // 控制台输出
        `${this.config.logPrefix} 套利仓位 ${id} 已关闭，PnL: ${arbPosition.realizedPnl.toFixed(2)} USDT` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新总保证金
   * Update total margin
   * @private
   */
  _updateTotalMargin() { // 调用 _updateTotalMargin
    // 重置总保证金 / Reset total margin
    this.totalUsedMargin = 0; // 设置 totalUsedMargin

    // 遍历所有活跃仓位 / Iterate all active positions
    for (const arbPosition of this.arbPositions.values()) { // 循环 const arbPosition of this.arbPositions.values()
      // 只计算活跃仓位 / Only count active positions
      if (arbPosition.status !== ARB_STATUS.ACTIVE) { // 条件判断 arbPosition.status !== ARB_STATUS.ACTIVE
        continue; // 继续下一轮循环
      } // 结束代码块

      // 累加保证金 / Accumulate margin
      const longMargin = arbPosition.longPosition?.collateral || 0; // 定义常量 longMargin
      const shortMargin = arbPosition.shortPosition?.collateral || 0; // 定义常量 shortMargin
      this.totalUsedMargin += longMargin + shortMargin; // 访问 totalUsedMargin
    } // 结束代码块
  } // 结束代码块

  /**
   * 开启套利仓位
   * Open arbitrage position
   *
   * @param {Object} opportunity - 套利机会 / Arbitrage opportunity
   * @param {number} size - 仓位大小 (USDT) / Position size (USDT)
   * @returns {Object} 开仓结果 / Open position result
   */
  async openPosition(opportunity, size) { // 执行语句
    // 生成仓位 ID / Generate position ID
    const id = `ARB_${++this.positionIdCounter}_${Date.now()}`; // 定义常量 id

    // 获取交易所实例 / Get exchange instances
    const longExchange = this.exchanges.get(opportunity.longExchange); // 定义常量 longExchange
    const shortExchange = this.exchanges.get(opportunity.shortExchange); // 定义常量 shortExchange

    // 验证交易所 / Validate exchanges
    if (!longExchange || !shortExchange) { // 条件判断 !longExchange || !shortExchange
      throw new Error('交易所实例不存在 / Exchange instance not found'); // 抛出异常
    } // 结束代码块

    // 记录日志 / Log
    console.log( // 控制台输出
      `${this.config.logPrefix} 开启套利仓位 ${id}: ${opportunity.symbol} ` + // 执行语句
      `多头@${opportunity.longExchange} 空头@${opportunity.shortExchange} ` + // 执行语句
      `年化利差: ${(opportunity.annualizedSpread * 100).toFixed(2)}%` // 执行语句
    ); // 结束调用或参数

    // 获取当前价格 / Get current price
    const ticker = await longExchange.fetchTicker(opportunity.symbol); // 定义常量 ticker
    const price = ticker.last || ticker.close; // 定义常量 price

    // 计算合约数量 / Calculate contract amount
    // 数量 = 仓位大小 / 价格 / 杠杆
    // Amount = size / price / leverage
    const amount = size / price; // 定义常量 amount

    // 结果对象 / Result object
    const result = { // 定义常量 result
      id, // 执行语句
      success: false, // 设置 success 字段
      longOrder: null, // 设置 longOrder 字段
      shortOrder: null, // 设置 shortOrder 字段
      error: null, // 设置 error 字段
    }; // 结束代码块

    try { // 尝试执行
      // 设置杠杆 / Set leverage
      await longExchange.setLeverage(this.config.leverage, opportunity.symbol); // 等待异步结果
      await shortExchange.setLeverage(this.config.leverage, opportunity.symbol); // 等待异步结果

      // 同时下单 (减少价格风险) / Place orders simultaneously (reduce price risk)
      const [longOrder, shortOrder] = await Promise.all([ // 解构赋值
        // 多头订单 / Long order
        longExchange.createOrder( // 调用 longExchange.createOrder
          opportunity.symbol,   // 交易对 / Symbol
          'buy',                // 方向 / Side
          'market',             // 类型 / Type
          amount                // 数量 / Amount
        ), // 结束调用或参数
        // 空头订单 / Short order
        shortExchange.createOrder( // 调用 shortExchange.createOrder
          opportunity.symbol,   // 交易对 / Symbol
          'sell',               // 方向 / Side
          'market',             // 类型 / Type
          amount                // 数量 / Amount
        ), // 结束调用或参数
      ]); // 结束数组或索引

      // 保存订单结果 / Save order results
      result.longOrder = longOrder; // 赋值 result.longOrder
      result.shortOrder = shortOrder; // 赋值 result.shortOrder
      result.success = true; // 赋值 result.success

      // 创建套利仓位记录 / Create arbitrage position record
      const arbPosition = { // 定义常量 arbPosition
        // 仓位 ID / Position ID
        id, // 执行语句

        // 交易对 / Symbol
        symbol: opportunity.symbol, // 设置 symbol 字段

        // 做多交易所 / Long exchange
        longExchange: opportunity.longExchange, // 设置 longExchange 字段

        // 做空交易所 / Short exchange
        shortExchange: opportunity.shortExchange, // 设置 shortExchange 字段

        // 多头仓位 (待刷新) / Long position (to be refreshed)
        longPosition: null, // 设置 longPosition 字段

        // 空头仓位 (待刷新) / Short position (to be refreshed)
        shortPosition: null, // 设置 shortPosition 字段

        // 开仓时的年化利差 / Annualized spread at open
        openSpread: opportunity.annualizedSpread, // 设置 openSpread 字段

        // 开仓价格 / Open price
        openPrice: price, // 设置 openPrice 字段

        // 开仓数量 / Open amount
        openAmount: amount, // 设置 openAmount 字段

        // 开仓大小 (USDT) / Open size (USDT)
        openSize: size, // 设置 openSize 字段

        // 多头开仓均价 / Long entry price
        longEntryPrice: longOrder.average || price, // 设置 longEntryPrice 字段

        // 空头开仓均价 / Short entry price
        shortEntryPrice: shortOrder.average || price, // 设置 shortEntryPrice 字段

        // 已实现 PnL / Realized PnL
        realizedPnl: 0, // 设置 realizedPnl 字段

        // 累计资金费用收入 / Cumulative funding income
        fundingIncome: 0, // 设置 fundingIncome 字段

        // 累计交易手续费 / Cumulative trading fees
        tradingFees: (longOrder.fee?.cost || 0) + (shortOrder.fee?.cost || 0), // 设置 tradingFees 字段

        // 状态 / Status
        status: ARB_STATUS.ACTIVE, // 设置 status 字段

        // 开仓时间 / Open time
        openTime: Date.now(), // 设置 openTime 字段

        // 最后更新时间 / Last update time
        lastUpdate: Date.now(), // 设置 lastUpdate 字段
      }; // 结束代码块

      // 保存到仓位映射 / Save to position map
      this.arbPositions.set(id, arbPosition); // 访问 arbPositions

      // 发出仓位开启事件 / Emit position opened event
      this.emit('positionOpened', { id, position: arbPosition, orders: { longOrder, shortOrder } }); // 调用 emit

      // 记录日志 / Log
      console.log( // 控制台输出
        `${this.config.logPrefix} ✓ 套利仓位 ${id} 开仓成功 ` + // 执行语句
        `多头: ${longOrder.filled} @ ${longOrder.average} ` + // 执行语句
        `空头: ${shortOrder.filled} @ ${shortOrder.average}` // 执行语句
      ); // 结束调用或参数

    } catch (error) { // 执行语句
      // 保存错误 / Save error
      result.error = error; // 赋值 result.error

      // 记录错误 / Log error
      console.error( // 控制台输出
        `${this.config.logPrefix} ✗ 套利仓位 ${id} 开仓失败: ${error.message}` // 执行语句
      ); // 结束调用或参数

      // 尝试回滚 (如果一边成功了) / Try to rollback (if one side succeeded)
      await this._rollbackFailedOpen(result, opportunity.symbol); // 等待异步结果
    } // 结束代码块

    // 返回结果 / Return result
    return result; // 返回结果
  } // 结束代码块

  /**
   * 回滚失败的开仓
   * Rollback failed open
   *
   * @param {Object} result - 开仓结果 / Open result
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  async _rollbackFailedOpen(result, symbol) { // 执行语句
    // 如果多头订单成功，平掉 / If long order succeeded, close it
    if (result.longOrder && result.longOrder.filled > 0) { // 条件判断 result.longOrder && result.longOrder.filled > 0
      try { // 尝试执行
        const exchange = this.exchanges.get(result.longOrder.exchange); // 定义常量 exchange
        await exchange.createOrder(symbol, 'sell', 'market', result.longOrder.filled, undefined, { // 等待异步结果
          reduceOnly: true, // 设置 reduceOnly 字段
        }); // 结束代码块
        console.log(`${this.config.logPrefix} 已回滚多头仓位 / Rolled back long position`); // 控制台输出
      } catch (error) { // 执行语句
        console.error(`${this.config.logPrefix} 回滚多头仓位失败: ${error.message}`); // 控制台输出
      } // 结束代码块
    } // 结束代码块

    // 如果空头订单成功，平掉 / If short order succeeded, close it
    if (result.shortOrder && result.shortOrder.filled > 0) { // 条件判断 result.shortOrder && result.shortOrder.filled...
      try { // 尝试执行
        const exchange = this.exchanges.get(result.shortOrder.exchange); // 定义常量 exchange
        await exchange.createOrder(symbol, 'buy', 'market', result.shortOrder.filled, undefined, { // 等待异步结果
          reduceOnly: true, // 设置 reduceOnly 字段
        }); // 结束代码块
        console.log(`${this.config.logPrefix} 已回滚空头仓位 / Rolled back short position`); // 控制台输出
      } catch (error) { // 执行语句
        console.error(`${this.config.logPrefix} 回滚空头仓位失败: ${error.message}`); // 控制台输出
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 关闭套利仓位
   * Close arbitrage position
   *
   * @param {string} id - 仓位 ID / Position ID
   * @param {string} reason - 平仓原因 / Close reason
   * @returns {Object} 平仓结果 / Close result
   */
  async closePosition(id, reason = 'manual') { // 执行语句
    // 获取套利仓位 / Get arbitrage position
    const arbPosition = this.arbPositions.get(id); // 定义常量 arbPosition

    // 验证仓位存在 / Validate position exists
    if (!arbPosition) { // 条件判断 !arbPosition
      throw new Error(`套利仓位不存在 / Arbitrage position not found: ${id}`); // 抛出异常
    } // 结束代码块

    // 验证仓位活跃 / Validate position is active
    if (arbPosition.status !== ARB_STATUS.ACTIVE) { // 条件判断 arbPosition.status !== ARB_STATUS.ACTIVE
      throw new Error(`套利仓位已关闭 / Arbitrage position already closed: ${id}`); // 抛出异常
    } // 结束代码块

    // 获取交易所实例 / Get exchange instances
    const longExchange = this.exchanges.get(arbPosition.longExchange); // 定义常量 longExchange
    const shortExchange = this.exchanges.get(arbPosition.shortExchange); // 定义常量 shortExchange

    // 记录日志 / Log
    console.log( // 控制台输出
      `${this.config.logPrefix} 关闭套利仓位 ${id}: ${arbPosition.symbol} 原因: ${reason}` // 执行语句
    ); // 结束调用或参数

    // 结果对象 / Result object
    const result = { // 定义常量 result
      id, // 执行语句
      success: false, // 设置 success 字段
      longOrder: null, // 设置 longOrder 字段
      shortOrder: null, // 设置 shortOrder 字段
      error: null, // 设置 error 字段
      reason, // 执行语句
    }; // 结束代码块

    try { // 尝试执行
      // 获取当前仓位大小 / Get current position sizes
      const longSize = arbPosition.longPosition?.contracts || arbPosition.openAmount; // 定义常量 longSize
      const shortSize = arbPosition.shortPosition?.contracts || arbPosition.openAmount; // 定义常量 shortSize

      // 同时平仓 / Close simultaneously
      const [longOrder, shortOrder] = await Promise.all([ // 解构赋值
        // 平多头 / Close long
        longExchange.createOrder( // 调用 longExchange.createOrder
          arbPosition.symbol,   // 交易对 / Symbol
          'sell',               // 方向 / Side
          'market',             // 类型 / Type
          longSize,             // 数量 / Amount
          undefined,            // 价格 / Price
          { reduceOnly: true }  // 只减仓 / Reduce only
        ), // 结束调用或参数
        // 平空头 / Close short
        shortExchange.createOrder( // 调用 shortExchange.createOrder
          arbPosition.symbol,   // 交易对 / Symbol
          'buy',                // 方向 / Side
          'market',             // 类型 / Type
          shortSize,            // 数量 / Amount
          undefined,            // 价格 / Price
          { reduceOnly: true }  // 只减仓 / Reduce only
        ), // 结束调用或参数
      ]); // 结束数组或索引

      // 保存订单结果 / Save order results
      result.longOrder = longOrder; // 赋值 result.longOrder
      result.shortOrder = shortOrder; // 赋值 result.shortOrder
      result.success = true; // 赋值 result.success

      // 更新仓位状态 / Update position status
      arbPosition.status = ARB_STATUS.CLOSED; // 赋值 arbPosition.status
      arbPosition.closeTime = Date.now(); // 赋值 arbPosition.closeTime
      arbPosition.closeReason = reason; // 赋值 arbPosition.closeReason
      arbPosition.longClosePrice = longOrder.average; // 赋值 arbPosition.longClosePrice
      arbPosition.shortClosePrice = shortOrder.average; // 赋值 arbPosition.shortClosePrice

      // 累加交易费用 / Add trading fees
      arbPosition.tradingFees += (longOrder.fee?.cost || 0) + (shortOrder.fee?.cost || 0); // 执行语句

      // 计算最终 PnL / Calculate final PnL
      this._calculateFinalPnl(arbPosition); // 调用 _calculateFinalPnl

      // 发出仓位关闭事件 / Emit position closed event
      this.emit('positionClosed', { id, position: arbPosition, orders: { longOrder, shortOrder } }); // 调用 emit

      // 记录日志 / Log
      console.log( // 控制台输出
        `${this.config.logPrefix} ✓ 套利仓位 ${id} 平仓成功 ` + // 执行语句
        `PnL: ${arbPosition.realizedPnl.toFixed(2)} USDT ` + // 执行语句
        `(资金费: ${arbPosition.fundingIncome.toFixed(2)}, 手续费: -${arbPosition.tradingFees.toFixed(2)})` // 执行语句
      ); // 结束调用或参数

    } catch (error) { // 执行语句
      // 保存错误 / Save error
      result.error = error; // 赋值 result.error

      // 记录错误 / Log error
      console.error( // 控制台输出
        `${this.config.logPrefix} ✗ 套利仓位 ${id} 平仓失败: ${error.message}` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 返回结果 / Return result
    return result; // 返回结果
  } // 结束代码块

  /**
   * 计算最终 PnL
   * Calculate final PnL
   *
   * @param {Object} arbPosition - 套利仓位 / Arbitrage position
   * @private
   */
  _calculateFinalPnl(arbPosition) { // 调用 _calculateFinalPnl
    // 计算多头 PnL / Calculate long PnL
    const longPnl = arbPosition.longPosition?.realizedPnl || 0; // 定义常量 longPnl

    // 计算空头 PnL / Calculate short PnL
    const shortPnl = arbPosition.shortPosition?.realizedPnl || 0; // 定义常量 shortPnl

    // 如果有平仓价格，计算价差 PnL / If has close prices, calculate price PnL
    let pricePnl = 0; // 定义变量 pricePnl
    if (arbPosition.longClosePrice && arbPosition.shortClosePrice) { // 条件判断 arbPosition.longClosePrice && arbPosition.sho...
      // 多头 PnL = (平仓价 - 开仓价) × 数量
      // Long PnL = (close price - entry price) × amount
      const longPricePnl = (arbPosition.longClosePrice - arbPosition.longEntryPrice) * arbPosition.openAmount; // 定义常量 longPricePnl

      // 空头 PnL = (开仓价 - 平仓价) × 数量
      // Short PnL = (entry price - close price) × amount
      const shortPricePnl = (arbPosition.shortEntryPrice - arbPosition.shortClosePrice) * arbPosition.openAmount; // 定义常量 shortPricePnl

      pricePnl = longPricePnl + shortPricePnl; // 赋值 pricePnl
    } // 结束代码块

    // 总 PnL = 价差 PnL + 资金费收入 - 交易费用
    // Total PnL = price PnL + funding income - trading fees
    arbPosition.realizedPnl = pricePnl + arbPosition.fundingIncome - arbPosition.tradingFees; // 赋值 arbPosition.realizedPnl
  } // 结束代码块

  /**
   * 记录资金费率收入
   * Record funding rate income
   *
   * @param {string} id - 仓位 ID / Position ID
   * @param {number} income - 资金费收入 / Funding income
   */
  recordFundingIncome(id, income) { // 调用 recordFundingIncome
    // 获取套利仓位 / Get arbitrage position
    const arbPosition = this.arbPositions.get(id); // 定义常量 arbPosition

    // 如果仓位存在且活跃 / If position exists and active
    if (arbPosition && arbPosition.status === ARB_STATUS.ACTIVE) { // 条件判断 arbPosition && arbPosition.status === ARB_STA...
      // 累加资金费收入 / Add funding income
      arbPosition.fundingIncome += income; // 执行语句

      // 更新时间戳 / Update timestamp
      arbPosition.lastUpdate = Date.now(); // 赋值 arbPosition.lastUpdate

      // 记录日志 / Log
      if (this.config.verbose) { // 条件判断 this.config.verbose
        console.log( // 控制台输出
          `${this.config.logPrefix} 仓位 ${id} 资金费收入: ${income.toFixed(4)} USDT ` + // 执行语句
          `累计: ${arbPosition.fundingIncome.toFixed(4)} USDT` // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查仓位是否需要再平衡
   * Check if positions need rebalancing
   *
   * @param {string} id - 仓位 ID / Position ID
   * @returns {Object|null} 再平衡信息 / Rebalancing info
   */
  checkRebalanceNeeded(id) { // 调用 checkRebalanceNeeded
    // 获取套利仓位 / Get arbitrage position
    const arbPosition = this.arbPositions.get(id); // 定义常量 arbPosition

    // 如果仓位不存在或不活跃 / If position not exists or not active
    if (!arbPosition || arbPosition.status !== ARB_STATUS.ACTIVE) { // 条件判断 !arbPosition || arbPosition.status !== ARB_ST...
      return null; // 返回结果
    } // 结束代码块

    // 获取多空仓位大小 / Get long and short position sizes
    const longSize = arbPosition.longPosition?.contracts || 0; // 定义常量 longSize
    const shortSize = arbPosition.shortPosition?.contracts || 0; // 定义常量 shortSize

    // 如果任一仓位为 0 / If any position is 0
    if (longSize === 0 || shortSize === 0) { // 条件判断 longSize === 0 || shortSize === 0
      return null; // 返回结果
    } // 结束代码块

    // 计算不平衡比例 / Calculate imbalance ratio
    const avgSize = (longSize + shortSize) / 2; // 定义常量 avgSize
    const imbalance = Math.abs(longSize - shortSize) / avgSize; // 定义常量 imbalance

    // 如果不平衡超过阈值 / If imbalance exceeds threshold
    if (imbalance > this.config.imbalanceThreshold) { // 条件判断 imbalance > this.config.imbalanceThreshold
      return { // 返回结果
        id, // 执行语句
        symbol: arbPosition.symbol, // 设置 symbol 字段
        longSize, // 执行语句
        shortSize, // 执行语句
        imbalance, // 执行语句
        needsRebalance: true, // 设置 needsRebalance 字段
        action: longSize > shortSize ? 'reduce_long' : 'reduce_short', // 设置 action 字段
        adjustAmount: Math.abs(longSize - shortSize) / 2, // 设置 adjustAmount 字段
      }; // 结束代码块
    } // 结束代码块

    // 不需要再平衡 / No rebalancing needed
    return null; // 返回结果
  } // 结束代码块

  /**
   * 获取所有活跃仓位
   * Get all active positions
   *
   * @returns {Array} 活跃仓位列表 / Active position list
   */
  getActivePositions() { // 调用 getActivePositions
    // 过滤活跃仓位 / Filter active positions
    const active = []; // 定义常量 active
    for (const [id, position] of this.arbPositions) { // 循环 const [id, position] of this.arbPositions
      if (position.status === ARB_STATUS.ACTIVE) { // 条件判断 position.status === ARB_STATUS.ACTIVE
        active.push({ id, ...position }); // 调用 active.push
      } // 结束代码块
    } // 结束代码块
    return active; // 返回结果
  } // 结束代码块

  /**
   * 获取总 PnL
   * Get total PnL
   *
   * @returns {Object} PnL 统计 / PnL statistics
   */
  getTotalPnl() { // 调用 getTotalPnl
    // 统计对象 / Statistics object
    const stats = { // 定义常量 stats
      // 已实现 PnL / Realized PnL
      realizedPnl: 0, // 设置 realizedPnl 字段

      // 未实现 PnL / Unrealized PnL
      unrealizedPnl: 0, // 设置 unrealizedPnl 字段

      // 资金费收入 / Funding income
      fundingIncome: 0, // 设置 fundingIncome 字段

      // 交易费用 / Trading fees
      tradingFees: 0, // 设置 tradingFees 字段

      // 活跃仓位数 / Active position count
      activeCount: 0, // 设置 activeCount 字段

      // 已关闭仓位数 / Closed position count
      closedCount: 0, // 设置 closedCount 字段
    }; // 结束代码块

    // 遍历所有仓位 / Iterate all positions
    for (const position of this.arbPositions.values()) { // 循环 const position of this.arbPositions.values()
      // 累加资金费收入 / Add funding income
      stats.fundingIncome += position.fundingIncome; // 执行语句

      // 累加交易费用 / Add trading fees
      stats.tradingFees += position.tradingFees; // 执行语句

      // 根据状态统计 / Count by status
      if (position.status === ARB_STATUS.ACTIVE) { // 条件判断 position.status === ARB_STATUS.ACTIVE
        // 活跃仓位 / Active position
        stats.activeCount++; // 执行语句

        // 计算未实现 PnL / Calculate unrealized PnL
        const longPnl = position.longPosition?.unrealizedPnl || 0; // 定义常量 longPnl
        const shortPnl = position.shortPosition?.unrealizedPnl || 0; // 定义常量 shortPnl
        stats.unrealizedPnl += longPnl + shortPnl; // 执行语句

      } else if (position.status === ARB_STATUS.CLOSED) { // 执行语句
        // 已关闭仓位 / Closed position
        stats.closedCount++; // 执行语句

        // 累加已实现 PnL / Add realized PnL
        stats.realizedPnl += position.realizedPnl; // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 返回统计 / Return statistics
    return stats; // 返回结果
  } // 结束代码块
} // 结束代码块

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 跨交易所资金费率套利策略
 * Cross-Exchange Funding Rate Arbitrage Strategy
 */
export class FundingArbStrategy extends BaseStrategy { // 导出类 FundingArbStrategy
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

    // 设置策略名称 / Set strategy name
    this.name = 'FundingArbStrategy'; // 设置 name

    // 保存配置 / Save config
    this.config = config; // 设置 config

    // 交易所实例映射 / Exchange instance map
    this.exchanges = new Map(); // 设置 exchanges

    // 资金费率管理器 / Funding rate manager
    this.fundingManager = new FundingRateManager(config); // 设置 fundingManager

    // 仓位管理器 / Position manager
    this.positionManager = new PositionManager(config); // 设置 positionManager

    // PnL 统计 / PnL statistics
    this.pnlStats = { // 设置 pnlStats
      // 每日 PnL / Daily PnL
      dailyPnl: 0, // 设置 dailyPnl 字段

      // 今日开始时间 / Today start time
      dayStart: this._getDayStart(), // 设置 dayStart 字段

      // 累计 PnL / Cumulative PnL
      totalPnl: 0, // 设置 totalPnl 字段

      // 最高权益 / Peak equity
      peakEquity: 0, // 设置 peakEquity 字段

      // 当前回撤 / Current drawdown
      currentDrawdown: 0, // 设置 currentDrawdown 字段
    }; // 结束代码块

    // 再平衡定时器 / Rebalancing timer
    this.rebalanceTimer = null; // 设置 rebalanceTimer

    // 是否正在运行 / Whether running
    this.running = false; // 设置 running

    // 设置事件监听 / Set up event listeners
    this._setupEventListeners(); // 调用 _setupEventListeners
  } // 结束代码块

  /**
   * 设置事件监听
   * Set up event listeners
   * @private
   */
  _setupEventListeners() { // 调用 _setupEventListeners
    // 监听资金费率更新 / Listen for funding rate updates
    this.fundingManager.on('updated', () => { // 访问 fundingManager
      // 检查套利机会 / Check arbitrage opportunities
      this._checkArbitrageOpportunities(); // 调用 _checkArbitrageOpportunities
    }); // 结束代码块

    // 监听仓位更新 / Listen for position updates
    this.positionManager.on('updated', () => { // 访问 positionManager
      // 更新 PnL 统计 / Update PnL statistics
      this._updatePnlStats(); // 调用 _updatePnlStats
    }); // 结束代码块

    // 监听仓位开启 / Listen for position opened
    this.positionManager.on('positionOpened', (data) => { // 访问 positionManager
      // 发出信号 / Emit signal
      this.emit('positionOpened', data); // 调用 emit
    }); // 结束代码块

    // 监听仓位关闭 / Listen for position closed
    this.positionManager.on('positionClosed', (data) => { // 访问 positionManager
      // 更新 PnL / Update PnL
      this.pnlStats.dailyPnl += data.position.realizedPnl; // 访问 pnlStats
      this.pnlStats.totalPnl += data.position.realizedPnl; // 访问 pnlStats

      // 发出信号 / Emit signal
      this.emit('positionClosed', data); // 调用 emit
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 资金费率套利策略需要 Ticker 和资金费率数据 / Funding arbitrage needs ticker and funding rate
    return ['ticker', 'fundingRate']; // 返回结果
  } // 结束代码块

  /**
   * 初始化策略
   * Initialize strategy
   *
   * @param {Map} exchanges - 交易所实例映射 / Exchange instance map
   */
  async onInit(exchanges) { // 执行语句
    // 保存交易所引用 / Save exchange references
    this.exchanges = exchanges || new Map(); // 设置 exchanges

    // 设置交易所给管理器（如果有交易所） / Set exchanges to managers (if available)
    if (exchanges) { // 条件判断 exchanges
      this.fundingManager.setExchanges(exchanges); // 访问 fundingManager
      this.positionManager.setExchanges(exchanges); // 访问 positionManager
    } // 结束代码块

    // 记录日志 / Log
    this.log(`策略初始化: 监控 ${this.config.symbols.length} 个交易对`, 'info'); // 调用 log
    if (exchanges && exchanges.size > 0) { // 条件判断 exchanges && exchanges.size > 0
      this.log(`交易所: ${Array.from(exchanges.keys()).join(', ')}`, 'info'); // 调用 log

      // 跨交易所套利警告 / Cross-exchange arbitrage warning
      if (exchanges.size < 2) { // 条件判断 exchanges.size < 2
        this.log( // 调用 log
          `⚠️ 警告: 跨交易所资金费率套利需要至少2个交易所，当前只有${exchanges.size}个。` + // 执行语句
          `套利机会检查将只能比较来自MarketDataEngine的不同来源数据。` + // 执行语句
          `/ Warning: Cross-exchange funding arbitrage requires at least 2 exchanges.`, // 执行语句
          'warn' // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } else { // 执行语句
      this.log(`回测模式: 无实时交易所连接`, 'info'); // 调用 log
    } // 结束代码块
    this.log(`最小年化利差: ${(this.config.minAnnualizedSpread * 100).toFixed(1)}%`, 'info'); // 调用 log
    this.log(`最大仓位: ${this.config.maxPositionSize} USDT`, 'info'); // 调用 log

    // 调用父类初始化 / Call parent initialization
    await super.onInit(); // 等待异步结果
  } // 结束代码块

  /**
   * 启动策略
   * Start strategy
   */
  async start() { // 执行语句
    // 标记为运行中 / Mark as running
    this.running = true; // 设置 running

    // 启动资金费率监控 / Start funding rate monitoring
    await this.fundingManager.start(); // 等待异步结果

    // 启动仓位管理 / Start position management
    await this.positionManager.start(); // 等待异步结果

    // 启动再平衡检查 / Start rebalancing check
    this.rebalanceTimer = setInterval( // 设置 rebalanceTimer
      () => this._checkRebalancing(), // 定义箭头函数
      this.config.rebalanceInterval // 访问 config
    ); // 结束调用或参数

    // 记录日志 / Log
    this.log('策略已启动 / Strategy started', 'info'); // 调用 log

    // 发出启动事件 / Emit start event
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止策略
   * Stop strategy
   */
  async stop() { // 执行语句
    // 标记为停止 / Mark as stopped
    this.running = false; // 设置 running

    // 停止资金费率监控 / Stop funding rate monitoring
    this.fundingManager.stop(); // 访问 fundingManager

    // 停止仓位管理 / Stop position management
    this.positionManager.stop(); // 访问 positionManager

    // 清除再平衡定时器 / Clear rebalancing timer
    if (this.rebalanceTimer) { // 条件判断 this.rebalanceTimer
      clearInterval(this.rebalanceTimer); // 调用 clearInterval
      this.rebalanceTimer = null; // 设置 rebalanceTimer
    } // 结束代码块

    // 记录日志 / Log
    this.log('策略已停止 / Strategy stopped', 'info'); // 调用 log

    // 发出停止事件 / Emit stop event
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  /**
   * 检查套利机会
   * Check arbitrage opportunities
   * @private
   */
  async _checkArbitrageOpportunities() { // 执行语句
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 检查风控 / Check risk control
    if (!this._checkRiskControl()) { // 条件判断 !this._checkRiskControl()
      this.log('风控检查未通过，跳过套利检查 / Risk control check failed', 'warn'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    // 检查是否有交易所连接 / Check if exchanges are connected
    if (!this.exchanges || this.exchanges.size === 0) { // 条件判断 !this.exchanges || this.exchanges.size === 0
      this.log('警告: 无交易所连接，无法执行套利检查 / Warning: No exchanges connected', 'warn'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    // 遍历所有交易对 / Iterate all symbols
    for (const symbol of this.config.symbols) { // 循环 const symbol of this.config.symbols
      // 查找最佳机会 / Find best opportunity
      const opportunity = this.fundingManager.findBestOpportunity(symbol); // 定义常量 opportunity

      // 如果没有机会，记录日志 / If no opportunity, log it
      if (!opportunity) { // 条件判断 !opportunity
        if (this.config.verbose) { // 条件判断 this.config.verbose
          // 获取当前资金费率数据用于调试 / Get current funding rate data for debugging
          const rates = this.fundingManager.getFundingRates(symbol); // 定义常量 rates
          const ratesInfo = rates.size > 0 // 定义常量 ratesInfo
            ? Array.from(rates.entries()).map(([ex, data]) => `${ex}:${(data.current * 100).toFixed(4)}%`).join(', ') // 定义箭头函数
            : '无数据'; // 执行语句
          this.log(`${symbol} 无套利机会 (费率: ${ratesInfo}) / No arbitrage opportunity`, 'debug'); // 调用 log
        } // 结束代码块
        continue; // 继续下一轮循环
      } // 结束代码块

      // 记录发现的机会 / Log found opportunity
      this.log( // 调用 log
        `${symbol} 发现机会: 多@${opportunity.longExchange}(${(opportunity.longRate * 100).toFixed(4)}%) ` + // 执行语句
        `空@${opportunity.shortExchange}(${(opportunity.shortRate * 100).toFixed(4)}%) ` + // 执行语句
        `年化利差: ${(opportunity.annualizedSpread * 100).toFixed(2)}% ` + // 执行语句
        `(阈值: ${(this.config.minAnnualizedSpread * 100).toFixed(2)}%)`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数

      // 检查年化利差是否达到阈值 / Check if annualized spread meets threshold
      if (opportunity.annualizedSpread >= this.config.minAnnualizedSpread) { // 条件判断 opportunity.annualizedSpread >= this.config.m...
        // 检查是否已有该交易对的仓位 / Check if already has position for this symbol
        const existingPosition = this._findExistingPosition( // 定义常量 existingPosition
          symbol, // 执行语句
          opportunity.longExchange, // 执行语句
          opportunity.shortExchange // 执行语句
        ); // 结束调用或参数

        if (existingPosition) { // 条件判断 existingPosition
          // 已有仓位，考虑加仓 / Already has position, consider adding
          await this._considerAddingPosition(existingPosition, opportunity); // 等待异步结果
        } else { // 执行语句
          // 没有仓位，开新仓 / No position, open new one
          await this._openNewPosition(opportunity); // 等待异步结果
        } // 结束代码块
      } // 结束代码块

      // 检查是否需要平仓 / Check if need to close positions
      await this._checkCloseConditions(symbol); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

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
  _findExistingPosition(symbol, longExchange, shortExchange) { // 调用 _findExistingPosition
    // 获取活跃仓位 / Get active positions
    const activePositions = this.positionManager.getActivePositions(); // 定义常量 activePositions

    // 查找匹配的仓位 / Find matching position
    return activePositions.find( // 返回结果
      p => p.symbol === symbol && // 赋值 p
           p.longExchange === longExchange && // 赋值 p.longExchange
           p.shortExchange === shortExchange // 赋值 p.shortExchange
    ) || null; // 执行语句
  } // 结束代码块

  /**
   * 考虑加仓
   * Consider adding to position
   *
   * @param {Object} existingPosition - 已存在的仓位 / Existing position
   * @param {Object} opportunity - 套利机会 / Arbitrage opportunity
   * @private
   */
  async _considerAddingPosition(existingPosition, opportunity) { // 执行语句
    // 计算当前仓位大小 / Calculate current position size
    const currentSize = existingPosition.openSize; // 定义常量 currentSize

    // 如果已达最大仓位，跳过 / If already at max, skip
    if (currentSize >= this.config.maxPositionSize) { // 条件判断 currentSize >= this.config.maxPositionSize
      return; // 返回结果
    } // 结束代码块

    // 计算可加仓大小 / Calculate addable size
    const addSize = Math.min( // 定义常量 addSize
      this.config.maxPositionSize * this.config.positionRatio, // 访问 config
      this.config.maxPositionSize - currentSize // 访问 config
    ); // 结束调用或参数

    // 如果加仓大小太小，跳过 / If add size too small, skip
    if (addSize < this.config.minPositionSize) { // 条件判断 addSize < this.config.minPositionSize
      return; // 返回结果
    } // 结束代码块

    // 检查总仓位限制 / Check total position limit
    if (this.positionManager.totalUsedMargin + addSize > this.config.totalMaxPosition) { // 条件判断 this.positionManager.totalUsedMargin + addSiz...
      return; // 返回结果
    } // 结束代码块

    // 记录日志 / Log
    this.log( // 调用 log
      `考虑加仓 ${existingPosition.id}: ${opportunity.symbol} ` + // 执行语句
      `年化利差: ${(opportunity.annualizedSpread * 100).toFixed(2)}%`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数

    // 注意: 这里简化处理，实际应该开新仓位而不是加仓
    // Note: Simplified here, should open new position instead of adding
    // 可以根据需求实现加仓逻辑 / Can implement add logic as needed
  } // 结束代码块

  /**
   * 开新仓位
   * Open new position
   *
   * @param {Object} opportunity - 套利机会 / Arbitrage opportunity
   * @private
   */
  async _openNewPosition(opportunity) { // 执行语句
    // 计算仓位大小 / Calculate position size
    const size = Math.min( // 定义常量 size
      this.config.maxPositionSize * this.config.positionRatio, // 访问 config
      this.config.totalMaxPosition - this.positionManager.totalUsedMargin // 访问 config
    ); // 结束调用或参数

    // 如果仓位太小，跳过 / If size too small, skip
    if (size < this.config.minPositionSize) { // 条件判断 size < this.config.minPositionSize
      this.log( // 调用 log
        `仓位太小，跳过: ${size.toFixed(2)} USDT < ${this.config.minPositionSize} USDT`, // 执行语句
        'warn' // 执行语句
      ); // 结束调用或参数
      return; // 返回结果
    } // 结束代码块

    // 记录日志 / Log
    this.log( // 调用 log
      `发现套利机会: ${opportunity.symbol} ` + // 执行语句
      `多@${opportunity.longExchange} 空@${opportunity.shortExchange} ` + // 执行语句
      `年化利差: ${(opportunity.annualizedSpread * 100).toFixed(2)}% ` + // 执行语句
      `开仓: ${size.toFixed(2)} USDT`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数

    // 开启仓位 / Open position
    try { // 尝试执行
      const result = await this.positionManager.openPosition(opportunity, size); // 定义常量 result

      if (result.success) { // 条件判断 result.success
        // 发出开仓信号 / Emit open signal
        this.setBuySignal( // 调用 setBuySignal
          `套利开仓: ${opportunity.symbol} 年化${(opportunity.annualizedSpread * 100).toFixed(1)}%` // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } catch (error) { // 执行语句
      this.log(`开仓失败: ${error.message}`, 'error'); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查平仓条件
   * Check close conditions
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  async _checkCloseConditions(symbol) { // 执行语句
    // 获取活跃仓位 / Get active positions
    const activePositions = this.positionManager.getActivePositions() // 定义常量 activePositions
      .filter(p => p.symbol === symbol); // 定义箭头函数

    // 遍历活跃仓位 / Iterate active positions
    for (const position of activePositions) { // 循环 const position of activePositions
      // 计算当前利差 / Calculate current spread
      const currentSpread = this.fundingManager.calculateSpread( // 定义常量 currentSpread
        symbol, // 执行语句
        position.longExchange, // 执行语句
        position.shortExchange // 执行语句
      ); // 结束调用或参数

      // 如果利差无效，跳过 / If spread invalid, skip
      if (!currentSpread.valid) { // 条件判断 !currentSpread.valid
        continue; // 继续下一轮循环
      } // 结束代码块

      // 检查平仓条件 / Check close conditions
      let shouldClose = false; // 定义变量 shouldClose
      let closeReason = ''; // 定义变量 closeReason

      // 条件 1: 利差低于平仓阈值 / Condition 1: Spread below close threshold
      if (currentSpread.annualizedSpread < this.config.closeSpreadThreshold) { // 条件判断 currentSpread.annualizedSpread < this.config....
        shouldClose = true; // 赋值 shouldClose
        closeReason = `利差收窄: ${(currentSpread.annualizedSpread * 100).toFixed(2)}%`; // 赋值 closeReason
      } // 结束代码块

      // 条件 2: 利差反向超过紧急阈值 / Condition 2: Spread reversed beyond emergency threshold
      if (currentSpread.annualizedSpread < this.config.emergencyCloseThreshold) { // 条件判断 currentSpread.annualizedSpread < this.config....
        shouldClose = true; // 赋值 shouldClose
        closeReason = `利差反向: ${(currentSpread.annualizedSpread * 100).toFixed(2)}%`; // 赋值 closeReason
      } // 结束代码块

      // 如果需要平仓 / If should close
      if (shouldClose) { // 条件判断 shouldClose
        this.log(`平仓条件触发 ${position.id}: ${closeReason}`, 'info'); // 调用 log

        try { // 尝试执行
          const result = await this.positionManager.closePosition(position.id, closeReason); // 定义常量 result

          if (result.success) { // 条件判断 result.success
            // 发出平仓信号 / Emit close signal
            this.setSellSignal(`套利平仓: ${symbol} ${closeReason}`); // 调用 setSellSignal
          } // 结束代码块
        } catch (error) { // 执行语句
          this.log(`平仓失败: ${error.message}`, 'error'); // 调用 log
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查再平衡
   * Check rebalancing
   * @private
   */
  async _checkRebalancing() { // 执行语句
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 获取活跃仓位 / Get active positions
    const activePositions = this.positionManager.getActivePositions(); // 定义常量 activePositions

    // 遍历活跃仓位 / Iterate active positions
    for (const position of activePositions) { // 循环 const position of activePositions
      // 检查是否需要再平衡 / Check if needs rebalancing
      const rebalanceInfo = this.positionManager.checkRebalanceNeeded(position.id); // 定义常量 rebalanceInfo

      // 如果需要再平衡 / If needs rebalancing
      if (rebalanceInfo && rebalanceInfo.needsRebalance) { // 条件判断 rebalanceInfo && rebalanceInfo.needsRebalance
        this.log( // 调用 log
          `仓位 ${position.id} 需要再平衡: ` + // 执行语句
          `多头=${rebalanceInfo.longSize.toFixed(4)} 空头=${rebalanceInfo.shortSize.toFixed(4)} ` + // 执行语句
          `不平衡=${(rebalanceInfo.imbalance * 100).toFixed(2)}%`, // 执行语句
          'warn' // 执行语句
        ); // 结束调用或参数

        // 执行再平衡 / Execute rebalancing
        await this._executeRebalance(position, rebalanceInfo); // 等待异步结果
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行再平衡
   * Execute rebalancing
   *
   * @param {Object} position - 仓位 / Position
   * @param {Object} rebalanceInfo - 再平衡信息 / Rebalancing info
   * @private
   */
  async _executeRebalance(position, rebalanceInfo) { // 执行语句
    // 获取需要调整的交易所 / Get exchange to adjust
    const exchangeName = rebalanceInfo.action === 'reduce_long' // 定义常量 exchangeName
      ? position.longExchange // 执行语句
      : position.shortExchange; // 执行语句

    const exchange = this.exchanges.get(exchangeName); // 定义常量 exchange

    // 如果交易所不存在，跳过 / If exchange not exists, skip
    if (!exchange) { // 条件判断 !exchange
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 确定方向 / Determine side
      const side = rebalanceInfo.action === 'reduce_long' ? 'sell' : 'buy'; // 定义常量 side

      // 下单调整 / Place order to adjust
      const order = await exchange.createOrder( // 定义常量 order
        position.symbol, // 执行语句
        side, // 执行语句
        'market', // 执行语句
        rebalanceInfo.adjustAmount, // 执行语句
        undefined, // 执行语句
        { reduceOnly: true } // 执行语句
      ); // 结束调用或参数

      this.log( // 调用 log
        `再平衡完成 ${position.id}: ${side} ${rebalanceInfo.adjustAmount.toFixed(4)} @ ${exchangeName}`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数

    } catch (error) { // 执行语句
      this.log(`再平衡失败: ${error.message}`, 'error'); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查风控
   * Check risk control
   *
   * @returns {boolean} 是否通过风控 / Whether passed risk control
   * @private
   */
  _checkRiskControl() { // 调用 _checkRiskControl
    // 检查每日亏损限制 / Check daily loss limit
    if (this.pnlStats.dailyPnl < -this.config.maxDailyLoss) { // 条件判断 this.pnlStats.dailyPnl < -this.config.maxDail...
      this.log( // 调用 log
        `每日亏损超限: ${this.pnlStats.dailyPnl.toFixed(2)} USDT < -${this.config.maxDailyLoss} USDT`, // 执行语句
        'warn' // 执行语句
      ); // 结束调用或参数
      return false; // 返回结果
    } // 结束代码块

    // 检查最大回撤 / Check max drawdown
    if (this.pnlStats.currentDrawdown > this.config.maxDrawdown) { // 条件判断 this.pnlStats.currentDrawdown > this.config.m...
      this.log( // 调用 log
        `回撤超限: ${(this.pnlStats.currentDrawdown * 100).toFixed(2)}% > ${(this.config.maxDrawdown * 100).toFixed(2)}%`, // 执行语句
        'warn' // 执行语句
      ); // 结束调用或参数
      return false; // 返回结果
    } // 结束代码块

    // 通过风控 / Passed risk control
    return true; // 返回结果
  } // 结束代码块

  /**
   * 更新 PnL 统计
   * Update PnL statistics
   * @private
   */
  _updatePnlStats() { // 调用 _updatePnlStats
    // 检查是否跨天 / Check if crossed day
    const currentDayStart = this._getDayStart(); // 定义常量 currentDayStart
    if (currentDayStart > this.pnlStats.dayStart) { // 条件判断 currentDayStart > this.pnlStats.dayStart
      // 重置每日 PnL / Reset daily PnL
      this.log( // 调用 log
        `跨天重置: 昨日 PnL=${this.pnlStats.dailyPnl.toFixed(2)} USDT`, // 执行语句
        'info' // 执行语句
      ); // 结束调用或参数
      this.pnlStats.dailyPnl = 0; // 访问 pnlStats
      this.pnlStats.dayStart = currentDayStart; // 访问 pnlStats
    } // 结束代码块

    // 获取仓位统计 / Get position statistics
    const posStats = this.positionManager.getTotalPnl(); // 定义常量 posStats

    // 计算当前权益 / Calculate current equity
    // 假设初始资金为 totalMaxPosition / Assume initial capital is totalMaxPosition
    const currentEquity = this.config.totalMaxPosition + // 定义常量 currentEquity
                          posStats.realizedPnl + // 执行语句
                          posStats.unrealizedPnl; // 执行语句

    // 更新峰值 / Update peak
    if (currentEquity > this.pnlStats.peakEquity) { // 条件判断 currentEquity > this.pnlStats.peakEquity
      this.pnlStats.peakEquity = currentEquity; // 访问 pnlStats
    } // 结束代码块

    // 计算回撤 / Calculate drawdown
    if (this.pnlStats.peakEquity > 0) { // 条件判断 this.pnlStats.peakEquity > 0
      this.pnlStats.currentDrawdown = // 访问 pnlStats
        (this.pnlStats.peakEquity - currentEquity) / this.pnlStats.peakEquity; // 执行语句
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取当天开始时间戳
   * Get day start timestamp
   *
   * @returns {number} 当天开始时间戳 / Day start timestamp
   * @private
   */
  _getDayStart() { // 调用 _getDayStart
    const now = new Date(); // 定义常量 now
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); // 返回结果
  } // 结束代码块

  /**
   * 获取策略状态
   * Get strategy status
   *
   * @returns {Object} 策略状态 / Strategy status
   */
  getStatus() { // 调用 getStatus
    // 获取仓位统计 / Get position statistics
    const posStats = this.positionManager.getTotalPnl(); // 定义常量 posStats

    // 返回状态 / Return status
    return { // 返回结果
      // 策略名称 / Strategy name
      name: this.name, // 设置 name 字段

      // 是否运行中 / Whether running
      running: this.running, // 设置 running 字段

      // 监控的交易对 / Monitored symbols
      symbols: this.config.symbols, // 设置 symbols 字段

      // 交易所 / Exchanges
      exchanges: Array.from(this.exchanges.keys()), // 设置 exchanges 字段

      // 活跃仓位数 / Active position count
      activePositions: posStats.activeCount, // 设置 activePositions 字段

      // 已关闭仓位数 / Closed position count
      closedPositions: posStats.closedCount, // 设置 closedPositions 字段

      // 已实现 PnL / Realized PnL
      realizedPnl: posStats.realizedPnl, // 设置 realizedPnl 字段

      // 未实现 PnL / Unrealized PnL
      unrealizedPnl: posStats.unrealizedPnl, // 设置 unrealizedPnl 字段

      // 资金费收入 / Funding income
      fundingIncome: posStats.fundingIncome, // 设置 fundingIncome 字段

      // 交易费用 / Trading fees
      tradingFees: posStats.tradingFees, // 设置 tradingFees 字段

      // 每日 PnL / Daily PnL
      dailyPnl: this.pnlStats.dailyPnl, // 设置 dailyPnl 字段

      // 累计 PnL / Total PnL
      totalPnl: this.pnlStats.totalPnl, // 设置 totalPnl 字段

      // 当前回撤 / Current drawdown
      currentDrawdown: this.pnlStats.currentDrawdown, // 设置 currentDrawdown 字段

      // 已用保证金 / Used margin
      usedMargin: this.positionManager.totalUsedMargin, // 设置 usedMargin 字段

      // 更新时间 / Update timestamp
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取所有套利机会
   * Get all arbitrage opportunities
   *
   * @returns {Array} 套利机会列表 / Arbitrage opportunity list
   */
  getOpportunities() { // 调用 getOpportunities
    // 结果数组 / Result array
    const opportunities = []; // 定义常量 opportunities

    // 遍历所有交易对 / Iterate all symbols
    for (const symbol of this.config.symbols) { // 循环 const symbol of this.config.symbols
      // 获取最佳机会 / Get best opportunity
      const opportunity = this.fundingManager.findBestOpportunity(symbol); // 定义常量 opportunity

      // 如果有机会，添加到结果 / If has opportunity, add to result
      if (opportunity) { // 条件判断 opportunity
        opportunities.push(opportunity); // 调用 opportunities.push
      } // 结束代码块
    } // 结束代码块

    // 按年化利差排序 / Sort by annualized spread
    opportunities.sort((a, b) => b.annualizedSpread - a.annualizedSpread); // 调用 opportunities.sort

    // 返回结果 / Return result
    return opportunities; // 返回结果
  } // 结束代码块

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
  async manualOpen(symbol, longExchange, shortExchange, size) { // 执行语句
    // 构建机会对象 / Build opportunity object
    const opportunity = this.fundingManager.calculateSpread(symbol, longExchange, shortExchange); // 定义常量 opportunity

    // 验证机会 / Validate opportunity
    if (!opportunity.valid) { // 条件判断 !opportunity.valid
      throw new Error(`无法获取利差信息: ${opportunity.reason}`); // 抛出异常
    } // 结束代码块

    // 开仓 / Open position
    return await this.positionManager.openPosition(opportunity, size); // 返回结果
  } // 结束代码块

  /**
   * 手动平仓
   * Manual close position
   *
   * @param {string} id - 仓位 ID / Position ID
   * @returns {Object} 平仓结果 / Close result
   */
  async manualClose(id) { // 执行语句
    // 平仓 / Close position
    return await this.positionManager.closePosition(id, 'manual'); // 返回结果
  } // 结束代码块

  /**
   * 平掉所有仓位
   * Close all positions
   *
   * @returns {Array} 平仓结果列表 / Close results list
   */
  async closeAllPositions() { // 执行语句
    // 获取活跃仓位 / Get active positions
    const activePositions = this.positionManager.getActivePositions(); // 定义常量 activePositions

    // 结果数组 / Result array
    const results = []; // 定义常量 results

    // 遍历平仓 / Iterate and close
    for (const position of activePositions) { // 循环 const position of activePositions
      try { // 尝试执行
        const result = await this.positionManager.closePosition(position.id, 'close_all'); // 定义常量 result
        results.push(result); // 调用 results.push
      } catch (error) { // 执行语句
        results.push({ // 调用 results.push
          id: position.id, // 设置 id 字段
          success: false, // 设置 success 字段
          error: error.message, // 设置 error 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 返回结果 / Return results
    return results; // 返回结果
  } // 结束代码块

  /**
   * 处理资金费率更新事件
   * Handle funding rate update event
   *
   * @param {Object} data - 资金费率数据 / Funding rate data
   * @returns {Promise<void>}
   */
  async onFundingRate(data) { // 执行语句
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 记录收到资金费率更新 / Log funding rate update received
    if (this.config.verbose) { // 条件判断 this.config.verbose
      this.log( // 调用 log
        `收到资金费率更新: ${data.symbol} ${data.exchange} rate=${(data.fundingRate * 100).toFixed(4)}%`, // 执行语句
        'debug' // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 保存资金费率数据到管理器 / Save funding rate data to manager
    if (data.symbol && data.exchange && data.fundingRate !== undefined) { // 条件判断 data.symbol && data.exchange && data.fundingR...
      this.fundingManager._saveFundingRate(data.symbol, data.exchange, { // 访问 fundingManager
        fundingRate: data.fundingRate, // 设置 fundingRate 字段
        fundingRatePredicted: data.fundingRatePredicted || data.fundingRate, // 设置 fundingRatePredicted 字段
        fundingTimestamp: data.fundingTimestamp || Date.now(), // 设置 fundingTimestamp 字段
        markPrice: data.markPrice || 0, // 设置 markPrice 字段
        indexPrice: data.indexPrice || 0, // 设置 indexPrice 字段
      }); // 结束代码块
    } // 结束代码块

    // 检查套利机会 / Check arbitrage opportunities
    await this._checkArbitrageOpportunities(); // 等待异步结果
  } // 结束代码块

  /**
   * 处理 Ticker 更新事件
   * Handle ticker update event
   *
   * @param {Object} data - Ticker 数据 / Ticker data
   * @returns {Promise<void>}
   */
  async onTicker(data) { // 执行语句
    // Ticker 更新时记录价格但不触发套利检查 (资金费率套利主要依赖资金费率事件)
    // Log price on ticker update but don't trigger arbitrage check (funding arb mainly relies on funding rate events)
    if (this.config.verbose) { // 条件判断 this.config.verbose
      this.log(`Ticker 更新: ${data.symbol} price=${data.last}`, 'debug'); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 K 线更新事件
   * Handle candle update event
   *
   * @param {Object} data - K 线数据 / Candle data
   * @returns {Promise<void>}
   */
  async onCandle(data) { // 执行语句
    // K 线更新时可以定期检查套利机会 / Check arbitrage opportunities periodically on candle update
    if (this.running) { // 条件判断 this.running
      await this._checkArbitrageOpportunities(); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 每个 K 线/tick 触发的方法 (回测模式)
   * Method triggered on each candle/tick (backtest mode)
   *
   * @param {Object} candle - 当前 K 线数据 / Current candle data
   * @param {Array} history - 历史 K 线数据 / Historical candle data
   * @returns {Promise<void>}
   */
  async onTick(candle, history) { // 执行语句
    // 在回测模式下，模拟资金费率套利逻辑
    // In backtest mode, simulate funding rate arbitrage logic

    // 如果没有交易所连接（回测模式），使用模拟逻辑
    // If no exchange connection (backtest mode), use simulated logic
    if (!this.exchanges || this.exchanges.size === 0) { // 条件判断 !this.exchanges || this.exchanges.size === 0
      // 回测模式下的简化处理
      // Simplified handling in backtest mode
      await this._backtestOnTick(candle, history); // 等待异步结果
      return; // 返回结果
    } // 结束代码块

    // 实盘模式：检查套利机会
    // Live mode: check arbitrage opportunities
    await this._checkArbitrageOpportunities(); // 等待异步结果
  } // 结束代码块

  /**
   * 回测模式下的 onTick 处理
   * onTick handling in backtest mode
   *
   * @param {Object} candle - 当前 K 线数据 / Current candle data
   * @param {Array} history - 历史 K 线数据 / Historical candle data
   * @private
   */
  async _backtestOnTick(candle, history) { // 执行语句
    // 在回测模式下，我们模拟资金费率套利
    // In backtest mode, we simulate funding rate arbitrage

    // 资金费率套利策略在回测中需要多交易所数据
    // Funding rate arbitrage strategy needs multi-exchange data in backtest
    // 由于回测数据通常只有单交易所，这里提供简化的模拟
    // Since backtest data usually only has single exchange, provide simplified simulation

    // 检查是否有足够的历史数据 / Check if enough history
    if (!history || history.length < 24) { // 条件判断 !history || history.length < 24
      return; // 返回结果
    } // 结束代码块

    // 获取当前价格 / Get current price
    const currentPrice = candle.close; // 定义常量 currentPrice

    // 模拟资金费率 (基于价格波动) / Simulate funding rate (based on price volatility)
    // 这是一个简化的模拟，实际资金费率取决于多种因素
    // This is a simplified simulation, actual funding rate depends on many factors
    const priceChange24h = (currentPrice - history[history.length - 24].close) / history[history.length - 24].close; // 定义常量 priceChange24h

    // 计算价格波动率 (用于模拟资金费率波动)
    // Calculate price volatility (for simulating funding rate fluctuation)
    const prices = history.slice(-24).map(c => c.close); // 定义函数 prices
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length; // 定义函数 avgPrice
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length; // 定义函数 variance
    const volatility = Math.sqrt(variance) / avgPrice; // 定义常量 volatility

    // 模拟资金费率：结合价格变化和波动率
    // Simulated funding rate: combining price change and volatility
    // 实际资金费率通常在 -0.1% 到 0.3% 之间 (每8小时)
    // Actual funding rate is usually between -0.1% to 0.3% (per 8 hours)
    const baseRate = priceChange24h * 0.01; // 基于趋势
    const volatilityRate = volatility * 0.5; // 基于波动
    const simulatedFundingRate = baseRate + (Math.random() - 0.5) * volatilityRate; // 定义常量 simulatedFundingRate

    // 年化利差 / Annualized spread
    // 假设两个交易所之间存在利差 (模拟跨所套利场景)
    // Assume spread exists between two exchanges (simulate cross-exchange arbitrage)
    const spreadMultiplier = 1 + volatility * 10; // 波动越大，利差越大
    const annualizedSpread = Math.abs(simulatedFundingRate) * FUNDING_SETTLEMENTS_PER_YEAR * spreadMultiplier; // 定义常量 annualizedSpread

    // 获取当前持仓状态 / Get current position state
    const hasPosition = this.getState('hasPosition', false); // 定义常量 hasPosition
    const positionSide = this.getState('positionSide', null); // 定义常量 positionSide
    const entryPrice = this.getState('entryPrice', 0); // 定义常量 entryPrice
    const entryTime = this.getState('entryTime', 0); // 定义常量 entryTime

    // 持仓时长 (小时) / Position duration (hours)
    const holdingHours = hasPosition ? (candle.timestamp - entryTime) / (60 * 60 * 1000) : 0; // 定义常量 holdingHours

    // 开仓逻辑 / Open position logic
    if (!hasPosition && annualizedSpread >= this.config.minAnnualizedSpread) { // 条件判断 !hasPosition && annualizedSpread >= this.conf...
      // 发现套利机会 / Found arbitrage opportunity
      const side = simulatedFundingRate > 0 ? 'short' : 'long'; // 定义常量 side

      // 计算仓位大小 / Calculate position size
      const capital = this.getCapital(); // 定义常量 capital
      const positionSize = Math.min( // 定义常量 positionSize
        capital * this.config.positionRatio, // 执行语句
        this.config.maxPositionSize // 访问 config
      ); // 结束调用或参数

      // 执行开仓 / Execute open
      if (positionSize >= this.config.minPositionSize) { // 条件判断 positionSize >= this.config.minPositionSize
        const amount = positionSize / currentPrice; // 定义常量 amount

        if (side === 'long') { // 条件判断 side === 'long'
          this.buy(candle.symbol || 'BTC/USDT', amount); // 调用 buy
        } else { // 执行语句
          this.sell(candle.symbol || 'BTC/USDT', amount); // 调用 sell
        } // 结束代码块

        // 记录状态 / Record state
        this.setState('hasPosition', true); // 调用 setState
        this.setState('positionSide', side); // 调用 setState
        this.setState('entryPrice', currentPrice); // 调用 setState
        this.setState('entryTime', candle.timestamp); // 调用 setState
        this.setState('openSpread', annualizedSpread); // 调用 setState

        // 设置信号 / Set signal
        this.setBuySignal( // 调用 setBuySignal
          `模拟套利开仓: ${side} @ ${currentPrice.toFixed(2)} 年化利差: ${(annualizedSpread * 100).toFixed(2)}%` // 执行语句
        ); // 结束调用或参数

        this.log( // 调用 log
          `[回测] 开仓: ${side} ${amount.toFixed(4)} @ ${currentPrice.toFixed(2)} 年化利差: ${(annualizedSpread * 100).toFixed(2)}%`, // 执行语句
          'info' // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } // 结束代码块

    // 平仓逻辑 / Close position logic
    if (hasPosition) { // 条件判断 hasPosition
      let shouldClose = false; // 定义变量 shouldClose
      let closeReason = ''; // 定义变量 closeReason

      // 条件1: 利差收窄 / Condition 1: Spread narrowed
      if (annualizedSpread < this.config.closeSpreadThreshold) { // 条件判断 annualizedSpread < this.config.closeSpreadThr...
        shouldClose = true; // 赋值 shouldClose
        closeReason = `利差收窄: ${(annualizedSpread * 100).toFixed(2)}%`; // 赋值 closeReason
      } // 结束代码块

      // 条件2: 持仓超过8小时 (模拟一个资金费率结算周期)
      // Condition 2: Held for more than 8 hours (simulate one funding settlement period)
      if (holdingHours >= 8) { // 条件判断 holdingHours >= 8
        // 模拟收取/支付资金费后平仓
        // Simulate closing after receiving/paying funding
        shouldClose = true; // 赋值 shouldClose
        closeReason = `结算周期结束: 持仓${holdingHours.toFixed(1)}小时`; // 赋值 closeReason
      } // 结束代码块

      // 条件3: 价格反向移动过大 (止损)
      // Condition 3: Price moved against position too much (stop loss)
      const priceMove = (currentPrice - entryPrice) / entryPrice; // 定义常量 priceMove
      const adverseMove = positionSide === 'long' ? -priceMove : priceMove; // 定义常量 adverseMove
      if (adverseMove > 0.02) { // 2% 止损
        shouldClose = true; // 赋值 shouldClose
        closeReason = `止损: 价格反向移动 ${(adverseMove * 100).toFixed(2)}%`; // 赋值 closeReason
      } // 结束代码块

      // 执行平仓 / Execute close
      if (shouldClose) { // 条件判断 shouldClose
        this.closePosition(candle.symbol || 'BTC/USDT'); // 调用 closePosition

        // 计算模拟 PnL / Calculate simulated PnL
        const pricePnl = positionSide === 'long' // 定义常量 pricePnl
          ? (currentPrice - entryPrice) / entryPrice // 执行语句
          : (entryPrice - currentPrice) / entryPrice; // 执行语句

        // 模拟资金费收入 (如果持仓超过8小时)
        // Simulate funding income (if held for more than 8 hours)
        const fundingIncome = holdingHours >= 8 ? this.getState('openSpread', 0) / FUNDING_SETTLEMENTS_PER_YEAR : 0; // 定义常量 fundingIncome

        // 重置状态 / Reset state
        this.setState('hasPosition', false); // 调用 setState
        this.setState('positionSide', null); // 调用 setState
        this.setState('entryPrice', 0); // 调用 setState
        this.setState('entryTime', 0); // 调用 setState

        // 设置信号 / Set signal
        this.setSellSignal(closeReason); // 调用 setSellSignal

        this.log( // 调用 log
          `[回测] 平仓: ${closeReason} 价格PnL: ${(pricePnl * 100).toFixed(2)}% 资金费: ${(fundingIncome * 100).toFixed(4)}%`, // 执行语句
          'info' // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 日志输出 (覆盖父类方法)
   * Log output (override parent method)
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') { // 调用 log
    // 构建前缀 / Build prefix
    const prefix = this.config.logPrefix; // 定义常量 prefix

    // 调用父类方法 / Call parent method
    super.log(`${prefix} ${message}`, level); // 调用父类
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export { // 导出命名成员
  SUPPORTED_EXCHANGES, // 执行语句
  FUNDING_INTERVAL_MS, // 执行语句
  FUNDING_SETTLEMENTS_PER_YEAR, // 执行语句
  POSITION_SIDE, // 执行语句
  ARB_STATUS, // 执行语句
  DEFAULT_CONFIG, // 执行语句
}; // 结束代码块

// 导出辅助类 / Export helper classes
export { // 导出命名成员
  FundingRateManager, // 执行语句
  PositionManager, // 执行语句
}; // 结束代码块

// 默认导出策略类 / Default export strategy class
export default FundingArbStrategy; // 默认导出
