/**
 * KuCoinExchange 测试
 * KuCoin Exchange Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock CCXT
vi.mock('ccxt', () => {
  // 创建基础 Mock 类 / Create base mock class
  class MockKuCoinBase {
    constructor(config) {
      this.id = 'kucoin';
      this.name = 'KuCoin';
      this.config = config;
      this.markets = {};
      this.has = {
        fetchPositions: true,
        fetchFundingRate: true,
        setLeverage: true,
        cancelAllOrders: true,
        fetchTradingFee: true,
        fetchFundingRateHistory: true,
        setMarginMode: true,
        fetchMarkPrice: true,
        fetchMyTrades: true,
        fetchWithdrawals: true,
        fetchDeposits: true,
        fetchCurrencies: true,
        fetchAccounts: true,
        transfer: true,
        fetchTime: true,
      };

      // API 方法 / API methods
      this.loadMarkets = vi.fn().mockResolvedValue({
        'BTC/USDT:USDT': {
          id: 'XBTUSDTM',
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
          id: 'ETHUSDTM',
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
      });

      this.fetchBalance = vi.fn().mockResolvedValue({
        USDT: { free: 10000, used: 1000, total: 11000 },
        BTC: { free: 0.5, used: 0.1, total: 0.6 },
        total: { USDT: 11000, BTC: 0.6 },
        free: { USDT: 10000, BTC: 0.5 },
        used: { USDT: 1000, BTC: 0.1 },
      });

      this.fetchTicker = vi.fn().mockResolvedValue({
        symbol: 'BTC/USDT:USDT',
        last: 50000,
        bid: 49990,
        ask: 50010,
        high: 51000,
        low: 49000,
        volume: 10000,
        timestamp: Date.now(),
      });

      this.fetchMarkPrice = vi.fn().mockResolvedValue({
        symbol: 'BTC/USDT:USDT',
        markPrice: 50005,
        indexPrice: 50000,
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
      });

      this.fetchFundingRate = vi.fn().mockResolvedValue({
        symbol: 'BTC/USDT:USDT',
        fundingRate: 0.0001,
        fundingTimestamp: Date.now() + 8 * 3600000,
        fundingDatetime: new Date(Date.now() + 8 * 3600000).toISOString(),
        nextFundingRate: 0.00012,
        nextFundingTimestamp: Date.now() + 16 * 3600000,
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
      });

      this.fetchPositions = vi.fn().mockResolvedValue([
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
          marginMode: 'cross',
          info: {
            settleCurrency: 'USDT',
            currentQty: '100',
            avgEntryPrice: '49000',
          },
        },
      ]);

      this.createOrder = vi.fn().mockImplementation((symbol, type, side, amount, price, params) => {
        return Promise.resolve({
          id: 'order_kucoin_' + Date.now(),
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
      });

      this.cancelOrder = vi.fn().mockResolvedValue({
        id: 'order_kucoin_123',
        status: 'canceled',
      });

      this.fetchOrder = vi.fn().mockResolvedValue({
        id: 'order_kucoin_123',
        symbol: 'BTC/USDT:USDT',
        status: 'closed',
        filled: 0.1,
        remaining: 0,
      });

      this.fetchOpenOrders = vi.fn().mockResolvedValue([]);
      this.fetchClosedOrders = vi.fn().mockResolvedValue([]);

      this.setLeverage = vi.fn().mockResolvedValue({ leverage: 10 });

      this.setMarginMode = vi.fn().mockResolvedValue({
        code: '200000',
        msg: 'success',
      });

      this.fetchTradingFee = vi.fn().mockResolvedValue({
        symbol: 'BTC/USDT:USDT',
        maker: 0.0002,
        taker: 0.0006,
      });

      this.fetchFundingRateHistory = vi.fn().mockResolvedValue([
        {
          symbol: 'BTC/USDT:USDT',
          fundingRate: 0.0001,
          timestamp: Date.now() - 8 * 3600000,
          datetime: new Date(Date.now() - 8 * 3600000).toISOString(),
        },
        {
          symbol: 'BTC/USDT:USDT',
          fundingRate: 0.00008,
          timestamp: Date.now() - 16 * 3600000,
          datetime: new Date(Date.now() - 16 * 3600000).toISOString(),
        },
      ]);

      this.fetchOrderBook = vi.fn().mockResolvedValue({
        symbol: 'BTC/USDT:USDT',
        bids: [[49990, 10], [49980, 20], [49970, 30]],
        asks: [[50010, 10], [50020, 20], [50030, 30]],
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 12345,
      });

      this.fetchTrades = vi.fn().mockResolvedValue([
        {
          id: 'trade_1',
          symbol: 'BTC/USDT:USDT',
          side: 'buy',
          price: 50000,
          amount: 0.1,
          cost: 5000,
          timestamp: Date.now(),
          datetime: new Date().toISOString(),
        },
      ]);

      this.fetchMyTrades = vi.fn().mockResolvedValue([
        {
          id: 'mytrade_1',
          order: 'order_123',
          symbol: 'BTC/USDT:USDT',
          side: 'buy',
          price: 49500,
          amount: 0.1,
          cost: 4950,
          fee: { cost: 2.97, currency: 'USDT' },
          timestamp: Date.now() - 3600000,
          datetime: new Date(Date.now() - 3600000).toISOString(),
        },
      ]);

      this.fetchWithdrawals = vi.fn().mockResolvedValue([
        {
          id: 'withdrawal_1',
          txid: '0x123abc',
          currency: 'USDT',
          amount: 1000,
          fee: { cost: 1, currency: 'USDT' },
          status: 'ok',
          address: '0xabc123',
          tag: null,
          timestamp: Date.now() - 86400000,
          datetime: new Date(Date.now() - 86400000).toISOString(),
        },
      ]);

      this.fetchDeposits = vi.fn().mockResolvedValue([
        {
          id: 'deposit_1',
          txid: '0x456def',
          currency: 'USDT',
          amount: 5000,
          status: 'ok',
          address: '0xdef456',
          tag: null,
          timestamp: Date.now() - 172800000,
          datetime: new Date(Date.now() - 172800000).toISOString(),
        },
      ]);

      this.fetchCurrencies = vi.fn().mockResolvedValue({
        USDT: {
          id: 'USDT',
          code: 'USDT',
          name: 'Tether',
          active: true,
          precision: 6,
        },
        BTC: {
          id: 'BTC',
          code: 'BTC',
          name: 'Bitcoin',
          active: true,
          precision: 8,
        },
      });

      this.fetchTime = vi.fn().mockResolvedValue(Date.now());

      this.fetchAccounts = vi.fn().mockResolvedValue([
        {
          id: 'main',
          type: 'main',
          currency: 'USDT',
          balance: 10000,
        },
        {
          id: 'trade',
          type: 'trade',
          currency: 'USDT',
          balance: 5000,
        },
      ]);

      this.transfer = vi.fn().mockResolvedValue({
        id: 'transfer_123',
        currency: 'USDT',
        amount: 1000,
        fromAccount: 'main',
        toAccount: 'trade',
        status: 'ok',
      });

      this.priceToPrecision = vi.fn().mockImplementation((symbol, price) => parseFloat(price.toFixed(1)));
      this.amountToPrecision = vi.fn().mockImplementation((symbol, amount) => parseFloat(amount.toFixed(3)));
    }
  }

  // KuCoin 现货 / KuCoin Spot
  class MockKuCoin extends MockKuCoinBase {
    constructor(config) {
      super(config);
      this.id = 'kucoin';
      this.name = 'KuCoin';
    }
  }

  // KuCoin 合约 / KuCoin Futures
  class MockKuCoinFutures extends MockKuCoinBase {
    constructor(config) {
      super(config);
      this.id = 'kucoinfutures';
      this.name = 'KuCoin Futures';
    }
  }

  return {
    default: {
      kucoin: MockKuCoin,
      kucoinfutures: MockKuCoinFutures,
    },
    kucoin: MockKuCoin,
    kucoinfutures: MockKuCoinFutures,
  };
});

import { KuCoinExchange } from '../../src/exchange/KuCoinExchange.js';

describe('KuCoinExchange', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    password: 'test_passphrase',
    sandbox: false,
    defaultType: 'swap',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new KuCoinExchange(defaultConfig);
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
      expect(exchange.name).toBe('kucoin');
    });

    it('应该正确存储配置 / Should correctly store configuration', () => {
      expect(exchange.config.apiKey).toBe('test_api_key');
      expect(exchange.config.password).toBe('test_passphrase');
      expect(exchange.config.sandbox).toBe(false);
    });

    it('应该默认使用 swap 交易类型 / Should default to swap trading type', () => {
      const ex = new KuCoinExchange({ apiKey: 'key', secret: 'secret' });
      expect(ex.config.defaultType).toBe('swap');
    });

    it('应该成功连接 / Should connect successfully', async () => {
      const newExchange = new KuCoinExchange(defaultConfig);
      await newExchange.connect();
      expect(newExchange.connected).toBe(true);
    });

    it('应该成功断开连接 / Should disconnect successfully', async () => {
      await exchange.disconnect();
      expect(exchange.connected).toBe(false);
    });

    it('应该支持沙盒模式 / Should support sandbox mode', () => {
      const sandboxExchange = new KuCoinExchange({
        ...defaultConfig,
        sandbox: true,
      });
      expect(sandboxExchange.config.sandbox).toBe(true);
    });

    it('应该支持现货模式 / Should support spot mode', () => {
      const spotExchange = new KuCoinExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      expect(spotExchange.config.defaultType).toBe('spot');
    });
  });

  describe('账户方法 / Account Methods', () => {
    it('应该获取账户余额 / Should fetch account balance', async () => {
      const balance = await exchange.fetchBalance();
      expect(balance).toBeDefined();
      expect(balance.free).toBeDefined();
      expect(balance.free.USDT).toBe(10000);
    });

    it('应该获取持仓信息 / Should fetch positions', async () => {
      const positions = await exchange.fetchPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);
      expect(positions[0].symbol).toBe('BTC/USDT:USDT');
      expect(positions[0].side).toBe('long');
      expect(positions[0].exchange).toBe('kucoin');
    });

    it('应该获取账户信息 / Should fetch account info', async () => {
      const accountInfo = await exchange.fetchAccountInfo();
      expect(accountInfo).toBeDefined();
      expect(accountInfo.accounts).toBeDefined();
      expect(accountInfo.exchange).toBe('kucoin');
    });
  });

  describe('行情方法 / Market Data Methods', () => {
    it('应该获取行情数据 / Should fetch ticker', async () => {
      const ticker = await exchange.fetchTicker('BTC/USDT:USDT');
      expect(ticker).toBeDefined();
      expect(ticker.symbol).toBe('BTC/USDT:USDT');
      expect(ticker.last).toBe(50000);
    });

    it('应该获取标记价格 / Should fetch mark price', async () => {
      const markPrice = await exchange.fetchMarkPrice('BTC/USDT:USDT');
      expect(markPrice).toBeDefined();
      expect(markPrice.markPrice).toBe(50005);
      expect(markPrice.indexPrice).toBe(50000);
      expect(markPrice.exchange).toBe('kucoin');
    });

    it('应该获取资金费率 / Should fetch funding rate', async () => {
      const fundingRate = await exchange.fetchFundingRate('BTC/USDT:USDT');
      expect(fundingRate).toBeDefined();
      expect(fundingRate.fundingRate).toBe(0.0001);
      expect(fundingRate.exchange).toBe('kucoin');
    });

    it('应该获取订单簿 / Should fetch order book', async () => {
      const orderBook = await exchange.fetchOrderBook('BTC/USDT:USDT', 20);
      expect(orderBook).toBeDefined();
      expect(orderBook.symbol).toBe('BTC/USDT:USDT');
      expect(orderBook.bids.length).toBeGreaterThan(0);
      expect(orderBook.asks.length).toBeGreaterThan(0);
      expect(orderBook.exchange).toBe('kucoin');
    });

    it('应该获取最近成交 / Should fetch recent trades', async () => {
      const trades = await exchange.fetchTrades('BTC/USDT:USDT', 100);
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].exchange).toBe('kucoin');
    });
  });

  describe('KuCoin 特有方法 / KuCoin-Specific Methods', () => {
    it('应该获取服务器时间 / Should fetch server time', async () => {
      const serverTime = await exchange.fetchServerTime();
      expect(serverTime).toBeDefined();
      expect(typeof serverTime).toBe('number');
    });

    it('应该获取交易手续费 / Should fetch trading fee', async () => {
      const fee = await exchange.fetchTradingFee('BTC/USDT:USDT');
      expect(fee).toBeDefined();
      expect(fee.symbol).toBe('BTC/USDT:USDT');
      expect(fee.maker).toBe(0.0002);
      expect(fee.taker).toBe(0.0006);
      expect(fee.exchange).toBe('kucoin');
    });

    it('应该获取历史资金费率 / Should fetch funding rate history', async () => {
      const history = await exchange.fetchFundingRateHistory('BTC/USDT:USDT', undefined, 10);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].symbol).toBe('BTC/USDT:USDT');
      expect(history[0].exchange).toBe('kucoin');
    });

    it('现货模式应该拒绝获取历史资金费率 / Spot mode should reject funding rate history', async () => {
      const spotExchange = new KuCoinExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.fetchFundingRateHistory('BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });

    it('应该获取我的交易历史 / Should fetch my trade history', async () => {
      const trades = await exchange.fetchMyTrades('BTC/USDT:USDT');
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].symbol).toBe('BTC/USDT:USDT');
      expect(trades[0].exchange).toBe('kucoin');
    });

    it('应该获取提现历史 / Should fetch withdrawal history', async () => {
      const withdrawals = await exchange.fetchWithdrawalHistory('USDT');
      expect(Array.isArray(withdrawals)).toBe(true);
      expect(withdrawals.length).toBeGreaterThan(0);
      expect(withdrawals[0].currency).toBe('USDT');
      expect(withdrawals[0].exchange).toBe('kucoin');
    });

    it('应该获取充值历史 / Should fetch deposit history', async () => {
      const deposits = await exchange.fetchDepositHistory('USDT');
      expect(Array.isArray(deposits)).toBe(true);
      expect(deposits.length).toBeGreaterThan(0);
      expect(deposits[0].currency).toBe('USDT');
      expect(deposits[0].exchange).toBe('kucoin');
    });

    it('应该获取币种信息 / Should fetch currencies', async () => {
      const currencies = await exchange.fetchCurrencies();
      expect(currencies).toBeDefined();
      expect(currencies.USDT).toBeDefined();
      expect(currencies.BTC).toBeDefined();
    });

    it('应该进行内部资金划转 / Should transfer funds internally', async () => {
      const result = await exchange.transfer('USDT', 1000, 'main', 'trade');
      expect(result).toBeDefined();
      expect(result.exchange).toBe('kucoin');
    });
  });

  describe('保证金模式设置 / Margin Mode Settings', () => {
    it('应该设置逐仓模式 / Should set isolated margin mode', async () => {
      const result = await exchange.setMarginMode('isolated', 'BTC/USDT:USDT');
      expect(result).toBeDefined();
    });

    it('应该设置全仓模式 / Should set cross margin mode', async () => {
      const result = await exchange.setMarginMode('cross', 'BTC/USDT:USDT');
      expect(result).toBeDefined();
    });

    it('应该拒绝无效的保证金模式 / Should reject invalid margin mode', async () => {
      await expect(exchange.setMarginMode('invalid_mode', 'BTC/USDT:USDT'))
        .rejects.toThrow();
    });

    it('应该发出保证金模式设置事件 / Should emit margin mode set event', async () => {
      const eventSpy = vi.fn();
      exchange.on('marginModeSet', eventSpy);

      await exchange.setMarginMode('cross', 'BTC/USDT:USDT');

      expect(eventSpy).toHaveBeenCalledWith({
        symbol: 'BTC/USDT:USDT',
        marginMode: 'cross',
        exchange: 'kucoin',
      });
    });

    it('现货模式应该拒绝设置保证金模式 / Spot mode should reject margin mode', async () => {
      const spotExchange = new KuCoinExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.setMarginMode('cross', 'BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });
  });

  describe('杠杆设置 / Leverage Settings', () => {
    it('应该设置杠杆倍数 / Should set leverage', async () => {
      const result = await exchange.setLeverage(10, 'BTC/USDT:USDT');
      expect(result).toBeDefined();
    });

    it('应该发出杠杆设置事件 / Should emit leverage set event', async () => {
      const eventSpy = vi.fn();
      exchange.on('leverageSet', eventSpy);

      await exchange.setLeverage(10, 'BTC/USDT:USDT');

      expect(eventSpy).toHaveBeenCalledWith({
        symbol: 'BTC/USDT:USDT',
        leverage: 10,
        exchange: 'kucoin',
      });
    });

    it('现货模式应该拒绝设置杠杆 / Spot mode should reject leverage', async () => {
      const spotExchange = new KuCoinExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.setLeverage(10, 'BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });
  });

  describe('订单操作 / Order Operations', () => {
    it('应该创建限价订单 / Should create limit order', async () => {
      const order = await exchange.createOrder(
        'BTC/USDT:USDT',
        'buy',
        'limit',
        0.1,
        49000
      );
      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.symbol).toBe('BTC/USDT:USDT');
      expect(order.side).toBe('buy');
    });

    it('应该创建市价订单 / Should create market order', async () => {
      const order = await exchange.createOrder(
        'BTC/USDT:USDT',
        'sell',
        'market',
        0.1
      );
      expect(order).toBeDefined();
      expect(order.type).toBe('market');
    });

    it('应该取消订单 / Should cancel order', async () => {
      const result = await exchange.cancelOrder('order_kucoin_123', 'BTC/USDT:USDT');
      expect(result).toBeDefined();
      expect(result.status).toBe('canceled');
    });

    it('应该查询订单状态 / Should fetch order status', async () => {
      const order = await exchange.fetchOrder('order_kucoin_123', 'BTC/USDT:USDT');
      expect(order).toBeDefined();
      expect(order.status).toBe('closed');
    });

    it('应该获取未完成订单列表 / Should fetch open orders', async () => {
      const orders = await exchange.fetchOpenOrders('BTC/USDT:USDT');
      expect(Array.isArray(orders)).toBe(true);
    });
  });

  describe('事件发射 / Event Emission', () => {
    it('应该在订单创建时发出事件 / Should emit event when order created', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCreated', eventSpy);

      await exchange.createOrder('BTC/USDT:USDT', 'buy', 'limit', 0.1, 49000);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该在订单取消时发出事件 / Should emit event when order canceled', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCanceled', eventSpy);

      await exchange.cancelOrder('order_kucoin_123', 'BTC/USDT:USDT');

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('错误处理 / Error Handling', () => {
    it('应该处理未连接错误 / Should handle not connected error', async () => {
      const newExchange = new KuCoinExchange(defaultConfig);
      // 不连接直接调用 / Call without connecting
      await expect(newExchange.fetchBalance())
        .rejects.toThrow();
    });

    it('应该处理无效交易对 / Should handle invalid symbol', async () => {
      await expect(exchange.fetchTicker('INVALID/PAIR'))
        .rejects.toThrow();
    });

    it('现货模式应该拒绝查询持仓 / Spot mode should reject position query', async () => {
      const spotExchange = new KuCoinExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.fetchPositions())
        .rejects.toThrow();

      await spotExchange.disconnect();
    });

    it('现货模式应该拒绝获取标记价格 / Spot mode should reject mark price', async () => {
      const spotExchange = new KuCoinExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.fetchMarkPrice('BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });

    it('现货模式应该拒绝获取资金费率 / Spot mode should reject funding rate', async () => {
      const spotExchange = new KuCoinExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.fetchFundingRate('BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });

    it('资金划转应该验证参数 / Transfer should validate parameters', async () => {
      await expect(exchange.transfer('', 1000, 'main', 'trade'))
        .rejects.toThrow();
    });
  });

  describe('精度处理 / Precision Handling', () => {
    it('应该正确获取交易对精度 / Should correctly get symbol precision', async () => {
      const precision = exchange.getPrecision('BTC/USDT:USDT');
      expect(precision).toBeDefined();
    });
  });
});

describe('KuCoinExchange 错误场景 / Error Scenarios', () => {
  it('应该处理API密钥缺失 / Should handle missing API key', () => {
    expect(() => {
      new KuCoinExchange({ apiKey: '', secret: '' });
    }).not.toThrow(); // 构造不应该抛错，连接时才检查 / Construction shouldn't throw
  });

  it('应该处理不同的默认交易类型 / Should handle different default trade types', () => {
    const spotExchange = new KuCoinExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'spot',
    });
    expect(spotExchange.config.defaultType).toBe('spot');

    const swapExchange = new KuCoinExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'swap',
    });
    expect(swapExchange.config.defaultType).toBe('swap');

    const futureExchange = new KuCoinExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'future',
    });
    expect(futureExchange.config.defaultType).toBe('future');
  });
});

describe('KuCoinExchange 持仓数据格式化 / Position Data Formatting', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    password: 'test_passphrase',
    sandbox: false,
    defaultType: 'swap',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new KuCoinExchange(defaultConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  it('应该正确格式化持仓数据 / Should correctly format position data', async () => {
    const positions = await exchange.fetchPositions();
    const pos = positions[0];

    expect(pos.symbol).toBe('BTC/USDT:USDT');
    expect(pos.side).toBe('long');
    expect(pos.contracts).toBe(0.1);
    expect(pos.entryPrice).toBe(49000);
    expect(pos.markPrice).toBe(50000);
    expect(pos.exchange).toBe('kucoin');
  });
});

describe('KuCoinExchange 沙盒模式 / Sandbox Mode', () => {
  it('沙盒模式应该正确配置 / Sandbox mode should configure correctly', async () => {
    const sandboxExchange = new KuCoinExchange({
      apiKey: 'test',
      secret: 'test',
      password: 'test',
      sandbox: true,
      defaultType: 'swap',
    });

    expect(sandboxExchange.config.sandbox).toBe(true);
  });
});

describe('KuCoinExchange WebSocket 支持检查 / WebSocket Support Check', () => {
  it('交易所实例应该可以被创建和配置 / Exchange instance should be creatable', () => {
    const exchange = new KuCoinExchange({
      apiKey: 'test',
      secret: 'test',
      password: 'test',
      sandbox: false,
      defaultType: 'swap',
    });

    expect(exchange).toBeDefined();
    expect(exchange.name).toBe('kucoin');
  });
});

describe('KuCoinExchange 资金划转 / Fund Transfer', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    password: 'test_passphrase',
    sandbox: false,
    defaultType: 'swap',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new KuCoinExchange(defaultConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  it('应该成功进行账户间划转 / Should transfer between accounts successfully', async () => {
    const result = await exchange.transfer('USDT', 1000, 'main', 'trade');
    expect(result).toBeDefined();
    expect(result.exchange).toBe('kucoin');
  });

  it('应该拒绝缺少参数的划转 / Should reject transfer with missing params', async () => {
    await expect(exchange.transfer('', 1000, 'main', 'trade'))
      .rejects.toThrow();

    await expect(exchange.transfer('USDT', null, 'main', 'trade'))
      .rejects.toThrow();

    await expect(exchange.transfer('USDT', 1000, '', 'trade'))
      .rejects.toThrow();

    await expect(exchange.transfer('USDT', 1000, 'main', ''))
      .rejects.toThrow();
  });
});

describe('KuCoinExchange 多账户类型 / Multiple Account Types', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    password: 'test_passphrase',
    sandbox: false,
    defaultType: 'swap',
  };

  beforeEach(async () => {
    exchange = new KuCoinExchange(defaultConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  it('应该能获取多个账户信息 / Should fetch multiple accounts', async () => {
    const accountInfo = await exchange.fetchAccountInfo();
    expect(accountInfo.accounts).toBeDefined();
    expect(Array.isArray(accountInfo.accounts)).toBe(true);
    expect(accountInfo.accounts.length).toBeGreaterThan(0);
  });
});
