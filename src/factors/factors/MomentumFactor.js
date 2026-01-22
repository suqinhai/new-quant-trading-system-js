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

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js'; // 导入模块 ../BaseFactor.js

/**
 * 动量类型
 * Momentum Types
 */
export const MOMENTUM_TYPE = { // 导出常量 MOMENTUM_TYPE
  SIMPLE: 'simple',           // 简单收益率: (P1 - P0) / P0
  LOG: 'log',                 // 对数收益率: ln(P1 / P0)
  RISK_ADJUSTED: 'risk_adj',  // 风险调整收益 (Sharpe-like)
  ACCELERATION: 'accel',      // 动量加速度 (动量变化率)
}; // 结束代码块

/**
 * 动量因子类
 * Momentum Factor Class
 */
export class MomentumFactor extends BaseFactor { // 导出类 MomentumFactor
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 回看周期 (天数)
   * @param {string} config.type - 动量类型
   * @param {boolean} config.useVolatility - 是否使用波动率调整
   */
  constructor(config = {}) { // 构造函数
    const period = config.period || 7; // 定义常量 period
    const type = config.type || MOMENTUM_TYPE.SIMPLE; // 定义常量 type

    super({ // 调用父类
      name: config.name || `Momentum_${period}d`, // 设置 name 字段
      category: FACTOR_CATEGORY.MOMENTUM, // 设置 category 字段
      direction: FACTOR_DIRECTION.POSITIVE, // 高动量 → 预期正收益
      frequency: FACTOR_FREQUENCY.DAILY, // 设置 frequency 字段
      description: `${period}天动量因子 (${type})`, // 设置 description 字段
      params: { // 设置 params 字段
        period, // 执行语句
        type, // 执行语句
        useVolatility: config.useVolatility || false, // 设置 useVolatility 字段
        minDataPoints: config.minDataPoints || Math.ceil(period * 0.8), // 设置 minDataPoints 字段
      }, // 结束代码块
      ...config, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.candles - K线数据 [{close, high, low, volume, timestamp}]
   * @returns {Promise<number|null>} 动量值
   */
  async calculate(symbol, data, context = {}) { // 执行语句
    const { candles } = data; // 解构赋值
    const { period, type, useVolatility, minDataPoints } = this.params; // 解构赋值

    // 数据验证 / Data validation
    if (!candles || candles.length < minDataPoints) { // 条件判断 !candles || candles.length < minDataPoints
      return null; // 返回结果
    } // 结束代码块

    // 获取收盘价 / Get close prices
    const closes = candles.slice(-period - 1).map(c => parseFloat(c.close)); // 定义函数 closes

    if (closes.length < 2) { // 条件判断 closes.length < 2
      return null; // 返回结果
    } // 结束代码块

    let momentum; // 定义变量 momentum

    switch (type) { // 分支选择 type
      case MOMENTUM_TYPE.SIMPLE: // 分支 MOMENTUM_TYPE.SIMPLE
        momentum = this._calculateSimple(closes); // 赋值 momentum
        break; // 跳出循环或分支

      case MOMENTUM_TYPE.LOG: // 分支 MOMENTUM_TYPE.LOG
        momentum = this._calculateLog(closes); // 赋值 momentum
        break; // 跳出循环或分支

      case MOMENTUM_TYPE.RISK_ADJUSTED: // 分支 MOMENTUM_TYPE.RISK_ADJUSTED
        momentum = this._calculateRiskAdjusted(closes); // 赋值 momentum
        break; // 跳出循环或分支

      case MOMENTUM_TYPE.ACCELERATION: // 分支 MOMENTUM_TYPE.ACCELERATION
        momentum = this._calculateAcceleration(closes); // 赋值 momentum
        break; // 跳出循环或分支

      default: // 默认分支
        momentum = this._calculateSimple(closes); // 赋值 momentum
    } // 结束代码块

    // 波动率调整 / Volatility adjustment
    if (useVolatility && momentum !== null) { // 条件判断 useVolatility && momentum !== null
      const volatility = this._calculateVolatility(closes); // 定义常量 volatility
      if (volatility > 0) { // 条件判断 volatility > 0
        momentum = momentum / volatility; // 赋值 momentum
      } // 结束代码块
    } // 结束代码块

    return momentum; // 返回结果
  } // 结束代码块

  /**
   * 计算简单动量 (收益率)
   * Calculate simple momentum (return rate)
   * @private
   */
  _calculateSimple(closes) { // 调用 _calculateSimple
    if (closes.length < 2) return null; // 条件判断 closes.length < 2

    const start = closes[0]; // 定义常量 start
    const end = closes[closes.length - 1]; // 定义常量 end

    if (start <= 0) return null; // 条件判断 start <= 0

    return (end - start) / start; // 返回结果
  } // 结束代码块

  /**
   * 计算对数动量
   * Calculate log momentum
   * @private
   */
  _calculateLog(closes) { // 调用 _calculateLog
    if (closes.length < 2) return null; // 条件判断 closes.length < 2

    const start = closes[0]; // 定义常量 start
    const end = closes[closes.length - 1]; // 定义常量 end

    if (start <= 0 || end <= 0) return null; // 条件判断 start <= 0 || end <= 0

    return Math.log(end / start); // 返回结果
  } // 结束代码块

  /**
   * 计算风险调整动量 (类似夏普)
   * Calculate risk-adjusted momentum (Sharpe-like)
   * @private
   */
  _calculateRiskAdjusted(closes) { // 调用 _calculateRiskAdjusted
    if (closes.length < 3) return null; // 条件判断 closes.length < 3

    // 计算日收益率 / Calculate daily returns
    const returns = []; // 定义常量 returns
    for (let i = 1; i < closes.length; i++) { // 循环 let i = 1; i < closes.length; i++
      if (closes[i - 1] > 0) { // 条件判断 closes[i - 1] > 0
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]); // 调用 returns.push
      } // 结束代码块
    } // 结束代码块

    if (returns.length < 2) return null; // 条件判断 returns.length < 2

    // 平均收益 / Mean return
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length; // 定义函数 meanReturn

    // 标准差 / Standard deviation
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / returns.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std

    if (std === 0) return meanReturn > 0 ? Infinity : (meanReturn < 0 ? -Infinity : 0); // 条件判断 std === 0

    // 风险调整收益 / Risk-adjusted return
    return meanReturn / std; // 返回结果
  } // 结束代码块

  /**
   * 计算动量加速度
   * Calculate momentum acceleration
   * @private
   */
  _calculateAcceleration(closes) { // 调用 _calculateAcceleration
    if (closes.length < 3) return null; // 条件判断 closes.length < 3

    const halfLen = Math.floor(closes.length / 2); // 定义常量 halfLen
    const firstHalf = closes.slice(0, halfLen + 1); // 定义常量 firstHalf
    const secondHalf = closes.slice(halfLen); // 定义常量 secondHalf

    const mom1 = this._calculateSimple(firstHalf); // 定义常量 mom1
    const mom2 = this._calculateSimple(secondHalf); // 定义常量 mom2

    if (mom1 === null || mom2 === null) return null; // 条件判断 mom1 === null || mom2 === null

    // 加速度 = 后半段动量 - 前半段动量
    return mom2 - mom1; // 返回结果
  } // 结束代码块

  /**
   * 计算波动率
   * Calculate volatility
   * @private
   */
  _calculateVolatility(closes) { // 调用 _calculateVolatility
    if (closes.length < 2) return 0; // 条件判断 closes.length < 2

    const returns = []; // 定义常量 returns
    for (let i = 1; i < closes.length; i++) { // 循环 let i = 1; i < closes.length; i++
      if (closes[i - 1] > 0) { // 条件判断 closes[i - 1] > 0
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]); // 调用 returns.push
      } // 结束代码块
    } // 结束代码块

    if (returns.length === 0) return 0; // 条件判断 returns.length === 0

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length; // 定义函数 mean
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length; // 定义函数 variance

    return Math.sqrt(variance); // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 创建预定义的动量因子
 * Create predefined momentum factors
 */

// 1天动量
export const Momentum1D = new MomentumFactor({ // 导出常量 Momentum1D
  name: 'Momentum_1d', // 设置 name 字段
  period: 1, // 设置 period 字段
  type: MOMENTUM_TYPE.SIMPLE, // 设置 type 字段
  minDataPoints: 2, // 设置 minDataPoints 字段
}); // 结束代码块

// 7天动量
export const Momentum7D = new MomentumFactor({ // 导出常量 Momentum7D
  name: 'Momentum_7d', // 设置 name 字段
  period: 7, // 设置 period 字段
  type: MOMENTUM_TYPE.SIMPLE, // 设置 type 字段
  minDataPoints: 5, // 设置 minDataPoints 字段
}); // 结束代码块

// 30天动量
export const Momentum30D = new MomentumFactor({ // 导出常量 Momentum30D
  name: 'Momentum_30d', // 设置 name 字段
  period: 30, // 设置 period 字段
  type: MOMENTUM_TYPE.SIMPLE, // 设置 type 字段
  minDataPoints: 20, // 设置 minDataPoints 字段
}); // 结束代码块

// 7天风险调整动量
export const RiskAdjustedMomentum7D = new MomentumFactor({ // 导出常量 RiskAdjustedMomentum7D
  name: 'RiskAdj_Momentum_7d', // 设置 name 字段
  period: 7, // 设置 period 字段
  type: MOMENTUM_TYPE.RISK_ADJUSTED, // 设置 type 字段
  minDataPoints: 5, // 设置 minDataPoints 字段
}); // 结束代码块

// 14天动量加速度
export const MomentumAcceleration14D = new MomentumFactor({ // 导出常量 MomentumAcceleration14D
  name: 'Momentum_Accel_14d', // 设置 name 字段
  period: 14, // 设置 period 字段
  type: MOMENTUM_TYPE.ACCELERATION, // 设置 type 字段
  minDataPoints: 10, // 设置 minDataPoints 字段
}); // 结束代码块

/**
 * 工厂函数: 创建自定义动量因子
 * Factory function: create custom momentum factor
 */
export function createMomentumFactor(period, type = MOMENTUM_TYPE.SIMPLE, options = {}) { // 导出函数 createMomentumFactor
  return new MomentumFactor({ // 返回结果
    period, // 执行语句
    type, // 执行语句
    ...options, // 展开对象或数组
  }); // 结束代码块
} // 结束代码块

export default MomentumFactor; // 默认导出
