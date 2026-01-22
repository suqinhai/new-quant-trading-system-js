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

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js'; // 导入模块 ../BaseFactor.js

/**
 * 资金流计算方法
 * Money Flow Calculation Methods
 */
export const MONEY_FLOW_METHOD = { // 导出常量 MONEY_FLOW_METHOD
  MFI: 'mfi',                    // Money Flow Index
  OBV_SLOPE: 'obv_slope',        // OBV 斜率
  CMF: 'cmf',                    // Chaikin Money Flow
  VOLUME_RATIO: 'vol_ratio',     // 上涨/下跌成交量比
  ACCUMULATION: 'accumulation',  // 累积/派发指标
}; // 结束代码块

/**
 * 资金流向因子类
 * Money Flow Factor Class
 */
export class MoneyFlowFactor extends BaseFactor { // 导出类 MoneyFlowFactor
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 计算周期
   * @param {string} config.method - 计算方法
   */
  constructor(config = {}) { // 构造函数
    const period = config.period || 14; // 定义常量 period
    const method = config.method || MONEY_FLOW_METHOD.MFI; // 定义常量 method

    super({ // 调用父类
      name: config.name || `MoneyFlow_${method}_${period}`, // 设置 name 字段
      category: FACTOR_CATEGORY.MONEY_FLOW, // 设置 category 字段
      direction: FACTOR_DIRECTION.POSITIVE, // 高资金流入 → 预期正收益
      frequency: FACTOR_FREQUENCY.DAILY, // 设置 frequency 字段
      description: `资金流向因子 (${method}, ${period}周期)`, // 设置 description 字段
      params: { // 设置 params 字段
        period, // 执行语句
        method, // 执行语句
        minDataPoints: config.minDataPoints || Math.ceil(period * 0.8), // 设置 minDataPoints 字段
      }, // 结束代码块
      ...config, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.candles - K线数据 [{open, high, low, close, volume}]
   * @returns {Promise<number|null>} 资金流因子值
   */
  async calculate(symbol, data, context = {}) { // 执行语句
    const { candles } = data; // 解构赋值
    const { method, minDataPoints } = this.params; // 解构赋值

    if (!candles || candles.length < minDataPoints) { // 条件判断 !candles || candles.length < minDataPoints
      return null; // 返回结果
    } // 结束代码块

    let value; // 定义变量 value

    switch (method) { // 分支选择 method
      case MONEY_FLOW_METHOD.MFI: // 分支 MONEY_FLOW_METHOD.MFI
        value = this._calculateMFI(candles); // 赋值 value
        break; // 跳出循环或分支

      case MONEY_FLOW_METHOD.OBV_SLOPE: // 分支 MONEY_FLOW_METHOD.OBV_SLOPE
        value = this._calculateOBVSlope(candles); // 赋值 value
        break; // 跳出循环或分支

      case MONEY_FLOW_METHOD.CMF: // 分支 MONEY_FLOW_METHOD.CMF
        value = this._calculateCMF(candles); // 赋值 value
        break; // 跳出循环或分支

      case MONEY_FLOW_METHOD.VOLUME_RATIO: // 分支 MONEY_FLOW_METHOD.VOLUME_RATIO
        value = this._calculateVolumeRatio(candles); // 赋值 value
        break; // 跳出循环或分支

      case MONEY_FLOW_METHOD.ACCUMULATION: // 分支 MONEY_FLOW_METHOD.ACCUMULATION
        value = this._calculateAccumulation(candles); // 赋值 value
        break; // 跳出循环或分支

      default: // 默认分支
        value = this._calculateMFI(candles); // 赋值 value
    } // 结束代码块

    return value; // 返回结果
  } // 结束代码块

  /**
   * 计算 MFI (Money Flow Index)
   * @private
   */
  _calculateMFI(candles) { // 调用 _calculateMFI
    const { period } = this.params; // 解构赋值
    const slice = candles.slice(-period - 1); // 定义常量 slice

    if (slice.length < period + 1) return null; // 条件判断 slice.length < period + 1

    let positiveFlow = 0; // 定义变量 positiveFlow
    let negativeFlow = 0; // 定义变量 negativeFlow

    for (let i = 1; i < slice.length; i++) { // 循环 let i = 1; i < slice.length; i++
      // 典型价格 / Typical price
      const tp = (parseFloat(slice[i].high) + parseFloat(slice[i].low) + parseFloat(slice[i].close)) / 3; // 定义常量 tp
      const prevTp = (parseFloat(slice[i - 1].high) + parseFloat(slice[i - 1].low) + parseFloat(slice[i - 1].close)) / 3; // 定义常量 prevTp
      const volume = parseFloat(slice[i].volume); // 定义常量 volume

      // 资金流 / Money flow
      const moneyFlow = tp * volume; // 定义常量 moneyFlow

      if (tp > prevTp) { // 条件判断 tp > prevTp
        positiveFlow += moneyFlow; // 执行语句
      } else if (tp < prevTp) { // 执行语句
        negativeFlow += moneyFlow; // 执行语句
      } // 结束代码块
    } // 结束代码块

    if (negativeFlow === 0) return 100; // 条件判断 negativeFlow === 0
    if (positiveFlow === 0) return 0; // 条件判断 positiveFlow === 0

    const mfRatio = positiveFlow / negativeFlow; // 定义常量 mfRatio
    const mfi = 100 - (100 / (1 + mfRatio)); // 定义常量 mfi

    return mfi; // 返回结果
  } // 结束代码块

  /**
   * 计算 OBV 斜率
   * Calculate OBV Slope
   * @private
   */
  _calculateOBVSlope(candles) { // 调用 _calculateOBVSlope
    const { period } = this.params; // 解构赋值
    const slice = candles.slice(-period - 1); // 定义常量 slice

    if (slice.length < period + 1) return null; // 条件判断 slice.length < period + 1

    // 计算 OBV 序列 / Calculate OBV series
    const obvValues = [0]; // 定义常量 obvValues
    for (let i = 1; i < slice.length; i++) { // 循环 let i = 1; i < slice.length; i++
      const close = parseFloat(slice[i].close); // 定义常量 close
      const prevClose = parseFloat(slice[i - 1].close); // 定义常量 prevClose
      const volume = parseFloat(slice[i].volume); // 定义常量 volume

      let obv = obvValues[obvValues.length - 1]; // 定义变量 obv
      if (close > prevClose) { // 条件判断 close > prevClose
        obv += volume; // 执行语句
      } else if (close < prevClose) { // 执行语句
        obv -= volume; // 执行语句
      } // 结束代码块
      obvValues.push(obv); // 调用 obvValues.push
    } // 结束代码块

    // 计算线性回归斜率 / Calculate linear regression slope
    return this._calculateSlope(obvValues); // 返回结果
  } // 结束代码块

  /**
   * 计算 CMF (Chaikin Money Flow)
   * @private
   */
  _calculateCMF(candles) { // 调用 _calculateCMF
    const { period } = this.params; // 解构赋值
    const slice = candles.slice(-period); // 定义常量 slice

    if (slice.length < period) return null; // 条件判断 slice.length < period

    let mfVolume = 0; // 定义变量 mfVolume
    let totalVolume = 0; // 定义变量 totalVolume

    for (const candle of slice) { // 循环 const candle of slice
      const high = parseFloat(candle.high); // 定义常量 high
      const low = parseFloat(candle.low); // 定义常量 low
      const close = parseFloat(candle.close); // 定义常量 close
      const volume = parseFloat(candle.volume); // 定义常量 volume

      // Money Flow Multiplier
      const range = high - low; // 定义常量 range
      let mfm = 0; // 定义变量 mfm
      if (range > 0) { // 条件判断 range > 0
        mfm = ((close - low) - (high - close)) / range; // 赋值 mfm
      } // 结束代码块

      mfVolume += mfm * volume; // 执行语句
      totalVolume += volume; // 执行语句
    } // 结束代码块

    if (totalVolume === 0) return 0; // 条件判断 totalVolume === 0

    return mfVolume / totalVolume; // 返回结果
  } // 结束代码块

  /**
   * 计算上涨/下跌成交量比
   * Calculate Up/Down Volume Ratio
   * @private
   */
  _calculateVolumeRatio(candles) { // 调用 _calculateVolumeRatio
    const { period } = this.params; // 解构赋值
    const slice = candles.slice(-period); // 定义常量 slice

    if (slice.length < period) return null; // 条件判断 slice.length < period

    let upVolume = 0; // 定义变量 upVolume
    let downVolume = 0; // 定义变量 downVolume

    for (const candle of slice) { // 循环 const candle of slice
      const open = parseFloat(candle.open); // 定义常量 open
      const close = parseFloat(candle.close); // 定义常量 close
      const volume = parseFloat(candle.volume); // 定义常量 volume

      if (close > open) { // 条件判断 close > open
        upVolume += volume; // 执行语句
      } else if (close < open) { // 执行语句
        downVolume += volume; // 执行语句
      } // 结束代码块
    } // 结束代码块

    if (downVolume === 0) return upVolume > 0 ? Infinity : 1; // 条件判断 downVolume === 0

    return upVolume / downVolume; // 返回结果
  } // 结束代码块

  /**
   * 计算累积/派发指标
   * Calculate Accumulation/Distribution
   * @private
   */
  _calculateAccumulation(candles) { // 调用 _calculateAccumulation
    const { period } = this.params; // 解构赋值
    const slice = candles.slice(-period - 1); // 定义常量 slice

    if (slice.length < 2) return null; // 条件判断 slice.length < 2

    // 计算 A/D 序列 / Calculate A/D series
    const adValues = [0]; // 定义常量 adValues
    for (let i = 1; i < slice.length; i++) { // 循环 let i = 1; i < slice.length; i++
      const high = parseFloat(slice[i].high); // 定义常量 high
      const low = parseFloat(slice[i].low); // 定义常量 low
      const close = parseFloat(slice[i].close); // 定义常量 close
      const volume = parseFloat(slice[i].volume); // 定义常量 volume

      // CLV (Close Location Value)
      const range = high - low; // 定义常量 range
      let clv = 0; // 定义变量 clv
      if (range > 0) { // 条件判断 range > 0
        clv = ((close - low) - (high - close)) / range; // 赋值 clv
      } // 结束代码块

      const ad = adValues[adValues.length - 1] + clv * volume; // 定义常量 ad
      adValues.push(ad); // 调用 adValues.push
    } // 结束代码块

    // 返回斜率 / Return slope
    return this._calculateSlope(adValues); // 返回结果
  } // 结束代码块

  /**
   * 计算斜率 (线性回归)
   * @private
   */
  _calculateSlope(values) { // 调用 _calculateSlope
    const n = values.length; // 定义常量 n
    if (n < 2) return 0; // 条件判断 n < 2

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0; // 定义变量 sumX

    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      sumX += i; // 执行语句
      sumY += values[i]; // 执行语句
      sumXY += i * values[i]; // 执行语句
      sumX2 += i * i; // 执行语句
    } // 结束代码块

    const denominator = n * sumX2 - sumX * sumX; // 定义常量 denominator
    if (denominator === 0) return 0; // 条件判断 denominator === 0

    return (n * sumXY - sumX * sumY) / denominator; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// MFI 14周期
export const MFI14 = new MoneyFlowFactor({ // 导出常量 MFI14
  name: 'MFI_14', // 设置 name 字段
  period: 14, // 设置 period 字段
  method: MONEY_FLOW_METHOD.MFI, // 设置 method 字段
}); // 结束代码块

// OBV 斜率
export const OBVSlope20 = new MoneyFlowFactor({ // 导出常量 OBVSlope20
  name: 'OBV_Slope_20', // 设置 name 字段
  period: 20, // 设置 period 字段
  method: MONEY_FLOW_METHOD.OBV_SLOPE, // 设置 method 字段
}); // 结束代码块

// CMF 20周期
export const CMF20 = new MoneyFlowFactor({ // 导出常量 CMF20
  name: 'CMF_20', // 设置 name 字段
  period: 20, // 设置 period 字段
  method: MONEY_FLOW_METHOD.CMF, // 设置 method 字段
}); // 结束代码块

// 成交量比率
export const VolumeRatio14 = new MoneyFlowFactor({ // 导出常量 VolumeRatio14
  name: 'Vol_Ratio_14', // 设置 name 字段
  period: 14, // 设置 period 字段
  method: MONEY_FLOW_METHOD.VOLUME_RATIO, // 设置 method 字段
}); // 结束代码块

/**
 * 工厂函数
 */
export function createMoneyFlowFactor(period, method = MONEY_FLOW_METHOD.MFI, options = {}) { // 导出函数 createMoneyFlowFactor
  return new MoneyFlowFactor({ // 返回结果
    period, // 执行语句
    method, // 执行语句
    ...options, // 展开对象或数组
  }); // 结束代码块
} // 结束代码块

export default MoneyFlowFactor; // 默认导出
