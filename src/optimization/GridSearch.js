/**
 * 参数网格搜索
 * Parameter Grid Search
 *
 * 系统性地遍历参数空间，找到最优参数组合
 * Systematically explores parameter space to find optimal parameter combinations
 *
 * @module src/optimization/GridSearch
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import { BacktestEngine } from '../backtest/BacktestEngine.js'; // 导入模块 ../backtest/BacktestEngine.js

/**
 * 优化目标枚举
 * Optimization Target Enum
 */
export const OptimizationTarget = { // 导出常量 OptimizationTarget
  TOTAL_RETURN: 'totalReturn',           // 总RETURN
  ANNUAL_RETURN: 'annualReturn',         // ANNUALRETURN
  SHARPE_RATIO: 'sharpeRatio',           // SHARPE比例
  CALMAR_RATIO: 'calmarRatio',           // CALMAR比例
  PROFIT_FACTOR: 'profitFactor',         // 盈利FACTOR
  WIN_RATE: 'winRate',                   // WIN频率
  MAX_DRAWDOWN: 'maxDrawdownPercent',    // 最大回撤
  CUSTOM: 'custom',                      // 自定义
}; // 结束代码块

/**
 * 默认配置
 * Default Configuration
 */
export const DEFAULT_GRID_SEARCH_CONFIG = { // 导出常量 DEFAULT_GRID_SEARCH_CONFIG
  // 优化目标
  target: OptimizationTarget.SHARPE_RATIO, // target

  // 是否并行执行 (使用 Worker)
  parallel: false, // 是否并行执行 (使用 Worker)

  // 最大并行数
  maxWorkers: 4, // 最大Workers

  // 是否记录所有结果
  recordAllResults: true, // 是否记录所有结果

  // 最小交易次数（过滤无效参数）
  minTrades: 5, // 最小交易次数（过滤无效参数）

  // 进度回调间隔
  progressInterval: 10, // progress间隔

  // 回测配置
  backtestConfig: { // backtest配置
    initialCapital: 10000, // 初始资金
    commissionRate: 0.001, // 手续费频率
    slippage: 0.0005, // 滑点
  }, // 结束代码块
}; // 结束代码块

/**
 * 参数网格搜索类
 * Parameter Grid Search Class
 */
export class GridSearch extends EventEmitter { // 导出类 GridSearch
  /**
   * 构造函数
   * @param {Object} config - 配置
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { ...DEFAULT_GRID_SEARCH_CONFIG, ...config }; // 设置 config
    this.results = []; // 设置 results
    this.bestResult = null; // 设置 bestResult
    this.isRunning = false; // 设置 isRunning
    this.progress = { current: 0, total: 0, percent: 0 }; // 设置 progress
  } // 结束代码块

  /**
   * 生成参数组合
   * Generate parameter combinations
   * @param {Object} parameterSpace - 参数空间定义
   * @returns {Array} 参数组合数组
   *
   * 参数空间格式 / Parameter space format:
   * {
   *   period: { start: 10, end: 50, step: 5 },      // 范围参数
   *   threshold: [0.01, 0.02, 0.03],                // 列表参数
   *   enabled: [true, false],                       // 布尔参数
   * }
   */
  generateCombinations(parameterSpace) { // 调用 generateCombinations
    const keys = Object.keys(parameterSpace); // 定义常量 keys
    const values = keys.map(key => { // 定义函数 values
      const param = parameterSpace[key]; // 定义常量 param

      // 范围参数
      if (param.start !== undefined && param.end !== undefined) { // 条件判断 param.start !== undefined && param.end !== un...
        const result = []; // 定义常量 result
        const step = param.step || 1; // 定义常量 step
        for (let v = param.start; v <= param.end; v += step) { // 循环 let v = param.start; v <= param.end; v += step
          result.push(Math.round(v * 1000000) / 1000000); // 处理浮点精度
        } // 结束代码块
        return result; // 返回结果
      } // 结束代码块

      // 列表参数
      if (Array.isArray(param)) { // 条件判断 Array.isArray(param)
        return param; // 返回结果
      } // 结束代码块

      // 单值参数
      return [param]; // 返回结果
    }); // 结束代码块

    // 笛卡尔积
    const combinations = this._cartesianProduct(values); // 定义常量 combinations

    return combinations.map(combo => { // 返回结果
      const params = {}; // 定义常量 params
      keys.forEach((key, i) => { // 调用 keys.forEach
        params[key] = combo[i]; // 执行语句
      }); // 结束代码块
      return params; // 返回结果
    }); // 结束代码块
  } // 结束代码块

  /**
   * 笛卡尔积
   * Cartesian product
   * @private
   */
  _cartesianProduct(arrays) { // 调用 _cartesianProduct
    return arrays.reduce((acc, arr) => { // 返回结果
      if (acc.length === 0) return arr.map(v => [v]); // 条件判断 acc.length === 0
      return acc.flatMap(combo => arr.map(v => [...combo, v])); // 返回结果
    }, []); // 执行语句
  } // 结束代码块

  /**
   * 运行网格搜索
   * Run grid search
   * @param {Object} options - 搜索选项
   * @returns {Promise<Object>} 搜索结果
   */
  async run(options) { // 执行语句
    const { // 解构赋值
      data,                    // 历史数据
      strategyClass,           // 策略类
      parameterSpace,          // 参数空间
      fixedParams = {},        // 固定参数
      customScorer = null,     // 自定义评分函数
    } = options; // 执行语句

    // 验证输入
    if (!data || !Array.isArray(data) || data.length === 0) { // 条件判断 !data || !Array.isArray(data) || data.length ...
      throw new Error('必须提供有效的历史数据 / Valid historical data required'); // 抛出异常
    } // 结束代码块
    if (!strategyClass) { // 条件判断 !strategyClass
      throw new Error('必须提供策略类 / Strategy class required'); // 抛出异常
    } // 结束代码块
    if (!parameterSpace || Object.keys(parameterSpace).length === 0) { // 条件判断 !parameterSpace || Object.keys(parameterSpace...
      throw new Error('必须提供参数空间 / Parameter space required'); // 抛出异常
    } // 结束代码块

    // 生成参数组合
    const combinations = this.generateCombinations(parameterSpace); // 定义常量 combinations
    console.log(`[GridSearch] 生成 ${combinations.length} 个参数组合 / Generated ${combinations.length} parameter combinations`); // 控制台输出

    // 初始化状态
    this.results = []; // 设置 results
    this.bestResult = null; // 设置 bestResult
    this.isRunning = true; // 设置 isRunning
    this.progress = { current: 0, total: combinations.length, percent: 0 }; // 设置 progress

    this.emit('start', { totalCombinations: combinations.length }); // 调用 emit

    const startTime = Date.now(); // 定义常量 startTime

    // 遍历所有参数组合
    for (let i = 0; i < combinations.length; i++) { // 循环 let i = 0; i < combinations.length; i++
      const params = combinations[i]; // 定义常量 params

      try { // 尝试执行
        // 合并固定参数和当前参数
        const fullParams = { ...fixedParams, ...params }; // 定义常量 fullParams

        // 创建策略实例
        const strategy = new strategyClass(fullParams); // 定义常量 strategy

        // 创建回测引擎
        const engine = new BacktestEngine(this.config.backtestConfig); // 定义常量 engine
        engine.loadData([...data]); // 复制数据避免污染
        engine.setStrategy(strategy); // 调用 engine.setStrategy

        // 运行回测
        const stats = await engine.run(); // 定义常量 stats

        // 计算得分
        const score = this._calculateScore(stats, customScorer); // 定义常量 score

        // 记录结果
        const result = { // 定义常量 result
          params, // 执行语句
          stats, // 执行语句
          score, // 执行语句
          isValid: stats.totalTrades >= this.config.minTrades, // 是否有效
        }; // 结束代码块

        if (this.config.recordAllResults) { // 条件判断 this.config.recordAllResults
          this.results.push(result); // 访问 results
        } // 结束代码块

        // 更新最优结果
        if (result.isValid && (this.bestResult === null || score > this.bestResult.score)) { // 条件判断 result.isValid && (this.bestResult === null |...
          this.bestResult = result; // 设置 bestResult
          this.emit('newBest', result); // 调用 emit
        } // 结束代码块

      } catch (error) { // 执行语句
        console.error(`[GridSearch] 参数组合 ${i} 执行失败 / Combination ${i} failed:`, error.message); // 控制台输出
        this.emit('error', { index: i, params, error }); // 调用 emit
      } // 结束代码块

      // 更新进度
      this.progress.current = i + 1; // 访问 progress
      this.progress.percent = ((i + 1) / combinations.length * 100).toFixed(2); // 访问 progress

      if ((i + 1) % this.config.progressInterval === 0 || i === combinations.length - 1) { // 条件判断 (i + 1) % this.config.progressInterval === 0 ...
        this.emit('progress', { ...this.progress }); // 调用 emit
      } // 结束代码块
    } // 结束代码块

    const endTime = Date.now(); // 定义常量 endTime
    const duration = (endTime - startTime) / 1000; // 定义常量 duration

    // 按得分排序结果
    if (this.config.recordAllResults) { // 条件判断 this.config.recordAllResults
      this.results.sort((a, b) => b.score - a.score); // 访问 results
    } // 结束代码块

    this.isRunning = false; // 设置 isRunning

    // 构建最终结果
    const finalResult = { // 定义常量 finalResult
      bestParams: this.bestResult?.params || null, // bestParams
      bestStats: this.bestResult?.stats || null, // bestStats
      bestScore: this.bestResult?.score || null, // best分数
      totalCombinations: combinations.length, // 总Combinations
      validCombinations: this.results.filter(r => r.isValid).length, // 有效Combinations
      duration, // 执行语句
      allResults: this.config.recordAllResults ? this.results : null, // allResults
      topResults: this._getTopResults(10), // topResults
      parameterSensitivity: this._analyzeParameterSensitivity(), // parameterSensitivity
    }; // 结束代码块

    this.emit('complete', finalResult); // 调用 emit

    console.log(`[GridSearch] 搜索完成，耗时 ${duration.toFixed(2)}s / Search completed in ${duration.toFixed(2)}s`); // 控制台输出
    console.log(`[GridSearch] 最优参数 / Best params:`, this.bestResult?.params); // 控制台输出
    console.log(`[GridSearch] 最优得分 / Best score:`, this.bestResult?.score?.toFixed(4)); // 控制台输出

    return finalResult; // 返回结果
  } // 结束代码块

  /**
   * 计算得分
   * Calculate score
   * @private
   */
  _calculateScore(stats, customScorer) { // 调用 _calculateScore
    if (customScorer && typeof customScorer === 'function') { // 条件判断 customScorer && typeof customScorer === 'func...
      return customScorer(stats); // 返回结果
    } // 结束代码块

    const target = this.config.target; // 定义常量 target

    switch (target) { // 分支选择 target
      case OptimizationTarget.TOTAL_RETURN: // 分支 OptimizationTarget.TOTAL_RETURN
        return stats.totalReturn || 0; // 返回结果

      case OptimizationTarget.ANNUAL_RETURN: // 分支 OptimizationTarget.ANNUAL_RETURN
        return stats.annualReturn || 0; // 返回结果

      case OptimizationTarget.SHARPE_RATIO: // 分支 OptimizationTarget.SHARPE_RATIO
        return stats.sharpeRatio || 0; // 返回结果

      case OptimizationTarget.CALMAR_RATIO: // 分支 OptimizationTarget.CALMAR_RATIO
        return stats.calmarRatio || 0; // 返回结果

      case OptimizationTarget.PROFIT_FACTOR: // 分支 OptimizationTarget.PROFIT_FACTOR
        return stats.profitFactor || 0; // 返回结果

      case OptimizationTarget.WIN_RATE: // 分支 OptimizationTarget.WIN_RATE
        return stats.winRate || 0; // 返回结果

      case OptimizationTarget.MAX_DRAWDOWN: // 分支 OptimizationTarget.MAX_DRAWDOWN
        // 最大回撤越小越好，取反
        return -(stats.maxDrawdownPercent || 100); // 返回结果

      default: // 默认
        return stats.sharpeRatio || 0; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取前 N 个结果
   * Get top N results
   * @private
   */
  _getTopResults(n) { // 调用 _getTopResults
    return this.results // 返回结果
      .filter(r => r.isValid) // 定义箭头函数
      .slice(0, n) // 执行语句
      .map(r => ({ // 定义箭头函数
        params: r.params, // params
        score: r.score, // 分数
        totalReturn: r.stats.totalReturn, // 总Return
        sharpeRatio: r.stats.sharpeRatio, // sharpe比例
        maxDrawdown: r.stats.maxDrawdownPercent, // 最大回撤
        trades: r.stats.totalTrades, // 成交
      })); // 结束代码块
  } // 结束代码块

  /**
   * 分析参数敏感度
   * Analyze parameter sensitivity
   * @private
   */
  _analyzeParameterSensitivity() { // 调用 _analyzeParameterSensitivity
    if (this.results.length < 2) return {}; // 条件判断 this.results.length < 2

    const validResults = this.results.filter(r => r.isValid); // 定义函数 validResults
    if (validResults.length < 2) return {}; // 条件判断 validResults.length < 2

    const sensitivity = {}; // 定义常量 sensitivity
    const paramKeys = Object.keys(validResults[0].params); // 定义常量 paramKeys

    for (const key of paramKeys) { // 循环 const key of paramKeys
      // 按该参数分组
      const groups = new Map(); // 定义常量 groups
      for (const result of validResults) { // 循环 const result of validResults
        const value = result.params[key]; // 定义常量 value
        if (!groups.has(value)) { // 条件判断 !groups.has(value)
          groups.set(value, []); // 调用 groups.set
        } // 结束代码块
        groups.get(value).push(result.score); // 调用 groups.get
      } // 结束代码块

      // 计算每个参数值的平均得分
      const avgScores = []; // 定义常量 avgScores
      for (const [value, scores] of groups) { // 循环 const [value, scores] of groups
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length; // 定义函数 avg
        avgScores.push({ value, avgScore: avg, count: scores.length }); // 调用 avgScores.push
      } // 结束代码块

      // 计算得分的标准差作为敏感度指标
      if (avgScores.length > 1) { // 条件判断 avgScores.length > 1
        const allAvgs = avgScores.map(a => a.avgScore); // 定义函数 allAvgs
        const mean = allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length; // 定义函数 mean
        const variance = allAvgs.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allAvgs.length; // 定义函数 variance
        const stdDev = Math.sqrt(variance); // 定义常量 stdDev

        sensitivity[key] = { // 执行语句
          stdDev, // 执行语句
          valueScores: avgScores.sort((a, b) => b.avgScore - a.avgScore), // valueScores
          bestValue: avgScores[0]?.value, // bestValue
        }; // 结束代码块
      } // 结束代码块
    } // 结束代码块

    // 按敏感度排序
    const sortedKeys = Object.keys(sensitivity) // 定义常量 sortedKeys
      .sort((a, b) => sensitivity[b].stdDev - sensitivity[a].stdDev); // 定义箭头函数

    const sortedSensitivity = {}; // 定义常量 sortedSensitivity
    for (const key of sortedKeys) { // 循环 const key of sortedKeys
      sortedSensitivity[key] = sensitivity[key]; // 执行语句
    } // 结束代码块

    return sortedSensitivity; // 返回结果
  } // 结束代码块

  /**
   * 获取热力图数据（用于可视化）
   * Get heatmap data for visualization
   * @param {string} param1 - 第一个参数名
   * @param {string} param2 - 第二个参数名
   * @returns {Object} 热力图数据
   */
  getHeatmapData(param1, param2) { // 调用 getHeatmapData
    if (this.results.length === 0) return null; // 条件判断 this.results.length === 0

    const heatmap = new Map(); // 定义常量 heatmap
    const param1Values = new Set(); // 定义常量 param1Values
    const param2Values = new Set(); // 定义常量 param2Values

    for (const result of this.results) { // 循环 const result of this.results
      if (!result.isValid) continue; // 条件判断 !result.isValid

      const v1 = result.params[param1]; // 定义常量 v1
      const v2 = result.params[param2]; // 定义常量 v2
      const key = `${v1}_${v2}`; // 定义常量 key

      param1Values.add(v1); // 调用 param1Values.add
      param2Values.add(v2); // 调用 param2Values.add

      if (!heatmap.has(key)) { // 条件判断 !heatmap.has(key)
        heatmap.set(key, { scores: [], count: 0 }); // 调用 heatmap.set
      } // 结束代码块
      heatmap.get(key).scores.push(result.score); // 调用 heatmap.get
      heatmap.get(key).count++; // 调用 heatmap.get
    } // 结束代码块

    // 转换为数组格式
    const data = []; // 定义常量 data
    for (const [key, value] of heatmap) { // 循环 const [key, value] of heatmap
      const [v1, v2] = key.split('_'); // 解构赋值
      const avgScore = value.scores.reduce((a, b) => a + b, 0) / value.scores.length; // 定义函数 avgScore
      data.push({ // 调用 data.push
        [param1]: parseFloat(v1), // 执行语句
        [param2]: parseFloat(v2), // 执行语句
        score: avgScore, // 分数
        count: value.count, // 数量
      }); // 结束代码块
    } // 结束代码块

    return { // 返回结果
      param1, // 执行语句
      param2, // 执行语句
      param1Values: Array.from(param1Values).sort((a, b) => a - b), // param1Values
      param2Values: Array.from(param2Values).sort((a, b) => a - b), // param2Values
      data, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 停止搜索
   * Stop search
   */
  stop() { // 调用 stop
    this.isRunning = false; // 设置 isRunning
    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  /**
   * 获取当前进度
   * Get current progress
   */
  getProgress() { // 调用 getProgress
    return { ...this.progress }; // 返回结果
  } // 结束代码块

  /**
   * 获取最优结果
   * Get best result
   */
  getBestResult() { // 调用 getBestResult
    return this.bestResult; // 返回结果
  } // 结束代码块

  /**
   * 获取所有结果
   * Get all results
   */
  getAllResults() { // 调用 getAllResults
    return [...this.results]; // 返回结果
  } // 结束代码块
} // 结束代码块

export default GridSearch; // 默认导出
