/**
 * 交易所模块测试
 * Exchange Module Tests
 * @module tests/unit/exchangeReal.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExchangeFactory } from '../../src/exchange/ExchangeFactory.js';
import { BaseExchange } from '../../src/exchange/BaseExchange.js';

// ============================================
// Mock CCXT Exchange
// ============================================

function createMockCcxtExchange() {
  return {
    loadMarkets: vi.fn().mockResolvedValue({
      'BTC/USDT': {
        id: 'BTCUSDT',
        symbol: 'BTC/USDT',
        base: 'BTC',
        quote: 'USDT',
        precision: { amount: 3, price: 2 },
        limits: { amount: { min: 0.001 }, price: { min: 0.01 } },
      },
      'ETH/USDT': {
        id: 'ETHUSDT',
        symbol: 'ETH/USDT',
        base: 'ETH',
        quote: 'USDT',
        precision: { amount: 4, price: 2 },
        limits: { amount: { min: 0.01 }, price: { min: 0.01 } },
      },
    }),
    fetchBalance: vi.fn().mockResolvedValue({
      total: { USDT: 10000, BTC: 0.5 },
      free: { USDT: 8000, BTC: 0.3 },
      used: { USDT: 2000, BTC: 0.2 },
    }),
    fetchPositions: vi.fn().mockResolvedValue([
      {
        symbol: 'BTC/USDT',
        side: 'long',
        contracts: 0.1,
        notional: 5000,
        entryPrice: 50000,
        unrealizedPnl: 100,
        leverage: 5,
        liquidationPrice: 40000,
        marginMode: 'cross',
      },
    ]),
    createOrder: vi.fn().mockResolvedValue({
      id: 'order-123',
      clientOrderId: 'client-123',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.1,
      price: 50000,
      filled: 0,
      remaining: 0.1,
      cost: 0,
      average: null,
      status: 'open',
      timestamp: Date.now(),
      fee: { cost: 0, currency: 'USDT' },
    }),
    cancelOrder: vi.fn().mockResolvedValue({
      id: 'order-123',
      status: 'canceled',
    }),
    cancelAllOrders: vi.fn().mockResolvedValue([{ id: 'order-1' }, { id: 'order-2' }]),
    fetchOpenOrders: vi.fn().mockResolvedValue([
      { id: 'order-1', symbol: 'BTC/USDT' },
      { id: 'order-2', symbol: 'BTC/USDT' },
    ]),
    fetchOrder: vi.fn().mockResolvedValue({
      id: 'order-123',
      status: 'open',
      symbol: 'BTC/USDT',
    }),
    fetchOHLCV: vi.fn().mockResolvedValue([
      [Date.now() - 3600000, 50000, 51000, 49500, 50500, 1000],
      [Date.now() - 1800000, 50500, 51500, 50000, 51000, 1200],
      [Date.now(), 51000, 52000, 50500, 51500, 1500],
    ]),
    fetchTicker: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      last: 51000,
      bid: 50900,
      ask: 51100,
      high: 52000,
      low: 49000,
      volume: 100000,
      timestamp: Date.now(),
    }),
    fetchFundingRate: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      fundingRate: 0.0001,
      fundingTimestamp: Date.now() + 3600000,
      fundingDatetime: new Date(Date.now() + 3600000).toISOString(),
      markPrice: 51000,
      indexPrice: 50900,
    }),
    setSandboxMode: vi.fn(),
    has: {
      fetchBalance: true,
      fetchPositions: true,
      createOrder: true,
      cancelOrder: true,
      cancelAllOrders: true,
      fetchOpenOrders: true,
      fetchOHLCV: true,
      fetchTicker: true,
      fetchFundingRate: true,
    },
    options: {},
    markets: {},
  };
}

// ============================================
// 测试用 Exchange 子类
// ============================================

class TestExchange extends BaseExchange {
  constructor(config) {
    super(config);
    this.name = 'test';
  }

  _createExchange() {
    return createMockCcxtExchange();
  }
}

// ============================================
// ExchangeFactory 测试
// ============================================

describe('ExchangeFactory', () => {
  afterEach(() => {
    // 清理所有实例
    ExchangeFactory.instances.clear();
  });

  describe('getSupportedExchanges', () => {
    it('应该返回支持的交易所列表', () => {
      const exchanges = ExchangeFactory.getSupportedExchanges();

      expect(exchanges).toContain('binance');
      expect(exchanges).toContain('bybit');
      expect(exchanges).toContain('okx');
    });
  });

  describe('isSupported', () => {
    it('应该识别支持的交易所', () => {
      expect(ExchangeFactory.isSupported('binance')).toBe(true);
      expect(ExchangeFactory.isSupported('BINANCE')).toBe(true);
      expect(ExchangeFactory.isSupported('Bybit')).toBe(true);
    });

    it('应该拒绝不支持的交易所', () => {
      expect(ExchangeFactory.isSupported('unknown')).toBe(false);
      expect(ExchangeFactory.isSupported('coinbase')).toBe(false);
    });
  });

  describe('create', () => {
    it('应该创建 Binance 交易所实例', () => {
      const exchange = ExchangeFactory.create('binance', {
        apiKey: 'test-key',
        secret: 'test-secret',
      });

      expect(exchange).toBeDefined();
      expect(exchange.name).toBe('binance');
    });

    it('应该创建 OKX 交易所实例', () => {
      const exchange = ExchangeFactory.create('okx', {
        apiKey: 'test-key',
        secret: 'test-secret',
        password: 'test-password',
      });

      expect(exchange).toBeDefined();
      expect(exchange.name).toBe('okx');
    });

    it('应该创建 Bybit 交易所实例', () => {
      const exchange = ExchangeFactory.create('bybit', {
        apiKey: 'test-key',
        secret: 'test-secret',
      });

      expect(exchange).toBeDefined();
      expect(exchange.name).toBe('bybit');
    });

    it('应该对不支持的交易所抛出错误', () => {
      expect(() => {
        ExchangeFactory.create('unsupported', {});
      }).toThrow('不支持的交易所');
    });

    it('应该忽略大小写', () => {
      const exchange1 = ExchangeFactory.create('BINANCE', {});
      const exchange2 = ExchangeFactory.create('Binance', {});

      expect(exchange1.name).toBe('binance');
      expect(exchange2.name).toBe('binance');
    });
  });

  describe('getInstance', () => {
    it('应该返回单例实例', () => {
      const config = { apiKey: 'key', type: 'spot' };
      const instance1 = ExchangeFactory.getInstance('binance', config);
      const instance2 = ExchangeFactory.getInstance('binance', config);

      expect(instance1).toBe(instance2);
    });

    it('应该为不同配置创建不同实例', () => {
      const instance1 = ExchangeFactory.getInstance('binance', { type: 'spot' });
      const instance2 = ExchangeFactory.getInstance('binance', { type: 'swap' });

      expect(instance1).not.toBe(instance2);
    });

    it('应该支持自定义实例ID', () => {
      const config = { type: 'spot' };
      const instance1 = ExchangeFactory.getInstance('binance', config, 'account1');
      const instance2 = ExchangeFactory.getInstance('binance', config, 'account2');

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('register', () => {
    it('应该注册自定义交易所', () => {
      class CustomExchange extends BaseExchange {
        constructor(config) {
          super(config);
          this.name = 'custom';
        }
      }

      ExchangeFactory.register('custom', CustomExchange);

      expect(ExchangeFactory.isSupported('custom')).toBe(true);

      const exchange = ExchangeFactory.create('custom', {});
      expect(exchange.name).toBe('custom');

      // 清理
      delete ExchangeFactory.exchanges.custom;
    });

    it('应该拒绝非类参数', () => {
      expect(() => {
        ExchangeFactory.register('invalid', 'not-a-class');
      }).toThrow('must be a class');
    });
  });

  describe('getActiveInstanceCount', () => {
    it('应该返回活跃实例数量', () => {
      expect(ExchangeFactory.getActiveInstanceCount()).toBe(0);

      ExchangeFactory.getInstance('binance', { type: 'spot' });
      expect(ExchangeFactory.getActiveInstanceCount()).toBe(1);

      ExchangeFactory.getInstance('binance', { type: 'swap' });
      expect(ExchangeFactory.getActiveInstanceCount()).toBe(2);
    });
  });

  describe('getActiveInstancesInfo', () => {
    it('应该返回所有活跃实例信息', () => {
      ExchangeFactory.getInstance('binance', { type: 'spot' });
      ExchangeFactory.getInstance('okx', { type: 'swap' });

      const info = ExchangeFactory.getActiveInstancesInfo();

      expect(info.length).toBe(2);
      expect(info.some(i => i.name === 'binance')).toBe(true);
      expect(info.some(i => i.name === 'okx')).toBe(true);
    });
  });

  describe('destroyInstance', () => {
    it('应该销毁指定实例', async () => {
      ExchangeFactory.getInstance('binance', { type: 'spot' });
      expect(ExchangeFactory.getActiveInstanceCount()).toBe(1);

      const result = await ExchangeFactory.destroyInstance('binance', 'spot');

      expect(result).toBe(true);
      expect(ExchangeFactory.getActiveInstanceCount()).toBe(0);
    });

    it('对不存在的实例应该返回 false', async () => {
      const result = await ExchangeFactory.destroyInstance('nonexistent', 'spot');
      expect(result).toBe(false);
    });
  });

  describe('destroyAll', () => {
    it('应该销毁所有实例', async () => {
      ExchangeFactory.getInstance('binance', { type: 'spot' });
      ExchangeFactory.getInstance('okx', { type: 'swap' });

      await ExchangeFactory.destroyAll();

      expect(ExchangeFactory.getActiveInstanceCount()).toBe(0);
    });
  });
});

// ============================================
// BaseExchange 测试
// ============================================

describe('BaseExchange', () => {
  let exchange;
  let mockCcxt;

  beforeEach(() => {
    exchange = new TestExchange({
      apiKey: 'test-api-key',
      secret: 'test-secret',
      sandbox: false,
      timeout: 30000,
    });
    mockCcxt = null;
  });

  afterEach(() => {
    if (exchange) {
      exchange.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const e = new TestExchange();

      expect(e.config.timeout).toBe(30000);
      expect(e.config.maxRetries).toBe(3);
      expect(e.config.enableRateLimit).toBe(true);
    });

    it('应该使用自定义配置', () => {
      const e = new TestExchange({
        apiKey: 'key',
        secret: 'secret',
        timeout: 60000,
        maxRetries: 5,
      });

      expect(e.config.apiKey).toBe('key');
      expect(e.config.secret).toBe('secret');
      expect(e.config.timeout).toBe(60000);
      expect(e.config.maxRetries).toBe(5);
    });

    it('应该初始化连接状态', () => {
      expect(exchange.connected).toBe(false);
      expect(exchange.exchange).toBeNull();
    });
  });

  describe('connect', () => {
    it('应该成功连接交易所', async () => {
      const result = await exchange.connect();

      expect(result).toBe(true);
      expect(exchange.connected).toBe(true);
      expect(Object.keys(exchange.markets).length).toBeGreaterThan(0);
    });

    it('应该发射 connected 事件', async () => {
      const listener = vi.fn();
      exchange.on('connected', listener);

      await exchange.connect();

      expect(listener).toHaveBeenCalledWith({ exchange: 'test' });
    });

    it('应该加载市场信息', async () => {
      await exchange.connect();

      expect(exchange.markets['BTC/USDT']).toBeDefined();
      expect(exchange.markets['ETH/USDT']).toBeDefined();
    });
  });

  describe('fetchBalance', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该获取账户余额', async () => {
      const balance = await exchange.fetchBalance();

      expect(balance.total).toBeDefined();
      expect(balance.free).toBeDefined();
      expect(balance.used).toBeDefined();
      expect(balance.total.USDT).toBe(10000);
      expect(balance.free.USDT).toBe(8000);
    });

    it('应该包含交易所名称和时间戳', async () => {
      const balance = await exchange.fetchBalance();

      expect(balance.exchange).toBe('test');
      expect(balance.timestamp).toBeGreaterThan(0);
    });
  });

  describe('fetchPositions', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该获取持仓信息', async () => {
      const positions = await exchange.fetchPositions();

      expect(positions.length).toBeGreaterThan(0);
      expect(positions[0].symbol).toBe('BTC/USDT');
    });
  });

  describe('createOrder', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该创建限价订单', async () => {
      const order = await exchange.createOrder(
        'BTC/USDT',
        'buy',
        'limit',
        0.1,
        50000
      );

      expect(order).toBeDefined();
      expect(order.id).toBe('order-123');
      expect(order.symbol).toBe('BTC/USDT');
      expect(order.side).toBe('buy');
      expect(order.type).toBe('limit');
    });

    it('应该发射 orderCreated 事件', async () => {
      const listener = vi.fn();
      exchange.on('orderCreated', listener);

      await exchange.createOrder('BTC/USDT', 'buy', 'limit', 0.1, 50000);

      expect(listener).toHaveBeenCalled();
    });

    it('应该拒绝无效的交易对', async () => {
      await expect(
        exchange.createOrder('INVALID/PAIR', 'buy', 'limit', 0.1, 50000)
      ).rejects.toThrow();
    });

    it('应该拒绝无效的订单方向', async () => {
      await expect(
        exchange.createOrder('BTC/USDT', 'invalid', 'limit', 0.1, 50000)
      ).rejects.toThrow();
    });

    it('应该拒绝无效的订单类型', async () => {
      await expect(
        exchange.createOrder('BTC/USDT', 'buy', 'invalid', 0.1, 50000)
      ).rejects.toThrow();
    });

    it('应该拒绝无效的数量', async () => {
      await expect(
        exchange.createOrder('BTC/USDT', 'buy', 'limit', -0.1, 50000)
      ).rejects.toThrow();
    });
  });

  describe('cancelOrder', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该取消订单', async () => {
      const result = await exchange.cancelOrder('order-123', 'BTC/USDT');

      expect(result).toBeDefined();
      expect(result.id).toBe('order-123');
    });
  });

  describe('cancelAllOrders', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该取消所有订单', async () => {
      const result = await exchange.cancelAllOrders('BTC/USDT');

      expect(result.canceledCount).toBeGreaterThan(0);
      expect(result.symbol).toBe('BTC/USDT');
    });

    it('应该发射 allOrdersCanceled 事件', async () => {
      const listener = vi.fn();
      exchange.on('allOrdersCanceled', listener);

      await exchange.cancelAllOrders('BTC/USDT');

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('fetchOHLCV', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该获取 K 线数据', async () => {
      const candles = await exchange.fetchOHLCV('BTC/USDT', '1h', undefined, 100);

      expect(candles.length).toBeGreaterThan(0);
      // CCXT 返回数组格式 [timestamp, open, high, low, close, volume]
      expect(Array.isArray(candles[0])).toBe(true);
      expect(candles[0].length).toBe(6);
    });
  });

  describe('fetchTicker', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该获取行情数据', async () => {
      const ticker = await exchange.fetchTicker('BTC/USDT');

      expect(ticker.symbol).toBe('BTC/USDT');
      expect(ticker.last).toBe(51000);
      expect(ticker.bid).toBeDefined();
      expect(ticker.ask).toBeDefined();
    });
  });

  describe('fetchFundingRate', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该获取资金费率', async () => {
      const fundingRate = await exchange.fetchFundingRate('BTC/USDT');

      expect(fundingRate.symbol).toBe('BTC/USDT');
      expect(fundingRate.fundingRate).toBe(0.0001);
      expect(fundingRate.markPrice).toBeDefined();
    });
  });

  describe('未连接时的错误处理', () => {
    it('fetchBalance 应该抛出未连接错误', async () => {
      await expect(exchange.fetchBalance()).rejects.toThrow();
    });

    it('createOrder 应该抛出未连接错误', async () => {
      await expect(
        exchange.createOrder('BTC/USDT', 'buy', 'limit', 0.1, 50000)
      ).rejects.toThrow();
    });
  });

  describe('close', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该关闭连接', async () => {
      await exchange.close();

      expect(exchange.connected).toBe(false);
    });

    it('应该发射 disconnected 事件', async () => {
      const listener = vi.fn();
      exchange.on('disconnected', listener);

      await exchange.close();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('markets', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该包含市场信息', () => {
      expect(exchange.markets['BTC/USDT']).toBeDefined();
      expect(exchange.markets['BTC/USDT'].symbol).toBe('BTC/USDT');
    });

    it('不存在的交易对应该返回 undefined', () => {
      expect(exchange.markets['INVALID/PAIR']).toBeUndefined();
    });
  });

  describe('事件发射', () => {
    it('应该在错误时发射 error 事件', async () => {
      const listener = vi.fn();
      exchange.on('error', listener);

      // 让 loadMarkets 抛出错误
      exchange._createExchange = () => {
        const mock = createMockCcxtExchange();
        mock.loadMarkets = vi.fn().mockRejectedValue(new Error('Connection failed'));
        return mock;
      };

      await expect(exchange.connect()).rejects.toThrow();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('_validateSymbol', () => {
    beforeEach(async () => {
      await exchange.connect();
    });

    it('应该接受有效交易对', () => {
      expect(() => exchange._validateSymbol('BTC/USDT')).not.toThrow();
    });

    it('应该拒绝无效交易对', () => {
      expect(() => exchange._validateSymbol('INVALID')).toThrow();
    });
  });

  describe('_validateOrderParams', () => {
    it('应该接受有效参数', () => {
      expect(() => exchange._validateOrderParams('buy', 'limit', 0.1, 50000)).not.toThrow();
      expect(() => exchange._validateOrderParams('sell', 'market', 0.1, null)).not.toThrow();
    });

    it('应该拒绝无效方向', () => {
      expect(() => exchange._validateOrderParams('long', 'limit', 0.1, 50000)).toThrow();
    });

    it('应该拒绝无效类型', () => {
      expect(() => exchange._validateOrderParams('buy', 'weird', 0.1, 50000)).toThrow();
    });

    it('应该拒绝无效数量', () => {
      expect(() => exchange._validateOrderParams('buy', 'limit', 0, 50000)).toThrow();
      expect(() => exchange._validateOrderParams('buy', 'limit', -1, 50000)).toThrow();
    });

    it('限价单应该要求价格', () => {
      expect(() => exchange._validateOrderParams('buy', 'limit', 0.1, null)).toThrow();
    });
  });
});

// ============================================
// 错误处理测试
// ============================================

describe('Exchange Error Handling', () => {
  let exchange;

  beforeEach(() => {
    exchange = new TestExchange({
      apiKey: 'test-key',
      secret: 'test-secret',
      maxRetries: 2,
      retryDelay: 100,
    });
  });

  afterEach(() => {
    if (exchange) {
      exchange.removeAllListeners();
    }
  });

  describe('连接错误', () => {
    it('应该在连接失败时抛出错误', async () => {
      exchange._createExchange = () => {
        const mock = createMockCcxtExchange();
        mock.loadMarkets = vi.fn().mockRejectedValue(new Error('Connection failed'));
        return mock;
      };

      await expect(exchange.connect()).rejects.toThrow('Connection failed');
    });

    it('应该在连接失败时发射 error 事件', async () => {
      const listener = vi.fn();
      exchange.on('error', listener);

      exchange._createExchange = () => {
        const mock = createMockCcxtExchange();
        mock.loadMarkets = vi.fn().mockRejectedValue(new Error('Connection failed'));
        return mock;
      };

      await expect(exchange.connect()).rejects.toThrow();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('错误标准化', () => {
    it('应该标准化错误对象', () => {
      const normalizedError = exchange._normalizeError(new Error('test error'));

      expect(normalizedError.message).toContain('test error');
    });

    it('应该处理字符串错误', () => {
      const normalizedError = exchange._normalizeError('string error');

      expect(normalizedError.message).toContain('string error');
    });

    it('应该处理对象错误', () => {
      const normalizedError = exchange._normalizeError({ msg: 'error message' });

      expect(normalizedError.message).toBeDefined();
    });
  });

  describe('_createError', () => {
    it('应该创建标准错误', () => {
      const error = exchange._createError('INVALID_SYMBOL', 'Invalid symbol');

      expect(error.message).toContain('Invalid symbol');
    });
  });
});
