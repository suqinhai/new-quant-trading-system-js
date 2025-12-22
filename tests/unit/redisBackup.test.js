/**
 * Redis 备份管理器单元测试
 * Redis Backup Manager Unit Tests
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock Redis 客户端
const mockRedisClient = {
  client: {
    ping: vi.fn().mockResolvedValue('PONG'),
    info: vi.fn().mockResolvedValue(`
# Persistence
rdb_last_save_time:1703232000
rdb_changes_since_last_save:100
rdb_bgsave_in_progress:0
rdb_last_bgsave_status:ok
rdb_last_bgsave_time_sec:1
rdb_last_cow_size:0
aof_enabled:1
aof_rewrite_in_progress:0
aof_last_rewrite_time_sec:2
aof_last_bgrewrite_status:ok
aof_current_size:1048576
aof_base_size:524288
aof_rewrite_scheduled:0
`),
    bgSave: vi.fn().mockResolvedValue('Background saving started'),
    bgRewriteAof: vi.fn().mockResolvedValue('Background append only file rewriting started'),
    configGet: vi.fn().mockImplementation((key) => {
      if (key === 'dir') return { dir: '/tmp/redis' };
      if (key === 'dbfilename') return { dbfilename: 'dump.rdb' };
      if (key === 'appendonly') return { appendonly: 'yes' };
      return {};
    }),
    scan: vi.fn().mockResolvedValue({ cursor: 0, keys: ['quant:test:key1', 'quant:test:key2'] }),
    type: vi.fn().mockResolvedValue('string'),
    ttl: vi.fn().mockResolvedValue(-1),
    get: vi.fn().mockResolvedValue('test-value'),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    hGetAll: vi.fn().mockResolvedValue({ field1: 'value1' }),
    hSet: vi.fn().mockResolvedValue(1),
    lRange: vi.fn().mockResolvedValue(['item1', 'item2']),
    rPush: vi.fn().mockResolvedValue(2),
    sMembers: vi.fn().mockResolvedValue(['member1', 'member2']),
    sAdd: vi.fn().mockResolvedValue(2),
    zRangeWithScores: vi.fn().mockResolvedValue([
      { value: 'member1', score: 1 },
      { value: 'member2', score: 2 },
    ]),
    zAdd: vi.fn().mockResolvedValue(2),
    expire: vi.fn().mockResolvedValue(1),
  },
};

// 动态导入模块
let RedisBackupManager, BACKUP_TYPE, BACKUP_STATUS;

describe('RedisBackupManager', () => {
  let backupManager;
  const testBackupDir = './test-backups-redis';

  beforeEach(async () => {
    // 动态导入
    const module = await import('../../src/database/redis/RedisBackupManager.js');
    RedisBackupManager = module.RedisBackupManager;
    BACKUP_TYPE = module.BACKUP_TYPE;
    BACKUP_STATUS = module.BACKUP_STATUS;

    // 创建测试备份目录
    if (!fs.existsSync(testBackupDir)) {
      fs.mkdirSync(testBackupDir, { recursive: true });
    }

    // 创建备份管理器实例
    backupManager = new RedisBackupManager(mockRedisClient, {
      backupDir: testBackupDir,
      compress: false,
      encrypt: false,
      scheduleInterval: 0,
      jsonBackupInterval: 0,
    });

    // 重置所有 mock
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // 停止定时器
    if (backupManager) {
      backupManager.stop();
    }

    // 清理测试目录
    if (fs.existsSync(testBackupDir)) {
      fs.rmSync(testBackupDir, { recursive: true, force: true });
    }
  });

  describe('构造函数和配置', () => {
    it('应该使用默认配置创建实例', () => {
      expect(backupManager).toBeDefined();
      expect(backupManager.config.backupDir).toBe(testBackupDir);
      expect(backupManager.isRunning).toBe(false);
    });

    it('应该创建必要的备份目录', () => {
      expect(fs.existsSync(path.join(testBackupDir, 'rdb'))).toBe(true);
      expect(fs.existsSync(path.join(testBackupDir, 'json'))).toBe(true);
      expect(fs.existsSync(path.join(testBackupDir, 'aof'))).toBe(true);
    });
  });

  describe('启动/停止', () => {
    it('应该正确启动定时备份', () => {
      const startSpy = vi.fn();
      backupManager.on('started', startSpy);

      backupManager.start();

      expect(backupManager.isRunning).toBe(true);
      expect(startSpy).toHaveBeenCalled();
    });

    it('应该正确停止定时备份', () => {
      const stopSpy = vi.fn();
      backupManager.on('stopped', stopSpy);

      backupManager.start();
      backupManager.stop();

      expect(backupManager.isRunning).toBe(false);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('不应重复启动', () => {
      backupManager.start();
      backupManager.start();

      expect(backupManager.isRunning).toBe(true);
    });
  });

  describe('JSON 备份', () => {
    it('应该成功创建 JSON 备份', async () => {
      const completeSpy = vi.fn();
      backupManager.on('backup:complete', completeSpy);

      const result = await backupManager.createJSONBackup({ type: 'manual' });

      expect(result).toBeDefined();
      expect(result.status).toBe(BACKUP_STATUS.COMPLETED);
      expect(result.type).toBe(BACKUP_TYPE.JSON);
      expect(result.keyCount).toBe(2);
      expect(fs.existsSync(result.filepath)).toBe(true);
      expect(completeSpy).toHaveBeenCalled();
    });

    it('应该正确导出不同类型的键', async () => {
      // 配置 mock 返回不同类型
      mockRedisClient.client.scan.mockResolvedValueOnce({
        cursor: 0,
        keys: ['quant:string', 'quant:hash', 'quant:list', 'quant:set', 'quant:zset'],
      });

      const typeMap = {
        'quant:string': 'string',
        'quant:hash': 'hash',
        'quant:list': 'list',
        'quant:set': 'set',
        'quant:zset': 'zset',
      };

      mockRedisClient.client.type.mockImplementation((key) => {
        return Promise.resolve(typeMap[key] || 'string');
      });

      const result = await backupManager.createJSONBackup();

      expect(result.keyCount).toBe(5);
      expect(result.status).toBe(BACKUP_STATUS.COMPLETED);
    });

    it('应该支持压缩备份', async () => {
      backupManager.config.compress = true;

      const result = await backupManager.createJSONBackup();

      expect(result.compressed).toBe(true);
      expect(result.filepath).toContain('.gz');
    });

    it('应该记录备份历史', async () => {
      await backupManager.createJSONBackup();

      const backups = backupManager.getBackups();
      expect(backups.length).toBe(1);
      expect(backups[0].type).toBe(BACKUP_TYPE.JSON);
    });
  });

  describe('数据恢复', () => {
    let backupResult;

    beforeEach(async () => {
      // 先创建一个备份
      backupResult = await backupManager.createJSONBackup();
    });

    it('应该成功从备份恢复数据', async () => {
      const completeSpy = vi.fn();
      backupManager.on('restore:complete', completeSpy);

      const result = await backupManager.restoreFromJSON(backupResult.id);

      expect(result.success).toBe(true);
      expect(result.restored).toBeGreaterThan(0);
      expect(completeSpy).toHaveBeenCalled();
    });

    it('应该支持覆盖模式', async () => {
      mockRedisClient.client.exists.mockResolvedValue(1);

      const result = await backupManager.restoreFromJSON(backupResult.id, {
        overwrite: true,
      });

      expect(result.restored).toBeGreaterThan(0);
    });

    it('应该支持跳过已存在的键', async () => {
      mockRedisClient.client.exists.mockResolvedValue(1);

      const result = await backupManager.restoreFromJSON(backupResult.id, {
        overwrite: false,
      });

      expect(result.skipped).toBeGreaterThan(0);
    });

    it('应该支持干运行模式', async () => {
      // 重置 exists mock 确保键不存在
      mockRedisClient.client.exists.mockResolvedValue(0);

      const result = await backupManager.restoreFromJSON(backupResult.id, {
        dryRun: true,
      });

      expect(result.restored).toBeGreaterThan(0);
      // 干运行模式下不应该调用 set
      expect(mockRedisClient.client.set).not.toHaveBeenCalled();
    });

    it('应该在备份不存在时抛出错误', async () => {
      await expect(backupManager.restoreFromJSON('non-existent-id'))
        .rejects
        .toThrow('备份不存在');
    });
  });

  describe('备份验证', () => {
    it('应该验证有效备份', async () => {
      const backup = await backupManager.createJSONBackup();

      const result = await backupManager.verifyBackup(backup.id);

      expect(result.valid).toBe(true);
      expect(result.hash).toBe(backup.hash);
    });

    it('应该报告不存在的备份', async () => {
      const result = await backupManager.verifyBackup('non-existent');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('备份不存在');
    });
  });

  describe('备份管理', () => {
    beforeEach(async () => {
      // 创建多个备份
      await backupManager.createJSONBackup({ type: 'scheduled' });
      await backupManager.createJSONBackup({ type: 'manual' });
    });

    it('应该获取备份列表', () => {
      const backups = backupManager.getBackups();

      expect(backups.length).toBe(2);
    });

    it('应该按类型筛选备份', () => {
      const backups = backupManager.getBackups({ type: BACKUP_TYPE.JSON });

      expect(backups.length).toBe(2);
    });

    it('应该获取最新备份', () => {
      const latest = backupManager.getLatestBackup();

      expect(latest).toBeDefined();
      expect(latest.status).toBe(BACKUP_STATUS.COMPLETED);
    });

    it('应该删除备份', async () => {
      const backups = backupManager.getBackups();
      const backupToDelete = backups[0];

      await backupManager.deleteBackup(backupToDelete.id);

      const remainingBackups = backupManager.getBackups();
      expect(remainingBackups.length).toBe(1);
    });
  });

  describe('持久化状态', () => {
    it('应该获取持久化状态', async () => {
      const status = await backupManager.getPersistenceStatus();

      expect(status.rdb).toBeDefined();
      expect(status.aof).toBeDefined();
      expect(status.backup).toBeDefined();
      expect(status.rdb.lastSaveTime).toBeDefined();
      expect(status.aof.enabled).toBe(true);
    });

    it('应该获取 AOF 状态', async () => {
      const status = await backupManager.getAOFStatus();

      expect(status.enabled).toBe(true);
      expect(status.rewriteInProgress).toBe(false);
    });
  });

  describe('统计信息', () => {
    it('应该返回正确的统计信息', async () => {
      await backupManager.createJSONBackup();

      const stats = backupManager.getStats();

      expect(stats.totalBackups).toBe(1);
      expect(stats.successfulBackups).toBe(1);
      expect(stats.failedBackups).toBe(0);
      expect(stats.successRate).toBe('100.00%');
    });
  });

  describe('事件触发', () => {
    it('应该在备份开始时触发事件', async () => {
      const startSpy = vi.fn();
      backupManager.on('backup:start', startSpy);

      await backupManager.createJSONBackup();

      expect(startSpy).toHaveBeenCalled();
    });

    it('应该在备份完成时触发事件', async () => {
      const completeSpy = vi.fn();
      backupManager.on('backup:complete', completeSpy);

      await backupManager.createJSONBackup();

      expect(completeSpy).toHaveBeenCalled();
    });
  });
});

describe('BACKUP_TYPE 常量', () => {
  beforeEach(async () => {
    const module = await import('../../src/database/redis/RedisBackupManager.js');
    BACKUP_TYPE = module.BACKUP_TYPE;
  });

  it('应该包含所有备份类型', () => {
    expect(BACKUP_TYPE.RDB).toBe('rdb');
    expect(BACKUP_TYPE.AOF).toBe('aof');
    expect(BACKUP_TYPE.JSON).toBe('json');
    expect(BACKUP_TYPE.FULL).toBe('full');
  });
});

describe('BACKUP_STATUS 常量', () => {
  beforeEach(async () => {
    const module = await import('../../src/database/redis/RedisBackupManager.js');
    BACKUP_STATUS = module.BACKUP_STATUS;
  });

  it('应该包含所有备份状态', () => {
    expect(BACKUP_STATUS.PENDING).toBe('pending');
    expect(BACKUP_STATUS.IN_PROGRESS).toBe('in_progress');
    expect(BACKUP_STATUS.COMPLETED).toBe('completed');
    expect(BACKUP_STATUS.FAILED).toBe('failed');
  });
});
