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

import { KEY_PREFIX } from './RedisClient.js';

/**
 * 默认配置选项
 * Default config options
 */
const DEFAULT_OPTIONS = {
  // 是否保留历史版本 / Whether to keep history versions
  keepHistory: true,
  // 历史版本最大数量 / Max history versions
  maxHistoryVersions: 100,
  // 配置锁超时时间 (秒) / Config lock TTL (seconds)
  lockTTL: 30,
};

/**
 * 配置存储类
 * Config Store Class
 */
class ConfigStore {
  constructor(redisClient, options = {}) {
    this.redis = redisClient;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.prefix = KEY_PREFIX.CONFIG;
  }

  // ============================================
  // 键生成方法 / Key Generation Methods
  // ============================================

  /**
   * 获取配置数据键
   * Get config data key
   */
  _dataKey() {
    return this.redis.key(this.prefix, 'data');
  }

  /**
   * 获取配置元数据键
   * Get config metadata key
   */
  _metaKey(configKey) {
    return this.redis.key(this.prefix, 'meta', configKey);
  }

  /**
   * 获取配置历史键
   * Get config history key
   */
  _historyKey(configKey) {
    return this.redis.key(this.prefix, 'history', configKey);
  }

  /**
   * 获取配置锁键
   * Get config lock key
   */
  _lockKey(configKey) {
    return this.redis.key(this.prefix, 'lock', configKey);
  }

  /**
   * 获取配置键列表键
   * Get config keys list key
   */
  _keysListKey() {
    return this.redis.key(this.prefix, 'keys');
  }

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
  async set(key, value, options = {}) {
    const { description = '', keepHistory = this.options.keepHistory } = options;
    const timestamp = Date.now();

    // 序列化值 / Serialize value
    const serializedValue = JSON.stringify(value);

    // 获取当前版本 / Get current version
    const currentMeta = await this.redis.hGetAll(this._metaKey(key));
    const currentVersion = currentMeta.version ? parseInt(currentMeta.version, 10) : 0;
    const newVersion = currentVersion + 1;

    await this.redis.transaction(async (multi) => {
      // 如果需要保留历史，先保存当前值 / If keeping history, save current value first
      if (keepHistory && currentMeta.updatedAt) {
        const oldValue = await this.redis.hGet(this._dataKey(), key);
        if (oldValue) {
          multi.zAdd(this._historyKey(key), {
            score: parseInt(currentMeta.updatedAt, 10),
            value: JSON.stringify({
              value: JSON.parse(oldValue),
              version: currentVersion,
              timestamp: parseInt(currentMeta.updatedAt, 10),
            }),
          });

          // 限制历史数量 / Limit history count
          multi.zRemRangeByRank(
            this._historyKey(key),
            0,
            -this.options.maxHistoryVersions - 1
          );
        }
      }

      // 设置新值 / Set new value
      multi.hSet(this._dataKey(), key, serializedValue);

      // 更新元数据 / Update metadata
      multi.hSet(this._metaKey(key), {
        updatedAt: String(timestamp),
        version: String(newVersion),
        description,
      });

      // 添加到键列表 / Add to keys list
      multi.sAdd(this._keysListKey(), key);
    });

    return { key, version: newVersion, updatedAt: timestamp };
  }

  /**
   * 批量设置配置
   * Batch set configs
   *
   * @param {Object} configs - 配置对象 / Config object
   * @returns {Object} 结果 / Result
   */
  async setMany(configs) {
    const results = [];

    for (const [key, value] of Object.entries(configs)) {
      const result = await this.set(key, value);
      results.push(result);
    }

    return { count: results.length, results };
  }

  /**
   * 删除配置
   * Delete config
   *
   * @param {string} key - 配置键 / Config key
   * @param {Object} options - 选项 / Options
   * @returns {Object} 结果 / Result
   */
  async delete(key, options = {}) {
    const { keepHistory = false } = options;

    await this.redis.transaction(async (multi) => {
      // 删除配置值 / Delete config value
      multi.hDel(this._dataKey(), key);

      // 删除元数据 / Delete metadata
      multi.del(this._metaKey(key));

      // 删除历史 (除非明确保留) / Delete history (unless explicitly kept)
      if (!keepHistory) {
        multi.del(this._historyKey(key));
      }

      // 从键列表移除 / Remove from keys list
      multi.sRem(this._keysListKey(), key);
    });

    return { key, deleted: true };
  }

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
  async get(key, defaultValue = null) {
    const value = await this.redis.hGet(this._dataKey(), key);

    if (value === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  /**
   * 批量获取配置
   * Batch get configs
   *
   * @param {Array} keys - 配置键数组 / Config key array
   * @returns {Object} 配置对象 / Config object
   */
  async getMany(keys) {
    const values = await this.redis.hMGet(this._dataKey(), keys);
    const result = {};

    keys.forEach((key, index) => {
      if (values[index] !== null) {
        try {
          result[key] = JSON.parse(values[index]);
        } catch {
          result[key] = values[index];
        }
      }
    });

    return result;
  }

  /**
   * 获取所有配置
   * Get all configs
   *
   * @returns {Object} 所有配置 / All configs
   */
  async getAll() {
    const data = await this.redis.hGetAll(this._dataKey());
    const result = {};

    for (const [key, value] of Object.entries(data)) {
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 检查配置是否存在
   * Check if config exists
   *
   * @param {string} key - 配置键 / Config key
   * @returns {boolean} 是否存在 / Whether exists
   */
  async has(key) {
    return this.redis.hExists(this._dataKey(), key);
  }

  /**
   * 获取所有配置键
   * Get all config keys
   *
   * @returns {Array} 配置键数组 / Config key array
   */
  async keys() {
    return this.redis.sMembers(this._keysListKey());
  }

  /**
   * 获取配置元数据
   * Get config metadata
   *
   * @param {string} key - 配置键 / Config key
   * @returns {Object|null} 元数据 / Metadata
   */
  async getMeta(key) {
    const meta = await this.redis.hGetAll(this._metaKey(key));

    if (!meta || Object.keys(meta).length === 0) {
      return null;
    }

    return {
      updatedAt: parseInt(meta.updatedAt, 10),
      version: parseInt(meta.version, 10),
      description: meta.description || '',
    };
  }

  /**
   * 获取配置及其元数据
   * Get config with metadata
   *
   * @param {string} key - 配置键 / Config key
   * @returns {Object|null} 配置和元数据 / Config and metadata
   */
  async getWithMeta(key) {
    const value = await this.get(key);
    const meta = await this.getMeta(key);

    if (value === null) {
      return null;
    }

    return {
      key,
      value,
      ...meta,
    };
  }

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
  async getHistory(key, options = {}) {
    const { limit = 10 } = options;

    const history = await this.redis.zRangeWithScores(
      this._historyKey(key),
      0,
      limit - 1,
      { REV: true }
    );

    return history.map(item => {
      try {
        return JSON.parse(item.value);
      } catch {
        return { raw: item.value, timestamp: item.score };
      }
    });
  }

  /**
   * 获取特定版本的配置
   * Get config at specific version
   *
   * @param {string} key - 配置键 / Config key
   * @param {number} version - 版本号 / Version number
   * @returns {any|null} 配置值 / Config value
   */
  async getVersion(key, version) {
    const history = await this.redis.zRange(this._historyKey(key), 0, -1);

    for (const item of history) {
      try {
        const parsed = JSON.parse(item);
        if (parsed.version === version) {
          return parsed.value;
        }
      } catch {
        // 继续 / Continue
      }
    }

    // 检查当前版本 / Check current version
    const meta = await this.getMeta(key);
    if (meta && meta.version === version) {
      return this.get(key);
    }

    return null;
  }

  /**
   * 回滚到指定版本
   * Rollback to specific version
   *
   * @param {string} key - 配置键 / Config key
   * @param {number} version - 目标版本 / Target version
   * @returns {Object} 结果 / Result
   */
  async rollback(key, version) {
    const value = await this.getVersion(key, version);

    if (value === null) {
      throw new Error(`Version ${version} not found for config: ${key}`);
    }

    return this.set(key, value, {
      description: `Rollback to version ${version}`,
    });
  }

  /**
   * 清除配置历史
   * Clear config history
   *
   * @param {string} key - 配置键 / Config key
   * @returns {Object} 结果 / Result
   */
  async clearHistory(key) {
    await this.redis.del(this._historyKey(key));
    return { key, cleared: true };
  }

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
  async increment(key, increment = 1) {
    const current = await this.get(key, 0);

    if (typeof current !== 'number') {
      throw new Error(`Config ${key} is not a number`);
    }

    const newValue = current + increment;
    await this.set(key, newValue, { keepHistory: false });

    return newValue;
  }

  /**
   * 获取配置锁
   * Acquire config lock
   *
   * @param {string} key - 配置键 / Config key
   * @returns {string|null} 锁令牌 / Lock token
   */
  async acquireLock(key) {
    return this.redis.acquireLock(
      `config:${key}`,
      this.options.lockTTL
    );
  }

  /**
   * 释放配置锁
   * Release config lock
   *
   * @param {string} key - 配置键 / Config key
   * @param {string} token - 锁令牌 / Lock token
   */
  async releaseLock(key, token) {
    return this.redis.releaseLock(`config:${key}`, token);
  }

  /**
   * 使用锁执行配置更新
   * Update config with lock
   *
   * @param {string} key - 配置键 / Config key
   * @param {Function} updateFn - 更新函数 / Update function
   * @returns {any} 新值 / New value
   */
  async updateWithLock(key, updateFn) {
    const lockToken = await this.acquireLock(key);

    if (!lockToken) {
      throw new Error(`Failed to acquire lock for config: ${key}`);
    }

    try {
      const currentValue = await this.get(key);
      const newValue = await updateFn(currentValue);
      await this.set(key, newValue);
      return newValue;
    } finally {
      await this.releaseLock(key, lockToken);
    }
  }

  // ============================================
  // 统计方法 / Statistics Methods
  // ============================================

  /**
   * 获取存储统计
   * Get store statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  async getStats() {
    const keys = await this.keys();
    const count = keys.length;

    // 计算历史版本总数 / Calculate total history versions
    let totalHistoryVersions = 0;
    for (const key of keys) {
      const historyCount = await this.redis.zCard(this._historyKey(key));
      totalHistoryVersions += historyCount;
    }

    return {
      configCount: count,
      totalHistoryVersions,
      keys,
    };
  }

  /**
   * 获取配置数量
   * Get config count
   *
   * @returns {number} 配置数量 / Config count
   */
  async count() {
    return this.redis.sCard(this._keysListKey());
  }

  // ============================================
  // 导入导出 / Import/Export
  // ============================================

  /**
   * 导出所有配置
   * Export all configs
   *
   * @returns {Object} 导出数据 / Export data
   */
  async exportAll() {
    const configs = await this.getAll();
    const metas = {};

    for (const key of Object.keys(configs)) {
      metas[key] = await this.getMeta(key);
    }

    return {
      version: 1,
      exportedAt: Date.now(),
      configs,
      metadata: metas,
    };
  }

  /**
   * 导入配置
   * Import configs
   *
   * @param {Object} data - 导入数据 / Import data
   * @param {Object} options - 选项 / Options
   * @returns {Object} 结果 / Result
   */
  async importAll(data, options = {}) {
    const { overwrite = false, keepHistory = true } = options;
    const results = { imported: 0, skipped: 0, errors: [] };

    for (const [key, value] of Object.entries(data.configs || data)) {
      try {
        // 检查是否存在 / Check if exists
        if (!overwrite && await this.has(key)) {
          results.skipped++;
          continue;
        }

        await this.set(key, value, { keepHistory });
        results.imported++;
      } catch (error) {
        results.errors.push({ key, error: error.message });
      }
    }

    return results;
  }
}

export { ConfigStore };
export default ConfigStore;
