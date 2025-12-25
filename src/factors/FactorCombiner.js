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

import EventEmitter from 'eventemitter3';
import { FACTOR_DIRECTION } from './BaseFactor.js';

/**
 * 标准化方法
 * Normalization Methods
 */
export const NORMALIZATION_METHOD = {
  ZSCORE: 'zscore',               // Z-Score 标准化
  MIN_MAX: 'min_max',             // Min-Max 归一化 (0-1)
  PERCENTILE: 'percentile',       // 百分位排名 (0-1)
  RANK: 'rank',                   // 简单排名
  ROBUST: 'robust',               // 稳健标准化 (使用中位数和IQR)
  NONE: 'none',                   // 不标准化
};

/**
 * 组合方法
 * Combination Methods
 */
export const COMBINATION_METHOD = {
  WEIGHTED_SUM: 'weighted_sum',       // 加权求和
  WEIGHTED_AVERAGE: 'weighted_avg',   // 加权平均
  RANK_AVERAGE: 'rank_avg',           // 排名平均
  IC_WEIGHTED: 'ic_weighted',         // IC 加权 (基于历史预测能力)
  EQUAL: 'equal',                     // 等权重
};

/**
 * 因子组合器类
 * Factor Combiner Class
 */
export class FactorCombiner extends EventEmitter {
  /**
   * @param {Object} config - 配置
   * @param {Object} config.factorWeights - 因子权重 { factorName: weight }
   * @param {string} config.normalizationMethod - 标准化方法
   * @param {string} config.combinationMethod - 组合方法
   * @param {boolean} config.adjustForDirection - 是否根据因子方向调整
   */
  constructor(config = {}) {
    super();

    // 因子权重配置 / Factor weights
    this.factorWeights = config.factorWeights || {};

    // 标准化和组合方法 / Normalization and combination methods
    this.normalizationMethod = config.normalizationMethod || NORMALIZATION_METHOD.ZSCORE;
    this.combinationMethod = config.combinationMethod || COMBINATION_METHOD.WEIGHTED_SUM;

    // 是否根据因子方向调整 / Adjust for factor direction
    this.adjustForDirection = config.adjustForDirection !== false;

    // 因子方向缓存 / Factor direction cache
    this.factorDirections = config.factorDirections || {};

    // 历史 IC 缓存 (用于 IC 加权) / Historical IC cache
    this.factorICs = new Map();

    // 结果缓存 / Result cache
    this.lastScores = null;
    this.lastRankings = null;
  }

  /**
   * 设置因子权重
   * Set factor weights
   * @param {Object} weights - { factorName: weight }
   */
  setWeights(weights) {
    this.factorWeights = { ...this.factorWeights, ...weights };
    this.emit('weightsUpdated', this.factorWeights);
  }

  /**
   * 设置因子方向
   * Set factor directions
   * @param {Object} directions - { factorName: 'positive'|'negative' }
   */
  setDirections(directions) {
    this.factorDirections = { ...this.factorDirections, ...directions };
  }

  /**
   * 计算综合得分
   * Calculate composite scores
   * @param {Map<string, Map<string, number>>} factorValues - { factorName: { symbol: value } }
   * @param {string[]} symbols - 资产列表
   * @returns {Map<string, number>} { symbol: score }
   */
  calculateScores(factorValues, symbols) {
    // 1. 标准化各因子 / Normalize each factor
    const normalizedFactors = this._normalizeFactors(factorValues, symbols);

    // 2. 调整因子方向 / Adjust for factor direction
    const adjustedFactors = this.adjustForDirection
      ? this._adjustForDirections(normalizedFactors)
      : normalizedFactors;

    // 3. 组合因子得分 / Combine factor scores
    const scores = this._combineFactors(adjustedFactors, symbols);

    this.lastScores = scores;
    this.emit('scoresCalculated', { scores, symbols: symbols.length });

    return scores;
  }

  /**
   * 生成排名
   * Generate rankings
   * @param {Map<string, number>} scores - { symbol: score }
   * @param {string} direction - 'descending' (高分优先) 或 'ascending' (低分优先)
   * @returns {Array<{symbol: string, score: number, rank: number}>}
   */
  generateRankings(scores, direction = 'descending') {
    const entries = Array.from(scores.entries())
      .filter(([, score]) => score !== null && !isNaN(score));

    // 排序 / Sort
    if (direction === 'descending') {
      entries.sort((a, b) => b[1] - a[1]);
    } else {
      entries.sort((a, b) => a[1] - b[1]);
    }

    // 生成排名结果 / Generate ranking results
    const rankings = entries.map(([symbol, score], index) => ({
      symbol,
      score,
      rank: index + 1,
      percentile: ((entries.length - index) / entries.length) * 100,
    }));

    this.lastRankings = rankings;
    this.emit('rankingsGenerated', { count: rankings.length, direction });

    return rankings;
  }

  /**
   * 获取 Top N 资产
   * Get top N assets
   * @param {Map<string, number>} scores - 得分
   * @param {number} n - 数量
   * @returns {Array<{symbol: string, score: number, rank: number}>}
   */
  getTopN(scores, n) {
    const rankings = this.generateRankings(scores, 'descending');
    return rankings.slice(0, n);
  }

  /**
   * 获取 Bottom N 资产
   * Get bottom N assets
   * @param {Map<string, number>} scores - 得分
   * @param {number} n - 数量
   * @returns {Array<{symbol: string, score: number, rank: number}>}
   */
  getBottomN(scores, n) {
    const rankings = this.generateRankings(scores, 'ascending');
    return rankings.slice(0, n);
  }

  /**
   * 获取 Top 和 Bottom N (用于多空策略)
   * Get top and bottom N for long-short strategy
   * @param {Map<string, number>} scores - 得分
   * @param {number} topN - 做多数量
   * @param {number} bottomN - 做空数量
   * @returns {{long: Array, short: Array}}
   */
  getTopBottomN(scores, topN, bottomN = topN) {
    const rankings = this.generateRankings(scores, 'descending');

    return {
      long: rankings.slice(0, topN),
      short: rankings.slice(-bottomN).reverse(),
    };
  }

  /**
   * 标准化因子值
   * @private
   */
  _normalizeFactors(factorValues, symbols) {
    const normalized = new Map();

    for (const [factorName, values] of factorValues) {
      const normValues = this._normalizeValues(values, symbols);
      normalized.set(factorName, normValues);
    }

    return normalized;
  }

  /**
   * 标准化单个因子的值
   * @private
   */
  _normalizeValues(values, symbols) {
    const method = this.normalizationMethod;

    // 收集有效值 / Collect valid values
    const validEntries = [];
    for (const symbol of symbols) {
      const value = values.get(symbol);
      if (value !== null && value !== undefined && !isNaN(value)) {
        validEntries.push([symbol, value]);
      }
    }

    if (validEntries.length === 0) {
      return new Map(symbols.map(s => [s, null]));
    }

    const validValues = validEntries.map(([, v]) => v);
    let normalized;

    switch (method) {
      case NORMALIZATION_METHOD.ZSCORE:
        normalized = this._normalizeZScore(validEntries, validValues);
        break;

      case NORMALIZATION_METHOD.MIN_MAX:
        normalized = this._normalizeMinMax(validEntries, validValues);
        break;

      case NORMALIZATION_METHOD.PERCENTILE:
        normalized = this._normalizePercentile(validEntries, validValues);
        break;

      case NORMALIZATION_METHOD.RANK:
        normalized = this._normalizeRank(validEntries);
        break;

      case NORMALIZATION_METHOD.ROBUST:
        normalized = this._normalizeRobust(validEntries, validValues);
        break;

      case NORMALIZATION_METHOD.NONE:
      default:
        normalized = new Map(validEntries);
    }

    // 填充缺失值 / Fill missing values
    const result = new Map();
    for (const symbol of symbols) {
      result.set(symbol, normalized.get(symbol) ?? null);
    }

    return result;
  }

  /**
   * Z-Score 标准化
   * @private
   */
  _normalizeZScore(entries, values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    const normalized = new Map();
    if (std === 0) {
      entries.forEach(([symbol]) => normalized.set(symbol, 0));
    } else {
      entries.forEach(([symbol, value]) => {
        normalized.set(symbol, (value - mean) / std);
      });
    }

    return normalized;
  }

  /**
   * Min-Max 标准化
   * @private
   */
  _normalizeMinMax(entries, values) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    const normalized = new Map();
    if (range === 0) {
      entries.forEach(([symbol]) => normalized.set(symbol, 0.5));
    } else {
      entries.forEach(([symbol, value]) => {
        normalized.set(symbol, (value - min) / range);
      });
    }

    return normalized;
  }

  /**
   * 百分位标准化
   * @private
   */
  _normalizePercentile(entries, values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    const normalized = new Map();
    entries.forEach(([symbol, value]) => {
      let rank = 0;
      for (let i = 0; i < n; i++) {
        if (sorted[i] <= value) rank++;
      }
      normalized.set(symbol, rank / n);
    });

    return normalized;
  }

  /**
   * 简单排名标准化
   * @private
   */
  _normalizeRank(entries) {
    const sorted = [...entries].sort((a, b) => a[1] - b[1]);
    const n = sorted.length;

    const normalized = new Map();
    sorted.forEach(([symbol], index) => {
      normalized.set(symbol, (index + 1) / n);
    });

    return normalized;
  }

  /**
   * 稳健标准化 (使用中位数和 IQR)
   * @private
   */
  _normalizeRobust(entries, values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    // 中位数 / Median
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    // IQR / Interquartile Range
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const normalized = new Map();
    if (iqr === 0) {
      entries.forEach(([symbol]) => normalized.set(symbol, 0));
    } else {
      entries.forEach(([symbol, value]) => {
        normalized.set(symbol, (value - median) / iqr);
      });
    }

    return normalized;
  }

  /**
   * 调整因子方向
   * @private
   */
  _adjustForDirections(normalizedFactors) {
    const adjusted = new Map();

    for (const [factorName, values] of normalizedFactors) {
      const direction = this.factorDirections[factorName] || FACTOR_DIRECTION.POSITIVE;

      if (direction === FACTOR_DIRECTION.NEGATIVE) {
        // 负向因子取反 / Negate negative factors
        const negated = new Map();
        for (const [symbol, value] of values) {
          negated.set(symbol, value !== null ? -value : null);
        }
        adjusted.set(factorName, negated);
      } else {
        adjusted.set(factorName, values);
      }
    }

    return adjusted;
  }

  /**
   * 组合因子得分
   * @private
   */
  _combineFactors(factorValues, symbols) {
    const method = this.combinationMethod;

    switch (method) {
      case COMBINATION_METHOD.WEIGHTED_SUM:
        return this._combineWeightedSum(factorValues, symbols);

      case COMBINATION_METHOD.WEIGHTED_AVERAGE:
        return this._combineWeightedAverage(factorValues, symbols);

      case COMBINATION_METHOD.RANK_AVERAGE:
        return this._combineRankAverage(factorValues, symbols);

      case COMBINATION_METHOD.EQUAL:
        return this._combineEqual(factorValues, symbols);

      case COMBINATION_METHOD.IC_WEIGHTED:
        return this._combineICWeighted(factorValues, symbols);

      default:
        return this._combineWeightedSum(factorValues, symbols);
    }
  }

  /**
   * 加权求和
   * @private
   */
  _combineWeightedSum(factorValues, symbols) {
    const scores = new Map();

    for (const symbol of symbols) {
      let totalScore = 0;
      let hasValue = false;

      for (const [factorName, values] of factorValues) {
        const value = values.get(symbol);
        const weight = this.factorWeights[factorName] || 0;

        if (value !== null && !isNaN(value)) {
          totalScore += value * weight;
          hasValue = true;
        }
      }

      scores.set(symbol, hasValue ? totalScore : null);
    }

    return scores;
  }

  /**
   * 加权平均
   * @private
   */
  _combineWeightedAverage(factorValues, symbols) {
    const scores = new Map();

    for (const symbol of symbols) {
      let totalScore = 0;
      let totalWeight = 0;

      for (const [factorName, values] of factorValues) {
        const value = values.get(symbol);
        const weight = this.factorWeights[factorName] || 0;

        if (value !== null && !isNaN(value) && weight > 0) {
          totalScore += value * weight;
          totalWeight += weight;
        }
      }

      scores.set(symbol, totalWeight > 0 ? totalScore / totalWeight : null);
    }

    return scores;
  }

  /**
   * 排名平均
   * @private
   */
  _combineRankAverage(factorValues, symbols) {
    // 先将每个因子转换为排名 / First convert each factor to ranks
    const rankFactors = new Map();
    for (const [factorName, values] of factorValues) {
      const entries = [];
      for (const [symbol, value] of values) {
        if (value !== null && !isNaN(value)) {
          entries.push([symbol, value]);
        }
      }

      entries.sort((a, b) => b[1] - a[1]);
      const ranks = new Map();
      entries.forEach(([symbol], index) => {
        ranks.set(symbol, index + 1);
      });
      rankFactors.set(factorName, ranks);
    }

    // 计算平均排名 / Calculate average rank
    const scores = new Map();
    for (const symbol of symbols) {
      let totalRank = 0;
      let count = 0;

      for (const [factorName, ranks] of rankFactors) {
        const rank = ranks.get(symbol);
        const weight = this.factorWeights[factorName] || 1;

        if (rank !== undefined) {
          totalRank += rank * weight;
          count += weight;
        }
      }

      // 使用负排名作为得分 (低排名 = 高得分)
      scores.set(symbol, count > 0 ? -(totalRank / count) : null);
    }

    return scores;
  }

  /**
   * 等权重组合
   * @private
   */
  _combineEqual(factorValues, symbols) {
    const n = factorValues.size;
    if (n === 0) {
      return new Map(symbols.map(s => [s, null]));
    }

    const scores = new Map();

    for (const symbol of symbols) {
      let totalScore = 0;
      let count = 0;

      for (const [, values] of factorValues) {
        const value = values.get(symbol);

        if (value !== null && !isNaN(value)) {
          totalScore += value;
          count++;
        }
      }

      scores.set(symbol, count > 0 ? totalScore / count : null);
    }

    return scores;
  }

  /**
   * IC 加权组合
   * @private
   */
  _combineICWeighted(factorValues, symbols) {
    // 如果没有 IC 数据，退化为等权重 / Fallback to equal weights if no IC data
    if (this.factorICs.size === 0) {
      return this._combineEqual(factorValues, symbols);
    }

    // 使用绝对 IC 作为权重 / Use absolute IC as weight
    const icWeights = {};
    for (const [factorName] of factorValues) {
      const ic = this.factorICs.get(factorName) || 0;
      icWeights[factorName] = Math.abs(ic);
    }

    // 临时替换权重 / Temporarily replace weights
    const originalWeights = this.factorWeights;
    this.factorWeights = icWeights;

    const scores = this._combineWeightedAverage(factorValues, symbols);

    // 恢复原权重 / Restore original weights
    this.factorWeights = originalWeights;

    return scores;
  }

  /**
   * 更新因子 IC
   * Update factor IC (Information Coefficient)
   * @param {string} factorName - 因子名称
   * @param {number} ic - IC 值
   */
  updateFactorIC(factorName, ic) {
    this.factorICs.set(factorName, ic);
  }

  /**
   * 获取配置
   * Get configuration
   */
  getConfig() {
    return {
      factorWeights: { ...this.factorWeights },
      normalizationMethod: this.normalizationMethod,
      combinationMethod: this.combinationMethod,
      adjustForDirection: this.adjustForDirection,
      factorDirections: { ...this.factorDirections },
    };
  }

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats() {
    return {
      numFactors: Object.keys(this.factorWeights).length,
      totalWeight: Object.values(this.factorWeights).reduce((a, b) => a + b, 0),
      lastScoresCount: this.lastScores?.size || 0,
      lastRankingsCount: this.lastRankings?.length || 0,
    };
  }
}

/**
 * 创建预配置的组合器
 * Create pre-configured combiner
 */

// 默认多因子组合器
export function createDefaultCombiner(factorWeights = {}) {
  return new FactorCombiner({
    factorWeights,
    normalizationMethod: NORMALIZATION_METHOD.ZSCORE,
    combinationMethod: COMBINATION_METHOD.WEIGHTED_AVERAGE,
    adjustForDirection: true,
  });
}

// 等权重组合器
export function createEqualWeightCombiner() {
  return new FactorCombiner({
    normalizationMethod: NORMALIZATION_METHOD.PERCENTILE,
    combinationMethod: COMBINATION_METHOD.EQUAL,
    adjustForDirection: true,
  });
}

// 排名组合器
export function createRankCombiner(factorWeights = {}) {
  return new FactorCombiner({
    factorWeights,
    normalizationMethod: NORMALIZATION_METHOD.RANK,
    combinationMethod: COMBINATION_METHOD.RANK_AVERAGE,
    adjustForDirection: true,
  });
}

export default FactorCombiner;
