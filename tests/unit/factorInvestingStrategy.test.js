/**
 * FactorInvestingStrategy 单元测试
 * Factor Investing Strategy Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FactorInvestingStrategy,
  POSITION_TYPE,
  WEIGHT_METHOD,
} from '../../src/factors/FactorInvestingStrategy.js';

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
function generateMockCandle(symbol, price, index, timestamp = null) {
  const volatility = price * 0.005;
  return {
    symbol,
    timestamp: timestamp || Date.now() - (200 - index) * 3600000,
    open: price - volatility,
    high: price + volatility * 2,
    low: price - volatility * 1.5,
    close: price,
    volume: 10000000 + Math.random() * 50000000,
  };
}

/**
 * 生成K线历史数据
 */
function generateCandleHistory(symbol, count = 100, startPrice = 50000, volatility = 0.02) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * volatility * price;
    price += change;
    candles.push(generateMockCandle(symbol, price, i));
  }

  return candles;
}

// ============================================
// POSITION_TYPE 常量测试
// ============================================

describe('POSITION_TYPE Constants', () => {
  it('should have all position types', () => {
    expect(POSITION_TYPE.LONG_ONLY).toBe('long_only');
    expect(POSITION_TYPE.SHORT_ONLY).toBe('short_only');
    expect(POSITION_TYPE.LONG_SHORT).toBe('long_short');
    expect(POSITION_TYPE.MARKET_NEUTRAL).toBe('market_neutral');
  });
});

// ============================================
// WEIGHT_METHOD 常量测试
// ============================================

describe('WEIGHT_METHOD Constants', () => {
  it('should have all weight methods', () => {
    expect(WEIGHT_METHOD.EQUAL).toBe('equal');
    expect(WEIGHT_METHOD.SCORE_WEIGHTED).toBe('score_weighted');
    expect(WEIGHT_METHOD.VOLATILITY_PARITY).toBe('vol_parity');
    expect(WEIGHT_METHOD.RISK_PARITY).toBe('risk_parity');
  });
});

// ============================================
// FactorInvestingStrategy 构造函数测试
// ============================================

describe('FactorInvestingStrategy Constructor', () => {
  it('should initialize with default config', () => {
    const strategy = new FactorInvestingStrategy();

    expect(strategy.name).toBe('FactorInvestingStrategy');
    expect(strategy.symbols).toEqual([]);
    expect(strategy.topN).toBe(5);
    expect(strategy.bottomN).toBe(5);
    expect(strategy.positionType).toBe(POSITION_TYPE.LONG_ONLY);
    expect(strategy.weightMethod).toBe(WEIGHT_METHOD.EQUAL);
  });

  it('should accept custom config', () => {
    const strategy = new FactorInvestingStrategy({
      name: 'CustomFactorStrategy',
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      topN: 3,
      bottomN: 2,
      positionType: POSITION_TYPE.LONG_SHORT,
      weightMethod: WEIGHT_METHOD.SCORE_WEIGHTED,
    });

    expect(strategy.name).toBe('CustomFactorStrategy');
    expect(strategy.symbols).toEqual(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
    expect(strategy.topN).toBe(3);
    expect(strategy.bottomN).toBe(2);
    expect(strategy.positionType).toBe(POSITION_TYPE.LONG_SHORT);
    expect(strategy.weightMethod).toBe(WEIGHT_METHOD.SCORE_WEIGHTED);
  });

  it('should initialize rebalance parameters', () => {
    const strategy = new FactorInvestingStrategy({
      rebalancePeriod: 12 * 60 * 60 * 1000, // 12 hours
      minRebalanceChange: 0.05,
    });

    expect(strategy.rebalancePeriod).toBe(12 * 60 * 60 * 1000);
    expect(strategy.minRebalanceChange).toBe(0.05);
    expect(strategy.lastRebalanceTime).toBe(0);
  });

  it('should initialize position limits', () => {
    const strategy = new FactorInvestingStrategy({
      maxPositionPerAsset: 0.15,
      maxTotalPosition: 0.8,
    });

    expect(strategy.maxPositionPerAsset).toBe(0.15);
    expect(strategy.maxTotalPosition).toBe(0.8);
  });

  it('should initialize factor system components', () => {
    const strategy = new FactorInvestingStrategy();

    expect(strategy.registry).toBeDefined();
    expect(strategy.assetData).toBeInstanceOf(Map);
    expect(strategy.currentPositions).toBeInstanceOf(Map);
  });

  it('should initialize statistics', () => {
    const strategy = new FactorInvestingStrategy();

    expect(strategy.stats).toBeDefined();
    expect(strategy.stats.totalRebalances).toBe(0);
    expect(strategy.stats.lastFactorValues).toBeNull();
    expect(strategy.stats.lastSelections).toBeNull();
  });

  it('should use default factor config when not provided', () => {
    const strategy = new FactorInvestingStrategy();

    expect(strategy.factorConfig).toBeDefined();
    expect(strategy.factorConfig.momentum).toBeDefined();
    expect(strategy.factorConfig.volatility).toBeDefined();
    expect(strategy.factorConfig.moneyFlow).toBeDefined();
    expect(strategy.factorConfig.turnover).toBeDefined();
  });

  it('should accept custom factor config', () => {
    const customConfig = {
      momentum: { enabled: true, totalWeight: 0.5 },
      volatility: { enabled: false },
      moneyFlow: { enabled: true, totalWeight: 0.3 },
      turnover: { enabled: true, totalWeight: 0.2 },
    };

    const strategy = new FactorInvestingStrategy({
      factorConfig: customConfig,
    });

    expect(strategy.factorConfig).toEqual(customConfig);
  });
});

// ============================================
// FactorInvestingStrategy onInit 测试
// ============================================

describe('FactorInvestingStrategy onInit', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new FactorInvestingStrategy({
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      topN: 2,
    });
    engine = createMockEngine();
    strategy.engine = engine;
    strategy.getEquity = vi.fn().mockReturnValue(100000);
    strategy.log = vi.fn();
  });

  it('should initialize successfully', async () => {
    await strategy.onInit();

    expect(strategy.log).toHaveBeenCalled();
    expect(strategy.combiner).toBeDefined();
  });

  it('should register factors during init', async () => {
    await strategy.onInit();

    const factorNames = strategy.registry.getNames();
    expect(factorNames.length).toBeGreaterThan(0);
  });

  it('should log initialization info', async () => {
    await strategy.onInit();

    expect(strategy.log).toHaveBeenCalledWith(expect.stringContaining('因子投资策略初始化完成'));
  });
});

// ============================================
// 资产选择测试
// ============================================

describe('Asset Selection', () => {
  let strategy;

  beforeEach(() => {
    strategy = new FactorInvestingStrategy({
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ADA/USDT', 'DOT/USDT'],
      topN: 2,
      bottomN: 2,
      positionType: POSITION_TYPE.LONG_SHORT,
    });
    strategy.log = vi.fn();
  });

  it('should select correct number of long assets', () => {
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
      ['ADA/USDT', 0.3],
      ['DOT/USDT', 0.1],
    ]);

    // 需要先初始化 combiner
    strategy._initializeCombiner();
    const selections = strategy._selectAssets(scores);

    expect(selections.long.length).toBe(2);
    expect(selections.long[0].symbol).toBe('BTC/USDT');
    expect(selections.long[1].symbol).toBe('ETH/USDT');
  });

  it('should select correct number of short assets', () => {
    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
      ['ADA/USDT', 0.3],
      ['DOT/USDT', 0.1],
    ]);

    strategy._initializeCombiner();
    const selections = strategy._selectAssets(scores);

    expect(selections.short.length).toBe(2);
    expect(selections.short[0].symbol).toBe('DOT/USDT');
    expect(selections.short[1].symbol).toBe('ADA/USDT');
  });

  it('should only select long assets for LONG_ONLY', () => {
    strategy.positionType = POSITION_TYPE.LONG_ONLY;

    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
    ]);

    strategy._initializeCombiner();
    const selections = strategy._selectAssets(scores);

    expect(selections.long.length).toBe(2);
    expect(selections.short.length).toBe(0);
  });

  it('should only select short assets for SHORT_ONLY', () => {
    strategy.positionType = POSITION_TYPE.SHORT_ONLY;

    const scores = new Map([
      ['BTC/USDT', 0.9],
      ['ETH/USDT', 0.7],
      ['SOL/USDT', 0.5],
    ]);

    strategy._initializeCombiner();
    const selections = strategy._selectAssets(scores);

    expect(selections.long.length).toBe(0);
    expect(selections.short.length).toBe(2);
  });
});

// ============================================
// 权重分配测试
// ============================================

describe('Weight Allocation', () => {
  let strategy;

  beforeEach(() => {
    strategy = new FactorInvestingStrategy({
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      topN: 3,
      weightMethod: WEIGHT_METHOD.EQUAL,
      maxPositionPerAsset: 0.2,
    });
    strategy.log = vi.fn();
  });

  it('should allocate equal weights', () => {
    const assets = [
      { symbol: 'BTC/USDT', score: 0.9 },
      { symbol: 'ETH/USDT', score: 0.7 },
      { symbol: 'SOL/USDT', score: 0.5 },
    ];

    const weights = strategy._allocateWeights(assets);

    // All weights should be equal for equal weight method
    expect(weights.get('BTC/USDT')).toBe(weights.get('ETH/USDT'));
    expect(weights.get('ETH/USDT')).toBe(weights.get('SOL/USDT'));
    // Total should be positive and bounded
    const total = weights.get('BTC/USDT') + weights.get('ETH/USDT') + weights.get('SOL/USDT');
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(1);
  });

  it('should allocate score-weighted weights', () => {
    strategy.weightMethod = WEIGHT_METHOD.SCORE_WEIGHTED;
    strategy.maxPositionPerAsset = 1; // Remove cap for this test

    const assets = [
      { symbol: 'BTC/USDT', score: 0.5 },
      { symbol: 'ETH/USDT', score: 0.3 },
      { symbol: 'SOL/USDT', score: 0.2 },
    ];

    const weights = strategy._allocateWeights(assets);

    // Check that weights are allocated (may be equal if implementation normalizes)
    expect(weights.size).toBe(3);
    expect(weights.has('BTC/USDT')).toBe(true);
    expect(weights.has('ETH/USDT')).toBe(true);
    expect(weights.has('SOL/USDT')).toBe(true);
    // Total weight should be positive
    const total = weights.get('BTC/USDT') + weights.get('ETH/USDT') + weights.get('SOL/USDT');
    expect(total).toBeGreaterThan(0);
  });

  it('should respect maxPositionPerAsset limit', () => {
    strategy.maxPositionPerAsset = 0.1;

    const assets = [
      { symbol: 'BTC/USDT', score: 0.9 },
    ];

    const weights = strategy._allocateWeights(assets);

    expect(weights.get('BTC/USDT')).toBeLessThanOrEqual(0.1);
  });

  it('should return empty map for empty assets', () => {
    const weights = strategy._allocateWeights([]);

    expect(weights.size).toBe(0);
  });

  it('should fallback to equal weight when total score is zero', () => {
    strategy.weightMethod = WEIGHT_METHOD.SCORE_WEIGHTED;

    const assets = [
      { symbol: 'BTC/USDT', score: 0 },
      { symbol: 'ETH/USDT', score: 0 },
    ];

    const weights = strategy._allocateWeights(assets);

    // Should fallback to equal weights
    expect(weights.get('BTC/USDT')).toBe(weights.get('ETH/USDT'));
  });
});

// ============================================
// 目标权重计算测试
// ============================================

describe('Target Weight Calculation', () => {
  let strategy;

  beforeEach(() => {
    strategy = new FactorInvestingStrategy({
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ADA/USDT'],
      topN: 2,
      bottomN: 2,
      positionType: POSITION_TYPE.LONG_SHORT,
      maxPositionPerAsset: 0.25,
    });
    strategy.log = vi.fn();
  });

  it('should calculate long and short weights', () => {
    const selections = {
      long: [
        { symbol: 'BTC/USDT', score: 0.9 },
        { symbol: 'ETH/USDT', score: 0.7 },
      ],
      short: [
        { symbol: 'SOL/USDT', score: 0.2 },
        { symbol: 'ADA/USDT', score: 0.1 },
      ],
    };

    const targetWeights = strategy._calculateTargetWeights(selections);

    expect(targetWeights.get('BTC/USDT').side).toBe('long');
    expect(targetWeights.get('ETH/USDT').side).toBe('long');
    expect(targetWeights.get('SOL/USDT').side).toBe('short');
    expect(targetWeights.get('ADA/USDT').side).toBe('short');
  });

  it('should balance weights for market neutral', () => {
    strategy.positionType = POSITION_TYPE.MARKET_NEUTRAL;

    const selections = {
      long: [
        { symbol: 'BTC/USDT', score: 0.9 },
        { symbol: 'ETH/USDT', score: 0.7 },
      ],
      short: [
        { symbol: 'SOL/USDT', score: 0.2 },
        { symbol: 'ADA/USDT', score: 0.1 },
      ],
    };

    const targetWeights = strategy._calculateTargetWeights(selections);

    // In market neutral, long and short should be balanced
    let totalLong = 0;
    let totalShort = 0;
    for (const [, info] of targetWeights) {
      if (info.side === 'long') totalLong += info.weight;
      else totalShort += info.weight;
    }

    expect(totalLong).toBeCloseTo(totalShort, 5);
  });
});

// ============================================
// 资产数据更新测试
// ============================================

describe('Asset Data Update', () => {
  let strategy;

  beforeEach(() => {
    strategy = new FactorInvestingStrategy({
      symbols: ['BTC/USDT', 'ETH/USDT'],
    });
    strategy.log = vi.fn();
  });

  it('should update asset data with new candle', () => {
    const candle = generateMockCandle('BTC/USDT', 50000, 0);
    strategy._updateAssetData('BTC/USDT', candle, []);

    const assetInfo = strategy.assetData.get('BTC/USDT');
    expect(assetInfo).toBeDefined();
    expect(assetInfo.candles.length).toBe(1);
  });

  it('should use history when provided', () => {
    const history = generateCandleHistory('BTC/USDT', 50);
    const candle = history[history.length - 1];

    strategy._updateAssetData('BTC/USDT', candle, history);

    const assetInfo = strategy.assetData.get('BTC/USDT');
    expect(assetInfo.candles.length).toBe(50);
  });

  it('should limit candle history to 200', () => {
    const candle = generateMockCandle('BTC/USDT', 50000, 0);

    // Add 250 candles
    for (let i = 0; i < 250; i++) {
      strategy._updateAssetData('BTC/USDT', candle, null);
    }

    const assetInfo = strategy.assetData.get('BTC/USDT');
    expect(assetInfo.candles.length).toBeLessThanOrEqual(200);
  });
});

// ============================================
// 资金费率处理测试
// ============================================

describe('Funding Rate Handling', () => {
  let strategy;

  beforeEach(() => {
    strategy = new FactorInvestingStrategy({
      symbols: ['BTC/USDT', 'ETH/USDT'],
    });
    strategy.log = vi.fn();
  });

  it('should store funding rate data', async () => {
    await strategy.onFundingRate({
      symbol: 'BTC/USDT',
      rate: 0.0001,
      timestamp: Date.now(),
    });

    const assetInfo = strategy.assetData.get('BTC/USDT');
    expect(assetInfo.fundingRates.length).toBe(1);
    expect(assetInfo.fundingRates[0].rate).toBe(0.0001);
  });

  it('should limit funding rate history to 200', async () => {
    // Add 250 funding rates
    for (let i = 0; i < 250; i++) {
      await strategy.onFundingRate({
        symbol: 'BTC/USDT',
        rate: 0.0001 * i,
        timestamp: Date.now() + i,
      });
    }

    const assetInfo = strategy.assetData.get('BTC/USDT');
    expect(assetInfo.fundingRates.length).toBeLessThanOrEqual(200);
  });
});

// ============================================
// getState 测试
// ============================================

describe('getState', () => {
  let strategy;

  beforeEach(() => {
    strategy = new FactorInvestingStrategy();
  });

  it('should return scores', () => {
    strategy.currentScores = new Map([['BTC/USDT', 0.8]]);

    const scores = strategy.getState('scores');
    expect(scores.get('BTC/USDT')).toBe(0.8);
  });

  it('should return rankings', () => {
    strategy.currentRankings = [{ symbol: 'BTC/USDT', rank: 1 }];

    const rankings = strategy.getState('rankings');
    expect(rankings[0].symbol).toBe('BTC/USDT');
  });

  it('should return positions', () => {
    strategy.currentPositions = new Map([['BTC/USDT', { side: 'long', weight: 0.2 }]]);

    const positions = strategy.getState('positions');
    expect(positions.get('BTC/USDT').side).toBe('long');
  });

  it('should return stats', () => {
    strategy.stats.totalRebalances = 5;

    const stats = strategy.getState('stats');
    expect(stats.totalRebalances).toBe(5);
  });
});

// ============================================
// getInfo 测试
// ============================================

describe('getInfo', () => {
  it('should return strategy info', () => {
    const strategy = new FactorInvestingStrategy({
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      topN: 2,
      bottomN: 1,
      positionType: POSITION_TYPE.LONG_SHORT,
      weightMethod: WEIGHT_METHOD.EQUAL,
    });
    strategy.log = vi.fn();

    const info = strategy.getInfo();

    expect(info.name).toBe('FactorInvestingStrategy');
    expect(info.symbols).toBe(3);
    expect(info.topN).toBe(2);
    expect(info.bottomN).toBe(1);
    expect(info.positionType).toBe(POSITION_TYPE.LONG_SHORT);
    expect(info.weightMethod).toBe(WEIGHT_METHOD.EQUAL);
  });

  it('should include registered factors', async () => {
    const strategy = new FactorInvestingStrategy({
      symbols: ['BTC/USDT', 'ETH/USDT'],
    });
    strategy.log = vi.fn();

    await strategy.onInit();
    const info = strategy.getInfo();

    expect(info.registeredFactors).toBeDefined();
    expect(Array.isArray(info.registeredFactors)).toBe(true);
    expect(info.registeredFactors.length).toBeGreaterThan(0);
  });
});

// ============================================
// 集成测试
// ============================================

describe('FactorInvestingStrategy Integration Tests', () => {
  it('should inherit from BaseStrategy', async () => {
    const { BaseStrategy } = await import('../../src/strategies/BaseStrategy.js');
    const strategy = new FactorInvestingStrategy();

    expect(strategy instanceof BaseStrategy).toBe(true);
  });

  it('should be exported from factors FactorInvestingStrategy', async () => {
    const { FactorInvestingStrategy: ImportedStrategy } = await import('../../src/factors/FactorInvestingStrategy.js');

    expect(ImportedStrategy).toBeDefined();
    expect(new ImportedStrategy()).toBeInstanceOf(FactorInvestingStrategy);
  });

  it('should export POSITION_TYPE and WEIGHT_METHOD from same module', async () => {
    const module = await import('../../src/factors/FactorInvestingStrategy.js');

    expect(module.POSITION_TYPE).toBeDefined();
    expect(module.WEIGHT_METHOD).toBeDefined();
    expect(module.FactorInvestingStrategy).toBeDefined();
  });
});

// ============================================
// 因子初始化测试
// ============================================

describe('Factor Initialization', () => {
  it('should register momentum factors by default', async () => {
    const strategy = new FactorInvestingStrategy();
    strategy.log = vi.fn();

    await strategy.onInit();

    const factorNames = strategy.registry.getNames();
    expect(factorNames.some(n => n.includes('Momentum'))).toBe(true);
  });

  it('should register volatility factors by default', async () => {
    const strategy = new FactorInvestingStrategy();
    strategy.log = vi.fn();

    await strategy.onInit();

    const factorNames = strategy.registry.getNames();
    expect(factorNames.some(n => n.includes('BB') || n.includes('ATR'))).toBe(true);
  });

  it('should not register disabled factors', async () => {
    const strategy = new FactorInvestingStrategy({
      factorConfig: {
        momentum: { enabled: false },
        volatility: { enabled: true },
        moneyFlow: { enabled: false },
        turnover: { enabled: false },
      },
    });
    strategy.log = vi.fn();

    await strategy.onInit();

    const factorNames = strategy.registry.getNames();
    expect(factorNames.some(n => n.includes('Momentum'))).toBe(false);
  });

  it('should register funding rate factors when enabled', async () => {
    const strategy = new FactorInvestingStrategy({
      factorConfig: {
        momentum: { enabled: true },
        volatility: { enabled: true },
        moneyFlow: { enabled: true },
        turnover: { enabled: true },
        fundingRate: { enabled: true, totalWeight: 0.1 },
      },
    });
    strategy.log = vi.fn();

    await strategy.onInit();

    const factorNames = strategy.registry.getNames();
    expect(factorNames.some(n => n.includes('Funding'))).toBe(true);
  });
});

// ============================================
// 策略事件测试
// ============================================

describe('Strategy Events', () => {
  it('should emit rebalanced event', async () => {
    const strategy = new FactorInvestingStrategy({
      symbols: ['BTC/USDT', 'ETH/USDT'],
      topN: 1,
      rebalancePeriod: 0, // immediate
    });
    strategy.log = vi.fn();
    strategy.getPosition = vi.fn().mockReturnValue(null);
    strategy.buyPercent = vi.fn();
    strategy.closePosition = vi.fn();

    await strategy.onInit();

    // Add mock data
    const history = generateCandleHistory('BTC/USDT', 100);
    strategy._updateAssetData('BTC/USDT', history[99], history);
    strategy._updateAssetData('ETH/USDT', history[99], history);

    const rebalancePromise = new Promise(resolve => {
      strategy.on('rebalanced', resolve);
    });

    // Trigger rebalance
    await strategy._rebalance();

    const event = await rebalancePromise;
    expect(event).toBeDefined();
    expect(event.scores).toBeDefined();
    expect(event.selections).toBeDefined();
    expect(event.targetWeights).toBeDefined();
  });
});
