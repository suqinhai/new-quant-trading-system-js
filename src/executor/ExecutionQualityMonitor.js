/**
 * 订单执行质量监控器
 * Order Execution Quality Monitor
 *
 * 功能 / Features:
 * 1. 滑点统计分析 / Slippage statistics analysis
 * 2. 成交时间统计 / Execution time statistics
 * 3. 成交率分析 / Fill rate analysis
 * 4. 执行成本分析 / Execution cost analysis
 * 5. 性能指标报告 / Performance metrics reporting
 * 6. 异常执行检测 / Abnormal execution detection
 */

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 执行质量级别
 * Execution quality level
 */
const EXECUTION_QUALITY = {
  EXCELLENT: 'excellent',   // 优秀 / Excellent
  GOOD: 'good',             // 良好 / Good
  AVERAGE: 'average',       // 一般 / Average
  POOR: 'poor',             // 较差 / Poor
  CRITICAL: 'critical',     // 严重 / Critical
};

/**
 * 滑点类型
 * Slippage type
 */
const SLIPPAGE_TYPE = {
  POSITIVE: 'positive',     // 正滑点(有利) / Positive (favorable)
  ZERO: 'zero',             // 零滑点 / Zero
  NEGATIVE: 'negative',     // 负滑点(不利) / Negative (unfavorable)
};

/**
 * 订单状态
 * Order status
 */
const ORDER_STATUS = {
  PENDING: 'pending',       // 待成交 / Pending
  PARTIAL: 'partial',       // 部分成交 / Partial fill
  FILLED: 'filled',         // 完全成交 / Filled
  CANCELLED: 'cancelled',   // 已取消 / Cancelled
  REJECTED: 'rejected',     // 被拒绝 / Rejected
  EXPIRED: 'expired',       // 已过期 / Expired
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // ============================================
  // 滑点阈值 / Slippage Thresholds
  // ============================================

  // 滑点警告阈值 / Slippage warning threshold
  slippageWarningThreshold: 0.002,    // 0.2%

  // 滑点严重阈值 / Slippage critical threshold
  slippageCriticalThreshold: 0.005,   // 0.5%

  // 滑点异常阈值 / Slippage anomaly threshold
  slippageAnomalyThreshold: 0.01,     // 1%

  // ============================================
  // 执行时间阈值 / Execution Time Thresholds
  // ============================================

  // 执行时间警告阈值 (毫秒) / Execution time warning threshold (ms)
  executionTimeWarning: 5000,         // 5秒

  // 执行时间严重阈值 (毫秒) / Execution time critical threshold (ms)
  executionTimeCritical: 15000,       // 15秒

  // 执行时间异常阈值 (毫秒) / Execution time anomaly threshold (ms)
  executionTimeAnomaly: 60000,        // 60秒

  // ============================================
  // 成交率阈值 / Fill Rate Thresholds
  // ============================================

  // 成交率警告阈值 / Fill rate warning threshold
  fillRateWarning: 0.8,               // 80%

  // 成交率严重阈值 / Fill rate critical threshold
  fillRateCritical: 0.5,              // 50%

  // ============================================
  // 统计配置 / Statistics Configuration
  // ============================================

  // 统计窗口大小 / Statistics window size
  statisticsWindowSize: 1000,

  // 滚动窗口时间 (毫秒) / Rolling window time (ms)
  rollingWindowTime: 24 * 60 * 60 * 1000, // 24小时

  // 短期窗口时间 (毫秒) / Short-term window time (ms)
  shortTermWindowTime: 60 * 60 * 1000,    // 1小时

  // 汇总间隔 (毫秒) / Aggregation interval (ms)
  aggregationInterval: 60 * 1000,          // 1分钟

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[ExecutionQuality]',

  // 是否启用异常检测 / Enable anomaly detection
  enableAnomalyDetection: true,

  // 异常检测敏感度 (标准差倍数) / Anomaly detection sensitivity (std dev multiplier)
  anomalySensitivity: 3.0,
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 订单执行质量监控器
 * Order Execution Quality Monitor
 */
export class ExecutionQualityMonitor extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    super();

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 执行记录 / Execution records
    // 格式: [{ orderId, symbol, side, expectedPrice, actualPrice, slippage, ... }]
    this.executionRecords = [];

    // 按交易对统计 / Statistics by symbol
    // 格式: { symbol: { slippages: [], times: [], fillRates: [], ... } }
    this.symbolStats = new Map();

    // 按交易所统计 / Statistics by exchange
    // 格式: { exchange: { slippages: [], times: [], fillRates: [], ... } }
    this.exchangeStats = new Map();

    // 按账户统计 / Statistics by account
    // 格式: { accountId: { slippages: [], times: [], fillRates: [], ... } }
    this.accountStats = new Map();

    // 活跃订单追踪 / Active order tracking
    // 格式: { orderId: { startTime, expectedPrice, symbol, ... } }
    this.activeOrders = new Map();

    // 汇总统计 / Aggregated statistics
    this.aggregatedStats = {
      total: this._createEmptyStats(),
      lastHour: this._createEmptyStats(),
      last24Hours: this._createEmptyStats(),
    };

    // 异常记录 / Anomaly records
    this.anomalies = [];

    // 运行状态 / Running state
    this.running = false;

    // 定时器 / Timers
    this.aggregationTimer = null;
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 启动
   * Start
   */
  start() {
    if (this.running) return;

    this.running = true;

    // 启动定时汇总 / Start periodic aggregation
    this.aggregationTimer = setInterval(
      () => this._performAggregation(),
      this.config.aggregationInterval
    );

    this.log('执行质量监控器已启动 / Execution quality monitor started', 'info');
    this.emit('started');
  }

  /**
   * 停止
   * Stop
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }

    this.log('执行质量监控器已停止 / Execution quality monitor stopped', 'info');
    this.emit('stopped');
  }

  // ============================================
  // 订单追踪 / Order Tracking
  // ============================================

  /**
   * 开始追踪订单
   * Start tracking order
   *
   * @param {Object} order - 订单信息 / Order info
   */
  startTracking(order) {
    const {
      orderId,
      symbol,
      side,
      type,
      expectedPrice,
      amount,
      exchange,
      accountId,
    } = order;

    const tracking = {
      orderId,
      symbol,
      side,
      type: type || 'limit',
      expectedPrice,
      amount,
      exchange: exchange || 'unknown',
      accountId: accountId || 'default',
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      filledAmount: 0,
      filledValue: 0,
      fills: [],
      status: ORDER_STATUS.PENDING,
    };

    this.activeOrders.set(orderId, tracking);

    this.log(`开始追踪订单: ${orderId} ${symbol} ${side}`, 'info');
  }

  /**
   * 更新订单成交
   * Update order fill
   *
   * @param {string} orderId - 订单ID / Order ID
   * @param {Object} fill - 成交信息 / Fill info
   */
  updateFill(orderId, fill) {
    const tracking = this.activeOrders.get(orderId);
    if (!tracking) {
      this.log(`未找到订单追踪: ${orderId}`, 'warn');
      return;
    }

    const { price, amount, timestamp, fee } = fill;
    const fillTime = timestamp || Date.now();

    // 记录成交 / Record fill
    tracking.fills.push({
      price,
      amount,
      timestamp: fillTime,
      fee: fee || 0,
      latency: fillTime - tracking.startTime,
    });

    // 更新累计 / Update cumulative
    tracking.filledAmount += amount;
    tracking.filledValue += price * amount;
    tracking.lastUpdateTime = fillTime;

    // 更新状态 / Update status
    if (tracking.filledAmount >= tracking.amount * 0.9999) {
      tracking.status = ORDER_STATUS.FILLED;
    } else if (tracking.filledAmount > 0) {
      tracking.status = ORDER_STATUS.PARTIAL;
    }

    this.log(`订单成交更新: ${orderId} 成交 ${amount} @ ${price}`, 'info');
  }

  /**
   * 完成订单追踪
   * Complete order tracking
   *
   * @param {string} orderId - 订单ID / Order ID
   * @param {Object} result - 最终结果 / Final result
   */
  completeTracking(orderId, result = {}) {
    const tracking = this.activeOrders.get(orderId);
    if (!tracking) {
      this.log(`未找到订单追踪: ${orderId}`, 'warn');
      return;
    }

    const endTime = result.timestamp || Date.now();
    const finalStatus = result.status || (tracking.filledAmount > 0 ? ORDER_STATUS.FILLED : ORDER_STATUS.CANCELLED);

    // 计算执行质量指标 / Calculate execution quality metrics
    const executionRecord = this._calculateExecutionMetrics(tracking, endTime, finalStatus);

    // 保存记录 / Save record
    this._saveExecutionRecord(executionRecord);

    // 检测异常 / Detect anomalies
    if (this.config.enableAnomalyDetection) {
      this._detectAnomalies(executionRecord);
    }

    // 移除活跃订单 / Remove from active orders
    this.activeOrders.delete(orderId);

    this.log(`订单追踪完成: ${orderId} 状态=${finalStatus}`, 'info');

    // 发出完成事件 / Emit completion event
    this.emit('executionComplete', executionRecord);

    return executionRecord;
  }

  /**
   * 取消订单追踪
   * Cancel order tracking
   *
   * @param {string} orderId - 订单ID / Order ID
   * @param {string} reason - 原因 / Reason
   */
  cancelTracking(orderId, reason = '') {
    return this.completeTracking(orderId, {
      status: ORDER_STATUS.CANCELLED,
      reason,
    });
  }

  // ============================================
  // 指标计算 / Metrics Calculation
  // ============================================

  /**
   * 计算执行质量指标
   * Calculate execution quality metrics
   *
   * @param {Object} tracking - 追踪数据 / Tracking data
   * @param {number} endTime - 结束时间 / End time
   * @param {string} finalStatus - 最终状态 / Final status
   * @returns {Object} 执行记录 / Execution record
   * @private
   */
  _calculateExecutionMetrics(tracking, endTime, finalStatus) {
    const {
      orderId,
      symbol,
      side,
      type,
      expectedPrice,
      amount,
      exchange,
      accountId,
      startTime,
      filledAmount,
      filledValue,
      fills,
    } = tracking;

    // 计算平均成交价 / Calculate average fill price
    const avgFillPrice = filledAmount > 0 ? filledValue / filledAmount : 0;

    // 计算滑点 / Calculate slippage
    let slippage = 0;
    let slippageType = SLIPPAGE_TYPE.ZERO;

    if (expectedPrice > 0 && avgFillPrice > 0) {
      if (side === 'buy') {
        // 买入: 实际价格 > 预期价格 = 负滑点
        slippage = (avgFillPrice - expectedPrice) / expectedPrice;
        slippageType = slippage > 0.0001 ? SLIPPAGE_TYPE.NEGATIVE :
                       slippage < -0.0001 ? SLIPPAGE_TYPE.POSITIVE :
                       SLIPPAGE_TYPE.ZERO;
      } else {
        // 卖出: 实际价格 < 预期价格 = 负滑点
        slippage = (expectedPrice - avgFillPrice) / expectedPrice;
        slippageType = slippage > 0.0001 ? SLIPPAGE_TYPE.NEGATIVE :
                       slippage < -0.0001 ? SLIPPAGE_TYPE.POSITIVE :
                       SLIPPAGE_TYPE.ZERO;
      }
    }

    // 计算执行时间 / Calculate execution time
    const executionTime = endTime - startTime;

    // 计算成交率 / Calculate fill rate
    const fillRate = amount > 0 ? filledAmount / amount : 0;

    // 计算首次成交时间 / Calculate time to first fill
    const timeToFirstFill = fills.length > 0 ? fills[0].timestamp - startTime : null;

    // 计算成交次数 / Fill count
    const fillCount = fills.length;

    // 计算平均成交延迟 / Calculate average fill latency
    const avgFillLatency = fills.length > 0
      ? fills.reduce((sum, f) => sum + f.latency, 0) / fills.length
      : null;

    // 计算总手续费 / Calculate total fees
    const totalFees = fills.reduce((sum, f) => sum + (f.fee || 0), 0);

    // 确定执行质量 / Determine execution quality
    const quality = this._determineQuality(slippage, executionTime, fillRate);

    return {
      orderId,
      symbol,
      side,
      type,
      exchange,
      accountId,
      expectedPrice,
      avgFillPrice,
      slippage,
      slippageType,
      slippagePercent: slippage * 100,
      amount,
      filledAmount,
      fillRate,
      executionTime,
      timeToFirstFill,
      fillCount,
      avgFillLatency,
      totalFees,
      status: finalStatus,
      quality,
      startTime,
      endTime,
      fills,
      timestamp: Date.now(),
    };
  }

  /**
   * 确定执行质量
   * Determine execution quality
   *
   * @param {number} slippage - 滑点 / Slippage
   * @param {number} executionTime - 执行时间 / Execution time
   * @param {number} fillRate - 成交率 / Fill rate
   * @returns {string} 质量级别 / Quality level
   * @private
   */
  _determineQuality(slippage, executionTime, fillRate) {
    const absSlippage = Math.abs(slippage);

    // 检查严重问题 / Check critical issues
    if (absSlippage >= this.config.slippageAnomalyThreshold ||
        executionTime >= this.config.executionTimeAnomaly ||
        fillRate < this.config.fillRateCritical) {
      return EXECUTION_QUALITY.CRITICAL;
    }

    // 检查较差情况 / Check poor conditions
    if (absSlippage >= this.config.slippageCriticalThreshold ||
        executionTime >= this.config.executionTimeCritical) {
      return EXECUTION_QUALITY.POOR;
    }

    // 检查一般情况 / Check average conditions
    if (absSlippage >= this.config.slippageWarningThreshold ||
        executionTime >= this.config.executionTimeWarning ||
        fillRate < this.config.fillRateWarning) {
      return EXECUTION_QUALITY.AVERAGE;
    }

    // 检查良好情况 / Check good conditions
    if (absSlippage < this.config.slippageWarningThreshold * 0.5 &&
        executionTime < this.config.executionTimeWarning * 0.5 &&
        fillRate > 0.95) {
      return EXECUTION_QUALITY.EXCELLENT;
    }

    return EXECUTION_QUALITY.GOOD;
  }

  // ============================================
  // 记录管理 / Record Management
  // ============================================

  /**
   * 保存执行记录
   * Save execution record
   *
   * @param {Object} record - 执行记录 / Execution record
   * @private
   */
  _saveExecutionRecord(record) {
    // 添加到总记录 / Add to total records
    this.executionRecords.push(record);

    // 限制记录数量 / Limit record count
    if (this.executionRecords.length > this.config.statisticsWindowSize) {
      this.executionRecords.shift();
    }

    // 更新按交易对统计 / Update symbol stats
    this._updateStats(this.symbolStats, record.symbol, record);

    // 更新按交易所统计 / Update exchange stats
    this._updateStats(this.exchangeStats, record.exchange, record);

    // 更新按账户统计 / Update account stats
    this._updateStats(this.accountStats, record.accountId, record);
  }

  /**
   * 更新统计数据
   * Update statistics
   *
   * @param {Map} statsMap - 统计Map / Statistics map
   * @param {string} key - 键 / Key
   * @param {Object} record - 执行记录 / Execution record
   * @private
   */
  _updateStats(statsMap, key, record) {
    if (!statsMap.has(key)) {
      statsMap.set(key, this._createEmptyStats());
    }

    const stats = statsMap.get(key);

    // 添加滑点数据 / Add slippage data
    stats.slippages.push({
      value: record.slippage,
      timestamp: record.timestamp,
    });

    // 添加执行时间数据 / Add execution time data
    stats.executionTimes.push({
      value: record.executionTime,
      timestamp: record.timestamp,
    });

    // 添加成交率数据 / Add fill rate data
    stats.fillRates.push({
      value: record.fillRate,
      timestamp: record.timestamp,
    });

    // 更新计数 / Update counts
    stats.totalOrders++;
    stats.totalVolume += record.filledAmount;
    stats.totalFees += record.totalFees;

    if (record.status === ORDER_STATUS.FILLED) {
      stats.filledOrders++;
    } else if (record.status === ORDER_STATUS.CANCELLED) {
      stats.cancelledOrders++;
    }

    // 清理过期数据 / Clean expired data
    this._cleanExpiredData(stats);
  }

  /**
   * 创建空统计对象
   * Create empty stats object
   *
   * @returns {Object} 空统计对象 / Empty stats object
   * @private
   */
  _createEmptyStats() {
    return {
      slippages: [],
      executionTimes: [],
      fillRates: [],
      totalOrders: 0,
      filledOrders: 0,
      cancelledOrders: 0,
      totalVolume: 0,
      totalFees: 0,
    };
  }

  /**
   * 清理过期数据
   * Clean expired data
   *
   * @param {Object} stats - 统计对象 / Stats object
   * @private
   */
  _cleanExpiredData(stats) {
    const cutoffTime = Date.now() - this.config.rollingWindowTime;

    stats.slippages = stats.slippages.filter(s => s.timestamp >= cutoffTime);
    stats.executionTimes = stats.executionTimes.filter(t => t.timestamp >= cutoffTime);
    stats.fillRates = stats.fillRates.filter(f => f.timestamp >= cutoffTime);
  }

  // ============================================
  // 统计汇总 / Statistics Aggregation
  // ============================================

  /**
   * 执行统计汇总
   * Perform statistics aggregation
   * @private
   */
  _performAggregation() {
    const now = Date.now();
    const hourAgo = now - this.config.shortTermWindowTime;
    const dayAgo = now - this.config.rollingWindowTime;

    // 汇总最近1小时 / Aggregate last hour
    this.aggregatedStats.lastHour = this._aggregateRecords(
      this.executionRecords.filter(r => r.timestamp >= hourAgo)
    );

    // 汇总最近24小时 / Aggregate last 24 hours
    this.aggregatedStats.last24Hours = this._aggregateRecords(
      this.executionRecords.filter(r => r.timestamp >= dayAgo)
    );

    // 汇总全部 / Aggregate all
    this.aggregatedStats.total = this._aggregateRecords(this.executionRecords);

    // 发出汇总事件 / Emit aggregation event
    this.emit('statsAggregated', this.aggregatedStats);
  }

  /**
   * 汇总记录
   * Aggregate records
   *
   * @param {Array} records - 执行记录 / Execution records
   * @returns {Object} 汇总结果 / Aggregation result
   * @private
   */
  _aggregateRecords(records) {
    if (records.length === 0) {
      return {
        count: 0,
        slippage: { avg: 0, min: 0, max: 0, std: 0, median: 0 },
        executionTime: { avg: 0, min: 0, max: 0, std: 0, median: 0 },
        fillRate: { avg: 0, min: 0, max: 0 },
        qualityDistribution: {},
      };
    }

    // 提取数据 / Extract data
    const slippages = records.map(r => r.slippage);
    const executionTimes = records.map(r => r.executionTime);
    const fillRates = records.map(r => r.fillRate);

    // 计算滑点统计 / Calculate slippage stats
    const slippageStats = this._calculateArrayStats(slippages);

    // 计算执行时间统计 / Calculate execution time stats
    const executionTimeStats = this._calculateArrayStats(executionTimes);

    // 计算成交率统计 / Calculate fill rate stats
    const fillRateStats = {
      avg: fillRates.reduce((a, b) => a + b, 0) / fillRates.length,
      min: Math.min(...fillRates),
      max: Math.max(...fillRates),
    };

    // 计算质量分布 / Calculate quality distribution
    const qualityDistribution = {};
    for (const record of records) {
      qualityDistribution[record.quality] = (qualityDistribution[record.quality] || 0) + 1;
    }

    // 计算滑点类型分布 / Calculate slippage type distribution
    const slippageTypeDistribution = {};
    for (const record of records) {
      slippageTypeDistribution[record.slippageType] = (slippageTypeDistribution[record.slippageType] || 0) + 1;
    }

    return {
      count: records.length,
      slippage: slippageStats,
      executionTime: executionTimeStats,
      fillRate: fillRateStats,
      qualityDistribution,
      slippageTypeDistribution,
      totalVolume: records.reduce((sum, r) => sum + r.filledAmount, 0),
      totalFees: records.reduce((sum, r) => sum + r.totalFees, 0),
      avgFillCount: records.reduce((sum, r) => sum + r.fillCount, 0) / records.length,
    };
  }

  /**
   * 计算数组统计
   * Calculate array statistics
   *
   * @param {Array} arr - 数组 / Array
   * @returns {Object} 统计结果 / Statistics result
   * @private
   */
  _calculateArrayStats(arr) {
    if (arr.length === 0) {
      return { avg: 0, min: 0, max: 0, std: 0, median: 0 };
    }

    const sorted = [...arr].sort((a, b) => a - b);
    const sum = arr.reduce((a, b) => a + b, 0);
    const avg = sum / arr.length;

    // 计算标准差 / Calculate standard deviation
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length;
    const std = Math.sqrt(variance);

    // 计算中位数 / Calculate median
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;

    return {
      avg,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      std,
      median,
      p5: sorted[Math.floor(sorted.length * 0.05)] || sorted[0],
      p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    };
  }

  // ============================================
  // 异常检测 / Anomaly Detection
  // ============================================

  /**
   * 检测异常
   * Detect anomalies
   *
   * @param {Object} record - 执行记录 / Execution record
   * @private
   */
  _detectAnomalies(record) {
    const anomalies = [];

    // 检查滑点异常 / Check slippage anomaly
    if (Math.abs(record.slippage) >= this.config.slippageAnomalyThreshold) {
      anomalies.push({
        type: 'slippage_anomaly',
        severity: 'critical',
        message: `滑点异常: ${(record.slippage * 100).toFixed(3)}%`,
        value: record.slippage,
        threshold: this.config.slippageAnomalyThreshold,
      });
    } else if (Math.abs(record.slippage) >= this.config.slippageCriticalThreshold) {
      anomalies.push({
        type: 'slippage_high',
        severity: 'warning',
        message: `滑点较高: ${(record.slippage * 100).toFixed(3)}%`,
        value: record.slippage,
        threshold: this.config.slippageCriticalThreshold,
      });
    }

    // 检查执行时间异常 / Check execution time anomaly
    if (record.executionTime >= this.config.executionTimeAnomaly) {
      anomalies.push({
        type: 'execution_time_anomaly',
        severity: 'critical',
        message: `执行时间异常: ${(record.executionTime / 1000).toFixed(1)}秒`,
        value: record.executionTime,
        threshold: this.config.executionTimeAnomaly,
      });
    } else if (record.executionTime >= this.config.executionTimeCritical) {
      anomalies.push({
        type: 'execution_time_high',
        severity: 'warning',
        message: `执行时间较长: ${(record.executionTime / 1000).toFixed(1)}秒`,
        value: record.executionTime,
        threshold: this.config.executionTimeCritical,
      });
    }

    // 检查成交率异常 / Check fill rate anomaly
    if (record.fillRate < this.config.fillRateCritical) {
      anomalies.push({
        type: 'fill_rate_low',
        severity: 'critical',
        message: `成交率过低: ${(record.fillRate * 100).toFixed(1)}%`,
        value: record.fillRate,
        threshold: this.config.fillRateCritical,
      });
    } else if (record.fillRate < this.config.fillRateWarning) {
      anomalies.push({
        type: 'fill_rate_warning',
        severity: 'warning',
        message: `成交率较低: ${(record.fillRate * 100).toFixed(1)}%`,
        value: record.fillRate,
        threshold: this.config.fillRateWarning,
      });
    }

    // 统计异常检测 - 使用历史数据 / Statistical anomaly detection using historical data
    if (this.executionRecords.length >= 30) {
      const historicalSlippages = this.executionRecords.slice(-100).map(r => r.slippage);
      const stats = this._calculateArrayStats(historicalSlippages);

      // 检查是否超出N个标准差 / Check if exceeds N standard deviations
      if (stats.std > 0) {
        const zScore = (record.slippage - stats.avg) / stats.std;
        if (Math.abs(zScore) > this.config.anomalySensitivity) {
          anomalies.push({
            type: 'statistical_anomaly',
            severity: 'warning',
            message: `滑点统计异常: Z-Score=${zScore.toFixed(2)}`,
            value: record.slippage,
            zScore,
            historicalAvg: stats.avg,
            historicalStd: stats.std,
          });
        }
      }
    }

    // 记录并发出异常事件 / Record and emit anomaly events
    if (anomalies.length > 0) {
      const anomalyRecord = {
        orderId: record.orderId,
        symbol: record.symbol,
        exchange: record.exchange,
        anomalies,
        record,
        timestamp: Date.now(),
      };

      this.anomalies.push(anomalyRecord);

      // 限制异常记录数量 / Limit anomaly record count
      if (this.anomalies.length > 500) {
        this.anomalies.shift();
      }

      this.emit('anomalyDetected', anomalyRecord);

      this.log(`检测到执行异常: ${record.orderId} - ${anomalies.map(a => a.message).join(', ')}`, 'warn');
    }
  }

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 获取执行质量报告
   * Get execution quality report
   *
   * @param {Object} options - 选项 / Options
   * @returns {Object} 质量报告 / Quality report
   */
  getReport(options = {}) {
    const { symbol, exchange, accountId, timeRange } = options;

    let records = [...this.executionRecords];

    // 按交易对过滤 / Filter by symbol
    if (symbol) {
      records = records.filter(r => r.symbol === symbol);
    }

    // 按交易所过滤 / Filter by exchange
    if (exchange) {
      records = records.filter(r => r.exchange === exchange);
    }

    // 按账户过滤 / Filter by account
    if (accountId) {
      records = records.filter(r => r.accountId === accountId);
    }

    // 按时间范围过滤 / Filter by time range
    if (timeRange) {
      const cutoffTime = Date.now() - timeRange;
      records = records.filter(r => r.timestamp >= cutoffTime);
    }

    const aggregated = this._aggregateRecords(records);

    return {
      timestamp: Date.now(),
      filters: { symbol, exchange, accountId, timeRange },
      summary: aggregated,
      recentRecords: records.slice(-20),
      activeOrders: this.activeOrders.size,
    };
  }

  /**
   * 获取交易对统计
   * Get symbol statistics
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 统计数据 / Statistics
   */
  getSymbolStats(symbol) {
    const stats = this.symbolStats.get(symbol);
    if (!stats) {
      return { error: '无该交易对数据 / No data for this symbol' };
    }

    return {
      symbol,
      slippage: this._calculateArrayStats(stats.slippages.map(s => s.value)),
      executionTime: this._calculateArrayStats(stats.executionTimes.map(t => t.value)),
      fillRate: this._calculateArrayStats(stats.fillRates.map(f => f.value)),
      totalOrders: stats.totalOrders,
      filledOrders: stats.filledOrders,
      cancelledOrders: stats.cancelledOrders,
      totalVolume: stats.totalVolume,
      totalFees: stats.totalFees,
    };
  }

  /**
   * 获取交易所统计
   * Get exchange statistics
   *
   * @param {string} exchange - 交易所 / Exchange
   * @returns {Object} 统计数据 / Statistics
   */
  getExchangeStats(exchange) {
    const stats = this.exchangeStats.get(exchange);
    if (!stats) {
      return { error: '无该交易所数据 / No data for this exchange' };
    }

    return {
      exchange,
      slippage: this._calculateArrayStats(stats.slippages.map(s => s.value)),
      executionTime: this._calculateArrayStats(stats.executionTimes.map(t => t.value)),
      fillRate: this._calculateArrayStats(stats.fillRates.map(f => f.value)),
      totalOrders: stats.totalOrders,
      filledOrders: stats.filledOrders,
      cancelledOrders: stats.cancelledOrders,
      totalVolume: stats.totalVolume,
      totalFees: stats.totalFees,
    };
  }

  /**
   * 获取汇总统计
   * Get aggregated statistics
   *
   * @returns {Object} 汇总统计 / Aggregated statistics
   */
  getAggregatedStats() {
    return {
      ...this.aggregatedStats,
      timestamp: Date.now(),
    };
  }

  /**
   * 获取异常列表
   * Get anomaly list
   *
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 异常列表 / Anomaly list
   */
  getAnomalies(limit = 50) {
    return this.anomalies.slice(-limit);
  }

  /**
   * 获取状态
   * Get status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    return {
      running: this.running,
      activeOrders: this.activeOrders.size,
      totalRecords: this.executionRecords.length,
      symbolCount: this.symbolStats.size,
      exchangeCount: this.exchangeStats.size,
      accountCount: this.accountStats.size,
      anomalyCount: this.anomalies.length,
      lastAggregation: this.aggregatedStats.total.count,
    };
  }

  /**
   * 清除历史数据
   * Clear historical data
   */
  clearHistory() {
    this.executionRecords = [];
    this.symbolStats.clear();
    this.exchangeStats.clear();
    this.accountStats.clear();
    this.anomalies = [];
    this.aggregatedStats = {
      total: this._createEmptyStats(),
      lastHour: this._createEmptyStats(),
      last24Hours: this._createEmptyStats(),
    };

    this.log('历史数据已清除 / Historical data cleared', 'info');
  }

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') {
    if (!this.config.verbose && level === 'info') return;

    const fullMessage = `${this.config.logPrefix} ${message}`;

    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'info':
      default:
        console.log(fullMessage);
        break;
    }
  }
}

// ============================================
// 导出 / Exports
// ============================================

export { EXECUTION_QUALITY, SLIPPAGE_TYPE, ORDER_STATUS, DEFAULT_CONFIG };
export default ExecutionQualityMonitor;
