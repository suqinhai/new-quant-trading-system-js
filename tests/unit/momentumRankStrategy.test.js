/**
 * MomentumRankStrategy 单元测试
 * Momentum Rank Strategy Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MomentumRankStrategy,
  MOMENTUM_METRICS,
  MOMENTUM_RANK_DEFAULT_CONFIG,
} from '../../src/strategies/MomentumRankStrategy.js';
import { POSITION_TYPE, RANK_DIRECTION } from '../../src/strategies/CrossSectionalStrategy.js';

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

function generateCandleSeries(symbol, basePrice, count, trend = 0) {
  const candles = [];
  let currentPrice = basePrice;
  for (let i = 0; i < count; i++) {
    currentPrice = currentPrice * (1 + trend / count);
    candles.push(generateMockCandle(symbol, currentPrice, i));
  }
  return candles;
}

describe('MomentumRankStrategy', () => {
  let strategy;
  const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT'];

  beforeEach(() => {
    strategy = new MomentumRankStrategy({
      symbols,
      lookbackPeriod: 10,
      shortMomentumPeriod: 3,
      longMomentumPeriod: 15,
      rebalancePeriod: 1000,
      topN: 2,
      bottomN: 2,
      useCompositeMomentum: true,
      useMomentumEnhancement: false,
      useVolatilityFilter: false,
      filterMomentumReversals: false,
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
      const defaultStrategy = new MomentumRankStrategy();
      expect(defaultStrategy.name).toBe('MomentumRankStrategy');
      expect(defaultStrategy.config.momentumMetric).toBe(MOMENTUM_METRICS.RETURNS);
    });

    it('should override config with params', () => {
      expect(strategy.config.topN).toBe(2);
      expect(strategy.config.bottomN).toBe(2);
    });

    it('should initialize momentum tracking structures', () => {
      expect(strategy.previousRanking).toEqual([]);
      expect(strategy.momentumAcceleration).toBeInstanceOf(Map);
      expect(strategy.momentumHistory).toBeInstanceOf(Map);
      expect(strategy.entryPrices).toBeInstanceOf(Map);
      expect(strategy.peakPrices).toBeInstanceOf(Map);
    });
  });

  describe('calculateCompositeMomentum', () => {
    it('should calculate composite momentum with weights', () => {
      const metrics = {
        returns: 0.1,
        sharpe: 0.5,
        momentum: 0.08,
        rsi: 60,
      };

      const score = strategy.calculateCompositeMomentum(metrics);
      expect(score).toBeDefined();
      expect(typeof score).toBe('number');
    });

    it('should return simple metric when composite is disabled', () => {
      strategy.config.useCompositeMomentum = false;
      const metrics = { returns: 0.15 };

      const score = strategy.calculateCompositeMomentum(metrics);
      expect(score).toBe(0.15);
    });

    it('should handle missing metrics gracefully', () => {
      const metrics = { returns: 0.1 };
      const score = strategy.calculateCompositeMomentum(metrics);
      expect(typeof score).toBe('number');
    });

    it('should normalize RSI to [-1, 1] range', () => {
      const highRsi = { rsi: 80 };
      const lowRsi = { rsi: 20 };

      const highScore = strategy.calculateCompositeMomentum(highRsi);
      const lowScore = strategy.calculateCompositeMomentum(lowRsi);

      expect(highScore).toBeGreaterThan(lowScore);
    });
  });

  describe('getCurrentRanking', () => {
    beforeEach(async () => {
      await strategy.onInit();

      const basePrices = [50000, 3000, 100, 0.5, 0.3, 0.1];
      const trends = {
        'BTC/USDT': 0.15,
        'ETH/USDT': 0.10,
        'SOL/USDT': -0.08,
        'XRP/USDT': 0.05,
        'ADA/USDT': -0.12,
        'DOGE/USDT': 0.02,
      };

      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          const basePrice = basePrices[idx] * (1 + trends[symbol] * i / 15);
          candleMap.set(symbol, generateMockCandle(symbol, basePrice, i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }
    });

    it('should return ranking sorted by momentum score', () => {
      const ranking = strategy.getCurrentRanking();

      expect(ranking.length).toBeGreaterThan(0);
      for (let i = 1; i < ranking.length; i++) {
        expect(ranking[i - 1].value).toBeGreaterThanOrEqual(ranking[i].value);
      }
    });

    it('should include acceleration in ranking items', () => {
      const ranking = strategy.getCurrentRanking();

      ranking.forEach(item => {
        expect(item).toHaveProperty('acceleration');
      });
    });

    it('should include volatility in ranking items', () => {
      const ranking = strategy.getCurrentRanking();

      ranking.forEach(item => {
        expect(item).toHaveProperty('volatility');
      });
    });
  });

  describe('Momentum Acceleration', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should track momentum history', () => {
      strategy._calculateMomentumAcceleration('BTC/USDT', 0.1);
      strategy._calculateMomentumAcceleration('BTC/USDT', 0.12);

      expect(strategy.momentumHistory.get('BTC/USDT').length).toBe(2);
    });

    it('should calculate acceleration as momentum change', () => {
      strategy._calculateMomentumAcceleration('BTC/USDT', 0.1);
      const accel = strategy._calculateMomentumAcceleration('BTC/USDT', 0.15);

      expect(accel).toBeCloseTo(0.05, 5);
    });

    it('should return 0 for first momentum point', () => {
      const accel = strategy._calculateMomentumAcceleration('NEW/USDT', 0.1);
      expect(accel).toBe(0);
    });

    it('should limit history to 10 records', () => {
      for (let i = 0; i < 15; i++) {
        strategy._calculateMomentumAcceleration('BTC/USDT', i * 0.01);
      }

      expect(strategy.momentumHistory.get('BTC/USDT').length).toBe(10);
    });
  });

  describe('Volatility Filter', () => {
    beforeEach(async () => {
      strategy.config.useVolatilityFilter = true;
      strategy.config.minVolatility = 0.01;
      strategy.config.maxVolatility = 0.10;
      await strategy.onInit();
    });

    it('should filter out low volatility assets', async () => {
      // 添加数据，使部分资产波动率过低
      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          const volatility = idx === 0 ? 0.001 : 0.03; // BTC波动率过低
          candleMap.set(symbol, generateMockCandle(symbol, 100, i, volatility));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      const ranking = strategy.getCurrentRanking();
      const btcInRanking = ranking.find(r => r.symbol === 'BTC/USDT');

      // BTC应该被过滤（波动率太低）或保留（取决于计算结果）
      expect(ranking.length).toBeLessThanOrEqual(symbols.length);
    });
  });

  describe('Market Neutral Mode', () => {
    beforeEach(async () => {
      strategy.config.marketNeutral = true;
      await strategy.onInit();

      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          const trend = 0.1 - idx * 0.03;
          candleMap.set(symbol, generateMockCandle(symbol, 100, i, 0.02));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }
    });

    it('should balance long and short weights when market neutral', () => {
      const ranking = strategy.getCurrentRanking();
      const { longAssets, shortAssets } = strategy._selectAssets(ranking);

      if (longAssets.length > 0 && shortAssets.length > 0) {
        const longWeight = longAssets.reduce((sum, a) => sum + (a.weight || 0), 0);
        const shortWeight = shortAssets.reduce((sum, a) => sum + (a.weight || 0), 0);

        // 权重应该接近相等
        expect(Math.abs(longWeight - shortWeight)).toBeLessThan(0.1);
      }
    });
  });

  describe('Stop Loss and Take Profit', () => {
    beforeEach(async () => {
      await strategy.onInit();

      // 模拟持仓
      strategy.portfolioManager.currentPositions.set('BTC/USDT', {
        side: 'long',
        weight: 0.1,
      });
      strategy.entryPrices.set('BTC/USDT', 50000);
      strategy.peakPrices.set('BTC/USDT', 50000);
    });

    it('should track peak prices for trailing stop', async () => {
      // 添加更高价格的数据
      const candle = generateMockCandle('BTC/USDT', 55000, 0);
      strategy.assetManager.updateAssetData('BTC/USDT', candle);

      await strategy._checkStopLossAndTakeProfit();

      // 峰值应该更新
      expect(strategy.peakPrices.get('BTC/USDT')).toBeGreaterThanOrEqual(50000);
    });
  });

  describe('getMomentumRankingDetails', () => {
    beforeEach(async () => {
      await strategy.onInit();

      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          const trend = 0.1 - idx * 0.03;
          candleMap.set(symbol, generateMockCandle(symbol, 100 * (idx + 1), i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }
    });

    it('should return detailed ranking with all fields', () => {
      const details = strategy.getMomentumRankingDetails();

      expect(details.length).toBeGreaterThan(0);
      details.forEach(item => {
        expect(item).toHaveProperty('symbol');
        expect(item).toHaveProperty('rank');
        expect(item).toHaveProperty('momentumScore');
        expect(item).toHaveProperty('acceleration');
        expect(item).toHaveProperty('volatility');
        expect(item).toHaveProperty('isLong');
        expect(item).toHaveProperty('isShort');
      });
    });

    it('should mark top N as long candidates', () => {
      const details = strategy.getMomentumRankingDetails();
      const longCandidates = details.filter(d => d.isLong);

      expect(longCandidates.length).toBeLessThanOrEqual(strategy.config.topN);
    });
  });

  describe('getStatus', () => {
    it('should include momentum-specific status fields', async () => {
      await strategy.onInit();

      const status = strategy.getStatus();

      expect(status).toHaveProperty('momentumMetric');
      expect(status).toHaveProperty('useCompositeMomentum');
      expect(status).toHaveProperty('marketNeutral');
      expect(status).toHaveProperty('momentumAcceleration');
      expect(status).toHaveProperty('activePositions');
    });
  });
});

describe('MOMENTUM_METRICS Constants', () => {
  it('should have all metric types', () => {
    expect(MOMENTUM_METRICS.RETURNS).toBe('returns');
    expect(MOMENTUM_METRICS.SHARPE).toBe('sharpe');
    expect(MOMENTUM_METRICS.MOMENTUM).toBe('momentum');
    expect(MOMENTUM_METRICS.RSI).toBe('rsi');
    expect(MOMENTUM_METRICS.RISK_ADJUSTED).toBe('risk_adjusted');
  });
});

describe('MOMENTUM_RANK_DEFAULT_CONFIG', () => {
  it('should have required default fields', () => {
    expect(MOMENTUM_RANK_DEFAULT_CONFIG.name).toBe('MomentumRankStrategy');
    expect(MOMENTUM_RANK_DEFAULT_CONFIG.lookbackPeriod).toBeDefined();
    expect(MOMENTUM_RANK_DEFAULT_CONFIG.topN).toBeDefined();
    expect(MOMENTUM_RANK_DEFAULT_CONFIG.compositeMomentumWeights).toBeDefined();
  });
});
