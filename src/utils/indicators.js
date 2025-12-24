/**
 * 技术指标计算工具
 * Technical Indicators Utility
 *
 * 提供常用技术指标的计算函数
 * Provides calculation functions for common technical indicators
 */

// 导入技术指标库 / Import technical indicators library
import * as ti from 'technicalindicators';

// 导入辅助函数 / Import helper functions
import { toNumber, average, standardDeviation } from './helpers.js';

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
export function SMA(values, period) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.SMA.calculate({
    values: values.map(toNumber),
    period,
  });

  return result;
}

/**
 * 计算指数移动平均线
 * Calculate Exponential Moving Average
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @returns {number[]} EMA 值数组 / EMA values array
 */
export function EMA(values, period) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.EMA.calculate({
    values: values.map(toNumber),
    period,
  });

  return result;
}

/**
 * 计算加权移动平均线
 * Calculate Weighted Moving Average
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @returns {number[]} WMA 值数组 / WMA values array
 */
export function WMA(values, period) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.WMA.calculate({
    values: values.map(toNumber),
    period,
  });

  return result;
}

/**
 * 计算成交量加权移动平均线
 * Calculate Volume Weighted Moving Average
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} VWMA 值数组 / VWMA values array
 */
export function VWMA(candles, period) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.VWMA.calculate({
    close: candles.map(c => toNumber(c.close)),
    volume: candles.map(c => toNumber(c.volume)),
    period,
  });

  return result;
}

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
export function RSI(values, period = 14) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.RSI.calculate({
    values: values.map(toNumber),
    period,
  });

  return result;
}

/**
 * 计算随机指标
 * Calculate Stochastic Oscillator
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - K 周期 / K period
 * @param {number} signalPeriod - D 周期 / D period
 * @returns {Object[]} 随机指标数组 { k, d } / Stochastic array
 */
export function Stochastic(candles, period = 14, signalPeriod = 3) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.Stochastic.calculate({
    high: candles.map(c => toNumber(c.high)),
    low: candles.map(c => toNumber(c.low)),
    close: candles.map(c => toNumber(c.close)),
    period,
    signalPeriod,
  });

  return result;
}

/**
 * 计算威廉指标
 * Calculate Williams %R
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} 威廉指标数组 / Williams %R array
 */
export function WilliamsR(candles, period = 14) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.WilliamsR.calculate({
    high: candles.map(c => toNumber(c.high)),
    low: candles.map(c => toNumber(c.low)),
    close: candles.map(c => toNumber(c.close)),
    period,
  });

  return result;
}

/**
 * 计算商品通道指数
 * Calculate Commodity Channel Index
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} CCI 数组 / CCI array
 */
export function CCI(candles, period = 20) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.CCI.calculate({
    high: candles.map(c => toNumber(c.high)),
    low: candles.map(c => toNumber(c.low)),
    close: candles.map(c => toNumber(c.close)),
    period,
  });

  return result;
}

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
export function MACD(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.MACD.calculate({
    values: values.map(toNumber),
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  return result;
}

/**
 * 计算平均趋向指数
 * Calculate Average Directional Index
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {Object[]} ADX 数组 { adx, pdi, mdi } / ADX array
 */
export function ADX(candles, period = 14) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.ADX.calculate({
    high: candles.map(c => toNumber(c.high)),
    low: candles.map(c => toNumber(c.low)),
    close: candles.map(c => toNumber(c.close)),
    period,
  });

  return result;
}

/**
 * 计算抛物线转向指标
 * Calculate Parabolic SAR
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} step - 步长 / Step
 * @param {number} max - 最大值 / Maximum
 * @returns {number[]} SAR 数组 / SAR array
 */
export function PSAR(candles, step = 0.02, max = 0.2) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.PSAR.calculate({
    high: candles.map(c => toNumber(c.high)),
    low: candles.map(c => toNumber(c.low)),
    step,
    max,
  });

  return result;
}

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
export function BollingerBands(values, period = 20, stdDev = 2) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.BollingerBands.calculate({
    values: values.map(toNumber),
    period,
    stdDev,
  });

  return result;
}

/**
 * 计算平均真实波幅
 * Calculate Average True Range
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} ATR 数组 / ATR array
 */
export function ATR(candles, period = 14) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.ATR.calculate({
    high: candles.map(c => toNumber(c.high)),
    low: candles.map(c => toNumber(c.low)),
    close: candles.map(c => toNumber(c.close)),
    period,
  });

  return result;
}

/**
 * 计算真实波幅
 * Calculate True Range
 * @param {Object[]} candles - K线数据 / Candle data
 * @returns {number[]} TR 数组 / TR array
 */
export function TrueRange(candles) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.TrueRange.calculate({
    high: candles.map(c => toNumber(c.high)),
    low: candles.map(c => toNumber(c.low)),
    close: candles.map(c => toNumber(c.close)),
  });

  return result;
}

/**
 * 计算肯特纳通道
 * Calculate Keltner Channels
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @param {number} multiplier - ATR 倍数 / ATR multiplier
 * @returns {Object[]} 肯特纳通道数组 { upper, middle, lower } / Keltner Channels array
 */
export function KeltnerChannels(candles, period = 20, multiplier = 2) {
  // 计算 EMA / Calculate EMA
  const closes = candles.map(c => toNumber(c.close));
  const emaValues = EMA(closes, period);

  // 计算 ATR / Calculate ATR
  const atrValues = ATR(candles, period);

  // 计算通道 / Calculate channels
  const result = [];
  const offset = closes.length - emaValues.length;

  for (let i = 0; i < emaValues.length; i++) {
    const atrIndex = i - (emaValues.length - atrValues.length);
    if (atrIndex >= 0) {
      result.push({
        upper: emaValues[i] + multiplier * atrValues[atrIndex],
        middle: emaValues[i],
        lower: emaValues[i] - multiplier * atrValues[atrIndex],
      });
    }
  }

  return result;
}

// ============================================
// 成交量指标 / Volume Indicators
// ============================================

/**
 * 计算能量潮指标
 * Calculate On-Balance Volume
 * @param {Object[]} candles - K线数据 / Candle data
 * @returns {number[]} OBV 数组 / OBV array
 */
export function OBV(candles) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.OBV.calculate({
    close: candles.map(c => toNumber(c.close)),
    volume: candles.map(c => toNumber(c.volume)),
  });

  return result;
}

/**
 * 计算资金流量指数
 * Calculate Money Flow Index
 * @param {Object[]} candles - K线数据 / Candle data
 * @param {number} period - 周期 / Period
 * @returns {number[]} MFI 数组 / MFI array
 */
export function MFI(candles, period = 14) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.MFI.calculate({
    high: candles.map(c => toNumber(c.high)),
    low: candles.map(c => toNumber(c.low)),
    close: candles.map(c => toNumber(c.close)),
    volume: candles.map(c => toNumber(c.volume)),
    period,
  });

  return result;
}

/**
 * 计算成交量变化率
 * Calculate Volume Rate of Change
 * @param {number[]} volumes - 成交量数据 / Volume data
 * @param {number} period - 周期 / Period
 * @returns {number[]} VROC 数组 / VROC array
 */
export function VROC(volumes, period = 14) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.ROC.calculate({
    values: volumes.map(toNumber),
    period,
  });

  return result;
}

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
export function Momentum(values, period = 10) {
  // 手动计算动量 / Calculate momentum manually
  const result = [];
  const numericValues = values.map(toNumber);

  for (let i = period; i < numericValues.length; i++) {
    result.push(numericValues[i] - numericValues[i - period]);
  }

  return result;
}

/**
 * 计算变化率
 * Calculate Rate of Change
 * @param {number[]} values - 价格数据 / Price data
 * @param {number} period - 周期 / Period
 * @returns {number[]} ROC 数组 / ROC array
 */
export function ROC(values, period = 10) {
  // 使用技术指标库计算 / Calculate using library
  const result = ti.ROC.calculate({
    values: values.map(toNumber),
    period,
  });

  return result;
}

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
export function PivotPoints(high, low, close) {
  // 计算枢轴点 / Calculate pivot point
  const pp = (toNumber(high) + toNumber(low) + toNumber(close)) / 3;

  // 计算支撑和阻力 / Calculate support and resistance
  const r1 = 2 * pp - toNumber(low);
  const s1 = 2 * pp - toNumber(high);
  const r2 = pp + (toNumber(high) - toNumber(low));
  const s2 = pp - (toNumber(high) - toNumber(low));
  const r3 = toNumber(high) + 2 * (pp - toNumber(low));
  const s3 = toNumber(low) - 2 * (toNumber(high) - pp);

  return {
    pp,
    r1,
    r2,
    r3,
    s1,
    s2,
    s3,
  };
}

/**
 * 计算斐波那契回撤
 * Calculate Fibonacci Retracement
 * @param {number} high - 最高价 / High price
 * @param {number} low - 最低价 / Low price
 * @returns {Object} 斐波那契回撤对象 / Fibonacci retracement object
 */
export function FibonacciRetracement(high, low) {
  // 计算差值 / Calculate difference
  const h = toNumber(high);
  const l = toNumber(low);
  const diff = h - l;

  // 计算回撤水平 / Calculate retracement levels
  return {
    level0: l,           // 0%
    level236: l + diff * 0.236,  // 23.6%
    level382: l + diff * 0.382,  // 38.2%
    level500: l + diff * 0.5,    // 50%
    level618: l + diff * 0.618,  // 61.8%
    level786: l + diff * 0.786,  // 78.6%
    level1000: h,        // 100%
  };
}

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
export function HurstExponent(values, minPeriod = 10) {
  const prices = values.map(toNumber);

  if (prices.length < 20) return 0.5;

  try {
    // 计算对数收益率 / Calculate log returns
    const logReturns = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > 0 && prices[i - 1] > 0) {
        logReturns.push(Math.log(prices[i] / prices[i - 1]));
      }
    }

    if (logReturns.length < minPeriod) return 0.5;

    // 计算不同分组大小下的 R/S / Calculate R/S for different group sizes
    const sizes = [];
    const rsValues = [];

    for (let size = minPeriod; size <= Math.floor(logReturns.length / 2); size += 5) {
      const numGroups = Math.floor(logReturns.length / size);
      if (numGroups < 2) continue;

      let rsSum = 0;
      let validGroups = 0;

      for (let g = 0; g < numGroups; g++) {
        const group = logReturns.slice(g * size, (g + 1) * size);
        const rs = _calculateRescaledRange(group);
        if (rs > 0) {
          rsSum += rs;
          validGroups++;
        }
      }

      if (validGroups > 0) {
        const avgRS = rsSum / validGroups;
        sizes.push(Math.log(size));
        rsValues.push(Math.log(avgRS));
      }
    }

    if (sizes.length < 3) return 0.5;

    // 线性回归计算斜率 (即 Hurst 指数) / Linear regression for slope
    const hurst = _linearRegressionSlope(sizes, rsValues);

    // 限制在合理范围 [0, 1] / Clamp to valid range
    return Math.max(0, Math.min(1, hurst));

  } catch (e) {
    return 0.5;
  }
}

/**
 * 计算重标极差 (R/S)
 * Calculate Rescaled Range
 * @private
 */
function _calculateRescaledRange(series) {
  const n = series.length;
  if (n < 2) return 0;

  // 均值 / Mean
  const mean = series.reduce((a, b) => a + b, 0) / n;

  // 累积偏差 / Cumulative deviation
  const cumDev = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += series[i] - mean;
    cumDev.push(sum);
  }

  // 极差 R / Range
  const R = Math.max(...cumDev) - Math.min(...cumDev);

  // 标准差 S / Standard deviation
  const variance = series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
  const S = Math.sqrt(variance);

  if (S === 0) return 0;
  return R / S;
}

/**
 * 线性回归斜率
 * Linear regression slope
 * @private
 */
function _linearRegressionSlope(x, y) {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}

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
export function BollingerBandWidth(values, period = 20, stdDev = 2) {
  const bbValues = BollingerBands(values, period, stdDev);

  return bbValues.map(bb => {
    if (!bb || !bb.middle || bb.middle === 0) return 0;
    return ((bb.upper - bb.lower) / bb.middle) * 100;
  });
}

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
export function VolatilityPercentile(currentValue, history) {
  if (!history || history.length < 10) return 50;

  const sorted = [...history].sort((a, b) => a - b);
  let rank = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] <= currentValue) rank++;
  }

  return (rank / sorted.length) * 100;
}

// ============================================
// 辅助函数 / Helper Functions
// ============================================

/**
 * 获取指标最新值
 * Get latest indicator value
 * @param {Array} indicatorValues - 指标数组 / Indicator array
 * @returns {any} 最新值 / Latest value
 */
export function getLatest(indicatorValues) {
  // 检查数组是否有效 / Check if array is valid
  if (!indicatorValues || indicatorValues.length === 0) {
    return null;
  }

  return indicatorValues[indicatorValues.length - 1];
}

/**
 * 检测交叉信号
 * Detect crossover signal
 * @param {number[]} fast - 快线数据 / Fast line data
 * @param {number[]} slow - 慢线数据 / Slow line data
 * @returns {Object} 交叉信号 { bullish, bearish } / Crossover signal
 */
export function detectCrossover(fast, slow) {
  // 至少需要 2 个数据点 / Need at least 2 data points
  if (fast.length < 2 || slow.length < 2) {
    return { bullish: false, bearish: false };
  }

  // 获取最后两个值 / Get last two values
  const fastCurrent = fast[fast.length - 1];
  const fastPrevious = fast[fast.length - 2];
  const slowCurrent = slow[slow.length - 1];
  const slowPrevious = slow[slow.length - 2];

  // 检测金叉 (快线从下方穿越慢线) / Detect bullish crossover
  const bullish = fastPrevious <= slowPrevious && fastCurrent > slowCurrent;

  // 检测死叉 (快线从上方穿越慢线) / Detect bearish crossover
  const bearish = fastPrevious >= slowPrevious && fastCurrent < slowCurrent;

  return { bullish, bearish };
}

// 默认导出所有指标 / Default export all indicators
export default {
  // 移动平均线 / Moving averages
  SMA,
  EMA,
  WMA,
  VWMA,

  // 震荡指标 / Oscillators
  RSI,
  Stochastic,
  WilliamsR,
  CCI,

  // 趋势指标 / Trend indicators
  MACD,
  ADX,
  PSAR,

  // 波动率指标 / Volatility indicators
  BollingerBands,
  ATR,
  TrueRange,
  KeltnerChannels,

  // 成交量指标 / Volume indicators
  OBV,
  MFI,
  VROC,

  // 动量指标 / Momentum indicators
  Momentum,
  ROC,

  // 支撑阻力 / Support and resistance
  PivotPoints,
  FibonacciRetracement,

  // Regime 检测指标 / Regime detection indicators
  HurstExponent,
  BollingerBandWidth,
  VolatilityPercentile,

  // 辅助函数 / Helper functions
  getLatest,
  detectCrossover,
};
