/**
 * 系统监控器
 * System Monitor
 *
 * 监控系统运行状态，包括性能、健康检查等
 * Monitors system running status, including performance, health checks, etc.
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// 导入 Prometheus 客户端 / Import Prometheus client
import promClient from 'prom-client'; // 导入模块 prom-client

/**
 * 系统监控器类
 * System Monitor Class
 */
export class SystemMonitor extends EventEmitter { // 导出类 SystemMonitor
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 监控配置 / Monitor configuration
    this.config = { // 设置 config
      // 收集间隔 (毫秒) / Collection interval (milliseconds)
      collectInterval: config.collectInterval || 10000,  // 收集间隔 (毫秒)

      // 健康检查间隔 (毫秒) / Health check interval (milliseconds)
      healthCheckInterval: config.healthCheckInterval || 30000,  // 健康检查间隔 (毫秒)

      // 是否启用 Prometheus 指标 / Whether to enable Prometheus metrics
      enablePrometheus: config.enablePrometheus !== false, // 是否启用 Prometheus 指标

      // 内存警告阈值 (MB) / Memory warning threshold (MB)
      memoryWarningThreshold: config.memoryWarningThreshold || 512, // 内存警告阈值 (MB)

      // CPU 警告阈值 (%) / CPU warning threshold (%)
      cpuWarningThreshold: config.cpuWarningThreshold || 80, // CPU 警告阈值 (%)
    }; // 结束代码块

    // 监控数据 / Monitor data
    this.metrics = { // 设置 metrics
      // 系统启动时间 / System start time
      startTime: Date.now(), // 启动时间

      // 内存使用 / Memory usage
      memory: {}, // 内存

      // CPU 使用 / CPU usage
      cpu: {}, // CPU

      // 交易统计 / Trade statistics
      trades: { // 成交
        total: 0, // 总
        successful: 0, // successful
        failed: 0, // failed
      }, // 结束代码块

      // 订单统计 / Order statistics
      orders: { // 订单
        total: 0, // 总
        filled: 0, // filled
        cancelled: 0, // cancelled
        pending: 0, // 待处理
      }, // 结束代码块

      // 盈亏统计 / PnL statistics
      pnl: { // 盈亏
        total: 0, // 总
        realized: 0, // 已实现
        unrealized: 0, // 未实现
      }, // 结束代码块

      // 错误计数 / Error count
      errors: 0, // 错误列表

      // 最后更新时间 / Last update time
      lastUpdate: null, // last更新
    }; // 结束代码块

    // 健康状态 / Health status
    this.health = { // 设置 health
      status: 'unknown', // 状态
      checks: {}, // checks
      lastCheck: null, // lastCheck
    }; // 结束代码块

    // 定时器 / Timers
    this.collectTimer = null; // 设置 collectTimer
    this.healthCheckTimer = null; // 设置 healthCheckTimer

    // Prometheus 指标 / Prometheus metrics
    this.promMetrics = {}; // 设置 promMetrics

    // 初始化 Prometheus 指标 / Initialize Prometheus metrics
    if (this.config.enablePrometheus) { // 条件判断 this.config.enablePrometheus
      this._initPrometheusMetrics(); // 调用 _initPrometheusMetrics
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动监控
   * Start monitoring
   */
  start() { // 调用 start
    console.log('[Monitor] 启动系统监控 / Starting system monitoring'); // 控制台输出

    // 启动指标收集 / Start metrics collection
    this._startMetricsCollection(); // 调用 _startMetricsCollection

    // 启动健康检查 / Start health checks
    this._startHealthChecks(); // 调用 _startHealthChecks

    // 发出启动事件 / Emit start event
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止监控
   * Stop monitoring
   */
  stop() { // 调用 stop
    console.log('[Monitor] 停止系统监控 / Stopping system monitoring'); // 控制台输出

    // 清除定时器 / Clear timers
    if (this.collectTimer) { // 条件判断 this.collectTimer
      clearInterval(this.collectTimer); // 调用 clearInterval
      this.collectTimer = null; // 设置 collectTimer
    } // 结束代码块

    if (this.healthCheckTimer) { // 条件判断 this.healthCheckTimer
      clearInterval(this.healthCheckTimer); // 调用 clearInterval
      this.healthCheckTimer = null; // 设置 healthCheckTimer
    } // 结束代码块

    // 发出停止事件 / Emit stop event
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  /**
   * 记录交易
   * Record trade
   * @param {Object} trade - 交易信息 / Trade information
   */
  recordTrade(trade) { // 调用 recordTrade
    this.metrics.trades.total++; // 访问 metrics

    if (trade.success || trade.status === 'filled') { // 条件判断 trade.success || trade.status === 'filled'
      this.metrics.trades.successful++; // 访问 metrics
    } else { // 执行语句
      this.metrics.trades.failed++; // 访问 metrics
    } // 结束代码块

    // 更新 Prometheus 指标 / Update Prometheus metrics
    if (this.promMetrics.tradesTotal) { // 条件判断 this.promMetrics.tradesTotal
      this.promMetrics.tradesTotal.inc({ // 访问 promMetrics
        status: trade.success ? 'success' : 'failed', // 状态
      }); // 结束代码块
    } // 结束代码块

    // 发出交易记录事件 / Emit trade recorded event
    this.emit('tradeRecorded', trade); // 调用 emit
  } // 结束代码块

  /**
   * 记录订单
   * Record order
   * @param {Object} order - 订单信息 / Order information
   */
  recordOrder(order) { // 调用 recordOrder
    this.metrics.orders.total++; // 访问 metrics

    switch (order.status) { // 分支选择 order.status
      case 'filled': // 分支 'filled'
        this.metrics.orders.filled++; // 访问 metrics
        break; // 跳出循环或分支
      case 'cancelled': // 分支 'cancelled'
        this.metrics.orders.cancelled++; // 访问 metrics
        break; // 跳出循环或分支
      case 'pending': // 分支 'pending'
      case 'open': // 分支 'open'
        this.metrics.orders.pending++; // 访问 metrics
        break; // 跳出循环或分支
    } // 结束代码块

    // 更新 Prometheus 指标 / Update Prometheus metrics
    if (this.promMetrics.ordersTotal) { // 条件判断 this.promMetrics.ordersTotal
      this.promMetrics.ordersTotal.inc({ // 访问 promMetrics
        status: order.status, // 状态
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新盈亏
   * Update PnL
   * @param {Object} pnl - 盈亏信息 / PnL information
   */
  updatePnL(pnl) { // 调用 updatePnL
    this.metrics.pnl.realized = pnl.realized || this.metrics.pnl.realized; // 访问 metrics
    this.metrics.pnl.unrealized = pnl.unrealized || this.metrics.pnl.unrealized; // 访问 metrics
    this.metrics.pnl.total = this.metrics.pnl.realized + this.metrics.pnl.unrealized; // 访问 metrics

    // 更新 Prometheus 指标 / Update Prometheus metrics
    if (this.promMetrics.pnlGauge) { // 条件判断 this.promMetrics.pnlGauge
      this.promMetrics.pnlGauge.set({ type: 'realized' }, this.metrics.pnl.realized); // 访问 promMetrics
      this.promMetrics.pnlGauge.set({ type: 'unrealized' }, this.metrics.pnl.unrealized); // 访问 promMetrics
      this.promMetrics.pnlGauge.set({ type: 'total' }, this.metrics.pnl.total); // 访问 promMetrics
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录错误
   * Record error
   * @param {Error} error - 错误对象 / Error object
   */
  recordError(error) { // 调用 recordError
    this.metrics.errors++; // 访问 metrics

    // 更新 Prometheus 指标 / Update Prometheus metrics
    if (this.promMetrics.errorsTotal) { // 条件判断 this.promMetrics.errorsTotal
      this.promMetrics.errorsTotal.inc(); // 访问 promMetrics
    } // 结束代码块

    // 发出错误记录事件 / Emit error recorded event
    this.emit('errorRecorded', error); // 调用 emit
  } // 结束代码块

  /**
   * 获取监控指标
   * Get monitoring metrics
   * @returns {Object} 监控指标 / Monitoring metrics
   */
  getMetrics() { // 调用 getMetrics
    return { // 返回结果
      ...this.metrics, // 展开对象或数组
      uptime: Date.now() - this.metrics.startTime, // uptime
      health: this.health, // health
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取 Prometheus 指标
   * Get Prometheus metrics
   * @returns {Promise<string>} Prometheus 格式的指标 / Prometheus formatted metrics
   */
  async getPrometheusMetrics() { // 执行语句
    if (!this.config.enablePrometheus) { // 条件判断 !this.config.enablePrometheus
      return ''; // 返回结果
    } // 结束代码块
    return promClient.register.metrics(); // 返回结果
  } // 结束代码块

  /**
   * 注册健康检查
   * Register health check
   * @param {string} name - 检查名称 / Check name
   * @param {Function} checkFn - 检查函数 / Check function
   */
  registerHealthCheck(name, checkFn) { // 调用 registerHealthCheck
    this.health.checks[name] = { // 访问 health
      fn: checkFn, // fn
      status: 'unknown', // 状态
      lastCheck: null, // lastCheck
      error: null, // 错误
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 初始化 Prometheus 指标
   * Initialize Prometheus metrics
   * @private
   */
  _initPrometheusMetrics() { // 调用 _initPrometheusMetrics
    // 收集默认指标 / Collect default metrics
    promClient.collectDefaultMetrics({ // 调用 promClient.collectDefaultMetrics
      prefix: 'quant_trading_', // 前缀
    }); // 结束代码块

    // 交易计数器 / Trade counter
    this.promMetrics.tradesTotal = new promClient.Counter({ // 访问 promMetrics
      name: 'quant_trading_trades_total', // name
      help: '交易总数 / Total trades', // help
      labelNames: ['status'], // labelNames
    }); // 结束代码块

    // 订单计数器 / Order counter
    this.promMetrics.ordersTotal = new promClient.Counter({ // 访问 promMetrics
      name: 'quant_trading_orders_total', // name
      help: '订单总数 / Total orders', // help
      labelNames: ['status'], // labelNames
    }); // 结束代码块

    // 盈亏指标 / PnL gauge
    this.promMetrics.pnlGauge = new promClient.Gauge({ // 访问 promMetrics
      name: 'quant_trading_pnl', // name
      help: '盈亏 / Profit and Loss', // help
      labelNames: ['type'], // labelNames
    }); // 结束代码块

    // 错误计数器 / Error counter
    this.promMetrics.errorsTotal = new promClient.Counter({ // 访问 promMetrics
      name: 'quant_trading_errors_total', // name
      help: '错误总数 / Total errors', // help
    }); // 结束代码块

    // 内存使用指标 / Memory usage gauge
    this.promMetrics.memoryUsage = new promClient.Gauge({ // 访问 promMetrics
      name: 'quant_trading_memory_usage_bytes', // name
      help: '内存使用 / Memory usage in bytes', // help
      labelNames: ['type'], // labelNames
    }); // 结束代码块

    // 运行时间指标 / Uptime gauge
    this.promMetrics.uptime = new promClient.Gauge({ // 访问 promMetrics
      name: 'quant_trading_uptime_seconds', // name
      help: '运行时间 / Uptime in seconds', // help
    }); // 结束代码块

    console.log('[Monitor] Prometheus 指标已初始化 / Prometheus metrics initialized'); // 控制台输出
  } // 结束代码块

  /**
   * 启动指标收集
   * Start metrics collection
   * @private
   */
  _startMetricsCollection() { // 调用 _startMetricsCollection
    // 立即收集一次 / Collect immediately
    this._collectMetrics(); // 调用 _collectMetrics

    // 定时收集 / Collect periodically
    this.collectTimer = setInterval(() => { // 设置 collectTimer
      this._collectMetrics(); // 调用 _collectMetrics
    }, this.config.collectInterval); // 执行语句
  } // 结束代码块

  /**
   * 收集指标
   * Collect metrics
   * @private
   */
  _collectMetrics() { // 调用 _collectMetrics
    // 收集内存使用 / Collect memory usage
    const memUsage = process.memoryUsage(); // 定义常量 memUsage
    this.metrics.memory = { // 访问 metrics
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),  // heapUsed
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),  // heap总
      rss: Math.round(memUsage.rss / 1024 / 1024),  // rss
      external: Math.round(memUsage.external / 1024 / 1024),  // external
    }; // 结束代码块

    // 更新 Prometheus 内存指标 / Update Prometheus memory metrics
    if (this.promMetrics.memoryUsage) { // 条件判断 this.promMetrics.memoryUsage
      this.promMetrics.memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed); // 访问 promMetrics
      this.promMetrics.memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal); // 访问 promMetrics
      this.promMetrics.memoryUsage.set({ type: 'rss' }, memUsage.rss); // 访问 promMetrics
    } // 结束代码块

    // 更新运行时间指标 / Update uptime metric
    if (this.promMetrics.uptime) { // 条件判断 this.promMetrics.uptime
      this.promMetrics.uptime.set((Date.now() - this.metrics.startTime) / 1000); // 访问 promMetrics
    } // 结束代码块

    // 更新最后更新时间 / Update last update time
    this.metrics.lastUpdate = Date.now(); // 访问 metrics

    // 检查内存警告 / Check memory warning
    if (this.metrics.memory.heapUsed > this.config.memoryWarningThreshold) { // 条件判断 this.metrics.memory.heapUsed > this.config.me...
      this.emit('warning', { // 调用 emit
        type: 'memory', // 类型
        message: `内存使用过高 / High memory usage: ${this.metrics.memory.heapUsed}MB`, // 消息
        value: this.metrics.memory.heapUsed, // value
      }); // 结束代码块
    } // 结束代码块

    // 发出指标收集事件 / Emit metrics collected event
    this.emit('metricsCollected', this.metrics); // 调用 emit
  } // 结束代码块

  /**
   * 启动健康检查
   * Start health checks
   * @private
   */
  _startHealthChecks() { // 调用 _startHealthChecks
    // 立即检查一次 / Check immediately
    this._runHealthChecks(); // 调用 _runHealthChecks

    // 定时检查 / Check periodically
    this.healthCheckTimer = setInterval(() => { // 设置 healthCheckTimer
      this._runHealthChecks(); // 调用 _runHealthChecks
    }, this.config.healthCheckInterval); // 执行语句
  } // 结束代码块

  /**
   * 运行健康检查
   * Run health checks
   * @private
   */
  async _runHealthChecks() { // 执行语句
    let allHealthy = true; // 定义变量 allHealthy

    // 运行所有注册的健康检查 / Run all registered health checks
    for (const [name, check] of Object.entries(this.health.checks)) { // 循环 const [name, check] of Object.entries(this.he...
      try { // 尝试执行
        // 运行检查 / Run check
        const result = await check.fn(); // 定义常量 result

        // 更新检查状态 / Update check status
        check.status = result ? 'healthy' : 'unhealthy'; // 赋值 check.status
        check.lastCheck = Date.now(); // 赋值 check.lastCheck
        check.error = null; // 赋值 check.error

        if (!result) { // 条件判断 !result
          allHealthy = false; // 赋值 allHealthy
        } // 结束代码块
      } catch (error) { // 执行语句
        // 检查失败 / Check failed
        check.status = 'unhealthy'; // 赋值 check.status
        check.lastCheck = Date.now(); // 赋值 check.lastCheck
        check.error = error.message; // 赋值 check.error
        allHealthy = false; // 赋值 allHealthy
      } // 结束代码块
    } // 结束代码块

    // 更新整体健康状态 / Update overall health status
    this.health.status = allHealthy ? 'healthy' : 'unhealthy'; // 访问 health
    this.health.lastCheck = Date.now(); // 访问 health

    // 发出健康检查事件 / Emit health check event
    this.emit('healthChecked', this.health); // 调用 emit

    // 如果不健康，发出警告 / If unhealthy, emit warning
    if (!allHealthy) { // 条件判断 !allHealthy
      this.emit('warning', { // 调用 emit
        type: 'health', // 类型
        message: '系统健康检查失败 / System health check failed', // 消息
        checks: this.health.checks, // checks
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出默认类 / Export default class
export default SystemMonitor; // 默认导出
