/**
 * 数据持久化集成测试
 * Data Persistence Integration Tests
 *
 * TEST-009: 测试 Redis 和 ClickHouse 数据存储、归档和恢复
 * @module tests/integration/dataPersistence.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Redis 存储 Mock
// ============================================

class RedisStoreMock {
  constructor() {
    this.data = new Map();
    this.hashes = new Map();
    this.sortedSets = new Map();
    this.lists = new Map();
    this.connected = false;
    this.events = [];
  }

  emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
  }

  async connect() {
    this.connected = true;
    this.emit('connected');
    return true;
  }

  async disconnect() {
    this.connected = false;
    this.emit('disconnected');
    return true;
  }

  // 基本操作
  async set(key, value, options = {}) {
    this._checkConnection();
    const entry = {
      value: typeof value === 'object' ? JSON.stringify(value) : value,
      expireAt: options.EX ? Date.now() + options.EX * 1000 : null,
    };
    this.data.set(key, entry);
    return 'OK';
  }

  async get(key) {
    this._checkConnection();
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expireAt && entry.expireAt < Date.now()) {
      this.data.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value);
    } catch {
      return entry.value;
    }
  }

  async del(key) {
    this._checkConnection();
    return this.data.delete(key) ? 1 : 0;
  }

  async exists(key) {
    this._checkConnection();
    return this.data.has(key) ? 1 : 0;
  }

  async keys(pattern) {
    this._checkConnection();
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.data.keys()).filter(k => regex.test(k));
  }

  // Hash 操作
  async hset(key, field, value) {
    this._checkConnection();
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map());
    }
    this.hashes.get(key).set(field, typeof value === 'object' ? JSON.stringify(value) : value);
    return 1;
  }

  async hget(key, field) {
    this._checkConnection();
    const hash = this.hashes.get(key);
    if (!hash) return null;
    const value = hash.get(field);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  async hgetall(key) {
    this._checkConnection();
    const hash = this.hashes.get(key);
    if (!hash) return {};
    const result = {};
    for (const [field, value] of hash) {
      try {
        result[field] = JSON.parse(value);
      } catch {
        result[field] = value;
      }
    }
    return result;
  }

  async hdel(key, ...fields) {
    this._checkConnection();
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    let count = 0;
    for (const field of fields) {
      if (hash.delete(field)) count++;
    }
    return count;
  }

  // Sorted Set 操作
  async zadd(key, score, member) {
    this._checkConnection();
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, new Map());
    }
    this.sortedSets.get(key).set(member, score);
    return 1;
  }

  async zrange(key, start, stop, options = {}) {
    this._checkConnection();
    const set = this.sortedSets.get(key);
    if (!set) return [];

    const entries = Array.from(set.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(start, stop === -1 ? undefined : stop + 1);

    if (options.WITHSCORES) {
      return entries.flatMap(([member, score]) => [member, score]);
    }
    return entries.map(([member]) => member);
  }

  async zrangebyscore(key, min, max) {
    this._checkConnection();
    const set = this.sortedSets.get(key);
    if (!set) return [];

    return Array.from(set.entries())
      .filter(([, score]) => score >= min && score <= max)
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
  }

  async zrem(key, member) {
    this._checkConnection();
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    return set.delete(member) ? 1 : 0;
  }

  // List 操作
  async lpush(key, ...values) {
    this._checkConnection();
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    this.lists.get(key).unshift(...values);
    return this.lists.get(key).length;
  }

  async rpush(key, ...values) {
    this._checkConnection();
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    this.lists.get(key).push(...values);
    return this.lists.get(key).length;
  }

  async lrange(key, start, stop) {
    this._checkConnection();
    const list = this.lists.get(key);
    if (!list) return [];
    return list.slice(start, stop === -1 ? undefined : stop + 1);
  }

  async llen(key) {
    this._checkConnection();
    const list = this.lists.get(key);
    return list ? list.length : 0;
  }

  // 事务
  multi() {
    return {
      commands: [],
      set: function(key, value) { this.commands.push(['set', key, value]); return this; },
      hset: function(key, field, value) { this.commands.push(['hset', key, field, value]); return this; },
      zadd: function(key, score, member) { this.commands.push(['zadd', key, score, member]); return this; },
      exec: async () => this.commands.map(() => 'OK'),
    };
  }

  _checkConnection() {
    if (!this.connected) {
      throw new Error('Redis not connected');
    }
  }

  // 清理
  async flushall() {
    this.data.clear();
    this.hashes.clear();
    this.sortedSets.clear();
    this.lists.clear();
    return 'OK';
  }
}

// ============================================
// ClickHouse 存储 Mock
// ============================================

class ClickHouseStoreMock {
  constructor() {
    this.tables = new Map();
    this.connected = false;
    this.events = [];
  }

  emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
  }

  async connect() {
    this.connected = true;
    this.emit('connected');
    return true;
  }

  async disconnect() {
    this.connected = false;
    this.emit('disconnected');
    return true;
  }

  async createTable(tableName, schema) {
    this._checkConnection();
    this.tables.set(tableName, {
      schema,
      rows: [],
    });
    return true;
  }

  async insert(tableName, rows) {
    this._checkConnection();
    const table = this.tables.get(tableName);
    if (!table) {
      throw new Error(`Table ${tableName} not found`);
    }

    const rowsArray = Array.isArray(rows) ? rows : [rows];
    for (const row of rowsArray) {
      table.rows.push({
        ...row,
        _inserted_at: Date.now(),
      });
    }

    this.emit('inserted', { tableName, count: rowsArray.length });
    return rowsArray.length;
  }

  async query(sql, params = {}) {
    this._checkConnection();

    // 简单 SQL 解析
    const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
    if (!selectMatch) {
      throw new Error('Invalid SQL');
    }

    const tableName = selectMatch[2];
    const table = this.tables.get(tableName);
    if (!table) {
      return [];
    }

    let results = [...table.rows];

    // WHERE 解析
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
    if (whereMatch) {
      const conditions = whereMatch[1];

      // 简单条件解析
      if (conditions.includes('>=') && conditions.includes('<=')) {
        const rangeMatch = conditions.match(/(\w+)\s*>=\s*'?([^']+)'?\s+AND\s+\1\s*<=\s*'?([^']+)'?/i);
        if (rangeMatch) {
          const [, field, min, max] = rangeMatch;
          results = results.filter(row => {
            const value = row[field];
            return value >= min && value <= max;
          });
        }
      } else if (conditions.includes('=')) {
        const eqMatch = conditions.match(/(\w+)\s*=\s*'?([^']+)'?/i);
        if (eqMatch) {
          const [, field, value] = eqMatch;
          results = results.filter(row => String(row[field]) === value);
        }
      }
    }

    // ORDER BY 解析
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)\s+(ASC|DESC)?/i);
    if (orderMatch) {
      const [, field, direction] = orderMatch;
      results.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return direction?.toUpperCase() === 'DESC' ? -cmp : cmp;
      });
    }

    // LIMIT 解析
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      results = results.slice(0, parseInt(limitMatch[1]));
    }

    return results;
  }

  async count(tableName) {
    this._checkConnection();
    const table = this.tables.get(tableName);
    return table ? table.rows.length : 0;
  }

  async truncate(tableName) {
    this._checkConnection();
    const table = this.tables.get(tableName);
    if (table) {
      table.rows = [];
    }
    return true;
  }

  _checkConnection() {
    if (!this.connected) {
      throw new Error('ClickHouse not connected');
    }
  }
}

// ============================================
// 数据归档服务 Mock
// ============================================

class DataArchiveServiceMock {
  constructor(redis, clickhouse) {
    this.redis = redis;
    this.clickhouse = clickhouse;
    this.archiveConfig = {
      orderRetentionHours: 24,
      tradeRetentionHours: 168, // 7 days
      batchSize: 100,
    };
    this.stats = {
      ordersArchived: 0,
      tradesArchived: 0,
      lastArchiveTime: null,
    };
    this.events = [];
  }

  emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
  }

  async archiveOrders() {
    const cutoffTime = Date.now() - this.archiveConfig.orderRetentionHours * 3600 * 1000;

    // 获取过期的订单
    const orderKeys = await this.redis.keys('order:*');
    let archivedCount = 0;

    for (const key of orderKeys) {
      const order = await this.redis.get(key);
      if (order && order.createdAt && order.createdAt < cutoffTime) {
        if (order.status === 'filled' || order.status === 'canceled') {
          // 归档到 ClickHouse
          await this.clickhouse.insert('orders_archive', {
            order_id: order.id,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            amount: order.amount,
            price: order.price,
            status: order.status,
            created_at: new Date(order.createdAt).toISOString(),
            filled_at: order.filledAt ? new Date(order.filledAt).toISOString() : null,
          });

          // 从 Redis 删除
          await this.redis.del(key);
          archivedCount++;
        }
      }
    }

    this.stats.ordersArchived += archivedCount;
    this.stats.lastArchiveTime = Date.now();

    this.emit('ordersArchived', { count: archivedCount });
    return archivedCount;
  }

  async archiveTrades() {
    const cutoffTime = Date.now() - this.archiveConfig.tradeRetentionHours * 3600 * 1000;

    // 获取过期的交易
    const tradeIds = await this.redis.zrangebyscore('trades:timeline', 0, cutoffTime);
    let archivedCount = 0;

    for (const tradeId of tradeIds) {
      const trade = await this.redis.hgetall(`trade:${tradeId}`);
      if (trade && Object.keys(trade).length > 0) {
        // 归档到 ClickHouse
        await this.clickhouse.insert('trades_archive', {
          trade_id: tradeId,
          order_id: trade.orderId,
          symbol: trade.symbol,
          side: trade.side,
          amount: parseFloat(trade.amount),
          price: parseFloat(trade.price),
          fee: parseFloat(trade.fee || 0),
          pnl: parseFloat(trade.pnl || 0),
          executed_at: new Date(parseInt(trade.timestamp)).toISOString(),
        });

        // 从 Redis 删除
        await this.redis.del(`trade:${tradeId}`);
        await this.redis.zrem('trades:timeline', tradeId);
        archivedCount++;
      }
    }

    this.stats.tradesArchived += archivedCount;
    this.stats.lastArchiveTime = Date.now();

    this.emit('tradesArchived', { count: archivedCount });
    return archivedCount;
  }

  async getArchivedOrders(startDate, endDate) {
    return this.clickhouse.query(
      `SELECT * FROM orders_archive WHERE created_at >= '${startDate}' AND created_at <= '${endDate}' ORDER BY created_at DESC`
    );
  }

  async getArchivedTrades(startDate, endDate) {
    return this.clickhouse.query(
      `SELECT * FROM trades_archive WHERE executed_at >= '${startDate}' AND executed_at <= '${endDate}' ORDER BY executed_at DESC`
    );
  }

  getStats() {
    return { ...this.stats };
  }
}

// ============================================
// 订单存储服务 Mock
// ============================================

class OrderStoreServiceMock {
  constructor(redis) {
    this.redis = redis;
    this.keyPrefix = 'order:';
  }

  async saveOrder(order) {
    const key = `${this.keyPrefix}${order.id}`;
    await this.redis.set(key, {
      ...order,
      createdAt: order.createdAt || Date.now(),
      updatedAt: Date.now(),
    });

    // 添加到时间线索引
    await this.redis.zadd('orders:timeline', order.createdAt || Date.now(), order.id);

    // 添加到状态索引
    await this.redis.zadd(`orders:status:${order.status}`, order.createdAt || Date.now(), order.id);

    return order;
  }

  async getOrder(orderId) {
    return this.redis.get(`${this.keyPrefix}${orderId}`);
  }

  async updateOrderStatus(orderId, status, additionalFields = {}) {
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const oldStatus = order.status;

    // 更新订单
    const updatedOrder = {
      ...order,
      ...additionalFields,
      status,
      updatedAt: Date.now(),
    };

    if (status === 'filled') {
      updatedOrder.filledAt = Date.now();
    }

    await this.redis.set(`${this.keyPrefix}${orderId}`, updatedOrder);

    // 更新状态索引
    await this.redis.zrem(`orders:status:${oldStatus}`, orderId);
    await this.redis.zadd(`orders:status:${status}`, Date.now(), orderId);

    return updatedOrder;
  }

  async getOrdersByStatus(status, limit = 100) {
    const orderIds = await this.redis.zrange(`orders:status:${status}`, 0, limit - 1);
    const orders = [];
    for (const id of orderIds) {
      const order = await this.getOrder(id);
      if (order) orders.push(order);
    }
    return orders;
  }

  async deleteOrder(orderId) {
    const order = await this.getOrder(orderId);
    if (order) {
      await this.redis.del(`${this.keyPrefix}${orderId}`);
      await this.redis.zrem('orders:timeline', orderId);
      await this.redis.zrem(`orders:status:${order.status}`, orderId);
    }
    return !!order;
  }
}

// ============================================
// 测试用例
// ============================================

describe('Data Persistence Integration', () => {
  let redis;
  let clickhouse;
  let orderStore;
  let archiveService;

  beforeEach(async () => {
    redis = new RedisStoreMock();
    clickhouse = new ClickHouseStoreMock();
    orderStore = new OrderStoreServiceMock(redis);
    archiveService = new DataArchiveServiceMock(redis, clickhouse);

    await redis.connect();
    await clickhouse.connect();

    // 创建归档表
    await clickhouse.createTable('orders_archive', {
      order_id: 'String',
      symbol: 'String',
      side: 'String',
      type: 'String',
      amount: 'Float64',
      price: 'Float64',
      status: 'String',
      created_at: 'DateTime',
      filled_at: 'Nullable(DateTime)',
    });

    await clickhouse.createTable('trades_archive', {
      trade_id: 'String',
      order_id: 'String',
      symbol: 'String',
      side: 'String',
      amount: 'Float64',
      price: 'Float64',
      fee: 'Float64',
      pnl: 'Float64',
      executed_at: 'DateTime',
    });
  });

  afterEach(async () => {
    await redis.disconnect();
    await clickhouse.disconnect();
  });

  // ============================================
  // Redis 基本操作测试
  // ============================================

  describe('Redis 基本操作', () => {
    it('应该正确存储和读取数据', async () => {
      await redis.set('test:key', { name: 'value' });
      const result = await redis.get('test:key');

      expect(result).toEqual({ name: 'value' });
    });

    it('应该正确处理 Hash 操作', async () => {
      await redis.hset('test:hash', 'field1', 'value1');
      await redis.hset('test:hash', 'field2', { nested: true });

      const field1 = await redis.hget('test:hash', 'field1');
      const field2 = await redis.hget('test:hash', 'field2');
      const all = await redis.hgetall('test:hash');

      expect(field1).toBe('value1');
      expect(field2).toEqual({ nested: true });
      expect(all).toHaveProperty('field1');
      expect(all).toHaveProperty('field2');
    });

    it('应该正确处理 Sorted Set 操作', async () => {
      await redis.zadd('test:zset', 1, 'member1');
      await redis.zadd('test:zset', 2, 'member2');
      await redis.zadd('test:zset', 3, 'member3');

      const range = await redis.zrange('test:zset', 0, -1);
      const byScore = await redis.zrangebyscore('test:zset', 1, 2);

      expect(range).toEqual(['member1', 'member2', 'member3']);
      expect(byScore).toEqual(['member1', 'member2']);
    });

    it('应该正确处理过期时间', async () => {
      await redis.set('test:expire', 'value', { EX: 1 });

      const before = await redis.get('test:expire');
      expect(before).toBe('value');

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 1100));

      const after = await redis.get('test:expire');
      expect(after).toBeNull();
    });
  });

  // ============================================
  // 订单存储测试
  // ============================================

  describe('订单存储', () => {
    it('应该正确保存订单', async () => {
      const order = {
        id: 'order_001',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: 0.1,
        price: 50000,
        status: 'open',
      };

      await orderStore.saveOrder(order);

      const saved = await orderStore.getOrder('order_001');
      expect(saved.id).toBe('order_001');
      expect(saved.symbol).toBe('BTC/USDT');
      expect(saved.createdAt).toBeDefined();
    });

    it('应该正确更新订单状态', async () => {
      await orderStore.saveOrder({
        id: 'order_002',
        symbol: 'ETH/USDT',
        status: 'open',
      });

      const updated = await orderStore.updateOrderStatus('order_002', 'filled', {
        filledAmount: 1,
      });

      expect(updated.status).toBe('filled');
      expect(updated.filledAt).toBeDefined();
      expect(updated.filledAmount).toBe(1);
    });

    it('应该按状态查询订单', async () => {
      await orderStore.saveOrder({ id: 'order_open_1', status: 'open' });
      await orderStore.saveOrder({ id: 'order_open_2', status: 'open' });
      await orderStore.saveOrder({ id: 'order_filled', status: 'filled' });

      const openOrders = await orderStore.getOrdersByStatus('open');
      const filledOrders = await orderStore.getOrdersByStatus('filled');

      expect(openOrders.length).toBe(2);
      expect(filledOrders.length).toBe(1);
    });

    it('应该正确删除订单', async () => {
      await orderStore.saveOrder({ id: 'order_delete', status: 'canceled' });

      const deleted = await orderStore.deleteOrder('order_delete');
      expect(deleted).toBe(true);

      const order = await orderStore.getOrder('order_delete');
      expect(order).toBeNull();
    });
  });

  // ============================================
  // ClickHouse 存储测试
  // ============================================

  describe('ClickHouse 存储', () => {
    it('应该正确插入数据', async () => {
      await clickhouse.insert('orders_archive', {
        order_id: 'archived_001',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        status: 'filled',
        created_at: new Date().toISOString(),
      });

      const count = await clickhouse.count('orders_archive');
      expect(count).toBe(1);
    });

    it('应该正确批量插入', async () => {
      const rows = Array(10).fill(null).map((_, i) => ({
        order_id: `batch_${i}`,
        symbol: 'ETH/USDT',
        side: i % 2 === 0 ? 'buy' : 'sell',
        amount: 1,
        price: 3000,
        status: 'filled',
        created_at: new Date().toISOString(),
      }));

      await clickhouse.insert('orders_archive', rows);

      const count = await clickhouse.count('orders_archive');
      expect(count).toBe(10);
    });

    it('应该正确查询数据', async () => {
      // 插入测试数据
      await clickhouse.insert('orders_archive', [
        { order_id: 'q1', symbol: 'BTC/USDT', status: 'filled', created_at: '2024-01-01T00:00:00Z' },
        { order_id: 'q2', symbol: 'ETH/USDT', status: 'filled', created_at: '2024-01-02T00:00:00Z' },
        { order_id: 'q3', symbol: 'BTC/USDT', status: 'canceled', created_at: '2024-01-03T00:00:00Z' },
      ]);

      const allOrders = await clickhouse.query('SELECT * FROM orders_archive');
      expect(allOrders.length).toBe(3);

      const btcOrders = await clickhouse.query("SELECT * FROM orders_archive WHERE symbol = 'BTC/USDT'");
      expect(btcOrders.length).toBe(2);
    });
  });

  // ============================================
  // 数据归档测试
  // ============================================

  describe('数据归档', () => {
    it('应该归档过期订单', async () => {
      // 创建过期订单
      const oldTime = Date.now() - 25 * 3600 * 1000; // 25 小时前

      await redis.set('order:old_order', {
        id: 'old_order',
        symbol: 'BTC/USDT',
        status: 'filled',
        createdAt: oldTime,
      });

      // 创建新订单
      await redis.set('order:new_order', {
        id: 'new_order',
        symbol: 'ETH/USDT',
        status: 'filled',
        createdAt: Date.now(),
      });

      const archivedCount = await archiveService.archiveOrders();

      expect(archivedCount).toBe(1);

      // 旧订单应该被删除
      const oldOrder = await redis.get('order:old_order');
      expect(oldOrder).toBeNull();

      // 新订单应该保留
      const newOrder = await redis.get('order:new_order');
      expect(newOrder).not.toBeNull();

      // 归档数据应该在 ClickHouse 中
      const archived = await clickhouse.query('SELECT * FROM orders_archive');
      expect(archived.length).toBe(1);
      expect(archived[0].order_id).toBe('old_order');
    });

    it('应该归档过期交易', async () => {
      const oldTime = Date.now() - 8 * 24 * 3600 * 1000; // 8 天前

      // 创建过期交易
      await redis.hset('trade:old_trade', 'orderId', 'order_1');
      await redis.hset('trade:old_trade', 'symbol', 'BTC/USDT');
      await redis.hset('trade:old_trade', 'side', 'buy');
      await redis.hset('trade:old_trade', 'amount', '0.1');
      await redis.hset('trade:old_trade', 'price', '50000');
      await redis.hset('trade:old_trade', 'timestamp', String(oldTime));
      await redis.zadd('trades:timeline', oldTime, 'old_trade');

      const archivedCount = await archiveService.archiveTrades();

      expect(archivedCount).toBe(1);

      // 交易应该被归档到 ClickHouse
      const archived = await clickhouse.query('SELECT * FROM trades_archive');
      expect(archived.length).toBe(1);
    });

    it('应该查询归档数据', async () => {
      // 插入归档数据
      await clickhouse.insert('orders_archive', [
        { order_id: 'arch_1', symbol: 'BTC/USDT', created_at: '2024-01-15T10:00:00Z' },
        { order_id: 'arch_2', symbol: 'ETH/USDT', created_at: '2024-01-16T10:00:00Z' },
        { order_id: 'arch_3', symbol: 'BTC/USDT', created_at: '2024-01-17T10:00:00Z' },
      ]);

      const results = await archiveService.getArchivedOrders(
        '2024-01-15T00:00:00Z',
        '2024-01-16T23:59:59Z'
      );

      expect(results.length).toBe(2);
    });

    it('应该记录归档统计', async () => {
      await redis.set('order:stat_order', {
        id: 'stat_order',
        status: 'filled',
        createdAt: Date.now() - 25 * 3600 * 1000,
      });

      await archiveService.archiveOrders();

      const stats = archiveService.getStats();
      expect(stats.ordersArchived).toBe(1);
      expect(stats.lastArchiveTime).toBeDefined();
    });
  });

  // ============================================
  // 数据一致性测试
  // ============================================

  describe('数据一致性', () => {
    it('应该保持订单索引一致性', async () => {
      // 保存订单
      await orderStore.saveOrder({
        id: 'consistency_order',
        status: 'open',
      });

      // 更新状态
      await orderStore.updateOrderStatus('consistency_order', 'filled');

      // 检查索引
      const openOrders = await orderStore.getOrdersByStatus('open');
      const filledOrders = await orderStore.getOrdersByStatus('filled');

      expect(openOrders.some(o => o.id === 'consistency_order')).toBe(false);
      expect(filledOrders.some(o => o.id === 'consistency_order')).toBe(true);
    });

    it('应该在归档后保持数据完整性', async () => {
      const orderData = {
        id: 'integrity_order',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: 0.1,
        price: 50000,
        status: 'filled',
        createdAt: Date.now() - 25 * 3600 * 1000,
      };

      await redis.set('order:integrity_order', orderData);
      await archiveService.archiveOrders();

      // 查询归档数据
      const archived = await clickhouse.query("SELECT * FROM orders_archive WHERE order_id = 'integrity_order'");

      expect(archived.length).toBe(1);
      expect(archived[0].symbol).toBe(orderData.symbol);
      expect(archived[0].side).toBe(orderData.side);
      expect(parseFloat(archived[0].amount)).toBe(orderData.amount);
    });
  });

  // ============================================
  // 并发操作测试
  // ============================================

  describe('并发操作', () => {
    it('应该正确处理并发订单保存', async () => {
      const orders = Array(20).fill(null).map((_, i) => ({
        id: `concurrent_${i}`,
        symbol: `COIN${i}/USDT`,
        status: 'open',
      }));

      await Promise.all(orders.map(order => orderStore.saveOrder(order)));

      const openOrders = await orderStore.getOrdersByStatus('open');
      expect(openOrders.length).toBe(20);
    });

    it('应该正确处理并发状态更新', async () => {
      // 先创建订单
      await orderStore.saveOrder({ id: 'concurrent_update', status: 'open' });

      // 并发更新（只有第一个应该成功，或者最后一个会覆盖）
      await Promise.all([
        orderStore.updateOrderStatus('concurrent_update', 'partially_filled'),
        orderStore.updateOrderStatus('concurrent_update', 'filled'),
      ]);

      const order = await orderStore.getOrder('concurrent_update');
      // 状态应该是其中一个有效状态
      expect(['partially_filled', 'filled']).toContain(order.status);
    });
  });

  // ============================================
  // 错误处理测试
  // ============================================

  describe('错误处理', () => {
    it('应该在未连接时抛出错误', async () => {
      await redis.disconnect();

      await expect(redis.get('test')).rejects.toThrow('not connected');
    });

    it('应该正确处理不存在的表', async () => {
      await expect(clickhouse.insert('nonexistent_table', { data: 'test' }))
        .rejects.toThrow('not found');
    });

    it('应该正确处理不存在的订单', async () => {
      await expect(orderStore.updateOrderStatus('nonexistent', 'filled'))
        .rejects.toThrow('not found');
    });
  });
});
