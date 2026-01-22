/**
 * API 模块入口
 * API Module Entry Point
 *
 * @module src/api
 */

export { ApiServer, createApiServer } from './server.js'; // 导出命名成员
export { RateLimiter, RateLimitStrategy, DEFAULT_RATE_LIMIT_CONFIG } from './rateLimit.js'; // 导出命名成员
export { RBACManager, Role, Permission, RolePermissions, RoutePermissions, RequirePermission } from './rbac.js'; // 导出命名成员

// 路由导出
export * from './routes/index.js'; // 执行语句
