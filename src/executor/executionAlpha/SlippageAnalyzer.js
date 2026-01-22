/**
 * 高滑点时段检测与规避器
 * High Slippage Period Detector & Avoider
 *
 * 功能 / Features:
 * 1. 识别高滑点时段 / Identify high slippage periods
 * 2. 历史滑点模式分析 / Historical slippage pattern analysis
 * 3. 实时滑点预警 / Real-time slippage alerts
 * 4. 执行时机优化建议 / Execution timing optimization
 * 5. 自动延迟执行 / Auto-delayed execution
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 滑点风险等级
 * Slippage risk levels
 */
export const SLIPPAGE_RISK = { // 导出常量 SLIPPAGE_RISK
  VERY_LOW: 'very_low',     // 非常低 / Very low
  LOW: 'low',               // 低 / Low
  MEDIUM: 'medium',         // 中等 / Medium
  HIGH: 'high',             // 高 / High
  VERY_HIGH: 'very_high',   // 非常高 / Very high
  EXTREME: 'extreme',       // 极端 / Extreme
}; // 结束代码块

/**
 * 时段类型
 * Period types
 */
export const PERIOD_TYPE = { // 导出常量 PERIOD_TYPE
  NORMAL: 'normal',                 // 正常时段 / Normal period
  HIGH_VOLATILITY: 'high_vol',      // 高波动时段 / High volatility period
  LOW_LIQUIDITY: 'low_liq',         // 低流动性时段 / Low liquidity period
  NEWS_EVENT: 'news',               // 新闻事件 / News event
  MARKET_OPEN: 'market_open',       // 开盘时段 / Market open
  MARKET_CLOSE: 'market_close',     // 市场平仓权限
  MAINTENANCE: 'maintenance',       // 维护时段 / Maintenance period
  FUNDING_RATE: 'funding',          // 资金费率结算 / Funding rate settlement
}; // 结束代码块

/**
 * 已知的高风险时段（UTC 时间）
 * Known high-risk periods (UTC time)
 */
export const KNOWN_HIGH_RISK_PERIODS = { // 导出常量 KNOWN_HIGH_RISK_PERIODS
  // 加密货币资金费率结算时间（每8小时）/ Crypto funding rate settlement times
  FUNDING_RATE_TIMES: [0, 8, 16],  // 加密货币资金费率结算时间（每8小时）/ Crypto funding rate settlement times

  // 资金费率前后的高风险窗口（分钟）/ High risk window around funding rate (minutes)
  FUNDING_RISK_WINDOW: 15, // 资金费率前后的高风险窗口（分钟）/ High risk window around funding rate (minutes)

  // 传统市场开盘时间（会影响加密市场）/ Traditional market open times
  MARKET_OPENS: { // 传统市场开盘时间（会影响加密市场）/ Traditional market open times
    US: { hour: 13, minute: 30 },   // US
    EU: { hour: 7, minute: 0 },     // EU
    ASIA: { hour: 0, minute: 0 },   // ASIA
  }, // 结束代码块

  // 开盘前后的高风险窗口（分钟）/ High risk window around market open (minutes)
  MARKET_OPEN_WINDOW: 30, // 开盘前后的高风险窗口（分钟）/ High risk window around market open (minutes)
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = { // 导出常量 DEFAULT_CONFIG
  // 滑点阈值定义 / Slippage threshold definitions
  slippageThresholds: { // 滑点阈值定义
    veryLow: 0.0005,    // very最低
    low: 0.001,         // 最低
    medium: 0.002,      // medium
    high: 0.005,        // 最高
    veryHigh: 0.01,     // very最高
    extreme: 0.02,      // 极端
  }, // 结束代码块

  // 历史数据保留时间（小时）/ Historical data retention (hours)
  historyRetentionHours: 168,  // 7 天 / 7 days

  // 统计窗口大小 / Statistics window size
  statisticsWindow: 100, // statistics窗口

  // 时间分析粒度（分钟）/ Time analysis granularity (minutes)
  timeGranularity: 15, // 时间分析粒度（分钟）/ Time analysis granularity (minutes)

  // 高风险时段执行延迟（毫秒）/ High risk period execution delay (ms)
  highRiskDelay: 30000, // 高风险时段执行延迟（毫秒）/ High risk period execution delay (ms)

  // 是否启用自动延迟 / Enable auto delay
  enableAutoDelay: true, // 是否启用自动延迟

  // 警告回调间隔（毫秒）/ Warning callback interval (ms)
  warningInterval: 5000, // 警告回调间隔（毫秒）/ Warning callback interval (ms)

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 是否启用详细日志
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 滑点分析器
 * Slippage Analyzer
 */
export class SlippageAnalyzer extends EventEmitter { // 导出类 SlippageAnalyzer
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 合并配置 / Merge config
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 历史滑点数据 / Historical slippage data
    // 格式: { symbol: [{ timestamp, slippage, side, size, spread, volatility }] }
    this.slippageHistory = new Map(); // 设置 slippageHistory

    // 时段统计 / Period statistics
    // 格式: { symbol: { hourMinute: { avgSlippage, count, maxSlippage, minSlippage } } }
    this.periodStats = new Map(); // 设置 periodStats

    // 实时滑点监控 / Real-time slippage monitoring
    // 格式: { symbol: { recentSlippages, currentRisk, trend } }
    this.realtimeMonitor = new Map(); // 设置 realtimeMonitor

    // 警告状态 / Warning states
    this.activeWarnings = new Map(); // 设置 activeWarnings

    // 延迟执行队列 / Delayed execution queue
    this.delayedExecutions = new Map(); // 设置 delayedExecutions

    // 全局统计 / Global statistics
    this.globalStats = { // 设置 globalStats
      totalRecords: 0, // 总Records
      avgSlippage: 0, // avg滑点
      maxSlippage: 0, // 最大滑点
      highRiskPeriodsDetected: 0, // 最高风险PeriodsDetected
      delayedExecutions: 0, // delayedExecutions
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 核心分析方法 / Core Analysis Methods
  // ============================================

  /**
   * 记录滑点数据
   * Record slippage data
   *
   * @param {Object} data - 滑点数据 / Slippage data
   */
  recordSlippage(data) { // 调用 recordSlippage
    const { // 解构赋值
      symbol, // 执行语句
      slippage,                // 滑点（正数表示不利滑点）/ Slippage (positive = unfavorable)
      side,                    // 买卖方向 / Side
      size,                    // 订单大小 / Order size
      expectedPrice,           // 预期价格 / Expected price
      actualPrice,             // 实际价格 / Actual price
      spread = 0,              // 当时的价差 / Spread at the time
      volatility = 0,          // 当时的波动率 / Volatility at the time
      orderType = 'market',    // 订单类型 / Order type
    } = data; // 执行语句

    const timestamp = Date.now(); // 定义常量 timestamp

    // 创建记录 / Create record
    const record = { // 定义常量 record
      timestamp, // 执行语句
      slippage: Math.abs(slippage), // 滑点
      isUnfavorable: slippage > 0, // 是否Unfavorable
      side, // 执行语句
      size, // 执行语句
      expectedPrice, // 执行语句
      actualPrice, // 执行语句
      spread, // 执行语句
      volatility, // 执行语句
      orderType, // 执行语句
      hour: new Date(timestamp).getUTCHours(), // 小时
      minute: new Date(timestamp).getUTCMinutes(), // 分钟
      dayOfWeek: new Date(timestamp).getUTCDay(), // 天Of周
    }; // 结束代码块

    // 添加到历史记录 / Add to history
    if (!this.slippageHistory.has(symbol)) { // 条件判断 !this.slippageHistory.has(symbol)
      this.slippageHistory.set(symbol, []); // 访问 slippageHistory
    } // 结束代码块
    this.slippageHistory.get(symbol).push(record); // 访问 slippageHistory

    // 更新时段统计 / Update period statistics
    this._updatePeriodStats(symbol, record); // 调用 _updatePeriodStats

    // 更新实时监控 / Update real-time monitoring
    this._updateRealtimeMonitor(symbol, record); // 调用 _updateRealtimeMonitor

    // 更新全局统计 / Update global statistics
    this.globalStats.totalRecords++; // 访问 globalStats
    this.globalStats.avgSlippage = ( // 访问 globalStats
      (this.globalStats.avgSlippage * (this.globalStats.totalRecords - 1) + Math.abs(slippage)) // 执行语句
      / this.globalStats.totalRecords // 执行语句
    ); // 结束调用或参数
    this.globalStats.maxSlippage = Math.max(this.globalStats.maxSlippage, Math.abs(slippage)); // 访问 globalStats

    // 清理过期数据 / Clean up expired data
    this._cleanupOldData(); // 调用 _cleanupOldData

    // 发出事件 / Emit event
    this.emit('slippageRecorded', { symbol, record }); // 调用 emit
  } // 结束代码块

  /**
   * 获取当前滑点风险
   * Get current slippage risk
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 风险评估 / Risk assessment
   */
  getCurrentRisk(symbol) { // 调用 getCurrentRisk
    const now = new Date(); // 定义常量 now
    const currentHour = now.getUTCHours(); // 定义常量 currentHour
    const currentMinute = now.getUTCMinutes(); // 定义常量 currentMinute

    // 获取历史时段数据 / Get historical period data
    const periodKey = this._getPeriodKey(currentHour, currentMinute); // 定义常量 periodKey
    const periodData = this.periodStats.get(symbol)?.get(periodKey); // 定义常量 periodData

    // 获取实时监控数据 / Get real-time monitoring data
    const realtimeData = this.realtimeMonitor.get(symbol); // 定义常量 realtimeData

    // 检查已知高风险时段 / Check known high-risk periods
    const knownRisks = this._checkKnownHighRiskPeriods(); // 定义常量 knownRisks

    // 综合评估 / Comprehensive assessment
    let riskLevel = SLIPPAGE_RISK.LOW; // 定义变量 riskLevel
    let riskScore = 0; // 定义变量 riskScore
    const riskFactors = []; // 定义常量 riskFactors

    // 1. 基于历史时段数据 / Based on historical period data
    if (periodData && periodData.count >= 10) { // 条件判断 periodData && periodData.count >= 10
      const avgSlippage = periodData.avgSlippage; // 定义常量 avgSlippage
      riskScore += this._slippageToScore(avgSlippage) * 0.3; // 执行语句
      if (avgSlippage > this.config.slippageThresholds.high) { // 条件判断 avgSlippage > this.config.slippageThresholds....
        riskFactors.push({ // 调用 riskFactors.push
          factor: 'historical_period', // factor
          avgSlippage, // 执行语句
          weight: 0.3, // weight
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 2. 基于实时监控 / Based on real-time monitoring
    if (realtimeData && realtimeData.recentSlippages.length >= 5) { // 条件判断 realtimeData && realtimeData.recentSlippages....
      const recentAvg = realtimeData.recentSlippages.reduce((a, b) => a + b, 0) // 定义函数 recentAvg
        / realtimeData.recentSlippages.length; // 执行语句
      riskScore += this._slippageToScore(recentAvg) * 0.4; // 执行语句
      if (recentAvg > this.config.slippageThresholds.medium) { // 条件判断 recentAvg > this.config.slippageThresholds.me...
        riskFactors.push({ // 调用 riskFactors.push
          factor: 'recent_slippage', // factor
          avgSlippage: recentAvg, // avg滑点
          weight: 0.4, // weight
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 3. 基于已知高风险时段 / Based on known high-risk periods
    if (knownRisks.length > 0) { // 条件判断 knownRisks.length > 0
      riskScore += 30 * 0.3;  // 已知风险时段加分 / Add score for known risk periods
      riskFactors.push(...knownRisks.map(risk => ({ // 调用 riskFactors.push
        factor: risk.type, // factor
        detail: risk.detail, // detail
        weight: 0.3, // weight
      }))); // 结束代码块
    } // 结束代码块

    // 计算最终风险等级 / Calculate final risk level
    riskLevel = this._scoreToRiskLevel(riskScore); // 赋值 riskLevel

    // 返回评估结果 / Return assessment result
    return { // 返回结果
      symbol, // 执行语句
      timestamp: now.getTime(), // 时间戳
      riskLevel, // 执行语句
      riskScore, // 执行语句
      riskFactors, // 执行语句
      historicalAvg: periodData?.avgSlippage || null, // historicalAvg
      recentAvg: realtimeData?.recentSlippages?.length > 0 // recentAvg
        ? realtimeData.recentSlippages.reduce((a, b) => a + b, 0) / realtimeData.recentSlippages.length // 定义箭头函数
        : null, // 执行语句
      recommendation: this._generateRecommendation(riskLevel, riskFactors), // recommendation
      knownRisks, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 检查是否应该延迟执行
   * Check if execution should be delayed
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} orderSize - 订单大小 / Order size
   * @returns {Object} 延迟建议 / Delay recommendation
   */
  shouldDelayExecution(symbol, orderSize) { // 调用 shouldDelayExecution
    const risk = this.getCurrentRisk(symbol); // 定义常量 risk

    // 如果不启用自动延迟 / If auto delay not enabled
    if (!this.config.enableAutoDelay) { // 条件判断 !this.config.enableAutoDelay
      return { // 返回结果
        shouldDelay: false, // 是否需要延迟
        risk, // 执行语句
      }; // 结束代码块
    } // 结束代码块

    // 判断是否需要延迟 / Determine if delay needed
    let shouldDelay = false; // 定义变量 shouldDelay
    let delayMs = 0; // 定义变量 delayMs
    let reason = null; // 定义变量 reason

    switch (risk.riskLevel) { // 分支选择 risk.riskLevel
      case SLIPPAGE_RISK.EXTREME: // 分支 SLIPPAGE_RISK.EXTREME
        shouldDelay = true; // 赋值 shouldDelay
        delayMs = this.config.highRiskDelay * 2; // 赋值 delayMs
        reason = '极端滑点风险 / Extreme slippage risk'; // 赋值 reason
        break; // 跳出循环或分支

      case SLIPPAGE_RISK.VERY_HIGH: // 分支 SLIPPAGE_RISK.VERY_HIGH
        shouldDelay = true; // 赋值 shouldDelay
        delayMs = this.config.highRiskDelay; // 赋值 delayMs
        reason = '非常高滑点风险 / Very high slippage risk'; // 赋值 reason
        break; // 跳出循环或分支

      case SLIPPAGE_RISK.HIGH: // 分支 SLIPPAGE_RISK.HIGH
        // 大订单才延迟 / Only delay for large orders
        // 这里需要知道订单大小相对于流动性的比例 / Need to know order size relative to liquidity
        if (risk.knownRisks.length > 0) { // 条件判断 risk.knownRisks.length > 0
          shouldDelay = true; // 赋值 shouldDelay
          delayMs = this.config.highRiskDelay / 2; // 赋值 delayMs
          reason = '已知高风险时段 / Known high-risk period'; // 赋值 reason
        } // 结束代码块
        break; // 跳出循环或分支

      default: // 默认
        shouldDelay = false; // 赋值 shouldDelay
    } // 结束代码块

    // 计算建议等待到的时间 / Calculate recommended wait time
    let recommendedExecutionTime = null; // 定义变量 recommendedExecutionTime
    if (shouldDelay) { // 条件判断 shouldDelay
      recommendedExecutionTime = new Date(Date.now() + delayMs); // 赋值 recommendedExecutionTime

      // 检查等待后是否会进入另一个高风险时段 / Check if waiting leads to another high-risk period
      const futureHour = recommendedExecutionTime.getUTCHours(); // 定义常量 futureHour
      const futureMinute = recommendedExecutionTime.getUTCMinutes(); // 定义常量 futureMinute
      const futureRisks = this._checkKnownHighRiskPeriods(futureHour, futureMinute); // 定义常量 futureRisks

      if (futureRisks.length > 0) { // 条件判断 futureRisks.length > 0
        // 需要更长的延迟 / Need longer delay
        delayMs = this._findNextSafeWindow(); // 赋值 delayMs
        recommendedExecutionTime = new Date(Date.now() + delayMs); // 赋值 recommendedExecutionTime
      } // 结束代码块
    } // 结束代码块

    return { // 返回结果
      shouldDelay, // 执行语句
      delayMs, // 执行语句
      reason, // 执行语句
      recommendedExecutionTime, // 执行语句
      risk, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取最佳执行时间
   * Get optimal execution time
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} options - 选项 / Options
   * @returns {Object} 最佳执行时间建议 / Optimal execution time recommendation
   */
  getOptimalExecutionTime(symbol, options = {}) { // 调用 getOptimalExecutionTime
    const { // 解构赋值
      withinHours = 1,        // 在多少小时内找到最佳时间 / Find best time within hours
      avoidKnownRisks = true, // 是否避开已知风险时段 / Avoid known risk periods
    } = options; // 执行语句

    const now = new Date(); // 定义常量 now
    const endTime = new Date(now.getTime() + withinHours * 60 * 60 * 1000); // 定义常量 endTime

    // 获取该交易对的时段统计 / Get period statistics for this symbol
    const symbolStats = this.periodStats.get(symbol); // 定义常量 symbolStats

    // 候选时间列表 / Candidate time list
    const candidates = []; // 定义常量 candidates

    // 按时间粒度扫描 / Scan by time granularity
    let scanTime = new Date(now); // 定义变量 scanTime
    while (scanTime < endTime) { // 循环条件 scanTime < endTime
      const hour = scanTime.getUTCHours(); // 定义常量 hour
      const minute = scanTime.getUTCMinutes(); // 定义常量 minute

      // 检查已知风险 / Check known risks
      const knownRisks = this._checkKnownHighRiskPeriods(hour, minute); // 定义常量 knownRisks

      if (avoidKnownRisks && knownRisks.length > 0) { // 条件判断 avoidKnownRisks && knownRisks.length > 0
        scanTime = new Date(scanTime.getTime() + this.config.timeGranularity * 60 * 1000); // 赋值 scanTime
        continue; // 继续下一轮循环
      } // 结束代码块

      // 获取历史滑点数据 / Get historical slippage data
      const periodKey = this._getPeriodKey(hour, minute); // 定义常量 periodKey
      const periodData = symbolStats?.get(periodKey); // 定义常量 periodData

      const score = periodData // 定义常量 score
        ? this._slippageToScore(periodData.avgSlippage) // 执行语句
        : 50;  // 无数据时默认中等风险 / Default medium risk if no data

      candidates.push({ // 调用 candidates.push
        time: new Date(scanTime), // 时间
        hour, // 执行语句
        minute, // 执行语句
        score, // 执行语句
        avgSlippage: periodData?.avgSlippage || null, // avg滑点
        sampleCount: periodData?.count || 0, // 采样数量
        knownRisks, // 执行语句
      }); // 结束代码块

      scanTime = new Date(scanTime.getTime() + this.config.timeGranularity * 60 * 1000); // 赋值 scanTime
    } // 结束代码块

    // 按得分排序（得分越低越好）/ Sort by score (lower is better)
    candidates.sort((a, b) => a.score - b.score); // 调用 candidates.sort

    // 返回最佳时间 / Return optimal time
    const optimal = candidates[0]; // 定义常量 optimal
    const alternatives = candidates.slice(1, 4); // 定义常量 alternatives

    return { // 返回结果
      symbol, // 执行语句
      optimalTime: optimal?.time || now, // optimal时间
      optimalScore: optimal?.score || 50, // optimal分数
      optimalAvgSlippage: optimal?.avgSlippage, // optimalAvg滑点
      sampleCount: optimal?.sampleCount || 0, // 采样数量
      alternatives: alternatives.map(c => ({ // alternatives
        time: c.time, // 时间
        score: c.score, // 分数
        avgSlippage: c.avgSlippage, // avg滑点
      })), // 结束代码块
      analysis: { // analysis
        scannedPeriods: candidates.length, // scannedPeriods
        withinHours, // 执行语句
        avoidedKnownRisks: avoidKnownRisks, // avoidedKnownRisks
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取时段滑点热力图数据
   * Get period slippage heatmap data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 热力图数据 / Heatmap data
   */
  getPeriodHeatmap(symbol) { // 调用 getPeriodHeatmap
    const symbolStats = this.periodStats.get(symbol); // 定义常量 symbolStats

    if (!symbolStats) { // 条件判断 !symbolStats
      return { // 返回结果
        symbol, // 执行语句
        hasData: false, // 是否有数据
        message: '没有足够的历史数据 / Insufficient historical data', // 消息
      }; // 结束代码块
    } // 结束代码块

    // 构建 24x4 矩阵（每小时分为4个15分钟段）/ Build 24x4 matrix
    const heatmap = []; // 定义常量 heatmap

    for (let hour = 0; hour < 24; hour++) { // 循环 let hour = 0; hour < 24; hour++
      const hourData = []; // 定义常量 hourData
      for (let quarter = 0; quarter < 4; quarter++) { // 循环 let quarter = 0; quarter < 4; quarter++
        const minute = quarter * 15; // 定义常量 minute
        const periodKey = this._getPeriodKey(hour, minute); // 定义常量 periodKey
        const data = symbolStats.get(periodKey); // 定义常量 data

        hourData.push({ // 调用 hourData.push
          hour, // 执行语句
          minute, // 执行语句
          avgSlippage: data?.avgSlippage || null, // avg滑点
          maxSlippage: data?.maxSlippage || null, // 最大滑点
          count: data?.count || 0, // 数量
          riskLevel: data // 风险级别
            ? this._scoreToRiskLevel(this._slippageToScore(data.avgSlippage)) // 执行语句
            : null, // 执行语句
        }); // 结束代码块
      } // 结束代码块
      heatmap.push(hourData); // 调用 heatmap.push
    } // 结束代码块

    // 计算高风险时段 / Calculate high-risk periods
    const highRiskPeriods = []; // 定义常量 highRiskPeriods
    heatmap.forEach((hourData, hour) => { // 调用 heatmap.forEach
      hourData.forEach(slot => { // 调用 hourData.forEach
        if (slot.riskLevel === SLIPPAGE_RISK.HIGH || // 条件判断 slot.riskLevel === SLIPPAGE_RISK.HIGH ||
            slot.riskLevel === SLIPPAGE_RISK.VERY_HIGH || // 赋值 slot.riskLevel
            slot.riskLevel === SLIPPAGE_RISK.EXTREME) { // 赋值 slot.riskLevel
          highRiskPeriods.push({ // 调用 highRiskPeriods.push
            hour, // 执行语句
            minute: slot.minute, // 分钟
            avgSlippage: slot.avgSlippage, // avg滑点
            riskLevel: slot.riskLevel, // 风险级别
          }); // 结束代码块
        } // 结束代码块
      }); // 结束代码块
    }); // 结束代码块

    return { // 返回结果
      symbol, // 执行语句
      hasData: true, // 是否有数据
      heatmap, // 执行语句
      highRiskPeriods, // 执行语句
      summary: { // summary
        totalSlots: 96,  // 总Slots
        slotsWithData: heatmap.flat().filter(s => s.count > 0).length, // slotsWith数据
        highRiskSlots: highRiskPeriods.length, // 最高风险Slots
        avgSlippage: this._calculateOverallAvg(symbolStats), // avg滑点
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 内部辅助方法 / Internal Helper Methods
  // ============================================

  /**
   * 更新时段统计
   * Update period statistics
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} record - 滑点记录 / Slippage record
   * @private
   */
  _updatePeriodStats(symbol, record) { // 调用 _updatePeriodStats
    if (!this.periodStats.has(symbol)) { // 条件判断 !this.periodStats.has(symbol)
      this.periodStats.set(symbol, new Map()); // 访问 periodStats
    } // 结束代码块

    const symbolStats = this.periodStats.get(symbol); // 定义常量 symbolStats
    const periodKey = this._getPeriodKey(record.hour, record.minute); // 定义常量 periodKey

    if (!symbolStats.has(periodKey)) { // 条件判断 !symbolStats.has(periodKey)
      symbolStats.set(periodKey, { // 调用 symbolStats.set
        avgSlippage: 0, // avg滑点
        maxSlippage: 0, // 最大滑点
        minSlippage: Infinity, // 最小滑点
        count: 0, // 数量
        totalSlippage: 0, // 总滑点
      }); // 结束代码块
    } // 结束代码块

    const data = symbolStats.get(periodKey); // 定义常量 data
    data.count++; // 执行语句
    data.totalSlippage += record.slippage; // 执行语句
    data.avgSlippage = data.totalSlippage / data.count; // 赋值 data.avgSlippage
    data.maxSlippage = Math.max(data.maxSlippage, record.slippage); // 赋值 data.maxSlippage
    data.minSlippage = Math.min(data.minSlippage, record.slippage); // 赋值 data.minSlippage
  } // 结束代码块

  /**
   * 更新实时监控
   * Update real-time monitoring
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} record - 滑点记录 / Slippage record
   * @private
   */
  _updateRealtimeMonitor(symbol, record) { // 调用 _updateRealtimeMonitor
    if (!this.realtimeMonitor.has(symbol)) { // 条件判断 !this.realtimeMonitor.has(symbol)
      this.realtimeMonitor.set(symbol, { // 访问 realtimeMonitor
        recentSlippages: [], // recentSlippages
        trend: 'stable', // trend
        lastUpdate: Date.now(), // last更新
      }); // 结束代码块
    } // 结束代码块

    const monitor = this.realtimeMonitor.get(symbol); // 定义常量 monitor
    monitor.recentSlippages.push(record.slippage); // 调用 monitor.recentSlippages.push

    // 保留最近 N 个 / Keep last N
    if (monitor.recentSlippages.length > this.config.statisticsWindow) { // 条件判断 monitor.recentSlippages.length > this.config....
      monitor.recentSlippages.shift(); // 调用 monitor.recentSlippages.shift
    } // 结束代码块

    // 计算趋势 / Calculate trend
    if (monitor.recentSlippages.length >= 10) { // 条件判断 monitor.recentSlippages.length >= 10
      const recent5 = monitor.recentSlippages.slice(-5); // 定义常量 recent5
      const previous5 = monitor.recentSlippages.slice(-10, -5); // 定义常量 previous5
      const recentAvg = recent5.reduce((a, b) => a + b, 0) / 5; // 定义函数 recentAvg
      const previousAvg = previous5.reduce((a, b) => a + b, 0) / 5; // 定义函数 previousAvg

      if (recentAvg > previousAvg * 1.2) { // 条件判断 recentAvg > previousAvg * 1.2
        monitor.trend = 'increasing'; // 赋值 monitor.trend
      } else if (recentAvg < previousAvg * 0.8) { // 执行语句
        monitor.trend = 'decreasing'; // 赋值 monitor.trend
      } else { // 执行语句
        monitor.trend = 'stable'; // 赋值 monitor.trend
      } // 结束代码块
    } // 结束代码块

    monitor.lastUpdate = Date.now(); // 赋值 monitor.lastUpdate

    // 检查是否需要发出警告 / Check if warning needed
    const currentRisk = this._scoreToRiskLevel( // 定义常量 currentRisk
      this._slippageToScore(record.slippage) // 调用 _slippageToScore
    ); // 结束调用或参数

    if (currentRisk === SLIPPAGE_RISK.HIGH || // 条件判断 currentRisk === SLIPPAGE_RISK.HIGH ||
        currentRisk === SLIPPAGE_RISK.VERY_HIGH || // 赋值 currentRisk
        currentRisk === SLIPPAGE_RISK.EXTREME) { // 赋值 currentRisk
      this._emitWarning(symbol, currentRisk, record); // 调用 _emitWarning
    } // 结束代码块
  } // 结束代码块

  /**
   * 检查已知高风险时段
   * Check known high-risk periods
   *
   * @param {number} hour - 小时 / Hour
   * @param {number} minute - 分钟 / Minute
   * @returns {Array} 风险列表 / Risk list
   * @private
   */
  _checkKnownHighRiskPeriods(hour = null, minute = null) { // 调用 _checkKnownHighRiskPeriods
    const now = new Date(); // 定义常量 now
    const checkHour = hour !== null ? hour : now.getUTCHours(); // 定义常量 checkHour
    const checkMinute = minute !== null ? minute : now.getUTCMinutes(); // 定义常量 checkMinute

    const risks = []; // 定义常量 risks

    // 检查资金费率结算时间 / Check funding rate settlement times
    for (const fundingHour of KNOWN_HIGH_RISK_PERIODS.FUNDING_RATE_TIMES) { // 循环 const fundingHour of KNOWN_HIGH_RISK_PERIODS....
      const minuteDiff = Math.abs( // 定义常量 minuteDiff
        (checkHour * 60 + checkMinute) - (fundingHour * 60) // 执行语句
      ); // 结束调用或参数

      if (minuteDiff <= KNOWN_HIGH_RISK_PERIODS.FUNDING_RISK_WINDOW || // 条件判断 minuteDiff <= KNOWN_HIGH_RISK_PERIODS.FUNDING...
          (1440 - minuteDiff) <= KNOWN_HIGH_RISK_PERIODS.FUNDING_RISK_WINDOW) { // 执行语句
        risks.push({ // 调用 risks.push
          type: PERIOD_TYPE.FUNDING_RATE, // 类型
          detail: `资金费率结算 ${fundingHour}:00 UTC / Funding rate settlement`, // detail
          severity: 'high', // severity
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 检查市场开盘时间 / Check market open times
    for (const [market, time] of Object.entries(KNOWN_HIGH_RISK_PERIODS.MARKET_OPENS)) { // 循环 const [market, time] of Object.entries(KNOWN_...
      const minuteDiff = Math.abs( // 定义常量 minuteDiff
        (checkHour * 60 + checkMinute) - (time.hour * 60 + time.minute) // 执行语句
      ); // 结束调用或参数

      if (minuteDiff <= KNOWN_HIGH_RISK_PERIODS.MARKET_OPEN_WINDOW) { // 条件判断 minuteDiff <= KNOWN_HIGH_RISK_PERIODS.MARKET_...
        risks.push({ // 调用 risks.push
          type: PERIOD_TYPE.MARKET_OPEN, // 类型
          detail: `${market} 市场开盘 / ${market} market open`, // detail
          severity: 'medium', // severity
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return risks; // 返回结果
  } // 结束代码块

  /**
   * 获取时段键
   * Get period key
   *
   * @param {number} hour - 小时 / Hour
   * @param {number} minute - 分钟 / Minute
   * @returns {string} 时段键 / Period key
   * @private
   */
  _getPeriodKey(hour, minute) { // 调用 _getPeriodKey
    // 按照时间粒度归类 / Classify by time granularity
    const roundedMinute = Math.floor(minute / this.config.timeGranularity) * // 定义常量 roundedMinute
      this.config.timeGranularity; // 访问 config
    return `${hour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}`; // 返回结果
  } // 结束代码块

  /**
   * 滑点转得分
   * Convert slippage to score
   *
   * @param {number} slippage - 滑点 / Slippage
   * @returns {number} 得分 (0-100) / Score (0-100)
   * @private
   */
  _slippageToScore(slippage) { // 调用 _slippageToScore
    const thresholds = this.config.slippageThresholds; // 定义常量 thresholds

    if (slippage <= thresholds.veryLow) return 10; // 条件判断 slippage <= thresholds.veryLow
    if (slippage <= thresholds.low) return 20; // 条件判断 slippage <= thresholds.low
    if (slippage <= thresholds.medium) return 40; // 条件判断 slippage <= thresholds.medium
    if (slippage <= thresholds.high) return 60; // 条件判断 slippage <= thresholds.high
    if (slippage <= thresholds.veryHigh) return 80; // 条件判断 slippage <= thresholds.veryHigh
    return 100; // 返回结果
  } // 结束代码块

  /**
   * 得分转风险等级
   * Convert score to risk level
   *
   * @param {number} score - 得分 / Score
   * @returns {string} 风险等级 / Risk level
   * @private
   */
  _scoreToRiskLevel(score) { // 调用 _scoreToRiskLevel
    if (score <= 15) return SLIPPAGE_RISK.VERY_LOW; // 条件判断 score <= 15
    if (score <= 30) return SLIPPAGE_RISK.LOW; // 条件判断 score <= 30
    if (score <= 50) return SLIPPAGE_RISK.MEDIUM; // 条件判断 score <= 50
    if (score <= 70) return SLIPPAGE_RISK.HIGH; // 条件判断 score <= 70
    if (score <= 85) return SLIPPAGE_RISK.VERY_HIGH; // 条件判断 score <= 85
    return SLIPPAGE_RISK.EXTREME; // 返回结果
  } // 结束代码块

  /**
   * 生成建议
   * Generate recommendation
   *
   * @param {string} riskLevel - 风险等级 / Risk level
   * @param {Array} riskFactors - 风险因素 / Risk factors
   * @returns {string} 建议 / Recommendation
   * @private
   */
  _generateRecommendation(riskLevel, riskFactors) { // 调用 _generateRecommendation
    switch (riskLevel) { // 分支选择 riskLevel
      case SLIPPAGE_RISK.EXTREME: // 分支 SLIPPAGE_RISK.EXTREME
        return '强烈建议延迟执行或使用限价单 / Strongly recommend delaying execution or using limit orders'; // 返回结果

      case SLIPPAGE_RISK.VERY_HIGH: // 分支 SLIPPAGE_RISK.VERY_HIGH
        return '建议等待滑点风险降低或拆分订单 / Recommend waiting for lower risk or splitting orders'; // 返回结果

      case SLIPPAGE_RISK.HIGH: // 分支 SLIPPAGE_RISK.HIGH
        return '建议使用 TWAP/VWAP 或冰山单执行 / Recommend TWAP/VWAP or iceberg execution'; // 返回结果

      case SLIPPAGE_RISK.MEDIUM: // 分支 SLIPPAGE_RISK.MEDIUM
        return '可正常执行，建议监控滑点 / Normal execution OK, recommend monitoring slippage'; // 返回结果

      case SLIPPAGE_RISK.LOW: // 分支 SLIPPAGE_RISK.LOW
      case SLIPPAGE_RISK.VERY_LOW: // 分支 SLIPPAGE_RISK.VERY_LOW
        return '良好的执行时机 / Good execution timing'; // 返回结果

      default: // 默认
        return '请根据具体情况决定 / Decide based on specific conditions'; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 查找下一个安全窗口
   * Find next safe window
   *
   * @returns {number} 等待时间（毫秒）/ Wait time (ms)
   * @private
   */
  _findNextSafeWindow() { // 调用 _findNextSafeWindow
    const now = new Date(); // 定义常量 now
    let checkTime = new Date(now); // 定义变量 checkTime
    let maxIterations = 24 * 4;  // 最多检查24小时 / Max check 24 hours

    while (maxIterations > 0) { // 循环条件 maxIterations > 0
      checkTime = new Date(checkTime.getTime() + 15 * 60 * 1000);  // 每次加15分钟 / Add 15 minutes each time

      const risks = this._checkKnownHighRiskPeriods( // 定义常量 risks
        checkTime.getUTCHours(), // 调用 checkTime.getUTCHours
        checkTime.getUTCMinutes() // 调用 checkTime.getUTCMinutes
      ); // 结束调用或参数

      if (risks.length === 0) { // 条件判断 risks.length === 0
        return checkTime.getTime() - now.getTime(); // 返回结果
      } // 结束代码块

      maxIterations--; // 执行语句
    } // 结束代码块

    // 如果找不到安全窗口，返回默认延迟 / If no safe window found, return default delay
    return this.config.highRiskDelay * 2; // 返回结果
  } // 结束代码块

  /**
   * 发出警告
   * Emit warning
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} riskLevel - 风险等级 / Risk level
   * @param {Object} record - 滑点记录 / Slippage record
   * @private
   */
  _emitWarning(symbol, riskLevel, record) { // 调用 _emitWarning
    // 检查是否在警告冷却期内 / Check if in warning cooldown
    const lastWarning = this.activeWarnings.get(symbol); // 定义常量 lastWarning
    if (lastWarning && Date.now() - lastWarning < this.config.warningInterval) { // 条件判断 lastWarning && Date.now() - lastWarning < thi...
      return; // 返回结果
    } // 结束代码块

    // 记录警告时间 / Record warning time
    this.activeWarnings.set(symbol, Date.now()); // 访问 activeWarnings

    // 更新统计 / Update stats
    this.globalStats.highRiskPeriodsDetected++; // 访问 globalStats

    // 发出警告事件 / Emit warning event
    this.emit('slippageWarning', { // 调用 emit
      symbol, // 执行语句
      riskLevel, // 执行语句
      slippage: record.slippage, // 滑点
      timestamp: record.timestamp, // 时间戳
      recommendation: this._generateRecommendation(riskLevel, []), // recommendation
    }); // 结束代码块

    // 记录日志 / Log
    this.log( // 调用 log
      `滑点警告: ${symbol} 风险等级 ${riskLevel}, 滑点 ${(record.slippage * 10000).toFixed(1)} bps / ` + // 执行语句
      `Slippage warning: ${symbol} risk ${riskLevel}`, // 执行语句
      'warn' // 执行语句
    ); // 结束调用或参数
  } // 结束代码块

  /**
   * 计算整体平均
   * Calculate overall average
   *
   * @param {Map} symbolStats - 交易对统计 / Symbol statistics
   * @returns {number} 平均滑点 / Average slippage
   * @private
   */
  _calculateOverallAvg(symbolStats) { // 调用 _calculateOverallAvg
    let totalSlippage = 0; // 定义变量 totalSlippage
    let totalCount = 0; // 定义变量 totalCount

    for (const data of symbolStats.values()) { // 循环 const data of symbolStats.values()
      totalSlippage += data.totalSlippage; // 执行语句
      totalCount += data.count; // 执行语句
    } // 结束代码块

    return totalCount > 0 ? totalSlippage / totalCount : 0; // 返回结果
  } // 结束代码块

  /**
   * 清理过期数据
   * Clean up old data
   *
   * @private
   */
  _cleanupOldData() { // 调用 _cleanupOldData
    const cutoffTime = Date.now() - this.config.historyRetentionHours * 60 * 60 * 1000; // 定义常量 cutoffTime

    for (const [symbol, history] of this.slippageHistory) { // 循环 const [symbol, history] of this.slippageHistory
      const filtered = history.filter(record => record.timestamp >= cutoffTime); // 定义函数 filtered
      this.slippageHistory.set(symbol, filtered); // 访问 slippageHistory
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 工具方法 / Utility Methods
  // ============================================

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      ...this.globalStats, // 展开对象或数组
      symbolsTracked: this.slippageHistory.size, // 交易对列表Tracked
      periodsCovered: Array.from(this.periodStats.values()) // periodsCovered
        .reduce((sum, stats) => sum + stats.size, 0), // 定义箭头函数
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取交易对列表
   * Get tracked symbols
   *
   * @returns {Array} 交易对列表 / Symbol list
   */
  getTrackedSymbols() { // 调用 getTrackedSymbols
    return Array.from(this.slippageHistory.keys()); // 返回结果
  } // 结束代码块

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() { // 调用 resetStats
    this.slippageHistory.clear(); // 访问 slippageHistory
    this.periodStats.clear(); // 访问 periodStats
    this.realtimeMonitor.clear(); // 访问 realtimeMonitor
    this.activeWarnings.clear(); // 访问 activeWarnings

    this.globalStats = { // 设置 globalStats
      totalRecords: 0, // 总Records
      avgSlippage: 0, // avg滑点
      maxSlippage: 0, // 最大滑点
      highRiskPeriodsDetected: 0, // 最高风险PeriodsDetected
      delayedExecutions: 0, // delayedExecutions
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
    if (!this.config.verbose && level === 'info') { // 条件判断 !this.config.verbose && level === 'info'
      return; // 返回结果
    } // 结束代码块

    const prefix = '[SlippageAnalyzer]'; // 定义常量 prefix
    const fullMessage = `${prefix} ${message}`; // 定义常量 fullMessage

    switch (level) { // 分支选择 level
      case 'error': // 分支 'error'
        console.error(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      case 'warn': // 分支 'warn'
        console.warn(fullMessage); // 控制台输出
        break; // 跳出循环或分支
      default: // 默认
        console.log(fullMessage); // 控制台输出
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// 默认导出 / Default export
export default SlippageAnalyzer; // 默认导出
