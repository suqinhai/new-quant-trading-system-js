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

import { KEY_PREFIX } from './RedisClient.js';

/**
 * 持仓状态枚举
 * Position status enum
 */
export const POSITION_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  LIQUIDATED: 'liquidated',
};

/**
 * 持仓方向枚举
 * Position side enum
 */
export const POSITION_SIDE = {
  LONG: 'long',
  SHORT: 'short',
};

/**
 * 持仓存储类
 * Position Store Class
 */
class PositionStore {
  constructor(redisClient) {
    this.redis = redisClient;
    this.prefix = KEY_PREFIX.POSITION;
    this.indexPrefix = KEY_PREFIX.POSITION_INDEX;
  }

  // ============================================
  // 键生成方法 / Key Generation Methods
  // ============================================

  /**
   * 获取持仓数据键
   * Get position data key
   */
  _positionKey(positionId) {
    return this.redis.key(this.prefix, positionId);
  }

  /**
   * 获取时间索引键
   * Get time index key
   */
  _timeIndexKey() {
    return this.redis.key(this.indexPrefix, 'time');
  }

  /**
   * 获取状态索引键
   * Get status index key
   */
  _statusIndexKey(status) {
    return this.redis.key(this.indexPrefix, 'status', status);
  }

  /**
   * 获取交易对索引键
   * Get symbol index key
   */
  _symbolIndexKey(symbol) {
    return this.redis.key(this.indexPrefix, 'symbol', symbol);
  }

  /**
   * 获取策略索引键
   * Get strategy index key
   */
  _strategyIndexKey(strategy) {
    return this.redis.key(this.indexPrefix, 'strategy', strategy);
  }

  /**
   * 获取交易所索引键
   * Get exchange index key
   */
  _exchangeIndexKey(exchange) {
    return this.redis.key(this.indexPrefix, 'exchange', exchange);
  }

  /**
   * 获取活跃持仓索引键
   * Get active positions index key
   */
  _activeIndexKey() {
    return this.redis.key(this.indexPrefix, 'active');
  }

  /**
   * 获取交易对+方向组合键 (用于快速查找同一交易对的持仓)
   * Get symbol+side composite key
   */
  _symbolSideKey(symbol, side) {
    return this.redis.key(this.indexPrefix, 'symside', `${symbol}:${side}`);
  }

  // ============================================
  // 数据序列化 / Data Serialization
  // ============================================

  /**
   * 序列化持仓到 Redis Hash
   * Serialize position to Redis Hash
   */
  _serialize(position) {
    const data = {
      positionId: position.positionId || position.id || '',
      symbol: position.symbol || '',
      side: position.side || POSITION_SIDE.LONG,
      entryPrice: String(position.entryPrice || 0),
      currentPrice: String(position.currentPrice || position.entryPrice || 0),
      amount: String(position.amount || 0),
      leverage: String(position.leverage || 1),
      margin: String(position.margin || 0),
      unrealizedPnl: String(position.unrealizedPnl || 0),
      realizedPnl: String(position.realizedPnl || 0),
      liquidationPrice: String(position.liquidationPrice || 0),
      exchange: position.exchange || '',
      strategy: position.strategy || '',
      openedAt: String(position.openedAt || Date.now()),
      updatedAt: String(position.updatedAt || Date.now()),
      closedAt: String(position.closedAt || 0),
      status: position.status || POSITION_STATUS.OPEN,
    };

    // 序列化 metadata
    if (position.metadata) {
      data.metadata = JSON.stringify(position.metadata);
    }

    return data;
  }

  /**
   * 反序列化 Redis Hash 到持仓对象
   * Deserialize Redis Hash to position object
   */
  _deserialize(data) {
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const position = {
      positionId: data.positionId,
      symbol: data.symbol,
      side: data.side,
      entryPrice: parseFloat(data.entryPrice),
      currentPrice: parseFloat(data.currentPrice),
      amount: parseFloat(data.amount),
      leverage: parseFloat(data.leverage),
      margin: parseFloat(data.margin),
      unrealizedPnl: parseFloat(data.unrealizedPnl),
      realizedPnl: parseFloat(data.realizedPnl),
      liquidationPrice: parseFloat(data.liquidationPrice) || null,
      exchange: data.exchange,
      strategy: data.strategy || null,
      openedAt: parseInt(data.openedAt, 10),
      updatedAt: parseInt(data.updatedAt, 10) || null,
      closedAt: parseInt(data.closedAt, 10) || null,
      status: data.status,
    };

    // 解析 metadata
    if (data.metadata) {
      try {
        position.metadata = JSON.parse(data.metadata);
      } catch {
        position.metadata = null;
      }
    }

    return position;
  }

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
  async insert(position) {
    const positionId = position.positionId || position.id;
    if (!positionId) {
      throw new Error('Position ID is required');
    }

    const openedAt = position.openedAt || Date.now();
    const serialized = this._serialize({ ...position, openedAt });
    const isOpen = serialized.status === POSITION_STATUS.OPEN;

    // 使用事务确保原子性 / Use transaction for atomicity
    await this.redis.transaction(async (multi) => {
      // 存储持仓数据 / Store position data
      multi.hSet(this._positionKey(positionId), serialized);

      // 添加时间索引 / Add time index
      multi.zAdd(this._timeIndexKey(), { score: openedAt, value: positionId });

      // 添加状态索引 / Add status index
      multi.sAdd(this._statusIndexKey(serialized.status), positionId);

      // 如果是活跃持仓，添加活跃索引 / If open, add to active index
      if (isOpen) {
        multi.sAdd(this._activeIndexKey(), positionId);
      }

      // 添加交易对索引 / Add symbol index
      if (position.symbol) {
        multi.zAdd(this._symbolIndexKey(position.symbol), { score: openedAt, value: positionId });

        // 添加交易对+方向索引 / Add symbol+side index
        if (position.side) {
          multi.sAdd(this._symbolSideKey(position.symbol, position.side), positionId);
        }
      }

      // 添加策略索引 / Add strategy index
      if (position.strategy) {
        multi.zAdd(this._strategyIndexKey(position.strategy), { score: openedAt, value: positionId });
      }

      // 添加交易所索引 / Add exchange index
      if (position.exchange) {
        multi.zAdd(this._exchangeIndexKey(position.exchange), { score: openedAt, value: positionId });
      }
    });

    return { positionId, changes: 1 };
  }

  /**
   * 更新持仓
   * Update position
   *
   * @param {Object} position - 持仓更新数据 / Position update data
   * @returns {Object} 结果 / Result
   */
  async update(position) {
    const positionId = position.positionId || position.id;
    if (!positionId) {
      throw new Error('Position ID is required');
    }

    // 获取旧持仓数据 / Get old position data
    const oldData = await this.redis.hGetAll(this._positionKey(positionId));
    if (!oldData || Object.keys(oldData).length === 0) {
      throw new Error(`Position not found: ${positionId}`);
    }

    const oldStatus = oldData.status;
    const newStatus = position.status || oldStatus;
    const updatedAt = Date.now();

    // 准备更新数据 / Prepare update data
    const updates = {
      updatedAt: String(updatedAt),
    };

    if (position.currentPrice !== undefined) updates.currentPrice = String(position.currentPrice);
    if (position.amount !== undefined) updates.amount = String(position.amount);
    if (position.unrealizedPnl !== undefined) updates.unrealizedPnl = String(position.unrealizedPnl);
    if (position.realizedPnl !== undefined) updates.realizedPnl = String(position.realizedPnl);
    if (position.margin !== undefined) updates.margin = String(position.margin);
    if (position.liquidationPrice !== undefined) updates.liquidationPrice = String(position.liquidationPrice);
    if (position.status !== undefined) updates.status = position.status;
    if (position.closedAt !== undefined) updates.closedAt = String(position.closedAt);

    // 使用事务 / Use transaction
    await this.redis.transaction(async (multi) => {
      // 更新持仓数据 / Update position data
      multi.hSet(this._positionKey(positionId), updates);

      // 如果状态变化，更新索引 / If status changed, update indexes
      if (newStatus !== oldStatus) {
        multi.sRem(this._statusIndexKey(oldStatus), positionId);
        multi.sAdd(this._statusIndexKey(newStatus), positionId);

        // 更新活跃索引 / Update active index
        if (newStatus === POSITION_STATUS.OPEN) {
          multi.sAdd(this._activeIndexKey(), positionId);
        } else {
          multi.sRem(this._activeIndexKey(), positionId);
        }
      }
    });

    return { positionId, changes: 1 };
  }

  /**
   * 批量更新持仓价格和盈亏
   * Batch update position prices and PnL
   *
   * @param {Array} updates - 更新数组 [{positionId, currentPrice, unrealizedPnl}]
   */
  async updatePrices(updates) {
    await this.redis.pipeline(async (pipe) => {
      const now = String(Date.now());
      for (const update of updates) {
        const key = this._positionKey(update.positionId);
        pipe.hSet(key, {
          currentPrice: String(update.currentPrice),
          unrealizedPnl: String(update.unrealizedPnl),
          updatedAt: now,
        });
      }
    });

    return { count: updates.length };
  }

  /**
   * 关闭持仓
   * Close position
   *
   * @param {string} positionId - 持仓ID / Position ID
   * @param {Object} closeData - 关闭数据 / Close data
   */
  async close(positionId, closeData = {}) {
    return this.update({
      positionId,
      status: closeData.status || POSITION_STATUS.CLOSED,
      closedAt: closeData.closedAt || Date.now(),
      realizedPnl: closeData.realizedPnl,
      currentPrice: closeData.currentPrice,
    });
  }

  /**
   * 删除持仓
   * Delete position
   *
   * @param {string} positionId - 持仓ID / Position ID
   */
  async delete(positionId) {
    const data = await this.redis.hGetAll(this._positionKey(positionId));
    if (!data || Object.keys(data).length === 0) {
      return { changes: 0 };
    }

    await this.redis.transaction(async (multi) => {
      // 删除持仓数据 / Delete position data
      multi.del(this._positionKey(positionId));

      // 删除索引 / Delete indexes
      multi.zRem(this._timeIndexKey(), positionId);
      multi.sRem(this._statusIndexKey(data.status), positionId);
      multi.sRem(this._activeIndexKey(), positionId);

      if (data.symbol) {
        multi.zRem(this._symbolIndexKey(data.symbol), positionId);
        if (data.side) {
          multi.sRem(this._symbolSideKey(data.symbol, data.side), positionId);
        }
      }
      if (data.strategy) {
        multi.zRem(this._strategyIndexKey(data.strategy), positionId);
      }
      if (data.exchange) {
        multi.zRem(this._exchangeIndexKey(data.exchange), positionId);
      }
    });

    return { changes: 1 };
  }

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
  async getById(positionId) {
    const data = await this.redis.hGetAll(this._positionKey(positionId));
    return this._deserialize(data);
  }

  /**
   * 获取所有活跃持仓
   * Get all open positions
   *
   * @returns {Array} 持仓数组 / Position array
   */
  async getOpenPositions() {
    const positionIds = await this.redis.sMembers(this._activeIndexKey());

    const positions = [];
    for (const positionId of positionIds) {
      const position = await this.getById(positionId);
      if (position && position.status === POSITION_STATUS.OPEN) {
        positions.push(position);
      }
    }

    // 按开仓时间倒序排序 / Sort by opened time desc
    positions.sort((a, b) => b.openedAt - a.openedAt);

    return positions;
  }

  /**
   * 按交易对获取活跃持仓
   * Get open positions by symbol
   *
   * @param {string} symbol - 交易对 / Symbol
   * @returns {Array} 持仓数组 / Position array
   */
  async getOpenBySymbol(symbol) {
    const allOpen = await this.getOpenPositions();
    return allOpen.filter(p => p.symbol === symbol);
  }

  /**
   * 按交易对和方向获取活跃持仓
   * Get open position by symbol and side
   *
   * @param {string} symbol - 交易对 / Symbol
   * @param {string} side - 方向 / Side
   * @returns {Object|null} 持仓 / Position
   */
  async getOpenBySymbolSide(symbol, side) {
    const positionIds = await this.redis.sMembers(this._symbolSideKey(symbol, side));

    for (const positionId of positionIds) {
      const position = await this.getById(positionId);
      if (position && position.status === POSITION_STATUS.OPEN) {
        return position;
      }
    }

    return null;
  }

  /**
   * 按策略获取活跃持仓
   * Get open positions by strategy
   *
   * @param {string} strategy - 策略名称 / Strategy name
   * @returns {Array} 持仓数组 / Position array
   */
  async getOpenByStrategy(strategy) {
    const allOpen = await this.getOpenPositions();
    return allOpen.filter(p => p.strategy === strategy);
  }

  /**
   * 按交易所获取活跃持仓
   * Get open positions by exchange
   *
   * @param {string} exchange - 交易所 / Exchange
   * @returns {Array} 持仓数组 / Position array
   */
  async getOpenByExchange(exchange) {
    const allOpen = await this.getOpenPositions();
    return allOpen.filter(p => p.exchange === exchange);
  }

  /**
   * 获取历史持仓
   * Get historical positions
   *
   * @param {Object} options - 选项 / Options
   * @returns {Array} 持仓数组 / Position array
   */
  async getHistorical(options = {}) {
    const { limit = 100, symbol, strategy, startTime, endTime } = options;

    // 获取已关闭持仓ID / Get closed position IDs
    const closedIds = await this.redis.sMembers(this._statusIndexKey(POSITION_STATUS.CLOSED));
    const liquidatedIds = await this.redis.sMembers(this._statusIndexKey(POSITION_STATUS.LIQUIDATED));
    const allIds = [...closedIds, ...liquidatedIds];

    const positions = [];
    for (const positionId of allIds) {
      const position = await this.getById(positionId);
      if (position) {
        // 应用过滤器 / Apply filters
        if (symbol && position.symbol !== symbol) continue;
        if (strategy && position.strategy !== strategy) continue;
        if (startTime && position.openedAt < startTime) continue;
        if (endTime && position.openedAt > endTime) continue;

        positions.push(position);
      }
    }

    // 按关闭时间倒序排序 / Sort by closed time desc
    positions.sort((a, b) => (b.closedAt || b.openedAt) - (a.closedAt || a.openedAt));

    return positions.slice(0, limit);
  }

  /**
   * 按状态获取持仓
   * Get positions by status
   *
   * @param {string} status - 状态 / Status
   * @returns {Array} 持仓数组 / Position array
   */
  async getByStatus(status) {
    const positionIds = await this.redis.sMembers(this._statusIndexKey(status));

    const positions = [];
    for (const positionId of positionIds) {
      const position = await this.getById(positionId);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  // ============================================
  // 统计方法 / Statistics Methods
  // ============================================

  /**
   * 获取持仓统计
   * Get position statistics
   *
   * @returns {Object} 统计数据 / Statistics
   */
  async getStats() {
    const stats = {
      total: 0,
      open: 0,
      closed: 0,
      liquidated: 0,
      bySymbol: {},
      totalUnrealizedPnl: 0,
      totalRealizedPnl: 0,
    };

    // 状态统计 / Status counts
    stats.open = await this.redis.sCard(this._statusIndexKey(POSITION_STATUS.OPEN));
    stats.closed = await this.redis.sCard(this._statusIndexKey(POSITION_STATUS.CLOSED));
    stats.liquidated = await this.redis.sCard(this._statusIndexKey(POSITION_STATUS.LIQUIDATED));
    stats.total = stats.open + stats.closed + stats.liquidated;

    // 活跃持仓详情 / Active position details
    const openPositions = await this.getOpenPositions();
    for (const pos of openPositions) {
      stats.totalUnrealizedPnl += pos.unrealizedPnl || 0;

      if (!stats.bySymbol[pos.symbol]) {
        stats.bySymbol[pos.symbol] = { long: 0, short: 0, total: 0 };
      }
      stats.bySymbol[pos.symbol][pos.side]++;
      stats.bySymbol[pos.symbol].total++;
    }

    return stats;
  }

  /**
   * 获取持仓汇总
   * Get position summary
   *
   * @returns {Object} 汇总数据 / Summary
   */
  async getSummary() {
    const openPositions = await this.getOpenPositions();

    let totalMargin = 0;
    let totalUnrealizedPnl = 0;
    let longCount = 0;
    let shortCount = 0;

    for (const pos of openPositions) {
      totalMargin += pos.margin || 0;
      totalUnrealizedPnl += pos.unrealizedPnl || 0;
      if (pos.side === POSITION_SIDE.LONG) longCount++;
      else shortCount++;
    }

    return {
      count: openPositions.length,
      longCount,
      shortCount,
      totalMargin,
      totalUnrealizedPnl,
      positions: openPositions,
    };
  }

  /**
   * 获取活跃持仓数量
   * Get open position count
   *
   * @returns {number} 持仓数量 / Position count
   */
  async countOpen() {
    return this.redis.sCard(this._activeIndexKey());
  }

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
  async cleanup(days = 90) {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    let deleted = 0;

    // 获取已关闭持仓 / Get closed positions
    const closedIds = await this.redis.sMembers(this._statusIndexKey(POSITION_STATUS.CLOSED));
    const liquidatedIds = await this.redis.sMembers(this._statusIndexKey(POSITION_STATUS.LIQUIDATED));

    for (const positionId of [...closedIds, ...liquidatedIds]) {
      const position = await this.getById(positionId);
      if (position && (position.closedAt || position.openedAt) < cutoffTime) {
        await this.delete(positionId);
        deleted++;
      }
    }

    return deleted;
  }
}

export { PositionStore, POSITION_STATUS, POSITION_SIDE };
export default PositionStore;
