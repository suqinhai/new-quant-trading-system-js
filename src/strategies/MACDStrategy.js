/**
 * MACD 策略
 * MACD Strategy
 *
 * 基于 MACD 指标的趋势跟踪策略
 * Trend following strategy based on MACD indicator
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js';

/**
 * MACD 策略类
 * MACD Strategy Class
 */
export class MACDStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 调用父类构造函数 / Call parent constructor
    super({
      name: 'MACDStrategy',
      ...params,
    });

    // 快线周期 / Fast period
    this.fastPeriod = params.fastPeriod || 12;

    // 慢线周期 / Slow period
    this.slowPeriod = params.slowPeriod || 26;

    // 信号线周期 / Signal period
    this.signalPeriod = params.signalPeriod || 9;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95;

    // EMA 缓存 / EMA cache
    this.fastEMA = null;
    this.slowEMA = null;
    this.signalEMA = null;

    // 历史 MACD 值 / Historical MACD values
    this.macdHistory = [];

    // 上一个柱状图值 / Previous histogram value
    this.prevHistogram = null;
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // MACD 策略只需要 K 线数据计算 MACD / MACD strategy only needs kline for MACD calculation
    return ['kline'];
  }

  /**
   * 初始化
   * Initialization
   */
  async onInit() {
    await super.onInit();

    this.log(`参数: 快=${this.fastPeriod}, 慢=${this.slowPeriod}, 信号=${this.signalPeriod}`);
    this.log(`Params: fast=${this.fastPeriod}, slow=${this.slowPeriod}, signal=${this.signalPeriod}`);
  }

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    // 确保有足够的数据 / Ensure enough data
    if (history.length < this.slowPeriod + this.signalPeriod) {
      return;  // 数据不足，跳过 / Not enough data, skip
    }

    // 提取收盘价数组 / Extract close prices array
    const closes = history.map(h => h.close);

    // 计算 MACD / Calculate MACD
    const macd = this._calculateMACD(closes);

    // 如果 MACD 计算失败，跳过 / If MACD calculation failed, skip
    if (macd === null) {
      return;
    }

    // 保存指标值 / Save indicator values
    this.setIndicator('macd', macd.macd);
    this.setIndicator('signal', macd.signal);
    this.setIndicator('histogram', macd.histogram);

    // 获取当前持仓 / Get current position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 如果没有上一个柱状图值，跳过 / If no previous histogram, skip
    if (this.prevHistogram === null) {
      this.prevHistogram = macd.histogram;
      return;
    }

    // 检测 MACD 金叉 (柱状图由负转正) / Detect MACD golden cross (histogram turns positive)
    const goldenCross = this.prevHistogram < 0 && macd.histogram >= 0;

    // 检测 MACD 死叉 (柱状图由正转负) / Detect MACD death cross (histogram turns negative)
    const deathCross = this.prevHistogram > 0 && macd.histogram <= 0;

    // 柱状图增加 (趋势加强) / Histogram increasing (trend strengthening)
    const histogramIncreasing = macd.histogram > this.prevHistogram && macd.histogram > 0;

    // 柱状图减少 (趋势减弱) / Histogram decreasing (trend weakening)
    const histogramDecreasing = macd.histogram < this.prevHistogram && macd.histogram < 0;

    // 交易逻辑 / Trading logic
    if (goldenCross && !hasPosition) {
      // MACD 金叉，买入 / MACD golden cross, buy
      this.log(`MACD 金叉 / MACD Golden Cross: MACD=${macd.macd.toFixed(4)}, Signal=${macd.signal.toFixed(4)}`);
      this.setBuySignal('MACD Golden Cross');
      this.buyPercent(this.symbol, this.positionPercent);
    } else if (deathCross && hasPosition) {
      // MACD 死叉，卖出 / MACD death cross, sell
      this.log(`MACD 死叉 / MACD Death Cross: MACD=${macd.macd.toFixed(4)}, Signal=${macd.signal.toFixed(4)}`);
      this.setSellSignal('MACD Death Cross');
      this.closePosition(this.symbol);
    }

    // 更新上一个柱状图值 / Update previous histogram
    this.prevHistogram = macd.histogram;
  }

  /**
   * 计算 MACD
   * Calculate MACD
   * @private
   */
  _calculateMACD(closes) {
    // 计算快速 EMA / Calculate fast EMA
    const fastEMA = this._calculateEMA(closes, this.fastPeriod);

    // 计算慢速 EMA / Calculate slow EMA
    const slowEMA = this._calculateEMA(closes, this.slowPeriod);

    // 计算 MACD 线 / Calculate MACD line
    const macdLine = fastEMA - slowEMA;

    // 保存 MACD 值到历史 / Save MACD value to history
    this.macdHistory.push(macdLine);

    // 确保有足够的 MACD 历史来计算信号线 / Ensure enough MACD history for signal line
    if (this.macdHistory.length < this.signalPeriod) {
      return null;
    }

    // 计算信号线 (MACD 的 EMA) / Calculate signal line (EMA of MACD)
    const signalLine = this._calculateEMA(this.macdHistory, this.signalPeriod);

    // 计算柱状图 / Calculate histogram
    const histogram = macdLine - signalLine;

    return {
      macd: macdLine,       // MACD 线 / MACD line
      signal: signalLine,   // 信号线 / Signal line
      histogram,            // 柱状图 / Histogram
    };
  }

  /**
   * 计算 EMA
   * Calculate EMA (Exponential Moving Average)
   * @private
   */
  _calculateEMA(data, period) {
    // 确保有足够的数据 / Ensure enough data
    if (data.length < period) {
      return null;
    }

    // 计算乘数 / Calculate multiplier
    const multiplier = 2 / (period + 1);

    // 使用简单移动平均作为初始 EMA / Use SMA as initial EMA
    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;

    // 计算 EMA / Calculate EMA
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }

    return ema;
  }
}

// 导出默认类 / Export default class
export default MACDStrategy;
