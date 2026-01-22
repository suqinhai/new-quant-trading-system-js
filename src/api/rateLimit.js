/**
 * API 限流配置
 * Rate Limiting Module
 *
 * @module src/api/rateLimit
 */

import { SafeMap, SafeTTLMap, AsyncLock } from '../utils/SafeCollection.js'; // 导入模块 ../utils/SafeCollection.js

/**
 * 限流策略枚举
 */
export const RateLimitStrategy = { // 导出常量 RateLimitStrategy
  FIXED_WINDOW: 'fixed_window',      // 固定窗口
  SLIDING_WINDOW: 'sliding_window',   // 滑动窗口
  TOKEN_BUCKET: 'token_bucket',       // 令牌桶
  LEAKY_BUCKET: 'leaky_bucket',       // 漏桶
}; // 结束代码块

/**
 * 默认限流配置
 */
export const DEFAULT_RATE_LIMIT_CONFIG = { // 导出常量 DEFAULT_RATE_LIMIT_CONFIG
  // 全局限流
  global: { // 设置 global 字段
    windowMs: 60 * 1000,        // 1 分钟
    maxRequests: 100,           // 最大请求数
    strategy: RateLimitStrategy.SLIDING_WINDOW, // 设置 strategy 字段
  }, // 结束代码块

  // 按路由限流
  routes: { // 设置 routes 字段
    // 认证相关 - 严格限流
    '/api/auth/login': { // 执行语句
      windowMs: 15 * 60 * 1000,  // 15 分钟
      maxRequests: 5,            // 最多 5 次
      blockDuration: 30 * 60 * 1000, // 超限后封禁 30 分钟
    }, // 结束代码块
    '/api/auth/refresh': { // 执行语句
      windowMs: 60 * 1000, // 设置 windowMs 字段
      maxRequests: 10, // 设置 maxRequests 字段
    }, // 结束代码块

    // 交易操作 - 中等限流
    '/api/positions/*/close': { // 执行语句
      windowMs: 60 * 1000, // 设置 windowMs 字段
      maxRequests: 20, // 设置 maxRequests 字段
    }, // 结束代码块
    '/api/strategies/*/start': { // 执行语句
      windowMs: 60 * 1000, // 设置 windowMs 字段
      maxRequests: 10, // 设置 maxRequests 字段
    }, // 结束代码块
    '/api/strategies/*/stop': { // 执行语句
      windowMs: 60 * 1000, // 设置 windowMs 字段
      maxRequests: 10, // 设置 maxRequests 字段
    }, // 结束代码块

    // 数据查询 - 宽松限流
    '/api/dashboard/*': { // 执行语句
      windowMs: 60 * 1000, // 设置 windowMs 字段
      maxRequests: 60, // 设置 maxRequests 字段
    }, // 结束代码块
    '/api/trades': { // 执行语句
      windowMs: 60 * 1000, // 设置 windowMs 字段
      maxRequests: 30, // 设置 maxRequests 字段
    }, // 结束代码块
    '/api/positions': { // 执行语句
      windowMs: 60 * 1000, // 设置 windowMs 字段
      maxRequests: 60, // 设置 maxRequests 字段
    }, // 结束代码块

    // 导出操作 - 严格限流
    '/api/trades/export': { // 执行语句
      windowMs: 60 * 60 * 1000,  // 1 小时
      maxRequests: 10, // 设置 maxRequests 字段
    }, // 结束代码块

    // 系统配置 - 严格限流
    '/api/system/config': { // 执行语句
      windowMs: 60 * 1000, // 设置 windowMs 字段
      maxRequests: 10, // 设置 maxRequests 字段
    }, // 结束代码块
    '/api/risk/config': { // 执行语句
      windowMs: 60 * 1000, // 设置 windowMs 字段
      maxRequests: 10, // 设置 maxRequests 字段
    }, // 结束代码块
  }, // 结束代码块

  // 按用户角色限流
  roles: { // 设置 roles 字段
    admin: { // 设置 admin 字段
      multiplier: 2,  // 管理员限流上限 x2
    }, // 结束代码块
    trader: { // 设置 trader 字段
      multiplier: 1.5, // 设置 multiplier 字段
    }, // 结束代码块
    viewer: { // 设置 viewer 字段
      multiplier: 1, // 设置 multiplier 字段
    }, // 结束代码块
  }, // 结束代码块

  // 白名单 IP (不限流)
  whitelist: [ // 设置 whitelist 字段
    '127.0.0.1', // 执行语句
    '::1', // 执行语句
    // 'your-trusted-ip',
  ], // 结束数组或索引

  // 响应头配置
  headers: { // 设置 headers 字段
    remaining: 'X-RateLimit-Remaining', // 设置 remaining 字段
    limit: 'X-RateLimit-Limit', // 设置 limit 字段
    reset: 'X-RateLimit-Reset', // 设置 reset 字段
    retryAfter: 'Retry-After', // 设置 retryAfter 字段
  }, // 结束代码块
}; // 结束代码块

/**
 * 限流器类
 */
export class RateLimiter { // 导出类 RateLimiter
  constructor(config = {}) { // 构造函数
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config }; // 设置 config

    // 使用线程安全的 Map 存储限流计数
    // Use thread-safe Map for rate limit counters
    this.stores = new SafeMap(); // 设置 stores

    // 使用带 TTL 的线程安全 Map 存储封禁信息
    // Use TTL-enabled thread-safe Map for block info
    this.blocked = new SafeTTLMap(30 * 60 * 1000); // 默认 30 分钟过期

    // 每个 key 的锁，用于原子复合操作
    // Per-key locks for atomic compound operations
    this._keyLocks = new Map(); // 设置 _keyLocks

    // 定期清理过期数据
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000); // 设置 cleanupInterval
  } // 结束代码块

  /**
   * 获取 key 对应的锁
   * @private
   */
  _getLock(key) { // 调用 _getLock
    if (!this._keyLocks.has(key)) { // 条件判断 !this._keyLocks.has(key)
      this._keyLocks.set(key, new AsyncLock()); // 访问 _keyLocks
    } // 结束代码块
    return this._keyLocks.get(key); // 返回结果
  } // 结束代码块

  /**
   * 获取客户端标识
   */
  getClientKey(req) { // 调用 getClientKey
    // 优先使用用户 ID，否则使用 IP
    if (req.user?.sub) { // 条件判断 req.user?.sub
      return `user:${req.user.sub}`; // 返回结果
    } // 结束代码块

    const forwarded = req.headers['x-forwarded-for']; // 定义常量 forwarded
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress; // 定义常量 ip
    return `ip:${ip}`; // 返回结果
  } // 结束代码块

  /**
   * 获取路由配置
   */
  getRouteConfig(path) { // 调用 getRouteConfig
    // 精确匹配
    if (this.config.routes[path]) { // 条件判断 this.config.routes[path]
      return this.config.routes[path]; // 返回结果
    } // 结束代码块

    // 通配符匹配
    for (const [pattern, config] of Object.entries(this.config.routes)) { // 循环 const [pattern, config] of Object.entries(thi...
      if (this.matchPattern(path, pattern)) { // 条件判断 this.matchPattern(path, pattern)
        return config; // 返回结果
      } // 结束代码块
    } // 结束代码块

    return this.config.global; // 返回结果
  } // 结束代码块

  /**
   * 通配符匹配
   */
  matchPattern(path, pattern) { // 调用 matchPattern
    const regexPattern = pattern // 定义常量 regexPattern
      .replace(/\*/g, '[^/]+') // 执行语句
      .replace(/\//g, '\\/');
    const regex = new RegExp(`^${regexPattern}$`); // 定义常量 regex
    return regex.test(path); // 返回结果
  } // 结束代码块

  /**
   * 检查是否在白名单
   */
  isWhitelisted(req) { // 调用 isWhitelisted
    const forwarded = req.headers['x-forwarded-for']; // 定义常量 forwarded
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress; // 定义常量 ip
    return this.config.whitelist.includes(ip); // 返回结果
  } // 结束代码块

  /**
   * 检查是否被封禁
   */
  isBlocked(key) { // 调用 isBlocked
    // SafeTTLMap 的 has() 方法已经考虑了过期
    // SafeTTLMap.has() already considers expiry
    return this.blocked.has(key); // 返回结果
  } // 结束代码块

  /**
   * 封禁客户端
   */
  async block(key, duration) { // 执行语句
    await this.blocked.set(key, { // 等待异步结果
      until: Date.now() + duration, // 设置 until 字段
      blockedAt: Date.now(), // 设置 blockedAt 字段
    }, duration); // 执行语句
  } // 结束代码块

  /**
   * 滑动窗口限流检查 (线程安全)
   * Thread-safe sliding window rate limit check
   */
  async checkSlidingWindow(key, config, role) { // 执行语句
    const now = Date.now(); // 定义常量 now
    const windowStart = now - config.windowMs; // 定义常量 windowStart

    // 计算限流上限 (考虑角色加成)
    const roleConfig = this.config.roles[role] || { multiplier: 1 }; // 定义常量 roleConfig
    const maxRequests = Math.floor(config.maxRequests * roleConfig.multiplier); // 定义常量 maxRequests

    // 使用原子操作更新时间戳数组
    // Use atomic operation to update timestamps array
    const result = await this.stores.compute(key, (k, timestamps) => { // 定义函数 result
      // 初始化或获取时间戳数组
      let arr = timestamps || []; // 定义变量 arr

      // 移除窗口外的时间戳 (原子操作内)
      // Remove expired timestamps (within atomic operation)
      arr = arr.filter(ts => ts >= windowStart); // 赋值 arr

      // 检查是否超限
      if (arr.length >= maxRequests) { // 条件判断 arr.length >= maxRequests
        // 超限，不添加新时间戳，返回当前数组
        return { timestamps: arr, allowed: false }; // 返回结果
      } // 结束代码块

      // 未超限，添加新时间戳
      arr.push(now); // 调用 arr.push
      return { timestamps: arr, allowed: true }; // 返回结果
    }); // 结束代码块

    const timestamps = result.timestamps; // 定义常量 timestamps
    const allowed = result.allowed; // 定义常量 allowed

    if (!allowed) { // 条件判断 !allowed
      return { // 返回结果
        allowed: false, // 设置 allowed 字段
        remaining: 0, // 设置 remaining 字段
        limit: maxRequests, // 设置 limit 字段
        reset: timestamps[0] + config.windowMs, // 设置 reset 字段
        retryAfter: Math.ceil((timestamps[0] + config.windowMs - now) / 1000), // 设置 retryAfter 字段
      }; // 结束代码块
    } // 结束代码块

    return { // 返回结果
      allowed: true, // 设置 allowed 字段
      remaining: maxRequests - timestamps.length, // 设置 remaining 字段
      limit: maxRequests, // 设置 limit 字段
      reset: now + config.windowMs, // 设置 reset 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 固定窗口限流检查 (线程安全)
   * Thread-safe fixed window rate limit check
   */
  async checkFixedWindow(key, config, role) { // 执行语句
    const now = Date.now(); // 定义常量 now
    const windowKey = `${key}:${Math.floor(now / config.windowMs)}`; // 定义常量 windowKey

    // 计算限流上限
    const roleConfig = this.config.roles[role] || { multiplier: 1 }; // 定义常量 roleConfig
    const maxRequests = Math.floor(config.maxRequests * roleConfig.multiplier); // 定义常量 maxRequests

    // 使用原子操作更新计数
    // Use atomic operation to update count
    const result = await this.stores.compute(windowKey, (k, window) => { // 定义函数 result
      // 初始化或获取窗口数据
      const data = window || { count: 0, windowStart: now }; // 定义常量 data

      // 检查是否超限
      if (data.count >= maxRequests) { // 条件判断 data.count >= maxRequests
        return { ...data, allowed: false }; // 返回结果
      } // 结束代码块

      // 未超限，增加计数
      return { count: data.count + 1, windowStart: data.windowStart, allowed: true }; // 返回结果
    }); // 结束代码块

    const reset = result.windowStart + config.windowMs; // 定义常量 reset

    if (!result.allowed) { // 条件判断 !result.allowed
      return { // 返回结果
        allowed: false, // 设置 allowed 字段
        remaining: 0, // 设置 remaining 字段
        limit: maxRequests, // 设置 limit 字段
        reset, // 执行语句
        retryAfter: Math.ceil((reset - now) / 1000), // 设置 retryAfter 字段
      }; // 结束代码块
    } // 结束代码块

    return { // 返回结果
      allowed: true, // 设置 allowed 字段
      remaining: maxRequests - result.count, // 设置 remaining 字段
      limit: maxRequests, // 设置 limit 字段
      reset, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 限流检查 (线程安全)
   * Thread-safe rate limit check
   */
  async check(req) { // 执行语句
    // 白名单跳过
    if (this.isWhitelisted(req)) { // 条件判断 this.isWhitelisted(req)
      return { allowed: true, remaining: Infinity, limit: Infinity }; // 返回结果
    } // 结束代码块

    const key = this.getClientKey(req); // 定义常量 key

    // 检查封禁
    if (this.isBlocked(key)) { // 条件判断 this.isBlocked(key)
      const blockInfo = this.blocked.get(key); // 定义常量 blockInfo
      return { // 返回结果
        allowed: false, // 设置 allowed 字段
        remaining: 0, // 设置 remaining 字段
        limit: 0, // 设置 limit 字段
        reset: blockInfo?.until || Date.now() + 60000, // 设置 reset 字段
        retryAfter: blockInfo ? Math.ceil((blockInfo.until - Date.now()) / 1000) : 60, // 设置 retryAfter 字段
        blocked: true, // 设置 blocked 字段
      }; // 结束代码块
    } // 结束代码块

    const routeConfig = this.getRouteConfig(req.path); // 定义常量 routeConfig
    const role = req.user?.role || 'viewer'; // 定义常量 role
    const strategy = routeConfig.strategy || this.config.global.strategy; // 定义常量 strategy

    let result; // 定义变量 result
    if (strategy === RateLimitStrategy.FIXED_WINDOW) { // 条件判断 strategy === RateLimitStrategy.FIXED_WINDOW
      result = await this.checkFixedWindow(`${key}:${req.path}`, routeConfig, role); // 赋值 result
    } else { // 执行语句
      result = await this.checkSlidingWindow(`${key}:${req.path}`, routeConfig, role); // 赋值 result
    } // 结束代码块

    // 超限封禁
    if (!result.allowed && routeConfig.blockDuration) { // 条件判断 !result.allowed && routeConfig.blockDuration
      await this.block(key, routeConfig.blockDuration); // 等待异步结果
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * Express 中间件 (异步)
   * Express middleware (async)
   */
  middleware() { // 调用 middleware
    return async (req, res, next) => { // 返回结果
      const result = await this.check(req); // 定义常量 result

      // 设置响应头
      res.setHeader(this.config.headers.limit, result.limit); // 调用 res.setHeader
      res.setHeader(this.config.headers.remaining, result.remaining); // 调用 res.setHeader
      if (result.reset) { // 条件判断 result.reset
        res.setHeader(this.config.headers.reset, Math.ceil(result.reset / 1000)); // 调用 res.setHeader
      } // 结束代码块

      if (!result.allowed) { // 条件判断 !result.allowed
        res.setHeader(this.config.headers.retryAfter, result.retryAfter); // 调用 res.setHeader
        return res.status(429).json({ // 返回结果
          success: false, // 设置 success 字段
          error: result.blocked ? 'Client blocked due to too many requests' : 'Too many requests', // 设置 error 字段
          code: 'RATE_LIMIT_EXCEEDED', // 设置 code 字段
          retryAfter: result.retryAfter, // 设置 retryAfter 字段
        }); // 结束代码块
      } // 结束代码块

      next(); // 调用 next
    }; // 结束代码块
  } // 结束代码块

  /**
   * 清理过期数据 (线程安全)
   * Thread-safe cleanup of expired data
   */
  async cleanup() { // 执行语句
    const now = Date.now(); // 定义常量 now
    const maxWindow = Math.max( // 定义常量 maxWindow
      this.config.global.windowMs, // 访问 config
      ...Object.values(this.config.routes).map(r => r.windowMs || 0) // 展开对象或数组
    ); // 结束调用或参数

    // 使用 SafeMap 的 cleanupExpired 方法安全清理
    // Use SafeMap's cleanupExpired for safe cleanup
    await this.stores.cleanupExpired((value, key) => { // 等待异步结果
      // 滑动窗口数据：检查时间戳数组是否为空或全部过期
      if (Array.isArray(value)) { // 条件判断 Array.isArray(value)
        const validTimestamps = value.filter(ts => ts >= now - maxWindow); // 定义函数 validTimestamps
        return validTimestamps.length === 0; // 返回结果
      } // 结束代码块

      // 固定窗口数据：检查是否过期
      if (value && typeof value === 'object' && value.windowStart) { // 条件判断 value && typeof value === 'object' && value.w...
        return value.windowStart + maxWindow * 2 < now; // 返回结果
      } // 结束代码块

      // 其他类型数据：检查 key 中的窗口编号
      if (typeof key === 'string' && key.includes(':')) { // 条件判断 typeof key === 'string' && key.includes(':')
        const parts = key.split(':'); // 定义常量 parts
        const windowNum = parseInt(parts[parts.length - 1]); // 定义常量 windowNum
        if (!isNaN(windowNum)) { // 条件判断 !isNaN(windowNum)
          return windowNum * maxWindow < now - maxWindow * 2; // 返回结果
        } // 结束代码块
      } // 结束代码块

      return false; // 返回结果
    }); // 结束代码块

    // SafeTTLMap 会自动清理过期的封禁记录
    // SafeTTLMap automatically cleans up expired block records

    // 清理未使用的 key 锁
    // Cleanup unused key locks
    for (const [key] of this._keyLocks) { // 循环 const [key] of this._keyLocks
      if (!this.stores.has(key)) { // 条件判断 !this.stores.has(key)
        this._keyLocks.delete(key); // 访问 _keyLocks
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 重置客户端限流 (线程安全)
   * Thread-safe reset client rate limit
   */
  async reset(clientKey) { // 执行语句
    const keysToDelete = []; // 定义常量 keysToDelete
    for (const key of this.stores.keys()) { // 循环 const key of this.stores.keys()
      if (key.startsWith(clientKey)) { // 条件判断 key.startsWith(clientKey)
        keysToDelete.push(key); // 调用 keysToDelete.push
      } // 结束代码块
    } // 结束代码块

    for (const key of keysToDelete) { // 循环 const key of keysToDelete
      await this.stores.delete(key); // 等待异步结果
    } // 结束代码块

    await this.blocked.delete(clientKey); // 等待异步结果
  } // 结束代码块

  /**
   * 获取限流统计
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      activeClients: this.stores.size, // 设置 activeClients 字段
      blockedClients: this.blocked.size, // 设置 blockedClients 字段
      config: { // 设置 config 字段
        global: this.config.global, // 设置 global 字段
        routes: Object.keys(this.config.routes).length, // 设置 routes 字段
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 销毁限流器 (线程安全)
   * Thread-safe destroy rate limiter
   */
  destroy() { // 调用 destroy
    if (this.cleanupInterval) { // 条件判断 this.cleanupInterval
      clearInterval(this.cleanupInterval); // 调用 clearInterval
    } // 结束代码块
    this.stores.clearSync(); // 访问 stores
    this.blocked.destroy(); // 访问 blocked
    this._keyLocks.clear(); // 访问 _keyLocks
  } // 结束代码块
} // 结束代码块

export default RateLimiter; // 默认导出
