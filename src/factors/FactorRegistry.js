/**
 * 因子注册表
 * Factor Registry
 *
 * 管理所有 Alpha 因子的注册、获取和生命周期
 * Manages registration, retrieval and lifecycle of all Alpha factors
 */

import EventEmitter from 'eventemitter3';
import { FACTOR_CATEGORY } from './BaseFactor.js';

/**
 * 因子注册表类
 * Factor Registry Class
 */
export class FactorRegistry extends EventEmitter {
  constructor() {
    super();

    // 因子存储 (name -> factor instance) / Factor storage
    this.factors = new Map();

    // 类别索引 (category -> Set<name>) / Category index
    this.categoryIndex = new Map();

    // 依赖图 (name -> Set<dependency names>) / Dependency graph
    this.dependencies = new Map();

    // 初始化类别索引 / Initialize category index
    Object.values(FACTOR_CATEGORY).forEach(cat => {
      this.categoryIndex.set(cat, new Set());
    });
  }

  /**
   * 注册因子
   * Register a factor
   * @param {BaseFactor} factor - 因子实例
   * @param {Object} options - 选项
   * @param {string[]} options.dependencies - 依赖的其他因子名称
   * @returns {FactorRegistry} this (链式调用)
   */
  register(factor, options = {}) {
    const name = factor.name;

    if (this.factors.has(name)) {
      this.emit('warning', { message: `因子 ${name} 已存在，将被覆盖`, factor: name });
    }

    // 存储因子 / Store factor
    this.factors.set(name, factor);

    // 更新类别索引 / Update category index
    const category = factor.category || FACTOR_CATEGORY.TECHNICAL;
    if (!this.categoryIndex.has(category)) {
      this.categoryIndex.set(category, new Set());
    }
    this.categoryIndex.get(category).add(name);

    // 记录依赖 / Record dependencies
    if (options.dependencies && options.dependencies.length > 0) {
      this.dependencies.set(name, new Set(options.dependencies));
    }

    this.emit('registered', { name, category, factor });
    return this;
  }

  /**
   * 批量注册因子
   * Register multiple factors
   * @param {Array<{factor: BaseFactor, options?: Object}>} factorsWithOptions
   * @returns {FactorRegistry} this
   */
  registerAll(factorsWithOptions) {
    for (const { factor, options } of factorsWithOptions) {
      this.register(factor, options || {});
    }
    return this;
  }

  /**
   * 注销因子
   * Unregister a factor
   * @param {string} name - 因子名称
   * @returns {boolean} 是否成功
   */
  unregister(name) {
    const factor = this.factors.get(name);
    if (!factor) return false;

    // 从存储移除 / Remove from storage
    this.factors.delete(name);

    // 从类别索引移除 / Remove from category index
    const category = factor.category;
    if (this.categoryIndex.has(category)) {
      this.categoryIndex.get(category).delete(name);
    }

    // 移除依赖 / Remove dependencies
    this.dependencies.delete(name);

    // 从其他因子的依赖中移除 / Remove from other factors' dependencies
    for (const [, deps] of this.dependencies) {
      deps.delete(name);
    }

    this.emit('unregistered', { name });
    return true;
  }

  /**
   * 获取因子
   * Get a factor
   * @param {string} name - 因子名称
   * @returns {BaseFactor|null} 因子实例
   */
  get(name) {
    return this.factors.get(name) || null;
  }

  /**
   * 检查因子是否存在
   * Check if factor exists
   * @param {string} name - 因子名称
   * @returns {boolean}
   */
  has(name) {
    return this.factors.has(name);
  }

  /**
   * 获取所有因子
   * Get all factors
   * @returns {Map<string, BaseFactor>}
   */
  getAll() {
    return new Map(this.factors);
  }

  /**
   * 获取所有因子名称
   * Get all factor names
   * @returns {string[]}
   */
  getNames() {
    return Array.from(this.factors.keys());
  }

  /**
   * 按类别获取因子
   * Get factors by category
   * @param {string} category - 因子类别
   * @returns {BaseFactor[]}
   */
  getByCategory(category) {
    const names = this.categoryIndex.get(category);
    if (!names) return [];

    return Array.from(names)
      .map(name => this.factors.get(name))
      .filter(f => f !== undefined);
  }

  /**
   * 获取因子依赖
   * Get factor dependencies
   * @param {string} name - 因子名称
   * @returns {string[]} 依赖的因子名称列表
   */
  getDependencies(name) {
    const deps = this.dependencies.get(name);
    return deps ? Array.from(deps) : [];
  }

  /**
   * 获取按依赖排序的因子列表 (拓扑排序)
   * Get factors sorted by dependencies (topological sort)
   * @param {string[]} factorNames - 需要排序的因子名称，默认全部
   * @returns {string[]} 排序后的因子名称
   */
  getSortedByDependencies(factorNames = null) {
    const names = factorNames || Array.from(this.factors.keys());
    const visited = new Set();
    const result = [];

    const visit = (name) => {
      if (visited.has(name)) return;
      visited.add(name);

      const deps = this.dependencies.get(name);
      if (deps) {
        for (const dep of deps) {
          if (names.includes(dep)) {
            visit(dep);
          }
        }
      }

      result.push(name);
    };

    for (const name of names) {
      visit(name);
    }

    return result;
  }

  /**
   * 批量计算因子值
   * Calculate factor values in batch
   * @param {string[]} factorNames - 因子名称列表
   * @param {Object} dataMap - { symbol: data } 数据映射
   * @param {Object} context - 上下文
   * @returns {Promise<Map<string, Map<string, number>>>} { factorName: { symbol: value } }
   */
  async calculateBatch(factorNames, dataMap, context = {}) {
    // 按依赖排序 / Sort by dependencies
    const sortedNames = this.getSortedByDependencies(factorNames);
    const results = new Map();

    // 创建扩展上下文 / Create extended context
    const extendedContext = { ...context, factorValues: results };

    for (const name of sortedNames) {
      const factor = this.factors.get(name);
      if (!factor) continue;

      const values = await factor.calculateBatch(dataMap, extendedContext);
      results.set(name, values);

      this.emit('factorCalculated', { name, count: values.size });
    }

    return results;
  }

  /**
   * 获取统计信息
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    const stats = {
      totalFactors: this.factors.size,
      byCategory: {},
      factorStats: {},
    };

    // 按类别统计 / Stats by category
    for (const [category, names] of this.categoryIndex) {
      stats.byCategory[category] = names.size;
    }

    // 各因子统计 / Individual factor stats
    for (const [name, factor] of this.factors) {
      stats.factorStats[name] = factor.stats;
    }

    return stats;
  }

  /**
   * 获取所有因子信息
   * Get all factors info
   * @returns {Object[]}
   */
  getFactorsInfo() {
    return Array.from(this.factors.values()).map(f => f.getInfo());
  }

  /**
   * 清除所有因子缓存
   * Clear all factor caches
   */
  clearAllCaches() {
    for (const factor of this.factors.values()) {
      factor.clearCache();
    }
    this.emit('cachesCleared');
  }

  /**
   * 重置注册表
   * Reset registry
   */
  reset() {
    this.factors.clear();
    this.dependencies.clear();

    // 重新初始化类别索引 / Reinitialize category index
    for (const names of this.categoryIndex.values()) {
      names.clear();
    }

    this.emit('reset');
  }
}

// 创建全局单例 / Create global singleton
let globalRegistry = null;

/**
 * 获取全局因子注册表
 * Get global factor registry
 * @returns {FactorRegistry}
 */
export function getGlobalRegistry() {
  if (!globalRegistry) {
    globalRegistry = new FactorRegistry();
  }
  return globalRegistry;
}

/**
 * 重置全局注册表
 * Reset global registry
 */
export function resetGlobalRegistry() {
  if (globalRegistry) {
    globalRegistry.reset();
  }
  globalRegistry = null;
}

export default FactorRegistry;
