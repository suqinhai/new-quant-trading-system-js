/**
 * 市场状态检测器 (Market Regime Detector)
 *
 * 通过多种技术指标识别当前市场状态：
 * - 趋势市 (TRENDING_UP / TRENDING_DOWN)
 * - 震荡市 (RANGING)
 * - 高波动 (HIGH_VOLATILITY)
 * - 极端情况 (EXTREME)
 *
 * 技术手段：
 * - ADX: 趋势强度
 * - Bollinger Band Width: 波动率
 * - Hurst 指数: 趋势/均值回归特性
 * - ATR 百分位: 波动率水平
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import { ADX, ATR, BollingerBands, EMA, SMA, RSI, getLatest } from './indicators.js'; // 导入模块 ./indicators.js
import { toNumber } from './helpers.js'; // 导入模块 ./helpers.js

/**
 * 市场状态枚举
 */
export const MarketRegime = { // 导出常量 MarketRegime
  TRENDING_UP: 'trending_up',       // 上涨趋势
  TRENDING_DOWN: 'trending_down',   // 下跌趋势
  RANGING: 'ranging',               // 震荡盘整
  HIGH_VOLATILITY: 'high_volatility', // 高波动
  EXTREME: 'extreme',               // 极端情况 (风控模式)
}; // 结束代码块

/**
 * 状态转换事件
 */
export const RegimeEvent = { // 导出常量 RegimeEvent
  REGIME_CHANGE: 'regime_change', // 设置 REGIME_CHANGE 字段
  VOLATILITY_SPIKE: 'volatility_spike', // 设置 VOLATILITY_SPIKE 字段
  TREND_REVERSAL: 'trend_reversal', // 设置 TREND_REVERSAL 字段
  EXTREME_DETECTED: 'extreme_detected', // 设置 EXTREME_DETECTED 字段
}; // 结束代码块

/**
 * 市场状态检测器类
 */
export class MarketRegimeDetector extends EventEmitter { // 导出类 MarketRegimeDetector
  /**
   * 构造函数
   * @param {Object} params - 配置参数
   */
  constructor(params = {}) { // 构造函数
    super(); // 调用父类

    // ============================================
    // ADX 参数 (趋势强度)
    // ============================================
    this.adxPeriod = params.adxPeriod || 14; // 设置 adxPeriod
    this.adxTrendThreshold = params.adxTrendThreshold || 25;     // ADX > 25 认为有趋势
    this.adxStrongTrendThreshold = params.adxStrongTrendThreshold || 40; // ADX > 40 强趋势

    // ============================================
    // Bollinger Band Width 参数 (波动率)
    // ============================================
    this.bbPeriod = params.bbPeriod || 20; // 设置 bbPeriod
    this.bbStdDev = params.bbStdDev || 2; // 设置 bbStdDev
    this.bbWidthLookback = params.bbWidthLookback || 100; // 计算百分位的回溯周期

    // ============================================
    // ATR 参数 (波动率)
    // ============================================
    this.atrPeriod = params.atrPeriod || 14; // 设置 atrPeriod
    this.atrLookback = params.atrLookback || 100; // 设置 atrLookback

    // ============================================
    // 波动率阈值
    // ============================================
    this.lowVolPercentile = params.lowVolPercentile || 25;      // 低波动百分位
    this.highVolPercentile = params.highVolPercentile || 75;    // 高波动百分位
    this.extremeVolPercentile = params.extremeVolPercentile || 95; // 极端波动百分位

    // ============================================
    // Hurst 指数参数
    // ============================================
    this.hurstPeriod = params.hurstPeriod || 100; // 设置 hurstPeriod
    this.hurstTrendThreshold = params.hurstTrendThreshold || 0.55;  // H > 0.55 趋势
    this.hurstMeanRevThreshold = params.hurstMeanRevThreshold || 0.45; // H < 0.45 均值回归

    // ============================================
    // 均线参数 (方向判断)
    // ============================================
    this.fastMAPeriod = params.fastMAPeriod || 10; // 设置 fastMAPeriod
    this.slowMAPeriod = params.slowMAPeriod || 30; // 设置 slowMAPeriod

    // ============================================
    // 状态机参数
    // ============================================
    this.minRegimeDuration = params.minRegimeDuration || 3; // 最少持续 N 根 K 线才确认切换
    this.smoothingWindow = params.smoothingWindow || 3;      // 信号平滑窗口

    // ============================================
    // 内部状态
    // ============================================
    this._currentRegime = MarketRegime.RANGING; // 设置 _currentRegime
    this._prevRegime = MarketRegime.RANGING; // 设置 _prevRegime
    this._regimeHistory = []; // 设置 _regimeHistory
    this._regimeCounter = 0; // 设置 _regimeCounter
    this._pendingRegime = null; // 设置 _pendingRegime

    // 历史数据存储
    this._bbWidthHistory = []; // 设置 _bbWidthHistory
    this._atrHistory = []; // 设置 _atrHistory
    this._adxHistory = []; // 设置 _adxHistory
    this._hurstHistory = []; // 设置 _hurstHistory

    // 指标缓存
    this._indicators = {}; // 设置 _indicators

    // 统计信息
    this._stats = { // 设置 _stats
      regimeChanges: 0, // 设置 regimeChanges 字段
      lastChangeTime: null, // 设置 lastChangeTime 字段
      regimeDurations: {}, // 设置 regimeDurations 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 更新市场状态 (主入口)
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史 K 线数据
   * @returns {Object} 当前状态信息
   */
  update(candle, history) { // 调用 update
    // 检查数据量是否足够
    const requiredLength = Math.max( // 定义常量 requiredLength
      this.adxPeriod + 10, // 访问 adxPeriod
      this.bbPeriod + 10, // 访问 bbPeriod
      this.atrPeriod + 10, // 访问 atrPeriod
      this.slowMAPeriod + 10, // 访问 slowMAPeriod
      this.hurstPeriod // 访问 hurstPeriod
    ); // 结束调用或参数

    if (history.length < requiredLength) { // 条件判断 history.length < requiredLength
      return { // 返回结果
        regime: this._currentRegime, // 设置 regime 字段
        confidence: 0, // 设置 confidence 字段
        indicators: {}, // 设置 indicators 字段
        reason: '数据不足', // 设置 reason 字段
      }; // 结束代码块
    } // 结束代码块

    // 计算所有指标
    const indicators = this._calculateIndicators(candle, history); // 定义常量 indicators
    this._indicators = indicators; // 设置 _indicators

    // 确定候选状态
    const candidateRegime = this._determineRegime(indicators); // 定义常量 candidateRegime

    // 状态机逻辑 (防止频繁切换)
    const confirmedRegime = this._processStateMachine(candidateRegime); // 定义常量 confirmedRegime

    // 检测状态变化
    if (confirmedRegime !== this._currentRegime) { // 条件判断 confirmedRegime !== this._currentRegime
      this._handleRegimeChange(confirmedRegime, indicators); // 调用 _handleRegimeChange
    } // 结束代码块

    // 记录历史
    this._regimeHistory.push({ // 访问 _regimeHistory
      timestamp: candle.timestamp || Date.now(), // 设置 timestamp 字段
      regime: this._currentRegime, // 设置 regime 字段
      indicators: { ...indicators }, // 设置 indicators 字段
    }); // 结束代码块

    // 保留最近 500 条记录
    if (this._regimeHistory.length > 500) { // 条件判断 this._regimeHistory.length > 500
      this._regimeHistory.shift(); // 访问 _regimeHistory
    } // 结束代码块

    return { // 返回结果
      regime: this._currentRegime, // 设置 regime 字段
      prevRegime: this._prevRegime, // 设置 prevRegime 字段
      confidence: this._calculateConfidence(indicators), // 设置 confidence 字段
      indicators, // 执行语句
      recommendation: this._getStrategyRecommendation(), // 设置 recommendation 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算所有指标
   * @private
   */
  _calculateIndicators(candle, history) { // 调用 _calculateIndicators
    const closes = history.map(h => toNumber(h.close)); // 定义函数 closes
    const currentPrice = toNumber(candle.close); // 定义常量 currentPrice

    // 1. ADX (趋势强度)
    const adxValues = ADX(history, this.adxPeriod); // 定义常量 adxValues
    const currentADX = adxValues.length > 0 ? getLatest(adxValues) : null; // 定义常量 currentADX
    const adx = currentADX ? currentADX.adx : 0; // 定义常量 adx
    const pdi = currentADX ? currentADX.pdi : 0; // 定义常量 pdi
    const mdi = currentADX ? currentADX.mdi : 0; // 定义常量 mdi

    // 2. Bollinger Bands Width
    const bbValues = BollingerBands(closes, this.bbPeriod, this.bbStdDev); // 定义常量 bbValues
    const currentBB = bbValues.length > 0 ? getLatest(bbValues) : null; // 定义常量 currentBB
    let bbWidth = 0; // 定义变量 bbWidth
    if (currentBB) { // 条件判断 currentBB
      bbWidth = ((currentBB.upper - currentBB.lower) / currentBB.middle) * 100; // 赋值 bbWidth
    } // 结束代码块

    // 更新 BB Width 历史
    this._bbWidthHistory.push(bbWidth); // 访问 _bbWidthHistory
    if (this._bbWidthHistory.length > this.bbWidthLookback) { // 条件判断 this._bbWidthHistory.length > this.bbWidthLoo...
      this._bbWidthHistory.shift(); // 访问 _bbWidthHistory
    } // 结束代码块
    const bbWidthPercentile = this._calculatePercentile(bbWidth, this._bbWidthHistory); // 定义常量 bbWidthPercentile

    // 3. ATR
    const atrValues = ATR(history, this.atrPeriod); // 定义常量 atrValues
    const currentATR = atrValues.length > 0 ? getLatest(atrValues) : 0; // 定义常量 currentATR
    const normalizedATR = (currentATR / currentPrice) * 100; // 定义常量 normalizedATR

    // 更新 ATR 历史
    this._atrHistory.push(normalizedATR); // 访问 _atrHistory
    if (this._atrHistory.length > this.atrLookback) { // 条件判断 this._atrHistory.length > this.atrLookback
      this._atrHistory.shift(); // 访问 _atrHistory
    } // 结束代码块
    const atrPercentile = this._calculatePercentile(normalizedATR, this._atrHistory); // 定义常量 atrPercentile

    // 4. 移动平均线
    const fastMA = getLatest(EMA(closes, this.fastMAPeriod)); // 定义常量 fastMA
    const slowMA = getLatest(SMA(closes, this.slowMAPeriod)); // 定义常量 slowMA
    const maSpread = ((fastMA - slowMA) / slowMA) * 100; // 定义常量 maSpread

    // 5. Hurst 指数
    const hurst = this._calculateHurst(closes.slice(-this.hurstPeriod)); // 定义常量 hurst

    // 6. RSI (辅助)
    const rsiValues = RSI(closes, 14); // 定义常量 rsiValues
    const rsi = rsiValues.length > 0 ? getLatest(rsiValues) : 50; // 定义常量 rsi

    // 7. 价格动量
    const momentum = closes.length >= 20 // 定义常量 momentum
      ? ((currentPrice - closes[closes.length - 20]) / closes[closes.length - 20]) * 100 // 执行语句
      : 0; // 执行语句

    // 8. 综合波动率指数 (结合 BB Width 和 ATR)
    const volatilityIndex = (bbWidthPercentile + atrPercentile) / 2; // 定义常量 volatilityIndex

    return { // 返回结果
      // ADX 相关
      adx, // 执行语句
      pdi, // 执行语句
      mdi, // 执行语句
      trendStrength: adx, // 设置 trendStrength 字段
      trendDirection: pdi > mdi ? 'up' : 'down', // 设置 trendDirection 字段

      // 波动率相关
      bbWidth, // 执行语句
      bbWidthPercentile, // 执行语句
      atr: currentATR, // 设置 atr 字段
      normalizedATR, // 执行语句
      atrPercentile, // 执行语句
      volatilityIndex, // 执行语句

      // 趋势相关
      fastMA, // 执行语句
      slowMA, // 执行语句
      maSpread, // 执行语句
      momentum, // 执行语句

      // Hurst 指数
      hurst, // 执行语句
      hurstSignal: hurst > this.hurstTrendThreshold ? 'trending' : // 设置 hurstSignal 字段
                   hurst < this.hurstMeanRevThreshold ? 'mean_reverting' : 'random', // 执行语句

      // 辅助指标
      rsi, // 执行语句
      price: currentPrice, // 设置 price 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算 Hurst 指数 (R/S 分析法)
   * @private
   */
  _calculateHurst(prices) { // 调用 _calculateHurst
    if (prices.length < 20) return 0.5; // 条件判断 prices.length < 20

    try { // 尝试执行
      const n = prices.length; // 定义常量 n
      const logReturns = []; // 定义常量 logReturns

      for (let i = 1; i < n; i++) { // 循环 let i = 1; i < n; i++
        if (prices[i] > 0 && prices[i - 1] > 0) { // 条件判断 prices[i] > 0 && prices[i - 1] > 0
          logReturns.push(Math.log(prices[i] / prices[i - 1])); // 调用 logReturns.push
        } // 结束代码块
      } // 结束代码块

      if (logReturns.length < 10) return 0.5; // 条件判断 logReturns.length < 10

      // 计算不同分组大小下的 R/S
      const sizes = []; // 定义常量 sizes
      const rsValues = []; // 定义常量 rsValues

      for (let size = 10; size <= Math.floor(logReturns.length / 2); size += 5) { // 循环 let size = 10; size <= Math.floor(logReturns....
        const numGroups = Math.floor(logReturns.length / size); // 定义常量 numGroups
        if (numGroups < 2) continue; // 条件判断 numGroups < 2

        let rsSum = 0; // 定义变量 rsSum
        for (let g = 0; g < numGroups; g++) { // 循环 let g = 0; g < numGroups; g++
          const group = logReturns.slice(g * size, (g + 1) * size); // 定义常量 group
          const rs = this._calculateRS(group); // 定义常量 rs
          if (rs > 0) rsSum += rs; // 条件判断 rs > 0
        } // 结束代码块

        const avgRS = rsSum / numGroups; // 定义常量 avgRS
        if (avgRS > 0) { // 条件判断 avgRS > 0
          sizes.push(Math.log(size)); // 调用 sizes.push
          rsValues.push(Math.log(avgRS)); // 调用 rsValues.push
        } // 结束代码块
      } // 结束代码块

      if (sizes.length < 3) return 0.5; // 条件判断 sizes.length < 3

      // 线性回归计算斜率 (即 Hurst 指数)
      const hurst = this._linearRegressionSlope(sizes, rsValues); // 定义常量 hurst

      // 限制在合理范围 [0, 1]
      return Math.max(0, Math.min(1, hurst)); // 返回结果

    } catch (e) { // 执行语句
      return 0.5; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算 R/S 值
   * @private
   */
  _calculateRS(series) { // 调用 _calculateRS
    const n = series.length; // 定义常量 n
    if (n < 2) return 0; // 条件判断 n < 2

    // 均值
    const mean = series.reduce((a, b) => a + b, 0) / n; // 定义函数 mean

    // 累积偏差
    const cumDev = []; // 定义常量 cumDev
    let sum = 0; // 定义变量 sum
    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      sum += series[i] - mean; // 执行语句
      cumDev.push(sum); // 调用 cumDev.push
    } // 结束代码块

    // 极差 R
    const R = Math.max(...cumDev) - Math.min(...cumDev); // 定义常量 R

    // 标准差 S
    const variance = series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n; // 定义函数 variance
    const S = Math.sqrt(variance); // 定义常量 S

    if (S === 0) return 0; // 条件判断 S === 0
    return R / S; // 返回结果
  } // 结束代码块

  /**
   * 线性回归斜率
   * @private
   */
  _linearRegressionSlope(x, y) { // 调用 _linearRegressionSlope
    const n = x.length; // 定义常量 n
    const sumX = x.reduce((a, b) => a + b, 0); // 定义函数 sumX
    const sumY = y.reduce((a, b) => a + b, 0); // 定义函数 sumY
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0); // 定义函数 sumXY
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0); // 定义函数 sumX2

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX); // 定义常量 slope
    return slope; // 返回结果
  } // 结束代码块

  /**
   * 确定市场状态
   * @private
   */
  _determineRegime(indicators) { // 调用 _determineRegime
    const { // 解构赋值
      adx, pdi, mdi, // 执行语句
      volatilityIndex, atrPercentile, // 执行语句
      maSpread, momentum, // 执行语句
      hurst, hurstSignal // 执行语句
    } = indicators; // 执行语句

    // 1. 首先检查极端情况
    if (volatilityIndex >= this.extremeVolPercentile) { // 条件判断 volatilityIndex >= this.extremeVolPercentile
      return MarketRegime.EXTREME; // 返回结果
    } // 结束代码块

    // 2. 检查高波动
    if (volatilityIndex >= this.highVolPercentile) { // 条件判断 volatilityIndex >= this.highVolPercentile
      return MarketRegime.HIGH_VOLATILITY; // 返回结果
    } // 结束代码块

    // 3. 检查趋势
    const hasTrend = adx >= this.adxTrendThreshold; // 定义常量 hasTrend
    const hasStrongTrend = adx >= this.adxStrongTrendThreshold; // 定义常量 hasStrongTrend
    const trendingByHurst = hurstSignal === 'trending'; // 定义常量 trendingByHurst
    const maConfirmUp = maSpread > 0.5;  // 快线高于慢线 0.5%
    const maConfirmDown = maSpread < -0.5; // 定义常量 maConfirmDown

    // 上涨趋势: ADX 显示趋势 + PDI > MDI + MA 确认
    if (hasTrend && pdi > mdi && maConfirmUp) { // 条件判断 hasTrend && pdi > mdi && maConfirmUp
      // Hurst 确认趋势特性增加置信度
      if (hasStrongTrend || trendingByHurst) { // 条件判断 hasStrongTrend || trendingByHurst
        return MarketRegime.TRENDING_UP; // 返回结果
      } // 结束代码块
      return MarketRegime.TRENDING_UP; // 返回结果
    } // 结束代码块

    // 下跌趋势: ADX 显示趋势 + MDI > PDI + MA 确认
    if (hasTrend && mdi > pdi && maConfirmDown) { // 条件判断 hasTrend && mdi > pdi && maConfirmDown
      if (hasStrongTrend || trendingByHurst) { // 条件判断 hasStrongTrend || trendingByHurst
        return MarketRegime.TRENDING_DOWN; // 返回结果
      } // 结束代码块
      return MarketRegime.TRENDING_DOWN; // 返回结果
    } // 结束代码块

    // 4. 默认震荡市
    return MarketRegime.RANGING; // 返回结果
  } // 结束代码块

  /**
   * 状态机处理 (防止频繁切换)
   * @private
   */
  _processStateMachine(candidateRegime) { // 调用 _processStateMachine
    // 如果候选状态与当前状态相同
    if (candidateRegime === this._currentRegime) { // 条件判断 candidateRegime === this._currentRegime
      this._pendingRegime = null; // 设置 _pendingRegime
      this._regimeCounter = 0; // 设置 _regimeCounter
      return this._currentRegime; // 返回结果
    } // 结束代码块

    // 极端情况立即切换
    if (candidateRegime === MarketRegime.EXTREME) { // 条件判断 candidateRegime === MarketRegime.EXTREME
      return candidateRegime; // 返回结果
    } // 结束代码块

    // 从极端状态退出需要确认
    if (this._currentRegime === MarketRegime.EXTREME) { // 条件判断 this._currentRegime === MarketRegime.EXTREME
      if (this._pendingRegime === candidateRegime) { // 条件判断 this._pendingRegime === candidateRegime
        this._regimeCounter++; // 访问 _regimeCounter
        if (this._regimeCounter >= this.minRegimeDuration) { // 条件判断 this._regimeCounter >= this.minRegimeDuration
          this._pendingRegime = null; // 设置 _pendingRegime
          this._regimeCounter = 0; // 设置 _regimeCounter
          return candidateRegime; // 返回结果
        } // 结束代码块
      } else { // 执行语句
        this._pendingRegime = candidateRegime; // 设置 _pendingRegime
        this._regimeCounter = 1; // 设置 _regimeCounter
      } // 结束代码块
      return this._currentRegime; // 返回结果
    } // 结束代码块

    // 正常状态切换需要确认
    if (this._pendingRegime === candidateRegime) { // 条件判断 this._pendingRegime === candidateRegime
      this._regimeCounter++; // 访问 _regimeCounter
      if (this._regimeCounter >= this.minRegimeDuration) { // 条件判断 this._regimeCounter >= this.minRegimeDuration
        this._pendingRegime = null; // 设置 _pendingRegime
        this._regimeCounter = 0; // 设置 _regimeCounter
        return candidateRegime; // 返回结果
      } // 结束代码块
    } else { // 执行语句
      this._pendingRegime = candidateRegime; // 设置 _pendingRegime
      this._regimeCounter = 1; // 设置 _regimeCounter
    } // 结束代码块

    return this._currentRegime; // 返回结果
  } // 结束代码块

  /**
   * 处理状态变化
   * @private
   */
  _handleRegimeChange(newRegime, indicators) { // 调用 _handleRegimeChange
    this._prevRegime = this._currentRegime; // 设置 _prevRegime
    this._currentRegime = newRegime; // 设置 _currentRegime
    this._stats.regimeChanges++; // 访问 _stats
    this._stats.lastChangeTime = Date.now(); // 访问 _stats

    // 更新状态持续时间统计
    if (!this._stats.regimeDurations[this._prevRegime]) { // 条件判断 !this._stats.regimeDurations[this._prevRegime]
      this._stats.regimeDurations[this._prevRegime] = []; // 访问 _stats
    } // 结束代码块

    // 发出事件
    this.emit(RegimeEvent.REGIME_CHANGE, { // 调用 emit
      from: this._prevRegime, // 设置 from 字段
      to: newRegime, // 设置 to 字段
      indicators, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块

    // 特定事件
    if (newRegime === MarketRegime.EXTREME) { // 条件判断 newRegime === MarketRegime.EXTREME
      this.emit(RegimeEvent.EXTREME_DETECTED, { indicators }); // 调用 emit
    } // 结束代码块

    if (newRegime === MarketRegime.HIGH_VOLATILITY) { // 条件判断 newRegime === MarketRegime.HIGH_VOLATILITY
      this.emit(RegimeEvent.VOLATILITY_SPIKE, { indicators }); // 调用 emit
    } // 结束代码块

    if ( // 条件判断 
      (this._prevRegime === MarketRegime.TRENDING_UP && newRegime === MarketRegime.TRENDING_DOWN) || // 执行语句
      (this._prevRegime === MarketRegime.TRENDING_DOWN && newRegime === MarketRegime.TRENDING_UP) // 执行语句
    ) { // 执行语句
      this.emit(RegimeEvent.TREND_REVERSAL, { // 调用 emit
        from: this._prevRegime, // 设置 from 字段
        to: newRegime, // 设置 to 字段
        indicators // 执行语句
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算置信度
   * @private
   */
  _calculateConfidence(indicators) { // 调用 _calculateConfidence
    const { adx, volatilityIndex, hurst, hurstSignal } = indicators; // 解构赋值
    let confidence = 50; // 基础置信度

    switch (this._currentRegime) { // 分支选择 this._currentRegime
      case MarketRegime.TRENDING_UP: // 分支 MarketRegime.TRENDING_UP
      case MarketRegime.TRENDING_DOWN: // 分支 MarketRegime.TRENDING_DOWN
        // ADX 越高置信度越高
        confidence += Math.min(25, (adx - this.adxTrendThreshold) * 1.5); // 执行语句
        // Hurst 确认趋势增加置信度
        if (hurstSignal === 'trending') confidence += 15; // 条件判断 hurstSignal === 'trending'
        break; // 跳出循环或分支

      case MarketRegime.RANGING: // 分支 MarketRegime.RANGING
        // ADX 越低越确定是震荡
        confidence += Math.min(25, (this.adxTrendThreshold - adx) * 2); // 执行语句
        // Hurst 显示均值回归增加置信度
        if (hurstSignal === 'mean_reverting') confidence += 15; // 条件判断 hurstSignal === 'mean_reverting'
        break; // 跳出循环或分支

      case MarketRegime.HIGH_VOLATILITY: // 分支 MarketRegime.HIGH_VOLATILITY
      case MarketRegime.EXTREME: // 分支 MarketRegime.EXTREME
        // 波动率百分位越高置信度越高
        confidence += Math.min(30, (volatilityIndex - this.highVolPercentile) * 1.5); // 执行语句
        break; // 跳出循环或分支
    } // 结束代码块

    return Math.min(100, Math.max(0, confidence)); // 返回结果
  } // 结束代码块

  /**
   * 获取策略推荐
   * @private
   */
  _getStrategyRecommendation() { // 调用 _getStrategyRecommendation
    switch (this._currentRegime) { // 分支选择 this._currentRegime
      case MarketRegime.TRENDING_UP: // 分支 MarketRegime.TRENDING_UP
        return { // 返回结果
          strategies: ['SMA', 'MACD', 'ATRBreakout'], // 设置 strategies 字段
          description: '趋势上涨市 → 推荐趋势跟踪策略', // 设置 description 字段
          positionSizing: 1.0,  // 正常仓位
          riskLevel: 'normal', // 设置 riskLevel 字段
        }; // 结束代码块

      case MarketRegime.TRENDING_DOWN: // 分支 MarketRegime.TRENDING_DOWN
        return { // 返回结果
          strategies: ['SMA', 'MACD'], // 设置 strategies 字段
          description: '趋势下跌市 → 推荐趋势跟踪策略 (做空或观望)', // 设置 description 字段
          positionSizing: 0.8, // 设置 positionSizing 字段
          riskLevel: 'caution', // 设置 riskLevel 字段
        }; // 结束代码块

      case MarketRegime.RANGING: // 分支 MarketRegime.RANGING
        return { // 返回结果
          strategies: ['Grid', 'BollingerBands', 'RSI'], // 设置 strategies 字段
          description: '震荡市 → 推荐网格和均值回归策略', // 设置 description 字段
          positionSizing: 0.7, // 设置 positionSizing 字段
          riskLevel: 'normal', // 设置 riskLevel 字段
        }; // 结束代码块

      case MarketRegime.HIGH_VOLATILITY: // 分支 MarketRegime.HIGH_VOLATILITY
        return { // 返回结果
          strategies: ['ATRBreakout', 'BollingerWidth'], // 设置 strategies 字段
          description: '高波动市 → 推荐波动率突破策略，降低仓位', // 设置 description 字段
          positionSizing: 0.5, // 设置 positionSizing 字段
          riskLevel: 'high', // 设置 riskLevel 字段
        }; // 结束代码块

      case MarketRegime.EXTREME: // 分支 MarketRegime.EXTREME
        return { // 返回结果
          strategies: [], // 设置 strategies 字段
          description: '极端波动 → 进入风控模式，暂停开新仓', // 设置 description 字段
          positionSizing: 0, // 设置 positionSizing 字段
          riskLevel: 'extreme', // 设置 riskLevel 字段
        }; // 结束代码块

      default: // 默认分支
        return { // 返回结果
          strategies: ['SMA'], // 设置 strategies 字段
          description: '未知状态 → 保守操作', // 设置 description 字段
          positionSizing: 0.3, // 设置 positionSizing 字段
          riskLevel: 'unknown', // 设置 riskLevel 字段
        }; // 结束代码块
    } // 结束代码块
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

  // ============================================
  // 公共 API
  // ============================================

  /**
   * 获取当前市场状态
   * @returns {string}
   */
  getCurrentRegime() { // 调用 getCurrentRegime
    return this._currentRegime; // 返回结果
  } // 结束代码块

  /**
   * 获取上一个市场状态
   * @returns {string}
   */
  getPreviousRegime() { // 调用 getPreviousRegime
    return this._prevRegime; // 返回结果
  } // 结束代码块

  /**
   * 获取当前指标
   * @returns {Object}
   */
  getIndicators() { // 调用 getIndicators
    return { ...this._indicators }; // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      currentRegime: this._currentRegime, // 设置 currentRegime 字段
      regimeChanges: this._stats.regimeChanges, // 设置 regimeChanges 字段
      lastChangeTime: this._stats.lastChangeTime, // 设置 lastChangeTime 字段
      historyLength: this._regimeHistory.length, // 设置 historyLength 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取状态历史
   * @param {number} limit - 返回数量限制
   * @returns {Array}
   */
  getRegimeHistory(limit = 50) { // 调用 getRegimeHistory
    return this._regimeHistory.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 判断当前是否适合交易
   * @returns {Object}
   */
  isTradingAllowed() { // 调用 isTradingAllowed
    const regime = this._currentRegime; // 定义常量 regime

    if (regime === MarketRegime.EXTREME) { // 条件判断 regime === MarketRegime.EXTREME
      return { // 返回结果
        allowed: false, // 设置 allowed 字段
        reason: '极端波动，风控模式', // 设置 reason 字段
        recommendation: '等待市场稳定', // 设置 recommendation 字段
      }; // 结束代码块
    } // 结束代码块

    return { // 返回结果
      allowed: true, // 设置 allowed 字段
      regime, // 执行语句
      positionMultiplier: this._getStrategyRecommendation().positionSizing, // 设置 positionMultiplier 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 重置检测器
   */
  reset() { // 调用 reset
    this._currentRegime = MarketRegime.RANGING; // 设置 _currentRegime
    this._prevRegime = MarketRegime.RANGING; // 设置 _prevRegime
    this._regimeHistory = []; // 设置 _regimeHistory
    this._regimeCounter = 0; // 设置 _regimeCounter
    this._pendingRegime = null; // 设置 _pendingRegime
    this._bbWidthHistory = []; // 设置 _bbWidthHistory
    this._atrHistory = []; // 设置 _atrHistory
    this._adxHistory = []; // 设置 _adxHistory
    this._hurstHistory = []; // 设置 _hurstHistory
    this._indicators = {}; // 设置 _indicators
    this._stats = { // 设置 _stats
      regimeChanges: 0, // 设置 regimeChanges 字段
      lastChangeTime: null, // 设置 lastChangeTime 字段
      regimeDurations: {}, // 设置 regimeDurations 字段
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

export default MarketRegimeDetector; // 默认导出
