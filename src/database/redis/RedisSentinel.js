/**
 * Redis Sentinel 客户端
 * Redis Sentinel Client for High Availability
 *
 * DB-013: 配置 Redis Sentinel（可选高可用）
 * Implements Redis Sentinel support for automatic failover
 *
 * @module src/database/redis/RedisSentinel
 */

import { createClient } from 'redis'; // 导入模块 redis
import { EventEmitter } from 'events'; // 导入模块 events

/**
 * Sentinel 默认配置
 * Default Sentinel configuration
 */
const DEFAULT_SENTINEL_CONFIG = { // 定义常量 DEFAULT_SENTINEL_CONFIG
  // Sentinel 节点列表 / Sentinel nodes
  sentinels: [ // 设置 sentinels 字段
    { host: process.env.REDIS_SENTINEL_HOST_1 || 'localhost', port: parseInt(process.env.REDIS_SENTINEL_PORT_1 || '26379', 10) }, // 读取环境变量 REDIS_SENTINEL_HOST_1
    { host: process.env.REDIS_SENTINEL_HOST_2 || 'localhost', port: parseInt(process.env.REDIS_SENTINEL_PORT_2 || '26380', 10) }, // 读取环境变量 REDIS_SENTINEL_HOST_2
    { host: process.env.REDIS_SENTINEL_HOST_3 || 'localhost', port: parseInt(process.env.REDIS_SENTINEL_PORT_3 || '26381', 10) }, // 读取环境变量 REDIS_SENTINEL_HOST_3
  ], // 结束数组或索引

  // Master 名称 / Master name
  masterName: process.env.REDIS_SENTINEL_MASTER || 'mymaster', // 读取环境变量 REDIS_SENTINEL_MASTER

  // 数据库索引 / Database index
  database: parseInt(process.env.REDIS_DB || '0', 10), // 读取环境变量 REDIS_DB

  // 键前缀 / Key prefix
  keyPrefix: process.env.REDIS_PREFIX || 'quant:', // 读取环境变量 REDIS_PREFIX

  // 密码 (可选) / Password (optional)
  password: process.env.REDIS_PASSWORD || undefined, // 读取环境变量 REDIS_PASSWORD

  // Sentinel 密码 (可选) / Sentinel password (optional)
  sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD || undefined, // 读取环境变量 REDIS_SENTINEL_PASSWORD

  // 连接超时 (ms) / Connection timeout
  connectTimeout: 10000, // 设置 connectTimeout 字段

  // 命令超时 (ms) / Command timeout
  commandTimeout: 5000, // 设置 commandTimeout 字段

  // 最大重试次数 / Max retry attempts
  maxRetries: 3, // 设置 maxRetries 字段

  // 重试延迟 (ms) / Retry delay
  retryDelay: 1000, // 设置 retryDelay 字段

  // 是否启用只读副本 / Enable read replicas
  enableReadReplicas: false, // 设置 enableReadReplicas 字段

  // 读取偏好 / Read preference
  // 'master' | 'replica' | 'preferReplica'
  readPreference: 'master', // 设置 readPreference 字段

  // 故障转移超时 (ms) / Failover timeout
  failoverTimeout: 60000, // 设置 failoverTimeout 字段

  // 健康检查间隔 (ms) / Health check interval
  healthCheckInterval: 10000, // 设置 healthCheckInterval 字段
}; // 结束代码块

/**
 * Sentinel 状态
 * Sentinel state
 */
const SENTINEL_STATE = { // 定义常量 SENTINEL_STATE
  DISCONNECTED: 'disconnected', // 设置 DISCONNECTED 字段
  CONNECTING: 'connecting', // 设置 CONNECTING 字段
  CONNECTED: 'connected', // 设置 CONNECTED 字段
  FAILOVER: 'failover', // 设置 FAILOVER 字段
  ERROR: 'error', // 设置 ERROR 字段
}; // 结束代码块

/**
 * Redis Sentinel 客户端
 * Redis Sentinel Client
 */
class RedisSentinel extends EventEmitter { // 定义类 RedisSentinel(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { ...DEFAULT_SENTINEL_CONFIG, ...config }; // 设置 config
    this.state = SENTINEL_STATE.DISCONNECTED; // 设置 state
    this.masterClient = null; // 设置 masterClient
    this.replicaClients = []; // 设置 replicaClients
    this.sentinelClient = null; // 设置 sentinelClient
    this.currentMaster = null; // 设置 currentMaster
    this.currentReplicas = []; // 设置 currentReplicas
    this.healthCheckTimer = null; // 设置 healthCheckTimer
    this.isInitialized = false; // 设置 isInitialized

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      failoverCount: 0, // 设置 failoverCount 字段
      lastFailoverTime: null, // 设置 lastFailoverTime 字段
      masterSwitchCount: 0, // 设置 masterSwitchCount 字段
      healthCheckCount: 0, // 设置 healthCheckCount 字段
      errorCount: 0, // 设置 errorCount 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 初始化 Sentinel 连接
   * Initialize Sentinel connection
   */
  async initialize() { // 执行语句
    if (this.isInitialized) return; // 条件判断 this.isInitialized

    this.state = SENTINEL_STATE.CONNECTING; // 设置 state

    try { // 尝试执行
      // 连接到 Sentinel / Connect to Sentinel
      await this._connectToSentinel(); // 等待异步结果

      // 获取 Master 信息 / Get Master info
      await this._discoverMaster(); // 等待异步结果

      // 连接到 Master / Connect to Master
      await this._connectToMaster(); // 等待异步结果

      // 如果启用只读副本，发现并连接 / If read replicas enabled, discover and connect
      if (this.config.enableReadReplicas) { // 条件判断 this.config.enableReadReplicas
        await this._discoverAndConnectReplicas(); // 等待异步结果
      } // 结束代码块

      // 设置 Sentinel 事件订阅 / Set up Sentinel event subscription
      await this._setupSentinelSubscription(); // 等待异步结果

      // 启动健康检查 / Start health check
      this._startHealthCheck(); // 调用 _startHealthCheck

      this.state = SENTINEL_STATE.CONNECTED; // 设置 state
      this.isInitialized = true; // 设置 isInitialized

      this.emit('initialized', { // 调用 emit
        master: this.currentMaster, // 设置 master 字段
        replicas: this.currentReplicas, // 设置 replicas 字段
      }); // 结束代码块

    } catch (error) { // 执行语句
      this.state = SENTINEL_STATE.ERROR; // 设置 state
      this.stats.errorCount++; // 访问 stats
      this.emit('error', error); // 调用 emit
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 连接到 Sentinel
   * Connect to Sentinel
   * @private
   */
  async _connectToSentinel() { // 执行语句
    // 尝试连接到每个 Sentinel 节点 / Try connecting to each Sentinel node
    for (const sentinel of this.config.sentinels) { // 循环 const sentinel of this.config.sentinels
      try { // 尝试执行
        const client = createClient({ // 定义常量 client
          url: `redis://${sentinel.host}:${sentinel.port}`, // 设置 url 字段
          password: this.config.sentinelPassword, // 设置 password 字段
          socket: { // 设置 socket 字段
            connectTimeout: this.config.connectTimeout, // 设置 connectTimeout 字段
          }, // 结束代码块
        }); // 结束代码块

        client.on('error', (err) => { // 注册事件监听
          this.emit('sentinelError', { sentinel, error: err }); // 调用 emit
        }); // 结束代码块

        await client.connect(); // 等待异步结果

        // 验证这是一个 Sentinel / Verify this is a Sentinel
        const info = await client.info('server'); // 定义常量 info
        if (!info.includes('redis_mode:sentinel')) { // 条件判断 !info.includes('redis_mode:sentinel')
          await client.quit(); // 等待异步结果
          continue; // 继续下一轮循环
        } // 结束代码块

        this.sentinelClient = client; // 设置 sentinelClient
        this.emit('sentinelConnected', { sentinel }); // 调用 emit
        return; // 返回结果

      } catch (error) { // 执行语句
        this.emit('sentinelConnectionFailed', { sentinel, error }); // 调用 emit
      } // 结束代码块
    } // 结束代码块

    throw new Error('Unable to connect to any Sentinel'); // 抛出异常
  } // 结束代码块

  /**
   * 发现 Master
   * Discover Master
   * @private
   */
  async _discoverMaster() { // 执行语句
    const masterInfo = await this.sentinelClient.sendCommand([ // 定义常量 masterInfo
      'SENTINEL', // 执行语句
      'GET-MASTER-ADDR-BY-NAME', // 执行语句
      this.config.masterName, // 访问 config
    ]); // 结束数组或索引

    if (!masterInfo || masterInfo.length < 2) { // 条件判断 !masterInfo || masterInfo.length < 2
      throw new Error(`Master "${this.config.masterName}" not found`); // 抛出异常
    } // 结束代码块

    this.currentMaster = { // 设置 currentMaster
      host: masterInfo[0], // 设置 host 字段
      port: parseInt(masterInfo[1], 10), // 设置 port 字段
    }; // 结束代码块

    this.emit('masterDiscovered', this.currentMaster); // 调用 emit
  } // 结束代码块

  /**
   * 连接到 Master
   * Connect to Master
   * @private
   */
  async _connectToMaster() { // 执行语句
    if (this.masterClient) { // 条件判断 this.masterClient
      try { // 尝试执行
        await this.masterClient.quit(); // 等待异步结果
      } catch (e) { // 执行语句
        // Ignore
      } // 结束代码块
    } // 结束代码块

    const url = this.config.password // 定义常量 url
      ? `redis://:${this.config.password}@${this.currentMaster.host}:${this.currentMaster.port}` // 执行语句
      : `redis://${this.currentMaster.host}:${this.currentMaster.port}`; // 执行语句

    this.masterClient = createClient({ // 设置 masterClient
      url, // 执行语句
      database: this.config.database, // 设置 database 字段
      socket: { // 设置 socket 字段
        connectTimeout: this.config.connectTimeout, // 设置 connectTimeout 字段
        reconnectStrategy: false, // 禁用自动重连，由 Sentinel 处理
      }, // 结束代码块
    }); // 结束代码块

    this.masterClient.on('error', (err) => { // 访问 masterClient
      this.emit('masterError', { error: err }); // 调用 emit
      this._handleMasterFailure(); // 调用 _handleMasterFailure
    }); // 结束代码块

    await this.masterClient.connect(); // 等待异步结果

    // 验证是 Master / Verify it's a Master
    const info = await this.masterClient.info('replication'); // 定义常量 info
    if (!info.includes('role:master')) { // 条件判断 !info.includes('role:master')
      throw new Error('Connected node is not a master'); // 抛出异常
    } // 结束代码块

    this.emit('masterConnected', this.currentMaster); // 调用 emit
  } // 结束代码块

  /**
   * 发现并连接副本
   * Discover and connect replicas
   * @private
   */
  async _discoverAndConnectReplicas() { // 执行语句
    // 关闭现有副本连接 / Close existing replica connections
    for (const client of this.replicaClients) { // 循环 const client of this.replicaClients
      try { // 尝试执行
        await client.quit(); // 等待异步结果
      } catch (e) { // 执行语句
        // Ignore
      } // 结束代码块
    } // 结束代码块
    this.replicaClients = []; // 设置 replicaClients
    this.currentReplicas = []; // 设置 currentReplicas

    // 获取副本列表 / Get replica list
    const replicas = await this.sentinelClient.sendCommand([ // 定义常量 replicas
      'SENTINEL', // 执行语句
      'REPLICAS', // 执行语句
      this.config.masterName, // 访问 config
    ]); // 结束数组或索引

    if (!replicas || replicas.length === 0) { // 条件判断 !replicas || replicas.length === 0
      return; // 返回结果
    } // 结束代码块

    // 解析副本信息 / Parse replica info
    for (const replicaInfo of replicas) { // 循环 const replicaInfo of replicas
      const replica = this._parseReplicaInfo(replicaInfo); // 定义常量 replica
      if (replica && replica.flags && !replica.flags.includes('disconnected')) { // 条件判断 replica && replica.flags && !replica.flags.in...
        try { // 尝试执行
          const url = this.config.password // 定义常量 url
            ? `redis://:${this.config.password}@${replica.ip}:${replica.port}` // 执行语句
            : `redis://${replica.ip}:${replica.port}`; // 执行语句

          const client = createClient({ // 定义常量 client
            url, // 执行语句
            database: this.config.database, // 设置 database 字段
            socket: { // 设置 socket 字段
              connectTimeout: this.config.connectTimeout, // 设置 connectTimeout 字段
            }, // 结束代码块
          }); // 结束代码块

          client.on('error', (err) => { // 注册事件监听
            this.emit('replicaError', { replica, error: err }); // 调用 emit
          }); // 结束代码块

          await client.connect(); // 等待异步结果

          this.replicaClients.push(client); // 访问 replicaClients
          this.currentReplicas.push({ host: replica.ip, port: replica.port }); // 访问 currentReplicas

        } catch (error) { // 执行语句
          this.emit('replicaConnectionFailed', { replica, error }); // 调用 emit
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    this.emit('replicasConnected', { count: this.replicaClients.length }); // 调用 emit
  } // 结束代码块

  /**
   * 解析副本信息
   * Parse replica info
   * @private
   */
  _parseReplicaInfo(info) { // 调用 _parseReplicaInfo
    if (!Array.isArray(info)) return null; // 条件判断 !Array.isArray(info)

    const result = {}; // 定义常量 result
    for (let i = 0; i < info.length; i += 2) { // 循环 let i = 0; i < info.length; i += 2
      result[info[i]] = info[i + 1]; // 执行语句
    } // 结束代码块
    return result; // 返回结果
  } // 结束代码块

  /**
   * 设置 Sentinel 事件订阅
   * Set up Sentinel event subscription
   * @private
   */
  async _setupSentinelSubscription() { // 执行语句
    // 创建订阅客户端 / Create subscription client
    const sentinel = this.config.sentinels[0]; // 定义常量 sentinel
    const subClient = createClient({ // 定义常量 subClient
      url: `redis://${sentinel.host}:${sentinel.port}`, // 设置 url 字段
      password: this.config.sentinelPassword, // 设置 password 字段
    }); // 结束代码块

    await subClient.connect(); // 等待异步结果

    // 订阅 Sentinel 事件 / Subscribe to Sentinel events
    await subClient.pSubscribe('*', (message, channel) => { // 等待异步结果
      this._handleSentinelEvent(channel, message); // 调用 _handleSentinelEvent
    }); // 结束代码块

    this.sentinelSubClient = subClient; // 设置 sentinelSubClient
  } // 结束代码块

  /**
   * 处理 Sentinel 事件
   * Handle Sentinel event
   * @private
   */
  _handleSentinelEvent(channel, message) { // 调用 _handleSentinelEvent
    this.emit('sentinelEvent', { channel, message }); // 调用 emit

    switch (channel) { // 分支选择 channel
      case '+switch-master': // 分支 '+switch-master'
        this._handleMasterSwitch(message); // 调用 _handleMasterSwitch
        break; // 跳出循环或分支

      case '+sdown': // 分支 '+sdown'
      case '+odown': // 分支 '+odown'
        this.emit('nodeDown', { channel, message }); // 调用 emit
        break; // 跳出循环或分支

      case '-sdown': // 分支 '-sdown'
      case '-odown': // 分支 '-odown'
        this.emit('nodeUp', { channel, message }); // 调用 emit
        break; // 跳出循环或分支

      case '+failover-end': // 分支 '+failover-end'
        this.emit('failoverEnd', { message }); // 调用 emit
        break; // 跳出循环或分支

      case '+slave': // 分支 '+slave'
        if (this.config.enableReadReplicas) { // 条件判断 this.config.enableReadReplicas
          this._discoverAndConnectReplicas(); // 调用 _discoverAndConnectReplicas
        } // 结束代码块
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 Master 切换
   * Handle Master switch
   * @private
   */
  async _handleMasterSwitch(message) { // 执行语句
    // 消息格式: masterName oldHost oldPort newHost newPort
    const parts = message.split(' '); // 定义常量 parts
    if (parts.length >= 5 && parts[0] === this.config.masterName) { // 条件判断 parts.length >= 5 && parts[0] === this.config...
      const newMaster = { // 定义常量 newMaster
        host: parts[3], // 设置 host 字段
        port: parseInt(parts[4], 10), // 设置 port 字段
      }; // 结束代码块

      this.state = SENTINEL_STATE.FAILOVER; // 设置 state
      this.stats.masterSwitchCount++; // 访问 stats
      this.stats.failoverCount++; // 访问 stats
      this.stats.lastFailoverTime = new Date().toISOString(); // 访问 stats

      this.emit('masterSwitch', { // 调用 emit
        oldMaster: this.currentMaster, // 设置 oldMaster 字段
        newMaster, // 执行语句
      }); // 结束代码块

      this.currentMaster = newMaster; // 设置 currentMaster

      try { // 尝试执行
        await this._connectToMaster(); // 等待异步结果

        if (this.config.enableReadReplicas) { // 条件判断 this.config.enableReadReplicas
          await this._discoverAndConnectReplicas(); // 等待异步结果
        } // 结束代码块

        this.state = SENTINEL_STATE.CONNECTED; // 设置 state
        this.emit('failoverComplete', { newMaster }); // 调用 emit

      } catch (error) { // 执行语句
        this.state = SENTINEL_STATE.ERROR; // 设置 state
        this.emit('failoverError', { error }); // 调用 emit
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 处理 Master 故障
   * Handle Master failure
   * @private
   */
  async _handleMasterFailure() { // 执行语句
    if (this.state === SENTINEL_STATE.FAILOVER) { // 条件判断 this.state === SENTINEL_STATE.FAILOVER
      return; // 已经在处理故障转移
    } // 结束代码块

    this.state = SENTINEL_STATE.FAILOVER; // 设置 state

    // 等待 Sentinel 完成故障转移 / Wait for Sentinel to complete failover
    const startTime = Date.now(); // 定义常量 startTime

    while (Date.now() - startTime < this.config.failoverTimeout) { // 循环条件 Date.now() - startTime < this.config.failover...
      try { // 尝试执行
        await this._discoverMaster(); // 等待异步结果
        await this._connectToMaster(); // 等待异步结果

        if (this.config.enableReadReplicas) { // 条件判断 this.config.enableReadReplicas
          await this._discoverAndConnectReplicas(); // 等待异步结果
        } // 结束代码块

        this.state = SENTINEL_STATE.CONNECTED; // 设置 state
        return; // 返回结果

      } catch (error) { // 执行语句
        await this._sleep(this.config.retryDelay); // 等待异步结果
      } // 结束代码块
    } // 结束代码块

    this.state = SENTINEL_STATE.ERROR; // 设置 state
    this.emit('failoverTimeout'); // 调用 emit
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
    this.stats.healthCheckCount++; // 访问 stats

    try { // 尝试执行
      // 检查 Master / Check Master
      if (this.masterClient) { // 条件判断 this.masterClient
        await this.masterClient.ping(); // 等待异步结果
      } // 结束代码块

      // 检查副本 / Check replicas
      for (let i = this.replicaClients.length - 1; i >= 0; i--) { // 循环 let i = this.replicaClients.length - 1; i >= ...
        try { // 尝试执行
          await this.replicaClients[i].ping(); // 等待异步结果
        } catch (error) { // 执行语句
          // 移除失败的副本 / Remove failed replica
          this.replicaClients.splice(i, 1); // 访问 replicaClients
          this.currentReplicas.splice(i, 1); // 访问 currentReplicas
        } // 结束代码块
      } // 结束代码块

      this.emit('healthCheck', { // 调用 emit
        master: this.currentMaster, // 设置 master 字段
        replicaCount: this.replicaClients.length, // 设置 replicaCount 字段
      }); // 结束代码块

    } catch (error) { // 执行语句
      this.emit('healthCheckFailed', { error }); // 调用 emit
      this._handleMasterFailure(); // 调用 _handleMasterFailure
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 公共方法 / Public Methods
  // ============================================

  /**
   * 获取 Master 客户端
   * Get Master client (for writes)
   */
  getMaster() { // 调用 getMaster
    if (!this.masterClient || this.state !== SENTINEL_STATE.CONNECTED) { // 条件判断 !this.masterClient || this.state !== SENTINEL...
      throw new Error('Master not available'); // 抛出异常
    } // 结束代码块
    return this.masterClient; // 返回结果
  } // 结束代码块

  /**
   * 获取读取客户端
   * Get read client (respects read preference)
   */
  getReadClient() { // 调用 getReadClient
    if (this.state !== SENTINEL_STATE.CONNECTED) { // 条件判断 this.state !== SENTINEL_STATE.CONNECTED
      throw new Error('Not connected'); // 抛出异常
    } // 结束代码块

    switch (this.config.readPreference) { // 分支选择 this.config.readPreference
      case 'replica': // 分支 'replica'
        if (this.replicaClients.length > 0) { // 条件判断 this.replicaClients.length > 0
          // 轮询副本 / Round-robin replicas
          const index = Math.floor(Math.random() * this.replicaClients.length); // 定义常量 index
          return this.replicaClients[index]; // 返回结果
        } // 结束代码块
        return this.masterClient; // 返回结果

      case 'preferReplica': // 分支 'preferReplica'
        if (this.replicaClients.length > 0) { // 条件判断 this.replicaClients.length > 0
          const index = Math.floor(Math.random() * this.replicaClients.length); // 定义常量 index
          return this.replicaClients[index]; // 返回结果
        } // 结束代码块
        return this.masterClient; // 返回结果

      case 'master': // 分支 'master'
      default: // 默认分支
        return this.masterClient; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取客户端 (兼容 RedisClient 接口)
   * Get client (compatible with RedisClient interface)
   */
  get client() { // 执行语句
    return this.getMaster(); // 返回结果
  } // 结束代码块

  /**
   * 获取状态
   * Get status
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      state: this.state, // 设置 state 字段
      isInitialized: this.isInitialized, // 设置 isInitialized 字段
      master: this.currentMaster, // 设置 master 字段
      replicas: this.currentReplicas, // 设置 replicas 字段
      stats: this.stats, // 设置 stats 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取 Sentinel 信息
   * Get Sentinel info
   */
  async getSentinelInfo() { // 执行语句
    if (!this.sentinelClient) { // 条件判断 !this.sentinelClient
      throw new Error('Not connected to Sentinel'); // 抛出异常
    } // 结束代码块

    const masterInfo = await this.sentinelClient.sendCommand([ // 定义常量 masterInfo
      'SENTINEL', // 执行语句
      'MASTER', // 执行语句
      this.config.masterName, // 访问 config
    ]); // 结束数组或索引

    const sentinelInfo = await this.sentinelClient.sendCommand([ // 定义常量 sentinelInfo
      'SENTINEL', // 执行语句
      'SENTINELS', // 执行语句
      this.config.masterName, // 访问 config
    ]); // 结束数组或索引

    return { // 返回结果
      master: this._parseReplicaInfo(masterInfo), // 设置 master 字段
      sentinels: sentinelInfo.map(s => this._parseReplicaInfo(s)), // 设置 sentinels 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 手动触发故障转移
   * Manually trigger failover
   */
  async triggerFailover() { // 执行语句
    if (!this.sentinelClient) { // 条件判断 !this.sentinelClient
      throw new Error('Not connected to Sentinel'); // 抛出异常
    } // 结束代码块

    await this.sentinelClient.sendCommand([ // 等待异步结果
      'SENTINEL', // 执行语句
      'FAILOVER', // 执行语句
      this.config.masterName, // 访问 config
    ]); // 结束数组或索引

    this.emit('manualFailover'); // 调用 emit
  } // 结束代码块

  /**
   * 关闭连接
   * Close connection
   */
  async close() { // 执行语句
    // 停止健康检查 / Stop health check
    if (this.healthCheckTimer) { // 条件判断 this.healthCheckTimer
      clearInterval(this.healthCheckTimer); // 调用 clearInterval
      this.healthCheckTimer = null; // 设置 healthCheckTimer
    } // 结束代码块

    // 关闭 Master 连接 / Close Master connection
    if (this.masterClient) { // 条件判断 this.masterClient
      try { // 尝试执行
        await this.masterClient.quit(); // 等待异步结果
      } catch (e) { // 执行语句
        // Ignore
      } // 结束代码块
      this.masterClient = null; // 设置 masterClient
    } // 结束代码块

    // 关闭副本连接 / Close replica connections
    for (const client of this.replicaClients) { // 循环 const client of this.replicaClients
      try { // 尝试执行
        await client.quit(); // 等待异步结果
      } catch (e) { // 执行语句
        // Ignore
      } // 结束代码块
    } // 结束代码块
    this.replicaClients = []; // 设置 replicaClients

    // 关闭 Sentinel 连接 / Close Sentinel connections
    if (this.sentinelClient) { // 条件判断 this.sentinelClient
      try { // 尝试执行
        await this.sentinelClient.quit(); // 等待异步结果
      } catch (e) { // 执行语句
        // Ignore
      } // 结束代码块
      this.sentinelClient = null; // 设置 sentinelClient
    } // 结束代码块

    if (this.sentinelSubClient) { // 条件判断 this.sentinelSubClient
      try { // 尝试执行
        await this.sentinelSubClient.quit(); // 等待异步结果
      } catch (e) { // 执行语句
        // Ignore
      } // 结束代码块
      this.sentinelSubClient = null; // 设置 sentinelSubClient
    } // 结束代码块

    this.state = SENTINEL_STATE.DISCONNECTED; // 设置 state
    this.isInitialized = false; // 设置 isInitialized
    this.currentMaster = null; // 设置 currentMaster
    this.currentReplicas = []; // 设置 currentReplicas

    this.emit('closed'); // 调用 emit
  } // 结束代码块

  /**
   * 延迟
   * Sleep
   * @private
   */
  _sleep(ms) { // 调用 _sleep
    return new Promise(resolve => setTimeout(resolve, ms)); // 返回结果
  } // 结束代码块
} // 结束代码块

export { // 导出命名成员
  RedisSentinel, // 执行语句
  SENTINEL_STATE, // 执行语句
  DEFAULT_SENTINEL_CONFIG, // 执行语句
}; // 结束代码块

export default RedisSentinel; // 默认导出
