/**
 * 波动率 Regime 切换策略
 * Volatility Regime Strategy
 *
 * 识别市场高/低波动率状态，根据不同 Regime 采用不同交易逻辑
 * - 低波动期：等待突破，蓄势待发
 * - 高波动期：趋势跟踪，顺势而为
 * - 过渡期：谨慎操作，控制仓位
 */

import { BaseStrategy } from './BaseStrategy.js';
import { ATR, EMA, SMA, BollingerBands, ADX, getLatest } from '../utils/indicators.js';

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
 * 波动率 Regime 策略类
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
    this.atrPeriod = params.atrPeriod || 14;

    // 波动率历史周期 / Volatility history lookback
    this.volatilityLookback = params.volatilityLookback || 100;

    // 低波动阈值 (百分位) / Low volatility threshold
    this.lowVolThreshold = params.lowVolThreshold || 25;

    // 高波动阈值 (百分位) / High volatility threshold
    this.highVolThreshold = params.highVolThreshold || 75;

    // 极端波动阈值 (百分位) / Extreme volatility threshold
    this.extremeVolThreshold = params.extremeVolThreshold || 95;

    // 趋势均线周期 / Trend MA periods
    this.fastMAPeriod = params.fastMAPeriod || 10;
    this.slowMAPeriod = params.slowMAPeriod || 30;

    // ADX 周期和阈值 / ADX period and threshold
    this.adxPeriod = params.adxPeriod || 14;
    this.adxThreshold = params.adxThreshold || 25;

    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 基础仓位百分比 / Base position percentage
    this.basePositionPercent = params.positionPercent || 95;

    // 低波动期仓位调整 / Low volatility position adjustment
    this.lowVolPositionMult = params.lowVolPositionMult || 0.5;

    // 高波动期仓位调整 / High volatility position adjustment
    this.highVolPositionMult = params.highVolPositionMult || 0.8;

    // 极端波动禁止交易 / Disable trading in extreme volatility
    this.disableInExtreme = params.disableInExtreme !== false;

    // 止损 ATR 倍数 / Stop loss ATR multiplier
    this.stopLossMultiplier = params.stopLossMultiplier || 2.0;

    // 内部状态
    this._atrHistory = [];
    this._currentRegime = VolatilityRegime.NORMAL;
    this._prevRegime = VolatilityRegime.NORMAL;
    this._entryPrice = null;
    this._stopLoss = null;
    this._regimeChanges = 0;
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();

    this.log(`波动率Regime策略初始化`);
    this.log(`ATR=${this.atrPeriod}, 低阈值=${this.lowVolThreshold}%, 高阈值=${this.highVolThreshold}%`);
  }

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) {
    // 确保足够数据 / Ensure enough data
    const requiredLength = Math.max(this.atrPeriod, this.slowMAPeriod, this.adxPeriod, 50);
    if (history.length < requiredLength) {
      return;
    }

    // 计算指标 / Calculate indicators
    const closes = history.map(h => h.close);

    // ATR
    const atrValues = ATR(history, this.atrPeriod);
    if (atrValues.length < 2) return;
    const currentATR = getLatest(atrValues);

    // 归一化 ATR (ATR / 价格) / Normalized ATR
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
    this._currentRegime = this._determineRegime(volPercentile);

    // 移动平均线 / Moving averages
    const fastMA = getLatest(EMA(closes, this.fastMAPeriod));
    const slowMA = getLatest(SMA(closes, this.slowMAPeriod));

    // ADX 趋势强度 / ADX trend strength
    const adxValues = ADX(history, this.adxPeriod);
    const currentADX = adxValues.length > 0 ? getLatest(adxValues) : null;
    const adxValue = currentADX ? currentADX.adx : 0;
    const pdi = currentADX ? currentADX.pdi : 0;
    const mdi = currentADX ? currentADX.mdi : 0;

    // 趋势方向 / Trend direction
    const trendUp = fastMA > slowMA && pdi > mdi;
    const trendDown = fastMA < slowMA && mdi > pdi;
    const strongTrend = adxValue > this.adxThreshold;

    // 保存指标 / Save indicators
    this.setIndicator('ATR', currentATR);
    this.setIndicator('normalizedATR', normalizedATR);
    this.setIndicator('volPercentile', volPercentile);
    this.setIndicator('regime', this._currentRegime);
    this.setIndicator('fastMA', fastMA);
    this.setIndicator('slowMA', slowMA);
    this.setIndicator('ADX', adxValue);

    // 检测 Regime 变化 / Detect regime change
    if (this._currentRegime !== this._prevRegime) {
      this._regimeChanges++;
      this.log(`Regime切换: ${this._prevRegime} → ${this._currentRegime}, 波动百分位=${volPercentile.toFixed(0)}%`);
    }

    // 获取持仓 / Get position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 根据不同 Regime 执行策略 / Execute strategy based on regime
    if (!hasPosition) {
      this._handleEntry(candle, {
        regime: this._currentRegime,
        prevRegime: this._prevRegime,
        volPercentile,
        trendUp,
        trendDown,
        strongTrend,
        currentATR,
        fastMA,
        slowMA,
      });
    } else {
      this._handleExit(candle, {
        regime: this._currentRegime,
        currentATR,
        trendUp,
        strongTrend,
      });
    }
  }

  /**
   * 确定波动率 Regime
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
    const { regime, prevRegime, volPercentile, trendUp, trendDown, strongTrend, currentATR, fastMA, slowMA } = indicators;

    // 极端波动禁止开仓 / No entry in extreme volatility
    if (regime === VolatilityRegime.EXTREME && this.disableInExtreme) {
      this.log(`极端波动, 禁止开仓, 百分位=${volPercentile.toFixed(0)}%`);
      return;
    }

    let signal = false;
    let reason = '';
    let positionPercent = this.basePositionPercent;

    switch (regime) {
      case VolatilityRegime.LOW:
        // 低波动期: 等待从低波动向正常/高波动转换 + 趋势确认
        if (prevRegime === VolatilityRegime.LOW && regime !== VolatilityRegime.LOW) {
          // Regime 变化时入场
          if (trendUp) {
            signal = true;
            reason = `低波动突破, Regime切换, 趋势向上`;
          }
        } else if (trendUp && strongTrend) {
          // 低波动期但有强趋势，小仓位试探
          signal = true;
          reason = `低波动期趋势入场`;
          positionPercent = this.basePositionPercent * this.lowVolPositionMult;
        }
        break;

      case VolatilityRegime.NORMAL:
        // 正常波动期: 标准趋势跟踪
        if (trendUp && strongTrend) {
          signal = true;
          reason = `正常波动趋势入场, ADX强势`;
        }
        break;

      case VolatilityRegime.HIGH:
        // 高波动期: 趋势跟踪，但降低仓位
        if (trendUp && strongTrend) {
          signal = true;
          reason = `高波动趋势入场`;
          positionPercent = this.basePositionPercent * this.highVolPositionMult;
        }
        break;

      case VolatilityRegime.EXTREME:
        // 极端波动: 不开仓（除非禁用此规则）
        if (!this.disableInExtreme && trendUp && strongTrend) {
          signal = true;
          reason = `极端波动趋势入场 (高风险)`;
          positionPercent = this.basePositionPercent * 0.3;
        }
        break;
    }

    if (signal) {
      this.log(`${reason}, Regime=${regime}, 仓位=${positionPercent.toFixed(0)}%`);

      this._entryPrice = candle.close;
      this._stopLoss = candle.close - this.stopLossMultiplier * currentATR;

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
    const { regime, currentATR, trendUp, strongTrend } = indicators;
    const direction = this.getState('direction');
    const entryRegime = this.getState('entryRegime');

    if (direction !== 'long') return;

    // 动态调整止损 / Dynamic stop loss adjustment
    let effectiveStopMult = this.stopLossMultiplier;
    if (regime === VolatilityRegime.HIGH || regime === VolatilityRegime.EXTREME) {
      effectiveStopMult = this.stopLossMultiplier * 1.5; // 高波动期放宽止损
    }

    const dynamicStop = this._entryPrice - effectiveStopMult * currentATR;
    const effectiveStop = Math.max(this._stopLoss, dynamicStop);

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
      this.log(`Regime恶化出场, 切换到极端波动, PnL=${pnl}%`);

      this.setSellSignal(`Extreme Vol Exit @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
      return;
    }

    // 趋势反转出场 / Trend reversal exit
    if (!trendUp && !strongTrend) {
      const pnl = ((candle.close - this._entryPrice) / this._entryPrice * 100).toFixed(2);
      this.log(`趋势反转出场, PnL=${pnl}%`);

      this.setSellSignal(`Trend Reversal @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
    }
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
