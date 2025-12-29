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
import http from 'http';

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 指标类型
 * Metric type
 */
const METRIC_TYPE = {
  GAUGE: 'gauge',           // 仪表盘 (瞬时值) / Gauge (instant value)
  COUNTER: 'counter',       // 计数器 (累加值) / Counter (cumulative value)
  HISTOGRAM: 'histogram',   // 直方图 / Histogram
  SUMMARY: 'summary',       // 摘要 / Summary
};

/**
 * 预定义指标
 * Predefined metrics
 */
const PREDEFINED_METRICS = {
  // ============================================
  // 账户指标 / Account Metrics
  // ============================================

  // 账户权益 / Account equity
  ACCOUNT_EQUITY: {
    name: 'trading_account_equity',
    help: '账户权益 (USDT) / Account equity in USDT',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange'],
  },

  // 可用余额 / Available balance
  ACCOUNT_AVAILABLE: {
    name: 'trading_account_available',
    help: '可用余额 (USDT) / Available balance in USDT',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange'],
  },

  // 已用保证金 / Used margin
  ACCOUNT_USED_MARGIN: {
    name: 'trading_account_used_margin',
    help: '已用保证金 (USDT) / Used margin in USDT',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange'],
  },

  // 保证金率 / Margin rate
  MARGIN_RATE: {
    name: 'trading_margin_rate',
    help: '保证金率 / Margin rate ratio',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange'],
  },

  // ============================================
  // 盈亏指标 / PnL Metrics
  // ============================================

  // 已实现盈亏 / Realized PnL
  REALIZED_PNL: {
    name: 'trading_realized_pnl',
    help: '已实现盈亏 (USDT) / Realized PnL in USDT',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange', 'symbol'],
  },

  // 未实现盈亏 / Unrealized PnL
  UNREALIZED_PNL: {
    name: 'trading_unrealized_pnl',
    help: '未实现盈亏 (USDT) / Unrealized PnL in USDT',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange', 'symbol'],
  },

  // 每日盈亏 / Daily PnL
  DAILY_PNL: {
    name: 'trading_daily_pnl',
    help: '每日盈亏 (USDT) / Daily PnL in USDT',
    type: METRIC_TYPE.GAUGE,
    labels: [],
  },

  // 每日回撤 / Daily drawdown
  DAILY_DRAWDOWN: {
    name: 'trading_daily_drawdown',
    help: '每日回撤比例 / Daily drawdown ratio',
    type: METRIC_TYPE.GAUGE,
    labels: [],
  },

  // ============================================
  // 持仓指标 / Position Metrics
  // ============================================

  // 持仓数量 / Position count
  POSITION_COUNT: {
    name: 'trading_position_count',
    help: '持仓数量 / Number of positions',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange', 'side'],
  },

  // 持仓价值 / Position value
  POSITION_VALUE: {
    name: 'trading_position_value',
    help: '持仓价值 (USDT) / Position value in USDT',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange', 'symbol', 'side'],
  },

  // 持仓杠杆 / Position leverage
  POSITION_LEVERAGE: {
    name: 'trading_position_leverage',
    help: '持仓杠杆倍数 / Position leverage',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange', 'symbol'],
  },

  // ============================================
  // 交易指标 / Trade Metrics
  // ============================================

  // 交易总数 / Total trades
  TRADES_TOTAL: {
    name: 'trading_trades_total',
    help: '交易总数 / Total number of trades',
    type: METRIC_TYPE.COUNTER,
    labels: ['exchange', 'symbol', 'side'],
  },

  // 交易量 / Trade volume
  TRADE_VOLUME: {
    name: 'trading_trade_volume',
    help: '交易量 (USDT) / Trade volume in USDT',
    type: METRIC_TYPE.COUNTER,
    labels: ['exchange', 'symbol'],
  },

  // 手续费 / Fees
  TRADE_FEES: {
    name: 'trading_trade_fees',
    help: '手续费总额 (USDT) / Total fees in USDT',
    type: METRIC_TYPE.COUNTER,
    labels: ['exchange'],
  },

  // ============================================
  // 订单指标 / Order Metrics
  // ============================================

  // 订单总数 / Total orders
  ORDERS_TOTAL: {
    name: 'trading_orders_total',
    help: '订单总数 / Total number of orders',
    type: METRIC_TYPE.COUNTER,
    labels: ['exchange', 'status'],
  },

  // 活跃订单数 / Active orders
  ORDERS_ACTIVE: {
    name: 'trading_orders_active',
    help: '活跃订单数 / Number of active orders',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange'],
  },

  // ============================================
  // 风控指标 / Risk Metrics
  // ============================================

  // 风险级别 / Risk level
  RISK_LEVEL: {
    name: 'trading_risk_level',
    help: '风险级别 (0=normal, 1=warning, 2=danger, 3=critical, 4=emergency)',
    type: METRIC_TYPE.GAUGE,
    labels: [],
  },

  // 警报计数 / Alert count
  ALERTS_TOTAL: {
    name: 'trading_alerts_total',
    help: '警报总数 / Total number of alerts',
    type: METRIC_TYPE.COUNTER,
    labels: ['level', 'category'],
  },

  // ============================================
  // 系统指标 / System Metrics
  // ============================================

  // 系统运行时间 / System uptime
  SYSTEM_UPTIME: {
    name: 'trading_system_uptime_seconds',
    help: '系统运行时间 (秒) / System uptime in seconds',
    type: METRIC_TYPE.GAUGE,
    labels: [],
  },

  // 连接状态 / Connection status
  CONNECTION_STATUS: {
    name: 'trading_connection_status',
    help: '连接状态 (1=connected, 0=disconnected)',
    type: METRIC_TYPE.GAUGE,
    labels: ['exchange'],
  },
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // HTTP 服务器配置 / HTTP Server Configuration
  // ============================================

  // 是否启用 HTTP 端点 / Enable HTTP endpoint
  httpEnabled: true,

  // HTTP 端口 / HTTP port
  httpPort: 9090,

  // HTTP 主机 / HTTP host
  httpHost: '0.0.0.0',

  // 指标路径 / Metrics path
  metricsPath: '/metrics',

  // ============================================
  // 指标配置 / Metrics Configuration
  // ============================================

  // 指标前缀 / Metrics prefix
  metricsPrefix: '',

  // 默认标签 / Default labels
  defaultLabels: {
    app: 'quant-trading-system',  // 应用名称 / Application name
    env: 'production',             // 环境 / Environment
  },

  // 是否包含时间戳 / Include timestamp
  includeTimestamp: true,

  // ============================================
  // 数据收集配置 / Data Collection Configuration
  // ============================================

  // 数据收集间隔 (毫秒) / Data collection interval (ms)
  collectInterval: 5000,  // 5秒 / 5 seconds

  // 是否自动收集 / Auto collect
  autoCollect: true,

  // ============================================
  // Loki 配置 / Loki Configuration
  // ============================================

  // 是否启用 Loki 推送 / Enable Loki push
  lokiEnabled: false,

  // Loki 推送 URL / Loki push URL
  lokiUrl: 'http://localhost:3100/loki/api/v1/push',

  // Loki 推送间隔 (毫秒) / Loki push interval (ms)
  lokiPushInterval: 10000,  // 10秒 / 10 seconds

  // ============================================
  // 日志配置 / Logging Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[Metrics]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * Grafana 指标导出器
 * Grafana Metrics Exporter
 */
export class MetricsExporter extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 指标存储 / Metrics storage
    // 格式: { metricName: { type, help, labels, values: Map } }
    // Format: { metricName: { type, help, labels, values: Map } }
    this.metrics = new Map();

    // HTTP 服务器 / HTTP server
    this.server = null;

    // 数据源引用 / Data source references
    this.dataSources = {
      riskManager: null,      // 风控管理器 / Risk manager
      positionManager: null,  // 仓位管理器 / Position manager
      executor: null,         // 订单执行器 / Order executor
      alertManager: null,     // 警报管理器 / Alert manager
    };

    // 收集定时器 / Collection timer
    this.collectTimer = null;

    // Loki 推送定时器 / Loki push timer
    this.lokiTimer = null;

    // Loki 日志缓冲 / Loki log buffer
    this.lokiBuffer = [];

    // 系统启动时间 / System start time
    this.startTime = Date.now();

    // 统计信息 / Statistics
    this.stats = {
      collectCount: 0,      // 收集次数 / Collection count
      httpRequests: 0,      // HTTP 请求次数 / HTTP request count
      lokiPushCount: 0,     // Loki 推送次数 / Loki push count
      errors: 0,            // 错误次数 / Error count
    };

    // 是否正在运行 / Whether running
    this.running = false;

    // 初始化预定义指标 / Initialize predefined metrics
    this._initPredefinedMetrics();
  }

  // ============================================
  // 初始化和生命周期 / Initialization and Lifecycle
  // ============================================

  /**
   * 初始化预定义指标
   * Initialize predefined metrics
   * @private
   */
  _initPredefinedMetrics() {
    // 遍历预定义指标 / Iterate predefined metrics
    for (const [, metric] of Object.entries(PREDEFINED_METRICS)) {
      // 注册指标 / Register metric
      this.registerMetric(metric.name, {
        type: metric.type,
        help: metric.help,
        labels: metric.labels,
      });
    }
  }

  /**
   * 设置数据源
   * Set data sources
   *
   * @param {Object} sources - 数据源对象 / Data sources object
   */
  setDataSources(sources) {
    // 设置风控管理器 / Set risk manager
    if (sources.riskManager) {
      this.dataSources.riskManager = sources.riskManager;
    }

    // 设置仓位管理器 / Set position manager
    if (sources.positionManager) {
      this.dataSources.positionManager = sources.positionManager;
    }

    // 设置订单执行器 / Set order executor
    if (sources.executor) {
      this.dataSources.executor = sources.executor;
    }

    // 设置警报管理器 / Set alert manager
    if (sources.alertManager) {
      this.dataSources.alertManager = sources.alertManager;
    }
  }

  /**
   * 启动导出器
   * Start exporter
   */
  async start() {
    // 标记为运行中 / Mark as running
    this.running = true;

    // 启动 HTTP 服务器 / Start HTTP server
    if (this.config.httpEnabled) {
      await this._startHttpServer();
    }

    // 启动数据收集 / Start data collection
    if (this.config.autoCollect) {
      this.collectTimer = setInterval(
        () => this._collectMetrics(),
        this.config.collectInterval
      );
    }

    // 启动 Loki 推送 / Start Loki push
    if (this.config.lokiEnabled) {
      this.lokiTimer = setInterval(
        () => this._pushToLoki(),
        this.config.lokiPushInterval
      );
    }

    // 记录日志 / Log
    this.log('指标导出器已启动 / Metrics exporter started', 'info');
    if (this.config.httpEnabled) {
      this.log(`HTTP 端点: http://${this.config.httpHost}:${this.config.httpPort}${this.config.metricsPath}`, 'info');
    }

    // 发出启动事件 / Emit start event
    this.emit('started');
  }

  /**
   * 停止导出器
   * Stop exporter
   */
  async stop() {
    // 标记为停止 / Mark as stopped
    this.running = false;

    // 停止收集定时器 / Stop collection timer
    if (this.collectTimer) {
      clearInterval(this.collectTimer);
      this.collectTimer = null;
    }

    // 停止 Loki 定时器 / Stop Loki timer
    if (this.lokiTimer) {
      clearInterval(this.lokiTimer);
      this.lokiTimer = null;
    }

    // 停止 HTTP 服务器 / Stop HTTP server
    if (this.server) {
      // 关闭超时时间 / Close timeout
      const closeTimeout = 5000;

      await new Promise((resolve) => {
        // 设置超时强制关闭 / Set timeout for force close
        const timeout = setTimeout(() => {
          this.log('HTTP 服务器关闭超时，强制关闭 / HTTP server close timeout, forcing close', 'warn');
          // 强制关闭所有连接 / Force close all connections
          if (this.server) {
            this.server.closeAllConnections?.();
          }
          resolve();
        }, closeTimeout);

        // 尝试正常关闭 / Try graceful close
        this.server.close(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
      this.server = null;
    }

    // 记录日志 / Log
    this.log('指标导出器已停止 / Metrics exporter stopped', 'info');

    // 发出停止事件 / Emit stop event
    this.emit('stopped');
  }

  // ============================================
  // HTTP 服务器方法 / HTTP Server Methods
  // ============================================

  /**
   * 启动 HTTP 服务器
   * Start HTTP server
   * @private
   */
  async _startHttpServer() {
    // 最大重试次数 / Max retry attempts
    const maxRetries = 3;
    // 重试延迟 (毫秒) / Retry delay (ms)
    const retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this._tryStartHttpServer();
        return; // 成功启动 / Successfully started
      } catch (error) {
        // 如果是端口占用错误且还有重试机会 / If port in use and can retry
        if (error.code === 'EADDRINUSE' && attempt < maxRetries) {
          this.log(`端口 ${this.config.httpPort} 被占用，${retryDelay}ms 后重试 (${attempt}/${maxRetries}) / Port in use, retrying...`, 'warn');
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * 尝试启动 HTTP 服务器
   * Try to start HTTP server
   * @private
   */
  async _tryStartHttpServer() {
    return new Promise((resolve, reject) => {
      // 创建 HTTP 服务器 / Create HTTP server
      this.server = http.createServer((req, res) => {
        // 处理请求 / Handle request
        this._handleHttpRequest(req, res);
      });

      // 设置地址重用选项，允许端口快速重用 / Set address reuse option
      // 这可以解决 TIME_WAIT 状态导致的端口占用问题 / This solves port occupation due to TIME_WAIT state
      this.server.on('listening', () => {
        // 记录日志 / Log
        this.log(`HTTP 服务器已启动，监听端口 ${this.config.httpPort}`, 'info');
        resolve();
      });

      // 错误处理 / Error handling
      this.server.on('error', (error) => {
        // 记录错误 / Log error
        this.log(`HTTP 服务器错误: ${error.message}`, 'error');
        this.stats.errors++;
        // 清理服务器引用 / Clean up server reference
        this.server = null;
        reject(error);
      });

      // 监听端口 / Listen on port
      // 使用 exclusive: false 允许多个进程监听同一端口 (用于集群模式)
      // Using exclusive: false allows multiple processes to listen on the same port (for cluster mode)
      this.server.listen({
        port: this.config.httpPort,
        host: this.config.httpHost,
        exclusive: false,
      });
    });
  }

  /**
   * 处理 HTTP 请求
   * Handle HTTP request
   *
   * @param {Object} req - 请求对象 / Request object
   * @param {Object} res - 响应对象 / Response object
   * @private
   */
  _handleHttpRequest(req, res) {
    // 更新统计 / Update statistics
    this.stats.httpRequests++;

    // 检查路径 / Check path
    if (req.url === this.config.metricsPath && req.method === 'GET') {
      // 返回 Prometheus 格式指标 / Return Prometheus format metrics
      const metrics = this.exportPrometheus();

      // 设置响应头 / Set response headers
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      });

      // 发送响应 / Send response
      res.end(metrics);

    } else if (req.url === '/health' && req.method === 'GET') {
      // 健康检查 / Health check
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: Date.now() - this.startTime }));

    } else {
      // 404 响应 / 404 response
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

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
  registerMetric(name, options = {}) {
    // 添加前缀 / Add prefix
    const fullName = this.config.metricsPrefix + name;

    // 解构选项 / Destructure options
    const {
      type = METRIC_TYPE.GAUGE,   // 类型 / Type
      help = '',                   // 帮助文本 / Help text
      labels = [],                 // 标签列表 / Labels list
    } = options;

    // 创建指标对象 / Create metric object
    this.metrics.set(fullName, {
      // 指标名称 / Metric name
      name: fullName,

      // 指标类型 / Metric type
      type,

      // 帮助文本 / Help text
      help,

      // 标签列表 / Labels list
      labels,

      // 值存储 / Values storage
      // 格式: Map<labelKey, { value, timestamp }>
      // Format: Map<labelKey, { value, timestamp }>
      values: new Map(),
    });
  }

  /**
   * 设置指标值
   * Set metric value
   *
   * @param {string} name - 指标名称 / Metric name
   * @param {number} value - 值 / Value
   * @param {Object} labels - 标签 / Labels
   */
  setMetric(name, value, labels = {}) {
    // 添加前缀 / Add prefix
    const fullName = this.config.metricsPrefix + name;

    // 获取指标 / Get metric
    const metric = this.metrics.get(fullName);

    // 如果指标不存在，自动注册 / If metric doesn't exist, auto register
    if (!metric) {
      this.registerMetric(name, { labels: Object.keys(labels) });
      return this.setMetric(name, value, labels);
    }

    // 生成标签键 / Generate label key
    const labelKey = this._generateLabelKey(labels);

    // 设置值 / Set value
    metric.values.set(labelKey, {
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * 增加计数器
   * Increment counter
   *
   * @param {string} name - 指标名称 / Metric name
   * @param {number} increment - 增量 / Increment
   * @param {Object} labels - 标签 / Labels
   */
  incrementCounter(name, increment = 1, labels = {}) {
    // 添加前缀 / Add prefix
    const fullName = this.config.metricsPrefix + name;

    // 获取指标 / Get metric
    const metric = this.metrics.get(fullName);

    // 如果指标不存在，自动注册 / If metric doesn't exist, auto register
    if (!metric) {
      this.registerMetric(name, { type: METRIC_TYPE.COUNTER, labels: Object.keys(labels) });
      return this.incrementCounter(name, increment, labels);
    }

    // 生成标签键 / Generate label key
    const labelKey = this._generateLabelKey(labels);

    // 获取当前值 / Get current value
    const current = metric.values.get(labelKey);
    const currentValue = current ? current.value : 0;

    // 设置新值 / Set new value
    metric.values.set(labelKey, {
      value: currentValue + increment,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * 生成标签键
   * Generate label key
   *
   * @param {Object} labels - 标签 / Labels
   * @returns {string} 标签键 / Label key
   * @private
   */
  _generateLabelKey(labels) {
    // 如果没有标签 / If no labels
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }

    // 排序标签键并生成字符串 / Sort label keys and generate string
    const sortedKeys = Object.keys(labels).sort();
    return sortedKeys.map(k => `${k}="${labels[k]}"`).join(',');
  }

  // ============================================
  // 数据收集方法 / Data Collection Methods
  // ============================================

  /**
   * 收集指标数据
   * Collect metrics data
   * @private
   */
  async _collectMetrics() {
    // 如果未运行，跳过 / If not running, skip
    if (!this.running) {
      return;
    }

    try {
      // 收集系统指标 / Collect system metrics
      this._collectSystemMetrics();

      // 收集账户指标 / Collect account metrics
      await this._collectAccountMetrics();

      // 收集持仓指标 / Collect position metrics
      this._collectPositionMetrics();

      // 收集风控指标 / Collect risk metrics
      this._collectRiskMetrics();

      // 收集订单指标 / Collect order metrics
      this._collectOrderMetrics();

      // 更新统计 / Update statistics
      this.stats.collectCount++;

      // 发出收集完成事件 / Emit collection complete event
      this.emit('collected');

    } catch (error) {
      // 记录错误 / Log error
      this.log(`收集指标失败: ${error.message} / Failed to collect metrics`, 'error');
      this.stats.errors++;
    }
  }

  /**
   * 收集系统指标
   * Collect system metrics
   * @private
   */
  _collectSystemMetrics() {
    // 设置系统运行时间 / Set system uptime
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    this.setMetric(PREDEFINED_METRICS.SYSTEM_UPTIME.name, uptime);
  }

  /**
   * 收集账户指标
   * Collect account metrics
   * @private
   */
  async _collectAccountMetrics() {
    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.dataSources.riskManager) {
      return;
    }

    try {
      // 获取风控状态 / Get risk status
      const status = this.dataSources.riskManager.getStatus();

      // 遍历账户数据 / Iterate account data
      if (status.accounts && status.accounts.length > 0) {
        for (const account of status.accounts) {
          const labels = { exchange: account.exchange };

          // 设置权益 / Set equity
          this.setMetric(PREDEFINED_METRICS.ACCOUNT_EQUITY.name, account.equity || 0, labels);

          // 设置可用余额 / Set available balance
          this.setMetric(PREDEFINED_METRICS.ACCOUNT_AVAILABLE.name, account.available || 0, labels);

          // 设置已用保证金 / Set used margin
          this.setMetric(PREDEFINED_METRICS.ACCOUNT_USED_MARGIN.name, account.usedMargin || 0, labels);

          // 计算并设置保证金率 / Calculate and set margin rate
          const marginRate = account.usedMargin > 0
            ? account.equity / account.usedMargin
            : 0;
          this.setMetric(PREDEFINED_METRICS.MARGIN_RATE.name, marginRate, labels);
        }
      }

      // 设置每日回撤 / Set daily drawdown
      if (status.dailyEquity) {
        this.setMetric(PREDEFINED_METRICS.DAILY_DRAWDOWN.name, status.dailyEquity.currentDrawdown || 0);

        // 设置每日盈亏 / Set daily PnL
        const dailyPnl = (status.dailyEquity.peakEquity || 0) - (status.dailyEquity.startEquity || 0);
        this.setMetric(PREDEFINED_METRICS.DAILY_PNL.name, dailyPnl);
      }

    } catch (error) {
      this.log(`收集账户指标失败: ${error.message}`, 'error');
    }
  }

  /**
   * 收集持仓指标
   * Collect position metrics
   * @private
   */
  _collectPositionMetrics() {
    // 如果没有仓位管理器，跳过 / If no position manager, skip
    if (!this.dataSources.positionManager) {
      return;
    }

    try {
      // 获取活跃仓位 / Get active positions
      const positions = this.dataSources.positionManager.getActivePositions
        ? this.dataSources.positionManager.getActivePositions()
        : [];

      // 按交易所和方向统计 / Count by exchange and side
      const counts = {};

      // 遍历仓位 / Iterate positions
      for (const pos of positions) {
        const exchange = pos.exchange || 'unknown';
        const side = pos.side || 'unknown';
        const key = `${exchange}:${side}`;

        // 统计数量 / Count
        counts[key] = (counts[key] || 0) + 1;

        // 设置持仓价值 / Set position value
        const posValue = Math.abs(pos.notional || (pos.contracts || 0) * (pos.markPrice || 0));
        this.setMetric(PREDEFINED_METRICS.POSITION_VALUE.name, posValue, {
          exchange,
          symbol: pos.symbol,
          side,
        });

        // 设置未实现盈亏 / Set unrealized PnL
        this.setMetric(PREDEFINED_METRICS.UNREALIZED_PNL.name, pos.unrealizedPnl || 0, {
          exchange,
          symbol: pos.symbol,
        });

        // 设置杠杆 / Set leverage
        if (pos.leverage) {
          this.setMetric(PREDEFINED_METRICS.POSITION_LEVERAGE.name, pos.leverage, {
            exchange,
            symbol: pos.symbol,
          });
        }
      }

      // 设置持仓数量 / Set position counts
      for (const [key, count] of Object.entries(counts)) {
        const [exchange, side] = key.split(':');
        this.setMetric(PREDEFINED_METRICS.POSITION_COUNT.name, count, { exchange, side });
      }

    } catch (error) {
      this.log(`收集持仓指标失败: ${error.message}`, 'error');
    }
  }

  /**
   * 收集风控指标
   * Collect risk metrics
   * @private
   */
  _collectRiskMetrics() {
    // 如果没有风控管理器，跳过 / If no risk manager, skip
    if (!this.dataSources.riskManager) {
      return;
    }

    try {
      // 获取风控状态 / Get risk status
      const status = this.dataSources.riskManager.getStatus();

      // 风险级别映射 / Risk level mapping
      const levelMap = {
        'normal': 0,
        'warning': 1,
        'danger': 2,
        'critical': 3,
        'emergency': 4,
      };

      // 设置风险级别 / Set risk level
      const riskLevel = levelMap[status.riskLevel] || 0;
      this.setMetric(PREDEFINED_METRICS.RISK_LEVEL.name, riskLevel);

    } catch (error) {
      this.log(`收集风控指标失败: ${error.message}`, 'error');
    }

    // 如果有警报管理器 / If has alert manager
    if (this.dataSources.alertManager) {
      try {
        const alertStats = this.dataSources.alertManager.getStats();

        // 按级别设置警报计数 / Set alert count by level
        if (alertStats.byLevel) {
          for (const [level, count] of Object.entries(alertStats.byLevel)) {
            this.setMetric(PREDEFINED_METRICS.ALERTS_TOTAL.name, count, { level, category: 'all' });
          }
        }

      } catch (error) {
        this.log(`收集警报指标失败: ${error.message}`, 'error');
      }
    }
  }

  /**
   * 收集订单指标
   * Collect order metrics
   * @private
   */
  _collectOrderMetrics() {
    // 如果没有执行器，跳过 / If no executor, skip
    if (!this.dataSources.executor) {
      return;
    }

    try {
      // 获取执行器统计 / Get executor statistics
      const stats = this.dataSources.executor.getStats();

      // 设置订单统计 / Set order statistics
      this.setMetric(PREDEFINED_METRICS.ORDERS_TOTAL.name, stats.totalOrders || 0, { exchange: 'all', status: 'total' });
      this.setMetric(PREDEFINED_METRICS.ORDERS_TOTAL.name, stats.filledOrders || 0, { exchange: 'all', status: 'filled' });
      this.setMetric(PREDEFINED_METRICS.ORDERS_TOTAL.name, stats.canceledOrders || 0, { exchange: 'all', status: 'canceled' });
      this.setMetric(PREDEFINED_METRICS.ORDERS_TOTAL.name, stats.failedOrders || 0, { exchange: 'all', status: 'failed' });

      // 设置活跃订单数 / Set active orders count
      this.setMetric(PREDEFINED_METRICS.ORDERS_ACTIVE.name, stats.activeOrders || 0, { exchange: 'all' });

    } catch (error) {
      this.log(`收集订单指标失败: ${error.message}`, 'error');
    }
  }

  // ============================================
  // 导出方法 / Export Methods
  // ============================================

  /**
   * 导出 Prometheus 格式
   * Export Prometheus format
   *
   * @returns {string} Prometheus 格式文本 / Prometheus format text
   */
  exportPrometheus() {
    // 结果行 / Result lines
    const lines = [];

    // 遍历所有指标 / Iterate all metrics
    for (const [, metric] of this.metrics) {
      // 如果没有值，跳过 / If no values, skip
      if (metric.values.size === 0) {
        continue;
      }

      // 添加帮助注释 / Add help comment
      if (metric.help) {
        lines.push(`# HELP ${metric.name} ${metric.help}`);
      }

      // 添加类型注释 / Add type comment
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      // 添加值 / Add values
      for (const [, valueInfo] of metric.values) {
        // 构建标签字符串 / Build label string
        const allLabels = { ...this.config.defaultLabels, ...valueInfo.labels };
        const labelStr = Object.entries(allLabels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');

        // 构建行 / Build line
        let line = metric.name;
        if (labelStr) {
          line += `{${labelStr}}`;
        }
        line += ` ${valueInfo.value}`;

        // 如果需要时间戳 / If timestamp needed
        if (this.config.includeTimestamp) {
          line += ` ${valueInfo.timestamp}`;
        }

        // 添加到结果 / Add to result
        lines.push(line);
      }

      // 添加空行 / Add empty line
      lines.push('');
    }

    // 返回结果 / Return result
    return lines.join('\n');
  }

  /**
   * 导出 JSON 格式
   * Export JSON format
   *
   * @returns {Object} JSON 对象 / JSON object
   */
  exportJson() {
    // 结果对象 / Result object
    const result = {
      timestamp: Date.now(),
      metrics: {},
    };

    // 遍历所有指标 / Iterate all metrics
    for (const [name, metric] of this.metrics) {
      // 获取所有值 / Get all values
      const values = [];
      for (const [, valueInfo] of metric.values) {
        values.push({
          value: valueInfo.value,
          labels: valueInfo.labels,
          timestamp: valueInfo.timestamp,
        });
      }

      // 添加到结果 / Add to result
      result.metrics[name] = {
        type: metric.type,
        help: metric.help,
        values,
      };
    }

    // 返回结果 / Return result
    return result;
  }

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
  addLokiLog(message, labels = {}) {
    // 如果 Loki 未启用，跳过 / If Loki not enabled, skip
    if (!this.config.lokiEnabled) {
      return;
    }

    // 添加到缓冲 / Add to buffer
    this.lokiBuffer.push({
      // 时间戳 (纳秒) / Timestamp (nanoseconds)
      timestamp: Date.now() * 1000000,

      // 日志消息 / Log message
      message,

      // 标签 / Labels
      labels: { ...this.config.defaultLabels, ...labels },
    });
  }

  /**
   * 推送到 Loki
   * Push to Loki
   * @private
   */
  async _pushToLoki() {
    // 如果缓冲为空，跳过 / If buffer empty, skip
    if (this.lokiBuffer.length === 0) {
      return;
    }

    // 取出缓冲 / Get buffer
    const logs = [...this.lokiBuffer];
    this.lokiBuffer = [];

    // 按标签分组 / Group by labels
    const streams = new Map();

    for (const log of logs) {
      // 生成标签键 / Generate label key
      const labelKey = JSON.stringify(log.labels);

      // 获取或创建流 / Get or create stream
      if (!streams.has(labelKey)) {
        streams.set(labelKey, {
          stream: log.labels,
          values: [],
        });
      }

      // 添加日志 / Add log
      streams.get(labelKey).values.push([
        log.timestamp.toString(),
        log.message,
      ]);
    }

    // 构建 Loki 请求体 / Build Loki request body
    const body = {
      streams: Array.from(streams.values()),
    };

    try {
      // 发送请求 / Send request
      const response = await fetch(this.config.lokiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      // 检查响应 / Check response
      if (!response.ok) {
        throw new Error(`Loki push failed: ${response.status}`);
      }

      // 更新统计 / Update statistics
      this.stats.lokiPushCount++;

    } catch (error) {
      // 记录错误 / Log error
      this.log(`Loki 推送失败: ${error.message}`, 'error');
      this.stats.errors++;

      // 将日志放回缓冲 / Put logs back to buffer
      this.lokiBuffer.unshift(...logs);
    }
  }

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
  getMetric(name, labels = {}) {
    // 添加前缀 / Add prefix
    const fullName = this.config.metricsPrefix + name;

    // 获取指标 / Get metric
    const metric = this.metrics.get(fullName);
    if (!metric) {
      return null;
    }

    // 生成标签键 / Generate label key
    const labelKey = this._generateLabelKey(labels);

    // 获取值 / Get value
    const valueInfo = metric.values.get(labelKey);
    return valueInfo ? valueInfo.value : null;
  }

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() {
    return {
      // 统计数据 / Statistics
      ...this.stats,

      // 指标数量 / Metrics count
      metricsCount: this.metrics.size,

      // 运行时间 / Uptime
      uptime: Date.now() - this.startTime,

      // 是否运行中 / Whether running
      running: this.running,

      // Loki 缓冲大小 / Loki buffer size
      lokiBufferSize: this.lokiBuffer.length,
    };
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    // 构建完整消息 / Build complete message
    const fullMessage = `${this.config.logPrefix} ${message}`;

    // 根据级别输出 / Output based on level
    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'info':
      default:
        if (this.config.verbose) {
          console.log(fullMessage);
        }
        break;
    }
  }
}

// ============================================
// 导出 / Exports
// ============================================

// 导出常量 / Export constants
export {
  METRIC_TYPE,
  PREDEFINED_METRICS,
  DEFAULT_CONFIG,
};

// 默认导出 / Default export
export default MetricsExporter;
