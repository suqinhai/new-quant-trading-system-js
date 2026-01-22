/**
 * 横截面策略基类
 * Cross-Sectional Strategy Base Class
 *
 * 横截面策略是针对多币种/多资产的策略，通过比较不同资产之间的
 * 相对表现来生成交易信号，而非仅关注单一资产的时间序列。
 *
 * Cross-sectional strategies operate on multiple assets/symbols,
 * generating signals by comparing relative performance across assets
 * rather than focusing on a single asset's time series.
 *
 * 主要特点 / Key Features:
 * 1. 同时监控多个交易对 / Monitor multiple symbols simultaneously
 * 2. 计算资产间的相对排名 / Calculate relative rankings across assets
 * 3. 支持做多强势 + 做空弱势 / Support long strong + short weak
 * 4. 定期再平衡 / Periodic rebalancing
 */

// 导入策略基类 / Import base strategy
import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 横截面策略类型
 * Cross-sectional strategy types
 */
export const CROSS_SECTIONAL_TYPES = { // 导出常量 CROSS_SECTIONAL_TYPES
  MOMENTUM_RANK: 'momentum_rank',           // 动量RANK
  ROTATION: 'rotation',                      // ROTATION
  FUNDING_RATE_EXTREME: 'funding_extreme',   // 资金费率频率极端
  CROSS_EXCHANGE_SPREAD: 'cross_exchange',   // CROSS交易所价差权限
  RELATIVE_STRENGTH: 'relative_strength',    // RELATIVESTRENGTH
  MEAN_REVERSION: 'mean_reversion',          // MEANREVERSION
}; // 结束代码块

/**
 * 排名方向
 * Ranking direction
 */
export const RANK_DIRECTION = { // 导出常量 RANK_DIRECTION
  ASCENDING: 'ascending',   // ASCENDING
  DESCENDING: 'descending', // DESCENDING
}; // 结束代码块

/**
 * 仓位类型
 * Position type
 */
export const POSITION_TYPE = { // 导出常量 POSITION_TYPE
  LONG_ONLY: 'long_only',           // LONG仅
  SHORT_ONLY: 'short_only',         // SHORT仅
  LONG_SHORT: 'long_short',         // LONGSHORT
  MARKET_NEUTRAL: 'market_neutral', // 市场NEUTRAL
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  // 监控的交易对列表 / Symbols to monitor
  // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
  symbols: [ // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', // 执行语句
    'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', // 执行语句
  ], // 结束数组或索引

  // 回看周期 (K线数量) / Lookback period (number of candles)
  lookbackPeriod: 20, // 回看周期 (K线数量)

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 1 * 60 * 60 * 1000, // 默认每小时 / Default every hour

  // ============================================
  // 排名配置 / Ranking Configuration
  // ============================================

  // 选取 Top N 个做多 / Select top N for long
  topN: 3, // 选取 Top N 个做多

  // 选取 Bottom N 个做空 / Select bottom N for short
  bottomN: 3, // 选取 Bottom N 个做空

  // 排名指标 / Ranking metric
  rankingMetric: 'returns', // ranking指标

  // 排名方向 / Ranking direction
  rankDirection: RANK_DIRECTION.DESCENDING, // rankDirection

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 仓位类型 / Position type
  positionType: POSITION_TYPE.LONG_SHORT, // 持仓类型仓位类型

  // 单个资产最大仓位比例 / Max position per asset
  maxPositionPerAsset: 0.15, // 单个资产最大仓位比例

  // 单边总仓位比例 / Total position per side
  maxPositionPerSide: 0.5, // 单边总仓位比例

  // 最小仓位比例 / Minimum position size
  minPositionSize: 0.01, // 最小仓位比例

  // 是否等权重 / Equal weight
  equalWeight: true, // equalWeight

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 止损比例 / Stop loss ratio
  stopLoss: 0.05, // 止损比例

  // 止盈比例 / Take profit ratio
  takeProfit: 0.15, // 止盈比例

  // 最大回撤 / Max drawdown
  maxDrawdown: 0.10, // 最大回撤

  // 最大相关性 / Max correlation (避免持有高度相关资产)
  maxCorrelation: 0.8, // 最大Correlation

  // ============================================
  // 过滤器配置 / Filter Configuration
  // ============================================

  // 最小日均成交量 (USDT) / Minimum daily volume
  minDailyVolume: 10000000, // 最小日均成交量 (USDT)

  // 最小价格 / Minimum price
  minPrice: 0.0001, // 最小价格

  // 排除的交易对 / Excluded symbols
  excludedSymbols: [], // excluded交易对列表

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志

  // 日志前缀 / Log prefix
  logPrefix: '[CrossSectional]', // 日志前缀
}; // 结束代码块

// ============================================
// 辅助类 / Helper Classes
// ============================================

/**
 * 资产数据管理器
 * Asset Data Manager
 *
 * 管理多个资产的历史数据和指标
 * Manages historical data and metrics for multiple assets
 */
export class AssetDataManager extends EventEmitter { // 导出类 AssetDataManager
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) { // 构造函数
    super(); // 调用父类

    // 保存配置 / Save config
    this.config = config; // 设置 config

    // 资产数据存储 / Asset data storage
    // 格式: { symbol: { history: [], metrics: {}, lastUpdate: timestamp } }
    this.assetData = new Map(); // 设置 assetData

    // 相关性矩阵缓存 / Correlation matrix cache
    this.correlationMatrix = new Map(); // 设置 correlationMatrix

    // 最后更新时间 / Last update timestamp
    this.lastCorrelationUpdate = 0; // 设置 lastCorrelationUpdate
  } // 结束代码块

  /**
   * 更新资产数据
   * Update asset data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} candle - K线数据 / Candle data
   */
  updateAssetData(symbol, candle) { // 调用 updateAssetData
    // 获取或初始化资产数据 / Get or initialize asset data
    if (!this.assetData.has(symbol)) { // 条件判断 !this.assetData.has(symbol)
      this.assetData.set(symbol, { // 访问 assetData
        history: [], // 历史
        metrics: {}, // 指标
        lastUpdate: 0, // last更新
      }); // 结束代码块
    } // 结束代码块

    const data = this.assetData.get(symbol); // 定义常量 data

    // 添加K线到历史 / Add candle to history
    data.history.push({ // 调用 data.history.push
      timestamp: candle.timestamp, // 时间戳
      open: candle.open, // 开盘
      high: candle.high, // 最高
      low: candle.low, // 最低
      close: candle.close, // 收盘
      volume: candle.volume, // 成交量
    }); // 结束代码块

    // 保留最近的历史数据 / Keep recent history only
    const maxHistory = Math.max(this.config.lookbackPeriod * 2, 200); // 定义常量 maxHistory
    if (data.history.length > maxHistory) { // 条件判断 data.history.length > maxHistory
      data.history = data.history.slice(-maxHistory); // 赋值 data.history
    } // 结束代码块

    // 更新时间戳 / Update timestamp
    data.lastUpdate = Date.now(); // 赋值 data.lastUpdate

    // 重新计算指标 / Recalculate metrics
    this._calculateMetrics(symbol); // 调用 _calculateMetrics
  } // 结束代码块

  /**
   * 批量更新资产数据
   * Batch update asset data
   *
   * @param {Map} candleMap - 交易对到K线的映射 / Symbol to candle mapping
   */
  batchUpdate(candleMap) { // 调用 batchUpdate
    for (const [symbol, candle] of candleMap) { // 循环 const [symbol, candle] of candleMap
      this.updateAssetData(symbol, candle); // 调用 updateAssetData
    } // 结束代码块

    // 发出更新事件 / Emit update event
    this.emit('updated', this.assetData); // 调用 emit
  } // 结束代码块

  /**
   * 计算资产指标
   * Calculate asset metrics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  _calculateMetrics(symbol) { // 调用 _calculateMetrics
    const data = this.assetData.get(symbol); // 定义常量 data
    if (!data || data.history.length < 2) { // 条件判断 !data || data.history.length < 2
      return; // 返回结果
    } // 结束代码块

    const history = data.history; // 定义常量 history
    const lookback = Math.min(this.config.lookbackPeriod, history.length); // 定义常量 lookback
    const recentHistory = history.slice(-lookback); // 定义常量 recentHistory

    // 计算收益率 / Calculate returns
    const returns = []; // 定义常量 returns
    for (let i = 1; i < recentHistory.length; i++) { // 循环 let i = 1; i < recentHistory.length; i++
      const ret = (recentHistory[i].close - recentHistory[i - 1].close) / recentHistory[i - 1].close; // 定义常量 ret
      returns.push(ret); // 调用 returns.push
    } // 结束代码块

    // 计算累计收益 / Calculate cumulative return
    const cumulativeReturn = recentHistory.length >= 2 // 定义常量 cumulativeReturn
      ? (recentHistory[recentHistory.length - 1].close - recentHistory[0].close) / recentHistory[0].close // 执行语句
      : 0; // 执行语句

    // 计算平均收益 / Calculate average return
    const avgReturn = returns.length > 0 // 定义常量 avgReturn
      ? returns.reduce((a, b) => a + b, 0) / returns.length // 定义箭头函数
      : 0; // 执行语句

    // 计算波动率 / Calculate volatility
    const volatility = returns.length > 1 // 定义常量 volatility
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)) // 定义箭头函数
      : 0; // 执行语句

    // 计算夏普比 (假设无风险利率为0) / Calculate Sharpe ratio (assuming risk-free rate = 0)
    const sharpe = volatility > 0 ? avgReturn / volatility : 0; // 定义常量 sharpe

    // 计算动量 (价格变化率) / Calculate momentum (rate of change)
    const momentum = history.length >= lookback // 定义常量 momentum
      ? (history[history.length - 1].close - history[history.length - lookback].close) / history[history.length - lookback].close // 执行语句
      : 0; // 执行语句

    // 计算成交量均值 / Calculate average volume
    const avgVolume = recentHistory.reduce((sum, c) => sum + c.volume, 0) / recentHistory.length; // 定义函数 avgVolume

    // 计算最新价格 / Get latest price
    const latestPrice = history[history.length - 1].close; // 定义常量 latestPrice

    // 计算RSI / Calculate RSI
    const rsi = this._calculateRSI(returns); // 定义常量 rsi

    // 保存指标 / Save metrics
    data.metrics = { // 赋值 data.metrics
      returns: cumulativeReturn, // returns
      avgReturn, // 执行语句
      volatility, // 执行语句
      sharpe, // 执行语句
      momentum, // 执行语句
      avgVolume, // 执行语句
      latestPrice, // 执行语句
      rsi, // 执行语句
      returnsList: returns, // returnsList
      timestamp: Date.now(), // 时间戳
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算RSI
   * Calculate RSI
   *
   * @param {Array} returns - 收益率数组 / Returns array
   * @returns {number} RSI值 / RSI value
   * @private
   */
  _calculateRSI(returns) { // 调用 _calculateRSI
    if (returns.length < 14) { // 条件判断 returns.length < 14
      return 50; // 默认中性值
    } // 结束代码块

    const recent = returns.slice(-14); // 定义常量 recent
    let gains = 0; // 定义变量 gains
    let losses = 0; // 定义变量 losses

    for (const r of recent) { // 循环 const r of recent
      if (r > 0) gains += r; // 条件判断 r > 0
      else losses += Math.abs(r); // 否则分支
    } // 结束代码块

    const avgGain = gains / 14; // 定义常量 avgGain
    const avgLoss = losses / 14; // 定义常量 avgLoss

    if (avgLoss === 0) return 100; // 条件判断 avgLoss === 0
    const rs = avgGain / avgLoss; // 定义常量 rs
    return 100 - (100 / (1 + rs)); // 返回结果
  } // 结束代码块

  /**
   * 获取资产排名
   * Get asset ranking
   *
   * @param {string} metric - 排名指标 / Ranking metric
   * @param {string} direction - 排名方向 / Ranking direction
   * @returns {Array} 排名列表 / Ranking list
   */
  getRanking(metric = 'returns', direction = RANK_DIRECTION.DESCENDING) { // 调用 getRanking
    const ranking = []; // 定义常量 ranking

    // 收集所有资产的指标 / Collect metrics from all assets
    for (const [symbol, data] of this.assetData) { // 循环 const [symbol, data] of this.assetData
      if (data.metrics && data.metrics[metric] !== undefined) { // 条件判断 data.metrics && data.metrics[metric] !== unde...
        ranking.push({ // 调用 ranking.push
          symbol, // 执行语句
          value: data.metrics[metric], // value
          metrics: data.metrics, // 指标
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 排序 / Sort
    ranking.sort((a, b) => { // 调用 ranking.sort
      if (direction === RANK_DIRECTION.DESCENDING) { // 条件判断 direction === RANK_DIRECTION.DESCENDING
        return b.value - a.value; // 返回结果
      } else { // 执行语句
        return a.value - b.value; // 返回结果
      } // 结束代码块
    }); // 结束代码块

    // 添加排名 / Add rank
    ranking.forEach((item, index) => { // 调用 ranking.forEach
      item.rank = index + 1; // 赋值 item.rank
    }); // 结束代码块

    return ranking; // 返回结果
  } // 结束代码块

  /**
   * 获取Top N资产
   * Get top N assets
   *
   * @param {number} n - 数量 / Count
   * @param {string} metric - 排名指标 / Ranking metric
   * @returns {Array} Top N资产 / Top N assets
   */
  getTopN(n, metric = 'returns') { // 调用 getTopN
    const ranking = this.getRanking(metric, RANK_DIRECTION.DESCENDING); // 定义常量 ranking
    return ranking.slice(0, n); // 返回结果
  } // 结束代码块

  /**
   * 获取Bottom N资产
   * Get bottom N assets
   *
   * @param {number} n - 数量 / Count
   * @param {string} metric - 排名指标 / Ranking metric
   * @returns {Array} Bottom N资产 / Bottom N assets
   */
  getBottomN(n, metric = 'returns') { // 调用 getBottomN
    const ranking = this.getRanking(metric, RANK_DIRECTION.ASCENDING); // 定义常量 ranking
    return ranking.slice(0, n); // 返回结果
  } // 结束代码块

  /**
   * 计算相关性矩阵
   * Calculate correlation matrix
   *
   * @returns {Map} 相关性矩阵 / Correlation matrix
   */
  calculateCorrelationMatrix() { // 调用 calculateCorrelationMatrix
    const symbols = Array.from(this.assetData.keys()); // 定义常量 symbols
    const matrix = new Map(); // 定义常量 matrix

    for (let i = 0; i < symbols.length; i++) { // 循环 let i = 0; i < symbols.length; i++
      for (let j = i + 1; j < symbols.length; j++) { // 循环 let j = i + 1; j < symbols.length; j++
        const symbol1 = symbols[i]; // 定义常量 symbol1
        const symbol2 = symbols[j]; // 定义常量 symbol2

        const data1 = this.assetData.get(symbol1); // 定义常量 data1
        const data2 = this.assetData.get(symbol2); // 定义常量 data2

        if (data1?.metrics?.returnsList && data2?.metrics?.returnsList) { // 条件判断 data1?.metrics?.returnsList && data2?.metrics...
          const correlation = this._calculateCorrelation( // 定义常量 correlation
            data1.metrics.returnsList, // 执行语句
            data2.metrics.returnsList // 执行语句
          ); // 结束调用或参数

          const key = `${symbol1}:${symbol2}`; // 定义常量 key
          matrix.set(key, correlation); // 调用 matrix.set
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    this.correlationMatrix = matrix; // 设置 correlationMatrix
    this.lastCorrelationUpdate = Date.now(); // 设置 lastCorrelationUpdate

    return matrix; // 返回结果
  } // 结束代码块

  /**
   * 计算两个序列的相关系数
   * Calculate correlation coefficient between two series
   *
   * @param {Array} series1 - 序列1 / Series 1
   * @param {Array} series2 - 序列2 / Series 2
   * @returns {number} 相关系数 / Correlation coefficient
   * @private
   */
  _calculateCorrelation(series1, series2) { // 调用 _calculateCorrelation
    // 取相同长度 / Take same length
    const minLen = Math.min(series1.length, series2.length); // 定义常量 minLen
    if (minLen < 2) return 0; // 条件判断 minLen < 2

    const s1 = series1.slice(-minLen); // 定义常量 s1
    const s2 = series2.slice(-minLen); // 定义常量 s2

    // 计算均值 / Calculate means
    const mean1 = s1.reduce((a, b) => a + b, 0) / minLen; // 定义函数 mean1
    const mean2 = s2.reduce((a, b) => a + b, 0) / minLen; // 定义函数 mean2

    // 计算协方差和标准差 / Calculate covariance and standard deviations
    let covariance = 0; // 定义变量 covariance
    let variance1 = 0; // 定义变量 variance1
    let variance2 = 0; // 定义变量 variance2

    for (let i = 0; i < minLen; i++) { // 循环 let i = 0; i < minLen; i++
      const diff1 = s1[i] - mean1; // 定义常量 diff1
      const diff2 = s2[i] - mean2; // 定义常量 diff2
      covariance += diff1 * diff2; // 执行语句
      variance1 += diff1 * diff1; // 执行语句
      variance2 += diff2 * diff2; // 执行语句
    } // 结束代码块

    const std1 = Math.sqrt(variance1); // 定义常量 std1
    const std2 = Math.sqrt(variance2); // 定义常量 std2

    if (std1 === 0 || std2 === 0) return 0; // 条件判断 std1 === 0 || std2 === 0

    return covariance / (std1 * std2); // 返回结果
  } // 结束代码块

  /**
   * 获取两个资产之间的相关性
   * Get correlation between two assets
   *
   * @param {string} symbol1 - 资产1 / Asset 1
   * @param {string} symbol2 - 资产2 / Asset 2
   * @returns {number} 相关系数 / Correlation coefficient
   */
  getCorrelation(symbol1, symbol2) { // 调用 getCorrelation
    // 确保顺序一致 / Ensure consistent order
    const key1 = `${symbol1}:${symbol2}`; // 定义常量 key1
    const key2 = `${symbol2}:${symbol1}`; // 定义常量 key2

    return this.correlationMatrix.get(key1) || this.correlationMatrix.get(key2) || 0; // 返回结果
  } // 结束代码块

  /**
   * 获取资产指标
   * Get asset metrics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 指标 / Metrics
   */
  getMetrics(symbol) { // 调用 getMetrics
    const data = this.assetData.get(symbol); // 定义常量 data
    return data?.metrics || null; // 返回结果
  } // 结束代码块

  /**
   * 获取资产历史
   * Get asset history
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Array} 历史数据 / History data
   */
  getHistory(symbol) { // 调用 getHistory
    const data = this.assetData.get(symbol); // 定义常量 data
    return data?.history || []; // 返回结果
  } // 结束代码块

  /**
   * 检查资产是否有足够数据
   * Check if asset has enough data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {boolean} 是否有足够数据 / Whether has enough data
   */
  hasEnoughData(symbol) { // 调用 hasEnoughData
    const data = this.assetData.get(symbol); // 定义常量 data
    return data && data.history.length >= this.config.lookbackPeriod; // 返回结果
  } // 结束代码块

  /**
   * 获取所有有足够数据的资产
   * Get all assets with enough data
   *
   * @returns {Array} 资产列表 / Asset list
   */
  getAssetsWithEnoughData() { // 调用 getAssetsWithEnoughData
    const assets = []; // 定义常量 assets
    for (const [symbol] of this.assetData) { // 循环 const [symbol] of this.assetData
      if (this.hasEnoughData(symbol)) { // 条件判断 this.hasEnoughData(symbol)
        assets.push(symbol); // 调用 assets.push
      } // 结束代码块
    } // 结束代码块
    return assets; // 返回结果
  } // 结束代码块

  /**
   * 清除资产数据
   * Clear asset data
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   */
  clear(symbol = null) { // 调用 clear
    if (symbol) { // 条件判断 symbol
      this.assetData.delete(symbol); // 访问 assetData
    } else { // 执行语句
      this.assetData.clear(); // 访问 assetData
      this.correlationMatrix.clear(); // 访问 correlationMatrix
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 组合管理器
 * Portfolio Manager
 *
 * 管理横截面策略的投资组合
 * Manages portfolio for cross-sectional strategies
 */
export class PortfolioManager extends EventEmitter { // 导出类 PortfolioManager
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) { // 构造函数
    super(); // 调用父类

    // 保存配置 / Save config
    this.config = config; // 设置 config

    // 目标仓位 / Target positions
    // 格式: { symbol: { side: 'long'|'short', weight: 0.1, ... } }
    this.targetPositions = new Map(); // 设置 targetPositions

    // 当前仓位 / Current positions
    this.currentPositions = new Map(); // 设置 currentPositions

    // 仓位历史 / Position history
    this.positionHistory = []; // 设置 positionHistory

    // 最后再平衡时间 / Last rebalance time
    this.lastRebalanceTime = 0; // 设置 lastRebalanceTime
  } // 结束代码块

  /**
   * 设置目标仓位
   * Set target positions
   *
   * @param {Array} longAssets - 做多资产 / Long assets
   * @param {Array} shortAssets - 做空资产 / Short assets
   */
  setTargetPositions(longAssets, shortAssets = []) { // 调用 setTargetPositions
    // 清除旧目标 / Clear old targets
    this.targetPositions.clear(); // 访问 targetPositions

    // 计算权重 / Calculate weights
    const longWeight = this.config.equalWeight // 定义常量 longWeight
      ? this.config.maxPositionPerSide / Math.max(longAssets.length, 1) // 执行语句
      : null; // 执行语句
    const shortWeight = this.config.equalWeight // 定义常量 shortWeight
      ? this.config.maxPositionPerSide / Math.max(shortAssets.length, 1) // 执行语句
      : null; // 执行语句

    // 设置做多目标 / Set long targets
    for (const asset of longAssets) { // 循环 const asset of longAssets
      const symbol = typeof asset === 'string' ? asset : asset.symbol; // 定义常量 symbol
      const weight = longWeight || Math.min( // 定义常量 weight
        asset.weight || this.config.maxPositionPerAsset, // 执行语句
        this.config.maxPositionPerAsset // 访问 config
      ); // 结束调用或参数

      this.targetPositions.set(symbol, { // 访问 targetPositions
        symbol, // 执行语句
        side: 'long', // 方向
        weight: Math.max(weight, this.config.minPositionSize), // weight
        metrics: asset.metrics || {}, // 指标
        rank: asset.rank || 0, // rank
      }); // 结束代码块
    } // 结束代码块

    // 设置做空目标 / Set short targets
    for (const asset of shortAssets) { // 循环 const asset of shortAssets
      const symbol = typeof asset === 'string' ? asset : asset.symbol; // 定义常量 symbol
      const weight = shortWeight || Math.min( // 定义常量 weight
        asset.weight || this.config.maxPositionPerAsset, // 执行语句
        this.config.maxPositionPerAsset // 访问 config
      ); // 结束调用或参数

      this.targetPositions.set(symbol, { // 访问 targetPositions
        symbol, // 执行语句
        side: 'short', // 方向
        weight: Math.max(weight, this.config.minPositionSize), // weight
        metrics: asset.metrics || {}, // 指标
        rank: asset.rank || 0, // rank
      }); // 结束代码块
    } // 结束代码块

    // 发出目标更新事件 / Emit target updated event
    this.emit('targetUpdated', { // 调用 emit
      long: longAssets.map(a => typeof a === 'string' ? a : a.symbol), // long
      short: shortAssets.map(a => typeof a === 'string' ? a : a.symbol), // short
      targets: this.targetPositions, // targets
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取需要调整的仓位
   * Get positions that need adjustment
   *
   * @returns {Object} 需要调整的仓位 / Positions to adjust
   */
  getPositionAdjustments() { // 调用 getPositionAdjustments
    const adjustments = { // 定义常量 adjustments
      toOpen: [],    // 需要开仓 / To open
      toClose: [],   // 需要平仓 / To close
      toAdjust: [],  // 需要调整 / To adjust
    }; // 结束代码块

    // 检查需要平仓的 / Check positions to close
    for (const [symbol, position] of this.currentPositions) { // 循环 const [symbol, position] of this.currentPosit...
      if (!this.targetPositions.has(symbol)) { // 条件判断 !this.targetPositions.has(symbol)
        adjustments.toClose.push({ // 调用 adjustments.toClose.push
          symbol, // 执行语句
          currentPosition: position, // current持仓
          reason: 'not_in_target', // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 检查需要开仓或调整的 / Check positions to open or adjust
    for (const [symbol, target] of this.targetPositions) { // 循环 const [symbol, target] of this.targetPositions
      const current = this.currentPositions.get(symbol); // 定义常量 current

      if (!current) { // 条件判断 !current
        // 需要开仓 / Need to open
        adjustments.toOpen.push({ // 调用 adjustments.toOpen.push
          symbol, // 执行语句
          target, // 执行语句
          reason: 'new_position', // reason
        }); // 结束代码块
      } else if (current.side !== target.side) { // 执行语句
        // 方向变化，需要平仓再开仓 / Direction changed, close and reopen
        adjustments.toClose.push({ // 调用 adjustments.toClose.push
          symbol, // 执行语句
          currentPosition: current, // current持仓
          reason: 'direction_changed', // reason
        }); // 结束代码块
        adjustments.toOpen.push({ // 调用 adjustments.toOpen.push
          symbol, // 执行语句
          target, // 执行语句
          reason: 'direction_changed', // reason
        }); // 结束代码块
      } else if (Math.abs(current.weight - target.weight) > 0.01) { // 执行语句
        // 权重变化超过1%，需要调整 / Weight changed more than 1%
        adjustments.toAdjust.push({ // 调用 adjustments.toAdjust.push
          symbol, // 执行语句
          currentPosition: current, // current持仓
          target, // 执行语句
          weightChange: target.weight - current.weight, // weight修改
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return adjustments; // 返回结果
  } // 结束代码块

  /**
   * 更新当前仓位
   * Update current position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} position - 仓位信息 / Position info
   */
  updateCurrentPosition(symbol, position) { // 调用 updateCurrentPosition
    if (position && position.weight > 0) { // 条件判断 position && position.weight > 0
      this.currentPositions.set(symbol, position); // 访问 currentPositions
    } else { // 执行语句
      this.currentPositions.delete(symbol); // 访问 currentPositions
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录仓位变化
   * Record position change
   *
   * @param {Object} change - 变化信息 / Change info
   */
  recordPositionChange(change) { // 调用 recordPositionChange
    this.positionHistory.push({ // 访问 positionHistory
      ...change, // 展开对象或数组
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 保留最近1000条记录 / Keep last 1000 records
    if (this.positionHistory.length > 1000) { // 条件判断 this.positionHistory.length > 1000
      this.positionHistory = this.positionHistory.slice(-1000); // 设置 positionHistory
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查是否需要再平衡
   * Check if rebalancing is needed
   *
   * @returns {boolean} 是否需要再平衡 / Whether needs rebalancing
   */
  needsRebalance() { // 调用 needsRebalance
    const now = Date.now(); // 定义常量 now
    return now - this.lastRebalanceTime >= this.config.rebalancePeriod; // 返回结果
  } // 结束代码块

  /**
   * 标记已再平衡
   * Mark as rebalanced
   */
  markRebalanced() { // 调用 markRebalanced
    this.lastRebalanceTime = Date.now(); // 设置 lastRebalanceTime
  } // 结束代码块

  /**
   * 获取组合摘要
   * Get portfolio summary
   *
   * @returns {Object} 组合摘要 / Portfolio summary
   */
  getSummary() { // 调用 getSummary
    let longWeight = 0; // 定义变量 longWeight
    let shortWeight = 0; // 定义变量 shortWeight
    let longCount = 0; // 定义变量 longCount
    let shortCount = 0; // 定义变量 shortCount

    for (const position of this.currentPositions.values()) { // 循环 const position of this.currentPositions.values()
      if (position.side === 'long') { // 条件判断 position.side === 'long'
        longWeight += position.weight; // 执行语句
        longCount++; // 执行语句
      } else { // 执行语句
        shortWeight += position.weight; // 执行语句
        shortCount++; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return { // 返回结果
      longCount, // 执行语句
      shortCount, // 执行语句
      totalCount: longCount + shortCount, // 总数量
      longWeight, // 执行语句
      shortWeight, // 执行语句
      netExposure: longWeight - shortWeight, // netExposure
      grossExposure: longWeight + shortWeight, // grossExposure
      lastRebalanceTime: this.lastRebalanceTime, // lastRebalance时间
    }; // 结束代码块
  } // 结束代码块

  /**
   * 清除所有仓位
   * Clear all positions
   */
  clear() { // 调用 clear
    this.targetPositions.clear(); // 访问 targetPositions
    this.currentPositions.clear(); // 访问 currentPositions
  } // 结束代码块
} // 结束代码块

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 横截面策略基类
 * Cross-Sectional Strategy Base Class
 */
export class CrossSectionalStrategy extends BaseStrategy { // 导出类 CrossSectionalStrategy
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
    this.name = params.name || 'CrossSectionalStrategy'; // 设置 name

    // 保存配置 / Save config
    this.config = config; // 设置 config

    // 资产数据管理器 / Asset data manager
    this.assetManager = new AssetDataManager(config); // 设置 assetManager

    // 组合管理器 / Portfolio manager
    this.portfolioManager = new PortfolioManager(config); // 设置 portfolioManager

    // 策略类型 / Strategy type
    this.strategyType = params.strategyType || CROSS_SECTIONAL_TYPES.MOMENTUM_RANK; // 设置 strategyType

    // 是否正在运行 / Whether running
    this.running = false; // 设置 running

    // 统计数据 / Statistics
    this.stats = { // 设置 stats
      totalRebalances: 0, // 总Rebalances
      totalTrades: 0, // 总成交
      winCount: 0, // win数量
      lossCount: 0, // 亏损数量
      totalPnl: 0, // 总盈亏
    }; // 结束代码块

    // 设置事件监听 / Set up event listeners
    this._setupEventListeners(); // 调用 _setupEventListeners
  } // 结束代码块

  /**
   * 设置事件监听
   * Set up event listeners
   * @private
   */
  _setupEventListeners() { // 调用 _setupEventListeners
    // 监听资产数据更新 / Listen for asset data updates
    this.assetManager.on('updated', () => { // 访问 assetManager
      // 检查是否需要更新信号 / Check if need to update signals
      if (this.running) { // 条件判断 this.running
        this._checkAndUpdateSignals(); // 调用 _checkAndUpdateSignals
      } // 结束代码块
    }); // 结束代码块

    // 监听组合目标更新 / Listen for portfolio target updates
    this.portfolioManager.on('targetUpdated', (data) => { // 访问 portfolioManager
      this.log( // 调用 log
        `目标仓位更新: 多头${data.long.length}个 空头${data.short.length}个`, // 执行语句
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
    // 横截面策略需要 K 线和 Ticker 数据 / Cross-sectional strategy needs kline and ticker
    return ['kline', 'ticker']; // 返回结果
  } // 结束代码块

  /**
   * 初始化策略
   * Initialize strategy
   */
  async onInit() { // 执行语句
    // 记录日志 / Log
    this.log(`策略初始化: ${this.name}`, 'info'); // 调用 log
    this.log(`监控交易对: ${this.config.symbols.length}个`, 'info'); // 调用 log
    this.log(`Top N: ${this.config.topN}, Bottom N: ${this.config.bottomN}`, 'info'); // 调用 log
    this.log(`仓位类型: ${this.config.positionType}`, 'info'); // 调用 log

    // 调用父类初始化 / Call parent initialization
    await super.onInit(); // 等待异步结果

    // 标记为运行中 / Mark as running
    this.running = true; // 设置 running
  } // 结束代码块

  /**
   * 处理K线更新 (多资产版本)
   * Handle candle update (multi-asset version)
   *
   * @param {Object} data - K线数据 / Candle data
   */
  async onCandle(data) { // 执行语句
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 确保有交易对信息 / Ensure symbol info
    const symbol = data.symbol; // 定义常量 symbol
    if (!symbol) { // 条件判断 !symbol
      return; // 返回结果
    } // 结束代码块

    // 检查是否是监控的交易对 / Check if monitored symbol
    if (!this.config.symbols.includes(symbol)) { // 条件判断 !this.config.symbols.includes(symbol)
      return; // 返回结果
    } // 结束代码块

    // 更新资产数据 / Update asset data
    this.assetManager.updateAssetData(symbol, data); // 访问 assetManager

    // 检查并更新信号 / Check and update signals
    await this._checkAndUpdateSignals(); // 等待异步结果
  } // 结束代码块

  /**
   * 批量更新多个资产的K线数据
   * Batch update candle data for multiple assets
   *
   * @param {Map|Object} candleMap - 交易对到K线的映射 / Symbol to candle mapping
   */
  async batchUpdateCandles(candleMap) { // 执行语句
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    // 转换为Map / Convert to Map
    const map = candleMap instanceof Map ? candleMap : new Map(Object.entries(candleMap)); // 定义常量 map

    // 批量更新 / Batch update
    this.assetManager.batchUpdate(map); // 访问 assetManager

    // 检查并更新信号 / Check and update signals
    await this._checkAndUpdateSignals(); // 等待异步结果
  } // 结束代码块

  /**
   * 检查并更新信号
   * Check and update signals
   * @private
   */
  async _checkAndUpdateSignals() { // 执行语句
    // 获取有足够数据的资产 / Get assets with enough data
    const validAssets = this.assetManager.getAssetsWithEnoughData(); // 定义常量 validAssets

    // 如果有效资产不足，跳过 / If not enough valid assets, skip
    const minAssets = this.config.topN + this.config.bottomN; // 定义常量 minAssets
    if (validAssets.length < minAssets) { // 条件判断 validAssets.length < minAssets
      if (this.config.verbose) { // 条件判断 this.config.verbose
        this.log( // 调用 log
          `有效资产不足: ${validAssets.length}/${minAssets}`, // 执行语句
          'debug' // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
      return; // 返回结果
    } // 结束代码块

    // 检查是否需要再平衡 / Check if needs rebalancing
    if (!this.portfolioManager.needsRebalance()) { // 条件判断 !this.portfolioManager.needsRebalance()
      return; // 返回结果
    } // 结束代码块

    // 执行再平衡 / Execute rebalancing
    await this._executeRebalance(); // 等待异步结果
  } // 结束代码块

  /**
   * 执行再平衡
   * Execute rebalancing
   * @private
   */
  async _executeRebalance() { // 执行语句
    // 获取排名 / Get ranking
    const ranking = this.assetManager.getRanking( // 定义常量 ranking
      this.config.rankingMetric, // 访问 config
      this.config.rankDirection // 访问 config
    ); // 结束调用或参数

    // 应用过滤器 / Apply filters
    const filteredRanking = this._applyFilters(ranking); // 定义常量 filteredRanking

    // 选择做多和做空资产 / Select long and short assets
    const { longAssets, shortAssets } = this._selectAssets(filteredRanking); // 解构赋值

    // 应用相关性过滤 / Apply correlation filter
    const filteredLong = this._filterByCorrelation(longAssets); // 定义常量 filteredLong
    const filteredShort = this._filterByCorrelation(shortAssets); // 定义常量 filteredShort

    // 设置目标仓位 / Set target positions
    this.portfolioManager.setTargetPositions(filteredLong, filteredShort); // 访问 portfolioManager

    // 获取仓位调整 / Get position adjustments
    const adjustments = this.portfolioManager.getPositionAdjustments(); // 定义常量 adjustments

    // 执行调整 / Execute adjustments
    await this._executeAdjustments(adjustments); // 等待异步结果

    // 标记已再平衡 / Mark as rebalanced
    this.portfolioManager.markRebalanced(); // 访问 portfolioManager
    this.stats.totalRebalances++; // 访问 stats

    // 记录日志 / Log
    this.log( // 调用 log
      `再平衡完成: 开仓${adjustments.toOpen.length} 平仓${adjustments.toClose.length} 调整${adjustments.toAdjust.length}`, // 执行语句
      'info' // 执行语句
    ); // 结束调用或参数

    // 发出再平衡事件 / Emit rebalance event
    this.emit('rebalanced', { // 调用 emit
      ranking, // 执行语句
      longAssets: filteredLong, // longAssets
      shortAssets: filteredShort, // shortAssets
      adjustments, // 执行语句
      summary: this.portfolioManager.getSummary(), // summary
    }); // 结束代码块
  } // 结束代码块

  /**
   * 应用过滤器
   * Apply filters
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Array} 过滤后的排名 / Filtered ranking
   * @private
   */
  _applyFilters(ranking) { // 调用 _applyFilters
    return ranking.filter(item => { // 返回结果
      // 排除指定的交易对 / Exclude specified symbols
      if (this.config.excludedSymbols.includes(item.symbol)) { // 条件判断 this.config.excludedSymbols.includes(item.sym...
        return false; // 返回结果
      } // 结束代码块

      // 检查最小成交量 / Check minimum volume
      if (item.metrics.avgVolume < this.config.minDailyVolume) { // 条件判断 item.metrics.avgVolume < this.config.minDaily...
        return false; // 返回结果
      } // 结束代码块

      // 检查最小价格 / Check minimum price
      if (item.metrics.latestPrice < this.config.minPrice) { // 条件判断 item.metrics.latestPrice < this.config.minPrice
        return false; // 返回结果
      } // 结束代码块

      return true; // 返回结果
    }); // 结束代码块
  } // 结束代码块

  /**
   * 选择做多和做空资产
   * Select long and short assets
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Object} 做多和做空资产 / Long and short assets
   * @private
   */
  _selectAssets(ranking) { // 调用 _selectAssets
    let longAssets = []; // 定义变量 longAssets
    let shortAssets = []; // 定义变量 shortAssets

    switch (this.config.positionType) { // 分支选择 this.config.positionType
      case POSITION_TYPE.LONG_ONLY: // 分支 POSITION_TYPE.LONG_ONLY
        longAssets = ranking.slice(0, this.config.topN); // 赋值 longAssets
        break; // 跳出循环或分支

      case POSITION_TYPE.SHORT_ONLY: // 分支 POSITION_TYPE.SHORT_ONLY
        shortAssets = ranking.slice(-this.config.bottomN); // 赋值 shortAssets
        break; // 跳出循环或分支

      case POSITION_TYPE.LONG_SHORT: // 分支 POSITION_TYPE.LONG_SHORT
      case POSITION_TYPE.MARKET_NEUTRAL: // 分支 POSITION_TYPE.MARKET_NEUTRAL
        longAssets = ranking.slice(0, this.config.topN); // 赋值 longAssets
        shortAssets = ranking.slice(-this.config.bottomN); // 赋值 shortAssets
        break; // 跳出循环或分支
    } // 结束代码块

    return { longAssets, shortAssets }; // 返回结果
  } // 结束代码块

  /**
   * 根据相关性过滤资产
   * Filter assets by correlation
   *
   * @param {Array} assets - 资产列表 / Asset list
   * @returns {Array} 过滤后的资产 / Filtered assets
   * @private
   */
  _filterByCorrelation(assets) { // 调用 _filterByCorrelation
    if (!this.config.maxCorrelation || assets.length <= 1) { // 条件判断 !this.config.maxCorrelation || assets.length ...
      return assets; // 返回结果
    } // 结束代码块

    // 更新相关性矩阵 / Update correlation matrix
    this.assetManager.calculateCorrelationMatrix(); // 访问 assetManager

    const filtered = []; // 定义常量 filtered
    const selectedSymbols = new Set(); // 定义常量 selectedSymbols

    for (const asset of assets) { // 循环 const asset of assets
      // 检查与已选资产的相关性 / Check correlation with selected assets
      let tooCorrelated = false; // 定义变量 tooCorrelated

      for (const selectedSymbol of selectedSymbols) { // 循环 const selectedSymbol of selectedSymbols
        const correlation = Math.abs( // 定义常量 correlation
          this.assetManager.getCorrelation(asset.symbol, selectedSymbol) // 访问 assetManager
        ); // 结束调用或参数

        if (correlation > this.config.maxCorrelation) { // 条件判断 correlation > this.config.maxCorrelation
          tooCorrelated = true; // 赋值 tooCorrelated
          break; // 跳出循环或分支
        } // 结束代码块
      } // 结束代码块

      if (!tooCorrelated) { // 条件判断 !tooCorrelated
        filtered.push(asset); // 调用 filtered.push
        selectedSymbols.add(asset.symbol); // 调用 selectedSymbols.add
      } // 结束代码块
    } // 结束代码块

    return filtered; // 返回结果
  } // 结束代码块

  /**
   * 执行仓位调整
   * Execute position adjustments
   *
   * @param {Object} adjustments - 调整信息 / Adjustment info
   * @private
   */
  async _executeAdjustments(adjustments) { // 执行语句
    // 先平仓 / Close first
    for (const item of adjustments.toClose) { // 循环 const item of adjustments.toClose
      await this._closePosition(item.symbol, item.reason); // 等待异步结果
    } // 结束代码块

    // 再开仓 / Then open
    for (const item of adjustments.toOpen) { // 循环 const item of adjustments.toOpen
      await this._openPosition(item.symbol, item.target); // 等待异步结果
    } // 结束代码块

    // 最后调整 / Finally adjust
    for (const item of adjustments.toAdjust) { // 循环 const item of adjustments.toAdjust
      await this._adjustPosition(item.symbol, item.target, item.weightChange); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 开仓
   * Open position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} target - 目标仓位 / Target position
   * @private
   */
  async _openPosition(symbol, target) { // 执行语句
    // 计算仓位大小 / Calculate position size
    const capital = this.getCapital(); // 定义常量 capital
    const positionValue = capital * target.weight; // 定义常量 positionValue
    const price = this.assetManager.getMetrics(symbol)?.latestPrice || 0; // 定义常量 price

    if (price <= 0) { // 条件判断 price <= 0
      this.log(`无法开仓 ${symbol}: 价格无效`, 'warn'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    const amount = positionValue / price; // 定义常量 amount

    // 执行开仓 / Execute open
    if (target.side === 'long') { // 条件判断 target.side === 'long'
      this.buy(symbol, amount); // 调用 buy
      this.setBuySignal(`横截面开多: ${symbol} 排名#${target.rank}`); // 调用 setBuySignal
    } else { // 执行语句
      this.sell(symbol, amount); // 调用 sell
      this.setSellSignal(`横截面开空: ${symbol} 排名#${target.rank}`); // 调用 setSellSignal
    } // 结束代码块

    // 更新组合管理器 / Update portfolio manager
    this.portfolioManager.updateCurrentPosition(symbol, target); // 访问 portfolioManager

    // 记录变化 / Record change
    this.portfolioManager.recordPositionChange({ // 访问 portfolioManager
      type: 'open', // 类型
      symbol, // 执行语句
      side: target.side, // 方向
      weight: target.weight, // weight
      amount, // 执行语句
      price, // 执行语句
    }); // 结束代码块

    this.stats.totalTrades++; // 访问 stats
    this.log(`开仓: ${target.side} ${symbol} ${amount.toFixed(4)} @ ${price.toFixed(2)}`, 'info'); // 调用 log
  } // 结束代码块

  /**
   * 平仓
   * Close position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} reason - 原因 / Reason
   * @private
   */
  async _closePosition(symbol, reason) { // 执行语句
    // 平仓 / Close
    this.closePosition(symbol); // 调用 closePosition

    // 更新组合管理器 / Update portfolio manager
    const position = this.portfolioManager.currentPositions.get(symbol); // 定义常量 position
    this.portfolioManager.updateCurrentPosition(symbol, null); // 访问 portfolioManager

    // 记录变化 / Record change
    this.portfolioManager.recordPositionChange({ // 访问 portfolioManager
      type: 'close', // 类型
      symbol, // 执行语句
      side: position?.side, // 方向
      reason, // 执行语句
    }); // 结束代码块

    this.stats.totalTrades++; // 访问 stats
    this.log(`平仓: ${symbol} 原因: ${reason}`, 'info'); // 调用 log
  } // 结束代码块

  /**
   * 调整仓位
   * Adjust position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} target - 目标仓位 / Target position
   * @param {number} weightChange - 权重变化 / Weight change
   * @private
   */
  async _adjustPosition(symbol, target, weightChange) { // 执行语句
    // 计算调整量 / Calculate adjustment
    const capital = this.getCapital(); // 定义常量 capital
    const adjustValue = capital * Math.abs(weightChange); // 定义常量 adjustValue
    const price = this.assetManager.getMetrics(symbol)?.latestPrice || 0; // 定义常量 price

    if (price <= 0) { // 条件判断 price <= 0
      return; // 返回结果
    } // 结束代码块

    const amount = adjustValue / price; // 定义常量 amount

    // 执行调整 / Execute adjustment
    if (weightChange > 0) { // 条件判断 weightChange > 0
      // 加仓 / Add
      if (target.side === 'long') { // 条件判断 target.side === 'long'
        this.buy(symbol, amount); // 调用 buy
      } else { // 执行语句
        this.sell(symbol, amount); // 调用 sell
      } // 结束代码块
    } else { // 执行语句
      // 减仓 / Reduce
      if (target.side === 'long') { // 条件判断 target.side === 'long'
        this.sell(symbol, amount); // 调用 sell
      } else { // 执行语句
        this.buy(symbol, amount); // 调用 buy
      } // 结束代码块
    } // 结束代码块

    // 更新组合管理器 / Update portfolio manager
    this.portfolioManager.updateCurrentPosition(symbol, target); // 访问 portfolioManager

    // 记录变化 / Record change
    this.portfolioManager.recordPositionChange({ // 访问 portfolioManager
      type: 'adjust', // 类型
      symbol, // 执行语句
      side: target.side, // 方向
      weight: target.weight, // weight
      weightChange, // 执行语句
      amount, // 执行语句
      price, // 执行语句
    }); // 结束代码块

    this.log(`调整: ${symbol} 权重变化 ${(weightChange * 100).toFixed(2)}%`, 'info'); // 调用 log
  } // 结束代码块

  /**
   * 处理单个K线 (回测模式)
   * Handle single candle (backtest mode)
   *
   * @param {Object} candle - K线数据 / Candle data
   * @param {Array} history - 历史数据 / History data
   */
  async onTick(candle, history) { // 执行语句
    // 更新资产数据 / Update asset data
    const symbol = candle.symbol || this.config.symbols[0]; // 定义常量 symbol

    // 调试日志 / Debug log
    this.log(`[DEBUG] onTick 收到 K 线: ${symbol}, close=${candle.close}`, 'info'); // 调用 log

    this.assetManager.updateAssetData(symbol, candle); // 访问 assetManager

    // 回测模式下的简化处理 / Simplified handling in backtest mode
    // 实际上需要多个资产的数据才能进行横截面分析
    // Actually needs data from multiple assets for cross-sectional analysis

    // 检查是否有足够数据 / Check if enough data
    if (!this.assetManager.hasEnoughData(symbol)) { // 条件判断 !this.assetManager.hasEnoughData(symbol)
      return; // 返回结果
    } // 结束代码块

    // 检查并更新信号 / Check and update signals
    await this._checkAndUpdateSignals(); // 等待异步结果
  } // 结束代码块

  /**
   * 获取策略状态
   * Get strategy status
   *
   * @returns {Object} 策略状态 / Strategy status
   */
  getStatus() { // 调用 getStatus
    const portfolioSummary = this.portfolioManager.getSummary(); // 定义常量 portfolioSummary
    const validAssets = this.assetManager.getAssetsWithEnoughData(); // 定义常量 validAssets

    return { // 返回结果
      name: this.name, // name
      type: this.strategyType, // 类型
      running: this.running, // running
      symbols: this.config.symbols, // 交易对列表
      validAssets: validAssets.length, // 有效Assets
      portfolio: portfolioSummary, // portfolio
      stats: this.stats, // stats
      config: { // 配置
        topN: this.config.topN, // topN
        bottomN: this.config.bottomN, // bottomN
        positionType: this.config.positionType, // 持仓类型
        rankingMetric: this.config.rankingMetric, // ranking指标
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取当前排名
   * Get current ranking
   *
   * @returns {Array} 排名列表 / Ranking list
   */
  getCurrentRanking() { // 调用 getCurrentRanking
    return this.assetManager.getRanking( // 返回结果
      this.config.rankingMetric, // 访问 config
      this.config.rankDirection // 访问 config
    ); // 结束调用或参数
  } // 结束代码块

  /**
   * 获取资产指标
   * Get asset metrics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 指标 / Metrics
   */
  getAssetMetrics(symbol) { // 调用 getAssetMetrics
    return this.assetManager.getMetrics(symbol); // 返回结果
  } // 结束代码块

  /**
   * 强制再平衡
   * Force rebalance
   */
  async forceRebalance() { // 执行语句
    this.portfolioManager.lastRebalanceTime = 0; // 访问 portfolioManager
    await this._checkAndUpdateSignals(); // 等待异步结果
  } // 结束代码块

  /**
   * 结束策略
   * Finish strategy
   */
  async onFinish() { // 执行语句
    // 停止运行 / Stop running
    this.running = false; // 设置 running

    // 记录统计 / Log statistics
    this.log(`策略结束统计:`, 'info'); // 调用 log
    this.log(`  总再平衡次数: ${this.stats.totalRebalances}`, 'info'); // 调用 log
    this.log(`  总交易次数: ${this.stats.totalTrades}`, 'info'); // 调用 log

    // 调用父类结束 / Call parent finish
    await super.onFinish(); // 等待异步结果
  } // 结束代码块

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') { // 调用 log
    const prefix = this.config.logPrefix; // 定义常量 prefix
    super.log(`${prefix} ${message}`, level); // 调用父类
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { // 导出命名成员
  DEFAULT_CONFIG as CROSS_SECTIONAL_DEFAULT_CONFIG, // 执行语句
}; // 结束代码块

export default CrossSectionalStrategy; // 默认导出
