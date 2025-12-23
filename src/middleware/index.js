/**
 * 中间件模块导出
 * Middleware Module Exports
 *
 * @module src/middleware
 */

export {
  SecurityManager,
  RateLimiter,
  createSecurityMiddleware,
  generateSignature,
} from './security.js';

export {
  HealthChecker,
  HealthStatus,
  ComponentType,
  ComponentCheckers,
  createHealthRoutes,
  createHealthMiddleware,
  defaultHealthChecker,
} from './healthCheck.js';

export {
  AuthManager,
  createAuthMiddleware,
  createLoginHandler,
  createRefreshHandler,
  createLogoutHandler,
} from './auth.js';

// 请求追踪中间件
export {
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
} from './requestTracing.js';
