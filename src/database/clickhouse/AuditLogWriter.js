/**
 * 审计日志写入器
 * Audit Log Writer
 *
 * 将审计日志写入 ClickHouse 进行长期存储和分析
 * Writes audit logs to ClickHouse for long-term storage and analysis
 *
 * @module src/database/clickhouse/AuditLogWriter
 */

import { EventEmitter } from 'events';

/**
 * 日志级别枚举
 * Log level enum
 */
const LOG_LEVEL = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // 批量写入大小 / Batch write size
  batchSize: 100,
  // 刷新间隔 (ms) / Flush interval (ms)
  flushInterval: 5000,
  // 是否异步写入 / Whether to write asynchronously
  async: true,
  // 最大缓冲区大小 / Max buffer size
  maxBufferSize: 1000,
  // 重试次数 / Retry count
  maxRetries: 3,
};

/**
 * 审计日志写入器类
 * Audit Log Writer Class
 */
class AuditLogWriter extends EventEmitter {
  constructor(clickHouseClient, config = {}) {
    super();

    this.clickhouse = clickHouseClient;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 日志缓冲区 / Log buffer
    this.buffer = [];

    // 刷新定时器 / Flush timer
    this.flushTimer = null;

    // 状态 / State
    this.isRunning = false;
    this.isFlushing = false;

    // 统计信息 / Statistics
    this.stats = {
      totalWritten: 0,
      totalErrors: 0,
      lastFlushTime: null,
      bufferSize: 0,
    };
  }

  /**
   * 启动写入器
   * Start the writer
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // 启动定时刷新 / Start periodic flush
    if (this.config.async && this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch(err => this.emit('error', err));
      }, this.config.flushInterval);
    }

    this.emit('started');
  }

  /**
   * 停止写入器
   * Stop the writer
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // 停止定时器 / Stop timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // 刷新剩余日志 / Flush remaining logs
    await this.flush();

    this.emit('stopped');
  }

  /**
   * 写入单条审计日志
   * Write single audit log
   *
   * @param {Object} log - 日志数据 / Log data
   */
  async write(log) {
    const formattedLog = this._formatLog(log);

    if (this.config.async) {
      // 异步模式: 添加到缓冲区 / Async mode: add to buffer
      this.buffer.push(formattedLog);
      this.stats.bufferSize = this.buffer.length;

      // 检查是否需要刷新 / Check if flush is needed
      if (this.buffer.length >= this.config.batchSize) {
        await this.flush();
      }

      // 检查缓冲区是否过大 / Check if buffer is too large
      if (this.buffer.length >= this.config.maxBufferSize) {
        this.emit('buffer:overflow', { size: this.buffer.length });
        await this.flush();
      }

    } else {
      // 同步模式: 直接写入 / Sync mode: write directly
      await this._writeBatch([formattedLog]);
    }
  }

  /**
   * 批量写入审计日志
   * Write batch of audit logs
   *
   * @param {Array} logs - 日志数组 / Log array
   */
  async writeBatch(logs) {
    const formattedLogs = logs.map(log => this._formatLog(log));

    if (this.config.async) {
      this.buffer.push(...formattedLogs);
      this.stats.bufferSize = this.buffer.length;

      if (this.buffer.length >= this.config.batchSize) {
        await this.flush();
      }
    } else {
      await this._writeBatch(formattedLogs);
    }
  }

  /**
   * 刷新缓冲区到 ClickHouse
   * Flush buffer to ClickHouse
   */
  async flush() {
    if (this.isFlushing || this.buffer.length === 0) {
      return { flushed: 0 };
    }

    this.isFlushing = true;
    const logsToFlush = [...this.buffer];
    this.buffer = [];
    this.stats.bufferSize = 0;

    try {
      await this._writeBatch(logsToFlush);

      this.stats.totalWritten += logsToFlush.length;
      this.stats.lastFlushTime = new Date().toISOString();

      this.emit('flush', { count: logsToFlush.length });

      return { flushed: logsToFlush.length };

    } catch (error) {
      // 写入失败时恢复缓冲区 / Restore buffer on write failure
      this.buffer = [...logsToFlush, ...this.buffer];
      this.stats.bufferSize = this.buffer.length;
      this.stats.totalErrors++;

      this.emit('error', error);
      throw error;

    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * 格式化日志
   * Format log
   *
   * @param {Object} log - 原始日志 / Raw log
   * @returns {Object} 格式化后的日志 / Formatted log
   * @private
   */
  _formatLog(log) {
    const timestamp = log.timestamp
      ? new Date(log.timestamp).toISOString().replace('T', ' ').replace('Z', '')
      : new Date().toISOString().replace('T', ' ').replace('Z', '');

    return {
      log_id: log.id || log.logId || this._generateLogId(),
      event_type: log.eventType || 'unknown',
      level: log.level || LOG_LEVEL.INFO,
      timestamp,
      data: log.data ? JSON.stringify(log.data) : '',
      metadata: log.metadata ? JSON.stringify(log.metadata) : '',
      prev_hash: log.prevHash || '',
      hash: log.hash || '',
    };
  }

  /**
   * 生成日志 ID
   * Generate log ID
   *
   * @returns {string} 日志 ID / Log ID
   * @private
   */
  _generateLogId() {
    return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 批量写入到 ClickHouse
   * Write batch to ClickHouse
   *
   * @param {Array} logs - 日志数组 / Log array
   * @private
   */
  async _writeBatch(logs) {
    let retries = 0;
    let lastError;

    while (retries < this.config.maxRetries) {
      try {
        await this.clickhouse.insert('audit_logs', logs);
        return;
      } catch (error) {
        lastError = error;
        retries++;

        if (retries < this.config.maxRetries) {
          // 等待后重试 / Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    }

    throw lastError;
  }

  // ============================================
  // 便捷方法 / Convenience Methods
  // ============================================

  /**
   * 记录信息级别日志
   * Log info level
   *
   * @param {string} eventType - 事件类型 / Event type
   * @param {Object} data - 数据 / Data
   * @param {Object} metadata - 元数据 / Metadata
   */
  async info(eventType, data = {}, metadata = {}) {
    await this.write({
      eventType,
      level: LOG_LEVEL.INFO,
      data,
      metadata,
      timestamp: Date.now(),
    });
  }

  /**
   * 记录警告级别日志
   * Log warning level
   *
   * @param {string} eventType - 事件类型 / Event type
   * @param {Object} data - 数据 / Data
   * @param {Object} metadata - 元数据 / Metadata
   */
  async warning(eventType, data = {}, metadata = {}) {
    await this.write({
      eventType,
      level: LOG_LEVEL.WARNING,
      data,
      metadata,
      timestamp: Date.now(),
    });
  }

  /**
   * 记录严重级别日志
   * Log critical level
   *
   * @param {string} eventType - 事件类型 / Event type
   * @param {Object} data - 数据 / Data
   * @param {Object} metadata - 元数据 / Metadata
   */
  async critical(eventType, data = {}, metadata = {}) {
    await this.write({
      eventType,
      level: LOG_LEVEL.CRITICAL,
      data,
      metadata,
      timestamp: Date.now(),
    });
  }

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 查询审计日志
   * Query audit logs
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 日志数组 / Log array
   */
  async query(options = {}) {
    const {
      eventType,
      level,
      startTime,
      endTime,
      limit = 100,
      offset = 0,
    } = options;

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = {};

    if (eventType) {
      query += ' AND event_type = {eventType:String}';
      params.eventType = eventType;
    }

    if (level) {
      query += ' AND level = {level:String}';
      params.level = level;
    }

    if (startTime) {
      query += ' AND timestamp >= {startTime:DateTime64(3)}';
      params.startTime = new Date(startTime).toISOString().replace('T', ' ').replace('Z', '');
    }

    if (endTime) {
      query += ' AND timestamp <= {endTime:DateTime64(3)}';
      params.endTime = new Date(endTime).toISOString().replace('T', ' ').replace('Z', '');
    }

    query += ' ORDER BY timestamp DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}';
    params.limit = limit;
    params.offset = offset;

    return this.clickhouse.query(query, params);
  }

  /**
   * 获取事件类型统计
   * Get event type statistics
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 统计数组 / Statistics array
   */
  async getEventStats(options = {}) {
    const { startTime, endTime } = options;

    let query = `
      SELECT
        event_type,
        level,
        count() as count,
        min(timestamp) as first_occurrence,
        max(timestamp) as last_occurrence
      FROM audit_logs
      WHERE 1=1
    `;
    const params = {};

    if (startTime) {
      query += ' AND timestamp >= {startTime:DateTime64(3)}';
      params.startTime = new Date(startTime).toISOString().replace('T', ' ').replace('Z', '');
    }

    if (endTime) {
      query += ' AND timestamp <= {endTime:DateTime64(3)}';
      params.endTime = new Date(endTime).toISOString().replace('T', ' ').replace('Z', '');
    }

    query += ' GROUP BY event_type, level ORDER BY count DESC';

    return this.clickhouse.query(query, params);
  }

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

export { AuditLogWriter, LOG_LEVEL };
export default AuditLogWriter;
