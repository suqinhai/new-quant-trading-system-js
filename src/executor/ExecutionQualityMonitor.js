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

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 执行质量级别
 * Execution quality level
 */
const EXECUTION_QUALITY = { // 定义常量 EXECUTION_QUALITY
  EXCELLENT: 'excellent',   // 优秀 / Excellent
  GOOD: 'good',             // 良好 / Good
  AVERAGE: 'average',       // 一般 / Average
  POOR: 'poor',             // 较差 / Poor
  CRITICAL: 'critical',     // 严重 / Critical
}; // 结束代码块

/**
 * 滑点类型
 * Slippage type
 */
const SLIPPAGE_TYPE = { // 定义常量 SLIPPAGE_TYPE
  POSITIVE: 'positive',     // 正滑点(有利) / Positive (favorable)
  ZERO: 'zero',             // 零滑点 / Zero
  NEGATIVE: 'negative',     // 负滑点(不利) / Negative (unfavorable)
}; // 结束代码块

/**
 * 订单状态
 * Order status
 */
const ORDER_STATUS = { // 定义常量 ORDER_STATUS
  PENDING: 'pending',       // 待成交 / Pending
  PARTIAL: 'partial',       // 部分成交 / Partial fill
  FILLED: 'filled',         // 完全成交 / Filled
  CANCELLED: 'cancelled',   // 已取消 / Cancelled
  REJECTED: 'rejected',     // 被拒绝 / Rejected
  EXPIRED: 'expired',       // 已过期 / Expired
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // ============================================
  // 滑点阈值 / Slippage Thresholds
  // ============================================

  // 滑点警告阈值 / Slippage warning threshold
  slippageWarningThreshold: 0.002,    // 滑点警告阈值

  // 滑点严重阈值 / Slippage critical threshold
  slippageCriticalThreshold: 0.005,   // 滑点严重阈值

  // 滑点异常阈值 / Slippage anomaly threshold
  slippageAnomalyThreshold: 0.01,     // 滑点异常阈值

  // ============================================
  // 执行时间阈值 / Execution Time Thresholds
  // ============================================

  // 执行时间警告阈值 (毫秒) / Execution time warning threshold (ms)
  executionTimeWarning: 5000,         // 执行时间警告阈值 (毫秒)

  // 执行时间严重阈值 (毫秒) / Execution time critical threshold (ms)
  executionTimeCritical: 15000,       // 执行时间严重阈值 (毫秒)

  // 执行时间异常阈值 (毫秒) / Execution time anomaly threshold (ms)
  executionTimeAnomaly: 60000,        // 执行时间异常阈值 (毫秒)

  // ============================================
  // 成交率阈值 / Fill Rate Thresholds
  // ============================================

  // 成交率警告阈值 / Fill rate warning threshold
  fillRateWarning: 0.8,               // 成交率警告阈值

  // 成交率严重阈值 / Fill rate critical threshold
  fillRateCritical: 0.5,              // 成交率严重阈值

  // ============================================
  // 统计配置 / Statistics Configuration
  // ============================================

  // 统计窗口大小 / Statistics window size
  statisticsWindowSize: 1000, // statistics窗口大小

  // 滚动窗口时间 (毫秒) / Rolling window time (ms)
  rollingWindowTime: 24 * 60 * 60 * 1000, // 滚动窗口时间 (毫秒)

  // 短期窗口时间 (毫秒) / Short-term window time (ms)
  shortTermWindowTime: 60 * 60 * 1000,    // 短期窗口时间 (毫秒)

  // 汇总间隔 (毫秒) / Aggregation interval (ms)
  aggregationInterval: 60 * 1000,          // 汇总间隔 (毫秒)

  // ============================================
  // 监控配置 / Monitoring Configuration
  // ============================================

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志

  // 日志前缀 / Log prefix
  logPrefix: '[ExecutionQuality]', // 日志前缀

  // 是否启用异常检测 / Enable anomaly detection
  enableAnomalyDetection: true, // 是否启用异常检测

  // 异常检测敏感度 (标准差倍数) / Anomaly detection sensitivity (std dev multiplier)
  anomalySensitivity: 3.0, // 异常检测敏感度 (标准差倍数)
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 订单执行质量监控器
 * Order Execution Quality Monitor
 */
export class ExecutionQualityMonitor extends EventEmitter { // 导出类 ExecutionQualityMonitor
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 合并配置 / Merge configuration
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 执行记录 / Execution records
    // 格式: [{ orderId, symbol, side, expectedPrice, actualPrice, slippage, ... }]
    this.executionRecords = []; // 设置 executionRecords

    // 按交易对统计 / Statistics by symbol
    // 格式: { symbol: { slippages: [], times: [], fillRates: [], ... } }
    this.symbolStats = new Map(); // 设置 symbolStats

    // 按交易所统计 / Statistics by exchange
    // 格式: { exchange: { slippages: [], times: [], fillRates: [], ... } }
    this.exchangeStats = new Map(); // 设置 exchangeStats

    // 按账户统计 / Statistics by account
    // 格式: { accountId: { slippages: [], times: [], fillRates: [], ... } }
    this.accountStats = new Map(); // 设置 accountStats

    // 活跃订单追踪 / Active order tracking
    // 格式: { orderId: { startTime, expectedPrice, symbol, ... } }
    this.activeOrders = new Map(); // 设置 activeOrders

    // 汇总统计 / Aggregated statistics
    this.aggregatedStats = { // 设置 aggregatedStats
      total: this._createEmptyStats(), // 总
      lastHour: this._createEmptyStats(), // last小时
      last24Hours: this._createEmptyStats(), // last24小时
    }; // 结束代码块

    // 异常记录 / Anomaly records
    this.anomalies = []; // 设置 anomalies

    // 运行状态 / Running state
    this.running = false; // 设置 running

    // 定时器 / Timers
    this.aggregationTimer = null; // 设置 aggregationTimer
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 启动
   * Start
   */
  start() { // 调用 start
    if (this.running) return; // 条件判断 this.running

    this.running = true; // 设置 running

    // 启动定时汇总 / Start periodic aggregation
    this.aggregationTimer = setInterval( // 设置 aggregationTimer
      () => this._performAggregation(), // 定义箭头函数
      this.config.aggregationInterval // 访问 config
    ); // 结束调用或参数

    this.log('执行质量监控器已启动 / Execution quality monitor started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止
   * Stop
   */
  stop() { // 调用 stop
    if (!this.running) return; // 条件判断 !this.running

    this.running = false; // 设置 running

    if (this.aggregationTimer) { // 条件判断 this.aggregationTimer
      clearInterval(this.aggregationTimer); // 调用 clearInterval
      this.aggregationTimer = null; // 设置 aggregationTimer
    } // 结束代码块

    this.log('执行质量监控器已停止 / Execution quality monitor stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 订单追踪 / Order Tracking
  // ============================================

  /**
   * 开始追踪订单
   * Start tracking order
   *
   * @param {Object} order - 订单信息 / Order info
   */
  startTracking(order) { // 调用 startTracking
    const { // 解构赋值
      orderId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句
      type, // 执行语句
      expectedPrice, // 执行语句
      amount, // 执行语句
      exchange, // 执行语句
      accountId, // 执行语句
    } = order; // 执行语句

    const tracking = { // 定义常量 tracking
      orderId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句
      type: type || 'limit', // 类型
      expectedPrice, // 执行语句
      amount, // 执行语句
      exchange: exchange || 'unknown', // 交易所
      accountId: accountId || 'default', // 账户ID
      startTime: Date.now(), // 启动时间
      lastUpdateTime: Date.now(), // last更新时间
      filledAmount: 0, // filled数量
      filledValue: 0, // filledValue
      fills: [], // fills
      status: ORDER_STATUS.PENDING, // 状态
    }; // 结束代码块

    this.activeOrders.set(orderId, tracking); // 访问 activeOrders

    this.log(`开始追踪订单: ${orderId} ${symbol} ${side}`, 'info'); // 调用 log
  } // 结束代码块

  /**
   * 更新订单成交
   * Update order fill
   *
   * @param {string} orderId - 订单ID / Order ID
   * @param {Object} fill - 成交信息 / Fill info
   */
  updateFill(orderId, fill) { // 调用 updateFill
    const tracking = this.activeOrders.get(orderId); // 定义常量 tracking
    if (!tracking) { // 条件判断 !tracking
      this.log(`未找到订单追踪: ${orderId}`, 'warn'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    const { price, amount, timestamp, fee } = fill; // 解构赋值
    const fillTime = timestamp || Date.now(); // 定义常量 fillTime

    // 记录成交 / Record fill
    tracking.fills.push({ // 调用 tracking.fills.push
      price, // 执行语句
      amount, // 执行语句
      timestamp: fillTime, // 时间戳
      fee: fee || 0, // 手续费
      latency: fillTime - tracking.startTime, // latency
    }); // 结束代码块

    // 更新累计 / Update cumulative
    tracking.filledAmount += amount; // 执行语句
    tracking.filledValue += price * amount; // 执行语句
    tracking.lastUpdateTime = fillTime; // 赋值 tracking.lastUpdateTime

    // 更新状态 / Update status
    if (tracking.filledAmount >= tracking.amount * 0.9999) { // 条件判断 tracking.filledAmount >= tracking.amount * 0....
      tracking.status = ORDER_STATUS.FILLED; // 赋值 tracking.status
    } else if (tracking.filledAmount > 0) { // 执行语句
      tracking.status = ORDER_STATUS.PARTIAL; // 赋值 tracking.status
    } // 结束代码块

    this.log(`订单成交更新: ${orderId} 成交 ${amount} @ ${price}`, 'info'); // 调用 log
  } // 结束代码块

  /**
   * 完成订单追踪
   * Complete order tracking
   *
   * @param {string} orderId - 订单ID / Order ID
   * @param {Object} result - 最终结果 / Final result
   */
  completeTracking(orderId, result = {}) { // 调用 completeTracking
    const tracking = this.activeOrders.get(orderId); // 定义常量 tracking
    if (!tracking) { // 条件判断 !tracking
      this.log(`未找到订单追踪: ${orderId}`, 'warn'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    const endTime = result.timestamp || Date.now(); // 定义常量 endTime
    const finalStatus = result.status || (tracking.filledAmount > 0 ? ORDER_STATUS.FILLED : ORDER_STATUS.CANCELLED); // 定义常量 finalStatus

    // 计算执行质量指标 / Calculate execution quality metrics
    const executionRecord = this._calculateExecutionMetrics(tracking, endTime, finalStatus); // 定义常量 executionRecord

    // 保存记录 / Save record
    this._saveExecutionRecord(executionRecord); // 调用 _saveExecutionRecord

    // 检测异常 / Detect anomalies
    if (this.config.enableAnomalyDetection) { // 条件判断 this.config.enableAnomalyDetection
      this._detectAnomalies(executionRecord); // 调用 _detectAnomalies
    } // 结束代码块

    // 移除活跃订单 / Remove from active orders
    this.activeOrders.delete(orderId); // 访问 activeOrders

    this.log(`订单追踪完成: ${orderId} 状态=${finalStatus}`, 'info'); // 调用 log

    // 发出完成事件 / Emit completion event
    this.emit('executionComplete', executionRecord); // 调用 emit

    return executionRecord; // 返回结果
  } // 结束代码块

  /**
   * 取消订单追踪
   * Cancel order tracking
   *
   * @param {string} orderId - 订单ID / Order ID
   * @param {string} reason - 原因 / Reason
   */
  cancelTracking(orderId, reason = '') { // 调用 cancelTracking
    return this.completeTracking(orderId, { // 返回结果
      status: ORDER_STATUS.CANCELLED, // 状态
      reason, // 执行语句
    }); // 结束代码块
  } // 结束代码块

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
  _calculateExecutionMetrics(tracking, endTime, finalStatus) { // 调用 _calculateExecutionMetrics
    const { // 解构赋值
      orderId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句
      type, // 执行语句
      expectedPrice, // 执行语句
      amount, // 执行语句
      exchange, // 执行语句
      accountId, // 执行语句
      startTime, // 执行语句
      filledAmount, // 执行语句
      filledValue, // 执行语句
      fills, // 执行语句
    } = tracking; // 执行语句

    // 计算平均成交价 / Calculate average fill price
    const avgFillPrice = filledAmount > 0 ? filledValue / filledAmount : 0; // 定义常量 avgFillPrice

    // 计算滑点 / Calculate slippage
    let slippage = 0; // 定义变量 slippage
    let slippageType = SLIPPAGE_TYPE.ZERO; // 定义变量 slippageType

    if (expectedPrice > 0 && avgFillPrice > 0) { // 条件判断 expectedPrice > 0 && avgFillPrice > 0
      if (side === 'buy') { // 条件判断 side === 'buy'
        // 买入: 实际价格 > 预期价格 = 负滑点
        slippage = (avgFillPrice - expectedPrice) / expectedPrice; // 赋值 slippage
        slippageType = slippage > 0.0001 ? SLIPPAGE_TYPE.NEGATIVE : // 赋值 slippageType
                       slippage < -0.0001 ? SLIPPAGE_TYPE.POSITIVE : // 执行语句
                       SLIPPAGE_TYPE.ZERO; // 执行语句
      } else { // 执行语句
        // 卖出: 实际价格 < 预期价格 = 负滑点
        slippage = (expectedPrice - avgFillPrice) / expectedPrice; // 赋值 slippage
        slippageType = slippage > 0.0001 ? SLIPPAGE_TYPE.NEGATIVE : // 赋值 slippageType
                       slippage < -0.0001 ? SLIPPAGE_TYPE.POSITIVE : // 执行语句
                       SLIPPAGE_TYPE.ZERO; // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 计算执行时间 / Calculate execution time
    const executionTime = endTime - startTime; // 定义常量 executionTime

    // 计算成交率 / Calculate fill rate
    const fillRate = amount > 0 ? filledAmount / amount : 0; // 定义常量 fillRate

    // 计算首次成交时间 / Calculate time to first fill
    const timeToFirstFill = fills.length > 0 ? fills[0].timestamp - startTime : null; // 定义常量 timeToFirstFill

    // 计算成交次数 / Fill count
    const fillCount = fills.length; // 定义常量 fillCount

    // 计算平均成交延迟 / Calculate average fill latency
    const avgFillLatency = fills.length > 0 // 定义常量 avgFillLatency
      ? fills.reduce((sum, f) => sum + f.latency, 0) / fills.length // 定义箭头函数
      : null; // 执行语句

    // 计算总手续费 / Calculate total fees
    const totalFees = fills.reduce((sum, f) => sum + (f.fee || 0), 0); // 定义函数 totalFees

    // 确定执行质量 / Determine execution quality
    const quality = this._determineQuality(slippage, executionTime, fillRate); // 定义常量 quality

    return { // 返回结果
      orderId, // 执行语句
      symbol, // 执行语句
      side, // 执行语句
      type, // 执行语句
      exchange, // 执行语句
      accountId, // 执行语句
      expectedPrice, // 执行语句
      avgFillPrice, // 执行语句
      slippage, // 执行语句
      slippageType, // 执行语句
      slippagePercent: slippage * 100, // 滑点百分比
      amount, // 执行语句
      filledAmount, // 执行语句
      fillRate, // 执行语句
      executionTime, // 执行语句
      timeToFirstFill, // 执行语句
      fillCount, // 执行语句
      avgFillLatency, // 执行语句
      totalFees, // 执行语句
      status: finalStatus, // 状态
      quality, // 执行语句
      startTime, // 执行语句
      endTime, // 执行语句
      fills, // 执行语句
      timestamp: Date.now(), // 时间戳
    }; // 结束代码块
  } // 结束代码块

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
  _determineQuality(slippage, executionTime, fillRate) { // 调用 _determineQuality
    const absSlippage = Math.abs(slippage); // 定义常量 absSlippage

    // 检查严重问题 / Check critical issues
    if (absSlippage >= this.config.slippageAnomalyThreshold || // 条件判断 absSlippage >= this.config.slippageAnomalyThr...
        executionTime >= this.config.executionTimeAnomaly || // 执行语句
        fillRate < this.config.fillRateCritical) { // 执行语句
      return EXECUTION_QUALITY.CRITICAL; // 返回结果
    } // 结束代码块

    // 检查较差情况 / Check poor conditions
    if (absSlippage >= this.config.slippageCriticalThreshold || // 条件判断 absSlippage >= this.config.slippageCriticalTh...
        executionTime >= this.config.executionTimeCritical) { // 执行语句
      return EXECUTION_QUALITY.POOR; // 返回结果
    } // 结束代码块

    // 检查一般情况 / Check average conditions
    if (absSlippage >= this.config.slippageWarningThreshold || // 条件判断 absSlippage >= this.config.slippageWarningThr...
        executionTime >= this.config.executionTimeWarning || // 执行语句
        fillRate < this.config.fillRateWarning) { // 执行语句
      return EXECUTION_QUALITY.AVERAGE; // 返回结果
    } // 结束代码块

    // 检查良好情况 / Check good conditions
    if (absSlippage < this.config.slippageWarningThreshold * 0.5 && // 条件判断 absSlippage < this.config.slippageWarningThre...
        executionTime < this.config.executionTimeWarning * 0.5 && // 执行语句
        fillRate > 0.95) { // 执行语句
      return EXECUTION_QUALITY.EXCELLENT; // 返回结果
    } // 结束代码块

    return EXECUTION_QUALITY.GOOD; // 返回结果
  } // 结束代码块

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
  _saveExecutionRecord(record) { // 调用 _saveExecutionRecord
    // 添加到总记录 / Add to total records
    this.executionRecords.push(record); // 访问 executionRecords

    // 限制记录数量 / Limit record count
    if (this.executionRecords.length > this.config.statisticsWindowSize) { // 条件判断 this.executionRecords.length > this.config.st...
      this.executionRecords.shift(); // 访问 executionRecords
    } // 结束代码块

    // 更新按交易对统计 / Update symbol stats
    this._updateStats(this.symbolStats, record.symbol, record); // 调用 _updateStats

    // 更新按交易所统计 / Update exchange stats
    this._updateStats(this.exchangeStats, record.exchange, record); // 调用 _updateStats

    // 更新按账户统计 / Update account stats
    this._updateStats(this.accountStats, record.accountId, record); // 调用 _updateStats
  } // 结束代码块

  /**
   * 更新统计数据
   * Update statistics
   *
   * @param {Map} statsMap - 统计Map / Statistics map
   * @param {string} key - 键 / Key
   * @param {Object} record - 执行记录 / Execution record
   * @private
   */
  _updateStats(statsMap, key, record) { // 调用 _updateStats
    if (!statsMap.has(key)) { // 条件判断 !statsMap.has(key)
      statsMap.set(key, this._createEmptyStats()); // 调用 statsMap.set
    } // 结束代码块

    const stats = statsMap.get(key); // 定义常量 stats

    // 添加滑点数据 / Add slippage data
    stats.slippages.push({ // 调用 stats.slippages.push
      value: record.slippage, // value
      timestamp: record.timestamp, // 时间戳
    }); // 结束代码块

    // 添加执行时间数据 / Add execution time data
    stats.executionTimes.push({ // 调用 stats.executionTimes.push
      value: record.executionTime, // value
      timestamp: record.timestamp, // 时间戳
    }); // 结束代码块

    // 添加成交率数据 / Add fill rate data
    stats.fillRates.push({ // 调用 stats.fillRates.push
      value: record.fillRate, // value
      timestamp: record.timestamp, // 时间戳
    }); // 结束代码块

    // 更新计数 / Update counts
    stats.totalOrders++; // 执行语句
    stats.totalVolume += record.filledAmount; // 执行语句
    stats.totalFees += record.totalFees; // 执行语句

    if (record.status === ORDER_STATUS.FILLED) { // 条件判断 record.status === ORDER_STATUS.FILLED
      stats.filledOrders++; // 执行语句
    } else if (record.status === ORDER_STATUS.CANCELLED) { // 执行语句
      stats.cancelledOrders++; // 执行语句
    } // 结束代码块

    // 清理过期数据 / Clean expired data
    this._cleanExpiredData(stats); // 调用 _cleanExpiredData
  } // 结束代码块

  /**
   * 创建空统计对象
   * Create empty stats object
   *
   * @returns {Object} 空统计对象 / Empty stats object
   * @private
   */
  _createEmptyStats() { // 调用 _createEmptyStats
    return { // 返回结果
      slippages: [], // slippages
      executionTimes: [], // executionTimes
      fillRates: [], // fillRates
      totalOrders: 0, // 总订单
      filledOrders: 0, // filled订单
      cancelledOrders: 0, // cancelled订单
      totalVolume: 0, // 总成交量
      totalFees: 0, // 总Fees
    }; // 结束代码块
  } // 结束代码块

  /**
   * 清理过期数据
   * Clean expired data
   *
   * @param {Object} stats - 统计对象 / Stats object
   * @private
   */
  _cleanExpiredData(stats) { // 调用 _cleanExpiredData
    const cutoffTime = Date.now() - this.config.rollingWindowTime; // 定义常量 cutoffTime

    stats.slippages = stats.slippages.filter(s => s.timestamp >= cutoffTime); // 赋值 stats.slippages
    stats.executionTimes = stats.executionTimes.filter(t => t.timestamp >= cutoffTime); // 赋值 stats.executionTimes
    stats.fillRates = stats.fillRates.filter(f => f.timestamp >= cutoffTime); // 赋值 stats.fillRates
  } // 结束代码块

  // ============================================
  // 统计汇总 / Statistics Aggregation
  // ============================================

  /**
   * 执行统计汇总
   * Perform statistics aggregation
   * @private
   */
  _performAggregation() { // 调用 _performAggregation
    const now = Date.now(); // 定义常量 now
    const hourAgo = now - this.config.shortTermWindowTime; // 定义常量 hourAgo
    const dayAgo = now - this.config.rollingWindowTime; // 定义常量 dayAgo

    // 汇总最近1小时 / Aggregate last hour
    this.aggregatedStats.lastHour = this._aggregateRecords( // 访问 aggregatedStats
      this.executionRecords.filter(r => r.timestamp >= hourAgo) // 访问 executionRecords
    ); // 结束调用或参数

    // 汇总最近24小时 / Aggregate last 24 hours
    this.aggregatedStats.last24Hours = this._aggregateRecords( // 访问 aggregatedStats
      this.executionRecords.filter(r => r.timestamp >= dayAgo) // 访问 executionRecords
    ); // 结束调用或参数

    // 汇总全部 / Aggregate all
    this.aggregatedStats.total = this._aggregateRecords(this.executionRecords); // 访问 aggregatedStats

    // 发出汇总事件 / Emit aggregation event
    this.emit('statsAggregated', this.aggregatedStats); // 调用 emit
  } // 结束代码块

  /**
   * 汇总记录
   * Aggregate records
   *
   * @param {Array} records - 执行记录 / Execution records
   * @returns {Object} 汇总结果 / Aggregation result
   * @private
   */
  _aggregateRecords(records) { // 调用 _aggregateRecords
    if (records.length === 0) { // 条件判断 records.length === 0
      return { // 返回结果
        count: 0, // 数量
        slippage: { avg: 0, min: 0, max: 0, std: 0, median: 0 }, // 滑点
        executionTime: { avg: 0, min: 0, max: 0, std: 0, median: 0 }, // execution时间
        fillRate: { avg: 0, min: 0, max: 0 }, // fill频率
        qualityDistribution: {}, // qualityDistribution
      }; // 结束代码块
    } // 结束代码块

    // 提取数据 / Extract data
    const slippages = records.map(r => r.slippage); // 定义函数 slippages
    const executionTimes = records.map(r => r.executionTime); // 定义函数 executionTimes
    const fillRates = records.map(r => r.fillRate); // 定义函数 fillRates

    // 计算滑点统计 / Calculate slippage stats
    const slippageStats = this._calculateArrayStats(slippages); // 定义常量 slippageStats

    // 计算执行时间统计 / Calculate execution time stats
    const executionTimeStats = this._calculateArrayStats(executionTimes); // 定义常量 executionTimeStats

    // 计算成交率统计 / Calculate fill rate stats
    const fillRateStats = { // 定义常量 fillRateStats
      avg: fillRates.reduce((a, b) => a + b, 0) / fillRates.length, // avg
      min: Math.min(...fillRates), // 最小
      max: Math.max(...fillRates), // 最大
    }; // 结束代码块

    // 计算质量分布 / Calculate quality distribution
    const qualityDistribution = {}; // 定义常量 qualityDistribution
    for (const record of records) { // 循环 const record of records
      qualityDistribution[record.quality] = (qualityDistribution[record.quality] || 0) + 1; // 执行语句
    } // 结束代码块

    // 计算滑点类型分布 / Calculate slippage type distribution
    const slippageTypeDistribution = {}; // 定义常量 slippageTypeDistribution
    for (const record of records) { // 循环 const record of records
      slippageTypeDistribution[record.slippageType] = (slippageTypeDistribution[record.slippageType] || 0) + 1; // 执行语句
    } // 结束代码块

    return { // 返回结果
      count: records.length, // 数量
      slippage: slippageStats, // 滑点
      executionTime: executionTimeStats, // execution时间
      fillRate: fillRateStats, // fill频率
      qualityDistribution, // 执行语句
      slippageTypeDistribution, // 执行语句
      totalVolume: records.reduce((sum, r) => sum + r.filledAmount, 0), // 总成交量
      totalFees: records.reduce((sum, r) => sum + r.totalFees, 0), // 总Fees
      avgFillCount: records.reduce((sum, r) => sum + r.fillCount, 0) / records.length, // avgFill数量
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算数组统计
   * Calculate array statistics
   *
   * @param {Array} arr - 数组 / Array
   * @returns {Object} 统计结果 / Statistics result
   * @private
   */
  _calculateArrayStats(arr) { // 调用 _calculateArrayStats
    if (arr.length === 0) { // 条件判断 arr.length === 0
      return { avg: 0, min: 0, max: 0, std: 0, median: 0 }; // 返回结果
    } // 结束代码块

    const sorted = [...arr].sort((a, b) => a - b); // 定义函数 sorted
    const sum = arr.reduce((a, b) => a + b, 0); // 定义函数 sum
    const avg = sum / arr.length; // 定义常量 avg

    // 计算标准差 / Calculate standard deviation
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std

    // 计算中位数 / Calculate median
    const mid = Math.floor(sorted.length / 2); // 定义常量 mid
    const median = sorted.length % 2 !== 0 // 定义常量 median
      ? sorted[mid] // 执行语句
      : (sorted[mid - 1] + sorted[mid]) / 2; // 执行语句

    return { // 返回结果
      avg, // 执行语句
      min: sorted[0], // 最小
      max: sorted[sorted.length - 1], // 最大
      std, // 执行语句
      median, // 执行语句
      p5: sorted[Math.floor(sorted.length * 0.05)] || sorted[0], // p5
      p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1], // p95
    }; // 结束代码块
  } // 结束代码块

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
  _detectAnomalies(record) { // 调用 _detectAnomalies
    const anomalies = []; // 定义常量 anomalies

    // 检查滑点异常 / Check slippage anomaly
    if (Math.abs(record.slippage) >= this.config.slippageAnomalyThreshold) { // 条件判断 Math.abs(record.slippage) >= this.config.slip...
      anomalies.push({ // 调用 anomalies.push
        type: 'slippage_anomaly', // 类型
        severity: 'critical', // severity
        message: `滑点异常: ${(record.slippage * 100).toFixed(3)}%`, // 消息
        value: record.slippage, // value
        threshold: this.config.slippageAnomalyThreshold, // 阈值
      }); // 结束代码块
    } else if (Math.abs(record.slippage) >= this.config.slippageCriticalThreshold) { // 执行语句
      anomalies.push({ // 调用 anomalies.push
        type: 'slippage_high', // 类型
        severity: 'warning', // severity
        message: `滑点较高: ${(record.slippage * 100).toFixed(3)}%`, // 消息
        value: record.slippage, // value
        threshold: this.config.slippageCriticalThreshold, // 阈值
      }); // 结束代码块
    } // 结束代码块

    // 检查执行时间异常 / Check execution time anomaly
    if (record.executionTime >= this.config.executionTimeAnomaly) { // 条件判断 record.executionTime >= this.config.execution...
      anomalies.push({ // 调用 anomalies.push
        type: 'execution_time_anomaly', // 类型
        severity: 'critical', // severity
        message: `执行时间异常: ${(record.executionTime / 1000).toFixed(1)}秒`, // 消息
        value: record.executionTime, // value
        threshold: this.config.executionTimeAnomaly, // 阈值
      }); // 结束代码块
    } else if (record.executionTime >= this.config.executionTimeCritical) { // 执行语句
      anomalies.push({ // 调用 anomalies.push
        type: 'execution_time_high', // 类型
        severity: 'warning', // severity
        message: `执行时间较长: ${(record.executionTime / 1000).toFixed(1)}秒`, // 消息
        value: record.executionTime, // value
        threshold: this.config.executionTimeCritical, // 阈值
      }); // 结束代码块
    } // 结束代码块

    // 检查成交率异常 / Check fill rate anomaly
    if (record.fillRate < this.config.fillRateCritical) { // 条件判断 record.fillRate < this.config.fillRateCritical
      anomalies.push({ // 调用 anomalies.push
        type: 'fill_rate_low', // 类型
        severity: 'critical', // severity
        message: `成交率过低: ${(record.fillRate * 100).toFixed(1)}%`, // 消息
        value: record.fillRate, // value
        threshold: this.config.fillRateCritical, // 阈值
      }); // 结束代码块
    } else if (record.fillRate < this.config.fillRateWarning) { // 执行语句
      anomalies.push({ // 调用 anomalies.push
        type: 'fill_rate_warning', // 类型
        severity: 'warning', // severity
        message: `成交率较低: ${(record.fillRate * 100).toFixed(1)}%`, // 消息
        value: record.fillRate, // value
        threshold: this.config.fillRateWarning, // 阈值
      }); // 结束代码块
    } // 结束代码块

    // 统计异常检测 - 使用历史数据 / Statistical anomaly detection using historical data
    if (this.executionRecords.length >= 30) { // 条件判断 this.executionRecords.length >= 30
      const historicalSlippages = this.executionRecords.slice(-100).map(r => r.slippage); // 定义函数 historicalSlippages
      const stats = this._calculateArrayStats(historicalSlippages); // 定义常量 stats

      // 检查是否超出N个标准差 / Check if exceeds N standard deviations
      if (stats.std > 0) { // 条件判断 stats.std > 0
        const zScore = (record.slippage - stats.avg) / stats.std; // 定义常量 zScore
        if (Math.abs(zScore) > this.config.anomalySensitivity) { // 条件判断 Math.abs(zScore) > this.config.anomalySensiti...
          anomalies.push({ // 调用 anomalies.push
            type: 'statistical_anomaly', // 类型
            severity: 'warning', // severity
            message: `滑点统计异常: Z-Score=${zScore.toFixed(2)}`, // 消息
            value: record.slippage, // value
            zScore, // 执行语句
            historicalAvg: stats.avg, // historicalAvg
            historicalStd: stats.std, // historical标准
          }); // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 记录并发出异常事件 / Record and emit anomaly events
    if (anomalies.length > 0) { // 条件判断 anomalies.length > 0
      const anomalyRecord = { // 定义常量 anomalyRecord
        orderId: record.orderId, // 订单ID
        symbol: record.symbol, // 交易对
        exchange: record.exchange, // 交易所
        anomalies, // 执行语句
        record, // 执行语句
        timestamp: Date.now(), // 时间戳
      }; // 结束代码块

      this.anomalies.push(anomalyRecord); // 访问 anomalies

      // 限制异常记录数量 / Limit anomaly record count
      if (this.anomalies.length > 500) { // 条件判断 this.anomalies.length > 500
        this.anomalies.shift(); // 访问 anomalies
      } // 结束代码块

      this.emit('anomalyDetected', anomalyRecord); // 调用 emit

      this.log(`检测到执行异常: ${record.orderId} - ${anomalies.map(a => a.message).join(', ')}`, 'warn'); // 调用 log
    } // 结束代码块
  } // 结束代码块

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
  getReport(options = {}) { // 调用 getReport
    const { symbol, exchange, accountId, timeRange } = options; // 解构赋值

    let records = [...this.executionRecords]; // 定义变量 records

    // 按交易对过滤 / Filter by symbol
    if (symbol) { // 条件判断 symbol
      records = records.filter(r => r.symbol === symbol); // 赋值 records
    } // 结束代码块

    // 按交易所过滤 / Filter by exchange
    if (exchange) { // 条件判断 exchange
      records = records.filter(r => r.exchange === exchange); // 赋值 records
    } // 结束代码块

    // 按账户过滤 / Filter by account
    if (accountId) { // 条件判断 accountId
      records = records.filter(r => r.accountId === accountId); // 赋值 records
    } // 结束代码块

    // 按时间范围过滤 / Filter by time range
    if (timeRange) { // 条件判断 timeRange
      const cutoffTime = Date.now() - timeRange; // 定义常量 cutoffTime
      records = records.filter(r => r.timestamp >= cutoffTime); // 赋值 records
    } // 结束代码块

    const aggregated = this._aggregateRecords(records); // 定义常量 aggregated

    return { // 返回结果
      timestamp: Date.now(), // 时间戳
      filters: { symbol, exchange, accountId, timeRange }, // filters
      summary: aggregated, // summary
      recentRecords: records.slice(-20), // recentRecords
      activeOrders: this.activeOrders.size, // 活跃订单
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取交易对统计
   * Get symbol statistics
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 统计数据 / Statistics
   */
  getSymbolStats(symbol) { // 调用 getSymbolStats
    const stats = this.symbolStats.get(symbol); // 定义常量 stats
    if (!stats) { // 条件判断 !stats
      return { error: '无该交易对数据 / No data for this symbol' }; // 返回结果
    } // 结束代码块

    return { // 返回结果
      symbol, // 执行语句
      slippage: this._calculateArrayStats(stats.slippages.map(s => s.value)), // 滑点
      executionTime: this._calculateArrayStats(stats.executionTimes.map(t => t.value)), // execution时间
      fillRate: this._calculateArrayStats(stats.fillRates.map(f => f.value)), // fill频率
      totalOrders: stats.totalOrders, // 总订单
      filledOrders: stats.filledOrders, // filled订单
      cancelledOrders: stats.cancelledOrders, // cancelled订单
      totalVolume: stats.totalVolume, // 总成交量
      totalFees: stats.totalFees, // 总Fees
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取交易所统计
   * Get exchange statistics
   *
   * @param {string} exchange - 交易所 / Exchange
   * @returns {Object} 统计数据 / Statistics
   */
  getExchangeStats(exchange) { // 调用 getExchangeStats
    const stats = this.exchangeStats.get(exchange); // 定义常量 stats
    if (!stats) { // 条件判断 !stats
      return { error: '无该交易所数据 / No data for this exchange' }; // 返回结果
    } // 结束代码块

    return { // 返回结果
      exchange, // 执行语句
      slippage: this._calculateArrayStats(stats.slippages.map(s => s.value)), // 滑点
      executionTime: this._calculateArrayStats(stats.executionTimes.map(t => t.value)), // execution时间
      fillRate: this._calculateArrayStats(stats.fillRates.map(f => f.value)), // fill频率
      totalOrders: stats.totalOrders, // 总订单
      filledOrders: stats.filledOrders, // filled订单
      cancelledOrders: stats.cancelledOrders, // cancelled订单
      totalVolume: stats.totalVolume, // 总成交量
      totalFees: stats.totalFees, // 总Fees
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取汇总统计
   * Get aggregated statistics
   *
   * @returns {Object} 汇总统计 / Aggregated statistics
   */
  getAggregatedStats() { // 调用 getAggregatedStats
    return { // 返回结果
      ...this.aggregatedStats, // 展开对象或数组
      timestamp: Date.now(), // 时间戳
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取异常列表
   * Get anomaly list
   *
   * @param {number} limit - 数量限制 / Limit
   * @returns {Array} 异常列表 / Anomaly list
   */
  getAnomalies(limit = 50) { // 调用 getAnomalies
    return this.anomalies.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取状态
   * Get status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      running: this.running, // running
      activeOrders: this.activeOrders.size, // 活跃订单
      totalRecords: this.executionRecords.length, // 总Records
      symbolCount: this.symbolStats.size, // 交易对数量
      exchangeCount: this.exchangeStats.size, // 交易所数量
      accountCount: this.accountStats.size, // 账户数量
      anomalyCount: this.anomalies.length, // anomaly数量
      lastAggregation: this.aggregatedStats.total.count, // lastAggregation
    }; // 结束代码块
  } // 结束代码块

  /**
   * 清除历史数据
   * Clear historical data
   */
  clearHistory() { // 调用 clearHistory
    this.executionRecords = []; // 设置 executionRecords
    this.symbolStats.clear(); // 访问 symbolStats
    this.exchangeStats.clear(); // 访问 exchangeStats
    this.accountStats.clear(); // 访问 accountStats
    this.anomalies = []; // 设置 anomalies
    this.aggregatedStats = { // 设置 aggregatedStats
      total: this._createEmptyStats(), // 总
      lastHour: this._createEmptyStats(), // last小时
      last24Hours: this._createEmptyStats(), // last24小时
    }; // 结束代码块

    this.log('历史数据已清除 / Historical data cleared', 'info'); // 调用 log
  } // 结束代码块

  /**
   * 日志输出
   * Log output
   *
   * @param {string} message - 消息 / Message
   * @param {string} level - 级别 / Level
   */
  log(message, level = 'info') { // 调用 log
    if (!this.config.verbose && level === 'info') return; // 条件判断 !this.config.verbose && level === 'info'

    const fullMessage = `${this.config.logPrefix} ${message}`; // 定义常量 fullMessage

    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'info': // 分支 'info'
      default: // 默认
        console.log(fullMessage); // 控制台输出
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { EXECUTION_QUALITY, SLIPPAGE_TYPE, ORDER_STATUS, DEFAULT_CONFIG }; // 导出命名成员
export default ExecutionQualityMonitor; // 默认导出
