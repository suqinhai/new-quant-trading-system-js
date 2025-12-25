/**
 * BaseFactor 单元测试
 * Base Factor Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BaseFactor,
  FACTOR_CATEGORY,
  FACTOR_DIRECTION,
  FACTOR_FREQUENCY,
} from '../../src/factors/BaseFactor.js';

// ============================================
// FACTOR_CATEGORY 常量测试
// ============================================

describe('FACTOR_CATEGORY Constants', () => {
  it('should have all factor categories', () => {
    expect(FACTOR_CATEGORY.MOMENTUM).toBe('momentum');
    expect(FACTOR_CATEGORY.VOLATILITY).toBe('volatility');
    expect(FACTOR_CATEGORY.VOLUME).toBe('volume');
    expect(FACTOR_CATEGORY.MONEY_FLOW).toBe('money_flow');
    expect(FACTOR_CATEGORY.FUNDING).toBe('funding');
    expect(FACTOR_CATEGORY.LIQUIDITY).toBe('liquidity');
    expect(FACTOR_CATEGORY.SENTIMENT).toBe('sentiment');
    expect(FACTOR_CATEGORY.TECHNICAL).toBe('technical');
    expect(FACTOR_CATEGORY.FUNDAMENTAL).toBe('fundamental');
  });
});

// ============================================
// FACTOR_DIRECTION 常量测试
// ============================================

describe('FACTOR_DIRECTION Constants', () => {
  it('should have all factor directions', () => {
    expect(FACTOR_DIRECTION.POSITIVE).toBe('positive');
    expect(FACTOR_DIRECTION.NEGATIVE).toBe('negative');
    expect(FACTOR_DIRECTION.NEUTRAL).toBe('neutral');
  });
});

// ============================================
// FACTOR_FREQUENCY 常量测试
// ============================================

describe('FACTOR_FREQUENCY Constants', () => {
  it('should have all factor frequencies', () => {
    expect(FACTOR_FREQUENCY.TICK).toBe('tick');
    expect(FACTOR_FREQUENCY.MINUTE).toBe('1m');
    expect(FACTOR_FREQUENCY.HOURLY).toBe('1h');
    expect(FACTOR_FREQUENCY.DAILY).toBe('1d');
    expect(FACTOR_FREQUENCY.WEEKLY).toBe('1w');
  });
});

// ============================================
// BaseFactor 构造函数测试
// ============================================

describe('BaseFactor Constructor', () => {
  it('should initialize with default config', () => {
    const factor = new BaseFactor();

    expect(factor.name).toBe('BaseFactor');
    expect(factor.category).toBe(FACTOR_CATEGORY.TECHNICAL);
    expect(factor.direction).toBe(FACTOR_DIRECTION.POSITIVE);
    expect(factor.frequency).toBe(FACTOR_FREQUENCY.DAILY);
    expect(factor.description).toBe('');
    expect(factor.params).toEqual({});
  });

  it('should accept custom config', () => {
    const factor = new BaseFactor({
      name: 'CustomFactor',
      category: FACTOR_CATEGORY.MOMENTUM,
      direction: FACTOR_DIRECTION.NEGATIVE,
      frequency: FACTOR_FREQUENCY.HOURLY,
      description: 'A custom factor',
      params: { period: 14 },
    });

    expect(factor.name).toBe('CustomFactor');
    expect(factor.category).toBe(FACTOR_CATEGORY.MOMENTUM);
    expect(factor.direction).toBe(FACTOR_DIRECTION.NEGATIVE);
    expect(factor.frequency).toBe(FACTOR_FREQUENCY.HOURLY);
    expect(factor.description).toBe('A custom factor');
    expect(factor.params.period).toBe(14);
  });

  it('should initialize value cache', () => {
    const factor = new BaseFactor();

    expect(factor.values).toBeInstanceOf(Map);
    expect(factor.values.size).toBe(0);
  });

  it('should initialize history storage', () => {
    const factor = new BaseFactor();

    expect(factor.history).toBeInstanceOf(Map);
    expect(factor.maxHistory).toBe(100);
  });

  it('should accept custom maxHistory', () => {
    const factor = new BaseFactor({ maxHistory: 50 });

    expect(factor.maxHistory).toBe(50);
  });

  it('should initialize metadata', () => {
    const factor = new BaseFactor();

    expect(factor.metadata).toBeDefined();
    expect(factor.metadata.version).toBe('1.0.0');
    expect(factor.metadata.author).toBe('system');
    expect(factor.metadata.createdAt).toBeDefined();
    expect(factor.metadata.lastUpdated).toBeNull();
  });

  it('should accept custom metadata', () => {
    const factor = new BaseFactor({
      metadata: {
        version: '2.0.0',
        author: 'developer',
      },
    });

    expect(factor.metadata.version).toBe('2.0.0');
    expect(factor.metadata.author).toBe('developer');
  });

  it('should initialize statistics', () => {
    const factor = new BaseFactor();

    expect(factor.stats).toBeDefined();
    expect(factor.stats.totalCalculations).toBe(0);
    expect(factor.stats.lastCalculationTime).toBe(0);
    expect(factor.stats.averageCalculationTime).toBe(0);
    expect(factor.stats.errors).toBe(0);
  });
});

// ============================================
// calculate 方法测试
// ============================================

describe('BaseFactor calculate', () => {
  it('should throw error when not implemented', async () => {
    const factor = new BaseFactor();

    await expect(factor.calculate('BTC/USDT', {})).rejects.toThrow(
      '必须由子类实现'
    );
  });
});

// ============================================
// calculateBatch 方法测试
// ============================================

describe('BaseFactor calculateBatch', () => {
  let TestFactor;

  beforeEach(() => {
    // Create a test factor that implements calculate
    TestFactor = class extends BaseFactor {
      async calculate(symbol, data) {
        return data.value || 0;
      }
    };
  });

  it('should calculate for multiple symbols', async () => {
    const factor = new TestFactor({ name: 'TestFactor' });

    const dataMap = {
      'BTC/USDT': { value: 0.5 },
      'ETH/USDT': { value: 0.3 },
      'SOL/USDT': { value: 0.2 },
    };

    const results = await factor.calculateBatch(dataMap);

    expect(results.size).toBe(3);
    expect(results.get('BTC/USDT')).toBe(0.5);
    expect(results.get('ETH/USDT')).toBe(0.3);
    expect(results.get('SOL/USDT')).toBe(0.2);
  });

  it('should update statistics after batch calculation', async () => {
    const factor = new TestFactor({ name: 'TestFactor' });

    const dataMap = {
      'BTC/USDT': { value: 0.5 },
      'ETH/USDT': { value: 0.3 },
    };

    await factor.calculateBatch(dataMap);

    expect(factor.stats.totalCalculations).toBe(1);
    expect(factor.stats.lastCalculationTime).toBeGreaterThanOrEqual(0);
  });

  it('should handle errors in individual calculations', async () => {
    const ErrorFactor = class extends BaseFactor {
      async calculate(symbol, data) {
        if (symbol === 'ERROR/USDT') {
          throw new Error('Calculation error');
        }
        return data.value;
      }
    };

    const factor = new ErrorFactor({ name: 'ErrorFactor' });

    const dataMap = {
      'BTC/USDT': { value: 0.5 },
      'ERROR/USDT': { value: 0.3 },
    };

    const results = await factor.calculateBatch(dataMap);

    expect(results.get('BTC/USDT')).toBe(0.5);
    expect(results.get('ERROR/USDT')).toBeNull();
    expect(factor.stats.errors).toBe(1);
  });

  it('should emit calculated event', async () => {
    const factor = new TestFactor({ name: 'TestFactor' });

    const dataMap = {
      'BTC/USDT': { value: 0.5 },
    };

    const eventPromise = new Promise(resolve => {
      factor.on('calculated', resolve);
    });

    await factor.calculateBatch(dataMap);

    const event = await eventPromise;
    expect(event.factor).toBe('TestFactor');
    expect(event.count).toBe(1);
  });

  it('should update cache after calculation', async () => {
    const factor = new TestFactor({ name: 'TestFactor' });

    const dataMap = {
      'BTC/USDT': { value: 0.5 },
    };

    await factor.calculateBatch(dataMap);

    expect(factor.values.has('BTC/USDT')).toBe(true);
    expect(factor.values.get('BTC/USDT').value).toBe(0.5);
  });
});

// ============================================
// getValue 方法测试
// ============================================

describe('BaseFactor getValue', () => {
  it('should return cached value', () => {
    const factor = new BaseFactor();
    factor.values.set('BTC/USDT', { value: 0.8, timestamp: Date.now() });

    expect(factor.getValue('BTC/USDT')).toBe(0.8);
  });

  it('should return null for non-existent symbol', () => {
    const factor = new BaseFactor();

    expect(factor.getValue('UNKNOWN/USDT')).toBeNull();
  });
});

// ============================================
// getAllValues 方法测试
// ============================================

describe('BaseFactor getAllValues', () => {
  it('should return all cached values', () => {
    const factor = new BaseFactor();
    factor.values.set('BTC/USDT', { value: 0.8, timestamp: Date.now() });
    factor.values.set('ETH/USDT', { value: 0.6, timestamp: Date.now() });

    const allValues = factor.getAllValues();

    expect(allValues.size).toBe(2);
    expect(allValues.get('BTC/USDT')).toBe(0.8);
    expect(allValues.get('ETH/USDT')).toBe(0.6);
  });

  it('should return empty map when no values', () => {
    const factor = new BaseFactor();

    const allValues = factor.getAllValues();

    expect(allValues.size).toBe(0);
  });
});

// ============================================
// getHistory 方法测试
// ============================================

describe('BaseFactor getHistory', () => {
  it('should return history for symbol', () => {
    const factor = new BaseFactor();
    factor.history.set('BTC/USDT', [
      { value: 0.5, timestamp: 1 },
      { value: 0.6, timestamp: 2 },
      { value: 0.7, timestamp: 3 },
    ]);

    const history = factor.getHistory('BTC/USDT');

    expect(history.length).toBe(3);
    expect(history[0].value).toBe(0.5);
    expect(history[2].value).toBe(0.7);
  });

  it('should respect limit parameter', () => {
    const factor = new BaseFactor();
    factor.history.set('BTC/USDT', [
      { value: 0.5, timestamp: 1 },
      { value: 0.6, timestamp: 2 },
      { value: 0.7, timestamp: 3 },
    ]);

    const history = factor.getHistory('BTC/USDT', 2);

    expect(history.length).toBe(2);
    expect(history[0].value).toBe(0.6);
    expect(history[1].value).toBe(0.7);
  });

  it('should return empty array for non-existent symbol', () => {
    const factor = new BaseFactor();

    const history = factor.getHistory('UNKNOWN/USDT');

    expect(history).toEqual([]);
  });
});

// ============================================
// normalizeZScore 方法测试
// ============================================

describe('BaseFactor normalizeZScore', () => {
  it('should normalize values using Z-Score', () => {
    const factor = new BaseFactor();
    const values = new Map([
      ['A', 10],
      ['B', 20],
      ['C', 30],
    ]);

    const normalized = factor.normalizeZScore(values);

    // Mean should be 20, std should be ~8.16
    expect(normalized.get('A')).toBeCloseTo(-1.22, 1);
    expect(normalized.get('B')).toBeCloseTo(0, 1);
    expect(normalized.get('C')).toBeCloseTo(1.22, 1);
  });

  it('should handle null values', () => {
    const factor = new BaseFactor();
    const values = new Map([
      ['A', 10],
      ['B', null],
      ['C', 30],
    ]);

    const normalized = factor.normalizeZScore(values);

    expect(normalized.get('A')).toBeDefined();
    expect(normalized.get('B')).toBeNull();
    expect(normalized.get('C')).toBeDefined();
  });

  it('should handle single value', () => {
    const factor = new BaseFactor();
    const values = new Map([['A', 10]]);

    const normalized = factor.normalizeZScore(values);

    expect(normalized.get('A')).toBe(10); // Returns original when < 2 values
  });

  it('should handle all same values', () => {
    const factor = new BaseFactor();
    const values = new Map([
      ['A', 10],
      ['B', 10],
      ['C', 10],
    ]);

    const normalized = factor.normalizeZScore(values);

    // When std is 0, returns original values
    expect(normalized.get('A')).toBe(10);
  });
});

// ============================================
// normalizeMinMax 方法测试
// ============================================

describe('BaseFactor normalizeMinMax', () => {
  it('should normalize values to 0-1 range', () => {
    const factor = new BaseFactor();
    const values = new Map([
      ['A', 0],
      ['B', 50],
      ['C', 100],
    ]);

    const normalized = factor.normalizeMinMax(values);

    expect(normalized.get('A')).toBe(0);
    expect(normalized.get('B')).toBe(0.5);
    expect(normalized.get('C')).toBe(1);
  });

  it('should handle null values', () => {
    const factor = new BaseFactor();
    const values = new Map([
      ['A', 0],
      ['B', null],
      ['C', 100],
    ]);

    const normalized = factor.normalizeMinMax(values);

    expect(normalized.get('A')).toBe(0);
    expect(normalized.get('B')).toBeNull();
    expect(normalized.get('C')).toBe(1);
  });

  it('should handle all same values', () => {
    const factor = new BaseFactor();
    const values = new Map([
      ['A', 50],
      ['B', 50],
      ['C', 50],
    ]);

    const normalized = factor.normalizeMinMax(values);

    // When range is 0, returns original values
    expect(normalized.get('A')).toBe(50);
  });
});

// ============================================
// percentileRank 方法测试
// ============================================

describe('BaseFactor percentileRank', () => {
  it('should calculate percentile ranks', () => {
    const factor = new BaseFactor();
    const values = new Map([
      ['A', 10],
      ['B', 20],
      ['C', 30],
      ['D', 40],
    ]);

    const ranked = factor.percentileRank(values);

    expect(ranked.get('A')).toBe(0.25);
    expect(ranked.get('B')).toBe(0.5);
    expect(ranked.get('C')).toBe(0.75);
    expect(ranked.get('D')).toBe(1);
  });

  it('should handle null values', () => {
    const factor = new BaseFactor();
    const values = new Map([
      ['A', 10],
      ['B', null],
      ['C', 30],
    ]);

    const ranked = factor.percentileRank(values);

    expect(ranked.get('A')).toBeDefined();
    expect(ranked.get('B')).toBeNull();
    expect(ranked.get('C')).toBeDefined();
  });
});

// ============================================
// clearCache 方法测试
// ============================================

describe('BaseFactor clearCache', () => {
  it('should clear specific symbol cache', () => {
    const factor = new BaseFactor();
    factor.values.set('BTC/USDT', { value: 0.5 });
    factor.values.set('ETH/USDT', { value: 0.3 });
    factor.history.set('BTC/USDT', [{ value: 0.5 }]);
    factor.history.set('ETH/USDT', [{ value: 0.3 }]);

    factor.clearCache('BTC/USDT');

    expect(factor.values.has('BTC/USDT')).toBe(false);
    expect(factor.values.has('ETH/USDT')).toBe(true);
    expect(factor.history.has('BTC/USDT')).toBe(false);
    expect(factor.history.has('ETH/USDT')).toBe(true);
  });

  it('should clear all cache when no symbol specified', () => {
    const factor = new BaseFactor();
    factor.values.set('BTC/USDT', { value: 0.5 });
    factor.values.set('ETH/USDT', { value: 0.3 });
    factor.history.set('BTC/USDT', [{ value: 0.5 }]);
    factor.history.set('ETH/USDT', [{ value: 0.3 }]);

    factor.clearCache();

    expect(factor.values.size).toBe(0);
    expect(factor.history.size).toBe(0);
  });
});

// ============================================
// getInfo 方法测试
// ============================================

describe('BaseFactor getInfo', () => {
  it('should return factor info', () => {
    const factor = new BaseFactor({
      name: 'TestFactor',
      category: FACTOR_CATEGORY.MOMENTUM,
      direction: FACTOR_DIRECTION.POSITIVE,
      frequency: FACTOR_FREQUENCY.HOURLY,
      description: 'Test description',
      params: { period: 14 },
    });

    const info = factor.getInfo();

    expect(info.name).toBe('TestFactor');
    expect(info.category).toBe(FACTOR_CATEGORY.MOMENTUM);
    expect(info.direction).toBe(FACTOR_DIRECTION.POSITIVE);
    expect(info.frequency).toBe(FACTOR_FREQUENCY.HOURLY);
    expect(info.description).toBe('Test description');
    expect(info.params.period).toBe(14);
    expect(info.metadata).toBeDefined();
    expect(info.stats).toBeDefined();
    expect(info.cachedSymbols).toBe(0);
  });

  it('should report cached symbols count', () => {
    const factor = new BaseFactor();
    factor.values.set('BTC/USDT', { value: 0.5 });
    factor.values.set('ETH/USDT', { value: 0.3 });

    const info = factor.getInfo();

    expect(info.cachedSymbols).toBe(2);
  });
});

// ============================================
// toJSON 方法测试
// ============================================

describe('BaseFactor toJSON', () => {
  it('should serialize factor to JSON', () => {
    const factor = new BaseFactor({
      name: 'TestFactor',
      category: FACTOR_CATEGORY.MOMENTUM,
      direction: FACTOR_DIRECTION.POSITIVE,
      frequency: FACTOR_FREQUENCY.HOURLY,
      description: 'Test',
      params: { period: 14 },
    });
    factor.values.set('BTC/USDT', { value: 0.5, timestamp: 12345 });

    const json = factor.toJSON();

    expect(json.name).toBe('TestFactor');
    expect(json.category).toBe(FACTOR_CATEGORY.MOMENTUM);
    expect(json.direction).toBe(FACTOR_DIRECTION.POSITIVE);
    expect(json.frequency).toBe(FACTOR_FREQUENCY.HOURLY);
    expect(json.description).toBe('Test');
    expect(json.params.period).toBe(14);
    expect(json.values['BTC/USDT']).toBeDefined();
  });
});

// ============================================
// _updateCache 内部方法测试
// ============================================

describe('BaseFactor _updateCache', () => {
  it('should update value cache', () => {
    const factor = new BaseFactor();

    factor._updateCache('BTC/USDT', 0.75, { raw: 'data' });

    expect(factor.values.get('BTC/USDT').value).toBe(0.75);
    expect(factor.values.get('BTC/USDT').raw).toEqual({ raw: 'data' });
    expect(factor.values.get('BTC/USDT').timestamp).toBeDefined();
  });

  it('should update history', () => {
    const factor = new BaseFactor();

    factor._updateCache('BTC/USDT', 0.5);
    factor._updateCache('BTC/USDT', 0.6);
    factor._updateCache('BTC/USDT', 0.7);

    const history = factor.history.get('BTC/USDT');
    expect(history.length).toBe(3);
    expect(history[2].value).toBe(0.7);
  });

  it('should limit history to maxHistory', () => {
    const factor = new BaseFactor({ maxHistory: 3 });

    for (let i = 0; i < 10; i++) {
      factor._updateCache('BTC/USDT', i);
    }

    const history = factor.history.get('BTC/USDT');
    expect(history.length).toBe(3);
    expect(history[0].value).toBe(7);
    expect(history[2].value).toBe(9);
  });

  it('should update lastUpdated metadata', () => {
    const factor = new BaseFactor();
    const beforeUpdate = Date.now();

    factor._updateCache('BTC/USDT', 0.5);

    expect(factor.metadata.lastUpdated).toBeGreaterThanOrEqual(beforeUpdate);
  });
});

// ============================================
// EventEmitter 功能测试
// ============================================

describe('BaseFactor EventEmitter', () => {
  it('should emit error event on calculation error', async () => {
    const ErrorFactor = class extends BaseFactor {
      async calculate() {
        throw new Error('Test error');
      }
    };

    const factor = new ErrorFactor({ name: 'ErrorFactor' });

    const errorPromise = new Promise(resolve => {
      factor.on('error', resolve);
    });

    await factor.calculateBatch({ 'BTC/USDT': {} });

    const event = await errorPromise;
    expect(event.symbol).toBe('BTC/USDT');
    expect(event.factor).toBe('ErrorFactor');
    expect(event.error.message).toBe('Test error');
  });
});
