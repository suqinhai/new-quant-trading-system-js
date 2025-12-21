/**
 * 回测模块测试
 * Backtest Module Tests
 * @module tests/unit/backtest.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BacktestEngine as SimpleBacktestEngine } from '../../src/backtest/BacktestEngine.js';
import BacktestEngine, {
  SIDE,
  ORDER_TYPE,
  ORDER_STATUS,
  EVENT_TYPE,
  POSITION_SIDE,
  BaseStrategy,
  Position,
  Account,
  OrderBook,
  MatchingEngine,
  ObjectPool,
} from '../../src/backtest/engine.js';

// ============================================
// 测试数据生成工具
// ============================================

function generateCandles(count, startPrice = 50000, startTimestamp = Date.now() - count * 3600000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 100;
    price += change;

    candles.push({
      timestamp: startTimestamp + i * 3600000,
      open: price - change / 2,
      high: price + 50,
      low: price - 50,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}

function createMockStrategy() {
  return {
    name: 'TestStrategy',
    onTick: vi.fn(),
    onInit: vi.fn(),
    onFinish: vi.fn(),
    engine: null,
  };
}

// ============================================
// SimpleBacktestEngine (BacktestEngine.js) 测试
// ============================================

describe('SimpleBacktestEngine (BacktestEngine.js)', () => {
  let engine;
  let mockStrategy;

  beforeEach(() => {
    engine = new SimpleBacktestEngine({
      initialCapital: 10000,
      commissionRate: 0.001,
      slippage: 0.0005,
    });
    mockStrategy = createMockStrategy();
  });

  afterEach(() => {
    if (engine) {
      engine.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const e = new SimpleBacktestEngine();

      expect(e.config.initialCapital).toBe(10000);
      expect(e.config.commissionRate).toBe(0.001);
      expect(e.config.slippage).toBe(0.0005);
      expect(e.config.allowShort).toBe(false);
      expect(e.config.leverage).toBe(1);
    });

    it('应该使用自定义配置', () => {
      expect(engine.config.initialCapital).toBe(10000);
      expect(engine.config.commissionRate).toBe(0.001);
    });

    it('应该初始化状态', () => {
      expect(engine.state.capital).toBe(10000);
      expect(engine.state.positions.size).toBe(0);
      expect(engine.state.orders.length).toBe(0);
      expect(engine.state.trades.length).toBe(0);
      expect(engine.state.equityCurve.length).toBe(0);
      expect(engine.state.running).toBe(false);
    });

    it('应该初始化新统计变量', () => {
      expect(engine.state.totalCommission).toBe(0);
      expect(engine.state.totalTradingVolume).toBe(0);
      expect(engine.state.maxPositionRatio).toBe(0);
      expect(engine.state.riskControlTriggers).toBe(0);
    });
  });

  describe('loadData', () => {
    it('应该成功加载有效数据', () => {
      const candles = generateCandles(10);

      const result = engine.loadData(candles);

      expect(engine.data.length).toBe(10);
      expect(result).toBe(engine); // 链式调用
    });

    it('应该按时间排序数据', () => {
      const candles = generateCandles(10);
      // 打乱顺序
      candles.reverse();

      engine.loadData(candles);

      for (let i = 1; i < engine.data.length; i++) {
        expect(engine.data[i].timestamp).toBeGreaterThanOrEqual(engine.data[i - 1].timestamp);
      }
    });

    it('应该拒绝非数组数据', () => {
      expect(() => engine.loadData(null)).toThrow('非空数组');
      expect(() => engine.loadData('invalid')).toThrow('非空数组');
    });

    it('应该拒绝空数组', () => {
      expect(() => engine.loadData([])).toThrow('非空数组');
    });

    it('应该验证必要字段', () => {
      const invalidCandles = [{ timestamp: 1, open: 100 }];

      expect(() => engine.loadData(invalidCandles)).toThrow('缺少必要字段');
    });
  });

  describe('setStrategy', () => {
    it('应该成功设置策略', () => {
      const result = engine.setStrategy(mockStrategy);

      expect(engine.strategy).toBe(mockStrategy);
      expect(mockStrategy.engine).toBe(engine);
      expect(result).toBe(engine); // 链式调用
    });

    it('应该拒绝无效策略', () => {
      expect(() => engine.setStrategy(null)).toThrow('onTick');
      expect(() => engine.setStrategy({})).toThrow('onTick');
    });
  });

  describe('run', () => {
    beforeEach(() => {
      const candles = generateCandles(20);
      engine.loadData(candles);
      engine.setStrategy(mockStrategy);
    });

    it('应该成功运行回测', async () => {
      const result = await engine.run();

      expect(result).toBeDefined();
      expect(result.initialCapital).toBe(10000);
      expect(engine.state.running).toBe(false);
    });

    it('应该调用策略 onTick', async () => {
      await engine.run();

      expect(mockStrategy.onTick).toHaveBeenCalledTimes(20);
    });

    it('应该调用策略 onInit', async () => {
      await engine.run();

      expect(mockStrategy.onInit).toHaveBeenCalled();
    });

    it('应该调用策略 onFinish', async () => {
      await engine.run();

      expect(mockStrategy.onFinish).toHaveBeenCalled();
    });

    it('应该发射事件', async () => {
      const startListener = vi.fn();
      const progressListener = vi.fn();
      const completeListener = vi.fn();

      engine.on('start', startListener);
      engine.on('progress', progressListener);
      engine.on('complete', completeListener);

      await engine.run();

      expect(startListener).toHaveBeenCalled();
      expect(completeListener).toHaveBeenCalled();
    });

    it('没有数据时应该抛错', async () => {
      const e = new SimpleBacktestEngine();
      e.setStrategy(mockStrategy);

      await expect(e.run()).rejects.toThrow('加载数据');
    });

    it('没有策略时应该抛错', async () => {
      const e = new SimpleBacktestEngine();
      e.loadData(generateCandles(10));

      await expect(e.run()).rejects.toThrow('设置策略');
    });
  });

  describe('order', () => {
    beforeEach(() => {
      const candles = generateCandles(10);
      engine.loadData(candles);
      engine.state.currentIndex = 5;
    });

    it('应该成功创建市价单', () => {
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
    });

    it('应该计算手续费', () => {
      const order = engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(order.commission).toBeGreaterThan(0);
      expect(engine.state.totalCommission).toBe(order.commission);
    });

    it('应该更新资金', () => {
      const initialCapital = engine.state.capital;

      engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(engine.state.capital).toBeLessThan(initialCapital);
    });

    it('应该拒绝资金不足的订单', () => {
      engine.state.capital = 100; // 设置很低的资金

      const order = engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1, // 大量买入
      });

      expect(order).toBeNull();
    });

    it('应该拒绝缺少参数的订单', () => {
      expect(() => engine.order({})).toThrow('缺少必要参数');
    });

    it('限价单应该使用指定价格', () => {
      const order = engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        type: 'limit',
        price: 45000,
      });

      expect(order.price).toBe(45000);
    });

    it('限价单没有价格应该抛错', () => {
      expect(() => engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        type: 'limit',
      })).toThrow('指定价格');
    });

    it('应该发射 order 事件', () => {
      const listener = vi.fn();
      engine.on('order', listener);

      engine.order({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('buy', () => {
    beforeEach(() => {
      engine.loadData(generateCandles(10));
      engine.state.currentIndex = 5;
    });

    it('应该创建买单', () => {
      const order = engine.buy('BTC/USDT', 0.1);

      expect(order.side).toBe('buy');
      expect(order.amount).toBe(0.1);
    });
  });

  describe('sell', () => {
    beforeEach(() => {
      engine.loadData(generateCandles(10));
      engine.state.currentIndex = 5;
    });

    it('应该创建卖单', () => {
      // 先买入
      engine.buy('BTC/USDT', 0.1);

      const order = engine.sell('BTC/USDT', 0.1);

      expect(order.side).toBe('sell');
    });
  });

  describe('buyPercent', () => {
    beforeEach(() => {
      engine.loadData(generateCandles(10));
      engine.state.currentIndex = 5;
    });

    it('应该按百分比买入', () => {
      const initialCapital = engine.state.capital;

      engine.buyPercent('BTC/USDT', 50);

      // 应该花费约50%的资金
      expect(engine.state.capital).toBeLessThan(initialCapital * 0.55);
      expect(engine.state.capital).toBeGreaterThan(initialCapital * 0.45);
    });
  });

  describe('closePosition', () => {
    beforeEach(() => {
      engine.loadData(generateCandles(10));
      engine.state.currentIndex = 5;
    });

    it('应该平掉持仓', () => {
      engine.buy('BTC/USDT', 0.1);
      const position = engine.getPosition('BTC/USDT');
      expect(position.amount).toBe(0.1);

      engine.closePosition('BTC/USDT');

      const closedPosition = engine.getPosition('BTC/USDT');
      expect(closedPosition.amount).toBe(0);
    });

    it('无持仓时应该返回 null', () => {
      const result = engine.closePosition('BTC/USDT');
      expect(result).toBeNull();
    });
  });

  describe('getPosition', () => {
    beforeEach(() => {
      engine.loadData(generateCandles(10));
      engine.state.currentIndex = 5;
    });

    it('应该返回持仓', () => {
      engine.buy('BTC/USDT', 0.1);

      const position = engine.getPosition('BTC/USDT');

      expect(position).toBeDefined();
      expect(position.amount).toBe(0.1);
    });

    it('无持仓应该返回 null', () => {
      expect(engine.getPosition('ETH/USDT')).toBeNull();
    });
  });

  describe('getCapital', () => {
    it('应该返回当前资金', () => {
      expect(engine.getCapital()).toBe(10000);
    });
  });

  describe('getEquity', () => {
    beforeEach(() => {
      engine.loadData(generateCandles(10));
      engine.state.currentIndex = 5;
    });

    it('应该返回当前权益', () => {
      expect(engine.getEquity()).toBe(10000);
    });

    it('应该包含持仓价值', () => {
      engine.buy('BTC/USDT', 0.1);

      const equity = engine.getEquity();

      // 权益应该接近初始资金（减去手续费）
      expect(equity).toBeGreaterThan(9900);
      expect(equity).toBeLessThan(10100);
    });
  });

  describe('getCurrentCandle', () => {
    beforeEach(() => {
      engine.loadData(generateCandles(10));
      engine.state.currentIndex = 5;
    });

    it('应该返回当前K线', () => {
      const candle = engine.getCurrentCandle();

      expect(candle).toBeDefined();
      expect(candle.open).toBeDefined();
      expect(candle.close).toBeDefined();
    });
  });

  describe('getHistory', () => {
    beforeEach(() => {
      engine.loadData(generateCandles(20));
      engine.state.currentIndex = 15;
    });

    it('应该返回历史K线', () => {
      const history = engine.getHistory(10);

      expect(history.length).toBe(10);
    });

    it('应该使用默认数量', () => {
      const history = engine.getHistory();

      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('_calculateStats', () => {
    beforeEach(async () => {
      engine.loadData(generateCandles(50));

      const strategy = {
        name: 'TestStrategy',
        onTick: async (candle, history) => {
          if (history.length === 10) {
            engine.buy('BTC/USDT', 0.1);
          }
          if (history.length === 40) {
            engine.closePosition('BTC/USDT');
          }
        },
        onInit: vi.fn(),
        onFinish: vi.fn(),
      };

      engine.setStrategy(strategy);
      await engine.run();
    });

    it('应该计算总收益率', () => {
      expect(engine.stats.totalReturn).toBeDefined();
    });

    it('应该计算年化收益率', () => {
      expect(engine.stats.annualReturn).toBeDefined();
    });

    it('应该计算交易统计', () => {
      expect(engine.stats.totalTrades).toBeGreaterThanOrEqual(0);
      expect(engine.stats.winRate).toBeDefined();
    });

    it('应该计算最大回撤', () => {
      expect(engine.stats.maxDrawdown).toBeDefined();
      expect(engine.stats.maxDrawdownPercent).toBeDefined();
    });

    it('应该计算夏普比率', () => {
      expect(engine.stats.sharpeRatio).toBeDefined();
    });

    it('应该包含新增指标', () => {
      expect(engine.stats.calmarRatio).toBeDefined();
      expect(engine.stats.turnoverRate).toBeDefined();
      expect(engine.stats.tradingCostRate).toBeDefined();
      expect(engine.stats.totalCommission).toBeDefined();
    });
  });
});

// ============================================
// ObjectPool 测试
// ============================================

describe('ObjectPool', () => {
  let pool;
  let createCount;

  beforeEach(() => {
    createCount = 0;
    pool = new ObjectPool(
      () => ({ id: ++createCount, value: 0 }),
      (obj) => { obj.value = 0; },
      5
    );
  });

  describe('构造函数', () => {
    it('应该预分配对象', () => {
      expect(pool.pool.length).toBe(5);
      expect(createCount).toBe(5);
    });
  });

  describe('acquire', () => {
    it('应该从池中获取对象', () => {
      const obj = pool.acquire();

      expect(obj).toBeDefined();
      expect(pool.pool.length).toBe(4);
    });

    it('池为空时应该创建新对象', () => {
      // 获取所有预分配对象
      for (let i = 0; i < 5; i++) {
        pool.acquire();
      }

      const obj = pool.acquire();

      expect(obj).toBeDefined();
      expect(createCount).toBe(6);
    });
  });

  describe('release', () => {
    it('应该释放对象回池', () => {
      const obj = pool.acquire();
      obj.value = 100;

      pool.release(obj);

      expect(pool.pool.length).toBe(5);
      expect(obj.value).toBe(0); // 已被重置
    });
  });
});

// ============================================
// Position 测试
// ============================================

describe('Position', () => {
  let position;
  const config = {
    maintenanceMarginRate: 0.004,
    liquidationFeeRate: 0.006,
  };

  beforeEach(() => {
    position = new Position('BTC/USDT');
    position.leverage = 10;
  });

  describe('构造函数', () => {
    it('应该初始化空持仓', () => {
      expect(position.symbol).toBe('BTC/USDT');
      expect(position.side).toBe(POSITION_SIDE.NONE);
      expect(position.size).toBe(0);
      expect(position.entryPrice).toBe(0);
    });
  });

  describe('update', () => {
    it('应该开多仓', () => {
      const pnl = position.update(SIDE.BUY, 0.1, 50000, config);

      expect(position.side).toBe(POSITION_SIDE.LONG);
      expect(position.size).toBe(0.1);
      expect(position.entryPrice).toBe(50000);
      expect(pnl).toBe(0);
    });

    it('应该开空仓', () => {
      position.update(SIDE.SELL, 0.1, 50000, config);

      expect(position.side).toBe(POSITION_SIDE.SHORT);
      expect(position.size).toBe(0.1);
    });

    it('应该同向加仓', () => {
      position.update(SIDE.BUY, 0.1, 50000, config);
      position.update(SIDE.BUY, 0.1, 51000, config);

      expect(position.size).toBe(0.2);
      expect(position.entryPrice).toBe(50500); // 平均价
    });

    it('应该部分平仓并计算盈亏', () => {
      position.update(SIDE.BUY, 0.2, 50000, config);

      const pnl = position.update(SIDE.SELL, 0.1, 51000, config);

      expect(position.size).toBe(0.1);
      expect(pnl).toBe(100); // 0.1 * (51000 - 50000) = 100
    });

    it('应该完全平仓', () => {
      position.update(SIDE.BUY, 0.1, 50000, config);

      const pnl = position.update(SIDE.SELL, 0.1, 51000, config);

      expect(position.side).toBe(POSITION_SIDE.NONE);
      expect(position.size).toBe(0);
      expect(pnl).toBe(100);
    });

    it('应该反向开仓', () => {
      position.update(SIDE.BUY, 0.1, 50000, config);

      const pnl = position.update(SIDE.SELL, 0.2, 51000, config);

      expect(position.side).toBe(POSITION_SIDE.SHORT);
      expect(position.size).toBe(0.1);
      expect(pnl).toBe(100); // 平掉多仓的盈利
    });
  });

  describe('updateMarkPrice', () => {
    it('应该更新标记价格和未实现盈亏', () => {
      position.update(SIDE.BUY, 0.1, 50000, config);

      position.updateMarkPrice(51000);

      expect(position.markPrice).toBe(51000);
      expect(position.unrealizedPnl).toBe(100); // 0.1 * (51000 - 50000)
      expect(position.notional).toBe(5100); // 0.1 * 51000
    });

    it('空仓时应该计算负盈亏', () => {
      position.update(SIDE.SELL, 0.1, 50000, config);

      position.updateMarkPrice(51000);

      // 空仓亏损: 0.1 * (51000 - 50000) * -1 = -100
      expect(position.unrealizedPnl).toBe(-100);
    });
  });

  describe('applyFundingRate', () => {
    it('应该应用资金费率', () => {
      position.update(SIDE.BUY, 0.1, 50000, config);
      position.updateMarkPrice(50000);

      const fee = position.applyFundingRate(0.0001);

      expect(fee).toBeCloseTo(0.5); // 5000 * 0.0001 * 1
      expect(position.fundingFee).toBeCloseTo(0.5);
    });

    it('无持仓应该返回 0', () => {
      const fee = position.applyFundingRate(0.0001);
      expect(fee).toBe(0);
    });
  });

  describe('shouldLiquidate', () => {
    beforeEach(() => {
      position.update(SIDE.BUY, 0.1, 50000, config);
    });

    it('应该检测多头强平', () => {
      // 多头强平价 = 50000 * (1 - 1/10 + 0.004) = 45200
      expect(position.shouldLiquidate(45000)).toBe(true);
      expect(position.shouldLiquidate(46000)).toBe(false);
    });

    it('无持仓应该返回 false', () => {
      const emptyPosition = new Position('ETH/USDT');
      expect(emptyPosition.shouldLiquidate(50000)).toBe(false);
    });
  });

  describe('reset', () => {
    it('应该重置持仓', () => {
      position.update(SIDE.BUY, 0.1, 50000, config);
      position.fundingFee = 10;

      position.reset();

      expect(position.side).toBe(POSITION_SIDE.NONE);
      expect(position.size).toBe(0);
      expect(position.fundingFee).toBe(0);
    });
  });

  describe('clone', () => {
    it('应该返回持仓快照', () => {
      position.update(SIDE.BUY, 0.1, 50000, config);

      const snapshot = position.clone();

      expect(snapshot.symbol).toBe('BTC/USDT');
      expect(snapshot.size).toBe(0.1);
      expect(snapshot).not.toBe(position);
    });
  });
});

// ============================================
// OrderBook 测试
// ============================================

describe('OrderBook', () => {
  let orderBook;

  beforeEach(() => {
    orderBook = new OrderBook('BTC/USDT');
  });

  describe('构造函数', () => {
    it('应该初始化空订单簿', () => {
      expect(orderBook.symbol).toBe('BTC/USDT');
      expect(orderBook.bids.length).toBe(0);
      expect(orderBook.asks.length).toBe(0);
    });
  });

  describe('update', () => {
    it('应该更新订单簿', () => {
      const bids = [[50000, 1], [49900, 2]];
      const asks = [[50100, 1], [50200, 2]];

      orderBook.update(bids, asks, Date.now());

      expect(orderBook.bids).toEqual(bids);
      expect(orderBook.asks).toEqual(asks);
    });
  });

  describe('getBestBid/getBestAsk', () => {
    beforeEach(() => {
      orderBook.update(
        [[50000, 1], [49900, 2]],
        [[50100, 1], [50200, 2]],
        Date.now()
      );
    });

    it('应该返回最佳买价', () => {
      expect(orderBook.getBestBid()).toBe(50000);
    });

    it('应该返回最佳卖价', () => {
      expect(orderBook.getBestAsk()).toBe(50100);
    });

    it('空订单簿应该返回 0', () => {
      const emptyBook = new OrderBook('ETH/USDT');
      expect(emptyBook.getBestBid()).toBe(0);
      expect(emptyBook.getBestAsk()).toBe(0);
    });
  });

  describe('getMidPrice', () => {
    it('应该返回中间价', () => {
      orderBook.update(
        [[50000, 1]],
        [[50100, 1]],
        Date.now()
      );

      expect(orderBook.getMidPrice()).toBe(50050);
    });

    it('没有深度时应该返回最新成交价', () => {
      orderBook.lastPrice = 50000;
      expect(orderBook.getMidPrice()).toBe(50000);
    });
  });

  describe('simulateMarketOrder', () => {
    beforeEach(() => {
      orderBook.update(
        [[50000, 1], [49900, 2], [49800, 3]],
        [[50100, 1], [50200, 2], [50300, 3]],
        Date.now()
      );
    });

    it('应该模拟买单成交', () => {
      const result = orderBook.simulateMarketOrder(SIDE.BUY, 0.5);

      expect(result.success).toBe(true);
      expect(result.avgPrice).toBeGreaterThanOrEqual(50100);
      expect(result.fills.length).toBeGreaterThan(0);
    });

    it('应该模拟卖单成交', () => {
      const result = orderBook.simulateMarketOrder(SIDE.SELL, 0.5);

      expect(result.success).toBe(true);
      expect(result.avgPrice).toBeLessThanOrEqual(50000);
    });

    it('流动性不足应该返回失败', () => {
      const result = orderBook.simulateMarketOrder(SIDE.BUY, 100);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('liquidity');
    });

    it('空订单簿应该返回失败', () => {
      const emptyBook = new OrderBook('ETH/USDT');
      const result = emptyBook.simulateMarketOrder(SIDE.BUY, 1);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Empty');
    });

    it('应该计算滑点', () => {
      const result = orderBook.simulateMarketOrder(SIDE.BUY, 2);

      expect(result.slippage).toBeDefined();
      expect(result.slippage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkLimitOrder', () => {
    beforeEach(() => {
      orderBook.update(
        [[50000, 1]],
        [[50100, 1]],
        Date.now()
      );
    });

    it('买单价格达到卖价应该成交', () => {
      const result = orderBook.checkLimitOrder(SIDE.BUY, 50100, 0.5);
      expect(result.success).toBe(true);
    });

    it('买单价格未达到卖价应该挂单', () => {
      const result = orderBook.checkLimitOrder(SIDE.BUY, 50000, 0.5);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('Price not reached');
    });

    it('卖单价格达到买价应该成交', () => {
      const result = orderBook.checkLimitOrder(SIDE.SELL, 50000, 0.5);
      expect(result.success).toBe(true);
    });
  });

  describe('updateLastPrice', () => {
    it('应该更新最新成交价', () => {
      orderBook.updateLastPrice(50500, Date.now());

      expect(orderBook.lastPrice).toBe(50500);
    });
  });
});

// ============================================
// Account 测试
// ============================================

describe('Account', () => {
  let account;
  const config = {
    initialCapital: 10000,
    leverage: 10,
    maintenanceMarginRate: 0.004,
    liquidationFeeRate: 0.006,
  };

  beforeEach(() => {
    account = new Account(config);
  });

  describe('构造函数', () => {
    it('应该初始化账户', () => {
      expect(account.balance).toBe(10000);
      expect(account.available).toBe(10000);
      expect(account.equity).toBe(10000);
      expect(account.positions.size).toBe(0);
    });
  });

  describe('getPosition', () => {
    it('应该创建新持仓', () => {
      const position = account.getPosition('BTC/USDT');

      expect(position).toBeDefined();
      expect(position.symbol).toBe('BTC/USDT');
      expect(account.positions.has('BTC/USDT')).toBe(true);
    });

    it('应该返回已有持仓', () => {
      const position1 = account.getPosition('BTC/USDT');
      const position2 = account.getPosition('BTC/USDT');

      expect(position1).toBe(position2);
    });
  });

  describe('updateState', () => {
    it('应该更新账户状态', () => {
      const position = account.getPosition('BTC/USDT');
      position.update(SIDE.BUY, 0.1, 50000, config);
      position.updateMarkPrice(51000);

      account.updateState();

      expect(account.unrealizedPnl).toBe(100);
      expect(account.equity).toBe(10100);
    });
  });

  describe('deductFee', () => {
    it('应该扣除手续费', () => {
      account.deductFee(10);

      expect(account.balance).toBe(9990);
      expect(account.totalFees).toBe(10);
    });
  });

  describe('deductFundingFee', () => {
    it('应该扣除资金费用', () => {
      account.deductFundingFee(5);

      expect(account.balance).toBe(9995);
      expect(account.totalFundingFees).toBe(5);
    });
  });

  describe('addRealizedPnl', () => {
    it('应该添加已实现盈亏', () => {
      account.addRealizedPnl(100);

      expect(account.balance).toBe(10100);
      expect(account.realizedPnl).toBe(100);
    });
  });

  describe('hasEnoughMargin', () => {
    it('应该检查保证金充足', () => {
      expect(account.hasEnoughMargin(5000)).toBe(true);
      expect(account.hasEnoughMargin(15000)).toBe(false);
    });
  });

  describe('getSnapshot', () => {
    it('应该返回账户快照', () => {
      const snapshot = account.getSnapshot();

      expect(snapshot.balance).toBe(10000);
      expect(snapshot.equity).toBe(10000);
      expect(snapshot.positions).toEqual([]);
    });
  });

  describe('reset', () => {
    it('应该重置账户', () => {
      account.deductFee(100);
      account.getPosition('BTC/USDT');

      account.reset();

      expect(account.balance).toBe(10000);
      expect(account.totalFees).toBe(0);
      expect(account.positions.size).toBe(0);
    });
  });
});

// ============================================
// MatchingEngine 测试
// ============================================

describe('MatchingEngine', () => {
  let engine;
  let account;
  const config = {
    initialCapital: 10000,
    leverage: 10,
    makerFee: 0.0002,
    takerFee: 0.0005,
    maintenanceMarginRate: 0.004,
    liquidationFeeRate: 0.006,
    preAllocateOrders: 100,
  };

  beforeEach(() => {
    account = new Account(config);
    engine = new MatchingEngine(config, account);

    // 设置订单簿
    const orderBook = engine.getOrderBook('BTC/USDT');
    orderBook.update(
      [[50000, 10], [49900, 20]],
      [[50100, 10], [50200, 20]],
      Date.now()
    );
  });

  describe('getOrderBook', () => {
    it('应该创建新订单簿', () => {
      const orderBook = engine.getOrderBook('ETH/USDT');
      expect(orderBook.symbol).toBe('ETH/USDT');
    });
  });

  describe('submitOrder', () => {
    it('应该提交市价单', () => {
      const order = engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.MARKET,
        amount: 0.1,
      }, Date.now());

      expect(order).toBeDefined();
      expect(order.status).toBe(ORDER_STATUS.FILLED);
    });

    it('应该提交限价单并挂单', () => {
      const order = engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.LIMIT,
        price: 49000,
        amount: 0.1,
      }, Date.now());

      expect(order.status).toBe(ORDER_STATUS.OPEN);
      expect(engine.activeOrders.has(order.id)).toBe(true);
    });

    it('应该拒绝无效订单', () => {
      const order = engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.MARKET,
        amount: 0, // 无效数量
      }, Date.now());

      expect(order).toBeNull();
    });

    it('应该拒绝保证金不足的订单', () => {
      account.available = 100;

      const order = engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.MARKET,
        amount: 10,
      }, Date.now());

      expect(order).toBeNull();
    });

    it('post-only 订单价格低于卖价应该挂单', () => {
      const order = engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.LIMIT,
        price: 49500, // 低于最佳卖价50100，不会立即成交
        amount: 0.1,
        postOnly: true,
      }, Date.now());

      // postOnly 订单挂单成功
      expect(order).toBeDefined();
      expect(order.status).toBe(ORDER_STATUS.OPEN);
      expect(order.postOnly).toBe(true);
      expect(engine.activeOrders.has(order.id)).toBe(true);
    });

    it('reduce-only 订单无持仓时应该拒绝', () => {
      const order = engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.SELL,
        type: ORDER_TYPE.MARKET,
        amount: 0.1,
        reduceOnly: true,
      }, Date.now());

      expect(order).toBeNull();
    });
  });

  describe('cancelOrder', () => {
    it('应该取消订单', () => {
      const order = engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.LIMIT,
        price: 49000,
        amount: 0.1,
      }, Date.now());

      const result = engine.cancelOrder(order.id, Date.now());

      expect(result).toBe(true);
      expect(engine.activeOrders.has(order.id)).toBe(false);
    });

    it('取消不存在的订单应该返回 false', () => {
      const result = engine.cancelOrder(99999, Date.now());
      expect(result).toBe(false);
    });
  });

  describe('cancelAllOrders', () => {
    it('应该取消所有订单', () => {
      engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.LIMIT,
        price: 49000,
        amount: 0.1,
      }, Date.now());

      engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.LIMIT,
        price: 48000,
        amount: 0.1,
      }, Date.now());

      const count = engine.cancelAllOrders(null, Date.now());

      expect(count).toBe(2);
      expect(engine.activeOrders.size).toBe(0);
    });

    it('应该按交易对过滤', () => {
      engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.LIMIT,
        price: 49000,
        amount: 0.1,
      }, Date.now());

      const count = engine.cancelAllOrders('ETH/USDT', Date.now());

      expect(count).toBe(0);
    });
  });

  describe('updateOrderBook', () => {
    it('应该更新订单簿', () => {
      const newBids = [[50500, 5]];
      const newAsks = [[50600, 5]];

      engine.updateOrderBook('BTC/USDT', newBids, newAsks, Date.now());

      const orderBook = engine.getOrderBook('BTC/USDT');
      expect(orderBook.getBestBid()).toBe(50500);
    });

    it('更新后应该尝试撮合限价单', () => {
      // 先下一个限价买单
      engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.LIMIT,
        price: 50500,
        amount: 0.1,
      }, Date.now());

      // 更新订单簿使卖价降到买单价格以下
      engine.updateOrderBook(
        'BTC/USDT',
        [[50000, 10]],
        [[50400, 10]], // 卖价 50400 < 买单价 50500
        Date.now()
      );

      // 订单应该已成交
      expect(engine.activeOrders.size).toBe(0);
    });
  });

  describe('reset', () => {
    it('应该重置撮合引擎', () => {
      engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.MARKET,
        amount: 0.1,
      }, Date.now());

      engine.reset();

      expect(engine.orderBooks.size).toBe(0);
      expect(engine.activeOrders.size).toBe(0);
      expect(engine.filledOrders.length).toBe(0);
    });
  });
});

// ============================================
// BaseStrategy 测试
// ============================================

describe('BaseStrategy (engine.js)', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new BaseStrategy({ name: 'TestStrategy' });

    mockEngine = {
      currentTime: Date.now(),
      account: {
        getSnapshot: vi.fn().mockReturnValue({ balance: 10000 }),
        getPosition: vi.fn().mockReturnValue({ clone: () => ({ size: 0.1 }) }),
      },
      matchingEngine: {
        getOrderBook: vi.fn().mockReturnValue({
          bids: [],
          asks: [],
          getMidPrice: () => 50000,
          lastPrice: 50000,
        }),
        activeOrders: new Map(),
      },
      submitOrder: vi.fn().mockReturnValue({ id: 1 }),
      cancelOrder: vi.fn().mockReturnValue(true),
      cancelAllOrders: vi.fn().mockReturnValue(2),
      closeAllPositions: vi.fn(),
    };
  });

  describe('构造函数', () => {
    it('应该使用默认名称', () => {
      const s = new BaseStrategy();
      expect(s.name).toBe('BaseStrategy');
    });

    it('应该使用自定义参数', () => {
      expect(strategy.name).toBe('TestStrategy');
    });
  });

  describe('init', () => {
    it('应该初始化策略', () => {
      strategy.init(mockEngine);

      expect(strategy.engine).toBe(mockEngine);
      expect(strategy.initialized).toBe(true);
    });
  });

  describe('交易 API', () => {
    beforeEach(() => {
      strategy.init(mockEngine);
    });

    it('marketBuy 应该提交市价买单', () => {
      strategy.marketBuy('BTC/USDT', 0.1);

      expect(mockEngine.submitOrder).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.MARKET,
        amount: 0.1,
      }));
    });

    it('marketSell 应该提交市价卖单', () => {
      strategy.marketSell('BTC/USDT', 0.1);

      expect(mockEngine.submitOrder).toHaveBeenCalledWith(expect.objectContaining({
        side: SIDE.SELL,
        type: ORDER_TYPE.MARKET,
      }));
    });

    it('limitBuy 应该提交限价买单', () => {
      strategy.limitBuy('BTC/USDT', 50000, 0.1);

      expect(mockEngine.submitOrder).toHaveBeenCalledWith(expect.objectContaining({
        side: SIDE.BUY,
        type: ORDER_TYPE.LIMIT,
        price: 50000,
      }));
    });

    it('limitSell 应该提交限价卖单', () => {
      strategy.limitSell('BTC/USDT', 51000, 0.1);

      expect(mockEngine.submitOrder).toHaveBeenCalledWith(expect.objectContaining({
        side: SIDE.SELL,
        type: ORDER_TYPE.LIMIT,
        price: 51000,
      }));
    });

    it('cancelOrder 应该取消订单', () => {
      strategy.cancelOrder(1);
      expect(mockEngine.cancelOrder).toHaveBeenCalledWith(1);
    });

    it('cancelAllOrders 应该取消所有订单', () => {
      strategy.cancelAllOrders('BTC/USDT');
      expect(mockEngine.cancelAllOrders).toHaveBeenCalledWith('BTC/USDT');
    });
  });

  describe('查询 API', () => {
    beforeEach(() => {
      strategy.init(mockEngine);
    });

    it('getTime 应该返回当前时间', () => {
      const time = strategy.getTime();
      expect(time).toBe(mockEngine.currentTime);
    });

    it('getAccount 应该返回账户快照', () => {
      strategy.getAccount();
      expect(mockEngine.account.getSnapshot).toHaveBeenCalled();
    });

    it('getPosition 应该返回持仓', () => {
      const position = strategy.getPosition('BTC/USDT');
      expect(position.size).toBe(0.1);
    });
  });
});

// ============================================
// BacktestEngine (engine.js) 测试
// ============================================

describe('BacktestEngine (engine.js)', () => {
  let engine;

  beforeEach(() => {
    engine = new BacktestEngine({
      initialCapital: 10000,
      leverage: 10,
    });
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const e = new BacktestEngine();

      expect(e.config.initialCapital).toBe(10000);
      expect(e.config.leverage).toBe(10);
      expect(e.config.makerFee).toBe(0.0002);
      expect(e.config.takerFee).toBe(0.0005);
    });

    it('应该创建账户和撮合引擎', () => {
      expect(engine.account).toBeDefined();
      expect(engine.matchingEngine).toBeDefined();
    });
  });

  describe('setStrategy', () => {
    it('应该设置策略', () => {
      class TestStrategy extends BaseStrategy {
        onTrade() {}
      }

      const strategy = new TestStrategy();
      engine.setStrategy(strategy);

      expect(engine.strategy).toBe(strategy);
      expect(strategy.initialized).toBe(true);
    });
  });

  describe('loadEvents', () => {
    it('应该加载事件', () => {
      const events = [
        { type: EVENT_TYPE.TRADE, timestamp: 1000, symbol: 'BTC/USDT', data: { price: 50000 } },
        { type: EVENT_TYPE.TRADE, timestamp: 2000, symbol: 'BTC/USDT', data: { price: 50100 } },
      ];

      engine.loadEvents(events);

      expect(engine.events.length).toBe(2);
    });

    it('应该按时间排序事件', () => {
      const events = [
        { type: EVENT_TYPE.TRADE, timestamp: 2000, symbol: 'BTC/USDT', data: {} },
        { type: EVENT_TYPE.TRADE, timestamp: 1000, symbol: 'BTC/USDT', data: {} },
      ];

      engine.loadEvents(events);

      expect(engine.events[0].timestamp).toBe(1000);
      expect(engine.events[1].timestamp).toBe(2000);
    });
  });

  describe('loadTrades', () => {
    it('应该加载交易数据', () => {
      const trades = [
        [1000, 50000, 1, SIDE.BUY],
        [2000, 50100, 0.5, SIDE.SELL],
      ];

      engine.loadTrades('BTC/USDT', trades);

      expect(engine.events.length).toBe(2);
      expect(engine.events[0].type).toBe(EVENT_TYPE.TRADE);
    });
  });

  describe('loadDepthSnapshots', () => {
    it('应该加载深度快照', () => {
      const snapshots = [
        { timestamp: 1000, bids: [[50000, 1]], asks: [[50100, 1]] },
      ];

      engine.loadDepthSnapshots('BTC/USDT', snapshots);

      expect(engine.events.length).toBe(1);
      expect(engine.events[0].type).toBe(EVENT_TYPE.DEPTH);
    });
  });

  describe('loadFundingRates', () => {
    it('应该加载资金费率', () => {
      const fundingRates = [
        [1000, 0.0001],
        [9000, 0.0002],
      ];

      engine.loadFundingRates('BTC/USDT', fundingRates);

      expect(engine.events.length).toBe(2);
      expect(engine.events[0].type).toBe(EVENT_TYPE.FUNDING);
    });
  });

  describe('loadKlines', () => {
    it('应该加载K线数据', () => {
      const klines = [
        [1000, 50000, 50100, 49900, 50050, 1000],
      ];

      engine.loadKlines('BTC/USDT', klines);

      expect(engine.events.length).toBe(1);
      expect(engine.events[0].type).toBe(EVENT_TYPE.KLINE);
    });
  });

  describe('run', () => {
    it('没有策略时应该抛错', () => {
      engine.loadEvents([{ type: EVENT_TYPE.TRADE, timestamp: 1000, symbol: 'BTC/USDT', data: {} }]);
      expect(() => engine.run()).toThrow('未设置策略');
    });

    it('没有事件时应该抛错', () => {
      class TestStrategy extends BaseStrategy {}
      engine.setStrategy(new TestStrategy());

      expect(() => engine.run()).toThrow('未加载事件');
    });

    it('应该运行回测', () => {
      class TestStrategy extends BaseStrategy {
        onKline(kline) {
          if (!this.bought && kline.close > 50000) {
            this.marketBuy('BTC/USDT', 0.1);
            this.bought = true;
          }
        }
      }

      const klines = [];
      for (let i = 0; i < 100; i++) {
        klines.push([i * 3600000, 50000 + i * 10, 50100 + i * 10, 49900 + i * 10, 50050 + i * 10, 1000]);
      }

      engine.loadKlines('BTC/USDT', klines);

      // 加载深度以便订单能成交
      engine.loadDepthSnapshots('BTC/USDT', [{
        timestamp: 0,
        bids: [[49900, 100]],
        asks: [[50100, 100]],
      }]);

      engine.setStrategy(new TestStrategy());
      const result = engine.run();

      expect(result).toBeDefined();
      expect(result.eventsProcessed).toBeGreaterThan(0);
    });
  });

  describe('submitOrder', () => {
    beforeEach(() => {
      class TestStrategy extends BaseStrategy {}
      engine.setStrategy(new TestStrategy());

      engine.loadDepthSnapshots('BTC/USDT', [{
        timestamp: 0,
        bids: [[50000, 100]],
        asks: [[50100, 100]],
      }]);
      engine.loadEvents([{ type: EVENT_TYPE.DEPTH, timestamp: 1, symbol: 'BTC/USDT', data: { bids: [[50000, 100]], asks: [[50100, 100]] } }]);
    });

    it('应该提交订单', () => {
      engine.currentTime = Date.now();
      engine.matchingEngine.updateOrderBook('BTC/USDT', [[50000, 100]], [[50100, 100]], Date.now());

      const order = engine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.MARKET,
        amount: 0.1,
      });

      expect(order).toBeDefined();
      expect(engine.perfStats.ordersSubmitted).toBe(1);
    });
  });

  describe('cancelOrder', () => {
    it('应该取消订单', () => {
      engine.currentTime = Date.now();
      engine.matchingEngine.updateOrderBook('BTC/USDT', [[50000, 100]], [[50100, 100]], Date.now());

      const order = engine.matchingEngine.submitOrder({
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        type: ORDER_TYPE.LIMIT,
        price: 49000,
        amount: 0.1,
      }, Date.now());

      const result = engine.cancelOrder(order.id);
      expect(result).toBe(true);
    });
  });

  describe('reset', () => {
    it('应该重置引擎', () => {
      engine.loadEvents([{ type: EVENT_TYPE.TRADE, timestamp: 1000, symbol: 'BTC/USDT', data: {} }]);
      engine.equityCurve.push({ timestamp: 1000, equity: 10000 });

      engine.reset();

      expect(engine.events.length).toBe(0);
      expect(engine.equityCurve.length).toBe(0);
      expect(engine.account.balance).toBe(10000);
    });
  });

  describe('_calculateResult', () => {
    it('应该计算回测结果', () => {
      engine.equityCurve = [
        { timestamp: 1000, equity: 10000 },
        { timestamp: 2000, equity: 10100 },
        { timestamp: 3000, equity: 10050 },
      ];
      engine.events = [
        { timestamp: 1000 },
        { timestamp: 3000 },
      ];

      const result = engine._calculateResult();

      expect(result.initialCapital).toBe(10000);
      expect(result.finalEquity).toBe(10000);
      expect(result.totalReturn).toBeDefined();
    });
  });
});

// ============================================
// 常量测试
// ============================================

describe('Constants', () => {
  describe('SIDE', () => {
    it('应该定义买卖方向', () => {
      expect(SIDE.BUY).toBe(1);
      expect(SIDE.SELL).toBe(-1);
    });
  });

  describe('ORDER_TYPE', () => {
    it('应该定义订单类型', () => {
      expect(ORDER_TYPE.MARKET).toBe(0);
      expect(ORDER_TYPE.LIMIT).toBe(1);
    });
  });

  describe('ORDER_STATUS', () => {
    it('应该定义订单状态', () => {
      expect(ORDER_STATUS.PENDING).toBe(0);
      expect(ORDER_STATUS.OPEN).toBe(1);
      expect(ORDER_STATUS.FILLED).toBe(2);
      expect(ORDER_STATUS.CANCELED).toBe(4);
    });
  });

  describe('EVENT_TYPE', () => {
    it('应该定义事件类型', () => {
      expect(EVENT_TYPE.TRADE).toBe(0);
      expect(EVENT_TYPE.DEPTH).toBe(1);
      expect(EVENT_TYPE.FUNDING).toBe(2);
      expect(EVENT_TYPE.KLINE).toBe(3);
    });
  });

  describe('POSITION_SIDE', () => {
    it('应该定义持仓方向', () => {
      expect(POSITION_SIDE.NONE).toBe(0);
      expect(POSITION_SIDE.LONG).toBe(1);
      expect(POSITION_SIDE.SHORT).toBe(-1);
    });
  });
});
