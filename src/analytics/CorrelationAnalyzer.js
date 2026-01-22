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

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import Decimal from 'decimal.js'; // 导入模块 decimal.js

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 相关性级别
 * Correlation level
 */
const CORRELATION_LEVEL = { // 定义常量 CORRELATION_LEVEL
  VERY_LOW: 'very_low',       // < 0.2 非常低 / Very low
  LOW: 'low',                 // 0.2 - 0.4 低 / Low
  MODERATE: 'moderate',       // 0.4 - 0.6 中等 / Moderate
  HIGH: 'high',               // 0.6 - 0.8 高 / High
  VERY_HIGH: 'very_high',     // > 0.8 非常高 / Very high
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // 滚动窗口大小 (数据点数量) / Rolling window size (number of data points)
  rollingWindow: 30, // 设置 rollingWindow 字段

  // 最小数据点数量 / Minimum data points required
  minDataPoints: 10, // 设置 minDataPoints 字段

  // 低相关性阈值 / Low correlation threshold
  lowCorrelationThreshold: 0.3, // 设置 lowCorrelationThreshold 字段

  // 高相关性警告阈值 / High correlation warning threshold
  highCorrelationWarning: 0.7, // 设置 highCorrelationWarning 字段

  // 相关性更新间隔 (毫秒) / Correlation update interval (ms)
  updateInterval: 60000, // 设置 updateInterval 字段

  // 是否启用详细日志 / Enable verbose logging
  verbose: false, // 设置 verbose 字段

  // 日志前缀 / Log prefix
  logPrefix: '[CorrelationAnalyzer]', // 设置 logPrefix 字段
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 策略相关性分析器
 * Strategy Correlation Analyzer
 */
export class CorrelationAnalyzer extends EventEmitter { // 导出类 CorrelationAnalyzer
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

    // 策略收益数据存储 / Strategy returns data storage
    // 格式: { strategyId: [{ timestamp, return, equity }, ...] }
    this.strategyReturns = new Map(); // 设置 strategyReturns

    // 相关性矩阵缓存 / Correlation matrix cache
    this.correlationMatrix = null; // 设置 correlationMatrix

    // 协方差矩阵缓存 / Covariance matrix cache
    this.covarianceMatrix = null; // 设置 covarianceMatrix

    // 策略列表 / Strategy list
    this.strategies = []; // 设置 strategies

    // 最后更新时间 / Last update time
    this.lastUpdateTime = 0; // 设置 lastUpdateTime

    // 定时器 / Timer
    this.updateTimer = null; // 设置 updateTimer

    // 运行状态 / Running state
    this.running = false; // 设置 running
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 启动分析器
   * Start analyzer
   */
  start() { // 调用 start
    if (this.running) return; // 条件判断 this.running

    this.running = true; // 设置 running

    // 启动定时更新 / Start periodic update
    this.updateTimer = setInterval( // 设置 updateTimer
      () => this._updateMatrices(), // 定义箭头函数
      this.config.updateInterval // 访问 config
    ); // 结束调用或参数

    this.log('相关性分析器已启动 / Correlation analyzer started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止分析器
   * Stop analyzer
   */
  stop() { // 调用 stop
    if (!this.running) return; // 条件判断 !this.running

    this.running = false; // 设置 running

    if (this.updateTimer) { // 条件判断 this.updateTimer
      clearInterval(this.updateTimer); // 调用 clearInterval
      this.updateTimer = null; // 设置 updateTimer
    } // 结束代码块

    this.log('相关性分析器已停止 / Correlation analyzer stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

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
  registerStrategy(strategyId, metadata = {}) { // 调用 registerStrategy
    if (!this.strategies.includes(strategyId)) { // 条件判断 !this.strategies.includes(strategyId)
      this.strategies.push(strategyId); // 访问 strategies
      this.strategyReturns.set(strategyId, []); // 访问 strategyReturns

      this.log(`注册策略: ${strategyId} / Strategy registered: ${strategyId}`, 'info'); // 调用 log
      this.emit('strategyRegistered', { strategyId, metadata }); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 移除策略
   * Remove strategy
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   */
  removeStrategy(strategyId) { // 调用 removeStrategy
    const index = this.strategies.indexOf(strategyId); // 定义常量 index
    if (index > -1) { // 条件判断 index > -1
      this.strategies.splice(index, 1); // 访问 strategies
      this.strategyReturns.delete(strategyId); // 访问 strategyReturns

      // 重新计算矩阵 / Recalculate matrices
      this._updateMatrices(); // 调用 _updateMatrices

      this.log(`移除策略: ${strategyId} / Strategy removed: ${strategyId}`, 'info'); // 调用 log
      this.emit('strategyRemoved', { strategyId }); // 调用 emit
    } // 结束代码块
  } // 结束代码块

  /**
   * 记录策略收益
   * Record strategy return
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {number} returnValue - 收益率 / Return value
   * @param {number} equity - 权益 / Equity
   * @param {number} timestamp - 时间戳 / Timestamp
   */
  recordReturn(strategyId, returnValue, equity = null, timestamp = Date.now()) { // 调用 recordReturn
    // 确保策略已注册 / Ensure strategy is registered
    if (!this.strategyReturns.has(strategyId)) { // 条件判断 !this.strategyReturns.has(strategyId)
      this.registerStrategy(strategyId); // 调用 registerStrategy
    } // 结束代码块

    // 获取收益数组 / Get returns array
    const returns = this.strategyReturns.get(strategyId); // 定义常量 returns

    // 添加新数据点 / Add new data point
    returns.push({ // 调用 returns.push
      timestamp, // 执行语句
      return: returnValue, // 返回结果
      equity, // 执行语句
    }); // 结束代码块

    // 保持窗口大小 / Maintain window size
    const maxSize = this.config.rollingWindow * 2; // 定义常量 maxSize
    if (returns.length > maxSize) { // 条件判断 returns.length > maxSize
      returns.splice(0, returns.length - maxSize); // 调用 returns.splice
    } // 结束代码块

    // 触发数据更新事件 / Emit data update event
    this.emit('returnRecorded', { strategyId, returnValue, equity, timestamp }); // 调用 emit
  } // 结束代码块

  /**
   * 从权益曲线计算收益率
   * Calculate returns from equity curve
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Array} equityCurve - 权益曲线 [{ timestamp, equity }, ...]
   */
  loadEquityCurve(strategyId, equityCurve) { // 调用 loadEquityCurve
    if (!equityCurve || equityCurve.length < 2) { // 条件判断 !equityCurve || equityCurve.length < 2
      this.log(`权益曲线数据不足: ${strategyId} / Insufficient equity curve: ${strategyId}`, 'warn'); // 调用 log
      return; // 返回结果
    } // 结束代码块

    // 确保策略已注册 / Ensure strategy is registered
    if (!this.strategyReturns.has(strategyId)) { // 条件判断 !this.strategyReturns.has(strategyId)
      this.registerStrategy(strategyId); // 调用 registerStrategy
    } // 结束代码块

    // 计算收益率 / Calculate returns
    const returns = []; // 定义常量 returns
    for (let i = 1; i < equityCurve.length; i++) { // 循环 let i = 1; i < equityCurve.length; i++
      const prevEquity = equityCurve[i - 1].equity; // 定义常量 prevEquity
      const currEquity = equityCurve[i].equity; // 定义常量 currEquity

      if (prevEquity > 0) { // 条件判断 prevEquity > 0
        const returnValue = (currEquity - prevEquity) / prevEquity; // 定义常量 returnValue
        returns.push({ // 调用 returns.push
          timestamp: equityCurve[i].timestamp, // 设置 timestamp 字段
          return: returnValue, // 返回结果
          equity: currEquity, // 设置 equity 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 替换收益数据 / Replace returns data
    this.strategyReturns.set(strategyId, returns); // 访问 strategyReturns

    this.log(`加载权益曲线: ${strategyId}, ${returns.length}个数据点 / Loaded equity curve: ${strategyId}, ${returns.length} points`, 'info'); // 调用 log
  } // 结束代码块

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
  calculateCorrelation(strategyA, strategyB, window = null) { // 调用 calculateCorrelation
    const windowSize = window || this.config.rollingWindow; // 定义常量 windowSize

    // 获取收益数据 / Get returns data
    const returnsA = this.strategyReturns.get(strategyA); // 定义常量 returnsA
    const returnsB = this.strategyReturns.get(strategyB); // 定义常量 returnsB

    // 检查数据 / Check data
    if (!returnsA || !returnsB) { // 条件判断 !returnsA || !returnsB
      return { // 返回结果
        correlation: null, // 设置 correlation 字段
        error: '策略数据不存在 / Strategy data not found', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    // 对齐时间序列 / Align time series
    const aligned = this._alignTimeSeries(returnsA, returnsB, windowSize); // 定义常量 aligned

    if (aligned.length < this.config.minDataPoints) { // 条件判断 aligned.length < this.config.minDataPoints
      return { // 返回结果
        correlation: null, // 设置 correlation 字段
        dataPoints: aligned.length, // 设置 dataPoints 字段
        error: `数据点不足 (${aligned.length} < ${this.config.minDataPoints}) / Insufficient data points`, // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    // 提取收益率数组 / Extract return arrays
    const x = aligned.map(d => d.returnA); // 定义函数 x
    const y = aligned.map(d => d.returnB); // 定义函数 y

    // 计算 Pearson 相关系数 / Calculate Pearson correlation
    const correlation = this._pearsonCorrelation(x, y); // 定义常量 correlation

    // 计算统计显著性 (t检验) / Calculate statistical significance (t-test)
    const tStat = correlation * Math.sqrt((aligned.length - 2) / (1 - correlation * correlation)); // 定义常量 tStat
    const pValue = this._tDistributionPValue(tStat, aligned.length - 2); // 定义常量 pValue

    // 确定相关性级别 / Determine correlation level
    const level = this._getCorrelationLevel(Math.abs(correlation)); // 定义常量 level

    return { // 返回结果
      strategyA, // 执行语句
      strategyB, // 执行语句
      correlation, // 执行语句
      absoluteCorrelation: Math.abs(correlation), // 设置 absoluteCorrelation 字段
      level, // 执行语句
      dataPoints: aligned.length, // 设置 dataPoints 字段
      tStatistic: tStat, // 设置 tStatistic 字段
      pValue, // 执行语句
      significant: pValue < 0.05, // 设置 significant 字段
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算 Pearson 相关系数
   * Calculate Pearson correlation coefficient
   *
   * @param {Array<number>} x - 数组X / Array X
   * @param {Array<number>} y - 数组Y / Array Y
   * @returns {number} 相关系数 / Correlation coefficient
   * @private
   */
  _pearsonCorrelation(x, y) { // 调用 _pearsonCorrelation
    const n = x.length; // 定义常量 n
    if (n !== y.length || n === 0) return NaN; // 条件判断 n !== y.length || n === 0

    // 计算均值 / Calculate means
    const meanX = x.reduce((a, b) => a + b, 0) / n; // 定义函数 meanX
    const meanY = y.reduce((a, b) => a + b, 0) / n; // 定义函数 meanY

    // 计算协方差和标准差 / Calculate covariance and standard deviations
    let covXY = 0; // 定义变量 covXY
    let varX = 0; // 定义变量 varX
    let varY = 0; // 定义变量 varY

    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      const dx = x[i] - meanX; // 定义常量 dx
      const dy = y[i] - meanY; // 定义常量 dy
      covXY += dx * dy; // 执行语句
      varX += dx * dx; // 执行语句
      varY += dy * dy; // 执行语句
    } // 结束代码块

    // 防止除零 / Prevent division by zero
    if (varX === 0 || varY === 0) return 0; // 条件判断 varX === 0 || varY === 0

    // Pearson 相关系数 = Cov(X,Y) / (Std(X) * Std(Y))
    return covXY / Math.sqrt(varX * varY); // 返回结果
  } // 结束代码块

  /**
   * 计算 Spearman 秩相关系数
   * Calculate Spearman rank correlation coefficient
   *
   * @param {Array<number>} x - 数组X / Array X
   * @param {Array<number>} y - 数组Y / Array Y
   * @returns {number} 相关系数 / Correlation coefficient
   */
  spearmanCorrelation(x, y) { // 调用 spearmanCorrelation
    const n = x.length; // 定义常量 n
    if (n !== y.length || n === 0) return NaN; // 条件判断 n !== y.length || n === 0

    // 转换为秩 / Convert to ranks
    const rankX = this._getRanks(x); // 定义常量 rankX
    const rankY = this._getRanks(y); // 定义常量 rankY

    // 使用 Pearson 公式计算秩相关 / Use Pearson formula on ranks
    return this._pearsonCorrelation(rankX, rankY); // 返回结果
  } // 结束代码块

  /**
   * 获取数组的秩
   * Get ranks of array
   *
   * @param {Array<number>} arr - 输入数组 / Input array
   * @returns {Array<number>} 秩数组 / Rank array
   * @private
   */
  _getRanks(arr) { // 调用 _getRanks
    const sorted = arr.map((v, i) => ({ value: v, index: i })) // 定义函数 sorted
      .sort((a, b) => a.value - b.value); // 定义箭头函数

    const ranks = new Array(arr.length); // 定义常量 ranks
    for (let i = 0; i < sorted.length; i++) { // 循环 let i = 0; i < sorted.length; i++
      ranks[sorted[i].index] = i + 1; // 执行语句
    } // 结束代码块

    return ranks; // 返回结果
  } // 结束代码块

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
  buildCorrelationMatrix(window = null) { // 调用 buildCorrelationMatrix
    const strategies = this.strategies; // 定义常量 strategies
    const n = strategies.length; // 定义常量 n

    if (n < 2) { // 条件判断 n < 2
      return { // 返回结果
        strategies: [], // 设置 strategies 字段
        matrix: [], // 设置 matrix 字段
        error: '至少需要2个策略 / At least 2 strategies required', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    // 初始化矩阵 / Initialize matrix
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0)); // 定义函数 matrix
    const details = []; // 定义常量 details

    // 计算两两相关性 / Calculate pairwise correlations
    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      matrix[i][i] = 1; // 对角线为1 / Diagonal is 1

      for (let j = i + 1; j < n; j++) { // 循环 let j = i + 1; j < n; j++
        const result = this.calculateCorrelation(strategies[i], strategies[j], window); // 定义常量 result
        const corr = result.correlation || 0; // 定义常量 corr

        matrix[i][j] = corr; // 执行语句
        matrix[j][i] = corr; // 执行语句

        details.push({ // 调用 details.push
          pair: [strategies[i], strategies[j]], // 设置 pair 字段
          ...result, // 展开对象或数组
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 缓存结果 / Cache result
    this.correlationMatrix = { // 设置 correlationMatrix
      strategies, // 执行语句
      matrix, // 执行语句
      details, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块

    return this.correlationMatrix; // 返回结果
  } // 结束代码块

  /**
   * 构建协方差矩阵
   * Build covariance matrix
   *
   * @param {number} window - 窗口大小 / Window size
   * @returns {Object} 协方差矩阵 / Covariance matrix
   */
  buildCovarianceMatrix(window = null) { // 调用 buildCovarianceMatrix
    const windowSize = window || this.config.rollingWindow; // 定义常量 windowSize
    const strategies = this.strategies; // 定义常量 strategies
    const n = strategies.length; // 定义常量 n

    if (n < 2) { // 条件判断 n < 2
      return { // 返回结果
        strategies: [], // 设置 strategies 字段
        matrix: [], // 设置 matrix 字段
        error: '至少需要2个策略 / At least 2 strategies required', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    // 获取对齐的收益数据 / Get aligned return data
    const alignedReturns = this._alignAllStrategies(windowSize); // 定义常量 alignedReturns

    if (alignedReturns.length < this.config.minDataPoints) { // 条件判断 alignedReturns.length < this.config.minDataPo...
      return { // 返回结果
        strategies, // 执行语句
        matrix: [], // 设置 matrix 字段
        error: '数据点不足 / Insufficient data points', // 设置 error 字段
      }; // 结束代码块
    } // 结束代码块

    // 计算均值 / Calculate means
    const means = strategies.map((_, idx) => { // 定义函数 means
      const returns = alignedReturns.map(d => d.returns[idx]); // 定义函数 returns
      return returns.reduce((a, b) => a + b, 0) / returns.length; // 返回结果
    }); // 结束代码块

    // 初始化协方差矩阵 / Initialize covariance matrix
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0)); // 定义函数 matrix
    const m = alignedReturns.length; // 定义常量 m

    // 计算协方差 / Calculate covariance
    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      for (let j = i; j < n; j++) { // 循环 let j = i; j < n; j++
        let cov = 0; // 定义变量 cov
        for (let k = 0; k < m; k++) { // 循环 let k = 0; k < m; k++
          cov += (alignedReturns[k].returns[i] - means[i]) * // 执行语句
                 (alignedReturns[k].returns[j] - means[j]); // 执行语句
        } // 结束代码块
        cov /= (m - 1); // 样本协方差 / Sample covariance

        matrix[i][j] = cov; // 执行语句
        matrix[j][i] = cov; // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 计算标准差 / Calculate standard deviations
    const stdDevs = strategies.map((_, idx) => Math.sqrt(matrix[idx][idx])); // 定义函数 stdDevs

    // 缓存结果 / Cache result
    this.covarianceMatrix = { // 设置 covarianceMatrix
      strategies, // 执行语句
      matrix, // 执行语句
      means, // 执行语句
      stdDevs, // 执行语句
      dataPoints: m, // 设置 dataPoints 字段
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块

    return this.covarianceMatrix; // 返回结果
  } // 结束代码块

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
  findLowCorrelationPairs(threshold = null) { // 调用 findLowCorrelationPairs
    const thresholdValue = threshold || this.config.lowCorrelationThreshold; // 定义常量 thresholdValue

    // 确保矩阵是最新的 / Ensure matrix is up to date
    if (!this.correlationMatrix || Date.now() - this.correlationMatrix.timestamp > this.config.updateInterval) { // 条件判断 !this.correlationMatrix || Date.now() - this....
      this.buildCorrelationMatrix(); // 调用 buildCorrelationMatrix
    } // 结束代码块

    if (!this.correlationMatrix || !this.correlationMatrix.details) { // 条件判断 !this.correlationMatrix || !this.correlationM...
      return []; // 返回结果
    } // 结束代码块

    // 筛选低相关策略对 / Filter low correlation pairs
    const lowCorrelationPairs = this.correlationMatrix.details // 定义常量 lowCorrelationPairs
      .filter(d => d.correlation !== null && Math.abs(d.correlation) < thresholdValue) // 定义箭头函数
      .sort((a, b) => Math.abs(a.correlation) - Math.abs(b.correlation)) // 定义箭头函数
      .map(d => ({ // 定义箭头函数
        strategies: d.pair, // 设置 strategies 字段
        correlation: d.correlation, // 设置 correlation 字段
        absoluteCorrelation: Math.abs(d.correlation), // 设置 absoluteCorrelation 字段
        level: d.level, // 设置 level 字段
        recommendation: this._getRecommendation(d.correlation), // 设置 recommendation 字段
      })); // 结束代码块

    return lowCorrelationPairs; // 返回结果
  } // 结束代码块

  /**
   * 找出高相关策略组合 (风险警告)
   * Find high correlation strategy pairs (risk warning)
   *
   * @param {number} threshold - 相关性阈值 / Correlation threshold
   * @returns {Array} 高相关策略对列表 / High correlation pairs list
   */
  findHighCorrelationPairs(threshold = null) { // 调用 findHighCorrelationPairs
    const thresholdValue = threshold || this.config.highCorrelationWarning; // 定义常量 thresholdValue

    // 确保矩阵是最新的 / Ensure matrix is up to date
    if (!this.correlationMatrix || Date.now() - this.correlationMatrix.timestamp > this.config.updateInterval) { // 条件判断 !this.correlationMatrix || Date.now() - this....
      this.buildCorrelationMatrix(); // 调用 buildCorrelationMatrix
    } // 结束代码块

    if (!this.correlationMatrix || !this.correlationMatrix.details) { // 条件判断 !this.correlationMatrix || !this.correlationM...
      return []; // 返回结果
    } // 结束代码块

    // 筛选高相关策略对 / Filter high correlation pairs
    const highCorrelationPairs = this.correlationMatrix.details // 定义常量 highCorrelationPairs
      .filter(d => d.correlation !== null && Math.abs(d.correlation) >= thresholdValue) // 定义箭头函数
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)) // 定义箭头函数
      .map(d => ({ // 定义箭头函数
        strategies: d.pair, // 设置 strategies 字段
        correlation: d.correlation, // 设置 correlation 字段
        absoluteCorrelation: Math.abs(d.correlation), // 设置 absoluteCorrelation 字段
        level: d.level, // 设置 level 字段
        warning: '高相关性可能导致集中风险 / High correlation may cause concentrated risk', // 设置 warning 字段
      })); // 结束代码块

    return highCorrelationPairs; // 返回结果
  } // 结束代码块

  /**
   * 获取最优策略组合 (最小化平均相关性)
   * Get optimal strategy combination (minimize average correlation)
   *
   * @param {number} targetCount - 目标策略数量 / Target strategy count
   * @returns {Object} 最优组合 / Optimal combination
   */
  getOptimalCombination(targetCount = 3) { // 调用 getOptimalCombination
    const strategies = this.strategies; // 定义常量 strategies
    const n = strategies.length; // 定义常量 n

    if (n < targetCount) { // 条件判断 n < targetCount
      return { // 返回结果
        strategies: strategies, // 设置 strategies 字段
        averageCorrelation: this._calculateAverageCorrelation(strategies), // 设置 averageCorrelation 字段
        message: '可用策略数量不足 / Insufficient available strategies', // 设置 message 字段
      }; // 结束代码块
    } // 结束代码块

    // 确保矩阵是最新的 / Ensure matrix is up to date
    this.buildCorrelationMatrix(); // 调用 buildCorrelationMatrix

    if (!this.correlationMatrix) { // 条件判断 !this.correlationMatrix
      return { strategies: [], error: '无法构建相关性矩阵 / Cannot build correlation matrix' }; // 返回结果
    } // 结束代码块

    // 贪心算法选择低相关策略 / Greedy algorithm to select low correlation strategies
    const selected = [strategies[0]]; // 定义常量 selected
    const remaining = strategies.slice(1); // 定义常量 remaining

    while (selected.length < targetCount && remaining.length > 0) { // 循环条件 selected.length < targetCount && remaining.le...
      let bestCandidate = null; // 定义变量 bestCandidate
      let lowestAvgCorr = Infinity; // 定义变量 lowestAvgCorr

      for (const candidate of remaining) { // 循环 const candidate of remaining
        // 计算候选策略与已选策略的平均相关性
        // Calculate average correlation between candidate and selected
        let totalCorr = 0; // 定义变量 totalCorr
        for (const s of selected) { // 循环 const s of selected
          const result = this.calculateCorrelation(candidate, s); // 定义常量 result
          totalCorr += Math.abs(result.correlation || 0); // 执行语句
        } // 结束代码块
        const avgCorr = totalCorr / selected.length; // 定义常量 avgCorr

        if (avgCorr < lowestAvgCorr) { // 条件判断 avgCorr < lowestAvgCorr
          lowestAvgCorr = avgCorr; // 赋值 lowestAvgCorr
          bestCandidate = candidate; // 赋值 bestCandidate
        } // 结束代码块
      } // 结束代码块

      if (bestCandidate) { // 条件判断 bestCandidate
        selected.push(bestCandidate); // 调用 selected.push
        remaining.splice(remaining.indexOf(bestCandidate), 1); // 调用 remaining.splice
      } else { // 执行语句
        break; // 跳出循环或分支
      } // 结束代码块
    } // 结束代码块

    return { // 返回结果
      strategies: selected, // 设置 strategies 字段
      averageCorrelation: this._calculateAverageCorrelation(selected), // 设置 averageCorrelation 字段
      correlationMatrix: this._getSubMatrix(selected), // 设置 correlationMatrix 字段
      recommendation: '基于最小相关性的组合 / Combination based on minimum correlation', // 设置 recommendation 字段
    }; // 结束代码块
  } // 结束代码块

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
  calculateRollingCorrelation(strategyA, strategyB, window = null) { // 调用 calculateRollingCorrelation
    const windowSize = window || this.config.rollingWindow; // 定义常量 windowSize

    const returnsA = this.strategyReturns.get(strategyA); // 定义常量 returnsA
    const returnsB = this.strategyReturns.get(strategyB); // 定义常量 returnsB

    if (!returnsA || !returnsB) { // 条件判断 !returnsA || !returnsB
      return []; // 返回结果
    } // 结束代码块

    // 对齐时间序列 / Align time series
    const aligned = this._alignTimeSeries(returnsA, returnsB, Infinity); // 定义常量 aligned

    if (aligned.length < windowSize) { // 条件判断 aligned.length < windowSize
      return []; // 返回结果
    } // 结束代码块

    // 计算滚动相关性 / Calculate rolling correlation
    const rollingCorr = []; // 定义常量 rollingCorr

    for (let i = windowSize; i <= aligned.length; i++) { // 循环 let i = windowSize; i <= aligned.length; i++
      const windowData = aligned.slice(i - windowSize, i); // 定义常量 windowData
      const x = windowData.map(d => d.returnA); // 定义函数 x
      const y = windowData.map(d => d.returnB); // 定义函数 y
      const corr = this._pearsonCorrelation(x, y); // 定义常量 corr

      rollingCorr.push({ // 调用 rollingCorr.push
        timestamp: aligned[i - 1].timestamp, // 设置 timestamp 字段
        correlation: corr, // 设置 correlation 字段
        level: this._getCorrelationLevel(Math.abs(corr)), // 设置 level 字段
      }); // 结束代码块
    } // 结束代码块

    return rollingCorr; // 返回结果
  } // 结束代码块

  /**
   * 检测相关性突变
   * Detect correlation regime change
   *
   * @param {string} strategyA - 策略A ID / Strategy A ID
   * @param {string} strategyB - 策略B ID / Strategy B ID
   * @param {number} threshold - 变化阈值 / Change threshold
   * @returns {Object} 突变检测结果 / Regime change detection result
   */
  detectCorrelationRegimeChange(strategyA, strategyB, threshold = 0.3) { // 调用 detectCorrelationRegimeChange
    const rolling = this.calculateRollingCorrelation(strategyA, strategyB); // 定义常量 rolling

    if (rolling.length < 2) { // 条件判断 rolling.length < 2
      return { detected: false, message: '数据不足 / Insufficient data' }; // 返回结果
    } // 结束代码块

    // 比较最近相关性与历史平均 / Compare recent correlation with historical average
    const recent = rolling.slice(-5); // 定义常量 recent
    const historical = rolling.slice(0, -5); // 定义常量 historical

    if (historical.length < 5) { // 条件判断 historical.length < 5
      return { detected: false, message: '历史数据不足 / Insufficient historical data' }; // 返回结果
    } // 结束代码块

    const recentAvg = recent.reduce((a, b) => a + b.correlation, 0) / recent.length; // 定义函数 recentAvg
    const historicalAvg = historical.reduce((a, b) => a + b.correlation, 0) / historical.length; // 定义函数 historicalAvg
    const change = Math.abs(recentAvg - historicalAvg); // 定义常量 change

    const detected = change >= threshold; // 定义常量 detected

    return { // 返回结果
      detected, // 执行语句
      recentCorrelation: recentAvg, // 设置 recentCorrelation 字段
      historicalCorrelation: historicalAvg, // 设置 historicalCorrelation 字段
      change, // 执行语句
      threshold, // 执行语句
      direction: recentAvg > historicalAvg ? 'increasing' : 'decreasing', // 设置 direction 字段
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块
  } // 结束代码块

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
  _alignTimeSeries(seriesA, seriesB, maxPoints) { // 调用 _alignTimeSeries
    // 创建时间戳映射 / Create timestamp mapping
    const mapA = new Map(seriesA.map(d => [d.timestamp, d.return])); // 定义函数 mapA
    const mapB = new Map(seriesB.map(d => [d.timestamp, d.return])); // 定义函数 mapB

    // 找出共同时间戳 / Find common timestamps
    const commonTimestamps = [...mapA.keys()].filter(t => mapB.has(t)).sort((a, b) => a - b); // 定义函数 commonTimestamps

    // 取最近的数据点 / Take recent data points
    const timestamps = commonTimestamps.slice(-maxPoints); // 定义常量 timestamps

    return timestamps.map(t => ({ // 返回结果
      timestamp: t, // 设置 timestamp 字段
      returnA: mapA.get(t), // 设置 returnA 字段
      returnB: mapB.get(t), // 设置 returnB 字段
    })); // 结束代码块
  } // 结束代码块

  /**
   * 对齐所有策略的时间序列
   * Align all strategies' time series
   *
   * @param {number} maxPoints - 最大数据点 / Max data points
   * @returns {Array} 对齐后的数据 / Aligned data
   * @private
   */
  _alignAllStrategies(maxPoints) { // 调用 _alignAllStrategies
    if (this.strategies.length === 0) return []; // 条件判断 this.strategies.length === 0

    // 获取所有时间戳 / Get all timestamps
    const timestampSets = this.strategies.map(s => { // 定义函数 timestampSets
      const returns = this.strategyReturns.get(s) || []; // 定义常量 returns
      return new Set(returns.map(d => d.timestamp)); // 返回结果
    }); // 结束代码块

    // 找出共同时间戳 / Find common timestamps
    let commonTimestamps = [...timestampSets[0]]; // 定义变量 commonTimestamps
    for (let i = 1; i < timestampSets.length; i++) { // 循环 let i = 1; i < timestampSets.length; i++
      commonTimestamps = commonTimestamps.filter(t => timestampSets[i].has(t)); // 赋值 commonTimestamps
    } // 结束代码块

    // 排序并取最近的数据点 / Sort and take recent data points
    commonTimestamps.sort((a, b) => a - b); // 调用 commonTimestamps.sort
    const timestamps = commonTimestamps.slice(-maxPoints); // 定义常量 timestamps

    // 构建对齐数据 / Build aligned data
    return timestamps.map(t => { // 返回结果
      const returns = this.strategies.map(s => { // 定义函数 returns
        const data = this.strategyReturns.get(s) || []; // 定义常量 data
        const point = data.find(d => d.timestamp === t); // 定义函数 point
        return point ? point.return : 0; // 返回结果
      }); // 结束代码块
      return { timestamp: t, returns }; // 返回结果
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取相关性级别
   * Get correlation level
   *
   * @param {number} absCorr - 相关系数绝对值 / Absolute correlation
   * @returns {string} 相关性级别 / Correlation level
   * @private
   */
  _getCorrelationLevel(absCorr) { // 调用 _getCorrelationLevel
    if (absCorr < 0.2) return CORRELATION_LEVEL.VERY_LOW; // 条件判断 absCorr < 0.2
    if (absCorr < 0.4) return CORRELATION_LEVEL.LOW; // 条件判断 absCorr < 0.4
    if (absCorr < 0.6) return CORRELATION_LEVEL.MODERATE; // 条件判断 absCorr < 0.6
    if (absCorr < 0.8) return CORRELATION_LEVEL.HIGH; // 条件判断 absCorr < 0.8
    return CORRELATION_LEVEL.VERY_HIGH; // 返回结果
  } // 结束代码块

  /**
   * 获取投资建议
   * Get investment recommendation
   *
   * @param {number} correlation - 相关系数 / Correlation
   * @returns {string} 建议 / Recommendation
   * @private
   */
  _getRecommendation(correlation) { // 调用 _getRecommendation
    const absCorr = Math.abs(correlation); // 定义常量 absCorr
    if (absCorr < 0.2) { // 条件判断 absCorr < 0.2
      return '极佳的分散化组合 / Excellent diversification'; // 返回结果
    } else if (absCorr < 0.4) { // 执行语句
      return '良好的分散化效果 / Good diversification'; // 返回结果
    } else if (absCorr < 0.6) { // 执行语句
      return '适度分散 / Moderate diversification'; // 返回结果
    } else { // 执行语句
      return '分散化效果有限 / Limited diversification'; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 计算策略组合的平均相关性
   * Calculate average correlation of strategy combination
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {number} 平均相关性 / Average correlation
   * @private
   */
  _calculateAverageCorrelation(strategies) { // 调用 _calculateAverageCorrelation
    if (strategies.length < 2) return 0; // 条件判断 strategies.length < 2

    let totalCorr = 0; // 定义变量 totalCorr
    let count = 0; // 定义变量 count

    for (let i = 0; i < strategies.length; i++) { // 循环 let i = 0; i < strategies.length; i++
      for (let j = i + 1; j < strategies.length; j++) { // 循环 let j = i + 1; j < strategies.length; j++
        const result = this.calculateCorrelation(strategies[i], strategies[j]); // 定义常量 result
        if (result.correlation !== null) { // 条件判断 result.correlation !== null
          totalCorr += Math.abs(result.correlation); // 执行语句
          count++; // 执行语句
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return count > 0 ? totalCorr / count : 0; // 返回结果
  } // 结束代码块

  /**
   * 获取子矩阵
   * Get sub-matrix
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 子矩阵 / Sub-matrix
   * @private
   */
  _getSubMatrix(strategies) { // 调用 _getSubMatrix
    const n = strategies.length; // 定义常量 n
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0)); // 定义函数 matrix

    for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
      matrix[i][i] = 1; // 执行语句
      for (let j = i + 1; j < n; j++) { // 循环 let j = i + 1; j < n; j++
        const result = this.calculateCorrelation(strategies[i], strategies[j]); // 定义常量 result
        const corr = result.correlation || 0; // 定义常量 corr
        matrix[i][j] = corr; // 执行语句
        matrix[j][i] = corr; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return { strategies, matrix }; // 返回结果
  } // 结束代码块

  /**
   * t分布p值近似计算
   * Approximate t-distribution p-value
   *
   * @param {number} t - t统计量 / t-statistic
   * @param {number} df - 自由度 / degrees of freedom
   * @returns {number} p值 / p-value
   * @private
   */
  _tDistributionPValue(t, df) { // 调用 _tDistributionPValue
    // 简化的近似计算 / Simplified approximation
    const x = df / (df + t * t); // 定义常量 x
    return x < 0.5 ? x : 1 - x; // 返回结果
  } // 结束代码块

  /**
   * 更新矩阵
   * Update matrices
   * @private
   */
  _updateMatrices() { // 调用 _updateMatrices
    if (this.strategies.length < 2) return; // 条件判断 this.strategies.length < 2

    this.buildCorrelationMatrix(); // 调用 buildCorrelationMatrix
    this.buildCovarianceMatrix(); // 调用 buildCovarianceMatrix

    // 检查高相关性警告 / Check high correlation warnings
    const highCorr = this.findHighCorrelationPairs(); // 定义常量 highCorr
    if (highCorr.length > 0) { // 条件判断 highCorr.length > 0
      this.emit('highCorrelationWarning', { // 调用 emit
        pairs: highCorr, // 设置 pairs 字段
        timestamp: Date.now(), // 设置 timestamp 字段
      }); // 结束代码块

      this.log(`发现${highCorr.length}对高相关策略 / Found ${highCorr.length} high correlation pairs`, 'warn'); // 调用 log
    } // 结束代码块

    this.lastUpdateTime = Date.now(); // 设置 lastUpdateTime
    this.emit('matricesUpdated', { // 调用 emit
      correlationMatrix: this.correlationMatrix, // 设置 correlationMatrix 字段
      covarianceMatrix: this.covarianceMatrix, // 设置 covarianceMatrix 字段
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 获取分析器状态
   * Get analyzer status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      running: this.running, // 设置 running 字段
      strategies: this.strategies, // 设置 strategies 字段
      strategyCount: this.strategies.length, // 设置 strategyCount 字段
      dataPointCounts: Object.fromEntries( // 设置 dataPointCounts 字段
        this.strategies.map(s => [s, (this.strategyReturns.get(s) || []).length]) // 访问 strategies
      ), // 结束调用或参数
      hasCorrelationMatrix: !!this.correlationMatrix, // 设置 hasCorrelationMatrix 字段
      hasCovarianceMatrix: !!this.covarianceMatrix, // 设置 hasCovarianceMatrix 字段
      lastUpdateTime: this.lastUpdateTime, // 设置 lastUpdateTime 字段
      config: { // 设置 config 字段
        rollingWindow: this.config.rollingWindow, // 设置 rollingWindow 字段
        lowCorrelationThreshold: this.config.lowCorrelationThreshold, // 设置 lowCorrelationThreshold 字段
        highCorrelationWarning: this.config.highCorrelationWarning, // 设置 highCorrelationWarning 字段
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取完整分析报告
   * Get full analysis report
   *
   * @returns {Object} 分析报告 / Analysis report
   */
  getAnalysisReport() { // 调用 getAnalysisReport
    // 确保矩阵是最新的 / Ensure matrices are up to date
    this.buildCorrelationMatrix(); // 调用 buildCorrelationMatrix
    this.buildCovarianceMatrix(); // 调用 buildCovarianceMatrix

    const lowCorr = this.findLowCorrelationPairs(); // 定义常量 lowCorr
    const highCorr = this.findHighCorrelationPairs(); // 定义常量 highCorr
    const optimal = this.getOptimalCombination(3); // 定义常量 optimal

    return { // 返回结果
      timestamp: Date.now(), // 设置 timestamp 字段
      strategies: this.strategies, // 设置 strategies 字段
      correlationMatrix: this.correlationMatrix, // 设置 correlationMatrix 字段
      covarianceMatrix: this.covarianceMatrix, // 设置 covarianceMatrix 字段
      lowCorrelationPairs: lowCorr, // 设置 lowCorrelationPairs 字段
      highCorrelationPairs: highCorr, // 设置 highCorrelationPairs 字段
      optimalCombination: optimal, // 设置 optimalCombination 字段
      summary: { // 设置 summary 字段
        totalStrategies: this.strategies.length, // 设置 totalStrategies 字段
        lowCorrelationCount: lowCorr.length, // 设置 lowCorrelationCount 字段
        highCorrelationCount: highCorr.length, // 设置 highCorrelationCount 字段
        averageCorrelation: this._calculateAverageCorrelation(this.strategies), // 设置 averageCorrelation 字段
      }, // 结束代码块
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
      default: // 默认分支
        console.log(fullMessage); // 控制台输出
        break; // 跳出循环或分支
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

// ============================================
// 导出 / Exports
// ============================================

export { CORRELATION_LEVEL, DEFAULT_CONFIG }; // 导出命名成员
export default CorrelationAnalyzer; // 默认导出
