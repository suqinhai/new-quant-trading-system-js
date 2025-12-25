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

import { BaseFactor, FACTOR_CATEGORY, FACTOR_DIRECTION, FACTOR_FREQUENCY } from '../BaseFactor.js';

/**
 * 大单计算方法
 * Large Order Calculation Methods
 */
export const LARGE_ORDER_METHOD = {
  VOLUME_RATIO: 'vol_ratio',            // 大单成交量占比
  COUNT_RATIO: 'count_ratio',           // 大单数量占比
  NET_LARGE_FLOW: 'net_flow',           // 大单净流入
  BUY_SELL_RATIO: 'buy_sell',           // 大单买卖比
  WHALE_ACTIVITY: 'whale',              // 鲸鱼活动指数
  IMBALANCE: 'imbalance',               // 大单买卖不平衡度
};

/**
 * 大单成交占比因子类
 * Large Order Factor Class
 */
export class LargeOrderFactor extends BaseFactor {
  /**
   * @param {Object} config - 配置
   * @param {number} config.period - 统计周期
   * @param {string} config.method - 计算方法
   * @param {number} config.largeOrderThreshold - 大单阈值 (相对于平均成交额的倍数)
   * @param {number} config.whaleThreshold - 鲸鱼单阈值 (更大的单子)
   */
  constructor(config = {}) {
    const method = config.method || LARGE_ORDER_METHOD.VOLUME_RATIO;

    super({
      name: config.name || `LargeOrder_${method}`,
      category: FACTOR_CATEGORY.VOLUME,
      direction: FACTOR_DIRECTION.POSITIVE, // 大单净买入 → 看涨
      frequency: FACTOR_FREQUENCY.HOURLY,
      description: `大单成交占比因子 (${method})`,
      params: {
        method,
        period: config.period || 24,         // 24小时
        largeOrderThreshold: config.largeOrderThreshold || 5.0,  // 5倍平均为大单
        whaleThreshold: config.whaleThreshold || 20.0,          // 20倍平均为鲸鱼单
        minDataPoints: config.minDataPoints || 50,
      },
      ...config,
    });
  }

  /**
   * 计算因子值
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据
   * @param {Array} data.trades - 成交记录 [{price, amount, side, timestamp}]
   * @param {Array} data.candles - K线数据 (可选，用于计算阈值)
   * @returns {Promise<number|null>} 大单因子值
   */
  async calculate(symbol, data, context = {}) {
    const { trades, candles } = data;
    const { method, minDataPoints } = this.params;

    if (!trades || trades.length < minDataPoints) {
      return null;
    }

    // 计算动态阈值 / Calculate dynamic threshold
    const avgTradeValue = this._calculateAverageTradeValue(trades);

    let value;

    switch (method) {
      case LARGE_ORDER_METHOD.VOLUME_RATIO:
        value = this._calculateVolumeRatio(trades, avgTradeValue);
        break;

      case LARGE_ORDER_METHOD.COUNT_RATIO:
        value = this._calculateCountRatio(trades, avgTradeValue);
        break;

      case LARGE_ORDER_METHOD.NET_LARGE_FLOW:
        value = this._calculateNetLargeFlow(trades, avgTradeValue);
        break;

      case LARGE_ORDER_METHOD.BUY_SELL_RATIO:
        value = this._calculateBuySellRatio(trades, avgTradeValue);
        break;

      case LARGE_ORDER_METHOD.WHALE_ACTIVITY:
        value = this._calculateWhaleActivity(trades, avgTradeValue);
        break;

      case LARGE_ORDER_METHOD.IMBALANCE:
        value = this._calculateImbalance(trades, avgTradeValue);
        break;

      default:
        value = this._calculateVolumeRatio(trades, avgTradeValue);
    }

    return value;
  }

  /**
   * 计算平均成交额
   * @private
   */
  _calculateAverageTradeValue(trades) {
    const values = trades.map(t => parseFloat(t.price) * parseFloat(t.amount));
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * 计算大单成交量占比
   * @private
   */
  _calculateVolumeRatio(trades, avgTradeValue) {
    const { largeOrderThreshold } = this.params;
    const threshold = avgTradeValue * largeOrderThreshold;

    let largeVolume = 0;
    let totalVolume = 0;

    for (const trade of trades) {
      const value = parseFloat(trade.price) * parseFloat(trade.amount);
      totalVolume += value;

      if (value >= threshold) {
        largeVolume += value;
      }
    }

    if (totalVolume === 0) return 0;

    return (largeVolume / totalVolume) * 100;
  }

  /**
   * 计算大单数量占比
   * @private
   */
  _calculateCountRatio(trades, avgTradeValue) {
    const { largeOrderThreshold } = this.params;
    const threshold = avgTradeValue * largeOrderThreshold;

    let largeCount = 0;

    for (const trade of trades) {
      const value = parseFloat(trade.price) * parseFloat(trade.amount);
      if (value >= threshold) {
        largeCount++;
      }
    }

    return (largeCount / trades.length) * 100;
  }

  /**
   * 计算大单净流入
   * 正值表示大单净买入，负值表示大单净卖出
   * @private
   */
  _calculateNetLargeFlow(trades, avgTradeValue) {
    const { largeOrderThreshold } = this.params;
    const threshold = avgTradeValue * largeOrderThreshold;

    let netFlow = 0;

    for (const trade of trades) {
      const value = parseFloat(trade.price) * parseFloat(trade.amount);

      if (value >= threshold) {
        // side: 'buy' or 'sell', 也可能是 'bid' or 'ask'
        const side = (trade.side || '').toLowerCase();
        if (side === 'buy' || side === 'bid') {
          netFlow += value;
        } else if (side === 'sell' || side === 'ask') {
          netFlow -= value;
        }
      }
    }

    return netFlow;
  }

  /**
   * 计算大单买卖比
   * @private
   */
  _calculateBuySellRatio(trades, avgTradeValue) {
    const { largeOrderThreshold } = this.params;
    const threshold = avgTradeValue * largeOrderThreshold;

    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of trades) {
      const value = parseFloat(trade.price) * parseFloat(trade.amount);

      if (value >= threshold) {
        const side = (trade.side || '').toLowerCase();
        if (side === 'buy' || side === 'bid') {
          buyVolume += value;
        } else if (side === 'sell' || side === 'ask') {
          sellVolume += value;
        }
      }
    }

    if (sellVolume === 0) return buyVolume > 0 ? Infinity : 1;

    return buyVolume / sellVolume;
  }

  /**
   * 计算鲸鱼活动指数
   * 超大单 (鲸鱼单) 的活跃程度
   * @private
   */
  _calculateWhaleActivity(trades, avgTradeValue) {
    const { whaleThreshold } = this.params;
    const threshold = avgTradeValue * whaleThreshold;

    let whaleCount = 0;
    let whaleVolume = 0;
    let totalVolume = 0;

    for (const trade of trades) {
      const value = parseFloat(trade.price) * parseFloat(trade.amount);
      totalVolume += value;

      if (value >= threshold) {
        whaleCount++;
        whaleVolume += value;
      }
    }

    if (totalVolume === 0) return 0;

    // 鲸鱼活动指数 = 鲸鱼单数量 * 鲸鱼单成交量占比
    const volumeRatio = whaleVolume / totalVolume;
    const countScore = Math.log(whaleCount + 1); // 对数平滑

    return countScore * volumeRatio * 100;
  }

  /**
   * 计算大单买卖不平衡度
   * 范围: -1 到 1 (-1 全卖, 0 平衡, 1 全买)
   * @private
   */
  _calculateImbalance(trades, avgTradeValue) {
    const { largeOrderThreshold } = this.params;
    const threshold = avgTradeValue * largeOrderThreshold;

    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of trades) {
      const value = parseFloat(trade.price) * parseFloat(trade.amount);

      if (value >= threshold) {
        const side = (trade.side || '').toLowerCase();
        if (side === 'buy' || side === 'bid') {
          buyVolume += value;
        } else if (side === 'sell' || side === 'ask') {
          sellVolume += value;
        }
      }
    }

    const total = buyVolume + sellVolume;
    if (total === 0) return 0;

    return (buyVolume - sellVolume) / total;
  }
}

/**
 * 预定义因子实例
 * Predefined factor instances
 */

// 大单成交量占比
export const LargeOrderVolumeRatio = new LargeOrderFactor({
  name: 'LargeOrder_Vol_Ratio',
  method: LARGE_ORDER_METHOD.VOLUME_RATIO,
  largeOrderThreshold: 5.0,
});

// 大单净流入
export const LargeOrderNetFlow = new LargeOrderFactor({
  name: 'LargeOrder_Net_Flow',
  method: LARGE_ORDER_METHOD.NET_LARGE_FLOW,
  largeOrderThreshold: 5.0,
});

// 大单买卖比
export const LargeOrderBuySell = new LargeOrderFactor({
  name: 'LargeOrder_Buy_Sell',
  method: LARGE_ORDER_METHOD.BUY_SELL_RATIO,
  largeOrderThreshold: 5.0,
});

// 鲸鱼活动指数
export const WhaleActivity = new LargeOrderFactor({
  name: 'Whale_Activity',
  method: LARGE_ORDER_METHOD.WHALE_ACTIVITY,
  largeOrderThreshold: 10.0,
  whaleThreshold: 50.0,
});

// 大单不平衡度
export const LargeOrderImbalance = new LargeOrderFactor({
  name: 'LargeOrder_Imbalance',
  method: LARGE_ORDER_METHOD.IMBALANCE,
  largeOrderThreshold: 5.0,
});

/**
 * 工厂函数
 */
export function createLargeOrderFactor(method = LARGE_ORDER_METHOD.VOLUME_RATIO, options = {}) {
  return new LargeOrderFactor({
    method,
    ...options,
  });
}

export default LargeOrderFactor;
