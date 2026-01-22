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

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

/**
 * 策略状态枚举
 */
export const StrategyStatus = { // 导出常量 StrategyStatus
  ACTIVE: 'active',           // 活跃
  CIRCUIT_BREAK: 'circuit_break', // CIRCUITBREAK
  COOLING: 'cooling',         // 冷却
  DISABLED: 'disabled',       // DISABLED权限
}; // 结束代码块

/**
 * 熔断原因枚举
 */
export const CircuitBreakReason = { // 导出常量 CircuitBreakReason
  CONSECUTIVE_LOSS: 'consecutive_loss',   // CONSECUTIVE亏损
  DRAWDOWN: 'drawdown',                   // 回撤
  WIN_RATE_LOW: 'win_rate_low',           // WIN频率最低
  MANUAL: 'manual',                        // MANUAL
}; // 结束代码块

/**
 * 信号权重系统类
 */
export class SignalWeightingSystem extends EventEmitter { // 导出类 SignalWeightingSystem
  /**
   * 构造函数
   * @param {Object} config - 系统配置
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // ============================================
    // 基础配置
    // ============================================

    // 交易阈值: 总分 >= threshold 才执行交易 (降低阈值增加触发机会)
    this.threshold = config.threshold || 0.7; // 设置 threshold

    // 卖出阈值: 总分 <= sellThreshold 触发卖出 (提高阈值增加触发机会)
    this.sellThreshold = config.sellThreshold || 0.3; // 设置 sellThreshold

    // ============================================
    // 权重配置
    // ============================================

    // 基础权重配置 { strategyName: weight }
    this.baseWeights = config.baseWeights || {}; // 设置 baseWeights

    // 当前生效权重 (动态调整后)
    this.currentWeights = { ...this.baseWeights }; // 设置 currentWeights

    // 权重动态调整参数
    this.weightAdjustment = { // 设置 weightAdjustment
      // 是否启用动态权重
      enabled: config.dynamicWeights !== false, // 是否启用动态权重
      // 权重调整因子 (0-1, 基于表现调整的幅度)
      adjustmentFactor: config.adjustmentFactor || 0.2, // 权重调整因子 (0-1, 基于表现调整的幅度)
      // 评估周期 (交易次数)
      evaluationPeriod: config.evaluationPeriod || 20, // 评估周期 (交易次数)
      // 最小权重
      minWeight: config.minWeight || 0.05, // 最小Weight
      // 最大权重
      maxWeight: config.maxWeight || 0.6, // 最大Weight
    }; // 结束代码块

    // ============================================
    // 相关性限制配置
    // ============================================

    this.correlationConfig = { // 设置 correlationConfig
      // 是否启用相关性限制
      enabled: config.correlationLimit !== false, // 是否启用相关性限制
      // 最大允许相关性
      maxCorrelation: config.maxCorrelation || 0.7, // 最大Correlation
      // 相关性惩罚系数: 相关性高时降低组合权重
      penaltyFactor: config.correlationPenaltyFactor || 0.5, // 相关性惩罚系数: 相关性高时降低组合权重
      // 相关性矩阵 (策略间相关性)
      matrix: config.correlationMatrix || {}, // 相关性矩阵 (策略间相关性)
    }; // 结束代码块

    // ============================================
    // 熔断机制配置
    // ============================================

    this.circuitBreaker = { // 设置 circuitBreaker
      // 是否启用熔断
      enabled: config.circuitBreaker !== false, // 启用
      // 连续亏损次数触发熔断
      consecutiveLossLimit: config.consecutiveLossLimit || 5, // 连续亏损次数触发熔断
      // 最大回撤触发熔断 (百分比)
      maxDrawdown: config.maxDrawdownLimit || 0.15, // 最大回撤触发熔断 (百分比)
      // 最低胜率触发熔断
      minWinRate: config.minWinRate || 0.3, // 最低胜率触发熔断
      // 评估窗口 (交易次数)
      evaluationWindow: config.evaluationWindow || 30, // 评估窗口 (交易次数)
      // 冷却时间 (毫秒)
      coolingPeriod: config.coolingPeriod || 3600000, // 冷却时间 (毫秒)
      // 自动恢复
      autoRecover: config.autoRecover !== false, // 自动Recover
    }; // 结束代码块

    // ============================================
    // 内部状态
    // ============================================

    // 策略状态 { strategyName: { status, reason, timestamp, ... } }
    this._strategyStatus = {}; // 设置 _strategyStatus

    // 策略表现数据 { strategyName: { trades, wins, losses, pnl, ... } }
    this._strategyPerformance = {}; // 设置 _strategyPerformance

    // 信号历史 (用于计算相关性)
    this._signalHistory = []; // 设置 _signalHistory

    // 最近的综合得分
    this._lastScores = []; // 设置 _lastScores

    // 当前计算的信号得分
    this._currentSignals = {}; // 设置 _currentSignals
  } // 结束代码块

  // ============================================
  // 策略注册与配置
  // ============================================

  /**
   * 注册策略
   * @param {string} name - 策略名称
   * @param {number} weight - 基础权重 (0-1)
   * @param {Object} options - 额外选项
   */
  registerStrategy(name, weight = 0.2, options = {}) { // 调用 registerStrategy
    // 规范化权重
    weight = Math.max(0, Math.min(1, weight)); // 赋值 weight

    this.baseWeights[name] = weight; // 访问 baseWeights
    this.currentWeights[name] = weight; // 访问 currentWeights

    this._strategyStatus[name] = { // 访问 _strategyStatus
      status: StrategyStatus.ACTIVE, // 状态
      reason: null, // reason
      timestamp: Date.now(), // 时间戳
      cooldownUntil: null, // 冷却Until
    }; // 结束代码块

    this._strategyPerformance[name] = { // 访问 _strategyPerformance
      trades: 0, // 成交
      wins: 0, // wins
      losses: 0, // losses
      consecutiveLosses: 0, // consecutiveLosses
      totalPnL: 0, // 总PnL
      maxDrawdown: 0, // 最大回撤
      equity: 0, // equity
      peakEquity: 0, // peakEquity
      signals: [], // 信号
      lastUpdate: Date.now(), // last更新
    }; // 结束代码块

    this.emit('strategyRegistered', { name, weight, options }); // 调用 emit

    return this; // 返回结果
  } // 结束代码块

  /**
   * 批量注册策略
   * @param {Object} strategies - { name: weight } 或 { name: { weight, options } }
   */
  registerStrategies(strategies) { // 调用 registerStrategies
    for (const [name, config] of Object.entries(strategies)) { // 循环 const [name, config] of Object.entries(strate...
      if (typeof config === 'number') { // 条件判断 typeof config === 'number'
        this.registerStrategy(name, config); // 调用 registerStrategy
      } else { // 执行语句
        this.registerStrategy(name, config.weight, config.options || {}); // 调用 registerStrategy
      } // 结束代码块
    } // 结束代码块
    return this; // 返回结果
  } // 结束代码块

  /**
   * 设置策略间相关性
   * @param {string} strategy1 - 策略1名称
   * @param {string} strategy2 - 策略2名称
   * @param {number} correlation - 相关系数 (-1 到 1)
   */
  setCorrelation(strategy1, strategy2, correlation) { // 调用 setCorrelation
    const key = this._getCorrelationKey(strategy1, strategy2); // 定义常量 key
    this.correlationConfig.matrix[key] = correlation; // 访问 correlationConfig
    return this; // 返回结果
  } // 结束代码块

  /**
   * 批量设置相关性矩阵
   * @param {Object} matrix - { "SMA-RSI": 0.3, ... }
   */
  setCorrelationMatrix(matrix) { // 调用 setCorrelationMatrix
    this.correlationConfig.matrix = { ...matrix }; // 访问 correlationConfig
    return this; // 返回结果
  } // 结束代码块

  // ============================================
  // 信号评分
  // ============================================

  /**
   * 记录策略信号得分
   * @param {string} strategy - 策略名称
   * @param {number} score - 信号得分 (0-1, 0.5 为中性)
   * @param {Object} metadata - 额外元数据
   */
  recordSignal(strategy, score, metadata = {}) { // 调用 recordSignal
    // 验证策略存在
    if (!this.baseWeights[strategy]) { // 条件判断 !this.baseWeights[strategy]
      console.warn(`[SignalWeightingSystem] 未注册的策略: ${strategy}`); // 控制台输出
      return this; // 返回结果
    } // 结束代码块

    // 检查策略状态
    const status = this._strategyStatus[strategy]; // 定义常量 status
    if (status.status === StrategyStatus.CIRCUIT_BREAK) { // 条件判断 status.status === StrategyStatus.CIRCUIT_BREAK
      // 熔断中的策略信号设为中性
      score = 0.5; // 赋值 score
    } else if (status.status === StrategyStatus.COOLING) { // 执行语句
      // 检查冷却是否结束
      if (Date.now() >= status.cooldownUntil) { // 条件判断 Date.now() >= status.cooldownUntil
        this._recoverStrategy(strategy); // 调用 _recoverStrategy
      } else { // 执行语句
        score = 0.5; // 赋值 score
      } // 结束代码块
    } // 结束代码块

    // 规范化得分
    score = Math.max(0, Math.min(1, score)); // 赋值 score

    // 记录信号
    this._currentSignals[strategy] = { // 访问 _currentSignals
      score, // 执行语句
      weight: this.currentWeights[strategy], // weight
      timestamp: Date.now(), // 时间戳
      metadata, // 执行语句
    }; // 结束代码块

    // 添加到历史
    this._signalHistory.push({ // 访问 _signalHistory
      strategy, // 执行语句
      score, // 执行语句
      timestamp: Date.now(), // 时间戳
    }); // 结束代码块

    // 保留最近 1000 条记录
    if (this._signalHistory.length > 1000) { // 条件判断 this._signalHistory.length > 1000
      this._signalHistory = this._signalHistory.slice(-1000); // 设置 _signalHistory
    } // 结束代码块

    return this; // 返回结果
  } // 结束代码块

  /**
   * 计算综合得分
   * @returns {Object} { score, buyScore, sellScore, signals, shouldTrade, action }
   */
  calculateScore() { // 调用 calculateScore
    const signals = this._currentSignals; // 定义常量 signals
    const strategies = Object.keys(signals); // 定义常量 strategies

    if (strategies.length === 0) { // 条件判断 strategies.length === 0
      return { // 返回结果
        score: 0.5, // 分数
        buyScore: 0, // buy分数
        sellScore: 0, // sell分数
        signals: {}, // 信号
        shouldTrade: false, // 是否需要交易
        action: 'hold', // action
      }; // 结束代码块
    } // 结束代码块

    // 计算有效权重 (考虑相关性惩罚)
    const effectiveWeights = this._calculateEffectiveWeights(strategies); // 定义常量 effectiveWeights

    // 计算加权得分
    let totalWeight = 0; // 定义变量 totalWeight
    let weightedScore = 0; // 定义变量 weightedScore
    let buyScore = 0; // 定义变量 buyScore
    let sellScore = 0; // 定义变量 sellScore
    const signalDetails = {}; // 定义常量 signalDetails

    for (const strategy of strategies) { // 循环 const strategy of strategies
      const signal = signals[strategy]; // 定义常量 signal
      const weight = effectiveWeights[strategy] || 0; // 定义常量 weight

      weightedScore += signal.score * weight; // 执行语句
      totalWeight += weight; // 执行语句

      // 分解为买入/卖出得分
      if (signal.score > 0.5) { // 条件判断 signal.score > 0.5
        buyScore += (signal.score - 0.5) * 2 * weight; // 执行语句
      } else if (signal.score < 0.5) { // 执行语句
        sellScore += (0.5 - signal.score) * 2 * weight; // 执行语句
      } // 结束代码块

      signalDetails[strategy] = { // 执行语句
        rawScore: signal.score, // raw分数
        weight: weight, // weight
        contribution: signal.score * weight, // contribution
        status: this._strategyStatus[strategy]?.status || StrategyStatus.ACTIVE, // 状态
      }; // 结束代码块
    } // 结束代码块

    // 归一化得分
    const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0.5; // 定义常量 normalizedScore
    const normalizedBuy = totalWeight > 0 ? buyScore / totalWeight : 0; // 定义常量 normalizedBuy
    const normalizedSell = totalWeight > 0 ? sellScore / totalWeight : 0; // 定义常量 normalizedSell

    // 判断交易动作
    let action = 'hold'; // 定义变量 action
    let shouldTrade = false; // 定义变量 shouldTrade

    if (normalizedScore >= this.threshold) { // 条件判断 normalizedScore >= this.threshold
      action = 'buy'; // 赋值 action
      shouldTrade = true; // 赋值 shouldTrade
    } else if (normalizedScore <= this.sellThreshold) { // 执行语句
      action = 'sell'; // 赋值 action
      shouldTrade = true; // 赋值 shouldTrade
    } // 结束代码块

    const result = { // 定义常量 result
      score: normalizedScore, // 分数
      buyScore: normalizedBuy, // buy分数
      sellScore: normalizedSell, // sell分数
      signals: signalDetails, // 信号
      shouldTrade, // 执行语句
      action, // 执行语句
      threshold: this.threshold, // 阈值
      sellThreshold: this.sellThreshold, // sell阈值
      totalWeight, // 执行语句
      timestamp: Date.now(), // 时间戳
    }; // 结束代码块

    // 记录历史得分
    this._lastScores.push(result); // 访问 _lastScores
    if (this._lastScores.length > 100) { // 条件判断 this._lastScores.length > 100
      this._lastScores.shift(); // 访问 _lastScores
    } // 结束代码块

    this.emit('scoreCalculated', result); // 调用 emit

    return result; // 返回结果
  } // 结束代码块

  /**
   * 清除当前信号 (每个 tick 后调用)
   */
  clearCurrentSignals() { // 调用 clearCurrentSignals
    this._currentSignals = {}; // 设置 _currentSignals
  } // 结束代码块

  // ============================================
  // 权重动态调整
  // ============================================

  /**
   * 更新策略表现 (每次交易结束后调用)
   * @param {string} strategy - 策略名称
   * @param {Object} tradeResult - { profit, entryPrice, exitPrice, ... }
   */
  updatePerformance(strategy, tradeResult) { // 调用 updatePerformance
    const perf = this._strategyPerformance[strategy]; // 定义常量 perf
    if (!perf) return; // 条件判断 !perf

    const { profit = 0, win = profit > 0 } = tradeResult; // 解构赋值

    // 更新统计
    perf.trades++; // 执行语句
    perf.totalPnL += profit; // 执行语句
    perf.equity += profit; // 执行语句

    if (win) { // 条件判断 win
      perf.wins++; // 执行语句
      perf.consecutiveLosses = 0; // 赋值 perf.consecutiveLosses
    } else { // 执行语句
      perf.losses++; // 执行语句
      perf.consecutiveLosses++; // 执行语句
    } // 结束代码块

    // 更新峰值和回撤
    if (perf.equity > perf.peakEquity) { // 条件判断 perf.equity > perf.peakEquity
      perf.peakEquity = perf.equity; // 赋值 perf.peakEquity
    } // 结束代码块
    const currentDrawdown = perf.peakEquity > 0 // 定义常量 currentDrawdown
      ? (perf.peakEquity - perf.equity) / perf.peakEquity // 执行语句
      : 0; // 执行语句
    perf.maxDrawdown = Math.max(perf.maxDrawdown, currentDrawdown); // 赋值 perf.maxDrawdown

    perf.lastUpdate = Date.now(); // 赋值 perf.lastUpdate

    // 检查熔断条件
    this._checkCircuitBreaker(strategy); // 调用 _checkCircuitBreaker

    // 动态调整权重
    if (this.weightAdjustment.enabled && // 条件判断 this.weightAdjustment.enabled &&
        perf.trades % this.weightAdjustment.evaluationPeriod === 0) { // 执行语句
      this._adjustWeight(strategy); // 调用 _adjustWeight
    } // 结束代码块

    this.emit('performanceUpdated', { strategy, performance: perf }); // 调用 emit
  } // 结束代码块

  /**
   * 动态调整策略权重
   * @private
   */
  _adjustWeight(strategy) { // 调用 _adjustWeight
    const perf = this._strategyPerformance[strategy]; // 定义常量 perf
    if (!perf || perf.trades < this.weightAdjustment.evaluationPeriod) return; // 条件判断 !perf || perf.trades < this.weightAdjustment....

    const baseWeight = this.baseWeights[strategy]; // 定义常量 baseWeight
    const { adjustmentFactor, minWeight, maxWeight } = this.weightAdjustment; // 解构赋值

    // 计算表现得分
    const winRate = perf.trades > 0 ? perf.wins / perf.trades : 0.5; // 定义常量 winRate
    const avgPnL = perf.trades > 0 ? perf.totalPnL / perf.trades : 0; // 定义常量 avgPnL

    // 表现因子: 基于胜率和盈亏
    let performanceFactor = 1.0; // 定义变量 performanceFactor

    // 胜率调整
    if (winRate > 0.6) { // 条件判断 winRate > 0.6
      performanceFactor += (winRate - 0.5) * adjustmentFactor; // 执行语句
    } else if (winRate < 0.4) { // 执行语句
      performanceFactor -= (0.5 - winRate) * adjustmentFactor; // 执行语句
    } // 结束代码块

    // 计算新权重
    let newWeight = baseWeight * performanceFactor; // 定义变量 newWeight
    newWeight = Math.max(minWeight, Math.min(maxWeight, newWeight)); // 赋值 newWeight

    // 更新权重
    const oldWeight = this.currentWeights[strategy]; // 定义常量 oldWeight
    this.currentWeights[strategy] = newWeight; // 访问 currentWeights

    this.emit('weightAdjusted', { // 调用 emit
      strategy, // 执行语句
      oldWeight, // 执行语句
      newWeight, // 执行语句
      performanceFactor, // 执行语句
      winRate, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 相关性限制
  // ============================================

  /**
   * 计算考虑相关性后的有效权重
   * @private
   */
  _calculateEffectiveWeights(strategies) { // 调用 _calculateEffectiveWeights
    if (!this.correlationConfig.enabled) { // 条件判断 !this.correlationConfig.enabled
      // 直接返回当前权重
      const weights = {}; // 定义常量 weights
      for (const s of strategies) { // 循环 const s of strategies
        weights[s] = this.currentWeights[s] || 0; // 执行语句
      } // 结束代码块
      return weights; // 返回结果
    } // 结束代码块

    const effectiveWeights = {}; // 定义常量 effectiveWeights
    const { maxCorrelation, penaltyFactor, matrix } = this.correlationConfig; // 解构赋值

    // 计算每个策略的相关性惩罚
    for (const strategy of strategies) { // 循环 const strategy of strategies
      let penalty = 0; // 定义变量 penalty
      let maxCorr = 0; // 定义变量 maxCorr

      // 检查与其他活跃策略的相关性
      for (const other of strategies) { // 循环 const other of strategies
        if (strategy === other) continue; // 条件判断 strategy === other

        const key = this._getCorrelationKey(strategy, other); // 定义常量 key
        const correlation = matrix[key] || 0; // 定义常量 correlation

        if (Math.abs(correlation) > maxCorrelation) { // 条件判断 Math.abs(correlation) > maxCorrelation
          // 超过阈值，计算惩罚
          const excess = Math.abs(correlation) - maxCorrelation; // 定义常量 excess
          penalty += excess * penaltyFactor; // 执行语句
          maxCorr = Math.max(maxCorr, Math.abs(correlation)); // 赋值 maxCorr
        } // 结束代码块
      } // 结束代码块

      // 应用惩罚
      const baseWeight = this.currentWeights[strategy] || 0; // 定义常量 baseWeight
      effectiveWeights[strategy] = Math.max(0, baseWeight * (1 - penalty)); // 执行语句
    } // 结束代码块

    return effectiveWeights; // 返回结果
  } // 结束代码块

  /**
   * 获取相关性键
   * @private
   */
  _getCorrelationKey(s1, s2) { // 调用 _getCorrelationKey
    return [s1, s2].sort().join('-'); // 返回结果
  } // 结束代码块

  /**
   * 自动计算策略信号相关性 (基于历史信号)
   */
  calculateSignalCorrelation() { // 调用 calculateSignalCorrelation
    const strategies = Object.keys(this.baseWeights); // 定义常量 strategies
    const correlationMatrix = {}; // 定义常量 correlationMatrix

    for (let i = 0; i < strategies.length; i++) { // 循环 let i = 0; i < strategies.length; i++
      for (let j = i + 1; j < strategies.length; j++) { // 循环 let j = i + 1; j < strategies.length; j++
        const s1 = strategies[i]; // 定义常量 s1
        const s2 = strategies[j]; // 定义常量 s2

        const signals1 = this._signalHistory // 定义常量 signals1
          .filter(s => s.strategy === s1) // 定义箭头函数
          .map(s => s.score); // 定义箭头函数
        const signals2 = this._signalHistory // 定义常量 signals2
          .filter(s => s.strategy === s2) // 定义箭头函数
          .map(s => s.score); // 定义箭头函数

        // 对齐信号
        const minLen = Math.min(signals1.length, signals2.length); // 定义常量 minLen
        if (minLen < 10) continue; // 数据不足

        const aligned1 = signals1.slice(-minLen); // 定义常量 aligned1
        const aligned2 = signals2.slice(-minLen); // 定义常量 aligned2

        // 计算皮尔逊相关系数
        const correlation = this._pearsonCorrelation(aligned1, aligned2); // 定义常量 correlation
        const key = this._getCorrelationKey(s1, s2); // 定义常量 key
        correlationMatrix[key] = correlation; // 执行语句
      } // 结束代码块
    } // 结束代码块

    this.correlationConfig.matrix = correlationMatrix; // 访问 correlationConfig
    this.emit('correlationUpdated', correlationMatrix); // 调用 emit

    return correlationMatrix; // 返回结果
  } // 结束代码块

  /**
   * 计算皮尔逊相关系数
   * @private
   */
  _pearsonCorrelation(x, y) { // 调用 _pearsonCorrelation
    const n = x.length; // 定义常量 n
    if (n === 0) return 0; // 条件判断 n === 0

    const sumX = x.reduce((a, b) => a + b, 0); // 定义函数 sumX
    const sumY = y.reduce((a, b) => a + b, 0); // 定义函数 sumY
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0); // 定义函数 sumXY
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0); // 定义函数 sumX2
    const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0); // 定义函数 sumY2

    const numerator = n * sumXY - sumX * sumY; // 定义常量 numerator
    const denominator = Math.sqrt( // 定义常量 denominator
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY) // 执行语句
    ); // 结束调用或参数

    return denominator === 0 ? 0 : numerator / denominator; // 返回结果
  } // 结束代码块

  // ============================================
  // 熔断机制
  // ============================================

  /**
   * 检查是否触发熔断
   * @private
   */
  _checkCircuitBreaker(strategy) { // 调用 _checkCircuitBreaker
    if (!this.circuitBreaker.enabled) return; // 条件判断 !this.circuitBreaker.enabled

    const perf = this._strategyPerformance[strategy]; // 定义常量 perf
    const status = this._strategyStatus[strategy]; // 定义常量 status

    if (!perf || status.status === StrategyStatus.CIRCUIT_BREAK) return; // 条件判断 !perf || status.status === StrategyStatus.CIR...

    const { // 解构赋值
      consecutiveLossLimit, // 执行语句
      maxDrawdown, // 执行语句
      minWinRate, // 执行语句
      evaluationWindow // 执行语句
    } = this.circuitBreaker; // 执行语句

    let breakReason = null; // 定义变量 breakReason

    // 检查连续亏损
    if (perf.consecutiveLosses >= consecutiveLossLimit) { // 条件判断 perf.consecutiveLosses >= consecutiveLossLimit
      breakReason = CircuitBreakReason.CONSECUTIVE_LOSS; // 赋值 breakReason
    } // 结束代码块

    // 检查最大回撤
    if (perf.maxDrawdown >= maxDrawdown) { // 条件判断 perf.maxDrawdown >= maxDrawdown
      breakReason = CircuitBreakReason.DRAWDOWN; // 赋值 breakReason
    } // 结束代码块

    // 检查胜率 (需要足够样本)
    if (perf.trades >= evaluationWindow) { // 条件判断 perf.trades >= evaluationWindow
      const winRate = perf.wins / perf.trades; // 定义常量 winRate
      if (winRate < minWinRate) { // 条件判断 winRate < minWinRate
        breakReason = CircuitBreakReason.WIN_RATE_LOW; // 赋值 breakReason
      } // 结束代码块
    } // 结束代码块

    if (breakReason) { // 条件判断 breakReason
      this._triggerCircuitBreak(strategy, breakReason); // 调用 _triggerCircuitBreak
    } // 结束代码块
  } // 结束代码块

  /**
   * 触发策略熔断
   * @param {string} strategy - 策略名称
   * @param {string} reason - 熔断原因
   */
  _triggerCircuitBreak(strategy, reason) { // 调用 _triggerCircuitBreak
    const status = this._strategyStatus[strategy]; // 定义常量 status

    status.status = StrategyStatus.CIRCUIT_BREAK; // 赋值 status.status
    status.reason = reason; // 赋值 status.reason
    status.timestamp = Date.now(); // 赋值 status.timestamp
    status.cooldownUntil = Date.now() + this.circuitBreaker.coolingPeriod; // 赋值 status.cooldownUntil

    this.emit('circuitBreak', { // 调用 emit
      strategy, // 执行语句
      reason, // 执行语句
      performance: this._strategyPerformance[strategy], // performance
      cooldownUntil: status.cooldownUntil, // 冷却Until
    }); // 结束代码块

    console.warn(`[SignalWeightingSystem] 策略熔断: ${strategy}, 原因: ${reason}`); // 控制台输出

    // 自动恢复计时
    if (this.circuitBreaker.autoRecover) { // 条件判断 this.circuitBreaker.autoRecover
      status.status = StrategyStatus.COOLING; // 赋值 status.status
    } // 结束代码块
  } // 结束代码块

  /**
   * 手动触发熔断
   * @param {string} strategy - 策略名称
   */
  circuitBreak(strategy) { // 调用 circuitBreak
    this._triggerCircuitBreak(strategy, CircuitBreakReason.MANUAL); // 调用 _triggerCircuitBreak
  } // 结束代码块

  /**
   * 恢复熔断策略
   * @param {string} strategy - 策略名称
   */
  recoverStrategy(strategy) { // 调用 recoverStrategy
    this._recoverStrategy(strategy); // 调用 _recoverStrategy
  } // 结束代码块

  /**
   * 内部恢复策略
   * @private
   */
  _recoverStrategy(strategy) { // 调用 _recoverStrategy
    const status = this._strategyStatus[strategy]; // 定义常量 status
    if (!status) return; // 条件判断 !status

    const perf = this._strategyPerformance[strategy]; // 定义常量 perf

    // 重置部分表现数据
    if (perf) { // 条件判断 perf
      perf.consecutiveLosses = 0; // 赋值 perf.consecutiveLosses
      // 重置回撤计算基准
      perf.peakEquity = perf.equity; // 赋值 perf.peakEquity
      perf.maxDrawdown = 0; // 赋值 perf.maxDrawdown
    } // 结束代码块

    status.status = StrategyStatus.ACTIVE; // 赋值 status.status
    status.reason = null; // 赋值 status.reason
    status.cooldownUntil = null; // 赋值 status.cooldownUntil
    status.timestamp = Date.now(); // 赋值 status.timestamp

    this.emit('strategyRecovered', { strategy }); // 调用 emit
    console.log(`[SignalWeightingSystem] 策略恢复: ${strategy}`); // 控制台输出
  } // 结束代码块

  // ============================================
  // 查询接口
  // ============================================

  /**
   * 获取策略状态
   * @param {string} strategy - 策略名称
   */
  getStrategyStatus(strategy) { // 调用 getStrategyStatus
    return this._strategyStatus[strategy] || null; // 返回结果
  } // 结束代码块

  /**
   * 获取所有策略状态
   */
  getAllStatus() { // 调用 getAllStatus
    const result = {}; // 定义常量 result
    for (const [name, status] of Object.entries(this._strategyStatus)) { // 循环 const [name, status] of Object.entries(this._...
      result[name] = { // 执行语句
        ...status, // 展开对象或数组
        weight: this.currentWeights[name], // weight
        baseWeight: this.baseWeights[name], // baseWeight
        performance: this._strategyPerformance[name], // performance
      }; // 结束代码块
    } // 结束代码块
    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取策略表现
   * @param {string} strategy - 策略名称
   */
  getPerformance(strategy) { // 调用 getPerformance
    return this._strategyPerformance[strategy] || null; // 返回结果
  } // 结束代码块

  /**
   * 获取当前权重配置
   */
  getWeights() { // 调用 getWeights
    return { ...this.currentWeights }; // 返回结果
  } // 结束代码块

  /**
   * 获取相关性矩阵
   */
  getCorrelationMatrix() { // 调用 getCorrelationMatrix
    return { ...this.correlationConfig.matrix }; // 返回结果
  } // 结束代码块

  /**
   * 获取最近得分历史
   * @param {number} limit - 返回数量
   */
  getScoreHistory(limit = 10) { // 调用 getScoreHistory
    return this._lastScores.slice(-limit); // 返回结果
  } // 结束代码块

  /**
   * 获取系统摘要
   */
  getSummary() { // 调用 getSummary
    const strategies = Object.keys(this.baseWeights); // 定义常量 strategies
    const activeCount = strategies.filter( // 定义常量 activeCount
      s => this._strategyStatus[s]?.status === StrategyStatus.ACTIVE // 赋值 s
    ).length; // 执行语句
    const breakCount = strategies.filter( // 定义常量 breakCount
      s => this._strategyStatus[s]?.status === StrategyStatus.CIRCUIT_BREAK || // 赋值 s
           this._strategyStatus[s]?.status === StrategyStatus.COOLING // 访问 _strategyStatus
    ).length; // 执行语句

    return { // 返回结果
      totalStrategies: strategies.length, // 总策略
      activeStrategies: activeCount, // 活跃策略
      circuitBrokenStrategies: breakCount, // circuitBroken策略
      threshold: this.threshold, // 阈值
      sellThreshold: this.sellThreshold, // sell阈值
      weights: this.currentWeights, // weights
      dynamicWeightsEnabled: this.weightAdjustment.enabled, // dynamicWeights启用
      correlationLimitEnabled: this.correlationConfig.enabled, // correlation限制启用
      circuitBreakerEnabled: this.circuitBreaker.enabled, // circuitBreaker启用
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 配置更新
  // ============================================

  /**
   * 更新交易阈值
   * @param {number} buyThreshold - 买入阈值
   * @param {number} sellThreshold - 卖出阈值
   */
  setThresholds(buyThreshold, sellThreshold) { // 调用 setThresholds
    this.threshold = buyThreshold; // 设置 threshold
    this.sellThreshold = sellThreshold; // 设置 sellThreshold
    this.emit('thresholdsUpdated', { buyThreshold, sellThreshold }); // 调用 emit
  } // 结束代码块

  /**
   * 重置策略权重到基础值
   */
  resetWeights() { // 调用 resetWeights
    this.currentWeights = { ...this.baseWeights }; // 设置 currentWeights
    this.emit('weightsReset'); // 调用 emit
  } // 结束代码块

  /**
   * 重置策略表现数据
   * @param {string} strategy - 策略名称，不传则重置所有
   */
  resetPerformance(strategy = null) { // 调用 resetPerformance
    if (strategy) { // 条件判断 strategy
      this._resetStrategyPerformance(strategy); // 调用 _resetStrategyPerformance
    } else { // 执行语句
      for (const name of Object.keys(this._strategyPerformance)) { // 循环 const name of Object.keys(this._strategyPerfo...
        this._resetStrategyPerformance(name); // 调用 _resetStrategyPerformance
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * @private
   */
  _resetStrategyPerformance(strategy) { // 调用 _resetStrategyPerformance
    this._strategyPerformance[strategy] = { // 访问 _strategyPerformance
      trades: 0, // 成交
      wins: 0, // wins
      losses: 0, // losses
      consecutiveLosses: 0, // consecutiveLosses
      totalPnL: 0, // 总PnL
      maxDrawdown: 0, // 最大回撤
      equity: 0, // equity
      peakEquity: 0, // peakEquity
      signals: [], // 信号
      lastUpdate: Date.now(), // last更新
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出默认类
export default SignalWeightingSystem; // 默认导出
