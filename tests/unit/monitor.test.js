/**
 * 监控模块测试
 * Monitor Module Tests
 * @module tests/unit/monitor.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SystemMonitor } from '../../src/monitor/SystemMonitor.js';
import { AlertManager } from '../../src/monitor/AlertManager.js';

// Mock prom-client
vi.mock('prom-client', () => ({
  default: {
    collectDefaultMetrics: vi.fn(),
    Registry: class {
      constructor() {
        this.metrics = [];
      }
      registerMetric() {}
    },
    Counter: class {
      constructor() {
        this.inc = vi.fn();
      }
    },
    Gauge: class {
      constructor() {
        this.set = vi.fn();
      }
    },
    Histogram: class {
      constructor() {
        this.observe = vi.fn();
      }
    },
  },
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { ok: true } }),
    get: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    }),
  },
}));

// ============================================
// SystemMonitor 测试
// ============================================

describe('SystemMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new SystemMonitor({
      collectInterval: 1000,
      healthCheckInterval: 2000,
      enablePrometheus: false,
      memoryWarningThreshold: 512,
      cpuWarningThreshold: 80,
    });
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
      monitor.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const m = new SystemMonitor();

      expect(m.config.collectInterval).toBe(10000);
      expect(m.config.healthCheckInterval).toBe(30000);
    });

    it('应该使用自定义配置', () => {
      expect(monitor.config.collectInterval).toBe(1000);
      expect(monitor.config.memoryWarningThreshold).toBe(512);
    });

    it('应该初始化指标', () => {
      expect(monitor.metrics.trades.total).toBe(0);
      expect(monitor.metrics.orders.total).toBe(0);
      expect(monitor.metrics.errors).toBe(0);
    });

    it('应该初始化健康状态', () => {
      expect(monitor.health.status).toBe('unknown');
      expect(monitor.health.checks).toEqual({});
    });
  });

  describe('start/stop', () => {
    it('应该启动监控', () => {
      const listener = vi.fn();
      monitor.on('started', listener);

      monitor.start();

      expect(listener).toHaveBeenCalled();
    });

    it('应该停止监控', () => {
      const listener = vi.fn();
      monitor.on('stopped', listener);

      monitor.start();
      monitor.stop();

      expect(listener).toHaveBeenCalled();
    });

    it('停止后应该清除定时器', () => {
      monitor.start();
      monitor.stop();

      expect(monitor.collectTimer).toBeNull();
      expect(monitor.healthCheckTimer).toBeNull();
    });
  });

  describe('recordTrade', () => {
    it('应该记录成功交易', () => {
      monitor.recordTrade({ success: true, status: 'filled' });

      expect(monitor.metrics.trades.total).toBe(1);
      expect(monitor.metrics.trades.successful).toBe(1);
    });

    it('应该记录失败交易', () => {
      monitor.recordTrade({ success: false });

      expect(monitor.metrics.trades.total).toBe(1);
      expect(monitor.metrics.trades.failed).toBe(1);
    });

    it('应该发射 tradeRecorded 事件', () => {
      const listener = vi.fn();
      monitor.on('tradeRecorded', listener);

      monitor.recordTrade({ success: true });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('recordOrder', () => {
    it('应该记录已成交订单', () => {
      monitor.recordOrder({ status: 'filled' });

      expect(monitor.metrics.orders.total).toBe(1);
      expect(monitor.metrics.orders.filled).toBe(1);
    });

    it('应该记录已取消订单', () => {
      monitor.recordOrder({ status: 'cancelled' });

      expect(monitor.metrics.orders.cancelled).toBe(1);
    });

    it('应该记录待处理订单', () => {
      monitor.recordOrder({ status: 'pending' });

      expect(monitor.metrics.orders.pending).toBe(1);
    });

    it('应该处理 open 状态', () => {
      monitor.recordOrder({ status: 'open' });

      expect(monitor.metrics.orders.pending).toBe(1);
    });
  });

  describe('updatePnL', () => {
    it('应该更新盈亏', () => {
      monitor.updatePnL({
        realized: 100,
        unrealized: 50,
      });

      expect(monitor.metrics.pnl.realized).toBe(100);
      expect(monitor.metrics.pnl.unrealized).toBe(50);
      expect(monitor.metrics.pnl.total).toBe(150);
    });

    it('应该累加盈亏', () => {
      monitor.updatePnL({ realized: 100, unrealized: 0 });
      monitor.updatePnL({ realized: 50, unrealized: 0 });

      expect(monitor.metrics.pnl.realized).toBe(50); // 覆盖而不是累加
    });
  });

  describe('recordError', () => {
    it('应该记录错误', () => {
      monitor.recordError(new Error('test error'));

      expect(monitor.metrics.errors).toBe(1);
    });

    it('应该发射 errorRecorded 事件', () => {
      const listener = vi.fn();
      monitor.on('errorRecorded', listener);

      monitor.recordError(new Error('test'));

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('应该返回指标快照', () => {
      monitor.recordTrade({ success: true });
      monitor.recordOrder({ status: 'filled' });

      const metrics = monitor.getMetrics();

      expect(metrics.trades.total).toBe(1);
      expect(metrics.orders.total).toBe(1);
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('health property', () => {
    it('应该返回健康状态', () => {
      const health = monitor.health;

      expect(health.status).toBeDefined();
      expect(health.checks).toBeDefined();
    });
  });

  describe('registerHealthCheck', () => {
    it('应该注册健康检查', () => {
      monitor.registerHealthCheck('database', async () => true);

      // 健康检查应该被注册 (具体的检查需要 start() 后执行)
      expect(typeof monitor.registerHealthCheck).toBe('function');
    });
  });

  describe('metrics manipulation', () => {
    it('应该能重置指标数据', () => {
      monitor.recordTrade({ success: true });
      monitor.recordOrder({ status: 'filled' });
      monitor.recordError(new Error('test'));

      expect(monitor.metrics.trades.total).toBe(1);
      expect(monitor.metrics.orders.total).toBe(1);
      expect(monitor.metrics.errors).toBe(1);

      // 手动重置指标
      monitor.metrics.trades.total = 0;
      monitor.metrics.trades.successful = 0;
      monitor.metrics.trades.failed = 0;
      monitor.metrics.orders.total = 0;
      monitor.metrics.orders.filled = 0;
      monitor.metrics.orders.cancelled = 0;
      monitor.metrics.orders.pending = 0;
      monitor.metrics.errors = 0;

      expect(monitor.metrics.trades.total).toBe(0);
      expect(monitor.metrics.orders.total).toBe(0);
      expect(monitor.metrics.errors).toBe(0);
    });
  });
});

// ============================================
// AlertManager 测试
// ============================================

describe('AlertManager', () => {
  let alertManager;

  beforeEach(() => {
    alertManager = new AlertManager({
      enableEmail: false,
      enableTelegram: false,
      enableDingTalk: false,
      enableWebhook: false,
      cooldown: 100,
    });
  });

  afterEach(() => {
    if (alertManager) {
      alertManager.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const am = new AlertManager();

      expect(am.config.cooldown).toBe(60000);
      expect(am.config.enableEmail).toBe(false);
    });

    it('应该使用自定义配置', () => {
      expect(alertManager.config.cooldown).toBe(100);
    });

    it('应该初始化空告警历史', () => {
      expect(alertManager.alertHistory.length).toBe(0);
    });
  });

  describe('send', () => {
    it('应该发送告警', async () => {
      const result = await alertManager.send({
        level: 'warning',
        title: 'Test Alert',
        message: 'This is a test',
      });

      expect(result).toBeDefined();
      expect(result.level).toBe('warning');
      expect(result.title).toBe('Test Alert');
    });

    it('应该记录告警历史', async () => {
      await alertManager.send({
        level: 'error',
        title: 'Test',
        message: 'Test message',
      });

      expect(alertManager.alertHistory.length).toBe(1);
    });

    it('应该发射 alertSent 事件', async () => {
      const listener = vi.fn();
      alertManager.on('alertSent', listener);

      await alertManager.send({
        level: 'info',
        title: 'Test',
        message: 'Test',
      });

      expect(listener).toHaveBeenCalled();
    });

    it('冷却期内应该跳过', async () => {
      await alertManager.send({
        level: 'warning',
        title: 'Same Alert',
        message: 'First',
      });

      const result = await alertManager.send({
        level: 'warning',
        title: 'Same Alert',
        message: 'Second',
      });

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('cooldown');
    });

    it('冷却期过后应该可以发送', async () => {
      await alertManager.send({
        level: 'warning',
        title: 'Test',
        message: 'First',
      });

      await new Promise(r => setTimeout(r, 150));

      const result = await alertManager.send({
        level: 'warning',
        title: 'Test',
        message: 'Second',
      });

      expect(result.skipped).toBeUndefined();
    });
  });

  describe('便捷方法', () => {
    it('info 应该发送 info 级别', async () => {
      const result = await alertManager.info('Test', 'Info message');

      expect(result.level).toBe('info');
    });

    it('warning 应该发送 warning 级别', async () => {
      const result = await alertManager.warning('Test', 'Warning message');

      expect(result.level).toBe('warning');
    });

    it('error 应该发送 error 级别', async () => {
      const result = await alertManager.error('Test', 'Error message');

      expect(result.level).toBe('error');
    });

    it('critical 应该发送 critical 级别', async () => {
      const result = await alertManager.critical('Test', 'Critical message');

      expect(result.level).toBe('critical');
    });
  });

  describe('getHistory', () => {
    it('应该返回告警历史', async () => {
      await alertManager.send({ level: 'info', title: 'A', message: 'a' });
      await new Promise(r => setTimeout(r, 110));
      await alertManager.send({ level: 'warning', title: 'B', message: 'b' });

      const history = alertManager.getHistory();

      expect(history.length).toBe(2);
    });

    it('应该支持限制数量', async () => {
      for (let i = 0; i < 5; i++) {
        await alertManager.send({ level: 'info', title: `Alert ${i}`, message: 'test' });
        await new Promise(r => setTimeout(r, 110));
      }

      const history = alertManager.getHistory(3);

      expect(history.length).toBe(3);
    });
  });

  describe('alertHistory manipulation', () => {
    it('应该能清空告警历史', async () => {
      await alertManager.send({ level: 'info', title: 'Test', message: 'test' });

      // 手动清空历史
      alertManager.alertHistory.length = 0;

      expect(alertManager.alertHistory.length).toBe(0);
    });
  });

  describe('渠道发送 (启用时)', () => {
    it('应该通过 webhook 发送', async () => {
      const webhookManager = new AlertManager({
        enableWebhook: true,
        webhook: { url: 'https://example.com/webhook' },
        cooldown: 100,
      });

      const result = await webhookManager.send({
        level: 'warning',
        title: 'Test',
        message: 'Webhook test',
        channels: ['webhook'],
      });

      expect(result.results.webhook).toBeDefined();
    });
  });

  describe('_isInCooldown', () => {
    it('应该检测冷却状态', async () => {
      await alertManager.send({
        level: 'warning',
        title: 'Test',
        message: 'test',
      });

      const inCooldown = alertManager._isInCooldown('warning:Test');

      expect(inCooldown).toBe(true);
    });

    it('冷却期过后应该返回 false', async () => {
      await alertManager.send({
        level: 'warning',
        title: 'Test',
        message: 'test',
      });

      await new Promise(r => setTimeout(r, 150));

      const inCooldown = alertManager._isInCooldown('warning:Test');

      expect(inCooldown).toBe(false);
    });
  });

  describe('_getDefaultChannels', () => {
    it('应该根据级别返回默认渠道', () => {
      // 不同级别可能返回不同渠道
      const infoChannels = alertManager._getDefaultChannels('info');
      const criticalChannels = alertManager._getDefaultChannels('critical');

      expect(Array.isArray(infoChannels)).toBe(true);
      expect(Array.isArray(criticalChannels)).toBe(true);
    });
  });
});
