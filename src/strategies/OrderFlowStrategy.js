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

import { BaseStrategy } from './BaseStrategy.js';
import { EMA, SMA, ATR, getLatest } from '../utils/indicators.js';

/**
 * 订单流策略类
 * Order Flow Strategy Class
 */
export class OrderFlowStrategy extends BaseStrategy {
  /**
   * 构造函数
   * @param {Object} params - 策略参数
   */
  constructor(params = {}) {
    super({
      name: 'OrderFlowStrategy',
      ...params,
    });

    // ========== 基础参数 ==========
    // 交易对 / Trading pair
    this.symbol = params.symbol || 'BTC/USDT';

    // 仓位百分比 / Position percentage
    this.positionPercent = params.positionPercent || 95;

    // ========== 成交量突增参数 ==========
    // 成交量均线周期 / Volume MA period
    this.volumeMAPeriod = params.volumeMAPeriod || 20;

    // 成交量突增倍数阈值 / Volume spike multiplier threshold
    this.volumeSpikeMultiplier = params.volumeSpikeMultiplier || 2.0;

    // ========== VWAP 参数 ==========
    // VWAP 计算周期 / VWAP period
    this.vwapPeriod = params.vwapPeriod || 20;

    // VWAP 偏离阈值 (%) / VWAP deviation threshold (%)
    this.vwapDeviationThreshold = params.vwapDeviationThreshold || 1.0;

    // ========== 大单/小单参数 ==========
    // 大单判定阈值 (相对平均成交量倍数) / Large order threshold
    this.largeOrderMultiplier = params.largeOrderMultiplier || 3.0;

    // 大单比例阈值 / Large order ratio threshold
    this.largeOrderRatioThreshold = params.largeOrderRatioThreshold || 0.6;

    // ========== Taker Buy Ratio 参数 ==========
    // Taker Buy Ratio 计算窗口 / Taker buy ratio window
    this.takerWindow = params.takerWindow || 10;

    // 看涨阈值 / Bullish threshold
    this.takerBuyThreshold = params.takerBuyThreshold || 0.6;

    // 看跌阈值 / Bearish threshold
    this.takerSellThreshold = params.takerSellThreshold || 0.4;

    // ========== 信号组合参数 ==========
    // 入场所需最少信号数 / Minimum signals for entry
    this.minSignalsForEntry = params.minSignalsForEntry || 2;

    // 是否启用各指标 / Enable flags
    this.useVolumeSpike = params.useVolumeSpike !== false;
    this.useVWAPDeviation = params.useVWAPDeviation !== false;
    this.useLargeOrderRatio = params.useLargeOrderRatio !== false;
    this.useTakerBuyRatio = params.useTakerBuyRatio !== false;

    // ========== 止损止盈参数 ==========
    // 止损百分比 / Stop loss percentage
    this.stopLossPercent = params.stopLossPercent || 1.5;

    // 止盈百分比 / Take profit percentage
    this.takeProfitPercent = params.takeProfitPercent || 3.0;

    // 跟踪止损 / Trailing stop
    this.useTrailingStop = params.useTrailingStop !== false;
    this.trailingStopPercent = params.trailingStopPercent || 1.0;

    // ========== 内部状态 ==========
    // 成交量历史 / Volume history
    this._volumeHistory = [];

    // VWAP 计算数据 / VWAP calculation data
    this._vwapData = [];

    // Taker 数据窗口 / Taker data window
    this._takerBuyVolumes = [];
    this._takerSellVolumes = [];

    // 大单统计 / Large order stats
    this._largeOrderBuyVolume = 0;
    this._largeOrderSellVolume = 0;

    // 持仓状态 / Position state
    this._entryPrice = null;
    this._stopLoss = null;
    this._takeProfit = null;
    this._highestSinceEntry = null;
    this._trailingStop = null;
  }

  /**
   * 获取策略所需的数据类型
   * Get data types required by the strategy
   * @returns {Array<string>} 数据类型列表 / Data type list
   */
  getRequiredDataTypes() {
    // 订单流策略需要深度和成交数据 / Order flow strategy needs depth and trade data
    return ['depth', 'trade'];
  }

  /**
   * 初始化
   */
  async onInit() {
    await super.onInit();

    this.log(`订单流策略初始化 / Order Flow Strategy initialized`);
    this.log(`参数: 成交量倍数=${this.volumeSpikeMultiplier}, VWAP偏离=${this.vwapDeviationThreshold}%, Taker阈值=${this.takerBuyThreshold}`);
    this.log(`启用指标: VolumeSpike=${this.useVolumeSpike}, VWAP=${this.useVWAPDeviation}, LargeOrder=${this.useLargeOrderRatio}, TakerRatio=${this.useTakerBuyRatio}`);
  }

  /**
   * 每个 K 线触发
   * @param {Object} candle - 当前 K 线
   * @param {Array} history - 历史数据
   */
  async onTick(candle, history) {
    // 确保有足够数据 / Ensure enough data
    const requiredLength = Math.max(this.volumeMAPeriod, this.vwapPeriod) + 5;
    if (history.length < requiredLength) {
      return;
    }

    // 更新内部数据 / Update internal data
    this._updateInternalData(candle, history);

    // 计算订单流指标 / Calculate order flow indicators
    const indicators = this._calculateOrderFlowIndicators(candle, history);

    // 保存指标 / Save indicators
    this._saveIndicators(indicators);

    // 生成交易信号 / Generate trading signals
    const signals = this._generateSignals(indicators, candle);

    // 获取持仓 / Get position
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    if (!hasPosition) {
      // 无仓位，检查入场信号 / No position, check entry signals
      this._handleEntry(signals, indicators, candle);
    } else {
      // 有仓位，管理出场 / Has position, manage exit
      this._handleExit(signals, indicators, candle);
    }
  }

  /**
   * 更新内部数据
   * @private
   */
  _updateInternalData(candle, history) {
    // 更新成交量历史 / Update volume history
    this._volumeHistory.push(candle.volume);
    if (this._volumeHistory.length > this.volumeMAPeriod * 2) {
      this._volumeHistory.shift();
    }

    // 更新 VWAP 数据 / Update VWAP data
    this._vwapData.push({
      price: (candle.high + candle.low + candle.close) / 3, // Typical Price
      volume: candle.volume,
    });
    if (this._vwapData.length > this.vwapPeriod) {
      this._vwapData.shift();
    }

    // 模拟 Taker 买卖量 (基于 K 线) / Simulate taker buy/sell volume from candle
    const { takerBuyVolume, takerSellVolume } = this._estimateTakerVolumes(candle);
    this._takerBuyVolumes.push(takerBuyVolume);
    this._takerSellVolumes.push(takerSellVolume);

    if (this._takerBuyVolumes.length > this.takerWindow) {
      this._takerBuyVolumes.shift();
      this._takerSellVolumes.shift();
    }

    // 估算大单量 / Estimate large order volume
    const avgVolume = this._volumeHistory.length > 0 ?
      this._volumeHistory.reduce((a, b) => a + b, 0) / this._volumeHistory.length : candle.volume;
    const isLargeOrder = candle.volume > avgVolume * this.largeOrderMultiplier;

    if (isLargeOrder) {
      // 根据 K 线方向判断大单方向 / Determine large order direction
      if (candle.close > candle.open) {
        this._largeOrderBuyVolume += candle.volume;
      } else {
        this._largeOrderSellVolume += candle.volume;
      }
    }
  }

  /**
   * 从 K 线估算 Taker 买卖量
   * @private
   */
  _estimateTakerVolumes(candle) {
    // 基于 K 线实体和影线估算买卖力度
    // Estimate buy/sell pressure from candle body and wicks
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    // 阳线: 买方主导，阴线: 卖方主导
    // Bullish candle: buyers dominate, Bearish: sellers dominate
    const isBullish = candle.close > candle.open;

    let buyRatio, sellRatio;

    if (range === 0) {
      buyRatio = 0.5;
      sellRatio = 0.5;
    } else {
      // 实体占比越大，主导方向越明确
      const bodyRatio = body / range;

      if (isBullish) {
        // 阳线: 基础买方比例 + 实体加成
        buyRatio = 0.5 + (bodyRatio * 0.3) + (lowerWick / range * 0.2);
        sellRatio = 1 - buyRatio;
      } else {
        // 阴线: 基础卖方比例 + 实体加成
        sellRatio = 0.5 + (bodyRatio * 0.3) + (upperWick / range * 0.2);
        buyRatio = 1 - sellRatio;
      }
    }

    return {
      takerBuyVolume: candle.volume * buyRatio,
      takerSellVolume: candle.volume * sellRatio,
    };
  }

  /**
   * 计算订单流指标
   * @private
   */
  _calculateOrderFlowIndicators(candle, history) {
    const indicators = {};

    // 1. 成交量突增 / Volume Spike
    if (this.useVolumeSpike) {
      indicators.volumeSpike = this._calculateVolumeSpike(candle);
    }

    // 2. VWAP 偏离 / VWAP Deviation
    if (this.useVWAPDeviation) {
      indicators.vwapDeviation = this._calculateVWAPDeviation(candle);
    }

    // 3. 大单/小单比例 / Large Order Ratio
    if (this.useLargeOrderRatio) {
      indicators.largeOrderRatio = this._calculateLargeOrderRatio();
    }

    // 4. Taker Buy Ratio
    if (this.useTakerBuyRatio) {
      indicators.takerBuyRatio = this._calculateTakerBuyRatio();
    }

    return indicators;
  }

  /**
   * 计算成交量突增
   * @private
   */
  _calculateVolumeSpike(candle) {
    if (this._volumeHistory.length < this.volumeMAPeriod) {
      return { isSpike: false, ratio: 1, direction: 'neutral' };
    }

    // 计算成交量均值 / Calculate volume MA
    const volumeMA = this._volumeHistory.slice(-this.volumeMAPeriod).reduce((a, b) => a + b, 0) / this.volumeMAPeriod;

    // 当前成交量相对均值的倍数 / Current volume ratio to MA
    const ratio = candle.volume / volumeMA;

    // 判断是否突增 / Determine if spike
    const isSpike = ratio >= this.volumeSpikeMultiplier;

    // 判断方向 / Determine direction
    let direction = 'neutral';
    if (isSpike) {
      direction = candle.close > candle.open ? 'bullish' : 'bearish';
    }

    return { isSpike, ratio, direction, volumeMA };
  }

  /**
   * 计算 VWAP 偏离
   * @private
   */
  _calculateVWAPDeviation(candle) {
    if (this._vwapData.length < 5) {
      return { vwap: candle.close, deviation: 0, deviationPercent: 0 };
    }

    // 计算 VWAP / Calculate VWAP
    let sumPV = 0;
    let sumV = 0;

    for (const data of this._vwapData) {
      sumPV += data.price * data.volume;
      sumV += data.volume;
    }

    const vwap = sumV > 0 ? sumPV / sumV : candle.close;

    // 计算偏离度 / Calculate deviation
    const deviation = candle.close - vwap;
    const deviationPercent = (deviation / vwap) * 100;

    // 判断偏离方向 / Determine deviation direction
    let direction = 'neutral';
    if (Math.abs(deviationPercent) >= this.vwapDeviationThreshold) {
      direction = deviationPercent > 0 ? 'above' : 'below';
    }

    return { vwap, deviation, deviationPercent, direction };
  }

  /**
   * 计算大单比例
   * @private
   */
  _calculateLargeOrderRatio() {
    const totalLargeVolume = this._largeOrderBuyVolume + this._largeOrderSellVolume;

    if (totalLargeVolume === 0) {
      return { ratio: 0.5, buyVolume: 0, sellVolume: 0, direction: 'neutral' };
    }

    // 大单买方比例 / Large order buy ratio
    const ratio = this._largeOrderBuyVolume / totalLargeVolume;

    // 判断方向 / Determine direction
    let direction = 'neutral';
    if (ratio >= this.largeOrderRatioThreshold) {
      direction = 'bullish';
    } else if (ratio <= (1 - this.largeOrderRatioThreshold)) {
      direction = 'bearish';
    }

    return {
      ratio,
      buyVolume: this._largeOrderBuyVolume,
      sellVolume: this._largeOrderSellVolume,
      direction,
    };
  }

  /**
   * 计算 Taker Buy Ratio
   * @private
   */
  _calculateTakerBuyRatio() {
    if (this._takerBuyVolumes.length === 0) {
      return { ratio: 0.5, direction: 'neutral' };
    }

    // 计算窗口内总量 / Calculate total volume in window
    const totalBuy = this._takerBuyVolumes.reduce((a, b) => a + b, 0);
    const totalSell = this._takerSellVolumes.reduce((a, b) => a + b, 0);
    const total = totalBuy + totalSell;

    if (total === 0) {
      return { ratio: 0.5, direction: 'neutral' };
    }

    // Taker 买方比例 / Taker buy ratio
    const ratio = totalBuy / total;

    // 判断方向 / Determine direction
    let direction = 'neutral';
    if (ratio >= this.takerBuyThreshold) {
      direction = 'bullish';
    } else if (ratio <= this.takerSellThreshold) {
      direction = 'bearish';
    }

    return { ratio, totalBuy, totalSell, direction };
  }

  /**
   * 保存指标到缓存
   * @private
   */
  _saveIndicators(indicators) {
    if (indicators.volumeSpike) {
      this.setIndicator('volumeSpikeRatio', indicators.volumeSpike.ratio);
      this.setIndicator('volumeSpikeDirection', indicators.volumeSpike.direction);
    }

    if (indicators.vwapDeviation) {
      this.setIndicator('VWAP', indicators.vwapDeviation.vwap);
      this.setIndicator('VWAPDeviation', indicators.vwapDeviation.deviationPercent);
    }

    if (indicators.largeOrderRatio) {
      this.setIndicator('largeOrderRatio', indicators.largeOrderRatio.ratio);
    }

    if (indicators.takerBuyRatio) {
      this.setIndicator('takerBuyRatio', indicators.takerBuyRatio.ratio);
    }
  }

  /**
   * 生成交易信号
   * @private
   */
  _generateSignals(indicators, candle) {
    const signals = {
      bullish: [],
      bearish: [],
    };

    // 1. 成交量突增信号 / Volume spike signal
    if (indicators.volumeSpike && indicators.volumeSpike.isSpike) {
      if (indicators.volumeSpike.direction === 'bullish') {
        signals.bullish.push({
          type: 'volumeSpike',
          strength: Math.min(indicators.volumeSpike.ratio / this.volumeSpikeMultiplier, 2),
          reason: `放量上涨 ${indicators.volumeSpike.ratio.toFixed(1)}x`,
        });
      } else if (indicators.volumeSpike.direction === 'bearish') {
        signals.bearish.push({
          type: 'volumeSpike',
          strength: Math.min(indicators.volumeSpike.ratio / this.volumeSpikeMultiplier, 2),
          reason: `放量下跌 ${indicators.volumeSpike.ratio.toFixed(1)}x`,
        });
      }
    }

    // 2. VWAP 偏离信号 / VWAP deviation signal
    if (indicators.vwapDeviation) {
      const dev = indicators.vwapDeviation.deviationPercent;
      // 价格在 VWAP 上方且回踩 = 买入机会
      // 价格在 VWAP 下方且反弹 = 卖出机会 (或做空)
      if (indicators.vwapDeviation.direction === 'above' && dev > this.vwapDeviationThreshold) {
        // 强势突破 VWAP
        signals.bullish.push({
          type: 'vwapDeviation',
          strength: Math.min(Math.abs(dev) / this.vwapDeviationThreshold, 2),
          reason: `价格高于VWAP ${dev.toFixed(2)}%`,
        });
      } else if (indicators.vwapDeviation.direction === 'below' && dev < -this.vwapDeviationThreshold) {
        // 跌破 VWAP
        signals.bearish.push({
          type: 'vwapDeviation',
          strength: Math.min(Math.abs(dev) / this.vwapDeviationThreshold, 2),
          reason: `价格低于VWAP ${dev.toFixed(2)}%`,
        });
      }
    }

    // 3. 大单比例信号 / Large order ratio signal
    if (indicators.largeOrderRatio) {
      if (indicators.largeOrderRatio.direction === 'bullish') {
        signals.bullish.push({
          type: 'largeOrderRatio',
          strength: indicators.largeOrderRatio.ratio,
          reason: `大单买入占比 ${(indicators.largeOrderRatio.ratio * 100).toFixed(1)}%`,
        });
      } else if (indicators.largeOrderRatio.direction === 'bearish') {
        signals.bearish.push({
          type: 'largeOrderRatio',
          strength: 1 - indicators.largeOrderRatio.ratio,
          reason: `大单卖出占比 ${((1 - indicators.largeOrderRatio.ratio) * 100).toFixed(1)}%`,
        });
      }
    }

    // 4. Taker Buy Ratio 信号 / Taker buy ratio signal
    if (indicators.takerBuyRatio) {
      if (indicators.takerBuyRatio.direction === 'bullish') {
        signals.bullish.push({
          type: 'takerBuyRatio',
          strength: indicators.takerBuyRatio.ratio,
          reason: `主动买入占比 ${(indicators.takerBuyRatio.ratio * 100).toFixed(1)}%`,
        });
      } else if (indicators.takerBuyRatio.direction === 'bearish') {
        signals.bearish.push({
          type: 'takerBuyRatio',
          strength: 1 - indicators.takerBuyRatio.ratio,
          reason: `主动卖出占比 ${((1 - indicators.takerBuyRatio.ratio) * 100).toFixed(1)}%`,
        });
      }
    }

    return signals;
  }

  /**
   * 处理入场逻辑
   * @private
   */
  _handleEntry(signals, indicators, candle) {
    // 计算看涨信号数 / Count bullish signals
    const bullishCount = signals.bullish.length;
    const bearishCount = signals.bearish.length;

    // 计算信号强度 / Calculate signal strength
    const bullishStrength = signals.bullish.reduce((sum, s) => sum + s.strength, 0);
    const bearishStrength = signals.bearish.reduce((sum, s) => sum + s.strength, 0);

    // 判断是否满足入场条件 / Check entry conditions
    if (bullishCount >= this.minSignalsForEntry && bullishStrength > bearishStrength) {
      // 多头入场 / Long entry
      const reasons = signals.bullish.map(s => s.reason).join(', ');

      this.log(`看涨信号! ${bullishCount}个指标确认: ${reasons}`);

      // 设置止损止盈 / Set stop loss and take profit
      this._entryPrice = candle.close;
      this._stopLoss = candle.close * (1 - this.stopLossPercent / 100);
      this._takeProfit = candle.close * (1 + this.takeProfitPercent / 100);
      this._highestSinceEntry = candle.high;
      this._trailingStop = this._stopLoss;

      // 重置大单统计 / Reset large order stats
      this._largeOrderBuyVolume = 0;
      this._largeOrderSellVolume = 0;

      this.setBuySignal(`OrderFlow: ${reasons}`);
      this.buyPercent(this.symbol, this.positionPercent);
    }

    // 记录看跌信号 (当前仅做多) / Log bearish signals (long only for now)
    if (bearishCount >= this.minSignalsForEntry && bearishStrength > bullishStrength) {
      const reasons = signals.bearish.map(s => s.reason).join(', ');
      this.log(`看跌信号 (仅记录): ${bearishCount}个指标确认: ${reasons}`);
      this.setIndicator('bearishSignal', true);
    }
  }

  /**
   * 处理出场逻辑
   * @private
   */
  _handleExit(signals, indicators, candle) {
    // 更新最高价 / Update highest price
    if (candle.high > this._highestSinceEntry) {
      this._highestSinceEntry = candle.high;

      // 更新跟踪止损 / Update trailing stop
      if (this.useTrailingStop) {
        const newTrailingStop = this._highestSinceEntry * (1 - this.trailingStopPercent / 100);
        if (newTrailingStop > this._trailingStop) {
          this._trailingStop = newTrailingStop;
          this.log(`跟踪止损更新: ${this._trailingStop.toFixed(2)}`);
        }
      }
    }

    // 计算盈亏 / Calculate P&L
    const pnlPercent = ((candle.close - this._entryPrice) / this._entryPrice * 100);

    // 检查止盈 / Check take profit
    if (candle.close >= this._takeProfit) {
      this.log(`止盈触发! 价格=${candle.close.toFixed(2)}, 盈利=${pnlPercent.toFixed(2)}%`);
      this.setSellSignal(`Take Profit @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
      return;
    }

    // 检查止损 / Check stop loss
    const effectiveStop = this.useTrailingStop ?
      Math.max(this._stopLoss, this._trailingStop) : this._stopLoss;

    if (candle.close <= effectiveStop) {
      this.log(`止损触发! 价格=${candle.close.toFixed(2)}, 止损=${effectiveStop.toFixed(2)}, PnL=${pnlPercent.toFixed(2)}%`);
      this.setSellSignal(`Stop Loss @ ${candle.close.toFixed(2)}`);
      this.closePosition(this.symbol);
      this._resetState();
      return;
    }

    // 检查反向信号 / Check reverse signals
    const bearishCount = signals.bearish.length;
    const bearishStrength = signals.bearish.reduce((sum, s) => sum + s.strength, 0);
    const bullishStrength = signals.bullish.reduce((sum, s) => sum + s.strength, 0);

    // 多个看跌信号且强度大于看涨 = 出场 / Multiple bearish signals = exit
    if (bearishCount >= this.minSignalsForEntry && bearishStrength > bullishStrength * 1.5 && pnlPercent > 0) {
      const reasons = signals.bearish.map(s => s.reason).join(', ');
      this.log(`反向信号出场! ${reasons}, PnL=${pnlPercent.toFixed(2)}%`);
      this.setSellSignal(`Reverse Signal: ${reasons}`);
      this.closePosition(this.symbol);
      this._resetState();
    }

    // 保存当前止损位 / Save current stop level
    this.setIndicator('stopLoss', effectiveStop);
    this.setIndicator('takeProfit', this._takeProfit);
  }

  /**
   * 重置状态
   * @private
   */
  _resetState() {
    this._entryPrice = null;
    this._stopLoss = null;
    this._takeProfit = null;
    this._highestSinceEntry = null;
    this._trailingStop = null;
  }

  /**
   * 订单成交回调
   * @param {Object} order - 订单信息
   */
  onOrderFilled(order) {
    this.log(`订单成交: ${order.side} ${order.amount} @ ${order.price}`);
    this.emit('orderFilled', order);
  }

  /**
   * 策略结束
   */
  async onFinish() {
    await super.onFinish();

    // 输出统计信息 / Output statistics
    this.log('=== 订单流策略统计 ===');
    this.log(`大单买入总量: ${this._largeOrderBuyVolume.toFixed(2)}`);
    this.log(`大单卖出总量: ${this._largeOrderSellVolume.toFixed(2)}`);
  }
}

export default OrderFlowStrategy;
