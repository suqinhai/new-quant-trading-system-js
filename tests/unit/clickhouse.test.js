/**
 * ClickHouse 存储层测试
 * ClickHouse Storage Layer Tests
 *
 * 注意: 这些测试需要运行 ClickHouse 服务器
 * Note: These tests require a running ClickHouse server
 *
 * @module tests/unit/clickhouse.test.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  ClickHouseClient,
  OrderArchiver,
  AuditLogWriter,
  TradeWriter,
  ArchiveScheduler,
  LOG_LEVEL,
} from '../../src/database/clickhouse/index.js';

// ClickHouse 连接配置 (使用测试数据库)
const TEST_CLICKHOUSE_CONFIG = {
  host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: 'quant_trading_test',
};

// 检查 ClickHouse 是否可用
let clickhouseAvailable = false;
let clickhouse = null;

beforeAll(async () => {
  try {
    clickhouse = new ClickHouseClient(TEST_CLICKHOUSE_CONFIG);
    await clickhouse.initialize();
    clickhouseAvailable = true;
  } catch (error) {
    console.warn('ClickHouse not available, skipping ClickHouse tests:', error.message);
    clickhouseAvailable = false;
  }
});

afterAll(async () => {
  if (clickhouse && clickhouseAvailable) {
    // 清理测试数据库
    try {
      await clickhouse.command('DROP DATABASE IF EXISTS quant_trading_test');
    } catch {
      // Ignore errors during cleanup
    }
    await clickhouse.close();
  }
});

// ============================================
// ClickHouseClient 测试
// ============================================

describe('ClickHouseClient', () => {
  it.skipIf(!clickhouseAvailable)('should connect to ClickHouse', async () => {
    expect(clickhouse.isConnected).toBe(true);
    expect(clickhouse.isInitialized).toBe(true);
  });

  it.skipIf(!clickhouseAvailable)('should pass health check', async () => {
    const health = await clickhouse.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.connected).toBe(true);
  });

  it.skipIf(!clickhouseAvailable)('should execute queries', async () => {
    const result = await clickhouse.query('SELECT 1 as value');
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(1);
  });

  it.skipIf(!clickhouseAvailable)('should insert and query data', async () => {
    // 插入测试交易 / Insert test trade
    await clickhouse.insert('trades', [
      {
        trade_id: 'test-trade-001',
        order_id: 'order-001',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: 0.1,
        price: 50000,
        cost: 5000,
        fee: 5,
        fee_currency: 'USDT',
        realized_pnl: 0,
        exchange: 'binance',
        strategy: 'test',
        timestamp: new Date().toISOString().replace('T', ' ').replace('Z', ''),
        metadata: '',
      },
    ]);

    // 查询 / Query
    const result = await clickhouse.query(
      "SELECT * FROM trades WHERE trade_id = {tradeId:String}",
      { tradeId: 'test-trade-001' }
    );

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('BTC/USDT');
    expect(parseFloat(result[0].amount)).toBe(0.1);
  });

  it.skipIf(!clickhouseAvailable)('should get table statistics', async () => {
    const stats = await clickhouse.getStats();
    expect(stats).toHaveProperty('trades');
    expect(stats).toHaveProperty('orders_archive');
    expect(stats).toHaveProperty('audit_logs');
  });
});

// ============================================
// AuditLogWriter 测试
// ============================================

describe('AuditLogWriter', () => {
  let writer;

  beforeEach(() => {
    if (!clickhouseAvailable) return;
    writer = new AuditLogWriter(clickhouse, {
      batchSize: 10,
      flushInterval: 1000,
      async: true,
    });
  });

  afterAll(async () => {
    if (writer) {
      await writer.stop();
    }
  });

  it.skipIf(!clickhouseAvailable)('should write single audit log', async () => {
    writer.start();

    await writer.write({
      logId: 'log-001',
      eventType: 'test.event',
      level: LOG_LEVEL.INFO,
      data: { message: 'Test log' },
      timestamp: Date.now(),
    });

    await writer.flush();

    const stats = writer.getStats();
    expect(stats.totalWritten).toBe(1);
  });

  it.skipIf(!clickhouseAvailable)('should write batch of audit logs', async () => {
    writer.start();

    const logs = [];
    for (let i = 0; i < 5; i++) {
      logs.push({
        logId: `batch-log-${i}`,
        eventType: 'batch.test',
        level: LOG_LEVEL.INFO,
        data: { index: i },
        timestamp: Date.now() + i,
      });
    }

    await writer.writeBatch(logs);
    await writer.flush();

    const stats = writer.getStats();
    expect(stats.totalWritten).toBeGreaterThanOrEqual(5);
  });

  it.skipIf(!clickhouseAvailable)('should use convenience methods', async () => {
    writer.start();

    await writer.info('user.login', { userId: 'user-001' });
    await writer.warning('rate.limit', { limit: 100, current: 95 });
    await writer.critical('system.error', { error: 'Database connection failed' });

    await writer.flush();

    const stats = writer.getStats();
    expect(stats.totalWritten).toBeGreaterThanOrEqual(3);
  });

  it.skipIf(!clickhouseAvailable)('should query audit logs', async () => {
    writer.start();

    // 写入一些日志 / Write some logs
    await writer.info('query.test', { data: 'test' });
    await writer.flush();

    // 查询 / Query
    const logs = await writer.query({
      eventType: 'query.test',
      limit: 10,
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================
// OrderArchiver 测试 (Mock)
// ============================================

describe('OrderArchiver', () => {
  it.skipIf(!clickhouseAvailable)('should transform order correctly', () => {
    // 创建模拟的 OrderStore / Create mock OrderStore
    const mockOrderStore = {
      getByStatus: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({ changes: 1 }),
    };

    const archiver = new OrderArchiver(mockOrderStore, clickhouse);

    // 测试内部转换方法 / Test internal transform method
    const order = {
      orderId: 'order-001',
      clientOrderId: 'client-001',
      symbol: 'ETH/USDT',
      side: 'sell',
      type: 'market',
      status: 'filled',
      amount: 1.5,
      filled: 1.5,
      remaining: 0,
      price: 3000,
      averagePrice: 3001,
      cost: 4501.5,
      fee: 4.5,
      exchange: 'binance',
      strategy: 'grid',
      createdAt: 1700000000000,
      updatedAt: 1700000100000,
      closedAt: 1700000200000,
    };

    const transformed = archiver._transformOrder(order);

    expect(transformed.order_id).toBe('order-001');
    expect(transformed.symbol).toBe('ETH/USDT');
    expect(transformed.side).toBe('sell');
    expect(transformed.amount).toBe(1.5);
  });

  it.skipIf(!clickhouseAvailable)('should handle empty archive', async () => {
    const mockOrderStore = {
      getByStatus: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({ changes: 1 }),
    };

    const archiver = new OrderArchiver(mockOrderStore, clickhouse);
    const result = await archiver.archive();

    expect(result.archived).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================
// TradeWriter 测试
// ============================================

describe('TradeWriter', () => {
  let writer;

  beforeEach(() => {
    if (!clickhouseAvailable) return;
    writer = new TradeWriter(clickhouse, {
      batchSize: 10,
      flushInterval: 1000,
      async: true,
    });
  });

  afterAll(async () => {
    if (writer) {
      await writer.stop();
    }
  });

  it.skipIf(!clickhouseAvailable)('should write single trade', async () => {
    writer.start();

    await writer.write({
      tradeId: 'trade-writer-001',
      orderId: 'order-001',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.1,
      price: 50000,
      cost: 5000,
      fee: 5,
      feeCurrency: 'USDT',
      exchange: 'binance',
      strategy: 'dca',
      timestamp: Date.now(),
    });

    await writer.flush();

    const stats = writer.getStats();
    expect(stats.totalWritten).toBe(1);
    expect(stats.totalVolume).toBe(5000);
  });

  it.skipIf(!clickhouseAvailable)('should write batch of trades', async () => {
    writer.start();

    const trades = [];
    for (let i = 0; i < 5; i++) {
      trades.push({
        tradeId: `batch-trade-${i}`,
        orderId: `order-${i}`,
        symbol: 'ETH/USDT',
        side: i % 2 === 0 ? 'buy' : 'sell',
        type: 'market',
        amount: 1,
        price: 3000,
        cost: 3000,
        fee: 3,
        exchange: 'binance',
        strategy: 'grid',
        timestamp: Date.now() + i,
      });
    }

    await writer.writeBatch(trades);
    await writer.flush();

    const stats = writer.getStats();
    expect(stats.totalWritten).toBeGreaterThanOrEqual(5);
  });

  it.skipIf(!clickhouseAvailable)('should query trades', async () => {
    writer.start();

    // 写入一些交易 / Write some trades
    await writer.write({
      tradeId: 'query-test-001',
      symbol: 'SOL/USDT',
      side: 'buy',
      amount: 10,
      price: 100,
      cost: 1000,
      exchange: 'binance',
      timestamp: Date.now(),
    });
    await writer.flush();

    // 查询 / Query
    const trades = await writer.query({
      symbol: 'SOL/USDT',
      limit: 10,
    });

    expect(trades.length).toBeGreaterThanOrEqual(1);
  });

  it.skipIf(!clickhouseAvailable)('should get trade statistics', async () => {
    writer.start();

    // 写入带盈亏的交易 / Write trades with PnL
    await writer.write({
      tradeId: 'stats-trade-001',
      symbol: 'DOGE/USDT',
      side: 'sell',
      amount: 1000,
      price: 0.1,
      cost: 100,
      realizedPnl: 10,
      exchange: 'binance',
      strategy: 'momentum',
      timestamp: Date.now(),
    });
    await writer.flush();

    const stats = await writer.getTradeStats({ symbol: 'DOGE/USDT' });

    expect(stats).toBeDefined();
    expect(parseFloat(stats.total_trades)).toBeGreaterThanOrEqual(1);
  });

  it.skipIf(!clickhouseAvailable)('should get daily statistics', async () => {
    const dailyStats = await writer.getDailyStats({ limit: 7 });
    expect(Array.isArray(dailyStats)).toBe(true);
  });

  it.skipIf(!clickhouseAvailable)('should get statistics by symbol', async () => {
    const symbolStats = await writer.getStatsBySymbol({});
    expect(Array.isArray(symbolStats)).toBe(true);
  });

  it.skipIf(!clickhouseAvailable)('should get statistics by strategy', async () => {
    const strategyStats = await writer.getStatsByStrategy({});
    expect(Array.isArray(strategyStats)).toBe(true);
  });
});

// ============================================
// ArchiveScheduler 测试
// ============================================

describe('ArchiveScheduler', () => {
  it.skipIf(!clickhouseAvailable)('should initialize correctly', async () => {
    const scheduler = new ArchiveScheduler({
      clickhouse,
      config: {
        enabled: false, // 禁用自动运行
      },
    });

    await scheduler.initialize();

    expect(scheduler.auditLogWriter).toBeDefined();
  });

  it.skipIf(!clickhouseAvailable)('should track statistics', async () => {
    const scheduler = new ArchiveScheduler({
      clickhouse,
      config: {
        enabled: false,
      },
    });

    await scheduler.initialize();

    const stats = scheduler.getStats();

    expect(stats.isRunning).toBe(false);
    expect(stats.orders).toBeDefined();
    expect(stats.positions).toBeDefined();
    expect(stats.trades).toBeDefined();
    expect(stats.auditLogs).toBeDefined();
  });

  it.skipIf(!clickhouseAvailable)('should reset statistics', async () => {
    const scheduler = new ArchiveScheduler({
      clickhouse,
      config: {
        enabled: false,
      },
    });

    await scheduler.initialize();

    // 手动设置一些统计 / Manually set some stats
    scheduler.stats.orders.archived = 100;

    scheduler.resetStats();

    expect(scheduler.stats.orders.archived).toBe(0);
  });
});

// ============================================
// Integration Test
// ============================================

describe('ClickHouse Integration', () => {
  it.skipIf(!clickhouseAvailable)('should work with full archiving workflow', async () => {
    // 创建审计日志写入器 / Create audit log writer
    const writer = new AuditLogWriter(clickhouse, {
      async: false, // 同步写入便于测试
    });

    // 写入一系列事件 / Write a series of events
    await writer.write({
      logId: 'integration-001',
      eventType: 'order.created',
      level: LOG_LEVEL.INFO,
      data: { orderId: 'order-int-001', symbol: 'BTC/USDT' },
    });

    await writer.write({
      logId: 'integration-002',
      eventType: 'order.filled',
      level: LOG_LEVEL.INFO,
      data: { orderId: 'order-int-001', filledAmount: 0.1 },
    });

    await writer.write({
      logId: 'integration-003',
      eventType: 'position.opened',
      level: LOG_LEVEL.INFO,
      data: { positionId: 'pos-int-001', symbol: 'BTC/USDT' },
    });

    // 查询事件统计 / Query event statistics
    const eventStats = await writer.getEventStats({});

    expect(eventStats.length).toBeGreaterThanOrEqual(1);

    // 验证日志已写入 / Verify logs were written
    const logs = await writer.query({
      eventType: 'order.created',
      limit: 10,
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it.skipIf(!clickhouseAvailable)('should insert archived orders', async () => {
    // 直接插入归档订单 / Directly insert archived order
    await clickhouse.insert('orders_archive', [
      {
        order_id: 'archived-order-001',
        client_order_id: '',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        status: 'filled',
        amount: 0.5,
        filled: 0.5,
        remaining: 0,
        price: 45000,
        average_price: 45001,
        stop_price: 0,
        cost: 22500.5,
        fee: 22.5,
        exchange: 'binance',
        strategy: 'dca',
        created_at: new Date().toISOString().replace('T', ' ').replace('Z', ''),
        updated_at: new Date().toISOString().replace('T', ' ').replace('Z', ''),
        closed_at: new Date().toISOString().replace('T', ' ').replace('Z', ''),
        error_message: '',
        metadata: '',
      },
    ]);

    // 查询验证 / Query to verify
    const result = await clickhouse.query(
      "SELECT * FROM orders_archive WHERE order_id = {orderId:String}",
      { orderId: 'archived-order-001' }
    );

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('BTC/USDT');
    expect(result[0].status).toBe('filled');
  });
});
