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

import EventEmitter from 'eventemitter3';
import Decimal from 'decimal.js';

// ============================================
// 常量定义 / Constants Definition
// ============================================

/**
 * 分配方法
 * Allocation methods
 */
const ALLOCATION_METHOD = {
  EQUAL_WEIGHT: 'equal_weight',           // 等权重 / Equal weight
  RISK_PARITY: 'risk_parity',             // 风险平价 / Risk parity
  MIN_VARIANCE: 'min_variance',           // 最小方差 / Minimum variance
  MAX_SHARPE: 'max_sharpe',               // 最大夏普比率 / Maximum Sharpe
  MIN_CORRELATION: 'min_correlation',      // 最小相关性 / Minimum correlation
  KELLY: 'kelly',                         // 凯利准则 / Kelly criterion
  CUSTOM: 'custom',                       // 自定义 / Custom
};

/**
 * 再平衡触发条件
 * Rebalance trigger conditions
 */
const REBALANCE_TRIGGER = {
  THRESHOLD: 'threshold',     // 偏离阈值触发 / Threshold deviation
  PERIODIC: 'periodic',       // 周期性触发 / Periodic
  PERFORMANCE: 'performance', // 业绩触发 / Performance based
  MANUAL: 'manual',          // 手动触发 / Manual
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // 总资金 / Total capital
  totalCapital: 100000,

  // 默认分配方法 / Default allocation method
  defaultMethod: ALLOCATION_METHOD.RISK_PARITY,

  // 最小策略权重 / Minimum strategy weight
  minWeight: 0.05,

  // 最大策略权重 / Maximum strategy weight
  maxWeight: 0.40,

  // 再平衡偏离阈值 / Rebalance deviation threshold
  rebalanceThreshold: 0.05,

  // 再平衡周期 (毫秒) / Rebalance period (ms)
  rebalancePeriod: 24 * 60 * 60 * 1000, // 每天 / Daily

  // 无风险利率 (年化) / Risk-free rate (annualized)
  riskFreeRate: 0.02,

  // 凯利分数 (保守调整) / Kelly fraction (conservative adjustment)
  kellyFraction: 0.25,

  // 是否启用杠杆 / Enable leverage
  enableLeverage: false,

  // 最大总杠杆 / Maximum total leverage
  maxLeverage: 1.0,

  // 优化迭代次数 / Optimization iterations
  optimizationIterations: 1000,

  // 是否启用详细日志 / Enable verbose logging
  verbose: true,

  // 日志前缀 / Log prefix
  logPrefix: '[CapitalAllocator]',
};

// ============================================
// 主类 / Main Class
// ============================================

/**
 * 资金分配器
 * Capital Allocator
 */
export class CapitalAllocator extends EventEmitter {
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

    // 策略信息 / Strategy information
    // 格式: { strategyId: { returns, volatility, sharpe, ... } }
    this.strategyStats = new Map();

    // 当前分配 / Current allocation
    // 格式: { strategyId: weight }
    this.currentAllocation = new Map();

    // 目标分配 / Target allocation
    this.targetAllocation = new Map();

    // 相关性矩阵引用 / Correlation matrix reference
    this.correlationMatrix = null;

    // 协方差矩阵引用 / Covariance matrix reference
    this.covarianceMatrix = null;

    // 分配历史 / Allocation history
    this.allocationHistory = [];

    // 最后再平衡时间 / Last rebalance time
    this.lastRebalanceTime = 0;

    // 再平衡定时器 / Rebalance timer
    this.rebalanceTimer = null;

    // 运行状态 / Running state
    this.running = false;
  }

  // ============================================
  // 生命周期管理 / Lifecycle Management
  // ============================================

  /**
   * 启动分配器
   * Start allocator
   */
  start() {
    if (this.running) return;

    this.running = true;

    // 启动定期再平衡 / Start periodic rebalancing
    if (this.config.rebalancePeriod > 0) {
      this.rebalanceTimer = setInterval(
        () => this._checkRebalance(),
        Math.min(this.config.rebalancePeriod / 10, 60000)
      );
    }

    this.log('资金分配器已启动 / Capital allocator started', 'info');
    this.emit('started');
  }

  /**
   * 停止分配器
   * Stop allocator
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }

    this.log('资金分配器已停止 / Capital allocator stopped', 'info');
    this.emit('stopped');
  }

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
  updateStrategyStats(strategyId, stats) {
    const existing = this.strategyStats.get(strategyId) || {};

    this.strategyStats.set(strategyId, {
      ...existing,
      ...stats,
      updatedAt: Date.now(),
    });

    this.emit('strategyStatsUpdated', { strategyId, stats });
  }

  /**
   * 设置相关性矩阵
   * Set correlation matrix
   *
   * @param {Object} matrix - 相关性矩阵 / Correlation matrix
   */
  setCorrelationMatrix(matrix) {
    this.correlationMatrix = matrix;
  }

  /**
   * 设置协方差矩阵
   * Set covariance matrix
   *
   * @param {Object} matrix - 协方差矩阵 / Covariance matrix
   */
  setCovarianceMatrix(matrix) {
    this.covarianceMatrix = matrix;
  }

  /**
   * 设置总资金
   * Set total capital
   *
   * @param {number} capital - 总资金 / Total capital
   */
  setTotalCapital(capital) {
    this.config.totalCapital = capital;
    this.emit('capitalUpdated', { totalCapital: capital });
  }

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
  calculateAllocation(method = null, options = {}) {
    const allocMethod = method || this.config.defaultMethod;
    const strategies = [...this.strategyStats.keys()];

    if (strategies.length === 0) {
      return {
        error: '没有注册的策略 / No registered strategies',
        weights: {},
        allocations: {},
      };
    }

    let weights;

    switch (allocMethod) {
      case ALLOCATION_METHOD.EQUAL_WEIGHT:
        weights = this._equalWeightAllocation(strategies);
        break;

      case ALLOCATION_METHOD.RISK_PARITY:
        weights = this._riskParityAllocation(strategies);
        break;

      case ALLOCATION_METHOD.MIN_VARIANCE:
        weights = this._minVarianceAllocation(strategies);
        break;

      case ALLOCATION_METHOD.MAX_SHARPE:
        weights = this._maxSharpeAllocation(strategies);
        break;

      case ALLOCATION_METHOD.MIN_CORRELATION:
        weights = this._minCorrelationAllocation(strategies);
        break;

      case ALLOCATION_METHOD.KELLY:
        weights = this._kellyAllocation(strategies);
        break;

      case ALLOCATION_METHOD.CUSTOM:
        weights = options.customWeights || this._equalWeightAllocation(strategies);
        break;

      default:
        weights = this._equalWeightAllocation(strategies);
    }

    // 应用权重约束 / Apply weight constraints
    weights = this._applyWeightConstraints(weights);

    // 计算资金分配 / Calculate capital allocation
    const allocations = this._calculateCapitalAmounts(weights);

    // 更新目标分配 / Update target allocation
    this.targetAllocation = new Map(Object.entries(weights));

    const result = {
      method: allocMethod,
      weights,
      allocations,
      totalCapital: this.config.totalCapital,
      timestamp: Date.now(),
      metrics: this._calculatePortfolioMetrics(weights),
    };

    this.emit('allocationCalculated', result);

    return result;
  }

  /**
   * 等权重分配
   * Equal weight allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _equalWeightAllocation(strategies) {
    const weight = 1 / strategies.length;
    const weights = {};

    for (const strategy of strategies) {
      weights[strategy] = weight;
    }

    return weights;
  }

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
  _riskParityAllocation(strategies) {
    const weights = {};

    // 获取每个策略的波动率 / Get volatility of each strategy
    const volatilities = strategies.map(s => {
      const stats = this.strategyStats.get(s);
      return stats?.volatility || 0.1; // 默认10%波动率 / Default 10% volatility
    });

    // 计算风险倒数 / Calculate inverse of risk
    const inverseVols = volatilities.map(v => v > 0 ? 1 / v : 0);
    const sumInverseVols = inverseVols.reduce((a, b) => a + b, 0);

    // 分配权重 / Allocate weights
    if (sumInverseVols > 0) {
      strategies.forEach((s, i) => {
        weights[s] = inverseVols[i] / sumInverseVols;
      });
    } else {
      // 回退到等权重 / Fallback to equal weight
      return this._equalWeightAllocation(strategies);
    }

    return weights;
  }

  /**
   * 最小方差分配
   * Minimum variance allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _minVarianceAllocation(strategies) {
    if (!this.covarianceMatrix || strategies.length < 2) {
      return this._riskParityAllocation(strategies);
    }

    const n = strategies.length;
    const cov = this._extractSubCovMatrix(strategies);

    if (!cov || cov.length !== n) {
      return this._riskParityAllocation(strategies);
    }

    // 使用数值优化求解最小方差组合 / Use numerical optimization for min variance
    // 简化版本: 使用逆协方差矩阵方法 / Simplified: inverse covariance matrix method
    try {
      // 计算协方差矩阵的逆 / Calculate inverse of covariance matrix
      const invCov = this._invertMatrix(cov);

      if (!invCov) {
        return this._riskParityAllocation(strategies);
      }

      // 计算权重: w = inv(Σ) * 1 / 1' * inv(Σ) * 1
      const ones = Array(n).fill(1);
      const invCovOnes = this._matrixVectorMultiply(invCov, ones);
      const sumInvCovOnes = invCovOnes.reduce((a, b) => a + b, 0);

      const weights = {};
      strategies.forEach((s, i) => {
        weights[s] = invCovOnes[i] / sumInvCovOnes;
      });

      return weights;

    } catch (error) {
      this.log(`最小方差优化失败: ${error.message}`, 'warn');
      return this._riskParityAllocation(strategies);
    }
  }

  /**
   * 最大夏普比率分配
   * Maximum Sharpe ratio allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _maxSharpeAllocation(strategies) {
    if (!this.covarianceMatrix || strategies.length < 2) {
      return this._riskParityAllocation(strategies);
    }

    const n = strategies.length;
    const cov = this._extractSubCovMatrix(strategies);

    if (!cov || cov.length !== n) {
      return this._riskParityAllocation(strategies);
    }

    // 获取期望收益 / Get expected returns
    const expectedReturns = strategies.map(s => {
      const stats = this.strategyStats.get(s);
      return (stats?.expectedReturn || stats?.avgReturn || 0.05) - this.config.riskFreeRate;
    });

    try {
      // 计算协方差矩阵的逆 / Calculate inverse of covariance matrix
      const invCov = this._invertMatrix(cov);

      if (!invCov) {
        return this._riskParityAllocation(strategies);
      }

      // 计算权重: w = inv(Σ) * μ / 1' * inv(Σ) * μ
      const invCovMu = this._matrixVectorMultiply(invCov, expectedReturns);
      const sumInvCovMu = invCovMu.reduce((a, b) => a + b, 0);

      const weights = {};
      strategies.forEach((s, i) => {
        weights[s] = sumInvCovMu !== 0 ? invCovMu[i] / sumInvCovMu : 1 / n;
      });

      return weights;

    } catch (error) {
      this.log(`最大夏普优化失败: ${error.message}`, 'warn');
      return this._riskParityAllocation(strategies);
    }
  }

  /**
   * 最小相关性分配
   * Minimum correlation allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _minCorrelationAllocation(strategies) {
    if (!this.correlationMatrix || strategies.length < 2) {
      return this._equalWeightAllocation(strategies);
    }

    const n = strategies.length;

    // 获取平均相关性 / Get average correlation for each strategy
    const avgCorrelations = strategies.map((s, i) => {
      let totalCorr = 0;
      let count = 0;

      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const corr = this._getCorrelation(s, strategies[j]);
          if (corr !== null) {
            totalCorr += Math.abs(corr);
            count++;
          }
        }
      }

      return count > 0 ? totalCorr / count : 0.5;
    });

    // 低相关性策略获得更高权重 / Lower correlation strategies get higher weight
    const inverseCorr = avgCorrelations.map(c => 1 / (c + 0.1)); // 加0.1避免除零 / Add 0.1 to avoid division by zero
    const sumInverseCorr = inverseCorr.reduce((a, b) => a + b, 0);

    const weights = {};
    strategies.forEach((s, i) => {
      weights[s] = inverseCorr[i] / sumInverseCorr;
    });

    return weights;
  }

  /**
   * 凯利准则分配
   * Kelly criterion allocation
   *
   * @param {Array} strategies - 策略列表 / Strategy list
   * @returns {Object} 权重分配 / Weight allocation
   * @private
   */
  _kellyAllocation(strategies) {
    const weights = {};

    // 计算每个策略的凯利比例 / Calculate Kelly fraction for each strategy
    const kellyFractions = strategies.map(s => {
      const stats = this.strategyStats.get(s);

      if (!stats) return 0;

      const winRate = stats.winRate || 0.5;
      const avgWin = stats.avgWin || 1;
      const avgLoss = stats.avgLoss || 1;

      // 计算凯利比例: f = (bp - q) / b
      // b = 赔率 (avgWin/avgLoss), p = 胜率, q = 1-p
      const odds = avgLoss > 0 ? avgWin / avgLoss : 1;
      let kelly = (odds * winRate - (1 - winRate)) / odds;

      // 限制凯利比例 / Limit Kelly fraction
      kelly = Math.max(0, Math.min(1, kelly));

      // 应用保守调整 / Apply conservative adjustment
      return kelly * this.config.kellyFraction;
    });

    // 归一化权重 / Normalize weights
    const sumKelly = kellyFractions.reduce((a, b) => a + b, 0);

    if (sumKelly > 0) {
      strategies.forEach((s, i) => {
        weights[s] = kellyFractions[i] / sumKelly;
      });
    } else {
      return this._equalWeightAllocation(strategies);
    }

    return weights;
  }

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
  _applyWeightConstraints(weights) {
    const strategies = Object.keys(weights);
    let constrainedWeights = { ...weights };
    let iterations = 0;
    const maxIterations = 100;

    // 迭代调整直到满足约束 / Iterate until constraints are met
    while (iterations < maxIterations) {
      let needsAdjustment = false;
      let totalWeight = 0;

      // 应用最小/最大权重约束 / Apply min/max weight constraints
      for (const s of strategies) {
        let w = constrainedWeights[s];

        if (w < this.config.minWeight) {
          constrainedWeights[s] = this.config.minWeight;
          needsAdjustment = true;
        } else if (w > this.config.maxWeight) {
          constrainedWeights[s] = this.config.maxWeight;
          needsAdjustment = true;
        }

        totalWeight += constrainedWeights[s];
      }

      // 归一化 / Normalize
      if (Math.abs(totalWeight - 1) > 0.0001) {
        for (const s of strategies) {
          constrainedWeights[s] /= totalWeight;
        }
        needsAdjustment = true;
      }

      if (!needsAdjustment) break;
      iterations++;
    }

    // 应用杠杆限制 / Apply leverage limit
    if (!this.config.enableLeverage) {
      const totalWeight = Object.values(constrainedWeights).reduce((a, b) => a + b, 0);
      if (totalWeight > 1) {
        for (const s of strategies) {
          constrainedWeights[s] /= totalWeight;
        }
      }
    } else {
      const totalWeight = Object.values(constrainedWeights).reduce((a, b) => a + b, 0);
      if (totalWeight > this.config.maxLeverage) {
        const scale = this.config.maxLeverage / totalWeight;
        for (const s of strategies) {
          constrainedWeights[s] *= scale;
        }
      }
    }

    return constrainedWeights;
  }

  /**
   * 计算资金金额
   * Calculate capital amounts
   *
   * @param {Object} weights - 权重 / Weights
   * @returns {Object} 资金金额 / Capital amounts
   * @private
   */
  _calculateCapitalAmounts(weights) {
    const allocations = {};
    const totalCapital = this.config.totalCapital;

    for (const [strategy, weight] of Object.entries(weights)) {
      allocations[strategy] = {
        weight,
        amount: new Decimal(totalCapital).mul(weight).toDP(2).toNumber(),
        percentage: (weight * 100).toFixed(2) + '%',
      };
    }

    return allocations;
  }

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
  rebalance(trigger = REBALANCE_TRIGGER.MANUAL) {
    // 计算新的目标分配 / Calculate new target allocation
    const newAllocation = this.calculateAllocation();

    // 计算调整 / Calculate adjustments
    const adjustments = this._calculateAdjustments(newAllocation.weights);

    // 记录历史 / Record history
    this.allocationHistory.push({
      timestamp: Date.now(),
      trigger,
      previousAllocation: Object.fromEntries(this.currentAllocation),
      newAllocation: newAllocation.weights,
      adjustments,
    });

    // 限制历史长度 / Limit history length
    if (this.allocationHistory.length > 100) {
      this.allocationHistory = this.allocationHistory.slice(-100);
    }

    // 更新当前分配 / Update current allocation
    this.currentAllocation = new Map(Object.entries(newAllocation.weights));
    this.lastRebalanceTime = Date.now();

    const result = {
      trigger,
      allocation: newAllocation,
      adjustments,
      timestamp: Date.now(),
    };

    this.log(`再平衡完成 / Rebalance completed: ${trigger}`, 'info');
    this.emit('rebalanced', result);

    return result;
  }

  /**
   * 计算调整
   * Calculate adjustments
   *
   * @param {Object} targetWeights - 目标权重 / Target weights
   * @returns {Object} 调整明细 / Adjustment details
   * @private
   */
  _calculateAdjustments(targetWeights) {
    const adjustments = {};
    const totalCapital = this.config.totalCapital;

    for (const [strategy, targetWeight] of Object.entries(targetWeights)) {
      const currentWeight = this.currentAllocation.get(strategy) || 0;
      const weightChange = targetWeight - currentWeight;
      const amountChange = weightChange * totalCapital;

      adjustments[strategy] = {
        currentWeight,
        targetWeight,
        weightChange,
        amountChange: new Decimal(amountChange).toDP(2).toNumber(),
        action: weightChange > 0.001 ? 'increase' : weightChange < -0.001 ? 'decrease' : 'hold',
      };
    }

    return adjustments;
  }

  /**
   * 检查是否需要再平衡
   * Check if rebalancing is needed
   *
   * @returns {Object} 检查结果 / Check result
   */
  checkRebalanceNeeded() {
    if (this.currentAllocation.size === 0 || this.targetAllocation.size === 0) {
      return { needed: false, reason: '没有当前或目标分配 / No current or target allocation' };
    }

    // 检查偏离度 / Check deviation
    let maxDeviation = 0;
    let deviatingStrategy = null;

    for (const [strategy, targetWeight] of this.targetAllocation) {
      const currentWeight = this.currentAllocation.get(strategy) || 0;
      const deviation = Math.abs(targetWeight - currentWeight);

      if (deviation > maxDeviation) {
        maxDeviation = deviation;
        deviatingStrategy = strategy;
      }
    }

    // 检查周期 / Check period
    const timeSinceLastRebalance = Date.now() - this.lastRebalanceTime;
    const periodExceeded = timeSinceLastRebalance >= this.config.rebalancePeriod;

    const needed = maxDeviation >= this.config.rebalanceThreshold || periodExceeded;

    return {
      needed,
      maxDeviation,
      deviatingStrategy,
      threshold: this.config.rebalanceThreshold,
      timeSinceLastRebalance,
      rebalancePeriod: this.config.rebalancePeriod,
      periodExceeded,
      trigger: maxDeviation >= this.config.rebalanceThreshold
        ? REBALANCE_TRIGGER.THRESHOLD
        : periodExceeded
          ? REBALANCE_TRIGGER.PERIODIC
          : null,
    };
  }

  /**
   * 检查再平衡 (内部定时器调用)
   * Check rebalance (internal timer call)
   * @private
   */
  _checkRebalance() {
    const check = this.checkRebalanceNeeded();

    if (check.needed) {
      this.log(`触发自动再平衡: ${check.trigger}`, 'info');
      this.rebalance(check.trigger);
    }
  }

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
  _calculatePortfolioMetrics(weights) {
    const strategies = Object.keys(weights);
    const weightArray = strategies.map(s => weights[s]);

    // 计算组合期望收益 / Calculate portfolio expected return
    let portfolioReturn = 0;
    for (const s of strategies) {
      const stats = this.strategyStats.get(s);
      const ret = stats?.expectedReturn || stats?.avgReturn || 0;
      portfolioReturn += weights[s] * ret;
    }

    // 计算组合波动率 / Calculate portfolio volatility
    let portfolioVariance = 0;

    if (this.covarianceMatrix && this.covarianceMatrix.strategies) {
      const cov = this._extractSubCovMatrix(strategies);

      if (cov && cov.length === strategies.length) {
        for (let i = 0; i < strategies.length; i++) {
          for (let j = 0; j < strategies.length; j++) {
            portfolioVariance += weightArray[i] * weightArray[j] * cov[i][j];
          }
        }
      }
    }

    if (portfolioVariance === 0) {
      // 使用简化方法 / Use simplified method
      for (const s of strategies) {
        const stats = this.strategyStats.get(s);
        const vol = stats?.volatility || 0.1;
        portfolioVariance += Math.pow(weights[s] * vol, 2);
      }
    }

    const portfolioVolatility = Math.sqrt(portfolioVariance);

    // 计算夏普比率 / Calculate Sharpe ratio
    const sharpeRatio = portfolioVolatility > 0
      ? (portfolioReturn - this.config.riskFreeRate) / portfolioVolatility
      : 0;

    // 计算分散化比率 / Calculate diversification ratio
    let weightedVolSum = 0;
    for (const s of strategies) {
      const stats = this.strategyStats.get(s);
      const vol = stats?.volatility || 0.1;
      weightedVolSum += weights[s] * vol;
    }
    const diversificationRatio = portfolioVolatility > 0
      ? weightedVolSum / portfolioVolatility
      : 1;

    return {
      expectedReturn: portfolioReturn,
      volatility: portfolioVolatility,
      sharpeRatio,
      diversificationRatio,
      effectiveStrategies: strategies.filter(s => weights[s] >= 0.05).length,
    };
  }

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
  _extractSubCovMatrix(strategies) {
    if (!this.covarianceMatrix || !this.covarianceMatrix.strategies) {
      return null;
    }

    const indices = strategies.map(s =>
      this.covarianceMatrix.strategies.indexOf(s)
    );

    // 检查所有策略是否都存在 / Check if all strategies exist
    if (indices.some(i => i === -1)) {
      return null;
    }

    const subMatrix = [];
    for (const i of indices) {
      const row = [];
      for (const j of indices) {
        row.push(this.covarianceMatrix.matrix[i][j]);
      }
      subMatrix.push(row);
    }

    return subMatrix;
  }

  /**
   * 获取两个策略的相关性
   * Get correlation between two strategies
   *
   * @param {string} strategyA - 策略A / Strategy A
   * @param {string} strategyB - 策略B / Strategy B
   * @returns {number|null} 相关系数 / Correlation
   * @private
   */
  _getCorrelation(strategyA, strategyB) {
    if (!this.correlationMatrix || !this.correlationMatrix.strategies) {
      return null;
    }

    const iA = this.correlationMatrix.strategies.indexOf(strategyA);
    const iB = this.correlationMatrix.strategies.indexOf(strategyB);

    if (iA === -1 || iB === -1) {
      return null;
    }

    return this.correlationMatrix.matrix[iA][iB];
  }

  /**
   * 矩阵求逆 (高斯-约旦消元法)
   * Matrix inversion (Gauss-Jordan elimination)
   *
   * @param {Array} matrix - 输入矩阵 / Input matrix
   * @returns {Array|null} 逆矩阵 / Inverse matrix
   * @private
   */
  _invertMatrix(matrix) {
    const n = matrix.length;

    // 创建增广矩阵 [A|I] / Create augmented matrix [A|I]
    const augmented = matrix.map((row, i) => {
      const identity = Array(n).fill(0);
      identity[i] = 1;
      return [...row, ...identity];
    });

    // 高斯-约旦消元 / Gauss-Jordan elimination
    for (let col = 0; col < n; col++) {
      // 找主元 / Find pivot
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
          maxRow = row;
        }
      }

      // 交换行 / Swap rows
      [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

      // 检查是否奇异 / Check if singular
      if (Math.abs(augmented[col][col]) < 1e-10) {
        return null;
      }

      // 归一化主元行 / Normalize pivot row
      const pivot = augmented[col][col];
      for (let j = 0; j < 2 * n; j++) {
        augmented[col][j] /= pivot;
      }

      // 消元其他行 / Eliminate other rows
      for (let row = 0; row < n; row++) {
        if (row !== col) {
          const factor = augmented[row][col];
          for (let j = 0; j < 2 * n; j++) {
            augmented[row][j] -= factor * augmented[col][j];
          }
        }
      }
    }

    // 提取逆矩阵 / Extract inverse matrix
    return augmented.map(row => row.slice(n));
  }

  /**
   * 矩阵向量乘法
   * Matrix-vector multiplication
   *
   * @param {Array} matrix - 矩阵 / Matrix
   * @param {Array} vector - 向量 / Vector
   * @returns {Array} 结果向量 / Result vector
   * @private
   */
  _matrixVectorMultiply(matrix, vector) {
    return matrix.map(row =>
      row.reduce((sum, val, i) => sum + val * vector[i], 0)
    );
  }

  // ============================================
  // 公共API / Public API
  // ============================================

  /**
   * 获取当前分配
   * Get current allocation
   *
   * @returns {Object} 当前分配 / Current allocation
   */
  getCurrentAllocation() {
    return {
      weights: Object.fromEntries(this.currentAllocation),
      allocations: this._calculateCapitalAmounts(Object.fromEntries(this.currentAllocation)),
      totalCapital: this.config.totalCapital,
      lastRebalanceTime: this.lastRebalanceTime,
    };
  }

  /**
   * 获取分配器状态
   * Get allocator status
   *
   * @returns {Object} 状态信息 / Status info
   */
  getStatus() {
    return {
      running: this.running,
      totalCapital: this.config.totalCapital,
      strategyCount: this.strategyStats.size,
      strategies: [...this.strategyStats.keys()],
      currentAllocation: Object.fromEntries(this.currentAllocation),
      targetAllocation: Object.fromEntries(this.targetAllocation),
      lastRebalanceTime: this.lastRebalanceTime,
      rebalanceCheck: this.checkRebalanceNeeded(),
      config: {
        defaultMethod: this.config.defaultMethod,
        minWeight: this.config.minWeight,
        maxWeight: this.config.maxWeight,
        rebalanceThreshold: this.config.rebalanceThreshold,
        kellyFraction: this.config.kellyFraction,
      },
    };
  }

  /**
   * 获取分配建议
   * Get allocation recommendation
   *
   * @returns {Object} 分配建议 / Allocation recommendation
   */
  getRecommendation() {
    // 计算所有方法的分配 / Calculate allocation for all methods
    const methods = [
      ALLOCATION_METHOD.EQUAL_WEIGHT,
      ALLOCATION_METHOD.RISK_PARITY,
      ALLOCATION_METHOD.MIN_CORRELATION,
      ALLOCATION_METHOD.KELLY,
    ];

    const results = methods.map(method => ({
      method,
      ...this.calculateAllocation(method),
    }));

    // 选择夏普比率最高的 / Select highest Sharpe ratio
    const best = results.reduce((a, b) =>
      (a.metrics?.sharpeRatio || 0) > (b.metrics?.sharpeRatio || 0) ? a : b
    );

    return {
      recommended: best,
      alternatives: results.filter(r => r.method !== best.method),
      reasoning: `基于预期夏普比率 ${best.metrics?.sharpeRatio?.toFixed(2) || 'N/A'}，推荐使用 ${best.method} 方法 / Based on expected Sharpe ratio, recommending ${best.method} method`,
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

export { ALLOCATION_METHOD, REBALANCE_TRIGGER, DEFAULT_CONFIG };
export default CapitalAllocator;
