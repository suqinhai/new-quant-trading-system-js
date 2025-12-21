/**
 * API 安全中间件
 * API Security Middleware
 *
 * 提供请求签名验证、IP白名单、速率限制等安全功能
 * Provides request signature verification, IP whitelist, rate limiting
 *
 * @module src/middleware/security
 */

import crypto from 'crypto';

/**
 * 速率限制器类
 * Rate Limiter Class
 */
class RateLimiter {
  constructor(config = {}) {
    this.windowMs = config.windowMs || 60000; // 时间窗口 (默认1分钟)
    this.maxRequests = config.maxRequests || 100; // 最大请求数
    this.requests = new Map(); // IP -> { count, resetTime }

    // 定期清理过期记录
    this.cleanupInterval = setInterval(() => {
      this._cleanup();
    }, this.windowMs);
  }

  /**
   * 检查是否被限制
   * @param {string} key - 限制键 (IP 或 API Key)
   * @returns {{ allowed: boolean, remaining: number, resetTime: number }}
   */
  check(key) {
    const now = Date.now();
    let record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + this.windowMs,
      };
      this.requests.set(key, record);
    }

    record.count++;
    const allowed = record.count <= this.maxRequests;
    const remaining = Math.max(0, this.maxRequests - record.count);

    return {
      allowed,
      remaining,
      resetTime: record.resetTime,
      retryAfter: allowed ? 0 : Math.ceil((record.resetTime - now) / 1000),
    };
  }

  /**
   * 清理过期记录
   * @private
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * 停止清理定时器
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * 安全管理器类
 * Security Manager Class
 */
class SecurityManager {
  constructor(config = {}) {
    this.config = {
      // 是否启用签名验证
      enableSignature: config.enableSignature ?? false,
      // 签名密钥 (API Key -> Secret)
      apiKeys: config.apiKeys || new Map(),
      // 签名过期时间 (毫秒)
      signatureExpiry: config.signatureExpiry || 30000,
      // 是否启用 IP 白名单
      enableIpWhitelist: config.enableIpWhitelist ?? false,
      // IP 白名单
      ipWhitelist: new Set(config.ipWhitelist || []),
      // 是否启用速率限制
      enableRateLimit: config.enableRateLimit ?? true,
      // 速率限制配置
      rateLimitWindow: config.rateLimitWindow || 60000,
      rateLimitMax: config.rateLimitMax || 100,
      // 公开路径 (不需要认证)
      publicPaths: new Set(config.publicPaths || ['/health', '/api/health']),
      // 是否启用防重放攻击
      enableNonceCheck: config.enableNonceCheck ?? true,
    };

    // 速率限制器
    this.rateLimiter = new RateLimiter({
      windowMs: this.config.rateLimitWindow,
      maxRequests: this.config.rateLimitMax,
    });

    // 已使用的 nonce (防重放)
    this.usedNonces = new Map(); // nonce -> timestamp

    // 定期清理 nonce
    this.nonceCleanupInterval = setInterval(() => {
      this._cleanupNonces();
    }, 60000);
  }

  /**
   * 添加 API Key
   * @param {string} apiKey - API Key
   * @param {string} secret - Secret
   * @param {Object} options - 额外选项 (权限等)
   */
  addApiKey(apiKey, secret, options = {}) {
    this.config.apiKeys.set(apiKey, {
      secret,
      permissions: options.permissions || ['read'],
      rateLimit: options.rateLimit || this.config.rateLimitMax,
      createdAt: Date.now(),
    });
  }

  /**
   * 移除 API Key
   * @param {string} apiKey - API Key
   */
  removeApiKey(apiKey) {
    this.config.apiKeys.delete(apiKey);
  }

  /**
   * 添加 IP 到白名单
   * @param {string} ip - IP 地址
   */
  addToWhitelist(ip) {
    this.config.ipWhitelist.add(ip);
  }

  /**
   * 从白名单移除 IP
   * @param {string} ip - IP 地址
   */
  removeFromWhitelist(ip) {
    this.config.ipWhitelist.delete(ip);
  }

  /**
   * 验证请求签名
   * @param {Object} params - 请求参数
   * @returns {{ valid: boolean, error?: string }}
   */
  verifySignature(params) {
    const { apiKey, timestamp, nonce, signature, body = '' } = params;

    // 检查 API Key 是否存在
    const keyInfo = this.config.apiKeys.get(apiKey);
    if (!keyInfo) {
      return { valid: false, error: 'Invalid API key' };
    }

    // 检查时间戳
    const now = Date.now();
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > this.config.signatureExpiry) {
      return { valid: false, error: 'Request expired' };
    }

    // 检查 nonce (防重放)
    if (this.config.enableNonceCheck) {
      if (this.usedNonces.has(nonce)) {
        return { valid: false, error: 'Nonce already used (replay attack detected)' };
      }
      this.usedNonces.set(nonce, now);
    }

    // 计算签名
    const message = `${apiKey}${timestamp}${nonce}${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', keyInfo.secret)
      .update(message)
      .digest('hex');

    // 使用时间安全比较
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: 'Invalid signature' };
    }

    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true, keyInfo };
  }

  /**
   * 检查 IP 是否在白名单
   * @param {string} ip - IP 地址
   * @returns {boolean}
   */
  isIpAllowed(ip) {
    if (!this.config.enableIpWhitelist) {
      return true;
    }

    // 标准化 IPv6 环回地址
    const normalizedIp = ip === '::1' ? '127.0.0.1' : ip;

    // 检查是否在白名单
    if (this.config.ipWhitelist.has(normalizedIp)) {
      return true;
    }

    // 检查 CIDR (简单实现)
    for (const allowed of this.config.ipWhitelist) {
      if (allowed.includes('/')) {
        if (this._matchCIDR(normalizedIp, allowed)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 简单的 CIDR 匹配
   * @private
   */
  _matchCIDR(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const mask = parseInt(bits, 10);

    // 简单实现：只支持 IPv4
    const ipNum = this._ipToNumber(ip);
    const rangeNum = this._ipToNumber(range);

    if (ipNum === null || rangeNum === null) {
      return false;
    }

    const maskNum = ~((1 << (32 - mask)) - 1);
    return (ipNum & maskNum) === (rangeNum & maskNum);
  }

  /**
   * IP 转数字
   * @private
   */
  _ipToNumber(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;

    return parts.reduce((acc, part) => {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) return null;
      return (acc << 8) + num;
    }, 0);
  }

  /**
   * 清理过期的 nonce
   * @private
   */
  _cleanupNonces() {
    const now = Date.now();
    const expiry = this.config.signatureExpiry * 2;

    for (const [nonce, timestamp] of this.usedNonces) {
      if (now - timestamp > expiry) {
        this.usedNonces.delete(nonce);
      }
    }
  }

  /**
   * 获取客户端 IP
   * @param {Object} req - Express 请求对象
   * @returns {string}
   */
  getClientIp(req) {
    return (
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * 停止所有定时器
   */
  stop() {
    this.rateLimiter.stop();
    if (this.nonceCleanupInterval) {
      clearInterval(this.nonceCleanupInterval);
    }
  }
}

/**
 * 创建安全中间件
 * @param {SecurityManager} securityManager - 安全管理器实例
 * @param {Object} options - 选项
 * @returns {Function} Express 中间件
 */
function createSecurityMiddleware(securityManager, options = {}) {
  const auditLogger = options.auditLogger || null;

  return async (req, res, next) => {
    const startTime = Date.now();
    const clientIp = securityManager.getClientIp(req);
    const path = req.path;

    // 记录请求开始
    const requestInfo = {
      method: req.method,
      path,
      ip: clientIp,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    };

    // 检查是否是公开路径
    if (securityManager.config.publicPaths.has(path)) {
      if (auditLogger) {
        auditLogger.log('api_access', { ...requestInfo, public: true });
      }
      return next();
    }

    // IP 白名单检查
    if (securityManager.config.enableIpWhitelist) {
      if (!securityManager.isIpAllowed(clientIp)) {
        if (auditLogger) {
          auditLogger.log('ip_blocked', { ...requestInfo, reason: 'not_in_whitelist' });
        }
        return res.status(403).json({
          success: false,
          error: 'Access denied: IP not in whitelist',
          code: 'IP_BLOCKED',
        });
      }
    }

    // 速率限制检查
    if (securityManager.config.enableRateLimit) {
      const rateLimitKey = req.headers['x-api-key'] || clientIp;
      const rateResult = securityManager.rateLimiter.check(rateLimitKey);

      // 添加速率限制头
      res.set('X-RateLimit-Limit', securityManager.config.rateLimitMax);
      res.set('X-RateLimit-Remaining', rateResult.remaining);
      res.set('X-RateLimit-Reset', rateResult.resetTime);

      if (!rateResult.allowed) {
        res.set('Retry-After', rateResult.retryAfter);
        if (auditLogger) {
          auditLogger.log('rate_limited', { ...requestInfo, retryAfter: rateResult.retryAfter });
        }
        return res.status(429).json({
          success: false,
          error: 'Too many requests',
          code: 'RATE_LIMITED',
          retryAfter: rateResult.retryAfter,
        });
      }
    }

    // 签名验证
    if (securityManager.config.enableSignature) {
      const apiKey = req.headers['x-api-key'];
      const timestamp = req.headers['x-timestamp'];
      const nonce = req.headers['x-nonce'];
      const signature = req.headers['x-signature'];

      if (!apiKey || !timestamp || !nonce || !signature) {
        if (auditLogger) {
          auditLogger.log('auth_failed', { ...requestInfo, reason: 'missing_headers' });
        }
        return res.status(401).json({
          success: false,
          error: 'Missing authentication headers',
          code: 'AUTH_MISSING',
          required: ['x-api-key', 'x-timestamp', 'x-nonce', 'x-signature'],
        });
      }

      // 获取请求体用于签名验证
      const bodyString = req.method !== 'GET' ? JSON.stringify(req.body) : '';

      const verifyResult = securityManager.verifySignature({
        apiKey,
        timestamp,
        nonce,
        signature,
        body: bodyString,
      });

      if (!verifyResult.valid) {
        if (auditLogger) {
          auditLogger.log('auth_failed', { ...requestInfo, reason: verifyResult.error });
        }
        return res.status(401).json({
          success: false,
          error: verifyResult.error,
          code: 'AUTH_FAILED',
        });
      }

      // 附加密钥信息到请求
      req.apiKeyInfo = verifyResult.keyInfo;
    }

    // 成功通过安全检查
    if (auditLogger) {
      // 在响应完成后记录
      res.on('finish', () => {
        auditLogger.log('api_access', {
          ...requestInfo,
          statusCode: res.statusCode,
          duration: Date.now() - startTime,
          authenticated: !!req.apiKeyInfo,
        });
      });
    }

    next();
  };
}

/**
 * 生成签名 (客户端使用)
 * @param {Object} params - 参数
 * @returns {Object} 签名信息
 */
function generateSignature(params) {
  const { apiKey, secret, body = '' } = params;
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  const message = `${apiKey}${timestamp}${nonce}${body}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return {
    timestamp,
    nonce,
    signature,
    headers: {
      'X-Api-Key': apiKey,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
    },
  };
}

export {
  SecurityManager,
  RateLimiter,
  createSecurityMiddleware,
  generateSignature,
};

export default SecurityManager;
