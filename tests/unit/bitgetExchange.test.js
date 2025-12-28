/**
 * BitgetExchange 测试
 * Bitget Exchange Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock CCXT
vi.mock('ccxt', () => {
  // 使用 class 模拟构造函数
  // Use class to mock constructor
  class MockBitget {
    constructor(config) {
      this.id = 'bitget';
      this.name = 'Bitget';
      this.config = config;
      this.markets = {};
      this.has = {
        fetchPositions: true,
        fetchFundingRate: true,
        setLeverage: true,
        cancelAllOrders: true,
        fetchTradingFee: true,
        fetchFundingRateHistory: true,
        setPositionMode: true,
        setMarginMode: true,
        fetchMarkPrice: true,
        fetchMyTrades: true,
        fetchWithdrawals: true,
        fetchDeposits: true,
        fetchCurrencies: true,
      };

      // API 方法
      this.loadMarkets = vi.fn().mockResolvedValue({
        'BTC/USDT:USDT': {
          id: 'BTCUSDT_UMCBL',
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
          id: 'ETHUSDT_UMCBL',
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
            marginCoin: 'USDT',
            holdSide: 'long',
            averageOpenPrice: '49000',
            total: '0.1',
          },
        },
      ]);

      this.createOrder = vi.fn().mockImplementation((symbol, type, side, amount, price, params) => {
        return Promise.resolve({
          id: 'order_bitget_' + Date.now(),
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
        id: 'order_bitget_123',
        status: 'canceled',
      });

      this.fetchOrder = vi.fn().mockResolvedValue({
        id: 'order_bitget_123',
        symbol: 'BTC/USDT:USDT',
        status: 'closed',
        filled: 0.1,
        remaining: 0,
      });

      this.fetchOpenOrders = vi.fn().mockResolvedValue([]);
      this.fetchClosedOrders = vi.fn().mockResolvedValue([]);

      this.setLeverage = vi.fn().mockResolvedValue({ leverage: 10 });

      this.setPositionMode = vi.fn().mockResolvedValue({
        code: '0',
        msg: '',
      });

      this.setMarginMode = vi.fn().mockResolvedValue({
        code: '0',
        msg: '',
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

      this.publicSpotGetPublicTime = vi.fn().mockResolvedValue({
        data: {
          serverTime: Date.now().toString(),
        },
      });

      this.priceToPrecision = vi.fn().mockImplementation((symbol, price) => parseFloat(price.toFixed(1)));
      this.amountToPrecision = vi.fn().mockImplementation((symbol, amount) => parseFloat(amount.toFixed(3)));
    }
  }

  return {
    default: {
      bitget: MockBitget,
    },
    bitget: MockBitget,
  };
});

import { BitgetExchange } from '../../src/exchange/BitgetExchange.js';

describe('BitgetExchange', () => {
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
    exchange = new BitgetExchange(defaultConfig);
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
      expect(exchange.name).toBe('bitget');
    });

    it('应该正确存储配置', () => {
      expect(exchange.config.apiKey).toBe('test_api_key');
      expect(exchange.config.password).toBe('test_passphrase');
      expect(exchange.config.sandbox).toBe(false);
    });

    it('应该默认使用 swap 交易类型', () => {
      const ex = new BitgetExchange({ apiKey: 'key', secret: 'secret' });
      expect(ex.config.defaultType).toBe('swap');
    });

    it('应该成功连接', async () => {
      const newExchange = new BitgetExchange(defaultConfig);
      await newExchange.connect();
      expect(newExchange.connected).toBe(true);
    });

    it('应该成功断开连接', async () => {
      await exchange.disconnect();
      expect(exchange.connected).toBe(false);
    });

    it('应该支持沙盒模式', () => {
      const sandboxExchange = new BitgetExchange({
        ...defaultConfig,
        sandbox: true,
      });
      expect(sandboxExchange.config.sandbox).toBe(true);
    });
  });

  describe('账户方法', () => {
    it('应该获取账户余额', async () => {
      const balance = await exchange.fetchBalance();
      expect(balance).toBeDefined();
      expect(balance.free).toBeDefined();
      expect(balance.free.USDT).toBe(10000);
    });

    it('应该获取持仓信息', async () => {
      const positions = await exchange.fetchPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);
      expect(positions[0].symbol).toBe('BTC/USDT:USDT');
      expect(positions[0].side).toBe('long');
      expect(positions[0].exchange).toBe('bitget');
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
      expect(markPrice.exchange).toBe('bitget');
    });

    it('应该获取资金费率', async () => {
      const fundingRate = await exchange.fetchFundingRate('BTC/USDT:USDT');
      expect(fundingRate).toBeDefined();
      expect(fundingRate.fundingRate).toBe(0.0001);
      expect(fundingRate.exchange).toBe('bitget');
    });

    it('应该获取订单簿', async () => {
      const orderBook = await exchange.fetchOrderBook('BTC/USDT:USDT', 20);
      expect(orderBook).toBeDefined();
      expect(orderBook.symbol).toBe('BTC/USDT:USDT');
      expect(orderBook.bids.length).toBeGreaterThan(0);
      expect(orderBook.asks.length).toBeGreaterThan(0);
      expect(orderBook.exchange).toBe('bitget');
    });

    it('应该获取最近成交', async () => {
      const trades = await exchange.fetchTrades('BTC/USDT:USDT', 100);
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].exchange).toBe('bitget');
    });
  });

  describe('Bitget 特有方法', () => {
    it('应该获取服务器时间', async () => {
      const serverTime = await exchange.fetchServerTime();
      expect(serverTime).toBeDefined();
      expect(typeof serverTime).toBe('number');
    });

    it('应该获取交易手续费', async () => {
      const fee = await exchange.fetchTradingFee('BTC/USDT:USDT');
      expect(fee).toBeDefined();
      expect(fee.symbol).toBe('BTC/USDT:USDT');
      expect(fee.maker).toBe(0.0002);
      expect(fee.taker).toBe(0.0006);
      expect(fee.exchange).toBe('bitget');
    });

    it('应该获取历史资金费率', async () => {
      const history = await exchange.fetchFundingRateHistory('BTC/USDT:USDT', undefined, 10);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].symbol).toBe('BTC/USDT:USDT');
      expect(history[0].exchange).toBe('bitget');
    });

    it('现货模式应该拒绝获取历史资金费率', async () => {
      const spotExchange = new BitgetExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.fetchFundingRateHistory('BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });

    it('应该获取我的交易历史', async () => {
      const trades = await exchange.fetchMyTrades('BTC/USDT:USDT');
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].symbol).toBe('BTC/USDT:USDT');
      expect(trades[0].exchange).toBe('bitget');
    });

    it('应该获取提现历史', async () => {
      const withdrawals = await exchange.fetchWithdrawalHistory('USDT');
      expect(Array.isArray(withdrawals)).toBe(true);
      expect(withdrawals.length).toBeGreaterThan(0);
      expect(withdrawals[0].currency).toBe('USDT');
      expect(withdrawals[0].exchange).toBe('bitget');
    });

    it('应该获取充值历史', async () => {
      const deposits = await exchange.fetchDepositHistory('USDT');
      expect(Array.isArray(deposits)).toBe(true);
      expect(deposits.length).toBeGreaterThan(0);
      expect(deposits[0].currency).toBe('USDT');
      expect(deposits[0].exchange).toBe('bitget');
    });

    it('应该获取币种信息', async () => {
      const currencies = await exchange.fetchCurrencies();
      expect(currencies).toBeDefined();
      expect(currencies.USDT).toBeDefined();
      expect(currencies.BTC).toBeDefined();
    });
  });

  describe('持仓模式设置', () => {
    it('应该设置双向持仓模式 (对冲模式)', async () => {
      const result = await exchange.setPositionMode(true);
      expect(result).toBeDefined();
    });

    it('应该设置单向持仓模式', async () => {
      const result = await exchange.setPositionMode(false);
      expect(result).toBeDefined();
    });

    it('应该发出持仓模式设置事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('positionModeSet', eventSpy);

      await exchange.setPositionMode(true);

      expect(eventSpy).toHaveBeenCalledWith({
        hedgeMode: true,
        exchange: 'bitget',
      });
    });

    it('现货模式应该拒绝设置持仓模式', async () => {
      const spotExchange = new BitgetExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.setPositionMode(true))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });
  });

  describe('保证金模式设置', () => {
    it('应该设置逐仓模式', async () => {
      const result = await exchange.setMarginMode('isolated', 'BTC/USDT:USDT');
      expect(result).toBeDefined();
    });

    it('应该设置全仓模式', async () => {
      const result = await exchange.setMarginMode('cross', 'BTC/USDT:USDT');
      expect(result).toBeDefined();
    });

    it('应该拒绝无效的保证金模式', async () => {
      await expect(exchange.setMarginMode('invalid_mode', 'BTC/USDT:USDT'))
        .rejects.toThrow();
    });

    it('应该发出保证金模式设置事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('marginModeSet', eventSpy);

      await exchange.setMarginMode('cross', 'BTC/USDT:USDT');

      expect(eventSpy).toHaveBeenCalledWith({
        symbol: 'BTC/USDT:USDT',
        marginMode: 'cross',
        exchange: 'bitget',
      });
    });

    it('现货模式应该拒绝设置保证金模式', async () => {
      const spotExchange = new BitgetExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.setMarginMode('cross', 'BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });
  });

  describe('杠杆设置', () => {
    it('应该设置杠杆倍数', async () => {
      const result = await exchange.setLeverage(10, 'BTC/USDT:USDT');
      expect(result).toBeDefined();
    });

    it('应该发出杠杆设置事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('leverageSet', eventSpy);

      await exchange.setLeverage(10, 'BTC/USDT:USDT');

      expect(eventSpy).toHaveBeenCalledWith({
        symbol: 'BTC/USDT:USDT',
        leverage: 10,
        exchange: 'bitget',
      });
    });

    it('现货模式应该拒绝设置杠杆', async () => {
      const spotExchange = new BitgetExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.setLeverage(10, 'BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });
  });

  describe('订单操作', () => {
    it('应该创建限价订单', async () => {
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

    it('应该创建市价订单', async () => {
      const order = await exchange.createOrder(
        'BTC/USDT:USDT',
        'sell',
        'market',
        0.1
      );
      expect(order).toBeDefined();
      expect(order.type).toBe('market');
    });

    it('应该取消订单', async () => {
      const result = await exchange.cancelOrder('order_bitget_123', 'BTC/USDT:USDT');
      expect(result).toBeDefined();
      expect(result.status).toBe('canceled');
    });

    it('应该查询订单状态', async () => {
      const order = await exchange.fetchOrder('order_bitget_123', 'BTC/USDT:USDT');
      expect(order).toBeDefined();
      expect(order.status).toBe('closed');
    });

    it('应该获取未完成订单列表', async () => {
      const orders = await exchange.fetchOpenOrders('BTC/USDT:USDT');
      expect(Array.isArray(orders)).toBe(true);
    });
  });

  describe('止损订单', () => {
    it('应该创建止损订单', async () => {
      const order = await exchange.createStopOrder(
        'BTC/USDT:USDT',
        'sell',
        0.1,
        { stopPrice: 48000, stopType: 'stop_loss' }
      );
      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
    });

    it('应该创建止盈订单', async () => {
      const order = await exchange.createStopOrder(
        'BTC/USDT:USDT',
        'sell',
        0.1,
        { stopPrice: 52000, stopType: 'take_profit' }
      );
      expect(order).toBeDefined();
    });

    it('应该发出止损订单创建事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('stopOrderCreated', eventSpy);

      await exchange.createStopOrder(
        'BTC/USDT:USDT',
        'sell',
        0.1,
        { stopPrice: 48000 }
      );

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该拒绝没有触发价格的止损订单', async () => {
      await expect(exchange.createStopOrder('BTC/USDT:USDT', 'sell', 0.1, {}))
        .rejects.toThrow();
    });
  });

  describe('事件发射', () => {
    it('应该在订单创建时发出事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCreated', eventSpy);

      await exchange.createOrder('BTC/USDT:USDT', 'buy', 'limit', 0.1, 49000);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该在订单取消时发出事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCanceled', eventSpy);

      await exchange.cancelOrder('order_bitget_123', 'BTC/USDT:USDT');

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该处理未连接错误', async () => {
      const newExchange = new BitgetExchange(defaultConfig);
      // 不连接直接调用
      await expect(newExchange.fetchBalance())
        .rejects.toThrow();
    });

    it('应该处理无效交易对', async () => {
      await expect(exchange.fetchTicker('INVALID/PAIR'))
        .rejects.toThrow();
    });

    it('现货模式应该拒绝查询持仓', async () => {
      const spotExchange = new BitgetExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.fetchPositions())
        .rejects.toThrow();

      await spotExchange.disconnect();
    });

    it('现货模式应该拒绝获取标记价格', async () => {
      const spotExchange = new BitgetExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.fetchMarkPrice('BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });

    it('现货模式应该拒绝获取资金费率', async () => {
      const spotExchange = new BitgetExchange({
        ...defaultConfig,
        defaultType: 'spot',
      });
      await spotExchange.connect();

      await expect(spotExchange.fetchFundingRate('BTC/USDT'))
        .rejects.toThrow();

      await spotExchange.disconnect();
    });
  });

  describe('精度处理', () => {
    it('应该正确获取交易对精度', async () => {
      const precision = exchange.getPrecision('BTC/USDT:USDT');
      expect(precision).toBeDefined();
    });
  });
});

describe('BitgetExchange 错误场景', () => {
  it('应该处理API密钥缺失', () => {
    expect(() => {
      new BitgetExchange({ apiKey: '', secret: '' });
    }).not.toThrow(); // 构造不应该抛错，连接时才检查
  });

  it('应该处理不同的默认交易类型', () => {
    const spotExchange = new BitgetExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'spot',
    });
    expect(spotExchange.config.defaultType).toBe('spot');

    const swapExchange = new BitgetExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'swap',
    });
    expect(swapExchange.config.defaultType).toBe('swap');

    const futureExchange = new BitgetExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'future',
    });
    expect(futureExchange.config.defaultType).toBe('future');
  });
});

describe('BitgetExchange 持仓数据格式化', () => {
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
    exchange = new BitgetExchange(defaultConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  it('应该正确格式化持仓数据', async () => {
    const positions = await exchange.fetchPositions();
    const pos = positions[0];

    expect(pos.symbol).toBe('BTC/USDT:USDT');
    expect(pos.side).toBe('long');
    expect(pos.contracts).toBe(0.1);
    expect(pos.entryPrice).toBe(49000);
    expect(pos.markPrice).toBe(50000);
    expect(pos.exchange).toBe('bitget');
  });
});

describe('BitgetExchange WebSocket 支持检查', () => {
  it('交易所实例应该可以被创建和配置', () => {
    const exchange = new BitgetExchange({
      apiKey: 'test',
      secret: 'test',
      password: 'test',
      sandbox: false,
      defaultType: 'swap',
    });

    expect(exchange).toBeDefined();
    expect(exchange.name).toBe('bitget');
  });
});
