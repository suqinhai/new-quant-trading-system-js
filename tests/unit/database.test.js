/**
 * 数据库管理器测试
 * Database Manager Tests
 * @module tests/unit/database.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager, TradeRepository } from '../../src/database/index.js';

// ============================================
// DatabaseManager 测试
// ============================================

describe('DatabaseManager', () => {
  let db;

  beforeEach(async () => {
    // 使用内存数据库进行测试
    db = new DatabaseManager({ memory: true });
    await db.initialize();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('初始化', () => {
    it('应该成功初始化内存数据库', () => {
      expect(db.isInitialized).toBe(true);
      expect(db.db).toBeDefined();
    });

    it('应该创建所有必需的表', () => {
      const tables = db.query(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      const tableNames = tables.map(t => t.name);

      expect(tableNames).toContain('trades');
      expect(tableNames).toContain('orders');
      expect(tableNames).toContain('positions');
      expect(tableNames).toContain('audit_logs');
      expect(tableNames).toContain('balance_snapshots');
      expect(tableNames).toContain('strategy_states');
      expect(tableNames).toContain('system_config');
      expect(tableNames).toContain('candle_cache');
    });

    it('健康检查应该返回健康状态', () => {
      const result = db.healthCheck();
      expect(result.status).toBe('healthy');
    });
  });

  describe('交易操作', () => {
    it('应该正确插入交易记录', () => {
      const trade = {
        tradeId: 'trade-001',
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
        strategy: 'sma',
        timestamp: Date.now(),
      };

      const result = db.insertTrade(trade);
      expect(result.changes).toBe(1);

      const saved = db.getTradeById('trade-001');
      expect(saved).toBeDefined();
      expect(saved.symbol).toBe('BTC/USDT');
      expect(saved.amount).toBe(0.1);
      expect(saved.price).toBe(50000);
    });

    it('应该批量插入交易', () => {
      const trades = [
        {
          tradeId: 'trade-001',
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.1,
          price: 50000,
          cost: 5000,
          exchange: 'binance',
          timestamp: Date.now(),
        },
        {
          tradeId: 'trade-002',
          symbol: 'ETH/USDT',
          side: 'sell',
          amount: 1,
          price: 3000,
          cost: 3000,
          exchange: 'binance',
          timestamp: Date.now(),
        },
      ];

      db.insertTrades(trades);

      const btcTrades = db.getTradesBySymbol('BTC/USDT', 10);
      expect(btcTrades.length).toBe(1);

      const ethTrades = db.getTradesBySymbol('ETH/USDT', 10);
      expect(ethTrades.length).toBe(1);
    });

    it('应该按时间范围查询交易', () => {
      const now = Date.now();

      db.insertTrades([
        {
          tradeId: 'trade-old',
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.1,
          price: 50000,
          cost: 5000,
          exchange: 'binance',
          timestamp: now - 86400000, // 1天前
        },
        {
          tradeId: 'trade-new',
          symbol: 'BTC/USDT',
          side: 'sell',
          amount: 0.1,
          price: 51000,
          cost: 5100,
          exchange: 'binance',
          timestamp: now,
        },
      ]);

      const trades = db.getTradesByTimeRange(now - 3600000, now + 1000);
      expect(trades.length).toBe(1);
      expect(trades[0].trade_id).toBe('trade-new');
    });
  });

  describe('订单操作', () => {
    it('应该正确插入和查询订单', () => {
      const order = {
        orderId: 'order-001',
        clientOrderId: 'client-001',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        status: 'open',
        amount: 0.1,
        price: 50000,
        exchange: 'binance',
        strategy: 'grid',
        createdAt: Date.now(),
      };

      db.insertOrder(order);

      const saved = db.getOrderById('order-001');
      expect(saved).toBeDefined();
      expect(saved.status).toBe('open');
      expect(saved.amount).toBe(0.1);
    });

    it('应该正确更新订单状态', () => {
      db.insertOrder({
        orderId: 'order-001',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        status: 'open',
        amount: 0.1,
        price: 50000,
        exchange: 'binance',
        createdAt: Date.now(),
      });

      db.updateOrder({
        orderId: 'order-001',
        status: 'filled',
        filled: 0.1,
        remaining: 0,
        averagePrice: 50000,
        cost: 5000,
        fee: 5,
        closedAt: Date.now(),
      });

      const updated = db.getOrderById('order-001');
      expect(updated.status).toBe('filled');
      expect(updated.filled).toBe(0.1);
    });

    it('应该获取未完成订单', () => {
      db.insertOrder({
        orderId: 'order-open',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        status: 'open',
        amount: 0.1,
        exchange: 'binance',
        createdAt: Date.now(),
      });

      db.insertOrder({
        orderId: 'order-filled',
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'market',
        status: 'filled',
        amount: 1,
        exchange: 'binance',
        createdAt: Date.now(),
      });

      const openOrders = db.getOpenOrders();
      expect(openOrders.length).toBe(1);
      expect(openOrders[0].order_id).toBe('order-open');
    });
  });

  describe('持仓操作', () => {
    it('应该正确插入和查询持仓', () => {
      const position = {
        positionId: 'pos-001',
        symbol: 'BTC/USDT',
        side: 'long',
        entryPrice: 50000,
        currentPrice: 51000,
        amount: 0.1,
        leverage: 10,
        margin: 500,
        unrealizedPnl: 100,
        exchange: 'binance',
        strategy: 'macd',
        openedAt: Date.now(),
      };

      db.insertPosition(position);

      const openPositions = db.getOpenPositions();
      expect(openPositions.length).toBe(1);
      expect(openPositions[0].symbol).toBe('BTC/USDT');
      expect(openPositions[0].entry_price).toBe(50000);
    });

    it('应该正确更新持仓', () => {
      db.insertPosition({
        positionId: 'pos-001',
        symbol: 'BTC/USDT',
        side: 'long',
        entryPrice: 50000,
        currentPrice: 50000,
        amount: 0.1,
        exchange: 'binance',
        openedAt: Date.now(),
      });

      db.updatePosition({
        positionId: 'pos-001',
        currentPrice: 52000,
        amount: 0.1,
        unrealizedPnl: 200,
        realizedPnl: 0,
        status: 'open',
      });

      const positions = db.getOpenPositions();
      expect(positions[0].current_price).toBe(52000);
      expect(positions[0].unrealized_pnl).toBe(200);
    });
  });

  describe('审计日志操作', () => {
    it('应该正确插入审计日志', () => {
      const log = {
        logId: 'log-001',
        eventType: 'order_created',
        level: 'info',
        timestamp: new Date().toISOString(),
        data: { orderId: 'order-001', symbol: 'BTC/USDT' },
        metadata: { hostname: 'localhost' },
      };

      db.insertAuditLog(log);

      const now = Date.now();
      const logs = db.getAuditLogs(now - 3600000, now + 1000, 10);
      expect(logs.length).toBe(1);
      expect(logs[0].event_type).toBe('order_created');
    });

    it('应该批量插入审计日志', () => {
      const logs = [
        {
          logId: 'log-001',
          eventType: 'order_created',
          level: 'info',
          timestamp: new Date().toISOString(),
        },
        {
          logId: 'log-002',
          eventType: 'order_filled',
          level: 'info',
          timestamp: new Date().toISOString(),
        },
      ];

      db.insertAuditLogs(logs);

      const now = Date.now();
      const savedLogs = db.getAuditLogs(now - 3600000, now + 1000, 10);
      expect(savedLogs.length).toBe(2);
    });
  });

  describe('余额快照操作', () => {
    it('应该正确插入余额快照', () => {
      db.insertBalanceSnapshot({
        exchange: 'binance',
        currency: 'USDT',
        total: 10000,
        free: 8000,
        used: 2000,
        timestamp: Date.now(),
      });

      const snapshots = db.query(
        'SELECT * FROM balance_snapshots WHERE exchange = ?',
        ['binance']
      );
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].total).toBe(10000);
    });
  });

  describe('K线缓存操作', () => {
    it('应该正确插入和查询K线', () => {
      const now = Date.now();

      db.insertCandles([
        {
          symbol: 'BTC/USDT',
          timeframe: '1h',
          timestamp: now - 3600000,
          open: 50000,
          high: 51000,
          low: 49500,
          close: 50500,
          volume: 1000,
          exchange: 'binance',
        },
        {
          symbol: 'BTC/USDT',
          timeframe: '1h',
          timestamp: now,
          open: 50500,
          high: 51500,
          low: 50000,
          close: 51000,
          volume: 1200,
          exchange: 'binance',
        },
      ]);

      const candles = db.getCandles(
        'BTC/USDT',
        '1h',
        'binance',
        now - 7200000,
        now + 1000
      );
      expect(candles.length).toBe(2);
      expect(candles[0].close).toBe(50500);
      expect(candles[1].close).toBe(51000);
    });
  });

  describe('配置操作', () => {
    it('应该正确存储和获取配置', () => {
      db.setConfig('testKey', { value: 'testValue', number: 42 });

      const config = db.getConfig('testKey');
      expect(config.value).toBe('testValue');
      expect(config.number).toBe(42);
    });

    it('应该返回默认值当配置不存在', () => {
      const config = db.getConfig('nonexistent', 'default');
      expect(config).toBe('default');
    });

    it('应该更新已存在的配置', () => {
      db.setConfig('key1', 'value1');
      db.setConfig('key1', 'value2');

      const config = db.getConfig('key1');
      expect(config).toBe('value2');
    });
  });

  describe('统计信息', () => {
    it('应该返回正确的统计信息', () => {
      db.insertTrade({
        tradeId: 'trade-001',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        cost: 5000,
        exchange: 'binance',
        timestamp: Date.now(),
      });

      db.insertOrder({
        orderId: 'order-001',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        status: 'open',
        amount: 0.1,
        exchange: 'binance',
        createdAt: Date.now(),
      });

      const stats = db.getStats();
      expect(stats.trades).toBe(1);
      expect(stats.orders).toBe(1);
    });
  });

  describe('事务', () => {
    it('应该正确执行事务', () => {
      db.transaction(() => {
        db.insertTrade({
          tradeId: 'tx-trade-1',
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.1,
          price: 50000,
          cost: 5000,
          exchange: 'binance',
          timestamp: Date.now(),
        });
        db.insertTrade({
          tradeId: 'tx-trade-2',
          symbol: 'ETH/USDT',
          side: 'sell',
          amount: 1,
          price: 3000,
          cost: 3000,
          exchange: 'binance',
          timestamp: Date.now(),
        });
      });

      const stats = db.getStats();
      expect(stats.trades).toBe(2);
    });
  });

  describe('关闭', () => {
    it('应该正确关闭数据库', () => {
      db.close();
      expect(db.isInitialized).toBe(false);
      expect(db.db).toBeNull();
    });
  });
});

// ============================================
// TradeRepository 测试
// ============================================

describe('TradeRepository', () => {
  let db;
  let repo;

  beforeEach(async () => {
    db = new DatabaseManager({ memory: true });
    await db.initialize();
    repo = new TradeRepository(db);

    // 插入测试数据
    const now = Date.now();
    const oneDayAgo = now - 86400000;
    const twoDaysAgo = now - 172800000;

    db.insertTrades([
      {
        tradeId: 'trade-1',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        amount: 0.1,
        price: 50000,
        cost: 5000,
        fee: 5,
        realizedPnl: 100,
        exchange: 'binance',
        strategy: 'sma',
        timestamp: twoDaysAgo,
      },
      {
        tradeId: 'trade-2',
        symbol: 'BTC/USDT',
        side: 'sell',
        type: 'limit',
        amount: 0.1,
        price: 51000,
        cost: 5100,
        fee: 5.1,
        realizedPnl: 200,
        exchange: 'binance',
        strategy: 'sma',
        timestamp: oneDayAgo,
      },
      {
        tradeId: 'trade-3',
        symbol: 'ETH/USDT',
        side: 'buy',
        type: 'market',
        amount: 1,
        price: 3000,
        cost: 3000,
        fee: 3,
        realizedPnl: -50,
        exchange: 'binance',
        strategy: 'rsi',
        timestamp: now,
      },
    ]);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('交易统计', () => {
    it('应该返回正确的交易统计', () => {
      const stats = repo.getTradeStats();

      expect(stats.totalTrades).toBe(3);
      expect(stats.buyCount).toBe(2);
      expect(stats.sellCount).toBe(1);
    });

    it('应该按交易对筛选统计', () => {
      const stats = repo.getTradeStats({ symbol: 'BTC/USDT' });

      expect(stats.totalTrades).toBe(2);
    });

    it('应该按策略筛选统计', () => {
      const stats = repo.getTradeStats({ strategy: 'sma' });

      expect(stats.totalTrades).toBe(2);
      expect(stats.totalPnl).toBe(300); // 100 + 200
    });
  });

  describe('每日统计', () => {
    it('应该返回每日交易统计', () => {
      const dailyStats = repo.getDailyStats();

      expect(dailyStats.length).toBeGreaterThan(0);
      expect(dailyStats[0].trades).toBeGreaterThan(0);
    });
  });

  describe('按交易对分组统计', () => {
    it('应该返回按交易对分组的统计', () => {
      const stats = repo.getStatsBySymbol();

      expect(stats.length).toBe(2);
      const btcStats = stats.find(s => s.symbol === 'BTC/USDT');
      expect(btcStats.trades).toBe(2);
    });
  });

  describe('按策略分组统计', () => {
    it('应该返回按策略分组的统计', () => {
      const stats = repo.getStatsByStrategy();

      expect(stats.length).toBe(2);
      const smaStats = stats.find(s => s.strategy === 'sma');
      expect(smaStats.trades).toBe(2);
    });
  });

  describe('最近交易', () => {
    it('应该返回最近的交易', () => {
      const trades = repo.getRecentTrades(10);

      expect(trades.length).toBe(3);
      // 应该按时间倒序
      expect(trades[0].trade_id).toBe('trade-3');
    });
  });

  describe('交易搜索', () => {
    it('应该根据条件搜索交易', () => {
      const trades = repo.searchTrades({
        symbol: 'BTC/USDT',
        side: 'buy',
      });

      expect(trades.length).toBe(1);
      expect(trades[0].trade_id).toBe('trade-1');
    });
  });

  describe('胜率统计', () => {
    it('应该返回正确的胜率统计', () => {
      const stats = repo.getWinRateStats();

      expect(stats.totalTrades).toBe(3);
      expect(stats.wins).toBe(2); // 100 和 200
      expect(stats.losses).toBe(1); // -50
      expect(stats.winRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('盈亏曲线', () => {
    it('应该返回盈亏曲线数据', () => {
      const curve = repo.getPnLCurve();

      expect(curve.length).toBe(3);
      // 累计盈亏应该递增
      expect(curve[0].cumulative_pnl).toBe(100);
      expect(curve[1].cumulative_pnl).toBe(300);
      expect(curve[2].cumulative_pnl).toBe(250);
    });
  });

  describe('最大回撤', () => {
    it('应该计算正确的最大回撤', () => {
      const drawdown = repo.calculateMaxDrawdown();

      // 从 300 到 250，回撤 50
      expect(drawdown.maxDrawdown).toBe(50);
      expect(drawdown.maxDrawdownPercent).toBeCloseTo(16.67, 1);
    });
  });

  describe('订单统计', () => {
    beforeEach(() => {
      db.insertOrder({
        orderId: 'order-1',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        status: 'filled',
        amount: 0.1,
        filled: 0.1,
        cost: 5000,
        fee: 5,
        exchange: 'binance',
        strategy: 'sma',
        createdAt: Date.now(),
      });

      db.insertOrder({
        orderId: 'order-2',
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'market',
        status: 'cancelled',
        amount: 1,
        filled: 0,
        exchange: 'binance',
        createdAt: Date.now(),
      });
    });

    it('应该返回正确的订单统计', () => {
      const stats = repo.getOrderStats();

      expect(stats.totalOrders).toBe(2);
      expect(stats.filledOrders).toBe(1);
      expect(stats.cancelledOrders).toBe(1);
    });
  });
});
