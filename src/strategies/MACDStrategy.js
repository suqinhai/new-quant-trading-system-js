/**
 * MACD 趋势策略(MACD Strategy)
 * MACD + EMA200 Trend Filter
 *
 * 基于 MACD 指标的趋势跟踪策略，配合 EMA200 趋势过滤
 * Trend following strategy based on MACD with EMA200 trend filter
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js';

// 导入技术指标 / Import technical indicators
import { MACD, EMA } from 'technicalindicators';

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

    // === MACD 参数 / MACD Parameters ===
    this.fastPeriod = params.fastPeriod || 12;
    this.slowPeriod = params.slowPeriod || 26;
    this.signalPeriod = params.signalPeriod || 9;

    // 趋势过滤 EMA / Trend filter EMA
    this.trendPeriod = params.trendPeriod || 200;

    // 交易参数 / Trading parameters
    this.symbol = params.symbol || 'BTC/USDT';
    this.positionPercent = params.positionPercent || 50;
    this.stopLossPercent = params.stopLossPercent || 3;

    // Histogram 最小阈值 (防假突破) / Min histogram threshold (anti-whipsaw)
    this.minHistogramRatio = params.minHistogramRatio || 0.0001;

    // 上一次 Histogram / Previous histogram
    this.prevHistogram = null;
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    return ['kline'];
  }

  /**
   * 初始化
   * Initialization
   */
  async onInit() {
    await super.onInit();

    this.log(
      `MACD 参数: ${this.fastPeriod}/${this.slowPeriod}/${this.signalPeriod}, EMA${this.trendPeriod}, 止损=${this.stopLossPercent}%`
    );
    this.log(
      `MACD Params: ${this.fastPeriod}/${this.slowPeriod}/${this.signalPeriod}, EMA${this.trendPeriod}, StopLoss=${this.stopLossPercent}%`
    );
  }

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    // 确保有足够的数据 / Ensure enough data
    // EMA200 需要 trendPeriod，MACD 需要 slowPeriod + signalPeriod
    const minLength = Math.max(
      this.trendPeriod,
      this.slowPeriod + this.signalPeriod
    ) + 1;

    if (history.length < minLength) {
      return;
    }

    // 提取收盘价数组 / Extract close prices array
    const closes = history.map(h => h.close);

    // === EMA200 趋势线 / EMA200 Trend Line ===
    const ema200Result = EMA.calculate({
      period: this.trendPeriod,
      values: closes,
    });
    const ema200 = ema200Result.at(-1);

    // === MACD 计算 / MACD Calculation ===
    const macdList = MACD.calculate({
      fastPeriod: this.fastPeriod,
      slowPeriod: this.slowPeriod,
      signalPeriod: this.signalPeriod,
      values: closes,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });

    const macd = macdList.at(-1);
    if (!macd) return;

    const { MACD: dif, signal: dea, histogram } = macd;

    // 保存指标值 / Save indicator values
    this.setIndicator('DIF', dif);
    this.setIndicator('DEA', dea);
    this.setIndicator('Histogram', histogram);
    this.setIndicator('EMA200', ema200);

    // 获取当前持仓 / Get current position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // === 止损检查 / Stop Loss Check ===
    if (hasPosition) {
      const loss =
        ((candle.close - position.entryPrice) / position.entryPrice) * 100;
      if (loss <= -this.stopLossPercent) {
        this.log(`止损触发 ${loss.toFixed(2)}% / Stop Loss Triggered`);
        this.setSellSignal('Stop Loss');
        this.closePosition(this.symbol);
        this.prevHistogram = null;
        return;
      }
    }

    // 第一次运行，保存值 / First run, save value
    if (this.prevHistogram === null) {
      this.prevHistogram = histogram;
      return;
    }

    // === 信号判定 / Signal Detection ===
    // 金叉: Histogram 由负转正 / Golden cross: histogram turns positive
    const goldenCross = this.prevHistogram <= 0 && histogram > 0;

    // 死叉: Histogram 由正转负 / Death cross: histogram turns negative
    const deathCross = this.prevHistogram >= 0 && histogram < 0;

    // 假突破过滤 / Anti-whipsaw filter
    const minHistogram = this.minHistogramRatio * candle.close;
    const validCross = Math.abs(histogram) > minHistogram;

    // 趋势判断 / Trend detection
    const trendUp = candle.close > ema200;

    // === 交易逻辑 / Trading Logic ===
    // 入场: 金叉 + 趋势向上 + 有效交叉 / Entry: golden cross + uptrend + valid cross
    if (goldenCross && trendUp && validCross && !hasPosition) {
      this.log(`MACD 金叉做多 @ ${candle.close} / MACD Golden Cross Long`);
      this.setBuySignal('MACD Golden Cross');
      this.buyPercent(this.symbol, this.positionPercent);
    }

    // 出场: 死叉 / Exit: death cross
    if (deathCross && hasPosition) {
      this.log(`MACD 死叉平仓 @ ${candle.close} / MACD Death Cross Exit`);
      this.setSellSignal('MACD Death Cross');
      this.closePosition(this.symbol);
    }

    // 更新上一次 Histogram / Update previous histogram
    this.prevHistogram = histogram;
  }
}

// 导出默认类 / Export default class
export default MACDStrategy;
