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

import BaseStrategy from './BaseStrategy.js';
import { EventEmitter } from 'events';
import { ATR, SMA, EMA, getLatest } from '../utils/indicators.js';
import { toNumber } from '../utils/helpers.js';

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 风控模式枚举
 */
export const RiskMode = {
  TARGET_VOLATILITY: 'target_volatility',   // 目标波动率
  RISK_PARITY: 'risk_parity',               // 风险平价
  MAX_DRAWDOWN: 'max_drawdown',             // 最大回撤控制
  VOLATILITY_BREAKOUT: 'volatility_breakout', // 波动率突破
  CORRELATION_MONITOR: 'correlation_monitor', // 相关性监控
  COMBINED: 'combined',                     // 组合模式
};

/**
 * 风险等级枚举
 */
export const RiskLevel = {
  SAFE: 'safe',           // 安全 - 可以正常交易
  NORMAL: 'normal',       // 正常 - 标准风险控制
  ELEVATED: 'elevated',   // 升高 - 需要减仓
  HIGH: 'high',           // 高 - 大幅减仓
  CRITICAL: 'critical',   // 严重 - 只平仓不开仓
  EMERGENCY: 'emergency', // 紧急 - 强制清仓
};

/**
 * 风控事件类型
 */
export const RiskEvent = {
  VOLATILITY_SPIKE: 'volatility_spike',
  DRAWDOWN_WARNING: 'drawdown_warning',
  DRAWDOWN_BREACH: 'drawdown_breach',
  CORRELATION_SURGE: 'correlation_surge',
  RISK_LEVEL_CHANGE: 'risk_level_change',
  POSITION_REDUCED: 'position_reduced',
  FORCED_LIQUIDATION: 'forced_liquidation',
  STRATEGY_SWITCH: 'strategy_switch',
};

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 基础参数
  // ============================================
  symbol: 'BTC/USDT',
  positionPercent: 95,

  // ============================================
  // 目标波动率参数 (Target Volatility)
  // ============================================
  targetVolatility: 0.15,           // 目标年化波动率 15%
  volatilityLookback: 20,           // 波动率计算周期
  volatilityAdjustSpeed: 0.3,       // 调整速度 (0-1, 越大越快)
  minPositionRatio: 0.1,            // 最小仓位比例 10%
  maxPositionRatio: 1.5,            // 最大仓位比例 150% (可用杠杆)

  // ============================================
  // 波动率突破参数 (Volatility Breakout)
  // ============================================
  volatilityBreakoutThreshold: 2.0, // 波动率突破倍数 (当前/历史)
  volatilityBreakoutLookback: 60,   // 历史波动率参考周期
  forceReduceRatio: 0.5,            // 突破时强制降仓比例

  // ============================================
  // 最大回撤控制参数 (Max Drawdown Control)
  // ============================================
  maxDrawdown: 0.15,                // 最大回撤阈值 15%
  warningDrawdown: 0.10,            // 预警回撤阈值 10%
  criticalDrawdown: 0.20,           // 严重回撤阈值 20%
  emergencyDrawdown: 0.25,          // 紧急回撤阈值 25%
  drawdownReduceSpeed: 0.5,         // 回撤减仓速度

  // ============================================
  // 风险平价参数 (Risk Parity)
  // ============================================
  targetRiskContribution: 'equal',  // 目标风险贡献: 'equal' 或自定义权重
  riskParityRebalanceThreshold: 0.1, // 再平衡阈值 10%
  correlationLookback: 30,          // 相关性计算周期

  // ============================================
  // 相关性监控参数 (Correlation Monitor)
  // ============================================
  correlationThreshold: 0.8,        // 高相关性阈值
  correlationSpikeMultiplier: 1.5,  // 相关性骤升倍数
  diversificationMinAssets: 3,      // 最少分散资产数

  // ============================================
  // 风险等级阈值
  // ============================================
  riskThresholds: {
    safe: { volatilityRatio: 0.5, drawdown: 0.05 },
    normal: { volatilityRatio: 1.0, drawdown: 0.08 },
    elevated: { volatilityRatio: 1.5, drawdown: 0.12 },
    high: { volatilityRatio: 2.0, drawdown: 0.18 },
    critical: { volatilityRatio: 2.5, drawdown: 0.22 },
  },

  // ============================================
  // 策略切换参数
  // ============================================
  enableStrategySwitching: true,    // 是否启用策略切换
  lowRiskStrategy: null,            // 低风险策略实例
  highRiskTolerance: 0.20,          // 高风险承受度

  // ============================================
  // 多资产支持
  // ============================================
  assets: [],                       // 多资产列表
  assetWeights: {},                 // 资产权重
};

// ============================================
// 辅助类：波动率计算器
// ============================================

/**
 * 波动率计算器
 */
class VolatilityCalculator {
  constructor(params = {}) {
    this.lookback = params.lookback || 20;
    this.annualizationFactor = params.annualizationFactor || Math.sqrt(365);
    this.returns = [];
    this.volatilityHistory = [];
  }

  /**
   * 添加收益率数据
   * @param {number} returnValue - 收益率
   */
  addReturn(returnValue) {
    this.returns.push(returnValue);
    if (this.returns.length > this.lookback * 2) {
      this.returns.shift();
    }
  }

  /**
   * 从价格序列计算收益率
   * @param {Array} prices - 价格序列
   */
  updateFromPrices(prices) {
    if (prices.length < 2) return;

    const lastPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];
    const returnValue = (lastPrice - prevPrice) / prevPrice;

    this.addReturn(returnValue);
  }

  /**
   * 计算当前波动率 (年化)
   * @returns {number}
   */
  calculate() {
    if (this.returns.length < this.lookback) {
      return null;
    }

    const recentReturns = this.returns.slice(-this.lookback);
    const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
    const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentReturns.length;
    const stdDev = Math.sqrt(variance);
    const annualizedVol = stdDev * this.annualizationFactor;

    this.volatilityHistory.push(annualizedVol);
    if (this.volatilityHistory.length > 100) {
      this.volatilityHistory.shift();
    }

    return annualizedVol;
  }

  /**
   * 获取历史平均波动率
   * @param {number} period - 周期
   * @returns {number}
   */
  getHistoricalMean(period = 60) {
    const history = this.volatilityHistory.slice(-period);
    if (history.length === 0) return null;
    return history.reduce((a, b) => a + b, 0) / history.length;
  }

  /**
   * 获取波动率百分位数
   * @returns {number} 0-100
   */
  getPercentile() {
    if (this.volatilityHistory.length < 10) return 50;

    const current = this.volatilityHistory[this.volatilityHistory.length - 1];
    const sorted = [...this.volatilityHistory].sort((a, b) => a - b);
    const index = sorted.findIndex(v => v >= current);

    return (index / sorted.length) * 100;
  }

  /**
   * 检测波动率突破
   * @param {number} multiplier - 突破倍数
   * @returns {Object}
   */
  detectBreakout(multiplier = 2.0) {
    const current = this.calculate();
    const historical = this.getHistoricalMean();

    if (!current || !historical) {
      return { isBreakout: false, ratio: 1 };
    }

    const ratio = current / historical;
    return {
      isBreakout: ratio >= multiplier,
      ratio,
      current,
      historical,
    };
  }
}

// ============================================
// 辅助类：回撤监控器
// ============================================

/**
 * 回撤监控器
 */
class DrawdownMonitor {
  constructor(params = {}) {
    this.maxDrawdown = params.maxDrawdown || 0.15;
    this.warningDrawdown = params.warningDrawdown || 0.10;
    this.criticalDrawdown = params.criticalDrawdown || 0.20;
    this.emergencyDrawdown = params.emergencyDrawdown || 0.25;

    this.peakEquity = 0;
    this.currentEquity = 0;
    this.drawdownHistory = [];
    this.maxHistoricalDrawdown = 0;
  }

  /**
   * 更新权益
   * @param {number} equity - 当前权益
   */
  update(equity) {
    this.currentEquity = equity;

    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }

    const drawdown = this.calculateDrawdown();
    this.drawdownHistory.push(drawdown);

    if (drawdown > this.maxHistoricalDrawdown) {
      this.maxHistoricalDrawdown = drawdown;
    }

    if (this.drawdownHistory.length > 1000) {
      this.drawdownHistory.shift();
    }
  }

  /**
   * 计算当前回撤
   * @returns {number}
   */
  calculateDrawdown() {
    if (this.peakEquity === 0) return 0;
    return (this.peakEquity - this.currentEquity) / this.peakEquity;
  }

  /**
   * 获取风险等级
   * @returns {string}
   */
  getRiskLevel() {
    const dd = this.calculateDrawdown();

    if (dd >= this.emergencyDrawdown) return RiskLevel.EMERGENCY;
    if (dd >= this.criticalDrawdown) return RiskLevel.CRITICAL;
    if (dd >= this.maxDrawdown) return RiskLevel.HIGH;
    if (dd >= this.warningDrawdown) return RiskLevel.ELEVATED;
    if (dd >= this.warningDrawdown * 0.5) return RiskLevel.NORMAL;
    return RiskLevel.SAFE;
  }

  /**
   * 获取建议仓位比例
   * @returns {number} 0-1
   */
  getSuggestedPositionRatio() {
    const level = this.getRiskLevel();
    const dd = this.calculateDrawdown();

    switch (level) {
      case RiskLevel.EMERGENCY:
        return 0; // 清仓
      case RiskLevel.CRITICAL:
        return 0.1; // 只保留10%
      case RiskLevel.HIGH:
        return 0.3; // 减到30%
      case RiskLevel.ELEVATED:
        // 线性减仓
        const ratio = 1 - (dd - this.warningDrawdown) / (this.maxDrawdown - this.warningDrawdown);
        return Math.max(0.5, ratio);
      case RiskLevel.NORMAL:
        return 0.8;
      default:
        return 1.0;
    }
  }

  /**
   * 获取恢复进度
   * @returns {number} 0-100%
   */
  getRecoveryProgress() {
    if (this.peakEquity === 0) return 100;
    return (this.currentEquity / this.peakEquity) * 100;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      currentDrawdown: this.calculateDrawdown(),
      maxHistoricalDrawdown: this.maxHistoricalDrawdown,
      peakEquity: this.peakEquity,
      currentEquity: this.currentEquity,
      riskLevel: this.getRiskLevel(),
      recoveryProgress: this.getRecoveryProgress(),
    };
  }
}

// ============================================
// 辅助类：相关性监控器
// ============================================

/**
 * 相关性监控器
 */
class CorrelationMonitor {
  constructor(params = {}) {
    this.lookback = params.lookback || 30;
    this.threshold = params.threshold || 0.8;
    this.spikeMultiplier = params.spikeMultiplier || 1.5;

    this.returnsSeries = {}; // { symbol: [returns] }
    this.correlationMatrix = {}; // { 'A-B': correlation }
    this.historicalCorrelations = {}; // { 'A-B': [history] }
  }

  /**
   * 更新资产收益率
   * @param {string} symbol - 资产标识
   * @param {number} returnValue - 收益率
   */
  updateReturn(symbol, returnValue) {
    if (!this.returnsSeries[symbol]) {
      this.returnsSeries[symbol] = [];
    }

    this.returnsSeries[symbol].push(returnValue);

    if (this.returnsSeries[symbol].length > this.lookback * 2) {
      this.returnsSeries[symbol].shift();
    }
  }

  /**
   * 计算两个资产的相关性
   * @param {string} symbolA
   * @param {string} symbolB
   * @returns {number}
   */
  calculateCorrelation(symbolA, symbolB) {
    const returnsA = this.returnsSeries[symbolA];
    const returnsB = this.returnsSeries[symbolB];

    if (!returnsA || !returnsB) return 0;

    const n = Math.min(returnsA.length, returnsB.length, this.lookback);
    if (n < 10) return 0;

    const a = returnsA.slice(-n);
    const b = returnsB.slice(-n);

    const meanA = a.reduce((s, v) => s + v, 0) / n;
    const meanB = b.reduce((s, v) => s + v, 0) / n;

    let cov = 0, varA = 0, varB = 0;

    for (let i = 0; i < n; i++) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      cov += da * db;
      varA += da * da;
      varB += db * db;
    }

    if (varA === 0 || varB === 0) return 0;

    return cov / Math.sqrt(varA * varB);
  }

  /**
   * 更新相关性矩阵
   */
  updateMatrix() {
    const symbols = Object.keys(this.returnsSeries);

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const key = `${symbols[i]}-${symbols[j]}`;
        const corr = this.calculateCorrelation(symbols[i], symbols[j]);

        this.correlationMatrix[key] = corr;

        if (!this.historicalCorrelations[key]) {
          this.historicalCorrelations[key] = [];
        }
        this.historicalCorrelations[key].push(corr);

        if (this.historicalCorrelations[key].length > 100) {
          this.historicalCorrelations[key].shift();
        }
      }
    }
  }

  /**
   * 检测相关性骤升
   * @returns {Object}
   */
  detectCorrelationSpike() {
    const spikes = [];

    for (const [pair, history] of Object.entries(this.historicalCorrelations)) {
      if (history.length < 10) continue;

      const current = history[history.length - 1];
      const historical = history.slice(0, -1);
      const mean = historical.reduce((a, b) => a + b, 0) / historical.length;

      // 绝对值增加检测
      const spike = Math.abs(current) - Math.abs(mean);

      if (spike > 0 && Math.abs(current) / (Math.abs(mean) + 0.01) >= this.spikeMultiplier) {
        spikes.push({
          pair,
          current,
          historical: mean,
          spikeRatio: Math.abs(current) / (Math.abs(mean) + 0.01),
        });
      }
    }

    return {
      hasSpike: spikes.length > 0,
      spikes,
      avgCorrelation: this.getAverageCorrelation(),
    };
  }

  /**
   * 获取平均相关性
   * @returns {number}
   */
  getAverageCorrelation() {
    const correlations = Object.values(this.correlationMatrix);
    if (correlations.length === 0) return 0;

    const absCorr = correlations.map(c => Math.abs(c));
    return absCorr.reduce((a, b) => a + b, 0) / absCorr.length;
  }

  /**
   * 获取高相关性资产对
   * @returns {Array}
   */
  getHighCorrelationPairs() {
    return Object.entries(this.correlationMatrix)
      .filter(([, corr]) => Math.abs(corr) >= this.threshold)
      .map(([pair, corr]) => ({ pair, correlation: corr }))
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  /**
   * 获取分散化建议
   * @returns {Object}
   */
  getDiversificationAdvice() {
    const highCorr = this.getHighCorrelationPairs();
    const avgCorr = this.getAverageCorrelation();

    return {
      wellDiversified: avgCorr < 0.5 && highCorr.length === 0,
      averageCorrelation: avgCorr,
      highCorrelationPairs: highCorr,
      recommendation: avgCorr >= 0.7 ? 'reduce_exposure' :
                      avgCorr >= 0.5 ? 'monitor_closely' : 'acceptable',
    };
  }
}

// ============================================
// 辅助类：目标波动率管理器
// ============================================

/**
 * 目标波动率管理器
 */
class TargetVolatilityManager {
  constructor(params = {}) {
    this.targetVol = params.targetVolatility || 0.15;
    this.adjustSpeed = params.adjustSpeed || 0.3;
    this.minRatio = params.minPositionRatio || 0.1;
    this.maxRatio = params.maxPositionRatio || 1.5;

    this.currentPositionRatio = 1.0;
    this.volatilityCalculator = new VolatilityCalculator({
      lookback: params.lookback || 20,
    });
  }

  /**
   * 更新并计算目标仓位
   * @param {Array} prices - 价格序列
   * @returns {Object}
   */
  update(prices) {
    this.volatilityCalculator.updateFromPrices(prices);
    const currentVol = this.volatilityCalculator.calculate();

    if (!currentVol) {
      return {
        targetRatio: this.currentPositionRatio,
        currentVolatility: null,
        adjustment: 0,
      };
    }

    // 目标仓位 = 目标波动率 / 当前波动率
    const rawTargetRatio = this.targetVol / currentVol;

    // 限制在范围内
    const clampedRatio = Math.max(this.minRatio, Math.min(this.maxRatio, rawTargetRatio));

    // 平滑调整
    const adjustment = (clampedRatio - this.currentPositionRatio) * this.adjustSpeed;
    this.currentPositionRatio += adjustment;

    // 再次限制
    this.currentPositionRatio = Math.max(this.minRatio, Math.min(this.maxRatio, this.currentPositionRatio));

    return {
      targetRatio: this.currentPositionRatio,
      rawRatio: rawTargetRatio,
      currentVolatility: currentVol,
      targetVolatility: this.targetVol,
      adjustment,
      needsRebalance: Math.abs(adjustment) > 0.05,
    };
  }

  /**
   * 获取当前状态
   */
  getState() {
    return {
      currentRatio: this.currentPositionRatio,
      targetVol: this.targetVol,
      volatilityHistory: this.volatilityCalculator.volatilityHistory,
    };
  }
}

// ============================================
// 辅助类：风险平价管理器
// ============================================

/**
 * 风险平价管理器
 */
class RiskParityManager {
  constructor(params = {}) {
    this.rebalanceThreshold = params.rebalanceThreshold || 0.1;
    this.lookback = params.lookback || 30;

    this.assetVolatilities = {}; // { symbol: volatility }
    this.assetWeights = {}; // { symbol: weight }
    this.targetRiskContributions = {}; // { symbol: contribution }
  }

  /**
   * 更新资产波动率
   * @param {string} symbol
   * @param {Array} prices
   */
  updateAssetVolatility(symbol, prices) {
    if (prices.length < this.lookback) return;

    // 计算收益率
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    // 计算波动率
    const recentReturns = returns.slice(-this.lookback);
    const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
    const variance = recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentReturns.length;

    this.assetVolatilities[symbol] = Math.sqrt(variance) * Math.sqrt(365);
  }

  /**
   * 计算风险平价权重
   * @returns {Object}
   */
  calculateRiskParityWeights() {
    const symbols = Object.keys(this.assetVolatilities);
    if (symbols.length === 0) return {};

    // 简化版风险平价：权重 ∝ 1/波动率
    const inverseVols = {};
    let sumInverseVol = 0;

    for (const symbol of symbols) {
      const vol = this.assetVolatilities[symbol];
      if (vol > 0) {
        inverseVols[symbol] = 1 / vol;
        sumInverseVol += inverseVols[symbol];
      }
    }

    // 归一化
    const weights = {};
    for (const symbol of symbols) {
      weights[symbol] = (inverseVols[symbol] || 0) / sumInverseVol;
    }

    this.assetWeights = weights;
    return weights;
  }

  /**
   * 计算每个资产的风险贡献
   * @returns {Object}
   */
  calculateRiskContributions() {
    const contributions = {};
    let totalRisk = 0;

    for (const [symbol, weight] of Object.entries(this.assetWeights)) {
      const vol = this.assetVolatilities[symbol] || 0;
      const marginalRisk = weight * vol;
      contributions[symbol] = marginalRisk;
      totalRisk += marginalRisk;
    }

    // 归一化为百分比
    for (const symbol of Object.keys(contributions)) {
      contributions[symbol] = totalRisk > 0 ? contributions[symbol] / totalRisk : 0;
    }

    return contributions;
  }

  /**
   * 检查是否需要再平衡
   * @returns {Object}
   */
  checkRebalanceNeeded() {
    const currentContributions = this.calculateRiskContributions();
    const symbols = Object.keys(currentContributions);
    const targetContribution = 1 / symbols.length;

    let maxDeviation = 0;
    const deviations = {};

    for (const symbol of symbols) {
      const deviation = Math.abs(currentContributions[symbol] - targetContribution);
      deviations[symbol] = deviation;
      maxDeviation = Math.max(maxDeviation, deviation);
    }

    return {
      needsRebalance: maxDeviation > this.rebalanceThreshold,
      maxDeviation,
      deviations,
      currentContributions,
      targetContribution,
      suggestedWeights: this.calculateRiskParityWeights(),
    };
  }
}

// ============================================
// 主策略类：风控驱动策略
// ============================================

/**
 * 风控驱动策略
 */
export class RiskDrivenStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) {
    super(params);

    this.name = params.name || 'RiskDrivenStrategy';

    // 合并配置
    this.config = { ...DEFAULT_CONFIG, ...params };

    // ============================================
    // 主要参数
    // ============================================
    this.symbol = this.config.symbol;
    this.positionPercent = this.config.positionPercent;
    this.riskMode = params.riskMode || RiskMode.COMBINED;

    // ============================================
    // 初始化各模块
    // ============================================

    // 波动率计算器
    this.volatilityCalculator = new VolatilityCalculator({
      lookback: this.config.volatilityLookback,
    });

    // 回撤监控器
    this.drawdownMonitor = new DrawdownMonitor({
      maxDrawdown: this.config.maxDrawdown,
      warningDrawdown: this.config.warningDrawdown,
      criticalDrawdown: this.config.criticalDrawdown,
      emergencyDrawdown: this.config.emergencyDrawdown,
    });

    // 相关性监控器 (多资产)
    this.correlationMonitor = new CorrelationMonitor({
      lookback: this.config.correlationLookback,
      threshold: this.config.correlationThreshold,
      spikeMultiplier: this.config.correlationSpikeMultiplier,
    });

    // 目标波动率管理器
    this.targetVolManager = new TargetVolatilityManager({
      targetVolatility: this.config.targetVolatility,
      adjustSpeed: this.config.volatilityAdjustSpeed,
      minPositionRatio: this.config.minPositionRatio,
      maxPositionRatio: this.config.maxPositionRatio,
      lookback: this.config.volatilityLookback,
    });

    // 风险平价管理器
    this.riskParityManager = new RiskParityManager({
      rebalanceThreshold: this.config.riskParityRebalanceThreshold,
      lookback: this.config.correlationLookback,
    });

    // ============================================
    // 内部状态
    // ============================================
    this._currentRiskLevel = RiskLevel.NORMAL;
    this._positionRatio = 1.0;
    this._priceHistory = [];
    this._eventHistory = [];
    this._lastActionTime = 0;
    this._actionCooldown = 60000; // 1分钟冷却
    this._isInLowRiskMode = false;
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();

    this.log(`风控驱动策略初始化`);
    this.log(`模式: ${this.riskMode}`);
    this.log(`目标波动率: ${(this.config.targetVolatility * 100).toFixed(1)}%`);
    this.log(`最大回撤阈值: ${(this.config.maxDrawdown * 100).toFixed(1)}%`);

    // 初始化权益
    const equity = this.getEquity();
    if (equity) {
      this.drawdownMonitor.update(equity);
    }
  }

  /**
   * 主交易逻辑
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) {
    const minRequired = Math.max(
      this.config.volatilityLookback,
      this.config.volatilityBreakoutLookback,
      this.config.correlationLookback
    );

    if (history.length < minRequired) {
      return;
    }

    const currentPrice = toNumber(candle.close);
    const closes = history.map(h => toNumber(h.close));

    // 更新价格历史
    this._priceHistory.push(currentPrice);
    if (this._priceHistory.length > 500) {
      this._priceHistory.shift();
    }

    // ============================================
    // 1. 更新所有风控模块
    // ============================================
    this._updateRiskModules(candle, history, closes);

    // ============================================
    // 2. 评估综合风险等级
    // ============================================
    const riskAssessment = this._assessRisk();

    // ============================================
    // 3. 根据风险等级计算目标仓位
    // ============================================
    const targetPosition = this._calculateTargetPosition(riskAssessment);

    // ============================================
    // 4. 执行仓位调整
    // ============================================
    this._executePositionAdjustment(targetPosition, riskAssessment, candle);

    // ============================================
    // 5. 保存指标
    // ============================================
    this._saveIndicators(riskAssessment, targetPosition);
  }

  /**
   * 更新风控模块
   * @private
   */
  _updateRiskModules(candle, history, closes) {
    // 更新波动率
    this.volatilityCalculator.updateFromPrices(closes);

    // 更新权益和回撤
    const equity = this.getEquity();
    if (equity) {
      this.drawdownMonitor.update(equity);
    }

    // 更新目标波动率管理器
    this.targetVolManager.update(closes);

    // 如果有多资产，更新相关性和风险平价
    if (this.config.assets.length > 1) {
      // 单资产时计算自身收益率
      if (closes.length >= 2) {
        const ret = (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2];
        this.correlationMonitor.updateReturn(this.symbol, ret);
      }
      this.correlationMonitor.updateMatrix();
      this.riskParityManager.updateAssetVolatility(this.symbol, closes);
    }
  }

  /**
   * 综合风险评估
   * @private
   * @returns {Object}
   */
  _assessRisk() {
    const assessment = {
      overallLevel: RiskLevel.NORMAL,
      signals: [],
      actions: [],
      metrics: {},
    };

    // ============================================
    // 1. 波动率突破检测
    // ============================================
    if (this.riskMode === RiskMode.VOLATILITY_BREAKOUT ||
        this.riskMode === RiskMode.COMBINED) {
      const breakout = this.volatilityCalculator.detectBreakout(
        this.config.volatilityBreakoutThreshold
      );

      assessment.metrics.volatility = {
        current: breakout.current,
        historical: breakout.historical,
        ratio: breakout.ratio,
        isBreakout: breakout.isBreakout,
        percentile: this.volatilityCalculator.getPercentile(),
      };

      if (breakout.isBreakout) {
        assessment.signals.push({
          type: RiskEvent.VOLATILITY_SPIKE,
          severity: 'high',
          message: `波动率突破 | 当前: ${(breakout.current * 100).toFixed(1)}% vs 历史: ${(breakout.historical * 100).toFixed(1)}% (${breakout.ratio.toFixed(1)}x)`,
        });
        assessment.actions.push({
          action: 'reduce_position',
          ratio: this.config.forceReduceRatio,
          reason: 'volatility_breakout',
        });
      }
    }

    // ============================================
    // 2. 回撤控制
    // ============================================
    if (this.riskMode === RiskMode.MAX_DRAWDOWN ||
        this.riskMode === RiskMode.COMBINED) {
      const drawdownStats = this.drawdownMonitor.getStats();
      const ddRiskLevel = this.drawdownMonitor.getRiskLevel();
      const suggestedRatio = this.drawdownMonitor.getSuggestedPositionRatio();

      assessment.metrics.drawdown = {
        current: drawdownStats.currentDrawdown,
        max: drawdownStats.maxHistoricalDrawdown,
        riskLevel: ddRiskLevel,
        suggestedRatio,
        recoveryProgress: drawdownStats.recoveryProgress,
      };

      // 根据回撤等级生成信号
      if (ddRiskLevel === RiskLevel.EMERGENCY) {
        assessment.signals.push({
          type: RiskEvent.FORCED_LIQUIDATION,
          severity: 'emergency',
          message: `紧急回撤 ${(drawdownStats.currentDrawdown * 100).toFixed(1)}% - 强制清仓`,
        });
        assessment.actions.push({
          action: 'close_all',
          ratio: 0,
          reason: 'emergency_drawdown',
        });
      } else if (ddRiskLevel === RiskLevel.CRITICAL) {
        assessment.signals.push({
          type: RiskEvent.DRAWDOWN_BREACH,
          severity: 'critical',
          message: `严重回撤 ${(drawdownStats.currentDrawdown * 100).toFixed(1)}% - 大幅减仓`,
        });
        assessment.actions.push({
          action: 'reduce_position',
          ratio: suggestedRatio,
          reason: 'critical_drawdown',
        });
      } else if (ddRiskLevel === RiskLevel.HIGH) {
        assessment.signals.push({
          type: RiskEvent.DRAWDOWN_BREACH,
          severity: 'high',
          message: `高回撤 ${(drawdownStats.currentDrawdown * 100).toFixed(1)}%`,
        });
        assessment.actions.push({
          action: 'reduce_position',
          ratio: suggestedRatio,
          reason: 'high_drawdown',
        });
      } else if (ddRiskLevel === RiskLevel.ELEVATED) {
        assessment.signals.push({
          type: RiskEvent.DRAWDOWN_WARNING,
          severity: 'elevated',
          message: `回撤预警 ${(drawdownStats.currentDrawdown * 100).toFixed(1)}%`,
        });
        assessment.actions.push({
          action: 'reduce_position',
          ratio: suggestedRatio,
          reason: 'elevated_drawdown',
        });
      }
    }

    // ============================================
    // 3. 目标波动率
    // ============================================
    if (this.riskMode === RiskMode.TARGET_VOLATILITY ||
        this.riskMode === RiskMode.COMBINED) {
      const tvState = this.targetVolManager.getState();
      const tvUpdate = this.targetVolManager.update(this._priceHistory);

      assessment.metrics.targetVolatility = {
        current: tvUpdate.currentVolatility,
        target: tvUpdate.targetVolatility,
        currentRatio: tvUpdate.targetRatio,
        needsRebalance: tvUpdate.needsRebalance,
      };

      if (tvUpdate.needsRebalance) {
        assessment.actions.push({
          action: 'adjust_position',
          ratio: tvUpdate.targetRatio,
          reason: 'target_volatility',
        });
      }
    }

    // ============================================
    // 4. 相关性监控 (多资产)
    // ============================================
    if ((this.riskMode === RiskMode.CORRELATION_MONITOR ||
        this.riskMode === RiskMode.COMBINED) &&
        this.config.assets.length > 1) {
      const corrSpike = this.correlationMonitor.detectCorrelationSpike();
      const diversification = this.correlationMonitor.getDiversificationAdvice();

      assessment.metrics.correlation = {
        average: corrSpike.avgCorrelation,
        hasSpike: corrSpike.hasSpike,
        spikes: corrSpike.spikes,
        diversification,
      };

      if (corrSpike.hasSpike) {
        assessment.signals.push({
          type: RiskEvent.CORRELATION_SURGE,
          severity: 'elevated',
          message: `相关性骤升 | 平均: ${(corrSpike.avgCorrelation * 100).toFixed(1)}%`,
        });
        assessment.actions.push({
          action: 'reduce_exposure',
          ratio: 0.7,
          reason: 'correlation_surge',
        });
      }
    }

    // ============================================
    // 5. 风险平价 (多资产)
    // ============================================
    if ((this.riskMode === RiskMode.RISK_PARITY ||
        this.riskMode === RiskMode.COMBINED) &&
        this.config.assets.length > 1) {
      const rebalance = this.riskParityManager.checkRebalanceNeeded();

      assessment.metrics.riskParity = {
        needsRebalance: rebalance.needsRebalance,
        maxDeviation: rebalance.maxDeviation,
        suggestedWeights: rebalance.suggestedWeights,
      };

      if (rebalance.needsRebalance) {
        assessment.actions.push({
          action: 'rebalance',
          weights: rebalance.suggestedWeights,
          reason: 'risk_parity',
        });
      }
    }

    // ============================================
    // 6. 确定综合风险等级
    // ============================================
    const severities = assessment.signals.map(s => s.severity);

    if (severities.includes('emergency')) {
      assessment.overallLevel = RiskLevel.EMERGENCY;
    } else if (severities.includes('critical')) {
      assessment.overallLevel = RiskLevel.CRITICAL;
    } else if (severities.includes('high')) {
      assessment.overallLevel = RiskLevel.HIGH;
    } else if (severities.includes('elevated')) {
      assessment.overallLevel = RiskLevel.ELEVATED;
    } else if (assessment.actions.length > 0) {
      assessment.overallLevel = RiskLevel.NORMAL;
    } else {
      assessment.overallLevel = RiskLevel.SAFE;
    }

    // 检测风险等级变化
    if (assessment.overallLevel !== this._currentRiskLevel) {
      assessment.signals.push({
        type: RiskEvent.RISK_LEVEL_CHANGE,
        severity: 'info',
        message: `风险等级变化: ${this._currentRiskLevel} → ${assessment.overallLevel}`,
      });
      this._currentRiskLevel = assessment.overallLevel;
    }

    return assessment;
  }

  /**
   * 计算目标仓位
   * @private
   */
  _calculateTargetPosition(assessment) {
    let targetRatio = 1.0;
    const reasons = [];

    // 根据 actions 确定最保守的仓位
    for (const action of assessment.actions) {
      if (action.action === 'close_all') {
        targetRatio = 0;
        reasons.push('emergency_close');
        break;
      } else if (action.action === 'reduce_position' ||
                 action.action === 'adjust_position' ||
                 action.action === 'reduce_exposure') {
        if (action.ratio < targetRatio) {
          targetRatio = action.ratio;
          reasons.push(action.reason);
        }
      }
    }

    // 限制范围
    targetRatio = Math.max(0, Math.min(this.config.maxPositionRatio, targetRatio));

    return {
      ratio: targetRatio,
      currentRatio: this._positionRatio,
      change: targetRatio - this._positionRatio,
      needsAdjustment: Math.abs(targetRatio - this._positionRatio) > 0.05,
      reasons,
    };
  }

  /**
   * 执行仓位调整
   * @private
   */
  _executePositionAdjustment(targetPosition, assessment, candle) {
    const now = candle.timestamp || Date.now();

    // 冷却检查 (除非是紧急情况)
    if (assessment.overallLevel !== RiskLevel.EMERGENCY &&
        now - this._lastActionTime < this._actionCooldown) {
      return;
    }

    if (!targetPosition.needsAdjustment) {
      return;
    }

    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // ============================================
    // 紧急清仓
    // ============================================
    if (targetPosition.ratio === 0 && hasPosition) {
      this.setSellSignal(`紧急风控: ${targetPosition.reasons.join(', ')}`);
      this.closePosition(this.symbol);
      this._lastActionTime = now;

      this._recordEvent({
        type: RiskEvent.FORCED_LIQUIDATION,
        timestamp: now,
        targetRatio: 0,
        reasons: targetPosition.reasons,
      });

      this.log(`🚨 紧急清仓 | 原因: ${targetPosition.reasons.join(', ')}`);
      return;
    }

    // ============================================
    // 减仓
    // ============================================
    if (targetPosition.ratio < this._positionRatio && hasPosition) {
      const reduceRatio = 1 - (targetPosition.ratio / this._positionRatio);
      const reduceAmount = position.amount * reduceRatio;

      this.setSellSignal(`风控减仓: ${targetPosition.reasons.join(', ')}`);
      this.sell(this.symbol, reduceAmount);

      this._positionRatio = targetPosition.ratio;
      this._lastActionTime = now;

      this._recordEvent({
        type: RiskEvent.POSITION_REDUCED,
        timestamp: now,
        fromRatio: this._positionRatio + reduceRatio * this._positionRatio,
        toRatio: targetPosition.ratio,
        reasons: targetPosition.reasons,
      });

      this.log(`📉 风控减仓 | ${((1 - targetPosition.ratio) * 100).toFixed(1)}% → ${(targetPosition.ratio * 100).toFixed(1)}% | 原因: ${targetPosition.reasons.join(', ')}`);
    }

    // ============================================
    // 加仓 (风险降低时)
    // ============================================
    if (targetPosition.ratio > this._positionRatio &&
        assessment.overallLevel === RiskLevel.SAFE) {
      // 风险降低，可以逐步加仓
      const capital = this.getCapital();

      if (capital > 0) {
        const increaseRatio = Math.min(0.1, targetPosition.ratio - this._positionRatio);
        const buyAmount = capital * increaseRatio * this.positionPercent / 100;

        if (buyAmount > 0) {
          this.setBuySignal(`风险降低，恢复仓位`);
          this.buy(this.symbol, buyAmount / toNumber(candle.close));

          this._positionRatio += increaseRatio;
          this._lastActionTime = now;

          this.log(`📈 仓位恢复 | ${((this._positionRatio - increaseRatio) * 100).toFixed(1)}% → ${(this._positionRatio * 100).toFixed(1)}%`);
        }
      }
    }

    // ============================================
    // 策略切换
    // ============================================
    if (this.config.enableStrategySwitching) {
      if (assessment.overallLevel === RiskLevel.HIGH ||
          assessment.overallLevel === RiskLevel.CRITICAL) {
        if (!this._isInLowRiskMode && this.config.lowRiskStrategy) {
          this._isInLowRiskMode = true;
          this._recordEvent({
            type: RiskEvent.STRATEGY_SWITCH,
            timestamp: now,
            from: 'normal',
            to: 'low_risk',
            reason: assessment.overallLevel,
          });
          this.log(`🔄 切换至低风险策略`);
        }
      } else if (assessment.overallLevel === RiskLevel.SAFE) {
        if (this._isInLowRiskMode) {
          this._isInLowRiskMode = false;
          this._recordEvent({
            type: RiskEvent.STRATEGY_SWITCH,
            timestamp: now,
            from: 'low_risk',
            to: 'normal',
            reason: 'risk_normalized',
          });
          this.log(`🔄 恢复正常策略`);
        }
      }
    }
  }

  /**
   * 记录事件
   * @private
   */
  _recordEvent(event) {
    this._eventHistory.push(event);
    if (this._eventHistory.length > 100) {
      this._eventHistory.shift();
    }
    this.emit('riskEvent', event);
  }

  /**
   * 保存指标
   * @private
   */
  _saveIndicators(assessment, targetPosition) {
    // 风险等级
    this.setIndicator('riskLevel', assessment.overallLevel);
    this.setIndicator('positionRatio', this._positionRatio);
    this.setIndicator('targetPositionRatio', targetPosition.ratio);

    // 波动率指标
    if (assessment.metrics.volatility) {
      this.setIndicator('currentVolatility', assessment.metrics.volatility.current);
      this.setIndicator('historicalVolatility', assessment.metrics.volatility.historical);
      this.setIndicator('volatilityRatio', assessment.metrics.volatility.ratio);
      this.setIndicator('volatilityPercentile', assessment.metrics.volatility.percentile);
    }

    // 回撤指标
    if (assessment.metrics.drawdown) {
      this.setIndicator('currentDrawdown', assessment.metrics.drawdown.current);
      this.setIndicator('maxDrawdown', assessment.metrics.drawdown.max);
      this.setIndicator('drawdownRiskLevel', assessment.metrics.drawdown.riskLevel);
      this.setIndicator('recoveryProgress', assessment.metrics.drawdown.recoveryProgress);
    }

    // 目标波动率
    if (assessment.metrics.targetVolatility) {
      this.setIndicator('targetVolRatio', assessment.metrics.targetVolatility.currentRatio);
      this.setIndicator('targetVolCurrent', assessment.metrics.targetVolatility.current);
    }

    // 相关性
    if (assessment.metrics.correlation) {
      this.setIndicator('avgCorrelation', assessment.metrics.correlation.average);
      this.setIndicator('correlationSpike', assessment.metrics.correlation.hasSpike);
    }

    // 信号数量
    this.setIndicator('activeSignals', assessment.signals.length);
    this.setIndicator('isLowRiskMode', this._isInLowRiskMode);
  }

  // ============================================
  // 公开方法
  // ============================================

  /**
   * 获取当前风险状态
   * @returns {Object}
   */
  getRiskStatus() {
    return {
      level: this._currentRiskLevel,
      positionRatio: this._positionRatio,
      isLowRiskMode: this._isInLowRiskMode,
      drawdown: this.drawdownMonitor.getStats(),
      volatility: {
        current: this.volatilityCalculator.calculate(),
        percentile: this.volatilityCalculator.getPercentile(),
      },
    };
  }

  /**
   * 获取事件历史
   * @param {number} limit
   * @returns {Array}
   */
  getEventHistory(limit = 50) {
    return this._eventHistory.slice(-limit);
  }

  /**
   * 获取策略统计
   * @returns {Object}
   */
  getStats() {
    return {
      riskLevel: this._currentRiskLevel,
      positionRatio: this._positionRatio,
      isLowRiskMode: this._isInLowRiskMode,
      totalEvents: this._eventHistory.length,
      recentEvents: this._eventHistory.slice(-10),
      volatility: this.volatilityCalculator.getHistoricalMean(),
      drawdown: this.drawdownMonitor.getStats(),
      targetVolState: this.targetVolManager.getState(),
    };
  }

  /**
   * 手动触发风险评估
   * @returns {Object}
   */
  forceRiskAssessment() {
    return this._assessRisk();
  }

  /**
   * 设置目标波动率
   * @param {number} target - 目标年化波动率
   */
  setTargetVolatility(target) {
    this.config.targetVolatility = target;
    this.targetVolManager.targetVol = target;
    this.log(`目标波动率已更新: ${(target * 100).toFixed(1)}%`);
  }

  /**
   * 设置最大回撤阈值
   * @param {number} threshold - 最大回撤
   */
  setMaxDrawdown(threshold) {
    this.config.maxDrawdown = threshold;
    this.drawdownMonitor.maxDrawdown = threshold;
    this.log(`最大回撤阈值已更新: ${(threshold * 100).toFixed(1)}%`);
  }
}

export default RiskDrivenStrategy;
