/**
 * 性能监控器
 * Performance Monitor
 *
 * 提供系统性能指标收集和分析功能
 * Provides system performance metrics collection and analysis
 *
 * @module src/monitoring/PerformanceMonitor
 */

import { EventEmitter } from 'events'; // 导入模块 events
import os from 'os'; // 导入模块 os
import v8 from 'v8'; // 导入模块 v8

/**
 * 性能监控器类
 * Performance Monitor Class
 */
class PerformanceMonitor extends EventEmitter { // 定义类 PerformanceMonitor(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { // 设置 config
      // 采样间隔 (ms)
      sampleInterval: config.sampleInterval || 5000, // 采样间隔 (ms)
      // 保留的历史数据点数
      historySize: config.historySize || 1000, // 保留的历史数据点数
      // 是否启用详细内存分析
      detailedMemory: config.detailedMemory ?? false, // 是否启用详细内存分析
      // 告警阈值
      thresholds: { // 告警阈值
        memoryUsagePercent: config.thresholds?.memoryUsagePercent || 85, // 内存使用率
        cpuUsagePercent: config.thresholds?.cpuUsagePercent || 80, // CPU使用率
        eventLoopLagMs: config.thresholds?.eventLoopLagMs || 100, // 事件循环延迟(毫秒)
        gcPauseMs: config.thresholds?.gcPauseMs || 100, // GC暂停(毫秒)
        ...config.thresholds, // 展开对象或数组
      }, // 结束代码块
    }; // 结束代码块

    // 指标存储
    this.metrics = { // 设置 metrics
      // 操作计时器
      timers: new Map(), // 计时器
      // 计数器
      counters: new Map(), // 计数器
      // 直方图 (用于延迟分布)
      histograms: new Map(), // 直方图 (用于延迟分布)
      // 仪表 (当前值)
      gauges: new Map(), // 仪表 (当前值)
    }; // 结束代码块

    // 历史数据
    this.history = { // 设置 history
      memory: [], // 内存
      cpu: [], // CPU
      eventLoop: [], // 事件循环
      custom: new Map(), // 自定义
    }; // 结束代码块

    // 系统信息
    this.systemInfo = this._getSystemInfo(); // 设置 systemInfo

    // 采样定时器
    this.sampleTimer = null; // 设置 sampleTimer

    // 事件循环监控
    this.eventLoopMonitor = null; // 设置 eventLoopMonitor
    this.lastEventLoopCheck = process.hrtime.bigint(); // 设置 lastEventLoopCheck

    // CPU 使用率跟踪
    this.lastCpuUsage = process.cpuUsage(); // 设置 lastCpuUsage
    this.lastCpuTime = Date.now(); // 设置 lastCpuTime

    // GC 监控 (如果可用)
    this.gcStats = { // 设置 gcStats
      collections: 0, // collections
      totalPauseMs: 0, // 总暂停毫秒
      lastPauseMs: 0, // last暂停毫秒
    }; // 结束代码块

    // 启动时间
    this.startTime = Date.now(); // 设置 startTime
  } // 结束代码块

  /**
   * 获取系统信息
   * @private
   */
  _getSystemInfo() { // 调用 _getSystemInfo
    return { // 返回结果
      platform: os.platform(), // platform
      arch: os.arch(), // arch
      nodeVersion: process.version, // nodeVersion
      cpus: os.cpus().length, // cpus
      totalMemory: os.totalmem(), // 总内存
      hostname: os.hostname(), // hostname
    }; // 结束代码块
  } // 结束代码块

  /**
   * 启动性能监控
   */
  start() { // 调用 start
    if (this.sampleTimer) { // 条件判断 this.sampleTimer
      return; // 返回结果
    } // 结束代码块

    // 初始采样
    this._collectSample(); // 调用 _collectSample

    // 定时采样
    this.sampleTimer = setInterval(() => { // 设置 sampleTimer
      this._collectSample(); // 调用 _collectSample
    }, this.config.sampleInterval); // 执行语句

    // 事件循环延迟监控
    this._startEventLoopMonitor(); // 调用 _startEventLoopMonitor

    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止性能监控
   */
  stop() { // 调用 stop
    if (this.sampleTimer) { // 条件判断 this.sampleTimer
      clearInterval(this.sampleTimer); // 调用 clearInterval
      this.sampleTimer = null; // 设置 sampleTimer
    } // 结束代码块

    if (this.eventLoopMonitor) { // 条件判断 this.eventLoopMonitor
      clearImmediate(this.eventLoopMonitor); // 调用 clearImmediate
      this.eventLoopMonitor = null; // 设置 eventLoopMonitor
    } // 结束代码块

    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  /**
   * 启动事件循环监控
   * @private
   */
  _startEventLoopMonitor() { // 调用 _startEventLoopMonitor
    const check = () => { // 定义函数 check
      const now = process.hrtime.bigint(); // 定义常量 now
      const lag = Number(now - this.lastEventLoopCheck) / 1e6 - this.config.sampleInterval; // 定义常量 lag

      if (lag > 0) { // 条件判断 lag > 0
        this._addToHistory('eventLoop', { // 调用 _addToHistory
          timestamp: Date.now(), // 时间戳
          lagMs: Math.max(0, lag), // 延迟毫秒
        }); // 结束代码块

        // 检查阈值
        if (lag > this.config.thresholds.eventLoopLagMs) { // 条件判断 lag > this.config.thresholds.eventLoopLagMs
          this.emit('alert', { // 调用 emit
            type: 'eventLoopLag', // 类型
            value: lag, // value
            threshold: this.config.thresholds.eventLoopLagMs, // 阈值
            message: `Event loop lag ${lag.toFixed(2)}ms exceeds threshold`, // 消息
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块

      this.lastEventLoopCheck = now; // 设置 lastEventLoopCheck
      this.eventLoopMonitor = setTimeout(check, this.config.sampleInterval); // 设置 eventLoopMonitor
    }; // 结束代码块

    this.lastEventLoopCheck = process.hrtime.bigint(); // 设置 lastEventLoopCheck
    this.eventLoopMonitor = setTimeout(check, this.config.sampleInterval); // 设置 eventLoopMonitor
  } // 结束代码块

  /**
   * 收集样本
   * @private
   */
  _collectSample() { // 调用 _collectSample
    const timestamp = Date.now(); // 定义常量 timestamp

    // 内存指标
    const memoryMetrics = this._collectMemoryMetrics(); // 定义常量 memoryMetrics
    this._addToHistory('memory', { timestamp, ...memoryMetrics }); // 调用 _addToHistory

    // CPU 指标
    const cpuMetrics = this._collectCpuMetrics(); // 定义常量 cpuMetrics
    this._addToHistory('cpu', { timestamp, ...cpuMetrics }); // 调用 _addToHistory

    // 检查告警阈值
    this._checkThresholds(memoryMetrics, cpuMetrics); // 调用 _checkThresholds

    this.emit('sample', { // 调用 emit
      timestamp, // 执行语句
      memory: memoryMetrics, // 内存
      cpu: cpuMetrics, // CPU
    }); // 结束代码块
  } // 结束代码块

  /**
   * 收集内存指标
   * @private
   */
  _collectMemoryMetrics() { // 调用 _collectMemoryMetrics
    const memUsage = process.memoryUsage(); // 定义常量 memUsage
    const totalMemory = os.totalmem(); // 定义常量 totalMemory
    const freeMemory = os.freemem(); // 定义常量 freeMemory

    const metrics = { // 定义常量 metrics
      heapUsed: memUsage.heapUsed, // heapUsed
      heapTotal: memUsage.heapTotal, // heap总
      external: memUsage.external, // external
      rss: memUsage.rss, // rss
      arrayBuffers: memUsage.arrayBuffers || 0, // arrayBuffers
      systemTotal: totalMemory, // 系统总
      systemFree: freeMemory, // 系统Free
      systemUsed: totalMemory - freeMemory, // 系统Used
      heapUsedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100, // heapUsed百分比
      systemUsedPercent: ((totalMemory - freeMemory) / totalMemory) * 100, // 系统Used百分比
    }; // 结束代码块

    // 详细 V8 堆统计
    if (this.config.detailedMemory) { // 条件判断 this.config.detailedMemory
      const heapStats = v8.getHeapStatistics(); // 定义常量 heapStats
      metrics.v8 = { // 赋值 metrics.v8
        totalHeapSize: heapStats.total_heap_size, // 总Heap大小
        totalHeapSizeExecutable: heapStats.total_heap_size_executable, // 总Heap大小Executable
        totalPhysicalSize: heapStats.total_physical_size, // 总Physical大小
        usedHeapSize: heapStats.used_heap_size, // usedHeap大小
        heapSizeLimit: heapStats.heap_size_limit, // heap大小限制
        mallocedMemory: heapStats.malloced_memory, // malloced内存
        peakMallocedMemory: heapStats.peak_malloced_memory, // peakMalloced内存
        numberOfNativeContexts: heapStats.number_of_native_contexts, // numberOfNativeContexts
        numberOfDetachedContexts: heapStats.number_of_detached_contexts, // numberOfDetachedContexts
      }; // 结束代码块
    } // 结束代码块

    return metrics; // 返回结果
  } // 结束代码块

  /**
   * 收集 CPU 指标
   * @private
   */
  _collectCpuMetrics() { // 调用 _collectCpuMetrics
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage); // 定义常量 currentCpuUsage
    const currentTime = Date.now(); // 定义常量 currentTime
    const elapsedMs = currentTime - this.lastCpuTime; // 定义常量 elapsedMs

    // 计算 CPU 使用百分比
    const userPercent = (currentCpuUsage.user / 1000 / elapsedMs) * 100; // 定义常量 userPercent
    const systemPercent = (currentCpuUsage.system / 1000 / elapsedMs) * 100; // 定义常量 systemPercent
    const totalPercent = userPercent + systemPercent; // 定义常量 totalPercent

    // 系统负载 (仅 Unix)
    let loadAverage = [0, 0, 0]; // 定义变量 loadAverage
    try { // 尝试执行
      loadAverage = os.loadavg(); // 赋值 loadAverage
    } catch { // 执行语句
      // Windows 不支持 loadavg
    } // 结束代码块

    this.lastCpuUsage = process.cpuUsage(); // 设置 lastCpuUsage
    this.lastCpuTime = currentTime; // 设置 lastCpuTime

    return { // 返回结果
      user: currentCpuUsage.user, // 用户
      system: currentCpuUsage.system, // 系统
      userPercent, // 执行语句
      systemPercent, // 执行语句
      totalPercent, // 执行语句
      loadAverage, // 执行语句
      cpuCount: os.cpus().length, // CPU数量
    }; // 结束代码块
  } // 结束代码块

  /**
   * 检查告警阈值
   * @private
   */
  _checkThresholds(memoryMetrics, cpuMetrics) { // 调用 _checkThresholds
    // 内存使用率告警
    if (memoryMetrics.systemUsedPercent > this.config.thresholds.memoryUsagePercent) { // 条件判断 memoryMetrics.systemUsedPercent > this.config...
      this.emit('alert', { // 调用 emit
        type: 'memoryUsage', // 类型
        value: memoryMetrics.systemUsedPercent, // value
        threshold: this.config.thresholds.memoryUsagePercent, // 阈值
        message: `Memory usage ${memoryMetrics.systemUsedPercent.toFixed(1)}% exceeds threshold`, // 消息
      }); // 结束代码块
    } // 结束代码块

    // CPU 使用率告警
    if (cpuMetrics.totalPercent > this.config.thresholds.cpuUsagePercent) { // 条件判断 cpuMetrics.totalPercent > this.config.thresho...
      this.emit('alert', { // 调用 emit
        type: 'cpuUsage', // 类型
        value: cpuMetrics.totalPercent, // value
        threshold: this.config.thresholds.cpuUsagePercent, // 阈值
        message: `CPU usage ${cpuMetrics.totalPercent.toFixed(1)}% exceeds threshold`, // 消息
      }); // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 添加到历史记录
   * @private
   */
  _addToHistory(type, data) { // 调用 _addToHistory
    const history = this.history[type]; // 定义常量 history
    if (!history) return; // 条件判断 !history

    history.push(data); // 调用 history.push

    // 限制历史大小
    while (history.length > this.config.historySize) { // 循环条件 history.length > this.config.historySize
      history.shift(); // 调用 history.shift
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 计时器 API Timers API
  // ============================================

  /**
   * 开始计时
   * @param {string} name - 计时器名称
   * @returns {Function} 停止计时的函数
   */
  startTimer(name) { // 调用 startTimer
    const start = process.hrtime.bigint(); // 定义常量 start

    return () => { // 返回结果
      const end = process.hrtime.bigint(); // 定义常量 end
      const durationMs = Number(end - start) / 1e6; // 定义常量 durationMs
      this.recordTiming(name, durationMs); // 调用 recordTiming
      return durationMs; // 返回结果
    }; // 结束代码块
  } // 结束代码块

  /**
   * 记录计时
   * @param {string} name - 名称
   * @param {number} durationMs - 持续时间 (ms)
   */
  recordTiming(name, durationMs) { // 调用 recordTiming
    if (!this.metrics.histograms.has(name)) { // 条件判断 !this.metrics.histograms.has(name)
      this.metrics.histograms.set(name, { // 访问 metrics
        count: 0, // 数量
        sum: 0, // sum
        min: Infinity, // 最小
        max: -Infinity, // 最大
        values: [], // values
      }); // 结束代码块
    } // 结束代码块

    const histogram = this.metrics.histograms.get(name); // 定义常量 histogram
    histogram.count++; // 执行语句
    histogram.sum += durationMs; // 执行语句
    histogram.min = Math.min(histogram.min, durationMs); // 赋值 histogram.min
    histogram.max = Math.max(histogram.max, durationMs); // 赋值 histogram.max
    histogram.values.push(durationMs); // 调用 histogram.values.push

    // 限制存储的值数量
    if (histogram.values.length > 10000) { // 条件判断 histogram.values.length > 10000
      histogram.values = histogram.values.slice(-5000); // 赋值 histogram.values
    } // 结束代码块
  } // 结束代码块

  /**
   * 异步操作计时装饰器
   * @param {string} name - 名称
   * @param {Function} fn - 异步函数
   */
  async timeAsync(name, fn) { // 执行语句
    const stop = this.startTimer(name); // 定义常量 stop
    try { // 尝试执行
      return await fn(); // 返回结果
    } finally { // 执行语句
      stop(); // 调用 stop
    } // 结束代码块
  } // 结束代码块

  /**
   * 同步操作计时装饰器
   * @param {string} name - 名称
   * @param {Function} fn - 同步函数
   */
  timeSync(name, fn) { // 调用 timeSync
    const stop = this.startTimer(name); // 定义常量 stop
    try { // 尝试执行
      return fn(); // 返回结果
    } finally { // 执行语句
      stop(); // 调用 stop
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 计数器 API Counters API
  // ============================================

  /**
   * 增加计数器
   * @param {string} name - 计数器名称
   * @param {number} value - 增加值
   */
  increment(name, value = 1) { // 调用 increment
    const current = this.metrics.counters.get(name) || 0; // 定义常量 current
    this.metrics.counters.set(name, current + value); // 访问 metrics
  } // 结束代码块

  /**
   * 减少计数器
   * @param {string} name - 计数器名称
   * @param {number} value - 减少值
   */
  decrement(name, value = 1) { // 调用 decrement
    this.increment(name, -value); // 调用 increment
  } // 结束代码块

  /**
   * 获取计数器值
   * @param {string} name - 计数器名称
   */
  getCounter(name) { // 调用 getCounter
    return this.metrics.counters.get(name) || 0; // 返回结果
  } // 结束代码块

  // ============================================
  // 仪表 API Gauges API
  // ============================================

  /**
   * 设置仪表值
   * @param {string} name - 仪表名称
   * @param {number} value - 值
   */
  setGauge(name, value) { // 调用 setGauge
    this.metrics.gauges.set(name, { // 访问 metrics
      value, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取仪表值
   * @param {string} name - 仪表名称
   */
  getGauge(name) { // 调用 getGauge
    const gauge = this.metrics.gauges.get(name); // 定义常量 gauge
    return gauge ? gauge.value : null; // 返回结果
  } // 结束代码块

  // ============================================
  // 统计 API Statistics API
  // ============================================

  /**
   * 获取计时统计
   * @param {string} name - 名称
   */
  getTimingStats(name) { // 调用 getTimingStats
    const histogram = this.metrics.histograms.get(name); // 定义常量 histogram
    if (!histogram || histogram.count === 0) { // 条件判断 !histogram || histogram.count === 0
      return null; // 返回结果
    } // 结束代码块

    const values = [...histogram.values].sort((a, b) => a - b); // 定义函数 values
    const count = values.length; // 定义常量 count

    return { // 返回结果
      name, // 执行语句
      count: histogram.count, // 数量
      min: histogram.min, // 最小
      max: histogram.max, // 最大
      mean: histogram.sum / histogram.count, // mean
      sum: histogram.sum, // sum
      p50: values[Math.floor(count * 0.5)] || 0, // p50
      p90: values[Math.floor(count * 0.9)] || 0, // p90
      p95: values[Math.floor(count * 0.95)] || 0, // p95
      p99: values[Math.floor(count * 0.99)] || 0, // p99
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取所有计时统计
   */
  getAllTimingStats() { // 调用 getAllTimingStats
    const stats = {}; // 定义常量 stats
    for (const name of this.metrics.histograms.keys()) { // 循环 const name of this.metrics.histograms.keys()
      stats[name] = this.getTimingStats(name); // 执行语句
    } // 结束代码块
    return stats; // 返回结果
  } // 结束代码块

  /**
   * 获取所有计数器
   */
  getAllCounters() { // 调用 getAllCounters
    const counters = {}; // 定义常量 counters
    for (const [name, value] of this.metrics.counters) { // 循环 const [name, value] of this.metrics.counters
      counters[name] = value; // 执行语句
    } // 结束代码块
    return counters; // 返回结果
  } // 结束代码块

  /**
   * 获取所有仪表
   */
  getAllGauges() { // 调用 getAllGauges
    const gauges = {}; // 定义常量 gauges
    for (const [name, data] of this.metrics.gauges) { // 循环 const [name, data] of this.metrics.gauges
      gauges[name] = data; // 执行语句
    } // 结束代码块
    return gauges; // 返回结果
  } // 结束代码块

  // ============================================
  // 历史数据 API History API
  // ============================================

  /**
   * 获取内存历史
   * @param {number} limit - 限制数量
   */
  getMemoryHistory(limit = 100) { // 调用 getMemoryHistory
    return this.history.memory.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取 CPU 历史
   * @param {number} limit - 限制数量
   */
  getCpuHistory(limit = 100) { // 调用 getCpuHistory
    return this.history.cpu.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取事件循环历史
   * @param {number} limit - 限制数量
   */
  getEventLoopHistory(limit = 100) { // 调用 getEventLoopHistory
    return this.history.eventLoop.slice(-limit); // 返回结果
  } // 结束代码块

  // ============================================
  // 快照 API Snapshot API
  // ============================================

  /**
   * 获取当前性能快照
   */
  getSnapshot() { // 调用 getSnapshot
    const memoryMetrics = this._collectMemoryMetrics(); // 定义常量 memoryMetrics
    const cpuMetrics = this._collectCpuMetrics(); // 定义常量 cpuMetrics

    return { // 返回结果
      timestamp: Date.now(), // 时间戳
      uptime: Date.now() - this.startTime, // uptime
      system: this.systemInfo, // 系统
      memory: memoryMetrics, // 内存
      cpu: cpuMetrics, // CPU
      counters: this.getAllCounters(), // 计数器
      gauges: this.getAllGauges(), // 仪表
      timings: this.getAllTimingStats(), // timings
      gc: { ...this.gcStats }, // GC
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取摘要
   */
  getSummary() { // 调用 getSummary
    const snapshot = this.getSnapshot(); // 定义常量 snapshot

    return { // 返回结果
      uptime: snapshot.uptime, // uptime
      uptimeFormatted: this._formatUptime(snapshot.uptime), // uptimeFormatted
      memoryUsedMB: Math.round(snapshot.memory.heapUsed / 1024 / 1024 * 100) / 100, // 内存UsedMB
      memoryTotalMB: Math.round(snapshot.memory.heapTotal / 1024 / 1024 * 100) / 100, // 内存总MB
      memoryPercent: Math.round(snapshot.memory.heapUsedPercent * 10) / 10, // 内存百分比
      cpuPercent: Math.round(snapshot.cpu.totalPercent * 10) / 10, // CPU百分比
      counters: Object.keys(snapshot.counters).length, // 计数器
      timings: Object.keys(snapshot.timings).length, // timings
    }; // 结束代码块
  } // 结束代码块

  /**
   * 格式化运行时间
   * @private
   */
  _formatUptime(ms) { // 调用 _formatUptime
    const seconds = Math.floor(ms / 1000); // 定义常量 seconds
    const minutes = Math.floor(seconds / 60); // 定义常量 minutes
    const hours = Math.floor(minutes / 60); // 定义常量 hours
    const days = Math.floor(hours / 24); // 定义常量 days

    if (days > 0) { // 条件判断 days > 0
      return `${days}d ${hours % 24}h ${minutes % 60}m`; // 返回结果
    } // 结束代码块
    if (hours > 0) { // 条件判断 hours > 0
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`; // 返回结果
    } // 结束代码块
    if (minutes > 0) { // 条件判断 minutes > 0
      return `${minutes}m ${seconds % 60}s`; // 返回结果
    } // 结束代码块
    return `${seconds}s`; // 返回结果
  } // 结束代码块

  /**
   * 重置所有指标
   */
  reset() { // 调用 reset
    this.metrics.timers.clear(); // 访问 metrics
    this.metrics.counters.clear(); // 访问 metrics
    this.metrics.histograms.clear(); // 访问 metrics
    this.metrics.gauges.clear(); // 访问 metrics

    this.history.memory = []; // 访问 history
    this.history.cpu = []; // 访问 history
    this.history.eventLoop = []; // 访问 history
    this.history.custom.clear(); // 访问 history

    this.gcStats = { // 设置 gcStats
      collections: 0, // collections
      totalPauseMs: 0, // 总暂停毫秒
      lastPauseMs: 0, // last暂停毫秒
    }; // 结束代码块

    this.emit('reset'); // 调用 emit
  } // 结束代码块
} // 结束代码块

export { PerformanceMonitor }; // 导出命名成员
export default PerformanceMonitor; // 默认导出
