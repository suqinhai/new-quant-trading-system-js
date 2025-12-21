/**
 * 健康检查模块
 * Health Check Module
 *
 * 提供系统健康状态监控端点
 * Provides system health monitoring endpoints
 *
 * @module src/middleware/healthCheck
 */

import os from 'os';

/**
 * 健康检查状态
 */
const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
};

/**
 * 健康检查组件
 */
const ComponentType = {
  DATABASE: 'database',
  EXCHANGE: 'exchange',
  REDIS: 'redis',
  MEMORY: 'memory',
  DISK: 'disk',
  NETWORK: 'network',
};

/**
 * 健康检查器类
 * Health Checker Class
 */
class HealthChecker {
  constructor(config = {}) {
    this.config = {
      // 内存阈值 (MB)
      memoryThresholdMB: config.memoryThresholdMB || 500,
      // 内存使用率警告阈值
      memoryWarningPercent: config.memoryWarningPercent || 80,
      // 内存使用率严重阈值
      memoryCriticalPercent: config.memoryCriticalPercent || 95,
      // 响应时间警告阈值 (ms)
      responseTimeWarningMs: config.responseTimeWarningMs || 1000,
      // 响应时间严重阈值 (ms)
      responseTimeCriticalMs: config.responseTimeCriticalMs || 5000,
      // 组件检查超时 (ms)
      componentTimeout: config.componentTimeout || 5000,
    };

    // 注册的组件检查器
    this.componentCheckers = new Map();

    // 系统启动时间
    this.startTime = Date.now();

    // 最近检查结果缓存
    this.lastCheck = null;
    this.lastCheckTime = 0;
    this.cacheTimeMs = config.cacheTimeMs || 5000;
  }

  /**
   * 注册组件检查器
   * @param {string} name - 组件名称
   * @param {Function} checker - 检查函数，返回 { status, message, details }
   */
  registerComponent(name, checker) {
    this.componentCheckers.set(name, checker);
  }

  /**
   * 移除组件检查器
   * @param {string} name - 组件名称
   */
  unregisterComponent(name) {
    this.componentCheckers.delete(name);
  }

  /**
   * 执行完整健康检查
   * @param {boolean} useCache - 是否使用缓存
   * @returns {Promise<Object>} 健康检查结果
   */
  async check(useCache = true) {
    // 检查缓存
    if (useCache && this.lastCheck && (Date.now() - this.lastCheckTime < this.cacheTimeMs)) {
      return this.lastCheck;
    }

    const startTime = Date.now();

    // 检查所有组件
    const components = {};
    const componentResults = [];

    // 并行检查所有注册的组件
    const checkerPromises = Array.from(this.componentCheckers.entries()).map(
      async ([name, checker]) => {
        try {
          const result = await Promise.race([
            checker(),
            this._timeout(this.config.componentTimeout, `${name} check timeout`),
          ]);
          return { name, ...result };
        } catch (error) {
          return {
            name,
            status: HealthStatus.UNHEALTHY,
            message: error.message,
          };
        }
      }
    );

    const checkerResults = await Promise.all(checkerPromises);

    for (const result of checkerResults) {
      const { name, ...rest } = result;
      components[name] = rest;
      componentResults.push(result);
    }

    // 添加系统检查
    components.memory = this._checkMemory();
    components.system = this._checkSystem();

    componentResults.push({ name: 'memory', ...components.memory });
    componentResults.push({ name: 'system', ...components.system });

    // 计算总体状态
    const overallStatus = this._calculateOverallStatus(componentResults);

    const result = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      responseTime: Date.now() - startTime,
      version: process.env.npm_package_version || '1.0.0',
      components,
    };

    // 缓存结果
    this.lastCheck = result;
    this.lastCheckTime = Date.now();

    return result;
  }

  /**
   * 快速存活检查 (不检查依赖)
   * @returns {Object} 存活状态
   */
  liveness() {
    return {
      status: HealthStatus.HEALTHY,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * 就绪检查 (检查是否可以接收流量)
   * @returns {Promise<Object>} 就绪状态
   */
  async readiness() {
    // 检查关键组件
    const criticalComponents = ['database', 'exchange'];
    const results = {};
    let isReady = true;

    for (const name of criticalComponents) {
      const checker = this.componentCheckers.get(name);
      if (checker) {
        try {
          const result = await Promise.race([
            checker(),
            this._timeout(this.config.componentTimeout, `${name} check timeout`),
          ]);
          results[name] = result;
          if (result.status === HealthStatus.UNHEALTHY) {
            isReady = false;
          }
        } catch (error) {
          results[name] = {
            status: HealthStatus.UNHEALTHY,
            message: error.message,
          };
          isReady = false;
        }
      }
    }

    // 如果没有注册关键组件，检查内存
    if (criticalComponents.every(c => !this.componentCheckers.has(c))) {
      const memoryCheck = this._checkMemory();
      results.memory = memoryCheck;
      isReady = memoryCheck.status !== HealthStatus.UNHEALTHY;
    }

    return {
      status: isReady ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
      timestamp: new Date().toISOString(),
      components: results,
    };
  }

  /**
   * 检查内存状态
   * @private
   */
  _checkMemory() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    const usagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

    let status = HealthStatus.HEALTHY;
    let message = 'Memory usage is normal';

    if (usagePercent >= this.config.memoryCriticalPercent) {
      status = HealthStatus.UNHEALTHY;
      message = `Memory usage critical: ${usagePercent}%`;
    } else if (usagePercent >= this.config.memoryWarningPercent) {
      status = HealthStatus.DEGRADED;
      message = `Memory usage high: ${usagePercent}%`;
    } else if (heapUsedMB >= this.config.memoryThresholdMB) {
      status = HealthStatus.DEGRADED;
      message = `Heap usage high: ${heapUsedMB}MB`;
    }

    return {
      status,
      message,
      details: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        usagePercent,
        externalMB: Math.round(memUsage.external / 1024 / 1024),
      },
    };
  }

  /**
   * 检查系统状态
   * @private
   */
  _checkSystem() {
    const loadAvg = os.loadavg();
    const cpuCount = os.cpus().length;
    const load1Min = loadAvg[0] / cpuCount;

    let status = HealthStatus.HEALTHY;
    let message = 'System load is normal';

    if (load1Min > 1) {
      status = HealthStatus.UNHEALTHY;
      message = `High system load: ${loadAvg[0].toFixed(2)}`;
    } else if (load1Min > 0.7) {
      status = HealthStatus.DEGRADED;
      message = `Elevated system load: ${loadAvg[0].toFixed(2)}`;
    }

    return {
      status,
      message,
      details: {
        loadAverage: loadAvg.map(l => l.toFixed(2)),
        cpuCount,
        freeMem: Math.round(os.freemem() / 1024 / 1024),
        totalMem: Math.round(os.totalmem() / 1024 / 1024),
        platform: os.platform(),
        nodeVersion: process.version,
      },
    };
  }

  /**
   * 计算总体状态
   * @private
   */
  _calculateOverallStatus(results) {
    const hasUnhealthy = results.some(r => r.status === HealthStatus.UNHEALTHY);
    const hasDegraded = results.some(r => r.status === HealthStatus.DEGRADED);

    if (hasUnhealthy) {
      return HealthStatus.UNHEALTHY;
    }
    if (hasDegraded) {
      return HealthStatus.DEGRADED;
    }
    return HealthStatus.HEALTHY;
  }

  /**
   * 超时 Promise
   * @private
   */
  _timeout(ms, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }
}

/**
 * 创建健康检查中间件
 * @param {HealthChecker} healthChecker - 健康检查器实例
 * @returns {Object} Express 路由处理器
 */
function createHealthRoutes(healthChecker) {
  return {
    /**
     * GET /health - 完整健康检查
     */
    async health(req, res) {
      try {
        const result = await healthChecker.check();

        const statusCode =
          result.status === HealthStatus.HEALTHY ? 200 :
            result.status === HealthStatus.DEGRADED ? 200 :
              503;

        res.status(statusCode).json(result);
      } catch (error) {
        res.status(503).json({
          status: HealthStatus.UNHEALTHY,
          timestamp: new Date().toISOString(),
          error: error.message,
        });
      }
    },

    /**
     * GET /health/live - 存活检查 (Kubernetes liveness probe)
     */
    liveness(req, res) {
      const result = healthChecker.liveness();
      res.status(200).json(result);
    },

    /**
     * GET /health/ready - 就绪检查 (Kubernetes readiness probe)
     */
    async readiness(req, res) {
      try {
        const result = await healthChecker.readiness();
        const statusCode = result.status === HealthStatus.HEALTHY ? 200 : 503;
        res.status(statusCode).json(result);
      } catch (error) {
        res.status(503).json({
          status: HealthStatus.UNHEALTHY,
          timestamp: new Date().toISOString(),
          error: error.message,
        });
      }
    },
  };
}

/**
 * 创建健康检查中间件 (Express)
 * @param {HealthChecker} healthChecker - 健康检查器实例
 * @returns {Function} Express 中间件
 */
function createHealthMiddleware(healthChecker) {
  const routes = createHealthRoutes(healthChecker);

  return async (req, res, next) => {
    const path = req.path.toLowerCase();

    if (path === '/health' || path === '/health/') {
      return routes.health(req, res);
    }
    if (path === '/health/live' || path === '/health/liveness') {
      return routes.liveness(req, res);
    }
    if (path === '/health/ready' || path === '/health/readiness') {
      return routes.readiness(req, res);
    }

    next();
  };
}

/**
 * 预定义的组件检查器工厂
 */
const ComponentCheckers = {
  /**
   * 创建交易所检查器
   * @param {Object} exchange - 交易所实例
   * @param {string} name - 交易所名称
   */
  createExchangeChecker(exchange, name = 'exchange') {
    return async () => {
      try {
        // 尝试获取服务器时间
        const serverTime = await exchange.fetchTime?.() || Date.now();
        const latency = Date.now() - serverTime;

        let status = HealthStatus.HEALTHY;
        let message = `${name} is connected`;

        if (Math.abs(latency) > 5000) {
          status = HealthStatus.DEGRADED;
          message = `${name} has high latency or time sync issue`;
        }

        return {
          status,
          message,
          details: { latency, serverTime },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `${name} connection failed: ${error.message}`,
        };
      }
    };
  },

  /**
   * 创建 Redis 检查器
   * @param {Object} redis - Redis 客户端实例
   */
  createRedisChecker(redis) {
    return async () => {
      try {
        const start = Date.now();
        await redis.ping();
        const latency = Date.now() - start;

        let status = HealthStatus.HEALTHY;
        if (latency > 100) {
          status = HealthStatus.DEGRADED;
        }

        return {
          status,
          message: 'Redis is connected',
          details: { latency },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `Redis connection failed: ${error.message}`,
        };
      }
    };
  },

  /**
   * 创建数据库检查器
   * @param {Object} db - 数据库连接实例
   */
  createDatabaseChecker(db) {
    return async () => {
      try {
        const start = Date.now();
        // 假设 db 有 query 或 ping 方法
        if (db.query) {
          await db.query('SELECT 1');
        } else if (db.ping) {
          await db.ping();
        }
        const latency = Date.now() - start;

        let status = HealthStatus.HEALTHY;
        if (latency > 500) {
          status = HealthStatus.DEGRADED;
        }

        return {
          status,
          message: 'Database is connected',
          details: { latency },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `Database connection failed: ${error.message}`,
        };
      }
    };
  },

  /**
   * 创建自定义 HTTP 端点检查器
   * @param {string} url - 检查 URL
   * @param {number} timeout - 超时时间
   */
  createHttpChecker(url, timeout = 5000) {
    return async () => {
      try {
        const start = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latency = Date.now() - start;

        if (!response.ok) {
          return {
            status: HealthStatus.UNHEALTHY,
            message: `HTTP check failed: ${response.status}`,
            details: { latency, statusCode: response.status },
          };
        }

        let status = HealthStatus.HEALTHY;
        if (latency > 2000) {
          status = HealthStatus.DEGRADED;
        }

        return {
          status,
          message: 'HTTP endpoint is healthy',
          details: { latency, statusCode: response.status },
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `HTTP check failed: ${error.message}`,
        };
      }
    };
  },
};

// 创建默认健康检查器实例
const defaultHealthChecker = new HealthChecker();

export {
  HealthChecker,
  HealthStatus,
  ComponentType,
  ComponentCheckers,
  createHealthRoutes,
  createHealthMiddleware,
  defaultHealthChecker,
};

export default HealthChecker;
