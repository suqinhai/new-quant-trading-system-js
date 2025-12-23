/**
 * API 限流配置
 * Rate Limiting Module
 *
 * @module src/api/rateLimit
 */

/**
 * 限流策略枚举
 */
export const RateLimitStrategy = {
  FIXED_WINDOW: 'fixed_window',      // 固定窗口
  SLIDING_WINDOW: 'sliding_window',   // 滑动窗口
  TOKEN_BUCKET: 'token_bucket',       // 令牌桶
  LEAKY_BUCKET: 'leaky_bucket',       // 漏桶
};

/**
 * 默认限流配置
 */
export const DEFAULT_RATE_LIMIT_CONFIG = {
  // 全局限流
  global: {
    windowMs: 60 * 1000,        // 1 分钟
    maxRequests: 100,           // 最大请求数
    strategy: RateLimitStrategy.SLIDING_WINDOW,
  },

  // 按路由限流
  routes: {
    // 认证相关 - 严格限流
    '/api/auth/login': {
      windowMs: 15 * 60 * 1000,  // 15 分钟
      maxRequests: 5,            // 最多 5 次
      blockDuration: 30 * 60 * 1000, // 超限后封禁 30 分钟
    },
    '/api/auth/refresh': {
      windowMs: 60 * 1000,
      maxRequests: 10,
    },

    // 交易操作 - 中等限流
    '/api/positions/*/close': {
      windowMs: 60 * 1000,
      maxRequests: 20,
    },
    '/api/strategies/*/start': {
      windowMs: 60 * 1000,
      maxRequests: 10,
    },
    '/api/strategies/*/stop': {
      windowMs: 60 * 1000,
      maxRequests: 10,
    },

    // 数据查询 - 宽松限流
    '/api/dashboard/*': {
      windowMs: 60 * 1000,
      maxRequests: 60,
    },
    '/api/trades': {
      windowMs: 60 * 1000,
      maxRequests: 30,
    },
    '/api/positions': {
      windowMs: 60 * 1000,
      maxRequests: 60,
    },

    // 导出操作 - 严格限流
    '/api/trades/export': {
      windowMs: 60 * 60 * 1000,  // 1 小时
      maxRequests: 10,
    },

    // 系统配置 - 严格限流
    '/api/system/config': {
      windowMs: 60 * 1000,
      maxRequests: 10,
    },
    '/api/risk/config': {
      windowMs: 60 * 1000,
      maxRequests: 10,
    },
  },

  // 按用户角色限流
  roles: {
    admin: {
      multiplier: 2,  // 管理员限流上限 x2
    },
    trader: {
      multiplier: 1.5,
    },
    viewer: {
      multiplier: 1,
    },
  },

  // 白名单 IP (不限流)
  whitelist: [
    '127.0.0.1',
    '::1',
    // 'your-trusted-ip',
  ],

  // 响应头配置
  headers: {
    remaining: 'X-RateLimit-Remaining',
    limit: 'X-RateLimit-Limit',
    reset: 'X-RateLimit-Reset',
    retryAfter: 'Retry-After',
  },
};

/**
 * 限流器类
 */
export class RateLimiter {
  constructor(config = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
    this.stores = new Map();  // 存储限流计数
    this.blocked = new Map(); // 存储封禁信息

    // 定期清理过期数据
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * 获取客户端标识
   */
  getClientKey(req) {
    // 优先使用用户 ID，否则使用 IP
    if (req.user?.sub) {
      return `user:${req.user.sub}`;
    }

    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
    return `ip:${ip}`;
  }

  /**
   * 获取路由配置
   */
  getRouteConfig(path) {
    // 精确匹配
    if (this.config.routes[path]) {
      return this.config.routes[path];
    }

    // 通配符匹配
    for (const [pattern, config] of Object.entries(this.config.routes)) {
      if (this.matchPattern(path, pattern)) {
        return config;
      }
    }

    return this.config.global;
  }

  /**
   * 通配符匹配
   */
  matchPattern(path, pattern) {
    const regexPattern = pattern
      .replace(/\*/g, '[^/]+')
      .replace(/\//g, '\\/');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * 检查是否在白名单
   */
  isWhitelisted(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
    return this.config.whitelist.includes(ip);
  }

  /**
   * 检查是否被封禁
   */
  isBlocked(key) {
    const blockInfo = this.blocked.get(key);
    if (!blockInfo) return false;

    if (Date.now() > blockInfo.until) {
      this.blocked.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 封禁客户端
   */
  block(key, duration) {
    this.blocked.set(key, {
      until: Date.now() + duration,
      blockedAt: Date.now(),
    });
  }

  /**
   * 滑动窗口限流检查
   */
  checkSlidingWindow(key, config, role) {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // 获取或创建存储
    if (!this.stores.has(key)) {
      this.stores.set(key, []);
    }

    const timestamps = this.stores.get(key);

    // 移除窗口外的时间戳
    while (timestamps.length > 0 && timestamps[0] < windowStart) {
      timestamps.shift();
    }

    // 计算限流上限 (考虑角色加成)
    const roleConfig = this.config.roles[role] || { multiplier: 1 };
    const maxRequests = Math.floor(config.maxRequests * roleConfig.multiplier);

    // 检查是否超限
    if (timestamps.length >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        limit: maxRequests,
        reset: timestamps[0] + config.windowMs,
        retryAfter: Math.ceil((timestamps[0] + config.windowMs - now) / 1000),
      };
    }

    // 记录请求
    timestamps.push(now);

    return {
      allowed: true,
      remaining: maxRequests - timestamps.length,
      limit: maxRequests,
      reset: now + config.windowMs,
    };
  }

  /**
   * 固定窗口限流检查
   */
  checkFixedWindow(key, config, role) {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / config.windowMs)}`;

    if (!this.stores.has(windowKey)) {
      this.stores.set(windowKey, { count: 0, windowStart: now });
    }

    const window = this.stores.get(windowKey);

    // 计算限流上限
    const roleConfig = this.config.roles[role] || { multiplier: 1 };
    const maxRequests = Math.floor(config.maxRequests * roleConfig.multiplier);

    if (window.count >= maxRequests) {
      const reset = window.windowStart + config.windowMs;
      return {
        allowed: false,
        remaining: 0,
        limit: maxRequests,
        reset,
        retryAfter: Math.ceil((reset - now) / 1000),
      };
    }

    window.count++;

    return {
      allowed: true,
      remaining: maxRequests - window.count,
      limit: maxRequests,
      reset: window.windowStart + config.windowMs,
    };
  }

  /**
   * 限流检查
   */
  check(req) {
    // 白名单跳过
    if (this.isWhitelisted(req)) {
      return { allowed: true, remaining: Infinity, limit: Infinity };
    }

    const key = this.getClientKey(req);

    // 检查封禁
    if (this.isBlocked(key)) {
      const blockInfo = this.blocked.get(key);
      return {
        allowed: false,
        remaining: 0,
        limit: 0,
        reset: blockInfo.until,
        retryAfter: Math.ceil((blockInfo.until - Date.now()) / 1000),
        blocked: true,
      };
    }

    const routeConfig = this.getRouteConfig(req.path);
    const role = req.user?.role || 'viewer';
    const strategy = routeConfig.strategy || this.config.global.strategy;

    let result;
    if (strategy === RateLimitStrategy.FIXED_WINDOW) {
      result = this.checkFixedWindow(`${key}:${req.path}`, routeConfig, role);
    } else {
      result = this.checkSlidingWindow(`${key}:${req.path}`, routeConfig, role);
    }

    // 超限封禁
    if (!result.allowed && routeConfig.blockDuration) {
      this.block(key, routeConfig.blockDuration);
    }

    return result;
  }

  /**
   * Express 中间件
   */
  middleware() {
    return (req, res, next) => {
      const result = this.check(req);

      // 设置响应头
      res.setHeader(this.config.headers.limit, result.limit);
      res.setHeader(this.config.headers.remaining, result.remaining);
      if (result.reset) {
        res.setHeader(this.config.headers.reset, Math.ceil(result.reset / 1000));
      }

      if (!result.allowed) {
        res.setHeader(this.config.headers.retryAfter, result.retryAfter);
        return res.status(429).json({
          success: false,
          error: result.blocked ? 'Client blocked due to too many requests' : 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: result.retryAfter,
        });
      }

      next();
    };
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();

    // 清理滑动窗口数据
    for (const [key, timestamps] of this.stores.entries()) {
      if (Array.isArray(timestamps)) {
        const maxWindow = Math.max(
          this.config.global.windowMs,
          ...Object.values(this.config.routes).map(r => r.windowMs || 0)
        );
        while (timestamps.length > 0 && timestamps[0] < now - maxWindow) {
          timestamps.shift();
        }
        if (timestamps.length === 0) {
          this.stores.delete(key);
        }
      }
    }

    // 清理固定窗口数据 (带时间戳的 key)
    for (const [key] of this.stores.entries()) {
      if (key.includes(':') && !key.startsWith('user:') && !key.startsWith('ip:')) {
        const parts = key.split(':');
        const windowNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(windowNum)) {
          const maxWindow = Math.max(
            this.config.global.windowMs,
            ...Object.values(this.config.routes).map(r => r.windowMs || 0)
          );
          if (windowNum * maxWindow < now - maxWindow * 2) {
            this.stores.delete(key);
          }
        }
      }
    }

    // 清理过期封禁
    for (const [key, info] of this.blocked.entries()) {
      if (info.until < now) {
        this.blocked.delete(key);
      }
    }
  }

  /**
   * 重置客户端限流
   */
  reset(clientKey) {
    for (const [key] of this.stores.entries()) {
      if (key.startsWith(clientKey)) {
        this.stores.delete(key);
      }
    }
    this.blocked.delete(clientKey);
  }

  /**
   * 获取限流统计
   */
  getStats() {
    return {
      activeClients: this.stores.size,
      blockedClients: this.blocked.size,
      config: {
        global: this.config.global,
        routes: Object.keys(this.config.routes).length,
      },
    };
  }

  /**
   * 销毁限流器
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.stores.clear();
    this.blocked.clear();
  }
}

export default RateLimiter;
