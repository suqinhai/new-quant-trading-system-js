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
    this.positionPercent = params.positionPercent || 50;

    // 止损百分比 / Stop loss percentage
    this.stopLossPercent = params.stopLossPercent || 3;

    // 均线最小间距比例 (防假突破) / Min MA diff ratio (anti-whipsaw)
    this.minMaDiffRatio = params.minMaDiffRatio || 0.001;

    // 上一次的短期/长期均线值 / Previous short/long MA values
    this.prevShortMA = null;
    this.prevLongMA = null;
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // SMA 策略只需要 K 线数据计算均线 / SMA strategy only needs kline for MA calculation
    return ['kline'];
  }

  /**
   * 初始化
   * Initialization
   */
  async onInit() {
    await super.onInit();

    this.log(`参数: 短期=${this.shortPeriod}, 长期=${this.longPeriod}, 止损=${this.stopLossPercent}%, 仓位=${this.positionPercent}%`);
    this.log(`Params: short=${this.shortPeriod}, long=${this.longPeriod}, stopLoss=${this.stopLossPercent}%, position=${this.positionPercent}%`);
  }

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    // 确保有足够的数据 (需要额外一根用于 prevMA 计算) / Ensure enough data (+1 for prevMA)
    if (history.length < this.longPeriod + 1) {
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

    // 止损检查 / Stop loss check
    if (hasPosition) {
      const loss = (candle.close - position.entryPrice) / position.entryPrice * 100;
      if (loss <= -this.stopLossPercent) {
        this.log(`止损触发 ${loss.toFixed(2)}% / Stop Loss Triggered`);
        this.setSellSignal('Stop Loss');
        this.closePosition(this.symbol);
        // 重置均线值，避免止损后立即重新入场 / Reset MA to avoid immediate re-entry
        this.prevShortMA = null;
        this.prevLongMA = null;
        return;
      }
    }

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

    // 均线间距过滤 (防假突破) / MA diff filter (anti-whipsaw)
    const maDiffRatio = Math.abs(shortMA - longMA) / candle.close;
    const validCross = maDiffRatio > this.minMaDiffRatio;

    // 趋势过滤: 价格在长期均线上方才做多 / Trend filter: only long when price above long MA
    const priceAboveLongMA = candle.close > longMA;

    // 交易逻辑 / Trading logic
    if (goldenCross && validCross && priceAboveLongMA && !hasPosition) {
      // 金叉 + 趋势确认 + 间距有效 + 无持仓，买入 / Golden cross + trend confirmed + valid gap + no position, buy
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
    // 使用 technicalindicators 库计算 / Use technicalindicators library
    const result = SMA.calculate({
      period,
      values: data,
    });
    return result.at(-1);
  }
}

// 导出默认类 / Export default class
export default SMAStrategy;
