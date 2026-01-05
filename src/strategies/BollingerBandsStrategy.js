/**
 * 布林带策略
 * Bollinger Bands Strategy
 *
 * 基于布林带的均值回归策略
 * Mean reversion strategy based on Bollinger Bands
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js';

/**
 * 布林带策略类
 * Bollinger Bands Strategy Class
 */
export class BollingerBandsStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 调用父类构造函数 / Call parent constructor
    super({
      name: 'BollingerBandsStrategy',
      ...params,
    });

    // 布林带周期 / Bollinger Bands period
    this.period = params.period || 20;

    // 标准差倍数 / Standard deviation multiplier
    this.stdDev = params.stdDev || 2;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95;

    // 是否使用趋势过滤 / Whether to use trend filter
    this.useTrendFilter = params.useTrendFilter !== false;

    // 趋势过滤均线周期 / Trend filter MA period
    this.trendPeriod = params.trendPeriod || 50;
  }

  /**
   * 初始化
   * Initialization
   */
  async onInit() {
    await super.onInit();

    this.log(`参数: 周期=${this.period}, 标准差=${this.stdDev}, 趋势过滤=${this.useTrendFilter}`);
    this.log(`Params: period=${this.period}, stdDev=${this.stdDev}, trendFilter=${this.useTrendFilter}`);
  }

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    // 确保有足够的数据 / Ensure enough data
    const requiredLength = this.useTrendFilter ? Math.max(this.period, this.trendPeriod) : this.period;
    if (history.length < requiredLength) {
      return;  // 数据不足，跳过 / Not enough data, skip
    }

    // 提取收盘价数组 / Extract close prices array
    const closes = history.map(h => h.close);

    // 计算布林带 / Calculate Bollinger Bands
    const bb = this._calculateBollingerBands(closes);

    // 保存指标值 / Save indicator values
    this.setIndicator('upperBand', bb.upper);
    this.setIndicator('middleBand', bb.middle);
    this.setIndicator('lowerBand', bb.lower);
    this.setIndicator('bandwidth', bb.bandwidth);

    // 趋势过滤 / Trend filter
    // 改进：使用中轨与趋势均线比较，而非价格与趋势均线比较
    // Improved: Compare middle band with trend MA instead of price with trend MA
    let trendFilter = true;
    if (this.useTrendFilter) {
      const trendMA = this._calculateSMA(closes, this.trendPeriod);
      this.setIndicator('trendMA', trendMA);
      // 只在中轨在趋势均线附近或上方时做多（允许 2% 容差）
      // Only long when middle band is near or above trend MA (2% tolerance)
      trendFilter = bb.middle >= trendMA * 0.98;
    }

    // 获取当前持仓 / Get current position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 计算价格相对位置 / Calculate price relative position
    const percentB = (candle.close - bb.lower) / (bb.upper - bb.lower);
    this.setIndicator('percentB', percentB);

    // 交易逻辑 / Trading logic
    // 改进：使用 percentB 阈值而非精确触及上下轨
    // Improved: Use percentB threshold instead of exact band touch
    const buyThreshold = 0.15;  // 价格在下轨附近 15% 区域 / Price in 15% zone near lower band
    const sellThreshold = 0.85; // 价格在上轨附近 15% 区域 / Price in 15% zone near upper band

    if (percentB <= buyThreshold && !hasPosition && trendFilter) {
      // 价格接近下轨，买入 / Price near lower band, buy
      this.log(`价格触及下轨 / Price touched lower band @ ${candle.close}, Lower: ${bb.lower.toFixed(2)}, %B: ${(percentB * 100).toFixed(1)}%`);
      this.setBuySignal('Price at lower band');
      this.buyPercent(this.symbol, this.positionPercent);
    } else if (percentB >= sellThreshold && hasPosition) {
      // 价格接近上轨，卖出 / Price near upper band, sell
      this.log(`价格触及上轨 / Price touched upper band @ ${candle.close}, Upper: ${bb.upper.toFixed(2)}, %B: ${(percentB * 100).toFixed(1)}%`);
      this.setSellSignal('Price at upper band');
      this.closePosition(this.symbol);
    } else if (candle.close >= bb.middle && hasPosition && percentB > 0.5) {
      // 价格回到中轨以上，可选择部分止盈 / Price back to middle band, optional partial profit taking
      // 这里简单处理，不做部分止盈 / Simple handling, no partial profit taking
    }
  }

  /**
   * 计算布林带
   * Calculate Bollinger Bands
   * @private
   */
  _calculateBollingerBands(closes) {
    // 获取最近 period 个数据 / Get last period data points
    const values = closes.slice(-this.period);

    // 计算中轨 (SMA) / Calculate middle band (SMA)
    const middle = values.reduce((sum, val) => sum + val, 0) / this.period;

    // 计算标准差 / Calculate standard deviation
    const squaredDiffs = values.map(val => Math.pow(val - middle, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / this.period;
    const std = Math.sqrt(variance);

    // 计算上下轨 / Calculate upper and lower bands
    const upper = middle + this.stdDev * std;
    const lower = middle - this.stdDev * std;

    // 计算带宽 / Calculate bandwidth
    const bandwidth = ((upper - lower) / middle) * 100;

    return {
      upper,      // 上轨 / Upper band
      middle,     // 中轨 / Middle band
      lower,      // 下轨 / Lower band
      std,        // 标准差 / Standard deviation
      bandwidth,  // 带宽百分比 / Bandwidth percentage
    };
  }

  /**
   * 计算 SMA
   * Calculate SMA
   * @private
   */
  _calculateSMA(data, period) {
    const values = data.slice(-period);
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / period;
  }
}

// 导出默认类 / Export default class
export default BollingerBandsStrategy;
