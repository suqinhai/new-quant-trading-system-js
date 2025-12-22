/**
 * E2E 测试框架
 * End-to-End Test Framework
 *
 * TEST-010: E2E 测试框架搭建
 * 提供完整的端到端测试基础设施
 * @module tests/e2e/e2eTestFramework
 */

import { vi } from 'vitest';
import EventEmitter from 'events';
import { createExchangeMock, createFailingExchangeMock, createSlowExchangeMock } from '../mocks/exchangeMock.js';

// ============================================
// 系统状态常量
// ============================================

export const SYSTEM_STATUS = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error',
};

export const RUN_MODE = {
  BACKTEST: 'backtest',
  SHADOW: 'shadow',
  LIVE: 'live',
};

// ============================================
// 模拟行情数据生成器
// ============================================

export class MarketDataGenerator {
  constructor(config = {}) {
    this.config = {
      basePrice: config.basePrice || 50000,
      volatility: config.volatility || 0.02,
      tickInterval: config.tickInterval || 100,
      ...config,
    };
    this.currentPrice = this.config.basePrice;
    this.isRunning = false;
    this.listeners = new Set();
  }

  generateTicker(symbol = 'BTC/USDT') {
    // 随机价格波动
    const change = (Math.random() - 0.5) * 2 * this.config.volatility * this.currentPrice;
    this.currentPrice += change;

    return {
      symbol,
      last: this.currentPrice,
      bid: this.currentPrice * 0.9998,
      ask: this.currentPrice * 1.0002,
      high: this.currentPrice * 1.01,
      low: this.currentPrice * 0.99,
      volume: Math.random() * 1000,
      timestamp: Date.now(),
    };
  }

  generateOrderBook(symbol = 'BTC/USDT', depth = 5) {
    const bids = [];
    const asks = [];

    for (let i = 0; i < depth; i++) {
      bids.push([
        this.currentPrice * (1 - 0.0001 * (i + 1)),
        Math.random() * 10,
      ]);
      asks.push([
        this.currentPrice * (1 + 0.0001 * (i + 1)),
        Math.random() * 10,
      ]);
    }

    return { symbol, bids, asks, timestamp: Date.now() };
  }

  generateCandle(symbol = 'BTC/USDT', timeframe = '1m') {
    const open = this.currentPrice;
    const high = open * (1 + Math.random() * 0.01);
    const low = open * (1 - Math.random() * 0.01);
    const close = low + Math.random() * (high - low);

    return {
      symbol,
      timeframe,
      timestamp: Date.now(),
      open,
      high,
      low,
      close,
      volume: Math.random() * 100,
    };
  }

  onTick(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
  }

  stop() {
    this.isRunning = false;
  }

  reset() {
    this.currentPrice = this.config.basePrice;
  }
}

// ============================================
// 模拟策略
// ============================================

export class MockStrategy extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      name: config.name || 'MockStrategy',
      symbols: config.symbols || ['BTC/USDT'],
      signalInterval: config.signalInterval || 1000,
      ...config,
    };

    this.state = {
      isRunning: false,
      signalCount: 0,
      position: null,
    };

    this.signalTimer = null;
  }

  async initialize() {
    this.emit('initialized');
    return true;
  }

  async start() {
    this.state.isRunning = true;
    this.emit('started');
  }

  async stop() {
    this.state.isRunning = false;
    if (this.signalTimer) {
      clearInterval(this.signalTimer);
      this.signalTimer = null;
    }
    this.emit('stopped');
  }

  generateSignal(type = 'buy') {
    if (!this.state.isRunning) return null;

    const signal = {
      id: `sig_${Date.now()}_${++this.state.signalCount}`,
      strategy: this.config.name,
      symbol: this.config.symbols[0],
      side: type,
      amount: 0.01,
      price: 50000,
      orderType: 'market',
      timestamp: Date.now(),
    };

    this.emit('signal', signal);
    return signal;
  }

  onTicker(ticker) {
    // 简单策略逻辑：价格变化超过阈值时发出信号
    if (this.config.autoSignal && this.state.isRunning) {
      if (Math.random() > 0.8) {
        this.generateSignal(Math.random() > 0.5 ? 'buy' : 'sell');
      }
    }
  }

  onCandle(candle) {
    // K线处理逻辑
  }

  getStatus() {
    return {
      name: this.config.name,
      isRunning: this.state.isRunning,
      signalCount: this.state.signalCount,
      position: this.state.position,
    };
  }
}

// ============================================
// 模拟风控管理器
// ============================================

export class MockRiskManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      maxPositionRatio: config.maxPositionRatio || 0.3,
      maxDailyLoss: config.maxDailyLoss || 0.05,
      maxDrawdown: config.maxDrawdown || 0.10,
      maxLeverage: config.maxLeverage || 3,
      ...config,
    };

    this.state = {
      isRunning: false,
      tradingAllowed: true,
      dailyPnL: 0,
      totalPnL: 0,
      equity: config.initialEquity || 10000,
      maxEquity: config.initialEquity || 10000,
      positions: new Map(),
      alertCount: 0,
    };
  }

  start() {
    this.state.isRunning = true;
    this.emit('started');
  }

  stop() {
    this.state.isRunning = false;
    this.emit('stopped');
  }

  checkOrder(order) {
    // 检查交易是否允许
    if (!this.state.tradingAllowed) {
      return { allowed: false, reason: '交易已被禁止' };
    }

    // 检查仓位大小
    const orderValue = order.amount * order.price;
    const positionRatio = orderValue / this.state.equity;
    if (positionRatio > this.config.maxPositionRatio) {
      return { allowed: false, reason: `仓位比例超过 ${this.config.maxPositionRatio * 100}%` };
    }

    // 检查杠杆
    if (order.leverage && order.leverage > this.config.maxLeverage) {
      return { allowed: false, reason: `杠杆超过 ${this.config.maxLeverage}x` };
    }

    // 检查日亏损
    const dailyLossRatio = Math.abs(this.state.dailyPnL) / this.state.equity;
    if (this.state.dailyPnL < 0 && dailyLossRatio >= this.config.maxDailyLoss) {
      return { allowed: false, reason: '日亏损超过限制' };
    }

    return { allowed: true };
  }

  recordTrade(trade) {
    const pnl = trade.pnl || 0;
    this.state.dailyPnL += pnl;
    this.state.totalPnL += pnl;
    this.state.equity += pnl;

    if (this.state.equity > this.state.maxEquity) {
      this.state.maxEquity = this.state.equity;
    }

    // 检查是否需要触发风控
    this._checkRiskLevels();
  }

  _checkRiskLevels() {
    const dailyLossRatio = Math.abs(this.state.dailyPnL) / this.state.equity;
    const drawdown = (this.state.maxEquity - this.state.equity) / this.state.maxEquity;

    if (this.state.dailyPnL < 0 && dailyLossRatio >= this.config.maxDailyLoss) {
      this._triggerAlert('critical', '日亏损达到限制');
      this.pauseTrading('日亏损限制');
    }

    if (drawdown >= this.config.maxDrawdown) {
      this._triggerAlert('critical', '回撤达到限制');
      this.pauseTrading('最大回撤限制');
    }
  }

  _triggerAlert(level, message) {
    this.state.alertCount++;
    this.emit('alert', { level, message, timestamp: Date.now() });
  }

  pauseTrading(reason) {
    this.state.tradingAllowed = false;
    this.emit('tradingPaused', { reason, timestamp: Date.now() });
  }

  resumeTrading() {
    this.state.tradingAllowed = true;
    this.emit('tradingResumed', { timestamp: Date.now() });
  }

  emergencyClose(reason) {
    this.pauseTrading(`紧急平仓: ${reason}`);
    this.emit('emergencyClose', { reason, timestamp: Date.now() });
  }

  resetDaily() {
    this.state.dailyPnL = 0;
    this.state.tradingAllowed = true;
  }

  getStatus() {
    return { ...this.state };
  }
}

// ============================================
// 模拟订单执行器
// ============================================

export class MockOrderExecutor extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      dryRun: config.dryRun || false,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      ...config,
    };

    this.exchanges = config.exchanges || new Map();
    this.orders = new Map();
    this.stats = {
      totalOrders: 0,
      successfulOrders: 0,
      failedOrders: 0,
      totalVolume: 0,
    };
  }

  addExchange(id, exchange) {
    this.exchanges.set(id, exchange);
  }

  async executeOrder(params) {
    this.stats.totalOrders++;

    const {
      exchangeId,
      symbol,
      side,
      amount,
      price,
      type = 'market',
    } = params;

    const exchange = this.exchanges.get(exchangeId);
    if (!exchange) {
      this.stats.failedOrders++;
      return { success: false, error: `Exchange ${exchangeId} not found` };
    }

    // 干跑模式
    if (this.config.dryRun) {
      const mockOrder = {
        id: `dry_${Date.now()}`,
        symbol,
        side,
        amount,
        price,
        type,
        status: 'filled',
        timestamp: Date.now(),
      };
      this.orders.set(mockOrder.id, mockOrder);
      this.stats.successfulOrders++;
      this.stats.totalVolume += amount * price;
      this.emit('orderFilled', mockOrder);
      return { success: true, orderId: mockOrder.id, order: mockOrder };
    }

    // 实际执行
    let lastError;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const order = await exchange.createOrder(symbol, type, side, amount, price);
        this.orders.set(order.id, order);
        this.stats.successfulOrders++;
        this.stats.totalVolume += amount * (price || order.price);
        this.emit('orderFilled', order);
        return { success: true, orderId: order.id, order };
      } catch (error) {
        lastError = error;
        this.emit('orderRetry', { attempt, error: error.message });
        if (attempt < this.config.maxRetries) {
          await new Promise(r => setTimeout(r, this.config.retryDelay));
        }
      }
    }

    this.stats.failedOrders++;
    this.emit('orderFailed', { error: lastError.message, params });
    return { success: false, error: lastError.message };
  }

  async cancelOrder(exchangeId, orderId) {
    const exchange = this.exchanges.get(exchangeId);
    if (!exchange) {
      return { success: false, error: `Exchange ${exchangeId} not found` };
    }

    try {
      await exchange.cancelOrder(orderId);
      const order = this.orders.get(orderId);
      if (order) {
        order.status = 'canceled';
      }
      this.emit('orderCanceled', { orderId });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async cancelAllPendingOrders(exchangeId) {
    const canceled = [];
    for (const [orderId, order] of this.orders) {
      if (order.status === 'open') {
        const result = await this.cancelOrder(exchangeId, orderId);
        if (result.success) {
          canceled.push(orderId);
        }
      }
    }
    return { canceled, count: canceled.length };
  }

  async emergencyCloseAll(exchangeId) {
    this.emit('emergencyCloseStarted', { exchangeId });
    // 模拟平仓逻辑
    const closedCount = this.orders.size;
    this.orders.clear();
    this.emit('emergencyCloseCompleted', { closedCount });
    return { closedCount };
  }

  getStats() {
    return { ...this.stats };
  }

  getOrders() {
    return new Map(this.orders);
  }
}

// ============================================
// 模拟行情引擎
// ============================================

export class MockMarketDataEngine extends EventEmitter {
  constructor(exchange, config = {}) {
    super();
    this.exchange = exchange;
    this.config = config;
    this.subscriptions = new Map();
    this.isRunning = false;
    this.dataGenerator = new MarketDataGenerator(config);
  }

  async subscribe(symbol, channels) {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }
    for (const channel of channels) {
      this.subscriptions.get(symbol).add(channel);
    }
  }

  async unsubscribe(symbol, channels) {
    const sub = this.subscriptions.get(symbol);
    if (sub) {
      for (const channel of channels) {
        sub.delete(channel);
      }
    }
  }

  start() {
    this.isRunning = true;
    this.dataGenerator.start();
    this.emit('started');
  }

  stop() {
    this.isRunning = false;
    this.dataGenerator.stop();
    this.emit('stopped');
  }

  // 手动触发行情更新
  emitTicker(symbol) {
    const ticker = this.dataGenerator.generateTicker(symbol);
    this.emit('ticker', ticker);
    return ticker;
  }

  emitOrderBook(symbol) {
    const orderBook = this.dataGenerator.generateOrderBook(symbol);
    this.emit('orderbook', orderBook);
    return orderBook;
  }

  emitCandle(symbol) {
    const candle = this.dataGenerator.generateCandle(symbol);
    this.emit('candle', candle);
    return candle;
  }
}

// ============================================
// E2E 测试环境
// ============================================

export class E2ETestEnvironment {
  constructor(config = {}) {
    this.config = {
      mode: config.mode || RUN_MODE.SHADOW,
      initialEquity: config.initialEquity || 10000,
      symbols: config.symbols || ['BTC/USDT'],
      exchanges: config.exchanges || ['binance'],
      ...config,
    };

    this.status = SYSTEM_STATUS.STOPPED;
    this.components = {};
    this.events = [];
    this.errors = [];
  }

  async setup() {
    this.status = SYSTEM_STATUS.STARTING;

    // 创建交易所 mock
    this.components.exchanges = new Map();
    for (const exchangeId of this.config.exchanges) {
      const exchange = createExchangeMock({ id: exchangeId, name: exchangeId });
      this.components.exchanges.set(exchangeId, exchange);
    }

    // 创建行情引擎
    const primaryExchange = this.components.exchanges.get(this.config.exchanges[0]);
    this.components.marketDataEngine = new MockMarketDataEngine(primaryExchange, {
      basePrice: this.config.basePrice || 50000,
    });

    // 创建风控管理器
    this.components.riskManager = new MockRiskManager({
      initialEquity: this.config.initialEquity,
      ...this.config.riskConfig,
    });

    // 创建订单执行器
    this.components.executor = new MockOrderExecutor({
      exchanges: this.components.exchanges,
      dryRun: this.config.mode === RUN_MODE.SHADOW,
      ...this.config.executorConfig,
    });

    // 创建策略
    this.components.strategies = new Map();
    if (this.config.strategies) {
      for (const strategyConfig of this.config.strategies) {
        const strategy = new MockStrategy({
          symbols: this.config.symbols,
          ...strategyConfig,
        });
        this.components.strategies.set(strategy.config.name, strategy);
      }
    } else {
      const defaultStrategy = new MockStrategy({
        name: 'DefaultStrategy',
        symbols: this.config.symbols,
      });
      this.components.strategies.set('DefaultStrategy', defaultStrategy);
    }

    // 绑定事件
    this._bindEvents();

    this.status = SYSTEM_STATUS.RUNNING;
    return this;
  }

  _bindEvents() {
    // 策略信号 -> 风控检查 -> 订单执行
    for (const [, strategy] of this.components.strategies) {
      strategy.on('signal', async (signal) => {
        this._recordEvent('signal', signal);

        const riskCheck = this.components.riskManager.checkOrder({
          symbol: signal.symbol,
          side: signal.side,
          amount: signal.amount,
          price: signal.price,
        });

        if (!riskCheck.allowed) {
          this._recordEvent('signalRejected', { signal, reason: riskCheck.reason });
          return;
        }

        const result = await this.components.executor.executeOrder({
          exchangeId: this.config.exchanges[0],
          symbol: signal.symbol,
          side: signal.side,
          amount: signal.amount,
          price: signal.price,
        });

        if (result.success) {
          this._recordEvent('orderExecuted', { signal, result });
        } else {
          this._recordEvent('orderFailed', { signal, error: result.error });
        }
      });
    }

    // 风控事件
    this.components.riskManager.on('alert', (alert) => {
      this._recordEvent('riskAlert', alert);
    });

    this.components.riskManager.on('tradingPaused', (data) => {
      this._recordEvent('tradingPaused', data);
    });

    this.components.riskManager.on('emergencyClose', (data) => {
      this._recordEvent('emergencyClose', data);
    });

    // 执行器事件
    this.components.executor.on('orderFilled', (order) => {
      this._recordEvent('orderFilled', order);
    });

    this.components.executor.on('orderFailed', (data) => {
      this._recordEvent('orderFailed', data);
      this.errors.push(data);
    });

    // 行情事件
    this.components.marketDataEngine.on('ticker', (ticker) => {
      for (const [, strategy] of this.components.strategies) {
        if (strategy.onTicker) {
          strategy.onTicker(ticker);
        }
      }
    });
  }

  _recordEvent(type, data) {
    this.events.push({
      type,
      data,
      timestamp: Date.now(),
    });
  }

  async start() {
    this.components.riskManager.start();
    this.components.marketDataEngine.start();

    for (const [, strategy] of this.components.strategies) {
      await strategy.initialize();
      await strategy.start();
    }
  }

  async stop() {
    this.status = SYSTEM_STATUS.STOPPING;

    for (const [, strategy] of this.components.strategies) {
      await strategy.stop();
    }

    this.components.marketDataEngine.stop();
    this.components.riskManager.stop();

    this.status = SYSTEM_STATUS.STOPPED;
  }

  async teardown() {
    await this.stop();
    this.components = {};
    this.events = [];
    this.errors = [];
  }

  // 辅助方法
  getExchange(id) {
    return this.components.exchanges.get(id || this.config.exchanges[0]);
  }

  getStrategy(name) {
    return this.components.strategies.get(name || 'DefaultStrategy');
  }

  getRiskManager() {
    return this.components.riskManager;
  }

  getExecutor() {
    return this.components.executor;
  }

  getMarketDataEngine() {
    return this.components.marketDataEngine;
  }

  getEvents(type = null) {
    if (type) {
      return this.events.filter(e => e.type === type);
    }
    return [...this.events];
  }

  getErrors() {
    return [...this.errors];
  }

  getStatus() {
    return {
      status: this.status,
      eventCount: this.events.length,
      errorCount: this.errors.length,
      riskStatus: this.components.riskManager?.getStatus(),
      executorStats: this.components.executor?.getStats(),
      strategies: Array.from(this.components.strategies?.values() || []).map(s => s.getStatus()),
    };
  }

  // 模拟场景
  async simulateMarketData(count = 10, interval = 100) {
    const engine = this.components.marketDataEngine;
    for (let i = 0; i < count; i++) {
      for (const symbol of this.config.symbols) {
        engine.emitTicker(symbol);
      }
      if (i < count - 1) {
        await new Promise(r => setTimeout(r, interval));
      }
    }
  }

  async simulateSignals(count = 5, interval = 100) {
    for (let i = 0; i < count; i++) {
      for (const [, strategy] of this.components.strategies) {
        strategy.generateSignal(i % 2 === 0 ? 'buy' : 'sell');
      }
      if (i < count - 1) {
        await new Promise(r => setTimeout(r, interval));
      }
    }
  }

  // 故障注入
  injectExchangeFailure(exchangeId, errorType = 'network') {
    const failingExchange = createFailingExchangeMock(errorType, Infinity);
    this.components.exchanges.set(exchangeId, failingExchange);
    this.components.executor.addExchange(exchangeId, failingExchange);
    // 禁用 dryRun 以便测试实际的故障处理
    this.components.executor.config.dryRun = false;
  }

  restoreExchange(exchangeId) {
    const normalExchange = createExchangeMock({ id: exchangeId, name: exchangeId });
    this.components.exchanges.set(exchangeId, normalExchange);
    this.components.executor.addExchange(exchangeId, normalExchange);
  }

  injectSlowExchange(exchangeId, delay = 2000) {
    const slowExchange = createSlowExchangeMock(delay);
    slowExchange.id = exchangeId;
    this.components.exchanges.set(exchangeId, slowExchange);
    this.components.executor.addExchange(exchangeId, slowExchange);
  }
}

// ============================================
// 测试工具函数
// ============================================

export const testUtils = {
  /**
   * 等待条件满足
   */
  async waitFor(condition, options = {}) {
    const { timeout = 5000, interval = 50 } = options;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(r => setTimeout(r, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  },

  /**
   * 等待特定事件
   */
  async waitForEvent(env, eventType, options = {}) {
    const { timeout = 5000 } = options;
    const initialCount = env.getEvents(eventType).length;

    return testUtils.waitFor(
      () => env.getEvents(eventType).length > initialCount,
      { timeout }
    );
  },

  /**
   * 等待订单完成
   */
  async waitForOrderCount(env, count, options = {}) {
    const { timeout = 5000 } = options;

    return testUtils.waitFor(
      () => env.getExecutor().getStats().totalOrders >= count,
      { timeout }
    );
  },

  /**
   * 创建延迟
   */
  delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  },

  /**
   * 断言事件序列
   */
  assertEventSequence(events, expectedTypes) {
    const actualTypes = events.map(e => e.type);
    for (let i = 0; i < expectedTypes.length; i++) {
      if (!actualTypes.includes(expectedTypes[i])) {
        return false;
      }
    }
    return true;
  },
};

// ============================================
// 导出
// ============================================

export default {
  E2ETestEnvironment,
  MockStrategy,
  MockRiskManager,
  MockOrderExecutor,
  MockMarketDataEngine,
  MarketDataGenerator,
  testUtils,
  SYSTEM_STATUS,
  RUN_MODE,
};
