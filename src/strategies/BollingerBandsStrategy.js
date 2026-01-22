/**
 * 布林带策略
 * Bollinger Bands Strategy
 *
 * 基于布林带的均值回归策略
 * Mean reversion strategy based on Bollinger Bands
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js

/**
 * 布林带策略类
 * Bollinger Bands Strategy Class
 */
export class BollingerBandsStrategy extends BaseStrategy { // 导出类 BollingerBandsStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super({ // 调用父类
      name: 'BollingerBandsStrategy', // 设置 name 字段
      ...params, // 展开对象或数组
    }); // 结束代码块

    // 布林带周期 / Bollinger Bands period
    this.period = params.period || 20; // 设置 period

    // 标准差倍数 / Standard deviation multiplier
    this.stdDev = params.stdDev || 2; // 设置 stdDev

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95; // 设置 positionPercent

    // 是否使用趋势过滤 / Whether to use trend filter
    this.useTrendFilter = params.useTrendFilter !== false; // 设置 useTrendFilter

    // 趋势过滤均线周期 / Trend filter MA period
    this.trendPeriod = params.trendPeriod || 50; // 设置 trendPeriod
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 布林带策略只需要 K 线数据 / Bollinger Bands strategy only needs kline
    return ['kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化
   * Initialization
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    this.log(`参数: 周期=${this.period}, 标准差=${this.stdDev}, 趋势过滤=${this.useTrendFilter}`); // 调用 log
    this.log(`Params: period=${this.period}, stdDev=${this.stdDev}, trendFilter=${this.useTrendFilter}`); // 调用 log
  } // 结束代码块

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) { // 执行语句
    // 确保有足够的数据 / Ensure enough data
    const requiredLength = this.useTrendFilter ? Math.max(this.period, this.trendPeriod) : this.period; // 定义常量 requiredLength
    if (history.length < requiredLength) { // 条件判断 history.length < requiredLength
      return;  // 数据不足，跳过 / Not enough data, skip
    } // 结束代码块

    // 提取收盘价数组 / Extract close prices array
    const closes = history.map(h => h.close); // 定义函数 closes

    // 计算布林带 / Calculate Bollinger Bands
    const bb = this._calculateBollingerBands(closes); // 定义常量 bb

    // 保存指标值 / Save indicator values
    this.setIndicator('upperBand', bb.upper); // 调用 setIndicator
    this.setIndicator('middleBand', bb.middle); // 调用 setIndicator
    this.setIndicator('lowerBand', bb.lower); // 调用 setIndicator
    this.setIndicator('bandwidth', bb.bandwidth); // 调用 setIndicator

    // 趋势过滤 / Trend filter
    // 改进：使用中轨与趋势均线比较，而非价格与趋势均线比较
    // Improved: Compare middle band with trend MA instead of price with trend MA
    let trendFilter = true; // 定义变量 trendFilter
    if (this.useTrendFilter) { // 条件判断 this.useTrendFilter
      const trendMA = this._calculateSMA(closes, this.trendPeriod); // 定义常量 trendMA
      this.setIndicator('trendMA', trendMA); // 调用 setIndicator
      // 只在中轨在趋势均线附近或上方时做多（允许 2% 容差）
      // Only long when middle band is near or above trend MA (2% tolerance)
      trendFilter = bb.middle >= trendMA * 0.98; // 赋值 trendFilter
    } // 结束代码块

    // 获取当前持仓 / Get current position
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    // 计算价格相对位置 / Calculate price relative position
    const percentB = (candle.close - bb.lower) / (bb.upper - bb.lower); // 定义常量 percentB
    this.setIndicator('percentB', percentB); // 调用 setIndicator

    // 交易逻辑 / Trading logic
    // 改进：使用 percentB 阈值而非精确触及上下轨
    // Improved: Use percentB threshold instead of exact band touch
    const buyThreshold = 0.15;  // 价格在下轨附近 15% 区域 / Price in 15% zone near lower band
    const sellThreshold = 0.85; // 价格在上轨附近 15% 区域 / Price in 15% zone near upper band

    if (percentB <= buyThreshold && !hasPosition && trendFilter) { // 条件判断 percentB <= buyThreshold && !hasPosition && t...
      // 价格接近下轨，买入 / Price near lower band, buy
      this.log(`价格触及下轨 / Price touched lower band @ ${candle.close}, Lower: ${bb.lower.toFixed(2)}, %B: ${(percentB * 100).toFixed(1)}%`); // 调用 log
      this.setBuySignal('Price at lower band'); // 调用 setBuySignal
      this.buyPercent(this.symbol, this.positionPercent); // 调用 buyPercent
    } else if (percentB >= sellThreshold && hasPosition) { // 执行语句
      // 价格接近上轨，卖出 / Price near upper band, sell
      this.log(`价格触及上轨 / Price touched upper band @ ${candle.close}, Upper: ${bb.upper.toFixed(2)}, %B: ${(percentB * 100).toFixed(1)}%`); // 调用 log
      this.setSellSignal('Price at upper band'); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
    } else if (candle.close >= bb.middle && hasPosition && percentB > 0.5) { // 执行语句
      // 价格回到中轨以上，可选择部分止盈 / Price back to middle band, optional partial profit taking
      // 这里简单处理，不做部分止盈 / Simple handling, no partial profit taking
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算布林带
   * Calculate Bollinger Bands
   * @private
   */
  _calculateBollingerBands(closes) { // 调用 _calculateBollingerBands
    // 获取最近 period 个数据 / Get last period data points
    const values = closes.slice(-this.period); // 定义常量 values

    // 计算中轨 (SMA) / Calculate middle band (SMA)
    const middle = values.reduce((sum, val) => sum + val, 0) / this.period; // 定义函数 middle

    // 计算标准差 / Calculate standard deviation
    const squaredDiffs = values.map(val => Math.pow(val - middle, 2)); // 定义函数 squaredDiffs
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / this.period; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std

    // 计算上下轨 / Calculate upper and lower bands
    const upper = middle + this.stdDev * std; // 定义常量 upper
    const lower = middle - this.stdDev * std; // 定义常量 lower

    // 计算带宽 / Calculate bandwidth
    const bandwidth = ((upper - lower) / middle) * 100; // 定义常量 bandwidth

    return { // 返回结果
      upper,      // 上轨 / Upper band
      middle,     // 中轨 / Middle band
      lower,      // 下轨 / Lower band
      std,        // 标准差 / Standard deviation
      bandwidth,  // 带宽百分比 / Bandwidth percentage
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算 SMA
   * Calculate SMA
   * @private
   */
  _calculateSMA(data, period) { // 调用 _calculateSMA
    const values = data.slice(-period); // 定义常量 values
    const sum = values.reduce((acc, val) => acc + val, 0); // 定义函数 sum
    return sum / period; // 返回结果
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default BollingerBandsStrategy; // 默认导出
