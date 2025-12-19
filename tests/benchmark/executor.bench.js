/**
 * SmartOrderExecutor 性能基准测试
 * SmartOrderExecutor Performance Benchmark Tests
 *
 * 测试真实订单执行器的性能
 * Test performance of actual order executor
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  SmartOrderExecutor,
  AccountLockManager,
  RateLimitManager,
  NonceManager,
  SIDE,
  ORDER_TYPE,
  DEFAULT_CONFIG,
} from '../../src/executor/orderExecutor.js';

// ============================================
// 性能目标 / Performance Targets
// ============================================

const TARGETS = {
  // 智能限价单执行延迟目标 / Smart limit order execution target
  SMART_LIMIT_ORDER: 100,

  // 市价单执行延迟目标 / Market order execution target
  SMART_MARKET_ORDER: 100,

  // 账户锁获取延迟目标 / Account lock acquisition target
  ACCOUNT_LOCK: 10,

  // 限频管理器操作延迟目标 / Rate limit manager operation target
  RATE_LIMIT_CHECK: 1,

  // Nonce 管理器操作延迟目标 / Nonce manager operation target
  NONCE_OPERATION: 1,

  // 订单参数构建延迟目标 / Order params build target
  BUILD_PARAMS: 5,
};

// ============================================
// 模拟交易所 / Mock Exchange
// ============================================

class MockExchangeForExecutor {
  constructor(options = {}) {
    this.options = {
      createOrderDelay: options.createOrderDelay || 5,
      cancelOrderDelay: options.cancelOrderDelay || 3,
      fetchOrderDelay: options.fetchOrderDelay || 3,
      fetchTickerDelay: options.fetchTickerDelay || 2,
      ...options,
    };
    this.orderCounter = 0;
    this.orders = new Map();
  }

  async createOrder(symbol, type, side, amount, price, params = {}) {
    await this._delay(this.options.createOrderDelay);

    const orderId = `ord_${++this.orderCounter}_${Date.now()}`;
    const order = {
      id: orderId,
      clientOrderId: params.clientOrderId || orderId,
      symbol,
      type,
      side,
      amount,
      price: price || 50000,
      filled: type === 'market' ? amount : amount, // 模拟立即成交 / Simulate immediate fill
      remaining: 0,
      average: price || 50000,
      status: 'closed',
      timestamp: Date.now(),
    };

    this.orders.set(orderId, order);
    return order;
  }

  async cancelOrder(orderId, symbol) {
    await this._delay(this.options.cancelOrderDelay);

    const order = this.orders.get(orderId);
    if (order) {
      order.status = 'canceled';
      return order;
    }
    return { id: orderId, status: 'canceled' };
  }

  async fetchOrder(orderId, symbol) {
    await this._delay(this.options.fetchOrderDelay);

    const order = this.orders.get(orderId);
    if (order) {
      return order;
    }
    throw new Error('Order not found');
  }

  async fetchTicker(symbol) {
    await this._delay(this.options.fetchTickerDelay);

    return {
      symbol,
      last: 50000,
      bid: 49999,
      ask: 50001,
      high: 51000,
      low: 49000,
      timestamp: Date.now(),
    };
  }

  async fetchTime() {
    await this._delay(1);
    return Date.now();
  }

  async _delay(ms) {
    if (ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  reset() {
    this.orderCounter = 0;
    this.orders.clear();
  }
}

// ============================================
// 性能测试工具 / Performance Test Utilities
// ============================================

class BenchmarkTimer {
  constructor() {
    this.samples = [];
  }

  start() {
    this._start = performance.now();
  }

  stop() {
    const elapsed = performance.now() - this._start;
    this.samples.push(elapsed);
    return elapsed;
  }

  getStats() {
    if (this.samples.length === 0) return null;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1],
    };
  }

  reset() {
    this.samples = [];
  }
}

function printStats(name, stats, target) {
  const passed = stats.p95 <= target;
  console.log(`\n  ${name}:`);
  console.log(`    Samples: ${stats.count}`);
  console.log(`    Min: ${stats.min.toFixed(3)}ms`);
  console.log(`    Avg: ${stats.avg.toFixed(3)}ms`);
  console.log(`    P50: ${stats.p50.toFixed(3)}ms`);
  console.log(`    P90: ${stats.p90.toFixed(3)}ms`);
  console.log(`    P95: ${stats.p95.toFixed(3)}ms (target: <${target}ms)`);
  console.log(`    P99: ${stats.p99.toFixed(3)}ms`);
  console.log(`    Max: ${stats.max.toFixed(3)}ms`);
  console.log(`    Result: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

// ============================================
// 测试套件 / Test Suites
// ============================================

describe('SmartOrderExecutor Performance Benchmarks', () => {
  let executor;
  let mockExchange;
  const WARMUP = 5;
  const ITERATIONS = 50;

  before(() => {
    console.log('\n========================================');
    console.log('SmartOrderExecutor Performance Benchmarks');
    console.log('========================================');
    console.log(`Warmup iterations: ${WARMUP}`);
    console.log(`Test iterations: ${ITERATIONS}`);
  });

  beforeEach(async () => {
    mockExchange = new MockExchangeForExecutor({ createOrderDelay: 2 });

    executor = new SmartOrderExecutor({
      unfillTimeout: 500,
      checkInterval: 50,
      maxResubmitAttempts: 3,
      verbose: false,
    });

    await executor.init({ mock: mockExchange });
  });

  afterEach(() => {
    executor.stop();
    mockExchange.reset();
  });

  describe('Smart Limit Order Execution', () => {
    it(`should execute smart limit orders within ${TARGETS.SMART_LIMIT_ORDER}ms (P95)`, async () => {
      const timer = new BenchmarkTimer();

      // 预热 / Warmup
      for (let i = 0; i < WARMUP; i++) {
        await executor.executeSmartLimitOrder({
          exchangeId: 'mock',
          symbol: 'BTC/USDT',
          side: SIDE.BUY,
          amount: 0.01,
          price: 50000,
        });
      }

      // 正式测试 / Actual test
      for (let i = 0; i < ITERATIONS; i++) {
        timer.start();
        await executor.executeSmartLimitOrder({
          exchangeId: 'mock',
          symbol: 'BTC/USDT',
          side: SIDE.BUY,
          amount: 0.01,
          price: 50000 + i,
        });
        timer.stop();
      }

      const stats = timer.getStats();
      const passed = printStats('Smart Limit Order', stats, TARGETS.SMART_LIMIT_ORDER);
      assert.ok(passed, `Smart limit order P95 ${stats.p95.toFixed(3)}ms exceeds ${TARGETS.SMART_LIMIT_ORDER}ms`);
    });
  });

  describe('Market Order Execution', () => {
    it(`should execute market orders within ${TARGETS.SMART_MARKET_ORDER}ms (P95)`, async () => {
      const timer = new BenchmarkTimer();

      // 预热 / Warmup
      for (let i = 0; i < WARMUP; i++) {
        await executor.executeMarketOrder({
          exchangeId: 'mock',
          symbol: 'BTC/USDT',
          side: SIDE.SELL,
          amount: 0.01,
        });
      }

      // 正式测试 / Actual test
      for (let i = 0; i < ITERATIONS; i++) {
        timer.start();
        await executor.executeMarketOrder({
          exchangeId: 'mock',
          symbol: 'BTC/USDT',
          side: SIDE.SELL,
          amount: 0.01,
        });
        timer.stop();
      }

      const stats = timer.getStats();
      const passed = printStats('Market Order', stats, TARGETS.SMART_MARKET_ORDER);
      assert.ok(passed, `Market order P95 ${stats.p95.toFixed(3)}ms exceeds ${TARGETS.SMART_MARKET_ORDER}ms`);
    });
  });
});

describe('AccountLockManager Benchmarks', () => {
  let lockManager;
  const ITERATIONS = 100;

  beforeEach(() => {
    lockManager = new AccountLockManager();
  });

  it(`should acquire and release locks within ${TARGETS.ACCOUNT_LOCK}ms (P95)`, async () => {
    const timer = new BenchmarkTimer();

    for (let i = 0; i < ITERATIONS; i++) {
      timer.start();
      await lockManager.executeInQueue(`account_${i % 5}`, async () => {
        // 模拟快速任务 / Simulate quick task
        return { success: true };
      });
      timer.stop();
    }

    const stats = timer.getStats();
    const passed = printStats('Account Lock', stats, TARGETS.ACCOUNT_LOCK);
    assert.ok(passed, `Account lock P95 ${stats.p95.toFixed(3)}ms exceeds ${TARGETS.ACCOUNT_LOCK}ms`);
  });

  it('should handle concurrent locks efficiently', async () => {
    const timer = new BenchmarkTimer();
    const concurrentCount = 10;

    for (let i = 0; i < ITERATIONS / concurrentCount; i++) {
      timer.start();

      const promises = [];
      for (let j = 0; j < concurrentCount; j++) {
        promises.push(lockManager.executeInQueue('shared_account', async () => {
          return { success: true };
        }));
      }

      await Promise.all(promises);
      timer.stop();
    }

    const stats = timer.getStats();
    printStats('Concurrent Locks (10 concurrent)', stats, 50);

    // 10 个并发锁应该在 50ms 内完成 / 10 concurrent locks should complete in 50ms
    assert.ok(stats.avg < 50, `Concurrent locks average ${stats.avg.toFixed(3)}ms is too high`);
  });
});

describe('RateLimitManager Benchmarks', () => {
  let rateLimitManager;
  const ITERATIONS = 1000;

  beforeEach(() => {
    rateLimitManager = new RateLimitManager({
      rateLimitInitialWait: 1000,
      rateLimitMaxWait: 30000,
      rateLimitBackoffMultiplier: 2,
    });
  });

  it(`should check rate limit within ${TARGETS.RATE_LIMIT_CHECK}ms (P95)`, async () => {
    const timer = new BenchmarkTimer();

    for (let i = 0; i < ITERATIONS; i++) {
      timer.start();
      rateLimitManager.isRateLimited('binance');
      timer.stop();
    }

    const stats = timer.getStats();
    const passed = printStats('Rate Limit Check', stats, TARGETS.RATE_LIMIT_CHECK);
    assert.ok(passed, `Rate limit check P95 ${stats.p95.toFixed(3)}ms exceeds ${TARGETS.RATE_LIMIT_CHECK}ms`);
  });

  it('should record rate limit errors efficiently', async () => {
    const timer = new BenchmarkTimer();

    for (let i = 0; i < ITERATIONS; i++) {
      timer.start();
      rateLimitManager.recordRateLimitError('binance', new Error('Rate limit exceeded'));
      rateLimitManager.clearRateLimitStatus('binance');
      timer.stop();
    }

    const stats = timer.getStats();
    printStats('Rate Limit Record/Clear', stats, 1);
    assert.ok(stats.p95 < 1, `Rate limit record/clear P95 ${stats.p95.toFixed(3)}ms exceeds 1ms`);
  });
});

describe('NonceManager Benchmarks', () => {
  let nonceManager;
  const ITERATIONS = 1000;

  beforeEach(() => {
    nonceManager = new NonceManager({
      timestampOffset: 0,
    });
  });

  it(`should generate nonces within ${TARGETS.NONCE_OPERATION}ms (P95)`, async () => {
    const timer = new BenchmarkTimer();

    for (let i = 0; i < ITERATIONS; i++) {
      timer.start();
      nonceManager.getNextNonce('binance');
      timer.stop();
    }

    const stats = timer.getStats();
    const passed = printStats('Nonce Generation', stats, TARGETS.NONCE_OPERATION);
    assert.ok(passed, `Nonce generation P95 ${stats.p95.toFixed(3)}ms exceeds ${TARGETS.NONCE_OPERATION}ms`);
  });

  it('should detect nonce conflicts efficiently', async () => {
    const timer = new BenchmarkTimer();
    const error = new Error('Invalid nonce: expected timestamp > 1234567890');

    for (let i = 0; i < ITERATIONS; i++) {
      timer.start();
      nonceManager.isNonceConflict(error);
      timer.stop();
    }

    const stats = timer.getStats();
    printStats('Nonce Conflict Detection', stats, 1);
    assert.ok(stats.p95 < 1, `Nonce conflict detection P95 ${stats.p95.toFixed(3)}ms exceeds 1ms`);
  });
});

describe('End-to-End Order Flow Benchmarks', () => {
  let executor;
  let mockExchange;

  beforeEach(async () => {
    // 使用最小延迟的模拟交易所 / Use mock exchange with minimal delay
    mockExchange = new MockExchangeForExecutor({
      createOrderDelay: 1,
      cancelOrderDelay: 1,
      fetchOrderDelay: 1,
      fetchTickerDelay: 1,
    });

    executor = new SmartOrderExecutor({
      unfillTimeout: 1000,
      checkInterval: 10,
      maxResubmitAttempts: 3,
      verbose: false,
    });

    await executor.init({ mock: mockExchange });
  });

  afterEach(() => {
    executor.stop();
  });

  it('should complete full order lifecycle within 100ms', async () => {
    const timer = new BenchmarkTimer();
    const ITERATIONS = 30;

    for (let i = 0; i < ITERATIONS; i++) {
      timer.start();

      // 完整订单生命周期 / Complete order lifecycle
      const result = await executor.executeSmartLimitOrder({
        exchangeId: 'mock',
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        amount: 0.01,
        price: 50000,
      });

      timer.stop();

      assert.ok(result.success, 'Order should succeed');
    }

    const stats = timer.getStats();
    const passed = printStats('Full Order Lifecycle', stats, 100);
    assert.ok(passed, `Full order lifecycle P95 ${stats.p95.toFixed(3)}ms exceeds 100ms`);
  });

  it('should handle order statistics retrieval efficiently', async () => {
    const timer = new BenchmarkTimer();

    // 先创建一些订单 / First create some orders
    for (let i = 0; i < 10; i++) {
      await executor.executeSmartLimitOrder({
        exchangeId: 'mock',
        symbol: 'BTC/USDT',
        side: SIDE.BUY,
        amount: 0.01,
        price: 50000,
      });
    }

    const ITERATIONS = 1000;
    for (let i = 0; i < ITERATIONS; i++) {
      timer.start();
      executor.getStats();
      timer.stop();
    }

    const stats = timer.getStats();
    printStats('Get Statistics', stats, 1);
    assert.ok(stats.p95 < 1, `Get statistics P95 ${stats.p95.toFixed(3)}ms exceeds 1ms`);
  });
});

describe('Performance Summary Report', () => {
  after(() => {
    console.log('\n========================================');
    console.log('Performance Benchmark Complete');
    console.log('========================================');
    console.log('\nKey Performance Targets:');
    console.log(`  - Order Creation: <${TARGETS.SMART_LIMIT_ORDER}ms (P95)`);
    console.log(`  - Market Order: <${TARGETS.SMART_MARKET_ORDER}ms (P95)`);
    console.log(`  - Account Lock: <${TARGETS.ACCOUNT_LOCK}ms (P95)`);
    console.log(`  - Rate Limit Check: <${TARGETS.RATE_LIMIT_CHECK}ms (P95)`);
    console.log(`  - Nonce Operation: <${TARGETS.NONCE_OPERATION}ms (P95)`);
    console.log('\nNote: Tests use mock exchange with minimal network delay.');
    console.log('Production latency will include actual network round-trip time.');
    console.log('\n');
  });
});
