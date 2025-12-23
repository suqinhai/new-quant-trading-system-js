/**
 * 请求追踪中间件
 * Request Tracing Middleware
 *
 * 提供 Request ID 追踪、请求上下文管理和性能监控
 * Provides Request ID tracing, request context management and performance monitoring
 *
 * @module src/middleware/requestTracing
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

// ============================================
// 请求上下文存储
// ============================================

/**
 * 异步本地存储，用于在整个请求生命周期中传递上下文
 * AsyncLocalStorage for propagating context throughout request lifecycle
 */
const asyncLocalStorage = new AsyncLocalStorage();

/**
 * 请求上下文类
 * Request Context Class
 */
export class RequestContext {
  constructor(options = {}) {
    // 请求 ID / Request ID
    this.requestId = options.requestId || RequestContext.generateId();

    // 追踪 ID (用于跨服务追踪，预留) / Trace ID (for cross-service tracing, reserved)
    this.traceId = options.traceId || this.requestId;

    // Span ID (当前操作标识) / Span ID (current operation identifier)
    this.spanId = options.spanId || RequestContext.generateSpanId();

    // 父 Span ID / Parent Span ID
    this.parentSpanId = options.parentSpanId || null;

    // 请求开始时间 / Request start time
    this.startTime = options.startTime || Date.now();
    this.startHrTime = options.startHrTime || process.hrtime.bigint();

    // 请求元数据 / Request metadata
    this.method = options.method || '';
    this.path = options.path || '';
    this.userAgent = options.userAgent || '';
    this.ip = options.ip || '';
    this.userId = options.userId || null;

    // 自定义属性 / Custom attributes
    this.attributes = new Map();

    // 事件/日志记录 / Events/logs
    this.events = [];

    // 子 Span 列表 / Child spans
    this.spans = [];
  }

  /**
   * 生成请求 ID
   */
  static generateId() {
    const timestamp = Date.now().toString(36);
    const random = randomUUID().split('-')[0];
    return `req_${timestamp}_${random}`;
  }

  /**
   * 生成 Span ID
   */
  static generateSpanId() {
    return randomUUID().split('-').slice(0, 2).join('');
  }

  /**
   * 设置属性
   */
  setAttribute(key, value) {
    this.attributes.set(key, value);
    return this;
  }

  /**
   * 获取属性
   */
  getAttribute(key) {
    return this.attributes.get(key);
  }

  /**
   * 添加事件
   */
  addEvent(name, attributes = {}) {
    this.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
    return this;
  }

  /**
   * 创建子 Span
   */
  createSpan(name) {
    const span = new Span({
      name,
      traceId: this.traceId,
      parentSpanId: this.spanId,
      requestId: this.requestId,
    });
    this.spans.push(span);
    return span;
  }

  /**
   * 获取请求耗时 (毫秒)
   */
  getDuration() {
    return Date.now() - this.startTime;
  }

  /**
   * 获取高精度耗时 (纳秒)
   */
  getDurationNanos() {
    return Number(process.hrtime.bigint() - this.startHrTime);
  }

  /**
   * 转换为日志友好格式
   */
  toLogContext() {
    return {
      requestId: this.requestId,
      traceId: this.traceId,
      spanId: this.spanId,
      method: this.method,
      path: this.path,
      userId: this.userId,
      duration: this.getDuration(),
    };
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      requestId: this.requestId,
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      method: this.method,
      path: this.path,
      ip: this.ip,
      userId: this.userId,
      startTime: this.startTime,
      duration: this.getDuration(),
      attributes: Object.fromEntries(this.attributes),
      events: this.events,
      spans: this.spans.map(s => s.toJSON()),
    };
  }
}

/**
 * Span 类 - 表示一个操作单元
 * Span Class - Represents an operation unit
 */
export class Span {
  constructor(options = {}) {
    this.name = options.name || 'unknown';
    this.traceId = options.traceId;
    this.spanId = RequestContext.generateSpanId();
    this.parentSpanId = options.parentSpanId;
    this.requestId = options.requestId;
    this.startTime = Date.now();
    this.startHrTime = process.hrtime.bigint();
    this.endTime = null;
    this.status = 'ok'; // ok, error
    this.attributes = new Map();
    this.events = [];
  }

  setAttribute(key, value) {
    this.attributes.set(key, value);
    return this;
  }

  addEvent(name, attributes = {}) {
    this.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
    return this;
  }

  setError(error) {
    this.status = 'error';
    this.setAttribute('error.type', error.name || 'Error');
    this.setAttribute('error.message', error.message);
    if (error.stack) {
      this.setAttribute('error.stack', error.stack);
    }
    return this;
  }

  end() {
    this.endTime = Date.now();
    return this;
  }

  getDuration() {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  toJSON() {
    return {
      name: this.name,
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.getDuration(),
      status: this.status,
      attributes: Object.fromEntries(this.attributes),
      events: this.events,
    };
  }
}

// ============================================
// 追踪管理器
// ============================================

/**
 * 请求追踪管理器
 * Request Tracing Manager
 */
export class RequestTracingManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      // 是否启用追踪 / Enable tracing
      enabled: config.enabled !== false,

      // 请求 ID 头名称 / Request ID header name
      requestIdHeader: config.requestIdHeader || 'x-request-id',

      // 追踪 ID 头名称 / Trace ID header name
      traceIdHeader: config.traceIdHeader || 'x-trace-id',

      // 是否记录请求体 / Log request body
      logRequestBody: config.logRequestBody || false,

      // 是否记录响应体 / Log response body
      logResponseBody: config.logResponseBody || false,

      // 慢请求阈值 (ms) / Slow request threshold (ms)
      slowRequestThreshold: config.slowRequestThreshold || 1000,

      // 排除的路径 / Excluded paths
      excludePaths: config.excludePaths || ['/api/health', '/favicon.ico'],

      // 敏感字段（不记录） / Sensitive fields (not logged)
      sensitiveFields: config.sensitiveFields || ['password', 'token', 'secret', 'apiKey', 'authorization'],

      ...config,
    };

    // 统计信息 / Statistics
    this.stats = {
      totalRequests: 0,
      activeRequests: 0,
      slowRequests: 0,
      errorRequests: 0,
    };
  }

  /**
   * 获取当前请求上下文
   * Get current request context
   */
  static getContext() {
    return asyncLocalStorage.getStore();
  }

  /**
   * 获取当前请求 ID
   * Get current request ID
   */
  static getRequestId() {
    const context = RequestTracingManager.getContext();
    return context?.requestId || null;
  }

  /**
   * 在上下文中运行函数
   * Run function within context
   */
  static runWithContext(context, fn) {
    return asyncLocalStorage.run(context, fn);
  }

  /**
   * 创建 Express 中间件
   * Create Express middleware
   */
  middleware() {
    return (req, res, next) => {
      if (!this.config.enabled) {
        return next();
      }

      // 检查是否排除的路径
      if (this.config.excludePaths.some(p => req.path.startsWith(p))) {
        return next();
      }

      // 创建请求上下文
      const context = new RequestContext({
        requestId: req.headers[this.config.requestIdHeader] || undefined,
        traceId: req.headers[this.config.traceIdHeader] || undefined,
        method: req.method,
        path: req.path,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection?.remoteAddress,
      });

      // 设置响应头
      res.setHeader('X-Request-ID', context.requestId);
      res.setHeader('X-Trace-ID', context.traceId);

      // 将上下文附加到请求对象
      req.context = context;
      req.requestId = context.requestId;

      // 更新统计
      this.stats.totalRequests++;
      this.stats.activeRequests++;

      // 记录请求开始
      this.emit('requestStart', {
        requestId: context.requestId,
        method: req.method,
        path: req.path,
        query: req.query,
        ip: context.ip,
        userAgent: context.userAgent,
      });

      // 监听响应完成
      res.on('finish', () => {
        this.stats.activeRequests--;

        const duration = context.getDuration();
        context.setAttribute('http.status_code', res.statusCode);
        context.setAttribute('http.response_size', res.get('content-length') || 0);

        // 检查慢请求
        if (duration > this.config.slowRequestThreshold) {
          this.stats.slowRequests++;
          context.addEvent('slow_request', { duration, threshold: this.config.slowRequestThreshold });
          this.emit('slowRequest', {
            requestId: context.requestId,
            method: req.method,
            path: req.path,
            duration,
            statusCode: res.statusCode,
          });
        }

        // 检查错误
        if (res.statusCode >= 400) {
          this.stats.errorRequests++;
        }

        // 记录请求完成
        this.emit('requestEnd', {
          requestId: context.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          userId: context.userId,
        });
      });

      // 在上下文中运行后续中间件
      asyncLocalStorage.run(context, () => {
        next();
      });
    };
  }

  /**
   * 创建 Span 追踪装饰器
   * Create span tracing decorator
   */
  traceFunction(name, fn) {
    return async (...args) => {
      const context = RequestTracingManager.getContext();
      if (!context) {
        return fn(...args);
      }

      const span = context.createSpan(name);
      try {
        const result = await fn(...args);
        span.end();
        return result;
      } catch (error) {
        span.setError(error);
        span.end();
        throw error;
      }
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      activeRequests: 0,
      slowRequests: 0,
      errorRequests: 0,
    };
  }
}

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
export function createContextLogger(baseLogger) {
  const wrapMethod = (method) => {
    return (message, meta = {}) => {
      const context = RequestTracingManager.getContext();
      const contextMeta = context ? {
        requestId: context.requestId,
        traceId: context.traceId,
        spanId: context.spanId,
        userId: context.userId,
      } : {};

      baseLogger[method](message, { ...contextMeta, ...meta });
    };
  };

  return {
    error: wrapMethod('error'),
    warn: wrapMethod('warn'),
    info: wrapMethod('info'),
    http: wrapMethod('http'),
    verbose: wrapMethod('verbose'),
    debug: wrapMethod('debug'),
    silly: wrapMethod('silly'),

    // 直接访问基础日志记录器
    _base: baseLogger,

    // 创建子日志记录器
    child: (defaultMeta = {}) => {
      return createContextLogger(baseLogger.child(defaultMeta));
    },

    // 手动设置上下文
    withContext: (additionalContext) => {
      return {
        error: (msg, meta = {}) => wrapMethod('error')(msg, { ...additionalContext, ...meta }),
        warn: (msg, meta = {}) => wrapMethod('warn')(msg, { ...additionalContext, ...meta }),
        info: (msg, meta = {}) => wrapMethod('info')(msg, { ...additionalContext, ...meta }),
        debug: (msg, meta = {}) => wrapMethod('debug')(msg, { ...additionalContext, ...meta }),
      };
    },
  };
}

// ============================================
// 辅助函数
// ============================================

/**
 * 获取当前请求上下文
 */
export function getContext() {
  return RequestTracingManager.getContext();
}

/**
 * 获取当前请求 ID
 */
export function getRequestId() {
  return RequestTracingManager.getRequestId();
}

/**
 * 在请求上下文中设置用户 ID
 */
export function setUserId(userId) {
  const context = getContext();
  if (context) {
    context.userId = userId;
  }
}

/**
 * 添加自定义属性到当前上下文
 */
export function addAttribute(key, value) {
  const context = getContext();
  if (context) {
    context.setAttribute(key, value);
  }
}

/**
 * 添加事件到当前上下文
 */
export function addEvent(name, attributes = {}) {
  const context = getContext();
  if (context) {
    context.addEvent(name, attributes);
  }
}

/**
 * 创建子 Span
 */
export function createSpan(name) {
  const context = getContext();
  if (context) {
    return context.createSpan(name);
  }
  return null;
}

/**
 * 追踪异步函数执行
 */
export async function traceAsync(name, fn) {
  const span = createSpan(name);
  if (!span) {
    return fn();
  }

  try {
    const result = await fn();
    span.end();
    return result;
  } catch (error) {
    span.setError(error);
    span.end();
    throw error;
  }
}

// ============================================
// 默认实例
// ============================================

/**
 * 默认追踪管理器实例
 */
export const defaultTracingManager = new RequestTracingManager();

/**
 * 创建追踪中间件
 */
export function createTracingMiddleware(config = {}) {
  const manager = new RequestTracingManager(config);
  return manager.middleware();
}

// 默认导出
export default {
  RequestContext,
  Span,
  RequestTracingManager,
  createContextLogger,
  createTracingMiddleware,
  getContext,
  getRequestId,
  setUserId,
  addAttribute,
  addEvent,
  createSpan,
  traceAsync,
  defaultTracingManager,
};
