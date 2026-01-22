/**
 * 交易所故障切换管理器
 * Exchange Failover Manager
 *
 * 功能 / Features:
 * 1. 主备交易所管理 / Primary-backup exchange management
 * 2. 健康状态监控 / Health status monitoring
 * 3. 自动故障切换 / Automatic failover
 * 4. 手动切换支持 / Manual switching support
 * 5. 故障恢复检测 / Failure recovery detection
 * 6. 延迟和可用性统计 / Latency and availability statistics
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 交易所状态
 * Exchange status
 */
const EXCHANGE_STATUS = { // 定义常量 EXCHANGE_STATUS
  HEALTHY: 'healthy',           // 健康 / Healthy
  DEGRADED: 'degraded',         // 降级 / Degraded
  UNHEALTHY: 'unhealthy',       // 不健康 / Unhealthy
  OFFLINE: 'offline',           // 离线 / Offline
  UNKNOWN: 'unknown',           // 未知 / Unknown
}; // 结束代码块

/**
 * 故障类型
 * Failure type
 */
const FAILURE_TYPE = { // 定义常量 FAILURE_TYPE
  CONNECTION: 'connection',     // 连接失败 / Connection failure
  TIMEOUT: 'timeout',           // 超时 / Timeout
  RATE_LIMIT: 'rate_limit',     // 频率限制 / Rate limit
  API_ERROR: 'api_error',       // API错误 / API error
  MAINTENANCE: 'maintenance',   // 维护中 / Maintenance
  UNKNOWN: 'unknown',           // 未知 / Unknown
}; // 结束代码块

/**
 * 切换原因
 * Failover reason
 */
const FAILOVER_REASON = { // 定义常量 FAILOVER_REASON
  AUTO_HEALTH: 'auto_health',       // 自动健康检测 / Auto health detection
  AUTO_ERROR: 'auto_error',         // 自动错误触发 / Auto error trigger
  MANUAL: 'manual',                  // 手动切换 / Manual switch
  RECOVERY: 'recovery',              // 恢复切换 / Recovery switch
  SCHEDULED: 'scheduled',            // 计划切换 / Scheduled switch
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 健康检查配置 / Health Check Configuration
  // ============================================

  // 健康检查间隔 (毫秒) / Health check interval (ms)
  healthCheckInterval: 10000,         // 10秒

  // 健康检查超时 (毫秒) / Health check timeout (ms)
  healthCheckTimeout: 5000,           // 5秒

  // 连续失败次数触发故障 / Consecutive failures to trigger failure
  failureThreshold: 3, // 设置 failureThreshold 字段

  // 连续成功次数恢复健康 / Consecutive successes to recover
  recoveryThreshold: 3, // 设置 recoveryThreshold 字段

  // ============================================
  // 延迟阈值 / Latency Thresholds
  // ============================================

  // 延迟警告阈值 (毫秒) / Latency warning threshold (ms)
  latencyWarningThreshold: 500, // 设置 latencyWarningThreshold 字段

  // 延迟严重阈值 (毫秒) / Latency critical threshold (ms)
  latencyCriticalThreshold: 2000, // 设置 latencyCriticalThreshold 字段

  // 延迟移动平均窗口 / Latency moving average window
  latencyWindowSize: 20, // 设置 latencyWindowSize 字段

  // ============================================
  // 故障切换配置 / Failover Configuration
  // ============================================

  // 启用自动故障切换 / Enable automatic failover
  enableAutoFailover: true, // 设置 enableAutoFailover 字段

  // 切换后冷却时间 (毫秒) / Cooldown after failover (ms)
  failoverCooldown: 60000,            // 1分钟

  // 启用自动恢复 / Enable automatic recovery
  enableAutoRecovery: true, // 设置 enableAutoRecovery 字段

  // 恢复前等待时间 (毫秒) / Wait time before recovery (ms)
  recoveryWaitTime: 300000,           // 5分钟

  // ============================================
  // 重试配置 / Retry Configuration
  // ============================================

  // 最大重试次数 / Maximum retry count
  maxRetries: 3, // 设置 maxRetries 字段

  // 重试间隔 (毫秒) / Retry interval (ms)
  retryInterval: 1000, // 设置 retryInterval 字段

  // 重试间隔增长因子 / Retry interval growth factor
  retryBackoffFactor: 2, // 设置 retryBackoffFactor 字段

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 设置 verbose 字段

  // 日志前缀 / Log prefix
  logPrefix: '[ExchangeFailover]', // 设置 logPrefix 字段

  // 统计历史保留数量 / Statistics history retention count
  statsHistoryLength: 1000, // 设置 statsHistoryLength 字段
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 交易所故障切换管理器
 * Exchange Failover Manager
 */
export class ExchangeFailover extends EventEmitter { // 导出类 ExchangeFailover
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 交易所列表 / Exchange list
    // 格式: { exchangeId: { client, priority, status, ... } }
    this.exchanges = new Map(); // 设置 exchanges

    // 当前主交易所 / Current primary exchange
    this.primaryExchangeId = null; // 设置 primaryExchangeId

    // 健康状态 / Health status
    // 格式: { exchangeId: { status, consecutiveFailures, consecutiveSuccesses, ... } }
    this.healthStatus = new Map(); // 设置 healthStatus

    // 延迟统计 / Latency statistics
    // 格式: { exchangeId: { latencies: [], avgLatency, minLatency, maxLatency } }
    this.latencyStats = new Map(); // 设置 latencyStats

    // 故障切换历史 / Failover history
    this.failoverHistory = []; // 设置 failoverHistory

    // 错误历史 / Error history
    // 格式: { exchangeId: [{ type, message, timestamp }, ...] }
    this.errorHistory = new Map(); // 设置 errorHistory

    // 最后切换时间 / Last failover time
    this.lastFailoverTime = 0; // 设置 lastFailoverTime

    // 运行状态 / Running state
    this.running = false; // 设置 running

    // 定时器 / Timers
    this.healthCheckTimer = null; // 设置 healthCheckTimer
    this.recoveryCheckTimer = null; // 设置 recoveryCheckTimer
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化
   * Initialize
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) { // 执行语句
    const { exchanges } = options; // 解构赋值

    if (exchanges && Array.isArray(exchanges)) { // 条件判断 exchanges && Array.isArray(exchanges)
      for (const exchange of exchanges) { // 循环 const exchange of exchanges
        this.registerExchange(exchange); // 调用 registerExchange
      } // 结束代码块
    } // 结束代码块

    this.log('交易所故障切换管理器初始化完成 / Exchange failover manager initialized', 'info'); // 调用 log
  } // 结束代码块

  /**
   * 启动
   * Start
   */
  start() { // 调用 start
    if (this.running) return; // 条件判断 this.running

    this.running = true; // 设置 running

    // 启动健康检查 / Start health check
    this.healthCheckTimer = setInterval( // 设置 healthCheckTimer
      () => this._performHealthChecks(), // 定义箭头函数
      this.config.healthCheckInterval // 访问 config
    ); // 结束调用或参数

    // 立即执行一次健康检查 / Immediately perform health check
    this._performHealthChecks(); // 调用 _performHealthChecks

    this.log('交易所故障切换管理器已启动 / Exchange failover manager started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止
   * Stop
   */
  stop() { // 调用 stop
    if (!this.running) return; // 条件判断 !this.running

    this.running = false; // 设置 running

    if (this.healthCheckTimer) { // 条件判断 this.healthCheckTimer
      clearInterval(this.healthCheckTimer); // 调用 clearInterval
      this.healthCheckTimer = null; // 设置 healthCheckTimer
    } // 结束代码块

    if (this.recoveryCheckTimer) { // 条件判断 this.recoveryCheckTimer
      clearInterval(this.recoveryCheckTimer); // 调用 clearInterval
      this.recoveryCheckTimer = null; // 设置 recoveryCheckTimer
    } // 结束代码块

    this.log('交易所故障切换管理器已停止 / Exchange failover manager stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 交易所管理 / Exchange Management
  // ============================================

  /**
   * 注册交易所
   * Register exchange
   *
   * @param {Object} exchangeConfig - 交易所配置 / Exchange configuration
   */
  registerExchange(exchangeConfig) { // 调用 registerExchange
    const { // 解构赋值
      id, // 执行语句
      name, // 执行语句
      client, // 执行语句
      priority = 100, // 赋值 priority
      healthCheckFn, // 执行语句
      isPrimary = false, // 赋值 isPrimary
    } = exchangeConfig; // 执行语句

    if (!id || !client) { // 条件判断 !id || !client
      throw new Error('交易所ID和客户端是必需的 / Exchange ID and client are required'); // 抛出异常
    } // 结束代码块

    const exchange = { // 定义常量 exchange
      id, // 执行语句
      name: name || id, // 设置 name 字段
      client, // 执行语句
      priority, // 执行语句
      healthCheckFn: healthCheckFn || this._defaultHealthCheck.bind(this), // 设置 healthCheckFn 字段
      registeredAt: Date.now(), // 设置 registeredAt 字段
      lastActiveAt: Date.now(), // 设置 lastActiveAt 字段
    }; // 结束代码块

    this.exchanges.set(id, exchange); // 访问 exchanges

    // 初始化健康状态 / Initialize health status
    this.healthStatus.set(id, { // 访问 healthStatus
      status: EXCHANGE_STATUS.UNKNOWN, // 设置 status 字段
      consecutiveFailures: 0, // 设置 consecutiveFailures 字段
      consecutiveSuccesses: 0, // 设置 consecutiveSuccesses 字段
      lastCheckTime: null, // 设置 lastCheckTime 字段
      lastSuccessTime: null, // 设置 lastSuccessTime 字段
      lastFailureTime: null, // 设置 lastFailureTime 字段
      lastError: null, // 设置 lastError 字段
    }); // 结束代码块

    // 初始化延迟统计 / Initialize latency stats
    this.latencyStats.set(id, { // 访问 latencyStats
      latencies: [], // 设置 latencies 字段
      avgLatency: 0, // 设置 avgLatency 字段
      minLatency: Infinity, // 设置 minLatency 字段
      maxLatency: 0, // 设置 maxLatency 字段
    }); // 结束代码块

    // 初始化错误历史 / Initialize error history
    this.errorHistory.set(id, []); // 访问 errorHistory

    // 设置主交易所 / Set primary exchange
    if (isPrimary || this.primaryExchangeId === null) { // 条件判断 isPrimary || this.primaryExchangeId === null
      this.primaryExchangeId = id; // 设置 primaryExchangeId
    } // 结束代码块

    this.log(`注册交易所: ${name} (${id}) 优先级=${priority}`, 'info'); // 调用 log
    this.emit('exchangeRegistered', { id, name, priority, isPrimary }); // 调用 emit
  } // 结束代码块

  /**
   * 注销交易所
   * Unregister exchange
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   */
  unregisterExchange(exchangeId) { // 调用 unregisterExchange
    if (!this.exchanges.has(exchangeId)) return; // 条件判断 !this.exchanges.has(exchangeId)

    // 如果是主交易所，需要先切换 / If primary, need to switch first
    if (this.primaryExchangeId === exchangeId) { // 条件判断 this.primaryExchangeId === exchangeId
      const nextPrimary = this._findNextPrimary(exchangeId); // 定义常量 nextPrimary
      if (nextPrimary) { // 条件判断 nextPrimary
        this._performFailover(nextPrimary, FAILOVER_REASON.MANUAL, '主交易所被注销'); // 调用 _performFailover
      } else { // 执行语句
        this.primaryExchangeId = null; // 设置 primaryExchangeId
      } // 结束代码块
    } // 结束代码块

    this.exchanges.delete(exchangeId); // 访问 exchanges
    this.healthStatus.delete(exchangeId); // 访问 healthStatus
    this.latencyStats.delete(exchangeId); // 访问 latencyStats
    this.errorHistory.delete(exchangeId); // 访问 errorHistory

    this.log(`注销交易所: ${exchangeId}`, 'info'); // 调用 log
    this.emit('exchangeUnregistered', { id: exchangeId }); // 调用 emit
  } // 结束代码块

  // ============================================
  // 健康检查 / Health Check
  // ============================================

  /**
   * 执行健康检查
   * Perform health checks
   * @private
   */
  async _performHealthChecks() { // 执行语句
    const checkPromises = []; // 定义常量 checkPromises

    for (const [exchangeId, exchange] of this.exchanges) { // 循环 const [exchangeId, exchange] of this.exchanges
      checkPromises.push(this._checkExchangeHealth(exchangeId, exchange)); // 调用 checkPromises.push
    } // 结束代码块

    await Promise.allSettled(checkPromises); // 等待异步结果

    // 检查是否需要故障切换 / Check if failover is needed
    if (this.config.enableAutoFailover) { // 条件判断 this.config.enableAutoFailover
      this._checkFailoverNeeded(); // 调用 _checkFailoverNeeded
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查单个交易所健康
   * Check single exchange health
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @param {Object} exchange - 交易所对象 / Exchange object
   * @private
   */
  async _checkExchangeHealth(exchangeId, exchange) { // 执行语句
    const health = this.healthStatus.get(exchangeId); // 定义常量 health
    const startTime = Date.now(); // 定义常量 startTime

    try { // 尝试执行
      // 设置超时 / Set timeout
      const timeoutPromise = new Promise((_, reject) => { // 定义函数 timeoutPromise
        setTimeout(() => reject(new Error('健康检查超时')), this.config.healthCheckTimeout); // 设置延时任务
      }); // 结束代码块

      // 执行健康检查 / Execute health check
      const checkPromise = exchange.healthCheckFn(exchange.client); // 定义常量 checkPromise
      await Promise.race([checkPromise, timeoutPromise]); // 等待异步结果

      // 记录延迟 / Record latency
      const latency = Date.now() - startTime; // 定义常量 latency
      this._recordLatency(exchangeId, latency); // 调用 _recordLatency

      // 更新健康状态 / Update health status
      health.consecutiveSuccesses++; // 执行语句
      health.consecutiveFailures = 0; // 赋值 health.consecutiveFailures
      health.lastCheckTime = Date.now(); // 赋值 health.lastCheckTime
      health.lastSuccessTime = Date.now(); // 赋值 health.lastSuccessTime
      health.lastError = null; // 赋值 health.lastError

      // 确定状态 / Determine status
      const latencyStats = this.latencyStats.get(exchangeId); // 定义常量 latencyStats
      if (latencyStats.avgLatency > this.config.latencyCriticalThreshold) { // 条件判断 latencyStats.avgLatency > this.config.latency...
        health.status = EXCHANGE_STATUS.DEGRADED; // 赋值 health.status
      } else if (latencyStats.avgLatency > this.config.latencyWarningThreshold) { // 执行语句
        health.status = EXCHANGE_STATUS.DEGRADED; // 赋值 health.status
      } else { // 执行语句
        health.status = EXCHANGE_STATUS.HEALTHY; // 赋值 health.status
      } // 结束代码块

      // 更新活跃时间 / Update active time
      exchange.lastActiveAt = Date.now(); // 赋值 exchange.lastActiveAt

    } catch (error) { // 执行语句
      // 记录错误 / Record error
      const failureType = this._classifyError(error); // 定义常量 failureType
      this._recordError(exchangeId, failureType, error.message); // 调用 _recordError

      // 更新健康状态 / Update health status
      health.consecutiveFailures++; // 执行语句
      health.consecutiveSuccesses = 0; // 赋值 health.consecutiveSuccesses
      health.lastCheckTime = Date.now(); // 赋值 health.lastCheckTime
      health.lastFailureTime = Date.now(); // 赋值 health.lastFailureTime
      health.lastError = { // 赋值 health.lastError
        type: failureType, // 设置 type 字段
        message: error.message, // 设置 message 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }; // 结束代码块

      // 确定状态 / Determine status
      if (health.consecutiveFailures >= this.config.failureThreshold) { // 条件判断 health.consecutiveFailures >= this.config.fai...
        health.status = EXCHANGE_STATUS.OFFLINE; // 赋值 health.status
      } else if (health.consecutiveFailures >= 1) { // 执行语句
        health.status = EXCHANGE_STATUS.UNHEALTHY; // 赋值 health.status
      } // 结束代码块

      this.log(`交易所健康检查失败: ${exchangeId} - ${error.message}`, 'warn'); // 调用 log
    } // 结束代码块

    // 发出健康状态更新事件 / Emit health status update event
    this.emit('healthStatusUpdated', { // 调用 emit
      exchangeId, // 执行语句
      status: health.status, // 设置 status 字段
      latency: this.latencyStats.get(exchangeId).avgLatency, // 设置 latency 字段
      consecutiveFailures: health.consecutiveFailures, // 设置 consecutiveFailures 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 默认健康检查函数
   * Default health check function
   *
   * @param {Object} client - 交易所客户端 / Exchange client
   * @returns {Promise<boolean>} 健康状态 / Health status
   * @private
   */
  async _defaultHealthCheck(client) { // 执行语句
    // 尝试获取服务器时间作为健康检查 / Try to get server time as health check
    if (typeof client.fetchTime === 'function') { // 条件判断 typeof client.fetchTime === 'function'
      await client.fetchTime(); // 等待异步结果
      return true; // 返回结果
    } // 结束代码块

    // 尝试获取市场信息 / Try to get market info
    if (typeof client.loadMarkets === 'function') { // 条件判断 typeof client.loadMarkets === 'function'
      await client.loadMarkets(); // 等待异步结果
      return true; // 返回结果
    } // 结束代码块

    // 尝试ping / Try ping
    if (typeof client.ping === 'function') { // 条件判断 typeof client.ping === 'function'
      await client.ping(); // 等待异步结果
      return true; // 返回结果
    } // 结束代码块

    throw new Error('无可用的健康检查方法'); // 抛出异常
  } // 结束代码块

  /**
   * 分类错误类型
   * Classify error type
   *
   * @param {Error} error - 错误对象 / Error object
   * @returns {string} 错误类型 / Error type
   * @private
   */
  _classifyError(error) { // 调用 _classifyError
    const message = error.message.toLowerCase(); // 定义常量 message

    if (message.includes('timeout') || message.includes('超时')) { // 条件判断 message.includes('timeout') || message.includ...
      return FAILURE_TYPE.TIMEOUT; // 返回结果
    } // 结束代码块

    if (message.includes('connection') || message.includes('network') || // 条件判断 message.includes('connection') || message.inc...
        message.includes('econnrefused') || message.includes('enotfound')) { // 调用 message.includes
      return FAILURE_TYPE.CONNECTION; // 返回结果
    } // 结束代码块

    if (message.includes('rate') || message.includes('limit') || message.includes('429')) { // 条件判断 message.includes('rate') || message.includes(...
      return FAILURE_TYPE.RATE_LIMIT; // 返回结果
    } // 结束代码块

    if (message.includes('maintenance') || message.includes('维护')) { // 条件判断 message.includes('maintenance') || message.in...
      return FAILURE_TYPE.MAINTENANCE; // 返回结果
    } // 结束代码块

    if (message.includes('api') || message.includes('error')) { // 条件判断 message.includes('api') || message.includes('...
      return FAILURE_TYPE.API_ERROR; // 返回结果
    } // 结束代码块

    return FAILURE_TYPE.UNKNOWN; // 返回结果
  } // 结束代码块

  // ============================================
  // 延迟统计 / Latency Statistics
  // ============================================

  /**
   * 记录延迟
   * Record latency
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @param {number} latency - 延迟 (毫秒) / Latency (ms)
   * @private
   */
  _recordLatency(exchangeId, latency) { // 调用 _recordLatency
    const stats = this.latencyStats.get(exchangeId); // 定义常量 stats
    if (!stats) return; // 条件判断 !stats

    stats.latencies.push(latency); // 调用 stats.latencies.push

    // 限制窗口大小 / Limit window size
    if (stats.latencies.length > this.config.latencyWindowSize) { // 条件判断 stats.latencies.length > this.config.latencyW...
      stats.latencies.shift(); // 调用 stats.latencies.shift
    } // 结束代码块

    // 更新统计 / Update statistics
    stats.avgLatency = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length; // 赋值 stats.avgLatency
    stats.minLatency = Math.min(stats.minLatency, latency); // 赋值 stats.minLatency
    stats.maxLatency = Math.max(stats.maxLatency, latency); // 赋值 stats.maxLatency
  } // 结束代码块

  /**
   * 记录错误
   * Record error
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @param {string} type - 错误类型 / Error type
   * @param {string} message - 错误消息 / Error message
   * @private
   */
  _recordError(exchangeId, type, message) { // 调用 _recordError
    const errors = this.errorHistory.get(exchangeId); // 定义常量 errors
    if (!errors) return; // 条件判断 !errors

    errors.push({ // 调用 errors.push
      type, // 执行语句
      message, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块

    // 限制历史长度 / Limit history length
    if (errors.length > this.config.statsHistoryLength) { // 条件判断 errors.length > this.config.statsHistoryLength
      errors.shift(); // 调用 errors.shift
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 故障切换 / Failover
  // ============================================

  /**
   * 检查是否需要故障切换
   * Check if failover is needed
   * @private
   */
  _checkFailoverNeeded() { // 调用 _checkFailoverNeeded
    if (!this.primaryExchangeId) return; // 条件判断 !this.primaryExchangeId

    const primaryHealth = this.healthStatus.get(this.primaryExchangeId); // 定义常量 primaryHealth
    if (!primaryHealth) return; // 条件判断 !primaryHealth

    // 检查主交易所是否不健康 / Check if primary is unhealthy
    if (primaryHealth.status === EXCHANGE_STATUS.OFFLINE || // 条件判断 primaryHealth.status === EXCHANGE_STATUS.OFFL...
        primaryHealth.status === EXCHANGE_STATUS.UNHEALTHY) { // 赋值 primaryHealth.status

      // 检查冷却时间 / Check cooldown
      const now = Date.now(); // 定义常量 now
      if (now - this.lastFailoverTime < this.config.failoverCooldown) { // 条件判断 now - this.lastFailoverTime < this.config.fai...
        this.log('故障切换冷却中 / Failover in cooldown', 'info'); // 调用 log
        return; // 返回结果
      } // 结束代码块

      // 找到下一个可用的交易所 / Find next available exchange
      const nextPrimary = this._findNextPrimary(this.primaryExchangeId); // 定义常量 nextPrimary

      if (nextPrimary) { // 条件判断 nextPrimary
        this._performFailover(nextPrimary, FAILOVER_REASON.AUTO_HEALTH, // 调用 _performFailover
          `主交易所状态: ${primaryHealth.status}`); // 执行语句
      } else { // 执行语句
        this.log('无可用的备用交易所 / No available backup exchange', 'error'); // 调用 log
        this.emit('noBackupAvailable', { primaryId: this.primaryExchangeId }); // 调用 emit
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 找到下一个主交易所
   * Find next primary exchange
   *
   * @param {string} excludeId - 排除的ID / Excluded ID
   * @returns {string|null} 下一个主交易所ID / Next primary exchange ID
   * @private
   */
  _findNextPrimary(excludeId) { // 调用 _findNextPrimary
    let bestCandidate = null; // 定义变量 bestCandidate
    let bestPriority = Infinity; // 定义变量 bestPriority

    for (const [id, exchange] of this.exchanges) { // 循环 const [id, exchange] of this.exchanges
      if (id === excludeId) continue; // 条件判断 id === excludeId

      const health = this.healthStatus.get(id); // 定义常量 health
      if (!health || health.status === EXCHANGE_STATUS.OFFLINE || // 条件判断 !health || health.status === EXCHANGE_STATUS....
          health.status === EXCHANGE_STATUS.UNHEALTHY) { // 赋值 health.status
        continue; // 继续下一轮循环
      } // 结束代码块

      if (exchange.priority < bestPriority) { // 条件判断 exchange.priority < bestPriority
        bestPriority = exchange.priority; // 赋值 bestPriority
        bestCandidate = id; // 赋值 bestCandidate
      } // 结束代码块
    } // 结束代码块

    return bestCandidate; // 返回结果
  } // 结束代码块

  /**
   * 执行故障切换
   * Perform failover
   *
   * @param {string} newPrimaryId - 新主交易所ID / New primary exchange ID
   * @param {string} reason - 原因 / Reason
   * @param {string} details - 详情 / Details
   * @private
   */
  _performFailover(newPrimaryId, reason, details = '') { // 调用 _performFailover
    const oldPrimaryId = this.primaryExchangeId; // 定义常量 oldPrimaryId
    const now = Date.now(); // 定义常量 now

    // 更新主交易所 / Update primary exchange
    this.primaryExchangeId = newPrimaryId; // 设置 primaryExchangeId
    this.lastFailoverTime = now; // 设置 lastFailoverTime

    // 记录切换历史 / Record failover history
    const failoverRecord = { // 定义常量 failoverRecord
      fromExchange: oldPrimaryId, // 设置 fromExchange 字段
      toExchange: newPrimaryId, // 设置 toExchange 字段
      reason, // 执行语句
      details, // 执行语句
      timestamp: now, // 设置 timestamp 字段
    }; // 结束代码块

    this.failoverHistory.push(failoverRecord); // 访问 failoverHistory

    // 限制历史长度 / Limit history length
    if (this.failoverHistory.length > this.config.statsHistoryLength) { // 条件判断 this.failoverHistory.length > this.config.sta...
      this.failoverHistory.shift(); // 访问 failoverHistory
    } // 结束代码块

    this.log(`🔄 故障切换: ${oldPrimaryId} -> ${newPrimaryId} (${reason}: ${details})`, 'warn'); // 调用 log

    // 发出切换事件 / Emit failover event
    this.emit('failover', failoverRecord); // 调用 emit

    // 如果启用自动恢复，开始监控原主交易所 / If auto recovery enabled, start monitoring original primary
    if (this.config.enableAutoRecovery && oldPrimaryId) { // 条件判断 this.config.enableAutoRecovery && oldPrimaryId
      this._scheduleRecoveryCheck(oldPrimaryId); // 调用 _scheduleRecoveryCheck
    } // 结束代码块
  } // 结束代码块

  /**
   * 安排恢复检查
   * Schedule recovery check
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @private
   */
  _scheduleRecoveryCheck(exchangeId) { // 调用 _scheduleRecoveryCheck
    // 取消之前的恢复检查 / Cancel previous recovery check
    if (this.recoveryCheckTimer) { // 条件判断 this.recoveryCheckTimer
      clearTimeout(this.recoveryCheckTimer); // 调用 clearTimeout
    } // 结束代码块

    this.recoveryCheckTimer = setTimeout(() => { // 设置 recoveryCheckTimer
      this._checkRecovery(exchangeId); // 调用 _checkRecovery
    }, this.config.recoveryWaitTime); // 执行语句

    this.log(`已安排 ${exchangeId} 的恢复检查`, 'info'); // 调用 log
  } // 结束代码块

  /**
   * 检查恢复
   * Check recovery
   *
   * @param {string} originalPrimaryId - 原主交易所ID / Original primary exchange ID
   * @private
   */
  async _checkRecovery(originalPrimaryId) { // 执行语句
    const health = this.healthStatus.get(originalPrimaryId); // 定义常量 health
    if (!health) return; // 条件判断 !health

    // 检查原主交易所是否恢复 / Check if original primary recovered
    if (health.status === EXCHANGE_STATUS.HEALTHY && // 条件判断 health.status === EXCHANGE_STATUS.HEALTHY &&
        health.consecutiveSuccesses >= this.config.recoveryThreshold) { // 执行语句

      const originalExchange = this.exchanges.get(originalPrimaryId); // 定义常量 originalExchange
      const currentPrimary = this.exchanges.get(this.primaryExchangeId); // 定义常量 currentPrimary

      // 检查原主交易所优先级是否更高 / Check if original has higher priority
      if (originalExchange && currentPrimary && // 条件判断 originalExchange && currentPrimary &&
          originalExchange.priority < currentPrimary.priority) { // 执行语句

        this._performFailover(originalPrimaryId, FAILOVER_REASON.RECOVERY, // 调用 _performFailover
          '原主交易所已恢复'); // 执行语句
      } // 结束代码块
    } else { // 执行语句
      // 继续安排检查 / Continue scheduling check
      this._scheduleRecoveryCheck(originalPrimaryId); // 调用 _scheduleRecoveryCheck
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 获取当前主交易所
   * Get current primary exchange
   *
   * @returns {Object|null} 主交易所 / Primary exchange
   */
  getPrimary() { // 调用 getPrimary
    if (!this.primaryExchangeId) return null; // 条件判断 !this.primaryExchangeId
    return this.exchanges.get(this.primaryExchangeId); // 返回结果
  } // 结束代码块

  /**
   * 获取主交易所客户端
   * Get primary exchange client
   *
   * @returns {Object|null} 客户端 / Client
   */
  getPrimaryClient() { // 调用 getPrimaryClient
    const primary = this.getPrimary(); // 定义常量 primary
    return primary ? primary.client : null; // 返回结果
  } // 结束代码块

  /**
   * 获取交易所客户端
   * Get exchange client
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @returns {Object|null} 客户端 / Client
   */
  getClient(exchangeId) { // 调用 getClient
    const exchange = this.exchanges.get(exchangeId); // 定义常量 exchange
    return exchange ? exchange.client : null; // 返回结果
  } // 结束代码块

  /**
   * 手动切换主交易所
   * Manual switch primary exchange
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @returns {boolean} 是否成功 / Success status
   */
  switchTo(exchangeId) { // 调用 switchTo
    if (!this.exchanges.has(exchangeId)) { // 条件判断 !this.exchanges.has(exchangeId)
      this.log(`交易所不存在: ${exchangeId}`, 'error'); // 调用 log
      return false; // 返回结果
    } // 结束代码块

    if (exchangeId === this.primaryExchangeId) { // 条件判断 exchangeId === this.primaryExchangeId
      this.log(`已是主交易所: ${exchangeId}`, 'info'); // 调用 log
      return true; // 返回结果
    } // 结束代码块

    this._performFailover(exchangeId, FAILOVER_REASON.MANUAL, '手动切换'); // 调用 _performFailover
    return true; // 返回结果
  } // 结束代码块

  /**
   * 带重试的执行
   * Execute with retry
   *
   * @param {Function} fn - 执行函数 / Execute function
   * @param {Object} options - 选项 / Options
   * @returns {Promise<any>} 执行结果 / Execution result
   */
  async executeWithRetry(fn, options = {}) { // 执行语句
    const { // 解构赋值
      maxRetries = this.config.maxRetries, // 赋值 maxRetries
      retryInterval = this.config.retryInterval, // 赋值 retryInterval
      backoffFactor = this.config.retryBackoffFactor, // 赋值 backoffFactor
      fallbackToBackup = true, // 赋值 fallbackToBackup
    } = options; // 执行语句

    let lastError; // 定义变量 lastError
    let currentInterval = retryInterval; // 定义变量 currentInterval
    const triedExchanges = new Set(); // 定义常量 triedExchanges

    // 首先尝试主交易所 / First try primary exchange
    let currentExchangeId = this.primaryExchangeId; // 定义变量 currentExchangeId

    while (true) { // 循环条件 true
      const exchange = this.exchanges.get(currentExchangeId); // 定义常量 exchange
      if (!exchange) { // 条件判断 !exchange
        throw new Error('无可用交易所 / No available exchange'); // 抛出异常
      } // 结束代码块

      triedExchanges.add(currentExchangeId); // 调用 triedExchanges.add

      // 尝试执行 / Try to execute
      for (let attempt = 1; attempt <= maxRetries; attempt++) { // 循环 let attempt = 1; attempt <= maxRetries; attem...
        try { // 尝试执行
          const result = await fn(exchange.client, currentExchangeId); // 定义常量 result
          return result; // 返回结果
        } catch (error) { // 执行语句
          lastError = error; // 赋值 lastError

          // 记录错误 / Record error
          const failureType = this._classifyError(error); // 定义常量 failureType
          this._recordError(currentExchangeId, failureType, error.message); // 调用 _recordError

          // 更新健康状态 / Update health status
          const health = this.healthStatus.get(currentExchangeId); // 定义常量 health
          if (health) { // 条件判断 health
            health.consecutiveFailures++; // 执行语句
            health.lastError = { // 赋值 health.lastError
              type: failureType, // 设置 type 字段
              message: error.message, // 设置 message 字段
              timestamp: Date.now(), // 设置 timestamp 字段
            }; // 结束代码块
          } // 结束代码块

          this.log(`执行失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`, 'warn'); // 调用 log

          // 如果不是最后一次尝试，等待后重试 / If not last attempt, wait and retry
          if (attempt < maxRetries) { // 条件判断 attempt < maxRetries
            await this._sleep(currentInterval); // 等待异步结果
            currentInterval *= backoffFactor; // 执行语句
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      // 主交易所失败，尝试备用 / Primary failed, try backup
      if (fallbackToBackup) { // 条件判断 fallbackToBackup
        currentExchangeId = this._findNextPrimary(currentExchangeId); // 赋值 currentExchangeId

        // 排除已尝试的交易所 / Exclude tried exchanges
        while (currentExchangeId && triedExchanges.has(currentExchangeId)) { // 循环条件 currentExchangeId && triedExchanges.has(curre...
          currentExchangeId = this._findNextPrimary(currentExchangeId); // 赋值 currentExchangeId
        } // 结束代码块

        if (currentExchangeId) { // 条件判断 currentExchangeId
          this.log(`尝试备用交易所: ${currentExchangeId}`, 'info'); // 调用 log
          currentInterval = retryInterval; // 重置重试间隔
          continue; // 继续下一轮循环
        } // 结束代码块
      } // 结束代码块

      // 所有交易所都失败 / All exchanges failed
      throw lastError; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取健康状态
   * Get health status
   *
   * @param {string} exchangeId - 交易所ID (可选) / Exchange ID (optional)
   * @returns {Object} 健康状态 / Health status
   */
  getHealthStatus(exchangeId) { // 调用 getHealthStatus
    if (exchangeId) { // 条件判断 exchangeId
      return this.healthStatus.get(exchangeId); // 返回结果
    } // 结束代码块

    const statuses = {}; // 定义常量 statuses
    for (const [id, health] of this.healthStatus) { // 循环 const [id, health] of this.healthStatus
      statuses[id] = { ...health }; // 执行语句
    } // 结束代码块
    return statuses; // 返回结果
  } // 结束代码块

  /**
   * 获取延迟统计
   * Get latency statistics
   *
   * @param {string} exchangeId - 交易所ID (可选) / Exchange ID (optional)
   * @returns {Object} 延迟统计 / Latency statistics
   */
  getLatencyStats(exchangeId) { // 调用 getLatencyStats
    if (exchangeId) { // 条件判断 exchangeId
      return this.latencyStats.get(exchangeId); // 返回结果
    } // 结束代码块

    const stats = {}; // 定义常量 stats
    for (const [id, latency] of this.latencyStats) { // 循环 const [id, latency] of this.latencyStats
      stats[id] = { ...latency }; // 执行语句
    } // 结束代码块
    return stats; // 返回结果
  } // 结束代码块

  /**
   * 获取故障切换历史
   * Get failover history
   *
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 切换历史 / Failover history
   */
  getFailoverHistory(limit = 50) { // 调用 getFailoverHistory
    return this.failoverHistory.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取状态
   * Get status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    const exchangeList = []; // 定义常量 exchangeList
    for (const [id, exchange] of this.exchanges) { // 循环 const [id, exchange] of this.exchanges
      const health = this.healthStatus.get(id); // 定义常量 health
      const latency = this.latencyStats.get(id); // 定义常量 latency

      exchangeList.push({ // 调用 exchangeList.push
        id, // 执行语句
        name: exchange.name, // 设置 name 字段
        priority: exchange.priority, // 设置 priority 字段
        isPrimary: id === this.primaryExchangeId, // 设置 isPrimary 字段
        status: health ? health.status : EXCHANGE_STATUS.UNKNOWN, // 设置 status 字段
        avgLatency: latency ? latency.avgLatency : null, // 设置 avgLatency 字段
        consecutiveFailures: health ? health.consecutiveFailures : 0, // 设置 consecutiveFailures 字段
        lastActiveAt: exchange.lastActiveAt, // 设置 lastActiveAt 字段
      }); // 结束代码块
    } // 结束代码块

    return { // 返回结果
      running: this.running, // 设置 running 字段
      primaryExchangeId: this.primaryExchangeId, // 设置 primaryExchangeId 字段
      exchangeCount: this.exchanges.size, // 设置 exchangeCount 字段
      exchanges: exchangeList.sort((a, b) => a.priority - b.priority), // 设置 exchanges 字段
      lastFailoverTime: this.lastFailoverTime, // 设置 lastFailoverTime 字段
      failoverCount: this.failoverHistory.length, // 设置 failoverCount 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 强制健康检查
   * Force health check
   */
  async forceHealthCheck() { // 执行语句
    await this._performHealthChecks(); // 等待异步结果
  } // 结束代码块

  /**
   * 辅助函数: 延迟
   * Helper: Sleep
   *
   * @param {number} ms - 毫秒 / Milliseconds
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) { // 调用 _sleep
    return new Promise(resolve => setTimeout(resolve, ms)); // 返回结果
  } // 结束代码块

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') { // 调用 log
    if (!this.config.verbose && level === 'info') return; // 条件判断 !this.config.verbose && level === 'info'

    const fullMessage = `${this.config.logPrefix} ${message}`; // 定义常量 fullMessage

    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'info': // 分支 'info'
      default: // 默认分支
        console.log(fullMessage); // 控制台输出
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { EXCHANGE_STATUS, FAILURE_TYPE, FAILOVER_REASON, DEFAULT_CONFIG }; // 导出命名成员
export default ExchangeFailover; // 默认导出
