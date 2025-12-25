/**
 * 波动率收缩因子
 * Volatility Contraction Factor
 *
 * 衡量波动率是否正在收缩（布林带挤压等）
 * 波动率收缩往往预示着即将到来的大行情
 *
 * Measures volatility contraction (Bollinger squeeze, etc.)
 * Volatility contraction often precedes significant price moves
 */

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js';

/**
 * 波动率测量方法
 * Volatility Measurement Methods
 */
export const VOLATILITY_METHOD = {
  BOLLINGER_WIDTH: 'bb_width',      // 布林带宽度
  ATR_RATIO: 'atr_ratio',           // ATR 与历史 ATR 比值
  KELTNER_SQUEEZE: 'keltner',       // 肯特纳通道挤压
  HISTORICAL_RANK: 'hist_rank',     // 历史波动率百分位
  REALIZED_VS_IMPLIED: 'rv_iv',     // 实现波动率 vs 隐含 (需要期权数据)
};

/**
 * 波动率收缩因子类
 * Volatility Contraction Factor Class
 */
export class VolatilityFactor extends BaseFactor {
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 计算周期
   * @param {number} config.lookbackPeriod - 历史回看周期 (用于百分位计算)
   * @param {string} config.method - 计算方法
   * @param {number} config.bbStdDev - 布林带标准差倍数
   */
  constructor(config = {}) {
    const period = config.period || 20;
    const method = config.method || VOLATILITY_METHOD.BOLLINGER_WIDTH;

    super({
      name: config.name || `Volatility_${method}_${period}`,
      category: FACTOR_CATEGORY.VOLATILITY,
      direction: FACTOR_DIRECTION.NEGATIVE, // 低波动率 → 预期突破 (方向不定)
      frequency: FACTOR_FREQUENCY.DAILY,
      description: `波动率收缩因子 (${method}, ${period}周期)`,
      params: {
        period,
        method,
        lookbackPeriod: config.lookbackPeriod || 60,
        bbStdDev: config.bbStdDev || 2,
        atrPeriod: config.atrPeriod || 14,
        keltnerMultiplier: config.keltnerMultiplier || 1.5,
        minDataPoints: config.minDataPoints || Math.ceil(period * 0.8),
      },
      ...config,
    });
  }

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.candles - K线数据
   * @returns {Promise<number|null>} 波动率收缩值 (越小表示越收缩)
   */
  async calculate(symbol, data, context = {}) {
    const { candles } = data;
    const { method, minDataPoints, lookbackPeriod } = this.params;

    if (!candles || candles.length < minDataPoints) {
      return null;
    }

    let value;

    switch (method) {
      case VOLATILITY_METHOD.BOLLINGER_WIDTH:
        value = this._calculateBollingerWidth(candles);
        break;

      case VOLATILITY_METHOD.ATR_RATIO:
        value = this._calculateATRRatio(candles);
        break;

      case VOLATILITY_METHOD.KELTNER_SQUEEZE:
        value = this._calculateKeltnerSqueeze(candles);
        break;

      case VOLATILITY_METHOD.HISTORICAL_RANK:
        value = this._calculateHistoricalRank(candles);
        break;

      default:
        value = this._calculateBollingerWidth(candles);
    }

    return value;
  }

  /**
   * 计算布林带宽度
   * Calculate Bollinger Band Width
   * @private
   */
  _calculateBollingerWidth(candles) {
    const { period, bbStdDev } = this.params;
    const closes = candles.slice(-period).map(c => parseFloat(c.close));

    if (closes.length < period) return null;

    // 计算 SMA / Calculate SMA
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length;

    // 计算标准差 / Calculate standard deviation
    const variance = closes.reduce((acc, c) => acc + Math.pow(c - sma, 2), 0) / closes.length;
    const std = Math.sqrt(variance);

    // 布林带上下轨 / Bollinger upper and lower bands
    const upper = sma + bbStdDev * std;
    const lower = sma - bbStdDev * std;

    // 带宽百分比 / Band width percentage
    if (sma === 0) return null;

    const width = ((upper - lower) / sma) * 100;

    return width;
  }

  /**
   * 计算 ATR 比值
   * Calculate ATR Ratio (current ATR / historical average ATR)
   * @private
   */
  _calculateATRRatio(candles) {
    const { atrPeriod, lookbackPeriod } = this.params;

    if (candles.length < lookbackPeriod) return null;

    // 计算所有 ATR / Calculate all ATR values
    const atrValues = [];
    for (let i = atrPeriod; i < candles.length; i++) {
      const slice = candles.slice(i - atrPeriod, i);
      const atr = this._calculateATR(slice);
      if (atr !== null) {
        atrValues.push(atr);
      }
    }

    if (atrValues.length < 2) return null;

    // 当前 ATR / Current ATR
    const currentATR = atrValues[atrValues.length - 1];

    // 历史平均 ATR / Historical average ATR
    const historicalATRs = atrValues.slice(-lookbackPeriod, -1);
    const avgATR = historicalATRs.reduce((a, b) => a + b, 0) / historicalATRs.length;

    if (avgATR === 0) return null;

    // 比值: <1 表示收缩 / Ratio: <1 means contraction
    return currentATR / avgATR;
  }

  /**
   * 计算肯特纳通道挤压
   * Calculate Keltner Channel Squeeze
   * 返回布林带是否在肯特纳通道内 (挤压状态)
   * @private
   */
  _calculateKeltnerSqueeze(candles) {
    const { period, bbStdDev, atrPeriod, keltnerMultiplier } = this.params;

    if (candles.length < Math.max(period, atrPeriod) + 1) return null;

    const closes = candles.slice(-period).map(c => parseFloat(c.close));

    // 布林带 / Bollinger Bands
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variance = closes.reduce((acc, c) => acc + Math.pow(c - sma, 2), 0) / closes.length;
    const std = Math.sqrt(variance);
    const bbUpper = sma + bbStdDev * std;
    const bbLower = sma - bbStdDev * std;

    // ATR for Keltner
    const atr = this._calculateATR(candles.slice(-atrPeriod - 1));
    if (atr === null) return null;

    // 肯特纳通道 / Keltner Channels
    const kcUpper = sma + keltnerMultiplier * atr;
    const kcLower = sma - keltnerMultiplier * atr;

    // 挤压程度 / Squeeze level
    // 负值表示挤压 (布林带在肯特纳内)
    // Negative value means squeeze (BB inside KC)
    const squeeze = ((bbUpper - bbLower) - (kcUpper - kcLower)) / sma * 100;

    return squeeze;
  }

  /**
   * 计算历史波动率百分位
   * Calculate Historical Volatility Percentile
   * @private
   */
  _calculateHistoricalRank(candles) {
    const { period, lookbackPeriod } = this.params;

    if (candles.length < lookbackPeriod + period) return null;

    // 计算历史波动率序列 / Calculate historical volatility series
    const volHistory = [];
    for (let i = period; i <= candles.length; i++) {
      const slice = candles.slice(i - period, i);
      const vol = this._calculateReturnsVolatility(slice);
      if (vol !== null) {
        volHistory.push(vol);
      }
    }

    if (volHistory.length < 10) return null;

    // 当前波动率 / Current volatility
    const currentVol = volHistory[volHistory.length - 1];

    // 计算百分位 / Calculate percentile
    const historicalVols = volHistory.slice(-lookbackPeriod);
    const sorted = [...historicalVols].sort((a, b) => a - b);
    let rank = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] <= currentVol) rank++;
    }

    return (rank / sorted.length) * 100;
  }

  /**
   * 计算 ATR
   * @private
   */
  _calculateATR(candles) {
    if (candles.length < 2) return null;

    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
      const high = parseFloat(candles[i].high);
      const low = parseFloat(candles[i].low);
      const prevClose = parseFloat(candles[i - 1].close);

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    if (trueRanges.length === 0) return null;

    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  /**
   * 计算收益率波动率
   * @private
   */
  _calculateReturnsVolatility(candles) {
    if (candles.length < 2) return null;

    const returns = [];
    for (let i = 1; i < candles.length; i++) {
      const prevClose = parseFloat(candles[i - 1].close);
      const close = parseFloat(candles[i].close);
      if (prevClose > 0) {
        returns.push((close - prevClose) / prevClose);
      }
    }

    if (returns.length < 2) return null;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }
}

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// 布林带宽度 (20周期)
export const BollingerWidth20 = new VolatilityFactor({
  name: 'BB_Width_20',
  period: 20,
  method: VOLATILITY_METHOD.BOLLINGER_WIDTH,
});

// ATR 比值
export const ATRRatio = new VolatilityFactor({
  name: 'ATR_Ratio',
  period: 14,
  method: VOLATILITY_METHOD.ATR_RATIO,
  lookbackPeriod: 60,
});

// 肯特纳挤压
export const KeltnerSqueeze = new VolatilityFactor({
  name: 'Keltner_Squeeze',
  period: 20,
  method: VOLATILITY_METHOD.KELTNER_SQUEEZE,
});

// 历史波动率百分位
export const VolatilityPercentile = new VolatilityFactor({
  name: 'Vol_Percentile',
  period: 20,
  method: VOLATILITY_METHOD.HISTORICAL_RANK,
  lookbackPeriod: 120,
});

/**
 * 工厂函数
 * Factory function
 */
export function createVolatilityFactor(period, method = VOLATILITY_METHOD.BOLLINGER_WIDTH, options = {}) {
  return new VolatilityFactor({
    period,
    method,
    ...options,
  });
}

export default VolatilityFactor;
