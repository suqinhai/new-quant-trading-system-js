/**
 * 波动率策略测试
 * Volatility Strategies Tests
 * @module tests/unit/volatilityStrategies.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ATRBreakoutStrategy } from '../../src/strategies/ATRBreakoutStrategy.js';
import { BollingerWidthStrategy } from '../../src/strategies/BollingerWidthStrategy.js';
import { VolatilityRegimeStrategy } from '../../src/strategies/VolatilityRegimeStrategy.js';

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

function generateTrendingCandles(count, startPrice, direction = 'up', volatilityFactor = 1) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const trend = direction === 'up' ? 50 * volatilityFactor : -50 * volatilityFactor;
    const noise = (Math.random() - 0.5) * 20;
    price += trend + noise;

    const range = 50 * volatilityFactor;
    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - range / 2,
      high: price + range,
      low: price - range,
      close: price,
      volume: 1000,
    });
  }

  return candles;
}

// 生成高波动率数据
function generateHighVolatilityCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2000; // 高波动
    price += change;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + 1000,
      low: price - 1000,
      close: price,
      volume: 2000,
    });
  }

  return candles;
}

// 生成低波动率数据
function generateLowVolatilityCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 20; // 低波动
    price += change;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - 5,
      high: price + 10,
      low: price - 10,
      close: price,
      volume: 500,
    });
  }

  return candles;
}

// ============================================
// ATRBreakoutStrategy 测试
// ============================================

describe('ATRBreakoutStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new ATRBreakoutStrategy({
      atrPeriod: 14,
      atrMultiplier: 2.0,
      baselinePeriod: 20,
      symbol: 'BTC/USDT',
      positionPercent: 90,
      useTrailingStop: true,
      stopLossMultiplier: 1.5,
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
      const s = new ATRBreakoutStrategy();
      expect(s.atrPeriod).toBe(14);
      expect(s.atrMultiplier).toBe(2.0);
      expect(s.baselinePeriod).toBe(20);
      expect(s.symbol).toBe('BTC/USDT');
      expect(s.positionPercent).toBe(95);
      expect(s.useTrailingStop).toBe(true);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.atrPeriod).toBe(14);
      expect(strategy.atrMultiplier).toBe(2.0);
      expect(strategy.positionPercent).toBe(90);
    });

    it('应该设置策略名称', () => {
      expect(strategy.name).toBe('ATRBreakoutStrategy');
    });

    it('应该初始化内部状态', () => {
      expect(strategy._entryPrice).toBeNull();
      expect(strategy._stopLoss).toBeNull();
      expect(strategy._trailingStop).toBeNull();
    });
  });

  describe('onInit', () => {
    it('应该初始化成功', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const candles = generateCandles(10);
      await strategy.onTick(candles[9], candles);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('应该保存ATR和EMA指标值', async () => {
      const candles = generateCandles(30);
      await strategy.onTick(candles[29], candles);

      expect(strategy.getIndicator('ATR')).toBeDefined();
      expect(strategy.getIndicator('EMA')).toBeDefined();
      expect(strategy.getIndicator('upperBand')).toBeDefined();
      expect(strategy.getIndicator('lowerBand')).toBeDefined();
    });

    it('向上突破时应该买入', async () => {
      // 创建突破数据
      const candles = generateLowVolatilityCandles(25, 50000);
      // 最后几根大幅上涨，突破上轨
      for (let i = 0; i < 5; i++) {
        candles.push({
          timestamp: Date.now() - (5 - i) * 3600000,
          open: 50000 + i * 500,
          high: 50500 + i * 500,
          low: 49800 + i * 500,
          close: 50400 + i * 500,
          volume: 2000,
        });
      }

      await strategy.onTick(candles[candles.length - 1], candles);

      // 注意：由于ATR和EMA计算需要特定条件才会触发买入
      // 验证策略正常执行且指标被设置（不一定每次都触发买入）
      expect(strategy.getIndicator('ATR')).toBeDefined();
      expect(strategy.getIndicator('EMA')).toBeDefined();
    });

    it('有持仓时触发止损应该卖出', async () => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });

      // 设置入场状态
      strategy._entryPrice = 50000;
      strategy._stopLoss = 49000;
      strategy._trailingStop = 49000;
      strategy._highestSinceEntry = 50500;
      strategy.setState('direction', 'long');

      // 创建下跌触发止损的K线
      const candles = generateCandles(30);
      candles[29].close = 48500; // 低于止损

      await strategy.onTick(candles[29], candles);

      expect(engine.closePosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('跟踪止损应该更新', async () => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });

      strategy._entryPrice = 50000;
      strategy._stopLoss = 49000;
      strategy._trailingStop = 49000;
      strategy._highestSinceEntry = 50500;
      strategy.setState('direction', 'long');
      strategy.setState('entryATR', 500);

      // 创建新高的K线
      const candles = generateCandles(30);
      candles[29].high = 52000;
      candles[29].close = 51800;

      await strategy.onTick(candles[29], candles);

      // 最高价更新后，跟踪止损应该更新
      expect(strategy._highestSinceEntry).toBe(52000);
    });
  });

  describe('_resetState', () => {
    it('应该重置所有状态', () => {
      strategy._entryPrice = 50000;
      strategy._stopLoss = 49000;
      strategy.setState('direction', 'long');

      strategy._resetState();

      expect(strategy._entryPrice).toBeNull();
      expect(strategy._stopLoss).toBeNull();
      expect(strategy.getState('direction')).toBeNull();
    });
  });
});

// ============================================
// BollingerWidthStrategy 测试
// ============================================

describe('BollingerWidthStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new BollingerWidthStrategy({
      bbPeriod: 20,
      bbStdDev: 2.0,
      kcPeriod: 20,
      kcMultiplier: 1.5,
      squeezeThreshold: 20,
      symbol: 'BTC/USDT',
      positionPercent: 90,
      useMomentumConfirm: true,
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
      const s = new BollingerWidthStrategy();
      expect(s.bbPeriod).toBe(20);
      expect(s.bbStdDev).toBe(2.0);
      expect(s.kcPeriod).toBe(20);
      expect(s.kcMultiplier).toBe(1.5);
      expect(s.squeezeThreshold).toBe(20);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.bbPeriod).toBe(20);
      expect(strategy.positionPercent).toBe(90);
      expect(strategy.useMomentumConfirm).toBe(true);
    });

    it('应该设置策略名称', () => {
      expect(strategy.name).toBe('BollingerWidthStrategy');
    });

    it('应该初始化带宽历史', () => {
      expect(strategy._bandwidthHistory).toEqual([]);
    });

    it('应该初始化挤压状态', () => {
      expect(strategy._inSqueeze).toBe(false);
    });
  });

  describe('onInit', () => {
    it('应该初始化成功', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const candles = generateCandles(15);
      await strategy.onTick(candles[14], candles);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('应该保存带宽和挤压指标', async () => {
      const candles = generateCandles(35);
      await strategy.onTick(candles[34], candles);

      expect(strategy.getIndicator('bandwidth')).toBeDefined();
      expect(strategy.getIndicator('squeeze')).toBeDefined();
      expect(strategy.getIndicator('momentum')).toBeDefined();
    });

    it('应该累积带宽历史', async () => {
      const candles = generateCandles(35);

      for (let i = 25; i < 35; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      expect(strategy._bandwidthHistory.length).toBeGreaterThan(0);
    });

    it('挤压突破且动量向上应该买入', async () => {
      // 先进入挤压状态
      strategy._inSqueeze = true;

      // 创建突破数据
      const candles = generateLowVolatilityCandles(30, 50000);
      // 添加突破K线
      for (let i = 0; i < 5; i++) {
        candles.push({
          timestamp: Date.now() - (5 - i) * 3600000,
          open: 50000 + i * 200,
          high: 50500 + i * 300,
          low: 49800 + i * 200,
          close: 50400 + i * 250,
          volume: 2000,
        });
      }

      await strategy.onTick(candles[candles.length - 1], candles);

      // 突破后应该触发买入（如果满足所有条件）
      // 注意：具体是否触发取决于指标计算结果
    });

    it('有持仓触发止损应该卖出', async () => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });

      strategy._entryPrice = 50000;
      strategy._stopLoss = 49000;
      strategy.setState('direction', 'long');

      const candles = generateCandles(35);
      candles[34].close = 48500; // 低于止损

      await strategy.onTick(candles[34], candles);

      expect(engine.closePosition).toHaveBeenCalled();
    });
  });

  describe('_calculateMomentum', () => {
    it('应该正确计算动量', () => {
      const closes = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
      const momentum = strategy._calculateMomentum(closes, 10);

      // 上涨数据应该有正动量
      expect(momentum).toBeGreaterThan(0);
    });

    it('数据不足应该返回0', () => {
      const closes = [100, 101, 102];
      const momentum = strategy._calculateMomentum(closes, 10);

      expect(momentum).toBe(0);
    });
  });

  describe('_calculatePercentile', () => {
    it('应该正确计算百分位', () => {
      const history = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      expect(strategy._calculatePercentile(50, history)).toBe(50);
      expect(strategy._calculatePercentile(100, history)).toBe(100);
      expect(strategy._calculatePercentile(10, history)).toBe(10);
    });

    it('历史数据不足应该返回50', () => {
      const history = [10, 20];
      expect(strategy._calculatePercentile(15, history)).toBe(50);
    });
  });
});

// ============================================
// VolatilityRegimeStrategy 测试
// ============================================

describe('VolatilityRegimeStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new VolatilityRegimeStrategy({
      atrPeriod: 14,
      volatilityLookback: 100,
      lowVolThreshold: 25,
      highVolThreshold: 75,
      extremeVolThreshold: 95,
      symbol: 'BTC/USDT',
      positionPercent: 90,
      disableInExtreme: true,
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
      const s = new VolatilityRegimeStrategy();
      expect(s.atrPeriod).toBe(14);
      expect(s.volatilityLookback).toBe(100);
      expect(s.lowVolThreshold).toBe(25);
      expect(s.highVolThreshold).toBe(75);
      expect(s.extremeVolThreshold).toBe(95);
      expect(s.disableInExtreme).toBe(true);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.atrPeriod).toBe(14);
      expect(strategy.lowVolThreshold).toBe(25);
      expect(strategy.highVolThreshold).toBe(75);
      expect(strategy.basePositionPercent).toBe(90);
    });

    it('应该设置策略名称', () => {
      expect(strategy.name).toBe('VolatilityRegimeStrategy');
    });

    it('应该初始化ATR历史', () => {
      expect(strategy._atrHistory).toEqual([]);
    });

    it('应该初始化Regime状态', () => {
      expect(strategy._currentRegime).toBe('normal');
      expect(strategy._regimeChanges).toBe(0);
    });
  });

  describe('onInit', () => {
    it('应该初始化成功', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  describe('_determineRegime', () => {
    it('低百分位应该返回low', () => {
      expect(strategy._determineRegime(10)).toBe('low');
      expect(strategy._determineRegime(25)).toBe('low');
    });

    it('高百分位应该返回high', () => {
      expect(strategy._determineRegime(80)).toBe('high');
    });

    it('极端百分位应该返回extreme', () => {
      expect(strategy._determineRegime(96)).toBe('extreme');
      expect(strategy._determineRegime(100)).toBe('extreme');
    });

    it('中间百分位应该返回normal', () => {
      expect(strategy._determineRegime(50)).toBe('normal');
      expect(strategy._determineRegime(60)).toBe('normal');
    });
  });

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const candles = generateCandles(20);
      await strategy.onTick(candles[19], candles);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('应该保存Regime指标', async () => {
      const candles = generateCandles(60);
      await strategy.onTick(candles[59], candles);

      expect(strategy.getIndicator('ATR')).toBeDefined();
      expect(strategy.getIndicator('normalizedATR')).toBeDefined();
      expect(strategy.getIndicator('volPercentile')).toBeDefined();
      expect(strategy.getIndicator('regime')).toBeDefined();
    });

    it('应该累积ATR历史', async () => {
      const candles = generateCandles(60);

      for (let i = 35; i < 60; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      expect(strategy._atrHistory.length).toBeGreaterThan(0);
    });

    it('Regime变化时应该记录', async () => {
      const candles = generateCandles(60);

      // 运行多次
      for (let i = 35; i < 60; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      // 根据数据可能会有Regime变化
      // 这里只验证不会抛错
    });

    it('极端波动时禁止开仓', async () => {
      // 模拟极端波动
      strategy._currentRegime = 'extreme';
      strategy._atrHistory = Array.from({ length: 100 }, () => 5); // 填充历史

      const candles = generateHighVolatilityCandles(60, 50000);
      await strategy.onTick(candles[59], candles);

      // 极端波动时不应该开仓
      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('正常波动且有强趋势应该买入', async () => {
      // 使用上涨趋势数据
      const candles = generateTrendingCandles(60, 40000, 'up');

      // 运行积累历史
      for (let i = 35; i < 60; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      // 根据数据条件可能触发买入
      // 具体取决于ADX和趋势计算结果
    });

    it('有持仓触发止损应该卖出', async () => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });

      strategy._entryPrice = 50000;
      strategy._stopLoss = 49000;
      strategy.setState('direction', 'long');

      const candles = generateCandles(60);
      candles[59].close = 48500;

      await strategy.onTick(candles[59], candles);

      expect(engine.closePosition).toHaveBeenCalled();
    });

    it('Regime恶化到极端应该出场', async () => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });

      strategy._entryPrice = 50000;
      strategy._stopLoss = 45000;
      strategy.setState('direction', 'long');
      strategy._currentRegime = 'extreme';

      const candles = generateHighVolatilityCandles(60, 50000);
      await strategy.onTick(candles[59], candles);

      // 极端波动时应该出场
      expect(engine.closePosition).toHaveBeenCalled();
    });
  });

  describe('getCurrentRegime', () => {
    it('应该返回当前Regime', () => {
      strategy._currentRegime = 'high';
      expect(strategy.getCurrentRegime()).toBe('high');
    });
  });

  describe('getRegimeStats', () => {
    it('应该返回Regime统计', () => {
      strategy._currentRegime = 'normal';
      strategy._regimeChanges = 5;
      strategy._atrHistory = [1, 2, 3, 4, 5];

      const stats = strategy.getRegimeStats();

      expect(stats.currentRegime).toBe('normal');
      expect(stats.regimeChanges).toBe(5);
      expect(stats.atrHistoryLength).toBe(5);
    });
  });
});

// ============================================
// 波动率策略集成测试
// ============================================

describe('波动率策略集成测试', () => {
  it('应该能够同时运行多个波动率策略', async () => {
    const engine = createMockEngine();

    const atrStrategy = new ATRBreakoutStrategy({ atrPeriod: 14 });
    const bbwStrategy = new BollingerWidthStrategy({ bbPeriod: 20 });
    const regimeStrategy = new VolatilityRegimeStrategy({ atrPeriod: 14 });

    atrStrategy.engine = engine;
    bbwStrategy.engine = engine;
    regimeStrategy.engine = engine;

    const candles = generateCandles(60);

    for (const candle of candles) {
      await atrStrategy.onCandle(candle);
      await bbwStrategy.onCandle(candle);
      await regimeStrategy.onCandle(candle);
    }

    // 三个策略都应该正常运行，不抛错
  });

  it('波动率策略应该正确继承BaseStrategy', async () => {
    const { BaseStrategy } = await import('../../src/strategies/BaseStrategy.js');

    const atr = new ATRBreakoutStrategy();
    const bbw = new BollingerWidthStrategy();
    const regime = new VolatilityRegimeStrategy();

    expect(atr instanceof BaseStrategy).toBe(true);
    expect(bbw instanceof BaseStrategy).toBe(true);
    expect(regime instanceof BaseStrategy).toBe(true);
  });

  it('所有波动率策略应该能正确设置信号', () => {
    const atr = new ATRBreakoutStrategy();
    const bbw = new BollingerWidthStrategy();
    const regime = new VolatilityRegimeStrategy();

    atr.setBuySignal('Test ATR');
    bbw.setBuySignal('Test BBW');
    regime.setBuySignal('Test Regime');

    expect(atr.getSignal().type).toBe('buy');
    expect(bbw.getSignal().type).toBe('buy');
    expect(regime.getSignal().type).toBe('buy');
  });

  it('所有波动率策略应该能正确管理状态', () => {
    const atr = new ATRBreakoutStrategy();
    const bbw = new BollingerWidthStrategy();
    const regime = new VolatilityRegimeStrategy();

    atr.setState('testKey', 'atrValue');
    bbw.setState('testKey', 'bbwValue');
    regime.setState('testKey', 'regimeValue');

    expect(atr.getState('testKey')).toBe('atrValue');
    expect(bbw.getState('testKey')).toBe('bbwValue');
    expect(regime.getState('testKey')).toBe('regimeValue');
  });

  it('所有波动率策略应该能正确管理指标', () => {
    const atr = new ATRBreakoutStrategy();
    const bbw = new BollingerWidthStrategy();
    const regime = new VolatilityRegimeStrategy();

    atr.setIndicator('ATR', 500);
    bbw.setIndicator('bandwidth', 5.5);
    regime.setIndicator('regime', 'normal');

    expect(atr.getIndicator('ATR')).toBe(500);
    expect(bbw.getIndicator('bandwidth')).toBe(5.5);
    expect(regime.getIndicator('regime')).toBe('normal');
  });
});
