/**
 * E2E 测试框架测试
 * E2E Test Framework Tests
 *
 * TEST-010: E2E 测试框架搭建
 * @module tests/e2e/framework.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  E2ETestEnvironment,
  MockStrategy,
  MockRiskManager,
  MockOrderExecutor,
  MockMarketDataEngine,
  MarketDataGenerator,
  testUtils,
  SYSTEM_STATUS,
  RUN_MODE,
} from './e2eTestFramework.js';

// ============================================
// 测试框架基础设施测试
// ============================================

describe('E2E Test Framework', () => {
  describe('MarketDataGenerator', () => {
    let generator;

    beforeEach(() => {
      generator = new MarketDataGenerator({
        basePrice: 50000,
        volatility: 0.02,
      });
    });

    it('应该生成有效的 Ticker 数据', () => {
      const ticker = generator.generateTicker('BTC/USDT');

      expect(ticker.symbol).toBe('BTC/USDT');
      expect(ticker.last).toBeGreaterThan(0);
      expect(ticker.bid).toBeLessThan(ticker.ask);
      expect(ticker.timestamp).toBeDefined();
    });

    it('应该生成有效的订单簿数据', () => {
      const orderBook = generator.generateOrderBook('BTC/USDT', 5);

      expect(orderBook.symbol).toBe('BTC/USDT');
      expect(orderBook.bids.length).toBe(5);
      expect(orderBook.asks.length).toBe(5);
      expect(orderBook.bids[0][0]).toBeLessThan(orderBook.asks[0][0]);
    });

    it('应该生成有效的 K 线数据', () => {
      const candle = generator.generateCandle('BTC/USDT', '1m');

      expect(candle.symbol).toBe('BTC/USDT');
      expect(candle.timeframe).toBe('1m');
      expect(candle.high).toBeGreaterThanOrEqual(candle.low);
      expect(candle.close).toBeGreaterThanOrEqual(candle.low);
      expect(candle.close).toBeLessThanOrEqual(candle.high);
    });

    it('应该能重置价格', () => {
      // 生成一些数据改变价格
      for (let i = 0; i < 10; i++) {
        generator.generateTicker('BTC/USDT');
      }

      const priceBeforeReset = generator.currentPrice;
      generator.reset();

      expect(generator.currentPrice).toBe(50000);
      expect(generator.currentPrice).not.toBe(priceBeforeReset);
    });
  });

  describe('MockStrategy', () => {
    let strategy;

    beforeEach(() => {
      strategy = new MockStrategy({
        name: 'TestStrategy',
        symbols: ['BTC/USDT'],
      });
    });

    afterEach(async () => {
      await strategy.stop();
    });

    it('应该正确初始化策略', async () => {
      let initialized = false;
      strategy.on('initialized', () => { initialized = true; });

      await strategy.initialize();

      expect(initialized).toBe(true);
    });

    it('应该正确启动和停止策略', async () => {
      let started = false;
      let stopped = false;

      strategy.on('started', () => { started = true; });
      strategy.on('stopped', () => { stopped = true; });

      await strategy.start();
      expect(started).toBe(true);
      expect(strategy.state.isRunning).toBe(true);

      await strategy.stop();
      expect(stopped).toBe(true);
      expect(strategy.state.isRunning).toBe(false);
    });

    it('应该生成交易信号', async () => {
      const signals = [];
      strategy.on('signal', (signal) => { signals.push(signal); });

      await strategy.start();
      strategy.generateSignal('buy');
      strategy.generateSignal('sell');

      expect(signals.length).toBe(2);
      expect(signals[0].side).toBe('buy');
      expect(signals[1].side).toBe('sell');
      expect(strategy.state.signalCount).toBe(2);
    });

    it('停止时不应生成信号', async () => {
      const signal = strategy.generateSignal('buy');
      expect(signal).toBeNull();
    });

    it('应该返回正确的状态', async () => {
      await strategy.start();
      strategy.generateSignal('buy');

      const status = strategy.getStatus();

      expect(status.name).toBe('TestStrategy');
      expect(status.isRunning).toBe(true);
      expect(status.signalCount).toBe(1);
    });
  });

  describe('MockRiskManager', () => {
    let riskManager;

    beforeEach(() => {
      riskManager = new MockRiskManager({
        initialEquity: 10000,
        maxPositionRatio: 0.3,
        maxDailyLoss: 0.05,
        maxDrawdown: 0.10,
      });
    });

    it('应该允许符合风控的订单', () => {
      const result = riskManager.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      });

      expect(result.allowed).toBe(true);
    });

    it('应该拒绝超过仓位限制的订单', () => {
      const result = riskManager.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('仓位比例');
    });

    it('应该拒绝超过杠杆限制的订单', () => {
      const result = riskManager.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
        leverage: 10,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('杠杆');
    });

    it('应该在日亏损超限时暂停交易', () => {
      let paused = false;
      riskManager.on('tradingPaused', () => { paused = true; });

      // 记录大额亏损
      riskManager.recordTrade({ pnl: -600 });

      expect(paused).toBe(true);
      expect(riskManager.state.tradingAllowed).toBe(false);
    });

    it('应该在暂停后拒绝所有订单', () => {
      riskManager.pauseTrading('测试');

      const result = riskManager.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.001,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('禁止');
    });

    it('应该能恢复交易', () => {
      riskManager.pauseTrading('测试');
      expect(riskManager.state.tradingAllowed).toBe(false);

      riskManager.resumeTrading();
      expect(riskManager.state.tradingAllowed).toBe(true);
    });

    it('应该触发紧急平仓事件', () => {
      let emergencyTriggered = false;
      riskManager.on('emergencyClose', () => { emergencyTriggered = true; });

      riskManager.emergencyClose('测试紧急平仓');

      expect(emergencyTriggered).toBe(true);
      expect(riskManager.state.tradingAllowed).toBe(false);
    });
  });

  describe('MockOrderExecutor', () => {
    let executor;
    let mockExchange;

    beforeEach(() => {
      mockExchange = {
        createOrder: async (symbol, type, side, amount, price) => ({
          id: `order_${Date.now()}`,
          symbol,
          type,
          side,
          amount,
          price,
          status: 'filled',
        }),
        cancelOrder: async (orderId) => ({ id: orderId, status: 'canceled' }),
      };

      executor = new MockOrderExecutor({
        exchanges: new Map([['binance', mockExchange]]),
        dryRun: false,
      });
    });

    it('应该执行订单成功', async () => {
      let filled = false;
      executor.on('orderFilled', () => { filled = true; });

      const result = await executor.executeOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
      expect(filled).toBe(true);
      expect(executor.getStats().successfulOrders).toBe(1);
    });

    it('应该在干跑模式下模拟订单', async () => {
      const dryExecutor = new MockOrderExecutor({
        exchanges: new Map([['binance', mockExchange]]),
        dryRun: true,
      });

      const result = await dryExecutor.executeOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(true);
      expect(result.orderId).toContain('dry_');
    });

    it('应该处理不存在的交易所', async () => {
      const result = await executor.executeOrder({
        exchangeId: 'unknown',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('应该重试失败的订单', async () => {
      let attempts = 0;
      const failingExchange = {
        createOrder: async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return { id: 'order_1', status: 'filled' };
        },
      };

      const retryExecutor = new MockOrderExecutor({
        exchanges: new Map([['binance', failingExchange]]),
        maxRetries: 3,
        retryDelay: 10,
      });

      const result = await retryExecutor.executeOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });
  });

  describe('MockMarketDataEngine', () => {
    let engine;
    let mockExchange;

    beforeEach(() => {
      mockExchange = {};
      engine = new MockMarketDataEngine(mockExchange, {
        basePrice: 50000,
      });
    });

    afterEach(() => {
      engine.stop();
    });

    it('应该订阅市场数据', async () => {
      await engine.subscribe('BTC/USDT', ['ticker', 'depth']);

      expect(engine.subscriptions.has('BTC/USDT')).toBe(true);
      expect(engine.subscriptions.get('BTC/USDT').has('ticker')).toBe(true);
      expect(engine.subscriptions.get('BTC/USDT').has('depth')).toBe(true);
    });

    it('应该发出 Ticker 事件', () => {
      let received = null;
      engine.on('ticker', (ticker) => { received = ticker; });

      engine.emitTicker('BTC/USDT');

      expect(received).not.toBeNull();
      expect(received.symbol).toBe('BTC/USDT');
    });

    it('应该发出订单簿事件', () => {
      let received = null;
      engine.on('orderbook', (ob) => { received = ob; });

      engine.emitOrderBook('BTC/USDT');

      expect(received).not.toBeNull();
      expect(received.bids.length).toBeGreaterThan(0);
    });

    it('应该发出 K 线事件', () => {
      let received = null;
      engine.on('candle', (candle) => { received = candle; });

      engine.emitCandle('BTC/USDT');

      expect(received).not.toBeNull();
      expect(received.open).toBeDefined();
      expect(received.close).toBeDefined();
    });
  });

  describe('E2ETestEnvironment', () => {
    let env;

    beforeEach(async () => {
      env = new E2ETestEnvironment({
        mode: RUN_MODE.SHADOW,
        initialEquity: 10000,
        symbols: ['BTC/USDT'],
        exchanges: ['binance'],
        executorConfig: {
          maxRetries: 3,
          retryDelay: 50,
        },
      });
      await env.setup();
    });

    afterEach(async () => {
      await env.teardown();
    });

    it('应该正确初始化所有组件', () => {
      expect(env.status).toBe(SYSTEM_STATUS.RUNNING);
      expect(env.components.exchanges.size).toBe(1);
      expect(env.components.marketDataEngine).toBeDefined();
      expect(env.components.riskManager).toBeDefined();
      expect(env.components.executor).toBeDefined();
      expect(env.components.strategies.size).toBe(1);
    });

    it('应该能启动和停止', async () => {
      await env.start();

      const strategy = env.getStrategy();
      expect(strategy.state.isRunning).toBe(true);

      await env.stop();

      expect(env.status).toBe(SYSTEM_STATUS.STOPPED);
      expect(strategy.state.isRunning).toBe(false);
    });

    it('应该记录事件', async () => {
      await env.start();

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.delay(50);

      const events = env.getEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.type === 'signal')).toBe(true);
    });

    it('应该模拟行情数据', async () => {
      await env.start();

      let tickerCount = 0;
      env.getMarketDataEngine().on('ticker', () => { tickerCount++; });

      await env.simulateMarketData(5, 10);

      expect(tickerCount).toBe(5);
    });

    it('应该模拟交易信号', async () => {
      await env.start();

      await env.simulateSignals(3, 10);

      const signalEvents = env.getEvents('signal');
      expect(signalEvents.length).toBe(3);
    });

    it('应该注入交易所故障', async () => {
      await env.start();

      env.injectExchangeFailure('binance', 'network');

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getErrors().length > 0,
        { timeout: 2000 }
      );

      const errors = env.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('应该恢复交易所', async () => {
      await env.start();

      env.injectExchangeFailure('binance', 'network');
      env.restoreExchange('binance');

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.delay(100);

      const successEvents = env.getEvents('orderExecuted');
      expect(successEvents.length).toBeGreaterThan(0);
    });

    it('应该返回正确的状态', async () => {
      await env.start();

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.delay(50);

      const status = env.getStatus();

      expect(status.status).toBe(SYSTEM_STATUS.RUNNING);
      expect(status.eventCount).toBeGreaterThan(0);
      expect(status.executorStats.totalOrders).toBeGreaterThan(0);
    });
  });

  describe('testUtils', () => {
    it('waitFor 应该等待条件满足', async () => {
      let ready = false;
      setTimeout(() => { ready = true; }, 50);

      await testUtils.waitFor(() => ready, { timeout: 1000 });

      expect(ready).toBe(true);
    });

    it('waitFor 应该在超时时抛出错误', async () => {
      await expect(
        testUtils.waitFor(() => false, { timeout: 100 })
      ).rejects.toThrow('Condition not met');
    });

    it('delay 应该等待指定时间', async () => {
      const start = Date.now();
      await testUtils.delay(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);
    });

    it('assertEventSequence 应该验证事件序列', () => {
      const events = [
        { type: 'signal' },
        { type: 'orderExecuted' },
        { type: 'orderFilled' },
      ];

      expect(testUtils.assertEventSequence(events, ['signal', 'orderExecuted'])).toBe(true);
      expect(testUtils.assertEventSequence(events, ['orderFilled', 'signal'])).toBe(true);
      expect(testUtils.assertEventSequence(events, ['unknown'])).toBe(false);
    });
  });
});
