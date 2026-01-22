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

import BaseStrategy from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js
import { MarketRegimeDetector, MarketRegime } from '../utils/MarketRegimeDetector.js'; // 导入模块 ../utils/MarketRegimeDetector.js
import { // 导入依赖
  SMA, EMA, RSI, ATR, BollingerBands, MACD, // 执行语句
  getLatest, detectCrossover, VolatilityPercentile // 执行语句
} from '../utils/indicators.js'; // 执行语句
import { toNumber } from '../utils/helpers.js'; // 导入模块 ../utils/helpers.js

/**
 * 自适应模式枚举
 */
export const AdaptiveMode = { // 导出常量 AdaptiveMode
  FULL: 'full',           // 完全自适应（SMA + RSI + BB 全部自适应）
  SMA_ONLY: 'sma_only',   // 仅 SMA 周期自适应
  RSI_ONLY: 'rsi_only',   // 仅 RSI 阈值自适应
  BB_ONLY: 'bb_only',     // 仅布林带自适应
  CUSTOM: 'custom',       // 自定义组合
}; // 结束代码块

/**
 * 自适应参数策略类
 */
export class AdaptiveStrategy extends BaseStrategy { // 导出类 AdaptiveStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) { // 构造函数
    super(params); // 调用父类

    this.name = params.name || 'AdaptiveStrategy'; // 设置 name

    // ============================================
    // 交易参数 / Trading Parameters
    // ============================================
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol
    this.positionPercent = params.positionPercent || 95; // 设置 positionPercent

    // ============================================
    // 自适应模式 / Adaptive Mode
    // ============================================
    this.adaptiveMode = params.adaptiveMode || AdaptiveMode.FULL; // 设置 adaptiveMode
    this.enableSMAAdaptive = params.enableSMAAdaptive !== false; // 设置 enableSMAAdaptive
    this.enableRSIAdaptive = params.enableRSIAdaptive !== false; // 设置 enableRSIAdaptive
    this.enableBBAdaptive = params.enableBBAdaptive !== false; // 设置 enableBBAdaptive

    // ============================================
    // SMA 自适应参数 / SMA Adaptive Parameters
    // ============================================
    // 基准周期
    this.smaBaseFast = params.smaBaseFast || 10; // 设置 smaBaseFast
    this.smaBaseSlow = params.smaBaseSlow || 30; // 设置 smaBaseSlow

    // 波动率调整范围 (0.5 = 可缩短/延长 50%)
    this.smaPeriodAdjustRange = params.smaPeriodAdjustRange || 0.5; // 设置 smaPeriodAdjustRange

    // 波动率阈值
    this.smaVolLowThreshold = params.smaVolLowThreshold || 25;   // 低波动百分位
    this.smaVolHighThreshold = params.smaVolHighThreshold || 75; // 高波动百分位

    // ============================================
    // RSI 自适应参数 / RSI Adaptive Parameters
    // ============================================
    // 基准阈值
    this.rsiPeriod = params.rsiPeriod || 14; // 设置 rsiPeriod
    this.rsiBaseOversold = params.rsiBaseOversold || 30; // 设置 rsiBaseOversold
    this.rsiBaseOverbought = params.rsiBaseOverbought || 70; // 设置 rsiBaseOverbought

    // 阈值调整范围 (趋势市 vs 震荡市)
    this.rsiTrendingOversold = params.rsiTrendingOversold || 25;     // 趋势市超卖
    this.rsiTrendingOverbought = params.rsiTrendingOverbought || 75; // 趋势市超买
    this.rsiRangingOversold = params.rsiRangingOversold || 35;       // 震荡市超卖
    this.rsiRangingOverbought = params.rsiRangingOverbought || 65;   // 震荡市超买

    // ============================================
    // 布林带自适应参数 / Bollinger Bands Adaptive Parameters
    // ============================================
    this.bbPeriod = params.bbPeriod || 20; // 设置 bbPeriod
    this.bbBaseStdDev = params.bbBaseStdDev || 2.0; // 设置 bbBaseStdDev

    // 标准差调整范围
    this.bbMinStdDev = params.bbMinStdDev || 1.5;  // 低波动时
    this.bbMaxStdDev = params.bbMaxStdDev || 3.0;  // 高波动时

    // ATR 参考周期
    this.atrPeriod = params.atrPeriod || 14; // 设置 atrPeriod
    this.atrLookback = params.atrLookback || 100; // 设置 atrLookback

    // ============================================
    // 信号融合参数 / Signal Fusion Parameters
    // ============================================
    // 信号权重 (用于多信号融合)
    this.smaWeight = params.smaWeight || 0.4; // 设置 smaWeight
    this.rsiWeight = params.rsiWeight || 0.3; // 设置 rsiWeight
    this.bbWeight = params.bbWeight || 0.3; // 设置 bbWeight

    // 信号确认阈值
    this.signalThreshold = params.signalThreshold || 0.5; // 设置 signalThreshold

    // 趋势过滤
    this.useTrendFilter = params.useTrendFilter !== false; // 设置 useTrendFilter
    this.trendMAPeriod = params.trendMAPeriod || 50; // 设置 trendMAPeriod

    // ============================================
    // 市场状态检测器 / Market Regime Detector
    // ============================================
    this.regimeDetector = new MarketRegimeDetector({ // 设置 regimeDetector
      adxPeriod: params.adxPeriod || 14, // 设置 adxPeriod 字段
      adxTrendThreshold: params.adxTrendThreshold || 25, // 设置 adxTrendThreshold 字段
      bbPeriod: this.bbPeriod, // 设置 bbPeriod 字段
      atrPeriod: this.atrPeriod, // 设置 atrPeriod 字段
      lowVolPercentile: this.smaVolLowThreshold, // 设置 lowVolPercentile 字段
      highVolPercentile: this.smaVolHighThreshold, // 设置 highVolPercentile 字段
      extremeVolPercentile: params.extremeVolPercentile || 95, // 设置 extremeVolPercentile 字段
    }); // 结束代码块

    // ============================================
    // 内部状态 / Internal State
    // ============================================
    this._atrHistory = []; // 设置 _atrHistory
    this._adaptiveParams = { // 设置 _adaptiveParams
      smaFastPeriod: this.smaBaseFast, // 设置 smaFastPeriod 字段
      smaSlowPeriod: this.smaBaseSlow, // 设置 smaSlowPeriod 字段
      rsiOversold: this.rsiBaseOversold, // 设置 rsiOversold 字段
      rsiOverbought: this.rsiBaseOverbought, // 设置 rsiOverbought 字段
      bbStdDev: this.bbBaseStdDev, // 设置 bbStdDev 字段
    }; // 结束代码块
    this._signalHistory = []; // 设置 _signalHistory
    this._lastSignalTime = 0; // 设置 _lastSignalTime
  } // 结束代码块

  /**
   * 初始化
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果
    this.log(`自适应策略初始化 | 模式: ${this.adaptiveMode}`); // 调用 log
    this.log(`SMA 自适应: ${this.enableSMAAdaptive} | RSI 自适应: ${this.enableRSIAdaptive} | BB 自适应: ${this.enableBBAdaptive}`); // 调用 log
  } // 结束代码块

  /**
   * 主交易逻辑
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) { // 执行语句
    // 数据量检查
    const minRequired = Math.max( // 定义常量 minRequired
      this.smaBaseSlow * 2, // 访问 smaBaseSlow
      this.bbPeriod + 20, // 访问 bbPeriod
      this.atrLookback, // 访问 atrLookback
      this.trendMAPeriod + 10 // 访问 trendMAPeriod
    ); // 结束调用或参数

    if (history.length < minRequired) { // 条件判断 history.length < minRequired
      return; // 返回结果
    } // 结束代码块

    const currentPrice = toNumber(candle.close); // 定义常量 currentPrice
    const closes = history.map(h => toNumber(h.close)); // 定义函数 closes

    // ============================================
    // 1. 更新市场状态
    // ============================================
    const regimeInfo = this.regimeDetector.update(candle, history); // 定义常量 regimeInfo
    const { regime, indicators: regimeIndicators } = regimeInfo; // 解构赋值

    // 极端波动时停止交易
    if (regime === MarketRegime.EXTREME) { // 条件判断 regime === MarketRegime.EXTREME
      this.setIndicator('regime', regime); // 调用 setIndicator
      this.setIndicator('tradingAllowed', false); // 调用 setIndicator
      this.log(`⚠️ 极端波动，暂停交易 | 波动率指数: ${regimeIndicators.volatilityIndex?.toFixed(1)}%`); // 调用 log
      return; // 返回结果
    } // 结束代码块

    // ============================================
    // 2. 计算自适应参数
    // ============================================
    this._updateAdaptiveParams(candle, history, regimeInfo); // 调用 _updateAdaptiveParams

    // ============================================
    // 3. 计算所有指标
    // ============================================
    const signals = this._calculateSignals(candle, history, regimeInfo); // 定义常量 signals

    // ============================================
    // 4. 融合信号
    // ============================================
    const fusedSignal = this._fuseSignals(signals, regime); // 定义常量 fusedSignal

    // ============================================
    // 5. 执行交易
    // ============================================
    this._executeSignal(fusedSignal, currentPrice, candle); // 调用 _executeSignal

    // ============================================
    // 6. 保存指标 (用于可视化/监控)
    // ============================================
    this._saveIndicators(candle, signals, fusedSignal, regimeInfo); // 调用 _saveIndicators
  } // 结束代码块

  /**
   * 更新自适应参数
   * @private
   */
  _updateAdaptiveParams(candle, history, regimeInfo) { // 调用 _updateAdaptiveParams
    const { regime, indicators } = regimeInfo; // 解构赋值
    const volatilityIndex = indicators.volatilityIndex || 50; // 定义常量 volatilityIndex
    const atrPercentile = indicators.atrPercentile || 50; // 定义常量 atrPercentile

    // ============================================
    // SMA 周期自适应 (基于波动率)
    // ============================================
    if (this.enableSMAAdaptive) { // 条件判断 this.enableSMAAdaptive
      // 波动率高 → 周期短 (快速响应)
      // 波动率低 → 周期长 (减少噪音)
      const volFactor = this._calculateVolatilityFactor(volatilityIndex); // 定义常量 volFactor

      // 快线周期调整
      this._adaptiveParams.smaFastPeriod = Math.round( // 访问 _adaptiveParams
        this.smaBaseFast * (1 + this.smaPeriodAdjustRange * (1 - volFactor * 2)) // 访问 smaBaseFast
      ); // 结束调用或参数

      // 慢线周期调整
      this._adaptiveParams.smaSlowPeriod = Math.round( // 访问 _adaptiveParams
        this.smaBaseSlow * (1 + this.smaPeriodAdjustRange * (1 - volFactor * 2)) // 访问 smaBaseSlow
      ); // 结束调用或参数

      // 确保周期在合理范围内
      this._adaptiveParams.smaFastPeriod = Math.max(5, Math.min(30, this._adaptiveParams.smaFastPeriod)); // 访问 _adaptiveParams
      this._adaptiveParams.smaSlowPeriod = Math.max(15, Math.min(60, this._adaptiveParams.smaSlowPeriod)); // 访问 _adaptiveParams

      // 确保快线 < 慢线
      if (this._adaptiveParams.smaFastPeriod >= this._adaptiveParams.smaSlowPeriod) { // 条件判断 this._adaptiveParams.smaFastPeriod >= this._a...
        this._adaptiveParams.smaSlowPeriod = this._adaptiveParams.smaFastPeriod + 10; // 访问 _adaptiveParams
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // RSI 阈值自适应 (基于市场状态)
    // ============================================
    if (this.enableRSIAdaptive) { // 条件判断 this.enableRSIAdaptive
      if (regime === MarketRegime.TRENDING_UP || regime === MarketRegime.TRENDING_DOWN) { // 条件判断 regime === MarketRegime.TRENDING_UP || regime...
        // 趋势市：放宽阈值，让趋势跑得更远
        this._adaptiveParams.rsiOversold = this.rsiTrendingOversold; // 访问 _adaptiveParams
        this._adaptiveParams.rsiOverbought = this.rsiTrendingOverbought; // 访问 _adaptiveParams
      } else if (regime === MarketRegime.RANGING) { // 执行语句
        // 震荡市：收窄阈值，更早捕捉反转
        this._adaptiveParams.rsiOversold = this.rsiRangingOversold; // 访问 _adaptiveParams
        this._adaptiveParams.rsiOverbought = this.rsiRangingOverbought; // 访问 _adaptiveParams
      } else if (regime === MarketRegime.HIGH_VOLATILITY) { // 执行语句
        // 高波动：使用基准阈值
        this._adaptiveParams.rsiOversold = this.rsiBaseOversold; // 访问 _adaptiveParams
        this._adaptiveParams.rsiOverbought = this.rsiBaseOverbought; // 访问 _adaptiveParams
      } // 结束代码块
    } // 结束代码块

    // ============================================
    // 布林带标准差自适应 (基于 ATR)
    // ============================================
    if (this.enableBBAdaptive) { // 条件判断 this.enableBBAdaptive
      // ATR 百分位高 → 标准差大 (通道宽)
      // ATR 百分位低 → 标准差小 (通道窄)
      const atrFactor = atrPercentile / 100; // 定义常量 atrFactor

      this._adaptiveParams.bbStdDev = this.bbMinStdDev + // 访问 _adaptiveParams
        (this.bbMaxStdDev - this.bbMinStdDev) * atrFactor; // 执行语句

      // 限制在范围内
      this._adaptiveParams.bbStdDev = Math.max( // 访问 _adaptiveParams
        this.bbMinStdDev, // 访问 bbMinStdDev
        Math.min(this.bbMaxStdDev, this._adaptiveParams.bbStdDev) // 调用 Math.min
      ); // 结束调用或参数
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算波动率因子 (0-1)
   * @private
   */
  _calculateVolatilityFactor(volatilityIndex) { // 调用 _calculateVolatilityFactor
    // 将波动率指数映射到 0-1
    // 25% 以下 → 0 (低波动)
    // 75% 以上 → 1 (高波动)
    if (volatilityIndex <= this.smaVolLowThreshold) { // 条件判断 volatilityIndex <= this.smaVolLowThreshold
      return 0; // 返回结果
    } else if (volatilityIndex >= this.smaVolHighThreshold) { // 执行语句
      return 1; // 返回结果
    } else { // 执行语句
      return (volatilityIndex - this.smaVolLowThreshold) / // 返回结果
             (this.smaVolHighThreshold - this.smaVolLowThreshold); // 执行语句
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算所有信号
   * @private
   */
  _calculateSignals(candle, history, regimeInfo) { // 调用 _calculateSignals
    const closes = history.map(h => toNumber(h.close)); // 定义函数 closes
    const currentPrice = toNumber(candle.close); // 定义常量 currentPrice

    const signals = { // 定义常量 signals
      sma: { signal: 0, strength: 0, reason: '' }, // 设置 sma 字段
      rsi: { signal: 0, strength: 0, reason: '' }, // 设置 rsi 字段
      bb: { signal: 0, strength: 0, reason: '' }, // 设置 bb 字段
      trend: { direction: 'neutral', strength: 0 }, // 设置 trend 字段
    }; // 结束代码块

    // ============================================
    // SMA 信号 (使用自适应周期)
    // ============================================
    const fastMA = SMA(closes, this._adaptiveParams.smaFastPeriod); // 定义常量 fastMA
    const slowMA = SMA(closes, this._adaptiveParams.smaSlowPeriod); // 定义常量 slowMA

    if (fastMA.length >= 2 && slowMA.length >= 2) { // 条件判断 fastMA.length >= 2 && slowMA.length >= 2
      const crossover = detectCrossover(fastMA, slowMA); // 定义常量 crossover
      const fastCurrent = getLatest(fastMA); // 定义常量 fastCurrent
      const slowCurrent = getLatest(slowMA); // 定义常量 slowCurrent

      // 金叉买入
      if (crossover.bullish) { // 条件判断 crossover.bullish
        const strength = Math.min(1, Math.abs(fastCurrent - slowCurrent) / slowCurrent * 100); // 定义常量 strength
        signals.sma = { // 赋值 signals.sma
          signal: 1, // 设置 signal 字段
          strength, // 执行语句
          reason: `SMA 金叉 | 快线(${this._adaptiveParams.smaFastPeriod}): ${fastCurrent.toFixed(2)} > 慢线(${this._adaptiveParams.smaSlowPeriod}): ${slowCurrent.toFixed(2)}`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块
      // 死叉卖出
      else if (crossover.bearish) { // 否则如果 crossover.bearish
        const strength = Math.min(1, Math.abs(fastCurrent - slowCurrent) / slowCurrent * 100); // 定义常量 strength
        signals.sma = { // 赋值 signals.sma
          signal: -1, // 设置 signal 字段
          strength, // 执行语句
          reason: `SMA 死叉 | 快线(${this._adaptiveParams.smaFastPeriod}): ${fastCurrent.toFixed(2)} < 慢线(${this._adaptiveParams.smaSlowPeriod}): ${slowCurrent.toFixed(2)}`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块

      // 记录 SMA 指标
      this.setIndicator('smaFast', fastCurrent); // 调用 setIndicator
      this.setIndicator('smaSlow', slowCurrent); // 调用 setIndicator
    } // 结束代码块

    // ============================================
    // RSI 信号 (使用自适应阈值)
    // ============================================
    const rsiValues = RSI(closes, this.rsiPeriod); // 定义常量 rsiValues
    if (rsiValues.length > 0) { // 条件判断 rsiValues.length > 0
      const currentRSI = getLatest(rsiValues); // 定义常量 currentRSI
      const prevRSI = rsiValues.length > 1 ? rsiValues[rsiValues.length - 2] : currentRSI; // 定义常量 prevRSI

      // 超卖反弹
      if (currentRSI <= this._adaptiveParams.rsiOversold) { // 条件判断 currentRSI <= this._adaptiveParams.rsiOversold
        const strength = (this._adaptiveParams.rsiOversold - currentRSI) / this._adaptiveParams.rsiOversold; // 定义常量 strength
        signals.rsi = { // 赋值 signals.rsi
          signal: 1, // 设置 signal 字段
          strength: Math.min(1, strength), // 设置 strength 字段
          reason: `RSI 超卖 | RSI: ${currentRSI.toFixed(1)} <= 阈值: ${this._adaptiveParams.rsiOversold}`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块
      // 超买回落
      else if (currentRSI >= this._adaptiveParams.rsiOverbought) { // 否则如果 currentRSI >= this._adaptiveParams.rsiOverbought
        const strength = (currentRSI - this._adaptiveParams.rsiOverbought) / (100 - this._adaptiveParams.rsiOverbought); // 定义常量 strength
        signals.rsi = { // 赋值 signals.rsi
          signal: -1, // 设置 signal 字段
          strength: Math.min(1, strength), // 设置 strength 字段
          reason: `RSI 超买 | RSI: ${currentRSI.toFixed(1)} >= 阈值: ${this._adaptiveParams.rsiOverbought}`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块
      // RSI 从超卖区域回升
      else if (prevRSI <= this._adaptiveParams.rsiOversold && currentRSI > this._adaptiveParams.rsiOversold) { // 否则如果 prevRSI <= this._adaptiveParams.rsiOversold &...
        signals.rsi = { // 赋值 signals.rsi
          signal: 0.5,  // 弱买入信号
          strength: 0.5, // 设置 strength 字段
          reason: `RSI 离开超卖区 | RSI: ${prevRSI.toFixed(1)} → ${currentRSI.toFixed(1)}`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块
      // RSI 从超买区域回落
      else if (prevRSI >= this._adaptiveParams.rsiOverbought && currentRSI < this._adaptiveParams.rsiOverbought) { // 否则如果 prevRSI >= this._adaptiveParams.rsiOverbought...
        signals.rsi = { // 赋值 signals.rsi
          signal: -0.5,  // 弱卖出信号
          strength: 0.5, // 设置 strength 字段
          reason: `RSI 离开超买区 | RSI: ${prevRSI.toFixed(1)} → ${currentRSI.toFixed(1)}`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块

      this.setIndicator('rsi', currentRSI); // 调用 setIndicator
      this.setIndicator('rsiOversold', this._adaptiveParams.rsiOversold); // 调用 setIndicator
      this.setIndicator('rsiOverbought', this._adaptiveParams.rsiOverbought); // 调用 setIndicator
    } // 结束代码块

    // ============================================
    // 布林带信号 (使用自适应标准差)
    // ============================================
    const bbValues = BollingerBands(closes, this.bbPeriod, this._adaptiveParams.bbStdDev); // 定义常量 bbValues
    if (bbValues.length > 0) { // 条件判断 bbValues.length > 0
      const currentBB = getLatest(bbValues); // 定义常量 currentBB
      const prevBB = bbValues.length > 1 ? bbValues[bbValues.length - 2] : currentBB; // 定义常量 prevBB
      const prevPrice = closes.length > 1 ? closes[closes.length - 2] : currentPrice; // 定义常量 prevPrice

      // 计算 %B (价格在布林带中的位置)
      const percentB = (currentPrice - currentBB.lower) / (currentBB.upper - currentBB.lower); // 定义常量 percentB

      // 触及下轨买入
      if (currentPrice <= currentBB.lower) { // 条件判断 currentPrice <= currentBB.lower
        const strength = Math.min(1, (currentBB.lower - currentPrice) / currentBB.lower * 100); // 定义常量 strength
        signals.bb = { // 赋值 signals.bb
          signal: 1, // 设置 signal 字段
          strength, // 执行语句
          reason: `触及布林带下轨 | 价格: ${currentPrice.toFixed(2)} <= 下轨: ${currentBB.lower.toFixed(2)} (σ=${this._adaptiveParams.bbStdDev.toFixed(2)})`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块
      // 触及上轨卖出
      else if (currentPrice >= currentBB.upper) { // 否则如果 currentPrice >= currentBB.upper
        const strength = Math.min(1, (currentPrice - currentBB.upper) / currentBB.upper * 100); // 定义常量 strength
        signals.bb = { // 赋值 signals.bb
          signal: -1, // 设置 signal 字段
          strength, // 执行语句
          reason: `触及布林带上轨 | 价格: ${currentPrice.toFixed(2)} >= 上轨: ${currentBB.upper.toFixed(2)} (σ=${this._adaptiveParams.bbStdDev.toFixed(2)})`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块
      // 从下轨反弹
      else if (prevPrice <= prevBB.lower && currentPrice > currentBB.lower) { // 否则如果 prevPrice <= prevBB.lower && currentPrice > c...
        signals.bb = { // 赋值 signals.bb
          signal: 0.7, // 设置 signal 字段
          strength: 0.7, // 设置 strength 字段
          reason: `布林带下轨反弹 | %B: ${(percentB * 100).toFixed(1)}%`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块
      // 从上轨回落
      else if (prevPrice >= prevBB.upper && currentPrice < currentBB.upper) { // 否则如果 prevPrice >= prevBB.upper && currentPrice < c...
        signals.bb = { // 赋值 signals.bb
          signal: -0.7, // 设置 signal 字段
          strength: 0.7, // 设置 strength 字段
          reason: `布林带上轨回落 | %B: ${(percentB * 100).toFixed(1)}%`, // 设置 reason 字段
        }; // 结束代码块
      } // 结束代码块

      this.setIndicator('bbUpper', currentBB.upper); // 调用 setIndicator
      this.setIndicator('bbMiddle', currentBB.middle); // 调用 setIndicator
      this.setIndicator('bbLower', currentBB.lower); // 调用 setIndicator
      this.setIndicator('bbStdDev', this._adaptiveParams.bbStdDev); // 调用 setIndicator
      this.setIndicator('percentB', percentB); // 调用 setIndicator
    } // 结束代码块

    // ============================================
    // 趋势方向 (用于过滤)
    // ============================================
    if (this.useTrendFilter) { // 条件判断 this.useTrendFilter
      const trendMA = SMA(closes, this.trendMAPeriod); // 定义常量 trendMA
      if (trendMA.length > 0) { // 条件判断 trendMA.length > 0
        const trendMAValue = getLatest(trendMA); // 定义常量 trendMAValue
        const trendStrength = Math.abs(currentPrice - trendMAValue) / trendMAValue; // 定义常量 trendStrength

        signals.trend = { // 赋值 signals.trend
          direction: currentPrice > trendMAValue ? 'up' : 'down', // 设置 direction 字段
          strength: Math.min(1, trendStrength * 100), // 设置 strength 字段
          maValue: trendMAValue, // 设置 maValue 字段
        }; // 结束代码块

        this.setIndicator('trendMA', trendMAValue); // 调用 setIndicator
        this.setIndicator('trendDirection', signals.trend.direction); // 调用 setIndicator
      } // 结束代码块
    } // 结束代码块

    return signals; // 返回结果
  } // 结束代码块

  /**
   * 融合多个信号
   * @private
   */
  _fuseSignals(signals, regime) { // 调用 _fuseSignals
    const { sma, rsi, bb, trend } = signals; // 解构赋值

    // 计算加权信号
    let weightedSignal = 0; // 定义变量 weightedSignal
    let totalWeight = 0; // 定义变量 totalWeight

    // 根据市场状态调整权重
    let adjustedWeights = { // 定义变量 adjustedWeights
      sma: this.smaWeight, // 设置 sma 字段
      rsi: this.rsiWeight, // 设置 rsi 字段
      bb: this.bbWeight, // 设置 bb 字段
    }; // 结束代码块

    // 趋势市：增加 SMA 权重
    if (regime === MarketRegime.TRENDING_UP || regime === MarketRegime.TRENDING_DOWN) { // 条件判断 regime === MarketRegime.TRENDING_UP || regime...
      adjustedWeights.sma *= 1.5; // 执行语句
      adjustedWeights.rsi *= 0.8; // 执行语句
    } // 结束代码块
    // 震荡市：增加 RSI 和 BB 权重
    else if (regime === MarketRegime.RANGING) { // 否则如果 regime === MarketRegime.RANGING
      adjustedWeights.sma *= 0.7; // 执行语句
      adjustedWeights.rsi *= 1.3; // 执行语句
      adjustedWeights.bb *= 1.2; // 执行语句
    } // 结束代码块
    // 高波动：降低整体信号强度
    else if (regime === MarketRegime.HIGH_VOLATILITY) { // 否则如果 regime === MarketRegime.HIGH_VOLATILITY
      adjustedWeights.sma *= 0.8; // 执行语句
      adjustedWeights.rsi *= 0.8; // 执行语句
      adjustedWeights.bb *= 0.8; // 执行语句
    } // 结束代码块

    // 归一化权重
    const weightSum = adjustedWeights.sma + adjustedWeights.rsi + adjustedWeights.bb; // 定义常量 weightSum
    adjustedWeights.sma /= weightSum; // 执行语句
    adjustedWeights.rsi /= weightSum; // 执行语句
    adjustedWeights.bb /= weightSum; // 执行语句

    // 计算加权信号
    if (sma.signal !== 0) { // 条件判断 sma.signal !== 0
      weightedSignal += sma.signal * sma.strength * adjustedWeights.sma; // 执行语句
      totalWeight += adjustedWeights.sma; // 执行语句
    } // 结束代码块

    if (rsi.signal !== 0) { // 条件判断 rsi.signal !== 0
      weightedSignal += rsi.signal * rsi.strength * adjustedWeights.rsi; // 执行语句
      totalWeight += adjustedWeights.rsi; // 执行语句
    } // 结束代码块

    if (bb.signal !== 0) { // 条件判断 bb.signal !== 0
      weightedSignal += bb.signal * bb.strength * adjustedWeights.bb; // 执行语句
      totalWeight += adjustedWeights.bb; // 执行语句
    } // 结束代码块

    // 归一化
    if (totalWeight > 0) { // 条件判断 totalWeight > 0
      weightedSignal /= totalWeight; // 执行语句
    } // 结束代码块

    // 趋势过滤
    let trendAdjusted = weightedSignal; // 定义变量 trendAdjusted
    if (this.useTrendFilter && trend.direction !== 'neutral') { // 条件判断 this.useTrendFilter && trend.direction !== 'n...
      // 顺势加强，逆势减弱
      if (trend.direction === 'up' && weightedSignal > 0) { // 条件判断 trend.direction === 'up' && weightedSignal > 0
        trendAdjusted *= 1.2; // 执行语句
      } else if (trend.direction === 'down' && weightedSignal < 0) { // 执行语句
        trendAdjusted *= 1.2; // 执行语句
      } else if (trend.direction === 'up' && weightedSignal < 0) { // 执行语句
        trendAdjusted *= 0.7; // 执行语句
      } else if (trend.direction === 'down' && weightedSignal > 0) { // 执行语句
        trendAdjusted *= 0.7; // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 生成最终信号
    let finalSignal = 'none'; // 定义变量 finalSignal
    let confidence = Math.abs(trendAdjusted); // 定义变量 confidence

    if (trendAdjusted >= this.signalThreshold) { // 条件判断 trendAdjusted >= this.signalThreshold
      finalSignal = 'buy'; // 赋值 finalSignal
    } else if (trendAdjusted <= -this.signalThreshold) { // 执行语句
      finalSignal = 'sell'; // 赋值 finalSignal
    } // 结束代码块

    // 收集触发原因
    const reasons = []; // 定义常量 reasons
    if (Math.abs(sma.signal) > 0) reasons.push(sma.reason); // 条件判断 Math.abs(sma.signal) > 0
    if (Math.abs(rsi.signal) > 0) reasons.push(rsi.reason); // 条件判断 Math.abs(rsi.signal) > 0
    if (Math.abs(bb.signal) > 0) reasons.push(bb.reason); // 条件判断 Math.abs(bb.signal) > 0

    return { // 返回结果
      signal: finalSignal, // 设置 signal 字段
      rawSignal: trendAdjusted, // 设置 rawSignal 字段
      confidence: Math.min(1, confidence), // 设置 confidence 字段
      reasons, // 执行语句
      weights: adjustedWeights, // 设置 weights 字段
      components: { sma, rsi, bb }, // 设置 components 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 执行交易信号
   * @private
   */
  _executeSignal(fusedSignal, currentPrice, candle) { // 调用 _executeSignal
    const { signal, confidence, reasons } = fusedSignal; // 解构赋值
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    if (signal === 'buy' && !hasPosition) { // 条件判断 signal === 'buy' && !hasPosition
      // 买入
      this.setBuySignal(reasons.join(' | ')); // 调用 setBuySignal
      this.buyPercent(this.symbol, this.positionPercent); // 调用 buyPercent
      this._lastSignalTime = candle.timestamp || Date.now(); // 设置 _lastSignalTime

      this.log(`📈 买入信号 | 价格: ${currentPrice.toFixed(2)} | 置信度: ${(confidence * 100).toFixed(1)}%`); // 调用 log
      reasons.forEach(r => this.log(`  → ${r}`)); // 调用 reasons.forEach

    } else if (signal === 'sell' && hasPosition) { // 执行语句
      // 卖出
      this.setSellSignal(reasons.join(' | ')); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._lastSignalTime = candle.timestamp || Date.now(); // 设置 _lastSignalTime

      this.log(`📉 卖出信号 | 价格: ${currentPrice.toFixed(2)} | 置信度: ${(confidence * 100).toFixed(1)}%`); // 调用 log
      reasons.forEach(r => this.log(`  → ${r}`)); // 调用 reasons.forEach
    } // 结束代码块
  } // 结束代码块

  /**
   * 保存指标 (用于可视化)
   * @private
   */
  _saveIndicators(candle, signals, fusedSignal, regimeInfo) { // 调用 _saveIndicators
    // 自适应参数
    this.setIndicator('adaptiveSMAFast', this._adaptiveParams.smaFastPeriod); // 调用 setIndicator
    this.setIndicator('adaptiveSMASlow', this._adaptiveParams.smaSlowPeriod); // 调用 setIndicator
    this.setIndicator('adaptiveRSIOversold', this._adaptiveParams.rsiOversold); // 调用 setIndicator
    this.setIndicator('adaptiveRSIOverbought', this._adaptiveParams.rsiOverbought); // 调用 setIndicator
    this.setIndicator('adaptiveBBStdDev', this._adaptiveParams.bbStdDev); // 调用 setIndicator

    // 市场状态
    this.setIndicator('regime', regimeInfo.regime); // 调用 setIndicator
    this.setIndicator('volatilityIndex', regimeInfo.indicators.volatilityIndex); // 调用 setIndicator
    this.setIndicator('atrPercentile', regimeInfo.indicators.atrPercentile); // 调用 setIndicator
    this.setIndicator('adx', regimeInfo.indicators.adx); // 调用 setIndicator

    // 融合信号
    this.setIndicator('fusedSignal', fusedSignal.rawSignal); // 调用 setIndicator
    this.setIndicator('signalConfidence', fusedSignal.confidence); // 调用 setIndicator

    // 记录信号历史
    this._signalHistory.push({ // 访问 _signalHistory
      timestamp: candle.timestamp || Date.now(), // 设置 timestamp 字段
      signal: fusedSignal.signal, // 设置 signal 字段
      confidence: fusedSignal.confidence, // 设置 confidence 字段
      adaptiveParams: { ...this._adaptiveParams }, // 设置 adaptiveParams 字段
      regime: regimeInfo.regime, // 设置 regime 字段
    }); // 结束代码块

    // 保留最近 200 条
    if (this._signalHistory.length > 200) { // 条件判断 this._signalHistory.length > 200
      this._signalHistory.shift(); // 访问 _signalHistory
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取当前自适应参数
   * @returns {Object}
   */
  getAdaptiveParams() { // 调用 getAdaptiveParams
    return { ...this._adaptiveParams }; // 返回结果
  } // 结束代码块

  /**
   * 获取信号历史
   * @param {number} limit
   * @returns {Array}
   */
  getSignalHistory(limit = 50) { // 调用 getSignalHistory
    return this._signalHistory.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取策略统计
   * @returns {Object}
   */
  getStats() { // 调用 getStats
    const regimeStats = this.regimeDetector.getStats(); // 定义常量 regimeStats
    const buySignals = this._signalHistory.filter(s => s.signal === 'buy').length; // 定义函数 buySignals
    const sellSignals = this._signalHistory.filter(s => s.signal === 'sell').length; // 定义函数 sellSignals

    return { // 返回结果
      currentRegime: regimeStats.currentRegime, // 设置 currentRegime 字段
      regimeChanges: regimeStats.regimeChanges, // 设置 regimeChanges 字段
      adaptiveParams: { ...this._adaptiveParams }, // 设置 adaptiveParams 字段
      signals: { // 设置 signals 字段
        buy: buySignals, // 设置 buy 字段
        sell: sellSignals, // 设置 sell 字段
        total: this._signalHistory.length, // 设置 total 字段
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

export default AdaptiveStrategy; // 默认导出
