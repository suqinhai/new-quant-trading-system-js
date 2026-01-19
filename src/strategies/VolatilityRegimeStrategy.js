/**
 * 波动率Regime 切换策略
 * Volatility Regime Strategy
 *
 * 识别市场高低波动率状态，根据不同 Regime 采用不同交易逻辑
 * - 低波动期：等待突破，蓄势待发
 * - 高波动期：趋势跟踪，顺势而为
 * - 过渡期：谨慎操作，控制仓位
 */

import { BaseStrategy } from './BaseStrategy.js';
import { ATR, EMA, SMA, ADX, getLatest } from '../utils/indicators.js';

/**
 * 波动率状态枚举
 */
const VolatilityRegime = {
  LOW: 'low',           // 低波动
  NORMAL: 'normal',     // 正常波动
  HIGH: 'high',         // 高波动
  EXTREME: 'extreme',   // 极端波动
};

/**
 * 波动率Regime 策略类
 */
export class VolatilityRegimeStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) {
    super({
      name: 'VolatilityRegimeStrategy',
      ...params,
    });

    // ATR 周期 / ATR period
    this.atrPeriod = params.atrPeriod ?? 14;

    // 波动率历史周期 / Volatility history lookback
    this.volatilityLookback = params.volatilityLookback ?? 100;

    // 低波动阈值(百分位) / Low volatility threshold
    this.lowVolThreshold = params.lowVolThreshold ?? 25;

    // 高波动阈值(百分位) / High volatility threshold
    this.highVolThreshold = params.highVolThreshold ?? 75;

    // 极端波动阈值(百分位) / Extreme volatility threshold
    this.extremeVolThreshold = params.extremeVolThreshold ?? 95;

    // 趋势均线周期 / Trend MA periods
    this.fastMAPeriod = params.fastMAPeriod ?? 10;
    this.slowMAPeriod = params.slowMAPeriod ?? 30;

    // ADX 周期和阈值 / ADX period and threshold
    this.adxPeriod = params.adxPeriod ?? 14;
    this.adxThreshold = params.adxThreshold ?? 25;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 基础仓位百分比 / Base position percentage
    this.basePositionPercent = params.positionPercent ?? 95;

    // 低波动期仓位调整 / Low volatility position adjustment
    this.lowVolPositionMult = params.lowVolPositionMult ?? 0.5;

    // 高波动期仓位调整 / High volatility position adjustment
    this.highVolPositionMult = params.highVolPositionMult ?? 0.8;

    // 极端波动禁止交易 / Disable trading in extreme volatility
    this.disableInExtreme = params.disableInExtreme !== false;

    // 止损 ATR 倍数 / Stop loss ATR multiplier
    this.stopLossMultiplier = params.stopLossMultiplier ?? 2.0;

    // ATR breakout params
    this.atrBreakoutLookback = params.atrBreakoutLookback ?? 20;
    this.atrBreakoutMultiplier = params.atrBreakoutMultiplier ?? 1.0;

    // Regime confirmation bars
    this._regimeConfirmBars = params.regimeConfirmBars ?? 3;

    // 内部状态
    this._atrHistory = [];
    this._currentRegime = VolatilityRegime.NORMAL;
    this._prevRegime = VolatilityRegime.NORMAL;
    this._entryPrice = null;
    this._stopLoss = null;
    this._highestPrice = null;
    this._regimeCandidate = null;
    this._regimeCandidateCount = 0;
    this._regimeChanges = 0;
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 波动率Regime 策略只需要 K 线数据 / Volatility Regime strategy only needs kline
    return ['kline'];
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();

    this.log(`波动率Regime策略初始化`);
    this.log(`ATR=${this.atrPeriod}, 低阈值${this.lowVolThreshold}%, 高阈值${this.highVolThreshold}%`);
  }

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) {
    // 确保足够数据 / Ensure enough data
    const requiredLength = Math.max(
      this.atrPeriod,
      this.slowMAPeriod,
      this.adxPeriod,
      this.atrBreakoutLookback + 2,
      50
    );
    if (history.length < requiredLength) {
      return;
    }

    // 计算指标 / Calculate indicators
    const closes = history.map(h => h.close);

    // ATR
    const atrValues = ATR(history, this.atrPeriod);
    if (atrValues.length < 2) return;
    const currentATR = getLatest(atrValues);
    const prevATR = atrValues.length > 1 ? atrValues[atrValues.length - 2] : currentATR;

    // 归一化ATR (ATR / 价格) / Normalized ATR
    const normalizedATR = (currentATR / candle.close) * 100;

    // 更新 ATR 历史 / Update ATR history
    this._atrHistory.push(normalizedATR);
    if (this._atrHistory.length > this.volatilityLookback) {
      this._atrHistory.shift();
    }

    // 计算波动率百分位 / Calculate volatility percentile
    const volPercentile = this._calculatePercentile(normalizedATR, this._atrHistory);

    // 确定当前 Regime / Determine current regime
    this._prevRegime = this._currentRegime;
    const newRegime = this._determineRegime(volPercentile);
    if (newRegime !== this._currentRegime) {
      if (this._regimeCandidate === newRegime) {
        this._regimeCandidateCount += 1;
      } else {
        this._regimeCandidate = newRegime;
        this._regimeCandidateCount = 1;
      }

      if (this._regimeCandidateCount >= this._regimeConfirmBars) {
        this._currentRegime = newRegime;
        this._regimeCandidate = null;
        this._regimeCandidateCount = 0;
      }
    } else {
      this._regimeCandidate = null;
      this._regimeCandidateCount = 0;
    }

    const entryRegime = this._regimeCandidate || this._currentRegime;

    // 移动平均线 / Moving averages
    const fastMAValues = EMA(closes, this.fastMAPeriod);
    const fastMA = getLatest(fastMAValues);
    const prevFastMA = fastMAValues.length > 1 ? fastMAValues[fastMAValues.length - 2] : fastMA;
    const slowMA = getLatest(SMA(closes, this.slowMAPeriod));
    const emaSlope = fastMA - prevFastMA;
    const emaSlopeUp = emaSlope > 0;

    // ADX 趋势强度 / ADX trend strength
    const adxValues = ADX(history, this.adxPeriod);
    const currentADX = adxValues.length > 0 ? getLatest(adxValues) : null;
    const adxValue = currentADX ? currentADX.adx : 0;
    const pdi = currentADX ? currentADX.pdi : 0;
    const mdi = currentADX ? currentADX.mdi : 0;

    // 趋势方向 / Trend direction
    const trendUp = fastMA > slowMA && pdi > mdi;
    const maDeadCross = fastMA < slowMA;
    const diReversal = pdi < mdi;
    const strongTrend = adxValue > this.adxThreshold;

    const atrBreakoutHigh = this._getAtrBreakoutHigh(history);
    const atrBreakout =
      atrBreakoutHigh !== null &&
      candle.close > atrBreakoutHigh + prevATR * this.atrBreakoutMultiplier;
    const lowBreakoutTriggered =
      atrBreakoutHigh !== null &&
      candle.high > atrBreakoutHigh + prevATR * this.atrBreakoutMultiplier;
    const lowBreakoutConfirmed = atrBreakoutHigh !== null && candle.close > atrBreakoutHigh;
    const lowBreakout = lowBreakoutTriggered && lowBreakoutConfirmed;

    // 保存指标 / Save indicators
    this.setIndicator('ATR', currentATR);
    this.setIndicator('normalizedATR', normalizedATR);
    this.setIndicator('volPercentile', volPercentile);
    this.setIndicator('regime', this._currentRegime);
    this.setIndicator('entryRegime', entryRegime);
    this.setIndicator('fastMA', fastMA);
    this.setIndicator('prevFastMA', prevFastMA);
    this.setIndicator('emaSlope', emaSlope);
    this.setIndicator('slowMA', slowMA);
    this.setIndicator('ADX', adxValue);
    this.setIndicator('atrBreakoutHigh', atrBreakoutHigh);
    this.setIndicator('atrBreakout', atrBreakout);
    this.setIndicator('lowBreakout', lowBreakout);

    // 检测Regime 变化 / Detect regime change
    if (this._currentRegime !== this._prevRegime) {
      this._regimeChanges++;
      this.log(`Regime切换: ${this._prevRegime} -> ${this._currentRegime}, 波动百分位${volPercentile.toFixed(0)}%`);
    }

    // 获取持仓 / Get position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && Math.abs(position.amount) > 0;

    // 根据不同 Regime 执行策略 / Execute strategy based on regime
    if (!hasPosition) {
      this._handleEntry(candle, {
        regime: entryRegime,
        volPercentile,
        trendUp,
        strongTrend,
        currentATR,
        emaSlope,
        emaSlopeUp,
        atrBreakout,
        lowBreakout,
        fastMA,
        slowMA,
      });
    } else {
      this._handleExit(candle, {
        regime: this._currentRegime,
        currentATR,
        maDeadCross,
        diReversal,
      });
    }
  }

  /**
   * 确定波动率Regime
   * @private
   */
  _determineRegime(percentile) {
    if (percentile >= this.extremeVolThreshold) {
      return VolatilityRegime.EXTREME;
    } else if (percentile >= this.highVolThreshold) {
      return VolatilityRegime.HIGH;
    } else if (percentile <= this.lowVolThreshold) {
      return VolatilityRegime.LOW;
    } else {
      return VolatilityRegime.NORMAL;
    }
  }

  /**
   * 处理入场
   * @private
   */
  _handleEntry(candle, indicators) {
    const {
      regime,
      volPercentile,
      trendUp,
      strongTrend,
      currentATR,
      emaSlopeUp,
      atrBreakout,
      lowBreakout,
    } = indicators;

    // No entry in extreme volatility when disabled.
    if (regime === VolatilityRegime.EXTREME && this.disableInExtreme) {
      this.log(`Extreme volatility, entry disabled. Percentile=${volPercentile.toFixed(0)}%`);
      return;
    }

    let signal = false;
    let reason = '';
    let positionPercent = this.basePositionPercent;

    if (regime === VolatilityRegime.LOW) {
      positionPercent *= this.lowVolPositionMult;
    } else if (regime === VolatilityRegime.HIGH) {
      positionPercent *= this.highVolPositionMult;
    } else if (regime === VolatilityRegime.EXTREME) {
      positionPercent *= 0.3;
    }

    if (regime === VolatilityRegime.LOW && lowBreakout && trendUp && emaSlopeUp) {
      signal = true;
      reason = 'Low volatility breakout entry';
    }

    if (!signal) {
      switch (regime) {
        case VolatilityRegime.LOW:
          // Entry handled above for LOW regime.
          break;

        case VolatilityRegime.NORMAL:
          if (trendUp && strongTrend) {
            signal = true;
            reason = 'Normal regime trend entry';
          }
          break;

        case VolatilityRegime.HIGH:
          if (atrBreakout && trendUp && strongTrend && emaSlopeUp) {
            signal = true;
            reason = 'High volatility ATR breakout';
          }
          break;

        case VolatilityRegime.EXTREME:
          if (!this.disableInExtreme && atrBreakout && trendUp && strongTrend && emaSlopeUp) {
            signal = true;
            reason = 'Extreme volatility ATR breakout';
          }
          break;
      }
    }

    if (signal) {
      this.log(`${reason}, Regime=${regime}, position=${positionPercent.toFixed(0)}%`);

      this._entryPrice = candle.close;
      this._stopLoss = candle.close - this.stopLossMultiplier * currentATR;
      this._highestPrice = candle.high;

      this.setState('direction', 'long');
      this.setState('entryRegime', regime);
      this.setState('entryVolPercentile', volPercentile);

      this.setBuySignal(`${reason}`);
      this.buyPercent(this.symbol, positionPercent);
    }
  }
  /**
   * 处理出场
   * @private
   */
  _handleExit(candle, indicators) {
    const { regime, currentATR, maDeadCross, diReversal } = indicators;
    const direction = this.getState('direction');

    if (direction !== 'long') return;
    // Trailing stop loss adjustment.
    if (this._highestPrice === null) {
      this._highestPrice = candle.high;
    } else if (candle.high > this._highestPrice) {
      this._highestPrice = candle.high;
    }

    let effectiveStopMult = this.stopLossMultiplier;
    if (regime === VolatilityRegime.HIGH || regime === VolatilityRegime.EXTREME) {
      effectiveStopMult = this.stopLossMultiplier * 1.5;
    }

    const trailingStop = this._highestPrice - effectiveStopMult * currentATR;
    if (this._stopLoss === null) {
      this._stopLoss = trailingStop;
    } else {
      this._stopLoss = Math.max(this._stopLoss, trailingStop);
    }
    const effectiveStop = this._stopLoss;

    // 止损检查 / Stop loss check
    if (candle.close <= effectiveStop) {
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2);
      this.log(`止损触发, Regime=${regime}, 价格=${candle.close.toFixed(2)}, PnL=${pnl}%`);

      this.setSellSignal(`Stop Loss @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
      return;
    }

    // Regime 恶化出场 / Exit on regime deterioration
    if (regime === VolatilityRegime.EXTREME && this.disableInExtreme) {
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2);
      this.log(`Regime恶化出场, 切换到极端波动 PnL=${pnl}%`);

      this.setSellSignal(`Extreme Vol Exit @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
      return;
    }

    // 趋势反转出场 / MA/DI reversal exit
    if (maDeadCross || diReversal) {
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2);
      this.log(`MA/DI reversal exit, PnL=${pnl}%`);

      this.setSellSignal(`MA/DI Reversal @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
    }
  }

  /**
   * ATR breakout helper.
   * @private
   */
  _getAtrBreakoutHigh(history) {
    if (!history || history.length < 2) return null;

    const end = history.length - 1; // exclude current candle
    const start = Math.max(0, end - this.atrBreakoutLookback);
    let high = null;

    for (let i = start; i < end; i++) {
      const value = history[i].high;
      if (high === null || value > high) {
        high = value;
      }
    }

    return high;
  }

  /**
   * 计算百分位
   * @private
   */
  _calculatePercentile(value, history) {
    if (history.length < 10) return 50;

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
    this._highestPrice = null;
    this.setState('direction', null);
    this.setState('entryRegime', null);
    this.setState('entryVolPercentile', null);
  }

  /**
   * 获取当前 Regime
   * @returns {string}
   */
  getCurrentRegime() {
    return this._currentRegime;
  }

  /**
   * 获取 Regime 统计
   * @returns {Object}
   */
  getRegimeStats() {
    return {
      currentRegime: this._currentRegime,
      regimeChanges: this._regimeChanges,
      atrHistoryLength: this._atrHistory.length,
    };
  }
}

export default VolatilityRegimeStrategy;












