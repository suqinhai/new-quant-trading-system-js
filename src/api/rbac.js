/**
 * RBAC 权限控制模块
 * Role-Based Access Control
 *
 * @module src/api/rbac
 */

/**
 * 用户角色枚举
 */
export const Role = { // 导出常量 Role
  ADMIN: 'admin',      // 管理员 - 所有权限
  TRADER: 'trader',    // 交易员 - 交易相关权限
  ANALYST: 'analyst',  // 分析师 - 只读 + 分析权限
  VIEWER: 'viewer',    // 访客 - 只读权限
}; // 结束代码块

/**
 * 权限枚举
 */
export const Permission = { // 导出常量 Permission
  // 系统权限
  SYSTEM_CONFIG_READ: 'system:config:read', // 系统配置读取权限
  SYSTEM_CONFIG_WRITE: 'system:config:write', // 系统配置写入权限
  SYSTEM_METRICS_READ: 'system:metrics:read', // 系统指标读取权限

  // 策略权限
  STRATEGY_READ: 'strategy:read', // 策略读取权限
  STRATEGY_CREATE: 'strategy:create', // 策略创建权限
  STRATEGY_UPDATE: 'strategy:update', // 策略更新权限
  STRATEGY_DELETE: 'strategy:delete', // 策略删除权限
  STRATEGY_START: 'strategy:start', // 策略启动权限
  STRATEGY_STOP: 'strategy:stop', // 策略停止权限
  STRATEGY_BACKTEST: 'strategy:backtest', // 策略回测权限

  // 交易权限
  TRADE_READ: 'trade:read', // 交易读取权限
  TRADE_EXPORT: 'trade:export', // 交易导出权限
  ORDER_READ: 'order:read', // 订单读取权限
  ORDER_CREATE: 'order:create', // 订单创建权限
  ORDER_CANCEL: 'order:cancel', // 订单取消权限

  // 持仓权限
  POSITION_READ: 'position:read', // 持仓读取权限
  POSITION_CLOSE: 'position:close', // 持仓平仓权限
  POSITION_CLOSE_ALL: 'position:close:all', // 持仓全部平仓权限

  // 风控权限
  RISK_READ: 'risk:read', // 风险读取权限
  RISK_CONFIG_WRITE: 'risk:config:write', // 风险配置写入权限
  RISK_TRADING_CONTROL: 'risk:trading:control', // 风险交易控制权限
  ALERT_READ: 'alert:read', // 告警读取权限
  ALERT_DISMISS: 'alert:dismiss', // 告警忽略权限

  // 交易所权限
  EXCHANGE_READ: 'exchange:read', // 交易所读取权限
  EXCHANGE_CONFIG_WRITE: 'exchange:config:write', // 交易所配置写入权限
  EXCHANGE_BALANCE_READ: 'exchange:balance:read', // 交易所余额读取权限

  // 用户权限
  USER_PROFILE_READ: 'user:profile:read', // 用户资料读取权限
  USER_PROFILE_WRITE: 'user:profile:write', // 用户资料写入权限
  USER_PASSWORD_CHANGE: 'user:password:change', // 用户密码修改权限
  USER_MANAGE: 'user:manage',  // 用户管理权限
}; // 结束代码块

/**
 * 角色权限映射
 */
export const RolePermissions = { // 导出常量 RolePermissions
  [Role.ADMIN]: [ // 执行语句
    // 管理员拥有所有权限
    ...Object.values(Permission), // 展开对象或数组
  ], // 结束数组或索引

  [Role.TRADER]: [ // 执行语句
    // 系统 - 只读
    Permission.SYSTEM_CONFIG_READ, // 执行语句
    Permission.SYSTEM_METRICS_READ, // 执行语句

    // 策略 - 完全控制
    Permission.STRATEGY_READ, // 执行语句
    Permission.STRATEGY_CREATE, // 执行语句
    Permission.STRATEGY_UPDATE, // 执行语句
    Permission.STRATEGY_DELETE, // 执行语句
    Permission.STRATEGY_START, // 执行语句
    Permission.STRATEGY_STOP, // 执行语句
    Permission.STRATEGY_BACKTEST, // 执行语句

    // 交易 - 完全控制
    Permission.TRADE_READ, // 执行语句
    Permission.TRADE_EXPORT, // 执行语句
    Permission.ORDER_READ, // 执行语句
    Permission.ORDER_CREATE, // 执行语句
    Permission.ORDER_CANCEL, // 执行语句

    // 持仓 - 完全控制
    Permission.POSITION_READ, // 执行语句
    Permission.POSITION_CLOSE, // 执行语句

    // 风控 - 只读
    Permission.RISK_READ, // 执行语句
    Permission.ALERT_READ, // 执行语句
    Permission.ALERT_DISMISS, // 执行语句

    // 交易所 - 只读 + 余额
    Permission.EXCHANGE_READ, // 执行语句
    Permission.EXCHANGE_BALANCE_READ, // 执行语句

    // 用户 - 自己的资料
    Permission.USER_PROFILE_READ, // 执行语句
    Permission.USER_PROFILE_WRITE, // 执行语句
    Permission.USER_PASSWORD_CHANGE, // 执行语句
  ], // 结束数组或索引

  [Role.ANALYST]: [ // 执行语句
    // 系统 - 只读
    Permission.SYSTEM_CONFIG_READ, // 执行语句
    Permission.SYSTEM_METRICS_READ, // 执行语句

    // 策略 - 只读 + 回测
    Permission.STRATEGY_READ, // 执行语句
    Permission.STRATEGY_BACKTEST, // 执行语句

    // 交易 - 只读 + 导出
    Permission.TRADE_READ, // 执行语句
    Permission.TRADE_EXPORT, // 执行语句
    Permission.ORDER_READ, // 执行语句

    // 持仓 - 只读
    Permission.POSITION_READ, // 执行语句

    // 风控 - 只读
    Permission.RISK_READ, // 执行语句
    Permission.ALERT_READ, // 执行语句

    // 交易所 - 只读
    Permission.EXCHANGE_READ, // 执行语句
    Permission.EXCHANGE_BALANCE_READ, // 执行语句

    // 用户 - 自己的资料
    Permission.USER_PROFILE_READ, // 执行语句
    Permission.USER_PROFILE_WRITE, // 执行语句
    Permission.USER_PASSWORD_CHANGE, // 执行语句
  ], // 结束数组或索引

  [Role.VIEWER]: [ // 执行语句
    // 系统 - 有限只读
    Permission.SYSTEM_METRICS_READ, // 执行语句

    // 策略 - 只读
    Permission.STRATEGY_READ, // 执行语句

    // 交易 - 只读
    Permission.TRADE_READ, // 执行语句
    Permission.ORDER_READ, // 执行语句

    // 持仓 - 只读
    Permission.POSITION_READ, // 执行语句

    // 风控 - 只读
    Permission.RISK_READ, // 执行语句
    Permission.ALERT_READ, // 执行语句

    // 交易所 - 只读
    Permission.EXCHANGE_READ, // 执行语句

    // 用户 - 自己的资料
    Permission.USER_PROFILE_READ, // 执行语句
    Permission.USER_PASSWORD_CHANGE, // 执行语句
  ], // 结束数组或索引
}; // 结束代码块

/**
 * 路由权限映射
 */
export const RoutePermissions = { // 导出常量 RoutePermissions
  // 系统路由
  'GET /api/system/status': [Permission.SYSTEM_METRICS_READ], // 执行语句
  'GET /api/system/config': [Permission.SYSTEM_CONFIG_READ], // 执行语句
  'PUT /api/system/config': [Permission.SYSTEM_CONFIG_WRITE], // 执行语句
  'GET /api/system/metrics': [Permission.SYSTEM_METRICS_READ], // 执行语句

  // 策略路由
  'GET /api/strategies': [Permission.STRATEGY_READ], // 执行语句
  'GET /api/strategies/:id': [Permission.STRATEGY_READ], // 执行语句
  'POST /api/strategies': [Permission.STRATEGY_CREATE], // 执行语句
  'PUT /api/strategies/:id': [Permission.STRATEGY_UPDATE], // 执行语句
  'DELETE /api/strategies/:id': [Permission.STRATEGY_DELETE], // 执行语句
  'POST /api/strategies/:id/start': [Permission.STRATEGY_START], // 执行语句
  'POST /api/strategies/:id/stop': [Permission.STRATEGY_STOP], // 执行语句
  'POST /api/strategies/:id/backtest': [Permission.STRATEGY_BACKTEST], // 执行语句

  // 交易路由
  'GET /api/trades': [Permission.TRADE_READ], // 执行语句
  'GET /api/trades/:id': [Permission.TRADE_READ], // 执行语句
  'GET /api/trades/export': [Permission.TRADE_EXPORT], // 执行语句
  'GET /api/trades/stats': [Permission.TRADE_READ], // 执行语句
  'GET /api/orders': [Permission.ORDER_READ], // 执行语句
  'POST /api/orders': [Permission.ORDER_CREATE], // 执行语句
  'DELETE /api/orders/:id': [Permission.ORDER_CANCEL], // 执行语句

  // 持仓路由
  'GET /api/positions': [Permission.POSITION_READ], // 执行语句
  'GET /api/positions/:id': [Permission.POSITION_READ], // 执行语句
  'POST /api/positions/:id/close': [Permission.POSITION_CLOSE], // 执行语句
  'POST /api/positions/close-all': [Permission.POSITION_CLOSE_ALL], // 执行语句

  // 风控路由
  'GET /api/risk/config': [Permission.RISK_READ], // 执行语句
  'PUT /api/risk/config': [Permission.RISK_CONFIG_WRITE], // 执行语句
  'GET /api/risk/limits': [Permission.RISK_READ], // 执行语句
  'PUT /api/risk/limits': [Permission.RISK_CONFIG_WRITE], // 执行语句
  'GET /api/risk/alerts': [Permission.ALERT_READ], // 执行语句
  'POST /api/risk/alerts/:id/dismiss': [Permission.ALERT_DISMISS], // 执行语句
  'POST /api/risk/trading/enable': [Permission.RISK_TRADING_CONTROL], // 执行语句
  'POST /api/risk/trading/disable': [Permission.RISK_TRADING_CONTROL], // 执行语句

  // 交易所路由
  'GET /api/exchanges': [Permission.EXCHANGE_READ], // 执行语句
  'GET /api/exchanges/:id': [Permission.EXCHANGE_READ], // 执行语句
  'PUT /api/exchanges/:id': [Permission.EXCHANGE_CONFIG_WRITE], // 执行语句
  'POST /api/exchanges/:id/test': [Permission.EXCHANGE_READ], // 执行语句
  'GET /api/exchanges/:id/balance': [Permission.EXCHANGE_BALANCE_READ], // 执行语句

  // 用户路由
  'GET /api/user/profile': [Permission.USER_PROFILE_READ], // 执行语句
  'PUT /api/user/profile': [Permission.USER_PROFILE_WRITE], // 执行语句
  'POST /api/user/change-password': [Permission.USER_PASSWORD_CHANGE], // 执行语句
  'GET /api/users': [Permission.USER_MANAGE], // 执行语句
  'POST /api/users': [Permission.USER_MANAGE], // 执行语句
  'DELETE /api/users/:id': [Permission.USER_MANAGE], // 执行语句
}; // 结束代码块

/**
 * RBAC 管理器
 */
export class RBACManager { // 导出类 RBACManager
  constructor(config = {}) { // 构造函数
    this.rolePermissions = { ...RolePermissions, ...config.rolePermissions }; // 设置 rolePermissions
    this.routePermissions = { ...RoutePermissions, ...config.routePermissions }; // 设置 routePermissions
    this.customPermissions = new Map(); // 用户自定义权限
  } // 结束代码块

  /**
   * 检查用户是否有指定权限
   */
  hasPermission(user, permission) { // 调用 hasPermission
    if (!user) return false; // 条件判断 !user

    const role = user.role || Role.VIEWER; // 定义常量 role

    // 管理员拥有所有权限
    if (role === Role.ADMIN) return true; // 条件判断 role === Role.ADMIN

    // 检查角色权限
    const permissions = this.rolePermissions[role] || []; // 定义常量 permissions
    if (permissions.includes(permission)) return true; // 条件判断 permissions.includes(permission)

    // 检查用户自定义权限
    const customPerms = this.customPermissions.get(user.sub) || []; // 定义常量 customPerms
    return customPerms.includes(permission); // 返回结果
  } // 结束代码块

  /**
   * 检查用户是否有任一权限
   */
  hasAnyPermission(user, permissions) { // 调用 hasAnyPermission
    return permissions.some(p => this.hasPermission(user, p)); // 返回结果
  } // 结束代码块

  /**
   * 检查用户是否有所有权限
   */
  hasAllPermissions(user, permissions) { // 调用 hasAllPermissions
    return permissions.every(p => this.hasPermission(user, p)); // 返回结果
  } // 结束代码块

  /**
   * 获取用户所有权限
   */
  getUserPermissions(user) { // 调用 getUserPermissions
    if (!user) return []; // 条件判断 !user

    const role = user.role || Role.VIEWER; // 定义常量 role
    const rolePerms = this.rolePermissions[role] || []; // 定义常量 rolePerms
    const customPerms = this.customPermissions.get(user.sub) || []; // 定义常量 customPerms

    return [...new Set([...rolePerms, ...customPerms])]; // 返回结果
  } // 结束代码块

  /**
   * 添加用户自定义权限
   */
  addUserPermission(userId, permission) { // 调用 addUserPermission
    if (!this.customPermissions.has(userId)) { // 条件判断 !this.customPermissions.has(userId)
      this.customPermissions.set(userId, []); // 访问 customPermissions
    } // 结束代码块
    const perms = this.customPermissions.get(userId); // 定义常量 perms
    if (!perms.includes(permission)) { // 条件判断 !perms.includes(permission)
      perms.push(permission); // 调用 perms.push
    } // 结束代码块
  } // 结束代码块

  /**
   * 移除用户自定义权限
   */
  removeUserPermission(userId, permission) { // 调用 removeUserPermission
    const perms = this.customPermissions.get(userId); // 定义常量 perms
    if (perms) { // 条件判断 perms
      const index = perms.indexOf(permission); // 定义常量 index
      if (index > -1) { // 条件判断 index > -1
        perms.splice(index, 1); // 调用 perms.splice
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取路由所需权限
   */
  getRouteRequiredPermissions(method, path) { // 调用 getRouteRequiredPermissions
    // 精确匹配
    const key = `${method} ${path}`; // 定义常量 key
    if (this.routePermissions[key]) { // 条件判断 this.routePermissions[key]
      return this.routePermissions[key]; // 返回结果
    } // 结束代码块

    // 参数化路由匹配
    for (const [routeKey, permissions] of Object.entries(this.routePermissions)) { // 循环 const [routeKey, permissions] of Object.entri...
      if (this.matchRoute(routeKey, method, path)) { // 条件判断 this.matchRoute(routeKey, method, path)
        return permissions; // 返回结果
      } // 结束代码块
    } // 结束代码块

    return null; // 未配置的路由默认放行
  } // 结束代码块

  /**
   * 匹配路由
   */
  matchRoute(routeKey, method, path) { // 调用 matchRoute
    const [routeMethod, routePath] = routeKey.split(' '); // 解构赋值
    if (routeMethod !== method) return false; // 条件判断 routeMethod !== method

    const routeParts = routePath.split('/'); // 定义常量 routeParts
    const pathParts = path.split('/'); // 定义常量 pathParts

    if (routeParts.length !== pathParts.length) return false; // 条件判断 routeParts.length !== pathParts.length

    return routeParts.every((part, i) => { // 返回结果
      if (part.startsWith(':')) return true; // 参数匹配
      return part === pathParts[i]; // 返回结果
    }); // 结束代码块
  } // 结束代码块

  /**
   * 检查路由访问权限
   */
  canAccessRoute(user, method, path) { // 调用 canAccessRoute
    const requiredPermissions = this.getRouteRequiredPermissions(method, path); // 定义常量 requiredPermissions

    // 未配置权限的路由默认放行
    if (!requiredPermissions || requiredPermissions.length === 0) { // 条件判断 !requiredPermissions || requiredPermissions.l...
      return true; // 返回结果
    } // 结束代码块

    return this.hasAnyPermission(user, requiredPermissions); // 返回结果
  } // 结束代码块

  /**
   * Express 权限中间件
   */
  middleware(requiredPermissions) { // 调用 middleware
    return (req, res, next) => { // 返回结果
      const permissions = Array.isArray(requiredPermissions) // 定义常量 permissions
        ? requiredPermissions // 执行语句
        : [requiredPermissions]; // 执行语句

      if (!this.hasAnyPermission(req.user, permissions)) { // 条件判断 !this.hasAnyPermission(req.user, permissions)
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Insufficient permissions', // 错误
          code: 'FORBIDDEN', // 代码
          required: permissions, // required
        }); // 结束代码块
      } // 结束代码块

      next(); // 调用 next
    }; // 结束代码块
  } // 结束代码块

  /**
   * Express 路由权限中间件 (自动检查)
   */
  routeMiddleware() { // 调用 routeMiddleware
    return (req, res, next) => { // 返回结果
      // 跳过公开路由
      const publicPaths = ['/api/auth/login', '/api/health']; // 定义常量 publicPaths
      if (publicPaths.some(p => req.path.startsWith(p))) { // 条件判断 publicPaths.some(p => req.path.startsWith(p))
        return next(); // 返回结果
      } // 结束代码块

      if (!this.canAccessRoute(req.user, req.method, req.path)) { // 条件判断 !this.canAccessRoute(req.user, req.method, re...
        const required = this.getRouteRequiredPermissions(req.method, req.path); // 定义常量 required
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Insufficient permissions', // 错误
          code: 'FORBIDDEN', // 代码
          required, // 执行语句
        }); // 结束代码块
      } // 结束代码块

      next(); // 调用 next
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取角色列表
   */
  getRoles() { // 调用 getRoles
    return Object.values(Role); // 返回结果
  } // 结束代码块

  /**
   * 获取权限列表
   */
  getPermissions() { // 调用 getPermissions
    return Object.values(Permission); // 返回结果
  } // 结束代码块

  /**
   * 获取角色权限映射
   */
  getRolePermissionsMap() { // 调用 getRolePermissionsMap
    return { ...this.rolePermissions }; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 权限检查装饰器 (用于类方法)
 */
export function RequirePermission(permission) { // 导出函数 RequirePermission
  return function (target, propertyKey, descriptor) { // 返回结果
    const originalMethod = descriptor.value; // 定义常量 originalMethod

    descriptor.value = function (...args) { // 赋值 descriptor.value
      const req = args[0]; // 定义常量 req
      const res = args[1]; // 定义常量 res

      if (!req.user) { // 条件判断 !req.user
        return res.status(401).json({ // 返回结果
          success: false, // 成功标记
          error: 'Authentication required', // 错误
          code: 'UNAUTHORIZED', // 代码
        }); // 结束代码块
      } // 结束代码块

      const rbac = new RBACManager(); // 定义常量 rbac
      if (!rbac.hasPermission(req.user, permission)) { // 条件判断 !rbac.hasPermission(req.user, permission)
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Insufficient permissions', // 错误
          code: 'FORBIDDEN', // 代码
          required: [permission], // required
        }); // 结束代码块
      } // 结束代码块

      return originalMethod.apply(this, args); // 返回结果
    }; // 结束代码块

    return descriptor; // 返回结果
  }; // 结束代码块
} // 结束代码块

export default RBACManager; // 默认导出
