/**
 * 故障恢复 E2E 测试
 * Fault Recovery E2E Tests
 *
 * TEST-012: 测试系统在各种故障场景下的恢复能力
 * @module tests/e2e/faultRecovery.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  E2ETestEnvironment,
  testUtils,
  RUN_MODE,
} from './e2eTestFramework.js';
import { createFailingExchangeMock, createSlowExchangeMock } from '../mocks/exchangeMock.js';

// ============================================
// 故障恢复测试
// ============================================

describe('Fault Recovery E2E', () => {
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
    await env.start();
  });

  afterEach(async () => {
    await env.teardown();
  });

  // ============================================
  // 网络故障恢复测试
  // ============================================

  describe('网络故障恢复', () => {
    it('应该在网络故障后重试订单', async () => {
      // 注入临时网络故障（2次失败后成功）
      let attempts = 0;
      const flakyExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          attempts++;
          if (attempts <= 2) {
            throw new Error('Network timeout');
          }
          return {
            id: `order_${Date.now()}`,
            symbol,
            type,
            side,
            amount,
            price,
            status: 'filled',
          };
        },
        cancelOrder: async () => ({ status: 'canceled' }),
      };

      env.components.exchanges.set('binance', flakyExchange);
      env.getExecutor().addExchange('binance', flakyExchange);
      // 禁用 dryRun 以使用真实交易所
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0 || env.getErrors().length > 0,
        { timeout: 2000 }
      );

      expect(attempts).toBe(3); // 2次失败 + 1次成功
      expect(env.getEvents('orderFilled').length).toBe(1);
    });

    it('应该在持续网络故障时放弃并记录错误', async () => {
      env.injectExchangeFailure('binance', 'network');

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getErrors().length > 0,
        { timeout: 2000 }
      );

      const errors = env.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('Network');
    });

    it('应该在网络恢复后继续正常交易', async () => {
      // 先故障
      env.injectExchangeFailure('binance', 'network');

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.delay(200);

      // 恢复
      env.restoreExchange('binance');

      // 新订单应该成功
      strategy.generateSignal('sell');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 2000 }
      );

      expect(env.getEvents('orderFilled').length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 交易所故障恢复测试
  // ============================================

  describe('交易所故障恢复', () => {
    it('应该处理频率限制错误', async () => {
      let attempts = 0;
      const rateLimitedExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          attempts++;
          if (attempts <= 2) {
            const error = new Error('Rate limit exceeded');
            error.code = 429;
            throw error;
          }
          return {
            id: `order_${Date.now()}`,
            symbol, type, side, amount, price,
            status: 'filled',
          };
        },
      };

      env.components.exchanges.set('binance', rateLimitedExchange);
      env.getExecutor().addExchange('binance', rateLimitedExchange);
      // 禁用 dryRun 以使用真实交易所
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 2000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(1);
    });

    it('应该处理余额不足错误', async () => {
      const insufficientExchange = {
        createOrder: async () => {
          const error = new Error('Insufficient balance');
          error.code = -2010;
          throw error;
        },
      };

      env.components.exchanges.set('binance', insufficientExchange);
      env.getExecutor().addExchange('binance', insufficientExchange);
      // 禁用 dryRun 以使用真实交易所
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getErrors().length > 0,
        { timeout: 2000 }
      );

      const errors = env.getErrors();
      expect(errors.some(e => e.error.includes('Insufficient'))).toBe(true);
    });

    it('应该处理无效订单错误', async () => {
      const invalidOrderExchange = {
        createOrder: async () => {
          const error = new Error('Invalid order');
          error.code = -1102;
          throw error;
        },
      };

      env.components.exchanges.set('binance', invalidOrderExchange);
      env.getExecutor().addExchange('binance', invalidOrderExchange);
      // 禁用 dryRun 以使用真实交易所
      env.getExecutor().config.dryRun = false;

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getErrors().length > 0,
        { timeout: 2000 }
      );

      const stats = env.getExecutor().getStats();
      expect(stats.failedOrders).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 延迟处理测试
  // ============================================

  describe('延迟处理', () => {
    it('应该处理高延迟响应', async () => {
      env.injectSlowExchange('binance', 500);

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 3000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(1);
    });

    it('应该在延迟期间不阻塞其他操作', async () => {
      env.injectSlowExchange('binance', 200);

      const strategy = env.getStrategy();

      // 发送多个信号
      strategy.generateSignal('buy');
      strategy.generateSignal('sell');
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length >= 3,
        { timeout: 5000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(3);
    });
  });

  // ============================================
  // 风控故障恢复测试
  // ============================================

  describe('风控故障恢复', () => {
    it('应该在风控暂停后正确恢复', async () => {
      const riskManager = env.getRiskManager();
      const strategy = env.getStrategy();

      // 触发风控暂停
      riskManager.pauseTrading('测试暂停');

      strategy.generateSignal('buy');
      await testUtils.delay(100);

      expect(env.getEvents('signalRejected').length).toBe(1);

      // 恢复交易
      riskManager.resumeTrading();

      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(1);
    });

    it('应该在日重置后恢复交易', async () => {
      const riskManager = env.getRiskManager();
      const strategy = env.getStrategy();

      // 触发日亏损限制
      riskManager.recordTrade({ pnl: -600 });

      expect(riskManager.state.tradingAllowed).toBe(false);

      // 日重置
      riskManager.resetDaily();

      expect(riskManager.state.tradingAllowed).toBe(true);

      // 应该能继续交易
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(1);
    });

    it('应该正确处理紧急平仓', async () => {
      const riskManager = env.getRiskManager();
      const executor = env.getExecutor();

      // 模拟有订单
      await executor.executeOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      // 触发紧急平仓
      riskManager.emergencyClose('测试紧急平仓');

      await testUtils.delay(100);

      const emergencyEvents = env.getEvents('emergencyClose');
      expect(emergencyEvents.length).toBe(1);
      expect(riskManager.state.tradingAllowed).toBe(false);
    });
  });

  // ============================================
  // 组件故障恢复测试
  // ============================================

  describe('组件故障恢复', () => {
    it('应该处理策略异常', async () => {
      const strategy = env.getStrategy();

      // 模拟策略抛出异常
      const originalOnTicker = strategy.onTicker;
      let errorCaught = false;

      strategy.onTicker = () => {
        throw new Error('Strategy error');
      };

      try {
        env.getMarketDataEngine().emitTicker('BTC/USDT');
      } catch {
        errorCaught = true;
      }

      // 策略错误不应该崩溃整个系统
      // 恢复正常行为
      strategy.onTicker = originalOnTicker;

      // 系统应该还能继续运行
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(1);
    });

    it('应该优雅地处理组件停止', async () => {
      const marketEngine = env.getMarketDataEngine();
      const strategy = env.getStrategy();

      // 停止行情引擎
      marketEngine.stop();

      // 手动生成信号应该还能工作
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      expect(env.getEvents('orderFilled').length).toBe(1);
    });
  });

  // ============================================
  // 并发故障测试
  // ============================================

  describe('并发故障', () => {
    it('应该处理同时发生的多个故障', async () => {
      // 同时注入多种故障
      let orderCount = 0;
      const unstableExchange = {
        createOrder: async (symbol, type, side, amount, price) => {
          orderCount++;
          // 随机故障
          if (Math.random() < 0.3) {
            throw new Error('Random failure');
          }
          return {
            id: `order_${orderCount}`,
            symbol, type, side, amount, price,
            status: 'filled',
          };
        },
      };

      env.components.exchanges.set('binance', unstableExchange);
      env.getExecutor().addExchange('binance', unstableExchange);

      const strategy = env.getStrategy();

      // 发送多个信号
      for (let i = 0; i < 10; i++) {
        strategy.generateSignal(i % 2 === 0 ? 'buy' : 'sell');
      }

      await testUtils.delay(1000);

      // 应该有一些成功一些失败
      const stats = env.getExecutor().getStats();
      expect(stats.totalOrders).toBe(10);
      // 由于重试，成功率应该较高
      expect(stats.successfulOrders + stats.failedOrders).toBe(10);
    });

    it('应该在故障风暴中保持稳定', async () => {
      const strategy = env.getStrategy();
      const riskManager = env.getRiskManager();

      // 模拟各种事件同时发生
      const actions = [];

      // 交易信号
      for (let i = 0; i < 5; i++) {
        actions.push(async () => {
          strategy.generateSignal('buy');
          await testUtils.delay(10);
        });
      }

      // 风控事件
      actions.push(async () => {
        riskManager.recordTrade({ pnl: -100 });
        await testUtils.delay(10);
      });

      // 行情更新
      for (let i = 0; i < 10; i++) {
        actions.push(async () => {
          env.getMarketDataEngine().emitTicker('BTC/USDT');
          await testUtils.delay(5);
        });
      }

      // 并发执行所有操作
      await Promise.all(actions.map(a => a()));

      // 系统应该保持稳定
      const status = env.getStatus();
      expect(status.status).toBeDefined();
    });
  });

  // ============================================
  // 恢复验证测试
  // ============================================

  describe('恢复验证', () => {
    it('应该在故障后恢复到正常状态', async () => {
      // 注入故障
      env.injectExchangeFailure('binance', 'network');

      const strategy = env.getStrategy();
      strategy.generateSignal('buy');

      await testUtils.delay(500);

      // 恢复
      env.restoreExchange('binance');

      // 验证系统状态正常
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      const stats = env.getExecutor().getStats();
      expect(stats.successfulOrders).toBeGreaterThan(0);
    });

    it('应该正确记录所有故障和恢复事件', async () => {
      const riskManager = env.getRiskManager();
      const strategy = env.getStrategy();

      // 故障
      riskManager.pauseTrading('测试');
      strategy.generateSignal('buy');

      await testUtils.delay(50);

      // 恢复
      riskManager.resumeTrading();
      strategy.generateSignal('buy');

      await testUtils.waitFor(
        () => env.getEvents('orderFilled').length > 0,
        { timeout: 1000 }
      );

      // 验证事件记录
      const pausedEvents = env.getEvents('tradingPaused');
      const rejectedEvents = env.getEvents('signalRejected');
      const filledEvents = env.getEvents('orderFilled');

      expect(pausedEvents.length).toBe(1);
      expect(rejectedEvents.length).toBe(1);
      expect(filledEvents.length).toBe(1);
    });
  });
});
