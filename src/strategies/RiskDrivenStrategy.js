/**
 * 风控驱动策略 (Risk-Driven Strategy)
 *
 * 核心理念：用风控指标作为交易信号，而非传统止损
 *
 * 这不是被动的风控（止损），而是主动的信号源：
 * - 波动率突破 → 强制降仓
 * - 账户回撤 > X → 切换低风险策略
 * - 相关性骤升 → 减少多策略叠加
 *
 * 高级形态：
 * 1. Target Volatility - 目标波动率，动态调整仓位使组合波动率维持在目标值
 * 2. Risk Parity - 风险平价，各资产贡献相等的风险
 * 3. Max Drawdown Control - 最大回撤控制，接近阈值时主动减仓
 *
 * 设计哲学：
 * - 生存优先，盈利其次
 * - 风险是可预测的，收益不是
 * - 控制风险就是控制命运
 */

import BaseStrategy from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js
import { EventEmitter } from 'events'; // 导入模块 events
import { ATR, SMA, EMA, getLatest } from '../utils/indicators.js'; // 导入模块 ../utils/indicators.js
import { toNumber } from '../utils/helpers.js'; // 导入模块 ../utils/helpers.js

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 风控模式枚举
 */
export const RiskMode = { // 导出常量 RiskMode
  TARGET_VOLATILITY: 'target_volatility',   // TARGET波动率
  RISK_PARITY: 'risk_parity',               // 风险PARITY
  MAX_DRAWDOWN: 'max_drawdown',             // 最大回撤
  VOLATILITY_BREAKOUT: 'volatility_breakout', // 波动率突破
  CORRELATION_MONITOR: 'correlation_monitor', // CORRELATION监控
  COMBINED: 'combined',                     // COMBINED
}; // 结束代码块

/**
 * 风险等级枚举
 */
export const RiskLevel = { // 导出常量 RiskLevel
  SAFE: 'safe',           // 安全 - 可以正常交易
  NORMAL: 'normal',       // 正常 - 标准风险控制
  ELEVATED: 'elevated',   // 升高 - 需要减仓
  HIGH: 'high',           // 高 - 大幅减仓
  CRITICAL: 'critical',   // 严重 - 只平仓不开仓
  EMERGENCY: 'emergency', // 紧急 - 强制清仓
}; // 结束代码块

/**
 * 风控事件类型
 */
export const RiskEvent = { // 导出常量 RiskEvent
  VOLATILITY_SPIKE: 'volatility_spike', // 波动率尖峰
  DRAWDOWN_WARNING: 'drawdown_warning', // 回撤警告
  DRAWDOWN_BREACH: 'drawdown_breach', // 回撤BREACH
  CORRELATION_SURGE: 'correlation_surge', // CORRELATIONSURGE
  RISK_LEVEL_CHANGE: 'risk_level_change', // 风险级别修改
  POSITION_REDUCED: 'position_reduced', // 持仓REDUCED
  FORCED_LIQUIDATION: 'forced_liquidation', // FORCED强平
  STRATEGY_SWITCH: 'strategy_switch', // 策略SWITCH
}; // 结束代码块

/**
 * 默认配置
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 基础参数
  // ============================================
  symbol: 'BTC/USDT', // 交易对
  positionPercent: 95, // 持仓百分比

  // ============================================
  // 目标波动率参数 (Target Volatility)
  // ============================================
  targetVolatility: 0.15,           // target波动率
  volatilityLookback: 20,           // 波动率回溯
  volatilityAdjustSpeed: 0.3,       // 波动率AdjustSpeed
  minPositionRatio: 0.1,            // 最小持仓比例
  maxPositionRatio: 1.5,            // 最大持仓比例

  // ============================================
  // 波动率突破参数 (Volatility Breakout)
  // ============================================
  volatilityBreakoutThreshold: 2.0, // 波动率突破倍数 (当前/历史)
  volatilityBreakoutLookback: 60,   // 波动率突破回溯
  forceReduceRatio: 0.5,            // force减仓比例

  // ============================================
  // 最大回撤控制参数 (Max Drawdown Control)
  // ============================================
  maxDrawdown: 0.15,                // 最大回撤
  warningDrawdown: 0.10,            // 警告回撤
  criticalDrawdown: 0.20,           // critical回撤
  emergencyDrawdown: 0.25,          // emergency回撤
  drawdownReduceSpeed: 0.5,         // 回撤减仓Speed

  // ============================================
  // 风险平价参数 (Risk Parity)
  // ============================================
  targetRiskContribution: 'equal',  // target风险Contribution
  riskParityRebalanceThreshold: 0.1, // 风险ParityRebalance阈值
  correlationLookback: 30,          // correlation回溯

  // ============================================
  // 相关性监控参数 (Correlation Monitor)
  // ============================================
  correlationThreshold: 0.8,        // correlation阈值
  correlationSpikeMultiplier: 1.5,  // correlation尖峰倍数
  diversificationMinAssets: 3,      // diversification最小Assets

  // ============================================
  // 风险等级阈值
  // ============================================
  riskThresholds: { // 风险Thresholds
    safe: { volatilityRatio: 0.5, drawdown: 0.05 }, // safe
    normal: { volatilityRatio: 1.0, drawdown: 0.08 }, // normal
    elevated: { volatilityRatio: 1.5, drawdown: 0.12 }, // elevated
    high: { volatilityRatio: 2.0, drawdown: 0.18 }, // 最高
    critical: { volatilityRatio: 2.5, drawdown: 0.22 }, // critical
  }, // 结束代码块

  // ============================================
  // 策略切换参数
  // ============================================
  enableStrategySwitching: true,    // 启用策略Switching
  lowRiskStrategy: null,            // 最低风险策略
  highRiskTolerance: 0.20,          // 最高风险Tolerance

  // ============================================
  // 多资产支持
  // ============================================
  assets: [],                       // assets
  assetWeights: {},                 // 资产Weights
}; // 结束代码块

// ============================================
// 辅助类：波动率计算器
// ============================================

/**
 * 波动率计算器
 */
class VolatilityCalculator { // 定义类 VolatilityCalculator
  constructor(params = {}) { // 构造函数
    this.lookback = params.lookback || 20; // 设置 lookback
    this.annualizationFactor = params.annualizationFactor || Math.sqrt(365); // 设置 annualizationFactor
    this.returns = []; // 设置 returns
    this.volatilityHistory = []; // 设置 volatilityHistory
  } // 结束代码块

  /**
   * 添加收益率数据
   * @param {number} returnValue - 收益率
   */
  addReturn(returnValue) { // 调用 addReturn
    this.returns.push(returnValue); // 访问 returns
    if (this.returns.length > this.lookback * 2) { // 条件判断 this.returns.length > this.lookback * 2
      this.returns.shift(); // 访问 returns
    } // 结束代码块
  } // 结束代码块

  /**
   * 从价格序列计算收益率
   * @param {Array} prices - 价格序列
   */
  updateFromPrices(prices) { // 调用 updateFromPrices
    if (prices.length < 2) return; // 条件判断 prices.length < 2

    const lastPrice = prices[prices.length - 1]; // 定义常量 lastPrice
    const prevPrice = prices[prices.length - 2]; // 定义常量 prevPrice
    const returnValue = (lastPrice - prevPrice) / prevPrice; // 定义常量 returnValue

    this.addReturn(returnValue); // 调用 addReturn
  } // 结束代码块

  /**
   * 计算当前波动率 (年化)
   * @returns {number}
   */
  calculate() { // 调用 calculate
    if (this.returns.length < this.lookback) { // 条件判断 this.returns.length < this.lookback
      return null; // 返回结果
    } // 结束代码块

    const recentReturns = this.returns.slice(-this.lookback); // 定义常量 recentReturns
    const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length; // 定义函数 mean
    const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentReturns.length; // 定义函数 variance
    const stdDev = Math.sqrt(variance); // 定义常量 stdDev
    const annualizedVol = stdDev * this.annualizationFactor; // 定义常量 annualizedVol

    this.volatilityHistory.push(annualizedVol); // 访问 volatilityHistory
    if (this.volatilityHistory.length > 100) { // 条件判断 this.volatilityHistory.length > 100
      this.volatilityHistory.shift(); // 访问 volatilityHistory
    } // 结束代码块

    return annualizedVol; // 返回结果
  } // 结束代码块

  /**
   * 获取历史平均波动率
   * @param {number} period - 周期
   * @returns {number}
   */
  getHistoricalMean(period = 60) { // 调用 getHistoricalMean
    const history = this.volatilityHistory.slice(-period); // 定义常量 history
    if (history.length === 0) return null; // 条件判断 history.length === 0
    return history.reduce((a, b) => a + b, 0) / history.length; // 返回结果
  } // 结束代码块

  /**
   * 获取波动率百分位数
   * @returns {number} 0-100
   */
  getPercentile() { // 调用 getPercentile
    if (this.volatilityHistory.length < 10) return 50; // 条件判断 this.volatilityHistory.length < 10

    const current = this.volatilityHistory[this.volatilityHistory.length - 1]; // 定义常量 current
    const sorted = [...this.volatilityHistory].sort((a, b) => a - b); // 定义函数 sorted
    const index = sorted.findIndex(v => v >= current); // 定义函数 index

    return (index / sorted.length) * 100; // 返回结果
  } // 结束代码块

  /**
   * 检测波动率突破
   * @param {number} multiplier - 突破倍数
   * @returns {Object}
   */
  detectBreakout(multiplier = 2.0) { // 调用 detectBreakout
    const current = this.calculate(); // 定义常量 current
    const historical = this.getHistoricalMean(); // 定义常量 historical

    if (!current || !historical) { // 条件判断 !current || !historical
      return { isBreakout: false, ratio: 1 }; // 返回结果
    } // 结束代码块

    const ratio = current / historical; // 定义常量 ratio
    return { // 返回结果
      isBreakout: ratio >= multiplier, // 是否突破
      ratio, // 执行语句
      current, // 执行语句
      historical, // 执行语句
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 辅助类：回撤监控器
// ============================================

/**
 * 回撤监控器
 */
class DrawdownMonitor { // 定义类 DrawdownMonitor
  constructor(params = {}) { // 构造函数
    this.maxDrawdown = params.maxDrawdown || 0.15; // 设置 maxDrawdown
    this.warningDrawdown = params.warningDrawdown || 0.10; // 设置 warningDrawdown
    this.criticalDrawdown = params.criticalDrawdown || 0.20; // 设置 criticalDrawdown
    this.emergencyDrawdown = params.emergencyDrawdown || 0.25; // 设置 emergencyDrawdown

    this.peakEquity = 0; // 设置 peakEquity
    this.currentEquity = 0; // 设置 currentEquity
    this.drawdownHistory = []; // 设置 drawdownHistory
    this.maxHistoricalDrawdown = 0; // 设置 maxHistoricalDrawdown
  } // 结束代码块

  /**
   * 更新权益
   * @param {number} equity - 当前权益
   */
  update(equity) { // 调用 update
    this.currentEquity = equity; // 设置 currentEquity

    if (equity > this.peakEquity) { // 条件判断 equity > this.peakEquity
      this.peakEquity = equity; // 设置 peakEquity
    } // 结束代码块

    const drawdown = this.calculateDrawdown(); // 定义常量 drawdown
    this.drawdownHistory.push(drawdown); // 访问 drawdownHistory

    if (drawdown > this.maxHistoricalDrawdown) { // 条件判断 drawdown > this.maxHistoricalDrawdown
      this.maxHistoricalDrawdown = drawdown; // 设置 maxHistoricalDrawdown
    } // 结束代码块

    if (this.drawdownHistory.length > 1000) { // 条件判断 this.drawdownHistory.length > 1000
      this.drawdownHistory.shift(); // 访问 drawdownHistory
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算当前回撤
   * @returns {number}
   */
  calculateDrawdown() { // 调用 calculateDrawdown
    if (this.peakEquity === 0) return 0; // 条件判断 this.peakEquity === 0
    return (this.peakEquity - this.currentEquity) / this.peakEquity; // 返回结果
  } // 结束代码块

  /**
   * 获取风险等级
   * @returns {string}
   */
  getRiskLevel() { // 调用 getRiskLevel
    const dd = this.calculateDrawdown(); // 定义常量 dd

    if (dd >= this.emergencyDrawdown) return RiskLevel.EMERGENCY; // 条件判断 dd >= this.emergencyDrawdown
    if (dd >= this.criticalDrawdown) return RiskLevel.CRITICAL; // 条件判断 dd >= this.criticalDrawdown
    if (dd >= this.maxDrawdown) return RiskLevel.HIGH; // 条件判断 dd >= this.maxDrawdown
    if (dd >= this.warningDrawdown) return RiskLevel.ELEVATED; // 条件判断 dd >= this.warningDrawdown
    if (dd >= this.warningDrawdown * 0.5) return RiskLevel.NORMAL; // 条件判断 dd >= this.warningDrawdown * 0.5
    return RiskLevel.SAFE; // 返回结果
  } // 结束代码块

  /**
   * 获取建议仓位比例
   * @returns {number} 0-1
   */
  getSuggestedPositionRatio() { // 调用 getSuggestedPositionRatio
    const level = this.getRiskLevel(); // 定义常量 level
    const dd = this.calculateDrawdown(); // 定义常量 dd

    switch (level) { // 分支选择 level
      case RiskLevel.EMERGENCY: // 分支 RiskLevel.EMERGENCY
        return 0; // 清仓
      case RiskLevel.CRITICAL: // 分支 RiskLevel.CRITICAL
        return 0.1; // 只保留10%
      case RiskLevel.HIGH: // 分支 RiskLevel.HIGH
        return 0.3; // 减到30%
      case RiskLevel.ELEVATED: // 分支 RiskLevel.ELEVATED
        // 线性减仓
        const ratio = 1 - (dd - this.warningDrawdown) / (this.maxDrawdown - this.warningDrawdown); // 定义常量 ratio
        return Math.max(0.5, ratio); // 返回结果
      case RiskLevel.NORMAL: // 分支 RiskLevel.NORMAL
        return 0.8; // 返回结果
      default: // 默认
        return 1.0; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取恢复进度
   * @returns {number} 0-100%
   */
  getRecoveryProgress() { // 调用 getRecoveryProgress
    if (this.peakEquity === 0) return 100; // 条件判断 this.peakEquity === 0
    return (this.currentEquity / this.peakEquity) * 100; // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      currentDrawdown: this.calculateDrawdown(), // current回撤
      maxHistoricalDrawdown: this.maxHistoricalDrawdown, // 最大Historical回撤
      peakEquity: this.peakEquity, // peakEquity
      currentEquity: this.currentEquity, // currentEquity
      riskLevel: this.getRiskLevel(), // 风险级别
      recoveryProgress: this.getRecoveryProgress(), // recoveryProgress
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 辅助类：相关性监控器
// ============================================

/**
 * 相关性监控器
 */
class CorrelationMonitor { // 定义类 CorrelationMonitor
  constructor(params = {}) { // 构造函数
    this.lookback = params.lookback || 30; // 设置 lookback
    this.threshold = params.threshold || 0.8; // 设置 threshold
    this.spikeMultiplier = params.spikeMultiplier || 1.5; // 设置 spikeMultiplier

    this.returnsSeries = {}; // { symbol: [returns] }
    this.correlationMatrix = {}; // { 'A-B': correlation }
    this.historicalCorrelations = {}; // { 'A-B': [history] }
  } // 结束代码块

  /**
   * 更新资产收益率
   * @param {string} symbol - 资产标识
   * @param {number} returnValue - 收益率
   */
  updateReturn(symbol, returnValue) { // 调用 updateReturn
    if (!this.returnsSeries[symbol]) { // 条件判断 !this.returnsSeries[symbol]
      this.returnsSeries[symbol] = []; // 访问 returnsSeries
    } // 结束代码块

    this.returnsSeries[symbol].push(returnValue); // 访问 returnsSeries

    if (this.returnsSeries[symbol].length > this.lookback * 2) { // 条件判断 this.returnsSeries[symbol].length > this.look...
      this.returnsSeries[symbol].shift(); // 访问 returnsSeries
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算两个资产的相关性
   * @param {string} symbolA
   * @param {string} symbolB
   * @returns {number}
   */
  calculateCorrelation(symbolA, symbolB) { // 调用 calculateCorrelation
    const returnsA = this.returnsSeries[symbolA]; // 定义常量 returnsA
    const returnsB = this.returnsSeries[symbolB]; // 定义常量 returnsB

    if (!returnsA || !returnsB) return 0; // 条件判断 !returnsA || !returnsB

    const n = Math.min(returnsA.length, returnsB.length, this.lookback); // 定义常量 n
    if (n < 10) return 0; // 条件判断 n < 10

    const a = returnsA.slice(-n); // 定义常量 a
    const b = returnsB.slice(-n); // 定义常量 b

    const meanA = a.reduce((s, v) => s + v, 0) / n; // 定义函数 meanA
    const meanB = b.reduce((s, v) => s + v, 0) / n; // 定义函数 meanB

    let cov = 0, varA = 0, varB = 0; // 定义变量 cov

    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      const da = a[i] - meanA; // 定义常量 da
      const db = b[i] - meanB; // 定义常量 db
      cov += da * db; // 执行语句
      varA += da * da; // 执行语句
      varB += db * db; // 执行语句
    } // 结束代码块

    if (varA === 0 || varB === 0) return 0; // 条件判断 varA === 0 || varB === 0

    return cov / Math.sqrt(varA * varB); // 返回结果
  } // 结束代码块

  /**
   * 更新相关性矩阵
   */
  updateMatrix() { // 调用 updateMatrix
    const symbols = Object.keys(this.returnsSeries); // 定义常量 symbols

    for (let i = 0; i < symbols.length; i++) { // 循环 let i = 0; i < symbols.length; i++
      for (let j = i + 1; j < symbols.length; j++) { // 循环 let j = i + 1; j < symbols.length; j++
        const key = `${symbols[i]}-${symbols[j]}`; // 定义常量 key
        const corr = this.calculateCorrelation(symbols[i], symbols[j]); // 定义常量 corr

        this.correlationMatrix[key] = corr; // 访问 correlationMatrix

        if (!this.historicalCorrelations[key]) { // 条件判断 !this.historicalCorrelations[key]
          this.historicalCorrelations[key] = []; // 访问 historicalCorrelations
        } // 结束代码块
        this.historicalCorrelations[key].push(corr); // 访问 historicalCorrelations

        if (this.historicalCorrelations[key].length > 100) { // 条件判断 this.historicalCorrelations[key].length > 100
          this.historicalCorrelations[key].shift(); // 访问 historicalCorrelations
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检测相关性骤升
   * @returns {Object}
   */
  detectCorrelationSpike() { // 调用 detectCorrelationSpike
    const spikes = []; // 定义常量 spikes

    for (const [pair, history] of Object.entries(this.historicalCorrelations)) { // 循环 const [pair, history] of Object.entries(this....
      if (history.length < 10) continue; // 条件判断 history.length < 10

      const current = history[history.length - 1]; // 定义常量 current
      const historical = history.slice(0, -1); // 定义常量 historical
      const mean = historical.reduce((a, b) => a + b, 0) / historical.length; // 定义函数 mean

      // 绝对值增加检测
      const spike = Math.abs(current) - Math.abs(mean); // 定义常量 spike

      if (spike > 0 && Math.abs(current) / (Math.abs(mean) + 0.01) >= this.spikeMultiplier) { // 条件判断 spike > 0 && Math.abs(current) / (Math.abs(me...
        spikes.push({ // 调用 spikes.push
          pair, // 执行语句
          current, // 执行语句
          historical: mean, // historical
          spikeRatio: Math.abs(current) / (Math.abs(mean) + 0.01), // 尖峰比例
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return { // 返回结果
      hasSpike: spikes.length > 0, // 是否有尖峰
      spikes, // 执行语句
      avgCorrelation: this.getAverageCorrelation(), // avgCorrelation
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取平均相关性
   * @returns {number}
   */
  getAverageCorrelation() { // 调用 getAverageCorrelation
    const correlations = Object.values(this.correlationMatrix); // 定义常量 correlations
    if (correlations.length === 0) return 0; // 条件判断 correlations.length === 0

    const absCorr = correlations.map(c => Math.abs(c)); // 定义函数 absCorr
    return absCorr.reduce((a, b) => a + b, 0) / absCorr.length; // 返回结果
  } // 结束代码块

  /**
   * 获取高相关性资产对
   * @returns {Array}
   */
  getHighCorrelationPairs() { // 调用 getHighCorrelationPairs
    return Object.entries(this.correlationMatrix) // 返回结果
      .filter(([, corr]) => Math.abs(corr) >= this.threshold) // 定义箭头函数
      .map(([pair, corr]) => ({ pair, correlation: corr })) // 定义箭头函数
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)); // 定义箭头函数
  } // 结束代码块

  /**
   * 获取分散化建议
   * @returns {Object}
   */
  getDiversificationAdvice() { // 调用 getDiversificationAdvice
    const highCorr = this.getHighCorrelationPairs(); // 定义常量 highCorr
    const avgCorr = this.getAverageCorrelation(); // 定义常量 avgCorr

    return { // 返回结果
      wellDiversified: avgCorr < 0.5 && highCorr.length === 0, // wellDiversified
      averageCorrelation: avgCorr, // 平均Correlation
      highCorrelationPairs: highCorr, // 最高CorrelationPairs
      recommendation: avgCorr >= 0.7 ? 'reduce_exposure' : // recommendation
                      avgCorr >= 0.5 ? 'monitor_closely' : 'acceptable', // 执行语句
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 辅助类：目标波动率管理器
// ============================================

/**
 * 目标波动率管理器
 */
class TargetVolatilityManager { // 定义类 TargetVolatilityManager
  constructor(params = {}) { // 构造函数
    this.targetVol = params.targetVolatility || 0.15; // 设置 targetVol
    this.adjustSpeed = params.adjustSpeed || 0.3; // 设置 adjustSpeed
    this.minRatio = params.minPositionRatio || 0.1; // 设置 minRatio
    this.maxRatio = params.maxPositionRatio || 1.5; // 设置 maxRatio

    this.currentPositionRatio = 1.0; // 设置 currentPositionRatio
    this.volatilityCalculator = new VolatilityCalculator({ // 设置 volatilityCalculator
      lookback: params.lookback || 20, // 回溯
    }); // 结束代码块
  } // 结束代码块

  /**
   * 更新并计算目标仓位
   * @param {Array} prices - 价格序列
   * @returns {Object}
   */
  update(prices) { // 调用 update
    this.volatilityCalculator.updateFromPrices(prices); // 访问 volatilityCalculator
    const currentVol = this.volatilityCalculator.calculate(); // 定义常量 currentVol

    if (!currentVol) { // 条件判断 !currentVol
      return { // 返回结果
        targetRatio: this.currentPositionRatio, // target比例
        currentVolatility: null, // current波动率
        adjustment: 0, // adjustment
      }; // 结束代码块
    } // 结束代码块

    // 目标仓位 = 目标波动率 / 当前波动率
    const rawTargetRatio = this.targetVol / currentVol; // 定义常量 rawTargetRatio

    // 限制在范围内
    const clampedRatio = Math.max(this.minRatio, Math.min(this.maxRatio, rawTargetRatio)); // 定义常量 clampedRatio

    // 平滑调整
    const adjustment = (clampedRatio - this.currentPositionRatio) * this.adjustSpeed; // 定义常量 adjustment
    this.currentPositionRatio += adjustment; // 访问 currentPositionRatio

    // 再次限制
    this.currentPositionRatio = Math.max(this.minRatio, Math.min(this.maxRatio, this.currentPositionRatio)); // 设置 currentPositionRatio

    return { // 返回结果
      targetRatio: this.currentPositionRatio, // target比例
      rawRatio: rawTargetRatio, // raw比例
      currentVolatility: currentVol, // current波动率
      targetVolatility: this.targetVol, // target波动率
      adjustment, // 执行语句
      needsRebalance: Math.abs(adjustment) > 0.05, // needsRebalance
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取当前状态
   */
  getState() { // 调用 getState
    return { // 返回结果
      currentRatio: this.currentPositionRatio, // current比例
      targetVol: this.targetVol, // target波动率
      volatilityHistory: this.volatilityCalculator.volatilityHistory, // 波动率历史
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 辅助类：风险平价管理器
// ============================================

/**
 * 风险平价管理器
 */
class RiskParityManager { // 定义类 RiskParityManager
  constructor(params = {}) { // 构造函数
    this.rebalanceThreshold = params.rebalanceThreshold || 0.1; // 设置 rebalanceThreshold
    this.lookback = params.lookback || 30; // 设置 lookback

    this.assetVolatilities = {}; // { symbol: volatility }
    this.assetWeights = {}; // { symbol: weight }
    this.targetRiskContributions = {}; // { symbol: contribution }
  } // 结束代码块

  /**
   * 更新资产波动率
   * @param {string} symbol
   * @param {Array} prices
   */
  updateAssetVolatility(symbol, prices) { // 调用 updateAssetVolatility
    if (prices.length < this.lookback) return; // 条件判断 prices.length < this.lookback

    // 计算收益率
    const returns = []; // 定义常量 returns
    for (let i = 1; i < prices.length; i++) { // 循环 let i = 1; i < prices.length; i++
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]); // 调用 returns.push
    } // 结束代码块

    // 计算波动率
    const recentReturns = returns.slice(-this.lookback); // 定义常量 recentReturns
    const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length; // 定义函数 mean
    const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentReturns.length; // 定义函数 variance

    this.assetVolatilities[symbol] = Math.sqrt(variance) * Math.sqrt(365); // 访问 assetVolatilities
  } // 结束代码块

  /**
   * 计算风险平价权重
   * @returns {Object}
   */
  calculateRiskParityWeights() { // 调用 calculateRiskParityWeights
    const symbols = Object.keys(this.assetVolatilities); // 定义常量 symbols
    if (symbols.length === 0) return {}; // 条件判断 symbols.length === 0

    // 简化版风险平价：权重 ∝ 1/波动率
    const inverseVols = {}; // 定义常量 inverseVols
    let sumInverseVol = 0; // 定义变量 sumInverseVol

    for (const symbol of symbols) { // 循环 const symbol of symbols
      const vol = this.assetVolatilities[symbol]; // 定义常量 vol
      if (vol > 0) { // 条件判断 vol > 0
        inverseVols[symbol] = 1 / vol; // 执行语句
        sumInverseVol += inverseVols[symbol]; // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 归一化
    const weights = {}; // 定义常量 weights
    for (const symbol of symbols) { // 循环 const symbol of symbols
      weights[symbol] = (inverseVols[symbol] || 0) / sumInverseVol; // 执行语句
    } // 结束代码块

    this.assetWeights = weights; // 设置 assetWeights
    return weights; // 返回结果
  } // 结束代码块

  /**
   * 计算每个资产的风险贡献
   * @returns {Object}
   */
  calculateRiskContributions() { // 调用 calculateRiskContributions
    const contributions = {}; // 定义常量 contributions
    let totalRisk = 0; // 定义变量 totalRisk

    for (const [symbol, weight] of Object.entries(this.assetWeights)) { // 循环 const [symbol, weight] of Object.entries(this...
      const vol = this.assetVolatilities[symbol] || 0; // 定义常量 vol
      const marginalRisk = weight * vol; // 定义常量 marginalRisk
      contributions[symbol] = marginalRisk; // 执行语句
      totalRisk += marginalRisk; // 执行语句
    } // 结束代码块

    // 归一化为百分比
    for (const symbol of Object.keys(contributions)) { // 循环 const symbol of Object.keys(contributions)
      contributions[symbol] = totalRisk > 0 ? contributions[symbol] / totalRisk : 0; // 执行语句
    } // 结束代码块

    return contributions; // 返回结果
  } // 结束代码块

  /**
   * 检查是否需要再平衡
   * @returns {Object}
   */
  checkRebalanceNeeded() { // 调用 checkRebalanceNeeded
    const currentContributions = this.calculateRiskContributions(); // 定义常量 currentContributions
    const symbols = Object.keys(currentContributions); // 定义常量 symbols
    const targetContribution = 1 / symbols.length; // 定义常量 targetContribution

    let maxDeviation = 0; // 定义变量 maxDeviation
    const deviations = {}; // 定义常量 deviations

    for (const symbol of symbols) { // 循环 const symbol of symbols
      const deviation = Math.abs(currentContributions[symbol] - targetContribution); // 定义常量 deviation
      deviations[symbol] = deviation; // 执行语句
      maxDeviation = Math.max(maxDeviation, deviation); // 赋值 maxDeviation
    } // 结束代码块

    return { // 返回结果
      needsRebalance: maxDeviation > this.rebalanceThreshold, // needsRebalance
      maxDeviation, // 执行语句
      deviations, // 执行语句
      currentContributions, // 执行语句
      targetContribution, // 执行语句
      suggestedWeights: this.calculateRiskParityWeights(), // suggestedWeights
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 主策略类：风控驱动策略
// ============================================

/**
 * 风控驱动策略
 */
export class RiskDrivenStrategy extends BaseStrategy { // 导出类 RiskDrivenStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) { // 构造函数
    super(params); // 调用父类

    this.name = params.name || 'RiskDrivenStrategy'; // 设置 name

    // 合并配置
    this.config = { ...DEFAULT_CONFIG, ...params }; // 设置 config

    // ============================================
    // 主要参数
    // ============================================
    this.symbol = this.config.symbol; // 设置 symbol
    this.positionPercent = this.config.positionPercent; // 设置 positionPercent
    this.riskMode = params.riskMode || RiskMode.COMBINED; // 设置 riskMode

    // ============================================
    // 初始化各模块
    // ============================================

    // 波动率计算器
    this.volatilityCalculator = new VolatilityCalculator({ // 设置 volatilityCalculator
      lookback: this.config.volatilityLookback, // 回溯
    }); // 结束代码块

    // 回撤监控器
    this.drawdownMonitor = new DrawdownMonitor({ // 设置 drawdownMonitor
      maxDrawdown: this.config.maxDrawdown, // 最大回撤
      warningDrawdown: this.config.warningDrawdown, // 警告回撤
      criticalDrawdown: this.config.criticalDrawdown, // critical回撤
      emergencyDrawdown: this.config.emergencyDrawdown, // emergency回撤
    }); // 结束代码块

    // 相关性监控器 (多资产)
    this.correlationMonitor = new CorrelationMonitor({ // 设置 correlationMonitor
      lookback: this.config.correlationLookback, // 回溯
      threshold: this.config.correlationThreshold, // 阈值
      spikeMultiplier: this.config.correlationSpikeMultiplier, // 尖峰倍数
    }); // 结束代码块

    // 目标波动率管理器
    this.targetVolManager = new TargetVolatilityManager({ // 设置 targetVolManager
      targetVolatility: this.config.targetVolatility, // target波动率
      adjustSpeed: this.config.volatilityAdjustSpeed, // adjustSpeed
      minPositionRatio: this.config.minPositionRatio, // 最小持仓比例
      maxPositionRatio: this.config.maxPositionRatio, // 最大持仓比例
      lookback: this.config.volatilityLookback, // 回溯
    }); // 结束代码块

    // 风险平价管理器
    this.riskParityManager = new RiskParityManager({ // 设置 riskParityManager
      rebalanceThreshold: this.config.riskParityRebalanceThreshold, // rebalance阈值
      lookback: this.config.correlationLookback, // 回溯
    }); // 结束代码块

    // ============================================
    // 内部状态
    // ============================================
    this._currentRiskLevel = RiskLevel.NORMAL; // 设置 _currentRiskLevel
    this._positionRatio = 1.0; // 设置 _positionRatio
    this._priceHistory = []; // 设置 _priceHistory
    this._eventHistory = []; // 设置 _eventHistory
    this._lastActionTime = 0; // 设置 _lastActionTime
    this._actionCooldown = 60000; // 1分钟冷却
    this._isInLowRiskMode = false; // 设置 _isInLowRiskMode
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 风控驱动策略需要 K 线和 Ticker 数据 / Risk-driven strategy needs kline and ticker
    return ['kline', 'ticker']; // 返回结果
  } // 结束代码块

  /**
   * 初始化
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    this.log(`风控驱动策略初始化`); // 调用 log
    this.log(`模式: ${this.riskMode}`); // 调用 log
    this.log(`目标波动率: ${(this.config.targetVolatility * 100).toFixed(1)}%`); // 调用 log
    this.log(`最大回撤阈值: ${(this.config.maxDrawdown * 100).toFixed(1)}%`); // 调用 log

    // 初始化权益
    const equity = this.getEquity(); // 定义常量 equity
    if (equity) { // 条件判断 equity
      this.drawdownMonitor.update(equity); // 访问 drawdownMonitor
    } // 结束代码块
  } // 结束代码块

  /**
   * 主交易逻辑
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) { // 执行语句
    const minRequired = Math.max( // 定义常量 minRequired
      this.config.volatilityLookback, // 访问 config
      this.config.volatilityBreakoutLookback, // 访问 config
      this.config.correlationLookback // 访问 config
    ); // 结束调用或参数

    if (history.length < minRequired) { // 条件判断 history.length < minRequired
      return; // 返回结果
    } // 结束代码块

    const currentPrice = toNumber(candle.close); // 定义常量 currentPrice
    const closes = history.map(h => toNumber(h.close)); // 定义函数 closes

    // 更新价格历史
    this._priceHistory.push(currentPrice); // 访问 _priceHistory
    if (this._priceHistory.length > 500) { // 条件判断 this._priceHistory.length > 500
      this._priceHistory.shift(); // 访问 _priceHistory
    } // 结束代码块

    // ============================================
    // 1. 更新所有风控模块
    // ============================================
    this._updateRiskModules(candle, history, closes); // 调用 _updateRiskModules

    // ============================================
    // 2. 评估综合风险等级
    // ============================================
    const riskAssessment = this._assessRisk(); // 定义常量 riskAssessment

    // ============================================
    // 3. 根据风险等级计算目标仓位
    // ============================================
    const targetPosition = this._calculateTargetPosition(riskAssessment); // 定义常量 targetPosition

    // ============================================
    // 4. 执行仓位调整
    // ============================================
    this._executePositionAdjustment(targetPosition, riskAssessment, candle); // 调用 _executePositionAdjustment

    // ============================================
    // 5. 保存指标
    // ============================================
    this._saveIndicators(riskAssessment, targetPosition); // 调用 _saveIndicators
  } // 结束代码块

  /**
   * 更新风控模块
   * @private
   */
  _updateRiskModules(candle, history, closes) { // 调用 _updateRiskModules
    // 更新波动率
    this.volatilityCalculator.updateFromPrices(closes); // 访问 volatilityCalculator

    // 更新权益和回撤
    const equity = this.getEquity(); // 定义常量 equity
    if (equity) { // 条件判断 equity
      this.drawdownMonitor.update(equity); // 访问 drawdownMonitor
    } // 结束代码块

    // 更新目标波动率管理器
    this.targetVolManager.update(closes); // 访问 targetVolManager

    // 如果有多资产，更新相关性和风险平价
    if (this.config.assets.length > 1) { // 条件判断 this.config.assets.length > 1
      // 单资产时计算自身收益率
      if (closes.length >= 2) { // 条件判断 closes.length >= 2
        const ret = (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]; // 定义常量 ret
        this.correlationMonitor.updateReturn(this.symbol, ret); // 访问 correlationMonitor
      } // 结束代码块
      this.correlationMonitor.updateMatrix(); // 访问 correlationMonitor
      this.riskParityManager.updateAssetVolatility(this.symbol, closes); // 访问 riskParityManager
    } // 结束代码块
  } // 结束代码块

  /**
   * 综合风险评估
   * @private
   * @returns {Object}
   */
  _assessRisk() { // 调用 _assessRisk
    const assessment = { // 定义常量 assessment
      overallLevel: RiskLevel.NORMAL, // overall级别
      signals: [], // 信号
      actions: [], // actions
      metrics: {}, // 指标
    }; // 结束代码块

    // ============================================
    // 1. 波动率突破检测
    // ============================================
    if (this.riskMode === RiskMode.VOLATILITY_BREAKOUT || // 条件判断 this.riskMode === RiskMode.VOLATILITY_BREAKOU...
        this.riskMode === RiskMode.COMBINED) { // 设置 riskMode
      const breakout = this.volatilityCalculator.detectBreakout( // 定义常量 breakout
        this.config.volatilityBreakoutThreshold // 访问 config
      ); // 结束调用或参数

      assessment.metrics.volatility = { // 赋值 assessment.metrics.volatility
        current: breakout.current, // current
        historical: breakout.historical, // historical
        ratio: breakout.ratio, // 比例
        isBreakout: breakout.isBreakout, // 是否突破
        percentile: this.volatilityCalculator.getPercentile(), // percentile
      }; // 结束代码块

      if (breakout.isBreakout) { // 条件判断 breakout.isBreakout
        assessment.signals.push({ // 调用 assessment.signals.push
          type: RiskEvent.VOLATILITY_SPIKE, // 类型
          severity: 'high', // severity
          message: `波动率突破 | 当前: ${(breakout.current * 100).toFixed(1)}% vs 历史: ${(breakout.historical * 100).toFixed(1)}% (${breakout.ratio.toFixed(1)}x)`, // 消息
        }); // 结束代码块
        assessment.actions.push({ // 调用 assessment.actions.push
          action: 'reduce_position', // action
          ratio: this.config.forceReduceRatio, // 比例
          reason: 'volatility_breakout', // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // 2. 回撤控制
    // ============================================
    if (this.riskMode === RiskMode.MAX_DRAWDOWN || // 条件判断 this.riskMode === RiskMode.MAX_DRAWDOWN ||
        this.riskMode === RiskMode.COMBINED) { // 设置 riskMode
      const drawdownStats = this.drawdownMonitor.getStats(); // 定义常量 drawdownStats
      const ddRiskLevel = this.drawdownMonitor.getRiskLevel(); // 定义常量 ddRiskLevel
      const suggestedRatio = this.drawdownMonitor.getSuggestedPositionRatio(); // 定义常量 suggestedRatio

      assessment.metrics.drawdown = { // 赋值 assessment.metrics.drawdown
        current: drawdownStats.currentDrawdown, // current
        max: drawdownStats.maxHistoricalDrawdown, // 最大
        riskLevel: ddRiskLevel, // 风险级别
        suggestedRatio, // 执行语句
        recoveryProgress: drawdownStats.recoveryProgress, // recoveryProgress
      }; // 结束代码块

      // 根据回撤等级生成信号
      if (ddRiskLevel === RiskLevel.EMERGENCY) { // 条件判断 ddRiskLevel === RiskLevel.EMERGENCY
        assessment.signals.push({ // 调用 assessment.signals.push
          type: RiskEvent.FORCED_LIQUIDATION, // 类型
          severity: 'emergency', // severity
          message: `紧急回撤 ${(drawdownStats.currentDrawdown * 100).toFixed(1)}% - 强制清仓`, // 消息
        }); // 结束代码块
        assessment.actions.push({ // 调用 assessment.actions.push
          action: 'close_all', // action
          ratio: 0, // 比例
          reason: 'emergency_drawdown', // reason
        }); // 结束代码块
      } else if (ddRiskLevel === RiskLevel.CRITICAL) { // 执行语句
        assessment.signals.push({ // 调用 assessment.signals.push
          type: RiskEvent.DRAWDOWN_BREACH, // 类型
          severity: 'critical', // severity
          message: `严重回撤 ${(drawdownStats.currentDrawdown * 100).toFixed(1)}% - 大幅减仓`, // 消息
        }); // 结束代码块
        assessment.actions.push({ // 调用 assessment.actions.push
          action: 'reduce_position', // action
          ratio: suggestedRatio, // 比例
          reason: 'critical_drawdown', // reason
        }); // 结束代码块
      } else if (ddRiskLevel === RiskLevel.HIGH) { // 执行语句
        assessment.signals.push({ // 调用 assessment.signals.push
          type: RiskEvent.DRAWDOWN_BREACH, // 类型
          severity: 'high', // severity
          message: `高回撤 ${(drawdownStats.currentDrawdown * 100).toFixed(1)}%`, // 消息
        }); // 结束代码块
        assessment.actions.push({ // 调用 assessment.actions.push
          action: 'reduce_position', // action
          ratio: suggestedRatio, // 比例
          reason: 'high_drawdown', // reason
        }); // 结束代码块
      } else if (ddRiskLevel === RiskLevel.ELEVATED) { // 执行语句
        assessment.signals.push({ // 调用 assessment.signals.push
          type: RiskEvent.DRAWDOWN_WARNING, // 类型
          severity: 'elevated', // severity
          message: `回撤预警 ${(drawdownStats.currentDrawdown * 100).toFixed(1)}%`, // 消息
        }); // 结束代码块
        assessment.actions.push({ // 调用 assessment.actions.push
          action: 'reduce_position', // action
          ratio: suggestedRatio, // 比例
          reason: 'elevated_drawdown', // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // 3. 目标波动率
    // ============================================
    if (this.riskMode === RiskMode.TARGET_VOLATILITY || // 条件判断 this.riskMode === RiskMode.TARGET_VOLATILITY ||
        this.riskMode === RiskMode.COMBINED) { // 设置 riskMode
      const tvState = this.targetVolManager.getState(); // 定义常量 tvState
      const tvUpdate = this.targetVolManager.update(this._priceHistory); // 定义常量 tvUpdate

      assessment.metrics.targetVolatility = { // 赋值 assessment.metrics.targetVolatility
        current: tvUpdate.currentVolatility, // current
        target: tvUpdate.targetVolatility, // target
        currentRatio: tvUpdate.targetRatio, // current比例
        needsRebalance: tvUpdate.needsRebalance, // needsRebalance
      }; // 结束代码块

      if (tvUpdate.needsRebalance) { // 条件判断 tvUpdate.needsRebalance
        assessment.actions.push({ // 调用 assessment.actions.push
          action: 'adjust_position', // action
          ratio: tvUpdate.targetRatio, // 比例
          reason: 'target_volatility', // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // 4. 相关性监控 (多资产)
    // ============================================
    if ((this.riskMode === RiskMode.CORRELATION_MONITOR || // 条件判断 (this.riskMode === RiskMode.CORRELATION_MONIT...
        this.riskMode === RiskMode.COMBINED) && // 设置 riskMode
        this.config.assets.length > 1) { // 访问 config
      const corrSpike = this.correlationMonitor.detectCorrelationSpike(); // 定义常量 corrSpike
      const diversification = this.correlationMonitor.getDiversificationAdvice(); // 定义常量 diversification

      assessment.metrics.correlation = { // 赋值 assessment.metrics.correlation
        average: corrSpike.avgCorrelation, // 平均
        hasSpike: corrSpike.hasSpike, // 是否有尖峰
        spikes: corrSpike.spikes, // spikes
        diversification, // 执行语句
      }; // 结束代码块

      if (corrSpike.hasSpike) { // 条件判断 corrSpike.hasSpike
        assessment.signals.push({ // 调用 assessment.signals.push
          type: RiskEvent.CORRELATION_SURGE, // 类型
          severity: 'elevated', // severity
          message: `相关性骤升 | 平均: ${(corrSpike.avgCorrelation * 100).toFixed(1)}%`, // 消息
        }); // 结束代码块
        assessment.actions.push({ // 调用 assessment.actions.push
          action: 'reduce_exposure', // action
          ratio: 0.7, // 比例
          reason: 'correlation_surge', // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // 5. 风险平价 (多资产)
    // ============================================
    if ((this.riskMode === RiskMode.RISK_PARITY || // 条件判断 (this.riskMode === RiskMode.RISK_PARITY ||
        this.riskMode === RiskMode.COMBINED) && // 设置 riskMode
        this.config.assets.length > 1) { // 访问 config
      const rebalance = this.riskParityManager.checkRebalanceNeeded(); // 定义常量 rebalance

      assessment.metrics.riskParity = { // 赋值 assessment.metrics.riskParity
        needsRebalance: rebalance.needsRebalance, // needsRebalance
        maxDeviation: rebalance.maxDeviation, // 最大偏离
        suggestedWeights: rebalance.suggestedWeights, // suggestedWeights
      }; // 结束代码块

      if (rebalance.needsRebalance) { // 条件判断 rebalance.needsRebalance
        assessment.actions.push({ // 调用 assessment.actions.push
          action: 'rebalance', // action
          weights: rebalance.suggestedWeights, // weights
          reason: 'risk_parity', // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // 6. 确定综合风险等级
    // ============================================
    const severities = assessment.signals.map(s => s.severity); // 定义函数 severities

    if (severities.includes('emergency')) { // 条件判断 severities.includes('emergency')
      assessment.overallLevel = RiskLevel.EMERGENCY; // 赋值 assessment.overallLevel
    } else if (severities.includes('critical')) { // 执行语句
      assessment.overallLevel = RiskLevel.CRITICAL; // 赋值 assessment.overallLevel
    } else if (severities.includes('high')) { // 执行语句
      assessment.overallLevel = RiskLevel.HIGH; // 赋值 assessment.overallLevel
    } else if (severities.includes('elevated')) { // 执行语句
      assessment.overallLevel = RiskLevel.ELEVATED; // 赋值 assessment.overallLevel
    } else if (assessment.actions.length > 0) { // 执行语句
      assessment.overallLevel = RiskLevel.NORMAL; // 赋值 assessment.overallLevel
    } else { // 执行语句
      assessment.overallLevel = RiskLevel.SAFE; // 赋值 assessment.overallLevel
    } // 结束代码块

    // 检测风险等级变化
    if (assessment.overallLevel !== this._currentRiskLevel) { // 条件判断 assessment.overallLevel !== this._currentRisk...
      assessment.signals.push({ // 调用 assessment.signals.push
        type: RiskEvent.RISK_LEVEL_CHANGE, // 类型
        severity: 'info', // severity
        message: `风险等级变化: ${this._currentRiskLevel} → ${assessment.overallLevel}`, // 消息
      }); // 结束代码块
      this._currentRiskLevel = assessment.overallLevel; // 设置 _currentRiskLevel
    } // 结束代码块

    return assessment; // 返回结果
  } // 结束代码块

  /**
   * 计算目标仓位
   * @private
   */
  _calculateTargetPosition(assessment) { // 调用 _calculateTargetPosition
    let targetRatio = 1.0; // 定义变量 targetRatio
    const reasons = []; // 定义常量 reasons

    // 根据 actions 确定最保守的仓位
    for (const action of assessment.actions) { // 循环 const action of assessment.actions
      if (action.action === 'close_all') { // 条件判断 action.action === 'close_all'
        targetRatio = 0; // 赋值 targetRatio
        reasons.push('emergency_close'); // 调用 reasons.push
        break; // 跳出循环或分支
      } else if (action.action === 'reduce_position' || // 执行语句
                 action.action === 'adjust_position' || // 赋值 action.action
                 action.action === 'reduce_exposure') { // 赋值 action.action
        if (action.ratio < targetRatio) { // 条件判断 action.ratio < targetRatio
          targetRatio = action.ratio; // 赋值 targetRatio
          reasons.push(action.reason); // 调用 reasons.push
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 限制范围
    targetRatio = Math.max(0, Math.min(this.config.maxPositionRatio, targetRatio)); // 赋值 targetRatio

    return { // 返回结果
      ratio: targetRatio, // 比例
      currentRatio: this._positionRatio, // current比例
      change: targetRatio - this._positionRatio, // 修改
      needsAdjustment: Math.abs(targetRatio - this._positionRatio) > 0.05, // needsAdjustment
      reasons, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 执行仓位调整
   * @private
   */
  _executePositionAdjustment(targetPosition, assessment, candle) { // 调用 _executePositionAdjustment
    const now = candle.timestamp || Date.now(); // 定义常量 now

    // 冷却检查 (除非是紧急情况)
    if (assessment.overallLevel !== RiskLevel.EMERGENCY && // 条件判断 assessment.overallLevel !== RiskLevel.EMERGEN...
        now - this._lastActionTime < this._actionCooldown) { // 执行语句
      return; // 返回结果
    } // 结束代码块

    if (!targetPosition.needsAdjustment) { // 条件判断 !targetPosition.needsAdjustment
      return; // 返回结果
    } // 结束代码块

    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    // ============================================
    // 紧急清仓
    // ============================================
    if (targetPosition.ratio === 0 && hasPosition) { // 条件判断 targetPosition.ratio === 0 && hasPosition
      this.setSellSignal(`紧急风控: ${targetPosition.reasons.join(', ')}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._lastActionTime = now; // 设置 _lastActionTime

      this._recordEvent({ // 调用 _recordEvent
        type: RiskEvent.FORCED_LIQUIDATION, // 类型
        timestamp: now, // 时间戳
        targetRatio: 0, // target比例
        reasons: targetPosition.reasons, // reasons
      }); // 结束代码块

      this.log(`🚨 紧急清仓 | 原因: ${targetPosition.reasons.join(', ')}`); // 调用 log
      return; // 返回结果
    } // 结束代码块

    // ============================================
    // 减仓
    // ============================================
    if (targetPosition.ratio < this._positionRatio && hasPosition) { // 条件判断 targetPosition.ratio < this._positionRatio &&...
      const reduceRatio = 1 - (targetPosition.ratio / this._positionRatio); // 定义常量 reduceRatio
      const reduceAmount = position.amount * reduceRatio; // 定义常量 reduceAmount

      this.setSellSignal(`风控减仓: ${targetPosition.reasons.join(', ')}`); // 调用 setSellSignal
      this.sell(this.symbol, reduceAmount); // 调用 sell

      this._positionRatio = targetPosition.ratio; // 设置 _positionRatio
      this._lastActionTime = now; // 设置 _lastActionTime

      this._recordEvent({ // 调用 _recordEvent
        type: RiskEvent.POSITION_REDUCED, // 类型
        timestamp: now, // 时间戳
        fromRatio: this._positionRatio + reduceRatio * this._positionRatio, // from比例
        toRatio: targetPosition.ratio, // to比例
        reasons: targetPosition.reasons, // reasons
      }); // 结束代码块

      this.log(`📉 风控减仓 | ${((1 - targetPosition.ratio) * 100).toFixed(1)}% → ${(targetPosition.ratio * 100).toFixed(1)}% | 原因: ${targetPosition.reasons.join(', ')}`); // 调用 log
    } // 结束代码块

    // ============================================
    // 加仓 (风险降低时)
    // ============================================
    if (targetPosition.ratio > this._positionRatio && // 条件判断 targetPosition.ratio > this._positionRatio &&
        assessment.overallLevel === RiskLevel.SAFE) { // 赋值 assessment.overallLevel
      // 风险降低，可以逐步加仓
      const capital = this.getCapital(); // 定义常量 capital

      if (capital > 0) { // 条件判断 capital > 0
        const increaseRatio = Math.min(0.1, targetPosition.ratio - this._positionRatio); // 定义常量 increaseRatio
        const buyAmount = capital * increaseRatio * this.positionPercent / 100; // 定义常量 buyAmount

        if (buyAmount > 0) { // 条件判断 buyAmount > 0
          this.setBuySignal(`风险降低，恢复仓位`); // 调用 setBuySignal
          this.buy(this.symbol, buyAmount / toNumber(candle.close)); // 调用 buy

          this._positionRatio += increaseRatio; // 访问 _positionRatio
          this._lastActionTime = now; // 设置 _lastActionTime

          this.log(`📈 仓位恢复 | ${((this._positionRatio - increaseRatio) * 100).toFixed(1)}% → ${(this._positionRatio * 100).toFixed(1)}%`); // 调用 log
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // 策略切换
    // ============================================
    if (this.config.enableStrategySwitching) { // 条件判断 this.config.enableStrategySwitching
      if (assessment.overallLevel === RiskLevel.HIGH || // 条件判断 assessment.overallLevel === RiskLevel.HIGH ||
          assessment.overallLevel === RiskLevel.CRITICAL) { // 赋值 assessment.overallLevel
        if (!this._isInLowRiskMode && this.config.lowRiskStrategy) { // 条件判断 !this._isInLowRiskMode && this.config.lowRisk...
          this._isInLowRiskMode = true; // 设置 _isInLowRiskMode
          this._recordEvent({ // 调用 _recordEvent
            type: RiskEvent.STRATEGY_SWITCH, // 类型
            timestamp: now, // 时间戳
            from: 'normal', // from
            to: 'low_risk', // to
            reason: assessment.overallLevel, // reason
          }); // 结束代码块
          this.log(`🔄 切换至低风险策略`); // 调用 log
        } // 结束代码块
      } else if (assessment.overallLevel === RiskLevel.SAFE) { // 执行语句
        if (this._isInLowRiskMode) { // 条件判断 this._isInLowRiskMode
          this._isInLowRiskMode = false; // 设置 _isInLowRiskMode
          this._recordEvent({ // 调用 _recordEvent
            type: RiskEvent.STRATEGY_SWITCH, // 类型
            timestamp: now, // 时间戳
            from: 'low_risk', // from
            to: 'normal', // to
            reason: 'risk_normalized', // reason
          }); // 结束代码块
          this.log(`🔄 恢复正常策略`); // 调用 log
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录事件
   * @private
   */
  _recordEvent(event) { // 调用 _recordEvent
    this._eventHistory.push(event); // 访问 _eventHistory
    if (this._eventHistory.length > 100) { // 条件判断 this._eventHistory.length > 100
      this._eventHistory.shift(); // 访问 _eventHistory
    } // 结束代码块
    this.emit('riskEvent', event); // 调用 emit
  } // 结束代码块

  /**
   * 保存指标
   * @private
   */
  _saveIndicators(assessment, targetPosition) { // 调用 _saveIndicators
    // 风险等级
    this.setIndicator('riskLevel', assessment.overallLevel); // 调用 setIndicator
    this.setIndicator('positionRatio', this._positionRatio); // 调用 setIndicator
    this.setIndicator('targetPositionRatio', targetPosition.ratio); // 调用 setIndicator

    // 波动率指标
    if (assessment.metrics.volatility) { // 条件判断 assessment.metrics.volatility
      this.setIndicator('currentVolatility', assessment.metrics.volatility.current); // 调用 setIndicator
      this.setIndicator('historicalVolatility', assessment.metrics.volatility.historical); // 调用 setIndicator
      this.setIndicator('volatilityRatio', assessment.metrics.volatility.ratio); // 调用 setIndicator
      this.setIndicator('volatilityPercentile', assessment.metrics.volatility.percentile); // 调用 setIndicator
    } // 结束代码块

    // 回撤指标
    if (assessment.metrics.drawdown) { // 条件判断 assessment.metrics.drawdown
      this.setIndicator('currentDrawdown', assessment.metrics.drawdown.current); // 调用 setIndicator
      this.setIndicator('maxDrawdown', assessment.metrics.drawdown.max); // 调用 setIndicator
      this.setIndicator('drawdownRiskLevel', assessment.metrics.drawdown.riskLevel); // 调用 setIndicator
      this.setIndicator('recoveryProgress', assessment.metrics.drawdown.recoveryProgress); // 调用 setIndicator
    } // 结束代码块

    // 目标波动率
    if (assessment.metrics.targetVolatility) { // 条件判断 assessment.metrics.targetVolatility
      this.setIndicator('targetVolRatio', assessment.metrics.targetVolatility.currentRatio); // 调用 setIndicator
      this.setIndicator('targetVolCurrent', assessment.metrics.targetVolatility.current); // 调用 setIndicator
    } // 结束代码块

    // 相关性
    if (assessment.metrics.correlation) { // 条件判断 assessment.metrics.correlation
      this.setIndicator('avgCorrelation', assessment.metrics.correlation.average); // 调用 setIndicator
      this.setIndicator('correlationSpike', assessment.metrics.correlation.hasSpike); // 调用 setIndicator
    } // 结束代码块

    // 信号数量
    this.setIndicator('activeSignals', assessment.signals.length); // 调用 setIndicator
    this.setIndicator('isLowRiskMode', this._isInLowRiskMode); // 调用 setIndicator
  } // 结束代码块

  // ============================================
  // 公开方法
  // ============================================

  /**
   * 获取当前风险状态
   * @returns {Object}
   */
  getRiskStatus() { // 调用 getRiskStatus
    return { // 返回结果
      level: this._currentRiskLevel, // 级别
      positionRatio: this._positionRatio, // 持仓比例
      isLowRiskMode: this._isInLowRiskMode, // 是否最低风险模式
      drawdown: this.drawdownMonitor.getStats(), // 回撤
      volatility: { // 波动率
        current: this.volatilityCalculator.calculate(), // current
        percentile: this.volatilityCalculator.getPercentile(), // percentile
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取事件历史
   * @param {number} limit
   * @returns {Array}
   */
  getEventHistory(limit = 50) { // 调用 getEventHistory
    return this._eventHistory.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取策略统计
   * @returns {Object}
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      riskLevel: this._currentRiskLevel, // 风险级别
      positionRatio: this._positionRatio, // 持仓比例
      isLowRiskMode: this._isInLowRiskMode, // 是否最低风险模式
      totalEvents: this._eventHistory.length, // 总Events
      recentEvents: this._eventHistory.slice(-10), // recentEvents
      volatility: this.volatilityCalculator.getHistoricalMean(), // 波动率
      drawdown: this.drawdownMonitor.getStats(), // 回撤
      targetVolState: this.targetVolManager.getState(), // target波动率State
    }; // 结束代码块
  } // 结束代码块

  /**
   * 手动触发风险评估
   * @returns {Object}
   */
  forceRiskAssessment() { // 调用 forceRiskAssessment
    return this._assessRisk(); // 返回结果
  } // 结束代码块

  /**
   * 设置目标波动率
   * @param {number} target - 目标年化波动率
   */
  setTargetVolatility(target) { // 调用 setTargetVolatility
    this.config.targetVolatility = target; // 访问 config
    this.targetVolManager.targetVol = target; // 访问 targetVolManager
    this.log(`目标波动率已更新: ${(target * 100).toFixed(1)}%`); // 调用 log
  } // 结束代码块

  /**
   * 设置最大回撤阈值
   * @param {number} threshold - 最大回撤
   */
  setMaxDrawdown(threshold) { // 调用 setMaxDrawdown
    this.config.maxDrawdown = threshold; // 访问 config
    this.drawdownMonitor.maxDrawdown = threshold; // 访问 drawdownMonitor
    this.log(`最大回撤阈值已更新: ${(threshold * 100).toFixed(1)}%`); // 调用 log
  } // 结束代码块
} // 结束代码块

export default RiskDrivenStrategy; // 默认导出
