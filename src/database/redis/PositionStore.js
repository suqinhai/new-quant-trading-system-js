/**
 * 持仓 Redis 存储层
 * Position Redis Store
 *
 * 使用 Hash 存储持仓数据，Sorted Set 存储索引
 * Uses Hash for position data, Sorted Set for indexes
 *
 * Redis 数据结构设计 / Redis Data Structure Design:
 *
 * 1. 持仓数据 (Hash)
 *    Key: quant:pos:{positionId}
 *    Fields: positionId, symbol, side, entryPrice, currentPrice, amount, ...
 *
 * 2. 时间索引 (Sorted Set)
 *    Key: quant:pos:idx:time
 *    Score: openedAt timestamp
 *    Member: positionId
 *
 * 3. 状态索引 (Set)
 *    Key: quant:pos:idx:status:{status}
 *    Members: positionIds
 *
 * 4. 交易对索引 (Sorted Set)
 *    Key: quant:pos:idx:symbol:{symbol}
 *    Score: openedAt timestamp
 *    Member: positionId
 *
 * 5. 策略索引 (Sorted Set)
 *    Key: quant:pos:idx:strategy:{strategy}
 *    Score: openedAt timestamp
 *    Member: positionId
 *
 * 6. 活跃持仓快速索引 (Set) - 高频查询优化
 *    Key: quant:pos:idx:active
 *    Members: positionIds (仅包含 status=open 的持仓)
 *
 * @module src/database/redis/PositionStore
 */

import { KEY_PREFIX } from './RedisClient.js'; // 导入模块 ./RedisClient.js

/**
 * 持仓状态枚举
 * Position status enum
 */
export const POSITION_STATUS = { // 导出常量 POSITION_STATUS
  OPEN: 'open', // 设置 OPEN 字段
  CLOSED: 'closed', // 设置 CLOSED 字段
  LIQUIDATED: 'liquidated', // 设置 LIQUIDATED 字段
}; // 结束代码块

/**
 * 持仓方向枚举
 * Position side enum
 */
export const POSITION_SIDE = { // 导出常量 POSITION_SIDE
  LONG: 'long', // 设置 LONG 字段
  SHORT: 'short', // 设置 SHORT 字段
}; // 结束代码块

/**
 * 持仓存储类
 * Position Store Class
 */
class PositionStore { // 定义类 PositionStore
  constructor(redisClient) { // 构造函数
    this.redis = redisClient; // 设置 redis
    this.prefix = KEY_PREFIX.POSITION; // 设置 prefix
    this.indexPrefix = KEY_PREFIX.POSITION_INDEX; // 设置 indexPrefix
  } // 结束代码块

  // ============================================
  // 键生成方法 / Key Generation Methods
  // ============================================

  /**
   * 获取持仓数据键
   * Get position data key
   */
  _positionKey(positionId) { // 调用 _positionKey
    return this.redis.key(this.prefix, positionId); // 返回结果
  } // 结束代码块

  /**
   * 获取时间索引键
   * Get time index key
   */
  _timeIndexKey() { // 调用 _timeIndexKey
    return this.redis.key(this.indexPrefix, 'time'); // 返回结果
  } // 结束代码块

  /**
   * 获取状态索引键
   * Get status index key
   */
  _statusIndexKey(status) { // 调用 _statusIndexKey
    return this.redis.key(this.indexPrefix, 'status', status); // 返回结果
  } // 结束代码块

  /**
   * 获取交易对索引键
   * Get symbol index key
   */
  _symbolIndexKey(symbol) { // 调用 _symbolIndexKey
    return this.redis.key(this.indexPrefix, 'symbol', symbol); // 返回结果
  } // 结束代码块

  /**
   * 获取策略索引键
   * Get strategy index key
   */
  _strategyIndexKey(strategy) { // 调用 _strategyIndexKey
    return this.redis.key(this.indexPrefix, 'strategy', strategy); // 返回结果
  } // 结束代码块

  /**
   * 获取交易所索引键
   * Get exchange index key
   */
  _exchangeIndexKey(exchange) { // 调用 _exchangeIndexKey
    return this.redis.key(this.indexPrefix, 'exchange', exchange); // 返回结果
  } // 结束代码块

  /**
   * 获取活跃持仓索引键
   * Get active positions index key
   */
  _activeIndexKey() { // 调用 _activeIndexKey
    return this.redis.key(this.indexPrefix, 'active'); // 返回结果
  } // 结束代码块

  /**
   * 获取交易对+方向组合键 (用于快速查找同一交易对的持仓)
   * Get symbol+side composite key
   */
  _symbolSideKey(symbol, side) { // 调用 _symbolSideKey
    return this.redis.key(this.indexPrefix, 'symside', `${symbol}:${side}`); // 返回结果
  } // 结束代码块

  // ============================================
  // 数据序列化 / Data Serialization
  // ============================================

  /**
   * 序列化持仓到 Redis Hash
   * Serialize position to Redis Hash
   */
  _serialize(position) { // 调用 _serialize
    const data = { // 定义常量 data
      positionId: position.positionId || position.id || '', // 设置 positionId 字段
      symbol: position.symbol || '', // 设置 symbol 字段
      side: position.side || POSITION_SIDE.LONG, // 设置 side 字段
      entryPrice: String(position.entryPrice || 0), // 设置 entryPrice 字段
      currentPrice: String(position.currentPrice || position.entryPrice || 0), // 设置 currentPrice 字段
      amount: String(position.amount || 0), // 设置 amount 字段
      leverage: String(position.leverage || 1), // 设置 leverage 字段
      margin: String(position.margin || 0), // 设置 margin 字段
      unrealizedPnl: String(position.unrealizedPnl || 0), // 设置 unrealizedPnl 字段
      realizedPnl: String(position.realizedPnl || 0), // 设置 realizedPnl 字段
      liquidationPrice: String(position.liquidationPrice || 0), // 设置 liquidationPrice 字段
      exchange: position.exchange || '', // 设置 exchange 字段
      strategy: position.strategy || '', // 设置 strategy 字段
      openedAt: String(position.openedAt || Date.now()), // 设置 openedAt 字段
      updatedAt: String(position.updatedAt || Date.now()), // 设置 updatedAt 字段
      closedAt: String(position.closedAt || 0), // 设置 closedAt 字段
      status: position.status || POSITION_STATUS.OPEN, // 设置 status 字段
    }; // 结束代码块

    // 序列化 metadata
    if (position.metadata) { // 条件判断 position.metadata
      data.metadata = JSON.stringify(position.metadata); // 赋值 data.metadata
    } // 结束代码块

    return data; // 返回结果
  } // 结束代码块

  /**
   * 反序列化 Redis Hash 到持仓对象
   * Deserialize Redis Hash to position object
   */
  _deserialize(data) { // 调用 _deserialize
    if (!data || Object.keys(data).length === 0) { // 条件判断 !data || Object.keys(data).length === 0
      return null; // 返回结果
    } // 结束代码块

    const position = { // 定义常量 position
      positionId: data.positionId, // 设置 positionId 字段
      symbol: data.symbol, // 设置 symbol 字段
      side: data.side, // 设置 side 字段
      entryPrice: parseFloat(data.entryPrice), // 设置 entryPrice 字段
      currentPrice: parseFloat(data.currentPrice), // 设置 currentPrice 字段
      amount: parseFloat(data.amount), // 设置 amount 字段
      leverage: parseFloat(data.leverage), // 设置 leverage 字段
      margin: parseFloat(data.margin), // 设置 margin 字段
      unrealizedPnl: parseFloat(data.unrealizedPnl), // 设置 unrealizedPnl 字段
      realizedPnl: parseFloat(data.realizedPnl), // 设置 realizedPnl 字段
      liquidationPrice: parseFloat(data.liquidationPrice) || null, // 设置 liquidationPrice 字段
      exchange: data.exchange, // 设置 exchange 字段
      strategy: data.strategy || null, // 设置 strategy 字段
      openedAt: parseInt(data.openedAt, 10), // 设置 openedAt 字段
      updatedAt: parseInt(data.updatedAt, 10) || null, // 设置 updatedAt 字段
      closedAt: parseInt(data.closedAt, 10) || null, // 设置 closedAt 字段
      status: data.status, // 设置 status 字段
    }; // 结束代码块

    // 解析 metadata
    if (data.metadata) { // 条件判断 data.metadata
      try { // 尝试执行
        position.metadata = JSON.parse(data.metadata); // 赋值 position.metadata
      } catch { // 执行语句
        position.metadata = null; // 赋值 position.metadata
      } // 结束代码块
    } // 结束代码块

    return position; // 返回结果
  } // 结束代码块

  // ============================================
  // 写入操作 / Write Operations
  // ============================================

  /**
   * 插入持仓
   * Insert position
   *
   * @param {Object} position - 持仓数据 / Position data
   * @returns {Object} 结果 / Result
   */
  async insert(position) { // 执行语句
    const positionId = position.positionId || position.id; // 定义常量 positionId
    if (!positionId) { // 条件判断 !positionId
      throw new Error('Position ID is required'); // 抛出异常
    } // 结束代码块

    const openedAt = position.openedAt || Date.now(); // 定义常量 openedAt
    const serialized = this._serialize({ ...position, openedAt }); // 定义常量 serialized
    const isOpen = serialized.status === POSITION_STATUS.OPEN; // 定义常量 isOpen

    // 使用事务确保原子性 / Use transaction for atomicity
    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 存储持仓数据 / Store position data
      multi.hSet(this._positionKey(positionId), serialized); // 调用 multi.hSet

      // 添加时间索引 / Add time index
      multi.zAdd(this._timeIndexKey(), { score: openedAt, value: positionId }); // 调用 multi.zAdd

      // 添加状态索引 / Add status index
      multi.sAdd(this._statusIndexKey(serialized.status), positionId); // 调用 multi.sAdd

      // 如果是活跃持仓，添加活跃索引 / If open, add to active index
      if (isOpen) { // 条件判断 isOpen
        multi.sAdd(this._activeIndexKey(), positionId); // 调用 multi.sAdd
      } // 结束代码块

      // 添加交易对索引 / Add symbol index
      if (position.symbol) { // 条件判断 position.symbol
        multi.zAdd(this._symbolIndexKey(position.symbol), { score: openedAt, value: positionId }); // 调用 multi.zAdd

        // 添加交易对+方向索引 / Add symbol+side index
        if (position.side) { // 条件判断 position.side
          multi.sAdd(this._symbolSideKey(position.symbol, position.side), positionId); // 调用 multi.sAdd
        } // 结束代码块
      } // 结束代码块

      // 添加策略索引 / Add strategy index
      if (position.strategy) { // 条件判断 position.strategy
        multi.zAdd(this._strategyIndexKey(position.strategy), { score: openedAt, value: positionId }); // 调用 multi.zAdd
      } // 结束代码块

      // 添加交易所索引 / Add exchange index
      if (position.exchange) { // 条件判断 position.exchange
        multi.zAdd(this._exchangeIndexKey(position.exchange), { score: openedAt, value: positionId }); // 调用 multi.zAdd
      } // 结束代码块
    }); // 结束代码块

    return { positionId, changes: 1 }; // 返回结果
  } // 结束代码块

  /**
   * 更新持仓
   * Update position
   *
   * @param {Object} position - 持仓更新数据 / Position update data
   * @returns {Object} 结果 / Result
   */
  async update(position) { // 执行语句
    const positionId = position.positionId || position.id; // 定义常量 positionId
    if (!positionId) { // 条件判断 !positionId
      throw new Error('Position ID is required'); // 抛出异常
    } // 结束代码块

    // 获取旧持仓数据 / Get old position data
    const oldData = await this.redis.hGetAll(this._positionKey(positionId)); // 定义常量 oldData
    if (!oldData || Object.keys(oldData).length === 0) { // 条件判断 !oldData || Object.keys(oldData).length === 0
      throw new Error(`Position not found: ${positionId}`); // 抛出异常
    } // 结束代码块

    const oldStatus = oldData.status; // 定义常量 oldStatus
    const newStatus = position.status || oldStatus; // 定义常量 newStatus
    const updatedAt = Date.now(); // 定义常量 updatedAt

    // 准备更新数据 / Prepare update data
    const updates = { // 定义常量 updates
      updatedAt: String(updatedAt), // 设置 updatedAt 字段
    }; // 结束代码块

    if (position.currentPrice !== undefined) updates.currentPrice = String(position.currentPrice); // 条件判断 position.currentPrice !== undefined
    if (position.amount !== undefined) updates.amount = String(position.amount); // 条件判断 position.amount !== undefined
    if (position.unrealizedPnl !== undefined) updates.unrealizedPnl = String(position.unrealizedPnl); // 条件判断 position.unrealizedPnl !== undefined
    if (position.realizedPnl !== undefined) updates.realizedPnl = String(position.realizedPnl); // 条件判断 position.realizedPnl !== undefined
    if (position.margin !== undefined) updates.margin = String(position.margin); // 条件判断 position.margin !== undefined
    if (position.liquidationPrice !== undefined) updates.liquidationPrice = String(position.liquidationPrice); // 条件判断 position.liquidationPrice !== undefined
    if (position.status !== undefined) updates.status = position.status; // 条件判断 position.status !== undefined
    if (position.closedAt !== undefined) updates.closedAt = String(position.closedAt); // 条件判断 position.closedAt !== undefined

    // 使用事务 / Use transaction
    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 更新持仓数据 / Update position data
      multi.hSet(this._positionKey(positionId), updates); // 调用 multi.hSet

      // 如果状态变化，更新索引 / If status changed, update indexes
      if (newStatus !== oldStatus) { // 条件判断 newStatus !== oldStatus
        multi.sRem(this._statusIndexKey(oldStatus), positionId); // 调用 multi.sRem
        multi.sAdd(this._statusIndexKey(newStatus), positionId); // 调用 multi.sAdd

        // 更新活跃索引 / Update active index
        if (newStatus === POSITION_STATUS.OPEN) { // 条件判断 newStatus === POSITION_STATUS.OPEN
          multi.sAdd(this._activeIndexKey(), positionId); // 调用 multi.sAdd
        } else { // 执行语句
          multi.sRem(this._activeIndexKey(), positionId); // 调用 multi.sRem
        } // 结束代码块
      } // 结束代码块
    }); // 结束代码块

    return { positionId, changes: 1 }; // 返回结果
  } // 结束代码块

  /**
   * 批量更新持仓价格和盈亏
   * Batch update position prices and PnL
   *
   * @param {Array} updates - 更新数组 [{positionId, currentPrice, unrealizedPnl}]
   */
  async updatePrices(updates) { // 执行语句
    await this.redis.pipeline(async (pipe) => { // 等待异步结果
      const now = String(Date.now()); // 定义常量 now
      for (const update of updates) { // 循环 const update of updates
        const key = this._positionKey(update.positionId); // 定义常量 key
        pipe.hSet(key, { // 调用 pipe.hSet
          currentPrice: String(update.currentPrice), // 设置 currentPrice 字段
          unrealizedPnl: String(update.unrealizedPnl), // 设置 unrealizedPnl 字段
          updatedAt: now, // 设置 updatedAt 字段
        }); // 结束代码块
      } // 结束代码块
    }); // 结束代码块

    return { count: updates.length }; // 返回结果
  } // 结束代码块

  /**
   * 关闭持仓
   * Close position
   *
   * @param {string} positionId - 持仓ID / Position ID
   * @param {Object} closeData - 关闭数据 / Close data
   */
  async close(positionId, closeData = {}) { // 执行语句
    return this.update({ // 返回结果
      positionId, // 执行语句
      status: closeData.status || POSITION_STATUS.CLOSED, // 设置 status 字段
      closedAt: closeData.closedAt || Date.now(), // 设置 closedAt 字段
      realizedPnl: closeData.realizedPnl, // 设置 realizedPnl 字段
      currentPrice: closeData.currentPrice, // 设置 currentPrice 字段
    }); // 结束代码块
  } // 结束代码块

  /**
   * 删除持仓
   * Delete position
   *
   * @param {string} positionId - 持仓ID / Position ID
   */
  async delete(positionId) { // 执行语句
    const data = await this.redis.hGetAll(this._positionKey(positionId)); // 定义常量 data
    if (!data || Object.keys(data).length === 0) { // 条件判断 !data || Object.keys(data).length === 0
      return { changes: 0 }; // 返回结果
    } // 结束代码块

    await this.redis.transaction(async (multi) => { // 等待异步结果
      // 删除持仓数据 / Delete position data
      multi.del(this._positionKey(positionId)); // 调用 multi.del

      // 删除索引 / Delete indexes
      multi.zRem(this._timeIndexKey(), positionId); // 调用 multi.zRem
      multi.sRem(this._statusIndexKey(data.status), positionId); // 调用 multi.sRem
      multi.sRem(this._activeIndexKey(), positionId); // 调用 multi.sRem

      if (data.symbol) { // 条件判断 data.symbol
        multi.zRem(this._symbolIndexKey(data.symbol), positionId); // 调用 multi.zRem
        if (data.side) { // 条件判断 data.side
          multi.sRem(this._symbolSideKey(data.symbol, data.side), positionId); // 调用 multi.sRem
        } // 结束代码块
      } // 结束代码块
      if (data.strategy) { // 条件判断 data.strategy
        multi.zRem(this._strategyIndexKey(data.strategy), positionId); // 调用 multi.zRem
      } // 结束代码块
      if (data.exchange) { // 条件判断 data.exchange
        multi.zRem(this._exchangeIndexKey(data.exchange), positionId); // 调用 multi.zRem
      } // 结束代码块
    }); // 结束代码块

    return { changes: 1 }; // 返回结果
  } // 结束代码块

  // ============================================
  // 查询操作 / Query Operations
  // ============================================

  /**
   * 根据 ID 获取持仓
   * Get position by ID
   *
   * @param {string} positionId - 持仓ID / Position ID
   * @returns {Object|null} 持仓 / Position
   */
  async getById(positionId) { // 执行语句
    const data = await this.redis.hGetAll(this._positionKey(positionId)); // 定义常量 data
    return this._deserialize(data); // 返回结果
  } // 结束代码块

  /**
   * 获取所有活跃持仓
   * Get all open positions
   *
   * @returns {Array} 持仓数组 / Position array
   */
  async getOpenPositions() { // 执行语句
    const positionIds = await this.redis.sMembers(this._activeIndexKey()); // 定义常量 positionIds

    const positions = []; // 定义常量 positions
    for (const positionId of positionIds) { // 循环 const positionId of positionIds
      const position = await this.getById(positionId); // 定义常量 position
      if (position && position.status === POSITION_STATUS.OPEN) { // 条件判断 position && position.status === POSITION_STAT...
        positions.push(position); // 调用 positions.push
      } // 结束代码块
    } // 结束代码块

    // 按开仓时间倒序排序 / Sort by opened time desc
    positions.sort((a, b) => b.openedAt - a.openedAt); // 调用 positions.sort

    return positions; // 返回结果
  } // 结束代码块

  /**
   * 按交易对获取活跃持仓
   * Get open positions by symbol
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Array} 持仓数组 / Position array
   */
  async getOpenBySymbol(symbol) { // 执行语句
    const allOpen = await this.getOpenPositions(); // 定义常量 allOpen
    return allOpen.filter(p => p.symbol === symbol); // 返回结果
  } // 结束代码块

  /**
   * 按交易对和方向获取活跃持仓
   * Get open position by symbol and side
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} side - 方向 / Side
   * @returns {Object|null} 持仓 / Position
   */
  async getOpenBySymbolSide(symbol, side) { // 执行语句
    const positionIds = await this.redis.sMembers(this._symbolSideKey(symbol, side)); // 定义常量 positionIds

    for (const positionId of positionIds) { // 循环 const positionId of positionIds
      const position = await this.getById(positionId); // 定义常量 position
      if (position && position.status === POSITION_STATUS.OPEN) { // 条件判断 position && position.status === POSITION_STAT...
        return position; // 返回结果
      } // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 按策略获取活跃持仓
   * Get open positions by strategy
   *
   * @param {string} strategy - 策略名称 / Strategy name
   * @returns {Array} 持仓数组 / Position array
   */
  async getOpenByStrategy(strategy) { // 执行语句
    const allOpen = await this.getOpenPositions(); // 定义常量 allOpen
    return allOpen.filter(p => p.strategy === strategy); // 返回结果
  } // 结束代码块

  /**
   * 按交易所获取活跃持仓
   * Get open positions by exchange
   *
   * @param {string} exchange - 交易所 / Exchange
   * @returns {Array} 持仓数组 / Position array
   */
  async getOpenByExchange(exchange) { // 执行语句
    const allOpen = await this.getOpenPositions(); // 定义常量 allOpen
    return allOpen.filter(p => p.exchange === exchange); // 返回结果
  } // 结束代码块

  /**
   * 获取历史持仓
   * Get historical positions
   *
   * @param {Object} options - 选项 / Options
   * @returns {Array} 持仓数组 / Position array
   */
  async getHistorical(options = {}) { // 执行语句
    const { limit = 100, symbol, strategy, startTime, endTime } = options; // 解构赋值

    // 获取已关闭持仓ID / Get closed position IDs
    const closedIds = await this.redis.sMembers(this._statusIndexKey(POSITION_STATUS.CLOSED)); // 定义常量 closedIds
    const liquidatedIds = await this.redis.sMembers(this._statusIndexKey(POSITION_STATUS.LIQUIDATED)); // 定义常量 liquidatedIds
    const allIds = [...closedIds, ...liquidatedIds]; // 定义常量 allIds

    const positions = []; // 定义常量 positions
    for (const positionId of allIds) { // 循环 const positionId of allIds
      const position = await this.getById(positionId); // 定义常量 position
      if (position) { // 条件判断 position
        // 应用过滤器 / Apply filters
        if (symbol && position.symbol !== symbol) continue; // 条件判断 symbol && position.symbol !== symbol
        if (strategy && position.strategy !== strategy) continue; // 条件判断 strategy && position.strategy !== strategy
        if (startTime && position.openedAt < startTime) continue; // 条件判断 startTime && position.openedAt < startTime
        if (endTime && position.openedAt > endTime) continue; // 条件判断 endTime && position.openedAt > endTime

        positions.push(position); // 调用 positions.push
      } // 结束代码块
    } // 结束代码块

    // 按关闭时间倒序排序 / Sort by closed time desc
    positions.sort((a, b) => (b.closedAt || b.openedAt) - (a.closedAt || a.openedAt)); // 调用 positions.sort

    return positions.slice(0, limit); // 返回结果
  } // 结束代码块

  /**
   * 按状态获取持仓
   * Get positions by status
   *
   * @param {string} status - 状态 / Status
   * @returns {Array} 持仓数组 / Position array
   */
  async getByStatus(status) { // 执行语句
    const positionIds = await this.redis.sMembers(this._statusIndexKey(status)); // 定义常量 positionIds

    const positions = []; // 定义常量 positions
    for (const positionId of positionIds) { // 循环 const positionId of positionIds
      const position = await this.getById(positionId); // 定义常量 position
      if (position) { // 条件判断 position
        positions.push(position); // 调用 positions.push
      } // 结束代码块
    } // 结束代码块

    return positions; // 返回结果
  } // 结束代码块

  // ============================================
  // 统计方法 / Statistics Methods
  // ============================================

  /**
   * 获取持仓统计
   * Get position statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  async getStats() { // 执行语句
    const stats = { // 定义常量 stats
      total: 0, // 设置 total 字段
      open: 0, // 设置 open 字段
      closed: 0, // 设置 closed 字段
      liquidated: 0, // 设置 liquidated 字段
      bySymbol: {}, // 设置 bySymbol 字段
      totalUnrealizedPnl: 0, // 设置 totalUnrealizedPnl 字段
      totalRealizedPnl: 0, // 设置 totalRealizedPnl 字段
    }; // 结束代码块

    // 状态统计 / Status counts
    stats.open = await this.redis.sCard(this._statusIndexKey(POSITION_STATUS.OPEN)); // 赋值 stats.open
    stats.closed = await this.redis.sCard(this._statusIndexKey(POSITION_STATUS.CLOSED)); // 赋值 stats.closed
    stats.liquidated = await this.redis.sCard(this._statusIndexKey(POSITION_STATUS.LIQUIDATED)); // 赋值 stats.liquidated
    stats.total = stats.open + stats.closed + stats.liquidated; // 赋值 stats.total

    // 活跃持仓详情 / Active position details
    const openPositions = await this.getOpenPositions(); // 定义常量 openPositions
    for (const pos of openPositions) { // 循环 const pos of openPositions
      stats.totalUnrealizedPnl += pos.unrealizedPnl || 0; // 执行语句

      if (!stats.bySymbol[pos.symbol]) { // 条件判断 !stats.bySymbol[pos.symbol]
        stats.bySymbol[pos.symbol] = { long: 0, short: 0, total: 0 }; // 执行语句
      } // 结束代码块
      stats.bySymbol[pos.symbol][pos.side]++; // 执行语句
      stats.bySymbol[pos.symbol].total++; // 执行语句
    } // 结束代码块

    return stats; // 返回结果
  } // 结束代码块

  /**
   * 获取持仓汇总
   * Get position summary
   *
   * @returns {Object} 汇总数据 / Summary
   */
  async getSummary() { // 执行语句
    const openPositions = await this.getOpenPositions(); // 定义常量 openPositions

    let totalMargin = 0; // 定义变量 totalMargin
    let totalUnrealizedPnl = 0; // 定义变量 totalUnrealizedPnl
    let longCount = 0; // 定义变量 longCount
    let shortCount = 0; // 定义变量 shortCount

    for (const pos of openPositions) { // 循环 const pos of openPositions
      totalMargin += pos.margin || 0; // 执行语句
      totalUnrealizedPnl += pos.unrealizedPnl || 0; // 执行语句
      if (pos.side === POSITION_SIDE.LONG) longCount++; // 条件判断 pos.side === POSITION_SIDE.LONG
      else shortCount++; // 否则分支
    } // 结束代码块

    return { // 返回结果
      count: openPositions.length, // 设置 count 字段
      longCount, // 执行语句
      shortCount, // 执行语句
      totalMargin, // 执行语句
      totalUnrealizedPnl, // 执行语句
      positions: openPositions, // 设置 positions 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取活跃持仓数量
   * Get open position count
   *
   * @returns {number} 持仓数量 / Position count
   */
  async countOpen() { // 执行语句
    return this.redis.sCard(this._activeIndexKey()); // 返回结果
  } // 结束代码块

  // ============================================
  // 清理方法 / Cleanup Methods
  // ============================================

  /**
   * 清理旧的已关闭持仓
   * Clean up old closed positions
   *
   * @param {number} days - 保留天数 / Days to keep
   * @returns {number} 删除数量 / Deleted count
   */
  async cleanup(days = 90) { // 执行语句
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000; // 定义常量 cutoffTime
    let deleted = 0; // 定义变量 deleted

    // 获取已关闭持仓 / Get closed positions
    const closedIds = await this.redis.sMembers(this._statusIndexKey(POSITION_STATUS.CLOSED)); // 定义常量 closedIds
    const liquidatedIds = await this.redis.sMembers(this._statusIndexKey(POSITION_STATUS.LIQUIDATED)); // 定义常量 liquidatedIds

    for (const positionId of [...closedIds, ...liquidatedIds]) { // 循环 const positionId of [...closedIds, ...liquida...
      const position = await this.getById(positionId); // 定义常量 position
      if (position && (position.closedAt || position.openedAt) < cutoffTime) { // 条件判断 position && (position.closedAt || position.op...
        await this.delete(positionId); // 等待异步结果
        deleted++; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return deleted; // 返回结果
  } // 结束代码块
} // 结束代码块

export { PositionStore, POSITION_STATUS, POSITION_SIDE }; // 导出命名成员
export default PositionStore; // 默认导出
