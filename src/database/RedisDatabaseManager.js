/**
 * Redis 数据库管理器
 * Redis Database Manager
 *
 * 提供与 SQLite DatabaseManager 兼容的接口
 * Provides interface compatible with SQLite DatabaseManager
 *
 * @module src/database/RedisDatabaseManager
 */

import { EventEmitter } from 'events';
import { RedisClient, KEY_PREFIX } from './redis/RedisClient.js';
import { OrderStore } from './redis/OrderStore.js';
import { PositionStore } from './redis/PositionStore.js';
import { StrategyStore } from './redis/StrategyStore.js';
import { ConfigStore } from './redis/ConfigStore.js';

/**
 * Redis 数据库管理器
 * Redis Database Manager Class
 */
class RedisDatabaseManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Redis 连接配置 / Redis connection config
      redis: {
        url: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
        database: config.redisDb || parseInt(process.env.REDIS_DB || '0', 10),
        keyPrefix: config.keyPrefix || process.env.REDIS_PREFIX || 'quant:',
        ...config.redis,
      },
      // 交易和 K线数据过期时间 (天) / Trade and candle TTL (days)
      tradeTTL: config.tradeTTL || 365,
      candleTTL: config.candleTTL || 30,
      // 审计日志过期时间 (天) / Audit log TTL (days)
      auditTTL: config.auditTTL || 90,
    };

    // Redis 客户端 / Redis client
    this.redis = null;

    // 存储层实例 / Store instances
    this.orders = null;
    this.positions = null;
    this.strategies = null;
    this.configs = null;

    // 状态 / State
    this.isInitialized = false;
  }

  /**
   * 初始化数据库
   * Initialize database
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // 创建 Redis 客户端 / Create Redis client
      this.redis = new RedisClient(this.config.redis);
      await this.redis.initialize();

      // 创建存储层实例 / Create store instances
      this.orders = new OrderStore(this.redis);
      this.positions = new PositionStore(this.redis);
      this.strategies = new StrategyStore(this.redis);
      this.configs = new ConfigStore(this.redis);

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  // ============================================
  // 订单操作 Order Operations
  // (兼容 DatabaseManager 接口)
  // ============================================

  /**
   * 插入订单
   * @param {Object} order - 订单数据
   */
  async insertOrder(order) {
    return this.orders.insert(order);
  }

  /**
   * 更新订单
   * @param {Object} order - 订单更新数据
   */
  async updateOrder(order) {
    return this.orders.update(order);
  }

  /**
   * 获取订单
   * @param {string} orderId - 订单ID
   */
  async getOrderById(orderId) {
    return this.orders.getById(orderId);
  }

  /**
   * 获取未完成订单
   */
  async getOpenOrders() {
    return this.orders.getOpenOrders();
  }

  /**
   * 按交易对获取订单
   * @param {string} symbol - 交易对
   * @param {number} limit - 限制数量
   */
  async getOrdersBySymbol(symbol, limit = 100) {
    return this.orders.getBySymbol(symbol, { limit });
  }

  /**
   * 按时间范围获取订单
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   */
  async getOrdersByTimeRange(startTime, endTime) {
    return this.orders.getByTimeRange(startTime, endTime);
  }

  // ============================================
  // 持仓操作 Position Operations
  // ============================================

  /**
   * 插入持仓
   * @param {Object} position - 持仓数据
   */
  async insertPosition(position) {
    return this.positions.insert(position);
  }

  /**
   * 更新持仓
   * @param {Object} position - 持仓更新数据
   */
  async updatePosition(position) {
    return this.positions.update(position);
  }

  /**
   * 获取未平仓持仓
   */
  async getOpenPositions() {
    return this.positions.getOpenPositions();
  }

  /**
   * 按交易对获取活跃持仓
   * @param {string} symbol - 交易对
   */
  async getPositionsBySymbol(symbol) {
    return this.positions.getOpenBySymbol(symbol);
  }

  /**
   * 获取持仓汇总
   */
  async getPositionSummary() {
    return this.positions.getSummary();
  }

  // ============================================
  // 交易记录操作 Trade Operations
  // ============================================

  /**
   * 插入交易记录
   * @param {Object} trade - 交易数据
   */
  async insertTrade(trade) {
    const tradeId = trade.tradeId || trade.id;
    const timestamp = trade.timestamp || Date.now();
    const key = this.redis.key(KEY_PREFIX.TRADE, tradeId);

    // 序列化交易数据 / Serialize trade data
    const data = {
      tradeId,
      orderId: trade.orderId || '',
      symbol: trade.symbol || '',
      side: trade.side || '',
      type: trade.type || 'market',
      amount: String(trade.amount || 0),
      price: String(trade.price || 0),
      cost: String(trade.cost || trade.amount * trade.price || 0),
      fee: String(trade.fee || 0),
      feeCurrency: trade.feeCurrency || '',
      realizedPnl: String(trade.realizedPnl || 0),
      exchange: trade.exchange || '',
      strategy: trade.strategy || '',
      timestamp: String(timestamp),
      metadata: trade.metadata ? JSON.stringify(trade.metadata) : '',
    };

    await this.redis.transaction(async (multi) => {
      // 存储交易数据 / Store trade data
      multi.hSet(key, data);

      // 设置过期时间 / Set TTL
      if (this.config.tradeTTL > 0) {
        multi.expire(key, this.config.tradeTTL * 24 * 60 * 60);
      }

      // 添加时间索引 / Add time index
      multi.zAdd(this.redis.key(KEY_PREFIX.TRADE_INDEX, 'time'), {
        score: timestamp,
        value: tradeId,
      });

      // 添加交易对索引 / Add symbol index
      if (trade.symbol) {
        multi.zAdd(this.redis.key(KEY_PREFIX.TRADE_INDEX, 'symbol', trade.symbol), {
          score: timestamp,
          value: tradeId,
        });
      }
    });

    return { tradeId, changes: 1 };
  }

  /**
   * 批量插入交易
   * @param {Array} trades - 交易数组
   */
  async insertTrades(trades) {
    for (const trade of trades) {
      await this.insertTrade(trade);
    }
    return { count: trades.length };
  }

  /**
   * 获取交易记录
   * @param {string} tradeId - 交易ID
   */
  async getTradeById(tradeId) {
    const data = await this.redis.hGetAll(this.redis.key(KEY_PREFIX.TRADE, tradeId));

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return this._deserializeTrade(data);
  }

  /**
   * 按交易对获取交易
   * @param {string} symbol - 交易对
   * @param {number} limit - 限制数量
   */
  async getTradesBySymbol(symbol, limit = 100) {
    const tradeIds = await this.redis.zRange(
      this.redis.key(KEY_PREFIX.TRADE_INDEX, 'symbol', symbol),
      0,
      limit - 1,
      { REV: true }
    );

    const trades = [];
    for (const tradeId of tradeIds) {
      const trade = await this.getTradeById(tradeId);
      if (trade) {
        trades.push(trade);
      }
    }

    return trades;
  }

  /**
   * 按时间范围获取交易
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   */
  async getTradesByTimeRange(startTime, endTime) {
    const tradeIds = await this.redis.zRangeByScore(
      this.redis.key(KEY_PREFIX.TRADE_INDEX, 'time'),
      startTime,
      endTime
    );

    const trades = [];
    for (const tradeId of tradeIds) {
      const trade = await this.getTradeById(tradeId);
      if (trade) {
        trades.push(trade);
      }
    }

    return trades.reverse();
  }

  /**
   * 反序列化交易数据
   * @private
   */
  _deserializeTrade(data) {
    return {
      tradeId: data.tradeId,
      orderId: data.orderId || null,
      symbol: data.symbol,
      side: data.side,
      type: data.type,
      amount: parseFloat(data.amount),
      price: parseFloat(data.price),
      cost: parseFloat(data.cost),
      fee: parseFloat(data.fee),
      feeCurrency: data.feeCurrency || null,
      realizedPnl: parseFloat(data.realizedPnl) || null,
      exchange: data.exchange,
      strategy: data.strategy || null,
      timestamp: parseInt(data.timestamp, 10),
      metadata: data.metadata ? JSON.parse(data.metadata) : null,
    };
  }

  // ============================================
  // 策略状态操作 Strategy State Operations
  // ============================================

  /**
   * 保存策略状态
   * @param {Object} strategyState - 策略状态
   */
  async saveStrategyState(strategyState) {
    return this.strategies.save(strategyState);
  }

  /**
   * 获取策略状态
   * @param {string} strategyId - 策略ID
   */
  async getStrategyState(strategyId) {
    return this.strategies.getById(strategyId);
  }

  /**
   * 获取所有策略状态
   */
  async getAllStrategyStates() {
    return this.strategies.getAll();
  }

  /**
   * 更新策略运行状态
   * @param {string} strategyId - 策略ID
   * @param {string} state - 状态
   */
  async updateStrategyState(strategyId, state) {
    return this.strategies.updateState(strategyId, state);
  }

  // ============================================
  // 配置操作 Config Operations
  // ============================================

  /**
   * 设置配置
   * @param {string} key - 配置键
   * @param {any} value - 配置值
   */
  async setConfig(key, value) {
    return this.configs.set(key, value);
  }

  /**
   * 获取配置
   * @param {string} key - 配置键
   * @param {any} defaultValue - 默认值
   */
  async getConfig(key, defaultValue = null) {
    return this.configs.get(key, defaultValue);
  }

  /**
   * 获取所有配置
   */
  async getAllConfigs() {
    return this.configs.getAll();
  }

  // ============================================
  // 审计日志操作 Audit Log Operations
  // ============================================

  /**
   * 插入审计日志
   * @param {Object} log - 日志数据
   */
  async insertAuditLog(log) {
    const logId = log.id || log.logId || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date(log.timestamp).getTime();
    const key = this.redis.key(KEY_PREFIX.AUDIT, logId);

    const data = {
      logId,
      eventType: log.eventType || '',
      level: log.level || 'info',
      timestamp: String(timestamp),
      data: log.data ? JSON.stringify(log.data) : '',
      metadata: log.metadata ? JSON.stringify(log.metadata) : '',
      prevHash: log.prevHash || '',
      hash: log.hash || '',
    };

    await this.redis.transaction(async (multi) => {
      multi.hSet(key, data);

      // 设置过期时间 / Set TTL
      if (this.config.auditTTL > 0) {
        multi.expire(key, this.config.auditTTL * 24 * 60 * 60);
      }

      // 添加时间索引 / Add time index
      multi.zAdd(this.redis.key(KEY_PREFIX.AUDIT, 'idx', 'time'), {
        score: timestamp,
        value: logId,
      });

      // 添加事件类型索引 / Add event type index
      if (log.eventType) {
        multi.zAdd(this.redis.key(KEY_PREFIX.AUDIT, 'idx', 'event', log.eventType), {
          score: timestamp,
          value: logId,
        });
      }
    });

    return { logId, changes: 1 };
  }

  /**
   * 批量插入审计日志
   * @param {Array} logs - 日志数组
   */
  async insertAuditLogs(logs) {
    for (const log of logs) {
      await this.insertAuditLog(log);
    }
    return { count: logs.length };
  }

  /**
   * 获取审计日志
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   * @param {number} limit - 限制数量
   */
  async getAuditLogs(startTime, endTime, limit = 1000) {
    const logIds = await this.redis.zRangeByScore(
      this.redis.key(KEY_PREFIX.AUDIT, 'idx', 'time'),
      startTime,
      endTime,
      { limit }
    );

    const logs = [];
    for (const logId of logIds) {
      const data = await this.redis.hGetAll(this.redis.key(KEY_PREFIX.AUDIT, logId));
      if (data && Object.keys(data).length > 0) {
        logs.push({
          logId: data.logId,
          eventType: data.eventType,
          level: data.level,
          timestamp: parseInt(data.timestamp, 10),
          data: data.data ? JSON.parse(data.data) : null,
          metadata: data.metadata ? JSON.parse(data.metadata) : null,
          prevHash: data.prevHash || null,
          hash: data.hash || null,
        });
      }
    }

    return logs.reverse();
  }

  // ============================================
  // 余额快照操作 Balance Snapshot Operations
  // ============================================

  /**
   * 插入余额快照
   * @param {Object} snapshot - 快照数据
   */
  async insertBalanceSnapshot(snapshot) {
    const timestamp = snapshot.timestamp || Date.now();
    const key = this.redis.key(
      KEY_PREFIX.BALANCE,
      snapshot.exchange,
      snapshot.currency,
      timestamp
    );

    const data = {
      exchange: snapshot.exchange,
      currency: snapshot.currency,
      total: String(snapshot.total),
      free: String(snapshot.free),
      used: String(snapshot.used),
      timestamp: String(timestamp),
      metadata: snapshot.metadata ? JSON.stringify(snapshot.metadata) : '',
    };

    await this.redis.transaction(async (multi) => {
      multi.hSet(key, data);

      // 添加时间索引 / Add time index
      multi.zAdd(this.redis.key(KEY_PREFIX.BALANCE, 'idx', 'time'), {
        score: timestamp,
        value: key,
      });
    });

    return { changes: 1 };
  }

  /**
   * 批量插入余额快照
   * @param {Array} snapshots - 快照数组
   */
  async insertBalanceSnapshots(snapshots) {
    for (const snapshot of snapshots) {
      await this.insertBalanceSnapshot(snapshot);
    }
    return { count: snapshots.length };
  }

  // ============================================
  // K线缓存操作 Candle Cache Operations
  // ============================================

  /**
   * 插入K线数据
   * @param {Object} candle - K线数据
   */
  async insertCandle(candle) {
    const key = this.redis.key(
      KEY_PREFIX.CANDLE,
      candle.exchange,
      candle.symbol,
      candle.timeframe,
      candle.timestamp
    );

    await this.redis.hSet(key, {
      symbol: candle.symbol,
      timeframe: candle.timeframe,
      timestamp: String(candle.timestamp),
      open: String(candle.open),
      high: String(candle.high),
      low: String(candle.low),
      close: String(candle.close),
      volume: String(candle.volume),
      exchange: candle.exchange,
    });

    // 设置过期时间 / Set TTL
    if (this.config.candleTTL > 0) {
      await this.redis.expire(key, this.config.candleTTL * 24 * 60 * 60);
    }

    // 添加到时间索引 / Add to time index
    await this.redis.zAdd(
      this.redis.key(KEY_PREFIX.CANDLE, 'idx', candle.exchange, candle.symbol, candle.timeframe),
      { score: candle.timestamp, value: key }
    );

    return { changes: 1 };
  }

  /**
   * 批量插入K线数据
   * @param {Array} candles - K线数组
   */
  async insertCandles(candles) {
    for (const candle of candles) {
      await this.insertCandle(candle);
    }
    return { count: candles.length };
  }

  /**
   * 获取K线数据
   * @param {string} symbol - 交易对
   * @param {string} timeframe - 时间周期
   * @param {string} exchange - 交易所
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   */
  async getCandles(symbol, timeframe, exchange, startTime, endTime) {
    const indexKey = this.redis.key(KEY_PREFIX.CANDLE, 'idx', exchange, symbol, timeframe);

    const keys = await this.redis.zRangeByScore(indexKey, startTime, endTime);

    const candles = [];
    for (const key of keys) {
      const data = await this.redis.hGetAll(key);
      if (data && Object.keys(data).length > 0) {
        candles.push({
          symbol: data.symbol,
          timeframe: data.timeframe,
          timestamp: parseInt(data.timestamp, 10),
          open: parseFloat(data.open),
          high: parseFloat(data.high),
          low: parseFloat(data.low),
          close: parseFloat(data.close),
          volume: parseFloat(data.volume),
          exchange: data.exchange,
        });
      }
    }

    return candles;
  }

  // ============================================
  // 工具方法 Utility Methods
  // ============================================

  /**
   * 获取数据库统计
   */
  async getStats() {
    const [orderStats, positionStats, strategyStats, configStats] = await Promise.all([
      this.orders.getStats(),
      this.positions.getStats(),
      this.strategies.getOverview(),
      this.configs.getStats(),
    ]);

    const tradeCount = await this.redis.zCard(this.redis.key(KEY_PREFIX.TRADE_INDEX, 'time'));
    const auditCount = await this.redis.zCard(this.redis.key(KEY_PREFIX.AUDIT, 'idx', 'time'));

    return {
      orders: orderStats.total,
      openOrders: orderStats.byStatus?.open || 0,
      positions: positionStats.total,
      openPositions: positionStats.open,
      trades: tradeCount,
      strategies: strategyStats.total,
      runningStrategies: strategyStats.running,
      configs: configStats.configCount,
      auditLogs: auditCount,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    return this.redis.healthCheck();
  }

  /**
   * 执行事务
   * @param {Function} fn - 事务函数
   */
  async transaction(fn) {
    return this.redis.transaction(fn);
  }

  /**
   * 关闭数据库连接
   */
  async close() {
    if (this.redis) {
      await this.redis.close();
      this.redis = null;
    }

    this.orders = null;
    this.positions = null;
    this.strategies = null;
    this.configs = null;
    this.isInitialized = false;

    this.emit('closed');
  }

  /**
   * 清理过期数据
   * @param {Object} options - 清理选项
   */
  async cleanup(options = {}) {
    const results = {
      orders: 0,
      positions: 0,
      trades: 0,
      auditLogs: 0,
    };

    // 清理旧订单 / Clean up old orders
    if (options.orders !== false) {
      results.orders = await this.orders.cleanup(options.orderDays || 30);
    }

    // 清理旧持仓 / Clean up old positions
    if (options.positions !== false) {
      results.positions = await this.positions.cleanup(options.positionDays || 90);
    }

    return results;
  }
}

// 默认实例
let defaultRedisDb = null;

/**
 * 获取默认 Redis 数据库实例
 * @param {Object} config - 配置
 */
function getRedisDatabase(config = {}) {
  if (!defaultRedisDb) {
    defaultRedisDb = new RedisDatabaseManager(config);
  }
  return defaultRedisDb;
}

export {
  RedisDatabaseManager,
  getRedisDatabase,
};

export default RedisDatabaseManager;
