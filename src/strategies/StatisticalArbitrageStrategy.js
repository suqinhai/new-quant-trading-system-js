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
import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 统计套利类型
 * Statistical arbitrage types
 */
export const STAT_ARB_TYPE = { // 导出常量 STAT_ARB_TYPE
  COINTEGRATION: 'cointegration',         // 协整交易
  PAIRS_TRADING: 'pairs_trading',          // 配对交易
  CROSS_EXCHANGE: 'cross_exchange',        // 跨交易所套利
  PERPETUAL_SPOT: 'perpetual_spot',        // 永续-现货基差
  TRIANGULAR: 'triangular',                // 三角套利
}; // 结束代码块

/**
 * 配对状态
 * Pair status
 */
export const PAIR_STATUS = { // 导出常量 PAIR_STATUS
  ACTIVE: 'active',           // 活跃
  SUSPENDED: 'suspended',     // 暂停
  BROKEN: 'broken',           // 关系破裂
  PENDING: 'pending',         // 待验证
}; // 结束代码块

/**
 * 信号类型
 * Signal types
 */
export const SIGNAL_TYPE = { // 导出常量 SIGNAL_TYPE
  OPEN_LONG_SPREAD: 'open_long_spread',   // 开多价差 (做多A，做空B)
  OPEN_SHORT_SPREAD: 'open_short_spread', // 开空价差 (做空A，做多B)
  CLOSE_SPREAD: 'close_spread',           // 平仓价差
  NO_SIGNAL: 'no_signal',                 // 无信号
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 策略类型配置 / Strategy Type Configuration
  // ============================================
  arbType: STAT_ARB_TYPE.PAIRS_TRADING, // 设置 arbType 字段

  // ============================================
  // 配对配置 / Pairs Configuration
  // ============================================

  // 候选配对列表 (可动态发现或手动指定)
  // 注意: 永续合约使用 BTC/USDT 格式 (不带 :USDT 后缀)
  candidatePairs: [ // 设置 candidatePairs 字段
    { assetA: 'BTC/USDT', assetB: 'ETH/USDT' }, // 执行语句
    { assetA: 'ETH/USDT', assetB: 'BNB/USDT' }, // 执行语句
    { assetA: 'SOL/USDT', assetB: 'AVAX/USDT' }, // 执行语句
  ], // 结束数组或索引

  // 最大同时持有配对数
  maxActivePairs: 5, // 设置 maxActivePairs 字段

  // 回看周期 (用于计算统计量)
  lookbackPeriod: 60, // 设置 lookbackPeriod 字段

  // 协整检验周期
  cointegrationTestPeriod: 100, // 设置 cointegrationTestPeriod 字段

  // ============================================
  // 协整检验配置 / Cointegration Test Configuration
  // ============================================

  // ADF检验显著性水平 (1%, 5%, 10%)
  adfSignificanceLevel: 0.05, // 设置 adfSignificanceLevel 字段

  // 最小相关性阈值 (用于初筛)
  minCorrelation: 0.7, // 设置 minCorrelation 字段

  // 半衰期限制 (天)
  minHalfLife: 1, // 设置 minHalfLife 字段
  maxHalfLife: 30, // 设置 maxHalfLife 字段

  // ============================================
  // 信号配置 / Signal Configuration
  // ============================================

  // Z-Score开仓阈值
  entryZScore: 2.0, // 设置 entryZScore 字段

  // Z-Score平仓阈值
  exitZScore: 0.5, // 设置 exitZScore 字段

  // Z-Score止损阈值
  stopLossZScore: 4.0, // 设置 stopLossZScore 字段

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
  symmetricPosition: true, // 设置 symmetricPosition 字段

  // ============================================
  // 风险控制 / Risk Control
  // ============================================

  // 单配对最大亏损
  maxLossPerPair: 0.02, // 2%

  // 总最大回撤
  maxDrawdown: 0.10, // 10%

  // 连续亏损次数触发冷却
  consecutiveLossLimit: 3, // 设置 consecutiveLossLimit 字段

  // 冷却时间
  coolingPeriod: 24 * 60 * 60 * 1000, // 24小时

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================
  verbose: true, // 设置 verbose 字段
  logPrefix: '[StatArb]', // 设置 logPrefix 字段
}; // 结束代码块

// ============================================
// 辅助类 / Helper Classes
// ============================================

/**
 * 价格序列存储
 * Price Series Store
 */
class PriceSeriesStore { // 定义类 PriceSeriesStore
  constructor(maxLength = 500) { // 构造函数
    this.maxLength = maxLength; // 设置 maxLength
    this.series = new Map(); // symbol -> { prices: [], timestamps: [] }
  } // 结束代码块

  /**
   * 添加价格
   */
  addPrice(symbol, price, timestamp = Date.now()) { // 调用 addPrice
    if (!this.series.has(symbol)) { // 条件判断 !this.series.has(symbol)
      this.series.set(symbol, { prices: [], timestamps: [] }); // 访问 series
    } // 结束代码块

    const data = this.series.get(symbol); // 定义常量 data
    data.prices.push(price); // 调用 data.prices.push
    data.timestamps.push(timestamp); // 调用 data.timestamps.push

    // 保持最大长度
    if (data.prices.length > this.maxLength) { // 条件判断 data.prices.length > this.maxLength
      data.prices.shift(); // 调用 data.prices.shift
      data.timestamps.shift(); // 调用 data.timestamps.shift
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取价格序列
   */
  getPrices(symbol, length = null) { // 调用 getPrices
    const data = this.series.get(symbol); // 定义常量 data
    if (!data) return []; // 条件判断 !data

    if (length) { // 条件判断 length
      return data.prices.slice(-length); // 返回结果
    } // 结束代码块
    return [...data.prices]; // 返回结果
  } // 结束代码块

  /**
   * 获取最新价格
   */
  getLatestPrice(symbol) { // 调用 getLatestPrice
    const data = this.series.get(symbol); // 定义常量 data
    if (!data || data.prices.length === 0) return null; // 条件判断 !data || data.prices.length === 0
    return data.prices[data.prices.length - 1]; // 返回结果
  } // 结束代码块

  /**
   * 检查是否有足够数据
   */
  hasEnoughData(symbol, requiredLength) { // 调用 hasEnoughData
    const data = this.series.get(symbol); // 定义常量 data
    return data && data.prices.length >= requiredLength; // 返回结果
  } // 结束代码块

  /**
   * 获取收益率序列
   */
  getReturns(symbol, length = null) { // 调用 getReturns
    const prices = this.getPrices(symbol, length ? length + 1 : null); // 定义常量 prices
    if (prices.length < 2) return []; // 条件判断 prices.length < 2

    const returns = []; // 定义常量 returns
    for (let i = 1; i < prices.length; i++) { // 循环 let i = 1; i < prices.length; i++
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]); // 调用 returns.push
    } // 结束代码块
    return returns; // 返回结果
  } // 结束代码块

  /**
   * 清除数据
   */
  clear(symbol = null) { // 调用 clear
    if (symbol) { // 条件判断 symbol
      this.series.delete(symbol); // 访问 series
    } else { // 执行语句
      this.series.clear(); // 访问 series
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 统计计算工具
 * Statistical Calculator
 */
class StatisticalCalculator { // 定义类 StatisticalCalculator
  /**
   * 计算均值
   */
  static mean(arr) { // 执行语句
    if (arr.length === 0) return 0; // 条件判断 arr.length === 0
    return arr.reduce((a, b) => a + b, 0) / arr.length; // 返回结果
  } // 结束代码块

  /**
   * 计算标准差
   */
  static std(arr) { // 执行语句
    if (arr.length < 2) return 0; // 条件判断 arr.length < 2
    const avg = this.mean(arr); // 定义常量 avg
    const squareDiffs = arr.map(x => Math.pow(x - avg, 2)); // 定义函数 squareDiffs
    return Math.sqrt(this.mean(squareDiffs)); // 返回结果
  } // 结束代码块

  /**
   * 计算Z-Score
   */
  static zScore(value, mean, std) { // 执行语句
    if (std === 0) return 0; // 条件判断 std === 0
    return (value - mean) / std; // 返回结果
  } // 结束代码块

  /**
   * 计算相关系数
   */
  static correlation(seriesA, seriesB) { // 执行语句
    const n = Math.min(seriesA.length, seriesB.length); // 定义常量 n
    if (n < 2) return 0; // 条件判断 n < 2

    const a = seriesA.slice(-n); // 定义常量 a
    const b = seriesB.slice(-n); // 定义常量 b

    const meanA = this.mean(a); // 定义常量 meanA
    const meanB = this.mean(b); // 定义常量 meanB

    let covariance = 0; // 定义变量 covariance
    let varA = 0; // 定义变量 varA
    let varB = 0; // 定义变量 varB

    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      const diffA = a[i] - meanA; // 定义常量 diffA
      const diffB = b[i] - meanB; // 定义常量 diffB
      covariance += diffA * diffB; // 执行语句
      varA += diffA * diffA; // 执行语句
      varB += diffB * diffB; // 执行语句
    } // 结束代码块

    const stdA = Math.sqrt(varA); // 定义常量 stdA
    const stdB = Math.sqrt(varB); // 定义常量 stdB

    if (stdA === 0 || stdB === 0) return 0; // 条件判断 stdA === 0 || stdB === 0
    return covariance / (stdA * stdB); // 返回结果
  } // 结束代码块

  /**
   * OLS回归 (y = alpha + beta * x)
   */
  static ols(x, y) { // 执行语句
    const n = Math.min(x.length, y.length); // 定义常量 n
    if (n < 2) return { alpha: 0, beta: 1, residuals: [] }; // 条件判断 n < 2

    const xSlice = x.slice(-n); // 定义常量 xSlice
    const ySlice = y.slice(-n); // 定义常量 ySlice

    const meanX = this.mean(xSlice); // 定义常量 meanX
    const meanY = this.mean(ySlice); // 定义常量 meanY

    let numerator = 0; // 定义变量 numerator
    let denominator = 0; // 定义变量 denominator

    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      const diffX = xSlice[i] - meanX; // 定义常量 diffX
      numerator += diffX * (ySlice[i] - meanY); // 执行语句
      denominator += diffX * diffX; // 执行语句
    } // 结束代码块

    const beta = denominator !== 0 ? numerator / denominator : 1; // 定义常量 beta
    const alpha = meanY - beta * meanX; // 定义常量 alpha

    // 计算残差
    const residuals = []; // 定义常量 residuals
    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      residuals.push(ySlice[i] - (alpha + beta * xSlice[i])); // 调用 residuals.push
    } // 结束代码块

    return { alpha, beta, residuals }; // 返回结果
  } // 结束代码块

  /**
   * 简化ADF检验 (Augmented Dickey-Fuller)
   * 返回是否平稳 (true表示平稳)
   *
   * 使用简化方法：检验残差是否表现出均值回归特性
   * - 计算残差的自相关性
   * - 检验Hurst指数
   */
  static adfTest(series, significance = 0.05) { // 执行语句
    if (series.length < 30) { // 条件判断 series.length < 30
      return { isStationary: false, testStat: 0, criticalValue: 0, pValue: 1 }; // 返回结果
    } // 结束代码块

    // 计算一阶差分
    const diff = []; // 定义常量 diff
    for (let i = 1; i < series.length; i++) { // 循环 let i = 1; i < series.length; i++
      diff.push(series[i] - series[i - 1]); // 调用 diff.push
    } // 结束代码块

    // 计算滞后项
    const lagged = series.slice(0, -1); // 定义常量 lagged

    // 运行回归: diff[t] = alpha + beta * series[t-1] + error
    const regression = this.ols(lagged, diff); // 定义常量 regression

    // 计算t统计量
    const residualStd = this.std(regression.residuals); // 定义常量 residualStd
    const laggedStd = this.std(lagged); // 定义常量 laggedStd
    const n = lagged.length; // 定义常量 n

    // 标准误差
    const se = residualStd / (laggedStd * Math.sqrt(n)); // 定义常量 se
    const tStat = se !== 0 ? regression.beta / se : 0; // 定义常量 tStat

    // ADF临界值 (近似值，用于n>100)
    // 1%: -3.43, 5%: -2.86, 10%: -2.57
    let criticalValue; // 定义变量 criticalValue
    if (significance <= 0.01) { // 条件判断 significance <= 0.01
      criticalValue = -3.43; // 赋值 criticalValue
    } else if (significance <= 0.05) { // 执行语句
      criticalValue = -2.86; // 赋值 criticalValue
    } else { // 执行语句
      criticalValue = -2.57; // 赋值 criticalValue
    } // 结束代码块

    // 如果t统计量小于临界值，则拒绝单位根假设，序列平稳
    const isStationary = tStat < criticalValue; // 定义常量 isStationary

    // 估算p值 (简化)
    let pValue; // 定义变量 pValue
    if (tStat < -3.43) { // 条件判断 tStat < -3.43
      pValue = 0.01; // 赋值 pValue
    } else if (tStat < -2.86) { // 执行语句
      pValue = 0.05; // 赋值 pValue
    } else if (tStat < -2.57) { // 执行语句
      pValue = 0.10; // 赋值 pValue
    } else { // 执行语句
      pValue = 0.5; // 赋值 pValue
    } // 结束代码块

    return { // 返回结果
      isStationary, // 执行语句
      testStat: tStat, // 设置 testStat 字段
      criticalValue, // 执行语句
      pValue, // 执行语句
      beta: regression.beta, // 设置 beta 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算半衰期 (Half-Life)
   * 基于OU过程的均值回归速度
   */
  static calculateHalfLife(series) { // 执行语句
    if (series.length < 10) return Infinity; // 条件判断 series.length < 10

    // 计算滞后回归: z[t] - z[t-1] = alpha + beta * z[t-1]
    const lagged = series.slice(0, -1); // 定义常量 lagged
    const diff = []; // 定义常量 diff
    for (let i = 1; i < series.length; i++) { // 循环 let i = 1; i < series.length; i++
      diff.push(series[i] - series[i - 1]); // 调用 diff.push
    } // 结束代码块

    const regression = this.ols(lagged, diff); // 定义常量 regression
    const lambda = -regression.beta; // 定义常量 lambda

    // 半衰期 = -ln(2) / ln(1 + beta)
    if (lambda <= 0 || lambda >= 1) { // 条件判断 lambda <= 0 || lambda >= 1
      return Infinity; // 不收敛
    } // 结束代码块

    const halfLife = -Math.log(2) / Math.log(1 - lambda); // 定义常量 halfLife
    return halfLife; // 返回结果
  } // 结束代码块

  /**
   * 计算Hurst指数 (均值回归强度)
   * H < 0.5: 均值回归
   * H = 0.5: 随机游走
   * H > 0.5: 趋势性
   */
  static hurstExponent(series, maxLag = 20) { // 执行语句
    if (series.length < maxLag * 2) return 0.5; // 条件判断 series.length < maxLag * 2

    const lags = []; // 定义常量 lags
    const rsValues = []; // 定义常量 rsValues

    for (let lag = 2; lag <= maxLag; lag++) { // 循环 let lag = 2; lag <= maxLag; lag++
      const rs = this._calculateRS(series, lag); // 定义常量 rs
      if (rs > 0) { // 条件判断 rs > 0
        lags.push(Math.log(lag)); // 调用 lags.push
        rsValues.push(Math.log(rs)); // 调用 rsValues.push
      } // 结束代码块
    } // 结束代码块

    if (lags.length < 3) return 0.5; // 条件判断 lags.length < 3

    // 线性回归得到H
    const regression = this.ols(lags, rsValues); // 定义常量 regression
    return Math.max(0, Math.min(1, regression.beta)); // 返回结果
  } // 结束代码块

  /**
   * 计算R/S统计量
   */
  static _calculateRS(series, lag) { // 执行语句
    const n = series.length; // 定义常量 n
    const numSubseries = Math.floor(n / lag); // 定义常量 numSubseries
    if (numSubseries < 1) return 0; // 条件判断 numSubseries < 1

    let totalRS = 0; // 定义变量 totalRS
    for (let i = 0; i < numSubseries; i++) { // 循环 let i = 0; i < numSubseries; i++
      const subseries = series.slice(i * lag, (i + 1) * lag); // 定义常量 subseries
      const mean = this.mean(subseries); // 定义常量 mean

      // 累积偏差
      let cumDev = 0; // 定义变量 cumDev
      let maxCumDev = -Infinity; // 定义变量 maxCumDev
      let minCumDev = Infinity; // 定义变量 minCumDev

      for (const val of subseries) { // 循环 const val of subseries
        cumDev += val - mean; // 执行语句
        maxCumDev = Math.max(maxCumDev, cumDev); // 赋值 maxCumDev
        minCumDev = Math.min(minCumDev, cumDev); // 赋值 minCumDev
      } // 结束代码块

      const R = maxCumDev - minCumDev; // 定义常量 R
      const S = this.std(subseries); // 定义常量 S

      if (S > 0) { // 条件判断 S > 0
        totalRS += R / S; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return totalRS / numSubseries; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 配对管理器
 * Pair Manager
 */
class PairManager extends EventEmitter { // 定义类 PairManager(继承EventEmitter)
  constructor(config) { // 构造函数
    super(); // 调用父类
    this.config = config; // 设置 config

    // 配对存储
    // 格式: pairId -> { assetA, assetB, status, stats, position, ... }
    this.pairs = new Map(); // 设置 pairs

    // 活跃配对ID列表
    this.activePairs = new Set(); // 设置 activePairs

    // 配对性能历史
    this.pairPerformance = new Map(); // 设置 pairPerformance
  } // 结束代码块

  /**
   * 生成配对ID
   */
  generatePairId(assetA, assetB) { // 调用 generatePairId
    // 确保一致的排序
    const sorted = [assetA, assetB].sort(); // 定义常量 sorted
    return `${sorted[0]}:${sorted[1]}`; // 返回结果
  } // 结束代码块

  /**
   * 添加配对
   */
  addPair(assetA, assetB, stats = {}) { // 调用 addPair
    const pairId = this.generatePairId(assetA, assetB); // 定义常量 pairId

    if (this.pairs.has(pairId)) { // 条件判断 this.pairs.has(pairId)
      // 更新现有配对
      const pair = this.pairs.get(pairId); // 定义常量 pair
      pair.stats = { ...pair.stats, ...stats }; // 赋值 pair.stats
      pair.lastUpdate = Date.now(); // 赋值 pair.lastUpdate
      return pair; // 返回结果
    } // 结束代码块

    const pair = { // 定义常量 pair
      id: pairId, // 设置 id 字段
      assetA, // 执行语句
      assetB, // 执行语句
      status: PAIR_STATUS.PENDING, // 设置 status 字段
      stats: { // 设置 stats 字段
        correlation: 0, // 设置 correlation 字段
        cointegration: null, // 设置 cointegration 字段
        halfLife: null, // 设置 halfLife 字段
        hurstExponent: null, // 设置 hurstExponent 字段
        beta: 1, // 设置 beta 字段
        alpha: 0, // 设置 alpha 字段
        spreadMean: 0, // 设置 spreadMean 字段
        spreadStd: 0, // 设置 spreadStd 字段
        ...stats, // 展开对象或数组
      }, // 结束代码块
      position: null, // 设置 position 字段
      openTime: null, // 设置 openTime 字段
      lastSignal: null, // 设置 lastSignal 字段
      performance: { // 设置 performance 字段
        totalTrades: 0, // 设置 totalTrades 字段
        winCount: 0, // 设置 winCount 字段
        lossCount: 0, // 设置 lossCount 字段
        totalPnl: 0, // 设置 totalPnl 字段
        maxDrawdown: 0, // 设置 maxDrawdown 字段
      }, // 结束代码块
      lastUpdate: Date.now(), // 设置 lastUpdate 字段
      createdAt: Date.now(), // 设置 createdAt 字段
    }; // 结束代码块

    this.pairs.set(pairId, pair); // 访问 pairs
    this.emit('pairAdded', pair); // 调用 emit

    return pair; // 返回结果
  } // 结束代码块

  /**
   * 更新配对统计
   */
  updatePairStats(pairId, stats) { // 调用 updatePairStats
    const pair = this.pairs.get(pairId); // 定义常量 pair
    if (!pair) return null; // 条件判断 !pair

    pair.stats = { ...pair.stats, ...stats }; // 赋值 pair.stats
    pair.lastUpdate = Date.now(); // 赋值 pair.lastUpdate

    // 检查配对是否仍然有效
    this._validatePair(pair); // 调用 _validatePair

    return pair; // 返回结果
  } // 结束代码块

  /**
   * 验证配对有效性
   */
  _validatePair(pair) { // 调用 _validatePair
    const { stats } = pair; // 解构赋值
    const { config } = this; // 解构赋值

    // 检查协整性
    if (stats.cointegration && !stats.cointegration.isStationary) { // 条件判断 stats.cointegration && !stats.cointegration.i...
      pair.status = PAIR_STATUS.BROKEN; // 赋值 pair.status
      this.deactivatePair(pair.id); // 调用 deactivatePair
      return false; // 返回结果
    } // 结束代码块

    // 检查相关性
    if (Math.abs(stats.correlation) < config.minCorrelation) { // 条件判断 Math.abs(stats.correlation) < config.minCorre...
      pair.status = PAIR_STATUS.SUSPENDED; // 赋值 pair.status
      return false; // 返回结果
    } // 结束代码块

    // 检查半衰期
    if (stats.halfLife) { // 条件判断 stats.halfLife
      if (stats.halfLife < config.minHalfLife || stats.halfLife > config.maxHalfLife) { // 条件判断 stats.halfLife < config.minHalfLife || stats....
        pair.status = PAIR_STATUS.SUSPENDED; // 赋值 pair.status
        return false; // 返回结果
      } // 结束代码块
    } // 结束代码块

    pair.status = PAIR_STATUS.ACTIVE; // 赋值 pair.status
    return true; // 返回结果
  } // 结束代码块

  /**
   * 激活配对
   */
  activatePair(pairId) { // 调用 activatePair
    const pair = this.pairs.get(pairId); // 定义常量 pair
    if (!pair) return false; // 条件判断 !pair

    if (this.activePairs.size >= this.config.maxActivePairs) { // 条件判断 this.activePairs.size >= this.config.maxActiv...
      return false; // 返回结果
    } // 结束代码块

    pair.status = PAIR_STATUS.ACTIVE; // 赋值 pair.status
    this.activePairs.add(pairId); // 访问 activePairs
    this.emit('pairActivated', pair); // 调用 emit

    return true; // 返回结果
  } // 结束代码块

  /**
   * 停用配对
   */
  deactivatePair(pairId) { // 调用 deactivatePair
    const pair = this.pairs.get(pairId); // 定义常量 pair
    if (!pair) return false; // 条件判断 !pair

    this.activePairs.delete(pairId); // 访问 activePairs
    this.emit('pairDeactivated', pair); // 调用 emit

    return true; // 返回结果
  } // 结束代码块

  /**
   * 设置配对仓位
   */
  setPosition(pairId, position) { // 调用 setPosition
    const pair = this.pairs.get(pairId); // 定义常量 pair
    if (!pair) return null; // 条件判断 !pair

    pair.position = position; // 赋值 pair.position
    if (position) { // 条件判断 position
      pair.openTime = Date.now(); // 赋值 pair.openTime
    } else { // 执行语句
      pair.openTime = null; // 赋值 pair.openTime
    } // 结束代码块

    return pair; // 返回结果
  } // 结束代码块

  /**
   * 记录配对交易结果
   */
  recordTradeResult(pairId, pnl, isWin) { // 调用 recordTradeResult
    const pair = this.pairs.get(pairId); // 定义常量 pair
    if (!pair) return; // 条件判断 !pair

    pair.performance.totalTrades++; // 执行语句
    pair.performance.totalPnl += pnl; // 执行语句

    if (isWin) { // 条件判断 isWin
      pair.performance.winCount++; // 执行语句
    } else { // 执行语句
      pair.performance.lossCount++; // 执行语句
    } // 结束代码块

    // 更新最大回撤
    if (pnl < 0) { // 条件判断 pnl < 0
      pair.performance.maxDrawdown = Math.max( // 赋值 pair.performance.maxDrawdown
        pair.performance.maxDrawdown, // 执行语句
        Math.abs(pnl) // 调用 Math.abs
      ); // 结束调用或参数
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取活跃配对
   */
  getActivePairs() { // 调用 getActivePairs
    return Array.from(this.activePairs) // 返回结果
      .map(id => this.pairs.get(id)) // 定义箭头函数
      .filter(p => p != null); // 定义箭头函数
  } // 结束代码块

  /**
   * 获取有仓位的配对
   */
  getPairsWithPositions() { // 调用 getPairsWithPositions
    return Array.from(this.pairs.values()) // 返回结果
      .filter(p => p.position != null); // 定义箭头函数
  } // 结束代码块

  /**
   * 获取配对
   */
  getPair(pairId) { // 调用 getPair
    return this.pairs.get(pairId); // 返回结果
  } // 结束代码块

  /**
   * 获取所有配对
   */
  getAllPairs() { // 调用 getAllPairs
    return Array.from(this.pairs.values()); // 返回结果
  } // 结束代码块

  /**
   * 清除所有配对
   */
  clear() { // 调用 clear
    this.pairs.clear(); // 访问 pairs
    this.activePairs.clear(); // 访问 activePairs
    this.pairPerformance.clear(); // 访问 pairPerformance
  } // 结束代码块
} // 结束代码块

/**
 * 价差计算器
 * Spread Calculator
 */
class SpreadCalculator { // 定义类 SpreadCalculator
  /**
   * 计算价格比率价差 (Price Ratio Spread)
   * spread = price_A / price_B
   */
  static ratioSpread(priceA, priceB) { // 执行语句
    if (priceB === 0) return 0; // 条件判断 priceB === 0
    return priceA / priceB; // 返回结果
  } // 结束代码块

  /**
   * 计算对数价差 (Log Spread)
   * spread = log(price_A) - beta * log(price_B)
   */
  static logSpread(priceA, priceB, beta = 1) { // 执行语句
    if (priceA <= 0 || priceB <= 0) return 0; // 条件判断 priceA <= 0 || priceB <= 0
    return Math.log(priceA) - beta * Math.log(priceB); // 返回结果
  } // 结束代码块

  /**
   * 计算回归残差价差 (Regression Residual Spread)
   * spread = price_A - (alpha + beta * price_B)
   */
  static residualSpread(priceA, priceB, alpha, beta) { // 执行语句
    return priceA - (alpha + beta * priceB); // 返回结果
  } // 结束代码块

  /**
   * 计算百分比价差 (Percentage Spread)
   * 用于跨交易所套利
   */
  static percentageSpread(priceA, priceB) { // 执行语句
    if (priceB === 0) return 0; // 条件判断 priceB === 0
    return (priceA - priceB) / priceB; // 返回结果
  } // 结束代码块

  /**
   * 计算基差 (Basis)
   * 用于永续-现货套利
   * basis = (perpetual_price - spot_price) / spot_price
   */
  static basis(perpetualPrice, spotPrice) { // 执行语句
    if (spotPrice === 0) return 0; // 条件判断 spotPrice === 0
    return (perpetualPrice - spotPrice) / spotPrice; // 返回结果
  } // 结束代码块

  /**
   * 计算年化基差
   */
  static annualizedBasis(basis, daysToExpiry = 365) { // 执行语句
    return basis * (365 / daysToExpiry); // 返回结果
  } // 结束代码块
} // 结束代码块

// ============================================
// 主策略类 / Main Strategy Class
// ============================================

/**
 * 统计套利策略
 * Statistical Arbitrage Strategy
 */
export class StatisticalArbitrageStrategy extends BaseStrategy { // 导出类 StatisticalArbitrageStrategy
  /**
   * 构造函数
   * Constructor
   */
  constructor(params = {}) { // 构造函数
    // 合并配置
    const config = { ...DEFAULT_CONFIG, ...params }; // 定义常量 config
    super(config); // 调用父类

    // 设置策略名称
    this.name = params.name || 'StatisticalArbitrageStrategy'; // 设置 name

    // 保存配置
    this.config = config; // 设置 config

    // 价格序列存储
    this.priceStore = new PriceSeriesStore(config.cointegrationTestPeriod * 2); // 设置 priceStore

    // 配对管理器
    this.pairManager = new PairManager(config); // 设置 pairManager

    // 是否运行中
    this.running = false; // 设置 running

    // 统计数据
    this.stats = { // 设置 stats
      totalSignals: 0, // 设置 totalSignals 字段
      totalTrades: 0, // 设置 totalTrades 字段
      totalPnl: 0, // 设置 totalPnl 字段
      winCount: 0, // 设置 winCount 字段
      lossCount: 0, // 设置 lossCount 字段
      currentDrawdown: 0, // 设置 currentDrawdown 字段
      maxDrawdown: 0, // 设置 maxDrawdown 字段
      consecutiveLosses: 0, // 设置 consecutiveLosses 字段
      lastTradeTime: null, // 设置 lastTradeTime 字段
    }; // 结束代码块

    // 冷却状态
    this.coolingUntil = 0; // 设置 coolingUntil

    // 设置事件监听
    this._setupEventListeners(); // 调用 _setupEventListeners
  } // 结束代码块

  /**
   * 设置事件监听
   */
  _setupEventListeners() { // 调用 _setupEventListeners
    this.pairManager.on('pairAdded', (pair) => { // 访问 pairManager
      this.log(`新配对添加: ${pair.id}`, 'info'); // 调用 log
    }); // 结束代码块

    this.pairManager.on('pairActivated', (pair) => { // 访问 pairManager
      this.log(`配对激活: ${pair.id}`, 'info'); // 调用 log
    }); // 结束代码块

    this.pairManager.on('pairDeactivated', (pair) => { // 访问 pairManager
      this.log(`配对停用: ${pair.id}`, 'info'); // 调用 log
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 统计套利策略需要 Ticker 和 K 线数据 / Statistical arbitrage needs ticker and kline
    return ['ticker', 'kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化策略
   */
  async onInit() { // 执行语句
    this.log(`策略初始化: ${this.name}`, 'info'); // 调用 log
    this.log(`套利类型: ${this.config.arbType}`, 'info'); // 调用 log
    this.log(`候选配对数: ${this.config.candidatePairs.length}`, 'info'); // 调用 log

    // 初始化候选配对
    for (const pair of this.config.candidatePairs) { // 循环 const pair of this.config.candidatePairs
      this.pairManager.addPair(pair.assetA, pair.assetB); // 访问 pairManager
    } // 结束代码块

    await super.onInit(); // 等待异步结果
    this.running = true; // 设置 running
  } // 结束代码块

  /**
   * 处理K线更新
   */
  async onTick(candle, history) { // 执行语句
    if (!this.running) return; // 条件判断 !this.running

    // 检查冷却期
    if (Date.now() < this.coolingUntil) { // 条件判断 Date.now() < this.coolingUntil
      return; // 返回结果
    } // 结束代码块

    const symbol = candle.symbol; // 定义常量 symbol
    if (!symbol) return; // 条件判断 !symbol

    // 更新价格存储
    this.priceStore.addPrice(symbol, candle.close, candle.timestamp); // 访问 priceStore

    // 检查并更新所有配对
    await this._updatePairs(); // 等待异步结果

    // 检查信号
    await this._checkSignals(); // 等待异步结果

    // 管理现有仓位
    await this._managePositions(); // 等待异步结果
  } // 结束代码块

  /**
   * 处理多资产K线更新 (实盘/影子模式)
   */
  async onCandle(data) { // 执行语句
    if (!this.running) return; // 条件判断 !this.running

    const symbol = data.symbol; // 定义常量 symbol
    if (!symbol) return; // 条件判断 !symbol

    // 更新价格存储
    this.priceStore.addPrice(symbol, data.close, data.timestamp || Date.now()); // 访问 priceStore

    // 检查是否需要更新配对
    // 只在有足够数据时更新
    const allSymbols = this._getAllSymbols(); // 定义常量 allSymbols
    const hasEnoughData = allSymbols.every(s => // 定义函数 hasEnoughData
      this.priceStore.hasEnoughData(s, this.config.lookbackPeriod) // 访问 priceStore
    ); // 结束调用或参数

    if (hasEnoughData) { // 条件判断 hasEnoughData
      await this._updatePairs(); // 等待异步结果
      await this._checkSignals(); // 等待异步结果
      await this._managePositions(); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取所有涉及的交易对
   */
  _getAllSymbols() { // 调用 _getAllSymbols
    const symbols = new Set(); // 定义常量 symbols
    for (const pair of this.config.candidatePairs) { // 循环 const pair of this.config.candidatePairs
      symbols.add(pair.assetA); // 调用 symbols.add
      symbols.add(pair.assetB); // 调用 symbols.add
    } // 结束代码块
    return Array.from(symbols); // 返回结果
  } // 结束代码块

  /**
   * 获取策略所需的所有交易对 (覆盖基类方法)
   * Get all symbols required by the strategy (override base class)
   *
   * 统计套利策略需要订阅所有配对中的交易对
   * Statistical arbitrage strategy needs to subscribe all symbols in pairs
   *
   * @returns {Array<string>} 交易对列表 / Symbol list
   */
  getRequiredSymbols() { // 调用 getRequiredSymbols
    return this._getAllSymbols(); // 返回结果
  } // 结束代码块

  /**
   * 更新配对统计信息
   */
  async _updatePairs() { // 执行语句
    const pairs = this.pairManager.getAllPairs(); // 定义常量 pairs

    for (const pair of pairs) { // 循环 const pair of pairs
      // 检查是否有足够数据
      if (!this.priceStore.hasEnoughData(pair.assetA, this.config.lookbackPeriod) || // 条件判断 !this.priceStore.hasEnoughData(pair.assetA, t...
          !this.priceStore.hasEnoughData(pair.assetB, this.config.lookbackPeriod)) { // 执行语句
        continue; // 继续下一轮循环
      } // 结束代码块

      // 获取价格序列
      const pricesA = this.priceStore.getPrices(pair.assetA, this.config.cointegrationTestPeriod); // 定义常量 pricesA
      const pricesB = this.priceStore.getPrices(pair.assetB, this.config.cointegrationTestPeriod); // 定义常量 pricesB

      // 计算相关性
      const correlation = StatisticalCalculator.correlation(pricesA, pricesB); // 定义常量 correlation

      // 计算OLS回归参数
      const regression = StatisticalCalculator.ols(pricesB, pricesA); // 定义常量 regression
      const { alpha, beta, residuals } = regression; // 解构赋值

      // 计算价差统计
      const spreadMean = StatisticalCalculator.mean(residuals); // 定义常量 spreadMean
      const spreadStd = StatisticalCalculator.std(residuals); // 定义常量 spreadStd

      // 进行协整检验
      const cointegration = StatisticalCalculator.adfTest( // 定义常量 cointegration
        residuals, // 执行语句
        this.config.adfSignificanceLevel // 访问 config
      ); // 结束调用或参数

      // 计算半衰期
      const halfLife = StatisticalCalculator.calculateHalfLife(residuals); // 定义常量 halfLife

      // 计算Hurst指数
      const hurstExponent = StatisticalCalculator.hurstExponent(residuals); // 定义常量 hurstExponent

      // 更新配对统计
      this.pairManager.updatePairStats(pair.id, { // 访问 pairManager
        correlation, // 执行语句
        alpha, // 执行语句
        beta, // 执行语句
        spreadMean, // 执行语句
        spreadStd, // 执行语句
        cointegration, // 执行语句
        halfLife, // 执行语句
        hurstExponent, // 执行语句
        lastAnalysisTime: Date.now(), // 设置 lastAnalysisTime 字段
      }); // 结束代码块

      // 如果通过协整检验，激活配对
      if (cointegration.isStationary && // 条件判断 cointegration.isStationary &&
          Math.abs(correlation) >= this.config.minCorrelation && // 调用 Math.abs
          halfLife >= this.config.minHalfLife && // 执行语句
          halfLife <= this.config.maxHalfLife) { // 执行语句

        if (pair.status !== PAIR_STATUS.ACTIVE) { // 条件判断 pair.status !== PAIR_STATUS.ACTIVE
          this.pairManager.activatePair(pair.id); // 访问 pairManager
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查交易信号
   */
  async _checkSignals() { // 执行语句
    const activePairs = this.pairManager.getActivePairs(); // 定义常量 activePairs

    for (const pair of activePairs) { // 循环 const pair of activePairs
      // 跳过已有仓位的配对
      if (pair.position) continue; // 条件判断 pair.position

      // 获取当前信号
      const signal = this._generateSignal(pair); // 定义常量 signal

      if (signal.type !== SIGNAL_TYPE.NO_SIGNAL) { // 条件判断 signal.type !== SIGNAL_TYPE.NO_SIGNAL
        await this._executeSignal(pair, signal); // 等待异步结果
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 生成交易信号
   */
  _generateSignal(pair) { // 调用 _generateSignal
    const { stats } = pair; // 解构赋值

    // 获取当前价格
    const priceA = this.priceStore.getLatestPrice(pair.assetA); // 定义常量 priceA
    const priceB = this.priceStore.getLatestPrice(pair.assetB); // 定义常量 priceB

    if (!priceA || !priceB) { // 条件判断 !priceA || !priceB
      return { type: SIGNAL_TYPE.NO_SIGNAL }; // 返回结果
    } // 结束代码块

    // 根据套利类型生成信号
    switch (this.config.arbType) { // 分支选择 this.config.arbType
      case STAT_ARB_TYPE.PAIRS_TRADING: // 分支 STAT_ARB_TYPE.PAIRS_TRADING
      case STAT_ARB_TYPE.COINTEGRATION: // 分支 STAT_ARB_TYPE.COINTEGRATION
        return this._generatePairsSignal(pair, priceA, priceB, stats); // 返回结果

      case STAT_ARB_TYPE.CROSS_EXCHANGE: // 分支 STAT_ARB_TYPE.CROSS_EXCHANGE
        return this._generateCrossExchangeSignal(pair, priceA, priceB); // 返回结果

      case STAT_ARB_TYPE.PERPETUAL_SPOT: // 分支 STAT_ARB_TYPE.PERPETUAL_SPOT
        return this._generatePerpetualSpotSignal(pair, priceA, priceB); // 返回结果

      default: // 默认分支
        return { type: SIGNAL_TYPE.NO_SIGNAL }; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 生成配对交易信号 (基于Z-Score)
   */
  _generatePairsSignal(pair, priceA, priceB, stats) { // 调用 _generatePairsSignal
    // 计算当前价差
    const currentSpread = SpreadCalculator.residualSpread( // 定义常量 currentSpread
      priceA, priceB, stats.alpha, stats.beta // 执行语句
    ); // 结束调用或参数

    // 计算Z-Score
    const zScore = StatisticalCalculator.zScore( // 定义常量 zScore
      currentSpread, // 执行语句
      stats.spreadMean, // 执行语句
      stats.spreadStd // 执行语句
    ); // 结束调用或参数

    // 保存当前Z-Score
    pair.stats.currentZScore = zScore; // 赋值 pair.stats.currentZScore
    pair.stats.currentSpread = currentSpread; // 赋值 pair.stats.currentSpread

    // 生成信号
    if (zScore >= this.config.entryZScore) { // 条件判断 zScore >= this.config.entryZScore
      // 价差过高，做空价差 (做空A，做多B)
      return { // 返回结果
        type: SIGNAL_TYPE.OPEN_SHORT_SPREAD, // 设置 type 字段
        zScore, // 执行语句
        spread: currentSpread, // 设置 spread 字段
        reason: `Z-Score=${zScore.toFixed(2)} >= ${this.config.entryZScore}`, // 设置 reason 字段
      }; // 结束代码块
    } else if (zScore <= -this.config.entryZScore) { // 执行语句
      // 价差过低，做多价差 (做多A，做空B)
      return { // 返回结果
        type: SIGNAL_TYPE.OPEN_LONG_SPREAD, // 设置 type 字段
        zScore, // 执行语句
        spread: currentSpread, // 设置 spread 字段
        reason: `Z-Score=${zScore.toFixed(2)} <= -${this.config.entryZScore}`, // 设置 reason 字段
      }; // 结束代码块
    } // 结束代码块

    return { type: SIGNAL_TYPE.NO_SIGNAL }; // 返回结果
  } // 结束代码块

  /**
   * 生成跨交易所套利信号
   */
  _generateCrossExchangeSignal(pair, priceA, priceB) { // 调用 _generateCrossExchangeSignal
    // 计算百分比价差
    const spread = SpreadCalculator.percentageSpread(priceA, priceB); // 定义常量 spread

    // 考虑交易成本
    const netSpread = Math.abs(spread) - 2 * this.config.tradingCost - 2 * this.config.slippageEstimate; // 定义常量 netSpread

    pair.stats.currentSpread = spread; // 赋值 pair.stats.currentSpread
    pair.stats.netSpread = netSpread; // 赋值 pair.stats.netSpread

    if (netSpread > this.config.spreadEntryThreshold) { // 条件判断 netSpread > this.config.spreadEntryThreshold
      if (spread > 0) { // 条件判断 spread > 0
        // A价格高于B，做空A做多B
        return { // 返回结果
          type: SIGNAL_TYPE.OPEN_SHORT_SPREAD, // 设置 type 字段
          spread, // 执行语句
          netSpread, // 执行语句
          reason: `跨交易所价差=${(spread * 100).toFixed(3)}%`, // 设置 reason 字段
        }; // 结束代码块
      } else { // 执行语句
        // B价格高于A，做多A做空B
        return { // 返回结果
          type: SIGNAL_TYPE.OPEN_LONG_SPREAD, // 设置 type 字段
          spread, // 执行语句
          netSpread, // 执行语句
          reason: `跨交易所价差=${(spread * 100).toFixed(3)}%`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return { type: SIGNAL_TYPE.NO_SIGNAL }; // 返回结果
  } // 结束代码块

  /**
   * 生成永续-现货套利信号
   */
  _generatePerpetualSpotSignal(pair, perpetualPrice, spotPrice) { // 调用 _generatePerpetualSpotSignal
    // 计算基差
    const basis = SpreadCalculator.basis(perpetualPrice, spotPrice); // 定义常量 basis

    // 年化基差
    const annualizedBasis = basis * 365 / 8; // 假设8小时结算

    pair.stats.currentBasis = basis; // 赋值 pair.stats.currentBasis
    pair.stats.annualizedBasis = annualizedBasis; // 赋值 pair.stats.annualizedBasis

    if (annualizedBasis > this.config.basisEntryThreshold) { // 条件判断 annualizedBasis > this.config.basisEntryThres...
      // 正基差过大，做空永续做多现货
      return { // 返回结果
        type: SIGNAL_TYPE.OPEN_SHORT_SPREAD, // 设置 type 字段
        basis, // 执行语句
        annualizedBasis, // 执行语句
        reason: `年化基差=${(annualizedBasis * 100).toFixed(2)}%`, // 设置 reason 字段
      }; // 结束代码块
    } else if (annualizedBasis < -this.config.basisEntryThreshold) { // 执行语句
      // 负基差过大，做多永续做空现货
      return { // 返回结果
        type: SIGNAL_TYPE.OPEN_LONG_SPREAD, // 设置 type 字段
        basis, // 执行语句
        annualizedBasis, // 执行语句
        reason: `年化基差=${(annualizedBasis * 100).toFixed(2)}%`, // 设置 reason 字段
      }; // 结束代码块
    } // 结束代码块

    return { type: SIGNAL_TYPE.NO_SIGNAL }; // 返回结果
  } // 结束代码块

  /**
   * 执行信号
   */
  async _executeSignal(pair, signal) { // 执行语句
    // 检查仓位限制
    if (!this._checkPositionLimits()) { // 条件判断 !this._checkPositionLimits()
      return; // 返回结果
    } // 结束代码块

    // 计算仓位大小
    const capital = this.getCapital(); // 定义常量 capital
    const positionValue = capital * this.config.maxPositionPerPair; // 定义常量 positionValue

    const priceA = this.priceStore.getLatestPrice(pair.assetA); // 定义常量 priceA
    const priceB = this.priceStore.getLatestPrice(pair.assetB); // 定义常量 priceB

    if (!priceA || !priceB) return; // 条件判断 !priceA || !priceB

    // 计算各资产的数量 (使用beta调整)
    const { beta } = pair.stats; // 解构赋值
    const totalValue = positionValue; // 定义常量 totalValue

    // 根据beta分配资金
    // 如果beta=1，各占50%；如果beta=2，A占33%，B占67%
    const valueA = totalValue / (1 + Math.abs(beta)); // 定义常量 valueA
    const valueB = totalValue - valueA; // 定义常量 valueB

    const amountA = valueA / priceA; // 定义常量 amountA
    const amountB = valueB / priceB; // 定义常量 amountB

    // 设置仓位
    const position = { // 定义常量 position
      type: signal.type, // 设置 type 字段
      assetA: { // 设置 assetA 字段
        symbol: pair.assetA, // 设置 symbol 字段
        side: signal.type === SIGNAL_TYPE.OPEN_LONG_SPREAD ? 'long' : 'short', // 设置 side 字段
        amount: amountA, // 设置 amount 字段
        entryPrice: priceA, // 设置 entryPrice 字段
      }, // 结束代码块
      assetB: { // 设置 assetB 字段
        symbol: pair.assetB, // 设置 symbol 字段
        side: signal.type === SIGNAL_TYPE.OPEN_LONG_SPREAD ? 'short' : 'long', // 设置 side 字段
        amount: amountB, // 设置 amount 字段
        entryPrice: priceB, // 设置 entryPrice 字段
      }, // 结束代码块
      entryZScore: signal.zScore, // 设置 entryZScore 字段
      entrySpread: signal.spread || pair.stats.currentSpread, // 设置 entrySpread 字段
      entryTime: Date.now(), // 设置 entryTime 字段
      value: totalValue, // 设置 value 字段
    }; // 结束代码块

    // 执行交易
    if (position.assetA.side === 'long') { // 条件判断 position.assetA.side === 'long'
      this.buy(pair.assetA, amountA); // 调用 buy
      this.sell(pair.assetB, amountB); // 调用 sell
    } else { // 执行语句
      this.sell(pair.assetA, amountA); // 调用 sell
      this.buy(pair.assetB, amountB); // 调用 buy
    } // 结束代码块

    // 更新配对仓位
    this.pairManager.setPosition(pair.id, position); // 访问 pairManager

    // 设置信号
    this.setBuySignal(`${this.config.logPrefix} ${signal.reason}`); // 调用 setBuySignal

    // 更新统计
    this.stats.totalSignals++; // 访问 stats
    this.stats.totalTrades += 2; // 访问 stats
    this.stats.lastTradeTime = Date.now(); // 访问 stats

    this.log(`开仓: ${pair.id} ${signal.type} - ${signal.reason}`, 'info'); // 调用 log
  } // 结束代码块

  /**
   * 检查仓位限制
   */
  _checkPositionLimits() { // 调用 _checkPositionLimits
    const pairsWithPositions = this.pairManager.getPairsWithPositions(); // 定义常量 pairsWithPositions

    // 检查配对数量限制
    if (pairsWithPositions.length >= this.config.maxActivePairs) { // 条件判断 pairsWithPositions.length >= this.config.maxA...
      return false; // 返回结果
    } // 结束代码块

    // 检查总仓位限制
    const capital = this.getCapital(); // 定义常量 capital
    const totalPositionValue = pairsWithPositions.reduce( // 定义常量 totalPositionValue
      (sum, p) => sum + (p.position?.value || 0), 0 // 定义箭头函数
    ); // 结束调用或参数

    if (totalPositionValue / capital >= this.config.maxTotalPosition) { // 条件判断 totalPositionValue / capital >= this.config.m...
      return false; // 返回结果
    } // 结束代码块

    return true; // 返回结果
  } // 结束代码块

  /**
   * 管理现有仓位
   */
  async _managePositions() { // 执行语句
    const pairsWithPositions = this.pairManager.getPairsWithPositions(); // 定义常量 pairsWithPositions

    for (const pair of pairsWithPositions) { // 循环 const pair of pairsWithPositions
      const shouldClose = this._checkCloseConditions(pair); // 定义常量 shouldClose

      if (shouldClose.close) { // 条件判断 shouldClose.close
        await this._closePosition(pair, shouldClose.reason); // 等待异步结果
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查平仓条件
   */
  _checkCloseConditions(pair) { // 调用 _checkCloseConditions
    const position = pair.position; // 定义常量 position
    if (!position) return { close: false }; // 条件判断 !position

    const { stats } = pair; // 解构赋值
    const now = Date.now(); // 定义常量 now

    // 获取当前价格
    const priceA = this.priceStore.getLatestPrice(pair.assetA); // 定义常量 priceA
    const priceB = this.priceStore.getLatestPrice(pair.assetB); // 定义常量 priceB

    if (!priceA || !priceB) return { close: false }; // 条件判断 !priceA || !priceB

    // 1. 检查Z-Score回归
    if (this.config.arbType === STAT_ARB_TYPE.PAIRS_TRADING || // 条件判断 this.config.arbType === STAT_ARB_TYPE.PAIRS_T...
        this.config.arbType === STAT_ARB_TYPE.COINTEGRATION) { // 访问 config

      const currentZScore = stats.currentZScore || 0; // 定义常量 currentZScore

      // 均值回归平仓
      if (Math.abs(currentZScore) <= this.config.exitZScore) { // 条件判断 Math.abs(currentZScore) <= this.config.exitZS...
        return { close: true, reason: '均值回归', pnl: 'profit' }; // 返回结果
      } // 结束代码块

      // 止损
      if (Math.abs(currentZScore) >= this.config.stopLossZScore) { // 条件判断 Math.abs(currentZScore) >= this.config.stopLo...
        return { close: true, reason: '止损', pnl: 'loss' }; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 2. 检查跨交易所价差回归
    if (this.config.arbType === STAT_ARB_TYPE.CROSS_EXCHANGE) { // 条件判断 this.config.arbType === STAT_ARB_TYPE.CROSS_E...
      const currentSpread = Math.abs(stats.currentSpread || 0); // 定义常量 currentSpread

      if (currentSpread <= this.config.spreadExitThreshold) { // 条件判断 currentSpread <= this.config.spreadExitThreshold
        return { close: true, reason: '价差回归', pnl: 'profit' }; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 3. 检查永续-现货基差回归
    if (this.config.arbType === STAT_ARB_TYPE.PERPETUAL_SPOT) { // 条件判断 this.config.arbType === STAT_ARB_TYPE.PERPETU...
      const currentAnnualizedBasis = Math.abs(stats.annualizedBasis || 0); // 定义常量 currentAnnualizedBasis

      if (currentAnnualizedBasis <= this.config.basisExitThreshold) { // 条件判断 currentAnnualizedBasis <= this.config.basisEx...
        return { close: true, reason: '基差回归', pnl: 'profit' }; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 4. 检查最大持仓时间
    if (now - position.entryTime >= this.config.maxHoldingPeriod) { // 条件判断 now - position.entryTime >= this.config.maxHo...
      return { close: true, reason: '持仓超时', pnl: 'timeout' }; // 返回结果
    } // 结束代码块

    // 5. 检查配对关系破裂
    if (pair.status === PAIR_STATUS.BROKEN) { // 条件判断 pair.status === PAIR_STATUS.BROKEN
      return { close: true, reason: '配对关系破裂', pnl: 'unknown' }; // 返回结果
    } // 结束代码块

    // 6. 计算当前盈亏，检查止损
    const pnl = this._calculatePositionPnl(position, priceA, priceB); // 定义常量 pnl
    const pnlPercent = pnl / position.value; // 定义常量 pnlPercent

    if (pnlPercent <= -this.config.maxLossPerPair) { // 条件判断 pnlPercent <= -this.config.maxLossPerPair
      return { close: true, reason: '最大亏损止损', pnl: 'loss' }; // 返回结果
    } // 结束代码块

    return { close: false }; // 返回结果
  } // 结束代码块

  /**
   * 计算仓位盈亏
   */
  _calculatePositionPnl(position, currentPriceA, currentPriceB) { // 调用 _calculatePositionPnl
    const { assetA, assetB } = position; // 解构赋值

    // 计算A的盈亏
    let pnlA; // 定义变量 pnlA
    if (assetA.side === 'long') { // 条件判断 assetA.side === 'long'
      pnlA = (currentPriceA - assetA.entryPrice) * assetA.amount; // 赋值 pnlA
    } else { // 执行语句
      pnlA = (assetA.entryPrice - currentPriceA) * assetA.amount; // 赋值 pnlA
    } // 结束代码块

    // 计算B的盈亏
    let pnlB; // 定义变量 pnlB
    if (assetB.side === 'long') { // 条件判断 assetB.side === 'long'
      pnlB = (currentPriceB - assetB.entryPrice) * assetB.amount; // 赋值 pnlB
    } else { // 执行语句
      pnlB = (assetB.entryPrice - currentPriceB) * assetB.amount; // 赋值 pnlB
    } // 结束代码块

    return pnlA + pnlB; // 返回结果
  } // 结束代码块

  /**
   * 平仓
   */
  async _closePosition(pair, reason) { // 执行语句
    const position = pair.position; // 定义常量 position
    if (!position) return; // 条件判断 !position

    // 获取当前价格
    const priceA = this.priceStore.getLatestPrice(pair.assetA); // 定义常量 priceA
    const priceB = this.priceStore.getLatestPrice(pair.assetB); // 定义常量 priceB

    // 计算盈亏
    const pnl = this._calculatePositionPnl(position, priceA, priceB); // 定义常量 pnl
    const isWin = pnl > 0; // 定义常量 isWin

    // 执行平仓
    this.closePosition(pair.assetA); // 调用 closePosition
    this.closePosition(pair.assetB); // 调用 closePosition

    // 更新统计
    this.stats.totalPnl += pnl; // 访问 stats
    if (isWin) { // 条件判断 isWin
      this.stats.winCount++; // 访问 stats
      this.stats.consecutiveLosses = 0; // 访问 stats
    } else { // 执行语句
      this.stats.lossCount++; // 访问 stats
      this.stats.consecutiveLosses++; // 访问 stats

      // 检查是否需要冷却
      if (this.stats.consecutiveLosses >= this.config.consecutiveLossLimit) { // 条件判断 this.stats.consecutiveLosses >= this.config.c...
        this.coolingUntil = Date.now() + this.config.coolingPeriod; // 设置 coolingUntil
        this.log(`连续亏损${this.stats.consecutiveLosses}次，进入冷却期`, 'warn'); // 调用 log
      } // 结束代码块
    } // 结束代码块

    // 更新回撤
    this.stats.currentDrawdown = Math.min(this.stats.currentDrawdown + pnl, 0); // 访问 stats
    this.stats.maxDrawdown = Math.min(this.stats.maxDrawdown, this.stats.currentDrawdown); // 访问 stats

    // 记录配对交易结果
    this.pairManager.recordTradeResult(pair.id, pnl, isWin); // 访问 pairManager

    // 清除仓位
    this.pairManager.setPosition(pair.id, null); // 访问 pairManager

    // 设置信号
    this.setSellSignal(`${this.config.logPrefix} 平仓: ${reason}`); // 调用 setSellSignal

    this.log( // 调用 log
      `平仓: ${pair.id} - ${reason} - PnL: ${pnl.toFixed(2)} (${isWin ? '盈利' : '亏损'})`, // 执行语句
      isWin ? 'info' : 'warn' // 执行语句
    ); // 结束调用或参数
  } // 结束代码块

  /**
   * 处理资金费率更新 (用于永续-现货套利)
   */
  async onFundingRate(data) { // 执行语句
    if (this.config.arbType !== STAT_ARB_TYPE.PERPETUAL_SPOT) { // 条件判断 this.config.arbType !== STAT_ARB_TYPE.PERPETU...
      return; // 返回结果
    } // 结束代码块

    // 存储资金费率数据
    const symbol = data.symbol; // 定义常量 symbol
    const fundingRate = data.fundingRate; // 定义常量 fundingRate

    // 可以用于增强信号判断
    this.setState(`fundingRate:${symbol}`, { // 调用 setState
      rate: fundingRate, // 设置 rate 字段
      timestamp: data.timestamp || Date.now(), // 设置 timestamp 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 强制重新分析所有配对
   */
  async reanalyzeAllPairs() { // 执行语句
    this.log('强制重新分析所有配对...', 'info'); // 调用 log
    await this._updatePairs(); // 等待异步结果
  } // 结束代码块

  /**
   * 添加新配对
   */
  addPair(assetA, assetB) { // 调用 addPair
    const pair = this.pairManager.addPair(assetA, assetB); // 定义常量 pair
    this.log(`手动添加配对: ${pair.id}`, 'info'); // 调用 log
    return pair; // 返回结果
  } // 结束代码块

  /**
   * 移除配对
   */
  removePair(pairId) { // 调用 removePair
    const pair = this.pairManager.getPair(pairId); // 定义常量 pair
    if (pair && pair.position) { // 条件判断 pair && pair.position
      this.log(`无法移除有仓位的配对: ${pairId}`, 'warn'); // 调用 log
      return false; // 返回结果
    } // 结束代码块

    this.pairManager.deactivatePair(pairId); // 访问 pairManager
    this.pairManager.pairs.delete(pairId); // 访问 pairManager
    this.log(`移除配对: ${pairId}`, 'info'); // 调用 log
    return true; // 返回结果
  } // 结束代码块

  /**
   * 获取策略状态
   */
  getStatus() { // 调用 getStatus
    const activePairs = this.pairManager.getActivePairs(); // 定义常量 activePairs
    const pairsWithPositions = this.pairManager.getPairsWithPositions(); // 定义常量 pairsWithPositions

    return { // 返回结果
      name: this.name, // 设置 name 字段
      arbType: this.config.arbType, // 设置 arbType 字段
      running: this.running, // 设置 running 字段
      cooling: Date.now() < this.coolingUntil, // 设置 cooling 字段
      coolingUntil: this.coolingUntil, // 设置 coolingUntil 字段
      pairs: { // 设置 pairs 字段
        total: this.pairManager.pairs.size, // 设置 total 字段
        active: activePairs.length, // 设置 active 字段
        withPositions: pairsWithPositions.length, // 设置 withPositions 字段
      }, // 结束代码块
      stats: this.stats, // 设置 stats 字段
      winRate: this.stats.totalTrades > 0 // 设置 winRate 字段
        ? this.stats.winCount / (this.stats.winCount + this.stats.lossCount) // 执行语句
        : 0, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取配对详情
   */
  getPairDetails(pairId) { // 调用 getPairDetails
    const pair = this.pairManager.getPair(pairId); // 定义常量 pair
    if (!pair) return null; // 条件判断 !pair

    return { // 返回结果
      ...pair, // 展开对象或数组
      currentPriceA: this.priceStore.getLatestPrice(pair.assetA), // 设置 currentPriceA 字段
      currentPriceB: this.priceStore.getLatestPrice(pair.assetB), // 设置 currentPriceB 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取所有配对摘要
   */
  getAllPairsSummary() { // 调用 getAllPairsSummary
    return this.pairManager.getAllPairs().map(pair => ({ // 返回结果
      id: pair.id, // 设置 id 字段
      assetA: pair.assetA, // 设置 assetA 字段
      assetB: pair.assetB, // 设置 assetB 字段
      status: pair.status, // 设置 status 字段
      correlation: pair.stats.correlation?.toFixed(3), // 设置 correlation 字段
      halfLife: pair.stats.halfLife?.toFixed(1), // 设置 halfLife 字段
      currentZScore: pair.stats.currentZScore?.toFixed(2), // 设置 currentZScore 字段
      hasPosition: !!pair.position, // 设置 hasPosition 字段
      performance: pair.performance, // 设置 performance 字段
    })); // 结束代码块
  } // 结束代码块

  /**
   * 结束策略
   */
  async onFinish() { // 执行语句
    this.running = false; // 设置 running

    // 平仓所有仓位
    const pairsWithPositions = this.pairManager.getPairsWithPositions(); // 定义常量 pairsWithPositions
    for (const pair of pairsWithPositions) { // 循环 const pair of pairsWithPositions
      await this._closePosition(pair, '策略结束'); // 等待异步结果
    } // 结束代码块

    // 记录统计
    this.log(`策略结束统计:`, 'info'); // 调用 log
    this.log(`  总信号数: ${this.stats.totalSignals}`, 'info'); // 调用 log
    this.log(`  总交易数: ${this.stats.totalTrades}`, 'info'); // 调用 log
    this.log(`  总盈亏: ${this.stats.totalPnl.toFixed(2)}`, 'info'); // 调用 log
    this.log(`  胜率: ${((this.stats.winCount / (this.stats.winCount + this.stats.lossCount)) * 100 || 0).toFixed(1)}%`, 'info'); // 调用 log
    this.log(`  最大回撤: ${(Math.abs(this.stats.maxDrawdown)).toFixed(2)}`, 'info'); // 调用 log

    await super.onFinish(); // 等待异步结果
  } // 结束代码块

  /**
   * 日志输出
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
  DEFAULT_CONFIG as STAT_ARB_DEFAULT_CONFIG, // 执行语句
  PriceSeriesStore, // 执行语句
  StatisticalCalculator, // 执行语句
  PairManager, // 执行语句
  SpreadCalculator, // 执行语句
}; // 结束代码块

export default StatisticalArbitrageStrategy; // 默认导出
