/**
 * API 模块入口
 * API Module Entry Point
 *
 * @module src/api
 */

export { ApiServer, createApiServer } from './server.js';
export { RateLimiter, RateLimitStrategy, DEFAULT_RATE_LIMIT_CONFIG } from './rateLimit.js';
export { RBACManager, Role, Permission, RolePermissions, RoutePermissions, RequirePermission } from './rbac.js';

// 路由导出
export * from './routes/index.js';
