/**
 * 备份管理器测试
 * Backup Manager Tests
 * @module tests/unit/backup.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager, BackupManager } from '../../src/database/index.js';
import fs from 'fs';
import path from 'path';

// 测试备份目录
const TEST_BACKUP_DIR = './test-backups';

describe('BackupManager', () => {
  let db;
  let backupManager;

  beforeEach(async () => {
    // 创建内存数据库
    db = new DatabaseManager({ memory: true });
    await db.initialize();

    // 插入测试数据
    db.insertTrade({
      tradeId: 'trade-001',
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: 0.1,
      price: 50000,
      cost: 5000,
      exchange: 'binance',
      timestamp: Date.now(),
    });

    // 创建备份管理器
    backupManager = new BackupManager({
      backupDir: TEST_BACKUP_DIR,
      retentionDays: 7,
      compress: true,
      encrypt: false,
    });
  });

  afterEach(async () => {
    // 清理
    if (backupManager) {
      backupManager.stopScheduledBackups();
    }

    if (db) {
      db.close();
    }

    // 删除测试备份目录
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }
  });

  describe('创建备份', () => {
    it('应该成功创建备份', async () => {
      const backup = await backupManager.createBackup(db);

      expect(backup).toBeDefined();
      expect(backup.id).toBeDefined();
      expect(backup.filename).toBeDefined();
      expect(backup.timestamp).toBeDefined();
      expect(backup.size).toBeGreaterThan(0);
      expect(backup.hash).toBeDefined();
    });

    it('应该压缩备份', async () => {
      const backup = await backupManager.createBackup(db);

      expect(backup.compressed).toBe(true);
      expect(backup.filename).toContain('.gz');
      expect(backup.size).toBeLessThan(backup.originalSize);
    });

    it('应该发射 backup 事件', async () => {
      const handler = vi.fn();
      backupManager.on('backup', handler);

      await backupManager.createBackup(db);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].id).toBeDefined();
    });

    it('应该记录备份到历史', async () => {
      await backupManager.createBackup(db);

      const backups = backupManager.getBackups();
      expect(backups.length).toBe(1);
    });

    it('应该创建多个备份', async () => {
      await backupManager.createBackup(db, { type: 'manual' });
      await backupManager.createBackup(db, { type: 'scheduled' });

      const backups = backupManager.getBackups();
      expect(backups.length).toBe(2);
    });
  });

  describe('验证备份', () => {
    it('应该成功验证有效备份', async () => {
      const backup = await backupManager.createBackup(db);

      const result = await backupManager.verifyBackup(backup.id);

      expect(result.valid).toBe(true);
      expect(result.hash).toBe(backup.hash);
    });

    it('应该对不存在的备份返回无效', async () => {
      const result = await backupManager.verifyBackup('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('不存在');
    });
  });

  describe('恢复备份', () => {
    it('应该成功恢复备份', async () => {
      // 创建备份
      const backup = await backupManager.createBackup(db);

      // 修改数据库
      db.insertTrade({
        tradeId: 'trade-002',
        symbol: 'ETH/USDT',
        side: 'sell',
        amount: 1,
        price: 3000,
        cost: 3000,
        exchange: 'binance',
        timestamp: Date.now(),
      });

      expect(db.getStats().trades).toBe(2);

      // 恢复备份
      await backupManager.restoreBackup(db, backup.id);

      // 验证恢复后的数据
      expect(db.getStats().trades).toBe(1);
    });

    it('应该发射 restore 事件', async () => {
      const backup = await backupManager.createBackup(db);
      const handler = vi.fn();
      backupManager.on('restore', handler);

      await backupManager.restoreBackup(db, backup.id);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('应该拒绝不存在的备份', async () => {
      await expect(
        backupManager.restoreBackup(db, 'nonexistent')
      ).rejects.toThrow('不存在');
    });
  });

  describe('清理旧备份', () => {
    it('应该保留最少备份数', async () => {
      const manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
        minBackups: 2,
        maxBackups: 2, // 设置 maxBackups 来触发清理
        retentionDays: 30,
      });

      // 创建多个备份
      await manager.createBackup(db);
      await manager.createBackup(db);
      await manager.createBackup(db);

      // 清理后应该保留 minBackups 个
      const backups = manager.getBackups();
      expect(backups.length).toBe(2);
    });

    it('应该删除超过最大数量的备份', async () => {
      const manager = new BackupManager({
        backupDir: TEST_BACKUP_DIR,
        minBackups: 1,
        maxBackups: 2,
        retentionDays: 30,
      });

      // 创建多个备份
      await manager.createBackup(db);
      await manager.createBackup(db);
      await manager.createBackup(db);

      const backups = manager.getBackups();
      expect(backups.length).toBe(2);
    });
  });

  describe('备份统计', () => {
    it('应该返回正确的统计信息', async () => {
      await backupManager.createBackup(db);
      await backupManager.createBackup(db);

      const stats = backupManager.getStats();

      expect(stats.totalBackups).toBe(2);
      expect(stats.totalSizeMB).toBeGreaterThan(0);
      expect(stats.newestBackup).toBeDefined();
      expect(stats.oldestBackup).toBeDefined();
    });
  });

  describe('获取备份列表', () => {
    it('应该按时间倒序返回备份', async () => {
      await backupManager.createBackup(db, { type: 'manual' });
      await new Promise(r => setTimeout(r, 10));
      await backupManager.createBackup(db, { type: 'scheduled' });

      const backups = backupManager.getBackups();

      expect(backups.length).toBe(2);
      expect(new Date(backups[0].timestamp).getTime())
        .toBeGreaterThan(new Date(backups[1].timestamp).getTime());
    });

    it('应该筛选备份类型', async () => {
      await backupManager.createBackup(db, { type: 'manual' });
      await backupManager.createBackup(db, { type: 'scheduled' });
      await backupManager.createBackup(db, { type: 'manual' });

      const manualBackups = backupManager.getBackups({ type: 'manual' });

      expect(manualBackups.length).toBe(2);
    });

    it('应该限制返回数量', async () => {
      await backupManager.createBackup(db);
      await backupManager.createBackup(db);
      await backupManager.createBackup(db);

      const backups = backupManager.getBackups({ limit: 2 });

      expect(backups.length).toBe(2);
    });
  });

  describe('获取最新备份', () => {
    it('应该返回最新的备份', async () => {
      await backupManager.createBackup(db);
      await new Promise(r => setTimeout(r, 10));
      const newestBackup = await backupManager.createBackup(db);

      const latest = backupManager.getLatestBackup();

      expect(latest.id).toBe(newestBackup.id);
    });

    it('无备份时应该返回 null', () => {
      const manager = new BackupManager({ backupDir: TEST_BACKUP_DIR });
      const latest = manager.getLatestBackup();

      expect(latest).toBeNull();
    });
  });
});

describe('BackupManager 加密', () => {
  let db;
  let backupManager;

  beforeEach(async () => {
    db = new DatabaseManager({ memory: true });
    await db.initialize();

    db.insertTrade({
      tradeId: 'trade-001',
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: 0.1,
      price: 50000,
      cost: 5000,
      exchange: 'binance',
      timestamp: Date.now(),
    });

    backupManager = new BackupManager({
      backupDir: TEST_BACKUP_DIR,
      encrypt: true,
      encryptionKey: 'test-encryption-key-12345',
    });
  });

  afterEach(() => {
    if (backupManager) {
      backupManager.stopScheduledBackups();
    }
    if (db) {
      db.close();
    }
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }
  });

  it('应该创建加密备份', async () => {
    const backup = await backupManager.createBackup(db);

    expect(backup.encrypted).toBe(true);
    expect(backup.filename).toContain('.enc');
  });

  it('应该恢复加密备份', async () => {
    const backup = await backupManager.createBackup(db);

    // 修改数据
    db.insertTrade({
      tradeId: 'trade-002',
      symbol: 'ETH/USDT',
      side: 'sell',
      amount: 1,
      price: 3000,
      cost: 3000,
      exchange: 'binance',
      timestamp: Date.now(),
    });

    // 恢复
    await backupManager.restoreBackup(db, backup.id);

    expect(db.getStats().trades).toBe(1);
  });

  it('应该验证加密备份', async () => {
    const backup = await backupManager.createBackup(db);

    const result = await backupManager.verifyBackup(backup.id);

    expect(result.valid).toBe(true);
  });
});

describe('BackupManager 定时备份', () => {
  let db;
  let backupManager;

  beforeEach(async () => {
    db = new DatabaseManager({ memory: true });
    await db.initialize();

    backupManager = new BackupManager({
      backupDir: TEST_BACKUP_DIR,
      scheduleInterval: 100, // 100ms for testing
    });
  });

  afterEach(() => {
    if (backupManager) {
      backupManager.stopScheduledBackups();
    }
    if (db) {
      db.close();
    }
    if (fs.existsSync(TEST_BACKUP_DIR)) {
      fs.rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    }
  });

  it('应该启动定时备份', async () => {
    backupManager.startScheduledBackups(db);

    // 等待初始备份
    await new Promise(r => setTimeout(r, 50));

    expect(backupManager.getStats().isScheduling).toBe(true);
    expect(backupManager.getBackups().length).toBeGreaterThanOrEqual(1);
  });

  it('应该停止定时备份', async () => {
    backupManager.startScheduledBackups(db);
    await new Promise(r => setTimeout(r, 50));

    backupManager.stopScheduledBackups();

    expect(backupManager.getStats().isScheduling).toBe(false);
  });

  it('应该发射 started 和 stopped 事件', async () => {
    const startHandler = vi.fn();
    const stopHandler = vi.fn();

    backupManager.on('started', startHandler);
    backupManager.on('stopped', stopHandler);

    backupManager.startScheduledBackups(db);
    await new Promise(r => setTimeout(r, 50));
    backupManager.stopScheduledBackups();

    expect(startHandler).toHaveBeenCalledTimes(1);
    expect(stopHandler).toHaveBeenCalledTimes(1);
  });
});
