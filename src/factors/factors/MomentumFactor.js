/**
 * 动量因子
 * Momentum Factor
 *
 * 衡量资产价格在特定时间段内的涨跌幅度
 * Measures asset price movement over a specific time period
 *
 * 支持多种周期: 1d, 7d, 30d
 * Supports multiple periods: 1d, 7d, 30d
 */

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js';

/**
 * 动量类型
 * Momentum Types
 */
export const MOMENTUM_TYPE = {
  SIMPLE: 'simple',           // 简单收益率: (P1 - P0) / P0
  LOG: 'log',                 // 对数收益率: ln(P1 / P0)
  RISK_ADJUSTED: 'risk_adj',  // 风险调整收益 (Sharpe-like)
  ACCELERATION: 'accel',      // 动量加速度 (动量变化率)
};

/**
 * 动量因子类
 * Momentum Factor Class
 */
export class MomentumFactor extends BaseFactor {
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 回看周期 (天数)
   * @param {string} config.type - 动量类型
   * @param {boolean} config.useVolatility - 是否使用波动率调整
   */
  constructor(config = {}) {
    const period = config.period || 7;
    const type = config.type || MOMENTUM_TYPE.SIMPLE;

    super({
      name: config.name || `Momentum_${period}d`,
      category: FACTOR_CATEGORY.MOMENTUM,
      direction: FACTOR_DIRECTION.POSITIVE, // 高动量 → 预期正收益
      frequency: FACTOR_FREQUENCY.DAILY,
      description: `${period}天动量因子 (${type})`,
      params: {
        period,
        type,
        useVolatility: config.useVolatility || false,
        minDataPoints: config.minDataPoints || Math.ceil(period * 0.8),
      },
      ...config,
    });
  }

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.candles - K线数据 [{close, high, low, volume, timestamp}]
   * @returns {Promise<number|null>} 动量值
   */
  async calculate(symbol, data, context = {}) {
    const { candles } = data;
    const { period, type, useVolatility, minDataPoints } = this.params;

    // 数据验证 / Data validation
    if (!candles || candles.length < minDataPoints) {
      return null;
    }

    // 获取收盘价 / Get close prices
    const closes = candles.slice(-period - 1).map(c => parseFloat(c.close));

    if (closes.length < 2) {
      return null;
    }

    let momentum;

    switch (type) {
      case MOMENTUM_TYPE.SIMPLE:
        momentum = this._calculateSimple(closes);
        break;

      case MOMENTUM_TYPE.LOG:
        momentum = this._calculateLog(closes);
        break;

      case MOMENTUM_TYPE.RISK_ADJUSTED:
        momentum = this._calculateRiskAdjusted(closes);
        break;

      case MOMENTUM_TYPE.ACCELERATION:
        momentum = this._calculateAcceleration(closes);
        break;

      default:
        momentum = this._calculateSimple(closes);
    }

    // 波动率调整 / Volatility adjustment
    if (useVolatility && momentum !== null) {
      const volatility = this._calculateVolatility(closes);
      if (volatility > 0) {
        momentum = momentum / volatility;
      }
    }

    return momentum;
  }

  /**
   * 计算简单动量 (收益率)
   * Calculate simple momentum (return rate)
   * @private
   */
  _calculateSimple(closes) {
    if (closes.length < 2) return null;

    const start = closes[0];
    const end = closes[closes.length - 1];

    if (start <= 0) return null;

    return (end - start) / start;
  }

  /**
   * 计算对数动量
   * Calculate log momentum
   * @private
   */
  _calculateLog(closes) {
    if (closes.length < 2) return null;

    const start = closes[0];
    const end = closes[closes.length - 1];

    if (start <= 0 || end <= 0) return null;

    return Math.log(end / start);
  }

  /**
   * 计算风险调整动量 (类似夏普)
   * Calculate risk-adjusted momentum (Sharpe-like)
   * @private
   */
  _calculateRiskAdjusted(closes) {
    if (closes.length < 3) return null;

    // 计算日收益率 / Calculate daily returns
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
    }

    if (returns.length < 2) return null;

    // 平均收益 / Mean return
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // 标准差 / Standard deviation
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const std = Math.sqrt(variance);

    if (std === 0) return meanReturn > 0 ? Infinity : (meanReturn < 0 ? -Infinity : 0);

    // 风险调整收益 / Risk-adjusted return
    return meanReturn / std;
  }

  /**
   * 计算动量加速度
   * Calculate momentum acceleration
   * @private
   */
  _calculateAcceleration(closes) {
    if (closes.length < 3) return null;

    const halfLen = Math.floor(closes.length / 2);
    const firstHalf = closes.slice(0, halfLen + 1);
    const secondHalf = closes.slice(halfLen);

    const mom1 = this._calculateSimple(firstHalf);
    const mom2 = this._calculateSimple(secondHalf);

    if (mom1 === null || mom2 === null) return null;

    // 加速度 = 后半段动量 - 前半段动量
    return mom2 - mom1;
  }

  /**
   * 计算波动率
   * Calculate volatility
   * @private
   */
  _calculateVolatility(closes) {
    if (closes.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
    }

    if (returns.length === 0) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance);
  }
}

/**
 * 创建预定义的动量因子
 * Create predefined momentum factors
 */

// 1天动量
export const Momentum1D = new MomentumFactor({
  name: 'Momentum_1d',
  period: 1,
  type: MOMENTUM_TYPE.SIMPLE,
  minDataPoints: 2,
});

// 7天动量
export const Momentum7D = new MomentumFactor({
  name: 'Momentum_7d',
  period: 7,
  type: MOMENTUM_TYPE.SIMPLE,
  minDataPoints: 5,
});

// 30天动量
export const Momentum30D = new MomentumFactor({
  name: 'Momentum_30d',
  period: 30,
  type: MOMENTUM_TYPE.SIMPLE,
  minDataPoints: 20,
});

// 7天风险调整动量
export const RiskAdjustedMomentum7D = new MomentumFactor({
  name: 'RiskAdj_Momentum_7d',
  period: 7,
  type: MOMENTUM_TYPE.RISK_ADJUSTED,
  minDataPoints: 5,
});

// 14天动量加速度
export const MomentumAcceleration14D = new MomentumFactor({
  name: 'Momentum_Accel_14d',
  period: 14,
  type: MOMENTUM_TYPE.ACCELERATION,
  minDataPoints: 10,
});

/**
 * 工厂函数: 创建自定义动量因子
 * Factory function: create custom momentum factor
 */
export function createMomentumFactor(period, type = MOMENTUM_TYPE.SIMPLE, options = {}) {
  return new MomentumFactor({
    period,
    type,
    ...options,
  });
}

export default MomentumFactor;
