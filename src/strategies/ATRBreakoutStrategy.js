/**
 * ATR 波动突破策略
 * ATR Breakout Strategy
 *
 * 基于 ATR 动态通道的突破策略
 * 适合捕捉大行情启动，与趋势类指标相关性低
 */

import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js
import { ATR, EMA, SMA, getLatest } from '../utils/indicators.js'; // 导入模块 ../utils/indicators.js

/**
 * ATR 波动突破策略类
 * ATR Breakout Strategy Class
 */
export class ATRBreakoutStrategy extends BaseStrategy { // 导出类 ATRBreakoutStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) { // 构造函数
    super({ // 调用父类
      name: 'ATRBreakoutStrategy', // 设置 name 字段
      ...params, // 展开对象或数组
    }); // 结束代码块

    // ATR 周期 / ATR period
    this.atrPeriod = params.atrPeriod || 14; // 设置 atrPeriod

    // ATR 通道倍数 / ATR channel multiplier
    this.atrMultiplier = params.atrMultiplier || 1.8; // 设置 atrMultiplier

    // 基准线周期 (EMA) / Baseline period (EMA)
    this.baselinePeriod = params.baselinePeriod || 20; // 设置 baselinePeriod

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95; // 设置 positionPercent

    // 止损 ATR 倍数 / Stop loss ATR multiplier
    this.stopLossMultiplier = params.stopLossMultiplier || 1.5; // 设置 stopLossMultiplier

    // 跟踪止损开启 / Enable trailing stop
    this.useTrailingStop = params.useTrailingStop !== false; // 设置 useTrailingStop

    // 跟踪止损 ATR 倍数 / Trailing stop ATR multiplier
    this.trailingMultiplier = params.trailingMultiplier || 2.5; // 设置 trailingMultiplier

    // 突破确认 K 线数 / Breakout confirmation candles
    this.confirmationCandles = params.confirmationCandles || 1; // 设置 confirmationCandles

    // ATR 扩张阈值 / ATR expansion threshold
    this.atrExpansionThreshold = params.atrExpansionThreshold || 0.05; // 设置 atrExpansionThreshold

    // ATR 平滑周期 / ATR smoothing period
    this.atrSmaPeriod = params.atrSmaPeriod || 5; // 设置 atrSmaPeriod

    // 利润回吐保护 ATR 倍数 / Profit drawdown protection ATR multiplier
    this.profitProtectionMultiplier = params.profitProtectionMultiplier || 1.8; // 设置 profitProtectionMultiplier

    // 时间止损 K 线数 / Time stop candles
    this.timeStopCandles = params.timeStopCandles || 30; // 设置 timeStopCandles

    // 最小 ATR 波动率比例 (CTA 绝对波动过滤) / Minimum ATR ratio filter
    this.minAtrRatio = params.minAtrRatio || 0.004; // 设置 minAtrRatio

    // 内部状态 / Internal state
    this._breakoutHigh = null; // 设置 _breakoutHigh
    this._breakoutLow = null; // 设置 _breakoutLow
    this._entryPrice = null; // 设置 _entryPrice
    this._stopLoss = null; // 设置 _stopLoss
    this._trailingStop = null; // 设置 _trailingStop
    this._highestSinceEntry = null; // 设置 _highestSinceEntry
    this._lowestSinceEntry = null; // 设置 _lowestSinceEntry
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // ATR 突破策略只需要 K 线数据 / ATR Breakout strategy only needs kline
    return ['kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    this.log(`ATR突破策略初始化`); // 调用 log
    this.log(`参数: ATR周期=${this.atrPeriod}, 倍数=${this.atrMultiplier}, 基准线=${this.baselinePeriod}`); // 调用 log
  } // 结束代码块

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) { // 执行语句
    // 确保有足够数据 / Ensure enough data
    const requiredLength = Math.max(this.atrPeriod, this.baselinePeriod) + 5; // 定义常量 requiredLength
    if (history.length < requiredLength) { // 条件判断 history.length < requiredLength
      return; // 返回结果
    } // 结束代码块

    // 计算指标 / Calculate indicators
    const closes = history.map(h => h.close); // 定义函数 closes
    const atrValues = ATR(history, this.atrPeriod); // 定义常量 atrValues
    const emaValues = EMA(closes, this.baselinePeriod); // 定义常量 emaValues

    if (atrValues.length < 2 || emaValues.length < 2) { // 条件判断 atrValues.length < 2 || emaValues.length < 2
      return; // 返回结果
    } // 结束代码块

    // 获取当前值 / Get current values
    const currentATR = getLatest(atrValues); // 定义常量 currentATR
    const currentEMA = getLatest(emaValues); // 定义常量 currentEMA
    const prevEMA = emaValues[emaValues.length - 2]; // 定义常量 prevEMA
    const prevATR = atrValues[atrValues.length - 2]; // 定义常量 prevATR

    // 计算 ATR 的 SMA 用于波动率扩张判断 / Calculate ATR SMA for volatility expansion
    const atrSmaValues = SMA(atrValues, this.atrSmaPeriod); // 定义常量 atrSmaValues
    const atrSma = atrSmaValues.length > 0 ? getLatest(atrSmaValues) : currentATR; // 定义常量 atrSma

    // 使用「上一根 EMA + 上一根 ATR」作为突破基准（标准 CTA 做法）
    // Use previous EMA + previous ATR as breakout baseline (standard CTA approach)
    // 避免当根大波动 K 线同时放大 EMA 和 ATR，导致通道被推远
    const upperBand = prevEMA + this.atrMultiplier * prevATR; // 定义常量 upperBand
    const lowerBand = prevEMA - this.atrMultiplier * prevATR; // 定义常量 lowerBand

    // 计算 ATR 变化率 (波动率扩张检测) / ATR rate of change
    const atrChange = (currentATR - prevATR) / prevATR; // 定义常量 atrChange

    // ATR 相对价格的比例（绝对波动过滤）/ ATR ratio to price (absolute volatility filter)
    const atrRatio = currentATR / candle.close; // 定义常量 atrRatio

    // 波动率扩张确认：ATR 变化超过阈值 且 ATR 高于其 SMA 且 绝对波动足够
    // Volatility expansion: ATR change > threshold AND ATR > ATR SMA AND sufficient absolute volatility
    const volatilityExpanding = // 定义常量 volatilityExpanding
      atrChange > this.atrExpansionThreshold && // 执行语句
      currentATR > atrSma && // 执行语句
      atrRatio > this.minAtrRatio; // 执行语句

    // 保存指标 / Save indicators
    this.setIndicator('ATR', currentATR); // 调用 setIndicator
    this.setIndicator('EMA', currentEMA); // 调用 setIndicator
    this.setIndicator('prevEMA', prevEMA); // 调用 setIndicator
    this.setIndicator('upperBand', upperBand); // 调用 setIndicator
    this.setIndicator('lowerBand', lowerBand); // 调用 setIndicator
    this.setIndicator('atrChange', atrChange); // 调用 setIndicator
    this.setIndicator('atrSma', atrSma); // 调用 setIndicator
    this.setIndicator('atrRatio', atrRatio); // 调用 setIndicator
    this.setIndicator('volatilityExpanding', volatilityExpanding); // 调用 setIndicator

    // 获取持仓 / Get position
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    if (!hasPosition) { // 条件判断 !hasPosition
      // 无仓位，寻找突破机会 / No position, look for breakout
      this._handleEntry(candle, history, upperBand, lowerBand, currentATR, volatilityExpanding); // 调用 _handleEntry
    } else { // 执行语句
      // 有仓位，管理止损 / Has position, manage stop loss
      this._handleExit(candle, currentATR, currentEMA, prevEMA); // 调用 _handleExit
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理入场逻辑
   * @private
   */
  _handleEntry(candle, history, upperBand, lowerBand, atr, volatilityExpanding) { // 调用 _handleEntry
    // 获取前几根K线用于确认 / Get previous candles for confirmation
    const lookback = this.confirmationCandles + 1; // 定义常量 lookback
    const recentCandles = history.slice(-lookback); // 定义常量 recentCandles

    // 真正的 N 根确认：前 N 根都在通道内，当前根突破
    // True N-candle confirmation: previous N candles inside channel, current breaks out
    const prevCandles = recentCandles.slice(0, -1); // 不包含当前 K 线

    // 向上突破确认：前 N 根收盘价都在上轨下方，当前收盘价或最高价突破上轨
    // Upward breakout: previous N closes below upper band, current close OR high breaks above
    const confirmedUp = // 定义常量 confirmedUp
      prevCandles.every(c => c.close < upperBand) && // 调用 prevCandles.every
      (candle.close > upperBand || candle.high > upperBand); // 执行语句

    // 向下突破确认：前 N 根收盘价都在下轨上方，当前收盘价或最低价突破下轨
    // Downward breakout: previous N closes above lower band, current close OR low breaks below
    const confirmedDown = // 定义常量 confirmedDown
      prevCandles.every(c => c.close > lowerBand) && // 调用 prevCandles.every
      (candle.close < lowerBand || candle.low < lowerBand); // 执行语句

    if (confirmedUp && volatilityExpanding) { // 条件判断 confirmedUp && volatilityExpanding
      // 向上突破，做多 / Upward breakout, go long
      this.log(`向上突破! 价格=${candle.close.toFixed(2)}, 上轨=${upperBand.toFixed(2)}, ATR=${atr.toFixed(2)}, 确认K线=${this.confirmationCandles}`); // 调用 log

      this._entryPrice = candle.close; // 设置 _entryPrice
      this._stopLoss = candle.close - this.stopLossMultiplier * atr; // 设置 _stopLoss
      this._trailingStop = this._stopLoss; // 设置 _trailingStop
      this._highestSinceEntry = candle.high; // 设置 _highestSinceEntry

      this.setState('direction', 'long'); // 调用 setState
      this.setState('entryATR', atr); // 调用 setState
      this.setState('barsSinceEntry', 0); // 调用 setState

      this.setBuySignal(`ATR Breakout UP @ ${candle.close.toFixed(2)}`); // 调用 setBuySignal
      this.buyPercent(this.symbol, this.positionPercent); // 调用 buyPercent

    } else if (confirmedDown && volatilityExpanding) { // 执行语句
      // 向下突破（如支持做空）/ Downward breakout (if short supported)
      this.log(`向下突破信号 (仅记录) 价格=${candle.close.toFixed(2)}, 下轨=${lowerBand.toFixed(2)}`); // 调用 log
      // 当前仅做多，记录信号用于分析
      this.setIndicator('shortSignal', true); // 调用 setIndicator
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理出场逻辑
   * @private
   */
  _handleExit(candle, atr, ema, prevEMA) { // 调用 _handleExit
    const direction = this.getState('direction'); // 定义常量 direction
    const entryATR = this.getState('entryATR') || atr; // 定义常量 entryATR

    // 更新持仓 K 线计数 / Update bars since entry
    const barsSinceEntry = (this.getState('barsSinceEntry') || 0) + 1; // 定义常量 barsSinceEntry
    this.setState('barsSinceEntry', barsSinceEntry); // 调用 setState

    if (direction === 'long') { // 条件判断 direction === 'long'
      // 更新最高价 / Update highest price
      if (candle.high > this._highestSinceEntry) { // 条件判断 candle.high > this._highestSinceEntry
        this._highestSinceEntry = candle.high; // 设置 _highestSinceEntry

        // 更新跟踪止损 / Update trailing stop
        if (this.useTrailingStop) { // 条件判断 this.useTrailingStop
          const newTrailingStop = this._highestSinceEntry - this.trailingMultiplier * atr; // 定义常量 newTrailingStop
          if (newTrailingStop > this._trailingStop) { // 条件判断 newTrailingStop > this._trailingStop
            this._trailingStop = newTrailingStop; // 设置 _trailingStop
            this.log(`跟踪止损更新: ${this._trailingStop.toFixed(2)}`); // 调用 log
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      // 检查止损 / Check stop loss
      const effectiveStop = this.useTrailingStop ? // 定义常量 effectiveStop
        Math.max(this._stopLoss, this._trailingStop) : this._stopLoss; // 调用 Math.max

      // 1. 常规止损检查 / Regular stop loss check
      if (candle.close <= effectiveStop) { // 条件判断 candle.close <= effectiveStop
        const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
        this.log(`止损触发! 价格=${candle.close.toFixed(2)}, 止损=${effectiveStop.toFixed(2)}, PnL=${pnl}%`); // 调用 log

        this.setSellSignal(`Stop Loss @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
        this._resetState(); // 调用 _resetState
        return; // 返回结果
      } // 结束代码块

      // 2. 利润回吐保护（延迟启用，避免趋势初期被掐掉）
      // Profit drawdown protection (delayed activation to avoid cutting early trend)
      const drawdownFromHigh = this._highestSinceEntry - candle.close; // 定义常量 drawdownFromHigh
      const profitDrawdownThreshold = entryATR * this.profitProtectionMultiplier; // 定义常量 profitDrawdownThreshold

      if ( // 条件判断 
        barsSinceEntry > 5 && // 延迟 5 根 K 线后才启用
        this._highestSinceEntry > this._entryPrice && // 曾经盈利
        drawdownFromHigh > profitDrawdownThreshold // 执行语句
      ) { // 执行语句
        const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
        this.log(`利润大幅回吐，保护性出场! 最高=${this._highestSinceEntry.toFixed(2)}, 当前=${candle.close.toFixed(2)}, 回吐=${drawdownFromHigh.toFixed(2)}, PnL=${pnl}%`); // 调用 log

        this.setSellSignal(`Profit Protection @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
        this._resetState(); // 调用 _resetState
        return; // 返回结果
      } // 结束代码块

      // 3. 时间止损 / Time stop
      if ( // 条件判断 
        barsSinceEntry > this.timeStopCandles && // 执行语句
        candle.close < this._entryPrice // 执行语句
      ) { // 执行语句
        const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
        this.log(`长时间未走出利润，时间止损! K线数=${barsSinceEntry}, PnL=${pnl}%`); // 调用 log

        this.setSellSignal(`Time Stop @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
        this._resetState(); // 调用 _resetState
        return; // 返回结果
      } // 结束代码块

      // 4. 趋势失败确认出场（EMA 拐头 + 价格跌破 EMA）
      // Trend failure exit (EMA turning down + price below EMA)
      if ( // 条件判断 
        barsSinceEntry > 5 && // 执行语句
        candle.close < ema && // 执行语句
        ema < prevEMA // EMA 已经拐头向下
      ) { // 执行语句
        const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
        this.log(`趋势失败确认出场, 价格=${candle.close.toFixed(2)}, EMA=${ema.toFixed(2)}, prevEMA=${prevEMA.toFixed(2)}, PnL=${pnl}%`); // 调用 log

        this.setSellSignal(`Trend Failure @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
        this._resetState(); // 调用 _resetState
        return; // 返回结果
      } // 结束代码块

      // 5. 趋势确认后加仓（一次性）
      // Add position after trend confirmation (one-time)
      if ( // 条件判断 
        barsSinceEntry === 3 && // 赋值 barsSinceEntry
        candle.close > this._entryPrice + entryATR && // 执行语句
        !this.getState('added') // 执行语句
      ) { // 执行语句
        this.log(`趋势确认，加仓 30%! 当前价=${candle.close.toFixed(2)}, 入场价=${this._entryPrice.toFixed(2)}`); // 调用 log
        this.buyPercent(this.symbol, 30); // 调用 buyPercent
        this.setState('added', true); // 调用 setState
      } // 结束代码块

      // 保存当前止损位 / Save current stop level
      this.setIndicator('stopLoss', effectiveStop); // 调用 setIndicator
      this.setIndicator('barsSinceEntry', barsSinceEntry); // 调用 setIndicator
    } // 结束代码块
  } // 结束代码块

  /**
   * 重置状态
   * @private
   */
  _resetState() { // 调用 _resetState
    this._entryPrice = null; // 设置 _entryPrice
    this._stopLoss = null; // 设置 _stopLoss
    this._trailingStop = null; // 设置 _trailingStop
    this._highestSinceEntry = null; // 设置 _highestSinceEntry
    this._lowestSinceEntry = null; // 设置 _lowestSinceEntry
    this.setState('direction', null); // 调用 setState
    this.setState('entryATR', null); // 调用 setState
    this.setState('barsSinceEntry', null); // 调用 setState
    this.setState('added', null); // 调用 setState
  } // 结束代码块
} // 结束代码块

export default ATRBreakoutStrategy; // 默认导出
