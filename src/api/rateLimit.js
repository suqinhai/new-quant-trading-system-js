/**
 * API 限流配置
 * Rate Limiting Module
 *
 * @module src/api/rateLimit
 */

import { SafeMap, SafeTTLMap, AsyncLock } from '../utils/SafeCollection.js';

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

    // 使用线程安全的 Map 存储限流计数
    // Use thread-safe Map for rate limit counters
    this.stores = new SafeMap();

    // 使用带 TTL 的线程安全 Map 存储封禁信息
    // Use TTL-enabled thread-safe Map for block info
    this.blocked = new SafeTTLMap(30 * 60 * 1000); // 默认 30 分钟过期

    // 每个 key 的锁，用于原子复合操作
    // Per-key locks for atomic compound operations
    this._keyLocks = new Map();

    // 定期清理过期数据
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * 获取 key 对应的锁
   * @private
   */
  _getLock(key) {
    if (!this._keyLocks.has(key)) {
      this._keyLocks.set(key, new AsyncLock());
    }
    return this._keyLocks.get(key);
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
    // SafeTTLMap 的 has() 方法已经考虑了过期
    // SafeTTLMap.has() already considers expiry
    return this.blocked.has(key);
  }

  /**
   * 封禁客户端
   */
  async block(key, duration) {
    await this.blocked.set(key, {
      until: Date.now() + duration,
      blockedAt: Date.now(),
    }, duration);
  }

  /**
   * 滑动窗口限流检查 (线程安全)
   * Thread-safe sliding window rate limit check
   */
  async checkSlidingWindow(key, config, role) {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // 计算限流上限 (考虑角色加成)
    const roleConfig = this.config.roles[role] || { multiplier: 1 };
    const maxRequests = Math.floor(config.maxRequests * roleConfig.multiplier);

    // 使用原子操作更新时间戳数组
    // Use atomic operation to update timestamps array
    const result = await this.stores.compute(key, (k, timestamps) => {
      // 初始化或获取时间戳数组
      let arr = timestamps || [];

      // 移除窗口外的时间戳 (原子操作内)
      // Remove expired timestamps (within atomic operation)
      arr = arr.filter(ts => ts >= windowStart);

      // 检查是否超限
      if (arr.length >= maxRequests) {
        // 超限，不添加新时间戳，返回当前数组
        return { timestamps: arr, allowed: false };
      }

      // 未超限，添加新时间戳
      arr.push(now);
      return { timestamps: arr, allowed: true };
    });

    const timestamps = result.timestamps;
    const allowed = result.allowed;

    if (!allowed) {
      return {
        allowed: false,
        remaining: 0,
        limit: maxRequests,
        reset: timestamps[0] + config.windowMs,
        retryAfter: Math.ceil((timestamps[0] + config.windowMs - now) / 1000),
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - timestamps.length,
      limit: maxRequests,
      reset: now + config.windowMs,
    };
  }

  /**
   * 固定窗口限流检查 (线程安全)
   * Thread-safe fixed window rate limit check
   */
  async checkFixedWindow(key, config, role) {
    const now = Date.now();
    const windowKey = `${key}:${Math.floor(now / config.windowMs)}`;

    // 计算限流上限
    const roleConfig = this.config.roles[role] || { multiplier: 1 };
    const maxRequests = Math.floor(config.maxRequests * roleConfig.multiplier);

    // 使用原子操作更新计数
    // Use atomic operation to update count
    const result = await this.stores.compute(windowKey, (k, window) => {
      // 初始化或获取窗口数据
      const data = window || { count: 0, windowStart: now };

      // 检查是否超限
      if (data.count >= maxRequests) {
        return { ...data, allowed: false };
      }

      // 未超限，增加计数
      return { count: data.count + 1, windowStart: data.windowStart, allowed: true };
    });

    const reset = result.windowStart + config.windowMs;

    if (!result.allowed) {
      return {
        allowed: false,
        remaining: 0,
        limit: maxRequests,
        reset,
        retryAfter: Math.ceil((reset - now) / 1000),
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - result.count,
      limit: maxRequests,
      reset,
    };
  }

  /**
   * 限流检查 (线程安全)
   * Thread-safe rate limit check
   */
  async check(req) {
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
        reset: blockInfo?.until || Date.now() + 60000,
        retryAfter: blockInfo ? Math.ceil((blockInfo.until - Date.now()) / 1000) : 60,
        blocked: true,
      };
    }

    const routeConfig = this.getRouteConfig(req.path);
    const role = req.user?.role || 'viewer';
    const strategy = routeConfig.strategy || this.config.global.strategy;

    let result;
    if (strategy === RateLimitStrategy.FIXED_WINDOW) {
      result = await this.checkFixedWindow(`${key}:${req.path}`, routeConfig, role);
    } else {
      result = await this.checkSlidingWindow(`${key}:${req.path}`, routeConfig, role);
    }

    // 超限封禁
    if (!result.allowed && routeConfig.blockDuration) {
      await this.block(key, routeConfig.blockDuration);
    }

    return result;
  }

  /**
   * Express 中间件 (异步)
   * Express middleware (async)
   */
  middleware() {
    return async (req, res, next) => {
      const result = await this.check(req);

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
   * 清理过期数据 (线程安全)
   * Thread-safe cleanup of expired data
   */
  async cleanup() {
    const now = Date.now();
    const maxWindow = Math.max(
      this.config.global.windowMs,
      ...Object.values(this.config.routes).map(r => r.windowMs || 0)
    );

    // 使用 SafeMap 的 cleanupExpired 方法安全清理
    // Use SafeMap's cleanupExpired for safe cleanup
    await this.stores.cleanupExpired((value, key) => {
      // 滑动窗口数据：检查时间戳数组是否为空或全部过期
      if (Array.isArray(value)) {
        const validTimestamps = value.filter(ts => ts >= now - maxWindow);
        return validTimestamps.length === 0;
      }

      // 固定窗口数据：检查是否过期
      if (value && typeof value === 'object' && value.windowStart) {
        return value.windowStart + maxWindow * 2 < now;
      }

      // 其他类型数据：检查 key 中的窗口编号
      if (typeof key === 'string' && key.includes(':')) {
        const parts = key.split(':');
        const windowNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(windowNum)) {
          return windowNum * maxWindow < now - maxWindow * 2;
        }
      }

      return false;
    });

    // SafeTTLMap 会自动清理过期的封禁记录
    // SafeTTLMap automatically cleans up expired block records

    // 清理未使用的 key 锁
    // Cleanup unused key locks
    for (const [key] of this._keyLocks) {
      if (!this.stores.has(key)) {
        this._keyLocks.delete(key);
      }
    }
  }

  /**
   * 重置客户端限流 (线程安全)
   * Thread-safe reset client rate limit
   */
  async reset(clientKey) {
    const keysToDelete = [];
    for (const key of this.stores.keys()) {
      if (key.startsWith(clientKey)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.stores.delete(key);
    }

    await this.blocked.delete(clientKey);
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
   * 销毁限流器 (线程安全)
   * Thread-safe destroy rate limiter
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.stores.clearSync();
    this.blocked.destroy();
    this._keyLocks.clear();
  }
}

export default RateLimiter;
