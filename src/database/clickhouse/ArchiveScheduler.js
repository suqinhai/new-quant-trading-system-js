/**
 * 定时归档调度器
 * Scheduled Archive Scheduler
 *
 * 定期将 Redis 中的数据归档到 ClickHouse
 * Periodically archives data from Redis to ClickHouse
 *
 * @module src/database/clickhouse/ArchiveScheduler
 */

import { EventEmitter } from 'events';
import { OrderArchiver } from './OrderArchiver.js';
import { AuditLogWriter } from './AuditLogWriter.js';
import { POSITION_STATUS } from '../redis/PositionStore.js';

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // 订单归档间隔 (ms) / Order archive interval (ms)
  orderArchiveInterval: 60 * 60 * 1000, // 1 hour
  // 持仓归档间隔 (ms) / Position archive interval (ms)
  positionArchiveInterval: 60 * 60 * 1000, // 1 hour
  // 交易归档间隔 (ms) / Trade archive interval (ms)
  tradeArchiveInterval: 30 * 60 * 1000, // 30 minutes
  // 审计日志归档间隔 (ms) / Audit log archive interval (ms)
  auditLogArchiveInterval: 10 * 60 * 1000, // 10 minutes
  // 余额快照归档间隔 (ms) / Balance snapshot archive interval (ms)
  balanceArchiveInterval: 60 * 60 * 1000, // 1 hour
  // 订单归档阈值 (秒) / Order archive threshold (seconds)
  orderArchiveAfterSeconds: 3600, // 1 hour
  // 持仓归档阈值 (秒) / Position archive threshold (seconds)
  positionArchiveAfterSeconds: 86400, // 24 hours
  // 交易归档阈值 (秒) / Trade archive threshold (seconds)
  tradeArchiveAfterSeconds: 3600, // 1 hour
  // 审计日志归档阈值 (秒) / Audit log archive threshold (seconds)
  auditLogArchiveAfterSeconds: 300, // 5 minutes
  // 是否在归档后删除 Redis 数据 / Whether to delete from Redis after archiving
  deleteAfterArchive: true,
  // 批量大小 / Batch size
  batchSize: 100,
  // 是否启用 / Whether enabled
  enabled: true,
};

/**
 * 归档调度器类
 * Archive Scheduler Class
 */
class ArchiveScheduler extends EventEmitter {
  constructor(options = {}) {
    super();

    // 依赖 / Dependencies
    this.redisManager = options.redisManager;
    this.clickhouse = options.clickhouse;

    // 配置 / Configuration
    this.config = { ...DEFAULT_CONFIG, ...options.config };

    // 归档器 / Archivers
    this.orderArchiver = null;
    this.auditLogWriter = null;

    // 定时器 / Timers
    this.timers = {
      orders: null,
      positions: null,
      trades: null,
      auditLogs: null,
      balances: null,
    };

    // 状态 / State
    this.isRunning = false;

    // 统计信息 / Statistics
    this.stats = {
      orders: { archived: 0, lastRun: null, errors: 0 },
      positions: { archived: 0, lastRun: null, errors: 0 },
      trades: { archived: 0, lastRun: null, errors: 0 },
      auditLogs: { archived: 0, lastRun: null, errors: 0 },
      balances: { archived: 0, lastRun: null, errors: 0 },
    };
  }

  /**
   * 初始化归档器
   * Initialize archivers
   */
  async initialize() {
    // 初始化订单归档器 / Initialize order archiver
    if (this.redisManager?.orders) {
      this.orderArchiver = new OrderArchiver(
        this.redisManager.orders,
        this.clickhouse,
        {
          batchSize: this.config.batchSize,
          archiveAfterSeconds: this.config.orderArchiveAfterSeconds,
          deleteAfterArchive: this.config.deleteAfterArchive,
        }
      );
    }

    // 初始化审计日志写入器 / Initialize audit log writer
    this.auditLogWriter = new AuditLogWriter(this.clickhouse, {
      batchSize: this.config.batchSize,
      async: true,
    });

    this.emit('initialized');
  }

  /**
   * 启动调度器
   * Start the scheduler
   */
  start() {
    if (this.isRunning || !this.config.enabled) return;

    this.isRunning = true;

    // 启动审计日志写入器 / Start audit log writer
    if (this.auditLogWriter) {
      this.auditLogWriter.start();
    }

    // 订单归档定时器 / Order archive timer
    if (this.config.orderArchiveInterval > 0) {
      this.timers.orders = setInterval(
        () => this._runOrderArchive(),
        this.config.orderArchiveInterval
      );
    }

    // 持仓归档定时器 / Position archive timer
    if (this.config.positionArchiveInterval > 0) {
      this.timers.positions = setInterval(
        () => this._runPositionArchive(),
        this.config.positionArchiveInterval
      );
    }

    // 交易归档定时器 / Trade archive timer
    if (this.config.tradeArchiveInterval > 0) {
      this.timers.trades = setInterval(
        () => this._runTradeArchive(),
        this.config.tradeArchiveInterval
      );
    }

    // 审计日志归档定时器 / Audit log archive timer
    if (this.config.auditLogArchiveInterval > 0) {
      this.timers.auditLogs = setInterval(
        () => this._runAuditLogArchive(),
        this.config.auditLogArchiveInterval
      );
    }

    // 余额快照归档定时器 / Balance snapshot archive timer
    if (this.config.balanceArchiveInterval > 0) {
      this.timers.balances = setInterval(
        () => this._runBalanceArchive(),
        this.config.balanceArchiveInterval
      );
    }

    this.emit('started');
  }

  /**
   * 停止调度器
   * Stop the scheduler
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // 停止所有定时器 / Stop all timers
    for (const [name, timer] of Object.entries(this.timers)) {
      if (timer) {
        clearInterval(timer);
        this.timers[name] = null;
      }
    }

    // 停止审计日志写入器 / Stop audit log writer
    if (this.auditLogWriter) {
      await this.auditLogWriter.stop();
    }

    this.emit('stopped');
  }

  /**
   * 手动触发全量归档
   * Manually trigger full archive
   */
  async runAll() {
    const results = {
      orders: null,
      positions: null,
      trades: null,
      auditLogs: null,
      balances: null,
    };

    try {
      results.orders = await this._runOrderArchive();
      results.positions = await this._runPositionArchive();
      results.trades = await this._runTradeArchive();
      results.auditLogs = await this._runAuditLogArchive();
      results.balances = await this._runBalanceArchive();
    } catch (error) {
      this.emit('error', error);
    }

    return results;
  }

  // ============================================
  // 归档任务 / Archive Tasks
  // ============================================

  /**
   * 执行订单归档
   * Run order archive
   * @private
   */
  async _runOrderArchive() {
    if (!this.orderArchiver) return null;

    const startTime = Date.now();

    try {
      const result = await this.orderArchiver.archive();

      this.stats.orders.archived += result.archived;
      this.stats.orders.lastRun = new Date().toISOString();

      this.emit('archive:orders', { ...result, duration: Date.now() - startTime });

      return result;

    } catch (error) {
      this.stats.orders.errors++;
      this.emit('error', { type: 'orders', error });
      return null;
    }
  }

  /**
   * 执行持仓归档
   * Run position archive
   * @private
   */
  async _runPositionArchive() {
    if (!this.redisManager?.positions) return null;

    const startTime = Date.now();
    const result = { archived: 0, errors: [] };

    try {
      const cutoffTime = Date.now() - this.config.positionArchiveAfterSeconds * 1000;

      // 获取已关闭的持仓 / Get closed positions
      const closedPositions = await this.redisManager.positions.getByStatus(POSITION_STATUS.CLOSED);
      const archivablePositions = closedPositions.filter(p => {
        const closedAt = p.closedAt || p.updatedAt;
        return closedAt && closedAt < cutoffTime;
      });

      if (archivablePositions.length > 0) {
        // 转换并写入 ClickHouse / Transform and write to ClickHouse
        const rows = archivablePositions.map(pos => this._transformPosition(pos));
        await this.clickhouse.insert('positions_archive', rows);
        result.archived = rows.length;

        // 删除 Redis 中的数据 / Delete from Redis
        if (this.config.deleteAfterArchive) {
          for (const pos of archivablePositions) {
            await this.redisManager.positions.delete(pos.positionId);
          }
        }
      }

      this.stats.positions.archived += result.archived;
      this.stats.positions.lastRun = new Date().toISOString();

      this.emit('archive:positions', { ...result, duration: Date.now() - startTime });

      return result;

    } catch (error) {
      this.stats.positions.errors++;
      this.emit('error', { type: 'positions', error });
      return null;
    }
  }

  /**
   * 执行交易归档
   * Run trade archive
   * @private
   */
  async _runTradeArchive() {
    if (!this.redisManager?.redis) return null;

    const startTime = Date.now();
    const result = { archived: 0, errors: [] };

    try {
      const cutoffTime = Date.now() - this.config.tradeArchiveAfterSeconds * 1000;

      // 获取可归档的交易 / Get archivable trades
      const trades = await this.redisManager.getTradesByTimeRange(0, cutoffTime);

      if (trades.length > 0) {
        // 分批处理 / Process in batches
        for (let i = 0; i < trades.length; i += this.config.batchSize) {
          const batch = trades.slice(i, i + this.config.batchSize);
          const rows = batch.map(trade => this._transformTrade(trade));

          await this.clickhouse.insert('trades', rows);
          result.archived += batch.length;
        }

        // 删除 Redis 中的数据 (保留索引清理给 Redis 自己的 TTL)
        // Note: Redis TTL handles cleanup automatically
      }

      this.stats.trades.archived += result.archived;
      this.stats.trades.lastRun = new Date().toISOString();

      this.emit('archive:trades', { ...result, duration: Date.now() - startTime });

      return result;

    } catch (error) {
      this.stats.trades.errors++;
      this.emit('error', { type: 'trades', error });
      return null;
    }
  }

  /**
   * 执行审计日志归档
   * Run audit log archive
   * @private
   */
  async _runAuditLogArchive() {
    if (!this.redisManager?.redis) return null;

    const startTime = Date.now();
    const result = { archived: 0, errors: [] };

    try {
      const cutoffTime = Date.now() - this.config.auditLogArchiveAfterSeconds * 1000;

      // 获取可归档的审计日志 / Get archivable audit logs
      const logs = await this.redisManager.getAuditLogs(0, cutoffTime, 1000);

      if (logs.length > 0 && this.auditLogWriter) {
        await this.auditLogWriter.writeBatch(logs);
        result.archived = logs.length;
      }

      this.stats.auditLogs.archived += result.archived;
      this.stats.auditLogs.lastRun = new Date().toISOString();

      this.emit('archive:auditLogs', { ...result, duration: Date.now() - startTime });

      return result;

    } catch (error) {
      this.stats.auditLogs.errors++;
      this.emit('error', { type: 'auditLogs', error });
      return null;
    }
  }

  /**
   * 执行余额快照归档
   * Run balance snapshot archive
   * @private
   */
  async _runBalanceArchive() {
    // 余额快照归档逻辑 / Balance snapshot archive logic
    // 通过 Redis TTL 自动过期，这里可以选择性地归档到 ClickHouse
    const startTime = Date.now();
    const result = { archived: 0, errors: [] };

    // TODO: 实现余额快照归档逻辑
    // 当前余额快照在 Redis 中使用 TTL 自动过期

    this.stats.balances.lastRun = new Date().toISOString();
    this.emit('archive:balances', { ...result, duration: Date.now() - startTime });

    return result;
  }

  // ============================================
  // 数据转换 / Data Transformation
  // ============================================

  /**
   * 转换持仓数据格式
   * Transform position data format
   * @private
   */
  _transformPosition(position) {
    return {
      position_id: position.positionId || '',
      symbol: position.symbol || '',
      side: position.side || 'long',
      entry_price: position.entryPrice || 0,
      exit_price: position.currentPrice || 0,
      amount: position.amount || 0,
      leverage: position.leverage || 1,
      margin: position.margin || 0,
      unrealized_pnl: position.unrealizedPnl || 0,
      realized_pnl: position.realizedPnl || 0,
      liquidation_price: position.liquidationPrice || 0,
      exchange: position.exchange || '',
      strategy: position.strategy || '',
      opened_at: this._toDateTime(position.openedAt),
      closed_at: this._toDateTime(position.closedAt),
      status: position.status || 'closed',
      metadata: position.metadata ? JSON.stringify(position.metadata) : '',
    };
  }

  /**
   * 转换交易数据格式
   * Transform trade data format
   * @private
   */
  _transformTrade(trade) {
    return {
      trade_id: trade.tradeId || '',
      order_id: trade.orderId || '',
      symbol: trade.symbol || '',
      side: trade.side || 'buy',
      type: trade.type || 'market',
      amount: trade.amount || 0,
      price: trade.price || 0,
      cost: trade.cost || 0,
      fee: trade.fee || 0,
      fee_currency: trade.feeCurrency || '',
      realized_pnl: trade.realizedPnl || 0,
      exchange: trade.exchange || '',
      strategy: trade.strategy || '',
      timestamp: this._toDateTime(trade.timestamp),
      metadata: trade.metadata ? JSON.stringify(trade.metadata) : '',
    };
  }

  /**
   * 转换时间戳为 DateTime 字符串
   * Convert timestamp to DateTime string
   * @private
   */
  _toDateTime(timestamp) {
    if (!timestamp) {
      return '1970-01-01 00:00:00.000';
    }
    return new Date(timestamp).toISOString().replace('T', ' ').replace('Z', '');
  }

  // ============================================
  // 统计和状态 / Statistics and Status
  // ============================================

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      ...this.stats,
    };
  }

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() {
    for (const key of Object.keys(this.stats)) {
      this.stats[key] = { archived: 0, lastRun: null, errors: 0 };
    }
  }

  /**
   * 获取审计日志写入器
   * Get audit log writer
   */
  getAuditLogWriter() {
    return this.auditLogWriter;
  }
}

export { ArchiveScheduler };
export default ArchiveScheduler;
