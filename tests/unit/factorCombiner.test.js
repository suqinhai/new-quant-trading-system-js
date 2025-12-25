/**
 * FactorCombiner 单元测试
 * Factor Combiner Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FactorCombiner,
  NORMALIZATION_METHOD,
  COMBINATION_METHOD,
  createDefaultCombiner,
  createEqualWeightCombiner,
  createRankCombiner,
} from '../../src/factors/FactorCombiner.js';
import { FACTOR_DIRECTION } from '../../src/factors/BaseFactor.js';

// ============================================
// NORMALIZATION_METHOD 常量测试
// ============================================

describe('NORMALIZATION_METHOD Constants', () => {
  it('should have all normalization methods', () => {
    expect(NORMALIZATION_METHOD.ZSCORE).toBe('zscore');
    expect(NORMALIZATION_METHOD.MIN_MAX).toBe('min_max');
    expect(NORMALIZATION_METHOD.PERCENTILE).toBe('percentile');
    expect(NORMALIZATION_METHOD.RANK).toBe('rank');
    expect(NORMALIZATION_METHOD.ROBUST).toBe('robust');
    expect(NORMALIZATION_METHOD.NONE).toBe('none');
  });
});

// ============================================
// COMBINATION_METHOD 常量测试
// ============================================

describe('COMBINATION_METHOD Constants', () => {
  it('should have all combination methods', () => {
    expect(COMBINATION_METHOD.WEIGHTED_SUM).toBe('weighted_sum');
    expect(COMBINATION_METHOD.WEIGHTED_AVERAGE).toBe('weighted_avg');
    expect(COMBINATION_METHOD.RANK_AVERAGE).toBe('rank_avg');
    expect(COMBINATION_METHOD.IC_WEIGHTED).toBe('ic_weighted');
    expect(COMBINATION_METHOD.EQUAL).toBe('equal');
  });
});

// ============================================
// FactorCombiner 构造函数测试
// ============================================

describe('FactorCombiner Constructor', () => {
  it('should initialize with default config', () => {
    const combiner = new FactorCombiner();

    expect(combiner.factorWeights).toEqual({});
    expect(combiner.normalizationMethod).toBe(NORMALIZATION_METHOD.ZSCORE);
    expect(combiner.combinationMethod).toBe(COMBINATION_METHOD.WEIGHTED_SUM);
    expect(combiner.adjustForDirection).toBe(true);
  });

  it('should accept custom config', () => {
    const combiner = new FactorCombiner({
      factorWeights: { MomentumFactor: 0.5, VolatilityFactor: 0.3 },
      normalizationMethod: NORMALIZATION_METHOD.MIN_MAX,
      combinationMethod: COMBINATION_METHOD.WEIGHTED_AVERAGE,
      adjustForDirection: false,
    });

    expect(combiner.factorWeights.MomentumFactor).toBe(0.5);
    expect(combiner.factorWeights.VolatilityFactor).toBe(0.3);
    expect(combiner.normalizationMethod).toBe(NORMALIZATION_METHOD.MIN_MAX);
    expect(combiner.combinationMethod).toBe(COMBINATION_METHOD.WEIGHTED_AVERAGE);
    expect(combiner.adjustForDirection).toBe(false);
  });

  it('should initialize factor directions', () => {
    const combiner = new FactorCombiner({
      factorDirections: {
        MomentumFactor: FACTOR_DIRECTION.POSITIVE,
        VolatilityFactor: FACTOR_DIRECTION.NEGATIVE,
      },
    });

    expect(combiner.factorDirections.MomentumFactor).toBe(FACTOR_DIRECTION.POSITIVE);
    expect(combiner.factorDirections.VolatilityFactor).toBe(FACTOR_DIRECTION.NEGATIVE);
  });

  it('should initialize caches', () => {
    const combiner = new FactorCombiner();

    expect(combiner.factorICs).toBeInstanceOf(Map);
    expect(combiner.lastScores).toBeNull();
    expect(combiner.lastRankings).toBeNull();
  });
});

// ============================================
// setWeights 方法测试
// ============================================

describe('FactorCombiner setWeights', () => {
  it('should update factor weights', () => {
    const combiner = new FactorCombiner();

    combiner.setWeights({ MomentumFactor: 0.6, VolatilityFactor: 0.4 });

    expect(combiner.factorWeights.MomentumFactor).toBe(0.6);
    expect(combiner.factorWeights.VolatilityFactor).toBe(0.4);
  });

  it('should merge with existing weights', () => {
    const combiner = new FactorCombiner({
      factorWeights: { MomentumFactor: 0.5 },
    });

    combiner.setWeights({ VolatilityFactor: 0.3 });

    expect(combiner.factorWeights.MomentumFactor).toBe(0.5);
    expect(combiner.factorWeights.VolatilityFactor).toBe(0.3);
  });

  it('should emit weightsUpdated event', () => {
    const combiner = new FactorCombiner();
    const eventHandler = vi.fn();

    combiner.on('weightsUpdated', eventHandler);
    combiner.setWeights({ MomentumFactor: 0.5 });

    expect(eventHandler).toHaveBeenCalled();
    expect(eventHandler.mock.calls[0][0].MomentumFactor).toBe(0.5);
  });
});

// ============================================
// setDirections 方法测试
// ============================================

describe('FactorCombiner setDirections', () => {
  it('should update factor directions', () => {
    const combiner = new FactorCombiner();

    combiner.setDirections({
      MomentumFactor: FACTOR_DIRECTION.POSITIVE,
      VolatilityFactor: FACTOR_DIRECTION.NEGATIVE,
    });

    expect(combiner.factorDirections.MomentumFactor).toBe(FACTOR_DIRECTION.POSITIVE);
    expect(combiner.factorDirections.VolatilityFactor).toBe(FACTOR_DIRECTION.NEGATIVE);
  });

  it('should merge with existing directions', () => {
    const combiner = new FactorCombiner({
      factorDirections: { MomentumFactor: FACTOR_DIRECTION.POSITIVE },
    });

    combiner.setDirections({ VolatilityFactor: FACTOR_DIRECTION.NEGATIVE });

    expect(combiner.factorDirections.MomentumFactor).toBe(FACTOR_DIRECTION.POSITIVE);
    expect(combiner.factorDirections.VolatilityFactor).toBe(FACTOR_DIRECTION.NEGATIVE);
  });
});

// ============================================
// calculateScores 方法测试
// ============================================

describe('FactorCombiner calculateScores', () => {
  let combiner;

  beforeEach(() => {
    combiner = new FactorCombiner({
      factorWeights: { Factor1: 0.6, Factor2: 0.4 },
      normalizationMethod: NORMALIZATION_METHOD.NONE,
      combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
    });
  });

  it('should calculate scores for multiple symbols', () => {
    const factorValues = new Map([
      ['Factor1', new Map([['BTC/USDT', 1], ['ETH/USDT', 0.5]])],
      ['Factor2', new Map([['BTC/USDT', 0.8], ['ETH/USDT', 0.6]])],
    ]);
    const symbols = ['BTC/USDT', 'ETH/USDT'];

    const scores = combiner.calculateScores(factorValues, symbols);

    expect(scores.get('BTC/USDT')).toBeCloseTo(0.92, 2); // 1*0.6 + 0.8*0.4
    expect(scores.get('ETH/USDT')).toBeCloseTo(0.54, 2); // 0.5*0.6 + 0.6*0.4
  });

  it('should cache last scores', () => {
    const factorValues = new Map([
      ['Factor1', new Map([['BTC/USDT', 1]])],
    ]);
    const symbols = ['BTC/USDT'];

    combiner.calculateScores(factorValues, symbols);

    expect(combiner.lastScores).not.toBeNull();
    expect(combiner.lastScores.has('BTC/USDT')).toBe(true);
  });

  it('should emit scoresCalculated event', () => {
    const factorValues = new Map([
      ['Factor1', new Map([['BTC/USDT', 1]])],
    ]);
    const symbols = ['BTC/USDT'];
    const eventHandler = vi.fn();

    combiner.on('scoresCalculated', eventHandler);
    combiner.calculateScores(factorValues, symbols);

    expect(eventHandler).toHaveBeenCalledWith({
      scores: expect.any(Map),
      symbols: 1,
    });
  });

  it('should handle null values', () => {
    const factorValues = new Map([
      ['Factor1', new Map([['BTC/USDT', 1], ['ETH/USDT', null]])],
      ['Factor2', new Map([['BTC/USDT', 0.8], ['ETH/USDT', 0.6]])],
    ]);
    const symbols = ['BTC/USDT', 'ETH/USDT'];

    const scores = combiner.calculateScores(factorValues, symbols);

    expect(scores.get('BTC/USDT')).toBeDefined();
    // ETH has partial data
    expect(scores.get('ETH/USDT')).toBeDefined();
  });
});

// ============================================
// generateRankings 方法测试
// ============================================

describe('FactorCombiner generateRankings', () => {
  it('should generate descending rankings', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
    ]);

    const rankings = combiner.generateRankings(scores, 'descending');

    expect(rankings[0].symbol).toBe('BTC/USDT');
    expect(rankings[0].rank).toBe(1);
    expect(rankings[1].symbol).toBe('ETH/USDT');
    expect(rankings[1].rank).toBe(2);
    expect(rankings[2].symbol).toBe('SOL/USDT');
    expect(rankings[2].rank).toBe(3);
  });

  it('should generate ascending rankings', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
    ]);

    const rankings = combiner.generateRankings(scores, 'ascending');

    expect(rankings[0].symbol).toBe('SOL/USDT');
    expect(rankings[0].rank).toBe(1);
    expect(rankings[1].symbol).toBe('ETH/USDT');
    expect(rankings[1].rank).toBe(2);
    expect(rankings[2].symbol).toBe('BTC/USDT');
    expect(rankings[2].rank).toBe(3);
  });

  it('should include percentile in rankings', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
      ['ADA/USDT', 0.3],
    ]);

    const rankings = combiner.generateRankings(scores, 'descending');

    expect(rankings[0].percentile).toBe(100);
    expect(rankings[3].percentile).toBe(25);
  });

  it('should filter out null values', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', null],
      ['SOL/USDT', 0.5],
    ]);

    const rankings = combiner.generateRankings(scores);

    expect(rankings.length).toBe(2);
  });

  it('should cache last rankings', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([['BTC/USDT', 0.9]]);

    combiner.generateRankings(scores);

    expect(combiner.lastRankings).not.toBeNull();
    expect(combiner.lastRankings.length).toBe(1);
  });

  it('should emit rankingsGenerated event', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([['BTC/USDT', 0.9]]);
    const eventHandler = vi.fn();

    combiner.on('rankingsGenerated', eventHandler);
    combiner.generateRankings(scores);

    expect(eventHandler).toHaveBeenCalledWith({
      count: 1,
      direction: 'descending',
    });
  });
});

// ============================================
// getTopN 方法测试
// ============================================

describe('FactorCombiner getTopN', () => {
  it('should return top N assets', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
      ['ADA/USDT', 0.3],
    ]);

    const topN = combiner.getTopN(scores, 2);

    expect(topN.length).toBe(2);
    expect(topN[0].symbol).toBe('BTC/USDT');
    expect(topN[1].symbol).toBe('ETH/USDT');
  });

  it('should handle N larger than available assets', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
    ]);

    const topN = combiner.getTopN(scores, 5);

    expect(topN.length).toBe(2);
  });
});

// ============================================
// getBottomN 方法测试
// ============================================

describe('FactorCombiner getBottomN', () => {
  it('should return bottom N assets', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
      ['ADA/USDT', 0.3],
    ]);

    const bottomN = combiner.getBottomN(scores, 2);

    expect(bottomN.length).toBe(2);
    expect(bottomN[0].symbol).toBe('ADA/USDT');
    expect(bottomN[1].symbol).toBe('SOL/USDT');
  });
});

// ============================================
// getTopBottomN 方法测试
// ============================================

describe('FactorCombiner getTopBottomN', () => {
  it('should return both long and short assets', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
      ['ADA/USDT', 0.3],
      ['DOT/USDT', 0.1],
    ]);

    const result = combiner.getTopBottomN(scores, 2, 2);

    expect(result.long.length).toBe(2);
    expect(result.short.length).toBe(2);
    expect(result.long[0].symbol).toBe('BTC/USDT');
    expect(result.long[1].symbol).toBe('ETH/USDT');
    expect(result.short[0].symbol).toBe('DOT/USDT');
    expect(result.short[1].symbol).toBe('ADA/USDT');
  });

  it('should use same N for both if bottomN not specified', () => {
    const combiner = new FactorCombiner();
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
      ['ADA/USDT', 0.3],
    ]);

    const result = combiner.getTopBottomN(scores, 2);

    expect(result.long.length).toBe(2);
    expect(result.short.length).toBe(2);
  });
});

// ============================================
// 标准化方法测试
// ============================================

describe('Normalization Methods', () => {
  describe('Z-Score Normalization', () => {
    it('should normalize using Z-Score', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 1 },
        normalizationMethod: NORMALIZATION_METHOD.ZSCORE,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      });

      const factorValues = new Map([
        ['Factor1', new Map([
          ['A', 10],
          ['B', 20],
          ['C', 30],
        ])],
      ]);
      const symbols = ['A', 'B', 'C'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // Z-score: mean=20, std≈8.16
      expect(scores.get('A')).toBeCloseTo(-1.22, 1);
      expect(scores.get('B')).toBeCloseTo(0, 1);
      expect(scores.get('C')).toBeCloseTo(1.22, 1);
    });

    it('should handle zero standard deviation', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 1 },
        normalizationMethod: NORMALIZATION_METHOD.ZSCORE,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      });

      const factorValues = new Map([
        ['Factor1', new Map([
          ['A', 10],
          ['B', 10],
          ['C', 10],
        ])],
      ]);
      const symbols = ['A', 'B', 'C'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // All same values -> all 0
      expect(scores.get('A')).toBe(0);
      expect(scores.get('B')).toBe(0);
      expect(scores.get('C')).toBe(0);
    });
  });

  describe('Min-Max Normalization', () => {
    it('should normalize to 0-1 range', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 1 },
        normalizationMethod: NORMALIZATION_METHOD.MIN_MAX,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      });

      const factorValues = new Map([
        ['Factor1', new Map([
          ['A', 0],
          ['B', 50],
          ['C', 100],
        ])],
      ]);
      const symbols = ['A', 'B', 'C'];

      const scores = combiner.calculateScores(factorValues, symbols);

      expect(scores.get('A')).toBe(0);
      expect(scores.get('B')).toBe(0.5);
      expect(scores.get('C')).toBe(1);
    });

    it('should handle zero range', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 1 },
        normalizationMethod: NORMALIZATION_METHOD.MIN_MAX,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      });

      const factorValues = new Map([
        ['Factor1', new Map([
          ['A', 50],
          ['B', 50],
          ['C', 50],
        ])],
      ]);
      const symbols = ['A', 'B', 'C'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // All same values -> all 0.5
      expect(scores.get('A')).toBe(0.5);
      expect(scores.get('B')).toBe(0.5);
      expect(scores.get('C')).toBe(0.5);
    });
  });

  describe('Percentile Normalization', () => {
    it('should calculate percentile ranks', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 1 },
        normalizationMethod: NORMALIZATION_METHOD.PERCENTILE,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      });

      const factorValues = new Map([
        ['Factor1', new Map([
          ['A', 10],
          ['B', 20],
          ['C', 30],
          ['D', 40],
        ])],
      ]);
      const symbols = ['A', 'B', 'C', 'D'];

      const scores = combiner.calculateScores(factorValues, symbols);

      expect(scores.get('A')).toBe(0.25);
      expect(scores.get('B')).toBe(0.5);
      expect(scores.get('C')).toBe(0.75);
      expect(scores.get('D')).toBe(1);
    });
  });

  describe('Rank Normalization', () => {
    it('should normalize based on rank', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 1 },
        normalizationMethod: NORMALIZATION_METHOD.RANK,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      });

      const factorValues = new Map([
        ['Factor1', new Map([
          ['A', 10],
          ['B', 20],
          ['C', 30],
        ])],
      ]);
      const symbols = ['A', 'B', 'C'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // Ranks: A=1, B=2, C=3, normalized by n=3
      expect(scores.get('A')).toBeCloseTo(1 / 3, 2);
      expect(scores.get('B')).toBeCloseTo(2 / 3, 2);
      expect(scores.get('C')).toBe(1);
    });
  });

  describe('Robust Normalization', () => {
    it('should normalize using median and IQR', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 1 },
        normalizationMethod: NORMALIZATION_METHOD.ROBUST,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      });

      const factorValues = new Map([
        ['Factor1', new Map([
          ['A', 10],
          ['B', 20],
          ['C', 30],
          ['D', 40],
          ['E', 50],
        ])],
      ]);
      const symbols = ['A', 'B', 'C', 'D', 'E'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // Median = 30, Q1 = 20, Q3 = 40, IQR = 20
      expect(scores.get('C')).toBe(0); // Median value
      expect(scores.get('A')).toBeCloseTo(-1, 1); // (10-30)/20
    });
  });

  describe('No Normalization', () => {
    it('should keep original values', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 1 },
        normalizationMethod: NORMALIZATION_METHOD.NONE,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      });

      const factorValues = new Map([
        ['Factor1', new Map([
          ['A', 10],
          ['B', 20],
          ['C', 30],
        ])],
      ]);
      const symbols = ['A', 'B', 'C'];

      const scores = combiner.calculateScores(factorValues, symbols);

      expect(scores.get('A')).toBe(10);
      expect(scores.get('B')).toBe(20);
      expect(scores.get('C')).toBe(30);
    });
  });
});

// ============================================
// 因子方向调整测试
// ============================================

describe('Factor Direction Adjustment', () => {
  it('should negate negative direction factors', () => {
    const combiner = new FactorCombiner({
      factorWeights: { Factor1: 1 },
      factorDirections: { Factor1: FACTOR_DIRECTION.NEGATIVE },
      normalizationMethod: NORMALIZATION_METHOD.NONE,
      combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      adjustForDirection: true,
    });

    const factorValues = new Map([
      ['Factor1', new Map([
        ['A', 10],
        ['B', 20],
      ])],
    ]);
    const symbols = ['A', 'B'];

    const scores = combiner.calculateScores(factorValues, symbols);

    expect(scores.get('A')).toBe(-10);
    expect(scores.get('B')).toBe(-20);
  });

  it('should not adjust when adjustForDirection is false', () => {
    const combiner = new FactorCombiner({
      factorWeights: { Factor1: 1 },
      factorDirections: { Factor1: FACTOR_DIRECTION.NEGATIVE },
      normalizationMethod: NORMALIZATION_METHOD.NONE,
      combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      adjustForDirection: false,
    });

    const factorValues = new Map([
      ['Factor1', new Map([
        ['A', 10],
        ['B', 20],
      ])],
    ]);
    const symbols = ['A', 'B'];

    const scores = combiner.calculateScores(factorValues, symbols);

    expect(scores.get('A')).toBe(10);
    expect(scores.get('B')).toBe(20);
  });
});

// ============================================
// 组合方法测试
// ============================================

describe('Combination Methods', () => {
  describe('Weighted Sum', () => {
    it('should calculate weighted sum', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 0.6, Factor2: 0.4 },
        normalizationMethod: NORMALIZATION_METHOD.NONE,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_SUM,
      });

      const factorValues = new Map([
        ['Factor1', new Map([['A', 1]])],
        ['Factor2', new Map([['A', 1]])],
      ]);
      const symbols = ['A'];

      const scores = combiner.calculateScores(factorValues, symbols);

      expect(scores.get('A')).toBe(1);
    });
  });

  describe('Weighted Average', () => {
    it('should calculate weighted average', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 0.6, Factor2: 0.4 },
        normalizationMethod: NORMALIZATION_METHOD.NONE,
        combinationMethod: COMBINATION_METHOD.WEIGHTED_AVERAGE,
      });

      const factorValues = new Map([
        ['Factor1', new Map([['A', 10]])],
        ['Factor2', new Map([['A', 20]])],
      ]);
      const symbols = ['A'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // (10*0.6 + 20*0.4) / (0.6 + 0.4) = 14
      expect(scores.get('A')).toBe(14);
    });
  });

  describe('Equal Weight', () => {
    it('should calculate simple average', () => {
      const combiner = new FactorCombiner({
        normalizationMethod: NORMALIZATION_METHOD.NONE,
        combinationMethod: COMBINATION_METHOD.EQUAL,
      });

      const factorValues = new Map([
        ['Factor1', new Map([['A', 10]])],
        ['Factor2', new Map([['A', 20]])],
        ['Factor3', new Map([['A', 30]])],
      ]);
      const symbols = ['A'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // (10 + 20 + 30) / 3 = 20
      expect(scores.get('A')).toBe(20);
    });
  });

  describe('Rank Average', () => {
    it('should calculate based on ranks', () => {
      const combiner = new FactorCombiner({
        factorWeights: { Factor1: 1, Factor2: 1 },
        normalizationMethod: NORMALIZATION_METHOD.NONE,
        combinationMethod: COMBINATION_METHOD.RANK_AVERAGE,
      });

      const factorValues = new Map([
        ['Factor1', new Map([['A', 100], ['B', 50], ['C', 10]])],
        ['Factor2', new Map([['A', 10], ['B', 50], ['C', 100]])],
      ]);
      const symbols = ['A', 'B', 'C'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // A: Factor1 rank=1, Factor2 rank=3, avg=(1+3)/2=2
      // B: Factor1 rank=2, Factor2 rank=2, avg=(2+2)/2=2
      // C: Factor1 rank=3, Factor2 rank=1, avg=(3+1)/2=2
      // All should have similar scores due to opposite rankings
      expect(scores.get('A')).toBe(scores.get('C'));
    });
  });

  describe('IC Weighted', () => {
    it('should fallback to equal when no IC data', () => {
      const combiner = new FactorCombiner({
        normalizationMethod: NORMALIZATION_METHOD.NONE,
        combinationMethod: COMBINATION_METHOD.IC_WEIGHTED,
      });

      const factorValues = new Map([
        ['Factor1', new Map([['A', 10]])],
        ['Factor2', new Map([['A', 20]])],
      ]);
      const symbols = ['A'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // Fallback to equal: (10 + 20) / 2 = 15
      expect(scores.get('A')).toBe(15);
    });

    it('should use IC as weights', () => {
      const combiner = new FactorCombiner({
        normalizationMethod: NORMALIZATION_METHOD.NONE,
        combinationMethod: COMBINATION_METHOD.IC_WEIGHTED,
      });

      combiner.updateFactorIC('Factor1', 0.5);
      combiner.updateFactorIC('Factor2', 0.25);

      const factorValues = new Map([
        ['Factor1', new Map([['A', 10]])],
        ['Factor2', new Map([['A', 20]])],
      ]);
      const symbols = ['A'];

      const scores = combiner.calculateScores(factorValues, symbols);

      // IC weighted: (10*0.5 + 20*0.25) / (0.5 + 0.25) ≈ 13.33
      expect(scores.get('A')).toBeCloseTo(13.33, 1);
    });
  });
});

// ============================================
// updateFactorIC 方法测试
// ============================================

describe('FactorCombiner updateFactorIC', () => {
  it('should store IC value', () => {
    const combiner = new FactorCombiner();

    combiner.updateFactorIC('MomentumFactor', 0.35);

    expect(combiner.factorICs.get('MomentumFactor')).toBe(0.35);
  });

  it('should update existing IC value', () => {
    const combiner = new FactorCombiner();

    combiner.updateFactorIC('MomentumFactor', 0.35);
    combiner.updateFactorIC('MomentumFactor', 0.42);

    expect(combiner.factorICs.get('MomentumFactor')).toBe(0.42);
  });
});

// ============================================
// getConfig 方法测试
// ============================================

describe('FactorCombiner getConfig', () => {
  it('should return current configuration', () => {
    const combiner = new FactorCombiner({
      factorWeights: { Factor1: 0.5 },
      normalizationMethod: NORMALIZATION_METHOD.MIN_MAX,
      combinationMethod: COMBINATION_METHOD.WEIGHTED_AVERAGE,
      adjustForDirection: false,
      factorDirections: { Factor1: FACTOR_DIRECTION.NEGATIVE },
    });

    const config = combiner.getConfig();

    expect(config.factorWeights.Factor1).toBe(0.5);
    expect(config.normalizationMethod).toBe(NORMALIZATION_METHOD.MIN_MAX);
    expect(config.combinationMethod).toBe(COMBINATION_METHOD.WEIGHTED_AVERAGE);
    expect(config.adjustForDirection).toBe(false);
    expect(config.factorDirections.Factor1).toBe(FACTOR_DIRECTION.NEGATIVE);
  });

  it('should return a copy of weights', () => {
    const combiner = new FactorCombiner({
      factorWeights: { Factor1: 0.5 },
    });

    const config = combiner.getConfig();
    config.factorWeights.Factor1 = 0.9;

    expect(combiner.factorWeights.Factor1).toBe(0.5);
  });
});

// ============================================
// getStats 方法测试
// ============================================

describe('FactorCombiner getStats', () => {
  it('should return statistics', () => {
    const combiner = new FactorCombiner({
      factorWeights: { Factor1: 0.6, Factor2: 0.4 },
    });

    const stats = combiner.getStats();

    expect(stats.numFactors).toBe(2);
    expect(stats.totalWeight).toBe(1);
    expect(stats.lastScoresCount).toBe(0);
    expect(stats.lastRankingsCount).toBe(0);
  });

  it('should update stats after calculations', () => {
    const combiner = new FactorCombiner({
      factorWeights: { Factor1: 1 },
      normalizationMethod: NORMALIZATION_METHOD.NONE,
    });

    const factorValues = new Map([
      ['Factor1', new Map([['A', 10], ['B', 20], ['C', 30]])],
    ]);
    const symbols = ['A', 'B', 'C'];

    combiner.calculateScores(factorValues, symbols);
    combiner.generateRankings(combiner.lastScores);

    const stats = combiner.getStats();

    expect(stats.lastScoresCount).toBe(3);
    expect(stats.lastRankingsCount).toBe(3);
  });
});

// ============================================
// Factory Functions 测试
// ============================================

describe('Factory Functions', () => {
  describe('createDefaultCombiner', () => {
    it('should create combiner with default settings', () => {
      const combiner = createDefaultCombiner();

      expect(combiner).toBeInstanceOf(FactorCombiner);
      expect(combiner.normalizationMethod).toBe(NORMALIZATION_METHOD.ZSCORE);
      expect(combiner.combinationMethod).toBe(COMBINATION_METHOD.WEIGHTED_AVERAGE);
      expect(combiner.adjustForDirection).toBe(true);
    });

    it('should accept factor weights', () => {
      const combiner = createDefaultCombiner({ Factor1: 0.5 });

      expect(combiner.factorWeights.Factor1).toBe(0.5);
    });
  });

  describe('createEqualWeightCombiner', () => {
    it('should create equal weight combiner', () => {
      const combiner = createEqualWeightCombiner();

      expect(combiner).toBeInstanceOf(FactorCombiner);
      expect(combiner.normalizationMethod).toBe(NORMALIZATION_METHOD.PERCENTILE);
      expect(combiner.combinationMethod).toBe(COMBINATION_METHOD.EQUAL);
      expect(combiner.adjustForDirection).toBe(true);
    });
  });

  describe('createRankCombiner', () => {
    it('should create rank-based combiner', () => {
      const combiner = createRankCombiner();

      expect(combiner).toBeInstanceOf(FactorCombiner);
      expect(combiner.normalizationMethod).toBe(NORMALIZATION_METHOD.RANK);
      expect(combiner.combinationMethod).toBe(COMBINATION_METHOD.RANK_AVERAGE);
      expect(combiner.adjustForDirection).toBe(true);
    });

    it('should accept factor weights', () => {
      const combiner = createRankCombiner({ Factor1: 0.7 });

      expect(combiner.factorWeights.Factor1).toBe(0.7);
    });
  });
});

// ============================================
// EventEmitter 功能测试
// ============================================

describe('FactorCombiner EventEmitter', () => {
  it('should extend EventEmitter', () => {
    const combiner = new FactorCombiner();

    expect(typeof combiner.on).toBe('function');
    expect(typeof combiner.emit).toBe('function');
    expect(typeof combiner.off).toBe('function');
  });

  it('should support multiple listeners', () => {
    const combiner = new FactorCombiner();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    combiner.on('weightsUpdated', handler1);
    combiner.on('weightsUpdated', handler2);
    combiner.setWeights({ Factor1: 0.5 });

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });
});

// ============================================
// Edge Cases 测试
// ============================================

describe('Edge Cases', () => {
  it('should handle empty factor values', () => {
    const combiner = new FactorCombiner();
    const factorValues = new Map();
    const symbols = ['A', 'B'];

    const scores = combiner.calculateScores(factorValues, symbols);

    expect(scores.get('A')).toBeNull();
    expect(scores.get('B')).toBeNull();
  });

  it('should handle empty symbols', () => {
    const combiner = new FactorCombiner();
    const factorValues = new Map([
      ['Factor1', new Map([['A', 10]])],
    ]);
    const symbols = [];

    const scores = combiner.calculateScores(factorValues, symbols);

    expect(scores.size).toBe(0);
  });

  it('should handle all null values in a factor', () => {
    const combiner = new FactorCombiner({
      factorWeights: { Factor1: 1 },
      normalizationMethod: NORMALIZATION_METHOD.ZSCORE,
    });

    const factorValues = new Map([
      ['Factor1', new Map([['A', null], ['B', null]])],
    ]);
    const symbols = ['A', 'B'];

    const scores = combiner.calculateScores(factorValues, symbols);

    expect(scores.get('A')).toBeNull();
    expect(scores.get('B')).toBeNull();
  });

  it('should handle single value', () => {
    const combiner = new FactorCombiner({
      factorWeights: { Factor1: 1 },
      normalizationMethod: NORMALIZATION_METHOD.ZSCORE,
    });

    const factorValues = new Map([
      ['Factor1', new Map([['A', 100]])],
    ]);
    const symbols = ['A'];

    const scores = combiner.calculateScores(factorValues, symbols);

    // Single value normalized to 0 in Z-score
    expect(scores.get('A')).toBe(0);
  });
});
