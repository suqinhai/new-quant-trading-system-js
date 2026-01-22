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
const SIDE = { // 定义常量 SIDE
  BUY: 1,       // 买入/做多 / Buy/Long
  SELL: -1,     // 卖出/做空 / Sell/Short
}; // 结束代码块

/**
 * 订单类型
 * Order type
 */
const ORDER_TYPE = { // 定义常量 ORDER_TYPE
  MARKET: 0,    // 市价单 / Market order
  LIMIT: 1,     // 限价单 / Limit order
}; // 结束代码块

/**
 * 订单状态
 * Order status
 */
const ORDER_STATUS = { // 定义常量 ORDER_STATUS
  PENDING: 0,   // 待处理 / Pending
  OPEN: 1,      // 挂单中 / Open
  FILLED: 2,    // 已成交 / Filled
  PARTIAL: 3,   // 部分成交 / Partially filled
  CANCELED: 4,  // 已取消 / Canceled
  REJECTED: 5,  // 已拒绝 / Rejected
}; // 结束代码块

/**
 * 事件类型
 * Event type
 */
const EVENT_TYPE = { // 定义常量 EVENT_TYPE
  TRADE: 0,       // 成交事件 / Trade event
  DEPTH: 1,       // 深度快照 / Depth snapshot
  FUNDING: 2,     // 资金费率 / Funding rate
  KLINE: 3,       // K线数据 / Kline data
}; // 结束代码块

/**
 * 持仓方向
 * Position side
 */
const POSITION_SIDE = { // 定义常量 POSITION_SIDE
  NONE: 0,      // 无持仓 / No position
  LONG: 1,      // 多头 / Long
  SHORT: -1,    // 空头 / Short
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
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
}; // 结束代码块

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
class ObjectPool { // 定义类 ObjectPool
  /**
   * 构造函数
   * Constructor
   *
   * @param {Function} factory - 对象工厂函数 / Object factory function
   * @param {Function} reset - 对象重置函数 / Object reset function
   * @param {number} initialSize - 初始池大小 / Initial pool size
   */
  constructor(factory, reset, initialSize = 1000) { // 构造函数
    // 保存工厂函数 / Save factory function
    this.factory = factory; // 设置 factory

    // 保存重置函数 / Save reset function
    this.reset = reset; // 设置 reset

    // 对象池数组 / Pool array
    this.pool = []; // 设置 pool

    // 预分配对象 / Pre-allocate objects
    for (let i = 0; i < initialSize; i++) { // 循环 let i = 0; i < initialSize; i++
      // 创建对象并添加到池 / Create object and add to pool
      this.pool.push(factory()); // 访问 pool
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取对象
   * Acquire object
   *
   * @returns {Object} 池中的对象或新建对象 / Object from pool or new object
   */
  acquire() { // 调用 acquire
    // 如果池中有对象，取出并返回 / If pool has object, pop and return
    if (this.pool.length > 0) { // 条件判断 this.pool.length > 0
      return this.pool.pop(); // 返回结果
    } // 结束代码块

    // 池为空，创建新对象 / Pool empty, create new object
    return this.factory(); // 返回结果
  } // 结束代码块

  /**
   * 释放对象回池
   * Release object back to pool
   *
   * @param {Object} obj - 要释放的对象 / Object to release
   */
  release(obj) { // 调用 release
    // 重置对象状态 / Reset object state
    this.reset(obj); // 调用 reset

    // 放回池中 / Put back to pool
    this.pool.push(obj); // 访问 pool
  } // 结束代码块
} // 结束代码块

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
const createOrder = () => ({ // 定义函数 createOrder
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
}); // 结束代码块

/**
 * 重置订单对象
 * Reset order object
 *
 * @param {Object} order - 订单对象 / Order object
 */
const resetOrder = (order) => { // 定义函数 resetOrder
  order.id = 0; // 赋值 order.id
  order.symbol = ''; // 赋值 order.symbol
  order.side = 0; // 赋值 order.side
  order.type = 0; // 赋值 order.type
  order.price = 0; // 赋值 order.price
  order.amount = 0; // 赋值 order.amount
  order.filled = 0; // 赋值 order.filled
  order.remaining = 0; // 赋值 order.remaining
  order.avgPrice = 0; // 赋值 order.avgPrice
  order.status = 0; // 赋值 order.status
  order.postOnly = false; // 赋值 order.postOnly
  order.reduceOnly = false; // 赋值 order.reduceOnly
  order.createTime = 0; // 赋值 order.createTime
  order.updateTime = 0; // 赋值 order.updateTime
  order.fee = 0; // 赋值 order.fee
  order.realizedPnl = 0; // 赋值 order.realizedPnl
  order.clientId = ''; // 赋值 order.clientId
}; // 结束代码块

// ============================================
// 持仓类 / Position Class
// ============================================

/**
 * 持仓对象
 * Position object
 */
class Position { // 定义类 Position
  /**
   * 构造函数
   * Constructor
   *
   * @param {string} symbol - 交易对 / Symbol
   */
  constructor(symbol) { // 构造函数
    // 交易对 / Symbol
    this.symbol = symbol; // 设置 symbol

    // 持仓方向 / Position side
    this.side = POSITION_SIDE.NONE; // 设置 side

    // 持仓数量 (正数) / Position size (positive)
    this.size = 0; // 设置 size

    // 开仓均价 / Entry price
    this.entryPrice = 0; // 设置 entryPrice

    // 标记价格 / Mark price
    this.markPrice = 0; // 设置 markPrice

    // 杠杆倍数 / Leverage
    this.leverage = 1; // 设置 leverage

    // 保证金模式 ('cross' | 'isolated') / Margin mode
    this.marginMode = 'cross'; // 设置 marginMode

    // 逐仓保证金 (仅 isolated 模式) / Isolated margin
    this.isolatedMargin = 0; // 设置 isolatedMargin

    // 未实现盈亏 / Unrealized PnL
    this.unrealizedPnl = 0; // 设置 unrealizedPnl

    // 累计已实现盈亏 / Cumulative realized PnL
    this.realizedPnl = 0; // 设置 realizedPnl

    // 累计资金费用 / Cumulative funding fee
    this.fundingFee = 0; // 设置 fundingFee

    // 累计交易手续费 / Cumulative trading fee
    this.tradingFee = 0; // 设置 tradingFee

    // 强平价格 / Liquidation price
    this.liquidationPrice = 0; // 设置 liquidationPrice

    // 名义价值 / Notional value
    this.notional = 0; // 设置 notional

    // 初始保证金 / Initial margin
    this.initialMargin = 0; // 设置 initialMargin

    // 维持保证金 / Maintenance margin
    this.maintenanceMargin = 0; // 设置 maintenanceMargin
  } // 结束代码块

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
  update(side, size, price, config) { // 调用 update
    // 已实现盈亏 / Realized PnL
    let realizedPnl = 0; // 定义变量 realizedPnl

    // 如果当前无持仓 / If no current position
    if (this.side === POSITION_SIDE.NONE || this.size === 0) { // 条件判断 this.side === POSITION_SIDE.NONE || this.size...
      // 开新仓 / Open new position
      this.side = side; // 设置 side
      this.size = size; // 设置 size
      this.entryPrice = price; // 设置 entryPrice

    } else if (this.side === side) { // 执行语句
      // 同向加仓 / Add to position in same direction
      // 计算新的开仓均价 / Calculate new entry price
      const totalCost = this.size * this.entryPrice + size * price; // 定义常量 totalCost
      this.size += size; // 访问 size
      this.entryPrice = totalCost / this.size; // 设置 entryPrice

    } else { // 执行语句
      // 反向交易 / Opposite direction trade
      if (size < this.size) { // 条件判断 size < this.size
        // 部分平仓 / Partial close
        // 计算已实现盈亏 / Calculate realized PnL
        realizedPnl = (price - this.entryPrice) * size * this.side; // 赋值 realizedPnl
        this.size -= size; // 访问 size

      } else if (size === this.size) { // 执行语句
        // 完全平仓 / Full close
        // 计算已实现盈亏 / Calculate realized PnL
        realizedPnl = (price - this.entryPrice) * size * this.side; // 赋值 realizedPnl
        this.side = POSITION_SIDE.NONE; // 设置 side
        this.size = 0; // 设置 size
        this.entryPrice = 0; // 设置 entryPrice

      } else { // 执行语句
        // 反向开仓 / Reverse position
        // 先平掉原有仓位 / First close existing position
        realizedPnl = (price - this.entryPrice) * this.size * this.side; // 赋值 realizedPnl

        // 开反向仓 / Open reverse position
        this.side = side; // 设置 side
        this.size = size - this.size; // 设置 size
        this.entryPrice = price; // 设置 entryPrice
      } // 结束代码块
    } // 结束代码块

    // 更新已实现盈亏 / Update realized PnL
    this.realizedPnl += realizedPnl; // 访问 realizedPnl

    // 更新保证金和强平价格 / Update margin and liquidation price
    this._updateMargin(config); // 调用 _updateMargin

    // 返回本次交易的已实现盈亏 / Return realized PnL from this trade
    return realizedPnl; // 返回结果
  } // 结束代码块

  /**
   * 更新标记价格和未实现盈亏
   * Update mark price and unrealized PnL
   *
   * @param {number} markPrice - 标记价格 / Mark price
   */
  updateMarkPrice(markPrice) { // 调用 updateMarkPrice
    // 更新标记价格 / Update mark price
    this.markPrice = markPrice; // 设置 markPrice

    // 计算未实现盈亏 / Calculate unrealized PnL
    if (this.size > 0) { // 条件判断 this.size > 0
      // 未实现盈亏 = (标记价 - 开仓价) × 数量 × 方向
      // Unrealized PnL = (mark price - entry price) × size × side
      this.unrealizedPnl = (markPrice - this.entryPrice) * this.size * this.side; // 设置 unrealizedPnl

      // 更新名义价值 / Update notional value
      this.notional = this.size * markPrice; // 设置 notional
    } else { // 执行语句
      this.unrealizedPnl = 0; // 设置 unrealizedPnl
      this.notional = 0; // 设置 notional
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新保证金信息
   * Update margin information
   *
   * @param {Object} config - 配置 / Config
   * @private
   */
  _updateMargin(config) { // 调用 _updateMargin
    // 如果无持仓，清零所有保证金信息 / If no position, clear all margin info
    if (this.size === 0) { // 条件判断 this.size === 0
      this.initialMargin = 0; // 设置 initialMargin
      this.maintenanceMargin = 0; // 设置 maintenanceMargin
      this.liquidationPrice = 0; // 设置 liquidationPrice
      return; // 返回结果
    } // 结束代码块

    // 计算名义价值 / Calculate notional value
    const notional = this.size * this.entryPrice; // 定义常量 notional

    // 计算初始保证金 / Calculate initial margin
    // 初始保证金 = 名义价值 / 杠杆倍数
    // Initial margin = notional / leverage
    this.initialMargin = notional / this.leverage; // 设置 initialMargin

    // 计算维持保证金 / Calculate maintenance margin
    // 维持保证金 = 名义价值 × 维持保证金率
    // Maintenance margin = notional × maintenance margin rate
    this.maintenanceMargin = notional * config.maintenanceMarginRate; // 设置 maintenanceMargin

    // 计算强平价格 / Calculate liquidation price
    // 多头: 强平价 = 开仓价 × (1 - 1/杠杆 + 维持保证金率)
    // 空头: 强平价 = 开仓价 × (1 + 1/杠杆 - 维持保证金率)
    // Long: liq price = entry × (1 - 1/leverage + maintenance margin rate)
    // Short: liq price = entry × (1 + 1/leverage - maintenance margin rate)
    if (this.side === POSITION_SIDE.LONG) { // 条件判断 this.side === POSITION_SIDE.LONG
      this.liquidationPrice = this.entryPrice * (1 - 1 / this.leverage + config.maintenanceMarginRate); // 设置 liquidationPrice
    } else { // 执行语句
      this.liquidationPrice = this.entryPrice * (1 + 1 / this.leverage - config.maintenanceMarginRate); // 设置 liquidationPrice
    } // 结束代码块
  } // 结束代码块

  /**
   * 应用资金费率
   * Apply funding rate
   *
   * @param {number} fundingRate - 资金费率 / Funding rate
   * @returns {number} 资金费用 (正数表示支出) / Funding fee (positive means expense)
   */
  applyFundingRate(fundingRate) { // 调用 applyFundingRate
    // 如果无持仓，无需支付资金费用 / If no position, no funding fee
    if (this.size === 0) { // 条件判断 this.size === 0
      return 0; // 返回结果
    } // 结束代码块

    // 计算资金费用 / Calculate funding fee
    // 资金费用 = 持仓名义价值 × 资金费率 × 持仓方向
    // Funding fee = notional × funding rate × position side
    // 多头在正资金费率时支付，空头在正资金费率时收取
    // Long pays when positive, short receives when positive
    const fee = this.notional * fundingRate * this.side; // 定义常量 fee

    // 累加资金费用 / Accumulate funding fee
    this.fundingFee += fee; // 访问 fundingFee

    // 返回资金费用 / Return funding fee
    return fee; // 返回结果
  } // 结束代码块

  /**
   * 检查是否应该强平
   * Check if should be liquidated
   *
   * @param {number} markPrice - 标记价格 / Mark price
   * @returns {boolean} 是否应该强平 / Whether should be liquidated
   */
  shouldLiquidate(markPrice) { // 调用 shouldLiquidate
    // 无持仓不需要强平 / No position, no liquidation
    if (this.size === 0) { // 条件判断 this.size === 0
      return false; // 返回结果
    } // 结束代码块

    // 检查是否触及强平价格 / Check if reached liquidation price
    if (this.side === POSITION_SIDE.LONG) { // 条件判断 this.side === POSITION_SIDE.LONG
      // 多头: 标记价 <= 强平价 / Long: mark price <= liquidation price
      return markPrice <= this.liquidationPrice; // 返回结果
    } else { // 执行语句
      // 空头: 标记价 >= 强平价 / Short: mark price >= liquidation price
      return markPrice >= this.liquidationPrice; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 重置持仓
   * Reset position
   */
  reset() { // 调用 reset
    this.side = POSITION_SIDE.NONE; // 设置 side
    this.size = 0; // 设置 size
    this.entryPrice = 0; // 设置 entryPrice
    this.markPrice = 0; // 设置 markPrice
    this.unrealizedPnl = 0; // 设置 unrealizedPnl
    this.realizedPnl = 0; // 设置 realizedPnl
    this.fundingFee = 0; // 设置 fundingFee
    this.tradingFee = 0; // 设置 tradingFee
    this.liquidationPrice = 0; // 设置 liquidationPrice
    this.notional = 0; // 设置 notional
    this.initialMargin = 0; // 设置 initialMargin
    this.maintenanceMargin = 0; // 设置 maintenanceMargin
  } // 结束代码块

  /**
   * 克隆持仓
   * Clone position
   *
   * @returns {Object} 持仓快照 / Position snapshot
   */
  clone() { // 调用 clone
    return { // 返回结果
      symbol: this.symbol, // 交易对
      side: this.side, // 方向
      size: this.size, // 大小
      entryPrice: this.entryPrice, // 入场价格
      markPrice: this.markPrice, // mark价格
      leverage: this.leverage, // 杠杆
      unrealizedPnl: this.unrealizedPnl, // 未实现盈亏
      realizedPnl: this.realizedPnl, // 已实现盈亏
      fundingFee: this.fundingFee, // 资金费率手续费
      tradingFee: this.tradingFee, // 交易手续费
      liquidationPrice: this.liquidationPrice, // 强平价格
      notional: this.notional, // notional
      initialMargin: this.initialMargin, // 初始保证金
      maintenanceMargin: this.maintenanceMargin, // maintenance保证金
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

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
class OrderBook { // 定义类 OrderBook
  /**
   * 构造函数
   * Constructor
   *
   * @param {string} symbol - 交易对 / Symbol
   */
  constructor(symbol) { // 构造函数
    // 交易对 / Symbol
    this.symbol = symbol; // 设置 symbol

    // 买单簿 (价格从高到低排序) / Bids (sorted high to low)
    // 格式: [[price, amount], ...] / Format: [[price, amount], ...]
    this.bids = []; // 设置 bids

    // 卖单簿 (价格从低到高排序) / Asks (sorted low to high)
    // 格式: [[price, amount], ...] / Format: [[price, amount], ...]
    this.asks = []; // 设置 asks

    // 最新成交价 / Last trade price
    this.lastPrice = 0; // 设置 lastPrice

    // 最新成交时间 / Last trade time
    this.lastTime = 0; // 设置 lastTime

    // 更新时间 / Update time
    this.updateTime = 0; // 设置 updateTime
  } // 结束代码块

  /**
   * 更新订单簿
   * Update order book
   *
   * @param {Array} bids - 买单数组 [[price, amount], ...] / Bid array
   * @param {Array} asks - 卖单数组 [[price, amount], ...] / Ask array
   * @param {number} timestamp - 时间戳 / Timestamp
   */
  update(bids, asks, timestamp) { // 调用 update
    // 直接替换订单簿 (快照模式) / Direct replace (snapshot mode)
    this.bids = bids; // 设置 bids
    this.asks = asks; // 设置 asks
    this.updateTime = timestamp; // 设置 updateTime
  } // 结束代码块

  /**
   * 获取最佳买价
   * Get best bid price
   *
   * @returns {number} 最佳买价 / Best bid price
   */
  getBestBid() { // 调用 getBestBid
    // 返回买单簿第一档价格 / Return first bid price
    return this.bids.length > 0 ? this.bids[0][0] : 0; // 返回结果
  } // 结束代码块

  /**
   * 获取最佳卖价
   * Get best ask price
   *
   * @returns {number} 最佳卖价 / Best ask price
   */
  getBestAsk() { // 调用 getBestAsk
    // 返回卖单簿第一档价格 / Return first ask price
    return this.asks.length > 0 ? this.asks[0][0] : 0; // 返回结果
  } // 结束代码块

  /**
   * 获取中间价
   * Get mid price
   *
   * @returns {number} 中间价 / Mid price
   */
  getMidPrice() { // 调用 getMidPrice
    // 获取最佳买卖价 / Get best bid/ask
    const bestBid = this.getBestBid(); // 定义常量 bestBid
    const bestAsk = this.getBestAsk(); // 定义常量 bestAsk

    // 如果两者都存在，返回中间价 / If both exist, return mid price
    if (bestBid > 0 && bestAsk > 0) { // 条件判断 bestBid > 0 && bestAsk > 0
      return (bestBid + bestAsk) / 2; // 返回结果
    } // 结束代码块

    // 否则返回最新成交价 / Otherwise return last price
    return this.lastPrice; // 返回结果
  } // 结束代码块

  /**
   * 模拟市价单成交（基于深度计算滑点）
   * Simulate market order execution (calculate slippage based on depth)
   *
   * @param {number} side - 订单方向 / Order side
   * @param {number} amount - 订单数量 / Order amount
   * @returns {Object} 成交结果 { avgPrice, fills: [{price, amount}], slippage } / Execution result
   */
  simulateMarketOrder(side, amount) { // 调用 simulateMarketOrder
    // 选择要消耗的订单簿 / Select order book to consume
    // 买单消耗卖单簿，卖单消耗买单簿 / Buy consumes asks, sell consumes bids
    const book = side === SIDE.BUY ? this.asks : this.bids; // 定义常量 book

    // 如果订单簿为空，返回失败 / If book empty, return failure
    if (book.length === 0) { // 条件判断 book.length === 0
      return { // 返回结果
        success: false, // 成功标记
        avgPrice: 0, // avg价格
        fills: [], // fills
        slippage: 0, // 滑点
        reason: 'Empty order book', // reason
      }; // 结束代码块
    } // 结束代码块

    // 成交记录 / Fill records
    const fills = []; // 定义常量 fills

    // 剩余数量 / Remaining amount
    let remaining = amount; // 定义变量 remaining

    // 总成交金额 / Total fill value
    let totalValue = 0; // 定义变量 totalValue

    // 总成交数量 / Total fill amount
    let totalFilled = 0; // 定义变量 totalFilled

    // 初始价格 (用于计算滑点) / Initial price (for slippage calculation)
    const initialPrice = book[0][0]; // 定义常量 initialPrice

    // 遍历订单簿档位 / Iterate order book levels
    for (let i = 0; i < book.length && remaining > 0; i++) { // 循环 let i = 0; i < book.length && remaining > 0; i++
      // 当前档位价格和数量 / Current level price and amount
      const [price, levelAmount] = book[i]; // 解构赋值

      // 本档成交数量 / Fill amount at this level
      const fillAmount = Math.min(remaining, levelAmount); // 定义常量 fillAmount

      // 记录成交 / Record fill
      fills.push({ price, amount: fillAmount }); // 调用 fills.push

      // 累加成交金额 / Accumulate fill value
      totalValue += price * fillAmount; // 执行语句

      // 累加成交数量 / Accumulate fill amount
      totalFilled += fillAmount; // 执行语句

      // 减少剩余数量 / Reduce remaining
      remaining -= fillAmount; // 执行语句
    } // 结束代码块

    // 如果未能完全成交 / If not fully filled
    if (remaining > 0) { // 条件判断 remaining > 0
      return { // 返回结果
        success: false, // 成功标记
        avgPrice: totalFilled > 0 ? totalValue / totalFilled : 0, // avg价格
        fills, // 执行语句
        slippage: 0, // 滑点
        reason: 'Insufficient liquidity', // reason
        filled: totalFilled, // filled
        remaining, // 执行语句
      }; // 结束代码块
    } // 结束代码块

    // 计算成交均价 / Calculate average fill price
    const avgPrice = totalValue / totalFilled; // 定义常量 avgPrice

    // 计算滑点 / Calculate slippage
    // 滑点 = (成交均价 - 初始价格) / 初始价格 × 方向
    // Slippage = (avg price - initial price) / initial price × side
    const slippage = ((avgPrice - initialPrice) / initialPrice) * side; // 定义常量 slippage

    // 返回成交结果 / Return execution result
    return { // 返回结果
      success: true, // 成功标记
      avgPrice, // 执行语句
      fills, // 执行语句
      slippage, // 执行语句
      filled: totalFilled, // filled
    }; // 结束代码块
  } // 结束代码块

  /**
   * 检查限价单是否可以成交
   * Check if limit order can be filled
   *
   * @param {number} side - 订单方向 / Order side
   * @param {number} price - 限价 / Limit price
   * @param {number} amount - 数量 / Amount
   * @returns {Object} 成交检查结果 / Fill check result
   */
  checkLimitOrder(side, price, amount) { // 调用 checkLimitOrder
    // 买单: 价格 >= 最佳卖价时可成交 / Buy: fillable when price >= best ask
    // 卖单: 价格 <= 最佳买价时可成交 / Sell: fillable when price <= best bid
    if (side === SIDE.BUY) { // 条件判断 side === SIDE.BUY
      const bestAsk = this.getBestAsk(); // 定义常量 bestAsk
      if (bestAsk > 0 && price >= bestAsk) { // 条件判断 bestAsk > 0 && price >= bestAsk
        // 模拟市价成交 / Simulate market execution
        return this.simulateMarketOrder(side, amount); // 返回结果
      } // 结束代码块
    } else { // 执行语句
      const bestBid = this.getBestBid(); // 定义常量 bestBid
      if (bestBid > 0 && price <= bestBid) { // 条件判断 bestBid > 0 && price <= bestBid
        // 模拟市价成交 / Simulate market execution
        return this.simulateMarketOrder(side, amount); // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 无法立即成交，挂单等待 / Cannot fill immediately, place order and wait
    return { // 返回结果
      success: false, // 成功标记
      avgPrice: 0, // avg价格
      fills: [], // fills
      slippage: 0, // 滑点
      reason: 'Price not reached', // reason
    }; // 结束代码块
  } // 结束代码块

  /**
   * 更新最新成交价
   * Update last trade price
   *
   * @param {number} price - 成交价格 / Trade price
   * @param {number} timestamp - 成交时间 / Trade time
   */
  updateLastPrice(price, timestamp) { // 调用 updateLastPrice
    this.lastPrice = price; // 设置 lastPrice
    this.lastTime = timestamp; // 设置 lastTime
  } // 结束代码块
} // 结束代码块

// ============================================
// 账户类 / Account Class
// ============================================

/**
 * 交易账户
 * Trading account
 */
class Account { // 定义类 Account
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Config
   */
  constructor(config) { // 构造函数
    // 保存配置 / Save config
    this.config = config; // 设置 config

    // 初始资金 / Initial capital
    this.initialCapital = config.initialCapital; // 设置 initialCapital

    // 钱包余额 / Wallet balance
    this.balance = config.initialCapital; // 设置 balance

    // 可用余额 / Available balance
    this.available = config.initialCapital; // 设置 available

    // 已用保证金 / Used margin
    this.usedMargin = 0; // 设置 usedMargin

    // 持仓映射 { symbol: Position } / Position map
    this.positions = new Map(); // 设置 positions

    // 未实现盈亏 / Total unrealized PnL
    this.unrealizedPnl = 0; // 设置 unrealizedPnl

    // 已实现盈亏 / Total realized PnL
    this.realizedPnl = 0; // 设置 realizedPnl

    // 累计手续费 / Total fees
    this.totalFees = 0; // 设置 totalFees

    // 累计资金费用 / Total funding fees
    this.totalFundingFees = 0; // 设置 totalFundingFees

    // 当前权益 / Current equity
    this.equity = config.initialCapital; // 设置 equity

    // 强平次数 / Liquidation count
    this.liquidationCount = 0; // 设置 liquidationCount
  } // 结束代码块

  /**
   * 获取或创建持仓
   * Get or create position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Position} 持仓对象 / Position object
   */
  getPosition(symbol) { // 调用 getPosition
    // 如果持仓不存在，创建新持仓 / If position doesn't exist, create new one
    if (!this.positions.has(symbol)) { // 条件判断 !this.positions.has(symbol)
      const position = new Position(symbol); // 定义常量 position
      position.leverage = this.config.leverage; // 赋值 position.leverage
      this.positions.set(symbol, position); // 访问 positions
    } // 结束代码块

    // 返回持仓 / Return position
    return this.positions.get(symbol); // 返回结果
  } // 结束代码块

  /**
   * 更新账户状态
   * Update account state
   */
  updateState() { // 调用 updateState
    // 重置统计值 / Reset statistics
    this.unrealizedPnl = 0; // 设置 unrealizedPnl
    this.usedMargin = 0; // 设置 usedMargin

    // 遍历所有持仓 / Iterate all positions
    for (const position of this.positions.values()) { // 循环 const position of this.positions.values()
      // 累加未实现盈亏 / Accumulate unrealized PnL
      this.unrealizedPnl += position.unrealizedPnl; // 访问 unrealizedPnl

      // 累加已用保证金 / Accumulate used margin
      this.usedMargin += position.initialMargin; // 访问 usedMargin
    } // 结束代码块

    // 计算当前权益 / Calculate current equity
    // 权益 = 余额 + 未实现盈亏
    // Equity = balance + unrealized PnL
    this.equity = this.balance + this.unrealizedPnl; // 设置 equity

    // 计算可用余额 / Calculate available balance
    // 可用余额 = 权益 - 已用保证金
    // Available = equity - used margin
    this.available = this.equity - this.usedMargin; // 设置 available
  } // 结束代码块

  /**
   * 扣除手续费
   * Deduct fee
   *
   * @param {number} fee - 手续费金额 / Fee amount
   */
  deductFee(fee) { // 调用 deductFee
    // 从余额扣除 / Deduct from balance
    this.balance -= fee; // 访问 balance

    // 累加总手续费 / Accumulate total fees
    this.totalFees += fee; // 访问 totalFees

    // 更新状态 / Update state
    this.updateState(); // 调用 updateState
  } // 结束代码块

  /**
   * 扣除资金费用
   * Deduct funding fee
   *
   * @param {number} fee - 资金费用金额 / Funding fee amount
   */
  deductFundingFee(fee) { // 调用 deductFundingFee
    // 从余额扣除 / Deduct from balance
    this.balance -= fee; // 访问 balance

    // 累加总资金费用 / Accumulate total funding fees
    this.totalFundingFees += fee; // 访问 totalFundingFees

    // 更新状态 / Update state
    this.updateState(); // 调用 updateState
  } // 结束代码块

  /**
   * 添加已实现盈亏
   * Add realized PnL
   *
   * @param {number} pnl - 已实现盈亏金额 / Realized PnL amount
   */
  addRealizedPnl(pnl) { // 调用 addRealizedPnl
    // 添加到余额 / Add to balance
    this.balance += pnl; // 访问 balance

    // 累加总已实现盈亏 / Accumulate total realized PnL
    this.realizedPnl += pnl; // 访问 realizedPnl

    // 更新状态 / Update state
    this.updateState(); // 调用 updateState
  } // 结束代码块

  /**
   * 执行强平
   * Execute liquidation
   *
   * @param {Position} position - 被强平的持仓 / Position to liquidate
   * @param {number} markPrice - 标记价格 / Mark price
   */
  liquidate(position, markPrice) { // 调用 liquidate
    // 计算强平损失 / Calculate liquidation loss
    // 损失 = 初始保证金 + 未实现盈亏 + 强平手续费
    // Loss = initial margin + unrealized PnL + liquidation fee
    const liquidationFee = position.notional * this.config.liquidationFeeRate; // 定义常量 liquidationFee
    const loss = position.initialMargin + position.unrealizedPnl - liquidationFee; // 定义常量 loss

    // 从余额扣除损失 / Deduct loss from balance
    this.balance -= position.initialMargin; // 访问 balance
    this.balance += position.unrealizedPnl; // 访问 balance
    this.balance -= liquidationFee; // 访问 balance

    // 累加手续费 / Accumulate fee
    this.totalFees += liquidationFee; // 访问 totalFees

    // 重置持仓 / Reset position
    position.reset(); // 调用 position.reset

    // 增加强平次数 / Increment liquidation count
    this.liquidationCount++; // 访问 liquidationCount

    // 更新状态 / Update state
    this.updateState(); // 调用 updateState
  } // 结束代码块

  /**
   * 检查是否有足够保证金
   * Check if has enough margin
   *
   * @param {number} requiredMargin - 所需保证金 / Required margin
   * @returns {boolean} 是否有足够保证金 / Whether has enough margin
   */
  hasEnoughMargin(requiredMargin) { // 调用 hasEnoughMargin
    return this.available >= requiredMargin; // 返回结果
  } // 结束代码块

  /**
   * 获取账户快照
   * Get account snapshot
   *
   * @returns {Object} 账户快照 / Account snapshot
   */
  getSnapshot() { // 调用 getSnapshot
    return { // 返回结果
      balance: this.balance, // 余额
      equity: this.equity, // equity
      available: this.available, // available
      usedMargin: this.usedMargin, // used保证金
      unrealizedPnl: this.unrealizedPnl, // 未实现盈亏
      realizedPnl: this.realizedPnl, // 已实现盈亏
      totalFees: this.totalFees, // 总Fees
      totalFundingFees: this.totalFundingFees, // 总资金费率Fees
      liquidationCount: this.liquidationCount, // 强平数量
      positions: Array.from(this.positions.values()).map(p => p.clone()), // 持仓
    }; // 结束代码块
  } // 结束代码块

  /**
   * 重置账户
   * Reset account
   */
  reset() { // 调用 reset
    this.balance = this.initialCapital; // 设置 balance
    this.available = this.initialCapital; // 设置 available
    this.usedMargin = 0; // 设置 usedMargin
    this.unrealizedPnl = 0; // 设置 unrealizedPnl
    this.realizedPnl = 0; // 设置 realizedPnl
    this.totalFees = 0; // 设置 totalFees
    this.totalFundingFees = 0; // 设置 totalFundingFees
    this.equity = this.initialCapital; // 设置 equity
    this.liquidationCount = 0; // 设置 liquidationCount
    this.positions.clear(); // 访问 positions
  } // 结束代码块
} // 结束代码块

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
class MatchingEngine { // 定义类 MatchingEngine
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置 / Config
   * @param {Account} account - 账户 / Account
   */
  constructor(config, account) { // 构造函数
    // 保存配置 / Save config
    this.config = config; // 设置 config

    // 保存账户引用 / Save account reference
    this.account = account; // 设置 account

    // 订单簿映射 { symbol: OrderBook } / Order book map
    this.orderBooks = new Map(); // 设置 orderBooks

    // 活跃订单映射 { orderId: Order } / Active order map
    this.activeOrders = new Map(); // 设置 activeOrders

    // 历史订单数组 / Historical orders array
    this.filledOrders = []; // 设置 filledOrders

    // 订单ID计数器 / Order ID counter
    this.orderIdCounter = 0; // 设置 orderIdCounter

    // 订单对象池 / Order object pool
    this.orderPool = new ObjectPool(createOrder, resetOrder, config.preAllocateOrders || 100000); // 设置 orderPool

    // 成交回调 / Fill callback
    this.onFill = null; // 设置 onFill

    // 订单状态变更回调 / Order status change callback
    this.onOrderUpdate = null; // 设置 onOrderUpdate
  } // 结束代码块

  /**
   * 获取或创建订单簿
   * Get or create order book
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {OrderBook} 订单簿 / Order book
   */
  getOrderBook(symbol) { // 调用 getOrderBook
    // 如果不存在，创建新订单簿 / If not exist, create new order book
    if (!this.orderBooks.has(symbol)) { // 条件判断 !this.orderBooks.has(symbol)
      this.orderBooks.set(symbol, new OrderBook(symbol)); // 访问 orderBooks
    } // 结束代码块

    // 返回订单簿 / Return order book
    return this.orderBooks.get(symbol); // 返回结果
  } // 结束代码块

  /**
   * 更新订单簿
   * Update order book
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Array} bids - 买单 / Bids
   * @param {Array} asks - 卖单 / Asks
   * @param {number} timestamp - 时间戳 / Timestamp
   */
  updateOrderBook(symbol, bids, asks, timestamp) { // 调用 updateOrderBook
    // 获取订单簿 / Get order book
    const orderBook = this.getOrderBook(symbol); // 定义常量 orderBook

    // 更新订单簿 / Update order book
    orderBook.update(bids, asks, timestamp); // 调用 orderBook.update

    // 尝试撮合活跃的限价单 / Try to match active limit orders
    this._tryMatchLimitOrders(symbol, timestamp); // 调用 _tryMatchLimitOrders
  } // 结束代码块

  /**
   * 更新最新成交价
   * Update last trade price
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} price - 成交价 / Trade price
   * @param {number} timestamp - 时间戳 / Timestamp
   */
  updateLastPrice(symbol, price, timestamp) { // 调用 updateLastPrice
    // 获取订单簿 / Get order book
    const orderBook = this.getOrderBook(symbol); // 定义常量 orderBook

    // 更新最新成交价 / Update last price
    orderBook.updateLastPrice(price, timestamp); // 调用 orderBook.updateLastPrice

    // 更新持仓标记价格 / Update position mark price
    const position = this.account.positions.get(symbol); // 定义常量 position
    if (position) { // 条件判断 position
      position.updateMarkPrice(price); // 调用 position.updateMarkPrice
    } // 结束代码块
  } // 结束代码块

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
  submitOrder(params, timestamp) { // 调用 submitOrder
    // 从对象池获取订单对象 / Get order from pool
    const order = this.orderPool.acquire(); // 定义常量 order

    // 生成订单ID / Generate order ID
    order.id = ++this.orderIdCounter; // 赋值 order.id

    // 设置订单属性 / Set order properties
    order.symbol = params.symbol; // 赋值 order.symbol
    order.side = params.side; // 赋值 order.side
    order.type = params.type; // 赋值 order.type
    order.price = params.price || 0; // 赋值 order.price
    order.amount = params.amount; // 赋值 order.amount
    order.remaining = params.amount; // 赋值 order.remaining
    order.filled = 0; // 赋值 order.filled
    order.avgPrice = 0; // 赋值 order.avgPrice
    order.status = ORDER_STATUS.PENDING; // 赋值 order.status
    order.postOnly = params.postOnly || false; // 赋值 order.postOnly
    order.reduceOnly = params.reduceOnly || false; // 赋值 order.reduceOnly
    order.createTime = timestamp; // 赋值 order.createTime
    order.updateTime = timestamp; // 赋值 order.updateTime
    order.clientId = params.clientId || ''; // 赋值 order.clientId

    // 验证订单 / Validate order
    const validation = this._validateOrder(order); // 定义常量 validation
    if (!validation.valid) { // 条件判断 !validation.valid
      // 订单验证失败 / Order validation failed
      order.status = ORDER_STATUS.REJECTED; // 赋值 order.status
      order.updateTime = timestamp; // 赋值 order.updateTime

      // 触发订单更新回调 / Trigger order update callback
      if (this.onOrderUpdate) { // 条件判断 this.onOrderUpdate
        this.onOrderUpdate(order, validation.reason); // 调用 onOrderUpdate
      } // 结束代码块

      // 释放订单对象回池 / Release order back to pool
      this.orderPool.release(order); // 访问 orderPool

      return null; // 返回结果
    } // 结束代码块

    // 尝试立即成交 / Try immediate execution
    const executed = this._tryExecuteOrder(order, timestamp); // 定义常量 executed

    // 如果未完全成交且是限价单，加入活跃订单 / If not fully filled and is limit order, add to active orders
    if (!executed && order.type === ORDER_TYPE.LIMIT) { // 条件判断 !executed && order.type === ORDER_TYPE.LIMIT
      // 如果是 post-only 且会立即成交，拒绝订单 / If post-only and would fill immediately, reject
      if (order.postOnly) { // 条件判断 order.postOnly
        const orderBook = this.getOrderBook(order.symbol); // 定义常量 orderBook
        const wouldFill = orderBook.checkLimitOrder(order.side, order.price, order.amount); // 定义常量 wouldFill
        if (wouldFill.success) { // 条件判断 wouldFill.success
          order.status = ORDER_STATUS.REJECTED; // 赋值 order.status
          order.updateTime = timestamp; // 赋值 order.updateTime

          if (this.onOrderUpdate) { // 条件判断 this.onOrderUpdate
            this.onOrderUpdate(order, 'Post-only order would fill immediately'); // 调用 onOrderUpdate
          } // 结束代码块

          this.orderPool.release(order); // 访问 orderPool
          return null; // 返回结果
        } // 结束代码块
      } // 结束代码块

      // 更新状态为挂单 / Update status to open
      order.status = ORDER_STATUS.OPEN; // 赋值 order.status

      // 添加到活跃订单 / Add to active orders
      this.activeOrders.set(order.id, order); // 访问 activeOrders
    } // 结束代码块

    // 触发订单更新回调 / Trigger order update callback
    if (this.onOrderUpdate) { // 条件判断 this.onOrderUpdate
      this.onOrderUpdate(order, 'created'); // 调用 onOrderUpdate
    } // 结束代码块

    // 返回订单 / Return order
    return order; // 返回结果
  } // 结束代码块

  /**
   * 取消订单
   * Cancel order
   *
   * @param {number} orderId - 订单ID / Order ID
   * @param {number} timestamp - 当前时间戳 / Current timestamp
   * @returns {boolean} 是否成功取消 / Whether successfully canceled
   */
  cancelOrder(orderId, timestamp) { // 调用 cancelOrder
    // 获取订单 / Get order
    const order = this.activeOrders.get(orderId); // 定义常量 order

    // 如果订单不存在，返回失败 / If order doesn't exist, return false
    if (!order) { // 条件判断 !order
      return false; // 返回结果
    } // 结束代码块

    // 更新订单状态 / Update order status
    order.status = ORDER_STATUS.CANCELED; // 赋值 order.status
    order.updateTime = timestamp; // 赋值 order.updateTime

    // 从活跃订单中移除 / Remove from active orders
    this.activeOrders.delete(orderId); // 访问 activeOrders

    // 触发订单更新回调 / Trigger order update callback
    if (this.onOrderUpdate) { // 条件判断 this.onOrderUpdate
      this.onOrderUpdate(order, 'canceled'); // 调用 onOrderUpdate
    } // 结束代码块

    // 释放订单对象回池 / Release order back to pool
    this.orderPool.release(order); // 访问 orderPool

    return true; // 返回结果
  } // 结束代码块

  /**
   * 取消所有订单
   * Cancel all orders
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   * @param {number} timestamp - 当前时间戳 / Current timestamp
   * @returns {number} 取消的订单数量 / Number of canceled orders
   */
  cancelAllOrders(symbol, timestamp) { // 调用 cancelAllOrders
    // 计数器 / Counter
    let count = 0; // 定义变量 count

    // 遍历所有活跃订单 / Iterate all active orders
    for (const [orderId, order] of this.activeOrders) { // 循环 const [orderId, order] of this.activeOrders
      // 如果指定了交易对，跳过不匹配的 / If symbol specified, skip non-matching
      if (symbol && order.symbol !== symbol) { // 条件判断 symbol && order.symbol !== symbol
        continue; // 继续下一轮循环
      } // 结束代码块

      // 取消订单 / Cancel order
      this.cancelOrder(orderId, timestamp); // 调用 cancelOrder
      count++; // 执行语句
    } // 结束代码块

    return count; // 返回结果
  } // 结束代码块

  /**
   * 验证订单
   * Validate order
   *
   * @param {Object} order - 订单对象 / Order object
   * @returns {Object} 验证结果 / Validation result
   * @private
   */
  _validateOrder(order) { // 调用 _validateOrder
    // 验证数量 / Validate amount
    if (order.amount <= 0) { // 条件判断 order.amount <= 0
      return { valid: false, reason: 'Invalid amount' }; // 返回结果
    } // 结束代码块

    // 验证价格 (限价单) / Validate price (limit order)
    if (order.type === ORDER_TYPE.LIMIT && order.price <= 0) { // 条件判断 order.type === ORDER_TYPE.LIMIT && order.pric...
      return { valid: false, reason: 'Invalid price for limit order' }; // 返回结果
    } // 结束代码块

    // 获取持仓 / Get position
    const position = this.account.getPosition(order.symbol); // 定义常量 position

    // 验证 reduce-only / Validate reduce-only
    if (order.reduceOnly) { // 条件判断 order.reduceOnly
      // 如果无持仓，拒绝 reduce-only 订单 / If no position, reject reduce-only order
      if (position.size === 0) { // 条件判断 position.size === 0
        return { valid: false, reason: 'No position to reduce' }; // 返回结果
      } // 结束代码块

      // 如果订单方向与持仓方向相同，拒绝 / If order side same as position side, reject
      if (order.side === position.side) { // 条件判断 order.side === position.side
        return { valid: false, reason: 'Reduce-only order side matches position side' }; // 返回结果
      } // 结束代码块

      // 如果订单数量大于持仓数量，调整为持仓数量 / If order amount > position size, adjust
      if (order.amount > position.size) { // 条件判断 order.amount > position.size
        order.amount = position.size; // 赋值 order.amount
        order.remaining = position.size; // 赋值 order.remaining
      } // 结束代码块
    } // 结束代码块

    // 验证保证金 (非 reduce-only) / Validate margin (non reduce-only)
    if (!order.reduceOnly) { // 条件判断 !order.reduceOnly
      // 获取订单簿 / Get order book
      const orderBook = this.getOrderBook(order.symbol); // 定义常量 orderBook

      // 估算成交价格 / Estimate fill price
      const estimatedPrice = order.type === ORDER_TYPE.MARKET // 定义常量 estimatedPrice
        ? (order.side === SIDE.BUY ? orderBook.getBestAsk() : orderBook.getBestBid()) // 执行语句
        : order.price; // 执行语句

      // 计算所需保证金 / Calculate required margin
      const notional = order.amount * estimatedPrice; // 定义常量 notional
      const requiredMargin = notional / this.config.leverage; // 定义常量 requiredMargin

      // 检查可用余额 / Check available balance
      if (!this.account.hasEnoughMargin(requiredMargin)) { // 条件判断 !this.account.hasEnoughMargin(requiredMargin)
        return { valid: false, reason: 'Insufficient margin' }; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 验证通过 / Validation passed
    return { valid: true }; // 返回结果
  } // 结束代码块

  /**
   * 尝试执行订单
   * Try to execute order
   *
   * @param {Object} order - 订单对象 / Order object
   * @param {number} timestamp - 当前时间戳 / Current timestamp
   * @returns {boolean} 是否完全成交 / Whether fully filled
   * @private
   */
  _tryExecuteOrder(order, timestamp) { // 调用 _tryExecuteOrder
    // 获取订单簿 / Get order book
    const orderBook = this.getOrderBook(order.symbol); // 定义常量 orderBook

    // 根据订单类型执行 / Execute based on order type
    let result; // 定义变量 result

    if (order.type === ORDER_TYPE.MARKET) { // 条件判断 order.type === ORDER_TYPE.MARKET
      // 市价单直接模拟成交 / Market order simulate execution directly
      result = orderBook.simulateMarketOrder(order.side, order.remaining); // 赋值 result
    } else { // 执行语句
      // 限价单检查是否可成交 / Limit order check if can fill
      result = orderBook.checkLimitOrder(order.side, order.price, order.remaining); // 赋值 result
    } // 结束代码块

    // 如果成交成功 / If execution successful
    if (result.success) { // 条件判断 result.success
      // 处理成交 / Process fill
      this._processFill(order, result, timestamp); // 调用 _processFill
      return true; // 返回结果
    } // 结束代码块

    return false; // 返回结果
  } // 结束代码块

  /**
   * 尝试撮合活跃的限价单
   * Try to match active limit orders
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} timestamp - 当前时间戳 / Current timestamp
   * @private
   */
  _tryMatchLimitOrders(symbol, timestamp) { // 调用 _tryMatchLimitOrders
    // 获取订单簿 / Get order book
    const orderBook = this.getOrderBook(symbol); // 定义常量 orderBook

    // 遍历所有活跃订单 / Iterate all active orders
    for (const [orderId, order] of this.activeOrders) { // 循环 const [orderId, order] of this.activeOrders
      // 跳过不匹配的交易对 / Skip non-matching symbol
      if (order.symbol !== symbol) { // 条件判断 order.symbol !== symbol
        continue; // 继续下一轮循环
      } // 结束代码块

      // 检查限价单是否可成交 / Check if limit order can fill
      const result = orderBook.checkLimitOrder(order.side, order.price, order.remaining); // 定义常量 result

      // 如果可以成交 / If can fill
      if (result.success) { // 条件判断 result.success
        // 处理成交 / Process fill
        this._processFill(order, result, timestamp); // 调用 _processFill

        // 如果完全成交，从活跃订单中移除 / If fully filled, remove from active orders
        if (order.status === ORDER_STATUS.FILLED) { // 条件判断 order.status === ORDER_STATUS.FILLED
          this.activeOrders.delete(orderId); // 访问 activeOrders
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理订单成交
   * Process order fill
   *
   * @param {Object} order - 订单对象 / Order object
   * @param {Object} result - 成交结果 / Fill result
   * @param {number} timestamp - 时间戳 / Timestamp
   * @private
   */
  _processFill(order, result, timestamp) { // 调用 _processFill
    // 计算成交数量 / Calculate fill amount
    const fillAmount = result.filled; // 定义常量 fillAmount

    // 计算成交均价 / Calculate average price
    const fillPrice = result.avgPrice; // 定义常量 fillPrice

    // 判断是 maker 还是 taker / Determine if maker or taker
    // 市价单总是 taker，限价单在挂单后成交为 maker / Market orders always taker, limit orders filled after posting are maker
    const isTaker = order.type === ORDER_TYPE.MARKET || order.status === ORDER_STATUS.PENDING; // 定义常量 isTaker

    // 计算手续费 / Calculate fee
    const feeRate = isTaker ? this.config.takerFee : this.config.makerFee; // 定义常量 feeRate
    const notional = fillAmount * fillPrice; // 定义常量 notional
    const fee = notional * feeRate; // 定义常量 fee

    // 更新订单 / Update order
    order.filled += fillAmount; // 执行语句
    order.remaining -= fillAmount; // 执行语句
    order.avgPrice = (order.avgPrice * (order.filled - fillAmount) + fillPrice * fillAmount) / order.filled; // 赋值 order.avgPrice
    order.fee += fee; // 执行语句
    order.updateTime = timestamp; // 赋值 order.updateTime

    // 更新订单状态 / Update order status
    if (order.remaining <= 0) { // 条件判断 order.remaining <= 0
      order.status = ORDER_STATUS.FILLED; // 赋值 order.status
    } else { // 执行语句
      order.status = ORDER_STATUS.PARTIAL; // 赋值 order.status
    } // 结束代码块

    // 更新持仓 / Update position
    const position = this.account.getPosition(order.symbol); // 定义常量 position
    const realizedPnl = position.update(order.side, fillAmount, fillPrice, this.config); // 定义常量 realizedPnl

    // 更新订单已实现盈亏 / Update order realized PnL
    order.realizedPnl += realizedPnl; // 执行语句

    // 更新账户 / Update account
    this.account.deductFee(fee); // 访问 account
    if (realizedPnl !== 0) { // 条件判断 realizedPnl !== 0
      this.account.addRealizedPnl(realizedPnl); // 访问 account
    } // 结束代码块

    // 更新持仓手续费 / Update position trading fee
    position.tradingFee += fee; // 执行语句

    // 记录成交订单 / Record filled order
    if (order.status === ORDER_STATUS.FILLED) { // 条件判断 order.status === ORDER_STATUS.FILLED
      this.filledOrders.push({ // 访问 filledOrders
        id: order.id, // ID
        symbol: order.symbol, // 交易对
        side: order.side, // 方向
        type: order.type, // 类型
        price: order.avgPrice, // 价格
        amount: order.filled, // 数量
        fee: order.fee, // 手续费
        realizedPnl: order.realizedPnl, // 已实现盈亏
        timestamp: timestamp, // 时间戳
      }); // 结束代码块
    } // 结束代码块

    // 触发成交回调 / Trigger fill callback
    if (this.onFill) { // 条件判断 this.onFill
      this.onFill({ // 调用 onFill
        orderId: order.id, // 订单ID
        symbol: order.symbol, // 交易对
        side: order.side, // 方向
        price: fillPrice, // 价格
        amount: fillAmount, // 数量
        fee, // 执行语句
        realizedPnl, // 执行语句
        slippage: result.slippage, // 滑点
        timestamp, // 执行语句
      }); // 结束代码块
    } // 结束代码块

    // 触发订单更新回调 / Trigger order update callback
    if (this.onOrderUpdate) { // 条件判断 this.onOrderUpdate
      this.onOrderUpdate(order, 'filled'); // 调用 onOrderUpdate
    } // 结束代码块
  } // 结束代码块

  /**
   * 重置撮合引擎
   * Reset matching engine
   */
  reset() { // 调用 reset
    // 清空订单簿 / Clear order books
    this.orderBooks.clear(); // 访问 orderBooks

    // 释放所有活跃订单回池 / Release all active orders to pool
    for (const order of this.activeOrders.values()) { // 循环 const order of this.activeOrders.values()
      this.orderPool.release(order); // 访问 orderPool
    } // 结束代码块
    this.activeOrders.clear(); // 访问 activeOrders

    // 清空历史订单 / Clear filled orders
    this.filledOrders = []; // 设置 filledOrders

    // 重置计数器 / Reset counter
    this.orderIdCounter = 0; // 设置 orderIdCounter
  } // 结束代码块
} // 结束代码块

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
class BaseStrategy { // 定义类 BaseStrategy
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} params - 策略参数 / Strategy parameters
   */
  constructor(params = {}) { // 构造函数
    // 策略参数 / Strategy parameters
    this.params = params; // 设置 params

    // 策略名称 / Strategy name
    this.name = params.name || 'BaseStrategy'; // 设置 name

    // 回测引擎引用 (由引擎设置) / Backtest engine reference (set by engine)
    this.engine = null; // 设置 engine

    // 是否已初始化 / Whether initialized
    this.initialized = false; // 设置 initialized
  } // 结束代码块

  /**
   * 初始化策略 (由回测引擎调用)
   * Initialize strategy (called by backtest engine)
   *
   * @param {BacktestEngine} engine - 回测引擎 / Backtest engine
   */
  init(engine) { // 调用 init
    // 保存引擎引用 / Save engine reference
    this.engine = engine; // 设置 engine

    // 标记为已初始化 / Mark as initialized
    this.initialized = true; // 设置 initialized

    // 调用子类的 onInit 方法 / Call subclass onInit method
    this.onInit(); // 调用 onInit
  } // 结束代码块

  /**
   * 策略初始化回调 (子类实现)
   * Strategy initialization callback (implement in subclass)
   */
  onInit() { // 调用 onInit
    // 子类实现 / Implement in subclass
  } // 结束代码块

  /**
   * 处理成交事件 (子类实现)
   * Handle trade event (implement in subclass)
   *
   * @param {Object} trade - 成交数据 / Trade data
   */
  onTrade(trade) { // 调用 onTrade
    // 子类实现 / Implement in subclass
  } // 结束代码块

  /**
   * 处理深度事件 (子类实现)
   * Handle depth event (implement in subclass)
   *
   * @param {Object} depth - 深度数据 / Depth data
   */
  onDepth(depth) { // 调用 onDepth
    // 子类实现 / Implement in subclass
  } // 结束代码块

  /**
   * 处理资金费率事件 (子类实现)
   * Handle funding event (implement in subclass)
   *
   * @param {Object} funding - 资金费率数据 / Funding rate data
   */
  onFunding(funding) { // 调用 onFunding
    // 子类实现 / Implement in subclass
  } // 结束代码块

  /**
   * 处理K线事件 (子类实现)
   * Handle kline event (implement in subclass)
   *
   * @param {Object} kline - K线数据 / Kline data
   */
  onKline(kline) { // 调用 onKline
    // 子类实现 / Implement in subclass
  } // 结束代码块

  /**
   * 处理订单成交事件 (子类实现)
   * Handle order fill event (implement in subclass)
   *
   * @param {Object} fill - 成交数据 / Fill data
   */
  onOrderFill(fill) { // 调用 onOrderFill
    // 子类实现 / Implement in subclass
  } // 结束代码块

  /**
   * 处理订单更新事件 (子类实现)
   * Handle order update event (implement in subclass)
   *
   * @param {Object} order - 订单数据 / Order data
   * @param {string} reason - 更新原因 / Update reason
   */
  onOrderUpdate(order, reason) { // 调用 onOrderUpdate
    // 子类实现 / Implement in subclass
  } // 结束代码块

  /**
   * 回测结束回调 (子类实现)
   * Backtest end callback (implement in subclass)
   *
   * @param {Object} result - 回测结果 / Backtest result
   */
  onEnd(result) { // 调用 onEnd
    // 子类实现 / Implement in subclass
  } // 结束代码块

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
  marketBuy(symbol, amount, options = {}) { // 调用 marketBuy
    return this.engine.submitOrder({ // 返回结果
      symbol, // 执行语句
      side: SIDE.BUY, // 方向
      type: ORDER_TYPE.MARKET, // 类型
      amount, // 执行语句
      ...options, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 提交市价卖单
   * Submit market sell order
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @returns {Object} 订单 / Order
   */
  marketSell(symbol, amount, options = {}) { // 调用 marketSell
    return this.engine.submitOrder({ // 返回结果
      symbol, // 执行语句
      side: SIDE.SELL, // 方向
      type: ORDER_TYPE.MARKET, // 类型
      amount, // 执行语句
      ...options, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

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
  limitBuy(symbol, price, amount, options = {}) { // 调用 limitBuy
    return this.engine.submitOrder({ // 返回结果
      symbol, // 执行语句
      side: SIDE.BUY, // 方向
      type: ORDER_TYPE.LIMIT, // 类型
      price, // 执行语句
      amount, // 执行语句
      ...options, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

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
  limitSell(symbol, price, amount, options = {}) { // 调用 limitSell
    return this.engine.submitOrder({ // 返回结果
      symbol, // 执行语句
      side: SIDE.SELL, // 方向
      type: ORDER_TYPE.LIMIT, // 类型
      price, // 执行语句
      amount, // 执行语句
      ...options, // 展开对象或数组
    }); // 结束代码块
  } // 结束代码块

  /**
   * 取消订单
   * Cancel order
   *
   * @param {number} orderId - 订单ID / Order ID
   * @returns {boolean} 是否成功 / Whether successful
   */
  cancelOrder(orderId) { // 调用 cancelOrder
    return this.engine.cancelOrder(orderId); // 返回结果
  } // 结束代码块

  /**
   * 取消所有订单
   * Cancel all orders
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   * @returns {number} 取消数量 / Cancel count
   */
  cancelAllOrders(symbol) { // 调用 cancelAllOrders
    return this.engine.cancelAllOrders(symbol); // 返回结果
  } // 结束代码块

  /**
   * 平掉所有持仓
   * Close all positions
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   */
  closeAllPositions(symbol) { // 调用 closeAllPositions
    this.engine.closeAllPositions(symbol); // 访问 engine
  } // 结束代码块

  // ============================================
  // 查询 API / Query API
  // ============================================

  /**
   * 获取当前时间戳
   * Get current timestamp
   *
   * @returns {number} 时间戳 / Timestamp
   */
  getTime() { // 调用 getTime
    return this.engine.currentTime; // 返回结果
  } // 结束代码块

  /**
   * 获取账户信息
   * Get account info
   *
   * @returns {Object} 账户快照 / Account snapshot
   */
  getAccount() { // 调用 getAccount
    return this.engine.account.getSnapshot(); // 返回结果
  } // 结束代码块

  /**
   * 获取持仓
   * Get position
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 持仓快照 / Position snapshot
   */
  getPosition(symbol) { // 调用 getPosition
    const position = this.engine.account.getPosition(symbol); // 定义常量 position
    return position.clone(); // 返回结果
  } // 结束代码块

  /**
   * 获取订单簿
   * Get order book
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 订单簿 / Order book
   */
  getOrderBook(symbol) { // 调用 getOrderBook
    const orderBook = this.engine.matchingEngine.getOrderBook(symbol); // 定义常量 orderBook
    return { // 返回结果
      symbol, // 执行语句
      bids: orderBook.bids.slice(0, 20), // bids
      asks: orderBook.asks.slice(0, 20), // asks
      midPrice: orderBook.getMidPrice(), // mid价格
      lastPrice: orderBook.lastPrice, // last价格
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取活跃订单
   * Get active orders
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   * @returns {Array} 活跃订单列表 / Active order list
   */
  getActiveOrders(symbol) { // 调用 getActiveOrders
    const orders = []; // 定义常量 orders
    for (const order of this.engine.matchingEngine.activeOrders.values()) { // 循环 const order of this.engine.matchingEngine.act...
      if (!symbol || order.symbol === symbol) { // 条件判断 !symbol || order.symbol === symbol
        orders.push({ ...order }); // 调用 orders.push
      } // 结束代码块
    } // 结束代码块
    return orders; // 返回结果
  } // 结束代码块
} // 结束代码块

// ============================================
// 回测引擎 / Backtest Engine
// ============================================

/**
 * 高性能事件驱动回测引擎
 * High-performance event-driven backtest engine
 */
class BacktestEngine { // 定义类 BacktestEngine
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 合并配置 / Merge config
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 创建账户 / Create account
    this.account = new Account(this.config); // 设置 account

    // 创建撮合引擎 / Create matching engine
    this.matchingEngine = new MatchingEngine(this.config, this.account); // 设置 matchingEngine

    // 策略实例 / Strategy instance
    this.strategy = null; // 设置 strategy

    // 事件队列 (预排序的事件数组) / Event queue (pre-sorted event array)
    this.events = []; // 设置 events

    // 当前事件索引 / Current event index
    this.eventIndex = 0; // 设置 eventIndex

    // 当前时间戳 / Current timestamp
    this.currentTime = 0; // 设置 currentTime

    // 上次资金费率时间 / Last funding time
    this.lastFundingTime = 0; // 设置 lastFundingTime

    // 资金费率数据 { symbol: rate } / Funding rate data
    this.fundingRates = new Map(); // 设置 fundingRates

    // 回测结果 / Backtest result
    this.result = null; // 设置 result

    // 权益曲线 / Equity curve
    this.equityCurve = []; // 设置 equityCurve

    // 交易记录 / Trade records
    this.trades = []; // 设置 trades

    // 性能统计 / Performance stats
    this.perfStats = { // 设置 perfStats
      startTime: 0,              // 回测开始时间 / Backtest start time
      endTime: 0,                // 回测结束时间 / Backtest end time
      eventsProcessed: 0,        // 处理的事件数 / Events processed
      ordersSubmitted: 0,        // 提交的订单数 / Orders submitted
      ordersFilled: 0,           // 成交的订单数 / Orders filled
    }; // 结束代码块

    // 设置撮合引擎回调 / Set matching engine callbacks
    this._setupCallbacks(); // 调用 _setupCallbacks
  } // 结束代码块

  /**
   * 设置撮合引擎回调
   * Setup matching engine callbacks
   * @private
   */
  _setupCallbacks() { // 调用 _setupCallbacks
    // 成交回调 / Fill callback
    this.matchingEngine.onFill = (fill) => { // 访问 matchingEngine
      // 记录交易 / Record trade
      this.trades.push(fill); // 访问 trades

      // 更新性能统计 / Update performance stats
      this.perfStats.ordersFilled++; // 访问 perfStats

      // 通知策略 / Notify strategy
      if (this.strategy) { // 条件判断 this.strategy
        this.strategy.onOrderFill(fill); // 访问 strategy
      } // 结束代码块
    }; // 结束代码块

    // 订单更新回调 / Order update callback
    this.matchingEngine.onOrderUpdate = (order, reason) => { // 访问 matchingEngine
      // 通知策略 / Notify strategy
      if (this.strategy) { // 条件判断 this.strategy
        this.strategy.onOrderUpdate(order, reason); // 访问 strategy
      } // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 设置策略
   * Set strategy
   *
   * @param {BaseStrategy} strategy - 策略实例 / Strategy instance
   */
  setStrategy(strategy) { // 调用 setStrategy
    // 保存策略引用 / Save strategy reference
    this.strategy = strategy; // 设置 strategy

    // 初始化策略 / Initialize strategy
    strategy.init(this); // 调用 strategy.init
  } // 结束代码块

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
  loadEvents(events) { // 调用 loadEvents
    // 保存事件 / Save events
    this.events = events; // 设置 events

    // 按时间戳排序 (如果未排序) / Sort by timestamp (if not sorted)
    // 使用快速检查避免不必要的排序 / Use quick check to avoid unnecessary sort
    let needsSort = false; // 定义变量 needsSort
    for (let i = 1; i < events.length; i++) { // 循环 let i = 1; i < events.length; i++
      if (events[i].timestamp < events[i - 1].timestamp) { // 条件判断 events[i].timestamp < events[i - 1].timestamp
        needsSort = true; // 赋值 needsSort
        break; // 跳出循环或分支
      } // 结束代码块
    } // 结束代码块

    if (needsSort) { // 条件判断 needsSort
      // 使用原生排序 / Use native sort
      this.events.sort((a, b) => a.timestamp - b.timestamp); // 访问 events
    } // 结束代码块

    console.log(`[BacktestEngine] 已加载 ${events.length} 个事件`); // 控制台输出
  } // 结束代码块

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
  loadTrades(symbol, trades) { // 调用 loadTrades
    // 转换为事件格式 / Convert to event format
    const events = trades.map(trade => ({ // 定义函数 events
      type: EVENT_TYPE.TRADE, // 类型
      timestamp: trade[0], // 时间戳
      symbol, // 执行语句
      data: { // 数据
        price: trade[1], // 价格
        amount: trade[2], // 数量
        side: trade[3], // 方向
      }, // 结束代码块
    })); // 结束代码块

    // 合并到事件队列 / Merge into event queue
    this.events = this.events.concat(events); // 设置 events
  } // 结束代码块

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
  loadDepthSnapshots(symbol, snapshots) { // 调用 loadDepthSnapshots
    // 转换为事件格式 / Convert to event format
    const events = snapshots.map(snapshot => ({ // 定义函数 events
      type: EVENT_TYPE.DEPTH, // 类型
      timestamp: snapshot.timestamp, // 时间戳
      symbol, // 执行语句
      data: { // 数据
        bids: snapshot.bids, // bids
        asks: snapshot.asks, // asks
      }, // 结束代码块
    })); // 结束代码块

    // 合并到事件队列 / Merge into event queue
    this.events = this.events.concat(events); // 设置 events
  } // 结束代码块

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
  loadFundingRates(symbol, fundingRates) { // 调用 loadFundingRates
    // 转换为事件格式 / Convert to event format
    const events = fundingRates.map(funding => ({ // 定义函数 events
      type: EVENT_TYPE.FUNDING, // 类型
      timestamp: funding[0], // 时间戳
      symbol, // 执行语句
      data: { // 数据
        rate: funding[1], // 频率
      }, // 结束代码块
    })); // 结束代码块

    // 合并到事件队列 / Merge into event queue
    this.events = this.events.concat(events); // 设置 events
  } // 结束代码块

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
  loadKlines(symbol, klines) { // 调用 loadKlines
    // 转换为事件格式 / Convert to event format
    const events = klines.map(kline => ({ // 定义函数 events
      type: EVENT_TYPE.KLINE, // 类型
      timestamp: kline[0], // 时间戳
      symbol, // 执行语句
      data: { // 数据
        open: kline[1], // 开盘
        high: kline[2], // 最高
        low: kline[3], // 最低
        close: kline[4], // 收盘
        volume: kline[5], // 成交量
      }, // 结束代码块
    })); // 结束代码块

    // 合并到事件队列 / Merge into event queue
    this.events = this.events.concat(events); // 设置 events
  } // 结束代码块

  /**
   * 运行回测
   * Run backtest
   *
   * @returns {Object} 回测结果 / Backtest result
   */
  run() { // 调用 run
    // 检查是否已设置策略 / Check if strategy is set
    if (!this.strategy) { // 条件判断 !this.strategy
      throw new Error('未设置策略 / Strategy not set'); // 抛出异常
    } // 结束代码块

    // 检查是否已加载事件 / Check if events are loaded
    if (this.events.length === 0) { // 条件判断 this.events.length === 0
      throw new Error('未加载事件数据 / No events loaded'); // 抛出异常
    } // 结束代码块

    // 对所有事件排序 / Sort all events
    this.events.sort((a, b) => a.timestamp - b.timestamp); // 访问 events

    // 记录开始时间 / Record start time
    this.perfStats.startTime = Date.now(); // 访问 perfStats

    console.log(`[BacktestEngine] 开始回测，共 ${this.events.length} 个事件...`); // 控制台输出

    // 重置事件索引 / Reset event index
    this.eventIndex = 0; // 设置 eventIndex

    // 设置初始时间 / Set initial time
    this.currentTime = this.events[0].timestamp; // 设置 currentTime
    this.lastFundingTime = this.currentTime; // 设置 lastFundingTime

    // 获取批处理大小 / Get batch size
    const batchSize = this.config.eventBatchSize; // 定义常量 batchSize

    // 上次记录权益的时间 / Last equity record time
    let lastEquityTime = this.currentTime; // 定义变量 lastEquityTime

    // 权益记录间隔 (1小时) / Equity record interval (1 hour)
    const equityInterval = 60 * 60 * 1000; // 定义常量 equityInterval

    // 事件处理主循环 / Main event processing loop
    while (this.eventIndex < this.events.length) { // 循环条件 this.eventIndex < this.events.length
      // 批量处理事件以提高性能 / Process events in batches for performance
      const endIndex = Math.min(this.eventIndex + batchSize, this.events.length); // 定义常量 endIndex

      // 处理当前批次的事件 / Process current batch of events
      for (let i = this.eventIndex; i < endIndex; i++) { // 循环 let i = this.eventIndex; i < endIndex; i++
        // 获取当前事件 / Get current event
        const event = this.events[i]; // 定义常量 event

        // 更新当前时间 / Update current time
        this.currentTime = event.timestamp; // 设置 currentTime

        // 检查资金费率结算 / Check funding rate settlement
        this._checkFundingSettlement(); // 调用 _checkFundingSettlement

        // 检查强平 / Check liquidation
        this._checkLiquidation(); // 调用 _checkLiquidation

        // 处理事件 / Process event
        this._processEvent(event); // 调用 _processEvent

        // 更新性能统计 / Update performance stats
        this.perfStats.eventsProcessed++; // 访问 perfStats

        // 定期记录权益曲线 / Periodically record equity curve
        if (this.currentTime - lastEquityTime >= equityInterval) { // 条件判断 this.currentTime - lastEquityTime >= equityIn...
          this._recordEquity(); // 调用 _recordEquity
          lastEquityTime = this.currentTime; // 赋值 lastEquityTime
        } // 结束代码块
      } // 结束代码块

      // 更新事件索引 / Update event index
      this.eventIndex = endIndex; // 设置 eventIndex
    } // 结束代码块

    // 记录最终权益 / Record final equity
    this._recordEquity(); // 调用 _recordEquity

    // 记录结束时间 / Record end time
    this.perfStats.endTime = Date.now(); // 访问 perfStats

    // 计算回测结果 / Calculate backtest result
    this.result = this._calculateResult(); // 设置 result

    // 通知策略回测结束 / Notify strategy backtest ended
    if (this.strategy) { // 条件判断 this.strategy
      this.strategy.onEnd(this.result); // 访问 strategy
    } // 结束代码块

    // 打印回测统计 / Print backtest stats
    this._printStats(); // 调用 _printStats

    // 返回结果 / Return result
    return this.result; // 返回结果
  } // 结束代码块

  /**
   * 处理单个事件
   * Process single event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processEvent(event) { // 调用 _processEvent
    // 根据事件类型分发处理 / Dispatch based on event type
    switch (event.type) { // 分支选择 event.type
      case EVENT_TYPE.TRADE: // 分支 EVENT_TYPE.TRADE
        // 处理成交事件 / Process trade event
        this._processTrade(event); // 调用 _processTrade
        break; // 跳出循环或分支

      case EVENT_TYPE.DEPTH: // 分支 EVENT_TYPE.DEPTH
        // 处理深度事件 / Process depth event
        this._processDepth(event); // 调用 _processDepth
        break; // 跳出循环或分支

      case EVENT_TYPE.FUNDING: // 分支 EVENT_TYPE.FUNDING
        // 处理资金费率事件 / Process funding event
        this._processFunding(event); // 调用 _processFunding
        break; // 跳出循环或分支

      case EVENT_TYPE.KLINE: // 分支 EVENT_TYPE.KLINE
        // 处理K线事件 / Process kline event
        this._processKline(event); // 调用 _processKline
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理成交事件
   * Process trade event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processTrade(event) { // 调用 _processTrade
    // 更新最新成交价 / Update last price
    this.matchingEngine.updateLastPrice( // 访问 matchingEngine
      event.symbol, // 执行语句
      event.data.price, // 执行语句
      event.timestamp // 执行语句
    ); // 结束调用或参数

    // 通知策略 / Notify strategy
    if (this.strategy) { // 条件判断 this.strategy
      this.strategy.onTrade({ // 访问 strategy
        symbol: event.symbol, // 交易对
        price: event.data.price, // 价格
        amount: event.data.amount, // 数量
        side: event.data.side, // 方向
        timestamp: event.timestamp, // 时间戳
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理深度事件
   * Process depth event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processDepth(event) { // 调用 _processDepth
    // 更新订单簿 / Update order book
    this.matchingEngine.updateOrderBook( // 访问 matchingEngine
      event.symbol, // 执行语句
      event.data.bids, // 执行语句
      event.data.asks, // 执行语句
      event.timestamp // 执行语句
    ); // 结束调用或参数

    // 通知策略 / Notify strategy
    if (this.strategy) { // 条件判断 this.strategy
      this.strategy.onDepth({ // 访问 strategy
        symbol: event.symbol, // 交易对
        bids: event.data.bids, // bids
        asks: event.data.asks, // asks
        timestamp: event.timestamp, // 时间戳
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理资金费率事件
   * Process funding rate event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processFunding(event) { // 调用 _processFunding
    // 更新资金费率 / Update funding rate
    this.fundingRates.set(event.symbol, event.data.rate); // 访问 fundingRates

    // 通知策略 / Notify strategy
    if (this.strategy) { // 条件判断 this.strategy
      this.strategy.onFunding({ // 访问 strategy
        symbol: event.symbol, // 交易对
        rate: event.data.rate, // 频率
        timestamp: event.timestamp, // 时间戳
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理K线事件
   * Process kline event
   *
   * @param {Object} event - 事件对象 / Event object
   * @private
   */
  _processKline(event) { // 调用 _processKline
    // 使用收盘价更新最新价 / Update last price with close price
    this.matchingEngine.updateLastPrice( // 访问 matchingEngine
      event.symbol, // 执行语句
      event.data.close, // 执行语句
      event.timestamp // 执行语句
    ); // 结束调用或参数

    // 通知策略 / Notify strategy
    if (this.strategy) { // 条件判断 this.strategy
      this.strategy.onKline({ // 访问 strategy
        symbol: event.symbol, // 交易对
        open: event.data.open, // 开盘
        high: event.data.high, // 最高
        low: event.data.low, // 最低
        close: event.data.close, // 收盘
        volume: event.data.volume, // 成交量
        timestamp: event.timestamp, // 时间戳
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查资金费率结算
   * Check funding rate settlement
   * @private
   */
  _checkFundingSettlement() { // 调用 _checkFundingSettlement
    // 获取资金费率结算间隔 / Get funding interval
    const interval = this.config.fundingInterval; // 定义常量 interval

    // 检查是否到达结算时间 / Check if reached settlement time
    if (this.currentTime - this.lastFundingTime >= interval) { // 条件判断 this.currentTime - this.lastFundingTime >= in...
      // 结算资金费用 / Settle funding fees
      this._settleFunding(); // 调用 _settleFunding

      // 更新上次结算时间 / Update last settlement time
      this.lastFundingTime = this.currentTime; // 设置 lastFundingTime
    } // 结束代码块
  } // 结束代码块

  /**
   * 结算资金费用
   * Settle funding fees
   * @private
   */
  _settleFunding() { // 调用 _settleFunding
    // 遍历所有持仓 / Iterate all positions
    for (const [symbol, position] of this.account.positions) { // 循环 const [symbol, position] of this.account.posi...
      // 跳过空仓 / Skip empty positions
      if (position.size === 0) { // 条件判断 position.size === 0
        continue; // 继续下一轮循环
      } // 结束代码块

      // 获取资金费率 / Get funding rate
      const fundingRate = this.fundingRates.get(symbol) || 0; // 定义常量 fundingRate

      // 跳过零费率 / Skip zero rate
      if (fundingRate === 0) { // 条件判断 fundingRate === 0
        continue; // 继续下一轮循环
      } // 结束代码块

      // 应用资金费率 / Apply funding rate
      const fee = position.applyFundingRate(fundingRate); // 定义常量 fee

      // 从账户扣除 / Deduct from account
      this.account.deductFundingFee(fee); // 访问 account
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查强平
   * Check liquidation
   * @private
   */
  _checkLiquidation() { // 调用 _checkLiquidation
    // 遍历所有持仓 / Iterate all positions
    for (const position of this.account.positions.values()) { // 循环 const position of this.account.positions.valu...
      // 跳过空仓 / Skip empty positions
      if (position.size === 0) { // 条件判断 position.size === 0
        continue; // 继续下一轮循环
      } // 结束代码块

      // 检查是否需要强平 / Check if need to liquidate
      if (position.shouldLiquidate(position.markPrice)) { // 条件判断 position.shouldLiquidate(position.markPrice)
        // 执行强平 / Execute liquidation
        this.account.liquidate(position, position.markPrice); // 访问 account

        console.log(`[BacktestEngine] 强平: ${position.symbol} @ ${position.markPrice}`); // 控制台输出
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录权益
   * Record equity
   * @private
   */
  _recordEquity() { // 调用 _recordEquity
    // 更新账户状态 / Update account state
    this.account.updateState(); // 访问 account

    // 记录权益点 / Record equity point
    this.equityCurve.push({ // 访问 equityCurve
      timestamp: this.currentTime, // 时间戳
      equity: this.account.equity, // equity
      balance: this.account.balance, // 余额
      unrealizedPnl: this.account.unrealizedPnl, // 未实现盈亏
    }); // 结束代码块
  } // 结束代码块

  /**
   * 提交订单 (供策略调用)
   * Submit order (for strategy)
   *
   * @param {Object} params - 订单参数 / Order parameters
   * @returns {Object} 订单对象 / Order object
   */
  submitOrder(params) { // 调用 submitOrder
    // 更新性能统计 / Update performance stats
    this.perfStats.ordersSubmitted++; // 访问 perfStats

    // 提交到撮合引擎 / Submit to matching engine
    return this.matchingEngine.submitOrder(params, this.currentTime); // 返回结果
  } // 结束代码块

  /**
   * 取消订单 (供策略调用)
   * Cancel order (for strategy)
   *
   * @param {number} orderId - 订单ID / Order ID
   * @returns {boolean} 是否成功 / Whether successful
   */
  cancelOrder(orderId) { // 调用 cancelOrder
    return this.matchingEngine.cancelOrder(orderId, this.currentTime); // 返回结果
  } // 结束代码块

  /**
   * 取消所有订单 (供策略调用)
   * Cancel all orders (for strategy)
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   * @returns {number} 取消数量 / Cancel count
   */
  cancelAllOrders(symbol) { // 调用 cancelAllOrders
    return this.matchingEngine.cancelAllOrders(symbol, this.currentTime); // 返回结果
  } // 结束代码块

  /**
   * 平掉所有持仓 (供策略调用)
   * Close all positions (for strategy)
   *
   * @param {string} symbol - 交易对 (可选) / Symbol (optional)
   */
  closeAllPositions(symbol) { // 调用 closeAllPositions
    // 遍历所有持仓 / Iterate all positions
    for (const [sym, position] of this.account.positions) { // 循环 const [sym, position] of this.account.positions
      // 如果指定了交易对，跳过不匹配的 / If symbol specified, skip non-matching
      if (symbol && sym !== symbol) { // 条件判断 symbol && sym !== symbol
        continue; // 继续下一轮循环
      } // 结束代码块

      // 跳过空仓 / Skip empty positions
      if (position.size === 0) { // 条件判断 position.size === 0
        continue; // 继续下一轮循环
      } // 结束代码块

      // 提交市价平仓单 / Submit market close order
      this.submitOrder({ // 调用 submitOrder
        symbol: sym, // 交易对
        side: position.side === POSITION_SIDE.LONG ? SIDE.SELL : SIDE.BUY, // 方向
        type: ORDER_TYPE.MARKET, // 类型
        amount: position.size, // 数量
        reduceOnly: true, // 减仓仅
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算回测结果
   * Calculate backtest result
   *
   * @returns {Object} 回测结果 / Backtest result
   * @private
   */
  _calculateResult() { // 调用 _calculateResult
    // 更新最终账户状态 / Update final account state
    this.account.updateState(); // 访问 account

    // 获取账户快照 / Get account snapshot
    const account = this.account.getSnapshot(); // 定义常量 account

    // 计算收益率 / Calculate return
    const totalReturn = (account.equity - this.config.initialCapital) / this.config.initialCapital; // 定义常量 totalReturn

    // 计算交易统计 / Calculate trade statistics
    const tradeStats = this._calculateTradeStats(); // 定义常量 tradeStats

    // 计算风险指标 / Calculate risk metrics
    const riskMetrics = this._calculateRiskMetrics(); // 定义常量 riskMetrics

    // 构建回测结果 / Build backtest result
    return { // 返回结果
      // 基本信息 / Basic info
      startTime: this.events[0]?.timestamp, // 启动时间
      endTime: this.events[this.events.length - 1]?.timestamp, // end时间
      duration: this.perfStats.endTime - this.perfStats.startTime, // duration

      // 账户结果 / Account result
      initialCapital: this.config.initialCapital, // 初始资金
      finalEquity: account.equity, // finalEquity
      finalBalance: account.balance, // final余额
      totalReturn, // 执行语句
      totalReturnPct: (totalReturn * 100).toFixed(2) + '%', // 总ReturnPct

      // 盈亏统计 / PnL statistics
      realizedPnl: account.realizedPnl, // 已实现盈亏
      unrealizedPnl: account.unrealizedPnl, // 未实现盈亏
      totalFees: account.totalFees, // 总Fees
      totalFundingFees: account.totalFundingFees, // 总资金费率Fees

      // 交易统计 / Trade statistics
      ...tradeStats, // 展开对象或数组

      // 风险指标 / Risk metrics
      ...riskMetrics, // 展开对象或数组

      // 性能统计 / Performance stats
      eventsProcessed: this.perfStats.eventsProcessed, // eventsProcessed
      ordersSubmitted: this.perfStats.ordersSubmitted, // 订单Submitted
      ordersFilled: this.perfStats.ordersFilled, // 订单Filled
      liquidationCount: account.liquidationCount, // 强平数量

      // 详细数据 / Detailed data
      equityCurve: this.equityCurve, // equityCurve
      trades: this.trades, // 成交
      finalPositions: account.positions, // final持仓
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算交易统计
   * Calculate trade statistics
   *
   * @returns {Object} 交易统计 / Trade statistics
   * @private
   */
  _calculateTradeStats() { // 调用 _calculateTradeStats
    // 获取成交订单 / Get filled orders
    const filledOrders = this.matchingEngine.filledOrders; // 定义常量 filledOrders

    // 如果没有成交，返回空统计 / If no fills, return empty stats
    if (filledOrders.length === 0) { // 条件判断 filledOrders.length === 0
      return { // 返回结果
        totalTrades: 0, // 总成交
        winningTrades: 0, // winning成交
        losingTrades: 0, // losing成交
        winRate: 0, // win频率
        avgWin: 0, // avgWin
        avgLoss: 0, // avg亏损
        profitFactor: 0, // 盈利Factor
        avgTradeReturn: 0, // avg交易Return
      }; // 结束代码块
    } // 结束代码块

    // 统计盈亏交易 / Count winning/losing trades
    let winningTrades = 0; // 定义变量 winningTrades
    let losingTrades = 0; // 定义变量 losingTrades
    let totalWin = 0; // 定义变量 totalWin
    let totalLoss = 0; // 定义变量 totalLoss

    // 遍历成交订单 / Iterate filled orders
    for (const order of filledOrders) { // 循环 const order of filledOrders
      if (order.realizedPnl > 0) { // 条件判断 order.realizedPnl > 0
        winningTrades++; // 执行语句
        totalWin += order.realizedPnl; // 执行语句
      } else if (order.realizedPnl < 0) { // 执行语句
        losingTrades++; // 执行语句
        totalLoss += Math.abs(order.realizedPnl); // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 计算胜率 / Calculate win rate
    const winRate = filledOrders.length > 0 // 定义常量 winRate
      ? (winningTrades / filledOrders.length * 100) // 执行语句
      : 0; // 执行语句

    // 计算平均盈亏 / Calculate average win/loss
    const avgWin = winningTrades > 0 ? totalWin / winningTrades : 0; // 定义常量 avgWin
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0; // 定义常量 avgLoss

    // 计算盈亏比 / Calculate profit factor
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0; // 定义常量 profitFactor

    // 计算平均交易收益 / Calculate average trade return
    const totalPnl = totalWin - totalLoss; // 定义常量 totalPnl
    const avgTradeReturn = filledOrders.length > 0 ? totalPnl / filledOrders.length : 0; // 定义常量 avgTradeReturn

    return { // 返回结果
      totalTrades: filledOrders.length, // 总成交
      winningTrades, // 执行语句
      losingTrades, // 执行语句
      winRate: winRate.toFixed(2) + '%', // win频率
      avgWin, // 执行语句
      avgLoss, // 执行语句
      profitFactor: profitFactor.toFixed(2), // 盈利Factor
      avgTradeReturn, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算风险指标
   * Calculate risk metrics
   *
   * @returns {Object} 风险指标 / Risk metrics
   * @private
   */
  _calculateRiskMetrics() { // 调用 _calculateRiskMetrics
    // 如果权益曲线为空，返回空指标 / If equity curve empty, return empty metrics
    if (this.equityCurve.length < 2) { // 条件判断 this.equityCurve.length < 2
      return { // 返回结果
        maxDrawdown: 0, // 最大回撤
        maxDrawdownPct: '0%', // 最大回撤Pct
        sharpeRatio: 0, // sharpe比例
        sortinoRatio: 0, // sortino比例
        calmarRatio: 0, // calmar比例
      }; // 结束代码块
    } // 结束代码块

    // 计算收益率序列 / Calculate return series
    const returns = []; // 定义常量 returns
    for (let i = 1; i < this.equityCurve.length; i++) { // 循环 let i = 1; i < this.equityCurve.length; i++
      const prevEquity = this.equityCurve[i - 1].equity; // 定义常量 prevEquity
      const currEquity = this.equityCurve[i].equity; // 定义常量 currEquity
      returns.push((currEquity - prevEquity) / prevEquity); // 调用 returns.push
    } // 结束代码块

    // 计算最大回撤 / Calculate max drawdown
    let maxDrawdown = 0; // 定义变量 maxDrawdown
    let peak = this.equityCurve[0].equity; // 定义变量 peak

    for (const point of this.equityCurve) { // 循环 const point of this.equityCurve
      if (point.equity > peak) { // 条件判断 point.equity > peak
        peak = point.equity; // 赋值 peak
      } // 结束代码块
      const drawdown = (peak - point.equity) / peak; // 定义常量 drawdown
      if (drawdown > maxDrawdown) { // 条件判断 drawdown > maxDrawdown
        maxDrawdown = drawdown; // 赋值 maxDrawdown
      } // 结束代码块
    } // 结束代码块

    // 计算夏普比率 / Calculate Sharpe ratio
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length; // 定义函数 avgReturn
    const stdDev = Math.sqrt( // 定义常量 stdDev
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length // 调用 returns.reduce
    ); // 结束调用或参数

    // 年化因子 (假设每小时一个数据点) / Annualization factor (assuming hourly data)
    const annualFactor = Math.sqrt(365 * 24); // 定义常量 annualFactor
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * annualFactor : 0; // 定义常量 sharpeRatio

    // 计算 Sortino 比率 (只考虑下行风险) / Calculate Sortino ratio (downside risk only)
    const negativeReturns = returns.filter(r => r < 0); // 定义函数 negativeReturns
    const downsideDev = negativeReturns.length > 0 // 定义常量 downsideDev
      ? Math.sqrt(negativeReturns.reduce((sum, r) => sum + r * r, 0) / negativeReturns.length) // 定义箭头函数
      : 0; // 执行语句
    const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * annualFactor : 0; // 定义常量 sortinoRatio

    // 计算 Calmar 比率 / Calculate Calmar ratio
    const totalReturn = (this.account.equity - this.config.initialCapital) / this.config.initialCapital; // 定义常量 totalReturn
    const calmarRatio = maxDrawdown > 0 ? totalReturn / maxDrawdown : 0; // 定义常量 calmarRatio

    return { // 返回结果
      maxDrawdown, // 执行语句
      maxDrawdownPct: (maxDrawdown * 100).toFixed(2) + '%', // 最大回撤Pct
      sharpeRatio: sharpeRatio.toFixed(2), // sharpe比例
      sortinoRatio: sortinoRatio.toFixed(2), // sortino比例
      calmarRatio: calmarRatio.toFixed(2), // calmar比例
    }; // 结束代码块
  } // 结束代码块

  /**
   * 打印回测统计
   * Print backtest statistics
   * @private
   */
  _printStats() { // 调用 _printStats
    // 计算运行时间 / Calculate running time
    const duration = this.perfStats.endTime - this.perfStats.startTime; // 定义常量 duration
    const eventsPerSecond = Math.floor(this.perfStats.eventsProcessed / (duration / 1000)); // 定义常量 eventsPerSecond

    console.log('\n===================================='); // 控制台输出
    console.log('回测统计 / Backtest Statistics'); // 控制台输出
    console.log('===================================='); // 控制台输出
    console.log(`运行时间 / Duration: ${duration}ms`); // 控制台输出
    console.log(`处理事件 / Events: ${this.perfStats.eventsProcessed.toLocaleString()}`); // 控制台输出
    console.log(`处理速度 / Speed: ${eventsPerSecond.toLocaleString()} events/s`); // 控制台输出
    console.log(`提交订单 / Orders: ${this.perfStats.ordersSubmitted}`); // 控制台输出
    console.log(`成交订单 / Filled: ${this.perfStats.ordersFilled}`); // 控制台输出
    console.log('===================================='); // 控制台输出
    console.log(`初始资金 / Initial: ${this.config.initialCapital}`); // 控制台输出
    console.log(`最终权益 / Final: ${this.account.equity.toFixed(2)}`); // 控制台输出
    console.log(`总收益率 / Return: ${this.result.totalReturnPct}`); // 控制台输出
    console.log(`最大回撤 / MaxDD: ${this.result.maxDrawdownPct}`); // 控制台输出
    console.log(`夏普比率 / Sharpe: ${this.result.sharpeRatio}`); // 控制台输出
    console.log(`胜率 / Win Rate: ${this.result.winRate}`); // 控制台输出
    console.log('====================================\n'); // 控制台输出
  } // 结束代码块

  /**
   * 重置回测引擎
   * Reset backtest engine
   */
  reset() { // 调用 reset
    // 重置账户 / Reset account
    this.account.reset(); // 访问 account

    // 重置撮合引擎 / Reset matching engine
    this.matchingEngine.reset(); // 访问 matchingEngine

    // 清空事件 / Clear events
    this.events = []; // 设置 events
    this.eventIndex = 0; // 设置 eventIndex
    this.currentTime = 0; // 设置 currentTime
    this.lastFundingTime = 0; // 设置 lastFundingTime

    // 清空资金费率 / Clear funding rates
    this.fundingRates.clear(); // 访问 fundingRates

    // 清空结果 / Clear result
    this.result = null; // 设置 result
    this.equityCurve = []; // 设置 equityCurve
    this.trades = []; // 设置 trades

    // 重置性能统计 / Reset performance stats
    this.perfStats = { // 设置 perfStats
      startTime: 0, // 启动时间
      endTime: 0, // end时间
      eventsProcessed: 0, // eventsProcessed
      ordersSubmitted: 0, // 订单Submitted
      ordersFilled: 0, // 订单Filled
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export { // 导出命名成员
  SIDE, // 执行语句
  ORDER_TYPE, // 执行语句
  ORDER_STATUS, // 执行语句
  EVENT_TYPE, // 执行语句
  POSITION_SIDE, // 执行语句
}; // 结束代码块

// 导出类 / Export classes
export { // 导出命名成员
  BaseStrategy, // 执行语句
  BacktestEngine, // 执行语句
  Position, // 执行语句
  Account, // 执行语句
  OrderBook, // 执行语句
  MatchingEngine, // 执行语句
  ObjectPool, // 执行语句
}; // 结束代码块

// 默认导出 / Default export
export default BacktestEngine; // 默认导出
