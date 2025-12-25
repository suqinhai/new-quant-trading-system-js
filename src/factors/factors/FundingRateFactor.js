/**
 * 资金费率极值因子
 * Funding Rate Extreme Factor
 *
 * 衡量永续合约资金费率的极端程度
 * Measures the extreme level of perpetual contract funding rates
 *
 * 极端正费率可能预示做空机会，极端负费率可能预示做多机会
 * Extreme positive rates may signal short opportunities, extreme negative rates may signal long opportunities
 */

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js';

/**
 * 资金费率计算方法
 * Funding Rate Calculation Methods
 */
export const FUNDING_RATE_METHOD = {
  CURRENT: 'current',                    // 当前费率
  AVERAGE: 'average',                    // 平均费率
  CUMULATIVE: 'cumulative',              // 累计费率
  PERCENTILE: 'percentile',              // 费率百分位
  ZSCORE: 'zscore',                      // 费率Z-Score
  EXTREME_SIGNAL: 'extreme_signal',      // 极值信号 (-1, 0, 1)
};

/**
 * 资金费率极值因子类
 * Funding Rate Extreme Factor Class
 */
export class FundingRateFactor extends BaseFactor {
  /**
   * @param {Object} config - 配置
   * @param {number} config.lookbackPeriod - 历史回看周期 (费率数量)
   * @param {string} config.method - 计算方法
   * @param {number} config.extremeThreshold - 极值阈值 (百分位或Z-Score)
   * @param {number} config.fundingInterval - 资金费率间隔 (小时)
   */
  constructor(config = {}) {
    const method = config.method || FUNDING_RATE_METHOD.PERCENTILE;

    super({
      name: config.name || `FundingRate_${method}`,
      category: FACTOR_CATEGORY.FUNDING,
      direction: FACTOR_DIRECTION.NEGATIVE, // 负费率 → 做多机会
      frequency: FACTOR_FREQUENCY.HOURLY,
      description: `资金费率极值因子 (${method})`,
      params: {
        method,
        lookbackPeriod: config.lookbackPeriod || 168, // 7天 * 24 / 8 = 21次，取更多历史
        extremeThreshold: config.extremeThreshold || 0.05, // 5%/95% 百分位
        zScoreThreshold: config.zScoreThreshold || 2.0,
        fundingInterval: config.fundingInterval || 8, // 8小时一次
        minDataPoints: config.minDataPoints || 10,
      },
      ...config,
    });
  }

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.fundingRates - 资金费率历史 [{rate, timestamp}]
   * @param {number} data.currentFundingRate - 当前资金费率
   * @returns {Promise<number|null>} 资金费率因子值
   */
  async calculate(symbol, data, context = {}) {
    const { fundingRates, currentFundingRate } = data;
    const { method, minDataPoints } = this.params;

    // 可以只有当前费率 / Can have just current rate
    if (method === FUNDING_RATE_METHOD.CURRENT) {
      if (currentFundingRate !== undefined) {
        return currentFundingRate;
      }
    }

    if (!fundingRates || fundingRates.length < minDataPoints) {
      return currentFundingRate !== undefined ? currentFundingRate : null;
    }

    let value;

    switch (method) {
      case FUNDING_RATE_METHOD.CURRENT:
        value = this._calculateCurrent(fundingRates);
        break;

      case FUNDING_RATE_METHOD.AVERAGE:
        value = this._calculateAverage(fundingRates);
        break;

      case FUNDING_RATE_METHOD.CUMULATIVE:
        value = this._calculateCumulative(fundingRates);
        break;

      case FUNDING_RATE_METHOD.PERCENTILE:
        value = this._calculatePercentile(fundingRates);
        break;

      case FUNDING_RATE_METHOD.ZSCORE:
        value = this._calculateZScore(fundingRates);
        break;

      case FUNDING_RATE_METHOD.EXTREME_SIGNAL:
        value = this._calculateExtremeSignal(fundingRates);
        break;

      default:
        value = this._calculatePercentile(fundingRates);
    }

    return value;
  }

  /**
   * 获取当前费率
   * @private
   */
  _calculateCurrent(fundingRates) {
    if (fundingRates.length === 0) return null;
    const latest = fundingRates[fundingRates.length - 1];
    return typeof latest === 'object' ? parseFloat(latest.rate) : parseFloat(latest);
  }

  /**
   * 计算平均费率
   * @private
   */
  _calculateAverage(fundingRates) {
    const { lookbackPeriod } = this.params;
    const rates = fundingRates.slice(-lookbackPeriod).map(r =>
      typeof r === 'object' ? parseFloat(r.rate) : parseFloat(r)
    );

    if (rates.length === 0) return null;

    return rates.reduce((a, b) => a + b, 0) / rates.length;
  }

  /**
   * 计算累计费率 (年化)
   * @private
   */
  _calculateCumulative(fundingRates) {
    const { lookbackPeriod, fundingInterval } = this.params;
    const rates = fundingRates.slice(-lookbackPeriod).map(r =>
      typeof r === 'object' ? parseFloat(r.rate) : parseFloat(r)
    );

    if (rates.length === 0) return null;

    // 累计费率 / Cumulative rate
    const cumulative = rates.reduce((a, b) => a + b, 0);

    // 年化 (假设每天 24/fundingInterval 次)
    const periodsPerYear = (365 * 24) / fundingInterval;
    const periodsInData = rates.length;
    const annualized = (cumulative / periodsInData) * periodsPerYear;

    return annualized;
  }

  /**
   * 计算费率百分位
   * @private
   */
  _calculatePercentile(fundingRates) {
    const { lookbackPeriod } = this.params;
    const rates = fundingRates.slice(-lookbackPeriod).map(r =>
      typeof r === 'object' ? parseFloat(r.rate) : parseFloat(r)
    );

    if (rates.length < 10) return null;

    const currentRate = rates[rates.length - 1];
    const sorted = [...rates].sort((a, b) => a - b);

    let rank = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] <= currentRate) rank++;
    }

    return (rank / sorted.length) * 100;
  }

  /**
   * 计算费率 Z-Score
   * @private
   */
  _calculateZScore(fundingRates) {
    const { lookbackPeriod } = this.params;
    const rates = fundingRates.slice(-lookbackPeriod).map(r =>
      typeof r === 'object' ? parseFloat(r.rate) : parseFloat(r)
    );

    if (rates.length < 10) return null;

    const currentRate = rates[rates.length - 1];

    // 计算均值和标准差 / Calculate mean and std
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / rates.length;
    const std = Math.sqrt(variance);

    if (std === 0) return 0;

    return (currentRate - mean) / std;
  }

  /**
   * 计算极值信号
   * 返回: 1 (极端正费率/做空信号), -1 (极端负费率/做多信号), 0 (正常)
   * @private
   */
  _calculateExtremeSignal(fundingRates) {
    const { extremeThreshold, zScoreThreshold } = this.params;

    // 先计算百分位 / Calculate percentile first
    const percentile = this._calculatePercentile(fundingRates);
    if (percentile === null) {
      // 退化到 Z-Score / Fallback to Z-Score
      const zScore = this._calculateZScore(fundingRates);
      if (zScore === null) return 0;

      if (zScore >= zScoreThreshold) return 1;   // 极端正费率
      if (zScore <= -zScoreThreshold) return -1; // 极端负费率
      return 0;
    }

    const highThreshold = (1 - extremeThreshold) * 100;
    const lowThreshold = extremeThreshold * 100;

    if (percentile >= highThreshold) return 1;   // 极端正费率 → 做空信号
    if (percentile <= lowThreshold) return -1;   // 极端负费率 → 做多信号
    return 0;
  }
}

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// 当前资金费率
export const FundingRateCurrent = new FundingRateFactor({
  name: 'Funding_Current',
  method: FUNDING_RATE_METHOD.CURRENT,
});

// 平均资金费率 (7天)
export const FundingRateAvg7D = new FundingRateFactor({
  name: 'Funding_Avg_7d',
  lookbackPeriod: 21, // 7天约21次费率
  method: FUNDING_RATE_METHOD.AVERAGE,
});

// 资金费率百分位
export const FundingRatePercentile = new FundingRateFactor({
  name: 'Funding_Percentile',
  lookbackPeriod: 90, // 30天历史
  method: FUNDING_RATE_METHOD.PERCENTILE,
});

// 资金费率 Z-Score
export const FundingRateZScore = new FundingRateFactor({
  name: 'Funding_ZScore',
  lookbackPeriod: 90,
  method: FUNDING_RATE_METHOD.ZSCORE,
});

// 资金费率极值信号
export const FundingRateExtreme = new FundingRateFactor({
  name: 'Funding_Extreme_Signal',
  lookbackPeriod: 90,
  method: FUNDING_RATE_METHOD.EXTREME_SIGNAL,
  extremeThreshold: 0.05, // 5%/95%
});

// 累计年化费率
export const FundingRateCumulative = new FundingRateFactor({
  name: 'Funding_Cumulative_APR',
  lookbackPeriod: 21,
  method: FUNDING_RATE_METHOD.CUMULATIVE,
});

/**
 * 工厂函数
 */
export function createFundingRateFactor(method = FUNDING_RATE_METHOD.PERCENTILE, options = {}) {
  return new FundingRateFactor({
    method,
    ...options,
  });
}

export default FundingRateFactor;
