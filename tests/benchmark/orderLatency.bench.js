/**
 * 订单延迟性能基准测试
 * Order Latency Performance Benchmark Tests
 *
 * 目标: 订单延迟 < 100ms
 * Target: Order latency < 100ms
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import EventEmitter from 'eventemitter3';

// ============================================
// 性能常量定义 / Performance Constants
// ============================================

/**
 * 性能目标 (毫秒)
 * Performance targets (milliseconds)
 */
const PERFORMANCE_TARGETS = {
  // 订单创建延迟目标 / Order creation latency target
  ORDER_CREATION: 100,

  // 订单取消延迟目标 / Order cancellation latency target
  ORDER_CANCELLATION: 50,

  // 市价单执行延迟目标 / Market order execution latency target
  MARKET_ORDER: 100,

  // 限价单执行延迟目标 / Limit order execution latency target
  LIMIT_ORDER: 100,

  // 批量订单延迟目标 (单个订单平均) / Batch order latency target (per order average)
  BATCH_ORDER: 150,

  // 队列处理延迟目标 / Queue processing latency target
  QUEUE_PROCESSING: 20,

  // Nonce 生成延迟目标 / Nonce generation latency target
  NONCE_GENERATION: 1,

  // 错误分析延迟目标 / Error analysis latency target
  ERROR_ANALYSIS: 5,
};

/**
 * 测试配置
 * Test configuration
 */
const TEST_CONFIG = {
  // 每个测试的迭代次数 / Iterations per test
  iterations: 100,

  // 预热迭代次数 / Warmup iterations
  warmupIterations: 10,

  // 延迟百分位数 / Latency percentiles
  percentiles: [50, 90, 95, 99],
};

// ============================================
// 模拟交易所类 / Mock Exchange Class
// ============================================

/**
 * 模拟交易所
 * Mock Exchange for isolated testing
 */
class MockExchange {
  constructor(config = {}) {
    this.name = 'mock';
    this.config = {
      // 模拟网络延迟 (毫秒) / Simulated network delay (ms)
      networkDelay: config.networkDelay || 5,
      // 模拟失败率 / Simulated failure rate
      failureRate: config.failureRate || 0,
      ...config,
    };
    this.orderCounter = 0;
    this.orders = new Map();
  }

  /**
   * 模拟创建订单
   * Simulate order creation
   */
  async createOrder(symbol, type, side, amount, price, params = {}) {
    // 模拟网络延迟 / Simulate network delay
    await this._simulateDelay();

    // 模拟随机失败 / Simulate random failure
    if (Math.random() < this.config.failureRate) {
      throw new Error('Simulated exchange error');
    }

    // 创建订单 / Create order
    const orderId = `mock_${++this.orderCounter}_${Date.now()}`;
    const order = {
      id: orderId,
      clientOrderId: params.clientOrderId || null,
      symbol,
      type,
      side,
      amount,
      price,
      filled: type === 'market' ? amount : 0,
      remaining: type === 'market' ? 0 : amount,
      average: price,
      status: type === 'market' ? 'closed' : 'open',
      timestamp: Date.now(),
    };

    this.orders.set(orderId, order);
    return order;
  }

  /**
   * 模拟取消订单
   * Simulate order cancellation
   */
  async cancelOrder(orderId, symbol) {
    await this._simulateDelay();

    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    order.status = 'canceled';
    return order;
  }

  /**
   * 模拟获取订单
   * Simulate fetch order
   */
  async fetchOrder(orderId, symbol) {
    await this._simulateDelay();

    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    return order;
  }

  /**
   * 模拟获取行情
   * Simulate fetch ticker
   */
  async fetchTicker(symbol) {
    await this._simulateDelay();

    return {
      symbol,
      last: 50000,
      bid: 49999,
      ask: 50001,
      timestamp: Date.now(),
    };
  }

  /**
   * 模拟获取服务器时间
   * Simulate fetch time
   */
  async fetchTime() {
    await this._simulateDelay();
    return Date.now();
  }

  /**
   * 模拟延迟
   * Simulate delay
   */
  async _simulateDelay() {
    const delay = this.config.networkDelay;
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * 重置状态
   * Reset state
   */
  reset() {
    this.orderCounter = 0;
    this.orders.clear();
  }
}

// ============================================
// 性能测试工具类 / Performance Testing Utilities
// ============================================

/**
 * 高精度计时器
 * High-resolution timer
 */
class PerformanceTimer {
  constructor() {
    this.measurements = [];
    this.startTime = null;
  }

  /**
   * 开始计时
   * Start timing
   */
  start() {
    this.startTime = performance.now();
  }

  /**
   * 结束计时并记录
   * End timing and record
   */
  end() {
    if (this.startTime === null) {
      throw new Error('Timer not started');
    }
    const elapsed = performance.now() - this.startTime;
    this.measurements.push(elapsed);
    this.startTime = null;
    return elapsed;
  }

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats() {
    if (this.measurements.length === 0) {
      return null;
    }

    const sorted = [...this.measurements].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const avg = sum / sorted.length;

    // 计算百分位数 / Calculate percentiles
    const percentiles = {};
    for (const p of TEST_CONFIG.percentiles) {
      const index = Math.floor((p / 100) * sorted.length);
      percentiles[`p${p}`] = sorted[Math.min(index, sorted.length - 1)];
    }

    return {
      count: sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg,
      ...percentiles,
      measurements: sorted,
    };
  }

  /**
   * 重置
   * Reset
   */
  reset() {
    this.measurements = [];
    this.startTime = null;
  }
}

/**
 * 运行基准测试
 * Run benchmark
 *
 * @param {Function} fn - 要测试的函数 / Function to test
 * @param {Object} options - 选项 / Options
 * @returns {Object} 统计信息 / Statistics
 */
async function runBenchmark(fn, options = {}) {
  const {
    iterations = TEST_CONFIG.iterations,
    warmupIterations = TEST_CONFIG.warmupIterations,
  } = options;

  const timer = new PerformanceTimer();

  // 预热阶段 / Warmup phase
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  // 正式测试阶段 / Actual test phase
  for (let i = 0; i < iterations; i++) {
    timer.start();
    await fn();
    timer.end();
  }

  return timer.getStats();
}

/**
 * 断言性能目标
 * Assert performance target
 *
 * @param {Object} stats - 统计信息 / Statistics
 * @param {number} target - 目标延迟 (毫秒) / Target latency (ms)
 * @param {string} name - 测试名称 / Test name
 */
function assertPerformanceTarget(stats, target, name) {
  // 使用 P95 作为主要指标 / Use P95 as primary metric
  const p95 = stats.p95;

  console.log(`  ${name} Performance:`);
  console.log(`    Min: ${stats.min.toFixed(3)}ms`);
  console.log(`    Avg: ${stats.avg.toFixed(3)}ms`);
  console.log(`    P50: ${stats.p50.toFixed(3)}ms`);
  console.log(`    P90: ${stats.p90.toFixed(3)}ms`);
  console.log(`    P95: ${stats.p95.toFixed(3)}ms`);
  console.log(`    P99: ${stats.p99.toFixed(3)}ms`);
  console.log(`    Max: ${stats.max.toFixed(3)}ms`);
  console.log(`    Target: <${target}ms (P95)`);
  console.log(`    Status: ${p95 <= target ? 'PASS' : 'FAIL'}`);

  assert.ok(
    p95 <= target,
    `${name}: P95 latency ${p95.toFixed(3)}ms exceeds target ${target}ms`
  );
}

// ============================================
// 基准测试套件 / Benchmark Test Suites
// ============================================

describe('Order Latency Benchmarks', () => {
  let mockExchange;

  before(() => {
    console.log('\n========================================');
    console.log('Order Latency Performance Benchmarks');
    console.log('========================================\n');
    console.log(`Iterations per test: ${TEST_CONFIG.iterations}`);
    console.log(`Warmup iterations: ${TEST_CONFIG.warmupIterations}`);
    console.log(`Performance targets:`);
    Object.entries(PERFORMANCE_TARGETS).forEach(([key, value]) => {
      console.log(`  - ${key}: <${value}ms`);
    });
    console.log('\n');
  });

  beforeEach(() => {
    // 创建新的模拟交易所实例 / Create new mock exchange instance
    mockExchange = new MockExchange({ networkDelay: 2 });
  });

  afterEach(() => {
    // 重置模拟交易所 / Reset mock exchange
    mockExchange.reset();
  });

  describe('Core Order Operations', () => {
    it('should create orders within 100ms (P95)', async () => {
      const stats = await runBenchmark(async () => {
        await mockExchange.createOrder(
          'BTC/USDT',
          'limit',
          'buy',
          0.01,
          50000,
          { clientOrderId: `test_${Date.now()}` }
        );
      });

      assertPerformanceTarget(stats, PERFORMANCE_TARGETS.ORDER_CREATION, 'Order Creation');
    });

    it('should cancel orders within 50ms (P95)', async () => {
      // 预先创建一些订单 / Pre-create some orders
      const orderIds = [];
      for (let i = 0; i < TEST_CONFIG.iterations + TEST_CONFIG.warmupIterations; i++) {
        const order = await mockExchange.createOrder(
          'BTC/USDT',
          'limit',
          'buy',
          0.01,
          50000
        );
        orderIds.push(order.id);
      }

      let index = 0;
      const stats = await runBenchmark(async () => {
        await mockExchange.cancelOrder(orderIds[index++], 'BTC/USDT');
      });

      assertPerformanceTarget(stats, PERFORMANCE_TARGETS.ORDER_CANCELLATION, 'Order Cancellation');
    });

    it('should execute market orders within 100ms (P95)', async () => {
      const stats = await runBenchmark(async () => {
        await mockExchange.createOrder(
          'BTC/USDT',
          'market',
          'buy',
          0.01,
          undefined
        );
      });

      assertPerformanceTarget(stats, PERFORMANCE_TARGETS.MARKET_ORDER, 'Market Order');
    });

    it('should execute limit orders within 100ms (P95)', async () => {
      const stats = await runBenchmark(async () => {
        await mockExchange.createOrder(
          'BTC/USDT',
          'limit',
          'sell',
          0.01,
          51000,
          { postOnly: true }
        );
      });

      assertPerformanceTarget(stats, PERFORMANCE_TARGETS.LIMIT_ORDER, 'Limit Order');
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch orders with acceptable per-order latency', async () => {
      const batchSize = 5;
      const timer = new PerformanceTimer();

      // 预热 / Warmup
      for (let i = 0; i < TEST_CONFIG.warmupIterations; i++) {
        const promises = [];
        for (let j = 0; j < batchSize; j++) {
          promises.push(mockExchange.createOrder(
            'BTC/USDT',
            'limit',
            j % 2 === 0 ? 'buy' : 'sell',
            0.01,
            50000 + j * 100
          ));
        }
        await Promise.all(promises);
      }

      // 正式测试 / Actual test
      for (let i = 0; i < TEST_CONFIG.iterations; i++) {
        timer.start();
        const promises = [];
        for (let j = 0; j < batchSize; j++) {
          promises.push(mockExchange.createOrder(
            'BTC/USDT',
            'limit',
            j % 2 === 0 ? 'buy' : 'sell',
            0.01,
            50000 + j * 100
          ));
        }
        await Promise.all(promises);
        const elapsed = timer.end();
        // 记录每个订单的平均延迟 / Record per-order average latency
        timer.measurements[timer.measurements.length - 1] = elapsed / batchSize;
      }

      const stats = timer.getStats();
      assertPerformanceTarget(stats, PERFORMANCE_TARGETS.BATCH_ORDER, 'Batch Order (per order)');
    });
  });

  describe('Queue Processing', () => {
    it('should process queue operations within 20ms (P95)', async () => {
      // 模拟队列处理 / Simulate queue processing
      const queue = [];
      for (let i = 0; i < 100; i++) {
        queue.push({ id: i, data: `task_${i}` });
      }

      const stats = await runBenchmark(async () => {
        // 模拟从队列取出任务 / Simulate taking task from queue
        const task = queue.shift();
        queue.push(task); // 放回队列 / Put back

        // 模拟任务处理 / Simulate task processing
        await new Promise(resolve => setImmediate(resolve));
      });

      assertPerformanceTarget(stats, PERFORMANCE_TARGETS.QUEUE_PROCESSING, 'Queue Processing');
    });
  });

  describe('Nonce Generation', () => {
    it('should generate nonces within 1ms (P95)', async () => {
      let lastNonce = 0;

      const stats = await runBenchmark(async () => {
        // 模拟 Nonce 生成逻辑 / Simulate nonce generation logic
        const timestamp = Date.now();
        const newNonce = Math.max(timestamp, lastNonce + 1);
        lastNonce = newNonce;
      });

      assertPerformanceTarget(stats, PERFORMANCE_TARGETS.NONCE_GENERATION, 'Nonce Generation');
    });
  });

  describe('Error Analysis', () => {
    it('should analyze errors within 5ms (P95)', async () => {
      const errors = [
        new Error('rate limit exceeded'),
        new Error('insufficient balance'),
        new Error('invalid nonce'),
        new Error('network timeout'),
        new Error('exchange unavailable'),
      ];

      const stats = await runBenchmark(async () => {
        // 模拟错误分析 / Simulate error analysis
        const error = errors[Math.floor(Math.random() * errors.length)];
        const message = (error.message || '').toLowerCase();

        // 错误分类 / Error classification
        let errorType;
        if (message.includes('rate limit') || message.includes('too many')) {
          errorType = 'RATE_LIMIT';
        } else if (message.includes('insufficient') || message.includes('balance')) {
          errorType = 'INSUFFICIENT_BALANCE';
        } else if (message.includes('nonce') || message.includes('timestamp')) {
          errorType = 'NONCE_CONFLICT';
        } else if (message.includes('network') || message.includes('timeout')) {
          errorType = 'NETWORK_ERROR';
        } else {
          errorType = 'UNKNOWN';
        }

        return errorType;
      });

      assertPerformanceTarget(stats, PERFORMANCE_TARGETS.ERROR_ANALYSIS, 'Error Analysis');
    });
  });

  describe('Event Emission', () => {
    it('should emit events within 5ms (P95)', async () => {
      const emitter = new EventEmitter();
      let eventReceived = false;

      emitter.on('orderCreated', (data) => {
        eventReceived = true;
      });

      const stats = await runBenchmark(async () => {
        eventReceived = false;
        emitter.emit('orderCreated', {
          id: 'test_order',
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.01,
          price: 50000,
          timestamp: Date.now(),
        });
        // 等待事件处理 / Wait for event processing
        await new Promise(resolve => setImmediate(resolve));
      });

      assertPerformanceTarget(stats, 5, 'Event Emission');
    });
  });
});

describe('Stress Tests', () => {
  let mockExchange;

  beforeEach(() => {
    mockExchange = new MockExchange({ networkDelay: 1 });
  });

  afterEach(() => {
    mockExchange.reset();
  });

  it('should maintain performance under high concurrency', async () => {
    const concurrency = 10;
    const operationsPerBatch = 50;
    const timer = new PerformanceTimer();

    console.log(`  Stress test: ${concurrency} concurrent batches of ${operationsPerBatch} operations`);

    for (let batch = 0; batch < TEST_CONFIG.iterations / 10; batch++) {
      timer.start();

      // 创建多个并发批次 / Create multiple concurrent batches
      const batchPromises = [];
      for (let i = 0; i < concurrency; i++) {
        const orderPromises = [];
        for (let j = 0; j < operationsPerBatch / concurrency; j++) {
          orderPromises.push(mockExchange.createOrder(
            'BTC/USDT',
            'limit',
            'buy',
            0.01,
            50000
          ));
        }
        batchPromises.push(Promise.all(orderPromises));
      }

      await Promise.all(batchPromises);
      timer.end();
    }

    const stats = timer.getStats();
    console.log(`  High Concurrency Performance:`);
    console.log(`    Min: ${stats.min.toFixed(3)}ms`);
    console.log(`    Avg: ${stats.avg.toFixed(3)}ms`);
    console.log(`    P95: ${stats.p95.toFixed(3)}ms`);
    console.log(`    Max: ${stats.max.toFixed(3)}ms`);
    console.log(`    Operations per batch: ${operationsPerBatch}`);

    // 高并发下每批次延迟应该在合理范围内 / Batch latency should be reasonable under high concurrency
    assert.ok(
      stats.avg < 500,
      `High concurrency average latency ${stats.avg.toFixed(3)}ms is too high`
    );
  });

  it('should handle rapid order creation and cancellation', async () => {
    const timer = new PerformanceTimer();

    for (let i = 0; i < TEST_CONFIG.iterations; i++) {
      timer.start();

      // 快速创建并取消订单 / Rapidly create and cancel order
      const order = await mockExchange.createOrder(
        'BTC/USDT',
        'limit',
        'buy',
        0.01,
        50000
      );
      await mockExchange.cancelOrder(order.id, 'BTC/USDT');

      timer.end();
    }

    const stats = timer.getStats();
    console.log(`  Rapid Create/Cancel Performance:`);
    console.log(`    Min: ${stats.min.toFixed(3)}ms`);
    console.log(`    Avg: ${stats.avg.toFixed(3)}ms`);
    console.log(`    P95: ${stats.p95.toFixed(3)}ms`);
    console.log(`    Max: ${stats.max.toFixed(3)}ms`);

    // 创建+取消应该在 200ms 以内完成 / Create+cancel should complete within 200ms
    assert.ok(
      stats.p95 < 200,
      `Create+Cancel P95 latency ${stats.p95.toFixed(3)}ms exceeds 200ms target`
    );
  });
});

describe('Memory Efficiency', () => {
  it('should not leak memory during order operations', async () => {
    const mockExchange = new MockExchange({ networkDelay: 0 });
    const iterations = 1000;

    // 获取初始内存使用 / Get initial memory usage
    const initialMemory = process.memoryUsage().heapUsed;

    // 执行大量订单操作 / Execute many order operations
    for (let i = 0; i < iterations; i++) {
      const order = await mockExchange.createOrder(
        'BTC/USDT',
        'limit',
        'buy',
        0.01,
        50000
      );
      await mockExchange.cancelOrder(order.id, 'BTC/USDT');
    }

    // 清理订单 / Clear orders
    mockExchange.reset();

    // 强制 GC (如果可用) / Force GC (if available)
    if (global.gc) {
      global.gc();
    }

    // 获取最终内存使用 / Get final memory usage
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024);

    console.log(`  Memory Efficiency:`);
    console.log(`    Initial heap: ${(initialMemory / (1024 * 1024)).toFixed(2)}MB`);
    console.log(`    Final heap: ${(finalMemory / (1024 * 1024)).toFixed(2)}MB`);
    console.log(`    Increase: ${memoryIncrease.toFixed(2)}MB over ${iterations} operations`);
    console.log(`    Per operation: ${((memoryIncrease * 1024) / iterations).toFixed(2)}KB`);

    // 每个操作的内存增长应该很小 / Memory growth per operation should be small
    // 允许最大 50MB 增长 / Allow max 50MB increase
    assert.ok(
      memoryIncrease < 50,
      `Memory increase ${memoryIncrease.toFixed(2)}MB exceeds 50MB limit`
    );
  });
});

describe('Performance Summary', () => {
  after(() => {
    console.log('\n========================================');
    console.log('Performance Benchmark Summary');
    console.log('========================================');
    console.log('\nAll performance targets are based on P95 latency.');
    console.log('Tests should be run on a clean system for accurate results.');
    console.log('\nRecommendations:');
    console.log('  1. Monitor P95 latency in production');
    console.log('  2. Set up alerts for latency > 100ms');
    console.log('  3. Review performance metrics regularly');
    console.log('  4. Optimize hot paths identified by benchmarks');
    console.log('\n');
  });
});
