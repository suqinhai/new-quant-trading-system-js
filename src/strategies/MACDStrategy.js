/**
 * MACD 趋势策略(MACD Strategy)
 * MACD + EMA200 Trend Filter
 *
 * 基于 MACD 指标的趋势跟踪策略，配合 EMA200 趋势过滤
 * Trend following strategy based on MACD with EMA200 trend filter
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js

// 导入技术指标 / Import technical indicators
import { MACD, EMA, ATR } from 'technicalindicators'; // 导入模块 technicalindicators

/**
 * MACD 策略类
 * MACD Strategy Class
 */
export class MACDStrategy extends BaseStrategy { // 导出类 MACDStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super({ // 调用父类
      name: 'MACDStrategy', // 设置 name 字段
      ...params, // 展开对象或数组
    }); // 结束代码块

    // === MACD 参数 / MACD Parameters ===
    this.fastPeriod = params.fastPeriod || 12; // 设置 fastPeriod
    this.slowPeriod = params.slowPeriod || 26; // 设置 slowPeriod
    this.signalPeriod = params.signalPeriod || 9; // 设置 signalPeriod

    // 趋势过滤 EMA / Trend filter EMA
    this.trendPeriod = params.trendPeriod || 200; // 设置 trendPeriod

    // 交易参数 / Trading parameters
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol
    this.positionPercent = params.positionPercent || 50; // 设置 positionPercent

    // ATR 动态止损参数 / ATR dynamic stop loss parameters
    this.atrPeriod = params.atrPeriod || 14; // 设置 atrPeriod
    this.atrMultiplier = params.atrMultiplier || 2; // 设置 atrMultiplier

    // Histogram 最小阈值 (防假突破) / Min histogram threshold (anti-whipsaw)
    this.minHistogramRatio = params.minHistogramRatio || 0.0001; // 设置 minHistogramRatio

    // 上一次 Histogram / Previous histogram
    this.prevHistogram = null; // 设置 prevHistogram

    // ATR 动态止损价格 / ATR dynamic stop loss price
    this.stopLossPrice = null; // 设置 stopLossPrice
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

    this.log( // 调用 log
      `MACD 参数: ${this.fastPeriod}/${this.slowPeriod}/${this.signalPeriod}, EMA${this.trendPeriod}, ATR${this.atrPeriod}x${this.atrMultiplier}` // 执行语句
    ); // 结束调用或参数
    this.log( // 调用 log
      `MACD Params: ${this.fastPeriod}/${this.slowPeriod}/${this.signalPeriod}, EMA${this.trendPeriod}, ATR${this.atrPeriod}x${this.atrMultiplier}` // 执行语句
    ); // 结束调用或参数
  } // 结束代码块

  /**
   * 每个 K 线触发
   * Triggered on each candle
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) { // 执行语句
    // 确保有足够的数据 / Ensure enough data
    // EMA200 需要 trendPeriod，MACD 需要 slowPeriod + signalPeriod，ATR 需要 atrPeriod
    const minLength = Math.max( // 定义常量 minLength
      this.trendPeriod, // 访问 trendPeriod
      this.slowPeriod + this.signalPeriod, // 访问 slowPeriod
      this.atrPeriod // 访问 atrPeriod
    ) + 1; // 执行语句

    if (history.length < minLength) { // 条件判断 history.length < minLength
      return; // 返回结果
    } // 结束代码块

    // 提取收盘价数组 / Extract close prices array
    const closes = history.map(h => h.close); // 定义函数 closes
    const highs = history.map(h => h.high); // 定义函数 highs
    const lows = history.map(h => h.low); // 定义函数 lows

    // === ATR 计算 / ATR Calculation ===
    const atrResult = ATR.calculate({ // 定义常量 atrResult
      period: this.atrPeriod, // 设置 period 字段
      high: highs, // 设置 high 字段
      low: lows, // 设置 low 字段
      close: closes, // 设置 close 字段
    }); // 结束代码块
    const atr = atrResult.at(-1); // 定义常量 atr

    // === EMA200 趋势线 / EMA200 Trend Line ===
    const ema200Result = EMA.calculate({ // 定义常量 ema200Result
      period: this.trendPeriod, // 设置 period 字段
      values: closes, // 设置 values 字段
    }); // 结束代码块
    const ema200 = ema200Result.at(-1); // 定义常量 ema200

    // === MACD 计算 / MACD Calculation ===
    const macdList = MACD.calculate({ // 定义常量 macdList
      fastPeriod: this.fastPeriod, // 设置 fastPeriod 字段
      slowPeriod: this.slowPeriod, // 设置 slowPeriod 字段
      signalPeriod: this.signalPeriod, // 设置 signalPeriod 字段
      values: closes, // 设置 values 字段
      SimpleMAOscillator: false, // 设置 SimpleMAOscillator 字段
      SimpleMASignal: false, // 设置 SimpleMASignal 字段
    }); // 结束代码块

    const macd = macdList.at(-1); // 定义常量 macd
    if (!macd) return; // 条件判断 !macd

    const { MACD: dif, signal: dea, histogram } = macd; // 解构赋值

    // 保存指标值 / Save indicator values
    this.setIndicator('DIF', dif); // 调用 setIndicator
    this.setIndicator('DEA', dea); // 调用 setIndicator
    this.setIndicator('Histogram', histogram); // 调用 setIndicator
    this.setIndicator('EMA200', ema200); // 调用 setIndicator
    this.setIndicator('ATR', atr); // 调用 setIndicator

    // 获取当前持仓 / Get current position
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    // === ATR 动态止损检查 / ATR Dynamic Stop Loss Check ===
    if (hasPosition && this.stopLossPrice !== null) { // 条件判断 hasPosition && this.stopLossPrice !== null
      if (candle.close <= this.stopLossPrice) { // 条件判断 candle.close <= this.stopLossPrice
        const loss = // 定义常量 loss
          ((candle.close - position.entryPrice) / position.entryPrice) * 100; // 执行语句
        this.log(`ATR 止损触发 @ ${candle.close} (止损价: ${this.stopLossPrice.toFixed(2)}, 亏损: ${loss.toFixed(2)}%) / ATR Stop Loss Triggered`); // 调用 log
        this.setSellSignal('ATR Stop Loss'); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
        this.prevHistogram = null; // 设置 prevHistogram
        this.stopLossPrice = null; // 设置 stopLossPrice
        return; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 第一次运行，保存值 / First run, save value
    if (this.prevHistogram === null) { // 条件判断 this.prevHistogram === null
      this.prevHistogram = histogram; // 设置 prevHistogram
      return; // 返回结果
    } // 结束代码块

    // === 信号判定 / Signal Detection ===
    // 金叉: Histogram 由负转正 / Golden cross: histogram turns positive
    const goldenCross = this.prevHistogram <= 0 && histogram > 0; // 定义常量 goldenCross

    // 死叉: Histogram 由正转负 / Death cross: histogram turns negative
    const deathCross = this.prevHistogram >= 0 && histogram < 0; // 定义常量 deathCross

    // 假突破过滤 / Anti-whipsaw filter
    const minHistogram = this.minHistogramRatio * candle.close; // 定义常量 minHistogram
    const validCross = Math.abs(histogram) > minHistogram; // 定义常量 validCross

    // 趋势判断 / Trend detection
    const trendUp = candle.close > ema200; // 定义常量 trendUp

    // === 交易逻辑 / Trading Logic ===
    // 入场: 金叉 + 趋势向上 + 有效交叉 / Entry: golden cross + uptrend + valid cross
    if (goldenCross && trendUp && validCross && !hasPosition) { // 条件判断 goldenCross && trendUp && validCross && !hasP...
      // 设置 ATR 动态止损价 / Set ATR dynamic stop loss price
      this.stopLossPrice = candle.close - atr * this.atrMultiplier; // 设置 stopLossPrice
      this.log(`MACD 金叉做多 @ ${candle.close}, ATR止损价: ${this.stopLossPrice.toFixed(2)} / MACD Golden Cross Long`); // 调用 log
      this.setBuySignal('MACD Golden Cross'); // 调用 setBuySignal
      this.buyPercent(this.symbol, this.positionPercent); // 调用 buyPercent
    } // 结束代码块

    // 出场: 死叉 + 跌破 EMA200 (趋势确认) / Exit: death cross + below EMA200 (trend confirmation)
    if (deathCross && !trendUp && hasPosition) { // 条件判断 deathCross && !trendUp && hasPosition
      this.log(`MACD 死叉 + 跌破EMA200 平仓 @ ${candle.close} / MACD Death Cross + Below EMA200 Exit`); // 调用 log
      this.setSellSignal('MACD Death Cross + Trend'); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this.stopLossPrice = null; // 设置 stopLossPrice
    } // 结束代码块

    // 更新上一次 Histogram / Update previous histogram
    this.prevHistogram = histogram; // 设置 prevHistogram
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default MACDStrategy; // 默认导出
