/**
 * 仓位计算器
 * Position Calculator
 *
 * 提供各种仓位计算方法，支持多种仓位管理策略
 * Provides various position calculation methods, supports multiple position management strategies
 */

// 导入高精度计算 / Import high precision calculation
import Decimal from 'decimal.js';

/**
 * 仓位计算器类
 * Position Calculator Class
 */
export class PositionCalculator {
  /**
   * 固定金额仓位
   * Fixed amount position sizing
   *
   * @param {Object} params - 参数 / Parameters
   * @param {number} params.fixedAmount - 固定金额 / Fixed amount
   * @param {number} params.price - 当前价格 / Current price
   * @returns {Object} 仓位信息 / Position info
   */
  static fixedAmount(params) {
    const { fixedAmount, price } = params;

    // 计算数量 / Calculate quantity
    const quantity = new Decimal(fixedAmount).div(price).toNumber();

    return {
      method: 'fixedAmount',       // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value: fixedAmount,          // 价值 / Value
      price,                        // 价格 / Price
    };
  }

  /**
   * 固定百分比仓位
   * Fixed percentage position sizing
   *
   * @param {Object} params - 参数 / Parameters
   * @param {number} params.capital - 总资金 / Total capital
   * @param {number} params.percent - 百分比 (0-100) / Percentage (0-100)
   * @param {number} params.price - 当前价格 / Current price
   * @returns {Object} 仓位信息 / Position info
   */
  static fixedPercent(params) {
    const { capital, percent, price } = params;

    // 计算仓位价值 / Calculate position value
    const value = new Decimal(capital).mul(percent).div(100).toNumber();

    // 计算数量 / Calculate quantity
    const quantity = value / price;

    return {
      method: 'fixedPercent',      // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      price,                        // 价格 / Price
      percent,                      // 百分比 / Percentage
    };
  }

  /**
   * 风险百分比仓位 (凯利公式变体)
   * Risk percentage position sizing (Kelly formula variant)
   *
   * @param {Object} params - 参数 / Parameters
   * @param {number} params.capital - 总资金 / Total capital
   * @param {number} params.riskPercent - 风险百分比 (0-1) / Risk percentage (0-1)
   * @param {number} params.entryPrice - 入场价格 / Entry price
   * @param {number} params.stopLossPrice - 止损价格 / Stop loss price
   * @returns {Object} 仓位信息 / Position info
   */
  static riskBased(params) {
    const { capital, riskPercent, entryPrice, stopLossPrice } = params;

    // 计算风险金额 / Calculate risk amount
    const riskAmount = new Decimal(capital).mul(riskPercent);

    // 计算每单位风险 / Calculate risk per unit
    const riskPerUnit = Math.abs(entryPrice - stopLossPrice);

    // 计算数量 (风险金额 / 每单位风险) / Calculate quantity (risk amount / risk per unit)
    const quantity = riskAmount.div(riskPerUnit).toNumber();

    // 计算仓位价值 / Calculate position value
    const value = quantity * entryPrice;

    return {
      method: 'riskBased',         // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      entryPrice,                   // 入场价格 / Entry price
      stopLossPrice,                // 止损价格 / Stop loss price
      riskAmount: riskAmount.toNumber(),  // 风险金额 / Risk amount
      riskPerUnit,                  // 每单位风险 / Risk per unit
    };
  }

  /**
   * 波动率调整仓位 (ATR 基础)
   * Volatility adjusted position sizing (ATR based)
   *
   * @param {Object} params - 参数 / Parameters
   * @param {number} params.capital - 总资金 / Total capital
   * @param {number} params.riskPercent - 风险百分比 (0-1) / Risk percentage (0-1)
   * @param {number} params.price - 当前价格 / Current price
   * @param {number} params.atr - 平均真实波幅 / Average True Range
   * @param {number} params.atrMultiplier - ATR 倍数 / ATR multiplier
   * @returns {Object} 仓位信息 / Position info
   */
  static volatilityAdjusted(params) {
    const { capital, riskPercent, price, atr, atrMultiplier = 2 } = params;

    // 计算风险金额 / Calculate risk amount
    const riskAmount = new Decimal(capital).mul(riskPercent);

    // 计算止损距离 (ATR * 倍数) / Calculate stop distance (ATR * multiplier)
    const stopDistance = atr * atrMultiplier;

    // 计算数量 / Calculate quantity
    const quantity = riskAmount.div(stopDistance).toNumber();

    // 计算仓位价值 / Calculate position value
    const value = quantity * price;

    // 计算止损价格 / Calculate stop loss price
    const stopLossPrice = price - stopDistance;

    return {
      method: 'volatilityAdjusted',  // 计算方法 / Calculation method
      quantity,                       // 数量 / Quantity
      value,                          // 价值 / Value
      price,                          // 价格 / Price
      atr,                            // ATR
      stopDistance,                   // 止损距离 / Stop distance
      stopLossPrice,                  // 止损价格 / Stop loss price
      riskAmount: riskAmount.toNumber(),  // 风险金额 / Risk amount
    };
  }

  /**
   * 凯利公式
   * Kelly Criterion
   *
   * 计算最优仓位比例: f = (bp - q) / b
   * Calculate optimal position fraction: f = (bp - q) / b
   * 其中: b = 赔率, p = 胜率, q = 1 - p
   * Where: b = odds, p = win rate, q = 1 - p
   *
   * @param {Object} params - 参数 / Parameters
   * @param {number} params.capital - 总资金 / Total capital
   * @param {number} params.winRate - 胜率 (0-1) / Win rate (0-1)
   * @param {number} params.avgWin - 平均盈利 / Average win
   * @param {number} params.avgLoss - 平均亏损 / Average loss
   * @param {number} params.price - 当前价格 / Current price
   * @param {number} params.fraction - 凯利分数 (建议 0.25-0.5) / Kelly fraction (recommend 0.25-0.5)
   * @returns {Object} 仓位信息 / Position info
   */
  static kellyCriterion(params) {
    const { capital, winRate, avgWin, avgLoss, price, fraction = 0.25 } = params;

    // 计算赔率 / Calculate odds
    const odds = avgWin / avgLoss;

    // 计算凯利比例 / Calculate Kelly percentage
    // f = (bp - q) / b = (b * p - (1-p)) / b
    let kellyPercent = (odds * winRate - (1 - winRate)) / odds;

    // 限制凯利比例在合理范围 / Limit Kelly percentage to reasonable range
    kellyPercent = Math.max(0, Math.min(1, kellyPercent));

    // 应用凯利分数 (降低风险) / Apply Kelly fraction (reduce risk)
    const adjustedPercent = kellyPercent * fraction;

    // 计算仓位价值 / Calculate position value
    const value = capital * adjustedPercent;

    // 计算数量 / Calculate quantity
    const quantity = value / price;

    return {
      method: 'kellyCriterion',    // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      price,                        // 价格 / Price
      kellyPercent,                 // 原始凯利比例 / Original Kelly percentage
      adjustedPercent,              // 调整后比例 / Adjusted percentage
      odds,                         // 赔率 / Odds
      winRate,                      // 胜率 / Win rate
    };
  }

  /**
   * 马丁格尔仓位 (加倍策略，高风险)
   * Martingale position sizing (doubling strategy, high risk)
   *
   * @param {Object} params - 参数 / Parameters
   * @param {number} params.baseAmount - 基础金额 / Base amount
   * @param {number} params.consecutiveLosses - 连续亏损次数 / Consecutive losses
   * @param {number} params.price - 当前价格 / Current price
   * @param {number} params.maxMultiplier - 最大倍数限制 / Maximum multiplier limit
   * @returns {Object} 仓位信息 / Position info
   */
  static martingale(params) {
    const { baseAmount, consecutiveLosses, price, maxMultiplier = 8 } = params;

    // 计算倍数 (2^n) / Calculate multiplier (2^n)
    let multiplier = Math.pow(2, consecutiveLosses);

    // 限制最大倍数 / Limit maximum multiplier
    multiplier = Math.min(multiplier, maxMultiplier);

    // 计算仓位价值 / Calculate position value
    const value = baseAmount * multiplier;

    // 计算数量 / Calculate quantity
    const quantity = value / price;

    return {
      method: 'martingale',        // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      price,                        // 价格 / Price
      baseAmount,                   // 基础金额 / Base amount
      multiplier,                   // 倍数 / Multiplier
      consecutiveLosses,            // 连续亏损次数 / Consecutive losses
      warning: '高风险策略，请谨慎使用 / High risk strategy, use with caution',
    };
  }

  /**
   * 反马丁格尔仓位 (盈利加仓)
   * Anti-Martingale position sizing (add on wins)
   *
   * @param {Object} params - 参数 / Parameters
   * @param {number} params.baseAmount - 基础金额 / Base amount
   * @param {number} params.consecutiveWins - 连续盈利次数 / Consecutive wins
   * @param {number} params.price - 当前价格 / Current price
   * @param {number} params.maxMultiplier - 最大倍数限制 / Maximum multiplier limit
   * @returns {Object} 仓位信息 / Position info
   */
  static antiMartingale(params) {
    const { baseAmount, consecutiveWins, price, maxMultiplier = 4 } = params;

    // 计算倍数 (1.5^n) / Calculate multiplier (1.5^n)
    let multiplier = Math.pow(1.5, consecutiveWins);

    // 限制最大倍数 / Limit maximum multiplier
    multiplier = Math.min(multiplier, maxMultiplier);

    // 计算仓位价值 / Calculate position value
    const value = baseAmount * multiplier;

    // 计算数量 / Calculate quantity
    const quantity = value / price;

    return {
      method: 'antiMartingale',    // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      price,                        // 价格 / Price
      baseAmount,                   // 基础金额 / Base amount
      multiplier,                   // 倍数 / Multiplier
      consecutiveWins,              // 连续盈利次数 / Consecutive wins
    };
  }

  /**
   * 计算 ATR (平均真实波幅)
   * Calculate ATR (Average True Range)
   *
   * @param {Array} candles - K 线数据 / Candlestick data
   * @param {number} period - 计算周期 / Calculation period
   * @returns {number} ATR 值 / ATR value
   */
  static calculateATR(candles, period = 14) {
    // 确保有足够的数据 / Ensure enough data
    if (candles.length < period + 1) {
      return null;
    }

    // 计算真实波幅 / Calculate True Range
    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];

      // TR = max(high - low, |high - prevClose|, |low - prevClose|)
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      );
      trueRanges.push(tr);
    }

    // 计算 ATR (简单移动平均) / Calculate ATR (simple moving average)
    const recentTRs = trueRanges.slice(-period);
    const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / period;

    return atr;
  }
}

// 导出默认类 / Export default class
export default PositionCalculator;
