/**
 * 资金分配器
 * Capital Allocator
 *
 * 功能 / Features:
 * 1. 等权重分配 / Equal weight allocation
 * 2. 风险平价分配 / Risk parity allocation
 * 3. 均值-方差优化 / Mean-variance optimization
 * 4. 最大夏普比率 / Maximum Sharpe ratio
 * 5. 最小相关性优化 / Minimum correlation optimization
 * 6. 动态再平衡 / Dynamic rebalancing
 * 7. 凯利准则组合 / Kelly criterion portfolio
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
 * 分配方法
 * Allocation methods
 */
const ALLOCATION_METHOD = { // 定义常量 ALLOCATION_METHOD
  EQUAL_WEIGHT: 'equal_weight',           // 等权重 / Equal weight
  RISK_PARITY: 'risk_parity',             // 风险平价 / Risk parity
  MIN_VARIANCE: 'min_variance',           // 最小方差 / Minimum variance
  MAX_SHARPE: 'max_sharpe',               // 最大夏普比率 / Maximum Sharpe
  MIN_CORRELATION: 'min_correlation',      // 最小相关性 / Minimum correlation
  KELLY: 'kelly',                         // 凯利准则 / Kelly criterion
  CUSTOM: 'custom',                       // 自定义 / Custom
}; // 结束代码块

/**
 * 再平衡触发条件
 * Rebalance trigger conditions
 */
const REBALANCE_TRIGGER = { // 定义常量 REBALANCE_TRIGGER
  THRESHOLD: 'threshold',     // 偏离阈值触发 / Threshold deviation
  PERIODIC: 'periodic',       // 周期性触发 / Periodic
  PERFORMANCE: 'performance', // 业绩触发 / Performance based
  MANUAL: 'manual',          // 手动触发 / Manual
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // 总资金 / Total capital
  totalCapital: 100000, // 设置 totalCapital 字段

  // 默认分配方法 / Default allocation method
  defaultMethod: ALLOCATION_METHOD.RISK_PARITY, // 设置 defaultMethod 字段

  // 最小策略权重 / Minimum strategy weight
  minWeight: 0.05, // 设置 minWeight 字段

  // 最大策略权重 / Maximum strategy weight
  maxWeight: 0.40, // 设置 maxWeight 字段

  // 再平衡偏离阈值 / Rebalance deviation threshold
  rebalanceThreshold: 0.05, // 设置 rebalanceThreshold 字段

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 24 * 60 * 60 * 1000, // 每天 / Daily

  // 无风险利率 (年化) / Risk-free rate (annualized)
  riskFreeRate: 0.02, // 设置 riskFreeRate 字段

  // 凯利分数 (保守调整) / Kelly fraction (conservative adjustment)
  kellyFraction: 0.25, // 设置 kellyFraction 字段

  // 是否启用杠杆 / Enable leverage
  enableLeverage: false, // 设置 enableLeverage 字段

  // 最大总杠杆 / Maximum total leverage
  maxLeverage: 1.0, // 设置 maxLeverage 字段

  // 优化迭代次数 / Optimization iterations
  optimizationIterations: 1000, // 设置 optimizationIterations 字段

  // 是否启用详细日志 / Enable verbose logging
  verbose: true, // 设置 verbose 字段

  // 日志前缀 / Log prefix
  logPrefix: '[CapitalAllocator]', // 设置 logPrefix 字段
}; // 结束代码块

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 资金分配器
 * Capital Allocator
 */
export class CapitalAllocator extends EventEmitter { // 导出类 CapitalAllocator
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

    // 策略信息 / Strategy information
    // 格式: { strategyId: { returns, volatility, sharpe, ... } }
    this.strategyStats = new Map(); // 设置 strategyStats

    // 当前分配 / Current allocation
    // 格式: { strategyId: weight }
    this.currentAllocation = new Map(); // 设置 currentAllocation

    // 目标分配 / Target allocation
    this.targetAllocation = new Map(); // 设置 targetAllocation

    // 相关性矩阵引用 / Correlation matrix reference
    this.correlationMatrix = null; // 设置 correlationMatrix

    // 协方差矩阵引用 / Covariance matrix reference
    this.covarianceMatrix = null; // 设置 covarianceMatrix

    // 分配历史 / Allocation history
    this.allocationHistory = []; // 设置 allocationHistory

    // 最后再平衡时间 / Last rebalance time
    this.lastRebalanceTime = 0; // 设置 lastRebalanceTime

    // 再平衡定时器 / Rebalance timer
    this.rebalanceTimer = null; // 设置 rebalanceTimer

    // 运行状态 / Running state
    this.running = false; // 设置 running
  } // 结束代码块

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 启动分配器
   * Start allocator
   */
  start() { // 调用 start
    if (this.running) return; // 条件判断 this.running

    this.running = true; // 设置 running

    // 启动定期再平衡 / Start periodic rebalancing
    if (this.config.rebalancePeriod > 0) { // 条件判断 this.config.rebalancePeriod > 0
      this.rebalanceTimer = setInterval( // 设置 rebalanceTimer
        () => this._checkRebalance(), // 定义箭头函数
        Math.min(this.config.rebalancePeriod / 10, 60000) // 调用 Math.min
      ); // 结束调用或参数
    } // 结束代码块

    this.log('资金分配器已启动 / Capital allocator started', 'info'); // 调用 log
    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止分配器
   * Stop allocator
   */
  stop() { // 调用 stop
    if (!this.running) return; // 条件判断 !this.running

    this.running = false; // 设置 running

    if (this.rebalanceTimer) { // 条件判断 this.rebalanceTimer
      clearInterval(this.rebalanceTimer); // 调用 clearInterval
      this.rebalanceTimer = null; // 设置 rebalanceTimer
    } // 结束代码块

    this.log('资金分配器已停止 / Capital allocator stopped', 'info'); // 调用 log
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 策略数据管理 / Strategy Data Management
  // ============================================

  /**
   * 更新策略统计
   * Update strategy statistics
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} stats - 统计数据 / Statistics
   */
  updateStrategyStats(strategyId, stats) { // 调用 updateStrategyStats
    const existing = this.strategyStats.get(strategyId) || {}; // 定义常量 existing

    this.strategyStats.set(strategyId, { // 访问 strategyStats
      ...existing, // 展开对象或数组
      ...stats, // 展开对象或数组
      updatedAt: Date.now(), // 设置 updatedAt 字段
    }); // 结束代码块

    this.emit('strategyStatsUpdated', { strategyId, stats }); // 调用 emit
  } // 结束代码块

  /**
   * 设置相关性矩阵
   * Set correlation matrix
   *
   * @param {Object} matrix - 相关性矩阵 / Correlation matrix
   */
  setCorrelationMatrix(matrix) { // 调用 setCorrelationMatrix
    this.correlationMatrix = matrix; // 设置 correlationMatrix
  } // 结束代码块

  /**
   * 设置协方差矩阵
   * Set covariance matrix
   *
   * @param {Object} matrix - 协方差矩阵 / Covariance matrix
   */
  setCovarianceMatrix(matrix) { // 调用 setCovarianceMatrix
    this.covarianceMatrix = matrix; // 设置 covarianceMatrix
  } // 结束代码块

  /**
   * 设置总资金
   * Set total capital
   *
   * @param {number} capital - 总资金 / Total capital
   */
  setTotalCapital(capital) { // 调用 setTotalCapital
    this.config.totalCapital = capital; // 访问 config
    this.emit('capitalUpdated', { totalCapital: capital }); // 调用 emit
  } // 结束代码块

  // ============================================
  // 分配方法 / Allocation Methods
  // ============================================

  /**
   * 计算资金分配
   * Calculate capital allocation
   *
   * @param {string} method - 分配方法 / Allocation method
   * @param {Object} options - 选项 / Options
   * @returns {Object} 分配结果 / Allocation result
   */
  calculateAllocation(method = null, options = {}) { // 调用 calculateAllocation
    const allocMethod = method || this.config.defaultMethod; // 定义常量 allocMethod
    const strategies = [...this.strategyStats.keys()]; // 定义常量 strategies

    if (strategies.length === 0) { // 条件判断 strategies.length === 0
      return { // 返回结果
        error: '没有注册的策略 / No registered strategies', // 设置 error 字段
        weights: {}, // 设置 weights 字段
        allocations: {}, // 设置 allocations 字段
      }; // 结束代码块
    } // 结束代码块

    let weights; // 定义变量 weights

    switch (allocMethod) { // 分支选择 allocMethod
      case ALLOCATION_METHOD.EQUAL_WEIGHT: // 分支 ALLOCATION_METHOD.EQUAL_WEIGHT
        weights = this._equalWeightAllocation(strategies); // 赋值 weights
        break; // 跳出循环或分支

      case ALLOCATION_METHOD.RISK_PARITY: // 分支 ALLOCATION_METHOD.RISK_PARITY
        weights = this._riskParityAllocation(strategies); // 赋值 weights
        break; // 跳出循环或分支

      case ALLOCATION_METHOD.MIN_VARIANCE: // 分支 ALLOCATION_METHOD.MIN_VARIANCE
        weights = this._minVarianceAllocation(strategies); // 赋值 weights
        break; // 跳出循环或分支

      case ALLOCATION_METHOD.MAX_SHARPE: // 分支 ALLOCATION_METHOD.MAX_SHARPE
        weights = this._maxSharpeAllocation(strategies); // 赋值 weights
        break; // 跳出循环或分支

      case ALLOCATION_METHOD.MIN_CORRELATION: // 分支 ALLOCATION_METHOD.MIN_CORRELATION
        weights = this._minCorrelationAllocation(strategies); // 赋值 weights
        break; // 跳出循环或分支

      case ALLOCATION_METHOD.KELLY: // 分支 ALLOCATION_METHOD.KELLY
        weights = this._kellyAllocation(strategies); // 赋值 weights
        break; // 跳出循环或分支

      case ALLOCATION_METHOD.CUSTOM: // 分支 ALLOCATION_METHOD.CUSTOM
        weights = options.customWeights || this._equalWeightAllocation(strategies); // 赋值 weights
        break; // 跳出循环或分支

      default: // 默认分支
        weights = this._equalWeightAllocation(strategies); // 赋值 weights
    } // 结束代码块

    // 应用权重约束 / Apply weight constraints
    weights = this._applyWeightConstraints(weights); // 赋值 weights

    // 计算资金分配 / Calculate capital allocation
    const allocations = this._calculateCapitalAmounts(weights); // 定义常量 allocations

    // 更新目标分配 / Update target allocation
    this.targetAllocation = new Map(Object.entries(weights)); // 设置 targetAllocation

    const result = { // 定义常量 result
      method: allocMethod, // 设置 method 字段
      weights, // 执行语句
      allocations, // 执行语句
      totalCapital: this.config.totalCapital, // 设置 totalCapital 字段
      timestamp: Date.now(), // 设置 timestamp 字段
      metrics: this._calculatePortfolioMetrics(weights), // 设置 metrics 字段
    }; // 结束代码块

    this.emit('allocationCalculated', result); // 调用 emit

    return result; // 返回结果
  } // 结束代码块

  /**
   * 等权重分配
   * Equal weight allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _equalWeightAllocation(strategies) { // 调用 _equalWeightAllocation
    const weight = 1 / strategies.length; // 定义常量 weight
    const weights = {}; // 定义常量 weights

    for (const strategy of strategies) { // 循环 const strategy of strategies
      weights[strategy] = weight; // 执行语句
    } // 结束代码块

    return weights; // 返回结果
  } // 结束代码块

  /**
   * 风险平价分配
   * Risk parity allocation
   *
   * 每个策略贡献相等的风险
   * Each strategy contributes equal risk
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _riskParityAllocation(strategies) { // 调用 _riskParityAllocation
    const weights = {}; // 定义常量 weights

    // 获取每个策略的波动率 / Get volatility of each strategy
    const volatilities = strategies.map(s => { // 定义函数 volatilities
      const stats = this.strategyStats.get(s); // 定义常量 stats
      return stats?.volatility || 0.1; // 默认10%波动率 / Default 10% volatility
    }); // 结束代码块

    // 计算风险倒数 / Calculate inverse of risk
    const inverseVols = volatilities.map(v => v > 0 ? 1 / v : 0); // 定义函数 inverseVols
    const sumInverseVols = inverseVols.reduce((a, b) => a + b, 0); // 定义函数 sumInverseVols

    // 分配权重 / Allocate weights
    if (sumInverseVols > 0) { // 条件判断 sumInverseVols > 0
      strategies.forEach((s, i) => { // 调用 strategies.forEach
        weights[s] = inverseVols[i] / sumInverseVols; // 执行语句
      }); // 结束代码块
    } else { // 执行语句
      // 回退到等权重 / Fallback to equal weight
      return this._equalWeightAllocation(strategies); // 返回结果
    } // 结束代码块

    return weights; // 返回结果
  } // 结束代码块

  /**
   * 最小方差分配
   * Minimum variance allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _minVarianceAllocation(strategies) { // 调用 _minVarianceAllocation
    if (!this.covarianceMatrix || strategies.length < 2) { // 条件判断 !this.covarianceMatrix || strategies.length < 2
      return this._riskParityAllocation(strategies); // 返回结果
    } // 结束代码块

    const n = strategies.length; // 定义常量 n
    const cov = this._extractSubCovMatrix(strategies); // 定义常量 cov

    if (!cov || cov.length !== n) { // 条件判断 !cov || cov.length !== n
      return this._riskParityAllocation(strategies); // 返回结果
    } // 结束代码块

    // 使用数值优化求解最小方差组合 / Use numerical optimization for min variance
    // 简化版本: 使用逆协方差矩阵方法 / Simplified: inverse covariance matrix method
    try { // 尝试执行
      // 计算协方差矩阵的逆 / Calculate inverse of covariance matrix
      const invCov = this._invertMatrix(cov); // 定义常量 invCov

      if (!invCov) { // 条件判断 !invCov
        return this._riskParityAllocation(strategies); // 返回结果
      } // 结束代码块

      // 计算权重: w = inv(Σ) * 1 / 1' * inv(Σ) * 1
      const ones = Array(n).fill(1); // 定义常量 ones
      const invCovOnes = this._matrixVectorMultiply(invCov, ones); // 定义常量 invCovOnes
      const sumInvCovOnes = invCovOnes.reduce((a, b) => a + b, 0); // 定义函数 sumInvCovOnes

      const weights = {}; // 定义常量 weights
      strategies.forEach((s, i) => { // 调用 strategies.forEach
        weights[s] = invCovOnes[i] / sumInvCovOnes; // 执行语句
      }); // 结束代码块

      return weights; // 返回结果

    } catch (error) { // 执行语句
      this.log(`最小方差优化失败: ${error.message}`, 'warn'); // 调用 log
      return this._riskParityAllocation(strategies); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 最大夏普比率分配
   * Maximum Sharpe ratio allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _maxSharpeAllocation(strategies) { // 调用 _maxSharpeAllocation
    if (!this.covarianceMatrix || strategies.length < 2) { // 条件判断 !this.covarianceMatrix || strategies.length < 2
      return this._riskParityAllocation(strategies); // 返回结果
    } // 结束代码块

    const n = strategies.length; // 定义常量 n
    const cov = this._extractSubCovMatrix(strategies); // 定义常量 cov

    if (!cov || cov.length !== n) { // 条件判断 !cov || cov.length !== n
      return this._riskParityAllocation(strategies); // 返回结果
    } // 结束代码块

    // 获取期望收益 / Get expected returns
    const expectedReturns = strategies.map(s => { // 定义函数 expectedReturns
      const stats = this.strategyStats.get(s); // 定义常量 stats
      return (stats?.expectedReturn || stats?.avgReturn || 0.05) - this.config.riskFreeRate; // 返回结果
    }); // 结束代码块

    try { // 尝试执行
      // 计算协方差矩阵的逆 / Calculate inverse of covariance matrix
      const invCov = this._invertMatrix(cov); // 定义常量 invCov

      if (!invCov) { // 条件判断 !invCov
        return this._riskParityAllocation(strategies); // 返回结果
      } // 结束代码块

      // 计算权重: w = inv(Σ) * μ / 1' * inv(Σ) * μ
      const invCovMu = this._matrixVectorMultiply(invCov, expectedReturns); // 定义常量 invCovMu
      const sumInvCovMu = invCovMu.reduce((a, b) => a + b, 0); // 定义函数 sumInvCovMu

      const weights = {}; // 定义常量 weights
      strategies.forEach((s, i) => { // 调用 strategies.forEach
        weights[s] = sumInvCovMu !== 0 ? invCovMu[i] / sumInvCovMu : 1 / n; // 执行语句
      }); // 结束代码块

      return weights; // 返回结果

    } catch (error) { // 执行语句
      this.log(`最大夏普优化失败: ${error.message}`, 'warn'); // 调用 log
      return this._riskParityAllocation(strategies); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 最小相关性分配
   * Minimum correlation allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _minCorrelationAllocation(strategies) { // 调用 _minCorrelationAllocation
    if (!this.correlationMatrix || strategies.length < 2) { // 条件判断 !this.correlationMatrix || strategies.length < 2
      return this._equalWeightAllocation(strategies); // 返回结果
    } // 结束代码块

    const n = strategies.length; // 定义常量 n

    // 获取平均相关性 / Get average correlation for each strategy
    const avgCorrelations = strategies.map((s, i) => { // 定义函数 avgCorrelations
      let totalCorr = 0; // 定义变量 totalCorr
      let count = 0; // 定义变量 count

      for (let j = 0; j < n; j++) { // 循环 let j = 0; j < n; j++
        if (i !== j) { // 条件判断 i !== j
          const corr = this._getCorrelation(s, strategies[j]); // 定义常量 corr
          if (corr !== null) { // 条件判断 corr !== null
            totalCorr += Math.abs(corr); // 执行语句
            count++; // 执行语句
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      return count > 0 ? totalCorr / count : 0.5; // 返回结果
    }); // 结束代码块

    // 低相关性策略获得更高权重 / Lower correlation strategies get higher weight
    const inverseCorr = avgCorrelations.map(c => 1 / (c + 0.1)); // 加0.1避免除零 / Add 0.1 to avoid division by zero
    const sumInverseCorr = inverseCorr.reduce((a, b) => a + b, 0); // 定义函数 sumInverseCorr

    const weights = {}; // 定义常量 weights
    strategies.forEach((s, i) => { // 调用 strategies.forEach
      weights[s] = inverseCorr[i] / sumInverseCorr; // 执行语句
    }); // 结束代码块

    return weights; // 返回结果
  } // 结束代码块

  /**
   * 凯利准则分配
   * Kelly criterion allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _kellyAllocation(strategies) { // 调用 _kellyAllocation
    const weights = {}; // 定义常量 weights

    // 计算每个策略的凯利比例 / Calculate Kelly fraction for each strategy
    const kellyFractions = strategies.map(s => { // 定义函数 kellyFractions
      const stats = this.strategyStats.get(s); // 定义常量 stats

      if (!stats) return 0; // 条件判断 !stats

      const winRate = stats.winRate || 0.5; // 定义常量 winRate
      const avgWin = stats.avgWin || 1; // 定义常量 avgWin
      const avgLoss = stats.avgLoss || 1; // 定义常量 avgLoss

      // 计算凯利比例: f = (bp - q) / b
      // b = 赔率 (avgWin/avgLoss), p = 胜率, q = 1-p
      const odds = avgLoss > 0 ? avgWin / avgLoss : 1; // 定义常量 odds
      let kelly = (odds * winRate - (1 - winRate)) / odds; // 定义变量 kelly

      // 限制凯利比例 / Limit Kelly fraction
      kelly = Math.max(0, Math.min(1, kelly)); // 赋值 kelly

      // 应用保守调整 / Apply conservative adjustment
      return kelly * this.config.kellyFraction; // 返回结果
    }); // 结束代码块

    // 归一化权重 / Normalize weights
    const sumKelly = kellyFractions.reduce((a, b) => a + b, 0); // 定义函数 sumKelly

    if (sumKelly > 0) { // 条件判断 sumKelly > 0
      strategies.forEach((s, i) => { // 调用 strategies.forEach
        weights[s] = kellyFractions[i] / sumKelly; // 执行语句
      }); // 结束代码块
    } else { // 执行语句
      return this._equalWeightAllocation(strategies); // 返回结果
    } // 结束代码块

    return weights; // 返回结果
  } // 结束代码块

  // ============================================
  // 权重约束 / Weight Constraints
  // ============================================

  /**
   * 应用权重约束
   * Apply weight constraints
   *
   * @param {Object} weights - 原始权重 / Original weights
   * @returns {Object} 约束后的权重 / Constrained weights
   * @private
   */
  _applyWeightConstraints(weights) { // 调用 _applyWeightConstraints
    const strategies = Object.keys(weights); // 定义常量 strategies
    let constrainedWeights = { ...weights }; // 定义变量 constrainedWeights
    let iterations = 0; // 定义变量 iterations
    const maxIterations = 100; // 定义常量 maxIterations

    // 迭代调整直到满足约束 / Iterate until constraints are met
    while (iterations < maxIterations) { // 循环条件 iterations < maxIterations
      let needsAdjustment = false; // 定义变量 needsAdjustment
      let totalWeight = 0; // 定义变量 totalWeight

      // 应用最小/最大权重约束 / Apply min/max weight constraints
      for (const s of strategies) { // 循环 const s of strategies
        let w = constrainedWeights[s]; // 定义变量 w

        if (w < this.config.minWeight) { // 条件判断 w < this.config.minWeight
          constrainedWeights[s] = this.config.minWeight; // 执行语句
          needsAdjustment = true; // 赋值 needsAdjustment
        } else if (w > this.config.maxWeight) { // 执行语句
          constrainedWeights[s] = this.config.maxWeight; // 执行语句
          needsAdjustment = true; // 赋值 needsAdjustment
        } // 结束代码块

        totalWeight += constrainedWeights[s]; // 执行语句
      } // 结束代码块

      // 归一化 / Normalize
      if (Math.abs(totalWeight - 1) > 0.0001) { // 条件判断 Math.abs(totalWeight - 1) > 0.0001
        for (const s of strategies) { // 循环 const s of strategies
          constrainedWeights[s] /= totalWeight; // 执行语句
        } // 结束代码块
        needsAdjustment = true; // 赋值 needsAdjustment
      } // 结束代码块

      if (!needsAdjustment) break; // 条件判断 !needsAdjustment
      iterations++; // 执行语句
    } // 结束代码块

    // 应用杠杆限制 / Apply leverage limit
    if (!this.config.enableLeverage) { // 条件判断 !this.config.enableLeverage
      const totalWeight = Object.values(constrainedWeights).reduce((a, b) => a + b, 0); // 定义函数 totalWeight
      if (totalWeight > 1) { // 条件判断 totalWeight > 1
        for (const s of strategies) { // 循环 const s of strategies
          constrainedWeights[s] /= totalWeight; // 执行语句
        } // 结束代码块
      } // 结束代码块
    } else { // 执行语句
      const totalWeight = Object.values(constrainedWeights).reduce((a, b) => a + b, 0); // 定义函数 totalWeight
      if (totalWeight > this.config.maxLeverage) { // 条件判断 totalWeight > this.config.maxLeverage
        const scale = this.config.maxLeverage / totalWeight; // 定义常量 scale
        for (const s of strategies) { // 循环 const s of strategies
          constrainedWeights[s] *= scale; // 执行语句
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return constrainedWeights; // 返回结果
  } // 结束代码块

  /**
   * 计算资金金额
   * Calculate capital amounts
   *
   * @param {Object} weights - 权重 / Weights
   * @returns {Object} 资金金额 / Capital amounts
   * @private
   */
  _calculateCapitalAmounts(weights) { // 调用 _calculateCapitalAmounts
    const allocations = {}; // 定义常量 allocations
    const totalCapital = this.config.totalCapital; // 定义常量 totalCapital

    for (const [strategy, weight] of Object.entries(weights)) { // 循环 const [strategy, weight] of Object.entries(we...
      allocations[strategy] = { // 执行语句
        weight, // 执行语句
        amount: new Decimal(totalCapital).mul(weight).toDP(2).toNumber(), // 设置 amount 字段
        percentage: (weight * 100).toFixed(2) + '%', // 设置 percentage 字段
      }; // 结束代码块
    } // 结束代码块

    return allocations; // 返回结果
  } // 结束代码块

  // ============================================
  // 再平衡 / Rebalancing
  // ============================================

  /**
   * 执行再平衡
   * Execute rebalancing
   *
   * @param {string} trigger - 触发原因 / Trigger reason
   * @returns {Object} 再平衡结果 / Rebalance result
   */
  rebalance(trigger = REBALANCE_TRIGGER.MANUAL) { // 调用 rebalance
    // 计算新的目标分配 / Calculate new target allocation
    const newAllocation = this.calculateAllocation(); // 定义常量 newAllocation

    // 计算调整 / Calculate adjustments
    const adjustments = this._calculateAdjustments(newAllocation.weights); // 定义常量 adjustments

    // 记录历史 / Record history
    this.allocationHistory.push({ // 访问 allocationHistory
      timestamp: Date.now(), // 设置 timestamp 字段
      trigger, // 执行语句
      previousAllocation: Object.fromEntries(this.currentAllocation), // 设置 previousAllocation 字段
      newAllocation: newAllocation.weights, // 设置 newAllocation 字段
      adjustments, // 执行语句
    }); // 结束代码块

    // 限制历史长度 / Limit history length
    if (this.allocationHistory.length > 100) { // 条件判断 this.allocationHistory.length > 100
      this.allocationHistory = this.allocationHistory.slice(-100); // 设置 allocationHistory
    } // 结束代码块

    // 更新当前分配 / Update current allocation
    this.currentAllocation = new Map(Object.entries(newAllocation.weights)); // 设置 currentAllocation
    this.lastRebalanceTime = Date.now(); // 设置 lastRebalanceTime

    const result = { // 定义常量 result
      trigger, // 执行语句
      allocation: newAllocation, // 设置 allocation 字段
      adjustments, // 执行语句
      timestamp: Date.now(), // 设置 timestamp 字段
    }; // 结束代码块

    this.log(`再平衡完成 / Rebalance completed: ${trigger}`, 'info'); // 调用 log
    this.emit('rebalanced', result); // 调用 emit

    return result; // 返回结果
  } // 结束代码块

  /**
   * 计算调整
   * Calculate adjustments
   *
   * @param {Object} targetWeights - 目标权重 / Target weights
   * @returns {Object} 调整明细 / Adjustment details
   * @private
   */
  _calculateAdjustments(targetWeights) { // 调用 _calculateAdjustments
    const adjustments = {}; // 定义常量 adjustments
    const totalCapital = this.config.totalCapital; // 定义常量 totalCapital

    for (const [strategy, targetWeight] of Object.entries(targetWeights)) { // 循环 const [strategy, targetWeight] of Object.entr...
      const currentWeight = this.currentAllocation.get(strategy) || 0; // 定义常量 currentWeight
      const weightChange = targetWeight - currentWeight; // 定义常量 weightChange
      const amountChange = weightChange * totalCapital; // 定义常量 amountChange

      adjustments[strategy] = { // 执行语句
        currentWeight, // 执行语句
        targetWeight, // 执行语句
        weightChange, // 执行语句
        amountChange: new Decimal(amountChange).toDP(2).toNumber(), // 设置 amountChange 字段
        action: weightChange > 0.001 ? 'increase' : weightChange < -0.001 ? 'decrease' : 'hold', // 设置 action 字段
      }; // 结束代码块
    } // 结束代码块

    return adjustments; // 返回结果
  } // 结束代码块

  /**
   * 检查是否需要再平衡
   * Check if rebalancing is needed
   *
   * @returns {Object} 检查结果 / Check result
   */
  checkRebalanceNeeded() { // 调用 checkRebalanceNeeded
    if (this.currentAllocation.size === 0 || this.targetAllocation.size === 0) { // 条件判断 this.currentAllocation.size === 0 || this.tar...
      return { needed: false, reason: '没有当前或目标分配 / No current or target allocation' }; // 返回结果
    } // 结束代码块

    // 检查偏离度 / Check deviation
    let maxDeviation = 0; // 定义变量 maxDeviation
    let deviatingStrategy = null; // 定义变量 deviatingStrategy

    for (const [strategy, targetWeight] of this.targetAllocation) { // 循环 const [strategy, targetWeight] of this.target...
      const currentWeight = this.currentAllocation.get(strategy) || 0; // 定义常量 currentWeight
      const deviation = Math.abs(targetWeight - currentWeight); // 定义常量 deviation

      if (deviation > maxDeviation) { // 条件判断 deviation > maxDeviation
        maxDeviation = deviation; // 赋值 maxDeviation
        deviatingStrategy = strategy; // 赋值 deviatingStrategy
      } // 结束代码块
    } // 结束代码块

    // 检查周期 / Check period
    const timeSinceLastRebalance = Date.now() - this.lastRebalanceTime; // 定义常量 timeSinceLastRebalance
    const periodExceeded = timeSinceLastRebalance >= this.config.rebalancePeriod; // 定义常量 periodExceeded

    const needed = maxDeviation >= this.config.rebalanceThreshold || periodExceeded; // 定义常量 needed

    return { // 返回结果
      needed, // 执行语句
      maxDeviation, // 执行语句
      deviatingStrategy, // 执行语句
      threshold: this.config.rebalanceThreshold, // 设置 threshold 字段
      timeSinceLastRebalance, // 执行语句
      rebalancePeriod: this.config.rebalancePeriod, // 设置 rebalancePeriod 字段
      periodExceeded, // 执行语句
      trigger: maxDeviation >= this.config.rebalanceThreshold // 设置 trigger 字段
        ? REBALANCE_TRIGGER.THRESHOLD // 执行语句
        : periodExceeded // 执行语句
          ? REBALANCE_TRIGGER.PERIODIC // 执行语句
          : null, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 检查再平衡 (内部定时器调用)
   * Check rebalance (internal timer call)
   * @private
   */
  _checkRebalance() { // 调用 _checkRebalance
    const check = this.checkRebalanceNeeded(); // 定义常量 check

    if (check.needed) { // 条件判断 check.needed
      this.log(`触发自动再平衡: ${check.trigger}`, 'info'); // 调用 log
      this.rebalance(check.trigger); // 调用 rebalance
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 组合指标 / Portfolio Metrics
  // ============================================

  /**
   * 计算组合指标
   * Calculate portfolio metrics
   *
   * @param {Object} weights - 权重 / Weights
   * @returns {Object} 组合指标 / Portfolio metrics
   * @private
   */
  _calculatePortfolioMetrics(weights) { // 调用 _calculatePortfolioMetrics
    const strategies = Object.keys(weights); // 定义常量 strategies
    const weightArray = strategies.map(s => weights[s]); // 定义函数 weightArray

    // 计算组合期望收益 / Calculate portfolio expected return
    let portfolioReturn = 0; // 定义变量 portfolioReturn
    for (const s of strategies) { // 循环 const s of strategies
      const stats = this.strategyStats.get(s); // 定义常量 stats
      const ret = stats?.expectedReturn || stats?.avgReturn || 0; // 定义常量 ret
      portfolioReturn += weights[s] * ret; // 执行语句
    } // 结束代码块

    // 计算组合波动率 / Calculate portfolio volatility
    let portfolioVariance = 0; // 定义变量 portfolioVariance

    if (this.covarianceMatrix && this.covarianceMatrix.strategies) { // 条件判断 this.covarianceMatrix && this.covarianceMatri...
      const cov = this._extractSubCovMatrix(strategies); // 定义常量 cov

      if (cov && cov.length === strategies.length) { // 条件判断 cov && cov.length === strategies.length
        for (let i = 0; i < strategies.length; i++) { // 循环 let i = 0; i < strategies.length; i++
          for (let j = 0; j < strategies.length; j++) { // 循环 let j = 0; j < strategies.length; j++
            portfolioVariance += weightArray[i] * weightArray[j] * cov[i][j]; // 执行语句
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    if (portfolioVariance === 0) { // 条件判断 portfolioVariance === 0
      // 使用简化方法 / Use simplified method
      for (const s of strategies) { // 循环 const s of strategies
        const stats = this.strategyStats.get(s); // 定义常量 stats
        const vol = stats?.volatility || 0.1; // 定义常量 vol
        portfolioVariance += Math.pow(weights[s] * vol, 2); // 执行语句
      } // 结束代码块
    } // 结束代码块

    const portfolioVolatility = Math.sqrt(portfolioVariance); // 定义常量 portfolioVolatility

    // 计算夏普比率 / Calculate Sharpe ratio
    const sharpeRatio = portfolioVolatility > 0 // 定义常量 sharpeRatio
      ? (portfolioReturn - this.config.riskFreeRate) / portfolioVolatility // 执行语句
      : 0; // 执行语句

    // 计算分散化比率 / Calculate diversification ratio
    let weightedVolSum = 0; // 定义变量 weightedVolSum
    for (const s of strategies) { // 循环 const s of strategies
      const stats = this.strategyStats.get(s); // 定义常量 stats
      const vol = stats?.volatility || 0.1; // 定义常量 vol
      weightedVolSum += weights[s] * vol; // 执行语句
    } // 结束代码块
    const diversificationRatio = portfolioVolatility > 0 // 定义常量 diversificationRatio
      ? weightedVolSum / portfolioVolatility // 执行语句
      : 1; // 执行语句

    return { // 返回结果
      expectedReturn: portfolioReturn, // 设置 expectedReturn 字段
      volatility: portfolioVolatility, // 设置 volatility 字段
      sharpeRatio, // 执行语句
      diversificationRatio, // 执行语句
      effectiveStrategies: strategies.filter(s => weights[s] >= 0.05).length, // 设置 effectiveStrategies 字段
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 矩阵操作辅助方法 / Matrix Operation Helpers
  // ============================================

  /**
   * 提取子协方差矩阵
   * Extract sub-covariance matrix
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Array} 子矩阵 / Sub-matrix
   * @private
   */
  _extractSubCovMatrix(strategies) { // 调用 _extractSubCovMatrix
    if (!this.covarianceMatrix || !this.covarianceMatrix.strategies) { // 条件判断 !this.covarianceMatrix || !this.covarianceMat...
      return null; // 返回结果
    } // 结束代码块

    const indices = strategies.map(s => // 定义函数 indices
      this.covarianceMatrix.strategies.indexOf(s) // 访问 covarianceMatrix
    ); // 结束调用或参数

    // 检查所有策略是否都存在 / Check if all strategies exist
    if (indices.some(i => i === -1)) { // 条件判断 indices.some(i => i === -1)
      return null; // 返回结果
    } // 结束代码块

    const subMatrix = []; // 定义常量 subMatrix
    for (const i of indices) { // 循环 const i of indices
      const row = []; // 定义常量 row
      for (const j of indices) { // 循环 const j of indices
        row.push(this.covarianceMatrix.matrix[i][j]); // 调用 row.push
      } // 结束代码块
      subMatrix.push(row); // 调用 subMatrix.push
    } // 结束代码块

    return subMatrix; // 返回结果
  } // 结束代码块

  /**
   * 获取两个策略的相关性
   * Get correlation between two strategies
   *
   * @param {string} strategyA - 策略A / Strategy A
   * @param {string} strategyB - 策略B / Strategy B
   * @returns {number|null} 相关系数 / Correlation
   * @private
   */
  _getCorrelation(strategyA, strategyB) { // 调用 _getCorrelation
    if (!this.correlationMatrix || !this.correlationMatrix.strategies) { // 条件判断 !this.correlationMatrix || !this.correlationM...
      return null; // 返回结果
    } // 结束代码块

    const iA = this.correlationMatrix.strategies.indexOf(strategyA); // 定义常量 iA
    const iB = this.correlationMatrix.strategies.indexOf(strategyB); // 定义常量 iB

    if (iA === -1 || iB === -1) { // 条件判断 iA === -1 || iB === -1
      return null; // 返回结果
    } // 结束代码块

    return this.correlationMatrix.matrix[iA][iB]; // 返回结果
  } // 结束代码块

  /**
   * 矩阵求逆 (高斯-约旦消元法)
   * Matrix inversion (Gauss-Jordan elimination)
   *
   * @param {Array} matrix - 输入矩阵 / Input matrix
   * @returns {Array|null} 逆矩阵 / Inverse matrix
   * @private
   */
  _invertMatrix(matrix) { // 调用 _invertMatrix
    const n = matrix.length; // 定义常量 n

    // 创建增广矩阵 [A|I] / Create augmented matrix [A|I]
    const augmented = matrix.map((row, i) => { // 定义函数 augmented
      const identity = Array(n).fill(0); // 定义常量 identity
      identity[i] = 1; // 执行语句
      return [...row, ...identity]; // 返回结果
    }); // 结束代码块

    // 高斯-约旦消元 / Gauss-Jordan elimination
    for (let col = 0; col < n; col++) { // 循环 let col = 0; col < n; col++
      // 找主元 / Find pivot
      let maxRow = col; // 定义变量 maxRow
      for (let row = col + 1; row < n; row++) { // 循环 let row = col + 1; row < n; row++
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) { // 条件判断 Math.abs(augmented[row][col]) > Math.abs(augm...
          maxRow = row; // 赋值 maxRow
        } // 结束代码块
      } // 结束代码块

      // 交换行 / Swap rows
      [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]]; // 执行语句

      // 检查是否奇异 / Check if singular
      if (Math.abs(augmented[col][col]) < 1e-10) { // 条件判断 Math.abs(augmented[col][col]) < 1e-10
        return null; // 返回结果
      } // 结束代码块

      // 归一化主元行 / Normalize pivot row
      const pivot = augmented[col][col]; // 定义常量 pivot
      for (let j = 0; j < 2 * n; j++) { // 循环 let j = 0; j < 2 * n; j++
        augmented[col][j] /= pivot; // 执行语句
      } // 结束代码块

      // 消元其他行 / Eliminate other rows
      for (let row = 0; row < n; row++) { // 循环 let row = 0; row < n; row++
        if (row !== col) { // 条件判断 row !== col
          const factor = augmented[row][col]; // 定义常量 factor
          for (let j = 0; j < 2 * n; j++) { // 循环 let j = 0; j < 2 * n; j++
            augmented[row][j] -= factor * augmented[col][j]; // 执行语句
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 提取逆矩阵 / Extract inverse matrix
    return augmented.map(row => row.slice(n)); // 返回结果
  } // 结束代码块

  /**
   * 矩阵向量乘法
   * Matrix-vector multiplication
   *
   * @param {Array} matrix - 矩阵 / Matrix
   * @param {Array} vector - 向量 / Vector
   * @returns {Array} 结果向量 / Result vector
   * @private
   */
  _matrixVectorMultiply(matrix, vector) { // 调用 _matrixVectorMultiply
    return matrix.map(row => // 返回结果
      row.reduce((sum, val, i) => sum + val * vector[i], 0) // 调用 row.reduce
    ); // 结束调用或参数
  } // 结束代码块

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 获取当前分配
   * Get current allocation
   *
   * @returns {Object} 当前分配 / Current allocation
   */
  getCurrentAllocation() { // 调用 getCurrentAllocation
    return { // 返回结果
      weights: Object.fromEntries(this.currentAllocation), // 设置 weights 字段
      allocations: this._calculateCapitalAmounts(Object.fromEntries(this.currentAllocation)), // 设置 allocations 字段
      totalCapital: this.config.totalCapital, // 设置 totalCapital 字段
      lastRebalanceTime: this.lastRebalanceTime, // 设置 lastRebalanceTime 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取分配器状态
   * Get allocator status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() { // 调用 getStatus
    return { // 返回结果
      running: this.running, // 设置 running 字段
      totalCapital: this.config.totalCapital, // 设置 totalCapital 字段
      strategyCount: this.strategyStats.size, // 设置 strategyCount 字段
      strategies: [...this.strategyStats.keys()], // 设置 strategies 字段
      currentAllocation: Object.fromEntries(this.currentAllocation), // 设置 currentAllocation 字段
      targetAllocation: Object.fromEntries(this.targetAllocation), // 设置 targetAllocation 字段
      lastRebalanceTime: this.lastRebalanceTime, // 设置 lastRebalanceTime 字段
      rebalanceCheck: this.checkRebalanceNeeded(), // 设置 rebalanceCheck 字段
      config: { // 设置 config 字段
        defaultMethod: this.config.defaultMethod, // 设置 defaultMethod 字段
        minWeight: this.config.minWeight, // 设置 minWeight 字段
        maxWeight: this.config.maxWeight, // 设置 maxWeight 字段
        rebalanceThreshold: this.config.rebalanceThreshold, // 设置 rebalanceThreshold 字段
        kellyFraction: this.config.kellyFraction, // 设置 kellyFraction 字段
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取分配建议
   * Get allocation recommendation
   *
   * @returns {Object} 分配建议 / Allocation recommendation
   */
  getRecommendation() { // 调用 getRecommendation
    // 计算所有方法的分配 / Calculate allocation for all methods
    const methods = [ // 定义常量 methods
      ALLOCATION_METHOD.EQUAL_WEIGHT, // 执行语句
      ALLOCATION_METHOD.RISK_PARITY, // 执行语句
      ALLOCATION_METHOD.MIN_CORRELATION, // 执行语句
      ALLOCATION_METHOD.KELLY, // 执行语句
    ]; // 结束数组或索引

    const results = methods.map(method => ({ // 定义函数 results
      method, // 执行语句
      ...this.calculateAllocation(method), // 展开对象或数组
    })); // 结束代码块

    // 选择夏普比率最高的 / Select highest Sharpe ratio
    const best = results.reduce((a, b) => // 定义函数 best
      (a.metrics?.sharpeRatio || 0) > (b.metrics?.sharpeRatio || 0) ? a : b // 执行语句
    ); // 结束调用或参数

    return { // 返回结果
      recommended: best, // 设置 recommended 字段
      alternatives: results.filter(r => r.method !== best.method), // 设置 alternatives 字段
      reasoning: `基于预期夏普比率 ${best.metrics?.sharpeRatio?.toFixed(2) || 'N/A'}，推荐使用 ${best.method} 方法 / Based on expected Sharpe ratio, recommending ${best.method} method`, // 设置 reasoning 字段
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

export { ALLOCATION_METHOD, REBALANCE_TRIGGER, DEFAULT_CONFIG }; // 导出命名成员
export default CapitalAllocator; // 默认导出
