/**
 * 交易所 Mock 工厂
 * 用于测试时模拟交易所行为
 */

import { vi } from 'vitest';

/**
 * 创建基础交易所 Mock
 * @param {Object} overrides - 覆盖默认值
 * @returns {Object} Mock 交易所实例
 */
export function createExchangeMock(overrides = {}) {
  const defaultBalance = {
    USDT: { free: 10000, used: 0, total: 10000 },
    BTC: { free: 1, used: 0, total: 1 },
    ETH: { free: 10, used: 0, total: 10 },
  };

  const defaultTicker = {
    symbol: 'BTC/USDT',
    last: 50000,
    bid: 49990,
    ask: 50010,
    high: 51000,
    low: 49000,
    volume: 10000,
    timestamp: Date.now(),
  };

  const defaultOrderBook = {
    bids: [
      [49990, 10],
      [49980, 20],
      [49970, 30],
      [49960, 40],
      [49950, 50],
    ],
    asks: [
      [50010, 10],
      [50020, 20],
      [50030, 30],
      [50040, 40],
      [50050, 50],
    ],
    timestamp: Date.now(),
  };

  let orderIdCounter = 1000;

  const mock = {
    id: 'binance',
    name: 'Binance',
    connected: true,

    // 市场信息
    markets: {
      'BTC/USDT': {
        id: 'BTCUSDT',
        symbol: 'BTC/USDT',
        base: 'BTC',
        quote: 'USDT',
        precision: { amount: 6, price: 2 },
        limits: {
          amount: { min: 0.0001, max: 1000 },
          price: { min: 0.01, max: 1000000 },
          cost: { min: 10 },
        },
        active: true,
      },
      'ETH/USDT': {
        id: 'ETHUSDT',
        symbol: 'ETH/USDT',
        base: 'ETH',
        quote: 'USDT',
        precision: { amount: 5, price: 2 },
        limits: {
          amount: { min: 0.001, max: 10000 },
          price: { min: 0.01, max: 100000 },
          cost: { min: 10 },
        },
        active: true,
      },
    },

    // 连接方法
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(true),
    loadMarkets: vi.fn().mockResolvedValue({}),

    // 账户方法
    fetchBalance: vi.fn().mockResolvedValue(defaultBalance),
    fetchPositions: vi.fn().mockResolvedValue([]),

    // 行情方法
    fetchTicker: vi.fn().mockImplementation((symbol) => {
      return Promise.resolve({
        ...defaultTicker,
        symbol,
      });
    }),

    fetchOrderBook: vi.fn().mockImplementation((symbol) => {
      return Promise.resolve({
        ...defaultOrderBook,
        symbol,
      });
    }),

    fetchTrades: vi.fn().mockResolvedValue([
      { id: '1', price: 50000, amount: 0.1, side: 'buy', timestamp: Date.now() },
      { id: '2', price: 49990, amount: 0.2, side: 'sell', timestamp: Date.now() },
    ]),

    fetchOHLCV: vi.fn().mockResolvedValue([
      [Date.now() - 3600000, 49000, 50000, 48500, 49500, 1000],
      [Date.now() - 7200000, 48500, 49500, 48000, 49000, 800],
    ]),

    // 交易方法
    createOrder: vi.fn().mockImplementation((symbol, type, side, amount, price) => {
      const orderId = `order_${++orderIdCounter}`;
      return Promise.resolve({
        id: orderId,
        clientOrderId: `client_${orderId}`,
        symbol,
        type,
        side,
        amount,
        price: price || 50000,
        cost: amount * (price || 50000),
        status: 'open',
        filled: 0,
        remaining: amount,
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        fee: { cost: amount * (price || 50000) * 0.001, currency: 'USDT' },
      });
    }),

    cancelOrder: vi.fn().mockImplementation((orderId, symbol) => {
      return Promise.resolve({
        id: orderId,
        symbol,
        status: 'canceled',
        timestamp: Date.now(),
      });
    }),

    fetchOrder: vi.fn().mockImplementation((orderId, symbol) => {
      return Promise.resolve({
        id: orderId,
        symbol,
        status: 'closed',
        filled: 0.1,
        remaining: 0,
        timestamp: Date.now(),
      });
    }),

    fetchOpenOrders: vi.fn().mockResolvedValue([]),
    fetchClosedOrders: vi.fn().mockResolvedValue([]),

    // 合约方法
    setLeverage: vi.fn().mockResolvedValue({ leverage: 3 }),
    fetchFundingRate: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      fundingRate: 0.0001,
      nextFundingTime: Date.now() + 8 * 3600000,
    }),

    // 工具方法
    getPrecision: vi.fn().mockImplementation((symbol) => {
      const market = mock.markets[symbol];
      return market ? market.precision : { amount: 8, price: 8 };
    }),

    priceToPrecision: vi.fn().mockImplementation((symbol, price) => {
      return parseFloat(price.toFixed(2));
    }),

    amountToPrecision: vi.fn().mockImplementation((symbol, amount) => {
      return parseFloat(amount.toFixed(6));
    }),

    // 覆盖默认值
    ...overrides,
  };

  return mock;
}

/**
 * 创建会失败的交易所 Mock
 * @param {string} errorType - 错误类型
 * @param {number} failCount - 失败次数后成功
 * @returns {Object} Mock 交易所实例
 */
export function createFailingExchangeMock(errorType = 'network', failCount = Infinity) {
  let attempts = 0;

  const errors = {
    network: () => {
      const e = new Error('Network timeout');
      e.code = 'ETIMEDOUT';
      return e;
    },
    rateLimit: () => {
      const e = new Error('Rate limit exceeded');
      e.name = 'RateLimitExceeded';
      e.code = 429;
      return e;
    },
    nonce: () => {
      const e = new Error('Timestamp for this request is outside of the recvWindow');
      e.code = -1021;
      return e;
    },
    insufficient: () => {
      const e = new Error('Insufficient balance');
      e.code = -2010;
      return e;
    },
    invalidOrder: () => {
      const e = new Error('Invalid order');
      e.code = -1102;
      return e;
    },
    unknown: () => {
      return new Error('Unknown error');
    },
  };

  const createError = errors[errorType] || errors.unknown;

  const baseMock = createExchangeMock();

  return {
    ...baseMock,

    createOrder: vi.fn().mockImplementation(async (symbol, type, side, amount, price) => {
      attempts++;
      if (attempts <= failCount) {
        throw createError();
      }
      return baseMock.createOrder(symbol, type, side, amount, price);
    }),

    fetchOrder: vi.fn().mockImplementation(async (orderId, symbol) => {
      attempts++;
      if (attempts <= failCount) {
        throw createError();
      }
      return baseMock.fetchOrder(orderId, symbol);
    }),

    cancelOrder: vi.fn().mockImplementation(async (orderId, symbol) => {
      attempts++;
      if (attempts <= failCount) {
        throw createError();
      }
      return baseMock.cancelOrder(orderId, symbol);
    }),

    // 重置尝试计数
    resetAttempts: () => {
      attempts = 0;
    },

    getAttempts: () => attempts,
  };
}

/**
 * 创建延迟响应的交易所 Mock
 * @param {number} delay - 延迟毫秒数
 * @returns {Object} Mock 交易所实例
 */
export function createSlowExchangeMock(delay = 1000) {
  const baseMock = createExchangeMock();

  const wrapWithDelay = (fn) => {
    return async (...args) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fn(...args);
    };
  };

  return {
    ...baseMock,
    createOrder: vi.fn().mockImplementation(wrapWithDelay(baseMock.createOrder)),
    fetchOrder: vi.fn().mockImplementation(wrapWithDelay(baseMock.fetchOrder)),
    cancelOrder: vi.fn().mockImplementation(wrapWithDelay(baseMock.cancelOrder)),
    fetchBalance: vi.fn().mockImplementation(wrapWithDelay(baseMock.fetchBalance)),
    fetchTicker: vi.fn().mockImplementation(wrapWithDelay(baseMock.fetchTicker)),
  };
}

/**
 * 创建订单状态变化的交易所 Mock
 * 模拟订单从 open -> partially_filled -> closed 的过程
 * @param {Object} options - 选项
 * @returns {Object} Mock 交易所实例
 */
export function createOrderProgressMock(options = {}) {
  const {
    fillDelay = 500,      // 填充延迟
    partialFill = false,  // 是否部分成交
    partialRatio = 0.5,   // 部分成交比例
  } = options;

  const baseMock = createExchangeMock();
  const orders = new Map();

  return {
    ...baseMock,

    createOrder: vi.fn().mockImplementation(async (symbol, type, side, amount, price) => {
      const order = {
        id: `order_${Date.now()}`,
        symbol,
        type,
        side,
        amount,
        price: price || 50000,
        status: 'open',
        filled: 0,
        remaining: amount,
        timestamp: Date.now(),
        createdAt: Date.now(),
      };

      orders.set(order.id, order);

      // 模拟异步成交
      setTimeout(() => {
        const o = orders.get(order.id);
        if (o && o.status === 'open') {
          if (partialFill) {
            o.status = 'open';
            o.filled = o.amount * partialRatio;
            o.remaining = o.amount - o.filled;
          } else {
            o.status = 'closed';
            o.filled = o.amount;
            o.remaining = 0;
          }
        }
      }, fillDelay);

      return order;
    }),

    fetchOrder: vi.fn().mockImplementation(async (orderId) => {
      const order = orders.get(orderId);
      if (!order) {
        throw new Error('Order not found');
      }
      return { ...order };
    }),

    cancelOrder: vi.fn().mockImplementation(async (orderId) => {
      const order = orders.get(orderId);
      if (!order) {
        throw new Error('Order not found');
      }
      if (order.status === 'closed') {
        throw new Error('Order already filled');
      }
      order.status = 'canceled';
      return { ...order };
    }),

    // 获取所有订单
    getOrders: () => new Map(orders),

    // 清除订单
    clearOrders: () => orders.clear(),
  };
}

export default {
  createExchangeMock,
  createFailingExchangeMock,
  createSlowExchangeMock,
  createOrderProgressMock,
};
