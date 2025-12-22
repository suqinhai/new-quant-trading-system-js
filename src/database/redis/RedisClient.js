/**
 * Redis 客户端管理器
 * Redis Client Manager
 *
 * 提供 Redis 连接管理和基础操作
 * Provides Redis connection management and basic operations
 *
 * @module src/database/redis/RedisClient
 */

import { createClient } from 'redis';
import { EventEmitter } from 'events';

/**
 * Redis 键前缀命名空间
 * Redis key prefix namespaces
 */
export const KEY_PREFIX = {
  ORDER: 'order',              // 订单 / Orders
  ORDER_INDEX: 'order:idx',    // 订单索引 / Order indexes
  POSITION: 'pos',             // 持仓 / Positions
  POSITION_INDEX: 'pos:idx',   // 持仓索引 / Position indexes
  TRADE: 'trade',              // 交易 / Trades
  TRADE_INDEX: 'trade:idx',    // 交易索引 / Trade indexes
  STRATEGY: 'strategy',        // 策略状态 / Strategy states
  CONFIG: 'config',            // 系统配置 / System config
  BALANCE: 'balance',          // 余额快照 / Balance snapshots
  AUDIT: 'audit',              // 审计日志 / Audit logs
  CANDLE: 'candle',            // K线缓存 / Candle cache
  LOCK: 'lock',                // 分布式锁 / Distributed locks
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // Redis 连接 URL
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  // 数据库索引
  database: parseInt(process.env.REDIS_DB || '0', 10),
  // 键前缀
  keyPrefix: process.env.REDIS_PREFIX || 'quant:',
  // 连接超时 (ms)
  connectTimeout: 10000,
  // 命令超时 (ms)
  commandTimeout: 5000,
  // 重连策略
  reconnectStrategy: (retries) => {
    if (retries > 10) {
      return new Error('Max reconnection attempts reached');
    }
    return Math.min(retries * 100, 3000);
  },
  // 是否启用只读副本
  enableReadReplica: false,
  // 只读副本 URL
  readReplicaUrl: null,
};

/**
 * Redis 客户端管理器
 * Redis Client Manager Class
 */
class RedisClient extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = null;
    this.readClient = null;
    this.isConnected = false;
    this.isInitialized = false;
  }

  /**
   * 初始化 Redis 连接
   * Initialize Redis connection
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // 创建主客户端 / Create main client
      this.client = createClient({
        url: this.config.url,
        database: this.config.database,
        socket: {
          connectTimeout: this.config.connectTimeout,
          reconnectStrategy: this.config.reconnectStrategy,
        },
      });

      // 设置事件处理 / Set up event handlers
      this.client.on('error', (err) => {
        this.emit('error', err);
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.emit('connect');
      });

      this.client.on('disconnect', () => {
        this.isConnected = false;
        this.emit('disconnect');
      });

      this.client.on('reconnecting', () => {
        this.emit('reconnecting');
      });

      // 连接 / Connect
      await this.client.connect();

      // 创建只读副本连接 (如果配置) / Create read replica connection (if configured)
      if (this.config.enableReadReplica && this.config.readReplicaUrl) {
        this.readClient = createClient({
          url: this.config.readReplicaUrl,
          database: this.config.database,
          socket: {
            connectTimeout: this.config.connectTimeout,
          },
        });
        await this.readClient.connect();
      }

      this.isInitialized = true;
      this.emit('initialized');

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 获取完整键名
   * Get full key name with prefix
   *
   * @param {string} namespace - 命名空间 / Namespace
   * @param {string} key - 键名 / Key name
   * @returns {string} 完整键名 / Full key name
   */
  key(namespace, ...parts) {
    return `${this.config.keyPrefix}${namespace}:${parts.join(':')}`;
  }

  /**
   * 获取读取客户端 (优先使用只读副本)
   * Get read client (prefer read replica)
   */
  getReadClient() {
    return this.readClient || this.client;
  }

  // ============================================
  // 基础操作 / Basic Operations
  // ============================================

  /**
   * 设置字符串值
   * Set string value
   */
  async set(key, value, options = {}) {
    const args = [];
    if (options.EX) args.push('EX', options.EX);
    if (options.PX) args.push('PX', options.PX);
    if (options.NX) args.push('NX');
    if (options.XX) args.push('XX');

    return this.client.set(key, value, ...args);
  }

  /**
   * 获取字符串值
   * Get string value
   */
  async get(key) {
    return this.getReadClient().get(key);
  }

  /**
   * 删除键
   * Delete key(s)
   */
  async del(...keys) {
    return this.client.del(keys);
  }

  /**
   * 检查键是否存在
   * Check if key exists
   */
  async exists(...keys) {
    return this.getReadClient().exists(keys);
  }

  /**
   * 设置过期时间
   * Set expiration time
   */
  async expire(key, seconds) {
    return this.client.expire(key, seconds);
  }

  /**
   * 获取剩余过期时间
   * Get remaining TTL
   */
  async ttl(key) {
    return this.getReadClient().ttl(key);
  }

  // ============================================
  // Hash 操作 / Hash Operations
  // ============================================

  /**
   * 设置 Hash 字段
   * Set Hash field
   */
  async hSet(key, field, value) {
    return this.client.hSet(key, field, value);
  }

  /**
   * 批量设置 Hash 字段
   * Set multiple Hash fields
   */
  async hMSet(key, data) {
    if (typeof data !== 'object' || data === null) {
      throw new Error('hMSet requires an object');
    }
    return this.client.hSet(key, data);
  }

  /**
   * 获取 Hash 字段
   * Get Hash field
   */
  async hGet(key, field) {
    return this.getReadClient().hGet(key, field);
  }

  /**
   * 获取多个 Hash 字段
   * Get multiple Hash fields
   */
  async hMGet(key, fields) {
    return this.getReadClient().hmGet(key, fields);
  }

  /**
   * 获取所有 Hash 字段和值
   * Get all Hash fields and values
   */
  async hGetAll(key) {
    return this.getReadClient().hGetAll(key);
  }

  /**
   * 删除 Hash 字段
   * Delete Hash field(s)
   */
  async hDel(key, ...fields) {
    return this.client.hDel(key, fields);
  }

  /**
   * 检查 Hash 字段是否存在
   * Check if Hash field exists
   */
  async hExists(key, field) {
    return this.getReadClient().hExists(key, field);
  }

  /**
   * 获取 Hash 长度
   * Get Hash length
   */
  async hLen(key) {
    return this.getReadClient().hLen(key);
  }

  /**
   * Hash 字段增量
   * Increment Hash field
   */
  async hIncrBy(key, field, increment) {
    return this.client.hIncrBy(key, field, increment);
  }

  /**
   * Hash 浮点增量
   * Increment Hash field by float
   */
  async hIncrByFloat(key, field, increment) {
    return this.client.hIncrByFloat(key, field, increment);
  }

  // ============================================
  // Sorted Set 操作 / Sorted Set Operations
  // ============================================

  /**
   * 添加到有序集合
   * Add to sorted set
   */
  async zAdd(key, score, member) {
    return this.client.zAdd(key, { score, value: member });
  }

  /**
   * 批量添加到有序集合
   * Add multiple members to sorted set
   */
  async zAddMultiple(key, members) {
    // members: [{ score, value }, ...]
    return this.client.zAdd(key, members);
  }

  /**
   * 从有序集合移除
   * Remove from sorted set
   */
  async zRem(key, ...members) {
    return this.client.zRem(key, members);
  }

  /**
   * 按分数范围获取
   * Get by score range
   */
  async zRangeByScore(key, min, max, options = {}) {
    const args = {
      BY: 'SCORE',
      LIMIT: options.limit ? { offset: options.offset || 0, count: options.limit } : undefined,
    };
    return this.getReadClient().zRange(key, min, max, args);
  }

  /**
   * 按分数范围获取 (带分数)
   * Get by score range with scores
   */
  async zRangeByScoreWithScores(key, min, max, options = {}) {
    const args = {
      BY: 'SCORE',
      LIMIT: options.limit ? { offset: options.offset || 0, count: options.limit } : undefined,
    };
    return this.getReadClient().zRangeWithScores(key, min, max, args);
  }

  /**
   * 按排名范围获取
   * Get by rank range
   */
  async zRange(key, start, stop, options = {}) {
    const args = {};
    if (options.REV) args.REV = true;
    return this.getReadClient().zRange(key, start, stop, args);
  }

  /**
   * 按排名范围获取 (带分数)
   * Get by rank range with scores
   */
  async zRangeWithScores(key, start, stop, options = {}) {
    const args = {};
    if (options.REV) args.REV = true;
    return this.getReadClient().zRangeWithScores(key, start, stop, args);
  }

  /**
   * 获取成员分数
   * Get member score
   */
  async zScore(key, member) {
    return this.getReadClient().zScore(key, member);
  }

  /**
   * 获取有序集合大小
   * Get sorted set size
   */
  async zCard(key) {
    return this.getReadClient().zCard(key);
  }

  /**
   * 按分数范围计数
   * Count by score range
   */
  async zCount(key, min, max) {
    return this.getReadClient().zCount(key, min, max);
  }

  /**
   * 按分数范围删除
   * Remove by score range
   */
  async zRemRangeByScore(key, min, max) {
    return this.client.zRemRangeByScore(key, min, max);
  }

  // ============================================
  // Set 操作 / Set Operations
  // ============================================

  /**
   * 添加到集合
   * Add to set
   */
  async sAdd(key, ...members) {
    return this.client.sAdd(key, members);
  }

  /**
   * 从集合移除
   * Remove from set
   */
  async sRem(key, ...members) {
    return this.client.sRem(key, members);
  }

  /**
   * 获取集合成员
   * Get set members
   */
  async sMembers(key) {
    return this.getReadClient().sMembers(key);
  }

  /**
   * 检查成员是否在集合中
   * Check if member is in set
   */
  async sIsMember(key, member) {
    return this.getReadClient().sIsMember(key, member);
  }

  /**
   * 获取集合大小
   * Get set size
   */
  async sCard(key) {
    return this.getReadClient().sCard(key);
  }

  // ============================================
  // List 操作 / List Operations
  // ============================================

  /**
   * 左侧推入
   * Left push
   */
  async lPush(key, ...values) {
    return this.client.lPush(key, values);
  }

  /**
   * 右侧推入
   * Right push
   */
  async rPush(key, ...values) {
    return this.client.rPush(key, values);
  }

  /**
   * 获取列表范围
   * Get list range
   */
  async lRange(key, start, stop) {
    return this.getReadClient().lRange(key, start, stop);
  }

  /**
   * 修剪列表
   * Trim list
   */
  async lTrim(key, start, stop) {
    return this.client.lTrim(key, start, stop);
  }

  /**
   * 获取列表长度
   * Get list length
   */
  async lLen(key) {
    return this.getReadClient().lLen(key);
  }

  // ============================================
  // 事务操作 / Transaction Operations
  // ============================================

  /**
   * 执行事务
   * Execute transaction
   *
   * @param {Function} fn - 事务函数，接收 multi 对象 / Transaction function, receives multi object
   */
  async transaction(fn) {
    const multi = this.client.multi();
    await fn(multi);
    return multi.exec();
  }

  /**
   * 执行管道
   * Execute pipeline
   *
   * @param {Function} fn - 管道函数，接收 pipeline 对象 / Pipeline function
   */
  async pipeline(fn) {
    const pipeline = this.client.multi();
    await fn(pipeline);
    return pipeline.exec();
  }

  // ============================================
  // 分布式锁 / Distributed Lock
  // ============================================

  /**
   * 获取锁
   * Acquire lock
   *
   * @param {string} lockName - 锁名称 / Lock name
   * @param {number} ttl - 锁超时 (秒) / Lock TTL (seconds)
   * @param {string} token - 锁令牌 / Lock token
   * @returns {boolean} 是否成功 / Whether successful
   */
  async acquireLock(lockName, ttl = 30, token = null) {
    const lockKey = this.key(KEY_PREFIX.LOCK, lockName);
    const lockToken = token || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const result = await this.client.set(lockKey, lockToken, {
      NX: true,
      EX: ttl,
    });

    return result === 'OK' ? lockToken : null;
  }

  /**
   * 释放锁
   * Release lock
   *
   * @param {string} lockName - 锁名称 / Lock name
   * @param {string} token - 锁令牌 / Lock token
   */
  async releaseLock(lockName, token) {
    const lockKey = this.key(KEY_PREFIX.LOCK, lockName);
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    return this.client.eval(script, {
      keys: [lockKey],
      arguments: [token],
    });
  }

  /**
   * 续期锁
   * Extend lock
   *
   * @param {string} lockName - 锁名称 / Lock name
   * @param {string} token - 锁令牌 / Lock token
   * @param {number} ttl - 新的 TTL (秒) / New TTL (seconds)
   */
  async extendLock(lockName, token, ttl = 30) {
    const lockKey = this.key(KEY_PREFIX.LOCK, lockName);
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    return this.client.eval(script, {
      keys: [lockKey],
      arguments: [token, ttl.toString()],
    });
  }

  // ============================================
  // 扫描操作 / Scan Operations
  // ============================================

  /**
   * 扫描键
   * Scan keys
   *
   * @param {string} pattern - 模式 / Pattern
   * @param {number} count - 每次扫描数量 / Count per scan
   */
  async *scan(pattern, count = 100) {
    let cursor = 0;
    do {
      const result = await this.client.scan(cursor, {
        MATCH: pattern,
        COUNT: count,
      });
      cursor = result.cursor;
      for (const key of result.keys) {
        yield key;
      }
    } while (cursor !== 0);
  }

  /**
   * 获取所有匹配的键
   * Get all matching keys
   *
   * @param {string} pattern - 模式 / Pattern
   */
  async keys(pattern) {
    const result = [];
    for await (const key of this.scan(pattern)) {
      result.push(key);
    }
    return result;
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
      return { status: 'healthy', message: 'Redis is operational' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  /**
   * 获取服务器信息
   * Get server info
   */
  async info(section = null) {
    return this.client.info(section);
  }

  /**
   * 获取数据库大小
   * Get database size
   */
  async dbSize() {
    return this.client.dbSize();
  }

  /**
   * 清空当前数据库
   * Flush current database
   */
  async flushDb() {
    return this.client.flushDb();
  }

  /**
   * 关闭连接
   * Close connection
   */
  async close() {
    if (this.readClient) {
      await this.readClient.quit();
      this.readClient = null;
    }

    if (this.client) {
      await this.client.quit();
      this.client = null;
    }

    this.isConnected = false;
    this.isInitialized = false;
    this.emit('closed');
  }
}

// 默认实例
let defaultClient = null;

/**
 * 获取默认 Redis 客户端
 * Get default Redis client
 */
function getRedisClient(config = {}) {
  if (!defaultClient) {
    defaultClient = new RedisClient(config);
  }
  return defaultClient;
}

export {
  RedisClient,
  getRedisClient,
  KEY_PREFIX,
};

export default RedisClient;
