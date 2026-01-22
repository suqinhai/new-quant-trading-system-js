/**
 * 订单归档服务
 * Order Archiver Service
 *
 * 将已完成的订单从 Redis 归档到 ClickHouse
 * Archives completed orders from Redis to ClickHouse
 *
 * @module src/database/clickhouse/OrderArchiver
 */

import { EventEmitter } from 'events'; // 导入模块 events
import { ORDER_STATUS } from '../redis/OrderStore.js'; // 导入模块 ../redis/OrderStore.js

/**
 * 需要归档的订单状态列表
 * Order statuses that should be archived
 */
const ARCHIVABLE_STATUSES = [ // 定义常量 ARCHIVABLE_STATUSES
  ORDER_STATUS.FILLED, // 执行语句
  ORDER_STATUS.CANCELED, // 执行语句
  ORDER_STATUS.REJECTED, // 执行语句
  ORDER_STATUS.EXPIRED, // 执行语句
  ORDER_STATUS.FAILED, // 执行语句
]; // 结束数组或索引

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // 批量大小 / Batch size
  batchSize: 100, // 批次大小
  // 归档阈值 (秒) - 订单完成后多久可以归档 / Archive threshold (seconds)
  archiveAfterSeconds: 3600, // 归档阈值 (秒) - 订单完成后多久可以归档
  // 是否在归档后删除 Redis 中的数据 / Whether to delete from Redis after archiving
  deleteAfterArchive: true, // 是否在归档后删除 Redis 中的数据
  // 保留天数 (在删除前保留多少天) / Days to keep before deletion
  retentionDays: 7, // 保留天数 (在删除前保留多少天)
}; // 结束代码块

/**
 * 订单归档器类
 * Order Archiver Class
 */
class OrderArchiver extends EventEmitter { // 定义类 OrderArchiver(继承EventEmitter)
  constructor(redisOrderStore, clickHouseClient, config = {}) { // 构造函数
    super(); // 调用父类

    this.orderStore = redisOrderStore; // 设置 orderStore
    this.clickhouse = clickHouseClient; // 设置 clickhouse
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalArchived: 0, // 总Archived
      totalDeleted: 0, // 总Deleted
      lastArchiveTime: null, // last归档时间
      errors: 0, // 错误列表
    }; // 结束代码块
  } // 结束代码块

  /**
   * 执行归档任务
   * Execute archive task
   *
   * @returns {Object} 归档结果 / Archive result
   */
  async archive() { // 执行语句
    const startTime = Date.now(); // 定义常量 startTime
    const result = { // 定义常量 result
      archived: 0, // archived
      deleted: 0, // deleted
      errors: [], // 错误列表
    }; // 结束代码块

    try { // 尝试执行
      // 获取可归档的订单 / Get archivable orders
      const orders = await this._getArchivableOrders(); // 定义常量 orders

      if (orders.length === 0) { // 条件判断 orders.length === 0
        this.emit('archive:complete', { ...result, duration: Date.now() - startTime }); // 调用 emit
        return result; // 返回结果
      } // 结束代码块

      // 分批处理 / Process in batches
      for (let i = 0; i < orders.length; i += this.config.batchSize) { // 循环 let i = 0; i < orders.length; i += this.confi...
        const batch = orders.slice(i, i + this.config.batchSize); // 定义常量 batch

        try { // 尝试执行
          // 写入 ClickHouse / Write to ClickHouse
          await this._archiveBatch(batch); // 等待异步结果
          result.archived += batch.length; // 执行语句

          // 删除 Redis 中的数据 / Delete from Redis
          if (this.config.deleteAfterArchive) { // 条件判断 this.config.deleteAfterArchive
            await this._deleteBatch(batch); // 等待异步结果
            result.deleted += batch.length; // 执行语句
          } // 结束代码块

          this.emit('archive:batch', { count: batch.length, total: result.archived }); // 调用 emit

        } catch (error) { // 执行语句
          result.errors.push({ // 调用 result.errors.push
            batch: i / this.config.batchSize, // 批次
            error: error.message, // 错误
            orderIds: batch.map(o => o.orderId), // 订单ID列表
          }); // 结束代码块
          this.stats.errors++; // 访问 stats
        } // 结束代码块
      } // 结束代码块

      // 更新统计 / Update statistics
      this.stats.totalArchived += result.archived; // 访问 stats
      this.stats.totalDeleted += result.deleted; // 访问 stats
      this.stats.lastArchiveTime = new Date().toISOString(); // 访问 stats

      this.emit('archive:complete', { ...result, duration: Date.now() - startTime }); // 调用 emit

    } catch (error) { // 执行语句
      result.errors.push({ error: error.message }); // 调用 result.errors.push
      this.emit('archive:error', error); // 调用 emit
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取可归档的订单
   * Get archivable orders
   *
   * @returns {Array} 可归档的订单列表 / List of archivable orders
   * @private
   */
  async _getArchivableOrders() { // 执行语句
    const archivableOrders = []; // 定义常量 archivableOrders
    const cutoffTime = Date.now() - this.config.archiveAfterSeconds * 1000; // 定义常量 cutoffTime

    // 遍历所有可归档状态 / Iterate through all archivable statuses
    for (const status of ARCHIVABLE_STATUSES) { // 循环 const status of ARCHIVABLE_STATUSES
      const orders = await this.orderStore.getByStatus(status); // 定义常量 orders

      for (const order of orders) { // 循环 const order of orders
        // 检查订单是否满足归档条件 / Check if order meets archive criteria
        const orderTime = order.closedAt || order.updatedAt || order.createdAt; // 定义常量 orderTime

        if (orderTime && orderTime < cutoffTime) { // 条件判断 orderTime && orderTime < cutoffTime
          archivableOrders.push(order); // 调用 archivableOrders.push
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return archivableOrders; // 返回结果
  } // 结束代码块

  /**
   * 批量归档订单到 ClickHouse
   * Archive batch of orders to ClickHouse
   *
   * @param {Array} orders - 订单数组 / Order array
   * @private
   */
  async _archiveBatch(orders) { // 执行语句
    const rows = orders.map(order => this._transformOrder(order)); // 定义函数 rows
    await this.clickhouse.insert('orders_archive', rows); // 等待异步结果
  } // 结束代码块

  /**
   * 转换订单格式为 ClickHouse 格式
   * Transform order format to ClickHouse format
   *
   * @param {Object} order - 订单数据 / Order data
   * @returns {Object} ClickHouse 格式数据 / ClickHouse format data
   * @private
   */
  _transformOrder(order) { // 调用 _transformOrder
    return { // 返回结果
      order_id: order.orderId || '', // 订单ID
      client_order_id: order.clientOrderId || '', // client订单ID
      symbol: order.symbol || '', // 交易对
      side: order.side || 'buy', // 方向
      type: order.type || 'market', // 类型
      status: order.status || 'filled', // 状态
      amount: order.amount || 0, // 数量
      filled: order.filled || 0, // filled
      remaining: order.remaining || 0, // remaining
      price: order.price || 0, // 价格
      average_price: order.averagePrice || 0, // 平均价格
      stop_price: order.stopPrice || 0, // 停止价格
      cost: order.cost || 0, // cost
      fee: order.fee || 0, // 手续费
      exchange: order.exchange || '', // 交易所
      strategy: order.strategy || '', // 策略
      created_at: this._toDateTime(order.createdAt), // createdat
      updated_at: this._toDateTime(order.updatedAt), // updatedat
      closed_at: this._toDateTime(order.closedAt), // closedat
      error_message: order.errorMessage || '', // 错误消息
      metadata: order.metadata ? JSON.stringify(order.metadata) : '', // 元数据
    }; // 结束代码块
  } // 结束代码块

  /**
   * 批量删除 Redis 中的订单
   * Delete batch of orders from Redis
   *
   * @param {Array} orders - 订单数组 / Order array
   * @private
   */
  async _deleteBatch(orders) { // 执行语句
    for (const order of orders) { // 循环 const order of orders
      await this.orderStore.delete(order.orderId); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 转换时间戳为 DateTime 字符串
   * Convert timestamp to DateTime string
   *
   * @param {number} timestamp - 时间戳 / Timestamp
   * @returns {string} DateTime 字符串 / DateTime string
   * @private
   */
  _toDateTime(timestamp) { // 调用 _toDateTime
    if (!timestamp) { // 条件判断 !timestamp
      return '1970-01-01 00:00:00.000'; // 返回结果
    } // 结束代码块
    return new Date(timestamp).toISOString().replace('T', ' ').replace('Z', ''); // 返回结果
  } // 结束代码块

  /**
   * 获取归档统计
   * Get archive statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getStats() { // 调用 getStats
    return { ...this.stats }; // 返回结果
  } // 结束代码块

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() { // 调用 resetStats
    this.stats = { // 设置 stats
      totalArchived: 0, // 总Archived
      totalDeleted: 0, // 总Deleted
      lastArchiveTime: null, // last归档时间
      errors: 0, // 错误列表
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

export { OrderArchiver, ARCHIVABLE_STATUSES }; // 导出命名成员
export default OrderArchiver; // 默认导出
