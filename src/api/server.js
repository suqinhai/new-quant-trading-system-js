/**
 * RESTful API 服务器
 * API Server Entry Point
 *
 * @module src/api/server
 */

import express from 'express'; // 导入模块 express
import cors from 'cors'; // 导入模块 cors
import helmet from 'helmet'; // 导入模块 helmet
import compression from 'compression'; // 导入模块 compression
import { createServer } from 'http'; // 导入模块 http

import { // 导入依赖
  createDashboardRoutes, // 执行语句
  createStrategyRoutes, // 执行语句
  createTradeRoutes, // 执行语句
  createPositionRoutes, // 执行语句
  createRiskRoutes, // 执行语句
  createExchangeRoutes, // 执行语句
  createSystemRoutes, // 执行语句
  createUserRoutes, // 执行语句
} from './routes/index.js'; // 执行语句

import { RateLimiter } from './rateLimit.js'; // 导入模块 ./rateLimit.js
import { RBACManager } from './rbac.js'; // 导入模块 ./rbac.js
import { RequestTracingManager, getContext } from '../middleware/requestTracing.js'; // 导入模块 ../middleware/requestTracing.js
import { setContextGetter } from '../utils/logger.js'; // 导入模块 ../utils/logger.js
import { logger } from '../utils/logger.js'; // 导入模块 ../utils/logger.js

// 初始化日志上下文获取器
setContextGetter(getContext); // 调用 setContextGetter

/**
 * API 服务器类
 */
export class ApiServer { // 导出类 ApiServer
  constructor(config = {}) { // 构造函数
    this.config = { // 设置 config
      port: config.port || parseInt(process.env.HTTP_PORT) || 3000, // 端口
      host: config.host || '0.0.0.0', // 主机
      corsOrigins: config.corsOrigins || ['http://localhost:5173', 'http://localhost:3000'], // corsOrigins
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || 'your-secret-key', // jwt密钥
      ...config, // 展开对象或数组
    }; // 结束代码块

    this.app = express(); // 设置 app
    this.server = null; // 设置 server
    this.deps = config.deps || {}; // 设置 deps

    // 初始化中间件
    this.rateLimiter = new RateLimiter(config.rateLimit); // 设置 rateLimiter
    this.rbacManager = new RBACManager(); // 设置 rbacManager

    // 初始化请求追踪管理器
    this.tracingManager = new RequestTracingManager({ // 设置 tracingManager
      enabled: config.enableTracing !== false, // 启用
      slowRequestThreshold: config.slowRequestThreshold || 1000, // slowRequest阈值
      excludePaths: ['/api/health', '/favicon.ico'], // excludePaths
    }); // 结束代码块

    // 监听追踪事件
    this._setupTracingEvents(); // 调用 _setupTracingEvents
  } // 结束代码块

  /**
   * 设置追踪事件监听
   */
  _setupTracingEvents() { // 调用 _setupTracingEvents
    // 记录慢请求
    this.tracingManager.on('slowRequest', (data) => { // 访问 tracingManager
      logger.warn('Slow request detected', { // 调用 logger.warn
        method: data.method, // method
        path: data.path, // 路径
        duration: data.duration, // duration
        statusCode: data.statusCode, // 状态代码
      }); // 结束代码块
    }); // 结束代码块

    // 记录请求完成（debug 级别）
    this.tracingManager.on('requestEnd', (data) => { // 访问 tracingManager
      if (process.env.LOG_LEVEL === 'debug') { // 条件判断 process.env.LOG_LEVEL === 'debug'
        logger.debug('Request completed', { // 调用 logger.debug
          method: data.method, // method
          path: data.path, // 路径
          statusCode: data.statusCode, // 状态代码
          duration: data.duration, // duration
        }); // 结束代码块
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 初始化中间件
   */
  setupMiddleware() { // 调用 setupMiddleware
    // 安全头
    this.app.use(helmet({ // 访问 app
      contentSecurityPolicy: false, // contentSecurityPolicy
    })); // 结束代码块

    // CORS
    this.app.use(cors({ // 访问 app
      origin: this.config.corsOrigins, // origin
      credentials: true, // credentials
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // methods
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Trace-ID', 'X-Timestamp', 'X-Signature'], // allowedHeaders
    })); // 结束代码块

    // 压缩
    this.app.use(compression()); // 访问 app

    // 解析 JSON
    this.app.use(express.json({ limit: '10mb' })); // 访问 app
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' })); // 访问 app

    // 请求追踪中间件（替代原有的请求日志）
    this.app.use(this.tracingManager.middleware()); // 访问 app

    // 全局限流
    this.app.use(this.rateLimiter.middleware()); // 访问 app

    // JWT 认证中间件
    this.app.use(this.authMiddleware.bind(this)); // 访问 app
  } // 结束代码块

  /**
   * JWT 认证中间件
   */
  authMiddleware(req, res, next) { // 调用 authMiddleware
    // 跳过公开路由
    const publicPaths = [ // 定义常量 publicPaths
      '/api/auth/login', // 执行语句
      '/api/health', // 执行语句
      '/api/system/health', // 执行语句
    ]; // 结束数组或索引

    if (publicPaths.some(p => req.path === p || req.path.startsWith(p))) { // 条件判断 publicPaths.some(p => req.path === p || req.p...
      return next(); // 返回结果
    } // 结束代码块

    const authHeader = req.headers.authorization; // 定义常量 authHeader
    if (!authHeader || !authHeader.startsWith('Bearer ')) { // 条件判断 !authHeader || !authHeader.startsWith('Bearer ')
      return res.status(401).json({ // 返回结果
        success: false, // 成功标记
        error: 'Authorization token required', // 错误
        code: 'UNAUTHORIZED', // 代码
      }); // 结束代码块
    } // 结束代码块

    const token = authHeader.substring(7); // 定义常量 token

    try { // 尝试执行
      // 验证 JWT
      const payload = this.verifyToken(token); // 定义常量 payload
      req.user = payload; // 赋值 req.user
      next(); // 调用 next
    } catch (error) { // 执行语句
      return res.status(401).json({ // 返回结果
        success: false, // 成功标记
        error: 'Invalid or expired token', // 错误
        code: 'UNAUTHORIZED', // 代码
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 验证 JWT Token
   */
  verifyToken(token) { // 调用 verifyToken
    // 简化的 JWT 验证 (生产环境应使用 jsonwebtoken 库)
    const parts = token.split('.'); // 定义常量 parts
    if (parts.length !== 3) { // 条件判断 parts.length !== 3
      throw new Error('Invalid token format'); // 抛出异常
    } // 结束代码块

    try { // 尝试执行
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); // 定义常量 payload

      // 检查过期时间
      if (payload.exp && payload.exp < Date.now() / 1000) { // 条件判断 payload.exp && payload.exp < Date.now() / 1000
        throw new Error('Token expired'); // 抛出异常
      } // 结束代码块

      return payload; // 返回结果
    } catch (error) { // 执行语句
      throw new Error('Invalid token'); // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 设置路由
   */
  setupRoutes() { // 调用 setupRoutes
    const { deps } = this; // 解构赋值

    // 健康检查 (无需认证)
    this.app.get('/api/health', (req, res) => { // 访问 app
      res.json({ // 调用 res.json
        status: 'healthy', // 状态
        timestamp: new Date().toISOString(), // 时间戳
        uptime: process.uptime(), // uptime
      }); // 结束代码块
    }); // 结束代码块

    // 用户认证路由
    this.app.use('/api/auth', createUserRoutes(deps)); // 访问 app
    this.app.use('/api/user', createUserRoutes(deps)); // 访问 app

    // 仪表板路由
    this.app.use('/api/dashboard', createDashboardRoutes(deps)); // 访问 app

    // 策略路由
    this.app.use('/api/strategies', createStrategyRoutes(deps)); // 访问 app

    // 交易路由
    this.app.use('/api/trades', createTradeRoutes(deps)); // 访问 app

    // 持仓路由
    this.app.use('/api/positions', createPositionRoutes(deps)); // 访问 app

    // 风控路由
    this.app.use('/api/risk', createRiskRoutes(deps)); // 访问 app

    // 交易所路由
    this.app.use('/api/exchanges', createExchangeRoutes(deps)); // 访问 app

    // 系统路由
    this.app.use('/api/system', createSystemRoutes(deps)); // 访问 app

    // 404 处理
    this.app.use('/api/*', (req, res) => { // 访问 app
      res.status(404).json({ // 调用 res.status
        success: false, // 成功标记
        error: 'API endpoint not found', // 错误
        code: 'NOT_FOUND', // 代码
        path: req.path, // 路径
      }); // 结束代码块
    }); // 结束代码块

    // 全局错误处理
    this.app.use((err, req, res, next) => { // 访问 app
      console.error(`[API Error] ${req.method} ${req.path}:`, err); // 控制台输出

      // 限流错误
      if (err.type === 'RATE_LIMIT') { // 条件判断 err.type === 'RATE_LIMIT'
        return res.status(429).json({ // 返回结果
          success: false, // 成功标记
          error: 'Too many requests', // 错误
          code: 'RATE_LIMIT_EXCEEDED', // 代码
          retryAfter: err.retryAfter, // 重试之后
        }); // 结束代码块
      } // 结束代码块

      // 认证错误
      if (err.type === 'AUTH_ERROR') { // 条件判断 err.type === 'AUTH_ERROR'
        return res.status(401).json({ // 返回结果
          success: false, // 成功标记
          error: err.message, // 错误
          code: 'UNAUTHORIZED', // 代码
        }); // 结束代码块
      } // 结束代码块

      // 权限错误
      if (err.type === 'PERMISSION_ERROR') { // 条件判断 err.type === 'PERMISSION_ERROR'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: err.message, // 错误
          code: 'FORBIDDEN', // 代码
        }); // 结束代码块
      } // 结束代码块

      // 通用错误
      res.status(err.status || 500).json({ // 调用 res.status
        success: false, // 成功标记
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message, // 错误
        code: 'INTERNAL_ERROR', // 代码
        requestId: req.requestId, // requestID
      }); // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 启动服务器
   */
  async start() { // 执行语句
    this.setupMiddleware(); // 调用 setupMiddleware
    this.setupRoutes(); // 调用 setupRoutes

    return new Promise((resolve, reject) => { // 返回结果
      this.server = createServer(this.app); // 设置 server

      this.server.listen(this.config.port, this.config.host, () => { // 访问 server
        console.log(`[API Server] Running on http://${this.config.host}:${this.config.port}`); // 控制台输出
        resolve(this.server); // 调用 resolve
      }); // 结束代码块

      this.server.on('error', (error) => { // 访问 server
        console.error('[API Server] Failed to start:', error); // 控制台输出
        reject(error); // 调用 reject
      }); // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 停止服务器
   */
  async stop() { // 执行语句
    if (this.server) { // 条件判断 this.server
      return new Promise((resolve) => { // 返回结果
        this.server.close(() => { // 访问 server
          console.log('[API Server] Stopped'); // 控制台输出
          this.server = null; // 设置 server
          resolve(); // 调用 resolve
        }); // 结束代码块
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取 Express 实例
   */
  getApp() { // 调用 getApp
    return this.app; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 创建 API 服务器实例
 */
export function createApiServer(config = {}) { // 导出函数 createApiServer
  return new ApiServer(config); // 返回结果
} // 结束代码块

export default ApiServer; // 默认导出
