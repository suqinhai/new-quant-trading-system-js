/**
 * 订单归档服务
 * Order Archiver Service
 *
 * 将已完成的订单从 Redis 归档到 ClickHouse
 * Archives completed orders from Redis to ClickHouse
 *
 * @module src/database/clickhouse/OrderArchiver
 */

import { EventEmitter } from 'events';
import { ORDER_STATUS } from '../redis/OrderStore.js';

/**
 * 需要归档的订单状态列表
 * Order statuses that should be archived
 */
const ARCHIVABLE_STATUSES = [
  ORDER_STATUS.FILLED,
  ORDER_STATUS.CANCELED,
  ORDER_STATUS.REJECTED,
  ORDER_STATUS.EXPIRED,
  ORDER_STATUS.FAILED,
];

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // 批量大小 / Batch size
  batchSize: 100,
  // 归档阈值 (秒) - 订单完成后多久可以归档 / Archive threshold (seconds)
  archiveAfterSeconds: 3600, // 1 hour
  // 是否在归档后删除 Redis 中的数据 / Whether to delete from Redis after archiving
  deleteAfterArchive: true,
  // 保留天数 (在删除前保留多少天) / Days to keep before deletion
  retentionDays: 7,
};

/**
 * 订单归档器类
 * Order Archiver Class
 */
class OrderArchiver extends EventEmitter {
  constructor(redisOrderStore, clickHouseClient, config = {}) {
    super();

    this.orderStore = redisOrderStore;
    this.clickhouse = clickHouseClient;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 统计信息 / Statistics
    this.stats = {
      totalArchived: 0,
      totalDeleted: 0,
      lastArchiveTime: null,
      errors: 0,
    };
  }

  /**
   * 执行归档任务
   * Execute archive task
   *
   * @returns {Object} 归档结果 / Archive result
   */
  async archive() {
    const startTime = Date.now();
    const result = {
      archived: 0,
      deleted: 0,
      errors: [],
    };

    try {
      // 获取可归档的订单 / Get archivable orders
      const orders = await this._getArchivableOrders();

      if (orders.length === 0) {
        this.emit('archive:complete', { ...result, duration: Date.now() - startTime });
        return result;
      }

      // 分批处理 / Process in batches
      for (let i = 0; i < orders.length; i += this.config.batchSize) {
        const batch = orders.slice(i, i + this.config.batchSize);

        try {
          // 写入 ClickHouse / Write to ClickHouse
          await this._archiveBatch(batch);
          result.archived += batch.length;

          // 删除 Redis 中的数据 / Delete from Redis
          if (this.config.deleteAfterArchive) {
            await this._deleteBatch(batch);
            result.deleted += batch.length;
          }

          this.emit('archive:batch', { count: batch.length, total: result.archived });

        } catch (error) {
          result.errors.push({
            batch: i / this.config.batchSize,
            error: error.message,
            orderIds: batch.map(o => o.orderId),
          });
          this.stats.errors++;
        }
      }

      // 更新统计 / Update statistics
      this.stats.totalArchived += result.archived;
      this.stats.totalDeleted += result.deleted;
      this.stats.lastArchiveTime = new Date().toISOString();

      this.emit('archive:complete', { ...result, duration: Date.now() - startTime });

    } catch (error) {
      result.errors.push({ error: error.message });
      this.emit('archive:error', error);
    }

    return result;
  }

  /**
   * 获取可归档的订单
   * Get archivable orders
   *
   * @returns {Array} 可归档的订单列表 / List of archivable orders
   * @private
   */
  async _getArchivableOrders() {
    const archivableOrders = [];
    const cutoffTime = Date.now() - this.config.archiveAfterSeconds * 1000;

    // 遍历所有可归档状态 / Iterate through all archivable statuses
    for (const status of ARCHIVABLE_STATUSES) {
      const orders = await this.orderStore.getByStatus(status);

      for (const order of orders) {
        // 检查订单是否满足归档条件 / Check if order meets archive criteria
        const orderTime = order.closedAt || order.updatedAt || order.createdAt;

        if (orderTime && orderTime < cutoffTime) {
          archivableOrders.push(order);
        }
      }
    }

    return archivableOrders;
  }

  /**
   * 批量归档订单到 ClickHouse
   * Archive batch of orders to ClickHouse
   *
   * @param {Array} orders - 订单数组 / Order array
   * @private
   */
  async _archiveBatch(orders) {
    const rows = orders.map(order => this._transformOrder(order));
    await this.clickhouse.insert('orders_archive', rows);
  }

  /**
   * 转换订单格式为 ClickHouse 格式
   * Transform order format to ClickHouse format
   *
   * @param {Object} order - 订单数据 / Order data
   * @returns {Object} ClickHouse 格式数据 / ClickHouse format data
   * @private
   */
  _transformOrder(order) {
    return {
      order_id: order.orderId || '',
      client_order_id: order.clientOrderId || '',
      symbol: order.symbol || '',
      side: order.side || 'buy',
      type: order.type || 'market',
      status: order.status || 'filled',
      amount: order.amount || 0,
      filled: order.filled || 0,
      remaining: order.remaining || 0,
      price: order.price || 0,
      average_price: order.averagePrice || 0,
      stop_price: order.stopPrice || 0,
      cost: order.cost || 0,
      fee: order.fee || 0,
      exchange: order.exchange || '',
      strategy: order.strategy || '',
      created_at: this._toDateTime(order.createdAt),
      updated_at: this._toDateTime(order.updatedAt),
      closed_at: this._toDateTime(order.closedAt),
      error_message: order.errorMessage || '',
      metadata: order.metadata ? JSON.stringify(order.metadata) : '',
    };
  }

  /**
   * 批量删除 Redis 中的订单
   * Delete batch of orders from Redis
   *
   * @param {Array} orders - 订单数组 / Order array
   * @private
   */
  async _deleteBatch(orders) {
    for (const order of orders) {
      await this.orderStore.delete(order.orderId);
    }
  }

  /**
   * 转换时间戳为 DateTime 字符串
   * Convert timestamp to DateTime string
   *
   * @param {number} timestamp - 时间戳 / Timestamp
   * @returns {string} DateTime 字符串 / DateTime string
   * @private
   */
  _toDateTime(timestamp) {
    if (!timestamp) {
      return '1970-01-01 00:00:00.000';
    }
    return new Date(timestamp).toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * 获取归档统计
   * Get archive statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalArchived: 0,
      totalDeleted: 0,
      lastArchiveTime: null,
      errors: 0,
    };
  }
}

export { OrderArchiver, ARCHIVABLE_STATUSES };
export default OrderArchiver;
