/**
 * 回测引擎测试
 * Backtest Engine Tests
 * @module tests/unit/backtestReal.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BacktestEngine } from '../../src/backtest/BacktestEngine.js';

// ============================================
// 辅助函数
// ============================================

function generateCandles(count, startPrice = 50000, volatility = 100) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * volatility;
    price += change;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + volatility / 2,
      low: price - volatility / 2,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}

function generateTrendingCandles(count, startPrice, direction = 'up') {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const trend = direction === 'up' ? 50 : -50;
    const noise = (Math.random() - 0.5) * 20;
    price += trend + noise;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - 25,
      high: price + 50,
      low: price - 50,
      close: price,
      volume: 1000,
    });
  }

  return candles;
}

// ============================================
// 简单测试策略
// ============================================

class SimpleTestStrategy {
  constructor() {
    this.name = 'SimpleTestStrategy';
    this.engine = null;
  }

  async onInit() {
    // 初始化
  }

  async onTick(candle, history) {
    // 简单策略：每10根K线买入一次
    if (history.length % 10 === 0 && !this.engine.getPosition('BTC/USDT')) {
      this.engine.buyPercent('BTC/USDT', 50);
    }
  }

  async onFinish() {
    // 完成
  }
}

class BuyAndHoldStrategy {
  constructor() {
    this.name = 'BuyAndHold';
    this.engine = null;
    this.bought = false;
  }

  async onInit() {}

  async onTick(candle, history) {
    if (!this.bought) {
      this.engine.buyPercent('BTC/USDT', 90);
      this.bought = true;
    }
  }

  async onFinish() {}
}

// ============================================
// BacktestEngine 测试
// ============================================

describe('BacktestEngine (Real)', () => {
  let engine;

  beforeEach(() => {
    engine = new BacktestEngine({
      initialCapital: 10000,
      commissionRate: 0.001,
      slippage: 0.0005,
    });
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const e = new BacktestEngine();
      expect(e.config.initialCapital).toBe(10000);
      expect(e.config.commissionRate).toBe(0.001);
      expect(e.config.slippage).toBe(0.0005);
    });

    it('应该使用自定义配置', () => {
      const e = new BacktestEngine({
        initialCapital: 50000,
        commissionRate: 0.002,
        slippage: 0.001,
        leverage: 2,
      });

      expect(e.config.initialCapital).toBe(50000);
      expect(e.config.commissionRate).toBe(0.002);
      expect(e.config.slippage).toBe(0.001);
      expect(e.config.leverage).toBe(2);
    });

    it('应该初始化状态', () => {
      expect(engine.state.capital).toBe(10000);
      expect(engine.state.positions.size).toBe(0);
      expect(engine.state.orders.length).toBe(0);
      expect(engine.state.trades.length).toBe(0);
      expect(engine.state.running).toBe(false);
    });
  });

  describe('loadData', () => {
    it('应该加载有效数据', () => {
      const candles = generateCandles(100);
      const result = engine.loadData(candles);

      expect(engine.data).toBeDefined();
      expect(engine.data.length).toBe(100);
      expect(result).toBe(engine); // 链式调用
    });

    it('应该拒绝空数据', () => {
      expect(() => engine.loadData([])).toThrow();
      expect(() => engine.loadData(null)).toThrow();
    });

    it('应该拒绝缺少字段的数据', () => {
      const invalidData = [{ timestamp: 1, open: 100 }];
      expect(() => engine.loadData(invalidData)).toThrow('缺少必要字段');
    });

    it('应该按时间排序数据', () => {
      const candles = [
        { timestamp: 3000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { timestamp: 1000, open: 95, high: 105, low: 85, close: 100, volume: 1000 },
        { timestamp: 2000, open: 100, high: 110, low: 90, close: 102, volume: 1000 },
      ];

      engine.loadData(candles);

      expect(engine.data[0].timestamp).toBe(1000);
      expect(engine.data[1].timestamp).toBe(2000);
      expect(engine.data[2].timestamp).toBe(3000);
    });
  });

  describe('setStrategy', () => {
    it('应该设置有效策略', () => {
      const strategy = new SimpleTestStrategy();
      const result = engine.setStrategy(strategy);

      expect(engine.strategy).toBe(strategy);
      expect(strategy.engine).toBe(engine);
      expect(result).toBe(engine); // 链式调用
    });

    it('应该拒绝无效策略', () => {
      expect(() => engine.setStrategy({})).toThrow('onTick');
      expect(() => engine.setStrategy(null)).toThrow();
    });
  });

  describe('order', () => {
    beforeEach(() => {
      const candles = generateCandles(10);
      engine.loadData(candles);
      engine.state.currentIndex = 5;
    });

    it('应该创建市价买单', () => {
      const order = engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        type: 'market',
      });

      expect(order).toBeDefined();
      expect(order.symbol).toBe('BTC/USDT');
      expect(order.side).toBe('buy');
      expect(order.status).toBe('filled');
      expect(order.commission).toBeGreaterThan(0);
    });

    it('应该扣除资金和手续费', () => {
      const initialCapital = engine.state.capital;

      engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        type: 'market',
      });

      expect(engine.state.capital).toBeLessThan(initialCapital);
    });

    it('应该更新持仓', () => {
      engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        type: 'market',
      });

      const position = engine.state.positions.get('BTC/USDT');
      expect(position).toBeDefined();
      expect(position.amount).toBeCloseTo(0.1, 2);
    });

    it('应该拒绝资金不足的订单', () => {
      engine.state.capital = 100; // 很少的资金

      const order = engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1, // 大额订单
        type: 'market',
      });

      expect(order).toBeNull();
    });

    it('应该拒绝缺少参数的订单', () => {
      expect(() => engine.order({})).toThrow('缺少必要参数');
    });

    it('应该处理限价单', () => {
      const order = engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        type: 'limit',
        price: 50000,
      });

      expect(order).toBeDefined();
      expect(order.price).toBe(50000);
    });

    it('限价单必须指定价格', () => {
      expect(() => engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        type: 'limit',
      })).toThrow('必须指定价格');
    });
  });

  describe('buy/sell', () => {
    beforeEach(() => {
      const candles = generateCandles(10);
      engine.loadData(candles);
      engine.state.currentIndex = 5;
    });

    it('buy 应该创建买单', () => {
      const order = engine.buy('BTC/USDT', 0.1);
      expect(order.side).toBe('buy');
    });

    it('sell 应该创建卖单', () => {
      // 先买入
      engine.buy('BTC/USDT', 0.1);

      // 再卖出
      const order = engine.sell('BTC/USDT', 0.1);
      expect(order.side).toBe('sell');
    });

    it('buyPercent 应该按百分比买入', () => {
      const order = engine.buyPercent('BTC/USDT', 50);

      expect(order).toBeDefined();
      expect(order.side).toBe('buy');
    });
  });

  describe('closePosition', () => {
    beforeEach(() => {
      const candles = generateCandles(10);
      engine.loadData(candles);
      engine.state.currentIndex = 5;
    });

    it('应该平掉持仓', () => {
      engine.buy('BTC/USDT', 0.1);
      const order = engine.closePosition('BTC/USDT');

      expect(order).toBeDefined();
      expect(order.side).toBe('sell');
    });

    it('没有持仓时应该返回 null', () => {
      const order = engine.closePosition('BTC/USDT');
      expect(order).toBeNull();
    });
  });

  describe('getPosition/getCapital/getEquity', () => {
    beforeEach(() => {
      const candles = generateCandles(10);
      engine.loadData(candles);
      engine.state.currentIndex = 5;
    });

    it('getPosition 应该返回持仓', () => {
      engine.buy('BTC/USDT', 0.1);
      const position = engine.getPosition('BTC/USDT');

      expect(position).toBeDefined();
      expect(position.amount).toBeCloseTo(0.1, 2);
    });

    it('getPosition 对于无持仓应该返回 null', () => {
      const position = engine.getPosition('ETH/USDT');
      expect(position).toBeNull();
    });

    it('getCapital 应该返回资金', () => {
      const capital = engine.getCapital();
      expect(capital).toBe(10000);
    });

    it('getEquity 应该返回权益', () => {
      const equity = engine.getEquity();
      expect(equity).toBe(10000);

      // 买入后权益应该包含持仓价值
      engine.buy('BTC/USDT', 0.1);
      const newEquity = engine.getEquity();
      expect(newEquity).toBeGreaterThan(0);
    });
  });

  describe('getCurrentCandle/getHistory', () => {
    beforeEach(() => {
      const candles = generateCandles(100);
      engine.loadData(candles);
      engine.state.currentIndex = 50;
    });

    it('getCurrentCandle 应该返回当前K线', () => {
      const candle = engine.getCurrentCandle();
      expect(candle).toBe(engine.data[50]);
    });

    it('getHistory 应该返回历史K线', () => {
      const history = engine.getHistory(10);
      expect(history.length).toBe(10);
    });
  });

  describe('run', () => {
    it('应该完成回测', async () => {
      const candles = generateCandles(50);
      const strategy = new SimpleTestStrategy();

      const stats = await engine
        .loadData(candles)
        .setStrategy(strategy)
        .run();

      expect(stats).toBeDefined();
      expect(stats.initialCapital).toBe(10000);
      expect(stats.finalEquity).toBeGreaterThan(0);
      expect(stats.equityCurve.length).toBe(50);
    });

    it('应该在没有数据时抛出错误', async () => {
      const strategy = new SimpleTestStrategy();
      engine.setStrategy(strategy);

      await expect(engine.run()).rejects.toThrow('请先加载数据');
    });

    it('应该在没有策略时抛出错误', async () => {
      const candles = generateCandles(10);
      engine.loadData(candles);

      await expect(engine.run()).rejects.toThrow('请先设置策略');
    });

    it('应该发射事件', async () => {
      const candles = generateCandles(20);
      const strategy = new SimpleTestStrategy();

      const startListener = vi.fn();
      const completeListener = vi.fn();

      engine.on('start', startListener);
      engine.on('complete', completeListener);

      await engine.loadData(candles).setStrategy(strategy).run();

      expect(startListener).toHaveBeenCalled();
      expect(completeListener).toHaveBeenCalled();
    });

    it('应该在上涨行情中盈利', async () => {
      const candles = generateTrendingCandles(50, 50000, 'up');
      const strategy = new BuyAndHoldStrategy();

      const stats = await engine
        .loadData(candles)
        .setStrategy(strategy)
        .run();

      expect(stats.totalReturn).toBeGreaterThan(0);
    });

    it('应该在下跌行情中亏损', async () => {
      const candles = generateTrendingCandles(50, 50000, 'down');
      const strategy = new BuyAndHoldStrategy();

      const stats = await engine
        .loadData(candles)
        .setStrategy(strategy)
        .run();

      expect(stats.totalReturn).toBeLessThan(0);
    });
  });

  describe('统计计算', () => {
    it('应该计算正确的交易统计', async () => {
      const candles = generateCandles(100);
      const strategy = new SimpleTestStrategy();

      const stats = await engine
        .loadData(candles)
        .setStrategy(strategy)
        .run();

      expect(stats.totalTrades).toBeGreaterThanOrEqual(0);
      expect(stats.winRate).toBeGreaterThanOrEqual(0);
      expect(stats.winRate).toBeLessThanOrEqual(100);
    });

    it('应该计算最大回撤', async () => {
      const candles = generateCandles(100);
      const strategy = new BuyAndHoldStrategy();

      const stats = await engine
        .loadData(candles)
        .setStrategy(strategy)
        .run();

      expect(stats.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(stats.maxDrawdownPercent).toBeGreaterThanOrEqual(0);
      expect(stats.maxDrawdownPercent).toBeLessThanOrEqual(100);
    });

    it('应该计算夏普比率', async () => {
      const candles = generateCandles(100);
      const strategy = new BuyAndHoldStrategy();

      const stats = await engine
        .loadData(candles)
        .setStrategy(strategy)
        .run();

      expect(typeof stats.sharpeRatio).toBe('number');
    });

    it('应该计算手续费', async () => {
      const candles = generateCandles(50);
      const strategy = new SimpleTestStrategy();

      const stats = await engine
        .loadData(candles)
        .setStrategy(strategy)
        .run();

      expect(stats.totalCommission).toBeGreaterThanOrEqual(0);
    });
  });

  describe('_resetState', () => {
    it('应该重置所有状态', () => {
      engine.state.capital = 5000;
      engine.state.dailyReturns = [1, 2, 3];

      engine._resetState();

      expect(engine.state.capital).toBe(10000);
      expect(engine.state.dailyReturns.length).toBe(0);
      expect(engine.state.positions.size).toBe(0);
    });
  });
});
