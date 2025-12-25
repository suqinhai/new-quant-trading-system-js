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

import EventEmitter from 'eventemitter3';

// ============================================
// 常量定义 / Constants
// ============================================

/**
 * 滑点风险等级
 * Slippage risk levels
 */
export const SLIPPAGE_RISK = {
  VERY_LOW: 'very_low',     // 非常低 / Very low
  LOW: 'low',               // 低 / Low
  MEDIUM: 'medium',         // 中等 / Medium
  HIGH: 'high',             // 高 / High
  VERY_HIGH: 'very_high',   // 非常高 / Very high
  EXTREME: 'extreme',       // 极端 / Extreme
};

/**
 * 时段类型
 * Period types
 */
export const PERIOD_TYPE = {
  NORMAL: 'normal',                 // 正常时段 / Normal period
  HIGH_VOLATILITY: 'high_vol',      // 高波动时段 / High volatility period
  LOW_LIQUIDITY: 'low_liq',         // 低流动性时段 / Low liquidity period
  NEWS_EVENT: 'news',               // 新闻事件 / News event
  MARKET_OPEN: 'market_open',       // 开盘时段 / Market open
  MARKET_CLOSE: 'market_close',     // 收盘时段 / Market close
  MAINTENANCE: 'maintenance',       // 维护时段 / Maintenance period
  FUNDING_RATE: 'funding',          // 资金费率结算 / Funding rate settlement
};

/**
 * 已知的高风险时段（UTC 时间）
 * Known high-risk periods (UTC time)
 */
export const KNOWN_HIGH_RISK_PERIODS = {
  // 加密货币资金费率结算时间（每8小时）/ Crypto funding rate settlement times
  FUNDING_RATE_TIMES: [0, 8, 16],  // 00:00, 08:00, 16:00 UTC

  // 资金费率前后的高风险窗口（分钟）/ High risk window around funding rate (minutes)
  FUNDING_RISK_WINDOW: 15,

  // 传统市场开盘时间（会影响加密市场）/ Traditional market open times
  MARKET_OPENS: {
    US: { hour: 13, minute: 30 },   // 纽约 09:30 EST = 13:30 UTC (冬令时 14:30)
    EU: { hour: 7, minute: 0 },     // 欧洲 08:00 CET = 07:00 UTC
    ASIA: { hour: 0, minute: 0 },   // 亚洲 09:00 JST = 00:00 UTC
  },

  // 开盘前后的高风险窗口（分钟）/ High risk window around market open (minutes)
  MARKET_OPEN_WINDOW: 30,
};

/**
 * 默认配置
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  // 滑点阈值定义 / Slippage threshold definitions
  slippageThresholds: {
    veryLow: 0.0005,    // 0.05%
    low: 0.001,         // 0.1%
    medium: 0.002,      // 0.2%
    high: 0.005,        // 0.5%
    veryHigh: 0.01,     // 1%
    extreme: 0.02,      // 2%
  },

  // 历史数据保留时间（小时）/ Historical data retention (hours)
  historyRetentionHours: 168,  // 7 天 / 7 days

  // 统计窗口大小 / Statistics window size
  statisticsWindow: 100,

  // 时间分析粒度（分钟）/ Time analysis granularity (minutes)
  timeGranularity: 15,

  // 高风险时段执行延迟（毫秒）/ High risk period execution delay (ms)
  highRiskDelay: 30000,

  // 是否启用自动延迟 / Enable auto delay
  enableAutoDelay: true,

  // 警告回调间隔（毫秒）/ Warning callback interval (ms)
  warningInterval: 5000,

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 滑点分析器
 * Slippage Analyzer
 */
export class SlippageAnalyzer extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   *
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    super();

    // 合并配置 / Merge config
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 历史滑点数据 / Historical slippage data
    // 格式: { symbol: [{ timestamp, slippage, side, size, spread, volatility }] }
    this.slippageHistory = new Map();

    // 时段统计 / Period statistics
    // 格式: { symbol: { hourMinute: { avgSlippage, count, maxSlippage, minSlippage } } }
    this.periodStats = new Map();

    // 实时滑点监控 / Real-time slippage monitoring
    // 格式: { symbol: { recentSlippages, currentRisk, trend } }
    this.realtimeMonitor = new Map();

    // 警告状态 / Warning states
    this.activeWarnings = new Map();

    // 延迟执行队列 / Delayed execution queue
    this.delayedExecutions = new Map();

    // 全局统计 / Global statistics
    this.globalStats = {
      totalRecords: 0,
      avgSlippage: 0,
      maxSlippage: 0,
      highRiskPeriodsDetected: 0,
      delayedExecutions: 0,
    };
  }

  // ============================================
  // 核心分析方法 / Core Analysis Methods
  // ============================================

  /**
   * 记录滑点数据
   * Record slippage data
   *
   * @param {Object} data - 滑点数据 / Slippage data
   */
  recordSlippage(data) {
    const {
      symbol,
      slippage,                // 滑点（正数表示不利滑点）/ Slippage (positive = unfavorable)
      side,                    // 买卖方向 / Side
      size,                    // 订单大小 / Order size
      expectedPrice,           // 预期价格 / Expected price
      actualPrice,             // 实际价格 / Actual price
      spread = 0,              // 当时的价差 / Spread at the time
      volatility = 0,          // 当时的波动率 / Volatility at the time
      orderType = 'market',    // 订单类型 / Order type
    } = data;

    const timestamp = Date.now();

    // 创建记录 / Create record
    const record = {
      timestamp,
      slippage: Math.abs(slippage),
      isUnfavorable: slippage > 0,
      side,
      size,
      expectedPrice,
      actualPrice,
      spread,
      volatility,
      orderType,
      hour: new Date(timestamp).getUTCHours(),
      minute: new Date(timestamp).getUTCMinutes(),
      dayOfWeek: new Date(timestamp).getUTCDay(),
    };

    // 添加到历史记录 / Add to history
    if (!this.slippageHistory.has(symbol)) {
      this.slippageHistory.set(symbol, []);
    }
    this.slippageHistory.get(symbol).push(record);

    // 更新时段统计 / Update period statistics
    this._updatePeriodStats(symbol, record);

    // 更新实时监控 / Update real-time monitoring
    this._updateRealtimeMonitor(symbol, record);

    // 更新全局统计 / Update global statistics
    this.globalStats.totalRecords++;
    this.globalStats.avgSlippage = (
      (this.globalStats.avgSlippage * (this.globalStats.totalRecords - 1) + Math.abs(slippage))
      / this.globalStats.totalRecords
    );
    this.globalStats.maxSlippage = Math.max(this.globalStats.maxSlippage, Math.abs(slippage));

    // 清理过期数据 / Clean up expired data
    this._cleanupOldData();

    // 发出事件 / Emit event
    this.emit('slippageRecorded', { symbol, record });
  }

  /**
   * 获取当前滑点风险
   * Get current slippage risk
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 风险评估 / Risk assessment
   */
  getCurrentRisk(symbol) {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    // 获取历史时段数据 / Get historical period data
    const periodKey = this._getPeriodKey(currentHour, currentMinute);
    const periodData = this.periodStats.get(symbol)?.get(periodKey);

    // 获取实时监控数据 / Get real-time monitoring data
    const realtimeData = this.realtimeMonitor.get(symbol);

    // 检查已知高风险时段 / Check known high-risk periods
    const knownRisks = this._checkKnownHighRiskPeriods();

    // 综合评估 / Comprehensive assessment
    let riskLevel = SLIPPAGE_RISK.LOW;
    let riskScore = 0;
    const riskFactors = [];

    // 1. 基于历史时段数据 / Based on historical period data
    if (periodData && periodData.count >= 10) {
      const avgSlippage = periodData.avgSlippage;
      riskScore += this._slippageToScore(avgSlippage) * 0.3;
      if (avgSlippage > this.config.slippageThresholds.high) {
        riskFactors.push({
          factor: 'historical_period',
          avgSlippage,
          weight: 0.3,
        });
      }
    }

    // 2. 基于实时监控 / Based on real-time monitoring
    if (realtimeData && realtimeData.recentSlippages.length >= 5) {
      const recentAvg = realtimeData.recentSlippages.reduce((a, b) => a + b, 0)
        / realtimeData.recentSlippages.length;
      riskScore += this._slippageToScore(recentAvg) * 0.4;
      if (recentAvg > this.config.slippageThresholds.medium) {
        riskFactors.push({
          factor: 'recent_slippage',
          avgSlippage: recentAvg,
          weight: 0.4,
        });
      }
    }

    // 3. 基于已知高风险时段 / Based on known high-risk periods
    if (knownRisks.length > 0) {
      riskScore += 30 * 0.3;  // 已知风险时段加分 / Add score for known risk periods
      riskFactors.push(...knownRisks.map(risk => ({
        factor: risk.type,
        detail: risk.detail,
        weight: 0.3,
      })));
    }

    // 计算最终风险等级 / Calculate final risk level
    riskLevel = this._scoreToRiskLevel(riskScore);

    // 返回评估结果 / Return assessment result
    return {
      symbol,
      timestamp: now.getTime(),
      riskLevel,
      riskScore,
      riskFactors,
      historicalAvg: periodData?.avgSlippage || null,
      recentAvg: realtimeData?.recentSlippages?.length > 0
        ? realtimeData.recentSlippages.reduce((a, b) => a + b, 0) / realtimeData.recentSlippages.length
        : null,
      recommendation: this._generateRecommendation(riskLevel, riskFactors),
      knownRisks,
    };
  }

  /**
   * 检查是否应该延迟执行
   * Check if execution should be delayed
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {number} orderSize - 订单大小 / Order size
   * @returns {Object} 延迟建议 / Delay recommendation
   */
  shouldDelayExecution(symbol, orderSize) {
    const risk = this.getCurrentRisk(symbol);

    // 如果不启用自动延迟 / If auto delay not enabled
    if (!this.config.enableAutoDelay) {
      return {
        shouldDelay: false,
        risk,
      };
    }

    // 判断是否需要延迟 / Determine if delay needed
    let shouldDelay = false;
    let delayMs = 0;
    let reason = null;

    switch (risk.riskLevel) {
      case SLIPPAGE_RISK.EXTREME:
        shouldDelay = true;
        delayMs = this.config.highRiskDelay * 2;
        reason = '极端滑点风险 / Extreme slippage risk';
        break;

      case SLIPPAGE_RISK.VERY_HIGH:
        shouldDelay = true;
        delayMs = this.config.highRiskDelay;
        reason = '非常高滑点风险 / Very high slippage risk';
        break;

      case SLIPPAGE_RISK.HIGH:
        // 大订单才延迟 / Only delay for large orders
        // 这里需要知道订单大小相对于流动性的比例 / Need to know order size relative to liquidity
        if (risk.knownRisks.length > 0) {
          shouldDelay = true;
          delayMs = this.config.highRiskDelay / 2;
          reason = '已知高风险时段 / Known high-risk period';
        }
        break;

      default:
        shouldDelay = false;
    }

    // 计算建议等待到的时间 / Calculate recommended wait time
    let recommendedExecutionTime = null;
    if (shouldDelay) {
      recommendedExecutionTime = new Date(Date.now() + delayMs);

      // 检查等待后是否会进入另一个高风险时段 / Check if waiting leads to another high-risk period
      const futureHour = recommendedExecutionTime.getUTCHours();
      const futureMinute = recommendedExecutionTime.getUTCMinutes();
      const futureRisks = this._checkKnownHighRiskPeriods(futureHour, futureMinute);

      if (futureRisks.length > 0) {
        // 需要更长的延迟 / Need longer delay
        delayMs = this._findNextSafeWindow();
        recommendedExecutionTime = new Date(Date.now() + delayMs);
      }
    }

    return {
      shouldDelay,
      delayMs,
      reason,
      recommendedExecutionTime,
      risk,
    };
  }

  /**
   * 获取最佳执行时间
   * Get optimal execution time
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} options - 选项 / Options
   * @returns {Object} 最佳执行时间建议 / Optimal execution time recommendation
   */
  getOptimalExecutionTime(symbol, options = {}) {
    const {
      withinHours = 1,        // 在多少小时内找到最佳时间 / Find best time within hours
      avoidKnownRisks = true, // 是否避开已知风险时段 / Avoid known risk periods
    } = options;

    const now = new Date();
    const endTime = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

    // 获取该交易对的时段统计 / Get period statistics for this symbol
    const symbolStats = this.periodStats.get(symbol);

    // 候选时间列表 / Candidate time list
    const candidates = [];

    // 按时间粒度扫描 / Scan by time granularity
    let scanTime = new Date(now);
    while (scanTime < endTime) {
      const hour = scanTime.getUTCHours();
      const minute = scanTime.getUTCMinutes();

      // 检查已知风险 / Check known risks
      const knownRisks = this._checkKnownHighRiskPeriods(hour, minute);

      if (avoidKnownRisks && knownRisks.length > 0) {
        scanTime = new Date(scanTime.getTime() + this.config.timeGranularity * 60 * 1000);
        continue;
      }

      // 获取历史滑点数据 / Get historical slippage data
      const periodKey = this._getPeriodKey(hour, minute);
      const periodData = symbolStats?.get(periodKey);

      const score = periodData
        ? this._slippageToScore(periodData.avgSlippage)
        : 50;  // 无数据时默认中等风险 / Default medium risk if no data

      candidates.push({
        time: new Date(scanTime),
        hour,
        minute,
        score,
        avgSlippage: periodData?.avgSlippage || null,
        sampleCount: periodData?.count || 0,
        knownRisks,
      });

      scanTime = new Date(scanTime.getTime() + this.config.timeGranularity * 60 * 1000);
    }

    // 按得分排序（得分越低越好）/ Sort by score (lower is better)
    candidates.sort((a, b) => a.score - b.score);

    // 返回最佳时间 / Return optimal time
    const optimal = candidates[0];
    const alternatives = candidates.slice(1, 4);

    return {
      symbol,
      optimalTime: optimal?.time || now,
      optimalScore: optimal?.score || 50,
      optimalAvgSlippage: optimal?.avgSlippage,
      sampleCount: optimal?.sampleCount || 0,
      alternatives: alternatives.map(c => ({
        time: c.time,
        score: c.score,
        avgSlippage: c.avgSlippage,
      })),
      analysis: {
        scannedPeriods: candidates.length,
        withinHours,
        avoidedKnownRisks: avoidKnownRisks,
      },
    };
  }

  /**
   * 获取时段滑点热力图数据
   * Get period slippage heatmap data
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Object} 热力图数据 / Heatmap data
   */
  getPeriodHeatmap(symbol) {
    const symbolStats = this.periodStats.get(symbol);

    if (!symbolStats) {
      return {
        symbol,
        hasData: false,
        message: '没有足够的历史数据 / Insufficient historical data',
      };
    }

    // 构建 24x4 矩阵（每小时分为4个15分钟段）/ Build 24x4 matrix
    const heatmap = [];

    for (let hour = 0; hour < 24; hour++) {
      const hourData = [];
      for (let quarter = 0; quarter < 4; quarter++) {
        const minute = quarter * 15;
        const periodKey = this._getPeriodKey(hour, minute);
        const data = symbolStats.get(periodKey);

        hourData.push({
          hour,
          minute,
          avgSlippage: data?.avgSlippage || null,
          maxSlippage: data?.maxSlippage || null,
          count: data?.count || 0,
          riskLevel: data
            ? this._scoreToRiskLevel(this._slippageToScore(data.avgSlippage))
            : null,
        });
      }
      heatmap.push(hourData);
    }

    // 计算高风险时段 / Calculate high-risk periods
    const highRiskPeriods = [];
    heatmap.forEach((hourData, hour) => {
      hourData.forEach(slot => {
        if (slot.riskLevel === SLIPPAGE_RISK.HIGH ||
            slot.riskLevel === SLIPPAGE_RISK.VERY_HIGH ||
            slot.riskLevel === SLIPPAGE_RISK.EXTREME) {
          highRiskPeriods.push({
            hour,
            minute: slot.minute,
            avgSlippage: slot.avgSlippage,
            riskLevel: slot.riskLevel,
          });
        }
      });
    });

    return {
      symbol,
      hasData: true,
      heatmap,
      highRiskPeriods,
      summary: {
        totalSlots: 96,  // 24 * 4
        slotsWithData: heatmap.flat().filter(s => s.count > 0).length,
        highRiskSlots: highRiskPeriods.length,
        avgSlippage: this._calculateOverallAvg(symbolStats),
      },
    };
  }

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
  _updatePeriodStats(symbol, record) {
    if (!this.periodStats.has(symbol)) {
      this.periodStats.set(symbol, new Map());
    }

    const symbolStats = this.periodStats.get(symbol);
    const periodKey = this._getPeriodKey(record.hour, record.minute);

    if (!symbolStats.has(periodKey)) {
      symbolStats.set(periodKey, {
        avgSlippage: 0,
        maxSlippage: 0,
        minSlippage: Infinity,
        count: 0,
        totalSlippage: 0,
      });
    }

    const data = symbolStats.get(periodKey);
    data.count++;
    data.totalSlippage += record.slippage;
    data.avgSlippage = data.totalSlippage / data.count;
    data.maxSlippage = Math.max(data.maxSlippage, record.slippage);
    data.minSlippage = Math.min(data.minSlippage, record.slippage);
  }

  /**
   * 更新实时监控
   * Update real-time monitoring
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {Object} record - 滑点记录 / Slippage record
   * @private
   */
  _updateRealtimeMonitor(symbol, record) {
    if (!this.realtimeMonitor.has(symbol)) {
      this.realtimeMonitor.set(symbol, {
        recentSlippages: [],
        trend: 'stable',
        lastUpdate: Date.now(),
      });
    }

    const monitor = this.realtimeMonitor.get(symbol);
    monitor.recentSlippages.push(record.slippage);

    // 保留最近 N 个 / Keep last N
    if (monitor.recentSlippages.length > this.config.statisticsWindow) {
      monitor.recentSlippages.shift();
    }

    // 计算趋势 / Calculate trend
    if (monitor.recentSlippages.length >= 10) {
      const recent5 = monitor.recentSlippages.slice(-5);
      const previous5 = monitor.recentSlippages.slice(-10, -5);
      const recentAvg = recent5.reduce((a, b) => a + b, 0) / 5;
      const previousAvg = previous5.reduce((a, b) => a + b, 0) / 5;

      if (recentAvg > previousAvg * 1.2) {
        monitor.trend = 'increasing';
      } else if (recentAvg < previousAvg * 0.8) {
        monitor.trend = 'decreasing';
      } else {
        monitor.trend = 'stable';
      }
    }

    monitor.lastUpdate = Date.now();

    // 检查是否需要发出警告 / Check if warning needed
    const currentRisk = this._scoreToRiskLevel(
      this._slippageToScore(record.slippage)
    );

    if (currentRisk === SLIPPAGE_RISK.HIGH ||
        currentRisk === SLIPPAGE_RISK.VERY_HIGH ||
        currentRisk === SLIPPAGE_RISK.EXTREME) {
      this._emitWarning(symbol, currentRisk, record);
    }
  }

  /**
   * 检查已知高风险时段
   * Check known high-risk periods
   *
   * @param {number} hour - 小时 / Hour
   * @param {number} minute - 分钟 / Minute
   * @returns {Array} 风险列表 / Risk list
   * @private
   */
  _checkKnownHighRiskPeriods(hour = null, minute = null) {
    const now = new Date();
    const checkHour = hour !== null ? hour : now.getUTCHours();
    const checkMinute = minute !== null ? minute : now.getUTCMinutes();

    const risks = [];

    // 检查资金费率结算时间 / Check funding rate settlement times
    for (const fundingHour of KNOWN_HIGH_RISK_PERIODS.FUNDING_RATE_TIMES) {
      const minuteDiff = Math.abs(
        (checkHour * 60 + checkMinute) - (fundingHour * 60)
      );

      if (minuteDiff <= KNOWN_HIGH_RISK_PERIODS.FUNDING_RISK_WINDOW ||
          (1440 - minuteDiff) <= KNOWN_HIGH_RISK_PERIODS.FUNDING_RISK_WINDOW) {
        risks.push({
          type: PERIOD_TYPE.FUNDING_RATE,
          detail: `资金费率结算 ${fundingHour}:00 UTC / Funding rate settlement`,
          severity: 'high',
        });
      }
    }

    // 检查市场开盘时间 / Check market open times
    for (const [market, time] of Object.entries(KNOWN_HIGH_RISK_PERIODS.MARKET_OPENS)) {
      const minuteDiff = Math.abs(
        (checkHour * 60 + checkMinute) - (time.hour * 60 + time.minute)
      );

      if (minuteDiff <= KNOWN_HIGH_RISK_PERIODS.MARKET_OPEN_WINDOW) {
        risks.push({
          type: PERIOD_TYPE.MARKET_OPEN,
          detail: `${market} 市场开盘 / ${market} market open`,
          severity: 'medium',
        });
      }
    }

    return risks;
  }

  /**
   * 获取时段键
   * Get period key
   *
   * @param {number} hour - 小时 / Hour
   * @param {number} minute - 分钟 / Minute
   * @returns {string} 时段键 / Period key
   * @private
   */
  _getPeriodKey(hour, minute) {
    // 按照时间粒度归类 / Classify by time granularity
    const roundedMinute = Math.floor(minute / this.config.timeGranularity) *
      this.config.timeGranularity;
    return `${hour.toString().padStart(2, '0')}:${roundedMinute.toString().padStart(2, '0')}`;
  }

  /**
   * 滑点转得分
   * Convert slippage to score
   *
   * @param {number} slippage - 滑点 / Slippage
   * @returns {number} 得分 (0-100) / Score (0-100)
   * @private
   */
  _slippageToScore(slippage) {
    const thresholds = this.config.slippageThresholds;

    if (slippage <= thresholds.veryLow) return 10;
    if (slippage <= thresholds.low) return 20;
    if (slippage <= thresholds.medium) return 40;
    if (slippage <= thresholds.high) return 60;
    if (slippage <= thresholds.veryHigh) return 80;
    return 100;
  }

  /**
   * 得分转风险等级
   * Convert score to risk level
   *
   * @param {number} score - 得分 / Score
   * @returns {string} 风险等级 / Risk level
   * @private
   */
  _scoreToRiskLevel(score) {
    if (score <= 15) return SLIPPAGE_RISK.VERY_LOW;
    if (score <= 30) return SLIPPAGE_RISK.LOW;
    if (score <= 50) return SLIPPAGE_RISK.MEDIUM;
    if (score <= 70) return SLIPPAGE_RISK.HIGH;
    if (score <= 85) return SLIPPAGE_RISK.VERY_HIGH;
    return SLIPPAGE_RISK.EXTREME;
  }

  /**
   * 生成建议
   * Generate recommendation
   *
   * @param {string} riskLevel - 风险等级 / Risk level
   * @param {Array} riskFactors - 风险因素 / Risk factors
   * @returns {string} 建议 / Recommendation
   * @private
   */
  _generateRecommendation(riskLevel, riskFactors) {
    switch (riskLevel) {
      case SLIPPAGE_RISK.EXTREME:
        return '强烈建议延迟执行或使用限价单 / Strongly recommend delaying execution or using limit orders';

      case SLIPPAGE_RISK.VERY_HIGH:
        return '建议等待滑点风险降低或拆分订单 / Recommend waiting for lower risk or splitting orders';

      case SLIPPAGE_RISK.HIGH:
        return '建议使用 TWAP/VWAP 或冰山单执行 / Recommend TWAP/VWAP or iceberg execution';

      case SLIPPAGE_RISK.MEDIUM:
        return '可正常执行，建议监控滑点 / Normal execution OK, recommend monitoring slippage';

      case SLIPPAGE_RISK.LOW:
      case SLIPPAGE_RISK.VERY_LOW:
        return '良好的执行时机 / Good execution timing';

      default:
        return '请根据具体情况决定 / Decide based on specific conditions';
    }
  }

  /**
   * 查找下一个安全窗口
   * Find next safe window
   *
   * @returns {number} 等待时间（毫秒）/ Wait time (ms)
   * @private
   */
  _findNextSafeWindow() {
    const now = new Date();
    let checkTime = new Date(now);
    let maxIterations = 24 * 4;  // 最多检查24小时 / Max check 24 hours

    while (maxIterations > 0) {
      checkTime = new Date(checkTime.getTime() + 15 * 60 * 1000);  // 每次加15分钟 / Add 15 minutes each time

      const risks = this._checkKnownHighRiskPeriods(
        checkTime.getUTCHours(),
        checkTime.getUTCMinutes()
      );

      if (risks.length === 0) {
        return checkTime.getTime() - now.getTime();
      }

      maxIterations--;
    }

    // 如果找不到安全窗口，返回默认延迟 / If no safe window found, return default delay
    return this.config.highRiskDelay * 2;
  }

  /**
   * 发出警告
   * Emit warning
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} riskLevel - 风险等级 / Risk level
   * @param {Object} record - 滑点记录 / Slippage record
   * @private
   */
  _emitWarning(symbol, riskLevel, record) {
    // 检查是否在警告冷却期内 / Check if in warning cooldown
    const lastWarning = this.activeWarnings.get(symbol);
    if (lastWarning && Date.now() - lastWarning < this.config.warningInterval) {
      return;
    }

    // 记录警告时间 / Record warning time
    this.activeWarnings.set(symbol, Date.now());

    // 更新统计 / Update stats
    this.globalStats.highRiskPeriodsDetected++;

    // 发出警告事件 / Emit warning event
    this.emit('slippageWarning', {
      symbol,
      riskLevel,
      slippage: record.slippage,
      timestamp: record.timestamp,
      recommendation: this._generateRecommendation(riskLevel, []),
    });

    // 记录日志 / Log
    this.log(
      `滑点警告: ${symbol} 风险等级 ${riskLevel}, 滑点 ${(record.slippage * 10000).toFixed(1)} bps / ` +
      `Slippage warning: ${symbol} risk ${riskLevel}`,
      'warn'
    );
  }

  /**
   * 计算整体平均
   * Calculate overall average
   *
   * @param {Map} symbolStats - 交易对统计 / Symbol statistics
   * @returns {number} 平均滑点 / Average slippage
   * @private
   */
  _calculateOverallAvg(symbolStats) {
    let totalSlippage = 0;
    let totalCount = 0;

    for (const data of symbolStats.values()) {
      totalSlippage += data.totalSlippage;
      totalCount += data.count;
    }

    return totalCount > 0 ? totalSlippage / totalCount : 0;
  }

  /**
   * 清理过期数据
   * Clean up old data
   *
   * @private
   */
  _cleanupOldData() {
    const cutoffTime = Date.now() - this.config.historyRetentionHours * 60 * 60 * 1000;

    for (const [symbol, history] of this.slippageHistory) {
      const filtered = history.filter(record => record.timestamp >= cutoffTime);
      this.slippageHistory.set(symbol, filtered);
    }
  }

  // ============================================
  // 工具方法 / Utility Methods
  // ============================================

  /**
   * 获取统计信息
   * Get statistics
   *
   * @returns {Object} 统计信息 / Statistics
   */
  getStats() {
    return {
      ...this.globalStats,
      symbolsTracked: this.slippageHistory.size,
      periodsCovered: Array.from(this.periodStats.values())
        .reduce((sum, stats) => sum + stats.size, 0),
    };
  }

  /**
   * 获取交易对列表
   * Get tracked symbols
   *
   * @returns {Array} 交易对列表 / Symbol list
   */
  getTrackedSymbols() {
    return Array.from(this.slippageHistory.keys());
  }

  /**
   * 重置统计
   * Reset statistics
   */
  resetStats() {
    this.slippageHistory.clear();
    this.periodStats.clear();
    this.realtimeMonitor.clear();
    this.activeWarnings.clear();

    this.globalStats = {
      totalRecords: 0,
      avgSlippage: 0,
      maxSlippage: 0,
      highRiskPeriodsDetected: 0,
      delayedExecutions: 0,
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
    if (!this.config.verbose && level === 'info') {
      return;
    }

    const prefix = '[SlippageAnalyzer]';
    const fullMessage = `${prefix} ${message}`;

    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      default:
        console.log(fullMessage);
    }
  }
}

// 默认导出 / Default export
export default SlippageAnalyzer;
