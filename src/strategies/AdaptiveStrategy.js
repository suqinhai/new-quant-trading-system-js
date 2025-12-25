/**
 * 自适应参数策略 (Adaptive Strategy)
 *
 * 核心理念：策略不变，参数随市场状态动态调整
 * 这是专业量化 vs 普通量化的分水岭
 *
 * 自适应机制：
 * 1. SMA 周期随波动率变化 - 高波动用短周期，低波动用长周期
 * 2. RSI 阈值随市场状态变化 - 趋势市放宽阈值，震荡市收窄阈值
 * 3. 布林带宽度随 ATR 调整 - 波动率高时扩大通道，波动率低时收窄通道
 *
 * 设计哲学：
 * - 参数是策略的一部分，不是固定常数
 * - 市场有状态，参数应适应状态
 * - 避免过拟合，使用动态调整而非静态优化
 */

import BaseStrategy from './BaseStrategy.js';
import { MarketRegimeDetector, MarketRegime } from '../utils/MarketRegimeDetector.js';
import {
  SMA, EMA, RSI, ATR, BollingerBands, MACD,
  getLatest, detectCrossover, VolatilityPercentile
} from '../utils/indicators.js';
import { toNumber } from '../utils/helpers.js';

/**
 * 自适应模式枚举
 */
export const AdaptiveMode = {
  FULL: 'full',           // 完全自适应（SMA + RSI + BB 全部自适应）
  SMA_ONLY: 'sma_only',   // 仅 SMA 周期自适应
  RSI_ONLY: 'rsi_only',   // 仅 RSI 阈值自适应
  BB_ONLY: 'bb_only',     // 仅布林带自适应
  CUSTOM: 'custom',       // 自定义组合
};

/**
 * 自适应参数策略类
 */
export class AdaptiveStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) {
    super(params);

    this.name = params.name || 'AdaptiveStrategy';

    // ============================================
    // 交易参数 / Trading Parameters
    // ============================================
    this.symbol = params.symbol || 'BTC/USDT';
    this.positionPercent = params.positionPercent || 95;

    // ============================================
    // 自适应模式 / Adaptive Mode
    // ============================================
    this.adaptiveMode = params.adaptiveMode || AdaptiveMode.FULL;
    this.enableSMAAdaptive = params.enableSMAAdaptive !== false;
    this.enableRSIAdaptive = params.enableRSIAdaptive !== false;
    this.enableBBAdaptive = params.enableBBAdaptive !== false;

    // ============================================
    // SMA 自适应参数 / SMA Adaptive Parameters
    // ============================================
    // 基准周期
    this.smaBaseFast = params.smaBaseFast || 10;
    this.smaBaseSlow = params.smaBaseSlow || 30;

    // 波动率调整范围 (0.5 = 可缩短/延长 50%)
    this.smaPeriodAdjustRange = params.smaPeriodAdjustRange || 0.5;

    // 波动率阈值
    this.smaVolLowThreshold = params.smaVolLowThreshold || 25;   // 低波动百分位
    this.smaVolHighThreshold = params.smaVolHighThreshold || 75; // 高波动百分位

    // ============================================
    // RSI 自适应参数 / RSI Adaptive Parameters
    // ============================================
    // 基准阈值
    this.rsiPeriod = params.rsiPeriod || 14;
    this.rsiBaseOversold = params.rsiBaseOversold || 30;
    this.rsiBaseOverbought = params.rsiBaseOverbought || 70;

    // 阈值调整范围 (趋势市 vs 震荡市)
    this.rsiTrendingOversold = params.rsiTrendingOversold || 25;     // 趋势市超卖
    this.rsiTrendingOverbought = params.rsiTrendingOverbought || 75; // 趋势市超买
    this.rsiRangingOversold = params.rsiRangingOversold || 35;       // 震荡市超卖
    this.rsiRangingOverbought = params.rsiRangingOverbought || 65;   // 震荡市超买

    // ============================================
    // 布林带自适应参数 / Bollinger Bands Adaptive Parameters
    // ============================================
    this.bbPeriod = params.bbPeriod || 20;
    this.bbBaseStdDev = params.bbBaseStdDev || 2.0;

    // 标准差调整范围
    this.bbMinStdDev = params.bbMinStdDev || 1.5;  // 低波动时
    this.bbMaxStdDev = params.bbMaxStdDev || 3.0;  // 高波动时

    // ATR 参考周期
    this.atrPeriod = params.atrPeriod || 14;
    this.atrLookback = params.atrLookback || 100;

    // ============================================
    // 信号融合参数 / Signal Fusion Parameters
    // ============================================
    // 信号权重 (用于多信号融合)
    this.smaWeight = params.smaWeight || 0.4;
    this.rsiWeight = params.rsiWeight || 0.3;
    this.bbWeight = params.bbWeight || 0.3;

    // 信号确认阈值
    this.signalThreshold = params.signalThreshold || 0.5;

    // 趋势过滤
    this.useTrendFilter = params.useTrendFilter !== false;
    this.trendMAPeriod = params.trendMAPeriod || 50;

    // ============================================
    // 市场状态检测器 / Market Regime Detector
    // ============================================
    this.regimeDetector = new MarketRegimeDetector({
      adxPeriod: params.adxPeriod || 14,
      adxTrendThreshold: params.adxTrendThreshold || 25,
      bbPeriod: this.bbPeriod,
      atrPeriod: this.atrPeriod,
      lowVolPercentile: this.smaVolLowThreshold,
      highVolPercentile: this.smaVolHighThreshold,
      extremeVolPercentile: params.extremeVolPercentile || 95,
    });

    // ============================================
    // 内部状态 / Internal State
    // ============================================
    this._atrHistory = [];
    this._adaptiveParams = {
      smaFastPeriod: this.smaBaseFast,
      smaSlowPeriod: this.smaBaseSlow,
      rsiOversold: this.rsiBaseOversold,
      rsiOverbought: this.rsiBaseOverbought,
      bbStdDev: this.bbBaseStdDev,
    };
    this._signalHistory = [];
    this._lastSignalTime = 0;
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();
    this.log(`自适应策略初始化 | 模式: ${this.adaptiveMode}`);
    this.log(`SMA 自适应: ${this.enableSMAAdaptive} | RSI 自适应: ${this.enableRSIAdaptive} | BB 自适应: ${this.enableBBAdaptive}`);
  }

  /**
   * 主交易逻辑
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) {
    // 数据量检查
    const minRequired = Math.max(
      this.smaBaseSlow * 2,
      this.bbPeriod + 20,
      this.atrLookback,
      this.trendMAPeriod + 10
    );

    if (history.length < minRequired) {
      return;
    }

    const currentPrice = toNumber(candle.close);
    const closes = history.map(h => toNumber(h.close));

    // ============================================
    // 1. 更新市场状态
    // ============================================
    const regimeInfo = this.regimeDetector.update(candle, history);
    const { regime, indicators: regimeIndicators } = regimeInfo;

    // 极端波动时停止交易
    if (regime === MarketRegime.EXTREME) {
      this.setIndicator('regime', regime);
      this.setIndicator('tradingAllowed', false);
      this.log(`⚠️ 极端波动，暂停交易 | 波动率指数: ${regimeIndicators.volatilityIndex?.toFixed(1)}%`);
      return;
    }

    // ============================================
    // 2. 计算自适应参数
    // ============================================
    this._updateAdaptiveParams(candle, history, regimeInfo);

    // ============================================
    // 3. 计算所有指标
    // ============================================
    const signals = this._calculateSignals(candle, history, regimeInfo);

    // ============================================
    // 4. 融合信号
    // ============================================
    const fusedSignal = this._fuseSignals(signals, regime);

    // ============================================
    // 5. 执行交易
    // ============================================
    this._executeSignal(fusedSignal, currentPrice, candle);

    // ============================================
    // 6. 保存指标 (用于可视化/监控)
    // ============================================
    this._saveIndicators(candle, signals, fusedSignal, regimeInfo);
  }

  /**
   * 更新自适应参数
   * @private
   */
  _updateAdaptiveParams(candle, history, regimeInfo) {
    const { regime, indicators } = regimeInfo;
    const volatilityIndex = indicators.volatilityIndex || 50;
    const atrPercentile = indicators.atrPercentile || 50;

    // ============================================
    // SMA 周期自适应 (基于波动率)
    // ============================================
    if (this.enableSMAAdaptive) {
      // 波动率高 → 周期短 (快速响应)
      // 波动率低 → 周期长 (减少噪音)
      const volFactor = this._calculateVolatilityFactor(volatilityIndex);

      // 快线周期调整
      this._adaptiveParams.smaFastPeriod = Math.round(
        this.smaBaseFast * (1 + this.smaPeriodAdjustRange * (1 - volFactor * 2))
      );

      // 慢线周期调整
      this._adaptiveParams.smaSlowPeriod = Math.round(
        this.smaBaseSlow * (1 + this.smaPeriodAdjustRange * (1 - volFactor * 2))
      );

      // 确保周期在合理范围内
      this._adaptiveParams.smaFastPeriod = Math.max(5, Math.min(30, this._adaptiveParams.smaFastPeriod));
      this._adaptiveParams.smaSlowPeriod = Math.max(15, Math.min(60, this._adaptiveParams.smaSlowPeriod));

      // 确保快线 < 慢线
      if (this._adaptiveParams.smaFastPeriod >= this._adaptiveParams.smaSlowPeriod) {
        this._adaptiveParams.smaSlowPeriod = this._adaptiveParams.smaFastPeriod + 10;
      }
    }

    // ============================================
    // RSI 阈值自适应 (基于市场状态)
    // ============================================
    if (this.enableRSIAdaptive) {
      if (regime === MarketRegime.TRENDING_UP || regime === MarketRegime.TRENDING_DOWN) {
        // 趋势市：放宽阈值，让趋势跑得更远
        this._adaptiveParams.rsiOversold = this.rsiTrendingOversold;
        this._adaptiveParams.rsiOverbought = this.rsiTrendingOverbought;
      } else if (regime === MarketRegime.RANGING) {
        // 震荡市：收窄阈值，更早捕捉反转
        this._adaptiveParams.rsiOversold = this.rsiRangingOversold;
        this._adaptiveParams.rsiOverbought = this.rsiRangingOverbought;
      } else if (regime === MarketRegime.HIGH_VOLATILITY) {
        // 高波动：使用基准阈值
        this._adaptiveParams.rsiOversold = this.rsiBaseOversold;
        this._adaptiveParams.rsiOverbought = this.rsiBaseOverbought;
      }
    }

    // ============================================
    // 布林带标准差自适应 (基于 ATR)
    // ============================================
    if (this.enableBBAdaptive) {
      // ATR 百分位高 → 标准差大 (通道宽)
      // ATR 百分位低 → 标准差小 (通道窄)
      const atrFactor = atrPercentile / 100;

      this._adaptiveParams.bbStdDev = this.bbMinStdDev +
        (this.bbMaxStdDev - this.bbMinStdDev) * atrFactor;

      // 限制在范围内
      this._adaptiveParams.bbStdDev = Math.max(
        this.bbMinStdDev,
        Math.min(this.bbMaxStdDev, this._adaptiveParams.bbStdDev)
      );
    }
  }

  /**
   * 计算波动率因子 (0-1)
   * @private
   */
  _calculateVolatilityFactor(volatilityIndex) {
    // 将波动率指数映射到 0-1
    // 25% 以下 → 0 (低波动)
    // 75% 以上 → 1 (高波动)
    if (volatilityIndex <= this.smaVolLowThreshold) {
      return 0;
    } else if (volatilityIndex >= this.smaVolHighThreshold) {
      return 1;
    } else {
      return (volatilityIndex - this.smaVolLowThreshold) /
             (this.smaVolHighThreshold - this.smaVolLowThreshold);
    }
  }

  /**
   * 计算所有信号
   * @private
   */
  _calculateSignals(candle, history, regimeInfo) {
    const closes = history.map(h => toNumber(h.close));
    const currentPrice = toNumber(candle.close);

    const signals = {
      sma: { signal: 0, strength: 0, reason: '' },
      rsi: { signal: 0, strength: 0, reason: '' },
      bb: { signal: 0, strength: 0, reason: '' },
      trend: { direction: 'neutral', strength: 0 },
    };

    // ============================================
    // SMA 信号 (使用自适应周期)
    // ============================================
    const fastMA = SMA(closes, this._adaptiveParams.smaFastPeriod);
    const slowMA = SMA(closes, this._adaptiveParams.smaSlowPeriod);

    if (fastMA.length >= 2 && slowMA.length >= 2) {
      const crossover = detectCrossover(fastMA, slowMA);
      const fastCurrent = getLatest(fastMA);
      const slowCurrent = getLatest(slowMA);

      // 金叉买入
      if (crossover.bullish) {
        const strength = Math.min(1, Math.abs(fastCurrent - slowCurrent) / slowCurrent * 100);
        signals.sma = {
          signal: 1,
          strength,
          reason: `SMA 金叉 | 快线(${this._adaptiveParams.smaFastPeriod}): ${fastCurrent.toFixed(2)} > 慢线(${this._adaptiveParams.smaSlowPeriod}): ${slowCurrent.toFixed(2)}`,
        };
      }
      // 死叉卖出
      else if (crossover.bearish) {
        const strength = Math.min(1, Math.abs(fastCurrent - slowCurrent) / slowCurrent * 100);
        signals.sma = {
          signal: -1,
          strength,
          reason: `SMA 死叉 | 快线(${this._adaptiveParams.smaFastPeriod}): ${fastCurrent.toFixed(2)} < 慢线(${this._adaptiveParams.smaSlowPeriod}): ${slowCurrent.toFixed(2)}`,
        };
      }

      // 记录 SMA 指标
      this.setIndicator('smaFast', fastCurrent);
      this.setIndicator('smaSlow', slowCurrent);
    }

    // ============================================
    // RSI 信号 (使用自适应阈值)
    // ============================================
    const rsiValues = RSI(closes, this.rsiPeriod);
    if (rsiValues.length > 0) {
      const currentRSI = getLatest(rsiValues);
      const prevRSI = rsiValues.length > 1 ? rsiValues[rsiValues.length - 2] : currentRSI;

      // 超卖反弹
      if (currentRSI <= this._adaptiveParams.rsiOversold) {
        const strength = (this._adaptiveParams.rsiOversold - currentRSI) / this._adaptiveParams.rsiOversold;
        signals.rsi = {
          signal: 1,
          strength: Math.min(1, strength),
          reason: `RSI 超卖 | RSI: ${currentRSI.toFixed(1)} <= 阈值: ${this._adaptiveParams.rsiOversold}`,
        };
      }
      // 超买回落
      else if (currentRSI >= this._adaptiveParams.rsiOverbought) {
        const strength = (currentRSI - this._adaptiveParams.rsiOverbought) / (100 - this._adaptiveParams.rsiOverbought);
        signals.rsi = {
          signal: -1,
          strength: Math.min(1, strength),
          reason: `RSI 超买 | RSI: ${currentRSI.toFixed(1)} >= 阈值: ${this._adaptiveParams.rsiOverbought}`,
        };
      }
      // RSI 从超卖区域回升
      else if (prevRSI <= this._adaptiveParams.rsiOversold && currentRSI > this._adaptiveParams.rsiOversold) {
        signals.rsi = {
          signal: 0.5,  // 弱买入信号
          strength: 0.5,
          reason: `RSI 离开超卖区 | RSI: ${prevRSI.toFixed(1)} → ${currentRSI.toFixed(1)}`,
        };
      }
      // RSI 从超买区域回落
      else if (prevRSI >= this._adaptiveParams.rsiOverbought && currentRSI < this._adaptiveParams.rsiOverbought) {
        signals.rsi = {
          signal: -0.5,  // 弱卖出信号
          strength: 0.5,
          reason: `RSI 离开超买区 | RSI: ${prevRSI.toFixed(1)} → ${currentRSI.toFixed(1)}`,
        };
      }

      this.setIndicator('rsi', currentRSI);
      this.setIndicator('rsiOversold', this._adaptiveParams.rsiOversold);
      this.setIndicator('rsiOverbought', this._adaptiveParams.rsiOverbought);
    }

    // ============================================
    // 布林带信号 (使用自适应标准差)
    // ============================================
    const bbValues = BollingerBands(closes, this.bbPeriod, this._adaptiveParams.bbStdDev);
    if (bbValues.length > 0) {
      const currentBB = getLatest(bbValues);
      const prevBB = bbValues.length > 1 ? bbValues[bbValues.length - 2] : currentBB;
      const prevPrice = closes.length > 1 ? closes[closes.length - 2] : currentPrice;

      // 计算 %B (价格在布林带中的位置)
      const percentB = (currentPrice - currentBB.lower) / (currentBB.upper - currentBB.lower);

      // 触及下轨买入
      if (currentPrice <= currentBB.lower) {
        const strength = Math.min(1, (currentBB.lower - currentPrice) / currentBB.lower * 100);
        signals.bb = {
          signal: 1,
          strength,
          reason: `触及布林带下轨 | 价格: ${currentPrice.toFixed(2)} <= 下轨: ${currentBB.lower.toFixed(2)} (σ=${this._adaptiveParams.bbStdDev.toFixed(2)})`,
        };
      }
      // 触及上轨卖出
      else if (currentPrice >= currentBB.upper) {
        const strength = Math.min(1, (currentPrice - currentBB.upper) / currentBB.upper * 100);
        signals.bb = {
          signal: -1,
          strength,
          reason: `触及布林带上轨 | 价格: ${currentPrice.toFixed(2)} >= 上轨: ${currentBB.upper.toFixed(2)} (σ=${this._adaptiveParams.bbStdDev.toFixed(2)})`,
        };
      }
      // 从下轨反弹
      else if (prevPrice <= prevBB.lower && currentPrice > currentBB.lower) {
        signals.bb = {
          signal: 0.7,
          strength: 0.7,
          reason: `布林带下轨反弹 | %B: ${(percentB * 100).toFixed(1)}%`,
        };
      }
      // 从上轨回落
      else if (prevPrice >= prevBB.upper && currentPrice < currentBB.upper) {
        signals.bb = {
          signal: -0.7,
          strength: 0.7,
          reason: `布林带上轨回落 | %B: ${(percentB * 100).toFixed(1)}%`,
        };
      }

      this.setIndicator('bbUpper', currentBB.upper);
      this.setIndicator('bbMiddle', currentBB.middle);
      this.setIndicator('bbLower', currentBB.lower);
      this.setIndicator('bbStdDev', this._adaptiveParams.bbStdDev);
      this.setIndicator('percentB', percentB);
    }

    // ============================================
    // 趋势方向 (用于过滤)
    // ============================================
    if (this.useTrendFilter) {
      const trendMA = SMA(closes, this.trendMAPeriod);
      if (trendMA.length > 0) {
        const trendMAValue = getLatest(trendMA);
        const trendStrength = Math.abs(currentPrice - trendMAValue) / trendMAValue;

        signals.trend = {
          direction: currentPrice > trendMAValue ? 'up' : 'down',
          strength: Math.min(1, trendStrength * 100),
          maValue: trendMAValue,
        };

        this.setIndicator('trendMA', trendMAValue);
        this.setIndicator('trendDirection', signals.trend.direction);
      }
    }

    return signals;
  }

  /**
   * 融合多个信号
   * @private
   */
  _fuseSignals(signals, regime) {
    const { sma, rsi, bb, trend } = signals;

    // 计算加权信号
    let weightedSignal = 0;
    let totalWeight = 0;

    // 根据市场状态调整权重
    let adjustedWeights = {
      sma: this.smaWeight,
      rsi: this.rsiWeight,
      bb: this.bbWeight,
    };

    // 趋势市：增加 SMA 权重
    if (regime === MarketRegime.TRENDING_UP || regime === MarketRegime.TRENDING_DOWN) {
      adjustedWeights.sma *= 1.5;
      adjustedWeights.rsi *= 0.8;
    }
    // 震荡市：增加 RSI 和 BB 权重
    else if (regime === MarketRegime.RANGING) {
      adjustedWeights.sma *= 0.7;
      adjustedWeights.rsi *= 1.3;
      adjustedWeights.bb *= 1.2;
    }
    // 高波动：降低整体信号强度
    else if (regime === MarketRegime.HIGH_VOLATILITY) {
      adjustedWeights.sma *= 0.8;
      adjustedWeights.rsi *= 0.8;
      adjustedWeights.bb *= 0.8;
    }

    // 归一化权重
    const weightSum = adjustedWeights.sma + adjustedWeights.rsi + adjustedWeights.bb;
    adjustedWeights.sma /= weightSum;
    adjustedWeights.rsi /= weightSum;
    adjustedWeights.bb /= weightSum;

    // 计算加权信号
    if (sma.signal !== 0) {
      weightedSignal += sma.signal * sma.strength * adjustedWeights.sma;
      totalWeight += adjustedWeights.sma;
    }

    if (rsi.signal !== 0) {
      weightedSignal += rsi.signal * rsi.strength * adjustedWeights.rsi;
      totalWeight += adjustedWeights.rsi;
    }

    if (bb.signal !== 0) {
      weightedSignal += bb.signal * bb.strength * adjustedWeights.bb;
      totalWeight += adjustedWeights.bb;
    }

    // 归一化
    if (totalWeight > 0) {
      weightedSignal /= totalWeight;
    }

    // 趋势过滤
    let trendAdjusted = weightedSignal;
    if (this.useTrendFilter && trend.direction !== 'neutral') {
      // 顺势加强，逆势减弱
      if (trend.direction === 'up' && weightedSignal > 0) {
        trendAdjusted *= 1.2;
      } else if (trend.direction === 'down' && weightedSignal < 0) {
        trendAdjusted *= 1.2;
      } else if (trend.direction === 'up' && weightedSignal < 0) {
        trendAdjusted *= 0.7;
      } else if (trend.direction === 'down' && weightedSignal > 0) {
        trendAdjusted *= 0.7;
      }
    }

    // 生成最终信号
    let finalSignal = 'none';
    let confidence = Math.abs(trendAdjusted);

    if (trendAdjusted >= this.signalThreshold) {
      finalSignal = 'buy';
    } else if (trendAdjusted <= -this.signalThreshold) {
      finalSignal = 'sell';
    }

    // 收集触发原因
    const reasons = [];
    if (Math.abs(sma.signal) > 0) reasons.push(sma.reason);
    if (Math.abs(rsi.signal) > 0) reasons.push(rsi.reason);
    if (Math.abs(bb.signal) > 0) reasons.push(bb.reason);

    return {
      signal: finalSignal,
      rawSignal: trendAdjusted,
      confidence: Math.min(1, confidence),
      reasons,
      weights: adjustedWeights,
      components: { sma, rsi, bb },
    };
  }

  /**
   * 执行交易信号
   * @private
   */
  _executeSignal(fusedSignal, currentPrice, candle) {
    const { signal, confidence, reasons } = fusedSignal;
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    if (signal === 'buy' && !hasPosition) {
      // 买入
      this.setBuySignal(reasons.join(' | '));
      this.buyPercent(this.symbol, this.positionPercent);
      this._lastSignalTime = candle.timestamp || Date.now();

      this.log(`📈 买入信号 | 价格: ${currentPrice.toFixed(2)} | 置信度: ${(confidence * 100).toFixed(1)}%`);
      reasons.forEach(r => this.log(`  → ${r}`));

    } else if (signal === 'sell' && hasPosition) {
      // 卖出
      this.setSellSignal(reasons.join(' | '));
      this.closePosition(this.symbol);
      this._lastSignalTime = candle.timestamp || Date.now();

      this.log(`📉 卖出信号 | 价格: ${currentPrice.toFixed(2)} | 置信度: ${(confidence * 100).toFixed(1)}%`);
      reasons.forEach(r => this.log(`  → ${r}`));
    }
  }

  /**
   * 保存指标 (用于可视化)
   * @private
   */
  _saveIndicators(candle, signals, fusedSignal, regimeInfo) {
    // 自适应参数
    this.setIndicator('adaptiveSMAFast', this._adaptiveParams.smaFastPeriod);
    this.setIndicator('adaptiveSMASlow', this._adaptiveParams.smaSlowPeriod);
    this.setIndicator('adaptiveRSIOversold', this._adaptiveParams.rsiOversold);
    this.setIndicator('adaptiveRSIOverbought', this._adaptiveParams.rsiOverbought);
    this.setIndicator('adaptiveBBStdDev', this._adaptiveParams.bbStdDev);

    // 市场状态
    this.setIndicator('regime', regimeInfo.regime);
    this.setIndicator('volatilityIndex', regimeInfo.indicators.volatilityIndex);
    this.setIndicator('atrPercentile', regimeInfo.indicators.atrPercentile);
    this.setIndicator('adx', regimeInfo.indicators.adx);

    // 融合信号
    this.setIndicator('fusedSignal', fusedSignal.rawSignal);
    this.setIndicator('signalConfidence', fusedSignal.confidence);

    // 记录信号历史
    this._signalHistory.push({
      timestamp: candle.timestamp || Date.now(),
      signal: fusedSignal.signal,
      confidence: fusedSignal.confidence,
      adaptiveParams: { ...this._adaptiveParams },
      regime: regimeInfo.regime,
    });

    // 保留最近 200 条
    if (this._signalHistory.length > 200) {
      this._signalHistory.shift();
    }
  }

  /**
   * 获取当前自适应参数
   * @returns {Object}
   */
  getAdaptiveParams() {
    return { ...this._adaptiveParams };
  }

  /**
   * 获取信号历史
   * @param {number} limit
   * @returns {Array}
   */
  getSignalHistory(limit = 50) {
    return this._signalHistory.slice(-limit);
  }

  /**
   * 获取策略统计
   * @returns {Object}
   */
  getStats() {
    const regimeStats = this.regimeDetector.getStats();
    const buySignals = this._signalHistory.filter(s => s.signal === 'buy').length;
    const sellSignals = this._signalHistory.filter(s => s.signal === 'sell').length;

    return {
      currentRegime: regimeStats.currentRegime,
      regimeChanges: regimeStats.regimeChanges,
      adaptiveParams: { ...this._adaptiveParams },
      signals: {
        buy: buySignals,
        sell: sellSignals,
        total: this._signalHistory.length,
      },
    };
  }
}

export default AdaptiveStrategy;
