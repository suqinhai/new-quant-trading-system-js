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
class AsyncLock { // 定义类 AsyncLock
  constructor() { // 构造函数
    this._locked = false; // 设置 _locked
    this._waiting = []; // 设置 _waiting
  } // 结束代码块

  /**
   * 获取锁
   * Acquire lock
   */
  async acquire() { // 执行语句
    while (this._locked) { // 循环条件 this._locked
      await new Promise(resolve => this._waiting.push(resolve)); // 等待异步结果
    } // 结束代码块
    this._locked = true; // 设置 _locked
  } // 结束代码块

  /**
   * 释放锁
   * Release lock
   */
  release() { // 调用 release
    this._locked = false; // 设置 _locked
    const next = this._waiting.shift(); // 定义常量 next
    if (next) { // 条件判断 next
      next(); // 调用 next
    } // 结束代码块
  } // 结束代码块

  /**
   * 在锁内执行操作
   * Execute operation within lock
   *
   * @param {Function} fn - 要执行的函数 / Function to execute
   * @returns {Promise<*>} 函数返回值 / Function return value
   */
  async withLock(fn) { // 执行语句
    await this.acquire(); // 等待异步结果
    try { // 尝试执行
      return await fn(); // 返回结果
    } finally { // 执行语句
      this.release(); // 调用 release
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 分段锁管理器 (减少锁竞争)
 * Segmented Lock Manager (reduces lock contention)
 */
class SegmentedLockManager { // 定义类 SegmentedLockManager
  constructor(segmentCount = 16) { // 构造函数
    this.segmentCount = segmentCount; // 设置 segmentCount
    this.locks = Array.from({ length: segmentCount }, () => new AsyncLock()); // 设置 locks
  } // 结束代码块

  /**
   * 根据 key 获取对应的锁
   * Get lock for key
   */
  getLock(key) { // 调用 getLock
    const hash = this._hash(key); // 定义常量 hash
    return this.locks[hash % this.segmentCount]; // 返回结果
  } // 结束代码块

  /**
   * 简单哈希函数
   * Simple hash function
   */
  _hash(key) { // 调用 _hash
    const str = String(key); // 定义常量 str
    let hash = 0; // 定义变量 hash
    for (let i = 0; i < str.length; i++) { // 循环 let i = 0; i < str.length; i++
      const char = str.charCodeAt(i); // 定义常量 char
      hash = ((hash << 5) - hash) + char; // 赋值 hash
      hash = hash & hash; // Convert to 32bit integer
    } // 结束代码块
    return Math.abs(hash); // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 线程安全 Map
 * Thread-Safe Map
 *
 * 特点 / Features:
 * 1. 使用分段锁减少竞争 / Uses segmented locks to reduce contention
 * 2. 支持原子复合操作 / Supports atomic compound operations
 * 3. 完全兼容原生 Map API / Fully compatible with native Map API
 */
export class SafeMap { // 导出类 SafeMap
  constructor(entries = null) { // 构造函数
    this._map = new Map(entries); // 设置 _map
    this._lockManager = new SegmentedLockManager(); // 设置 _lockManager
    this._globalLock = new AsyncLock(); // 设置 _globalLock
  } // 结束代码块

  /**
   * 获取值 (线程安全)
   * Get value (thread-safe)
   */
  get(key) { // 调用 get
    return this._map.get(key); // 返回结果
  } // 结束代码块

  /**
   * 设置值 (线程安全)
   * Set value (thread-safe)
   */
  async set(key, value) { // 执行语句
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      this._map.set(key, value); // 访问 _map
      return this; // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 同步设置 (用于非关键路径)
   * Sync set (for non-critical paths)
   */
  setSync(key, value) { // 调用 setSync
    this._map.set(key, value); // 访问 _map
    return this; // 返回结果
  } // 结束代码块

  /**
   * 删除键 (线程安全)
   * Delete key (thread-safe)
   */
  async delete(key) { // 执行语句
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      return this._map.delete(key); // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 同步删除
   * Sync delete
   */
  deleteSync(key) { // 调用 deleteSync
    return this._map.delete(key); // 返回结果
  } // 结束代码块

  /**
   * 检查键是否存在
   * Check if key exists
   */
  has(key) { // 调用 has
    return this._map.has(key); // 返回结果
  } // 结束代码块

  /**
   * 获取大小
   * Get size
   */
  get size() { // 执行语句
    return this._map.size; // 返回结果
  } // 结束代码块

  /**
   * 清空 (全局锁)
   * Clear (global lock)
   */
  async clear() { // 执行语句
    await this._globalLock.withLock(() => { // 等待异步结果
      this._map.clear(); // 访问 _map
    }); // 结束代码块
  } // 结束代码块

  /**
   * 同步清空
   * Sync clear
   */
  clearSync() { // 调用 clearSync
    this._map.clear(); // 访问 _map
  } // 结束代码块

  /**
   * 迭代器
   * Iterators
   */
  keys() { // 调用 keys
    return this._map.keys(); // 返回结果
  } // 结束代码块

  values() { // 调用 values
    return this._map.values(); // 返回结果
  } // 结束代码块

  entries() { // 调用 entries
    return this._map.entries(); // 返回结果
  } // 结束代码块

  [Symbol.iterator]() { // 执行语句
    return this._map[Symbol.iterator](); // 返回结果
  } // 结束代码块

  forEach(callback, thisArg) { // 调用 forEach
    this._map.forEach(callback, thisArg); // 访问 _map
  } // 结束代码块

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
  async getOrCreate(key, createFn) { // 执行语句
    // 先检查是否存在 (无锁快速路径)
    // First check if exists (lock-free fast path)
    if (this._map.has(key)) { // 条件判断 this._map.has(key)
      return this._map.get(key); // 返回结果
    } // 结束代码块

    // 获取锁后再次检查并创建
    // Acquire lock, check again and create
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      // 双重检查 / Double check
      if (this._map.has(key)) { // 条件判断 this._map.has(key)
        return this._map.get(key); // 返回结果
      } // 结束代码块

      // 创建新值 / Create new value
      const value = await createFn(); // 定义常量 value
      this._map.set(key, value); // 访问 _map
      return value; // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 原子性的 update 操作
   * Atomic update operation
   *
   * @param {*} key - 键 / Key
   * @param {Function} updateFn - 更新函数 (oldValue) => newValue / Update function
   * @returns {Promise<*>} 更新后的值 / Updated value
   */
  async update(key, updateFn) { // 执行语句
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      const oldValue = this._map.get(key); // 定义常量 oldValue
      const newValue = await updateFn(oldValue); // 定义常量 newValue
      this._map.set(key, newValue); // 访问 _map
      return newValue; // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 原子性的 update-if-present 操作
   * Atomic update-if-present operation
   */
  async updateIfPresent(key, updateFn) { // 执行语句
    if (!this._map.has(key)) { // 条件判断 !this._map.has(key)
      return null; // 返回结果
    } // 结束代码块

    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      if (!this._map.has(key)) { // 条件判断 !this._map.has(key)
        return null; // 返回结果
      } // 结束代码块
      const oldValue = this._map.get(key); // 定义常量 oldValue
      const newValue = await updateFn(oldValue); // 定义常量 newValue
      this._map.set(key, newValue); // 访问 _map
      return newValue; // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 原子性的 compute 操作
   * Atomic compute operation
   *
   * @param {*} key - 键 / Key
   * @param {Function} computeFn - 计算函数 (key, oldValue) => newValue / Compute function
   * @returns {Promise<*>} 计算后的值 / Computed value
   */
  async compute(key, computeFn) { // 执行语句
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      const oldValue = this._map.get(key); // 定义常量 oldValue
      const newValue = await computeFn(key, oldValue); // 定义常量 newValue

      if (newValue === undefined) { // 条件判断 newValue === undefined
        this._map.delete(key); // 访问 _map
      } else { // 执行语句
        this._map.set(key, newValue); // 访问 _map
      } // 结束代码块

      return newValue; // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 原子性的 increment 操作 (适用于数值)
   * Atomic increment operation (for numeric values)
   */
  async increment(key, delta = 1, defaultValue = 0) { // 执行语句
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      const current = this._map.get(key) ?? defaultValue; // 定义常量 current
      const newValue = current + delta; // 定义常量 newValue
      this._map.set(key, newValue); // 访问 _map
      return newValue; // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 原子性的 delete-if 操作
   * Atomic delete-if operation
   */
  async deleteIf(key, predicateFn) { // 执行语句
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      const value = this._map.get(key); // 定义常量 value
      if (value !== undefined && predicateFn(value)) { // 条件判断 value !== undefined && predicateFn(value)
        this._map.delete(key); // 访问 _map
        return true; // 返回结果
      } // 结束代码块
      return false; // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 批量操作 (全局锁)
   * Batch operation (global lock)
   */
  async batch(operations) { // 执行语句
    await this._globalLock.withLock(async () => { // 等待异步结果
      for (const op of operations) { // 循环 const op of operations
        switch (op.type) { // 分支选择 op.type
          case 'set': // 分支 'set'
            this._map.set(op.key, op.value); // 访问 _map
            break; // 跳出循环或分支
          case 'delete': // 分支 'delete'
            this._map.delete(op.key); // 访问 _map
            break; // 跳出循环或分支
          case 'update': // 分支 'update'
            if (this._map.has(op.key)) { // 条件判断 this._map.has(op.key)
              const newValue = op.fn(this._map.get(op.key)); // 定义常量 newValue
              this._map.set(op.key, newValue); // 访问 _map
            } // 结束代码块
            break; // 跳出循环或分支
        } // 结束代码块
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 安全遍历并修改 (全局锁)
   * Safe iterate and modify (global lock)
   */
  async safeForEach(callback) { // 执行语句
    await this._globalLock.withLock(async () => { // 等待异步结果
      for (const [key, value] of this._map) { // 循环 const [key, value] of this._map
        await callback(value, key, this._map); // 等待异步结果
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 安全清理过期项
   * Safe cleanup expired items
   */
  async cleanupExpired(isExpiredFn) { // 执行语句
    const keysToDelete = []; // 定义常量 keysToDelete

    // 先收集要删除的键
    // First collect keys to delete
    for (const [key, value] of this._map) { // 循环 const [key, value] of this._map
      if (isExpiredFn(value, key)) { // 条件判断 isExpiredFn(value, key)
        keysToDelete.push(key); // 调用 keysToDelete.push
      } // 结束代码块
    } // 结束代码块

    // 然后批量删除
    // Then batch delete
    for (const key of keysToDelete) { // 循环 const key of keysToDelete
      await this.delete(key); // 等待异步结果
    } // 结束代码块

    return keysToDelete.length; // 返回结果
  } // 结束代码块
} // 结束代码块

/**
 * 线程安全 Set
 * Thread-Safe Set
 */
export class SafeSet { // 导出类 SafeSet
  constructor(values = null) { // 构造函数
    this._set = new Set(values); // 设置 _set
    this._lock = new AsyncLock(); // 设置 _lock
  } // 结束代码块

  /**
   * 添加值 (线程安全)
   * Add value (thread-safe)
   */
  async add(value) { // 执行语句
    await this._lock.acquire(); // 等待异步结果
    try { // 尝试执行
      this._set.add(value); // 访问 _set
      return this; // 返回结果
    } finally { // 执行语句
      this._lock.release(); // 访问 _lock
    } // 结束代码块
  } // 结束代码块

  /**
   * 同步添加
   * Sync add
   */
  addSync(value) { // 调用 addSync
    this._set.add(value); // 访问 _set
    return this; // 返回结果
  } // 结束代码块

  /**
   * 删除值 (线程安全)
   * Delete value (thread-safe)
   */
  async delete(value) { // 执行语句
    await this._lock.acquire(); // 等待异步结果
    try { // 尝试执行
      return this._set.delete(value); // 返回结果
    } finally { // 执行语句
      this._lock.release(); // 访问 _lock
    } // 结束代码块
  } // 结束代码块

  /**
   * 同步删除
   * Sync delete
   */
  deleteSync(value) { // 调用 deleteSync
    return this._set.delete(value); // 返回结果
  } // 结束代码块

  /**
   * 检查值是否存在
   * Check if value exists
   */
  has(value) { // 调用 has
    return this._set.has(value); // 返回结果
  } // 结束代码块

  /**
   * 获取大小
   * Get size
   */
  get size() { // 执行语句
    return this._set.size; // 返回结果
  } // 结束代码块

  /**
   * 清空 (线程安全)
   * Clear (thread-safe)
   */
  async clear() { // 执行语句
    await this._lock.acquire(); // 等待异步结果
    try { // 尝试执行
      this._set.clear(); // 访问 _set
    } finally { // 执行语句
      this._lock.release(); // 访问 _lock
    } // 结束代码块
  } // 结束代码块

  /**
   * 同步清空
   * Sync clear
   */
  clearSync() { // 调用 clearSync
    this._set.clear(); // 访问 _set
  } // 结束代码块

  /**
   * 迭代器
   * Iterators
   */
  values() { // 调用 values
    return this._set.values(); // 返回结果
  } // 结束代码块

  keys() { // 调用 keys
    return this._set.keys(); // 返回结果
  } // 结束代码块

  entries() { // 调用 entries
    return this._set.entries(); // 返回结果
  } // 结束代码块

  [Symbol.iterator]() { // 执行语句
    return this._set[Symbol.iterator](); // 返回结果
  } // 结束代码块

  forEach(callback, thisArg) { // 调用 forEach
    this._set.forEach(callback, thisArg); // 访问 _set
  } // 结束代码块

  // ============================================
  // 原子复合操作 / Atomic Compound Operations
  // ============================================

  /**
   * 原子性的 add-if-absent 操作
   * Atomic add-if-absent operation
   *
   * @returns {Promise<boolean>} true 如果添加成功 / true if added successfully
   */
  async addIfAbsent(value) { // 执行语句
    await this._lock.acquire(); // 等待异步结果
    try { // 尝试执行
      if (this._set.has(value)) { // 条件判断 this._set.has(value)
        return false; // 返回结果
      } // 结束代码块
      this._set.add(value); // 访问 _set
      return true; // 返回结果
    } finally { // 执行语句
      this._lock.release(); // 访问 _lock
    } // 结束代码块
  } // 结束代码块

  /**
   * 原子性的批量添加
   * Atomic batch add
   */
  async addAll(values) { // 执行语句
    await this._lock.acquire(); // 等待异步结果
    try { // 尝试执行
      for (const value of values) { // 循环 const value of values
        this._set.add(value); // 访问 _set
      } // 结束代码块
      return this; // 返回结果
    } finally { // 执行语句
      this._lock.release(); // 访问 _lock
    } // 结束代码块
  } // 结束代码块

  /**
   * 原子性的批量删除
   * Atomic batch delete
   */
  async deleteAll(values) { // 执行语句
    await this._lock.acquire(); // 等待异步结果
    try { // 尝试执行
      let deletedCount = 0; // 定义变量 deletedCount
      for (const value of values) { // 循环 const value of values
        if (this._set.delete(value)) { // 条件判断 this._set.delete(value)
          deletedCount++; // 执行语句
        } // 结束代码块
      } // 结束代码块
      return deletedCount; // 返回结果
    } finally { // 执行语句
      this._lock.release(); // 访问 _lock
    } // 结束代码块
  } // 结束代码块

  /**
   * 安全清理满足条件的项
   * Safe cleanup items matching predicate
   */
  async cleanupIf(predicateFn) { // 执行语句
    await this._lock.acquire(); // 等待异步结果
    try { // 尝试执行
      const toDelete = []; // 定义常量 toDelete
      for (const value of this._set) { // 循环 const value of this._set
        if (predicateFn(value)) { // 条件判断 predicateFn(value)
          toDelete.push(value); // 调用 toDelete.push
        } // 结束代码块
      } // 结束代码块
      for (const value of toDelete) { // 循环 const value of toDelete
        this._set.delete(value); // 访问 _set
      } // 结束代码块
      return toDelete.length; // 返回结果
    } finally { // 执行语句
      this._lock.release(); // 访问 _lock
    } // 结束代码块
  } // 结束代码块

  /**
   * 限制大小 (删除最早的项)
   * Limit size (remove oldest items)
   */
  async limitSize(maxSize) { // 执行语句
    await this._lock.acquire(); // 等待异步结果
    try { // 尝试执行
      if (this._set.size <= maxSize) { // 条件判断 this._set.size <= maxSize
        return 0; // 返回结果
      } // 结束代码块

      const toDelete = []; // 定义常量 toDelete
      let count = 0; // 定义变量 count
      const deleteCount = this._set.size - maxSize; // 定义常量 deleteCount

      for (const value of this._set) { // 循环 const value of this._set
        if (count >= deleteCount) break; // 条件判断 count >= deleteCount
        toDelete.push(value); // 调用 toDelete.push
        count++; // 执行语句
      } // 结束代码块

      for (const value of toDelete) { // 循环 const value of toDelete
        this._set.delete(value); // 访问 _set
      } // 结束代码块

      return toDelete.length; // 返回结果
    } finally { // 执行语句
      this._lock.release(); // 访问 _lock
    } // 结束代码块
  } // 结束代码块
} // 结束代码块

/**
 * 带 TTL 的线程安全 Map
 * Thread-Safe Map with TTL
 */
export class SafeTTLMap extends SafeMap { // 导出类 SafeTTLMap
  constructor(defaultTTL = 60000) { // 构造函数
    super(); // 调用父类
    this._defaultTTL = defaultTTL; // 设置 _defaultTTL
    this._expiries = new Map(); // 设置 _expiries

    // 启动自动清理
    // Start auto cleanup
    this._cleanupInterval = setInterval(() => { // 设置 _cleanupInterval
      this._autoCleanup(); // 调用 _autoCleanup
    }, Math.min(defaultTTL, 30000)); // 执行语句
  } // 结束代码块

  /**
   * 设置值 (带 TTL)
   * Set value (with TTL)
   */
  async set(key, value, ttl = null) { // 执行语句
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      this._map.set(key, value); // 访问 _map
      this._expiries.set(key, Date.now() + (ttl ?? this._defaultTTL)); // 访问 _expiries
      return this; // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取值 (检查过期)
   * Get value (check expiry)
   */
  get(key) { // 调用 get
    const expiry = this._expiries.get(key); // 定义常量 expiry
    if (expiry && Date.now() > expiry) { // 条件判断 expiry && Date.now() > expiry
      // 已过期，异步删除
      // Expired, delete asynchronously
      this.delete(key).catch(() => {}); // 调用 delete
      return undefined; // 返回结果
    } // 结束代码块
    return this._map.get(key); // 返回结果
  } // 结束代码块

  /**
   * 检查是否存在 (考虑过期)
   * Check if exists (considering expiry)
   */
  has(key) { // 调用 has
    const expiry = this._expiries.get(key); // 定义常量 expiry
    if (expiry && Date.now() > expiry) { // 条件判断 expiry && Date.now() > expiry
      return false; // 返回结果
    } // 结束代码块
    return this._map.has(key); // 返回结果
  } // 结束代码块

  /**
   * 删除键
   * Delete key
   */
  async delete(key) { // 执行语句
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      this._expiries.delete(key); // 访问 _expiries
      return this._map.delete(key); // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 刷新 TTL
   * Refresh TTL
   */
  async refresh(key, ttl = null) { // 执行语句
    const lock = this._lockManager.getLock(key); // 定义常量 lock
    await lock.acquire(); // 等待异步结果
    try { // 尝试执行
      if (this._map.has(key)) { // 条件判断 this._map.has(key)
        this._expiries.set(key, Date.now() + (ttl ?? this._defaultTTL)); // 访问 _expiries
        return true; // 返回结果
      } // 结束代码块
      return false; // 返回结果
    } finally { // 执行语句
      lock.release(); // 调用 lock.release
    } // 结束代码块
  } // 结束代码块

  /**
   * 自动清理过期项
   * Auto cleanup expired items
   * @private
   */
  async _autoCleanup() { // 执行语句
    const now = Date.now(); // 定义常量 now
    const keysToDelete = []; // 定义常量 keysToDelete

    for (const [key, expiry] of this._expiries) { // 循环 const [key, expiry] of this._expiries
      if (now > expiry) { // 条件判断 now > expiry
        keysToDelete.push(key); // 调用 keysToDelete.push
      } // 结束代码块
    } // 结束代码块

    for (const key of keysToDelete) { // 循环 const key of keysToDelete
      await this.delete(key); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 销毁 (清理定时器)
   * Destroy (cleanup timer)
   */
  destroy() { // 调用 destroy
    if (this._cleanupInterval) { // 条件判断 this._cleanupInterval
      clearInterval(this._cleanupInterval); // 调用 clearInterval
      this._cleanupInterval = null; // 设置 _cleanupInterval
    } // 结束代码块
    this._map.clear(); // 访问 _map
    this._expiries.clear(); // 访问 _expiries
  } // 结束代码块
} // 结束代码块

/**
 * 滑动窗口计数器 (线程安全)
 * Sliding Window Counter (thread-safe)
 *
 * 适用于限流场景
 * Suitable for rate limiting scenarios
 */
export class SafeSlidingWindowCounter { // 导出类 SafeSlidingWindowCounter
  constructor(windowMs = 60000) { // 构造函数
    this._windowMs = windowMs; // 设置 _windowMs
    this._counters = new SafeMap(); // 设置 _counters
    this._lock = new AsyncLock(); // 设置 _lock
  } // 结束代码块

  /**
   * 增加计数并检查是否超限
   * Increment count and check if exceeded
   *
   * @param {string} key - 键 / Key
   * @param {number} limit - 限制 / Limit
   * @returns {Promise<{ allowed: boolean, count: number, remaining: number }>}
   */
  async increment(key, limit) { // 执行语句
    return await this._counters.compute(key, (k, timestamps) => { // 返回结果
      const now = Date.now(); // 定义常量 now
      const windowStart = now - this._windowMs; // 定义常量 windowStart

      // 初始化或获取时间戳数组
      // Initialize or get timestamps array
      let arr = timestamps || []; // 定义变量 arr

      // 移除过期的时间戳
      // Remove expired timestamps
      arr = arr.filter(ts => ts > windowStart); // 赋值 arr

      // 检查是否超限
      // Check if exceeded
      if (arr.length >= limit) { // 条件判断 arr.length >= limit
        return arr; // 不添加新时间戳 / Don't add new timestamp
      } // 结束代码块

      // 添加新时间戳
      // Add new timestamp
      arr.push(now); // 调用 arr.push
      return arr; // 返回结果
    }).then(timestamps => { // 定义箭头函数
      const count = timestamps ? timestamps.length : 0; // 定义常量 count
      const allowed = count > 0 && timestamps[timestamps.length - 1] === Math.max(...timestamps); // 定义常量 allowed

      // 重新判断是否是刚添加的
      const now = Date.now(); // 定义常量 now
      const wasJustAdded = timestamps && timestamps.some(ts => now - ts < 100); // 定义函数 wasJustAdded

      return { // 返回结果
        allowed: wasJustAdded && count <= limit, // 设置 allowed 字段
        count, // 执行语句
        remaining: Math.max(0, limit - count), // 设置 remaining 字段
        reset: timestamps && timestamps.length > 0 ? timestamps[0] + this._windowMs : now + this._windowMs, // 设置 reset 字段
      }; // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  /**
   * 获取当前计数
   * Get current count
   */
  async getCount(key) { // 执行语句
    const timestamps = this._counters.get(key); // 定义常量 timestamps
    if (!timestamps) return 0; // 条件判断 !timestamps

    const windowStart = Date.now() - this._windowMs; // 定义常量 windowStart
    return timestamps.filter(ts => ts > windowStart).length; // 返回结果
  } // 结束代码块

  /**
   * 重置计数
   * Reset count
   */
  async reset(key) { // 执行语句
    await this._counters.delete(key); // 等待异步结果
  } // 结束代码块

  /**
   * 清理所有过期数据
   * Cleanup all expired data
   */
  async cleanup() { // 执行语句
    const now = Date.now(); // 定义常量 now
    const windowStart = now - this._windowMs; // 定义常量 windowStart

    await this._counters.safeForEach(async (timestamps, key) => { // 等待异步结果
      const valid = timestamps.filter(ts => ts > windowStart); // 定义函数 valid
      if (valid.length === 0) { // 条件判断 valid.length === 0
        await this._counters.delete(key); // 等待异步结果
      } else if (valid.length !== timestamps.length) { // 执行语句
        await this._counters.set(key, valid); // 等待异步结果
      } // 结束代码块
    }); // 结束代码块
  } // 结束代码块
} // 结束代码块

// 导出 AsyncLock 供外部使用
export { AsyncLock, SegmentedLockManager }; // 导出命名成员

export default { // 默认导出
  SafeMap, // 执行语句
  SafeSet, // 执行语句
  SafeTTLMap, // 执行语句
  SafeSlidingWindowCounter, // 执行语句
  AsyncLock, // 执行语句
  SegmentedLockManager, // 执行语句
}; // 结束代码块
