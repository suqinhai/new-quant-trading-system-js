/**
 * 统计套利策略
 * Statistical Arbitrage Strategy
 *
 * 包含多种统计套利形式：
 * 1. 协整交易 (Cointegration Trading)
 * 2. 配对交易 (Pairs Trading)
 * 3. 跨交易所价差套利 (Cross-Exchange Spread Arbitrage)
 * 4. 永续vs现货基差回归 (Perpetual-Spot Basis Trading)
 *
 * 特点：
 * - 非方向性策略，收益曲线平滑
 * - 与趋势策略相关性极低
 * - 基于均值回归原理
 */

// 导入策略基类 / Import base strategy
import { BaseStrategy } from './BaseStrategy.js';
import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 统计套利类型
 * Statistical arbitrage types
 */
export const STAT_ARB_TYPE = {
  COINTEGRATION: 'cointegration',         // 协整交易
  PAIRS_TRADING: 'pairs_trading',          // 配对交易
  CROSS_EXCHANGE: 'cross_exchange',        // 跨交易所套利
  PERPETUAL_SPOT: 'perpetual_spot',        // 永续-现货基差
  TRIANGULAR: 'triangular',                // 三角套利
};

/**
 * 配对状态
 * Pair status
 */
export const PAIR_STATUS = {
  ACTIVE: 'active',           // 活跃
  SUSPENDED: 'suspended',     // 暂停
  BROKEN: 'broken',           // 关系破裂
  PENDING: 'pending',         // 待验证
};

/**
 * 信号类型
 * Signal types
 */
export const SIGNAL_TYPE = {
  OPEN_LONG_SPREAD: 'open_long_spread',   // 开多价差 (做多A，做空B)
  OPEN_SHORT_SPREAD: 'open_short_spread', // 开空价差 (做空A，做多B)
  CLOSE_SPREAD: 'close_spread',           // 平仓价差
  NO_SIGNAL: 'no_signal',                 // 无信号
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 策略类型配置 / Strategy Type Configuration
  // ============================================
  arbType: STAT_ARB_TYPE.PAIRS_TRADING,

  // ============================================
  // 配对配置 / Pairs Configuration
  // ============================================

  // 候选配对列表 (可动态发现或手动指定)
  // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
  candidatePairs: [
    { assetA: 'BTC/USDT', assetB: 'ETH/USDT' },
    { assetA: 'ETH/USDT', assetB: 'BNB/USDT' },
    { assetA: 'SOL/USDT', assetB: 'AVAX/USDT' },
  ],

  // 最大同时持有配对数
  maxActivePairs: 5,

  // 回看周期 (用于计算统计量)
  lookbackPeriod: 60,

  // 协整检验周期
  cointegrationTestPeriod: 100,

  // ============================================
  // 协整检验配置 / Cointegration Test Configuration
  // ============================================

  // ADF检验显著性水平 (1%, 5%, 10%)
  adfSignificanceLevel: 0.05,

  // 最小相关性阈值 (用于初筛)
  minCorrelation: 0.7,

  // 半衰期限制 (天)
  minHalfLife: 1,
  maxHalfLife: 30,

  // ============================================
  // 信号配置 / Signal Configuration
  // ============================================

  // Z-Score开仓阈值
  entryZScore: 2.0,

  // Z-Score平仓阈值
  exitZScore: 0.5,

  // Z-Score止损阈值
  stopLossZScore: 4.0,

  // 最大持仓时间 (毫秒) - 防止长期持仓
  maxHoldingPeriod: 7 * 24 * 60 * 60 * 1000, // 7天

  // ============================================
  // 跨交易所套利配置 / Cross-Exchange Arbitrage Configuration
  // ============================================

  // 价差开仓阈值 (百分比)
  spreadEntryThreshold: 0.003, // 0.3%

  // 价差平仓阈值 (百分比)
  spreadExitThreshold: 0.001, // 0.1%

  // 考虑的交易成本 (单边)
  tradingCost: 0.001, // 0.1%

  // 滑点估计
  slippageEstimate: 0.0005, // 0.05%

  // ============================================
  // 永续-现货基差配置 / Perpetual-Spot Basis Configuration
  // ============================================

  // 基差入场阈值 (年化)
  basisEntryThreshold: 0.15, // 15% 年化

  // 基差出场阈值 (年化)
  basisExitThreshold: 0.05, // 5% 年化

  // 资金费率阈值 (8小时)
  fundingRateThreshold: 0.001, // 0.1%

  // ============================================
  // 仓位管理 / Position Management
  // ============================================

  // 单个配对最大仓位
  maxPositionPerPair: 0.1, // 10% of capital

  // 总最大仓位
  maxTotalPosition: 0.5, // 50% of capital

  // 仓位对称 (做多和做空等量)
  symmetricPosition: true,

  // ============================================
  // 风险控制 / Risk Control
  // ============================================

  // 单配对最大亏损
  maxLossPerPair: 0.02, // 2%

  // 总最大回撤
  maxDrawdown: 0.10, // 10%

  // 连续亏损次数触发冷却
  consecutiveLossLimit: 3,

  // 冷却时间
  coolingPeriod: 24 * 60 * 60 * 1000, // 24小时

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================
  verbose: true,
  logPrefix: '[StatArb]',
};

// ============================================
// 辅助类 / Helper Classes
// ============================================

/**
 * 价格序列存储
 * Price Series Store
 */
class PriceSeriesStore {
  constructor(maxLength = 500) {
    this.maxLength = maxLength;
    this.series = new Map(); // symbol -> { prices: [], timestamps: [] }
  }

  /**
   * 添加价格
   */
  addPrice(symbol, price, timestamp = Date.now()) {
    if (!this.series.has(symbol)) {
      this.series.set(symbol, { prices: [], timestamps: [] });
    }

    const data = this.series.get(symbol);
    data.prices.push(price);
    data.timestamps.push(timestamp);

    // 保持最大长度
    if (data.prices.length > this.maxLength) {
      data.prices.shift();
      data.timestamps.shift();
    }
  }

  /**
   * 获取价格序列
   */
  getPrices(symbol, length = null) {
    const data = this.series.get(symbol);
    if (!data) return [];

    if (length) {
      return data.prices.slice(-length);
    }
    return [...data.prices];
  }

  /**
   * 获取最新价格
   */
  getLatestPrice(symbol) {
    const data = this.series.get(symbol);
    if (!data || data.prices.length === 0) return null;
    return data.prices[data.prices.length - 1];
  }

  /**
   * 检查是否有足够数据
   */
  hasEnoughData(symbol, requiredLength) {
    const data = this.series.get(symbol);
    return data && data.prices.length >= requiredLength;
  }

  /**
   * 获取收益率序列
   */
  getReturns(symbol, length = null) {
    const prices = this.getPrices(symbol, length ? length + 1 : null);
    if (prices.length < 2) return [];

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  /**
   * 清除数据
   */
  clear(symbol = null) {
    if (symbol) {
      this.series.delete(symbol);
    } else {
      this.series.clear();
    }
  }
}

/**
 * 统计计算工具
 * Statistical Calculator
 */
class StatisticalCalculator {
  /**
   * 计算均值
   */
  static mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * 计算标准差
   */
  static std(arr) {
    if (arr.length < 2) return 0;
    const avg = this.mean(arr);
    const squareDiffs = arr.map(x => Math.pow(x - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }

  /**
   * 计算Z-Score
   */
  static zScore(value, mean, std) {
    if (std === 0) return 0;
    return (value - mean) / std;
  }

  /**
   * 计算相关系数
   */
  static correlation(seriesA, seriesB) {
    const n = Math.min(seriesA.length, seriesB.length);
    if (n < 2) return 0;

    const a = seriesA.slice(-n);
    const b = seriesB.slice(-n);

    const meanA = this.mean(a);
    const meanB = this.mean(b);

    let covariance = 0;
    let varA = 0;
    let varB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = a[i] - meanA;
      const diffB = b[i] - meanB;
      covariance += diffA * diffB;
      varA += diffA * diffA;
      varB += diffB * diffB;
    }

    const stdA = Math.sqrt(varA);
    const stdB = Math.sqrt(varB);

    if (stdA === 0 || stdB === 0) return 0;
    return covariance / (stdA * stdB);
  }

  /**
   * OLS回归 (y = alpha + beta * x)
   */
  static ols(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return { alpha: 0, beta: 1, residuals: [] };

    const xSlice = x.slice(-n);
    const ySlice = y.slice(-n);

    const meanX = this.mean(xSlice);
    const meanY = this.mean(ySlice);

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      const diffX = xSlice[i] - meanX;
      numerator += diffX * (ySlice[i] - meanY);
      denominator += diffX * diffX;
    }

    const beta = denominator !== 0 ? numerator / denominator : 1;
    const alpha = meanY - beta * meanX;

    // 计算残差
    const residuals = [];
    for (let i = 0; i < n; i++) {
      residuals.push(ySlice[i] - (alpha + beta * xSlice[i]));
    }

    return { alpha, beta, residuals };
  }

  /**
   * 简化ADF检验 (Augmented Dickey-Fuller)
   * 返回是否平稳 (true表示平稳)
   *
   * 使用简化方法：检验残差是否表现出均值回归特性
   * - 计算残差的自相关性
   * - 检验Hurst指数
   */
  static adfTest(series, significance = 0.05) {
    if (series.length < 30) {
      return { isStationary: false, testStat: 0, criticalValue: 0, pValue: 1 };
    }

    // 计算一阶差分
    const diff = [];
    for (let i = 1; i < series.length; i++) {
      diff.push(series[i] - series[i - 1]);
    }

    // 计算滞后项
    const lagged = series.slice(0, -1);

    // 运行回归: diff[t] = alpha + beta * series[t-1] + error
    const regression = this.ols(lagged, diff);

    // 计算t统计量
    const residualStd = this.std(regression.residuals);
    const laggedStd = this.std(lagged);
    const n = lagged.length;

    // 标准误差
    const se = residualStd / (laggedStd * Math.sqrt(n));
    const tStat = se !== 0 ? regression.beta / se : 0;

    // ADF临界值 (近似值，用于n>100)
    // 1%: -3.43, 5%: -2.86, 10%: -2.57
    let criticalValue;
    if (significance <= 0.01) {
      criticalValue = -3.43;
    } else if (significance <= 0.05) {
      criticalValue = -2.86;
    } else {
      criticalValue = -2.57;
    }

    // 如果t统计量小于临界值，则拒绝单位根假设，序列平稳
    const isStationary = tStat < criticalValue;

    // 估算p值 (简化)
    let pValue;
    if (tStat < -3.43) {
      pValue = 0.01;
    } else if (tStat < -2.86) {
      pValue = 0.05;
    } else if (tStat < -2.57) {
      pValue = 0.10;
    } else {
      pValue = 0.5;
    }

    return {
      isStationary,
      testStat: tStat,
      criticalValue,
      pValue,
      beta: regression.beta,
    };
  }

  /**
   * 计算半衰期 (Half-Life)
   * 基于OU过程的均值回归速度
   */
  static calculateHalfLife(series) {
    if (series.length < 10) return Infinity;

    // 计算滞后回归: z[t] - z[t-1] = alpha + beta * z[t-1]
    const lagged = series.slice(0, -1);
    const diff = [];
    for (let i = 1; i < series.length; i++) {
      diff.push(series[i] - series[i - 1]);
    }

    const regression = this.ols(lagged, diff);
    const lambda = -regression.beta;

    // 半衰期 = -ln(2) / ln(1 + beta)
    if (lambda <= 0 || lambda >= 1) {
      return Infinity; // 不收敛
    }

    const halfLife = -Math.log(2) / Math.log(1 - lambda);
    return halfLife;
  }

  /**
   * 计算Hurst指数 (均值回归强度)
   * H < 0.5: 均值回归
   * H = 0.5: 随机游走
   * H > 0.5: 趋势性
   */
  static hurstExponent(series, maxLag = 20) {
    if (series.length < maxLag * 2) return 0.5;

    const lags = [];
    const rsValues = [];

    for (let lag = 2; lag <= maxLag; lag++) {
      const rs = this._calculateRS(series, lag);
      if (rs > 0) {
        lags.push(Math.log(lag));
        rsValues.push(Math.log(rs));
      }
    }

    if (lags.length < 3) return 0.5;

    // 线性回归得到H
    const regression = this.ols(lags, rsValues);
    return Math.max(0, Math.min(1, regression.beta));
  }

  /**
   * 计算R/S统计量
   */
  static _calculateRS(series, lag) {
    const n = series.length;
    const numSubseries = Math.floor(n / lag);
    if (numSubseries < 1) return 0;

    let totalRS = 0;
    for (let i = 0; i < numSubseries; i++) {
      const subseries = series.slice(i * lag, (i + 1) * lag);
      const mean = this.mean(subseries);

      // 累积偏差
      let cumDev = 0;
      let maxCumDev = -Infinity;
      let minCumDev = Infinity;

      for (const val of subseries) {
        cumDev += val - mean;
        maxCumDev = Math.max(maxCumDev, cumDev);
        minCumDev = Math.min(minCumDev, cumDev);
      }

      const R = maxCumDev - minCumDev;
      const S = this.std(subseries);

      if (S > 0) {
        totalRS += R / S;
      }
    }

    return totalRS / numSubseries;
  }
}

/**
 * 配对管理器
 * Pair Manager
 */
class PairManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;

    // 配对存储
    // 格式: pairId -> { assetA, assetB, status, stats, position, ... }
    this.pairs = new Map();

    // 活跃配对ID列表
    this.activePairs = new Set();

    // 配对性能历史
    this.pairPerformance = new Map();
  }

  /**
   * 生成配对ID
   */
  generatePairId(assetA, assetB) {
    // 确保一致的排序
    const sorted = [assetA, assetB].sort();
    return `${sorted[0]}:${sorted[1]}`;
  }

  /**
   * 添加配对
   */
  addPair(assetA, assetB, stats = {}) {
    const pairId = this.generatePairId(assetA, assetB);

    if (this.pairs.has(pairId)) {
      // 更新现有配对
      const pair = this.pairs.get(pairId);
      pair.stats = { ...pair.stats, ...stats };
      pair.lastUpdate = Date.now();
      return pair;
    }

    const pair = {
      id: pairId,
      assetA,
      assetB,
      status: PAIR_STATUS.PENDING,
      stats: {
        correlation: 0,
        cointegration: null,
        halfLife: null,
        hurstExponent: null,
        beta: 1,
        alpha: 0,
        spreadMean: 0,
        spreadStd: 0,
        ...stats,
      },
      position: null,
      openTime: null,
      lastSignal: null,
      performance: {
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        totalPnl: 0,
        maxDrawdown: 0,
      },
      lastUpdate: Date.now(),
      createdAt: Date.now(),
    };

    this.pairs.set(pairId, pair);
    this.emit('pairAdded', pair);

    return pair;
  }

  /**
   * 更新配对统计
   */
  updatePairStats(pairId, stats) {
    const pair = this.pairs.get(pairId);
    if (!pair) return null;

    pair.stats = { ...pair.stats, ...stats };
    pair.lastUpdate = Date.now();

    // 检查配对是否仍然有效
    this._validatePair(pair);

    return pair;
  }

  /**
   * 验证配对有效性
   */
  _validatePair(pair) {
    const { stats } = pair;
    const { config } = this;

    // 检查协整性
    if (stats.cointegration && !stats.cointegration.isStationary) {
      pair.status = PAIR_STATUS.BROKEN;
      this.deactivatePair(pair.id);
      return false;
    }

    // 检查相关性
    if (Math.abs(stats.correlation) < config.minCorrelation) {
      pair.status = PAIR_STATUS.SUSPENDED;
      return false;
    }

    // 检查半衰期
    if (stats.halfLife) {
      if (stats.halfLife < config.minHalfLife || stats.halfLife > config.maxHalfLife) {
        pair.status = PAIR_STATUS.SUSPENDED;
        return false;
      }
    }

    pair.status = PAIR_STATUS.ACTIVE;
    return true;
  }

  /**
   * 激活配对
   */
  activatePair(pairId) {
    const pair = this.pairs.get(pairId);
    if (!pair) return false;

    if (this.activePairs.size >= this.config.maxActivePairs) {
      return false;
    }

    pair.status = PAIR_STATUS.ACTIVE;
    this.activePairs.add(pairId);
    this.emit('pairActivated', pair);

    return true;
  }

  /**
   * 停用配对
   */
  deactivatePair(pairId) {
    const pair = this.pairs.get(pairId);
    if (!pair) return false;

    this.activePairs.delete(pairId);
    this.emit('pairDeactivated', pair);

    return true;
  }

  /**
   * 设置配对仓位
   */
  setPosition(pairId, position) {
    const pair = this.pairs.get(pairId);
    if (!pair) return null;

    pair.position = position;
    if (position) {
      pair.openTime = Date.now();
    } else {
      pair.openTime = null;
    }

    return pair;
  }

  /**
   * 记录配对交易结果
   */
  recordTradeResult(pairId, pnl, isWin) {
    const pair = this.pairs.get(pairId);
    if (!pair) return;

    pair.performance.totalTrades++;
    pair.performance.totalPnl += pnl;

    if (isWin) {
      pair.performance.winCount++;
    } else {
      pair.performance.lossCount++;
    }

    // 更新最大回撤
    if (pnl < 0) {
      pair.performance.maxDrawdown = Math.max(
        pair.performance.maxDrawdown,
        Math.abs(pnl)
      );
    }
  }

  /**
   * 获取活跃配对
   */
  getActivePairs() {
    return Array.from(this.activePairs)
      .map(id => this.pairs.get(id))
      .filter(p => p != null);
  }

  /**
   * 获取有仓位的配对
   */
  getPairsWithPositions() {
    return Array.from(this.pairs.values())
      .filter(p => p.position != null);
  }

  /**
   * 获取配对
   */
  getPair(pairId) {
    return this.pairs.get(pairId);
  }

  /**
   * 获取所有配对
   */
  getAllPairs() {
    return Array.from(this.pairs.values());
  }

  /**
   * 清除所有配对
   */
  clear() {
    this.pairs.clear();
    this.activePairs.clear();
    this.pairPerformance.clear();
  }
}

/**
 * 价差计算器
 * Spread Calculator
 */
class SpreadCalculator {
  /**
   * 计算价格比率价差 (Price Ratio Spread)
   * spread = price_A / price_B
   */
  static ratioSpread(priceA, priceB) {
    if (priceB === 0) return 0;
    return priceA / priceB;
  }

  /**
   * 计算对数价差 (Log Spread)
   * spread = log(price_A) - beta * log(price_B)
   */
  static logSpread(priceA, priceB, beta = 1) {
    if (priceA <= 0 || priceB <= 0) return 0;
    return Math.log(priceA) - beta * Math.log(priceB);
  }

  /**
   * 计算回归残差价差 (Regression Residual Spread)
   * spread = price_A - (alpha + beta * price_B)
   */
  static residualSpread(priceA, priceB, alpha, beta) {
    return priceA - (alpha + beta * priceB);
  }

  /**
   * 计算百分比价差 (Percentage Spread)
   * 用于跨交易所套利
   */
  static percentageSpread(priceA, priceB) {
    if (priceB === 0) return 0;
    return (priceA - priceB) / priceB;
  }

  /**
   * 计算基差 (Basis)
   * 用于永续-现货套利
   * basis = (perpetual_price - spot_price) / spot_price
   */
  static basis(perpetualPrice, spotPrice) {
    if (spotPrice === 0) return 0;
    return (perpetualPrice - spotPrice) / spotPrice;
  }

  /**
   * 计算年化基差
   */
  static annualizedBasis(basis, daysToExpiry = 365) {
    return basis * (365 / daysToExpiry);
  }
}

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 统计套利策略
 * Statistical Arbitrage Strategy
 */
export class StatisticalArbitrageStrategy extends BaseStrategy {
  /**
   * 构造函数
   * Constructor
   */
  constructor(params = {}) {
    // 合并配置
    const config = { ...DEFAULT_CONFIG, ...params };
    super(config);

    // 设置策略名称
    this.name = params.name || 'StatisticalArbitrageStrategy';

    // 保存配置
    this.config = config;

    // 价格序列存储
    this.priceStore = new PriceSeriesStore(config.cointegrationTestPeriod * 2);

    // 配对管理器
    this.pairManager = new PairManager(config);

    // 是否运行中
    this.running = false;

    // 统计数据
    this.stats = {
      totalSignals: 0,
      totalTrades: 0,
      totalPnl: 0,
      winCount: 0,
      lossCount: 0,
      currentDrawdown: 0,
      maxDrawdown: 0,
      consecutiveLosses: 0,
      lastTradeTime: null,
    };

    // 冷却状态
    this.coolingUntil = 0;

    // 设置事件监听
    this._setupEventListeners();
  }

  /**
   * 设置事件监听
   */
  _setupEventListeners() {
    this.pairManager.on('pairAdded', (pair) => {
      this.log(`新配对添加: ${pair.id}`, 'info');
    });

    this.pairManager.on('pairActivated', (pair) => {
      this.log(`配对激活: ${pair.id}`, 'info');
    });

    this.pairManager.on('pairDeactivated', (pair) => {
      this.log(`配对停用: ${pair.id}`, 'info');
    });
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 统计套利策略需要 Ticker 和 K 线数据 / Statistical arbitrage needs ticker and kline
    return ['ticker', 'kline'];
  }

  /**
   * 初始化策略
   */
  async onInit() {
    this.log(`策略初始化: ${this.name}`, 'info');
    this.log(`套利类型: ${this.config.arbType}`, 'info');
    this.log(`候选配对数: ${this.config.candidatePairs.length}`, 'info');

    // 初始化候选配对
    for (const pair of this.config.candidatePairs) {
      this.pairManager.addPair(pair.assetA, pair.assetB);
    }

    await super.onInit();
    this.running = true;
  }

  /**
   * 处理K线更新
   */
  async onTick(candle, history) {
    if (!this.running) return;

    // 检查冷却期
    if (Date.now() < this.coolingUntil) {
      return;
    }

    const symbol = candle.symbol;
    if (!symbol) return;

    // 更新价格存储
    this.priceStore.addPrice(symbol, candle.close, candle.timestamp);

    // 检查并更新所有配对
    await this._updatePairs();

    // 检查信号
    await this._checkSignals();

    // 管理现有仓位
    await this._managePositions();
  }

  /**
   * 处理多资产K线更新 (实盘/影子模式)
   */
  async onCandle(data) {
    if (!this.running) return;

    const symbol = data.symbol;
    if (!symbol) return;

    // 更新价格存储
    this.priceStore.addPrice(symbol, data.close, data.timestamp || Date.now());

    // 检查是否需要更新配对
    // 只在有足够数据时更新
    const allSymbols = this._getAllSymbols();
    const hasEnoughData = allSymbols.every(s =>
      this.priceStore.hasEnoughData(s, this.config.lookbackPeriod)
    );

    if (hasEnoughData) {
      await this._updatePairs();
      await this._checkSignals();
      await this._managePositions();
    }
  }

  /**
   * 获取所有涉及的交易对
   */
  _getAllSymbols() {
    const symbols = new Set();
    for (const pair of this.config.candidatePairs) {
      symbols.add(pair.assetA);
      symbols.add(pair.assetB);
    }
    return Array.from(symbols);
  }

  /**
   * 获取策略所需的所有交易对 (覆盖基类方法)
   * Get all symbols required by the strategy (override base class)
   *
   * 统计套利策略需要订阅所有配对中的交易对
   * Statistical arbitrage strategy needs to subscribe all symbols in pairs
   *
   * @returns {Array<string>} 交易对列表 / Symbol list
   */
  getRequiredSymbols() {
    return this._getAllSymbols();
  }

  /**
   * 更新配对统计信息
   */
  async _updatePairs() {
    const pairs = this.pairManager.getAllPairs();

    for (const pair of pairs) {
      // 检查是否有足够数据
      if (!this.priceStore.hasEnoughData(pair.assetA, this.config.lookbackPeriod) ||
          !this.priceStore.hasEnoughData(pair.assetB, this.config.lookbackPeriod)) {
        continue;
      }

      // 获取价格序列
      const pricesA = this.priceStore.getPrices(pair.assetA, this.config.cointegrationTestPeriod);
      const pricesB = this.priceStore.getPrices(pair.assetB, this.config.cointegrationTestPeriod);

      // 计算相关性
      const correlation = StatisticalCalculator.correlation(pricesA, pricesB);

      // 计算OLS回归参数
      const regression = StatisticalCalculator.ols(pricesB, pricesA);
      const { alpha, beta, residuals } = regression;

      // 计算价差统计
      const spreadMean = StatisticalCalculator.mean(residuals);
      const spreadStd = StatisticalCalculator.std(residuals);

      // 进行协整检验
      const cointegration = StatisticalCalculator.adfTest(
        residuals,
        this.config.adfSignificanceLevel
      );

      // 计算半衰期
      const halfLife = StatisticalCalculator.calculateHalfLife(residuals);

      // 计算Hurst指数
      const hurstExponent = StatisticalCalculator.hurstExponent(residuals);

      // 更新配对统计
      this.pairManager.updatePairStats(pair.id, {
        correlation,
        alpha,
        beta,
        spreadMean,
        spreadStd,
        cointegration,
        halfLife,
        hurstExponent,
        lastAnalysisTime: Date.now(),
      });

      // 如果通过协整检验，激活配对
      if (cointegration.isStationary &&
          Math.abs(correlation) >= this.config.minCorrelation &&
          halfLife >= this.config.minHalfLife &&
          halfLife <= this.config.maxHalfLife) {

        if (pair.status !== PAIR_STATUS.ACTIVE) {
          this.pairManager.activatePair(pair.id);
        }
      }
    }
  }

  /**
   * 检查交易信号
   */
  async _checkSignals() {
    const activePairs = this.pairManager.getActivePairs();

    for (const pair of activePairs) {
      // 跳过已有仓位的配对
      if (pair.position) continue;

      // 获取当前信号
      const signal = this._generateSignal(pair);

      if (signal.type !== SIGNAL_TYPE.NO_SIGNAL) {
        await this._executeSignal(pair, signal);
      }
    }
  }

  /**
   * 生成交易信号
   */
  _generateSignal(pair) {
    const { stats } = pair;

    // 获取当前价格
    const priceA = this.priceStore.getLatestPrice(pair.assetA);
    const priceB = this.priceStore.getLatestPrice(pair.assetB);

    if (!priceA || !priceB) {
      return { type: SIGNAL_TYPE.NO_SIGNAL };
    }

    // 根据套利类型生成信号
    switch (this.config.arbType) {
      case STAT_ARB_TYPE.PAIRS_TRADING:
      case STAT_ARB_TYPE.COINTEGRATION:
        return this._generatePairsSignal(pair, priceA, priceB, stats);

      case STAT_ARB_TYPE.CROSS_EXCHANGE:
        return this._generateCrossExchangeSignal(pair, priceA, priceB);

      case STAT_ARB_TYPE.PERPETUAL_SPOT:
        return this._generatePerpetualSpotSignal(pair, priceA, priceB);

      default:
        return { type: SIGNAL_TYPE.NO_SIGNAL };
    }
  }

  /**
   * 生成配对交易信号 (基于Z-Score)
   */
  _generatePairsSignal(pair, priceA, priceB, stats) {
    // 计算当前价差
    const currentSpread = SpreadCalculator.residualSpread(
      priceA, priceB, stats.alpha, stats.beta
    );

    // 计算Z-Score
    const zScore = StatisticalCalculator.zScore(
      currentSpread,
      stats.spreadMean,
      stats.spreadStd
    );

    // 保存当前Z-Score
    pair.stats.currentZScore = zScore;
    pair.stats.currentSpread = currentSpread;

    // 生成信号
    if (zScore >= this.config.entryZScore) {
      // 价差过高，做空价差 (做空A，做多B)
      return {
        type: SIGNAL_TYPE.OPEN_SHORT_SPREAD,
        zScore,
        spread: currentSpread,
        reason: `Z-Score=${zScore.toFixed(2)} >= ${this.config.entryZScore}`,
      };
    } else if (zScore <= -this.config.entryZScore) {
      // 价差过低，做多价差 (做多A，做空B)
      return {
        type: SIGNAL_TYPE.OPEN_LONG_SPREAD,
        zScore,
        spread: currentSpread,
        reason: `Z-Score=${zScore.toFixed(2)} <= -${this.config.entryZScore}`,
      };
    }

    return { type: SIGNAL_TYPE.NO_SIGNAL };
  }

  /**
   * 生成跨交易所套利信号
   */
  _generateCrossExchangeSignal(pair, priceA, priceB) {
    // 计算百分比价差
    const spread = SpreadCalculator.percentageSpread(priceA, priceB);

    // 考虑交易成本
    const netSpread = Math.abs(spread) - 2 * this.config.tradingCost - 2 * this.config.slippageEstimate;

    pair.stats.currentSpread = spread;
    pair.stats.netSpread = netSpread;

    if (netSpread > this.config.spreadEntryThreshold) {
      if (spread > 0) {
        // A价格高于B，做空A做多B
        return {
          type: SIGNAL_TYPE.OPEN_SHORT_SPREAD,
          spread,
          netSpread,
          reason: `跨交易所价差=${(spread * 100).toFixed(3)}%`,
        };
      } else {
        // B价格高于A，做多A做空B
        return {
          type: SIGNAL_TYPE.OPEN_LONG_SPREAD,
          spread,
          netSpread,
          reason: `跨交易所价差=${(spread * 100).toFixed(3)}%`,
        };
      }
    }

    return { type: SIGNAL_TYPE.NO_SIGNAL };
  }

  /**
   * 生成永续-现货套利信号
   */
  _generatePerpetualSpotSignal(pair, perpetualPrice, spotPrice) {
    // 计算基差
    const basis = SpreadCalculator.basis(perpetualPrice, spotPrice);

    // 年化基差
    const annualizedBasis = basis * 365 / 8; // 假设8小时结算

    pair.stats.currentBasis = basis;
    pair.stats.annualizedBasis = annualizedBasis;

    if (annualizedBasis > this.config.basisEntryThreshold) {
      // 正基差过大，做空永续做多现货
      return {
        type: SIGNAL_TYPE.OPEN_SHORT_SPREAD,
        basis,
        annualizedBasis,
        reason: `年化基差=${(annualizedBasis * 100).toFixed(2)}%`,
      };
    } else if (annualizedBasis < -this.config.basisEntryThreshold) {
      // 负基差过大，做多永续做空现货
      return {
        type: SIGNAL_TYPE.OPEN_LONG_SPREAD,
        basis,
        annualizedBasis,
        reason: `年化基差=${(annualizedBasis * 100).toFixed(2)}%`,
      };
    }

    return { type: SIGNAL_TYPE.NO_SIGNAL };
  }

  /**
   * 执行信号
   */
  async _executeSignal(pair, signal) {
    // 检查仓位限制
    if (!this._checkPositionLimits()) {
      return;
    }

    // 计算仓位大小
    const capital = this.getCapital();
    const positionValue = capital * this.config.maxPositionPerPair;

    const priceA = this.priceStore.getLatestPrice(pair.assetA);
    const priceB = this.priceStore.getLatestPrice(pair.assetB);

    if (!priceA || !priceB) return;

    // 计算各资产的数量 (使用beta调整)
    const { beta } = pair.stats;
    const totalValue = positionValue;

    // 根据beta分配资金
    // 如果beta=1，各占50%；如果beta=2，A占33%，B占67%
    const valueA = totalValue / (1 + Math.abs(beta));
    const valueB = totalValue - valueA;

    const amountA = valueA / priceA;
    const amountB = valueB / priceB;

    // 设置仓位
    const position = {
      type: signal.type,
      assetA: {
        symbol: pair.assetA,
        side: signal.type === SIGNAL_TYPE.OPEN_LONG_SPREAD ? 'long' : 'short',
        amount: amountA,
        entryPrice: priceA,
      },
      assetB: {
        symbol: pair.assetB,
        side: signal.type === SIGNAL_TYPE.OPEN_LONG_SPREAD ? 'short' : 'long',
        amount: amountB,
        entryPrice: priceB,
      },
      entryZScore: signal.zScore,
      entrySpread: signal.spread || pair.stats.currentSpread,
      entryTime: Date.now(),
      value: totalValue,
    };

    // 执行交易
    if (position.assetA.side === 'long') {
      this.buy(pair.assetA, amountA);
      this.sell(pair.assetB, amountB);
    } else {
      this.sell(pair.assetA, amountA);
      this.buy(pair.assetB, amountB);
    }

    // 更新配对仓位
    this.pairManager.setPosition(pair.id, position);

    // 设置信号
    this.setBuySignal(`${this.config.logPrefix} ${signal.reason}`);

    // 更新统计
    this.stats.totalSignals++;
    this.stats.totalTrades += 2;
    this.stats.lastTradeTime = Date.now();

    this.log(`开仓: ${pair.id} ${signal.type} - ${signal.reason}`, 'info');
  }

  /**
   * 检查仓位限制
   */
  _checkPositionLimits() {
    const pairsWithPositions = this.pairManager.getPairsWithPositions();

    // 检查配对数量限制
    if (pairsWithPositions.length >= this.config.maxActivePairs) {
      return false;
    }

    // 检查总仓位限制
    const capital = this.getCapital();
    const totalPositionValue = pairsWithPositions.reduce(
      (sum, p) => sum + (p.position?.value || 0), 0
    );

    if (totalPositionValue / capital >= this.config.maxTotalPosition) {
      return false;
    }

    return true;
  }

  /**
   * 管理现有仓位
   */
  async _managePositions() {
    const pairsWithPositions = this.pairManager.getPairsWithPositions();

    for (const pair of pairsWithPositions) {
      const shouldClose = this._checkCloseConditions(pair);

      if (shouldClose.close) {
        await this._closePosition(pair, shouldClose.reason);
      }
    }
  }

  /**
   * 检查平仓条件
   */
  _checkCloseConditions(pair) {
    const position = pair.position;
    if (!position) return { close: false };

    const { stats } = pair;
    const now = Date.now();

    // 获取当前价格
    const priceA = this.priceStore.getLatestPrice(pair.assetA);
    const priceB = this.priceStore.getLatestPrice(pair.assetB);

    if (!priceA || !priceB) return { close: false };

    // 1. 检查Z-Score回归
    if (this.config.arbType === STAT_ARB_TYPE.PAIRS_TRADING ||
        this.config.arbType === STAT_ARB_TYPE.COINTEGRATION) {

      const currentZScore = stats.currentZScore || 0;

      // 均值回归平仓
      if (Math.abs(currentZScore) <= this.config.exitZScore) {
        return { close: true, reason: '均值回归', pnl: 'profit' };
      }

      // 止损
      if (Math.abs(currentZScore) >= this.config.stopLossZScore) {
        return { close: true, reason: '止损', pnl: 'loss' };
      }
    }

    // 2. 检查跨交易所价差回归
    if (this.config.arbType === STAT_ARB_TYPE.CROSS_EXCHANGE) {
      const currentSpread = Math.abs(stats.currentSpread || 0);

      if (currentSpread <= this.config.spreadExitThreshold) {
        return { close: true, reason: '价差回归', pnl: 'profit' };
      }
    }

    // 3. 检查永续-现货基差回归
    if (this.config.arbType === STAT_ARB_TYPE.PERPETUAL_SPOT) {
      const currentAnnualizedBasis = Math.abs(stats.annualizedBasis || 0);

      if (currentAnnualizedBasis <= this.config.basisExitThreshold) {
        return { close: true, reason: '基差回归', pnl: 'profit' };
      }
    }

    // 4. 检查最大持仓时间
    if (now - position.entryTime >= this.config.maxHoldingPeriod) {
      return { close: true, reason: '持仓超时', pnl: 'timeout' };
    }

    // 5. 检查配对关系破裂
    if (pair.status === PAIR_STATUS.BROKEN) {
      return { close: true, reason: '配对关系破裂', pnl: 'unknown' };
    }

    // 6. 计算当前盈亏，检查止损
    const pnl = this._calculatePositionPnl(position, priceA, priceB);
    const pnlPercent = pnl / position.value;

    if (pnlPercent <= -this.config.maxLossPerPair) {
      return { close: true, reason: '最大亏损止损', pnl: 'loss' };
    }

    return { close: false };
  }

  /**
   * 计算仓位盈亏
   */
  _calculatePositionPnl(position, currentPriceA, currentPriceB) {
    const { assetA, assetB } = position;

    // 计算A的盈亏
    let pnlA;
    if (assetA.side === 'long') {
      pnlA = (currentPriceA - assetA.entryPrice) * assetA.amount;
    } else {
      pnlA = (assetA.entryPrice - currentPriceA) * assetA.amount;
    }

    // 计算B的盈亏
    let pnlB;
    if (assetB.side === 'long') {
      pnlB = (currentPriceB - assetB.entryPrice) * assetB.amount;
    } else {
      pnlB = (assetB.entryPrice - currentPriceB) * assetB.amount;
    }

    return pnlA + pnlB;
  }

  /**
   * 平仓
   */
  async _closePosition(pair, reason) {
    const position = pair.position;
    if (!position) return;

    // 获取当前价格
    const priceA = this.priceStore.getLatestPrice(pair.assetA);
    const priceB = this.priceStore.getLatestPrice(pair.assetB);

    // 计算盈亏
    const pnl = this._calculatePositionPnl(position, priceA, priceB);
    const isWin = pnl > 0;

    // 执行平仓
    this.closePosition(pair.assetA);
    this.closePosition(pair.assetB);

    // 更新统计
    this.stats.totalPnl += pnl;
    if (isWin) {
      this.stats.winCount++;
      this.stats.consecutiveLosses = 0;
    } else {
      this.stats.lossCount++;
      this.stats.consecutiveLosses++;

      // 检查是否需要冷却
      if (this.stats.consecutiveLosses >= this.config.consecutiveLossLimit) {
        this.coolingUntil = Date.now() + this.config.coolingPeriod;
        this.log(`连续亏损${this.stats.consecutiveLosses}次，进入冷却期`, 'warn');
      }
    }

    // 更新回撤
    this.stats.currentDrawdown = Math.min(this.stats.currentDrawdown + pnl, 0);
    this.stats.maxDrawdown = Math.min(this.stats.maxDrawdown, this.stats.currentDrawdown);

    // 记录配对交易结果
    this.pairManager.recordTradeResult(pair.id, pnl, isWin);

    // 清除仓位
    this.pairManager.setPosition(pair.id, null);

    // 设置信号
    this.setSellSignal(`${this.config.logPrefix} 平仓: ${reason}`);

    this.log(
      `平仓: ${pair.id} - ${reason} - PnL: ${pnl.toFixed(2)} (${isWin ? '盈利' : '亏损'})`,
      isWin ? 'info' : 'warn'
    );
  }

  /**
   * 处理资金费率更新 (用于永续-现货套利)
   */
  async onFundingRate(data) {
    if (this.config.arbType !== STAT_ARB_TYPE.PERPETUAL_SPOT) {
      return;
    }

    // 存储资金费率数据
    const symbol = data.symbol;
    const fundingRate = data.fundingRate;

    // 可以用于增强信号判断
    this.setState(`fundingRate:${symbol}`, {
      rate: fundingRate,
      timestamp: data.timestamp || Date.now(),
    });
  }

  /**
   * 强制重新分析所有配对
   */
  async reanalyzeAllPairs() {
    this.log('强制重新分析所有配对...', 'info');
    await this._updatePairs();
  }

  /**
   * 添加新配对
   */
  addPair(assetA, assetB) {
    const pair = this.pairManager.addPair(assetA, assetB);
    this.log(`手动添加配对: ${pair.id}`, 'info');
    return pair;
  }

  /**
   * 移除配对
   */
  removePair(pairId) {
    const pair = this.pairManager.getPair(pairId);
    if (pair && pair.position) {
      this.log(`无法移除有仓位的配对: ${pairId}`, 'warn');
      return false;
    }

    this.pairManager.deactivatePair(pairId);
    this.pairManager.pairs.delete(pairId);
    this.log(`移除配对: ${pairId}`, 'info');
    return true;
  }

  /**
   * 获取策略状态
   */
  getStatus() {
    const activePairs = this.pairManager.getActivePairs();
    const pairsWithPositions = this.pairManager.getPairsWithPositions();

    return {
      name: this.name,
      arbType: this.config.arbType,
      running: this.running,
      cooling: Date.now() < this.coolingUntil,
      coolingUntil: this.coolingUntil,
      pairs: {
        total: this.pairManager.pairs.size,
        active: activePairs.length,
        withPositions: pairsWithPositions.length,
      },
      stats: this.stats,
      winRate: this.stats.totalTrades > 0
        ? this.stats.winCount / (this.stats.winCount + this.stats.lossCount)
        : 0,
    };
  }

  /**
   * 获取配对详情
   */
  getPairDetails(pairId) {
    const pair = this.pairManager.getPair(pairId);
    if (!pair) return null;

    return {
      ...pair,
      currentPriceA: this.priceStore.getLatestPrice(pair.assetA),
      currentPriceB: this.priceStore.getLatestPrice(pair.assetB),
    };
  }

  /**
   * 获取所有配对摘要
   */
  getAllPairsSummary() {
    return this.pairManager.getAllPairs().map(pair => ({
      id: pair.id,
      assetA: pair.assetA,
      assetB: pair.assetB,
      status: pair.status,
      correlation: pair.stats.correlation?.toFixed(3),
      halfLife: pair.stats.halfLife?.toFixed(1),
      currentZScore: pair.stats.currentZScore?.toFixed(2),
      hasPosition: !!pair.position,
      performance: pair.performance,
    }));
  }

  /**
   * 结束策略
   */
  async onFinish() {
    this.running = false;

    // 平仓所有仓位
    const pairsWithPositions = this.pairManager.getPairsWithPositions();
    for (const pair of pairsWithPositions) {
      await this._closePosition(pair, '策略结束');
    }

    // 记录统计
    this.log(`策略结束统计:`, 'info');
    this.log(`  总信号数: ${this.stats.totalSignals}`, 'info');
    this.log(`  总交易数: ${this.stats.totalTrades}`, 'info');
    this.log(`  总盈亏: ${this.stats.totalPnl.toFixed(2)}`, 'info');
    this.log(`  胜率: ${((this.stats.winCount / (this.stats.winCount + this.stats.lossCount)) * 100 || 0).toFixed(1)}%`, 'info');
    this.log(`  最大回撤: ${(Math.abs(this.stats.maxDrawdown)).toFixed(2)}`, 'info');

    await super.onFinish();
  }

  /**
   * 日志输出
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
  DEFAULT_CONFIG as STAT_ARB_DEFAULT_CONFIG,
  PriceSeriesStore,
  StatisticalCalculator,
  PairManager,
  SpreadCalculator,
};

export default StatisticalArbitrageStrategy;
