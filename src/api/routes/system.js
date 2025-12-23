/**
 * RESTful API 路由 - 系统管理
 * System Management Routes
 *
 * @module src/api/routes/system
 */

import { Router } from 'express';

/**
 * 创建系统管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createSystemRoutes(deps = {}) {
  const router = Router();
  const { configManager, healthChecker, tradingEngine } = deps;

  /**
   * GET /api/system/status
   * 获取系统状态
   */
  router.get('/status', async (req, res) => {
    try {
      const status = {
        version: process.env.npm_package_version || '1.0.0',
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        timestamp: new Date().toISOString(),
        mode: process.env.RUN_MODE || 'shadow',
        pid: process.pid,
      };

      if (tradingEngine) {
        status.engine = {
          running: tradingEngine.isRunning?.() || false,
          strategies: tradingEngine.getActiveStrategies?.()?.length || 0,
        };
      }

      res.json({ success: true, data: status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/system/config
   * 获取系统配置
   */
  router.get('/config', async (req, res) => {
    try {
      let config = {};

      if (configManager) {
        config = configManager.getAll?.() || {};
      } else {
        config = {
          runMode: process.env.RUN_MODE || 'shadow',
          logging: { level: process.env.LOG_LEVEL || 'info' },
          server: {
            httpPort: parseInt(process.env.HTTP_PORT) || 3000,
            wsPort: parseInt(process.env.WS_PORT) || 3001,
          },
        };
      }

      // 移除敏感信息
      const safeConfig = { ...config };
      if (safeConfig.exchange) {
        Object.keys(safeConfig.exchange).forEach(key => {
          if (safeConfig.exchange[key]?.secret) {
            safeConfig.exchange[key].secret = '******';
          }
          if (safeConfig.exchange[key]?.apiKey) {
            safeConfig.exchange[key].apiKey = safeConfig.exchange[key].apiKey.slice(0, 8) + '******';
          }
        });
      }

      res.json({ success: true, data: safeConfig });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/system/config
   * 更新系统配置
   */
  router.put('/config', async (req, res) => {
    try {
      const updates = req.body;

      // 验证权限 - 只有管理员可以修改配置
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN'
        });
      }

      if (configManager) {
        await configManager.update(updates);
      }

      res.json({ success: true, message: 'Configuration updated' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/system/metrics
   * 获取系统指标
   */
  router.get('/metrics', async (req, res) => {
    try {
      const metrics = {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
        timestamp: Date.now(),
      };

      // 添加交易引擎指标
      if (tradingEngine?.getMetrics) {
        metrics.trading = tradingEngine.getMetrics();
      }

      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/health
   * 健康检查
   */
  router.get('/health', async (req, res) => {
    try {
      if (healthChecker) {
        const health = await healthChecker.check();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        return res.status(statusCode).json(health);
      }

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(503).json({ status: 'unhealthy', error: error.message });
    }
  });

  return router;
}

export default createSystemRoutes;
