/**
 * 策略信号权重系统 (Signal Weighting System)
 *
 * 功能:
 * 1. 策略打分制 (Signal Score) - 每个策略输出 0-1 分数
 * 2. 策略权重动态调整 - 基于历史表现动态调整权重
 * 3. 最大相关性限制 - 高相关策略限制总权重
 * 4. 策略熔断机制 - 表现差时暂停策略
 *
 * 示例:
 *   SMA = 0.4, RSI = 0.2, FundingRate = 0.4
 *   总分 >= 0.7 才交易
 */

import EventEmitter from 'eventemitter3';

/**
 * 策略状态枚举
 */
export const StrategyStatus = {
  ACTIVE: 'active',           // 正常运行
  CIRCUIT_BREAK: 'circuit_break', // 熔断中
  COOLING: 'cooling',         // 冷却期
  DISABLED: 'disabled',       // 已禁用
};

/**
 * 熔断原因枚举
 */
export const CircuitBreakReason = {
  CONSECUTIVE_LOSS: 'consecutive_loss',   // 连续亏损
  DRAWDOWN: 'drawdown',                   // 超过最大回撤
  WIN_RATE_LOW: 'win_rate_low',           // 胜率过低
  MANUAL: 'manual',                        // 手动熔断
};

/**
 * 信号权重系统类
 */
export class SignalWeightingSystem extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 系统配置
   */
  constructor(config = {}) {
    super();

    // ============================================
    // 基础配置
    // ============================================

    // 交易阈值: 总分 >= threshold 才执行交易 (降低阈值增加触发机会)
    this.threshold = config.threshold || 0.95;

    // 卖出阈值: 总分 <= sellThreshold 触发卖出 (提高阈值增加触发机会)
    this.sellThreshold = config.sellThreshold || 0.15;

    // ============================================
    // 权重配置
    // ============================================

    // 基础权重配置 { strategyName: weight }
    this.baseWeights = config.baseWeights || {};

    // 当前生效权重 (动态调整后)
    this.currentWeights = { ...this.baseWeights };

    // 权重动态调整参数
    this.weightAdjustment = {
      // 是否启用动态权重
      enabled: config.dynamicWeights !== false,
      // 权重调整因子 (0-1, 基于表现调整的幅度)
      adjustmentFactor: config.adjustmentFactor || 0.2,
      // 评估周期 (交易次数)
      evaluationPeriod: config.evaluationPeriod || 20,
      // 最小权重
      minWeight: config.minWeight || 0.05,
      // 最大权重
      maxWeight: config.maxWeight || 0.6,
    };

    // ============================================
    // 相关性限制配置
    // ============================================

    this.correlationConfig = {
      // 是否启用相关性限制
      enabled: config.correlationLimit !== false,
      // 最大允许相关性
      maxCorrelation: config.maxCorrelation || 0.7,
      // 相关性惩罚系数: 相关性高时降低组合权重
      penaltyFactor: config.correlationPenaltyFactor || 0.5,
      // 相关性矩阵 (策略间相关性)
      matrix: config.correlationMatrix || {},
    };

    // ============================================
    // 熔断机制配置
    // ============================================

    this.circuitBreaker = {
      // 是否启用熔断
      enabled: config.circuitBreaker !== false,
      // 连续亏损次数触发熔断
      consecutiveLossLimit: config.consecutiveLossLimit || 5,
      // 最大回撤触发熔断 (百分比)
      maxDrawdown: config.maxDrawdownLimit || 0.15,
      // 最低胜率触发熔断
      minWinRate: config.minWinRate || 0.3,
      // 评估窗口 (交易次数)
      evaluationWindow: config.evaluationWindow || 30,
      // 冷却时间 (毫秒)
      coolingPeriod: config.coolingPeriod || 3600000, // 默认 1 小时
      // 自动恢复
      autoRecover: config.autoRecover !== false,
    };

    // ============================================
    // 内部状态
    // ============================================

    // 策略状态 { strategyName: { status, reason, timestamp, ... } }
    this._strategyStatus = {};

    // 策略表现数据 { strategyName: { trades, wins, losses, pnl, ... } }
    this._strategyPerformance = {};

    // 信号历史 (用于计算相关性)
    this._signalHistory = [];

    // 最近的综合得分
    this._lastScores = [];

    // 当前计算的信号得分
    this._currentSignals = {};
  }

  // ============================================
  // 策略注册与配置
  // ============================================

  /**
   * 注册策略
   * @param {string} name - 策略名称
   * @param {number} weight - 基础权重 (0-1)
   * @param {Object} options - 额外选项
   */
  registerStrategy(name, weight = 0.2, options = {}) {
    // 规范化权重
    weight = Math.max(0, Math.min(1, weight));

    this.baseWeights[name] = weight;
    this.currentWeights[name] = weight;

    this._strategyStatus[name] = {
      status: StrategyStatus.ACTIVE,
      reason: null,
      timestamp: Date.now(),
      cooldownUntil: null,
    };

    this._strategyPerformance[name] = {
      trades: 0,
      wins: 0,
      losses: 0,
      consecutiveLosses: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      equity: 0,
      peakEquity: 0,
      signals: [],
      lastUpdate: Date.now(),
    };

    this.emit('strategyRegistered', { name, weight, options });

    return this;
  }

  /**
   * 批量注册策略
   * @param {Object} strategies - { name: weight } 或 { name: { weight, options } }
   */
  registerStrategies(strategies) {
    for (const [name, config] of Object.entries(strategies)) {
      if (typeof config === 'number') {
        this.registerStrategy(name, config);
      } else {
        this.registerStrategy(name, config.weight, config.options || {});
      }
    }
    return this;
  }

  /**
   * 设置策略间相关性
   * @param {string} strategy1 - 策略1名称
   * @param {string} strategy2 - 策略2名称
   * @param {number} correlation - 相关系数 (-1 到 1)
   */
  setCorrelation(strategy1, strategy2, correlation) {
    const key = this._getCorrelationKey(strategy1, strategy2);
    this.correlationConfig.matrix[key] = correlation;
    return this;
  }

  /**
   * 批量设置相关性矩阵
   * @param {Object} matrix - { "SMA-RSI": 0.3, ... }
   */
  setCorrelationMatrix(matrix) {
    this.correlationConfig.matrix = { ...matrix };
    return this;
  }

  // ============================================
  // 信号评分
  // ============================================

  /**
   * 记录策略信号得分
   * @param {string} strategy - 策略名称
   * @param {number} score - 信号得分 (0-1, 0.5 为中性)
   * @param {Object} metadata - 额外元数据
   */
  recordSignal(strategy, score, metadata = {}) {
    // 验证策略存在
    if (!this.baseWeights[strategy]) {
      console.warn(`[SignalWeightingSystem] 未注册的策略: ${strategy}`);
      return this;
    }

    // 检查策略状态
    const status = this._strategyStatus[strategy];
    if (status.status === StrategyStatus.CIRCUIT_BREAK) {
      // 熔断中的策略信号设为中性
      score = 0.5;
    } else if (status.status === StrategyStatus.COOLING) {
      // 检查冷却是否结束
      if (Date.now() >= status.cooldownUntil) {
        this._recoverStrategy(strategy);
      } else {
        score = 0.5;
      }
    }

    // 规范化得分
    score = Math.max(0, Math.min(1, score));

    // 记录信号
    this._currentSignals[strategy] = {
      score,
      weight: this.currentWeights[strategy],
      timestamp: Date.now(),
      metadata,
    };

    // 添加到历史
    this._signalHistory.push({
      strategy,
      score,
      timestamp: Date.now(),
    });

    // 保留最近 1000 条记录
    if (this._signalHistory.length > 1000) {
      this._signalHistory = this._signalHistory.slice(-1000);
    }

    return this;
  }

  /**
   * 计算综合得分
   * @returns {Object} { score, buyScore, sellScore, signals, shouldTrade, action }
   */
  calculateScore() {
    const signals = this._currentSignals;
    const strategies = Object.keys(signals);

    if (strategies.length === 0) {
      return {
        score: 0.5,
        buyScore: 0,
        sellScore: 0,
        signals: {},
        shouldTrade: false,
        action: 'hold',
      };
    }

    // 计算有效权重 (考虑相关性惩罚)
    const effectiveWeights = this._calculateEffectiveWeights(strategies);

    // 计算加权得分
    let totalWeight = 0;
    let weightedScore = 0;
    let buyScore = 0;
    let sellScore = 0;
    const signalDetails = {};

    for (const strategy of strategies) {
      const signal = signals[strategy];
      const weight = effectiveWeights[strategy] || 0;

      weightedScore += signal.score * weight;
      totalWeight += weight;

      // 分解为买入/卖出得分
      if (signal.score > 0.5) {
        buyScore += (signal.score - 0.5) * 2 * weight;
      } else if (signal.score < 0.5) {
        sellScore += (0.5 - signal.score) * 2 * weight;
      }

      signalDetails[strategy] = {
        rawScore: signal.score,
        weight: weight,
        contribution: signal.score * weight,
        status: this._strategyStatus[strategy]?.status || StrategyStatus.ACTIVE,
      };
    }

    // 归一化得分
    const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0.5;
    const normalizedBuy = totalWeight > 0 ? buyScore / totalWeight : 0;
    const normalizedSell = totalWeight > 0 ? sellScore / totalWeight : 0;

    // 判断交易动作
    let action = 'hold';
    let shouldTrade = false;

    if (normalizedScore >= this.threshold) {
      action = 'buy';
      shouldTrade = true;
    } else if (normalizedScore <= this.sellThreshold) {
      action = 'sell';
      shouldTrade = true;
    }

    const result = {
      score: normalizedScore,
      buyScore: normalizedBuy,
      sellScore: normalizedSell,
      signals: signalDetails,
      shouldTrade,
      action,
      threshold: this.threshold,
      sellThreshold: this.sellThreshold,
      totalWeight,
      timestamp: Date.now(),
    };

    // 记录历史得分
    this._lastScores.push(result);
    if (this._lastScores.length > 100) {
      this._lastScores.shift();
    }

    this.emit('scoreCalculated', result);

    return result;
  }

  /**
   * 清除当前信号 (每个 tick 后调用)
   */
  clearCurrentSignals() {
    this._currentSignals = {};
  }

  // ============================================
  // 权重动态调整
  // ============================================

  /**
   * 更新策略表现 (每次交易结束后调用)
   * @param {string} strategy - 策略名称
   * @param {Object} tradeResult - { profit, entryPrice, exitPrice, ... }
   */
  updatePerformance(strategy, tradeResult) {
    const perf = this._strategyPerformance[strategy];
    if (!perf) return;

    const { profit = 0, win = profit > 0 } = tradeResult;

    // 更新统计
    perf.trades++;
    perf.totalPnL += profit;
    perf.equity += profit;

    if (win) {
      perf.wins++;
      perf.consecutiveLosses = 0;
    } else {
      perf.losses++;
      perf.consecutiveLosses++;
    }

    // 更新峰值和回撤
    if (perf.equity > perf.peakEquity) {
      perf.peakEquity = perf.equity;
    }
    const currentDrawdown = perf.peakEquity > 0
      ? (perf.peakEquity - perf.equity) / perf.peakEquity
      : 0;
    perf.maxDrawdown = Math.max(perf.maxDrawdown, currentDrawdown);

    perf.lastUpdate = Date.now();

    // 检查熔断条件
    this._checkCircuitBreaker(strategy);

    // 动态调整权重
    if (this.weightAdjustment.enabled &&
        perf.trades % this.weightAdjustment.evaluationPeriod === 0) {
      this._adjustWeight(strategy);
    }

    this.emit('performanceUpdated', { strategy, performance: perf });
  }

  /**
   * 动态调整策略权重
   * @private
   */
  _adjustWeight(strategy) {
    const perf = this._strategyPerformance[strategy];
    if (!perf || perf.trades < this.weightAdjustment.evaluationPeriod) return;

    const baseWeight = this.baseWeights[strategy];
    const { adjustmentFactor, minWeight, maxWeight } = this.weightAdjustment;

    // 计算表现得分
    const winRate = perf.trades > 0 ? perf.wins / perf.trades : 0.5;
    const avgPnL = perf.trades > 0 ? perf.totalPnL / perf.trades : 0;

    // 表现因子: 基于胜率和盈亏
    let performanceFactor = 1.0;

    // 胜率调整
    if (winRate > 0.6) {
      performanceFactor += (winRate - 0.5) * adjustmentFactor;
    } else if (winRate < 0.4) {
      performanceFactor -= (0.5 - winRate) * adjustmentFactor;
    }

    // 计算新权重
    let newWeight = baseWeight * performanceFactor;
    newWeight = Math.max(minWeight, Math.min(maxWeight, newWeight));

    // 更新权重
    const oldWeight = this.currentWeights[strategy];
    this.currentWeights[strategy] = newWeight;

    this.emit('weightAdjusted', {
      strategy,
      oldWeight,
      newWeight,
      performanceFactor,
      winRate,
    });
  }

  // ============================================
  // 相关性限制
  // ============================================

  /**
   * 计算考虑相关性后的有效权重
   * @private
   */
  _calculateEffectiveWeights(strategies) {
    if (!this.correlationConfig.enabled) {
      // 直接返回当前权重
      const weights = {};
      for (const s of strategies) {
        weights[s] = this.currentWeights[s] || 0;
      }
      return weights;
    }

    const effectiveWeights = {};
    const { maxCorrelation, penaltyFactor, matrix } = this.correlationConfig;

    // 计算每个策略的相关性惩罚
    for (const strategy of strategies) {
      let penalty = 0;
      let maxCorr = 0;

      // 检查与其他活跃策略的相关性
      for (const other of strategies) {
        if (strategy === other) continue;

        const key = this._getCorrelationKey(strategy, other);
        const correlation = matrix[key] || 0;

        if (Math.abs(correlation) > maxCorrelation) {
          // 超过阈值，计算惩罚
          const excess = Math.abs(correlation) - maxCorrelation;
          penalty += excess * penaltyFactor;
          maxCorr = Math.max(maxCorr, Math.abs(correlation));
        }
      }

      // 应用惩罚
      const baseWeight = this.currentWeights[strategy] || 0;
      effectiveWeights[strategy] = Math.max(0, baseWeight * (1 - penalty));
    }

    return effectiveWeights;
  }

  /**
   * 获取相关性键
   * @private
   */
  _getCorrelationKey(s1, s2) {
    return [s1, s2].sort().join('-');
  }

  /**
   * 自动计算策略信号相关性 (基于历史信号)
   */
  calculateSignalCorrelation() {
    const strategies = Object.keys(this.baseWeights);
    const correlationMatrix = {};

    for (let i = 0; i < strategies.length; i++) {
      for (let j = i + 1; j < strategies.length; j++) {
        const s1 = strategies[i];
        const s2 = strategies[j];

        const signals1 = this._signalHistory
          .filter(s => s.strategy === s1)
          .map(s => s.score);
        const signals2 = this._signalHistory
          .filter(s => s.strategy === s2)
          .map(s => s.score);

        // 对齐信号
        const minLen = Math.min(signals1.length, signals2.length);
        if (minLen < 10) continue; // 数据不足

        const aligned1 = signals1.slice(-minLen);
        const aligned2 = signals2.slice(-minLen);

        // 计算皮尔逊相关系数
        const correlation = this._pearsonCorrelation(aligned1, aligned2);
        const key = this._getCorrelationKey(s1, s2);
        correlationMatrix[key] = correlation;
      }
    }

    this.correlationConfig.matrix = correlationMatrix;
    this.emit('correlationUpdated', correlationMatrix);

    return correlationMatrix;
  }

  /**
   * 计算皮尔逊相关系数
   * @private
   */
  _pearsonCorrelation(x, y) {
    const n = x.length;
    if (n === 0) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );

    return denominator === 0 ? 0 : numerator / denominator;
  }

  // ============================================
  // 熔断机制
  // ============================================

  /**
   * 检查是否触发熔断
   * @private
   */
  _checkCircuitBreaker(strategy) {
    if (!this.circuitBreaker.enabled) return;

    const perf = this._strategyPerformance[strategy];
    const status = this._strategyStatus[strategy];

    if (!perf || status.status === StrategyStatus.CIRCUIT_BREAK) return;

    const {
      consecutiveLossLimit,
      maxDrawdown,
      minWinRate,
      evaluationWindow
    } = this.circuitBreaker;

    let breakReason = null;

    // 检查连续亏损
    if (perf.consecutiveLosses >= consecutiveLossLimit) {
      breakReason = CircuitBreakReason.CONSECUTIVE_LOSS;
    }

    // 检查最大回撤
    if (perf.maxDrawdown >= maxDrawdown) {
      breakReason = CircuitBreakReason.DRAWDOWN;
    }

    // 检查胜率 (需要足够样本)
    if (perf.trades >= evaluationWindow) {
      const winRate = perf.wins / perf.trades;
      if (winRate < minWinRate) {
        breakReason = CircuitBreakReason.WIN_RATE_LOW;
      }
    }

    if (breakReason) {
      this._triggerCircuitBreak(strategy, breakReason);
    }
  }

  /**
   * 触发策略熔断
   * @param {string} strategy - 策略名称
   * @param {string} reason - 熔断原因
   */
  _triggerCircuitBreak(strategy, reason) {
    const status = this._strategyStatus[strategy];

    status.status = StrategyStatus.CIRCUIT_BREAK;
    status.reason = reason;
    status.timestamp = Date.now();
    status.cooldownUntil = Date.now() + this.circuitBreaker.coolingPeriod;

    this.emit('circuitBreak', {
      strategy,
      reason,
      performance: this._strategyPerformance[strategy],
      cooldownUntil: status.cooldownUntil,
    });

    console.warn(`[SignalWeightingSystem] 策略熔断: ${strategy}, 原因: ${reason}`);

    // 自动恢复计时
    if (this.circuitBreaker.autoRecover) {
      status.status = StrategyStatus.COOLING;
    }
  }

  /**
   * 手动触发熔断
   * @param {string} strategy - 策略名称
   */
  circuitBreak(strategy) {
    this._triggerCircuitBreak(strategy, CircuitBreakReason.MANUAL);
  }

  /**
   * 恢复熔断策略
   * @param {string} strategy - 策略名称
   */
  recoverStrategy(strategy) {
    this._recoverStrategy(strategy);
  }

  /**
   * 内部恢复策略
   * @private
   */
  _recoverStrategy(strategy) {
    const status = this._strategyStatus[strategy];
    if (!status) return;

    const perf = this._strategyPerformance[strategy];

    // 重置部分表现数据
    if (perf) {
      perf.consecutiveLosses = 0;
      // 重置回撤计算基准
      perf.peakEquity = perf.equity;
      perf.maxDrawdown = 0;
    }

    status.status = StrategyStatus.ACTIVE;
    status.reason = null;
    status.cooldownUntil = null;
    status.timestamp = Date.now();

    this.emit('strategyRecovered', { strategy });
    console.log(`[SignalWeightingSystem] 策略恢复: ${strategy}`);
  }

  // ============================================
  // 查询接口
  // ============================================

  /**
   * 获取策略状态
   * @param {string} strategy - 策略名称
   */
  getStrategyStatus(strategy) {
    return this._strategyStatus[strategy] || null;
  }

  /**
   * 获取所有策略状态
   */
  getAllStatus() {
    const result = {};
    for (const [name, status] of Object.entries(this._strategyStatus)) {
      result[name] = {
        ...status,
        weight: this.currentWeights[name],
        baseWeight: this.baseWeights[name],
        performance: this._strategyPerformance[name],
      };
    }
    return result;
  }

  /**
   * 获取策略表现
   * @param {string} strategy - 策略名称
   */
  getPerformance(strategy) {
    return this._strategyPerformance[strategy] || null;
  }

  /**
   * 获取当前权重配置
   */
  getWeights() {
    return { ...this.currentWeights };
  }

  /**
   * 获取相关性矩阵
   */
  getCorrelationMatrix() {
    return { ...this.correlationConfig.matrix };
  }

  /**
   * 获取最近得分历史
   * @param {number} limit - 返回数量
   */
  getScoreHistory(limit = 10) {
    return this._lastScores.slice(-limit);
  }

  /**
   * 获取系统摘要
   */
  getSummary() {
    const strategies = Object.keys(this.baseWeights);
    const activeCount = strategies.filter(
      s => this._strategyStatus[s]?.status === StrategyStatus.ACTIVE
    ).length;
    const breakCount = strategies.filter(
      s => this._strategyStatus[s]?.status === StrategyStatus.CIRCUIT_BREAK ||
           this._strategyStatus[s]?.status === StrategyStatus.COOLING
    ).length;

    return {
      totalStrategies: strategies.length,
      activeStrategies: activeCount,
      circuitBrokenStrategies: breakCount,
      threshold: this.threshold,
      sellThreshold: this.sellThreshold,
      weights: this.currentWeights,
      dynamicWeightsEnabled: this.weightAdjustment.enabled,
      correlationLimitEnabled: this.correlationConfig.enabled,
      circuitBreakerEnabled: this.circuitBreaker.enabled,
    };
  }

  // ============================================
  // 配置更新
  // ============================================

  /**
   * 更新交易阈值
   * @param {number} buyThreshold - 买入阈值
   * @param {number} sellThreshold - 卖出阈值
   */
  setThresholds(buyThreshold, sellThreshold) {
    this.threshold = buyThreshold;
    this.sellThreshold = sellThreshold;
    this.emit('thresholdsUpdated', { buyThreshold, sellThreshold });
  }

  /**
   * 重置策略权重到基础值
   */
  resetWeights() {
    this.currentWeights = { ...this.baseWeights };
    this.emit('weightsReset');
  }

  /**
   * 重置策略表现数据
   * @param {string} strategy - 策略名称，不传则重置所有
   */
  resetPerformance(strategy = null) {
    if (strategy) {
      this._resetStrategyPerformance(strategy);
    } else {
      for (const name of Object.keys(this._strategyPerformance)) {
        this._resetStrategyPerformance(name);
      }
    }
  }

  /**
   * @private
   */
  _resetStrategyPerformance(strategy) {
    this._strategyPerformance[strategy] = {
      trades: 0,
      wins: 0,
      losses: 0,
      consecutiveLosses: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      equity: 0,
      peakEquity: 0,
      signals: [],
      lastUpdate: Date.now(),
    };
  }
}

// 导出默认类
export default SignalWeightingSystem;
