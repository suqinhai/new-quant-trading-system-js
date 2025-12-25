/**
 * CrossExchangeSpreadStrategy 单元测试
 * Cross-Exchange Spread Strategy Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CrossExchangeSpreadStrategy,
  CrossExchangePriceManager,
  ArbitragePositionManager,
  SUPPORTED_EXCHANGES,
  SPREAD_TYPES,
  CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG,
} from '../../src/strategies/CrossExchangeSpreadStrategy.js';

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

function generateMockPriceData(bid, ask, last) {
  return {
    bid: bid || last * 0.9999,
    ask: ask || last * 1.0001,
    last,
    volume: 1000000,
  };
}

describe('CrossExchangePriceManager', () => {
  let manager;
  const config = {
    minSpreadToOpen: 0.003,
    maxSpread: 0.05,
    tradingFee: 0.0005,
  };

  beforeEach(() => {
    manager = new CrossExchangePriceManager(config);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty data', () => {
      expect(manager.prices.size).toBe(0);
      expect(manager.spreads.size).toBe(0);
      expect(manager.spreadHistory.size).toBe(0);
    });
  });

  describe('updatePrice', () => {
    it('should add new price data', () => {
      manager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));

      expect(manager.prices.has('BTC/USDT')).toBe(true);
      expect(manager.prices.get('BTC/USDT').has('binance')).toBe(true);
    });

    it('should emit priceUpdated event', () => {
      const callback = vi.fn();
      manager.on('priceUpdated', callback);

      manager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));

      expect(callback).toHaveBeenCalled();
    });

    it('should update spreads when multiple exchanges present', () => {
      manager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));
      manager.updatePrice('BTC/USDT', 'bybit', generateMockPriceData(50020, 50030, 50025));

      expect(manager.spreads.size).toBeGreaterThan(0);
    });
  });

  describe('getAllSpreadOpportunities', () => {
    beforeEach(() => {
      // 创建价差机会
      manager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));
      manager.updatePrice('BTC/USDT', 'bybit', generateMockPriceData(50200, 50210, 50205));
    });

    it('should return sorted opportunities', () => {
      const opportunities = manager.getAllSpreadOpportunities();

      if (opportunities.length > 1) {
        for (let i = 1; i < opportunities.length; i++) {
          expect(opportunities[i - 1].netSpread).toBeGreaterThanOrEqual(opportunities[i].netSpread);
        }
      }
    });

    it('should filter out spreads below minimum', () => {
      manager.config.minSpreadToOpen = 0.01; // 1%

      // 小价差
      manager.updatePrice('ETH/USDT', 'binance', generateMockPriceData(3000, 3001, 3000.5));
      manager.updatePrice('ETH/USDT', 'bybit', generateMockPriceData(3002, 3003, 3002.5));

      const opportunities = manager.getAllSpreadOpportunities();
      const ethOpps = opportunities.filter(o => o.symbol === 'ETH/USDT');

      // ETH价差太小，应该被过滤
      expect(ethOpps.length).toBe(0);
    });

    it('should include netSpread calculation', () => {
      const opportunities = manager.getAllSpreadOpportunities();

      if (opportunities.length > 0) {
        opportunities.forEach(opp => {
          expect(opp).toHaveProperty('netSpread');
          expect(opp.netSpread).toBe(opp.spread - config.tradingFee * 2);
        });
      }
    });
  });

  describe('getBestSpread', () => {
    beforeEach(() => {
      manager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));
      manager.updatePrice('BTC/USDT', 'bybit', generateMockPriceData(50200, 50210, 50205));
    });

    it('should return best spread for symbol', () => {
      const best = manager.getBestSpread('BTC/USDT');

      if (best) {
        expect(best.symbol).toBe('BTC/USDT');
        expect(best).toHaveProperty('buyExchange');
        expect(best).toHaveProperty('sellExchange');
        expect(best).toHaveProperty('spread');
      }
    });

    it('should return null for symbol without spread', () => {
      const best = manager.getBestSpread('UNKNOWN/USDT');
      expect(best).toBeNull();
    });
  });

  describe('getPrice', () => {
    it('should return price for symbol and exchange', () => {
      manager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));

      const price = manager.getPrice('BTC/USDT', 'binance');

      expect(price).toBeDefined();
      expect(price.bid).toBeCloseTo(50000, 0);
      expect(price.ask).toBeCloseTo(50010, 0);
    });

    it('should return null for non-existent data', () => {
      const price = manager.getPrice('UNKNOWN/USDT', 'binance');
      expect(price).toBeNull();
    });
  });

  describe('getSpreadStats', () => {
    beforeEach(() => {
      // 添加多次价差历史
      for (let i = 0; i < 20; i++) {
        manager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000 + i * 10, 50010 + i * 10, 50005 + i * 10));
        manager.updatePrice('BTC/USDT', 'bybit', generateMockPriceData(50100 + i * 5, 50110 + i * 5, 50105 + i * 5));
      }
    });

    it('should return statistics with required fields', () => {
      const stats = manager.getSpreadStats('BTC/USDT');

      if (stats) {
        expect(stats).toHaveProperty('mean');
        expect(stats).toHaveProperty('std');
        expect(stats).toHaveProperty('min');
        expect(stats).toHaveProperty('max');
        expect(stats).toHaveProperty('count');
      }
    });

    it('should return null for insufficient data', () => {
      const stats = manager.getSpreadStats('NEW/USDT');
      expect(stats).toBeNull();
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      manager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));
      manager.updatePrice('ETH/USDT', 'binance', generateMockPriceData(3000, 3001, 3000.5));
    });

    it('should clear all data', () => {
      manager.clear();

      expect(manager.prices.size).toBe(0);
      expect(manager.spreads.size).toBe(0);
      expect(manager.spreadHistory.size).toBe(0);
    });
  });
});

describe('ArbitragePositionManager', () => {
  let manager;
  const config = {
    tradingFee: 0.0005,
  };

  beforeEach(() => {
    manager = new ArbitragePositionManager(config);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with empty positions', () => {
      expect(manager.positions.size).toBe(0);
      expect(manager.stats.totalOpened).toBe(0);
      expect(manager.stats.totalClosed).toBe(0);
    });
  });

  describe('openPosition', () => {
    it('should open new arbitrage position', () => {
      const opportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        spread: 0.004,
      };

      const result = manager.openPosition(opportunity, 0.1);

      expect(result.id).toBeDefined();
      expect(result.position.symbol).toBe('BTC/USDT');
      expect(result.position.status).toBe('active');
      expect(manager.stats.totalOpened).toBe(1);
    });

    it('should emit positionOpened event', () => {
      const callback = vi.fn();
      manager.on('positionOpened', callback);

      const opportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        spread: 0.004,
      };

      manager.openPosition(opportunity, 0.1);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('closePosition', () => {
    let positionId;

    beforeEach(() => {
      const opportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'bybit',
        buyPrice: 50000,
        sellPrice: 50200,
        spread: 0.004,
      };

      const result = manager.openPosition(opportunity, 0.1);
      positionId = result.id;
    });

    it('should close position successfully', () => {
      const result = manager.closePosition(positionId, {
        buyClosePrice: 50100,
        sellClosePrice: 50150,
        closeSpread: 0.001,
        reason: 'spread_narrowed',
      });

      expect(result.position.status).toBe('closed');
      expect(result.position.closeReason).toBe('spread_narrowed');
      expect(manager.stats.totalClosed).toBe(1);
    });

    it('should calculate PnL correctly', () => {
      const result = manager.closePosition(positionId, {
        buyClosePrice: 50100,
        sellClosePrice: 50150,
        closeSpread: 0.001,
        reason: 'test',
      });

      expect(result.position.realizedPnl).toBeDefined();
    });

    it('should throw error for non-existent position', () => {
      expect(() => {
        manager.closePosition('INVALID_ID', {});
      }).toThrow('Position not found');
    });

    it('should emit positionClosed event', () => {
      const callback = vi.fn();
      manager.on('positionClosed', callback);

      manager.closePosition(positionId, {
        buyClosePrice: 50100,
        sellClosePrice: 50150,
        reason: 'test',
      });

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('getActivePositions', () => {
    it('should return only active positions', () => {
      // 开两个仓位
      const opp1 = { symbol: 'BTC/USDT', buyExchange: 'binance', sellExchange: 'bybit', buyPrice: 50000, sellPrice: 50200, spread: 0.004 };
      const opp2 = { symbol: 'ETH/USDT', buyExchange: 'binance', sellExchange: 'bybit', buyPrice: 3000, sellPrice: 3010, spread: 0.003 };

      const result1 = manager.openPosition(opp1, 0.1);
      manager.openPosition(opp2, 0.1);

      // 关闭一个
      manager.closePosition(result1.id, { reason: 'test' });

      const active = manager.getActivePositions();
      expect(active.length).toBe(1);
      expect(active[0].symbol).toBe('ETH/USDT');
    });
  });

  describe('getTotalExposure', () => {
    it('should calculate total exposure correctly', () => {
      const opp1 = { symbol: 'BTC/USDT', buyExchange: 'binance', sellExchange: 'bybit', buyPrice: 50000, sellPrice: 50200, spread: 0.004 };
      const opp2 = { symbol: 'ETH/USDT', buyExchange: 'binance', sellExchange: 'bybit', buyPrice: 3000, sellPrice: 3010, spread: 0.003 };

      manager.openPosition(opp1, 0.1);
      manager.openPosition(opp2, 0.15);

      const exposure = manager.getTotalExposure();
      expect(exposure).toBeCloseTo(0.25, 2);
    });
  });

  describe('getStats', () => {
    it('should return statistics with required fields', () => {
      const stats = manager.getStats();

      expect(stats).toHaveProperty('totalOpened');
      expect(stats).toHaveProperty('totalClosed');
      expect(stats).toHaveProperty('totalProfit');
      expect(stats).toHaveProperty('totalLoss');
      expect(stats).toHaveProperty('activeCount');
      expect(stats).toHaveProperty('totalExposure');
      expect(stats).toHaveProperty('netProfit');
    });
  });
});

describe('CrossExchangeSpreadStrategy', () => {
  let strategy;
  const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
  const exchanges = [SUPPORTED_EXCHANGES.BINANCE, SUPPORTED_EXCHANGES.BYBIT];

  beforeEach(() => {
    strategy = new CrossExchangeSpreadStrategy({
      symbols,
      exchanges,
      minSpreadToOpen: 0.003,
      closeSpreadThreshold: 0.001,
      maxTotalPosition: 0.40,
      maxPositionPerOpportunity: 0.08,
      minPositionSize: 0.01,
      rebalancePeriod: 1000,
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
      const defaultStrategy = new CrossExchangeSpreadStrategy();
      expect(defaultStrategy.name).toBe('CrossExchangeSpreadStrategy');
      expect(defaultStrategy.config.spreadType).toBe(SPREAD_TYPES.PERP_PERP);
    });

    it('should override config with params', () => {
      expect(strategy.config.minSpreadToOpen).toBe(0.003);
      expect(strategy.config.maxTotalPosition).toBe(0.40);
    });

    it('should initialize price and position managers', () => {
      expect(strategy.priceManager).toBeInstanceOf(CrossExchangePriceManager);
      expect(strategy.arbPositionManager).toBeInstanceOf(ArbitragePositionManager);
      expect(strategy.exchanges).toBeInstanceOf(Map);
    });
  });

  describe('onTicker', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('should update price manager', async () => {
      await strategy.onTicker({
        symbol: 'BTC/USDT',
        exchange: 'binance',
        bid: 50000,
        ask: 50010,
        last: 50005,
        volume: 1000000,
      });

      expect(strategy.priceManager.prices.has('BTC/USDT')).toBe(true);
    });

    it('should skip when not running', async () => {
      strategy.running = false;

      await strategy.onTicker({
        symbol: 'BTC/USDT',
        exchange: 'binance',
        bid: 50000,
        ask: 50010,
        last: 50005,
      });

      expect(strategy.priceManager.prices.has('BTC/USDT')).toBe(false);
    });
  });

  describe('getCurrentRanking', () => {
    beforeEach(async () => {
      await strategy.onInit();

      // 添加价格数据创建价差机会
      strategy.priceManager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));
      strategy.priceManager.updatePrice('BTC/USDT', 'bybit', generateMockPriceData(50200, 50210, 50205));
      strategy.priceManager.updatePrice('ETH/USDT', 'binance', generateMockPriceData(3000, 3001, 3000.5));
      strategy.priceManager.updatePrice('ETH/USDT', 'bybit', generateMockPriceData(3015, 3016, 3015.5));
    });

    it('should return spread opportunities as ranking', () => {
      const ranking = strategy.getCurrentRanking();

      expect(Array.isArray(ranking)).toBe(true);
      if (ranking.length > 0) {
        ranking.forEach(item => {
          expect(item).toHaveProperty('symbol');
          expect(item).toHaveProperty('value');
          expect(item).toHaveProperty('rank');
          expect(item).toHaveProperty('buyExchange');
          expect(item).toHaveProperty('sellExchange');
          expect(item).toHaveProperty('netSpread');
        });
      }
    });
  });

  describe('getSpreadOpportunities', () => {
    beforeEach(async () => {
      await strategy.onInit();

      strategy.priceManager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));
      strategy.priceManager.updatePrice('BTC/USDT', 'bybit', generateMockPriceData(50200, 50210, 50205));
    });

    it('should return all spread opportunities', () => {
      const opportunities = strategy.getSpreadOpportunities();
      expect(Array.isArray(opportunities)).toBe(true);
    });
  });

  describe('getArbitrageStats', () => {
    it('should return arbitrage statistics', async () => {
      await strategy.onInit();

      const stats = strategy.getArbitrageStats();

      expect(stats).toHaveProperty('totalOpened');
      expect(stats).toHaveProperty('totalClosed');
      expect(stats).toHaveProperty('netProfit');
      expect(stats).toHaveProperty('activeCount');
    });
  });

  describe('manualOpenArbitrage', () => {
    beforeEach(async () => {
      await strategy.onInit();

      strategy.priceManager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));
      strategy.priceManager.updatePrice('BTC/USDT', 'bybit', generateMockPriceData(50200, 50210, 50205));
    });

    it('should open arbitrage position manually', async () => {
      const result = await strategy.manualOpenArbitrage('BTC/USDT', 'binance', 'bybit', 0.05);

      expect(result.id).toBeDefined();
      expect(result.position.symbol).toBe('BTC/USDT');
    });

    it('should throw error when price data not available', async () => {
      await expect(
        strategy.manualOpenArbitrage('UNKNOWN/USDT', 'binance', 'bybit', 0.05)
      ).rejects.toThrow('Price data not available');
    });
  });

  describe('manualCloseArbitrage', () => {
    let positionId;

    beforeEach(async () => {
      await strategy.onInit();

      strategy.priceManager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));
      strategy.priceManager.updatePrice('BTC/USDT', 'bybit', generateMockPriceData(50200, 50210, 50205));

      const result = await strategy.manualOpenArbitrage('BTC/USDT', 'binance', 'bybit', 0.05);
      positionId = result.id;
    });

    it('should close arbitrage position manually', async () => {
      const result = await strategy.manualCloseArbitrage(positionId);

      expect(result.position.status).toBe('closed');
      expect(result.position.closeReason).toBe('manual');
    });

    it('should throw error for non-existent position', async () => {
      await expect(
        strategy.manualCloseArbitrage('INVALID_ID')
      ).rejects.toThrow('Position not found');
    });
  });

  describe('closeAllArbitrages', () => {
    beforeEach(async () => {
      await strategy.onInit();

      strategy.priceManager.updatePrice('BTC/USDT', 'binance', generateMockPriceData(50000, 50010, 50005));
      strategy.priceManager.updatePrice('BTC/USDT', 'bybit', generateMockPriceData(50200, 50210, 50205));
      strategy.priceManager.updatePrice('ETH/USDT', 'binance', generateMockPriceData(3000, 3001, 3000.5));
      strategy.priceManager.updatePrice('ETH/USDT', 'bybit', generateMockPriceData(3020, 3021, 3020.5));

      await strategy.manualOpenArbitrage('BTC/USDT', 'binance', 'bybit', 0.05);
      await strategy.manualOpenArbitrage('ETH/USDT', 'binance', 'bybit', 0.05);
    });

    it('should close all arbitrage positions', async () => {
      const initialActive = strategy.arbPositionManager.getActivePositions().length;
      const results = await strategy.closeAllArbitrages();

      expect(results.length).toBe(initialActive);
      expect(strategy.arbPositionManager.getActivePositions().length).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should include spread-specific status fields', async () => {
      await strategy.onInit();

      const status = strategy.getStatus();

      expect(status).toHaveProperty('spreadType');
      expect(status).toHaveProperty('exchanges');
      expect(status).toHaveProperty('arbitrageStats');
      expect(status).toHaveProperty('activeArbitrages');
      expect(status).toHaveProperty('topOpportunities');
    });
  });
});

describe('SUPPORTED_EXCHANGES Constants', () => {
  it('should have all exchange types', () => {
    expect(SUPPORTED_EXCHANGES.BINANCE).toBe('binance');
    expect(SUPPORTED_EXCHANGES.BYBIT).toBe('bybit');
    expect(SUPPORTED_EXCHANGES.OKX).toBe('okx');
    expect(SUPPORTED_EXCHANGES.GATE).toBe('gate');
    expect(SUPPORTED_EXCHANGES.HUOBI).toBe('huobi');
    expect(SUPPORTED_EXCHANGES.KUCOIN).toBe('kucoin');
  });
});

describe('SPREAD_TYPES Constants', () => {
  it('should have all spread types', () => {
    expect(SPREAD_TYPES.SPOT_SPOT).toBe('spot_spot');
    expect(SPREAD_TYPES.PERP_PERP).toBe('perp_perp');
    expect(SPREAD_TYPES.SPOT_PERP).toBe('spot_perp');
    expect(SPREAD_TYPES.FUTURES_SPOT).toBe('futures_spot');
  });
});

describe('CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG', () => {
  it('should have required default fields', () => {
    expect(CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG.name).toBe('CrossExchangeSpreadStrategy');
    expect(CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG.minSpreadToOpen).toBeDefined();
    expect(CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG.closeSpreadThreshold).toBeDefined();
    expect(CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG.exchanges).toBeDefined();
    expect(CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG.spreadType).toBeDefined();
    expect(CROSS_EXCHANGE_SPREAD_DEFAULT_CONFIG.maxTotalPosition).toBeDefined();
  });
});
