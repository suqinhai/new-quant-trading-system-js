/**
 * CrossSectionalStrategy 单元测试
 * Cross-Sectional Strategy Unit Tests
 *
 * 测试横截面策略的核心组件：
 * - AssetDataManager: 资产数据管理器
 * - PortfolioManager: 组合管理器
 * - CrossSectionalStrategy: 主策略类
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CrossSectionalStrategy,
  AssetDataManager,
  PortfolioManager,
  CROSS_SECTIONAL_TYPES,
  RANK_DIRECTION,
  POSITION_TYPE,
  CROSS_SECTIONAL_DEFAULT_CONFIG,
} from '../../src/strategies/CrossSectionalStrategy.js';

// ============================================
// 测试数据生成辅助函数 / Test Data Generation Helpers
// ============================================

/**
 * 生成模拟K线数据
 * Generate mock candle data
 */
function generateMockCandle(symbol, basePrice, index, volatility = 0.02) {
  const priceChange = (Math.random() - 0.5) * 2 * volatility * basePrice;
  const close = basePrice + priceChange;
  const open = close - (Math.random() - 0.5) * volatility * basePrice;
  const high = Math.max(open, close) + Math.random() * volatility * basePrice * 0.5;
  const low = Math.min(open, close) - Math.random() * volatility * basePrice * 0.5;
  const volume = 10000000 + Math.random() * 50000000;

  return {
    symbol,
    timestamp: Date.now() - (100 - index) * 3600000,
    open,
    high,
    low,
    close,
    volume,
  };
}

/**
 * 生成一系列K线数据
 * Generate a series of candle data
 */
function generateCandleSeries(symbol, basePrice, count, trend = 0) {
  const candles = [];
  let currentPrice = basePrice;

  for (let i = 0; i < count; i++) {
    currentPrice = currentPrice * (1 + trend / count);
    candles.push(generateMockCandle(symbol, currentPrice, i));
  }

  return candles;
}

/**
 * 生成多资产K线数据
 * Generate multi-asset candle data
 */
function generateMultiAssetCandles(symbols, basePrices, count, trends = {}) {
  const result = {};

  symbols.forEach((symbol, idx) => {
    const basePrice = basePrices[idx] || 1000;
    const trend = trends[symbol] || 0;
    result[symbol] = generateCandleSeries(symbol, basePrice, count, trend);
  });

  return result;
}

// ============================================
// AssetDataManager 测试 / AssetDataManager Tests
// ============================================

describe('AssetDataManager', () => {
  let assetManager;
  const defaultConfig = {
    lookbackPeriod: 20,
    minDailyVolume: 10000000,
    minPrice: 0.0001,
  };

  beforeEach(() => {
    assetManager = new AssetDataManager(defaultConfig);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty data', () => {
      expect(assetManager.assetData.size).toBe(0);
      expect(assetManager.correlationMatrix.size).toBe(0);
    });

    it('should store config correctly', () => {
      expect(assetManager.config.lookbackPeriod).toBe(20);
    });
  });

  describe('updateAssetData', () => {
    it('should add new asset data', () => {
      const candle = generateMockCandle('BTC/USDT', 50000, 0);
      assetManager.updateAssetData('BTC/USDT', candle);

      expect(assetManager.assetData.has('BTC/USDT')).toBe(true);
      expect(assetManager.assetData.get('BTC/USDT').history.length).toBe(1);
    });

    it('should accumulate history data', () => {
      const candles = generateCandleSeries('BTC/USDT', 50000, 10);

      candles.forEach(candle => {
        assetManager.updateAssetData('BTC/USDT', candle);
      });

      expect(assetManager.assetData.get('BTC/USDT').history.length).toBe(10);
    });

    it('should limit history to maxHistory', () => {
      const candles = generateCandleSeries('BTC/USDT', 50000, 300);

      candles.forEach(candle => {
        assetManager.updateAssetData('BTC/USDT', candle);
      });

      const maxHistory = Math.max(defaultConfig.lookbackPeriod * 2, 200);
      expect(assetManager.assetData.get('BTC/USDT').history.length).toBeLessThanOrEqual(maxHistory);
    });

    it('should calculate metrics after update', () => {
      const candles = generateCandleSeries('BTC/USDT', 50000, 25);

      candles.forEach(candle => {
        assetManager.updateAssetData('BTC/USDT', candle);
      });

      const metrics = assetManager.getMetrics('BTC/USDT');

      expect(metrics).toBeDefined();
      expect(metrics.returns).toBeDefined();
      expect(metrics.volatility).toBeDefined();
      expect(metrics.sharpe).toBeDefined();
      expect(metrics.momentum).toBeDefined();
      expect(metrics.avgVolume).toBeDefined();
      expect(metrics.latestPrice).toBeDefined();
      expect(metrics.rsi).toBeDefined();
    });
  });

  describe('batchUpdate', () => {
    it('should update multiple assets at once', () => {
      const candleMap = new Map([
        ['BTC/USDT', generateMockCandle('BTC/USDT', 50000, 0)],
        ['ETH/USDT', generateMockCandle('ETH/USDT', 3000, 0)],
        ['SOL/USDT', generateMockCandle('SOL/USDT', 100, 0)],
      ]);

      assetManager.batchUpdate(candleMap);

      expect(assetManager.assetData.size).toBe(3);
    });

    it('should emit updated event', () => {
      const callback = vi.fn();
      assetManager.on('updated', callback);

      const candleMap = new Map([
        ['BTC/USDT', generateMockCandle('BTC/USDT', 50000, 0)],
      ]);

      assetManager.batchUpdate(candleMap);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Metrics Calculation', () => {
    beforeEach(() => {
      // 添加足够的数据来计算指标
      const candles = generateCandleSeries('BTC/USDT', 50000, 25, 0.1); // 上涨趋势
      candles.forEach(candle => {
        assetManager.updateAssetData('BTC/USDT', candle);
      });
    });

    it('should calculate cumulative returns correctly', () => {
      const metrics = assetManager.getMetrics('BTC/USDT');
      // 上涨趋势应该有正收益
      expect(metrics.returns).toBeGreaterThan(0);
    });

    it('should calculate volatility as non-negative', () => {
      const metrics = assetManager.getMetrics('BTC/USDT');
      expect(metrics.volatility).toBeGreaterThanOrEqual(0);
    });

    it('should calculate RSI between 0 and 100', () => {
      const metrics = assetManager.getMetrics('BTC/USDT');
      expect(metrics.rsi).toBeGreaterThanOrEqual(0);
      expect(metrics.rsi).toBeLessThanOrEqual(100);
    });

    it('should return default RSI for insufficient data', () => {
      const newManager = new AssetDataManager(defaultConfig);
      const candles = generateCandleSeries('TEST/USDT', 100, 5);
      candles.forEach(candle => {
        newManager.updateAssetData('TEST/USDT', candle);
      });

      const metrics = newManager.getMetrics('TEST/USDT');
      expect(metrics.rsi).toBe(50); // 默认中性值
    });
  });

  describe('getRanking', () => {
    beforeEach(() => {
      // 添加多个资产，带有不同的趋势
      const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];
      const basePrices = [50000, 3000, 100, 0.5];
      const trends = {
        'BTC/USDT': 0.15,   // 强上涨
        'ETH/USDT': 0.08,   // 中等上涨
        'SOL/USDT': -0.05,  // 下跌
        'XRP/USDT': 0.02,   // 小幅上涨
      };

      symbols.forEach((symbol, idx) => {
        const candles = generateCandleSeries(symbol, basePrices[idx], 25, trends[symbol]);
        candles.forEach(candle => {
          assetManager.updateAssetData(symbol, candle);
        });
      });
    });

    it('should return assets sorted by returns (descending)', () => {
      const ranking = assetManager.getRanking('returns', RANK_DIRECTION.DESCENDING);

      expect(ranking.length).toBe(4);
      expect(ranking[0].symbol).toBe('BTC/USDT'); // 最高收益
      expect(ranking[3].symbol).toBe('SOL/USDT'); // 最低收益 (下跌)
    });

    it('should return assets sorted by returns (ascending)', () => {
      const ranking = assetManager.getRanking('returns', RANK_DIRECTION.ASCENDING);

      expect(ranking.length).toBe(4);
      expect(ranking[0].symbol).toBe('SOL/USDT'); // 最低收益
    });

    it('should include rank in results', () => {
      const ranking = assetManager.getRanking('returns', RANK_DIRECTION.DESCENDING);

      expect(ranking[0].rank).toBe(1);
      expect(ranking[1].rank).toBe(2);
      expect(ranking[2].rank).toBe(3);
      expect(ranking[3].rank).toBe(4);
    });

    it('should support different metrics', () => {
      const returnRanking = assetManager.getRanking('returns', RANK_DIRECTION.DESCENDING);
      const volatilityRanking = assetManager.getRanking('volatility', RANK_DIRECTION.DESCENDING);

      // 排名可能不同
      expect(returnRanking[0].symbol).not.toBe(volatilityRanking[0].symbol) ||
        expect(returnRanking.length).toBe(volatilityRanking.length);
    });
  });

  describe('getTopN and getBottomN', () => {
    beforeEach(() => {
      const symbols = ['A', 'B', 'C', 'D', 'E'];
      symbols.forEach((symbol, idx) => {
        const trend = 0.1 - idx * 0.05; // A最高, E最低
        const candles = generateCandleSeries(symbol, 100, 25, trend);
        candles.forEach(candle => {
          assetManager.updateAssetData(symbol, candle);
        });
      });
    });

    it('should return top N assets', () => {
      const top3 = assetManager.getTopN(3, 'returns');

      expect(top3.length).toBe(3);
      expect(top3[0].symbol).toBe('A');
    });

    it('should return bottom N assets', () => {
      const bottom2 = assetManager.getBottomN(2, 'returns');

      expect(bottom2.length).toBe(2);
      // Bottom assets should have lowest returns (E has most negative trend)
      expect(['D', 'E']).toContain(bottom2[0].symbol);
    });
  });

  describe('Correlation Matrix', () => {
    beforeEach(() => {
      // 创建具有相关性的资产
      const baseCandles = generateCandleSeries('BASE', 100, 25, 0.1);

      ['A', 'B'].forEach((symbol, idx) => {
        baseCandles.forEach(candle => {
          // 添加一些噪音
          const noise = idx === 0 ? 0.01 : 0.5;
          const newCandle = {
            ...candle,
            symbol,
            close: candle.close * (1 + (Math.random() - 0.5) * noise),
            open: candle.open * (1 + (Math.random() - 0.5) * noise),
            high: candle.high * (1 + (Math.random() - 0.5) * noise),
            low: candle.low * (1 + (Math.random() - 0.5) * noise),
          };
          assetManager.updateAssetData(symbol, newCandle);
        });
      });
    });

    it('should calculate correlation matrix', () => {
      const matrix = assetManager.calculateCorrelationMatrix();

      expect(matrix.size).toBeGreaterThan(0);
    });

    it('should return correlation between two assets', () => {
      assetManager.calculateCorrelationMatrix();

      const correlation = assetManager.getCorrelation('A', 'B');

      expect(correlation).toBeGreaterThanOrEqual(-1);
      expect(correlation).toBeLessThanOrEqual(1);
    });

    it('should return same correlation regardless of order', () => {
      assetManager.calculateCorrelationMatrix();

      const corr1 = assetManager.getCorrelation('A', 'B');
      const corr2 = assetManager.getCorrelation('B', 'A');

      expect(corr1).toBe(corr2);
    });
  });

  describe('hasEnoughData and getAssetsWithEnoughData', () => {
    it('should return false for asset without enough data', () => {
      const candles = generateCandleSeries('BTC/USDT', 50000, 5);
      candles.forEach(candle => {
        assetManager.updateAssetData('BTC/USDT', candle);
      });

      expect(assetManager.hasEnoughData('BTC/USDT')).toBe(false);
    });

    it('should return true for asset with enough data', () => {
      const candles = generateCandleSeries('BTC/USDT', 50000, 25);
      candles.forEach(candle => {
        assetManager.updateAssetData('BTC/USDT', candle);
      });

      expect(assetManager.hasEnoughData('BTC/USDT')).toBe(true);
    });

    it('should return only assets with enough data', () => {
      // BTC 有足够数据
      generateCandleSeries('BTC/USDT', 50000, 25).forEach(candle => {
        assetManager.updateAssetData('BTC/USDT', candle);
      });

      // ETH 数据不足
      generateCandleSeries('ETH/USDT', 3000, 5).forEach(candle => {
        assetManager.updateAssetData('ETH/USDT', candle);
      });

      const validAssets = assetManager.getAssetsWithEnoughData();

      expect(validAssets).toContain('BTC/USDT');
      expect(validAssets).not.toContain('ETH/USDT');
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      generateCandleSeries('BTC/USDT', 50000, 25).forEach(candle => {
        assetManager.updateAssetData('BTC/USDT', candle);
      });
      generateCandleSeries('ETH/USDT', 3000, 25).forEach(candle => {
        assetManager.updateAssetData('ETH/USDT', candle);
      });
    });

    it('should clear specific asset', () => {
      assetManager.clear('BTC/USDT');

      expect(assetManager.assetData.has('BTC/USDT')).toBe(false);
      expect(assetManager.assetData.has('ETH/USDT')).toBe(true);
    });

    it('should clear all assets when no symbol provided', () => {
      assetManager.clear();

      expect(assetManager.assetData.size).toBe(0);
    });
  });
});

// ============================================
// PortfolioManager 测试 / PortfolioManager Tests
// ============================================

describe('PortfolioManager', () => {
  let portfolioManager;
  const defaultConfig = {
    maxPositionPerAsset: 0.15,
    maxPositionPerSide: 0.5,
    minPositionSize: 0.01,
    equalWeight: true,
    rebalancePeriod: 24 * 60 * 60 * 1000,
  };

  beforeEach(() => {
    portfolioManager = new PortfolioManager(defaultConfig);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty positions', () => {
      expect(portfolioManager.targetPositions.size).toBe(0);
      expect(portfolioManager.currentPositions.size).toBe(0);
    });

    it('should have lastRebalanceTime as 0', () => {
      expect(portfolioManager.lastRebalanceTime).toBe(0);
    });
  });

  describe('setTargetPositions', () => {
    it('should set long positions', () => {
      const longAssets = [
        { symbol: 'BTC/USDT', metrics: {}, rank: 1 },
        { symbol: 'ETH/USDT', metrics: {}, rank: 2 },
      ];

      portfolioManager.setTargetPositions(longAssets);

      expect(portfolioManager.targetPositions.size).toBe(2);
      expect(portfolioManager.targetPositions.get('BTC/USDT').side).toBe('long');
    });

    it('should set long and short positions', () => {
      const longAssets = [{ symbol: 'BTC/USDT', rank: 1 }];
      const shortAssets = [{ symbol: 'SOL/USDT', rank: 10 }];

      portfolioManager.setTargetPositions(longAssets, shortAssets);

      expect(portfolioManager.targetPositions.get('BTC/USDT').side).toBe('long');
      expect(portfolioManager.targetPositions.get('SOL/USDT').side).toBe('short');
    });

    it('should calculate equal weights correctly', () => {
      const longAssets = [
        { symbol: 'BTC/USDT' },
        { symbol: 'ETH/USDT' },
      ];

      portfolioManager.setTargetPositions(longAssets);

      const btcWeight = portfolioManager.targetPositions.get('BTC/USDT').weight;
      const ethWeight = portfolioManager.targetPositions.get('ETH/USDT').weight;

      expect(btcWeight).toBeCloseTo(0.25, 2); // 0.5 / 2
      expect(ethWeight).toBeCloseTo(0.25, 2);
    });

    it('should emit targetUpdated event', () => {
      const callback = vi.fn();
      portfolioManager.on('targetUpdated', callback);

      portfolioManager.setTargetPositions([{ symbol: 'BTC/USDT' }]);

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].long).toContain('BTC/USDT');
    });

    it('should accept string array for assets', () => {
      portfolioManager.setTargetPositions(['BTC/USDT', 'ETH/USDT']);

      expect(portfolioManager.targetPositions.has('BTC/USDT')).toBe(true);
      expect(portfolioManager.targetPositions.has('ETH/USDT')).toBe(true);
    });
  });

  describe('getPositionAdjustments', () => {
    it('should identify positions to open', () => {
      portfolioManager.setTargetPositions([{ symbol: 'BTC/USDT', rank: 1 }]);

      const adjustments = portfolioManager.getPositionAdjustments();

      expect(adjustments.toOpen.length).toBe(1);
      expect(adjustments.toOpen[0].symbol).toBe('BTC/USDT');
    });

    it('should identify positions to close', () => {
      // 设置当前持仓
      portfolioManager.currentPositions.set('OLD/USDT', { side: 'long', weight: 0.1 });

      // 设置新目标（不含 OLD/USDT）
      portfolioManager.setTargetPositions([{ symbol: 'BTC/USDT' }]);

      const adjustments = portfolioManager.getPositionAdjustments();

      expect(adjustments.toClose.length).toBe(1);
      expect(adjustments.toClose[0].symbol).toBe('OLD/USDT');
      expect(adjustments.toClose[0].reason).toBe('not_in_target');
    });

    it('should identify direction changes', () => {
      // 当前做多
      portfolioManager.currentPositions.set('BTC/USDT', { side: 'long', weight: 0.1 });

      // 目标做空
      portfolioManager.setTargetPositions([], [{ symbol: 'BTC/USDT' }]);

      const adjustments = portfolioManager.getPositionAdjustments();

      expect(adjustments.toClose.some(a => a.symbol === 'BTC/USDT' && a.reason === 'direction_changed')).toBe(true);
      expect(adjustments.toOpen.some(a => a.symbol === 'BTC/USDT')).toBe(true);
    });

    it('should identify weight adjustments', () => {
      portfolioManager.currentPositions.set('BTC/USDT', { side: 'long', weight: 0.1 });
      portfolioManager.targetPositions.set('BTC/USDT', { side: 'long', weight: 0.25, symbol: 'BTC/USDT' });

      const adjustments = portfolioManager.getPositionAdjustments();

      expect(adjustments.toAdjust.length).toBe(1);
      expect(adjustments.toAdjust[0].weightChange).toBeCloseTo(0.15, 2);
    });

    it('should not adjust for small weight changes', () => {
      portfolioManager.currentPositions.set('BTC/USDT', { side: 'long', weight: 0.10 });
      portfolioManager.targetPositions.set('BTC/USDT', { side: 'long', weight: 0.105, symbol: 'BTC/USDT' });

      const adjustments = portfolioManager.getPositionAdjustments();

      expect(adjustments.toAdjust.length).toBe(0);
    });
  });

  describe('updateCurrentPosition', () => {
    it('should add new position', () => {
      portfolioManager.updateCurrentPosition('BTC/USDT', { side: 'long', weight: 0.1 });

      expect(portfolioManager.currentPositions.has('BTC/USDT')).toBe(true);
    });

    it('should remove position when null or zero weight', () => {
      portfolioManager.currentPositions.set('BTC/USDT', { side: 'long', weight: 0.1 });

      portfolioManager.updateCurrentPosition('BTC/USDT', null);

      expect(portfolioManager.currentPositions.has('BTC/USDT')).toBe(false);
    });
  });

  describe('recordPositionChange', () => {
    it('should record position changes', () => {
      portfolioManager.recordPositionChange({
        type: 'open',
        symbol: 'BTC/USDT',
        side: 'long',
      });

      expect(portfolioManager.positionHistory.length).toBe(1);
      expect(portfolioManager.positionHistory[0].symbol).toBe('BTC/USDT');
    });

    it('should limit history to 1000 records', () => {
      for (let i = 0; i < 1100; i++) {
        portfolioManager.recordPositionChange({ type: 'test', index: i });
      }

      expect(portfolioManager.positionHistory.length).toBe(1000);
    });
  });

  describe('needsRebalance', () => {
    it('should return true when never rebalanced', () => {
      expect(portfolioManager.needsRebalance()).toBe(true);
    });

    it('should return false right after rebalance', () => {
      portfolioManager.markRebalanced();

      expect(portfolioManager.needsRebalance()).toBe(false);
    });

    it('should return true after rebalance period', () => {
      portfolioManager.lastRebalanceTime = Date.now() - 25 * 60 * 60 * 1000; // 25小时前

      expect(portfolioManager.needsRebalance()).toBe(true);
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      portfolioManager.currentPositions.set('BTC/USDT', { side: 'long', weight: 0.2 });
      portfolioManager.currentPositions.set('ETH/USDT', { side: 'long', weight: 0.15 });
      portfolioManager.currentPositions.set('SOL/USDT', { side: 'short', weight: 0.1 });
    });

    it('should calculate long weight and count', () => {
      const summary = portfolioManager.getSummary();

      expect(summary.longCount).toBe(2);
      expect(summary.longWeight).toBeCloseTo(0.35, 2);
    });

    it('should calculate short weight and count', () => {
      const summary = portfolioManager.getSummary();

      expect(summary.shortCount).toBe(1);
      expect(summary.shortWeight).toBeCloseTo(0.1, 2);
    });

    it('should calculate net and gross exposure', () => {
      const summary = portfolioManager.getSummary();

      expect(summary.netExposure).toBeCloseTo(0.25, 2); // 0.35 - 0.1
      expect(summary.grossExposure).toBeCloseTo(0.45, 2); // 0.35 + 0.1
    });
  });

  describe('clear', () => {
    it('should clear all positions', () => {
      portfolioManager.currentPositions.set('BTC/USDT', { side: 'long', weight: 0.1 });
      portfolioManager.targetPositions.set('ETH/USDT', { side: 'long', weight: 0.1 });

      portfolioManager.clear();

      expect(portfolioManager.currentPositions.size).toBe(0);
      expect(portfolioManager.targetPositions.size).toBe(0);
    });
  });
});

// ============================================
// CrossSectionalStrategy 测试 / CrossSectionalStrategy Tests
// ============================================

describe('CrossSectionalStrategy', () => {
  let strategy;
  const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT'];

  beforeEach(() => {
    strategy = new CrossSectionalStrategy({
      symbols,
      lookbackPeriod: 10,
      rebalancePeriod: 1000, // 短周期便于测试
      topN: 2,
      bottomN: 2,
      minDailyVolume: 0, // 禁用成交量过滤
      minPrice: 0,       // 禁用价格过滤
      verbose: false,
    });

    // Mock buy/sell/closePosition methods
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
      const defaultStrategy = new CrossSectionalStrategy();

      expect(defaultStrategy.name).toBe('CrossSectionalStrategy');
      expect(defaultStrategy.config.topN).toBe(3);
      expect(defaultStrategy.config.bottomN).toBe(3);
    });

    it('should override default config with params', () => {
      expect(strategy.config.topN).toBe(2);
      expect(strategy.config.bottomN).toBe(2);
      expect(strategy.config.symbols).toEqual(symbols);
    });

    it('should initialize assetManager and portfolioManager', () => {
      expect(strategy.assetManager).toBeInstanceOf(AssetDataManager);
      expect(strategy.portfolioManager).toBeInstanceOf(PortfolioManager);
    });

    it('should set default strategyType', () => {
      expect(strategy.strategyType).toBe(CROSS_SECTIONAL_TYPES.MOMENTUM_RANK);
    });
  });

  describe('onInit', () => {
    it('should set running to true', async () => {
      await strategy.onInit();

      expect(strategy.running).toBe(true);
    });
  });

  describe('onCandle', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should update asset data for monitored symbol', async () => {
      const candle = generateMockCandle('BTC/USDT', 50000, 0);

      await strategy.onCandle(candle);

      expect(strategy.assetManager.assetData.has('BTC/USDT')).toBe(true);
    });

    it('should ignore non-monitored symbols', async () => {
      const candle = generateMockCandle('UNKNOWN/USDT', 100, 0);

      await strategy.onCandle(candle);

      expect(strategy.assetManager.assetData.has('UNKNOWN/USDT')).toBe(false);
    });

    it('should skip when not running', async () => {
      strategy.running = false;
      const candle = generateMockCandle('BTC/USDT', 50000, 0);

      await strategy.onCandle(candle);

      expect(strategy.assetManager.assetData.has('BTC/USDT')).toBe(false);
    });
  });

  describe('batchUpdateCandles', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should update multiple assets with Map', async () => {
      const candleMap = new Map([
        ['BTC/USDT', generateMockCandle('BTC/USDT', 50000, 0)],
        ['ETH/USDT', generateMockCandle('ETH/USDT', 3000, 0)],
      ]);

      await strategy.batchUpdateCandles(candleMap);

      expect(strategy.assetManager.assetData.has('BTC/USDT')).toBe(true);
      expect(strategy.assetManager.assetData.has('ETH/USDT')).toBe(true);
    });

    it('should update multiple assets with Object', async () => {
      const candleObj = {
        'BTC/USDT': generateMockCandle('BTC/USDT', 50000, 0),
        'SOL/USDT': generateMockCandle('SOL/USDT', 100, 0),
      };

      await strategy.batchUpdateCandles(candleObj);

      expect(strategy.assetManager.assetData.has('BTC/USDT')).toBe(true);
      expect(strategy.assetManager.assetData.has('SOL/USDT')).toBe(true);
    });
  });

  describe('Rebalancing Logic', () => {
    beforeEach(async () => {
      await strategy.onInit();

      // 添加足够的数据触发再平衡
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

    it('should execute rebalance when conditions are met', async () => {
      await strategy.forceRebalance();

      expect(strategy.stats.totalRebalances).toBeGreaterThan(0);
    });

    it('should emit rebalanced event', async () => {
      const callback = vi.fn();
      strategy.on('rebalanced', callback);

      await strategy.forceRebalance();

      expect(callback).toHaveBeenCalled();
    });

    it('should select top N for long positions', async () => {
      await strategy.forceRebalance();

      const summary = strategy.portfolioManager.getSummary();
      expect(summary.longCount).toBeLessThanOrEqual(strategy.config.topN);
    });
  });

  describe('Position Type Handling', () => {
    it('should handle LONG_ONLY position type', async () => {
      strategy.config.positionType = POSITION_TYPE.LONG_ONLY;
      await strategy.onInit();

      // 添加数据
      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          candleMap.set(symbol, generateMockCandle(symbol, 100 * (idx + 1), i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      await strategy.forceRebalance();

      const summary = strategy.portfolioManager.getSummary();
      expect(summary.shortCount).toBe(0);
    });

    it('should handle SHORT_ONLY position type', async () => {
      strategy.config.positionType = POSITION_TYPE.SHORT_ONLY;
      await strategy.onInit();

      // 添加数据
      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          candleMap.set(symbol, generateMockCandle(symbol, 100 * (idx + 1), i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      await strategy.forceRebalance();

      const summary = strategy.portfolioManager.getSummary();
      expect(summary.longCount).toBe(0);
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should return strategy status', () => {
      const status = strategy.getStatus();

      expect(status.name).toBe('CrossSectionalStrategy');
      expect(status.running).toBe(true);
      expect(status.symbols).toEqual(symbols);
      expect(status.config.topN).toBe(2);
    });

    it('should include portfolio summary', () => {
      const status = strategy.getStatus();

      expect(status.portfolio).toBeDefined();
      expect(status.portfolio.longCount).toBeDefined();
    });
  });

  describe('getCurrentRanking', () => {
    beforeEach(async () => {
      await strategy.onInit();

      // 添加数据
      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          const trend = 0.1 - idx * 0.03;
          candleMap.set(symbol, generateMockCandle(symbol, 100 * (1 + trend * i), i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }
    });

    it('should return current asset ranking', () => {
      const ranking = strategy.getCurrentRanking();

      expect(ranking.length).toBe(symbols.length);
      expect(ranking[0].rank).toBe(1);
    });
  });

  describe('onFinish', () => {
    it('should set running to false', async () => {
      await strategy.onInit();
      await strategy.onFinish();

      expect(strategy.running).toBe(false);
    });
  });
});

// ============================================
// Constants and Exports Tests
// ============================================

describe('Constants and Exports', () => {
  describe('CROSS_SECTIONAL_TYPES', () => {
    it('should have all strategy types', () => {
      expect(CROSS_SECTIONAL_TYPES.MOMENTUM_RANK).toBe('momentum_rank');
      expect(CROSS_SECTIONAL_TYPES.ROTATION).toBe('rotation');
      expect(CROSS_SECTIONAL_TYPES.FUNDING_RATE_EXTREME).toBe('funding_extreme');
      expect(CROSS_SECTIONAL_TYPES.CROSS_EXCHANGE_SPREAD).toBe('cross_exchange');
      expect(CROSS_SECTIONAL_TYPES.RELATIVE_STRENGTH).toBe('relative_strength');
      expect(CROSS_SECTIONAL_TYPES.MEAN_REVERSION).toBe('mean_reversion');
    });
  });

  describe('RANK_DIRECTION', () => {
    it('should have ascending and descending', () => {
      expect(RANK_DIRECTION.ASCENDING).toBe('ascending');
      expect(RANK_DIRECTION.DESCENDING).toBe('descending');
    });
  });

  describe('POSITION_TYPE', () => {
    it('should have all position types', () => {
      expect(POSITION_TYPE.LONG_ONLY).toBe('long_only');
      expect(POSITION_TYPE.SHORT_ONLY).toBe('short_only');
      expect(POSITION_TYPE.LONG_SHORT).toBe('long_short');
      expect(POSITION_TYPE.MARKET_NEUTRAL).toBe('market_neutral');
    });
  });

  describe('CROSS_SECTIONAL_DEFAULT_CONFIG', () => {
    it('should have required default config fields', () => {
      expect(CROSS_SECTIONAL_DEFAULT_CONFIG.symbols).toBeDefined();
      expect(CROSS_SECTIONAL_DEFAULT_CONFIG.lookbackPeriod).toBeDefined();
      expect(CROSS_SECTIONAL_DEFAULT_CONFIG.topN).toBeDefined();
      expect(CROSS_SECTIONAL_DEFAULT_CONFIG.bottomN).toBeDefined();
    });
  });
});

// ============================================
// Edge Cases and Error Handling
// ============================================

describe('Edge Cases', () => {
  describe('AssetDataManager Edge Cases', () => {
    let assetManager;

    beforeEach(() => {
      assetManager = new AssetDataManager({ lookbackPeriod: 20 });
    });

    it('should handle empty assetData for ranking', () => {
      const ranking = assetManager.getRanking('returns');

      expect(ranking).toEqual([]);
    });

    it('should handle missing metrics gracefully', () => {
      assetManager.assetData.set('TEST', { history: [], metrics: null, lastUpdate: 0 });

      const metrics = assetManager.getMetrics('TEST');

      expect(metrics).toBeNull();
    });

    it('should handle correlation for non-existent pairs', () => {
      const correlation = assetManager.getCorrelation('A', 'B');

      expect(correlation).toBe(0);
    });

    it('should handle single candle data', () => {
      const candle = generateMockCandle('TEST', 100, 0);
      assetManager.updateAssetData('TEST', candle);

      const metrics = assetManager.getMetrics('TEST');

      // 单个数据点应该返回空或默认指标
      expect(metrics).toBeDefined();
    });
  });

  describe('PortfolioManager Edge Cases', () => {
    let portfolioManager;

    beforeEach(() => {
      portfolioManager = new PortfolioManager({
        maxPositionPerAsset: 0.15,
        maxPositionPerSide: 0.5,
        minPositionSize: 0.01,
        equalWeight: true,
        rebalancePeriod: 1000,
      });
    });

    it('should handle empty target positions', () => {
      portfolioManager.setTargetPositions([]);

      expect(portfolioManager.targetPositions.size).toBe(0);
    });

    it('should handle single asset', () => {
      portfolioManager.setTargetPositions([{ symbol: 'ONLY/USDT' }]);

      const weight = portfolioManager.targetPositions.get('ONLY/USDT').weight;
      expect(weight).toBeCloseTo(0.5, 2); // maxPositionPerSide / 1
    });
  });

  describe('CrossSectionalStrategy Edge Cases', () => {
    it('should handle strategy without enough assets', async () => {
      const strategy = new CrossSectionalStrategy({
        symbols: ['BTC/USDT'],
        topN: 3,
        bottomN: 3,
        verbose: false,
      });

      strategy.log = vi.fn();
      await strategy.onInit();

      // 只有一个资产，不应触发再平衡
      const candle = generateMockCandle('BTC/USDT', 50000, 0);
      await strategy.onCandle(candle);

      expect(strategy.stats.totalRebalances).toBe(0);
    });
  });
});

// ============================================
// Integration Scenarios
// ============================================

describe('Integration Scenarios', () => {
  describe('Full Trading Cycle', () => {
    it('should complete a full trading cycle', async () => {
      const symbols = ['A', 'B', 'C', 'D', 'E', 'F'];
      const strategy = new CrossSectionalStrategy({
        symbols,
        lookbackPeriod: 10,
        rebalancePeriod: 100,
        topN: 2,
        bottomN: 2,
        positionType: POSITION_TYPE.LONG_SHORT,
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

      await strategy.onInit();

      // Phase 1: 建仓
      for (let i = 0; i < 15; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          const trend = 0.15 - idx * 0.05;
          candleMap.set(symbol, generateMockCandle(symbol, 100 * (1 + trend * i / 15), i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      await strategy.forceRebalance();

      const rebalancesAfterPhase1 = strategy.stats.totalRebalances;
      expect(rebalancesAfterPhase1).toBeGreaterThanOrEqual(1);
      expect(strategy.portfolioManager.currentPositions.size).toBeGreaterThan(0);

      // Phase 2: 市场变化，排名变化
      for (let i = 15; i < 30; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          // 反转趋势
          const trend = -0.1 + idx * 0.05;
          candleMap.set(symbol, generateMockCandle(symbol, 100 * (1 + trend * (i - 15) / 15), i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      // 等待再平衡周期
      strategy.portfolioManager.lastRebalanceTime = Date.now() - 200;
      await strategy.forceRebalance();

      expect(strategy.stats.totalRebalances).toBeGreaterThan(rebalancesAfterPhase1);
    });
  });

  describe('Market Regime Changes', () => {
    it('should adapt to different market conditions', async () => {
      const symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE'];
      const strategy = new CrossSectionalStrategy({
        symbols,
        lookbackPeriod: 5,
        rebalancePeriod: 50,
        topN: 2,
        bottomN: 1,
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

      await strategy.onInit();

      // Bull market
      for (let i = 0; i < 10; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          candleMap.set(symbol, generateMockCandle(symbol, 100 * (1 + 0.02 * i), i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      await strategy.forceRebalance();
      const bullMarketStats = { ...strategy.stats };

      // Bear market
      for (let i = 10; i < 20; i++) {
        const candleMap = new Map();
        symbols.forEach((symbol, idx) => {
          candleMap.set(symbol, generateMockCandle(symbol, 100 * (1 - 0.02 * (i - 10)), i));
        });
        strategy.assetManager.batchUpdate(candleMap);
      }

      strategy.portfolioManager.lastRebalanceTime = 0;
      await strategy.forceRebalance();

      expect(strategy.stats.totalRebalances).toBeGreaterThan(bullMarketStats.totalRebalances);
    });
  });
});
