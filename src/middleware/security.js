/**
 * API 安全中间件
 * API Security Middleware
 *
 * 提供请求签名验证、IP白名单、速率限制等安全功能
 * Provides request signature verification, IP whitelist, rate limiting
 *
 * @module src/middleware/security
 */

import crypto from 'crypto'; // 导入模块 crypto

/**
 * 速率限制器类
 * Rate Limiter Class
 */
class RateLimiter { // 定义类 RateLimiter
  constructor(config = {}) { // 构造函数
    this.windowMs = config.windowMs || 60000; // 时间窗口 (默认1分钟)
    this.maxRequests = config.maxRequests || 100; // 最大请求数
    this.requests = new Map(); // IP -> { count, resetTime }

    // 定期清理过期记录
    this.cleanupInterval = setInterval(() => { // 设置 cleanupInterval
      this._cleanup(); // 调用 _cleanup
    }, this.windowMs); // 执行语句
  } // 结束代码块

  /**
   * 检查是否被限制
   * @param {string} key - 限制键 (IP 或 API Key)
   * @returns {{ allowed: boolean, remaining: number, resetTime: number }}
   */
  check(key) { // 调用 check
    const now = Date.now(); // 定义常量 now
    let record = this.requests.get(key); // 定义变量 record

    if (!record || now > record.resetTime) { // 条件判断 !record || now > record.resetTime
      record = { // 赋值 record
        count: 0, // 设置 count 字段
        resetTime: now + this.windowMs, // 设置 resetTime 字段
      }; // 结束代码块
      this.requests.set(key, record); // 访问 requests
    } // 结束代码块

    record.count++; // 执行语句
    const allowed = record.count <= this.maxRequests; // 定义常量 allowed
    const remaining = Math.max(0, this.maxRequests - record.count); // 定义常量 remaining

    return { // 返回结果
      allowed, // 执行语句
      remaining, // 执行语句
      resetTime: record.resetTime, // 设置 resetTime 字段
      retryAfter: allowed ? 0 : Math.ceil((record.resetTime - now) / 1000), // 设置 retryAfter 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 清理过期记录
   * @private
   */
  _cleanup() { // 调用 _cleanup
    const now = Date.now(); // 定义常量 now
    for (const [key, record] of this.requests) { // 循环 const [key, record] of this.requests
      if (now > record.resetTime) { // 条件判断 now > record.resetTime
        this.requests.delete(key); // 访问 requests
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 停止清理定时器
   */
  stop() { // 调用 stop
    if (this.cleanupInterval) { // 条件判断 this.cleanupInterval
      clearInterval(this.cleanupInterval); // 调用 clearInterval
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 安全管理器类
 * Security Manager Class
 */
class SecurityManager { // 定义类 SecurityManager
  constructor(config = {}) { // 构造函数
    this.config = { // 设置 config
      // 是否启用签名验证
      enableSignature: config.enableSignature ?? false, // 设置 enableSignature 字段
      // 签名密钥 (API Key -> Secret)
      apiKeys: config.apiKeys || new Map(), // 设置 apiKeys 字段
      // 签名过期时间 (毫秒)
      signatureExpiry: config.signatureExpiry || 30000, // 设置 signatureExpiry 字段
      // 是否启用 IP 白名单
      enableIpWhitelist: config.enableIpWhitelist ?? false, // 设置 enableIpWhitelist 字段
      // IP 白名单
      ipWhitelist: new Set(config.ipWhitelist || []), // 设置 ipWhitelist 字段
      // 是否启用速率限制
      enableRateLimit: config.enableRateLimit ?? true, // 设置 enableRateLimit 字段
      // 速率限制配置
      rateLimitWindow: config.rateLimitWindow || 60000, // 设置 rateLimitWindow 字段
      rateLimitMax: config.rateLimitMax || 100, // 设置 rateLimitMax 字段
      // 公开路径 (不需要认证)
      publicPaths: new Set(config.publicPaths || ['/health', '/api/health']), // 设置 publicPaths 字段
      // 是否启用防重放攻击
      enableNonceCheck: config.enableNonceCheck ?? true, // 设置 enableNonceCheck 字段
    }; // 结束代码块

    // 速率限制器
    this.rateLimiter = new RateLimiter({ // 设置 rateLimiter
      windowMs: this.config.rateLimitWindow, // 设置 windowMs 字段
      maxRequests: this.config.rateLimitMax, // 设置 maxRequests 字段
    }); // 结束代码块

    // 已使用的 nonce (防重放)
    this.usedNonces = new Map(); // nonce -> timestamp

    // 定期清理 nonce
    this.nonceCleanupInterval = setInterval(() => { // 设置 nonceCleanupInterval
      this._cleanupNonces(); // 调用 _cleanupNonces
    }, 60000); // 执行语句
  } // 结束代码块

  /**
   * 添加 API Key
   * @param {string} apiKey - API Key
   * @param {string} secret - Secret
   * @param {Object} options - 额外选项 (权限等)
   */
  addApiKey(apiKey, secret, options = {}) { // 调用 addApiKey
    this.config.apiKeys.set(apiKey, { // 访问 config
      secret, // 执行语句
      permissions: options.permissions || ['read'], // 设置 permissions 字段
      rateLimit: options.rateLimit || this.config.rateLimitMax, // 设置 rateLimit 字段
      createdAt: Date.now(), // 设置 createdAt 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 移除 API Key
   * @param {string} apiKey - API Key
   */
  removeApiKey(apiKey) { // 调用 removeApiKey
    this.config.apiKeys.delete(apiKey); // 访问 config
  } // 结束代码块

  /**
   * 添加 IP 到白名单
   * @param {string} ip - IP 地址
   */
  addToWhitelist(ip) { // 调用 addToWhitelist
    this.config.ipWhitelist.add(ip); // 访问 config
  } // 结束代码块

  /**
   * 从白名单移除 IP
   * @param {string} ip - IP 地址
   */
  removeFromWhitelist(ip) { // 调用 removeFromWhitelist
    this.config.ipWhitelist.delete(ip); // 访问 config
  } // 结束代码块

  /**
   * 验证请求签名
   * @param {Object} params - 请求参数
   * @returns {{ valid: boolean, error?: string }}
   */
  verifySignature(params) { // 调用 verifySignature
    const { apiKey, timestamp, nonce, signature, body = '' } = params; // 解构赋值

    // 检查 API Key 是否存在
    const keyInfo = this.config.apiKeys.get(apiKey); // 定义常量 keyInfo
    if (!keyInfo) { // 条件判断 !keyInfo
      return { valid: false, error: 'Invalid API key' }; // 返回结果
    } // 结束代码块

    // 检查时间戳
    const now = Date.now(); // 定义常量 now
    const ts = parseInt(timestamp, 10); // 定义常量 ts
    if (isNaN(ts) || Math.abs(now - ts) > this.config.signatureExpiry) { // 条件判断 isNaN(ts) || Math.abs(now - ts) > this.config...
      return { valid: false, error: 'Request expired' }; // 返回结果
    } // 结束代码块

    // 检查 nonce (防重放)
    if (this.config.enableNonceCheck) { // 条件判断 this.config.enableNonceCheck
      if (this.usedNonces.has(nonce)) { // 条件判断 this.usedNonces.has(nonce)
        return { valid: false, error: 'Nonce already used (replay attack detected)' }; // 返回结果
      } // 结束代码块
      this.usedNonces.set(nonce, now); // 访问 usedNonces
    } // 结束代码块

    // 计算签名
    const message = `${apiKey}${timestamp}${nonce}${body}`; // 定义常量 message
    const expectedSignature = crypto // 定义常量 expectedSignature
      .createHmac('sha256', keyInfo.secret) // 执行语句
      .update(message) // 执行语句
      .digest('hex'); // 执行语句

    // 使用时间安全比较
    const signatureBuffer = Buffer.from(signature, 'hex'); // 定义常量 signatureBuffer
    const expectedBuffer = Buffer.from(expectedSignature, 'hex'); // 定义常量 expectedBuffer

    if (signatureBuffer.length !== expectedBuffer.length) { // 条件判断 signatureBuffer.length !== expectedBuffer.length
      return { valid: false, error: 'Invalid signature' }; // 返回结果
    } // 结束代码块

    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) { // 条件判断 !crypto.timingSafeEqual(signatureBuffer, expe...
      return { valid: false, error: 'Invalid signature' }; // 返回结果
    } // 结束代码块

    return { valid: true, keyInfo }; // 返回结果
  } // 结束代码块

  /**
   * 检查 IP 是否在白名单
   * @param {string} ip - IP 地址
   * @returns {boolean}
   */
  isIpAllowed(ip) { // 调用 isIpAllowed
    if (!this.config.enableIpWhitelist) { // 条件判断 !this.config.enableIpWhitelist
      return true; // 返回结果
    } // 结束代码块

    // 标准化 IPv6 环回地址
    const normalizedIp = ip === '::1' ? '127.0.0.1' : ip; // 定义常量 normalizedIp

    // 检查是否在白名单
    if (this.config.ipWhitelist.has(normalizedIp)) { // 条件判断 this.config.ipWhitelist.has(normalizedIp)
      return true; // 返回结果
    } // 结束代码块

    // 检查 CIDR (简单实现)
    for (const allowed of this.config.ipWhitelist) { // 循环 const allowed of this.config.ipWhitelist
      if (allowed.includes('/')) { // 条件判断 allowed.includes('/')
        if (this._matchCIDR(normalizedIp, allowed)) { // 条件判断 this._matchCIDR(normalizedIp, allowed)
          return true; // 返回结果
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return false; // 返回结果
  } // 结束代码块

  /**
   * 简单的 CIDR 匹配
   * @private
   */
  _matchCIDR(ip, cidr) { // 调用 _matchCIDR
    const [range, bits] = cidr.split('/'); // 解构赋值
    const mask = parseInt(bits, 10); // 定义常量 mask

    // 简单实现：只支持 IPv4
    const ipNum = this._ipToNumber(ip); // 定义常量 ipNum
    const rangeNum = this._ipToNumber(range); // 定义常量 rangeNum

    if (ipNum === null || rangeNum === null) { // 条件判断 ipNum === null || rangeNum === null
      return false; // 返回结果
    } // 结束代码块

    const maskNum = ~((1 << (32 - mask)) - 1); // 定义常量 maskNum
    return (ipNum & maskNum) === (rangeNum & maskNum); // 返回结果
  } // 结束代码块

  /**
   * IP 转数字
   * @private
   */
  _ipToNumber(ip) { // 调用 _ipToNumber
    const parts = ip.split('.'); // 定义常量 parts
    if (parts.length !== 4) return null; // 条件判断 parts.length !== 4

    return parts.reduce((acc, part) => { // 返回结果
      const num = parseInt(part, 10); // 定义常量 num
      if (isNaN(num) || num < 0 || num > 255) return null; // 条件判断 isNaN(num) || num < 0 || num > 255
      return (acc << 8) + num; // 返回结果
    }, 0); // 执行语句
  } // 结束代码块

  /**
   * 清理过期的 nonce
   * @private
   */
  _cleanupNonces() { // 调用 _cleanupNonces
    const now = Date.now(); // 定义常量 now
    const expiry = this.config.signatureExpiry * 2; // 定义常量 expiry

    for (const [nonce, timestamp] of this.usedNonces) { // 循环 const [nonce, timestamp] of this.usedNonces
      if (now - timestamp > expiry) { // 条件判断 now - timestamp > expiry
        this.usedNonces.delete(nonce); // 访问 usedNonces
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取客户端 IP
   * @param {Object} req - Express 请求对象
   * @returns {string}
   */
  getClientIp(req) { // 调用 getClientIp
    return ( // 返回结果
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || // 执行语句
      req.headers['x-real-ip'] || // 执行语句
      req.connection?.remoteAddress || // 执行语句
      req.socket?.remoteAddress || // 执行语句
      'unknown' // 执行语句
    ); // 结束调用或参数
  } // 结束代码块

  /**
   * 停止所有定时器
   */
  stop() { // 调用 stop
    this.rateLimiter.stop(); // 访问 rateLimiter
    if (this.nonceCleanupInterval) { // 条件判断 this.nonceCleanupInterval
      clearInterval(this.nonceCleanupInterval); // 调用 clearInterval
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 创建安全中间件
 * @param {SecurityManager} securityManager - 安全管理器实例
 * @param {Object} options - 选项
 * @returns {Function} Express 中间件
 */
function createSecurityMiddleware(securityManager, options = {}) { // 定义函数 createSecurityMiddleware
  const auditLogger = options.auditLogger || null; // 定义常量 auditLogger

  return async (req, res, next) => { // 返回结果
    const startTime = Date.now(); // 定义常量 startTime
    const clientIp = securityManager.getClientIp(req); // 定义常量 clientIp
    const path = req.path; // 定义常量 path

    // 记录请求开始
    const requestInfo = { // 定义常量 requestInfo
      method: req.method, // 设置 method 字段
      path, // 执行语句
      ip: clientIp, // 设置 ip 字段
      userAgent: req.headers['user-agent'], // 设置 userAgent 字段
      timestamp: new Date().toISOString(), // 设置 timestamp 字段
    }; // 结束代码块

    // 检查是否是公开路径
    if (securityManager.config.publicPaths.has(path)) { // 条件判断 securityManager.config.publicPaths.has(path)
      if (auditLogger) { // 条件判断 auditLogger
        auditLogger.log('api_access', { ...requestInfo, public: true }); // 调用 auditLogger.log
      } // 结束代码块
      return next(); // 返回结果
    } // 结束代码块

    // IP 白名单检查
    if (securityManager.config.enableIpWhitelist) { // 条件判断 securityManager.config.enableIpWhitelist
      if (!securityManager.isIpAllowed(clientIp)) { // 条件判断 !securityManager.isIpAllowed(clientIp)
        if (auditLogger) { // 条件判断 auditLogger
          auditLogger.log('ip_blocked', { ...requestInfo, reason: 'not_in_whitelist' }); // 调用 auditLogger.log
        } // 结束代码块
        return res.status(403).json({ // 返回结果
          success: false, // 设置 success 字段
          error: 'Access denied: IP not in whitelist', // 设置 error 字段
          code: 'IP_BLOCKED', // 设置 code 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 速率限制检查
    if (securityManager.config.enableRateLimit) { // 条件判断 securityManager.config.enableRateLimit
      const rateLimitKey = req.headers['x-api-key'] || clientIp; // 定义常量 rateLimitKey
      const rateResult = securityManager.rateLimiter.check(rateLimitKey); // 定义常量 rateResult

      // 添加速率限制头
      res.set('X-RateLimit-Limit', securityManager.config.rateLimitMax); // 调用 res.set
      res.set('X-RateLimit-Remaining', rateResult.remaining); // 调用 res.set
      res.set('X-RateLimit-Reset', rateResult.resetTime); // 调用 res.set

      if (!rateResult.allowed) { // 条件判断 !rateResult.allowed
        res.set('Retry-After', rateResult.retryAfter); // 调用 res.set
        if (auditLogger) { // 条件判断 auditLogger
          auditLogger.log('rate_limited', { ...requestInfo, retryAfter: rateResult.retryAfter }); // 调用 auditLogger.log
        } // 结束代码块
        return res.status(429).json({ // 返回结果
          success: false, // 设置 success 字段
          error: 'Too many requests', // 设置 error 字段
          code: 'RATE_LIMITED', // 设置 code 字段
          retryAfter: rateResult.retryAfter, // 设置 retryAfter 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 签名验证
    if (securityManager.config.enableSignature) { // 条件判断 securityManager.config.enableSignature
      const apiKey = req.headers['x-api-key']; // 定义常量 apiKey
      const timestamp = req.headers['x-timestamp']; // 定义常量 timestamp
      const nonce = req.headers['x-nonce']; // 定义常量 nonce
      const signature = req.headers['x-signature']; // 定义常量 signature

      if (!apiKey || !timestamp || !nonce || !signature) { // 条件判断 !apiKey || !timestamp || !nonce || !signature
        if (auditLogger) { // 条件判断 auditLogger
          auditLogger.log('auth_failed', { ...requestInfo, reason: 'missing_headers' }); // 调用 auditLogger.log
        } // 结束代码块
        return res.status(401).json({ // 返回结果
          success: false, // 设置 success 字段
          error: 'Missing authentication headers', // 设置 error 字段
          code: 'AUTH_MISSING', // 设置 code 字段
          required: ['x-api-key', 'x-timestamp', 'x-nonce', 'x-signature'], // 设置 required 字段
        }); // 结束代码块
      } // 结束代码块

      // 获取请求体用于签名验证
      const bodyString = req.method !== 'GET' ? JSON.stringify(req.body) : ''; // 定义常量 bodyString

      const verifyResult = securityManager.verifySignature({ // 定义常量 verifyResult
        apiKey, // 执行语句
        timestamp, // 执行语句
        nonce, // 执行语句
        signature, // 执行语句
        body: bodyString, // 设置 body 字段
      }); // 结束代码块

      if (!verifyResult.valid) { // 条件判断 !verifyResult.valid
        if (auditLogger) { // 条件判断 auditLogger
          auditLogger.log('auth_failed', { ...requestInfo, reason: verifyResult.error }); // 调用 auditLogger.log
        } // 结束代码块
        return res.status(401).json({ // 返回结果
          success: false, // 设置 success 字段
          error: verifyResult.error, // 设置 error 字段
          code: 'AUTH_FAILED', // 设置 code 字段
        }); // 结束代码块
      } // 结束代码块

      // 附加密钥信息到请求
      req.apiKeyInfo = verifyResult.keyInfo; // 赋值 req.apiKeyInfo
    } // 结束代码块

    // 成功通过安全检查
    if (auditLogger) { // 条件判断 auditLogger
      // 在响应完成后记录
      res.on('finish', () => { // 注册事件监听
        auditLogger.log('api_access', { // 调用 auditLogger.log
          ...requestInfo, // 展开对象或数组
          statusCode: res.statusCode, // 设置 statusCode 字段
          duration: Date.now() - startTime, // 设置 duration 字段
          authenticated: !!req.apiKeyInfo, // 设置 authenticated 字段
        }); // 结束代码块
      }); // 结束代码块
    } // 结束代码块

    next(); // 调用 next
  }; // 结束代码块
} // 结束代码块

/**
 * 生成签名 (客户端使用)
 * @param {Object} params - 参数
 * @returns {Object} 签名信息
 */
function generateSignature(params) { // 定义函数 generateSignature
  const { apiKey, secret, body = '' } = params; // 解构赋值
  const timestamp = Date.now().toString(); // 定义常量 timestamp
  const nonce = crypto.randomBytes(16).toString('hex'); // 定义常量 nonce

  const message = `${apiKey}${timestamp}${nonce}${body}`; // 定义常量 message
  const signature = crypto // 定义常量 signature
    .createHmac('sha256', secret) // 执行语句
    .update(message) // 执行语句
    .digest('hex'); // 执行语句

  return { // 返回结果
    timestamp, // 执行语句
    nonce, // 执行语句
    signature, // 执行语句
    headers: { // 设置 headers 字段
      'X-Api-Key': apiKey, // 设置 X-Api-Key 字段
      'X-Timestamp': timestamp, // 设置 X-Timestamp 字段
      'X-Nonce': nonce, // 设置 X-Nonce 字段
      'X-Signature': signature, // 设置 X-Signature 字段
    }, // 结束代码块
  }; // 结束代码块
} // 结束代码块

export { // 导出命名成员
  SecurityManager, // 执行语句
  RateLimiter, // 执行语句
  createSecurityMiddleware, // 执行语句
  generateSignature, // 执行语句
}; // 结束代码块

export default SecurityManager; // 默认导出
