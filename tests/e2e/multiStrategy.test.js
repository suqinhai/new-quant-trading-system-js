/**
 * 多策略并行 E2E 测试
 * Multi-Strategy Parallel E2E Tests
 *
 * TEST-013: 测试多个策略同时运行时的系统行为
 * @module tests/e2e/multiStrategy.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  E2ETestEnvironment,
  MockStrategy,
  testUtils,
  RUN_MODE,
} from './e2eTestFramework.js';

// ============================================
// 多策略并行测试
// ============================================

describe('Multi-Strategy Parallel E2E', () => {
  let env;

  beforeEach(async () => {
    env = new E2ETestEnvironment({
      mode: RUN_MODE.SHADOW,
      initialEquity: 100000, // 更大的资金以支持多策略
      symbols: ['BTC/USDT', 'ETH/USDT'],
      exchanges: ['binance'],
      strategies: [
        { name: 'Strategy_A', symbols: ['BTC/USDT'] },
        { name: 'Strategy_B', symbols: ['ETH/USDT'] },
        { name: 'Strategy_C', symbols: ['BTC/USDT', 'ETH/USDT'] },
      ],
      riskConfig: {
        maxPositionRatio: 0.3, // 30% 每个策略
      },
    });
    await env.setup();
    await env.start();
  });

  afterEach(async () => {
    await env.teardown();
  });

  // ============================================
  // 基础多策略测试
  // ============================================

  describe('基础多策略运行', () => {
    it('应该同时运行多个策略', async () => {
      const strategies = env.components.strategies;

      expect(strategies.size).toBe(3);

      for (const [, strategy] of strategies) {
        expect(strategy.state.isRunning).toBe(true);
      }
    });

    it('应该独立处理每个策略的信号', async () => {
      const strategyA = env.getStrategy('Strategy_A');
      const strategyB = env.getStrategy('Strategy_B');

      strategyA.generateSignal('buy');
      strategyB.generateSignal('sell');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 2,
        { timeout: 2000 }
      );

      const filledEvents = env.getEvents('orderFilled');
      expect(filledEvents.length).toBe(2);

      // 验证两个策略都有订单
      const symbols = filledEvents.map(e => e.data.symbol);
      expect(symbols).toContain('BTC/USDT');
      expect(symbols).toContain('ETH/USDT');
    });

    it('应该正确追踪每个策略的信号计数', async () => {
      const strategyA = env.getStrategy('Strategy_A');
      const strategyB = env.getStrategy('Strategy_B');
      const strategyC = env.getStrategy('Strategy_C');

      strategyA.generateSignal('buy');
      strategyA.generateSignal('sell');
      strategyB.generateSignal('buy');
      strategyC.generateSignal('buy');
      strategyC.generateSignal('sell');
      strategyC.generateSignal('buy');

      expect(strategyA.state.signalCount).toBe(2);
      expect(strategyB.state.signalCount).toBe(1);
      expect(strategyC.state.signalCount).toBe(3);
    });
  });

  // ============================================
  // 并发执行测试
  // ============================================

  describe('并发执行', () => {
    it('应该并发处理来自多个策略的信号', async () => {
      const strategies = Array.from(env.components.strategies.values());

      // 同时从所有策略生成信号
      const signalPromises = strategies.map(async (strategy) => {
        strategy.generateSignal('buy');
      });

      await Promise.all(signalPromises);

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 3,
        { timeout: 3000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(3);
    });

    it('应该正确处理高频并发信号', async () => {
      const strategies = Array.from(env.components.strategies.values());
      const signalsPerStrategy = 5;

      // 高频发送信号
      for (let i = 0; i < signalsPerStrategy; i++) {
        for (const strategy of strategies) {
          strategy.generateSignal(i % 2 === 0 ? 'buy' : 'sell');
        }
        await testUtils.delay(10);
      }

      const expectedTotal = strategies.length * signalsPerStrategy;

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= expectedTotal,
        { timeout: 5000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(expectedTotal);
    });

    it('应该在并发时保持订单顺序', async () => {
      const strategyA = env.getStrategy('Strategy_A');

      // 快速发送多个信号
      const sides = ['buy', 'sell', 'buy', 'sell', 'buy'];
      for (const side of sides) {
        strategyA.generateSignal(side);
      }

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 5,
        { timeout: 3000 }
      );

      const filledEvents = env.getEvents('orderFilled');
      const filledSides = filledEvents
        .filter(e => e.data.symbol === 'BTC/USDT')
        .map(e => e.data.side);

      expect(filledSides).toEqual(sides);
    });
  });

  // ============================================
  // 资源竞争测试
  // ============================================

  describe('资源竞争', () => {
    it('应该在多策略共享交易所时正常工作', async () => {
      const strategies = Array.from(env.components.strategies.values());

      // 所有策略同时使用同一交易所
      for (const strategy of strategies) {
        strategy.generateSignal('buy');
      }

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 3,
        { timeout: 3000 }
      );

      const stats = env.getExecutor().getStats();
      expect(stats.successfulOrders).toBe(3);
    });

    it('应该正确处理相同交易对的竞争', async () => {
      // Strategy_A 和 Strategy_C 都交易 BTC/USDT
      const strategyA = env.getStrategy('Strategy_A');
      const strategyC = env.getStrategy('Strategy_C');

      // 同时为 BTC/USDT 生成信号
      const signalA = {
        id: `sig_a_${Date.now()}`,
        strategy: 'Strategy_A',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
        orderType: 'market',
        timestamp: Date.now(),
      };

      const signalC = {
        id: `sig_c_${Date.now()}`,
        strategy: 'Strategy_C',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.01,
        price: 50000,
        orderType: 'market',
        timestamp: Date.now(),
      };

      strategyA.emit('signal', signalA);
      strategyC.emit('signal', signalC);

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 2,
        { timeout: 2000 }
      );

      const btcOrders = env.getEvents('orderFilled')
        .filter(e => e.data.symbol === 'BTC/USDT');

      expect(btcOrders.length).toBe(2);
    });
  });

  // ============================================
  // 风控集成测试
  // ============================================

  describe('多策略风控', () => {
    it('应该对所有策略应用全局风控', async () => {
      const riskManager = env.getRiskManager();
      const strategies = Array.from(env.components.strategies.values());

      // 全局暂停交易
      riskManager.pauseTrading('全局测试');

      // 所有策略的信号都应该被拒绝
      for (const strategy of strategies) {
        strategy.generateSignal('buy');
      }

      await testUtils.delay(200);

      const rejectedEvents = env.getEvents('signalRejected');
      expect(rejectedEvents.length).toBe(3);
    });

    it('应该累计所有策略的风险敞口', async () => {
      const riskManager = env.getRiskManager();
      const strategies = Array.from(env.components.strategies.values());

      // 记录来自不同策略的交易
      riskManager.recordTrade({ pnl: -100, strategy: 'Strategy_A' });
      riskManager.recordTrade({ pnl: -150, strategy: 'Strategy_B' });
      riskManager.recordTrade({ pnl: -200, strategy: 'Strategy_C' });

      const status = riskManager.getStatus();
      expect(status.dailyPnL).toBe(-450);
    });

    it('应该在总风险超限时停止所有策略', async () => {
      const riskManager = env.getRiskManager();
      const strategies = Array.from(env.components.strategies.values());

      // 触发日亏损限制
      riskManager.recordTrade({ pnl: -6000 }); // 超过 5% 限制

      expect(riskManager.state.tradingAllowed).toBe(false);

      // 所有策略都应该被阻止
      for (const strategy of strategies) {
        strategy.generateSignal('buy');
      }

      await testUtils.delay(200);

      const filledEvents = env.getEvents('orderFilled');
      expect(filledEvents.length).toBe(0);
    });
  });

  // ============================================
  // 策略隔离测试
  // ============================================

  describe('策略隔离', () => {
    it('一个策略的错误不应影响其他策略', async () => {
      const strategyA = env.getStrategy('Strategy_A');
      const strategyB = env.getStrategy('Strategy_B');

      // 让 Strategy_A 产生一个会被风控拒绝的大订单
      const largeSignal = {
        id: `sig_large_${Date.now()}`,
        strategy: 'Strategy_A',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 10, // 超大仓位
        price: 50000,
        orderType: 'market',
        timestamp: Date.now(),
      };

      strategyA.emit('signal', largeSignal);

      // Strategy_B 应该还能正常工作
      strategyB.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 1,
        { timeout: 2000 }
      );

      const rejectedEvents = env.getEvents('signalRejected');
      const filledEvents = env.getEvents('orderFilled');

      expect(rejectedEvents.length).toBe(1);
      expect(filledEvents.length).toBe(1);
      expect(filledEvents[0].data.symbol).toBe('ETH/USDT');
    });

    it('策略停止不应影响其他策略', async () => {
      const strategyA = env.getStrategy('Strategy_A');
      const strategyB = env.getStrategy('Strategy_B');

      // 停止 Strategy_A
      await strategyA.stop();

      // Strategy_B 应该还能工作
      strategyB.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 1,
        { timeout: 2000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(1);
      expect(strategyA.state.isRunning).toBe(false);
      expect(strategyB.state.isRunning).toBe(true);
    });
  });

  // ============================================
  // 性能测试
  // ============================================

  describe('性能', () => {
    it('应该高效处理大量并发信号', async () => {
      const strategies = Array.from(env.components.strategies.values());
      const startTime = Date.now();
      const totalSignals = 30; // 每个策略 10 个信号

      for (let i = 0; i < 10; i++) {
        for (const strategy of strategies) {
          strategy.generateSignal(i % 2 === 0 ? 'buy' : 'sell');
        }
      }

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= totalSignals,
        { timeout: 10000 }
      );

      const duration = Date.now() - startTime;

      expect(env.getEvents('orderFilled').length).toBe(totalSignals);
      expect(duration).toBeLessThan(5000); // 应该在 5 秒内完成
    });

    it('应该在高负载下保持响应', async () => {
      const strategies = Array.from(env.components.strategies.values());

      // 同时进行：信号生成、行情更新、风控检查
      const tasks = [];

      // 信号生成
      for (let i = 0; i < 20; i++) {
        tasks.push(async () => {
          const strategy = strategies[i % strategies.length];
          strategy.generateSignal('buy');
          await testUtils.delay(5);
        });
      }

      // 行情更新
      for (let i = 0; i < 50; i++) {
        tasks.push(async () => {
          env.getMarketDataEngine().emitTicker('BTC/USDT');
          await testUtils.delay(2);
        });
      }

      await Promise.all(tasks.map(t => t()));

      await testUtils.delay(500);

      // 系统应该保持稳定
      const status = env.getStatus();
      expect(status.strategies.length).toBe(3);
    });
  });

  // ============================================
  // 状态同步测试
  // ============================================

  describe('状态同步', () => {
    it('应该正确聚合所有策略的状态', async () => {
      const strategies = Array.from(env.components.strategies.values());

      for (const strategy of strategies) {
        strategy.generateSignal('buy');
      }

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 3,
        { timeout: 3000 }
      );

      const status = env.getStatus();

      expect(status.strategies.length).toBe(3);
      expect(status.strategies.every(s => s.signalCount >= 1)).toBe(true);
    });

    it('应该正确统计总订单数', async () => {
      const strategies = Array.from(env.components.strategies.values());

      // 每个策略生成 2 个信号
      for (const strategy of strategies) {
        strategy.generateSignal('buy');
        strategy.generateSignal('sell');
      }

      await testUtils.waitFor(
        () => env.getExecutor().getStats().totalOrders >= 6,
        { timeout: 3000 }
      );

      const stats = env.getExecutor().getStats();
      expect(stats.totalOrders).toBe(6);
      expect(stats.successfulOrders).toBe(6);
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('生命周期管理', () => {
    it('应该正确启动所有策略', async () => {
      const strategies = Array.from(env.components.strategies.values());

      for (const strategy of strategies) {
        expect(strategy.state.isRunning).toBe(true);
      }
    });

    it('应该正确停止所有策略', async () => {
      await env.stop();

      const strategies = Array.from(env.components.strategies.values());

      for (const strategy of strategies) {
        expect(strategy.state.isRunning).toBe(false);
      }
    });

    it('应该支持动态添加策略', async () => {
      const newStrategy = new MockStrategy({
        name: 'Strategy_D',
        symbols: ['BNB/USDT'],
      });

      env.components.strategies.set('Strategy_D', newStrategy);
      await newStrategy.initialize();
      await newStrategy.start();

      newStrategy.generateSignal('buy');

      await testUtils.delay(100);

      expect(env.components.strategies.size).toBe(4);
      expect(newStrategy.state.signalCount).toBe(1);
    });

    it('应该支持动态移除策略', async () => {
      const strategyA = env.getStrategy('Strategy_A');

      await strategyA.stop();
      env.components.strategies.delete('Strategy_A');

      expect(env.components.strategies.size).toBe(2);
      expect(env.components.strategies.has('Strategy_A')).toBe(false);
    });
  });
});
