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

import { KEY_PREFIX } from './RedisClient.js';

/**
 * 订单状态枚举
 * Order status enum
 */
export const ORDER_STATUS = {
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  OPEN: 'open',
  PARTIALLY_FILLED: 'partially_filled',
  FILLED: 'filled',
  CANCELED: 'canceled',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  FAILED: 'failed',
};

/**
 * 活跃订单状态列表
 * Active order status list
 */
const ACTIVE_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.SUBMITTED,
  ORDER_STATUS.OPEN,
  ORDER_STATUS.PARTIALLY_FILLED,
];

/**
 * 订单存储类
 * Order Store Class
 */
class OrderStore {
  constructor(redisClient) {
    this.redis = redisClient;
    this.prefix = KEY_PREFIX.ORDER;
    this.indexPrefix = KEY_PREFIX.ORDER_INDEX;
  }

  // ============================================
  // 键生成方法 / Key Generation Methods
  // ============================================

  /**
   * 获取订单数据键
   * Get order data key
   */
  _orderKey(orderId) {
    return this.redis.key(this.prefix, orderId);
  }

  /**
   * 获取时间索引键
   * Get time index key
   */
  _timeIndexKey() {
    return this.redis.key(this.indexPrefix, 'time');
  }

  /**
   * 获取状态索引键
   * Get status index key
   */
  _statusIndexKey(status) {
    return this.redis.key(this.indexPrefix, 'status', status);
  }

  /**
   * 获取交易对索引键
   * Get symbol index key
   */
  _symbolIndexKey(symbol) {
    return this.redis.key(this.indexPrefix, 'symbol', symbol);
  }

  /**
   * 获取策略索引键
   * Get strategy index key
   */
  _strategyIndexKey(strategy) {
    return this.redis.key(this.indexPrefix, 'strategy', strategy);
  }

  /**
   * 获取交易所索引键
   * Get exchange index key
   */
  _exchangeIndexKey(exchange) {
    return this.redis.key(this.indexPrefix, 'exchange', exchange);
  }

  // ============================================
  // 数据序列化 / Data Serialization
  // ============================================

  /**
   * 序列化订单到 Redis Hash
   * Serialize order to Redis Hash
   */
  _serialize(order) {
    const data = {
      orderId: order.orderId || order.id || '',
      clientOrderId: order.clientOrderId || '',
      symbol: order.symbol || '',
      side: order.side || '',
      type: order.type || '',
      status: order.status || ORDER_STATUS.PENDING,
      amount: String(order.amount || 0),
      filled: String(order.filled || 0),
      remaining: String(order.remaining ?? order.amount ?? 0),
      price: String(order.price || 0),
      averagePrice: String(order.averagePrice || 0),
      stopPrice: String(order.stopPrice || 0),
      cost: String(order.cost || 0),
      fee: String(order.fee || 0),
      exchange: order.exchange || '',
      strategy: order.strategy || '',
      createdAt: String(order.createdAt || Date.now()),
      updatedAt: String(order.updatedAt || Date.now()),
      closedAt: String(order.closedAt || 0),
      errorMessage: order.errorMessage || '',
    };

    // 序列化 metadata
    if (order.metadata) {
      data.metadata = JSON.stringify(order.metadata);
    }

    return data;
  }

  /**
   * 反序列化 Redis Hash 到订单对象
   * Deserialize Redis Hash to order object
   */
  _deserialize(data) {
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const order = {
      orderId: data.orderId,
      clientOrderId: data.clientOrderId || null,
      symbol: data.symbol,
      side: data.side,
      type: data.type,
      status: data.status,
      amount: parseFloat(data.amount),
      filled: parseFloat(data.filled),
      remaining: parseFloat(data.remaining),
      price: parseFloat(data.price) || null,
      averagePrice: parseFloat(data.averagePrice) || null,
      stopPrice: parseFloat(data.stopPrice) || null,
      cost: parseFloat(data.cost),
      fee: parseFloat(data.fee),
      exchange: data.exchange,
      strategy: data.strategy || null,
      createdAt: parseInt(data.createdAt, 10),
      updatedAt: parseInt(data.updatedAt, 10) || null,
      closedAt: parseInt(data.closedAt, 10) || null,
      errorMessage: data.errorMessage || null,
    };

    // 解析 metadata
    if (data.metadata) {
      try {
        order.metadata = JSON.parse(data.metadata);
      } catch {
        order.metadata = null;
      }
    }

    return order;
  }

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
  async insert(order) {
    const orderId = order.orderId || order.id;
    if (!orderId) {
      throw new Error('Order ID is required');
    }

    const createdAt = order.createdAt || Date.now();
    const serialized = this._serialize({ ...order, createdAt });

    // 使用事务确保原子性 / Use transaction for atomicity
    await this.redis.transaction(async (multi) => {
      // 存储订单数据 / Store order data
      multi.hSet(this._orderKey(orderId), serialized);

      // 添加时间索引 / Add time index
      multi.zAdd(this._timeIndexKey(), { score: createdAt, value: orderId });

      // 添加状态索引 / Add status index
      multi.sAdd(this._statusIndexKey(serialized.status), orderId);

      // 添加交易对索引 / Add symbol index
      if (order.symbol) {
        multi.zAdd(this._symbolIndexKey(order.symbol), { score: createdAt, value: orderId });
      }

      // 添加策略索引 / Add strategy index
      if (order.strategy) {
        multi.zAdd(this._strategyIndexKey(order.strategy), { score: createdAt, value: orderId });
      }

      // 添加交易所索引 / Add exchange index
      if (order.exchange) {
        multi.zAdd(this._exchangeIndexKey(order.exchange), { score: createdAt, value: orderId });
      }
    });

    return { orderId, changes: 1 };
  }

  /**
   * 更新订单
   * Update order
   *
   * @param {Object} order - 订单更新数据 / Order update data
   * @returns {Object} 结果 / Result
   */
  async update(order) {
    const orderId = order.orderId || order.id;
    if (!orderId) {
      throw new Error('Order ID is required');
    }

    // 获取旧订单数据 / Get old order data
    const oldData = await this.redis.hGetAll(this._orderKey(orderId));
    if (!oldData || Object.keys(oldData).length === 0) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const oldStatus = oldData.status;
    const newStatus = order.status || oldStatus;
    const updatedAt = Date.now();

    // 准备更新数据 / Prepare update data
    const updates = {
      updatedAt: String(updatedAt),
    };

    if (order.status !== undefined) updates.status = order.status;
    if (order.filled !== undefined) updates.filled = String(order.filled);
    if (order.remaining !== undefined) updates.remaining = String(order.remaining);
    if (order.averagePrice !== undefined) updates.averagePrice = String(order.averagePrice);
    if (order.cost !== undefined) updates.cost = String(order.cost);
    if (order.fee !== undefined) updates.fee = String(order.fee);
    if (order.closedAt !== undefined) updates.closedAt = String(order.closedAt);
    if (order.errorMessage !== undefined) updates.errorMessage = order.errorMessage;

    // 使用事务 / Use transaction
    await this.redis.transaction(async (multi) => {
      // 更新订单数据 / Update order data
      multi.hSet(this._orderKey(orderId), updates);

      // 如果状态变化，更新状态索引 / If status changed, update status index
      if (newStatus !== oldStatus) {
        multi.sRem(this._statusIndexKey(oldStatus), orderId);
        multi.sAdd(this._statusIndexKey(newStatus), orderId);
      }
    });

    return { orderId, changes: 1 };
  }

  /**
   * 批量插入订单
   * Batch insert orders
   *
   * @param {Array} orders - 订单数组 / Order array
   */
  async insertMany(orders) {
    for (const order of orders) {
      await this.insert(order);
    }
    return { count: orders.length };
  }

  /**
   * 删除订单
   * Delete order
   *
   * @param {string} orderId - 订单ID / Order ID
   */
  async delete(orderId) {
    const data = await this.redis.hGetAll(this._orderKey(orderId));
    if (!data || Object.keys(data).length === 0) {
      return { changes: 0 };
    }

    await this.redis.transaction(async (multi) => {
      // 删除订单数据 / Delete order data
      multi.del(this._orderKey(orderId));

      // 删除索引 / Delete indexes
      multi.zRem(this._timeIndexKey(), orderId);
      multi.sRem(this._statusIndexKey(data.status), orderId);

      if (data.symbol) {
        multi.zRem(this._symbolIndexKey(data.symbol), orderId);
      }
      if (data.strategy) {
        multi.zRem(this._strategyIndexKey(data.strategy), orderId);
      }
      if (data.exchange) {
        multi.zRem(this._exchangeIndexKey(data.exchange), orderId);
      }
    });

    return { changes: 1 };
  }

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
  async getById(orderId) {
    const data = await this.redis.hGetAll(this._orderKey(orderId));
    return this._deserialize(data);
  }

  /**
   * 根据客户端订单 ID 获取订单
   * Get order by client order ID
   *
   * @param {string} clientOrderId - 客户端订单ID / Client order ID
   * @returns {Object|null} 订单 / Order
   */
  async getByClientOrderId(clientOrderId) {
    // 需要扫描所有订单 (可以考虑添加专门的索引)
    // Need to scan all orders (consider adding dedicated index)
    const orderIds = await this.redis.zRange(this._timeIndexKey(), 0, -1, { REV: true });

    for (const orderId of orderIds) {
      const coid = await this.redis.hGet(this._orderKey(orderId), 'clientOrderId');
      if (coid === clientOrderId) {
        return this.getById(orderId);
      }
    }

    return null;
  }

  /**
   * 获取未完成订单
   * Get open orders
   *
   * @returns {Array} 订单数组 / Order array
   */
  async getOpenOrders() {
    const orderIds = new Set();

    // 收集所有活跃状态的订单ID / Collect all active status order IDs
    for (const status of ACTIVE_STATUSES) {
      const ids = await this.redis.sMembers(this._statusIndexKey(status));
      ids.forEach(id => orderIds.add(id));
    }

    // 获取订单详情 / Get order details
    const orders = [];
    for (const orderId of orderIds) {
      const order = await this.getById(orderId);
      if (order) {
        orders.push(order);
      }
    }

    // 按创建时间倒序排序 / Sort by created time desc
    orders.sort((a, b) => b.createdAt - a.createdAt);

    return orders;
  }

  /**
   * 按交易对获取订单
   * Get orders by symbol
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} options - 选项 / Options
   * @returns {Array} 订单数组 / Order array
   */
  async getBySymbol(symbol, options = {}) {
    const { limit = 100, offset = 0 } = options;

    const orderIds = await this.redis.zRange(
      this._symbolIndexKey(symbol),
      offset,
      offset + limit - 1,
      { REV: true }
    );

    const orders = [];
    for (const orderId of orderIds) {
      const order = await this.getById(orderId);
      if (order) {
        orders.push(order);
      }
    }

    return orders;
  }

  /**
   * 按策略获取订单
   * Get orders by strategy
   *
   * @param {string} strategy - 策略名称 / Strategy name
   * @param {Object} options - 选项 / Options
   * @returns {Array} 订单数组 / Order array
   */
  async getByStrategy(strategy, options = {}) {
    const { limit = 100, offset = 0 } = options;

    const orderIds = await this.redis.zRange(
      this._strategyIndexKey(strategy),
      offset,
      offset + limit - 1,
      { REV: true }
    );

    const orders = [];
    for (const orderId of orderIds) {
      const order = await this.getById(orderId);
      if (order) {
        orders.push(order);
      }
    }

    return orders;
  }

  /**
   * 按状态获取订单
   * Get orders by status
   *
   * @param {string} status - 状态 / Status
   * @returns {Array} 订单数组 / Order array
   */
  async getByStatus(status) {
    const orderIds = await this.redis.sMembers(this._statusIndexKey(status));

    const orders = [];
    for (const orderId of orderIds) {
      const order = await this.getById(orderId);
      if (order) {
        orders.push(order);
      }
    }

    // 按创建时间倒序排序 / Sort by created time desc
    orders.sort((a, b) => b.createdAt - a.createdAt);

    return orders;
  }

  /**
   * 按时间范围获取订单
   * Get orders by time range
   *
   * @param {number} startTime - 开始时间戳 / Start timestamp
   * @param {number} endTime - 结束时间戳 / End timestamp
   * @param {Object} options - 选项 / Options
   * @returns {Array} 订单数组 / Order array
   */
  async getByTimeRange(startTime, endTime, options = {}) {
    const { limit = 1000 } = options;

    const orderIds = await this.redis.zRangeByScore(
      this._timeIndexKey(),
      startTime,
      endTime,
      { limit }
    );

    const orders = [];
    for (const orderId of orderIds) {
      const order = await this.getById(orderId);
      if (order) {
        orders.push(order);
      }
    }

    // 按创建时间倒序排序 / Sort by created time desc
    orders.sort((a, b) => b.createdAt - a.createdAt);

    return orders;
  }

  /**
   * 获取最近的订单
   * Get recent orders
   *
   * @param {number} limit - 限制数量 / Limit
   * @returns {Array} 订单数组 / Order array
   */
  async getRecent(limit = 50) {
    const orderIds = await this.redis.zRange(
      this._timeIndexKey(),
      0,
      limit - 1,
      { REV: true }
    );

    const orders = [];
    for (const orderId of orderIds) {
      const order = await this.getById(orderId);
      if (order) {
        orders.push(order);
      }
    }

    return orders;
  }

  // ============================================
  // 统计方法 / Statistics Methods
  // ============================================

  /**
   * 获取订单统计
   * Get order statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  async getStats() {
    const stats = {
      total: 0,
      byStatus: {},
    };

    // 总数 / Total count
    stats.total = await this.redis.zCard(this._timeIndexKey());

    // 按状态统计 / Count by status
    for (const status of Object.values(ORDER_STATUS)) {
      const count = await this.redis.sCard(this._statusIndexKey(status));
      if (count > 0) {
        stats.byStatus[status] = count;
      }
    }

    return stats;
  }

  /**
   * 获取订单计数
   * Get order count
   *
   * @returns {number} 订单数量 / Order count
   */
  async count() {
    return this.redis.zCard(this._timeIndexKey());
  }

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
  async cleanup(days = 30) {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    // 获取过期订单ID / Get expired order IDs
    const expiredIds = await this.redis.zRangeByScore(
      this._timeIndexKey(),
      0,
      cutoffTime
    );

    let deleted = 0;
    for (const orderId of expiredIds) {
      const result = await this.delete(orderId);
      deleted += result.changes;
    }

    return deleted;
  }
}

export { OrderStore, ORDER_STATUS };
export default OrderStore;
