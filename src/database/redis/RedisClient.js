/**
 * Redis 客户端管理器
 * Redis Client Manager
 *
 * 提供 Redis 连接管理和基础操作
 * Provides Redis connection management and basic operations
 *
 * @module src/database/redis/RedisClient
 */

import { createClient } from 'redis'; // 导入模块 redis
import { EventEmitter } from 'events'; // 导入模块 events

/**
 * Redis 键前缀命名空间
 * Redis key prefix namespaces
 */
export const KEY_PREFIX = { // 导出常量 KEY_PREFIX
  ORDER: 'order',              // 订单 / Orders
  ORDER_INDEX: 'order:idx',    // 订单INDEX权限
  POSITION: 'pos',             // 持仓 / Positions
  POSITION_INDEX: 'pos:idx',   // 持仓INDEX权限
  TRADE: 'trade',              // 交易 / Trades
  TRADE_INDEX: 'trade:idx',    // 交易INDEX权限
  STRATEGY: 'strategy',        // 策略状态 / Strategy states
  CONFIG: 'config',            // 配置权限
  BALANCE: 'balance',          // 余额权限
  AUDIT: 'audit',              // 审计日志 / Audit logs
  CANDLE: 'candle',            // K线缓存 / Candle cache
  LOCK: 'lock',                // 分布式锁 / Distributed locks
}; // 结束代码块

/**
 * 构建 Redis URL
 * Build Redis URL from environment variables
 */
function buildRedisUrl() { // 定义函数 buildRedisUrl
  if (process.env.REDIS_URL) { // 条件判断 process.env.REDIS_URL
    return process.env.REDIS_URL; // 返回结果
  } // 结束代码块
  const host = process.env.REDIS_HOST || 'localhost'; // 定义常量 host
  const port = process.env.REDIS_PORT || '6379'; // 定义常量 port
  const password = process.env.REDIS_PASSWORD; // 定义常量 password

  if (password) { // 条件判断 password
    return `redis://:${password}@${host}:${port}`; // 返回结果
  } // 结束代码块
  return `redis://${host}:${port}`; // 返回结果
} // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // Redis 连接 URL
  url: buildRedisUrl(), // Redis 连接 URL
  // 数据库索引
  database: parseInt(process.env.REDIS_DB || '0', 10), // database
  // 键前缀
  keyPrefix: process.env.REDIS_PREFIX || 'quant:', // 密钥前缀
  // 连接超时 (ms)
  connectTimeout: 10000, // 连接超时 (ms)
  // 命令超时 (ms)
  commandTimeout: 5000, // 命令超时 (ms)
  // 重连策略
  reconnectStrategy: (retries) => { // reconnect策略
    if (retries > 10) { // 条件判断 retries > 10
      return new Error('Max reconnection attempts reached'); // 返回结果
    } // 结束代码块
    return Math.min(retries * 100, 3000); // 返回结果
  }, // 结束代码块
  // 是否启用只读副本
  enableReadReplica: false, // 是否启用只读副本
  // 只读副本 URL
  readReplicaUrl: null, // 只读副本 URL
}; // 结束代码块

/**
 * Redis 客户端管理器
 * Redis Client Manager Class
 */
class RedisClient extends EventEmitter { // 定义类 RedisClient(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config
    this.client = null; // 设置 client
    this.readClient = null; // 设置 readClient
    this.isConnected = false; // 设置 isConnected
    this.isInitialized = false; // 设置 isInitialized
  } // 结束代码块

  /**
   * 初始化 Redis 连接
   * Initialize Redis connection
   */
  async initialize() { // 执行语句
    if (this.isInitialized) return; // 条件判断 this.isInitialized

    try { // 尝试执行
      // 创建主客户端 / Create main client
      this.client = createClient({ // 设置 client
        url: this.config.url, // URL
        database: this.config.database, // database
        socket: { // socket
          connectTimeout: this.config.connectTimeout, // connect超时
          reconnectStrategy: this.config.reconnectStrategy, // reconnect策略
        }, // 结束代码块
      }); // 结束代码块

      // 设置事件处理 / Set up event handlers
      this.client.on('error', (err) => { // 访问 client
        this.emit('error', err); // 调用 emit
      }); // 结束代码块

      this.client.on('connect', () => { // 访问 client
        this.isConnected = true; // 设置 isConnected
        this.emit('connect'); // 调用 emit
      }); // 结束代码块

      this.client.on('disconnect', () => { // 访问 client
        this.isConnected = false; // 设置 isConnected
        this.emit('disconnect'); // 调用 emit
      }); // 结束代码块

      this.client.on('reconnecting', () => { // 访问 client
        this.emit('reconnecting'); // 调用 emit
      }); // 结束代码块

      // 连接 / Connect
      await this.client.connect(); // 等待异步结果

      // 创建只读副本连接 (如果配置) / Create read replica connection (if configured)
      if (this.config.enableReadReplica && this.config.readReplicaUrl) { // 条件判断 this.config.enableReadReplica && this.config....
        this.readClient = createClient({ // 设置 readClient
          url: this.config.readReplicaUrl, // URL
          database: this.config.database, // database
          socket: { // socket
            connectTimeout: this.config.connectTimeout, // connect超时
          }, // 结束代码块
        }); // 结束代码块
        await this.readClient.connect(); // 等待异步结果
      } // 结束代码块

      this.isInitialized = true; // 设置 isInitialized
      this.emit('initialized'); // 调用 emit

    } catch (error) { // 执行语句
      this.emit('error', error); // 调用 emit
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取完整键名
   * Get full key name with prefix
   *
   * @param {string} namespace - 命名空间 / Namespace
   * @param {string} key - 键名 / Key name
   * @returns {string} 完整键名 / Full key name
   */
  key(namespace, ...parts) { // 调用 key
    return `${this.config.keyPrefix}${namespace}:${parts.join(':')}`; // 返回结果
  } // 结束代码块

  /**
   * 获取读取客户端 (优先使用只读副本)
   * Get read client (prefer read replica)
   */
  getReadClient() { // 调用 getReadClient
    return this.readClient || this.client; // 返回结果
  } // 结束代码块

  // ============================================
  // 基础操作 / Basic Operations
  // ============================================

  /**
   * 设置字符串值
   * Set string value
   */
  async set(key, value, options = {}) { // 执行语句
    const args = []; // 定义常量 args
    if (options.EX) args.push('EX', options.EX); // 条件判断 options.EX
    if (options.PX) args.push('PX', options.PX); // 条件判断 options.PX
    if (options.NX) args.push('NX'); // 条件判断 options.NX
    if (options.XX) args.push('XX'); // 条件判断 options.XX

    return this.client.set(key, value, ...args); // 返回结果
  } // 结束代码块

  /**
   * 获取字符串值
   * Get string value
   */
  async get(key) { // 执行语句
    return this.getReadClient().get(key); // 返回结果
  } // 结束代码块

  /**
   * 删除键
   * Delete key(s)
   */
  async del(...keys) { // 执行语句
    return this.client.del(keys); // 返回结果
  } // 结束代码块

  /**
   * 检查键是否存在
   * Check if key exists
   */
  async exists(...keys) { // 执行语句
    return this.getReadClient().exists(keys); // 返回结果
  } // 结束代码块

  /**
   * 设置过期时间
   * Set expiration time
   */
  async expire(key, seconds) { // 执行语句
    return this.client.expire(key, seconds); // 返回结果
  } // 结束代码块

  /**
   * 获取剩余过期时间
   * Get remaining TTL
   */
  async ttl(key) { // 执行语句
    return this.getReadClient().ttl(key); // 返回结果
  } // 结束代码块

  // ============================================
  // Hash 操作 / Hash Operations
  // ============================================

  /**
   * 设置 Hash 字段
   * Set Hash field
   */
  async hSet(key, field, value) { // 执行语句
    return this.client.hSet(key, field, value); // 返回结果
  } // 结束代码块

  /**
   * 批量设置 Hash 字段
   * Set multiple Hash fields
   */
  async hMSet(key, data) { // 执行语句
    if (typeof data !== 'object' || data === null) { // 条件判断 typeof data !== 'object' || data === null
      throw new Error('hMSet requires an object'); // 抛出异常
    } // 结束代码块
    return this.client.hSet(key, data); // 返回结果
  } // 结束代码块

  /**
   * 获取 Hash 字段
   * Get Hash field
   */
  async hGet(key, field) { // 执行语句
    return this.getReadClient().hGet(key, field); // 返回结果
  } // 结束代码块

  /**
   * 获取多个 Hash 字段
   * Get multiple Hash fields
   */
  async hMGet(key, fields) { // 执行语句
    return this.getReadClient().hmGet(key, fields); // 返回结果
  } // 结束代码块

  /**
   * 获取所有 Hash 字段和值
   * Get all Hash fields and values
   */
  async hGetAll(key) { // 执行语句
    return this.getReadClient().hGetAll(key); // 返回结果
  } // 结束代码块

  /**
   * 删除 Hash 字段
   * Delete Hash field(s)
   */
  async hDel(key, ...fields) { // 执行语句
    return this.client.hDel(key, fields); // 返回结果
  } // 结束代码块

  /**
   * 检查 Hash 字段是否存在
   * Check if Hash field exists
   */
  async hExists(key, field) { // 执行语句
    return this.getReadClient().hExists(key, field); // 返回结果
  } // 结束代码块

  /**
   * 获取 Hash 长度
   * Get Hash length
   */
  async hLen(key) { // 执行语句
    return this.getReadClient().hLen(key); // 返回结果
  } // 结束代码块

  /**
   * Hash 字段增量
   * Increment Hash field
   */
  async hIncrBy(key, field, increment) { // 执行语句
    return this.client.hIncrBy(key, field, increment); // 返回结果
  } // 结束代码块

  /**
   * Hash 浮点增量
   * Increment Hash field by float
   */
  async hIncrByFloat(key, field, increment) { // 执行语句
    return this.client.hIncrByFloat(key, field, increment); // 返回结果
  } // 结束代码块

  // ============================================
  // Sorted Set 操作 / Sorted Set Operations
  // ============================================

  /**
   * 添加到有序集合
   * Add to sorted set
   */
  async zAdd(key, score, member) { // 执行语句
    return this.client.zAdd(key, { score, value: member }); // 返回结果
  } // 结束代码块

  /**
   * 批量添加到有序集合
   * Add multiple members to sorted set
   */
  async zAddMultiple(key, members) { // 执行语句
    // members: [{ score, value }, ...]
    return this.client.zAdd(key, members); // 返回结果
  } // 结束代码块

  /**
   * 从有序集合移除
   * Remove from sorted set
   */
  async zRem(key, ...members) { // 执行语句
    return this.client.zRem(key, members); // 返回结果
  } // 结束代码块

  /**
   * 按分数范围获取
   * Get by score range
   */
  async zRangeByScore(key, min, max, options = {}) { // 执行语句
    const args = { // 定义常量 args
      BY: 'SCORE', // BY
      LIMIT: options.limit ? { offset: options.offset || 0, count: options.limit } : undefined, // 限制
    }; // 结束代码块
    return this.getReadClient().zRange(key, min, max, args); // 返回结果
  } // 结束代码块

  /**
   * 按分数范围获取 (带分数)
   * Get by score range with scores
   */
  async zRangeByScoreWithScores(key, min, max, options = {}) { // 执行语句
    const args = { // 定义常量 args
      BY: 'SCORE', // BY
      LIMIT: options.limit ? { offset: options.offset || 0, count: options.limit } : undefined, // 限制
    }; // 结束代码块
    return this.getReadClient().zRangeWithScores(key, min, max, args); // 返回结果
  } // 结束代码块

  /**
   * 按排名范围获取
   * Get by rank range
   */
  async zRange(key, start, stop, options = {}) { // 执行语句
    const args = {}; // 定义常量 args
    if (options.REV) args.REV = true; // 条件判断 options.REV
    return this.getReadClient().zRange(key, start, stop, args); // 返回结果
  } // 结束代码块

  /**
   * 按排名范围获取 (带分数)
   * Get by rank range with scores
   */
  async zRangeWithScores(key, start, stop, options = {}) { // 执行语句
    const args = {}; // 定义常量 args
    if (options.REV) args.REV = true; // 条件判断 options.REV
    return this.getReadClient().zRangeWithScores(key, start, stop, args); // 返回结果
  } // 结束代码块

  /**
   * 获取成员分数
   * Get member score
   */
  async zScore(key, member) { // 执行语句
    return this.getReadClient().zScore(key, member); // 返回结果
  } // 结束代码块

  /**
   * 获取有序集合大小
   * Get sorted set size
   */
  async zCard(key) { // 执行语句
    return this.getReadClient().zCard(key); // 返回结果
  } // 结束代码块

  /**
   * 按分数范围计数
   * Count by score range
   */
  async zCount(key, min, max) { // 执行语句
    return this.getReadClient().zCount(key, min, max); // 返回结果
  } // 结束代码块

  /**
   * 按分数范围删除
   * Remove by score range
   */
  async zRemRangeByScore(key, min, max) { // 执行语句
    return this.client.zRemRangeByScore(key, min, max); // 返回结果
  } // 结束代码块

  // ============================================
  // Set 操作 / Set Operations
  // ============================================

  /**
   * 添加到集合
   * Add to set
   */
  async sAdd(key, ...members) { // 执行语句
    return this.client.sAdd(key, members); // 返回结果
  } // 结束代码块

  /**
   * 从集合移除
   * Remove from set
   */
  async sRem(key, ...members) { // 执行语句
    return this.client.sRem(key, members); // 返回结果
  } // 结束代码块

  /**
   * 获取集合成员
   * Get set members
   */
  async sMembers(key) { // 执行语句
    return this.getReadClient().sMembers(key); // 返回结果
  } // 结束代码块

  /**
   * 检查成员是否在集合中
   * Check if member is in set
   */
  async sIsMember(key, member) { // 执行语句
    return this.getReadClient().sIsMember(key, member); // 返回结果
  } // 结束代码块

  /**
   * 获取集合大小
   * Get set size
   */
  async sCard(key) { // 执行语句
    return this.getReadClient().sCard(key); // 返回结果
  } // 结束代码块

  // ============================================
  // List 操作 / List Operations
  // ============================================

  /**
   * 左侧推入
   * Left push
   */
  async lPush(key, ...values) { // 执行语句
    return this.client.lPush(key, values); // 返回结果
  } // 结束代码块

  /**
   * 右侧推入
   * Right push
   */
  async rPush(key, ...values) { // 执行语句
    return this.client.rPush(key, values); // 返回结果
  } // 结束代码块

  /**
   * 获取列表范围
   * Get list range
   */
  async lRange(key, start, stop) { // 执行语句
    return this.getReadClient().lRange(key, start, stop); // 返回结果
  } // 结束代码块

  /**
   * 修剪列表
   * Trim list
   */
  async lTrim(key, start, stop) { // 执行语句
    return this.client.lTrim(key, start, stop); // 返回结果
  } // 结束代码块

  /**
   * 获取列表长度
   * Get list length
   */
  async lLen(key) { // 执行语句
    return this.getReadClient().lLen(key); // 返回结果
  } // 结束代码块

  // ============================================
  // 事务操作 / Transaction Operations
  // ============================================

  /**
   * 执行事务
   * Execute transaction
   *
   * @param {Function} fn - 事务函数，接收 multi 对象 / Transaction function, receives multi object
   */
  async transaction(fn) { // 执行语句
    const multi = this.client.multi(); // 定义常量 multi
    await fn(multi); // 等待异步结果
    return multi.exec(); // 返回结果
  } // 结束代码块

  /**
   * 执行管道
   * Execute pipeline
   *
   * @param {Function} fn - 管道函数，接收 pipeline 对象 / Pipeline function
   */
  async pipeline(fn) { // 执行语句
    const pipeline = this.client.multi(); // 定义常量 pipeline
    await fn(pipeline); // 等待异步结果
    return pipeline.exec(); // 返回结果
  } // 结束代码块

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
  async acquireLock(lockName, ttl = 30, token = null) { // 执行语句
    const lockKey = this.key(KEY_PREFIX.LOCK, lockName); // 定义常量 lockKey
    const lockToken = token || `${Date.now()}-${Math.random().toString(36).slice(2)}`; // 定义常量 lockToken

    const result = await this.client.set(lockKey, lockToken, { // 定义常量 result
      NX: true, // NX
      EX: ttl, // EX
    }); // 结束代码块

    return result === 'OK' ? lockToken : null; // 返回结果
  } // 结束代码块

  /**
   * 释放锁
   * Release lock
   *
   * @param {string} lockName - 锁名称 / Lock name
   * @param {string} token - 锁令牌 / Lock token
   */
  async releaseLock(lockName, token) { // 执行语句
    const lockKey = this.key(KEY_PREFIX.LOCK, lockName); // 定义常量 lockKey
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `; // 执行语句

    return this.client.eval(script, { // 返回结果
      keys: [lockKey], // keys
      arguments: [token], // arguments
    }); // 结束代码块
  } // 结束代码块

  /**
   * 续期锁
   * Extend lock
   *
   * @param {string} lockName - 锁名称 / Lock name
   * @param {string} token - 锁令牌 / Lock token
   * @param {number} ttl - 新的 TTL (秒) / New TTL (seconds)
   */
  async extendLock(lockName, token, ttl = 30) { // 执行语句
    const lockKey = this.key(KEY_PREFIX.LOCK, lockName); // 定义常量 lockKey
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `; // 执行语句

    return this.client.eval(script, { // 返回结果
      keys: [lockKey], // keys
      arguments: [token, ttl.toString()], // arguments
    }); // 结束代码块
  } // 结束代码块

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
  async *scan(pattern, count = 100) { // 执行语句
    let cursor = 0; // 定义变量 cursor
    do { // 执行语句
      const result = await this.client.scan(cursor, { // 定义常量 result
        MATCH: pattern, // MATCH
        COUNT: count, // 数量
      }); // 结束代码块
      cursor = result.cursor; // 赋值 cursor
      for (const key of result.keys) { // 循环 const key of result.keys
        yield key; // 执行语句
      } // 结束代码块
    } while (cursor !== 0); // 执行语句
  } // 结束代码块

  /**
   * 获取所有匹配的键
   * Get all matching keys
   *
   * @param {string} pattern - 模式 / Pattern
   */
  async keys(pattern) { // 执行语句
    const result = []; // 定义常量 result
    for await (const key of this.scan(pattern)) { // 执行语句
      result.push(key); // 调用 result.push
    } // 结束代码块
    return result; // 返回结果
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
      return { status: 'healthy', message: 'Redis is operational' }; // 返回结果
    } catch (error) { // 执行语句
      return { status: 'unhealthy', message: error.message }; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取服务器信息
   * Get server info
   */
  async info(section = null) { // 执行语句
    return this.client.info(section); // 返回结果
  } // 结束代码块

  /**
   * 获取数据库大小
   * Get database size
   */
  async dbSize() { // 执行语句
    return this.client.dbSize(); // 返回结果
  } // 结束代码块

  /**
   * 清空当前数据库
   * Flush current database
   */
  async flushDb() { // 执行语句
    return this.client.flushDb(); // 返回结果
  } // 结束代码块

  /**
   * 关闭连接
   * Close connection
   */
  async close() { // 执行语句
    if (this.readClient) { // 条件判断 this.readClient
      await this.readClient.quit(); // 等待异步结果
      this.readClient = null; // 设置 readClient
    } // 结束代码块

    if (this.client) { // 条件判断 this.client
      await this.client.quit(); // 等待异步结果
      this.client = null; // 设置 client
    } // 结束代码块

    this.isConnected = false; // 设置 isConnected
    this.isInitialized = false; // 设置 isInitialized
    this.emit('closed'); // 调用 emit
  } // 结束代码块
} // 结束代码块

// 默认实例
let defaultClient = null; // 定义变量 defaultClient

/**
 * 获取默认 Redis 客户端
 * Get default Redis client
 */
function getRedisClient(config = {}) { // 定义函数 getRedisClient
  if (!defaultClient) { // 条件判断 !defaultClient
    defaultClient = new RedisClient(config); // 赋值 defaultClient
  } // 结束代码块
  return defaultClient; // 返回结果
} // 结束代码块

export { // 导出命名成员
  RedisClient, // 执行语句
  getRedisClient, // 执行语句
  KEY_PREFIX, // 执行语句
}; // 结束代码块

export default RedisClient; // 默认导出
