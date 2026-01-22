/**
 * 健康检查模块
 * Health Check Module
 *
 * 提供系统健康状态监控端点
 * Provides system health monitoring endpoints
 *
 * @module src/middleware/healthCheck
 */

import os from 'os'; // 导入模块 os

/**
 * 健康检查状态
 */
const HealthStatus = { // 定义常量 HealthStatus
  HEALTHY: 'healthy', // 设置 HEALTHY 字段
  DEGRADED: 'degraded', // 设置 DEGRADED 字段
  UNHEALTHY: 'unhealthy', // 设置 UNHEALTHY 字段
}; // 结束代码块

/**
 * 健康检查组件
 */
const ComponentType = { // 定义常量 ComponentType
  DATABASE: 'database', // 设置 DATABASE 字段
  EXCHANGE: 'exchange', // 设置 EXCHANGE 字段
  REDIS: 'redis', // 设置 REDIS 字段
  MEMORY: 'memory', // 设置 MEMORY 字段
  DISK: 'disk', // 设置 DISK 字段
  NETWORK: 'network', // 设置 NETWORK 字段
}; // 结束代码块

/**
 * 健康检查器类
 * Health Checker Class
 */
class HealthChecker { // 定义类 HealthChecker
  constructor(config = {}) { // 构造函数
    this.config = { // 设置 config
      // 内存阈值 (MB)
      memoryThresholdMB: config.memoryThresholdMB || 500, // 设置 memoryThresholdMB 字段
      // 内存使用率警告阈值
      memoryWarningPercent: config.memoryWarningPercent || 80, // 设置 memoryWarningPercent 字段
      // 内存使用率严重阈值
      memoryCriticalPercent: config.memoryCriticalPercent || 95, // 设置 memoryCriticalPercent 字段
      // 响应时间警告阈值 (ms)
      responseTimeWarningMs: config.responseTimeWarningMs || 1000, // 设置 responseTimeWarningMs 字段
      // 响应时间严重阈值 (ms)
      responseTimeCriticalMs: config.responseTimeCriticalMs || 5000, // 设置 responseTimeCriticalMs 字段
      // 组件检查超时 (ms)
      componentTimeout: config.componentTimeout || 5000, // 设置 componentTimeout 字段
    }; // 结束代码块

    // 注册的组件检查器
    this.componentCheckers = new Map(); // 设置 componentCheckers

    // 系统启动时间
    this.startTime = Date.now(); // 设置 startTime

    // 最近检查结果缓存
    this.lastCheck = null; // 设置 lastCheck
    this.lastCheckTime = 0; // 设置 lastCheckTime
    this.cacheTimeMs = config.cacheTimeMs || 5000; // 设置 cacheTimeMs
  } // 结束代码块

  /**
   * 注册组件检查器
   * @param {string} name - 组件名称
   * @param {Function} checker - 检查函数，返回 { status, message, details }
   */
  registerComponent(name, checker) { // 调用 registerComponent
    this.componentCheckers.set(name, checker); // 访问 componentCheckers
  } // 结束代码块

  /**
   * 移除组件检查器
   * @param {string} name - 组件名称
   */
  unregisterComponent(name) { // 调用 unregisterComponent
    this.componentCheckers.delete(name); // 访问 componentCheckers
  } // 结束代码块

  /**
   * 执行完整健康检查
   * @param {boolean} useCache - 是否使用缓存
   * @returns {Promise<Object>} 健康检查结果
   */
  async check(useCache = true) { // 执行语句
    // 检查缓存
    if (useCache && this.lastCheck && (Date.now() - this.lastCheckTime < this.cacheTimeMs)) { // 条件判断 useCache && this.lastCheck && (Date.now() - t...
      return this.lastCheck; // 返回结果
    } // 结束代码块

    const startTime = Date.now(); // 定义常量 startTime

    // 检查所有组件
    const components = {}; // 定义常量 components
    const componentResults = []; // 定义常量 componentResults

    // 并行检查所有注册的组件
    const checkerPromises = Array.from(this.componentCheckers.entries()).map( // 定义常量 checkerPromises
      async ([name, checker]) => { // 调用 async
        try { // 尝试执行
          const result = await Promise.race([ // 定义常量 result
            checker(), // 调用 checker
            this._timeout(this.config.componentTimeout, `${name} check timeout`), // 调用 _timeout
          ]); // 结束数组或索引
          return { name, ...result }; // 返回结果
        } catch (error) { // 执行语句
          return { // 返回结果
            name, // 执行语句
            status: HealthStatus.UNHEALTHY, // 设置 status 字段
            message: error.message, // 设置 message 字段
          }; // 结束代码块
        } // 结束代码块
      } // 结束代码块
    ); // 结束调用或参数

    const checkerResults = await Promise.all(checkerPromises); // 定义常量 checkerResults

    for (const result of checkerResults) { // 循环 const result of checkerResults
      const { name, ...rest } = result; // 解构赋值
      components[name] = rest; // 执行语句
      componentResults.push(result); // 调用 componentResults.push
    } // 结束代码块

    // 添加系统检查
    components.memory = this._checkMemory(); // 赋值 components.memory
    components.system = this._checkSystem(); // 赋值 components.system

    componentResults.push({ name: 'memory', ...components.memory }); // 调用 componentResults.push
    componentResults.push({ name: 'system', ...components.system }); // 调用 componentResults.push

    // 计算总体状态
    const overallStatus = this._calculateOverallStatus(componentResults); // 定义常量 overallStatus

    const result = { // 定义常量 result
      status: overallStatus, // 设置 status 字段
      timestamp: new Date().toISOString(), // 设置 timestamp 字段
      uptime: Math.floor((Date.now() - this.startTime) / 1000), // 设置 uptime 字段
      responseTime: Date.now() - startTime, // 设置 responseTime 字段
      version: process.env.npm_package_version || '1.0.0', // 读取环境变量
      components, // 执行语句
    }; // 结束代码块

    // 缓存结果
    this.lastCheck = result; // 设置 lastCheck
    this.lastCheckTime = Date.now(); // 设置 lastCheckTime

    return result; // 返回结果
  } // 结束代码块

  /**
   * 快速存活检查 (不检查依赖)
   * @returns {Object} 存活状态
   */
  liveness() { // 调用 liveness
    return { // 返回结果
      status: HealthStatus.HEALTHY, // 设置 status 字段
      timestamp: new Date().toISOString(), // 设置 timestamp 字段
      uptime: Math.floor((Date.now() - this.startTime) / 1000), // 设置 uptime 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 就绪检查 (检查是否可以接收流量)
   * @returns {Promise<Object>} 就绪状态
   */
  async readiness() { // 执行语句
    // 检查关键组件
    const criticalComponents = ['database', 'exchange']; // 定义常量 criticalComponents
    const results = {}; // 定义常量 results
    let isReady = true; // 定义变量 isReady

    for (const name of criticalComponents) { // 循环 const name of criticalComponents
      const checker = this.componentCheckers.get(name); // 定义常量 checker
      if (checker) { // 条件判断 checker
        try { // 尝试执行
          const result = await Promise.race([ // 定义常量 result
            checker(), // 调用 checker
            this._timeout(this.config.componentTimeout, `${name} check timeout`), // 调用 _timeout
          ]); // 结束数组或索引
          results[name] = result; // 执行语句
          if (result.status === HealthStatus.UNHEALTHY) { // 条件判断 result.status === HealthStatus.UNHEALTHY
            isReady = false; // 赋值 isReady
          } // 结束代码块
        } catch (error) { // 执行语句
          results[name] = { // 执行语句
            status: HealthStatus.UNHEALTHY, // 设置 status 字段
            message: error.message, // 设置 message 字段
          }; // 结束代码块
          isReady = false; // 赋值 isReady
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 如果没有注册关键组件，检查内存
    if (criticalComponents.every(c => !this.componentCheckers.has(c))) { // 条件判断 criticalComponents.every(c => !this.component...
      const memoryCheck = this._checkMemory(); // 定义常量 memoryCheck
      results.memory = memoryCheck; // 赋值 results.memory
      isReady = memoryCheck.status !== HealthStatus.UNHEALTHY; // 赋值 isReady
    } // 结束代码块

    return { // 返回结果
      status: isReady ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY, // 设置 status 字段
      timestamp: new Date().toISOString(), // 设置 timestamp 字段
      components: results, // 设置 components 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 检查内存状态
   * @private
   */
  _checkMemory() { // 调用 _checkMemory
    const memUsage = process.memoryUsage(); // 定义常量 memUsage
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024); // 定义常量 heapUsedMB
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024); // 定义常量 heapTotalMB
    const rssMB = Math.round(memUsage.rss / 1024 / 1024); // 定义常量 rssMB
    const usagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100); // 定义常量 usagePercent

    let status = HealthStatus.HEALTHY; // 定义变量 status
    let message = 'Memory usage is normal'; // 定义变量 message

    if (usagePercent >= this.config.memoryCriticalPercent) { // 条件判断 usagePercent >= this.config.memoryCriticalPer...
      status = HealthStatus.UNHEALTHY; // 赋值 status
      message = `Memory usage critical: ${usagePercent}%`; // 赋值 message
    } else if (usagePercent >= this.config.memoryWarningPercent) { // 执行语句
      status = HealthStatus.DEGRADED; // 赋值 status
      message = `Memory usage high: ${usagePercent}%`; // 赋值 message
    } else if (heapUsedMB >= this.config.memoryThresholdMB) { // 执行语句
      status = HealthStatus.DEGRADED; // 赋值 status
      message = `Heap usage high: ${heapUsedMB}MB`; // 赋值 message
    } // 结束代码块

    return { // 返回结果
      status, // 执行语句
      message, // 执行语句
      details: { // 设置 details 字段
        heapUsedMB, // 执行语句
        heapTotalMB, // 执行语句
        rssMB, // 执行语句
        usagePercent, // 执行语句
        externalMB: Math.round(memUsage.external / 1024 / 1024), // 设置 externalMB 字段
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 检查系统状态
   * @private
   */
  _checkSystem() { // 调用 _checkSystem
    const loadAvg = os.loadavg(); // 定义常量 loadAvg
    const cpuCount = os.cpus().length; // 定义常量 cpuCount
    const load1Min = loadAvg[0] / cpuCount; // 定义常量 load1Min

    let status = HealthStatus.HEALTHY; // 定义变量 status
    let message = 'System load is normal'; // 定义变量 message

    if (load1Min > 1) { // 条件判断 load1Min > 1
      status = HealthStatus.UNHEALTHY; // 赋值 status
      message = `High system load: ${loadAvg[0].toFixed(2)}`; // 赋值 message
    } else if (load1Min > 0.7) { // 执行语句
      status = HealthStatus.DEGRADED; // 赋值 status
      message = `Elevated system load: ${loadAvg[0].toFixed(2)}`; // 赋值 message
    } // 结束代码块

    return { // 返回结果
      status, // 执行语句
      message, // 执行语句
      details: { // 设置 details 字段
        loadAverage: loadAvg.map(l => l.toFixed(2)), // 设置 loadAverage 字段
        cpuCount, // 执行语句
        freeMem: Math.round(os.freemem() / 1024 / 1024), // 设置 freeMem 字段
        totalMem: Math.round(os.totalmem() / 1024 / 1024), // 设置 totalMem 字段
        platform: os.platform(), // 设置 platform 字段
        nodeVersion: process.version, // 设置 nodeVersion 字段
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算总体状态
   * @private
   */
  _calculateOverallStatus(results) { // 调用 _calculateOverallStatus
    const hasUnhealthy = results.some(r => r.status === HealthStatus.UNHEALTHY); // 定义函数 hasUnhealthy
    const hasDegraded = results.some(r => r.status === HealthStatus.DEGRADED); // 定义函数 hasDegraded

    if (hasUnhealthy) { // 条件判断 hasUnhealthy
      return HealthStatus.UNHEALTHY; // 返回结果
    } // 结束代码块
    if (hasDegraded) { // 条件判断 hasDegraded
      return HealthStatus.DEGRADED; // 返回结果
    } // 结束代码块
    return HealthStatus.HEALTHY; // 返回结果
  } // 结束代码块

  /**
   * 超时 Promise
   * @private
   */
  _timeout(ms, message) { // 调用 _timeout
    return new Promise((_, reject) => { // 返回结果
      setTimeout(() => reject(new Error(message)), ms); // 设置延时任务
    }); // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 创建健康检查中间件
 * @param {HealthChecker} healthChecker - 健康检查器实例
 * @returns {Object} Express 路由处理器
 */
function createHealthRoutes(healthChecker) { // 定义函数 createHealthRoutes
  return { // 返回结果
    /**
     * GET /health - 完整健康检查
     */
    async health(req, res) { // 执行语句
      try { // 尝试执行
        const result = await healthChecker.check(); // 定义常量 result

        const statusCode = // 定义常量 statusCode
          result.status === HealthStatus.HEALTHY ? 200 : // 赋值 result.status
            result.status === HealthStatus.DEGRADED ? 200 : // 赋值 result.status
              503; // 执行语句

        res.status(statusCode).json(result); // 调用 res.status
      } catch (error) { // 执行语句
        res.status(503).json({ // 调用 res.status
          status: HealthStatus.UNHEALTHY, // 设置 status 字段
          timestamp: new Date().toISOString(), // 设置 timestamp 字段
          error: error.message, // 设置 error 字段
        }); // 结束代码块
      } // 结束代码块
    }, // 结束代码块

    /**
     * GET /health/live - 存活检查 (Kubernetes liveness probe)
     */
    liveness(req, res) { // 调用 liveness
      const result = healthChecker.liveness(); // 定义常量 result
      res.status(200).json(result); // 调用 res.status
    }, // 结束代码块

    /**
     * GET /health/ready - 就绪检查 (Kubernetes readiness probe)
     */
    async readiness(req, res) { // 执行语句
      try { // 尝试执行
        const result = await healthChecker.readiness(); // 定义常量 result
        const statusCode = result.status === HealthStatus.HEALTHY ? 200 : 503; // 定义常量 statusCode
        res.status(statusCode).json(result); // 调用 res.status
      } catch (error) { // 执行语句
        res.status(503).json({ // 调用 res.status
          status: HealthStatus.UNHEALTHY, // 设置 status 字段
          timestamp: new Date().toISOString(), // 设置 timestamp 字段
          error: error.message, // 设置 error 字段
        }); // 结束代码块
      } // 结束代码块
    }, // 结束代码块
  }; // 结束代码块
} // 结束代码块

/**
 * 创建健康检查中间件 (Express)
 * @param {HealthChecker} healthChecker - 健康检查器实例
 * @returns {Function} Express 中间件
 */
function createHealthMiddleware(healthChecker) { // 定义函数 createHealthMiddleware
  const routes = createHealthRoutes(healthChecker); // 定义常量 routes

  return async (req, res, next) => { // 返回结果
    const path = req.path.toLowerCase(); // 定义常量 path

    if (path === '/health' || path === '/health/') { // 条件判断 path === '/health' || path === '/health/'
      return routes.health(req, res); // 返回结果
    } // 结束代码块
    if (path === '/health/live' || path === '/health/liveness') { // 条件判断 path === '/health/live' || path === '/health/...
      return routes.liveness(req, res); // 返回结果
    } // 结束代码块
    if (path === '/health/ready' || path === '/health/readiness') { // 条件判断 path === '/health/ready' || path === '/health...
      return routes.readiness(req, res); // 返回结果
    } // 结束代码块

    next(); // 调用 next
  }; // 结束代码块
} // 结束代码块

/**
 * 预定义的组件检查器工厂
 */
const ComponentCheckers = { // 定义常量 ComponentCheckers
  /**
   * 创建交易所检查器
   * @param {Object} exchange - 交易所实例
   * @param {string} name - 交易所名称
   */
  createExchangeChecker(exchange, name = 'exchange') { // 调用 createExchangeChecker
    return async () => { // 返回结果
      try { // 尝试执行
        // 尝试获取服务器时间
        const serverTime = await exchange.fetchTime?.() || Date.now(); // 定义常量 serverTime
        const latency = Date.now() - serverTime; // 定义常量 latency

        let status = HealthStatus.HEALTHY; // 定义变量 status
        let message = `${name} is connected`; // 定义变量 message

        if (Math.abs(latency) > 5000) { // 条件判断 Math.abs(latency) > 5000
          status = HealthStatus.DEGRADED; // 赋值 status
          message = `${name} has high latency or time sync issue`; // 赋值 message
        } // 结束代码块

        return { // 返回结果
          status, // 执行语句
          message, // 执行语句
          details: { latency, serverTime }, // 设置 details 字段
        }; // 结束代码块
      } catch (error) { // 执行语句
        return { // 返回结果
          status: HealthStatus.UNHEALTHY, // 设置 status 字段
          message: `${name} connection failed: ${error.message}`, // 设置 message 字段
        }; // 结束代码块
      } // 结束代码块
    }; // 结束代码块
  }, // 结束代码块

  /**
   * 创建 Redis 检查器
   * @param {Object} redis - Redis 客户端实例
   */
  createRedisChecker(redis) { // 调用 createRedisChecker
    return async () => { // 返回结果
      try { // 尝试执行
        const start = Date.now(); // 定义常量 start
        await redis.ping(); // 等待异步结果
        const latency = Date.now() - start; // 定义常量 latency

        let status = HealthStatus.HEALTHY; // 定义变量 status
        if (latency > 100) { // 条件判断 latency > 100
          status = HealthStatus.DEGRADED; // 赋值 status
        } // 结束代码块

        return { // 返回结果
          status, // 执行语句
          message: 'Redis is connected', // 设置 message 字段
          details: { latency }, // 设置 details 字段
        }; // 结束代码块
      } catch (error) { // 执行语句
        return { // 返回结果
          status: HealthStatus.UNHEALTHY, // 设置 status 字段
          message: `Redis connection failed: ${error.message}`, // 设置 message 字段
        }; // 结束代码块
      } // 结束代码块
    }; // 结束代码块
  }, // 结束代码块

  /**
   * 创建数据库检查器
   * @param {Object} db - 数据库连接实例
   */
  createDatabaseChecker(db) { // 调用 createDatabaseChecker
    return async () => { // 返回结果
      try { // 尝试执行
        const start = Date.now(); // 定义常量 start
        // 假设 db 有 query 或 ping 方法
        if (db.query) { // 条件判断 db.query
          await db.query('SELECT 1'); // 等待异步结果
        } else if (db.ping) { // 执行语句
          await db.ping(); // 等待异步结果
        } // 结束代码块
        const latency = Date.now() - start; // 定义常量 latency

        let status = HealthStatus.HEALTHY; // 定义变量 status
        if (latency > 500) { // 条件判断 latency > 500
          status = HealthStatus.DEGRADED; // 赋值 status
        } // 结束代码块

        return { // 返回结果
          status, // 执行语句
          message: 'Database is connected', // 设置 message 字段
          details: { latency }, // 设置 details 字段
        }; // 结束代码块
      } catch (error) { // 执行语句
        return { // 返回结果
          status: HealthStatus.UNHEALTHY, // 设置 status 字段
          message: `Database connection failed: ${error.message}`, // 设置 message 字段
        }; // 结束代码块
      } // 结束代码块
    }; // 结束代码块
  }, // 结束代码块

  /**
   * 创建自定义 HTTP 端点检查器
   * @param {string} url - 检查 URL
   * @param {number} timeout - 超时时间
   */
  createHttpChecker(url, timeout = 5000) { // 调用 createHttpChecker
    return async () => { // 返回结果
      try { // 尝试执行
        const start = Date.now(); // 定义常量 start
        const controller = new AbortController(); // 定义常量 controller
        const timeoutId = setTimeout(() => controller.abort(), timeout); // 定义函数 timeoutId

        const response = await fetch(url, { // 定义常量 response
          method: 'GET', // 设置 method 字段
          signal: controller.signal, // 设置 signal 字段
        }); // 结束代码块

        clearTimeout(timeoutId); // 调用 clearTimeout
        const latency = Date.now() - start; // 定义常量 latency

        if (!response.ok) { // 条件判断 !response.ok
          return { // 返回结果
            status: HealthStatus.UNHEALTHY, // 设置 status 字段
            message: `HTTP check failed: ${response.status}`, // 设置 message 字段
            details: { latency, statusCode: response.status }, // 设置 details 字段
          }; // 结束代码块
        } // 结束代码块

        let status = HealthStatus.HEALTHY; // 定义变量 status
        if (latency > 2000) { // 条件判断 latency > 2000
          status = HealthStatus.DEGRADED; // 赋值 status
        } // 结束代码块

        return { // 返回结果
          status, // 执行语句
          message: 'HTTP endpoint is healthy', // 设置 message 字段
          details: { latency, statusCode: response.status }, // 设置 details 字段
        }; // 结束代码块
      } catch (error) { // 执行语句
        return { // 返回结果
          status: HealthStatus.UNHEALTHY, // 设置 status 字段
          message: `HTTP check failed: ${error.message}`, // 设置 message 字段
        }; // 结束代码块
      } // 结束代码块
    }; // 结束代码块
  }, // 结束代码块
}; // 结束代码块

// 创建默认健康检查器实例
const defaultHealthChecker = new HealthChecker(); // 定义常量 defaultHealthChecker

export { // 导出命名成员
  HealthChecker, // 执行语句
  HealthStatus, // 执行语句
  ComponentType, // 执行语句
  ComponentCheckers, // 执行语句
  createHealthRoutes, // 执行语句
  createHealthMiddleware, // 执行语句
  defaultHealthChecker, // 执行语句
}; // 结束代码块

export default HealthChecker; // 默认导出
