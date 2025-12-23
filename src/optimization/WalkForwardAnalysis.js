/**
 * Walk-Forward 分析
 * Walk-Forward Analysis
 *
 * 滚动优化验证方法，避免过拟合，评估策略的稳健性
 * Rolling optimization validation method to avoid overfitting and assess strategy robustness
 *
 * @module src/optimization/WalkForwardAnalysis
 */

import EventEmitter from 'eventemitter3';
import { BacktestEngine } from '../backtest/BacktestEngine.js';
import { GridSearch, OptimizationTarget } from './GridSearch.js';

/**
 * Walk-Forward 类型
 * Walk-Forward Type
 */
export const WalkForwardType = {
  ANCHORED: 'anchored',     // 锚定式：训练窗口从起点开始，不断扩展
  ROLLING: 'rolling',       // 滚动式：训练窗口固定大小，不断向前滚动
  EXPANDING: 'expanding',   // 扩展式：训练窗口不断扩展，测试窗口固定
};

/**
 * 默认配置
 * Default Configuration
 */
export const DEFAULT_WF_CONFIG = {
  // Walk-Forward 类型
  type: WalkForwardType.ROLLING,

  // 训练窗口大小（K线数量或百分比）
  trainingWindow: 0.6,  // 60%

  // 测试窗口大小
  testWindow: 0.2,      // 20%

  // 滚动步长（测试窗口数量）
  stepSize: 1,

  // 最小训练样本数
  minTrainingSamples: 100,

  // 优化目标
  optimizationTarget: OptimizationTarget.SHARPE_RATIO,

  // 回测配置
  backtestConfig: {
    initialCapital: 10000,
    commissionRate: 0.001,
    slippage: 0.0005,
  },

  // 网格搜索配置
  gridSearchConfig: {
    minTrades: 3,
    recordAllResults: false,
  },
};

/**
 * Walk-Forward 分析类
 * Walk-Forward Analysis Class
 */
export class WalkForwardAnalysis extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 配置
   */
  constructor(config = {}) {
    super();

    this.config = { ...DEFAULT_WF_CONFIG, ...config };
    this.windows = [];
    this.results = [];
    this.aggregatedStats = null;
    this.isRunning = false;
  }

  /**
   * 生成 Walk-Forward 窗口
   * Generate Walk-Forward windows
   * @param {Array} data - 历史数据
   * @returns {Array} 窗口定义数组
   */
  generateWindows(data) {
    const totalLength = data.length;
    const windows = [];

    // 计算窗口大小
    let trainSize, testSize;

    if (this.config.trainingWindow < 1) {
      // 百分比模式
      trainSize = Math.floor(totalLength * this.config.trainingWindow);
      testSize = Math.floor(totalLength * this.config.testWindow);
    } else {
      // 绝对数量模式
      trainSize = this.config.trainingWindow;
      testSize = this.config.testWindow;
    }

    // 验证窗口大小
    if (trainSize < this.config.minTrainingSamples) {
      throw new Error(`训练窗口太小: ${trainSize} < ${this.config.minTrainingSamples}`);
    }

    const type = this.config.type;
    let trainStart = 0;
    let trainEnd = trainSize;
    let testStart = trainEnd;
    let testEnd = testStart + testSize;
    let windowIndex = 0;

    while (testEnd <= totalLength) {
      windows.push({
        index: windowIndex,
        trainStart,
        trainEnd,
        testStart,
        testEnd,
        trainData: data.slice(trainStart, trainEnd),
        testData: data.slice(testStart, testEnd),
      });

      windowIndex++;

      // 根据类型更新窗口位置
      if (type === WalkForwardType.ROLLING) {
        // 滚动式：训练和测试窗口都向前移动
        trainStart += testSize * this.config.stepSize;
        trainEnd = trainStart + trainSize;
        testStart = trainEnd;
        testEnd = testStart + testSize;
      } else if (type === WalkForwardType.ANCHORED) {
        // 锚定式：训练窗口从起点开始扩展
        trainEnd += testSize * this.config.stepSize;
        testStart = trainEnd;
        testEnd = testStart + testSize;
      } else if (type === WalkForwardType.EXPANDING) {
        // 扩展式：训练窗口扩展，包含之前的测试数据
        trainEnd = testEnd;
        testStart = trainEnd;
        testEnd = testStart + testSize;
      }
    }

    console.log(`[WalkForward] 生成 ${windows.length} 个窗口 / Generated ${windows.length} windows`);

    return windows;
  }

  /**
   * 运行 Walk-Forward 分析
   * Run Walk-Forward Analysis
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 分析结果
   */
  async run(options) {
    const {
      data,                    // 历史数据
      strategyClass,           // 策略类
      parameterSpace,          // 参数空间
      fixedParams = {},        // 固定参数
    } = options;

    // 验证输入
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('必须提供有效的历史数据 / Valid historical data required');
    }

    // 生成窗口
    this.windows = this.generateWindows(data);

    if (this.windows.length === 0) {
      throw new Error('无法生成有效的 Walk-Forward 窗口 / Cannot generate valid windows');
    }

    this.results = [];
    this.isRunning = true;

    this.emit('start', { totalWindows: this.windows.length });

    const startTime = Date.now();

    // 遍历每个窗口
    for (let i = 0; i < this.windows.length; i++) {
      const window = this.windows[i];

      console.log(`[WalkForward] 处理窗口 ${i + 1}/${this.windows.length} / Processing window ${i + 1}/${this.windows.length}`);

      try {
        // 1. 在训练数据上优化参数
        const gridSearch = new GridSearch({
          ...this.config.gridSearchConfig,
          target: this.config.optimizationTarget,
          backtestConfig: this.config.backtestConfig,
        });

        const optimizationResult = await gridSearch.run({
          data: window.trainData,
          strategyClass,
          parameterSpace,
          fixedParams,
        });

        const bestParams = optimizationResult.bestParams;

        if (!bestParams) {
          console.warn(`[WalkForward] 窗口 ${i} 优化失败，跳过 / Window ${i} optimization failed, skipping`);
          continue;
        }

        // 2. 使用最优参数在测试数据上回测
        const strategy = new strategyClass({ ...fixedParams, ...bestParams });
        const engine = new BacktestEngine(this.config.backtestConfig);
        engine.loadData([...window.testData]);
        engine.setStrategy(strategy);

        const testStats = await engine.run();

        // 3. 记录结果
        const windowResult = {
          windowIndex: i,
          trainPeriod: {
            start: window.trainData[0].timestamp,
            end: window.trainData[window.trainData.length - 1].timestamp,
            samples: window.trainData.length,
          },
          testPeriod: {
            start: window.testData[0].timestamp,
            end: window.testData[window.testData.length - 1].timestamp,
            samples: window.testData.length,
          },
          optimizedParams: bestParams,
          trainStats: optimizationResult.bestStats,
          testStats,
          // 计算训练/测试性能比率
          performanceRatio: this._calculatePerformanceRatio(
            optimizationResult.bestStats,
            testStats
          ),
        };

        this.results.push(windowResult);

        this.emit('windowComplete', {
          windowIndex: i,
          result: windowResult,
          progress: ((i + 1) / this.windows.length * 100).toFixed(2),
        });

      } catch (error) {
        console.error(`[WalkForward] 窗口 ${i} 处理失败 / Window ${i} processing failed:`, error.message);
        this.emit('error', { windowIndex: i, error });
      }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // 计算聚合统计
    this.aggregatedStats = this._calculateAggregatedStats();

    this.isRunning = false;

    // 构建最终结果
    const finalResult = {
      type: this.config.type,
      totalWindows: this.windows.length,
      validWindows: this.results.length,
      duration,
      windowResults: this.results,
      aggregatedStats: this.aggregatedStats,
      robustnessScore: this._calculateRobustnessScore(),
      recommendations: this._generateRecommendations(),
    };

    this.emit('complete', finalResult);

    console.log(`[WalkForward] 分析完成，耗时 ${duration.toFixed(2)}s / Analysis completed in ${duration.toFixed(2)}s`);

    return finalResult;
  }

  /**
   * 计算训练/测试性能比率
   * Calculate training/test performance ratio
   * @private
   */
  _calculatePerformanceRatio(trainStats, testStats) {
    if (!trainStats || !testStats) return null;

    return {
      returnRatio: trainStats.totalReturn !== 0
        ? testStats.totalReturn / trainStats.totalReturn
        : 0,
      sharpeRatio: trainStats.sharpeRatio !== 0
        ? testStats.sharpeRatio / trainStats.sharpeRatio
        : 0,
      winRateRatio: trainStats.winRate !== 0
        ? testStats.winRate / trainStats.winRate
        : 0,
    };
  }

  /**
   * 计算聚合统计
   * Calculate aggregated statistics
   * @private
   */
  _calculateAggregatedStats() {
    if (this.results.length === 0) return null;

    const testReturns = this.results.map(r => r.testStats.totalReturn);
    const testSharpes = this.results.map(r => r.testStats.sharpeRatio);
    const testDrawdowns = this.results.map(r => r.testStats.maxDrawdownPercent);
    const testWinRates = this.results.map(r => r.testStats.winRate);
    const performanceRatios = this.results
      .filter(r => r.performanceRatio)
      .map(r => r.performanceRatio.returnRatio);

    return {
      // 测试期收益统计
      testReturn: {
        mean: this._mean(testReturns),
        std: this._std(testReturns),
        min: Math.min(...testReturns),
        max: Math.max(...testReturns),
        median: this._median(testReturns),
      },

      // 测试期夏普比率统计
      testSharpe: {
        mean: this._mean(testSharpes),
        std: this._std(testSharpes),
        min: Math.min(...testSharpes),
        max: Math.max(...testSharpes),
        median: this._median(testSharpes),
      },

      // 测试期最大回撤统计
      testDrawdown: {
        mean: this._mean(testDrawdowns),
        std: this._std(testDrawdowns),
        min: Math.min(...testDrawdowns),
        max: Math.max(...testDrawdowns),
        median: this._median(testDrawdowns),
      },

      // 测试期胜率统计
      testWinRate: {
        mean: this._mean(testWinRates),
        std: this._std(testWinRates),
        min: Math.min(...testWinRates),
        max: Math.max(...testWinRates),
        median: this._median(testWinRates),
      },

      // 训练/测试性能比率统计
      performanceRatio: performanceRatios.length > 0 ? {
        mean: this._mean(performanceRatios),
        std: this._std(performanceRatios),
        min: Math.min(...performanceRatios),
        max: Math.max(...performanceRatios),
      } : null,

      // 盈利窗口比例
      profitableWindowsRatio: testReturns.filter(r => r > 0).length / testReturns.length,

      // 组合收益（假设等权重分配）
      combinedReturn: testReturns.reduce((a, b) => a + b, 0),

      // 年化组合收益（假设窗口按时间顺序）
      annualizedCombinedReturn: this._calculateAnnualizedReturn(),
    };
  }

  /**
   * 计算年化组合收益
   * Calculate annualized combined return
   * @private
   */
  _calculateAnnualizedReturn() {
    if (this.results.length === 0) return 0;

    // 计算整体时间跨度
    const firstWindow = this.results[0];
    const lastWindow = this.results[this.results.length - 1];

    const startTime = firstWindow.testPeriod.start;
    const endTime = lastWindow.testPeriod.end;
    const days = (endTime - startTime) / (1000 * 60 * 60 * 24);

    if (days <= 0) return 0;

    // 计算累计收益
    let cumulativeReturn = 1;
    for (const result of this.results) {
      cumulativeReturn *= (1 + result.testStats.totalReturn / 100);
    }

    // 年化
    const totalReturn = cumulativeReturn - 1;
    return (Math.pow(1 + totalReturn, 365 / days) - 1) * 100;
  }

  /**
   * 计算稳健性得分
   * Calculate robustness score
   * @private
   */
  _calculateRobustnessScore() {
    if (!this.aggregatedStats) return 0;

    const stats = this.aggregatedStats;
    let score = 0;
    let factors = 0;

    // 1. 盈利窗口比例 (0-30分)
    score += stats.profitableWindowsRatio * 30;
    factors++;

    // 2. 测试期收益稳定性 (0-20分)
    if (stats.testReturn.std > 0 && stats.testReturn.mean !== 0) {
      const cv = Math.abs(stats.testReturn.std / stats.testReturn.mean);
      score += Math.max(0, 20 - cv * 10);
    }
    factors++;

    // 3. 训练/测试性能一致性 (0-20分)
    if (stats.performanceRatio) {
      const ratio = stats.performanceRatio.mean;
      // 最佳比率在 0.7-1.0 之间
      if (ratio >= 0.7 && ratio <= 1.0) {
        score += 20;
      } else if (ratio > 0.5 && ratio < 1.3) {
        score += 15;
      } else if (ratio > 0.3 && ratio < 1.5) {
        score += 10;
      }
    }
    factors++;

    // 4. 平均夏普比率 (0-15分)
    if (stats.testSharpe.mean > 0) {
      score += Math.min(15, stats.testSharpe.mean * 5);
    }
    factors++;

    // 5. 最大回撤控制 (0-15分)
    const avgDrawdown = stats.testDrawdown.mean;
    if (avgDrawdown < 10) {
      score += 15;
    } else if (avgDrawdown < 20) {
      score += 10;
    } else if (avgDrawdown < 30) {
      score += 5;
    }
    factors++;

    return Math.round(score);
  }

  /**
   * 生成建议
   * Generate recommendations
   * @private
   */
  _generateRecommendations() {
    const recommendations = [];

    if (!this.aggregatedStats) {
      recommendations.push({
        level: 'error',
        message: '没有有效的分析结果 / No valid analysis results',
      });
      return recommendations;
    }

    const stats = this.aggregatedStats;

    // 检查盈利窗口比例
    if (stats.profitableWindowsRatio < 0.5) {
      recommendations.push({
        level: 'warning',
        message: `盈利窗口比例较低 (${(stats.profitableWindowsRatio * 100).toFixed(1)}%)，策略可能不稳定 / Low profitable windows ratio`,
      });
    }

    // 检查性能衰减
    if (stats.performanceRatio && stats.performanceRatio.mean < 0.5) {
      recommendations.push({
        level: 'warning',
        message: '训练/测试性能比率较低，可能存在过拟合 / Low train/test performance ratio, possible overfitting',
      });
    }

    // 检查回撤
    if (stats.testDrawdown.max > 30) {
      recommendations.push({
        level: 'warning',
        message: `最大回撤过高 (${stats.testDrawdown.max.toFixed(1)}%)，建议增加风控 / High max drawdown`,
      });
    }

    // 检查收益波动
    if (stats.testReturn.std > Math.abs(stats.testReturn.mean) * 2) {
      recommendations.push({
        level: 'info',
        message: '收益波动较大，建议增加验证窗口数量 / High return volatility',
      });
    }

    // 积极建议
    if (stats.profitableWindowsRatio >= 0.7 && stats.testSharpe.mean > 1) {
      recommendations.push({
        level: 'success',
        message: '策略表现稳定，建议进行实盘验证 / Strategy shows stability, recommend live testing',
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

  /**
   * 获取结果
   * Get results
   */
  getResults() {
    return [...this.results];
  }

  /**
   * 获取聚合统计
   * Get aggregated statistics
   */
  getAggregatedStats() {
    return this.aggregatedStats;
  }

  /**
   * 停止分析
   * Stop analysis
   */
  stop() {
    this.isRunning = false;
    this.emit('stopped');
  }
}

export default WalkForwardAnalysis;
