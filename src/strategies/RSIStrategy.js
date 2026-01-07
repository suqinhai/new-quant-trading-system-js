/**
 * RSI 策略
 * RSI Strategy
 *
 * 基于相对强弱指标 (RSI) 的超买超卖策略
 * Overbought/oversold strategy based on Relative Strength Index
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js';

/**
 * RSI 策略类
 * RSI Strategy Class
 */
export class RSIStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 调用父类构造函数 / Call parent constructor
    super({
      name: 'RSIStrategy',
      ...params,
    });

    // RSI 周期 / RSI period
    this.period = params.period || 14;

    // 超买阈值 / Overbought threshold
    this.overbought = params.overbought || 70;

    // 超卖阈值 / Oversold threshold
    this.oversold = params.oversold || 30;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95;

    // RSI 值缓存 / RSI values cache
    this.rsiValues = [];
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // RSI 策略只需要 K 线数据计算 RSI / RSI strategy only needs kline for RSI calculation
    return ['kline'];
  }

  /**
   * 初始化
   * Initialization
   */
  async onInit() {
    await super.onInit();

    this.log(`参数: 周期=${this.period}, 超买=${this.overbought}, 超卖=${this.oversold}`);
    this.log(`Params: period=${this.period}, overbought=${this.overbought}, oversold=${this.oversold}`);
  }

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    // 确保有足够的数据 / Ensure enough data
    if (history.length < this.period + 1) {
      return;  // 数据不足，跳过 / Not enough data, skip
    }

    // 提取收盘价数组 / Extract close prices array
    const closes = history.map(h => h.close);

    // 计算 RSI / Calculate RSI
    const rsi = this._calculateRSI(closes);

    // 如果 RSI 计算失败，跳过 / If RSI calculation failed, skip
    if (rsi === null) {
      return;
    }

    // 保存指标值 / Save indicator value
    this.setIndicator('rsi', rsi);
    this.rsiValues.push(rsi);

    // 获取当前持仓 / Get current position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 获取上一个 RSI 值 / Get previous RSI value
    const prevRsi = this.rsiValues.length > 1 ? this.rsiValues[this.rsiValues.length - 2] : null;

    // 如果没有上一个值，跳过 / If no previous value, skip
    if (prevRsi === null) {
      return;
    }

    // 检测从超卖区域回升 / Detect recovery from oversold
    const oversoldRecovery = prevRsi < this.oversold && rsi >= this.oversold;

    // 检测进入超买区域 / Detect entering overbought
    const enteringOverbought = prevRsi < this.overbought && rsi >= this.overbought;

    // 检测从超买区域下跌 / Detect decline from overbought
    const overboughtDecline = prevRsi > this.overbought && rsi <= this.overbought;

    // 交易逻辑 / Trading logic
    if (rsi <= this.oversold && !hasPosition) {
      // RSI 超卖，买入信号 / RSI oversold, buy signal
      this.log(`RSI 超卖信号 / RSI Oversold Signal: RSI=${rsi.toFixed(2)} @ ${candle.close}`);
      this.setBuySignal(`RSI Oversold (${rsi.toFixed(2)})`);
      this.buyPercent(this.symbol, this.positionPercent);
    } else if (rsi >= this.overbought && hasPosition) {
      // RSI 超买，卖出信号 / RSI overbought, sell signal
      this.log(`RSI 超买信号 / RSI Overbought Signal: RSI=${rsi.toFixed(2)} @ ${candle.close}`);
      this.setSellSignal(`RSI Overbought (${rsi.toFixed(2)})`);
      this.closePosition(this.symbol);
    }
  }

  /**
   * 计算 RSI
   * Calculate RSI
   * @private
   */
  _calculateRSI(closes) {
    // 确保有足够的数据 / Ensure enough data
    if (closes.length < this.period + 1) {
      return null;
    }

    // 计算价格变化 / Calculate price changes
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    // 获取最近 period 个变化 / Get last period changes
    const recentChanges = changes.slice(-this.period);

    // 分离涨跌 / Separate gains and losses
    let gains = 0;
    let losses = 0;

    for (const change of recentChanges) {
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    // 计算平均涨跌 / Calculate average gains/losses
    const avgGain = gains / this.period;
    const avgLoss = losses / this.period;

    // 防止除以零 / Prevent division by zero
    if (avgLoss === 0) {
      return 100;
    }

    // 计算 RS 和 RSI / Calculate RS and RSI
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }
}

// 导出默认类 / Export default class
export default RSIStrategy;
