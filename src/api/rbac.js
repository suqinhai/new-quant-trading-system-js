/**
 * RBAC 权限控制模块
 * Role-Based Access Control
 *
 * @module src/api/rbac
 */

/**
 * 用户角色枚举
 */
export const Role = {
  ADMIN: 'admin',      // 管理员 - 所有权限
  TRADER: 'trader',    // 交易员 - 交易相关权限
  ANALYST: 'analyst',  // 分析师 - 只读 + 分析权限
  VIEWER: 'viewer',    // 访客 - 只读权限
};

/**
 * 权限枚举
 */
export const Permission = {
  // 系统权限
  SYSTEM_CONFIG_READ: 'system:config:read',
  SYSTEM_CONFIG_WRITE: 'system:config:write',
  SYSTEM_METRICS_READ: 'system:metrics:read',

  // 策略权限
  STRATEGY_READ: 'strategy:read',
  STRATEGY_CREATE: 'strategy:create',
  STRATEGY_UPDATE: 'strategy:update',
  STRATEGY_DELETE: 'strategy:delete',
  STRATEGY_START: 'strategy:start',
  STRATEGY_STOP: 'strategy:stop',
  STRATEGY_BACKTEST: 'strategy:backtest',

  // 交易权限
  TRADE_READ: 'trade:read',
  TRADE_EXPORT: 'trade:export',
  ORDER_READ: 'order:read',
  ORDER_CREATE: 'order:create',
  ORDER_CANCEL: 'order:cancel',

  // 持仓权限
  POSITION_READ: 'position:read',
  POSITION_CLOSE: 'position:close',
  POSITION_CLOSE_ALL: 'position:close:all',

  // 风控权限
  RISK_READ: 'risk:read',
  RISK_CONFIG_WRITE: 'risk:config:write',
  RISK_TRADING_CONTROL: 'risk:trading:control',
  ALERT_READ: 'alert:read',
  ALERT_DISMISS: 'alert:dismiss',

  // 交易所权限
  EXCHANGE_READ: 'exchange:read',
  EXCHANGE_CONFIG_WRITE: 'exchange:config:write',
  EXCHANGE_BALANCE_READ: 'exchange:balance:read',

  // 用户权限
  USER_PROFILE_READ: 'user:profile:read',
  USER_PROFILE_WRITE: 'user:profile:write',
  USER_PASSWORD_CHANGE: 'user:password:change',
  USER_MANAGE: 'user:manage',  // 管理其他用户
};

/**
 * 角色权限映射
 */
export const RolePermissions = {
  [Role.ADMIN]: [
    // 管理员拥有所有权限
    ...Object.values(Permission),
  ],

  [Role.TRADER]: [
    // 系统 - 只读
    Permission.SYSTEM_CONFIG_READ,
    Permission.SYSTEM_METRICS_READ,

    // 策略 - 完全控制
    Permission.STRATEGY_READ,
    Permission.STRATEGY_CREATE,
    Permission.STRATEGY_UPDATE,
    Permission.STRATEGY_DELETE,
    Permission.STRATEGY_START,
    Permission.STRATEGY_STOP,
    Permission.STRATEGY_BACKTEST,

    // 交易 - 完全控制
    Permission.TRADE_READ,
    Permission.TRADE_EXPORT,
    Permission.ORDER_READ,
    Permission.ORDER_CREATE,
    Permission.ORDER_CANCEL,

    // 持仓 - 完全控制
    Permission.POSITION_READ,
    Permission.POSITION_CLOSE,

    // 风控 - 只读
    Permission.RISK_READ,
    Permission.ALERT_READ,
    Permission.ALERT_DISMISS,

    // 交易所 - 只读 + 余额
    Permission.EXCHANGE_READ,
    Permission.EXCHANGE_BALANCE_READ,

    // 用户 - 自己的资料
    Permission.USER_PROFILE_READ,
    Permission.USER_PROFILE_WRITE,
    Permission.USER_PASSWORD_CHANGE,
  ],

  [Role.ANALYST]: [
    // 系统 - 只读
    Permission.SYSTEM_CONFIG_READ,
    Permission.SYSTEM_METRICS_READ,

    // 策略 - 只读 + 回测
    Permission.STRATEGY_READ,
    Permission.STRATEGY_BACKTEST,

    // 交易 - 只读 + 导出
    Permission.TRADE_READ,
    Permission.TRADE_EXPORT,
    Permission.ORDER_READ,

    // 持仓 - 只读
    Permission.POSITION_READ,

    // 风控 - 只读
    Permission.RISK_READ,
    Permission.ALERT_READ,

    // 交易所 - 只读
    Permission.EXCHANGE_READ,
    Permission.EXCHANGE_BALANCE_READ,

    // 用户 - 自己的资料
    Permission.USER_PROFILE_READ,
    Permission.USER_PROFILE_WRITE,
    Permission.USER_PASSWORD_CHANGE,
  ],

  [Role.VIEWER]: [
    // 系统 - 有限只读
    Permission.SYSTEM_METRICS_READ,

    // 策略 - 只读
    Permission.STRATEGY_READ,

    // 交易 - 只读
    Permission.TRADE_READ,
    Permission.ORDER_READ,

    // 持仓 - 只读
    Permission.POSITION_READ,

    // 风控 - 只读
    Permission.RISK_READ,
    Permission.ALERT_READ,

    // 交易所 - 只读
    Permission.EXCHANGE_READ,

    // 用户 - 自己的资料
    Permission.USER_PROFILE_READ,
    Permission.USER_PASSWORD_CHANGE,
  ],
};

/**
 * 路由权限映射
 */
export const RoutePermissions = {
  // 系统路由
  'GET /api/system/status': [Permission.SYSTEM_METRICS_READ],
  'GET /api/system/config': [Permission.SYSTEM_CONFIG_READ],
  'PUT /api/system/config': [Permission.SYSTEM_CONFIG_WRITE],
  'GET /api/system/metrics': [Permission.SYSTEM_METRICS_READ],

  // 策略路由
  'GET /api/strategies': [Permission.STRATEGY_READ],
  'GET /api/strategies/:id': [Permission.STRATEGY_READ],
  'POST /api/strategies': [Permission.STRATEGY_CREATE],
  'PUT /api/strategies/:id': [Permission.STRATEGY_UPDATE],
  'DELETE /api/strategies/:id': [Permission.STRATEGY_DELETE],
  'POST /api/strategies/:id/start': [Permission.STRATEGY_START],
  'POST /api/strategies/:id/stop': [Permission.STRATEGY_STOP],
  'POST /api/strategies/:id/backtest': [Permission.STRATEGY_BACKTEST],

  // 交易路由
  'GET /api/trades': [Permission.TRADE_READ],
  'GET /api/trades/:id': [Permission.TRADE_READ],
  'GET /api/trades/export': [Permission.TRADE_EXPORT],
  'GET /api/trades/stats': [Permission.TRADE_READ],
  'GET /api/orders': [Permission.ORDER_READ],
  'POST /api/orders': [Permission.ORDER_CREATE],
  'DELETE /api/orders/:id': [Permission.ORDER_CANCEL],

  // 持仓路由
  'GET /api/positions': [Permission.POSITION_READ],
  'GET /api/positions/:id': [Permission.POSITION_READ],
  'POST /api/positions/:id/close': [Permission.POSITION_CLOSE],
  'POST /api/positions/close-all': [Permission.POSITION_CLOSE_ALL],

  // 风控路由
  'GET /api/risk/config': [Permission.RISK_READ],
  'PUT /api/risk/config': [Permission.RISK_CONFIG_WRITE],
  'GET /api/risk/limits': [Permission.RISK_READ],
  'PUT /api/risk/limits': [Permission.RISK_CONFIG_WRITE],
  'GET /api/risk/alerts': [Permission.ALERT_READ],
  'POST /api/risk/alerts/:id/dismiss': [Permission.ALERT_DISMISS],
  'POST /api/risk/trading/enable': [Permission.RISK_TRADING_CONTROL],
  'POST /api/risk/trading/disable': [Permission.RISK_TRADING_CONTROL],

  // 交易所路由
  'GET /api/exchanges': [Permission.EXCHANGE_READ],
  'GET /api/exchanges/:id': [Permission.EXCHANGE_READ],
  'PUT /api/exchanges/:id': [Permission.EXCHANGE_CONFIG_WRITE],
  'POST /api/exchanges/:id/test': [Permission.EXCHANGE_READ],
  'GET /api/exchanges/:id/balance': [Permission.EXCHANGE_BALANCE_READ],

  // 用户路由
  'GET /api/user/profile': [Permission.USER_PROFILE_READ],
  'PUT /api/user/profile': [Permission.USER_PROFILE_WRITE],
  'POST /api/user/change-password': [Permission.USER_PASSWORD_CHANGE],
  'GET /api/users': [Permission.USER_MANAGE],
  'POST /api/users': [Permission.USER_MANAGE],
  'DELETE /api/users/:id': [Permission.USER_MANAGE],
};

/**
 * RBAC 管理器
 */
export class RBACManager {
  constructor(config = {}) {
    this.rolePermissions = { ...RolePermissions, ...config.rolePermissions };
    this.routePermissions = { ...RoutePermissions, ...config.routePermissions };
    this.customPermissions = new Map(); // 用户自定义权限
  }

  /**
   * 检查用户是否有指定权限
   */
  hasPermission(user, permission) {
    if (!user) return false;

    const role = user.role || Role.VIEWER;

    // 管理员拥有所有权限
    if (role === Role.ADMIN) return true;

    // 检查角色权限
    const permissions = this.rolePermissions[role] || [];
    if (permissions.includes(permission)) return true;

    // 检查用户自定义权限
    const customPerms = this.customPermissions.get(user.sub) || [];
    return customPerms.includes(permission);
  }

  /**
   * 检查用户是否有任一权限
   */
  hasAnyPermission(user, permissions) {
    return permissions.some(p => this.hasPermission(user, p));
  }

  /**
   * 检查用户是否有所有权限
   */
  hasAllPermissions(user, permissions) {
    return permissions.every(p => this.hasPermission(user, p));
  }

  /**
   * 获取用户所有权限
   */
  getUserPermissions(user) {
    if (!user) return [];

    const role = user.role || Role.VIEWER;
    const rolePerms = this.rolePermissions[role] || [];
    const customPerms = this.customPermissions.get(user.sub) || [];

    return [...new Set([...rolePerms, ...customPerms])];
  }

  /**
   * 添加用户自定义权限
   */
  addUserPermission(userId, permission) {
    if (!this.customPermissions.has(userId)) {
      this.customPermissions.set(userId, []);
    }
    const perms = this.customPermissions.get(userId);
    if (!perms.includes(permission)) {
      perms.push(permission);
    }
  }

  /**
   * 移除用户自定义权限
   */
  removeUserPermission(userId, permission) {
    const perms = this.customPermissions.get(userId);
    if (perms) {
      const index = perms.indexOf(permission);
      if (index > -1) {
        perms.splice(index, 1);
      }
    }
  }

  /**
   * 获取路由所需权限
   */
  getRouteRequiredPermissions(method, path) {
    // 精确匹配
    const key = `${method} ${path}`;
    if (this.routePermissions[key]) {
      return this.routePermissions[key];
    }

    // 参数化路由匹配
    for (const [routeKey, permissions] of Object.entries(this.routePermissions)) {
      if (this.matchRoute(routeKey, method, path)) {
        return permissions;
      }
    }

    return null; // 未配置的路由默认放行
  }

  /**
   * 匹配路由
   */
  matchRoute(routeKey, method, path) {
    const [routeMethod, routePath] = routeKey.split(' ');
    if (routeMethod !== method) return false;

    const routeParts = routePath.split('/');
    const pathParts = path.split('/');

    if (routeParts.length !== pathParts.length) return false;

    return routeParts.every((part, i) => {
      if (part.startsWith(':')) return true; // 参数匹配
      return part === pathParts[i];
    });
  }

  /**
   * 检查路由访问权限
   */
  canAccessRoute(user, method, path) {
    const requiredPermissions = this.getRouteRequiredPermissions(method, path);

    // 未配置权限的路由默认放行
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    return this.hasAnyPermission(user, requiredPermissions);
  }

  /**
   * Express 权限中间件
   */
  middleware(requiredPermissions) {
    return (req, res, next) => {
      const permissions = Array.isArray(requiredPermissions)
        ? requiredPermissions
        : [requiredPermissions];

      if (!this.hasAnyPermission(req.user, permissions)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: permissions,
        });
      }

      next();
    };
  }

  /**
   * Express 路由权限中间件 (自动检查)
   */
  routeMiddleware() {
    return (req, res, next) => {
      // 跳过公开路由
      const publicPaths = ['/api/auth/login', '/api/health'];
      if (publicPaths.some(p => req.path.startsWith(p))) {
        return next();
      }

      if (!this.canAccessRoute(req.user, req.method, req.path)) {
        const required = this.getRouteRequiredPermissions(req.method, req.path);
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required,
        });
      }

      next();
    };
  }

  /**
   * 获取角色列表
   */
  getRoles() {
    return Object.values(Role);
  }

  /**
   * 获取权限列表
   */
  getPermissions() {
    return Object.values(Permission);
  }

  /**
   * 获取角色权限映射
   */
  getRolePermissionsMap() {
    return { ...this.rolePermissions };
  }
}

/**
 * 权限检查装饰器 (用于类方法)
 */
export function RequirePermission(permission) {
  return function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args) {
      const req = args[0];
      const res = args[1];

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
        });
      }

      const rbac = new RBACManager();
      if (!rbac.hasPermission(req.user, permission)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: [permission],
        });
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

export default RBACManager;
