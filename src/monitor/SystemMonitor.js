/**
 * 系统监控器
 * System Monitor
 *
 * 监控系统运行状态，包括性能、健康检查等
 * Monitors system running status, including performance, health checks, etc.
 */

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// 导入 Prometheus 客户端 / Import Prometheus client
import promClient from 'prom-client';

/**
 * 系统监控器类
 * System Monitor Class
 */
export class SystemMonitor extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 监控配置 / Monitor configuration
    this.config = {
      // 收集间隔 (毫秒) / Collection interval (milliseconds)
      collectInterval: config.collectInterval || 10000,  // 10 秒

      // 健康检查间隔 (毫秒) / Health check interval (milliseconds)
      healthCheckInterval: config.healthCheckInterval || 30000,  // 30 秒

      // 是否启用 Prometheus 指标 / Whether to enable Prometheus metrics
      enablePrometheus: config.enablePrometheus !== false,

      // 内存警告阈值 (MB) / Memory warning threshold (MB)
      memoryWarningThreshold: config.memoryWarningThreshold || 512,

      // CPU 警告阈值 (%) / CPU warning threshold (%)
      cpuWarningThreshold: config.cpuWarningThreshold || 80,
    };

    // 监控数据 / Monitor data
    this.metrics = {
      // 系统启动时间 / System start time
      startTime: Date.now(),

      // 内存使用 / Memory usage
      memory: {},

      // CPU 使用 / CPU usage
      cpu: {},

      // 交易统计 / Trade statistics
      trades: {
        total: 0,
        successful: 0,
        failed: 0,
      },

      // 订单统计 / Order statistics
      orders: {
        total: 0,
        filled: 0,
        cancelled: 0,
        pending: 0,
      },

      // 盈亏统计 / PnL statistics
      pnl: {
        total: 0,
        realized: 0,
        unrealized: 0,
      },

      // 错误计数 / Error count
      errors: 0,

      // 最后更新时间 / Last update time
      lastUpdate: null,
    };

    // 健康状态 / Health status
    this.health = {
      status: 'unknown',
      checks: {},
      lastCheck: null,
    };

    // 定时器 / Timers
    this.collectTimer = null;
    this.healthCheckTimer = null;

    // Prometheus 指标 / Prometheus metrics
    this.promMetrics = {};

    // 初始化 Prometheus 指标 / Initialize Prometheus metrics
    if (this.config.enablePrometheus) {
      this._initPrometheusMetrics();
    }
  }

  /**
   * 启动监控
   * Start monitoring
   */
  start() {
    console.log('[Monitor] 启动系统监控 / Starting system monitoring');

    // 启动指标收集 / Start metrics collection
    this._startMetricsCollection();

    // 启动健康检查 / Start health checks
    this._startHealthChecks();

    // 发出启动事件 / Emit start event
    this.emit('started');
  }

  /**
   * 停止监控
   * Stop monitoring
   */
  stop() {
    console.log('[Monitor] 停止系统监控 / Stopping system monitoring');

    // 清除定时器 / Clear timers
    if (this.collectTimer) {
      clearInterval(this.collectTimer);
      this.collectTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // 发出停止事件 / Emit stop event
    this.emit('stopped');
  }

  /**
   * 记录交易
   * Record trade
   * @param {Object} trade - 交易信息 / Trade information
   */
  recordTrade(trade) {
    this.metrics.trades.total++;

    if (trade.success || trade.status === 'filled') {
      this.metrics.trades.successful++;
    } else {
      this.metrics.trades.failed++;
    }

    // 更新 Prometheus 指标 / Update Prometheus metrics
    if (this.promMetrics.tradesTotal) {
      this.promMetrics.tradesTotal.inc({
        status: trade.success ? 'success' : 'failed',
      });
    }

    // 发出交易记录事件 / Emit trade recorded event
    this.emit('tradeRecorded', trade);
  }

  /**
   * 记录订单
   * Record order
   * @param {Object} order - 订单信息 / Order information
   */
  recordOrder(order) {
    this.metrics.orders.total++;

    switch (order.status) {
      case 'filled':
        this.metrics.orders.filled++;
        break;
      case 'cancelled':
        this.metrics.orders.cancelled++;
        break;
      case 'pending':
      case 'open':
        this.metrics.orders.pending++;
        break;
    }

    // 更新 Prometheus 指标 / Update Prometheus metrics
    if (this.promMetrics.ordersTotal) {
      this.promMetrics.ordersTotal.inc({
        status: order.status,
      });
    }
  }

  /**
   * 更新盈亏
   * Update PnL
   * @param {Object} pnl - 盈亏信息 / PnL information
   */
  updatePnL(pnl) {
    this.metrics.pnl.realized = pnl.realized || this.metrics.pnl.realized;
    this.metrics.pnl.unrealized = pnl.unrealized || this.metrics.pnl.unrealized;
    this.metrics.pnl.total = this.metrics.pnl.realized + this.metrics.pnl.unrealized;

    // 更新 Prometheus 指标 / Update Prometheus metrics
    if (this.promMetrics.pnlGauge) {
      this.promMetrics.pnlGauge.set({ type: 'realized' }, this.metrics.pnl.realized);
      this.promMetrics.pnlGauge.set({ type: 'unrealized' }, this.metrics.pnl.unrealized);
      this.promMetrics.pnlGauge.set({ type: 'total' }, this.metrics.pnl.total);
    }
  }

  /**
   * 记录错误
   * Record error
   * @param {Error} error - 错误对象 / Error object
   */
  recordError(error) {
    this.metrics.errors++;

    // 更新 Prometheus 指标 / Update Prometheus metrics
    if (this.promMetrics.errorsTotal) {
      this.promMetrics.errorsTotal.inc();
    }

    // 发出错误记录事件 / Emit error recorded event
    this.emit('errorRecorded', error);
  }

  /**
   * 获取监控指标
   * Get monitoring metrics
   * @returns {Object} 监控指标 / Monitoring metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime,
      health: this.health,
    };
  }

  /**
   * 获取 Prometheus 指标
   * Get Prometheus metrics
   * @returns {Promise<string>} Prometheus 格式的指标 / Prometheus formatted metrics
   */
  async getPrometheusMetrics() {
    if (!this.config.enablePrometheus) {
      return '';
    }
    return promClient.register.metrics();
  }

  /**
   * 注册健康检查
   * Register health check
   * @param {string} name - 检查名称 / Check name
   * @param {Function} checkFn - 检查函数 / Check function
   */
  registerHealthCheck(name, checkFn) {
    this.health.checks[name] = {
      fn: checkFn,
      status: 'unknown',
      lastCheck: null,
      error: null,
    };
  }

  // ============================================
  // 私有方法 / Private Methods
  // ============================================

  /**
   * 初始化 Prometheus 指标
   * Initialize Prometheus metrics
   * @private
   */
  _initPrometheusMetrics() {
    // 收集默认指标 / Collect default metrics
    promClient.collectDefaultMetrics({
      prefix: 'quant_trading_',
    });

    // 交易计数器 / Trade counter
    this.promMetrics.tradesTotal = new promClient.Counter({
      name: 'quant_trading_trades_total',
      help: '交易总数 / Total trades',
      labelNames: ['status'],
    });

    // 订单计数器 / Order counter
    this.promMetrics.ordersTotal = new promClient.Counter({
      name: 'quant_trading_orders_total',
      help: '订单总数 / Total orders',
      labelNames: ['status'],
    });

    // 盈亏指标 / PnL gauge
    this.promMetrics.pnlGauge = new promClient.Gauge({
      name: 'quant_trading_pnl',
      help: '盈亏 / Profit and Loss',
      labelNames: ['type'],
    });

    // 错误计数器 / Error counter
    this.promMetrics.errorsTotal = new promClient.Counter({
      name: 'quant_trading_errors_total',
      help: '错误总数 / Total errors',
    });

    // 内存使用指标 / Memory usage gauge
    this.promMetrics.memoryUsage = new promClient.Gauge({
      name: 'quant_trading_memory_usage_bytes',
      help: '内存使用 / Memory usage in bytes',
      labelNames: ['type'],
    });

    // 运行时间指标 / Uptime gauge
    this.promMetrics.uptime = new promClient.Gauge({
      name: 'quant_trading_uptime_seconds',
      help: '运行时间 / Uptime in seconds',
    });

    console.log('[Monitor] Prometheus 指标已初始化 / Prometheus metrics initialized');
  }

  /**
   * 启动指标收集
   * Start metrics collection
   * @private
   */
  _startMetricsCollection() {
    // 立即收集一次 / Collect immediately
    this._collectMetrics();

    // 定时收集 / Collect periodically
    this.collectTimer = setInterval(() => {
      this._collectMetrics();
    }, this.config.collectInterval);
  }

  /**
   * 收集指标
   * Collect metrics
   * @private
   */
  _collectMetrics() {
    // 收集内存使用 / Collect memory usage
    const memUsage = process.memoryUsage();
    this.metrics.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),  // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),  // MB
      rss: Math.round(memUsage.rss / 1024 / 1024),  // MB
      external: Math.round(memUsage.external / 1024 / 1024),  // MB
    };

    // 更新 Prometheus 内存指标 / Update Prometheus memory metrics
    if (this.promMetrics.memoryUsage) {
      this.promMetrics.memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
      this.promMetrics.memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
      this.promMetrics.memoryUsage.set({ type: 'rss' }, memUsage.rss);
    }

    // 更新运行时间指标 / Update uptime metric
    if (this.promMetrics.uptime) {
      this.promMetrics.uptime.set((Date.now() - this.metrics.startTime) / 1000);
    }

    // 更新最后更新时间 / Update last update time
    this.metrics.lastUpdate = Date.now();

    // 检查内存警告 / Check memory warning
    if (this.metrics.memory.heapUsed > this.config.memoryWarningThreshold) {
      this.emit('warning', {
        type: 'memory',
        message: `内存使用过高 / High memory usage: ${this.metrics.memory.heapUsed}MB`,
        value: this.metrics.memory.heapUsed,
      });
    }

    // 发出指标收集事件 / Emit metrics collected event
    this.emit('metricsCollected', this.metrics);
  }

  /**
   * 启动健康检查
   * Start health checks
   * @private
   */
  _startHealthChecks() {
    // 立即检查一次 / Check immediately
    this._runHealthChecks();

    // 定时检查 / Check periodically
    this.healthCheckTimer = setInterval(() => {
      this._runHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * 运行健康检查
   * Run health checks
   * @private
   */
  async _runHealthChecks() {
    let allHealthy = true;

    // 运行所有注册的健康检查 / Run all registered health checks
    for (const [name, check] of Object.entries(this.health.checks)) {
      try {
        // 运行检查 / Run check
        const result = await check.fn();

        // 更新检查状态 / Update check status
        check.status = result ? 'healthy' : 'unhealthy';
        check.lastCheck = Date.now();
        check.error = null;

        if (!result) {
          allHealthy = false;
        }
      } catch (error) {
        // 检查失败 / Check failed
        check.status = 'unhealthy';
        check.lastCheck = Date.now();
        check.error = error.message;
        allHealthy = false;
      }
    }

    // 更新整体健康状态 / Update overall health status
    this.health.status = allHealthy ? 'healthy' : 'unhealthy';
    this.health.lastCheck = Date.now();

    // 发出健康检查事件 / Emit health check event
    this.emit('healthChecked', this.health);

    // 如果不健康，发出警告 / If unhealthy, emit warning
    if (!allHealthy) {
      this.emit('warning', {
        type: 'health',
        message: '系统健康检查失败 / System health check failed',
        checks: this.health.checks,
      });
    }
  }
}

// 导出默认类 / Export default class
export default SystemMonitor;
