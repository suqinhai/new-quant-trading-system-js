/**
 * 熔断器模块
 * Circuit Breaker Module
 *
 * 实现熔断器模式，防止级联故障
 * Implements circuit breaker pattern to prevent cascading failures
 *
 * @module src/risk/CircuitBreaker
 */

import { EventEmitter } from 'events';

/**
 * 熔断器状态
 */
const CircuitState = {
  CLOSED: 'closed',     // 正常状态，允许请求
  OPEN: 'open',         // 熔断状态，拒绝请求
  HALF_OPEN: 'half_open', // 半开状态，允许试探性请求
};

/**
 * 熔断器类
 * Circuit Breaker Class
 */
class CircuitBreaker extends EventEmitter {
  /**
   * @param {Object} config - 配置
   * @param {string} config.name - 熔断器名称
   * @param {number} config.failureThreshold - 失败阈值 (触发熔断)
   * @param {number} config.successThreshold - 成功阈值 (恢复正常)
   * @param {number} config.timeout - 熔断超时时间 (毫秒)
   * @param {number} config.halfOpenMaxCalls - 半开状态最大试探次数
   * @param {Function} config.fallback - 降级函数
   */
  constructor(config = {}) {
    super();

    this.name = config.name || 'default';
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 3,
      timeout: config.timeout || 30000, // 30秒
      halfOpenMaxCalls: config.halfOpenMaxCalls || 3,
      volumeThreshold: config.volumeThreshold || 10, // 最小请求量才计算错误率
      errorRateThreshold: config.errorRateThreshold || 0.5, // 50% 错误率
      fallback: config.fallback || null,
    };

    // 状态
    this.state = CircuitState.CLOSED;
    this.lastStateChange = Date.now();

    // 统计
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      timeoutCalls: 0,
      lastFailure: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };

    // 滑动窗口统计 (用于计算错误率)
    this.window = {
      size: config.windowSize || 60000, // 1分钟窗口
      buckets: [],
      bucketSize: config.bucketSize || 1000, // 1秒一个桶
    };

    // 半开状态计数器
    this.halfOpenCalls = 0;

    // 定时器
    this.timeoutTimer = null;
  }

  /**
   * 执行受保护的操作
   * @param {Function} fn - 要执行的函数
   * @param {...any} args - 函数参数
   * @returns {Promise<any>}
   */
  async execute(fn, ...args) {
    // 检查是否允许执行
    if (!this.canExecute()) {
      this.stats.rejectedCalls++;
      this.emit('rejected', { name: this.name, state: this.state });

      // 使用降级函数
      if (this.config.fallback) {
        return this.config.fallback(...args);
      }

      throw new CircuitBreakerError(
        `Circuit breaker '${this.name}' is ${this.state}`,
        this.state
      );
    }

    const startTime = Date.now();

    try {
      // 执行操作
      const result = await fn(...args);

      // 记录成功
      this.recordSuccess(Date.now() - startTime);

      return result;
    } catch (error) {
      // 记录失败
      this.recordFailure(error, Date.now() - startTime);

      throw error;
    }
  }

  /**
   * 检查是否可以执行
   * @returns {boolean}
   */
  canExecute() {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // 检查是否可以进入半开状态
        if (Date.now() - this.lastStateChange >= this.config.timeout) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        // 限制半开状态的请求数
        if (this.halfOpenCalls < this.config.halfOpenMaxCalls) {
          this.halfOpenCalls++;
          return true;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * 记录成功
   * @param {number} duration - 执行时间
   */
  recordSuccess(duration) {
    this.stats.totalCalls++;
    this.stats.successfulCalls++;
    this.stats.lastSuccess = Date.now();
    this.stats.consecutiveSuccesses++;
    this.stats.consecutiveFailures = 0;

    // 更新滑动窗口
    this.addToBucket(true);

    // 状态转换逻辑
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.stats.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }

    this.emit('success', {
      name: this.name,
      duration,
      state: this.state,
    });
  }

  /**
   * 记录失败
   * @param {Error} error - 错误
   * @param {number} duration - 执行时间
   */
  recordFailure(error, duration) {
    this.stats.totalCalls++;
    this.stats.failedCalls++;
    this.stats.lastFailure = Date.now();
    this.stats.consecutiveFailures++;
    this.stats.consecutiveSuccesses = 0;

    // 更新滑动窗口
    this.addToBucket(false);

    // 检查是否是超时
    if (error.name === 'TimeoutError' || error.code === 'ETIMEDOUT') {
      this.stats.timeoutCalls++;
    }

    this.emit('failure', {
      name: this.name,
      error: error.message,
      duration,
      state: this.state,
    });

    // 状态转换逻辑
    if (this.state === CircuitState.HALF_OPEN) {
      // 半开状态下任何失败都返回开路状态
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      // 检查是否需要熔断
      if (this.shouldTrip()) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * 检查是否应该触发熔断
   * @returns {boolean}
   */
  shouldTrip() {
    // 方式1: 连续失败次数
    if (this.stats.consecutiveFailures >= this.config.failureThreshold) {
      return true;
    }

    // 方式2: 错误率 (需要足够的请求量)
    const windowStats = this.getWindowStats();
    if (windowStats.total >= this.config.volumeThreshold) {
      const errorRate = windowStats.failures / windowStats.total;
      if (errorRate >= this.config.errorRateThreshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * 状态转换
   * @param {string} newState - 新状态
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    // 重置半开计数器
    if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenCalls = 0;
    }

    // 重置连续计数
    if (newState === CircuitState.CLOSED) {
      this.stats.consecutiveFailures = 0;
      this.stats.consecutiveSuccesses = 0;
    }

    this.emit('stateChange', {
      name: this.name,
      from: oldState,
      to: newState,
      timestamp: this.lastStateChange,
    });

    // 熔断触发告警
    if (newState === CircuitState.OPEN) {
      this.emit('trip', {
        name: this.name,
        stats: this.getStats(),
      });
    }

    // 恢复告警
    if (oldState === CircuitState.OPEN && newState === CircuitState.CLOSED) {
      this.emit('reset', {
        name: this.name,
        duration: this.lastStateChange - this.stats.lastFailure,
      });
    }
  }

  /**
   * 添加到滑动窗口桶
   * @param {boolean} success - 是否成功
   */
  addToBucket(success) {
    const now = Date.now();
    const bucketIndex = Math.floor(now / this.window.bucketSize);

    // 清理过期的桶
    const oldestValidBucket = Math.floor((now - this.window.size) / this.window.bucketSize);
    this.window.buckets = this.window.buckets.filter(b => b.index >= oldestValidBucket);

    // 找到或创建当前桶
    let bucket = this.window.buckets.find(b => b.index === bucketIndex);
    if (!bucket) {
      bucket = { index: bucketIndex, successes: 0, failures: 0 };
      this.window.buckets.push(bucket);
    }

    // 更新桶统计
    if (success) {
      bucket.successes++;
    } else {
      bucket.failures++;
    }
  }

  /**
   * 获取滑动窗口统计
   * @returns {{ total: number, successes: number, failures: number }}
   */
  getWindowStats() {
    const now = Date.now();
    const oldestValidBucket = Math.floor((now - this.window.size) / this.window.bucketSize);

    let successes = 0;
    let failures = 0;

    for (const bucket of this.window.buckets) {
      if (bucket.index >= oldestValidBucket) {
        successes += bucket.successes;
        failures += bucket.failures;
      }
    }

    return {
      total: successes + failures,
      successes,
      failures,
    };
  }

  /**
   * 手动打开熔断器
   */
  trip() {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * 手动重置熔断器
   */
  reset() {
    this.transitionTo(CircuitState.CLOSED);
    this.stats.consecutiveFailures = 0;
    this.stats.consecutiveSuccesses = 0;
  }

  /**
   * 获取当前状态
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * 检查是否开路
   * @returns {boolean}
   */
  isOpen() {
    return this.state === CircuitState.OPEN;
  }

  /**
   * 检查是否闭路
   * @returns {boolean}
   */
  isClosed() {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const windowStats = this.getWindowStats();

    return {
      name: this.name,
      state: this.state,
      lastStateChange: this.lastStateChange,
      ...this.stats,
      window: windowStats,
      errorRate: windowStats.total > 0
        ? (windowStats.failures / windowStats.total * 100).toFixed(2) + '%'
        : '0%',
    };
  }
}

/**
 * 熔断器错误类
 */
class CircuitBreakerError extends Error {
  constructor(message, state) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.state = state;
  }
}

/**
 * 熔断器管理器
 * 管理多个熔断器实例
 */
class CircuitBreakerManager extends EventEmitter {
  constructor() {
    super();
    this.breakers = new Map();
  }

  /**
   * 创建或获取熔断器
   * @param {string} name - 熔断器名称
   * @param {Object} config - 配置
   * @returns {CircuitBreaker}
   */
  getBreaker(name, config = {}) {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker({ name, ...config });

      // 转发事件
      breaker.on('trip', (data) => this.emit('trip', data));
      breaker.on('reset', (data) => this.emit('reset', data));
      breaker.on('stateChange', (data) => this.emit('stateChange', data));

      this.breakers.set(name, breaker);
    }

    return this.breakers.get(name);
  }

  /**
   * 执行受保护的操作
   * @param {string} name - 熔断器名称
   * @param {Function} fn - 要执行的函数
   * @param {...any} args - 函数参数
   * @returns {Promise<any>}
   */
  async execute(name, fn, ...args) {
    const breaker = this.getBreaker(name);
    return breaker.execute(fn, ...args);
  }

  /**
   * 获取所有熔断器状态
   * @returns {Object}
   */
  getAllStats() {
    const stats = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * 获取所有开路的熔断器
   * @returns {string[]}
   */
  getOpenBreakers() {
    const open = [];
    for (const [name, breaker] of this.breakers) {
      if (breaker.isOpen()) {
        open.push(name);
      }
    }
    return open;
  }

  /**
   * 重置所有熔断器
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * 移除熔断器
   * @param {string} name - 熔断器名称
   */
  remove(name) {
    this.breakers.delete(name);
  }

  /**
   * 清除所有熔断器
   */
  clear() {
    this.breakers.clear();
  }
}

// 创建默认管理器实例
const defaultManager = new CircuitBreakerManager();

/**
 * 装饰器：为函数添加熔断保护
 * @param {string} name - 熔断器名称
 * @param {Object} config - 熔断器配置
 * @returns {Function}
 */
function withCircuitBreaker(name, config = {}) {
  const breaker = defaultManager.getBreaker(name, config);

  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args) {
      return breaker.execute(originalMethod.bind(this), ...args);
    };

    return descriptor;
  };
}

/**
 * 函数包装器：为函数添加熔断保护
 * @param {Function} fn - 要保护的函数
 * @param {string} name - 熔断器名称
 * @param {Object} config - 熔断器配置
 * @returns {Function}
 */
function wrapWithCircuitBreaker(fn, name, config = {}) {
  const breaker = defaultManager.getBreaker(name, config);

  return async function(...args) {
    return breaker.execute(fn, ...args);
  };
}

export {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerManager,
  CircuitState,
  withCircuitBreaker,
  wrapWithCircuitBreaker,
  defaultManager,
};

export default CircuitBreaker;
