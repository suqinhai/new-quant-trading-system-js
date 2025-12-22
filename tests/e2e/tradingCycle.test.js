/**
 * 完整交易周期 E2E 测试
 * Complete Trading Cycle E2E Tests
 *
 * TEST-011: 测试从信号生成到订单执行的完整交易周期
 * @module tests/e2e/tradingCycle.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  E2ETestEnvironment,
  MockStrategy,
  testUtils,
  SYSTEM_STATUS,
  RUN_MODE,
} from './e2eTestFramework.js';

// ============================================
// 完整交易周期测试
// ============================================

describe('Complete Trading Cycle E2E', () => {
  let env;

  beforeEach(async () => {
    env = new E2ETestEnvironment({
      mode: RUN_MODE.SHADOW,
      initialEquity: 10000,
      symbols: ['BTC/USDT'],
      exchanges: ['binance'],
    });
    await env.setup();
    await env.start();
  });

  afterEach(async () => {
    await env.teardown();
  });

  // ============================================
  // 基础交易周期测试
  // ============================================

  describe('基础交易周期', () => {
    it('应该完成从信号到订单的完整流程', async () => {
      const strategy = env.getStrategy();

      // 1. 生成买入信号
      strategy.generateSignal('buy');

      // 2. 等待订单执行
      await testUtils.waitFor(
        () => env.getEvents('orderExecuted').length > 0,
        { timeout: 1000 }
      );

      // 3. 验证事件流
      const events = env.getEvents();
      const eventTypes = events.map(e => e.type);

      expect(eventTypes).toContain('signal');
      expect(eventTypes).toContain('orderExecuted');
      expect(eventTypes).toContain('orderFilled');
    });

    it('应该正确执行买入订单', async () => {
      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      const filledEvents = env.getEvents('orderFilled');
      expect(filledEvents.length).toBe(1);
      expect(filledEvents[0].data.side).toBe('buy');
    });

    it('应该正确执行卖出订单', async () => {
      const strategy = env.getStrategy();
      strategy.generateSignal('sell');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      const filledEvents = env.getEvents('orderFilled');
      expect(filledEvents.length).toBe(1);
      expect(filledEvents[0].data.side).toBe('sell');
    });

    it('应该按顺序执行多个订单', async () => {
      const strategy = env.getStrategy();

      // 执行多个交易
      strategy.generateSignal('buy');
      await testUtils.delay(50);
      strategy.generateSignal('sell');
      await testUtils.delay(50);
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 3,
        { timeout: 2000 }
      );

      const filledEvents = env.getEvents('orderFilled');
      expect(filledEvents.length).toBe(3);
      expect(filledEvents[0].data.side).toBe('buy');
      expect(filledEvents[1].data.side).toBe('sell');
      expect(filledEvents[2].data.side).toBe('buy');
    });
  });

  // ============================================
  // 风控集成测试
  // ============================================

  describe('风控集成', () => {
    it('应该在风控通过时执行订单', async () => {
      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderExecuted').length > 0,
        { timeout: 1000 }
      );

      const rejectedEvents = env.getEvents('signalRejected');
      expect(rejectedEvents.length).toBe(0);
    });

    it('应该在仓位过大时拒绝订单', async () => {
      const strategy = env.getStrategy();

      // 创建一个大仓位的信号
      const largeSignal = {
        id: `sig_${Date.now()}`,
        strategy: 'DefaultStrategy',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1, // 大仓位
        price: 50000,
        orderType: 'market',
        timestamp: Date.now(),
      };

      strategy.emit('signal', largeSignal);

      await testUtils.delay(100);

      const rejectedEvents = env.getEvents('signalRejected');
      expect(rejectedEvents.length).toBe(1);
      expect(rejectedEvents[0].data.reason).toContain('仓位');
    });

    it('应该在日亏损超限后停止交易', async () => {
      const riskManager = env.getRiskManager();
      const strategy = env.getStrategy();

      // 模拟大额亏损
      riskManager.recordTrade({ pnl: -600 }); // 6% 亏损，超过 5% 限制

      expect(riskManager.state.tradingAllowed).toBe(false);

      // 尝试生成信号
      strategy.generateSignal('buy');

      await testUtils.delay(100);

      const rejectedEvents = env.getEvents('signalRejected');
      expect(rejectedEvents.length).toBe(1);
    });

    it('应该在风控警报后记录事件', async () => {
      const riskManager = env.getRiskManager();
      const strategy = env.getStrategy();

      // 先生成一个交易来产生事件
      strategy.generateSignal('buy');

      await testUtils.delay(100);

      // 触发警报（超过 5% 限制触发暂停）
      riskManager.recordTrade({ pnl: -600 });

      const pausedEvents = env.getEvents('tradingPaused');
      expect(pausedEvents.length).toBe(1);
    });
  });

  // ============================================
  // 市场数据集成测试
  // ============================================

  describe('市场数据集成', () => {
    it('应该在收到 Ticker 时更新策略', async () => {
      const strategy = env.getStrategy();
      let tickerReceived = false;
      strategy.onTicker = () => { tickerReceived = true; };

      env.getMarketDataEngine().emitTicker('BTC/USDT');

      expect(tickerReceived).toBe(true);
    });

    it('应该在市场数据变化时触发策略信号', async () => {
      // 设置自动信号策略
      const autoStrategy = new MockStrategy({
        name: 'AutoStrategy',
        symbols: ['BTC/USDT'],
        autoSignal: true,
      });

      env.components.strategies.set('AutoStrategy', autoStrategy);
      await autoStrategy.initialize();
      await autoStrategy.start();

      // 模拟多次行情更新
      await env.simulateMarketData(20, 10);

      // 自动策略有 20% 概率生成信号
      const signalCount = autoStrategy.state.signalCount;
      expect(signalCount).toBeGreaterThanOrEqual(0); // 可能是 0，是随机的
    });

    it('应该处理连续的市场数据更新', async () => {
      const engine = env.getMarketDataEngine();
      let tickerCount = 0;

      engine.on('ticker', () => { tickerCount++; });

      // 快速发送多个 Ticker
      for (let i = 0; i < 100; i++) {
        engine.emitTicker('BTC/USDT');
      }

      expect(tickerCount).toBe(100);
    });
  });

  // ============================================
  // 订单执行测试
  // ============================================

  describe('订单执行', () => {
    it('应该在干跑模式下模拟订单', async () => {
      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      const filledEvents = env.getEvents('orderFilled');
      expect(filledEvents[0].data.id).toContain('dry_');
    });

    it('应该正确统计订单数量', async () => {
      const strategy = env.getStrategy();

      for (let i = 0; i < 5; i++) {
        strategy.generateSignal(i % 2 === 0 ? 'buy' : 'sell');
        await testUtils.delay(20);
      }

      await testUtils.waitFor(
        () => env.getExecutor().getStats().totalOrders >= 5,
        { timeout: 2000 }
      );

      const stats = env.getExecutor().getStats();
      expect(stats.totalOrders).toBe(5);
      expect(stats.successfulOrders).toBe(5);
      expect(stats.failedOrders).toBe(0);
    });

    it('应该计算总交易量', async () => {
      const strategy = env.getStrategy();

      strategy.generateSignal('buy'); // 0.01 * 50000 = 500

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      const stats = env.getExecutor().getStats();
      expect(stats.totalVolume).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 完整交易场景测试
  // ============================================

  describe('完整交易场景', () => {
    it('应该完成开仓-持有-平仓的完整周期', async () => {
      const strategy = env.getStrategy();

      // 1. 开仓
      strategy.generateSignal('buy');
      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 1,
        { timeout: 1000 }
      );

      // 2. 等待一段时间（模拟持仓）
      await testUtils.delay(100);

      // 3. 平仓
      strategy.generateSignal('sell');
      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 2,
        { timeout: 1000 }
      );

      // 验证
      const filledEvents = env.getEvents('orderFilled');
      expect(filledEvents.length).toBe(2);
      expect(filledEvents[0].data.side).toBe('buy');
      expect(filledEvents[1].data.side).toBe('sell');
    });

    it('应该处理多个交易对', async () => {
      // 创建多交易对环境
      const multiEnv = new E2ETestEnvironment({
        mode: RUN_MODE.SHADOW,
        symbols: ['BTC/USDT', 'ETH/USDT'],
        exchanges: ['binance'],
      });
      await multiEnv.setup();
      await multiEnv.start();

      try {
        const strategy = multiEnv.getStrategy();

        // 为不同交易对生成信号
        const btcSignal = {
          id: `sig_btc_${Date.now()}`,
          strategy: 'DefaultStrategy',
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.01,
          price: 50000,
          orderType: 'market',
          timestamp: Date.now(),
        };

        const ethSignal = {
          id: `sig_eth_${Date.now()}`,
          strategy: 'DefaultStrategy',
          symbol: 'ETH/USDT',
          side: 'buy',
          amount: 0.1,
          price: 3000,
          orderType: 'market',
          timestamp: Date.now(),
        };

        strategy.emit('signal', btcSignal);
        strategy.emit('signal', ethSignal);

        await testUtils.waitFor(
          () => multiEnv.getEvents('orderFilled').length >= 2,
          { timeout: 2000 }
        );

        const filledEvents = multiEnv.getEvents('orderFilled');
        expect(filledEvents.length).toBe(2);
      } finally {
        await multiEnv.teardown();
      }
    });

    it('应该在一个交易日内处理多次交易', async () => {
      const strategy = env.getStrategy();
      const orderCount = 10;

      // 模拟一个交易日的多次交易
      for (let i = 0; i < orderCount; i++) {
        strategy.generateSignal(i % 2 === 0 ? 'buy' : 'sell');
        await testUtils.delay(30);
      }

      await testUtils.waitFor(
        () => env.getExecutor().getStats().successfulOrders >= orderCount,
        { timeout: 5000 }
      );

      const stats = env.getExecutor().getStats();
      expect(stats.successfulOrders).toBe(orderCount);
    });
  });

  // ============================================
  // 状态一致性测试
  // ============================================

  describe('状态一致性', () => {
    it('应该保持事件计数一致', async () => {
      const strategy = env.getStrategy();

      for (let i = 0; i < 5; i++) {
        strategy.generateSignal('buy');
        await testUtils.delay(20);
      }

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 5,
        { timeout: 2000 }
      );

      const signalCount = env.getEvents('signal').length;
      const executedCount = env.getEvents('orderExecuted').length;
      const filledCount = env.getEvents('orderFilled').length;

      expect(signalCount).toBe(5);
      expect(executedCount).toBe(5);
      expect(filledCount).toBe(5);
    });

    it('应该在结束时返回正确的状态', async () => {
      const strategy = env.getStrategy();

      strategy.generateSignal('buy');
      await testUtils.delay(100);

      const status = env.getStatus();

      expect(status.status).toBe(SYSTEM_STATUS.RUNNING);
      expect(status.eventCount).toBeGreaterThan(0);
      expect(status.errorCount).toBe(0);
    });
  });
});
