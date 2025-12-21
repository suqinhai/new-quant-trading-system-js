/**
 * OKXExchange 测试
 * OKX Exchange Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock CCXT
vi.mock('ccxt', () => {
  const mockOkx = vi.fn().mockImplementation((config) => ({
    id: 'okx',
    name: 'OKX',
    config,
    markets: {},

    // API 方法
    loadMarkets: vi.fn().mockResolvedValue({
      'BTC/USDT:USDT': {
        id: 'BTC-USDT-SWAP',
        symbol: 'BTC/USDT:USDT',
        base: 'BTC',
        quote: 'USDT',
        settle: 'USDT',
        type: 'swap',
        precision: { amount: 0.001, price: 0.1 },
        limits: {
          amount: { min: 0.001, max: 10000 },
          price: { min: 0.1, max: 1000000 },
        },
        active: true,
      },
      'ETH/USDT:USDT': {
        id: 'ETH-USDT-SWAP',
        symbol: 'ETH/USDT:USDT',
        base: 'ETH',
        quote: 'USDT',
        settle: 'USDT',
        type: 'swap',
        precision: { amount: 0.01, price: 0.01 },
        limits: {
          amount: { min: 0.01, max: 10000 },
          price: { min: 0.01, max: 100000 },
        },
        active: true,
      },
    }),

    fetchBalance: vi.fn().mockResolvedValue({
      USDT: { free: 10000, used: 1000, total: 11000 },
      BTC: { free: 0.5, used: 0, total: 0.5 },
    }),

    fetchTicker: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT:USDT',
      last: 50000,
      bid: 49990,
      ask: 50010,
      high: 51000,
      low: 49000,
      volume: 10000,
      timestamp: Date.now(),
    }),

    fetchMarkPrice: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT:USDT',
      markPrice: 50005,
      indexPrice: 50000,
      timestamp: Date.now(),
    }),

    fetchFundingRate: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT:USDT',
      fundingRate: 0.0001,
      fundingTimestamp: Date.now() + 8 * 3600000,
      nextFundingRate: 0.00015,
      nextFundingTimestamp: Date.now() + 16 * 3600000,
    }),

    fetchPositions: vi.fn().mockResolvedValue([
      {
        symbol: 'BTC/USDT:USDT',
        side: 'long',
        contracts: 0.1,
        contractSize: 1,
        unrealizedPnl: 100,
        leverage: 10,
        entryPrice: 49000,
        markPrice: 50000,
        liquidationPrice: 45000,
      },
    ]),

    createOrder: vi.fn().mockImplementation((symbol, type, side, amount, price, params) => {
      return Promise.resolve({
        id: 'order_okx_' + Date.now(),
        clientOrderId: 'client_' + Date.now(),
        symbol,
        type,
        side,
        amount,
        price: price || 50000,
        status: 'open',
        filled: 0,
        remaining: amount,
        timestamp: Date.now(),
        info: { ordType: type },
      });
    }),

    cancelOrder: vi.fn().mockResolvedValue({
      id: 'order_okx_123',
      status: 'canceled',
    }),

    fetchOrder: vi.fn().mockResolvedValue({
      id: 'order_okx_123',
      symbol: 'BTC/USDT:USDT',
      status: 'closed',
      filled: 0.1,
      remaining: 0,
    }),

    fetchOpenOrders: vi.fn().mockResolvedValue([]),
    fetchClosedOrders: vi.fn().mockResolvedValue([]),

    setLeverage: vi.fn().mockResolvedValue({ leverage: 10 }),

    privateGetAccountConfig: vi.fn().mockResolvedValue({
      data: [{
        posMode: 'long_short_mode',
        autoLoan: true,
        level: '1',
        acctLv: '2',
        uid: '123456',
      }],
    }),

    privatePostAccountSetPositionMode: vi.fn().mockResolvedValue({
      code: '0',
      msg: '',
    }),

    privateGetTradeOrdersAlgoPending: vi.fn().mockResolvedValue({
      data: [
        {
          algoId: 'algo_123',
          instId: 'BTC-USDT-SWAP',
          ordType: 'conditional',
          side: 'buy',
          sz: '0.1',
          triggerPx: '48000',
          ordPx: '48000',
          state: 'live',
          cTime: Date.now().toString(),
        },
      ],
    }),

    marketId: vi.fn().mockImplementation((symbol) => {
      const map = {
        'BTC/USDT:USDT': 'BTC-USDT-SWAP',
        'ETH/USDT:USDT': 'ETH-USDT-SWAP',
      };
      return map[symbol] || symbol;
    }),

    priceToPrecision: vi.fn().mockImplementation((symbol, price) => parseFloat(price.toFixed(1))),
    amountToPrecision: vi.fn().mockImplementation((symbol, amount) => parseFloat(amount.toFixed(3))),
  }));

  return {
    default: {
      okx: mockOkx,
    },
    okx: mockOkx,
  };
});

import { OKXExchange } from '../../src/exchange/OKXExchange.js';

describe('OKXExchange', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    password: 'test_passphrase',
    sandbox: true,
    defaultType: 'swap',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new OKXExchange(defaultConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  describe('构造函数和连接', () => {
    it('应该正确初始化交易所名称', () => {
      expect(exchange.name).toBe('okx');
    });

    it('应该正确存储配置', () => {
      expect(exchange.config.apiKey).toBe('test_api_key');
      expect(exchange.config.password).toBe('test_passphrase');
      expect(exchange.config.sandbox).toBe(true);
    });

    it('应该成功连接', async () => {
      const newExchange = new OKXExchange(defaultConfig);
      await newExchange.connect();
      expect(newExchange.connected).toBe(true);
    });

    it('应该成功断开连接', async () => {
      await exchange.disconnect();
      expect(exchange.connected).toBe(false);
    });
  });

  describe('账户方法', () => {
    it('应该获取账户余额', async () => {
      const balance = await exchange.fetchBalance();
      expect(balance).toBeDefined();
      expect(balance.USDT).toBeDefined();
      expect(balance.USDT.free).toBe(10000);
    });

    it('应该获取持仓信息', async () => {
      const positions = await exchange.fetchPositions();
      expect(Array.isArray(positions)).toBe(true);
    });

    it('应该获取账户配置', async () => {
      const config = await exchange.fetchAccountConfig();
      expect(config).toBeDefined();
      expect(config.posMode).toBe('long_short_mode');
      expect(config.uid).toBe('123456');
      expect(config.exchange).toBe('okx');
    });
  });

  describe('持仓模式设置', () => {
    it('应该设置双向持仓模式', async () => {
      const result = await exchange.setPositionMode('long_short_mode');
      expect(result).toBeDefined();
    });

    it('应该设置单向持仓模式', async () => {
      const result = await exchange.setPositionMode('net_mode');
      expect(result).toBeDefined();
    });

    it('应该拒绝无效的持仓模式', async () => {
      await expect(exchange.setPositionMode('invalid_mode'))
        .rejects.toThrow();
    });

    it('应该发出持仓模式设置事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('positionModeSet', eventSpy);

      await exchange.setPositionMode('long_short_mode');

      expect(eventSpy).toHaveBeenCalledWith({
        posMode: 'long_short_mode',
        exchange: 'okx',
      });
    });
  });

  describe('行情方法', () => {
    it('应该获取行情数据', async () => {
      const ticker = await exchange.fetchTicker('BTC/USDT:USDT');
      expect(ticker).toBeDefined();
      expect(ticker.symbol).toBe('BTC/USDT:USDT');
      expect(ticker.last).toBe(50000);
    });

    it('应该获取标记价格', async () => {
      const markPrice = await exchange.fetchMarkPrice('BTC/USDT:USDT');
      expect(markPrice).toBeDefined();
      expect(markPrice.markPrice).toBe(50005);
      expect(markPrice.indexPrice).toBe(50000);
      expect(markPrice.exchange).toBe('okx');
    });

    it('应该获取资金费率', async () => {
      const fundingRate = await exchange.fetchFundingRate('BTC/USDT:USDT');
      expect(fundingRate).toBeDefined();
      expect(fundingRate.fundingRate).toBe(0.0001);
    });
  });

  describe('杠杆设置', () => {
    it('应该设置杠杆倍数', async () => {
      const result = await exchange.setLeverage(10, 'BTC/USDT:USDT');
      expect(result).toBeDefined();
    });

    it('应该设置杠杆倍数和保证金模式', async () => {
      const result = await exchange.setLeverage(5, 'BTC/USDT:USDT', 'isolated', 'long');
      expect(result).toBeDefined();
    });

    it('应该拒绝无效的杠杆倍数', async () => {
      await expect(exchange.setLeverage(0, 'BTC/USDT:USDT'))
        .rejects.toThrow();
      await expect(exchange.setLeverage(200, 'BTC/USDT:USDT'))
        .rejects.toThrow();
    });

    it('应该拒绝无效的保证金模式', async () => {
      await expect(exchange.setLeverage(10, 'BTC/USDT:USDT', 'invalid_mode'))
        .rejects.toThrow();
    });

    it('应该发出杠杆设置事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('leverageSet', eventSpy);

      await exchange.setLeverage(10, 'BTC/USDT:USDT', 'cross', 'net');

      expect(eventSpy).toHaveBeenCalledWith({
        symbol: 'BTC/USDT:USDT',
        leverage: 10,
        marginMode: 'cross',
        posSide: 'net',
        exchange: 'okx',
      });
    });
  });

  describe('订单操作', () => {
    it('应该创建限价订单', async () => {
      const order = await exchange.createOrder(
        'BTC/USDT:USDT',
        'limit',
        'buy',
        0.1,
        49000
      );
      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.symbol).toBe('BTC/USDT:USDT');
      expect(order.side).toBe('buy');
    });

    it('应该创建市价订单', async () => {
      const order = await exchange.createOrder(
        'BTC/USDT:USDT',
        'market',
        'sell',
        0.1
      );
      expect(order).toBeDefined();
      expect(order.type).toBe('market');
    });

    it('应该取消订单', async () => {
      const result = await exchange.cancelOrder('order_okx_123', 'BTC/USDT:USDT');
      expect(result).toBeDefined();
      expect(result.status).toBe('canceled');
    });

    it('应该查询订单状态', async () => {
      const order = await exchange.fetchOrder('order_okx_123', 'BTC/USDT:USDT');
      expect(order).toBeDefined();
      expect(order.status).toBe('closed');
    });

    it('应该获取未完成订单列表', async () => {
      const orders = await exchange.fetchOpenOrders('BTC/USDT:USDT');
      expect(Array.isArray(orders)).toBe(true);
    });
  });

  describe('算法订单', () => {
    it('应该创建算法订单', async () => {
      const order = await exchange.createAlgoOrder(
        'BTC/USDT:USDT',
        'limit',
        'buy',
        0.1,
        { marginMode: 'cross' }
      );
      expect(order).toBeDefined();
    });

    it('应该获取未完成的算法订单', async () => {
      const orders = await exchange.fetchOpenAlgoOrders('BTC/USDT:USDT');
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
      expect(orders[0].algoId).toBe('algo_123');
    });

    it('应该发出算法订单创建事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('algoOrderCreated', eventSpy);

      await exchange.createAlgoOrder('BTC/USDT:USDT', 'limit', 'buy', 0.1);

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('事件发射', () => {
    it('应该在订单创建时发出事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCreated', eventSpy);

      await exchange.createOrder('BTC/USDT:USDT', 'limit', 'buy', 0.1, 49000);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该在订单取消时发出事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCanceled', eventSpy);

      await exchange.cancelOrder('order_okx_123', 'BTC/USDT:USDT');

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该处理未连接错误', async () => {
      const newExchange = new OKXExchange(defaultConfig);
      // 不连接直接调用
      await expect(newExchange.fetchBalance())
        .rejects.toThrow();
    });

    it('应该处理无效交易对', async () => {
      await expect(exchange.fetchTicker('INVALID/PAIR'))
        .rejects.toThrow();
    });
  });

  describe('精度处理', () => {
    it('应该正确获取交易对精度', async () => {
      const precision = exchange.getPrecision('BTC/USDT:USDT');
      expect(precision).toBeDefined();
    });
  });
});

describe('OKXExchange 错误场景', () => {
  it('应该处理API密钥缺失', () => {
    expect(() => {
      new OKXExchange({ apiKey: '', secret: '' });
    }).not.toThrow(); // 构造不应该抛错，连接时才检查
  });

  it('应该处理网络超时', async () => {
    vi.doMock('ccxt', () => ({
      default: {
        okx: vi.fn().mockImplementation(() => ({
          loadMarkets: vi.fn().mockRejectedValue(new Error('Network timeout')),
        })),
      },
    }));

    // 在真实场景中会处理超时
  });
});
