/**
 * 蒙特卡洛模拟
 * Monte Carlo Simulation
 *
 * 通过随机抽样模拟策略的潜在结果分布，评估风险和不确定性
 * Simulates potential outcome distributions through random sampling to assess risk and uncertainty
 *
 * @module src/optimization/MonteCarloSimulation
 */

import EventEmitter from 'eventemitter3';

/**
 * 模拟类型
 * Simulation Type
 */
export const SimulationType = {
  TRADE_RESAMPLING: 'trade_resampling',     // 交易重采样
  RETURN_RESAMPLING: 'return_resampling',   // 收益率重采样
  BOOTSTRAP: 'bootstrap',                    // Bootstrap 方法
  PATH_DEPENDENCY: 'path_dependency',        // 路径依赖模拟
};

/**
 * 默认配置
 * Default Configuration
 */
export const DEFAULT_MC_CONFIG = {
  // 模拟次数
  numSimulations: 1000,

  // 模拟类型
  type: SimulationType.TRADE_RESAMPLING,

  // 是否使用有放回抽样
  withReplacement: true,

  // 置信区间
  confidenceLevels: [0.95, 0.99],

  // 风险指标计算
  calculateVaR: true,
  calculateCVaR: true,

  // 初始资金
  initialCapital: 10000,

  // 进度回调间隔
  progressInterval: 100,
};

/**
 * 蒙特卡洛模拟类
 * Monte Carlo Simulation Class
 */
export class MonteCarloSimulation extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 配置
   */
  constructor(config = {}) {
    super();

    this.config = { ...DEFAULT_MC_CONFIG, ...config };
    this.simulations = [];
    this.statistics = null;
    this.isRunning = false;
  }

  /**
   * 运行蒙特卡洛模拟
   * Run Monte Carlo Simulation
   * @param {Object} options - 模拟选项
   * @returns {Promise<Object>} 模拟结果
   */
  async run(options) {
    const {
      trades = null,           // 交易记录数组
      returns = null,          // 收益率序列
      equityCurve = null,      // 权益曲线
      numTrades = null,        // 每次模拟的交易数量（可选）
    } = options;

    // 验证输入
    if (!trades && !returns && !equityCurve) {
      throw new Error('必须提供 trades、returns 或 equityCurve 中的至少一个 / At least one of trades, returns, or equityCurve required');
    }

    this.simulations = [];
    this.isRunning = true;

    const startTime = Date.now();

    this.emit('start', { numSimulations: this.config.numSimulations });

    console.log(`[MonteCarlo] 开始模拟，共 ${this.config.numSimulations} 次 / Starting ${this.config.numSimulations} simulations`);

    // 根据模拟类型选择方法
    const type = this.config.type;

    if (type === SimulationType.TRADE_RESAMPLING && trades) {
      await this._runTradeResampling(trades, numTrades);
    } else if (type === SimulationType.RETURN_RESAMPLING && returns) {
      await this._runReturnResampling(returns);
    } else if (type === SimulationType.BOOTSTRAP && (returns || equityCurve)) {
      await this._runBootstrap(returns || this._extractReturns(equityCurve));
    } else if (type === SimulationType.PATH_DEPENDENCY && (returns || equityCurve)) {
      await this._runPathDependency(returns || this._extractReturns(equityCurve));
    } else {
      // 自动选择最合适的方法
      if (trades && trades.length > 0) {
        await this._runTradeResampling(trades, numTrades);
      } else if (returns && returns.length > 0) {
        await this._runReturnResampling(returns);
      } else if (equityCurve && equityCurve.length > 0) {
        await this._runBootstrap(this._extractReturns(equityCurve));
      }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // 计算统计数据
    this.statistics = this._calculateStatistics();

    this.isRunning = false;

    // 构建最终结果
    const finalResult = {
      type: this.config.type,
      numSimulations: this.config.numSimulations,
      duration,
      statistics: this.statistics,
      distribution: this._getDistribution(),
      riskMetrics: this._calculateRiskMetrics(),
      confidenceIntervals: this._calculateConfidenceIntervals(),
      recommendations: this._generateRecommendations(),
    };

    this.emit('complete', finalResult);

    console.log(`[MonteCarlo] 模拟完成，耗时 ${duration.toFixed(2)}s / Simulation completed in ${duration.toFixed(2)}s`);

    return finalResult;
  }

  /**
   * 交易重采样模拟
   * Trade Resampling Simulation
   * @private
   */
  async _runTradeResampling(trades, numTrades) {
    const tradeCount = numTrades || trades.length;

    for (let i = 0; i < this.config.numSimulations; i++) {
      if (!this.isRunning) break;

      // 有放回抽样交易
      const sampledTrades = this._sampleWithReplacement(trades, tradeCount);

      // 计算模拟结果
      const result = this._calculateTradeSimulationResult(sampledTrades);
      this.simulations.push(result);

      // 进度回调
      if ((i + 1) % this.config.progressInterval === 0) {
        this.emit('progress', {
          current: i + 1,
          total: this.config.numSimulations,
          percent: ((i + 1) / this.config.numSimulations * 100).toFixed(2),
        });
      }
    }
  }

  /**
   * 收益率重采样模拟
   * Return Resampling Simulation
   * @private
   */
  async _runReturnResampling(returns) {
    for (let i = 0; i < this.config.numSimulations; i++) {
      if (!this.isRunning) break;

      // 有放回抽样收益率
      const sampledReturns = this._sampleWithReplacement(returns, returns.length);

      // 计算模拟结果
      const result = this._calculateReturnSimulationResult(sampledReturns);
      this.simulations.push(result);

      if ((i + 1) % this.config.progressInterval === 0) {
        this.emit('progress', {
          current: i + 1,
          total: this.config.numSimulations,
          percent: ((i + 1) / this.config.numSimulations * 100).toFixed(2),
        });
      }
    }
  }

  /**
   * Bootstrap 模拟
   * Bootstrap Simulation
   * @private
   */
  async _runBootstrap(returns) {
    // Bootstrap 使用块采样保持部分时间序列特性
    const blockSize = Math.max(5, Math.floor(returns.length / 20));

    for (let i = 0; i < this.config.numSimulations; i++) {
      if (!this.isRunning) break;

      // 块采样
      const sampledReturns = this._blockSample(returns, returns.length, blockSize);

      const result = this._calculateReturnSimulationResult(sampledReturns);
      this.simulations.push(result);

      if ((i + 1) % this.config.progressInterval === 0) {
        this.emit('progress', {
          current: i + 1,
          total: this.config.numSimulations,
          percent: ((i + 1) / this.config.numSimulations * 100).toFixed(2),
        });
      }
    }
  }

  /**
   * 路径依赖模拟（随机打乱交易顺序）
   * Path Dependency Simulation
   * @private
   */
  async _runPathDependency(returns) {
    for (let i = 0; i < this.config.numSimulations; i++) {
      if (!this.isRunning) break;

      // 随机打乱收益率顺序
      const shuffledReturns = this._shuffle([...returns]);

      const result = this._calculateReturnSimulationResult(shuffledReturns);
      this.simulations.push(result);

      if ((i + 1) % this.config.progressInterval === 0) {
        this.emit('progress', {
          current: i + 1,
          total: this.config.numSimulations,
          percent: ((i + 1) / this.config.numSimulations * 100).toFixed(2),
        });
      }
    }
  }

  /**
   * 有放回抽样
   * Sample with replacement
   * @private
   */
  _sampleWithReplacement(arr, size) {
    const result = [];
    for (let i = 0; i < size; i++) {
      const idx = Math.floor(Math.random() * arr.length);
      result.push(arr[idx]);
    }
    return result;
  }

  /**
   * 块采样
   * Block sampling
   * @private
   */
  _blockSample(arr, targetSize, blockSize) {
    const result = [];
    while (result.length < targetSize) {
      const startIdx = Math.floor(Math.random() * (arr.length - blockSize + 1));
      for (let i = 0; i < blockSize && result.length < targetSize; i++) {
        result.push(arr[startIdx + i]);
      }
    }
    return result;
  }

  /**
   * 数组随机打乱 (Fisher-Yates)
   * Shuffle array
   * @private
   */
  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * 从权益曲线提取收益率
   * Extract returns from equity curve
   * @private
   */
  _extractReturns(equityCurve) {
    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prevEquity = equityCurve[i - 1].equity || equityCurve[i - 1];
      const currEquity = equityCurve[i].equity || equityCurve[i];
      returns.push((currEquity - prevEquity) / prevEquity);
    }
    return returns;
  }

  /**
   * 计算交易模拟结果
   * Calculate trade simulation result
   * @private
   */
  _calculateTradeSimulationResult(trades) {
    let capital = this.config.initialCapital;
    let peak = capital;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    const equityCurve = [capital];
    let winCount = 0;
    let totalPnL = 0;

    for (const trade of trades) {
      const pnl = trade.pnl || 0;
      capital += pnl;
      totalPnL += pnl;

      if (pnl > 0) winCount++;

      equityCurve.push(capital);

      // 更新峰值和回撤
      if (capital > peak) {
        peak = capital;
      }
      const drawdown = peak - capital;
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
      if (drawdownPercent > maxDrawdownPercent) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    const totalReturn = ((capital - this.config.initialCapital) / this.config.initialCapital) * 100;
    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;

    return {
      finalCapital: capital,
      totalReturn,
      totalPnL,
      maxDrawdown,
      maxDrawdownPercent,
      winRate,
      numTrades: trades.length,
      equityCurve,
    };
  }

  /**
   * 计算收益率模拟结果
   * Calculate return simulation result
   * @private
   */
  _calculateReturnSimulationResult(returns) {
    let capital = this.config.initialCapital;
    let peak = capital;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    const equityCurve = [capital];

    for (const ret of returns) {
      capital *= (1 + ret);
      equityCurve.push(capital);

      if (capital > peak) {
        peak = capital;
      }
      const drawdown = peak - capital;
      const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
      if (drawdownPercent > maxDrawdownPercent) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    const totalReturn = ((capital - this.config.initialCapital) / this.config.initialCapital) * 100;

    // 计算夏普比率
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn * 252) / (stdDev * Math.sqrt(252)) : 0;

    return {
      finalCapital: capital,
      totalReturn,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      equityCurve,
    };
  }

  /**
   * 计算统计数据
   * Calculate statistics
   * @private
   */
  _calculateStatistics() {
    if (this.simulations.length === 0) return null;

    const returns = this.simulations.map(s => s.totalReturn);
    const drawdowns = this.simulations.map(s => s.maxDrawdownPercent);
    const finalCapitals = this.simulations.map(s => s.finalCapital);

    return {
      // 收益统计
      return: {
        mean: this._mean(returns),
        std: this._std(returns),
        min: Math.min(...returns),
        max: Math.max(...returns),
        median: this._median(returns),
        skewness: this._skewness(returns),
        kurtosis: this._kurtosis(returns),
      },

      // 最大回撤统计
      maxDrawdown: {
        mean: this._mean(drawdowns),
        std: this._std(drawdowns),
        min: Math.min(...drawdowns),
        max: Math.max(...drawdowns),
        median: this._median(drawdowns),
      },

      // 最终资金统计
      finalCapital: {
        mean: this._mean(finalCapitals),
        std: this._std(finalCapitals),
        min: Math.min(...finalCapitals),
        max: Math.max(...finalCapitals),
        median: this._median(finalCapitals),
      },

      // 盈利概率
      profitProbability: returns.filter(r => r > 0).length / returns.length,

      // 亏损概率
      lossProbability: returns.filter(r => r < 0).length / returns.length,

      // 超过特定收益的概率
      probabilityAbove: {
        '10%': returns.filter(r => r > 10).length / returns.length,
        '20%': returns.filter(r => r > 20).length / returns.length,
        '50%': returns.filter(r => r > 50).length / returns.length,
      },

      // 亏损超过特定比例的概率
      probabilityLossAbove: {
        '10%': returns.filter(r => r < -10).length / returns.length,
        '20%': returns.filter(r => r < -20).length / returns.length,
        '50%': returns.filter(r => r < -50).length / returns.length,
      },
    };
  }

  /**
   * 计算风险指标
   * Calculate risk metrics
   * @private
   */
  _calculateRiskMetrics() {
    if (this.simulations.length === 0) return null;

    const returns = this.simulations.map(s => s.totalReturn).sort((a, b) => a - b);
    const drawdowns = this.simulations.map(s => s.maxDrawdownPercent).sort((a, b) => a - b);

    const metrics = {};

    // VaR (Value at Risk)
    if (this.config.calculateVaR) {
      metrics.VaR = {};
      for (const level of this.config.confidenceLevels) {
        const idx = Math.floor(returns.length * (1 - level));
        metrics.VaR[`${level * 100}%`] = returns[idx];
      }
    }

    // CVaR (Conditional VaR / Expected Shortfall)
    if (this.config.calculateCVaR) {
      metrics.CVaR = {};
      for (const level of this.config.confidenceLevels) {
        const idx = Math.floor(returns.length * (1 - level));
        const tailReturns = returns.slice(0, idx + 1);
        metrics.CVaR[`${level * 100}%`] = this._mean(tailReturns);
      }
    }

    // 最大预期回撤
    metrics.expectedMaxDrawdown = {
      mean: this._mean(drawdowns),
      worst: drawdowns[drawdowns.length - 1],
    };

    for (const level of this.config.confidenceLevels) {
      const idx = Math.floor(drawdowns.length * level);
      metrics.expectedMaxDrawdown[`${level * 100}%`] = drawdowns[idx];
    }

    return metrics;
  }

  /**
   * 计算置信区间
   * Calculate confidence intervals
   * @private
   */
  _calculateConfidenceIntervals() {
    if (this.simulations.length === 0) return null;

    const returns = this.simulations.map(s => s.totalReturn).sort((a, b) => a - b);

    const intervals = {};

    for (const level of this.config.confidenceLevels) {
      const alpha = (1 - level) / 2;
      const lowerIdx = Math.floor(returns.length * alpha);
      const upperIdx = Math.floor(returns.length * (1 - alpha));

      intervals[`${level * 100}%`] = {
        lower: returns[lowerIdx],
        upper: returns[upperIdx],
        range: returns[upperIdx] - returns[lowerIdx],
      };
    }

    return intervals;
  }

  /**
   * 获取分布数据（用于直方图）
   * Get distribution data for histogram
   * @private
   */
  _getDistribution() {
    if (this.simulations.length === 0) return null;

    const returns = this.simulations.map(s => s.totalReturn);
    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const binCount = 50;
    const binWidth = (max - min) / binCount;

    const histogram = new Array(binCount).fill(0);

    for (const ret of returns) {
      const binIdx = Math.min(binCount - 1, Math.floor((ret - min) / binWidth));
      histogram[binIdx]++;
    }

    const bins = [];
    for (let i = 0; i < binCount; i++) {
      bins.push({
        binStart: min + i * binWidth,
        binEnd: min + (i + 1) * binWidth,
        count: histogram[i],
        frequency: histogram[i] / returns.length,
      });
    }

    return {
      bins,
      min,
      max,
      binWidth,
      totalCount: returns.length,
    };
  }

  /**
   * 生成建议
   * Generate recommendations
   * @private
   */
  _generateRecommendations() {
    const recommendations = [];

    if (!this.statistics) {
      recommendations.push({
        level: 'error',
        message: '没有有效的模拟结果 / No valid simulation results',
      });
      return recommendations;
    }

    const stats = this.statistics;

    // 检查盈利概率
    if (stats.profitProbability < 0.5) {
      recommendations.push({
        level: 'warning',
        message: `盈利概率较低 (${(stats.profitProbability * 100).toFixed(1)}%)，策略风险较高 / Low profit probability`,
      });
    } else if (stats.profitProbability > 0.7) {
      recommendations.push({
        level: 'success',
        message: `盈利概率较高 (${(stats.profitProbability * 100).toFixed(1)}%)，策略相对稳定 / High profit probability`,
      });
    }

    // 检查收益分布偏度
    if (stats.return.skewness < -0.5) {
      recommendations.push({
        level: 'warning',
        message: '收益分布左偏，存在较大亏损风险 / Left-skewed return distribution',
      });
    } else if (stats.return.skewness > 0.5) {
      recommendations.push({
        level: 'info',
        message: '收益分布右偏，有较大盈利潜力 / Right-skewed return distribution',
      });
    }

    // 检查尾部风险
    if (stats.probabilityLossAbove['20%'] > 0.1) {
      recommendations.push({
        level: 'warning',
        message: `超过 ${(stats.probabilityLossAbove['20%'] * 100).toFixed(1)}% 的情况亏损超过 20%，建议加强风控 / High tail risk`,
      });
    }

    // 检查回撤
    if (stats.maxDrawdown.mean > 20) {
      recommendations.push({
        level: 'warning',
        message: `平均最大回撤 ${stats.maxDrawdown.mean.toFixed(1)}% 较高，建议优化仓位管理 / High average max drawdown`,
      });
    }

    return recommendations;
  }

  /**
   * 统计辅助函数
   */
  _mean(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  _std(arr) {
    if (arr.length < 2) return 0;
    const mean = this._mean(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  _median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  _skewness(arr) {
    if (arr.length < 3) return 0;
    const mean = this._mean(arr);
    const std = this._std(arr);
    if (std === 0) return 0;

    const n = arr.length;
    const sum = arr.reduce((acc, val) => acc + Math.pow((val - mean) / std, 3), 0);
    return (n / ((n - 1) * (n - 2))) * sum;
  }

  _kurtosis(arr) {
    if (arr.length < 4) return 0;
    const mean = this._mean(arr);
    const std = this._std(arr);
    if (std === 0) return 0;

    const n = arr.length;
    const sum = arr.reduce((acc, val) => acc + Math.pow((val - mean) / std, 4), 0);
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum -
           (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
  }

  /**
   * 获取模拟结果
   * Get simulation results
   */
  getSimulations() {
    return [...this.simulations];
  }

  /**
   * 获取统计数据
   * Get statistics
   */
  getStatistics() {
    return this.statistics;
  }

  /**
   * 停止模拟
   * Stop simulation
   */
  stop() {
    this.isRunning = false;
    this.emit('stopped');
  }
}

export default MonteCarloSimulation;
