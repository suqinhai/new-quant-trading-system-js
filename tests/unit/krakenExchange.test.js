/**
 * KrakenExchange 测试
 * Kraken Exchange Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock CCXT
vi.mock('ccxt', () => {
  // 创建基础 Mock 类 / Create base mock class
  class MockKrakenBase {
    constructor(config) {
      this.id = 'kraken';
      this.name = 'Kraken';
      this.config = config;
      this.markets = {};
      this.has = {
        fetchPositions: true,
        fetchFundingRate: true,
        setLeverage: true,
        cancelAllOrders: true,
        fetchTradingFee: true,
        fetchFundingRateHistory: true,
        fetchMyTrades: true,
        fetchWithdrawals: true,
        fetchDeposits: true,
        fetchDepositAddress: true,
        fetchTime: true,
        fetchClosedOrders: true,
        fetchTrades: true,
      };

      // API 方法 / API methods
      this.loadMarkets = vi.fn().mockResolvedValue({
        'BTC/USD': {
          id: 'XXBTZUSD',
          symbol: 'BTC/USD',
          base: 'BTC',
          quote: 'USD',
          type: 'spot',
          spot: true,
          future: false,
          swap: false,
          precision: { amount: 8, price: 1 },
          limits: {
            amount: { min: 0.0001, max: 10000 },
            price: { min: 0.1, max: 1000000 },
          },
          active: true,
        },
        'ETH/USD': {
          id: 'XETHZUSD',
          symbol: 'ETH/USD',
          base: 'ETH',
          quote: 'USD',
          type: 'spot',
          spot: true,
          future: false,
          swap: false,
          precision: { amount: 8, price: 2 },
          limits: {
            amount: { min: 0.001, max: 10000 },
            price: { min: 0.01, max: 100000 },
          },
          active: true,
        },
        'BTC/USD:USD': {
          id: 'PI_XBTUSD',
          symbol: 'BTC/USD:USD',
          base: 'BTC',
          quote: 'USD',
          settle: 'USD',
          type: 'swap',
          spot: false,
          future: false,
          swap: true,
          precision: { amount: 0.001, price: 0.1 },
          limits: {
            amount: { min: 0.001, max: 10000 },
            price: { min: 0.1, max: 1000000 },
          },
          active: true,
        },
        'ETH/USD:USD': {
          id: 'PI_ETHUSD',
          symbol: 'ETH/USD:USD',
          base: 'ETH',
          quote: 'USD',
          settle: 'USD',
          type: 'swap',
          spot: false,
          future: false,
          swap: true,
          precision: { amount: 0.01, price: 0.01 },
          limits: {
            amount: { min: 0.01, max: 10000 },
            price: { min: 0.01, max: 100000 },
          },
          active: true,
        },
      });

      this.fetchBalance = vi.fn().mockResolvedValue({
        USD: { free: 10000, used: 1000, total: 11000 },
        BTC: { free: 0.5, used: 0.1, total: 0.6 },
        total: { USD: 11000, BTC: 0.6 },
        free: { USD: 10000, BTC: 0.5 },
        used: { USD: 1000, BTC: 0.1 },
      });

      this.fetchTicker = vi.fn().mockResolvedValue({
        symbol: 'BTC/USD',
        last: 50000,
        bid: 49990,
        ask: 50010,
        high: 51000,
        low: 49000,
        volume: 10000,
        timestamp: Date.now(),
      });

      this.fetchTime = vi.fn().mockResolvedValue(Date.now());

      this.fetchTradingFee = vi.fn().mockResolvedValue({
        symbol: 'BTC/USD',
        maker: 0.0016,
        taker: 0.0026,
      });

      this.fetchFundingRateHistory = vi.fn().mockResolvedValue([
        {
          symbol: 'BTC/USD:USD',
          fundingRate: 0.0001,
          timestamp: Date.now() - 8 * 3600000,
          datetime: new Date(Date.now() - 8 * 3600000).toISOString(),
        },
        {
          symbol: 'BTC/USD:USD',
          fundingRate: 0.00008,
          timestamp: Date.now() - 16 * 3600000,
          datetime: new Date(Date.now() - 16 * 3600000).toISOString(),
        },
      ]);

      this.setLeverage = vi.fn().mockResolvedValue({ leverage: 5 });

      this.privatePostTradeVolume = vi.fn().mockResolvedValue({
        result: {
          currency: 'USD',
          volume: 50000,
          fees: { 'BTC/USD': { fee: '0.0026', minfee: '0.0016', maxfee: '0.0026' } },
          fees_maker: { 'BTC/USD': { fee: '0.0016', minfee: '0.0000', maxfee: '0.0016' } },
        },
      });

      this.fetchTrades = vi.fn().mockResolvedValue([
        {
          id: 'trade_1',
          symbol: 'BTC/USD',
          side: 'buy',
          price: 50000,
          amount: 0.1,
          cost: 5000,
          timestamp: Date.now(),
          datetime: new Date().toISOString(),
        },
        {
          id: 'trade_2',
          symbol: 'BTC/USD',
          side: 'sell',
          price: 50100,
          amount: 0.05,
          cost: 2505,
          timestamp: Date.now() - 60000,
          datetime: new Date(Date.now() - 60000).toISOString(),
        },
      ]);

      this.fetchMyTrades = vi.fn().mockResolvedValue([
        {
          id: 'mytrade_1',
          order: 'order_123',
          symbol: 'BTC/USD',
          side: 'buy',
          price: 49500,
          amount: 0.1,
          cost: 4950,
          fee: { cost: 12.87, currency: 'USD' },
          timestamp: Date.now() - 3600000,
          datetime: new Date(Date.now() - 3600000).toISOString(),
        },
      ]);

      this.fetchClosedOrders = vi.fn().mockResolvedValue([
        {
          id: 'order_closed_1',
          symbol: 'BTC/USD',
          type: 'limit',
          side: 'buy',
          price: 49000,
          amount: 0.1,
          filled: 0.1,
          remaining: 0,
          status: 'closed',
          timestamp: Date.now() - 86400000,
          datetime: new Date(Date.now() - 86400000).toISOString(),
        },
      ]);

      this.fetchPositions = vi.fn().mockResolvedValue([
        {
          symbol: 'BTC/USD:USD',
          side: 'long',
          contracts: 0.1,
          contractSize: 1,
          unrealizedPnl: 100,
          realizedPnl: 50,
          leverage: 5,
          entryPrice: 49000,
          markPrice: 50000,
          liquidationPrice: 45000,
          marginMode: 'cross',
          collateral: 1000,
          notional: 5000,
          timestamp: Date.now(),
        },
      ]);

      this.fetchDepositAddress = vi.fn().mockResolvedValue({
        currency: 'BTC',
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        tag: null,
        network: 'bitcoin',
      });

      this.fetchWithdrawals = vi.fn().mockResolvedValue([
        {
          id: 'withdrawal_1',
          txid: '0x123abc456def',
          currency: 'USD',
          amount: 1000,
          fee: { cost: 5, currency: 'USD' },
          status: 'ok',
          address: 'bank_account_123',
          tag: null,
          timestamp: Date.now() - 86400000,
          datetime: new Date(Date.now() - 86400000).toISOString(),
        },
      ]);

      this.fetchDeposits = vi.fn().mockResolvedValue([
        {
          id: 'deposit_1',
          txid: '0x789ghi012jkl',
          currency: 'BTC',
          amount: 0.5,
          fee: { cost: 0, currency: 'BTC' },
          status: 'ok',
          address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          tag: null,
          timestamp: Date.now() - 172800000,
          datetime: new Date(Date.now() - 172800000).toISOString(),
        },
      ]);

      this.createOrder = vi.fn().mockImplementation((symbol, type, side, amount, price, params) => {
        return Promise.resolve({
          id: 'order_kraken_' + Date.now(),
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
          info: { ordertype: type },
        });
      });

      this.cancelOrder = vi.fn().mockResolvedValue({
        id: 'order_kraken_123',
        status: 'canceled',
      });

      this.fetchOrder = vi.fn().mockResolvedValue({
        id: 'order_kraken_123',
        symbol: 'BTC/USD',
        status: 'closed',
        filled: 0.1,
        remaining: 0,
      });

      this.fetchOpenOrders = vi.fn().mockResolvedValue([]);

      this.fetchOrderBook = vi.fn().mockResolvedValue({
        symbol: 'BTC/USD',
        bids: [[49990, 10], [49980, 20], [49970, 30]],
        asks: [[50010, 10], [50020, 20], [50030, 30]],
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 12345,
      });

      this.priceToPrecision = vi.fn().mockImplementation((symbol, price) => parseFloat(price.toFixed(1)));
      this.amountToPrecision = vi.fn().mockImplementation((symbol, amount) => parseFloat(amount.toFixed(8)));
    }
  }

  // Kraken 现货 / Kraken Spot
  class MockKraken extends MockKrakenBase {
    constructor(config) {
      super(config);
      this.id = 'kraken';
      this.name = 'Kraken';
    }
  }

  // Kraken 合约 / Kraken Futures
  class MockKrakenFutures extends MockKrakenBase {
    constructor(config) {
      super(config);
      this.id = 'krakenfutures';
      this.name = 'Kraken Futures';
    }
  }

  return {
    default: {
      kraken: MockKraken,
      krakenfutures: MockKrakenFutures,
    },
    kraken: MockKraken,
    krakenfutures: MockKrakenFutures,
  };
});

import { KrakenExchange } from '../../src/exchange/KrakenExchange.js';

describe('KrakenExchange', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    sandbox: false,
    defaultType: 'spot',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new KrakenExchange(defaultConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  describe('构造函数和连接 / Constructor and Connection', () => {
    it('应该正确初始化交易所名称 / Should correctly initialize exchange name', () => {
      expect(exchange.name).toBe('kraken');
    });

    it('应该正确存储配置 / Should correctly store configuration', () => {
      expect(exchange.config.apiKey).toBe('test_api_key');
      expect(exchange.config.sandbox).toBe(false);
    });

    it('应该默认使用 swap 交易类型 / Should default to swap trading type', () => {
      const ex = new KrakenExchange({ apiKey: 'key', secret: 'secret' });
      expect(ex.config.defaultType).toBe('swap');
    });

    it('应该成功连接 / Should connect successfully', async () => {
      const newExchange = new KrakenExchange(defaultConfig);
      await newExchange.connect();
      expect(newExchange.connected).toBe(true);
    });

    it('应该成功断开连接 / Should disconnect successfully', async () => {
      await exchange.disconnect();
      expect(exchange.connected).toBe(false);
    });

    it('应该支持沙盒模式 / Should support sandbox mode', () => {
      const sandboxExchange = new KrakenExchange({
        ...defaultConfig,
        sandbox: true,
      });
      expect(sandboxExchange.config.sandbox).toBe(true);
    });

    it('应该支持合约模式 / Should support futures mode', () => {
      const futuresExchange = new KrakenExchange({
        ...defaultConfig,
        defaultType: 'swap',
      });
      expect(futuresExchange.config.defaultType).toBe('swap');
    });

    it('应该支持交割合约模式 / Should support future mode', () => {
      const futureExchange = new KrakenExchange({
        ...defaultConfig,
        defaultType: 'future',
      });
      expect(futureExchange.config.defaultType).toBe('future');
    });
  });

  describe('账户方法 / Account Methods', () => {
    it('应该获取账户余额 / Should fetch account balance', async () => {
      const balance = await exchange.fetchBalance();
      expect(balance).toBeDefined();
      expect(balance.free).toBeDefined();
      expect(balance.free.USD).toBe(10000);
    });
  });

  describe('行情方法 / Market Data Methods', () => {
    it('应该获取行情数据 / Should fetch ticker', async () => {
      const ticker = await exchange.fetchTicker('BTC/USD');
      expect(ticker).toBeDefined();
      expect(ticker.symbol).toBe('BTC/USD');
      expect(ticker.last).toBe(50000);
    });
  });

  describe('Kraken 特有方法 / Kraken-Specific Methods', () => {
    it('应该获取服务器时间 / Should fetch server time', async () => {
      const serverTime = await exchange.fetchServerTime();
      expect(serverTime).toBeDefined();
      expect(typeof serverTime).toBe('number');
    });

    it('应该获取交易手续费 / Should fetch trading fee', async () => {
      const fee = await exchange.fetchTradingFee('BTC/USD');
      expect(fee).toBeDefined();
      expect(fee.symbol).toBe('BTC/USD');
      expect(fee.maker).toBe(0.0016);
      expect(fee.taker).toBe(0.0026);
      expect(fee.exchange).toBe('kraken');
    });

    it('应该获取交易量等级 / Should fetch trading volume tier', async () => {
      const volume = await exchange.fetchTradingVolume();
      expect(volume).toBeDefined();
      expect(volume.currency).toBe('USD');
      expect(volume.volume).toBe(50000);
      expect(volume.exchange).toBe('kraken');
    });

    it('应该获取交易对列表 / Should fetch trading pairs', async () => {
      const pairs = await exchange.fetchTradingPairs();
      expect(Array.isArray(pairs)).toBe(true);
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs[0].symbol).toBeDefined();
      expect(pairs[0].exchange).toBe('kraken');
    });

    it('应该获取最近交易 / Should fetch recent trades', async () => {
      const trades = await exchange.fetchRecentTrades('BTC/USD', 100);
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].symbol).toBe('BTC/USD');
      expect(trades[0].exchange).toBe('kraken');
    });

    it('应该获取我的交易历史 / Should fetch my trade history', async () => {
      const trades = await exchange.fetchMyTrades('BTC/USD');
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].symbol).toBe('BTC/USD');
      expect(trades[0].exchange).toBe('kraken');
    });

    it('应该获取订单历史 / Should fetch order history', async () => {
      const orders = await exchange.fetchOrderHistory('BTC/USD');
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
    });

    it('应该获取存款地址 / Should fetch deposit address', async () => {
      const address = await exchange.fetchDepositAddress('BTC');
      expect(address).toBeDefined();
      expect(address.currency).toBe('BTC');
      expect(address.address).toBeDefined();
      expect(address.exchange).toBe('kraken');
    });

    it('应该获取提款历史 / Should fetch withdrawal history', async () => {
      const withdrawals = await exchange.fetchWithdrawals('USD');
      expect(Array.isArray(withdrawals)).toBe(true);
      expect(withdrawals.length).toBeGreaterThan(0);
      expect(withdrawals[0].currency).toBe('USD');
      expect(withdrawals[0].exchange).toBe('kraken');
    });

    it('应该获取存款历史 / Should fetch deposit history', async () => {
      const deposits = await exchange.fetchDeposits('BTC');
      expect(Array.isArray(deposits)).toBe(true);
      expect(deposits.length).toBeGreaterThan(0);
      expect(deposits[0].currency).toBe('BTC');
      expect(deposits[0].exchange).toBe('kraken');
    });
  });

  describe('订单操作 / Order Operations', () => {
    it('应该创建限价订单 / Should create limit order', async () => {
      const order = await exchange.createOrder(
        'BTC/USD',
        'buy',
        'limit',
        0.1,
        49000
      );
      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.symbol).toBe('BTC/USD');
      expect(order.side).toBe('buy');
    });

    it('应该创建市价订单 / Should create market order', async () => {
      const order = await exchange.createOrder(
        'BTC/USD',
        'sell',
        'market',
        0.1
      );
      expect(order).toBeDefined();
      expect(order.type).toBe('market');
    });

    it('应该取消订单 / Should cancel order', async () => {
      const result = await exchange.cancelOrder('order_kraken_123', 'BTC/USD');
      expect(result).toBeDefined();
      expect(result.status).toBe('canceled');
    });

    it('应该查询订单状态 / Should fetch order status', async () => {
      const order = await exchange.fetchOrder('order_kraken_123', 'BTC/USD');
      expect(order).toBeDefined();
      expect(order.status).toBe('closed');
    });

    it('应该获取未完成订单列表 / Should fetch open orders', async () => {
      const orders = await exchange.fetchOpenOrders('BTC/USD');
      expect(Array.isArray(orders)).toBe(true);
    });
  });

  describe('事件发射 / Event Emission', () => {
    it('应该在订单创建时发出事件 / Should emit event when order created', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCreated', eventSpy);

      await exchange.createOrder('BTC/USD', 'buy', 'limit', 0.1, 49000);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该在订单取消时发出事件 / Should emit event when order canceled', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCanceled', eventSpy);

      await exchange.cancelOrder('order_kraken_123', 'BTC/USD');

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('错误处理 / Error Handling', () => {
    it('应该处理未连接错误 / Should handle not connected error', async () => {
      const newExchange = new KrakenExchange(defaultConfig);
      // 不连接直接调用 / Call without connecting
      await expect(newExchange.fetchBalance())
        .rejects.toThrow();
    });

    it('应该处理无效交易对 / Should handle invalid symbol', async () => {
      await expect(exchange.fetchTicker('INVALID/PAIR'))
        .rejects.toThrow();
    });
  });
});

describe('KrakenExchange 合约模式 / Futures Mode', () => {
  let exchange;
  const futuresConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    sandbox: false,
    defaultType: 'swap',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new KrakenExchange(futuresConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  describe('合约特有方法 / Futures-Specific Methods', () => {
    it('应该获取持仓信息 / Should fetch positions', async () => {
      const positions = await exchange.fetchPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);
      expect(positions[0].symbol).toBeDefined();
      expect(positions[0].side).toBe('long');
      expect(positions[0].exchange).toBe('kraken');
    });

    it('应该正确格式化持仓数据 / Should correctly format position data', async () => {
      const positions = await exchange.fetchPositions();
      const pos = positions[0];

      expect(pos.contracts).toBeDefined();
      expect(pos.entryPrice).toBeDefined();
      expect(pos.markPrice).toBeDefined();
      expect(pos.leverage).toBeDefined();
      expect(pos.unrealizedPnl).toBeDefined();
      expect(pos.marginMode).toBeDefined();
    });

    it('应该设置杠杆倍数 / Should set leverage', async () => {
      const result = await exchange.setLeverage(5, 'BTC/USD:USD');
      expect(result).toBeDefined();
    });

    it('应该发出杠杆设置事件 / Should emit leverage set event', async () => {
      const eventSpy = vi.fn();
      exchange.on('leverageSet', eventSpy);

      await exchange.setLeverage(5, 'BTC/USD:USD');

      expect(eventSpy).toHaveBeenCalledWith({
        symbol: 'BTC/USD:USD',
        leverage: 5,
        exchange: 'kraken',
      });
    });

    it('应该获取历史资金费率 / Should fetch funding rate history', async () => {
      const history = await exchange.fetchFundingRateHistory('BTC/USD:USD', undefined, 10);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].fundingRate).toBeDefined();
      expect(history[0].exchange).toBe('kraken');
    });
  });
});

describe('KrakenExchange 现货模式限制 / Spot Mode Restrictions', () => {
  let exchange;
  const spotConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    sandbox: false,
    defaultType: 'spot',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new KrakenExchange(spotConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  it('现货模式应该返回空持仓列表 / Spot mode should return empty positions', async () => {
    const positions = await exchange.fetchPositions();
    expect(Array.isArray(positions)).toBe(true);
    expect(positions.length).toBe(0);
  });

  it('现货模式应该拒绝设置杠杆 / Spot mode should reject leverage', async () => {
    await expect(exchange.setLeverage(5, 'BTC/USD'))
      .rejects.toThrow();
  });

  it('现货模式应该拒绝获取历史资金费率 / Spot mode should reject funding rate history', async () => {
    await expect(exchange.fetchFundingRateHistory('BTC/USD'))
      .rejects.toThrow();
  });
});

describe('KrakenExchange 错误场景 / Error Scenarios', () => {
  it('应该处理API密钥缺失 / Should handle missing API key', () => {
    expect(() => {
      new KrakenExchange({ apiKey: '', secret: '' });
    }).not.toThrow(); // 构造不应该抛错，连接时才检查 / Construction shouldn't throw
  });

  it('应该处理不同的默认交易类型 / Should handle different default trade types', () => {
    const spotExchange = new KrakenExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'spot',
    });
    expect(spotExchange.config.defaultType).toBe('spot');

    const swapExchange = new KrakenExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'swap',
    });
    expect(swapExchange.config.defaultType).toBe('swap');

    const futureExchange = new KrakenExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'future',
    });
    expect(futureExchange.config.defaultType).toBe('future');
  });
});

describe('KrakenExchange 沙盒模式 / Sandbox Mode', () => {
  it('沙盒模式应该正确配置 / Sandbox mode should configure correctly', async () => {
    const sandboxExchange = new KrakenExchange({
      apiKey: 'test',
      secret: 'test',
      sandbox: true,
      defaultType: 'swap',
    });

    expect(sandboxExchange.config.sandbox).toBe(true);
  });
});

describe('KrakenExchange 实例创建 / Instance Creation', () => {
  it('交易所实例应该可以被创建和配置 / Exchange instance should be creatable', () => {
    const exchange = new KrakenExchange({
      apiKey: 'test',
      secret: 'test',
      sandbox: false,
      defaultType: 'spot',
    });

    expect(exchange).toBeDefined();
    expect(exchange.name).toBe('kraken');
  });

  it('应该支持不同的配置选项 / Should support different config options', () => {
    const exchange = new KrakenExchange({
      apiKey: 'test',
      secret: 'test',
      sandbox: true,
      defaultType: 'swap',
      timeout: 60000,
      enableRateLimit: false,
    });

    expect(exchange.config.sandbox).toBe(true);
    expect(exchange.config.defaultType).toBe('swap');
    expect(exchange.config.timeout).toBe(60000);
    expect(exchange.config.enableRateLimit).toBe(false);
  });
});

describe('KrakenExchange 交易对和市场信息 / Symbol and Market Info', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    sandbox: false,
    defaultType: 'spot',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new KrakenExchange(defaultConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  it('应该获取完整的交易对信息 / Should fetch complete trading pair info', async () => {
    const pairs = await exchange.fetchTradingPairs();
    const btcPair = pairs.find(p => p.symbol === 'BTC/USD');

    expect(btcPair).toBeDefined();
    expect(btcPair.base).toBe('BTC');
    expect(btcPair.quote).toBe('USD');
    expect(btcPair.active).toBe(true);
    expect(btcPair.precision).toBeDefined();
    expect(btcPair.limits).toBeDefined();
  });

  it('应该正确获取交易对精度 / Should correctly get symbol precision', async () => {
    const precision = exchange.getPrecision('BTC/USD');
    expect(precision).toBeDefined();
  });
});

describe('KrakenExchange 历史数据 / Historical Data', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    sandbox: false,
    defaultType: 'spot',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new KrakenExchange(defaultConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  it('应该获取无符号的交易历史 / Should fetch trade history without symbol', async () => {
    const trades = await exchange.fetchMyTrades();
    expect(Array.isArray(trades)).toBe(true);
  });

  it('应该获取无符号的订单历史 / Should fetch order history without symbol', async () => {
    const orders = await exchange.fetchOrderHistory();
    expect(Array.isArray(orders)).toBe(true);
  });

  it('应该获取全部提款历史 / Should fetch all withdrawal history', async () => {
    const withdrawals = await exchange.fetchWithdrawals();
    expect(Array.isArray(withdrawals)).toBe(true);
  });

  it('应该获取全部存款历史 / Should fetch all deposit history', async () => {
    const deposits = await exchange.fetchDeposits();
    expect(Array.isArray(deposits)).toBe(true);
  });
});
