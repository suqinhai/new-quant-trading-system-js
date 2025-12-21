/**
 * 熔断器测试
 * Circuit Breaker Tests
 * @module tests/unit/circuitBreaker.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerManager,
  CircuitState,
  wrapWithCircuitBreaker,
} from '../../src/risk/CircuitBreaker.js';

// ============================================
// CircuitBreaker 测试
// ============================================

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-breaker',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100, // 100ms for faster tests
      halfOpenMaxCalls: 2,
    });
  });

  afterEach(() => {
    breaker.removeAllListeners();
  });

  // ============================================
  // 初始状态测试
  // ============================================

  describe('初始状态', () => {
    it('应该以 CLOSED 状态启动', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isClosed()).toBe(true);
      expect(breaker.isOpen()).toBe(false);
    });

    it('应该正确初始化统计信息', () => {
      const stats = breaker.getStats();

      expect(stats.name).toBe('test-breaker');
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.totalCalls).toBe(0);
      expect(stats.successfulCalls).toBe(0);
      expect(stats.failedCalls).toBe(0);
    });
  });

  // ============================================
  // 正常执行测试
  // ============================================

  describe('正常执行', () => {
    it('应该成功执行函数并返回结果', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await breaker.execute(fn, 'arg1', 'arg2');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('应该记录成功调用', async () => {
      const fn = vi.fn().mockResolvedValue('ok');

      await breaker.execute(fn);

      const stats = breaker.getStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.successfulCalls).toBe(1);
      expect(stats.consecutiveSuccesses).toBe(1);
    });

    it('应该发射 success 事件', async () => {
      const handler = vi.fn();
      breaker.on('success', handler);

      await breaker.execute(() => Promise.resolve('ok'));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-breaker',
          state: CircuitState.CLOSED,
        })
      );
    });
  });

  // ============================================
  // 失败处理测试
  // ============================================

  describe('失败处理', () => {
    it('应该传递执行错误', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(breaker.execute(fn)).rejects.toThrow('Test error');
    });

    it('应该记录失败调用', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      try {
        await breaker.execute(fn);
      } catch {}

      const stats = breaker.getStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.failedCalls).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
    });

    it('应该发射 failure 事件', async () => {
      const handler = vi.fn();
      breaker.on('failure', handler);

      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-breaker',
          error: 'fail',
        })
      );
    });
  });

  // ============================================
  // 熔断触发测试
  // ============================================

  describe('熔断触发', () => {
    it('应该在连续失败达到阈值后熔断', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // 连续失败 3 次
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }

      expect(breaker.isOpen()).toBe(true);
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('应该在熔断时发射 trip 事件', async () => {
      const handler = vi.fn();
      breaker.on('trip', handler);

      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-breaker',
        })
      );
    });

    it('熔断后应该拒绝请求', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // 触发熔断
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }

      // 再次尝试应该被拒绝
      await expect(breaker.execute(() => Promise.resolve('ok')))
        .rejects.toThrow(CircuitBreakerError);
    });

    it('应该增加 rejectedCalls 计数', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      // 触发熔断
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }

      // 尝试请求
      try {
        await breaker.execute(() => Promise.resolve('ok'));
      } catch {}

      const stats = breaker.getStats();
      expect(stats.rejectedCalls).toBe(1);
    });
  });

  // ============================================
  // 半开状态测试
  // ============================================

  describe('半开状态', () => {
    beforeEach(async () => {
      // 触发熔断
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }
    });

    it('应该在超时后进入半开状态', async () => {
      expect(breaker.isOpen()).toBe(true);

      // 等待超时
      await new Promise(r => setTimeout(r, 150));

      // 下一次请求应该允许 (进入半开状态)
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('半开状态成功后应该恢复', async () => {
      await new Promise(r => setTimeout(r, 150));

      // 成功 2 次 (successThreshold)
      for (let i = 0; i < 2; i++) {
        await breaker.execute(() => Promise.resolve('ok'));
      }

      expect(breaker.isClosed()).toBe(true);
    });

    it('半开状态失败后应该重新熔断', async () => {
      await new Promise(r => setTimeout(r, 150));

      // 在半开状态下失败
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      expect(breaker.isOpen()).toBe(true);
    });

    it('应该限制半开状态的请求数', async () => {
      // 使用局部变量创建独立的熔断器
      // 注意: 从 OPEN 首次进入 HALF_OPEN 的调用不计入 halfOpenCalls
      // 所以 halfOpenMaxCalls=2 意味着进入半开后还能接受 2 次额外调用
      const limitBreaker = new CircuitBreaker({
        name: 'test-limit',
        failureThreshold: 3,
        successThreshold: 10, // 需要很多次成功才能恢复，确保保持在半开状态
        timeout: 100,
        halfOpenMaxCalls: 2,
      });

      // 触发熔断
      for (let i = 0; i < 3; i++) {
        try {
          await limitBreaker.execute(() => Promise.reject(new Error('fail')));
        } catch {}
      }

      expect(limitBreaker.isOpen()).toBe(true);

      // 等待超时
      await new Promise(r => setTimeout(r, 150));

      // 第一次调用 - 触发从 OPEN 进入 HALF_OPEN (不计入 halfOpenCalls)
      await limitBreaker.execute(() => Promise.resolve('ok'));
      expect(limitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // 第二次调用 - halfOpenCalls = 1
      await limitBreaker.execute(() => Promise.resolve('ok'));
      expect(limitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // 第三次调用 - halfOpenCalls = 2 (达到限制)
      await limitBreaker.execute(() => Promise.resolve('ok'));
      expect(limitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      // 第四次调用应该被拒绝 (halfOpenCalls=2 >= halfOpenMaxCalls=2)
      expect(limitBreaker.canExecute()).toBe(false);
    });
  });

  // ============================================
  // 恢复测试
  // ============================================

  describe('恢复', () => {
    it('应该在恢复时发射 stateChange 事件', async () => {
      const handler = vi.fn();
      breaker.on('stateChange', handler);

      // 触发熔断
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }

      // 等待超时并恢复
      await new Promise(r => setTimeout(r, 150));
      for (let i = 0; i < 2; i++) {
        await breaker.execute(() => Promise.resolve('ok'));
      }

      // 检查状态变化: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
      const calls = handler.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);

      // 最后一次应该是从 HALF_OPEN 到 CLOSED
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.from).toBe(CircuitState.HALF_OPEN);
      expect(lastCall.to).toBe(CircuitState.CLOSED);
    });

    it('手动 reset 应该发射 reset 事件', async () => {
      const handler = vi.fn();
      breaker.on('reset', handler);

      // 触发熔断
      breaker.trip();
      expect(breaker.isOpen()).toBe(true);

      // 手动重置
      breaker.reset();

      // reset() 调用 transitionTo(CLOSED)，但从 OPEN 到 CLOSED 会发射 reset 事件
      expect(handler).toHaveBeenCalled();
    });
  });

  // ============================================
  // 手动控制测试
  // ============================================

  describe('手动控制', () => {
    it('trip() 应该手动触发熔断', () => {
      breaker.trip();

      expect(breaker.isOpen()).toBe(true);
    });

    it('reset() 应该手动重置', async () => {
      // 触发熔断
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }

      breaker.reset();

      expect(breaker.isClosed()).toBe(true);
    });
  });

  // ============================================
  // 降级函数测试
  // ============================================

  describe('降级函数', () => {
    it('应该在熔断时调用降级函数', async () => {
      const fallback = vi.fn().mockReturnValue('fallback result');
      const breakerWithFallback = new CircuitBreaker({
        name: 'fallback-test',
        failureThreshold: 1,
        fallback,
      });

      // 触发熔断
      try {
        await breakerWithFallback.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      // 熔断后应该调用降级函数
      const result = await breakerWithFallback.execute(
        () => Promise.resolve('normal'),
        'arg1'
      );

      expect(result).toBe('fallback result');
      expect(fallback).toHaveBeenCalledWith('arg1');
    });
  });

  // ============================================
  // 滑动窗口测试
  // ============================================

  describe('滑动窗口', () => {
    it('应该正确计算窗口统计', async () => {
      // 执行一些操作
      await breaker.execute(() => Promise.resolve('ok'));
      await breaker.execute(() => Promise.resolve('ok'));
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      const stats = breaker.getStats();
      expect(stats.window.total).toBe(3);
      expect(stats.window.successes).toBe(2);
      expect(stats.window.failures).toBe(1);
    });

    it('应该计算错误率', async () => {
      // 2 成功 2 失败
      await breaker.execute(() => Promise.resolve('ok'));
      await breaker.execute(() => Promise.resolve('ok'));
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      const stats = breaker.getStats();
      expect(stats.errorRate).toBe('50.00%');
    });
  });
});

// ============================================
// CircuitBreakerManager 测试
// ============================================

describe('CircuitBreakerManager', () => {
  let manager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
  });

  afterEach(() => {
    manager.clear();
  });

  it('应该创建和获取熔断器', () => {
    const breaker = manager.getBreaker('test', { failureThreshold: 5 });

    expect(breaker).toBeInstanceOf(CircuitBreaker);
    expect(breaker.name).toBe('test');
  });

  it('应该返回相同的熔断器实例', () => {
    const breaker1 = manager.getBreaker('test');
    const breaker2 = manager.getBreaker('test');

    expect(breaker1).toBe(breaker2);
  });

  it('execute 应该使用指定的熔断器执行', async () => {
    const result = await manager.execute('api', () => Promise.resolve('ok'));

    expect(result).toBe('ok');

    const stats = manager.getAllStats();
    expect(stats.api.totalCalls).toBe(1);
  });

  it('应该返回所有熔断器状态', () => {
    manager.getBreaker('api1');
    manager.getBreaker('api2');

    const stats = manager.getAllStats();

    expect(Object.keys(stats)).toContain('api1');
    expect(Object.keys(stats)).toContain('api2');
  });

  it('应该返回所有开路的熔断器', async () => {
    const breaker = manager.getBreaker('failing', { failureThreshold: 1 });

    try {
      await breaker.execute(() => Promise.reject(new Error('fail')));
    } catch {}

    const openBreakers = manager.getOpenBreakers();

    expect(openBreakers).toContain('failing');
  });

  it('resetAll 应该重置所有熔断器', async () => {
    const breaker = manager.getBreaker('test', { failureThreshold: 1 });

    try {
      await breaker.execute(() => Promise.reject(new Error('fail')));
    } catch {}

    expect(breaker.isOpen()).toBe(true);

    manager.resetAll();

    expect(breaker.isClosed()).toBe(true);
  });

  it('remove 应该移除熔断器', () => {
    manager.getBreaker('test');
    manager.remove('test');

    const stats = manager.getAllStats();
    expect(Object.keys(stats)).not.toContain('test');
  });

  it('应该转发熔断器事件', async () => {
    const tripHandler = vi.fn();
    manager.on('trip', tripHandler);

    const breaker = manager.getBreaker('test', { failureThreshold: 1 });

    try {
      await breaker.execute(() => Promise.reject(new Error('fail')));
    } catch {}

    expect(tripHandler).toHaveBeenCalled();
  });
});

// ============================================
// wrapWithCircuitBreaker 测试
// ============================================

describe('wrapWithCircuitBreaker', () => {
  it('应该包装函数并添加熔断保护', async () => {
    const originalFn = vi.fn().mockResolvedValue('result');
    const wrappedFn = wrapWithCircuitBreaker(originalFn, 'wrap-test', {
      failureThreshold: 3,
    });

    const result = await wrappedFn('arg1', 'arg2');

    expect(result).toBe('result');
    expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('包装函数在熔断后应该拒绝', async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error('fail'));
    const wrappedFn = wrapWithCircuitBreaker(failingFn, 'wrap-fail-test', {
      failureThreshold: 2,
    });

    // 触发熔断
    try { await wrappedFn(); } catch {}
    try { await wrappedFn(); } catch {}

    // 再次调用应该被拒绝
    await expect(wrappedFn()).rejects.toThrow(CircuitBreakerError);
  });
});

// ============================================
// CircuitState 常量测试
// ============================================

describe('CircuitState', () => {
  it('应该包含所有状态', () => {
    expect(CircuitState.CLOSED).toBe('closed');
    expect(CircuitState.OPEN).toBe('open');
    expect(CircuitState.HALF_OPEN).toBe('half_open');
  });
});

// ============================================
// CircuitBreakerError 测试
// ============================================

describe('CircuitBreakerError', () => {
  it('应该是 Error 的实例', () => {
    const error = new CircuitBreakerError('test message', CircuitState.OPEN);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CircuitBreakerError');
    expect(error.message).toBe('test message');
    expect(error.state).toBe(CircuitState.OPEN);
  });
});
