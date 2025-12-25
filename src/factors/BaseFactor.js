/**
 * Alpha 因子基类
 * Base Alpha Factor Class
 *
 * 所有因子的基础类，定义因子的标准接口
 * Base class for all factors, defines standard interface
 */

import EventEmitter from 'eventemitter3';

/**
 * 因子类别
 * Factor Categories
 */
export const FACTOR_CATEGORY = {
  MOMENTUM: 'momentum',           // 动量因子
  VOLATILITY: 'volatility',       // 波动率因子
  VOLUME: 'volume',               // 成交量因子
  MONEY_FLOW: 'money_flow',       // 资金流向因子
  FUNDING: 'funding',             // 资金费率因子
  LIQUIDITY: 'liquidity',         // 流动性因子
  SENTIMENT: 'sentiment',         // 情绪因子
  TECHNICAL: 'technical',         // 技术因子
  FUNDAMENTAL: 'fundamental',     // 基本面因子
};

/**
 * 因子方向 - 高因子值期望产生的收益方向
 * Factor Direction - expected return direction for high factor values
 */
export const FACTOR_DIRECTION = {
  POSITIVE: 'positive',   // 正向: 高因子值 → 预期正收益
  NEGATIVE: 'negative',   // 负向: 高因子值 → 预期负收益
  NEUTRAL: 'neutral',     // 中性: 无明确方向
};

/**
 * 因子频率 - 建议的更新频率
 * Factor Frequency - suggested update frequency
 */
export const FACTOR_FREQUENCY = {
  TICK: 'tick',           // 每个 tick 更新
  MINUTE: '1m',           // 每分钟
  HOURLY: '1h',           // 每小时
  DAILY: '1d',            // 每天
  WEEKLY: '1w',           // 每周
};

/**
 * 因子基类
 * Base Factor Class
 */
export class BaseFactor extends EventEmitter {
  /**
   * @param {Object} config - 因子配置
   * @param {string} config.name - 因子名称
   * @param {string} config.category - 因子类别
   * @param {string} config.direction - 因子方向
   * @param {string} config.frequency - 更新频率
   * @param {Object} config.params - 因子参数
   */
  constructor(config = {}) {
    super();

    // 因子基本信息 / Factor basic info
    this.name = config.name || 'BaseFactor';
    this.category = config.category || FACTOR_CATEGORY.TECHNICAL;
    this.direction = config.direction || FACTOR_DIRECTION.POSITIVE;
    this.frequency = config.frequency || FACTOR_FREQUENCY.DAILY;
    this.description = config.description || '';

    // 因子参数 / Factor parameters
    this.params = config.params || {};

    // 因子值缓存 (symbol -> { value, timestamp, raw }) / Factor value cache
    this.values = new Map();

    // 因子历史 (symbol -> [{ value, timestamp }]) / Factor history
    this.history = new Map();
    this.maxHistory = config.maxHistory || 100;

    // 元数据 / Metadata
    this.metadata = {
      version: '1.0.0',
      author: 'system',
      createdAt: Date.now(),
      lastUpdated: null,
      ...config.metadata,
    };

    // 统计信息 / Statistics
    this.stats = {
      totalCalculations: 0,
      lastCalculationTime: 0,
      averageCalculationTime: 0,
      errors: 0,
    };
  }

  /**
   * 计算因子值 - 子类必须实现
   * Calculate factor value - must be implemented by subclass
   * @param {string} symbol - 交易对
   * @param {Object} data - 输入数据 (K线、成交量等)
   * @param {Object} context - 上下文 (其他因子值、市场数据等)
   * @returns {Promise<number|null>} 因子值
   */
  async calculate(symbol, data, context = {}) {
    throw new Error('calculate() 必须由子类实现 / must be implemented by subclass');
  }

  /**
   * 批量计算多个资产的因子值
   * Calculate factor values for multiple assets
   * @param {Object} dataMap - { symbol: data } 数据映射
   * @param {Object} context - 上下文
   * @returns {Promise<Map<string, number>>} { symbol: value } 结果映射
   */
  async calculateBatch(dataMap, context = {}) {
    const results = new Map();
    const startTime = Date.now();

    const promises = Object.entries(dataMap).map(async ([symbol, data]) => {
      try {
        const value = await this.calculate(symbol, data, context);
        results.set(symbol, value);
        this._updateCache(symbol, value, data);
      } catch (error) {
        this.stats.errors++;
        this.emit('error', { symbol, error, factor: this.name });
        results.set(symbol, null);
      }
    });

    await Promise.all(promises);

    // 更新统计 / Update stats
    const elapsed = Date.now() - startTime;
    this.stats.totalCalculations++;
    this.stats.lastCalculationTime = elapsed;
    this.stats.averageCalculationTime =
      (this.stats.averageCalculationTime * (this.stats.totalCalculations - 1) + elapsed) /
      this.stats.totalCalculations;

    this.emit('calculated', { factor: this.name, count: results.size, elapsed });
    return results;
  }

  /**
   * 获取因子值
   * Get factor value
   * @param {string} symbol - 交易对
   * @returns {number|null} 因子值
   */
  getValue(symbol) {
    const cached = this.values.get(symbol);
    return cached ? cached.value : null;
  }

  /**
   * 获取所有因子值
   * Get all factor values
   * @returns {Map<string, number>} 因子值映射
   */
  getAllValues() {
    const result = new Map();
    for (const [symbol, data] of this.values) {
      result.set(symbol, data.value);
    }
    return result;
  }

  /**
   * 获取因子历史
   * Get factor history
   * @param {string} symbol - 交易对
   * @param {number} limit - 限制数量
   * @returns {Array} 历史数据
   */
  getHistory(symbol, limit = 0) {
    const hist = this.history.get(symbol) || [];
    return limit > 0 ? hist.slice(-limit) : hist;
  }

  /**
   * 标准化因子值 (Z-Score)
   * Normalize factor values using Z-Score
   * @param {Map<string, number>} values - 因子值映射
   * @returns {Map<string, number>} 标准化后的值
   */
  normalizeZScore(values) {
    const vals = Array.from(values.values()).filter(v => v !== null && !isNaN(v));
    if (vals.length < 2) return values;

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length;
    const std = Math.sqrt(variance);

    if (std === 0) return values;

    const normalized = new Map();
    for (const [symbol, value] of values) {
      if (value !== null && !isNaN(value)) {
        normalized.set(symbol, (value - mean) / std);
      } else {
        normalized.set(symbol, null);
      }
    }

    return normalized;
  }

  /**
   * 标准化因子值 (Min-Max)
   * Normalize factor values using Min-Max
   * @param {Map<string, number>} values - 因子值映射
   * @returns {Map<string, number>} 标准化后的值 (0-1)
   */
  normalizeMinMax(values) {
    const vals = Array.from(values.values()).filter(v => v !== null && !isNaN(v));
    if (vals.length < 2) return values;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;

    if (range === 0) return values;

    const normalized = new Map();
    for (const [symbol, value] of values) {
      if (value !== null && !isNaN(value)) {
        normalized.set(symbol, (value - min) / range);
      } else {
        normalized.set(symbol, null);
      }
    }

    return normalized;
  }

  /**
   * 百分位排名
   * Percentile ranking
   * @param {Map<string, number>} values - 因子值映射
   * @returns {Map<string, number>} 百分位排名 (0-1)
   */
  percentileRank(values) {
    const entries = Array.from(values.entries())
      .filter(([, v]) => v !== null && !isNaN(v))
      .sort((a, b) => a[1] - b[1]);

    const n = entries.length;
    if (n === 0) return values;

    const ranked = new Map();

    // 处理空值
    for (const [symbol, value] of values) {
      if (value === null || isNaN(value)) {
        ranked.set(symbol, null);
      }
    }

    // 计算百分位
    entries.forEach(([symbol], index) => {
      ranked.set(symbol, (index + 1) / n);
    });

    return ranked;
  }

  /**
   * 更新缓存
   * Update cache
   * @private
   */
  _updateCache(symbol, value, rawData = null) {
    const timestamp = Date.now();

    // 更新当前值 / Update current value
    this.values.set(symbol, {
      value,
      timestamp,
      raw: rawData,
    });

    // 更新历史 / Update history
    if (!this.history.has(symbol)) {
      this.history.set(symbol, []);
    }
    const hist = this.history.get(symbol);
    hist.push({ value, timestamp });

    // 限制历史长度 / Limit history length
    if (hist.length > this.maxHistory) {
      hist.shift();
    }

    this.metadata.lastUpdated = timestamp;
  }

  /**
   * 清除缓存
   * Clear cache
   * @param {string} symbol - 可选，指定交易对
   */
  clearCache(symbol = null) {
    if (symbol) {
      this.values.delete(symbol);
      this.history.delete(symbol);
    } else {
      this.values.clear();
      this.history.clear();
    }
  }

  /**
   * 获取因子信息
   * Get factor info
   * @returns {Object} 因子信息
   */
  getInfo() {
    return {
      name: this.name,
      category: this.category,
      direction: this.direction,
      frequency: this.frequency,
      description: this.description,
      params: this.params,
      metadata: this.metadata,
      stats: this.stats,
      cachedSymbols: this.values.size,
    };
  }

  /**
   * 序列化
   * Serialize
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      category: this.category,
      direction: this.direction,
      frequency: this.frequency,
      description: this.description,
      params: this.params,
      values: Object.fromEntries(this.values),
    };
  }
}

export default BaseFactor;
