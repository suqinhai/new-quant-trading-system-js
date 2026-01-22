/**
 * Redis 连接池管理器
 * Redis Connection Pool Manager
 *
 * DB-012: 优化 Redis 连接池配置
 * Implements connection pool management for Redis
 *
 * @module src/database/redis/RedisConnectionPool
 */

import { createClient } from 'redis'; // 导入模块 redis
import { EventEmitter } from 'events'; // 导入模块 events

/**
 * 连接池默认配置
 * Default pool configuration
 */
const DEFAULT_POOL_CONFIG = { // 定义常量 DEFAULT_POOL_CONFIG
  // Redis 连接 URL
  url: process.env.REDIS_URL || 'redis://localhost:6379', // 读取环境变量 REDIS_URL
  // 数据库索引
  database: parseInt(process.env.REDIS_DB || '0', 10), // database
  // 键前缀
  keyPrefix: process.env.REDIS_PREFIX || 'quant:', // 密钥前缀

  // ============================================
  // 连接池配置 / Pool Configuration
  // ============================================

  // 最小连接数 / Minimum connections
  minConnections: parseInt(process.env.REDIS_POOL_MIN || '2', 10), // 最小Connections
  // 最大连接数 / Maximum connections
  maxConnections: parseInt(process.env.REDIS_POOL_MAX || '10', 10), // 最大Connections
  // 空闲连接超时 (ms) / Idle connection timeout
  idleTimeout: parseInt(process.env.REDIS_POOL_IDLE_TIMEOUT || '30000', 10), // 空闲连接超时 (ms)
  // 获取连接超时 (ms) / Acquire connection timeout
  acquireTimeout: parseInt(process.env.REDIS_POOL_ACQUIRE_TIMEOUT || '5000', 10), // 获取连接超时 (ms)
  // 连接最大使用次数 (0=无限) / Max uses per connection
  maxUsesPerConnection: parseInt(process.env.REDIS_POOL_MAX_USES || '0', 10), // 连接最大使用次数 (0=无限)

  // ============================================
  // Socket 配置 / Socket Configuration
  // ============================================

  // 连接超时 (ms) / Connection timeout
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10), // 连接超时 (ms)
  // 命令超时 (ms) / Command timeout
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10), // 命令超时 (ms)
  // Keep-alive 间隔 (ms) / Keep-alive interval
  keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE || '30000', 10), // Keep-alive 间隔 (ms)
  // TCP No Delay
  noDelay: true, // TCP No Delay

  // ============================================
  // 重连配置 / Reconnection Configuration
  // ============================================

  // 最大重连次数 / Max reconnection attempts
  maxReconnectAttempts: parseInt(process.env.REDIS_MAX_RECONNECT || '10', 10), // 最大重连次数
  // 重连基础延迟 (ms) / Base reconnection delay
  reconnectBaseDelay: 100, // 重连基础延迟 (ms)
  // 重连最大延迟 (ms) / Max reconnection delay
  reconnectMaxDelay: 3000, // 重连最大延迟 (ms)

  // ============================================
  // 健康检查配置 / Health Check Configuration
  // ============================================

  // 健康检查间隔 (ms) / Health check interval
  healthCheckInterval: parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL || '30000', 10), // 健康检查间隔 (ms)
  // 是否启用健康检查 / Enable health check
  enableHealthCheck: true, // 是否启用健康检查
}; // 结束代码块

/**
 * 连接状态枚举
 * Connection state enum
 */
const CONNECTION_STATE = { // 定义常量 CONNECTION_STATE
  IDLE: 'idle', // IDLE
  IN_USE: 'in_use', // 在USE
  CONNECTING: 'connecting', // CONNECTING
  ERROR: 'error', // 错误
  CLOSED: 'closed', // CLOSED权限
}; // 结束代码块

/**
 * 池化连接包装器
 * Pooled connection wrapper
 */
class PooledConnection { // 定义类 PooledConnection
  constructor(client, pool) { // 构造函数
    this.client = client; // 设置 client
    this.pool = pool; // 设置 pool
    this.state = CONNECTION_STATE.IDLE; // 设置 state
    this.useCount = 0; // 设置 useCount
    this.createdAt = Date.now(); // 设置 createdAt
    this.lastUsedAt = Date.now(); // 设置 lastUsedAt
    this.lastHealthCheck = Date.now(); // 设置 lastHealthCheck
    this.id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; // 设置 id
  } // 结束代码块

  /**
   * 标记为使用中
   * Mark as in use
   */
  acquire() { // 调用 acquire
    this.state = CONNECTION_STATE.IN_USE; // 设置 state
    this.useCount++; // 访问 useCount
    this.lastUsedAt = Date.now(); // 设置 lastUsedAt
    return this; // 返回结果
  } // 结束代码块

  /**
   * 释放回池
   * Release back to pool
   */
  release() { // 调用 release
    this.state = CONNECTION_STATE.IDLE; // 设置 state
    this.lastUsedAt = Date.now(); // 设置 lastUsedAt
  } // 结束代码块

  /**
   * 检查是否应该淘汰
   * Check if should be evicted
   */
  shouldEvict(idleTimeout, maxUses) { // 调用 shouldEvict
    // 超过最大使用次数
    if (maxUses > 0 && this.useCount >= maxUses) { // 条件判断 maxUses > 0 && this.useCount >= maxUses
      return true; // 返回结果
    } // 结束代码块
    // 空闲时间过长
    if (this.state === CONNECTION_STATE.IDLE) { // 条件判断 this.state === CONNECTION_STATE.IDLE
      return Date.now() - this.lastUsedAt > idleTimeout; // 返回结果
    } // 结束代码块
    return false; // 返回结果
  } // 结束代码块

  /**
   * 健康检查
   * Health check
   */
  async healthCheck() { // 执行语句
    try { // 尝试执行
      await this.client.ping(); // 等待异步结果
      this.lastHealthCheck = Date.now(); // 设置 lastHealthCheck
      return true; // 返回结果
    } catch (error) { // 执行语句
      this.state = CONNECTION_STATE.ERROR; // 设置 state
      return false; // 返回结果
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * Redis 连接池
 * Redis Connection Pool
 */
class RedisConnectionPool extends EventEmitter { // 定义类 RedisConnectionPool(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { ...DEFAULT_POOL_CONFIG, ...config }; // 设置 config
    this.pool = []; // 设置 pool
    this.waitingQueue = []; // 设置 waitingQueue
    this.isInitialized = false; // 设置 isInitialized
    this.isShuttingDown = false; // 设置 isShuttingDown
    this.healthCheckTimer = null; // 设置 healthCheckTimer

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalCreated: 0, // 总Created
      totalDestroyed: 0, // 总Destroyed
      currentSize: 0, // current大小
      idleCount: 0, // idle数量
      inUseCount: 0, // 在Use数量
      waitingCount: 0, // waiting数量
      acquireCount: 0, // acquire数量
      releaseCount: 0, // release数量
      timeoutCount: 0, // 超时数量
      errorCount: 0, // 错误数量
    }; // 结束代码块
  } // 结束代码块

  /**
   * 初始化连接池
   * Initialize connection pool
   */
  async initialize() { // 执行语句
    if (this.isInitialized) return; // 条件判断 this.isInitialized

    try { // 尝试执行
      // 创建最小连接数 / Create minimum connections
      const promises = []; // 定义常量 promises
      for (let i = 0; i < this.config.minConnections; i++) { // 循环 let i = 0; i < this.config.minConnections; i++
        promises.push(this._createConnection()); // 调用 promises.push
      } // 结束代码块
      await Promise.all(promises); // 等待异步结果

      // 启动健康检查 / Start health check
      if (this.config.enableHealthCheck && this.config.healthCheckInterval > 0) { // 条件判断 this.config.enableHealthCheck && this.config....
        this._startHealthCheck(); // 调用 _startHealthCheck
      } // 结束代码块

      this.isInitialized = true; // 设置 isInitialized
      this.emit('initialized', { poolSize: this.pool.length }); // 调用 emit

    } catch (error) { // 执行语句
      this.emit('error', error); // 调用 emit
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 创建新连接
   * Create new connection
   * @private
   */
  async _createConnection() { // 执行语句
    if (this.pool.length >= this.config.maxConnections) { // 条件判断 this.pool.length >= this.config.maxConnections
      return null; // 返回结果
    } // 结束代码块

    const client = createClient({ // 定义常量 client
      url: this.config.url, // URL
      database: this.config.database, // database
      socket: { // socket
        connectTimeout: this.config.connectTimeout, // connect超时
        keepAlive: this.config.keepAlive, // keepAlive
        noDelay: this.config.noDelay, // no延迟
        reconnectStrategy: (retries) => { // reconnect策略
          if (retries > this.config.maxReconnectAttempts) { // 条件判断 retries > this.config.maxReconnectAttempts
            return new Error('Max reconnection attempts reached'); // 返回结果
          } // 结束代码块
          return Math.min( // 返回结果
            retries * this.config.reconnectBaseDelay, // 执行语句
            this.config.reconnectMaxDelay // 访问 config
          ); // 结束调用或参数
        }, // 结束代码块
      }, // 结束代码块
      commandsQueueMaxLength: 1000, // commands队列最大Length
    }); // 结束代码块

    // 设置事件处理 / Set up event handlers
    client.on('error', (err) => { // 注册事件监听
      this.stats.errorCount++; // 访问 stats
      this.emit('connectionError', { error: err }); // 调用 emit
    }); // 结束代码块

    client.on('reconnecting', () => { // 注册事件监听
      this.emit('reconnecting'); // 调用 emit
    }); // 结束代码块

    await client.connect(); // 等待异步结果

    const pooledConnection = new PooledConnection(client, this); // 定义常量 pooledConnection
    this.pool.push(pooledConnection); // 访问 pool

    this.stats.totalCreated++; // 访问 stats
    this._updateStats(); // 调用 _updateStats

    this.emit('connectionCreated', { id: pooledConnection.id }); // 调用 emit

    return pooledConnection; // 返回结果
  } // 结束代码块

  /**
   * 销毁连接
   * Destroy connection
   * @private
   */
  async _destroyConnection(connection) { // 执行语句
    try { // 尝试执行
      const index = this.pool.indexOf(connection); // 定义常量 index
      if (index > -1) { // 条件判断 index > -1
        this.pool.splice(index, 1); // 访问 pool
      } // 结束代码块

      connection.state = CONNECTION_STATE.CLOSED; // 赋值 connection.state
      await connection.client.quit(); // 等待异步结果

      this.stats.totalDestroyed++; // 访问 stats
      this._updateStats(); // 调用 _updateStats

      this.emit('connectionDestroyed', { id: connection.id }); // 调用 emit

    } catch (error) { // 执行语句
      this.emit('error', error); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取连接
   * Acquire connection
   *
   * @returns {Promise<PooledConnection>}
   */
  async acquire() { // 执行语句
    if (this.isShuttingDown) { // 条件判断 this.isShuttingDown
      throw new Error('Connection pool is shutting down'); // 抛出异常
    } // 结束代码块

    if (!this.isInitialized) { // 条件判断 !this.isInitialized
      await this.initialize(); // 等待异步结果
    } // 结束代码块

    this.stats.acquireCount++; // 访问 stats

    // 尝试获取空闲连接 / Try to get idle connection
    const idleConnection = this.pool.find(c => c.state === CONNECTION_STATE.IDLE); // 定义函数 idleConnection
    if (idleConnection) { // 条件判断 idleConnection
      return idleConnection.acquire(); // 返回结果
    } // 结束代码块

    // 如果池未满，创建新连接 / If pool not full, create new connection
    if (this.pool.length < this.config.maxConnections) { // 条件判断 this.pool.length < this.config.maxConnections
      const newConnection = await this._createConnection(); // 定义常量 newConnection
      if (newConnection) { // 条件判断 newConnection
        return newConnection.acquire(); // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 等待可用连接 / Wait for available connection
    return new Promise((resolve, reject) => { // 返回结果
      const timeout = setTimeout(() => { // 定义函数 timeout
        const index = this.waitingQueue.findIndex(w => w.resolve === resolve); // 定义函数 index
        if (index > -1) { // 条件判断 index > -1
          this.waitingQueue.splice(index, 1); // 访问 waitingQueue
        } // 结束代码块
        this.stats.timeoutCount++; // 访问 stats
        this._updateStats(); // 调用 _updateStats
        reject(new Error('Acquire connection timeout')); // 调用 reject
      }, this.config.acquireTimeout); // 执行语句

      this.waitingQueue.push({ // 访问 waitingQueue
        resolve: (conn) => { // resolve
          clearTimeout(timeout); // 调用 clearTimeout
          resolve(conn); // 调用 resolve
        }, // 结束代码块
        reject, // 执行语句
        timeout, // 执行语句
        timestamp: Date.now(), // 时间戳
      }); // 结束代码块

      this._updateStats(); // 调用 _updateStats
    }); // 结束代码块
  } // 结束代码块

  /**
   * 释放连接
   * Release connection
   *
   * @param {PooledConnection} connection
   */
  release(connection) { // 调用 release
    if (!connection || connection.state === CONNECTION_STATE.CLOSED) { // 条件判断 !connection || connection.state === CONNECTIO...
      return; // 返回结果
    } // 结束代码块

    this.stats.releaseCount++; // 访问 stats

    // 检查是否应该淘汰 / Check if should evict
    if (connection.shouldEvict(this.config.idleTimeout, this.config.maxUsesPerConnection)) { // 条件判断 connection.shouldEvict(this.config.idleTimeou...
      this._destroyConnection(connection); // 调用 _destroyConnection

      // 确保最小连接数 / Ensure minimum connections
      if (this.pool.length < this.config.minConnections) { // 条件判断 this.pool.length < this.config.minConnections
        this._createConnection().catch(err => this.emit('error', err)); // 调用 _createConnection
      } // 结束代码块
      return; // 返回结果
    } // 结束代码块

    connection.release(); // 调用 connection.release

    // 如果有等待的请求，分配给它 / If there are waiting requests, assign to it
    if (this.waitingQueue.length > 0) { // 条件判断 this.waitingQueue.length > 0
      const waiting = this.waitingQueue.shift(); // 定义常量 waiting
      waiting.resolve(connection.acquire()); // 调用 waiting.resolve
      this._updateStats(); // 调用 _updateStats
      return; // 返回结果
    } // 结束代码块

    this._updateStats(); // 调用 _updateStats
  } // 结束代码块

  /**
   * 执行命令 (自动获取和释放连接)
   * Execute command (auto acquire and release)
   *
   * @param {Function} fn - 命令函数 / Command function
   */
  async execute(fn) { // 执行语句
    const connection = await this.acquire(); // 定义常量 connection
    try { // 尝试执行
      return await fn(connection.client); // 返回结果
    } finally { // 执行语句
      this.release(connection); // 调用 release
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动健康检查
   * Start health check
   * @private
   */
  _startHealthCheck() { // 调用 _startHealthCheck
    this.healthCheckTimer = setInterval(async () => { // 设置 healthCheckTimer
      await this._performHealthCheck(); // 等待异步结果
    }, this.config.healthCheckInterval); // 执行语句
  } // 结束代码块

  /**
   * 执行健康检查
   * Perform health check
   * @private
   */
  async _performHealthCheck() { // 执行语句
    const unhealthyConnections = []; // 定义常量 unhealthyConnections

    for (const connection of this.pool) { // 循环 const connection of this.pool
      if (connection.state === CONNECTION_STATE.IDLE) { // 条件判断 connection.state === CONNECTION_STATE.IDLE
        const healthy = await connection.healthCheck(); // 定义常量 healthy
        if (!healthy) { // 条件判断 !healthy
          unhealthyConnections.push(connection); // 调用 unhealthyConnections.push
        } // 结束代码块
      } // 结束代码块

      // 检查空闲超时 / Check idle timeout
      if (connection.shouldEvict(this.config.idleTimeout, this.config.maxUsesPerConnection)) { // 条件判断 connection.shouldEvict(this.config.idleTimeou...
        if (this.pool.length > this.config.minConnections) { // 条件判断 this.pool.length > this.config.minConnections
          unhealthyConnections.push(connection); // 调用 unhealthyConnections.push
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 销毁不健康的连接 / Destroy unhealthy connections
    for (const conn of unhealthyConnections) { // 循环 const conn of unhealthyConnections
      await this._destroyConnection(conn); // 等待异步结果
    } // 结束代码块

    // 确保最小连接数 / Ensure minimum connections
    while (this.pool.length < this.config.minConnections) { // 循环条件 this.pool.length < this.config.minConnections
      try { // 尝试执行
        await this._createConnection(); // 等待异步结果
      } catch (error) { // 执行语句
        this.emit('error', error); // 调用 emit
        break; // 跳出循环或分支
      } // 结束代码块
    } // 结束代码块

    this.emit('healthCheck', { // 调用 emit
      poolSize: this.pool.length, // pool大小
      unhealthyRemoved: unhealthyConnections.length, // unhealthyRemoved
    }); // 结束代码块
  } // 结束代码块

  /**
   * 更新统计信息
   * Update statistics
   * @private
   */
  _updateStats() { // 调用 _updateStats
    this.stats.currentSize = this.pool.length; // 访问 stats
    this.stats.idleCount = this.pool.filter(c => c.state === CONNECTION_STATE.IDLE).length; // 访问 stats
    this.stats.inUseCount = this.pool.filter(c => c.state === CONNECTION_STATE.IN_USE).length; // 访问 stats
    this.stats.waitingCount = this.waitingQueue.length; // 访问 stats
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats() { // 调用 getStats
    this._updateStats(); // 调用 _updateStats
    return { // 返回结果
      ...this.stats, // 展开对象或数组
      config: { // 配置
        minConnections: this.config.minConnections, // 最小Connections
        maxConnections: this.config.maxConnections, // 最大Connections
        idleTimeout: this.config.idleTimeout, // idle超时
        acquireTimeout: this.config.acquireTimeout, // acquire超时
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取池状态
   * Get pool status
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      isInitialized: this.isInitialized, // 是否Initialized
      isShuttingDown: this.isShuttingDown, // 是否ShuttingDown
      connections: this.pool.map(c => ({ // connections
        id: c.id, // ID
        state: c.state, // state
        useCount: c.useCount, // 是否使用数量
        age: Date.now() - c.createdAt, // age
        idleTime: c.state === CONNECTION_STATE.IDLE ? Date.now() - c.lastUsedAt : 0, // idle时间
      })), // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 清理空闲连接
   * Drain idle connections
   */
  async drain() { // 执行语句
    const idleConnections = this.pool.filter(c => c.state === CONNECTION_STATE.IDLE); // 定义函数 idleConnections

    for (const conn of idleConnections) { // 循环 const conn of idleConnections
      if (this.pool.length > this.config.minConnections) { // 条件判断 this.pool.length > this.config.minConnections
        await this._destroyConnection(conn); // 等待异步结果
      } // 结束代码块
    } // 结束代码块

    this.emit('drained', { removed: idleConnections.length }); // 调用 emit
  } // 结束代码块

  /**
   * 关闭连接池
   * Close connection pool
   */
  async close() { // 执行语句
    this.isShuttingDown = true; // 设置 isShuttingDown

    // 停止健康检查 / Stop health check
    if (this.healthCheckTimer) { // 条件判断 this.healthCheckTimer
      clearInterval(this.healthCheckTimer); // 调用 clearInterval
      this.healthCheckTimer = null; // 设置 healthCheckTimer
    } // 结束代码块

    // 拒绝等待的请求 / Reject waiting requests
    for (const waiting of this.waitingQueue) { // 循环 const waiting of this.waitingQueue
      clearTimeout(waiting.timeout); // 调用 clearTimeout
      waiting.reject(new Error('Connection pool is closing')); // 调用 waiting.reject
    } // 结束代码块
    this.waitingQueue = []; // 设置 waitingQueue

    // 关闭所有连接 / Close all connections
    const closePromises = this.pool.map(conn => this._destroyConnection(conn)); // 定义函数 closePromises
    await Promise.all(closePromises); // 等待异步结果

    this.pool = []; // 设置 pool
    this.isInitialized = false; // 设置 isInitialized

    this.emit('closed'); // 调用 emit
  } // 结束代码块
} // 结束代码块

export { // 导出命名成员
  RedisConnectionPool, // 执行语句
  CONNECTION_STATE, // 执行语句
  DEFAULT_POOL_CONFIG, // 执行语句
}; // 结束代码块

export default RedisConnectionPool; // 默认导出
