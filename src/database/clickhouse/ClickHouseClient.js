/**
 * ClickHouse 客户端
 * ClickHouse Client
 *
 * 用于连接 ClickHouse 数据库进行分析和归档
 * Used for connecting to ClickHouse for analytics and archiving
 *
 * @module src/database/clickhouse/ClickHouseClient
 */

import { createClient } from '@clickhouse/client';
import { EventEmitter } from 'events';

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DB || 'quant_trading',
  // 连接超时 (ms) / Connection timeout (ms)
  request_timeout: 30000,
  // 最大重试次数 / Max retries
  max_open_connections: 10,
  // 压缩设置 / Compression settings
  compression: {
    request: true,
    response: true,
  },
};

/**
 * ClickHouse 客户端类
 * ClickHouse Client Class
 */
class ClickHouseClient extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = null;
    this.isInitialized = false;
    this.isConnected = false;
  }

  /**
   * 初始化连接
   * Initialize connection
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.client = createClient({
        host: this.config.host,
        username: this.config.username,
        password: this.config.password,
        database: this.config.database,
        request_timeout: this.config.request_timeout,
        max_open_connections: this.config.max_open_connections,
        compression: this.config.compression,
      });

      // 测试连接 / Test connection
      await this.client.ping();

      // 创建数据库 (如果不存在) / Create database if not exists
      await this._createDatabase();

      // 创建表结构 / Create tables
      await this._createTables();

      this.isInitialized = true;
      this.isConnected = true;
      this.emit('initialized');

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 创建数据库
   * Create database
   * @private
   */
  async _createDatabase() {
    // 临时使用无数据库连接 / Temporarily connect without database
    const tempClient = createClient({
      host: this.config.host,
      username: this.config.username,
      password: this.config.password,
    });

    await tempClient.command({
      query: `CREATE DATABASE IF NOT EXISTS ${this.config.database}`,
    });

    await tempClient.close();
  }

  /**
   * 创建表结构
   * Create table structures
   * @private
   */
  async _createTables() {
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
    `);

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
    `);

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
    `);

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
    `);

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
    `);

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
    `);

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
    `);
  }

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 执行 DDL 命令
   * Execute DDL command
   *
   * @param {string} query - SQL 命令 / SQL command
   */
  async command(query) {
    if (!this.client) {
      throw new Error('ClickHouse client not initialized');
    }

    await this.client.command({ query });
  }

  /**
   * 执行查询
   * Execute query
   *
   * @param {string} query - SQL 查询 / SQL query
   * @param {Object} params - 查询参数 / Query parameters
   * @returns {Array} 查询结果 / Query results
   */
  async query(query, params = {}) {
    if (!this.client) {
      throw new Error('ClickHouse client not initialized');
    }

    const result = await this.client.query({
      query,
      query_params: params,
      format: 'JSONEachRow',
    });

    return result.json();
  }

  /**
   * 查询单行
   * Query single row
   *
   * @param {string} query - SQL 查询 / SQL query
   * @param {Object} params - 查询参数 / Query parameters
   * @returns {Object|null} 查询结果 / Query result
   */
  async queryOne(query, params = {}) {
    const results = await this.query(query, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 批量插入数据
   * Batch insert data
   *
   * @param {string} table - 表名 / Table name
   * @param {Array} values - 数据数组 / Data array
   */
  async insert(table, values) {
    if (!this.client) {
      throw new Error('ClickHouse client not initialized');
    }

    if (!values || values.length === 0) {
      return { inserted: 0 };
    }

    await this.client.insert({
      table,
      values,
      format: 'JSONEachRow',
    });

    return { inserted: values.length };
  }

  // ============================================
  // 工具方法 / Utility Methods
  // ============================================

  /**
   * 健康检查
   * Health check
   */
  async healthCheck() {
    try {
      await this.client.ping();
      return {
        status: 'healthy',
        connected: true,
        database: this.config.database,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * 获取表统计信息
   * Get table statistics
   */
  async getStats() {
    const tables = ['trades', 'orders_archive', 'positions_archive', 'audit_logs', 'balance_snapshots'];
    const stats = {};

    for (const table of tables) {
      try {
        const result = await this.queryOne(`
          SELECT
            count() as row_count,
            formatReadableSize(sum(data_compressed_bytes)) as compressed_size,
            formatReadableSize(sum(data_uncompressed_bytes)) as uncompressed_size
          FROM system.parts
          WHERE database = {db:String} AND table = {table:String} AND active = 1
        `, { db: this.config.database, table });

        stats[table] = result || { row_count: 0, compressed_size: '0 B', uncompressed_size: '0 B' };
      } catch {
        stats[table] = { row_count: 0, compressed_size: '0 B', uncompressed_size: '0 B' };
      }
    }

    return stats;
  }

  /**
   * 优化表
   * Optimize table
   *
   * @param {string} table - 表名 / Table name
   */
  async optimize(table) {
    await this.command(`OPTIMIZE TABLE ${table} FINAL`);
  }

  /**
   * 关闭连接
   * Close connection
   */
  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.isInitialized = false;
      this.isConnected = false;
      this.emit('closed');
    }
  }
}

// 默认实例 / Default instance
let defaultClient = null;

/**
 * 获取默认 ClickHouse 客户端
 * Get default ClickHouse client
 *
 * @param {Object} config - 配置 / Configuration
 * @returns {ClickHouseClient}
 */
function getClickHouseClient(config = {}) {
  if (!defaultClient) {
    defaultClient = new ClickHouseClient(config);
  }
  return defaultClient;
}

export { ClickHouseClient, getClickHouseClient };
export default ClickHouseClient;
