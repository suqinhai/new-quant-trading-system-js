/**
 * DeribitExchange 测试
 * Deribit Exchange Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock CCXT
vi.mock('ccxt', () => {
  // 使用 class 模拟构造函数
  // Use class to mock constructor
  class MockDeribit {
    constructor(config) {
      this.id = 'deribit';
      this.name = 'Deribit';
      this.config = config;
      this.markets = {};
      this.has = {
        fetchPositions: true,
        fetchFundingRate: true,
        setLeverage: true,
        cancelAllOrders: true,
        fetchTradingFee: true,
        fetchFundingRateHistory: true,
      };

      // API 方法
      this.loadMarkets = vi.fn().mockResolvedValue({
        'BTC/USD:BTC': {
          id: 'BTC-PERPETUAL',
          symbol: 'BTC/USD:BTC',
          base: 'BTC',
          quote: 'USD',
          settle: 'BTC',
          type: 'swap',
          precision: { amount: 10, price: 0.5 },
          limits: {
            amount: { min: 10, max: 10000000 },
            price: { min: 0.5, max: 1000000 },
          },
          active: true,
        },
        'ETH/USD:ETH': {
          id: 'ETH-PERPETUAL',
          symbol: 'ETH/USD:ETH',
          base: 'ETH',
          quote: 'USD',
          settle: 'ETH',
          type: 'swap',
          precision: { amount: 1, price: 0.05 },
          limits: {
            amount: { min: 1, max: 10000000 },
            price: { min: 0.05, max: 100000 },
          },
          active: true,
        },
        'BTC-27DEC24-100000-C': {
          id: 'BTC-27DEC24-100000-C',
          symbol: 'BTC-27DEC24-100000-C',
          base: 'BTC',
          quote: 'USD',
          type: 'option',
          optionType: 'call',
          strike: 100000,
          expiry: 1735257600000,
          expiryDatetime: '2024-12-27T08:00:00.000Z',
          active: true,
        },
      });

      this.fetchBalance = vi.fn().mockResolvedValue({
        BTC: { free: 1.5, used: 0.5, total: 2.0 },
        ETH: { free: 10, used: 2, total: 12 },
        total: { BTC: 2.0, ETH: 12 },
        free: { BTC: 1.5, ETH: 10 },
        used: { BTC: 0.5, ETH: 2 },
      });

      this.fetchTicker = vi.fn().mockResolvedValue({
        symbol: 'BTC/USD:BTC',
        last: 50000,
        bid: 49990,
        ask: 50010,
        high: 51000,
        low: 49000,
        volume: 10000,
        timestamp: Date.now(),
        info: {
          index_price: 50000,
          mark_price: 50005,
        },
      });

      this.fetchMarkPrice = vi.fn().mockResolvedValue({
        symbol: 'BTC/USD:BTC',
        markPrice: 50005,
        indexPrice: 50000,
        timestamp: Date.now(),
      });

      this.fetchFundingRate = vi.fn().mockResolvedValue({
        symbol: 'BTC/USD:BTC',
        fundingRate: 0.0001,
        fundingTimestamp: Date.now() + 8 * 3600000,
        nextFundingRate: 0.00012,
        nextFundingTimestamp: Date.now() + 16 * 3600000,
      });

      this.fetchPositions = vi.fn().mockResolvedValue([
        {
          symbol: 'BTC/USD:BTC',
          side: 'long',
          contracts: 1000,
          contractSize: 10,
          unrealizedPnl: 0.05,
          leverage: 10,
          entryPrice: 49000,
          markPrice: 50000,
          liquidationPrice: 45000,
          info: {
            size: 1000,
            average_price: 49000,
            mark_price: 50000,
            estimated_liquidation_price: 45000,
            total_profit_loss: 0.05,
            realized_profit_loss: 0.01,
            initial_margin: 0.1,
            delta: 0.02,
            kind: 'future',
          },
        },
      ]);

      this.createOrder = vi.fn().mockImplementation((symbol, type, side, amount, price, params) => {
        return Promise.resolve({
          id: 'order_deribit_' + Date.now(),
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
          info: { order_type: type },
        });
      });

      this.cancelOrder = vi.fn().mockResolvedValue({
        id: 'order_deribit_123',
        status: 'canceled',
      });

      this.fetchOrder = vi.fn().mockResolvedValue({
        id: 'order_deribit_123',
        symbol: 'BTC/USD:BTC',
        status: 'closed',
        filled: 100,
        remaining: 0,
      });

      this.fetchOpenOrders = vi.fn().mockResolvedValue([]);
      this.fetchClosedOrders = vi.fn().mockResolvedValue([]);
      this.fetchOrders = vi.fn().mockResolvedValue([
        {
          id: 'order_deribit_1',
          symbol: 'BTC/USD:BTC',
          type: 'limit',
          side: 'buy',
          amount: 100,
          price: 49000,
          status: 'closed',
          filled: 100,
          remaining: 0,
          timestamp: Date.now() - 3600000,
        },
      ]);

      this.setLeverage = vi.fn().mockResolvedValue({ leverage: 10 });

      this.fetchTime = vi.fn().mockResolvedValue(Date.now());

      this.fetchTradingFee = vi.fn().mockResolvedValue({
        symbol: 'BTC/USD:BTC',
        maker: 0.0001,
        taker: 0.0005,
      });

      this.fetchFundingRateHistory = vi.fn().mockResolvedValue([
        {
          symbol: 'BTC/USD:BTC',
          fundingRate: 0.0001,
          timestamp: Date.now() - 8 * 3600000,
          datetime: new Date(Date.now() - 8 * 3600000).toISOString(),
        },
        {
          symbol: 'BTC/USD:BTC',
          fundingRate: 0.00008,
          timestamp: Date.now() - 16 * 3600000,
          datetime: new Date(Date.now() - 16 * 3600000).toISOString(),
        },
      ]);

      this.fetchOrderBook = vi.fn().mockResolvedValue({
        symbol: 'BTC/USD:BTC',
        bids: [[49990, 100], [49980, 200], [49970, 300]],
        asks: [[50010, 100], [50020, 200], [50030, 300]],
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 12345,
      });

      this.fetchTrades = vi.fn().mockResolvedValue([
        {
          id: 'trade_1',
          symbol: 'BTC/USD:BTC',
          side: 'buy',
          price: 50000,
          amount: 10,
          cost: 500000,
          timestamp: Date.now(),
          datetime: new Date().toISOString(),
        },
      ]);

      this.fetchMyTrades = vi.fn().mockResolvedValue([
        {
          id: 'mytrade_1',
          order: 'order_123',
          symbol: 'BTC/USD:BTC',
          side: 'buy',
          price: 49500,
          amount: 100,
          cost: 4950000,
          fee: { cost: 0.0001, currency: 'BTC' },
          timestamp: Date.now() - 3600000,
          datetime: new Date(Date.now() - 3600000).toISOString(),
        },
      ]);

      this.privateGetGetAccountSummary = vi.fn().mockResolvedValue({
        result: {
          currency: 'BTC',
          equity: 2.0,
          balance: 1.8,
          available_withdrawal_funds: 1.5,
          margin_balance: 2.0,
          initial_margin: 0.3,
          maintenance_margin: 0.15,
          total_pl: 0.2,
          session_rpl: 0.05,
          delta_total: 1.5,
          options_gamma_map: {},
          options_vega: 0.001,
          options_theta: -0.002,
        },
      });

      this.publicGetGetIndexPrice = vi.fn().mockResolvedValue({
        result: {
          index_price: 50000,
          estimated_delivery_price: 50100,
        },
      });

      this.publicGetGetInstruments = vi.fn().mockResolvedValue({
        result: [
          {
            instrument_name: 'BTC-PERPETUAL',
            base_currency: 'BTC',
            quote_currency: 'USD',
            kind: 'future',
            is_active: true,
            contract_size: 10,
            tick_size: 0.5,
            min_trade_amount: 10,
            expiration_timestamp: null,
            strike: null,
            option_type: null,
            settlement_period: 'perpetual',
          },
          {
            instrument_name: 'BTC-27DEC24',
            base_currency: 'BTC',
            quote_currency: 'USD',
            kind: 'future',
            is_active: true,
            contract_size: 10,
            tick_size: 0.5,
            min_trade_amount: 10,
            expiration_timestamp: 1735257600000,
            strike: null,
            option_type: null,
            settlement_period: 'month',
          },
        ],
      });

      this.publicGetGetHistoricalVolatility = vi.fn().mockResolvedValue({
        result: [
          [1703030400000, 45.5],
          [1703116800000, 46.2],
          [1703203200000, 44.8],
        ],
      });

      this.priceToPrecision = vi.fn().mockImplementation((symbol, price) => parseFloat(price.toFixed(1)));
      this.amountToPrecision = vi.fn().mockImplementation((symbol, amount) => parseFloat(amount.toFixed(0)));
    }
  }

  return {
    default: {
      deribit: MockDeribit,
    },
    deribit: MockDeribit,
  };
});

import { DeribitExchange } from '../../src/exchange/DeribitExchange.js';

describe('DeribitExchange', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    sandbox: true,
    defaultType: 'swap',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new DeribitExchange(defaultConfig);
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
      expect(exchange.name).toBe('deribit');
    });

    it('应该正确存储配置', () => {
      expect(exchange.config.apiKey).toBe('test_api_key');
      expect(exchange.config.sandbox).toBe(true);
    });

    it('应该默认使用 swap 交易类型', () => {
      const ex = new DeribitExchange({ apiKey: 'key', secret: 'secret' });
      expect(ex.config.defaultType).toBe('swap');
    });

    it('应该成功连接', async () => {
      const newExchange = new DeribitExchange(defaultConfig);
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
      expect(balance.free).toBeDefined();
      expect(balance.free.BTC).toBe(1.5);
    });

    it('应该获取持仓信息', async () => {
      const positions = await exchange.fetchPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);
      expect(positions[0].symbol).toBe('BTC/USD:BTC');
      expect(positions[0].side).toBe('long');
      expect(positions[0].exchange).toBe('deribit');
    });

    it('应该获取账户摘要', async () => {
      const summary = await exchange.fetchAccountSummary('BTC');
      expect(summary).toBeDefined();
      expect(summary.currency).toBe('BTC');
      expect(summary.equity).toBe(2.0);
      expect(summary.balance).toBe(1.8);
      expect(summary.availableBalance).toBe(1.5);
      expect(summary.unrealizedPnl).toBe(0.2);
      expect(summary.exchange).toBe('deribit');
    });
  });

  describe('行情方法', () => {
    it('应该获取行情数据', async () => {
      const ticker = await exchange.fetchTicker('BTC/USD:BTC');
      expect(ticker).toBeDefined();
      expect(ticker.symbol).toBe('BTC/USD:BTC');
      expect(ticker.last).toBe(50000);
    });

    it('应该获取资金费率', async () => {
      const fundingRate = await exchange.fetchFundingRate('BTC/USD:BTC');
      expect(fundingRate).toBeDefined();
      expect(fundingRate.fundingRate).toBe(0.0001);
    });

    it('应该获取订单簿', async () => {
      const orderBook = await exchange.fetchOrderBook('BTC/USD:BTC', 20);
      expect(orderBook).toBeDefined();
      expect(orderBook.symbol).toBe('BTC/USD:BTC');
      expect(orderBook.bids.length).toBeGreaterThan(0);
      expect(orderBook.asks.length).toBeGreaterThan(0);
      expect(orderBook.exchange).toBe('deribit');
    });

    it('应该获取最近交易历史', async () => {
      const trades = await exchange.fetchRecentTrades('BTC/USD:BTC', 100);
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].exchange).toBe('deribit');
    });
  });

  describe('Deribit 特有方法', () => {
    it('应该获取服务器时间', async () => {
      const serverTime = await exchange.fetchServerTime();
      expect(serverTime).toBeDefined();
      expect(typeof serverTime).toBe('number');
    });

    it('应该获取交易手续费', async () => {
      const fee = await exchange.fetchTradingFee('BTC/USD:BTC');
      expect(fee).toBeDefined();
      expect(fee.symbol).toBe('BTC/USD:BTC');
      expect(fee.maker).toBe(0.0001);
      expect(fee.taker).toBe(0.0005);
      expect(fee.exchange).toBe('deribit');
    });

    it('应该获取历史资金费率', async () => {
      const history = await exchange.fetchFundingRateHistory('BTC/USD:BTC', undefined, 10);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].symbol).toBe('BTC/USD:BTC');
      expect(history[0].exchange).toBe('deribit');
    });

    it('非永续合约应该拒绝获取历史资金费率', async () => {
      const futureExchange = new DeribitExchange({
        ...defaultConfig,
        defaultType: 'future',
      });
      await futureExchange.connect();

      await expect(futureExchange.fetchFundingRateHistory('BTC/USD:BTC'))
        .rejects.toThrow();

      await futureExchange.disconnect();
    });

    it('应该获取指数价格', async () => {
      const indexPrice = await exchange.fetchIndexPrice('BTC');
      expect(indexPrice).toBeDefined();
      expect(indexPrice.asset).toBe('BTC');
      expect(indexPrice.indexPrice).toBe(50000);
      expect(indexPrice.estimatedDeliveryPrice).toBe(50100);
      expect(indexPrice.exchange).toBe('deribit');
    });

    it('应该获取合约列表', async () => {
      const instruments = await exchange.fetchInstruments('BTC', 'future');
      expect(Array.isArray(instruments)).toBe(true);
      expect(instruments.length).toBeGreaterThan(0);
      expect(instruments[0].baseCurrency).toBe('BTC');
      expect(instruments[0].exchange).toBe('deribit');
    });

    it('应该获取历史波动率', async () => {
      const volatility = await exchange.fetchHistoricalVolatility('BTC');
      expect(volatility).toBeDefined();
      expect(volatility.currency).toBe('BTC');
      expect(Array.isArray(volatility.volatility)).toBe(true);
      expect(volatility.exchange).toBe('deribit');
    });
  });

  describe('杠杆设置', () => {
    it('应该设置杠杆倍数', async () => {
      const result = await exchange.setLeverage(10, 'BTC/USD:BTC');
      expect(result).toBeDefined();
    });

    it('应该拒绝无效的杠杆倍数 (小于 1)', async () => {
      await expect(exchange.setLeverage(0, 'BTC/USD:BTC'))
        .rejects.toThrow();
    });

    it('应该拒绝无效的杠杆倍数 (大于 100)', async () => {
      await expect(exchange.setLeverage(101, 'BTC/USD:BTC'))
        .rejects.toThrow();
    });

    it('应该发出杠杆设置事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('leverageSet', eventSpy);

      await exchange.setLeverage(10, 'BTC/USD:BTC');

      expect(eventSpy).toHaveBeenCalledWith({
        symbol: 'BTC/USD:BTC',
        leverage: 10,
        exchange: 'deribit',
      });
    });
  });

  describe('订单操作', () => {
    it('应该创建限价订单', async () => {
      const order = await exchange.createOrder(
        'BTC/USD:BTC',
        'buy',
        'limit',
        100,
        49000
      );
      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      expect(order.symbol).toBe('BTC/USD:BTC');
      expect(order.side).toBe('buy');
    });

    it('应该创建市价订单', async () => {
      const order = await exchange.createOrder(
        'BTC/USD:BTC',
        'sell',
        'market',
        100
      );
      expect(order).toBeDefined();
      expect(order.type).toBe('market');
    });

    it('应该取消订单', async () => {
      const result = await exchange.cancelOrder('order_deribit_123', 'BTC/USD:BTC');
      expect(result).toBeDefined();
      expect(result.status).toBe('canceled');
    });

    it('应该查询订单状态', async () => {
      const order = await exchange.fetchOrder('order_deribit_123', 'BTC/USD:BTC');
      expect(order).toBeDefined();
      expect(order.status).toBe('closed');
    });

    it('应该获取未完成订单列表', async () => {
      const orders = await exchange.fetchOpenOrders('BTC/USD:BTC');
      expect(Array.isArray(orders)).toBe(true);
    });
  });

  describe('交易历史', () => {
    it('应该获取我的交易历史', async () => {
      const trades = await exchange.fetchMyTrades('BTC/USD:BTC');
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].symbol).toBe('BTC/USD:BTC');
      expect(trades[0].exchange).toBe('deribit');
    });

    it('应该获取订单历史', async () => {
      const orders = await exchange.fetchOrderHistory('BTC/USD:BTC', 50);
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
    });

    it('应该获取所有交易对的订单历史', async () => {
      const orders = await exchange.fetchOrderHistory(undefined, 50);
      expect(Array.isArray(orders)).toBe(true);
    });
  });

  describe('事件发射', () => {
    it('应该在订单创建时发出事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCreated', eventSpy);

      await exchange.createOrder('BTC/USD:BTC', 'buy', 'limit', 100, 49000);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该在订单取消时发出事件', async () => {
      const eventSpy = vi.fn();
      exchange.on('orderCanceled', eventSpy);

      await exchange.cancelOrder('order_deribit_123', 'BTC/USD:BTC');

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该处理未连接错误', async () => {
      const newExchange = new DeribitExchange(defaultConfig);
      // 不连接直接调用
      await expect(newExchange.fetchBalance())
        .rejects.toThrow();
    });

    it('应该处理无效交易对', async () => {
      await expect(exchange.fetchTicker('INVALID/PAIR'))
        .rejects.toThrow();
    });
  });

  describe('持仓数据格式化', () => {
    it('应该正确格式化持仓数据', async () => {
      const positions = await exchange.fetchPositions();
      const pos = positions[0];

      expect(pos.symbol).toBe('BTC/USD:BTC');
      expect(pos.side).toBe('long');
      expect(pos.contracts).toBe(1000);
      expect(pos.entryPrice).toBe(49000);
      expect(pos.markPrice).toBe(50000);
      expect(pos.marginMode).toBe('cross');
      expect(pos.instrumentType).toBe('future');
      expect(pos.exchange).toBe('deribit');
      expect(pos.raw).toBeDefined();
    });
  });
});

describe('DeribitExchange 错误场景', () => {
  it('应该处理API密钥缺失', () => {
    expect(() => {
      new DeribitExchange({ apiKey: '', secret: '' });
    }).not.toThrow(); // 构造不应该抛错，连接时才检查
  });

  it('应该处理不同的默认交易类型', () => {
    const futureExchange = new DeribitExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'future',
    });
    expect(futureExchange.config.defaultType).toBe('future');

    const optionExchange = new DeribitExchange({
      apiKey: 'key',
      secret: 'secret',
      defaultType: 'option',
    });
    expect(optionExchange.config.defaultType).toBe('option');
  });
});

describe('DeribitExchange 期权功能', () => {
  let exchange;
  const defaultConfig = {
    apiKey: 'test_api_key',
    secret: 'test_secret',
    sandbox: true,
    defaultType: 'option',
    timeout: 30000,
    enableRateLimit: true,
  };

  beforeEach(async () => {
    exchange = new DeribitExchange(defaultConfig);
    await exchange.connect();
  });

  afterEach(async () => {
    if (exchange) {
      await exchange.disconnect();
    }
    vi.clearAllMocks();
  });

  it('应该获取期权链数据', async () => {
    const optionChain = await exchange.fetchOptionChain('BTC');
    expect(Array.isArray(optionChain)).toBe(true);
  });

  it('应该获取 ETH 期权链数据', async () => {
    const optionChain = await exchange.fetchOptionChain('ETH');
    expect(Array.isArray(optionChain)).toBe(true);
  });

  it('应该获取期权类型的合约列表', async () => {
    const instruments = await exchange.fetchInstruments('BTC', 'option');
    expect(Array.isArray(instruments)).toBe(true);
  });
});
