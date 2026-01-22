/**
 * 蒙特卡洛模拟
 * Monte Carlo Simulation
 *
 * 通过随机抽样模拟策略的潜在结果分布，评估风险和不确定性
 * Simulates potential outcome distributions through random sampling to assess risk and uncertainty
 *
 * @module src/optimization/MonteCarloSimulation
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

/**
 * 模拟类型
 * Simulation Type
 */
export const SimulationType = { // 导出常量 SimulationType
  TRADE_RESAMPLING: 'trade_resampling',     // 交易重采样
  RETURN_RESAMPLING: 'return_resampling',   // 收益率重采样
  BOOTSTRAP: 'bootstrap',                    // Bootstrap 方法
  PATH_DEPENDENCY: 'path_dependency',        // 路径依赖模拟
}; // 结束代码块

/**
 * 默认配置
 * Default Configuration
 */
export const DEFAULT_MC_CONFIG = { // 导出常量 DEFAULT_MC_CONFIG
  // 模拟次数
  numSimulations: 1000, // 设置 numSimulations 字段

  // 模拟类型
  type: SimulationType.TRADE_RESAMPLING, // 设置 type 字段

  // 是否使用有放回抽样
  withReplacement: true, // 设置 withReplacement 字段

  // 置信区间
  confidenceLevels: [0.95, 0.99], // 设置 confidenceLevels 字段

  // 风险指标计算
  calculateVaR: true, // 设置 calculateVaR 字段
  calculateCVaR: true, // 设置 calculateCVaR 字段

  // 初始资金
  initialCapital: 10000, // 设置 initialCapital 字段

  // 进度回调间隔
  progressInterval: 100, // 设置 progressInterval 字段
}; // 结束代码块

/**
 * 蒙特卡洛模拟类
 * Monte Carlo Simulation Class
 */
export class MonteCarloSimulation extends EventEmitter { // 导出类 MonteCarloSimulation
  /**
   * 构造函数
   * @param {Object} config - 配置
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { ...DEFAULT_MC_CONFIG, ...config }; // 设置 config
    this.simulations = []; // 设置 simulations
    this.statistics = null; // 设置 statistics
    this.isRunning = false; // 设置 isRunning
  } // 结束代码块

  /**
   * 运行蒙特卡洛模拟
   * Run Monte Carlo Simulation
   * @param {Object} options - 模拟选项
   * @returns {Promise<Object>} 模拟结果
   */
  async run(options) { // 执行语句
    const { // 解构赋值
      trades = null,           // 交易记录数组
      returns = null,          // 收益率序列
      equityCurve = null,      // 权益曲线
      numTrades = null,        // 每次模拟的交易数量（可选）
    } = options; // 执行语句

    // 验证输入
    if (!trades && !returns && !equityCurve) { // 条件判断 !trades && !returns && !equityCurve
      throw new Error('必须提供 trades、returns 或 equityCurve 中的至少一个 / At least one of trades, returns, or equityCurve required'); // 抛出异常
    } // 结束代码块

    this.simulations = []; // 设置 simulations
    this.isRunning = true; // 设置 isRunning

    const startTime = Date.now(); // 定义常量 startTime

    this.emit('start', { numSimulations: this.config.numSimulations }); // 调用 emit

    console.log(`[MonteCarlo] 开始模拟，共 ${this.config.numSimulations} 次 / Starting ${this.config.numSimulations} simulations`); // 控制台输出

    // 根据模拟类型选择方法
    const type = this.config.type; // 定义常量 type

    if (type === SimulationType.TRADE_RESAMPLING && trades) { // 条件判断 type === SimulationType.TRADE_RESAMPLING && t...
      await this._runTradeResampling(trades, numTrades); // 等待异步结果
    } else if (type === SimulationType.RETURN_RESAMPLING && returns) { // 执行语句
      await this._runReturnResampling(returns); // 等待异步结果
    } else if (type === SimulationType.BOOTSTRAP && (returns || equityCurve)) { // 执行语句
      await this._runBootstrap(returns || this._extractReturns(equityCurve)); // 等待异步结果
    } else if (type === SimulationType.PATH_DEPENDENCY && (returns || equityCurve)) { // 执行语句
      await this._runPathDependency(returns || this._extractReturns(equityCurve)); // 等待异步结果
    } else { // 执行语句
      // 自动选择最合适的方法
      if (trades && trades.length > 0) { // 条件判断 trades && trades.length > 0
        await this._runTradeResampling(trades, numTrades); // 等待异步结果
      } else if (returns && returns.length > 0) { // 执行语句
        await this._runReturnResampling(returns); // 等待异步结果
      } else if (equityCurve && equityCurve.length > 0) { // 执行语句
        await this._runBootstrap(this._extractReturns(equityCurve)); // 等待异步结果
      } // 结束代码块
    } // 结束代码块

    const endTime = Date.now(); // 定义常量 endTime
    const duration = (endTime - startTime) / 1000; // 定义常量 duration

    // 计算统计数据
    this.statistics = this._calculateStatistics(); // 设置 statistics

    this.isRunning = false; // 设置 isRunning

    // 构建最终结果
    const finalResult = { // 定义常量 finalResult
      type: this.config.type, // 设置 type 字段
      numSimulations: this.config.numSimulations, // 设置 numSimulations 字段
      duration, // 执行语句
      statistics: this.statistics, // 设置 statistics 字段
      distribution: this._getDistribution(), // 设置 distribution 字段
      riskMetrics: this._calculateRiskMetrics(), // 设置 riskMetrics 字段
      confidenceIntervals: this._calculateConfidenceIntervals(), // 设置 confidenceIntervals 字段
      recommendations: this._generateRecommendations(), // 设置 recommendations 字段
    }; // 结束代码块

    this.emit('complete', finalResult); // 调用 emit

    console.log(`[MonteCarlo] 模拟完成，耗时 ${duration.toFixed(2)}s / Simulation completed in ${duration.toFixed(2)}s`); // 控制台输出

    return finalResult; // 返回结果
  } // 结束代码块

  /**
   * 交易重采样模拟
   * Trade Resampling Simulation
   * @private
   */
  async _runTradeResampling(trades, numTrades) { // 执行语句
    const tradeCount = numTrades || trades.length; // 定义常量 tradeCount

    for (let i = 0; i < this.config.numSimulations; i++) { // 循环 let i = 0; i < this.config.numSimulations; i++
      if (!this.isRunning) break; // 条件判断 !this.isRunning

      // 有放回抽样交易
      const sampledTrades = this._sampleWithReplacement(trades, tradeCount); // 定义常量 sampledTrades

      // 计算模拟结果
      const result = this._calculateTradeSimulationResult(sampledTrades); // 定义常量 result
      this.simulations.push(result); // 访问 simulations

      // 进度回调
      if ((i + 1) % this.config.progressInterval === 0) { // 条件判断 (i + 1) % this.config.progressInterval === 0
        this.emit('progress', { // 调用 emit
          current: i + 1, // 设置 current 字段
          total: this.config.numSimulations, // 设置 total 字段
          percent: ((i + 1) / this.config.numSimulations * 100).toFixed(2), // 设置 percent 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 收益率重采样模拟
   * Return Resampling Simulation
   * @private
   */
  async _runReturnResampling(returns) { // 执行语句
    for (let i = 0; i < this.config.numSimulations; i++) { // 循环 let i = 0; i < this.config.numSimulations; i++
      if (!this.isRunning) break; // 条件判断 !this.isRunning

      // 有放回抽样收益率
      const sampledReturns = this._sampleWithReplacement(returns, returns.length); // 定义常量 sampledReturns

      // 计算模拟结果
      const result = this._calculateReturnSimulationResult(sampledReturns); // 定义常量 result
      this.simulations.push(result); // 访问 simulations

      if ((i + 1) % this.config.progressInterval === 0) { // 条件判断 (i + 1) % this.config.progressInterval === 0
        this.emit('progress', { // 调用 emit
          current: i + 1, // 设置 current 字段
          total: this.config.numSimulations, // 设置 total 字段
          percent: ((i + 1) / this.config.numSimulations * 100).toFixed(2), // 设置 percent 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * Bootstrap 模拟
   * Bootstrap Simulation
   * @private
   */
  async _runBootstrap(returns) { // 执行语句
    // Bootstrap 使用块采样保持部分时间序列特性
    const blockSize = Math.max(5, Math.floor(returns.length / 20)); // 定义常量 blockSize

    for (let i = 0; i < this.config.numSimulations; i++) { // 循环 let i = 0; i < this.config.numSimulations; i++
      if (!this.isRunning) break; // 条件判断 !this.isRunning

      // 块采样
      const sampledReturns = this._blockSample(returns, returns.length, blockSize); // 定义常量 sampledReturns

      const result = this._calculateReturnSimulationResult(sampledReturns); // 定义常量 result
      this.simulations.push(result); // 访问 simulations

      if ((i + 1) % this.config.progressInterval === 0) { // 条件判断 (i + 1) % this.config.progressInterval === 0
        this.emit('progress', { // 调用 emit
          current: i + 1, // 设置 current 字段
          total: this.config.numSimulations, // 设置 total 字段
          percent: ((i + 1) / this.config.numSimulations * 100).toFixed(2), // 设置 percent 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 路径依赖模拟（随机打乱交易顺序）
   * Path Dependency Simulation
   * @private
   */
  async _runPathDependency(returns) { // 执行语句
    for (let i = 0; i < this.config.numSimulations; i++) { // 循环 let i = 0; i < this.config.numSimulations; i++
      if (!this.isRunning) break; // 条件判断 !this.isRunning

      // 随机打乱收益率顺序
      const shuffledReturns = this._shuffle([...returns]); // 定义常量 shuffledReturns

      const result = this._calculateReturnSimulationResult(shuffledReturns); // 定义常量 result
      this.simulations.push(result); // 访问 simulations

      if ((i + 1) % this.config.progressInterval === 0) { // 条件判断 (i + 1) % this.config.progressInterval === 0
        this.emit('progress', { // 调用 emit
          current: i + 1, // 设置 current 字段
          total: this.config.numSimulations, // 设置 total 字段
          percent: ((i + 1) / this.config.numSimulations * 100).toFixed(2), // 设置 percent 字段
        }); // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 有放回抽样
   * Sample with replacement
   * @private
   */
  _sampleWithReplacement(arr, size) { // 调用 _sampleWithReplacement
    const result = []; // 定义常量 result
    for (let i = 0; i < size; i++) { // 循环 let i = 0; i < size; i++
      const idx = Math.floor(Math.random() * arr.length); // 定义常量 idx
      result.push(arr[idx]); // 调用 result.push
    } // 结束代码块
    return result; // 返回结果
  } // 结束代码块

  /**
   * 块采样
   * Block sampling
   * @private
   */
  _blockSample(arr, targetSize, blockSize) { // 调用 _blockSample
    const result = []; // 定义常量 result
    while (result.length < targetSize) { // 循环条件 result.length < targetSize
      const startIdx = Math.floor(Math.random() * (arr.length - blockSize + 1)); // 定义常量 startIdx
      for (let i = 0; i < blockSize && result.length < targetSize; i++) { // 循环 let i = 0; i < blockSize && result.length < t...
        result.push(arr[startIdx + i]); // 调用 result.push
      } // 结束代码块
    } // 结束代码块
    return result; // 返回结果
  } // 结束代码块

  /**
   * 数组随机打乱 (Fisher-Yates)
   * Shuffle array
   * @private
   */
  _shuffle(arr) { // 调用 _shuffle
    for (let i = arr.length - 1; i > 0; i--) { // 循环 let i = arr.length - 1; i > 0; i--
      const j = Math.floor(Math.random() * (i + 1)); // 定义常量 j
      [arr[i], arr[j]] = [arr[j], arr[i]]; // 执行语句
    } // 结束代码块
    return arr; // 返回结果
  } // 结束代码块

  /**
   * 从权益曲线提取收益率
   * Extract returns from equity curve
   * @private
   */
  _extractReturns(equityCurve) { // 调用 _extractReturns
    const returns = []; // 定义常量 returns
    for (let i = 1; i < equityCurve.length; i++) { // 循环 let i = 1; i < equityCurve.length; i++
      const prevEquity = equityCurve[i - 1].equity || equityCurve[i - 1]; // 定义常量 prevEquity
      const currEquity = equityCurve[i].equity || equityCurve[i]; // 定义常量 currEquity
      returns.push((currEquity - prevEquity) / prevEquity); // 调用 returns.push
    } // 结束代码块
    return returns; // 返回结果
  } // 结束代码块

  /**
   * 计算交易模拟结果
   * Calculate trade simulation result
   * @private
   */
  _calculateTradeSimulationResult(trades) { // 调用 _calculateTradeSimulationResult
    let capital = this.config.initialCapital; // 定义变量 capital
    let peak = capital; // 定义变量 peak
    let maxDrawdown = 0; // 定义变量 maxDrawdown
    let maxDrawdownPercent = 0; // 定义变量 maxDrawdownPercent

    const equityCurve = [capital]; // 定义常量 equityCurve
    let winCount = 0; // 定义变量 winCount
    let totalPnL = 0; // 定义变量 totalPnL

    for (const trade of trades) { // 循环 const trade of trades
      const pnl = trade.pnl || 0; // 定义常量 pnl
      capital += pnl; // 执行语句
      totalPnL += pnl; // 执行语句

      if (pnl > 0) winCount++; // 条件判断 pnl > 0

      equityCurve.push(capital); // 调用 equityCurve.push

      // 更新峰值和回撤
      if (capital > peak) { // 条件判断 capital > peak
        peak = capital; // 赋值 peak
      } // 结束代码块
      const drawdown = peak - capital; // 定义常量 drawdown
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0; // 定义常量 drawdownPercent
      if (drawdownPercent > maxDrawdownPercent) { // 条件判断 drawdownPercent > maxDrawdownPercent
        maxDrawdown = drawdown; // 赋值 maxDrawdown
        maxDrawdownPercent = drawdownPercent; // 赋值 maxDrawdownPercent
      } // 结束代码块
    } // 结束代码块

    const totalReturn = ((capital - this.config.initialCapital) / this.config.initialCapital) * 100; // 定义常量 totalReturn
    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0; // 定义常量 winRate

    return { // 返回结果
      finalCapital: capital, // 设置 finalCapital 字段
      totalReturn, // 执行语句
      totalPnL, // 执行语句
      maxDrawdown, // 执行语句
      maxDrawdownPercent, // 执行语句
      winRate, // 执行语句
      numTrades: trades.length, // 设置 numTrades 字段
      equityCurve, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算收益率模拟结果
   * Calculate return simulation result
   * @private
   */
  _calculateReturnSimulationResult(returns) { // 调用 _calculateReturnSimulationResult
    let capital = this.config.initialCapital; // 定义变量 capital
    let peak = capital; // 定义变量 peak
    let maxDrawdown = 0; // 定义变量 maxDrawdown
    let maxDrawdownPercent = 0; // 定义变量 maxDrawdownPercent

    const equityCurve = [capital]; // 定义常量 equityCurve

    for (const ret of returns) { // 循环 const ret of returns
      capital *= (1 + ret); // 执行语句
      equityCurve.push(capital); // 调用 equityCurve.push

      if (capital > peak) { // 条件判断 capital > peak
        peak = capital; // 赋值 peak
      } // 结束代码块
      const drawdown = peak - capital; // 定义常量 drawdown
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0; // 定义常量 drawdownPercent
      if (drawdownPercent > maxDrawdownPercent) { // 条件判断 drawdownPercent > maxDrawdownPercent
        maxDrawdown = drawdown; // 赋值 maxDrawdown
        maxDrawdownPercent = drawdownPercent; // 赋值 maxDrawdownPercent
      } // 结束代码块
    } // 结束代码块

    const totalReturn = ((capital - this.config.initialCapital) / this.config.initialCapital) * 100; // 定义常量 totalReturn

    // 计算夏普比率
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length; // 定义函数 avgReturn
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length; // 定义函数 variance
    const stdDev = Math.sqrt(variance); // 定义常量 stdDev
    const sharpeRatio = stdDev > 0 ? (avgReturn * 252) / (stdDev * Math.sqrt(252)) : 0; // 定义常量 sharpeRatio

    return { // 返回结果
      finalCapital: capital, // 设置 finalCapital 字段
      totalReturn, // 执行语句
      maxDrawdown, // 执行语句
      maxDrawdownPercent, // 执行语句
      sharpeRatio, // 执行语句
      equityCurve, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算统计数据
   * Calculate statistics
   * @private
   */
  _calculateStatistics() { // 调用 _calculateStatistics
    if (this.simulations.length === 0) return null; // 条件判断 this.simulations.length === 0

    const returns = this.simulations.map(s => s.totalReturn); // 定义函数 returns
    const drawdowns = this.simulations.map(s => s.maxDrawdownPercent); // 定义函数 drawdowns
    const finalCapitals = this.simulations.map(s => s.finalCapital); // 定义函数 finalCapitals

    return { // 返回结果
      // 收益统计
      return: { // 返回结果
        mean: this._mean(returns), // 设置 mean 字段
        std: this._std(returns), // 设置 std 字段
        min: Math.min(...returns), // 设置 min 字段
        max: Math.max(...returns), // 设置 max 字段
        median: this._median(returns), // 设置 median 字段
        skewness: this._skewness(returns), // 设置 skewness 字段
        kurtosis: this._kurtosis(returns), // 设置 kurtosis 字段
      }, // 结束代码块

      // 最大回撤统计
      maxDrawdown: { // 设置 maxDrawdown 字段
        mean: this._mean(drawdowns), // 设置 mean 字段
        std: this._std(drawdowns), // 设置 std 字段
        min: Math.min(...drawdowns), // 设置 min 字段
        max: Math.max(...drawdowns), // 设置 max 字段
        median: this._median(drawdowns), // 设置 median 字段
      }, // 结束代码块

      // 最终资金统计
      finalCapital: { // 设置 finalCapital 字段
        mean: this._mean(finalCapitals), // 设置 mean 字段
        std: this._std(finalCapitals), // 设置 std 字段
        min: Math.min(...finalCapitals), // 设置 min 字段
        max: Math.max(...finalCapitals), // 设置 max 字段
        median: this._median(finalCapitals), // 设置 median 字段
      }, // 结束代码块

      // 盈利概率
      profitProbability: returns.filter(r => r > 0).length / returns.length, // 设置 profitProbability 字段

      // 亏损概率
      lossProbability: returns.filter(r => r < 0).length / returns.length, // 设置 lossProbability 字段

      // 超过特定收益的概率
      probabilityAbove: { // 设置 probabilityAbove 字段
        '10%': returns.filter(r => r > 10).length / returns.length, // 定义箭头函数
        '20%': returns.filter(r => r > 20).length / returns.length, // 定义箭头函数
        '50%': returns.filter(r => r > 50).length / returns.length, // 定义箭头函数
      }, // 结束代码块

      // 亏损超过特定比例的概率
      probabilityLossAbove: { // 设置 probabilityLossAbove 字段
        '10%': returns.filter(r => r < -10).length / returns.length, // 定义箭头函数
        '20%': returns.filter(r => r < -20).length / returns.length, // 定义箭头函数
        '50%': returns.filter(r => r < -50).length / returns.length, // 定义箭头函数
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算风险指标
   * Calculate risk metrics
   * @private
   */
  _calculateRiskMetrics() { // 调用 _calculateRiskMetrics
    if (this.simulations.length === 0) return null; // 条件判断 this.simulations.length === 0

    const returns = this.simulations.map(s => s.totalReturn).sort((a, b) => a - b); // 定义函数 returns
    const drawdowns = this.simulations.map(s => s.maxDrawdownPercent).sort((a, b) => a - b); // 定义函数 drawdowns

    const metrics = {}; // 定义常量 metrics

    // VaR (Value at Risk)
    if (this.config.calculateVaR) { // 条件判断 this.config.calculateVaR
      metrics.VaR = {}; // 赋值 metrics.VaR
      for (const level of this.config.confidenceLevels) { // 循环 const level of this.config.confidenceLevels
        const idx = Math.floor(returns.length * (1 - level)); // 定义常量 idx
        metrics.VaR[`${level * 100}%`] = returns[idx]; // 执行语句
      } // 结束代码块
    } // 结束代码块

    // CVaR (Conditional VaR / Expected Shortfall)
    if (this.config.calculateCVaR) { // 条件判断 this.config.calculateCVaR
      metrics.CVaR = {}; // 赋值 metrics.CVaR
      for (const level of this.config.confidenceLevels) { // 循环 const level of this.config.confidenceLevels
        const idx = Math.floor(returns.length * (1 - level)); // 定义常量 idx
        const tailReturns = returns.slice(0, idx + 1); // 定义常量 tailReturns
        metrics.CVaR[`${level * 100}%`] = this._mean(tailReturns); // 执行语句
      } // 结束代码块
    } // 结束代码块

    // 最大预期回撤
    metrics.expectedMaxDrawdown = { // 赋值 metrics.expectedMaxDrawdown
      mean: this._mean(drawdowns), // 设置 mean 字段
      worst: drawdowns[drawdowns.length - 1], // 设置 worst 字段
    }; // 结束代码块

    for (const level of this.config.confidenceLevels) { // 循环 const level of this.config.confidenceLevels
      const idx = Math.floor(drawdowns.length * level); // 定义常量 idx
      metrics.expectedMaxDrawdown[`${level * 100}%`] = drawdowns[idx]; // 执行语句
    } // 结束代码块

    return metrics; // 返回结果
  } // 结束代码块

  /**
   * 计算置信区间
   * Calculate confidence intervals
   * @private
   */
  _calculateConfidenceIntervals() { // 调用 _calculateConfidenceIntervals
    if (this.simulations.length === 0) return null; // 条件判断 this.simulations.length === 0

    const returns = this.simulations.map(s => s.totalReturn).sort((a, b) => a - b); // 定义函数 returns

    const intervals = {}; // 定义常量 intervals

    for (const level of this.config.confidenceLevels) { // 循环 const level of this.config.confidenceLevels
      const alpha = (1 - level) / 2; // 定义常量 alpha
      const lowerIdx = Math.floor(returns.length * alpha); // 定义常量 lowerIdx
      const upperIdx = Math.floor(returns.length * (1 - alpha)); // 定义常量 upperIdx

      intervals[`${level * 100}%`] = { // 执行语句
        lower: returns[lowerIdx], // 设置 lower 字段
        upper: returns[upperIdx], // 设置 upper 字段
        range: returns[upperIdx] - returns[lowerIdx], // 设置 range 字段
      }; // 结束代码块
    } // 结束代码块

    return intervals; // 返回结果
  } // 结束代码块

  /**
   * 获取分布数据（用于直方图）
   * Get distribution data for histogram
   * @private
   */
  _getDistribution() { // 调用 _getDistribution
    if (this.simulations.length === 0) return null; // 条件判断 this.simulations.length === 0

    const returns = this.simulations.map(s => s.totalReturn); // 定义函数 returns
    const min = Math.min(...returns); // 定义常量 min
    const max = Math.max(...returns); // 定义常量 max
    const binCount = 50; // 定义常量 binCount
    const binWidth = (max - min) / binCount; // 定义常量 binWidth

    const histogram = new Array(binCount).fill(0); // 定义常量 histogram

    for (const ret of returns) { // 循环 const ret of returns
      const binIdx = Math.min(binCount - 1, Math.floor((ret - min) / binWidth)); // 定义常量 binIdx
      histogram[binIdx]++; // 执行语句
    } // 结束代码块

    const bins = []; // 定义常量 bins
    for (let i = 0; i < binCount; i++) { // 循环 let i = 0; i < binCount; i++
      bins.push({ // 调用 bins.push
        binStart: min + i * binWidth, // 设置 binStart 字段
        binEnd: min + (i + 1) * binWidth, // 设置 binEnd 字段
        count: histogram[i], // 设置 count 字段
        frequency: histogram[i] / returns.length, // 设置 frequency 字段
      }); // 结束代码块
    } // 结束代码块

    return { // 返回结果
      bins, // 执行语句
      min, // 执行语句
      max, // 执行语句
      binWidth, // 执行语句
      totalCount: returns.length, // 设置 totalCount 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 生成建议
   * Generate recommendations
   * @private
   */
  _generateRecommendations() { // 调用 _generateRecommendations
    const recommendations = []; // 定义常量 recommendations

    if (!this.statistics) { // 条件判断 !this.statistics
      recommendations.push({ // 调用 recommendations.push
        level: 'error', // 设置 level 字段
        message: '没有有效的模拟结果 / No valid simulation results', // 设置 message 字段
      }); // 结束代码块
      return recommendations; // 返回结果
    } // 结束代码块

    const stats = this.statistics; // 定义常量 stats

    // 检查盈利概率
    if (stats.profitProbability < 0.5) { // 条件判断 stats.profitProbability < 0.5
      recommendations.push({ // 调用 recommendations.push
        level: 'warning', // 设置 level 字段
        message: `盈利概率较低 (${(stats.profitProbability * 100).toFixed(1)}%)，策略风险较高 / Low profit probability`, // 设置 message 字段
      }); // 结束代码块
    } else if (stats.profitProbability > 0.7) { // 执行语句
      recommendations.push({ // 调用 recommendations.push
        level: 'success', // 设置 level 字段
        message: `盈利概率较高 (${(stats.profitProbability * 100).toFixed(1)}%)，策略相对稳定 / High profit probability`, // 设置 message 字段
      }); // 结束代码块
    } // 结束代码块

    // 检查收益分布偏度
    if (stats.return.skewness < -0.5) { // 条件判断 stats.return.skewness < -0.5
      recommendations.push({ // 调用 recommendations.push
        level: 'warning', // 设置 level 字段
        message: '收益分布左偏，存在较大亏损风险 / Left-skewed return distribution', // 设置 message 字段
      }); // 结束代码块
    } else if (stats.return.skewness > 0.5) { // 执行语句
      recommendations.push({ // 调用 recommendations.push
        level: 'info', // 设置 level 字段
        message: '收益分布右偏，有较大盈利潜力 / Right-skewed return distribution', // 设置 message 字段
      }); // 结束代码块
    } // 结束代码块

    // 检查尾部风险
    if (stats.probabilityLossAbove['20%'] > 0.1) { // 条件判断 stats.probabilityLossAbove['20%'] > 0.1
      recommendations.push({ // 调用 recommendations.push
        level: 'warning', // 设置 level 字段
        message: `超过 ${(stats.probabilityLossAbove['20%'] * 100).toFixed(1)}% 的情况亏损超过 20%，建议加强风控 / High tail risk`, // 设置 message 字段
      }); // 结束代码块
    } // 结束代码块

    // 检查回撤
    if (stats.maxDrawdown.mean > 20) { // 条件判断 stats.maxDrawdown.mean > 20
      recommendations.push({ // 调用 recommendations.push
        level: 'warning', // 设置 level 字段
        message: `平均最大回撤 ${stats.maxDrawdown.mean.toFixed(1)}% 较高，建议优化仓位管理 / High average max drawdown`, // 设置 message 字段
      }); // 结束代码块
    } // 结束代码块

    return recommendations; // 返回结果
  } // 结束代码块

  /**
   * 统计辅助函数
   */
  _mean(arr) { // 调用 _mean
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; // 返回结果
  } // 结束代码块

  _std(arr) { // 调用 _std
    if (arr.length < 2) return 0; // 条件判断 arr.length < 2
    const mean = this._mean(arr); // 定义常量 mean
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length; // 定义函数 variance
    return Math.sqrt(variance); // 返回结果
  } // 结束代码块

  _median(arr) { // 调用 _median
    if (arr.length === 0) return 0; // 条件判断 arr.length === 0
    const sorted = [...arr].sort((a, b) => a - b); // 定义函数 sorted
    const mid = Math.floor(sorted.length / 2); // 定义常量 mid
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; // 返回结果
  } // 结束代码块

  _skewness(arr) { // 调用 _skewness
    if (arr.length < 3) return 0; // 条件判断 arr.length < 3
    const mean = this._mean(arr); // 定义常量 mean
    const std = this._std(arr); // 定义常量 std
    if (std === 0) return 0; // 条件判断 std === 0

    const n = arr.length; // 定义常量 n
    const sum = arr.reduce((acc, val) => acc + Math.pow((val - mean) / std, 3), 0); // 定义函数 sum
    return (n / ((n - 1) * (n - 2))) * sum; // 返回结果
  } // 结束代码块

  _kurtosis(arr) { // 调用 _kurtosis
    if (arr.length < 4) return 0; // 条件判断 arr.length < 4
    const mean = this._mean(arr); // 定义常量 mean
    const std = this._std(arr); // 定义常量 std
    if (std === 0) return 0; // 条件判断 std === 0

    const n = arr.length; // 定义常量 n
    const sum = arr.reduce((acc, val) => acc + Math.pow((val - mean) / std, 4), 0); // 定义函数 sum
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - // 返回结果
           (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3)); // 执行语句
  } // 结束代码块

  /**
   * 获取模拟结果
   * Get simulation results
   */
  getSimulations() { // 调用 getSimulations
    return [...this.simulations]; // 返回结果
  } // 结束代码块

  /**
   * 获取统计数据
   * Get statistics
   */
  getStatistics() { // 调用 getStatistics
    return this.statistics; // 返回结果
  } // 结束代码块

  /**
   * 停止模拟
   * Stop simulation
   */
  stop() { // 调用 stop
    this.isRunning = false; // 设置 isRunning
    this.emit('stopped'); // 调用 emit
  } // 结束代码块
} // 结束代码块

export default MonteCarloSimulation; // 默认导出
