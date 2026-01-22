/**
 * 因子注册表
 * Factor Registry
 *
 * 管理所有 Alpha 因子的注册、获取和生命周期
 * Manages registration, retrieval and lifecycle of all Alpha factors
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import { FACTOR_CATEGORY } from './BaseFactor.js'; // 导入模块 ./BaseFactor.js

/**
 * 因子注册表类
 * Factor Registry Class
 */
export class FactorRegistry extends EventEmitter { // 导出类 FactorRegistry
  constructor() { // 构造函数
    super(); // 调用父类

    // 因子存储 (name -> factor instance) / Factor storage
    this.factors = new Map(); // 设置 factors

    // 类别索引 (category -> Set<name>) / Category index
    this.categoryIndex = new Map(); // 设置 categoryIndex

    // 依赖图 (name -> Set<dependency names>) / Dependency graph
    this.dependencies = new Map(); // 设置 dependencies

    // 初始化类别索引 / Initialize category index
    Object.values(FACTOR_CATEGORY).forEach(cat => { // 调用 Object.values
      this.categoryIndex.set(cat, new Set()); // 访问 categoryIndex
    }); // 结束代码块
  } // 结束代码块

  /**
   * 注册因子
   * Register a factor
   * @param {BaseFactor} factor - 因子实例
   * @param {Object} options - 选项
   * @param {string[]} options.dependencies - 依赖的其他因子名称
   * @returns {FactorRegistry} this (链式调用)
   */
  register(factor, options = {}) { // 调用 register
    const name = factor.name; // 定义常量 name

    if (this.factors.has(name)) { // 条件判断 this.factors.has(name)
      this.emit('warning', { message: `因子 ${name} 已存在，将被覆盖`, factor: name }); // 调用 emit
    } // 结束代码块

    // 存储因子 / Store factor
    this.factors.set(name, factor); // 访问 factors

    // 更新类别索引 / Update category index
    const category = factor.category || FACTOR_CATEGORY.TECHNICAL; // 定义常量 category
    if (!this.categoryIndex.has(category)) { // 条件判断 !this.categoryIndex.has(category)
      this.categoryIndex.set(category, new Set()); // 访问 categoryIndex
    } // 结束代码块
    this.categoryIndex.get(category).add(name); // 访问 categoryIndex

    // 记录依赖 / Record dependencies
    if (options.dependencies && options.dependencies.length > 0) { // 条件判断 options.dependencies && options.dependencies....
      this.dependencies.set(name, new Set(options.dependencies)); // 访问 dependencies
    } // 结束代码块

    this.emit('registered', { name, category, factor }); // 调用 emit
    return this; // 返回结果
  } // 结束代码块

  /**
   * 批量注册因子
   * Register multiple factors
   * @param {Array<{factor: BaseFactor, options?: Object}>} factorsWithOptions
   * @returns {FactorRegistry} this
   */
  registerAll(factorsWithOptions) { // 调用 registerAll
    for (const { factor, options } of factorsWithOptions) { // 循环 const { factor, options } of factorsWithOptions
      this.register(factor, options || {}); // 调用 register
    } // 结束代码块
    return this; // 返回结果
  } // 结束代码块

  /**
   * 注销因子
   * Unregister a factor
   * @param {string} name - 因子名称
   * @returns {boolean} 是否成功
   */
  unregister(name) { // 调用 unregister
    const factor = this.factors.get(name); // 定义常量 factor
    if (!factor) return false; // 条件判断 !factor

    // 从存储移除 / Remove from storage
    this.factors.delete(name); // 访问 factors

    // 从类别索引移除 / Remove from category index
    const category = factor.category; // 定义常量 category
    if (this.categoryIndex.has(category)) { // 条件判断 this.categoryIndex.has(category)
      this.categoryIndex.get(category).delete(name); // 访问 categoryIndex
    } // 结束代码块

    // 移除依赖 / Remove dependencies
    this.dependencies.delete(name); // 访问 dependencies

    // 从其他因子的依赖中移除 / Remove from other factors' dependencies
    for (const [, deps] of this.dependencies) { // 循环 const [, deps] of this.dependencies
      deps.delete(name); // 调用 deps.delete
    } // 结束代码块

    this.emit('unregistered', { name }); // 调用 emit
    return true; // 返回结果
  } // 结束代码块

  /**
   * 获取因子
   * Get a factor
   * @param {string} name - 因子名称
   * @returns {BaseFactor|null} 因子实例
   */
  get(name) { // 调用 get
    return this.factors.get(name) || null; // 返回结果
  } // 结束代码块

  /**
   * 检查因子是否存在
   * Check if factor exists
   * @param {string} name - 因子名称
   * @returns {boolean}
   */
  has(name) { // 调用 has
    return this.factors.has(name); // 返回结果
  } // 结束代码块

  /**
   * 获取所有因子
   * Get all factors
   * @returns {Map<string, BaseFactor>}
   */
  getAll() { // 调用 getAll
    return new Map(this.factors); // 返回结果
  } // 结束代码块

  /**
   * 获取所有因子名称
   * Get all factor names
   * @returns {string[]}
   */
  getNames() { // 调用 getNames
    return Array.from(this.factors.keys()); // 返回结果
  } // 结束代码块

  /**
   * 按类别获取因子
   * Get factors by category
   * @param {string} category - 因子类别
   * @returns {BaseFactor[]}
   */
  getByCategory(category) { // 调用 getByCategory
    const names = this.categoryIndex.get(category); // 定义常量 names
    if (!names) return []; // 条件判断 !names

    return Array.from(names) // 返回结果
      .map(name => this.factors.get(name)) // 定义箭头函数
      .filter(f => f !== undefined); // 定义箭头函数
  } // 结束代码块

  /**
   * 获取因子依赖
   * Get factor dependencies
   * @param {string} name - 因子名称
   * @returns {string[]} 依赖的因子名称列表
   */
  getDependencies(name) { // 调用 getDependencies
    const deps = this.dependencies.get(name); // 定义常量 deps
    return deps ? Array.from(deps) : []; // 返回结果
  } // 结束代码块

  /**
   * 获取按依赖排序的因子列表 (拓扑排序)
   * Get factors sorted by dependencies (topological sort)
   * @param {string[]} factorNames - 需要排序的因子名称，默认全部
   * @returns {string[]} 排序后的因子名称
   */
  getSortedByDependencies(factorNames = null) { // 调用 getSortedByDependencies
    const names = factorNames || Array.from(this.factors.keys()); // 定义常量 names
    const visited = new Set(); // 定义常量 visited
    const result = []; // 定义常量 result

    const visit = (name) => { // 定义函数 visit
      if (visited.has(name)) return; // 条件判断 visited.has(name)
      visited.add(name); // 调用 visited.add

      const deps = this.dependencies.get(name); // 定义常量 deps
      if (deps) { // 条件判断 deps
        for (const dep of deps) { // 循环 const dep of deps
          if (names.includes(dep)) { // 条件判断 names.includes(dep)
            visit(dep); // 调用 visit
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      result.push(name); // 调用 result.push
    }; // 结束代码块

    for (const name of names) { // 循环 const name of names
      visit(name); // 调用 visit
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 批量计算因子值
   * Calculate factor values in batch
   * @param {string[]} factorNames - 因子名称列表
   * @param {Object} dataMap - { symbol: data } 数据映射
   * @param {Object} context - 上下文
   * @returns {Promise<Map<string, Map<string, number>>>} { factorName: { symbol: value } }
   */
  async calculateBatch(factorNames, dataMap, context = {}) { // 执行语句
    // 按依赖排序 / Sort by dependencies
    const sortedNames = this.getSortedByDependencies(factorNames); // 定义常量 sortedNames
    const results = new Map(); // 定义常量 results

    // 创建扩展上下文 / Create extended context
    const extendedContext = { ...context, factorValues: results }; // 定义常量 extendedContext

    for (const name of sortedNames) { // 循环 const name of sortedNames
      const factor = this.factors.get(name); // 定义常量 factor
      if (!factor) continue; // 条件判断 !factor

      const values = await factor.calculateBatch(dataMap, extendedContext); // 定义常量 values
      results.set(name, values); // 调用 results.set

      this.emit('factorCalculated', { name, count: values.size }); // 调用 emit
    } // 结束代码块

    return results; // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   * @returns {Object}
   */
  getStats() { // 调用 getStats
    const stats = { // 定义常量 stats
      totalFactors: this.factors.size, // 设置 totalFactors 字段
      byCategory: {}, // 设置 byCategory 字段
      factorStats: {}, // 设置 factorStats 字段
    }; // 结束代码块

    // 按类别统计 / Stats by category
    for (const [category, names] of this.categoryIndex) { // 循环 const [category, names] of this.categoryIndex
      stats.byCategory[category] = names.size; // 执行语句
    } // 结束代码块

    // 各因子统计 / Individual factor stats
    for (const [name, factor] of this.factors) { // 循环 const [name, factor] of this.factors
      stats.factorStats[name] = factor.stats; // 执行语句
    } // 结束代码块

    return stats; // 返回结果
  } // 结束代码块

  /**
   * 获取所有因子信息
   * Get all factors info
   * @returns {Object[]}
   */
  getFactorsInfo() { // 调用 getFactorsInfo
    return Array.from(this.factors.values()).map(f => f.getInfo()); // 返回结果
  } // 结束代码块

  /**
   * 清除所有因子缓存
   * Clear all factor caches
   */
  clearAllCaches() { // 调用 clearAllCaches
    for (const factor of this.factors.values()) { // 循环 const factor of this.factors.values()
      factor.clearCache(); // 调用 factor.clearCache
    } // 结束代码块
    this.emit('cachesCleared'); // 调用 emit
  } // 结束代码块

  /**
   * 重置注册表
   * Reset registry
   */
  reset() { // 调用 reset
    this.factors.clear(); // 访问 factors
    this.dependencies.clear(); // 访问 dependencies

    // 重新初始化类别索引 / Reinitialize category index
    for (const names of this.categoryIndex.values()) { // 循环 const names of this.categoryIndex.values()
      names.clear(); // 调用 names.clear
    } // 结束代码块

    this.emit('reset'); // 调用 emit
  } // 结束代码块
} // 结束代码块

// 创建全局单例 / Create global singleton
let globalRegistry = null; // 定义变量 globalRegistry

/**
 * 获取全局因子注册表
 * Get global factor registry
 * @returns {FactorRegistry}
 */
export function getGlobalRegistry() { // 导出函数 getGlobalRegistry
  if (!globalRegistry) { // 条件判断 !globalRegistry
    globalRegistry = new FactorRegistry(); // 赋值 globalRegistry
  } // 结束代码块
  return globalRegistry; // 返回结果
} // 结束代码块

/**
 * 重置全局注册表
 * Reset global registry
 */
export function resetGlobalRegistry() { // 导出函数 resetGlobalRegistry
  if (globalRegistry) { // 条件判断 globalRegistry
    globalRegistry.reset(); // 调用 globalRegistry.reset
  } // 结束代码块
  globalRegistry = null; // 赋值 globalRegistry
} // 结束代码块

export default FactorRegistry; // 默认导出
