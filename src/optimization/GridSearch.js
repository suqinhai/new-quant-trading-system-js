/**
 * 参数网格搜索
 * Parameter Grid Search
 *
 * 系统性地遍历参数空间，找到最优参数组合
 * Systematically explores parameter space to find optimal parameter combinations
 *
 * @module src/optimization/GridSearch
 */

import EventEmitter from 'eventemitter3';
import { BacktestEngine } from '../backtest/BacktestEngine.js';

/**
 * 优化目标枚举
 * Optimization Target Enum
 */
export const OptimizationTarget = {
  TOTAL_RETURN: 'totalReturn',           // 总收益率
  ANNUAL_RETURN: 'annualReturn',         // 年化收益率
  SHARPE_RATIO: 'sharpeRatio',           // 夏普比率
  CALMAR_RATIO: 'calmarRatio',           // Calmar比率
  PROFIT_FACTOR: 'profitFactor',         // 盈亏比
  WIN_RATE: 'winRate',                   // 胜率
  MAX_DRAWDOWN: 'maxDrawdownPercent',    // 最大回撤（取反）
  CUSTOM: 'custom',                      // 自定义
};

/**
 * 默认配置
 * Default Configuration
 */
export const DEFAULT_GRID_SEARCH_CONFIG = {
  // 优化目标
  target: OptimizationTarget.SHARPE_RATIO,

  // 是否并行执行 (使用 Worker)
  parallel: false,

  // 最大并行数
  maxWorkers: 4,

  // 是否记录所有结果
  recordAllResults: true,

  // 最小交易次数（过滤无效参数）
  minTrades: 5,

  // 进度回调间隔
  progressInterval: 10,

  // 回测配置
  backtestConfig: {
    initialCapital: 10000,
    commissionRate: 0.001,
    slippage: 0.0005,
  },
};

/**
 * 参数网格搜索类
 * Parameter Grid Search Class
 */
export class GridSearch extends EventEmitter {
  /**
   * 构造函数
   * @param {Object} config - 配置
   */
  constructor(config = {}) {
    super();

    this.config = { ...DEFAULT_GRID_SEARCH_CONFIG, ...config };
    this.results = [];
    this.bestResult = null;
    this.isRunning = false;
    this.progress = { current: 0, total: 0, percent: 0 };
  }

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
  generateCombinations(parameterSpace) {
    const keys = Object.keys(parameterSpace);
    const values = keys.map(key => {
      const param = parameterSpace[key];

      // 范围参数
      if (param.start !== undefined && param.end !== undefined) {
        const result = [];
        const step = param.step || 1;
        for (let v = param.start; v <= param.end; v += step) {
          result.push(Math.round(v * 1000000) / 1000000); // 处理浮点精度
        }
        return result;
      }

      // 列表参数
      if (Array.isArray(param)) {
        return param;
      }

      // 单值参数
      return [param];
    });

    // 笛卡尔积
    const combinations = this._cartesianProduct(values);

    return combinations.map(combo => {
      const params = {};
      keys.forEach((key, i) => {
        params[key] = combo[i];
      });
      return params;
    });
  }

  /**
   * 笛卡尔积
   * Cartesian product
   * @private
   */
  _cartesianProduct(arrays) {
    return arrays.reduce((acc, arr) => {
      if (acc.length === 0) return arr.map(v => [v]);
      return acc.flatMap(combo => arr.map(v => [...combo, v]));
    }, []);
  }

  /**
   * 运行网格搜索
   * Run grid search
   * @param {Object} options - 搜索选项
   * @returns {Promise<Object>} 搜索结果
   */
  async run(options) {
    const {
      data,                    // 历史数据
      strategyClass,           // 策略类
      parameterSpace,          // 参数空间
      fixedParams = {},        // 固定参数
      customScorer = null,     // 自定义评分函数
    } = options;

    // 验证输入
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('必须提供有效的历史数据 / Valid historical data required');
    }
    if (!strategyClass) {
      throw new Error('必须提供策略类 / Strategy class required');
    }
    if (!parameterSpace || Object.keys(parameterSpace).length === 0) {
      throw new Error('必须提供参数空间 / Parameter space required');
    }

    // 生成参数组合
    const combinations = this.generateCombinations(parameterSpace);
    console.log(`[GridSearch] 生成 ${combinations.length} 个参数组合 / Generated ${combinations.length} parameter combinations`);

    // 初始化状态
    this.results = [];
    this.bestResult = null;
    this.isRunning = true;
    this.progress = { current: 0, total: combinations.length, percent: 0 };

    this.emit('start', { totalCombinations: combinations.length });

    const startTime = Date.now();

    // 遍历所有参数组合
    for (let i = 0; i < combinations.length; i++) {
      const params = combinations[i];

      try {
        // 合并固定参数和当前参数
        const fullParams = { ...fixedParams, ...params };

        // 创建策略实例
        const strategy = new strategyClass(fullParams);

        // 创建回测引擎
        const engine = new BacktestEngine(this.config.backtestConfig);
        engine.loadData([...data]); // 复制数据避免污染
        engine.setStrategy(strategy);

        // 运行回测
        const stats = await engine.run();

        // 计算得分
        const score = this._calculateScore(stats, customScorer);

        // 记录结果
        const result = {
          params,
          stats,
          score,
          isValid: stats.totalTrades >= this.config.minTrades,
        };

        if (this.config.recordAllResults) {
          this.results.push(result);
        }

        // 更新最优结果
        if (result.isValid && (this.bestResult === null || score > this.bestResult.score)) {
          this.bestResult = result;
          this.emit('newBest', result);
        }

      } catch (error) {
        console.error(`[GridSearch] 参数组合 ${i} 执行失败 / Combination ${i} failed:`, error.message);
        this.emit('error', { index: i, params, error });
      }

      // 更新进度
      this.progress.current = i + 1;
      this.progress.percent = ((i + 1) / combinations.length * 100).toFixed(2);

      if ((i + 1) % this.config.progressInterval === 0 || i === combinations.length - 1) {
        this.emit('progress', { ...this.progress });
      }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // 按得分排序结果
    if (this.config.recordAllResults) {
      this.results.sort((a, b) => b.score - a.score);
    }

    this.isRunning = false;

    // 构建最终结果
    const finalResult = {
      bestParams: this.bestResult?.params || null,
      bestStats: this.bestResult?.stats || null,
      bestScore: this.bestResult?.score || null,
      totalCombinations: combinations.length,
      validCombinations: this.results.filter(r => r.isValid).length,
      duration,
      allResults: this.config.recordAllResults ? this.results : null,
      topResults: this._getTopResults(10),
      parameterSensitivity: this._analyzeParameterSensitivity(),
    };

    this.emit('complete', finalResult);

    console.log(`[GridSearch] 搜索完成，耗时 ${duration.toFixed(2)}s / Search completed in ${duration.toFixed(2)}s`);
    console.log(`[GridSearch] 最优参数 / Best params:`, this.bestResult?.params);
    console.log(`[GridSearch] 最优得分 / Best score:`, this.bestResult?.score?.toFixed(4));

    return finalResult;
  }

  /**
   * 计算得分
   * Calculate score
   * @private
   */
  _calculateScore(stats, customScorer) {
    if (customScorer && typeof customScorer === 'function') {
      return customScorer(stats);
    }

    const target = this.config.target;

    switch (target) {
      case OptimizationTarget.TOTAL_RETURN:
        return stats.totalReturn || 0;

      case OptimizationTarget.ANNUAL_RETURN:
        return stats.annualReturn || 0;

      case OptimizationTarget.SHARPE_RATIO:
        return stats.sharpeRatio || 0;

      case OptimizationTarget.CALMAR_RATIO:
        return stats.calmarRatio || 0;

      case OptimizationTarget.PROFIT_FACTOR:
        return stats.profitFactor || 0;

      case OptimizationTarget.WIN_RATE:
        return stats.winRate || 0;

      case OptimizationTarget.MAX_DRAWDOWN:
        // 最大回撤越小越好，取反
        return -(stats.maxDrawdownPercent || 100);

      default:
        return stats.sharpeRatio || 0;
    }
  }

  /**
   * 获取前 N 个结果
   * Get top N results
   * @private
   */
  _getTopResults(n) {
    return this.results
      .filter(r => r.isValid)
      .slice(0, n)
      .map(r => ({
        params: r.params,
        score: r.score,
        totalReturn: r.stats.totalReturn,
        sharpeRatio: r.stats.sharpeRatio,
        maxDrawdown: r.stats.maxDrawdownPercent,
        trades: r.stats.totalTrades,
      }));
  }

  /**
   * 分析参数敏感度
   * Analyze parameter sensitivity
   * @private
   */
  _analyzeParameterSensitivity() {
    if (this.results.length < 2) return {};

    const validResults = this.results.filter(r => r.isValid);
    if (validResults.length < 2) return {};

    const sensitivity = {};
    const paramKeys = Object.keys(validResults[0].params);

    for (const key of paramKeys) {
      // 按该参数分组
      const groups = new Map();
      for (const result of validResults) {
        const value = result.params[key];
        if (!groups.has(value)) {
          groups.set(value, []);
        }
        groups.get(value).push(result.score);
      }

      // 计算每个参数值的平均得分
      const avgScores = [];
      for (const [value, scores] of groups) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        avgScores.push({ value, avgScore: avg, count: scores.length });
      }

      // 计算得分的标准差作为敏感度指标
      if (avgScores.length > 1) {
        const allAvgs = avgScores.map(a => a.avgScore);
        const mean = allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length;
        const variance = allAvgs.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allAvgs.length;
        const stdDev = Math.sqrt(variance);

        sensitivity[key] = {
          stdDev,
          valueScores: avgScores.sort((a, b) => b.avgScore - a.avgScore),
          bestValue: avgScores[0]?.value,
        };
      }
    }

    // 按敏感度排序
    const sortedKeys = Object.keys(sensitivity)
      .sort((a, b) => sensitivity[b].stdDev - sensitivity[a].stdDev);

    const sortedSensitivity = {};
    for (const key of sortedKeys) {
      sortedSensitivity[key] = sensitivity[key];
    }

    return sortedSensitivity;
  }

  /**
   * 获取热力图数据（用于可视化）
   * Get heatmap data for visualization
   * @param {string} param1 - 第一个参数名
   * @param {string} param2 - 第二个参数名
   * @returns {Object} 热力图数据
   */
  getHeatmapData(param1, param2) {
    if (this.results.length === 0) return null;

    const heatmap = new Map();
    const param1Values = new Set();
    const param2Values = new Set();

    for (const result of this.results) {
      if (!result.isValid) continue;

      const v1 = result.params[param1];
      const v2 = result.params[param2];
      const key = `${v1}_${v2}`;

      param1Values.add(v1);
      param2Values.add(v2);

      if (!heatmap.has(key)) {
        heatmap.set(key, { scores: [], count: 0 });
      }
      heatmap.get(key).scores.push(result.score);
      heatmap.get(key).count++;
    }

    // 转换为数组格式
    const data = [];
    for (const [key, value] of heatmap) {
      const [v1, v2] = key.split('_');
      const avgScore = value.scores.reduce((a, b) => a + b, 0) / value.scores.length;
      data.push({
        [param1]: parseFloat(v1),
        [param2]: parseFloat(v2),
        score: avgScore,
        count: value.count,
      });
    }

    return {
      param1,
      param2,
      param1Values: Array.from(param1Values).sort((a, b) => a - b),
      param2Values: Array.from(param2Values).sort((a, b) => a - b),
      data,
    };
  }

  /**
   * 停止搜索
   * Stop search
   */
  stop() {
    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * 获取当前进度
   * Get current progress
   */
  getProgress() {
    return { ...this.progress };
  }

  /**
   * 获取最优结果
   * Get best result
   */
  getBestResult() {
    return this.bestResult;
  }

  /**
   * 获取所有结果
   * Get all results
   */
  getAllResults() {
    return [...this.results];
  }
}

export default GridSearch;
