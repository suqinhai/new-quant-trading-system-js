/**
 * 策略状态 Redis 存储层
 * Strategy State Redis Store
 *
 * 使用 Hash 存储策略状态数据
 * Uses Hash for strategy state data
 *
 * Redis 数据结构设计 / Redis Data Structure Design:
 *
 * 1. 策略状态数据 (Hash)
 *    Key: quant:strategy:{strategyId}
 *    Fields: strategyId, strategyName, state, config, lastSignal, ...
 *
 * 2. 策略列表索引 (Set)
 *    Key: quant:strategy:idx:all
 *    Members: strategyIds
 *
 * 3. 策略信号历史 (Sorted Set)
 *    Key: quant:strategy:{strategyId}:signals
 *    Score: timestamp
 *    Member: JSON encoded signal
 *
 * 4. 策略运行状态索引 (Set)
 *    Key: quant:strategy:idx:running
 *    Members: strategyIds (正在运行的策略)
 *
 * @module src/database/redis/StrategyStore
 */

import { KEY_PREFIX } from './RedisClient.js';

/**
 * 策略运行状态枚举
 * Strategy running state enum
 */
export const STRATEGY_STATE = {
  STOPPED: 'stopped',
  RUNNING: 'running',
  PAUSED: 'paused',
  ERROR: 'error',
};

/**
 * 信号类型枚举
 * Signal type enum
 */
export const SIGNAL_TYPE = {
  BUY: 'buy',
  SELL: 'sell',
  HOLD: 'hold',
  CLOSE: 'close',
  CLOSE_LONG: 'closeLong',
  CLOSE_SHORT: 'closeShort',
};

/**
 * 策略存储类
 * Strategy Store Class
 */
class StrategyStore {
  constructor(redisClient) {
    this.redis = redisClient;
    this.prefix = KEY_PREFIX.STRATEGY;
  }

  // ============================================
  // 键生成方法 / Key Generation Methods
  // ============================================

  /**
   * 获取策略数据键
   * Get strategy data key
   */
  _strategyKey(strategyId) {
    return this.redis.key(this.prefix, strategyId);
  }

  /**
   * 获取策略列表索引键
   * Get strategy list index key
   */
  _allIndexKey() {
    return this.redis.key(this.prefix, 'idx', 'all');
  }

  /**
   * 获取运行中策略索引键
   * Get running strategies index key
   */
  _runningIndexKey() {
    return this.redis.key(this.prefix, 'idx', 'running');
  }

  /**
   * 获取策略信号历史键
   * Get strategy signal history key
   */
  _signalHistoryKey(strategyId) {
    return this.redis.key(this.prefix, strategyId, 'signals');
  }

  /**
   * 获取策略统计键
   * Get strategy statistics key
   */
  _statsKey(strategyId) {
    return this.redis.key(this.prefix, strategyId, 'stats');
  }

  // ============================================
  // 数据序列化 / Data Serialization
  // ============================================

  /**
   * 序列化策略到 Redis Hash
   * Serialize strategy to Redis Hash
   */
  _serialize(strategy) {
    const data = {
      strategyId: strategy.strategyId || strategy.id || '',
      strategyName: strategy.strategyName || strategy.name || '',
      state: strategy.state || STRATEGY_STATE.STOPPED,
      createdAt: String(strategy.createdAt || Date.now()),
      updatedAt: String(strategy.updatedAt || Date.now()),
    };

    // 序列化配置 / Serialize config
    if (strategy.config) {
      data.config = JSON.stringify(strategy.config);
    }

    // 序列化最后信号 / Serialize last signal
    if (strategy.lastSignal) {
      data.lastSignal = JSON.stringify(strategy.lastSignal);
    }
    if (strategy.lastSignalTime) {
      data.lastSignalTime = String(strategy.lastSignalTime);
    }

    // 序列化状态数据 (自定义策略数据) / Serialize state data
    if (strategy.stateData) {
      data.stateData = JSON.stringify(strategy.stateData);
    }

    // 序列化参数 / Serialize parameters
    if (strategy.parameters) {
      data.parameters = JSON.stringify(strategy.parameters);
    }

    return data;
  }

  /**
   * 反序列化 Redis Hash 到策略对象
   * Deserialize Redis Hash to strategy object
   */
  _deserialize(data) {
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const strategy = {
      strategyId: data.strategyId,
      strategyName: data.strategyName,
      state: data.state,
      createdAt: parseInt(data.createdAt, 10),
      updatedAt: parseInt(data.updatedAt, 10) || null,
      lastSignalTime: data.lastSignalTime ? parseInt(data.lastSignalTime, 10) : null,
    };

    // 解析配置 / Parse config
    if (data.config) {
      try {
        strategy.config = JSON.parse(data.config);
      } catch {
        strategy.config = null;
      }
    }

    // 解析最后信号 / Parse last signal
    if (data.lastSignal) {
      try {
        strategy.lastSignal = JSON.parse(data.lastSignal);
      } catch {
        strategy.lastSignal = null;
      }
    }

    // 解析状态数据 / Parse state data
    if (data.stateData) {
      try {
        strategy.stateData = JSON.parse(data.stateData);
      } catch {
        strategy.stateData = null;
      }
    }

    // 解析参数 / Parse parameters
    if (data.parameters) {
      try {
        strategy.parameters = JSON.parse(data.parameters);
      } catch {
        strategy.parameters = null;
      }
    }

    return strategy;
  }

  // ============================================
  // 写入操作 / Write Operations
  // ============================================

  /**
   * 创建或更新策略
   * Create or update strategy
   *
   * @param {Object} strategy - 策略数据 / Strategy data
   * @returns {Object} 结果 / Result
   */
  async save(strategy) {
    const strategyId = strategy.strategyId || strategy.id;
    if (!strategyId) {
      throw new Error('Strategy ID is required');
    }

    const serialized = this._serialize({
      ...strategy,
      updatedAt: Date.now(),
    });
    const isRunning = serialized.state === STRATEGY_STATE.RUNNING;

    await this.redis.transaction(async (multi) => {
      // 存储策略数据 / Store strategy data
      multi.hSet(this._strategyKey(strategyId), serialized);

      // 添加到策略列表 / Add to strategy list
      multi.sAdd(this._allIndexKey(), strategyId);

      // 更新运行状态索引 / Update running state index
      if (isRunning) {
        multi.sAdd(this._runningIndexKey(), strategyId);
      } else {
        multi.sRem(this._runningIndexKey(), strategyId);
      }
    });

    return { strategyId, changes: 1 };
  }

  /**
   * 更新策略状态
   * Update strategy state
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {string} state - 新状态 / New state
   */
  async updateState(strategyId, state) {
    const key = this._strategyKey(strategyId);
    const exists = await this.redis.exists(key);

    if (!exists) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    await this.redis.transaction(async (multi) => {
      multi.hSet(key, {
        state,
        updatedAt: String(Date.now()),
      });

      // 更新运行状态索引 / Update running state index
      if (state === STRATEGY_STATE.RUNNING) {
        multi.sAdd(this._runningIndexKey(), strategyId);
      } else {
        multi.sRem(this._runningIndexKey(), strategyId);
      }
    });

    return { strategyId, state };
  }

  /**
   * 更新策略配置
   * Update strategy config
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} config - 配置 / Config
   */
  async updateConfig(strategyId, config) {
    const key = this._strategyKey(strategyId);

    await this.redis.hSet(key, {
      config: JSON.stringify(config),
      updatedAt: String(Date.now()),
    });

    return { strategyId };
  }

  /**
   * 更新策略状态数据
   * Update strategy state data
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} stateData - 状态数据 / State data
   */
  async updateStateData(strategyId, stateData) {
    const key = this._strategyKey(strategyId);

    await this.redis.hSet(key, {
      stateData: JSON.stringify(stateData),
      updatedAt: String(Date.now()),
    });

    return { strategyId };
  }

  /**
   * 记录信号
   * Record signal
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} signal - 信号数据 / Signal data
   * @param {Object} options - 选项 / Options
   */
  async recordSignal(strategyId, signal, options = {}) {
    const timestamp = signal.timestamp || Date.now();
    const { maxHistory = 1000 } = options;

    const signalData = {
      ...signal,
      timestamp,
    };

    await this.redis.transaction(async (multi) => {
      // 更新最后信号 / Update last signal
      multi.hSet(this._strategyKey(strategyId), {
        lastSignal: JSON.stringify(signalData),
        lastSignalTime: String(timestamp),
        updatedAt: String(Date.now()),
      });

      // 添加到信号历史 / Add to signal history
      multi.zAdd(this._signalHistoryKey(strategyId), {
        score: timestamp,
        value: JSON.stringify(signalData),
      });

      // 限制历史长度 / Limit history length
      // 删除最旧的记录 / Remove oldest records
      multi.zRemRangeByRank(this._signalHistoryKey(strategyId), 0, -maxHistory - 1);
    });

    return { strategyId, signal: signalData };
  }

  /**
   * 删除策略
   * Delete strategy
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   */
  async delete(strategyId) {
    await this.redis.transaction(async (multi) => {
      // 删除策略数据 / Delete strategy data
      multi.del(this._strategyKey(strategyId));

      // 删除信号历史 / Delete signal history
      multi.del(this._signalHistoryKey(strategyId));

      // 删除统计数据 / Delete stats
      multi.del(this._statsKey(strategyId));

      // 从索引中移除 / Remove from indexes
      multi.sRem(this._allIndexKey(), strategyId);
      multi.sRem(this._runningIndexKey(), strategyId);
    });

    return { changes: 1 };
  }

  // ============================================
  // 查询操作 / Query Operations
  // ============================================

  /**
   * 根据 ID 获取策略
   * Get strategy by ID
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @returns {Object|null} 策略 / Strategy
   */
  async getById(strategyId) {
    const data = await this.redis.hGetAll(this._strategyKey(strategyId));
    return this._deserialize(data);
  }

  /**
   * 获取所有策略
   * Get all strategies
   *
   * @returns {Array} 策略数组 / Strategy array
   */
  async getAll() {
    const strategyIds = await this.redis.sMembers(this._allIndexKey());

    const strategies = [];
    for (const strategyId of strategyIds) {
      const strategy = await this.getById(strategyId);
      if (strategy) {
        strategies.push(strategy);
      }
    }

    // 按名称排序 / Sort by name
    strategies.sort((a, b) => a.strategyName.localeCompare(b.strategyName));

    return strategies;
  }

  /**
   * 获取正在运行的策略
   * Get running strategies
   *
   * @returns {Array} 策略数组 / Strategy array
   */
  async getRunning() {
    const strategyIds = await this.redis.sMembers(this._runningIndexKey());

    const strategies = [];
    for (const strategyId of strategyIds) {
      const strategy = await this.getById(strategyId);
      if (strategy && strategy.state === STRATEGY_STATE.RUNNING) {
        strategies.push(strategy);
      }
    }

    return strategies;
  }

  /**
   * 按状态获取策略
   * Get strategies by state
   *
   * @param {string} state - 状态 / State
   * @returns {Array} 策略数组 / Strategy array
   */
  async getByState(state) {
    const all = await this.getAll();
    return all.filter(s => s.state === state);
  }

  /**
   * 获取信号历史
   * Get signal history
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} options - 选项 / Options
   * @returns {Array} 信号数组 / Signal array
   */
  async getSignalHistory(strategyId, options = {}) {
    const { limit = 100, startTime = 0, endTime = Date.now() } = options;

    const signals = await this.redis.zRangeByScoreWithScores(
      this._signalHistoryKey(strategyId),
      startTime,
      endTime,
      { limit }
    );

    return signals.map(item => {
      try {
        return JSON.parse(item.value);
      } catch {
        return { raw: item.value, score: item.score };
      }
    }).reverse(); // 最新的在前 / Newest first
  }

  /**
   * 获取最后信号
   * Get last signal
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @returns {Object|null} 信号 / Signal
   */
  async getLastSignal(strategyId) {
    const data = await this.redis.hMGet(
      this._strategyKey(strategyId),
      ['lastSignal', 'lastSignalTime']
    );

    if (!data[0]) {
      return null;
    }

    try {
      return JSON.parse(data[0]);
    } catch {
      return null;
    }
  }

  // ============================================
  // 统计方法 / Statistics Methods
  // ============================================

  /**
   * 更新策略统计
   * Update strategy statistics
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} stats - 统计数据 / Statistics
   */
  async updateStats(strategyId, stats) {
    const key = this._statsKey(strategyId);

    const data = {};
    for (const [field, value] of Object.entries(stats)) {
      data[field] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
    data.updatedAt = String(Date.now());

    await this.redis.hSet(key, data);

    return { strategyId };
  }

  /**
   * 获取策略统计
   * Get strategy statistics
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @returns {Object|null} 统计数据 / Statistics
   */
  async getStats(strategyId) {
    const data = await this.redis.hGetAll(this._statsKey(strategyId));

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const stats = {};
    for (const [field, value] of Object.entries(data)) {
      try {
        stats[field] = JSON.parse(value);
      } catch {
        stats[field] = isNaN(value) ? value : parseFloat(value);
      }
    }

    return stats;
  }

  /**
   * 增加统计计数
   * Increment statistics counter
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {string} field - 字段名 / Field name
   * @param {number} increment - 增量 / Increment
   */
  async incrStat(strategyId, field, increment = 1) {
    const key = this._statsKey(strategyId);
    await this.redis.hIncrByFloat(key, field, increment);
    return { strategyId, field };
  }

  /**
   * 获取存储概览
   * Get store overview
   *
   * @returns {Object} 概览数据 / Overview data
   */
  async getOverview() {
    const allCount = await this.redis.sCard(this._allIndexKey());
    const runningCount = await this.redis.sCard(this._runningIndexKey());

    const strategies = await this.getAll();
    const byState = {};

    for (const strategy of strategies) {
      byState[strategy.state] = (byState[strategy.state] || 0) + 1;
    }

    return {
      total: allCount,
      running: runningCount,
      byState,
    };
  }
}

export { StrategyStore, STRATEGY_STATE, SIGNAL_TYPE };
export default StrategyStore;
