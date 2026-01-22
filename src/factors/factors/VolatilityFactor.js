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

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js'; // 导入模块 ../BaseFactor.js

/**
 * 波动率测量方法
 * Volatility Measurement Methods
 */
export const VOLATILITY_METHOD = { // 导出常量 VOLATILITY_METHOD
  BOLLINGER_WIDTH: 'bb_width',      // 布林带宽度
  ATR_RATIO: 'atr_ratio',           // ATR 与历史 ATR 比值
  KELTNER_SQUEEZE: 'keltner',       // 肯特纳通道挤压
  HISTORICAL_RANK: 'hist_rank',     // 历史波动率百分位
  REALIZED_VS_IMPLIED: 'rv_iv',     // 实现波动率 vs 隐含 (需要期权数据)
}; // 结束代码块

/**
 * 波动率收缩因子类
 * Volatility Contraction Factor Class
 */
export class VolatilityFactor extends BaseFactor { // 导出类 VolatilityFactor
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 计算周期
   * @param {number} config.lookbackPeriod - 历史回看周期 (用于百分位计算)
   * @param {string} config.method - 计算方法
   * @param {number} config.bbStdDev - 布林带标准差倍数
   */
  constructor(config = {}) { // 构造函数
    const period = config.period || 20; // 定义常量 period
    const method = config.method || VOLATILITY_METHOD.BOLLINGER_WIDTH; // 定义常量 method

    super({ // 调用父类
      name: config.name || `Volatility_${method}_${period}`, // 设置 name 字段
      category: FACTOR_CATEGORY.VOLATILITY, // 设置 category 字段
      direction: FACTOR_DIRECTION.NEGATIVE, // 低波动率 → 预期突破 (方向不定)
      frequency: FACTOR_FREQUENCY.DAILY, // 设置 frequency 字段
      description: `波动率收缩因子 (${method}, ${period}周期)`, // 设置 description 字段
      params: { // 设置 params 字段
        period, // 执行语句
        method, // 执行语句
        lookbackPeriod: config.lookbackPeriod || 60, // 设置 lookbackPeriod 字段
        bbStdDev: config.bbStdDev || 2, // 设置 bbStdDev 字段
        atrPeriod: config.atrPeriod || 14, // 设置 atrPeriod 字段
        keltnerMultiplier: config.keltnerMultiplier || 1.5, // 设置 keltnerMultiplier 字段
        minDataPoints: config.minDataPoints || Math.ceil(period * 0.8), // 设置 minDataPoints 字段
      }, // 结束代码块
      ...config, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.candles - K线数据
   * @returns {Promise<number|null>} 波动率收缩值 (越小表示越收缩)
   */
  async calculate(symbol, data, context = {}) { // 执行语句
    const { candles } = data; // 解构赋值
    const { method, minDataPoints, lookbackPeriod } = this.params; // 解构赋值

    if (!candles || candles.length < minDataPoints) { // 条件判断 !candles || candles.length < minDataPoints
      return null; // 返回结果
    } // 结束代码块

    let value; // 定义变量 value

    switch (method) { // 分支选择 method
      case VOLATILITY_METHOD.BOLLINGER_WIDTH: // 分支 VOLATILITY_METHOD.BOLLINGER_WIDTH
        value = this._calculateBollingerWidth(candles); // 赋值 value
        break; // 跳出循环或分支

      case VOLATILITY_METHOD.ATR_RATIO: // 分支 VOLATILITY_METHOD.ATR_RATIO
        value = this._calculateATRRatio(candles); // 赋值 value
        break; // 跳出循环或分支

      case VOLATILITY_METHOD.KELTNER_SQUEEZE: // 分支 VOLATILITY_METHOD.KELTNER_SQUEEZE
        value = this._calculateKeltnerSqueeze(candles); // 赋值 value
        break; // 跳出循环或分支

      case VOLATILITY_METHOD.HISTORICAL_RANK: // 分支 VOLATILITY_METHOD.HISTORICAL_RANK
        value = this._calculateHistoricalRank(candles); // 赋值 value
        break; // 跳出循环或分支

      default: // 默认分支
        value = this._calculateBollingerWidth(candles); // 赋值 value
    } // 结束代码块

    return value; // 返回结果
  } // 结束代码块

  /**
   * 计算布林带宽度
   * Calculate Bollinger Band Width
   * @private
   */
  _calculateBollingerWidth(candles) { // 调用 _calculateBollingerWidth
    const { period, bbStdDev } = this.params; // 解构赋值
    const closes = candles.slice(-period).map(c => parseFloat(c.close)); // 定义函数 closes

    if (closes.length < period) return null; // 条件判断 closes.length < period

    // 计算 SMA / Calculate SMA
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length; // 定义函数 sma

    // 计算标准差 / Calculate standard deviation
    const variance = closes.reduce((acc, c) => acc + Math.pow(c - sma, 2), 0) / closes.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std

    // 布林带上下轨 / Bollinger upper and lower bands
    const upper = sma + bbStdDev * std; // 定义常量 upper
    const lower = sma - bbStdDev * std; // 定义常量 lower

    // 带宽百分比 / Band width percentage
    if (sma === 0) return null; // 条件判断 sma === 0

    const width = ((upper - lower) / sma) * 100; // 定义常量 width

    return width; // 返回结果
  } // 结束代码块

  /**
   * 计算 ATR 比值
   * Calculate ATR Ratio (current ATR / historical average ATR)
   * @private
   */
  _calculateATRRatio(candles) { // 调用 _calculateATRRatio
    const { atrPeriod, lookbackPeriod } = this.params; // 解构赋值

    if (candles.length < lookbackPeriod) return null; // 条件判断 candles.length < lookbackPeriod

    // 计算所有 ATR / Calculate all ATR values
    const atrValues = []; // 定义常量 atrValues
    for (let i = atrPeriod; i < candles.length; i++) { // 循环 let i = atrPeriod; i < candles.length; i++
      const slice = candles.slice(i - atrPeriod, i); // 定义常量 slice
      const atr = this._calculateATR(slice); // 定义常量 atr
      if (atr !== null) { // 条件判断 atr !== null
        atrValues.push(atr); // 调用 atrValues.push
      } // 结束代码块
    } // 结束代码块

    if (atrValues.length < 2) return null; // 条件判断 atrValues.length < 2

    // 当前 ATR / Current ATR
    const currentATR = atrValues[atrValues.length - 1]; // 定义常量 currentATR

    // 历史平均 ATR / Historical average ATR
    const historicalATRs = atrValues.slice(-lookbackPeriod, -1); // 定义常量 historicalATRs
    const avgATR = historicalATRs.reduce((a, b) => a + b, 0) / historicalATRs.length; // 定义函数 avgATR

    if (avgATR === 0) return null; // 条件判断 avgATR === 0

    // 比值: <1 表示收缩 / Ratio: <1 means contraction
    return currentATR / avgATR; // 返回结果
  } // 结束代码块

  /**
   * 计算肯特纳通道挤压
   * Calculate Keltner Channel Squeeze
   * 返回布林带是否在肯特纳通道内 (挤压状态)
   * @private
   */
  _calculateKeltnerSqueeze(candles) { // 调用 _calculateKeltnerSqueeze
    const { period, bbStdDev, atrPeriod, keltnerMultiplier } = this.params; // 解构赋值

    if (candles.length < Math.max(period, atrPeriod) + 1) return null; // 条件判断 candles.length < Math.max(period, atrPeriod) + 1

    const closes = candles.slice(-period).map(c => parseFloat(c.close)); // 定义函数 closes

    // 布林带 / Bollinger Bands
    const sma = closes.reduce((a, b) => a + b, 0) / closes.length; // 定义函数 sma
    const variance = closes.reduce((acc, c) => acc + Math.pow(c - sma, 2), 0) / closes.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std
    const bbUpper = sma + bbStdDev * std; // 定义常量 bbUpper
    const bbLower = sma - bbStdDev * std; // 定义常量 bbLower

    // ATR for Keltner
    const atr = this._calculateATR(candles.slice(-atrPeriod - 1)); // 定义常量 atr
    if (atr === null) return null; // 条件判断 atr === null

    // 肯特纳通道 / Keltner Channels
    const kcUpper = sma + keltnerMultiplier * atr; // 定义常量 kcUpper
    const kcLower = sma - keltnerMultiplier * atr; // 定义常量 kcLower

    // 挤压程度 / Squeeze level
    // 负值表示挤压 (布林带在肯特纳内)
    // Negative value means squeeze (BB inside KC)
    const squeeze = ((bbUpper - bbLower) - (kcUpper - kcLower)) / sma * 100; // 定义常量 squeeze

    return squeeze; // 返回结果
  } // 结束代码块

  /**
   * 计算历史波动率百分位
   * Calculate Historical Volatility Percentile
   * @private
   */
  _calculateHistoricalRank(candles) { // 调用 _calculateHistoricalRank
    const { period, lookbackPeriod } = this.params; // 解构赋值

    if (candles.length < lookbackPeriod + period) return null; // 条件判断 candles.length < lookbackPeriod + period

    // 计算历史波动率序列 / Calculate historical volatility series
    const volHistory = []; // 定义常量 volHistory
    for (let i = period; i <= candles.length; i++) { // 循环 let i = period; i <= candles.length; i++
      const slice = candles.slice(i - period, i); // 定义常量 slice
      const vol = this._calculateReturnsVolatility(slice); // 定义常量 vol
      if (vol !== null) { // 条件判断 vol !== null
        volHistory.push(vol); // 调用 volHistory.push
      } // 结束代码块
    } // 结束代码块

    if (volHistory.length < 10) return null; // 条件判断 volHistory.length < 10

    // 当前波动率 / Current volatility
    const currentVol = volHistory[volHistory.length - 1]; // 定义常量 currentVol

    // 计算百分位 / Calculate percentile
    const historicalVols = volHistory.slice(-lookbackPeriod); // 定义常量 historicalVols
    const sorted = [...historicalVols].sort((a, b) => a - b); // 定义函数 sorted
    let rank = 0; // 定义变量 rank
    for (let i = 0; i < sorted.length; i++) { // 循环 let i = 0; i < sorted.length; i++
      if (sorted[i] <= currentVol) rank++; // 条件判断 sorted[i] <= currentVol
    } // 结束代码块

    return (rank / sorted.length) * 100; // 返回结果
  } // 结束代码块

  /**
   * 计算 ATR
   * @private
   */
  _calculateATR(candles) { // 调用 _calculateATR
    if (candles.length < 2) return null; // 条件判断 candles.length < 2

    const trueRanges = []; // 定义常量 trueRanges
    for (let i = 1; i < candles.length; i++) { // 循环 let i = 1; i < candles.length; i++
      const high = parseFloat(candles[i].high); // 定义常量 high
      const low = parseFloat(candles[i].low); // 定义常量 low
      const prevClose = parseFloat(candles[i - 1].close); // 定义常量 prevClose

      const tr = Math.max( // 定义常量 tr
        high - low, // 执行语句
        Math.abs(high - prevClose), // 调用 Math.abs
        Math.abs(low - prevClose) // 调用 Math.abs
      ); // 结束调用或参数
      trueRanges.push(tr); // 调用 trueRanges.push
    } // 结束代码块

    if (trueRanges.length === 0) return null; // 条件判断 trueRanges.length === 0

    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length; // 返回结果
  } // 结束代码块

  /**
   * 计算收益率波动率
   * @private
   */
  _calculateReturnsVolatility(candles) { // 调用 _calculateReturnsVolatility
    if (candles.length < 2) return null; // 条件判断 candles.length < 2

    const returns = []; // 定义常量 returns
    for (let i = 1; i < candles.length; i++) { // 循环 let i = 1; i < candles.length; i++
      const prevClose = parseFloat(candles[i - 1].close); // 定义常量 prevClose
      const close = parseFloat(candles[i].close); // 定义常量 close
      if (prevClose > 0) { // 条件判断 prevClose > 0
        returns.push((close - prevClose) / prevClose); // 调用 returns.push
      } // 结束代码块
    } // 结束代码块

    if (returns.length < 2) return null; // 条件判断 returns.length < 2

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length; // 定义函数 mean
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length; // 定义函数 variance

    return Math.sqrt(variance); // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// 布林带宽度 (20周期)
export const BollingerWidth20 = new VolatilityFactor({ // 导出常量 BollingerWidth20
  name: 'BB_Width_20', // 设置 name 字段
  period: 20, // 设置 period 字段
  method: VOLATILITY_METHOD.BOLLINGER_WIDTH, // 设置 method 字段
}); // 结束代码块

// ATR 比值
export const ATRRatio = new VolatilityFactor({ // 导出常量 ATRRatio
  name: 'ATR_Ratio', // 设置 name 字段
  period: 14, // 设置 period 字段
  method: VOLATILITY_METHOD.ATR_RATIO, // 设置 method 字段
  lookbackPeriod: 60, // 设置 lookbackPeriod 字段
}); // 结束代码块

// 肯特纳挤压
export const KeltnerSqueeze = new VolatilityFactor({ // 导出常量 KeltnerSqueeze
  name: 'Keltner_Squeeze', // 设置 name 字段
  period: 20, // 设置 period 字段
  method: VOLATILITY_METHOD.KELTNER_SQUEEZE, // 设置 method 字段
}); // 结束代码块

// 历史波动率百分位
export const VolatilityPercentile = new VolatilityFactor({ // 导出常量 VolatilityPercentile
  name: 'Vol_Percentile', // 设置 name 字段
  period: 20, // 设置 period 字段
  method: VOLATILITY_METHOD.HISTORICAL_RANK, // 设置 method 字段
  lookbackPeriod: 120, // 设置 lookbackPeriod 字段
}); // 结束代码块

/**
 * 工厂函数
 * Factory function
 */
export function createVolatilityFactor(period, method = VOLATILITY_METHOD.BOLLINGER_WIDTH, options = {}) { // 导出函数 createVolatilityFactor
  return new VolatilityFactor({ // 返回结果
    period, // 执行语句
    method, // 执行语句
    ...options, // 展开对象或数组
  }); // 结束代码块
} // 结束代码块

export default VolatilityFactor; // 默认导出
