/**
 * Redis 存储层测试
 * Redis Storage Layer Tests
 *
 * 注意: 这些测试需要运行 Redis 服务器
 * Note: These tests require a running Redis server
 *
 * @module tests/unit/redis.test.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  RedisClient,
  OrderStore,
  ORDER_STATUS,
  PositionStore,
  POSITION_STATUS,
  POSITION_SIDE,
  StrategyStore,
  STRATEGY_STATE,
  ConfigStore,
} from '../../src/database/redis/index.js';

// Redis 连接配置 (使用测试数据库)
const TEST_REDIS_CONFIG = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  database: 15, // 使用数据库 15 进行测试
  keyPrefix: 'test:quant:',
};

// 检查 Redis 是否可用
let redisAvailable = false;
let redis = null;

beforeAll(async () => {
  try {
    redis = new RedisClient(TEST_REDIS_CONFIG);
    await redis.initialize();
    redisAvailable = true;
    // 清空测试数据库
    await redis.flushDb();
  } catch (error) {
    console.warn('Redis not available, skipping Redis tests:', error.message);
    redisAvailable = false;
  }
});

afterAll(async () => {
  if (redis && redisAvailable) {
    // 清空测试数据库
    await redis.flushDb();
    await redis.close();
  }
});

// ============================================
// RedisClient 测试
// ============================================

describe('RedisClient', () => {
  beforeEach(async () => {
    if (!redisAvailable) return;
    // 清空测试数据
    await redis.flushDb();
  });

  it.skipIf(!redisAvailable)('should connect to Redis', async () => {
    expect(redis.isConnected).toBe(true);
    expect(redis.isInitialized).toBe(true);
  });

  it.skipIf(!redisAvailable)('should pass health check', async () => {
    const health = await redis.healthCheck();
    expect(health.status).toBe('healthy');
  });

  it.skipIf(!redisAvailable)('should generate correct key with prefix', () => {
    const key = redis.key('order', '12345');
    expect(key).toBe('test:quant:order:12345');
  });

  it.skipIf(!redisAvailable)('should set and get string values', async () => {
    await redis.set('test:key', 'test-value');
    const value = await redis.get('test:key');
    expect(value).toBe('test-value');
  });

  it.skipIf(!redisAvailable)('should set and get hash values', async () => {
    await redis.hMSet('test:hash', {
      field1: 'value1',
      field2: 'value2',
    });

    const all = await redis.hGetAll('test:hash');
    expect(all.field1).toBe('value1');
    expect(all.field2).toBe('value2');
  });

  it.skipIf(!redisAvailable)('should add to and query sorted sets', async () => {
    await redis.zAdd('test:zset', 100, 'member1');
    await redis.zAdd('test:zset', 200, 'member2');
    await redis.zAdd('test:zset', 150, 'member3');

    const members = await redis.zRange('test:zset', 0, -1);
    expect(members.length).toBe(3);

    const byScore = await redis.zRangeByScore('test:zset', 100, 175);
    expect(byScore.length).toBe(2);
    expect(byScore).toContain('member1');
    expect(byScore).toContain('member3');
  });

  it.skipIf(!redisAvailable)('should acquire and release locks', async () => {
    const token = await redis.acquireLock('test-lock', 10);
    expect(token).toBeTruthy();

    // 尝试再次获取锁应该失败
    const token2 = await redis.acquireLock('test-lock', 10);
    expect(token2).toBeNull();

    // 释放锁
    await redis.releaseLock('test-lock', token);

    // 现在应该可以获取
    const token3 = await redis.acquireLock('test-lock', 10);
    expect(token3).toBeTruthy();
  });
});

// ============================================
// OrderStore 测试
// ============================================

describe('OrderStore', () => {
  let orderStore;

  beforeAll(() => {
    if (!redisAvailable) return;
    orderStore = new OrderStore(redis);
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    await redis.flushDb();
  });

  it.skipIf(!redisAvailable)('should insert and retrieve order', async () => {
    const order = {
      orderId: 'order-001',
      clientOrderId: 'client-001',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      status: ORDER_STATUS.OPEN,
      amount: 0.1,
      price: 50000,
      exchange: 'binance',
      strategy: 'grid',
    };

    await orderStore.insert(order);

    const retrieved = await orderStore.getById('order-001');
    expect(retrieved).toBeTruthy();
    expect(retrieved.orderId).toBe('order-001');
    expect(retrieved.symbol).toBe('BTC/USDT');
    expect(retrieved.amount).toBe(0.1);
    expect(retrieved.price).toBe(50000);
  });

  it.skipIf(!redisAvailable)('should update order status', async () => {
    await orderStore.insert({
      orderId: 'order-002',
      symbol: 'ETH/USDT',
      side: 'sell',
      type: 'market',
      status: ORDER_STATUS.PENDING,
      amount: 1,
      exchange: 'binance',
    });

    await orderStore.update({
      orderId: 'order-002',
      status: ORDER_STATUS.FILLED,
      filled: 1,
      remaining: 0,
      averagePrice: 3000,
    });

    const updated = await orderStore.getById('order-002');
    expect(updated.status).toBe(ORDER_STATUS.FILLED);
    expect(updated.filled).toBe(1);
    expect(updated.averagePrice).toBe(3000);
  });

  it.skipIf(!redisAvailable)('should get open orders', async () => {
    await orderStore.insert({
      orderId: 'order-open',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      status: ORDER_STATUS.OPEN,
      amount: 0.1,
      exchange: 'binance',
    });

    await orderStore.insert({
      orderId: 'order-filled',
      symbol: 'ETH/USDT',
      side: 'sell',
      type: 'market',
      status: ORDER_STATUS.FILLED,
      amount: 1,
      exchange: 'binance',
    });

    const openOrders = await orderStore.getOpenOrders();
    expect(openOrders.length).toBe(1);
    expect(openOrders[0].orderId).toBe('order-open');
  });

  it.skipIf(!redisAvailable)('should get orders by symbol', async () => {
    await orderStore.insert({
      orderId: 'order-btc',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      status: ORDER_STATUS.OPEN,
      amount: 0.1,
      exchange: 'binance',
    });

    await orderStore.insert({
      orderId: 'order-eth',
      symbol: 'ETH/USDT',
      side: 'sell',
      type: 'market',
      status: ORDER_STATUS.OPEN,
      amount: 1,
      exchange: 'binance',
    });

    const btcOrders = await orderStore.getBySymbol('BTC/USDT');
    expect(btcOrders.length).toBe(1);
    expect(btcOrders[0].symbol).toBe('BTC/USDT');
  });

  it.skipIf(!redisAvailable)('should get order statistics', async () => {
    await orderStore.insert({
      orderId: 'order-1',
      symbol: 'BTC/USDT',
      side: 'buy',
      status: ORDER_STATUS.OPEN,
      amount: 0.1,
      exchange: 'binance',
    });

    await orderStore.insert({
      orderId: 'order-2',
      symbol: 'BTC/USDT',
      side: 'sell',
      status: ORDER_STATUS.FILLED,
      amount: 0.1,
      exchange: 'binance',
    });

    const stats = await orderStore.getStats();
    expect(stats.total).toBe(2);
    expect(stats.byStatus[ORDER_STATUS.OPEN]).toBe(1);
    expect(stats.byStatus[ORDER_STATUS.FILLED]).toBe(1);
  });
});

// ============================================
// PositionStore 测试
// ============================================

describe('PositionStore', () => {
  let positionStore;

  beforeAll(() => {
    if (!redisAvailable) return;
    positionStore = new PositionStore(redis);
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    await redis.flushDb();
  });

  it.skipIf(!redisAvailable)('should insert and retrieve position', async () => {
    const position = {
      positionId: 'pos-001',
      symbol: 'BTC/USDT',
      side: POSITION_SIDE.LONG,
      entryPrice: 50000,
      currentPrice: 51000,
      amount: 0.1,
      leverage: 10,
      margin: 500,
      unrealizedPnl: 100,
      exchange: 'binance',
      strategy: 'macd',
    };

    await positionStore.insert(position);

    const retrieved = await positionStore.getById('pos-001');
    expect(retrieved).toBeTruthy();
    expect(retrieved.positionId).toBe('pos-001');
    expect(retrieved.entryPrice).toBe(50000);
    expect(retrieved.unrealizedPnl).toBe(100);
  });

  it.skipIf(!redisAvailable)('should update position', async () => {
    await positionStore.insert({
      positionId: 'pos-002',
      symbol: 'ETH/USDT',
      side: POSITION_SIDE.SHORT,
      entryPrice: 3000,
      currentPrice: 3000,
      amount: 1,
      exchange: 'binance',
    });

    await positionStore.update({
      positionId: 'pos-002',
      currentPrice: 2900,
      unrealizedPnl: 100,
    });

    const updated = await positionStore.getById('pos-002');
    expect(updated.currentPrice).toBe(2900);
    expect(updated.unrealizedPnl).toBe(100);
  });

  it.skipIf(!redisAvailable)('should get open positions', async () => {
    await positionStore.insert({
      positionId: 'pos-open',
      symbol: 'BTC/USDT',
      side: POSITION_SIDE.LONG,
      entryPrice: 50000,
      amount: 0.1,
      status: POSITION_STATUS.OPEN,
      exchange: 'binance',
    });

    await positionStore.insert({
      positionId: 'pos-closed',
      symbol: 'ETH/USDT',
      side: POSITION_SIDE.SHORT,
      entryPrice: 3000,
      amount: 1,
      status: POSITION_STATUS.CLOSED,
      exchange: 'binance',
    });

    const openPositions = await positionStore.getOpenPositions();
    expect(openPositions.length).toBe(1);
    expect(openPositions[0].positionId).toBe('pos-open');
  });

  it.skipIf(!redisAvailable)('should close position', async () => {
    await positionStore.insert({
      positionId: 'pos-to-close',
      symbol: 'BTC/USDT',
      side: POSITION_SIDE.LONG,
      entryPrice: 50000,
      amount: 0.1,
      exchange: 'binance',
    });

    await positionStore.close('pos-to-close', {
      realizedPnl: 100,
      currentPrice: 51000,
    });

    const closed = await positionStore.getById('pos-to-close');
    expect(closed.status).toBe(POSITION_STATUS.CLOSED);
    expect(closed.realizedPnl).toBe(100);
  });

  it.skipIf(!redisAvailable)('should get position summary', async () => {
    await positionStore.insert({
      positionId: 'pos-1',
      symbol: 'BTC/USDT',
      side: POSITION_SIDE.LONG,
      entryPrice: 50000,
      amount: 0.1,
      margin: 500,
      unrealizedPnl: 100,
      exchange: 'binance',
    });

    await positionStore.insert({
      positionId: 'pos-2',
      symbol: 'ETH/USDT',
      side: POSITION_SIDE.SHORT,
      entryPrice: 3000,
      amount: 1,
      margin: 300,
      unrealizedPnl: 50,
      exchange: 'binance',
    });

    const summary = await positionStore.getSummary();
    expect(summary.count).toBe(2);
    expect(summary.longCount).toBe(1);
    expect(summary.shortCount).toBe(1);
    expect(summary.totalMargin).toBe(800);
    expect(summary.totalUnrealizedPnl).toBe(150);
  });
});

// ============================================
// StrategyStore 测试
// ============================================

describe('StrategyStore', () => {
  let strategyStore;

  beforeAll(() => {
    if (!redisAvailable) return;
    strategyStore = new StrategyStore(redis);
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    await redis.flushDb();
  });

  it.skipIf(!redisAvailable)('should save and retrieve strategy', async () => {
    const strategy = {
      strategyId: 'strategy-001',
      strategyName: 'SMA Crossover',
      state: STRATEGY_STATE.RUNNING,
      config: { shortPeriod: 10, longPeriod: 20 },
      parameters: { symbol: 'BTC/USDT' },
    };

    await strategyStore.save(strategy);

    const retrieved = await strategyStore.getById('strategy-001');
    expect(retrieved).toBeTruthy();
    expect(retrieved.strategyName).toBe('SMA Crossover');
    expect(retrieved.state).toBe(STRATEGY_STATE.RUNNING);
    expect(retrieved.config.shortPeriod).toBe(10);
  });

  it.skipIf(!redisAvailable)('should update strategy state', async () => {
    await strategyStore.save({
      strategyId: 'strategy-002',
      strategyName: 'RSI Strategy',
      state: STRATEGY_STATE.STOPPED,
    });

    await strategyStore.updateState('strategy-002', STRATEGY_STATE.RUNNING);

    const updated = await strategyStore.getById('strategy-002');
    expect(updated.state).toBe(STRATEGY_STATE.RUNNING);
  });

  it.skipIf(!redisAvailable)('should record and retrieve signals', async () => {
    await strategyStore.save({
      strategyId: 'strategy-003',
      strategyName: 'Signal Strategy',
      state: STRATEGY_STATE.RUNNING,
    });

    await strategyStore.recordSignal('strategy-003', {
      type: 'buy',
      symbol: 'BTC/USDT',
      price: 50000,
      strength: 0.8,
    });

    const lastSignal = await strategyStore.getLastSignal('strategy-003');
    expect(lastSignal).toBeTruthy();
    expect(lastSignal.type).toBe('buy');
    expect(lastSignal.price).toBe(50000);

    const history = await strategyStore.getSignalHistory('strategy-003');
    expect(history.length).toBe(1);
  });

  it.skipIf(!redisAvailable)('should get running strategies', async () => {
    await strategyStore.save({
      strategyId: 'running-1',
      strategyName: 'Running Strategy 1',
      state: STRATEGY_STATE.RUNNING,
    });

    await strategyStore.save({
      strategyId: 'stopped-1',
      strategyName: 'Stopped Strategy',
      state: STRATEGY_STATE.STOPPED,
    });

    const running = await strategyStore.getRunning();
    expect(running.length).toBe(1);
    expect(running[0].strategyId).toBe('running-1');
  });

  it.skipIf(!redisAvailable)('should get overview', async () => {
    await strategyStore.save({
      strategyId: 's1',
      strategyName: 'Strategy 1',
      state: STRATEGY_STATE.RUNNING,
    });

    await strategyStore.save({
      strategyId: 's2',
      strategyName: 'Strategy 2',
      state: STRATEGY_STATE.STOPPED,
    });

    await strategyStore.save({
      strategyId: 's3',
      strategyName: 'Strategy 3',
      state: STRATEGY_STATE.RUNNING,
    });

    const overview = await strategyStore.getOverview();
    expect(overview.total).toBe(3);
    expect(overview.running).toBe(2);
    expect(overview.byState[STRATEGY_STATE.RUNNING]).toBe(2);
    expect(overview.byState[STRATEGY_STATE.STOPPED]).toBe(1);
  });
});

// ============================================
// ConfigStore 测试
// ============================================

describe('ConfigStore', () => {
  let configStore;

  beforeAll(() => {
    if (!redisAvailable) return;
    configStore = new ConfigStore(redis);
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    await redis.flushDb();
  });

  it.skipIf(!redisAvailable)('should set and get config', async () => {
    await configStore.set('test.key', { value: 'test', number: 42 });

    const value = await configStore.get('test.key');
    expect(value.value).toBe('test');
    expect(value.number).toBe(42);
  });

  it.skipIf(!redisAvailable)('should return default value for missing config', async () => {
    const value = await configStore.get('nonexistent', 'default');
    expect(value).toBe('default');
  });

  it.skipIf(!redisAvailable)('should update existing config', async () => {
    await configStore.set('update.key', 'value1');
    await configStore.set('update.key', 'value2');

    const value = await configStore.get('update.key');
    expect(value).toBe('value2');
  });

  it.skipIf(!redisAvailable)('should get all configs', async () => {
    await configStore.set('key1', 'value1');
    await configStore.set('key2', 'value2');

    const all = await configStore.getAll();
    expect(all.key1).toBe('value1');
    expect(all.key2).toBe('value2');
  });

  it.skipIf(!redisAvailable)('should delete config', async () => {
    await configStore.set('to.delete', 'value');
    await configStore.delete('to.delete');

    const value = await configStore.get('to.delete', null);
    expect(value).toBeNull();
  });

  it.skipIf(!redisAvailable)('should get config with metadata', async () => {
    await configStore.set('meta.key', 'value', { description: 'Test config' });

    const withMeta = await configStore.getWithMeta('meta.key');
    expect(withMeta.value).toBe('value');
    expect(withMeta.version).toBe(1);
    expect(withMeta.description).toBe('Test config');
  });

  it.skipIf(!redisAvailable)('should track version history', async () => {
    await configStore.set('versioned.key', 'v1');
    await configStore.set('versioned.key', 'v2');
    await configStore.set('versioned.key', 'v3');

    const history = await configStore.getHistory('versioned.key');
    expect(history.length).toBe(2); // v1 和 v2 在历史中
    expect(history[0].value).toBe('v2');
    expect(history[1].value).toBe('v1');
  });

  it.skipIf(!redisAvailable)('should rollback to previous version', async () => {
    await configStore.set('rollback.key', 'v1');
    await configStore.set('rollback.key', 'v2');
    await configStore.set('rollback.key', 'v3');

    await configStore.rollback('rollback.key', 1);

    const current = await configStore.get('rollback.key');
    expect(current).toBe('v1');
  });

  it.skipIf(!redisAvailable)('should increment numeric config', async () => {
    await configStore.set('counter', 10);

    const newValue = await configStore.increment('counter', 5);
    expect(newValue).toBe(15);
  });

  it.skipIf(!redisAvailable)('should export and import configs', async () => {
    await configStore.set('export1', 'value1');
    await configStore.set('export2', { nested: 'value' });

    const exported = await configStore.exportAll();
    expect(exported.configs.export1).toBe('value1');
    expect(exported.configs.export2.nested).toBe('value');

    // 清空
    await redis.flushDb();

    // 重新导入
    const result = await configStore.importAll(exported);
    expect(result.imported).toBe(2);

    const reimported = await configStore.get('export1');
    expect(reimported).toBe('value1');
  });
});

// ============================================
// Integration Test: RedisDatabaseManager
// ============================================

describe('RedisDatabaseManager Integration', () => {
  it.skipIf(!redisAvailable)('should work with all stores together', async () => {
    // 创建订单
    const orderStore = new OrderStore(redis);
    await orderStore.insert({
      orderId: 'int-order-001',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      status: ORDER_STATUS.OPEN,
      amount: 0.1,
      price: 50000,
      exchange: 'binance',
      strategy: 'integration-test',
    });

    // 创建持仓
    const positionStore = new PositionStore(redis);
    await positionStore.insert({
      positionId: 'int-pos-001',
      symbol: 'BTC/USDT',
      side: POSITION_SIDE.LONG,
      entryPrice: 50000,
      amount: 0.1,
      exchange: 'binance',
      strategy: 'integration-test',
    });

    // 创建策略
    const strategyStore = new StrategyStore(redis);
    await strategyStore.save({
      strategyId: 'int-strategy-001',
      strategyName: 'Integration Test Strategy',
      state: STRATEGY_STATE.RUNNING,
    });

    // 保存配置
    const configStore = new ConfigStore(redis);
    await configStore.set('integration.test', { running: true });

    // 验证所有数据
    const order = await orderStore.getById('int-order-001');
    const position = await positionStore.getById('int-pos-001');
    const strategy = await strategyStore.getById('int-strategy-001');
    const config = await configStore.get('integration.test');

    expect(order).toBeTruthy();
    expect(position).toBeTruthy();
    expect(strategy).toBeTruthy();
    expect(config.running).toBe(true);

    // 清理
    await orderStore.delete('int-order-001');
    await positionStore.delete('int-pos-001');
    await strategyStore.delete('int-strategy-001');
    await configStore.delete('integration.test');
  });
});
