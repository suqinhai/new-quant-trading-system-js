/**
 * StatisticalArbitrageStrategy 单元测试
 * Statistical Arbitrage Strategy Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  StatisticalArbitrageStrategy,
  PriceSeriesStore,
  StatisticalCalculator,
  PairManager,
  SpreadCalculator,
  STAT_ARB_TYPE,
  PAIR_STATUS,
  SIGNAL_TYPE,
  STAT_ARB_DEFAULT_CONFIG,
} from '../../src/strategies/StatisticalArbitrageStrategy.js';

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
 * 生成协整的配对资产价格数据
 */
function generateCointegratedPrices(count, correlation = 0.85) {
  const pricesA = [];
  const pricesB = [];

  let priceA = 50000;
  let priceB = 3000;
  const beta = 16.5;

  let spreadDeviation = 0;
  const spreadStd = priceB * 0.02;
  const meanReversionSpeed = 0.1;

  for (let i = 0; i < count; i++) {
    const commonFactor = (Math.random() - 0.5) * priceA * 0.01;
    const idioA = (Math.random() - 0.5) * priceA * 0.005;
    const idioB = (Math.random() - 0.5) * priceB * 0.005;

    spreadDeviation = spreadDeviation * (1 - meanReversionSpeed) +
                      (Math.random() - 0.5) * spreadStd * 0.5;

    priceA += commonFactor + idioA;
    priceB += (commonFactor / beta) + idioB + spreadDeviation / beta;

    pricesA.push(priceA);
    pricesB.push(priceB);
  }

  return { pricesA, pricesB };
}

/**
 * 生成模拟K线数据
 */
function generateMockCandle(symbol, price, index) {
  const volatility = price * 0.005;
  return {
    symbol,
    timestamp: Date.now() - (100 - index) * 3600000,
    open: price - volatility,
    high: price + volatility,
    low: price - volatility * 1.5,
    close: price,
    volume: 10000000 + Math.random() * 50000000,
  };
}

/**
 * 生成配对K线历史数据
 */
function generatePairCandleHistory(count = 150) {
  const { pricesA, pricesB } = generateCointegratedPrices(count);

  const historyA = pricesA.map((price, i) => generateMockCandle('BTC/USDT', price, i));
  const historyB = pricesB.map((price, i) => generateMockCandle('ETH/USDT', price, i));

  return { historyA, historyB };
}

// ============================================
// PriceSeriesStore 测试
// ============================================

describe('PriceSeriesStore', () => {
  let store;

  beforeEach(() => {
    store = new PriceSeriesStore(100);
  });

  describe('Constructor', () => {
    it('should initialize with correct maxLength', () => {
      expect(store.maxLength).toBe(100);
      expect(store.series.size).toBe(0);
    });

    it('should use default maxLength if not specified', () => {
      const defaultStore = new PriceSeriesStore();
      expect(defaultStore.maxLength).toBe(500);
    });
  });

  describe('addPrice', () => {
    it('should add price to new symbol', () => {
      store.addPrice('BTC/USDT', 50000);

      expect(store.series.has('BTC/USDT')).toBe(true);
      expect(store.series.get('BTC/USDT').prices.length).toBe(1);
    });

    it('should append price to existing symbol', () => {
      store.addPrice('BTC/USDT', 50000);
      store.addPrice('BTC/USDT', 50100);
      store.addPrice('BTC/USDT', 50200);

      expect(store.series.get('BTC/USDT').prices.length).toBe(3);
    });

    it('should maintain maxLength limit', () => {
      const smallStore = new PriceSeriesStore(5);

      for (let i = 0; i < 10; i++) {
        smallStore.addPrice('BTC/USDT', 50000 + i * 100);
      }

      expect(smallStore.series.get('BTC/USDT').prices.length).toBe(5);
    });

    it('should record timestamps', () => {
      const timestamp = Date.now();
      store.addPrice('BTC/USDT', 50000, timestamp);

      expect(store.series.get('BTC/USDT').timestamps[0]).toBe(timestamp);
    });
  });

  describe('getPrices', () => {
    beforeEach(() => {
      for (let i = 0; i < 20; i++) {
        store.addPrice('BTC/USDT', 50000 + i * 100);
      }
    });

    it('should return all prices', () => {
      const prices = store.getPrices('BTC/USDT');
      expect(prices.length).toBe(20);
    });

    it('should return limited prices when length specified', () => {
      const prices = store.getPrices('BTC/USDT', 10);
      expect(prices.length).toBe(10);
    });

    it('should return empty array for unknown symbol', () => {
      const prices = store.getPrices('UNKNOWN/USDT');
      expect(prices).toEqual([]);
    });
  });

  describe('getLatestPrice', () => {
    it('should return latest price', () => {
      store.addPrice('BTC/USDT', 50000);
      store.addPrice('BTC/USDT', 50100);
      store.addPrice('BTC/USDT', 50200);

      expect(store.getLatestPrice('BTC/USDT')).toBe(50200);
    });

    it('should return null for unknown symbol', () => {
      expect(store.getLatestPrice('UNKNOWN/USDT')).toBeNull();
    });
  });

  describe('hasEnoughData', () => {
    beforeEach(() => {
      for (let i = 0; i < 50; i++) {
        store.addPrice('BTC/USDT', 50000 + i * 100);
      }
    });

    it('should return true when enough data', () => {
      expect(store.hasEnoughData('BTC/USDT', 30)).toBe(true);
    });

    it('should return false when not enough data', () => {
      expect(store.hasEnoughData('BTC/USDT', 100)).toBe(false);
    });

    it('should return false for unknown symbol', () => {
      expect(store.hasEnoughData('UNKNOWN/USDT', 10)).toBeFalsy();
    });
  });

  describe('getReturns', () => {
    beforeEach(() => {
      store.addPrice('BTC/USDT', 100);
      store.addPrice('BTC/USDT', 110);
      store.addPrice('BTC/USDT', 121);
      store.addPrice('BTC/USDT', 133.1);
    });

    it('should calculate returns correctly', () => {
      const returns = store.getReturns('BTC/USDT');

      expect(returns.length).toBe(3);
      expect(returns[0]).toBeCloseTo(0.1, 2);  // (110-100)/100
      expect(returns[1]).toBeCloseTo(0.1, 2);  // (121-110)/110
    });

    it('should return empty array for unknown symbol', () => {
      expect(store.getReturns('UNKNOWN/USDT')).toEqual([]);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      store.addPrice('BTC/USDT', 50000);
      store.addPrice('ETH/USDT', 3000);
    });

    it('should clear specific symbol', () => {
      store.clear('BTC/USDT');

      expect(store.series.has('BTC/USDT')).toBe(false);
      expect(store.series.has('ETH/USDT')).toBe(true);
    });

    it('should clear all symbols', () => {
      store.clear();

      expect(store.series.size).toBe(0);
    });
  });
});

// ============================================
// StatisticalCalculator 测试
// ============================================

describe('StatisticalCalculator', () => {
  describe('mean', () => {
    it('should calculate mean correctly', () => {
      expect(StatisticalCalculator.mean([1, 2, 3, 4, 5])).toBe(3);
      expect(StatisticalCalculator.mean([10, 20, 30])).toBe(20);
    });

    it('should return 0 for empty array', () => {
      expect(StatisticalCalculator.mean([])).toBe(0);
    });
  });

  describe('std', () => {
    it('should calculate standard deviation correctly', () => {
      const data = [2, 4, 4, 4, 5, 5, 7, 9];
      const std = StatisticalCalculator.std(data);
      expect(std).toBeCloseTo(2, 0);
    });

    it('should return 0 for single element', () => {
      expect(StatisticalCalculator.std([5])).toBe(0);
    });
  });

  describe('zScore', () => {
    it('should calculate z-score correctly', () => {
      expect(StatisticalCalculator.zScore(100, 80, 10)).toBe(2);
      expect(StatisticalCalculator.zScore(60, 80, 10)).toBe(-2);
    });

    it('should return 0 when std is 0', () => {
      expect(StatisticalCalculator.zScore(100, 80, 0)).toBe(0);
    });
  });

  describe('correlation', () => {
    it('should calculate correlation for identical series', () => {
      const series = [1, 2, 3, 4, 5];
      const corr = StatisticalCalculator.correlation(series, series);
      expect(corr).toBeCloseTo(1, 5);
    });

    it('should calculate correlation for perfectly negative series', () => {
      const seriesA = [1, 2, 3, 4, 5];
      const seriesB = [5, 4, 3, 2, 1];
      const corr = StatisticalCalculator.correlation(seriesA, seriesB);
      expect(corr).toBeCloseTo(-1, 5);
    });

    it('should return 0 for insufficient data', () => {
      expect(StatisticalCalculator.correlation([1], [2])).toBe(0);
    });

    it('should handle different length series', () => {
      const seriesA = [1, 2, 3, 4, 5, 6];
      const seriesB = [1, 2, 3, 4, 5];
      const corr = StatisticalCalculator.correlation(seriesA, seriesB);
      expect(corr).toBeCloseTo(1, 5);
    });
  });

  describe('ols', () => {
    it('should calculate OLS regression correctly', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10]; // y = 2x

      const result = StatisticalCalculator.ols(x, y);

      expect(result.beta).toBeCloseTo(2, 5);
      expect(result.alpha).toBeCloseTo(0, 5);
      expect(result.residuals.length).toBe(5);
    });

    it('should calculate residuals correctly', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [3, 5, 7, 9, 11]; // y = 2x + 1

      const result = StatisticalCalculator.ols(x, y);

      result.residuals.forEach(r => {
        expect(Math.abs(r)).toBeLessThan(0.0001);
      });
    });
  });

  describe('adfTest', () => {
    it('should detect stationary series', () => {
      // 生成均值回归序列
      const series = [];
      let value = 0;
      for (let i = 0; i < 100; i++) {
        value = value * 0.5 + (Math.random() - 0.5) * 2;
        series.push(value);
      }

      const result = StatisticalCalculator.adfTest(series, 0.05);

      expect(result).toHaveProperty('isStationary');
      expect(result).toHaveProperty('testStat');
      expect(result).toHaveProperty('criticalValue');
      expect(result).toHaveProperty('pValue');
    });

    it('should return non-stationary for short series', () => {
      const result = StatisticalCalculator.adfTest([1, 2, 3, 4, 5], 0.05);

      expect(result.isStationary).toBe(false);
      expect(result.pValue).toBe(1);
    });
  });

  describe('calculateHalfLife', () => {
    it('should calculate half-life for mean-reverting series', () => {
      // 生成均值回归序列
      const series = [];
      let value = 10;
      for (let i = 0; i < 100; i++) {
        value = value * 0.9 + (Math.random() - 0.5);
        series.push(value);
      }

      const halfLife = StatisticalCalculator.calculateHalfLife(series);

      expect(halfLife).toBeGreaterThan(0);
      expect(halfLife).toBeLessThan(Infinity);
    });

    it('should return Infinity for short series', () => {
      expect(StatisticalCalculator.calculateHalfLife([1, 2, 3])).toBe(Infinity);
    });
  });

  describe('hurstExponent', () => {
    it('should calculate Hurst exponent', () => {
      const series = [];
      for (let i = 0; i < 100; i++) {
        series.push(Math.random() * 100);
      }

      const hurst = StatisticalCalculator.hurstExponent(series);

      expect(hurst).toBeGreaterThanOrEqual(0);
      expect(hurst).toBeLessThanOrEqual(1);
    });

    it('should return 0.5 for insufficient data', () => {
      expect(StatisticalCalculator.hurstExponent([1, 2, 3, 4, 5])).toBe(0.5);
    });
  });
});

// ============================================
// SpreadCalculator 测试
// ============================================

describe('SpreadCalculator', () => {
  describe('ratioSpread', () => {
    it('should calculate price ratio correctly', () => {
      expect(SpreadCalculator.ratioSpread(100, 50)).toBe(2);
      expect(SpreadCalculator.ratioSpread(50000, 3000)).toBeCloseTo(16.67, 1);
    });

    it('should return 0 when denominator is 0', () => {
      expect(SpreadCalculator.ratioSpread(100, 0)).toBe(0);
    });
  });

  describe('logSpread', () => {
    it('should calculate log spread correctly', () => {
      const spread = SpreadCalculator.logSpread(100, 100, 1);
      expect(spread).toBeCloseTo(0, 5);
    });

    it('should apply beta correctly', () => {
      const priceA = 100;
      const priceB = 10;
      const beta = 1;

      const spread = SpreadCalculator.logSpread(priceA, priceB, beta);
      expect(spread).toBeCloseTo(Math.log(priceA) - beta * Math.log(priceB), 5);
    });

    it('should return 0 for non-positive prices', () => {
      expect(SpreadCalculator.logSpread(0, 100, 1)).toBe(0);
      expect(SpreadCalculator.logSpread(100, 0, 1)).toBe(0);
      expect(SpreadCalculator.logSpread(-100, 100, 1)).toBe(0);
    });
  });

  describe('residualSpread', () => {
    it('should calculate residual spread correctly', () => {
      // y = alpha + beta * x
      // spread = y - (alpha + beta * x)
      const spread = SpreadCalculator.residualSpread(100, 50, 10, 2);
      expect(spread).toBe(100 - (10 + 2 * 50)); // 100 - 110 = -10
    });
  });

  describe('percentageSpread', () => {
    it('should calculate percentage spread correctly', () => {
      expect(SpreadCalculator.percentageSpread(102, 100)).toBeCloseTo(0.02, 5);
      expect(SpreadCalculator.percentageSpread(98, 100)).toBeCloseTo(-0.02, 5);
    });

    it('should return 0 when denominator is 0', () => {
      expect(SpreadCalculator.percentageSpread(100, 0)).toBe(0);
    });
  });

  describe('basis', () => {
    it('should calculate basis correctly', () => {
      const basis = SpreadCalculator.basis(50100, 50000);
      expect(basis).toBeCloseTo(0.002, 5); // 0.2%
    });

    it('should return 0 when spot price is 0', () => {
      expect(SpreadCalculator.basis(100, 0)).toBe(0);
    });
  });

  describe('annualizedBasis', () => {
    it('should annualize basis correctly', () => {
      const dailyBasis = 0.001; // 0.1% per day
      const annualized = SpreadCalculator.annualizedBasis(dailyBasis, 1);
      expect(annualized).toBeCloseTo(0.365, 2); // ~36.5% annualized
    });
  });
});

// ============================================
// PairManager 测试
// ============================================

describe('PairManager', () => {
  let manager;
  const config = {
    maxActivePairs: 5,
    minCorrelation: 0.7,
    minHalfLife: 1,
    maxHalfLife: 30,
  };

  beforeEach(() => {
    manager = new PairManager(config);
  });

  describe('Constructor', () => {
    it('should initialize with empty pairs', () => {
      expect(manager.pairs.size).toBe(0);
      expect(manager.activePairs.size).toBe(0);
    });
  });

  describe('generatePairId', () => {
    it('should generate consistent pair ID', () => {
      const id1 = manager.generatePairId('BTC/USDT', 'ETH/USDT');
      const id2 = manager.generatePairId('ETH/USDT', 'BTC/USDT');

      expect(id1).toBe(id2);
    });

    it('should sort alphabetically', () => {
      const id = manager.generatePairId('ETH/USDT', 'BTC/USDT');
      expect(id).toBe('BTC/USDT:ETH/USDT');
    });
  });

  describe('addPair', () => {
    it('should add new pair', () => {
      const pair = manager.addPair('BTC/USDT', 'ETH/USDT');

      expect(pair.id).toBe('BTC/USDT:ETH/USDT');
      expect(pair.assetA).toBe('BTC/USDT');
      expect(pair.assetB).toBe('ETH/USDT');
      expect(pair.status).toBe(PAIR_STATUS.PENDING);
    });

    it('should update existing pair', () => {
      manager.addPair('BTC/USDT', 'ETH/USDT');
      const pair = manager.addPair('BTC/USDT', 'ETH/USDT', { correlation: 0.9 });

      expect(pair.stats.correlation).toBe(0.9);
    });

    it('should emit pairAdded event', () => {
      const callback = vi.fn();
      manager.on('pairAdded', callback);

      manager.addPair('BTC/USDT', 'ETH/USDT');

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('updatePairStats', () => {
    it('should update pair statistics', () => {
      manager.addPair('BTC/USDT', 'ETH/USDT');
      const pairId = 'BTC/USDT:ETH/USDT';

      manager.updatePairStats(pairId, {
        correlation: 0.85,
        halfLife: 5,
        cointegration: { isStationary: true },
      });

      const pair = manager.getPair(pairId);
      expect(pair.stats.correlation).toBe(0.85);
      expect(pair.stats.halfLife).toBe(5);
    });

    it('should return null for unknown pair', () => {
      expect(manager.updatePairStats('UNKNOWN:PAIR', {})).toBeNull();
    });
  });

  describe('activatePair', () => {
    beforeEach(() => {
      manager.addPair('BTC/USDT', 'ETH/USDT');
    });

    it('should activate pair', () => {
      const result = manager.activatePair('BTC/USDT:ETH/USDT');

      expect(result).toBe(true);
      expect(manager.activePairs.has('BTC/USDT:ETH/USDT')).toBe(true);
    });

    it('should emit pairActivated event', () => {
      const callback = vi.fn();
      manager.on('pairActivated', callback);

      manager.activatePair('BTC/USDT:ETH/USDT');

      expect(callback).toHaveBeenCalled();
    });

    it('should not exceed maxActivePairs', () => {
      // 添加 6 个配对
      for (let i = 0; i < 6; i++) {
        manager.addPair(`ASSET${i}/USDT`, `ASSET${i + 10}/USDT`);
      }

      // 激活前 5 个
      for (let i = 0; i < 5; i++) {
        const pairId = manager.generatePairId(`ASSET${i}/USDT`, `ASSET${i + 10}/USDT`);
        manager.activatePair(pairId);
      }

      // 第 6 个应该失败
      const pairId = manager.generatePairId('ASSET5/USDT', 'ASSET15/USDT');
      expect(manager.activatePair(pairId)).toBe(false);
    });
  });

  describe('deactivatePair', () => {
    beforeEach(() => {
      manager.addPair('BTC/USDT', 'ETH/USDT');
      manager.activatePair('BTC/USDT:ETH/USDT');
    });

    it('should deactivate pair', () => {
      const result = manager.deactivatePair('BTC/USDT:ETH/USDT');

      expect(result).toBe(true);
      expect(manager.activePairs.has('BTC/USDT:ETH/USDT')).toBe(false);
    });

    it('should emit pairDeactivated event', () => {
      const callback = vi.fn();
      manager.on('pairDeactivated', callback);

      manager.deactivatePair('BTC/USDT:ETH/USDT');

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('setPosition', () => {
    beforeEach(() => {
      manager.addPair('BTC/USDT', 'ETH/USDT');
    });

    it('should set position for pair', () => {
      const position = {
        type: SIGNAL_TYPE.OPEN_LONG_SPREAD,
        assetA: { amount: 0.1 },
        assetB: { amount: 1.5 },
      };

      manager.setPosition('BTC/USDT:ETH/USDT', position);

      const pair = manager.getPair('BTC/USDT:ETH/USDT');
      expect(pair.position).toEqual(position);
      expect(pair.openTime).toBeDefined();
    });

    it('should clear position when null', () => {
      manager.setPosition('BTC/USDT:ETH/USDT', { type: 'test' });
      manager.setPosition('BTC/USDT:ETH/USDT', null);

      const pair = manager.getPair('BTC/USDT:ETH/USDT');
      expect(pair.position).toBeNull();
      expect(pair.openTime).toBeNull();
    });
  });

  describe('recordTradeResult', () => {
    beforeEach(() => {
      manager.addPair('BTC/USDT', 'ETH/USDT');
    });

    it('should record winning trade', () => {
      manager.recordTradeResult('BTC/USDT:ETH/USDT', 100, true);

      const pair = manager.getPair('BTC/USDT:ETH/USDT');
      expect(pair.performance.totalTrades).toBe(1);
      expect(pair.performance.winCount).toBe(1);
      expect(pair.performance.totalPnl).toBe(100);
    });

    it('should record losing trade', () => {
      manager.recordTradeResult('BTC/USDT:ETH/USDT', -50, false);

      const pair = manager.getPair('BTC/USDT:ETH/USDT');
      expect(pair.performance.lossCount).toBe(1);
      expect(pair.performance.maxDrawdown).toBe(50);
    });
  });

  describe('getActivePairs', () => {
    beforeEach(() => {
      manager.addPair('BTC/USDT', 'ETH/USDT');
      manager.addPair('SOL/USDT', 'AVAX/USDT');
      manager.activatePair('BTC/USDT:ETH/USDT');
    });

    it('should return only active pairs', () => {
      const active = manager.getActivePairs();

      expect(active.length).toBe(1);
      expect(active[0].id).toBe('BTC/USDT:ETH/USDT');
    });
  });

  describe('getPairsWithPositions', () => {
    beforeEach(() => {
      manager.addPair('BTC/USDT', 'ETH/USDT');
      manager.addPair('SOL/USDT', 'AVAX/USDT');
      manager.setPosition('BTC/USDT:ETH/USDT', { type: 'test' });
    });

    it('should return only pairs with positions', () => {
      const withPositions = manager.getPairsWithPositions();

      expect(withPositions.length).toBe(1);
      expect(withPositions[0].id).toBe('BTC/USDT:ETH/USDT');
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      manager.addPair('BTC/USDT', 'ETH/USDT');
      manager.activatePair('BTC/USDT:ETH/USDT');
    });

    it('should clear all data', () => {
      manager.clear();

      expect(manager.pairs.size).toBe(0);
      expect(manager.activePairs.size).toBe(0);
    });
  });
});

// ============================================
// StatisticalArbitrageStrategy 测试
// ============================================

describe('StatisticalArbitrageStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new StatisticalArbitrageStrategy({
      arbType: STAT_ARB_TYPE.PAIRS_TRADING,
      candidatePairs: [
        { assetA: 'BTC/USDT', assetB: 'ETH/USDT' },
      ],
      entryZScore: 2.0,
      exitZScore: 0.5,
      stopLossZScore: 4.0,
      lookbackPeriod: 60,
      cointegrationTestPeriod: 100,
      maxPositionPerPair: 0.1,
      maxTotalPosition: 0.5,
      verbose: false,
    });

    engine = createMockEngine();
    strategy.engine = engine;
    strategy.buy = vi.fn();
    strategy.sell = vi.fn();
    strategy.closePosition = vi.fn();
    strategy.setBuySignal = vi.fn();
    strategy.setSellSignal = vi.fn();
    strategy.getCapital = vi.fn().mockReturnValue(100000);
    strategy.log = vi.fn();
  });

  afterEach(() => {
    if (strategy) {
      strategy.pairManager.removeAllListeners();
    }
  });

  describe('Constructor', () => {
    it('should initialize with correct config', () => {
      expect(strategy.name).toBe('StatisticalArbitrageStrategy');
      expect(strategy.config.arbType).toBe(STAT_ARB_TYPE.PAIRS_TRADING);
      expect(strategy.config.entryZScore).toBe(2.0);
    });

    it('should use default config when not specified', () => {
      const defaultStrategy = new StatisticalArbitrageStrategy();
      expect(defaultStrategy.config.arbType).toBe(STAT_ARB_TYPE.PAIRS_TRADING);
      expect(defaultStrategy.config.entryZScore).toBe(2.0);
    });

    it('should initialize price store', () => {
      expect(strategy.priceStore).toBeInstanceOf(PriceSeriesStore);
    });

    it('should initialize pair manager', () => {
      expect(strategy.pairManager).toBeInstanceOf(PairManager);
    });

    it('should initialize stats', () => {
      expect(strategy.stats.totalSignals).toBe(0);
      expect(strategy.stats.totalTrades).toBe(0);
      expect(strategy.stats.totalPnl).toBe(0);
    });
  });

  describe('onInit', () => {
    it('should initialize strategy', async () => {
      await strategy.onInit();

      expect(strategy.running).toBe(true);
    });

    it('should add candidate pairs', async () => {
      await strategy.onInit();

      expect(strategy.pairManager.pairs.size).toBe(1);
    });
  });

  describe('onCandle', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should update price store', async () => {
      await strategy.onCandle({
        symbol: 'BTC/USDT',
        close: 50000,
        timestamp: Date.now(),
      });

      expect(strategy.priceStore.getLatestPrice('BTC/USDT')).toBe(50000);
    });

    it('should skip when not running', async () => {
      strategy.running = false;

      await strategy.onCandle({
        symbol: 'BTC/USDT',
        close: 50000,
      });

      expect(strategy.priceStore.getLatestPrice('BTC/USDT')).toBeNull();
    });
  });

  describe('_getAllSymbols', () => {
    it('should return all unique symbols', () => {
      const symbols = strategy._getAllSymbols();

      expect(symbols).toContain('BTC/USDT');
      expect(symbols).toContain('ETH/USDT');
      expect(symbols.length).toBe(2);
    });
  });

  describe('_generatePairsSignal', () => {
    let pair;

    beforeEach(async () => {
      await strategy.onInit();
      pair = strategy.pairManager.getPair('BTC/USDT:ETH/USDT');
      pair.stats = {
        alpha: 0,
        beta: 16.5,
        spreadMean: 0,
        spreadStd: 100,
      };
    });

    it('should generate OPEN_SHORT_SPREAD when zScore >= entry', () => {
      // 设置价格使得 zScore >= 2.0
      strategy.priceStore.addPrice('BTC/USDT', 50000);
      strategy.priceStore.addPrice('ETH/USDT', 3000);

      // 手动设置价差统计，使当前价差产生高 Z-Score
      pair.stats.spreadMean = 500;
      pair.stats.spreadStd = 100;

      const signal = strategy._generatePairsSignal(
        pair,
        50000,
        3000,
        pair.stats
      );

      // 当前价差 = 50000 - (0 + 16.5 * 3000) = 50000 - 49500 = 500
      // Z-Score = (500 - 500) / 100 = 0
      // 需要调整使得 Z-Score >= 2
      pair.stats.spreadMean = 0;
      const signalHigh = strategy._generatePairsSignal(
        pair,
        50000,
        3000,
        pair.stats
      );

      // Z-Score = (500 - 0) / 100 = 5 >= 2
      expect(signalHigh.type).toBe(SIGNAL_TYPE.OPEN_SHORT_SPREAD);
    });

    it('should generate OPEN_LONG_SPREAD when zScore <= -entry', () => {
      pair.stats.spreadMean = 1000;
      pair.stats.spreadStd = 100;

      const signal = strategy._generatePairsSignal(
        pair,
        50000,
        3000,
        pair.stats
      );

      // 当前价差 = 50000 - (0 + 16.5 * 3000) = 500
      // Z-Score = (500 - 1000) / 100 = -5 <= -2
      expect(signal.type).toBe(SIGNAL_TYPE.OPEN_LONG_SPREAD);
    });

    it('should generate NO_SIGNAL when zScore within threshold', () => {
      pair.stats.spreadMean = 500;
      pair.stats.spreadStd = 500;

      const signal = strategy._generatePairsSignal(
        pair,
        50000,
        3000,
        pair.stats
      );

      // Z-Score = (500 - 500) / 500 = 0
      expect(signal.type).toBe(SIGNAL_TYPE.NO_SIGNAL);
    });
  });

  describe('_generateCrossExchangeSignal', () => {
    let pair;

    beforeEach(async () => {
      strategy = new StatisticalArbitrageStrategy({
        arbType: STAT_ARB_TYPE.CROSS_EXCHANGE,
        candidatePairs: [
          { assetA: 'BTC/USDT:Binance', assetB: 'BTC/USDT:OKX' },
        ],
        spreadEntryThreshold: 0.003,
        tradingCost: 0.001,
        slippageEstimate: 0.0005,
        verbose: false,
      });
      strategy.log = vi.fn();

      await strategy.onInit();
      pair = strategy.pairManager.getAllPairs()[0];
    });

    it('should generate signal when net spread exceeds threshold', () => {
      // priceA > priceB, 价差足够大
      const signal = strategy._generateCrossExchangeSignal(
        pair,
        50500, // Binance 价格高
        50000  // OKX 价格低
      );

      // spread = (50500 - 50000) / 50000 = 0.01 = 1%
      // netSpread = 1% - 2 * 0.1% - 2 * 0.05% = 1% - 0.3% = 0.7%
      expect(signal.type).toBe(SIGNAL_TYPE.OPEN_SHORT_SPREAD);
    });

    it('should generate NO_SIGNAL when net spread below threshold', () => {
      const signal = strategy._generateCrossExchangeSignal(
        pair,
        50010, // 价差很小
        50000
      );

      // spread = 0.02%, netSpread 为负
      expect(signal.type).toBe(SIGNAL_TYPE.NO_SIGNAL);
    });
  });

  describe('_generatePerpetualSpotSignal', () => {
    let pair;

    beforeEach(async () => {
      strategy = new StatisticalArbitrageStrategy({
        arbType: STAT_ARB_TYPE.PERPETUAL_SPOT,
        candidatePairs: [
          { assetA: 'BTC/USDT:PERP', assetB: 'BTC/USDT:SPOT' },
        ],
        basisEntryThreshold: 0.15,
        basisExitThreshold: 0.05,
        verbose: false,
      });
      strategy.log = vi.fn();

      await strategy.onInit();
      pair = strategy.pairManager.getAllPairs()[0];
    });

    it('should generate SHORT_SPREAD for high positive basis', () => {
      // 永续价格高于现货
      const signal = strategy._generatePerpetualSpotSignal(
        pair,
        51000, // 永续
        50000  // 现货
      );

      // basis = (51000 - 50000) / 50000 = 2%
      // annualized = 2% * 365 / 8 = 91.25%
      expect(signal.type).toBe(SIGNAL_TYPE.OPEN_SHORT_SPREAD);
    });

    it('should generate LONG_SPREAD for high negative basis', () => {
      const signal = strategy._generatePerpetualSpotSignal(
        pair,
        49000, // 永续低于现货
        50000
      );

      // basis = -2%, annualized = -91.25%
      expect(signal.type).toBe(SIGNAL_TYPE.OPEN_LONG_SPREAD);
    });

    it('should generate NO_SIGNAL for small basis', () => {
      const signal = strategy._generatePerpetualSpotSignal(
        pair,
        50010,
        50000
      );

      expect(signal.type).toBe(SIGNAL_TYPE.NO_SIGNAL);
    });
  });

  describe('_checkPositionLimits', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should return true when no positions', () => {
      expect(strategy._checkPositionLimits()).toBe(true);
    });

    it('should return false when max pairs reached', () => {
      // 添加达到上限的配对
      for (let i = 0; i < strategy.config.maxActivePairs; i++) {
        const pair = strategy.pairManager.addPair(`ASSET${i}/USDT`, `ASSET${i + 10}/USDT`);
        strategy.pairManager.setPosition(pair.id, { value: 1000 });
      }

      expect(strategy._checkPositionLimits()).toBe(false);
    });
  });

  describe('_calculatePositionPnl', () => {
    it('should calculate long position PnL correctly', () => {
      const position = {
        assetA: {
          side: 'long',
          amount: 0.1,
          entryPrice: 50000,
        },
        assetB: {
          side: 'short',
          amount: 1.5,
          entryPrice: 3000,
        },
      };

      // A 涨到 51000，B 涨到 3100
      const pnl = strategy._calculatePositionPnl(position, 51000, 3100);

      // A PnL = (51000 - 50000) * 0.1 = 100
      // B PnL = (3000 - 3100) * 1.5 = -150
      // Total = 100 - 150 = -50
      expect(pnl).toBe(-50);
    });

    it('should calculate short position PnL correctly', () => {
      const position = {
        assetA: {
          side: 'short',
          amount: 0.1,
          entryPrice: 50000,
        },
        assetB: {
          side: 'long',
          amount: 1.5,
          entryPrice: 3000,
        },
      };

      // A 跌到 49000，B 涨到 3100
      const pnl = strategy._calculatePositionPnl(position, 49000, 3100);

      // A PnL = (50000 - 49000) * 0.1 = 100
      // B PnL = (3100 - 3000) * 1.5 = 150
      // Total = 250
      expect(pnl).toBe(250);
    });
  });

  describe('addPair', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should add new pair manually', () => {
      const pair = strategy.addPair('SOL/USDT', 'AVAX/USDT');

      expect(pair).toBeDefined();
      expect(pair.assetA).toBe('SOL/USDT');
      expect(pair.assetB).toBe('AVAX/USDT');
    });
  });

  describe('removePair', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should remove pair without position', () => {
      strategy.addPair('SOL/USDT', 'AVAX/USDT');
      const pairId = strategy.pairManager.generatePairId('SOL/USDT', 'AVAX/USDT');

      const result = strategy.removePair(pairId);

      expect(result).toBe(true);
      expect(strategy.pairManager.getPair(pairId)).toBeUndefined();
    });

    it('should not remove pair with position', () => {
      strategy.addPair('SOL/USDT', 'AVAX/USDT');
      const pairId = strategy.pairManager.generatePairId('SOL/USDT', 'AVAX/USDT');
      strategy.pairManager.setPosition(pairId, { type: 'test' });

      const result = strategy.removePair(pairId);

      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should return correct status', () => {
      const status = strategy.getStatus();

      expect(status.name).toBe('StatisticalArbitrageStrategy');
      expect(status.arbType).toBe(STAT_ARB_TYPE.PAIRS_TRADING);
      expect(status.running).toBe(true);
      expect(status.cooling).toBe(false);
      expect(status).toHaveProperty('pairs');
      expect(status).toHaveProperty('stats');
      expect(status).toHaveProperty('winRate');
    });
  });

  describe('getPairDetails', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should return pair details', () => {
      const details = strategy.getPairDetails('BTC/USDT:ETH/USDT');

      expect(details).toBeDefined();
      expect(details.assetA).toBe('BTC/USDT');
      expect(details.assetB).toBe('ETH/USDT');
    });

    it('should return null for unknown pair', () => {
      expect(strategy.getPairDetails('UNKNOWN:PAIR')).toBeNull();
    });
  });

  describe('getAllPairsSummary', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should return summary for all pairs', () => {
      const summary = strategy.getAllPairsSummary();

      expect(summary.length).toBe(1);
      expect(summary[0]).toHaveProperty('id');
      expect(summary[0]).toHaveProperty('assetA');
      expect(summary[0]).toHaveProperty('assetB');
      expect(summary[0]).toHaveProperty('status');
    });
  });

  describe('reanalyzeAllPairs', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should trigger pair analysis', async () => {
      await strategy.reanalyzeAllPairs();
      // 应该不抛错
    });
  });

  describe('onFinish', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should stop strategy', async () => {
      await strategy.onFinish();

      expect(strategy.running).toBe(false);
    });

    it('should close all positions', async () => {
      // 添加一个有仓位的配对
      strategy.pairManager.setPosition('BTC/USDT:ETH/USDT', {
        type: SIGNAL_TYPE.OPEN_LONG_SPREAD,
        assetA: { side: 'long', amount: 0.1, entryPrice: 50000, symbol: 'BTC/USDT' },
        assetB: { side: 'short', amount: 1.5, entryPrice: 3000, symbol: 'ETH/USDT' },
        value: 10000,
        entryTime: Date.now(),
      });

      strategy.priceStore.addPrice('BTC/USDT', 50000);
      strategy.priceStore.addPrice('ETH/USDT', 3000);

      await strategy.onFinish();

      expect(strategy.closePosition).toHaveBeenCalled();
    });
  });
});

// ============================================
// 常量测试
// ============================================

describe('STAT_ARB_TYPE Constants', () => {
  it('should have all arbitrage types', () => {
    expect(STAT_ARB_TYPE.COINTEGRATION).toBe('cointegration');
    expect(STAT_ARB_TYPE.PAIRS_TRADING).toBe('pairs_trading');
    expect(STAT_ARB_TYPE.CROSS_EXCHANGE).toBe('cross_exchange');
    expect(STAT_ARB_TYPE.PERPETUAL_SPOT).toBe('perpetual_spot');
    expect(STAT_ARB_TYPE.TRIANGULAR).toBe('triangular');
  });
});

describe('PAIR_STATUS Constants', () => {
  it('should have all pair statuses', () => {
    expect(PAIR_STATUS.ACTIVE).toBe('active');
    expect(PAIR_STATUS.SUSPENDED).toBe('suspended');
    expect(PAIR_STATUS.BROKEN).toBe('broken');
    expect(PAIR_STATUS.PENDING).toBe('pending');
  });
});

describe('SIGNAL_TYPE Constants', () => {
  it('should have all signal types', () => {
    expect(SIGNAL_TYPE.OPEN_LONG_SPREAD).toBe('open_long_spread');
    expect(SIGNAL_TYPE.OPEN_SHORT_SPREAD).toBe('open_short_spread');
    expect(SIGNAL_TYPE.CLOSE_SPREAD).toBe('close_spread');
    expect(SIGNAL_TYPE.NO_SIGNAL).toBe('no_signal');
  });
});

describe('STAT_ARB_DEFAULT_CONFIG', () => {
  it('should have required default fields', () => {
    expect(STAT_ARB_DEFAULT_CONFIG.arbType).toBeDefined();
    expect(STAT_ARB_DEFAULT_CONFIG.candidatePairs).toBeDefined();
    expect(STAT_ARB_DEFAULT_CONFIG.entryZScore).toBeDefined();
    expect(STAT_ARB_DEFAULT_CONFIG.exitZScore).toBeDefined();
    expect(STAT_ARB_DEFAULT_CONFIG.stopLossZScore).toBeDefined();
    expect(STAT_ARB_DEFAULT_CONFIG.lookbackPeriod).toBeDefined();
    expect(STAT_ARB_DEFAULT_CONFIG.cointegrationTestPeriod).toBeDefined();
    expect(STAT_ARB_DEFAULT_CONFIG.maxPositionPerPair).toBeDefined();
    expect(STAT_ARB_DEFAULT_CONFIG.maxTotalPosition).toBeDefined();
  });
});

// ============================================
// 集成测试
// ============================================

describe('统计套利策略集成测试', () => {
  it('应该正确继承 BaseStrategy', async () => {
    const { BaseStrategy } = await import('../../src/strategies/BaseStrategy.js');
    const strategy = new StatisticalArbitrageStrategy();

    expect(strategy instanceof BaseStrategy).toBe(true);
  });

  it('应该能设置和获取状态', () => {
    const strategy = new StatisticalArbitrageStrategy();

    strategy.setState('testKey', 'testValue');
    expect(strategy.getState('testKey')).toBe('testValue');
  });

  it('应该能设置和获取指标', () => {
    const strategy = new StatisticalArbitrageStrategy();

    strategy.setIndicator('zScore', 2.5);
    expect(strategy.getIndicator('zScore')).toBe(2.5);
  });

  it('应该能设置信号', () => {
    const strategy = new StatisticalArbitrageStrategy();

    strategy.setBuySignal('Test signal');
    expect(strategy.getSignal().type).toBe('buy');
  });

  it('不同套利类型应该使用对应的信号生成器', async () => {
    const types = [
      STAT_ARB_TYPE.PAIRS_TRADING,
      STAT_ARB_TYPE.COINTEGRATION,
      STAT_ARB_TYPE.CROSS_EXCHANGE,
      STAT_ARB_TYPE.PERPETUAL_SPOT,
    ];

    for (const arbType of types) {
      const strategy = new StatisticalArbitrageStrategy({
        arbType,
        candidatePairs: [{ assetA: 'BTC/USDT', assetB: 'ETH/USDT' }],
        verbose: false,
      });

      expect(strategy.config.arbType).toBe(arbType);
    }
  });

  it('应该正确处理冷却期', async () => {
    const strategy = new StatisticalArbitrageStrategy({
      consecutiveLossLimit: 2,
      coolingPeriod: 1000,
      verbose: false,
    });
    strategy.log = vi.fn();

    await strategy.onInit();

    // 模拟连续亏损
    strategy.stats.consecutiveLosses = 3;
    strategy.coolingUntil = Date.now() + 10000;

    // 应该处于冷却状态
    const status = strategy.getStatus();
    expect(status.cooling).toBe(true);
  });
});
