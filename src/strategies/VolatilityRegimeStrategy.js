/**
 * 波动率Regime 切换策略
 * Volatility Regime Strategy
 *
 * 识别市场高低波动率状态，根据不同 Regime 采用不同交易逻辑
 * - 低波动期：等待突破，蓄势待发
 * - 高波动期：趋势跟踪，顺势而为
 * - 过渡期：谨慎操作，控制仓位
 */

import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js
import { ATR, EMA, SMA, ADX, getLatest } from '../utils/indicators.js'; // 导入模块 ../utils/indicators.js

/**
 * 波动率状态枚举
 */
const VolatilityRegime = { // 定义常量 VolatilityRegime
  LOW: 'low',           // 最低
  NORMAL: 'normal',     // NORMAL
  HIGH: 'high',         // 最高
  EXTREME: 'extreme',   // 极端
}; // 结束代码块

/**
 * 波动率Regime 策略类
 */
export class VolatilityRegimeStrategy extends BaseStrategy { // 导出类 VolatilityRegimeStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) { // 构造函数
    super({ // 调用父类
      name: 'VolatilityRegimeStrategy', // name
      ...params, // 展开对象或数组
    }); // 结束代码块

    // ATR 周期 / ATR period
    this.atrPeriod = params.atrPeriod ?? 14; // 设置 atrPeriod

    // 波动率历史周期 / Volatility history lookback
    this.volatilityLookback = params.volatilityLookback ?? 100; // 设置 volatilityLookback

    // 低波动阈值(百分位) / Low volatility threshold
    this.lowVolThreshold = params.lowVolThreshold ?? 25; // 设置 lowVolThreshold

    // 高波动阈值(百分位) / High volatility threshold
    this.highVolThreshold = params.highVolThreshold ?? 75; // 设置 highVolThreshold

    // 极端波动阈值(百分位) / Extreme volatility threshold
    this.extremeVolThreshold = params.extremeVolThreshold ?? 95; // 设置 extremeVolThreshold

    // 趋势均线周期 / Trend MA periods
    this.fastMAPeriod = params.fastMAPeriod ?? 10; // 设置 fastMAPeriod
    this.slowMAPeriod = params.slowMAPeriod ?? 30; // 设置 slowMAPeriod

    // ADX 周期和阈值 / ADX period and threshold
    this.adxPeriod = params.adxPeriod ?? 14; // 设置 adxPeriod
    this.adxThreshold = params.adxThreshold ?? 25; // 设置 adxThreshold

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 基础仓位百分比 / Base position percentage
    this.basePositionPercent = params.positionPercent ?? 95; // 设置 basePositionPercent

    // 低波动期仓位调整 / Low volatility position adjustment
    this.lowVolPositionMult = params.lowVolPositionMult ?? 0.5; // 设置 lowVolPositionMult

    // 高波动期仓位调整 / High volatility position adjustment
    this.highVolPositionMult = params.highVolPositionMult ?? 0.8; // 设置 highVolPositionMult

    // 极端波动禁止交易 / Disable trading in extreme volatility
    this.disableInExtreme = params.disableInExtreme !== false; // 设置 disableInExtreme

    // 止损 ATR 倍数 / Stop loss ATR multiplier
    this.stopLossMultiplier = params.stopLossMultiplier ?? 2.0; // 设置 stopLossMultiplier

    // ATR breakout params
    this.atrBreakoutLookback = params.atrBreakoutLookback ?? 20; // 设置 atrBreakoutLookback
    this.atrBreakoutMultiplier = params.atrBreakoutMultiplier ?? 1.0; // 设置 atrBreakoutMultiplier

    // Regime confirmation bars
    this._regimeConfirmBars = params.regimeConfirmBars ?? 3; // 设置 _regimeConfirmBars

    // 内部状态
    this._atrHistory = []; // 设置 _atrHistory
    this._currentRegime = VolatilityRegime.NORMAL; // 设置 _currentRegime
    this._prevRegime = VolatilityRegime.NORMAL; // 设置 _prevRegime
    this._entryPrice = null; // 设置 _entryPrice
    this._stopLoss = null; // 设置 _stopLoss
    this._highestPrice = null; // 设置 _highestPrice
    this._regimeCandidate = null; // 设置 _regimeCandidate
    this._regimeCandidateCount = 0; // 设置 _regimeCandidateCount
    this._regimeChanges = 0; // 设置 _regimeChanges
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 波动率Regime 策略只需要 K 线数据 / Volatility Regime strategy only needs kline
    return ['kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    this.log(`波动率Regime策略初始化`); // 调用 log
    this.log(`ATR=${this.atrPeriod}, 低阈值${this.lowVolThreshold}%, 高阈值${this.highVolThreshold}%`); // 调用 log
  } // 结束代码块

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) { // 执行语句
    // 确保足够数据 / Ensure enough data
    const requiredLength = Math.max( // 定义常量 requiredLength
      this.atrPeriod, // 访问 atrPeriod
      this.slowMAPeriod, // 访问 slowMAPeriod
      this.adxPeriod, // 访问 adxPeriod
      this.atrBreakoutLookback + 2, // 访问 atrBreakoutLookback
      50 // 执行语句
    ); // 结束调用或参数
    if (history.length < requiredLength) { // 条件判断 history.length < requiredLength
      return; // 返回结果
    } // 结束代码块

    // 计算指标 / Calculate indicators
    const closes = history.map(h => h.close); // 定义函数 closes

    // ATR
    const atrValues = ATR(history, this.atrPeriod); // 定义常量 atrValues
    if (atrValues.length < 2) return; // 条件判断 atrValues.length < 2
    const currentATR = getLatest(atrValues); // 定义常量 currentATR
    const prevATR = atrValues.length > 1 ? atrValues[atrValues.length - 2] : currentATR; // 定义常量 prevATR

    // 归一化ATR (ATR / 价格) / Normalized ATR
    const normalizedATR = (currentATR / candle.close) * 100; // 定义常量 normalizedATR

    // 更新 ATR 历史 / Update ATR history
    this._atrHistory.push(normalizedATR); // 访问 _atrHistory
    if (this._atrHistory.length > this.volatilityLookback) { // 条件判断 this._atrHistory.length > this.volatilityLook...
      this._atrHistory.shift(); // 访问 _atrHistory
    } // 结束代码块

    // 计算波动率百分位 / Calculate volatility percentile
    const volPercentile = this._calculatePercentile(normalizedATR, this._atrHistory); // 定义常量 volPercentile

    // 确定当前 Regime / Determine current regime
    this._prevRegime = this._currentRegime; // 设置 _prevRegime
    const newRegime = this._determineRegime(volPercentile); // 定义常量 newRegime
    if (newRegime !== this._currentRegime) { // 条件判断 newRegime !== this._currentRegime
      if (this._regimeCandidate === newRegime) { // 条件判断 this._regimeCandidate === newRegime
        this._regimeCandidateCount += 1; // 访问 _regimeCandidateCount
      } else { // 执行语句
        this._regimeCandidate = newRegime; // 设置 _regimeCandidate
        this._regimeCandidateCount = 1; // 设置 _regimeCandidateCount
      } // 结束代码块

      if (this._regimeCandidateCount >= this._regimeConfirmBars) { // 条件判断 this._regimeCandidateCount >= this._regimeCon...
        this._currentRegime = newRegime; // 设置 _currentRegime
        this._regimeCandidate = null; // 设置 _regimeCandidate
        this._regimeCandidateCount = 0; // 设置 _regimeCandidateCount
      } // 结束代码块
    } else { // 执行语句
      this._regimeCandidate = null; // 设置 _regimeCandidate
      this._regimeCandidateCount = 0; // 设置 _regimeCandidateCount
    } // 结束代码块

    const entryRegime = this._regimeCandidate || this._currentRegime; // 定义常量 entryRegime

    // 移动平均线 / Moving averages
    const fastMAValues = EMA(closes, this.fastMAPeriod); // 定义常量 fastMAValues
    const fastMA = getLatest(fastMAValues); // 定义常量 fastMA
    const prevFastMA = fastMAValues.length > 1 ? fastMAValues[fastMAValues.length - 2] : fastMA; // 定义常量 prevFastMA
    const slowMA = getLatest(SMA(closes, this.slowMAPeriod)); // 定义常量 slowMA
    const emaSlope = fastMA - prevFastMA; // 定义常量 emaSlope
    const emaSlopeUp = emaSlope > 0; // 定义常量 emaSlopeUp

    // ADX 趋势强度 / ADX trend strength
    const adxValues = ADX(history, this.adxPeriod); // 定义常量 adxValues
    const currentADX = adxValues.length > 0 ? getLatest(adxValues) : null; // 定义常量 currentADX
    const adxValue = currentADX ? currentADX.adx : 0; // 定义常量 adxValue
    const pdi = currentADX ? currentADX.pdi : 0; // 定义常量 pdi
    const mdi = currentADX ? currentADX.mdi : 0; // 定义常量 mdi

    // 趋势方向 / Trend direction
    const trendUp = fastMA > slowMA && pdi > mdi; // 定义常量 trendUp
    const maDeadCross = fastMA < slowMA; // 定义常量 maDeadCross
    const diReversal = pdi < mdi; // 定义常量 diReversal
    const strongTrend = adxValue > this.adxThreshold; // 定义常量 strongTrend

    const atrBreakoutHigh = this._getAtrBreakoutHigh(history); // 定义常量 atrBreakoutHigh
    const atrBreakout = // 定义常量 atrBreakout
      atrBreakoutHigh !== null && // 执行语句
      candle.close > atrBreakoutHigh + prevATR * this.atrBreakoutMultiplier; // 执行语句
    const lowBreakoutTriggered = // 定义常量 lowBreakoutTriggered
      atrBreakoutHigh !== null && // 执行语句
      candle.high > atrBreakoutHigh + prevATR * this.atrBreakoutMultiplier; // 执行语句
    const lowBreakoutConfirmed = atrBreakoutHigh !== null && candle.close > atrBreakoutHigh; // 定义常量 lowBreakoutConfirmed
    const lowBreakout = lowBreakoutTriggered && lowBreakoutConfirmed; // 定义常量 lowBreakout

    // 保存指标 / Save indicators
    this.setIndicator('ATR', currentATR); // 调用 setIndicator
    this.setIndicator('normalizedATR', normalizedATR); // 调用 setIndicator
    this.setIndicator('volPercentile', volPercentile); // 调用 setIndicator
    this.setIndicator('regime', this._currentRegime); // 调用 setIndicator
    this.setIndicator('entryRegime', entryRegime); // 调用 setIndicator
    this.setIndicator('fastMA', fastMA); // 调用 setIndicator
    this.setIndicator('prevFastMA', prevFastMA); // 调用 setIndicator
    this.setIndicator('emaSlope', emaSlope); // 调用 setIndicator
    this.setIndicator('slowMA', slowMA); // 调用 setIndicator
    this.setIndicator('ADX', adxValue); // 调用 setIndicator
    this.setIndicator('atrBreakoutHigh', atrBreakoutHigh); // 调用 setIndicator
    this.setIndicator('atrBreakout', atrBreakout); // 调用 setIndicator
    this.setIndicator('lowBreakout', lowBreakout); // 调用 setIndicator

    // 检测Regime 变化 / Detect regime change
    if (this._currentRegime !== this._prevRegime) { // 条件判断 this._currentRegime !== this._prevRegime
      this._regimeChanges++; // 访问 _regimeChanges
      this.log(`Regime切换: ${this._prevRegime} -> ${this._currentRegime}, 波动百分位${volPercentile.toFixed(0)}%`); // 调用 log
    } // 结束代码块

    // 获取持仓 / Get position
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && Math.abs(position.amount) > 0; // 定义常量 hasPosition

    // 根据不同 Regime 执行策略 / Execute strategy based on regime
    if (!hasPosition) { // 条件判断 !hasPosition
      this._handleEntry(candle, { // 调用 _handleEntry
        regime: entryRegime, // 状态
        volPercentile, // 执行语句
        trendUp, // 执行语句
        strongTrend, // 执行语句
        currentATR, // 执行语句
        emaSlope, // 执行语句
        emaSlopeUp, // 执行语句
        atrBreakout, // 执行语句
        lowBreakout, // 执行语句
        fastMA, // 执行语句
        slowMA, // 执行语句
      }); // 结束代码块
    } else { // 执行语句
      this._handleExit(candle, { // 调用 _handleExit
        regime: this._currentRegime, // 状态
        currentATR, // 执行语句
        maDeadCross, // 执行语句
        diReversal, // 执行语句
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 确定波动率Regime
   * @private
   */
  _determineRegime(percentile) { // 调用 _determineRegime
    if (percentile >= this.extremeVolThreshold) { // 条件判断 percentile >= this.extremeVolThreshold
      return VolatilityRegime.EXTREME; // 返回结果
    } else if (percentile >= this.highVolThreshold) { // 执行语句
      return VolatilityRegime.HIGH; // 返回结果
    } else if (percentile <= this.lowVolThreshold) { // 执行语句
      return VolatilityRegime.LOW; // 返回结果
    } else { // 执行语句
      return VolatilityRegime.NORMAL; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理入场
   * @private
   */
  _handleEntry(candle, indicators) { // 调用 _handleEntry
    const { // 解构赋值
      regime, // 执行语句
      volPercentile, // 执行语句
      trendUp, // 执行语句
      strongTrend, // 执行语句
      currentATR, // 执行语句
      emaSlopeUp, // 执行语句
      atrBreakout, // 执行语句
      lowBreakout, // 执行语句
    } = indicators; // 执行语句

    // No entry in extreme volatility when disabled.
    if (regime === VolatilityRegime.EXTREME && this.disableInExtreme) { // 条件判断 regime === VolatilityRegime.EXTREME && this.d...
      this.log(`Extreme volatility, entry disabled. Percentile=${volPercentile.toFixed(0)}%`); // 调用 log
      return; // 返回结果
    } // 结束代码块

    let signal = false; // 定义变量 signal
    let reason = ''; // 定义变量 reason
    let positionPercent = this.basePositionPercent; // 定义变量 positionPercent

    if (regime === VolatilityRegime.LOW) { // 条件判断 regime === VolatilityRegime.LOW
      positionPercent *= this.lowVolPositionMult; // 执行语句
    } else if (regime === VolatilityRegime.HIGH) { // 执行语句
      positionPercent *= this.highVolPositionMult; // 执行语句
    } else if (regime === VolatilityRegime.EXTREME) { // 执行语句
      positionPercent *= 0.3; // 执行语句
    } // 结束代码块

    if (regime === VolatilityRegime.LOW && lowBreakout && trendUp && emaSlopeUp) { // 条件判断 regime === VolatilityRegime.LOW && lowBreakou...
      signal = true; // 赋值 signal
      reason = 'Low volatility breakout entry'; // 赋值 reason
    } // 结束代码块

    if (!signal) { // 条件判断 !signal
      switch (regime) { // 分支选择 regime
        case VolatilityRegime.LOW: // 分支 VolatilityRegime.LOW
          // Entry handled above for LOW regime.
          break; // 跳出循环或分支

        case VolatilityRegime.NORMAL: // 分支 VolatilityRegime.NORMAL
          if (trendUp && strongTrend) { // 条件判断 trendUp && strongTrend
            signal = true; // 赋值 signal
            reason = 'Normal regime trend entry'; // 赋值 reason
          } // 结束代码块
          break; // 跳出循环或分支

        case VolatilityRegime.HIGH: // 分支 VolatilityRegime.HIGH
          if (atrBreakout && trendUp && strongTrend && emaSlopeUp) { // 条件判断 atrBreakout && trendUp && strongTrend && emaS...
            signal = true; // 赋值 signal
            reason = 'High volatility ATR breakout'; // 赋值 reason
          } // 结束代码块
          break; // 跳出循环或分支

        case VolatilityRegime.EXTREME: // 分支 VolatilityRegime.EXTREME
          if (!this.disableInExtreme && atrBreakout && trendUp && strongTrend && emaSlopeUp) { // 条件判断 !this.disableInExtreme && atrBreakout && tren...
            signal = true; // 赋值 signal
            reason = 'Extreme volatility ATR breakout'; // 赋值 reason
          } // 结束代码块
          break; // 跳出循环或分支
      } // 结束代码块
    } // 结束代码块

    if (signal) { // 条件判断 signal
      this.log(`${reason}, Regime=${regime}, position=${positionPercent.toFixed(0)}%`); // 调用 log

      this._entryPrice = candle.close; // 设置 _entryPrice
      this._stopLoss = candle.close - this.stopLossMultiplier * currentATR; // 设置 _stopLoss
      this._highestPrice = candle.high; // 设置 _highestPrice

      this.setState('direction', 'long'); // 调用 setState
      this.setState('entryRegime', regime); // 调用 setState
      this.setState('entryVolPercentile', volPercentile); // 调用 setState

      this.setBuySignal(`${reason}`); // 调用 setBuySignal
      this.buyPercent(this.symbol, positionPercent); // 调用 buyPercent
    } // 结束代码块
  } // 结束代码块
  /**
   * 处理出场
   * @private
   */
  _handleExit(candle, indicators) { // 调用 _handleExit
    const { regime, currentATR, maDeadCross, diReversal } = indicators; // 解构赋值
    const direction = this.getState('direction'); // 定义常量 direction

    if (direction !== 'long') return; // 条件判断 direction !== 'long'
    // Trailing stop loss adjustment.
    if (this._highestPrice === null) { // 条件判断 this._highestPrice === null
      this._highestPrice = candle.high; // 设置 _highestPrice
    } else if (candle.high > this._highestPrice) { // 执行语句
      this._highestPrice = candle.high; // 设置 _highestPrice
    } // 结束代码块

    let effectiveStopMult = this.stopLossMultiplier; // 定义变量 effectiveStopMult
    if (regime === VolatilityRegime.HIGH || regime === VolatilityRegime.EXTREME) { // 条件判断 regime === VolatilityRegime.HIGH || regime ==...
      effectiveStopMult = this.stopLossMultiplier * 1.5; // 赋值 effectiveStopMult
    } // 结束代码块

    const trailingStop = this._highestPrice - effectiveStopMult * currentATR; // 定义常量 trailingStop
    if (this._stopLoss === null) { // 条件判断 this._stopLoss === null
      this._stopLoss = trailingStop; // 设置 _stopLoss
    } else { // 执行语句
      this._stopLoss = Math.max(this._stopLoss, trailingStop); // 设置 _stopLoss
    } // 结束代码块
    const effectiveStop = this._stopLoss; // 定义常量 effectiveStop

    // 止损检查 / Stop loss check
    if (candle.close <= effectiveStop) { // 条件判断 candle.close <= effectiveStop
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
      this.log(`止损触发, Regime=${regime}, 价格=${candle.close.toFixed(2)}, PnL=${pnl}%`); // 调用 log

      this.setSellSignal(`Stop Loss @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._resetState(); // 调用 _resetState
      return; // 返回结果
    } // 结束代码块

    // Regime 恶化出场 / Exit on regime deterioration
    if (regime === VolatilityRegime.EXTREME && this.disableInExtreme) { // 条件判断 regime === VolatilityRegime.EXTREME && this.d...
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
      this.log(`Regime恶化出场, 切换到极端波动 PnL=${pnl}%`); // 调用 log

      this.setSellSignal(`Extreme Vol Exit @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._resetState(); // 调用 _resetState
      return; // 返回结果
    } // 结束代码块

    // 趋势反转出场 / MA/DI reversal exit
    if (maDeadCross || diReversal) { // 条件判断 maDeadCross || diReversal
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2); // 定义常量 pnl
      this.log(`MA/DI reversal exit, PnL=${pnl}%`); // 调用 log

      this.setSellSignal(`MA/DI Reversal @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._resetState(); // 调用 _resetState
    } // 结束代码块
  } // 结束代码块

  /**
   * ATR breakout helper.
   * @private
   */
  _getAtrBreakoutHigh(history) { // 调用 _getAtrBreakoutHigh
    if (!history || history.length < 2) return null; // 条件判断 !history || history.length < 2

    const end = history.length - 1; // exclude current candle
    const start = Math.max(0, end - this.atrBreakoutLookback); // 定义常量 start
    let high = null; // 定义变量 high

    for (let i = start; i < end; i++) { // 循环 let i = start; i < end; i++
      const value = history[i].high; // 定义常量 value
      if (high === null || value > high) { // 条件判断 high === null || value > high
        high = value; // 赋值 high
      } // 结束代码块
    } // 结束代码块

    return high; // 返回结果
  } // 结束代码块

  /**
   * 计算百分位
   * @private
   */
  _calculatePercentile(value, history) { // 调用 _calculatePercentile
    if (history.length < 10) return 50; // 条件判断 history.length < 10

    const sorted = [...history].sort((a, b) => a - b); // 定义函数 sorted
    let rank = 0; // 定义变量 rank
    for (let i = 0; i < sorted.length; i++) { // 循环 let i = 0; i < sorted.length; i++
      if (sorted[i] <= value) rank++; // 条件判断 sorted[i] <= value
    } // 结束代码块
    return (rank / sorted.length) * 100; // 返回结果
  } // 结束代码块

  /**
   * 重置状态
   * @private
   */
  _resetState() { // 调用 _resetState
    this._entryPrice = null; // 设置 _entryPrice
    this._stopLoss = null; // 设置 _stopLoss
    this._highestPrice = null; // 设置 _highestPrice
    this.setState('direction', null); // 调用 setState
    this.setState('entryRegime', null); // 调用 setState
    this.setState('entryVolPercentile', null); // 调用 setState
  } // 结束代码块

  /**
   * 获取当前 Regime
   * @returns {string}
   */
  getCurrentRegime() { // 调用 getCurrentRegime
    return this._currentRegime; // 返回结果
  } // 结束代码块

  /**
   * 获取 Regime 统计
   * @returns {Object}
   */
  getRegimeStats() { // 调用 getRegimeStats
    return { // 返回结果
      currentRegime: this._currentRegime, // current状态
      regimeChanges: this._regimeChanges, // 状态变更
      atrHistoryLength: this._atrHistory.length, // ATR历史Length
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

export default VolatilityRegimeStrategy; // 默认导出












