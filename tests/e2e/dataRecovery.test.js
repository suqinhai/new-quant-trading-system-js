/**
 * 数据恢复流程 E2E 测试
 * Data Recovery E2E Tests
 *
 * 测试系统在数据丢失、损坏或不一致时的恢复能力
 * @module tests/e2e/dataRecovery.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  E2ETestEnvironment,
  testUtils,
  RUN_MODE,
} from './e2eTestFramework.js';
import EventEmitter from 'events';

// ============================================
// 数据存储模拟器
// ============================================

class MockDataStore extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      persistenceDelay: config.persistenceDelay || 10,
      enableWAL: config.enableWAL || true,
      snapshotInterval: config.snapshotInterval || 1000,
      ...config,
    };

    this.data = new Map();
    this.wal = [];              // Write-Ahead Log
    this.snapshots = [];        // 快照历史
    this.isCorrupted = false;
    this.isAvailable = true;
    this.pendingWrites = new Map();
  }

  async set(key, value) {
    if (!this.isAvailable) {
      throw new Error('Data store unavailable');
    }

    if (this.isCorrupted) {
      throw new Error('Data store corrupted');
    }

    // WAL 写入
    if (this.config.enableWAL) {
      this.wal.push({
        type: 'set',
        key,
        value: JSON.parse(JSON.stringify(value)),
        timestamp: Date.now(),
      });
    }

    // 模拟持久化延迟
    await testUtils.delay(this.config.persistenceDelay);

    this.data.set(key, JSON.parse(JSON.stringify(value)));
    this.emit('dataWritten', { key, value });

    return true;
  }

  async get(key) {
    if (!this.isAvailable) {
      throw new Error('Data store unavailable');
    }

    const value = this.data.get(key);
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }

  async delete(key) {
    if (!this.isAvailable) {
      throw new Error('Data store unavailable');
    }

    if (this.config.enableWAL) {
      this.wal.push({
        type: 'delete',
        key,
        timestamp: Date.now(),
      });
    }

    this.data.delete(key);
    return true;
  }

  async getAll() {
    if (!this.isAvailable) {
      throw new Error('Data store unavailable');
    }

    const result = {};
    for (const [key, value] of this.data) {
      result[key] = JSON.parse(JSON.stringify(value));
    }
    return result;
  }

  createSnapshot() {
    const snapshot = {
      id: `snap_${Date.now()}`,
      data: JSON.parse(JSON.stringify(Object.fromEntries(this.data))),
      walPosition: this.wal.length,
      timestamp: Date.now(),
    };

    this.snapshots.push(snapshot);
    this.emit('snapshotCreated', snapshot);

    // 只保留最近 5 个快照
    if (this.snapshots.length > 5) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  getLatestSnapshot() {
    return this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null;
  }

  async restoreFromSnapshot(snapshotId) {
    const snapshot = this.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    this.data.clear();
    for (const [key, value] of Object.entries(snapshot.data)) {
      this.data.set(key, value);
    }

    this.emit('restoredFromSnapshot', { snapshotId, timestamp: Date.now() });
    return true;
  }

  async replayWAL(fromPosition = 0) {
    const entries = this.wal.slice(fromPosition);

    for (const entry of entries) {
      if (entry.type === 'set') {
        this.data.set(entry.key, entry.value);
      } else if (entry.type === 'delete') {
        this.data.delete(entry.key);
      }
    }

    this.emit('walReplayed', { fromPosition, count: entries.length });
    return entries.length;
  }

  // 故障注入方法
  simulateCorruption() {
    this.isCorrupted = true;
    this.emit('corrupted');
  }

  simulateUnavailable() {
    this.isAvailable = false;
    this.emit('unavailable');
  }

  recover() {
    this.isCorrupted = false;
    this.isAvailable = true;
    this.emit('recovered');
  }

  corruptData(key) {
    if (this.data.has(key)) {
      this.data.set(key, 'CORRUPTED_DATA');
    }
  }

  clearWAL() {
    this.wal = [];
  }

  reset() {
    this.data.clear();
    this.wal = [];
    this.snapshots = [];
    this.isCorrupted = false;
    this.isAvailable = true;
  }
}

// ============================================
// 数据恢复管理器
// ============================================

class DataRecoveryManager extends EventEmitter {
  constructor(dataStore, config = {}) {
    super();
    this.dataStore = dataStore;
    this.config = {
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 100,
      validationEnabled: config.validationEnabled || true,
      autoRecovery: config.autoRecovery || true,
      checksumEnabled: config.checksumEnabled || true,
      ...config,
    };

    this.recoveryLog = [];
    this.validationErrors = [];
    this.checksums = new Map();
  }

  // ============================================
  // 数据验证方法
  // ============================================

  calculateChecksum(data) {
    // 简单的校验和实现
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  async validateData(key, data) {
    if (!this.config.validationEnabled) {
      return { valid: true };
    }

    const errors = [];

    // 检查数据是否为 null
    if (data === null || data === undefined) {
      errors.push({ type: 'null_data', key });
    }

    // 检查是否损坏
    if (data === 'CORRUPTED_DATA') {
      errors.push({ type: 'corrupted', key });
    }

    // 校验和验证
    if (this.config.checksumEnabled && this.checksums.has(key)) {
      const expectedChecksum = this.checksums.get(key);
      const actualChecksum = this.calculateChecksum(data);

      if (expectedChecksum !== actualChecksum) {
        errors.push({
          type: 'checksum_mismatch',
          key,
          expected: expectedChecksum,
          actual: actualChecksum,
        });
      }
    }

    if (errors.length > 0) {
      this.validationErrors.push(...errors);
      return { valid: false, errors };
    }

    return { valid: true };
  }

  async validateAllData() {
    const allData = await this.dataStore.getAll();
    const results = {
      valid: [],
      invalid: [],
    };

    for (const [key, value] of Object.entries(allData)) {
      const validation = await this.validateData(key, value);
      if (validation.valid) {
        results.valid.push(key);
      } else {
        results.invalid.push({ key, errors: validation.errors });
      }
    }

    return results;
  }

  // ============================================
  // 数据恢复方法
  // ============================================

  async recoverFromSnapshot() {
    const snapshot = this.dataStore.getLatestSnapshot();
    if (!snapshot) {
      throw new Error('No snapshot available for recovery');
    }

    this._logRecovery('snapshot_recovery_started', { snapshotId: snapshot.id });

    try {
      await this.dataStore.restoreFromSnapshot(snapshot.id);

      // 重放 WAL
      const walReplayed = await this.dataStore.replayWAL(snapshot.walPosition);

      this._logRecovery('snapshot_recovery_completed', {
        snapshotId: snapshot.id,
        walEntriesReplayed: walReplayed,
      });

      this.emit('recoveryCompleted', { method: 'snapshot', snapshotId: snapshot.id });
      return { success: true, method: 'snapshot', walReplayed };
    } catch (error) {
      this._logRecovery('snapshot_recovery_failed', { error: error.message });
      throw error;
    }
  }

  async recoverFromWAL() {
    this._logRecovery('wal_recovery_started');

    try {
      this.dataStore.data.clear();
      const entriesReplayed = await this.dataStore.replayWAL(0);

      this._logRecovery('wal_recovery_completed', { entriesReplayed });

      this.emit('recoveryCompleted', { method: 'wal', entriesReplayed });
      return { success: true, method: 'wal', entriesReplayed };
    } catch (error) {
      this._logRecovery('wal_recovery_failed', { error: error.message });
      throw error;
    }
  }

  async recoverKey(key) {
    this._logRecovery('key_recovery_started', { key });

    // 尝试从最新快照恢复单个 key
    const snapshot = this.dataStore.getLatestSnapshot();
    if (snapshot && snapshot.data[key] !== undefined) {
      await this.dataStore.set(key, snapshot.data[key]);

      // 重放该 key 相关的 WAL
      const walEntries = this.dataStore.wal
        .slice(snapshot.walPosition)
        .filter(e => e.key === key);

      for (const entry of walEntries) {
        if (entry.type === 'set') {
          await this.dataStore.set(entry.key, entry.value);
        } else if (entry.type === 'delete') {
          await this.dataStore.delete(entry.key);
        }
      }

      this._logRecovery('key_recovery_completed', { key });
      return { success: true, key, source: 'snapshot' };
    }

    // 从 WAL 恢复
    const walEntries = this.dataStore.wal.filter(e => e.key === key);
    if (walEntries.length > 0) {
      const lastEntry = walEntries[walEntries.length - 1];
      if (lastEntry.type === 'set') {
        await this.dataStore.set(key, lastEntry.value);
        this._logRecovery('key_recovery_completed', { key, source: 'wal' });
        return { success: true, key, source: 'wal' };
      }
    }

    this._logRecovery('key_recovery_failed', { key, reason: 'no_recovery_source' });
    return { success: false, key, reason: 'No recovery source available' };
  }

  async autoRecover() {
    if (!this.config.autoRecovery) {
      return { success: false, reason: 'Auto recovery disabled' };
    }

    this._logRecovery('auto_recovery_started');

    // 1. 尝试从快照恢复
    try {
      const result = await this.recoverFromSnapshot();
      if (result.success) {
        return result;
      }
    } catch {
      // 继续尝试其他方法
    }

    // 2. 尝试从 WAL 恢复
    try {
      const result = await this.recoverFromWAL();
      if (result.success) {
        return result;
      }
    } catch {
      // 恢复失败
    }

    this._logRecovery('auto_recovery_failed');
    return { success: false, reason: 'All recovery methods failed' };
  }

  // ============================================
  // 一致性检查方法
  // ============================================

  async checkConsistency() {
    const issues = [];

    // 检查数据完整性
    const validation = await this.validateAllData();
    if (validation.invalid.length > 0) {
      issues.push({
        type: 'data_validation_failed',
        details: validation.invalid,
      });
    }

    // 检查 WAL 一致性
    const walIssues = this._checkWALConsistency();
    if (walIssues.length > 0) {
      issues.push({
        type: 'wal_inconsistency',
        details: walIssues,
      });
    }

    return {
      consistent: issues.length === 0,
      issues,
    };
  }

  _checkWALConsistency() {
    const issues = [];
    let prevTimestamp = 0;

    for (let i = 0; i < this.dataStore.wal.length; i++) {
      const entry = this.dataStore.wal[i];

      // 检查时间戳顺序
      if (entry.timestamp < prevTimestamp) {
        issues.push({
          type: 'timestamp_out_of_order',
          position: i,
          timestamp: entry.timestamp,
        });
      }
      prevTimestamp = entry.timestamp;

      // 检查必要字段
      if (!entry.type || !entry.key) {
        issues.push({
          type: 'missing_fields',
          position: i,
        });
      }
    }

    return issues;
  }

  // ============================================
  // 辅助方法
  // ============================================

  _logRecovery(action, details = {}) {
    const entry = {
      action,
      details,
      timestamp: Date.now(),
    };
    this.recoveryLog.push(entry);
    this.emit('recoveryLogEntry', entry);
  }

  storeChecksum(key, data) {
    this.checksums.set(key, this.calculateChecksum(data));
  }

  getRecoveryLog() {
    return [...this.recoveryLog];
  }

  getValidationErrors() {
    return [...this.validationErrors];
  }

  reset() {
    this.recoveryLog = [];
    this.validationErrors = [];
    this.checksums.clear();
  }
}

// ============================================
// 数据恢复 E2E 测试
// ============================================

describe('Data Recovery E2E', () => {
  let env;
  let dataStore;
  let recoveryManager;

  beforeEach(async () => {
    env = new E2ETestEnvironment({
      mode: RUN_MODE.SHADOW,
      initialEquity: 10000,
      symbols: ['BTC/USDT'],
      exchanges: ['binance'],
    });
    await env.setup();

    dataStore = new MockDataStore({
      persistenceDelay: 5,
      enableWAL: true,
    });

    recoveryManager = new DataRecoveryManager(dataStore, {
      maxRetries: 3,
      validationEnabled: true,
      autoRecovery: true,
    });

    await env.start();
  });

  afterEach(async () => {
    await env.teardown();
    dataStore.reset();
    recoveryManager.reset();
  });

  // ============================================
  // 基础数据操作测试
  // ============================================

  describe('基础数据操作', () => {
    it('应该正确存储和读取数据', async () => {
      await dataStore.set('order_1', { id: 1, symbol: 'BTC/USDT', amount: 0.1 });
      const data = await dataStore.get('order_1');

      expect(data).toEqual({ id: 1, symbol: 'BTC/USDT', amount: 0.1 });
    });

    it('应该正确记录 WAL', async () => {
      await dataStore.set('order_1', { id: 1 });
      await dataStore.set('order_2', { id: 2 });
      await dataStore.delete('order_1');

      expect(dataStore.wal.length).toBe(3);
      expect(dataStore.wal[0].type).toBe('set');
      expect(dataStore.wal[2].type).toBe('delete');
    });

    it('应该正确创建快照', async () => {
      await dataStore.set('order_1', { id: 1 });
      await dataStore.set('order_2', { id: 2 });

      const snapshot = dataStore.createSnapshot();

      expect(snapshot.data).toHaveProperty('order_1');
      expect(snapshot.data).toHaveProperty('order_2');
      expect(snapshot.walPosition).toBe(2);
    });
  });

  // ============================================
  // 数据损坏恢复测试
  // ============================================

  describe('数据损坏恢复', () => {
    it('应该检测到数据损坏', async () => {
      await dataStore.set('order_1', { id: 1, symbol: 'BTC/USDT' });

      // 损坏数据
      dataStore.corruptData('order_1');

      const validation = await recoveryManager.validateData('order_1', await dataStore.get('order_1'));

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.type === 'corrupted')).toBe(true);
    });

    it('应该从快照恢复损坏的数据', async () => {
      await dataStore.set('order_1', { id: 1, symbol: 'BTC/USDT' });
      dataStore.createSnapshot();

      // 损坏数据
      dataStore.corruptData('order_1');

      // 恢复
      const result = await recoveryManager.recoverKey('order_1');

      expect(result.success).toBe(true);

      const recovered = await dataStore.get('order_1');
      expect(recovered).toEqual({ id: 1, symbol: 'BTC/USDT' });
    });

    it('应该从 WAL 恢复数据', async () => {
      await dataStore.set('order_1', { id: 1 });
      await dataStore.set('order_1', { id: 1, updated: true });

      // 清空数据但保留 WAL
      dataStore.data.clear();

      const result = await recoveryManager.recoverFromWAL();

      expect(result.success).toBe(true);

      const recovered = await dataStore.get('order_1');
      expect(recovered).toEqual({ id: 1, updated: true });
    });
  });

  // ============================================
  // 快照恢复测试
  // ============================================

  describe('快照恢复', () => {
    it('应该从最新快照恢复', async () => {
      await dataStore.set('order_1', { id: 1 });
      await dataStore.set('order_2', { id: 2 });
      dataStore.createSnapshot();

      await dataStore.set('order_3', { id: 3 });

      // 清空数据
      dataStore.data.clear();

      const result = await recoveryManager.recoverFromSnapshot();

      expect(result.success).toBe(true);
      expect(result.walReplayed).toBe(1); // order_3 的 WAL

      const data = await dataStore.getAll();
      expect(data).toHaveProperty('order_1');
      expect(data).toHaveProperty('order_2');
      expect(data).toHaveProperty('order_3');
    });

    it('应该处理多个快照版本', async () => {
      await dataStore.set('order_1', { version: 1 });
      const snap1 = dataStore.createSnapshot();

      await dataStore.set('order_1', { version: 2 });
      const snap2 = dataStore.createSnapshot();

      await dataStore.set('order_1', { version: 3 });

      // 恢复到第一个快照
      await dataStore.restoreFromSnapshot(snap1.id);
      let data = await dataStore.get('order_1');
      expect(data.version).toBe(1);

      // 恢复到第二个快照
      await dataStore.restoreFromSnapshot(snap2.id);
      data = await dataStore.get('order_1');
      expect(data.version).toBe(2);
    });

    it('应该在没有快照时抛出错误', async () => {
      await expect(recoveryManager.recoverFromSnapshot()).rejects.toThrow('No snapshot available');
    });
  });

  // ============================================
  // WAL 恢复测试
  // ============================================

  describe('WAL 恢复', () => {
    it('应该重放所有 WAL 条目', async () => {
      await dataStore.set('order_1', { id: 1 });
      await dataStore.set('order_2', { id: 2 });
      await dataStore.set('order_1', { id: 1, updated: true });
      await dataStore.delete('order_2');

      // 清空数据
      dataStore.data.clear();

      const result = await recoveryManager.recoverFromWAL();

      expect(result.entriesReplayed).toBe(4);

      const data = await dataStore.getAll();
      expect(data).toHaveProperty('order_1');
      expect(data.order_1.updated).toBe(true);
      expect(data).not.toHaveProperty('order_2');
    });

    it('应该从指定位置重放 WAL', async () => {
      await dataStore.set('order_1', { version: 1 });
      await dataStore.set('order_1', { version: 2 });
      const position = dataStore.wal.length;

      await dataStore.set('order_1', { version: 3 });
      await dataStore.set('order_2', { id: 2 });

      // 重置到 version 2 状态
      dataStore.data.set('order_1', { version: 2 });
      dataStore.data.delete('order_2');

      const replayed = await dataStore.replayWAL(position);

      expect(replayed).toBe(2);

      const data1 = await dataStore.get('order_1');
      const data2 = await dataStore.get('order_2');

      expect(data1.version).toBe(3);
      expect(data2.id).toBe(2);
    });
  });

  // ============================================
  // 自动恢复测试
  // ============================================

  describe('自动恢复', () => {
    it('应该自动选择最佳恢复方法', async () => {
      await dataStore.set('order_1', { id: 1 });
      dataStore.createSnapshot();
      await dataStore.set('order_2', { id: 2 });

      // 清空数据
      dataStore.data.clear();

      const result = await recoveryManager.autoRecover();

      expect(result.success).toBe(true);

      const data = await dataStore.getAll();
      expect(data).toHaveProperty('order_1');
      expect(data).toHaveProperty('order_2');
    });

    it('应该在快照不可用时回退到 WAL', async () => {
      await dataStore.set('order_1', { id: 1 });
      // 不创建快照

      dataStore.data.clear();

      const result = await recoveryManager.autoRecover();

      expect(result.success).toBe(true);
      expect(result.method).toBe('wal');
    });

    it('应该记录恢复日志', async () => {
      await dataStore.set('order_1', { id: 1 });
      dataStore.createSnapshot();
      dataStore.data.clear();

      await recoveryManager.autoRecover();

      const log = recoveryManager.getRecoveryLog();
      expect(log.some(e => e.action.includes('recovery'))).toBe(true);
    });
  });

  // ============================================
  // 数据一致性检查测试
  // ============================================

  describe('数据一致性检查', () => {
    it('应该检测到一致的数据', async () => {
      await dataStore.set('order_1', { id: 1 });
      await dataStore.set('order_2', { id: 2 });

      const result = await recoveryManager.checkConsistency();

      expect(result.consistent).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('应该检测到损坏的数据', async () => {
      await dataStore.set('order_1', { id: 1 });
      dataStore.corruptData('order_1');

      const result = await recoveryManager.checkConsistency();

      expect(result.consistent).toBe(false);
      expect(result.issues.some(i => i.type === 'data_validation_failed')).toBe(true);
    });

    it('应该检测到校验和不匹配', async () => {
      const data = { id: 1, amount: 100 };
      await dataStore.set('order_1', data);
      recoveryManager.storeChecksum('order_1', data);

      // 修改数据但不更新校验和
      await dataStore.set('order_1', { id: 1, amount: 200 });

      const validation = await recoveryManager.validateData(
        'order_1',
        await dataStore.get('order_1')
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.type === 'checksum_mismatch')).toBe(true);
    });
  });

  // ============================================
  // 存储不可用测试
  // ============================================

  describe('存储不可用处理', () => {
    it('应该处理存储不可用', async () => {
      await dataStore.set('order_1', { id: 1 });

      dataStore.simulateUnavailable();

      await expect(dataStore.get('order_1')).rejects.toThrow('unavailable');
    });

    it('应该在存储恢复后正常工作', async () => {
      await dataStore.set('order_1', { id: 1 });

      dataStore.simulateUnavailable();
      dataStore.recover();

      const data = await dataStore.get('order_1');
      expect(data).toEqual({ id: 1 });
    });

    it('应该在重试后成功', async () => {
      await dataStore.set('order_1', { id: 1 });

      let attempts = 0;
      const originalGet = dataStore.get.bind(dataStore);

      dataStore.get = async (key) => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary unavailable');
        }
        return originalGet(key);
      };

      // 简单重试逻辑
      let result = null;
      for (let i = 0; i < 3; i++) {
        try {
          result = await dataStore.get('order_1');
          break;
        } catch {
          await testUtils.delay(10);
        }
      }

      expect(result).toEqual({ id: 1 });
      expect(attempts).toBe(3);
    });
  });

  // ============================================
  // 并发恢复测试
  // ============================================

  describe('并发恢复', () => {
    it('应该处理并发写入和恢复', async () => {
      // 模拟并发写入
      const writePromises = [];
      for (let i = 0; i < 10; i++) {
        writePromises.push(dataStore.set(`order_${i}`, { id: i }));
      }

      await Promise.all(writePromises);
      dataStore.createSnapshot();

      // 清空并恢复
      dataStore.data.clear();

      await recoveryManager.recoverFromSnapshot();

      const data = await dataStore.getAll();
      expect(Object.keys(data).length).toBe(10);
    });

    it('应该在恢复过程中保持数据一致', async () => {
      for (let i = 0; i < 5; i++) {
        await dataStore.set(`order_${i}`, { id: i, value: i * 100 });
      }
      dataStore.createSnapshot();

      for (let i = 5; i < 10; i++) {
        await dataStore.set(`order_${i}`, { id: i, value: i * 100 });
      }

      dataStore.data.clear();

      await recoveryManager.recoverFromSnapshot();

      // 验证所有数据
      const data = await dataStore.getAll();
      for (let i = 0; i < 10; i++) {
        expect(data[`order_${i}`]).toEqual({ id: i, value: i * 100 });
      }
    });
  });

  // ============================================
  // 交易数据恢复测试
  // ============================================

  describe('交易数据恢复', () => {
    it('应该恢复订单状态', async () => {
      const order = {
        id: 'order_123',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        status: 'open',
        createdAt: Date.now(),
      };

      await dataStore.set('order_123', order);
      dataStore.createSnapshot();

      // 更新订单状态
      order.status = 'filled';
      order.filledAt = Date.now();
      await dataStore.set('order_123', order);

      // 模拟崩溃
      dataStore.data.clear();

      await recoveryManager.recoverFromSnapshot();

      const recovered = await dataStore.get('order_123');
      expect(recovered.status).toBe('filled');
    });

    it('应该恢复持仓数据', async () => {
      const positions = {
        'BTC/USDT': { amount: 0.5, avgPrice: 50000, pnl: 100 },
        'ETH/USDT': { amount: 5, avgPrice: 3000, pnl: -50 },
      };

      await dataStore.set('positions', positions);
      dataStore.createSnapshot();

      dataStore.data.clear();
      await recoveryManager.recoverFromSnapshot();

      const recovered = await dataStore.get('positions');
      expect(recovered['BTC/USDT'].amount).toBe(0.5);
      expect(recovered['ETH/USDT'].pnl).toBe(-50);
    });

    it('应该恢复风控状态', async () => {
      const riskState = {
        dailyPnL: -500,
        maxEquity: 10500,
        currentEquity: 9800,
        tradingAllowed: true,
        riskLevel: 1,
      };

      await dataStore.set('risk_state', riskState);
      dataStore.createSnapshot();

      dataStore.data.clear();
      await recoveryManager.recoverFromSnapshot();

      const recovered = await dataStore.get('risk_state');
      expect(recovered.dailyPnL).toBe(-500);
      expect(recovered.riskLevel).toBe(1);
    });
  });

  // ============================================
  // 事件测试
  // ============================================

  describe('恢复事件', () => {
    it('应该发出数据写入事件', async () => {
      const events = [];
      dataStore.on('dataWritten', (data) => events.push(data));

      await dataStore.set('order_1', { id: 1 });

      expect(events.length).toBe(1);
      expect(events[0].key).toBe('order_1');
    });

    it('应该发出快照创建事件', async () => {
      const events = [];
      dataStore.on('snapshotCreated', (snapshot) => events.push(snapshot));

      await dataStore.set('order_1', { id: 1 });
      dataStore.createSnapshot();

      expect(events.length).toBe(1);
      expect(events[0].id).toContain('snap_');
    });

    it('应该发出恢复完成事件', async () => {
      const events = [];
      recoveryManager.on('recoveryCompleted', (data) => events.push(data));

      await dataStore.set('order_1', { id: 1 });
      dataStore.createSnapshot();
      dataStore.data.clear();

      await recoveryManager.recoverFromSnapshot();

      expect(events.length).toBe(1);
      expect(events[0].method).toBe('snapshot');
    });
  });

  // ============================================
  // 综合场景测试
  // ============================================

  describe('综合场景', () => {
    it('应该处理完整的崩溃恢复流程', async () => {
      // 1. 正常操作
      for (let i = 0; i < 5; i++) {
        await dataStore.set(`order_${i}`, {
          id: i,
          symbol: 'BTC/USDT',
          status: 'open',
        });
      }

      // 2. 创建快照
      dataStore.createSnapshot();

      // 3. 更多操作
      for (let i = 5; i < 10; i++) {
        await dataStore.set(`order_${i}`, {
          id: i,
          symbol: 'ETH/USDT',
          status: 'filled',
        });
      }

      // 4. 模拟崩溃
      dataStore.data.clear();

      // 5. 恢复
      const result = await recoveryManager.autoRecover();
      expect(result.success).toBe(true);

      // 6. 验证数据
      const data = await dataStore.getAll();
      expect(Object.keys(data).length).toBe(10);

      // 7. 验证一致性
      const consistency = await recoveryManager.checkConsistency();
      expect(consistency.consistent).toBe(true);
    });

    it('应该处理部分数据损坏场景', async () => {
      // 1. 初始化数据
      await dataStore.set('order_1', { id: 1, critical: true });
      await dataStore.set('order_2', { id: 2, critical: false });
      await dataStore.set('order_3', { id: 3, critical: true });
      dataStore.createSnapshot();

      // 2. 损坏部分数据
      dataStore.corruptData('order_2');

      // 3. 检测损坏
      const validation = await recoveryManager.validateAllData();
      expect(validation.invalid.length).toBe(1);
      expect(validation.invalid[0].key).toBe('order_2');

      // 4. 恢复损坏的 key
      await recoveryManager.recoverKey('order_2');

      // 5. 验证恢复
      const recovered = await dataStore.get('order_2');
      expect(recovered).toEqual({ id: 2, critical: false });
    });
  });
});
