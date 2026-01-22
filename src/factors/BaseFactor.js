/**
 * Alpha 因子基类
 * Base Alpha Factor Class
 *
 * 所有因子的基础类，定义因子的标准接口
 * Base class for all factors, defines standard interface
 */

import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3

/**
 * 因子类别
 * Factor Categories
 */
export const FACTOR_CATEGORY = { // 导出常量 FACTOR_CATEGORY
  MOMENTUM: 'momentum',           // 动量
  VOLATILITY: 'volatility',       // 波动率
  VOLUME: 'volume',               // 成交量
  MONEY_FLOW: 'money_flow',       // MONEY流
  FUNDING: 'funding',             // 资金费率
  LIQUIDITY: 'liquidity',         // LIQUIDITY
  SENTIMENT: 'sentiment',         // SENTIMENT
  TECHNICAL: 'technical',         // TECHNICAL
  FUNDAMENTAL: 'fundamental',     // FUNDAMENTAL
}; // 结束代码块

/**
 * 因子方向 - 高因子值期望产生的收益方向
 * Factor Direction - expected return direction for high factor values
 */
export const FACTOR_DIRECTION = { // 导出常量 FACTOR_DIRECTION
  POSITIVE: 'positive',   // POSITIVE
  NEGATIVE: 'negative',   // NEGATIVE
  NEUTRAL: 'neutral',     // NEUTRAL
}; // 结束代码块

/**
 * 因子频率 - 建议的更新频率
 * Factor Frequency - suggested update frequency
 */
export const FACTOR_FREQUENCY = { // 导出常量 FACTOR_FREQUENCY
  TICK: 'tick',           // TICK
  MINUTE: '1m',           // 分钟
  HOURLY: '1h',           // HOURLY
  DAILY: '1d',            // 每日
  WEEKLY: '1w',           // WEEKLY
}; // 结束代码块

/**
 * 因子基类
 * Base Factor Class
 */
export class BaseFactor extends EventEmitter { // 导出类 BaseFactor
  /**
   * @param {Object} config - 因子配置
   * @param {string} config.name - 因子名称
   * @param {string} config.category - 因子类别
   * @param {string} config.direction - 因子方向
   * @param {string} config.frequency - 更新频率
   * @param {Object} config.params - 因子参数
   */
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    // 因子基本信息 / Factor basic info
    this.name = config.name || 'BaseFactor'; // 设置 name
    this.category = config.category || FACTOR_CATEGORY.TECHNICAL; // 设置 category
    this.direction = config.direction || FACTOR_DIRECTION.POSITIVE; // 设置 direction
    this.frequency = config.frequency || FACTOR_FREQUENCY.DAILY; // 设置 frequency
    this.description = config.description || ''; // 设置 description

    // 因子参数 / Factor parameters
    this.params = config.params || {}; // 设置 params

    // 因子值缓存 (symbol -> { value, timestamp, raw }) / Factor value cache
    this.values = new Map(); // 设置 values

    // 因子历史 (symbol -> [{ value, timestamp }]) / Factor history
    this.history = new Map(); // 设置 history
    this.maxHistory = config.maxHistory || 100; // 设置 maxHistory

    // 元数据 / Metadata
    this.metadata = { // 设置 metadata
      version: '1.0.0', // version
      author: 'system', // author
      createdAt: Date.now(), // createdAt
      lastUpdated: null, // lastUpdated
      ...config.metadata, // 展开对象或数组
    }; // 结束代码块

    // 统计信息 / Statistics
    this.stats = { // 设置 stats
      totalCalculations: 0, // 总Calculations
      lastCalculationTime: 0, // lastCalculation时间
      averageCalculationTime: 0, // 平均Calculation时间
      errors: 0, // 错误列表
    }; // 结束代码块
  } // 结束代码块

  /**
   * 计算因子值 - 子类必须实现
   * Calculate factor value - must be implemented by subclass
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据 (K线、成交量等)
   * @param {Object} context - 上下文 (其他因子值、市场数据等)
   * @returns {Promise<number|null>} 因子值
   */
  async calculate(symbol, data, context = {}) { // 执行语句
    throw new Error('calculate() 必须由子类实现 / must be implemented by subclass'); // 抛出异常
  } // 结束代码块

  /**
   * 批量计算多个资产的因子值
   * Calculate factor values for multiple assets
   * @param {Object} dataMap - { symbol: data } 数据映射
   * @param {Object} context - 上下文
   * @returns {Promise<Map<string, number>>} { symbol: value } 结果映射
   */
  async calculateBatch(dataMap, context = {}) { // 执行语句
    const results = new Map(); // 定义常量 results
    const startTime = Date.now(); // 定义常量 startTime

    const promises = Object.entries(dataMap).map(async ([symbol, data]) => { // 定义函数 promises
      try { // 尝试执行
        const value = await this.calculate(symbol, data, context); // 定义常量 value
        results.set(symbol, value); // 调用 results.set
        this._updateCache(symbol, value, data); // 调用 _updateCache
      } catch (error) { // 执行语句
        this.stats.errors++; // 访问 stats
        this.emit('error', { symbol, error, factor: this.name }); // 调用 emit
        results.set(symbol, null); // 调用 results.set
      } // 结束代码块
    }); // 结束代码块

    await Promise.all(promises); // 等待异步结果

    // 更新统计 / Update stats
    const elapsed = Date.now() - startTime; // 定义常量 elapsed
    this.stats.totalCalculations++; // 访问 stats
    this.stats.lastCalculationTime = elapsed; // 访问 stats
    this.stats.averageCalculationTime = // 访问 stats
      (this.stats.averageCalculationTime * (this.stats.totalCalculations - 1) + elapsed) / // 执行语句
      this.stats.totalCalculations; // 访问 stats

    this.emit('calculated', { factor: this.name, count: results.size, elapsed }); // 调用 emit
    return results; // 返回结果
  } // 结束代码块

  /**
   * 获取因子值
   * Get factor value
   * @param {string} symbol - 交易对
   * @returns {number|null} 因子值
   */
  getValue(symbol) { // 调用 getValue
    const cached = this.values.get(symbol); // 定义常量 cached
    return cached ? cached.value : null; // 返回结果
  } // 结束代码块

  /**
   * 获取所有因子值
   * Get all factor values
   * @returns {Map<string, number>} 因子值映射
   */
  getAllValues() { // 调用 getAllValues
    const result = new Map(); // 定义常量 result
    for (const [symbol, data] of this.values) { // 循环 const [symbol, data] of this.values
      result.set(symbol, data.value); // 调用 result.set
    } // 结束代码块
    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取因子历史
   * Get factor history
   * @param {string} symbol - 交易对
   * @param {number} limit - 限制数量
   * @returns {Array} 历史数据
   */
  getHistory(symbol, limit = 0) { // 调用 getHistory
    const hist = this.history.get(symbol) || []; // 定义常量 hist
    return limit > 0 ? hist.slice(-limit) : hist; // 返回结果
  } // 结束代码块

  /**
   * 标准化因子值 (Z-Score)
   * Normalize factor values using Z-Score
   * @param {Map<string, number>} values - 因子值映射
   * @returns {Map<string, number>} 标准化后的值
   */
  normalizeZScore(values) { // 调用 normalizeZScore
    const vals = Array.from(values.values()).filter(v => v !== null && !isNaN(v)); // 定义函数 vals
    if (vals.length < 2) return values; // 条件判断 vals.length < 2

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length; // 定义函数 mean
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length; // 定义函数 variance
    const std = Math.sqrt(variance); // 定义常量 std

    if (std === 0) return values; // 条件判断 std === 0

    const normalized = new Map(); // 定义常量 normalized
    for (const [symbol, value] of values) { // 循环 const [symbol, value] of values
      if (value !== null && !isNaN(value)) { // 条件判断 value !== null && !isNaN(value)
        normalized.set(symbol, (value - mean) / std); // 调用 normalized.set
      } else { // 执行语句
        normalized.set(symbol, null); // 调用 normalized.set
      } // 结束代码块
    } // 结束代码块

    return normalized; // 返回结果
  } // 结束代码块

  /**
   * 标准化因子值 (Min-Max)
   * Normalize factor values using Min-Max
   * @param {Map<string, number>} values - 因子值映射
   * @returns {Map<string, number>} 标准化后的值 (0-1)
   */
  normalizeMinMax(values) { // 调用 normalizeMinMax
    const vals = Array.from(values.values()).filter(v => v !== null && !isNaN(v)); // 定义函数 vals
    if (vals.length < 2) return values; // 条件判断 vals.length < 2

    const min = Math.min(...vals); // 定义常量 min
    const max = Math.max(...vals); // 定义常量 max
    const range = max - min; // 定义常量 range

    if (range === 0) return values; // 条件判断 range === 0

    const normalized = new Map(); // 定义常量 normalized
    for (const [symbol, value] of values) { // 循环 const [symbol, value] of values
      if (value !== null && !isNaN(value)) { // 条件判断 value !== null && !isNaN(value)
        normalized.set(symbol, (value - min) / range); // 调用 normalized.set
      } else { // 执行语句
        normalized.set(symbol, null); // 调用 normalized.set
      } // 结束代码块
    } // 结束代码块

    return normalized; // 返回结果
  } // 结束代码块

  /**
   * 百分位排名
   * Percentile ranking
   * @param {Map<string, number>} values - 因子值映射
   * @returns {Map<string, number>} 百分位排名 (0-1)
   */
  percentileRank(values) { // 调用 percentileRank
    const entries = Array.from(values.entries()) // 定义常量 entries
      .filter(([, v]) => v !== null && !isNaN(v)) // 定义箭头函数
      .sort((a, b) => a[1] - b[1]); // 定义箭头函数

    const n = entries.length; // 定义常量 n
    if (n === 0) return values; // 条件判断 n === 0

    const ranked = new Map(); // 定义常量 ranked

    // 处理空值
    for (const [symbol, value] of values) { // 循环 const [symbol, value] of values
      if (value === null || isNaN(value)) { // 条件判断 value === null || isNaN(value)
        ranked.set(symbol, null); // 调用 ranked.set
      } // 结束代码块
    } // 结束代码块

    // 计算百分位
    entries.forEach(([symbol], index) => { // 调用 entries.forEach
      ranked.set(symbol, (index + 1) / n); // 调用 ranked.set
    }); // 结束代码块

    return ranked; // 返回结果
  } // 结束代码块

  /**
   * 更新缓存
   * Update cache
   * @private
   */
  _updateCache(symbol, value, rawData = null) { // 调用 _updateCache
    const timestamp = Date.now(); // 定义常量 timestamp

    // 更新当前值 / Update current value
    this.values.set(symbol, { // 访问 values
      value, // 执行语句
      timestamp, // 执行语句
      raw: rawData, // raw
    }); // 结束代码块

    // 更新历史 / Update history
    if (!this.history.has(symbol)) { // 条件判断 !this.history.has(symbol)
      this.history.set(symbol, []); // 访问 history
    } // 结束代码块
    const hist = this.history.get(symbol); // 定义常量 hist
    hist.push({ value, timestamp }); // 调用 hist.push

    // 限制历史长度 / Limit history length
    if (hist.length > this.maxHistory) { // 条件判断 hist.length > this.maxHistory
      hist.shift(); // 调用 hist.shift
    } // 结束代码块

    this.metadata.lastUpdated = timestamp; // 访问 metadata
  } // 结束代码块

  /**
   * 清除缓存
   * Clear cache
   * @param {string} symbol - 可选，指定交易对
   */
  clearCache(symbol = null) { // 调用 clearCache
    if (symbol) { // 条件判断 symbol
      this.values.delete(symbol); // 访问 values
      this.history.delete(symbol); // 访问 history
    } else { // 执行语句
      this.values.clear(); // 访问 values
      this.history.clear(); // 访问 history
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取因子信息
   * Get factor info
   * @returns {Object} 因子信息
   */
  getInfo() { // 调用 getInfo
    return { // 返回结果
      name: this.name, // name
      category: this.category, // category
      direction: this.direction, // direction
      frequency: this.frequency, // frequency
      description: this.description, // description
      params: this.params, // params
      metadata: this.metadata, // 元数据
      stats: this.stats, // stats
      cachedSymbols: this.values.size, // cached交易对列表
    }; // 结束代码块
  } // 结束代码块

  /**
   * 序列化
   * Serialize
   * @returns {Object}
   */
  toJSON() { // 调用 toJSON
    return { // 返回结果
      name: this.name, // name
      category: this.category, // category
      direction: this.direction, // direction
      frequency: this.frequency, // frequency
      description: this.description, // description
      params: this.params, // params
      values: Object.fromEntries(this.values), // values
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

export default BaseFactor; // 默认导出
