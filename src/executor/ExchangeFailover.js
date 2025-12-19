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

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 交易所状态
 * Exchange status
 */
const EXCHANGE_STATUS = {
  HEALTHY: 'healthy',           // 健康 / Healthy
  DEGRADED: 'degraded',         // 降级 / Degraded
  UNHEALTHY: 'unhealthy',       // 不健康 / Unhealthy
  OFFLINE: 'offline',           // 离线 / Offline
  UNKNOWN: 'unknown',           // 未知 / Unknown
};

/**
 * 故障类型
 * Failure type
 */
const FAILURE_TYPE = {
  CONNECTION: 'connection',     // 连接失败 / Connection failure
  TIMEOUT: 'timeout',           // 超时 / Timeout
  RATE_LIMIT: 'rate_limit',     // 频率限制 / Rate limit
  API_ERROR: 'api_error',       // API错误 / API error
  MAINTENANCE: 'maintenance',   // 维护中 / Maintenance
  UNKNOWN: 'unknown',           // 未知 / Unknown
};

/**
 * 切换原因
 * Failover reason
 */
const FAILOVER_REASON = {
  AUTO_HEALTH: 'auto_health',       // 自动健康检测 / Auto health detection
  AUTO_ERROR: 'auto_error',         // 自动错误触发 / Auto error trigger
  MANUAL: 'manual',                  // 手动切换 / Manual switch
  RECOVERY: 'recovery',              // 恢复切换 / Recovery switch
  SCHEDULED: 'scheduled',            // 计划切换 / Scheduled switch
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 健康检查配置 / Health Check Configuration
  // ============================================

  // 健康检查间隔 (毫秒) / Health check interval (ms)
  healthCheckInterval: 10000,         // 10秒

  // 健康检查超时 (毫秒) / Health check timeout (ms)
  healthCheckTimeout: 5000,           // 5秒

  // 连续失败次数触发故障 / Consecutive failures to trigger failure
  failureThreshold: 3,

  // 连续成功次数恢复健康 / Consecutive successes to recover
  recoveryThreshold: 3,

  // ============================================
  // 延迟阈值 / Latency Thresholds
  // ============================================

  // 延迟警告阈值 (毫秒) / Latency warning threshold (ms)
  latencyWarningThreshold: 500,

  // 延迟严重阈值 (毫秒) / Latency critical threshold (ms)
  latencyCriticalThreshold: 2000,

  // 延迟移动平均窗口 / Latency moving average window
  latencyWindowSize: 20,

  // ============================================
  // 故障切换配置 / Failover Configuration
  // ============================================

  // 启用自动故障切换 / Enable automatic failover
  enableAutoFailover: true,

  // 切换后冷却时间 (毫秒) / Cooldown after failover (ms)
  failoverCooldown: 60000,            // 1分钟

  // 启用自动恢复 / Enable automatic recovery
  enableAutoRecovery: true,

  // 恢复前等待时间 (毫秒) / Wait time before recovery (ms)
  recoveryWaitTime: 300000,           // 5分钟

  // ============================================
  // 重试配置 / Retry Configuration
  // ============================================

  // 最大重试次数 / Maximum retry count
  maxRetries: 3,

  // 重试间隔 (毫秒) / Retry interval (ms)
  retryInterval: 1000,

  // 重试间隔增长因子 / Retry interval growth factor
  retryBackoffFactor: 2,

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[ExchangeFailover]',

  // 统计历史保留数量 / Statistics history retention count
  statsHistoryLength: 1000,
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 交易所故障切换管理器
 * Exchange Failover Manager
 */
export class ExchangeFailover extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    super();

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 交易所列表 / Exchange list
    // 格式: { exchangeId: { client, priority, status, ... } }
    this.exchanges = new Map();

    // 当前主交易所 / Current primary exchange
    this.primaryExchangeId = null;

    // 健康状态 / Health status
    // 格式: { exchangeId: { status, consecutiveFailures, consecutiveSuccesses, ... } }
    this.healthStatus = new Map();

    // 延迟统计 / Latency statistics
    // 格式: { exchangeId: { latencies: [], avgLatency, minLatency, maxLatency } }
    this.latencyStats = new Map();

    // 故障切换历史 / Failover history
    this.failoverHistory = [];

    // 错误历史 / Error history
    // 格式: { exchangeId: [{ type, message, timestamp }, ...] }
    this.errorHistory = new Map();

    // 最后切换时间 / Last failover time
    this.lastFailoverTime = 0;

    // 运行状态 / Running state
    this.running = false;

    // 定时器 / Timers
    this.healthCheckTimer = null;
    this.recoveryCheckTimer = null;
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 初始化
   * Initialize
   *
   * @param {Object} options - 选项 / Options
   */
  async init(options = {}) {
    const { exchanges } = options;

    if (exchanges && Array.isArray(exchanges)) {
      for (const exchange of exchanges) {
        this.registerExchange(exchange);
      }
    }

    this.log('交易所故障切换管理器初始化完成 / Exchange failover manager initialized', 'info');
  }

  /**
   * 启动
   * Start
   */
  start() {
    if (this.running) return;

    this.running = true;

    // 启动健康检查 / Start health check
    this.healthCheckTimer = setInterval(
      () => this._performHealthChecks(),
      this.config.healthCheckInterval
    );

    // 立即执行一次健康检查 / Immediately perform health check
    this._performHealthChecks();

    this.log('交易所故障切换管理器已启动 / Exchange failover manager started', 'info');
    this.emit('started');
  }

  /**
   * 停止
   * Stop
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.recoveryCheckTimer) {
      clearInterval(this.recoveryCheckTimer);
      this.recoveryCheckTimer = null;
    }

    this.log('交易所故障切换管理器已停止 / Exchange failover manager stopped', 'info');
    this.emit('stopped');
  }

  // ============================================
  // 交易所管理 / Exchange Management
  // ============================================

  /**
   * 注册交易所
   * Register exchange
   *
   * @param {Object} exchangeConfig - 交易所配置 / Exchange configuration
   */
  registerExchange(exchangeConfig) {
    const {
      id,
      name,
      client,
      priority = 100,
      healthCheckFn,
      isPrimary = false,
    } = exchangeConfig;

    if (!id || !client) {
      throw new Error('交易所ID和客户端是必需的 / Exchange ID and client are required');
    }

    const exchange = {
      id,
      name: name || id,
      client,
      priority,
      healthCheckFn: healthCheckFn || this._defaultHealthCheck.bind(this),
      registeredAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    this.exchanges.set(id, exchange);

    // 初始化健康状态 / Initialize health status
    this.healthStatus.set(id, {
      status: EXCHANGE_STATUS.UNKNOWN,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastCheckTime: null,
      lastSuccessTime: null,
      lastFailureTime: null,
      lastError: null,
    });

    // 初始化延迟统计 / Initialize latency stats
    this.latencyStats.set(id, {
      latencies: [],
      avgLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
    });

    // 初始化错误历史 / Initialize error history
    this.errorHistory.set(id, []);

    // 设置主交易所 / Set primary exchange
    if (isPrimary || this.primaryExchangeId === null) {
      this.primaryExchangeId = id;
    }

    this.log(`注册交易所: ${name} (${id}) 优先级=${priority}`, 'info');
    this.emit('exchangeRegistered', { id, name, priority, isPrimary });
  }

  /**
   * 注销交易所
   * Unregister exchange
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   */
  unregisterExchange(exchangeId) {
    if (!this.exchanges.has(exchangeId)) return;

    // 如果是主交易所，需要先切换 / If primary, need to switch first
    if (this.primaryExchangeId === exchangeId) {
      const nextPrimary = this._findNextPrimary(exchangeId);
      if (nextPrimary) {
        this._performFailover(nextPrimary, FAILOVER_REASON.MANUAL, '主交易所被注销');
      } else {
        this.primaryExchangeId = null;
      }
    }

    this.exchanges.delete(exchangeId);
    this.healthStatus.delete(exchangeId);
    this.latencyStats.delete(exchangeId);
    this.errorHistory.delete(exchangeId);

    this.log(`注销交易所: ${exchangeId}`, 'info');
    this.emit('exchangeUnregistered', { id: exchangeId });
  }

  // ============================================
  // 健康检查 / Health Check
  // ============================================

  /**
   * 执行健康检查
   * Perform health checks
   * @private
   */
  async _performHealthChecks() {
    const checkPromises = [];

    for (const [exchangeId, exchange] of this.exchanges) {
      checkPromises.push(this._checkExchangeHealth(exchangeId, exchange));
    }

    await Promise.allSettled(checkPromises);

    // 检查是否需要故障切换 / Check if failover is needed
    if (this.config.enableAutoFailover) {
      this._checkFailoverNeeded();
    }
  }

  /**
   * 检查单个交易所健康
   * Check single exchange health
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @param {Object} exchange - 交易所对象 / Exchange object
   * @private
   */
  async _checkExchangeHealth(exchangeId, exchange) {
    const health = this.healthStatus.get(exchangeId);
    const startTime = Date.now();

    try {
      // 设置超时 / Set timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('健康检查超时')), this.config.healthCheckTimeout);
      });

      // 执行健康检查 / Execute health check
      const checkPromise = exchange.healthCheckFn(exchange.client);
      await Promise.race([checkPromise, timeoutPromise]);

      // 记录延迟 / Record latency
      const latency = Date.now() - startTime;
      this._recordLatency(exchangeId, latency);

      // 更新健康状态 / Update health status
      health.consecutiveSuccesses++;
      health.consecutiveFailures = 0;
      health.lastCheckTime = Date.now();
      health.lastSuccessTime = Date.now();
      health.lastError = null;

      // 确定状态 / Determine status
      const latencyStats = this.latencyStats.get(exchangeId);
      if (latencyStats.avgLatency > this.config.latencyCriticalThreshold) {
        health.status = EXCHANGE_STATUS.DEGRADED;
      } else if (latencyStats.avgLatency > this.config.latencyWarningThreshold) {
        health.status = EXCHANGE_STATUS.DEGRADED;
      } else {
        health.status = EXCHANGE_STATUS.HEALTHY;
      }

      // 更新活跃时间 / Update active time
      exchange.lastActiveAt = Date.now();

    } catch (error) {
      // 记录错误 / Record error
      const failureType = this._classifyError(error);
      this._recordError(exchangeId, failureType, error.message);

      // 更新健康状态 / Update health status
      health.consecutiveFailures++;
      health.consecutiveSuccesses = 0;
      health.lastCheckTime = Date.now();
      health.lastFailureTime = Date.now();
      health.lastError = {
        type: failureType,
        message: error.message,
        timestamp: Date.now(),
      };

      // 确定状态 / Determine status
      if (health.consecutiveFailures >= this.config.failureThreshold) {
        health.status = EXCHANGE_STATUS.OFFLINE;
      } else if (health.consecutiveFailures >= 1) {
        health.status = EXCHANGE_STATUS.UNHEALTHY;
      }

      this.log(`交易所健康检查失败: ${exchangeId} - ${error.message}`, 'warn');
    }

    // 发出健康状态更新事件 / Emit health status update event
    this.emit('healthStatusUpdated', {
      exchangeId,
      status: health.status,
      latency: this.latencyStats.get(exchangeId).avgLatency,
      consecutiveFailures: health.consecutiveFailures,
    });
  }

  /**
   * 默认健康检查函数
   * Default health check function
   *
   * @param {Object} client - 交易所客户端 / Exchange client
   * @returns {Promise<boolean>} 健康状态 / Health status
   * @private
   */
  async _defaultHealthCheck(client) {
    // 尝试获取服务器时间作为健康检查 / Try to get server time as health check
    if (typeof client.fetchTime === 'function') {
      await client.fetchTime();
      return true;
    }

    // 尝试获取市场信息 / Try to get market info
    if (typeof client.loadMarkets === 'function') {
      await client.loadMarkets();
      return true;
    }

    // 尝试ping / Try ping
    if (typeof client.ping === 'function') {
      await client.ping();
      return true;
    }

    throw new Error('无可用的健康检查方法');
  }

  /**
   * 分类错误类型
   * Classify error type
   *
   * @param {Error} error - 错误对象 / Error object
   * @returns {string} 错误类型 / Error type
   * @private
   */
  _classifyError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('超时')) {
      return FAILURE_TYPE.TIMEOUT;
    }

    if (message.includes('connection') || message.includes('network') ||
        message.includes('econnrefused') || message.includes('enotfound')) {
      return FAILURE_TYPE.CONNECTION;
    }

    if (message.includes('rate') || message.includes('limit') || message.includes('429')) {
      return FAILURE_TYPE.RATE_LIMIT;
    }

    if (message.includes('maintenance') || message.includes('维护')) {
      return FAILURE_TYPE.MAINTENANCE;
    }

    if (message.includes('api') || message.includes('error')) {
      return FAILURE_TYPE.API_ERROR;
    }

    return FAILURE_TYPE.UNKNOWN;
  }

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
  _recordLatency(exchangeId, latency) {
    const stats = this.latencyStats.get(exchangeId);
    if (!stats) return;

    stats.latencies.push(latency);

    // 限制窗口大小 / Limit window size
    if (stats.latencies.length > this.config.latencyWindowSize) {
      stats.latencies.shift();
    }

    // 更新统计 / Update statistics
    stats.avgLatency = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length;
    stats.minLatency = Math.min(stats.minLatency, latency);
    stats.maxLatency = Math.max(stats.maxLatency, latency);
  }

  /**
   * 记录错误
   * Record error
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @param {string} type - 错误类型 / Error type
   * @param {string} message - 错误消息 / Error message
   * @private
   */
  _recordError(exchangeId, type, message) {
    const errors = this.errorHistory.get(exchangeId);
    if (!errors) return;

    errors.push({
      type,
      message,
      timestamp: Date.now(),
    });

    // 限制历史长度 / Limit history length
    if (errors.length > this.config.statsHistoryLength) {
      errors.shift();
    }
  }

  // ============================================
  // 故障切换 / Failover
  // ============================================

  /**
   * 检查是否需要故障切换
   * Check if failover is needed
   * @private
   */
  _checkFailoverNeeded() {
    if (!this.primaryExchangeId) return;

    const primaryHealth = this.healthStatus.get(this.primaryExchangeId);
    if (!primaryHealth) return;

    // 检查主交易所是否不健康 / Check if primary is unhealthy
    if (primaryHealth.status === EXCHANGE_STATUS.OFFLINE ||
        primaryHealth.status === EXCHANGE_STATUS.UNHEALTHY) {

      // 检查冷却时间 / Check cooldown
      const now = Date.now();
      if (now - this.lastFailoverTime < this.config.failoverCooldown) {
        this.log('故障切换冷却中 / Failover in cooldown', 'info');
        return;
      }

      // 找到下一个可用的交易所 / Find next available exchange
      const nextPrimary = this._findNextPrimary(this.primaryExchangeId);

      if (nextPrimary) {
        this._performFailover(nextPrimary, FAILOVER_REASON.AUTO_HEALTH,
          `主交易所状态: ${primaryHealth.status}`);
      } else {
        this.log('无可用的备用交易所 / No available backup exchange', 'error');
        this.emit('noBackupAvailable', { primaryId: this.primaryExchangeId });
      }
    }
  }

  /**
   * 找到下一个主交易所
   * Find next primary exchange
   *
   * @param {string} excludeId - 排除的ID / Excluded ID
   * @returns {string|null} 下一个主交易所ID / Next primary exchange ID
   * @private
   */
  _findNextPrimary(excludeId) {
    let bestCandidate = null;
    let bestPriority = Infinity;

    for (const [id, exchange] of this.exchanges) {
      if (id === excludeId) continue;

      const health = this.healthStatus.get(id);
      if (!health || health.status === EXCHANGE_STATUS.OFFLINE ||
          health.status === EXCHANGE_STATUS.UNHEALTHY) {
        continue;
      }

      if (exchange.priority < bestPriority) {
        bestPriority = exchange.priority;
        bestCandidate = id;
      }
    }

    return bestCandidate;
  }

  /**
   * 执行故障切换
   * Perform failover
   *
   * @param {string} newPrimaryId - 新主交易所ID / New primary exchange ID
   * @param {string} reason - 原因 / Reason
   * @param {string} details - 详情 / Details
   * @private
   */
  _performFailover(newPrimaryId, reason, details = '') {
    const oldPrimaryId = this.primaryExchangeId;
    const now = Date.now();

    // 更新主交易所 / Update primary exchange
    this.primaryExchangeId = newPrimaryId;
    this.lastFailoverTime = now;

    // 记录切换历史 / Record failover history
    const failoverRecord = {
      fromExchange: oldPrimaryId,
      toExchange: newPrimaryId,
      reason,
      details,
      timestamp: now,
    };

    this.failoverHistory.push(failoverRecord);

    // 限制历史长度 / Limit history length
    if (this.failoverHistory.length > this.config.statsHistoryLength) {
      this.failoverHistory.shift();
    }

    this.log(`🔄 故障切换: ${oldPrimaryId} -> ${newPrimaryId} (${reason}: ${details})`, 'warn');

    // 发出切换事件 / Emit failover event
    this.emit('failover', failoverRecord);

    // 如果启用自动恢复，开始监控原主交易所 / If auto recovery enabled, start monitoring original primary
    if (this.config.enableAutoRecovery && oldPrimaryId) {
      this._scheduleRecoveryCheck(oldPrimaryId);
    }
  }

  /**
   * 安排恢复检查
   * Schedule recovery check
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @private
   */
  _scheduleRecoveryCheck(exchangeId) {
    // 取消之前的恢复检查 / Cancel previous recovery check
    if (this.recoveryCheckTimer) {
      clearTimeout(this.recoveryCheckTimer);
    }

    this.recoveryCheckTimer = setTimeout(() => {
      this._checkRecovery(exchangeId);
    }, this.config.recoveryWaitTime);

    this.log(`已安排 ${exchangeId} 的恢复检查`, 'info');
  }

  /**
   * 检查恢复
   * Check recovery
   *
   * @param {string} originalPrimaryId - 原主交易所ID / Original primary exchange ID
   * @private
   */
  async _checkRecovery(originalPrimaryId) {
    const health = this.healthStatus.get(originalPrimaryId);
    if (!health) return;

    // 检查原主交易所是否恢复 / Check if original primary recovered
    if (health.status === EXCHANGE_STATUS.HEALTHY &&
        health.consecutiveSuccesses >= this.config.recoveryThreshold) {

      const originalExchange = this.exchanges.get(originalPrimaryId);
      const currentPrimary = this.exchanges.get(this.primaryExchangeId);

      // 检查原主交易所优先级是否更高 / Check if original has higher priority
      if (originalExchange && currentPrimary &&
          originalExchange.priority < currentPrimary.priority) {

        this._performFailover(originalPrimaryId, FAILOVER_REASON.RECOVERY,
          '原主交易所已恢复');
      }
    } else {
      // 继续安排检查 / Continue scheduling check
      this._scheduleRecoveryCheck(originalPrimaryId);
    }
  }

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 获取当前主交易所
   * Get current primary exchange
   *
   * @returns {Object|null} 主交易所 / Primary exchange
   */
  getPrimary() {
    if (!this.primaryExchangeId) return null;
    return this.exchanges.get(this.primaryExchangeId);
  }

  /**
   * 获取主交易所客户端
   * Get primary exchange client
   *
   * @returns {Object|null} 客户端 / Client
   */
  getPrimaryClient() {
    const primary = this.getPrimary();
    return primary ? primary.client : null;
  }

  /**
   * 获取交易所客户端
   * Get exchange client
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @returns {Object|null} 客户端 / Client
   */
  getClient(exchangeId) {
    const exchange = this.exchanges.get(exchangeId);
    return exchange ? exchange.client : null;
  }

  /**
   * 手动切换主交易所
   * Manual switch primary exchange
   *
   * @param {string} exchangeId - 交易所ID / Exchange ID
   * @returns {boolean} 是否成功 / Success status
   */
  switchTo(exchangeId) {
    if (!this.exchanges.has(exchangeId)) {
      this.log(`交易所不存在: ${exchangeId}`, 'error');
      return false;
    }

    if (exchangeId === this.primaryExchangeId) {
      this.log(`已是主交易所: ${exchangeId}`, 'info');
      return true;
    }

    this._performFailover(exchangeId, FAILOVER_REASON.MANUAL, '手动切换');
    return true;
  }

  /**
   * 带重试的执行
   * Execute with retry
   *
   * @param {Function} fn - 执行函数 / Execute function
   * @param {Object} options - 选项 / Options
   * @returns {Promise<any>} 执行结果 / Execution result
   */
  async executeWithRetry(fn, options = {}) {
    const {
      maxRetries = this.config.maxRetries,
      retryInterval = this.config.retryInterval,
      backoffFactor = this.config.retryBackoffFactor,
      fallbackToBackup = true,
    } = options;

    let lastError;
    let currentInterval = retryInterval;
    const triedExchanges = new Set();

    // 首先尝试主交易所 / First try primary exchange
    let currentExchangeId = this.primaryExchangeId;

    while (true) {
      const exchange = this.exchanges.get(currentExchangeId);
      if (!exchange) {
        throw new Error('无可用交易所 / No available exchange');
      }

      triedExchanges.add(currentExchangeId);

      // 尝试执行 / Try to execute
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await fn(exchange.client, currentExchangeId);
          return result;
        } catch (error) {
          lastError = error;

          // 记录错误 / Record error
          const failureType = this._classifyError(error);
          this._recordError(currentExchangeId, failureType, error.message);

          // 更新健康状态 / Update health status
          const health = this.healthStatus.get(currentExchangeId);
          if (health) {
            health.consecutiveFailures++;
            health.lastError = {
              type: failureType,
              message: error.message,
              timestamp: Date.now(),
            };
          }

          this.log(`执行失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`, 'warn');

          // 如果不是最后一次尝试，等待后重试 / If not last attempt, wait and retry
          if (attempt < maxRetries) {
            await this._sleep(currentInterval);
            currentInterval *= backoffFactor;
          }
        }
      }

      // 主交易所失败，尝试备用 / Primary failed, try backup
      if (fallbackToBackup) {
        currentExchangeId = this._findNextPrimary(currentExchangeId);

        // 排除已尝试的交易所 / Exclude tried exchanges
        while (currentExchangeId && triedExchanges.has(currentExchangeId)) {
          currentExchangeId = this._findNextPrimary(currentExchangeId);
        }

        if (currentExchangeId) {
          this.log(`尝试备用交易所: ${currentExchangeId}`, 'info');
          currentInterval = retryInterval; // 重置重试间隔
          continue;
        }
      }

      // 所有交易所都失败 / All exchanges failed
      throw lastError;
    }
  }

  /**
   * 获取健康状态
   * Get health status
   *
   * @param {string} exchangeId - 交易所ID (可选) / Exchange ID (optional)
   * @returns {Object} 健康状态 / Health status
   */
  getHealthStatus(exchangeId) {
    if (exchangeId) {
      return this.healthStatus.get(exchangeId);
    }

    const statuses = {};
    for (const [id, health] of this.healthStatus) {
      statuses[id] = { ...health };
    }
    return statuses;
  }

  /**
   * 获取延迟统计
   * Get latency statistics
   *
   * @param {string} exchangeId - 交易所ID (可选) / Exchange ID (optional)
   * @returns {Object} 延迟统计 / Latency statistics
   */
  getLatencyStats(exchangeId) {
    if (exchangeId) {
      return this.latencyStats.get(exchangeId);
    }

    const stats = {};
    for (const [id, latency] of this.latencyStats) {
      stats[id] = { ...latency };
    }
    return stats;
  }

  /**
   * 获取故障切换历史
   * Get failover history
   *
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 切换历史 / Failover history
   */
  getFailoverHistory(limit = 50) {
    return this.failoverHistory.slice(-limit);
  }

  /**
   * 获取状态
   * Get status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    const exchangeList = [];
    for (const [id, exchange] of this.exchanges) {
      const health = this.healthStatus.get(id);
      const latency = this.latencyStats.get(id);

      exchangeList.push({
        id,
        name: exchange.name,
        priority: exchange.priority,
        isPrimary: id === this.primaryExchangeId,
        status: health ? health.status : EXCHANGE_STATUS.UNKNOWN,
        avgLatency: latency ? latency.avgLatency : null,
        consecutiveFailures: health ? health.consecutiveFailures : 0,
        lastActiveAt: exchange.lastActiveAt,
      });
    }

    return {
      running: this.running,
      primaryExchangeId: this.primaryExchangeId,
      exchangeCount: this.exchanges.size,
      exchanges: exchangeList.sort((a, b) => a.priority - b.priority),
      lastFailoverTime: this.lastFailoverTime,
      failoverCount: this.failoverHistory.length,
    };
  }

  /**
   * 强制健康检查
   * Force health check
   */
  async forceHealthCheck() {
    await this._performHealthChecks();
  }

  /**
   * 辅助函数: 延迟
   * Helper: Sleep
   *
   * @param {number} ms - 毫秒 / Milliseconds
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    if (!this.config.verbose && level === 'info') return;

    const fullMessage = `${this.config.logPrefix} ${message}`;

    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'info':
      default:
        console.log(fullMessage);
        break;
    }
  }
}

// ============================================
// 导出 / Exports
// ============================================

export { EXCHANGE_STATUS, FAILURE_TYPE, FAILOVER_REASON, DEFAULT_CONFIG };
export default ExchangeFailover;
