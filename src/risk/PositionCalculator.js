/**
 * 仓位计算器
 * Position Calculator
 *
 * 提供各种仓位计算方法，支持多种仓位管理策略
 * Provides various position calculation methods, supports multiple position management strategies
 */

// 导入高精度计算 / Import high precision calculation
import Decimal from 'decimal.js'; // 导入模块 decimal.js

/**
 * 仓位计算器类
 * Position Calculator Class
 */
export class PositionCalculator { // 导出类 PositionCalculator
  /**
   * 固定金额仓位
   * Fixed amount position sizing
   *
   * @param {Object} params - 参数 / Parameters
   * @param {number} params.fixedAmount - 固定金额 / Fixed amount
   * @param {number} params.price - 当前价格 / Current price
   * @returns {Object} 仓位信息 / Position info
   */
  static fixedAmount(params) { // 执行语句
    const { fixedAmount, price } = params; // 解构赋值

    // 计算数量 / Calculate quantity
    const quantity = new Decimal(fixedAmount).div(price).toNumber(); // 定义常量 quantity

    return { // 返回结果
      method: 'fixedAmount',       // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value: fixedAmount,          // 价值 / Value
      price,                        // 价格 / Price
    }; // 结束代码块
  } // 结束代码块

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
  static fixedPercent(params) { // 执行语句
    const { capital, percent, price } = params; // 解构赋值

    // 计算仓位价值 / Calculate position value
    const value = new Decimal(capital).mul(percent).div(100).toNumber(); // 定义常量 value

    // 计算数量 / Calculate quantity
    const quantity = value / price; // 定义常量 quantity

    return { // 返回结果
      method: 'fixedPercent',      // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      price,                        // 价格 / Price
      percent,                      // 百分比 / Percentage
    }; // 结束代码块
  } // 结束代码块

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
  static riskBased(params) { // 执行语句
    const { capital, riskPercent, entryPrice, stopLossPrice } = params; // 解构赋值

    // 计算风险金额 / Calculate risk amount
    const riskAmount = new Decimal(capital).mul(riskPercent); // 定义常量 riskAmount

    // 计算每单位风险 / Calculate risk per unit
    const riskPerUnit = Math.abs(entryPrice - stopLossPrice); // 定义常量 riskPerUnit

    // 计算数量 (风险金额 / 每单位风险) / Calculate quantity (risk amount / risk per unit)
    const quantity = riskAmount.div(riskPerUnit).toNumber(); // 定义常量 quantity

    // 计算仓位价值 / Calculate position value
    const value = quantity * entryPrice; // 定义常量 value

    return { // 返回结果
      method: 'riskBased',         // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      entryPrice,                   // 入场价格 / Entry price
      stopLossPrice,                // 止损价格 / Stop loss price
      riskAmount: riskAmount.toNumber(),  // 风险金额 / Risk amount
      riskPerUnit,                  // 每单位风险 / Risk per unit
    }; // 结束代码块
  } // 结束代码块

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
  static volatilityAdjusted(params) { // 执行语句
    const { capital, riskPercent, price, atr, atrMultiplier = 2 } = params; // 解构赋值

    // 计算风险金额 / Calculate risk amount
    const riskAmount = new Decimal(capital).mul(riskPercent); // 定义常量 riskAmount

    // 计算止损距离 (ATR * 倍数) / Calculate stop distance (ATR * multiplier)
    const stopDistance = atr * atrMultiplier; // 定义常量 stopDistance

    // 计算数量 / Calculate quantity
    const quantity = riskAmount.div(stopDistance).toNumber(); // 定义常量 quantity

    // 计算仓位价值 / Calculate position value
    const value = quantity * price; // 定义常量 value

    // 计算止损价格 / Calculate stop loss price
    const stopLossPrice = price - stopDistance; // 定义常量 stopLossPrice

    return { // 返回结果
      method: 'volatilityAdjusted',  // 计算方法 / Calculation method
      quantity,                       // 数量 / Quantity
      value,                          // 价值 / Value
      price,                          // 价格 / Price
      atr,                            // ATR
      stopDistance,                   // 止损距离 / Stop distance
      stopLossPrice,                  // 止损价格 / Stop loss price
      riskAmount: riskAmount.toNumber(),  // 风险金额 / Risk amount
    }; // 结束代码块
  } // 结束代码块

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
  static kellyCriterion(params) { // 执行语句
    const { capital, winRate, avgWin, avgLoss, price, fraction = 0.25 } = params; // 解构赋值

    // 计算赔率 / Calculate odds
    const odds = avgWin / avgLoss; // 定义常量 odds

    // 计算凯利比例 / Calculate Kelly percentage
    // f = (bp - q) / b = (b * p - (1-p)) / b
    let kellyPercent = (odds * winRate - (1 - winRate)) / odds; // 定义变量 kellyPercent

    // 限制凯利比例在合理范围 / Limit Kelly percentage to reasonable range
    kellyPercent = Math.max(0, Math.min(1, kellyPercent)); // 赋值 kellyPercent

    // 应用凯利分数 (降低风险) / Apply Kelly fraction (reduce risk)
    const adjustedPercent = kellyPercent * fraction; // 定义常量 adjustedPercent

    // 计算仓位价值 / Calculate position value
    const value = capital * adjustedPercent; // 定义常量 value

    // 计算数量 / Calculate quantity
    const quantity = value / price; // 定义常量 quantity

    return { // 返回结果
      method: 'kellyCriterion',    // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      price,                        // 价格 / Price
      kellyPercent,                 // 原始凯利比例 / Original Kelly percentage
      adjustedPercent,              // 调整后比例 / Adjusted percentage
      odds,                         // 赔率 / Odds
      winRate,                      // 胜率 / Win rate
    }; // 结束代码块
  } // 结束代码块

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
  static martingale(params) { // 执行语句
    const { baseAmount, consecutiveLosses, price, maxMultiplier = 8 } = params; // 解构赋值

    // 计算倍数 (2^n) / Calculate multiplier (2^n)
    let multiplier = Math.pow(2, consecutiveLosses); // 定义变量 multiplier

    // 限制最大倍数 / Limit maximum multiplier
    multiplier = Math.min(multiplier, maxMultiplier); // 赋值 multiplier

    // 计算仓位价值 / Calculate position value
    const value = baseAmount * multiplier; // 定义常量 value

    // 计算数量 / Calculate quantity
    const quantity = value / price; // 定义常量 quantity

    return { // 返回结果
      method: 'martingale',        // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      price,                        // 价格 / Price
      baseAmount,                   // 基础金额 / Base amount
      multiplier,                   // 倍数 / Multiplier
      consecutiveLosses,            // 连续亏损次数 / Consecutive losses
      warning: '高风险策略，请谨慎使用 / High risk strategy, use with caution', // 警告
    }; // 结束代码块
  } // 结束代码块

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
  static antiMartingale(params) { // 执行语句
    const { baseAmount, consecutiveWins, price, maxMultiplier = 4 } = params; // 解构赋值

    // 计算倍数 (1.5^n) / Calculate multiplier (1.5^n)
    let multiplier = Math.pow(1.5, consecutiveWins); // 定义变量 multiplier

    // 限制最大倍数 / Limit maximum multiplier
    multiplier = Math.min(multiplier, maxMultiplier); // 赋值 multiplier

    // 计算仓位价值 / Calculate position value
    const value = baseAmount * multiplier; // 定义常量 value

    // 计算数量 / Calculate quantity
    const quantity = value / price; // 定义常量 quantity

    return { // 返回结果
      method: 'antiMartingale',    // 计算方法 / Calculation method
      quantity,                     // 数量 / Quantity
      value,                        // 价值 / Value
      price,                        // 价格 / Price
      baseAmount,                   // 基础金额 / Base amount
      multiplier,                   // 倍数 / Multiplier
      consecutiveWins,              // 连续盈利次数 / Consecutive wins
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算 ATR (平均真实波幅)
   * Calculate ATR (Average True Range)
   *
   * @param {Array} candles - K 线数据 / Candlestick data
   * @param {number} period - 计算周期 / Calculation period
   * @returns {number} ATR 值 / ATR value
   */
  static calculateATR(candles, period = 14) { // 执行语句
    // 确保有足够的数据 / Ensure enough data
    if (candles.length < period + 1) { // 条件判断 candles.length < period + 1
      return null; // 返回结果
    } // 结束代码块

    // 计算真实波幅 / Calculate True Range
    const trueRanges = []; // 定义常量 trueRanges
    for (let i = 1; i < candles.length; i++) { // 循环 let i = 1; i < candles.length; i++
      const current = candles[i]; // 定义常量 current
      const previous = candles[i - 1]; // 定义常量 previous

      // TR = max(high - low, |high - prevClose|, |low - prevClose|)
      const tr = Math.max( // 定义常量 tr
        current.high - current.low, // 执行语句
        Math.abs(current.high - previous.close), // 调用 Math.abs
        Math.abs(current.low - previous.close) // 调用 Math.abs
      ); // 结束调用或参数
      trueRanges.push(tr); // 调用 trueRanges.push
    } // 结束代码块

    // 计算 ATR (简单移动平均) / Calculate ATR (simple moving average)
    const recentTRs = trueRanges.slice(-period); // 定义常量 recentTRs
    const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / period; // 定义函数 atr

    return atr; // 返回结果
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default PositionCalculator; // 默认导出
