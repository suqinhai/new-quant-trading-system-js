/**
 * 熔断器模块
 * Circuit Breaker Module
 *
 * 实现熔断器模式，防止级联故障
 * Implements circuit breaker pattern to prevent cascading failures
 *
 * @module src/risk/CircuitBreaker
 */

import { EventEmitter } from 'events'; // 导入模块 events

/**
 * 熔断器状态
 */
const CircuitState = { // 定义常量 CircuitState
  CLOSED: 'closed',     // 正常状态，允许请求
  OPEN: 'open',         // 熔断状态，拒绝请求
  HALF_OPEN: 'half_open', // 半开状态，允许试探性请求
}; // 结束代码块

/**
 * 熔断器类
 * Circuit Breaker Class
 */
class CircuitBreaker extends EventEmitter { // 定义类 CircuitBreaker(继承EventEmitter)
  /**
   * @param {Object} config - 配置
   * @param {string} config.name - 熔断器名称
   * @param {number} config.failureThreshold - 失败阈值 (触发熔断)
   * @param {number} config.successThreshold - 成功阈值 (恢复正常)
   * @param {number} config.timeout - 熔断超时时间 (毫秒)
   * @param {number} config.halfOpenMaxCalls - 半开状态最大试探次数
   * @param {Function} config.fallback - 降级函数
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.name = config.name || 'default'; // 设置 name
    this.config = { // 设置 config
      failureThreshold: config.failureThreshold || 5, // 设置 failureThreshold 字段
      successThreshold: config.successThreshold || 3, // 设置 successThreshold 字段
      timeout: config.timeout || 30000, // 30秒
      halfOpenMaxCalls: config.halfOpenMaxCalls || 3, // 设置 halfOpenMaxCalls 字段
      volumeThreshold: config.volumeThreshold || 10, // 最小请求量才计算错误率
      errorRateThreshold: config.errorRateThreshold || 0.5, // 50% 错误率
      fallback: config.fallback || null, // 设置 fallback 字段
    }; // 结束代码块

    // 状态
    this.state = CircuitState.CLOSED; // 设置 state
    this.lastStateChange = Date.now(); // 设置 lastStateChange

    // 统计
    this.stats = { // 设置 stats
      totalCalls: 0, // 设置 totalCalls 字段
      successfulCalls: 0, // 设置 successfulCalls 字段
      failedCalls: 0, // 设置 failedCalls 字段
      rejectedCalls: 0, // 设置 rejectedCalls 字段
      timeoutCalls: 0, // 设置 timeoutCalls 字段
      lastFailure: null, // 设置 lastFailure 字段
      lastSuccess: null, // 设置 lastSuccess 字段
      consecutiveFailures: 0, // 设置 consecutiveFailures 字段
      consecutiveSuccesses: 0, // 设置 consecutiveSuccesses 字段
    }; // 结束代码块

    // 滑动窗口统计 (用于计算错误率)
    this.window = { // 设置 window
      size: config.windowSize || 60000, // 1分钟窗口
      buckets: [], // 设置 buckets 字段
      bucketSize: config.bucketSize || 1000, // 1秒一个桶
    }; // 结束代码块

    // 半开状态计数器
    this.halfOpenCalls = 0; // 设置 halfOpenCalls

    // 定时器
    this.timeoutTimer = null; // 设置 timeoutTimer
  } // 结束代码块

  /**
   * 执行受保护的操作
   * @param {Function} fn - 要执行的函数
   * @param {...any} args - 函数参数
   * @returns {Promise<any>}
   */
  async execute(fn, ...args) { // 执行语句
    // 检查是否允许执行
    if (!this.canExecute()) { // 条件判断 !this.canExecute()
      this.stats.rejectedCalls++; // 访问 stats
      this.emit('rejected', { name: this.name, state: this.state }); // 调用 emit

      // 使用降级函数
      if (this.config.fallback) { // 条件判断 this.config.fallback
        return this.config.fallback(...args); // 返回结果
      } // 结束代码块

      throw new CircuitBreakerError( // 抛出异常
        `Circuit breaker '${this.name}' is ${this.state}`, // 执行语句
        this.state // 访问 state
      ); // 结束调用或参数
    } // 结束代码块

    const startTime = Date.now(); // 定义常量 startTime

    try { // 尝试执行
      // 执行操作
      const result = await fn(...args); // 定义常量 result

      // 记录成功
      this.recordSuccess(Date.now() - startTime); // 调用 recordSuccess

      return result; // 返回结果
    } catch (error) { // 执行语句
      // 记录失败
      this.recordFailure(error, Date.now() - startTime); // 调用 recordFailure

      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查是否可以执行
   * @returns {boolean}
   */
  canExecute() { // 调用 canExecute
    switch (this.state) { // 分支选择 this.state
      case CircuitState.CLOSED: // 分支 CircuitState.CLOSED
        return true; // 返回结果

      case CircuitState.OPEN: // 分支 CircuitState.OPEN
        // 检查是否可以进入半开状态
        if (Date.now() - this.lastStateChange >= this.config.timeout) { // 条件判断 Date.now() - this.lastStateChange >= this.con...
          this.transitionTo(CircuitState.HALF_OPEN); // 调用 transitionTo
          return true; // 返回结果
        } // 结束代码块
        return false; // 返回结果

      case CircuitState.HALF_OPEN: // 分支 CircuitState.HALF_OPEN
        // 限制半开状态的请求数
        if (this.halfOpenCalls < this.config.halfOpenMaxCalls) { // 条件判断 this.halfOpenCalls < this.config.halfOpenMaxC...
          this.halfOpenCalls++; // 访问 halfOpenCalls
          return true; // 返回结果
        } // 结束代码块
        return false; // 返回结果

      default: // 默认分支
        return false; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录成功
   * @param {number} duration - 执行时间
   */
  recordSuccess(duration) { // 调用 recordSuccess
    this.stats.totalCalls++; // 访问 stats
    this.stats.successfulCalls++; // 访问 stats
    this.stats.lastSuccess = Date.now(); // 访问 stats
    this.stats.consecutiveSuccesses++; // 访问 stats
    this.stats.consecutiveFailures = 0; // 访问 stats

    // 更新滑动窗口
    this.addToBucket(true); // 调用 addToBucket

    // 状态转换逻辑
    if (this.state === CircuitState.HALF_OPEN) { // 条件判断 this.state === CircuitState.HALF_OPEN
      if (this.stats.consecutiveSuccesses >= this.config.successThreshold) { // 条件判断 this.stats.consecutiveSuccesses >= this.confi...
        this.transitionTo(CircuitState.CLOSED); // 调用 transitionTo
      } // 结束代码块
    } // 结束代码块

    this.emit('success', { // 调用 emit
      name: this.name, // 设置 name 字段
      duration, // 执行语句
      state: this.state, // 设置 state 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录失败
   * @param {Error} error - 错误
   * @param {number} duration - 执行时间
   */
  recordFailure(error, duration) { // 调用 recordFailure
    this.stats.totalCalls++; // 访问 stats
    this.stats.failedCalls++; // 访问 stats
    this.stats.lastFailure = Date.now(); // 访问 stats
    this.stats.consecutiveFailures++; // 访问 stats
    this.stats.consecutiveSuccesses = 0; // 访问 stats

    // 更新滑动窗口
    this.addToBucket(false); // 调用 addToBucket

    // 检查是否是超时
    if (error.name === 'TimeoutError' || error.code === 'ETIMEDOUT') { // 条件判断 error.name === 'TimeoutError' || error.code =...
      this.stats.timeoutCalls++; // 访问 stats
    } // 结束代码块

    this.emit('failure', { // 调用 emit
      name: this.name, // 设置 name 字段
      error: error.message, // 设置 error 字段
      duration, // 执行语句
      state: this.state, // 设置 state 字段
    }); // 结束代码块

    // 状态转换逻辑
    if (this.state === CircuitState.HALF_OPEN) { // 条件判断 this.state === CircuitState.HALF_OPEN
      // 半开状态下任何失败都返回开路状态
      this.transitionTo(CircuitState.OPEN); // 调用 transitionTo
    } else if (this.state === CircuitState.CLOSED) { // 执行语句
      // 检查是否需要熔断
      if (this.shouldTrip()) { // 条件判断 this.shouldTrip()
        this.transitionTo(CircuitState.OPEN); // 调用 transitionTo
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查是否应该触发熔断
   * @returns {boolean}
   */
  shouldTrip() { // 调用 shouldTrip
    // 方式1: 连续失败次数
    if (this.stats.consecutiveFailures >= this.config.failureThreshold) { // 条件判断 this.stats.consecutiveFailures >= this.config...
      return true; // 返回结果
    } // 结束代码块

    // 方式2: 错误率 (需要足够的请求量)
    const windowStats = this.getWindowStats(); // 定义常量 windowStats
    if (windowStats.total >= this.config.volumeThreshold) { // 条件判断 windowStats.total >= this.config.volumeThreshold
      const errorRate = windowStats.failures / windowStats.total; // 定义常量 errorRate
      if (errorRate >= this.config.errorRateThreshold) { // 条件判断 errorRate >= this.config.errorRateThreshold
        return true; // 返回结果
      } // 结束代码块
    } // 结束代码块

    return false; // 返回结果
  } // 结束代码块

  /**
   * 状态转换
   * @param {string} newState - 新状态
   */
  transitionTo(newState) { // 调用 transitionTo
    const oldState = this.state; // 定义常量 oldState
    this.state = newState; // 设置 state
    this.lastStateChange = Date.now(); // 设置 lastStateChange

    // 重置半开计数器
    if (newState === CircuitState.HALF_OPEN) { // 条件判断 newState === CircuitState.HALF_OPEN
      this.halfOpenCalls = 0; // 设置 halfOpenCalls
    } // 结束代码块

    // 重置连续计数
    if (newState === CircuitState.CLOSED) { // 条件判断 newState === CircuitState.CLOSED
      this.stats.consecutiveFailures = 0; // 访问 stats
      this.stats.consecutiveSuccesses = 0; // 访问 stats
    } // 结束代码块

    this.emit('stateChange', { // 调用 emit
      name: this.name, // 设置 name 字段
      from: oldState, // 设置 from 字段
      to: newState, // 设置 to 字段
      timestamp: this.lastStateChange, // 设置 timestamp 字段
    }); // 结束代码块

    // 熔断触发告警
    if (newState === CircuitState.OPEN) { // 条件判断 newState === CircuitState.OPEN
      this.emit('trip', { // 调用 emit
        name: this.name, // 设置 name 字段
        stats: this.getStats(), // 设置 stats 字段
      }); // 结束代码块
    } // 结束代码块

    // 恢复告警
    if (oldState === CircuitState.OPEN && newState === CircuitState.CLOSED) { // 条件判断 oldState === CircuitState.OPEN && newState ==...
      this.emit('reset', { // 调用 emit
        name: this.name, // 设置 name 字段
        duration: this.lastStateChange - this.stats.lastFailure, // 设置 duration 字段
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 添加到滑动窗口桶
   * @param {boolean} success - 是否成功
   */
  addToBucket(success) { // 调用 addToBucket
    const now = Date.now(); // 定义常量 now
    const bucketIndex = Math.floor(now / this.window.bucketSize); // 定义常量 bucketIndex

    // 清理过期的桶
    const oldestValidBucket = Math.floor((now - this.window.size) / this.window.bucketSize); // 定义常量 oldestValidBucket
    this.window.buckets = this.window.buckets.filter(b => b.index >= oldestValidBucket); // 访问 window

    // 找到或创建当前桶
    let bucket = this.window.buckets.find(b => b.index === bucketIndex); // 定义函数 bucket
    if (!bucket) { // 条件判断 !bucket
      bucket = { index: bucketIndex, successes: 0, failures: 0 }; // 赋值 bucket
      this.window.buckets.push(bucket); // 访问 window
    } // 结束代码块

    // 更新桶统计
    if (success) { // 条件判断 success
      bucket.successes++; // 执行语句
    } else { // 执行语句
      bucket.failures++; // 执行语句
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取滑动窗口统计
   * @returns {{ total: number, successes: number, failures: number }}
   */
  getWindowStats() { // 调用 getWindowStats
    const now = Date.now(); // 定义常量 now
    const oldestValidBucket = Math.floor((now - this.window.size) / this.window.bucketSize); // 定义常量 oldestValidBucket

    let successes = 0; // 定义变量 successes
    let failures = 0; // 定义变量 failures

    for (const bucket of this.window.buckets) { // 循环 const bucket of this.window.buckets
      if (bucket.index >= oldestValidBucket) { // 条件判断 bucket.index >= oldestValidBucket
        successes += bucket.successes; // 执行语句
        failures += bucket.failures; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return { // 返回结果
      total: successes + failures, // 设置 total 字段
      successes, // 执行语句
      failures, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 手动打开熔断器
   */
  trip() { // 调用 trip
    this.transitionTo(CircuitState.OPEN); // 调用 transitionTo
  } // 结束代码块

  /**
   * 手动重置熔断器
   */
  reset() { // 调用 reset
    this.transitionTo(CircuitState.CLOSED); // 调用 transitionTo
    this.stats.consecutiveFailures = 0; // 访问 stats
    this.stats.consecutiveSuccesses = 0; // 访问 stats
  } // 结束代码块

  /**
   * 获取当前状态
   * @returns {string}
   */
  getState() { // 调用 getState
    return this.state; // 返回结果
  } // 结束代码块

  /**
   * 检查是否开路
   * @returns {boolean}
   */
  isOpen() { // 调用 isOpen
    return this.state === CircuitState.OPEN; // 返回结果
  } // 结束代码块

  /**
   * 检查是否闭路
   * @returns {boolean}
   */
  isClosed() { // 调用 isClosed
    return this.state === CircuitState.CLOSED; // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() { // 调用 getStats
    const windowStats = this.getWindowStats(); // 定义常量 windowStats

    return { // 返回结果
      name: this.name, // 设置 name 字段
      state: this.state, // 设置 state 字段
      lastStateChange: this.lastStateChange, // 设置 lastStateChange 字段
      ...this.stats, // 展开对象或数组
      window: windowStats, // 设置 window 字段
      errorRate: windowStats.total > 0 // 设置 errorRate 字段
        ? (windowStats.failures / windowStats.total * 100).toFixed(2) + '%' // 执行语句
        : '0%', // 执行语句
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 熔断器错误类
 */
class CircuitBreakerError extends Error { // 定义类 CircuitBreakerError(继承Error)
  constructor(message, state) { // 构造函数
    super(message); // 调用父类
    this.name = 'CircuitBreakerError'; // 设置 name
    this.state = state; // 设置 state
  } // 结束代码块
} // 结束代码块

/**
 * 熔断器管理器
 * 管理多个熔断器实例
 */
class CircuitBreakerManager extends EventEmitter { // 定义类 CircuitBreakerManager(继承EventEmitter)
  constructor() { // 构造函数
    super(); // 调用父类
    this.breakers = new Map(); // 设置 breakers
  } // 结束代码块

  /**
   * 创建或获取熔断器
   * @param {string} name - 熔断器名称
   * @param {Object} config - 配置
   * @returns {CircuitBreaker}
   */
  getBreaker(name, config = {}) { // 调用 getBreaker
    if (!this.breakers.has(name)) { // 条件判断 !this.breakers.has(name)
      const breaker = new CircuitBreaker({ name, ...config }); // 定义常量 breaker

      // 转发事件
      breaker.on('trip', (data) => this.emit('trip', data)); // 触发事件
      breaker.on('reset', (data) => this.emit('reset', data)); // 触发事件
      breaker.on('stateChange', (data) => this.emit('stateChange', data)); // 触发事件

      this.breakers.set(name, breaker); // 访问 breakers
    } // 结束代码块

    return this.breakers.get(name); // 返回结果
  } // 结束代码块

  /**
   * 执行受保护的操作
   * @param {string} name - 熔断器名称
   * @param {Function} fn - 要执行的函数
   * @param {...any} args - 函数参数
   * @returns {Promise<any>}
   */
  async execute(name, fn, ...args) { // 执行语句
    const breaker = this.getBreaker(name); // 定义常量 breaker
    return breaker.execute(fn, ...args); // 返回结果
  } // 结束代码块

  /**
   * 获取所有熔断器状态
   * @returns {Object}
   */
  getAllStats() { // 调用 getAllStats
    const stats = {}; // 定义常量 stats
    for (const [name, breaker] of this.breakers) { // 循环 const [name, breaker] of this.breakers
      stats[name] = breaker.getStats(); // 执行语句
    } // 结束代码块
    return stats; // 返回结果
  } // 结束代码块

  /**
   * 获取所有开路的熔断器
   * @returns {string[]}
   */
  getOpenBreakers() { // 调用 getOpenBreakers
    const open = []; // 定义常量 open
    for (const [name, breaker] of this.breakers) { // 循环 const [name, breaker] of this.breakers
      if (breaker.isOpen()) { // 条件判断 breaker.isOpen()
        open.push(name); // 调用 open.push
      } // 结束代码块
    } // 结束代码块
    return open; // 返回结果
  } // 结束代码块

  /**
   * 重置所有熔断器
   */
  resetAll() { // 调用 resetAll
    for (const breaker of this.breakers.values()) { // 循环 const breaker of this.breakers.values()
      breaker.reset(); // 调用 breaker.reset
    } // 结束代码块
  } // 结束代码块

  /**
   * 移除熔断器
   * @param {string} name - 熔断器名称
   */
  remove(name) { // 调用 remove
    this.breakers.delete(name); // 访问 breakers
  } // 结束代码块

  /**
   * 清除所有熔断器
   */
  clear() { // 调用 clear
    this.breakers.clear(); // 访问 breakers
  } // 结束代码块
} // 结束代码块

// 创建默认管理器实例
const defaultManager = new CircuitBreakerManager(); // 定义常量 defaultManager

/**
 * 装饰器：为函数添加熔断保护
 * @param {string} name - 熔断器名称
 * @param {Object} config - 熔断器配置
 * @returns {Function}
 */
function withCircuitBreaker(name, config = {}) { // 定义函数 withCircuitBreaker
  const breaker = defaultManager.getBreaker(name, config); // 定义常量 breaker

  return function(target, propertyKey, descriptor) { // 返回结果
    const originalMethod = descriptor.value; // 定义常量 originalMethod

    descriptor.value = async function(...args) { // 赋值 descriptor.value
      return breaker.execute(originalMethod.bind(this), ...args); // 返回结果
    }; // 结束代码块

    return descriptor; // 返回结果
  }; // 结束代码块
} // 结束代码块

/**
 * 函数包装器：为函数添加熔断保护
 * @param {Function} fn - 要保护的函数
 * @param {string} name - 熔断器名称
 * @param {Object} config - 熔断器配置
 * @returns {Function}
 */
function wrapWithCircuitBreaker(fn, name, config = {}) { // 定义函数 wrapWithCircuitBreaker
  const breaker = defaultManager.getBreaker(name, config); // 定义常量 breaker

  return async function(...args) { // 返回结果
    return breaker.execute(fn, ...args); // 返回结果
  }; // 结束代码块
} // 结束代码块

export { // 导出命名成员
  CircuitBreaker, // 执行语句
  CircuitBreakerError, // 执行语句
  CircuitBreakerManager, // 执行语句
  CircuitState, // 执行语句
  withCircuitBreaker, // 执行语句
  wrapWithCircuitBreaker, // 执行语句
  defaultManager, // 执行语句
}; // 结束代码块

export default CircuitBreaker; // 默认导出
