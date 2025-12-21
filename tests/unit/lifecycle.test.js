/**
 * 生命周期管理测试
 * Lifecycle Management Tests
 * @module tests/unit/lifecycle.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GracefulShutdown,
  StatePersistence,
  ShutdownPhase,
  createLifecycleManager,
} from '../../src/lifecycle/index.js';
import fs from 'fs';
import path from 'path';

const TEST_STATE_DIR = './test-state';

// ============================================
// GracefulShutdown 测试
// ============================================

describe('GracefulShutdown', () => {
  let shutdown;

  beforeEach(() => {
    shutdown = new GracefulShutdown({
      timeout: 1000,
      forceExitTimeout: 500,
      handleSignals: false, // 测试中禁用信号处理
      exitOnUncaughtException: false,
      exitOnUnhandledRejection: false,
    });
  });

  afterEach(() => {
    shutdown.removeAllListeners();
  });

  describe('初始化', () => {
    it('应该以 RUNNING 状态启动', () => {
      expect(shutdown.phase).toBe(ShutdownPhase.RUNNING);
      expect(shutdown.isShuttingDown).toBe(false);
    });

    it('应该正确初始化配置', () => {
      expect(shutdown.config.timeout).toBe(1000);
      expect(shutdown.handlers.size).toBe(0);
    });
  });

  describe('处理器注册', () => {
    it('应该成功注册处理器', () => {
      const handler = vi.fn();
      shutdown.register('test-handler', handler);

      expect(shutdown.handlers.has('test-handler')).toBe(true);
    });

    it('应该返回取消注册函数', () => {
      const handler = vi.fn();
      const unregister = shutdown.register('test-handler', handler);

      expect(shutdown.handlers.has('test-handler')).toBe(true);

      unregister();

      expect(shutdown.handlers.has('test-handler')).toBe(false);
    });

    it('应该支持优先级', () => {
      shutdown.register('low-priority', vi.fn(), { priority: 100 });
      shutdown.register('high-priority', vi.fn(), { priority: 10 });

      const handlers = Array.from(shutdown.handlers.values())
        .sort((a, b) => a.priority - b.priority);

      expect(handlers[0].name).toBe('high-priority');
      expect(handlers[1].name).toBe('low-priority');
    });
  });

  describe('处理器执行', () => {
    it('应该在关闭时执行所有处理器', async () => {
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      shutdown.register('handler1', handler1);
      shutdown.register('handler2', handler2);

      // Mock process.exit
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await shutdown.shutdown('test');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();

      mockExit.mockRestore();
    });

    it('应该按优先级顺序执行处理器', async () => {
      const order = [];

      shutdown.register('third', async () => {
        order.push('third');
      }, { priority: 30 });

      shutdown.register('first', async () => {
        order.push('first');
      }, { priority: 10 });

      shutdown.register('second', async () => {
        order.push('second');
      }, { priority: 20 });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await shutdown.shutdown('test');

      expect(order).toEqual(['first', 'second', 'third']);

      mockExit.mockRestore();
    });

    it('应该处理处理器错误', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
      const successHandler = vi.fn().mockResolvedValue(undefined);

      shutdown.register('failing', failingHandler);
      shutdown.register('success', successHandler);

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      // 不应该抛出错误
      await shutdown.shutdown('test');

      expect(failingHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();

      mockExit.mockRestore();
    });
  });

  describe('事件发射', () => {
    it('应该发射 shutdown:start 事件', async () => {
      const handler = vi.fn();
      shutdown.on('shutdown:start', handler);

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await shutdown.shutdown('test-reason');

      expect(handler).toHaveBeenCalledWith({
        reason: 'test-reason',
        error: null,
      });

      mockExit.mockRestore();
    });

    it('应该发射阶段事件', async () => {
      const phases = [];

      shutdown.on('phase:stopping', () => phases.push('stopping'));
      shutdown.on('phase:draining', () => phases.push('draining'));
      shutdown.on('phase:cleanup', () => phases.push('cleanup'));

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await shutdown.shutdown('test');

      expect(phases).toContain('stopping');
      expect(phases).toContain('draining');
      expect(phases).toContain('cleanup');

      mockExit.mockRestore();
    });
  });

  describe('状态查询', () => {
    it('应该返回正确的状态', () => {
      shutdown.register('handler1', vi.fn());
      shutdown.register('handler2', vi.fn());

      const status = shutdown.getStatus();

      expect(status.phase).toBe(ShutdownPhase.RUNNING);
      expect(status.isShuttingDown).toBe(false);
      expect(status.registeredHandlers).toContain('handler1');
      expect(status.registeredHandlers).toContain('handler2');
    });
  });

  describe('重复关闭保护', () => {
    it('应该忽略重复的关闭请求', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      shutdown.register('handler', handler);

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      // 同时触发两次关闭
      const p1 = shutdown.shutdown('first');
      const p2 = shutdown.shutdown('second');

      await Promise.all([p1, p2]);

      // 处理器只应该被调用一次
      expect(handler).toHaveBeenCalledTimes(1);

      mockExit.mockRestore();
    });
  });
});

// ============================================
// StatePersistence 测试
// ============================================

describe('StatePersistence', () => {
  let persistence;

  beforeEach(() => {
    persistence = new StatePersistence({
      stateDir: TEST_STATE_DIR,
      enableAutoSave: false,
    });
  });

  afterEach(() => {
    persistence.stopAutoSave();
    persistence.clear();

    // 清理测试目录
    if (fs.existsSync(TEST_STATE_DIR)) {
      fs.rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
  });

  describe('状态操作', () => {
    it('应该正确设置和获取状态', () => {
      persistence.set('key1', { value: 'test' });

      expect(persistence.get('key1')).toEqual({ value: 'test' });
    });

    it('应该返回默认值当状态不存在时', () => {
      expect(persistence.get('nonexistent', 'default')).toBe('default');
    });

    it('应该正确删除状态', () => {
      persistence.set('key1', 'value1');
      persistence.delete('key1');

      expect(persistence.get('key1')).toBeNull();
    });

    it('应该正确清除所有状态', () => {
      persistence.set('key1', 'value1');
      persistence.set('key2', 'value2');

      persistence.clear();

      expect(persistence.keys().length).toBe(0);
    });
  });

  describe('持久化', () => {
    it('应该保存状态到文件', () => {
      persistence.set('test-state', { data: 'test' });

      const result = persistence.save('test-state');

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(TEST_STATE_DIR, 'test-state.json'))).toBe(true);
    });

    it('应该从文件加载状态', () => {
      persistence.set('load-test', { loaded: true });
      persistence.save('load-test');
      persistence.clear();

      const value = persistence.load('load-test');

      expect(value).toEqual({ loaded: true });
    });

    it('应该保存所有状态', () => {
      persistence.set('state1', { n: 1 });
      persistence.set('state2', { n: 2 });

      const result = persistence.saveAll();

      expect(result.saved.length).toBe(2);
      expect(result.failed.length).toBe(0);
    });

    it('应该加载所有状态', () => {
      persistence.set('state1', { n: 1 });
      persistence.set('state2', { n: 2 });
      persistence.saveAll();
      persistence.clear();

      const result = persistence.loadAll();

      expect(result.loaded.length).toBe(2);
      expect(persistence.get('state1')).toEqual({ n: 1 });
      expect(persistence.get('state2')).toEqual({ n: 2 });
    });
  });

  describe('脏标记', () => {
    it('应该在设置状态后标记为脏', () => {
      expect(persistence.isDirty).toBe(false);

      persistence.set('key', 'value');

      expect(persistence.isDirty).toBe(true);
    });

    it('应该在保存后清除脏标记', () => {
      persistence.set('key', 'value');
      persistence.saveAll();

      expect(persistence.isDirty).toBe(false);
    });
  });

  describe('统计信息', () => {
    it('应该返回正确的统计信息', () => {
      persistence.set('key1', 'value1');
      persistence.set('key2', 'value2');

      const stats = persistence.getStats();

      expect(stats.count).toBe(2);
      expect(stats.isDirty).toBe(true);
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
    });
  });
});

// ============================================
// createLifecycleManager 测试
// ============================================

describe('createLifecycleManager', () => {
  let manager;

  beforeEach(() => {
    manager = createLifecycleManager({
      shutdown: {
        timeout: 1000,
        handleSignals: false,
        exitOnUncaughtException: false,
        exitOnUnhandledRejection: false,
      },
      persistence: {
        stateDir: TEST_STATE_DIR,
        enableAutoSave: false,
      },
    });
  });

  afterEach(() => {
    manager.persistence.stopAutoSave();
    manager.persistence.clear();

    if (fs.existsSync(TEST_STATE_DIR)) {
      fs.rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
  });

  describe('初始化', () => {
    it('应该创建 shutdown 和 persistence 实例', () => {
      expect(manager.shutdown).toBeInstanceOf(GracefulShutdown);
      expect(manager.persistence).toBeInstanceOf(StatePersistence);
    });
  });

  describe('组件注册', () => {
    it('应该注册组件关闭处理器', () => {
      const stopFn = vi.fn();
      manager.registerComponent('test-component', stopFn);

      expect(manager.shutdown.handlers.has('test-component')).toBe(true);
    });
  });

  describe('状态管理', () => {
    it('应该保存和加载组件状态', () => {
      manager.saveState('component1', { running: true });

      expect(manager.loadState('component1')).toEqual({ running: true });
    });

    it('应该在加载不存在的状态时返回默认值', () => {
      expect(manager.loadState('nonexistent', 'default')).toBe('default');
    });
  });

  describe('状态恢复', () => {
    it('应该恢复所有保存的状态', async () => {
      manager.saveState('comp1', { state: 1 });
      manager.saveState('comp2', { state: 2 });
      manager.persistence.saveAll();
      manager.persistence.clear();

      const result = await manager.restoreState();

      expect(result.loaded.length).toBe(2);
    });
  });

  describe('状态查询', () => {
    it('应该返回完整状态', () => {
      manager.saveState('test', { data: 1 });

      const status = manager.getStatus();

      expect(status.shutdown).toBeDefined();
      expect(status.persistence).toBeDefined();
      expect(status.persistence.count).toBe(1);
    });
  });
});

// ============================================
// 集成测试
// ============================================

describe('Lifecycle 集成测试', () => {
  let manager;

  beforeEach(() => {
    manager = createLifecycleManager({
      shutdown: {
        timeout: 1000,
        handleSignals: false,
        exitOnUncaughtException: false,
        exitOnUnhandledRejection: false,
      },
      persistence: {
        stateDir: TEST_STATE_DIR,
        enableAutoSave: false,
      },
    });
  });

  afterEach(() => {
    manager.persistence.stopAutoSave();
    manager.persistence.clear();

    if (fs.existsSync(TEST_STATE_DIR)) {
      fs.rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
  });

  it('应该完成完整的启动-保存-恢复-关闭流程', async () => {
    // 1. 模拟组件启动
    let componentState = { initialized: true, data: [] };

    manager.registerComponent('my-component', async () => {
      // 关闭时保存状态
      manager.saveState('my-component', componentState);
    });

    // 2. 模拟运行时状态变化
    componentState.data.push('item1');
    componentState.data.push('item2');

    // 3. 保存状态
    manager.saveState('my-component', componentState);
    manager.persistence.saveAll();

    // 4. 模拟重启（清除内存状态）
    manager.persistence.clear();

    // 5. 恢复状态
    await manager.restoreState();

    const restored = manager.loadState('my-component');

    expect(restored).toEqual({
      initialized: true,
      data: ['item1', 'item2'],
    });
  });
});
