/**
 * 审计日志写入器
 * Audit Log Writer
 *
 * 将审计日志写入 ClickHouse 进行长期存储和分析
 * Writes audit logs to ClickHouse for long-term storage and analysis
 *
 * @module src/database/clickhouse/AuditLogWriter
 */

import { EventEmitter } from 'events'; // 导入模块 events

/**
 * 日志级别枚举
 * Log level enum
 */
const LOG_LEVEL = { // 定义常量 LOG_LEVEL
  INFO: 'info', // 设置 INFO 字段
  WARNING: 'warning', // 设置 WARNING 字段
  CRITICAL: 'critical', // 设置 CRITICAL 字段
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // 批量写入大小 / Batch write size
  batchSize: 100, // 设置 batchSize 字段
  // 刷新间隔 (ms) / Flush interval (ms)
  flushInterval: 5000, // 设置 flushInterval 字段
  // 是否异步写入 / Whether to write asynchronously
  async: true, // 设置 async 字段
  // 最大缓冲区大小 / Max buffer size
  maxBufferSize: 1000, // 设置 maxBufferSize 字段
  // 重试次数 / Retry count
  maxRetries: 3, // 设置 maxRetries 字段
}; // 结束代码块

/**
 * 审计日志写入器类
 * Audit Log Writer Class
 */
class AuditLogWriter extends EventEmitter { // 定义类 AuditLogWriter(继承EventEmitter)
  constructor(clickHouseClient, config = {}) { // 构造函数
    super(); // 调用父类

    this.clickhouse = clickHouseClient; // 设置 clickhouse
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 日志缓冲区 / Log buffer
    this.buffer = []; // 设置 buffer

    // 刷新定时器 / Flush timer
    this.flushTimer = null; // 设置 flushTimer

    // 状态 / State
    this.isRunning = false; // 设置 isRunning
    this.isFlushing = false; // 设置 isFlushing

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalWritten: 0, // 设置 totalWritten 字段
      totalErrors: 0, // 设置 totalErrors 字段
      lastFlushTime: null, // 设置 lastFlushTime 字段
      bufferSize: 0, // 设置 bufferSize 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 启动写入器
   * Start the writer
   */
  start() { // 调用 start
    if (this.isRunning) return; // 条件判断 this.isRunning

    this.isRunning = true; // 设置 isRunning

    // 启动定时刷新 / Start periodic flush
    if (this.config.async && this.config.flushInterval > 0) { // 条件判断 this.config.async && this.config.flushInterva...
      this.flushTimer = setInterval(() => { // 设置 flushTimer
        this.flush().catch(err => this.emit('error', err)); // 调用 flush
      }, this.config.flushInterval); // 执行语句
    } // 结束代码块

    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止写入器
   * Stop the writer
   */
  async stop() { // 执行语句
    if (!this.isRunning) return; // 条件判断 !this.isRunning

    this.isRunning = false; // 设置 isRunning

    // 停止定时器 / Stop timer
    if (this.flushTimer) { // 条件判断 this.flushTimer
      clearInterval(this.flushTimer); // 调用 clearInterval
      this.flushTimer = null; // 设置 flushTimer
    } // 结束代码块

    // 刷新剩余日志 / Flush remaining logs
    await this.flush(); // 等待异步结果

    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  /**
   * 写入单条审计日志
   * Write single audit log
   *
   * @param {Object} log - 日志数据 / Log data
   */
  async write(log) { // 执行语句
    const formattedLog = this._formatLog(log); // 定义常量 formattedLog

    if (this.config.async) { // 条件判断 this.config.async
      // 异步模式: 添加到缓冲区 / Async mode: add to buffer
      this.buffer.push(formattedLog); // 访问 buffer
      this.stats.bufferSize = this.buffer.length; // 访问 stats

      // 检查是否需要刷新 / Check if flush is needed
      if (this.buffer.length >= this.config.batchSize) { // 条件判断 this.buffer.length >= this.config.batchSize
        await this.flush(); // 等待异步结果
      } // 结束代码块

      // 检查缓冲区是否过大 / Check if buffer is too large
      if (this.buffer.length >= this.config.maxBufferSize) { // 条件判断 this.buffer.length >= this.config.maxBufferSize
        this.emit('buffer:overflow', { size: this.buffer.length }); // 调用 emit
        await this.flush(); // 等待异步结果
      } // 结束代码块

    } else { // 执行语句
      // 同步模式: 直接写入 / Sync mode: write directly
      await this._writeBatch([formattedLog]); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 批量写入审计日志
   * Write batch of audit logs
   *
   * @param {Array} logs - 日志数组 / Log array
   */
  async writeBatch(logs) { // 执行语句
    const formattedLogs = logs.map(log => this._formatLog(log)); // 定义函数 formattedLogs

    if (this.config.async) { // 条件判断 this.config.async
      this.buffer.push(...formattedLogs); // 访问 buffer
      this.stats.bufferSize = this.buffer.length; // 访问 stats

      if (this.buffer.length >= this.config.batchSize) { // 条件判断 this.buffer.length >= this.config.batchSize
        await this.flush(); // 等待异步结果
      } // 结束代码块
    } else { // 执行语句
      await this._writeBatch(formattedLogs); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 刷新缓冲区到 ClickHouse
   * Flush buffer to ClickHouse
   */
  async flush() { // 执行语句
    if (this.isFlushing || this.buffer.length === 0) { // 条件判断 this.isFlushing || this.buffer.length === 0
      return { flushed: 0 }; // 返回结果
    } // 结束代码块

    this.isFlushing = true; // 设置 isFlushing
    const logsToFlush = [...this.buffer]; // 定义常量 logsToFlush
    this.buffer = []; // 设置 buffer
    this.stats.bufferSize = 0; // 访问 stats

    try { // 尝试执行
      await this._writeBatch(logsToFlush); // 等待异步结果

      this.stats.totalWritten += logsToFlush.length; // 访问 stats
      this.stats.lastFlushTime = new Date().toISOString(); // 访问 stats

      this.emit('flush', { count: logsToFlush.length }); // 调用 emit

      return { flushed: logsToFlush.length }; // 返回结果

    } catch (error) { // 执行语句
      // 写入失败时恢复缓冲区 / Restore buffer on write failure
      this.buffer = [...logsToFlush, ...this.buffer]; // 设置 buffer
      this.stats.bufferSize = this.buffer.length; // 访问 stats
      this.stats.totalErrors++; // 访问 stats

      this.emit('error', error); // 调用 emit
      throw error; // 抛出异常

    } finally { // 执行语句
      this.isFlushing = false; // 设置 isFlushing
    } // 结束代码块
  } // 结束代码块

  /**
   * 格式化日志
   * Format log
   *
   * @param {Object} log - 原始日志 / Raw log
   * @returns {Object} 格式化后的日志 / Formatted log
   * @private
   */
  _formatLog(log) { // 调用 _formatLog
    const timestamp = log.timestamp // 定义常量 timestamp
      ? new Date(log.timestamp).toISOString().replace('T', ' ').replace('Z', '') // 执行语句
      : new Date().toISOString().replace('T', ' ').replace('Z', ''); // 执行语句

    return { // 返回结果
      log_id: log.id || log.logId || this._generateLogId(), // 设置 log_id 字段
      event_type: log.eventType || 'unknown', // 设置 event_type 字段
      level: log.level || LOG_LEVEL.INFO, // 设置 level 字段
      timestamp, // 执行语句
      data: log.data ? JSON.stringify(log.data) : '', // 设置 data 字段
      metadata: log.metadata ? JSON.stringify(log.metadata) : '', // 设置 metadata 字段
      prev_hash: log.prevHash || '', // 设置 prev_hash 字段
      hash: log.hash || '', // 设置 hash 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 生成日志 ID
   * Generate log ID
   *
   * @returns {string} 日志 ID / Log ID
   * @private
   */
  _generateLogId() { // 调用 _generateLogId
    return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; // 返回结果
  } // 结束代码块

  /**
   * 批量写入到 ClickHouse
   * Write batch to ClickHouse
   *
   * @param {Array} logs - 日志数组 / Log array
   * @private
   */
  async _writeBatch(logs) { // 执行语句
    let retries = 0; // 定义变量 retries
    let lastError; // 定义变量 lastError

    while (retries < this.config.maxRetries) { // 循环条件 retries < this.config.maxRetries
      try { // 尝试执行
        await this.clickhouse.insert('audit_logs', logs); // 等待异步结果
        return; // 返回结果
      } catch (error) { // 执行语句
        lastError = error; // 赋值 lastError
        retries++; // 执行语句

        if (retries < this.config.maxRetries) { // 条件判断 retries < this.config.maxRetries
          // 等待后重试 / Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retries)); // 等待异步结果
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    throw lastError; // 抛出异常
  } // 结束代码块

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
  async info(eventType, data = {}, metadata = {}) { // 执行语句
    await this.write({ // 等待异步结果
      eventType, // 执行语句
      level: LOG_LEVEL.INFO, // 设置 level 字段
      data, // 执行语句
      metadata, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录警告级别日志
   * Log warning level
   *
   * @param {string} eventType - 事件类型 / Event type
   * @param {Object} data - 数据 / Data
   * @param {Object} metadata - 元数据 / Metadata
   */
  async warning(eventType, data = {}, metadata = {}) { // 执行语句
    await this.write({ // 等待异步结果
      eventType, // 执行语句
      level: LOG_LEVEL.WARNING, // 设置 level 字段
      data, // 执行语句
      metadata, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录严重级别日志
   * Log critical level
   *
   * @param {string} eventType - 事件类型 / Event type
   * @param {Object} data - 数据 / Data
   * @param {Object} metadata - 元数据 / Metadata
   */
  async critical(eventType, data = {}, metadata = {}) { // 执行语句
    await this.write({ // 等待异步结果
      eventType, // 执行语句
      level: LOG_LEVEL.CRITICAL, // 设置 level 字段
      data, // 执行语句
      metadata, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块
  } // 结束代码块

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
  async query(options = {}) { // 执行语句
    const { // 解构赋值
      eventType, // 执行语句
      level, // 执行语句
      startTime, // 执行语句
      endTime, // 执行语句
      limit = 100, // 赋值 limit
      offset = 0, // 赋值 offset
    } = options; // 执行语句

    let query = 'SELECT * FROM audit_logs WHERE 1=1'; // 定义变量 query
    const params = {}; // 定义常量 params

    if (eventType) { // 条件判断 eventType
      query += ' AND event_type = {eventType:String}'; // 执行语句
      params.eventType = eventType; // 赋值 params.eventType
    } // 结束代码块

    if (level) { // 条件判断 level
      query += ' AND level = {level:String}'; // 执行语句
      params.level = level; // 赋值 params.level
    } // 结束代码块

    if (startTime) { // 条件判断 startTime
      query += ' AND timestamp >= {startTime:DateTime64(3)}'; // 执行语句
      params.startTime = new Date(startTime).toISOString().replace('T', ' ').replace('Z', ''); // 赋值 params.startTime
    } // 结束代码块

    if (endTime) { // 条件判断 endTime
      query += ' AND timestamp <= {endTime:DateTime64(3)}'; // 执行语句
      params.endTime = new Date(endTime).toISOString().replace('T', ' ').replace('Z', ''); // 赋值 params.endTime
    } // 结束代码块

    query += ' ORDER BY timestamp DESC LIMIT {limit:UInt32} OFFSET {offset:UInt32}'; // 执行语句
    params.limit = limit; // 赋值 params.limit
    params.offset = offset; // 赋值 params.offset

    return this.clickhouse.query(query, params); // 返回结果
  } // 结束代码块

  /**
   * 获取事件类型统计
   * Get event type statistics
   *
   * @param {Object} options - 查询选项 / Query options
   * @returns {Array} 统计数组 / Statistics array
   */
  async getEventStats(options = {}) { // 执行语句
    const { startTime, endTime } = options; // 解构赋值

    let query = `
      SELECT
        event_type,
        level,
        count() as count,
        min(timestamp) as first_occurrence,
        max(timestamp) as last_occurrence
      FROM audit_logs
      WHERE 1=1
    `; // 执行语句
    const params = {}; // 定义常量 params

    if (startTime) { // 条件判断 startTime
      query += ' AND timestamp >= {startTime:DateTime64(3)}'; // 执行语句
      params.startTime = new Date(startTime).toISOString().replace('T', ' ').replace('Z', ''); // 赋值 params.startTime
    } // 结束代码块

    if (endTime) { // 条件判断 endTime
      query += ' AND timestamp <= {endTime:DateTime64(3)}'; // 执行语句
      params.endTime = new Date(endTime).toISOString().replace('T', ' ').replace('Z', ''); // 赋值 params.endTime
    } // 结束代码块

    query += ' GROUP BY event_type, level ORDER BY count DESC'; // 执行语句

    return this.clickhouse.query(query, params); // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  getStats() { // 调用 getStats
    return { ...this.stats }; // 返回结果
  } // 结束代码块
} // 结束代码块

export { AuditLogWriter, LOG_LEVEL }; // 导出命名成员
export default AuditLogWriter; // 默认导出
