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

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js'; // 导入模块 ../BaseFactor.js

/**
 * 换手率计算方法
 * Turnover Calculation Methods
 */
export const TURNOVER_METHOD = { // 导出常量 TURNOVER_METHOD
  VOLUME_MA_RATIO: 'vol_ma_ratio',      // 成交量/MA比值
  VOLUME_RANK: 'vol_rank',              // 成交量RANK
  VOLUME_CHANGE: 'vol_change',          // 成交量修改
  RELATIVE_VOLUME: 'rel_vol',           // RELATIVE成交量
  ABNORMAL_VOLUME: 'abnormal',          // ABNORMAL成交量
}; // 结束代码块

/**
 * 换手率因子类
 * Turnover Factor Class
 */
export class TurnoverFactor extends BaseFactor { // 导出类 TurnoverFactor
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 计算周期
   * @param {number} config.lookbackPeriod - 历史回看周期
   * @param {string} config.method - 计算方法
   * @param {number} config.abnormalThreshold - 异常成交量阈值 (标准差倍数)
   */
  constructor(config = {}) { // 构造函数
    const period = config.period || 20; // 定义常量 period
    const method = config.method || TURNOVER_METHOD.RELATIVE_VOLUME; // 定义常量 method

    super({ // 调用父类
      name: config.name || `Turnover_${method}_${period}`, // name
      category: FACTOR_CATEGORY.VOLUME, // category
      direction: FACTOR_DIRECTION.POSITIVE, // direction
      frequency: FACTOR_FREQUENCY.DAILY, // frequency
      description: `换手率因子 (${method}, ${period}周期)`, // description
      params: { // params
        period, // 执行语句
        method, // 执行语句
        lookbackPeriod: config.lookbackPeriod || 60, // 回溯周期
        abnormalThreshold: config.abnormalThreshold || 2.0, // abnormal阈值
        minDataPoints: config.minDataPoints || Math.ceil(period * 0.8), // 最小数据Points
      }, // 结束代码块
      ...config, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.candles - K线数据
   * @returns {Promise<number|null>} 换手率因子值
   */
  async calculate(symbol, data, context = {}) { // 执行语句
    const { candles } = data; // 解构赋值
    const { method, minDataPoints } = this.params; // 解构赋值

    if (!candles || candles.length < minDataPoints) { // 条件判断 !candles || candles.length < minDataPoints
      return null; // 返回结果
    } // 结束代码块

    let value; // 定义变量 value

    switch (method) { // 分支选择 method
      case TURNOVER_METHOD.VOLUME_MA_RATIO: // 分支 TURNOVER_METHOD.VOLUME_MA_RATIO
        value = this._calculateVolumeMARatio(candles); // 赋值 value
        break; // 跳出循环或分支

      case TURNOVER_METHOD.VOLUME_RANK: // 分支 TURNOVER_METHOD.VOLUME_RANK
        value = this._calculateVolumeRank(candles); // 赋值 value
        break; // 跳出循环或分支

      case TURNOVER_METHOD.VOLUME_CHANGE: // 分支 TURNOVER_METHOD.VOLUME_CHANGE
        value = this._calculateVolumeChange(candles); // 赋值 value
        break; // 跳出循环或分支

      case TURNOVER_METHOD.RELATIVE_VOLUME: // 分支 TURNOVER_METHOD.RELATIVE_VOLUME
        value = this._calculateRelativeVolume(candles); // 赋值 value
        break; // 跳出循环或分支

      case TURNOVER_METHOD.ABNORMAL_VOLUME: // 分支 TURNOVER_METHOD.ABNORMAL_VOLUME
        value = this._calculateAbnormalVolume(candles); // 赋值 value
        break; // 跳出循环或分支

      default: // 默认
        value = this._calculateRelativeVolume(candles); // 赋值 value
    } // 结束代码块

    return value; // 返回结果
  } // 结束代码块

  /**
   * 计算成交量/MA比值
   * @private
   */
  _calculateVolumeMARatio(candles) { // 调用 _calculateVolumeMARatio
    const { period } = this.params; // 解构赋值
    const volumes = candles.slice(-period).map(c => parseFloat(c.volume)); // 定义函数 volumes

    if (volumes.length < period) return null; // 条件判断 volumes.length < period

    const currentVolume = volumes[volumes.length - 1]; // 定义常量 currentVolume
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length; // 定义函数 avgVolume

    if (avgVolume === 0) return null; // 条件判断 avgVolume === 0

    return currentVolume / avgVolume; // 返回结果
  } // 结束代码块

  /**
   * 计算成交量百分位排名
   * @private
   */
  _calculateVolumeRank(candles) { // 调用 _calculateVolumeRank
    const { lookbackPeriod } = this.params; // 解构赋值
    const volumes = candles.slice(-lookbackPeriod).map(c => parseFloat(c.volume)); // 定义函数 volumes

    if (volumes.length < 10) return null; // 条件判断 volumes.length < 10

    const currentVolume = volumes[volumes.length - 1]; // 定义常量 currentVolume
    const sorted = [...volumes].sort((a, b) => a - b); // 定义函数 sorted

    let rank = 0; // 定义变量 rank
    for (let i = 0; i < sorted.length; i++) { // 循环 let i = 0; i < sorted.length; i++
      if (sorted[i] <= currentVolume) rank++; // 条件判断 sorted[i] <= currentVolume
    } // 结束代码块

    return (rank / sorted.length) * 100; // 返回结果
  } // 结束代码块

  /**
   * 计算成交量变化率
   * @private
   */
  _calculateVolumeChange(candles) { // 调用 _calculateVolumeChange
    const { period } = this.params; // 解构赋值

    if (candles.length < period + 1) return null; // 条件判断 candles.length < period + 1

    const currentVolume = parseFloat(candles[candles.length - 1].volume); // 定义常量 currentVolume
    const prevVolume = parseFloat(candles[candles.length - period - 1].volume); // 定义常量 prevVolume

    if (prevVolume === 0) return null; // 条件判断 prevVolume === 0

    return (currentVolume - prevVolume) / prevVolume; // 返回结果
  } // 结束代码块

  /**
   * 计算相对成交量
   * @private
   */
  _calculateRelativeVolume(candles) { // 调用 _calculateRelativeVolume
    const { period, lookbackPeriod } = this.params; // 解构赋值

    if (candles.length < lookbackPeriod) return null; // 条件判断 candles.length < lookbackPeriod

    // 近期平均成交量 / Recent average volume
    const recentVolumes = candles.slice(-period).map(c => parseFloat(c.volume)); // 定义函数 recentVolumes
    const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length; // 定义函数 recentAvg

    // 历史平均成交量 / Historical average volume
    const histVolumes = candles.slice(-lookbackPeriod, -period).map(c => parseFloat(c.volume)); // 定义函数 histVolumes
    if (histVolumes.length === 0) return null; // 条件判断 histVolumes.length === 0

    const histAvg = histVolumes.reduce((a, b) => a + b, 0) / histVolumes.length; // 定义函数 histAvg

    if (histAvg === 0) return null; // 条件判断 histAvg === 0

    return recentAvg / histAvg; // 返回结果
  } // 结束代码块

  /**
   * 计算异常成交量
   * 返回当前成交量偏离均值的标准差倍数
   * @private
   */
  _calculateAbnormalVolume(candles) { // 调用 _calculateAbnormalVolume
    const { lookbackPeriod, abnormalThreshold } = this.params; // 解构赋值
    const volumes = candles.slice(-lookbackPeriod).map(c => parseFloat(c.volume)); // 定义函数 volumes

    if (volumes.length < 10) return null; // 条件判断 volumes.length < 10

    const currentVolume = volumes[volumes.length - 1]; // 定义常量 currentVolume

    // 计算均值和标准差 / Calculate mean and std
    const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length; // 定义函数 mean
    const variance = volumes.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / volumes.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std

    if (std === 0) return 0; // 条件判断 std === 0

    // Z-Score
    const zScore = (currentVolume - mean) / std; // 定义常量 zScore

    return zScore; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// 成交量/MA比值 (20周期)
export const VolumeMAR20 = new TurnoverFactor({ // 导出常量 VolumeMAR20
  name: 'Vol_MA_Ratio_20', // name
  period: 20, // 周期
  method: TURNOVER_METHOD.VOLUME_MA_RATIO, // method
}); // 结束代码块

// 成交量排名
export const VolumeRank60 = new TurnoverFactor({ // 导出常量 VolumeRank60
  name: 'Vol_Rank_60', // name
  lookbackPeriod: 60, // 回溯周期
  method: TURNOVER_METHOD.VOLUME_RANK, // method
}); // 结束代码块

// 相对成交量
export const RelativeVolume = new TurnoverFactor({ // 导出常量 RelativeVolume
  name: 'Relative_Volume', // name
  period: 5, // 周期
  lookbackPeriod: 60, // 回溯周期
  method: TURNOVER_METHOD.RELATIVE_VOLUME, // method
}); // 结束代码块

// 异常成交量
export const AbnormalVolume = new TurnoverFactor({ // 导出常量 AbnormalVolume
  name: 'Abnormal_Volume', // name
  lookbackPeriod: 60, // 回溯周期
  method: TURNOVER_METHOD.ABNORMAL_VOLUME, // method
  abnormalThreshold: 2.0, // abnormal阈值
}); // 结束代码块

/**
 * 工厂函数
 */
export function createTurnoverFactor(period, method = TURNOVER_METHOD.RELATIVE_VOLUME, options = {}) { // 导出函数 createTurnoverFactor
  return new TurnoverFactor({ // 返回结果
    period, // 执行语句
    method, // 执行语句
    ...options, // 展开对象或数组
  }); // 结束代码块
} // 结束代码块

export default TurnoverFactor; // 默认导出
