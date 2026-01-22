/**
 * 指标收集器
 * Metrics Collector
 *
 * 专门用于交易系统的指标收集
 * Specialized metrics collection for trading systems
 *
 * @module src/monitoring/MetricsCollector
 */

import { EventEmitter } from 'events'; // 导入模块 events

/**
 * 指标类型
 */
const MetricType = { // 定义常量 MetricType
  COUNTER: 'counter', // 设置 COUNTER 字段
  GAUGE: 'gauge', // 设置 GAUGE 字段
  HISTOGRAM: 'histogram', // 设置 HISTOGRAM 字段
  SUMMARY: 'summary', // 设置 SUMMARY 字段
}; // 结束代码块

/**
 * 指标收集器类
 * Metrics Collector Class
 */
class MetricsCollector extends EventEmitter { // 定义类 MetricsCollector(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { // 设置 config
      // 指标前缀
      prefix: config.prefix || 'trading', // 设置 prefix 字段
      // 默认标签
      defaultLabels: config.defaultLabels || {}, // 设置 defaultLabels 字段
      // 直方图桶边界
      histogramBuckets: config.histogramBuckets || [ // 设置 histogramBuckets 字段
        0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, // 执行语句
      ], // 结束数组或索引
      // 摘要分位数
      summaryQuantiles: config.summaryQuantiles || [0.5, 0.9, 0.95, 0.99], // 设置 summaryQuantiles 字段
      // 最大标签值数量
      maxLabelValues: config.maxLabelValues || 100, // 设置 maxLabelValues 字段
    }; // 结束代码块

    // 注册的指标
    this.metrics = new Map(); // 设置 metrics

    // 预定义交易指标
    this._registerDefaultMetrics(); // 调用 _registerDefaultMetrics
  } // 结束代码块

  /**
   * 注册默认交易指标
   * @private
   */
  _registerDefaultMetrics() { // 调用 _registerDefaultMetrics
    // 订单指标
    this.registerCounter('orders_total', '总订单数', ['exchange', 'symbol', 'side', 'type', 'status']); // 调用 registerCounter
    this.registerHistogram('order_latency_seconds', '订单延迟', ['exchange', 'symbol', 'type']); // 调用 registerHistogram
    this.registerGauge('orders_open', '当前未完成订单数', ['exchange']); // 调用 registerGauge

    // 交易指标
    this.registerCounter('trades_total', '总交易数', ['exchange', 'symbol', 'side']); // 调用 registerCounter
    this.registerCounter('trade_volume_total', '总交易量', ['exchange', 'symbol']); // 调用 registerCounter
    this.registerHistogram('trade_size', '交易大小', ['exchange', 'symbol']); // 调用 registerHistogram

    // 持仓指标
    this.registerGauge('positions_open', '持仓数量', ['exchange', 'symbol', 'side']); // 调用 registerGauge
    this.registerGauge('position_value', '持仓价值', ['exchange', 'symbol']); // 调用 registerGauge
    this.registerGauge('unrealized_pnl', '未实现盈亏', ['exchange', 'symbol']); // 调用 registerGauge

    // 盈亏指标
    this.registerCounter('realized_pnl_total', '已实现盈亏', ['exchange', 'strategy']); // 调用 registerCounter
    this.registerCounter('fees_total', '总手续费', ['exchange', 'currency']); // 调用 registerCounter

    // 策略指标
    this.registerCounter('signals_total', '信号总数', ['strategy', 'type']); // 调用 registerCounter
    this.registerHistogram('signal_latency_seconds', '信号延迟', ['strategy']); // 调用 registerHistogram
    this.registerGauge('strategy_state', '策略状态', ['strategy']); // 调用 registerGauge

    // 交易所连接指标
    this.registerGauge('exchange_connected', '交易所连接状态', ['exchange']); // 调用 registerGauge
    this.registerCounter('exchange_errors_total', '交易所错误数', ['exchange', 'error_type']); // 调用 registerCounter
    this.registerHistogram('exchange_request_duration_seconds', '交易所请求时长', ['exchange', 'method']); // 调用 registerHistogram

    // 系统指标
    this.registerGauge('system_uptime_seconds', '系统运行时间', []); // 调用 registerGauge
    this.registerGauge('websocket_connections', 'WebSocket连接数', ['exchange']); // 调用 registerGauge
    this.registerCounter('websocket_messages_total', 'WebSocket消息数', ['exchange', 'type']); // 调用 registerCounter
  } // 结束代码块

  /**
   * 获取完整的指标名称
   * @private
   */
  _getFullName(name) { // 调用 _getFullName
    return this.config.prefix ? `${this.config.prefix}_${name}` : name; // 返回结果
  } // 结束代码块

  /**
   * 生成标签键
   * @private
   */
  _getLabelKey(labels = {}) { // 调用 _getLabelKey
    const sortedKeys = Object.keys(labels).sort(); // 定义常量 sortedKeys
    return sortedKeys.map(k => `${k}:${labels[k]}`).join(','); // 返回结果
  } // 结束代码块

  /**
   * 合并标签
   * @private
   */
  _mergeLabels(labels = {}) { // 调用 _mergeLabels
    return { ...this.config.defaultLabels, ...labels }; // 返回结果
  } // 结束代码块

  // ============================================
  // 注册指标 Register Metrics
  // ============================================

  /**
   * 注册计数器
   * @param {string} name - 指标名称
   * @param {string} help - 帮助描述
   * @param {Array} labelNames - 标签名称
   */
  registerCounter(name, help, labelNames = []) { // 调用 registerCounter
    const fullName = this._getFullName(name); // 定义常量 fullName

    if (this.metrics.has(fullName)) { // 条件判断 this.metrics.has(fullName)
      return this.metrics.get(fullName); // 返回结果
    } // 结束代码块

    const metric = { // 定义常量 metric
      type: MetricType.COUNTER, // 设置 type 字段
      name: fullName, // 设置 name 字段
      help, // 执行语句
      labelNames, // 执行语句
      values: new Map(), // 设置 values 字段
    }; // 结束代码块

    this.metrics.set(fullName, metric); // 访问 metrics
    return metric; // 返回结果
  } // 结束代码块

  /**
   * 注册仪表
   * @param {string} name - 指标名称
   * @param {string} help - 帮助描述
   * @param {Array} labelNames - 标签名称
   */
  registerGauge(name, help, labelNames = []) { // 调用 registerGauge
    const fullName = this._getFullName(name); // 定义常量 fullName

    if (this.metrics.has(fullName)) { // 条件判断 this.metrics.has(fullName)
      return this.metrics.get(fullName); // 返回结果
    } // 结束代码块

    const metric = { // 定义常量 metric
      type: MetricType.GAUGE, // 设置 type 字段
      name: fullName, // 设置 name 字段
      help, // 执行语句
      labelNames, // 执行语句
      values: new Map(), // 设置 values 字段
    }; // 结束代码块

    this.metrics.set(fullName, metric); // 访问 metrics
    return metric; // 返回结果
  } // 结束代码块

  /**
   * 注册直方图
   * @param {string} name - 指标名称
   * @param {string} help - 帮助描述
   * @param {Array} labelNames - 标签名称
   * @param {Array} buckets - 桶边界
   */
  registerHistogram(name, help, labelNames = [], buckets = null) { // 调用 registerHistogram
    const fullName = this._getFullName(name); // 定义常量 fullName

    if (this.metrics.has(fullName)) { // 条件判断 this.metrics.has(fullName)
      return this.metrics.get(fullName); // 返回结果
    } // 结束代码块

    const metric = { // 定义常量 metric
      type: MetricType.HISTOGRAM, // 设置 type 字段
      name: fullName, // 设置 name 字段
      help, // 执行语句
      labelNames, // 执行语句
      buckets: buckets || this.config.histogramBuckets, // 设置 buckets 字段
      values: new Map(), // 设置 values 字段
    }; // 结束代码块

    this.metrics.set(fullName, metric); // 访问 metrics
    return metric; // 返回结果
  } // 结束代码块

  /**
   * 注册摘要
   * @param {string} name - 指标名称
   * @param {string} help - 帮助描述
   * @param {Array} labelNames - 标签名称
   * @param {Array} quantiles - 分位数
   */
  registerSummary(name, help, labelNames = [], quantiles = null) { // 调用 registerSummary
    const fullName = this._getFullName(name); // 定义常量 fullName

    if (this.metrics.has(fullName)) { // 条件判断 this.metrics.has(fullName)
      return this.metrics.get(fullName); // 返回结果
    } // 结束代码块

    const metric = { // 定义常量 metric
      type: MetricType.SUMMARY, // 设置 type 字段
      name: fullName, // 设置 name 字段
      help, // 执行语句
      labelNames, // 执行语句
      quantiles: quantiles || this.config.summaryQuantiles, // 设置 quantiles 字段
      values: new Map(), // 设置 values 字段
    }; // 结束代码块

    this.metrics.set(fullName, metric); // 访问 metrics
    return metric; // 返回结果
  } // 结束代码块

  // ============================================
  // 操作指标 Operate Metrics
  // ============================================

  /**
   * 增加计数器
   * @param {string} name - 指标名称
   * @param {number} value - 值
   * @param {Object} labels - 标签
   */
  inc(name, value = 1, labels = {}) { // 调用 inc
    const fullName = this._getFullName(name); // 定义常量 fullName
    const metric = this.metrics.get(fullName); // 定义常量 metric

    if (!metric || metric.type !== MetricType.COUNTER) { // 条件判断 !metric || metric.type !== MetricType.COUNTER
      throw new Error(`Counter not found: ${fullName}`); // 抛出异常
    } // 结束代码块

    const mergedLabels = this._mergeLabels(labels); // 定义常量 mergedLabels
    const key = this._getLabelKey(mergedLabels); // 定义常量 key

    const current = metric.values.get(key) || { value: 0, labels: mergedLabels }; // 定义常量 current
    current.value += value; // 执行语句
    current.timestamp = Date.now(); // 赋值 current.timestamp
    metric.values.set(key, current); // 调用 metric.values.set

    this.emit('metric', { name: fullName, type: 'inc', value, labels: mergedLabels }); // 调用 emit
  } // 结束代码块

  /**
   * 设置仪表值
   * @param {string} name - 指标名称
   * @param {number} value - 值
   * @param {Object} labels - 标签
   */
  set(name, value, labels = {}) { // 调用 set
    const fullName = this._getFullName(name); // 定义常量 fullName
    const metric = this.metrics.get(fullName); // 定义常量 metric

    if (!metric || metric.type !== MetricType.GAUGE) { // 条件判断 !metric || metric.type !== MetricType.GAUGE
      throw new Error(`Gauge not found: ${fullName}`); // 抛出异常
    } // 结束代码块

    const mergedLabels = this._mergeLabels(labels); // 定义常量 mergedLabels
    const key = this._getLabelKey(mergedLabels); // 定义常量 key

    metric.values.set(key, { // 调用 metric.values.set
      value, // 执行语句
      labels: mergedLabels, // 设置 labels 字段
      timestamp: Date.now(), // 设置 timestamp 字段
    }); // 结束代码块

    this.emit('metric', { name: fullName, type: 'set', value, labels: mergedLabels }); // 调用 emit
  } // 结束代码块

  /**
   * 观察直方图值
   * @param {string} name - 指标名称
   * @param {number} value - 值
   * @param {Object} labels - 标签
   */
  observe(name, value, labels = {}) { // 调用 observe
    const fullName = this._getFullName(name); // 定义常量 fullName
    const metric = this.metrics.get(fullName); // 定义常量 metric

    if (!metric || (metric.type !== MetricType.HISTOGRAM && metric.type !== MetricType.SUMMARY)) { // 条件判断 !metric || (metric.type !== MetricType.HISTOG...
      throw new Error(`Histogram/Summary not found: ${fullName}`); // 抛出异常
    } // 结束代码块

    const mergedLabels = this._mergeLabels(labels); // 定义常量 mergedLabels
    const key = this._getLabelKey(mergedLabels); // 定义常量 key

    let current = metric.values.get(key); // 定义变量 current
    if (!current) { // 条件判断 !current
      current = { // 赋值 current
        labels: mergedLabels, // 设置 labels 字段
        count: 0, // 设置 count 字段
        sum: 0, // 设置 sum 字段
        values: [], // 设置 values 字段
        buckets: metric.type === MetricType.HISTOGRAM ? // 设置 buckets 字段
          metric.buckets.reduce((acc, b) => ({ ...acc, [b]: 0 }), { '+Inf': 0 }) : // 调用 metric.buckets.reduce
          null, // 执行语句
      }; // 结束代码块
    } // 结束代码块

    current.count++; // 执行语句
    current.sum += value; // 执行语句
    current.values.push(value); // 调用 current.values.push
    current.timestamp = Date.now(); // 赋值 current.timestamp

    // 更新直方图桶
    if (metric.type === MetricType.HISTOGRAM) { // 条件判断 metric.type === MetricType.HISTOGRAM
      for (const bucket of metric.buckets) { // 循环 const bucket of metric.buckets
        if (value <= bucket) { // 条件判断 value <= bucket
          current.buckets[bucket]++; // 执行语句
        } // 结束代码块
      } // 结束代码块
      current.buckets['+Inf']++; // 执行语句
    } // 结束代码块

    // 限制存储的值数量
    if (current.values.length > 10000) { // 条件判断 current.values.length > 10000
      current.values = current.values.slice(-5000); // 赋值 current.values
    } // 结束代码块

    metric.values.set(key, current); // 调用 metric.values.set

    this.emit('metric', { name: fullName, type: 'observe', value, labels: mergedLabels }); // 调用 emit
  } // 结束代码块

  /**
   * 计时辅助方法
   * @param {string} name - 指标名称
   * @param {Object} labels - 标签
   * @returns {Function} 停止计时函数
   */
  startTimer(name, labels = {}) { // 调用 startTimer
    const start = process.hrtime.bigint(); // 定义常量 start

    return () => { // 返回结果
      const end = process.hrtime.bigint(); // 定义常量 end
      const durationSeconds = Number(end - start) / 1e9; // 定义常量 durationSeconds
      this.observe(name, durationSeconds, labels); // 调用 observe
      return durationSeconds; // 返回结果
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 交易便捷方法 Trading Convenience Methods
  // ============================================

  /**
   * 记录订单
   * @param {Object} order - 订单信息
   */
  recordOrder(order) { // 调用 recordOrder
    this.inc('orders_total', 1, { // 调用 inc
      exchange: order.exchange, // 设置 exchange 字段
      symbol: order.symbol, // 设置 symbol 字段
      side: order.side, // 设置 side 字段
      type: order.type, // 设置 type 字段
      status: order.status, // 设置 status 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录订单延迟
   * @param {string} exchange - 交易所
   * @param {string} symbol - 交易对
   * @param {string} type - 订单类型
   * @param {number} latencyMs - 延迟毫秒
   */
  recordOrderLatency(exchange, symbol, type, latencyMs) { // 调用 recordOrderLatency
    this.observe('order_latency_seconds', latencyMs / 1000, { // 调用 observe
      exchange, // 执行语句
      symbol, // 执行语句
      type, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录交易
   * @param {Object} trade - 交易信息
   */
  recordTrade(trade) { // 调用 recordTrade
    this.inc('trades_total', 1, { // 调用 inc
      exchange: trade.exchange, // 设置 exchange 字段
      symbol: trade.symbol, // 设置 symbol 字段
      side: trade.side, // 设置 side 字段
    }); // 结束代码块

    this.inc('trade_volume_total', trade.amount, { // 调用 inc
      exchange: trade.exchange, // 设置 exchange 字段
      symbol: trade.symbol, // 设置 symbol 字段
    }); // 结束代码块

    this.observe('trade_size', trade.amount, { // 调用 observe
      exchange: trade.exchange, // 设置 exchange 字段
      symbol: trade.symbol, // 设置 symbol 字段
    }); // 结束代码块

    if (trade.fee) { // 条件判断 trade.fee
      this.inc('fees_total', trade.fee, { // 调用 inc
        exchange: trade.exchange, // 设置 exchange 字段
        currency: trade.feeCurrency || 'USD', // 设置 currency 字段
      }); // 结束代码块
    } // 结束代码块

    if (trade.realizedPnl) { // 条件判断 trade.realizedPnl
      this.inc('realized_pnl_total', trade.realizedPnl, { // 调用 inc
        exchange: trade.exchange, // 设置 exchange 字段
        strategy: trade.strategy || 'unknown', // 设置 strategy 字段
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 更新持仓指标
   * @param {Object} position - 持仓信息
   */
  updatePosition(position) { // 调用 updatePosition
    this.set('positions_open', position.amount, { // 调用 set
      exchange: position.exchange, // 设置 exchange 字段
      symbol: position.symbol, // 设置 symbol 字段
      side: position.side, // 设置 side 字段
    }); // 结束代码块

    this.set('position_value', position.value || position.amount * position.currentPrice, { // 调用 set
      exchange: position.exchange, // 设置 exchange 字段
      symbol: position.symbol, // 设置 symbol 字段
    }); // 结束代码块

    if (position.unrealizedPnl !== undefined) { // 条件判断 position.unrealizedPnl !== undefined
      this.set('unrealized_pnl', position.unrealizedPnl, { // 调用 set
        exchange: position.exchange, // 设置 exchange 字段
        symbol: position.symbol, // 设置 symbol 字段
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录信号
   * @param {Object} signal - 信号信息
   */
  recordSignal(signal) { // 调用 recordSignal
    this.inc('signals_total', 1, { // 调用 inc
      strategy: signal.strategy, // 设置 strategy 字段
      type: signal.type, // 设置 type 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录交易所错误
   * @param {string} exchange - 交易所
   * @param {string} errorType - 错误类型
   */
  recordExchangeError(exchange, errorType) { // 调用 recordExchangeError
    this.inc('exchange_errors_total', 1, { // 调用 inc
      exchange, // 执行语句
      error_type: errorType, // 设置 error_type 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录交易所请求
   * @param {string} exchange - 交易所
   * @param {string} method - 方法
   * @param {number} durationMs - 持续时间毫秒
   */
  recordExchangeRequest(exchange, method, durationMs) { // 调用 recordExchangeRequest
    this.observe('exchange_request_duration_seconds', durationMs / 1000, { // 调用 observe
      exchange, // 执行语句
      method, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 获取指标 Get Metrics
  // ============================================

  /**
   * 获取指标值
   * @param {string} name - 指标名称
   * @param {Object} labels - 标签
   */
  getValue(name, labels = {}) { // 调用 getValue
    const fullName = this._getFullName(name); // 定义常量 fullName
    const metric = this.metrics.get(fullName); // 定义常量 metric

    if (!metric) { // 条件判断 !metric
      return null; // 返回结果
    } // 结束代码块

    const key = this._getLabelKey(this._mergeLabels(labels)); // 定义常量 key
    const data = metric.values.get(key); // 定义常量 data

    if (!data) { // 条件判断 !data
      return null; // 返回结果
    } // 结束代码块

    if (metric.type === MetricType.COUNTER || metric.type === MetricType.GAUGE) { // 条件判断 metric.type === MetricType.COUNTER || metric....
      return data.value; // 返回结果
    } // 结束代码块

    // 直方图/摘要返回统计信息
    return { // 返回结果
      count: data.count, // 设置 count 字段
      sum: data.sum, // 设置 sum 字段
      mean: data.count > 0 ? data.sum / data.count : 0, // 设置 mean 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取所有指标
   */
  getAll() { // 调用 getAll
    const result = {}; // 定义常量 result

    for (const [name, metric] of this.metrics) { // 循环 const [name, metric] of this.metrics
      result[name] = { // 执行语句
        type: metric.type, // 设置 type 字段
        help: metric.help, // 设置 help 字段
        values: [], // 设置 values 字段
      }; // 结束代码块

      for (const [, data] of metric.values) { // 循环 const [, data] of metric.values
        if (metric.type === MetricType.COUNTER || metric.type === MetricType.GAUGE) { // 条件判断 metric.type === MetricType.COUNTER || metric....
          result[name].values.push({ // 执行语句
            labels: data.labels, // 设置 labels 字段
            value: data.value, // 设置 value 字段
            timestamp: data.timestamp, // 设置 timestamp 字段
          }); // 结束代码块
        } else { // 执行语句
          result[name].values.push({ // 执行语句
            labels: data.labels, // 设置 labels 字段
            count: data.count, // 设置 count 字段
            sum: data.sum, // 设置 sum 字段
            mean: data.count > 0 ? data.sum / data.count : 0, // 设置 mean 字段
            timestamp: data.timestamp, // 设置 timestamp 字段
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取直方图统计
   * @param {string} name - 指标名称
   * @param {Object} labels - 标签
   */
  getHistogramStats(name, labels = {}) { // 调用 getHistogramStats
    const fullName = this._getFullName(name); // 定义常量 fullName
    const metric = this.metrics.get(fullName); // 定义常量 metric

    if (!metric || metric.type !== MetricType.HISTOGRAM) { // 条件判断 !metric || metric.type !== MetricType.HISTOGRAM
      return null; // 返回结果
    } // 结束代码块

    const key = this._getLabelKey(this._mergeLabels(labels)); // 定义常量 key
    const data = metric.values.get(key); // 定义常量 data

    if (!data || data.values.length === 0) { // 条件判断 !data || data.values.length === 0
      return null; // 返回结果
    } // 结束代码块

    const sorted = [...data.values].sort((a, b) => a - b); // 定义函数 sorted
    const count = sorted.length; // 定义常量 count

    return { // 返回结果
      count: data.count, // 设置 count 字段
      sum: data.sum, // 设置 sum 字段
      mean: data.sum / data.count, // 设置 mean 字段
      min: sorted[0], // 设置 min 字段
      max: sorted[count - 1], // 设置 max 字段
      p50: sorted[Math.floor(count * 0.5)], // 设置 p50 字段
      p90: sorted[Math.floor(count * 0.9)], // 设置 p90 字段
      p95: sorted[Math.floor(count * 0.95)], // 设置 p95 字段
      p99: sorted[Math.floor(count * 0.99)], // 设置 p99 字段
      buckets: { ...data.buckets }, // 设置 buckets 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 导出为 Prometheus 格式
   */
  toPrometheus() { // 调用 toPrometheus
    const lines = []; // 定义常量 lines

    for (const [name, metric] of this.metrics) { // 循环 const [name, metric] of this.metrics
      // HELP 行
      lines.push(`# HELP ${name} ${metric.help}`); // 调用 lines.push
      // TYPE 行
      lines.push(`# TYPE ${name} ${metric.type}`); // 调用 lines.push

      for (const [, data] of metric.values) { // 循环 const [, data] of metric.values
        const labelStr = Object.entries(data.labels) // 定义常量 labelStr
          .map(([k, v]) => `${k}="${v}"`) // 定义箭头函数
          .join(','); // 执行语句
        const labelPart = labelStr ? `{${labelStr}}` : ''; // 定义常量 labelPart

        if (metric.type === MetricType.COUNTER || metric.type === MetricType.GAUGE) { // 条件判断 metric.type === MetricType.COUNTER || metric....
          lines.push(`${name}${labelPart} ${data.value}`); // 调用 lines.push
        } else if (metric.type === MetricType.HISTOGRAM) { // 执行语句
          // 桶
          for (const [bucket, count] of Object.entries(data.buckets)) { // 循环 const [bucket, count] of Object.entries(data....
            const bucketLabel = labelStr ? `${labelStr},le="${bucket}"` : `le="${bucket}"`; // 定义常量 bucketLabel
            lines.push(`${name}_bucket{${bucketLabel}} ${count}`); // 调用 lines.push
          } // 结束代码块
          lines.push(`${name}_sum${labelPart} ${data.sum}`); // 调用 lines.push
          lines.push(`${name}_count${labelPart} ${data.count}`); // 调用 lines.push
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return lines.join('\n'); // 返回结果
  } // 结束代码块

  /**
   * 重置所有指标
   */
  reset() { // 调用 reset
    for (const metric of this.metrics.values()) { // 循环 const metric of this.metrics.values()
      metric.values.clear(); // 调用 metric.values.clear
    } // 结束代码块
    this.emit('reset'); // 调用 emit
  } // 结束代码块

  /**
   * 重置特定指标
   * @param {string} name - 指标名称
   */
  resetMetric(name) { // 调用 resetMetric
    const fullName = this._getFullName(name); // 定义常量 fullName
    const metric = this.metrics.get(fullName); // 定义常量 metric
    if (metric) { // 条件判断 metric
      metric.values.clear(); // 调用 metric.values.clear
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

export { MetricsCollector, MetricType }; // 导出命名成员
export default MetricsCollector; // 默认导出
