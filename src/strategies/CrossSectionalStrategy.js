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
import { BaseStrategy } from './BaseStrategy.js';

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 横截面策略类型
 * Cross-sectional strategy types
 */
export const CROSS_SECTIONAL_TYPES = {
  MOMENTUM_RANK: 'momentum_rank',           // 动量排名
  ROTATION: 'rotation',                      // 轮动策略
  FUNDING_RATE_EXTREME: 'funding_extreme',   // 资金费率极值
  CROSS_EXCHANGE_SPREAD: 'cross_exchange',   // 跨交易所价差
  RELATIVE_STRENGTH: 'relative_strength',    // 相对强弱
  MEAN_REVERSION: 'mean_reversion',          // 均值回归
};

/**
 * 排名方向
 * Ranking direction
 */
export const RANK_DIRECTION = {
  ASCENDING: 'ascending',   // 升序 (从小到大)
  DESCENDING: 'descending', // 降序 (从大到小)
};

/**
 * 仓位类型
 * Position type
 */
export const POSITION_TYPE = {
  LONG_ONLY: 'long_only',           // 只做多
  SHORT_ONLY: 'short_only',         // 只做空
  LONG_SHORT: 'long_short',         // 多空对冲
  MARKET_NEUTRAL: 'market_neutral', // 市场中性
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 基础配置 / Basic Configuration
  // ============================================

  // 监控的交易对列表 / Symbols to monitor
  // 注意: 永续合约需要使用 :USDT 后缀格式
  symbols: [
    'BTC/USDT:USDT', 'ETH/USDT:USDT', 'BNB/USDT:USDT', 'SOL/USDT:USDT', 'XRP/USDT:USDT',
    'ADA/USDT:USDT', 'AVAX/USDT:USDT', 'DOGE/USDT:USDT', 'DOT/USDT:USDT', 'MATIC/USDT:USDT',
  ],

  // 回看周期 (K线数量) / Lookback period (number of candles)
  lookbackPeriod: 20,

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 1 * 60 * 60 * 1000, // 默认每小时 / Default every hour

  // ============================================
  // 排名配置 / Ranking Configuration
  // ============================================

  // 选取 Top N 个做多 / Select top N for long
  topN: 3,

  // 选取 Bottom N 个做空 / Select bottom N for short
  bottomN: 3,

  // 排名指标 / Ranking metric
  rankingMetric: 'returns', // returns, sharpe, momentum, volatility

  // 排名方向 / Ranking direction
  rankDirection: RANK_DIRECTION.DESCENDING,

  // ============================================
  // 仓位配置 / Position Configuration
  // ============================================

  // 仓位类型 / Position type
  positionType: POSITION_TYPE.LONG_SHORT,

  // 单个资产最大仓位比例 / Max position per asset
  maxPositionPerAsset: 0.15,

  // 单边总仓位比例 / Total position per side
  maxPositionPerSide: 0.5,

  // 最小仓位比例 / Minimum position size
  minPositionSize: 0.01,

  // 是否等权重 / Equal weight
  equalWeight: true,

  // ============================================
  // 风控配置 / Risk Control Configuration
  // ============================================

  // 止损比例 / Stop loss ratio
  stopLoss: 0.05,

  // 止盈比例 / Take profit ratio
  takeProfit: 0.15,

  // 最大回撤 / Max drawdown
  maxDrawdown: 0.10,

  // 最大相关性 / Max correlation (避免持有高度相关资产)
  maxCorrelation: 0.8,

  // ============================================
  // 过滤器配置 / Filter Configuration
  // ============================================

  // 最小日均成交量 (USDT) / Minimum daily volume
  minDailyVolume: 10000000,

  // 最小价格 / Minimum price
  minPrice: 0.0001,

  // 排除的交易对 / Excluded symbols
  excludedSymbols: [],

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[CrossSectional]',
};

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
export class AssetDataManager extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) {
    super();

    // 保存配置 / Save config
    this.config = config;

    // 资产数据存储 / Asset data storage
    // 格式: { symbol: { history: [], metrics: {}, lastUpdate: timestamp } }
    this.assetData = new Map();

    // 相关性矩阵缓存 / Correlation matrix cache
    this.correlationMatrix = new Map();

    // 最后更新时间 / Last update timestamp
    this.lastCorrelationUpdate = 0;
  }

  /**
   * 更新资产数据
   * Update asset data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} candle - K线数据 / Candle data
   */
  updateAssetData(symbol, candle) {
    // 获取或初始化资产数据 / Get or initialize asset data
    if (!this.assetData.has(symbol)) {
      this.assetData.set(symbol, {
        history: [],
        metrics: {},
        lastUpdate: 0,
      });
    }

    const data = this.assetData.get(symbol);

    // 添加K线到历史 / Add candle to history
    data.history.push({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    });

    // 保留最近的历史数据 / Keep recent history only
    const maxHistory = Math.max(this.config.lookbackPeriod * 2, 200);
    if (data.history.length > maxHistory) {
      data.history = data.history.slice(-maxHistory);
    }

    // 更新时间戳 / Update timestamp
    data.lastUpdate = Date.now();

    // 重新计算指标 / Recalculate metrics
    this._calculateMetrics(symbol);
  }

  /**
   * 批量更新资产数据
   * Batch update asset data
   *
   * @param {Map} candleMap - 交易对到K线的映射 / Symbol to candle mapping
   */
  batchUpdate(candleMap) {
    for (const [symbol, candle] of candleMap) {
      this.updateAssetData(symbol, candle);
    }

    // 发出更新事件 / Emit update event
    this.emit('updated', this.assetData);
  }

  /**
   * 计算资产指标
   * Calculate asset metrics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @private
   */
  _calculateMetrics(symbol) {
    const data = this.assetData.get(symbol);
    if (!data || data.history.length < 2) {
      return;
    }

    const history = data.history;
    const lookback = Math.min(this.config.lookbackPeriod, history.length);
    const recentHistory = history.slice(-lookback);

    // 计算收益率 / Calculate returns
    const returns = [];
    for (let i = 1; i < recentHistory.length; i++) {
      const ret = (recentHistory[i].close - recentHistory[i - 1].close) / recentHistory[i - 1].close;
      returns.push(ret);
    }

    // 计算累计收益 / Calculate cumulative return
    const cumulativeReturn = recentHistory.length >= 2
      ? (recentHistory[recentHistory.length - 1].close - recentHistory[0].close) / recentHistory[0].close
      : 0;

    // 计算平均收益 / Calculate average return
    const avgReturn = returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0;

    // 计算波动率 / Calculate volatility
    const volatility = returns.length > 1
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 0;

    // 计算夏普比 (假设无风险利率为0) / Calculate Sharpe ratio (assuming risk-free rate = 0)
    const sharpe = volatility > 0 ? avgReturn / volatility : 0;

    // 计算动量 (价格变化率) / Calculate momentum (rate of change)
    const momentum = history.length >= lookback
      ? (history[history.length - 1].close - history[history.length - lookback].close) / history[history.length - lookback].close
      : 0;

    // 计算成交量均值 / Calculate average volume
    const avgVolume = recentHistory.reduce((sum, c) => sum + c.volume, 0) / recentHistory.length;

    // 计算最新价格 / Get latest price
    const latestPrice = history[history.length - 1].close;

    // 计算RSI / Calculate RSI
    const rsi = this._calculateRSI(returns);

    // 保存指标 / Save metrics
    data.metrics = {
      returns: cumulativeReturn,
      avgReturn,
      volatility,
      sharpe,
      momentum,
      avgVolume,
      latestPrice,
      rsi,
      returnsList: returns,
      timestamp: Date.now(),
    };
  }

  /**
   * 计算RSI
   * Calculate RSI
   *
   * @param {Array} returns - 收益率数组 / Returns array
   * @returns {number} RSI值 / RSI value
   * @private
   */
  _calculateRSI(returns) {
    if (returns.length < 14) {
      return 50; // 默认中性值
    }

    const recent = returns.slice(-14);
    let gains = 0;
    let losses = 0;

    for (const r of recent) {
      if (r > 0) gains += r;
      else losses += Math.abs(r);
    }

    const avgGain = gains / 14;
    const avgLoss = losses / 14;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * 获取资产排名
   * Get asset ranking
   *
   * @param {string} metric - 排名指标 / Ranking metric
   * @param {string} direction - 排名方向 / Ranking direction
   * @returns {Array} 排名列表 / Ranking list
   */
  getRanking(metric = 'returns', direction = RANK_DIRECTION.DESCENDING) {
    const ranking = [];

    // 收集所有资产的指标 / Collect metrics from all assets
    for (const [symbol, data] of this.assetData) {
      if (data.metrics && data.metrics[metric] !== undefined) {
        ranking.push({
          symbol,
          value: data.metrics[metric],
          metrics: data.metrics,
        });
      }
    }

    // 排序 / Sort
    ranking.sort((a, b) => {
      if (direction === RANK_DIRECTION.DESCENDING) {
        return b.value - a.value;
      } else {
        return a.value - b.value;
      }
    });

    // 添加排名 / Add rank
    ranking.forEach((item, index) => {
      item.rank = index + 1;
    });

    return ranking;
  }

  /**
   * 获取Top N资产
   * Get top N assets
   *
   * @param {number} n - 数量 / Count
   * @param {string} metric - 排名指标 / Ranking metric
   * @returns {Array} Top N资产 / Top N assets
   */
  getTopN(n, metric = 'returns') {
    const ranking = this.getRanking(metric, RANK_DIRECTION.DESCENDING);
    return ranking.slice(0, n);
  }

  /**
   * 获取Bottom N资产
   * Get bottom N assets
   *
   * @param {number} n - 数量 / Count
   * @param {string} metric - 排名指标 / Ranking metric
   * @returns {Array} Bottom N资产 / Bottom N assets
   */
  getBottomN(n, metric = 'returns') {
    const ranking = this.getRanking(metric, RANK_DIRECTION.ASCENDING);
    return ranking.slice(0, n);
  }

  /**
   * 计算相关性矩阵
   * Calculate correlation matrix
   *
   * @returns {Map} 相关性矩阵 / Correlation matrix
   */
  calculateCorrelationMatrix() {
    const symbols = Array.from(this.assetData.keys());
    const matrix = new Map();

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const symbol1 = symbols[i];
        const symbol2 = symbols[j];

        const data1 = this.assetData.get(symbol1);
        const data2 = this.assetData.get(symbol2);

        if (data1?.metrics?.returnsList && data2?.metrics?.returnsList) {
          const correlation = this._calculateCorrelation(
            data1.metrics.returnsList,
            data2.metrics.returnsList
          );

          const key = `${symbol1}:${symbol2}`;
          matrix.set(key, correlation);
        }
      }
    }

    this.correlationMatrix = matrix;
    this.lastCorrelationUpdate = Date.now();

    return matrix;
  }

  /**
   * 计算两个序列的相关系数
   * Calculate correlation coefficient between two series
   *
   * @param {Array} series1 - 序列1 / Series 1
   * @param {Array} series2 - 序列2 / Series 2
   * @returns {number} 相关系数 / Correlation coefficient
   * @private
   */
  _calculateCorrelation(series1, series2) {
    // 取相同长度 / Take same length
    const minLen = Math.min(series1.length, series2.length);
    if (minLen < 2) return 0;

    const s1 = series1.slice(-minLen);
    const s2 = series2.slice(-minLen);

    // 计算均值 / Calculate means
    const mean1 = s1.reduce((a, b) => a + b, 0) / minLen;
    const mean2 = s2.reduce((a, b) => a + b, 0) / minLen;

    // 计算协方差和标准差 / Calculate covariance and standard deviations
    let covariance = 0;
    let variance1 = 0;
    let variance2 = 0;

    for (let i = 0; i < minLen; i++) {
      const diff1 = s1[i] - mean1;
      const diff2 = s2[i] - mean2;
      covariance += diff1 * diff2;
      variance1 += diff1 * diff1;
      variance2 += diff2 * diff2;
    }

    const std1 = Math.sqrt(variance1);
    const std2 = Math.sqrt(variance2);

    if (std1 === 0 || std2 === 0) return 0;

    return covariance / (std1 * std2);
  }

  /**
   * 获取两个资产之间的相关性
   * Get correlation between two assets
   *
   * @param {string} symbol1 - 资产1 / Asset 1
   * @param {string} symbol2 - 资产2 / Asset 2
   * @returns {number} 相关系数 / Correlation coefficient
   */
  getCorrelation(symbol1, symbol2) {
    // 确保顺序一致 / Ensure consistent order
    const key1 = `${symbol1}:${symbol2}`;
    const key2 = `${symbol2}:${symbol1}`;

    return this.correlationMatrix.get(key1) || this.correlationMatrix.get(key2) || 0;
  }

  /**
   * 获取资产指标
   * Get asset metrics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 指标 / Metrics
   */
  getMetrics(symbol) {
    const data = this.assetData.get(symbol);
    return data?.metrics || null;
  }

  /**
   * 获取资产历史
   * Get asset history
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Array} 历史数据 / History data
   */
  getHistory(symbol) {
    const data = this.assetData.get(symbol);
    return data?.history || [];
  }

  /**
   * 检查资产是否有足够数据
   * Check if asset has enough data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {boolean} 是否有足够数据 / Whether has enough data
   */
  hasEnoughData(symbol) {
    const data = this.assetData.get(symbol);
    return data && data.history.length >= this.config.lookbackPeriod;
  }

  /**
   * 获取所有有足够数据的资产
   * Get all assets with enough data
   *
   * @returns {Array} 资产列表 / Asset list
   */
  getAssetsWithEnoughData() {
    const assets = [];
    for (const [symbol] of this.assetData) {
      if (this.hasEnoughData(symbol)) {
        assets.push(symbol);
      }
    }
    return assets;
  }

  /**
   * 清除资产数据
   * Clear asset data
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   */
  clear(symbol = null) {
    if (symbol) {
      this.assetData.delete(symbol);
    } else {
      this.assetData.clear();
      this.correlationMatrix.clear();
    }
  }
}

/**
 * 组合管理器
 * Portfolio Manager
 *
 * 管理横截面策略的投资组合
 * Manages portfolio for cross-sectional strategies
 */
export class PortfolioManager extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config) {
    super();

    // 保存配置 / Save config
    this.config = config;

    // 目标仓位 / Target positions
    // 格式: { symbol: { side: 'long'|'short', weight: 0.1, ... } }
    this.targetPositions = new Map();

    // 当前仓位 / Current positions
    this.currentPositions = new Map();

    // 仓位历史 / Position history
    this.positionHistory = [];

    // 最后再平衡时间 / Last rebalance time
    this.lastRebalanceTime = 0;
  }

  /**
   * 设置目标仓位
   * Set target positions
   *
   * @param {Array} longAssets - 做多资产 / Long assets
   * @param {Array} shortAssets - 做空资产 / Short assets
   */
  setTargetPositions(longAssets, shortAssets = []) {
    // 清除旧目标 / Clear old targets
    this.targetPositions.clear();

    // 计算权重 / Calculate weights
    const longWeight = this.config.equalWeight
      ? this.config.maxPositionPerSide / Math.max(longAssets.length, 1)
      : null;
    const shortWeight = this.config.equalWeight
      ? this.config.maxPositionPerSide / Math.max(shortAssets.length, 1)
      : null;

    // 设置做多目标 / Set long targets
    for (const asset of longAssets) {
      const symbol = typeof asset === 'string' ? asset : asset.symbol;
      const weight = longWeight || Math.min(
        asset.weight || this.config.maxPositionPerAsset,
        this.config.maxPositionPerAsset
      );

      this.targetPositions.set(symbol, {
        symbol,
        side: 'long',
        weight: Math.max(weight, this.config.minPositionSize),
        metrics: asset.metrics || {},
        rank: asset.rank || 0,
      });
    }

    // 设置做空目标 / Set short targets
    for (const asset of shortAssets) {
      const symbol = typeof asset === 'string' ? asset : asset.symbol;
      const weight = shortWeight || Math.min(
        asset.weight || this.config.maxPositionPerAsset,
        this.config.maxPositionPerAsset
      );

      this.targetPositions.set(symbol, {
        symbol,
        side: 'short',
        weight: Math.max(weight, this.config.minPositionSize),
        metrics: asset.metrics || {},
        rank: asset.rank || 0,
      });
    }

    // 发出目标更新事件 / Emit target updated event
    this.emit('targetUpdated', {
      long: longAssets.map(a => typeof a === 'string' ? a : a.symbol),
      short: shortAssets.map(a => typeof a === 'string' ? a : a.symbol),
      targets: this.targetPositions,
    });
  }

  /**
   * 获取需要调整的仓位
   * Get positions that need adjustment
   *
   * @returns {Object} 需要调整的仓位 / Positions to adjust
   */
  getPositionAdjustments() {
    const adjustments = {
      toOpen: [],    // 需要开仓 / To open
      toClose: [],   // 需要平仓 / To close
      toAdjust: [],  // 需要调整 / To adjust
    };

    // 检查需要平仓的 / Check positions to close
    for (const [symbol, position] of this.currentPositions) {
      if (!this.targetPositions.has(symbol)) {
        adjustments.toClose.push({
          symbol,
          currentPosition: position,
          reason: 'not_in_target',
        });
      }
    }

    // 检查需要开仓或调整的 / Check positions to open or adjust
    for (const [symbol, target] of this.targetPositions) {
      const current = this.currentPositions.get(symbol);

      if (!current) {
        // 需要开仓 / Need to open
        adjustments.toOpen.push({
          symbol,
          target,
          reason: 'new_position',
        });
      } else if (current.side !== target.side) {
        // 方向变化，需要平仓再开仓 / Direction changed, close and reopen
        adjustments.toClose.push({
          symbol,
          currentPosition: current,
          reason: 'direction_changed',
        });
        adjustments.toOpen.push({
          symbol,
          target,
          reason: 'direction_changed',
        });
      } else if (Math.abs(current.weight - target.weight) > 0.01) {
        // 权重变化超过1%，需要调整 / Weight changed more than 1%
        adjustments.toAdjust.push({
          symbol,
          currentPosition: current,
          target,
          weightChange: target.weight - current.weight,
        });
      }
    }

    return adjustments;
  }

  /**
   * 更新当前仓位
   * Update current position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} position - 仓位信息 / Position info
   */
  updateCurrentPosition(symbol, position) {
    if (position && position.weight > 0) {
      this.currentPositions.set(symbol, position);
    } else {
      this.currentPositions.delete(symbol);
    }
  }

  /**
   * 记录仓位变化
   * Record position change
   *
   * @param {Object} change - 变化信息 / Change info
   */
  recordPositionChange(change) {
    this.positionHistory.push({
      ...change,
      timestamp: Date.now(),
    });

    // 保留最近1000条记录 / Keep last 1000 records
    if (this.positionHistory.length > 1000) {
      this.positionHistory = this.positionHistory.slice(-1000);
    }
  }

  /**
   * 检查是否需要再平衡
   * Check if rebalancing is needed
   *
   * @returns {boolean} 是否需要再平衡 / Whether needs rebalancing
   */
  needsRebalance() {
    const now = Date.now();
    return now - this.lastRebalanceTime >= this.config.rebalancePeriod;
  }

  /**
   * 标记已再平衡
   * Mark as rebalanced
   */
  markRebalanced() {
    this.lastRebalanceTime = Date.now();
  }

  /**
   * 获取组合摘要
   * Get portfolio summary
   *
   * @returns {Object} 组合摘要 / Portfolio summary
   */
  getSummary() {
    let longWeight = 0;
    let shortWeight = 0;
    let longCount = 0;
    let shortCount = 0;

    for (const position of this.currentPositions.values()) {
      if (position.side === 'long') {
        longWeight += position.weight;
        longCount++;
      } else {
        shortWeight += position.weight;
        shortCount++;
      }
    }

    return {
      longCount,
      shortCount,
      totalCount: longCount + shortCount,
      longWeight,
      shortWeight,
      netExposure: longWeight - shortWeight,
      grossExposure: longWeight + shortWeight,
      lastRebalanceTime: this.lastRebalanceTime,
    };
  }

  /**
   * 清除所有仓位
   * Clear all positions
   */
  clear() {
    this.targetPositions.clear();
    this.currentPositions.clear();
  }
}

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 横截面策略基类
 * Cross-Sectional Strategy Base Class
 */
export class CrossSectionalStrategy extends BaseStrategy {
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
    this.name = params.name || 'CrossSectionalStrategy';

    // 保存配置 / Save config
    this.config = config;

    // 资产数据管理器 / Asset data manager
    this.assetManager = new AssetDataManager(config);

    // 组合管理器 / Portfolio manager
    this.portfolioManager = new PortfolioManager(config);

    // 策略类型 / Strategy type
    this.strategyType = params.strategyType || CROSS_SECTIONAL_TYPES.MOMENTUM_RANK;

    // 是否正在运行 / Whether running
    this.running = false;

    // 统计数据 / Statistics
    this.stats = {
      totalRebalances: 0,
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      totalPnl: 0,
    };

    // 设置事件监听 / Set up event listeners
    this._setupEventListeners();
  }

  /**
   * 设置事件监听
   * Set up event listeners
   * @private
   */
  _setupEventListeners() {
    // 监听资产数据更新 / Listen for asset data updates
    this.assetManager.on('updated', () => {
      // 检查是否需要更新信号 / Check if need to update signals
      if (this.running) {
        this._checkAndUpdateSignals();
      }
    });

    // 监听组合目标更新 / Listen for portfolio target updates
    this.portfolioManager.on('targetUpdated', (data) => {
      this.log(
        `目标仓位更新: 多头${data.long.length}个 空头${data.short.length}个`,
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
    // 横截面策略需要 K 线和 Ticker 数据 / Cross-sectional strategy needs kline and ticker
    return ['kline', 'ticker'];
  }

  /**
   * 初始化策略
   * Initialize strategy
   */
  async onInit() {
    // 记录日志 / Log
    this.log(`策略初始化: ${this.name}`, 'info');
    this.log(`监控交易对: ${this.config.symbols.length}个`, 'info');
    this.log(`Top N: ${this.config.topN}, Bottom N: ${this.config.bottomN}`, 'info');
    this.log(`仓位类型: ${this.config.positionType}`, 'info');

    // 调用父类初始化 / Call parent initialization
    await super.onInit();

    // 标记为运行中 / Mark as running
    this.running = true;
  }

  /**
   * 处理K线更新 (多资产版本)
   * Handle candle update (multi-asset version)
   *
   * @param {Object} data - K线数据 / Candle data
   */
  async onCandle(data) {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 确保有交易对信息 / Ensure symbol info
    const symbol = data.symbol;
    if (!symbol) {
      return;
    }

    // 检查是否是监控的交易对 / Check if monitored symbol
    if (!this.config.symbols.includes(symbol)) {
      return;
    }

    // 更新资产数据 / Update asset data
    this.assetManager.updateAssetData(symbol, data);

    // 检查并更新信号 / Check and update signals
    await this._checkAndUpdateSignals();
  }

  /**
   * 批量更新多个资产的K线数据
   * Batch update candle data for multiple assets
   *
   * @param {Map|Object} candleMap - 交易对到K线的映射 / Symbol to candle mapping
   */
  async batchUpdateCandles(candleMap) {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    // 转换为Map / Convert to Map
    const map = candleMap instanceof Map ? candleMap : new Map(Object.entries(candleMap));

    // 批量更新 / Batch update
    this.assetManager.batchUpdate(map);

    // 检查并更新信号 / Check and update signals
    await this._checkAndUpdateSignals();
  }

  /**
   * 检查并更新信号
   * Check and update signals
   * @private
   */
  async _checkAndUpdateSignals() {
    // 获取有足够数据的资产 / Get assets with enough data
    const validAssets = this.assetManager.getAssetsWithEnoughData();

    // 如果有效资产不足，跳过 / If not enough valid assets, skip
    const minAssets = this.config.topN + this.config.bottomN;
    if (validAssets.length < minAssets) {
      if (this.config.verbose) {
        this.log(
          `有效资产不足: ${validAssets.length}/${minAssets}`,
          'debug'
        );
      }
      return;
    }

    // 检查是否需要再平衡 / Check if needs rebalancing
    if (!this.portfolioManager.needsRebalance()) {
      return;
    }

    // 执行再平衡 / Execute rebalancing
    await this._executeRebalance();
  }

  /**
   * 执行再平衡
   * Execute rebalancing
   * @private
   */
  async _executeRebalance() {
    // 获取排名 / Get ranking
    const ranking = this.assetManager.getRanking(
      this.config.rankingMetric,
      this.config.rankDirection
    );

    // 应用过滤器 / Apply filters
    const filteredRanking = this._applyFilters(ranking);

    // 选择做多和做空资产 / Select long and short assets
    const { longAssets, shortAssets } = this._selectAssets(filteredRanking);

    // 应用相关性过滤 / Apply correlation filter
    const filteredLong = this._filterByCorrelation(longAssets);
    const filteredShort = this._filterByCorrelation(shortAssets);

    // 设置目标仓位 / Set target positions
    this.portfolioManager.setTargetPositions(filteredLong, filteredShort);

    // 获取仓位调整 / Get position adjustments
    const adjustments = this.portfolioManager.getPositionAdjustments();

    // 执行调整 / Execute adjustments
    await this._executeAdjustments(adjustments);

    // 标记已再平衡 / Mark as rebalanced
    this.portfolioManager.markRebalanced();
    this.stats.totalRebalances++;

    // 记录日志 / Log
    this.log(
      `再平衡完成: 开仓${adjustments.toOpen.length} 平仓${adjustments.toClose.length} 调整${adjustments.toAdjust.length}`,
      'info'
    );

    // 发出再平衡事件 / Emit rebalance event
    this.emit('rebalanced', {
      ranking,
      longAssets: filteredLong,
      shortAssets: filteredShort,
      adjustments,
      summary: this.portfolioManager.getSummary(),
    });
  }

  /**
   * 应用过滤器
   * Apply filters
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Array} 过滤后的排名 / Filtered ranking
   * @private
   */
  _applyFilters(ranking) {
    return ranking.filter(item => {
      // 排除指定的交易对 / Exclude specified symbols
      if (this.config.excludedSymbols.includes(item.symbol)) {
        return false;
      }

      // 检查最小成交量 / Check minimum volume
      if (item.metrics.avgVolume < this.config.minDailyVolume) {
        return false;
      }

      // 检查最小价格 / Check minimum price
      if (item.metrics.latestPrice < this.config.minPrice) {
        return false;
      }

      return true;
    });
  }

  /**
   * 选择做多和做空资产
   * Select long and short assets
   *
   * @param {Array} ranking - 排名列表 / Ranking list
   * @returns {Object} 做多和做空资产 / Long and short assets
   * @private
   */
  _selectAssets(ranking) {
    let longAssets = [];
    let shortAssets = [];

    switch (this.config.positionType) {
      case POSITION_TYPE.LONG_ONLY:
        longAssets = ranking.slice(0, this.config.topN);
        break;

      case POSITION_TYPE.SHORT_ONLY:
        shortAssets = ranking.slice(-this.config.bottomN);
        break;

      case POSITION_TYPE.LONG_SHORT:
      case POSITION_TYPE.MARKET_NEUTRAL:
        longAssets = ranking.slice(0, this.config.topN);
        shortAssets = ranking.slice(-this.config.bottomN);
        break;
    }

    return { longAssets, shortAssets };
  }

  /**
   * 根据相关性过滤资产
   * Filter assets by correlation
   *
   * @param {Array} assets - 资产列表 / Asset list
   * @returns {Array} 过滤后的资产 / Filtered assets
   * @private
   */
  _filterByCorrelation(assets) {
    if (!this.config.maxCorrelation || assets.length <= 1) {
      return assets;
    }

    // 更新相关性矩阵 / Update correlation matrix
    this.assetManager.calculateCorrelationMatrix();

    const filtered = [];
    const selectedSymbols = new Set();

    for (const asset of assets) {
      // 检查与已选资产的相关性 / Check correlation with selected assets
      let tooCorrelated = false;

      for (const selectedSymbol of selectedSymbols) {
        const correlation = Math.abs(
          this.assetManager.getCorrelation(asset.symbol, selectedSymbol)
        );

        if (correlation > this.config.maxCorrelation) {
          tooCorrelated = true;
          break;
        }
      }

      if (!tooCorrelated) {
        filtered.push(asset);
        selectedSymbols.add(asset.symbol);
      }
    }

    return filtered;
  }

  /**
   * 执行仓位调整
   * Execute position adjustments
   *
   * @param {Object} adjustments - 调整信息 / Adjustment info
   * @private
   */
  async _executeAdjustments(adjustments) {
    // 先平仓 / Close first
    for (const item of adjustments.toClose) {
      await this._closePosition(item.symbol, item.reason);
    }

    // 再开仓 / Then open
    for (const item of adjustments.toOpen) {
      await this._openPosition(item.symbol, item.target);
    }

    // 最后调整 / Finally adjust
    for (const item of adjustments.toAdjust) {
      await this._adjustPosition(item.symbol, item.target, item.weightChange);
    }
  }

  /**
   * 开仓
   * Open position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} target - 目标仓位 / Target position
   * @private
   */
  async _openPosition(symbol, target) {
    // 计算仓位大小 / Calculate position size
    const capital = this.getCapital();
    const positionValue = capital * target.weight;
    const price = this.assetManager.getMetrics(symbol)?.latestPrice || 0;

    if (price <= 0) {
      this.log(`无法开仓 ${symbol}: 价格无效`, 'warn');
      return;
    }

    const amount = positionValue / price;

    // 执行开仓 / Execute open
    if (target.side === 'long') {
      this.buy(symbol, amount);
      this.setBuySignal(`横截面开多: ${symbol} 排名#${target.rank}`);
    } else {
      this.sell(symbol, amount);
      this.setSellSignal(`横截面开空: ${symbol} 排名#${target.rank}`);
    }

    // 更新组合管理器 / Update portfolio manager
    this.portfolioManager.updateCurrentPosition(symbol, target);

    // 记录变化 / Record change
    this.portfolioManager.recordPositionChange({
      type: 'open',
      symbol,
      side: target.side,
      weight: target.weight,
      amount,
      price,
    });

    this.stats.totalTrades++;
    this.log(`开仓: ${target.side} ${symbol} ${amount.toFixed(4)} @ ${price.toFixed(2)}`, 'info');
  }

  /**
   * 平仓
   * Close position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} reason - 原因 / Reason
   * @private
   */
  async _closePosition(symbol, reason) {
    // 平仓 / Close
    this.closePosition(symbol);

    // 更新组合管理器 / Update portfolio manager
    const position = this.portfolioManager.currentPositions.get(symbol);
    this.portfolioManager.updateCurrentPosition(symbol, null);

    // 记录变化 / Record change
    this.portfolioManager.recordPositionChange({
      type: 'close',
      symbol,
      side: position?.side,
      reason,
    });

    this.stats.totalTrades++;
    this.log(`平仓: ${symbol} 原因: ${reason}`, 'info');
  }

  /**
   * 调整仓位
   * Adjust position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} target - 目标仓位 / Target position
   * @param {number} weightChange - 权重变化 / Weight change
   * @private
   */
  async _adjustPosition(symbol, target, weightChange) {
    // 计算调整量 / Calculate adjustment
    const capital = this.getCapital();
    const adjustValue = capital * Math.abs(weightChange);
    const price = this.assetManager.getMetrics(symbol)?.latestPrice || 0;

    if (price <= 0) {
      return;
    }

    const amount = adjustValue / price;

    // 执行调整 / Execute adjustment
    if (weightChange > 0) {
      // 加仓 / Add
      if (target.side === 'long') {
        this.buy(symbol, amount);
      } else {
        this.sell(symbol, amount);
      }
    } else {
      // 减仓 / Reduce
      if (target.side === 'long') {
        this.sell(symbol, amount);
      } else {
        this.buy(symbol, amount);
      }
    }

    // 更新组合管理器 / Update portfolio manager
    this.portfolioManager.updateCurrentPosition(symbol, target);

    // 记录变化 / Record change
    this.portfolioManager.recordPositionChange({
      type: 'adjust',
      symbol,
      side: target.side,
      weight: target.weight,
      weightChange,
      amount,
      price,
    });

    this.log(`调整: ${symbol} 权重变化 ${(weightChange * 100).toFixed(2)}%`, 'info');
  }

  /**
   * 处理单个K线 (回测模式)
   * Handle single candle (backtest mode)
   *
   * @param {Object} candle - K线数据 / Candle data
   * @param {Array} history - 历史数据 / History data
   */
  async onTick(candle, history) {
    // 更新资产数据 / Update asset data
    const symbol = candle.symbol || this.config.symbols[0];

    // 调试日志 / Debug log
    this.log(`[DEBUG] onTick 收到 K 线: ${symbol}, close=${candle.close}`, 'info');

    this.assetManager.updateAssetData(symbol, candle);

    // 回测模式下的简化处理 / Simplified handling in backtest mode
    // 实际上需要多个资产的数据才能进行横截面分析
    // Actually needs data from multiple assets for cross-sectional analysis

    // 检查是否有足够数据 / Check if enough data
    if (!this.assetManager.hasEnoughData(symbol)) {
      return;
    }

    // 检查并更新信号 / Check and update signals
    await this._checkAndUpdateSignals();
  }

  /**
   * 获取策略状态
   * Get strategy status
   *
   * @returns {Object} 策略状态 / Strategy status
   */
  getStatus() {
    const portfolioSummary = this.portfolioManager.getSummary();
    const validAssets = this.assetManager.getAssetsWithEnoughData();

    return {
      name: this.name,
      type: this.strategyType,
      running: this.running,
      symbols: this.config.symbols,
      validAssets: validAssets.length,
      portfolio: portfolioSummary,
      stats: this.stats,
      config: {
        topN: this.config.topN,
        bottomN: this.config.bottomN,
        positionType: this.config.positionType,
        rankingMetric: this.config.rankingMetric,
      },
    };
  }

  /**
   * 获取当前排名
   * Get current ranking
   *
   * @returns {Array} 排名列表 / Ranking list
   */
  getCurrentRanking() {
    return this.assetManager.getRanking(
      this.config.rankingMetric,
      this.config.rankDirection
    );
  }

  /**
   * 获取资产指标
   * Get asset metrics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object|null} 指标 / Metrics
   */
  getAssetMetrics(symbol) {
    return this.assetManager.getMetrics(symbol);
  }

  /**
   * 强制再平衡
   * Force rebalance
   */
  async forceRebalance() {
    this.portfolioManager.lastRebalanceTime = 0;
    await this._checkAndUpdateSignals();
  }

  /**
   * 结束策略
   * Finish strategy
   */
  async onFinish() {
    // 停止运行 / Stop running
    this.running = false;

    // 记录统计 / Log statistics
    this.log(`策略结束统计:`, 'info');
    this.log(`  总再平衡次数: ${this.stats.totalRebalances}`, 'info');
    this.log(`  总交易次数: ${this.stats.totalTrades}`, 'info');

    // 调用父类结束 / Call parent finish
    await super.onFinish();
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    const prefix = this.config.logPrefix;
    super.log(`${prefix} ${message}`, level);
  }
}

// ============================================
// 导出 / Exports
// ============================================

export {
  DEFAULT_CONFIG as CROSS_SECTIONAL_DEFAULT_CONFIG,
};

export default CrossSectionalStrategy;
