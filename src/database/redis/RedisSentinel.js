/**
 * Redis Sentinel 客户端
 * Redis Sentinel Client for High Availability
 *
 * DB-013: 配置 Redis Sentinel（可选高可用）
 * Implements Redis Sentinel support for automatic failover
 *
 * @module src/database/redis/RedisSentinel
 */

import { createClient } from 'redis';
import { EventEmitter } from 'events';

/**
 * Sentinel 默认配置
 * Default Sentinel configuration
 */
const DEFAULT_SENTINEL_CONFIG = {
  // Sentinel 节点列表 / Sentinel nodes
  sentinels: [
    { host: process.env.REDIS_SENTINEL_HOST_1 || 'localhost', port: parseInt(process.env.REDIS_SENTINEL_PORT_1 || '26379', 10) },
    { host: process.env.REDIS_SENTINEL_HOST_2 || 'localhost', port: parseInt(process.env.REDIS_SENTINEL_PORT_2 || '26380', 10) },
    { host: process.env.REDIS_SENTINEL_HOST_3 || 'localhost', port: parseInt(process.env.REDIS_SENTINEL_PORT_3 || '26381', 10) },
  ],

  // Master 名称 / Master name
  masterName: process.env.REDIS_SENTINEL_MASTER || 'mymaster',

  // 数据库索引 / Database index
  database: parseInt(process.env.REDIS_DB || '0', 10),

  // 键前缀 / Key prefix
  keyPrefix: process.env.REDIS_PREFIX || 'quant:',

  // 密码 (可选) / Password (optional)
  password: process.env.REDIS_PASSWORD || undefined,

  // Sentinel 密码 (可选) / Sentinel password (optional)
  sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD || undefined,

  // 连接超时 (ms) / Connection timeout
  connectTimeout: 10000,

  // 命令超时 (ms) / Command timeout
  commandTimeout: 5000,

  // 最大重试次数 / Max retry attempts
  maxRetries: 3,

  // 重试延迟 (ms) / Retry delay
  retryDelay: 1000,

  // 是否启用只读副本 / Enable read replicas
  enableReadReplicas: false,

  // 读取偏好 / Read preference
  // 'master' | 'replica' | 'preferReplica'
  readPreference: 'master',

  // 故障转移超时 (ms) / Failover timeout
  failoverTimeout: 60000,

  // 健康检查间隔 (ms) / Health check interval
  healthCheckInterval: 10000,
};

/**
 * Sentinel 状态
 * Sentinel state
 */
const SENTINEL_STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  FAILOVER: 'failover',
  ERROR: 'error',
};

/**
 * Redis Sentinel 客户端
 * Redis Sentinel Client
 */
class RedisSentinel extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = { ...DEFAULT_SENTINEL_CONFIG, ...config };
    this.state = SENTINEL_STATE.DISCONNECTED;
    this.masterClient = null;
    this.replicaClients = [];
    this.sentinelClient = null;
    this.currentMaster = null;
    this.currentReplicas = [];
    this.healthCheckTimer = null;
    this.isInitialized = false;

    // 统计信息 / Statistics
    this.stats = {
      failoverCount: 0,
      lastFailoverTime: null,
      masterSwitchCount: 0,
      healthCheckCount: 0,
      errorCount: 0,
    };
  }

  /**
   * 初始化 Sentinel 连接
   * Initialize Sentinel connection
   */
  async initialize() {
    if (this.isInitialized) return;

    this.state = SENTINEL_STATE.CONNECTING;

    try {
      // 连接到 Sentinel / Connect to Sentinel
      await this._connectToSentinel();

      // 获取 Master 信息 / Get Master info
      await this._discoverMaster();

      // 连接到 Master / Connect to Master
      await this._connectToMaster();

      // 如果启用只读副本，发现并连接 / If read replicas enabled, discover and connect
      if (this.config.enableReadReplicas) {
        await this._discoverAndConnectReplicas();
      }

      // 设置 Sentinel 事件订阅 / Set up Sentinel event subscription
      await this._setupSentinelSubscription();

      // 启动健康检查 / Start health check
      this._startHealthCheck();

      this.state = SENTINEL_STATE.CONNECTED;
      this.isInitialized = true;

      this.emit('initialized', {
        master: this.currentMaster,
        replicas: this.currentReplicas,
      });

    } catch (error) {
      this.state = SENTINEL_STATE.ERROR;
      this.stats.errorCount++;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 连接到 Sentinel
   * Connect to Sentinel
   * @private
   */
  async _connectToSentinel() {
    // 尝试连接到每个 Sentinel 节点 / Try connecting to each Sentinel node
    for (const sentinel of this.config.sentinels) {
      try {
        const client = createClient({
          url: `redis://${sentinel.host}:${sentinel.port}`,
          password: this.config.sentinelPassword,
          socket: {
            connectTimeout: this.config.connectTimeout,
          },
        });

        client.on('error', (err) => {
          this.emit('sentinelError', { sentinel, error: err });
        });

        await client.connect();

        // 验证这是一个 Sentinel / Verify this is a Sentinel
        const info = await client.info('server');
        if (!info.includes('redis_mode:sentinel')) {
          await client.quit();
          continue;
        }

        this.sentinelClient = client;
        this.emit('sentinelConnected', { sentinel });
        return;

      } catch (error) {
        this.emit('sentinelConnectionFailed', { sentinel, error });
      }
    }

    throw new Error('Unable to connect to any Sentinel');
  }

  /**
   * 发现 Master
   * Discover Master
   * @private
   */
  async _discoverMaster() {
    const masterInfo = await this.sentinelClient.sendCommand([
      'SENTINEL',
      'GET-MASTER-ADDR-BY-NAME',
      this.config.masterName,
    ]);

    if (!masterInfo || masterInfo.length < 2) {
      throw new Error(`Master "${this.config.masterName}" not found`);
    }

    this.currentMaster = {
      host: masterInfo[0],
      port: parseInt(masterInfo[1], 10),
    };

    this.emit('masterDiscovered', this.currentMaster);
  }

  /**
   * 连接到 Master
   * Connect to Master
   * @private
   */
  async _connectToMaster() {
    if (this.masterClient) {
      try {
        await this.masterClient.quit();
      } catch (e) {
        // Ignore
      }
    }

    const url = this.config.password
      ? `redis://:${this.config.password}@${this.currentMaster.host}:${this.currentMaster.port}`
      : `redis://${this.currentMaster.host}:${this.currentMaster.port}`;

    this.masterClient = createClient({
      url,
      database: this.config.database,
      socket: {
        connectTimeout: this.config.connectTimeout,
        reconnectStrategy: false, // 禁用自动重连，由 Sentinel 处理
      },
    });

    this.masterClient.on('error', (err) => {
      this.emit('masterError', { error: err });
      this._handleMasterFailure();
    });

    await this.masterClient.connect();

    // 验证是 Master / Verify it's a Master
    const info = await this.masterClient.info('replication');
    if (!info.includes('role:master')) {
      throw new Error('Connected node is not a master');
    }

    this.emit('masterConnected', this.currentMaster);
  }

  /**
   * 发现并连接副本
   * Discover and connect replicas
   * @private
   */
  async _discoverAndConnectReplicas() {
    // 关闭现有副本连接 / Close existing replica connections
    for (const client of this.replicaClients) {
      try {
        await client.quit();
      } catch (e) {
        // Ignore
      }
    }
    this.replicaClients = [];
    this.currentReplicas = [];

    // 获取副本列表 / Get replica list
    const replicas = await this.sentinelClient.sendCommand([
      'SENTINEL',
      'REPLICAS',
      this.config.masterName,
    ]);

    if (!replicas || replicas.length === 0) {
      return;
    }

    // 解析副本信息 / Parse replica info
    for (const replicaInfo of replicas) {
      const replica = this._parseReplicaInfo(replicaInfo);
      if (replica && replica.flags && !replica.flags.includes('disconnected')) {
        try {
          const url = this.config.password
            ? `redis://:${this.config.password}@${replica.ip}:${replica.port}`
            : `redis://${replica.ip}:${replica.port}`;

          const client = createClient({
            url,
            database: this.config.database,
            socket: {
              connectTimeout: this.config.connectTimeout,
            },
          });

          client.on('error', (err) => {
            this.emit('replicaError', { replica, error: err });
          });

          await client.connect();

          this.replicaClients.push(client);
          this.currentReplicas.push({ host: replica.ip, port: replica.port });

        } catch (error) {
          this.emit('replicaConnectionFailed', { replica, error });
        }
      }
    }

    this.emit('replicasConnected', { count: this.replicaClients.length });
  }

  /**
   * 解析副本信息
   * Parse replica info
   * @private
   */
  _parseReplicaInfo(info) {
    if (!Array.isArray(info)) return null;

    const result = {};
    for (let i = 0; i < info.length; i += 2) {
      result[info[i]] = info[i + 1];
    }
    return result;
  }

  /**
   * 设置 Sentinel 事件订阅
   * Set up Sentinel event subscription
   * @private
   */
  async _setupSentinelSubscription() {
    // 创建订阅客户端 / Create subscription client
    const sentinel = this.config.sentinels[0];
    const subClient = createClient({
      url: `redis://${sentinel.host}:${sentinel.port}`,
      password: this.config.sentinelPassword,
    });

    await subClient.connect();

    // 订阅 Sentinel 事件 / Subscribe to Sentinel events
    await subClient.pSubscribe('*', (message, channel) => {
      this._handleSentinelEvent(channel, message);
    });

    this.sentinelSubClient = subClient;
  }

  /**
   * 处理 Sentinel 事件
   * Handle Sentinel event
   * @private
   */
  _handleSentinelEvent(channel, message) {
    this.emit('sentinelEvent', { channel, message });

    switch (channel) {
      case '+switch-master':
        this._handleMasterSwitch(message);
        break;

      case '+sdown':
      case '+odown':
        this.emit('nodeDown', { channel, message });
        break;

      case '-sdown':
      case '-odown':
        this.emit('nodeUp', { channel, message });
        break;

      case '+failover-end':
        this.emit('failoverEnd', { message });
        break;

      case '+slave':
        if (this.config.enableReadReplicas) {
          this._discoverAndConnectReplicas();
        }
        break;
    }
  }

  /**
   * 处理 Master 切换
   * Handle Master switch
   * @private
   */
  async _handleMasterSwitch(message) {
    // 消息格式: masterName oldHost oldPort newHost newPort
    const parts = message.split(' ');
    if (parts.length >= 5 && parts[0] === this.config.masterName) {
      const newMaster = {
        host: parts[3],
        port: parseInt(parts[4], 10),
      };

      this.state = SENTINEL_STATE.FAILOVER;
      this.stats.masterSwitchCount++;
      this.stats.failoverCount++;
      this.stats.lastFailoverTime = new Date().toISOString();

      this.emit('masterSwitch', {
        oldMaster: this.currentMaster,
        newMaster,
      });

      this.currentMaster = newMaster;

      try {
        await this._connectToMaster();

        if (this.config.enableReadReplicas) {
          await this._discoverAndConnectReplicas();
        }

        this.state = SENTINEL_STATE.CONNECTED;
        this.emit('failoverComplete', { newMaster });

      } catch (error) {
        this.state = SENTINEL_STATE.ERROR;
        this.emit('failoverError', { error });
      }
    }
  }

  /**
   * 处理 Master 故障
   * Handle Master failure
   * @private
   */
  async _handleMasterFailure() {
    if (this.state === SENTINEL_STATE.FAILOVER) {
      return; // 已经在处理故障转移
    }

    this.state = SENTINEL_STATE.FAILOVER;

    // 等待 Sentinel 完成故障转移 / Wait for Sentinel to complete failover
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.failoverTimeout) {
      try {
        await this._discoverMaster();
        await this._connectToMaster();

        if (this.config.enableReadReplicas) {
          await this._discoverAndConnectReplicas();
        }

        this.state = SENTINEL_STATE.CONNECTED;
        return;

      } catch (error) {
        await this._sleep(this.config.retryDelay);
      }
    }

    this.state = SENTINEL_STATE.ERROR;
    this.emit('failoverTimeout');
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
    this.stats.healthCheckCount++;

    try {
      // 检查 Master / Check Master
      if (this.masterClient) {
        await this.masterClient.ping();
      }

      // 检查副本 / Check replicas
      for (let i = this.replicaClients.length - 1; i >= 0; i--) {
        try {
          await this.replicaClients[i].ping();
        } catch (error) {
          // 移除失败的副本 / Remove failed replica
          this.replicaClients.splice(i, 1);
          this.currentReplicas.splice(i, 1);
        }
      }

      this.emit('healthCheck', {
        master: this.currentMaster,
        replicaCount: this.replicaClients.length,
      });

    } catch (error) {
      this.emit('healthCheckFailed', { error });
      this._handleMasterFailure();
    }
  }

  // ============================================
  // 公共方法 / Public Methods
  // ============================================

  /**
   * 获取 Master 客户端
   * Get Master client (for writes)
   */
  getMaster() {
    if (!this.masterClient || this.state !== SENTINEL_STATE.CONNECTED) {
      throw new Error('Master not available');
    }
    return this.masterClient;
  }

  /**
   * 获取读取客户端
   * Get read client (respects read preference)
   */
  getReadClient() {
    if (this.state !== SENTINEL_STATE.CONNECTED) {
      throw new Error('Not connected');
    }

    switch (this.config.readPreference) {
      case 'replica':
        if (this.replicaClients.length > 0) {
          // 轮询副本 / Round-robin replicas
          const index = Math.floor(Math.random() * this.replicaClients.length);
          return this.replicaClients[index];
        }
        return this.masterClient;

      case 'preferReplica':
        if (this.replicaClients.length > 0) {
          const index = Math.floor(Math.random() * this.replicaClients.length);
          return this.replicaClients[index];
        }
        return this.masterClient;

      case 'master':
      default:
        return this.masterClient;
    }
  }

  /**
   * 获取客户端 (兼容 RedisClient 接口)
   * Get client (compatible with RedisClient interface)
   */
  get client() {
    return this.getMaster();
  }

  /**
   * 获取状态
   * Get status
   */
  getStatus() {
    return {
      state: this.state,
      isInitialized: this.isInitialized,
      master: this.currentMaster,
      replicas: this.currentReplicas,
      stats: this.stats,
    };
  }

  /**
   * 获取 Sentinel 信息
   * Get Sentinel info
   */
  async getSentinelInfo() {
    if (!this.sentinelClient) {
      throw new Error('Not connected to Sentinel');
    }

    const masterInfo = await this.sentinelClient.sendCommand([
      'SENTINEL',
      'MASTER',
      this.config.masterName,
    ]);

    const sentinelInfo = await this.sentinelClient.sendCommand([
      'SENTINEL',
      'SENTINELS',
      this.config.masterName,
    ]);

    return {
      master: this._parseReplicaInfo(masterInfo),
      sentinels: sentinelInfo.map(s => this._parseReplicaInfo(s)),
    };
  }

  /**
   * 手动触发故障转移
   * Manually trigger failover
   */
  async triggerFailover() {
    if (!this.sentinelClient) {
      throw new Error('Not connected to Sentinel');
    }

    await this.sentinelClient.sendCommand([
      'SENTINEL',
      'FAILOVER',
      this.config.masterName,
    ]);

    this.emit('manualFailover');
  }

  /**
   * 关闭连接
   * Close connection
   */
  async close() {
    // 停止健康检查 / Stop health check
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // 关闭 Master 连接 / Close Master connection
    if (this.masterClient) {
      try {
        await this.masterClient.quit();
      } catch (e) {
        // Ignore
      }
      this.masterClient = null;
    }

    // 关闭副本连接 / Close replica connections
    for (const client of this.replicaClients) {
      try {
        await client.quit();
      } catch (e) {
        // Ignore
      }
    }
    this.replicaClients = [];

    // 关闭 Sentinel 连接 / Close Sentinel connections
    if (this.sentinelClient) {
      try {
        await this.sentinelClient.quit();
      } catch (e) {
        // Ignore
      }
      this.sentinelClient = null;
    }

    if (this.sentinelSubClient) {
      try {
        await this.sentinelSubClient.quit();
      } catch (e) {
        // Ignore
      }
      this.sentinelSubClient = null;
    }

    this.state = SENTINEL_STATE.DISCONNECTED;
    this.isInitialized = false;
    this.currentMaster = null;
    this.currentReplicas = [];

    this.emit('closed');
  }

  /**
   * 延迟
   * Sleep
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export {
  RedisSentinel,
  SENTINEL_STATE,
  DEFAULT_SENTINEL_CONFIG,
};

export default RedisSentinel;
