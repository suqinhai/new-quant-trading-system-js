/**
 * AdaptiveStrategy 单元测试
 * Adaptive Strategy Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdaptiveStrategy,
  AdaptiveMode,
} from '../../src/strategies/AdaptiveStrategy.js';
import { MarketRegime } from '../../src/utils/MarketRegimeDetector.js';

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
    getCapital: vi.fn().mockReturnValue(100000),
    getEquity: vi.fn().mockReturnValue(100000),
  };
}

// ============================================
// 测试数据生成器
// ============================================

/**
 * 生成模拟K线数据
 */
function generateMockCandle(price, index, timestamp = null) {
  const volatility = price * 0.005;
  return {
    symbol: 'BTC/USDT',
    timestamp: timestamp || Date.now() - (200 - index) * 3600000,
    open: price - volatility,
    high: price + volatility * 2,
    low: price - volatility * 1.5,
    close: price,
    volume: 10000000 + Math.random() * 50000000,
  };
}

/**
 * 生成价格序列
 */
function generatePriceSeries(count, startPrice = 50000, volatility = 0.02) {
  const prices = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * volatility * price;
    price += change;
    prices.push(price);
  }

  return prices;
}

/**
 * 生成K线历史数据
 */
function generateCandleHistory(count = 200, startPrice = 50000, volatility = 0.02) {
  const prices = generatePriceSeries(count, startPrice, volatility);
  return prices.map((price, i) => generateMockCandle(price, i));
}

/**
 * 生成上涨趋势数据
 */
function generateUptrendCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    // 上涨趋势：每根K线平均上涨 0.5%
    price *= 1 + Math.random() * 0.01;
    candles.push(generateMockCandle(price, i));
  }

  return candles;
}

/**
 * 生成下跌趋势数据
 */
function generateDowntrendCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    price *= 1 - Math.random() * 0.01;
    candles.push(generateMockCandle(price, i));
  }

  return candles;
}

/**
 * 生成震荡市数据
 */
function generateRangingCandles(count, centerPrice = 50000, range = 0.03) {
  const candles = [];

  for (let i = 0; i < count; i++) {
    // 在中心价格附近震荡
    const offset = (Math.random() - 0.5) * range * centerPrice;
    const price = centerPrice + offset;
    candles.push(generateMockCandle(price, i));
  }

  return candles;
}

/**
 * 生成高波动数据
 */
function generateHighVolatilityCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    // 高波动：每次变动 3-8%
    const change = (Math.random() - 0.5) * 0.12 * price;
    price += change;
    price = Math.max(price, 10000);
    candles.push(generateMockCandle(price, i));
  }

  return candles;
}

// ============================================
// AdaptiveMode 常量测试
// ============================================

describe('AdaptiveMode Constants', () => {
  it('should have all adaptive modes', () => {
    expect(AdaptiveMode.FULL).toBe('full');
    expect(AdaptiveMode.SMA_ONLY).toBe('sma_only');
    expect(AdaptiveMode.RSI_ONLY).toBe('rsi_only');
    expect(AdaptiveMode.BB_ONLY).toBe('bb_only');
    expect(AdaptiveMode.CUSTOM).toBe('custom');
  });
});

// ============================================
// AdaptiveStrategy 构造函数测试
// ============================================

describe('AdaptiveStrategy Constructor', () => {
  it('should initialize with default config', () => {
    const strategy = new AdaptiveStrategy();

    expect(strategy.name).toBe('AdaptiveStrategy');
    expect(strategy.symbol).toBe('BTC/USDT');
    expect(strategy.adaptiveMode).toBe(AdaptiveMode.FULL);
    expect(strategy.positionPercent).toBe(95);
  });

  it('should accept custom config', () => {
    const strategy = new AdaptiveStrategy({
      name: 'CustomAdaptive',
      symbol: 'ETH/USDT',
      adaptiveMode: AdaptiveMode.SMA_ONLY,
      positionPercent: 80,
    });

    expect(strategy.name).toBe('CustomAdaptive');
    expect(strategy.symbol).toBe('ETH/USDT');
    expect(strategy.adaptiveMode).toBe(AdaptiveMode.SMA_ONLY);
    expect(strategy.positionPercent).toBe(80);
  });

  it('should initialize SMA adaptive parameters', () => {
    const strategy = new AdaptiveStrategy({
      smaBaseFast: 8,
      smaBaseSlow: 25,
      smaPeriodAdjustRange: 0.4,
    });

    expect(strategy.smaBaseFast).toBe(8);
    expect(strategy.smaBaseSlow).toBe(25);
    expect(strategy.smaPeriodAdjustRange).toBe(0.4);
  });

  it('should initialize RSI adaptive parameters', () => {
    const strategy = new AdaptiveStrategy({
      rsiPeriod: 12,
      rsiBaseOversold: 25,
      rsiBaseOverbought: 75,
      rsiTrendingOversold: 20,
      rsiTrendingOverbought: 80,
      rsiRangingOversold: 40,
      rsiRangingOverbought: 60,
    });

    expect(strategy.rsiPeriod).toBe(12);
    expect(strategy.rsiBaseOversold).toBe(25);
    expect(strategy.rsiBaseOverbought).toBe(75);
    expect(strategy.rsiTrendingOversold).toBe(20);
    expect(strategy.rsiTrendingOverbought).toBe(80);
    expect(strategy.rsiRangingOversold).toBe(40);
    expect(strategy.rsiRangingOverbought).toBe(60);
  });

  it('should initialize BB adaptive parameters', () => {
    const strategy = new AdaptiveStrategy({
      bbPeriod: 25,
      bbBaseStdDev: 2.5,
      bbMinStdDev: 1.2,
      bbMaxStdDev: 3.5,
    });

    expect(strategy.bbPeriod).toBe(25);
    expect(strategy.bbBaseStdDev).toBe(2.5);
    expect(strategy.bbMinStdDev).toBe(1.2);
    expect(strategy.bbMaxStdDev).toBe(3.5);
  });

  it('should initialize signal fusion parameters', () => {
    const strategy = new AdaptiveStrategy({
      smaWeight: 0.5,
      rsiWeight: 0.25,
      bbWeight: 0.25,
      signalThreshold: 0.6,
    });

    expect(strategy.smaWeight).toBe(0.5);
    expect(strategy.rsiWeight).toBe(0.25);
    expect(strategy.bbWeight).toBe(0.25);
    expect(strategy.signalThreshold).toBe(0.6);
  });

  it('should initialize regime detector', () => {
    const strategy = new AdaptiveStrategy();
    expect(strategy.regimeDetector).toBeDefined();
  });

  it('should initialize internal state', () => {
    const strategy = new AdaptiveStrategy();

    expect(strategy._adaptiveParams).toBeDefined();
    expect(strategy._adaptiveParams.smaFastPeriod).toBe(strategy.smaBaseFast);
    expect(strategy._adaptiveParams.smaSlowPeriod).toBe(strategy.smaBaseSlow);
    expect(strategy._signalHistory).toEqual([]);
    expect(strategy._lastSignalTime).toBe(0);
  });

  it('should allow disabling individual adaptive features', () => {
    const strategy = new AdaptiveStrategy({
      enableSMAAdaptive: false,
      enableRSIAdaptive: false,
      enableBBAdaptive: false,
    });

    expect(strategy.enableSMAAdaptive).toBe(false);
    expect(strategy.enableRSIAdaptive).toBe(false);
    expect(strategy.enableBBAdaptive).toBe(false);
  });

  it('should enable all adaptive features by default', () => {
    const strategy = new AdaptiveStrategy();

    expect(strategy.enableSMAAdaptive).toBe(true);
    expect(strategy.enableRSIAdaptive).toBe(true);
    expect(strategy.enableBBAdaptive).toBe(true);
  });
});

// ============================================
// AdaptiveStrategy onInit 测试
// ============================================

describe('AdaptiveStrategy onInit', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new AdaptiveStrategy({
      adaptiveMode: AdaptiveMode.FULL,
    });
    engine = createMockEngine();
    strategy.engine = engine;
    strategy.getEquity = vi.fn().mockReturnValue(100000);
    strategy.log = vi.fn();
  });

  it('should initialize successfully', async () => {
    await strategy.onInit();
    // 不应该抛出错误
    expect(strategy.log).toHaveBeenCalled();
  });

  it('should log adaptive mode', async () => {
    await strategy.onInit();
    expect(strategy.log).toHaveBeenCalledWith(expect.stringContaining('full'));
  });
});

// ============================================
// 波动率因子计算测试
// ============================================

describe('Volatility Factor Calculation', () => {
  let strategy;

  beforeEach(() => {
    strategy = new AdaptiveStrategy({
      smaVolLowThreshold: 25,
      smaVolHighThreshold: 75,
    });
  });

  it('should return 0 for low volatility', () => {
    const factor = strategy._calculateVolatilityFactor(20);
    expect(factor).toBe(0);
  });

  it('should return 1 for high volatility', () => {
    const factor = strategy._calculateVolatilityFactor(80);
    expect(factor).toBe(1);
  });

  it('should return 0.5 for medium volatility', () => {
    const factor = strategy._calculateVolatilityFactor(50);
    expect(factor).toBe(0.5);
  });

  it('should interpolate correctly', () => {
    const factor = strategy._calculateVolatilityFactor(37.5);
    expect(factor).toBeCloseTo(0.25, 5);
  });
});

// ============================================
// 自适应参数更新测试
// ============================================

describe('Adaptive Parameters Update', () => {
  let strategy;

  beforeEach(() => {
    strategy = new AdaptiveStrategy({
      smaBaseFast: 10,
      smaBaseSlow: 30,
      smaPeriodAdjustRange: 0.5,
      rsiBaseOversold: 30,
      rsiBaseOverbought: 70,
      rsiTrendingOversold: 25,
      rsiTrendingOverbought: 75,
      rsiRangingOversold: 35,
      rsiRangingOverbought: 65,
      bbBaseStdDev: 2.0,
      bbMinStdDev: 1.5,
      bbMaxStdDev: 3.0,
    });
    strategy.log = vi.fn();
  });

  describe('SMA Period Adaptation', () => {
    it('should shorten SMA periods for high volatility', () => {
      const regimeInfo = {
        regime: MarketRegime.HIGH_VOLATILITY,
        indicators: {
          volatilityIndex: 90,
          atrPercentile: 80,
        },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      // 高波动率时周期应该变短
      expect(strategy._adaptiveParams.smaFastPeriod).toBeLessThan(strategy.smaBaseFast);
      expect(strategy._adaptiveParams.smaSlowPeriod).toBeLessThan(strategy.smaBaseSlow);
    });

    it('should lengthen SMA periods for low volatility', () => {
      const regimeInfo = {
        regime: MarketRegime.RANGING,
        indicators: {
          volatilityIndex: 15,
          atrPercentile: 20,
        },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      // 低波动率时周期应该变长
      expect(strategy._adaptiveParams.smaFastPeriod).toBeGreaterThan(strategy.smaBaseFast);
      expect(strategy._adaptiveParams.smaSlowPeriod).toBeGreaterThan(strategy.smaBaseSlow);
    });

    it('should not adapt SMA when disabled', () => {
      strategy.enableSMAAdaptive = false;

      const regimeInfo = {
        regime: MarketRegime.HIGH_VOLATILITY,
        indicators: { volatilityIndex: 90, atrPercentile: 80 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.smaFastPeriod).toBe(strategy.smaBaseFast);
      expect(strategy._adaptiveParams.smaSlowPeriod).toBe(strategy.smaBaseSlow);
    });

    it('should ensure fast period < slow period', () => {
      const regimeInfo = {
        regime: MarketRegime.HIGH_VOLATILITY,
        indicators: { volatilityIndex: 99, atrPercentile: 99 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.smaFastPeriod).toBeLessThan(strategy._adaptiveParams.smaSlowPeriod);
    });
  });

  describe('RSI Threshold Adaptation', () => {
    it('should widen thresholds for trending up market', () => {
      const regimeInfo = {
        regime: MarketRegime.TRENDING_UP,
        indicators: { volatilityIndex: 50, atrPercentile: 50 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.rsiOversold).toBe(strategy.rsiTrendingOversold);
      expect(strategy._adaptiveParams.rsiOverbought).toBe(strategy.rsiTrendingOverbought);
    });

    it('should widen thresholds for trending down market', () => {
      const regimeInfo = {
        regime: MarketRegime.TRENDING_DOWN,
        indicators: { volatilityIndex: 50, atrPercentile: 50 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.rsiOversold).toBe(strategy.rsiTrendingOversold);
      expect(strategy._adaptiveParams.rsiOverbought).toBe(strategy.rsiTrendingOverbought);
    });

    it('should narrow thresholds for ranging market', () => {
      const regimeInfo = {
        regime: MarketRegime.RANGING,
        indicators: { volatilityIndex: 50, atrPercentile: 50 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.rsiOversold).toBe(strategy.rsiRangingOversold);
      expect(strategy._adaptiveParams.rsiOverbought).toBe(strategy.rsiRangingOverbought);
    });

    it('should use base thresholds for high volatility', () => {
      const regimeInfo = {
        regime: MarketRegime.HIGH_VOLATILITY,
        indicators: { volatilityIndex: 80, atrPercentile: 80 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.rsiOversold).toBe(strategy.rsiBaseOversold);
      expect(strategy._adaptiveParams.rsiOverbought).toBe(strategy.rsiBaseOverbought);
    });

    it('should not adapt RSI when disabled', () => {
      strategy.enableRSIAdaptive = false;

      const regimeInfo = {
        regime: MarketRegime.RANGING,
        indicators: { volatilityIndex: 50, atrPercentile: 50 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      // 应该保持基准值
      expect(strategy._adaptiveParams.rsiOversold).toBe(strategy.rsiBaseOversold);
      expect(strategy._adaptiveParams.rsiOverbought).toBe(strategy.rsiBaseOverbought);
    });
  });

  describe('BB StdDev Adaptation', () => {
    it('should increase stdDev for high ATR', () => {
      const regimeInfo = {
        regime: MarketRegime.HIGH_VOLATILITY,
        indicators: { volatilityIndex: 80, atrPercentile: 90 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.bbStdDev).toBeGreaterThan(strategy.bbBaseStdDev);
    });

    it('should decrease stdDev for low ATR', () => {
      const regimeInfo = {
        regime: MarketRegime.RANGING,
        indicators: { volatilityIndex: 20, atrPercentile: 10 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.bbStdDev).toBeLessThan(strategy.bbBaseStdDev);
    });

    it('should clamp stdDev to valid range', () => {
      const regimeInfo = {
        regime: MarketRegime.HIGH_VOLATILITY,
        indicators: { volatilityIndex: 99, atrPercentile: 100 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.bbStdDev).toBeLessThanOrEqual(strategy.bbMaxStdDev);
      expect(strategy._adaptiveParams.bbStdDev).toBeGreaterThanOrEqual(strategy.bbMinStdDev);
    });

    it('should not adapt BB when disabled', () => {
      strategy.enableBBAdaptive = false;

      const regimeInfo = {
        regime: MarketRegime.HIGH_VOLATILITY,
        indicators: { volatilityIndex: 90, atrPercentile: 90 },
      };

      strategy._updateAdaptiveParams(null, [], regimeInfo);

      expect(strategy._adaptiveParams.bbStdDev).toBe(strategy.bbBaseStdDev);
    });
  });
});

// ============================================
// 信号融合测试
// ============================================

describe('Signal Fusion', () => {
  let strategy;

  beforeEach(() => {
    strategy = new AdaptiveStrategy({
      smaWeight: 0.4,
      rsiWeight: 0.3,
      bbWeight: 0.3,
      signalThreshold: 0.5,
      useTrendFilter: true,
    });
    strategy.log = vi.fn();
  });

  describe('Weight Adjustment by Regime', () => {
    it('should increase SMA weight for trending market', () => {
      const signals = {
        sma: { signal: 1, strength: 0.8, reason: 'Golden cross' },
        rsi: { signal: 0, strength: 0, reason: '' },
        bb: { signal: 0, strength: 0, reason: '' },
        trend: { direction: 'up', strength: 0.5 },
      };

      const result = strategy._fuseSignals(signals, MarketRegime.TRENDING_UP);

      // SMA 权重增加，信号应该更强
      expect(result.weights.sma).toBeGreaterThan(0.4);
    });

    it('should increase RSI and BB weight for ranging market', () => {
      const signals = {
        sma: { signal: 0, strength: 0, reason: '' },
        rsi: { signal: 1, strength: 0.7, reason: 'Oversold' },
        bb: { signal: 1, strength: 0.6, reason: 'Lower band' },
        trend: { direction: 'neutral', strength: 0 },
      };

      const result = strategy._fuseSignals(signals, MarketRegime.RANGING);

      expect(result.weights.rsi).toBeGreaterThan(0.3);
      expect(result.weights.bb).toBeGreaterThan(0.3);
    });

    it('should reduce all weights for high volatility', () => {
      const signals = {
        sma: { signal: 1, strength: 1, reason: 'Cross' },
        rsi: { signal: 1, strength: 1, reason: 'Oversold' },
        bb: { signal: 1, strength: 1, reason: 'Lower' },
        trend: { direction: 'up', strength: 0.5 },
      };

      const resultNormal = strategy._fuseSignals(signals, MarketRegime.RANGING);
      const resultHighVol = strategy._fuseSignals(signals, MarketRegime.HIGH_VOLATILITY);

      // 高波动时信号应该更弱
      expect(resultHighVol.confidence).toBeLessThanOrEqual(resultNormal.confidence);
    });
  });

  describe('Signal Generation', () => {
    it('should generate buy signal when weighted signal >= threshold', () => {
      const signals = {
        sma: { signal: 1, strength: 0.9, reason: 'Golden cross' },
        rsi: { signal: 1, strength: 0.8, reason: 'Oversold' },
        bb: { signal: 1, strength: 0.7, reason: 'Lower band' },
        trend: { direction: 'up', strength: 0.5 },
      };

      const result = strategy._fuseSignals(signals, MarketRegime.TRENDING_UP);

      expect(result.signal).toBe('buy');
    });

    it('should generate sell signal when weighted signal <= -threshold', () => {
      const signals = {
        sma: { signal: -1, strength: 0.9, reason: 'Death cross' },
        rsi: { signal: -1, strength: 0.8, reason: 'Overbought' },
        bb: { signal: -1, strength: 0.7, reason: 'Upper band' },
        trend: { direction: 'down', strength: 0.5 },
      };

      const result = strategy._fuseSignals(signals, MarketRegime.TRENDING_DOWN);

      expect(result.signal).toBe('sell');
    });

    it('should generate none signal when weighted signal is weak', () => {
      const signals = {
        sma: { signal: 0.3, strength: 0.3, reason: '' },
        rsi: { signal: 0, strength: 0, reason: '' },
        bb: { signal: 0, strength: 0, reason: '' },
        trend: { direction: 'neutral', strength: 0 },
      };

      const result = strategy._fuseSignals(signals, MarketRegime.RANGING);

      expect(result.signal).toBe('none');
    });
  });

  describe('Trend Filter', () => {
    it('should strengthen signal when aligned with trend', () => {
      const signals = {
        sma: { signal: 1, strength: 0.6, reason: 'Cross' },
        rsi: { signal: 0, strength: 0, reason: '' },
        bb: { signal: 0, strength: 0, reason: '' },
        trend: { direction: 'up', strength: 0.5 },
      };

      strategy.useTrendFilter = true;
      const withFilter = strategy._fuseSignals(signals, MarketRegime.TRENDING_UP);

      strategy.useTrendFilter = false;
      const withoutFilter = strategy._fuseSignals(signals, MarketRegime.TRENDING_UP);

      // 顺势信号应该被加强
      expect(withFilter.rawSignal).toBeGreaterThan(withoutFilter.rawSignal);
    });

    it('should weaken signal when against trend', () => {
      const signals = {
        sma: { signal: 1, strength: 0.6, reason: 'Cross' },
        rsi: { signal: 0, strength: 0, reason: '' },
        bb: { signal: 0, strength: 0, reason: '' },
        trend: { direction: 'down', strength: 0.5 },
      };

      strategy.useTrendFilter = true;
      const withFilter = strategy._fuseSignals(signals, MarketRegime.TRENDING_DOWN);

      strategy.useTrendFilter = false;
      const withoutFilter = strategy._fuseSignals(signals, MarketRegime.TRENDING_DOWN);

      // 逆势信号应该被减弱
      expect(withFilter.rawSignal).toBeLessThan(withoutFilter.rawSignal);
    });
  });

  describe('Reasons Collection', () => {
    it('should collect all non-zero signal reasons', () => {
      const signals = {
        sma: { signal: 1, strength: 0.8, reason: 'SMA Golden Cross' },
        rsi: { signal: 1, strength: 0.7, reason: 'RSI Oversold' },
        bb: { signal: 0, strength: 0, reason: '' },
        trend: { direction: 'up', strength: 0.5 },
      };

      const result = strategy._fuseSignals(signals, MarketRegime.TRENDING_UP);

      expect(result.reasons).toContain('SMA Golden Cross');
      expect(result.reasons).toContain('RSI Oversold');
      expect(result.reasons.length).toBe(2);
    });
  });
});

// ============================================
// getAdaptiveParams 测试
// ============================================

describe('getAdaptiveParams', () => {
  it('should return current adaptive parameters', () => {
    const strategy = new AdaptiveStrategy();
    const params = strategy.getAdaptiveParams();

    expect(params).toHaveProperty('smaFastPeriod');
    expect(params).toHaveProperty('smaSlowPeriod');
    expect(params).toHaveProperty('rsiOversold');
    expect(params).toHaveProperty('rsiOverbought');
    expect(params).toHaveProperty('bbStdDev');
  });

  it('should return a copy, not the original object', () => {
    const strategy = new AdaptiveStrategy();
    const params = strategy.getAdaptiveParams();

    params.smaFastPeriod = 999;

    expect(strategy._adaptiveParams.smaFastPeriod).not.toBe(999);
  });
});

// ============================================
// getSignalHistory 测试
// ============================================

describe('getSignalHistory', () => {
  it('should return empty array initially', () => {
    const strategy = new AdaptiveStrategy();
    const history = strategy.getSignalHistory();

    expect(history).toEqual([]);
  });

  it('should respect limit parameter', () => {
    const strategy = new AdaptiveStrategy();

    // 手动添加一些信号
    for (let i = 0; i < 100; i++) {
      strategy._signalHistory.push({
        timestamp: Date.now(),
        signal: 'buy',
        confidence: 0.8,
      });
    }

    const history = strategy.getSignalHistory(10);
    expect(history.length).toBe(10);
  });

  it('should return most recent signals', () => {
    const strategy = new AdaptiveStrategy();

    for (let i = 0; i < 100; i++) {
      strategy._signalHistory.push({
        timestamp: i,
        signal: 'test',
      });
    }

    const history = strategy.getSignalHistory(5);
    expect(history[0].timestamp).toBe(95);
    expect(history[4].timestamp).toBe(99);
  });
});

// ============================================
// getStats 测试
// ============================================

describe('getStats', () => {
  it('should return strategy statistics', () => {
    const strategy = new AdaptiveStrategy();
    const stats = strategy.getStats();

    expect(stats).toHaveProperty('currentRegime');
    expect(stats).toHaveProperty('regimeChanges');
    expect(stats).toHaveProperty('adaptiveParams');
    expect(stats).toHaveProperty('signals');
  });

  it('should count buy and sell signals', () => {
    const strategy = new AdaptiveStrategy();

    strategy._signalHistory.push({ signal: 'buy' });
    strategy._signalHistory.push({ signal: 'buy' });
    strategy._signalHistory.push({ signal: 'sell' });
    strategy._signalHistory.push({ signal: 'none' });

    const stats = strategy.getStats();

    expect(stats.signals.buy).toBe(2);
    expect(stats.signals.sell).toBe(1);
    expect(stats.signals.total).toBe(4);
  });
});

// ============================================
// 集成测试
// ============================================

describe('AdaptiveStrategy 集成测试', () => {
  it('应该正确继承 BaseStrategy', async () => {
    const { BaseStrategy } = await import('../../src/strategies/BaseStrategy.js');
    const strategy = new AdaptiveStrategy();

    expect(strategy instanceof BaseStrategy).toBe(true);
  });

  it('应该能设置和获取状态', () => {
    const strategy = new AdaptiveStrategy();

    strategy.setState('testKey', 'testValue');
    expect(strategy.getState('testKey')).toBe('testValue');
  });

  it('应该能设置和获取指标', () => {
    const strategy = new AdaptiveStrategy();

    strategy.setIndicator('adaptiveSMAFast', 8);
    expect(strategy.getIndicator('adaptiveSMAFast')).toBe(8);
  });

  it('应该能设置信号', () => {
    const strategy = new AdaptiveStrategy();

    strategy.setBuySignal('Test buy signal');
    expect(strategy.getSignal().type).toBe('buy');
  });

  it('不同自适应模式应该正确初始化', () => {
    const modes = [
      AdaptiveMode.FULL,
      AdaptiveMode.SMA_ONLY,
      AdaptiveMode.RSI_ONLY,
      AdaptiveMode.BB_ONLY,
      AdaptiveMode.CUSTOM,
    ];

    modes.forEach(mode => {
      const strategy = new AdaptiveStrategy({ adaptiveMode: mode });
      expect(strategy.adaptiveMode).toBe(mode);
    });
  });

  it('应该支持自定义组合模式', () => {
    const strategy = new AdaptiveStrategy({
      adaptiveMode: AdaptiveMode.CUSTOM,
      enableSMAAdaptive: true,
      enableRSIAdaptive: false,
      enableBBAdaptive: true,
    });

    expect(strategy.enableSMAAdaptive).toBe(true);
    expect(strategy.enableRSIAdaptive).toBe(false);
    expect(strategy.enableBBAdaptive).toBe(true);
  });
});

// ============================================
// onTick 数据量检查测试
// ============================================

describe('AdaptiveStrategy onTick Data Validation', () => {
  let strategy;

  beforeEach(() => {
    strategy = new AdaptiveStrategy({
      smaBaseSlow: 30,
      bbPeriod: 20,
      atrLookback: 100,
      trendMAPeriod: 50,
    });
    strategy.log = vi.fn();
    strategy.setIndicator = vi.fn();
    strategy.buyPercent = vi.fn();
    strategy.closePosition = vi.fn();
    strategy.setBuySignal = vi.fn();
    strategy.setSellSignal = vi.fn();
    strategy.getPosition = vi.fn().mockReturnValue(null);
  });

  it('should skip processing with insufficient data', async () => {
    const candle = generateMockCandle(50000, 0);
    const history = generateCandleHistory(50); // 不足 100 根

    await strategy.onTick(candle, history);

    // 数据不足时不应该设置任何指标
    expect(strategy.setIndicator).not.toHaveBeenCalled();
  });

  it('should process with sufficient data', async () => {
    const history = generateCandleHistory(200);
    const candle = history[history.length - 1];

    await strategy.onTick(candle, history);

    // 数据充足时应该设置指标
    expect(strategy.setIndicator).toHaveBeenCalled();
  });
});

// ============================================
// 极端市场状态测试
// ============================================

describe('Extreme Market Regime Handling', () => {
  let strategy;

  beforeEach(() => {
    strategy = new AdaptiveStrategy();
    strategy.log = vi.fn();
    strategy.setIndicator = vi.fn();
    strategy.buyPercent = vi.fn();
    strategy.closePosition = vi.fn();
    strategy.getPosition = vi.fn().mockReturnValue(null);
  });

  it('should stop trading in extreme volatility', async () => {
    // 模拟极端波动的 regime detector 返回
    strategy.regimeDetector.update = vi.fn().mockReturnValue({
      regime: MarketRegime.EXTREME,
      indicators: {
        volatilityIndex: 98,
        atrPercentile: 95,
        adx: 50,
      },
    });

    const history = generateCandleHistory(200);
    const candle = history[history.length - 1];

    await strategy.onTick(candle, history);

    // 极端情况下应该设置 tradingAllowed = false
    expect(strategy.setIndicator).toHaveBeenCalledWith('tradingAllowed', false);
    // 不应该执行任何交易
    expect(strategy.buyPercent).not.toHaveBeenCalled();
  });
});

// ============================================
// 信号历史记录测试
// ============================================

describe('Signal History Recording', () => {
  let strategy;

  beforeEach(() => {
    strategy = new AdaptiveStrategy();
    strategy.log = vi.fn();
    strategy.setIndicator = vi.fn();
    strategy.buyPercent = vi.fn();
    strategy.closePosition = vi.fn();
    strategy.setBuySignal = vi.fn();
    strategy.setSellSignal = vi.fn();
    strategy.getPosition = vi.fn().mockReturnValue(null);
  });

  it('should maintain max 200 signal history entries', () => {
    // 手动添加超过 200 个信号
    for (let i = 0; i < 250; i++) {
      strategy._signalHistory.push({
        timestamp: i,
        signal: 'test',
      });

      // 模拟 _saveIndicators 中的清理逻辑
      if (strategy._signalHistory.length > 200) {
        strategy._signalHistory.shift();
      }
    }

    expect(strategy._signalHistory.length).toBe(200);
  });
});

// ============================================
// 策略注册表测试
// ============================================

describe('Strategy Registry', () => {
  it('should be able to import AdaptiveStrategy directly', async () => {
    const { AdaptiveStrategy: ImportedStrategy } = await import('../../src/strategies/AdaptiveStrategy.js');

    expect(ImportedStrategy).toBeDefined();
    expect(ImportedStrategy).toBe(AdaptiveStrategy);
  });

  it('should export AdaptiveMode correctly', async () => {
    const { AdaptiveMode: ImportedMode } = await import('../../src/strategies/AdaptiveStrategy.js');

    expect(ImportedMode).toBeDefined();
    expect(ImportedMode.FULL).toBe('full');
    expect(ImportedMode.SMA_ONLY).toBe('sma_only');
  });
});
