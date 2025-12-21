/**
 * 指标收集器
 * Metrics Collector
 *
 * 专门用于交易系统的指标收集
 * Specialized metrics collection for trading systems
 *
 * @module src/monitoring/MetricsCollector
 */

import { EventEmitter } from 'events';

/**
 * 指标类型
 */
const MetricType = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  SUMMARY: 'summary',
};

/**
 * 指标收集器类
 * Metrics Collector Class
 */
class MetricsCollector extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // 指标前缀
      prefix: config.prefix || 'trading',
      // 默认标签
      defaultLabels: config.defaultLabels || {},
      // 直方图桶边界
      histogramBuckets: config.histogramBuckets || [
        0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
      ],
      // 摘要分位数
      summaryQuantiles: config.summaryQuantiles || [0.5, 0.9, 0.95, 0.99],
      // 最大标签值数量
      maxLabelValues: config.maxLabelValues || 100,
    };

    // 注册的指标
    this.metrics = new Map();

    // 预定义交易指标
    this._registerDefaultMetrics();
  }

  /**
   * 注册默认交易指标
   * @private
   */
  _registerDefaultMetrics() {
    // 订单指标
    this.registerCounter('orders_total', '总订单数', ['exchange', 'symbol', 'side', 'type', 'status']);
    this.registerHistogram('order_latency_seconds', '订单延迟', ['exchange', 'symbol', 'type']);
    this.registerGauge('orders_open', '当前未完成订单数', ['exchange']);

    // 交易指标
    this.registerCounter('trades_total', '总交易数', ['exchange', 'symbol', 'side']);
    this.registerCounter('trade_volume_total', '总交易量', ['exchange', 'symbol']);
    this.registerHistogram('trade_size', '交易大小', ['exchange', 'symbol']);

    // 持仓指标
    this.registerGauge('positions_open', '持仓数量', ['exchange', 'symbol', 'side']);
    this.registerGauge('position_value', '持仓价值', ['exchange', 'symbol']);
    this.registerGauge('unrealized_pnl', '未实现盈亏', ['exchange', 'symbol']);

    // 盈亏指标
    this.registerCounter('realized_pnl_total', '已实现盈亏', ['exchange', 'strategy']);
    this.registerCounter('fees_total', '总手续费', ['exchange', 'currency']);

    // 策略指标
    this.registerCounter('signals_total', '信号总数', ['strategy', 'type']);
    this.registerHistogram('signal_latency_seconds', '信号延迟', ['strategy']);
    this.registerGauge('strategy_state', '策略状态', ['strategy']);

    // 交易所连接指标
    this.registerGauge('exchange_connected', '交易所连接状态', ['exchange']);
    this.registerCounter('exchange_errors_total', '交易所错误数', ['exchange', 'error_type']);
    this.registerHistogram('exchange_request_duration_seconds', '交易所请求时长', ['exchange', 'method']);

    // 系统指标
    this.registerGauge('system_uptime_seconds', '系统运行时间', []);
    this.registerGauge('websocket_connections', 'WebSocket连接数', ['exchange']);
    this.registerCounter('websocket_messages_total', 'WebSocket消息数', ['exchange', 'type']);
  }

  /**
   * 获取完整的指标名称
   * @private
   */
  _getFullName(name) {
    return this.config.prefix ? `${this.config.prefix}_${name}` : name;
  }

  /**
   * 生成标签键
   * @private
   */
  _getLabelKey(labels = {}) {
    const sortedKeys = Object.keys(labels).sort();
    return sortedKeys.map(k => `${k}:${labels[k]}`).join(',');
  }

  /**
   * 合并标签
   * @private
   */
  _mergeLabels(labels = {}) {
    return { ...this.config.defaultLabels, ...labels };
  }

  // ============================================
  // 注册指标 Register Metrics
  // ============================================

  /**
   * 注册计数器
   * @param {string} name - 指标名称
   * @param {string} help - 帮助描述
   * @param {Array} labelNames - 标签名称
   */
  registerCounter(name, help, labelNames = []) {
    const fullName = this._getFullName(name);

    if (this.metrics.has(fullName)) {
      return this.metrics.get(fullName);
    }

    const metric = {
      type: MetricType.COUNTER,
      name: fullName,
      help,
      labelNames,
      values: new Map(),
    };

    this.metrics.set(fullName, metric);
    return metric;
  }

  /**
   * 注册仪表
   * @param {string} name - 指标名称
   * @param {string} help - 帮助描述
   * @param {Array} labelNames - 标签名称
   */
  registerGauge(name, help, labelNames = []) {
    const fullName = this._getFullName(name);

    if (this.metrics.has(fullName)) {
      return this.metrics.get(fullName);
    }

    const metric = {
      type: MetricType.GAUGE,
      name: fullName,
      help,
      labelNames,
      values: new Map(),
    };

    this.metrics.set(fullName, metric);
    return metric;
  }

  /**
   * 注册直方图
   * @param {string} name - 指标名称
   * @param {string} help - 帮助描述
   * @param {Array} labelNames - 标签名称
   * @param {Array} buckets - 桶边界
   */
  registerHistogram(name, help, labelNames = [], buckets = null) {
    const fullName = this._getFullName(name);

    if (this.metrics.has(fullName)) {
      return this.metrics.get(fullName);
    }

    const metric = {
      type: MetricType.HISTOGRAM,
      name: fullName,
      help,
      labelNames,
      buckets: buckets || this.config.histogramBuckets,
      values: new Map(),
    };

    this.metrics.set(fullName, metric);
    return metric;
  }

  /**
   * 注册摘要
   * @param {string} name - 指标名称
   * @param {string} help - 帮助描述
   * @param {Array} labelNames - 标签名称
   * @param {Array} quantiles - 分位数
   */
  registerSummary(name, help, labelNames = [], quantiles = null) {
    const fullName = this._getFullName(name);

    if (this.metrics.has(fullName)) {
      return this.metrics.get(fullName);
    }

    const metric = {
      type: MetricType.SUMMARY,
      name: fullName,
      help,
      labelNames,
      quantiles: quantiles || this.config.summaryQuantiles,
      values: new Map(),
    };

    this.metrics.set(fullName, metric);
    return metric;
  }

  // ============================================
  // 操作指标 Operate Metrics
  // ============================================

  /**
   * 增加计数器
   * @param {string} name - 指标名称
   * @param {number} value - 值
   * @param {Object} labels - 标签
   */
  inc(name, value = 1, labels = {}) {
    const fullName = this._getFullName(name);
    const metric = this.metrics.get(fullName);

    if (!metric || metric.type !== MetricType.COUNTER) {
      throw new Error(`Counter not found: ${fullName}`);
    }

    const mergedLabels = this._mergeLabels(labels);
    const key = this._getLabelKey(mergedLabels);

    const current = metric.values.get(key) || { value: 0, labels: mergedLabels };
    current.value += value;
    current.timestamp = Date.now();
    metric.values.set(key, current);

    this.emit('metric', { name: fullName, type: 'inc', value, labels: mergedLabels });
  }

  /**
   * 设置仪表值
   * @param {string} name - 指标名称
   * @param {number} value - 值
   * @param {Object} labels - 标签
   */
  set(name, value, labels = {}) {
    const fullName = this._getFullName(name);
    const metric = this.metrics.get(fullName);

    if (!metric || metric.type !== MetricType.GAUGE) {
      throw new Error(`Gauge not found: ${fullName}`);
    }

    const mergedLabels = this._mergeLabels(labels);
    const key = this._getLabelKey(mergedLabels);

    metric.values.set(key, {
      value,
      labels: mergedLabels,
      timestamp: Date.now(),
    });

    this.emit('metric', { name: fullName, type: 'set', value, labels: mergedLabels });
  }

  /**
   * 观察直方图值
   * @param {string} name - 指标名称
   * @param {number} value - 值
   * @param {Object} labels - 标签
   */
  observe(name, value, labels = {}) {
    const fullName = this._getFullName(name);
    const metric = this.metrics.get(fullName);

    if (!metric || (metric.type !== MetricType.HISTOGRAM && metric.type !== MetricType.SUMMARY)) {
      throw new Error(`Histogram/Summary not found: ${fullName}`);
    }

    const mergedLabels = this._mergeLabels(labels);
    const key = this._getLabelKey(mergedLabels);

    let current = metric.values.get(key);
    if (!current) {
      current = {
        labels: mergedLabels,
        count: 0,
        sum: 0,
        values: [],
        buckets: metric.type === MetricType.HISTOGRAM ?
          metric.buckets.reduce((acc, b) => ({ ...acc, [b]: 0 }), { '+Inf': 0 }) :
          null,
      };
    }

    current.count++;
    current.sum += value;
    current.values.push(value);
    current.timestamp = Date.now();

    // 更新直方图桶
    if (metric.type === MetricType.HISTOGRAM) {
      for (const bucket of metric.buckets) {
        if (value <= bucket) {
          current.buckets[bucket]++;
        }
      }
      current.buckets['+Inf']++;
    }

    // 限制存储的值数量
    if (current.values.length > 10000) {
      current.values = current.values.slice(-5000);
    }

    metric.values.set(key, current);

    this.emit('metric', { name: fullName, type: 'observe', value, labels: mergedLabels });
  }

  /**
   * 计时辅助方法
   * @param {string} name - 指标名称
   * @param {Object} labels - 标签
   * @returns {Function} 停止计时函数
   */
  startTimer(name, labels = {}) {
    const start = process.hrtime.bigint();

    return () => {
      const end = process.hrtime.bigint();
      const durationSeconds = Number(end - start) / 1e9;
      this.observe(name, durationSeconds, labels);
      return durationSeconds;
    };
  }

  // ============================================
  // 交易便捷方法 Trading Convenience Methods
  // ============================================

  /**
   * 记录订单
   * @param {Object} order - 订单信息
   */
  recordOrder(order) {
    this.inc('orders_total', 1, {
      exchange: order.exchange,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      status: order.status,
    });
  }

  /**
   * 记录订单延迟
   * @param {string} exchange - 交易所
   * @param {string} symbol - 交易对
   * @param {string} type - 订单类型
   * @param {number} latencyMs - 延迟毫秒
   */
  recordOrderLatency(exchange, symbol, type, latencyMs) {
    this.observe('order_latency_seconds', latencyMs / 1000, {
      exchange,
      symbol,
      type,
    });
  }

  /**
   * 记录交易
   * @param {Object} trade - 交易信息
   */
  recordTrade(trade) {
    this.inc('trades_total', 1, {
      exchange: trade.exchange,
      symbol: trade.symbol,
      side: trade.side,
    });

    this.inc('trade_volume_total', trade.amount, {
      exchange: trade.exchange,
      symbol: trade.symbol,
    });

    this.observe('trade_size', trade.amount, {
      exchange: trade.exchange,
      symbol: trade.symbol,
    });

    if (trade.fee) {
      this.inc('fees_total', trade.fee, {
        exchange: trade.exchange,
        currency: trade.feeCurrency || 'USD',
      });
    }

    if (trade.realizedPnl) {
      this.inc('realized_pnl_total', trade.realizedPnl, {
        exchange: trade.exchange,
        strategy: trade.strategy || 'unknown',
      });
    }
  }

  /**
   * 更新持仓指标
   * @param {Object} position - 持仓信息
   */
  updatePosition(position) {
    this.set('positions_open', position.amount, {
      exchange: position.exchange,
      symbol: position.symbol,
      side: position.side,
    });

    this.set('position_value', position.value || position.amount * position.currentPrice, {
      exchange: position.exchange,
      symbol: position.symbol,
    });

    if (position.unrealizedPnl !== undefined) {
      this.set('unrealized_pnl', position.unrealizedPnl, {
        exchange: position.exchange,
        symbol: position.symbol,
      });
    }
  }

  /**
   * 记录信号
   * @param {Object} signal - 信号信息
   */
  recordSignal(signal) {
    this.inc('signals_total', 1, {
      strategy: signal.strategy,
      type: signal.type,
    });
  }

  /**
   * 记录交易所错误
   * @param {string} exchange - 交易所
   * @param {string} errorType - 错误类型
   */
  recordExchangeError(exchange, errorType) {
    this.inc('exchange_errors_total', 1, {
      exchange,
      error_type: errorType,
    });
  }

  /**
   * 记录交易所请求
   * @param {string} exchange - 交易所
   * @param {string} method - 方法
   * @param {number} durationMs - 持续时间毫秒
   */
  recordExchangeRequest(exchange, method, durationMs) {
    this.observe('exchange_request_duration_seconds', durationMs / 1000, {
      exchange,
      method,
    });
  }

  // ============================================
  // 获取指标 Get Metrics
  // ============================================

  /**
   * 获取指标值
   * @param {string} name - 指标名称
   * @param {Object} labels - 标签
   */
  getValue(name, labels = {}) {
    const fullName = this._getFullName(name);
    const metric = this.metrics.get(fullName);

    if (!metric) {
      return null;
    }

    const key = this._getLabelKey(this._mergeLabels(labels));
    const data = metric.values.get(key);

    if (!data) {
      return null;
    }

    if (metric.type === MetricType.COUNTER || metric.type === MetricType.GAUGE) {
      return data.value;
    }

    // 直方图/摘要返回统计信息
    return {
      count: data.count,
      sum: data.sum,
      mean: data.count > 0 ? data.sum / data.count : 0,
    };
  }

  /**
   * 获取所有指标
   */
  getAll() {
    const result = {};

    for (const [name, metric] of this.metrics) {
      result[name] = {
        type: metric.type,
        help: metric.help,
        values: [],
      };

      for (const [, data] of metric.values) {
        if (metric.type === MetricType.COUNTER || metric.type === MetricType.GAUGE) {
          result[name].values.push({
            labels: data.labels,
            value: data.value,
            timestamp: data.timestamp,
          });
        } else {
          result[name].values.push({
            labels: data.labels,
            count: data.count,
            sum: data.sum,
            mean: data.count > 0 ? data.sum / data.count : 0,
            timestamp: data.timestamp,
          });
        }
      }
    }

    return result;
  }

  /**
   * 获取直方图统计
   * @param {string} name - 指标名称
   * @param {Object} labels - 标签
   */
  getHistogramStats(name, labels = {}) {
    const fullName = this._getFullName(name);
    const metric = this.metrics.get(fullName);

    if (!metric || metric.type !== MetricType.HISTOGRAM) {
      return null;
    }

    const key = this._getLabelKey(this._mergeLabels(labels));
    const data = metric.values.get(key);

    if (!data || data.values.length === 0) {
      return null;
    }

    const sorted = [...data.values].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      count: data.count,
      sum: data.sum,
      mean: data.sum / data.count,
      min: sorted[0],
      max: sorted[count - 1],
      p50: sorted[Math.floor(count * 0.5)],
      p90: sorted[Math.floor(count * 0.9)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
      buckets: { ...data.buckets },
    };
  }

  /**
   * 导出为 Prometheus 格式
   */
  toPrometheus() {
    const lines = [];

    for (const [name, metric] of this.metrics) {
      // HELP 行
      lines.push(`# HELP ${name} ${metric.help}`);
      // TYPE 行
      lines.push(`# TYPE ${name} ${metric.type}`);

      for (const [, data] of metric.values) {
        const labelStr = Object.entries(data.labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        const labelPart = labelStr ? `{${labelStr}}` : '';

        if (metric.type === MetricType.COUNTER || metric.type === MetricType.GAUGE) {
          lines.push(`${name}${labelPart} ${data.value}`);
        } else if (metric.type === MetricType.HISTOGRAM) {
          // 桶
          for (const [bucket, count] of Object.entries(data.buckets)) {
            const bucketLabel = labelStr ? `${labelStr},le="${bucket}"` : `le="${bucket}"`;
            lines.push(`${name}_bucket{${bucketLabel}} ${count}`);
          }
          lines.push(`${name}_sum${labelPart} ${data.sum}`);
          lines.push(`${name}_count${labelPart} ${data.count}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 重置所有指标
   */
  reset() {
    for (const metric of this.metrics.values()) {
      metric.values.clear();
    }
    this.emit('reset');
  }

  /**
   * 重置特定指标
   * @param {string} name - 指标名称
   */
  resetMetric(name) {
    const fullName = this._getFullName(name);
    const metric = this.metrics.get(fullName);
    if (metric) {
      metric.values.clear();
    }
  }
}

export { MetricsCollector, MetricType };
export default MetricsCollector;
