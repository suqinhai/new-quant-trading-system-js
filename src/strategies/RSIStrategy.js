/**
 * RSI 策略 (增强版)
 * RSI Strategy (Enhanced)
 *
 * RSI 回归 + EMA200 趋势过滤 + ATR 动态止损
 * RSI mean reversion + EMA200 trend filter + ATR dynamic stop loss
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

    // === RSI 参数 / RSI Parameters ===
    this.period = params.period || 14;
    this.oversold = params.oversold || 40;
    this.overbought = params.overbought || 60;

    // === 趋势参数 / Trend Parameters ===
    this.emaPeriod = params.emaPeriod || 200;

    // === ATR 动态止损 / ATR Dynamic Stop Loss ===
    this.atrPeriod = params.atrPeriod || 14;
    this.atrStopMult = params.atrStopMult || 2;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95;

    // === 状态 / State ===
    this.entryPrice = null;
    this.rsiValues = [];

    // === Wilder 指标缓存 / Wilder Indicator Cache ===
    this.prevAvgGain = null;
    this.prevAvgLoss = null;
    this.prevATR = null;
    this.prevEMA = null;
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

    this.log(`RSI 参数: 周期=${this.period}, 超卖=${this.oversold}, 超买=${this.overbought}`);
    this.log(`趋势参数: EMA周期=${this.emaPeriod}`);
    this.log(`止损参数: ATR周期=${this.atrPeriod}, ATR倍数=${this.atrStopMult}`);
  }

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    // 确保有足够的数据 (需要 EMA200) / Ensure enough data for EMA200
    if (history.length < this.emaPeriod + 1) {
      return;
    }

    // 提取收盘价数组 / Extract close prices array
    const closes = history.map(h => h.close);

    // ============================================
    // 计算指标 / Calculate indicators
    // ============================================

    // 计算 RSI / Calculate RSI
    const rsi = this._calculateRSI(closes);
    if (rsi === null) return;

    // 计算 EMA200 / Calculate EMA200
    const ema200 = this._calculateEMA(closes, this.emaPeriod);
    if (ema200 === null) return;

    // 计算 ATR / Calculate ATR
    const atr = this._calculateATR(history);
    if (atr === null) return;

    // 保存指标值 / Save indicator values
    this.setIndicator('rsi', rsi);
    this.setIndicator('ema200', ema200);
    this.setIndicator('atr', atr);

    // RSI 缓存 / RSI cache
    this.rsiValues.push(rsi);
    if (this.rsiValues.length > 100) {
      this.rsiValues.shift();
    }

    // 获取上一个 RSI 值 / Get previous RSI value
    const prevRsi = this.rsiValues.length > 1 ? this.rsiValues.at(-2) : null;
    if (prevRsi === null) return;

    // 获取当前持仓 / Get current position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // ============================================
    // 入场信号: RSI 回归 / Entry signal: RSI recovery
    // ============================================
    const longSignal = prevRsi < this.oversold && rsi >= this.oversold;

    if (longSignal && candle.close > ema200 && !hasPosition) {
      this.log(`RSI 回归买入信号 / RSI Recovery Buy: RSI=${rsi.toFixed(2)}, EMA200=${ema200.toFixed(2)}, Price=${candle.close}`);
      this.setBuySignal(`RSI Recovery (${rsi.toFixed(2)})`);
      this.entryPrice = candle.close;
      this.buyPercent(this.symbol, this.positionPercent);
      return; // 入场后本根 K 线不再检查退出
    }

    // ============================================
    // 退出逻辑 (三层职责) / Exit logic (3 layers)
    // ============================================
    if (hasPosition && this.entryPrice !== null) {
      // 1. ATR 动态止损 (风控优先) / ATR stop loss (risk first)
      const stopPrice = this.entryPrice - atr * this.atrStopMult;
      const stopLoss = candle.close <= stopPrice;

      // 2. 动能退出: RSI 从超买回落 / Momentum exit: RSI decline from overbought
      const exitByMomentum = prevRsi > this.overbought && rsi <= this.overbought;

      // 3. 趋势退出: 跌破 EMA200 / Trend exit: break below EMA200
      const trendBroken = candle.close < ema200;

      if (stopLoss) {
        this.log(`ATR 止损触发 / ATR Stop Loss: 止损价=${stopPrice.toFixed(2)}, 当前价=${candle.close}`);
        this.setSellSignal('ATR Stop Loss');
        this.closePosition(this.symbol);
        this.entryPrice = null;
      } else if (exitByMomentum) {
        this.log(`RSI 动能退出 / RSI Momentum Exit: RSI=${rsi.toFixed(2)}`);
        this.setSellSignal(`RSI Overbought Exit (${rsi.toFixed(2)})`);
        this.closePosition(this.symbol);
        this.entryPrice = null;
      } else if (trendBroken) {
        this.log(`趋势反转退出 / Trend Broken Exit: Price=${candle.close} < EMA200=${ema200.toFixed(2)}`);
        this.setSellSignal('Trend Broken (Below EMA200)');
        this.closePosition(this.symbol);
        this.entryPrice = null;
      }
    }
  }

  /**
   * 计算 Wilder RSI (与 TradingView / TA-Lib 一致)
   * Calculate Wilder RSI (consistent with TradingView / TA-Lib)
   * @private
   */
  _calculateRSI(closes) {
    if (closes.length < this.period + 1) {
      return null;
    }

    // 当前价格变化 / Current price change
    const change = closes.at(-1) - closes.at(-2);
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    if (this.prevAvgGain === null) {
      // 初始化（只发生一次）/ Initialize (only once)
      let gains = 0;
      let losses = 0;

      for (let i = closes.length - this.period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) {
          gains += diff;
        } else {
          losses += Math.abs(diff);
        }
      }

      this.prevAvgGain = gains / this.period;
      this.prevAvgLoss = losses / this.period;
    } else {
      // Wilder 平滑 / Wilder smoothing
      this.prevAvgGain = (this.prevAvgGain * (this.period - 1) + gain) / this.period;
      this.prevAvgLoss = (this.prevAvgLoss * (this.period - 1) + loss) / this.period;
    }

    // 防止除以零 / Prevent division by zero
    if (this.prevAvgLoss === 0) {
      return 100;
    }

    // 计算 RS 和 RSI / Calculate RS and RSI
    const rs = this.prevAvgGain / this.prevAvgLoss;
    return 100 - 100 / (1 + rs);
  }

  /**
   * 计算 EMA (递推式，高性能)
   * Calculate EMA (recursive, high performance)
   * @private
   */
  _calculateEMA(data, period) {
    if (data.length < period) {
      return null;
    }

    const price = data.at(-1);
    const multiplier = 2 / (period + 1);

    if (this.prevEMA === null) {
      // 初始化：使用 SMA / Initialize with SMA
      this.prevEMA = data.slice(-period).reduce((a, b) => a + b, 0) / period;
    } else {
      // 递推计算 / Recursive calculation
      this.prevEMA = (price - this.prevEMA) * multiplier + this.prevEMA;
    }

    return this.prevEMA;
  }

  /**
   * 计算 Wilder ATR (递推式，响应更快)
   * Calculate Wilder ATR (recursive, faster response)
   * @private
   */
  _calculateATR(history) {
    if (history.length < 2) {
      return null;
    }

    const curr = history.at(-1);
    const prev = history.at(-2);

    // 计算当前 True Range / Calculate current True Range
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );

    if (this.prevATR === null) {
      // 初始化：需要足够数据 / Initialize: need enough data
      if (history.length < this.atrPeriod + 1) {
        return null;
      }

      let sumTR = 0;
      for (let i = history.length - this.atrPeriod; i < history.length; i++) {
        const h = history[i];
        const p = history[i - 1];
        sumTR += Math.max(
          h.high - h.low,
          Math.abs(h.high - p.close),
          Math.abs(h.low - p.close)
        );
      }
      this.prevATR = sumTR / this.atrPeriod;
    } else {
      // Wilder 平滑 / Wilder smoothing
      this.prevATR = (this.prevATR * (this.atrPeriod - 1) + tr) / this.atrPeriod;
    }

    return this.prevATR;
  }
}

// 导出默认类 / Export default class
export default RSIStrategy;
