/**
 * Dashboard 认证中间件
 * Dashboard Authentication Middleware
 *
 * 提供 JWT 认证、会话管理、密码哈希等安全功能
 * Provides JWT authentication, session management, password hashing
 *
 * @module src/middleware/auth
 */

import crypto from 'crypto';
import { SafeMap, SafeSet, SafeTTLMap } from '../utils/SafeCollection.js';

// JWT 配置
const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRY = 3600000; // 1小时
const REFRESH_TOKEN_EXPIRY = 604800000; // 7天

/**
 * Base64URL 编码
 */
function base64UrlEncode(data) {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64URL 解码
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString();
}

/**
 * 认证管理器类
 * Authentication Manager Class
 */
class AuthManager {
  constructor(config = {}) {
    this.config = {
      // JWT 密钥 (应从环境变量获取)
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
      // JWT 过期时间 (毫秒)
      jwtExpiry: config.jwtExpiry || JWT_EXPIRY,
      // 刷新令牌过期时间
      refreshTokenExpiry: config.refreshTokenExpiry || REFRESH_TOKEN_EXPIRY,
      // 密码哈希迭代次数
      hashIterations: config.hashIterations || 100000,
      // 密码最小长度
      minPasswordLength: config.minPasswordLength || 8,
      // 登录失败锁定阈值
      maxLoginAttempts: config.maxLoginAttempts || 5,
      // 锁定时间 (毫秒)
      lockoutDuration: config.lockoutDuration || 900000, // 15分钟
      // 是否启用 IP 检查
      enableIpCheck: config.enableIpCheck ?? true,
      // 会话并发限制
      maxConcurrentSessions: config.maxConcurrentSessions || 3,
    };

    // 用户存储 (生产环境应使用数据库)
    // Use thread-safe Map for user storage
    this.users = new SafeMap();

    // 刷新令牌存储 (使用带 TTL 的线程安全 Map)
    // Use TTL-enabled thread-safe Map for refresh tokens
    this.refreshTokens = new SafeTTLMap(this.config.refreshTokenExpiry);

    // 登录尝试记录
    // Thread-safe Map for login attempts
    this.loginAttempts = new SafeMap();

    // 活跃会话
    // Thread-safe Map for active sessions
    this.activeSessions = new SafeMap();

    // 令牌黑名单 (用于注销)
    // Thread-safe Set for token blacklist
    this.tokenBlacklist = new SafeSet();

    // 初始化默认管理员 (生产环境应从配置加载)
    this._initDefaultUser();
  }

  /**
   * 初始化默认用户
   * @private
   */
  _initDefaultUser() {
    const defaultPassword = process.env.DASHBOARD_PASSWORD || 'admin123';

    // 警告：使用默认密码
    if (defaultPassword === 'admin123') {
      console.warn('[Auth] WARNING: Using default password. Please set DASHBOARD_PASSWORD environment variable.');
    }

    this.createUser('admin', defaultPassword, { role: 'admin' });
  }

  /**
   * 创建用户
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @param {Object} options - 选项
   */
  createUser(username, password, options = {}) {
    // 验证密码强度
    if (password.length < this.config.minPasswordLength) {
      throw new Error(`Password must be at least ${this.config.minPasswordLength} characters`);
    }

    // 生成盐值
    const salt = crypto.randomBytes(16).toString('hex');

    // 哈希密码
    const hash = crypto.pbkdf2Sync(
      password,
      salt,
      this.config.hashIterations,
      64,
      'sha512'
    ).toString('hex');

    // 存储用户 (线程安全同步写入)
    // Thread-safe sync write for user storage
    this.users.setSync(username, {
      username,
      passwordHash: hash,
      salt,
      role: options.role || 'user',
      createdAt: Date.now(),
      lastLogin: null,
      failedAttempts: 0,
      lockedUntil: null,
    });

    return { username, role: options.role || 'user' };
  }

  /**
   * 验证密码 (线程安全)
   * Verify password (thread-safe)
   *
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<{ valid: boolean, user?: Object, error?: string }>}
   */
  async verifyPassword(username, password) {
    const user = this.users.get(username);

    if (!user) {
      return { valid: false, error: 'User not found' };
    }

    // 检查是否被锁定
    if (user.lockedUntil && Date.now() < user.lockedUntil) {
      const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return { valid: false, error: `Account locked. Try again in ${remaining} minutes.` };
    }

    // 哈希输入密码
    const hash = crypto.pbkdf2Sync(
      password,
      user.salt,
      this.config.hashIterations,
      64,
      'sha512'
    ).toString('hex');

    // 使用时间安全比较
    const hashBuffer = Buffer.from(hash, 'hex');
    const storedBuffer = Buffer.from(user.passwordHash, 'hex');

    if (hashBuffer.length !== storedBuffer.length ||
        !crypto.timingSafeEqual(hashBuffer, storedBuffer)) {
      // 使用原子更新记录失败尝试 / Atomic update for failed attempts
      const updatedUser = await this.users.update(username, (u) => {
        if (!u) return u;
        const failedAttempts = u.failedAttempts + 1;
        if (failedAttempts >= this.config.maxLoginAttempts) {
          return {
            ...u,
            failedAttempts: 0,
            lockedUntil: Date.now() + this.config.lockoutDuration,
          };
        }
        return { ...u, failedAttempts };
      });

      if (updatedUser && updatedUser.lockedUntil && Date.now() < updatedUser.lockedUntil) {
        return { valid: false, error: 'Too many failed attempts. Account locked.' };
      }
      return { valid: false, error: 'Invalid password' };
    }

    // 使用原子更新重置失败计数 / Atomic update to reset failed count
    await this.users.update(username, (u) => ({
      ...u,
      failedAttempts: 0,
      lockedUntil: null,
      lastLogin: Date.now(),
    }));

    return { valid: true, user: { username: user.username, role: user.role } };
  }

  /**
   * 生成 JWT
   * @param {Object} payload - 载荷
   * @returns {string} JWT 令牌
   */
  generateToken(payload) {
    const header = {
      alg: JWT_ALGORITHM,
      typ: 'JWT',
    };

    const now = Date.now();
    const tokenPayload = {
      ...payload,
      iat: now,
      exp: now + this.config.jwtExpiry,
      jti: crypto.randomBytes(16).toString('hex'),
    };

    // 编码 header 和 payload
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));

    // 生成签名
    const signature = crypto
      .createHmac('sha256', this.config.jwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * 验证 JWT
   * @param {string} token - JWT 令牌
   * @returns {{ valid: boolean, payload?: Object, error?: string }}
   */
  verifyToken(token) {
    try {
      // 检查黑名单
      if (this.tokenBlacklist.has(token)) {
        return { valid: false, error: 'Token revoked' };
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [encodedHeader, encodedPayload, signature] = parts;

      // 验证签名
      const expectedSignature = crypto
        .createHmac('sha256', this.config.jwtSecret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length ||
          !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { valid: false, error: 'Invalid signature' };
      }

      // 解析 payload
      const payload = JSON.parse(base64UrlDecode(encodedPayload));

      // 检查过期
      if (payload.exp && Date.now() > payload.exp) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, payload };
    } catch (error) {
      return { valid: false, error: 'Invalid token' };
    }
  }

  /**
   * 生成刷新令牌 (线程安全)
   * Generate refresh token (thread-safe)
   *
   * @param {string} username - 用户名
   * @param {string} clientIp - 客户端 IP
   * @returns {Promise<string>} 刷新令牌
   */
  async generateRefreshToken(username, clientIp) {
    const refreshToken = crypto.randomBytes(32).toString('hex');

    // SafeTTLMap 自动处理过期 / SafeTTLMap handles expiry automatically
    await this.refreshTokens.set(refreshToken, {
      username,
      clientIp,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.refreshTokenExpiry,
    });

    // 清理该用户的旧刷新令牌 (限制并发会话)
    await this._cleanupUserSessions(username);

    return refreshToken;
  }

  /**
   * 使用刷新令牌获取新的访问令牌 (线程安全)
   * Refresh access token (thread-safe)
   *
   * @param {string} refreshToken - 刷新令牌
   * @param {string} clientIp - 客户端 IP
   * @returns {Promise<{ success: boolean, accessToken?: string, error?: string }>}
   */
  async refreshAccessToken(refreshToken, clientIp) {
    // SafeTTLMap 自动处理过期检查 / SafeTTLMap handles expiry check automatically
    const tokenData = this.refreshTokens.get(refreshToken);

    if (!tokenData) {
      return { success: false, error: 'Invalid refresh token' };
    }

    if (Date.now() > tokenData.expiresAt) {
      await this.refreshTokens.delete(refreshToken);
      return { success: false, error: 'Refresh token expired' };
    }

    // IP 检查 (可选)
    if (this.config.enableIpCheck && tokenData.clientIp !== clientIp) {
      return { success: false, error: 'IP address mismatch' };
    }

    const user = this.users.get(tokenData.username);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // 生成新的访问令牌
    const accessToken = this.generateToken({
      sub: user.username,
      role: user.role,
    });

    return { success: true, accessToken };
  }

  /**
   * 撤销令牌 (注销) - 线程安全
   * Revoke token (logout) - thread-safe
   *
   * @param {string} token - 访问令牌
   * @param {string} refreshToken - 刷新令牌 (可选)
   */
  async revokeToken(token, refreshToken = null) {
    // 将访问令牌加入黑名单 (线程安全)
    // Thread-safe add to blacklist
    await this.tokenBlacklist.add(token);

    // 删除刷新令牌
    if (refreshToken) {
      await this.refreshTokens.delete(refreshToken);
    }

    // 定期清理黑名单 (过期令牌不需要保留)
    await this._cleanupBlacklist();
  }

  /**
   * 清理用户会话 (线程安全)
   * Cleanup user sessions (thread-safe)
   * @private
   */
  async _cleanupUserSessions(username) {
    const userTokens = [];

    // 收集该用户的所有令牌 / Collect all tokens for this user
    for (const [token, data] of this.refreshTokens) {
      if (data && data.username === username) {
        userTokens.push({ token, createdAt: data.createdAt });
      }
    }

    // 按创建时间排序
    userTokens.sort((a, b) => b.createdAt - a.createdAt);

    // 删除超过限制的旧会话 (线程安全)
    // Thread-safe delete of excess sessions
    const tokensToDelete = userTokens.slice(this.config.maxConcurrentSessions);
    for (const { token } of tokensToDelete) {
      await this.refreshTokens.delete(token);
    }
  }

  /**
   * 清理黑名单 (线程安全)
   * Cleanup blacklist (thread-safe)
   * @private
   */
  async _cleanupBlacklist() {
    // 使用 SafeSet 的 limitSize 方法限制黑名单大小
    // Use SafeSet's limitSize to limit blacklist size
    if (this.tokenBlacklist.size > 10000) {
      // 清空黑名单 (过期令牌无论如何都会失效)
      await this.tokenBlacklist.clear();
    }
  }

  /**
   * 更改密码 (线程安全)
   * Change password (thread-safe)
   *
   * @param {string} username - 用户名
   * @param {string} oldPassword - 旧密码
   * @param {string} newPassword - 新密码
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async changePassword(username, oldPassword, newPassword) {
    // 验证旧密码
    const verify = await this.verifyPassword(username, oldPassword);
    if (!verify.valid) {
      return { success: false, error: verify.error };
    }

    // 验证新密码强度
    if (newPassword.length < this.config.minPasswordLength) {
      return { success: false, error: `Password must be at least ${this.config.minPasswordLength} characters` };
    }

    // 生成新盐值和哈希
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(
      newPassword,
      salt,
      this.config.hashIterations,
      64,
      'sha512'
    ).toString('hex');

    // 使用原子更新用户密码 / Atomic update user password
    await this.users.update(username, (user) => ({
      ...user,
      salt,
      passwordHash: hash,
    }));

    // 撤销所有刷新令牌 (强制重新登录) - 线程安全
    // Revoke all refresh tokens (force re-login) - thread-safe
    const tokensToDelete = [];
    for (const [token, data] of this.refreshTokens) {
      if (data && data.username === username) {
        tokensToDelete.push(token);
      }
    }
    for (const token of tokensToDelete) {
      await this.refreshTokens.delete(token);
    }

    return { success: true };
  }
}

/**
 * 创建认证中间件
 * @param {AuthManager} authManager - 认证管理器实例
 * @param {Object} options - 选项
 * @returns {Function} Express 中间件
 */
function createAuthMiddleware(authManager, options = {}) {
  const publicPaths = new Set(options.publicPaths || ['/health', '/api/health', '/api/login']);

  return async (req, res, next) => {
    const path = req.path;

    // 公开路径不需要认证
    if (publicPaths.has(path)) {
      return next();
    }

    // 获取 Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization required',
        code: 'AUTH_REQUIRED',
      });
    }

    const token = authHeader.slice(7);

    // 验证令牌
    const result = authManager.verifyToken(token);

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: result.error,
        code: 'AUTH_INVALID',
      });
    }

    // 附加用户信息到请求
    req.user = result.payload;
    next();
  };
}

/**
 * 创建登录路由处理器
 * @param {AuthManager} authManager - 认证管理器实例
 * @returns {Function} 路由处理器
 */
function createLoginHandler(authManager) {
  return async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required',
      });
    }

    // 获取客户端 IP
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      'unknown';

    // 验证凭证 (async)
    const result = await authManager.verifyPassword(username, password);

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: result.error,
      });
    }

    // 生成令牌 (async)
    const accessToken = authManager.generateToken({
      sub: result.user.username,
      role: result.user.role,
    });

    const refreshToken = await authManager.generateRefreshToken(username, clientIp);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      expiresIn: authManager.config.jwtExpiry,
      user: result.user,
    });
  };
}

/**
 * 创建刷新令牌路由处理器
 * @param {AuthManager} authManager - 认证管理器实例
 * @returns {Function} 路由处理器
 */
function createRefreshHandler(authManager) {
  return async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required',
      });
    }

    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      'unknown';

    // 刷新访问令牌 (async)
    const result = await authManager.refreshAccessToken(refreshToken, clientIp);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: result.error,
      });
    }

    res.json({
      success: true,
      accessToken: result.accessToken,
      expiresIn: authManager.config.jwtExpiry,
    });
  };
}

/**
 * 创建注销路由处理器
 * @param {AuthManager} authManager - 认证管理器实例
 * @returns {Function} 路由处理器
 */
function createLogoutHandler(authManager) {
  return async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { refreshToken } = req.body;

    if (token) {
      // 撤销令牌 (async)
      await authManager.revokeToken(token, refreshToken);
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  };
}

export {
  AuthManager,
  createAuthMiddleware,
  createLoginHandler,
  createRefreshHandler,
  createLogoutHandler,
};

export default AuthManager;
