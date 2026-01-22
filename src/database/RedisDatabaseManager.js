/**
 * Redis 数据库管理器
 * Redis Database Manager
 *
 * Provides a database-manager-like interface for Redis
 *
 * @module src/database/RedisDatabaseManager
 */

import { EventEmitter } from 'events'; // 导入模块 events
import { RedisClient, KEY_PREFIX } from './redis/RedisClient.js'; // 导入模块 ./redis/RedisClient.js
import { OrderStore } from './redis/OrderStore.js'; // 导入模块 ./redis/OrderStore.js
import { PositionStore } from './redis/PositionStore.js'; // 导入模块 ./redis/PositionStore.js
import { StrategyStore } from './redis/StrategyStore.js'; // 导入模块 ./redis/StrategyStore.js
import { ConfigStore } from './redis/ConfigStore.js'; // 导入模块 ./redis/ConfigStore.js

/**
 * Redis 数据库管理器
 * Redis Database Manager Class
 */
class RedisDatabaseManager extends EventEmitter { // 定义类 RedisDatabaseManager(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { // 设置 config
      // Redis 连接配置 / Redis connection config
      redis: { // 设置 redis 字段
        url: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379', // 读取环境变量 REDIS_URL
        database: config.redisDb || parseInt(process.env.REDIS_DB || '0', 10), // 读取环境变量 REDIS_DB
        keyPrefix: config.keyPrefix || process.env.REDIS_PREFIX || 'quant:', // 读取环境变量 REDIS_PREFIX
        ...config.redis, // 展开对象或数组
      }, // 结束代码块
      // 交易和 K线数据过期时间 (天) / Trade and candle TTL (days)
      tradeTTL: config.tradeTTL || 365, // 设置 tradeTTL 字段
      candleTTL: config.candleTTL || 30, // 设置 candleTTL 字段
      // 审计日志过期时间 (天) / Audit log TTL (days)
      auditTTL: config.auditTTL || 90, // 设置 auditTTL 字段
    }; // 结束代码块

    // Redis 客户端 / Redis client
    this.redis = null; // 设置 redis

    // 存储层实例 / Store instances
    this.orders = null; // 设置 orders
    this.positions = null; // 设置 positions
    this.strategies = null; // 设置 strategies
    this.configs = null; // 设置 configs

    // 状态 / State
    this.isInitialized = false; // 设置 isInitialized
  } // 结束代码块

  /**
   * 初始化数据库
   * Initialize database
   */
  async initialize() { // 执行语句
    if (this.isInitialized) return; // 条件判断 this.isInitialized

    try { // 尝试执行
      // 创建 Redis 客户端 / Create Redis client
      this.redis = new RedisClient(this.config.redis); // 设置 redis
      await this.redis.initialize(); // 等待异步结果

      // 创建存储层实例 / Create store instances
      this.orders = new OrderStore(this.redis); // 设置 orders
      this.positions = new PositionStore(this.redis); // 设置 positions
      this.strategies = new StrategyStore(this.redis); // 设置 strategies
      this.configs = new ConfigStore(this.redis); // 设置 configs

      this.isInitialized = true; // 设置 isInitialized
      this.emit('initialized'); // 调用 emit

    } catch (error) { // 执行语句
      this.emit('error', error); // 调用 emit
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 订单操作 Order Operations
  // ============================================

  /**
   * 插入订单
   * @param {Object} order - 订单数据
   */
  async insertOrder(order) { // 执行语句
    return this.orders.insert(order); // 返回结果
  } // 结束代码块

  /**
   * 更新订单
   * @param {Object} order - 订单更新数据
   */
  async updateOrder(order) { // 执行语句
    return this.orders.update(order); // 返回结果
  } // 结束代码块

  /**
   * 获取订单
   * @param {string} orderId - 订单ID
   */
  async getOrderById(orderId) { // 执行语句
    return this.orders.getById(orderId); // 返回结果
  } // 结束代码块

  /**
   * 获取未完成订单
   */
  async getOpenOrders() { // 执行语句
    return this.orders.getOpenOrders(); // 返回结果
  } // 结束代码块

  /**
   * 按交易对获取订单
   * @param {string} symbol - 交易对
   * @param {number} limit - 限制数量
   */
  async getOrdersBySymbol(symbol, limit = 100) { // 执行语句
    return this.orders.getBySymbol(symbol, { limit }); // 返回结果
  } // 结束代码块

  /**
   * 按时间范围获取订单
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   */
  async getOrdersByTimeRange(startTime, endTime) { // 执行语句
    return this.orders.getByTimeRange(startTime, endTime); // 返回结果
  } // 结束代码块

  // ============================================
  // 持仓操作 Position Operations
  // ============================================

  /**
   * 插入持仓
   * @param {Object} position - 持仓数据
   */
  async insertPosition(position) { // 执行语句
    return this.positions.insert(position); // 返回结果
  } // 结束代码块

  /**
   * 更新持仓
   * @param {Object} position - 持仓更新数据
   */
  async updatePosition(position) { // 执行语句
    return this.positions.update(position); // 返回结果
  } // 结束代码块

  /**
   * 获取未平仓持仓
   */
  async getOpenPositions() { // 执行语句
    return this.positions.getOpenPositions(); // 返回结果
  } // 结束代码块

  /**
   * 按交易对获取活跃持仓
   * @param {string} symbol - 交易对
   */
  async getPositionsBySymbol(symbol) { // 执行语句
    return this.positions.getOpenBySymbol(symbol); // 返回结果
  } // 结束代码块

  /**
   * 获取持仓汇总
   */
  async getPositionSummary() { // 执行语句
    return this.positions.getSummary(); // 返回结果
  } // 结束代码块

  // ============================================
  // 交易记录操作 Trade Operations
  // ============================================

  /**
   * 插入交易记录
   * @param {Object} trade - 交易数据
   */
  async insertTrade(trade) { // 执行语句
    const tradeId = trade.tradeId || trade.id; // 定义常量 tradeId
    const timestamp = trade.timestamp || Date.now(); // 定义常量 timestamp
    const key = this.redis.key(KEY_PREFIX.TRADE, tradeId); // 定义常量 key

    // 序列化交易数据 / Serialize trade data
    const data = { // 定义常量 data
      tradeId, // 执行语句
      orderId: trade.orderId || '', // 设置 orderId 字段
      symbol: trade.symbol || '', // 设置 symbol 字段
      side: trade.side || '', // 设置 side 字段
      type: trade.type || 'market', // 设置 type 字段
      amount: String(trade.amount || 0), // 设置 amount 字段
      price: String(trade.price || 0), // 设置 price 字段
      cost: String(trade.cost || trade.amount * trade.price || 0), // 设置 cost 字段
      fee: String(trade.fee || 0), // 设置 fee 字段
      feeCurrency: trade.feeCurrency || '', // 设置 feeCurrency 字段
      realizedPnl: String(trade.realizedPnl || 0), // 设置 realizedPnl 字段
      exchange: trade.exchange || '', // 设置 exchange 字段
      strategy: trade.strategy || '', // 设置 strategy 字段
      timestamp: String(timestamp), // 设置 timestamp 字段
      metadata: trade.metadata ? JSON.stringify(trade.metadata) : '', // 设置 metadata 字段
    }; // 结束代码块

    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 存储交易数据 / Store trade data
      multi.hSet(key, data); // 调用 multi.hSet

      // 设置过期时间 / Set TTL
      if (this.config.tradeTTL > 0) { // 条件判断 this.config.tradeTTL > 0
        multi.expire(key, this.config.tradeTTL * 24 * 60 * 60); // 调用 multi.expire
      } // 结束代码块

      // 添加时间索引 / Add time index
      multi.zAdd(this.redis.key(KEY_PREFIX.TRADE_INDEX, 'time'), { // 调用 multi.zAdd
        score: timestamp, // 设置 score 字段
        value: tradeId, // 设置 value 字段
      }); // 结束代码块

      // 添加交易对索引 / Add symbol index
      if (trade.symbol) { // 条件判断 trade.symbol
        multi.zAdd(this.redis.key(KEY_PREFIX.TRADE_INDEX, 'symbol', trade.symbol), { // 调用 multi.zAdd
          score: timestamp, // 设置 score 字段
          value: tradeId, // 设置 value 字段
        }); // 结束代码块
      } // 结束代码块
    }); // 结束代码块

    return { tradeId, changes: 1 }; // 返回结果
  } // 结束代码块

  /**
   * 批量插入交易
   * @param {Array} trades - 交易数组
   */
  async insertTrades(trades) { // 执行语句
    for (const trade of trades) { // 循环 const trade of trades
      await this.insertTrade(trade); // 等待异步结果
    } // 结束代码块
    return { count: trades.length }; // 返回结果
  } // 结束代码块

  /**
   * 获取交易记录
   * @param {string} tradeId - 交易ID
   */
  async getTradeById(tradeId) { // 执行语句
    const data = await this.redis.hGetAll(this.redis.key(KEY_PREFIX.TRADE, tradeId)); // 定义常量 data

    if (!data || Object.keys(data).length === 0) { // 条件判断 !data || Object.keys(data).length === 0
      return null; // 返回结果
    } // 结束代码块

    return this._deserializeTrade(data); // 返回结果
  } // 结束代码块

  /**
   * 按交易对获取交易
   * @param {string} symbol - 交易对
   * @param {number} limit - 限制数量
   */
  async getTradesBySymbol(symbol, limit = 100) { // 执行语句
    const tradeIds = await this.redis.zRange( // 定义常量 tradeIds
      this.redis.key(KEY_PREFIX.TRADE_INDEX, 'symbol', symbol), // 访问 redis
      0, // 执行语句
      limit - 1, // 执行语句
      { REV: true } // 执行语句
    ); // 结束调用或参数

    const trades = []; // 定义常量 trades
    for (const tradeId of tradeIds) { // 循环 const tradeId of tradeIds
      const trade = await this.getTradeById(tradeId); // 定义常量 trade
      if (trade) { // 条件判断 trade
        trades.push(trade); // 调用 trades.push
      } // 结束代码块
    } // 结束代码块

    return trades; // 返回结果
  } // 结束代码块

  /**
   * 按时间范围获取交易
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   */
  async getTradesByTimeRange(startTime, endTime) { // 执行语句
    const tradeIds = await this.redis.zRangeByScore( // 定义常量 tradeIds
      this.redis.key(KEY_PREFIX.TRADE_INDEX, 'time'), // 访问 redis
      startTime, // 执行语句
      endTime // 执行语句
    ); // 结束调用或参数

    const trades = []; // 定义常量 trades
    for (const tradeId of tradeIds) { // 循环 const tradeId of tradeIds
      const trade = await this.getTradeById(tradeId); // 定义常量 trade
      if (trade) { // 条件判断 trade
        trades.push(trade); // 调用 trades.push
      } // 结束代码块
    } // 结束代码块

    return trades.reverse(); // 返回结果
  } // 结束代码块

  /**
   * 反序列化交易数据
   * @private
   */
  _deserializeTrade(data) { // 调用 _deserializeTrade
    return { // 返回结果
      tradeId: data.tradeId, // 设置 tradeId 字段
      orderId: data.orderId || null, // 设置 orderId 字段
      symbol: data.symbol, // 设置 symbol 字段
      side: data.side, // 设置 side 字段
      type: data.type, // 设置 type 字段
      amount: parseFloat(data.amount), // 设置 amount 字段
      price: parseFloat(data.price), // 设置 price 字段
      cost: parseFloat(data.cost), // 设置 cost 字段
      fee: parseFloat(data.fee), // 设置 fee 字段
      feeCurrency: data.feeCurrency || null, // 设置 feeCurrency 字段
      realizedPnl: parseFloat(data.realizedPnl) || null, // 设置 realizedPnl 字段
      exchange: data.exchange, // 设置 exchange 字段
      strategy: data.strategy || null, // 设置 strategy 字段
      timestamp: parseInt(data.timestamp, 10), // 设置 timestamp 字段
      metadata: data.metadata ? JSON.parse(data.metadata) : null, // 设置 metadata 字段
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 策略状态操作 Strategy State Operations
  // ============================================

  /**
   * 保存策略状态
   * @param {Object} strategyState - 策略状态
   */
  async saveStrategyState(strategyState) { // 执行语句
    return this.strategies.save(strategyState); // 返回结果
  } // 结束代码块

  /**
   * 获取策略状态
   * @param {string} strategyId - 策略ID
   */
  async getStrategyState(strategyId) { // 执行语句
    return this.strategies.getById(strategyId); // 返回结果
  } // 结束代码块

  /**
   * 获取所有策略状态
   */
  async getAllStrategyStates() { // 执行语句
    return this.strategies.getAll(); // 返回结果
  } // 结束代码块

  /**
   * 更新策略运行状态
   * @param {string} strategyId - 策略ID
   * @param {string} state - 状态
   */
  async updateStrategyState(strategyId, state) { // 执行语句
    return this.strategies.updateState(strategyId, state); // 返回结果
  } // 结束代码块

  // ============================================
  // 配置操作 Config Operations
  // ============================================

  /**
   * 设置配置
   * @param {string} key - 配置键
   * @param {any} value - 配置值
   */
  async setConfig(key, value) { // 执行语句
    return this.configs.set(key, value); // 返回结果
  } // 结束代码块

  /**
   * 获取配置
   * @param {string} key - 配置键
   * @param {any} defaultValue - 默认值
   */
  async getConfig(key, defaultValue = null) { // 执行语句
    return this.configs.get(key, defaultValue); // 返回结果
  } // 结束代码块

  /**
   * 获取所有配置
   */
  async getAllConfigs() { // 执行语句
    return this.configs.getAll(); // 返回结果
  } // 结束代码块

  // ============================================
  // 审计日志操作 Audit Log Operations
  // ============================================

  /**
   * 插入审计日志
   * @param {Object} log - 日志数据
   */
  async insertAuditLog(log) { // 执行语句
    const logId = log.id || log.logId || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; // 定义常量 logId
    const timestamp = new Date(log.timestamp).getTime(); // 定义常量 timestamp
    const key = this.redis.key(KEY_PREFIX.AUDIT, logId); // 定义常量 key

    const data = { // 定义常量 data
      logId, // 执行语句
      eventType: log.eventType || '', // 设置 eventType 字段
      level: log.level || 'info', // 设置 level 字段
      timestamp: String(timestamp), // 设置 timestamp 字段
      data: log.data ? JSON.stringify(log.data) : '', // 设置 data 字段
      metadata: log.metadata ? JSON.stringify(log.metadata) : '', // 设置 metadata 字段
      prevHash: log.prevHash || '', // 设置 prevHash 字段
      hash: log.hash || '', // 设置 hash 字段
    }; // 结束代码块

    await this.redis.transaction(async (multi) => { // 等待异步结果
      multi.hSet(key, data); // 调用 multi.hSet

      // 设置过期时间 / Set TTL
      if (this.config.auditTTL > 0) { // 条件判断 this.config.auditTTL > 0
        multi.expire(key, this.config.auditTTL * 24 * 60 * 60); // 调用 multi.expire
      } // 结束代码块

      // 添加时间索引 / Add time index
      multi.zAdd(this.redis.key(KEY_PREFIX.AUDIT, 'idx', 'time'), { // 调用 multi.zAdd
        score: timestamp, // 设置 score 字段
        value: logId, // 设置 value 字段
      }); // 结束代码块

      // 添加事件类型索引 / Add event type index
      if (log.eventType) { // 条件判断 log.eventType
        multi.zAdd(this.redis.key(KEY_PREFIX.AUDIT, 'idx', 'event', log.eventType), { // 调用 multi.zAdd
          score: timestamp, // 设置 score 字段
          value: logId, // 设置 value 字段
        }); // 结束代码块
      } // 结束代码块
    }); // 结束代码块

    return { logId, changes: 1 }; // 返回结果
  } // 结束代码块

  /**
   * 批量插入审计日志
   * @param {Array} logs - 日志数组
   */
  async insertAuditLogs(logs) { // 执行语句
    for (const log of logs) { // 循环 const log of logs
      await this.insertAuditLog(log); // 等待异步结果
    } // 结束代码块
    return { count: logs.length }; // 返回结果
  } // 结束代码块

  /**
   * 获取审计日志
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   * @param {number} limit - 限制数量
   */
  async getAuditLogs(startTime, endTime, limit = 1000) { // 执行语句
    const logIds = await this.redis.zRangeByScore( // 定义常量 logIds
      this.redis.key(KEY_PREFIX.AUDIT, 'idx', 'time'), // 访问 redis
      startTime, // 执行语句
      endTime, // 执行语句
      { limit } // 执行语句
    ); // 结束调用或参数

    const logs = []; // 定义常量 logs
    for (const logId of logIds) { // 循环 const logId of logIds
      const data = await this.redis.hGetAll(this.redis.key(KEY_PREFIX.AUDIT, logId)); // 定义常量 data
      if (data && Object.keys(data).length > 0) { // 条件判断 data && Object.keys(data).length > 0
        logs.push({ // 调用 logs.push
          logId: data.logId, // 设置 logId 字段
          eventType: data.eventType, // 设置 eventType 字段
          level: data.level, // 设置 level 字段
          timestamp: parseInt(data.timestamp, 10), // 设置 timestamp 字段
          data: data.data ? JSON.parse(data.data) : null, // 设置 data 字段
          metadata: data.metadata ? JSON.parse(data.metadata) : null, // 设置 metadata 字段
          prevHash: data.prevHash || null, // 设置 prevHash 字段
          hash: data.hash || null, // 设置 hash 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return logs.reverse(); // 返回结果
  } // 结束代码块

  // ============================================
  // 余额快照操作 Balance Snapshot Operations
  // ============================================

  /**
   * 插入余额快照
   * @param {Object} snapshot - 快照数据
   */
  async insertBalanceSnapshot(snapshot) { // 执行语句
    const timestamp = snapshot.timestamp || Date.now(); // 定义常量 timestamp
    const key = this.redis.key( // 定义常量 key
      KEY_PREFIX.BALANCE, // 执行语句
      snapshot.exchange, // 执行语句
      snapshot.currency, // 执行语句
      timestamp // 执行语句
    ); // 结束调用或参数

    const data = { // 定义常量 data
      exchange: snapshot.exchange, // 设置 exchange 字段
      currency: snapshot.currency, // 设置 currency 字段
      total: String(snapshot.total), // 设置 total 字段
      free: String(snapshot.free), // 设置 free 字段
      used: String(snapshot.used), // 设置 used 字段
      timestamp: String(timestamp), // 设置 timestamp 字段
      metadata: snapshot.metadata ? JSON.stringify(snapshot.metadata) : '', // 设置 metadata 字段
    }; // 结束代码块

    await this.redis.transaction(async (multi) => { // 等待异步结果
      multi.hSet(key, data); // 调用 multi.hSet

      // 添加时间索引 / Add time index
      multi.zAdd(this.redis.key(KEY_PREFIX.BALANCE, 'idx', 'time'), { // 调用 multi.zAdd
        score: timestamp, // 设置 score 字段
        value: key, // 设置 value 字段
      }); // 结束代码块
    }); // 结束代码块

    return { changes: 1 }; // 返回结果
  } // 结束代码块

  /**
   * 批量插入余额快照
   * @param {Array} snapshots - 快照数组
   */
  async insertBalanceSnapshots(snapshots) { // 执行语句
    for (const snapshot of snapshots) { // 循环 const snapshot of snapshots
      await this.insertBalanceSnapshot(snapshot); // 等待异步结果
    } // 结束代码块
    return { count: snapshots.length }; // 返回结果
  } // 结束代码块

  // ============================================
  // K线缓存操作 Candle Cache Operations
  // ============================================

  /**
   * 插入K线数据
   * @param {Object} candle - K线数据
   */
  async insertCandle(candle) { // 执行语句
    const key = this.redis.key( // 定义常量 key
      KEY_PREFIX.CANDLE, // 执行语句
      candle.exchange, // 执行语句
      candle.symbol, // 执行语句
      candle.timeframe, // 执行语句
      candle.timestamp // 执行语句
    ); // 结束调用或参数

    await this.redis.hSet(key, { // 等待异步结果
      symbol: candle.symbol, // 设置 symbol 字段
      timeframe: candle.timeframe, // 设置 timeframe 字段
      timestamp: String(candle.timestamp), // 设置 timestamp 字段
      open: String(candle.open), // 设置 open 字段
      high: String(candle.high), // 设置 high 字段
      low: String(candle.low), // 设置 low 字段
      close: String(candle.close), // 设置 close 字段
      volume: String(candle.volume), // 设置 volume 字段
      exchange: candle.exchange, // 设置 exchange 字段
    }); // 结束代码块

    // 设置过期时间 / Set TTL
    if (this.config.candleTTL > 0) { // 条件判断 this.config.candleTTL > 0
      await this.redis.expire(key, this.config.candleTTL * 24 * 60 * 60); // 等待异步结果
    } // 结束代码块

    // 添加到时间索引 / Add to time index
    await this.redis.zAdd( // 等待异步结果
      this.redis.key(KEY_PREFIX.CANDLE, 'idx', candle.exchange, candle.symbol, candle.timeframe), // 访问 redis
      candle.timestamp, // 执行语句
      key // 执行语句
    ); // 结束调用或参数

    return { changes: 1 }; // 返回结果
  } // 结束代码块

  /**
   * 批量插入K线数据
   * @param {Array} candles - K线数组
   */
  async insertCandles(candles) { // 执行语句
    for (const candle of candles) { // 循环 const candle of candles
      await this.insertCandle(candle); // 等待异步结果
    } // 结束代码块
    return { count: candles.length }; // 返回结果
  } // 结束代码块

  /**
   * 获取K线数据
   * @param {string} symbol - 交易对
   * @param {string} timeframe - 时间周期
   * @param {string} exchange - 交易所
   * @param {number} startTime - 开始时间
   * @param {number} endTime - 结束时间
   */
  async getCandles(symbol, timeframe, exchange, startTime, endTime) { // 执行语句
    const indexKey = this.redis.key(KEY_PREFIX.CANDLE, 'idx', exchange, symbol, timeframe); // 定义常量 indexKey

    const keys = await this.redis.zRangeByScore(indexKey, startTime, endTime); // 定义常量 keys

    const candles = []; // 定义常量 candles
    for (const key of keys) { // 循环 const key of keys
      const data = await this.redis.hGetAll(key); // 定义常量 data
      if (data && Object.keys(data).length > 0) { // 条件判断 data && Object.keys(data).length > 0
        candles.push({ // 调用 candles.push
          symbol: data.symbol, // 设置 symbol 字段
          timeframe: data.timeframe, // 设置 timeframe 字段
          timestamp: parseInt(data.timestamp, 10), // 设置 timestamp 字段
          open: parseFloat(data.open), // 设置 open 字段
          high: parseFloat(data.high), // 设置 high 字段
          low: parseFloat(data.low), // 设置 low 字段
          close: parseFloat(data.close), // 设置 close 字段
          volume: parseFloat(data.volume), // 设置 volume 字段
          exchange: data.exchange, // 设置 exchange 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return candles; // 返回结果
  } // 结束代码块

  // ============================================
  // 工具方法 Utility Methods
  // ============================================

  /**
   * 获取数据库统计
   */
  async getStats() { // 执行语句
    const [orderStats, positionStats, strategyStats, configStats] = await Promise.all([ // 解构赋值
      this.orders.getStats(), // 访问 orders
      this.positions.getStats(), // 访问 positions
      this.strategies.getOverview(), // 访问 strategies
      this.configs.getStats(), // 访问 configs
    ]); // 结束数组或索引

    const tradeCount = await this.redis.zCard(this.redis.key(KEY_PREFIX.TRADE_INDEX, 'time')); // 定义常量 tradeCount
    const auditCount = await this.redis.zCard(this.redis.key(KEY_PREFIX.AUDIT, 'idx', 'time')); // 定义常量 auditCount

    return { // 返回结果
      orders: orderStats.total, // 设置 orders 字段
      openOrders: orderStats.byStatus?.open || 0, // 设置 openOrders 字段
      positions: positionStats.total, // 设置 positions 字段
      openPositions: positionStats.open, // 设置 openPositions 字段
      trades: tradeCount, // 设置 trades 字段
      strategies: strategyStats.total, // 设置 strategies 字段
      runningStrategies: strategyStats.running, // 设置 runningStrategies 字段
      configs: configStats.configCount, // 设置 configs 字段
      auditLogs: auditCount, // 设置 auditLogs 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 健康检查
   */
  async healthCheck() { // 执行语句
    return this.redis.healthCheck(); // 返回结果
  } // 结束代码块

  /**
   * 执行事务
   * @param {Function} fn - 事务函数
   */
  async transaction(fn) { // 执行语句
    return this.redis.transaction(fn); // 返回结果
  } // 结束代码块

  /**
   * 关闭数据库连接
   */
  async close() { // 执行语句
    if (this.redis) { // 条件判断 this.redis
      await this.redis.close(); // 等待异步结果
      this.redis = null; // 设置 redis
    } // 结束代码块

    this.orders = null; // 设置 orders
    this.positions = null; // 设置 positions
    this.strategies = null; // 设置 strategies
    this.configs = null; // 设置 configs
    this.isInitialized = false; // 设置 isInitialized

    this.emit('closed'); // 调用 emit
  } // 结束代码块

  /**
   * 清理过期数据
   * @param {Object} options - 清理选项
   */
  async cleanup(options = {}) { // 执行语句
    const results = { // 定义常量 results
      orders: 0, // 设置 orders 字段
      positions: 0, // 设置 positions 字段
      trades: 0, // 设置 trades 字段
      auditLogs: 0, // 设置 auditLogs 字段
    }; // 结束代码块

    // 清理旧订单 / Clean up old orders
    if (options.orders !== false) { // 条件判断 options.orders !== false
      results.orders = await this.orders.cleanup(options.orderDays || 30); // 赋值 results.orders
    } // 结束代码块

    // 清理旧持仓 / Clean up old positions
    if (options.positions !== false) { // 条件判断 options.positions !== false
      results.positions = await this.positions.cleanup(options.positionDays || 90); // 赋值 results.positions
    } // 结束代码块

    return results; // 返回结果
  } // 结束代码块
} // 结束代码块

// 默认实例
let defaultRedisDb = null; // 定义变量 defaultRedisDb

/**
 * 获取默认 Redis 数据库实例
 * @param {Object} config - 配置
 */
function getRedisDatabase(config = {}) { // 定义函数 getRedisDatabase
  if (!defaultRedisDb) { // 条件判断 !defaultRedisDb
    defaultRedisDb = new RedisDatabaseManager(config); // 赋值 defaultRedisDb
  } // 结束代码块
  return defaultRedisDb; // 返回结果
} // 结束代码块

export { // 导出命名成员
  RedisDatabaseManager, // 执行语句
  getRedisDatabase, // 执行语句
}; // 结束代码块

export default RedisDatabaseManager; // 默认导出
