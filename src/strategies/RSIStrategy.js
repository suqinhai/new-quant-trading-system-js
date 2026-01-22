/**
 * RSI 策略 (增强版)
 * RSI Strategy (Enhanced)
 *
 * RSI 回归 + EMA200 趋势过滤 + ATR 动态止损
 * RSI mean reversion + EMA200 trend filter + ATR dynamic stop loss
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js

/**
 * RSI 策略类
 * RSI Strategy Class
 */
export class RSIStrategy extends BaseStrategy { // 导出类 RSIStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super({ // 调用父类
      name: 'RSIStrategy', // 设置 name 字段
      ...params, // 展开对象或数组
    }); // 结束代码块

    // === RSI 参数 / RSI Parameters ===
    this.period = params.period || 14; // 设置 period
    this.oversold = params.oversold || 40; // 设置 oversold
    this.overbought = params.overbought || 60; // 设置 overbought

    // === 趋势参数 / Trend Parameters ===
    this.emaPeriod = params.emaPeriod || 200; // 设置 emaPeriod

    // === ATR 动态止损 / ATR Dynamic Stop Loss ===
    this.atrPeriod = params.atrPeriod || 14; // 设置 atrPeriod
    this.atrStopMult = params.atrStopMult || 2; // 设置 atrStopMult

    // 交易对 / Trading pair (由框架注入或配置)
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 仓位百分比 / Position percentage (留 buffer 给手续费/滑点)
    this.positionPercent = params.positionPercent ?? 85; // 设置 positionPercent

    // === 状态 / State ===
    this.entryPrice = null; // 设置 entryPrice
    this.rsiValues = []; // 设置 rsiValues

    // === Wilder 指标缓存 / Wilder Indicator Cache ===
    this.prevAvgGain = null; // 设置 prevAvgGain
    this.prevAvgLoss = null; // 设置 prevAvgLoss
    this.prevATR = null; // 设置 prevATR
    this.prevEMA = null; // 设置 prevEMA
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    return ['kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化
   * Initialization
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    this.log(`RSI 参数: 周期=${this.period}, 超卖=${this.oversold}, 超买=${this.overbought}`); // 调用 log
    this.log(`趋势参数: EMA周期=${this.emaPeriod}`); // 调用 log
    this.log(`止损参数: ATR周期=${this.atrPeriod}, ATR倍数=${this.atrStopMult}`); // 调用 log
  } // 结束代码块

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) { // 执行语句
    // 确保有足够的数据 (需要 EMA200) / Ensure enough data for EMA200
    if (history.length < this.emaPeriod + 1) { // 条件判断 history.length < this.emaPeriod + 1
      return; // 返回结果
    } // 结束代码块

    // 提取收盘价数组 / Extract close prices array
    const closes = history.map(h => h.close); // 定义函数 closes

    // ============================================
    // 计算指标 / Calculate indicators
    // ============================================

    // 计算 RSI / Calculate RSI
    const rsi = this._calculateRSI(closes); // 定义常量 rsi
    if (rsi === null) return; // 条件判断 rsi === null

    // 计算 EMA200 / Calculate EMA200
    const ema200 = this._calculateEMA(closes, this.emaPeriod); // 定义常量 ema200
    if (ema200 === null) return; // 条件判断 ema200 === null

    // 计算 ATR / Calculate ATR
    const atr = this._calculateATR(history); // 定义常量 atr
    if (atr === null) return; // 条件判断 atr === null

    // 保存指标值 / Save indicator values
    this.setIndicator('rsi', rsi); // 调用 setIndicator
    this.setIndicator('ema200', ema200); // 调用 setIndicator
    this.setIndicator('atr', atr); // 调用 setIndicator

    // RSI 缓存 / RSI cache
    this.rsiValues.push(rsi); // 访问 rsiValues
    if (this.rsiValues.length > 100) { // 条件判断 this.rsiValues.length > 100
      this.rsiValues.shift(); // 访问 rsiValues
    } // 结束代码块

    // 获取上一个 RSI 值 / Get previous RSI value
    const prevRsi = this.rsiValues.length > 1 ? this.rsiValues.at(-2) : null; // 定义常量 prevRsi
    if (prevRsi === null) return; // 条件判断 prevRsi === null

    // 获取当前持仓 / Get current position
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    // ============================================
    // 入场信号: RSI 回归 / Entry signal: RSI recovery
    // ============================================
    const longSignal = prevRsi < this.oversold && rsi >= this.oversold; // 定义常量 longSignal

    if (longSignal && candle.close > ema200 && !hasPosition) { // 条件判断 longSignal && candle.close > ema200 && !hasPo...
      this.log(`RSI 回归买入信号 / RSI Recovery Buy: RSI=${rsi.toFixed(2)}, EMA200=${ema200.toFixed(2)}, Price=${candle.close}`); // 调用 log
      this.setBuySignal(`RSI Recovery (${rsi.toFixed(2)})`); // 调用 setBuySignal
      this.entryPrice = candle.close; // 设置 entryPrice
      this.buyPercent(this.symbol, this.positionPercent); // 调用 buyPercent
      return; // 入场后本根 K 线不再检查退出
    } // 结束代码块

    // ============================================
    // 退出逻辑 (三层职责) / Exit logic (3 layers)
    // ============================================
    if (hasPosition && this.entryPrice !== null) { // 条件判断 hasPosition && this.entryPrice !== null
      // 1. ATR 动态止损 (风控优先) / ATR stop loss (risk first)
      const stopPrice = this.entryPrice - atr * this.atrStopMult; // 定义常量 stopPrice
      const stopLoss = candle.close <= stopPrice; // 定义常量 stopLoss

      // 2. 动能退出: RSI 从超买回落 + 价格确认衰竭
      // Momentum exit: RSI decline from overbought + price confirms weakness
      const exitByMomentum = // 定义常量 exitByMomentum
        prevRsi > this.overbought && // 执行语句
        rsi <= this.overbought && // 执行语句
        candle.close < ema200 + atr * 0.5; // 执行语句

      // 3. 趋势退出: 跌破 EMA200 / Trend exit: break below EMA200
      const trendBroken = candle.close < ema200; // 定义常量 trendBroken

      if (stopLoss) { // 条件判断 stopLoss
        this.log(`ATR 止损触发 / ATR Stop Loss: 止损价=${stopPrice.toFixed(2)}, 当前价=${candle.close}`); // 调用 log
        this.setSellSignal('ATR Stop Loss'); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
        this._resetMomentumState(); // 调用 _resetMomentumState
      } else if (exitByMomentum) { // 执行语句
        this.log(`RSI 动能退出 / RSI Momentum Exit: RSI=${rsi.toFixed(2)}`); // 调用 log
        this.setSellSignal(`RSI Overbought Exit (${rsi.toFixed(2)})`); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
        this._resetMomentumState(); // 调用 _resetMomentumState
      } else if (trendBroken) { // 执行语句
        this.log(`趋势反转退出 / Trend Broken Exit: Price=${candle.close} < EMA200=${ema200.toFixed(2)}`); // 调用 log
        this.setSellSignal('Trend Broken (Below EMA200)'); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
        this._resetMomentumState(); // 调用 _resetMomentumState
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 重置动量状态 (平仓后调用，防跨行情污染)
   * Reset momentum state (called after close, prevent cross-trade contamination)
   * @private
   */
  _resetMomentumState() { // 调用 _resetMomentumState
    this.entryPrice = null; // 设置 entryPrice
    this.prevAvgGain = null; // 设置 prevAvgGain
    this.prevAvgLoss = null; // 设置 prevAvgLoss
    this.prevATR = null; // 设置 prevATR
    // EMA 不重置，趋势是连续的 / EMA not reset, trend is continuous
  } // 结束代码块

  /**
   * 计算 Wilder RSI (与 TradingView / TA-Lib 一致)
   * Calculate Wilder RSI (consistent with TradingView / TA-Lib)
   * @private
   */
  _calculateRSI(closes) { // 调用 _calculateRSI
    if (closes.length < this.period + 1) { // 条件判断 closes.length < this.period + 1
      return null; // 返回结果
    } // 结束代码块

    // 当前价格变化 / Current price change
    const change = closes.at(-1) - closes.at(-2); // 定义常量 change
    const gain = Math.max(change, 0); // 定义常量 gain
    const loss = Math.max(-change, 0); // 定义常量 loss

    if (this.prevAvgGain === null) { // 条件判断 this.prevAvgGain === null
      // 初始化（只发生一次）/ Initialize (only once)
      let gains = 0; // 定义变量 gains
      let losses = 0; // 定义变量 losses

      for (let i = closes.length - this.period; i < closes.length; i++) { // 循环 let i = closes.length - this.period; i < clos...
        const diff = closes[i] - closes[i - 1]; // 定义常量 diff
        if (diff > 0) { // 条件判断 diff > 0
          gains += diff; // 执行语句
        } else { // 执行语句
          losses += Math.abs(diff); // 执行语句
        } // 结束代码块
      } // 结束代码块

      this.prevAvgGain = gains / this.period; // 设置 prevAvgGain
      this.prevAvgLoss = losses / this.period; // 设置 prevAvgLoss
    } else { // 执行语句
      // Wilder 平滑 / Wilder smoothing
      this.prevAvgGain = (this.prevAvgGain * (this.period - 1) + gain) / this.period; // 设置 prevAvgGain
      this.prevAvgLoss = (this.prevAvgLoss * (this.period - 1) + loss) / this.period; // 设置 prevAvgLoss
    } // 结束代码块

    // 防止除以零 / Prevent division by zero
    if (this.prevAvgLoss === 0) { // 条件判断 this.prevAvgLoss === 0
      return 100; // 返回结果
    } // 结束代码块

    // 计算 RS 和 RSI / Calculate RS and RSI
    const rs = this.prevAvgGain / this.prevAvgLoss; // 定义常量 rs
    return 100 - 100 / (1 + rs); // 返回结果
  } // 结束代码块

  /**
   * 计算 EMA (递推式，高性能)
   * Calculate EMA (recursive, high performance)
   * @private
   */
  _calculateEMA(data, period) { // 调用 _calculateEMA
    if (data.length < period) { // 条件判断 data.length < period
      return null; // 返回结果
    } // 结束代码块

    const price = data.at(-1); // 定义常量 price
    const multiplier = 2 / (period + 1); // 定义常量 multiplier

    if (this.prevEMA === null) { // 条件判断 this.prevEMA === null
      // 初始化：使用 SMA / Initialize with SMA
      this.prevEMA = data.slice(-period).reduce((a, b) => a + b, 0) / period; // 设置 prevEMA
    } else { // 执行语句
      // 递推计算 / Recursive calculation
      this.prevEMA = (price - this.prevEMA) * multiplier + this.prevEMA; // 设置 prevEMA
    } // 结束代码块

    return this.prevEMA; // 返回结果
  } // 结束代码块

  /**
   * 计算 Wilder ATR (递推式，响应更快)
   * Calculate Wilder ATR (recursive, faster response)
   * @private
   */
  _calculateATR(history) { // 调用 _calculateATR
    if (history.length < 2) { // 条件判断 history.length < 2
      return null; // 返回结果
    } // 结束代码块

    const curr = history.at(-1); // 定义常量 curr
    const prev = history.at(-2); // 定义常量 prev

    // 计算当前 True Range / Calculate current True Range
    const tr = Math.max( // 定义常量 tr
      curr.high - curr.low, // 执行语句
      Math.abs(curr.high - prev.close), // 调用 Math.abs
      Math.abs(curr.low - prev.close) // 调用 Math.abs
    ); // 结束调用或参数

    if (this.prevATR === null) { // 条件判断 this.prevATR === null
      // 初始化：需要足够数据 / Initialize: need enough data
      if (history.length < this.atrPeriod + 1) { // 条件判断 history.length < this.atrPeriod + 1
        return null; // 返回结果
      } // 结束代码块

      let sumTR = 0; // 定义变量 sumTR
      for (let i = history.length - this.atrPeriod; i < history.length; i++) { // 循环 let i = history.length - this.atrPeriod; i < ...
        const h = history[i]; // 定义常量 h
        const p = history[i - 1]; // 定义常量 p
        sumTR += Math.max( // 执行语句
          h.high - h.low, // 执行语句
          Math.abs(h.high - p.close), // 调用 Math.abs
          Math.abs(h.low - p.close) // 调用 Math.abs
        ); // 结束调用或参数
      } // 结束代码块
      this.prevATR = sumTR / this.atrPeriod; // 设置 prevATR
    } else { // 执行语句
      // Wilder 平滑 / Wilder smoothing
      this.prevATR = (this.prevATR * (this.atrPeriod - 1) + tr) / this.atrPeriod; // 设置 prevATR
    } // 结束代码块

    return this.prevATR; // 返回结果
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default RSIStrategy; // 默认导出
