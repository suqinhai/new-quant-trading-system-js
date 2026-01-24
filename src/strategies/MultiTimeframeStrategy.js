/**
 * 多周期共振策略 (Multi-Timeframe Resonance Strategy)
 *
 * 通过多个时间周期的信号共振，大幅减少假信号，提高胜率
 * Reduces false signals and improves win rate through multi-timeframe signal resonance
 *
 * 策略逻辑 / Strategy Logic:
 * - 1H: 判断大趋势方向 (SMA) / Determine major trend direction
 * - 15M: 等待回调 (RSI/价格回撤) / Wait for pullback
 * - 5M: 触发进场信号 / Trigger entry signal
 */

// 导入基类 / Import base class
import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js

/**
 * 多周期共振策略类
 * Multi-Timeframe Resonance Strategy Class
 */
export class MultiTimeframeStrategy extends BaseStrategy { // 导出类 MultiTimeframeStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super({ // 调用父类
      name: 'MultiTimeframeStrategy', // name
      ...params, // 展开对象或数组
    }); // 结束代码块

    // ============================================
    // 基本参数 / Basic Parameters
    // ============================================

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95; // 设置 positionPercent

    // Base timeframe in minutes (expected input candle interval)
    this.baseTimeframeMinutes = params.baseTimeframeMinutes ?? 5; // 设置 baseTimeframeMinutes
    this.m15Factor = Math.max(1, Math.round(15 / this.baseTimeframeMinutes)); // 设置 m15Factor
    this.h1Factor = Math.max(1, Math.round(60 / this.baseTimeframeMinutes)); // 设置 h1Factor

    // ============================================
    // 1H 趋势参数 (大周期) / 1H Trend Parameters (Major Timeframe)
    // ============================================

    // 1H 短期均线周期 / 1H short MA period
    this.h1ShortPeriod = params.h1ShortPeriod || 10; // 设置 h1ShortPeriod

    // 1H 长期均线周期 / 1H long MA period
    this.h1LongPeriod = params.h1LongPeriod || 30; // 设置 h1LongPeriod

    // ============================================
    // 15M 回调参数 (中周期) / 15M Pullback Parameters (Medium Timeframe)
    // ============================================

    // 15M RSI 周期 / 15M RSI period
    this.m15RsiPeriod = params.m15RsiPeriod || 14; // 设置 m15RsiPeriod

    // 15M RSI 回调阈值 (多头时RSI低于此值认为回调到位) / 15M RSI pullback threshold
    this.m15RsiPullbackLong = params.m15RsiPullbackLong || 40; // 设置 m15RsiPullbackLong

    // 15M RSI 回调阈值 (空头时RSI高于此值认为回调到位) / 15M RSI pullback threshold for short
    this.m15RsiPullbackShort = params.m15RsiPullbackShort || 60; // 设置 m15RsiPullbackShort

    // 15M 价格回撤百分比阈值 / 15M price pullback percentage threshold
    this.m15PullbackPercent = params.m15PullbackPercent || 1.5; // 设置 m15PullbackPercent

    // ============================================
    // 5M 进场参数 (小周期) / 5M Entry Parameters (Minor Timeframe)
    // ============================================

    // 5M RSI 周期 / 5M RSI period
    this.m5RsiPeriod = params.m5RsiPeriod || 14; // 设置 m5RsiPeriod

    // 5M RSI 超卖阈值 / 5M RSI oversold threshold
    this.m5RsiOversold = params.m5RsiOversold || 30; // 设置 m5RsiOversold

    // 5M RSI 超买阈值 / 5M RSI overbought threshold
    this.m5RsiOverbought = params.m5RsiOverbought || 70; // 设置 m5RsiOverbought

    // 5M 短期均线周期 / 5M short MA period
    this.m5ShortPeriod = params.m5ShortPeriod || 5; // 设置 m5ShortPeriod

    // 5M 长期均线周期 / 5M long MA period
    this.m5LongPeriod = params.m5LongPeriod || 15; // 设置 m5LongPeriod

    // ============================================
    // 出场参数 / Exit Parameters
    // ============================================

    // 止盈百分比 / Take profit percentage
    this.takeProfitPercent = params.takeProfitPercent || 3.0; // 设置 takeProfitPercent

    // 止损百分比 / Stop loss percentage
    this.stopLossPercent = params.stopLossPercent || 1.5; // 设置 stopLossPercent

    // 是否使用趋势反转出场 / Whether to use trend reversal exit
    this.useTrendExit = params.useTrendExit !== false; // 设置 useTrendExit

    // ============================================
    // 多周期数据存储 / Multi-Timeframe Data Storage
    // ============================================

    // K线数据缓存 (5分钟为基础周期) / Candle cache (5-minute as base timeframe)
    this.candles5m = []; // 设置 candles5m
    this.candles15m = []; // 设置 candles15m
    this.candles1h = []; // 设置 candles1h

    // 最大K线缓存数量 / Maximum candle cache size
    this.maxCandles = 200; // 设置 maxCandles

    // 当前15m K线累积 / Current 15m candle accumulation
    this.current15mCandle = null; // 设置 current15mCandle
    this.candle15mCount = 0; // 设置 candle15mCount

    // 当前1h K线累积 / Current 1h candle accumulation
    this.current1hCandle = null; // 设置 current1hCandle
    this.candle1hCount = 0; // 设置 candle1hCount

    // ============================================
    // 状态跟踪 / State Tracking
    // ============================================

    // 1H 趋势状态 / 1H trend state
    this.h1Trend = 'neutral';  // 'bullish', 'bearish', 'neutral'
    this.prevH1ShortMA = null; // 设置 prevH1ShortMA
    this.prevH1LongMA = null; // 设置 prevH1LongMA

    // 15M 回调状态 / 15M pullback state
    this.m15PullbackReady = false; // 设置 m15PullbackReady
    this.m15HighSinceTrend = 0; // 设置 m15HighSinceTrend
    this.m15LowSinceTrend = Infinity; // 设置 m15LowSinceTrend

    // 5M 进场信号 / 5M entry signal
    this.m5EntrySignal = false; // 设置 m5EntrySignal
    this.prevM5ShortMA = null; // 设置 prevM5ShortMA
    this.prevM5LongMA = null; // 设置 prevM5LongMA
    this.prevM5Rsi = null; // 设置 prevM5Rsi

    // 入场价格 (用于止盈止损) / Entry price (for TP/SL)
    this.entryPrice = null; // 设置 entryPrice
    this.entryDirection = null; // 设置 entryDirection

    // Base timeframe check
    this._intervalSamples = []; // 设置 _intervalSamples
    this._intervalChecked = false; // 设置 _intervalChecked
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // 多周期策略只需要 K 线数据 / Multi-timeframe strategy only needs kline
    return ['kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化
   * Initialization
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    this.log('============================================'); // 调用 log
    this.log('多周期共振策略参数 / Multi-Timeframe Strategy Parameters:'); // 调用 log
    this.log(`1H 均线: ${this.h1ShortPeriod}/${this.h1LongPeriod}`); // 调用 log
    this.log(`15M RSI周期: ${this.m15RsiPeriod}, 回调阈值: ${this.m15RsiPullbackLong}/${this.m15RsiPullbackShort}`); // 调用 log
    this.log(`5M RSI周期: ${this.m5RsiPeriod}, 超买/超卖: ${this.m5RsiOverbought}/${this.m5RsiOversold}`); // 调用 log
    this.log(`5M 均线: ${this.m5ShortPeriod}/${this.m5LongPeriod}`); // 调用 log
    this.log(`止盈: ${this.takeProfitPercent}%, 止损: ${this.stopLossPercent}%`); // 调用 log
    this.log('============================================'); // 调用 log
  } // 结束代码块

  /**
   * 每个 K 线触发 (假设传入5M K线)
   * Triggered on each candle (assumes 5M candles)
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) { // 执行语句
    this._checkBaseTimeframe(candle, history); // 调用 _checkBaseTimeframe

    // ============================================
    // 1. 更新多周期K线数据 / Update multi-timeframe candle data
    // ============================================
    this._updateMultiTimeframeCandles(candle); // 调用 _updateMultiTimeframeCandles

    // ============================================
    // 2. 计算各周期指标 / Calculate indicators for each timeframe
    // ============================================

    // 2.1 计算1H指标 (趋势判断) / Calculate 1H indicators (trend)
    const h1Indicators = this._calculate1HIndicators(); // 定义常量 h1Indicators

    // 2.2 计算15M指标 (回调判断) / Calculate 15M indicators (pullback)
    const m15Indicators = this._calculate15MIndicators(); // 定义常量 m15Indicators

    // 2.3 计算5M指标 (进场判断) / Calculate 5M indicators (entry)
    const m5Indicators = this._calculate5MIndicators(); // 定义常量 m5Indicators

    // 保存指标值 / Save indicator values
    this.setIndicator('h1Trend', this.h1Trend); // 调用 setIndicator
    this.setIndicator('h1ShortMA', h1Indicators.shortMA); // 调用 setIndicator
    this.setIndicator('h1LongMA', h1Indicators.longMA); // 调用 setIndicator
    this.setIndicator('m15RSI', m15Indicators.rsi); // 调用 setIndicator
    this.setIndicator('m15PullbackReady', this.m15PullbackReady); // 调用 setIndicator
    this.setIndicator('m5RSI', m5Indicators.rsi); // 调用 setIndicator
    this.setIndicator('m5ShortMA', m5Indicators.shortMA); // 调用 setIndicator
    this.setIndicator('m5LongMA', m5Indicators.longMA); // 调用 setIndicator

    // ============================================
    // 3. 检查持仓并处理出场逻辑 / Check position and handle exit logic
    // ============================================
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    if (hasPosition && this.entryPrice) { // 条件判断 hasPosition && this.entryPrice
      const exitSignal = this._checkExitConditions(candle, h1Indicators); // 定义常量 exitSignal
      if (exitSignal) { // 条件判断 exitSignal
        this.log(`出场信号 / Exit Signal: ${exitSignal.reason} @ ${candle.close}`); // 调用 log
        this.setSellSignal(exitSignal.reason); // 调用 setSellSignal
        this.closePosition(this.symbol); // 调用 closePosition
        this._resetEntryState(); // 调用 _resetEntryState
        return; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // 4. 多周期共振进场逻辑 / Multi-timeframe resonance entry logic
    // ============================================
    if (!hasPosition) { // 条件判断 !hasPosition
      const entrySignal = this._checkEntryConditions(candle, h1Indicators, m15Indicators, m5Indicators); // 定义常量 entrySignal

      if (entrySignal) { // 条件判断 entrySignal
        this.log('============================================'); // 调用 log
        this.log(`多周期共振信号触发! / Multi-TF Resonance Signal!`); // 调用 log
        this.log(`1H 趋势: ${this.h1Trend}`); // 调用 log
        this.log(`15M 回调就绪: ${this.m15PullbackReady}, RSI: ${m15Indicators.rsi?.toFixed(2)}`); // 调用 log
        this.log(`5M 触发: ${entrySignal.trigger}, RSI: ${m5Indicators.rsi?.toFixed(2)}`); // 调用 log
        this.log(`进场价格: ${candle.close}`); // 调用 log
        this.log('============================================'); // 调用 log

        this.setBuySignal(`MTF Resonance: ${entrySignal.reason}`); // 调用 setBuySignal
        this.buyPercent(this.symbol, this.positionPercent); // 调用 buyPercent

        // 记录入场信息 / Record entry info
        this.entryPrice = candle.close; // 设置 entryPrice
        this.entryDirection = this.h1Trend; // 设置 entryDirection
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // 5. 更新前值 / Update previous values
    // ============================================
    this._updatePreviousValues(h1Indicators, m5Indicators); // 调用 _updatePreviousValues
  } // 结束代码块

  /**
   * 更新多周期K线数据
   * Update multi-timeframe candle data
   * @private
   */
  _updateMultiTimeframeCandles(candle) { // 调用 _updateMultiTimeframeCandles
    // 添加基础周期K线 / Add base timeframe candle
    this.candles5m.push({ ...candle }); // 访问 candles5m
    if (this.candles5m.length > this.maxCandles) { // 条件判断 this.candles5m.length > this.maxCandles
      this.candles5m.shift(); // 访问 candles5m
    } // 结束代码块

    // ============================================
    // 聚合15M K线 / Aggregate 15M candles
    // ============================================
    if (!this.current15mCandle) { // 条件判断 !this.current15mCandle
      this.current15mCandle = { // 设置 current15mCandle
        timestamp: candle.timestamp, // 时间戳
        open: candle.open, // 开盘
        high: candle.high, // 最高
        low: candle.low, // 最低
        close: candle.close, // 收盘
        volume: candle.volume, // 成交量
      }; // 结束代码块
      this.candle15mCount = 1; // 设置 candle15mCount
    } else { // 执行语句
      this.current15mCandle.high = Math.max(this.current15mCandle.high, candle.high); // 访问 current15mCandle
      this.current15mCandle.low = Math.min(this.current15mCandle.low, candle.low); // 访问 current15mCandle
      this.current15mCandle.close = candle.close; // 访问 current15mCandle
      this.current15mCandle.volume += candle.volume; // 访问 current15mCandle
      this.candle15mCount++; // 访问 candle15mCount
    } // 结束代码块

    // 每 m15Factor 根完成一根15M / Complete 15M candle by factor
    if (this.candle15mCount >= this.m15Factor) { // 条件判断 this.candle15mCount >= this.m15Factor
      this.candles15m.push({ ...this.current15mCandle }); // 访问 candles15m
      if (this.candles15m.length > this.maxCandles) { // 条件判断 this.candles15m.length > this.maxCandles
        this.candles15m.shift(); // 访问 candles15m
      } // 结束代码块
      this.current15mCandle = null; // 设置 current15mCandle
      this.candle15mCount = 0; // 设置 candle15mCount
    } // 结束代码块

    // ============================================
    // 聚合1H K线 / Aggregate 1H candles
    // ============================================
    if (!this.current1hCandle) { // 条件判断 !this.current1hCandle
      this.current1hCandle = { // 设置 current1hCandle
        timestamp: candle.timestamp, // 时间戳
        open: candle.open, // 开盘
        high: candle.high, // 最高
        low: candle.low, // 最低
        close: candle.close, // 收盘
        volume: candle.volume, // 成交量
      }; // 结束代码块
      this.candle1hCount = 1; // 设置 candle1hCount
    } else { // 执行语句
      this.current1hCandle.high = Math.max(this.current1hCandle.high, candle.high); // 访问 current1hCandle
      this.current1hCandle.low = Math.min(this.current1hCandle.low, candle.low); // 访问 current1hCandle
      this.current1hCandle.close = candle.close; // 访问 current1hCandle
      this.current1hCandle.volume += candle.volume; // 访问 current1hCandle
      this.candle1hCount++; // 访问 candle1hCount
    } // 结束代码块

    // 每 h1Factor 根完成一根1H / Complete 1H candle by factor
    if (this.candle1hCount >= this.h1Factor) { // 条件判断 this.candle1hCount >= this.h1Factor
      this.candles1h.push({ ...this.current1hCandle }); // 访问 candles1h
      if (this.candles1h.length > this.maxCandles) { // 条件判断 this.candles1h.length > this.maxCandles
        this.candles1h.shift(); // 访问 candles1h
      } // 结束代码块
      this.current1hCandle = null; // 设置 current1hCandle
      this.candle1hCount = 0; // 设置 candle1hCount
    } // 结束代码块
  } // 结束代码块

  _checkBaseTimeframe(candle, history) { // 调用 _checkBaseTimeframe
    if (this._intervalChecked) { // 条件判断 this._intervalChecked
      return; // 返回结果
    } // 结束代码块
    if (!history || history.length < 2) { // 条件判断 !history || history.length < 2
      return; // 返回结果
    } // 结束代码块
    const prev = history[history.length - 2]; // 定义常量 prev
    const dtMs = candle.timestamp - prev.timestamp; // 定义常量 dtMs
    if (!Number.isFinite(dtMs) || dtMs <= 0) { // 条件判断 !Number.isFinite(dtMs) || dtMs <= 0
      return; // 返回结果
    } // 结束代码块
    const minutes = dtMs / 60000; // 定义常量 minutes
    this._intervalSamples.push(minutes); // 访问 _intervalSamples
    if (this._intervalSamples.length < 5) { // 条件判断 this._intervalSamples.length < 5
      return; // 返回结果
    } // 结束代码块
    const sorted = [...this._intervalSamples].sort((a, b) => a - b); // 定义常量 sorted
    const median = sorted[Math.floor(sorted.length / 2)]; // 定义常量 median
    this._intervalChecked = true; // 赋值 _intervalChecked

    const expected = this.baseTimeframeMinutes; // 定义常量 expected
    const tolerance = Math.max(1, expected * 0.2); // 定义常量 tolerance
    if (Math.abs(median - expected) > tolerance) { // 条件判断 Math.abs(median - expected) > tolerance
      this.log(`WARN Base timeframe mismatch: expected ~${expected}m, got ~${median.toFixed(1)}m`, 'warn'); // 调用 log
    } else { // 执行语句
      this.log(`Base timeframe confirmed: ~${median.toFixed(1)}m`); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算1H指标 (趋势判断)
   * Calculate 1H indicators (trend determination)
   * @private
   */
  _calculate1HIndicators() { // 调用 _calculate1HIndicators
    const result = { shortMA: null, longMA: null }; // 定义常量 result

    // 需要足够的1H K线 / Need enough 1H candles
    if (this.candles1h.length < this.h1LongPeriod) { // 条件判断 this.candles1h.length < this.h1LongPeriod
      return result; // 返回结果
    } // 结束代码块

    // 计算SMA / Calculate SMA
    const closes = this.candles1h.map(c => c.close); // 定义函数 closes
    result.shortMA = this._calculateSMA(closes, this.h1ShortPeriod); // 赋值 result.shortMA
    result.longMA = this._calculateSMA(closes, this.h1LongPeriod); // 赋值 result.longMA

    // 判断趋势 / Determine trend
    if (result.shortMA && result.longMA) { // 条件判断 result.shortMA && result.longMA
      if (result.shortMA > result.longMA) { // 条件判断 result.shortMA > result.longMA
        // 检测金叉 / Detect golden cross
        if (this.prevH1ShortMA !== null && this.prevH1LongMA !== null) { // 条件判断 this.prevH1ShortMA !== null && this.prevH1Lon...
          if (this.prevH1ShortMA <= this.prevH1LongMA) { // 条件判断 this.prevH1ShortMA <= this.prevH1LongMA
            this.log(`1H 金叉确认多头趋势 / 1H Golden Cross - Bullish Trend Confirmed`); // 调用 log
            this._resetPullbackTracking(); // 调用 _resetPullbackTracking
          } // 结束代码块
        } // 结束代码块
        this.h1Trend = 'bullish'; // 设置 h1Trend
      } else if (result.shortMA < result.longMA) { // 执行语句
        // 检测死叉 / Detect death cross
        if (this.prevH1ShortMA !== null && this.prevH1LongMA !== null) { // 条件判断 this.prevH1ShortMA !== null && this.prevH1Lon...
          if (this.prevH1ShortMA >= this.prevH1LongMA) { // 条件判断 this.prevH1ShortMA >= this.prevH1LongMA
            this.log(`1H 死叉确认空头趋势 / 1H Death Cross - Bearish Trend Confirmed`); // 调用 log
            this._resetPullbackTracking(); // 调用 _resetPullbackTracking
          } // 结束代码块
        } // 结束代码块
        this.h1Trend = 'bearish'; // 设置 h1Trend
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 计算15M指标 (回调判断)
   * Calculate 15M indicators (pullback determination)
   * @private
   */
  _calculate15MIndicators() { // 调用 _calculate15MIndicators
    const result = { rsi: null, pullbackPercent: 0 }; // 定义常量 result

    // 需要足够的15M K线 / Need enough 15M candles
    if (this.candles15m.length < this.m15RsiPeriod + 1) { // 条件判断 this.candles15m.length < this.m15RsiPeriod + 1
      return result; // 返回结果
    } // 结束代码块

    // 计算RSI / Calculate RSI
    const closes = this.candles15m.map(c => c.close); // 定义函数 closes
    result.rsi = this._calculateRSI(closes, this.m15RsiPeriod); // 赋值 result.rsi

    // 更新高低点跟踪 / Update high/low tracking
    const currentClose = closes[closes.length - 1]; // 定义常量 currentClose
    this.m15HighSinceTrend = Math.max(this.m15HighSinceTrend, currentClose); // 设置 m15HighSinceTrend
    this.m15LowSinceTrend = Math.min(this.m15LowSinceTrend, currentClose); // 设置 m15LowSinceTrend

    // 计算回调幅度 / Calculate pullback percentage
    if (this.h1Trend === 'bullish' && this.m15HighSinceTrend > 0) { // 条件判断 this.h1Trend === 'bullish' && this.m15HighSin...
      result.pullbackPercent = ((this.m15HighSinceTrend - currentClose) / this.m15HighSinceTrend) * 100; // 赋值 result.pullbackPercent
    } else if (this.h1Trend === 'bearish' && this.m15LowSinceTrend < Infinity) { // 执行语句
      result.pullbackPercent = ((currentClose - this.m15LowSinceTrend) / this.m15LowSinceTrend) * 100; // 赋值 result.pullbackPercent
    } // 结束代码块

    // 判断回调是否到位 / Determine if pullback is ready
    this.m15PullbackReady = false; // 设置 m15PullbackReady

    if (this.h1Trend === 'bullish') { // 条件判断 this.h1Trend === 'bullish'
      // 多头趋势中，等待RSI回落或价格回撤 / In bullish trend, wait for RSI drop or price pullback
      if (result.rsi !== null && result.rsi <= this.m15RsiPullbackLong) { // 条件判断 result.rsi !== null && result.rsi <= this.m15...
        this.m15PullbackReady = true; // 设置 m15PullbackReady
      } // 结束代码块
      if (result.pullbackPercent >= this.m15PullbackPercent) { // 条件判断 result.pullbackPercent >= this.m15PullbackPer...
        this.m15PullbackReady = true; // 设置 m15PullbackReady
      } // 结束代码块
    } else if (this.h1Trend === 'bearish') { // 执行语句
      // 空头趋势中，等待RSI回升或价格反弹 / In bearish trend, wait for RSI rise or price bounce
      if (result.rsi !== null && result.rsi >= this.m15RsiPullbackShort) { // 条件判断 result.rsi !== null && result.rsi >= this.m15...
        this.m15PullbackReady = true; // 设置 m15PullbackReady
      } // 结束代码块
      if (result.pullbackPercent >= this.m15PullbackPercent) { // 条件判断 result.pullbackPercent >= this.m15PullbackPer...
        this.m15PullbackReady = true; // 设置 m15PullbackReady
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 计算5M指标 (进场判断)
   * Calculate 5M indicators (entry determination)
   * @private
   */
  _calculate5MIndicators() { // 调用 _calculate5MIndicators
    const result = { rsi: null, shortMA: null, longMA: null }; // 定义常量 result

    // 需要足够的5M K线 / Need enough 5M candles
    if (this.candles5m.length < Math.max(this.m5RsiPeriod + 1, this.m5LongPeriod)) { // 条件判断 this.candles5m.length < Math.max(this.m5RsiPe...
      return result; // 返回结果
    } // 结束代码块

    const closes = this.candles5m.map(c => c.close); // 定义函数 closes

    // 计算RSI / Calculate RSI
    result.rsi = this._calculateRSI(closes, this.m5RsiPeriod); // 赋值 result.rsi

    // 计算SMA / Calculate SMA
    result.shortMA = this._calculateSMA(closes, this.m5ShortPeriod); // 赋值 result.shortMA
    result.longMA = this._calculateSMA(closes, this.m5LongPeriod); // 赋值 result.longMA

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查进场条件 (多周期共振)
   * Check entry conditions (multi-timeframe resonance)
   * @private
   */
  _checkEntryConditions(candle, h1, m15, m5) { // 调用 _checkEntryConditions
    // 条件1: 1H趋势明确 / Condition 1: Clear 1H trend
    if (this.h1Trend === 'neutral') { // 条件判断 this.h1Trend === 'neutral'
      return null; // 返回结果
    } // 结束代码块

    // 条件2: 15M回调到位 / Condition 2: 15M pullback ready
    if (!this.m15PullbackReady) { // 条件判断 !this.m15PullbackReady
      return null; // 返回结果
    } // 结束代码块

    // 条件3: 5M触发信号 / Condition 3: 5M trigger signal
    let triggered = false; // 定义变量 triggered
    let trigger = ''; // 定义变量 trigger

    if (this.h1Trend === 'bullish') { // 条件判断 this.h1Trend === 'bullish'
      // ============================================
      // 多头进场条件 / Bullish entry conditions
      // ============================================

      // 触发条件A: 5M RSI从超卖回升 / Trigger A: 5M RSI recovery from oversold
      if (this.prevM5Rsi !== null && m5.rsi !== null) { // 条件判断 this.prevM5Rsi !== null && m5.rsi !== null
        if (this.prevM5Rsi <= this.m5RsiOversold && m5.rsi > this.m5RsiOversold) { // 条件判断 this.prevM5Rsi <= this.m5RsiOversold && m5.rs...
          triggered = true; // 赋值 triggered
          trigger = 'RSI Recovery'; // 赋值 trigger
        } // 结束代码块
      } // 结束代码块

      // 触发条件B: 5M金叉 / Trigger B: 5M golden cross
      if (this.prevM5ShortMA !== null && this.prevM5LongMA !== null && // 条件判断 this.prevM5ShortMA !== null && this.prevM5Lon...
          m5.shortMA !== null && m5.longMA !== null) { // 执行语句
        if (this.prevM5ShortMA <= this.prevM5LongMA && m5.shortMA > m5.longMA) { // 条件判断 this.prevM5ShortMA <= this.prevM5LongMA && m5...
          triggered = true; // 赋值 triggered
          trigger = trigger ? `${trigger} + Golden Cross` : 'Golden Cross'; // 赋值 trigger
        } // 结束代码块
      } // 结束代码块

      // 触发条件C: 5M RSI在合理范围且价格突破 / Trigger C: 5M RSI in range with price breakout
      if (m5.rsi !== null && m5.rsi > 30 && m5.rsi < 50) { // 条件判断 m5.rsi !== null && m5.rsi > 30 && m5.rsi < 50
        const recentHigh = Math.max(...this.candles5m.slice(-5).map(c => c.high)); // 定义函数 recentHigh
        if (candle.close > recentHigh * 0.998) {  // 接近或突破近期高点
          triggered = true; // 赋值 triggered
          trigger = trigger ? `${trigger} + Breakout` : 'Breakout'; // 赋值 trigger
        } // 结束代码块
      } // 结束代码块
    } else if (this.h1Trend === 'bearish') { // 执行语句
      // ============================================
      // 空头进场条件 (做多系统暂不支持做空，这里仅作为示例)
      // Bearish entry conditions (long-only system, for reference only)
      // ============================================

      // 在空头趋势中，不建议做多 / In bearish trend, don't recommend going long
      return null; // 返回结果
    } // 结束代码块

    if (triggered) { // 条件判断 triggered
      return { // 返回结果
        direction: this.h1Trend, // direction
        trigger, // 执行语句
        reason: `1H=${this.h1Trend}, 15M=pullback, 5M=${trigger}`, // reason
      }; // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 检查出场条件
   * Check exit conditions
   * @private
   */
  _checkExitConditions(candle, h1Indicators) { // 调用 _checkExitConditions
    const currentPrice = candle.close; // 定义常量 currentPrice
    const pnlPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100; // 定义常量 pnlPercent

    // 止盈 / Take profit
    if (pnlPercent >= this.takeProfitPercent) { // 条件判断 pnlPercent >= this.takeProfitPercent
      return { reason: `Take Profit (${pnlPercent.toFixed(2)}%)` }; // 返回结果
    } // 结束代码块

    // 止损 / Stop loss
    if (pnlPercent <= -this.stopLossPercent) { // 条件判断 pnlPercent <= -this.stopLossPercent
      return { reason: `Stop Loss (${pnlPercent.toFixed(2)}%)` }; // 返回结果
    } // 结束代码块

    // 趋势反转出场 / Trend reversal exit
    if (this.useTrendExit) { // 条件判断 this.useTrendExit
      // 如果入场时是多头，现在变成空头，则出场 / Exit if trend reverses
      if (this.entryDirection === 'bullish' && this.h1Trend === 'bearish') { // 条件判断 this.entryDirection === 'bullish' && this.h1T...
        return { reason: `Trend Reversal (was bullish, now bearish)` }; // 返回结果
      } // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 重置回调跟踪
   * Reset pullback tracking
   * @private
   */
  _resetPullbackTracking() { // 调用 _resetPullbackTracking
    this.m15PullbackReady = false; // 设置 m15PullbackReady
    this.m15HighSinceTrend = 0; // 设置 m15HighSinceTrend
    this.m15LowSinceTrend = Infinity; // 设置 m15LowSinceTrend
  } // 结束代码块

  /**
   * 重置入场状态
   * Reset entry state
   * @private
   */
  _resetEntryState() { // 调用 _resetEntryState
    this.entryPrice = null; // 设置 entryPrice
    this.entryDirection = null; // 设置 entryDirection
    this._resetPullbackTracking(); // 调用 _resetPullbackTracking
  } // 结束代码块

  /**
   * 更新前值
   * Update previous values
   * @private
   */
  _updatePreviousValues(h1Indicators, m5Indicators) { // 调用 _updatePreviousValues
    this.prevH1ShortMA = h1Indicators.shortMA; // 设置 prevH1ShortMA
    this.prevH1LongMA = h1Indicators.longMA; // 设置 prevH1LongMA
    this.prevM5ShortMA = m5Indicators.shortMA; // 设置 prevM5ShortMA
    this.prevM5LongMA = m5Indicators.longMA; // 设置 prevM5LongMA
    this.prevM5Rsi = m5Indicators.rsi; // 设置 prevM5Rsi
  } // 结束代码块

  /**
   * 计算 SMA
   * Calculate SMA
   * @private
   */
  _calculateSMA(data, period) { // 调用 _calculateSMA
    if (data.length < period) { // 条件判断 data.length < period
      return null; // 返回结果
    } // 结束代码块
    const values = data.slice(-period); // 定义常量 values
    const sum = values.reduce((acc, val) => acc + val, 0); // 定义函数 sum
    return sum / period; // 返回结果
  } // 结束代码块

  /**
   * 计算 RSI
   * Calculate RSI
   * @private
   */
  _calculateRSI(closes, period) { // 调用 _calculateRSI
    if (closes.length < period + 1) { // 条件判断 closes.length < period + 1
      return null; // 返回结果
    } // 结束代码块

    // 计算价格变化 / Calculate price changes
    const changes = []; // 定义常量 changes
    for (let i = 1; i < closes.length; i++) { // 循环 let i = 1; i < closes.length; i++
      changes.push(closes[i] - closes[i - 1]); // 调用 changes.push
    } // 结束代码块

    // 获取最近 period 个变化 / Get last period changes
    const recentChanges = changes.slice(-period); // 定义常量 recentChanges

    // 分离涨跌 / Separate gains and losses
    let gains = 0; // 定义变量 gains
    let losses = 0; // 定义变量 losses

    for (const change of recentChanges) { // 循环 const change of recentChanges
      if (change > 0) { // 条件判断 change > 0
        gains += change; // 执行语句
      } else { // 执行语句
        losses += Math.abs(change); // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 计算平均涨跌 / Calculate average gains/losses
    const avgGain = gains / period; // 定义常量 avgGain
    const avgLoss = losses / period; // 定义常量 avgLoss

    // 防止除以零 / Prevent division by zero
    if (avgLoss === 0) { // 条件判断 avgLoss === 0
      return 100; // 返回结果
    } // 结束代码块

    // 计算 RS 和 RSI / Calculate RS and RSI
    const rs = avgGain / avgLoss; // 定义常量 rs
    const rsi = 100 - (100 / (1 + rs)); // 定义常量 rsi

    return rsi; // 返回结果
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default MultiTimeframeStrategy; // 默认导出
