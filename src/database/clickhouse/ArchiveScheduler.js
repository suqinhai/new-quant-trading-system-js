/**
 * 定时归档调度器
 * Scheduled Archive Scheduler
 *
 * 定期将 Redis 中的数据归档到 ClickHouse
 * Periodically archives data from Redis to ClickHouse
 *
 * @module src/database/clickhouse/ArchiveScheduler
 */

import { EventEmitter } from 'events'; // 导入模块 events
import { OrderArchiver } from './OrderArchiver.js'; // 导入模块 ./OrderArchiver.js
import { AuditLogWriter } from './AuditLogWriter.js'; // 导入模块 ./AuditLogWriter.js
import { POSITION_STATUS } from '../redis/PositionStore.js'; // 导入模块 ../redis/PositionStore.js

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // 订单归档间隔 (ms) / Order archive interval (ms)
  orderArchiveInterval: 60 * 60 * 1000, // 订单归档间隔 (ms)
  // 持仓归档间隔 (ms) / Position archive interval (ms)
  positionArchiveInterval: 60 * 60 * 1000, // 持仓归档间隔 (ms)
  // 交易归档间隔 (ms) / Trade archive interval (ms)
  tradeArchiveInterval: 30 * 60 * 1000, // 交易归档间隔 (ms)
  // 审计日志归档间隔 (ms) / Audit log archive interval (ms)
  auditLogArchiveInterval: 10 * 60 * 1000, // 审计日志归档间隔 (ms)
  // 余额快照归档间隔 (ms) / Balance snapshot archive interval (ms)
  balanceArchiveInterval: 60 * 60 * 1000, // 余额快照归档间隔 (ms)
  // 订单归档阈值 (秒) / Order archive threshold (seconds)
  orderArchiveAfterSeconds: 3600, // 订单归档阈值 (秒)
  // 持仓归档阈值 (秒) / Position archive threshold (seconds)
  positionArchiveAfterSeconds: 86400, // 持仓归档阈值 (秒)
  // 交易归档阈值 (秒) / Trade archive threshold (seconds)
  tradeArchiveAfterSeconds: 3600, // 交易归档阈值 (秒)
  // 审计日志归档阈值 (秒) / Audit log archive threshold (seconds)
  auditLogArchiveAfterSeconds: 300, // 审计日志归档阈值 (秒)
  // 是否在归档后删除 Redis 数据 / Whether to delete from Redis after archiving
  deleteAfterArchive: true, // 是否在归档后删除 Redis 数据
  // 批量大小 / Batch size
  batchSize: 100, // 批次大小
  // 是否启用 / Whether enabled
  enabled: true, // 启用
}; // 结束代码块

/**
 * 归档调度器类
 * Archive Scheduler Class
 */
class ArchiveScheduler extends EventEmitter { // 定义类 ArchiveScheduler(继承EventEmitter)
  constructor(options = {}) { // 构造函数
    super(); // 调用父类

    // 依赖 / Dependencies
    this.redisManager = options.redisManager; // 设置 redisManager
    this.clickhouse = options.clickhouse; // 设置 clickhouse

    // 配置 / Configuration
    this.config = { ...DEFAULT_CONFIG, ...options.config }; // 设置 config

    // 归档器 / Archivers
    this.orderArchiver = null; // 设置 orderArchiver
    this.auditLogWriter = null; // 设置 auditLogWriter

    // 定时器 / Timers
    this.timers = { // 设置 timers
      orders: null, // 订单
      positions: null, // 持仓
      trades: null, // 成交
      auditLogs: null, // 审计Logs
      balances: null, // 余额
    }; // 结束代码块

    // 状态 / State
    this.isRunning = false; // 设置 isRunning

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      orders: { archived: 0, lastRun: null, errors: 0 }, // 订单
      positions: { archived: 0, lastRun: null, errors: 0 }, // 持仓
      trades: { archived: 0, lastRun: null, errors: 0 }, // 成交
      auditLogs: { archived: 0, lastRun: null, errors: 0 }, // 审计Logs
      balances: { archived: 0, lastRun: null, errors: 0 }, // 余额
    }; // 结束代码块
  } // 结束代码块

  /**
   * 初始化归档器
   * Initialize archivers
   */
  async initialize() { // 执行语句
    // 初始化订单归档器 / Initialize order archiver
    if (this.redisManager?.orders) { // 条件判断 this.redisManager?.orders
      this.orderArchiver = new OrderArchiver( // 设置 orderArchiver
        this.redisManager.orders, // 访问 redisManager
        this.clickhouse, // 访问 clickhouse
        { // 开始代码块
          batchSize: this.config.batchSize, // 批次大小
          archiveAfterSeconds: this.config.orderArchiveAfterSeconds, // 归档之后秒
          deleteAfterArchive: this.config.deleteAfterArchive, // 删除之后归档
        } // 结束代码块
      ); // 结束调用或参数
    } // 结束代码块

    // 初始化审计日志写入器 / Initialize audit log writer
    this.auditLogWriter = new AuditLogWriter(this.clickhouse, { // 设置 auditLogWriter
      batchSize: this.config.batchSize, // 批次大小
      async: true, // 异步
    }); // 结束代码块

    this.emit('initialized'); // 调用 emit
  } // 结束代码块

  /**
   * 启动调度器
   * Start the scheduler
   */
  start() { // 调用 start
    if (this.isRunning || !this.config.enabled) return; // 条件判断 this.isRunning || !this.config.enabled

    this.isRunning = true; // 设置 isRunning

    // 启动审计日志写入器 / Start audit log writer
    if (this.auditLogWriter) { // 条件判断 this.auditLogWriter
      this.auditLogWriter.start(); // 访问 auditLogWriter
    } // 结束代码块

    // 订单归档定时器 / Order archive timer
    if (this.config.orderArchiveInterval > 0) { // 条件判断 this.config.orderArchiveInterval > 0
      this.timers.orders = setInterval( // 访问 timers
        () => this._runOrderArchive(), // 定义箭头函数
        this.config.orderArchiveInterval // 访问 config
      ); // 结束调用或参数
    } // 结束代码块

    // 持仓归档定时器 / Position archive timer
    if (this.config.positionArchiveInterval > 0) { // 条件判断 this.config.positionArchiveInterval > 0
      this.timers.positions = setInterval( // 访问 timers
        () => this._runPositionArchive(), // 定义箭头函数
        this.config.positionArchiveInterval // 访问 config
      ); // 结束调用或参数
    } // 结束代码块

    // 交易归档定时器 / Trade archive timer
    if (this.config.tradeArchiveInterval > 0) { // 条件判断 this.config.tradeArchiveInterval > 0
      this.timers.trades = setInterval( // 访问 timers
        () => this._runTradeArchive(), // 定义箭头函数
        this.config.tradeArchiveInterval // 访问 config
      ); // 结束调用或参数
    } // 结束代码块

    // 审计日志归档定时器 / Audit log archive timer
    if (this.config.auditLogArchiveInterval > 0) { // 条件判断 this.config.auditLogArchiveInterval > 0
      this.timers.auditLogs = setInterval( // 访问 timers
        () => this._runAuditLogArchive(), // 定义箭头函数
        this.config.auditLogArchiveInterval // 访问 config
      ); // 结束调用或参数
    } // 结束代码块

    // 余额快照归档定时器 / Balance snapshot archive timer
    if (this.config.balanceArchiveInterval > 0) { // 条件判断 this.config.balanceArchiveInterval > 0
      this.timers.balances = setInterval( // 访问 timers
        () => this._runBalanceArchive(), // 定义箭头函数
        this.config.balanceArchiveInterval // 访问 config
      ); // 结束调用或参数
    } // 结束代码块

    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止调度器
   * Stop the scheduler
   */
  async stop() { // 执行语句
    if (!this.isRunning) return; // 条件判断 !this.isRunning

    this.isRunning = false; // 设置 isRunning

    // 停止所有定时器 / Stop all timers
    for (const [name, timer] of Object.entries(this.timers)) { // 循环 const [name, timer] of Object.entries(this.ti...
      if (timer) { // 条件判断 timer
        clearInterval(timer); // 调用 clearInterval
        this.timers[name] = null; // 访问 timers
      } // 结束代码块
    } // 结束代码块

    // 停止审计日志写入器 / Stop audit log writer
    if (this.auditLogWriter) { // 条件判断 this.auditLogWriter
      await this.auditLogWriter.stop(); // 等待异步结果
    } // 结束代码块

    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  /**
   * 手动触发全量归档
   * Manually trigger full archive
   */
  async runAll() { // 执行语句
    const results = { // 定义常量 results
      orders: null, // 订单
      positions: null, // 持仓
      trades: null, // 成交
      auditLogs: null, // 审计Logs
      balances: null, // 余额
    }; // 结束代码块

    try { // 尝试执行
      results.orders = await this._runOrderArchive(); // 赋值 results.orders
      results.positions = await this._runPositionArchive(); // 赋值 results.positions
      results.trades = await this._runTradeArchive(); // 赋值 results.trades
      results.auditLogs = await this._runAuditLogArchive(); // 赋值 results.auditLogs
      results.balances = await this._runBalanceArchive(); // 赋值 results.balances
    } catch (error) { // 执行语句
      this.emit('error', error); // 调用 emit
    } // 结束代码块

    return results; // 返回结果
  } // 结束代码块

  // ============================================
  // 归档任务 / Archive Tasks
  // ============================================

  /**
   * 执行订单归档
   * Run order archive
   * @private
   */
  async _runOrderArchive() { // 执行语句
    if (!this.orderArchiver) return null; // 条件判断 !this.orderArchiver

    const startTime = Date.now(); // 定义常量 startTime

    try { // 尝试执行
      const result = await this.orderArchiver.archive(); // 定义常量 result

      this.stats.orders.archived += result.archived; // 访问 stats
      this.stats.orders.lastRun = new Date().toISOString(); // 访问 stats

      this.emit('archive:orders', { ...result, duration: Date.now() - startTime }); // 调用 emit

      return result; // 返回结果

    } catch (error) { // 执行语句
      this.stats.orders.errors++; // 访问 stats
      this.emit('error', { type: 'orders', error }); // 调用 emit
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行持仓归档
   * Run position archive
   * @private
   */
  async _runPositionArchive() { // 执行语句
    if (!this.redisManager?.positions) return null; // 条件判断 !this.redisManager?.positions

    const startTime = Date.now(); // 定义常量 startTime
    const result = { archived: 0, errors: [] }; // 定义常量 result

    try { // 尝试执行
      const cutoffTime = Date.now() - this.config.positionArchiveAfterSeconds * 1000; // 定义常量 cutoffTime

      // 获取已关闭的持仓 / Get closed positions
      const closedPositions = await this.redisManager.positions.getByStatus(POSITION_STATUS.CLOSED); // 定义常量 closedPositions
      const archivablePositions = closedPositions.filter(p => { // 定义函数 archivablePositions
        const closedAt = p.closedAt || p.updatedAt; // 定义常量 closedAt
        return closedAt && closedAt < cutoffTime; // 返回结果
      }); // 结束代码块

      if (archivablePositions.length > 0) { // 条件判断 archivablePositions.length > 0
        // 转换并写入 ClickHouse / Transform and write to ClickHouse
        const rows = archivablePositions.map(pos => this._transformPosition(pos)); // 定义函数 rows
        await this.clickhouse.insert('positions_archive', rows); // 等待异步结果
        result.archived = rows.length; // 赋值 result.archived

        // 删除 Redis 中的数据 / Delete from Redis
        if (this.config.deleteAfterArchive) { // 条件判断 this.config.deleteAfterArchive
          for (const pos of archivablePositions) { // 循环 const pos of archivablePositions
            await this.redisManager.positions.delete(pos.positionId); // 等待异步结果
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      this.stats.positions.archived += result.archived; // 访问 stats
      this.stats.positions.lastRun = new Date().toISOString(); // 访问 stats

      this.emit('archive:positions', { ...result, duration: Date.now() - startTime }); // 调用 emit

      return result; // 返回结果

    } catch (error) { // 执行语句
      this.stats.positions.errors++; // 访问 stats
      this.emit('error', { type: 'positions', error }); // 调用 emit
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行交易归档
   * Run trade archive
   * @private
   */
  async _runTradeArchive() { // 执行语句
    if (!this.redisManager?.redis) return null; // 条件判断 !this.redisManager?.redis

    const startTime = Date.now(); // 定义常量 startTime
    const result = { archived: 0, errors: [] }; // 定义常量 result

    try { // 尝试执行
      const cutoffTime = Date.now() - this.config.tradeArchiveAfterSeconds * 1000; // 定义常量 cutoffTime

      // 获取可归档的交易 / Get archivable trades
      const trades = await this.redisManager.getTradesByTimeRange(0, cutoffTime); // 定义常量 trades

      if (trades.length > 0) { // 条件判断 trades.length > 0
        // 分批处理 / Process in batches
        for (let i = 0; i < trades.length; i += this.config.batchSize) { // 循环 let i = 0; i < trades.length; i += this.confi...
          const batch = trades.slice(i, i + this.config.batchSize); // 定义常量 batch
          const rows = batch.map(trade => this._transformTrade(trade)); // 定义函数 rows

          await this.clickhouse.insert('trades', rows); // 等待异步结果
          result.archived += batch.length; // 执行语句
        } // 结束代码块

        // 删除 Redis 中的数据 (保留索引清理给 Redis 自己的 TTL)
        // Note: Redis TTL handles cleanup automatically
      } // 结束代码块

      this.stats.trades.archived += result.archived; // 访问 stats
      this.stats.trades.lastRun = new Date().toISOString(); // 访问 stats

      this.emit('archive:trades', { ...result, duration: Date.now() - startTime }); // 调用 emit

      return result; // 返回结果

    } catch (error) { // 执行语句
      this.stats.trades.errors++; // 访问 stats
      this.emit('error', { type: 'trades', error }); // 调用 emit
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行审计日志归档
   * Run audit log archive
   * @private
   */
  async _runAuditLogArchive() { // 执行语句
    if (!this.redisManager?.redis) return null; // 条件判断 !this.redisManager?.redis

    const startTime = Date.now(); // 定义常量 startTime
    const result = { archived: 0, errors: [] }; // 定义常量 result

    try { // 尝试执行
      const cutoffTime = Date.now() - this.config.auditLogArchiveAfterSeconds * 1000; // 定义常量 cutoffTime

      // 获取可归档的审计日志 / Get archivable audit logs
      const logs = await this.redisManager.getAuditLogs(0, cutoffTime, 1000); // 定义常量 logs

      if (logs.length > 0 && this.auditLogWriter) { // 条件判断 logs.length > 0 && this.auditLogWriter
        await this.auditLogWriter.writeBatch(logs); // 等待异步结果
        result.archived = logs.length; // 赋值 result.archived
      } // 结束代码块

      this.stats.auditLogs.archived += result.archived; // 访问 stats
      this.stats.auditLogs.lastRun = new Date().toISOString(); // 访问 stats

      this.emit('archive:auditLogs', { ...result, duration: Date.now() - startTime }); // 调用 emit

      return result; // 返回结果

    } catch (error) { // 执行语句
      this.stats.auditLogs.errors++; // 访问 stats
      this.emit('error', { type: 'auditLogs', error }); // 调用 emit
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 执行余额快照归档
   * Run balance snapshot archive
   * @private
   */
  async _runBalanceArchive() { // 执行语句
    // 余额快照归档逻辑 / Balance snapshot archive logic
    // 通过 Redis TTL 自动过期，这里可以选择性地归档到 ClickHouse
    const startTime = Date.now(); // 定义常量 startTime
    const result = { archived: 0, errors: [] }; // 定义常量 result

    // TODO: 实现余额快照归档逻辑
    // 当前余额快照在 Redis 中使用 TTL 自动过期

    this.stats.balances.lastRun = new Date().toISOString(); // 访问 stats
    this.emit('archive:balances', { ...result, duration: Date.now() - startTime }); // 调用 emit

    return result; // 返回结果
  } // 结束代码块

  // ============================================
  // 数据转换 / Data Transformation
  // ============================================

  /**
   * 转换持仓数据格式
   * Transform position data format
   * @private
   */
  _transformPosition(position) { // 调用 _transformPosition
    return { // 返回结果
      position_id: position.positionId || '', // 持仓ID
      symbol: position.symbol || '', // 交易对
      side: position.side || 'long', // 方向
      entry_price: position.entryPrice || 0, // 入场价格
      exit_price: position.currentPrice || 0, // 出场价格
      amount: position.amount || 0, // 数量
      leverage: position.leverage || 1, // 杠杆
      margin: position.margin || 0, // 保证金
      unrealized_pnl: position.unrealizedPnl || 0, // 未实现盈亏
      realized_pnl: position.realizedPnl || 0, // 已实现盈亏
      liquidation_price: position.liquidationPrice || 0, // 强平价格
      exchange: position.exchange || '', // 交易所
      strategy: position.strategy || '', // 策略
      opened_at: this._toDateTime(position.openedAt), // openedat
      closed_at: this._toDateTime(position.closedAt), // closedat
      status: position.status || 'closed', // 状态
      metadata: position.metadata ? JSON.stringify(position.metadata) : '', // 元数据
    }; // 结束代码块
  } // 结束代码块

  /**
   * 转换交易数据格式
   * Transform trade data format
   * @private
   */
  _transformTrade(trade) { // 调用 _transformTrade
    return { // 返回结果
      trade_id: trade.tradeId || '', // 交易ID
      order_id: trade.orderId || '', // 订单ID
      symbol: trade.symbol || '', // 交易对
      side: trade.side || 'buy', // 方向
      type: trade.type || 'market', // 类型
      amount: trade.amount || 0, // 数量
      price: trade.price || 0, // 价格
      cost: trade.cost || 0, // cost
      fee: trade.fee || 0, // 手续费
      fee_currency: trade.feeCurrency || '', // 手续费currency
      realized_pnl: trade.realizedPnl || 0, // 已实现盈亏
      exchange: trade.exchange || '', // 交易所
      strategy: trade.strategy || '', // 策略
      timestamp: this._toDateTime(trade.timestamp), // 时间戳
      metadata: trade.metadata ? JSON.stringify(trade.metadata) : '', // 元数据
    }; // 结束代码块
  } // 结束代码块

  /**
   * 转换时间戳为 DateTime 字符串
   * Convert timestamp to DateTime string
   * @private
   */
  _toDateTime(timestamp) { // 调用 _toDateTime
    if (!timestamp) { // 条件判断 !timestamp
      return '1970-01-01 00:00:00.000'; // 返回结果
    } // 结束代码块
    return new Date(timestamp).toISOString().replace('T', ' ').replace('Z', ''); // 返回结果
  } // 结束代码块

  // ============================================
  // 统计和状态 / Statistics and Status
  // ============================================

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      isRunning: this.isRunning, // 是否Running
      ...this.stats, // 展开对象或数组
    }; // 结束代码块
  } // 结束代码块

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() { // 调用 resetStats
    for (const key of Object.keys(this.stats)) { // 循环 const key of Object.keys(this.stats)
      this.stats[key] = { archived: 0, lastRun: null, errors: 0 }; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取审计日志写入器
   * Get audit log writer
   */
  getAuditLogWriter() { // 调用 getAuditLogWriter
    return this.auditLogWriter; // 返回结果
  } // 结束代码块
} // 结束代码块

export { ArchiveScheduler }; // 导出命名成员
export default ArchiveScheduler; // 默认导出
