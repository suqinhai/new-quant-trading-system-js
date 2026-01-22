/**
 * 因子组合器
 * Factor Combiner
 *
 * 多因子打分、权重分配和排名系统
 * Multi-factor scoring, weighting and ranking system
 *
 * 核心功能:
 * - 多因子加权打分
 * - 因子标准化处理
 * - 横截面排名
 * - Top N / Bottom N 选择
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import { FACTOR_DIRECTION } from './BaseFactor.js'; // 导入模块 ./BaseFactor.js

/**
 * 标准化方法
 * Normalization Methods
 */
export const NORMALIZATION_METHOD = { // 导出常量 NORMALIZATION_METHOD
  ZSCORE: 'zscore',               // Z分数
  MIN_MAX: 'min_max',             // 最小最大
  PERCENTILE: 'percentile',       // PERCENTILE
  RANK: 'rank',                   // RANK
  ROBUST: 'robust',               // ROBUST
  NONE: 'none',                   // NONE
}; // 结束代码块

/**
 * 组合方法
 * Combination Methods
 */
export const COMBINATION_METHOD = { // 导出常量 COMBINATION_METHOD
  WEIGHTED_SUM: 'weighted_sum',       // WEIGHTEDSUM
  WEIGHTED_AVERAGE: 'weighted_avg',   // WEIGHTED平均
  RANK_AVERAGE: 'rank_avg',           // RANK平均
  IC_WEIGHTED: 'ic_weighted',         // ICWEIGHTED
  EQUAL: 'equal',                     // EQUAL
}; // 结束代码块

/**
 * 因子组合器类
 * Factor Combiner Class
 */
export class FactorCombiner extends EventEmitter { // 导出类 FactorCombiner
  /**
   * @param {Object} config - 配置
   * @param {Object} config.factorWeights - 因子权重 { factorName: weight }
   * @param {string} config.normalizationMethod - 标准化方法
   * @param {string} config.combinationMethod - 组合方法
   * @param {boolean} config.adjustForDirection - 是否根据因子方向调整
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 因子权重配置 / Factor weights
    this.factorWeights = config.factorWeights || {}; // 设置 factorWeights

    // 标准化和组合方法 / Normalization and combination methods
    this.normalizationMethod = config.normalizationMethod || NORMALIZATION_METHOD.ZSCORE; // 设置 normalizationMethod
    this.combinationMethod = config.combinationMethod || COMBINATION_METHOD.WEIGHTED_SUM; // 设置 combinationMethod

    // 是否根据因子方向调整 / Adjust for factor direction
    this.adjustForDirection = config.adjustForDirection !== false; // 设置 adjustForDirection

    // 因子方向缓存 / Factor direction cache
    this.factorDirections = config.factorDirections || {}; // 设置 factorDirections

    // 历史 IC 缓存 (用于 IC 加权) / Historical IC cache
    this.factorICs = new Map(); // 设置 factorICs

    // 结果缓存 / Result cache
    this.lastScores = null; // 设置 lastScores
    this.lastRankings = null; // 设置 lastRankings
  } // 结束代码块

  /**
   * 设置因子权重
   * Set factor weights
   * @param {Object} weights - { factorName: weight }
   */
  setWeights(weights) { // 调用 setWeights
    this.factorWeights = { ...this.factorWeights, ...weights }; // 设置 factorWeights
    this.emit('weightsUpdated', this.factorWeights); // 调用 emit
  } // 结束代码块

  /**
   * 设置因子方向
   * Set factor directions
   * @param {Object} directions - { factorName: 'positive'|'negative' }
   */
  setDirections(directions) { // 调用 setDirections
    this.factorDirections = { ...this.factorDirections, ...directions }; // 设置 factorDirections
  } // 结束代码块

  /**
   * 计算综合得分
   * Calculate composite scores
   * @param {Map<string, Map<string, number>>} factorValues - { factorName: { symbol: value } }
   * @param {string[]} symbols - 资产列表
   * @returns {Map<string, number>} { symbol: score }
   */
  calculateScores(factorValues, symbols) { // 调用 calculateScores
    // 1. 标准化各因子 / Normalize each factor
    const normalizedFactors = this._normalizeFactors(factorValues, symbols); // 定义常量 normalizedFactors

    // 2. 调整因子方向 / Adjust for factor direction
    const adjustedFactors = this.adjustForDirection // 定义常量 adjustedFactors
      ? this._adjustForDirections(normalizedFactors) // 执行语句
      : normalizedFactors; // 执行语句

    // 3. 组合因子得分 / Combine factor scores
    const scores = this._combineFactors(adjustedFactors, symbols); // 定义常量 scores

    this.lastScores = scores; // 设置 lastScores
    this.emit('scoresCalculated', { scores, symbols: symbols.length }); // 调用 emit

    return scores; // 返回结果
  } // 结束代码块

  /**
   * 生成排名
   * Generate rankings
   * @param {Map<string, number>} scores - { symbol: score }
   * @param {string} direction - 'descending' (高分优先) 或 'ascending' (低分优先)
   * @returns {Array<{symbol: string, score: number, rank: number}>}
   */
  generateRankings(scores, direction = 'descending') { // 调用 generateRankings
    const entries = Array.from(scores.entries()) // 定义常量 entries
      .filter(([, score]) => score !== null && !isNaN(score)); // 定义箭头函数

    // 排序 / Sort
    if (direction === 'descending') { // 条件判断 direction === 'descending'
      entries.sort((a, b) => b[1] - a[1]); // 调用 entries.sort
    } else { // 执行语句
      entries.sort((a, b) => a[1] - b[1]); // 调用 entries.sort
    } // 结束代码块

    // 生成排名结果 / Generate ranking results
    const rankings = entries.map(([symbol, score], index) => ({ // 定义函数 rankings
      symbol, // 执行语句
      score, // 执行语句
      rank: index + 1, // rank
      percentile: ((entries.length - index) / entries.length) * 100, // percentile
    })); // 结束代码块

    this.lastRankings = rankings; // 设置 lastRankings
    this.emit('rankingsGenerated', { count: rankings.length, direction }); // 调用 emit

    return rankings; // 返回结果
  } // 结束代码块

  /**
   * 获取 Top N 资产
   * Get top N assets
   * @param {Map<string, number>} scores - 得分
   * @param {number} n - 数量
   * @returns {Array<{symbol: string, score: number, rank: number}>}
   */
  getTopN(scores, n) { // 调用 getTopN
    const rankings = this.generateRankings(scores, 'descending'); // 定义常量 rankings
    return rankings.slice(0, n); // 返回结果
  } // 结束代码块

  /**
   * 获取 Bottom N 资产
   * Get bottom N assets
   * @param {Map<string, number>} scores - 得分
   * @param {number} n - 数量
   * @returns {Array<{symbol: string, score: number, rank: number}>}
   */
  getBottomN(scores, n) { // 调用 getBottomN
    const rankings = this.generateRankings(scores, 'ascending'); // 定义常量 rankings
    return rankings.slice(0, n); // 返回结果
  } // 结束代码块

  /**
   * 获取 Top 和 Bottom N (用于多空策略)
   * Get top and bottom N for long-short strategy
   * @param {Map<string, number>} scores - 得分
   * @param {number} topN - 做多数量
   * @param {number} bottomN - 做空数量
   * @returns {{long: Array, short: Array}}
   */
  getTopBottomN(scores, topN, bottomN = topN) { // 调用 getTopBottomN
    const rankings = this.generateRankings(scores, 'descending'); // 定义常量 rankings

    return { // 返回结果
      long: rankings.slice(0, topN), // long
      short: rankings.slice(-bottomN).reverse(), // short
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化因子值
   * @private
   */
  _normalizeFactors(factorValues, symbols) { // 调用 _normalizeFactors
    const normalized = new Map(); // 定义常量 normalized

    for (const [factorName, values] of factorValues) { // 循环 const [factorName, values] of factorValues
      const normValues = this._normalizeValues(values, symbols); // 定义常量 normValues
      normalized.set(factorName, normValues); // 调用 normalized.set
    } // 结束代码块

    return normalized; // 返回结果
  } // 结束代码块

  /**
   * 标准化单个因子的值
   * @private
   */
  _normalizeValues(values, symbols) { // 调用 _normalizeValues
    const method = this.normalizationMethod; // 定义常量 method

    // 收集有效值 / Collect valid values
    const validEntries = []; // 定义常量 validEntries
    for (const symbol of symbols) { // 循环 const symbol of symbols
      const value = values.get(symbol); // 定义常量 value
      if (value !== null && value !== undefined && !isNaN(value)) { // 条件判断 value !== null && value !== undefined && !isN...
        validEntries.push([symbol, value]); // 调用 validEntries.push
      } // 结束代码块
    } // 结束代码块

    if (validEntries.length === 0) { // 条件判断 validEntries.length === 0
      return new Map(symbols.map(s => [s, null])); // 返回结果
    } // 结束代码块

    const validValues = validEntries.map(([, v]) => v); // 定义函数 validValues
    let normalized; // 定义变量 normalized

    switch (method) { // 分支选择 method
      case NORMALIZATION_METHOD.ZSCORE: // 分支 NORMALIZATION_METHOD.ZSCORE
        normalized = this._normalizeZScore(validEntries, validValues); // 赋值 normalized
        break; // 跳出循环或分支

      case NORMALIZATION_METHOD.MIN_MAX: // 分支 NORMALIZATION_METHOD.MIN_MAX
        normalized = this._normalizeMinMax(validEntries, validValues); // 赋值 normalized
        break; // 跳出循环或分支

      case NORMALIZATION_METHOD.PERCENTILE: // 分支 NORMALIZATION_METHOD.PERCENTILE
        normalized = this._normalizePercentile(validEntries, validValues); // 赋值 normalized
        break; // 跳出循环或分支

      case NORMALIZATION_METHOD.RANK: // 分支 NORMALIZATION_METHOD.RANK
        normalized = this._normalizeRank(validEntries); // 赋值 normalized
        break; // 跳出循环或分支

      case NORMALIZATION_METHOD.ROBUST: // 分支 NORMALIZATION_METHOD.ROBUST
        normalized = this._normalizeRobust(validEntries, validValues); // 赋值 normalized
        break; // 跳出循环或分支

      case NORMALIZATION_METHOD.NONE: // 分支 NORMALIZATION_METHOD.NONE
      default: // 默认
        normalized = new Map(validEntries); // 赋值 normalized
    } // 结束代码块

    // 填充缺失值 / Fill missing values
    const result = new Map(); // 定义常量 result
    for (const symbol of symbols) { // 循环 const symbol of symbols
      result.set(symbol, normalized.get(symbol) ?? null); // 调用 result.set
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * Z-Score 标准化
   * @private
   */
  _normalizeZScore(entries, values) { // 调用 _normalizeZScore
    const mean = values.reduce((a, b) => a + b, 0) / values.length; // 定义函数 mean
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std

    const normalized = new Map(); // 定义常量 normalized
    if (std === 0) { // 条件判断 std === 0
      entries.forEach(([symbol]) => normalized.set(symbol, 0)); // 调用 entries.forEach
    } else { // 执行语句
      entries.forEach(([symbol, value]) => { // 调用 entries.forEach
        normalized.set(symbol, (value - mean) / std); // 调用 normalized.set
      }); // 结束代码块
    } // 结束代码块

    return normalized; // 返回结果
  } // 结束代码块

  /**
   * Min-Max 标准化
   * @private
   */
  _normalizeMinMax(entries, values) { // 调用 _normalizeMinMax
    const min = Math.min(...values); // 定义常量 min
    const max = Math.max(...values); // 定义常量 max
    const range = max - min; // 定义常量 range

    const normalized = new Map(); // 定义常量 normalized
    if (range === 0) { // 条件判断 range === 0
      entries.forEach(([symbol]) => normalized.set(symbol, 0.5)); // 调用 entries.forEach
    } else { // 执行语句
      entries.forEach(([symbol, value]) => { // 调用 entries.forEach
        normalized.set(symbol, (value - min) / range); // 调用 normalized.set
      }); // 结束代码块
    } // 结束代码块

    return normalized; // 返回结果
  } // 结束代码块

  /**
   * 百分位标准化
   * @private
   */
  _normalizePercentile(entries, values) { // 调用 _normalizePercentile
    const sorted = [...values].sort((a, b) => a - b); // 定义函数 sorted
    const n = sorted.length; // 定义常量 n

    const normalized = new Map(); // 定义常量 normalized
    entries.forEach(([symbol, value]) => { // 调用 entries.forEach
      let rank = 0; // 定义变量 rank
      for (let i = 0; i < n; i++) { // 循环 let i = 0; i < n; i++
        if (sorted[i] <= value) rank++; // 条件判断 sorted[i] <= value
      } // 结束代码块
      normalized.set(symbol, rank / n); // 调用 normalized.set
    }); // 结束代码块

    return normalized; // 返回结果
  } // 结束代码块

  /**
   * 简单排名标准化
   * @private
   */
  _normalizeRank(entries) { // 调用 _normalizeRank
    const sorted = [...entries].sort((a, b) => a[1] - b[1]); // 定义函数 sorted
    const n = sorted.length; // 定义常量 n

    const normalized = new Map(); // 定义常量 normalized
    sorted.forEach(([symbol], index) => { // 调用 sorted.forEach
      normalized.set(symbol, (index + 1) / n); // 调用 normalized.set
    }); // 结束代码块

    return normalized; // 返回结果
  } // 结束代码块

  /**
   * 稳健标准化 (使用中位数和 IQR)
   * @private
   */
  _normalizeRobust(entries, values) { // 调用 _normalizeRobust
    const sorted = [...values].sort((a, b) => a - b); // 定义函数 sorted
    const n = sorted.length; // 定义常量 n

    // 中位数 / Median
    const median = n % 2 === 0 // 定义常量 median
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 // 执行语句
      : sorted[Math.floor(n / 2)]; // 执行语句

    // IQR / Interquartile Range
    const q1Index = Math.floor(n * 0.25); // 定义常量 q1Index
    const q3Index = Math.floor(n * 0.75); // 定义常量 q3Index
    const q1 = sorted[q1Index]; // 定义常量 q1
    const q3 = sorted[q3Index]; // 定义常量 q3
    const iqr = q3 - q1; // 定义常量 iqr

    const normalized = new Map(); // 定义常量 normalized
    if (iqr === 0) { // 条件判断 iqr === 0
      entries.forEach(([symbol]) => normalized.set(symbol, 0)); // 调用 entries.forEach
    } else { // 执行语句
      entries.forEach(([symbol, value]) => { // 调用 entries.forEach
        normalized.set(symbol, (value - median) / iqr); // 调用 normalized.set
      }); // 结束代码块
    } // 结束代码块

    return normalized; // 返回结果
  } // 结束代码块

  /**
   * 调整因子方向
   * @private
   */
  _adjustForDirections(normalizedFactors) { // 调用 _adjustForDirections
    const adjusted = new Map(); // 定义常量 adjusted

    for (const [factorName, values] of normalizedFactors) { // 循环 const [factorName, values] of normalizedFactors
      const direction = this.factorDirections[factorName] || FACTOR_DIRECTION.POSITIVE; // 定义常量 direction

      if (direction === FACTOR_DIRECTION.NEGATIVE) { // 条件判断 direction === FACTOR_DIRECTION.NEGATIVE
        // 负向因子取反 / Negate negative factors
        const negated = new Map(); // 定义常量 negated
        for (const [symbol, value] of values) { // 循环 const [symbol, value] of values
          negated.set(symbol, value !== null ? -value : null); // 调用 negated.set
        } // 结束代码块
        adjusted.set(factorName, negated); // 调用 adjusted.set
      } else { // 执行语句
        adjusted.set(factorName, values); // 调用 adjusted.set
      } // 结束代码块
    } // 结束代码块

    return adjusted; // 返回结果
  } // 结束代码块

  /**
   * 组合因子得分
   * @private
   */
  _combineFactors(factorValues, symbols) { // 调用 _combineFactors
    const method = this.combinationMethod; // 定义常量 method

    switch (method) { // 分支选择 method
      case COMBINATION_METHOD.WEIGHTED_SUM: // 分支 COMBINATION_METHOD.WEIGHTED_SUM
        return this._combineWeightedSum(factorValues, symbols); // 返回结果

      case COMBINATION_METHOD.WEIGHTED_AVERAGE: // 分支 COMBINATION_METHOD.WEIGHTED_AVERAGE
        return this._combineWeightedAverage(factorValues, symbols); // 返回结果

      case COMBINATION_METHOD.RANK_AVERAGE: // 分支 COMBINATION_METHOD.RANK_AVERAGE
        return this._combineRankAverage(factorValues, symbols); // 返回结果

      case COMBINATION_METHOD.EQUAL: // 分支 COMBINATION_METHOD.EQUAL
        return this._combineEqual(factorValues, symbols); // 返回结果

      case COMBINATION_METHOD.IC_WEIGHTED: // 分支 COMBINATION_METHOD.IC_WEIGHTED
        return this._combineICWeighted(factorValues, symbols); // 返回结果

      default: // 默认
        return this._combineWeightedSum(factorValues, symbols); // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 加权求和
   * @private
   */
  _combineWeightedSum(factorValues, symbols) { // 调用 _combineWeightedSum
    const scores = new Map(); // 定义常量 scores

    for (const symbol of symbols) { // 循环 const symbol of symbols
      let totalScore = 0; // 定义变量 totalScore
      let hasValue = false; // 定义变量 hasValue

      for (const [factorName, values] of factorValues) { // 循环 const [factorName, values] of factorValues
        const value = values.get(symbol); // 定义常量 value
        const weight = this.factorWeights[factorName] || 0; // 定义常量 weight

        if (value !== null && !isNaN(value)) { // 条件判断 value !== null && !isNaN(value)
          totalScore += value * weight; // 执行语句
          hasValue = true; // 赋值 hasValue
        } // 结束代码块
      } // 结束代码块

      scores.set(symbol, hasValue ? totalScore : null); // 调用 scores.set
    } // 结束代码块

    return scores; // 返回结果
  } // 结束代码块

  /**
   * 加权平均
   * @private
   */
  _combineWeightedAverage(factorValues, symbols) { // 调用 _combineWeightedAverage
    const scores = new Map(); // 定义常量 scores

    for (const symbol of symbols) { // 循环 const symbol of symbols
      let totalScore = 0; // 定义变量 totalScore
      let totalWeight = 0; // 定义变量 totalWeight

      for (const [factorName, values] of factorValues) { // 循环 const [factorName, values] of factorValues
        const value = values.get(symbol); // 定义常量 value
        const weight = this.factorWeights[factorName] || 0; // 定义常量 weight

        if (value !== null && !isNaN(value) && weight > 0) { // 条件判断 value !== null && !isNaN(value) && weight > 0
          totalScore += value * weight; // 执行语句
          totalWeight += weight; // 执行语句
        } // 结束代码块
      } // 结束代码块

      scores.set(symbol, totalWeight > 0 ? totalScore / totalWeight : null); // 调用 scores.set
    } // 结束代码块

    return scores; // 返回结果
  } // 结束代码块

  /**
   * 排名平均
   * @private
   */
  _combineRankAverage(factorValues, symbols) { // 调用 _combineRankAverage
    // 先将每个因子转换为排名 / First convert each factor to ranks
    const rankFactors = new Map(); // 定义常量 rankFactors
    for (const [factorName, values] of factorValues) { // 循环 const [factorName, values] of factorValues
      const entries = []; // 定义常量 entries
      for (const [symbol, value] of values) { // 循环 const [symbol, value] of values
        if (value !== null && !isNaN(value)) { // 条件判断 value !== null && !isNaN(value)
          entries.push([symbol, value]); // 调用 entries.push
        } // 结束代码块
      } // 结束代码块

      entries.sort((a, b) => b[1] - a[1]); // 调用 entries.sort
      const ranks = new Map(); // 定义常量 ranks
      entries.forEach(([symbol], index) => { // 调用 entries.forEach
        ranks.set(symbol, index + 1); // 调用 ranks.set
      }); // 结束代码块
      rankFactors.set(factorName, ranks); // 调用 rankFactors.set
    } // 结束代码块

    // 计算平均排名 / Calculate average rank
    const scores = new Map(); // 定义常量 scores
    for (const symbol of symbols) { // 循环 const symbol of symbols
      let totalRank = 0; // 定义变量 totalRank
      let count = 0; // 定义变量 count

      for (const [factorName, ranks] of rankFactors) { // 循环 const [factorName, ranks] of rankFactors
        const rank = ranks.get(symbol); // 定义常量 rank
        const weight = this.factorWeights[factorName] || 1; // 定义常量 weight

        if (rank !== undefined) { // 条件判断 rank !== undefined
          totalRank += rank * weight; // 执行语句
          count += weight; // 执行语句
        } // 结束代码块
      } // 结束代码块

      // 使用负排名作为得分 (低排名 = 高得分)
      scores.set(symbol, count > 0 ? -(totalRank / count) : null); // 调用 scores.set
    } // 结束代码块

    return scores; // 返回结果
  } // 结束代码块

  /**
   * 等权重组合
   * @private
   */
  _combineEqual(factorValues, symbols) { // 调用 _combineEqual
    const n = factorValues.size; // 定义常量 n
    if (n === 0) { // 条件判断 n === 0
      return new Map(symbols.map(s => [s, null])); // 返回结果
    } // 结束代码块

    const scores = new Map(); // 定义常量 scores

    for (const symbol of symbols) { // 循环 const symbol of symbols
      let totalScore = 0; // 定义变量 totalScore
      let count = 0; // 定义变量 count

      for (const [, values] of factorValues) { // 循环 const [, values] of factorValues
        const value = values.get(symbol); // 定义常量 value

        if (value !== null && !isNaN(value)) { // 条件判断 value !== null && !isNaN(value)
          totalScore += value; // 执行语句
          count++; // 执行语句
        } // 结束代码块
      } // 结束代码块

      scores.set(symbol, count > 0 ? totalScore / count : null); // 调用 scores.set
    } // 结束代码块

    return scores; // 返回结果
  } // 结束代码块

  /**
   * IC 加权组合
   * @private
   */
  _combineICWeighted(factorValues, symbols) { // 调用 _combineICWeighted
    // 如果没有 IC 数据，退化为等权重 / Fallback to equal weights if no IC data
    if (this.factorICs.size === 0) { // 条件判断 this.factorICs.size === 0
      return this._combineEqual(factorValues, symbols); // 返回结果
    } // 结束代码块

    // 使用绝对 IC 作为权重 / Use absolute IC as weight
    const icWeights = {}; // 定义常量 icWeights
    for (const [factorName] of factorValues) { // 循环 const [factorName] of factorValues
      const ic = this.factorICs.get(factorName) || 0; // 定义常量 ic
      icWeights[factorName] = Math.abs(ic); // 执行语句
    } // 结束代码块

    // 临时替换权重 / Temporarily replace weights
    const originalWeights = this.factorWeights; // 定义常量 originalWeights
    this.factorWeights = icWeights; // 设置 factorWeights

    const scores = this._combineWeightedAverage(factorValues, symbols); // 定义常量 scores

    // 恢复原权重 / Restore original weights
    this.factorWeights = originalWeights; // 设置 factorWeights

    return scores; // 返回结果
  } // 结束代码块

  /**
   * 更新因子 IC
   * Update factor IC (Information Coefficient)
   * @param {string} factorName - 因子名称
   * @param {number} ic - IC 值
   */
  updateFactorIC(factorName, ic) { // 调用 updateFactorIC
    this.factorICs.set(factorName, ic); // 访问 factorICs
  } // 结束代码块

  /**
   * 获取配置
   * Get configuration
   */
  getConfig() { // 调用 getConfig
    return { // 返回结果
      factorWeights: { ...this.factorWeights }, // factorWeights
      normalizationMethod: this.normalizationMethod, // normalizationMethod
      combinationMethod: this.combinationMethod, // combinationMethod
      adjustForDirection: this.adjustForDirection, // adjust用于Direction
      factorDirections: { ...this.factorDirections }, // factorDirections
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      numFactors: Object.keys(this.factorWeights).length, // numFactors
      totalWeight: Object.values(this.factorWeights).reduce((a, b) => a + b, 0), // 总Weight
      lastScoresCount: this.lastScores?.size || 0, // lastScores数量
      lastRankingsCount: this.lastRankings?.length || 0, // lastRankings数量
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 创建预配置的组合器
 * Create pre-configured combiner
 */

// 默认多因子组合器
export function createDefaultCombiner(factorWeights = {}) { // 导出函数 createDefaultCombiner
  return new FactorCombiner({ // 返回结果
    factorWeights, // 执行语句
    normalizationMethod: NORMALIZATION_METHOD.ZSCORE, // normalizationMethod
    combinationMethod: COMBINATION_METHOD.WEIGHTED_AVERAGE, // combinationMethod
    adjustForDirection: true, // adjust用于Direction
  }); // 结束代码块
} // 结束代码块

// 等权重组合器
export function createEqualWeightCombiner() { // 导出函数 createEqualWeightCombiner
  return new FactorCombiner({ // 返回结果
    normalizationMethod: NORMALIZATION_METHOD.PERCENTILE, // normalizationMethod
    combinationMethod: COMBINATION_METHOD.EQUAL, // combinationMethod
    adjustForDirection: true, // adjust用于Direction
  }); // 结束代码块
} // 结束代码块

// 排名组合器
export function createRankCombiner(factorWeights = {}) { // 导出函数 createRankCombiner
  return new FactorCombiner({ // 返回结果
    factorWeights, // 执行语句
    normalizationMethod: NORMALIZATION_METHOD.RANK, // normalizationMethod
    combinationMethod: COMBINATION_METHOD.RANK_AVERAGE, // combinationMethod
    adjustForDirection: true, // adjust用于Direction
  }); // 结束代码块
} // 结束代码块

export default FactorCombiner; // 默认导出
