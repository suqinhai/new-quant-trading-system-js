/**
 * 性能监控测试
 * Performance Monitoring Tests
 * @module tests/unit/monitoring.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceMonitor, MetricsCollector, MetricType } from '../../src/monitoring/index.js';

// ============================================
// PerformanceMonitor 测试
// ============================================

describe('PerformanceMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor({
      sampleInterval: 100,
      historySize: 50,
    });
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  describe('初始化', () => {
    it('应该正确初始化', () => {
      expect(monitor).toBeDefined();
      expect(monitor.systemInfo).toBeDefined();
      expect(monitor.systemInfo.platform).toBeDefined();
      expect(monitor.systemInfo.nodeVersion).toBeDefined();
    });

    it('应该获取系统信息', () => {
      expect(monitor.systemInfo.cpus).toBeGreaterThan(0);
      expect(monitor.systemInfo.totalMemory).toBeGreaterThan(0);
    });
  });

  describe('启动和停止', () => {
    it('应该能够启动和停止', () => {
      const startHandler = vi.fn();
      const stopHandler = vi.fn();

      monitor.on('started', startHandler);
      monitor.on('stopped', stopHandler);

      monitor.start();
      expect(startHandler).toHaveBeenCalledTimes(1);

      monitor.stop();
      expect(stopHandler).toHaveBeenCalledTimes(1);
    });

    it('应该在启动时收集样本', async () => {
      const sampleHandler = vi.fn();
      monitor.on('sample', sampleHandler);

      monitor.start();

      // 等待初始采样
      await new Promise(r => setTimeout(r, 50));

      expect(sampleHandler).toHaveBeenCalled();
      expect(sampleHandler.mock.calls[0][0].memory).toBeDefined();
      expect(sampleHandler.mock.calls[0][0].cpu).toBeDefined();
    });
  });

  describe('计时器', () => {
    it('应该正确计时操作', () => {
      const stop = monitor.startTimer('test-operation');

      // 模拟一些工作
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait
      }

      const duration = stop();
      expect(duration).toBeGreaterThan(5);
      expect(duration).toBeLessThan(100);
    });

    it('应该记录多个计时', () => {
      monitor.recordTiming('api-call', 10);
      monitor.recordTiming('api-call', 20);
      monitor.recordTiming('api-call', 30);

      const stats = monitor.getTimingStats('api-call');
      expect(stats.count).toBe(3);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(30);
      expect(stats.mean).toBe(20);
    });

    it('应该计算百分位数', () => {
      // 插入 100 个值
      for (let i = 1; i <= 100; i++) {
        monitor.recordTiming('percentile-test', i);
      }

      const stats = monitor.getTimingStats('percentile-test');
      // 允许 1 的误差因为索引计算的舍入
      expect(stats.p50).toBeGreaterThanOrEqual(49);
      expect(stats.p50).toBeLessThanOrEqual(51);
      expect(stats.p90).toBeGreaterThanOrEqual(89);
      expect(stats.p90).toBeLessThanOrEqual(91);
      expect(stats.p95).toBeGreaterThanOrEqual(94);
      expect(stats.p95).toBeLessThanOrEqual(96);
      expect(stats.p99).toBeGreaterThanOrEqual(98);
      expect(stats.p99).toBeLessThanOrEqual(100);
    });

    it('应该支持异步计时', async () => {
      const result = await monitor.timeAsync('async-op', async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'done';
      });

      expect(result).toBe('done');

      const stats = monitor.getTimingStats('async-op');
      expect(stats.count).toBe(1);
      expect(stats.mean).toBeGreaterThan(5);
    });

    it('应该支持同步计时', () => {
      const result = monitor.timeSync('sync-op', () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });

      expect(result).toBe(499500);

      const stats = monitor.getTimingStats('sync-op');
      expect(stats.count).toBe(1);
    });
  });

  describe('计数器', () => {
    it('应该正确增加计数', () => {
      monitor.increment('requests');
      monitor.increment('requests');
      monitor.increment('requests', 5);

      expect(monitor.getCounter('requests')).toBe(7);
    });

    it('应该正确减少计数', () => {
      monitor.increment('connections', 10);
      monitor.decrement('connections', 3);

      expect(monitor.getCounter('connections')).toBe(7);
    });

    it('应该返回所有计数器', () => {
      monitor.increment('counter1', 5);
      monitor.increment('counter2', 10);

      const counters = monitor.getAllCounters();
      expect(counters.counter1).toBe(5);
      expect(counters.counter2).toBe(10);
    });
  });

  describe('仪表', () => {
    it('应该正确设置仪表值', () => {
      monitor.setGauge('temperature', 25.5);
      expect(monitor.getGauge('temperature')).toBe(25.5);

      monitor.setGauge('temperature', 30);
      expect(monitor.getGauge('temperature')).toBe(30);
    });

    it('应该返回所有仪表', () => {
      monitor.setGauge('gauge1', 100);
      monitor.setGauge('gauge2', 200);

      const gauges = monitor.getAllGauges();
      expect(gauges.gauge1.value).toBe(100);
      expect(gauges.gauge2.value).toBe(200);
    });
  });

  describe('内存监控', () => {
    it('应该收集内存历史', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 250));

      const history = monitor.getMemoryHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].heapUsed).toBeGreaterThan(0);
      expect(history[0].heapTotal).toBeGreaterThan(0);
    });
  });

  describe('CPU 监控', () => {
    it('应该收集 CPU 历史', async () => {
      monitor.start();
      await new Promise(r => setTimeout(r, 250));

      const history = monitor.getCpuHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].userPercent).toBeDefined();
      expect(history[0].systemPercent).toBeDefined();
    });
  });

  describe('快照', () => {
    it('应该返回完整快照', () => {
      monitor.increment('test-counter', 5);
      monitor.setGauge('test-gauge', 100);
      monitor.recordTiming('test-timing', 50);

      const snapshot = monitor.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.uptime).toBeGreaterThanOrEqual(0);
      expect(snapshot.system).toBeDefined();
      expect(snapshot.memory).toBeDefined();
      expect(snapshot.cpu).toBeDefined();
      expect(snapshot.counters['test-counter']).toBe(5);
      expect(snapshot.gauges['test-gauge'].value).toBe(100);
      expect(snapshot.timings['test-timing']).toBeDefined();
    });

    it('应该返回摘要', () => {
      const summary = monitor.getSummary();

      expect(summary.uptime).toBeGreaterThanOrEqual(0);
      expect(summary.uptimeFormatted).toBeDefined();
      expect(summary.memoryUsedMB).toBeGreaterThan(0);
      expect(summary.memoryPercent).toBeGreaterThan(0);
    });
  });

  describe('告警', () => {
    it('应该在超过内存阈值时发出告警', async () => {
      const alertHandler = vi.fn();
      const lowThresholdMonitor = new PerformanceMonitor({
        sampleInterval: 50,
        thresholds: {
          memoryUsagePercent: 1, // 设置非常低的阈值
        },
      });

      lowThresholdMonitor.on('alert', alertHandler);
      lowThresholdMonitor.start();

      await new Promise(r => setTimeout(r, 100));

      lowThresholdMonitor.stop();

      expect(alertHandler).toHaveBeenCalled();
      expect(alertHandler.mock.calls[0][0].type).toBe('memoryUsage');
    });
  });

  describe('重置', () => {
    it('应该重置所有指标', () => {
      monitor.increment('counter', 10);
      monitor.setGauge('gauge', 50);
      monitor.recordTiming('timing', 100);

      monitor.reset();

      expect(monitor.getCounter('counter')).toBe(0);
      expect(monitor.getGauge('gauge')).toBeNull();
      expect(monitor.getTimingStats('timing')).toBeNull();
    });
  });
});

// ============================================
// MetricsCollector 测试
// ============================================

describe('MetricsCollector', () => {
  let collector;

  beforeEach(() => {
    collector = new MetricsCollector({
      prefix: 'test',
      defaultLabels: { env: 'test' },
    });
  });

  describe('初始化', () => {
    it('应该正确初始化', () => {
      expect(collector).toBeDefined();
      expect(collector.config.prefix).toBe('test');
    });

    it('应该注册默认交易指标', () => {
      const all = collector.getAll();
      expect(all['test_orders_total']).toBeDefined();
      expect(all['test_trades_total']).toBeDefined();
      expect(all['test_positions_open']).toBeDefined();
    });
  });

  describe('计数器', () => {
    it('应该注册和增加计数器', () => {
      collector.registerCounter('custom_counter', '自定义计数器', ['type']);

      collector.inc('custom_counter', 1, { type: 'a' });
      collector.inc('custom_counter', 2, { type: 'a' });
      collector.inc('custom_counter', 1, { type: 'b' });

      expect(collector.getValue('custom_counter', { type: 'a' })).toBe(3);
      expect(collector.getValue('custom_counter', { type: 'b' })).toBe(1);
    });

    it('应该包含默认标签', () => {
      collector.registerCounter('counter_with_labels', '带标签的计数器', []);
      collector.inc('counter_with_labels', 1, {});

      const all = collector.getAll();
      const values = all['test_counter_with_labels'].values;
      expect(values[0].labels.env).toBe('test');
    });
  });

  describe('仪表', () => {
    it('应该注册和设置仪表', () => {
      collector.registerGauge('custom_gauge', '自定义仪表', ['region']);

      collector.set('custom_gauge', 100, { region: 'us' });
      collector.set('custom_gauge', 200, { region: 'eu' });

      expect(collector.getValue('custom_gauge', { region: 'us' })).toBe(100);
      expect(collector.getValue('custom_gauge', { region: 'eu' })).toBe(200);
    });

    it('应该覆盖之前的值', () => {
      collector.registerGauge('overwrite_gauge', '覆盖仪表', []);

      collector.set('overwrite_gauge', 50);
      collector.set('overwrite_gauge', 100);

      expect(collector.getValue('overwrite_gauge', {})).toBe(100);
    });
  });

  describe('直方图', () => {
    it('应该注册和观察直方图', () => {
      collector.registerHistogram('custom_histogram', '自定义直方图', ['endpoint']);

      collector.observe('custom_histogram', 0.1, { endpoint: '/api' });
      collector.observe('custom_histogram', 0.5, { endpoint: '/api' });
      collector.observe('custom_histogram', 1.0, { endpoint: '/api' });

      const stats = collector.getHistogramStats('custom_histogram', { endpoint: '/api' });
      expect(stats.count).toBe(3);
      expect(stats.sum).toBeCloseTo(1.6, 1);
      expect(stats.min).toBe(0.1);
      expect(stats.max).toBe(1.0);
    });

    it('应该计算百分位数', () => {
      collector.registerHistogram('percentile_histogram', '百分位直方图', []);

      for (let i = 1; i <= 100; i++) {
        collector.observe('percentile_histogram', i / 100);
      }

      const stats = collector.getHistogramStats('percentile_histogram', {});
      expect(stats.p50).toBeCloseTo(0.5, 1);
      expect(stats.p99).toBeCloseTo(0.99, 1);
    });
  });

  describe('计时器', () => {
    it('应该使用 startTimer 计时', async () => {
      collector.registerHistogram('timer_histogram', '计时器直方图', []);

      const stop = collector.startTimer('timer_histogram', {});
      await new Promise(r => setTimeout(r, 10));
      const duration = stop();

      expect(duration).toBeGreaterThan(0.005);

      const stats = collector.getHistogramStats('timer_histogram', {});
      expect(stats.count).toBe(1);
    });
  });

  describe('交易便捷方法', () => {
    it('应该记录订单', () => {
      collector.recordOrder({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        status: 'filled',
      });

      const value = collector.getValue('orders_total', {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        status: 'filled',
      });
      expect(value).toBe(1);
    });

    it('应该记录订单延迟', () => {
      collector.recordOrderLatency('binance', 'BTC/USDT', 'limit', 150);

      const stats = collector.getHistogramStats('order_latency_seconds', {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        type: 'limit',
      });
      expect(stats.count).toBe(1);
      expect(stats.sum).toBeCloseTo(0.15, 2);
    });

    it('应该记录交易', () => {
      collector.recordTrade({
        exchange: 'binance',
        symbol: 'ETH/USDT',
        side: 'sell',
        amount: 1.5,
        fee: 0.003,
        feeCurrency: 'ETH',
        realizedPnl: 50,
        strategy: 'macd',
      });

      expect(collector.getValue('trades_total', {
        exchange: 'binance',
        symbol: 'ETH/USDT',
        side: 'sell',
      })).toBe(1);

      expect(collector.getValue('trade_volume_total', {
        exchange: 'binance',
        symbol: 'ETH/USDT',
      })).toBe(1.5);

      expect(collector.getValue('fees_total', {
        exchange: 'binance',
        currency: 'ETH',
      })).toBe(0.003);

      expect(collector.getValue('realized_pnl_total', {
        exchange: 'binance',
        strategy: 'macd',
      })).toBe(50);
    });

    it('应该更新持仓指标', () => {
      collector.updatePosition({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        side: 'long',
        amount: 0.5,
        currentPrice: 50000,
        unrealizedPnl: 100,
      });

      expect(collector.getValue('positions_open', {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        side: 'long',
      })).toBe(0.5);

      expect(collector.getValue('position_value', {
        exchange: 'binance',
        symbol: 'BTC/USDT',
      })).toBe(25000);

      expect(collector.getValue('unrealized_pnl', {
        exchange: 'binance',
        symbol: 'BTC/USDT',
      })).toBe(100);
    });

    it('应该记录信号', () => {
      collector.recordSignal({
        strategy: 'rsi',
        type: 'buy',
      });

      expect(collector.getValue('signals_total', {
        strategy: 'rsi',
        type: 'buy',
      })).toBe(1);
    });

    it('应该记录交易所错误', () => {
      collector.recordExchangeError('binance', 'rate_limit');
      collector.recordExchangeError('binance', 'rate_limit');

      expect(collector.getValue('exchange_errors_total', {
        exchange: 'binance',
        error_type: 'rate_limit',
      })).toBe(2);
    });

    it('应该记录交易所请求', () => {
      collector.recordExchangeRequest('binance', 'fetchTicker', 50);
      collector.recordExchangeRequest('binance', 'fetchTicker', 100);

      const stats = collector.getHistogramStats('exchange_request_duration_seconds', {
        exchange: 'binance',
        method: 'fetchTicker',
      });
      expect(stats.count).toBe(2);
      expect(stats.mean).toBeCloseTo(0.075, 3);
    });
  });

  describe('Prometheus 导出', () => {
    it('应该导出 Prometheus 格式', () => {
      collector.registerCounter('prom_counter', '测试计数器', ['label1']);
      collector.inc('prom_counter', 5, { label1: 'value1' });

      const output = collector.toPrometheus();

      expect(output).toContain('# HELP test_prom_counter 测试计数器');
      expect(output).toContain('# TYPE test_prom_counter counter');
      expect(output).toContain('test_prom_counter{');
      expect(output).toContain('label1="value1"');
    });

    it('应该导出直方图桶', () => {
      collector.registerHistogram('prom_histogram', '测试直方图', []);
      collector.observe('prom_histogram', 0.5);

      const output = collector.toPrometheus();

      expect(output).toContain('# TYPE test_prom_histogram histogram');
      expect(output).toContain('test_prom_histogram_bucket');
      expect(output).toContain('test_prom_histogram_sum');
      expect(output).toContain('test_prom_histogram_count');
    });
  });

  describe('重置', () => {
    it('应该重置所有指标', () => {
      collector.inc('orders_total', 10, { exchange: 'test', symbol: 'BTC', side: 'buy', type: 'limit', status: 'filled' });

      collector.reset();

      const all = collector.getAll();
      for (const metric of Object.values(all)) {
        expect(metric.values.length).toBe(0);
      }
    });

    it('应该重置特定指标', () => {
      collector.inc('orders_total', 10, { exchange: 'test', symbol: 'BTC', side: 'buy', type: 'limit', status: 'filled' });
      collector.inc('trades_total', 5, { exchange: 'test', symbol: 'BTC', side: 'buy' });

      collector.resetMetric('orders_total');

      const all = collector.getAll();
      expect(all['test_orders_total'].values.length).toBe(0);
      expect(all['test_trades_total'].values.length).toBe(1);
    });
  });

  describe('事件', () => {
    it('应该在指标变化时发出事件', () => {
      const handler = vi.fn();
      collector.on('metric', handler);

      collector.registerCounter('event_counter', '事件计数器', []);
      collector.inc('event_counter', 1);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].type).toBe('inc');
    });
  });
});

// ============================================
// 集成测试
// ============================================

describe('监控模块集成测试', () => {
  let monitor;
  let collector;

  beforeEach(() => {
    monitor = new PerformanceMonitor({ sampleInterval: 50 });
    collector = new MetricsCollector({ prefix: 'integration' });
  });

  afterEach(() => {
    monitor.stop();
  });

  it('应该同时使用两个监控器', async () => {
    monitor.start();

    // 使用性能监控器
    const stop = monitor.startTimer('operation');
    await new Promise(r => setTimeout(r, 10));
    stop();

    // 使用指标收集器
    collector.recordOrder({
      exchange: 'test',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      status: 'filled',
    });

    // 验证两个都工作
    expect(monitor.getTimingStats('operation').count).toBe(1);
    expect(collector.getValue('orders_total', {
      exchange: 'test',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      status: 'filled',
    })).toBe(1);
  });

  it('应该跟踪完整的交易流程', async () => {
    // 模拟订单创建
    const orderStart = collector.startTimer('order_latency_seconds', {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      type: 'limit',
    });

    await new Promise(r => setTimeout(r, 5));

    // 订单完成
    orderStart();

    collector.recordOrder({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      status: 'filled',
    });

    // 交易记录
    collector.recordTrade({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: 0.1,
      fee: 0.0001,
      feeCurrency: 'BTC',
    });

    // 更新持仓
    collector.updatePosition({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'long',
      amount: 0.1,
      currentPrice: 50000,
      unrealizedPnl: 0,
    });

    // 验证所有指标
    expect(collector.getValue('orders_total', {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      status: 'filled',
    })).toBe(1);

    expect(collector.getValue('trades_total', {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'buy',
    })).toBe(1);

    expect(collector.getValue('positions_open', {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      side: 'long',
    })).toBe(0.1);

    const latencyStats = collector.getHistogramStats('order_latency_seconds', {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      type: 'limit',
    });
    expect(latencyStats.count).toBe(1);
    expect(latencyStats.mean).toBeGreaterThan(0);
  });
});
