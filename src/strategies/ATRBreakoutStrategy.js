/**
 * ATR 波动突破策略
 * ATR Breakout Strategy
 *
 * 基于 ATR 动态通道的突破策略
 * 适合捕捉大行情启动，与趋势类指标相关性低
 */

import { BaseStrategy } from './BaseStrategy.js';
import { ATR, EMA, getLatest } from '../utils/indicators.js';

/**
 * ATR 波动突破策略类
 * ATR Breakout Strategy Class
 */
export class ATRBreakoutStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) {
    super({
      name: 'ATRBreakoutStrategy',
      ...params,
    });

    // ATR 周期 / ATR period
    this.atrPeriod = params.atrPeriod || 14;

    // ATR 通道倍数 / ATR channel multiplier
    this.atrMultiplier = params.atrMultiplier || 2.0;

    // 基准线周期 (EMA) / Baseline period (EMA)
    this.baselinePeriod = params.baselinePeriod || 20;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95;

    // 止损 ATR 倍数 / Stop loss ATR multiplier
    this.stopLossMultiplier = params.stopLossMultiplier || 1.5;

    // 跟踪止损开启 / Enable trailing stop
    this.useTrailingStop = params.useTrailingStop !== false;

    // 跟踪止损 ATR 倍数 / Trailing stop ATR multiplier
    this.trailingMultiplier = params.trailingMultiplier || 2.0;

    // 突破确认 K 线数 / Breakout confirmation candles
    this.confirmationCandles = params.confirmationCandles || 1;

    // 内部状态 / Internal state
    this._breakoutHigh = null;
    this._breakoutLow = null;
    this._entryPrice = null;
    this._stopLoss = null;
    this._trailingStop = null;
    this._highestSinceEntry = null;
    this._lowestSinceEntry = null;
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();

    this.log(`ATR突破策略初始化`);
    this.log(`参数: ATR周期=${this.atrPeriod}, 倍数=${this.atrMultiplier}, 基准线=${this.baselinePeriod}`);
  }

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) {
    // 确保有足够数据 / Ensure enough data
    const requiredLength = Math.max(this.atrPeriod, this.baselinePeriod) + 5;
    if (history.length < requiredLength) {
      return;
    }

    // 计算指标 / Calculate indicators
    const closes = history.map(h => h.close);
    const atrValues = ATR(history, this.atrPeriod);
    const emaValues = EMA(closes, this.baselinePeriod);

    if (atrValues.length < 2 || emaValues.length < 2) {
      return;
    }

    // 获取当前值 / Get current values
    const currentATR = getLatest(atrValues);
    const currentEMA = getLatest(emaValues);
    const prevATR = atrValues[atrValues.length - 2];

    // 计算动态通道 / Calculate dynamic channel
    const upperBand = currentEMA + this.atrMultiplier * currentATR;
    const lowerBand = currentEMA - this.atrMultiplier * currentATR;

    // 计算 ATR 变化率 (波动率扩张检测) / ATR rate of change
    const atrChange = (currentATR - prevATR) / prevATR;

    // 保存指标 / Save indicators
    this.setIndicator('ATR', currentATR);
    this.setIndicator('EMA', currentEMA);
    this.setIndicator('upperBand', upperBand);
    this.setIndicator('lowerBand', lowerBand);
    this.setIndicator('atrChange', atrChange);

    // 获取持仓 / Get position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    if (!hasPosition) {
      // 无仓位，寻找突破机会 / No position, look for breakout
      this._handleEntry(candle, history, upperBand, lowerBand, currentATR, atrChange);
    } else {
      // 有仓位，管理止损 / Has position, manage stop loss
      this._handleExit(candle, currentATR, currentEMA);
    }
  }

  /**
   * 处理入场逻辑
   * @private
   */
  _handleEntry(candle, history, upperBand, lowerBand, atr, atrChange) {
    // 获取前几根K线用于确认 / Get previous candles for confirmation
    const lookback = this.confirmationCandles + 1;
    const recentCandles = history.slice(-lookback);

    // 向上突破确认 / Upward breakout confirmation
    const prevClose = recentCandles[0].close;
    const breakoutUp = prevClose < upperBand && candle.close > upperBand;

    // 向下突破确认 / Downward breakout confirmation
    const breakoutDown = prevClose > lowerBand && candle.close < lowerBand;

    // 波动率扩张确认 (ATR正在增加) / Volatility expansion confirmation
    const volatilityExpanding = atrChange > 0;

    if (breakoutUp && volatilityExpanding) {
      // 向上突破，做多 / Upward breakout, go long
      this.log(`向上突破! 价格=${candle.close.toFixed(2)}, 上轨=${upperBand.toFixed(2)}, ATR=${atr.toFixed(2)}`);

      this._entryPrice = candle.close;
      this._stopLoss = candle.close - this.stopLossMultiplier * atr;
      this._trailingStop = this._stopLoss;
      this._highestSinceEntry = candle.high;

      this.setState('direction', 'long');
      this.setState('entryATR', atr);

      this.setBuySignal(`ATR Breakout UP @ ${candle.close.toFixed(2)}`);
      this.buyPercent(this.symbol, this.positionPercent);

    } else if (breakoutDown && volatilityExpanding) {
      // 向下突破（如支持做空）/ Downward breakout (if short supported)
      this.log(`向下突破信号 (仅记录) 价格=${candle.close.toFixed(2)}, 下轨=${lowerBand.toFixed(2)}`);
      // 当前仅做多，记录信号用于分析
      this.setIndicator('shortSignal', true);
    }
  }

  /**
   * 处理出场逻辑
   * @private
   */
  _handleExit(candle, atr, ema) {
    const direction = this.getState('direction');
    const entryATR = this.getState('entryATR') || atr;

    if (direction === 'long') {
      // 更新最高价 / Update highest price
      if (candle.high > this._highestSinceEntry) {
        this._highestSinceEntry = candle.high;

        // 更新跟踪止损 / Update trailing stop
        if (this.useTrailingStop) {
          const newTrailingStop = this._highestSinceEntry - this.trailingMultiplier * atr;
          if (newTrailingStop > this._trailingStop) {
            this._trailingStop = newTrailingStop;
            this.log(`跟踪止损更新: ${this._trailingStop.toFixed(2)}`);
          }
        }
      }

      // 检查止损 / Check stop loss
      const effectiveStop = this.useTrailingStop ?
        Math.max(this._stopLoss, this._trailingStop) : this._stopLoss;

      if (candle.close <= effectiveStop) {
        // 触发止损 / Stop loss triggered
        const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2);
        this.log(`止损触发! 价格=${candle.close.toFixed(2)}, 止损=${effectiveStop.toFixed(2)}, PnL=${pnl}%`);

        this.setSellSignal(`Stop Loss @ ${candle.close.toFixed(2)}`);
        this.closePosition(this.symbol);
        this._resetState();

      } else if (candle.close < ema && candle.close < this._entryPrice) {
        // 跌破均线且亏损，保守出场 / Below EMA and losing, conservative exit
        const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2);
        this.log(`跌破均线出场, 价格=${candle.close.toFixed(2)}, EMA=${ema.toFixed(2)}, PnL=${pnl}%`);

        this.setSellSignal(`Below EMA Exit @ ${candle.close.toFixed(2)}`);
        this.closePosition(this.symbol);
        this._resetState();
      }

      // 保存当前止损位 / Save current stop level
      this.setIndicator('stopLoss', effectiveStop);
    }
  }

  /**
   * 重置状态
   * @private
   */
  _resetState() {
    this._entryPrice = null;
    this._stopLoss = null;
    this._trailingStop = null;
    this._highestSinceEntry = null;
    this._lowestSinceEntry = null;
    this.setState('direction', null);
    this.setState('entryATR', null);
  }
}

export default ATRBreakoutStrategy;
