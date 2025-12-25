/**
 * FundingRateExtremeStrategy 单元测试
 * Funding Rate Extreme Strategy Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FundingRateExtremeStrategy,
  FundingRateDataManager,
  FUNDING_FREQUENCY,
  EXTREME_DETECTION,
  FUNDING_EXTREME_DEFAULT_CONFIG,
} from '../../src/strategies/FundingRateExtremeStrategy.js';
import { POSITION_TYPE } from '../../src/strategies/CrossSectionalStrategy.js';

// 测试辅助函数
function generateMockCandle(symbol, basePrice, index, volatility = 0.02) {
  const priceChange = (Math.random() - 0.5) * 2 * volatility * basePrice;
  const close = basePrice + priceChange;
  return {
    symbol,
    timestamp: Date.now() - (100 - index) * 3600000,
    open: close - (Math.random() - 0.5) * volatility * basePrice,
    high: close + Math.random() * volatility * basePrice * 0.5,
    low: close - Math.random() * volatility * basePrice * 0.5,
    close,
    volume: 10000000 + Math.random() * 50000000,
  };
}

function generateMockFundingData(symbol, rate, predicted = null) {
  return {
    symbol,
    fundingRate: rate,
    fundingRatePredicted: predicted || rate,
    fundingTimestamp: Date.now() + 8 * 3600000,
    markPrice: 50000,
    indexPrice: 50000,
    exchange: 'binance',
  };
}

describe('FundingRateDataManager', () => {
  let manager;
  const config = {
    fundingFrequency: FUNDING_FREQUENCY.EIGHT_HOURLY,
  };

  beforeEach(() => {
    manager = new FundingRateDataManager(config);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty data', () => {
      expect(manager.currentRates.size).toBe(0);
      expect(manager.rateHistory.size).toBe(0);
      expect(manager.rateStats.size).toBe(0);
    });
  });

  describe('updateRate', () => {
    it('should add new funding rate', () => {
      const data = generateMockFundingData('BTC/USDT:USDT', 0.0001);
      manager.updateRate('BTC/USDT:USDT', data);

      expect(manager.currentRates.has('BTC/USDT:USDT')).toBe(true);
      expect(manager.currentRates.get('BTC/USDT:USDT').rate).toBe(0.0001);
    });

    it('should record rate to history', () => {
      const data = generateMockFundingData('BTC/USDT:USDT', 0.0001);
      manager.updateRate('BTC/USDT:USDT', data);

      expect(manager.rateHistory.has('BTC/USDT:USDT')).toBe(true);
      expect(manager.rateHistory.get('BTC/USDT:USDT').length).toBe(1);
    });

    it('should emit rateUpdated event', () => {
      const callback = vi.fn();
      manager.on('rateUpdated', callback);

      const data = generateMockFundingData('BTC/USDT:USDT', 0.0001);
      manager.updateRate('BTC/USDT:USDT', data);

      expect(callback).toHaveBeenCalled();
    });

    it('should update statistics after multiple updates', () => {
      for (let i = 0; i < 5; i++) {
        const data = generateMockFundingData('BTC/USDT:USDT', 0.0001 + i * 0.00005);
        manager.updateRate('BTC/USDT:USDT', data);
      }

      const stats = manager.getStats('BTC/USDT:USDT');
      expect(stats).toBeDefined();
      expect(stats.mean).toBeDefined();
      expect(stats.std).toBeDefined();
    });
  });

  describe('getCurrentRate', () => {
    it('should return current rate', () => {
      const data = generateMockFundingData('BTC/USDT:USDT', 0.0002);
      manager.updateRate('BTC/USDT:USDT', data);

      const rate = manager.getCurrentRate('BTC/USDT:USDT');
      expect(rate.rate).toBe(0.0002);
    });

    it('should return null for non-existent symbol', () => {
      const rate = manager.getCurrentRate('UNKNOWN/USDT:USDT');
      expect(rate).toBeNull();
    });
  });

  describe('annualizeRate', () => {
    it('should annualize 8-hourly rate correctly', () => {
      manager.config.fundingFrequency = FUNDING_FREQUENCY.EIGHT_HOURLY;
      const annualized = manager.annualizeRate(0.0001);

      // 0.0001 * 3 * 365 = 0.1095 (10.95% annually)
      expect(annualized).toBeCloseTo(0.1095, 4);
    });

    it('should annualize hourly rate correctly', () => {
      manager.config.fundingFrequency = FUNDING_FREQUENCY.HOURLY;
      const annualized = manager.annualizeRate(0.00001);

      // 0.00001 * 24 * 365 = 0.0876
      expect(annualized).toBeCloseTo(0.0876, 4);
    });
  });

  describe('calculateZScore', () => {
    beforeEach(() => {
      // 添加历史数据建立统计基准
      for (let i = 0; i < 20; i++) {
        const rate = 0.0001 + (Math.random() - 0.5) * 0.0001;
        manager.updateRate('BTC/USDT:USDT', generateMockFundingData('BTC/USDT:USDT', rate));
      }
    });

    it('should calculate Z-score', () => {
      const zScore = manager.calculateZScore('BTC/USDT:USDT');
      expect(typeof zScore).toBe('number');
    });

    it('should return 0 for symbol without data', () => {
      const zScore = manager.calculateZScore('UNKNOWN/USDT:USDT');
      expect(zScore).toBe(0);
    });
  });

  describe('getPercentileRank', () => {
    beforeEach(() => {
      // 添加历史数据
      for (let i = 0; i < 20; i++) {
        const rate = 0.00005 + i * 0.00001;
        manager.updateRate('BTC/USDT:USDT', generateMockFundingData('BTC/USDT:USDT', rate));
      }
    });

    it('should return percentile between 0 and 100', () => {
      const percentile = manager.getPercentileRank('BTC/USDT:USDT');
      expect(percentile).toBeGreaterThanOrEqual(0);
      expect(percentile).toBeLessThanOrEqual(100);
    });

    it('should return 50 for symbol without data', () => {
      const percentile = manager.getPercentileRank('UNKNOWN/USDT:USDT');
      expect(percentile).toBe(50);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      for (let i = 0; i < 10; i++) {
        manager.updateRate('BTC/USDT:USDT', generateMockFundingData('BTC/USDT:USDT', 0.0001 + i * 0.00002));
      }
    });

    it('should return statistics with required fields', () => {
      const stats = manager.getStats('BTC/USDT:USDT');

      expect(stats).toHaveProperty('mean');
      expect(stats).toHaveProperty('std');
      expect(stats).toHaveProperty('min');
      expect(stats).toHaveProperty('max');
      expect(stats).toHaveProperty('p10');
      expect(stats).toHaveProperty('p90');
      expect(stats).toHaveProperty('count');
    });

    it('should return null for symbol without enough data', () => {
      const stats = manager.getStats('NEW/USDT:USDT');
      expect(stats).toBeNull();
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      manager.updateRate('BTC/USDT:USDT', generateMockFundingData('BTC/USDT:USDT', 0.0001));
      manager.updateRate('ETH/USDT:USDT', generateMockFundingData('ETH/USDT:USDT', 0.0002));
    });

    it('should clear specific symbol', () => {
      manager.clear('BTC/USDT:USDT');

      expect(manager.currentRates.has('BTC/USDT:USDT')).toBe(false);
      expect(manager.currentRates.has('ETH/USDT:USDT')).toBe(true);
    });

    it('should clear all when no symbol provided', () => {
      manager.clear();

      expect(manager.currentRates.size).toBe(0);
      expect(manager.rateHistory.size).toBe(0);
    });
  });
});

describe('FundingRateExtremeStrategy', () => {
  let strategy;
  const symbols = [
    'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT',
    'XRP/USDT:USDT', 'ADA/USDT:USDT', 'DOGE/USDT:USDT',
  ];

  beforeEach(() => {
    strategy = new FundingRateExtremeStrategy({
      symbols,
      lookbackPeriod: 10,
      rebalancePeriod: 1000,
      topN: 2,
      bottomN: 2,
      extremeDetection: EXTREME_DETECTION.PERCENTILE,
      highRatePercentile: 80,
      lowRatePercentile: 20,
      minAnnualizedSpread: 0.05,
      marketNeutral: true,
      minDailyVolume: 0,
      minPrice: 0,
      verbose: false,
    });

    strategy.buy = vi.fn();
    strategy.sell = vi.fn();
    strategy.closePosition = vi.fn();
    strategy.setBuySignal = vi.fn();
    strategy.setSellSignal = vi.fn();
    strategy.getCapital = vi.fn().mockReturnValue(10000);
    strategy.log = vi.fn();
  });

  describe('Constructor', () => {
    it('should initialize with correct default values', () => {
      const defaultStrategy = new FundingRateExtremeStrategy();
      expect(defaultStrategy.name).toBe('FundingRateExtremeStrategy');
      expect(defaultStrategy.config.extremeDetection).toBe(EXTREME_DETECTION.PERCENTILE);
    });

    it('should override config with params', () => {
      expect(strategy.config.topN).toBe(2);
      expect(strategy.config.bottomN).toBe(2);
      expect(strategy.config.marketNeutral).toBe(true);
    });

    it('should initialize funding tracking structures', () => {
      expect(strategy.fundingManager).toBeInstanceOf(FundingRateDataManager);
      expect(strategy.entryRates).toBeInstanceOf(Map);
      expect(strategy.cumulativeFundingIncome).toBeInstanceOf(Map);
      expect(strategy.entryTimes).toBeInstanceOf(Map);
    });
  });

  describe('onFundingRate', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should update funding manager', async () => {
      const data = generateMockFundingData('BTC/USDT:USDT', 0.0002);
      await strategy.onFundingRate(data);

      expect(strategy.fundingManager.currentRates.has('BTC/USDT:USDT')).toBe(true);
    });

    it('should skip when not running', async () => {
      strategy.running = false;
      const data = generateMockFundingData('BTC/USDT:USDT', 0.0002);
      await strategy.onFundingRate(data);

      expect(strategy.fundingManager.currentRates.has('BTC/USDT:USDT')).toBe(false);
    });
  });

  describe('Extreme Detection', () => {
    beforeEach(async () => {
      await strategy.onInit();

      // 添加价格数据
      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol) => {
          candleMap.set(symbol, generateMockCandle(symbol, 100, i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      // 添加资金费率历史数据
      for (let i = 0; i < 25; i++) {
        symbols.forEach((symbol, idx) => {
          const baseRate = 0.0001 + idx * 0.00005;
          const rate = baseRate + (Math.random() - 0.5) * 0.0001;
          strategy.fundingManager.updateRate(symbol, generateMockFundingData(symbol, rate));
        });
      }
    });

    it('should calculate extreme score using percentile', () => {
      strategy.config.extremeDetection = EXTREME_DETECTION.PERCENTILE;
      const rate = strategy.fundingManager.getCurrentRate('BTC/USDT:USDT');
      const stats = strategy.fundingManager.getStats('BTC/USDT:USDT');

      const score = strategy._calculateExtremeScore('BTC/USDT:USDT', rate, stats);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(-1);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should calculate extreme score using Z-score', () => {
      strategy.config.extremeDetection = EXTREME_DETECTION.Z_SCORE;
      const rate = strategy.fundingManager.getCurrentRate('BTC/USDT:USDT');
      const stats = strategy.fundingManager.getStats('BTC/USDT:USDT');

      const score = strategy._calculateExtremeScore('BTC/USDT:USDT', rate, stats);
      expect(typeof score).toBe('number');
    });

    it('should calculate extreme score using absolute threshold', () => {
      strategy.config.extremeDetection = EXTREME_DETECTION.ABSOLUTE;
      const rate = { rate: 0.001 }; // High rate
      const stats = strategy.fundingManager.getStats('BTC/USDT:USDT');

      const score = strategy._calculateExtremeScore('BTC/USDT:USDT', rate, stats);
      expect(typeof score).toBe('number');
    });

    it('should identify high extreme correctly', () => {
      const item = {
        percentile: 95,
        zScore: 2.5,
        annualizedRate: 0.6,
        extremeScore: 0.9,
      };

      strategy.config.extremeDetection = EXTREME_DETECTION.PERCENTILE;
      expect(strategy._isHighExtreme(item)).toBe(true);

      strategy.config.extremeDetection = EXTREME_DETECTION.Z_SCORE;
      expect(strategy._isHighExtreme(item)).toBe(true);
    });

    it('should identify low extreme correctly', () => {
      const item = {
        percentile: 5,
        zScore: -2.5,
        annualizedRate: -0.3,
        extremeScore: -0.9,
      };

      strategy.config.extremeDetection = EXTREME_DETECTION.PERCENTILE;
      expect(strategy._isLowExtreme(item)).toBe(true);

      strategy.config.extremeDetection = EXTREME_DETECTION.Z_SCORE;
      expect(strategy._isLowExtreme(item)).toBe(true);
    });
  });

  describe('getCurrentRanking', () => {
    beforeEach(async () => {
      await strategy.onInit();

      // 添加价格数据
      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol) => {
          candleMap.set(symbol, generateMockCandle(symbol, 100, i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      // 添加不同费率的数据
      const rates = [0.0005, 0.0003, 0.0001, -0.0001, -0.0002, -0.0003];
      symbols.forEach((symbol, idx) => {
        strategy.fundingManager.updateRate(symbol, generateMockFundingData(symbol, rates[idx]));
      });
    });

    it('should return ranking sorted by funding rate', () => {
      const ranking = strategy.getCurrentRanking();

      expect(ranking.length).toBeGreaterThan(0);
      for (let i = 1; i < ranking.length; i++) {
        expect(ranking[i - 1].value).toBeGreaterThanOrEqual(ranking[i].value);
      }
    });

    it('should include annualized rate in ranking items', () => {
      const ranking = strategy.getCurrentRanking();

      ranking.forEach(item => {
        expect(item).toHaveProperty('annualizedRate');
        expect(item).toHaveProperty('extremeScore');
        expect(item).toHaveProperty('zScore');
        expect(item).toHaveProperty('percentile');
      });
    });
  });

  describe('Asset Selection', () => {
    beforeEach(async () => {
      await strategy.onInit();

      // 添加价格数据
      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol) => {
          candleMap.set(symbol, generateMockCandle(symbol, 100, i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      // 添加历史费率数据用于建立统计
      for (let h = 0; h < 20; h++) {
        symbols.forEach((symbol, idx) => {
          const baseRate = (idx - 2.5) * 0.0002;
          const rate = baseRate + (Math.random() - 0.5) * 0.00005;
          strategy.fundingManager.updateRate(symbol, generateMockFundingData(symbol, rate));
        });
      }
    });

    it('should select high rate assets for short', () => {
      const ranking = strategy.getCurrentRanking();
      const { shortAssets } = strategy._selectAssets(ranking);

      // Short assets should come from high extremes
      // They should have a side property set to 'short'
      if (shortAssets.length > 0) {
        shortAssets.forEach(asset => {
          expect(asset.side).toBe('short');
        });
      }
    });

    it('should balance weights for market neutral', () => {
      strategy.config.marketNeutral = true;

      const ranking = strategy.getCurrentRanking();
      const { longAssets, shortAssets } = strategy._selectAssets(ranking);

      if (longAssets.length > 0 && shortAssets.length > 0) {
        const longWeight = longAssets.reduce((sum, a) => sum + (a.weight || 0), 0);
        const shortWeight = shortAssets.reduce((sum, a) => sum + (a.weight || 0), 0);

        // 市场中性应该权重相近
        expect(Math.abs(longWeight - shortWeight)).toBeLessThan(0.1);
      }
    });
  });

  describe('Funding Income Tracking', () => {
    beforeEach(async () => {
      await strategy.onInit();

      // 模拟持仓
      strategy.portfolioManager.currentPositions.set('BTC/USDT:USDT', {
        side: 'short',
        weight: 0.1,
      });
    });

    it('should record funding payment for short position', () => {
      const rate = { rate: 0.0001 };

      strategy._recordFundingPayment('BTC/USDT:USDT', { side: 'short', weight: 0.1 }, rate);

      const income = strategy.cumulativeFundingIncome.get('BTC/USDT:USDT');
      expect(income).toBeGreaterThan(0); // Short收取资金费
    });

    it('should record funding payment for long position', () => {
      strategy._recordFundingPayment('ETH/USDT:USDT', { side: 'long', weight: 0.1 }, { rate: 0.0001 });

      const income = strategy.cumulativeFundingIncome.get('ETH/USDT:USDT');
      expect(income).toBeLessThan(0); // Long支付资金费
    });
  });

  describe('getFundingRateRankingDetails', () => {
    beforeEach(async () => {
      await strategy.onInit();

      symbols.forEach((symbol, idx) => {
        const rate = 0.0003 - idx * 0.0001;
        strategy.fundingManager.updateRate(symbol, generateMockFundingData(symbol, rate));
      });
    });

    it('should return detailed ranking with all fields', () => {
      const details = strategy.getFundingRateRankingDetails();

      expect(details.length).toBeGreaterThan(0);
      details.forEach(item => {
        expect(item).toHaveProperty('symbol');
        expect(item).toHaveProperty('rank');
        expect(item).toHaveProperty('currentRate');
        expect(item).toHaveProperty('annualizedRate');
        expect(item).toHaveProperty('extremeScore');
        expect(item).toHaveProperty('isHighExtreme');
        expect(item).toHaveProperty('isLowExtreme');
        expect(item).toHaveProperty('recommendedAction');
      });
    });

    it('should recommend short for high extreme', () => {
      const details = strategy.getFundingRateRankingDetails();
      const highExtremes = details.filter(d => d.isHighExtreme);

      highExtremes.forEach(item => {
        expect(item.recommendedAction).toBe('short');
      });
    });
  });

  describe('getStatus', () => {
    it('should include funding-specific status fields', async () => {
      await strategy.onInit();

      const status = strategy.getStatus();

      expect(status).toHaveProperty('extremeDetection');
      expect(status).toHaveProperty('fundingStats');
      expect(status).toHaveProperty('currentSpread');
      expect(status).toHaveProperty('avgHighRate');
      expect(status).toHaveProperty('avgLowRate');
      expect(status).toHaveProperty('positionsWithFunding');
    });
  });
});

describe('FUNDING_FREQUENCY Constants', () => {
  it('should have all frequency types', () => {
    expect(FUNDING_FREQUENCY.HOURLY).toBe('hourly');
    expect(FUNDING_FREQUENCY.EIGHT_HOURLY).toBe('8h');
    expect(FUNDING_FREQUENCY.FOUR_HOURLY).toBe('4h');
  });
});

describe('EXTREME_DETECTION Constants', () => {
  it('should have all detection methods', () => {
    expect(EXTREME_DETECTION.PERCENTILE).toBe('percentile');
    expect(EXTREME_DETECTION.Z_SCORE).toBe('z_score');
    expect(EXTREME_DETECTION.ABSOLUTE).toBe('absolute');
    expect(EXTREME_DETECTION.HISTORICAL).toBe('historical');
  });
});

describe('FUNDING_EXTREME_DEFAULT_CONFIG', () => {
  it('should have required default fields', () => {
    expect(FUNDING_EXTREME_DEFAULT_CONFIG.name).toBe('FundingRateExtremeStrategy');
    expect(FUNDING_EXTREME_DEFAULT_CONFIG.extremeDetection).toBeDefined();
    expect(FUNDING_EXTREME_DEFAULT_CONFIG.highRatePercentile).toBeDefined();
    expect(FUNDING_EXTREME_DEFAULT_CONFIG.lowRatePercentile).toBeDefined();
    expect(FUNDING_EXTREME_DEFAULT_CONFIG.minAnnualizedSpread).toBeDefined();
    expect(FUNDING_EXTREME_DEFAULT_CONFIG.fundingFrequency).toBeDefined();
  });
});
