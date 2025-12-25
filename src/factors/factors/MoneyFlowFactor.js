/**
 * 资金流向因子
 * Money Flow Factor
 *
 * 衡量资金流入流出的方向和强度
 * Measures the direction and intensity of money flow
 *
 * 包括: MFI、OBV、CMF 等资金流指标
 * Includes: MFI, OBV, CMF and other money flow indicators
 */

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js';

/**
 * 资金流计算方法
 * Money Flow Calculation Methods
 */
export const MONEY_FLOW_METHOD = {
  MFI: 'mfi',                    // Money Flow Index
  OBV_SLOPE: 'obv_slope',        // OBV 斜率
  CMF: 'cmf',                    // Chaikin Money Flow
  VOLUME_RATIO: 'vol_ratio',     // 上涨/下跌成交量比
  ACCUMULATION: 'accumulation',  // 累积/派发指标
};

/**
 * 资金流向因子类
 * Money Flow Factor Class
 */
export class MoneyFlowFactor extends BaseFactor {
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 计算周期
   * @param {string} config.method - 计算方法
   */
  constructor(config = {}) {
    const period = config.period || 14;
    const method = config.method || MONEY_FLOW_METHOD.MFI;

    super({
      name: config.name || `MoneyFlow_${method}_${period}`,
      category: FACTOR_CATEGORY.MONEY_FLOW,
      direction: FACTOR_DIRECTION.POSITIVE, // 高资金流入 → 预期正收益
      frequency: FACTOR_FREQUENCY.DAILY,
      description: `资金流向因子 (${method}, ${period}周期)`,
      params: {
        period,
        method,
        minDataPoints: config.minDataPoints || Math.ceil(period * 0.8),
      },
      ...config,
    });
  }

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.candles - K线数据 [{open, high, low, close, volume}]
   * @returns {Promise<number|null>} 资金流因子值
   */
  async calculate(symbol, data, context = {}) {
    const { candles } = data;
    const { method, minDataPoints } = this.params;

    if (!candles || candles.length < minDataPoints) {
      return null;
    }

    let value;

    switch (method) {
      case MONEY_FLOW_METHOD.MFI:
        value = this._calculateMFI(candles);
        break;

      case MONEY_FLOW_METHOD.OBV_SLOPE:
        value = this._calculateOBVSlope(candles);
        break;

      case MONEY_FLOW_METHOD.CMF:
        value = this._calculateCMF(candles);
        break;

      case MONEY_FLOW_METHOD.VOLUME_RATIO:
        value = this._calculateVolumeRatio(candles);
        break;

      case MONEY_FLOW_METHOD.ACCUMULATION:
        value = this._calculateAccumulation(candles);
        break;

      default:
        value = this._calculateMFI(candles);
    }

    return value;
  }

  /**
   * 计算 MFI (Money Flow Index)
   * @private
   */
  _calculateMFI(candles) {
    const { period } = this.params;
    const slice = candles.slice(-period - 1);

    if (slice.length < period + 1) return null;

    let positiveFlow = 0;
    let negativeFlow = 0;

    for (let i = 1; i < slice.length; i++) {
      // 典型价格 / Typical price
      const tp = (parseFloat(slice[i].high) + parseFloat(slice[i].low) + parseFloat(slice[i].close)) / 3;
      const prevTp = (parseFloat(slice[i - 1].high) + parseFloat(slice[i - 1].low) + parseFloat(slice[i - 1].close)) / 3;
      const volume = parseFloat(slice[i].volume);

      // 资金流 / Money flow
      const moneyFlow = tp * volume;

      if (tp > prevTp) {
        positiveFlow += moneyFlow;
      } else if (tp < prevTp) {
        negativeFlow += moneyFlow;
      }
    }

    if (negativeFlow === 0) return 100;
    if (positiveFlow === 0) return 0;

    const mfRatio = positiveFlow / negativeFlow;
    const mfi = 100 - (100 / (1 + mfRatio));

    return mfi;
  }

  /**
   * 计算 OBV 斜率
   * Calculate OBV Slope
   * @private
   */
  _calculateOBVSlope(candles) {
    const { period } = this.params;
    const slice = candles.slice(-period - 1);

    if (slice.length < period + 1) return null;

    // 计算 OBV 序列 / Calculate OBV series
    const obvValues = [0];
    for (let i = 1; i < slice.length; i++) {
      const close = parseFloat(slice[i].close);
      const prevClose = parseFloat(slice[i - 1].close);
      const volume = parseFloat(slice[i].volume);

      let obv = obvValues[obvValues.length - 1];
      if (close > prevClose) {
        obv += volume;
      } else if (close < prevClose) {
        obv -= volume;
      }
      obvValues.push(obv);
    }

    // 计算线性回归斜率 / Calculate linear regression slope
    return this._calculateSlope(obvValues);
  }

  /**
   * 计算 CMF (Chaikin Money Flow)
   * @private
   */
  _calculateCMF(candles) {
    const { period } = this.params;
    const slice = candles.slice(-period);

    if (slice.length < period) return null;

    let mfVolume = 0;
    let totalVolume = 0;

    for (const candle of slice) {
      const high = parseFloat(candle.high);
      const low = parseFloat(candle.low);
      const close = parseFloat(candle.close);
      const volume = parseFloat(candle.volume);

      // Money Flow Multiplier
      const range = high - low;
      let mfm = 0;
      if (range > 0) {
        mfm = ((close - low) - (high - close)) / range;
      }

      mfVolume += mfm * volume;
      totalVolume += volume;
    }

    if (totalVolume === 0) return 0;

    return mfVolume / totalVolume;
  }

  /**
   * 计算上涨/下跌成交量比
   * Calculate Up/Down Volume Ratio
   * @private
   */
  _calculateVolumeRatio(candles) {
    const { period } = this.params;
    const slice = candles.slice(-period);

    if (slice.length < period) return null;

    let upVolume = 0;
    let downVolume = 0;

    for (const candle of slice) {
      const open = parseFloat(candle.open);
      const close = parseFloat(candle.close);
      const volume = parseFloat(candle.volume);

      if (close > open) {
        upVolume += volume;
      } else if (close < open) {
        downVolume += volume;
      }
    }

    if (downVolume === 0) return upVolume > 0 ? Infinity : 1;

    return upVolume / downVolume;
  }

  /**
   * 计算累积/派发指标
   * Calculate Accumulation/Distribution
   * @private
   */
  _calculateAccumulation(candles) {
    const { period } = this.params;
    const slice = candles.slice(-period - 1);

    if (slice.length < 2) return null;

    // 计算 A/D 序列 / Calculate A/D series
    const adValues = [0];
    for (let i = 1; i < slice.length; i++) {
      const high = parseFloat(slice[i].high);
      const low = parseFloat(slice[i].low);
      const close = parseFloat(slice[i].close);
      const volume = parseFloat(slice[i].volume);

      // CLV (Close Location Value)
      const range = high - low;
      let clv = 0;
      if (range > 0) {
        clv = ((close - low) - (high - close)) / range;
      }

      const ad = adValues[adValues.length - 1] + clv * volume;
      adValues.push(ad);
    }

    // 返回斜率 / Return slope
    return this._calculateSlope(adValues);
  }

  /**
   * 计算斜率 (线性回归)
   * @private
   */
  _calculateSlope(values) {
    const n = values.length;
    if (n < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }
}

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// MFI 14周期
export const MFI14 = new MoneyFlowFactor({
  name: 'MFI_14',
  period: 14,
  method: MONEY_FLOW_METHOD.MFI,
});

// OBV 斜率
export const OBVSlope20 = new MoneyFlowFactor({
  name: 'OBV_Slope_20',
  period: 20,
  method: MONEY_FLOW_METHOD.OBV_SLOPE,
});

// CMF 20周期
export const CMF20 = new MoneyFlowFactor({
  name: 'CMF_20',
  period: 20,
  method: MONEY_FLOW_METHOD.CMF,
});

// 成交量比率
export const VolumeRatio14 = new MoneyFlowFactor({
  name: 'Vol_Ratio_14',
  period: 14,
  method: MONEY_FLOW_METHOD.VOLUME_RATIO,
});

/**
 * 工厂函数
 */
export function createMoneyFlowFactor(period, method = MONEY_FLOW_METHOD.MFI, options = {}) {
  return new MoneyFlowFactor({
    period,
    method,
    ...options,
  });
}

export default MoneyFlowFactor;
