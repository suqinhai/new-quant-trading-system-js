/**
 * 订单流 / 成交行为策略
 * Order Flow / Trade Behavior Strategy
 *
 * 基于实时成交数据的短周期策略，与传统技术指标低相关
 * Short-term strategy based on real-time trade data, low correlation with traditional indicators
 *
 * 核心指标 / Core Indicators:
 * 1. 成交量突增 (Volume Spike) - 检测异常放量
 * 2. VWAP 偏离 - 价格相对成交量加权均价的偏离度
 * 3. 大单/小单比例 - 机构 vs 散户行为
 * 4. 主动买卖方向 (Taker Buy Ratio) - 市场情绪
 */

import { BaseStrategy } from './BaseStrategy.js'; // 导入模块 ./BaseStrategy.js
import { EMA, SMA, ATR, getLatest } from '../utils/indicators.js'; // 导入模块 ../utils/indicators.js

/**
 * 订单流策略类
 * Order Flow Strategy Class
 */
export class OrderFlowStrategy extends BaseStrategy { // 导出类 OrderFlowStrategy
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) { // 构造函数
    super({ // 调用父类
      name: 'OrderFlowStrategy', // name
      ...params, // 展开对象或数组
    }); // 结束代码块

    // ========== 基础参数 ==========
    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT'; // 设置 symbol

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95; // 设置 positionPercent

    // ========== 成交量突增参数 ==========
    // 成交量均线周期 / Volume MA period
    this.volumeMAPeriod = params.volumeMAPeriod || 20; // 设置 volumeMAPeriod

    // 成交量突增倍数阈值 / Volume spike multiplier threshold
    this.volumeSpikeMultiplier = params.volumeSpikeMultiplier || 2.0; // 设置 volumeSpikeMultiplier

    // ========== VWAP 参数 ==========
    // VWAP 计算周期 / VWAP period
    this.vwapPeriod = params.vwapPeriod || 20; // 设置 vwapPeriod

    // VWAP 偏离阈值 (%) / VWAP deviation threshold (%)
    this.vwapDeviationThreshold = params.vwapDeviationThreshold || 1.0; // 设置 vwapDeviationThreshold

    // ========== 大单/小单参数 ==========
    // 大单判定阈值 (相对平均成交量倍数) / Large order threshold
    this.largeOrderMultiplier = params.largeOrderMultiplier || 3.0; // 设置 largeOrderMultiplier

    // 大单比例阈值 / Large order ratio threshold
    this.largeOrderRatioThreshold = params.largeOrderRatioThreshold || 0.6; // 设置 largeOrderRatioThreshold

    // ========== Taker Buy Ratio 参数 ==========
    // Taker Buy Ratio 计算窗口 / Taker buy ratio window
    this.takerWindow = params.takerWindow || 10; // 设置 takerWindow

    // 看涨阈值 / Bullish threshold
    this.takerBuyThreshold = params.takerBuyThreshold || 0.6; // 设置 takerBuyThreshold

    // 看跌阈值 / Bearish threshold
    this.takerSellThreshold = params.takerSellThreshold || 0.4; // 设置 takerSellThreshold

    // ========== 信号组合参数 ==========
    // 入场所需最少信号数 / Minimum signals for entry
    this.minSignalsForEntry = params.minSignalsForEntry || 2; // 设置 minSignalsForEntry

    // 是否启用各指标 / Enable flags
    this.useVolumeSpike = params.useVolumeSpike !== false; // 设置 useVolumeSpike
    this.useVWAPDeviation = params.useVWAPDeviation !== false; // 设置 useVWAPDeviation
    this.useLargeOrderRatio = params.useLargeOrderRatio !== false; // 设置 useLargeOrderRatio
    this.useTakerBuyRatio = params.useTakerBuyRatio !== false; // 设置 useTakerBuyRatio

    // ========== 止损止盈参数 ==========
    // 止损百分比 / Stop loss percentage
    this.stopLossPercent = params.stopLossPercent || 1.5; // 设置 stopLossPercent

    // 止盈百分比 / Take profit percentage
    this.takeProfitPercent = params.takeProfitPercent || 3.0; // 设置 takeProfitPercent

    // 跟踪止损 / Trailing stop
    this.useTrailingStop = params.useTrailingStop !== false; // 设置 useTrailingStop
    this.trailingStopPercent = params.trailingStopPercent || 1.0; // 设置 trailingStopPercent

    // ========== 内部状态 ==========
    // 成交量历史 / Volume history
    this._volumeHistory = []; // 设置 _volumeHistory

    // VWAP 计算数据 / VWAP calculation data
    this._vwapData = []; // 设置 _vwapData

    // Taker 数据窗口 / Taker data window
    this._takerBuyVolumes = []; // 设置 _takerBuyVolumes
    this._takerSellVolumes = []; // 设置 _takerSellVolumes

    // 大单统计 / Large order stats
    this._largeOrderBuyVolume = 0; // 设置 _largeOrderBuyVolume
    this._largeOrderSellVolume = 0; // 设置 _largeOrderSellVolume

    // 持仓状态 / Position state
    this._entryPrice = null; // 设置 _entryPrice
    this._stopLoss = null; // 设置 _stopLoss
    this._takeProfit = null; // 设置 _takeProfit
    this._highestSinceEntry = null; // 设置 _highestSinceEntry
    this._trailingStop = null; // 设置 _trailingStop
  } // 结束代码块

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() { // 调用 getRequiredDataTypes
    // Order flow strategy uses candle-based signals plus depth/trade data
    return ['depth', 'trade', 'kline']; // 返回结果
  } // 结束代码块

  /**
   * 初始化
   */
  async onInit() { // 执行语句
    await super.onInit(); // 等待异步结果

    this.log(`订单流策略初始化 / Order Flow Strategy initialized`); // 调用 log
    this.log(`参数: 成交量倍数=${this.volumeSpikeMultiplier}, VWAP偏离=${this.vwapDeviationThreshold}%, Taker阈值=${this.takerBuyThreshold}`); // 调用 log
    this.log(`启用指标: VolumeSpike=${this.useVolumeSpike}, VWAP=${this.useVWAPDeviation}, LargeOrder=${this.useLargeOrderRatio}, TakerRatio=${this.useTakerBuyRatio}`); // 调用 log
  } // 结束代码块

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) { // 执行语句
    // 确保有足够数据 / Ensure enough data
    const requiredLength = Math.max(this.volumeMAPeriod, this.vwapPeriod) + 5; // 定义常量 requiredLength
    if (history.length < requiredLength) { // 条件判断 history.length < requiredLength
      return; // 返回结果
    } // 结束代码块

    // 更新内部数据 / Update internal data
    this._updateInternalData(candle, history); // 调用 _updateInternalData

    // 计算订单流指标 / Calculate order flow indicators
    const indicators = this._calculateOrderFlowIndicators(candle, history); // 定义常量 indicators

    // 保存指标 / Save indicators
    this._saveIndicators(indicators); // 调用 _saveIndicators

    // 生成交易信号 / Generate trading signals
    const signals = this._generateSignals(indicators, candle); // 定义常量 signals

    // 获取持仓 / Get position
    const position = this.getPosition(this.symbol); // 定义常量 position
    const hasPosition = position && position.amount > 0; // 定义常量 hasPosition

    if (!hasPosition) { // 条件判断 !hasPosition
      // 无仓位，检查入场信号 / No position, check entry signals
      this._handleEntry(signals, indicators, candle); // 调用 _handleEntry
    } else { // 执行语句
      // 有仓位，管理出场 / Has position, manage exit
      this._handleExit(signals, indicators, candle); // 调用 _handleExit
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新内部数据
   * @private
   */
  _updateInternalData(candle, history) { // 调用 _updateInternalData
    // 更新成交量历史 / Update volume history
    this._volumeHistory.push(candle.volume); // 访问 _volumeHistory
    if (this._volumeHistory.length > this.volumeMAPeriod * 2) { // 条件判断 this._volumeHistory.length > this.volumeMAPer...
      this._volumeHistory.shift(); // 访问 _volumeHistory
    } // 结束代码块

    // 更新 VWAP 数据 / Update VWAP data
    this._vwapData.push({ // 访问 _vwapData
      price: (candle.high + candle.low + candle.close) / 3, // 价格
      volume: candle.volume, // 成交量
    }); // 结束代码块
    if (this._vwapData.length > this.vwapPeriod) { // 条件判断 this._vwapData.length > this.vwapPeriod
      this._vwapData.shift(); // 访问 _vwapData
    } // 结束代码块

    // 模拟 Taker 买卖量 (基于 K 线) / Simulate taker buy/sell volume from candle
    const { takerBuyVolume, takerSellVolume } = this._estimateTakerVolumes(candle); // 解构赋值
    this._takerBuyVolumes.push(takerBuyVolume); // 访问 _takerBuyVolumes
    this._takerSellVolumes.push(takerSellVolume); // 访问 _takerSellVolumes

    if (this._takerBuyVolumes.length > this.takerWindow) { // 条件判断 this._takerBuyVolumes.length > this.takerWindow
      this._takerBuyVolumes.shift(); // 访问 _takerBuyVolumes
      this._takerSellVolumes.shift(); // 访问 _takerSellVolumes
    } // 结束代码块

    // 估算大单量 / Estimate large order volume
    const avgVolume = this._volumeHistory.length > 0 ? // 定义常量 avgVolume
      this._volumeHistory.reduce((a, b) => a + b, 0) / this._volumeHistory.length : candle.volume; // 访问 _volumeHistory
    const isLargeOrder = candle.volume > avgVolume * this.largeOrderMultiplier; // 定义常量 isLargeOrder

    if (isLargeOrder) { // 条件判断 isLargeOrder
      // 根据 K 线方向判断大单方向 / Determine large order direction
      if (candle.close > candle.open) { // 条件判断 candle.close > candle.open
        this._largeOrderBuyVolume += candle.volume; // 访问 _largeOrderBuyVolume
      } else { // 执行语句
        this._largeOrderSellVolume += candle.volume; // 访问 _largeOrderSellVolume
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 从 K 线估算 Taker 买卖量
   * @private
   */
  _estimateTakerVolumes(candle) { // 调用 _estimateTakerVolumes
    // 基于 K 线实体和影线估算买卖力度
    // Estimate buy/sell pressure from candle body and wicks
    const body = Math.abs(candle.close - candle.open); // 定义常量 body
    const range = candle.high - candle.low; // 定义常量 range
    const upperWick = candle.high - Math.max(candle.open, candle.close); // 定义常量 upperWick
    const lowerWick = Math.min(candle.open, candle.close) - candle.low; // 定义常量 lowerWick

    // 阳线: 买方主导，阴线: 卖方主导
    // Bullish candle: buyers dominate, Bearish: sellers dominate
    const isBullish = candle.close > candle.open; // 定义常量 isBullish

    let buyRatio, sellRatio; // 定义变量 buyRatio

    if (range === 0) { // 条件判断 range === 0
      buyRatio = 0.5; // 赋值 buyRatio
      sellRatio = 0.5; // 赋值 sellRatio
    } else { // 执行语句
      // 实体占比越大，主导方向越明确
      const bodyRatio = body / range; // 定义常量 bodyRatio

      if (isBullish) { // 条件判断 isBullish
        // 阳线: 基础买方比例 + 实体加成
        buyRatio = 0.5 + (bodyRatio * 0.3) + (lowerWick / range * 0.2); // 赋值 buyRatio
        sellRatio = 1 - buyRatio; // 赋值 sellRatio
      } else { // 执行语句
        // 阴线: 基础卖方比例 + 实体加成
        sellRatio = 0.5 + (bodyRatio * 0.3) + (upperWick / range * 0.2); // 赋值 sellRatio
        buyRatio = 1 - sellRatio; // 赋值 buyRatio
      } // 结束代码块
    } // 结束代码块

    return { // 返回结果
      takerBuyVolume: candle.volume * buyRatio, // 主动成交Buy成交量
      takerSellVolume: candle.volume * sellRatio, // 主动成交Sell成交量
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算订单流指标
   * @private
   */
  _calculateOrderFlowIndicators(candle, history) { // 调用 _calculateOrderFlowIndicators
    const indicators = {}; // 定义常量 indicators

    // 1. 成交量突增 / Volume Spike
    if (this.useVolumeSpike) { // 条件判断 this.useVolumeSpike
      indicators.volumeSpike = this._calculateVolumeSpike(candle); // 赋值 indicators.volumeSpike
    } // 结束代码块

    // 2. VWAP 偏离 / VWAP Deviation
    if (this.useVWAPDeviation) { // 条件判断 this.useVWAPDeviation
      indicators.vwapDeviation = this._calculateVWAPDeviation(candle); // 赋值 indicators.vwapDeviation
    } // 结束代码块

    // 3. 大单/小单比例 / Large Order Ratio
    if (this.useLargeOrderRatio) { // 条件判断 this.useLargeOrderRatio
      indicators.largeOrderRatio = this._calculateLargeOrderRatio(); // 赋值 indicators.largeOrderRatio
    } // 结束代码块

    // 4. Taker Buy Ratio
    if (this.useTakerBuyRatio) { // 条件判断 this.useTakerBuyRatio
      indicators.takerBuyRatio = this._calculateTakerBuyRatio(); // 赋值 indicators.takerBuyRatio
    } // 结束代码块

    return indicators; // 返回结果
  } // 结束代码块

  /**
   * 计算成交量突增
   * @private
   */
  _calculateVolumeSpike(candle) { // 调用 _calculateVolumeSpike
    if (this._volumeHistory.length < this.volumeMAPeriod) { // 条件判断 this._volumeHistory.length < this.volumeMAPeriod
      return { isSpike: false, ratio: 1, direction: 'neutral' }; // 返回结果
    } // 结束代码块

    // 计算成交量均值 / Calculate volume MA
    const volumeMA = this._volumeHistory.slice(-this.volumeMAPeriod).reduce((a, b) => a + b, 0) / this.volumeMAPeriod; // 定义函数 volumeMA

    // 当前成交量相对均值的倍数 / Current volume ratio to MA
    const ratio = candle.volume / volumeMA; // 定义常量 ratio

    // 判断是否突增 / Determine if spike
    const isSpike = ratio >= this.volumeSpikeMultiplier; // 定义常量 isSpike

    // 判断方向 / Determine direction
    let direction = 'neutral'; // 定义变量 direction
    if (isSpike) { // 条件判断 isSpike
      direction = candle.close > candle.open ? 'bullish' : 'bearish'; // 赋值 direction
    } // 结束代码块

    return { isSpike, ratio, direction, volumeMA }; // 返回结果
  } // 结束代码块

  /**
   * 计算 VWAP 偏离
   * @private
   */
  _calculateVWAPDeviation(candle) { // 调用 _calculateVWAPDeviation
    if (this._vwapData.length < 5) { // 条件判断 this._vwapData.length < 5
      return { vwap: candle.close, deviation: 0, deviationPercent: 0 }; // 返回结果
    } // 结束代码块

    // 计算 VWAP / Calculate VWAP
    let sumPV = 0; // 定义变量 sumPV
    let sumV = 0; // 定义变量 sumV

    for (const data of this._vwapData) { // 循环 const data of this._vwapData
      sumPV += data.price * data.volume; // 执行语句
      sumV += data.volume; // 执行语句
    } // 结束代码块

    const vwap = sumV > 0 ? sumPV / sumV : candle.close; // 定义常量 vwap

    // 计算偏离度 / Calculate deviation
    const deviation = candle.close - vwap; // 定义常量 deviation
    const deviationPercent = (deviation / vwap) * 100; // 定义常量 deviationPercent

    // 判断偏离方向 / Determine deviation direction
    let direction = 'neutral'; // 定义变量 direction
    if (Math.abs(deviationPercent) >= this.vwapDeviationThreshold) { // 条件判断 Math.abs(deviationPercent) >= this.vwapDeviat...
      direction = deviationPercent > 0 ? 'above' : 'below'; // 赋值 direction
    } // 结束代码块

    return { vwap, deviation, deviationPercent, direction }; // 返回结果
  } // 结束代码块

  /**
   * 计算大单比例
   * @private
   */
  _calculateLargeOrderRatio() { // 调用 _calculateLargeOrderRatio
    const totalLargeVolume = this._largeOrderBuyVolume + this._largeOrderSellVolume; // 定义常量 totalLargeVolume

    if (totalLargeVolume === 0) { // 条件判断 totalLargeVolume === 0
      return { ratio: 0.5, buyVolume: 0, sellVolume: 0, direction: 'neutral' }; // 返回结果
    } // 结束代码块

    // 大单买方比例 / Large order buy ratio
    const ratio = this._largeOrderBuyVolume / totalLargeVolume; // 定义常量 ratio

    // 判断方向 / Determine direction
    let direction = 'neutral'; // 定义变量 direction
    if (ratio >= this.largeOrderRatioThreshold) { // 条件判断 ratio >= this.largeOrderRatioThreshold
      direction = 'bullish'; // 赋值 direction
    } else if (ratio <= (1 - this.largeOrderRatioThreshold)) { // 执行语句
      direction = 'bearish'; // 赋值 direction
    } // 结束代码块

    return { // 返回结果
      ratio, // 执行语句
      buyVolume: this._largeOrderBuyVolume, // buy成交量
      sellVolume: this._largeOrderSellVolume, // sell成交量
      direction, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算 Taker Buy Ratio
   * @private
   */
  _calculateTakerBuyRatio() { // 调用 _calculateTakerBuyRatio
    if (this._takerBuyVolumes.length === 0) { // 条件判断 this._takerBuyVolumes.length === 0
      return { ratio: 0.5, direction: 'neutral' }; // 返回结果
    } // 结束代码块

    // 计算窗口内总量 / Calculate total volume in window
    const totalBuy = this._takerBuyVolumes.reduce((a, b) => a + b, 0); // 定义函数 totalBuy
    const totalSell = this._takerSellVolumes.reduce((a, b) => a + b, 0); // 定义函数 totalSell
    const total = totalBuy + totalSell; // 定义常量 total

    if (total === 0) { // 条件判断 total === 0
      return { ratio: 0.5, direction: 'neutral' }; // 返回结果
    } // 结束代码块

    // Taker 买方比例 / Taker buy ratio
    const ratio = totalBuy / total; // 定义常量 ratio

    // 判断方向 / Determine direction
    let direction = 'neutral'; // 定义变量 direction
    if (ratio >= this.takerBuyThreshold) { // 条件判断 ratio >= this.takerBuyThreshold
      direction = 'bullish'; // 赋值 direction
    } else if (ratio <= this.takerSellThreshold) { // 执行语句
      direction = 'bearish'; // 赋值 direction
    } // 结束代码块

    return { ratio, totalBuy, totalSell, direction }; // 返回结果
  } // 结束代码块

  /**
   * 保存指标到缓存
   * @private
   */
  _saveIndicators(indicators) { // 调用 _saveIndicators
    if (indicators.volumeSpike) { // 条件判断 indicators.volumeSpike
      this.setIndicator('volumeSpikeRatio', indicators.volumeSpike.ratio); // 调用 setIndicator
      this.setIndicator('volumeSpikeDirection', indicators.volumeSpike.direction); // 调用 setIndicator
    } // 结束代码块

    if (indicators.vwapDeviation) { // 条件判断 indicators.vwapDeviation
      this.setIndicator('VWAP', indicators.vwapDeviation.vwap); // 调用 setIndicator
      this.setIndicator('VWAPDeviation', indicators.vwapDeviation.deviationPercent); // 调用 setIndicator
    } // 结束代码块

    if (indicators.largeOrderRatio) { // 条件判断 indicators.largeOrderRatio
      this.setIndicator('largeOrderRatio', indicators.largeOrderRatio.ratio); // 调用 setIndicator
    } // 结束代码块

    if (indicators.takerBuyRatio) { // 条件判断 indicators.takerBuyRatio
      this.setIndicator('takerBuyRatio', indicators.takerBuyRatio.ratio); // 调用 setIndicator
    } // 结束代码块
  } // 结束代码块

  /**
   * 生成交易信号
   * @private
   */
  _generateSignals(indicators, candle) { // 调用 _generateSignals
    const signals = { // 定义常量 signals
      bullish: [], // bullish
      bearish: [], // bearish
    }; // 结束代码块

    // 1. 成交量突增信号 / Volume spike signal
    if (indicators.volumeSpike && indicators.volumeSpike.isSpike) { // 条件判断 indicators.volumeSpike && indicators.volumeSp...
      if (indicators.volumeSpike.direction === 'bullish') { // 条件判断 indicators.volumeSpike.direction === 'bullish'
        signals.bullish.push({ // 调用 signals.bullish.push
          type: 'volumeSpike', // 类型
          strength: Math.min(indicators.volumeSpike.ratio / this.volumeSpikeMultiplier, 2), // strength
          reason: `放量上涨 ${indicators.volumeSpike.ratio.toFixed(1)}x`, // reason
        }); // 结束代码块
      } else if (indicators.volumeSpike.direction === 'bearish') { // 执行语句
        signals.bearish.push({ // 调用 signals.bearish.push
          type: 'volumeSpike', // 类型
          strength: Math.min(indicators.volumeSpike.ratio / this.volumeSpikeMultiplier, 2), // strength
          reason: `放量下跌 ${indicators.volumeSpike.ratio.toFixed(1)}x`, // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 2. VWAP 偏离信号 / VWAP deviation signal
    if (indicators.vwapDeviation) { // 条件判断 indicators.vwapDeviation
      const dev = indicators.vwapDeviation.deviationPercent; // 定义常量 dev
      // 价格在 VWAP 上方且回踩 = 买入机会
      // 价格在 VWAP 下方且反弹 = 卖出机会 (或做空)
      if (indicators.vwapDeviation.direction === 'above' && dev > this.vwapDeviationThreshold) { // 条件判断 indicators.vwapDeviation.direction === 'above...
        // 强势突破 VWAP
        signals.bullish.push({ // 调用 signals.bullish.push
          type: 'vwapDeviation', // 类型
          strength: Math.min(Math.abs(dev) / this.vwapDeviationThreshold, 2), // strength
          reason: `价格高于VWAP ${dev.toFixed(2)}%`, // reason
        }); // 结束代码块
      } else if (indicators.vwapDeviation.direction === 'below' && dev < -this.vwapDeviationThreshold) { // 执行语句
        // 跌破 VWAP
        signals.bearish.push({ // 调用 signals.bearish.push
          type: 'vwapDeviation', // 类型
          strength: Math.min(Math.abs(dev) / this.vwapDeviationThreshold, 2), // strength
          reason: `价格低于VWAP ${dev.toFixed(2)}%`, // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 3. 大单比例信号 / Large order ratio signal
    if (indicators.largeOrderRatio) { // 条件判断 indicators.largeOrderRatio
      if (indicators.largeOrderRatio.direction === 'bullish') { // 条件判断 indicators.largeOrderRatio.direction === 'bul...
        signals.bullish.push({ // 调用 signals.bullish.push
          type: 'largeOrderRatio', // 类型
          strength: indicators.largeOrderRatio.ratio, // strength
          reason: `大单买入占比 ${(indicators.largeOrderRatio.ratio * 100).toFixed(1)}%`, // reason
        }); // 结束代码块
      } else if (indicators.largeOrderRatio.direction === 'bearish') { // 执行语句
        signals.bearish.push({ // 调用 signals.bearish.push
          type: 'largeOrderRatio', // 类型
          strength: 1 - indicators.largeOrderRatio.ratio, // strength
          reason: `大单卖出占比 ${((1 - indicators.largeOrderRatio.ratio) * 100).toFixed(1)}%`, // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 4. Taker Buy Ratio 信号 / Taker buy ratio signal
    if (indicators.takerBuyRatio) { // 条件判断 indicators.takerBuyRatio
      if (indicators.takerBuyRatio.direction === 'bullish') { // 条件判断 indicators.takerBuyRatio.direction === 'bullish'
        signals.bullish.push({ // 调用 signals.bullish.push
          type: 'takerBuyRatio', // 类型
          strength: indicators.takerBuyRatio.ratio, // strength
          reason: `主动买入占比 ${(indicators.takerBuyRatio.ratio * 100).toFixed(1)}%`, // reason
        }); // 结束代码块
      } else if (indicators.takerBuyRatio.direction === 'bearish') { // 执行语句
        signals.bearish.push({ // 调用 signals.bearish.push
          type: 'takerBuyRatio', // 类型
          strength: 1 - indicators.takerBuyRatio.ratio, // strength
          reason: `主动卖出占比 ${((1 - indicators.takerBuyRatio.ratio) * 100).toFixed(1)}%`, // reason
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return signals; // 返回结果
  } // 结束代码块

  /**
   * 处理入场逻辑
   * @private
   */
  _handleEntry(signals, indicators, candle) { // 调用 _handleEntry
    // 计算看涨信号数 / Count bullish signals
    const bullishCount = signals.bullish.length; // 定义常量 bullishCount
    const bearishCount = signals.bearish.length; // 定义常量 bearishCount

    // 计算信号强度 / Calculate signal strength
    const bullishStrength = signals.bullish.reduce((sum, s) => sum + s.strength, 0); // 定义函数 bullishStrength
    const bearishStrength = signals.bearish.reduce((sum, s) => sum + s.strength, 0); // 定义函数 bearishStrength

    // 判断是否满足入场条件 / Check entry conditions
    if (bullishCount >= this.minSignalsForEntry && bullishStrength > bearishStrength) { // 条件判断 bullishCount >= this.minSignalsForEntry && bu...
      // 多头入场 / Long entry
      const reasons = signals.bullish.map(s => s.reason).join(', '); // 定义函数 reasons

      this.log(`看涨信号! ${bullishCount}个指标确认: ${reasons}`); // 调用 log

      // 设置止损止盈 / Set stop loss and take profit
      this._entryPrice = candle.close; // 设置 _entryPrice
      this._stopLoss = candle.close * (1 - this.stopLossPercent / 100); // 设置 _stopLoss
      this._takeProfit = candle.close * (1 + this.takeProfitPercent / 100); // 设置 _takeProfit
      this._highestSinceEntry = candle.high; // 设置 _highestSinceEntry
      this._trailingStop = this._stopLoss; // 设置 _trailingStop

      // 重置大单统计 / Reset large order stats
      this._largeOrderBuyVolume = 0; // 设置 _largeOrderBuyVolume
      this._largeOrderSellVolume = 0; // 设置 _largeOrderSellVolume

      this.setBuySignal(`OrderFlow: ${reasons}`); // 调用 setBuySignal
      this.buyPercent(this.symbol, this.positionPercent); // 调用 buyPercent
    } // 结束代码块

    // 记录看跌信号 (当前仅做多) / Log bearish signals (long only for now)
    if (bearishCount >= this.minSignalsForEntry && bearishStrength > bullishStrength) { // 条件判断 bearishCount >= this.minSignalsForEntry && be...
      const reasons = signals.bearish.map(s => s.reason).join(', '); // 定义函数 reasons
      this.log(`看跌信号 (仅记录): ${bearishCount}个指标确认: ${reasons}`); // 调用 log
      this.setIndicator('bearishSignal', true); // 调用 setIndicator
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理出场逻辑
   * @private
   */
  _handleExit(signals, indicators, candle) { // 调用 _handleExit
    // 更新最高价 / Update highest price
    if (candle.high > this._highestSinceEntry) { // 条件判断 candle.high > this._highestSinceEntry
      this._highestSinceEntry = candle.high; // 设置 _highestSinceEntry

      // 更新跟踪止损 / Update trailing stop
      if (this.useTrailingStop) { // 条件判断 this.useTrailingStop
        const newTrailingStop = this._highestSinceEntry * (1 - this.trailingStopPercent / 100); // 定义常量 newTrailingStop
        if (newTrailingStop > this._trailingStop) { // 条件判断 newTrailingStop > this._trailingStop
          this._trailingStop = newTrailingStop; // 设置 _trailingStop
          this.log(`跟踪止损更新: ${this._trailingStop.toFixed(2)}`); // 调用 log
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 计算盈亏 / Calculate P&L
    const pnlPercent = ((candle.close - this._entryPrice) / this._entryPrice * 100); // 定义常量 pnlPercent

    // 检查止盈 / Check take profit
    if (candle.close >= this._takeProfit) { // 条件判断 candle.close >= this._takeProfit
      this.log(`止盈触发! 价格=${candle.close.toFixed(2)}, 盈利=${pnlPercent.toFixed(2)}%`); // 调用 log
      this.setSellSignal(`Take Profit @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._resetState(); // 调用 _resetState
      return; // 返回结果
    } // 结束代码块

    // 检查止损 / Check stop loss
    const effectiveStop = this.useTrailingStop ? // 定义常量 effectiveStop
      Math.max(this._stopLoss, this._trailingStop) : this._stopLoss; // 调用 Math.max

    if (candle.close <= effectiveStop) { // 条件判断 candle.close <= effectiveStop
      this.log(`止损触发! 价格=${candle.close.toFixed(2)}, 止损=${effectiveStop.toFixed(2)}, PnL=${pnlPercent.toFixed(2)}%`); // 调用 log
      this.setSellSignal(`Stop Loss @ ${candle.close.toFixed(2)}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._resetState(); // 调用 _resetState
      return; // 返回结果
    } // 结束代码块

    // 检查反向信号 / Check reverse signals
    const bearishCount = signals.bearish.length; // 定义常量 bearishCount
    const bearishStrength = signals.bearish.reduce((sum, s) => sum + s.strength, 0); // 定义函数 bearishStrength
    const bullishStrength = signals.bullish.reduce((sum, s) => sum + s.strength, 0); // 定义函数 bullishStrength

    // 多个看跌信号且强度大于看涨 = 出场 / Multiple bearish signals = exit
    if (bearishCount >= this.minSignalsForEntry && bearishStrength > bullishStrength * 1.5 && pnlPercent > 0) { // 条件判断 bearishCount >= this.minSignalsForEntry && be...
      const reasons = signals.bearish.map(s => s.reason).join(', '); // 定义函数 reasons
      this.log(`反向信号出场! ${reasons}, PnL=${pnlPercent.toFixed(2)}%`); // 调用 log
      this.setSellSignal(`Reverse Signal: ${reasons}`); // 调用 setSellSignal
      this.closePosition(this.symbol); // 调用 closePosition
      this._resetState(); // 调用 _resetState
    } // 结束代码块

    // 保存当前止损位 / Save current stop level
    this.setIndicator('stopLoss', effectiveStop); // 调用 setIndicator
    this.setIndicator('takeProfit', this._takeProfit); // 调用 setIndicator
  } // 结束代码块

  /**
   * 重置状态
   * @private
   */
  _resetState() { // 调用 _resetState
    this._entryPrice = null; // 设置 _entryPrice
    this._stopLoss = null; // 设置 _stopLoss
    this._takeProfit = null; // 设置 _takeProfit
    this._highestSinceEntry = null; // 设置 _highestSinceEntry
    this._trailingStop = null; // 设置 _trailingStop
  } // 结束代码块

  /**
   * 订单成交回调
   * @param {Object} order - 订单信息
   */
  onOrderFilled(order) { // 调用 onOrderFilled
    this.log(`订单成交: ${order.side} ${order.amount} @ ${order.price}`); // 调用 log
    this.emit('orderFilled', order); // 调用 emit
  } // 结束代码块

  /**
   * 策略结束
   */
  async onFinish() { // 执行语句
    await super.onFinish(); // 等待异步结果

    // 输出统计信息 / Output statistics
    this.log('=== 订单流策略统计 ==='); // 调用 log
    this.log(`大单买入总量: ${this._largeOrderBuyVolume.toFixed(2)}`); // 调用 log
    this.log(`大单卖出总量: ${this._largeOrderSellVolume.toFixed(2)}`); // 调用 log
  } // 结束代码块
} // 结束代码块

export default OrderFlowStrategy; // 默认导出
