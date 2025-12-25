/**
 * 换手率因子
 * Turnover Factor
 *
 * 衡量交易活跃度和流动性
 * Measures trading activity and liquidity
 *
 * 高换手率可能预示趋势转折或持续
 * High turnover may indicate trend reversal or continuation
 */

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js';

/**
 * 换手率计算方法
 * Turnover Calculation Methods
 */
export const TURNOVER_METHOD = {
  VOLUME_MA_RATIO: 'vol_ma_ratio',      // 成交量/MA比值
  VOLUME_RANK: 'vol_rank',              // 成交量百分位排名
  VOLUME_CHANGE: 'vol_change',          // 成交量变化率
  RELATIVE_VOLUME: 'rel_vol',           // 相对成交量 (vs 历史平均)
  ABNORMAL_VOLUME: 'abnormal',          // 异常成交量检测
};

/**
 * 换手率因子类
 * Turnover Factor Class
 */
export class TurnoverFactor extends BaseFactor {
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 计算周期
   * @param {number} config.lookbackPeriod - 历史回看周期
   * @param {string} config.method - 计算方法
   * @param {number} config.abnormalThreshold - 异常成交量阈值 (标准差倍数)
   */
  constructor(config = {}) {
    const period = config.period || 20;
    const method = config.method || TURNOVER_METHOD.RELATIVE_VOLUME;

    super({
      name: config.name || `Turnover_${method}_${period}`,
      category: FACTOR_CATEGORY.VOLUME,
      direction: FACTOR_DIRECTION.POSITIVE, // 高换手 → 高关注度
      frequency: FACTOR_FREQUENCY.DAILY,
      description: `换手率因子 (${method}, ${period}周期)`,
      params: {
        period,
        method,
        lookbackPeriod: config.lookbackPeriod || 60,
        abnormalThreshold: config.abnormalThreshold || 2.0,
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
   * @returns {Promise<number|null>} 换手率因子值
   */
  async calculate(symbol, data, context = {}) {
    const { candles } = data;
    const { method, minDataPoints } = this.params;

    if (!candles || candles.length < minDataPoints) {
      return null;
    }

    let value;

    switch (method) {
      case TURNOVER_METHOD.VOLUME_MA_RATIO:
        value = this._calculateVolumeMARatio(candles);
        break;

      case TURNOVER_METHOD.VOLUME_RANK:
        value = this._calculateVolumeRank(candles);
        break;

      case TURNOVER_METHOD.VOLUME_CHANGE:
        value = this._calculateVolumeChange(candles);
        break;

      case TURNOVER_METHOD.RELATIVE_VOLUME:
        value = this._calculateRelativeVolume(candles);
        break;

      case TURNOVER_METHOD.ABNORMAL_VOLUME:
        value = this._calculateAbnormalVolume(candles);
        break;

      default:
        value = this._calculateRelativeVolume(candles);
    }

    return value;
  }

  /**
   * 计算成交量/MA比值
   * @private
   */
  _calculateVolumeMARatio(candles) {
    const { period } = this.params;
    const volumes = candles.slice(-period).map(c => parseFloat(c.volume));

    if (volumes.length < period) return null;

    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

    if (avgVolume === 0) return null;

    return currentVolume / avgVolume;
  }

  /**
   * 计算成交量百分位排名
   * @private
   */
  _calculateVolumeRank(candles) {
    const { lookbackPeriod } = this.params;
    const volumes = candles.slice(-lookbackPeriod).map(c => parseFloat(c.volume));

    if (volumes.length < 10) return null;

    const currentVolume = volumes[volumes.length - 1];
    const sorted = [...volumes].sort((a, b) => a - b);

    let rank = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] <= currentVolume) rank++;
    }

    return (rank / sorted.length) * 100;
  }

  /**
   * 计算成交量变化率
   * @private
   */
  _calculateVolumeChange(candles) {
    const { period } = this.params;

    if (candles.length < period + 1) return null;

    const currentVolume = parseFloat(candles[candles.length - 1].volume);
    const prevVolume = parseFloat(candles[candles.length - period - 1].volume);

    if (prevVolume === 0) return null;

    return (currentVolume - prevVolume) / prevVolume;
  }

  /**
   * 计算相对成交量
   * @private
   */
  _calculateRelativeVolume(candles) {
    const { period, lookbackPeriod } = this.params;

    if (candles.length < lookbackPeriod) return null;

    // 近期平均成交量 / Recent average volume
    const recentVolumes = candles.slice(-period).map(c => parseFloat(c.volume));
    const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

    // 历史平均成交量 / Historical average volume
    const histVolumes = candles.slice(-lookbackPeriod, -period).map(c => parseFloat(c.volume));
    if (histVolumes.length === 0) return null;

    const histAvg = histVolumes.reduce((a, b) => a + b, 0) / histVolumes.length;

    if (histAvg === 0) return null;

    return recentAvg / histAvg;
  }

  /**
   * 计算异常成交量
   * 返回当前成交量偏离均值的标准差倍数
   * @private
   */
  _calculateAbnormalVolume(candles) {
    const { lookbackPeriod, abnormalThreshold } = this.params;
    const volumes = candles.slice(-lookbackPeriod).map(c => parseFloat(c.volume));

    if (volumes.length < 10) return null;

    const currentVolume = volumes[volumes.length - 1];

    // 计算均值和标准差 / Calculate mean and std
    const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const variance = volumes.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / volumes.length;
    const std = Math.sqrt(variance);

    if (std === 0) return 0;

    // Z-Score
    const zScore = (currentVolume - mean) / std;

    return zScore;
  }
}

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// 成交量/MA比值 (20周期)
export const VolumeMAR20 = new TurnoverFactor({
  name: 'Vol_MA_Ratio_20',
  period: 20,
  method: TURNOVER_METHOD.VOLUME_MA_RATIO,
});

// 成交量排名
export const VolumeRank60 = new TurnoverFactor({
  name: 'Vol_Rank_60',
  lookbackPeriod: 60,
  method: TURNOVER_METHOD.VOLUME_RANK,
});

// 相对成交量
export const RelativeVolume = new TurnoverFactor({
  name: 'Relative_Volume',
  period: 5,
  lookbackPeriod: 60,
  method: TURNOVER_METHOD.RELATIVE_VOLUME,
});

// 异常成交量
export const AbnormalVolume = new TurnoverFactor({
  name: 'Abnormal_Volume',
  lookbackPeriod: 60,
  method: TURNOVER_METHOD.ABNORMAL_VOLUME,
  abnormalThreshold: 2.0,
});

/**
 * 工厂函数
 */
export function createTurnoverFactor(period, method = TURNOVER_METHOD.RELATIVE_VOLUME, options = {}) {
  return new TurnoverFactor({
    period,
    method,
    ...options,
  });
}

export default TurnoverFactor;
