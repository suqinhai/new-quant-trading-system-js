/**
 * 请求追踪中间件
 * Request Tracing Middleware
 *
 * 提供 Request ID 追踪、请求上下文管理和性能监控
 * Provides Request ID tracing, request context management and performance monitoring
 *
 * @module src/middleware/requestTracing
 */

import { AsyncLocalStorage } from 'async_hooks'; // 导入模块 async_hooks
import { randomUUID } from 'crypto'; // 导入模块 crypto
import { EventEmitter } from 'events'; // 导入模块 events

// ============================================
// 请求上下文存储
// ============================================

/**
 * 异步本地存储，用于在整个请求生命周期中传递上下文
 * AsyncLocalStorage for propagating context throughout request lifecycle
 */
const asyncLocalStorage = new AsyncLocalStorage(); // 定义常量 asyncLocalStorage

/**
 * 请求上下文类
 * Request Context Class
 */
export class RequestContext { // 导出类 RequestContext
  constructor(options = {}) { // 构造函数
    // 请求 ID / Request ID
    this.requestId = options.requestId || RequestContext.generateId(); // 设置 requestId

    // 追踪 ID (用于跨服务追踪，预留) / Trace ID (for cross-service tracing, reserved)
    this.traceId = options.traceId || this.requestId; // 设置 traceId

    // Span ID (当前操作标识) / Span ID (current operation identifier)
    this.spanId = options.spanId || RequestContext.generateSpanId(); // 设置 spanId

    // 父 Span ID / Parent Span ID
    this.parentSpanId = options.parentSpanId || null; // 设置 parentSpanId

    // 请求开始时间 / Request start time
    this.startTime = options.startTime || Date.now(); // 设置 startTime
    this.startHrTime = options.startHrTime || process.hrtime.bigint(); // 设置 startHrTime

    // 请求元数据 / Request metadata
    this.method = options.method || ''; // 设置 method
    this.path = options.path || ''; // 设置 path
    this.userAgent = options.userAgent || ''; // 设置 userAgent
    this.ip = options.ip || ''; // 设置 ip
    this.userId = options.userId || null; // 设置 userId

    // 自定义属性 / Custom attributes
    this.attributes = new Map(); // 设置 attributes

    // 事件/日志记录 / Events/logs
    this.events = []; // 设置 events

    // 子 Span 列表 / Child spans
    this.spans = []; // 设置 spans
  } // 结束代码块

  /**
   * 生成请求 ID
   */
  static generateId() { // 执行语句
    const timestamp = Date.now().toString(36); // 定义常量 timestamp
    const random = randomUUID().split('-')[0]; // 定义常量 random
    return `req_${timestamp}_${random}`; // 返回结果
  } // 结束代码块

  /**
   * 生成 Span ID
   */
  static generateSpanId() { // 执行语句
    return randomUUID().split('-').slice(0, 2).join(''); // 返回结果
  } // 结束代码块

  /**
   * 设置属性
   */
  setAttribute(key, value) { // 调用 setAttribute
    this.attributes.set(key, value); // 访问 attributes
    return this; // 返回结果
  } // 结束代码块

  /**
   * 获取属性
   */
  getAttribute(key) { // 调用 getAttribute
    return this.attributes.get(key); // 返回结果
  } // 结束代码块

  /**
   * 添加事件
   */
  addEvent(name, attributes = {}) { // 调用 addEvent
    this.events.push({ // 访问 events
      name, // 执行语句
      timestamp: Date.now(), // 时间戳
      attributes, // 执行语句
    }); // 结束代码块
    return this; // 返回结果
  } // 结束代码块

  /**
   * 创建子 Span
   */
  createSpan(name) { // 调用 createSpan
    const span = new Span({ // 定义常量 span
      name, // 执行语句
      traceId: this.traceId, // traceID
      parentSpanId: this.spanId, // parentSpanID
      requestId: this.requestId, // requestID
    }); // 结束代码块
    this.spans.push(span); // 访问 spans
    return span; // 返回结果
  } // 结束代码块

  /**
   * 获取请求耗时 (毫秒)
   */
  getDuration() { // 调用 getDuration
    return Date.now() - this.startTime; // 返回结果
  } // 结束代码块

  /**
   * 获取高精度耗时 (纳秒)
   */
  getDurationNanos() { // 调用 getDurationNanos
    return Number(process.hrtime.bigint() - this.startHrTime); // 返回结果
  } // 结束代码块

  /**
   * 转换为日志友好格式
   */
  toLogContext() { // 调用 toLogContext
    return { // 返回结果
      requestId: this.requestId, // requestID
      traceId: this.traceId, // traceID
      spanId: this.spanId, // spanID
      method: this.method, // method
      path: this.path, // 路径
      userId: this.userId, // 用户ID
      duration: this.getDuration(), // duration
    }; // 结束代码块
  } // 结束代码块

  /**
   * 转换为 JSON
   */
  toJSON() { // 调用 toJSON
    return { // 返回结果
      requestId: this.requestId, // requestID
      traceId: this.traceId, // traceID
      spanId: this.spanId, // spanID
      parentSpanId: this.parentSpanId, // parentSpanID
      method: this.method, // method
      path: this.path, // 路径
      ip: this.ip, // ip
      userId: this.userId, // 用户ID
      startTime: this.startTime, // 启动时间
      duration: this.getDuration(), // duration
      attributes: Object.fromEntries(this.attributes), // attributes
      events: this.events, // events
      spans: this.spans.map(s => s.toJSON()), // spans
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * Span 类 - 表示一个操作单元
 * Span Class - Represents an operation unit
 */
export class Span { // 导出类 Span
  constructor(options = {}) { // 构造函数
    this.name = options.name || 'unknown'; // 设置 name
    this.traceId = options.traceId; // 设置 traceId
    this.spanId = RequestContext.generateSpanId(); // 设置 spanId
    this.parentSpanId = options.parentSpanId; // 设置 parentSpanId
    this.requestId = options.requestId; // 设置 requestId
    this.startTime = Date.now(); // 设置 startTime
    this.startHrTime = process.hrtime.bigint(); // 设置 startHrTime
    this.endTime = null; // 设置 endTime
    this.status = 'ok'; // ok, error
    this.attributes = new Map(); // 设置 attributes
    this.events = []; // 设置 events
  } // 结束代码块

  setAttribute(key, value) { // 调用 setAttribute
    this.attributes.set(key, value); // 访问 attributes
    return this; // 返回结果
  } // 结束代码块

  addEvent(name, attributes = {}) { // 调用 addEvent
    this.events.push({ // 访问 events
      name, // 执行语句
      timestamp: Date.now(), // 时间戳
      attributes, // 执行语句
    }); // 结束代码块
    return this; // 返回结果
  } // 结束代码块

  setError(error) { // 调用 setError
    this.status = 'error'; // 设置 status
    this.setAttribute('error.type', error.name || 'Error'); // 调用 setAttribute
    this.setAttribute('error.message', error.message); // 调用 setAttribute
    if (error.stack) { // 条件判断 error.stack
      this.setAttribute('error.stack', error.stack); // 调用 setAttribute
    } // 结束代码块
    return this; // 返回结果
  } // 结束代码块

  end() { // 调用 end
    this.endTime = Date.now(); // 设置 endTime
    return this; // 返回结果
  } // 结束代码块

  getDuration() { // 调用 getDuration
    const end = this.endTime || Date.now(); // 定义常量 end
    return end - this.startTime; // 返回结果
  } // 结束代码块

  toJSON() { // 调用 toJSON
    return { // 返回结果
      name: this.name, // name
      traceId: this.traceId, // traceID
      spanId: this.spanId, // spanID
      parentSpanId: this.parentSpanId, // parentSpanID
      startTime: this.startTime, // 启动时间
      endTime: this.endTime, // end时间
      duration: this.getDuration(), // duration
      status: this.status, // 状态
      attributes: Object.fromEntries(this.attributes), // attributes
      events: this.events, // events
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 追踪管理器
// ============================================

/**
 * 请求追踪管理器
 * Request Tracing Manager
 */
export class RequestTracingManager extends EventEmitter { // 导出类 RequestTracingManager
  constructor(config = {}) { // 构造函数
    super(); // 调用父类
    this.config = { // 设置 config
      // 是否启用追踪 / Enable tracing
      enabled: config.enabled !== false, // 启用

      // 请求 ID 头名称 / Request ID header name
      requestIdHeader: config.requestIdHeader || 'x-request-id', // 请求 ID 头名称

      // 追踪 ID 头名称 / Trace ID header name
      traceIdHeader: config.traceIdHeader || 'x-trace-id', // 追踪 ID 头名称

      // 是否记录请求体 / Log request body
      logRequestBody: config.logRequestBody || false, // 日志RequestBody

      // 是否记录响应体 / Log response body
      logResponseBody: config.logResponseBody || false, // 日志ResponseBody

      // 慢请求阈值 (ms) / Slow request threshold (ms)
      slowRequestThreshold: config.slowRequestThreshold || 1000, // 慢请求阈值 (ms)

      // 排除的路径 / Excluded paths
      excludePaths: config.excludePaths || ['/api/health', '/favicon.ico'], // excludePaths

      // 敏感字段（不记录） / Sensitive fields (not logged)
      sensitiveFields: config.sensitiveFields || ['password', 'token', 'secret', 'apiKey', 'authorization'], // 敏感字段（不记录）

      ...config, // 展开对象或数组
    }; // 结束代码块

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalRequests: 0, // 总Requests
      activeRequests: 0, // 活跃Requests
      slowRequests: 0, // slowRequests
      errorRequests: 0, // 错误Requests
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取当前请求上下文
   * Get current request context
   */
  static getContext() { // 执行语句
    return asyncLocalStorage.getStore(); // 返回结果
  } // 结束代码块

  /**
   * 获取当前请求 ID
   * Get current request ID
   */
  static getRequestId() { // 执行语句
    const context = RequestTracingManager.getContext(); // 定义常量 context
    return context?.requestId || null; // 返回结果
  } // 结束代码块

  /**
   * 在上下文中运行函数
   * Run function within context
   */
  static runWithContext(context, fn) { // 执行语句
    return asyncLocalStorage.run(context, fn); // 返回结果
  } // 结束代码块

  /**
   * 创建 Express 中间件
   * Create Express middleware
   */
  middleware() { // 调用 middleware
    return (req, res, next) => { // 返回结果
      if (!this.config.enabled) { // 条件判断 !this.config.enabled
        return next(); // 返回结果
      } // 结束代码块

      // 检查是否排除的路径
      if (this.config.excludePaths.some(p => req.path.startsWith(p))) { // 条件判断 this.config.excludePaths.some(p => req.path.s...
        return next(); // 返回结果
      } // 结束代码块

      // 创建请求上下文
      const context = new RequestContext({ // 定义常量 context
        requestId: req.headers[this.config.requestIdHeader] || undefined, // requestID
        traceId: req.headers[this.config.traceIdHeader] || undefined, // traceID
        method: req.method, // method
        path: req.path, // 路径
        userAgent: req.headers['user-agent'], // 用户Agent
        ip: req.ip || req.connection?.remoteAddress, // ip
      }); // 结束代码块

      // 设置响应头
      res.setHeader('X-Request-ID', context.requestId); // 调用 res.setHeader
      res.setHeader('X-Trace-ID', context.traceId); // 调用 res.setHeader

      // 将上下文附加到请求对象
      req.context = context; // 赋值 req.context
      req.requestId = context.requestId; // 赋值 req.requestId

      // 更新统计
      this.stats.totalRequests++; // 访问 stats
      this.stats.activeRequests++; // 访问 stats

      // 记录请求开始
      this.emit('requestStart', { // 调用 emit
        requestId: context.requestId, // requestID
        method: req.method, // method
        path: req.path, // 路径
        query: req.query, // query
        ip: context.ip, // ip
        userAgent: context.userAgent, // 用户Agent
      }); // 结束代码块

      // 监听响应完成
      res.on('finish', () => { // 注册事件监听
        this.stats.activeRequests--; // 访问 stats

        const duration = context.getDuration(); // 定义常量 duration
        context.setAttribute('http.status_code', res.statusCode); // 调用 context.setAttribute
        context.setAttribute('http.response_size', res.get('content-length') || 0); // 调用 context.setAttribute

        // 检查慢请求
        if (duration > this.config.slowRequestThreshold) { // 条件判断 duration > this.config.slowRequestThreshold
          this.stats.slowRequests++; // 访问 stats
          context.addEvent('slow_request', { duration, threshold: this.config.slowRequestThreshold }); // 调用 context.addEvent
          this.emit('slowRequest', { // 调用 emit
            requestId: context.requestId, // requestID
            method: req.method, // method
            path: req.path, // 路径
            duration, // 执行语句
            statusCode: res.statusCode, // 状态代码
          }); // 结束代码块
        } // 结束代码块

        // 检查错误
        if (res.statusCode >= 400) { // 条件判断 res.statusCode >= 400
          this.stats.errorRequests++; // 访问 stats
        } // 结束代码块

        // 记录请求完成
        this.emit('requestEnd', { // 调用 emit
          requestId: context.requestId, // requestID
          method: req.method, // method
          path: req.path, // 路径
          statusCode: res.statusCode, // 状态代码
          duration, // 执行语句
          userId: context.userId, // 用户ID
        }); // 结束代码块
      }); // 结束代码块

      // 在上下文中运行后续中间件
      asyncLocalStorage.run(context, () => { // 调用 asyncLocalStorage.run
        next(); // 调用 next
      }); // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 创建 Span 追踪装饰器
   * Create span tracing decorator
   */
  traceFunction(name, fn) { // 调用 traceFunction
    return async (...args) => { // 返回结果
      const context = RequestTracingManager.getContext(); // 定义常量 context
      if (!context) { // 条件判断 !context
        return fn(...args); // 返回结果
      } // 结束代码块

      const span = context.createSpan(name); // 定义常量 span
      try { // 尝试执行
        const result = await fn(...args); // 定义常量 result
        span.end(); // 调用 span.end
        return result; // 返回结果
      } catch (error) { // 执行语句
        span.setError(error); // 调用 span.setError
        span.end(); // 调用 span.end
        throw error; // 抛出异常
      } // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取统计信息
   */
  getStats() { // 调用 getStats
    return { ...this.stats }; // 返回结果
  } // 结束代码块

  /**
   * 重置统计
   */
  resetStats() { // 调用 resetStats
    this.stats = { // 设置 stats
      totalRequests: 0, // 总Requests
      activeRequests: 0, // 活跃Requests
      slowRequests: 0, // slowRequests
      errorRequests: 0, // 错误Requests
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 上下文感知日志包装器
// ============================================

/**
 * 创建上下文感知日志记录器
 * Create context-aware logger
 *
 * @param {Object} baseLogger - 基础日志记录器 (Winston logger)
 * @returns {Object} 包装后的日志记录器
 */
export function createContextLogger(baseLogger) { // 导出函数 createContextLogger
  const wrapMethod = (method) => { // 定义函数 wrapMethod
    return (message, meta = {}) => { // 返回结果
      const context = RequestTracingManager.getContext(); // 定义常量 context
      const contextMeta = context ? { // 定义常量 contextMeta
        requestId: context.requestId, // requestID
        traceId: context.traceId, // traceID
        spanId: context.spanId, // spanID
        userId: context.userId, // 用户ID
      } : {}; // 执行语句

      baseLogger[method](message, { ...contextMeta, ...meta }); // 执行语句
    }; // 结束代码块
  }; // 结束代码块

  return { // 返回结果
    error: wrapMethod('error'), // 错误
    warn: wrapMethod('warn'), // warn
    info: wrapMethod('info'), // info
    http: wrapMethod('http'), // http
    verbose: wrapMethod('verbose'), // 详细日志
    debug: wrapMethod('debug'), // debug
    silly: wrapMethod('silly'), // silly

    // 直接访问基础日志记录器
    _base: baseLogger, // 直接访问基础日志记录器

    // 创建子日志记录器
    child: (defaultMeta = {}) => { // 创建子日志记录器
      return createContextLogger(baseLogger.child(defaultMeta)); // 返回结果
    }, // 结束代码块

    // 手动设置上下文
    withContext: (additionalContext) => { // withContext
      return { // 返回结果
        error: (msg, meta = {}) => wrapMethod('error')(msg, { ...additionalContext, ...meta }), // 错误
        warn: (msg, meta = {}) => wrapMethod('warn')(msg, { ...additionalContext, ...meta }), // warn
        info: (msg, meta = {}) => wrapMethod('info')(msg, { ...additionalContext, ...meta }), // info
        debug: (msg, meta = {}) => wrapMethod('debug')(msg, { ...additionalContext, ...meta }), // debug
      }; // 结束代码块
    }, // 结束代码块
  }; // 结束代码块
} // 结束代码块

// ============================================
// 辅助函数
// ============================================

/**
 * 获取当前请求上下文
 */
export function getContext() { // 导出函数 getContext
  return RequestTracingManager.getContext(); // 返回结果
} // 结束代码块

/**
 * 获取当前请求 ID
 */
export function getRequestId() { // 导出函数 getRequestId
  return RequestTracingManager.getRequestId(); // 返回结果
} // 结束代码块

/**
 * 在请求上下文中设置用户 ID
 */
export function setUserId(userId) { // 导出函数 setUserId
  const context = getContext(); // 定义常量 context
  if (context) { // 条件判断 context
    context.userId = userId; // 赋值 context.userId
  } // 结束代码块
} // 结束代码块

/**
 * 添加自定义属性到当前上下文
 */
export function addAttribute(key, value) { // 导出函数 addAttribute
  const context = getContext(); // 定义常量 context
  if (context) { // 条件判断 context
    context.setAttribute(key, value); // 调用 context.setAttribute
  } // 结束代码块
} // 结束代码块

/**
 * 添加事件到当前上下文
 */
export function addEvent(name, attributes = {}) { // 导出函数 addEvent
  const context = getContext(); // 定义常量 context
  if (context) { // 条件判断 context
    context.addEvent(name, attributes); // 调用 context.addEvent
  } // 结束代码块
} // 结束代码块

/**
 * 创建子 Span
 */
export function createSpan(name) { // 导出函数 createSpan
  const context = getContext(); // 定义常量 context
  if (context) { // 条件判断 context
    return context.createSpan(name); // 返回结果
  } // 结束代码块
  return null; // 返回结果
} // 结束代码块

/**
 * 追踪异步函数执行
 */
export async function traceAsync(name, fn) { // 导出函数 traceAsync
  const span = createSpan(name); // 定义常量 span
  if (!span) { // 条件判断 !span
    return fn(); // 返回结果
  } // 结束代码块

  try { // 尝试执行
    const result = await fn(); // 定义常量 result
    span.end(); // 调用 span.end
    return result; // 返回结果
  } catch (error) { // 执行语句
    span.setError(error); // 调用 span.setError
    span.end(); // 调用 span.end
    throw error; // 抛出异常
  } // 结束代码块
} // 结束代码块

// ============================================
// 默认实例
// ============================================

/**
 * 默认追踪管理器实例
 */
export const defaultTracingManager = new RequestTracingManager(); // 导出常量 defaultTracingManager

/**
 * 创建追踪中间件
 */
export function createTracingMiddleware(config = {}) { // 导出函数 createTracingMiddleware
  const manager = new RequestTracingManager(config); // 定义常量 manager
  return manager.middleware(); // 返回结果
} // 结束代码块

// 默认导出
export default { // 默认导出
  RequestContext, // 执行语句
  Span, // 执行语句
  RequestTracingManager, // 执行语句
  createContextLogger, // 执行语句
  createTracingMiddleware, // 执行语句
  getContext, // 执行语句
  getRequestId, // 执行语句
  setUserId, // 执行语句
  addAttribute, // 执行语句
  addEvent, // 执行语句
  createSpan, // 执行语句
  traceAsync, // 执行语句
  defaultTracingManager, // 执行语句
}; // 结束代码块
