/**
 * 市场状态检测器 (Market Regime Detector)
 *
 * 通过多种技术指标识别当前市场状态：
 * - 趋势市 (TRENDING_UP / TRENDING_DOWN)
 * - 震荡市 (RANGING)
 * - 高波动 (HIGH_VOLATILITY)
 * - 极端情况 (EXTREME)
 *
 * 技术手段：
 * - ADX: 趋势强度
 * - Bollinger Band Width: 波动率
 * - Hurst 指数: 趋势/均值回归特性
 * - ATR 百分位: 波动率水平
 */

import EventEmitter from 'eventemitter3';
import { ADX, ATR, BollingerBands, EMA, SMA, RSI, getLatest } from './indicators.js';
import { toNumber } from './helpers.js';

/**
 * 市场状态枚举
 */
export const MarketRegime = {
  TRENDING_UP: 'trending_up',       // 上涨趋势
  TRENDING_DOWN: 'trending_down',   // 下跌趋势
  RANGING: 'ranging',               // 震荡盘整
  HIGH_VOLATILITY: 'high_volatility', // 高波动
  EXTREME: 'extreme',               // 极端情况 (风控模式)
};

/**
 * 状态转换事件
 */
export const RegimeEvent = {
  REGIME_CHANGE: 'regime_change',
  VOLATILITY_SPIKE: 'volatility_spike',
  TREND_REVERSAL: 'trend_reversal',
  EXTREME_DETECTED: 'extreme_detected',
};

/**
 * 市场状态检测器类
 */
export class MarketRegimeDetector extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} params - 配置参数
   */
  constructor(params = {}) {
    super();

    // ============================================
    // ADX 参数 (趋势强度)
    // ============================================
    this.adxPeriod = params.adxPeriod || 14;
    this.adxTrendThreshold = params.adxTrendThreshold || 25;     // ADX > 25 认为有趋势
    this.adxStrongTrendThreshold = params.adxStrongTrendThreshold || 40; // ADX > 40 强趋势

    // ============================================
    // Bollinger Band Width 参数 (波动率)
    // ============================================
    this.bbPeriod = params.bbPeriod || 20;
    this.bbStdDev = params.bbStdDev || 2;
    this.bbWidthLookback = params.bbWidthLookback || 100; // 计算百分位的回溯周期

    // ============================================
    // ATR 参数 (波动率)
    // ============================================
    this.atrPeriod = params.atrPeriod || 14;
    this.atrLookback = params.atrLookback || 100;

    // ============================================
    // 波动率阈值
    // ============================================
    this.lowVolPercentile = params.lowVolPercentile || 25;      // 低波动百分位
    this.highVolPercentile = params.highVolPercentile || 75;    // 高波动百分位
    this.extremeVolPercentile = params.extremeVolPercentile || 95; // 极端波动百分位

    // ============================================
    // Hurst 指数参数
    // ============================================
    this.hurstPeriod = params.hurstPeriod || 100;
    this.hurstTrendThreshold = params.hurstTrendThreshold || 0.55;  // H > 0.55 趋势
    this.hurstMeanRevThreshold = params.hurstMeanRevThreshold || 0.45; // H < 0.45 均值回归

    // ============================================
    // 均线参数 (方向判断)
    // ============================================
    this.fastMAPeriod = params.fastMAPeriod || 10;
    this.slowMAPeriod = params.slowMAPeriod || 30;

    // ============================================
    // 状态机参数
    // ============================================
    this.minRegimeDuration = params.minRegimeDuration || 3; // 最少持续 N 根 K 线才确认切换
    this.smoothingWindow = params.smoothingWindow || 3;      // 信号平滑窗口

    // ============================================
    // 内部状态
    // ============================================
    this._currentRegime = MarketRegime.RANGING;
    this._prevRegime = MarketRegime.RANGING;
    this._regimeHistory = [];
    this._regimeCounter = 0;
    this._pendingRegime = null;

    // 历史数据存储
    this._bbWidthHistory = [];
    this._atrHistory = [];
    this._adxHistory = [];
    this._hurstHistory = [];

    // 指标缓存
    this._indicators = {};

    // 统计信息
    this._stats = {
      regimeChanges: 0,
      lastChangeTime: null,
      regimeDurations: {},
    };
  }

  /**
   * 更新市场状态 (主入口)
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史 K 线数据
   * @returns {Object} 当前状态信息
   */
  update(candle, history) {
    // 检查数据量是否足够
    const requiredLength = Math.max(
      this.adxPeriod + 10,
      this.bbPeriod + 10,
      this.atrPeriod + 10,
      this.slowMAPeriod + 10,
      this.hurstPeriod
    );

    if (history.length < requiredLength) {
      return {
        regime: this._currentRegime,
        confidence: 0,
        indicators: {},
        reason: '数据不足',
      };
    }

    // 计算所有指标
    const indicators = this._calculateIndicators(candle, history);
    this._indicators = indicators;

    // 确定候选状态
    const candidateRegime = this._determineRegime(indicators);

    // 状态机逻辑 (防止频繁切换)
    const confirmedRegime = this._processStateMachine(candidateRegime);

    // 检测状态变化
    if (confirmedRegime !== this._currentRegime) {
      this._handleRegimeChange(confirmedRegime, indicators);
    }

    // 记录历史
    this._regimeHistory.push({
      timestamp: candle.timestamp || Date.now(),
      regime: this._currentRegime,
      indicators: { ...indicators },
    });

    // 保留最近 500 条记录
    if (this._regimeHistory.length > 500) {
      this._regimeHistory.shift();
    }

    return {
      regime: this._currentRegime,
      prevRegime: this._prevRegime,
      confidence: this._calculateConfidence(indicators),
      indicators,
      recommendation: this._getStrategyRecommendation(),
    };
  }

  /**
   * 计算所有指标
   * @private
   */
  _calculateIndicators(candle, history) {
    const closes = history.map(h => toNumber(h.close));
    const currentPrice = toNumber(candle.close);

    // 1. ADX (趋势强度)
    const adxValues = ADX(history, this.adxPeriod);
    const currentADX = adxValues.length > 0 ? getLatest(adxValues) : null;
    const adx = currentADX ? currentADX.adx : 0;
    const pdi = currentADX ? currentADX.pdi : 0;
    const mdi = currentADX ? currentADX.mdi : 0;

    // 2. Bollinger Bands Width
    const bbValues = BollingerBands(closes, this.bbPeriod, this.bbStdDev);
    const currentBB = bbValues.length > 0 ? getLatest(bbValues) : null;
    let bbWidth = 0;
    if (currentBB) {
      bbWidth = ((currentBB.upper - currentBB.lower) / currentBB.middle) * 100;
    }

    // 更新 BB Width 历史
    this._bbWidthHistory.push(bbWidth);
    if (this._bbWidthHistory.length > this.bbWidthLookback) {
      this._bbWidthHistory.shift();
    }
    const bbWidthPercentile = this._calculatePercentile(bbWidth, this._bbWidthHistory);

    // 3. ATR
    const atrValues = ATR(history, this.atrPeriod);
    const currentATR = atrValues.length > 0 ? getLatest(atrValues) : 0;
    const normalizedATR = (currentATR / currentPrice) * 100;

    // 更新 ATR 历史
    this._atrHistory.push(normalizedATR);
    if (this._atrHistory.length > this.atrLookback) {
      this._atrHistory.shift();
    }
    const atrPercentile = this._calculatePercentile(normalizedATR, this._atrHistory);

    // 4. 移动平均线
    const fastMA = getLatest(EMA(closes, this.fastMAPeriod));
    const slowMA = getLatest(SMA(closes, this.slowMAPeriod));
    const maSpread = ((fastMA - slowMA) / slowMA) * 100;

    // 5. Hurst 指数
    const hurst = this._calculateHurst(closes.slice(-this.hurstPeriod));

    // 6. RSI (辅助)
    const rsiValues = RSI(closes, 14);
    const rsi = rsiValues.length > 0 ? getLatest(rsiValues) : 50;

    // 7. 价格动量
    const momentum = closes.length >= 20
      ? ((currentPrice - closes[closes.length - 20]) / closes[closes.length - 20]) * 100
      : 0;

    // 8. 综合波动率指数 (结合 BB Width 和 ATR)
    const volatilityIndex = (bbWidthPercentile + atrPercentile) / 2;

    return {
      // ADX 相关
      adx,
      pdi,
      mdi,
      trendStrength: adx,
      trendDirection: pdi > mdi ? 'up' : 'down',

      // 波动率相关
      bbWidth,
      bbWidthPercentile,
      atr: currentATR,
      normalizedATR,
      atrPercentile,
      volatilityIndex,

      // 趋势相关
      fastMA,
      slowMA,
      maSpread,
      momentum,

      // Hurst 指数
      hurst,
      hurstSignal: hurst > this.hurstTrendThreshold ? 'trending' :
                   hurst < this.hurstMeanRevThreshold ? 'mean_reverting' : 'random',

      // 辅助指标
      rsi,
      price: currentPrice,
    };
  }

  /**
   * 计算 Hurst 指数 (R/S 分析法)
   * @private
   */
  _calculateHurst(prices) {
    if (prices.length < 20) return 0.5;

    try {
      const n = prices.length;
      const logReturns = [];

      for (let i = 1; i < n; i++) {
        if (prices[i] > 0 && prices[i - 1] > 0) {
          logReturns.push(Math.log(prices[i] / prices[i - 1]));
        }
      }

      if (logReturns.length < 10) return 0.5;

      // 计算不同分组大小下的 R/S
      const sizes = [];
      const rsValues = [];

      for (let size = 10; size <= Math.floor(logReturns.length / 2); size += 5) {
        const numGroups = Math.floor(logReturns.length / size);
        if (numGroups < 2) continue;

        let rsSum = 0;
        for (let g = 0; g < numGroups; g++) {
          const group = logReturns.slice(g * size, (g + 1) * size);
          const rs = this._calculateRS(group);
          if (rs > 0) rsSum += rs;
        }

        const avgRS = rsSum / numGroups;
        if (avgRS > 0) {
          sizes.push(Math.log(size));
          rsValues.push(Math.log(avgRS));
        }
      }

      if (sizes.length < 3) return 0.5;

      // 线性回归计算斜率 (即 Hurst 指数)
      const hurst = this._linearRegressionSlope(sizes, rsValues);

      // 限制在合理范围 [0, 1]
      return Math.max(0, Math.min(1, hurst));

    } catch (e) {
      return 0.5;
    }
  }

  /**
   * 计算 R/S 值
   * @private
   */
  _calculateRS(series) {
    const n = series.length;
    if (n < 2) return 0;

    // 均值
    const mean = series.reduce((a, b) => a + b, 0) / n;

    // 累积偏差
    const cumDev = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += series[i] - mean;
      cumDev.push(sum);
    }

    // 极差 R
    const R = Math.max(...cumDev) - Math.min(...cumDev);

    // 标准差 S
    const variance = series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const S = Math.sqrt(variance);

    if (S === 0) return 0;
    return R / S;
  }

  /**
   * 线性回归斜率
   * @private
   */
  _linearRegressionSlope(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * 确定市场状态
   * @private
   */
  _determineRegime(indicators) {
    const {
      adx, pdi, mdi,
      volatilityIndex, atrPercentile,
      maSpread, momentum,
      hurst, hurstSignal
    } = indicators;

    // 1. 首先检查极端情况
    if (volatilityIndex >= this.extremeVolPercentile) {
      return MarketRegime.EXTREME;
    }

    // 2. 检查高波动
    if (volatilityIndex >= this.highVolPercentile) {
      return MarketRegime.HIGH_VOLATILITY;
    }

    // 3. 检查趋势
    const hasTrend = adx >= this.adxTrendThreshold;
    const hasStrongTrend = adx >= this.adxStrongTrendThreshold;
    const trendingByHurst = hurstSignal === 'trending';
    const maConfirmUp = maSpread > 0.5;  // 快线高于慢线 0.5%
    const maConfirmDown = maSpread < -0.5;

    // 上涨趋势: ADX 显示趋势 + PDI > MDI + MA 确认
    if (hasTrend && pdi > mdi && maConfirmUp) {
      // Hurst 确认趋势特性增加置信度
      if (hasStrongTrend || trendingByHurst) {
        return MarketRegime.TRENDING_UP;
      }
      return MarketRegime.TRENDING_UP;
    }

    // 下跌趋势: ADX 显示趋势 + MDI > PDI + MA 确认
    if (hasTrend && mdi > pdi && maConfirmDown) {
      if (hasStrongTrend || trendingByHurst) {
        return MarketRegime.TRENDING_DOWN;
      }
      return MarketRegime.TRENDING_DOWN;
    }

    // 4. 默认震荡市
    return MarketRegime.RANGING;
  }

  /**
   * 状态机处理 (防止频繁切换)
   * @private
   */
  _processStateMachine(candidateRegime) {
    // 如果候选状态与当前状态相同
    if (candidateRegime === this._currentRegime) {
      this._pendingRegime = null;
      this._regimeCounter = 0;
      return this._currentRegime;
    }

    // 极端情况立即切换
    if (candidateRegime === MarketRegime.EXTREME) {
      return candidateRegime;
    }

    // 从极端状态退出需要确认
    if (this._currentRegime === MarketRegime.EXTREME) {
      if (this._pendingRegime === candidateRegime) {
        this._regimeCounter++;
        if (this._regimeCounter >= this.minRegimeDuration) {
          this._pendingRegime = null;
          this._regimeCounter = 0;
          return candidateRegime;
        }
      } else {
        this._pendingRegime = candidateRegime;
        this._regimeCounter = 1;
      }
      return this._currentRegime;
    }

    // 正常状态切换需要确认
    if (this._pendingRegime === candidateRegime) {
      this._regimeCounter++;
      if (this._regimeCounter >= this.minRegimeDuration) {
        this._pendingRegime = null;
        this._regimeCounter = 0;
        return candidateRegime;
      }
    } else {
      this._pendingRegime = candidateRegime;
      this._regimeCounter = 1;
    }

    return this._currentRegime;
  }

  /**
   * 处理状态变化
   * @private
   */
  _handleRegimeChange(newRegime, indicators) {
    this._prevRegime = this._currentRegime;
    this._currentRegime = newRegime;
    this._stats.regimeChanges++;
    this._stats.lastChangeTime = Date.now();

    // 更新状态持续时间统计
    if (!this._stats.regimeDurations[this._prevRegime]) {
      this._stats.regimeDurations[this._prevRegime] = [];
    }

    // 发出事件
    this.emit(RegimeEvent.REGIME_CHANGE, {
      from: this._prevRegime,
      to: newRegime,
      indicators,
      timestamp: Date.now(),
    });

    // 特定事件
    if (newRegime === MarketRegime.EXTREME) {
      this.emit(RegimeEvent.EXTREME_DETECTED, { indicators });
    }

    if (newRegime === MarketRegime.HIGH_VOLATILITY) {
      this.emit(RegimeEvent.VOLATILITY_SPIKE, { indicators });
    }

    if (
      (this._prevRegime === MarketRegime.TRENDING_UP && newRegime === MarketRegime.TRENDING_DOWN) ||
      (this._prevRegime === MarketRegime.TRENDING_DOWN && newRegime === MarketRegime.TRENDING_UP)
    ) {
      this.emit(RegimeEvent.TREND_REVERSAL, {
        from: this._prevRegime,
        to: newRegime,
        indicators
      });
    }
  }

  /**
   * 计算置信度
   * @private
   */
  _calculateConfidence(indicators) {
    const { adx, volatilityIndex, hurst, hurstSignal } = indicators;
    let confidence = 50; // 基础置信度

    switch (this._currentRegime) {
      case MarketRegime.TRENDING_UP:
      case MarketRegime.TRENDING_DOWN:
        // ADX 越高置信度越高
        confidence += Math.min(25, (adx - this.adxTrendThreshold) * 1.5);
        // Hurst 确认趋势增加置信度
        if (hurstSignal === 'trending') confidence += 15;
        break;

      case MarketRegime.RANGING:
        // ADX 越低越确定是震荡
        confidence += Math.min(25, (this.adxTrendThreshold - adx) * 2);
        // Hurst 显示均值回归增加置信度
        if (hurstSignal === 'mean_reverting') confidence += 15;
        break;

      case MarketRegime.HIGH_VOLATILITY:
      case MarketRegime.EXTREME:
        // 波动率百分位越高置信度越高
        confidence += Math.min(30, (volatilityIndex - this.highVolPercentile) * 1.5);
        break;
    }

    return Math.min(100, Math.max(0, confidence));
  }

  /**
   * 获取策略推荐
   * @private
   */
  _getStrategyRecommendation() {
    switch (this._currentRegime) {
      case MarketRegime.TRENDING_UP:
        return {
          strategies: ['SMA', 'MACD', 'ATRBreakout'],
          description: '趋势上涨市 → 推荐趋势跟踪策略',
          positionSizing: 1.0,  // 正常仓位
          riskLevel: 'normal',
        };

      case MarketRegime.TRENDING_DOWN:
        return {
          strategies: ['SMA', 'MACD'],
          description: '趋势下跌市 → 推荐趋势跟踪策略 (做空或观望)',
          positionSizing: 0.8,
          riskLevel: 'caution',
        };

      case MarketRegime.RANGING:
        return {
          strategies: ['Grid', 'BollingerBands', 'RSI'],
          description: '震荡市 → 推荐网格和均值回归策略',
          positionSizing: 0.7,
          riskLevel: 'normal',
        };

      case MarketRegime.HIGH_VOLATILITY:
        return {
          strategies: ['ATRBreakout', 'BollingerWidth'],
          description: '高波动市 → 推荐波动率突破策略，降低仓位',
          positionSizing: 0.5,
          riskLevel: 'high',
        };

      case MarketRegime.EXTREME:
        return {
          strategies: [],
          description: '极端波动 → 进入风控模式，暂停开新仓',
          positionSizing: 0,
          riskLevel: 'extreme',
        };

      default:
        return {
          strategies: ['SMA'],
          description: '未知状态 → 保守操作',
          positionSizing: 0.3,
          riskLevel: 'unknown',
        };
    }
  }

  /**
   * 计算百分位
   * @private
   */
  _calculatePercentile(value, history) {
    if (history.length < 10) return 50;

    const sorted = [...history].sort((a, b) => a - b);
    let rank = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] <= value) rank++;
    }
    return (rank / sorted.length) * 100;
  }

  // ============================================
  // 公共 API
  // ============================================

  /**
   * 获取当前市场状态
   * @returns {string}
   */
  getCurrentRegime() {
    return this._currentRegime;
  }

  /**
   * 获取上一个市场状态
   * @returns {string}
   */
  getPreviousRegime() {
    return this._prevRegime;
  }

  /**
   * 获取当前指标
   * @returns {Object}
   */
  getIndicators() {
    return { ...this._indicators };
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      currentRegime: this._currentRegime,
      regimeChanges: this._stats.regimeChanges,
      lastChangeTime: this._stats.lastChangeTime,
      historyLength: this._regimeHistory.length,
    };
  }

  /**
   * 获取状态历史
   * @param {number} limit - 返回数量限制
   * @returns {Array}
   */
  getRegimeHistory(limit = 50) {
    return this._regimeHistory.slice(-limit);
  }

  /**
   * 判断当前是否适合交易
   * @returns {Object}
   */
  isTradingAllowed() {
    const regime = this._currentRegime;

    if (regime === MarketRegime.EXTREME) {
      return {
        allowed: false,
        reason: '极端波动，风控模式',
        recommendation: '等待市场稳定',
      };
    }

    return {
      allowed: true,
      regime,
      positionMultiplier: this._getStrategyRecommendation().positionSizing,
    };
  }

  /**
   * 重置检测器
   */
  reset() {
    this._currentRegime = MarketRegime.RANGING;
    this._prevRegime = MarketRegime.RANGING;
    this._regimeHistory = [];
    this._regimeCounter = 0;
    this._pendingRegime = null;
    this._bbWidthHistory = [];
    this._atrHistory = [];
    this._adxHistory = [];
    this._hurstHistory = [];
    this._indicators = {};
    this._stats = {
      regimeChanges: 0,
      lastChangeTime: null,
      regimeDurations: {},
    };
  }
}

export default MarketRegimeDetector;
