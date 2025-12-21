/**
 * 真实策略模块测试
 * Real Strategies Module Tests
 * @module tests/unit/strategiesReal.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseStrategy } from '../../src/strategies/BaseStrategy.js';
import { SMAStrategy } from '../../src/strategies/SMAStrategy.js';
import { RSIStrategy } from '../../src/strategies/RSIStrategy.js';
import { MACDStrategy } from '../../src/strategies/MACDStrategy.js';
import { GridStrategy } from '../../src/strategies/GridStrategy.js';
import { BollingerBandsStrategy } from '../../src/strategies/BollingerBandsStrategy.js';

// ============================================
// Mock Engine
// ============================================

function createMockEngine() {
  const positions = new Map();
  let capital = 10000;

  return {
    buy: vi.fn().mockImplementation((symbol, amount) => {
      positions.set(symbol, { amount, avgPrice: 50000 });
      return { success: true };
    }),
    sell: vi.fn().mockImplementation((symbol, amount) => {
      positions.delete(symbol);
      return { success: true };
    }),
    buyPercent: vi.fn().mockImplementation((symbol, percent) => {
      const amount = (capital * percent / 100) / 50000;
      positions.set(symbol, { amount, avgPrice: 50000 });
      return { success: true };
    }),
    closePosition: vi.fn().mockImplementation((symbol) => {
      positions.delete(symbol);
      return { success: true };
    }),
    getPosition: vi.fn().mockImplementation((symbol) => {
      return positions.get(symbol) || null;
    }),
    getCapital: vi.fn().mockReturnValue(capital),
    getEquity: vi.fn().mockReturnValue(capital),
  };
}

// ============================================
// 辅助函数
// ============================================

function generateHistory(count, startPrice = 50000, volatility = 100) {
  const history = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * volatility;
    price += change;

    history.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + volatility / 2,
      low: price - volatility / 2,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return history;
}

function generateTrendHistory(count, startPrice, trend = 'up') {
  const history = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const base = trend === 'up' ? 50 : -50;
    const change = base + (Math.random() - 0.5) * 30;
    price += change;

    history.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - 25,
      high: price + 50,
      low: price - 50,
      close: price,
      volume: 1000,
    });
  }

  return history;
}

function generateCrossHistory(type = 'golden', count = 50) {
  const history = [];
  let price = 50000;

  for (let i = 0; i < count; i++) {
    if (type === 'golden') {
      // 前半段下跌，后半段上涨
      if (i < count * 0.6) {
        price -= 30 + Math.random() * 20;
      } else {
        price += 80 + Math.random() * 40;
      }
    } else {
      // 前半段上涨，后半段下跌
      if (i < count * 0.6) {
        price += 30 + Math.random() * 20;
      } else {
        price -= 80 + Math.random() * 40;
      }
    }

    history.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - 20,
      high: price + 40,
      low: price - 40,
      close: price,
      volume: 1000,
    });
  }

  return history;
}

// ============================================
// BaseStrategy 测试
// ============================================

describe('BaseStrategy (Real)', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new BaseStrategy({ name: 'TestStrategy' });
    mockEngine = createMockEngine();
    strategy.engine = mockEngine;
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
    });
  });

  describe('onInit', () => {
    it('应该将 initialized 设置为 true', async () => {
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
    it('应该抛出错误（抽象方法）', async () => {
      await expect(strategy.onTick({}, [])).rejects.toThrow('must be implemented');
    });
  });

  describe('onCandle', () => {
    it('应该正确处理 K 线数据', async () => {
      // 创建一个实现了 onTick 的策略
      strategy.onTick = vi.fn().mockResolvedValue(undefined);

      await strategy.onCandle({
        symbol: 'BTC/USDT',
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 1000,
      });

      expect(strategy.onTick).toHaveBeenCalled();
      expect(strategy._candleHistory.length).toBe(1);
    });

    it('应该限制历史长度为 200', async () => {
      strategy.onTick = vi.fn().mockResolvedValue(undefined);

      for (let i = 0; i < 250; i++) {
        await strategy.onCandle({
          symbol: 'BTC/USDT',
          open: 50000 + i,
          high: 51000 + i,
          low: 49000 + i,
          close: 50500 + i,
          volume: 1000,
        });
      }

      expect(strategy._candleHistory.length).toBe(200);
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
      const listener = vi.fn();
      strategy.on('signal', listener);

      strategy.setBuySignal('test reason');

      expect(strategy.state.signal.type).toBe('buy');
      expect(strategy.state.signal.reason).toBe('test reason');
      expect(listener).toHaveBeenCalled();
    });

    it('setSellSignal 应该设置卖出信号', () => {
      strategy.setSellSignal('sell reason');
      expect(strategy.state.signal.type).toBe('sell');
    });

    it('clearSignal 应该清除信号', () => {
      strategy.setBuySignal('test');
      strategy.clearSignal();
      expect(strategy.getSignal()).toBeNull();
      expect(strategy.state.lastSignal.type).toBe('buy');
    });
  });

  describe('交易方法', () => {
    it('buy 应该调用 engine.buy', () => {
      strategy.buy('BTC/USDT', 0.1);
      expect(mockEngine.buy).toHaveBeenCalledWith('BTC/USDT', 0.1, {});
    });

    it('sell 应该调用 engine.sell', () => {
      strategy.sell('BTC/USDT', 0.1);
      expect(mockEngine.sell).toHaveBeenCalledWith('BTC/USDT', 0.1, {});
    });

    it('buyPercent 应该调用 engine.buyPercent', () => {
      strategy.buyPercent('BTC/USDT', 10);
      expect(mockEngine.buyPercent).toHaveBeenCalledWith('BTC/USDT', 10);
    });

    it('closePosition 应该调用 engine.closePosition', () => {
      strategy.closePosition('BTC/USDT');
      expect(mockEngine.closePosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('没有 engine 时应该返回 null', () => {
      strategy.engine = null;
      expect(strategy.buy('BTC/USDT', 0.1)).toBeNull();
      expect(strategy.sell('BTC/USDT', 0.1)).toBeNull();
      expect(strategy.buyPercent('BTC/USDT', 10)).toBeNull();
      expect(strategy.closePosition('BTC/USDT')).toBeNull();
    });

    it('getPosition 应该调用 engine.getPosition', () => {
      strategy.getPosition('BTC/USDT');
      expect(mockEngine.getPosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('getCapital 应该调用 engine.getCapital', () => {
      const capital = strategy.getCapital();
      expect(capital).toBe(10000);
    });

    it('getEquity 应该调用 engine.getEquity', () => {
      const equity = strategy.getEquity();
      expect(equity).toBe(10000);
    });
  });

  describe('状态和指标', () => {
    it('setState/getState 应该正确工作', () => {
      strategy.setState('key1', 'value1');
      expect(strategy.getState('key1')).toBe('value1');
      expect(strategy.getState('nonexistent', 'default')).toBe('default');
    });

    it('setIndicator/getIndicator 应该正确工作', () => {
      strategy.setIndicator('sma', 50000);
      expect(strategy.getIndicator('sma')).toBe(50000);
    });
  });

  describe('回调方法', () => {
    it('onOrderFilled 应该发射事件', () => {
      const listener = vi.fn();
      strategy.on('orderFilled', listener);
      strategy.onOrderFilled({ id: '123' });
      expect(listener).toHaveBeenCalledWith({ id: '123' });
    });

    it('onOrderCancelled 应该发射事件', () => {
      const listener = vi.fn();
      strategy.on('orderCancelled', listener);
      strategy.onOrderCancelled({ id: '123' });
      expect(listener).toHaveBeenCalledWith({ id: '123' });
    });

    it('onError 应该发射错误事件', () => {
      const listener = vi.fn();
      strategy.on('error', listener);
      const error = new Error('test error');
      strategy.onError(error);
      expect(listener).toHaveBeenCalledWith(error);
    });
  });

  describe('日志方法', () => {
    it('log 应该不抛出错误', () => {
      expect(() => strategy.log('test message')).not.toThrow();
      expect(() => strategy.log('error message', 'error')).not.toThrow();
      expect(() => strategy.log('warn message', 'warn')).not.toThrow();
      expect(() => strategy.log('debug message', 'debug')).not.toThrow();
    });
  });
});

// ============================================
// SMAStrategy 测试
// ============================================

describe('SMAStrategy (Real)', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new SMAStrategy({
      shortPeriod: 5,
      longPeriod: 10,
      symbol: 'BTC/USDT',
      positionPercent: 50,
    });
    mockEngine = createMockEngine();
    strategy.engine = mockEngine;
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new SMAStrategy();
      expect(s.shortPeriod).toBe(10);
      expect(s.longPeriod).toBe(30);
      expect(s.symbol).toBe('BTC/USDT');
    });

    it('应该使用自定义参数', () => {
      expect(strategy.shortPeriod).toBe(5);
      expect(strategy.longPeriod).toBe(10);
      expect(strategy.positionPercent).toBe(50);
    });
  });

  describe('onInit', () => {
    it('应该调用父类 onInit', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  describe('_calculateSMA', () => {
    it('应该正确计算 SMA', () => {
      const data = [10, 20, 30, 40, 50];
      const sma = strategy._calculateSMA(data, 5);
      expect(sma).toBe(30);
    });

    it('应该只使用最后 N 个数据', () => {
      const data = [100, 10, 20, 30, 40, 50];
      const sma = strategy._calculateSMA(data, 5);
      expect(sma).toBe(30);
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const history = generateHistory(5);
      await strategy.onTick(history[4], history);
      expect(strategy.getIndicator('shortMA')).toBeUndefined();
    });

    it('第一次运行时应该只保存均线值', async () => {
      const history = generateHistory(15);
      await strategy.onTick(history[14], history);

      expect(strategy.prevShortMA).not.toBeNull();
      expect(strategy.prevLongMA).not.toBeNull();
      expect(mockEngine.buyPercent).not.toHaveBeenCalled();
    });

    it('金叉时应该买入', async () => {
      const history = generateCrossHistory('golden', 50);

      // 逐个处理 K 线
      for (let i = 0; i < history.length; i++) {
        const candle = history[i];
        const historySlice = history.slice(0, i + 1);
        await strategy.onTick(candle, historySlice);
      }

      // 应该触发了买入
      expect(mockEngine.buyPercent).toHaveBeenCalled();
    });

    it('死叉时有持仓应该卖出', async () => {
      // 模拟有持仓
      mockEngine.getPosition.mockReturnValue({ amount: 0.1 });

      const history = generateCrossHistory('death', 50);

      for (let i = 0; i < history.length; i++) {
        const candle = history[i];
        const historySlice = history.slice(0, i + 1);
        await strategy.onTick(candle, historySlice);
      }

      // 应该触发了卖出
      expect(mockEngine.closePosition).toHaveBeenCalled();
    });
  });
});

// ============================================
// RSIStrategy 测试
// ============================================

describe('RSIStrategy (Real)', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new RSIStrategy({
      period: 14,
      overbought: 70,
      oversold: 30,
      symbol: 'BTC/USDT',
    });
    mockEngine = createMockEngine();
    strategy.engine = mockEngine;
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new RSIStrategy();
      expect(s.period).toBe(14);
      expect(s.overbought).toBe(70);
      expect(s.oversold).toBe(30);
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const history = generateHistory(10);
      await strategy.onTick(history[9], history);
      expect(strategy.getIndicator('rsi')).toBeUndefined();
    });

    it('应该计算并保存 RSI', async () => {
      const history = generateHistory(20);
      await strategy.onTick(history[19], history);
      const rsi = strategy.getIndicator('rsi');
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });
  });
});

// ============================================
// MACDStrategy 测试
// ============================================

describe('MACDStrategy (Real)', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new MACDStrategy({
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      symbol: 'BTC/USDT',
    });
    mockEngine = createMockEngine();
    strategy.engine = mockEngine;
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new MACDStrategy();
      expect(s.fastPeriod).toBe(12);
      expect(s.slowPeriod).toBe(26);
      expect(s.signalPeriod).toBe(9);
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const history = generateHistory(20);
      await strategy.onTick(history[19], history);
      expect(strategy.getIndicator('macd')).toBeUndefined();
    });

    it('应该计算 MACD 指标', async () => {
      const history = generateHistory(50);
      await strategy.onTick(history[49], history);
      // MACD 需要足够的数据
    });
  });
});

// ============================================
// GridStrategy 测试
// ============================================

describe('GridStrategy (Real)', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new GridStrategy({
      symbol: 'BTC/USDT',
      gridCount: 10,
      upperPrice: 55000,
      lowerPrice: 45000,
      totalAmount: 1,
    });
    mockEngine = createMockEngine();
    strategy.engine = mockEngine;
  });

  describe('构造函数', () => {
    it('应该使用自定义参数', () => {
      expect(strategy.gridCount).toBe(10);
      expect(strategy.upperPrice).toBe(55000);
      expect(strategy.lowerPrice).toBe(45000);
    });
  });

  describe('onInit', () => {
    it('应该初始化网格', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });
});

// ============================================
// BollingerBandsStrategy 测试
// ============================================

describe('BollingerBandsStrategy (Real)', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new BollingerBandsStrategy({
      period: 20,
      stdDev: 2,
      symbol: 'BTC/USDT',
    });
    mockEngine = createMockEngine();
    strategy.engine = mockEngine;
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new BollingerBandsStrategy();
      expect(s.period).toBe(20);
      expect(s.stdDev).toBe(2);
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const history = generateHistory(10);
      await strategy.onTick(history[9], history);
      expect(strategy.getIndicator('upper')).toBeUndefined();
    });

    it('应该计算布林带指标', async () => {
      const history = generateHistory(30);
      await strategy.onTick(history[29], history);
      // 检查是否设置了指标
    });
  });
});
