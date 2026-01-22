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

import { KEY_PREFIX } from './RedisClient.js'; // 导入模块 ./RedisClient.js

/**
 * 策略运行状态枚举
 * Strategy running state enum
 */
export const STRATEGY_STATE = { // 导出常量 STRATEGY_STATE
  STOPPED: 'stopped', // STOPPED权限
  RUNNING: 'running', // RUNNING
  PAUSED: 'paused', // PAUSED
  ERROR: 'error', // 错误
}; // 结束代码块

/**
 * 信号类型枚举
 * Signal type enum
 */
export const SIGNAL_TYPE = { // 导出常量 SIGNAL_TYPE
  BUY: 'buy', // BUY
  SELL: 'sell', // SELL
  HOLD: 'hold', // HOLD
  CLOSE: 'close', // 平仓权限
  CLOSE_LONG: 'closeLong', // 平仓LONG权限
  CLOSE_SHORT: 'closeShort', // 平仓SHORT权限
}; // 结束代码块

/**
 * 策略存储类
 * Strategy Store Class
 */
class StrategyStore { // 定义类 StrategyStore
  constructor(redisClient) { // 构造函数
    this.redis = redisClient; // 设置 redis
    this.prefix = KEY_PREFIX.STRATEGY; // 设置 prefix
  } // 结束代码块

  // ============================================
  // 键生成方法 / Key Generation Methods
  // ============================================

  /**
   * 获取策略数据键
   * Get strategy data key
   */
  _strategyKey(strategyId) { // 调用 _strategyKey
    return this.redis.key(this.prefix, strategyId); // 返回结果
  } // 结束代码块

  /**
   * 获取策略列表索引键
   * Get strategy list index key
   */
  _allIndexKey() { // 调用 _allIndexKey
    return this.redis.key(this.prefix, 'idx', 'all'); // 返回结果
  } // 结束代码块

  /**
   * 获取运行中策略索引键
   * Get running strategies index key
   */
  _runningIndexKey() { // 调用 _runningIndexKey
    return this.redis.key(this.prefix, 'idx', 'running'); // 返回结果
  } // 结束代码块

  /**
   * 获取策略信号历史键
   * Get strategy signal history key
   */
  _signalHistoryKey(strategyId) { // 调用 _signalHistoryKey
    return this.redis.key(this.prefix, strategyId, 'signals'); // 返回结果
  } // 结束代码块

  /**
   * 获取策略统计键
   * Get strategy statistics key
   */
  _statsKey(strategyId) { // 调用 _statsKey
    return this.redis.key(this.prefix, strategyId, 'stats'); // 返回结果
  } // 结束代码块

  // ============================================
  // 数据序列化 / Data Serialization
  // ============================================

  /**
   * 序列化策略到 Redis Hash
   * Serialize strategy to Redis Hash
   */
  _serialize(strategy) { // 调用 _serialize
    const data = { // 定义常量 data
      strategyId: strategy.strategyId || strategy.id || '', // 策略ID
      strategyName: strategy.strategyName || strategy.name || '', // 策略Name
      state: strategy.state || STRATEGY_STATE.STOPPED, // state
      createdAt: String(strategy.createdAt || Date.now()), // createdAt
      updatedAt: String(strategy.updatedAt || Date.now()), // updatedAt
    }; // 结束代码块

    // 序列化配置 / Serialize config
    if (strategy.config) { // 条件判断 strategy.config
      data.config = JSON.stringify(strategy.config); // 赋值 data.config
    } // 结束代码块

    // 序列化最后信号 / Serialize last signal
    if (strategy.lastSignal) { // 条件判断 strategy.lastSignal
      data.lastSignal = JSON.stringify(strategy.lastSignal); // 赋值 data.lastSignal
    } // 结束代码块
    if (strategy.lastSignalTime) { // 条件判断 strategy.lastSignalTime
      data.lastSignalTime = String(strategy.lastSignalTime); // 赋值 data.lastSignalTime
    } // 结束代码块

    // 序列化状态数据 (自定义策略数据) / Serialize state data
    if (strategy.stateData) { // 条件判断 strategy.stateData
      data.stateData = JSON.stringify(strategy.stateData); // 赋值 data.stateData
    } // 结束代码块

    // 序列化参数 / Serialize parameters
    if (strategy.parameters) { // 条件判断 strategy.parameters
      data.parameters = JSON.stringify(strategy.parameters); // 赋值 data.parameters
    } // 结束代码块

    return data; // 返回结果
  } // 结束代码块

  /**
   * 反序列化 Redis Hash 到策略对象
   * Deserialize Redis Hash to strategy object
   */
  _deserialize(data) { // 调用 _deserialize
    if (!data || Object.keys(data).length === 0) { // 条件判断 !data || Object.keys(data).length === 0
      return null; // 返回结果
    } // 结束代码块

    const strategy = { // 定义常量 strategy
      strategyId: data.strategyId, // 策略ID
      strategyName: data.strategyName, // 策略Name
      state: data.state, // state
      createdAt: parseInt(data.createdAt, 10), // createdAt
      updatedAt: parseInt(data.updatedAt, 10) || null, // updatedAt
      lastSignalTime: data.lastSignalTime ? parseInt(data.lastSignalTime, 10) : null, // last信号时间
    }; // 结束代码块

    // 解析配置 / Parse config
    if (data.config) { // 条件判断 data.config
      try { // 尝试执行
        strategy.config = JSON.parse(data.config); // 赋值 strategy.config
      } catch { // 执行语句
        strategy.config = null; // 赋值 strategy.config
      } // 结束代码块
    } // 结束代码块

    // 解析最后信号 / Parse last signal
    if (data.lastSignal) { // 条件判断 data.lastSignal
      try { // 尝试执行
        strategy.lastSignal = JSON.parse(data.lastSignal); // 赋值 strategy.lastSignal
      } catch { // 执行语句
        strategy.lastSignal = null; // 赋值 strategy.lastSignal
      } // 结束代码块
    } // 结束代码块

    // 解析状态数据 / Parse state data
    if (data.stateData) { // 条件判断 data.stateData
      try { // 尝试执行
        strategy.stateData = JSON.parse(data.stateData); // 赋值 strategy.stateData
      } catch { // 执行语句
        strategy.stateData = null; // 赋值 strategy.stateData
      } // 结束代码块
    } // 结束代码块

    // 解析参数 / Parse parameters
    if (data.parameters) { // 条件判断 data.parameters
      try { // 尝试执行
        strategy.parameters = JSON.parse(data.parameters); // 赋值 strategy.parameters
      } catch { // 执行语句
        strategy.parameters = null; // 赋值 strategy.parameters
      } // 结束代码块
    } // 结束代码块

    return strategy; // 返回结果
  } // 结束代码块

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
  async save(strategy) { // 执行语句
    const strategyId = strategy.strategyId || strategy.id; // 定义常量 strategyId
    if (!strategyId) { // 条件判断 !strategyId
      throw new Error('Strategy ID is required'); // 抛出异常
    } // 结束代码块

    const serialized = this._serialize({ // 定义常量 serialized
      ...strategy, // 展开对象或数组
      updatedAt: Date.now(), // updatedAt
    }); // 结束代码块
    const isRunning = serialized.state === STRATEGY_STATE.RUNNING; // 定义常量 isRunning

    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 存储策略数据 / Store strategy data
      multi.hSet(this._strategyKey(strategyId), serialized); // 调用 multi.hSet

      // 添加到策略列表 / Add to strategy list
      multi.sAdd(this._allIndexKey(), strategyId); // 调用 multi.sAdd

      // 更新运行状态索引 / Update running state index
      if (isRunning) { // 条件判断 isRunning
        multi.sAdd(this._runningIndexKey(), strategyId); // 调用 multi.sAdd
      } else { // 执行语句
        multi.sRem(this._runningIndexKey(), strategyId); // 调用 multi.sRem
      } // 结束代码块
    }); // 结束代码块

    return { strategyId, changes: 1 }; // 返回结果
  } // 结束代码块

  /**
   * 更新策略状态
   * Update strategy state
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {string} state - 新状态 / New state
   */
  async updateState(strategyId, state) { // 执行语句
    const key = this._strategyKey(strategyId); // 定义常量 key
    const exists = await this.redis.exists(key); // 定义常量 exists

    if (!exists) { // 条件判断 !exists
      throw new Error(`Strategy not found: ${strategyId}`); // 抛出异常
    } // 结束代码块

    await this.redis.transaction(async (multi) => { // 等待异步结果
      multi.hSet(key, { // 调用 multi.hSet
        state, // 执行语句
        updatedAt: String(Date.now()), // updatedAt
      }); // 结束代码块

      // 更新运行状态索引 / Update running state index
      if (state === STRATEGY_STATE.RUNNING) { // 条件判断 state === STRATEGY_STATE.RUNNING
        multi.sAdd(this._runningIndexKey(), strategyId); // 调用 multi.sAdd
      } else { // 执行语句
        multi.sRem(this._runningIndexKey(), strategyId); // 调用 multi.sRem
      } // 结束代码块
    }); // 结束代码块

    return { strategyId, state }; // 返回结果
  } // 结束代码块

  /**
   * 更新策略配置
   * Update strategy config
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} config - 配置 / Config
   */
  async updateConfig(strategyId, config) { // 执行语句
    const key = this._strategyKey(strategyId); // 定义常量 key

    await this.redis.hSet(key, { // 等待异步结果
      config: JSON.stringify(config), // 配置
      updatedAt: String(Date.now()), // updatedAt
    }); // 结束代码块

    return { strategyId }; // 返回结果
  } // 结束代码块

  /**
   * 更新策略状态数据
   * Update strategy state data
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} stateData - 状态数据 / State data
   */
  async updateStateData(strategyId, stateData) { // 执行语句
    const key = this._strategyKey(strategyId); // 定义常量 key

    await this.redis.hSet(key, { // 等待异步结果
      stateData: JSON.stringify(stateData), // state数据
      updatedAt: String(Date.now()), // updatedAt
    }); // 结束代码块

    return { strategyId }; // 返回结果
  } // 结束代码块

  /**
   * 记录信号
   * Record signal
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} signal - 信号数据 / Signal data
   * @param {Object} options - 选项 / Options
   */
  async recordSignal(strategyId, signal, options = {}) { // 执行语句
    const timestamp = signal.timestamp || Date.now(); // 定义常量 timestamp
    const { maxHistory = 1000 } = options; // 解构赋值

    const signalData = { // 定义常量 signalData
      ...signal, // 展开对象或数组
      timestamp, // 执行语句
    }; // 结束代码块

    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 更新最后信号 / Update last signal
      multi.hSet(this._strategyKey(strategyId), { // 调用 multi.hSet
        lastSignal: JSON.stringify(signalData), // last信号
        lastSignalTime: String(timestamp), // last信号时间
        updatedAt: String(Date.now()), // updatedAt
      }); // 结束代码块

      // 添加到信号历史 / Add to signal history
      multi.zAdd(this._signalHistoryKey(strategyId), { // 调用 multi.zAdd
        score: timestamp, // 分数
        value: JSON.stringify(signalData), // value
      }); // 结束代码块

      // 限制历史长度 / Limit history length
      // 删除最旧的记录 / Remove oldest records
      multi.zRemRangeByRank(this._signalHistoryKey(strategyId), 0, -maxHistory - 1); // 调用 multi.zRemRangeByRank
    }); // 结束代码块

    return { strategyId, signal: signalData }; // 返回结果
  } // 结束代码块

  /**
   * 删除策略
   * Delete strategy
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   */
  async delete(strategyId) { // 执行语句
    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 删除策略数据 / Delete strategy data
      multi.del(this._strategyKey(strategyId)); // 调用 multi.del

      // 删除信号历史 / Delete signal history
      multi.del(this._signalHistoryKey(strategyId)); // 调用 multi.del

      // 删除统计数据 / Delete stats
      multi.del(this._statsKey(strategyId)); // 调用 multi.del

      // 从索引中移除 / Remove from indexes
      multi.sRem(this._allIndexKey(), strategyId); // 调用 multi.sRem
      multi.sRem(this._runningIndexKey(), strategyId); // 调用 multi.sRem
    }); // 结束代码块

    return { changes: 1 }; // 返回结果
  } // 结束代码块

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
  async getById(strategyId) { // 执行语句
    const data = await this.redis.hGetAll(this._strategyKey(strategyId)); // 定义常量 data
    return this._deserialize(data); // 返回结果
  } // 结束代码块

  /**
   * 获取所有策略
   * Get all strategies
   *
   * @returns {Array} 策略数组 / Strategy array
   */
  async getAll() { // 执行语句
    const strategyIds = await this.redis.sMembers(this._allIndexKey()); // 定义常量 strategyIds

    const strategies = []; // 定义常量 strategies
    for (const strategyId of strategyIds) { // 循环 const strategyId of strategyIds
      const strategy = await this.getById(strategyId); // 定义常量 strategy
      if (strategy) { // 条件判断 strategy
        strategies.push(strategy); // 调用 strategies.push
      } // 结束代码块
    } // 结束代码块

    // 按名称排序 / Sort by name
    strategies.sort((a, b) => a.strategyName.localeCompare(b.strategyName)); // 调用 strategies.sort

    return strategies; // 返回结果
  } // 结束代码块

  /**
   * 获取正在运行的策略
   * Get running strategies
   *
   * @returns {Array} 策略数组 / Strategy array
   */
  async getRunning() { // 执行语句
    const strategyIds = await this.redis.sMembers(this._runningIndexKey()); // 定义常量 strategyIds

    const strategies = []; // 定义常量 strategies
    for (const strategyId of strategyIds) { // 循环 const strategyId of strategyIds
      const strategy = await this.getById(strategyId); // 定义常量 strategy
      if (strategy && strategy.state === STRATEGY_STATE.RUNNING) { // 条件判断 strategy && strategy.state === STRATEGY_STATE...
        strategies.push(strategy); // 调用 strategies.push
      } // 结束代码块
    } // 结束代码块

    return strategies; // 返回结果
  } // 结束代码块

  /**
   * 按状态获取策略
   * Get strategies by state
   *
   * @param {string} state - 状态 / State
   * @returns {Array} 策略数组 / Strategy array
   */
  async getByState(state) { // 执行语句
    const all = await this.getAll(); // 定义常量 all
    return all.filter(s => s.state === state); // 返回结果
  } // 结束代码块

  /**
   * 获取信号历史
   * Get signal history
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {Object} options - 选项 / Options
   * @returns {Array} 信号数组 / Signal array
   */
  async getSignalHistory(strategyId, options = {}) { // 执行语句
    const { limit = 100, startTime = 0, endTime = Date.now() } = options; // 解构赋值

    const signals = await this.redis.zRangeByScoreWithScores( // 定义常量 signals
      this._signalHistoryKey(strategyId), // 调用 _signalHistoryKey
      startTime, // 执行语句
      endTime, // 执行语句
      { limit } // 执行语句
    ); // 结束调用或参数

    return signals.map(item => { // 返回结果
      try { // 尝试执行
        return JSON.parse(item.value); // 返回结果
      } catch { // 执行语句
        return { raw: item.value, score: item.score }; // 返回结果
      } // 结束代码块
    }).reverse(); // 最新的在前 / Newest first
  } // 结束代码块

  /**
   * 获取最后信号
   * Get last signal
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @returns {Object|null} 信号 / Signal
   */
  async getLastSignal(strategyId) { // 执行语句
    const data = await this.redis.hMGet( // 定义常量 data
      this._strategyKey(strategyId), // 调用 _strategyKey
      ['lastSignal', 'lastSignalTime'] // 执行语句
    ); // 结束调用或参数

    if (!data[0]) { // 条件判断 !data[0]
      return null; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      return JSON.parse(data[0]); // 返回结果
    } catch { // 执行语句
      return null; // 返回结果
    } // 结束代码块
  } // 结束代码块

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
  async updateStats(strategyId, stats) { // 执行语句
    const key = this._statsKey(strategyId); // 定义常量 key

    const data = {}; // 定义常量 data
    for (const [field, value] of Object.entries(stats)) { // 循环 const [field, value] of Object.entries(stats)
      data[field] = typeof value === 'object' ? JSON.stringify(value) : String(value); // 执行语句
    } // 结束代码块
    data.updatedAt = String(Date.now()); // 赋值 data.updatedAt

    await this.redis.hSet(key, data); // 等待异步结果

    return { strategyId }; // 返回结果
  } // 结束代码块

  /**
   * 获取策略统计
   * Get strategy statistics
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @returns {Object|null} 统计数据 / Statistics
   */
  async getStats(strategyId) { // 执行语句
    const data = await this.redis.hGetAll(this._statsKey(strategyId)); // 定义常量 data

    if (!data || Object.keys(data).length === 0) { // 条件判断 !data || Object.keys(data).length === 0
      return null; // 返回结果
    } // 结束代码块

    const stats = {}; // 定义常量 stats
    for (const [field, value] of Object.entries(data)) { // 循环 const [field, value] of Object.entries(data)
      try { // 尝试执行
        stats[field] = JSON.parse(value); // 执行语句
      } catch { // 执行语句
        stats[field] = isNaN(value) ? value : parseFloat(value); // 执行语句
      } // 结束代码块
    } // 结束代码块

    return stats; // 返回结果
  } // 结束代码块

  /**
   * 增加统计计数
   * Increment statistics counter
   *
   * @param {string} strategyId - 策略ID / Strategy ID
   * @param {string} field - 字段名 / Field name
   * @param {number} increment - 增量 / Increment
   */
  async incrStat(strategyId, field, increment = 1) { // 执行语句
    const key = this._statsKey(strategyId); // 定义常量 key
    await this.redis.hIncrByFloat(key, field, increment); // 等待异步结果
    return { strategyId, field }; // 返回结果
  } // 结束代码块

  /**
   * 获取存储概览
   * Get store overview
   *
   * @returns {Object} 概览数据 / Overview data
   */
  async getOverview() { // 执行语句
    const allCount = await this.redis.sCard(this._allIndexKey()); // 定义常量 allCount
    const runningCount = await this.redis.sCard(this._runningIndexKey()); // 定义常量 runningCount

    const strategies = await this.getAll(); // 定义常量 strategies
    const byState = {}; // 定义常量 byState

    for (const strategy of strategies) { // 循环 const strategy of strategies
      byState[strategy.state] = (byState[strategy.state] || 0) + 1; // 执行语句
    } // 结束代码块

    return { // 返回结果
      total: allCount, // 总
      running: runningCount, // running
      byState, // 执行语句
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

export { StrategyStore, STRATEGY_STATE, SIGNAL_TYPE }; // 导出命名成员
export default StrategyStore; // 默认导出
