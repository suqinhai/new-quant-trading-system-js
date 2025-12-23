/**
 * RESTful API 服务器
 * API Server Entry Point
 *
 * @module src/api/server
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';

import {
  createDashboardRoutes,
  createStrategyRoutes,
  createTradeRoutes,
  createPositionRoutes,
  createRiskRoutes,
  createExchangeRoutes,
  createSystemRoutes,
  createUserRoutes,
} from './routes/index.js';

import { RateLimiter } from './rateLimit.js';
import { RBACManager } from './rbac.js';
import { RequestTracingManager, getContext } from '../middleware/requestTracing.js';
import { setContextGetter } from '../utils/logger.js';
import { logger } from '../utils/logger.js';

// 初始化日志上下文获取器
setContextGetter(getContext);

/**
 * API 服务器类
 */
export class ApiServer {
  constructor(config = {}) {
    this.config = {
      port: config.port || parseInt(process.env.HTTP_PORT) || 3000,
      host: config.host || '0.0.0.0',
      corsOrigins: config.corsOrigins || ['http://localhost:5173', 'http://localhost:3000'],
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || 'your-secret-key',
      ...config,
    };

    this.app = express();
    this.server = null;
    this.deps = config.deps || {};

    // 初始化中间件
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.rbacManager = new RBACManager();

    // 初始化请求追踪管理器
    this.tracingManager = new RequestTracingManager({
      enabled: config.enableTracing !== false,
      slowRequestThreshold: config.slowRequestThreshold || 1000,
      excludePaths: ['/api/health', '/favicon.ico'],
    });

    // 监听追踪事件
    this._setupTracingEvents();
  }

  /**
   * 设置追踪事件监听
   */
  _setupTracingEvents() {
    // 记录慢请求
    this.tracingManager.on('slowRequest', (data) => {
      logger.warn('Slow request detected', {
        method: data.method,
        path: data.path,
        duration: data.duration,
        statusCode: data.statusCode,
      });
    });

    // 记录请求完成（debug 级别）
    this.tracingManager.on('requestEnd', (data) => {
      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug('Request completed', {
          method: data.method,
          path: data.path,
          statusCode: data.statusCode,
          duration: data.duration,
        });
      }
    });
  }

  /**
   * 初始化中间件
   */
  setupMiddleware() {
    // 安全头
    this.app.use(helmet({
      contentSecurityPolicy: false, // 允许 CSP 由前端控制
    }));

    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Trace-ID', 'X-Timestamp', 'X-Signature'],
    }));

    // 压缩
    this.app.use(compression());

    // 解析 JSON
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 请求追踪中间件（替代原有的请求日志）
    this.app.use(this.tracingManager.middleware());

    // 全局限流
    this.app.use(this.rateLimiter.middleware());

    // JWT 认证中间件
    this.app.use(this.authMiddleware.bind(this));
  }

  /**
   * JWT 认证中间件
   */
  authMiddleware(req, res, next) {
    // 跳过公开路由
    const publicPaths = [
      '/api/auth/login',
      '/api/health',
      '/api/system/health',
    ];

    if (publicPaths.some(p => req.path === p || req.path.startsWith(p))) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token required',
        code: 'UNAUTHORIZED',
      });
    }

    const token = authHeader.substring(7);

    try {
      // 验证 JWT
      const payload = this.verifyToken(token);
      req.user = payload;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'UNAUTHORIZED',
      });
    }
  }

  /**
   * 验证 JWT Token
   */
  verifyToken(token) {
    // 简化的 JWT 验证 (生产环境应使用 jsonwebtoken 库)
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      // 检查过期时间
      if (payload.exp && payload.exp < Date.now() / 1000) {
        throw new Error('Token expired');
      }

      return payload;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * 设置路由
   */
  setupRoutes() {
    const { deps } = this;

    // 健康检查 (无需认证)
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // 用户认证路由
    this.app.use('/api/auth', createUserRoutes(deps));
    this.app.use('/api/user', createUserRoutes(deps));

    // 仪表板路由
    this.app.use('/api/dashboard', createDashboardRoutes(deps));

    // 策略路由
    this.app.use('/api/strategies', createStrategyRoutes(deps));

    // 交易路由
    this.app.use('/api/trades', createTradeRoutes(deps));

    // 持仓路由
    this.app.use('/api/positions', createPositionRoutes(deps));

    // 风控路由
    this.app.use('/api/risk', createRiskRoutes(deps));

    // 交易所路由
    this.app.use('/api/exchanges', createExchangeRoutes(deps));

    // 系统路由
    this.app.use('/api/system', createSystemRoutes(deps));

    // 404 处理
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        code: 'NOT_FOUND',
        path: req.path,
      });
    });

    // 全局错误处理
    this.app.use((err, req, res, next) => {
      console.error(`[API Error] ${req.method} ${req.path}:`, err);

      // 限流错误
      if (err.type === 'RATE_LIMIT') {
        return res.status(429).json({
          success: false,
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: err.retryAfter,
        });
      }

      // 认证错误
      if (err.type === 'AUTH_ERROR') {
        return res.status(401).json({
          success: false,
          error: err.message,
          code: 'UNAUTHORIZED',
        });
      }

      // 权限错误
      if (err.type === 'PERMISSION_ERROR') {
        return res.status(403).json({
          success: false,
          error: err.message,
          code: 'FORBIDDEN',
        });
      }

      // 通用错误
      res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        code: 'INTERNAL_ERROR',
        requestId: req.requestId,
      });
    });
  }

  /**
   * 启动服务器
   */
  async start() {
    this.setupMiddleware();
    this.setupRoutes();

    return new Promise((resolve, reject) => {
      this.server = createServer(this.app);

      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`[API Server] Running on http://${this.config.host}:${this.config.port}`);
        resolve(this.server);
      });

      this.server.on('error', (error) => {
        console.error('[API Server] Failed to start:', error);
        reject(error);
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('[API Server] Stopped');
          this.server = null;
          resolve();
        });
      });
    }
  }

  /**
   * 获取 Express 实例
   */
  getApp() {
    return this.app;
  }
}

/**
 * 创建 API 服务器实例
 */
export function createApiServer(config = {}) {
  return new ApiServer(config);
}

export default ApiServer;
