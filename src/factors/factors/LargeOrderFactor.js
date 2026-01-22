/**
 * 大单成交占比因子
 * Large Order Factor
 *
 * 衡量大额订单在成交量中的占比
 * Measures the proportion of large orders in trading volume
 *
 * 大单主导往往反映机构或鲸鱼行为
 * Large order dominance often reflects institutional or whale activity
 */

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js'; // 导入模块 ../BaseFactor.js

/**
 * 大单计算方法
 * Large Order Calculation Methods
 */
export const LARGE_ORDER_METHOD = { // 导出常量 LARGE_ORDER_METHOD
  VOLUME_RATIO: 'vol_ratio',            // 成交量比例
  COUNT_RATIO: 'count_ratio',           // 数量比例
  NET_LARGE_FLOW: 'net_flow',           // NET大额流
  BUY_SELL_RATIO: 'buy_sell',           // BUYSELL比例
  WHALE_ACTIVITY: 'whale',              // WHALEACTIVITY
  IMBALANCE: 'imbalance',               // IMBALANCE权限
}; // 结束代码块

/**
 * 大单成交占比因子类
 * Large Order Factor Class
 */
export class LargeOrderFactor extends BaseFactor { // 导出类 LargeOrderFactor
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 统计周期
   * @param {string} config.method - 计算方法
   * @param {number} config.largeOrderThreshold - 大单阈值 (相对于平均成交额的倍数)
   * @param {number} config.whaleThreshold - 鲸鱼单阈值 (更大的单子)
   */
  constructor(config = {}) { // 构造函数
    const method = config.method || LARGE_ORDER_METHOD.VOLUME_RATIO; // 定义常量 method

    super({ // 调用父类
      name: config.name || `LargeOrder_${method}`, // name
      category: FACTOR_CATEGORY.VOLUME, // category
      direction: FACTOR_DIRECTION.POSITIVE, // direction
      frequency: FACTOR_FREQUENCY.HOURLY, // frequency
      description: `大单成交占比因子 (${method})`, // description
      params: { // params
        method, // 执行语句
        period: config.period || 24,         // 周期
        largeOrderThreshold: config.largeOrderThreshold || 5.0,  // 大额订单阈值
        whaleThreshold: config.whaleThreshold || 20.0,          // whale阈值
        minDataPoints: config.minDataPoints || 50, // 最小数据Points
      }, // 结束代码块
      ...config, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.trades - 成交记录 [{price, amount, side, timestamp}]
   * @param {Array} data.candles - K线数据 (可选，用于计算阈值)
   * @returns {Promise<number|null>} 大单因子值
   */
  async calculate(symbol, data, context = {}) { // 执行语句
    const { trades, candles } = data; // 解构赋值
    const { method, minDataPoints } = this.params; // 解构赋值

    if (!trades || trades.length < minDataPoints) { // 条件判断 !trades || trades.length < minDataPoints
      return null; // 返回结果
    } // 结束代码块

    // 计算动态阈值 / Calculate dynamic threshold
    const avgTradeValue = this._calculateAverageTradeValue(trades); // 定义常量 avgTradeValue

    let value; // 定义变量 value

    switch (method) { // 分支选择 method
      case LARGE_ORDER_METHOD.VOLUME_RATIO: // 分支 LARGE_ORDER_METHOD.VOLUME_RATIO
        value = this._calculateVolumeRatio(trades, avgTradeValue); // 赋值 value
        break; // 跳出循环或分支

      case LARGE_ORDER_METHOD.COUNT_RATIO: // 分支 LARGE_ORDER_METHOD.COUNT_RATIO
        value = this._calculateCountRatio(trades, avgTradeValue); // 赋值 value
        break; // 跳出循环或分支

      case LARGE_ORDER_METHOD.NET_LARGE_FLOW: // 分支 LARGE_ORDER_METHOD.NET_LARGE_FLOW
        value = this._calculateNetLargeFlow(trades, avgTradeValue); // 赋值 value
        break; // 跳出循环或分支

      case LARGE_ORDER_METHOD.BUY_SELL_RATIO: // 分支 LARGE_ORDER_METHOD.BUY_SELL_RATIO
        value = this._calculateBuySellRatio(trades, avgTradeValue); // 赋值 value
        break; // 跳出循环或分支

      case LARGE_ORDER_METHOD.WHALE_ACTIVITY: // 分支 LARGE_ORDER_METHOD.WHALE_ACTIVITY
        value = this._calculateWhaleActivity(trades, avgTradeValue); // 赋值 value
        break; // 跳出循环或分支

      case LARGE_ORDER_METHOD.IMBALANCE: // 分支 LARGE_ORDER_METHOD.IMBALANCE
        value = this._calculateImbalance(trades, avgTradeValue); // 赋值 value
        break; // 跳出循环或分支

      default: // 默认
        value = this._calculateVolumeRatio(trades, avgTradeValue); // 赋值 value
    } // 结束代码块

    return value; // 返回结果
  } // 结束代码块

  /**
   * 计算平均成交额
   * @private
   */
  _calculateAverageTradeValue(trades) { // 调用 _calculateAverageTradeValue
    const values = trades.map(t => parseFloat(t.price) * parseFloat(t.amount)); // 定义函数 values
    return values.reduce((a, b) => a + b, 0) / values.length; // 返回结果
  } // 结束代码块

  /**
   * 计算大单成交量占比
   * @private
   */
  _calculateVolumeRatio(trades, avgTradeValue) { // 调用 _calculateVolumeRatio
    const { largeOrderThreshold } = this.params; // 解构赋值
    const threshold = avgTradeValue * largeOrderThreshold; // 定义常量 threshold

    let largeVolume = 0; // 定义变量 largeVolume
    let totalVolume = 0; // 定义变量 totalVolume

    for (const trade of trades) { // 循环 const trade of trades
      const value = parseFloat(trade.price) * parseFloat(trade.amount); // 定义常量 value
      totalVolume += value; // 执行语句

      if (value >= threshold) { // 条件判断 value >= threshold
        largeVolume += value; // 执行语句
      } // 结束代码块
    } // 结束代码块

    if (totalVolume === 0) return 0; // 条件判断 totalVolume === 0

    return (largeVolume / totalVolume) * 100; // 返回结果
  } // 结束代码块

  /**
   * 计算大单数量占比
   * @private
   */
  _calculateCountRatio(trades, avgTradeValue) { // 调用 _calculateCountRatio
    const { largeOrderThreshold } = this.params; // 解构赋值
    const threshold = avgTradeValue * largeOrderThreshold; // 定义常量 threshold

    let largeCount = 0; // 定义变量 largeCount

    for (const trade of trades) { // 循环 const trade of trades
      const value = parseFloat(trade.price) * parseFloat(trade.amount); // 定义常量 value
      if (value >= threshold) { // 条件判断 value >= threshold
        largeCount++; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return (largeCount / trades.length) * 100; // 返回结果
  } // 结束代码块

  /**
   * 计算大单净流入
   * 正值表示大单净买入，负值表示大单净卖出
   * @private
   */
  _calculateNetLargeFlow(trades, avgTradeValue) { // 调用 _calculateNetLargeFlow
    const { largeOrderThreshold } = this.params; // 解构赋值
    const threshold = avgTradeValue * largeOrderThreshold; // 定义常量 threshold

    let netFlow = 0; // 定义变量 netFlow

    for (const trade of trades) { // 循环 const trade of trades
      const value = parseFloat(trade.price) * parseFloat(trade.amount); // 定义常量 value

      if (value >= threshold) { // 条件判断 value >= threshold
        // side: 'buy' or 'sell', 也可能是 'bid' or 'ask'
        const side = (trade.side || '').toLowerCase(); // 定义常量 side
        if (side === 'buy' || side === 'bid') { // 条件判断 side === 'buy' || side === 'bid'
          netFlow += value; // 执行语句
        } else if (side === 'sell' || side === 'ask') { // 执行语句
          netFlow -= value; // 执行语句
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return netFlow; // 返回结果
  } // 结束代码块

  /**
   * 计算大单买卖比
   * @private
   */
  _calculateBuySellRatio(trades, avgTradeValue) { // 调用 _calculateBuySellRatio
    const { largeOrderThreshold } = this.params; // 解构赋值
    const threshold = avgTradeValue * largeOrderThreshold; // 定义常量 threshold

    let buyVolume = 0; // 定义变量 buyVolume
    let sellVolume = 0; // 定义变量 sellVolume

    for (const trade of trades) { // 循环 const trade of trades
      const value = parseFloat(trade.price) * parseFloat(trade.amount); // 定义常量 value

      if (value >= threshold) { // 条件判断 value >= threshold
        const side = (trade.side || '').toLowerCase(); // 定义常量 side
        if (side === 'buy' || side === 'bid') { // 条件判断 side === 'buy' || side === 'bid'
          buyVolume += value; // 执行语句
        } else if (side === 'sell' || side === 'ask') { // 执行语句
          sellVolume += value; // 执行语句
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    if (sellVolume === 0) return buyVolume > 0 ? Infinity : 1; // 条件判断 sellVolume === 0

    return buyVolume / sellVolume; // 返回结果
  } // 结束代码块

  /**
   * 计算鲸鱼活动指数
   * 超大单 (鲸鱼单) 的活跃程度
   * @private
   */
  _calculateWhaleActivity(trades, avgTradeValue) { // 调用 _calculateWhaleActivity
    const { whaleThreshold } = this.params; // 解构赋值
    const threshold = avgTradeValue * whaleThreshold; // 定义常量 threshold

    let whaleCount = 0; // 定义变量 whaleCount
    let whaleVolume = 0; // 定义变量 whaleVolume
    let totalVolume = 0; // 定义变量 totalVolume

    for (const trade of trades) { // 循环 const trade of trades
      const value = parseFloat(trade.price) * parseFloat(trade.amount); // 定义常量 value
      totalVolume += value; // 执行语句

      if (value >= threshold) { // 条件判断 value >= threshold
        whaleCount++; // 执行语句
        whaleVolume += value; // 执行语句
      } // 结束代码块
    } // 结束代码块

    if (totalVolume === 0) return 0; // 条件判断 totalVolume === 0

    // 鲸鱼活动指数 = 鲸鱼单数量 * 鲸鱼单成交量占比
    const volumeRatio = whaleVolume / totalVolume; // 定义常量 volumeRatio
    const countScore = Math.log(whaleCount + 1); // 对数平滑

    return countScore * volumeRatio * 100; // 返回结果
  } // 结束代码块

  /**
   * 计算大单买卖不平衡度
   * 范围: -1 到 1 (-1 全卖, 0 平衡, 1 全买)
   * @private
   */
  _calculateImbalance(trades, avgTradeValue) { // 调用 _calculateImbalance
    const { largeOrderThreshold } = this.params; // 解构赋值
    const threshold = avgTradeValue * largeOrderThreshold; // 定义常量 threshold

    let buyVolume = 0; // 定义变量 buyVolume
    let sellVolume = 0; // 定义变量 sellVolume

    for (const trade of trades) { // 循环 const trade of trades
      const value = parseFloat(trade.price) * parseFloat(trade.amount); // 定义常量 value

      if (value >= threshold) { // 条件判断 value >= threshold
        const side = (trade.side || '').toLowerCase(); // 定义常量 side
        if (side === 'buy' || side === 'bid') { // 条件判断 side === 'buy' || side === 'bid'
          buyVolume += value; // 执行语句
        } else if (side === 'sell' || side === 'ask') { // 执行语句
          sellVolume += value; // 执行语句
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    const total = buyVolume + sellVolume; // 定义常量 total
    if (total === 0) return 0; // 条件判断 total === 0

    return (buyVolume - sellVolume) / total; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// 大单成交量占比
export const LargeOrderVolumeRatio = new LargeOrderFactor({ // 导出常量 LargeOrderVolumeRatio
  name: 'LargeOrder_Vol_Ratio', // name
  method: LARGE_ORDER_METHOD.VOLUME_RATIO, // method
  largeOrderThreshold: 5.0, // 大额订单阈值
}); // 结束代码块

// 大单净流入
export const LargeOrderNetFlow = new LargeOrderFactor({ // 导出常量 LargeOrderNetFlow
  name: 'LargeOrder_Net_Flow', // name
  method: LARGE_ORDER_METHOD.NET_LARGE_FLOW, // method
  largeOrderThreshold: 5.0, // 大额订单阈值
}); // 结束代码块

// 大单买卖比
export const LargeOrderBuySell = new LargeOrderFactor({ // 导出常量 LargeOrderBuySell
  name: 'LargeOrder_Buy_Sell', // name
  method: LARGE_ORDER_METHOD.BUY_SELL_RATIO, // method
  largeOrderThreshold: 5.0, // 大额订单阈值
}); // 结束代码块

// 鲸鱼活动指数
export const WhaleActivity = new LargeOrderFactor({ // 导出常量 WhaleActivity
  name: 'Whale_Activity', // name
  method: LARGE_ORDER_METHOD.WHALE_ACTIVITY, // method
  largeOrderThreshold: 10.0, // 大额订单阈值
  whaleThreshold: 50.0, // whale阈值
}); // 结束代码块

// 大单不平衡度
export const LargeOrderImbalance = new LargeOrderFactor({ // 导出常量 LargeOrderImbalance
  name: 'LargeOrder_Imbalance', // name
  method: LARGE_ORDER_METHOD.IMBALANCE, // method
  largeOrderThreshold: 5.0, // 大额订单阈值
}); // 结束代码块

/**
 * 工厂函数
 */
export function createLargeOrderFactor(method = LARGE_ORDER_METHOD.VOLUME_RATIO, options = {}) { // 导出函数 createLargeOrderFactor
  return new LargeOrderFactor({ // 返回结果
    method, // 执行语句
    ...options, // 展开对象或数组
  }); // 结束代码块
} // 结束代码块

export default LargeOrderFactor; // 默认导出
