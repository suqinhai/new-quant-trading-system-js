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

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js'; // 导入模块 ../BaseFactor.js

/**
 * 资金费率计算方法
 * Funding Rate Calculation Methods
 */
export const FUNDING_RATE_METHOD = { // 导出常量 FUNDING_RATE_METHOD
  CURRENT: 'current',                    // CURRENT
  AVERAGE: 'average',                    // 平均
  CUMULATIVE: 'cumulative',              // CUMULATIVE
  PERCENTILE: 'percentile',              // PERCENTILE
  ZSCORE: 'zscore',                      // Z分数
  EXTREME_SIGNAL: 'extreme_signal',      // 极端信号
}; // 结束代码块

/**
 * 资金费率极值因子类
 * Funding Rate Extreme Factor Class
 */
export class FundingRateFactor extends BaseFactor { // 导出类 FundingRateFactor
  /**
   * @param {Object} config - 配置
   * @param {number} config.lookbackPeriod - 历史回看周期 (费率数量)
   * @param {string} config.method - 计算方法
   * @param {number} config.extremeThreshold - 极值阈值 (百分位或Z-Score)
   * @param {number} config.fundingInterval - 资金费率间隔 (小时)
   */
  constructor(config = {}) { // 构造函数
    const method = config.method || FUNDING_RATE_METHOD.PERCENTILE; // 定义常量 method

    super({ // 调用父类
      name: config.name || `FundingRate_${method}`, // name
      category: FACTOR_CATEGORY.FUNDING, // category
      direction: FACTOR_DIRECTION.NEGATIVE, // direction
      frequency: FACTOR_FREQUENCY.HOURLY, // frequency
      description: `资金费率极值因子 (${method})`, // description
      params: { // params
        method, // 执行语句
        lookbackPeriod: config.lookbackPeriod || 168, // 7天 * 24 / 8 = 21次，取更多历史
        extremeThreshold: config.extremeThreshold || 0.05, // 5%/95% 百分位
        zScoreThreshold: config.zScoreThreshold || 2.0, // Z分数阈值
        fundingInterval: config.fundingInterval || 8, // 资金费率间隔
        minDataPoints: config.minDataPoints || 10, // 最小数据Points
      }, // 结束代码块
      ...config, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.fundingRates - 资金费率历史 [{rate, timestamp}]
   * @param {number} data.currentFundingRate - 当前资金费率
   * @returns {Promise<number|null>} 资金费率因子值
   */
  async calculate(symbol, data, context = {}) { // 执行语句
    const { fundingRates, currentFundingRate } = data; // 解构赋值
    const { method, minDataPoints } = this.params; // 解构赋值

    // 可以只有当前费率 / Can have just current rate
    if (method === FUNDING_RATE_METHOD.CURRENT) { // 条件判断 method === FUNDING_RATE_METHOD.CURRENT
      if (currentFundingRate !== undefined) { // 条件判断 currentFundingRate !== undefined
        return currentFundingRate; // 返回结果
      } // 结束代码块
    } // 结束代码块

    if (!fundingRates || fundingRates.length < minDataPoints) { // 条件判断 !fundingRates || fundingRates.length < minDat...
      return currentFundingRate !== undefined ? currentFundingRate : null; // 返回结果
    } // 结束代码块

    let value; // 定义变量 value

    switch (method) { // 分支选择 method
      case FUNDING_RATE_METHOD.CURRENT: // 分支 FUNDING_RATE_METHOD.CURRENT
        value = this._calculateCurrent(fundingRates); // 赋值 value
        break; // 跳出循环或分支

      case FUNDING_RATE_METHOD.AVERAGE: // 分支 FUNDING_RATE_METHOD.AVERAGE
        value = this._calculateAverage(fundingRates); // 赋值 value
        break; // 跳出循环或分支

      case FUNDING_RATE_METHOD.CUMULATIVE: // 分支 FUNDING_RATE_METHOD.CUMULATIVE
        value = this._calculateCumulative(fundingRates); // 赋值 value
        break; // 跳出循环或分支

      case FUNDING_RATE_METHOD.PERCENTILE: // 分支 FUNDING_RATE_METHOD.PERCENTILE
        value = this._calculatePercentile(fundingRates); // 赋值 value
        break; // 跳出循环或分支

      case FUNDING_RATE_METHOD.ZSCORE: // 分支 FUNDING_RATE_METHOD.ZSCORE
        value = this._calculateZScore(fundingRates); // 赋值 value
        break; // 跳出循环或分支

      case FUNDING_RATE_METHOD.EXTREME_SIGNAL: // 分支 FUNDING_RATE_METHOD.EXTREME_SIGNAL
        value = this._calculateExtremeSignal(fundingRates); // 赋值 value
        break; // 跳出循环或分支

      default: // 默认
        value = this._calculatePercentile(fundingRates); // 赋值 value
    } // 结束代码块

    return value; // 返回结果
  } // 结束代码块

  /**
   * 获取当前费率
   * @private
   */
  _calculateCurrent(fundingRates) { // 调用 _calculateCurrent
    if (fundingRates.length === 0) return null; // 条件判断 fundingRates.length === 0
    const latest = fundingRates[fundingRates.length - 1]; // 定义常量 latest
    return typeof latest === 'object' ? parseFloat(latest.rate) : parseFloat(latest); // 返回结果
  } // 结束代码块

  /**
   * 计算平均费率
   * @private
   */
  _calculateAverage(fundingRates) { // 调用 _calculateAverage
    const { lookbackPeriod } = this.params; // 解构赋值
    const rates = fundingRates.slice(-lookbackPeriod).map(r => // 定义函数 rates
      typeof r === 'object' ? parseFloat(r.rate) : parseFloat(r) // 执行语句
    ); // 结束调用或参数

    if (rates.length === 0) return null; // 条件判断 rates.length === 0

    return rates.reduce((a, b) => a + b, 0) / rates.length; // 返回结果
  } // 结束代码块

  /**
   * 计算累计费率 (年化)
   * @private
   */
  _calculateCumulative(fundingRates) { // 调用 _calculateCumulative
    const { lookbackPeriod, fundingInterval } = this.params; // 解构赋值
    const rates = fundingRates.slice(-lookbackPeriod).map(r => // 定义函数 rates
      typeof r === 'object' ? parseFloat(r.rate) : parseFloat(r) // 执行语句
    ); // 结束调用或参数

    if (rates.length === 0) return null; // 条件判断 rates.length === 0

    // 累计费率 / Cumulative rate
    const cumulative = rates.reduce((a, b) => a + b, 0); // 定义函数 cumulative

    // 年化 (假设每天 24/fundingInterval 次)
    const periodsPerYear = (365 * 24) / fundingInterval; // 定义常量 periodsPerYear
    const periodsInData = rates.length; // 定义常量 periodsInData
    const annualized = (cumulative / periodsInData) * periodsPerYear; // 定义常量 annualized

    return annualized; // 返回结果
  } // 结束代码块

  /**
   * 计算费率百分位
   * @private
   */
  _calculatePercentile(fundingRates) { // 调用 _calculatePercentile
    const { lookbackPeriod } = this.params; // 解构赋值
    const rates = fundingRates.slice(-lookbackPeriod).map(r => // 定义函数 rates
      typeof r === 'object' ? parseFloat(r.rate) : parseFloat(r) // 执行语句
    ); // 结束调用或参数

    if (rates.length < 10) return null; // 条件判断 rates.length < 10

    const currentRate = rates[rates.length - 1]; // 定义常量 currentRate
    const sorted = [...rates].sort((a, b) => a - b); // 定义函数 sorted

    let rank = 0; // 定义变量 rank
    for (let i = 0; i < sorted.length; i++) { // 循环 let i = 0; i < sorted.length; i++
      if (sorted[i] <= currentRate) rank++; // 条件判断 sorted[i] <= currentRate
    } // 结束代码块

    return (rank / sorted.length) * 100; // 返回结果
  } // 结束代码块

  /**
   * 计算费率 Z-Score
   * @private
   */
  _calculateZScore(fundingRates) { // 调用 _calculateZScore
    const { lookbackPeriod } = this.params; // 解构赋值
    const rates = fundingRates.slice(-lookbackPeriod).map(r => // 定义函数 rates
      typeof r === 'object' ? parseFloat(r.rate) : parseFloat(r) // 执行语句
    ); // 结束调用或参数

    if (rates.length < 10) return null; // 条件判断 rates.length < 10

    const currentRate = rates[rates.length - 1]; // 定义常量 currentRate

    // 计算均值和标准差 / Calculate mean and std
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length; // 定义函数 mean
    const variance = rates.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / rates.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std

    if (std === 0) return 0; // 条件判断 std === 0

    return (currentRate - mean) / std; // 返回结果
  } // 结束代码块

  /**
   * 计算极值信号
   * 返回: 1 (极端正费率/做空信号), -1 (极端负费率/做多信号), 0 (正常)
   * @private
   */
  _calculateExtremeSignal(fundingRates) { // 调用 _calculateExtremeSignal
    const { extremeThreshold, zScoreThreshold } = this.params; // 解构赋值

    // 先计算百分位 / Calculate percentile first
    const percentile = this._calculatePercentile(fundingRates); // 定义常量 percentile
    if (percentile === null) { // 条件判断 percentile === null
      // 退化到 Z-Score / Fallback to Z-Score
      const zScore = this._calculateZScore(fundingRates); // 定义常量 zScore
      if (zScore === null) return 0; // 条件判断 zScore === null

      if (zScore >= zScoreThreshold) return 1;   // 极端正费率
      if (zScore <= -zScoreThreshold) return -1; // 极端负费率
      return 0; // 返回结果
    } // 结束代码块

    const highThreshold = (1 - extremeThreshold) * 100; // 定义常量 highThreshold
    const lowThreshold = extremeThreshold * 100; // 定义常量 lowThreshold

    if (percentile >= highThreshold) return 1;   // 极端正费率 → 做空信号
    if (percentile <= lowThreshold) return -1;   // 极端负费率 → 做多信号
    return 0; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// 当前资金费率
export const FundingRateCurrent = new FundingRateFactor({ // 导出常量 FundingRateCurrent
  name: 'Funding_Current', // name
  method: FUNDING_RATE_METHOD.CURRENT, // method
}); // 结束代码块

// 平均资金费率 (7天)
export const FundingRateAvg7D = new FundingRateFactor({ // 导出常量 FundingRateAvg7D
  name: 'Funding_Avg_7d', // name
  lookbackPeriod: 21, // 回溯周期
  method: FUNDING_RATE_METHOD.AVERAGE, // method
}); // 结束代码块

// 资金费率百分位
export const FundingRatePercentile = new FundingRateFactor({ // 导出常量 FundingRatePercentile
  name: 'Funding_Percentile', // name
  lookbackPeriod: 90, // 回溯周期
  method: FUNDING_RATE_METHOD.PERCENTILE, // method
}); // 结束代码块

// 资金费率 Z-Score
export const FundingRateZScore = new FundingRateFactor({ // 导出常量 FundingRateZScore
  name: 'Funding_ZScore', // name
  lookbackPeriod: 90, // 回溯周期
  method: FUNDING_RATE_METHOD.ZSCORE, // method
}); // 结束代码块

// 资金费率极值信号
export const FundingRateExtreme = new FundingRateFactor({ // 导出常量 FundingRateExtreme
  name: 'Funding_Extreme_Signal', // name
  lookbackPeriod: 90, // 回溯周期
  method: FUNDING_RATE_METHOD.EXTREME_SIGNAL, // method
  extremeThreshold: 0.05, // 5%/95%
}); // 结束代码块

// 累计年化费率
export const FundingRateCumulative = new FundingRateFactor({ // 导出常量 FundingRateCumulative
  name: 'Funding_Cumulative_APR', // name
  lookbackPeriod: 21, // 回溯周期
  method: FUNDING_RATE_METHOD.CUMULATIVE, // method
}); // 结束代码块

/**
 * 工厂函数
 */
export function createFundingRateFactor(method = FUNDING_RATE_METHOD.PERCENTILE, options = {}) { // 导出函数 createFundingRateFactor
  return new FundingRateFactor({ // 返回结果
    method, // 执行语句
    ...options, // 展开对象或数组
  }); // 结束代码块
} // 结束代码块

export default FundingRateFactor; // 默认导出
