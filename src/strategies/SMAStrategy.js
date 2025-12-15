/**
 * 简单移动平均线策略 (SMA Strategy)
 * Simple Moving Average Strategy
 *
 * 经典的双均线交叉策略
 * Classic dual moving average crossover strategy
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js';

// 导入技术指标库 / Import technical indicators library
import { SMA } from 'technicalindicators';

/**
 * SMA 策略类
 * SMA Strategy Class
 */
export class SMAStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 调用父类构造函数 / Call parent constructor
    super({
      name: 'SMAStrategy',
      ...params,
    });

    // 短期均线周期 / Short period
    this.shortPeriod = params.shortPeriod || 10;

    // 长期均线周期 / Long period
    this.longPeriod = params.longPeriod || 30;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95;

    // 上一次的短期/长期均线值 / Previous short/long MA values
    this.prevShortMA = null;
    this.prevLongMA = null;
  }

  /**
   * 初始化
   * Initialization
   */
  async onInit() {
    await super.onInit();

    this.log(`参数: 短期=${this.shortPeriod}, 长期=${this.longPeriod} / Params: short=${this.shortPeriod}, long=${this.longPeriod}`);
  }

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    // 确保有足够的数据 / Ensure enough data
    if (history.length < this.longPeriod) {
      return;  // 数据不足，跳过 / Not enough data, skip
    }

    // 提取收盘价数组 / Extract close prices array
    const closes = history.map(h => h.close);

    // 计算短期和长期均线 / Calculate short and long MA
    const shortMA = this._calculateSMA(closes, this.shortPeriod);
    const longMA = this._calculateSMA(closes, this.longPeriod);

    // 保存指标值 / Save indicator values
    this.setIndicator('shortMA', shortMA);
    this.setIndicator('longMA', longMA);

    // 获取当前持仓 / Get current position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 如果是第一次运行，只保存均线值 / If first run, only save MA values
    if (this.prevShortMA === null || this.prevLongMA === null) {
      this.prevShortMA = shortMA;
      this.prevLongMA = longMA;
      return;
    }

    // 检测金叉 (短期均线上穿长期均线) / Detect golden cross (short MA crosses above long MA)
    const goldenCross = this.prevShortMA <= this.prevLongMA && shortMA > longMA;

    // 检测死叉 (短期均线下穿长期均线) / Detect death cross (short MA crosses below long MA)
    const deathCross = this.prevShortMA >= this.prevLongMA && shortMA < longMA;

    // 交易逻辑 / Trading logic
    if (goldenCross && !hasPosition) {
      // 金叉且无持仓，买入 / Golden cross without position, buy
      this.log(`金叉信号 / Golden Cross Signal @ ${candle.close}`);
      this.setBuySignal('Golden Cross');
      this.buyPercent(this.symbol, this.positionPercent);
    } else if (deathCross && hasPosition) {
      // 死叉且有持仓，卖出 / Death cross with position, sell
      this.log(`死叉信号 / Death Cross Signal @ ${candle.close}`);
      this.setSellSignal('Death Cross');
      this.closePosition(this.symbol);
    }

    // 更新上一次均线值 / Update previous MA values
    this.prevShortMA = shortMA;
    this.prevLongMA = longMA;
  }

  /**
   * 计算 SMA
   * Calculate SMA
   * @private
   */
  _calculateSMA(data, period) {
    // 获取最近 period 个数据 / Get last period data points
    const values = data.slice(-period);

    // 计算平均值 / Calculate average
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / period;
  }
}

// 导出默认类 / Export default class
export default SMAStrategy;
