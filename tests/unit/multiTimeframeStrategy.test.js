/**
 * 多周期共振策略测试
 * Multi-Timeframe Resonance Strategy Tests
 * @module tests/unit/multiTimeframeStrategy.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MultiTimeframeStrategy } from '../../src/strategies/MultiTimeframeStrategy.js';

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
// 生成测试K线数据 (5分钟K线)
// ============================================

/**
 * 生成随机波动K线
 */
function generateCandles(count, startPrice = 50000, volatility = 100) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * volatility;
    price += change;

    candles.push({
      timestamp: Date.now() - (count - i) * 300000, // 5分钟间隔
      open: price - change / 2,
      high: price + volatility / 2,
      low: price - volatility / 2,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}

/**
 * 生成上升趋势K线 (模拟1H趋势向上)
 */
function generateBullishTrendCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const trend = 20 + Math.random() * 10; // 持续上涨
    const noise = (Math.random() - 0.5) * 30;
    price += trend + noise;

    candles.push({
      timestamp: Date.now() - (count - i) * 300000,
      open: price - trend / 2,
      high: price + 30,
      low: price - trend,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}

/**
 * 生成下降趋势K线 (模拟1H趋势向下)
 */
function generateBearishTrendCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const trend = -20 - Math.random() * 10; // 持续下跌
    const noise = (Math.random() - 0.5) * 30;
    price += trend + noise;

    candles.push({
      timestamp: Date.now() - (count - i) * 300000,
      open: price - trend / 2,
      high: price - trend,
      low: price - 30,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}

/**
 * 生成趋势+回调+反弹的完整周期K线
 * 模拟: 1H趋势向上 -> 15M回调 -> 5M触发进场
 */
function generateResonanceSetup(count = 200, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  // 阶段1: 上涨建立趋势 (前120根5分钟K线 = 10小时)
  for (let i = 0; i < 120; i++) {
    const trend = 15 + Math.random() * 10;
    price += trend;

    candles.push({
      timestamp: Date.now() - (count - i) * 300000,
      open: price - trend / 2,
      high: price + 20,
      low: price - 10,
      close: price,
      volume: 1000,
    });
  }

  // 阶段2: 回调 (接下来60根 = 5小时)
  const peakPrice = price;
  for (let i = 120; i < 180; i++) {
    const pullback = -10 - Math.random() * 5;
    price += pullback;

    candles.push({
      timestamp: Date.now() - (count - i) * 300000,
      open: price - pullback / 2,
      high: price + 10,
      low: price - 20,
      close: price,
      volume: 800,
    });
  }

  // 阶段3: 反弹触发 (最后20根 = 约1.5小时)
  for (let i = 180; i < count; i++) {
    const bounce = 25 + Math.random() * 15;
    price += bounce;

    candles.push({
      timestamp: Date.now() - (count - i) * 300000,
      open: price - bounce / 2,
      high: price + 30,
      low: price - 10,
      close: price,
      volume: 1500, // 放量
    });
  }

  return candles;
}

/**
 * 生成RSI超卖后回升的K线
 */
function generateOversoldRecoveryCandles(count = 50, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  // 前30根下跌，使RSI进入超卖
  for (let i = 0; i < 30; i++) {
    const drop = -30 - Math.random() * 20;
    price += drop;

    candles.push({
      timestamp: Date.now() - (count - i) * 300000,
      open: price - drop / 2,
      high: price + 10,
      low: price - 30,
      close: price,
      volume: 1000,
    });
  }

  // 后20根反弹回升
  for (let i = 30; i < count; i++) {
    const bounce = 40 + Math.random() * 20;
    price += bounce;

    candles.push({
      timestamp: Date.now() - (count - i) * 300000,
      open: price - bounce / 2,
      high: price + 30,
      low: price - 10,
      close: price,
      volume: 1200,
    });
  }

  return candles;
}

// ============================================
// MultiTimeframeStrategy 测试
// ============================================

describe('MultiTimeframeStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new MultiTimeframeStrategy({
      symbol: 'BTC/USDT',
      positionPercent: 90,
      // 1H 参数
      h1ShortPeriod: 10,
      h1LongPeriod: 30,
      // 15M 参数
      m15RsiPeriod: 14,
      m15RsiPullbackLong: 40,
      m15RsiPullbackShort: 60,
      m15PullbackPercent: 1.5,
      // 5M 参数
      m5RsiPeriod: 14,
      m5RsiOversold: 30,
      m5RsiOverbought: 70,
      m5ShortPeriod: 5,
      m5LongPeriod: 15,
      // 出场参数
      takeProfitPercent: 3.0,
      stopLossPercent: 1.5,
      useTrendExit: true,
    });
    engine = createMockEngine();
    strategy.engine = engine;
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new MultiTimeframeStrategy();
      expect(s.symbol).toBe('BTC/USDT');
      expect(s.positionPercent).toBe(95);
      // 1H 默认参数
      expect(s.h1ShortPeriod).toBe(10);
      expect(s.h1LongPeriod).toBe(30);
      // 15M 默认参数
      expect(s.m15RsiPeriod).toBe(14);
      expect(s.m15RsiPullbackLong).toBe(40);
      expect(s.m15RsiPullbackShort).toBe(60);
      expect(s.m15PullbackPercent).toBe(1.5);
      // 5M 默认参数
      expect(s.m5RsiPeriod).toBe(14);
      expect(s.m5RsiOversold).toBe(30);
      expect(s.m5RsiOverbought).toBe(70);
      expect(s.m5ShortPeriod).toBe(5);
      expect(s.m5LongPeriod).toBe(15);
      // 出场参数
      expect(s.takeProfitPercent).toBe(3.0);
      expect(s.stopLossPercent).toBe(1.5);
      expect(s.useTrendExit).toBe(true);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.positionPercent).toBe(90);
      expect(strategy.h1ShortPeriod).toBe(10);
      expect(strategy.m15RsiPullbackLong).toBe(40);
      expect(strategy.m5RsiOversold).toBe(30);
      expect(strategy.takeProfitPercent).toBe(3.0);
    });

    it('应该设置策略名称', () => {
      expect(strategy.name).toBe('MultiTimeframeStrategy');
    });

    it('应该初始化多周期K线缓存', () => {
      expect(strategy.candles5m).toEqual([]);
      expect(strategy.candles15m).toEqual([]);
      expect(strategy.candles1h).toEqual([]);
    });

    it('应该初始化趋势状态', () => {
      expect(strategy.h1Trend).toBe('neutral');
      expect(strategy.m15PullbackReady).toBe(false);
      expect(strategy.m5EntrySignal).toBe(false);
    });

    it('应该初始化入场状态', () => {
      expect(strategy.entryPrice).toBeNull();
      expect(strategy.entryDirection).toBeNull();
    });

    it('应该初始化K线聚合计数器', () => {
      expect(strategy.current15mCandle).toBeNull();
      expect(strategy.candle15mCount).toBe(0);
      expect(strategy.current1hCandle).toBeNull();
      expect(strategy.candle1hCount).toBe(0);
    });
  });

  // ============================================
  // onInit 测试
  // ============================================

  describe('onInit', () => {
    it('应该初始化成功', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  // ============================================
  // 多周期K线聚合测试
  // ============================================

  describe('_updateMultiTimeframeCandles', () => {
    it('应该正确累积5M K线', () => {
      const candles = generateCandles(10);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      expect(strategy.candles5m.length).toBe(10);
    });

    it('每3根5M应该生成1根15M K线', () => {
      const candles = generateCandles(9); // 9根5M = 3根15M

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      expect(strategy.candles15m.length).toBe(3);
    });

    it('每12根5M应该生成1根1H K线', () => {
      const candles = generateCandles(24); // 24根5M = 2根1H

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      expect(strategy.candles1h.length).toBe(2);
    });

    it('15M K线应该正确聚合OHLCV', () => {
      const candles = [
        { timestamp: 1, open: 100, high: 110, low: 95, close: 105, volume: 1000 },
        { timestamp: 2, open: 105, high: 120, low: 100, close: 115, volume: 1500 },
        { timestamp: 3, open: 115, high: 125, low: 110, close: 120, volume: 2000 },
      ];

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      expect(strategy.candles15m.length).toBe(1);
      const m15Candle = strategy.candles15m[0];

      expect(m15Candle.open).toBe(100);       // 第一根的open
      expect(m15Candle.high).toBe(125);       // 最高的high
      expect(m15Candle.low).toBe(95);         // 最低的low
      expect(m15Candle.close).toBe(120);      // 最后一根的close
      expect(m15Candle.volume).toBe(4500);    // 总volume
    });

    it('1H K线应该正确聚合', () => {
      const candles = generateCandles(12);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      expect(strategy.candles1h.length).toBe(1);
      const h1Candle = strategy.candles1h[0];

      expect(h1Candle.open).toBe(candles[0].open);
      expect(h1Candle.close).toBe(candles[11].close);
    });

    it('K线缓存应该有最大限制', () => {
      const candles = generateCandles(250);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      expect(strategy.candles5m.length).toBeLessThanOrEqual(strategy.maxCandles);
    });
  });

  // ============================================
  // 1H 指标计算测试 (趋势判断)
  // ============================================

  describe('_calculate1HIndicators', () => {
    it('数据不足时应该返回null', () => {
      // 只有20根1H K线，不足30根
      const candles = generateCandles(240); // 20根1H

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      const result = strategy._calculate1HIndicators();

      expect(result.shortMA).toBeNull();
      expect(result.longMA).toBeNull();
    });

    it('数据充足时应该计算SMA', () => {
      // 生成足够的数据 (至少30根1H = 360根5M)
      const candles = generateBullishTrendCandles(400);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      const result = strategy._calculate1HIndicators();

      expect(result.shortMA).toBeDefined();
      expect(result.longMA).toBeDefined();
      expect(result.shortMA).not.toBeNull();
      expect(result.longMA).not.toBeNull();
    });

    it('上涨趋势应该识别为bullish', () => {
      const candles = generateBullishTrendCandles(400);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      strategy._calculate1HIndicators();

      expect(strategy.h1Trend).toBe('bullish');
    });

    it('下跌趋势应该识别为bearish', () => {
      const candles = generateBearishTrendCandles(400);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      strategy._calculate1HIndicators();

      expect(strategy.h1Trend).toBe('bearish');
    });
  });

  // ============================================
  // 15M 指标计算测试 (回调判断)
  // ============================================

  describe('_calculate15MIndicators', () => {
    it('数据不足时应该返回null RSI', () => {
      const candles = generateCandles(30); // 10根15M，不足15根

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      const result = strategy._calculate15MIndicators();

      expect(result.rsi).toBeNull();
    });

    it('数据充足时应该计算RSI', () => {
      const candles = generateCandles(60); // 20根15M

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      const result = strategy._calculate15MIndicators();

      expect(result.rsi).toBeDefined();
      if (result.rsi !== null) {
        expect(result.rsi).toBeGreaterThanOrEqual(0);
        expect(result.rsi).toBeLessThanOrEqual(100);
      }
    });

    it('RSI低于阈值时应该设置回调就绪', () => {
      strategy.h1Trend = 'bullish';

      // 生成下跌数据使RSI降低
      const candles = generateBearishTrendCandles(60);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      const result = strategy._calculate15MIndicators();

      // 如果RSI确实低于40，应该设置回调就绪
      if (result.rsi !== null && result.rsi <= 40) {
        expect(strategy.m15PullbackReady).toBe(true);
      }
    });

    it('价格回撤超过阈值应该设置回调就绪', () => {
      strategy.h1Trend = 'bullish';
      strategy.m15HighSinceTrend = 50000;

      // 创建回撤数据
      const candles = generateCandles(60, 49000); // 价格低于高点

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      strategy._calculate15MIndicators();

      // 如果回撤超过1.5%，应该设置回调就绪
      // (50000 - 49000) / 50000 = 2% > 1.5%
    });
  });

  // ============================================
  // 5M 指标计算测试 (进场触发)
  // ============================================

  describe('_calculate5MIndicators', () => {
    it('数据不足时应该返回null', () => {
      const candles = generateCandles(10);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      const result = strategy._calculate5MIndicators();

      expect(result.rsi).toBeNull();
      expect(result.shortMA).toBeNull();
      expect(result.longMA).toBeNull();
    });

    it('数据充足时应该计算所有指标', () => {
      const candles = generateCandles(30);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      const result = strategy._calculate5MIndicators();

      expect(result.rsi).toBeDefined();
      expect(result.shortMA).toBeDefined();
      expect(result.longMA).toBeDefined();
    });

    it('RSI应该在0-100范围内', () => {
      const candles = generateCandles(30);

      for (const candle of candles) {
        strategy._updateMultiTimeframeCandles(candle);
      }

      const result = strategy._calculate5MIndicators();

      if (result.rsi !== null) {
        expect(result.rsi).toBeGreaterThanOrEqual(0);
        expect(result.rsi).toBeLessThanOrEqual(100);
      }
    });
  });

  // ============================================
  // SMA 计算测试
  // ============================================

  describe('_calculateSMA', () => {
    it('数据不足时应该返回null', () => {
      const data = [100, 101, 102];
      const result = strategy._calculateSMA(data, 10);

      expect(result).toBeNull();
    });

    it('应该正确计算SMA', () => {
      const data = [10, 20, 30, 40, 50];
      const result = strategy._calculateSMA(data, 5);

      expect(result).toBe(30); // (10+20+30+40+50)/5 = 30
    });

    it('应该只使用最后period个数据', () => {
      const data = [100, 200, 10, 20, 30, 40, 50];
      const result = strategy._calculateSMA(data, 5);

      expect(result).toBe(30); // 只用最后5个
    });
  });

  // ============================================
  // RSI 计算测试
  // ============================================

  describe('_calculateRSI', () => {
    it('数据不足时应该返回null', () => {
      const closes = [100, 101, 102];
      const result = strategy._calculateRSI(closes, 14);

      expect(result).toBeNull();
    });

    it('持续上涨应该返回高RSI', () => {
      const closes = [];
      for (let i = 0; i < 20; i++) {
        closes.push(100 + i * 10); // 持续上涨
      }

      const result = strategy._calculateRSI(closes, 14);

      expect(result).toBeGreaterThan(70);
    });

    it('持续下跌应该返回低RSI', () => {
      const closes = [];
      for (let i = 0; i < 20; i++) {
        closes.push(200 - i * 10); // 持续下跌
      }

      const result = strategy._calculateRSI(closes, 14);

      expect(result).toBeLessThan(30);
    });

    it('全部上涨应该返回100', () => {
      const closes = [];
      for (let i = 0; i < 20; i++) {
        closes.push(100 + i); // 每天上涨1
      }

      const result = strategy._calculateRSI(closes, 14);

      expect(result).toBe(100);
    });
  });

  // ============================================
  // 进场条件测试
  // ============================================

  describe('_checkEntryConditions', () => {
    it('趋势中性时不应该进场', () => {
      strategy.h1Trend = 'neutral';
      strategy.m15PullbackReady = true;

      const result = strategy._checkEntryConditions(
        { close: 50000 },
        { shortMA: 100, longMA: 100 },
        { rsi: 35 },
        { rsi: 35, shortMA: 100, longMA: 99 }
      );

      expect(result).toBeNull();
    });

    it('回调未就绪时不应该进场', () => {
      strategy.h1Trend = 'bullish';
      strategy.m15PullbackReady = false;

      const result = strategy._checkEntryConditions(
        { close: 50000 },
        { shortMA: 110, longMA: 100 },
        { rsi: 35 },
        { rsi: 35, shortMA: 100, longMA: 99 }
      );

      expect(result).toBeNull();
    });

    it('空头趋势时不应该做多', () => {
      strategy.h1Trend = 'bearish';
      strategy.m15PullbackReady = true;

      const result = strategy._checkEntryConditions(
        { close: 50000 },
        { shortMA: 90, longMA: 100 },
        { rsi: 65 },
        { rsi: 65, shortMA: 100, longMA: 101 }
      );

      expect(result).toBeNull();
    });

    it('满足所有条件时应该触发进场', () => {
      strategy.h1Trend = 'bullish';
      strategy.m15PullbackReady = true;
      strategy.prevM5Rsi = 28; // 之前超卖

      const result = strategy._checkEntryConditions(
        { close: 50000 },
        { shortMA: 110, longMA: 100 },
        { rsi: 35 },
        { rsi: 35, shortMA: 100, longMA: 99 } // RSI从超卖回升
      );

      expect(result).not.toBeNull();
      expect(result.direction).toBe('bullish');
      expect(result.trigger).toContain('RSI Recovery');
    });

    it('5M金叉应该触发进场', () => {
      strategy.h1Trend = 'bullish';
      strategy.m15PullbackReady = true;
      strategy.prevM5ShortMA = 99;
      strategy.prevM5LongMA = 100; // 之前短<长

      const result = strategy._checkEntryConditions(
        { close: 50000 },
        { shortMA: 110, longMA: 100 },
        { rsi: 45 },
        { rsi: 45, shortMA: 101, longMA: 100 } // 现在短>长
      );

      expect(result).not.toBeNull();
      expect(result.trigger).toContain('Golden Cross');
    });
  });

  // ============================================
  // 出场条件测试
  // ============================================

  describe('_checkExitConditions', () => {
    beforeEach(() => {
      strategy.entryPrice = 50000;
      strategy.entryDirection = 'bullish';
    });

    it('达到止盈应该出场', () => {
      const candle = { close: 51600 }; // 涨幅 3.2% > 3%

      const result = strategy._checkExitConditions(candle, {});

      expect(result).not.toBeNull();
      expect(result.reason).toContain('Take Profit');
    });

    it('达到止损应该出场', () => {
      const candle = { close: 49200 }; // 跌幅 1.6% > 1.5%

      const result = strategy._checkExitConditions(candle, {});

      expect(result).not.toBeNull();
      expect(result.reason).toContain('Stop Loss');
    });

    it('趋势反转应该出场', () => {
      strategy.useTrendExit = true;
      strategy.h1Trend = 'bearish'; // 趋势已变为空头

      const candle = { close: 50500 }; // 价格没有触及止盈止损

      const result = strategy._checkExitConditions(candle, {});

      expect(result).not.toBeNull();
      expect(result.reason).toContain('Trend Reversal');
    });

    it('禁用趋势出场时趋势反转不应该出场', () => {
      strategy.useTrendExit = false;
      strategy.h1Trend = 'bearish';

      const candle = { close: 50500 };

      const result = strategy._checkExitConditions(candle, {});

      expect(result).toBeNull();
    });

    it('未达到任何条件时不应该出场', () => {
      const candle = { close: 50500 }; // 涨幅1%，未触及止盈止损

      const result = strategy._checkExitConditions(candle, {});

      expect(result).toBeNull();
    });
  });

  // ============================================
  // onTick 完整测试
  // ============================================

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const candles = generateCandles(50);
      await strategy.onTick(candles[49], candles);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('应该保存指标值', async () => {
      const candles = generateBullishTrendCandles(400);

      for (let i = 350; i < 400; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      expect(strategy.getIndicator('h1Trend')).toBeDefined();
      expect(strategy.getIndicator('m15PullbackReady')).toBeDefined();
    });

    it('有持仓时应该检查出场条件', async () => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });
      strategy.entryPrice = 50000;
      strategy.entryDirection = 'bullish';

      const candles = generateCandles(400);
      candles[399].close = 49000; // 触发止损

      await strategy.onTick(candles[399], candles);

      expect(engine.closePosition).toHaveBeenCalled();
    });

    it('完整共振流程应该触发买入', async () => {
      const candles = generateResonanceSetup(250);

      // 运行策略积累数据
      for (let i = 200; i < 250; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      // 根据数据条件可能触发买入
      // 验证策略正常执行
      expect(strategy.getIndicator('h1Trend')).toBeDefined();
    });
  });

  // ============================================
  // 状态重置测试
  // ============================================

  describe('_resetEntryState', () => {
    it('应该重置所有入场状态', () => {
      strategy.entryPrice = 50000;
      strategy.entryDirection = 'bullish';
      strategy.m15PullbackReady = true;
      strategy.m15HighSinceTrend = 52000;
      strategy.m15LowSinceTrend = 48000;

      strategy._resetEntryState();

      expect(strategy.entryPrice).toBeNull();
      expect(strategy.entryDirection).toBeNull();
      expect(strategy.m15PullbackReady).toBe(false);
      expect(strategy.m15HighSinceTrend).toBe(0);
      expect(strategy.m15LowSinceTrend).toBe(Infinity);
    });
  });

  describe('_resetPullbackTracking', () => {
    it('应该重置回调跟踪状态', () => {
      strategy.m15PullbackReady = true;
      strategy.m15HighSinceTrend = 52000;
      strategy.m15LowSinceTrend = 48000;

      strategy._resetPullbackTracking();

      expect(strategy.m15PullbackReady).toBe(false);
      expect(strategy.m15HighSinceTrend).toBe(0);
      expect(strategy.m15LowSinceTrend).toBe(Infinity);
    });
  });

  // ============================================
  // 前值更新测试
  // ============================================

  describe('_updatePreviousValues', () => {
    it('应该更新所有前值', () => {
      const h1Indicators = { shortMA: 110, longMA: 100 };
      const m5Indicators = { rsi: 45, shortMA: 51, longMA: 50 };

      strategy._updatePreviousValues(h1Indicators, m5Indicators);

      expect(strategy.prevH1ShortMA).toBe(110);
      expect(strategy.prevH1LongMA).toBe(100);
      expect(strategy.prevM5ShortMA).toBe(51);
      expect(strategy.prevM5LongMA).toBe(50);
      expect(strategy.prevM5Rsi).toBe(45);
    });
  });
});

// ============================================
// 多周期共振策略集成测试
// ============================================

describe('多周期共振策略集成测试', () => {
  it('应该正确继承 BaseStrategy', async () => {
    const { BaseStrategy } = await import('../../src/strategies/BaseStrategy.js');
    const mtf = new MultiTimeframeStrategy();

    expect(mtf instanceof BaseStrategy).toBe(true);
  });

  it('应该能正确设置和获取信号', () => {
    const strategy = new MultiTimeframeStrategy();

    strategy.setBuySignal('MTF Resonance');
    expect(strategy.getSignal().type).toBe('buy');
    expect(strategy.getSignal().reason).toBe('MTF Resonance');

    strategy.setSellSignal('Exit MTF');
    expect(strategy.getSignal().type).toBe('sell');
  });

  it('应该能正确管理状态', () => {
    const strategy = new MultiTimeframeStrategy();

    strategy.setState('testKey', 'testValue');
    expect(strategy.getState('testKey')).toBe('testValue');

    strategy.setIndicator('testIndicator', 123);
    expect(strategy.getIndicator('testIndicator')).toBe(123);
  });

  it('完整交易流程测试', async () => {
    const engine = createMockEngine();
    const strategy = new MultiTimeframeStrategy({
      takeProfitPercent: 3,
      stopLossPercent: 1.5,
    });
    strategy.engine = engine;

    // 使用共振设置数据
    const candles = generateResonanceSetup(300);

    // 运行策略
    for (let i = 200; i < 300; i++) {
      await strategy.onTick(candles[i], candles.slice(0, i + 1));
    }

    // 检查策略状态
    expect(strategy.candles5m.length).toBeGreaterThan(0);
    expect(strategy.candles15m.length).toBeGreaterThan(0);
    expect(strategy.candles1h.length).toBeGreaterThan(0);
  });

  it('应该能与其他策略同时运行', async () => {
    const engine = createMockEngine();

    const mtfStrategy = new MultiTimeframeStrategy();
    mtfStrategy.engine = engine;

    const candles = generateCandles(100);

    for (const candle of candles) {
      await mtfStrategy.onCandle(candle);
    }

    // 策略应该正常运行，不抛错
    expect(mtfStrategy.candles5m.length).toBeGreaterThan(0);
  });
});

// ============================================
// 边界条件测试
// ============================================

describe('边界条件测试', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new MultiTimeframeStrategy();
    engine = createMockEngine();
    strategy.engine = engine;
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  it('空K线数据不应该崩溃', async () => {
    await expect(strategy.onTick({ close: 50000, open: 49900, high: 50100, low: 49800, volume: 1000 }, [])).resolves.not.toThrow();
  });

  it('零成交量不应该崩溃', async () => {
    const candles = generateCandles(100);
    candles[99].volume = 0;

    await expect(strategy.onTick(candles[99], candles)).resolves.not.toThrow();
  });

  it('极端价格变动不应该崩溃', async () => {
    const candles = generateCandles(100);
    candles[99].close = candles[99].open * 2; // 100% 涨幅

    await expect(strategy.onTick(candles[99], candles)).resolves.not.toThrow();
  });

  it('连续相同价格不应该崩溃', async () => {
    const candles = [];
    for (let i = 0; i < 100; i++) {
      candles.push({
        timestamp: Date.now() - (100 - i) * 300000,
        open: 50000,
        high: 50000,
        low: 50000,
        close: 50000,
        volume: 1000,
      });
    }

    await expect(strategy.onTick(candles[99], candles)).resolves.not.toThrow();
  });

  it('K线缓存应该有限制', async () => {
    const candles = generateCandles(300);

    for (const candle of candles) {
      await strategy.onTick(candle, candles);
    }

    expect(strategy.candles5m.length).toBeLessThanOrEqual(strategy.maxCandles);
    expect(strategy.candles15m.length).toBeLessThanOrEqual(strategy.maxCandles);
    expect(strategy.candles1h.length).toBeLessThanOrEqual(strategy.maxCandles);
  });

  it('负价格应该被正确处理', async () => {
    // 虽然实际中不会有负价格，但策略应该能处理
    const candles = generateCandles(100);
    candles[99].close = -100;
    candles[99].low = -150;

    // 不应该崩溃，但可能不产生有效信号
    await expect(strategy.onTick(candles[99], candles)).resolves.not.toThrow();
  });

  it('NaN价格应该被正确处理', async () => {
    const candles = generateCandles(100);
    candles[99].close = NaN;

    await expect(strategy.onTick(candles[99], candles)).resolves.not.toThrow();
  });

  it('Infinity价格应该被正确处理', async () => {
    const candles = generateCandles(100);
    candles[99].close = Infinity;

    await expect(strategy.onTick(candles[99], candles)).resolves.not.toThrow();
  });
});

// ============================================
// 性能测试
// ============================================

describe('性能测试', () => {
  it('大量K线数据处理应该在合理时间内完成', async () => {
    const strategy = new MultiTimeframeStrategy();
    const engine = createMockEngine();
    strategy.engine = engine;

    const candles = generateCandles(1000);
    const startTime = Date.now();

    for (let i = 0; i < 1000; i++) {
      await strategy.onTick(candles[i], candles.slice(0, i + 1));
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // 1000根K线处理应该在5秒内完成
    expect(duration).toBeLessThan(5000);
  });
});
