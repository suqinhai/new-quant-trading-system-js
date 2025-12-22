/**
 * Redis 连接池单元测试
 * Redis Connection Pool Unit Tests
 *
 * DB-012: 优化 Redis 连接池配置
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock Redis 客户端
const mockClient = {
  ping: vi.fn().mockResolvedValue('PONG'),
  quit: vi.fn().mockResolvedValue('OK'),
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
};

// Mock createClient
vi.mock('redis', () => ({
  createClient: vi.fn(() => mockClient),
}));

// 动态导入模块
let RedisConnectionPool, CONNECTION_STATE;

describe('RedisConnectionPool', () => {
  let pool;

  beforeEach(async () => {
    // 动态导入
    const module = await import('../../src/database/redis/RedisConnectionPool.js');
    RedisConnectionPool = module.RedisConnectionPool;
    CONNECTION_STATE = module.CONNECTION_STATE;

    // 创建连接池实例
    pool = new RedisConnectionPool({
      url: 'redis://localhost:6379',
      minConnections: 2,
      maxConnections: 5,
      idleTimeout: 5000,
      acquireTimeout: 1000,
      enableHealthCheck: false,
    });

    // 重置所有 mock
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (pool && pool.isInitialized) {
      await pool.close();
    }
  });

  describe('初始化', () => {
    it('应该使用默认配置创建实例', () => {
      expect(pool).toBeDefined();
      expect(pool.config.minConnections).toBe(2);
      expect(pool.config.maxConnections).toBe(5);
      expect(pool.isInitialized).toBe(false);
    });

    it('应该初始化最小连接数', async () => {
      await pool.initialize();

      expect(pool.isInitialized).toBe(true);
      expect(pool.pool.length).toBe(2);
    });

    it('不应重复初始化', async () => {
      await pool.initialize();
      const firstPoolSize = pool.pool.length;

      await pool.initialize();

      expect(pool.pool.length).toBe(firstPoolSize);
    });
  });

  describe('获取连接', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('应该成功获取空闲连接', async () => {
      const connection = await pool.acquire();

      expect(connection).toBeDefined();
      expect(connection.state).toBe(CONNECTION_STATE.IN_USE);
    });

    it('应该在没有空闲连接时创建新连接', async () => {
      // 获取所有现有连接
      const conn1 = await pool.acquire();
      const conn2 = await pool.acquire();

      // 再获取一个，应该创建新连接
      const conn3 = await pool.acquire();

      expect(pool.pool.length).toBe(3);
      expect(conn3.state).toBe(CONNECTION_STATE.IN_USE);

      // 释放连接
      pool.release(conn1);
      pool.release(conn2);
      pool.release(conn3);
    });

    it('应该增加使用计数', async () => {
      const connection = await pool.acquire();

      expect(connection.useCount).toBe(1);

      pool.release(connection);
      const connection2 = await pool.acquire();

      expect(connection2.useCount).toBe(2);
    });
  });

  describe('释放连接', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('应该正确释放连接', async () => {
      const connection = await pool.acquire();
      expect(connection.state).toBe(CONNECTION_STATE.IN_USE);

      pool.release(connection);

      expect(connection.state).toBe(CONNECTION_STATE.IDLE);
    });

    it('应该处理等待队列', async () => {
      // 获取所有连接
      const connections = [];
      for (let i = 0; i < 5; i++) {
        connections.push(await pool.acquire());
      }

      // 启动一个等待获取连接的 Promise
      const waitingPromise = pool.acquire();

      // 释放一个连接
      pool.release(connections[0]);

      // 等待应该成功
      const newConnection = await waitingPromise;
      expect(newConnection).toBeDefined();

      // 清理
      for (const conn of connections.slice(1)) {
        pool.release(conn);
      }
      pool.release(newConnection);
    });
  });

  describe('execute 方法', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('应该自动获取和释放连接', async () => {
      const result = await pool.execute(async (client) => {
        return client.ping();
      });

      expect(result).toBe('PONG');
      expect(pool.stats.acquireCount).toBe(1);
      expect(pool.stats.releaseCount).toBe(1);
    });

    it('应该在出错时也释放连接', async () => {
      try {
        await pool.execute(async () => {
          throw new Error('Test error');
        });
      } catch (error) {
        expect(error.message).toBe('Test error');
      }

      expect(pool.stats.releaseCount).toBe(1);
    });
  });

  describe('统计信息', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('应该返回正确的统计信息', async () => {
      const conn = await pool.acquire();
      const stats = pool.getStats();

      expect(stats.currentSize).toBe(2);
      expect(stats.inUseCount).toBe(1);
      expect(stats.idleCount).toBe(1);
      expect(stats.acquireCount).toBe(1);

      pool.release(conn);
    });

    it('应该返回池状态', async () => {
      const status = pool.getStatus();

      expect(status.isInitialized).toBe(true);
      expect(status.isShuttingDown).toBe(false);
      expect(status.connections).toHaveLength(2);
    });
  });

  describe('关闭连接池', () => {
    it('应该关闭所有连接', async () => {
      await pool.initialize();
      expect(pool.pool.length).toBe(2);

      await pool.close();

      expect(pool.pool.length).toBe(0);
      expect(pool.isInitialized).toBe(false);
    });

    it('应该拒绝等待的请求', async () => {
      await pool.initialize();

      // 获取所有连接
      const connections = [];
      for (let i = 0; i < 5; i++) {
        connections.push(await pool.acquire());
      }

      // 启动等待
      const waitingPromise = pool.acquire();

      // 关闭池
      await pool.close();

      // 等待应该被拒绝
      await expect(waitingPromise).rejects.toThrow('Connection pool is closing');
    });
  });

  describe('事件触发', () => {
    it('应该在初始化时触发事件', async () => {
      const initSpy = vi.fn();
      pool.on('initialized', initSpy);

      await pool.initialize();

      expect(initSpy).toHaveBeenCalled();
    });

    it('应该在连接创建时触发事件', async () => {
      const createSpy = vi.fn();
      pool.on('connectionCreated', createSpy);

      await pool.initialize();

      expect(createSpy).toHaveBeenCalledTimes(2);
    });

    it('应该在关闭时触发事件', async () => {
      const closeSpy = vi.fn();
      pool.on('closed', closeSpy);

      await pool.initialize();
      await pool.close();

      expect(closeSpy).toHaveBeenCalled();
    });
  });
});

describe('CONNECTION_STATE 常量', () => {
  beforeEach(async () => {
    const module = await import('../../src/database/redis/RedisConnectionPool.js');
    CONNECTION_STATE = module.CONNECTION_STATE;
  });

  it('应该包含所有连接状态', () => {
    expect(CONNECTION_STATE.IDLE).toBe('idle');
    expect(CONNECTION_STATE.IN_USE).toBe('in_use');
    expect(CONNECTION_STATE.CONNECTING).toBe('connecting');
    expect(CONNECTION_STATE.ERROR).toBe('error');
    expect(CONNECTION_STATE.CLOSED).toBe('closed');
  });
});
