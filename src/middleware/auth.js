/**
 * Dashboard 认证中间件
 * Dashboard Authentication Middleware
 *
 * 提供 JWT 认证、会话管理、密码哈希等安全功能
 * Provides JWT authentication, session management, password hashing
 *
 * @module src/middleware/auth
 */

import crypto from 'crypto'; // 导入模块 crypto
import { SafeMap, SafeSet, SafeTTLMap } from '../utils/SafeCollection.js'; // 导入模块 ../utils/SafeCollection.js

// JWT 配置
const JWT_ALGORITHM = 'HS256'; // 定义常量 JWT_ALGORITHM
const JWT_EXPIRY = 3600000; // 1小时
const REFRESH_TOKEN_EXPIRY = 604800000; // 7天

/**
 * Base64URL 编码
 */
function base64UrlEncode(data) { // 定义函数 base64UrlEncode
  const base64 = Buffer.from(data).toString('base64'); // 定义常量 base64
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
} // 结束代码块

/**
 * Base64URL 解码
 */
function base64UrlDecode(str) { // 定义函数 base64UrlDecode
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/'); // 定义变量 base64
  while (base64.length % 4) { // 循环条件 base64.length % 4
    base64 += '='; // 执行语句
  } // 结束代码块
  return Buffer.from(base64, 'base64').toString(); // 返回结果
} // 结束代码块

/**
 * 认证管理器类
 * Authentication Manager Class
 */
class AuthManager { // 定义类 AuthManager
  constructor(config = {}) { // 构造函数
    this.config = { // 设置 config
      // JWT 密钥 (应从环境变量获取)
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'), // JWT 密钥 (应从环境变量获取)
      // JWT 过期时间 (毫秒)
      jwtExpiry: config.jwtExpiry || JWT_EXPIRY, // JWT 过期时间 (毫秒)
      // 刷新令牌过期时间
      refreshTokenExpiry: config.refreshTokenExpiry || REFRESH_TOKEN_EXPIRY, // 刷新令牌过期时间
      // 密码哈希迭代次数
      hashIterations: config.hashIterations || 100000, // 密码哈希迭代次数
      // 密码最小长度
      minPasswordLength: config.minPasswordLength || 8, // 最小密码Length
      // 登录失败锁定阈值
      maxLoginAttempts: config.maxLoginAttempts || 5, // 登录失败锁定阈值
      // 锁定时间 (毫秒)
      lockoutDuration: config.lockoutDuration || 900000, // 锁定时间 (毫秒)
      // 是否启用 IP 检查
      enableIpCheck: config.enableIpCheck ?? true, // 是否启用 IP 检查
      // 会话并发限制
      maxConcurrentSessions: config.maxConcurrentSessions || 3, // 最大ConcurrentSessions
    }; // 结束代码块

    // 用户存储 (生产环境应使用数据库)
    // Use thread-safe Map for user storage
    this.users = new SafeMap(); // 设置 users

    // 刷新令牌存储 (使用带 TTL 的线程安全 Map)
    // Use TTL-enabled thread-safe Map for refresh tokens
    this.refreshTokens = new SafeTTLMap(this.config.refreshTokenExpiry); // 设置 refreshTokens

    // 登录尝试记录
    // Thread-safe Map for login attempts
    this.loginAttempts = new SafeMap(); // 设置 loginAttempts

    // 活跃会话
    // Thread-safe Map for active sessions
    this.activeSessions = new SafeMap(); // 设置 activeSessions

    // 令牌黑名单 (用于注销)
    // Thread-safe Set for token blacklist
    this.tokenBlacklist = new SafeSet(); // 设置 tokenBlacklist

    // 初始化默认管理员 (生产环境应从配置加载)
    this._initDefaultUser(); // 调用 _initDefaultUser
  } // 结束代码块

  /**
   * 初始化默认用户
   * @private
   */
  _initDefaultUser() { // 调用 _initDefaultUser
    const defaultPassword = process.env.DASHBOARD_PASSWORD || 'admin123'; // 定义常量 defaultPassword

    // 警告：使用默认密码
    if (defaultPassword === 'admin123') { // 条件判断 defaultPassword === 'admin123'
      console.warn('[Auth] WARNING: Using default password. Please set DASHBOARD_PASSWORD environment variable.'); // 控制台输出
    } // 结束代码块

    this.createUser('admin', defaultPassword, { role: 'admin' }); // 调用 createUser
  } // 结束代码块

  /**
   * 创建用户
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @param {Object} options - 选项
   */
  createUser(username, password, options = {}) { // 调用 createUser
    // 验证密码强度
    if (password.length < this.config.minPasswordLength) { // 条件判断 password.length < this.config.minPasswordLength
      throw new Error(`Password must be at least ${this.config.minPasswordLength} characters`); // 抛出异常
    } // 结束代码块

    // 生成盐值
    const salt = crypto.randomBytes(16).toString('hex'); // 定义常量 salt

    // 哈希密码
    const hash = crypto.pbkdf2Sync( // 定义常量 hash
      password, // 执行语句
      salt, // 执行语句
      this.config.hashIterations, // 访问 config
      64, // 执行语句
      'sha512' // 执行语句
    ).toString('hex'); // 执行语句

    // 存储用户 (线程安全同步写入)
    // Thread-safe sync write for user storage
    this.users.setSync(username, { // 访问 users
      username, // 执行语句
      passwordHash: hash, // 密码Hash
      salt, // 执行语句
      role: options.role || 'user', // role
      createdAt: Date.now(), // createdAt
      lastLogin: null, // lastLogin
      failedAttempts: 0, // failed次数
      lockedUntil: null, // lockedUntil
    }); // 结束代码块

    return { username, role: options.role || 'user' }; // 返回结果
  } // 结束代码块

  /**
   * 验证密码 (线程安全)
   * Verify password (thread-safe)
   *
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<{ valid: boolean, user?: Object, error?: string }>}
   */
  async verifyPassword(username, password) { // 执行语句
    const user = this.users.get(username); // 定义常量 user

    if (!user) { // 条件判断 !user
      return { valid: false, error: 'User not found' }; // 返回结果
    } // 结束代码块

    // 检查是否被锁定
    if (user.lockedUntil && Date.now() < user.lockedUntil) { // 条件判断 user.lockedUntil && Date.now() < user.lockedU...
      const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000); // 定义常量 remaining
      return { valid: false, error: `Account locked. Try again in ${remaining} minutes.` }; // 返回结果
    } // 结束代码块

    // 哈希输入密码
    const hash = crypto.pbkdf2Sync( // 定义常量 hash
      password, // 执行语句
      user.salt, // 执行语句
      this.config.hashIterations, // 访问 config
      64, // 执行语句
      'sha512' // 执行语句
    ).toString('hex'); // 执行语句

    // 使用时间安全比较
    const hashBuffer = Buffer.from(hash, 'hex'); // 定义常量 hashBuffer
    const storedBuffer = Buffer.from(user.passwordHash, 'hex'); // 定义常量 storedBuffer

    if (hashBuffer.length !== storedBuffer.length || // 条件判断 hashBuffer.length !== storedBuffer.length ||
        !crypto.timingSafeEqual(hashBuffer, storedBuffer)) { // 执行语句
      // 使用原子更新记录失败尝试 / Atomic update for failed attempts
      const updatedUser = await this.users.update(username, (u) => { // 定义函数 updatedUser
        if (!u) return u; // 条件判断 !u
        const failedAttempts = u.failedAttempts + 1; // 定义常量 failedAttempts
        if (failedAttempts >= this.config.maxLoginAttempts) { // 条件判断 failedAttempts >= this.config.maxLoginAttempts
          return { // 返回结果
            ...u, // 展开对象或数组
            failedAttempts: 0, // failed次数
            lockedUntil: Date.now() + this.config.lockoutDuration, // lockedUntil
          }; // 结束代码块
        } // 结束代码块
        return { ...u, failedAttempts }; // 返回结果
      }); // 结束代码块

      if (updatedUser && updatedUser.lockedUntil && Date.now() < updatedUser.lockedUntil) { // 条件判断 updatedUser && updatedUser.lockedUntil && Dat...
        return { valid: false, error: 'Too many failed attempts. Account locked.' }; // 返回结果
      } // 结束代码块
      return { valid: false, error: 'Invalid password' }; // 返回结果
    } // 结束代码块

    // 使用原子更新重置失败计数 / Atomic update to reset failed count
    await this.users.update(username, (u) => ({ // 等待异步结果
      ...u, // 展开对象或数组
      failedAttempts: 0, // failed次数
      lockedUntil: null, // lockedUntil
      lastLogin: Date.now(), // lastLogin
    })); // 结束代码块

    return { valid: true, user: { username: user.username, role: user.role } }; // 返回结果
  } // 结束代码块

  /**
   * 生成 JWT
   * @param {Object} payload - 载荷
   * @returns {string} JWT 令牌
   */
  generateToken(payload) { // 调用 generateToken
    const header = { // 定义常量 header
      alg: JWT_ALGORITHM, // alg
      typ: 'JWT', // typ
    }; // 结束代码块

    const now = Date.now(); // 定义常量 now
    const tokenPayload = { // 定义常量 tokenPayload
      ...payload, // 展开对象或数组
      iat: now, // iat
      exp: now + this.config.jwtExpiry, // exp
      jti: crypto.randomBytes(16).toString('hex'), // jti
    }; // 结束代码块

    // 编码 header 和 payload
    const encodedHeader = base64UrlEncode(JSON.stringify(header)); // 定义常量 encodedHeader
    const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload)); // 定义常量 encodedPayload

    // 生成签名
    const signature = crypto // 定义常量 signature
      .createHmac('sha256', this.config.jwtSecret) // 执行语句
      .update(`${encodedHeader}.${encodedPayload}`) // 执行语句
      .digest('base64') // 执行语句
      .replace(/\+/g, '-') // 执行语句
      .replace(/\//g, '_')
      .replace(/=/g, ''); // 执行语句

    return `${encodedHeader}.${encodedPayload}.${signature}`; // 返回结果
  } // 结束代码块

  /**
   * 验证 JWT
   * @param {string} token - JWT 令牌
   * @returns {{ valid: boolean, payload?: Object, error?: string }}
   */
  verifyToken(token) { // 调用 verifyToken
    try { // 尝试执行
      // 检查黑名单
      if (this.tokenBlacklist.has(token)) { // 条件判断 this.tokenBlacklist.has(token)
        return { valid: false, error: 'Token revoked' }; // 返回结果
      } // 结束代码块

      const parts = token.split('.'); // 定义常量 parts
      if (parts.length !== 3) { // 条件判断 parts.length !== 3
        return { valid: false, error: 'Invalid token format' }; // 返回结果
      } // 结束代码块

      const [encodedHeader, encodedPayload, signature] = parts; // 解构赋值

      // 验证签名
      const expectedSignature = crypto // 定义常量 expectedSignature
        .createHmac('sha256', this.config.jwtSecret) // 执行语句
        .update(`${encodedHeader}.${encodedPayload}`) // 执行语句
        .digest('base64') // 执行语句
        .replace(/\+/g, '-') // 执行语句
        .replace(/\//g, '_')
        .replace(/=/g, ''); // 执行语句

      const sigBuffer = Buffer.from(signature); // 定义常量 sigBuffer
      const expectedBuffer = Buffer.from(expectedSignature); // 定义常量 expectedBuffer

      if (sigBuffer.length !== expectedBuffer.length || // 条件判断 sigBuffer.length !== expectedBuffer.length ||
          !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) { // 执行语句
        return { valid: false, error: 'Invalid signature' }; // 返回结果
      } // 结束代码块

      // 解析 payload
      const payload = JSON.parse(base64UrlDecode(encodedPayload)); // 定义常量 payload

      // 检查过期
      if (payload.exp && Date.now() > payload.exp) { // 条件判断 payload.exp && Date.now() > payload.exp
        return { valid: false, error: 'Token expired' }; // 返回结果
      } // 结束代码块

      return { valid: true, payload }; // 返回结果
    } catch (error) { // 执行语句
      return { valid: false, error: 'Invalid token' }; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 生成刷新令牌 (线程安全)
   * Generate refresh token (thread-safe)
   *
   * @param {string} username - 用户名
   * @param {string} clientIp - 客户端 IP
   * @returns {Promise<string>} 刷新令牌
   */
  async generateRefreshToken(username, clientIp) { // 执行语句
    const refreshToken = crypto.randomBytes(32).toString('hex'); // 定义常量 refreshToken

    // SafeTTLMap 自动处理过期 / SafeTTLMap handles expiry automatically
    await this.refreshTokens.set(refreshToken, { // 等待异步结果
      username, // 执行语句
      clientIp, // 执行语句
      createdAt: Date.now(), // createdAt
      expiresAt: Date.now() + this.config.refreshTokenExpiry, // expiresAt
    }); // 结束代码块

    // 清理该用户的旧刷新令牌 (限制并发会话)
    await this._cleanupUserSessions(username); // 等待异步结果

    return refreshToken; // 返回结果
  } // 结束代码块

  /**
   * 使用刷新令牌获取新的访问令牌 (线程安全)
   * Refresh access token (thread-safe)
   *
   * @param {string} refreshToken - 刷新令牌
   * @param {string} clientIp - 客户端 IP
   * @returns {Promise<{ success: boolean, accessToken?: string, error?: string }>}
   */
  async refreshAccessToken(refreshToken, clientIp) { // 执行语句
    // SafeTTLMap 自动处理过期检查 / SafeTTLMap handles expiry check automatically
    const tokenData = this.refreshTokens.get(refreshToken); // 定义常量 tokenData

    if (!tokenData) { // 条件判断 !tokenData
      return { success: false, error: 'Invalid refresh token' }; // 返回结果
    } // 结束代码块

    if (Date.now() > tokenData.expiresAt) { // 条件判断 Date.now() > tokenData.expiresAt
      await this.refreshTokens.delete(refreshToken); // 等待异步结果
      return { success: false, error: 'Refresh token expired' }; // 返回结果
    } // 结束代码块

    // IP 检查 (可选)
    if (this.config.enableIpCheck && tokenData.clientIp !== clientIp) { // 条件判断 this.config.enableIpCheck && tokenData.client...
      return { success: false, error: 'IP address mismatch' }; // 返回结果
    } // 结束代码块

    const user = this.users.get(tokenData.username); // 定义常量 user
    if (!user) { // 条件判断 !user
      return { success: false, error: 'User not found' }; // 返回结果
    } // 结束代码块

    // 生成新的访问令牌
    const accessToken = this.generateToken({ // 定义常量 accessToken
      sub: user.username, // sub
      role: user.role, // role
    }); // 结束代码块

    return { success: true, accessToken }; // 返回结果
  } // 结束代码块

  /**
   * 撤销令牌 (注销) - 线程安全
   * Revoke token (logout) - thread-safe
   *
   * @param {string} token - 访问令牌
   * @param {string} refreshToken - 刷新令牌 (可选)
   */
  async revokeToken(token, refreshToken = null) { // 执行语句
    // 将访问令牌加入黑名单 (线程安全)
    // Thread-safe add to blacklist
    await this.tokenBlacklist.add(token); // 等待异步结果

    // 删除刷新令牌
    if (refreshToken) { // 条件判断 refreshToken
      await this.refreshTokens.delete(refreshToken); // 等待异步结果
    } // 结束代码块

    // 定期清理黑名单 (过期令牌不需要保留)
    await this._cleanupBlacklist(); // 等待异步结果
  } // 结束代码块

  /**
   * 清理用户会话 (线程安全)
   * Cleanup user sessions (thread-safe)
   * @private
   */
  async _cleanupUserSessions(username) { // 执行语句
    const userTokens = []; // 定义常量 userTokens

    // 收集该用户的所有令牌 / Collect all tokens for this user
    for (const [token, data] of this.refreshTokens) { // 循环 const [token, data] of this.refreshTokens
      if (data && data.username === username) { // 条件判断 data && data.username === username
        userTokens.push({ token, createdAt: data.createdAt }); // 调用 userTokens.push
      } // 结束代码块
    } // 结束代码块

    // 按创建时间排序
    userTokens.sort((a, b) => b.createdAt - a.createdAt); // 调用 userTokens.sort

    // 删除超过限制的旧会话 (线程安全)
    // Thread-safe delete of excess sessions
    const tokensToDelete = userTokens.slice(this.config.maxConcurrentSessions); // 定义常量 tokensToDelete
    for (const { token } of tokensToDelete) { // 循环 const { token } of tokensToDelete
      await this.refreshTokens.delete(token); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 清理黑名单 (线程安全)
   * Cleanup blacklist (thread-safe)
   * @private
   */
  async _cleanupBlacklist() { // 执行语句
    // 使用 SafeSet 的 limitSize 方法限制黑名单大小
    // Use SafeSet's limitSize to limit blacklist size
    if (this.tokenBlacklist.size > 10000) { // 条件判断 this.tokenBlacklist.size > 10000
      // 清空黑名单 (过期令牌无论如何都会失效)
      await this.tokenBlacklist.clear(); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 更改密码 (线程安全)
   * Change password (thread-safe)
   *
   * @param {string} username - 用户名
   * @param {string} oldPassword - 旧密码
   * @param {string} newPassword - 新密码
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async changePassword(username, oldPassword, newPassword) { // 执行语句
    // 验证旧密码
    const verify = await this.verifyPassword(username, oldPassword); // 定义常量 verify
    if (!verify.valid) { // 条件判断 !verify.valid
      return { success: false, error: verify.error }; // 返回结果
    } // 结束代码块

    // 验证新密码强度
    if (newPassword.length < this.config.minPasswordLength) { // 条件判断 newPassword.length < this.config.minPasswordL...
      return { success: false, error: `Password must be at least ${this.config.minPasswordLength} characters` }; // 返回结果
    } // 结束代码块

    // 生成新盐值和哈希
    const salt = crypto.randomBytes(16).toString('hex'); // 定义常量 salt
    const hash = crypto.pbkdf2Sync( // 定义常量 hash
      newPassword, // 执行语句
      salt, // 执行语句
      this.config.hashIterations, // 访问 config
      64, // 执行语句
      'sha512' // 执行语句
    ).toString('hex'); // 执行语句

    // 使用原子更新用户密码 / Atomic update user password
    await this.users.update(username, (user) => ({ // 等待异步结果
      ...user, // 展开对象或数组
      salt, // 执行语句
      passwordHash: hash, // 密码Hash
    })); // 结束代码块

    // 撤销所有刷新令牌 (强制重新登录) - 线程安全
    // Revoke all refresh tokens (force re-login) - thread-safe
    const tokensToDelete = []; // 定义常量 tokensToDelete
    for (const [token, data] of this.refreshTokens) { // 循环 const [token, data] of this.refreshTokens
      if (data && data.username === username) { // 条件判断 data && data.username === username
        tokensToDelete.push(token); // 调用 tokensToDelete.push
      } // 结束代码块
    } // 结束代码块
    for (const token of tokensToDelete) { // 循环 const token of tokensToDelete
      await this.refreshTokens.delete(token); // 等待异步结果
    } // 结束代码块

    return { success: true }; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 创建认证中间件
 * @param {AuthManager} authManager - 认证管理器实例
 * @param {Object} options - 选项
 * @returns {Function} Express 中间件
 */
function createAuthMiddleware(authManager, options = {}) { // 定义函数 createAuthMiddleware
  const publicPaths = new Set(options.publicPaths || ['/health', '/api/health', '/api/login']); // 定义常量 publicPaths

  return async (req, res, next) => { // 返回结果
    const path = req.path; // 定义常量 path

    // 公开路径不需要认证
    if (publicPaths.has(path)) { // 条件判断 publicPaths.has(path)
      return next(); // 返回结果
    } // 结束代码块

    // 获取 Authorization header
    const authHeader = req.headers.authorization; // 定义常量 authHeader

    if (!authHeader || !authHeader.startsWith('Bearer ')) { // 条件判断 !authHeader || !authHeader.startsWith('Bearer ')
      return res.status(401).json({ // 返回结果
        success: false, // 成功标记
        error: 'Authorization required', // 错误
        code: 'AUTH_REQUIRED', // 代码
      }); // 结束代码块
    } // 结束代码块

    const token = authHeader.slice(7); // 定义常量 token

    // 验证令牌
    const result = authManager.verifyToken(token); // 定义常量 result

    if (!result.valid) { // 条件判断 !result.valid
      return res.status(401).json({ // 返回结果
        success: false, // 成功标记
        error: result.error, // 错误
        code: 'AUTH_INVALID', // 代码
      }); // 结束代码块
    } // 结束代码块

    // 附加用户信息到请求
    req.user = result.payload; // 赋值 req.user
    next(); // 调用 next
  }; // 结束代码块
} // 结束代码块

/**
 * 创建登录路由处理器
 * @param {AuthManager} authManager - 认证管理器实例
 * @returns {Function} 路由处理器
 */
function createLoginHandler(authManager) { // 定义函数 createLoginHandler
  return async (req, res) => { // 返回结果
    const { username, password } = req.body; // 解构赋值

    if (!username || !password) { // 条件判断 !username || !password
      return res.status(400).json({ // 返回结果
        success: false, // 成功标记
        error: 'Username and password required', // 错误
      }); // 结束代码块
    } // 结束代码块

    // 获取客户端 IP
    const clientIp = // 定义常量 clientIp
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || // 执行语句
      req.connection?.remoteAddress || // 执行语句
      'unknown'; // 执行语句

    // 验证凭证 (async)
    const result = await authManager.verifyPassword(username, password); // 定义常量 result

    if (!result.valid) { // 条件判断 !result.valid
      return res.status(401).json({ // 返回结果
        success: false, // 成功标记
        error: result.error, // 错误
      }); // 结束代码块
    } // 结束代码块

    // 生成令牌 (async)
    const accessToken = authManager.generateToken({ // 定义常量 accessToken
      sub: result.user.username, // sub
      role: result.user.role, // role
    }); // 结束代码块

    const refreshToken = await authManager.generateRefreshToken(username, clientIp); // 定义常量 refreshToken

    res.json({ // 调用 res.json
      success: true, // 成功标记
      accessToken, // 执行语句
      refreshToken, // 执行语句
      expiresIn: authManager.config.jwtExpiry, // expires在
      user: result.user, // 用户
    }); // 结束代码块
  }; // 结束代码块
} // 结束代码块

/**
 * 创建刷新令牌路由处理器
 * @param {AuthManager} authManager - 认证管理器实例
 * @returns {Function} 路由处理器
 */
function createRefreshHandler(authManager) { // 定义函数 createRefreshHandler
  return async (req, res) => { // 返回结果
    const { refreshToken } = req.body; // 解构赋值

    if (!refreshToken) { // 条件判断 !refreshToken
      return res.status(400).json({ // 返回结果
        success: false, // 成功标记
        error: 'Refresh token required', // 错误
      }); // 结束代码块
    } // 结束代码块

    const clientIp = // 定义常量 clientIp
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || // 执行语句
      req.connection?.remoteAddress || // 执行语句
      'unknown'; // 执行语句

    // 刷新访问令牌 (async)
    const result = await authManager.refreshAccessToken(refreshToken, clientIp); // 定义常量 result

    if (!result.success) { // 条件判断 !result.success
      return res.status(401).json({ // 返回结果
        success: false, // 成功标记
        error: result.error, // 错误
      }); // 结束代码块
    } // 结束代码块

    res.json({ // 调用 res.json
      success: true, // 成功标记
      accessToken: result.accessToken, // access令牌
      expiresIn: authManager.config.jwtExpiry, // expires在
    }); // 结束代码块
  }; // 结束代码块
} // 结束代码块

/**
 * 创建注销路由处理器
 * @param {AuthManager} authManager - 认证管理器实例
 * @returns {Function} 路由处理器
 */
function createLogoutHandler(authManager) { // 定义函数 createLogoutHandler
  return async (req, res) => { // 返回结果
    const authHeader = req.headers.authorization; // 定义常量 authHeader
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null; // 定义常量 token
    const { refreshToken } = req.body; // 解构赋值

    if (token) { // 条件判断 token
      // 撤销令牌 (async)
      await authManager.revokeToken(token, refreshToken); // 等待异步结果
    } // 结束代码块

    res.json({ // 调用 res.json
      success: true, // 成功标记
      message: 'Logged out successfully', // 消息
    }); // 结束代码块
  }; // 结束代码块
} // 结束代码块

export { // 导出命名成员
  AuthManager, // 执行语句
  createAuthMiddleware, // 执行语句
  createLoginHandler, // 执行语句
  createRefreshHandler, // 执行语句
  createLogoutHandler, // 执行语句
}; // 结束代码块

export default AuthManager; // 默认导出
