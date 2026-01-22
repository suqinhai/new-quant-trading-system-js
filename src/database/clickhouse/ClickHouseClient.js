/**
 * ClickHouse 客户端
 * ClickHouse Client
 *
 * 用于连接 ClickHouse 数据库进行分析和归档
 * Used for connecting to ClickHouse for analytics and archiving
 *
 * @module src/database/clickhouse/ClickHouseClient
 */

import { createClient } from '@clickhouse/client'; // 导入模块 @clickhouse/client
import { EventEmitter } from 'events'; // 导入模块 events

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123', // 读取环境变量 CLICKHOUSE_HOST
  username: process.env.CLICKHOUSE_USER || 'default', // username
  password: process.env.CLICKHOUSE_PASSWORD || '', // 密码
  database: process.env.CLICKHOUSE_DB || 'quant_trading', // database
  // 连接超时 (ms) / Connection timeout (ms)
  request_timeout: 30000, // 连接超时 (ms)
  // 最大重试次数 / Max retries
  max_open_connections: 10, // 最大重试次数
  // 压缩设置 / Compression settings
  compression: { // compression
    request: true, // request
    response: true, // response
  }, // 结束代码块
}; // 结束代码块

/**
 * ClickHouse 客户端类
 * ClickHouse Client Class
 */
class ClickHouseClient extends EventEmitter { // 定义类 ClickHouseClient(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config
    this.client = null; // 设置 client
    this.isInitialized = false; // 设置 isInitialized
    this.isConnected = false; // 设置 isConnected
  } // 结束代码块

  /**
   * 初始化连接
   * Initialize connection
   */
  async initialize() { // 执行语句
    if (this.isInitialized) return; // 条件判断 this.isInitialized

    try { // 尝试执行
      this.client = createClient({ // 设置 client
        host: this.config.host, // 主机
        username: this.config.username, // username
        password: this.config.password, // 密码
        database: this.config.database, // database
        request_timeout: this.config.request_timeout, // request超时
        max_open_connections: this.config.max_open_connections, // 最大开盘connections
        compression: this.config.compression, // compression
      }); // 结束代码块

      // 测试连接 / Test connection
      await this.client.ping(); // 等待异步结果

      // 创建数据库 (如果不存在) / Create database if not exists
      await this._createDatabase(); // 等待异步结果

      // 创建表结构 / Create tables
      await this._createTables(); // 等待异步结果

      this.isInitialized = true; // 设置 isInitialized
      this.isConnected = true; // 设置 isConnected
      this.emit('initialized'); // 调用 emit

    } catch (error) { // 执行语句
      this.emit('error', error); // 调用 emit
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 创建数据库
   * Create database
   * @private
   */
  async _createDatabase() { // 执行语句
    // 临时使用无数据库连接 / Temporarily connect without database
    const tempClient = createClient({ // 定义常量 tempClient
      host: this.config.host, // 主机
      username: this.config.username, // username
      password: this.config.password, // 密码
    }); // 结束代码块

    await tempClient.command({ // 等待异步结果
      query: `CREATE DATABASE IF NOT EXISTS ${this.config.database}`, // query
    }); // 结束代码块

    await tempClient.close(); // 等待异步结果
  } // 结束代码块

  /**
   * 创建表结构
   * Create table structures
   * @private
   */
  async _createTables() { // 执行语句
    // 1. 交易记录表 (使用 MergeTree) / Trades table (using MergeTree)
    await this.command(`
      CREATE TABLE IF NOT EXISTS trades (
        trade_id String,
        order_id String,
        symbol LowCardinality(String),
        side Enum8('buy' = 1, 'sell' = 2),
        type LowCardinality(String),
        amount Decimal(18, 8),
        price Decimal(18, 8),
        cost Decimal(18, 8),
        fee Decimal(18, 8),
        fee_currency LowCardinality(String),
        realized_pnl Decimal(18, 8),
        exchange LowCardinality(String),
        strategy LowCardinality(String),
        timestamp DateTime64(3),
        created_at DateTime64(3) DEFAULT now64(3),
        metadata String
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (symbol, timestamp, trade_id)
      TTL timestamp + INTERVAL 3 YEAR
      SETTINGS index_granularity = 8192
    `); // 执行语句

    // 2. 订单归档表 / Archived orders table
    await this.command(`
      CREATE TABLE IF NOT EXISTS orders_archive (
        order_id String,
        client_order_id String,
        symbol LowCardinality(String),
        side Enum8('buy' = 1, 'sell' = 2),
        type LowCardinality(String),
        status LowCardinality(String),
        amount Decimal(18, 8),
        filled Decimal(18, 8),
        remaining Decimal(18, 8),
        price Decimal(18, 8),
        average_price Decimal(18, 8),
        stop_price Decimal(18, 8),
        cost Decimal(18, 8),
        fee Decimal(18, 8),
        exchange LowCardinality(String),
        strategy LowCardinality(String),
        created_at DateTime64(3),
        updated_at DateTime64(3),
        closed_at DateTime64(3),
        error_message String,
        archived_at DateTime64(3) DEFAULT now64(3),
        metadata String
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(created_at)
      ORDER BY (symbol, created_at, order_id)
      TTL created_at + INTERVAL 3 YEAR
      SETTINGS index_granularity = 8192
    `); // 执行语句

    // 3. 持仓归档表 / Archived positions table
    await this.command(`
      CREATE TABLE IF NOT EXISTS positions_archive (
        position_id String,
        symbol LowCardinality(String),
        side Enum8('long' = 1, 'short' = 2),
        entry_price Decimal(18, 8),
        exit_price Decimal(18, 8),
        amount Decimal(18, 8),
        leverage Decimal(8, 2),
        margin Decimal(18, 8),
        unrealized_pnl Decimal(18, 8),
        realized_pnl Decimal(18, 8),
        liquidation_price Decimal(18, 8),
        exchange LowCardinality(String),
        strategy LowCardinality(String),
        opened_at DateTime64(3),
        closed_at DateTime64(3),
        status LowCardinality(String),
        archived_at DateTime64(3) DEFAULT now64(3),
        metadata String
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(opened_at)
      ORDER BY (symbol, opened_at, position_id)
      TTL opened_at + INTERVAL 5 YEAR
      SETTINGS index_granularity = 8192
    `); // 执行语句

    // 4. 审计日志表 / Audit logs table
    await this.command(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        log_id String,
        event_type LowCardinality(String),
        level Enum8('info' = 1, 'warning' = 2, 'critical' = 3),
        timestamp DateTime64(3),
        data String,
        metadata String,
        prev_hash String,
        hash String,
        archived_at DateTime64(3) DEFAULT now64(3)
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (event_type, timestamp, log_id)
      TTL timestamp + INTERVAL 2 YEAR
      SETTINGS index_granularity = 8192
    `); // 执行语句

    // 5. 余额快照表 / Balance snapshots table
    await this.command(`
      CREATE TABLE IF NOT EXISTS balance_snapshots (
        exchange LowCardinality(String),
        currency LowCardinality(String),
        total Decimal(18, 8),
        free Decimal(18, 8),
        used Decimal(18, 8),
        timestamp DateTime64(3),
        archived_at DateTime64(3) DEFAULT now64(3),
        metadata String
      )
      ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (exchange, currency, timestamp)
      TTL timestamp + INTERVAL 1 YEAR
      SETTINGS index_granularity = 8192
    `); // 执行语句

    // 6. 每日交易统计物化视图 / Daily trade statistics materialized view
    await this.command(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS trades_daily_stats
      ENGINE = SummingMergeTree()
      PARTITION BY toYYYYMM(date)
      ORDER BY (symbol, exchange, strategy, date)
      AS SELECT
        toDate(timestamp) as date,
        symbol,
        exchange,
        strategy,
        count() as trade_count,
        sum(CASE WHEN side = 'buy' THEN 1 ELSE 0 END) as buy_count,
        sum(CASE WHEN side = 'sell' THEN 1 ELSE 0 END) as sell_count,
        sum(cost) as total_volume,
        sum(fee) as total_fees,
        sum(realized_pnl) as total_pnl,
        sum(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as win_count,
        sum(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) as loss_count
      FROM trades
      GROUP BY date, symbol, exchange, strategy
    `); // 执行语句

    // 7. 每小时订单统计物化视图 / Hourly order statistics materialized view
    await this.command(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS orders_hourly_stats
      ENGINE = SummingMergeTree()
      PARTITION BY toYYYYMM(hour)
      ORDER BY (symbol, exchange, status, hour)
      AS SELECT
        toStartOfHour(created_at) as hour,
        symbol,
        exchange,
        status,
        count() as order_count,
        sum(amount) as total_amount,
        sum(cost) as total_cost,
        sum(fee) as total_fees
      FROM orders_archive
      GROUP BY hour, symbol, exchange, status
    `); // 执行语句
  } // 结束代码块

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 执行 DDL 命令
   * Execute DDL command
   *
   * @param {string} query - SQL 命令 / SQL command
   */
  async command(query) { // 执行语句
    if (!this.client) { // 条件判断 !this.client
      throw new Error('ClickHouse client not initialized'); // 抛出异常
    } // 结束代码块

    await this.client.command({ query }); // 等待异步结果
  } // 结束代码块

  /**
   * 执行查询
   * Execute query
   *
   * @param {string} query - SQL 查询 / SQL query
   * @param {Object} params - 查询参数 / Query parameters
   * @returns {Array} 查询结果 / Query results
   */
  async query(query, params = {}) { // 执行语句
    if (!this.client) { // 条件判断 !this.client
      throw new Error('ClickHouse client not initialized'); // 抛出异常
    } // 结束代码块

    const result = await this.client.query({ // 定义常量 result
      query, // 执行语句
      query_params: params, // queryparams
      format: 'JSONEachRow', // 格式
    }); // 结束代码块

    return result.json(); // 返回结果
  } // 结束代码块

  /**
   * 查询单行
   * Query single row
   *
   * @param {string} query - SQL 查询 / SQL query
   * @param {Object} params - 查询参数 / Query parameters
   * @returns {Object|null} 查询结果 / Query result
   */
  async queryOne(query, params = {}) { // 执行语句
    const results = await this.query(query, params); // 定义常量 results
    return results.length > 0 ? results[0] : null; // 返回结果
  } // 结束代码块

  /**
   * 批量插入数据
   * Batch insert data
   *
   * @param {string} table - 表名 / Table name
   * @param {Array} values - 数据数组 / Data array
   */
  async insert(table, values) { // 执行语句
    if (!this.client) { // 条件判断 !this.client
      throw new Error('ClickHouse client not initialized'); // 抛出异常
    } // 结束代码块

    if (!values || values.length === 0) { // 条件判断 !values || values.length === 0
      return { inserted: 0 }; // 返回结果
    } // 结束代码块

    await this.client.insert({ // 等待异步结果
      table, // 执行语句
      values, // 执行语句
      format: 'JSONEachRow', // 格式
    }); // 结束代码块

    return { inserted: values.length }; // 返回结果
  } // 结束代码块

  // ============================================
  // 工具方法 / Utility Methods
  // ============================================

  /**
   * 健康检查
   * Health check
   */
  async healthCheck() { // 执行语句
    try { // 尝试执行
      await this.client.ping(); // 等待异步结果
      return { // 返回结果
        status: 'healthy', // 状态
        connected: true, // connected
        database: this.config.database, // database
      }; // 结束代码块
    } catch (error) { // 执行语句
      return { // 返回结果
        status: 'unhealthy', // 状态
        connected: false, // connected
        error: error.message, // 错误
      }; // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取表统计信息
   * Get table statistics
   */
  async getStats() { // 执行语句
    const tables = ['trades', 'orders_archive', 'positions_archive', 'audit_logs', 'balance_snapshots']; // 定义常量 tables
    const stats = {}; // 定义常量 stats

    for (const table of tables) { // 循环 const table of tables
      try { // 尝试执行
        const result = await this.queryOne(`
          SELECT
            count() as row_count,
            formatReadableSize(sum(data_compressed_bytes)) as compressed_size,
            formatReadableSize(sum(data_uncompressed_bytes)) as uncompressed_size
          FROM system.parts
          WHERE database = {db:String} AND table = {table:String} AND active = 1
        `, { db: this.config.database, table }); // 执行语句

        stats[table] = result || { row_count: 0, compressed_size: '0 B', uncompressed_size: '0 B' }; // 执行语句
      } catch { // 执行语句
        stats[table] = { row_count: 0, compressed_size: '0 B', uncompressed_size: '0 B' }; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return stats; // 返回结果
  } // 结束代码块

  /**
   * 优化表
   * Optimize table
   *
   * @param {string} table - 表名 / Table name
   */
  async optimize(table) { // 执行语句
    await this.command(`OPTIMIZE TABLE ${table} FINAL`); // 等待异步结果
  } // 结束代码块

  /**
   * 关闭连接
   * Close connection
   */
  async close() { // 执行语句
    if (this.client) { // 条件判断 this.client
      await this.client.close(); // 等待异步结果
      this.client = null; // 设置 client
      this.isInitialized = false; // 设置 isInitialized
      this.isConnected = false; // 设置 isConnected
      this.emit('closed'); // 调用 emit
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 默认实例 / Default instance
let defaultClient = null; // 定义变量 defaultClient

/**
 * 获取默认 ClickHouse 客户端
 * Get default ClickHouse client
 *
 * @param {Object} config - 配置 / Configuration
 * @returns {ClickHouseClient}
 */
function getClickHouseClient(config = {}) { // 定义函数 getClickHouseClient
  if (!defaultClient) { // 条件判断 !defaultClient
    defaultClient = new ClickHouseClient(config); // 赋值 defaultClient
  } // 结束代码块
  return defaultClient; // 返回结果
} // 结束代码块

export { ClickHouseClient, getClickHouseClient }; // 导出命名成员
export default ClickHouseClient; // 默认导出
