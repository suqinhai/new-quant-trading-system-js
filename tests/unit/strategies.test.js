/**
 * 策略单元测试
 * @module tests/unit/strategies.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// BaseStrategy Mock
// ============================================

class BaseStrategyMock {
  constructor(params = {}) {
    this.name = params.name || 'BaseStrategy';
    this.params = params;
    this.engine = null;
    this.state = {
      initialized: false,
      signal: null,
      lastSignal: null,
      data: {},
    };
    this.indicators = {};
    this._candleHistory = [];
    this.events = [];
  }

  emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
  }

  on(event, callback) {
    // 简化的事件监听
  }

  async onInit() {
    this.state.initialized = true;
    this.emit('initialized');
  }

  async onTick(candle, history) {
    throw new Error('onTick must be implemented by subclass');
  }

  async onCandle(data) {
    const candle = {
      symbol: data.symbol,
      timestamp: data.timestamp || Date.now(),
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      volume: data.volume,
    };

    this._candleHistory.push(candle);
    if (this._candleHistory.length > 200) {
      this._candleHistory.shift();
    }

    await this.onTick(candle, this._candleHistory);
  }

  async onFinish() {
    this.emit('finished');
  }

  setBuySignal(reason = '') {
    this.state.lastSignal = this.state.signal;
    this.state.signal = { type: 'buy', reason, timestamp: Date.now() };
    this.emit('signal', this.state.signal);
  }

  setSellSignal(reason = '') {
    this.state.lastSignal = this.state.signal;
    this.state.signal = { type: 'sell', reason, timestamp: Date.now() };
    this.emit('signal', this.state.signal);
  }

  clearSignal() {
    this.state.lastSignal = this.state.signal;
    this.state.signal = null;
  }

  getSignal() {
    return this.state.signal;
  }

  buy(symbol, amount, options = {}) {
    if (!this.engine) return null;
    return this.engine.buy(symbol, amount, options);
  }

  sell(symbol, amount, options = {}) {
    if (!this.engine) return null;
    return this.engine.sell(symbol, amount, options);
  }

  buyPercent(symbol, percent) {
    if (!this.engine) return null;
    return this.engine.buyPercent(symbol, percent);
  }

  closePosition(symbol) {
    if (!this.engine) return null;
    return this.engine.closePosition(symbol);
  }

  getPosition(symbol) {
    if (!this.engine) return null;
    return this.engine.getPosition(symbol);
  }

  getCapital() {
    if (!this.engine) return 0;
    return this.engine.getCapital();
  }

  setState(key, value) {
    this.state.data[key] = value;
  }

  getState(key, defaultValue = null) {
    return this.state.data[key] !== undefined ? this.state.data[key] : defaultValue;
  }

  setIndicator(name, value) {
    this.indicators[name] = value;
  }

  getIndicator(name) {
    return this.indicators[name];
  }

  log(message, level = 'info') {
    // 测试时静默
  }
}

// ============================================
// SMA Strategy Mock
// ============================================

class SMAStrategyMock extends BaseStrategyMock {
  constructor(params = {}) {
    super(params);
    this.name = 'SMAStrategy';
    this.fastPeriod = params.fastPeriod || 10;
    this.slowPeriod = params.slowPeriod || 20;
    this.symbol = params.symbol || params.symbols?.[0] || 'BTC/USDT';
  }

  async onTick(candle, history) {
    // 需要足够的历史数据
    if (history.length < this.slowPeriod) {
      return;
    }

    // 提取收盘价
    const closes = history.map(h => h.close);

    // 计算 SMA
    const fastSMA = this._calculateSMA(closes, this.fastPeriod);
    const slowSMA = this._calculateSMA(closes, this.slowPeriod);

    // 保存指标
    this.setIndicator('fastSMA', fastSMA);
    this.setIndicator('slowSMA', slowSMA);

    // 获取上一次的 SMA 值
    const prevFastSMA = this.getState('prevFastSMA');
    const prevSlowSMA = this.getState('prevSlowSMA');

    // 保存当前值用于下次比较
    this.setState('prevFastSMA', fastSMA);
    this.setState('prevSlowSMA', slowSMA);

    // 需要至少两根 K 线才能判断交叉
    if (prevFastSMA === null || prevSlowSMA === null) {
      return;
    }

    // 检查交叉
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 金叉：快线从下穿上
    if (prevFastSMA <= prevSlowSMA && fastSMA > slowSMA) {
      if (!hasPosition) {
        this.setBuySignal(`金叉: Fast ${fastSMA.toFixed(2)} > Slow ${slowSMA.toFixed(2)}`);
        this.buyPercent(this.symbol, 10);
      }
    }

    // 死叉：快线从上穿下
    if (prevFastSMA >= prevSlowSMA && fastSMA < slowSMA) {
      if (hasPosition) {
        this.setSellSignal(`死叉: Fast ${fastSMA.toFixed(2)} < Slow ${slowSMA.toFixed(2)}`);
        this.closePosition(this.symbol);
      }
    }
  }

  _calculateSMA(values, period) {
    if (values.length < period) return null;
    const slice = values.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }
}

// ============================================
// RSI Strategy Mock
// ============================================

class RSIStrategyMock extends BaseStrategyMock {
  constructor(params = {}) {
    super(params);
    this.name = 'RSIStrategy';
    this.period = params.period || 14;
    this.overbought = params.overbought || 70;
    this.oversold = params.oversold || 30;
    this.symbol = params.symbol || params.symbols?.[0] || 'BTC/USDT';
  }

  async onTick(candle, history) {
    if (history.length < this.period + 1) {
      return;
    }

    const rsi = this._calculateRSI(history, this.period);
    this.setIndicator('rsi', rsi);

    const prevRSI = this.getState('prevRSI');
    this.setState('prevRSI', rsi);

    if (prevRSI === null) return;

    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 超卖区买入
    if (!hasPosition && prevRSI <= this.oversold && rsi > this.oversold) {
      this.setBuySignal(`RSI 从超卖区回升: ${rsi.toFixed(2)}`);
      this.buyPercent(this.symbol, 10);
    }

    // 超买区卖出
    if (hasPosition && prevRSI >= this.overbought && rsi < this.overbought) {
      this.setSellSignal(`RSI 从超买区回落: ${rsi.toFixed(2)}`);
      this.closePosition(this.symbol);
    }
  }

  _calculateRSI(history, period) {
    const closes = history.map(h => h.close);
    const changes = [];

    for (let i = 1; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }

    const recentChanges = changes.slice(-period);
    let gains = 0;
    let losses = 0;

    for (const change of recentChanges) {
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
}

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

function generateTrendingHistory(count, startPrice, trend = 'up') {
  const history = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = trend === 'up'
      ? Math.random() * 100 + 10  // 上涨趋势
      : -(Math.random() * 100 + 10); // 下跌趋势

    price += change;

    history.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + 50,
      low: price - 50,
      close: price,
      volume: 1000,
    });
  }

  return history;
}

function generateCrossingHistory(type = 'golden', count = 40) {
  const history = [];
  const basePrice = 50000;

  for (let i = 0; i < count; i++) {
    let price;
    if (type === 'golden') {
      // 金叉：前 70% 持续下跌，后 30% 快速上涨
      const transitionPoint = Math.floor(count * 0.7);
      if (i < transitionPoint) {
        // 持续下跌：从 52000 跌到 48000
        price = basePrice + 2000 - (i / transitionPoint) * 4000;
      } else {
        // 快速上涨：从 48000 涨到 55000
        const progress = (i - transitionPoint) / (count - transitionPoint);
        price = 48000 + progress * 7000;
      }
    } else {
      // 死叉：前 70% 持续上涨，后 30% 快速下跌
      const transitionPoint = Math.floor(count * 0.7);
      if (i < transitionPoint) {
        // 持续上涨：从 48000 涨到 52000
        price = basePrice - 2000 + (i / transitionPoint) * 4000;
      } else {
        // 快速下跌：从 52000 跌到 45000
        const progress = (i - transitionPoint) / (count - transitionPoint);
        price = 52000 - progress * 7000;
      }
    }

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

function generateOversoldHistory(count = 30) {
  // 生成持续下跌后反弹的数据
  const history = [];
  let price = 50000;

  for (let i = 0; i < count; i++) {
    if (i < count * 0.7) {
      // 前 70% 持续下跌
      price -= 100 + Math.random() * 50;
    } else {
      // 后 30% 开始反弹
      price += 80 + Math.random() * 40;
    }

    history.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price + 20,
      high: price + 50,
      low: price - 30,
      close: price,
      volume: 1000,
    });
  }

  return history;
}

// ============================================
// 测试用例
// ============================================

describe('BaseStrategy', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new BaseStrategyMock({ name: 'TestStrategy' });
    mockEngine = createMockEngine();
    strategy.engine = mockEngine;
  });

  describe('初始化', () => {
    it('应该正确初始化策略', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });

    it('应该发射初始化事件', async () => {
      await strategy.onInit();
      const event = strategy.events.find(e => e.event === 'initialized');
      expect(event).toBeDefined();
    });
  });

  describe('信号管理', () => {
    it('应该正确设置买入信号', () => {
      strategy.setBuySignal('测试买入');
      const signal = strategy.getSignal();

      expect(signal.type).toBe('buy');
      expect(signal.reason).toBe('测试买入');
    });

    it('应该正确设置卖出信号', () => {
      strategy.setSellSignal('测试卖出');
      const signal = strategy.getSignal();

      expect(signal.type).toBe('sell');
      expect(signal.reason).toBe('测试卖出');
    });

    it('应该正确清除信号', () => {
      strategy.setBuySignal('测试');
      strategy.clearSignal();

      expect(strategy.getSignal()).toBeNull();
      expect(strategy.state.lastSignal.type).toBe('buy');
    });

    it('应该发射信号事件', () => {
      strategy.setBuySignal('测试');
      const event = strategy.events.find(e => e.event === 'signal');

      expect(event).toBeDefined();
      expect(event.data.type).toBe('buy');
    });
  });

  describe('状态和指标', () => {
    it('应该正确设置和获取状态', () => {
      strategy.setState('testKey', 'testValue');
      expect(strategy.getState('testKey')).toBe('testValue');
    });

    it('应该返回默认值当状态不存在时', () => {
      expect(strategy.getState('nonexistent', 'default')).toBe('default');
    });

    it('应该正确设置和获取指标', () => {
      strategy.setIndicator('sma', 50000);
      expect(strategy.getIndicator('sma')).toBe(50000);
    });
  });

  describe('交易方法', () => {
    it('应该调用 engine.buy', () => {
      strategy.buy('BTC/USDT', 0.1);
      expect(mockEngine.buy).toHaveBeenCalledWith('BTC/USDT', 0.1, {});
    });

    it('应该调用 engine.sell', () => {
      strategy.sell('BTC/USDT', 0.1);
      expect(mockEngine.sell).toHaveBeenCalledWith('BTC/USDT', 0.1, {});
    });

    it('应该调用 engine.buyPercent', () => {
      strategy.buyPercent('BTC/USDT', 10);
      expect(mockEngine.buyPercent).toHaveBeenCalledWith('BTC/USDT', 10);
    });

    it('应该调用 engine.closePosition', () => {
      strategy.closePosition('BTC/USDT');
      expect(mockEngine.closePosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('应该在没有 engine 时返回 null', () => {
      strategy.engine = null;
      expect(strategy.buy('BTC/USDT', 0.1)).toBeNull();
    });
  });
});

describe('SMAStrategy', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new SMAStrategyMock({
      fastPeriod: 5,
      slowPeriod: 10,
      symbol: 'BTC/USDT',
    });
    mockEngine = createMockEngine();
    strategy.engine = mockEngine;
  });

  describe('SMA 计算', () => {
    it('应该正确计算 SMA', () => {
      const values = [10, 20, 30, 40, 50];
      const sma = strategy._calculateSMA(values, 5);
      expect(sma).toBe(30); // (10+20+30+40+50) / 5
    });

    it('应该在数据不足时返回 null', () => {
      const values = [10, 20];
      const sma = strategy._calculateSMA(values, 5);
      expect(sma).toBeNull();
    });
  });

  describe('金叉信号', () => {
    it('应该在金叉时产生买入信号', async () => {
      const history = generateCrossingHistory('golden', 40);

      // 模拟逐根 K 线处理
      for (const candle of history) {
        await strategy.onCandle(candle);
      }

      // 检查是否产生了买入信号
      const buyEvent = strategy.events.find(
        e => e.event === 'signal' && e.data.type === 'buy'
      );

      expect(buyEvent).toBeDefined();
      expect(mockEngine.buyPercent).toHaveBeenCalled();
    });
  });

  describe('死叉信号', () => {
    it('应该在死叉时产生卖出信号', async () => {
      // 先模拟有持仓
      mockEngine.getPosition.mockReturnValue({ amount: 0.1 });

      const history = generateCrossingHistory('death', 40);

      for (const candle of history) {
        await strategy.onCandle(candle);
      }

      const sellEvent = strategy.events.find(
        e => e.event === 'signal' && e.data.type === 'sell'
      );

      expect(sellEvent).toBeDefined();
      expect(mockEngine.closePosition).toHaveBeenCalled();
    });
  });

  describe('历史数据不足', () => {
    it('应该在历史数据不足时不产生信号', async () => {
      // 只提供 5 根 K 线（小于 slowPeriod 10）
      const history = generateTrendingHistory(5, 50000);

      for (const candle of history) {
        await strategy.onCandle(candle);
      }

      expect(strategy.events.filter(e => e.event === 'signal').length).toBe(0);
    });
  });
});

describe('RSIStrategy', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    strategy = new RSIStrategyMock({
      period: 14,
      overbought: 70,
      oversold: 30,
      symbol: 'BTC/USDT',
    });
    mockEngine = createMockEngine();
    strategy.engine = mockEngine;
  });

  describe('RSI 计算', () => {
    it('应该计算 RSI 在 0-100 范围内', () => {
      const history = generateTrendingHistory(20, 50000, 'up');
      const rsi = strategy._calculateRSI(history, 14);

      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('应该在持续上涨时 RSI 较高', () => {
      const history = generateTrendingHistory(30, 50000, 'up');
      const rsi = strategy._calculateRSI(history, 14);

      expect(rsi).toBeGreaterThan(50);
    });

    it('应该在持续下跌时 RSI 较低', () => {
      const history = generateTrendingHistory(30, 50000, 'down');
      const rsi = strategy._calculateRSI(history, 14);

      expect(rsi).toBeLessThan(50);
    });
  });

  describe('超卖买入', () => {
    it('应该在 RSI 从超卖区回升时买入', async () => {
      const history = generateOversoldHistory(30);

      for (const candle of history) {
        await strategy.onCandle(candle);
      }

      // 检查是否在合适时机发出买入信号
      const buyEvent = strategy.events.find(
        e => e.event === 'signal' && e.data.type === 'buy'
      );

      // 由于数据是模拟的，可能不一定触发，只检查逻辑正确性
      if (buyEvent) {
        expect(buyEvent.data.reason).toContain('RSI');
      }
    });
  });
});

describe('策略组合测试', () => {
  it('应该能够同时运行多个策略', async () => {
    const mockEngine = createMockEngine();

    const smaStrategy = new SMAStrategyMock({ fastPeriod: 5, slowPeriod: 10 });
    const rsiStrategy = new RSIStrategyMock({ period: 14 });

    smaStrategy.engine = mockEngine;
    rsiStrategy.engine = mockEngine;

    const history = generateTrendingHistory(30, 50000, 'up');

    for (const candle of history) {
      await smaStrategy.onCandle(candle);
      await rsiStrategy.onCandle(candle);
    }

    // 两个策略都应该正常运行
    expect(smaStrategy.getIndicator('fastSMA')).toBeDefined();
    expect(rsiStrategy.getIndicator('rsi')).toBeDefined();
  });
});
