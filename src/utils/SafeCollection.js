/**
 * 线程安全集合工具类
 * Thread-Safe Collection Utilities
 *
 * 解决 Map/Set 在高并发场景下的竞态条件问题
 * Solves race condition issues with Map/Set in high-concurrency scenarios
 *
 * @module src/utils/SafeCollection
 */

/**
 * 异步互斥锁
 * Async Mutex Lock
 */
class AsyncLock {
  constructor() {
    this._locked = false;
    this._waiting = [];
  }

  /**
   * 获取锁
   * Acquire lock
   */
  async acquire() {
    while (this._locked) {
      await new Promise(resolve => this._waiting.push(resolve));
    }
    this._locked = true;
  }

  /**
   * 释放锁
   * Release lock
   */
  release() {
    this._locked = false;
    const next = this._waiting.shift();
    if (next) {
      next();
    }
  }

  /**
   * 在锁内执行操作
   * Execute operation within lock
   *
   * @param {Function} fn - 要执行的函数 / Function to execute
   * @returns {Promise<*>} 函数返回值 / Function return value
   */
  async withLock(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * 分段锁管理器 (减少锁竞争)
 * Segmented Lock Manager (reduces lock contention)
 */
class SegmentedLockManager {
  constructor(segmentCount = 16) {
    this.segmentCount = segmentCount;
    this.locks = Array.from({ length: segmentCount }, () => new AsyncLock());
  }

  /**
   * 根据 key 获取对应的锁
   * Get lock for key
   */
  getLock(key) {
    const hash = this._hash(key);
    return this.locks[hash % this.segmentCount];
  }

  /**
   * 简单哈希函数
   * Simple hash function
   */
  _hash(key) {
    const str = String(key);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * 线程安全 Map
 * Thread-Safe Map
 *
 * 特点 / Features:
 * 1. 使用分段锁减少竞争 / Uses segmented locks to reduce contention
 * 2. 支持原子复合操作 / Supports atomic compound operations
 * 3. 完全兼容原生 Map API / Fully compatible with native Map API
 */
export class SafeMap {
  constructor(entries = null) {
    this._map = new Map(entries);
    this._lockManager = new SegmentedLockManager();
    this._globalLock = new AsyncLock();
  }

  /**
   * 获取值 (线程安全)
   * Get value (thread-safe)
   */
  get(key) {
    return this._map.get(key);
  }

  /**
   * 设置值 (线程安全)
   * Set value (thread-safe)
   */
  async set(key, value) {
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      this._map.set(key, value);
      return this;
    } finally {
      lock.release();
    }
  }

  /**
   * 同步设置 (用于非关键路径)
   * Sync set (for non-critical paths)
   */
  setSync(key, value) {
    this._map.set(key, value);
    return this;
  }

  /**
   * 删除键 (线程安全)
   * Delete key (thread-safe)
   */
  async delete(key) {
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      return this._map.delete(key);
    } finally {
      lock.release();
    }
  }

  /**
   * 同步删除
   * Sync delete
   */
  deleteSync(key) {
    return this._map.delete(key);
  }

  /**
   * 检查键是否存在
   * Check if key exists
   */
  has(key) {
    return this._map.has(key);
  }

  /**
   * 获取大小
   * Get size
   */
  get size() {
    return this._map.size;
  }

  /**
   * 清空 (全局锁)
   * Clear (global lock)
   */
  async clear() {
    await this._globalLock.withLock(() => {
      this._map.clear();
    });
  }

  /**
   * 同步清空
   * Sync clear
   */
  clearSync() {
    this._map.clear();
  }

  /**
   * 迭代器
   * Iterators
   */
  keys() {
    return this._map.keys();
  }

  values() {
    return this._map.values();
  }

  entries() {
    return this._map.entries();
  }

  [Symbol.iterator]() {
    return this._map[Symbol.iterator]();
  }

  forEach(callback, thisArg) {
    this._map.forEach(callback, thisArg);
  }

  // ============================================
  // 原子复合操作 / Atomic Compound Operations
  // ============================================

  /**
   * 原子性的 get-or-create 操作
   * Atomic get-or-create operation
   *
   * @param {*} key - 键 / Key
   * @param {Function} createFn - 创建函数 / Create function
   * @returns {Promise<*>} 值 / Value
   */
  async getOrCreate(key, createFn) {
    // 先检查是否存在 (无锁快速路径)
    // First check if exists (lock-free fast path)
    if (this._map.has(key)) {
      return this._map.get(key);
    }

    // 获取锁后再次检查并创建
    // Acquire lock, check again and create
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      // 双重检查 / Double check
      if (this._map.has(key)) {
        return this._map.get(key);
      }

      // 创建新值 / Create new value
      const value = await createFn();
      this._map.set(key, value);
      return value;
    } finally {
      lock.release();
    }
  }

  /**
   * 原子性的 update 操作
   * Atomic update operation
   *
   * @param {*} key - 键 / Key
   * @param {Function} updateFn - 更新函数 (oldValue) => newValue / Update function
   * @returns {Promise<*>} 更新后的值 / Updated value
   */
  async update(key, updateFn) {
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      const oldValue = this._map.get(key);
      const newValue = await updateFn(oldValue);
      this._map.set(key, newValue);
      return newValue;
    } finally {
      lock.release();
    }
  }

  /**
   * 原子性的 update-if-present 操作
   * Atomic update-if-present operation
   */
  async updateIfPresent(key, updateFn) {
    if (!this._map.has(key)) {
      return null;
    }

    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      if (!this._map.has(key)) {
        return null;
      }
      const oldValue = this._map.get(key);
      const newValue = await updateFn(oldValue);
      this._map.set(key, newValue);
      return newValue;
    } finally {
      lock.release();
    }
  }

  /**
   * 原子性的 compute 操作
   * Atomic compute operation
   *
   * @param {*} key - 键 / Key
   * @param {Function} computeFn - 计算函数 (key, oldValue) => newValue / Compute function
   * @returns {Promise<*>} 计算后的值 / Computed value
   */
  async compute(key, computeFn) {
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      const oldValue = this._map.get(key);
      const newValue = await computeFn(key, oldValue);

      if (newValue === undefined) {
        this._map.delete(key);
      } else {
        this._map.set(key, newValue);
      }

      return newValue;
    } finally {
      lock.release();
    }
  }

  /**
   * 原子性的 increment 操作 (适用于数值)
   * Atomic increment operation (for numeric values)
   */
  async increment(key, delta = 1, defaultValue = 0) {
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      const current = this._map.get(key) ?? defaultValue;
      const newValue = current + delta;
      this._map.set(key, newValue);
      return newValue;
    } finally {
      lock.release();
    }
  }

  /**
   * 原子性的 delete-if 操作
   * Atomic delete-if operation
   */
  async deleteIf(key, predicateFn) {
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      const value = this._map.get(key);
      if (value !== undefined && predicateFn(value)) {
        this._map.delete(key);
        return true;
      }
      return false;
    } finally {
      lock.release();
    }
  }

  /**
   * 批量操作 (全局锁)
   * Batch operation (global lock)
   */
  async batch(operations) {
    await this._globalLock.withLock(async () => {
      for (const op of operations) {
        switch (op.type) {
          case 'set':
            this._map.set(op.key, op.value);
            break;
          case 'delete':
            this._map.delete(op.key);
            break;
          case 'update':
            if (this._map.has(op.key)) {
              const newValue = op.fn(this._map.get(op.key));
              this._map.set(op.key, newValue);
            }
            break;
        }
      }
    });
  }

  /**
   * 安全遍历并修改 (全局锁)
   * Safe iterate and modify (global lock)
   */
  async safeForEach(callback) {
    await this._globalLock.withLock(async () => {
      for (const [key, value] of this._map) {
        await callback(value, key, this._map);
      }
    });
  }

  /**
   * 安全清理过期项
   * Safe cleanup expired items
   */
  async cleanupExpired(isExpiredFn) {
    const keysToDelete = [];

    // 先收集要删除的键
    // First collect keys to delete
    for (const [key, value] of this._map) {
      if (isExpiredFn(value, key)) {
        keysToDelete.push(key);
      }
    }

    // 然后批量删除
    // Then batch delete
    for (const key of keysToDelete) {
      await this.delete(key);
    }

    return keysToDelete.length;
  }
}

/**
 * 线程安全 Set
 * Thread-Safe Set
 */
export class SafeSet {
  constructor(values = null) {
    this._set = new Set(values);
    this._lock = new AsyncLock();
  }

  /**
   * 添加值 (线程安全)
   * Add value (thread-safe)
   */
  async add(value) {
    await this._lock.acquire();
    try {
      this._set.add(value);
      return this;
    } finally {
      this._lock.release();
    }
  }

  /**
   * 同步添加
   * Sync add
   */
  addSync(value) {
    this._set.add(value);
    return this;
  }

  /**
   * 删除值 (线程安全)
   * Delete value (thread-safe)
   */
  async delete(value) {
    await this._lock.acquire();
    try {
      return this._set.delete(value);
    } finally {
      this._lock.release();
    }
  }

  /**
   * 同步删除
   * Sync delete
   */
  deleteSync(value) {
    return this._set.delete(value);
  }

  /**
   * 检查值是否存在
   * Check if value exists
   */
  has(value) {
    return this._set.has(value);
  }

  /**
   * 获取大小
   * Get size
   */
  get size() {
    return this._set.size;
  }

  /**
   * 清空 (线程安全)
   * Clear (thread-safe)
   */
  async clear() {
    await this._lock.acquire();
    try {
      this._set.clear();
    } finally {
      this._lock.release();
    }
  }

  /**
   * 同步清空
   * Sync clear
   */
  clearSync() {
    this._set.clear();
  }

  /**
   * 迭代器
   * Iterators
   */
  values() {
    return this._set.values();
  }

  keys() {
    return this._set.keys();
  }

  entries() {
    return this._set.entries();
  }

  [Symbol.iterator]() {
    return this._set[Symbol.iterator]();
  }

  forEach(callback, thisArg) {
    this._set.forEach(callback, thisArg);
  }

  // ============================================
  // 原子复合操作 / Atomic Compound Operations
  // ============================================

  /**
   * 原子性的 add-if-absent 操作
   * Atomic add-if-absent operation
   *
   * @returns {Promise<boolean>} true 如果添加成功 / true if added successfully
   */
  async addIfAbsent(value) {
    await this._lock.acquire();
    try {
      if (this._set.has(value)) {
        return false;
      }
      this._set.add(value);
      return true;
    } finally {
      this._lock.release();
    }
  }

  /**
   * 原子性的批量添加
   * Atomic batch add
   */
  async addAll(values) {
    await this._lock.acquire();
    try {
      for (const value of values) {
        this._set.add(value);
      }
      return this;
    } finally {
      this._lock.release();
    }
  }

  /**
   * 原子性的批量删除
   * Atomic batch delete
   */
  async deleteAll(values) {
    await this._lock.acquire();
    try {
      let deletedCount = 0;
      for (const value of values) {
        if (this._set.delete(value)) {
          deletedCount++;
        }
      }
      return deletedCount;
    } finally {
      this._lock.release();
    }
  }

  /**
   * 安全清理满足条件的项
   * Safe cleanup items matching predicate
   */
  async cleanupIf(predicateFn) {
    await this._lock.acquire();
    try {
      const toDelete = [];
      for (const value of this._set) {
        if (predicateFn(value)) {
          toDelete.push(value);
        }
      }
      for (const value of toDelete) {
        this._set.delete(value);
      }
      return toDelete.length;
    } finally {
      this._lock.release();
    }
  }

  /**
   * 限制大小 (删除最早的项)
   * Limit size (remove oldest items)
   */
  async limitSize(maxSize) {
    await this._lock.acquire();
    try {
      if (this._set.size <= maxSize) {
        return 0;
      }

      const toDelete = [];
      let count = 0;
      const deleteCount = this._set.size - maxSize;

      for (const value of this._set) {
        if (count >= deleteCount) break;
        toDelete.push(value);
        count++;
      }

      for (const value of toDelete) {
        this._set.delete(value);
      }

      return toDelete.length;
    } finally {
      this._lock.release();
    }
  }
}

/**
 * 带 TTL 的线程安全 Map
 * Thread-Safe Map with TTL
 */
export class SafeTTLMap extends SafeMap {
  constructor(defaultTTL = 60000) {
    super();
    this._defaultTTL = defaultTTL;
    this._expiries = new Map();

    // 启动自动清理
    // Start auto cleanup
    this._cleanupInterval = setInterval(() => {
      this._autoCleanup();
    }, Math.min(defaultTTL, 30000));
  }

  /**
   * 设置值 (带 TTL)
   * Set value (with TTL)
   */
  async set(key, value, ttl = null) {
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      this._map.set(key, value);
      this._expiries.set(key, Date.now() + (ttl ?? this._defaultTTL));
      return this;
    } finally {
      lock.release();
    }
  }

  /**
   * 获取值 (检查过期)
   * Get value (check expiry)
   */
  get(key) {
    const expiry = this._expiries.get(key);
    if (expiry && Date.now() > expiry) {
      // 已过期，异步删除
      // Expired, delete asynchronously
      this.delete(key).catch(() => {});
      return undefined;
    }
    return this._map.get(key);
  }

  /**
   * 检查是否存在 (考虑过期)
   * Check if exists (considering expiry)
   */
  has(key) {
    const expiry = this._expiries.get(key);
    if (expiry && Date.now() > expiry) {
      return false;
    }
    return this._map.has(key);
  }

  /**
   * 删除键
   * Delete key
   */
  async delete(key) {
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      this._expiries.delete(key);
      return this._map.delete(key);
    } finally {
      lock.release();
    }
  }

  /**
   * 刷新 TTL
   * Refresh TTL
   */
  async refresh(key, ttl = null) {
    const lock = this._lockManager.getLock(key);
    await lock.acquire();
    try {
      if (this._map.has(key)) {
        this._expiries.set(key, Date.now() + (ttl ?? this._defaultTTL));
        return true;
      }
      return false;
    } finally {
      lock.release();
    }
  }

  /**
   * 自动清理过期项
   * Auto cleanup expired items
   * @private
   */
  async _autoCleanup() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, expiry] of this._expiries) {
      if (now > expiry) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
    }
  }

  /**
   * 销毁 (清理定时器)
   * Destroy (cleanup timer)
   */
  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this._map.clear();
    this._expiries.clear();
  }
}

/**
 * 滑动窗口计数器 (线程安全)
 * Sliding Window Counter (thread-safe)
 *
 * 适用于限流场景
 * Suitable for rate limiting scenarios
 */
export class SafeSlidingWindowCounter {
  constructor(windowMs = 60000) {
    this._windowMs = windowMs;
    this._counters = new SafeMap();
    this._lock = new AsyncLock();
  }

  /**
   * 增加计数并检查是否超限
   * Increment count and check if exceeded
   *
   * @param {string} key - 键 / Key
   * @param {number} limit - 限制 / Limit
   * @returns {Promise<{ allowed: boolean, count: number, remaining: number }>}
   */
  async increment(key, limit) {
    return await this._counters.compute(key, (k, timestamps) => {
      const now = Date.now();
      const windowStart = now - this._windowMs;

      // 初始化或获取时间戳数组
      // Initialize or get timestamps array
      let arr = timestamps || [];

      // 移除过期的时间戳
      // Remove expired timestamps
      arr = arr.filter(ts => ts > windowStart);

      // 检查是否超限
      // Check if exceeded
      if (arr.length >= limit) {
        return arr; // 不添加新时间戳 / Don't add new timestamp
      }

      // 添加新时间戳
      // Add new timestamp
      arr.push(now);
      return arr;
    }).then(timestamps => {
      const count = timestamps ? timestamps.length : 0;
      const allowed = count > 0 && timestamps[timestamps.length - 1] === Math.max(...timestamps);

      // 重新判断是否是刚添加的
      const now = Date.now();
      const wasJustAdded = timestamps && timestamps.some(ts => now - ts < 100);

      return {
        allowed: wasJustAdded && count <= limit,
        count,
        remaining: Math.max(0, limit - count),
        reset: timestamps && timestamps.length > 0 ? timestamps[0] + this._windowMs : now + this._windowMs,
      };
    });
  }

  /**
   * 获取当前计数
   * Get current count
   */
  async getCount(key) {
    const timestamps = this._counters.get(key);
    if (!timestamps) return 0;

    const windowStart = Date.now() - this._windowMs;
    return timestamps.filter(ts => ts > windowStart).length;
  }

  /**
   * 重置计数
   * Reset count
   */
  async reset(key) {
    await this._counters.delete(key);
  }

  /**
   * 清理所有过期数据
   * Cleanup all expired data
   */
  async cleanup() {
    const now = Date.now();
    const windowStart = now - this._windowMs;

    await this._counters.safeForEach(async (timestamps, key) => {
      const valid = timestamps.filter(ts => ts > windowStart);
      if (valid.length === 0) {
        await this._counters.delete(key);
      } else if (valid.length !== timestamps.length) {
        await this._counters.set(key, valid);
      }
    });
  }
}

// 导出 AsyncLock 供外部使用
export { AsyncLock, SegmentedLockManager };

export default {
  SafeMap,
  SafeSet,
  SafeTTLMap,
  SafeSlidingWindowCounter,
  AsyncLock,
  SegmentedLockManager,
};
