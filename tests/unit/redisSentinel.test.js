/**
 * Redis Sentinel 单元测试
 * Redis Sentinel Unit Tests
 *
 * DB-013: 配置 Redis Sentinel 高可用
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock Redis 客户端
const mockMasterClient = {
  ping: vi.fn().mockResolvedValue('PONG'),
  quit: vi.fn().mockResolvedValue('OK'),
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  info: vi.fn().mockResolvedValue('role:master\nconnected_slaves:2'),
};

const mockSentinelClient = {
  ping: vi.fn().mockResolvedValue('PONG'),
  quit: vi.fn().mockResolvedValue('OK'),
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  info: vi.fn().mockResolvedValue('redis_mode:sentinel\nsentinel_masters:1'),
  sendCommand: vi.fn().mockImplementation((args) => {
    if (args[0] === 'SENTINEL' && args[1] === 'GET-MASTER-ADDR-BY-NAME') {
      return Promise.resolve(['127.0.0.1', '6379']);
    }
    if (args[0] === 'SENTINEL' && args[1] === 'REPLICAS') {
      return Promise.resolve([
        ['ip', '127.0.0.1', 'port', '6380', 'flags', 'slave'],
        ['ip', '127.0.0.1', 'port', '6381', 'flags', 'slave'],
      ]);
    }
    if (args[0] === 'SENTINEL' && args[1] === 'MASTER') {
      return Promise.resolve(['name', 'mymaster', 'ip', '127.0.0.1', 'port', '6379']);
    }
    if (args[0] === 'SENTINEL' && args[1] === 'SENTINELS') {
      return Promise.resolve([
        ['ip', '127.0.0.1', 'port', '26379'],
        ['ip', '127.0.0.1', 'port', '26380'],
      ]);
    }
    return Promise.resolve(null);
  }),
  pSubscribe: vi.fn().mockResolvedValue(undefined),
};

let clientIndex = 0;

// Mock createClient
vi.mock('redis', () => ({
  createClient: vi.fn(() => {
    clientIndex++;
    // 第一个是 Sentinel 客户端，后续是 Master/Replica
    if (clientIndex === 1 || clientIndex === 4) {
      return { ...mockSentinelClient };
    }
    return { ...mockMasterClient };
  }),
}));

// 动态导入模块
let RedisSentinel, SENTINEL_STATE;

describe('RedisSentinel', () => {
  let sentinel;

  beforeEach(async () => {
    // 重置客户端索引
    clientIndex = 0;

    // 动态导入
    const module = await import('../../src/database/redis/RedisSentinel.js');
    RedisSentinel = module.RedisSentinel;
    SENTINEL_STATE = module.SENTINEL_STATE;

    // 创建 Sentinel 实例
    sentinel = new RedisSentinel({
      sentinels: [
        { host: 'localhost', port: 26379 },
      ],
      masterName: 'mymaster',
      enableReadReplicas: false,
      healthCheckInterval: 0, // 禁用健康检查
    });

    // 重置所有 mock
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (sentinel && sentinel.isInitialized) {
      await sentinel.close();
    }
  });

  describe('初始化', () => {
    it('应该使用默认配置创建实例', () => {
      expect(sentinel).toBeDefined();
      expect(sentinel.config.masterName).toBe('mymaster');
      expect(sentinel.state).toBe(SENTINEL_STATE.DISCONNECTED);
      expect(sentinel.isInitialized).toBe(false);
    });
  });

  describe('状态管理', () => {
    it('应该正确返回状态', () => {
      const status = sentinel.getStatus();

      expect(status.state).toBe(SENTINEL_STATE.DISCONNECTED);
      expect(status.isInitialized).toBe(false);
      expect(status.master).toBeNull();
      expect(status.replicas).toEqual([]);
    });
  });

  describe('关闭连接', () => {
    it('应该正确关闭', async () => {
      const closeSpy = vi.fn();
      sentinel.on('closed', closeSpy);

      await sentinel.close();

      expect(sentinel.state).toBe(SENTINEL_STATE.DISCONNECTED);
      expect(sentinel.isInitialized).toBe(false);
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('统计信息', () => {
    it('应该正确初始化统计信息', () => {
      expect(sentinel.stats.failoverCount).toBe(0);
      expect(sentinel.stats.masterSwitchCount).toBe(0);
      expect(sentinel.stats.errorCount).toBe(0);
    });
  });
});

describe('SENTINEL_STATE 常量', () => {
  beforeEach(async () => {
    const module = await import('../../src/database/redis/RedisSentinel.js');
    SENTINEL_STATE = module.SENTINEL_STATE;
  });

  it('应该包含所有 Sentinel 状态', () => {
    expect(SENTINEL_STATE.DISCONNECTED).toBe('disconnected');
    expect(SENTINEL_STATE.CONNECTING).toBe('connecting');
    expect(SENTINEL_STATE.CONNECTED).toBe('connected');
    expect(SENTINEL_STATE.FAILOVER).toBe('failover');
    expect(SENTINEL_STATE.ERROR).toBe('error');
  });
});
