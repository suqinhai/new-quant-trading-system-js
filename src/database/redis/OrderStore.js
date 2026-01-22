/**
 * 订单 Redis 存储层
 * Order Redis Store
 *
 * 使用 Hash 存储订单数据，Sorted Set 存储索引
 * Uses Hash for order data, Sorted Set for indexes
 *
 * Redis 数据结构设计 / Redis Data Structure Design:
 *
 * 1. 订单数据 (Hash)
 *    Key: quant:order:{orderId}
 *    Fields: orderId, clientOrderId, symbol, side, type, status, amount, filled, ...
 *
 * 2. 时间索引 (Sorted Set)
 *    Key: quant:order:idx:time
 *    Score: createdAt timestamp
 *    Member: orderId
 *
 * 3. 状态索引 (Set)
 *    Key: quant:order:idx:status:{status}
 *    Members: orderIds
 *
 * 4. 交易对索引 (Sorted Set)
 *    Key: quant:order:idx:symbol:{symbol}
 *    Score: createdAt timestamp
 *    Member: orderId
 *
 * 5. 策略索引 (Sorted Set)
 *    Key: quant:order:idx:strategy:{strategy}
 *    Score: createdAt timestamp
 *    Member: orderId
 *
 * @module src/database/redis/OrderStore
 */

import { KEY_PREFIX } from './RedisClient.js'; // 导入模块 ./RedisClient.js

/**
 * 订单状态枚举
 * Order status enum
 */
export const ORDER_STATUS = { // 导出常量 ORDER_STATUS
  PENDING: 'pending', // 待处理
  SUBMITTED: 'submitted', // SUBMITTED
  OPEN: 'open', // 开盘
  PARTIALLY_FILLED: 'partially_filled', // PARTIALLYFILLED
  FILLED: 'filled', // FILLED
  CANCELED: 'canceled', // CANCELED
  REJECTED: 'rejected', // REJECTED
  EXPIRED: 'expired', // EXPIRED
  FAILED: 'failed', // FAILED
}; // 结束代码块

/**
 * 活跃订单状态列表
 * Active order status list
 */
const ACTIVE_STATUSES = [ // 定义常量 ACTIVE_STATUSES
  ORDER_STATUS.PENDING, // 执行语句
  ORDER_STATUS.SUBMITTED, // 执行语句
  ORDER_STATUS.OPEN, // 执行语句
  ORDER_STATUS.PARTIALLY_FILLED, // 执行语句
]; // 结束数组或索引

/**
 * 订单存储类
 * Order Store Class
 */
class OrderStore { // 定义类 OrderStore
  constructor(redisClient) { // 构造函数
    this.redis = redisClient; // 设置 redis
    this.prefix = KEY_PREFIX.ORDER; // 设置 prefix
    this.indexPrefix = KEY_PREFIX.ORDER_INDEX; // 设置 indexPrefix
  } // 结束代码块

  // ============================================
  // 键生成方法 / Key Generation Methods
  // ============================================

  /**
   * 获取订单数据键
   * Get order data key
   */
  _orderKey(orderId) { // 调用 _orderKey
    return this.redis.key(this.prefix, orderId); // 返回结果
  } // 结束代码块

  /**
   * 获取时间索引键
   * Get time index key
   */
  _timeIndexKey() { // 调用 _timeIndexKey
    return this.redis.key(this.indexPrefix, 'time'); // 返回结果
  } // 结束代码块

  /**
   * 获取状态索引键
   * Get status index key
   */
  _statusIndexKey(status) { // 调用 _statusIndexKey
    return this.redis.key(this.indexPrefix, 'status', status); // 返回结果
  } // 结束代码块

  /**
   * 获取交易对索引键
   * Get symbol index key
   */
  _symbolIndexKey(symbol) { // 调用 _symbolIndexKey
    return this.redis.key(this.indexPrefix, 'symbol', symbol); // 返回结果
  } // 结束代码块

  /**
   * 获取策略索引键
   * Get strategy index key
   */
  _strategyIndexKey(strategy) { // 调用 _strategyIndexKey
    return this.redis.key(this.indexPrefix, 'strategy', strategy); // 返回结果
  } // 结束代码块

  /**
   * 获取交易所索引键
   * Get exchange index key
   */
  _exchangeIndexKey(exchange) { // 调用 _exchangeIndexKey
    return this.redis.key(this.indexPrefix, 'exchange', exchange); // 返回结果
  } // 结束代码块

  // ============================================
  // 数据序列化 / Data Serialization
  // ============================================

  /**
   * 序列化订单到 Redis Hash
   * Serialize order to Redis Hash
   */
  _serialize(order) { // 调用 _serialize
    const data = { // 定义常量 data
      orderId: order.orderId || order.id || '', // 订单ID
      clientOrderId: order.clientOrderId || '', // client订单ID
      symbol: order.symbol || '', // 交易对
      side: order.side || '', // 方向
      type: order.type || '', // 类型
      status: order.status || ORDER_STATUS.PENDING, // 状态
      amount: String(order.amount || 0), // 数量
      filled: String(order.filled || 0), // filled
      remaining: String(order.remaining ?? order.amount ?? 0), // remaining
      price: String(order.price || 0), // 价格
      averagePrice: String(order.averagePrice || 0), // 平均价格
      stopPrice: String(order.stopPrice || 0), // 停止价格
      cost: String(order.cost || 0), // cost
      fee: String(order.fee || 0), // 手续费
      exchange: order.exchange || '', // 交易所
      strategy: order.strategy || '', // 策略
      createdAt: String(order.createdAt || Date.now()), // createdAt
      updatedAt: String(order.updatedAt || Date.now()), // updatedAt
      closedAt: String(order.closedAt || 0), // closedAt
      errorMessage: order.errorMessage || '', // 错误消息
    }; // 结束代码块

    // 序列化 metadata
    if (order.metadata) { // 条件判断 order.metadata
      data.metadata = JSON.stringify(order.metadata); // 赋值 data.metadata
    } // 结束代码块

    return data; // 返回结果
  } // 结束代码块

  /**
   * 反序列化 Redis Hash 到订单对象
   * Deserialize Redis Hash to order object
   */
  _deserialize(data) { // 调用 _deserialize
    if (!data || Object.keys(data).length === 0) { // 条件判断 !data || Object.keys(data).length === 0
      return null; // 返回结果
    } // 结束代码块

    const order = { // 定义常量 order
      orderId: data.orderId, // 订单ID
      clientOrderId: data.clientOrderId || null, // client订单ID
      symbol: data.symbol, // 交易对
      side: data.side, // 方向
      type: data.type, // 类型
      status: data.status, // 状态
      amount: parseFloat(data.amount), // 数量
      filled: parseFloat(data.filled), // filled
      remaining: parseFloat(data.remaining), // remaining
      price: parseFloat(data.price) || null, // 价格
      averagePrice: parseFloat(data.averagePrice) || null, // 平均价格
      stopPrice: parseFloat(data.stopPrice) || null, // 停止价格
      cost: parseFloat(data.cost), // cost
      fee: parseFloat(data.fee), // 手续费
      exchange: data.exchange, // 交易所
      strategy: data.strategy || null, // 策略
      createdAt: parseInt(data.createdAt, 10), // createdAt
      updatedAt: parseInt(data.updatedAt, 10) || null, // updatedAt
      closedAt: parseInt(data.closedAt, 10) || null, // closedAt
      errorMessage: data.errorMessage || null, // 错误消息
    }; // 结束代码块

    // 解析 metadata
    if (data.metadata) { // 条件判断 data.metadata
      try { // 尝试执行
        order.metadata = JSON.parse(data.metadata); // 赋值 order.metadata
      } catch { // 执行语句
        order.metadata = null; // 赋值 order.metadata
      } // 结束代码块
    } // 结束代码块

    return order; // 返回结果
  } // 结束代码块

  // ============================================
  // 写入操作 / Write Operations
  // ============================================

  /**
   * 插入订单
   * Insert order
   *
   * @param {Object} order - 订单数据 / Order data
   * @returns {Object} 结果 / Result
   */
  async insert(order) { // 执行语句
    const orderId = order.orderId || order.id; // 定义常量 orderId
    if (!orderId) { // 条件判断 !orderId
      throw new Error('Order ID is required'); // 抛出异常
    } // 结束代码块

    const createdAt = order.createdAt || Date.now(); // 定义常量 createdAt
    const serialized = this._serialize({ ...order, createdAt }); // 定义常量 serialized

    // 使用事务确保原子性 / Use transaction for atomicity
    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 存储订单数据 / Store order data
      multi.hSet(this._orderKey(orderId), serialized); // 调用 multi.hSet

      // 添加时间索引 / Add time index
      multi.zAdd(this._timeIndexKey(), { score: createdAt, value: orderId }); // 调用 multi.zAdd

      // 添加状态索引 / Add status index
      multi.sAdd(this._statusIndexKey(serialized.status), orderId); // 调用 multi.sAdd

      // 添加交易对索引 / Add symbol index
      if (order.symbol) { // 条件判断 order.symbol
        multi.zAdd(this._symbolIndexKey(order.symbol), { score: createdAt, value: orderId }); // 调用 multi.zAdd
      } // 结束代码块

      // 添加策略索引 / Add strategy index
      if (order.strategy) { // 条件判断 order.strategy
        multi.zAdd(this._strategyIndexKey(order.strategy), { score: createdAt, value: orderId }); // 调用 multi.zAdd
      } // 结束代码块

      // 添加交易所索引 / Add exchange index
      if (order.exchange) { // 条件判断 order.exchange
        multi.zAdd(this._exchangeIndexKey(order.exchange), { score: createdAt, value: orderId }); // 调用 multi.zAdd
      } // 结束代码块
    }); // 结束代码块

    return { orderId, changes: 1 }; // 返回结果
  } // 结束代码块

  /**
   * 更新订单
   * Update order
   *
   * @param {Object} order - 订单更新数据 / Order update data
   * @returns {Object} 结果 / Result
   */
  async update(order) { // 执行语句
    const orderId = order.orderId || order.id; // 定义常量 orderId
    if (!orderId) { // 条件判断 !orderId
      throw new Error('Order ID is required'); // 抛出异常
    } // 结束代码块

    // 获取旧订单数据 / Get old order data
    const oldData = await this.redis.hGetAll(this._orderKey(orderId)); // 定义常量 oldData
    if (!oldData || Object.keys(oldData).length === 0) { // 条件判断 !oldData || Object.keys(oldData).length === 0
      throw new Error(`Order not found: ${orderId}`); // 抛出异常
    } // 结束代码块

    const oldStatus = oldData.status; // 定义常量 oldStatus
    const newStatus = order.status || oldStatus; // 定义常量 newStatus
    const updatedAt = Date.now(); // 定义常量 updatedAt

    // 准备更新数据 / Prepare update data
    const updates = { // 定义常量 updates
      updatedAt: String(updatedAt), // updatedAt
    }; // 结束代码块

    if (order.status !== undefined) updates.status = order.status; // 条件判断 order.status !== undefined
    if (order.filled !== undefined) updates.filled = String(order.filled); // 条件判断 order.filled !== undefined
    if (order.remaining !== undefined) updates.remaining = String(order.remaining); // 条件判断 order.remaining !== undefined
    if (order.averagePrice !== undefined) updates.averagePrice = String(order.averagePrice); // 条件判断 order.averagePrice !== undefined
    if (order.cost !== undefined) updates.cost = String(order.cost); // 条件判断 order.cost !== undefined
    if (order.fee !== undefined) updates.fee = String(order.fee); // 条件判断 order.fee !== undefined
    if (order.closedAt !== undefined) updates.closedAt = String(order.closedAt); // 条件判断 order.closedAt !== undefined
    if (order.errorMessage !== undefined) updates.errorMessage = order.errorMessage; // 条件判断 order.errorMessage !== undefined

    // 使用事务 / Use transaction
    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 更新订单数据 / Update order data
      multi.hSet(this._orderKey(orderId), updates); // 调用 multi.hSet

      // 如果状态变化，更新状态索引 / If status changed, update status index
      if (newStatus !== oldStatus) { // 条件判断 newStatus !== oldStatus
        multi.sRem(this._statusIndexKey(oldStatus), orderId); // 调用 multi.sRem
        multi.sAdd(this._statusIndexKey(newStatus), orderId); // 调用 multi.sAdd
      } // 结束代码块
    }); // 结束代码块

    return { orderId, changes: 1 }; // 返回结果
  } // 结束代码块

  /**
   * 批量插入订单
   * Batch insert orders
   *
   * @param {Array} orders - 订单数组 / Order array
   */
  async insertMany(orders) { // 执行语句
    for (const order of orders) { // 循环 const order of orders
      await this.insert(order); // 等待异步结果
    } // 结束代码块
    return { count: orders.length }; // 返回结果
  } // 结束代码块

  /**
   * 删除订单
   * Delete order
   *
   * @param {string} orderId - 订单ID / Order ID
   */
  async delete(orderId) { // 执行语句
    const data = await this.redis.hGetAll(this._orderKey(orderId)); // 定义常量 data
    if (!data || Object.keys(data).length === 0) { // 条件判断 !data || Object.keys(data).length === 0
      return { changes: 0 }; // 返回结果
    } // 结束代码块

    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 删除订单数据 / Delete order data
      multi.del(this._orderKey(orderId)); // 调用 multi.del

      // 删除索引 / Delete indexes
      multi.zRem(this._timeIndexKey(), orderId); // 调用 multi.zRem
      multi.sRem(this._statusIndexKey(data.status), orderId); // 调用 multi.sRem

      if (data.symbol) { // 条件判断 data.symbol
        multi.zRem(this._symbolIndexKey(data.symbol), orderId); // 调用 multi.zRem
      } // 结束代码块
      if (data.strategy) { // 条件判断 data.strategy
        multi.zRem(this._strategyIndexKey(data.strategy), orderId); // 调用 multi.zRem
      } // 结束代码块
      if (data.exchange) { // 条件判断 data.exchange
        multi.zRem(this._exchangeIndexKey(data.exchange), orderId); // 调用 multi.zRem
      } // 结束代码块
    }); // 结束代码块

    return { changes: 1 }; // 返回结果
  } // 结束代码块

  // ============================================
  // 查询操作 / Query Operations
  // ============================================

  /**
   * 根据 ID 获取订单
   * Get order by ID
   *
   * @param {string} orderId - 订单ID / Order ID
   * @returns {Object|null} 订单 / Order
   */
  async getById(orderId) { // 执行语句
    const data = await this.redis.hGetAll(this._orderKey(orderId)); // 定义常量 data
    return this._deserialize(data); // 返回结果
  } // 结束代码块

  /**
   * 根据客户端订单 ID 获取订单
   * Get order by client order ID
   *
   * @param {string} clientOrderId - 客户端订单ID / Client order ID
   * @returns {Object|null} 订单 / Order
   */
  async getByClientOrderId(clientOrderId) { // 执行语句
    // 需要扫描所有订单 (可以考虑添加专门的索引)
    // Need to scan all orders (consider adding dedicated index)
    const orderIds = await this.redis.zRange(this._timeIndexKey(), 0, -1, { REV: true }); // 定义常量 orderIds

    for (const orderId of orderIds) { // 循环 const orderId of orderIds
      const coid = await this.redis.hGet(this._orderKey(orderId), 'clientOrderId'); // 定义常量 coid
      if (coid === clientOrderId) { // 条件判断 coid === clientOrderId
        return this.getById(orderId); // 返回结果
      } // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 获取未完成订单
   * Get open orders
   *
   * @returns {Array} 订单数组 / Order array
   */
  async getOpenOrders() { // 执行语句
    const orderIds = new Set(); // 定义常量 orderIds

    // 收集所有活跃状态的订单ID / Collect all active status order IDs
    for (const status of ACTIVE_STATUSES) { // 循环 const status of ACTIVE_STATUSES
      const ids = await this.redis.sMembers(this._statusIndexKey(status)); // 定义常量 ids
      ids.forEach(id => orderIds.add(id)); // 调用 ids.forEach
    } // 结束代码块

    // 获取订单详情 / Get order details
    const orders = []; // 定义常量 orders
    for (const orderId of orderIds) { // 循环 const orderId of orderIds
      const order = await this.getById(orderId); // 定义常量 order
      if (order) { // 条件判断 order
        orders.push(order); // 调用 orders.push
      } // 结束代码块
    } // 结束代码块

    // 按创建时间倒序排序 / Sort by created time desc
    orders.sort((a, b) => b.createdAt - a.createdAt); // 调用 orders.sort

    return orders; // 返回结果
  } // 结束代码块

  /**
   * 按交易对获取订单
   * Get orders by symbol
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} options - 选项 / Options
   * @returns {Array} 订单数组 / Order array
   */
  async getBySymbol(symbol, options = {}) { // 执行语句
    const { limit = 100, offset = 0 } = options; // 解构赋值

    const orderIds = await this.redis.zRange( // 定义常量 orderIds
      this._symbolIndexKey(symbol), // 调用 _symbolIndexKey
      offset, // 执行语句
      offset + limit - 1, // 执行语句
      { REV: true } // 执行语句
    ); // 结束调用或参数

    const orders = []; // 定义常量 orders
    for (const orderId of orderIds) { // 循环 const orderId of orderIds
      const order = await this.getById(orderId); // 定义常量 order
      if (order) { // 条件判断 order
        orders.push(order); // 调用 orders.push
      } // 结束代码块
    } // 结束代码块

    return orders; // 返回结果
  } // 结束代码块

  /**
   * 按策略获取订单
   * Get orders by strategy
   *
   * @param {string} strategy - 策略名称 / Strategy name
   * @param {Object} options - 选项 / Options
   * @returns {Array} 订单数组 / Order array
   */
  async getByStrategy(strategy, options = {}) { // 执行语句
    const { limit = 100, offset = 0 } = options; // 解构赋值

    const orderIds = await this.redis.zRange( // 定义常量 orderIds
      this._strategyIndexKey(strategy), // 调用 _strategyIndexKey
      offset, // 执行语句
      offset + limit - 1, // 执行语句
      { REV: true } // 执行语句
    ); // 结束调用或参数

    const orders = []; // 定义常量 orders
    for (const orderId of orderIds) { // 循环 const orderId of orderIds
      const order = await this.getById(orderId); // 定义常量 order
      if (order) { // 条件判断 order
        orders.push(order); // 调用 orders.push
      } // 结束代码块
    } // 结束代码块

    return orders; // 返回结果
  } // 结束代码块

  /**
   * 按状态获取订单
   * Get orders by status
   *
   * @param {string} status - 状态 / Status
   * @returns {Array} 订单数组 / Order array
   */
  async getByStatus(status) { // 执行语句
    const orderIds = await this.redis.sMembers(this._statusIndexKey(status)); // 定义常量 orderIds

    const orders = []; // 定义常量 orders
    for (const orderId of orderIds) { // 循环 const orderId of orderIds
      const order = await this.getById(orderId); // 定义常量 order
      if (order) { // 条件判断 order
        orders.push(order); // 调用 orders.push
      } // 结束代码块
    } // 结束代码块

    // 按创建时间倒序排序 / Sort by created time desc
    orders.sort((a, b) => b.createdAt - a.createdAt); // 调用 orders.sort

    return orders; // 返回结果
  } // 结束代码块

  /**
   * 按时间范围获取订单
   * Get orders by time range
   *
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   * @param {Object} options - 选项 / Options
   * @returns {Array} 订单数组 / Order array
   */
  async getByTimeRange(startTime, endTime, options = {}) { // 执行语句
    const { limit = 1000 } = options; // 解构赋值

    const orderIds = await this.redis.zRangeByScore( // 定义常量 orderIds
      this._timeIndexKey(), // 调用 _timeIndexKey
      startTime, // 执行语句
      endTime, // 执行语句
      { limit } // 执行语句
    ); // 结束调用或参数

    const orders = []; // 定义常量 orders
    for (const orderId of orderIds) { // 循环 const orderId of orderIds
      const order = await this.getById(orderId); // 定义常量 order
      if (order) { // 条件判断 order
        orders.push(order); // 调用 orders.push
      } // 结束代码块
    } // 结束代码块

    // 按创建时间倒序排序 / Sort by created time desc
    orders.sort((a, b) => b.createdAt - a.createdAt); // 调用 orders.sort

    return orders; // 返回结果
  } // 结束代码块

  /**
   * 获取最近的订单
   * Get recent orders
   *
   * @param {number} limit - 限制数量 / Limit
   * @returns {Array} 订单数组 / Order array
   */
  async getRecent(limit = 50) { // 执行语句
    const orderIds = await this.redis.zRange( // 定义常量 orderIds
      this._timeIndexKey(), // 调用 _timeIndexKey
      0, // 执行语句
      limit - 1, // 执行语句
      { REV: true } // 执行语句
    ); // 结束调用或参数

    const orders = []; // 定义常量 orders
    for (const orderId of orderIds) { // 循环 const orderId of orderIds
      const order = await this.getById(orderId); // 定义常量 order
      if (order) { // 条件判断 order
        orders.push(order); // 调用 orders.push
      } // 结束代码块
    } // 结束代码块

    return orders; // 返回结果
  } // 结束代码块

  // ============================================
  // 统计方法 / Statistics Methods
  // ============================================

  /**
   * 获取订单统计
   * Get order statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  async getStats() { // 执行语句
    const stats = { // 定义常量 stats
      total: 0, // 总
      byStatus: {}, // by状态
    }; // 结束代码块

    // 总数 / Total count
    stats.total = await this.redis.zCard(this._timeIndexKey()); // 赋值 stats.total

    // 按状态统计 / Count by status
    for (const status of Object.values(ORDER_STATUS)) { // 循环 const status of Object.values(ORDER_STATUS)
      const count = await this.redis.sCard(this._statusIndexKey(status)); // 定义常量 count
      if (count > 0) { // 条件判断 count > 0
        stats.byStatus[status] = count; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return stats; // 返回结果
  } // 结束代码块

  /**
   * 获取订单计数
   * Get order count
   *
   * @returns {number} 订单数量 / Order count
   */
  async count() { // 执行语句
    return this.redis.zCard(this._timeIndexKey()); // 返回结果
  } // 结束代码块

  // ============================================
  // 清理方法 / Cleanup Methods
  // ============================================

  /**
   * 清理旧订单 (保留指定天数)
   * Clean up old orders (keep specified days)
   *
   * @param {number} days - 保留天数 / Days to keep
   * @returns {number} 删除数量 / Deleted count
   */
  async cleanup(days = 30) { // 执行语句
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000; // 定义常量 cutoffTime

    // 获取过期订单ID / Get expired order IDs
    const expiredIds = await this.redis.zRangeByScore( // 定义常量 expiredIds
      this._timeIndexKey(), // 调用 _timeIndexKey
      0, // 执行语句
      cutoffTime // 执行语句
    ); // 结束调用或参数

    let deleted = 0; // 定义变量 deleted
    for (const orderId of expiredIds) { // 循环 const orderId of expiredIds
      const result = await this.delete(orderId); // 定义常量 result
      deleted += result.changes; // 执行语句
    } // 结束代码块

    return deleted; // 返回结果
  } // 结束代码块
} // 结束代码块

export { OrderStore, ORDER_STATUS }; // 导出命名成员
export default OrderStore; // 默认导出
