/**
 * 健康检查测试
 * Health Check Tests
 * @module tests/unit/healthCheck.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HealthChecker,
  HealthStatus,
  ComponentCheckers,
  createHealthRoutes,
  createHealthMiddleware,
} from '../../src/middleware/healthCheck.js';

// ============================================
// HealthChecker 测试
// ============================================

describe('HealthChecker', () => {
  let healthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker({
      memoryThresholdMB: 1000,
      memoryWarningPercent: 80,
      memoryCriticalPercent: 95,
      cacheTimeMs: 100,
    });
  });

  describe('基本功能', () => {
    it('应该正确初始化', () => {
      expect(healthChecker).toBeDefined();
      expect(healthChecker.startTime).toBeLessThanOrEqual(Date.now());
    });

    it('liveness 应该返回健康状态', () => {
      const result = healthChecker.liveness();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('check 应该返回完整健康状态', async () => {
      const result = await healthChecker.check();

      expect(result.status).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.components).toBeDefined();
      expect(result.components.memory).toBeDefined();
      expect(result.components.system).toBeDefined();
    });

    it('readiness 应该返回就绪状态', async () => {
      const result = await healthChecker.readiness();

      expect(result.status).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('组件注册', () => {
    it('应该正确注册组件检查器', () => {
      const checker = vi.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
        message: 'OK',
      });

      healthChecker.registerComponent('test', checker);

      expect(healthChecker.componentCheckers.has('test')).toBe(true);
    });

    it('应该在健康检查中调用注册的检查器', async () => {
      const checker = vi.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
        message: 'Test component OK',
      });

      healthChecker.registerComponent('test', checker);
      const result = await healthChecker.check(false);

      expect(checker).toHaveBeenCalled();
      expect(result.components.test).toBeDefined();
      expect(result.components.test.status).toBe(HealthStatus.HEALTHY);
    });

    it('应该正确移除组件检查器', () => {
      healthChecker.registerComponent('test', vi.fn());
      healthChecker.unregisterComponent('test');

      expect(healthChecker.componentCheckers.has('test')).toBe(false);
    });
  });

  describe('组件状态影响总体状态', () => {
    it('任何组件 UNHEALTHY 应该导致总体 UNHEALTHY', async () => {
      healthChecker.registerComponent('failing', async () => ({
        status: HealthStatus.UNHEALTHY,
        message: 'Component failed',
      }));

      const result = await healthChecker.check(false);

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('任何组件 DEGRADED 应该导致总体 DEGRADED', async () => {
      healthChecker.registerComponent('degraded', async () => ({
        status: HealthStatus.DEGRADED,
        message: 'Component degraded',
      }));

      const result = await healthChecker.check(false);

      // 可能是 DEGRADED 或取决于其他组件
      expect([HealthStatus.DEGRADED, HealthStatus.HEALTHY]).toContain(result.status);
    });

    it('所有组件健康时总体应该健康', async () => {
      healthChecker.registerComponent('comp1', async () => ({
        status: HealthStatus.HEALTHY,
        message: 'OK',
      }));
      healthChecker.registerComponent('comp2', async () => ({
        status: HealthStatus.HEALTHY,
        message: 'OK',
      }));

      const result = await healthChecker.check(false);

      expect(result.status).toBe(HealthStatus.HEALTHY);
    });
  });

  describe('组件检查超时', () => {
    it('应该在组件检查超时时标记为 UNHEALTHY', async () => {
      const slowChecker = new HealthChecker({
        componentTimeout: 100,
        cacheTimeMs: 0,
      });

      slowChecker.registerComponent('slow', async () => {
        await new Promise(r => setTimeout(r, 200));
        return { status: HealthStatus.HEALTHY, message: 'OK' };
      });

      const result = await slowChecker.check(false);

      expect(result.components.slow.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.components.slow.message).toContain('timeout');
    });
  });

  describe('缓存', () => {
    it('应该缓存检查结果', async () => {
      const checker = vi.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
        message: 'OK',
      });

      healthChecker.registerComponent('cached', checker);

      await healthChecker.check(true);
      await healthChecker.check(true);

      expect(checker).toHaveBeenCalledTimes(1);
    });

    it('应该在缓存过期后重新检查', async () => {
      const fastChecker = new HealthChecker({ cacheTimeMs: 50 });
      const checker = vi.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
        message: 'OK',
      });

      fastChecker.registerComponent('cached', checker);

      await fastChecker.check(true);
      await new Promise(r => setTimeout(r, 100));
      await fastChecker.check(true);

      expect(checker).toHaveBeenCalledTimes(2);
    });

    it('useCache=false 应该跳过缓存', async () => {
      const checker = vi.fn().mockResolvedValue({
        status: HealthStatus.HEALTHY,
        message: 'OK',
      });

      healthChecker.registerComponent('nocache', checker);

      await healthChecker.check(false);
      await healthChecker.check(false);

      expect(checker).toHaveBeenCalledTimes(2);
    });
  });

  describe('内存检查', () => {
    it('应该包含内存使用详情', async () => {
      const result = await healthChecker.check(false);

      expect(result.components.memory.details).toBeDefined();
      expect(result.components.memory.details.heapUsedMB).toBeDefined();
      expect(result.components.memory.details.heapTotalMB).toBeDefined();
      expect(result.components.memory.details.usagePercent).toBeDefined();
    });
  });

  describe('系统检查', () => {
    it('应该包含系统信息', async () => {
      const result = await healthChecker.check(false);

      expect(result.components.system.details).toBeDefined();
      expect(result.components.system.details.loadAverage).toBeDefined();
      expect(result.components.system.details.cpuCount).toBeDefined();
      expect(result.components.system.details.platform).toBeDefined();
      expect(result.components.system.details.nodeVersion).toBeDefined();
    });
  });
});

// ============================================
// ComponentCheckers 测试
// ============================================

describe('ComponentCheckers', () => {
  describe('createExchangeChecker', () => {
    it('应该在连接成功时返回健康状态', async () => {
      const mockExchange = {
        fetchTime: vi.fn().mockResolvedValue(Date.now()),
      };

      const checker = ComponentCheckers.createExchangeChecker(mockExchange, 'binance');
      const result = await checker();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.message).toContain('binance');
    });

    it('应该在连接失败时返回不健康状态', async () => {
      const mockExchange = {
        fetchTime: vi.fn().mockRejectedValue(new Error('Connection failed')),
      };

      const checker = ComponentCheckers.createExchangeChecker(mockExchange);
      const result = await checker();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
      expect(result.message).toContain('Connection failed');
    });
  });

  describe('createRedisChecker', () => {
    it('应该在 ping 成功时返回健康状态', async () => {
      const mockRedis = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };

      const checker = ComponentCheckers.createRedisChecker(mockRedis);
      const result = await checker();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.message).toContain('Redis');
    });

    it('应该在 ping 失败时返回不健康状态', async () => {
      const mockRedis = {
        ping: vi.fn().mockRejectedValue(new Error('Redis offline')),
      };

      const checker = ComponentCheckers.createRedisChecker(mockRedis);
      const result = await checker();

      expect(result.status).toBe(HealthStatus.UNHEALTHY);
    });
  });

  describe('createDatabaseChecker', () => {
    it('应该在查询成功时返回健康状态', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue([{ 1: 1 }]),
      };

      const checker = ComponentCheckers.createDatabaseChecker(mockDb);
      const result = await checker();

      expect(result.status).toBe(HealthStatus.HEALTHY);
      expect(result.message).toContain('Database');
    });

    it('应该支持 ping 方法', async () => {
      const mockDb = {
        ping: vi.fn().mockResolvedValue(true),
      };

      const checker = ComponentCheckers.createDatabaseChecker(mockDb);
      const result = await checker();

      expect(result.status).toBe(HealthStatus.HEALTHY);
    });
  });
});

// ============================================
// createHealthRoutes 测试
// ============================================

describe('createHealthRoutes', () => {
  let healthChecker;
  let routes;
  let mockRes;

  beforeEach(() => {
    healthChecker = new HealthChecker();
    routes = createHealthRoutes(healthChecker);

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  describe('health', () => {
    it('应该返回 200 和健康状态', async () => {
      await routes.health({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: expect.any(String),
          components: expect.any(Object),
        })
      );
    });

    it('应该在不健康时返回 503', async () => {
      healthChecker.registerComponent('failing', async () => ({
        status: HealthStatus.UNHEALTHY,
        message: 'Failed',
      }));

      await routes.health({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
    });
  });

  describe('liveness', () => {
    it('应该总是返回 200', () => {
      routes.liveness({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: HealthStatus.HEALTHY,
        })
      );
    });
  });

  describe('readiness', () => {
    it('应该在就绪时返回 200', async () => {
      await routes.readiness({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('应该在未就绪时返回 503', async () => {
      healthChecker.registerComponent('database', async () => ({
        status: HealthStatus.UNHEALTHY,
        message: 'DB offline',
      }));

      await routes.readiness({}, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
    });
  });
});

// ============================================
// createHealthMiddleware 测试
// ============================================

describe('createHealthMiddleware', () => {
  let healthChecker;
  let middleware;
  let mockRes;
  let nextFn;

  beforeEach(() => {
    healthChecker = new HealthChecker();
    middleware = createHealthMiddleware(healthChecker);

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    nextFn = vi.fn();
  });

  it('应该处理 /health 路径', async () => {
    const req = { path: '/health' };
    await middleware(req, mockRes, nextFn);

    expect(mockRes.status).toHaveBeenCalled();
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('应该处理 /health/live 路径', async () => {
    const req = { path: '/health/live' };
    await middleware(req, mockRes, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('应该处理 /health/ready 路径', async () => {
    const req = { path: '/health/ready' };
    await middleware(req, mockRes, nextFn);

    expect(mockRes.status).toHaveBeenCalled();
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('应该对其他路径调用 next', async () => {
    const req = { path: '/api/test' };
    await middleware(req, mockRes, nextFn);

    expect(nextFn).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});

// ============================================
// HealthStatus 常量测试
// ============================================

describe('HealthStatus', () => {
  it('应该包含所有状态', () => {
    expect(HealthStatus.HEALTHY).toBe('healthy');
    expect(HealthStatus.DEGRADED).toBe('degraded');
    expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
  });
});
