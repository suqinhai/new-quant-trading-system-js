/**
 * 数据库管理器
 * Database Manager
 *
 * 提供 SQLite 数据持久化功能 (使用 sql.js)
 * Provides SQLite data persistence functionality (using sql.js)
 *
 * @module src/database/DatabaseManager
 */

import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

/**
 * 数据库管理器
 * Database Manager Class
 */
class DatabaseManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // 数据库文件路径
      dbPath: config.dbPath || process.env.DB_PATH || './data/trading.db',
      // 是否只读
      readonly: config.readonly ?? false,
      // 是否在内存中 (用于测试)
      memory: config.memory ?? false,
      // 自动保存间隔 (ms)
      autoSaveInterval: config.autoSaveInterval || 30000,
    };

    this.db = null;
    this.SQL = null;
    this.isInitialized = false;
    this.saveTimer = null;
    this.isDirty = false;
  }

  /**
   * 初始化数据库
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // 初始化 sql.js
      this.SQL = await initSqlJs();

      // 确保数据目录存在
      if (!this.config.memory) {
        const dbDir = path.dirname(this.config.dbPath);
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
      }

      // 加载或创建数据库
      if (!this.config.memory && fs.existsSync(this.config.dbPath)) {
        const buffer = fs.readFileSync(this.config.dbPath);
        this.db = new this.SQL.Database(buffer);
      } else {
        this.db = new this.SQL.Database();
      }

      // 创建表结构
      this._createTables();

      // 启动自动保存
      if (!this.config.memory && this.config.autoSaveInterval > 0) {
        this._startAutoSave();
      }

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 创建数据表
   * @private
   */
  _createTables() {
    // 交易记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT UNIQUE NOT NULL,
        order_id TEXT,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        price REAL NOT NULL,
        cost REAL NOT NULL,
        fee REAL DEFAULT 0,
        fee_currency TEXT,
        realized_pnl REAL,
        exchange TEXT NOT NULL,
        strategy TEXT,
        timestamp INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        metadata TEXT
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_trades_exchange ON trades(exchange)`);

    // 订单记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        client_order_id TEXT,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        amount REAL NOT NULL,
        filled REAL DEFAULT 0,
        remaining REAL,
        price REAL,
        average_price REAL,
        stop_price REAL,
        cost REAL DEFAULT 0,
        fee REAL DEFAULT 0,
        exchange TEXT NOT NULL,
        strategy TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        closed_at INTEGER,
        error_message TEXT,
        metadata TEXT
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_strategy ON orders(strategy)`);

    // 持仓记录表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position_id TEXT UNIQUE NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('long', 'short')),
        entry_price REAL NOT NULL,
        current_price REAL,
        amount REAL NOT NULL,
        leverage REAL DEFAULT 1,
        margin REAL,
        unrealized_pnl REAL,
        realized_pnl REAL DEFAULT 0,
        liquidation_price REAL,
        exchange TEXT NOT NULL,
        strategy TEXT,
        opened_at INTEGER NOT NULL,
        updated_at INTEGER,
        closed_at INTEGER,
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed', 'liquidated')),
        metadata TEXT
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_positions_strategy ON positions(strategy)`);

    // 资金快照表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS balance_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange TEXT NOT NULL,
        currency TEXT NOT NULL,
        total REAL NOT NULL,
        free REAL NOT NULL,
        used REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_balance_timestamp ON balance_snapshots(timestamp)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_balance_exchange ON balance_snapshots(exchange)`);

    // 审计日志表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'critical')),
        timestamp INTEGER NOT NULL,
        data TEXT,
        metadata TEXT,
        prev_hash TEXT,
        hash TEXT
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event_type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_audit_level ON audit_logs(level)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)`);

    // 策略状态表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS strategy_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_id TEXT UNIQUE NOT NULL,
        strategy_name TEXT NOT NULL,
        state TEXT NOT NULL,
        config TEXT,
        last_signal TEXT,
        last_signal_time INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER
      )
    `);

    // 系统配置表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // K线数据缓存表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS candle_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        exchange TEXT NOT NULL,
        UNIQUE(symbol, timeframe, timestamp, exchange)
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_candle_lookup ON candle_cache(symbol, timeframe, exchange)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_candle_timestamp ON candle_cache(timestamp)`);

    this.isDirty = true;
  }

  /**
   * 启动自动保存
   * @private
   */
  _startAutoSave() {
    this.saveTimer = setInterval(() => {
      if (this.isDirty) {
        this.save();
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * 保存数据库到文件
   */
  save() {
    if (this.config.memory || !this.db) return;

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.config.dbPath, buffer);
      this.isDirty = false;
      this.emit('saved');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  // ============================================
  // 基础查询方法 Basic Query Methods
  // ============================================

  /**
   * 将 undefined 转换为 null
   * @private
   */
  _normalizeParams(params) {
    return params.map(p => p === undefined ? null : p);
  }

  /**
   * 执行 SQL 语句
   * @param {string} sql - SQL 语句
   * @param {Array} params - 参数
   */
  run(sql, params = []) {
    this.db.run(sql, this._normalizeParams(params));
    this.isDirty = true;
    return { changes: this.db.getRowsModified() };
  }

  /**
   * 查询所有结果
   * @param {string} sql - SQL 语句
   * @param {Array} params - 参数
   */
  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(this._normalizeParams(params));

    const results = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }
    stmt.free();

    return results;
  }

  /**
   * 查询单行
   * @param {string} sql - SQL 语句
   * @param {Array} params - 参数
   */
  queryOne(sql, params = []) {
    const results = this.query(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 执行原始 SQL
   * @param {string} sql - SQL 语句
   */
  exec(sql) {
    this.db.run(sql);
    this.isDirty = true;
  }

  // ============================================
  // 交易操作 Trade Operations
  // ============================================

  /**
   * 插入交易记录
   * @param {Object} trade - 交易数据
   * @returns {Object} 插入结果
   */
  insertTrade(trade) {
    const sql = `
      INSERT INTO trades (trade_id, order_id, symbol, side, type, amount, price, cost, fee, fee_currency, realized_pnl, exchange, strategy, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return this.run(sql, [
      trade.tradeId || trade.id,
      trade.orderId,
      trade.symbol,
      trade.side,
      trade.type || 'market',
      trade.amount,
      trade.price,
      trade.cost || trade.amount * trade.price,
      trade.fee || 0,
      trade.feeCurrency,
      trade.realizedPnl,
      trade.exchange,
      trade.strategy,
      trade.timestamp || Date.now(),
      trade.metadata ? JSON.stringify(trade.metadata) : null,
    ]);
  }

  /**
   * 批量插入交易
   * @param {Array} trades - 交易数组
   */
  insertTrades(trades) {
    for (const trade of trades) {
      this.insertTrade(trade);
    }
  }

  /**
   * 获取交易记录
   * @param {string} tradeId - 交易ID
   */
  getTradeById(tradeId) {
    const row = this.queryOne('SELECT * FROM trades WHERE trade_id = ?', [tradeId]);
    return row ? this._parseRow(row) : null;
  }

  /**
   * 按交易对获取交易
   * @param {string} symbol - 交易对
   * @param {number} limit - 限制数量
   */
  getTradesBySymbol(symbol, limit = 100) {
    const rows = this.query('SELECT * FROM trades WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?', [symbol, limit]);
    return rows.map(r => this._parseRow(r));
  }

  /**
   * 按时间范围获取交易
   * @param {number} startTime - 开始时间戳
   * @param {number} endTime - 结束时间戳
   */
  getTradesByTimeRange(startTime, endTime) {
    const rows = this.query('SELECT * FROM trades WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC', [startTime, endTime]);
    return rows.map(r => this._parseRow(r));
  }

  // ============================================
  // 订单操作 Order Operations
  // ============================================

  /**
   * 插入订单
   * @param {Object} order - 订单数据
   */
  insertOrder(order) {
    const sql = `
      INSERT INTO orders (order_id, client_order_id, symbol, side, type, status, amount, filled, remaining, price, average_price, stop_price, cost, fee, exchange, strategy, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return this.run(sql, [
      order.orderId || order.id,
      order.clientOrderId,
      order.symbol,
      order.side,
      order.type,
      order.status || 'pending',
      order.amount,
      order.filled || 0,
      order.remaining ?? order.amount,
      order.price,
      order.averagePrice,
      order.stopPrice,
      order.cost || 0,
      order.fee || 0,
      order.exchange,
      order.strategy,
      order.createdAt || Date.now(),
      order.metadata ? JSON.stringify(order.metadata) : null,
    ]);
  }

  /**
   * 更新订单
   * @param {Object} order - 订单更新数据
   */
  updateOrder(order) {
    const sql = `
      UPDATE orders SET
        status = ?,
        filled = ?,
        remaining = ?,
        average_price = ?,
        cost = ?,
        fee = ?,
        updated_at = ?,
        closed_at = ?,
        error_message = ?
      WHERE order_id = ?
    `;

    return this.run(sql, [
      order.status,
      order.filled,
      order.remaining,
      order.averagePrice,
      order.cost,
      order.fee,
      Date.now(),
      order.closedAt,
      order.errorMessage,
      order.orderId || order.id,
    ]);
  }

  /**
   * 获取订单
   * @param {string} orderId - 订单ID
   */
  getOrderById(orderId) {
    const row = this.queryOne('SELECT * FROM orders WHERE order_id = ?', [orderId]);
    return row ? this._parseRow(row) : null;
  }

  /**
   * 获取未完成订单
   */
  getOpenOrders() {
    const rows = this.query("SELECT * FROM orders WHERE status IN ('open', 'pending', 'partially_filled') ORDER BY created_at DESC");
    return rows.map(r => this._parseRow(r));
  }

  // ============================================
  // 持仓操作 Position Operations
  // ============================================

  /**
   * 插入持仓
   * @param {Object} position - 持仓数据
   */
  insertPosition(position) {
    const sql = `
      INSERT INTO positions (position_id, symbol, side, entry_price, current_price, amount, leverage, margin, unrealized_pnl, exchange, strategy, opened_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return this.run(sql, [
      position.positionId || position.id,
      position.symbol,
      position.side,
      position.entryPrice,
      position.currentPrice,
      position.amount,
      position.leverage || 1,
      position.margin,
      position.unrealizedPnl,
      position.exchange,
      position.strategy,
      position.openedAt || Date.now(),
      position.metadata ? JSON.stringify(position.metadata) : null,
    ]);
  }

  /**
   * 更新持仓
   * @param {Object} position - 持仓更新数据
   */
  updatePosition(position) {
    const sql = `
      UPDATE positions SET
        current_price = ?,
        amount = ?,
        unrealized_pnl = ?,
        realized_pnl = ?,
        updated_at = ?,
        status = ?,
        closed_at = ?
      WHERE position_id = ?
    `;

    return this.run(sql, [
      position.currentPrice,
      position.amount,
      position.unrealizedPnl,
      position.realizedPnl,
      Date.now(),
      position.status || 'open',
      position.closedAt,
      position.positionId || position.id,
    ]);
  }

  /**
   * 获取未平仓持仓
   */
  getOpenPositions() {
    const rows = this.query("SELECT * FROM positions WHERE status = 'open'");
    return rows.map(r => this._parseRow(r));
  }

  // ============================================
  // 审计日志操作 Audit Log Operations
  // ============================================

  /**
   * 插入审计日志
   * @param {Object} log - 日志数据
   */
  insertAuditLog(log) {
    const sql = `
      INSERT INTO audit_logs (log_id, event_type, level, timestamp, data, metadata, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return this.run(sql, [
      log.id || log.logId,
      log.eventType,
      log.level,
      new Date(log.timestamp).getTime(),
      log.data ? JSON.stringify(log.data) : null,
      log.metadata ? JSON.stringify(log.metadata) : null,
      log.prevHash,
      log.hash,
    ]);
  }

  /**
   * 批量插入审计日志
   * @param {Array} logs - 日志数组
   */
  insertAuditLogs(logs) {
    for (const log of logs) {
      this.insertAuditLog(log);
    }
  }

  /**
   * 获取审计日志
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   * @param {number} limit - 限制数量
   */
  getAuditLogs(startTime, endTime, limit = 1000) {
    const rows = this.query(
      'SELECT * FROM audit_logs WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?',
      [startTime, endTime, limit]
    );
    return rows.map(r => this._parseRow(r));
  }

  // ============================================
  // 余额快照操作 Balance Snapshot Operations
  // ============================================

  /**
   * 插入余额快照
   * @param {Object} snapshot - 快照数据
   */
  insertBalanceSnapshot(snapshot) {
    const sql = `
      INSERT INTO balance_snapshots (exchange, currency, total, free, used, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    return this.run(sql, [
      snapshot.exchange,
      snapshot.currency,
      snapshot.total,
      snapshot.free,
      snapshot.used,
      snapshot.timestamp || Date.now(),
      snapshot.metadata ? JSON.stringify(snapshot.metadata) : null,
    ]);
  }

  /**
   * 批量插入余额快照
   * @param {Array} snapshots - 快照数组
   */
  insertBalanceSnapshots(snapshots) {
    for (const snapshot of snapshots) {
      this.insertBalanceSnapshot(snapshot);
    }
  }

  // ============================================
  // K线缓存操作 Candle Cache Operations
  // ============================================

  /**
   * 插入K线数据
   * @param {Object} candle - K线数据
   */
  insertCandle(candle) {
    const sql = `
      INSERT OR REPLACE INTO candle_cache (symbol, timeframe, timestamp, open, high, low, close, volume, exchange)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return this.run(sql, [
      candle.symbol,
      candle.timeframe,
      candle.timestamp,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
      candle.exchange,
    ]);
  }

  /**
   * 批量插入K线数据
   * @param {Array} candles - K线数组
   */
  insertCandles(candles) {
    for (const candle of candles) {
      this.insertCandle(candle);
    }
  }

  /**
   * 获取K线数据
   * @param {string} symbol - 交易对
   * @param {string} timeframe - 时间周期
   * @param {string} exchange - 交易所
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   */
  getCandles(symbol, timeframe, exchange, startTime, endTime) {
    return this.query(
      `SELECT * FROM candle_cache
       WHERE symbol = ? AND timeframe = ? AND exchange = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
      [symbol, timeframe, exchange, startTime, endTime]
    );
  }

  // ============================================
  // 配置操作 Config Operations
  // ============================================

  /**
   * 设置配置
   * @param {string} key - 配置键
   * @param {any} value - 配置值
   */
  setConfig(key, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return this.run(
      "INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, strftime('%s', 'now') * 1000)",
      [key, serialized]
    );
  }

  /**
   * 获取配置
   * @param {string} key - 配置键
   * @param {any} defaultValue - 默认值
   */
  getConfig(key, defaultValue = null) {
    const row = this.queryOne('SELECT value FROM system_config WHERE key = ?', [key]);
    if (!row) return defaultValue;

    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  // ============================================
  // 工具方法 Utility Methods
  // ============================================

  /**
   * 解析数据行
   * @private
   */
  _parseRow(row) {
    const result = { ...row };

    // 解析 JSON 字段
    if (result.metadata) {
      try {
        result.metadata = JSON.parse(result.metadata);
      } catch {
        // 保持原值
      }
    }
    if (result.data) {
      try {
        result.data = JSON.parse(result.data);
      } catch {
        // 保持原值
      }
    }

    return result;
  }

  /**
   * 执行事务
   * @param {Function} fn - 事务函数
   */
  transaction(fn) {
    this.db.run('BEGIN TRANSACTION');
    try {
      fn();
      this.db.run('COMMIT');
      this.isDirty = true;
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * 获取数据库统计
   */
  getStats() {
    const stats = {
      trades: this.queryOne('SELECT COUNT(*) as count FROM trades')?.count || 0,
      orders: this.queryOne('SELECT COUNT(*) as count FROM orders')?.count || 0,
      positions: this.queryOne("SELECT COUNT(*) as count FROM positions WHERE status = 'open'")?.count || 0,
      auditLogs: this.queryOne('SELECT COUNT(*) as count FROM audit_logs')?.count || 0,
      candles: this.queryOne('SELECT COUNT(*) as count FROM candle_cache')?.count || 0,
    };

    // 数据库文件大小
    if (!this.config.memory && fs.existsSync(this.config.dbPath)) {
      const stat = fs.statSync(this.config.dbPath);
      stats.dbSizeMB = Math.round(stat.size / 1024 / 1024 * 100) / 100;
    }

    return stats;
  }

  /**
   * 优化数据库
   */
  optimize() {
    this.db.run('VACUUM');
    this.isDirty = true;
  }

  /**
   * 备份数据库
   * @param {string} backupPath - 备份路径
   */
  async backup(backupPath) {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    await fs.promises.writeFile(backupPath, buffer);
    this.emit('backup', backupPath);
    return backupPath;
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.db) {
      // 保存最后的更改
      if (this.isDirty && !this.config.memory) {
        this.save();
      }

      this.db.close();
      this.db = null;
      this.isInitialized = false;
      this.emit('closed');
    }
  }

  /**
   * 健康检查
   */
  healthCheck() {
    try {
      this.queryOne('SELECT 1');
      return { status: 'healthy', message: 'Database is operational' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }
}

// 默认数据库管理器实例
let defaultDb = null;

/**
 * 获取默认数据库实例
 * @param {Object} config - 配置
 */
function getDatabase(config = {}) {
  if (!defaultDb) {
    defaultDb = new DatabaseManager(config);
  }
  return defaultDb;
}

export {
  DatabaseManager,
  getDatabase,
};

export default DatabaseManager;
