/**
 * 策略模块测试
 * Strategies Module Tests
 * @module tests/unit/strategies.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseStrategy } from '../../src/strategies/BaseStrategy.js';
import { SMAStrategy } from '../../src/strategies/SMAStrategy.js';
import { RSIStrategy } from '../../src/strategies/RSIStrategy.js';
import { GridStrategy } from '../../src/strategies/GridStrategy.js';
import { BollingerBandsStrategy } from '../../src/strategies/BollingerBandsStrategy.js';
import { MACDStrategy } from '../../src/strategies/MACDStrategy.js';

// ============================================
// Mock Engine
// ============================================

function createMockEngine() {
  return {
    buy: vi.fn().mockReturnValue({ id: 'order-1', side: 'buy', status: 'filled' }),
    sell: vi.fn().mockReturnValue({ id: 'order-2', side: 'sell', status: 'filled' }),
    buyPercent: vi.fn().mockReturnValue({ id: 'order-3', side: 'buy', status: 'filled' }),
    closePosition: vi.fn().mockReturnValue({ id: 'order-4', side: 'sell', status: 'filled' }),
    getPosition: vi.fn().mockReturnValue(null),
    getCapital: vi.fn().mockReturnValue(10000),
    getEquity: vi.fn().mockReturnValue(10000),
  };
}

// ============================================
// 生成测试K线数据
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
// BaseStrategy 测试
// ============================================

describe('BaseStrategy', () => {
  let strategy;

  beforeEach(() => {
    strategy = new BaseStrategy({ name: 'TestStrategy' });
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认名称', () => {
      const s = new BaseStrategy();
      expect(s.name).toBe('BaseStrategy');
    });

    it('应该使用自定义名称', () => {
      expect(strategy.name).toBe('TestStrategy');
    });

    it('应该初始化状态', () => {
      expect(strategy.state.initialized).toBe(false);
      expect(strategy.state.signal).toBeNull();
      expect(strategy.state.lastSignal).toBeNull();
      expect(strategy.state.data).toEqual({});
    });

    it('应该初始化空指标缓存', () => {
      expect(strategy.indicators).toEqual({});
    });
  });

  describe('onInit', () => {
    it('应该标记为已初始化', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });

    it('应该发射 initialized 事件', async () => {
      const listener = vi.fn();
      strategy.on('initialized', listener);

      await strategy.onInit();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('onTick', () => {
    it('应该抛出未实现错误', async () => {
      await expect(strategy.onTick({}, [])).rejects.toThrow('必须由子类实现');
    });
  });

  describe('onFinish', () => {
    it('应该发射 finished 事件', async () => {
      const listener = vi.fn();
      strategy.on('finished', listener);

      await strategy.onFinish();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('信号方法', () => {
    it('setBuySignal 应该设置买入信号', () => {
      strategy.setBuySignal('Test reason');

      expect(strategy.state.signal.type).toBe('buy');
      expect(strategy.state.signal.reason).toBe('Test reason');
      expect(strategy.state.signal.timestamp).toBeGreaterThan(0);
    });

    it('setSellSignal 应该设置卖出信号', () => {
      strategy.setSellSignal('Test sell');

      expect(strategy.state.signal.type).toBe('sell');
      expect(strategy.state.signal.reason).toBe('Test sell');
    });

    it('设置新信号应该保存上一个信号', () => {
      strategy.setBuySignal('First');
      strategy.setSellSignal('Second');

      expect(strategy.state.lastSignal.type).toBe('buy');
      expect(strategy.state.signal.type).toBe('sell');
    });

    it('clearSignal 应该清除信号', () => {
      strategy.setBuySignal('Test');
      strategy.clearSignal();

      expect(strategy.state.signal).toBeNull();
      expect(strategy.state.lastSignal.type).toBe('buy');
    });

    it('getSignal 应该返回当前信号', () => {
      strategy.setBuySignal('Test');
      expect(strategy.getSignal().type).toBe('buy');
    });

    it('设置信号应该发射 signal 事件', () => {
      const listener = vi.fn();
      strategy.on('signal', listener);

      strategy.setBuySignal('Test');

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'buy',
      }));
    });
  });

  describe('交易方法 (无引擎)', () => {
    it('buy 无引擎应该返回 null', () => {
      expect(strategy.buy('BTC/USDT', 0.1)).toBeNull();
    });

    it('sell 无引擎应该返回 null', () => {
      expect(strategy.sell('BTC/USDT', 0.1)).toBeNull();
    });

    it('buyPercent 无引擎应该返回 null', () => {
      expect(strategy.buyPercent('BTC/USDT', 50)).toBeNull();
    });

    it('closePosition 无引擎应该返回 null', () => {
      expect(strategy.closePosition('BTC/USDT')).toBeNull();
    });

    it('getPosition 无引擎应该返回 null', () => {
      expect(strategy.getPosition('BTC/USDT')).toBeNull();
    });

    it('getCapital 无引擎应该返回 0', () => {
      expect(strategy.getCapital()).toBe(0);
    });

    it('getEquity 无引擎应该返回 0', () => {
      expect(strategy.getEquity()).toBe(0);
    });
  });

  describe('交易方法 (有引擎)', () => {
    let engine;

    beforeEach(() => {
      engine = createMockEngine();
      strategy.engine = engine;
    });

    it('buy 应该调用引擎 buy', () => {
      const result = strategy.buy('BTC/USDT', 0.1);

      expect(engine.buy).toHaveBeenCalledWith('BTC/USDT', 0.1, {});
      expect(result.side).toBe('buy');
    });

    it('sell 应该调用引擎 sell', () => {
      const result = strategy.sell('BTC/USDT', 0.1);

      expect(engine.sell).toHaveBeenCalledWith('BTC/USDT', 0.1, {});
      expect(result.side).toBe('sell');
    });

    it('buyPercent 应该调用引擎 buyPercent', () => {
      strategy.buyPercent('BTC/USDT', 50);
      expect(engine.buyPercent).toHaveBeenCalledWith('BTC/USDT', 50);
    });

    it('closePosition 应该调用引擎 closePosition', () => {
      strategy.closePosition('BTC/USDT');
      expect(engine.closePosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('getPosition 应该调用引擎 getPosition', () => {
      strategy.getPosition('BTC/USDT');
      expect(engine.getPosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('getCapital 应该调用引擎 getCapital', () => {
      const capital = strategy.getCapital();
      expect(engine.getCapital).toHaveBeenCalled();
      expect(capital).toBe(10000);
    });

    it('getEquity 应该调用引擎 getEquity', () => {
      const equity = strategy.getEquity();
      expect(engine.getEquity).toHaveBeenCalled();
      expect(equity).toBe(10000);
    });
  });

  describe('状态管理', () => {
    it('setState 应该设置状态', () => {
      strategy.setState('key', 'value');
      expect(strategy.state.data.key).toBe('value');
    });

    it('getState 应该获取状态', () => {
      strategy.setState('key', 'value');
      expect(strategy.getState('key')).toBe('value');
    });

    it('getState 应该返回默认值', () => {
      expect(strategy.getState('nonexistent', 'default')).toBe('default');
    });
  });

  describe('指标管理', () => {
    it('setIndicator 应该设置指标', () => {
      strategy.setIndicator('sma', 50000);
      expect(strategy.indicators.sma).toBe(50000);
    });

    it('getIndicator 应该获取指标', () => {
      strategy.setIndicator('rsi', 65);
      expect(strategy.getIndicator('rsi')).toBe(65);
    });
  });

  describe('onCandle', () => {
    it('应该将 K 线数据转换并调用 onTick', async () => {
      // 创建一个实现了 onTick 的子类
      class TestImpl extends BaseStrategy {
        async onTick(candle, history) {
          this.lastCandle = candle;
          this.lastHistory = history;
        }
      }

      const impl = new TestImpl();
      await impl.onCandle({
        symbol: 'BTC/USDT',
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 1000,
      });

      expect(impl.lastCandle.close).toBe(50500);
      expect(impl._candleHistory.length).toBe(1);
    });

    it('应该保留最近 200 根 K 线', async () => {
      class TestImpl extends BaseStrategy {
        async onTick() {}
      }

      const impl = new TestImpl();

      for (let i = 0; i < 250; i++) {
        await impl.onCandle({
          open: 50000 + i,
          high: 51000,
          low: 49000,
          close: 50500 + i,
          volume: 1000,
        });
      }

      expect(impl._candleHistory.length).toBe(200);
    });
  });

  describe('事件回调', () => {
    it('onOrderFilled 应该发射 orderFilled 事件', () => {
      const listener = vi.fn();
      strategy.on('orderFilled', listener);

      strategy.onOrderFilled({ id: 'order-1' });

      expect(listener).toHaveBeenCalledWith({ id: 'order-1' });
    });

    it('onOrderCancelled 应该发射 orderCancelled 事件', () => {
      const listener = vi.fn();
      strategy.on('orderCancelled', listener);

      strategy.onOrderCancelled({ id: 'order-1' });

      expect(listener).toHaveBeenCalledWith({ id: 'order-1' });
    });

    it('onError 应该发射 error 事件', () => {
      const listener = vi.fn();
      strategy.on('error', listener);

      strategy.onError(new Error('test error'));

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('onTicker', () => {
    it('应该存在 onTicker 方法', async () => {
      // 默认实现不做任何事
      await strategy.onTicker({ symbol: 'BTC/USDT', last: 50000 });
    });
  });

  describe('onFundingRate', () => {
    it('应该存在 onFundingRate 方法', async () => {
      // 默认实现不做任何事
      await strategy.onFundingRate({ symbol: 'BTC/USDT', rate: 0.0001 });
    });
  });
});

// ============================================
// SMAStrategy 测试
// ============================================

describe('SMAStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new SMAStrategy({
      shortPeriod: 5,
      longPeriod: 10,
      symbol: 'BTC/USDT',
      positionPercent: 90,
    });
    engine = createMockEngine();
    strategy.engine = engine;
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new SMAStrategy();
      expect(s.shortPeriod).toBe(10);
      expect(s.longPeriod).toBe(30);
      expect(s.symbol).toBe('BTC/USDT');
      expect(s.positionPercent).toBe(95);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.shortPeriod).toBe(5);
      expect(strategy.longPeriod).toBe(10);
      expect(strategy.positionPercent).toBe(90);
    });

    it('应该设置策略名称', () => {
      expect(strategy.name).toBe('SMAStrategy');
    });
  });

  describe('onInit', () => {
    it('应该初始化成功', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  describe('_calculateSMA', () => {
    it('应该正确计算 SMA', () => {
      const data = [10, 20, 30, 40, 50];
      const sma = strategy._calculateSMA(data, 5);
      expect(sma).toBe(30); // (10+20+30+40+50)/5 = 30
    });

    it('应该使用最近的数据', () => {
      const data = [5, 10, 20, 30, 40, 50];
      const sma = strategy._calculateSMA(data, 3);
      expect(sma).toBe(40); // (30+40+50)/3 = 40
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const candles = generateCandles(5);
      await strategy.onTick(candles[4], candles);

      // 不应该有交易
      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('第一次运行应该只保存均线值', async () => {
      const candles = generateCandles(15);
      await strategy.onTick(candles[14], candles);

      expect(strategy.prevShortMA).not.toBeNull();
      expect(strategy.prevLongMA).not.toBeNull();
      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('金叉时应该买入', async () => {
      // 模拟金叉: 短期均线上穿长期均线
      strategy.prevShortMA = 49000;
      strategy.prevLongMA = 50000;

      // 创建历史数据使得当前短期均线 > 长期均线
      const candles = [];
      for (let i = 0; i < 15; i++) {
        candles.push({
          timestamp: Date.now() - (15 - i) * 3600000,
          open: 50000 + i * 100,
          high: 51000 + i * 100,
          low: 49000 + i * 100,
          close: 50500 + i * 100, // 上涨趋势
          volume: 1000,
        });
      }

      await strategy.onTick(candles[14], candles);

      expect(engine.buyPercent).toHaveBeenCalledWith('BTC/USDT', 90);
    });

    it('死叉时有持仓应该卖出', async () => {
      // 设置有持仓
      engine.getPosition.mockReturnValue({ amount: 0.1 });

      // 模拟死叉: 短期均线下穿长期均线
      strategy.prevShortMA = 51000;
      strategy.prevLongMA = 50000;

      // 创建历史数据使得当前短期均线 < 长期均线
      const candles = [];
      for (let i = 0; i < 15; i++) {
        candles.push({
          timestamp: Date.now() - (15 - i) * 3600000,
          open: 52000 - i * 100,
          high: 53000 - i * 100,
          low: 51000 - i * 100,
          close: 51500 - i * 100, // 下跌趋势
          volume: 1000,
        });
      }

      await strategy.onTick(candles[14], candles);

      expect(engine.closePosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('应该保存指标值', async () => {
      const candles = generateCandles(15);

      // 先运行一次初始化
      await strategy.onTick(candles[13], candles.slice(0, 14));
      // 再运行一次
      await strategy.onTick(candles[14], candles);

      expect(strategy.getIndicator('shortMA')).toBeDefined();
      expect(strategy.getIndicator('longMA')).toBeDefined();
    });
  });
});

// ============================================
// RSIStrategy 测试
// ============================================

describe('RSIStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new RSIStrategy({
      period: 14,
      overbought: 70,
      oversold: 30,
      symbol: 'BTC/USDT',
      positionPercent: 90,
    });
    engine = createMockEngine();
    strategy.engine = engine;
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new RSIStrategy();
      expect(s.period).toBe(14);
      expect(s.overbought).toBe(70);
      expect(s.oversold).toBe(30);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.period).toBe(14);
      expect(strategy.overbought).toBe(70);
      expect(strategy.oversold).toBe(30);
    });

    it('应该设置策略名称', () => {
      expect(strategy.name).toBe('RSIStrategy');
    });

    it('应该初始化 rsiValues 数组', () => {
      expect(strategy.rsiValues).toEqual([]);
    });
  });

  describe('_calculateRSI', () => {
    it('数据不足应该返回 null', () => {
      const rsi = strategy._calculateRSI([100, 101, 102]);
      expect(rsi).toBeNull();
    });

    it('应该正确计算 RSI', () => {
      // 生成上涨数据
      const closes = [];
      for (let i = 0; i < 20; i++) {
        closes.push(100 + i);
      }

      const rsi = strategy._calculateRSI(closes);

      // 持续上涨应该有较高 RSI
      expect(rsi).toBeGreaterThan(50);
    });

    it('全部上涨应该返回 100', () => {
      const closes = [];
      for (let i = 0; i < 20; i++) {
        closes.push(100 + i * 10); // 持续上涨
      }

      const rsi = strategy._calculateRSI(closes);
      expect(rsi).toBe(100);
    });

    it('全部下跌应该返回接近 0', () => {
      const closes = [];
      for (let i = 0; i < 20; i++) {
        closes.push(200 - i * 10); // 持续下跌
      }

      const rsi = strategy._calculateRSI(closes);
      expect(rsi).toBeLessThan(10);
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const candles = generateCandles(10);
      await strategy.onTick(candles[9], candles);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('应该保存 RSI 指标值', async () => {
      const candles = generateCandles(20);
      await strategy.onTick(candles[19], candles);

      expect(strategy.getIndicator('rsi')).toBeDefined();
      expect(strategy.rsiValues.length).toBe(1);
    });

    it('RSI 超卖时应该买入', async () => {
      // 创建下跌数据使 RSI 低于 30
      const candles = [];
      for (let i = 0; i < 20; i++) {
        const price = 50000 - i * 500; // 持续下跌
        candles.push({
          timestamp: Date.now() - (20 - i) * 3600000,
          open: price + 100,
          high: price + 200,
          low: price - 100,
          close: price,
          volume: 1000,
        });
      }

      // 先运行一次建立历史
      await strategy.onTick(candles[18], candles.slice(0, 19));
      // 再运行一次触发交易
      await strategy.onTick(candles[19], candles);

      expect(engine.buyPercent).toHaveBeenCalledWith('BTC/USDT', 90);
    });

    it('RSI 超买时有持仓应该卖出', async () => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });

      // 创建上涨数据使 RSI 高于 70
      const candles = [];
      for (let i = 0; i < 20; i++) {
        const price = 40000 + i * 500; // 持续上涨
        candles.push({
          timestamp: Date.now() - (20 - i) * 3600000,
          open: price - 100,
          high: price + 100,
          low: price - 200,
          close: price,
          volume: 1000,
        });
      }

      // 先运行一次建立历史
      await strategy.onTick(candles[18], candles.slice(0, 19));
      // 再运行一次触发交易
      await strategy.onTick(candles[19], candles);

      expect(engine.closePosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('第一次运行后没有上一个 RSI 应该跳过', async () => {
      const candles = generateCandles(20);
      await strategy.onTick(candles[19], candles);

      // 没有上一个 RSI 值，不应该触发交易
      expect(engine.buyPercent).not.toHaveBeenCalled();
    });
  });
});

// ============================================
// GridStrategy 测试
// ============================================

describe('GridStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new GridStrategy({
      upperPrice: 55000,
      lowerPrice: 45000,
      gridCount: 10,
      symbol: 'BTC/USDT',
      amountPerGrid: 100,
    });
    engine = createMockEngine();
    strategy.engine = engine;
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new GridStrategy();
      expect(s.upperPrice).toBe(50000);
      expect(s.lowerPrice).toBe(30000);
      expect(s.gridCount).toBe(10);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.upperPrice).toBe(55000);
      expect(strategy.lowerPrice).toBe(45000);
      expect(strategy.gridCount).toBe(10);
    });

    it('应该初始化网格数组', () => {
      expect(strategy.grids.length).toBe(11); // gridCount + 1
    });

    it('应该正确设置网格价格', () => {
      const spacing = (55000 - 45000) / 10; // 1000
      expect(strategy.grids[0].price).toBe(45000);
      expect(strategy.grids[1].price).toBe(46000);
      expect(strategy.grids[10].price).toBe(55000);
    });

    it('应该初始化网格状态', () => {
      const grid = strategy.grids[5];
      expect(grid.buyTriggered).toBe(false);
      expect(grid.sellTriggered).toBe(false);
      expect(grid.position).toBe(0);
    });
  });

  describe('onInit', () => {
    it('应该初始化成功', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  describe('onTick', () => {
    it('价格超出上限应该跳过', async () => {
      const candle = { close: 60000 }; // 超出上限
      await strategy.onTick(candle, []);

      expect(engine.buy).not.toHaveBeenCalled();
    });

    it('价格超出下限应该跳过', async () => {
      const candle = { close: 40000 }; // 超出下限
      await strategy.onTick(candle, []);

      expect(engine.buy).not.toHaveBeenCalled();
    });

    it('价格在范围内应该处理网格', async () => {
      const candle = { close: 50000 };
      await strategy.onTick(candle, []);

      // 应该正常运行，不抛错
    });

    it('价格下穿网格应该触发买入', async () => {
      // 价格从高于网格下穿到低于网格
      const grid = strategy.grids[5]; // 第5个网格, 价格 50000
      const candle = { close: grid.price - 10 };

      await strategy.onTick(candle, []);

      expect(engine.buy).toHaveBeenCalled();
      expect(grid.buyTriggered).toBe(true);
    });

    it('已买入的网格价格上穿应该触发卖出', async () => {
      // 先买入
      const grid = strategy.grids[5];
      grid.buyTriggered = true;
      grid.position = 0.002;

      // 价格上涨到下一个网格
      const nextGrid = strategy.grids[6];
      const candle = { close: nextGrid.price + 10 };

      await strategy.onTick(candle, []);

      expect(engine.sell).toHaveBeenCalled();
      expect(grid.buyTriggered).toBe(false);
      expect(grid.position).toBe(0);
    });

    it('不应该处理最高和最低网格', async () => {
      const lowestGrid = strategy.grids[0];
      const highestGrid = strategy.grids[10];

      // 价格在最低网格
      await strategy.onTick({ close: lowestGrid.price - 10 }, []);

      // 最低网格不应该被触发
      expect(lowestGrid.buyTriggered).toBe(false);
    });
  });

  describe('getGridStatus', () => {
    it('应该返回网格状态', () => {
      const status = strategy.getGridStatus();

      expect(status.length).toBe(11);
      expect(status[0]).toHaveProperty('id');
      expect(status[0]).toHaveProperty('price');
      expect(status[0]).toHaveProperty('buyTriggered');
      expect(status[0]).toHaveProperty('sellTriggered');
      expect(status[0]).toHaveProperty('position');
    });
  });

  describe('adjustGridRange', () => {
    it('应该调整网格范围', () => {
      strategy.adjustGridRange(60000, 40000);

      expect(strategy.upperPrice).toBe(60000);
      expect(strategy.lowerPrice).toBe(40000);
      expect(strategy.grids[0].price).toBe(40000);
      expect(strategy.grids[10].price).toBe(60000);
    });

    it('应该重置网格状态', () => {
      // 先触发一些网格
      strategy.grids[5].buyTriggered = true;

      strategy.adjustGridRange(60000, 40000);

      // 所有网格应该重置
      expect(strategy.grids[5].buyTriggered).toBe(false);
    });
  });

  describe('_saveGridState', () => {
    it('应该保存活跃网格数和总持仓', () => {
      strategy.grids[3].position = 0.001;
      strategy.grids[5].position = 0.002;

      strategy._saveGridState();

      expect(strategy.getState('activeGrids')).toBe(2);
      expect(strategy.getState('totalPosition')).toBeCloseTo(0.003, 6);
    });

    it('应该设置指标', () => {
      strategy.grids[3].position = 0.001;
      strategy._saveGridState();

      expect(strategy.getIndicator('activeGrids')).toBe(1);
    });
  });

  describe('_initializeGrids', () => {
    it('应该正确初始化所有网格', () => {
      const s = new GridStrategy({
        upperPrice: 60000,
        lowerPrice: 50000,
        gridCount: 5,
      });

      expect(s.grids.length).toBe(6);
      expect(s.grids[0].price).toBe(50000);
      expect(s.grids[1].price).toBe(52000);
      expect(s.grids[2].price).toBe(54000);
      expect(s.grids[3].price).toBe(56000);
      expect(s.grids[4].price).toBe(58000);
      expect(s.grids[5].price).toBe(60000);
    });
  });
});

// ============================================
// BollingerBandsStrategy 测试
// ============================================

describe('BollingerBandsStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new BollingerBandsStrategy({
      period: 5,
      stdDev: 2,
      symbol: 'BTC/USDT',
      positionPercent: 90,
      useTrendFilter: false,
    });
    engine = createMockEngine();
    strategy.engine = engine;
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new BollingerBandsStrategy();
      expect(s.period).toBe(20);
      expect(s.stdDev).toBe(2);
      expect(s.symbol).toBe('BTC/USDT');
      expect(s.positionPercent).toBe(95);
      expect(s.useTrendFilter).toBe(true);
      expect(s.trendPeriod).toBe(50);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.period).toBe(5);
      expect(strategy.stdDev).toBe(2);
      expect(strategy.positionPercent).toBe(90);
      expect(strategy.useTrendFilter).toBe(false);
    });

    it('应该设置策略名称', () => {
      expect(strategy.name).toBe('BollingerBandsStrategy');
    });
  });

  describe('onInit', () => {
    it('应该初始化成功', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  describe('_calculateBollingerBands', () => {
    it('应该正确计算布林带', () => {
      const closes = [100, 102, 98, 101, 100];
      const bb = strategy._calculateBollingerBands(closes);

      expect(bb.middle).toBeCloseTo(100.2, 1); // SMA
      expect(bb.upper).toBeGreaterThan(bb.middle);
      expect(bb.lower).toBeLessThan(bb.middle);
      expect(bb.std).toBeGreaterThan(0);
      expect(bb.bandwidth).toBeGreaterThan(0);
    });

    it('上轨应该等于中轨加标准差乘数', () => {
      const closes = [100, 100, 100, 100, 100];
      const bb = strategy._calculateBollingerBands(closes);

      // 标准差为0时，上下轨等于中轨
      expect(bb.upper).toBe(bb.middle);
      expect(bb.lower).toBe(bb.middle);
    });

    it('应该计算带宽百分比', () => {
      const closes = [100, 105, 95, 100, 100];
      const bb = strategy._calculateBollingerBands(closes);

      const expectedBandwidth = ((bb.upper - bb.lower) / bb.middle) * 100;
      expect(bb.bandwidth).toBeCloseTo(expectedBandwidth, 4);
    });
  });

  describe('_calculateSMA', () => {
    it('应该正确计算SMA', () => {
      const data = [10, 20, 30, 40, 50];
      const sma = strategy._calculateSMA(data, 5);
      expect(sma).toBe(30); // (10+20+30+40+50)/5
    });

    it('应该使用最近的数据', () => {
      const data = [5, 10, 20, 30, 40, 50];
      const sma = strategy._calculateSMA(data, 3);
      expect(sma).toBe(40); // (30+40+50)/3
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const candles = generateCandles(3);
      await strategy.onTick(candles[2], candles);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('应该保存布林带指标值', async () => {
      const candles = generateCandles(10);
      await strategy.onTick(candles[9], candles);

      expect(strategy.getIndicator('upperBand')).toBeDefined();
      expect(strategy.getIndicator('middleBand')).toBeDefined();
      expect(strategy.getIndicator('lowerBand')).toBeDefined();
      expect(strategy.getIndicator('bandwidth')).toBeDefined();
      expect(strategy.getIndicator('percentB')).toBeDefined();
    });

    it('价格触及下轨时应该买入', async () => {
      // 创建完全相同的数据，然后最后一根K线极端下跌
      const candles = [];
      // 先创建完全相同的稳定数据（标准差为0）
      for (let i = 0; i < 9; i++) {
        candles.push({
          timestamp: Date.now() - (10 - i) * 3600000,
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000, // 完全相同的收盘价
          volume: 1000,
        });
      }
      // 最后一根K线大幅下跌，明确触及下轨
      candles.push({
        timestamp: Date.now(),
        open: 50000,
        high: 50000,
        low: 40000,
        close: 40000, // 远低于均线
        volume: 1000,
      });

      await strategy.onTick(candles[9], candles);

      expect(engine.buyPercent).toHaveBeenCalledWith('BTC/USDT', 90);
    });

    it('价格触及上轨时有持仓应该卖出', async () => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });

      // 创建完全相同的数据，然后最后一根K线极端上涨
      const candles = [];
      // 先创建完全相同的稳定数据（标准差为0）
      for (let i = 0; i < 9; i++) {
        candles.push({
          timestamp: Date.now() - (10 - i) * 3600000,
          open: 50000,
          high: 50000,
          low: 50000,
          close: 50000, // 完全相同的收盘价
          volume: 1000,
        });
      }
      // 最后一根K线大幅上涨，明确触及上轨
      candles.push({
        timestamp: Date.now(),
        open: 50000,
        high: 60000,
        low: 50000,
        close: 60000, // 远高于均线
        volume: 1000,
      });

      await strategy.onTick(candles[9], candles);

      expect(engine.closePosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('无持仓且价格触及上轨不应该交易', async () => {
      const candles = [];
      for (let i = 0; i < 10; i++) {
        const price = 50000 + i * 200;
        candles.push({
          timestamp: Date.now() - (10 - i) * 3600000,
          open: price - 50,
          high: price + 100,
          low: price - 100,
          close: price,
          volume: 1000,
        });
      }
      candles[9].close = candles[9].close + 1000;

      await strategy.onTick(candles[9], candles);

      expect(engine.closePosition).not.toHaveBeenCalled();
      expect(engine.buyPercent).not.toHaveBeenCalled();
    });
  });

  describe('趋势过滤', () => {
    it('启用趋势过滤时应该计算趋势均线', async () => {
      const trendStrategy = new BollingerBandsStrategy({
        period: 5,
        stdDev: 2,
        useTrendFilter: true,
        trendPeriod: 10,
      });
      trendStrategy.engine = engine;

      const candles = generateCandles(15);
      await trendStrategy.onTick(candles[14], candles);

      expect(trendStrategy.getIndicator('trendMA')).toBeDefined();
    });

    it('趋势过滤需要更多数据', async () => {
      const trendStrategy = new BollingerBandsStrategy({
        period: 5,
        stdDev: 2,
        useTrendFilter: true,
        trendPeriod: 20,
      });
      trendStrategy.engine = engine;

      // 只有15根K线，趋势周期需要20根
      const candles = generateCandles(15);
      await trendStrategy.onTick(candles[14], candles);

      // 数据不足，不应该交易
      expect(engine.buyPercent).not.toHaveBeenCalled();
    });
  });
});

// ============================================
// MACDStrategy 测试
// ============================================

describe('MACDStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new MACDStrategy({
      fastPeriod: 5,
      slowPeriod: 10,
      signalPeriod: 3,
      symbol: 'BTC/USDT',
      positionPercent: 90,
    });
    engine = createMockEngine();
    strategy.engine = engine;
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new MACDStrategy();
      expect(s.fastPeriod).toBe(12);
      expect(s.slowPeriod).toBe(26);
      expect(s.signalPeriod).toBe(9);
      expect(s.symbol).toBe('BTC/USDT');
      expect(s.positionPercent).toBe(95);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.fastPeriod).toBe(5);
      expect(strategy.slowPeriod).toBe(10);
      expect(strategy.signalPeriod).toBe(3);
      expect(strategy.positionPercent).toBe(90);
    });

    it('应该设置策略名称', () => {
      expect(strategy.name).toBe('MACDStrategy');
    });

    it('应该初始化 EMA 缓存为 null', () => {
      expect(strategy.fastEMA).toBeNull();
      expect(strategy.slowEMA).toBeNull();
      expect(strategy.signalEMA).toBeNull();
    });

    it('应该初始化空的 MACD 历史', () => {
      expect(strategy.macdHistory).toEqual([]);
    });

    it('应该初始化 prevHistogram 为 null', () => {
      expect(strategy.prevHistogram).toBeNull();
    });
  });

  describe('onInit', () => {
    it('应该初始化成功', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  describe('_calculateEMA', () => {
    it('应该正确计算 EMA', () => {
      const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const ema = strategy._calculateEMA(data, 5);

      expect(ema).toBeGreaterThan(0);
      expect(typeof ema).toBe('number');
    });

    it('数据不足时应该返回 null', () => {
      const data = [10, 11, 12];
      const ema = strategy._calculateEMA(data, 5);

      expect(ema).toBeNull();
    });

    it('EMA 应该对近期数据更敏感', () => {
      const data = [10, 10, 10, 10, 10, 20, 20, 20];
      const ema = strategy._calculateEMA(data, 5);

      // EMA 应该更接近最近的价格
      expect(ema).toBeGreaterThan(10);
      expect(ema).toBeLessThan(20);
    });
  });

  describe('_calculateMACD', () => {
    it('应该正确计算 MACD', () => {
      // 需要足够的数据
      const closes = Array.from({ length: 20 }, (_, i) => 100 + i);

      const macd = strategy._calculateMACD(closes);

      // 第一次可能返回null因为信号线需要积累
      // 继续计算几次
      strategy._calculateMACD(closes);
      strategy._calculateMACD(closes);
      const result = strategy._calculateMACD(closes);

      expect(result).not.toBeNull();
      expect(result.macd).toBeDefined();
      expect(result.signal).toBeDefined();
      expect(result.histogram).toBeDefined();
    });

    it('MACD 历史不足时应该返回 null', () => {
      const closes = Array.from({ length: 15 }, (_, i) => 100 + i);
      strategy.macdHistory = [];

      const macd = strategy._calculateMACD(closes);

      expect(macd).toBeNull();
    });

    it('应该累积 MACD 历史', () => {
      const closes = Array.from({ length: 15 }, (_, i) => 100 + i);
      strategy.macdHistory = [];

      strategy._calculateMACD(closes);

      expect(strategy.macdHistory.length).toBe(1);
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const candles = generateCandles(5);
      await strategy.onTick(candles[4], candles);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('第一次运行应该保存 prevHistogram', async () => {
      const candles = generateCandles(20);

      // 多次运行以积累 MACD 历史
      for (let i = 13; i < 20; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      expect(strategy.prevHistogram).not.toBeNull();
    });

    it('应该保存 MACD 指标值', async () => {
      const candles = generateCandles(25);

      // 运行多次以积累历史
      for (let i = 13; i < 25; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      expect(strategy.getIndicator('macd')).toBeDefined();
      expect(strategy.getIndicator('signal')).toBeDefined();
      expect(strategy.getIndicator('histogram')).toBeDefined();
    });

    it('金叉时应该买入', async () => {
      // 设置上一个柱状图为负数
      strategy.prevHistogram = -0.5;

      // 创建数据使当前柱状图为正
      const candles = generateTrendingCandles(25, 40000, 'up');

      // 运行多次积累历史
      for (let i = 13; i < 24; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      // 设置柱状图条件并触发
      strategy.prevHistogram = -0.1;
      strategy.macdHistory = Array.from({ length: 10 }, (_, i) => i * 0.1);

      await strategy.onTick(candles[24], candles);

      // 检查是否触发买入（取决于数据是否满足条件）
      expect(engine.buyPercent).toHaveBeenCalled();
    });

    it('死叉时有持仓应该卖出', async () => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });

      // 设置上一个柱状图为正数
      strategy.prevHistogram = 0.5;

      // 创建下跌数据使当前柱状图为负
      const candles = generateTrendingCandles(25, 50000, 'down');

      // 运行多次积累历史
      for (let i = 13; i < 24; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      // 设置柱状图条件并触发
      strategy.prevHistogram = 0.1;
      strategy.macdHistory = Array.from({ length: 10 }, (_, i) => -i * 0.1);

      await strategy.onTick(candles[24], candles);

      expect(engine.closePosition).toHaveBeenCalled();
    });

    it('无持仓时死叉不应该交易', async () => {
      strategy.prevHistogram = 0.5;

      const candles = generateTrendingCandles(25, 50000, 'down');

      for (let i = 13; i < 24; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      strategy.prevHistogram = 0.1;
      strategy.macdHistory = Array.from({ length: 10 }, (_, i) => -i * 0.1);

      await strategy.onTick(candles[24], candles);

      expect(engine.closePosition).not.toHaveBeenCalled();
    });
  });
});

// ============================================
// 策略集成测试
// ============================================

describe('策略集成测试', () => {
  it('应该能够同时运行多个策略', async () => {
    const engine = createMockEngine();

    const smaStrategy = new SMAStrategy({ shortPeriod: 5, longPeriod: 10 });
    const rsiStrategy = new RSIStrategy({ period: 14 });

    smaStrategy.engine = engine;
    rsiStrategy.engine = engine;

    const candles = generateCandles(30);

    for (const candle of candles) {
      await smaStrategy.onCandle(candle);
      await rsiStrategy.onCandle(candle);
    }

    // 两个策略都应该正常运行，不抛错
  });

  it('策略应该正确继承 BaseStrategy', () => {
    const sma = new SMAStrategy();
    const rsi = new RSIStrategy();
    const grid = new GridStrategy();

    expect(sma instanceof BaseStrategy).toBe(true);
    expect(rsi instanceof BaseStrategy).toBe(true);
    expect(grid instanceof BaseStrategy).toBe(true);
  });
});
