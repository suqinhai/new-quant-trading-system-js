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
import { BaseStrategy } from './BaseStrategy.js';

/**
 * 多周期共振策略类
 * Multi-Timeframe Resonance Strategy Class
 */
export class MultiTimeframeStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 调用父类构造函数 / Call parent constructor
    super({
      name: 'MultiTimeframeStrategy',
      ...params,
    });

    // ============================================
    // 基本参数 / Basic Parameters
    // ============================================

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95;

    // ============================================
    // 1H 趋势参数 (大周期) / 1H Trend Parameters (Major Timeframe)
    // ============================================

    // 1H 短期均线周期 / 1H short MA period
    this.h1ShortPeriod = params.h1ShortPeriod || 10;

    // 1H 长期均线周期 / 1H long MA period
    this.h1LongPeriod = params.h1LongPeriod || 30;

    // ============================================
    // 15M 回调参数 (中周期) / 15M Pullback Parameters (Medium Timeframe)
    // ============================================

    // 15M RSI 周期 / 15M RSI period
    this.m15RsiPeriod = params.m15RsiPeriod || 14;

    // 15M RSI 回调阈值 (多头时RSI低于此值认为回调到位) / 15M RSI pullback threshold
    this.m15RsiPullbackLong = params.m15RsiPullbackLong || 40;

    // 15M RSI 回调阈值 (空头时RSI高于此值认为回调到位) / 15M RSI pullback threshold for short
    this.m15RsiPullbackShort = params.m15RsiPullbackShort || 60;

    // 15M 价格回撤百分比阈值 / 15M price pullback percentage threshold
    this.m15PullbackPercent = params.m15PullbackPercent || 1.5;

    // ============================================
    // 5M 进场参数 (小周期) / 5M Entry Parameters (Minor Timeframe)
    // ============================================

    // 5M RSI 周期 / 5M RSI period
    this.m5RsiPeriod = params.m5RsiPeriod || 14;

    // 5M RSI 超卖阈值 / 5M RSI oversold threshold
    this.m5RsiOversold = params.m5RsiOversold || 30;

    // 5M RSI 超买阈值 / 5M RSI overbought threshold
    this.m5RsiOverbought = params.m5RsiOverbought || 70;

    // 5M 短期均线周期 / 5M short MA period
    this.m5ShortPeriod = params.m5ShortPeriod || 5;

    // 5M 长期均线周期 / 5M long MA period
    this.m5LongPeriod = params.m5LongPeriod || 15;

    // ============================================
    // 出场参数 / Exit Parameters
    // ============================================

    // 止盈百分比 / Take profit percentage
    this.takeProfitPercent = params.takeProfitPercent || 3.0;

    // 止损百分比 / Stop loss percentage
    this.stopLossPercent = params.stopLossPercent || 1.5;

    // 是否使用趋势反转出场 / Whether to use trend reversal exit
    this.useTrendExit = params.useTrendExit !== false;

    // ============================================
    // 多周期数据存储 / Multi-Timeframe Data Storage
    // ============================================

    // K线数据缓存 (5分钟为基础周期) / Candle cache (5-minute as base timeframe)
    this.candles5m = [];
    this.candles15m = [];
    this.candles1h = [];

    // 最大K线缓存数量 / Maximum candle cache size
    this.maxCandles = 200;

    // 当前15m K线累积 / Current 15m candle accumulation
    this.current15mCandle = null;
    this.candle15mCount = 0;

    // 当前1h K线累积 / Current 1h candle accumulation
    this.current1hCandle = null;
    this.candle1hCount = 0;

    // ============================================
    // 状态跟踪 / State Tracking
    // ============================================

    // 1H 趋势状态 / 1H trend state
    this.h1Trend = 'neutral';  // 'bullish', 'bearish', 'neutral'
    this.prevH1ShortMA = null;
    this.prevH1LongMA = null;

    // 15M 回调状态 / 15M pullback state
    this.m15PullbackReady = false;
    this.m15HighSinceTrend = 0;
    this.m15LowSinceTrend = Infinity;

    // 5M 进场信号 / 5M entry signal
    this.m5EntrySignal = false;
    this.prevM5ShortMA = null;
    this.prevM5LongMA = null;
    this.prevM5Rsi = null;

    // 入场价格 (用于止盈止损) / Entry price (for TP/SL)
    this.entryPrice = null;
    this.entryDirection = null;
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 多周期策略只需要 K 线数据 / Multi-timeframe strategy only needs kline
    return ['kline'];
  }

  /**
   * 初始化
   * Initialization
   */
  async onInit() {
    await super.onInit();

    this.log('============================================');
    this.log('多周期共振策略参数 / Multi-Timeframe Strategy Parameters:');
    this.log(`1H 均线: ${this.h1ShortPeriod}/${this.h1LongPeriod}`);
    this.log(`15M RSI周期: ${this.m15RsiPeriod}, 回调阈值: ${this.m15RsiPullbackLong}/${this.m15RsiPullbackShort}`);
    this.log(`5M RSI周期: ${this.m5RsiPeriod}, 超买/超卖: ${this.m5RsiOverbought}/${this.m5RsiOversold}`);
    this.log(`5M 均线: ${this.m5ShortPeriod}/${this.m5LongPeriod}`);
    this.log(`止盈: ${this.takeProfitPercent}%, 止损: ${this.stopLossPercent}%`);
    this.log('============================================');
  }

  /**
   * 每个 K 线触发 (假设传入5M K线)
   * Triggered on each candle (assumes 5M candles)
   * @param {Object} candle - 当前 K 线 / Current candle
   * @param {Array} history - 历史数据 / Historical data
   */
  async onTick(candle, history) {
    // ============================================
    // 1. 更新多周期K线数据 / Update multi-timeframe candle data
    // ============================================
    this._updateMultiTimeframeCandles(candle);

    // ============================================
    // 2. 计算各周期指标 / Calculate indicators for each timeframe
    // ============================================

    // 2.1 计算1H指标 (趋势判断) / Calculate 1H indicators (trend)
    const h1Indicators = this._calculate1HIndicators();

    // 2.2 计算15M指标 (回调判断) / Calculate 15M indicators (pullback)
    const m15Indicators = this._calculate15MIndicators();

    // 2.3 计算5M指标 (进场判断) / Calculate 5M indicators (entry)
    const m5Indicators = this._calculate5MIndicators();

    // 保存指标值 / Save indicator values
    this.setIndicator('h1Trend', this.h1Trend);
    this.setIndicator('h1ShortMA', h1Indicators.shortMA);
    this.setIndicator('h1LongMA', h1Indicators.longMA);
    this.setIndicator('m15RSI', m15Indicators.rsi);
    this.setIndicator('m15PullbackReady', this.m15PullbackReady);
    this.setIndicator('m5RSI', m5Indicators.rsi);
    this.setIndicator('m5ShortMA', m5Indicators.shortMA);
    this.setIndicator('m5LongMA', m5Indicators.longMA);

    // ============================================
    // 3. 检查持仓并处理出场逻辑 / Check position and handle exit logic
    // ============================================
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    if (hasPosition && this.entryPrice) {
      const exitSignal = this._checkExitConditions(candle, h1Indicators);
      if (exitSignal) {
        this.log(`出场信号 / Exit Signal: ${exitSignal.reason} @ ${candle.close}`);
        this.setSellSignal(exitSignal.reason);
        this.closePosition(this.symbol);
        this._resetEntryState();
        return;
      }
    }

    // ============================================
    // 4. 多周期共振进场逻辑 / Multi-timeframe resonance entry logic
    // ============================================
    if (!hasPosition) {
      const entrySignal = this._checkEntryConditions(candle, h1Indicators, m15Indicators, m5Indicators);

      if (entrySignal) {
        this.log('============================================');
        this.log(`多周期共振信号触发! / Multi-TF Resonance Signal!`);
        this.log(`1H 趋势: ${this.h1Trend}`);
        this.log(`15M 回调就绪: ${this.m15PullbackReady}, RSI: ${m15Indicators.rsi?.toFixed(2)}`);
        this.log(`5M 触发: ${entrySignal.trigger}, RSI: ${m5Indicators.rsi?.toFixed(2)}`);
        this.log(`进场价格: ${candle.close}`);
        this.log('============================================');

        this.setBuySignal(`MTF Resonance: ${entrySignal.reason}`);
        this.buyPercent(this.symbol, this.positionPercent);

        // 记录入场信息 / Record entry info
        this.entryPrice = candle.close;
        this.entryDirection = this.h1Trend;
      }
    }

    // ============================================
    // 5. 更新前值 / Update previous values
    // ============================================
    this._updatePreviousValues(h1Indicators, m5Indicators);
  }

  /**
   * 更新多周期K线数据
   * Update multi-timeframe candle data
   * @private
   */
  _updateMultiTimeframeCandles(candle) {
    // 添加5M K线 / Add 5M candle
    this.candles5m.push({ ...candle });
    if (this.candles5m.length > this.maxCandles) {
      this.candles5m.shift();
    }

    // ============================================
    // 聚合15M K线 (每3根5M) / Aggregate 15M candles (every 3 5M candles)
    // ============================================
    if (!this.current15mCandle) {
      this.current15mCandle = {
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };
      this.candle15mCount = 1;
    } else {
      this.current15mCandle.high = Math.max(this.current15mCandle.high, candle.high);
      this.current15mCandle.low = Math.min(this.current15mCandle.low, candle.low);
      this.current15mCandle.close = candle.close;
      this.current15mCandle.volume += candle.volume;
      this.candle15mCount++;
    }

    // 每3根5M完成一根15M / Complete 15M candle every 3 5M candles
    if (this.candle15mCount >= 3) {
      this.candles15m.push({ ...this.current15mCandle });
      if (this.candles15m.length > this.maxCandles) {
        this.candles15m.shift();
      }
      this.current15mCandle = null;
      this.candle15mCount = 0;
    }

    // ============================================
    // 聚合1H K线 (每12根5M) / Aggregate 1H candles (every 12 5M candles)
    // ============================================
    if (!this.current1hCandle) {
      this.current1hCandle = {
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      };
      this.candle1hCount = 1;
    } else {
      this.current1hCandle.high = Math.max(this.current1hCandle.high, candle.high);
      this.current1hCandle.low = Math.min(this.current1hCandle.low, candle.low);
      this.current1hCandle.close = candle.close;
      this.current1hCandle.volume += candle.volume;
      this.candle1hCount++;
    }

    // 每12根5M完成一根1H / Complete 1H candle every 12 5M candles
    if (this.candle1hCount >= 12) {
      this.candles1h.push({ ...this.current1hCandle });
      if (this.candles1h.length > this.maxCandles) {
        this.candles1h.shift();
      }
      this.current1hCandle = null;
      this.candle1hCount = 0;
    }
  }

  /**
   * 计算1H指标 (趋势判断)
   * Calculate 1H indicators (trend determination)
   * @private
   */
  _calculate1HIndicators() {
    const result = { shortMA: null, longMA: null };

    // 需要足够的1H K线 / Need enough 1H candles
    if (this.candles1h.length < this.h1LongPeriod) {
      return result;
    }

    // 计算SMA / Calculate SMA
    const closes = this.candles1h.map(c => c.close);
    result.shortMA = this._calculateSMA(closes, this.h1ShortPeriod);
    result.longMA = this._calculateSMA(closes, this.h1LongPeriod);

    // 判断趋势 / Determine trend
    if (result.shortMA && result.longMA) {
      if (result.shortMA > result.longMA) {
        // 检测金叉 / Detect golden cross
        if (this.prevH1ShortMA !== null && this.prevH1LongMA !== null) {
          if (this.prevH1ShortMA <= this.prevH1LongMA) {
            this.log(`1H 金叉确认多头趋势 / 1H Golden Cross - Bullish Trend Confirmed`);
            this._resetPullbackTracking();
          }
        }
        this.h1Trend = 'bullish';
      } else if (result.shortMA < result.longMA) {
        // 检测死叉 / Detect death cross
        if (this.prevH1ShortMA !== null && this.prevH1LongMA !== null) {
          if (this.prevH1ShortMA >= this.prevH1LongMA) {
            this.log(`1H 死叉确认空头趋势 / 1H Death Cross - Bearish Trend Confirmed`);
            this._resetPullbackTracking();
          }
        }
        this.h1Trend = 'bearish';
      }
    }

    return result;
  }

  /**
   * 计算15M指标 (回调判断)
   * Calculate 15M indicators (pullback determination)
   * @private
   */
  _calculate15MIndicators() {
    const result = { rsi: null, pullbackPercent: 0 };

    // 需要足够的15M K线 / Need enough 15M candles
    if (this.candles15m.length < this.m15RsiPeriod + 1) {
      return result;
    }

    // 计算RSI / Calculate RSI
    const closes = this.candles15m.map(c => c.close);
    result.rsi = this._calculateRSI(closes, this.m15RsiPeriod);

    // 更新高低点跟踪 / Update high/low tracking
    const currentClose = closes[closes.length - 1];
    this.m15HighSinceTrend = Math.max(this.m15HighSinceTrend, currentClose);
    this.m15LowSinceTrend = Math.min(this.m15LowSinceTrend, currentClose);

    // 计算回调幅度 / Calculate pullback percentage
    if (this.h1Trend === 'bullish' && this.m15HighSinceTrend > 0) {
      result.pullbackPercent = ((this.m15HighSinceTrend - currentClose) / this.m15HighSinceTrend) * 100;
    } else if (this.h1Trend === 'bearish' && this.m15LowSinceTrend < Infinity) {
      result.pullbackPercent = ((currentClose - this.m15LowSinceTrend) / this.m15LowSinceTrend) * 100;
    }

    // 判断回调是否到位 / Determine if pullback is ready
    this.m15PullbackReady = false;

    if (this.h1Trend === 'bullish') {
      // 多头趋势中，等待RSI回落或价格回撤 / In bullish trend, wait for RSI drop or price pullback
      if (result.rsi !== null && result.rsi <= this.m15RsiPullbackLong) {
        this.m15PullbackReady = true;
      }
      if (result.pullbackPercent >= this.m15PullbackPercent) {
        this.m15PullbackReady = true;
      }
    } else if (this.h1Trend === 'bearish') {
      // 空头趋势中，等待RSI回升或价格反弹 / In bearish trend, wait for RSI rise or price bounce
      if (result.rsi !== null && result.rsi >= this.m15RsiPullbackShort) {
        this.m15PullbackReady = true;
      }
      if (result.pullbackPercent >= this.m15PullbackPercent) {
        this.m15PullbackReady = true;
      }
    }

    return result;
  }

  /**
   * 计算5M指标 (进场判断)
   * Calculate 5M indicators (entry determination)
   * @private
   */
  _calculate5MIndicators() {
    const result = { rsi: null, shortMA: null, longMA: null };

    // 需要足够的5M K线 / Need enough 5M candles
    if (this.candles5m.length < Math.max(this.m5RsiPeriod + 1, this.m5LongPeriod)) {
      return result;
    }

    const closes = this.candles5m.map(c => c.close);

    // 计算RSI / Calculate RSI
    result.rsi = this._calculateRSI(closes, this.m5RsiPeriod);

    // 计算SMA / Calculate SMA
    result.shortMA = this._calculateSMA(closes, this.m5ShortPeriod);
    result.longMA = this._calculateSMA(closes, this.m5LongPeriod);

    return result;
  }

  /**
   * 检查进场条件 (多周期共振)
   * Check entry conditions (multi-timeframe resonance)
   * @private
   */
  _checkEntryConditions(candle, h1, m15, m5) {
    // 条件1: 1H趋势明确 / Condition 1: Clear 1H trend
    if (this.h1Trend === 'neutral') {
      return null;
    }

    // 条件2: 15M回调到位 / Condition 2: 15M pullback ready
    if (!this.m15PullbackReady) {
      return null;
    }

    // 条件3: 5M触发信号 / Condition 3: 5M trigger signal
    let triggered = false;
    let trigger = '';

    if (this.h1Trend === 'bullish') {
      // ============================================
      // 多头进场条件 / Bullish entry conditions
      // ============================================

      // 触发条件A: 5M RSI从超卖回升 / Trigger A: 5M RSI recovery from oversold
      if (this.prevM5Rsi !== null && m5.rsi !== null) {
        if (this.prevM5Rsi <= this.m5RsiOversold && m5.rsi > this.m5RsiOversold) {
          triggered = true;
          trigger = 'RSI Recovery';
        }
      }

      // 触发条件B: 5M金叉 / Trigger B: 5M golden cross
      if (this.prevM5ShortMA !== null && this.prevM5LongMA !== null &&
          m5.shortMA !== null && m5.longMA !== null) {
        if (this.prevM5ShortMA <= this.prevM5LongMA && m5.shortMA > m5.longMA) {
          triggered = true;
          trigger = trigger ? `${trigger} + Golden Cross` : 'Golden Cross';
        }
      }

      // 触发条件C: 5M RSI在合理范围且价格突破 / Trigger C: 5M RSI in range with price breakout
      if (m5.rsi !== null && m5.rsi > 30 && m5.rsi < 50) {
        const recentHigh = Math.max(...this.candles5m.slice(-5).map(c => c.high));
        if (candle.close > recentHigh * 0.998) {  // 接近或突破近期高点
          triggered = true;
          trigger = trigger ? `${trigger} + Breakout` : 'Breakout';
        }
      }
    } else if (this.h1Trend === 'bearish') {
      // ============================================
      // 空头进场条件 (做多系统暂不支持做空，这里仅作为示例)
      // Bearish entry conditions (long-only system, for reference only)
      // ============================================

      // 在空头趋势中，不建议做多 / In bearish trend, don't recommend going long
      return null;
    }

    if (triggered) {
      return {
        direction: this.h1Trend,
        trigger,
        reason: `1H=${this.h1Trend}, 15M=pullback, 5M=${trigger}`,
      };
    }

    return null;
  }

  /**
   * 检查出场条件
   * Check exit conditions
   * @private
   */
  _checkExitConditions(candle, h1Indicators) {
    const currentPrice = candle.close;
    const pnlPercent = ((currentPrice - this.entryPrice) / this.entryPrice) * 100;

    // 止盈 / Take profit
    if (pnlPercent >= this.takeProfitPercent) {
      return { reason: `Take Profit (${pnlPercent.toFixed(2)}%)` };
    }

    // 止损 / Stop loss
    if (pnlPercent <= -this.stopLossPercent) {
      return { reason: `Stop Loss (${pnlPercent.toFixed(2)}%)` };
    }

    // 趋势反转出场 / Trend reversal exit
    if (this.useTrendExit) {
      // 如果入场时是多头，现在变成空头，则出场 / Exit if trend reverses
      if (this.entryDirection === 'bullish' && this.h1Trend === 'bearish') {
        return { reason: `Trend Reversal (was bullish, now bearish)` };
      }
    }

    return null;
  }

  /**
   * 重置回调跟踪
   * Reset pullback tracking
   * @private
   */
  _resetPullbackTracking() {
    this.m15PullbackReady = false;
    this.m15HighSinceTrend = 0;
    this.m15LowSinceTrend = Infinity;
  }

  /**
   * 重置入场状态
   * Reset entry state
   * @private
   */
  _resetEntryState() {
    this.entryPrice = null;
    this.entryDirection = null;
    this._resetPullbackTracking();
  }

  /**
   * 更新前值
   * Update previous values
   * @private
   */
  _updatePreviousValues(h1Indicators, m5Indicators) {
    this.prevH1ShortMA = h1Indicators.shortMA;
    this.prevH1LongMA = h1Indicators.longMA;
    this.prevM5ShortMA = m5Indicators.shortMA;
    this.prevM5LongMA = m5Indicators.longMA;
    this.prevM5Rsi = m5Indicators.rsi;
  }

  /**
   * 计算 SMA
   * Calculate SMA
   * @private
   */
  _calculateSMA(data, period) {
    if (data.length < period) {
      return null;
    }
    const values = data.slice(-period);
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / period;
  }

  /**
   * 计算 RSI
   * Calculate RSI
   * @private
   */
  _calculateRSI(closes, period) {
    if (closes.length < period + 1) {
      return null;
    }

    // 计算价格变化 / Calculate price changes
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    // 获取最近 period 个变化 / Get last period changes
    const recentChanges = changes.slice(-period);

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
    const avgGain = gains / period;
    const avgLoss = losses / period;

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
export default MultiTimeframeStrategy;
