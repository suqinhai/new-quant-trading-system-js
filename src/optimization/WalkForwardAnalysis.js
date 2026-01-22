/**
 * Walk-Forward 分析
 * Walk-Forward Analysis
 *
 * 滚动优化验证方法，避免过拟合，评估策略的稳健性
 * Rolling optimization validation method to avoid overfitting and assess strategy robustness
 *
 * @module src/optimization/WalkForwardAnalysis
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import { BacktestEngine } from '../backtest/BacktestEngine.js'; // 导入模块 ../backtest/BacktestEngine.js
import { GridSearch, OptimizationTarget } from './GridSearch.js'; // 导入模块 ./GridSearch.js

/**
 * Walk-Forward 类型
 * Walk-Forward Type
 */
export const WalkForwardType = { // 导出常量 WalkForwardType
  ANCHORED: 'anchored',     // ANCHORED
  ROLLING: 'rolling',       // 滚动
  EXPANDING: 'expanding',   // EXPANDING
}; // 结束代码块

/**
 * 默认配置
 * Default Configuration
 */
export const DEFAULT_WF_CONFIG = { // 导出常量 DEFAULT_WF_CONFIG
  // Walk-Forward 类型
  type: WalkForwardType.ROLLING, // Walk-Forward 类型

  // 训练窗口大小（K线数量或百分比）
  trainingWindow: 0.6,  // 训练窗口大小（K线数量或百分比）

  // 测试窗口大小
  testWindow: 0.2,      // test窗口

  // 滚动步长（测试窗口数量）
  stepSize: 1, // 滚动步长（测试窗口数量）

  // 最小训练样本数
  minTrainingSamples: 100, // 最小TrainingSamples

  // 优化目标
  optimizationTarget: OptimizationTarget.SHARPE_RATIO, // optimizationTarget

  // 回测配置
  backtestConfig: { // backtest配置
    initialCapital: 10000, // 初始资金
    commissionRate: 0.001, // 手续费频率
    slippage: 0.0005, // 滑点
  }, // 结束代码块

  // 网格搜索配置
  gridSearchConfig: { // 网格Search配置
    minTrades: 3, // 最小成交
    recordAllResults: false, // recordAllResults
  }, // 结束代码块
}; // 结束代码块

/**
 * Walk-Forward 分析类
 * Walk-Forward Analysis Class
 */
export class WalkForwardAnalysis extends EventEmitter { // 导出类 WalkForwardAnalysis
  /**
   * 构造函数
   * @param {Object} config - 配置
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { ...DEFAULT_WF_CONFIG, ...config }; // 设置 config
    this.windows = []; // 设置 windows
    this.results = []; // 设置 results
    this.aggregatedStats = null; // 设置 aggregatedStats
    this.isRunning = false; // 设置 isRunning
  } // 结束代码块

  /**
   * 生成 Walk-Forward 窗口
   * Generate Walk-Forward windows
   * @param {Array} data - 历史数据
   * @returns {Array} 窗口定义数组
   */
  generateWindows(data) { // 调用 generateWindows
    const totalLength = data.length; // 定义常量 totalLength
    const windows = []; // 定义常量 windows

    // 计算窗口大小
    let trainSize, testSize; // 定义变量 trainSize

    if (this.config.trainingWindow < 1) { // 条件判断 this.config.trainingWindow < 1
      // 百分比模式
      trainSize = Math.floor(totalLength * this.config.trainingWindow); // 赋值 trainSize
      testSize = Math.floor(totalLength * this.config.testWindow); // 赋值 testSize
    } else { // 执行语句
      // 绝对数量模式
      trainSize = this.config.trainingWindow; // 赋值 trainSize
      testSize = this.config.testWindow; // 赋值 testSize
    } // 结束代码块

    // 验证窗口大小
    if (trainSize < this.config.minTrainingSamples) { // 条件判断 trainSize < this.config.minTrainingSamples
      throw new Error(`训练窗口太小: ${trainSize} < ${this.config.minTrainingSamples}`); // 抛出异常
    } // 结束代码块

    const type = this.config.type; // 定义常量 type
    let trainStart = 0; // 定义变量 trainStart
    let trainEnd = trainSize; // 定义变量 trainEnd
    let testStart = trainEnd; // 定义变量 testStart
    let testEnd = testStart + testSize; // 定义变量 testEnd
    let windowIndex = 0; // 定义变量 windowIndex

    while (testEnd <= totalLength) { // 循环条件 testEnd <= totalLength
      windows.push({ // 调用 windows.push
        index: windowIndex, // index
        trainStart, // 执行语句
        trainEnd, // 执行语句
        testStart, // 执行语句
        testEnd, // 执行语句
        trainData: data.slice(trainStart, trainEnd), // train数据
        testData: data.slice(testStart, testEnd), // test数据
      }); // 结束代码块

      windowIndex++; // 执行语句

      // 根据类型更新窗口位置
      if (type === WalkForwardType.ROLLING) { // 条件判断 type === WalkForwardType.ROLLING
        // 滚动式：训练和测试窗口都向前移动
        trainStart += testSize * this.config.stepSize; // 执行语句
        trainEnd = trainStart + trainSize; // 赋值 trainEnd
        testStart = trainEnd; // 赋值 testStart
        testEnd = testStart + testSize; // 赋值 testEnd
      } else if (type === WalkForwardType.ANCHORED) { // 执行语句
        // 锚定式：训练窗口从起点开始扩展
        trainEnd += testSize * this.config.stepSize; // 执行语句
        testStart = trainEnd; // 赋值 testStart
        testEnd = testStart + testSize; // 赋值 testEnd
      } else if (type === WalkForwardType.EXPANDING) { // 执行语句
        // 扩展式：训练窗口扩展，包含之前的测试数据
        trainEnd = testEnd; // 赋值 trainEnd
        testStart = trainEnd; // 赋值 testStart
        testEnd = testStart + testSize; // 赋值 testEnd
      } // 结束代码块
    } // 结束代码块

    console.log(`[WalkForward] 生成 ${windows.length} 个窗口 / Generated ${windows.length} windows`); // 控制台输出

    return windows; // 返回结果
  } // 结束代码块

  /**
   * 运行 Walk-Forward 分析
   * Run Walk-Forward Analysis
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 分析结果
   */
  async run(options) { // 执行语句
    const { // 解构赋值
      data,                    // 历史数据
      strategyClass,           // 策略类
      parameterSpace,          // 参数空间
      fixedParams = {},        // 固定参数
    } = options; // 执行语句

    // 验证输入
    if (!data || !Array.isArray(data) || data.length === 0) { // 条件判断 !data || !Array.isArray(data) || data.length ...
      throw new Error('必须提供有效的历史数据 / Valid historical data required'); // 抛出异常
    } // 结束代码块

    // 生成窗口
    this.windows = this.generateWindows(data); // 设置 windows

    if (this.windows.length === 0) { // 条件判断 this.windows.length === 0
      throw new Error('无法生成有效的 Walk-Forward 窗口 / Cannot generate valid windows'); // 抛出异常
    } // 结束代码块

    this.results = []; // 设置 results
    this.isRunning = true; // 设置 isRunning

    this.emit('start', { totalWindows: this.windows.length }); // 调用 emit

    const startTime = Date.now(); // 定义常量 startTime

    // 遍历每个窗口
    for (let i = 0; i < this.windows.length; i++) { // 循环 let i = 0; i < this.windows.length; i++
      const window = this.windows[i]; // 定义常量 window

      console.log(`[WalkForward] 处理窗口 ${i + 1}/${this.windows.length} / Processing window ${i + 1}/${this.windows.length}`); // 控制台输出

      try { // 尝试执行
        // 1. 在训练数据上优化参数
        const gridSearch = new GridSearch({ // 定义常量 gridSearch
          ...this.config.gridSearchConfig, // 展开对象或数组
          target: this.config.optimizationTarget, // target
          backtestConfig: this.config.backtestConfig, // backtest配置
        }); // 结束代码块

        const optimizationResult = await gridSearch.run({ // 定义常量 optimizationResult
          data: window.trainData, // 数据
          strategyClass, // 执行语句
          parameterSpace, // 执行语句
          fixedParams, // 执行语句
        }); // 结束代码块

        const bestParams = optimizationResult.bestParams; // 定义常量 bestParams

        if (!bestParams) { // 条件判断 !bestParams
          console.warn(`[WalkForward] 窗口 ${i} 优化失败，跳过 / Window ${i} optimization failed, skipping`); // 控制台输出
          continue; // 继续下一轮循环
        } // 结束代码块

        // 2. 使用最优参数在测试数据上回测
        const strategy = new strategyClass({ ...fixedParams, ...bestParams }); // 定义常量 strategy
        const engine = new BacktestEngine(this.config.backtestConfig); // 定义常量 engine
        engine.loadData([...window.testData]); // 调用 engine.loadData
        engine.setStrategy(strategy); // 调用 engine.setStrategy

        const testStats = await engine.run(); // 定义常量 testStats

        // 3. 记录结果
        const windowResult = { // 定义常量 windowResult
          windowIndex: i, // 窗口Index
          trainPeriod: { // train周期
            start: window.trainData[0].timestamp, // 启动
            end: window.trainData[window.trainData.length - 1].timestamp, // end
            samples: window.trainData.length, // samples
          }, // 结束代码块
          testPeriod: { // test周期
            start: window.testData[0].timestamp, // 启动
            end: window.testData[window.testData.length - 1].timestamp, // end
            samples: window.testData.length, // samples
          }, // 结束代码块
          optimizedParams: bestParams, // optimizedParams
          trainStats: optimizationResult.bestStats, // trainStats
          testStats, // 执行语句
          // 计算训练/测试性能比率
          performanceRatio: this._calculatePerformanceRatio( // 计算训练/测试性能比率
            optimizationResult.bestStats, // 执行语句
            testStats // 执行语句
          ), // 结束调用或参数
        }; // 结束代码块

        this.results.push(windowResult); // 访问 results

        this.emit('windowComplete', { // 调用 emit
          windowIndex: i, // 窗口Index
          result: windowResult, // result
          progress: ((i + 1) / this.windows.length * 100).toFixed(2), // progress
        }); // 结束代码块

      } catch (error) { // 执行语句
        console.error(`[WalkForward] 窗口 ${i} 处理失败 / Window ${i} processing failed:`, error.message); // 控制台输出
        this.emit('error', { windowIndex: i, error }); // 调用 emit
      } // 结束代码块
    } // 结束代码块

    const endTime = Date.now(); // 定义常量 endTime
    const duration = (endTime - startTime) / 1000; // 定义常量 duration

    // 计算聚合统计
    this.aggregatedStats = this._calculateAggregatedStats(); // 设置 aggregatedStats

    this.isRunning = false; // 设置 isRunning

    // 构建最终结果
    const finalResult = { // 定义常量 finalResult
      type: this.config.type, // 类型
      totalWindows: this.windows.length, // 总Windows
      validWindows: this.results.length, // 有效Windows
      duration, // 执行语句
      windowResults: this.results, // 窗口Results
      aggregatedStats: this.aggregatedStats, // aggregatedStats
      robustnessScore: this._calculateRobustnessScore(), // robustness分数
      recommendations: this._generateRecommendations(), // recommendations
    }; // 结束代码块

    this.emit('complete', finalResult); // 调用 emit

    console.log(`[WalkForward] 分析完成，耗时 ${duration.toFixed(2)}s / Analysis completed in ${duration.toFixed(2)}s`); // 控制台输出

    return finalResult; // 返回结果
  } // 结束代码块

  /**
   * 计算训练/测试性能比率
   * Calculate training/test performance ratio
   * @private
   */
  _calculatePerformanceRatio(trainStats, testStats) { // 调用 _calculatePerformanceRatio
    if (!trainStats || !testStats) return null; // 条件判断 !trainStats || !testStats

    return { // 返回结果
      returnRatio: trainStats.totalReturn !== 0 // return比例
        ? testStats.totalReturn / trainStats.totalReturn // 执行语句
        : 0, // 执行语句
      sharpeRatio: trainStats.sharpeRatio !== 0 // sharpe比例
        ? testStats.sharpeRatio / trainStats.sharpeRatio // 执行语句
        : 0, // 执行语句
      winRateRatio: trainStats.winRate !== 0 // win频率比例
        ? testStats.winRate / trainStats.winRate // 执行语句
        : 0, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算聚合统计
   * Calculate aggregated statistics
   * @private
   */
  _calculateAggregatedStats() { // 调用 _calculateAggregatedStats
    if (this.results.length === 0) return null; // 条件判断 this.results.length === 0

    const testReturns = this.results.map(r => r.testStats.totalReturn); // 定义函数 testReturns
    const testSharpes = this.results.map(r => r.testStats.sharpeRatio); // 定义函数 testSharpes
    const testDrawdowns = this.results.map(r => r.testStats.maxDrawdownPercent); // 定义函数 testDrawdowns
    const testWinRates = this.results.map(r => r.testStats.winRate); // 定义函数 testWinRates
    const performanceRatios = this.results // 定义常量 performanceRatios
      .filter(r => r.performanceRatio) // 定义箭头函数
      .map(r => r.performanceRatio.returnRatio); // 定义箭头函数

    return { // 返回结果
      // 测试期收益统计
      testReturn: { // 测试期收益统计
        mean: this._mean(testReturns), // mean
        std: this._std(testReturns), // 标准
        min: Math.min(...testReturns), // 最小
        max: Math.max(...testReturns), // 最大
        median: this._median(testReturns), // median
      }, // 结束代码块

      // 测试期夏普比率统计
      testSharpe: { // 测试期夏普比率统计
        mean: this._mean(testSharpes), // mean
        std: this._std(testSharpes), // 标准
        min: Math.min(...testSharpes), // 最小
        max: Math.max(...testSharpes), // 最大
        median: this._median(testSharpes), // median
      }, // 结束代码块

      // 测试期最大回撤统计
      testDrawdown: { // 测试期最大回撤统计
        mean: this._mean(testDrawdowns), // mean
        std: this._std(testDrawdowns), // 标准
        min: Math.min(...testDrawdowns), // 最小
        max: Math.max(...testDrawdowns), // 最大
        median: this._median(testDrawdowns), // median
      }, // 结束代码块

      // 测试期胜率统计
      testWinRate: { // testWin频率
        mean: this._mean(testWinRates), // mean
        std: this._std(testWinRates), // 标准
        min: Math.min(...testWinRates), // 最小
        max: Math.max(...testWinRates), // 最大
        median: this._median(testWinRates), // median
      }, // 结束代码块

      // 训练/测试性能比率统计
      performanceRatio: performanceRatios.length > 0 ? { // 训练/测试性能比率统计
        mean: this._mean(performanceRatios), // mean
        std: this._std(performanceRatios), // 标准
        min: Math.min(...performanceRatios), // 最小
        max: Math.max(...performanceRatios), // 最大
      } : null, // 执行语句

      // 盈利窗口比例
      profitableWindowsRatio: testReturns.filter(r => r > 0).length / testReturns.length, // 盈利窗口比例

      // 组合收益（假设等权重分配）
      combinedReturn: testReturns.reduce((a, b) => a + b, 0), // 组合收益（假设等权重分配）

      // 年化组合收益（假设窗口按时间顺序）
      annualizedCombinedReturn: this._calculateAnnualizedReturn(), // 年化组合收益（假设窗口按时间顺序）
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算年化组合收益
   * Calculate annualized combined return
   * @private
   */
  _calculateAnnualizedReturn() { // 调用 _calculateAnnualizedReturn
    if (this.results.length === 0) return 0; // 条件判断 this.results.length === 0

    // 计算整体时间跨度
    const firstWindow = this.results[0]; // 定义常量 firstWindow
    const lastWindow = this.results[this.results.length - 1]; // 定义常量 lastWindow

    const startTime = firstWindow.testPeriod.start; // 定义常量 startTime
    const endTime = lastWindow.testPeriod.end; // 定义常量 endTime
    const days = (endTime - startTime) / (1000 * 60 * 60 * 24); // 定义常量 days

    if (days <= 0) return 0; // 条件判断 days <= 0

    // 计算累计收益
    let cumulativeReturn = 1; // 定义变量 cumulativeReturn
    for (const result of this.results) { // 循环 const result of this.results
      cumulativeReturn *= (1 + result.testStats.totalReturn / 100); // 执行语句
    } // 结束代码块

    // 年化
    const totalReturn = cumulativeReturn - 1; // 定义常量 totalReturn
    return (Math.pow(1 + totalReturn, 365 / days) - 1) * 100; // 返回结果
  } // 结束代码块

  /**
   * 计算稳健性得分
   * Calculate robustness score
   * @private
   */
  _calculateRobustnessScore() { // 调用 _calculateRobustnessScore
    if (!this.aggregatedStats) return 0; // 条件判断 !this.aggregatedStats

    const stats = this.aggregatedStats; // 定义常量 stats
    let score = 0; // 定义变量 score
    let factors = 0; // 定义变量 factors

    // 1. 盈利窗口比例 (0-30分)
    score += stats.profitableWindowsRatio * 30; // 执行语句
    factors++; // 执行语句

    // 2. 测试期收益稳定性 (0-20分)
    if (stats.testReturn.std > 0 && stats.testReturn.mean !== 0) { // 条件判断 stats.testReturn.std > 0 && stats.testReturn....
      const cv = Math.abs(stats.testReturn.std / stats.testReturn.mean); // 定义常量 cv
      score += Math.max(0, 20 - cv * 10); // 执行语句
    } // 结束代码块
    factors++; // 执行语句

    // 3. 训练/测试性能一致性 (0-20分)
    if (stats.performanceRatio) { // 条件判断 stats.performanceRatio
      const ratio = stats.performanceRatio.mean; // 定义常量 ratio
      // 最佳比率在 0.7-1.0 之间
      if (ratio >= 0.7 && ratio <= 1.0) { // 条件判断 ratio >= 0.7 && ratio <= 1.0
        score += 20; // 执行语句
      } else if (ratio > 0.5 && ratio < 1.3) { // 执行语句
        score += 15; // 执行语句
      } else if (ratio > 0.3 && ratio < 1.5) { // 执行语句
        score += 10; // 执行语句
      } // 结束代码块
    } // 结束代码块
    factors++; // 执行语句

    // 4. 平均夏普比率 (0-15分)
    if (stats.testSharpe.mean > 0) { // 条件判断 stats.testSharpe.mean > 0
      score += Math.min(15, stats.testSharpe.mean * 5); // 执行语句
    } // 结束代码块
    factors++; // 执行语句

    // 5. 最大回撤控制 (0-15分)
    const avgDrawdown = stats.testDrawdown.mean; // 定义常量 avgDrawdown
    if (avgDrawdown < 10) { // 条件判断 avgDrawdown < 10
      score += 15; // 执行语句
    } else if (avgDrawdown < 20) { // 执行语句
      score += 10; // 执行语句
    } else if (avgDrawdown < 30) { // 执行语句
      score += 5; // 执行语句
    } // 结束代码块
    factors++; // 执行语句

    return Math.round(score); // 返回结果
  } // 结束代码块

  /**
   * 生成建议
   * Generate recommendations
   * @private
   */
  _generateRecommendations() { // 调用 _generateRecommendations
    const recommendations = []; // 定义常量 recommendations

    if (!this.aggregatedStats) { // 条件判断 !this.aggregatedStats
      recommendations.push({ // 调用 recommendations.push
        level: 'error', // 级别
        message: '没有有效的分析结果 / No valid analysis results', // 消息
      }); // 结束代码块
      return recommendations; // 返回结果
    } // 结束代码块

    const stats = this.aggregatedStats; // 定义常量 stats

    // 检查盈利窗口比例
    if (stats.profitableWindowsRatio < 0.5) { // 条件判断 stats.profitableWindowsRatio < 0.5
      recommendations.push({ // 调用 recommendations.push
        level: 'warning', // 级别
        message: `盈利窗口比例较低 (${(stats.profitableWindowsRatio * 100).toFixed(1)}%)，策略可能不稳定 / Low profitable windows ratio`, // 消息
      }); // 结束代码块
    } // 结束代码块

    // 检查性能衰减
    if (stats.performanceRatio && stats.performanceRatio.mean < 0.5) { // 条件判断 stats.performanceRatio && stats.performanceRa...
      recommendations.push({ // 调用 recommendations.push
        level: 'warning', // 级别
        message: '训练/测试性能比率较低，可能存在过拟合 / Low train/test performance ratio, possible overfitting', // 消息
      }); // 结束代码块
    } // 结束代码块

    // 检查回撤
    if (stats.testDrawdown.max > 30) { // 条件判断 stats.testDrawdown.max > 30
      recommendations.push({ // 调用 recommendations.push
        level: 'warning', // 级别
        message: `最大回撤过高 (${stats.testDrawdown.max.toFixed(1)}%)，建议增加风控 / High max drawdown`, // 消息
      }); // 结束代码块
    } // 结束代码块

    // 检查收益波动
    if (stats.testReturn.std > Math.abs(stats.testReturn.mean) * 2) { // 条件判断 stats.testReturn.std > Math.abs(stats.testRet...
      recommendations.push({ // 调用 recommendations.push
        level: 'info', // 级别
        message: '收益波动较大，建议增加验证窗口数量 / High return volatility', // 消息
      }); // 结束代码块
    } // 结束代码块

    // 积极建议
    if (stats.profitableWindowsRatio >= 0.7 && stats.testSharpe.mean > 1) { // 条件判断 stats.profitableWindowsRatio >= 0.7 && stats....
      recommendations.push({ // 调用 recommendations.push
        level: 'success', // 级别
        message: '策略表现稳定，建议进行实盘验证 / Strategy shows stability, recommend live testing', // 消息
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

  /**
   * 获取结果
   * Get results
   */
  getResults() { // 调用 getResults
    return [...this.results]; // 返回结果
  } // 结束代码块

  /**
   * 获取聚合统计
   * Get aggregated statistics
   */
  getAggregatedStats() { // 调用 getAggregatedStats
    return this.aggregatedStats; // 返回结果
  } // 结束代码块

  /**
   * 停止分析
   * Stop analysis
   */
  stop() { // 调用 stop
    this.isRunning = false; // 设置 isRunning
    this.emit('stopped'); // 调用 emit
  } // 结束代码块
} // 结束代码块

export default WalkForwardAnalysis; // 默认导出
