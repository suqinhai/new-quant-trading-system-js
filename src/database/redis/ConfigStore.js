/**
 * 系统配置 Redis 存储层
 * System Config Redis Store
 *
 * 使用 Hash 存储配置数据，支持配置版本和历史
 * Uses Hash for config data, supports versioning and history
 *
 * Redis 数据结构设计 / Redis Data Structure Design:
 *
 * 1. 配置数据 (Hash)
 *    Key: quant:config:data
 *    Field: configKey
 *    Value: JSON encoded config value
 *
 * 2. 配置元数据 (Hash)
 *    Key: quant:config:meta:{key}
 *    Fields: updatedAt, version, description
 *
 * 3. 配置历史 (Sorted Set)
 *    Key: quant:config:history:{key}
 *    Score: timestamp
 *    Member: JSON encoded { value, version, timestamp }
 *
 * 4. 配置锁 (String with TTL)
 *    Key: quant:config:lock:{key}
 *    Value: lockToken
 *
 * @module src/database/redis/ConfigStore
 */

import { KEY_PREFIX } from './RedisClient.js'; // 导入模块 ./RedisClient.js

/**
 * 默认配置选项
 * Default config options
 */
const DEFAULT_OPTIONS = { // 定义常量 DEFAULT_OPTIONS
  // 是否保留历史版本 / Whether to keep history versions
  keepHistory: true, // 是否保留历史版本
  // 历史版本最大数量 / Max history versions
  maxHistoryVersions: 100, // 历史版本最大数量
  // 配置锁超时时间 (秒) / Config lock TTL (seconds)
  lockTTL: 30, // 配置锁超时时间 (秒)
}; // 结束代码块

/**
 * 配置存储类
 * Config Store Class
 */
class ConfigStore { // 定义类 ConfigStore
  constructor(redisClient, options = {}) { // 构造函数
    this.redis = redisClient; // 设置 redis
    this.options = { ...DEFAULT_OPTIONS, ...options }; // 设置 options
    this.prefix = KEY_PREFIX.CONFIG; // 设置 prefix
  } // 结束代码块

  // ============================================
  // 键生成方法 / Key Generation Methods
  // ============================================

  /**
   * 获取配置数据键
   * Get config data key
   */
  _dataKey() { // 调用 _dataKey
    return this.redis.key(this.prefix, 'data'); // 返回结果
  } // 结束代码块

  /**
   * 获取配置元数据键
   * Get config metadata key
   */
  _metaKey(configKey) { // 调用 _metaKey
    return this.redis.key(this.prefix, 'meta', configKey); // 返回结果
  } // 结束代码块

  /**
   * 获取配置历史键
   * Get config history key
   */
  _historyKey(configKey) { // 调用 _historyKey
    return this.redis.key(this.prefix, 'history', configKey); // 返回结果
  } // 结束代码块

  /**
   * 获取配置锁键
   * Get config lock key
   */
  _lockKey(configKey) { // 调用 _lockKey
    return this.redis.key(this.prefix, 'lock', configKey); // 返回结果
  } // 结束代码块

  /**
   * 获取配置键列表键
   * Get config keys list key
   */
  _keysListKey() { // 调用 _keysListKey
    return this.redis.key(this.prefix, 'keys'); // 返回结果
  } // 结束代码块

  // ============================================
  // 写入操作 / Write Operations
  // ============================================

  /**
   * 设置配置
   * Set config
   *
   * @param {string} key - 配置键 / Config key
   * @param {any} value - 配置值 / Config value
   * @param {Object} options - 选项 / Options
   * @returns {Object} 结果 / Result
   */
  async set(key, value, options = {}) { // 执行语句
    const { description = '', keepHistory = this.options.keepHistory } = options; // 解构赋值
    const timestamp = Date.now(); // 定义常量 timestamp

    // 序列化值 / Serialize value
    const serializedValue = JSON.stringify(value); // 定义常量 serializedValue

    // 获取当前版本 / Get current version
    const currentMeta = await this.redis.hGetAll(this._metaKey(key)); // 定义常量 currentMeta
    const currentVersion = currentMeta.version ? parseInt(currentMeta.version, 10) : 0; // 定义常量 currentVersion
    const newVersion = currentVersion + 1; // 定义常量 newVersion

    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 如果需要保留历史，先保存当前值 / If keeping history, save current value first
      if (keepHistory && currentMeta.updatedAt) { // 条件判断 keepHistory && currentMeta.updatedAt
        const oldValue = await this.redis.hGet(this._dataKey(), key); // 定义常量 oldValue
        if (oldValue) { // 条件判断 oldValue
          multi.zAdd(this._historyKey(key), { // 调用 multi.zAdd
            score: parseInt(currentMeta.updatedAt, 10), // 分数
            value: JSON.stringify({ // value
              value: JSON.parse(oldValue), // value
              version: currentVersion, // version
              timestamp: parseInt(currentMeta.updatedAt, 10), // 时间戳
            }), // 结束代码块
          }); // 结束代码块

          // 限制历史数量 / Limit history count
          multi.zRemRangeByRank( // 调用 multi.zRemRangeByRank
            this._historyKey(key), // 调用 _historyKey
            0, // 执行语句
            -this.options.maxHistoryVersions - 1 // 执行语句
          ); // 结束调用或参数
        } // 结束代码块
      } // 结束代码块

      // 设置新值 / Set new value
      multi.hSet(this._dataKey(), key, serializedValue); // 调用 multi.hSet

      // 更新元数据 / Update metadata
      multi.hSet(this._metaKey(key), { // 调用 multi.hSet
        updatedAt: String(timestamp), // updatedAt
        version: String(newVersion), // version
        description, // 执行语句
      }); // 结束代码块

      // 添加到键列表 / Add to keys list
      multi.sAdd(this._keysListKey(), key); // 调用 multi.sAdd
    }); // 结束代码块

    return { key, version: newVersion, updatedAt: timestamp }; // 返回结果
  } // 结束代码块

  /**
   * 批量设置配置
   * Batch set configs
   *
   * @param {Object} configs - 配置对象 / Config object
   * @returns {Object} 结果 / Result
   */
  async setMany(configs) { // 执行语句
    const results = []; // 定义常量 results

    for (const [key, value] of Object.entries(configs)) { // 循环 const [key, value] of Object.entries(configs)
      const result = await this.set(key, value); // 定义常量 result
      results.push(result); // 调用 results.push
    } // 结束代码块

    return { count: results.length, results }; // 返回结果
  } // 结束代码块

  /**
   * 删除配置
   * Delete config
   *
   * @param {string} key - 配置键 / Config key
   * @param {Object} options - 选项 / Options
   * @returns {Object} 结果 / Result
   */
  async delete(key, options = {}) { // 执行语句
    const { keepHistory = false } = options; // 解构赋值

    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 删除配置值 / Delete config value
      multi.hDel(this._dataKey(), key); // 调用 multi.hDel

      // 删除元数据 / Delete metadata
      multi.del(this._metaKey(key)); // 调用 multi.del

      // 删除历史 (除非明确保留) / Delete history (unless explicitly kept)
      if (!keepHistory) { // 条件判断 !keepHistory
        multi.del(this._historyKey(key)); // 调用 multi.del
      } // 结束代码块

      // 从键列表移除 / Remove from keys list
      multi.sRem(this._keysListKey(), key); // 调用 multi.sRem
    }); // 结束代码块

    return { key, deleted: true }; // 返回结果
  } // 结束代码块

  // ============================================
  // 查询操作 / Query Operations
  // ============================================

  /**
   * 获取配置
   * Get config
   *
   * @param {string} key - 配置键 / Config key
   * @param {any} defaultValue - 默认值 / Default value
   * @returns {any} 配置值 / Config value
   */
  async get(key, defaultValue = null) { // 执行语句
    const value = await this.redis.hGet(this._dataKey(), key); // 定义常量 value

    if (value === null) { // 条件判断 value === null
      return defaultValue; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      return JSON.parse(value); // 返回结果
    } catch { // 执行语句
      return value; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 批量获取配置
   * Batch get configs
   *
   * @param {Array} keys - 配置键数组 / Config key array
   * @returns {Object} 配置对象 / Config object
   */
  async getMany(keys) { // 执行语句
    const values = await this.redis.hMGet(this._dataKey(), keys); // 定义常量 values
    const result = {}; // 定义常量 result

    keys.forEach((key, index) => { // 调用 keys.forEach
      if (values[index] !== null) { // 条件判断 values[index] !== null
        try { // 尝试执行
          result[key] = JSON.parse(values[index]); // 执行语句
        } catch { // 执行语句
          result[key] = values[index]; // 执行语句
        } // 结束代码块
      } // 结束代码块
    }); // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取所有配置
   * Get all configs
   *
   * @returns {Object} 所有配置 / All configs
   */
  async getAll() { // 执行语句
    const data = await this.redis.hGetAll(this._dataKey()); // 定义常量 data
    const result = {}; // 定义常量 result

    for (const [key, value] of Object.entries(data)) { // 循环 const [key, value] of Object.entries(data)
      try { // 尝试执行
        result[key] = JSON.parse(value); // 执行语句
      } catch { // 执行语句
        result[key] = value; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 检查配置是否存在
   * Check if config exists
   *
   * @param {string} key - 配置键 / Config key
   * @returns {boolean} 是否存在 / Whether exists
   */
  async has(key) { // 执行语句
    return this.redis.hExists(this._dataKey(), key); // 返回结果
  } // 结束代码块

  /**
   * 获取所有配置键
   * Get all config keys
   *
   * @returns {Array} 配置键数组 / Config key array
   */
  async keys() { // 执行语句
    return this.redis.sMembers(this._keysListKey()); // 返回结果
  } // 结束代码块

  /**
   * 获取配置元数据
   * Get config metadata
   *
   * @param {string} key - 配置键 / Config key
   * @returns {Object|null} 元数据 / Metadata
   */
  async getMeta(key) { // 执行语句
    const meta = await this.redis.hGetAll(this._metaKey(key)); // 定义常量 meta

    if (!meta || Object.keys(meta).length === 0) { // 条件判断 !meta || Object.keys(meta).length === 0
      return null; // 返回结果
    } // 结束代码块

    return { // 返回结果
      updatedAt: parseInt(meta.updatedAt, 10), // updatedAt
      version: parseInt(meta.version, 10), // version
      description: meta.description || '', // description
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取配置及其元数据
   * Get config with metadata
   *
   * @param {string} key - 配置键 / Config key
   * @returns {Object|null} 配置和元数据 / Config and metadata
   */
  async getWithMeta(key) { // 执行语句
    const value = await this.get(key); // 定义常量 value
    const meta = await this.getMeta(key); // 定义常量 meta

    if (value === null) { // 条件判断 value === null
      return null; // 返回结果
    } // 结束代码块

    return { // 返回结果
      key, // 执行语句
      value, // 执行语句
      ...meta, // 展开对象或数组
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 历史版本操作 / History Operations
  // ============================================

  /**
   * 获取配置历史
   * Get config history
   *
   * @param {string} key - 配置键 / Config key
   * @param {Object} options - 选项 / Options
   * @returns {Array} 历史版本数组 / History versions array
   */
  async getHistory(key, options = {}) { // 执行语句
    const { limit = 10 } = options; // 解构赋值

    const history = await this.redis.zRangeWithScores( // 定义常量 history
      this._historyKey(key), // 调用 _historyKey
      0, // 执行语句
      limit - 1, // 执行语句
      { REV: true } // 执行语句
    ); // 结束调用或参数

    return history.map(item => { // 返回结果
      try { // 尝试执行
        return JSON.parse(item.value); // 返回结果
      } catch { // 执行语句
        return { raw: item.value, timestamp: item.score }; // 返回结果
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取特定版本的配置
   * Get config at specific version
   *
   * @param {string} key - 配置键 / Config key
   * @param {number} version - 版本号 / Version number
   * @returns {any|null} 配置值 / Config value
   */
  async getVersion(key, version) { // 执行语句
    const history = await this.redis.zRange(this._historyKey(key), 0, -1); // 定义常量 history

    for (const item of history) { // 循环 const item of history
      try { // 尝试执行
        const parsed = JSON.parse(item); // 定义常量 parsed
        if (parsed.version === version) { // 条件判断 parsed.version === version
          return parsed.value; // 返回结果
        } // 结束代码块
      } catch { // 执行语句
        // 继续 / Continue
      } // 结束代码块
    } // 结束代码块

    // 检查当前版本 / Check current version
    const meta = await this.getMeta(key); // 定义常量 meta
    if (meta && meta.version === version) { // 条件判断 meta && meta.version === version
      return this.get(key); // 返回结果
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 回滚到指定版本
   * Rollback to specific version
   *
   * @param {string} key - 配置键 / Config key
   * @param {number} version - 目标版本 / Target version
   * @returns {Object} 结果 / Result
   */
  async rollback(key, version) { // 执行语句
    const value = await this.getVersion(key, version); // 定义常量 value

    if (value === null) { // 条件判断 value === null
      throw new Error(`Version ${version} not found for config: ${key}`); // 抛出异常
    } // 结束代码块

    return this.set(key, value, { // 返回结果
      description: `Rollback to version ${version}`, // description
    }); // 结束代码块
  } // 结束代码块

  /**
   * 清除配置历史
   * Clear config history
   *
   * @param {string} key - 配置键 / Config key
   * @returns {Object} 结果 / Result
   */
  async clearHistory(key) { // 执行语句
    await this.redis.del(this._historyKey(key)); // 等待异步结果
    return { key, cleared: true }; // 返回结果
  } // 结束代码块

  // ============================================
  // 原子操作 / Atomic Operations
  // ============================================

  /**
   * 原子增量操作
   * Atomic increment
   *
   * @param {string} key - 配置键 / Config key
   * @param {number} increment - 增量 / Increment
   * @returns {number} 新值 / New value
   */
  async increment(key, increment = 1) { // 执行语句
    const current = await this.get(key, 0); // 定义常量 current

    if (typeof current !== 'number') { // 条件判断 typeof current !== 'number'
      throw new Error(`Config ${key} is not a number`); // 抛出异常
    } // 结束代码块

    const newValue = current + increment; // 定义常量 newValue
    await this.set(key, newValue, { keepHistory: false }); // 等待异步结果

    return newValue; // 返回结果
  } // 结束代码块

  /**
   * 获取配置锁
   * Acquire config lock
   *
   * @param {string} key - 配置键 / Config key
   * @returns {string|null} 锁令牌 / Lock token
   */
  async acquireLock(key) { // 执行语句
    return this.redis.acquireLock( // 返回结果
      `config:${key}`, // 执行语句
      this.options.lockTTL // 访问 options
    ); // 结束调用或参数
  } // 结束代码块

  /**
   * 释放配置锁
   * Release config lock
   *
   * @param {string} key - 配置键 / Config key
   * @param {string} token - 锁令牌 / Lock token
   */
  async releaseLock(key, token) { // 执行语句
    return this.redis.releaseLock(`config:${key}`, token); // 返回结果
  } // 结束代码块

  /**
   * 使用锁执行配置更新
   * Update config with lock
   *
   * @param {string} key - 配置键 / Config key
   * @param {Function} updateFn - 更新函数 / Update function
   * @returns {any} 新值 / New value
   */
  async updateWithLock(key, updateFn) { // 执行语句
    const lockToken = await this.acquireLock(key); // 定义常量 lockToken

    if (!lockToken) { // 条件判断 !lockToken
      throw new Error(`Failed to acquire lock for config: ${key}`); // 抛出异常
    } // 结束代码块

    try { // 尝试执行
      const currentValue = await this.get(key); // 定义常量 currentValue
      const newValue = await updateFn(currentValue); // 定义常量 newValue
      await this.set(key, newValue); // 等待异步结果
      return newValue; // 返回结果
    } finally { // 执行语句
      await this.releaseLock(key, lockToken); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 统计方法 / Statistics Methods
  // ============================================

  /**
   * 获取存储统计
   * Get store statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  async getStats() { // 执行语句
    const keys = await this.keys(); // 定义常量 keys
    const count = keys.length; // 定义常量 count

    // 计算历史版本总数 / Calculate total history versions
    let totalHistoryVersions = 0; // 定义变量 totalHistoryVersions
    for (const key of keys) { // 循环 const key of keys
      const historyCount = await this.redis.zCard(this._historyKey(key)); // 定义常量 historyCount
      totalHistoryVersions += historyCount; // 执行语句
    } // 结束代码块

    return { // 返回结果
      configCount: count, // 配置数量
      totalHistoryVersions, // 执行语句
      keys, // 执行语句
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取配置数量
   * Get config count
   *
   * @returns {number} 配置数量 / Config count
   */
  async count() { // 执行语句
    return this.redis.sCard(this._keysListKey()); // 返回结果
  } // 结束代码块

  // ============================================
  // 导入导出 / Import/Export
  // ============================================

  /**
   * 导出所有配置
   * Export all configs
   *
   * @returns {Object} 导出数据 / Export data
   */
  async exportAll() { // 执行语句
    const configs = await this.getAll(); // 定义常量 configs
    const metas = {}; // 定义常量 metas

    for (const key of Object.keys(configs)) { // 循环 const key of Object.keys(configs)
      metas[key] = await this.getMeta(key); // 执行语句
    } // 结束代码块

    return { // 返回结果
      version: 1, // version
      exportedAt: Date.now(), // exportedAt
      configs, // 执行语句
      metadata: metas, // 元数据
    }; // 结束代码块
  } // 结束代码块

  /**
   * 导入配置
   * Import configs
   *
   * @param {Object} data - 导入数据 / Import data
   * @param {Object} options - 选项 / Options
   * @returns {Object} 结果 / Result
   */
  async importAll(data, options = {}) { // 执行语句
    const { overwrite = false, keepHistory = true } = options; // 解构赋值
    const results = { imported: 0, skipped: 0, errors: [] }; // 定义常量 results

    for (const [key, value] of Object.entries(data.configs || data)) { // 循环 const [key, value] of Object.entries(data.con...
      try { // 尝试执行
        // 检查是否存在 / Check if exists
        if (!overwrite && await this.has(key)) { // 条件判断 !overwrite && await this.has(key)
          results.skipped++; // 执行语句
          continue; // 继续下一轮循环
        } // 结束代码块

        await this.set(key, value, { keepHistory }); // 等待异步结果
        results.imported++; // 执行语句
      } catch (error) { // 执行语句
        results.errors.push({ key, error: error.message }); // 调用 results.errors.push
      } // 结束代码块
    } // 结束代码块

    return results; // 返回结果
  } // 结束代码块
} // 结束代码块

export { ConfigStore }; // 导出命名成员
export default ConfigStore; // 默认导出
