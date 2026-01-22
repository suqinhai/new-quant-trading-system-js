/**
 * 技术指标计算工具
 * Technical Indicators Utility
 *
 * 提供常用技术指标的计算函数
 * Provides calculation functions for common technical indicators
 */

// 导入技术指标库 / Import technical indicators library
import * as ti from 'technicalindicators'; // 导入模块 technicalindicators

// 导入辅助函数 / Import helper functions
import { toNumber, average, standardDeviation } from './helpers.js'; // 导入模块 ./helpers.js

// ============================================
// 移动平均线 / Moving Averages
// ============================================

/**
 * 计算简单移动平均线
 * Calculate Simple Moving Average
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @returns {number[]} SMA 值数组 / SMA values array
 */
export function SMA(values, period) { // 导出函数 SMA
  // 使用技术指标库计算 / Calculate using library
  const result = ti.SMA.calculate({ // 定义常量 result
    values: values.map(toNumber), // values
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算指数移动平均线
 * Calculate Exponential Moving Average
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @returns {number[]} EMA 值数组 / EMA values array
 */
export function EMA(values, period) { // 导出函数 EMA
  // 使用技术指标库计算 / Calculate using library
  const result = ti.EMA.calculate({ // 定义常量 result
    values: values.map(toNumber), // values
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算加权移动平均线
 * Calculate Weighted Moving Average
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @returns {number[]} WMA 值数组 / WMA values array
 */
export function WMA(values, period) { // 导出函数 WMA
  // 使用技术指标库计算 / Calculate using library
  const result = ti.WMA.calculate({ // 定义常量 result
    values: values.map(toNumber), // values
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算成交量加权移动平均线
 * Calculate Volume Weighted Moving Average
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} VWMA 值数组 / VWMA values array
 */
export function VWMA(candles, period) { // 导出函数 VWMA
  // 使用技术指标库计算 / Calculate using library
  const result = ti.VWMA.calculate({ // 定义常量 result
    close: candles.map(c => toNumber(c.close)), // 收盘
    volume: candles.map(c => toNumber(c.volume)), // 成交量
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

// ============================================
// 震荡指标 / Oscillators
// ============================================

/**
 * 计算相对强弱指数
 * Calculate Relative Strength Index
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @returns {number[]} RSI 值数组 / RSI values array
 */
export function RSI(values, period = 14) { // 导出函数 RSI
  // 使用技术指标库计算 / Calculate using library
  const result = ti.RSI.calculate({ // 定义常量 result
    values: values.map(toNumber), // values
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算随机指标
 * Calculate Stochastic Oscillator
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - K 周期 / K period
 * @param {number} signalPeriod - D 周期 / D period
 * @returns {Object[]} 随机指标数组 { k, d } / Stochastic array
 */
export function Stochastic(candles, period = 14, signalPeriod = 3) { // 导出函数 Stochastic
  // 使用技术指标库计算 / Calculate using library
  const result = ti.Stochastic.calculate({ // 定义常量 result
    high: candles.map(c => toNumber(c.high)), // 最高
    low: candles.map(c => toNumber(c.low)), // 最低
    close: candles.map(c => toNumber(c.close)), // 收盘
    period, // 执行语句
    signalPeriod, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算威廉指标
 * Calculate Williams %R
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} 威廉指标数组 / Williams %R array
 */
export function WilliamsR(candles, period = 14) { // 导出函数 WilliamsR
  // 使用技术指标库计算 / Calculate using library
  const result = ti.WilliamsR.calculate({ // 定义常量 result
    high: candles.map(c => toNumber(c.high)), // 最高
    low: candles.map(c => toNumber(c.low)), // 最低
    close: candles.map(c => toNumber(c.close)), // 收盘
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算商品通道指数
 * Calculate Commodity Channel Index
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} CCI 数组 / CCI array
 */
export function CCI(candles, period = 20) { // 导出函数 CCI
  // 使用技术指标库计算 / Calculate using library
  const result = ti.CCI.calculate({ // 定义常量 result
    high: candles.map(c => toNumber(c.high)), // 最高
    low: candles.map(c => toNumber(c.low)), // 最低
    close: candles.map(c => toNumber(c.close)), // 收盘
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

// ============================================
// 趋势指标 / Trend Indicators
// ============================================

/**
 * 计算 MACD
 * Calculate MACD
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} fastPeriod - 快线周期 / Fast period
 * @param {number} slowPeriod - 慢线周期 / Slow period
 * @param {number} signalPeriod - 信号线周期 / Signal period
 * @returns {Object[]} MACD 数组 { MACD, signal, histogram } / MACD array
 */
export function MACD(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) { // 导出函数 MACD
  // 使用技术指标库计算 / Calculate using library
  const result = ti.MACD.calculate({ // 定义常量 result
    values: values.map(toNumber), // values
    fastPeriod, // 执行语句
    slowPeriod, // 执行语句
    signalPeriod, // 执行语句
    SimpleMAOscillator: false, // Simple均线Oscillator
    SimpleMASignal: false, // Simple均线信号
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算平均趋向指数
 * Calculate Average Directional Index
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {Object[]} ADX 数组 { adx, pdi, mdi } / ADX array
 */
export function ADX(candles, period = 14) { // 导出函数 ADX
  // 使用技术指标库计算 / Calculate using library
  const result = ti.ADX.calculate({ // 定义常量 result
    high: candles.map(c => toNumber(c.high)), // 最高
    low: candles.map(c => toNumber(c.low)), // 最低
    close: candles.map(c => toNumber(c.close)), // 收盘
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算抛物线转向指标
 * Calculate Parabolic SAR
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} step - 步长 / Step
 * @param {number} max - 最大值 / Maximum
 * @returns {number[]} SAR 数组 / SAR array
 */
export function PSAR(candles, step = 0.02, max = 0.2) { // 导出函数 PSAR
  // 使用技术指标库计算 / Calculate using library
  const result = ti.PSAR.calculate({ // 定义常量 result
    high: candles.map(c => toNumber(c.high)), // 最高
    low: candles.map(c => toNumber(c.low)), // 最低
    step, // 执行语句
    max, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

// ============================================
// 波动率指标 / Volatility Indicators
// ============================================

/**
 * 计算布林带
 * Calculate Bollinger Bands
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @param {number} stdDev - 标准差倍数 / Standard deviation multiplier
 * @returns {Object[]} 布林带数组 { upper, middle, lower, pb } / Bollinger Bands array
 */
export function BollingerBands(values, period = 20, stdDev = 2) { // 导出函数 BollingerBands
  // 使用技术指标库计算 / Calculate using library
  const result = ti.BollingerBands.calculate({ // 定义常量 result
    values: values.map(toNumber), // values
    period, // 执行语句
    stdDev, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算平均真实波幅
 * Calculate Average True Range
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} ATR 数组 / ATR array
 */
export function ATR(candles, period = 14) { // 导出函数 ATR
  // 使用技术指标库计算 / Calculate using library
  const result = ti.ATR.calculate({ // 定义常量 result
    high: candles.map(c => toNumber(c.high)), // 最高
    low: candles.map(c => toNumber(c.low)), // 最低
    close: candles.map(c => toNumber(c.close)), // 收盘
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算真实波幅
 * Calculate True Range
 * @param {Object[]} candles - K线数据 / Candle data
 * @returns {number[]} TR 数组 / TR array
 */
export function TrueRange(candles) { // 导出函数 TrueRange
  // 使用技术指标库计算 / Calculate using library
  const result = ti.TrueRange.calculate({ // 定义常量 result
    high: candles.map(c => toNumber(c.high)), // 最高
    low: candles.map(c => toNumber(c.low)), // 最低
    close: candles.map(c => toNumber(c.close)), // 收盘
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算肯特纳通道
 * Calculate Keltner Channels
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @param {number} multiplier - ATR 倍数 / ATR multiplier
 * @returns {Object[]} 肯特纳通道数组 { upper, middle, lower } / Keltner Channels array
 */
export function KeltnerChannels(candles, period = 20, multiplier = 2) { // 导出函数 KeltnerChannels
  // 计算 EMA / Calculate EMA
  const closes = candles.map(c => toNumber(c.close)); // 定义函数 closes
  const emaValues = EMA(closes, period); // 定义常量 emaValues

  // 计算 ATR / Calculate ATR
  const atrValues = ATR(candles, period); // 定义常量 atrValues

  // 计算通道 / Calculate channels
  const result = []; // 定义常量 result
  const offset = closes.length - emaValues.length; // 定义常量 offset

  for (let i = 0; i < emaValues.length; i++) { // 循环 let i = 0; i < emaValues.length; i++
    const atrIndex = i - (emaValues.length - atrValues.length); // 定义常量 atrIndex
    if (atrIndex >= 0) { // 条件判断 atrIndex >= 0
      result.push({ // 调用 result.push
        upper: emaValues[i] + multiplier * atrValues[atrIndex], // 上限
        middle: emaValues[i], // middle
        lower: emaValues[i] - multiplier * atrValues[atrIndex], // 下限
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  return result; // 返回结果
} // 结束代码块

// ============================================
// 成交量指标 / Volume Indicators
// ============================================

/**
 * 计算能量潮指标
 * Calculate On-Balance Volume
 * @param {Object[]} candles - K线数据 / Candle data
 * @returns {number[]} OBV 数组 / OBV array
 */
export function OBV(candles) { // 导出函数 OBV
  // 使用技术指标库计算 / Calculate using library
  const result = ti.OBV.calculate({ // 定义常量 result
    close: candles.map(c => toNumber(c.close)), // 收盘
    volume: candles.map(c => toNumber(c.volume)), // 成交量
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算资金流量指数
 * Calculate Money Flow Index
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} MFI 数组 / MFI array
 */
export function MFI(candles, period = 14) { // 导出函数 MFI
  // 使用技术指标库计算 / Calculate using library
  const result = ti.MFI.calculate({ // 定义常量 result
    high: candles.map(c => toNumber(c.high)), // 最高
    low: candles.map(c => toNumber(c.low)), // 最低
    close: candles.map(c => toNumber(c.close)), // 收盘
    volume: candles.map(c => toNumber(c.volume)), // 成交量
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算成交量变化率
 * Calculate Volume Rate of Change
 * @param {number[]} volumes - 成交量数据 / Volume data
 * @param {number} period - 周期 / Period
 * @returns {number[]} VROC 数组 / VROC array
 */
export function VROC(volumes, period = 14) { // 导出函数 VROC
  // 使用技术指标库计算 / Calculate using library
  const result = ti.ROC.calculate({ // 定义常量 result
    values: volumes.map(toNumber), // values
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

// ============================================
// 动量指标 / Momentum Indicators
// ============================================

/**
 * 计算动量
 * Calculate Momentum
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @returns {number[]} 动量数组 / Momentum array
 */
export function Momentum(values, period = 10) { // 导出函数 Momentum
  // 手动计算动量 / Calculate momentum manually
  const result = []; // 定义常量 result
  const numericValues = values.map(toNumber); // 定义常量 numericValues

  for (let i = period; i < numericValues.length; i++) { // 循环 let i = period; i < numericValues.length; i++
    result.push(numericValues[i] - numericValues[i - period]); // 调用 result.push
  } // 结束代码块

  return result; // 返回结果
} // 结束代码块

/**
 * 计算变化率
 * Calculate Rate of Change
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @returns {number[]} ROC 数组 / ROC array
 */
export function ROC(values, period = 10) { // 导出函数 ROC
  // 使用技术指标库计算 / Calculate using library
  const result = ti.ROC.calculate({ // 定义常量 result
    values: values.map(toNumber), // values
    period, // 执行语句
  }); // 结束代码块

  return result; // 返回结果
} // 结束代码块

// ============================================
// 支撑阻力 / Support and Resistance
// ============================================

/**
 * 计算枢轴点
 * Calculate Pivot Points
 * @param {number} high - 最高价 / High price
 * @param {number} low - 最低价 / Low price
 * @param {number} close - 收盘价 / Close price
 * @returns {Object} 枢轴点对象 / Pivot points object
 */
export function PivotPoints(high, low, close) { // 导出函数 PivotPoints
  // 计算枢轴点 / Calculate pivot point
  const pp = (toNumber(high) + toNumber(low) + toNumber(close)) / 3; // 定义常量 pp

  // 计算支撑和阻力 / Calculate support and resistance
  const r1 = 2 * pp - toNumber(low); // 定义常量 r1
  const s1 = 2 * pp - toNumber(high); // 定义常量 s1
  const r2 = pp + (toNumber(high) - toNumber(low)); // 定义常量 r2
  const s2 = pp - (toNumber(high) - toNumber(low)); // 定义常量 s2
  const r3 = toNumber(high) + 2 * (pp - toNumber(low)); // 定义常量 r3
  const s3 = toNumber(low) - 2 * (toNumber(high) - pp); // 定义常量 s3

  return { // 返回结果
    pp, // 执行语句
    r1, // 执行语句
    r2, // 执行语句
    r3, // 执行语句
    s1, // 执行语句
    s2, // 执行语句
    s3, // 执行语句
  }; // 结束代码块
} // 结束代码块

/**
 * 计算斐波那契回撤
 * Calculate Fibonacci Retracement
 * @param {number} high - 最高价 / High price
 * @param {number} low - 最低价 / Low price
 * @returns {Object} 斐波那契回撤对象 / Fibonacci retracement object
 */
export function FibonacciRetracement(high, low) { // 导出函数 FibonacciRetracement
  // 计算差值 / Calculate difference
  const h = toNumber(high); // 定义常量 h
  const l = toNumber(low); // 定义常量 l
  const diff = h - l; // 定义常量 diff

  // 计算回撤水平 / Calculate retracement levels
  return { // 返回结果
    level0: l,           // level0
    level236: l + diff * 0.236,  // level236
    level382: l + diff * 0.382,  // level382
    level500: l + diff * 0.5,    // level500
    level618: l + diff * 0.618,  // level618
    level786: l + diff * 0.786,  // level786
    level1000: h,        // level1000
  }; // 结束代码块
} // 结束代码块

// ============================================
// Regime 检测指标 / Regime Detection Indicators
// ============================================

/**
 * 计算 Hurst 指数 (R/S 分析法)
 * Calculate Hurst Exponent using R/S Analysis
 *
 * Hurst 指数用于判断时间序列的特性:
 * - H > 0.5: 趋势性 (Trending) - 适合趋势跟踪策略
 * - H = 0.5: 随机游走 (Random Walk)
 * - H < 0.5: 均值回归 (Mean Reverting) - 适合震荡策略
 *
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} minPeriod - 最小分组大小 / Minimum group size
 * @returns {number} Hurst 指数 (0-1) / Hurst exponent
 */
export function HurstExponent(values, minPeriod = 10) { // 导出函数 HurstExponent
  const prices = values.map(toNumber); // 定义常量 prices

  if (prices.length < 20) return 0.5; // 条件判断 prices.length < 20

  try { // 尝试执行
    // 计算对数收益率 / Calculate log returns
    const logReturns = []; // 定义常量 logReturns
    for (let i = 1; i < prices.length; i++) { // 循环 let i = 1; i < prices.length; i++
      if (prices[i] > 0 && prices[i - 1] > 0) { // 条件判断 prices[i] > 0 && prices[i - 1] > 0
        logReturns.push(Math.log(prices[i] / prices[i - 1])); // 调用 logReturns.push
      } // 结束代码块
    } // 结束代码块

    if (logReturns.length < minPeriod) return 0.5; // 条件判断 logReturns.length < minPeriod

    // 计算不同分组大小下的 R/S / Calculate R/S for different group sizes
    const sizes = []; // 定义常量 sizes
    const rsValues = []; // 定义常量 rsValues

    for (let size = minPeriod; size <= Math.floor(logReturns.length / 2); size += 5) { // 循环 let size = minPeriod; size <= Math.floor(logR...
      const numGroups = Math.floor(logReturns.length / size); // 定义常量 numGroups
      if (numGroups < 2) continue; // 条件判断 numGroups < 2

      let rsSum = 0; // 定义变量 rsSum
      let validGroups = 0; // 定义变量 validGroups

      for (let g = 0; g < numGroups; g++) { // 循环 let g = 0; g < numGroups; g++
        const group = logReturns.slice(g * size, (g + 1) * size); // 定义常量 group
        const rs = _calculateRescaledRange(group); // 定义常量 rs
        if (rs > 0) { // 条件判断 rs > 0
          rsSum += rs; // 执行语句
          validGroups++; // 执行语句
        } // 结束代码块
      } // 结束代码块

      if (validGroups > 0) { // 条件判断 validGroups > 0
        const avgRS = rsSum / validGroups; // 定义常量 avgRS
        sizes.push(Math.log(size)); // 调用 sizes.push
        rsValues.push(Math.log(avgRS)); // 调用 rsValues.push
      } // 结束代码块
    } // 结束代码块

    if (sizes.length < 3) return 0.5; // 条件判断 sizes.length < 3

    // 线性回归计算斜率 (即 Hurst 指数) / Linear regression for slope
    const hurst = _linearRegressionSlope(sizes, rsValues); // 定义常量 hurst

    // 限制在合理范围 [0, 1] / Clamp to valid range
    return Math.max(0, Math.min(1, hurst)); // 返回结果

  } catch (e) { // 执行语句
    return 0.5; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 计算重标极差 (R/S)
 * Calculate Rescaled Range
 * @private
 */
function _calculateRescaledRange(series) { // 定义函数 _calculateRescaledRange
  const n = series.length; // 定义常量 n
  if (n < 2) return 0; // 条件判断 n < 2

  // 均值 / Mean
  const mean = series.reduce((a, b) => a + b, 0) / n; // 定义函数 mean

  // 累积偏差 / Cumulative deviation
  const cumDev = []; // 定义常量 cumDev
  let sum = 0; // 定义变量 sum
  for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
    sum += series[i] - mean; // 执行语句
    cumDev.push(sum); // 调用 cumDev.push
  } // 结束代码块

  // 极差 R / Range
  const R = Math.max(...cumDev) - Math.min(...cumDev); // 定义常量 R

  // 标准差 S / Standard deviation
  const variance = series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n; // 定义函数 variance
  const S = Math.sqrt(variance); // 定义常量 S

  if (S === 0) return 0; // 条件判断 S === 0
  return R / S; // 返回结果
} // 结束代码块

/**
 * 线性回归斜率
 * Linear regression slope
 * @private
 */
function _linearRegressionSlope(x, y) { // 定义函数 _linearRegressionSlope
  const n = x.length; // 定义常量 n
  const sumX = x.reduce((a, b) => a + b, 0); // 定义函数 sumX
  const sumY = y.reduce((a, b) => a + b, 0); // 定义函数 sumY
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0); // 定义函数 sumXY
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0); // 定义函数 sumX2

  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX); // 返回结果
} // 结束代码块

/**
 * 计算布林带宽度
 * Calculate Bollinger Band Width
 *
 * 用于衡量波动率，宽度 = (上轨 - 下轨) / 中轨
 * - 宽度缩小: 波动率降低，可能酝酿突破
 * - 宽度扩大: 波动率增加，趋势可能正在进行
 *
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @param {number} stdDev - 标准差倍数 / Standard deviation multiplier
 * @returns {number[]} 布林带宽度数组 / Bollinger Band Width array
 */
export function BollingerBandWidth(values, period = 20, stdDev = 2) { // 导出函数 BollingerBandWidth
  const bbValues = BollingerBands(values, period, stdDev); // 定义常量 bbValues

  return bbValues.map(bb => { // 返回结果
    if (!bb || !bb.middle || bb.middle === 0) return 0; // 条件判断 !bb || !bb.middle || bb.middle === 0
    return ((bb.upper - bb.lower) / bb.middle) * 100; // 返回结果
  }); // 结束代码块
} // 结束代码块

/**
 * 计算波动率百分位
 * Calculate Volatility Percentile
 *
 * 计算当前波动率在历史中的百分位排名
 *
 * @param {number} currentValue - 当前值 / Current value
 * @param {number[]} history - 历史数据 / Historical data
 * @returns {number} 百分位 (0-100) / Percentile
 */
export function VolatilityPercentile(currentValue, history) { // 导出函数 VolatilityPercentile
  if (!history || history.length < 10) return 50; // 条件判断 !history || history.length < 10

  const sorted = [...history].sort((a, b) => a - b); // 定义函数 sorted
  let rank = 0; // 定义变量 rank

  for (let i = 0; i < sorted.length; i++) { // 循环 let i = 0; i < sorted.length; i++
    if (sorted[i] <= currentValue) rank++; // 条件判断 sorted[i] <= currentValue
  } // 结束代码块

  return (rank / sorted.length) * 100; // 返回结果
} // 结束代码块

// ============================================
// 辅助函数 / Helper Functions
// ============================================

/**
 * 获取指标最新值
 * Get latest indicator value
 * @param {Array} indicatorValues - 指标数组 / Indicator array
 * @returns {any} 最新值 / Latest value
 */
export function getLatest(indicatorValues) { // 导出函数 getLatest
  // 检查数组是否有效 / Check if array is valid
  if (!indicatorValues || indicatorValues.length === 0) { // 条件判断 !indicatorValues || indicatorValues.length === 0
    return null; // 返回结果
  } // 结束代码块

  return indicatorValues[indicatorValues.length - 1]; // 返回结果
} // 结束代码块

/**
 * 检测交叉信号
 * Detect crossover signal
 * @param {number[]} fast - 快线数据 / Fast line data
 * @param {number[]} slow - 慢线数据 / Slow line data
 * @returns {Object} 交叉信号 { bullish, bearish } / Crossover signal
 */
export function detectCrossover(fast, slow) { // 导出函数 detectCrossover
  // 至少需要 2 个数据点 / Need at least 2 data points
  if (fast.length < 2 || slow.length < 2) { // 条件判断 fast.length < 2 || slow.length < 2
    return { bullish: false, bearish: false }; // 返回结果
  } // 结束代码块

  // 获取最后两个值 / Get last two values
  const fastCurrent = fast[fast.length - 1]; // 定义常量 fastCurrent
  const fastPrevious = fast[fast.length - 2]; // 定义常量 fastPrevious
  const slowCurrent = slow[slow.length - 1]; // 定义常量 slowCurrent
  const slowPrevious = slow[slow.length - 2]; // 定义常量 slowPrevious

  // 检测金叉 (快线从下方穿越慢线) / Detect bullish crossover
  const bullish = fastPrevious <= slowPrevious && fastCurrent > slowCurrent; // 定义常量 bullish

  // 检测死叉 (快线从上方穿越慢线) / Detect bearish crossover
  const bearish = fastPrevious >= slowPrevious && fastCurrent < slowCurrent; // 定义常量 bearish

  return { bullish, bearish }; // 返回结果
} // 结束代码块

// 默认导出所有指标 / Default export all indicators
export default { // 默认导出
  // 移动平均线 / Moving averages
  SMA, // 执行语句
  EMA, // 执行语句
  WMA, // 执行语句
  VWMA, // 执行语句

  // 震荡指标 / Oscillators
  RSI, // 执行语句
  Stochastic, // 执行语句
  WilliamsR, // 执行语句
  CCI, // 执行语句

  // 趋势指标 / Trend indicators
  MACD, // 执行语句
  ADX, // 执行语句
  PSAR, // 执行语句

  // 波动率指标 / Volatility indicators
  BollingerBands, // 执行语句
  ATR, // 执行语句
  TrueRange, // 执行语句
  KeltnerChannels, // 执行语句

  // 成交量指标 / Volume indicators
  OBV, // 执行语句
  MFI, // 执行语句
  VROC, // 执行语句

  // 动量指标 / Momentum indicators
  Momentum, // 执行语句
  ROC, // 执行语句

  // 支撑阻力 / Support and resistance
  PivotPoints, // 执行语句
  FibonacciRetracement, // 执行语句

  // Regime 检测指标 / Regime detection indicators
  HurstExponent, // 执行语句
  BollingerBandWidth, // 执行语句
  VolatilityPercentile, // 执行语句

  // 辅助函数 / Helper functions
  getLatest, // 执行语句
  detectCrossover, // 执行语句
}; // 结束代码块
