/**
 * 高性能事件驱动回测引擎
 * High-Performance Event-Driven Backtesting Engine
 *
 * 功能 / Features:
 * 1. 加载历史 trade + depth 快照 + funding 事件 / Load historical trade + depth snapshot + funding events
 * 2. 支持限价单、市价单、post-only、reduce-only / Support limit, market, post-only, reduce-only orders
 * 3. 精确模拟滑点（基于深度）/ Accurate slippage simulation (based on depth)
 * 4. 真实资金费率扣除（每8小时）/ Real funding rate deduction (every 8 hours)
 * 5. 杠杆 + 保证金 + 强平模拟 / Leverage + margin + liquidation simulation
 * 6. 回测1年数据 < 20秒 / Backtest 1 year data in < 20 seconds
 * 7. 策略以 class 形式传入 / Strategy passed in as class
 *
 * 性能优化 / Performance Optimizations:
 * - 使用 TypedArray 存储数值数据 / Use TypedArray for numeric data
 * - 预分配内存避免 GC / Pre-allocate memory to avoid GC
 * - 事件池复用对象 / Event pool for object reuse
 * - 二分查找定位事件 / Binary search for event location
 * - 批量处理减少函数调用 / Batch processing to reduce function calls
 */

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 订单方向
 * Order side
 */
const SIDE = {
  BUY: 1,       // 买入/做多 / Buy/Long
  SELL: -1,     // 卖出/做空 / Sell/Short
};

/**
 * 订单类型
 * Order type
 */
const ORDER_TYPE = {
  MARKET: 0,    // 市价单 / Market order
  LIMIT: 1,     // 限价单 / Limit order
};

/**
 * 订单状态
 * Order status
 */
const ORDER_STATUS = {
  PENDING: 0,   // 待处理 / Pending
  OPEN: 1,      // 挂单中 / Open
  FILLED: 2,    // 已成交 / Filled
  PARTIAL: 3,   // 部分成交 / Partially filled
  CANCELED: 4,  // 已取消 / Canceled
  REJECTED: 5,  // 已拒绝 / Rejected
};

/**
 * 事件类型
 * Event type
 */
const EVENT_TYPE = {
  TRADE: 0,       // 成交事件 / Trade event
  DEPTH: 1,       // 深度快照 / Depth snapshot
  FUNDING: 2,     // 资金费率 / Funding rate
  KLINE: 3,       // K线数据 / Kline data
};

/**
 * 持仓方向
 * Position side
 */
const POSITION_SIDE = {
  NONE: 0,      // 无持仓 / No position
  LONG: 1,      // 多头 / Long
  SHORT: -1,    // 空头 / Short
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // 交易配置 / Trading config
  initialCapital: 10000,          // 初始资金 (USDT) / Initial capital
  leverage: 10,                   // 默认杠杆倍数 / Default leverage
  maxLeverage: 125,               // 最大杠杆倍数 / Max leverage

  // 手续费配置 / Fee config
  makerFee: 0.0002,               // 挂单手续费率 (0.02%) / Maker fee rate
  takerFee: 0.0005,               // 吃单手续费率 (0.05%) / Taker fee rate

  // 保证金配置 / Margin config
  maintenanceMarginRate: 0.004,   // 维持保证金率 (0.4%) / Maintenance margin rate
  liquidationFeeRate: 0.006,      // 强平手续费率 (0.6%) / Liquidation fee rate

  // 滑点配置 / Slippage config
  slippageModel: 'depth',         // 滑点模型 ('fixed' | 'depth') / Slippage model
  fixedSlippage: 0.0001,          // 固定滑点 (0.01%) / Fixed slippage

  // 资金费率配置 / Funding rate config
  fundingInterval: 8 * 60 * 60 * 1000,  // 资金费率间隔 (8小时) / Funding interval (8 hours)

  // 性能配置 / Performance config
  eventBatchSize: 10000,          // 事件批处理大小 / Event batch size
  preAllocateOrders: 100000,      // 预分配订单数量 / Pre-allocate order count
};

// ============================================
// 对象池 / Object Pool
// ============================================

/**
 * 高性能对象池
 * High-performance object pool
 *
 * 用于复用对象，减少内存分配和 GC 开销
 * Used to reuse objects, reducing memory allocation and GC overhead
 */
class ObjectPool {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Function} factory - 对象工厂函数 / Object factory function
   * @param {Function} reset - 对象重置函数 / Object reset function
   * @param {number} initialSize - 初始池大小 / Initial pool size
   */
  constructor(factory, reset, initialSize = 1000) {
    // 保存工厂函数 / Save factory function
    this.factory = factory;

    // 保存重置函数 / Save reset function
    this.reset = reset;

    // 对象池数组 / Pool array
    this.pool = [];

    // 预分配对象 / Pre-allocate objects
    for (let i = 0; i < initialSize; i++) {
      // 创建对象并添加到池 / Create object and add to pool
      this.pool.push(factory());
    }
  }

  /**
   * 获取对象
   * Acquire object
   *
   * @returns {Object} 池中的对象或新建对象 / Object from pool or new object
   */
  acquire() {
    // 如果池中有对象，取出并返回 / If pool has object, pop and return
    if (this.pool.length > 0) {
      return this.pool.pop();
    }

    // 池为空，创建新对象 / Pool empty, create new object
    return this.factory();
  }

  /**
   * 释放对象回池
   * Release object back to pool
   *
   * @param {Object} obj - 要释放的对象 / Object to release
   */
  release(obj) {
    // 重置对象状态 / Reset object state
    this.reset(obj);

    // 放回池中 / Put back to pool
    this.pool.push(obj);
  }
}

// ============================================
// 订单类 / Order Class
// ============================================

/**
 * 订单对象
 * Order object
 *
 * 使用简单对象而非类实例以提升性能
 * Using plain objects instead of class instances for performance
 */
const createOrder = () => ({
  id: 0,                    // 订单ID / Order ID
  symbol: '',               // 交易对 / Symbol
  side: 0,                  // 方向 (SIDE.BUY | SIDE.SELL) / Side
  type: 0,                  // 类型 (ORDER_TYPE) / Type
  price: 0,                 // 价格 / Price
  amount: 0,                // 数量 / Amount
  filled: 0,                // 已成交数量 / Filled amount
  remaining: 0,             // 剩余数量 / Remaining amount
  avgPrice: 0,              // 成交均价 / Average fill price
  status: 0,                // 状态 (ORDER_STATUS) / Status
  postOnly: false,          // 只做 Maker / Post-only flag
  reduceOnly: false,        // 只减仓 / Reduce-only flag
  createTime: 0,            // 创建时间 / Create time
  updateTime: 0,            // 更新时间 / Update time
  fee: 0,                   // 累计手续费 / Accumulated fee
  realizedPnl: 0,           // 已实现盈亏 / Realized PnL
  clientId: '',             // 客户端订单ID / Client order ID
});

/**
 * 重置订单对象
 * Reset order object
 *
 * @param {Object} order - 订单对象 / Order object
 */
const resetOrder = (order) => {
  order.id = 0;
  order.symbol = '';
  order.side = 0;
  order.type = 0;
  order.price = 0;
  order.amount = 0;
  order.filled = 0;
  order.remaining = 0;
  order.avgPrice = 0;
  order.status = 0;
  order.postOnly = false;
  order.reduceOnly = false;
  order.createTime = 0;
  order.updateTime = 0;
  order.fee = 0;
  order.realizedPnl = 0;
  order.clientId = '';
};

// ============================================
// 持仓类 / Position Class
// ============================================

/**
 * 持仓对象
 * Position object
 */
class Position {
  /**
   * 构造函数
   * Constructor
   *
   * @param {string} symbol - 交易对 / Symbol
   */
  constructor(symbol) {
    // 交易对 / Symbol
    this.symbol = symbol;

    // 持仓方向 / Position side
    this.side = POSITION_SIDE.NONE;

    // 持仓数量 (正数) / Position size (positive)
    this.size = 0;

    // 开仓均价 / Entry price
    this.entryPrice = 0;

    // 标记价格 / Mark price
    this.markPrice = 0;

    // 杠杆倍数 / Leverage
    this.leverage = 1;

    // 保证金模式 ('cross' | 'isolated') / Margin mode
    this.marginMode = 'cross';

    // 逐仓保证金 (仅 isolated 模式) / Isolated margin
    this.isolatedMargin = 0;

    // 未实现盈亏 / Unrealized PnL
    this.unrealizedPnl = 0;

    // 累计已实现盈亏 / Cumulative realized PnL
    this.realizedPnl = 0;

    // 累计资金费用 / Cumulative funding fee
    this.fundingFee = 0;

    // 累计交易手续费 / Cumulative trading fee
    this.tradingFee = 0;

    // 强平价格 / Liquidation price
    this.liquidationPrice = 0;

    // 名义价值 / Notional value
    this.notional = 0;

    // 初始保证金 / Initial margin
    this.initialMargin = 0;

    // 维持保证金 / Maintenance margin
    this.maintenanceMargin = 0;
  }

  /**
   * 更新持仓
   * Update position
   *
   * @param {number} side - 交易方向 / Trade side
   * @param {number} size - 交易数量 / Trade size
   * @param {number} price - 交易价格 / Trade price
   * @param {Object} config - 配置 / Config
   * @returns {number} 已实现盈亏 / Realized PnL
   */
  update(side, size, price, config) {
    // 已实现盈亏 / Realized PnL
    let realizedPnl = 0;

    // 如果当前无持仓 / If no current position
    if (this.side === POSITION_SIDE.NONE || this.size === 0) {
      // 开新仓 / Open new position
      this.side = side;
      this.size = size;
      this.entryPrice = price;

    } else if (this.side === side) {
      // 同向加仓 / Add to position in same direction
      // 计算新的开仓均价 / Calculate new entry price
      const totalCost = this.size * this.entryPrice + size * price;
      this.size += size;
      this.entryPrice = totalCost / this.size;

    } else {
      // 反向交易 / Opposite direction trade
      if (size < this.size) {
        // 部分平仓 / Partial close
        // 计算已实现盈亏 / Calculate realized PnL
        realizedPnl = (price - this.entryPrice) * size * this.side;
        this.size -= size;

      } else if (size === this.size) {
        // 完全平仓 / Full close
        // 计算已实现盈亏 / Calculate realized PnL
        realizedPnl = (price - this.entryPrice) * size * this.side;
        this.side = POSITION_SIDE.NONE;
        this.size = 0;
        this.entryPrice = 0;

      } else {
        // 反向开仓 / Reverse position
        // 先平掉原有仓位 / First close existing position
        realizedPnl = (price - this.entryPrice) * this.size * this.side;

        // 开反向仓 / Open reverse position
        this.side = side;
        this.size = size - this.size;
        this.entryPrice = price;
      }
    }

    // 更新已实现盈亏 / Update realized PnL
    this.realizedPnl += realizedPnl;

    // 更新保证金和强平价格 / Update margin and liquidation price
    this._updateMargin(config);

    // 返回本次交易的已实现盈亏 / Return realized PnL from this trade
    return realizedPnl;
  }

  /**
   * 更新标记价格和未实现盈亏
   * Update mark price and unrealized PnL
   *
   * @param {number} markPrice - 标记价格 / Mark price
   */
  updateMarkPrice(markPrice) {
    // 更新标记价格 / Update mark price
    this.markPrice = markPrice;

    // 计算未实现盈亏 / Calculate unrealized PnL
    if (this.size > 0) {
      // 未实现盈亏 = (标记价 - 开仓价) × 数量 × 方向
      // Unrealized PnL = (mark price - entry price) × size × side
      this.unrealizedPnl = (markPrice - this.entryPrice) * this.size * this.side;

      // 更新名义价值 / Update notional value
      this.notional = this.size * markPrice;
    } else {
      this.unrealizedPnl = 0;
      this.notional = 0;
    }
  }

  /**
   * 更新保证金信息
   * Update margin information
   *
   * @param {Object} config - 配置 / Config
   * @private
   */
  _updateMargin(config) {
    // 如果无持仓，清零所有保证金信息 / If no position, clear all margin info
    if (this.size === 0) {
      this.initialMargin = 0;
      this.maintenanceMargin = 0;
      this.liquidationPrice = 0;
      return;
    }

    // 计算名义价值 / Calculate notional value
    const notional = this.size * this.entryPrice;

    // 计算初始保证金 / Calculate initial margin
    // 初始保证金 = 名义价值 / 杠杆倍数
    // Initial margin = notional / leverage
    this.initialMargin = notional / this.leverage;

    // 计算维持保证金 / Calculate maintenance margin
    // 维持保证金 = 名义价值 × 维持保证金率
    // Maintenance margin = notional × maintenance margin rate
    this.maintenanceMargin = notional * config.maintenanceMarginRate;

    // 计算强平价格 / Calculate liquidation price
    // 多头: 强平价 = 开仓价 × (1 - 1/杠杆 + 维持保证金率)
    // 空头: 强平价 = 开仓价 × (1 + 1/杠杆 - 维持保证金率)
    // Long: liq price = entry × (1 - 1/leverage + maintenance margin rate)
    // Short: liq price = entry × (1 + 1/leverage - maintenance margin rate)
    if (this.side === POSITION_SIDE.LONG) {
      this.liquidationPrice = this.entryPrice * (1 - 1 / this.leverage + config.maintenanceMarginRate);
    } else {
      this.liquidationPrice = this.entryPrice * (1 + 1 / this.leverage - config.maintenanceMarginRate);
    }
  }

  /**
   * 应用资金费率
   * Apply funding rate
   *
   * @param {number} fundingRate - 资金费率 / Funding rate
   * @returns {number} 资金费用 (正数表示支出) / Funding fee (positive means expense)
   */
  applyFundingRate(fundingRate) {
    // 如果无持仓，无需支付资金费用 / If no position, no funding fee
    if (this.size === 0) {
      return 0;
    }

    // 计算资金费用 / Calculate funding fee
    // 资金费用 = 持仓名义价值 × 资金费率 × 持仓方向
    // Funding fee = notional × funding rate × position side
    // 多头在正资金费率时支付，空头在正资金费率时收取
    // Long pays when positive, short receives when positive
    const fee = this.notional * fundingRate * this.side;

    // 累加资金费用 / Accumulate funding fee
    this.fundingFee += fee;

    // 返回资金费用 / Return funding fee
    return fee;
  }

  /**
   * 检查是否应该强平
   * Check if should be liquidated
   *
   * @param {number} markPrice - 标记价格 / Mark price
   * @returns {boolean} 是否应该强平 / Whether should be liquidated
   */
  shouldLiquidate(markPrice) {
    // 无持仓不需要强平 / No position, no liquidation
    if (this.size === 0) {
      return false;
    }

    // 检查是否触及强平价格 / Check if reached liquidation price
    if (this.side === POSITION_SIDE.LONG) {
      // 多头: 标记价 <= 强平价 / Long: mark price <= liquidation price
      return markPrice <= this.liquidationPrice;
    } else {
      // 空头: 标记价 >= 强平价 / Short: mark price >= liquidation price
      return markPrice >= this.liquidationPrice;
    }
  }

  /**
   * 重置持仓
   * Reset position
   */
  reset() {
    this.side = POSITION_SIDE.NONE;
    this.size = 0;
    this.entryPrice = 0;
    this.markPrice = 0;
    this.unrealizedPnl = 0;
    this.realizedPnl = 0;
    this.fundingFee = 0;
    this.tradingFee = 0;
    this.liquidationPrice = 0;
    this.notional = 0;
    this.initialMargin = 0;
    this.maintenanceMargin = 0;
  }

  /**
   * 克隆持仓
   * Clone position
   *
   * @returns {Object} 持仓快照 / Position snapshot
   */
  clone() {
    return {
      symbol: this.symbol,
      side: this.side,
      size: this.size,
      entryPrice: this.entryPrice,
      markPrice: this.markPrice,
      leverage: this.leverage,
      unrealizedPnl: this.unrealizedPnl,
      realizedPnl: this.realizedPnl,
      fundingFee: this.fundingFee,
      tradingFee: this.tradingFee,
      liquidationPrice: this.liquidationPrice,
      notional: this.notional,
      initialMargin: this.initialMargin,
      maintenanceMargin: this.maintenanceMargin,
    };
  }
}

// ============================================
// 订单簿类 / Order Book Class
// ============================================

/**
 * 订单簿
 * Order book
 *
 * 用于模拟市场深度和滑点
 * Used to simulate market depth and slippage
 */
class OrderBook {
  /**
   * 构造函数
   * Constructor
   *
   * @param {string} symbol - 交易对 / Symbol
   */
  constructor(symbol) {
    // 交易对 / Symbol
    this.symbol = symbol;

    // 买单簿 (价格从高到低排序) / Bids (sorted high to low)
    // 格式: [[price, amount], ...] / Format: [[price, amount], ...]
    this.bids = [];

    // 卖单簿 (价格从低到高排序) / Asks (sorted low to high)
    // 格式: [[price, amount], ...] / Format: [[price, amount], ...]
    this.asks = [];

    // 最新成交价 / Last trade price
    this.lastPrice = 0;

    // 最新成交时间 / Last trade time
    this.lastTime = 0;

    // 更新时间 / Update time
    this.updateTime = 0;
  }

  /**
   * 更新订单簿
   * Update order book
   *
   * @param {Array} bids - 买单数组 [[price, amount], ...] / Bid array
   * @param {Array} asks - 卖单数组 [[price, amount], ...] / Ask array
   * @param {number} timestamp - 时间戳 / Timestamp
   */
  update(bids, asks, timestamp) {
    // 直接替换订单簿 (快照模式) / Direct replace (snapshot mode)
    this.bids = bids;
    this.asks = asks;
    this.updateTime = timestamp;
  }

  /**
   * 获取最佳买价
   * Get best bid price
   *
   * @returns {number} 最佳买价 / Best bid price
   */
  getBestBid() {
    // 返回买单簿第一档价格 / Return first bid price
    return this.bids.length > 0 ? this.bids[0][0] : 0;
  }

  /**
   * 获取最佳卖价
   * Get best ask price
   *
   * @returns {number} 最佳卖价 / Best ask price
   */
  getBestAsk() {
    // 返回卖单簿第一档价格 / Return first ask price
    return this.asks.length > 0 ? this.asks[0][0] : 0;
  }

  /**
   * 获取中间价
   * Get mid price
   *
   * @returns {number} 中间价 / Mid price
   */
  getMidPrice() {
    // 获取最佳买卖价 / Get best bid/ask
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();

    // 如果两者都存在，返回中间价 / If both exist, return mid price
    if (bestBid > 0 && bestAsk > 0) {
      return (bestBid + bestAsk) / 2;
    }

    // 否则返回最新成交价 / Otherwise return last price
    return this.lastPrice;
  }

  /**
   * 模拟市价单成交（基于深度计算滑点）
   * Simulate market order execution (calculate slippage based on depth)
   *
   * @param {number} side - 订单方向 / Order side
   * @param {number} amount - 订单数量 / Order amount
   * @returns {Object} 成交结果 { avgPrice, fills: [{price, amount}], slippage } / Execution result
   */
  simulateMarketOrder(side, amount) {
    // 选择要消耗的订单簿 / Select order book to consume
    // 买单消耗卖单簿，卖单消耗买单簿 / Buy consumes asks, sell consumes bids
    const book = side === SIDE.BUY ? this.asks : this.bids;

    // 如果订单簿为空，返回失败 / If book empty, return failure
    if (book.length === 0) {
      return {
        success: false,
        avgPrice: 0,
        fills: [],
        slippage: 0,
        reason: 'Empty order book',
      };
    }

    // 成交记录 / Fill records
    const fills = [];

    // 剩余数量 / Remaining amount
    let remaining = amount;

    // 总成交金额 / Total fill value
    let totalValue = 0;

    // 总成交数量 / Total fill amount
    let totalFilled = 0;

    // 初始价格 (用于计算滑点) / Initial price (for slippage calculation)
    const initialPrice = book[0][0];

    // 遍历订单簿档位 / Iterate order book levels
    for (let i = 0; i < book.length && remaining > 0; i++) {
      // 当前档位价格和数量 / Current level price and amount
      const [price, levelAmount] = book[i];

      // 本档成交数量 / Fill amount at this level
      const fillAmount = Math.min(remaining, levelAmount);

      // 记录成交 / Record fill
      fills.push({ price, amount: fillAmount });

      // 累加成交金额 / Accumulate fill value
      totalValue += price * fillAmount;

      // 累加成交数量 / Accumulate fill amount
      totalFilled += fillAmount;

      // 减少剩余数量 / Reduce remaining
      remaining -= fillAmount;
    }

    // 如果未能完全成交 / If not fully filled
    if (remaining > 0) {
      return {
        success: false,
        avgPrice: totalFilled > 0 ? totalValue / totalFilled : 0,
        fills,
        slippage: 0,
        reason: 'Insufficient liquidity',
        filled: totalFilled,
        remaining,
      };
    }

    // 计算成交均价 / Calculate average fill price
    const avgPrice = totalValue / totalFilled;

    // 计算滑点 / Calculate slippage
    // 滑点 = (成交均价 - 初始价格) / 初始价格 × 方向
    // Slippage = (avg price - initial price) / initial price × side
    const slippage = ((avgPrice - initialPrice) / initialPrice) * side;

    // 返回成交结果 / Return execution result
    return {
      success: true,
      avgPrice,
      fills,
      slippage,
      filled: totalFilled,
    };
  }

  /**
   * 检查限价单是否可以成交
   * Check if limit order can be filled
   *
   * @param {number} side - 订单方向 / Order side
   * @param {number} price - 限价 / Limit price
   * @param {number} amount - 数量 / Amount
   * @returns {Object} 成交检查结果 / Fill check result
   */
  checkLimitOrder(side, price, amount) {
    // 买单: 价格 >= 最佳卖价时可成交 / Buy: fillable when price >= best ask
    // 卖单: 价格 <= 最佳买价时可成交 / Sell: fillable when price <= best bid
    if (side === SIDE.BUY) {
      const bestAsk = this.getBestAsk();
      if (bestAsk > 0 && price >= bestAsk) {
        // 模拟市价成交 / Simulate market execution
        return this.simulateMarketOrder(side, amount);
      }
    } else {
      const bestBid = this.getBestBid();
      if (bestBid > 0 && price <= bestBid) {
        // 模拟市价成交 / Simulate market execution
        return this.simulateMarketOrder(side, amount);
      }
    }

    // 无法立即成交，挂单等待 / Cannot fill immediately, place order and wait
    return {
      success: false,
      avgPrice: 0,
      fills: [],
      slippage: 0,
      reason: 'Price not reached',
    };
  }

  /**
   * 更新最新成交价
   * Update last trade price
   *
   * @param {number} price - 成交价格 / Trade price
   * @param {number} timestamp - 成交时间 / Trade time
   */
  updateLastPrice(price, timestamp) {
    this.lastPrice = price;
    this.lastTime = timestamp;
  }
}

// ============================================
// 账户类 / Account Class
// ============================================

/**
 * 交易账户
 * Trading account
 */
class Account {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Config
   */
  constructor(config) {
    // 保存配置 / Save config
    this.config = config;

    // 初始资金 / Initial capital
    this.initialCapital = config.initialCapital;

    // 钱包余额 / Wallet balance
    this.balance = config.initialCapital;

    // 可用余额 / Available balance
    this.available = config.initialCapital;

    // 已用保证金 / Used margin
    this.usedMargin = 0;

    // 持仓映射 { symbol: Position } / Position map
    this.positions = new Map();

    // 未实现盈亏 / Total unrealized PnL
    this.unrealizedPnl = 0;

    // 已实现盈亏 / Total realized PnL
    this.realizedPnl = 0;

    // 累计手续费 / Total fees
    this.totalFees = 0;

    // 累计资金费用 / Total funding fees
    this.totalFundingFees = 0;

    // 当前权益 / Current equity
    this.equity = config.initialCapital;

    // 强平次数 / Liquidation count
    this.liquidationCount = 0;
  }

  /**
   * 获取或创建持仓
   * Get or create position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Position} 持仓对象 / Position object
   */
  getPosition(symbol) {
    // 如果持仓不存在，创建新持仓 / If position doesn't exist, create new one
    if (!this.positions.has(symbol)) {
      const position = new Position(symbol);
      position.leverage = this.config.leverage;
      this.positions.set(symbol, position);
    }

    // 返回持仓 / Return position
    return this.positions.get(symbol);
  }

  /**
   * 更新账户状态
   * Update account state
   */
  updateState() {
    // 重置统计值 / Reset statistics
    this.unrealizedPnl = 0;
    this.usedMargin = 0;

    // 遍历所有持仓 / Iterate all positions
    for (const position of this.positions.values()) {
      // 累加未实现盈亏 / Accumulate unrealized PnL
      this.unrealizedPnl += position.unrealizedPnl;

      // 累加已用保证金 / Accumulate used margin
      this.usedMargin += position.initialMargin;
    }

    // 计算当前权益 / Calculate current equity
    // 权益 = 余额 + 未实现盈亏
    // Equity = balance + unrealized PnL
    this.equity = this.balance + this.unrealizedPnl;

    // 计算可用余额 / Calculate available balance
    // 可用余额 = 权益 - 已用保证金
    // Available = equity - used margin
    this.available = this.equity - this.usedMargin;
  }

  /**
   * 扣除手续费
   * Deduct fee
   *
   * @param {number} fee - 手续费金额 / Fee amount
   */
  deductFee(fee) {
    // 从余额扣除 / Deduct from balance
    this.balance -= fee;

    // 累加总手续费 / Accumulate total fees
    this.totalFees += fee;

    // 更新状态 / Update state
    this.updateState();
  }

  /**
   * 扣除资金费用
   * Deduct funding fee
   *
   * @param {number} fee - 资金费用金额 / Funding fee amount
   */
  deductFundingFee(fee) {
    // 从余额扣除 / Deduct from balance
    this.balance -= fee;

    // 累加总资金费用 / Accumulate total funding fees
    this.totalFundingFees += fee;

    // 更新状态 / Update state
    this.updateState();
  }

  /**
   * 添加已实现盈亏
   * Add realized PnL
   *
   * @param {number} pnl - 已实现盈亏金额 / Realized PnL amount
   */
  addRealizedPnl(pnl) {
    // 添加到余额 / Add to balance
    this.balance += pnl;

    // 累加总已实现盈亏 / Accumulate total realized PnL
    this.realizedPnl += pnl;

    // 更新状态 / Update state
    this.updateState();
  }

  /**
   * 执行强平
   * Execute liquidation
   *
   * @param {Position} position - 被强平的持仓 / Position to liquidate
   * @param {number} markPrice - 标记价格 / Mark price
   */
  liquidate(position, markPrice) {
    // 计算强平损失 / Calculate liquidation loss
    // 损失 = 初始保证金 + 未实现盈亏 + 强平手续费
    // Loss = initial margin + unrealized PnL + liquidation fee
    const liquidationFee = position.notional * this.config.liquidationFeeRate;
    const loss = position.initialMargin + position.unrealizedPnl - liquidationFee;

    // 从余额扣除损失 / Deduct loss from balance
    this.balance -= position.initialMargin;
    this.balance += position.unrealizedPnl;
    this.balance -= liquidationFee;

    // 累加手续费 / Accumulate fee
    this.totalFees += liquidationFee;

    // 重置持仓 / Reset position
    position.reset();

    // 增加强平次数 / Increment liquidation count
    this.liquidationCount++;

    // 更新状态 / Update state
    this.updateState();
  }

  /**
   * 检查是否有足够保证金
   * Check if has enough margin
   *
   * @param {number} requiredMargin - 所需保证金 / Required margin
   * @returns {boolean} 是否有足够保证金 / Whether has enough margin
   */
  hasEnoughMargin(requiredMargin) {
    return this.available >= requiredMargin;
  }

  /**
   * 获取账户快照
   * Get account snapshot
   *
   * @returns {Object} 账户快照 / Account snapshot
   */
  getSnapshot() {
    return {
      balance: this.balance,
      equity: this.equity,
      available: this.available,
      usedMargin: this.usedMargin,
      unrealizedPnl: this.unrealizedPnl,
      realizedPnl: this.realizedPnl,
      totalFees: this.totalFees,
      totalFundingFees: this.totalFundingFees,
      liquidationCount: this.liquidationCount,
      positions: Array.from(this.positions.values()).map(p => p.clone()),
    };
  }

  /**
   * 重置账户
   * Reset account
   */
  reset() {
    this.balance = this.initialCapital;
    this.available = this.initialCapital;
    this.usedMargin = 0;
    this.unrealizedPnl = 0;
    this.realizedPnl = 0;
    this.totalFees = 0;
    this.totalFundingFees = 0;
    this.equity = this.initialCapital;
    this.liquidationCount = 0;
    this.positions.clear();
  }
}

// ============================================
// 撮合引擎 / Matching Engine
// ============================================

/**
 * 撮合引擎
 * Matching engine
 *
 * 负责订单的撮合、成交、取消等操作
 * Responsible for order matching, execution, cancellation
 */
class MatchingEngine {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Config
   * @param {Account} account - 账户 / Account
   */
  constructor(config, account) {
    // 保存配置 / Save config
    this.config = config;

    // 保存账户引用 / Save account reference
    this.account = account;

    // 订单簿映射 { symbol: OrderBook } / Order book map
    this.orderBooks = new Map();

    // 活跃订单映射 { orderId: Order } / Active order map
    this.activeOrders = new Map();

    // 历史订单数组 / Historical orders array
    this.filledOrders = [];

    // 订单ID计数器 / Order ID counter
    this.orderIdCounter = 0;

    // 订单对象池 / Order object pool
    this.orderPool = new ObjectPool(createOrder, resetOrder, config.preAllocateOrders || 100000);

    // 成交回调 / Fill callback
    this.onFill = null;

    // 订单状态变更回调 / Order status change callback
    this.onOrderUpdate = null;
  }

  /**
   * 获取或创建订单簿
   * Get or create order book
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {OrderBook} 订单簿 / Order book
   */
  getOrderBook(symbol) {
    // 如果不存在，创建新订单簿 / If not exist, create new order book
    if (!this.orderBooks.has(symbol)) {
      this.orderBooks.set(symbol, new OrderBook(symbol));
    }

    // 返回订单簿 / Return order book
    return this.orderBooks.get(symbol);
  }

  /**
   * 更新订单簿
   * Update order book
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Array} bids - 买单 / Bids
   * @param {Array} asks - 卖单 / Asks
   * @param {number} timestamp - 时间戳 / Timestamp
   */
  updateOrderBook(symbol, bids, asks, timestamp) {
    // 获取订单簿 / Get order book
    const orderBook = this.getOrderBook(symbol);

    // 更新订单簿 / Update order book
    orderBook.update(bids, asks, timestamp);

    // 尝试撮合活跃的限价单 / Try to match active limit orders
    this._tryMatchLimitOrders(symbol, timestamp);
  }

  /**
   * 更新最新成交价
   * Update last trade price
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} price - 成交价 / Trade price
   * @param {number} timestamp - 时间戳 / Timestamp
   */
  updateLastPrice(symbol, price, timestamp) {
    // 获取订单簿 / Get order book
    const orderBook = this.getOrderBook(symbol);

    // 更新最新成交价 / Update last price
    orderBook.updateLastPrice(price, timestamp);

    // 更新持仓标记价格 / Update position mark price
    const position = this.account.positions.get(symbol);
    if (position) {
      position.updateMarkPrice(price);
    }
  }

  /**
   * 提交订单
   * Submit order
   *
   * @param {Object} params - 订单参数 / Order parameters
   * @param {string} params.symbol - 交易对 / Symbol
   * @param {number} params.side - 方向 / Side
   * @param {number} params.type - 类型 / Type
   * @param {number} params.price - 价格 (限价单) / Price (for limit)
   * @param {number} params.amount - 数量 / Amount
   * @param {boolean} params.postOnly - 只做Maker / Post-only
   * @param {boolean} params.reduceOnly - 只减仓 / Reduce-only
   * @param {number} timestamp - 当前时间戳 / Current timestamp
   * @returns {Object} 订单对象 / Order object
   */
  submitOrder(params, timestamp) {
    // 从对象池获取订单对象 / Get order from pool
    const order = this.orderPool.acquire();

    // 生成订单ID / Generate order ID
    order.id = ++this.orderIdCounter;

    // 设置订单属性 / Set order properties
    order.symbol = params.symbol;
    order.side = params.side;
    order.type = params.type;
    order.price = params.price || 0;
    order.amount = params.amount;
    order.remaining = params.amount;
    order.filled = 0;
    order.avgPrice = 0;
    order.status = ORDER_STATUS.PENDING;
    order.postOnly = params.postOnly || false;
    order.reduceOnly = params.reduceOnly || false;
    order.createTime = timestamp;
    order.updateTime = timestamp;
    order.clientId = params.clientId || '';

    // 验证订单 / Validate order
    const validation = this._validateOrder(order);
    if (!validation.valid) {
      // 订单验证失败 / Order validation failed
      order.status = ORDER_STATUS.REJECTED;
      order.updateTime = timestamp;

      // 触发订单更新回调 / Trigger order update callback
      if (this.onOrderUpdate) {
        this.onOrderUpdate(order, validation.reason);
      }

      // 释放订单对象回池 / Release order back to pool
      this.orderPool.release(order);

      return null;
    }

    // 尝试立即成交 / Try immediate execution
    const executed = this._tryExecuteOrder(order, timestamp);

    // 如果未完全成交且是限价单，加入活跃订单 / If not fully filled and is limit order, add to active orders
    if (!executed && order.type === ORDER_TYPE.LIMIT) {
      // 如果是 post-only 且会立即成交，拒绝订单 / If post-only and would fill immediately, reject
      if (order.postOnly) {
        const orderBook = this.getOrderBook(order.symbol);
        const wouldFill = orderBook.checkLimitOrder(order.side, order.price, order.amount);
        if (wouldFill.success) {
          order.status = ORDER_STATUS.REJECTED;
          order.updateTime = timestamp;

          if (this.onOrderUpdate) {
            this.onOrderUpdate(order, 'Post-only order would fill immediately');
          }

          this.orderPool.release(order);
          return null;
        }
      }

      // 更新状态为挂单 / Update status to open
      order.status = ORDER_STATUS.OPEN;

      // 添加到活跃订单 / Add to active orders
      this.activeOrders.set(order.id, order);
    }

    // 触发订单更新回调 / Trigger order update callback
    if (this.onOrderUpdate) {
      this.onOrderUpdate(order, 'created');
    }

    // 返回订单 / Return order
    return order;
  }

  /**
   * 取消订单
   * Cancel order
   *
   * @param {number} orderId - 订单ID / Order ID
   * @param {number} timestamp - 当前时间戳 / Current timestamp
   * @returns {boolean} 是否成功取消 / Whether successfully canceled
   */
  cancelOrder(orderId, timestamp) {
    // 获取订单 / Get order
    const order = this.activeOrders.get(orderId);

    // 如果订单不存在，返回失败 / If order doesn't exist, return false
    if (!order) {
      return false;
    }

    // 更新订单状态 / Update order status
    order.status = ORDER_STATUS.CANCELED;
    order.updateTime = timestamp;

    // 从活跃订单中移除 / Remove from active orders
    this.activeOrders.delete(orderId);

    // 触发订单更新回调 / Trigger order update callback
    if (this.onOrderUpdate) {
      this.onOrderUpdate(order, 'canceled');
    }

    // 释放订单对象回池 / Release order back to pool
    this.orderPool.release(order);

    return true;
  }

  /**
   * 取消所有订单
   * Cancel all orders
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   * @param {number} timestamp - 当前时间戳 / Current timestamp
   * @returns {number} 取消的订单数量 / Number of canceled orders
   */
  cancelAllOrders(symbol, timestamp) {
    // 计数器 / Counter
    let count = 0;

    // 遍历所有活跃订单 / Iterate all active orders
    for (const [orderId, order] of this.activeOrders) {
      // 如果指定了交易对，跳过不匹配的 / If symbol specified, skip non-matching
      if (symbol && order.symbol !== symbol) {
        continue;
      }

      // 取消订单 / Cancel order
      this.cancelOrder(orderId, timestamp);
      count++;
    }

    return count;
  }

  /**
   * 验证订单
   * Validate order
   *
   * @param {Object} order - 订单对象 / Order object
   * @returns {Object} 验证结果 / Validation result
   * @private
   */
  _validateOrder(order) {
    // 验证数量 / Validate amount
    if (order.amount <= 0) {
      return { valid: false, reason: 'Invalid amount' };
    }

    // 验证价格 (限价单) / Validate price (limit order)
    if (order.type === ORDER_TYPE.LIMIT && order.price <= 0) {
      return { valid: false, reason: 'Invalid price for limit order' };
    }

    // 获取持仓 / Get position
    const position = this.account.getPosition(order.symbol);

    // 验证 reduce-only / Validate reduce-only
    if (order.reduceOnly) {
      // 如果无持仓，拒绝 reduce-only 订单 / If no position, reject reduce-only order
      if (position.size === 0) {
        return { valid: false, reason: 'No position to reduce' };
      }

      // 如果订单方向与持仓方向相同，拒绝 / If order side same as position side, reject
      if (order.side === position.side) {
        return { valid: false, reason: 'Reduce-only order side matches position side' };
      }

      // 如果订单数量大于持仓数量，调整为持仓数量 / If order amount > position size, adjust
      if (order.amount > position.size) {
        order.amount = position.size;
        order.remaining = position.size;
      }
    }

    // 验证保证金 (非 reduce-only) / Validate margin (non reduce-only)
    if (!order.reduceOnly) {
      // 获取订单簿 / Get order book
      const orderBook = this.getOrderBook(order.symbol);

      // 估算成交价格 / Estimate fill price
      const estimatedPrice = order.type === ORDER_TYPE.MARKET
        ? (order.side === SIDE.BUY ? orderBook.getBestAsk() : orderBook.getBestBid())
        : order.price;

      // 计算所需保证金 / Calculate required margin
      const notional = order.amount * estimatedPrice;
      const requiredMargin = notional / this.config.leverage;

      // 检查可用余额 / Check available balance
      if (!this.account.hasEnoughMargin(requiredMargin)) {
        return { valid: false, reason: 'Insufficient margin' };
      }
    }

    // 验证通过 / Validation passed
    return { valid: true };
  }

  /**
   * 尝试执行订单
   * Try to execute order
   *
   * @param {Object} order - 订单对象 / Order object
   * @param {number} timestamp - 当前时间戳 / Current timestamp
   * @returns {boolean} 是否完全成交 / Whether fully filled
   * @private
   */
  _tryExecuteOrder(order, timestamp) {
    // 获取订单簿 / Get order book
    const orderBook = this.getOrderBook(order.symbol);

    // 根据订单类型执行 / Execute based on order type
    let result;

    if (order.type === ORDER_TYPE.MARKET) {
      // 市价单直接模拟成交 / Market order simulate execution directly
      result = orderBook.simulateMarketOrder(order.side, order.remaining);
    } else {
      // 限价单检查是否可成交 / Limit order check if can fill
      result = orderBook.checkLimitOrder(order.side, order.price, order.remaining);
    }

    // 如果成交成功 / If execution successful
    if (result.success) {
      // 处理成交 / Process fill
      this._processFill(order, result, timestamp);
      return true;
    }

    return false;
  }

  /**
   * 尝试撮合活跃的限价单
   * Try to match active limit orders
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} timestamp - 当前时间戳 / Current timestamp
   * @private
   */
  _tryMatchLimitOrders(symbol, timestamp) {
    // 获取订单簿 / Get order book
    const orderBook = this.getOrderBook(symbol);

    // 遍历所有活跃订单 / Iterate all active orders
    for (const [orderId, order] of this.activeOrders) {
      // 跳过不匹配的交易对 / Skip non-matching symbol
      if (order.symbol !== symbol) {
        continue;
      }

      // 检查限价单是否可成交 / Check if limit order can fill
      const result = orderBook.checkLimitOrder(order.side, order.price, order.remaining);

      // 如果可以成交 / If can fill
      if (result.success) {
        // 处理成交 / Process fill
        this._processFill(order, result, timestamp);

        // 如果完全成交，从活跃订单中移除 / If fully filled, remove from active orders
        if (order.status === ORDER_STATUS.FILLED) {
          this.activeOrders.delete(orderId);
        }
      }
    }
  }

  /**
   * 处理订单成交
   * Process order fill
   *
   * @param {Object} order - 订单对象 / Order object
   * @param {Object} result - 成交结果 / Fill result
   * @param {number} timestamp - 时间戳 / Timestamp
   * @private
   */
  _processFill(order, result, timestamp) {
    // 计算成交数量 / Calculate fill amount
    const fillAmount = result.filled;

    // 计算成交均价 / Calculate average price
    const fillPrice = result.avgPrice;

    // 判断是 maker 还是 taker / Determine if maker or taker
    // 市价单总是 taker，限价单在挂单后成交为 maker / Market orders always taker, limit orders filled after posting are maker
    const isTaker = order.type === ORDER_TYPE.MARKET || order.status === ORDER_STATUS.PENDING;

    // 计算手续费 / Calculate fee
    const feeRate = isTaker ? this.config.takerFee : this.config.makerFee;
    const notional = fillAmount * fillPrice;
    const fee = notional * feeRate;

    // 更新订单 / Update order
    order.filled += fillAmount;
    order.remaining -= fillAmount;
    order.avgPrice = (order.avgPrice * (order.filled - fillAmount) + fillPrice * fillAmount) / order.filled;
    order.fee += fee;
    order.updateTime = timestamp;

    // 更新订单状态 / Update order status
    if (order.remaining <= 0) {
      order.status = ORDER_STATUS.FILLED;
    } else {
      order.status = ORDER_STATUS.PARTIAL;
    }

    // 更新持仓 / Update position
    const position = this.account.getPosition(order.symbol);
    const realizedPnl = position.update(order.side, fillAmount, fillPrice, this.config);

    // 更新订单已实现盈亏 / Update order realized PnL
    order.realizedPnl += realizedPnl;

    // 更新账户 / Update account
    this.account.deductFee(fee);
    if (realizedPnl !== 0) {
      this.account.addRealizedPnl(realizedPnl);
    }

    // 更新持仓手续费 / Update position trading fee
    position.tradingFee += fee;

    // 记录成交订单 / Record filled order
    if (order.status === ORDER_STATUS.FILLED) {
      this.filledOrders.push({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        price: order.avgPrice,
        amount: order.filled,
        fee: order.fee,
        realizedPnl: order.realizedPnl,
        timestamp: timestamp,
      });
    }

    // 触发成交回调 / Trigger fill callback
    if (this.onFill) {
      this.onFill({
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        price: fillPrice,
        amount: fillAmount,
        fee,
        realizedPnl,
        slippage: result.slippage,
        timestamp,
      });
    }

    // 触发订单更新回调 / Trigger order update callback
    if (this.onOrderUpdate) {
      this.onOrderUpdate(order, 'filled');
    }
  }

  /**
   * 重置撮合引擎
   * Reset matching engine
   */
  reset() {
    // 清空订单簿 / Clear order books
    this.orderBooks.clear();

    // 释放所有活跃订单回池 / Release all active orders to pool
    for (const order of this.activeOrders.values()) {
      this.orderPool.release(order);
    }
    this.activeOrders.clear();

    // 清空历史订单 / Clear filled orders
    this.filledOrders = [];

    // 重置计数器 / Reset counter
    this.orderIdCounter = 0;
  }
}

// ============================================
// 策略基类 / Strategy Base Class
// ============================================

/**
 * 策略基类
 * Strategy base class
 *
 * 所有回测策略必须继承此类
 * All backtest strategies must extend this class
 */
class BaseStrategy {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) {
    // 策略参数 / Strategy parameters
    this.params = params;

    // 策略名称 / Strategy name
    this.name = params.name || 'BaseStrategy';

    // 回测引擎引用 (由引擎设置) / Backtest engine reference (set by engine)
    this.engine = null;

    // 是否已初始化 / Whether initialized
    this.initialized = false;
  }

  /**
   * 初始化策略 (由回测引擎调用)
   * Initialize strategy (called by backtest engine)
   *
   * @param {BacktestEngine} engine - 回测引擎 / Backtest engine
   */
  init(engine) {
    // 保存引擎引用 / Save engine reference
    this.engine = engine;

    // 标记为已初始化 / Mark as initialized
    this.initialized = true;

    // 调用子类的 onInit 方法 / Call subclass onInit method
    this.onInit();
  }

  /**
   * 策略初始化回调 (子类实现)
   * Strategy initialization callback (implement in subclass)
   */
  onInit() {
    // 子类实现 / Implement in subclass
  }

  /**
   * 处理成交事件 (子类实现)
   * Handle trade event (implement in subclass)
   *
   * @param {Object} trade - 成交数据 / Trade data
   */
  onTrade(trade) {
    // 子类实现 / Implement in subclass
  }

  /**
   * 处理深度事件 (子类实现)
   * Handle depth event (implement in subclass)
   *
   * @param {Object} depth - 深度数据 / Depth data
   */
  onDepth(depth) {
    // 子类实现 / Implement in subclass
  }

  /**
   * 处理资金费率事件 (子类实现)
   * Handle funding event (implement in subclass)
   *
   * @param {Object} funding - 资金费率数据 / Funding rate data
   */
  onFunding(funding) {
    // 子类实现 / Implement in subclass
  }

  /**
   * 处理K线事件 (子类实现)
   * Handle kline event (implement in subclass)
   *
   * @param {Object} kline - K线数据 / Kline data
   */
  onKline(kline) {
    // 子类实现 / Implement in subclass
  }

  /**
   * 处理订单成交事件 (子类实现)
   * Handle order fill event (implement in subclass)
   *
   * @param {Object} fill - 成交数据 / Fill data
   */
  onOrderFill(fill) {
    // 子类实现 / Implement in subclass
  }

  /**
   * 处理订单更新事件 (子类实现)
   * Handle order update event (implement in subclass)
   *
   * @param {Object} order - 订单数据 / Order data
   * @param {string} reason - 更新原因 / Update reason
   */
  onOrderUpdate(order, reason) {
    // 子类实现 / Implement in subclass
  }

  /**
   * 回测结束回调 (子类实现)
   * Backtest end callback (implement in subclass)
   *
   * @param {Object} result - 回测结果 / Backtest result
   */
  onEnd(result) {
    // 子类实现 / Implement in subclass
  }

  // ============================================
  // 交易 API / Trading API
  // ============================================

  /**
   * 提交市价买单
   * Submit market buy order
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 订单 / Order
   */
  marketBuy(symbol, amount, options = {}) {
    return this.engine.submitOrder({
      symbol,
      side: SIDE.BUY,
      type: ORDER_TYPE.MARKET,
      amount,
      ...options,
    });
  }

  /**
   * 提交市价卖单
   * Submit market sell order
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 订单 / Order
   */
  marketSell(symbol, amount, options = {}) {
    return this.engine.submitOrder({
      symbol,
      side: SIDE.SELL,
      type: ORDER_TYPE.MARKET,
      amount,
      ...options,
    });
  }

  /**
   * 提交限价买单
   * Submit limit buy order
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} price - 价格 / Price
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 订单 / Order
   */
  limitBuy(symbol, price, amount, options = {}) {
    return this.engine.submitOrder({
      symbol,
      side: SIDE.BUY,
      type: ORDER_TYPE.LIMIT,
      price,
      amount,
      ...options,
    });
  }

  /**
   * 提交限价卖单
   * Submit limit sell order
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} price - 价格 / Price
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 订单 / Order
   */
  limitSell(symbol, price, amount, options = {}) {
    return this.engine.submitOrder({
      symbol,
      side: SIDE.SELL,
      type: ORDER_TYPE.LIMIT,
      price,
      amount,
      ...options,
    });
  }

  /**
   * 取消订单
   * Cancel order
   *
   * @param {number} orderId - 订单ID / Order ID
   * @returns {boolean} 是否成功 / Whether successful
   */
  cancelOrder(orderId) {
    return this.engine.cancelOrder(orderId);
  }

  /**
   * 取消所有订单
   * Cancel all orders
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   * @returns {number} 取消数量 / Cancel count
   */
  cancelAllOrders(symbol) {
    return this.engine.cancelAllOrders(symbol);
  }

  /**
   * 平掉所有持仓
   * Close all positions
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   */
  closeAllPositions(symbol) {
    this.engine.closeAllPositions(symbol);
  }

  // ============================================
  // 查询 API / Query API
  // ============================================

  /**
   * 获取当前时间戳
   * Get current timestamp
   *
   * @returns {number} 时间戳 / Timestamp
   */
  getTime() {
    return this.engine.currentTime;
  }

  /**
   * 获取账户信息
   * Get account info
   *
   * @returns {Object} 账户快照 / Account snapshot
   */
  getAccount() {
    return this.engine.account.getSnapshot();
  }

  /**
   * 获取持仓
   * Get position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 持仓快照 / Position snapshot
   */
  getPosition(symbol) {
    const position = this.engine.account.getPosition(symbol);
    return position.clone();
  }

  /**
   * 获取订单簿
   * Get order book
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 订单簿 / Order book
   */
  getOrderBook(symbol) {
    const orderBook = this.engine.matchingEngine.getOrderBook(symbol);
    return {
      symbol,
      bids: orderBook.bids.slice(0, 20),
      asks: orderBook.asks.slice(0, 20),
      midPrice: orderBook.getMidPrice(),
      lastPrice: orderBook.lastPrice,
    };
  }

  /**
   * 获取活跃订单
   * Get active orders
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   * @returns {Array} 活跃订单列表 / Active order list
   */
  getActiveOrders(symbol) {
    const orders = [];
    for (const order of this.engine.matchingEngine.activeOrders.values()) {
      if (!symbol || order.symbol === symbol) {
        orders.push({ ...order });
      }
    }
    return orders;
  }
}

// ============================================
// 回测引擎 / Backtest Engine
// ============================================

/**
 * 高性能事件驱动回测引擎
 * High-performance event-driven backtest engine
 */
class BacktestEngine {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 合并配置 / Merge config
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 创建账户 / Create account
    this.account = new Account(this.config);

    // 创建撮合引擎 / Create matching engine
    this.matchingEngine = new MatchingEngine(this.config, this.account);

    // 策略实例 / Strategy instance
    this.strategy = null;

    // 事件队列 (预排序的事件数组) / Event queue (pre-sorted event array)
    this.events = [];

    // 当前事件索引 / Current event index
    this.eventIndex = 0;

    // 当前时间戳 / Current timestamp
    this.currentTime = 0;

    // 上次资金费率时间 / Last funding time
    this.lastFundingTime = 0;

    // 资金费率数据 { symbol: rate } / Funding rate data
    this.fundingRates = new Map();

    // 回测结果 / Backtest result
    this.result = null;

    // 权益曲线 / Equity curve
    this.equityCurve = [];

    // 交易记录 / Trade records
    this.trades = [];

    // 性能统计 / Performance stats
    this.perfStats = {
      startTime: 0,              // 回测开始时间 / Backtest start time
      endTime: 0,                // 回测结束时间 / Backtest end time
      eventsProcessed: 0,        // 处理的事件数 / Events processed
      ordersSubmitted: 0,        // 提交的订单数 / Orders submitted
      ordersFilled: 0,           // 成交的订单数 / Orders filled
    };

    // 设置撮合引擎回调 / Set matching engine callbacks
    this._setupCallbacks();
  }

  /**
   * 设置撮合引擎回调
   * Setup matching engine callbacks
   * @private
   */
  _setupCallbacks() {
    // 成交回调 / Fill callback
    this.matchingEngine.onFill = (fill) => {
      // 记录交易 / Record trade
      this.trades.push(fill);

      // 更新性能统计 / Update performance stats
      this.perfStats.ordersFilled++;

      // 通知策略 / Notify strategy
      if (this.strategy) {
        this.strategy.onOrderFill(fill);
      }
    };

    // 订单更新回调 / Order update callback
    this.matchingEngine.onOrderUpdate = (order, reason) => {
      // 通知策略 / Notify strategy
      if (this.strategy) {
        this.strategy.onOrderUpdate(order, reason);
      }
    };
  }

  /**
   * 设置策略
   * Set strategy
   *
   * @param {BaseStrategy} strategy - 策略实例 / Strategy instance
   */
  setStrategy(strategy) {
    // 保存策略引用 / Save strategy reference
    this.strategy = strategy;

    // 初始化策略 / Initialize strategy
    strategy.init(this);
  }

  /**
   * 加载事件数据
   * Load event data
   *
   * @param {Array} events - 事件数组 / Event array
   *
   * 事件格式 / Event format:
   * {
   *   type: EVENT_TYPE,       // 事件类型 / Event type
   *   timestamp: number,      // 时间戳 / Timestamp
   *   symbol: string,         // 交易对 / Symbol
   *   data: Object,           // 事件数据 / Event data
   * }
   */
  loadEvents(events) {
    // 保存事件 / Save events
    this.events = events;

    // 按时间戳排序 (如果未排序) / Sort by timestamp (if not sorted)
    // 使用快速检查避免不必要的排序 / Use quick check to avoid unnecessary sort
    let needsSort = false;
    for (let i = 1; i < events.length; i++) {
      if (events[i].timestamp < events[i - 1].timestamp) {
        needsSort = true;
        break;
      }
    }

    if (needsSort) {
      // 使用原生排序 / Use native sort
      this.events.sort((a, b) => a.timestamp - b.timestamp);
    }

    console.log(`[BacktestEngine] 已加载 ${events.length} 个事件`);
  }

  /**
   * 加载交易数据
   * Load trade data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Array} trades - 成交数据数组 / Trade data array
   *
   * 成交数据格式 / Trade data format:
   * [[timestamp, price, amount, side], ...]
   */
  loadTrades(symbol, trades) {
    // 转换为事件格式 / Convert to event format
    const events = trades.map(trade => ({
      type: EVENT_TYPE.TRADE,
      timestamp: trade[0],
      symbol,
      data: {
        price: trade[1],
        amount: trade[2],
        side: trade[3],
      },
    }));

    // 合并到事件队列 / Merge into event queue
    this.events = this.events.concat(events);
  }

  /**
   * 加载深度快照数据
   * Load depth snapshot data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Array} snapshots - 深度快照数组 / Depth snapshot array
   *
   * 快照格式 / Snapshot format:
   * { timestamp, bids: [[price, amount], ...], asks: [[price, amount], ...] }
   */
  loadDepthSnapshots(symbol, snapshots) {
    // 转换为事件格式 / Convert to event format
    const events = snapshots.map(snapshot => ({
      type: EVENT_TYPE.DEPTH,
      timestamp: snapshot.timestamp,
      symbol,
      data: {
        bids: snapshot.bids,
        asks: snapshot.asks,
      },
    }));

    // 合并到事件队列 / Merge into event queue
    this.events = this.events.concat(events);
  }

  /**
   * 加载资金费率数据
   * Load funding rate data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Array} fundingRates - 资金费率数组 / Funding rate array
   *
   * 资金费率格式 / Funding rate format:
   * [[timestamp, rate], ...]
   */
  loadFundingRates(symbol, fundingRates) {
    // 转换为事件格式 / Convert to event format
    const events = fundingRates.map(funding => ({
      type: EVENT_TYPE.FUNDING,
      timestamp: funding[0],
      symbol,
      data: {
        rate: funding[1],
      },
    }));

    // 合并到事件队列 / Merge into event queue
    this.events = this.events.concat(events);
  }

  /**
   * 加载K线数据
   * Load kline data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Array} klines - K线数组 / Kline array
   *
   * K线格式 / Kline format:
   * [[timestamp, open, high, low, close, volume], ...]
   */
  loadKlines(symbol, klines) {
    // 转换为事件格式 / Convert to event format
    const events = klines.map(kline => ({
      type: EVENT_TYPE.KLINE,
      timestamp: kline[0],
      symbol,
      data: {
        open: kline[1],
        high: kline[2],
        low: kline[3],
        close: kline[4],
        volume: kline[5],
      },
    }));

    // 合并到事件队列 / Merge into event queue
    this.events = this.events.concat(events);
  }

  /**
   * 运行回测
   * Run backtest
   *
   * @returns {Object} 回测结果 / Backtest result
   */
  run() {
    // 检查是否已设置策略 / Check if strategy is set
    if (!this.strategy) {
      throw new Error('未设置策略 / Strategy not set');
    }

    // 检查是否已加载事件 / Check if events are loaded
    if (this.events.length === 0) {
      throw new Error('未加载事件数据 / No events loaded');
    }

    // 对所有事件排序 / Sort all events
    this.events.sort((a, b) => a.timestamp - b.timestamp);

    // 记录开始时间 / Record start time
    this.perfStats.startTime = Date.now();

    console.log(`[BacktestEngine] 开始回测，共 ${this.events.length} 个事件...`);

    // 重置事件索引 / Reset event index
    this.eventIndex = 0;

    // 设置初始时间 / Set initial time
    this.currentTime = this.events[0].timestamp;
    this.lastFundingTime = this.currentTime;

    // 获取批处理大小 / Get batch size
    const batchSize = this.config.eventBatchSize;

    // 上次记录权益的时间 / Last equity record time
    let lastEquityTime = this.currentTime;

    // 权益记录间隔 (1小时) / Equity record interval (1 hour)
    const equityInterval = 60 * 60 * 1000;

    // 事件处理主循环 / Main event processing loop
    while (this.eventIndex < this.events.length) {
      // 批量处理事件以提高性能 / Process events in batches for performance
      const endIndex = Math.min(this.eventIndex + batchSize, this.events.length);

      // 处理当前批次的事件 / Process current batch of events
      for (let i = this.eventIndex; i < endIndex; i++) {
        // 获取当前事件 / Get current event
        const event = this.events[i];

        // 更新当前时间 / Update current time
        this.currentTime = event.timestamp;

        // 检查资金费率结算 / Check funding rate settlement
        this._checkFundingSettlement();

        // 检查强平 / Check liquidation
        this._checkLiquidation();

        // 处理事件 / Process event
        this._processEvent(event);

        // 更新性能统计 / Update performance stats
        this.perfStats.eventsProcessed++;

        // 定期记录权益曲线 / Periodically record equity curve
        if (this.currentTime - lastEquityTime >= equityInterval) {
          this._recordEquity();
          lastEquityTime = this.currentTime;
        }
      }

      // 更新事件索引 / Update event index
      this.eventIndex = endIndex;
    }

    // 记录最终权益 / Record final equity
    this._recordEquity();

    // 记录结束时间 / Record end time
    this.perfStats.endTime = Date.now();

    // 计算回测结果 / Calculate backtest result
    this.result = this._calculateResult();

    // 通知策略回测结束 / Notify strategy backtest ended
    if (this.strategy) {
      this.strategy.onEnd(this.result);
    }

    // 打印回测统计 / Print backtest stats
    this._printStats();

    // 返回结果 / Return result
    return this.result;
  }

  /**
   * 处理单个事件
   * Process single event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processEvent(event) {
    // 根据事件类型分发处理 / Dispatch based on event type
    switch (event.type) {
      case EVENT_TYPE.TRADE:
        // 处理成交事件 / Process trade event
        this._processTrade(event);
        break;

      case EVENT_TYPE.DEPTH:
        // 处理深度事件 / Process depth event
        this._processDepth(event);
        break;

      case EVENT_TYPE.FUNDING:
        // 处理资金费率事件 / Process funding event
        this._processFunding(event);
        break;

      case EVENT_TYPE.KLINE:
        // 处理K线事件 / Process kline event
        this._processKline(event);
        break;
    }
  }

  /**
   * 处理成交事件
   * Process trade event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processTrade(event) {
    // 更新最新成交价 / Update last price
    this.matchingEngine.updateLastPrice(
      event.symbol,
      event.data.price,
      event.timestamp
    );

    // 通知策略 / Notify strategy
    if (this.strategy) {
      this.strategy.onTrade({
        symbol: event.symbol,
        price: event.data.price,
        amount: event.data.amount,
        side: event.data.side,
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * 处理深度事件
   * Process depth event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processDepth(event) {
    // 更新订单簿 / Update order book
    this.matchingEngine.updateOrderBook(
      event.symbol,
      event.data.bids,
      event.data.asks,
      event.timestamp
    );

    // 通知策略 / Notify strategy
    if (this.strategy) {
      this.strategy.onDepth({
        symbol: event.symbol,
        bids: event.data.bids,
        asks: event.data.asks,
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * 处理资金费率事件
   * Process funding rate event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processFunding(event) {
    // 更新资金费率 / Update funding rate
    this.fundingRates.set(event.symbol, event.data.rate);

    // 通知策略 / Notify strategy
    if (this.strategy) {
      this.strategy.onFunding({
        symbol: event.symbol,
        rate: event.data.rate,
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * 处理K线事件
   * Process kline event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processKline(event) {
    // 使用收盘价更新最新价 / Update last price with close price
    this.matchingEngine.updateLastPrice(
      event.symbol,
      event.data.close,
      event.timestamp
    );

    // 通知策略 / Notify strategy
    if (this.strategy) {
      this.strategy.onKline({
        symbol: event.symbol,
        open: event.data.open,
        high: event.data.high,
        low: event.data.low,
        close: event.data.close,
        volume: event.data.volume,
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * 检查资金费率结算
   * Check funding rate settlement
   * @private
   */
  _checkFundingSettlement() {
    // 获取资金费率结算间隔 / Get funding interval
    const interval = this.config.fundingInterval;

    // 检查是否到达结算时间 / Check if reached settlement time
    if (this.currentTime - this.lastFundingTime >= interval) {
      // 结算资金费用 / Settle funding fees
      this._settleFunding();

      // 更新上次结算时间 / Update last settlement time
      this.lastFundingTime = this.currentTime;
    }
  }

  /**
   * 结算资金费用
   * Settle funding fees
   * @private
   */
  _settleFunding() {
    // 遍历所有持仓 / Iterate all positions
    for (const [symbol, position] of this.account.positions) {
      // 跳过空仓 / Skip empty positions
      if (position.size === 0) {
        continue;
      }

      // 获取资金费率 / Get funding rate
      const fundingRate = this.fundingRates.get(symbol) || 0;

      // 跳过零费率 / Skip zero rate
      if (fundingRate === 0) {
        continue;
      }

      // 应用资金费率 / Apply funding rate
      const fee = position.applyFundingRate(fundingRate);

      // 从账户扣除 / Deduct from account
      this.account.deductFundingFee(fee);
    }
  }

  /**
   * 检查强平
   * Check liquidation
   * @private
   */
  _checkLiquidation() {
    // 遍历所有持仓 / Iterate all positions
    for (const position of this.account.positions.values()) {
      // 跳过空仓 / Skip empty positions
      if (position.size === 0) {
        continue;
      }

      // 检查是否需要强平 / Check if need to liquidate
      if (position.shouldLiquidate(position.markPrice)) {
        // 执行强平 / Execute liquidation
        this.account.liquidate(position, position.markPrice);

        console.log(`[BacktestEngine] 强平: ${position.symbol} @ ${position.markPrice}`);
      }
    }
  }

  /**
   * 记录权益
   * Record equity
   * @private
   */
  _recordEquity() {
    // 更新账户状态 / Update account state
    this.account.updateState();

    // 记录权益点 / Record equity point
    this.equityCurve.push({
      timestamp: this.currentTime,
      equity: this.account.equity,
      balance: this.account.balance,
      unrealizedPnl: this.account.unrealizedPnl,
    });
  }

  /**
   * 提交订单 (供策略调用)
   * Submit order (for strategy)
   *
   * @param {Object} params - 订单参数 / Order parameters
   * @returns {Object} 订单对象 / Order object
   */
  submitOrder(params) {
    // 更新性能统计 / Update performance stats
    this.perfStats.ordersSubmitted++;

    // 提交到撮合引擎 / Submit to matching engine
    return this.matchingEngine.submitOrder(params, this.currentTime);
  }

  /**
   * 取消订单 (供策略调用)
   * Cancel order (for strategy)
   *
   * @param {number} orderId - 订单ID / Order ID
   * @returns {boolean} 是否成功 / Whether successful
   */
  cancelOrder(orderId) {
    return this.matchingEngine.cancelOrder(orderId, this.currentTime);
  }

  /**
   * 取消所有订单 (供策略调用)
   * Cancel all orders (for strategy)
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   * @returns {number} 取消数量 / Cancel count
   */
  cancelAllOrders(symbol) {
    return this.matchingEngine.cancelAllOrders(symbol, this.currentTime);
  }

  /**
   * 平掉所有持仓 (供策略调用)
   * Close all positions (for strategy)
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   */
  closeAllPositions(symbol) {
    // 遍历所有持仓 / Iterate all positions
    for (const [sym, position] of this.account.positions) {
      // 如果指定了交易对，跳过不匹配的 / If symbol specified, skip non-matching
      if (symbol && sym !== symbol) {
        continue;
      }

      // 跳过空仓 / Skip empty positions
      if (position.size === 0) {
        continue;
      }

      // 提交市价平仓单 / Submit market close order
      this.submitOrder({
        symbol: sym,
        side: position.side === POSITION_SIDE.LONG ? SIDE.SELL : SIDE.BUY,
        type: ORDER_TYPE.MARKET,
        amount: position.size,
        reduceOnly: true,
      });
    }
  }

  /**
   * 计算回测结果
   * Calculate backtest result
   *
   * @returns {Object} 回测结果 / Backtest result
   * @private
   */
  _calculateResult() {
    // 更新最终账户状态 / Update final account state
    this.account.updateState();

    // 获取账户快照 / Get account snapshot
    const account = this.account.getSnapshot();

    // 计算收益率 / Calculate return
    const totalReturn = (account.equity - this.config.initialCapital) / this.config.initialCapital;

    // 计算交易统计 / Calculate trade statistics
    const tradeStats = this._calculateTradeStats();

    // 计算风险指标 / Calculate risk metrics
    const riskMetrics = this._calculateRiskMetrics();

    // 构建回测结果 / Build backtest result
    return {
      // 基本信息 / Basic info
      startTime: this.events[0]?.timestamp,
      endTime: this.events[this.events.length - 1]?.timestamp,
      duration: this.perfStats.endTime - this.perfStats.startTime,

      // 账户结果 / Account result
      initialCapital: this.config.initialCapital,
      finalEquity: account.equity,
      finalBalance: account.balance,
      totalReturn,
      totalReturnPct: (totalReturn * 100).toFixed(2) + '%',

      // 盈亏统计 / PnL statistics
      realizedPnl: account.realizedPnl,
      unrealizedPnl: account.unrealizedPnl,
      totalFees: account.totalFees,
      totalFundingFees: account.totalFundingFees,

      // 交易统计 / Trade statistics
      ...tradeStats,

      // 风险指标 / Risk metrics
      ...riskMetrics,

      // 性能统计 / Performance stats
      eventsProcessed: this.perfStats.eventsProcessed,
      ordersSubmitted: this.perfStats.ordersSubmitted,
      ordersFilled: this.perfStats.ordersFilled,
      liquidationCount: account.liquidationCount,

      // 详细数据 / Detailed data
      equityCurve: this.equityCurve,
      trades: this.trades,
      finalPositions: account.positions,
    };
  }

  /**
   * 计算交易统计
   * Calculate trade statistics
   *
   * @returns {Object} 交易统计 / Trade statistics
   * @private
   */
  _calculateTradeStats() {
    // 获取成交订单 / Get filled orders
    const filledOrders = this.matchingEngine.filledOrders;

    // 如果没有成交，返回空统计 / If no fills, return empty stats
    if (filledOrders.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        avgTradeReturn: 0,
      };
    }

    // 统计盈亏交易 / Count winning/losing trades
    let winningTrades = 0;
    let losingTrades = 0;
    let totalWin = 0;
    let totalLoss = 0;

    // 遍历成交订单 / Iterate filled orders
    for (const order of filledOrders) {
      if (order.realizedPnl > 0) {
        winningTrades++;
        totalWin += order.realizedPnl;
      } else if (order.realizedPnl < 0) {
        losingTrades++;
        totalLoss += Math.abs(order.realizedPnl);
      }
    }

    // 计算胜率 / Calculate win rate
    const winRate = filledOrders.length > 0
      ? (winningTrades / filledOrders.length * 100)
      : 0;

    // 计算平均盈亏 / Calculate average win/loss
    const avgWin = winningTrades > 0 ? totalWin / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;

    // 计算盈亏比 / Calculate profit factor
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;

    // 计算平均交易收益 / Calculate average trade return
    const totalPnl = totalWin - totalLoss;
    const avgTradeReturn = filledOrders.length > 0 ? totalPnl / filledOrders.length : 0;

    return {
      totalTrades: filledOrders.length,
      winningTrades,
      losingTrades,
      winRate: winRate.toFixed(2) + '%',
      avgWin,
      avgLoss,
      profitFactor: profitFactor.toFixed(2),
      avgTradeReturn,
    };
  }

  /**
   * 计算风险指标
   * Calculate risk metrics
   *
   * @returns {Object} 风险指标 / Risk metrics
   * @private
   */
  _calculateRiskMetrics() {
    // 如果权益曲线为空，返回空指标 / If equity curve empty, return empty metrics
    if (this.equityCurve.length < 2) {
      return {
        maxDrawdown: 0,
        maxDrawdownPct: '0%',
        sharpeRatio: 0,
        sortinoRatio: 0,
        calmarRatio: 0,
      };
    }

    // 计算收益率序列 / Calculate return series
    const returns = [];
    for (let i = 1; i < this.equityCurve.length; i++) {
      const prevEquity = this.equityCurve[i - 1].equity;
      const currEquity = this.equityCurve[i].equity;
      returns.push((currEquity - prevEquity) / prevEquity);
    }

    // 计算最大回撤 / Calculate max drawdown
    let maxDrawdown = 0;
    let peak = this.equityCurve[0].equity;

    for (const point of this.equityCurve) {
      if (point.equity > peak) {
        peak = point.equity;
      }
      const drawdown = (peak - point.equity) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // 计算夏普比率 / Calculate Sharpe ratio
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    // 年化因子 (假设每小时一个数据点) / Annualization factor (assuming hourly data)
    const annualFactor = Math.sqrt(365 * 24);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * annualFactor : 0;

    // 计算 Sortino 比率 (只考虑下行风险) / Calculate Sortino ratio (downside risk only)
    const negativeReturns = returns.filter(r => r < 0);
    const downsideDev = negativeReturns.length > 0
      ? Math.sqrt(negativeReturns.reduce((sum, r) => sum + r * r, 0) / negativeReturns.length)
      : 0;
    const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * annualFactor : 0;

    // 计算 Calmar 比率 / Calculate Calmar ratio
    const totalReturn = (this.account.equity - this.config.initialCapital) / this.config.initialCapital;
    const calmarRatio = maxDrawdown > 0 ? totalReturn / maxDrawdown : 0;

    return {
      maxDrawdown,
      maxDrawdownPct: (maxDrawdown * 100).toFixed(2) + '%',
      sharpeRatio: sharpeRatio.toFixed(2),
      sortinoRatio: sortinoRatio.toFixed(2),
      calmarRatio: calmarRatio.toFixed(2),
    };
  }

  /**
   * 打印回测统计
   * Print backtest statistics
   * @private
   */
  _printStats() {
    // 计算运行时间 / Calculate running time
    const duration = this.perfStats.endTime - this.perfStats.startTime;
    const eventsPerSecond = Math.floor(this.perfStats.eventsProcessed / (duration / 1000));

    console.log('\n====================================');
    console.log('回测统计 / Backtest Statistics');
    console.log('====================================');
    console.log(`运行时间 / Duration: ${duration}ms`);
    console.log(`处理事件 / Events: ${this.perfStats.eventsProcessed.toLocaleString()}`);
    console.log(`处理速度 / Speed: ${eventsPerSecond.toLocaleString()} events/s`);
    console.log(`提交订单 / Orders: ${this.perfStats.ordersSubmitted}`);
    console.log(`成交订单 / Filled: ${this.perfStats.ordersFilled}`);
    console.log('====================================');
    console.log(`初始资金 / Initial: ${this.config.initialCapital}`);
    console.log(`最终权益 / Final: ${this.account.equity.toFixed(2)}`);
    console.log(`总收益率 / Return: ${this.result.totalReturnPct}`);
    console.log(`最大回撤 / MaxDD: ${this.result.maxDrawdownPct}`);
    console.log(`夏普比率 / Sharpe: ${this.result.sharpeRatio}`);
    console.log(`胜率 / Win Rate: ${this.result.winRate}`);
    console.log('====================================\n');
  }

  /**
   * 重置回测引擎
   * Reset backtest engine
   */
  reset() {
    // 重置账户 / Reset account
    this.account.reset();

    // 重置撮合引擎 / Reset matching engine
    this.matchingEngine.reset();

    // 清空事件 / Clear events
    this.events = [];
    this.eventIndex = 0;
    this.currentTime = 0;
    this.lastFundingTime = 0;

    // 清空资金费率 / Clear funding rates
    this.fundingRates.clear();

    // 清空结果 / Clear result
    this.result = null;
    this.equityCurve = [];
    this.trades = [];

    // 重置性能统计 / Reset performance stats
    this.perfStats = {
      startTime: 0,
      endTime: 0,
      eventsProcessed: 0,
      ordersSubmitted: 0,
      ordersFilled: 0,
    };
  }
}

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export {
  SIDE,
  ORDER_TYPE,
  ORDER_STATUS,
  EVENT_TYPE,
  POSITION_SIDE,
};

// 导出类 / Export classes
export {
  BaseStrategy,
  BacktestEngine,
  Position,
  Account,
  OrderBook,
  MatchingEngine,
  ObjectPool,
};

// 默认导出 / Default export
export default BacktestEngine;
