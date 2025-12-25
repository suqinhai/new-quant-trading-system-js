/**
 * FactorRegistry 单元测试
 * Factor Registry Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FactorRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
} from '../../src/factors/FactorRegistry.js';
import { BaseFactor, FACTOR_CATEGORY } from '../../src/factors/BaseFactor.js';

// ============================================
// 测试用因子类
// ============================================

class TestFactor extends BaseFactor {
  constructor(name, category = FACTOR_CATEGORY.TECHNICAL) {
    super({
      name,
      category,
    });
  }

  async calculate(symbol, data) {
    return data.value || 0;
  }
}

// ============================================
// FactorRegistry 构造函数测试
// ============================================

describe('FactorRegistry Constructor', () => {
  it('should initialize with empty factors', () => {
    const registry = new FactorRegistry();

    expect(registry.factors.size).toBe(0);
    expect(registry.dependencies.size).toBe(0);
  });

  it('should initialize category index', () => {
    const registry = new FactorRegistry();

    expect(registry.categoryIndex).toBeInstanceOf(Map);
    expect(registry.categoryIndex.has(FACTOR_CATEGORY.MOMENTUM)).toBe(true);
    expect(registry.categoryIndex.has(FACTOR_CATEGORY.VOLATILITY)).toBe(true);
    expect(registry.categoryIndex.has(FACTOR_CATEGORY.TECHNICAL)).toBe(true);
  });
});

// ============================================
// register 方法测试
// ============================================

describe('FactorRegistry register', () => {
  let registry;

  beforeEach(() => {
    registry = new FactorRegistry();
  });

  it('should register a factor', () => {
    const factor = new TestFactor('TestFactor');

    registry.register(factor);

    expect(registry.factors.has('TestFactor')).toBe(true);
    expect(registry.factors.get('TestFactor')).toBe(factor);
  });

  it('should update category index', () => {
    const factor = new TestFactor('MomentumFactor', FACTOR_CATEGORY.MOMENTUM);

    registry.register(factor);

    const categoryNames = registry.categoryIndex.get(FACTOR_CATEGORY.MOMENTUM);
    expect(categoryNames.has('MomentumFactor')).toBe(true);
  });

  it('should support method chaining', () => {
    const factor1 = new TestFactor('Factor1');
    const factor2 = new TestFactor('Factor2');

    const result = registry.register(factor1).register(factor2);

    expect(result).toBe(registry);
    expect(registry.factors.size).toBe(2);
  });

  it('should record dependencies', () => {
    const factor = new TestFactor('DependentFactor');

    registry.register(factor, { dependencies: ['FactorA', 'FactorB'] });

    const deps = registry.dependencies.get('DependentFactor');
    expect(deps.has('FactorA')).toBe(true);
    expect(deps.has('FactorB')).toBe(true);
  });

  it('should emit registered event', () => {
    const factor = new TestFactor('TestFactor');
    const eventHandler = vi.fn();

    registry.on('registered', eventHandler);
    registry.register(factor);

    expect(eventHandler).toHaveBeenCalledWith({
      name: 'TestFactor',
      category: FACTOR_CATEGORY.TECHNICAL,
      factor,
    });
  });

  it('should emit warning when overwriting', () => {
    const factor1 = new TestFactor('TestFactor');
    const factor2 = new TestFactor('TestFactor');
    const warningHandler = vi.fn();

    registry.on('warning', warningHandler);
    registry.register(factor1);
    registry.register(factor2);

    expect(warningHandler).toHaveBeenCalled();
    expect(warningHandler.mock.calls[0][0].message).toContain('已存在');
  });
});

// ============================================
// registerAll 方法测试
// ============================================

describe('FactorRegistry registerAll', () => {
  it('should register multiple factors', () => {
    const registry = new FactorRegistry();
    const factors = [
      { factor: new TestFactor('Factor1') },
      { factor: new TestFactor('Factor2') },
      { factor: new TestFactor('Factor3') },
    ];

    registry.registerAll(factors);

    expect(registry.factors.size).toBe(3);
    expect(registry.has('Factor1')).toBe(true);
    expect(registry.has('Factor2')).toBe(true);
    expect(registry.has('Factor3')).toBe(true);
  });

  it('should support options for each factor', () => {
    const registry = new FactorRegistry();
    const factors = [
      { factor: new TestFactor('FactorA') },
      { factor: new TestFactor('FactorB'), options: { dependencies: ['FactorA'] } },
    ];

    registry.registerAll(factors);

    const deps = registry.getDependencies('FactorB');
    expect(deps).toContain('FactorA');
  });
});

// ============================================
// unregister 方法测试
// ============================================

describe('FactorRegistry unregister', () => {
  let registry;

  beforeEach(() => {
    registry = new FactorRegistry();
  });

  it('should unregister a factor', () => {
    const factor = new TestFactor('TestFactor');
    registry.register(factor);

    const result = registry.unregister('TestFactor');

    expect(result).toBe(true);
    expect(registry.has('TestFactor')).toBe(false);
  });

  it('should return false for non-existent factor', () => {
    const result = registry.unregister('NonExistent');

    expect(result).toBe(false);
  });

  it('should remove from category index', () => {
    const factor = new TestFactor('MomentumFactor', FACTOR_CATEGORY.MOMENTUM);
    registry.register(factor);

    registry.unregister('MomentumFactor');

    const categoryNames = registry.categoryIndex.get(FACTOR_CATEGORY.MOMENTUM);
    expect(categoryNames.has('MomentumFactor')).toBe(false);
  });

  it('should remove from dependencies', () => {
    const factorA = new TestFactor('FactorA');
    const factorB = new TestFactor('FactorB');
    registry.register(factorA);
    registry.register(factorB, { dependencies: ['FactorA'] });

    registry.unregister('FactorA');

    expect(registry.dependencies.has('FactorA')).toBe(false);
    // FactorA should be removed from FactorB's dependencies
    const depsB = registry.dependencies.get('FactorB');
    expect(depsB?.has('FactorA') || false).toBe(false);
  });

  it('should emit unregistered event', () => {
    const factor = new TestFactor('TestFactor');
    const eventHandler = vi.fn();

    registry.register(factor);
    registry.on('unregistered', eventHandler);
    registry.unregister('TestFactor');

    expect(eventHandler).toHaveBeenCalledWith({ name: 'TestFactor' });
  });
});

// ============================================
// get 方法测试
// ============================================

describe('FactorRegistry get', () => {
  it('should return factor by name', () => {
    const registry = new FactorRegistry();
    const factor = new TestFactor('TestFactor');
    registry.register(factor);

    const result = registry.get('TestFactor');

    expect(result).toBe(factor);
  });

  it('should return null for non-existent factor', () => {
    const registry = new FactorRegistry();

    const result = registry.get('NonExistent');

    expect(result).toBeNull();
  });
});

// ============================================
// has 方法测试
// ============================================

describe('FactorRegistry has', () => {
  it('should return true for existing factor', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('TestFactor'));

    expect(registry.has('TestFactor')).toBe(true);
  });

  it('should return false for non-existent factor', () => {
    const registry = new FactorRegistry();

    expect(registry.has('NonExistent')).toBe(false);
  });
});

// ============================================
// getAll 方法测试
// ============================================

describe('FactorRegistry getAll', () => {
  it('should return all factors', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('Factor1'));
    registry.register(new TestFactor('Factor2'));

    const all = registry.getAll();

    expect(all.size).toBe(2);
    expect(all.has('Factor1')).toBe(true);
    expect(all.has('Factor2')).toBe(true);
  });

  it('should return a copy', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('Factor1'));

    const all = registry.getAll();
    all.delete('Factor1');

    expect(registry.has('Factor1')).toBe(true);
  });
});

// ============================================
// getNames 方法测试
// ============================================

describe('FactorRegistry getNames', () => {
  it('should return all factor names', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('Factor1'));
    registry.register(new TestFactor('Factor2'));
    registry.register(new TestFactor('Factor3'));

    const names = registry.getNames();

    expect(names).toEqual(['Factor1', 'Factor2', 'Factor3']);
  });

  it('should return empty array when no factors', () => {
    const registry = new FactorRegistry();

    const names = registry.getNames();

    expect(names).toEqual([]);
  });
});

// ============================================
// getByCategory 方法测试
// ============================================

describe('FactorRegistry getByCategory', () => {
  it('should return factors by category', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('MomFactor1', FACTOR_CATEGORY.MOMENTUM));
    registry.register(new TestFactor('MomFactor2', FACTOR_CATEGORY.MOMENTUM));
    registry.register(new TestFactor('VolFactor', FACTOR_CATEGORY.VOLATILITY));

    const momentumFactors = registry.getByCategory(FACTOR_CATEGORY.MOMENTUM);

    expect(momentumFactors.length).toBe(2);
    expect(momentumFactors[0].name).toBe('MomFactor1');
    expect(momentumFactors[1].name).toBe('MomFactor2');
  });

  it('should return empty array for empty category', () => {
    const registry = new FactorRegistry();

    const factors = registry.getByCategory(FACTOR_CATEGORY.MOMENTUM);

    expect(factors).toEqual([]);
  });

  it('should return empty array for unknown category', () => {
    const registry = new FactorRegistry();

    const factors = registry.getByCategory('unknown_category');

    expect(factors).toEqual([]);
  });
});

// ============================================
// getDependencies 方法测试
// ============================================

describe('FactorRegistry getDependencies', () => {
  it('should return factor dependencies', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('FactorA'));
    registry.register(new TestFactor('FactorB'), { dependencies: ['FactorA'] });

    const deps = registry.getDependencies('FactorB');

    expect(deps).toEqual(['FactorA']);
  });

  it('should return empty array for factor without dependencies', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('FactorA'));

    const deps = registry.getDependencies('FactorA');

    expect(deps).toEqual([]);
  });

  it('should return empty array for non-existent factor', () => {
    const registry = new FactorRegistry();

    const deps = registry.getDependencies('NonExistent');

    expect(deps).toEqual([]);
  });
});

// ============================================
// getSortedByDependencies 方法测试
// ============================================

describe('FactorRegistry getSortedByDependencies', () => {
  it('should sort factors by dependencies (topological sort)', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('FactorC'), { dependencies: ['FactorB'] });
    registry.register(new TestFactor('FactorB'), { dependencies: ['FactorA'] });
    registry.register(new TestFactor('FactorA'));

    const sorted = registry.getSortedByDependencies();

    expect(sorted.indexOf('FactorA')).toBeLessThan(sorted.indexOf('FactorB'));
    expect(sorted.indexOf('FactorB')).toBeLessThan(sorted.indexOf('FactorC'));
  });

  it('should handle factors without dependencies', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('Factor1'));
    registry.register(new TestFactor('Factor2'));
    registry.register(new TestFactor('Factor3'));

    const sorted = registry.getSortedByDependencies();

    expect(sorted.length).toBe(3);
  });

  it('should accept specific factor names', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('Factor1'));
    registry.register(new TestFactor('Factor2'));
    registry.register(new TestFactor('Factor3'));

    const sorted = registry.getSortedByDependencies(['Factor1', 'Factor3']);

    expect(sorted.length).toBe(2);
    expect(sorted).toContain('Factor1');
    expect(sorted).toContain('Factor3');
    expect(sorted).not.toContain('Factor2');
  });
});

// ============================================
// calculateBatch 方法测试
// ============================================

describe('FactorRegistry calculateBatch', () => {
  it('should calculate multiple factors', async () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('Factor1'));
    registry.register(new TestFactor('Factor2'));

    const dataMap = {
      'BTC/USDT': { value: 0.5 },
      'ETH/USDT': { value: 0.3 },
    };

    const results = await registry.calculateBatch(['Factor1', 'Factor2'], dataMap);

    expect(results.has('Factor1')).toBe(true);
    expect(results.has('Factor2')).toBe(true);
    expect(results.get('Factor1').get('BTC/USDT')).toBe(0.5);
  });

  it('should respect dependency order', async () => {
    const DependentFactor = class extends BaseFactor {
      constructor() {
        super({ name: 'DependentFactor' });
      }

      async calculate(symbol, data, context) {
        const baseFactor = context.factorValues?.get('BaseFactor');
        const baseValue = baseFactor?.get(symbol) || 0;
        return baseValue * 2;
      }
    };

    const registry = new FactorRegistry();
    registry.register(new TestFactor('BaseFactor'));
    registry.register(new DependentFactor(), { dependencies: ['BaseFactor'] });

    const dataMap = {
      'BTC/USDT': { value: 5 },
    };

    const results = await registry.calculateBatch(
      ['BaseFactor', 'DependentFactor'],
      dataMap
    );

    expect(results.get('BaseFactor').get('BTC/USDT')).toBe(5);
    expect(results.get('DependentFactor').get('BTC/USDT')).toBe(10);
  });

  it('should emit factorCalculated event', async () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('TestFactor'));
    const eventHandler = vi.fn();

    registry.on('factorCalculated', eventHandler);

    await registry.calculateBatch(['TestFactor'], { 'BTC/USDT': { value: 1 } });

    expect(eventHandler).toHaveBeenCalledWith({
      name: 'TestFactor',
      count: 1,
    });
  });

  it('should skip non-existent factors', async () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('ExistingFactor'));

    const results = await registry.calculateBatch(
      ['ExistingFactor', 'NonExistent'],
      { 'BTC/USDT': { value: 1 } }
    );

    expect(results.has('ExistingFactor')).toBe(true);
    expect(results.has('NonExistent')).toBe(false);
  });
});

// ============================================
// getStats 方法测试
// ============================================

describe('FactorRegistry getStats', () => {
  it('should return registry statistics', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('MomFactor', FACTOR_CATEGORY.MOMENTUM));
    registry.register(new TestFactor('VolFactor', FACTOR_CATEGORY.VOLATILITY));

    const stats = registry.getStats();

    expect(stats.totalFactors).toBe(2);
    expect(stats.byCategory[FACTOR_CATEGORY.MOMENTUM]).toBe(1);
    expect(stats.byCategory[FACTOR_CATEGORY.VOLATILITY]).toBe(1);
    expect(stats.factorStats).toBeDefined();
  });
});

// ============================================
// getFactorsInfo 方法测试
// ============================================

describe('FactorRegistry getFactorsInfo', () => {
  it('should return info for all factors', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('Factor1'));
    registry.register(new TestFactor('Factor2'));

    const infos = registry.getFactorsInfo();

    expect(infos.length).toBe(2);
    expect(infos[0].name).toBe('Factor1');
    expect(infos[1].name).toBe('Factor2');
  });
});

// ============================================
// clearAllCaches 方法测试
// ============================================

describe('FactorRegistry clearAllCaches', () => {
  it('should clear caches for all factors', () => {
    const registry = new FactorRegistry();
    const factor1 = new TestFactor('Factor1');
    const factor2 = new TestFactor('Factor2');

    factor1.values.set('BTC/USDT', { value: 1 });
    factor2.values.set('ETH/USDT', { value: 2 });

    registry.register(factor1);
    registry.register(factor2);
    registry.clearAllCaches();

    expect(factor1.values.size).toBe(0);
    expect(factor2.values.size).toBe(0);
  });

  it('should emit cachesCleared event', () => {
    const registry = new FactorRegistry();
    const eventHandler = vi.fn();

    registry.on('cachesCleared', eventHandler);
    registry.clearAllCaches();

    expect(eventHandler).toHaveBeenCalled();
  });
});

// ============================================
// reset 方法测试
// ============================================

describe('FactorRegistry reset', () => {
  it('should clear all factors', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('Factor1'));
    registry.register(new TestFactor('Factor2'));

    registry.reset();

    expect(registry.factors.size).toBe(0);
  });

  it('should clear dependencies', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('FactorA'));
    registry.register(new TestFactor('FactorB'), { dependencies: ['FactorA'] });

    registry.reset();

    expect(registry.dependencies.size).toBe(0);
  });

  it('should clear category index', () => {
    const registry = new FactorRegistry();
    registry.register(new TestFactor('MomFactor', FACTOR_CATEGORY.MOMENTUM));

    registry.reset();

    const categoryNames = registry.categoryIndex.get(FACTOR_CATEGORY.MOMENTUM);
    expect(categoryNames.size).toBe(0);
  });

  it('should emit reset event', () => {
    const registry = new FactorRegistry();
    const eventHandler = vi.fn();

    registry.on('reset', eventHandler);
    registry.reset();

    expect(eventHandler).toHaveBeenCalled();
  });
});

// ============================================
// Global Registry 测试
// ============================================

describe('Global Registry', () => {
  beforeEach(() => {
    resetGlobalRegistry();
  });

  it('should return singleton instance', () => {
    const registry1 = getGlobalRegistry();
    const registry2 = getGlobalRegistry();

    expect(registry1).toBe(registry2);
  });

  it('should be a FactorRegistry instance', () => {
    const registry = getGlobalRegistry();

    expect(registry).toBeInstanceOf(FactorRegistry);
  });

  it('should reset global registry', () => {
    const registry1 = getGlobalRegistry();
    registry1.register(new TestFactor('TestFactor'));

    resetGlobalRegistry();
    const registry2 = getGlobalRegistry();

    expect(registry2).not.toBe(registry1);
    expect(registry2.factors.size).toBe(0);
  });
});
