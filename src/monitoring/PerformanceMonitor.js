/**
 * 性能监控器
 * Performance Monitor
 *
 * 提供系统性能指标收集和分析功能
 * Provides system performance metrics collection and analysis
 *
 * @module src/monitoring/PerformanceMonitor
 */

import { EventEmitter } from 'events';
import os from 'os';
import v8 from 'v8';

/**
 * 性能监控器类
 * Performance Monitor Class
 */
class PerformanceMonitor extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // 采样间隔 (ms)
      sampleInterval: config.sampleInterval || 5000,
      // 保留的历史数据点数
      historySize: config.historySize || 1000,
      // 是否启用详细内存分析
      detailedMemory: config.detailedMemory ?? false,
      // 告警阈值
      thresholds: {
        memoryUsagePercent: config.thresholds?.memoryUsagePercent || 85,
        cpuUsagePercent: config.thresholds?.cpuUsagePercent || 80,
        eventLoopLagMs: config.thresholds?.eventLoopLagMs || 100,
        gcPauseMs: config.thresholds?.gcPauseMs || 100,
        ...config.thresholds,
      },
    };

    // 指标存储
    this.metrics = {
      // 操作计时器
      timers: new Map(),
      // 计数器
      counters: new Map(),
      // 直方图 (用于延迟分布)
      histograms: new Map(),
      // 仪表 (当前值)
      gauges: new Map(),
    };

    // 历史数据
    this.history = {
      memory: [],
      cpu: [],
      eventLoop: [],
      custom: new Map(),
    };

    // 系统信息
    this.systemInfo = this._getSystemInfo();

    // 采样定时器
    this.sampleTimer = null;

    // 事件循环监控
    this.eventLoopMonitor = null;
    this.lastEventLoopCheck = process.hrtime.bigint();

    // CPU 使用率跟踪
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = Date.now();

    // GC 监控 (如果可用)
    this.gcStats = {
      collections: 0,
      totalPauseMs: 0,
      lastPauseMs: 0,
    };

    // 启动时间
    this.startTime = Date.now();
  }

  /**
   * 获取系统信息
   * @private
   */
  _getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      hostname: os.hostname(),
    };
  }

  /**
   * 启动性能监控
   */
  start() {
    if (this.sampleTimer) {
      return;
    }

    // 初始采样
    this._collectSample();

    // 定时采样
    this.sampleTimer = setInterval(() => {
      this._collectSample();
    }, this.config.sampleInterval);

    // 事件循环延迟监控
    this._startEventLoopMonitor();

    this.emit('started');
  }

  /**
   * 停止性能监控
   */
  stop() {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }

    if (this.eventLoopMonitor) {
      clearImmediate(this.eventLoopMonitor);
      this.eventLoopMonitor = null;
    }

    this.emit('stopped');
  }

  /**
   * 启动事件循环监控
   * @private
   */
  _startEventLoopMonitor() {
    const check = () => {
      const now = process.hrtime.bigint();
      const lag = Number(now - this.lastEventLoopCheck) / 1e6 - this.config.sampleInterval;

      if (lag > 0) {
        this._addToHistory('eventLoop', {
          timestamp: Date.now(),
          lagMs: Math.max(0, lag),
        });

        // 检查阈值
        if (lag > this.config.thresholds.eventLoopLagMs) {
          this.emit('alert', {
            type: 'eventLoopLag',
            value: lag,
            threshold: this.config.thresholds.eventLoopLagMs,
            message: `Event loop lag ${lag.toFixed(2)}ms exceeds threshold`,
          });
        }
      }

      this.lastEventLoopCheck = now;
      this.eventLoopMonitor = setTimeout(check, this.config.sampleInterval);
    };

    this.lastEventLoopCheck = process.hrtime.bigint();
    this.eventLoopMonitor = setTimeout(check, this.config.sampleInterval);
  }

  /**
   * 收集样本
   * @private
   */
  _collectSample() {
    const timestamp = Date.now();

    // 内存指标
    const memoryMetrics = this._collectMemoryMetrics();
    this._addToHistory('memory', { timestamp, ...memoryMetrics });

    // CPU 指标
    const cpuMetrics = this._collectCpuMetrics();
    this._addToHistory('cpu', { timestamp, ...cpuMetrics });

    // 检查告警阈值
    this._checkThresholds(memoryMetrics, cpuMetrics);

    this.emit('sample', {
      timestamp,
      memory: memoryMetrics,
      cpu: cpuMetrics,
    });
  }

  /**
   * 收集内存指标
   * @private
   */
  _collectMemoryMetrics() {
    const memUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    const metrics = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers || 0,
      systemTotal: totalMemory,
      systemFree: freeMemory,
      systemUsed: totalMemory - freeMemory,
      heapUsedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      systemUsedPercent: ((totalMemory - freeMemory) / totalMemory) * 100,
    };

    // 详细 V8 堆统计
    if (this.config.detailedMemory) {
      const heapStats = v8.getHeapStatistics();
      metrics.v8 = {
        totalHeapSize: heapStats.total_heap_size,
        totalHeapSizeExecutable: heapStats.total_heap_size_executable,
        totalPhysicalSize: heapStats.total_physical_size,
        usedHeapSize: heapStats.used_heap_size,
        heapSizeLimit: heapStats.heap_size_limit,
        mallocedMemory: heapStats.malloced_memory,
        peakMallocedMemory: heapStats.peak_malloced_memory,
        numberOfNativeContexts: heapStats.number_of_native_contexts,
        numberOfDetachedContexts: heapStats.number_of_detached_contexts,
      };
    }

    return metrics;
  }

  /**
   * 收集 CPU 指标
   * @private
   */
  _collectCpuMetrics() {
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = Date.now();
    const elapsedMs = currentTime - this.lastCpuTime;

    // 计算 CPU 使用百分比
    const userPercent = (currentCpuUsage.user / 1000 / elapsedMs) * 100;
    const systemPercent = (currentCpuUsage.system / 1000 / elapsedMs) * 100;
    const totalPercent = userPercent + systemPercent;

    // 系统负载 (仅 Unix)
    let loadAverage = [0, 0, 0];
    try {
      loadAverage = os.loadavg();
    } catch {
      // Windows 不支持 loadavg
    }

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = currentTime;

    return {
      user: currentCpuUsage.user,
      system: currentCpuUsage.system,
      userPercent,
      systemPercent,
      totalPercent,
      loadAverage,
      cpuCount: os.cpus().length,
    };
  }

  /**
   * 检查告警阈值
   * @private
   */
  _checkThresholds(memoryMetrics, cpuMetrics) {
    // 内存使用率告警
    if (memoryMetrics.systemUsedPercent > this.config.thresholds.memoryUsagePercent) {
      this.emit('alert', {
        type: 'memoryUsage',
        value: memoryMetrics.systemUsedPercent,
        threshold: this.config.thresholds.memoryUsagePercent,
        message: `Memory usage ${memoryMetrics.systemUsedPercent.toFixed(1)}% exceeds threshold`,
      });
    }

    // CPU 使用率告警
    if (cpuMetrics.totalPercent > this.config.thresholds.cpuUsagePercent) {
      this.emit('alert', {
        type: 'cpuUsage',
        value: cpuMetrics.totalPercent,
        threshold: this.config.thresholds.cpuUsagePercent,
        message: `CPU usage ${cpuMetrics.totalPercent.toFixed(1)}% exceeds threshold`,
      });
    }
  }

  /**
   * 添加到历史记录
   * @private
   */
  _addToHistory(type, data) {
    const history = this.history[type];
    if (!history) return;

    history.push(data);

    // 限制历史大小
    while (history.length > this.config.historySize) {
      history.shift();
    }
  }

  // ============================================
  // 计时器 API Timers API
  // ============================================

  /**
   * 开始计时
   * @param {string} name - 计时器名称
   * @returns {Function} 停止计时的函数
   */
  startTimer(name) {
    const start = process.hrtime.bigint();

    return () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;
      this.recordTiming(name, durationMs);
      return durationMs;
    };
  }

  /**
   * 记录计时
   * @param {string} name - 名称
   * @param {number} durationMs - 持续时间 (ms)
   */
  recordTiming(name, durationMs) {
    if (!this.metrics.histograms.has(name)) {
      this.metrics.histograms.set(name, {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        values: [],
      });
    }

    const histogram = this.metrics.histograms.get(name);
    histogram.count++;
    histogram.sum += durationMs;
    histogram.min = Math.min(histogram.min, durationMs);
    histogram.max = Math.max(histogram.max, durationMs);
    histogram.values.push(durationMs);

    // 限制存储的值数量
    if (histogram.values.length > 10000) {
      histogram.values = histogram.values.slice(-5000);
    }
  }

  /**
   * 异步操作计时装饰器
   * @param {string} name - 名称
   * @param {Function} fn - 异步函数
   */
  async timeAsync(name, fn) {
    const stop = this.startTimer(name);
    try {
      return await fn();
    } finally {
      stop();
    }
  }

  /**
   * 同步操作计时装饰器
   * @param {string} name - 名称
   * @param {Function} fn - 同步函数
   */
  timeSync(name, fn) {
    const stop = this.startTimer(name);
    try {
      return fn();
    } finally {
      stop();
    }
  }

  // ============================================
  // 计数器 API Counters API
  // ============================================

  /**
   * 增加计数器
   * @param {string} name - 计数器名称
   * @param {number} value - 增加值
   */
  increment(name, value = 1) {
    const current = this.metrics.counters.get(name) || 0;
    this.metrics.counters.set(name, current + value);
  }

  /**
   * 减少计数器
   * @param {string} name - 计数器名称
   * @param {number} value - 减少值
   */
  decrement(name, value = 1) {
    this.increment(name, -value);
  }

  /**
   * 获取计数器值
   * @param {string} name - 计数器名称
   */
  getCounter(name) {
    return this.metrics.counters.get(name) || 0;
  }

  // ============================================
  // 仪表 API Gauges API
  // ============================================

  /**
   * 设置仪表值
   * @param {string} name - 仪表名称
   * @param {number} value - 值
   */
  setGauge(name, value) {
    this.metrics.gauges.set(name, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取仪表值
   * @param {string} name - 仪表名称
   */
  getGauge(name) {
    const gauge = this.metrics.gauges.get(name);
    return gauge ? gauge.value : null;
  }

  // ============================================
  // 统计 API Statistics API
  // ============================================

  /**
   * 获取计时统计
   * @param {string} name - 名称
   */
  getTimingStats(name) {
    const histogram = this.metrics.histograms.get(name);
    if (!histogram || histogram.count === 0) {
      return null;
    }

    const values = [...histogram.values].sort((a, b) => a - b);
    const count = values.length;

    return {
      name,
      count: histogram.count,
      min: histogram.min,
      max: histogram.max,
      mean: histogram.sum / histogram.count,
      sum: histogram.sum,
      p50: values[Math.floor(count * 0.5)] || 0,
      p90: values[Math.floor(count * 0.9)] || 0,
      p95: values[Math.floor(count * 0.95)] || 0,
      p99: values[Math.floor(count * 0.99)] || 0,
    };
  }

  /**
   * 获取所有计时统计
   */
  getAllTimingStats() {
    const stats = {};
    for (const name of this.metrics.histograms.keys()) {
      stats[name] = this.getTimingStats(name);
    }
    return stats;
  }

  /**
   * 获取所有计数器
   */
  getAllCounters() {
    const counters = {};
    for (const [name, value] of this.metrics.counters) {
      counters[name] = value;
    }
    return counters;
  }

  /**
   * 获取所有仪表
   */
  getAllGauges() {
    const gauges = {};
    for (const [name, data] of this.metrics.gauges) {
      gauges[name] = data;
    }
    return gauges;
  }

  // ============================================
  // 历史数据 API History API
  // ============================================

  /**
   * 获取内存历史
   * @param {number} limit - 限制数量
   */
  getMemoryHistory(limit = 100) {
    return this.history.memory.slice(-limit);
  }

  /**
   * 获取 CPU 历史
   * @param {number} limit - 限制数量
   */
  getCpuHistory(limit = 100) {
    return this.history.cpu.slice(-limit);
  }

  /**
   * 获取事件循环历史
   * @param {number} limit - 限制数量
   */
  getEventLoopHistory(limit = 100) {
    return this.history.eventLoop.slice(-limit);
  }

  // ============================================
  // 快照 API Snapshot API
  // ============================================

  /**
   * 获取当前性能快照
   */
  getSnapshot() {
    const memoryMetrics = this._collectMemoryMetrics();
    const cpuMetrics = this._collectCpuMetrics();

    return {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      system: this.systemInfo,
      memory: memoryMetrics,
      cpu: cpuMetrics,
      counters: this.getAllCounters(),
      gauges: this.getAllGauges(),
      timings: this.getAllTimingStats(),
      gc: { ...this.gcStats },
    };
  }

  /**
   * 获取摘要
   */
  getSummary() {
    const snapshot = this.getSnapshot();

    return {
      uptime: snapshot.uptime,
      uptimeFormatted: this._formatUptime(snapshot.uptime),
      memoryUsedMB: Math.round(snapshot.memory.heapUsed / 1024 / 1024 * 100) / 100,
      memoryTotalMB: Math.round(snapshot.memory.heapTotal / 1024 / 1024 * 100) / 100,
      memoryPercent: Math.round(snapshot.memory.heapUsedPercent * 10) / 10,
      cpuPercent: Math.round(snapshot.cpu.totalPercent * 10) / 10,
      counters: Object.keys(snapshot.counters).length,
      timings: Object.keys(snapshot.timings).length,
    };
  }

  /**
   * 格式化运行时间
   * @private
   */
  _formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * 重置所有指标
   */
  reset() {
    this.metrics.timers.clear();
    this.metrics.counters.clear();
    this.metrics.histograms.clear();
    this.metrics.gauges.clear();

    this.history.memory = [];
    this.history.cpu = [];
    this.history.eventLoop = [];
    this.history.custom.clear();

    this.gcStats = {
      collections: 0,
      totalPauseMs: 0,
      lastPauseMs: 0,
    };

    this.emit('reset');
  }
}

export { PerformanceMonitor };
export default PerformanceMonitor;
