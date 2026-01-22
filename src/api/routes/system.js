/**
 * RESTful API 路由 - 系统管理
 * System Management Routes
 *
 * @module src/api/routes/system
 */

import { Router } from 'express'; // 导入模块 express

/**
 * 创建系统管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createSystemRoutes(deps = {}) { // 导出函数 createSystemRoutes
  const router = Router(); // 定义常量 router
  const { configManager, healthChecker, tradingEngine } = deps; // 解构赋值

  /**
   * GET /api/system/status
   * 获取系统状态
   */
  router.get('/status', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const status = { // 定义常量 status
        version: process.env.npm_package_version || '1.0.0', // version
        nodeVersion: process.version, // nodeVersion
        uptime: process.uptime(), // uptime
        memoryUsage: process.memoryUsage(), // 内存使用
        cpuUsage: process.cpuUsage(), // CPU使用
        timestamp: new Date().toISOString(), // 时间戳
        mode: process.env.RUN_MODE || 'shadow', // 模式
        pid: process.pid, // pid
      }; // 结束代码块

      if (tradingEngine) { // 条件判断 tradingEngine
        status.engine = { // 赋值 status.engine
          running: tradingEngine.isRunning?.() || false, // running
          strategies: tradingEngine.getActiveStrategies?.()?.length || 0, // 策略
        }; // 结束代码块
      } // 结束代码块

      res.json({ success: true, data: status }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/system/config
   * 获取系统配置
   */
  router.get('/config', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      let config = {}; // 定义变量 config

      if (configManager) { // 条件判断 configManager
        config = configManager.getAll?.() || {}; // 赋值 config
      } else { // 执行语句
        config = { // 赋值 config
          runMode: process.env.RUN_MODE || 'shadow', // run模式
          logging: { level: process.env.LOG_LEVEL || 'info' }, // logging
          server: { // server
            httpPort: parseInt(process.env.HTTP_PORT) || 3000, // http端口
            wsPort: parseInt(process.env.WS_PORT) || 3001, // ws端口
          }, // 结束代码块
        }; // 结束代码块
      } // 结束代码块

      // 移除敏感信息
      const safeConfig = { ...config }; // 定义常量 safeConfig
      if (safeConfig.exchange) { // 条件判断 safeConfig.exchange
        Object.keys(safeConfig.exchange).forEach(key => { // 调用 Object.keys
          if (safeConfig.exchange[key]?.secret) { // 条件判断 safeConfig.exchange[key]?.secret
            safeConfig.exchange[key].secret = '******'; // 执行语句
          } // 结束代码块
          if (safeConfig.exchange[key]?.apiKey) { // 条件判断 safeConfig.exchange[key]?.apiKey
            safeConfig.exchange[key].apiKey = safeConfig.exchange[key].apiKey.slice(0, 8) + '******'; // 执行语句
          } // 结束代码块
        }); // 结束代码块
      } // 结束代码块

      res.json({ success: true, data: safeConfig }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * PUT /api/system/config
   * 更新系统配置
   */
  router.put('/config', async (req, res) => { // 调用 router.put
    try { // 尝试执行
      const updates = req.body; // 定义常量 updates

      // 验证权限 - 只有管理员可以修改配置
      if (req.user?.role !== 'admin') { // 条件判断 req.user?.role !== 'admin'
        return res.status(403).json({ // 返回结果
          success: false, // 成功标记
          error: 'Admin permission required', // 错误
          code: 'FORBIDDEN' // 代码
        }); // 结束代码块
      } // 结束代码块

      if (configManager) { // 条件判断 configManager
        await configManager.update(updates); // 等待异步结果
      } // 结束代码块

      res.json({ success: true, message: 'Configuration updated' }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/system/metrics
   * 获取系统指标
   */
  router.get('/metrics', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      const metrics = { // 定义常量 metrics
        memory: process.memoryUsage(), // 内存
        cpu: process.cpuUsage(), // CPU
        uptime: process.uptime(), // uptime
        timestamp: Date.now(), // 时间戳
      }; // 结束代码块

      // 添加交易引擎指标
      if (tradingEngine?.getMetrics) { // 条件判断 tradingEngine?.getMetrics
        metrics.trading = tradingEngine.getMetrics(); // 赋值 metrics.trading
      } // 结束代码块

      res.json({ success: true, data: metrics }); // 调用 res.json
    } catch (error) { // 执行语句
      res.status(500).json({ success: false, error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  /**
   * GET /api/health
   * 健康检查
   */
  router.get('/health', async (req, res) => { // 调用 router.get
    try { // 尝试执行
      if (healthChecker) { // 条件判断 healthChecker
        const health = await healthChecker.check(); // 定义常量 health
        const statusCode = health.status === 'healthy' ? 200 : 503; // 定义常量 statusCode
        return res.status(statusCode).json(health); // 返回结果
      } // 结束代码块

      res.json({ // 调用 res.json
        status: 'healthy', // 状态
        timestamp: new Date().toISOString(), // 时间戳
        uptime: process.uptime(), // uptime
      }); // 结束代码块
    } catch (error) { // 执行语句
      res.status(503).json({ status: 'unhealthy', error: error.message }); // 调用 res.status
    } // 结束代码块
  }); // 结束代码块

  return router; // 返回结果
} // 结束代码块

export default createSystemRoutes; // 默认导出
