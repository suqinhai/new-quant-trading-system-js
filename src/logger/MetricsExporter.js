/**
 * Grafana 指标导出器
 * Grafana Metrics Exporter
 *
 * 功能 / Features:
 * 1. 导出 Prometheus 格式指标 / Export Prometheus format metrics
 * 2. 支持 Grafana Loki 日志格式 / Support Grafana Loki log format
 * 3. HTTP 端点暴露指标 / HTTP endpoint for metrics exposure
 * 4. 自定义指标和标签 / Custom metrics and labels
 * 5. 实时数据推送支持 / Real-time data push support
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

// 导入 HTTP 模块 / Import HTTP module
import http from 'http'; // 导入模块 http

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 指标类型
 * Metric type
 */
const METRIC_TYPE = { // 定义常量 METRIC_TYPE
  GAUGE: 'gauge',           // 仪表盘 (瞬时值) / Gauge (instant value)
  COUNTER: 'counter',       // 计数器 (累加值) / Counter (cumulative value)
  HISTOGRAM: 'histogram',   // 直方图 / Histogram
  SUMMARY: 'summary',       // 摘要 / Summary
}; // 结束代码块

/**
 * 预定义指标
 * Predefined metrics
 */
const PREDEFINED_METRICS = { // 定义常量 PREDEFINED_METRICS
  // ============================================
  // 账户指标 / Account Metrics
  // ============================================

  // 账户权益 / Account equity
  ACCOUNT_EQUITY: { // 账户EQUITY
    name: 'trading_account_equity', // name
    help: '账户权益 (USDT) / Account equity in USDT', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange'], // labels
  }, // 结束代码块

  // 可用余额 / Available balance
  ACCOUNT_AVAILABLE: { // 账户AVAILABLE
    name: 'trading_account_available', // name
    help: '可用余额 (USDT) / Available balance in USDT', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange'], // labels
  }, // 结束代码块

  // 已用保证金 / Used margin
  ACCOUNT_USED_MARGIN: { // 账户USED保证金
    name: 'trading_account_used_margin', // name
    help: '已用保证金 (USDT) / Used margin in USDT', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange'], // labels
  }, // 结束代码块

  // 保证金率 / Margin rate
  MARGIN_RATE: { // 保证金频率
    name: 'trading_margin_rate', // name
    help: '保证金率 / Margin rate ratio', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange'], // labels
  }, // 结束代码块

  // ============================================
  // 盈亏指标 / PnL Metrics
  // ============================================

  // 已实现盈亏 / Realized PnL
  REALIZED_PNL: { // 已实现盈亏
    name: 'trading_realized_pnl', // name
    help: '已实现盈亏 (USDT) / Realized PnL in USDT', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange', 'symbol'], // labels
  }, // 结束代码块

  // 未实现盈亏 / Unrealized PnL
  UNREALIZED_PNL: { // 未实现盈亏
    name: 'trading_unrealized_pnl', // name
    help: '未实现盈亏 (USDT) / Unrealized PnL in USDT', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange', 'symbol'], // labels
  }, // 结束代码块

  // 每日盈亏 / Daily PnL
  DAILY_PNL: { // 每日盈亏
    name: 'trading_daily_pnl', // name
    help: '每日盈亏 (USDT) / Daily PnL in USDT', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: [], // labels
  }, // 结束代码块

  // 每日回撤 / Daily drawdown
  DAILY_DRAWDOWN: { // 每日回撤
    name: 'trading_daily_drawdown', // name
    help: '每日回撤比例 / Daily drawdown ratio', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: [], // labels
  }, // 结束代码块

  // ============================================
  // 持仓指标 / Position Metrics
  // ============================================

  // 持仓数量 / Position count
  POSITION_COUNT: { // 持仓数量
    name: 'trading_position_count', // name
    help: '持仓数量 / Number of positions', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange', 'side'], // labels
  }, // 结束代码块

  // 持仓价值 / Position value
  POSITION_VALUE: { // 持仓VALUE
    name: 'trading_position_value', // name
    help: '持仓价值 (USDT) / Position value in USDT', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange', 'symbol', 'side'], // labels
  }, // 结束代码块

  // 持仓杠杆 / Position leverage
  POSITION_LEVERAGE: { // 持仓杠杆
    name: 'trading_position_leverage', // name
    help: '持仓杠杆倍数 / Position leverage', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange', 'symbol'], // labels
  }, // 结束代码块

  // ============================================
  // 交易指标 / Trade Metrics
  // ============================================

  // 交易总数 / Total trades
  TRADES_TOTAL: { // 成交总
    name: 'trading_trades_total', // name
    help: '交易总数 / Total number of trades', // help
    type: METRIC_TYPE.COUNTER, // 类型
    labels: ['exchange', 'symbol', 'side'], // labels
  }, // 结束代码块

  // 交易量 / Trade volume
  TRADE_VOLUME: { // 交易成交量
    name: 'trading_trade_volume', // name
    help: '交易量 (USDT) / Trade volume in USDT', // help
    type: METRIC_TYPE.COUNTER, // 类型
    labels: ['exchange', 'symbol'], // labels
  }, // 结束代码块

  // 手续费 / Fees
  TRADE_FEES: { // 交易FEES
    name: 'trading_trade_fees', // name
    help: '手续费总额 (USDT) / Total fees in USDT', // help
    type: METRIC_TYPE.COUNTER, // 类型
    labels: ['exchange'], // labels
  }, // 结束代码块

  // ============================================
  // 订单指标 / Order Metrics
  // ============================================

  // 订单总数 / Total orders
  ORDERS_TOTAL: { // 订单总
    name: 'trading_orders_total', // name
    help: '订单总数 / Total number of orders', // help
    type: METRIC_TYPE.COUNTER, // 类型
    labels: ['exchange', 'status'], // labels
  }, // 结束代码块

  // 活跃订单数 / Active orders
  ORDERS_ACTIVE: { // 订单活跃
    name: 'trading_orders_active', // name
    help: '活跃订单数 / Number of active orders', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange'], // labels
  }, // 结束代码块

  // ============================================
  // 风控指标 / Risk Metrics
  // ============================================

  // 风险级别 / Risk level
  RISK_LEVEL: { // 风险级别
    name: 'trading_risk_level', // name
    help: '风险级别 (0=normal, 1=warning, 2=danger, 3=critical, 4=emergency)', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: [], // labels
  }, // 结束代码块

  // 警报计数 / Alert count
  ALERTS_TOTAL: { // 告警总
    name: 'trading_alerts_total', // name
    help: '警报总数 / Total number of alerts', // help
    type: METRIC_TYPE.COUNTER, // 类型
    labels: ['level', 'category'], // labels
  }, // 结束代码块

  // ============================================
  // 系统指标 / System Metrics
  // ============================================

  // 系统运行时间 / System uptime
  SYSTEM_UPTIME: { // 系统UPTIME
    name: 'trading_system_uptime_seconds', // name
    help: '系统运行时间 (秒) / System uptime in seconds', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: [], // labels
  }, // 结束代码块

  // 连接状态 / Connection status
  CONNECTION_STATUS: { // CONNECTION状态连接状态
    name: 'trading_connection_status', // name
    help: '连接状态 (1=connected, 0=disconnected)', // help
    type: METRIC_TYPE.GAUGE, // 类型
    labels: ['exchange'], // labels
  }, // 结束代码块
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // HTTP 服务器配置 / HTTP Server Configuration
  // ============================================

  // 是否启用 HTTP 端点 / Enable HTTP endpoint
  httpEnabled: true, // 是否启用 HTTP 端点

  // HTTP 端口 / HTTP port
  httpPort: 9090, // http端口

  // HTTP 主机 / HTTP host
  httpHost: '0.0.0.0', // http主机

  // 指标路径 / Metrics path
  metricsPath: '/metrics', // 指标路径

  // ============================================
  // 指标配置 / Metrics Configuration
  // ============================================

  // 指标前缀 / Metrics prefix
  metricsPrefix: '', // 指标前缀

  // 默认标签 / Default labels
  defaultLabels: { // 默认Labels
    app: 'quant-trading-system',  // 应用名称 / Application name
    env: 'production',             // 环境 / Environment
  }, // 结束代码块

  // 是否包含时间戳 / Include timestamp
  includeTimestamp: true, // include时间戳

  // ============================================
  // 数据收集配置 / Data Collection Configuration
  // ============================================

  // 数据收集间隔 (毫秒) / Data collection interval (ms)
  collectInterval: 5000,  // 5秒 / 5 seconds

  // 是否自动收集 / Auto collect
  autoCollect: true, // 自动Collect

  // ============================================
  // Loki 配置 / Loki Configuration
  // ============================================

  // 是否启用 Loki 推送 / Enable Loki push
  lokiEnabled: false, // 是否启用 Loki 推送

  // Loki 推送 URL / Loki push URL
  lokiUrl: 'http://localhost:3100/loki/api/v1/push', // Loki 推送 URL

  // Loki 推送间隔 (毫秒) / Loki push interval (ms)
  lokiPushInterval: 10000,  // 10秒 / 10 seconds

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志

  // 日志前缀 / Log prefix
  logPrefix: '[Metrics]', // 日志前缀
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * Grafana 指标导出器
 * Grafana Metrics Exporter
 */
export class MetricsExporter extends EventEmitter { // 导出类 MetricsExporter
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 指标存储 / Metrics storage
    // 格式: { metricName: { type, help, labels, values: Map } }
    // Format: { metricName: { type, help, labels, values: Map } }
    this.metrics = new Map(); // 设置 metrics

    // HTTP 服务器 / HTTP server
    this.server = null; // 设置 server

    // 数据源引用 / Data source references
    this.dataSources = { // 设置 dataSources
      riskManager: null,      // 风控管理器 / Risk manager
      positionManager: null,  // 仓位管理器 / Position manager
      executor: null,         // 订单执行器 / Order executor
      alertManager: null,     // 警报管理器 / Alert manager
    }; // 结束代码块

    // 收集定时器 / Collection timer
    this.collectTimer = null; // 设置 collectTimer

    // Loki 推送定时器 / Loki push timer
    this.lokiTimer = null; // 设置 lokiTimer

    // Loki 日志缓冲 / Loki log buffer
    this.lokiBuffer = []; // 设置 lokiBuffer

    // 系统启动时间 / System start time
    this.startTime = Date.now(); // 设置 startTime

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      collectCount: 0,      // 收集次数 / Collection count
      httpRequests: 0,      // HTTP 请求次数 / HTTP request count
      lokiPushCount: 0,     // Loki 推送次数 / Loki push count
      errors: 0,            // 错误次数 / Error count
    }; // 结束代码块

    // 是否正在运行 / Whether running
    this.running = false; // 设置 running

    // 初始化预定义指标 / Initialize predefined metrics
    this._initPredefinedMetrics(); // 调用 _initPredefinedMetrics
  } // 结束代码块

  // ============================================
  // 初始化和生命周期 / Initialization and Lifecycle
  // ============================================

  /**
   * 初始化预定义指标
   * Initialize predefined metrics
   * @private
   */
  _initPredefinedMetrics() { // 调用 _initPredefinedMetrics
    // 遍历预定义指标 / Iterate predefined metrics
    for (const [, metric] of Object.entries(PREDEFINED_METRICS)) { // 循环 const [, metric] of Object.entries(PREDEFINED...
      // 注册指标 / Register metric
      this.registerMetric(metric.name, { // 调用 registerMetric
        type: metric.type, // 类型
        help: metric.help, // help
        labels: metric.labels, // labels
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 设置数据源
   * Set data sources
   *
   * @param {Object} sources - 数据源对象 / Data sources object
   */
  setDataSources(sources) { // 调用 setDataSources
    // 设置风控管理器 / Set risk manager
    if (sources.riskManager) { // 条件判断 sources.riskManager
      this.dataSources.riskManager = sources.riskManager; // 访问 dataSources
    } // 结束代码块

    // 设置仓位管理器 / Set position manager
    if (sources.positionManager) { // 条件判断 sources.positionManager
      this.dataSources.positionManager = sources.positionManager; // 访问 dataSources
    } // 结束代码块

    // 设置订单执行器 / Set order executor
    if (sources.executor) { // 条件判断 sources.executor
      this.dataSources.executor = sources.executor; // 访问 dataSources
    } // 结束代码块

    // 设置警报管理器 / Set alert manager
    if (sources.alertManager) { // 条件判断 sources.alertManager
      this.dataSources.alertManager = sources.alertManager; // 访问 dataSources
    } // 结束代码块
  } // 结束代码块

  /**
   * 启动导出器
   * Start exporter
   */
  async start() { // 执行语句
    // 标记为运行中 / Mark as running
    this.running = true; // 设置 running

    // 启动 HTTP 服务器 / Start HTTP server
    if (this.config.httpEnabled) { // 条件判断 this.config.httpEnabled
      await this._startHttpServer(); // 等待异步结果
    } // 结束代码块

    // 启动数据收集 / Start data collection
    if (this.config.autoCollect) { // 条件判断 this.config.autoCollect
      this.collectTimer = setInterval( // 设置 collectTimer
        () => this._collectMetrics(), // 定义箭头函数
        this.config.collectInterval // 访问 config
      ); // 结束调用或参数
    } // 结束代码块

    // 启动 Loki 推送 / Start Loki push
    if (this.config.lokiEnabled) { // 条件判断 this.config.lokiEnabled
      this.lokiTimer = setInterval( // 设置 lokiTimer
        () => this._pushToLoki(), // 定义箭头函数
        this.config.lokiPushInterval // 访问 config
      ); // 结束调用或参数
    } // 结束代码块

    // 记录日志 / Log
    this.log('指标导出器已启动 / Metrics exporter started', 'info'); // 调用 log
    if (this.config.httpEnabled) { // 条件判断 this.config.httpEnabled
      this.log(`HTTP 端点: http://${this.config.httpHost}:${this.config.httpPort}${this.config.metricsPath}`, 'info'); // 调用 log
    } // 结束代码块

    // 发出启动事件 / Emit start event
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止导出器
   * Stop exporter
   */
  async stop() { // 执行语句
    // 标记为停止 / Mark as stopped
    this.running = false; // 设置 running

    // 停止收集定时器 / Stop collection timer
    if (this.collectTimer) { // 条件判断 this.collectTimer
      clearInterval(this.collectTimer); // 调用 clearInterval
      this.collectTimer = null; // 设置 collectTimer
    } // 结束代码块

    // 停止 Loki 定时器 / Stop Loki timer
    if (this.lokiTimer) { // 条件判断 this.lokiTimer
      clearInterval(this.lokiTimer); // 调用 clearInterval
      this.lokiTimer = null; // 设置 lokiTimer
    } // 结束代码块

    // 停止 HTTP 服务器 / Stop HTTP server
    if (this.server) { // 条件判断 this.server
      // 关闭超时时间 / Close timeout
      const closeTimeout = 5000; // 定义常量 closeTimeout

      await new Promise((resolve) => { // 等待异步结果
        // 设置超时强制关闭 / Set timeout for force close
        const timeout = setTimeout(() => { // 定义函数 timeout
          this.log('HTTP 服务器关闭超时，强制关闭 / HTTP server close timeout, forcing close', 'warn'); // 调用 log
          // 强制关闭所有连接 / Force close all connections
          if (this.server) { // 条件判断 this.server
            this.server.closeAllConnections?.(); // 访问 server
          } // 结束代码块
          resolve(); // 调用 resolve
        }, closeTimeout); // 执行语句

        // 尝试正常关闭 / Try graceful close
        this.server.close(() => { // 访问 server
          clearTimeout(timeout); // 调用 clearTimeout
          resolve(); // 调用 resolve
        }); // 结束代码块
      }); // 结束代码块
      this.server = null; // 设置 server
    } // 结束代码块

    // 记录日志 / Log
    this.log('指标导出器已停止 / Metrics exporter stopped', 'info'); // 调用 log

    // 发出停止事件 / Emit stop event
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // HTTP 服务器方法 / HTTP Server Methods
  // ============================================

  /**
   * 启动 HTTP 服务器
   * Start HTTP server
   * @private
   */
  async _startHttpServer() { // 执行语句
    // 最大重试次数 / Max retry attempts
    const maxRetries = 3; // 定义常量 maxRetries
    // 重试延迟 (毫秒) / Retry delay (ms)
    const retryDelay = 1000; // 定义常量 retryDelay

    for (let attempt = 1; attempt <= maxRetries; attempt++) { // 循环 let attempt = 1; attempt <= maxRetries; attem...
      try { // 尝试执行
        await this._tryStartHttpServer(); // 等待异步结果
        return; // 成功启动 / Successfully started
      } catch (error) { // 执行语句
        // 如果是端口占用错误且还有重试机会 / If port in use and can retry
        if (error.code === 'EADDRINUSE' && attempt < maxRetries) { // 条件判断 error.code === 'EADDRINUSE' && attempt < maxR...
          this.log(`端口 ${this.config.httpPort} 被占用，${retryDelay}ms 后重试 (${attempt}/${maxRetries}) / Port in use, retrying...`, 'warn'); // 调用 log
          await new Promise(resolve => setTimeout(resolve, retryDelay)); // 等待异步结果
        } else { // 执行语句
          throw error; // 抛出异常
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 尝试启动 HTTP 服务器
   * Try to start HTTP server
   * @private
   */
  async _tryStartHttpServer() { // 执行语句
    return new Promise((resolve, reject) => { // 返回结果
      // 创建 HTTP 服务器 / Create HTTP server
      this.server = http.createServer((req, res) => { // 设置 server
        // 处理请求 / Handle request
        this._handleHttpRequest(req, res); // 调用 _handleHttpRequest
      }); // 结束代码块

      // 设置地址重用选项，允许端口快速重用 / Set address reuse option
      // 这可以解决 TIME_WAIT 状态导致的端口占用问题 / This solves port occupation due to TIME_WAIT state
      this.server.on('listening', () => { // 访问 server
        // 记录日志 / Log
        this.log(`HTTP 服务器已启动，监听端口 ${this.config.httpPort}`, 'info'); // 调用 log
        resolve(); // 调用 resolve
      }); // 结束代码块

      // 错误处理 / Error handling
      this.server.on('error', (error) => { // 访问 server
        // 记录错误 / Log error
        this.log(`HTTP 服务器错误: ${error.message}`, 'error'); // 调用 log
        this.stats.errors++; // 访问 stats
        // 清理服务器引用 / Clean up server reference
        this.server = null; // 设置 server
        reject(error); // 调用 reject
      }); // 结束代码块

      // 监听端口 / Listen on port
      // 使用 exclusive: false 允许多个进程监听同一端口 (用于集群模式)
      // Using exclusive: false allows multiple processes to listen on the same port (for cluster mode)
      this.server.listen({ // 访问 server
        port: this.config.httpPort, // 端口
        host: this.config.httpHost, // 主机
        exclusive: false, // exclusive
      }); // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 处理 HTTP 请求
   * Handle HTTP request
   *
   * @param {Object} req - 请求对象 / Request object
   * @param {Object} res - 响应对象 / Response object
   * @private
   */
  _handleHttpRequest(req, res) { // 调用 _handleHttpRequest
    // 更新统计 / Update statistics
    this.stats.httpRequests++; // 访问 stats

    // 检查路径 / Check path
    if (req.url === this.config.metricsPath && req.method === 'GET') { // 条件判断 req.url === this.config.metricsPath && req.me...
      // 返回 Prometheus 格式指标 / Return Prometheus format metrics
      const metrics = this.exportPrometheus(); // 定义常量 metrics

      // 设置响应头 / Set response headers
      res.writeHead(200, { // 调用 res.writeHead
        'Content-Type': 'text/plain; charset=utf-8', // Content类型
        'Cache-Control': 'no-cache', // Cache控制
      }); // 结束代码块

      // 发送响应 / Send response
      res.end(metrics); // 调用 res.end

    } else if (req.url === '/health' && req.method === 'GET') { // 执行语句
      // 健康检查 / Health check
      res.writeHead(200, { 'Content-Type': 'application/json' }); // 调用 res.writeHead
      res.end(JSON.stringify({ status: 'ok', uptime: Date.now() - this.startTime })); // 调用 res.end

    } else { // 执行语句
      // 404 响应 / 404 response
      res.writeHead(404, { 'Content-Type': 'text/plain' }); // 调用 res.writeHead
      res.end('Not Found'); // 调用 res.end
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 指标注册方法 / Metric Registration Methods
  // ============================================

  /**
   * 注册指标
   * Register metric
   *
   * @param {string} name - 指标名称 / Metric name
   * @param {Object} options - 选项 / Options
   */
  registerMetric(name, options = {}) { // 调用 registerMetric
    // 添加前缀 / Add prefix
    const fullName = this.config.metricsPrefix + name; // 定义常量 fullName

    // 解构选项 / Destructure options
    const { // 解构赋值
      type = METRIC_TYPE.GAUGE,   // 类型 / Type
      help = '',                   // 帮助文本 / Help text
      labels = [],                 // 标签列表 / Labels list
    } = options; // 执行语句

    // 创建指标对象 / Create metric object
    this.metrics.set(fullName, { // 访问 metrics
      // 指标名称 / Metric name
      name: fullName, // name

      // 指标类型 / Metric type
      type, // 执行语句

      // 帮助文本 / Help text
      help, // 执行语句

      // 标签列表 / Labels list
      labels, // 执行语句

      // 值存储 / Values storage
      // 格式: Map<labelKey, { value, timestamp }>
      // Format: Map<labelKey, { value, timestamp }>
      values: new Map(), // Format: Map<labelKey, { value, timestamp }>
    }); // 结束代码块
  } // 结束代码块

  /**
   * 设置指标值
   * Set metric value
   *
   * @param {string} name - 指标名称 / Metric name
   * @param {number} value - 值 / Value
   * @param {Object} labels - 标签 / Labels
   */
  setMetric(name, value, labels = {}) { // 调用 setMetric
    // 添加前缀 / Add prefix
    const fullName = this.config.metricsPrefix + name; // 定义常量 fullName

    // 获取指标 / Get metric
    const metric = this.metrics.get(fullName); // 定义常量 metric

    // 如果指标不存在，自动注册 / If metric doesn't exist, auto register
    if (!metric) { // 条件判断 !metric
      this.registerMetric(name, { labels: Object.keys(labels) }); // 调用 registerMetric
      return this.setMetric(name, value, labels); // 返回结果
    } // 结束代码块

    // 生成标签键 / Generate label key
    const labelKey = this._generateLabelKey(labels); // 定义常量 labelKey

    // 设置值 / Set value
    metric.values.set(labelKey, { // 调用 metric.values.set
      value, // 执行语句
      labels, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块
  } // 结束代码块

  /**
   * 增加计数器
   * Increment counter
   *
   * @param {string} name - 指标名称 / Metric name
   * @param {number} increment - 增量 / Increment
   * @param {Object} labels - 标签 / Labels
   */
  incrementCounter(name, increment = 1, labels = {}) { // 调用 incrementCounter
    // 添加前缀 / Add prefix
    const fullName = this.config.metricsPrefix + name; // 定义常量 fullName

    // 获取指标 / Get metric
    const metric = this.metrics.get(fullName); // 定义常量 metric

    // 如果指标不存在，自动注册 / If metric doesn't exist, auto register
    if (!metric) { // 条件判断 !metric
      this.registerMetric(name, { type: METRIC_TYPE.COUNTER, labels: Object.keys(labels) }); // 调用 registerMetric
      return this.incrementCounter(name, increment, labels); // 返回结果
    } // 结束代码块

    // 生成标签键 / Generate label key
    const labelKey = this._generateLabelKey(labels); // 定义常量 labelKey

    // 获取当前值 / Get current value
    const current = metric.values.get(labelKey); // 定义常量 current
    const currentValue = current ? current.value : 0; // 定义常量 currentValue

    // 设置新值 / Set new value
    metric.values.set(labelKey, { // 调用 metric.values.set
      value: currentValue + increment, // value
      labels, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块
  } // 结束代码块

  /**
   * 生成标签键
   * Generate label key
   *
   * @param {Object} labels - 标签 / Labels
   * @returns {string} 标签键 / Label key
   * @private
   */
  _generateLabelKey(labels) { // 调用 _generateLabelKey
    // 如果没有标签 / If no labels
    if (!labels || Object.keys(labels).length === 0) { // 条件判断 !labels || Object.keys(labels).length === 0
      return ''; // 返回结果
    } // 结束代码块

    // 排序标签键并生成字符串 / Sort label keys and generate string
    const sortedKeys = Object.keys(labels).sort(); // 定义常量 sortedKeys
    return sortedKeys.map(k => `${k}="${labels[k]}"`).join(','); // 返回结果
  } // 结束代码块

  // ============================================
  // 数据收集方法 / Data Collection Methods
  // ============================================

  /**
   * 收集指标数据
   * Collect metrics data
   * @private
   */
  async _collectMetrics() { // 执行语句
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) { // 条件判断 !this.running
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 收集系统指标 / Collect system metrics
      this._collectSystemMetrics(); // 调用 _collectSystemMetrics

      // 收集账户指标 / Collect account metrics
      await this._collectAccountMetrics(); // 等待异步结果

      // 收集持仓指标 / Collect position metrics
      this._collectPositionMetrics(); // 调用 _collectPositionMetrics

      // 收集风控指标 / Collect risk metrics
      this._collectRiskMetrics(); // 调用 _collectRiskMetrics

      // 收集订单指标 / Collect order metrics
      this._collectOrderMetrics(); // 调用 _collectOrderMetrics

      // 更新统计 / Update statistics
      this.stats.collectCount++; // 访问 stats

      // 发出收集完成事件 / Emit collection complete event
      this.emit('collected'); // 调用 emit

    } catch (error) { // 执行语句
      // 记录错误 / Log error
      this.log(`收集指标失败: ${error.message} / Failed to collect metrics`, 'error'); // 调用 log
      this.stats.errors++; // 访问 stats
    } // 结束代码块
  } // 结束代码块

  /**
   * 收集系统指标
   * Collect system metrics
   * @private
   */
  _collectSystemMetrics() { // 调用 _collectSystemMetrics
    // 设置系统运行时间 / Set system uptime
    const uptime = Math.floor((Date.now() - this.startTime) / 1000); // 定义常量 uptime
    this.setMetric(PREDEFINED_METRICS.SYSTEM_UPTIME.name, uptime); // 调用 setMetric
  } // 结束代码块

  /**
   * 收集账户指标
   * Collect account metrics
   * @private
   */
  async _collectAccountMetrics() { // 执行语句
    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.dataSources.riskManager) { // 条件判断 !this.dataSources.riskManager
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 获取风控状态 / Get risk status
      const status = this.dataSources.riskManager.getStatus(); // 定义常量 status

      // 遍历账户数据 / Iterate account data
      if (status.accounts && status.accounts.length > 0) { // 条件判断 status.accounts && status.accounts.length > 0
        for (const account of status.accounts) { // 循环 const account of status.accounts
          const labels = { exchange: account.exchange }; // 定义常量 labels

          // 设置权益 / Set equity
          this.setMetric(PREDEFINED_METRICS.ACCOUNT_EQUITY.name, account.equity || 0, labels); // 调用 setMetric

          // 设置可用余额 / Set available balance
          this.setMetric(PREDEFINED_METRICS.ACCOUNT_AVAILABLE.name, account.available || 0, labels); // 调用 setMetric

          // 设置已用保证金 / Set used margin
          this.setMetric(PREDEFINED_METRICS.ACCOUNT_USED_MARGIN.name, account.usedMargin || 0, labels); // 调用 setMetric

          // 计算并设置保证金率 / Calculate and set margin rate
          const marginRate = account.usedMargin > 0 // 定义常量 marginRate
            ? account.equity / account.usedMargin // 执行语句
            : 0; // 执行语句
          this.setMetric(PREDEFINED_METRICS.MARGIN_RATE.name, marginRate, labels); // 调用 setMetric
        } // 结束代码块
      } // 结束代码块

      // 设置每日回撤 / Set daily drawdown
      if (status.dailyEquity) { // 条件判断 status.dailyEquity
        this.setMetric(PREDEFINED_METRICS.DAILY_DRAWDOWN.name, status.dailyEquity.currentDrawdown || 0); // 调用 setMetric

        // 设置每日盈亏 / Set daily PnL
        const dailyPnl = (status.dailyEquity.peakEquity || 0) - (status.dailyEquity.startEquity || 0); // 定义常量 dailyPnl
        this.setMetric(PREDEFINED_METRICS.DAILY_PNL.name, dailyPnl); // 调用 setMetric
      } // 结束代码块

    } catch (error) { // 执行语句
      this.log(`收集账户指标失败: ${error.message}`, 'error'); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 收集持仓指标
   * Collect position metrics
   * @private
   */
  _collectPositionMetrics() { // 调用 _collectPositionMetrics
    // 如果没有仓位管理器，跳过 / If no position manager, skip
    if (!this.dataSources.positionManager) { // 条件判断 !this.dataSources.positionManager
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 获取活跃仓位 / Get active positions
      const positions = this.dataSources.positionManager.getActivePositions // 定义常量 positions
        ? this.dataSources.positionManager.getActivePositions() // 执行语句
        : []; // 执行语句

      // 按交易所和方向统计 / Count by exchange and side
      const counts = {}; // 定义常量 counts

      // 遍历仓位 / Iterate positions
      for (const pos of positions) { // 循环 const pos of positions
        const exchange = pos.exchange || 'unknown'; // 定义常量 exchange
        const side = pos.side || 'unknown'; // 定义常量 side
        const key = `${exchange}:${side}`; // 定义常量 key

        // 统计数量 / Count
        counts[key] = (counts[key] || 0) + 1; // 执行语句

        // 设置持仓价值 / Set position value
        const posValue = Math.abs(pos.notional || (pos.contracts || 0) * (pos.markPrice || 0)); // 定义常量 posValue
        this.setMetric(PREDEFINED_METRICS.POSITION_VALUE.name, posValue, { // 调用 setMetric
          exchange, // 执行语句
          symbol: pos.symbol, // 交易对
          side, // 执行语句
        }); // 结束代码块

        // 设置未实现盈亏 / Set unrealized PnL
        this.setMetric(PREDEFINED_METRICS.UNREALIZED_PNL.name, pos.unrealizedPnl || 0, { // 调用 setMetric
          exchange, // 执行语句
          symbol: pos.symbol, // 交易对
        }); // 结束代码块

        // 设置杠杆 / Set leverage
        if (pos.leverage) { // 条件判断 pos.leverage
          this.setMetric(PREDEFINED_METRICS.POSITION_LEVERAGE.name, pos.leverage, { // 调用 setMetric
            exchange, // 执行语句
            symbol: pos.symbol, // 交易对
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块

      // 设置持仓数量 / Set position counts
      for (const [key, count] of Object.entries(counts)) { // 循环 const [key, count] of Object.entries(counts)
        const [exchange, side] = key.split(':'); // 解构赋值
        this.setMetric(PREDEFINED_METRICS.POSITION_COUNT.name, count, { exchange, side }); // 调用 setMetric
      } // 结束代码块

    } catch (error) { // 执行语句
      this.log(`收集持仓指标失败: ${error.message}`, 'error'); // 调用 log
    } // 结束代码块
  } // 结束代码块

  /**
   * 收集风控指标
   * Collect risk metrics
   * @private
   */
  _collectRiskMetrics() { // 调用 _collectRiskMetrics
    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.dataSources.riskManager) { // 条件判断 !this.dataSources.riskManager
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 获取风控状态 / Get risk status
      const status = this.dataSources.riskManager.getStatus(); // 定义常量 status

      // 风险级别映射 / Risk level mapping
      const levelMap = { // 定义常量 levelMap
        'normal': 0, // normal
        'warning': 1, // 警告
        'danger': 2, // danger
        'critical': 3, // critical
        'emergency': 4, // emergency
      }; // 结束代码块

      // 设置风险级别 / Set risk level
      const riskLevel = levelMap[status.riskLevel] || 0; // 定义常量 riskLevel
      this.setMetric(PREDEFINED_METRICS.RISK_LEVEL.name, riskLevel); // 调用 setMetric

    } catch (error) { // 执行语句
      this.log(`收集风控指标失败: ${error.message}`, 'error'); // 调用 log
    } // 结束代码块

    // 如果有警报管理器 / If has alert manager
    if (this.dataSources.alertManager) { // 条件判断 this.dataSources.alertManager
      try { // 尝试执行
        const alertStats = this.dataSources.alertManager.getStats(); // 定义常量 alertStats

        // 按级别设置警报计数 / Set alert count by level
        if (alertStats.byLevel) { // 条件判断 alertStats.byLevel
          for (const [level, count] of Object.entries(alertStats.byLevel)) { // 循环 const [level, count] of Object.entries(alertS...
            this.setMetric(PREDEFINED_METRICS.ALERTS_TOTAL.name, count, { level, category: 'all' }); // 调用 setMetric
          } // 结束代码块
        } // 结束代码块

      } catch (error) { // 执行语句
        this.log(`收集警报指标失败: ${error.message}`, 'error'); // 调用 log
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 收集订单指标
   * Collect order metrics
   * @private
   */
  _collectOrderMetrics() { // 调用 _collectOrderMetrics
    // 如果没有执行器，跳过 / If no executor, skip
    if (!this.dataSources.executor) { // 条件判断 !this.dataSources.executor
      return; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 获取执行器统计 / Get executor statistics
      const stats = this.dataSources.executor.getStats(); // 定义常量 stats

      // 设置订单统计 / Set order statistics
      this.setMetric(PREDEFINED_METRICS.ORDERS_TOTAL.name, stats.totalOrders || 0, { exchange: 'all', status: 'total' }); // 调用 setMetric
      this.setMetric(PREDEFINED_METRICS.ORDERS_TOTAL.name, stats.filledOrders || 0, { exchange: 'all', status: 'filled' }); // 调用 setMetric
      this.setMetric(PREDEFINED_METRICS.ORDERS_TOTAL.name, stats.canceledOrders || 0, { exchange: 'all', status: 'canceled' }); // 调用 setMetric
      this.setMetric(PREDEFINED_METRICS.ORDERS_TOTAL.name, stats.failedOrders || 0, { exchange: 'all', status: 'failed' }); // 调用 setMetric

      // 设置活跃订单数 / Set active orders count
      this.setMetric(PREDEFINED_METRICS.ORDERS_ACTIVE.name, stats.activeOrders || 0, { exchange: 'all' }); // 调用 setMetric

    } catch (error) { // 执行语句
      this.log(`收集订单指标失败: ${error.message}`, 'error'); // 调用 log
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 导出方法 / Export Methods
  // ============================================

  /**
   * 导出 Prometheus 格式
   * Export Prometheus format
   *
   * @returns {string} Prometheus 格式文本 / Prometheus format text
   */
  exportPrometheus() { // 调用 exportPrometheus
    // 结果行 / Result lines
    const lines = []; // 定义常量 lines

    // 遍历所有指标 / Iterate all metrics
    for (const [, metric] of this.metrics) { // 循环 const [, metric] of this.metrics
      // 如果没有值，跳过 / If no values, skip
      if (metric.values.size === 0) { // 条件判断 metric.values.size === 0
        continue; // 继续下一轮循环
      } // 结束代码块

      // 添加帮助注释 / Add help comment
      if (metric.help) { // 条件判断 metric.help
        lines.push(`# HELP ${metric.name} ${metric.help}`); // 调用 lines.push
      } // 结束代码块

      // 添加类型注释 / Add type comment
      lines.push(`# TYPE ${metric.name} ${metric.type}`); // 调用 lines.push

      // 添加值 / Add values
      for (const [, valueInfo] of metric.values) { // 循环 const [, valueInfo] of metric.values
        // 构建标签字符串 / Build label string
        const allLabels = { ...this.config.defaultLabels, ...valueInfo.labels }; // 定义常量 allLabels
        const labelStr = Object.entries(allLabels) // 定义常量 labelStr
          .map(([k, v]) => `${k}="${v}"`) // 定义箭头函数
          .join(','); // 执行语句

        // 构建行 / Build line
        let line = metric.name; // 定义变量 line
        if (labelStr) { // 条件判断 labelStr
          line += `{${labelStr}}`; // 执行语句
        } // 结束代码块
        line += ` ${valueInfo.value}`; // 执行语句

        // 如果需要时间戳 / If timestamp needed
        if (this.config.includeTimestamp) { // 条件判断 this.config.includeTimestamp
          line += ` ${valueInfo.timestamp}`; // 执行语句
        } // 结束代码块

        // 添加到结果 / Add to result
        lines.push(line); // 调用 lines.push
      } // 结束代码块

      // 添加空行 / Add empty line
      lines.push(''); // 调用 lines.push
    } // 结束代码块

    // 返回结果 / Return result
    return lines.join('\n'); // 返回结果
  } // 结束代码块

  /**
   * 导出 JSON 格式
   * Export JSON format
   *
   * @returns {Object} JSON 对象 / JSON object
   */
  exportJson() { // 调用 exportJson
    // 结果对象 / Result object
    const result = { // 定义常量 result
      timestamp: Date.now(), // 时间戳
      metrics: {}, // 指标
    }; // 结束代码块

    // 遍历所有指标 / Iterate all metrics
    for (const [name, metric] of this.metrics) { // 循环 const [name, metric] of this.metrics
      // 获取所有值 / Get all values
      const values = []; // 定义常量 values
      for (const [, valueInfo] of metric.values) { // 循环 const [, valueInfo] of metric.values
        values.push({ // 调用 values.push
          value: valueInfo.value, // value
          labels: valueInfo.labels, // labels
          timestamp: valueInfo.timestamp, // 时间戳
        }); // 结束代码块
      } // 结束代码块

      // 添加到结果 / Add to result
      result.metrics[name] = { // 执行语句
        type: metric.type, // 类型
        help: metric.help, // help
        values, // 执行语句
      }; // 结束代码块
    } // 结束代码块

    // 返回结果 / Return result
    return result; // 返回结果
  } // 结束代码块

  // ============================================
  // Loki 推送方法 / Loki Push Methods
  // ============================================

  /**
   * 添加 Loki 日志
   * Add Loki log
   *
   * @param {string} message - 日志消息 / Log message
   * @param {Object} labels - 标签 / Labels
   */
  addLokiLog(message, labels = {}) { // 调用 addLokiLog
    // 如果 Loki 未启用，跳过 / If Loki not enabled, skip
    if (!this.config.lokiEnabled) { // 条件判断 !this.config.lokiEnabled
      return; // 返回结果
    } // 结束代码块

    // 添加到缓冲 / Add to buffer
    this.lokiBuffer.push({ // 访问 lokiBuffer
      // 时间戳 (纳秒) / Timestamp (nanoseconds)
      timestamp: Date.now() * 1000000, // 时间戳 (纳秒)

      // 日志消息 / Log message
      message, // 执行语句

      // 标签 / Labels
      labels: { ...this.config.defaultLabels, ...labels }, // labels
    }); // 结束代码块
  } // 结束代码块

  /**
   * 推送到 Loki
   * Push to Loki
   * @private
   */
  async _pushToLoki() { // 执行语句
    // 如果缓冲为空，跳过 / If buffer empty, skip
    if (this.lokiBuffer.length === 0) { // 条件判断 this.lokiBuffer.length === 0
      return; // 返回结果
    } // 结束代码块

    // 取出缓冲 / Get buffer
    const logs = [...this.lokiBuffer]; // 定义常量 logs
    this.lokiBuffer = []; // 设置 lokiBuffer

    // 按标签分组 / Group by labels
    const streams = new Map(); // 定义常量 streams

    for (const log of logs) { // 循环 const log of logs
      // 生成标签键 / Generate label key
      const labelKey = JSON.stringify(log.labels); // 定义常量 labelKey

      // 获取或创建流 / Get or create stream
      if (!streams.has(labelKey)) { // 条件判断 !streams.has(labelKey)
        streams.set(labelKey, { // 调用 streams.set
          stream: log.labels, // stream
          values: [], // values
        }); // 结束代码块
      } // 结束代码块

      // 添加日志 / Add log
      streams.get(labelKey).values.push([ // 调用 streams.get
        log.timestamp.toString(), // 调用 log.timestamp.toString
        log.message, // 执行语句
      ]); // 结束数组或索引
    } // 结束代码块

    // 构建 Loki 请求体 / Build Loki request body
    const body = { // 定义常量 body
      streams: Array.from(streams.values()), // streams
    }; // 结束代码块

    try { // 尝试执行
      // 发送请求 / Send request
      const response = await fetch(this.config.lokiUrl, { // 定义常量 response
        method: 'POST', // method
        headers: { // headers
          'Content-Type': 'application/json', // Content类型
        }, // 结束代码块
        body: JSON.stringify(body), // body
      }); // 结束代码块

      // 检查响应 / Check response
      if (!response.ok) { // 条件判断 !response.ok
        throw new Error(`Loki push failed: ${response.status}`); // 抛出异常
      } // 结束代码块

      // 更新统计 / Update statistics
      this.stats.lokiPushCount++; // 访问 stats

    } catch (error) { // 执行语句
      // 记录错误 / Log error
      this.log(`Loki 推送失败: ${error.message}`, 'error'); // 调用 log
      this.stats.errors++; // 访问 stats

      // 将日志放回缓冲 / Put logs back to buffer
      this.lokiBuffer.unshift(...logs); // 访问 lokiBuffer
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 查询方法 / Query Methods
  // ============================================

  /**
   * 获取指标值
   * Get metric value
   *
   * @param {string} name - 指标名称 / Metric name
   * @param {Object} labels - 标签 / Labels
   * @returns {number|null} 指标值 / Metric value
   */
  getMetric(name, labels = {}) { // 调用 getMetric
    // 添加前缀 / Add prefix
    const fullName = this.config.metricsPrefix + name; // 定义常量 fullName

    // 获取指标 / Get metric
    const metric = this.metrics.get(fullName); // 定义常量 metric
    if (!metric) { // 条件判断 !metric
      return null; // 返回结果
    } // 结束代码块

    // 生成标签键 / Generate label key
    const labelKey = this._generateLabelKey(labels); // 定义常量 labelKey

    // 获取值 / Get value
    const valueInfo = metric.values.get(labelKey); // 定义常量 valueInfo
    return valueInfo ? valueInfo.value : null; // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      // 统计数据 / Statistics
      ...this.stats, // 展开对象或数组

      // 指标数量 / Metrics count
      metricsCount: this.metrics.size, // 指标数量

      // 运行时间 / Uptime
      uptime: Date.now() - this.startTime, // uptime

      // 是否运行中 / Whether running
      running: this.running, // running

      // Loki 缓冲大小 / Loki buffer size
      lokiBufferSize: this.lokiBuffer.length, // Loki 缓冲大小
    }; // 结束代码块
  } // 结束代码块

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') { // 调用 log
    // 构建完整消息 / Build complete message
    const fullMessage = `${this.config.logPrefix} ${message}`; // 定义常量 fullMessage

    // 根据级别输出 / Output based on level
    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'info': // 分支 'info'
      default: // 默认
        if (this.config.verbose) { // 条件判断 this.config.verbose
          console.log(fullMessage); // 控制台输出
        } // 结束代码块
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export { // 导出命名成员
  METRIC_TYPE, // 执行语句
  PREDEFINED_METRICS, // 执行语句
  DEFAULT_CONFIG, // 执行语句
}; // 结束代码块

// 默认导出 / Default export
export default MetricsExporter; // 默认导出
