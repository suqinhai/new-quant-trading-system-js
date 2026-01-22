/**
 * Bollinger Width 扩张/收敛策略
 * Bollinger Bandwidth Squeeze Strategy
 *
 * 基于布林带宽度变化的波动率策略
 * 带宽收敛（挤压）预示大行情，突破时入场
 * 结合 Keltner 通道形成经典的 Squeeze 指标
 */

import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js
import { BollingerBands, KeltnerChannels, ATR, EMA, getLatest } from '../utils/indicators.js'; // 导入模块 ../utils/indicators.js

/**
 * Bollinger Width 策略类
 */
export class BollingerWidthStrategy extends BaseStrategy { // 导出类 BollingerWidthStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) { // 构造函数
    super({ // 调用父类
      name: 'BollingerWidthStrategy', // 设置 name 字段
      ...params, // 展开对象或数组
    }); // 结束代码块

    // 布林带周期 / Bollinger Bands period
    this.bbPeriod = params.bbPeriod || 20; // 设置 bbPeriod

    // 布林带标准差 / BB standard deviation
    this.bbStdDev = params.bbStdDev || 2.0; // 设置 bbStdDev

    // Keltner 通道周期 / Keltner Channel period
    this.kcPeriod = params.kcPeriod || 20; // 设置 kcPeriod

    // Keltner ATR 倍数 / Keltner ATR multiplier
    this.kcMultiplier = params.kcMultiplier || 1.5; // 设置 kcMultiplier

    // 带宽百分位阈值 (低于此值视为挤压) / Bandwidth percentile threshold
    this.squeezeThreshold = params.squeezeThreshold || 20; // 设置 squeezeThreshold

    // 带宽历史周期 / Bandwidth history period
    this.bandwidthLookback = params.bandwidthLookback || 100; // 设置 bandwidthLookback

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 仓位百分比 / Position percentage (降低默认风险)
    this.positionPercent = params.positionPercent || 60; // 设置 positionPercent

    // 动量周期 / Momentum period
    this.momentumPeriod = params.momentumPeriod || 12; // 设置 momentumPeriod

    // 动量类型: 'slope' (斜率型，对爆发响应快) 或 'mean' (均值型，适合震荡)
    // Momentum type: 'slope' for fast response, 'mean' for range-bound
    this.momentumType = params.momentumType || 'slope'; // 设置 momentumType

    // 斜率动量回看周期 / Slope momentum lookback
    this.slopeLookback = params.slopeLookback || 3; // 设置 slopeLookback

    // 使用动量确认 / Use momentum confirmation
    this.useMomentumConfirm = params.useMomentumConfirm !== false; // 设置 useMomentumConfirm

    // 使用成交量确认 / Use volume confirmation
    this.useVolumeConfirm = params.useVolumeConfirm !== false; // 设置 useVolumeConfirm

    // 成交量周期 / Volume MA period
    this.volumePeriod = params.volumePeriod || 20; // 设置 volumePeriod

    // 成交量倍数阈值 / Volume spike threshold
    this.volumeThreshold = params.volumeThreshold || 1.3; // 设置 volumeThreshold

    // 止损倍数 (ATR) / Stop loss multiplier (ATR)
    this.stopLossMultiplier = params.stopLossMultiplier || 2.0; // 设置 stopLossMultiplier

    // 内部状态
    this._bandwidthHistory = []; // 设置 _bandwidthHistory
    // _inSqueeze 当前仅用于日志，保留供将来扩展（如 squeeze 持续时间过滤、squeeze 强度建模）
    this._inSqueeze = false; // 设置 _inSqueeze
    this._squeezeStartIndex = null; // 设置 _squeezeStartIndex
    this._entryPrice = null; // 设置 _entryPrice
    this._stopLoss = null; // 设置 _stopLoss
    this._highestPrice = null; // 追踪最高价用于止盈
    this._touchedUpperBand = false; // 是否触及过上轨
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // Bollinger Width 策略只需要 K 线数据 / Bollinger Width strategy only needs kline
    return ['kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    this.log(`Bollinger Width 策略初始化`); // 调用 log
    this.log(`BB周期=${this.bbPeriod}, KC周期=${this.kcPeriod}, 挤压阈值=${this.squeezeThreshold}%`); // 调用 log
  } // 结束代码块

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) { // 执行语句
    // 确保足够数据 / Ensure enough data
    const requiredLength = Math.max(this.bbPeriod, this.kcPeriod, this.momentumPeriod) + 10; // 定义常量 requiredLength
    if (history.length < requiredLength) { // 条件判断 history.length < requiredLength
      return; // 返回结果
    } // 结束代码块

    // 计算指标 / Calculate indicators
    const closes = history.map(h => h.close); // 定义函数 closes

    // 布林带 / Bollinger Bands
    const bbValues = BollingerBands(closes, this.bbPeriod, this.bbStdDev); // 定义常量 bbValues
    if (bbValues.length < 2) return; // 条件判断 bbValues.length < 2

    const currentBB = getLatest(bbValues); // 定义常量 currentBB
    const prevBB = bbValues[bbValues.length - 2]; // 定义常量 prevBB

    // Keltner 通道 / Keltner Channels
    const kcValues = KeltnerChannels(history, this.kcPeriod, this.kcMultiplier); // 定义常量 kcValues
    if (kcValues.length < 2) return; // 条件判断 kcValues.length < 2

    const currentKC = getLatest(kcValues); // 定义常量 currentKC
    const prevKC = kcValues[kcValues.length - 2]; // 定义常量 prevKC

    // ATR
    const atrValues = ATR(history, 14); // 定义常量 atrValues
    const currentATR = getLatest(atrValues); // 定义常量 currentATR

    // 计算带宽 / Calculate bandwidth
    const bandwidth = ((currentBB.upper - currentBB.lower) / currentBB.middle) * 100; // 定义常量 bandwidth
    const prevBandwidth = ((prevBB.upper - prevBB.lower) / prevBB.middle) * 100; // 定义常量 prevBandwidth

    // 更新带宽历史 / Update bandwidth history
    this._bandwidthHistory.push(bandwidth); // 访问 _bandwidthHistory
    if (this._bandwidthHistory.length > this.bandwidthLookback) { // 条件判断 this._bandwidthHistory.length > this.bandwidt...
      this._bandwidthHistory.shift(); // 访问 _bandwidthHistory
    } // 结束代码块

    // 计算带宽百分位 / Calculate bandwidth percentile
    const bandwidthPercentile = this._calculatePercentile(bandwidth, this._bandwidthHistory); // 定义常量 bandwidthPercentile

    // Squeeze 检测 (BB 在 KC 内部) / Squeeze detection
    const squeeze = currentBB.lower > currentKC.lower && currentBB.upper < currentKC.upper; // 定义常量 squeeze
    // 计算前一根 K 线的 squeeze 状态 (修复时间错位问题)
    const prevSqueeze = prevBB.lower > prevKC.lower && prevBB.upper < prevKC.upper; // 定义常量 prevSqueeze

    // 成交量分析 / Volume analysis
    const volumes = history.map(h => h.volume); // 定义函数 volumes
    const volumeMA = this._calculateSMA(volumes, this.volumePeriod); // 定义常量 volumeMA
    const currentVolume = candle.volume; // 定义常量 currentVolume
    // 冷启动防御: 数据不足时默认放行，避免误判
    const volumeSpike = volumes.length < this.volumePeriod // 定义常量 volumeSpike
      ? true  // 冷启动期间放行
      : currentVolume > volumeMA * this.volumeThreshold; // 执行语句

    // 计算动量 / Calculate momentum
    const momentum = this._calculateMomentum(closes, this.momentumPeriod); // 定义常量 momentum
    const prevMomentum = this._calculateMomentum(closes.slice(0, -1), this.momentumPeriod); // 定义常量 prevMomentum

    // 保存指标 / Save indicators
    this.setIndicator('bandwidth', bandwidth); // 调用 setIndicator
    this.setIndicator('bandwidthPercentile', bandwidthPercentile); // 调用 setIndicator
    this.setIndicator('squeeze', squeeze); // 调用 setIndicator
    this.setIndicator('momentum', momentum); // 调用 setIndicator
    this.setIndicator('bbUpper', currentBB.upper); // 调用 setIndicator
    this.setIndicator('bbLower', currentBB.lower); // 调用 setIndicator
    this.setIndicator('bbMiddle', currentBB.middle); // 调用 setIndicator
    this.setIndicator('volumeSpike', volumeSpike); // 调用 setIndicator

    // 冷启动保护: 带宽历史不足时不交易 / Cold start protection
    if (this._bandwidthHistory.length < this.bandwidthLookback * 0.7) { // 条件判断 this._bandwidthHistory.length < this.bandwidt...
      return; // 返回结果
    } // 结束代码块

    // 获取持仓 / Get position
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    // 交易逻辑 / Trading logic
    if (!hasPosition) { // 条件判断 !hasPosition
      this._handleEntry(candle, { // 调用 _handleEntry
        squeeze, // 执行语句
        prevSqueeze, // 执行语句
        bandwidthPercentile, // 执行语句
        bandwidth, // 执行语句
        prevBandwidth, // 执行语句
        momentum, // 执行语句
        prevMomentum, // 执行语句
        currentBB, // 执行语句
        currentATR, // 执行语句
        volumeSpike, // 执行语句
      }); // 结束代码块
    } else { // 执行语句
      this._handleExit(candle, { // 调用 _handleExit
        currentBB, // 执行语句
        currentATR, // 执行语句
        momentum, // 执行语句
      }); // 结束代码块
    } // 结束代码块

    // 更新挤压状态 / Update squeeze state
    if (squeeze && !this._inSqueeze) { // 条件判断 squeeze && !this._inSqueeze
      this._inSqueeze = true; // 设置 _inSqueeze
      this._squeezeStartIndex = history.length; // 设置 _squeezeStartIndex
      this.log(`进入挤压状态, 带宽=${bandwidth.toFixed(2)}%, 百分位=${bandwidthPercentile.toFixed(0)}%`); // 调用 log
    } else if (!squeeze && this._inSqueeze) { // 执行语句
      this._inSqueeze = false; // 设置 _inSqueeze
      const squeezeDuration = history.length - this._squeezeStartIndex; // 定义常量 squeezeDuration
      this.log(`退出挤压状态, 持续=${squeezeDuration}根K线`); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理入场
   * @private
   */
  _handleEntry(candle, indicators) { // 调用 _handleEntry
    const { squeeze, prevSqueeze, bandwidthPercentile, bandwidth, prevBandwidth, momentum, prevMomentum, currentBB, currentATR, volumeSpike } = indicators; // 解构赋值

    // 前置过滤: 必须处于低波动状态 / Must be in low volatility state
    const isLowVolatility = bandwidthPercentile <= this.squeezeThreshold; // 定义常量 isLowVolatility
    if (!isLowVolatility) { // 条件判断 !isLowVolatility
      return; // 返回结果
    } // 结束代码块

    // 条件1: 刚从挤压状态释放 (使用 prevSqueeze 修复时间错位) / Just released from squeeze
    const squeezeRelease = prevSqueeze && !squeeze; // 定义常量 squeezeRelease

    // 条件2: 带宽扩张 (增强条件: 扩张 15% 且连续上升) / Bandwidth expanding
    // 统一从 _bandwidthHistory 获取，确保时间轴对齐
    const len = this._bandwidthHistory.length; // 定义常量 len
    const bw_t1 = len >= 2 ? this._bandwidthHistory[len - 2] : bandwidth; // 定义常量 bw_t1
    const bw_t2 = len >= 3 ? this._bandwidthHistory[len - 3] : bw_t1; // 定义常量 bw_t2
    const bandwidthExpanding = bandwidth > bw_t1 * 1.15 && bw_t1 > bw_t2; // 定义常量 bandwidthExpanding

    // 条件3: 动量确认 / Momentum confirmation
    const momentumBullish = !this.useMomentumConfirm || (momentum > 0 && momentum > prevMomentum); // 定义常量 momentumBullish

    // 条件4: 价格位置 / Price position
    const priceAboveMiddle = candle.close > currentBB.middle; // 定义常量 priceAboveMiddle

    // 条件5: 成交量确认 / Volume confirmation
    const volumeConfirmed = !this.useVolumeConfirm || volumeSpike; // 定义常量 volumeConfirmed

    // 向上突破信号 / Bullish breakout signal
    if ((squeezeRelease || bandwidthExpanding) && momentumBullish && priceAboveMiddle && volumeConfirmed) { // 条件判断 (squeezeRelease || bandwidthExpanding) && mom...
      this.log(`挤压突破做多! 带宽=${bandwidth.toFixed(2)}%, 百分位=${bandwidthPercentile.toFixed(0)}%, 动量=${momentum.toFixed(2)}, 成交量确认=${volumeSpike}`); // 调用 log

      this._entryPrice = candle.close; // 设置 _entryPrice
      this._stopLoss = candle.close - this.stopLossMultiplier * currentATR; // 设置 _stopLoss
      this._highestPrice = candle.close; // 设置 _highestPrice
      this._touchedUpperBand = false; // 设置 _touchedUpperBand

      this.setState('direction', 'long'); // 调用 setState
      this.setState('entryBandwidth', bandwidth); // 调用 setState

      this.setBuySignal(`Squeeze Breakout UP, Bandwidth: ${bandwidth.toFixed(1)}%, Percentile: ${bandwidthPercentile.toFixed(0)}%`); // 调用 setBuySignal
      this.buyPercent(this.symbol, this.positionPercent); // 调用 buyPercent
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理出场
   * @private
   */
  _handleExit(candle, indicators) { // 调用 _handleExit
    const { currentBB, currentATR, momentum } = indicators; // 解构赋值
    const direction = this.getState('direction'); // 定义常量 direction

    if (direction !== 'long') return; // 条件判断 direction !== 'long'

    // 更新最高价追踪 / Update highest price tracking
    if (candle.high > this._highestPrice) { // 条件判断 candle.high > this._highestPrice
      this._highestPrice = candle.high; // 设置 _highestPrice
      // 移动止损: 当价格创新高时，提高止损位 / Trailing stop
      const newStopLoss = this._highestPrice - this.stopLossMultiplier * currentATR; // 定义常量 newStopLoss
      if (newStopLoss > this._stopLoss) { // 条件判断 newStopLoss > this._stopLoss
        this._stopLoss = newStopLoss; // 设置 _stopLoss
      } // 结束代码块
    } // 结束代码块

    // 检查是否触及过上轨 / Check if touched upper band
    if (candle.high >= currentBB.upper) { // 条件判断 candle.high >= currentBB.upper
      this._touchedUpperBand = true; // 设置 _touchedUpperBand
    } // 结束代码块

    // 优先处理趋势型止盈 (避免与止损竞态，让统计归因更准确)
    // Prioritize trend-based TP to avoid race condition with stop loss
    if (this._touchedUpperBand && candle.close < currentBB.upper) { // 条件判断 this._touchedUpperBand && candle.close < curr...
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
      this.log(`触及上轨后回落止盈, 价格=${candle.close.toFixed(2)}, PnL=${pnl}%`); // 调用 log

      this.setSellSignal(`Upper Band Pullback TP @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._resetState(); // 调用 _resetState
      return; // 返回结果
    } // 结束代码块

    // 止损检查 / Stop loss check
    if (candle.close <= this._stopLoss) { // 条件判断 candle.close <= this._stopLoss
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
      this.log(`止损触发, 价格=${candle.close.toFixed(2)}, PnL=${pnl}%`); // 调用 log

      this.setSellSignal(`Stop Loss @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._resetState(); // 调用 _resetState
      return; // 返回结果
    } // 结束代码块

    // 动量反转出场 / Momentum reversal exit
    if (momentum < 0 && candle.close < currentBB.middle) { // 条件判断 momentum < 0 && candle.close < currentBB.middle
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
      this.log(`动量反转出场, 动量=${momentum.toFixed(2)}, PnL=${pnl}%`); // 调用 log

      this.setSellSignal(`Momentum Reversal @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._resetState(); // 调用 _resetState
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算动量
   * @private
   * @param {Array} closes - 收盘价数组
   * @param {number} period - 周期 (用于均值型动量)
   * @returns {number} 动量值
   */
  _calculateMomentum(closes, period) { // 调用 _calculateMomentum
    if (closes.length < Math.max(period, this.slopeLookback + 1)) return 0; // 条件判断 closes.length < Math.max(period, this.slopeLo...

    if (this.momentumType === 'slope') { // 条件判断 this.momentumType === 'slope'
      // 斜率动量: 对 squeeze 爆发响应更快
      // Slope momentum: faster response to squeeze breakout
      const currentPrice = closes[closes.length - 1]; // 定义常量 currentPrice
      const pastPrice = closes[closes.length - 1 - this.slopeLookback]; // 定义常量 pastPrice
      // 标准化为百分比变化
      return ((currentPrice - pastPrice) / pastPrice) * 100; // 返回结果
    } else { // 执行语句
      // 均值型动量: 适合震荡市场
      // Mean-reversion momentum: good for range-bound markets
      const recent = closes.slice(-period); // 定义常量 recent
      const sma = recent.reduce((a, b) => a + b, 0) / period; // 定义函数 sma
      const currentPrice = closes[closes.length - 1]; // 定义常量 currentPrice
      return ((currentPrice - sma) / sma) * 100; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算百分位
   * @private
   */
  _calculatePercentile(value, history) { // 调用 _calculatePercentile
    if (history.length < 5) return 50; // 条件判断 history.length < 5

    const sorted = [...history].sort((a, b) => a - b); // 定义函数 sorted
    let rank = 0; // 定义变量 rank
    for (let i = 0; i < sorted.length; i++) { // 循环 let i = 0; i < sorted.length; i++
      if (sorted[i] <= value) rank++; // 条件判断 sorted[i] <= value
    } // 结束代码块
    return (rank / sorted.length) * 100; // 返回结果
  } // 结束代码块

  /**
   * 计算简单移动平均
   * @private
   */
  _calculateSMA(values, period) { // 调用 _calculateSMA
    if (values.length < period) return values[values.length - 1] || 0; // 条件判断 values.length < period
    const recent = values.slice(-period); // 定义常量 recent
    return recent.reduce((a, b) => a + b, 0) / period; // 返回结果
  } // 结束代码块

  /**
   * 重置状态
   * @private
   */
  _resetState() { // 调用 _resetState
    this._entryPrice = null; // 设置 _entryPrice
    this._stopLoss = null; // 设置 _stopLoss
    this._highestPrice = null; // 设置 _highestPrice
    this._touchedUpperBand = false; // 设置 _touchedUpperBand
    this._inSqueeze = false; // 设置 _inSqueeze
    this._squeezeStartIndex = null; // 设置 _squeezeStartIndex
    this.setState('direction', null); // 调用 setState
    this.setState('entryBandwidth', null); // 调用 setState
  } // 结束代码块
} // 结束代码块

export default BollingerWidthStrategy; // 默认导出
