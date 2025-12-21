/**
 * 备份管理器
 * Backup Manager
 *
 * 提供自动备份和恢复功能
 * Provides automatic backup and recovery functionality
 *
 * @module src/database/BackupManager
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * 备份管理器类
 * Backup Manager Class
 */
class BackupManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // 备份目录
      backupDir: config.backupDir || process.env.BACKUP_DIR || './backups',
      // 保留天数
      retentionDays: config.retentionDays || 30,
      // 保留的最小备份数
      minBackups: config.minBackups || 5,
      // 最大备份数
      maxBackups: config.maxBackups || 100,
      // 是否压缩备份
      compress: config.compress ?? true,
      // 是否加密备份
      encrypt: config.encrypt ?? false,
      // 加密密钥
      encryptionKey: config.encryptionKey || process.env.BACKUP_ENCRYPTION_KEY,
      // 备份计划 (cron 格式或间隔毫秒)
      scheduleInterval: config.scheduleInterval || 24 * 60 * 60 * 1000, // 24小时
      // 备份文件前缀
      filePrefix: config.filePrefix || 'backup',
    };

    // 确保备份目录存在
    this._ensureBackupDir();

    // 定时器
    this.scheduleTimer = null;

    // 备份历史
    this.backupHistory = [];

    // 加载备份历史
    this._loadBackupHistory();
  }

  /**
   * 确保备份目录存在
   * @private
   */
  _ensureBackupDir() {
    if (!fs.existsSync(this.config.backupDir)) {
      fs.mkdirSync(this.config.backupDir, { recursive: true });
    }
  }

  /**
   * 加载备份历史
   * @private
   */
  _loadBackupHistory() {
    const historyFile = path.join(this.config.backupDir, 'backup-history.json');

    try {
      if (fs.existsSync(historyFile)) {
        const content = fs.readFileSync(historyFile, 'utf8');
        this.backupHistory = JSON.parse(content);
      }
    } catch (error) {
      console.error('[BackupManager] 加载备份历史失败:', error.message);
      this.backupHistory = [];
    }
  }

  /**
   * 保存备份历史
   * @private
   */
  _saveBackupHistory() {
    const historyFile = path.join(this.config.backupDir, 'backup-history.json');

    try {
      fs.writeFileSync(historyFile, JSON.stringify(this.backupHistory, null, 2));
    } catch (error) {
      console.error('[BackupManager] 保存备份历史失败:', error.message);
    }
  }

  /**
   * 创建备份
   * @param {Object} db - 数据库管理器实例
   * @param {Object} options - 备份选项
   * @returns {Promise<Object>} 备份信息
   */
  async createBackup(db, options = {}) {
    const startTime = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const type = options.type || 'scheduled';

    try {
      // 导出数据库
      const data = db.db.export();
      let buffer = Buffer.from(data);

      // 计算原始数据哈希
      const originalHash = this._computeHash(buffer);

      // 压缩
      if (this.config.compress) {
        buffer = await gzip(buffer);
      }

      // 加密
      if (this.config.encrypt && this.config.encryptionKey) {
        buffer = this._encrypt(buffer);
      }

      // 生成文件名
      const extension = this.config.compress ? '.db.gz' : '.db';
      const encryptedExt = this.config.encrypt ? '.enc' : '';
      const filename = `${this.config.filePrefix}-${timestamp}${extension}${encryptedExt}`;
      const filepath = path.join(this.config.backupDir, filename);

      // 写入文件
      await fs.promises.writeFile(filepath, buffer);

      // 备份信息
      const backupInfo = {
        id: crypto.randomBytes(8).toString('hex'),
        filename,
        filepath,
        timestamp: new Date().toISOString(),
        type,
        size: buffer.length,
        originalSize: data.length,
        compressed: this.config.compress,
        encrypted: this.config.encrypt,
        hash: originalHash,
        duration: Date.now() - startTime,
        verified: false,
      };

      // 添加到历史
      this.backupHistory.push(backupInfo);
      this._saveBackupHistory();

      // 清理旧备份
      await this.cleanupOldBackups();

      this.emit('backup', backupInfo);

      return backupInfo;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 恢复备份
   * @param {Object} db - 数据库管理器实例
   * @param {string} backupId - 备份ID或文件名
   * @returns {Promise<boolean>} 恢复是否成功
   */
  async restoreBackup(db, backupId) {
    try {
      // 查找备份
      const backup = this.backupHistory.find(
        b => b.id === backupId || b.filename === backupId
      );

      if (!backup) {
        throw new Error(`备份不存在: ${backupId}`);
      }

      // 读取备份文件
      let buffer = await fs.promises.readFile(backup.filepath);

      // 解密
      if (backup.encrypted) {
        if (!this.config.encryptionKey) {
          throw new Error('需要加密密钥来恢复加密备份');
        }
        buffer = this._decrypt(buffer);
      }

      // 解压
      if (backup.compressed) {
        buffer = await gunzip(buffer);
      }

      // 验证哈希
      const hash = this._computeHash(buffer);
      if (hash !== backup.hash) {
        throw new Error('备份数据校验失败，文件可能已损坏');
      }

      // 关闭当前数据库
      if (db.db) {
        db.db.close();
      }

      // 恢复数据库
      db.db = new db.SQL.Database(new Uint8Array(buffer));
      db.isInitialized = true;

      this.emit('restore', backup);

      return true;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 验证备份
   * @param {string} backupId - 备份ID
   * @returns {Promise<Object>} 验证结果
   */
  async verifyBackup(backupId) {
    const backup = this.backupHistory.find(
      b => b.id === backupId || b.filename === backupId
    );

    if (!backup) {
      return { valid: false, error: '备份不存在' };
    }

    try {
      // 检查文件是否存在
      if (!fs.existsSync(backup.filepath)) {
        return { valid: false, error: '备份文件不存在' };
      }

      // 读取并验证
      let buffer = await fs.promises.readFile(backup.filepath);

      // 解密
      if (backup.encrypted) {
        if (!this.config.encryptionKey) {
          return { valid: false, error: '缺少加密密钥' };
        }
        buffer = this._decrypt(buffer);
      }

      // 解压
      if (backup.compressed) {
        buffer = await gunzip(buffer);
      }

      // 验证哈希
      const hash = this._computeHash(buffer);
      const valid = hash === backup.hash;

      // 更新验证状态
      if (valid) {
        backup.verified = true;
        backup.lastVerified = new Date().toISOString();
        this._saveBackupHistory();
      }

      return {
        valid,
        hash,
        expectedHash: backup.hash,
        size: buffer.length,
        error: valid ? null : '哈希不匹配',
      };

    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * 清理旧备份
   * @returns {Promise<Array>} 删除的备份列表
   */
  async cleanupOldBackups() {
    const deleted = [];
    const now = Date.now();
    const cutoffTime = now - this.config.retentionDays * 24 * 60 * 60 * 1000;

    // 按时间排序
    this.backupHistory.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 标记要删除的备份
    const toDelete = [];
    let kept = 0;

    for (const backup of this.backupHistory) {
      const backupTime = new Date(backup.timestamp).getTime();

      // 保留最少备份数
      if (kept < this.config.minBackups) {
        kept++;
        continue;
      }

      // 超过最大备份数或超过保留期限
      if (kept >= this.config.maxBackups || backupTime < cutoffTime) {
        toDelete.push(backup);
      } else {
        kept++;
      }
    }

    // 删除备份
    for (const backup of toDelete) {
      try {
        if (fs.existsSync(backup.filepath)) {
          await fs.promises.unlink(backup.filepath);
        }

        // 从历史中移除
        const index = this.backupHistory.findIndex(b => b.id === backup.id);
        if (index !== -1) {
          this.backupHistory.splice(index, 1);
        }

        deleted.push(backup);

      } catch (error) {
        console.error(`[BackupManager] 删除备份失败 ${backup.filename}:`, error.message);
      }
    }

    if (deleted.length > 0) {
      this._saveBackupHistory();
      this.emit('cleanup', deleted);
    }

    return deleted;
  }

  /**
   * 获取备份列表
   * @param {Object} options - 查询选项
   * @returns {Array} 备份列表
   */
  getBackups(options = {}) {
    let backups = [...this.backupHistory];

    // 按时间排序
    backups.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 筛选类型
    if (options.type) {
      backups = backups.filter(b => b.type === options.type);
    }

    // 限制数量
    if (options.limit) {
      backups = backups.slice(0, options.limit);
    }

    return backups;
  }

  /**
   * 获取最新备份
   * @returns {Object|null} 最新备份信息
   */
  getLatestBackup() {
    const backups = this.getBackups({ limit: 1 });
    return backups.length > 0 ? backups[0] : null;
  }

  /**
   * 启动定时备份
   * @param {Object} db - 数据库管理器实例
   */
  startScheduledBackups(db) {
    if (this.scheduleTimer) {
      this.stopScheduledBackups();
    }

    // 立即执行一次备份
    this.createBackup(db, { type: 'scheduled' }).catch(err => {
      console.error('[BackupManager] 初始备份失败:', err.message);
    });

    // 设置定时器
    this.scheduleTimer = setInterval(async () => {
      try {
        await this.createBackup(db, { type: 'scheduled' });
      } catch (error) {
        console.error('[BackupManager] 定时备份失败:', error.message);
        this.emit('error', error);
      }
    }, this.config.scheduleInterval);

    this.emit('started');
  }

  /**
   * 停止定时备份
   */
  stopScheduledBackups() {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
      this.emit('stopped');
    }
  }

  /**
   * 获取备份统计
   * @returns {Object} 统计信息
   */
  getStats() {
    const backups = this.backupHistory;

    let totalSize = 0;
    let verifiedCount = 0;

    for (const backup of backups) {
      totalSize += backup.size || 0;
      if (backup.verified) verifiedCount++;
    }

    return {
      totalBackups: backups.length,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      verifiedCount,
      oldestBackup: backups.length > 0 ?
        backups.reduce((oldest, b) =>
          new Date(b.timestamp) < new Date(oldest.timestamp) ? b : oldest
        ).timestamp : null,
      newestBackup: backups.length > 0 ?
        backups.reduce((newest, b) =>
          new Date(b.timestamp) > new Date(newest.timestamp) ? b : newest
        ).timestamp : null,
      isScheduling: this.scheduleTimer !== null,
    };
  }

  // ============================================
  // 私有方法 Private Methods
  // ============================================

  /**
   * 计算数据哈希
   * @private
   */
  _computeHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * 加密数据
   * @private
   */
  _encrypt(buffer) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(buffer),
      cipher.final(),
    ]);

    // 前16字节是 IV
    return Buffer.concat([iv, encrypted]);
  }

  /**
   * 解密数据
   * @private
   */
  _decrypt(buffer) {
    const iv = buffer.subarray(0, 16);
    const encrypted = buffer.subarray(16);

    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
  }
}

export { BackupManager };
export default BackupManager;
