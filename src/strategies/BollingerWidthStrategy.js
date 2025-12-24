/**
 * Bollinger Width 扩张/收敛策略
 * Bollinger Bandwidth Squeeze Strategy
 *
 * 基于布林带宽度变化的波动率策略
 * 带宽收敛（挤压）预示大行情，突破时入场
 * 结合 Keltner 通道形成经典的 Squeeze 指标
 */

import { BaseStrategy } from './BaseStrategy.js';
import { BollingerBands, KeltnerChannels, ATR, EMA, getLatest } from '../utils/indicators.js';

/**
 * Bollinger Width 策略类
 */
export class BollingerWidthStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) {
    super({
      name: 'BollingerWidthStrategy',
      ...params,
    });

    // 布林带周期 / Bollinger Bands period
    this.bbPeriod = params.bbPeriod || 20;

    // 布林带标准差 / BB standard deviation
    this.bbStdDev = params.bbStdDev || 2.0;

    // Keltner 通道周期 / Keltner Channel period
    this.kcPeriod = params.kcPeriod || 20;

    // Keltner ATR 倍数 / Keltner ATR multiplier
    this.kcMultiplier = params.kcMultiplier || 1.5;

    // 带宽百分位阈值 (低于此值视为挤压) / Bandwidth percentile threshold
    this.squeezeThreshold = params.squeezeThreshold || 20;

    // 带宽历史周期 / Bandwidth history period
    this.bandwidthLookback = params.bandwidthLookback || 100;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95;

    // 动量周期 / Momentum period
    this.momentumPeriod = params.momentumPeriod || 12;

    // 使用动量确认 / Use momentum confirmation
    this.useMomentumConfirm = params.useMomentumConfirm !== false;

    // 止损倍数 (ATR) / Stop loss multiplier (ATR)
    this.stopLossMultiplier = params.stopLossMultiplier || 2.0;

    // 内部状态
    this._bandwidthHistory = [];
    this._inSqueeze = false;
    this._squeezeStartIndex = null;
    this._entryPrice = null;
    this._stopLoss = null;
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();

    this.log(`Bollinger Width 策略初始化`);
    this.log(`BB周期=${this.bbPeriod}, KC周期=${this.kcPeriod}, 挤压阈值=${this.squeezeThreshold}%`);
  }

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) {
    // 确保足够数据 / Ensure enough data
    const requiredLength = Math.max(this.bbPeriod, this.kcPeriod, this.momentumPeriod) + 10;
    if (history.length < requiredLength) {
      return;
    }

    // 计算指标 / Calculate indicators
    const closes = history.map(h => h.close);

    // 布林带 / Bollinger Bands
    const bbValues = BollingerBands(closes, this.bbPeriod, this.bbStdDev);
    if (bbValues.length < 2) return;

    const currentBB = getLatest(bbValues);
    const prevBB = bbValues[bbValues.length - 2];

    // Keltner 通道 / Keltner Channels
    const kcValues = KeltnerChannels(history, this.kcPeriod, this.kcMultiplier);
    if (kcValues.length < 2) return;

    const currentKC = getLatest(kcValues);

    // ATR
    const atrValues = ATR(history, 14);
    const currentATR = getLatest(atrValues);

    // 计算带宽 / Calculate bandwidth
    const bandwidth = ((currentBB.upper - currentBB.lower) / currentBB.middle) * 100;
    const prevBandwidth = ((prevBB.upper - prevBB.lower) / prevBB.middle) * 100;

    // 更新带宽历史 / Update bandwidth history
    this._bandwidthHistory.push(bandwidth);
    if (this._bandwidthHistory.length > this.bandwidthLookback) {
      this._bandwidthHistory.shift();
    }

    // 计算带宽百分位 / Calculate bandwidth percentile
    const bandwidthPercentile = this._calculatePercentile(bandwidth, this._bandwidthHistory);

    // Squeeze 检测 (BB 在 KC 内部) / Squeeze detection
    const squeeze = currentBB.lower > currentKC.lower && currentBB.upper < currentKC.upper;

    // 计算动量 / Calculate momentum
    const momentum = this._calculateMomentum(closes, this.momentumPeriod);
    const prevMomentum = this._calculateMomentum(closes.slice(0, -1), this.momentumPeriod);

    // 保存指标 / Save indicators
    this.setIndicator('bandwidth', bandwidth);
    this.setIndicator('bandwidthPercentile', bandwidthPercentile);
    this.setIndicator('squeeze', squeeze);
    this.setIndicator('momentum', momentum);
    this.setIndicator('bbUpper', currentBB.upper);
    this.setIndicator('bbLower', currentBB.lower);
    this.setIndicator('bbMiddle', currentBB.middle);

    // 获取持仓 / Get position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 交易逻辑 / Trading logic
    if (!hasPosition) {
      this._handleEntry(candle, {
        squeeze,
        bandwidthPercentile,
        bandwidth,
        prevBandwidth,
        momentum,
        prevMomentum,
        currentBB,
        currentATR,
      });
    } else {
      this._handleExit(candle, {
        currentBB,
        currentATR,
        momentum,
      });
    }

    // 更新挤压状态 / Update squeeze state
    if (squeeze && !this._inSqueeze) {
      this._inSqueeze = true;
      this._squeezeStartIndex = history.length;
      this.log(`进入挤压状态, 带宽=${bandwidth.toFixed(2)}%, 百分位=${bandwidthPercentile.toFixed(0)}%`);
    } else if (!squeeze && this._inSqueeze) {
      this._inSqueeze = false;
      const squeezeDuration = history.length - this._squeezeStartIndex;
      this.log(`退出挤压状态, 持续=${squeezeDuration}根K线`);
    }
  }

  /**
   * 处理入场
   * @private
   */
  _handleEntry(candle, indicators) {
    const { squeeze, bandwidthPercentile, bandwidth, prevBandwidth, momentum, prevMomentum, currentBB, currentATR } = indicators;

    // 条件1: 刚从挤压状态释放 / Just released from squeeze
    const squeezeRelease = this._inSqueeze && !squeeze;

    // 条件2: 带宽开始扩张 / Bandwidth expanding
    const bandwidthExpanding = bandwidth > prevBandwidth * 1.1; // 扩张 10%

    // 条件3: 动量确认 / Momentum confirmation
    const momentumBullish = !this.useMomentumConfirm || (momentum > 0 && momentum > prevMomentum);
    const momentumBearish = !this.useMomentumConfirm || (momentum < 0 && momentum < prevMomentum);

    // 条件4: 价格位置 / Price position
    const priceAboveMiddle = candle.close > currentBB.middle;
    const priceBelowMiddle = candle.close < currentBB.middle;

    // 向上突破信号 / Bullish breakout signal
    if ((squeezeRelease || bandwidthExpanding) && momentumBullish && priceAboveMiddle) {
      this.log(`挤压突破做多! 带宽=${bandwidth.toFixed(2)}%, 动量=${momentum.toFixed(2)}`);

      this._entryPrice = candle.close;
      this._stopLoss = candle.close - this.stopLossMultiplier * currentATR;

      this.setState('direction', 'long');
      this.setState('entryBandwidth', bandwidth);

      this.setBuySignal(`Squeeze Breakout UP, Bandwidth: ${bandwidth.toFixed(1)}%`);
      this.buyPercent(this.symbol, this.positionPercent);
    }

    // 向下突破信号 (记录) / Bearish breakout signal (log only)
    if ((squeezeRelease || bandwidthExpanding) && momentumBearish && priceBelowMiddle) {
      this.log(`挤压向下突破信号 (记录), 带宽=${bandwidth.toFixed(2)}%, 动量=${momentum.toFixed(2)}`);
      this.setIndicator('shortSignal', true);
    }
  }

  /**
   * 处理出场
   * @private
   */
  _handleExit(candle, indicators) {
    const { currentBB, currentATR, momentum } = indicators;
    const direction = this.getState('direction');

    if (direction !== 'long') return;

    // 止损检查 / Stop loss check
    if (candle.close <= this._stopLoss) {
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2);
      this.log(`止损触发, 价格=${candle.close.toFixed(2)}, PnL=${pnl}%`);

      this.setSellSignal(`Stop Loss @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
      return;
    }

    // 触及上轨止盈 / Take profit at upper band
    if (candle.close >= currentBB.upper) {
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2);
      this.log(`触及上轨止盈, 价格=${candle.close.toFixed(2)}, PnL=${pnl}%`);

      this.setSellSignal(`Upper Band TP @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
      return;
    }

    // 动量反转出场 / Momentum reversal exit
    if (momentum < 0 && candle.close < currentBB.middle) {
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2);
      this.log(`动量反转出场, 动量=${momentum.toFixed(2)}, PnL=${pnl}%`);

      this.setSellSignal(`Momentum Reversal @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
    }
  }

  /**
   * 计算动量 (价格与SMA的差值)
   * @private
   */
  _calculateMomentum(closes, period) {
    if (closes.length < period) return 0;

    const recent = closes.slice(-period);
    const sma = recent.reduce((a, b) => a + b, 0) / period;
    const currentPrice = closes[closes.length - 1];

    // 标准化动量
    return ((currentPrice - sma) / sma) * 100;
  }

  /**
   * 计算百分位
   * @private
   */
  _calculatePercentile(value, history) {
    if (history.length < 5) return 50;

    const sorted = [...history].sort((a, b) => a - b);
    let rank = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] <= value) rank++;
    }
    return (rank / sorted.length) * 100;
  }

  /**
   * 重置状态
   * @private
   */
  _resetState() {
    this._entryPrice = null;
    this._stopLoss = null;
    this.setState('direction', null);
    this.setState('entryBandwidth', null);
  }
}

export default BollingerWidthStrategy;
