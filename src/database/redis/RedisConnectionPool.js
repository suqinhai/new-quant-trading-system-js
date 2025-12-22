/**
 * Redis 连接池管理器
 * Redis Connection Pool Manager
 *
 * DB-012: 优化 Redis 连接池配置
 * Implements connection pool management for Redis
 *
 * @module src/database/redis/RedisConnectionPool
 */

import { createClient } from 'redis';
import { EventEmitter } from 'events';

/**
 * 连接池默认配置
 * Default pool configuration
 */
const DEFAULT_POOL_CONFIG = {
  // Redis 连接 URL
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  // 数据库索引
  database: parseInt(process.env.REDIS_DB || '0', 10),
  // 键前缀
  keyPrefix: process.env.REDIS_PREFIX || 'quant:',

  // ============================================
  // 连接池配置 / Pool Configuration
  // ============================================

  // 最小连接数 / Minimum connections
  minConnections: parseInt(process.env.REDIS_POOL_MIN || '2', 10),
  // 最大连接数 / Maximum connections
  maxConnections: parseInt(process.env.REDIS_POOL_MAX || '10', 10),
  // 空闲连接超时 (ms) / Idle connection timeout
  idleTimeout: parseInt(process.env.REDIS_POOL_IDLE_TIMEOUT || '30000', 10),
  // 获取连接超时 (ms) / Acquire connection timeout
  acquireTimeout: parseInt(process.env.REDIS_POOL_ACQUIRE_TIMEOUT || '5000', 10),
  // 连接最大使用次数 (0=无限) / Max uses per connection
  maxUsesPerConnection: parseInt(process.env.REDIS_POOL_MAX_USES || '0', 10),

  // ============================================
  // Socket 配置 / Socket Configuration
  // ============================================

  // 连接超时 (ms) / Connection timeout
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
  // 命令超时 (ms) / Command timeout
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
  // Keep-alive 间隔 (ms) / Keep-alive interval
  keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE || '30000', 10),
  // TCP No Delay
  noDelay: true,

  // ============================================
  // 重连配置 / Reconnection Configuration
  // ============================================

  // 最大重连次数 / Max reconnection attempts
  maxReconnectAttempts: parseInt(process.env.REDIS_MAX_RECONNECT || '10', 10),
  // 重连基础延迟 (ms) / Base reconnection delay
  reconnectBaseDelay: 100,
  // 重连最大延迟 (ms) / Max reconnection delay
  reconnectMaxDelay: 3000,

  // ============================================
  // 健康检查配置 / Health Check Configuration
  // ============================================

  // 健康检查间隔 (ms) / Health check interval
  healthCheckInterval: parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL || '30000', 10),
  // 是否启用健康检查 / Enable health check
  enableHealthCheck: true,
};

/**
 * 连接状态枚举
 * Connection state enum
 */
const CONNECTION_STATE = {
  IDLE: 'idle',
  IN_USE: 'in_use',
  CONNECTING: 'connecting',
  ERROR: 'error',
  CLOSED: 'closed',
};

/**
 * 池化连接包装器
 * Pooled connection wrapper
 */
class PooledConnection {
  constructor(client, pool) {
    this.client = client;
    this.pool = pool;
    this.state = CONNECTION_STATE.IDLE;
    this.useCount = 0;
    this.createdAt = Date.now();
    this.lastUsedAt = Date.now();
    this.lastHealthCheck = Date.now();
    this.id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * 标记为使用中
   * Mark as in use
   */
  acquire() {
    this.state = CONNECTION_STATE.IN_USE;
    this.useCount++;
    this.lastUsedAt = Date.now();
    return this;
  }

  /**
   * 释放回池
   * Release back to pool
   */
  release() {
    this.state = CONNECTION_STATE.IDLE;
    this.lastUsedAt = Date.now();
  }

  /**
   * 检查是否应该淘汰
   * Check if should be evicted
   */
  shouldEvict(idleTimeout, maxUses) {
    // 超过最大使用次数
    if (maxUses > 0 && this.useCount >= maxUses) {
      return true;
    }
    // 空闲时间过长
    if (this.state === CONNECTION_STATE.IDLE) {
      return Date.now() - this.lastUsedAt > idleTimeout;
    }
    return false;
  }

  /**
   * 健康检查
   * Health check
   */
  async healthCheck() {
    try {
      await this.client.ping();
      this.lastHealthCheck = Date.now();
      return true;
    } catch (error) {
      this.state = CONNECTION_STATE.ERROR;
      return false;
    }
  }
}

/**
 * Redis 连接池
 * Redis Connection Pool
 */
class RedisConnectionPool extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.pool = [];
    this.waitingQueue = [];
    this.isInitialized = false;
    this.isShuttingDown = false;
    this.healthCheckTimer = null;

    // 统计信息 / Statistics
    this.stats = {
      totalCreated: 0,
      totalDestroyed: 0,
      currentSize: 0,
      idleCount: 0,
      inUseCount: 0,
      waitingCount: 0,
      acquireCount: 0,
      releaseCount: 0,
      timeoutCount: 0,
      errorCount: 0,
    };
  }

  /**
   * 初始化连接池
   * Initialize connection pool
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // 创建最小连接数 / Create minimum connections
      const promises = [];
      for (let i = 0; i < this.config.minConnections; i++) {
        promises.push(this._createConnection());
      }
      await Promise.all(promises);

      // 启动健康检查 / Start health check
      if (this.config.enableHealthCheck && this.config.healthCheckInterval > 0) {
        this._startHealthCheck();
      }

      this.isInitialized = true;
      this.emit('initialized', { poolSize: this.pool.length });

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 创建新连接
   * Create new connection
   * @private
   */
  async _createConnection() {
    if (this.pool.length >= this.config.maxConnections) {
      return null;
    }

    const client = createClient({
      url: this.config.url,
      database: this.config.database,
      socket: {
        connectTimeout: this.config.connectTimeout,
        keepAlive: this.config.keepAlive,
        noDelay: this.config.noDelay,
        reconnectStrategy: (retries) => {
          if (retries > this.config.maxReconnectAttempts) {
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(
            retries * this.config.reconnectBaseDelay,
            this.config.reconnectMaxDelay
          );
        },
      },
      commandsQueueMaxLength: 1000,
    });

    // 设置事件处理 / Set up event handlers
    client.on('error', (err) => {
      this.stats.errorCount++;
      this.emit('connectionError', { error: err });
    });

    client.on('reconnecting', () => {
      this.emit('reconnecting');
    });

    await client.connect();

    const pooledConnection = new PooledConnection(client, this);
    this.pool.push(pooledConnection);

    this.stats.totalCreated++;
    this._updateStats();

    this.emit('connectionCreated', { id: pooledConnection.id });

    return pooledConnection;
  }

  /**
   * 销毁连接
   * Destroy connection
   * @private
   */
  async _destroyConnection(connection) {
    try {
      const index = this.pool.indexOf(connection);
      if (index > -1) {
        this.pool.splice(index, 1);
      }

      connection.state = CONNECTION_STATE.CLOSED;
      await connection.client.quit();

      this.stats.totalDestroyed++;
      this._updateStats();

      this.emit('connectionDestroyed', { id: connection.id });

    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * 获取连接
   * Acquire connection
   *
   * @returns {Promise<PooledConnection>}
   */
  async acquire() {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    this.stats.acquireCount++;

    // 尝试获取空闲连接 / Try to get idle connection
    const idleConnection = this.pool.find(c => c.state === CONNECTION_STATE.IDLE);
    if (idleConnection) {
      return idleConnection.acquire();
    }

    // 如果池未满，创建新连接 / If pool not full, create new connection
    if (this.pool.length < this.config.maxConnections) {
      const newConnection = await this._createConnection();
      if (newConnection) {
        return newConnection.acquire();
      }
    }

    // 等待可用连接 / Wait for available connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(w => w.resolve === resolve);
        if (index > -1) {
          this.waitingQueue.splice(index, 1);
        }
        this.stats.timeoutCount++;
        this._updateStats();
        reject(new Error('Acquire connection timeout'));
      }, this.config.acquireTimeout);

      this.waitingQueue.push({
        resolve: (conn) => {
          clearTimeout(timeout);
          resolve(conn);
        },
        reject,
        timeout,
        timestamp: Date.now(),
      });

      this._updateStats();
    });
  }

  /**
   * 释放连接
   * Release connection
   *
   * @param {PooledConnection} connection
   */
  release(connection) {
    if (!connection || connection.state === CONNECTION_STATE.CLOSED) {
      return;
    }

    this.stats.releaseCount++;

    // 检查是否应该淘汰 / Check if should evict
    if (connection.shouldEvict(this.config.idleTimeout, this.config.maxUsesPerConnection)) {
      this._destroyConnection(connection);

      // 确保最小连接数 / Ensure minimum connections
      if (this.pool.length < this.config.minConnections) {
        this._createConnection().catch(err => this.emit('error', err));
      }
      return;
    }

    connection.release();

    // 如果有等待的请求，分配给它 / If there are waiting requests, assign to it
    if (this.waitingQueue.length > 0) {
      const waiting = this.waitingQueue.shift();
      waiting.resolve(connection.acquire());
      this._updateStats();
      return;
    }

    this._updateStats();
  }

  /**
   * 执行命令 (自动获取和释放连接)
   * Execute command (auto acquire and release)
   *
   * @param {Function} fn - 命令函数 / Command function
   */
  async execute(fn) {
    const connection = await this.acquire();
    try {
      return await fn(connection.client);
    } finally {
      this.release(connection);
    }
  }

  /**
   * 启动健康检查
   * Start health check
   * @private
   */
  _startHealthCheck() {
    this.healthCheckTimer = setInterval(async () => {
      await this._performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * 执行健康检查
   * Perform health check
   * @private
   */
  async _performHealthCheck() {
    const unhealthyConnections = [];

    for (const connection of this.pool) {
      if (connection.state === CONNECTION_STATE.IDLE) {
        const healthy = await connection.healthCheck();
        if (!healthy) {
          unhealthyConnections.push(connection);
        }
      }

      // 检查空闲超时 / Check idle timeout
      if (connection.shouldEvict(this.config.idleTimeout, this.config.maxUsesPerConnection)) {
        if (this.pool.length > this.config.minConnections) {
          unhealthyConnections.push(connection);
        }
      }
    }

    // 销毁不健康的连接 / Destroy unhealthy connections
    for (const conn of unhealthyConnections) {
      await this._destroyConnection(conn);
    }

    // 确保最小连接数 / Ensure minimum connections
    while (this.pool.length < this.config.minConnections) {
      try {
        await this._createConnection();
      } catch (error) {
        this.emit('error', error);
        break;
      }
    }

    this.emit('healthCheck', {
      poolSize: this.pool.length,
      unhealthyRemoved: unhealthyConnections.length,
    });
  }

  /**
   * 更新统计信息
   * Update statistics
   * @private
   */
  _updateStats() {
    this.stats.currentSize = this.pool.length;
    this.stats.idleCount = this.pool.filter(c => c.state === CONNECTION_STATE.IDLE).length;
    this.stats.inUseCount = this.pool.filter(c => c.state === CONNECTION_STATE.IN_USE).length;
    this.stats.waitingCount = this.waitingQueue.length;
  }

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats() {
    this._updateStats();
    return {
      ...this.stats,
      config: {
        minConnections: this.config.minConnections,
        maxConnections: this.config.maxConnections,
        idleTimeout: this.config.idleTimeout,
        acquireTimeout: this.config.acquireTimeout,
      },
    };
  }

  /**
   * 获取池状态
   * Get pool status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isShuttingDown: this.isShuttingDown,
      connections: this.pool.map(c => ({
        id: c.id,
        state: c.state,
        useCount: c.useCount,
        age: Date.now() - c.createdAt,
        idleTime: c.state === CONNECTION_STATE.IDLE ? Date.now() - c.lastUsedAt : 0,
      })),
    };
  }

  /**
   * 清理空闲连接
   * Drain idle connections
   */
  async drain() {
    const idleConnections = this.pool.filter(c => c.state === CONNECTION_STATE.IDLE);

    for (const conn of idleConnections) {
      if (this.pool.length > this.config.minConnections) {
        await this._destroyConnection(conn);
      }
    }

    this.emit('drained', { removed: idleConnections.length });
  }

  /**
   * 关闭连接池
   * Close connection pool
   */
  async close() {
    this.isShuttingDown = true;

    // 停止健康检查 / Stop health check
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // 拒绝等待的请求 / Reject waiting requests
    for (const waiting of this.waitingQueue) {
      clearTimeout(waiting.timeout);
      waiting.reject(new Error('Connection pool is closing'));
    }
    this.waitingQueue = [];

    // 关闭所有连接 / Close all connections
    const closePromises = this.pool.map(conn => this._destroyConnection(conn));
    await Promise.all(closePromises);

    this.pool = [];
    this.isInitialized = false;

    this.emit('closed');
  }
}

export {
  RedisConnectionPool,
  CONNECTION_STATE,
  DEFAULT_POOL_CONFIG,
};

export default RedisConnectionPool;
