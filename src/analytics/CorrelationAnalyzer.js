/**
 * 策略相关性分析器
 * Strategy Correlation Analyzer
 *
 * 功能 / Features:
 * 1. 计算策略收益相关系数 / Calculate strategy return correlations
 * 2. 构建相关性矩阵 / Build correlation matrix
 * 3. 识别低相关策略组合 / Identify low correlation strategy pairs
 * 4. 滚动相关性监控 / Rolling correlation monitoring
 * 5. 协方差矩阵计算 / Covariance matrix calculation
 */

// ============================================
// 导入依赖 / Import Dependencies
// ============================================

import EventEmitter from 'eventemitter3';
import Decimal from 'decimal.js';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 相关性级别
 * Correlation level
 */
const CORRELATION_LEVEL = {
  VERY_LOW: 'very_low',       // < 0.2 非常低 / Very low
  LOW: 'low',                 // 0.2 - 0.4 低 / Low
  MODERATE: 'moderate',       // 0.4 - 0.6 中等 / Moderate
  HIGH: 'high',               // 0.6 - 0.8 高 / High
  VERY_HIGH: 'very_high',     // > 0.8 非常高 / Very high
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // 滚动窗口大小 (数据点数量) / Rolling window size (number of data points)
  rollingWindow: 30,

  // 最小数据点数量 / Minimum data points required
  minDataPoints: 10,

  // 低相关性阈值 / Low correlation threshold
  lowCorrelationThreshold: 0.3,

  // 高相关性警告阈值 / High correlation warning threshold
  highCorrelationWarning: 0.7,

  // 相关性更新间隔 (毫秒) / Correlation update interval (ms)
  updateInterval: 60000,

  // 是否启用详细日志 / Enable verbose logging
  verbose: false,

  // 日志前缀 / Log prefix
  logPrefix: '[CorrelationAnalyzer]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 策略相关性分析器
 * Strategy Correlation Analyzer
 */
export class CorrelationAnalyzer extends EventEmitter {
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

    // 策略收益数据存储 / Strategy returns data storage
    // 格式: { strategyId: [{ timestamp, return, equity }, ...] }
    this.strategyReturns = new Map();

    // 相关性矩阵缓存 / Correlation matrix cache
    this.correlationMatrix = null;

    // 协方差矩阵缓存 / Covariance matrix cache
    this.covarianceMatrix = null;

    // 策略列表 / Strategy list
    this.strategies = [];

    // 最后更新时间 / Last update time
    this.lastUpdateTime = 0;

    // 定时器 / Timer
    this.updateTimer = null;

    // 运行状态 / Running state
    this.running = false;
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 启动分析器
   * Start analyzer
   */
  start() {
    if (this.running) return;

    this.running = true;

    // 启动定时更新 / Start periodic update
    this.updateTimer = setInterval(
      () => this._updateMatrices(),
      this.config.updateInterval
    );

    this.log('相关性分析器已启动 / Correlation analyzer started', 'info');
    this.emit('started');
  }

  /**
   * 停止分析器
   * Stop analyzer
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    this.log('相关性分析器已停止 / Correlation analyzer stopped', 'info');
    this.emit('stopped');
  }

  // ============================================
  // 数据收集 / Data Collection
  // ============================================

  /**
   * 注册策略
   * Register strategy
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} metadata - 策略元数据 / Strategy metadata
   */
  registerStrategy(strategyId, metadata = {}) {
    if (!this.strategies.includes(strategyId)) {
      this.strategies.push(strategyId);
      this.strategyReturns.set(strategyId, []);

      this.log(`注册策略: ${strategyId} / Strategy registered: ${strategyId}`, 'info');
      this.emit('strategyRegistered', { strategyId, metadata });
    }
  }

  /**
   * 移除策略
   * Remove strategy
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   */
  removeStrategy(strategyId) {
    const index = this.strategies.indexOf(strategyId);
    if (index > -1) {
      this.strategies.splice(index, 1);
      this.strategyReturns.delete(strategyId);

      // 重新计算矩阵 / Recalculate matrices
      this._updateMatrices();

      this.log(`移除策略: ${strategyId} / Strategy removed: ${strategyId}`, 'info');
      this.emit('strategyRemoved', { strategyId });
    }
  }

  /**
   * 记录策略收益
   * Record strategy return
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {number} returnValue - 收益率 / Return value
   * @param {number} equity - 权益 / Equity
   * @param {number} timestamp - 时间戳 / Timestamp
   */
  recordReturn(strategyId, returnValue, equity = null, timestamp = Date.now()) {
    // 确保策略已注册 / Ensure strategy is registered
    if (!this.strategyReturns.has(strategyId)) {
      this.registerStrategy(strategyId);
    }

    // 获取收益数组 / Get returns array
    const returns = this.strategyReturns.get(strategyId);

    // 添加新数据点 / Add new data point
    returns.push({
      timestamp,
      return: returnValue,
      equity,
    });

    // 保持窗口大小 / Maintain window size
    const maxSize = this.config.rollingWindow * 2;
    if (returns.length > maxSize) {
      returns.splice(0, returns.length - maxSize);
    }

    // 触发数据更新事件 / Emit data update event
    this.emit('returnRecorded', { strategyId, returnValue, equity, timestamp });
  }

  /**
   * 从权益曲线计算收益率
   * Calculate returns from equity curve
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Array} equityCurve - 权益曲线 [{ timestamp, equity }, ...]
   */
  loadEquityCurve(strategyId, equityCurve) {
    if (!equityCurve || equityCurve.length < 2) {
      this.log(`权益曲线数据不足: ${strategyId} / Insufficient equity curve: ${strategyId}`, 'warn');
      return;
    }

    // 确保策略已注册 / Ensure strategy is registered
    if (!this.strategyReturns.has(strategyId)) {
      this.registerStrategy(strategyId);
    }

    // 计算收益率 / Calculate returns
    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prevEquity = equityCurve[i - 1].equity;
      const currEquity = equityCurve[i].equity;

      if (prevEquity > 0) {
        const returnValue = (currEquity - prevEquity) / prevEquity;
        returns.push({
          timestamp: equityCurve[i].timestamp,
          return: returnValue,
          equity: currEquity,
        });
      }
    }

    // 替换收益数据 / Replace returns data
    this.strategyReturns.set(strategyId, returns);

    this.log(`加载权益曲线: ${strategyId}, ${returns.length}个数据点 / Loaded equity curve: ${strategyId}, ${returns.length} points`, 'info');
  }

  // ============================================
  // 相关性计算 / Correlation Calculation
  // ============================================

  /**
   * 计算两个策略的相关系数
   * Calculate correlation between two strategies
   *
   * @param {string} strategyA - 策略A ID / Strategy A ID
   * @param {string} strategyB - 策略B ID / Strategy B ID
   * @param {number} window - 窗口大小 / Window size
   * @returns {Object} 相关性结果 / Correlation result
   */
  calculateCorrelation(strategyA, strategyB, window = null) {
    const windowSize = window || this.config.rollingWindow;

    // 获取收益数据 / Get returns data
    const returnsA = this.strategyReturns.get(strategyA);
    const returnsB = this.strategyReturns.get(strategyB);

    // 检查数据 / Check data
    if (!returnsA || !returnsB) {
      return {
        correlation: null,
        error: '策略数据不存在 / Strategy data not found',
      };
    }

    // 对齐时间序列 / Align time series
    const aligned = this._alignTimeSeries(returnsA, returnsB, windowSize);

    if (aligned.length < this.config.minDataPoints) {
      return {
        correlation: null,
        dataPoints: aligned.length,
        error: `数据点不足 (${aligned.length} < ${this.config.minDataPoints}) / Insufficient data points`,
      };
    }

    // 提取收益率数组 / Extract return arrays
    const x = aligned.map(d => d.returnA);
    const y = aligned.map(d => d.returnB);

    // 计算 Pearson 相关系数 / Calculate Pearson correlation
    const correlation = this._pearsonCorrelation(x, y);

    // 计算统计显著性 (t检验) / Calculate statistical significance (t-test)
    const tStat = correlation * Math.sqrt((aligned.length - 2) / (1 - correlation * correlation));
    const pValue = this._tDistributionPValue(tStat, aligned.length - 2);

    // 确定相关性级别 / Determine correlation level
    const level = this._getCorrelationLevel(Math.abs(correlation));

    return {
      strategyA,
      strategyB,
      correlation,
      absoluteCorrelation: Math.abs(correlation),
      level,
      dataPoints: aligned.length,
      tStatistic: tStat,
      pValue,
      significant: pValue < 0.05,
      timestamp: Date.now(),
    };
  }

  /**
   * 计算 Pearson 相关系数
   * Calculate Pearson correlation coefficient
   *
   * @param {Array<number>} x - 数组X / Array X
   * @param {Array<number>} y - 数组Y / Array Y
   * @returns {number} 相关系数 / Correlation coefficient
   * @private
   */
  _pearsonCorrelation(x, y) {
    const n = x.length;
    if (n !== y.length || n === 0) return NaN;

    // 计算均值 / Calculate means
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    // 计算协方差和标准差 / Calculate covariance and standard deviations
    let covXY = 0;
    let varX = 0;
    let varY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      covXY += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    // 防止除零 / Prevent division by zero
    if (varX === 0 || varY === 0) return 0;

    // Pearson 相关系数 = Cov(X,Y) / (Std(X) * Std(Y))
    return covXY / Math.sqrt(varX * varY);
  }

  /**
   * 计算 Spearman 秩相关系数
   * Calculate Spearman rank correlation coefficient
   *
   * @param {Array<number>} x - 数组X / Array X
   * @param {Array<number>} y - 数组Y / Array Y
   * @returns {number} 相关系数 / Correlation coefficient
   */
  spearmanCorrelation(x, y) {
    const n = x.length;
    if (n !== y.length || n === 0) return NaN;

    // 转换为秩 / Convert to ranks
    const rankX = this._getRanks(x);
    const rankY = this._getRanks(y);

    // 使用 Pearson 公式计算秩相关 / Use Pearson formula on ranks
    return this._pearsonCorrelation(rankX, rankY);
  }

  /**
   * 获取数组的秩
   * Get ranks of array
   *
   * @param {Array<number>} arr - 输入数组 / Input array
   * @returns {Array<number>} 秩数组 / Rank array
   * @private
   */
  _getRanks(arr) {
    const sorted = arr.map((v, i) => ({ value: v, index: i }))
      .sort((a, b) => a.value - b.value);

    const ranks = new Array(arr.length);
    for (let i = 0; i < sorted.length; i++) {
      ranks[sorted[i].index] = i + 1;
    }

    return ranks;
  }

  // ============================================
  // 矩阵计算 / Matrix Calculation
  // ============================================

  /**
   * 构建相关性矩阵
   * Build correlation matrix
   *
   * @param {number} window - 窗口大小 / Window size
   * @returns {Object} 相关性矩阵 / Correlation matrix
   */
  buildCorrelationMatrix(window = null) {
    const strategies = this.strategies;
    const n = strategies.length;

    if (n < 2) {
      return {
        strategies: [],
        matrix: [],
        error: '至少需要2个策略 / At least 2 strategies required',
      };
    }

    // 初始化矩阵 / Initialize matrix
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));
    const details = [];

    // 计算两两相关性 / Calculate pairwise correlations
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1; // 对角线为1 / Diagonal is 1

      for (let j = i + 1; j < n; j++) {
        const result = this.calculateCorrelation(strategies[i], strategies[j], window);
        const corr = result.correlation || 0;

        matrix[i][j] = corr;
        matrix[j][i] = corr;

        details.push({
          pair: [strategies[i], strategies[j]],
          ...result,
        });
      }
    }

    // 缓存结果 / Cache result
    this.correlationMatrix = {
      strategies,
      matrix,
      details,
      timestamp: Date.now(),
    };

    return this.correlationMatrix;
  }

  /**
   * 构建协方差矩阵
   * Build covariance matrix
   *
   * @param {number} window - 窗口大小 / Window size
   * @returns {Object} 协方差矩阵 / Covariance matrix
   */
  buildCovarianceMatrix(window = null) {
    const windowSize = window || this.config.rollingWindow;
    const strategies = this.strategies;
    const n = strategies.length;

    if (n < 2) {
      return {
        strategies: [],
        matrix: [],
        error: '至少需要2个策略 / At least 2 strategies required',
      };
    }

    // 获取对齐的收益数据 / Get aligned return data
    const alignedReturns = this._alignAllStrategies(windowSize);

    if (alignedReturns.length < this.config.minDataPoints) {
      return {
        strategies,
        matrix: [],
        error: '数据点不足 / Insufficient data points',
      };
    }

    // 计算均值 / Calculate means
    const means = strategies.map((_, idx) => {
      const returns = alignedReturns.map(d => d.returns[idx]);
      return returns.reduce((a, b) => a + b, 0) / returns.length;
    });

    // 初始化协方差矩阵 / Initialize covariance matrix
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));
    const m = alignedReturns.length;

    // 计算协方差 / Calculate covariance
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let cov = 0;
        for (let k = 0; k < m; k++) {
          cov += (alignedReturns[k].returns[i] - means[i]) *
                 (alignedReturns[k].returns[j] - means[j]);
        }
        cov /= (m - 1); // 样本协方差 / Sample covariance

        matrix[i][j] = cov;
        matrix[j][i] = cov;
      }
    }

    // 计算标准差 / Calculate standard deviations
    const stdDevs = strategies.map((_, idx) => Math.sqrt(matrix[idx][idx]));

    // 缓存结果 / Cache result
    this.covarianceMatrix = {
      strategies,
      matrix,
      means,
      stdDevs,
      dataPoints: m,
      timestamp: Date.now(),
    };

    return this.covarianceMatrix;
  }

  // ============================================
  // 低相关性分析 / Low Correlation Analysis
  // ============================================

  /**
   * 找出低相关策略组合
   * Find low correlation strategy pairs
   *
   * @param {number} threshold - 相关性阈值 / Correlation threshold
   * @returns {Array} 低相关策略对列表 / Low correlation pairs list
   */
  findLowCorrelationPairs(threshold = null) {
    const thresholdValue = threshold || this.config.lowCorrelationThreshold;

    // 确保矩阵是最新的 / Ensure matrix is up to date
    if (!this.correlationMatrix || Date.now() - this.correlationMatrix.timestamp > this.config.updateInterval) {
      this.buildCorrelationMatrix();
    }

    if (!this.correlationMatrix || !this.correlationMatrix.details) {
      return [];
    }

    // 筛选低相关策略对 / Filter low correlation pairs
    const lowCorrelationPairs = this.correlationMatrix.details
      .filter(d => d.correlation !== null && Math.abs(d.correlation) < thresholdValue)
      .sort((a, b) => Math.abs(a.correlation) - Math.abs(b.correlation))
      .map(d => ({
        strategies: d.pair,
        correlation: d.correlation,
        absoluteCorrelation: Math.abs(d.correlation),
        level: d.level,
        recommendation: this._getRecommendation(d.correlation),
      }));

    return lowCorrelationPairs;
  }

  /**
   * 找出高相关策略组合 (风险警告)
   * Find high correlation strategy pairs (risk warning)
   *
   * @param {number} threshold - 相关性阈值 / Correlation threshold
   * @returns {Array} 高相关策略对列表 / High correlation pairs list
   */
  findHighCorrelationPairs(threshold = null) {
    const thresholdValue = threshold || this.config.highCorrelationWarning;

    // 确保矩阵是最新的 / Ensure matrix is up to date
    if (!this.correlationMatrix || Date.now() - this.correlationMatrix.timestamp > this.config.updateInterval) {
      this.buildCorrelationMatrix();
    }

    if (!this.correlationMatrix || !this.correlationMatrix.details) {
      return [];
    }

    // 筛选高相关策略对 / Filter high correlation pairs
    const highCorrelationPairs = this.correlationMatrix.details
      .filter(d => d.correlation !== null && Math.abs(d.correlation) >= thresholdValue)
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      .map(d => ({
        strategies: d.pair,
        correlation: d.correlation,
        absoluteCorrelation: Math.abs(d.correlation),
        level: d.level,
        warning: '高相关性可能导致集中风险 / High correlation may cause concentrated risk',
      }));

    return highCorrelationPairs;
  }

  /**
   * 获取最优策略组合 (最小化平均相关性)
   * Get optimal strategy combination (minimize average correlation)
   *
   * @param {number} targetCount - 目标策略数量 / Target strategy count
   * @returns {Object} 最优组合 / Optimal combination
   */
  getOptimalCombination(targetCount = 3) {
    const strategies = this.strategies;
    const n = strategies.length;

    if (n < targetCount) {
      return {
        strategies: strategies,
        averageCorrelation: this._calculateAverageCorrelation(strategies),
        message: '可用策略数量不足 / Insufficient available strategies',
      };
    }

    // 确保矩阵是最新的 / Ensure matrix is up to date
    this.buildCorrelationMatrix();

    if (!this.correlationMatrix) {
      return { strategies: [], error: '无法构建相关性矩阵 / Cannot build correlation matrix' };
    }

    // 贪心算法选择低相关策略 / Greedy algorithm to select low correlation strategies
    const selected = [strategies[0]];
    const remaining = strategies.slice(1);

    while (selected.length < targetCount && remaining.length > 0) {
      let bestCandidate = null;
      let lowestAvgCorr = Infinity;

      for (const candidate of remaining) {
        // 计算候选策略与已选策略的平均相关性
        // Calculate average correlation between candidate and selected
        let totalCorr = 0;
        for (const s of selected) {
          const result = this.calculateCorrelation(candidate, s);
          totalCorr += Math.abs(result.correlation || 0);
        }
        const avgCorr = totalCorr / selected.length;

        if (avgCorr < lowestAvgCorr) {
          lowestAvgCorr = avgCorr;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        selected.push(bestCandidate);
        remaining.splice(remaining.indexOf(bestCandidate), 1);
      } else {
        break;
      }
    }

    return {
      strategies: selected,
      averageCorrelation: this._calculateAverageCorrelation(selected),
      correlationMatrix: this._getSubMatrix(selected),
      recommendation: '基于最小相关性的组合 / Combination based on minimum correlation',
    };
  }

  // ============================================
  // 滚动相关性 / Rolling Correlation
  // ============================================

  /**
   * 计算滚动相关性
   * Calculate rolling correlation
   *
   * @param {string} strategyA - 策略A ID / Strategy A ID
   * @param {string} strategyB - 策略B ID / Strategy B ID
   * @param {number} window - 窗口大小 / Window size
   * @returns {Array} 滚动相关性数组 / Rolling correlation array
   */
  calculateRollingCorrelation(strategyA, strategyB, window = null) {
    const windowSize = window || this.config.rollingWindow;

    const returnsA = this.strategyReturns.get(strategyA);
    const returnsB = this.strategyReturns.get(strategyB);

    if (!returnsA || !returnsB) {
      return [];
    }

    // 对齐时间序列 / Align time series
    const aligned = this._alignTimeSeries(returnsA, returnsB, Infinity);

    if (aligned.length < windowSize) {
      return [];
    }

    // 计算滚动相关性 / Calculate rolling correlation
    const rollingCorr = [];

    for (let i = windowSize; i <= aligned.length; i++) {
      const windowData = aligned.slice(i - windowSize, i);
      const x = windowData.map(d => d.returnA);
      const y = windowData.map(d => d.returnB);
      const corr = this._pearsonCorrelation(x, y);

      rollingCorr.push({
        timestamp: aligned[i - 1].timestamp,
        correlation: corr,
        level: this._getCorrelationLevel(Math.abs(corr)),
      });
    }

    return rollingCorr;
  }

  /**
   * 检测相关性突变
   * Detect correlation regime change
   *
   * @param {string} strategyA - 策略A ID / Strategy A ID
   * @param {string} strategyB - 策略B ID / Strategy B ID
   * @param {number} threshold - 变化阈值 / Change threshold
   * @returns {Object} 突变检测结果 / Regime change detection result
   */
  detectCorrelationRegimeChange(strategyA, strategyB, threshold = 0.3) {
    const rolling = this.calculateRollingCorrelation(strategyA, strategyB);

    if (rolling.length < 2) {
      return { detected: false, message: '数据不足 / Insufficient data' };
    }

    // 比较最近相关性与历史平均 / Compare recent correlation with historical average
    const recent = rolling.slice(-5);
    const historical = rolling.slice(0, -5);

    if (historical.length < 5) {
      return { detected: false, message: '历史数据不足 / Insufficient historical data' };
    }

    const recentAvg = recent.reduce((a, b) => a + b.correlation, 0) / recent.length;
    const historicalAvg = historical.reduce((a, b) => a + b.correlation, 0) / historical.length;
    const change = Math.abs(recentAvg - historicalAvg);

    const detected = change >= threshold;

    return {
      detected,
      recentCorrelation: recentAvg,
      historicalCorrelation: historicalAvg,
      change,
      threshold,
      direction: recentAvg > historicalAvg ? 'increasing' : 'decreasing',
      timestamp: Date.now(),
    };
  }

  // ============================================
  // 辅助方法 / Helper Methods
  // ============================================

  /**
   * 对齐两个时间序列
   * Align two time series
   *
   * @param {Array} seriesA - 序列A / Series A
   * @param {Array} seriesB - 序列B / Series B
   * @param {number} maxPoints - 最大数据点 / Max data points
   * @returns {Array} 对齐后的数据 / Aligned data
   * @private
   */
  _alignTimeSeries(seriesA, seriesB, maxPoints) {
    // 创建时间戳映射 / Create timestamp mapping
    const mapA = new Map(seriesA.map(d => [d.timestamp, d.return]));
    const mapB = new Map(seriesB.map(d => [d.timestamp, d.return]));

    // 找出共同时间戳 / Find common timestamps
    const commonTimestamps = [...mapA.keys()].filter(t => mapB.has(t)).sort((a, b) => a - b);

    // 取最近的数据点 / Take recent data points
    const timestamps = commonTimestamps.slice(-maxPoints);

    return timestamps.map(t => ({
      timestamp: t,
      returnA: mapA.get(t),
      returnB: mapB.get(t),
    }));
  }

  /**
   * 对齐所有策略的时间序列
   * Align all strategies' time series
   *
   * @param {number} maxPoints - 最大数据点 / Max data points
   * @returns {Array} 对齐后的数据 / Aligned data
   * @private
   */
  _alignAllStrategies(maxPoints) {
    if (this.strategies.length === 0) return [];

    // 获取所有时间戳 / Get all timestamps
    const timestampSets = this.strategies.map(s => {
      const returns = this.strategyReturns.get(s) || [];
      return new Set(returns.map(d => d.timestamp));
    });

    // 找出共同时间戳 / Find common timestamps
    let commonTimestamps = [...timestampSets[0]];
    for (let i = 1; i < timestampSets.length; i++) {
      commonTimestamps = commonTimestamps.filter(t => timestampSets[i].has(t));
    }

    // 排序并取最近的数据点 / Sort and take recent data points
    commonTimestamps.sort((a, b) => a - b);
    const timestamps = commonTimestamps.slice(-maxPoints);

    // 构建对齐数据 / Build aligned data
    return timestamps.map(t => {
      const returns = this.strategies.map(s => {
        const data = this.strategyReturns.get(s) || [];
        const point = data.find(d => d.timestamp === t);
        return point ? point.return : 0;
      });
      return { timestamp: t, returns };
    });
  }

  /**
   * 获取相关性级别
   * Get correlation level
   *
   * @param {number} absCorr - 相关系数绝对值 / Absolute correlation
   * @returns {string} 相关性级别 / Correlation level
   * @private
   */
  _getCorrelationLevel(absCorr) {
    if (absCorr < 0.2) return CORRELATION_LEVEL.VERY_LOW;
    if (absCorr < 0.4) return CORRELATION_LEVEL.LOW;
    if (absCorr < 0.6) return CORRELATION_LEVEL.MODERATE;
    if (absCorr < 0.8) return CORRELATION_LEVEL.HIGH;
    return CORRELATION_LEVEL.VERY_HIGH;
  }

  /**
   * 获取投资建议
   * Get investment recommendation
   *
   * @param {number} correlation - 相关系数 / Correlation
   * @returns {string} 建议 / Recommendation
   * @private
   */
  _getRecommendation(correlation) {
    const absCorr = Math.abs(correlation);
    if (absCorr < 0.2) {
      return '极佳的分散化组合 / Excellent diversification';
    } else if (absCorr < 0.4) {
      return '良好的分散化效果 / Good diversification';
    } else if (absCorr < 0.6) {
      return '适度分散 / Moderate diversification';
    } else {
      return '分散化效果有限 / Limited diversification';
    }
  }

  /**
   * 计算策略组合的平均相关性
   * Calculate average correlation of strategy combination
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {number} 平均相关性 / Average correlation
   * @private
   */
  _calculateAverageCorrelation(strategies) {
    if (strategies.length < 2) return 0;

    let totalCorr = 0;
    let count = 0;

    for (let i = 0; i < strategies.length; i++) {
      for (let j = i + 1; j < strategies.length; j++) {
        const result = this.calculateCorrelation(strategies[i], strategies[j]);
        if (result.correlation !== null) {
          totalCorr += Math.abs(result.correlation);
          count++;
        }
      }
    }

    return count > 0 ? totalCorr / count : 0;
  }

  /**
   * 获取子矩阵
   * Get sub-matrix
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 子矩阵 / Sub-matrix
   * @private
   */
  _getSubMatrix(strategies) {
    const n = strategies.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const result = this.calculateCorrelation(strategies[i], strategies[j]);
        const corr = result.correlation || 0;
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }

    return { strategies, matrix };
  }

  /**
   * t分布p值近似计算
   * Approximate t-distribution p-value
   *
   * @param {number} t - t统计量 / t-statistic
   * @param {number} df - 自由度 / degrees of freedom
   * @returns {number} p值 / p-value
   * @private
   */
  _tDistributionPValue(t, df) {
    // 简化的近似计算 / Simplified approximation
    const x = df / (df + t * t);
    return x < 0.5 ? x : 1 - x;
  }

  /**
   * 更新矩阵
   * Update matrices
   * @private
   */
  _updateMatrices() {
    if (this.strategies.length < 2) return;

    this.buildCorrelationMatrix();
    this.buildCovarianceMatrix();

    // 检查高相关性警告 / Check high correlation warnings
    const highCorr = this.findHighCorrelationPairs();
    if (highCorr.length > 0) {
      this.emit('highCorrelationWarning', {
        pairs: highCorr,
        timestamp: Date.now(),
      });

      this.log(`发现${highCorr.length}对高相关策略 / Found ${highCorr.length} high correlation pairs`, 'warn');
    }

    this.lastUpdateTime = Date.now();
    this.emit('matricesUpdated', {
      correlationMatrix: this.correlationMatrix,
      covarianceMatrix: this.covarianceMatrix,
    });
  }

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 获取分析器状态
   * Get analyzer status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    return {
      running: this.running,
      strategies: this.strategies,
      strategyCount: this.strategies.length,
      dataPointCounts: Object.fromEntries(
        this.strategies.map(s => [s, (this.strategyReturns.get(s) || []).length])
      ),
      hasCorrelationMatrix: !!this.correlationMatrix,
      hasCovarianceMatrix: !!this.covarianceMatrix,
      lastUpdateTime: this.lastUpdateTime,
      config: {
        rollingWindow: this.config.rollingWindow,
        lowCorrelationThreshold: this.config.lowCorrelationThreshold,
        highCorrelationWarning: this.config.highCorrelationWarning,
      },
    };
  }

  /**
   * 获取完整分析报告
   * Get full analysis report
   *
   * @returns {Object} 分析报告 / Analysis report
   */
  getAnalysisReport() {
    // 确保矩阵是最新的 / Ensure matrices are up to date
    this.buildCorrelationMatrix();
    this.buildCovarianceMatrix();

    const lowCorr = this.findLowCorrelationPairs();
    const highCorr = this.findHighCorrelationPairs();
    const optimal = this.getOptimalCombination(3);

    return {
      timestamp: Date.now(),
      strategies: this.strategies,
      correlationMatrix: this.correlationMatrix,
      covarianceMatrix: this.covarianceMatrix,
      lowCorrelationPairs: lowCorr,
      highCorrelationPairs: highCorr,
      optimalCombination: optimal,
      summary: {
        totalStrategies: this.strategies.length,
        lowCorrelationCount: lowCorr.length,
        highCorrelationCount: highCorr.length,
        averageCorrelation: this._calculateAverageCorrelation(this.strategies),
      },
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

export { CORRELATION_LEVEL, DEFAULT_CONFIG };
export default CorrelationAnalyzer;
