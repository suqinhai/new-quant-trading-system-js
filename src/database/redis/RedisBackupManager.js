/**
 * Redis 备份管理器
 * Redis Backup Manager
 *
 * 实现 Redis 数据备份、恢复和持久化管理
 * Implements Redis data backup, recovery, and persistence management
 *
 * DB-013: 配置 Redis AOF 持久化
 * DB-014: 配置 Redis RDB 定期快照
 * DB-015: 实现 Redis 数据恢复机制
 * DB-016: Redis 数据备份策略
 *
 * @module src/database/redis/RedisBackupManager
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
 * 备份类型枚举
 * Backup type enum
 */
const BACKUP_TYPE = {
  RDB: 'rdb',           // RDB 快照 / RDB snapshot
  AOF: 'aof',           // AOF 重写 / AOF rewrite
  JSON: 'json',         // JSON 导出 / JSON export
  FULL: 'full',         // 完整备份 (RDB + JSON) / Full backup
};

/**
 * 备份状态枚举
 * Backup status enum
 */
const BACKUP_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // 备份目录 / Backup directory
  backupDir: process.env.REDIS_BACKUP_DIR || './backups/redis',
  // 保留天数 / Retention days
  retentionDays: 30,
  // 最小保留备份数 / Min backups to keep
  minBackups: 5,
  // 最大备份数 / Max backups
  maxBackups: 100,
  // 是否压缩 JSON 备份 / Compress JSON backups
  compress: true,
  // 是否加密备份 / Encrypt backups
  encrypt: false,
  // 加密密钥 / Encryption key
  encryptionKey: process.env.REDIS_BACKUP_ENCRYPTION_KEY,
  // 定时备份间隔 (ms) / Scheduled backup interval
  scheduleInterval: 6 * 60 * 60 * 1000, // 6 hours
  // JSON 备份间隔 (ms) / JSON backup interval
  jsonBackupInterval: 24 * 60 * 60 * 1000, // 24 hours
  // 扫描批量大小 / Scan batch size
  scanBatchSize: 1000,
  // 备份超时 (ms) / Backup timeout
  backupTimeout: 30 * 60 * 1000, // 30 minutes
  // 键前缀 / Key prefix to backup
  keyPrefix: process.env.REDIS_PREFIX || 'quant:',
};

/**
 * Redis 备份管理器类
 * Redis Backup Manager Class
 */
class RedisBackupManager extends EventEmitter {
  constructor(redisClient, config = {}) {
    super();

    this.redis = redisClient;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 确保备份目录存在 / Ensure backup directory exists
    this._ensureBackupDir();

    // 定时器 / Timers
    this.rdbTimer = null;
    this.jsonTimer = null;

    // 状态 / State
    this.isRunning = false;
    this.currentBackup = null;

    // 备份历史 / Backup history
    this.backupHistory = [];
    this._loadBackupHistory();

    // 统计 / Statistics
    this.stats = {
      totalBackups: 0,
      successfulBackups: 0,
      failedBackups: 0,
      lastBackupTime: null,
      lastRestoreTime: null,
      totalDataSize: 0,
    };
  }

  /**
   * 确保备份目录存在
   * Ensure backup directory exists
   * @private
   */
  _ensureBackupDir() {
    const dirs = [
      this.config.backupDir,
      path.join(this.config.backupDir, 'rdb'),
      path.join(this.config.backupDir, 'json'),
      path.join(this.config.backupDir, 'aof'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * 加载备份历史
   * Load backup history
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
      console.error('[RedisBackupManager] 加载备份历史失败:', error.message);
      this.backupHistory = [];
    }
  }

  /**
   * 保存备份历史
   * Save backup history
   * @private
   */
  _saveBackupHistory() {
    const historyFile = path.join(this.config.backupDir, 'backup-history.json');

    try {
      fs.writeFileSync(historyFile, JSON.stringify(this.backupHistory, null, 2));
    } catch (error) {
      console.error('[RedisBackupManager] 保存备份历史失败:', error.message);
    }
  }

  // ============================================
  // 启动/停止 / Start/Stop
  // ============================================

  /**
   * 启动定时备份
   * Start scheduled backups
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // 启动 RDB 定时备份 / Start RDB scheduled backup
    if (this.config.scheduleInterval > 0) {
      this.rdbTimer = setInterval(async () => {
        try {
          await this.triggerRDBSave();
        } catch (error) {
          this.emit('error', { type: 'rdb', error });
        }
      }, this.config.scheduleInterval);
    }

    // 启动 JSON 定时备份 / Start JSON scheduled backup
    if (this.config.jsonBackupInterval > 0) {
      this.jsonTimer = setInterval(async () => {
        try {
          await this.createJSONBackup();
        } catch (error) {
          this.emit('error', { type: 'json', error });
        }
      }, this.config.jsonBackupInterval);
    }

    this.emit('started');
  }

  /**
   * 停止定时备份
   * Stop scheduled backups
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.rdbTimer) {
      clearInterval(this.rdbTimer);
      this.rdbTimer = null;
    }

    if (this.jsonTimer) {
      clearInterval(this.jsonTimer);
      this.jsonTimer = null;
    }

    this.emit('stopped');
  }

  // ============================================
  // RDB 备份 / RDB Backup (DB-014)
  // ============================================

  /**
   * 触发 RDB 后台保存
   * Trigger RDB background save
   *
   * @returns {Promise<Object>} 备份结果 / Backup result
   */
  async triggerRDBSave() {
    const startTime = Date.now();
    const backupId = this._generateBackupId();

    const backupInfo = {
      id: backupId,
      type: BACKUP_TYPE.RDB,
      status: BACKUP_STATUS.IN_PROGRESS,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      error: null,
    };

    this.currentBackup = backupInfo;
    this.emit('backup:start', backupInfo);

    try {
      // 获取当前 RDB 保存状态 / Get current RDB save status
      const infoBefore = await this._getRedisInfo('persistence');
      const lastSaveBefore = this._parseLastSave(infoBefore);

      // 触发后台保存 / Trigger background save
      await this.redis.client.bgSave();

      // 等待保存完成 / Wait for save to complete
      await this._waitForRDBComplete(lastSaveBefore);

      // 复制 RDB 文件到备份目录 / Copy RDB file to backup directory
      const rdbPath = await this._copyRDBFile(backupId);

      backupInfo.status = BACKUP_STATUS.COMPLETED;
      backupInfo.endTime = new Date().toISOString();
      backupInfo.duration = Date.now() - startTime;
      backupInfo.filepath = rdbPath;

      if (rdbPath && fs.existsSync(rdbPath)) {
        backupInfo.size = fs.statSync(rdbPath).size;
      }

      this.stats.totalBackups++;
      this.stats.successfulBackups++;
      this.stats.lastBackupTime = backupInfo.endTime;

      this.backupHistory.push(backupInfo);
      this._saveBackupHistory();

      await this._cleanupOldBackups();

      this.emit('backup:complete', backupInfo);

      return backupInfo;

    } catch (error) {
      backupInfo.status = BACKUP_STATUS.FAILED;
      backupInfo.endTime = new Date().toISOString();
      backupInfo.duration = Date.now() - startTime;
      backupInfo.error = error.message;

      this.stats.totalBackups++;
      this.stats.failedBackups++;

      this.backupHistory.push(backupInfo);
      this._saveBackupHistory();

      this.emit('backup:error', { backup: backupInfo, error });

      throw error;

    } finally {
      this.currentBackup = null;
    }
  }

  /**
   * 等待 RDB 保存完成
   * Wait for RDB save to complete
   * @private
   */
  async _waitForRDBComplete(lastSaveBefore, timeout = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const info = await this._getRedisInfo('persistence');
      const currentLastSave = this._parseLastSave(info);
      const bgsaveInProgress = info.includes('rdb_bgsave_in_progress:1');

      if (!bgsaveInProgress && currentLastSave > lastSaveBefore) {
        return true;
      }

      await this._sleep(500);
    }

    throw new Error('RDB save timeout');
  }

  /**
   * 解析最后保存时间
   * Parse last save time
   * @private
   */
  _parseLastSave(info) {
    const match = info.match(/rdb_last_save_time:(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * 复制 RDB 文件
   * Copy RDB file
   * @private
   */
  async _copyRDBFile(backupId) {
    // 获取 Redis 配置中的 RDB 路径 / Get RDB path from Redis config
    const info = await this._getRedisInfo('server');
    const configDir = await this.redis.client.configGet('dir');
    const configDbfilename = await this.redis.client.configGet('dbfilename');

    const rdbDir = configDir.dir || '/data/redis';
    const rdbFilename = configDbfilename.dbfilename || 'dump.rdb';
    const sourcePath = path.join(rdbDir, rdbFilename);

    // 目标路径 / Target path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const targetFilename = `dump-${timestamp}-${backupId}.rdb`;
    const targetPath = path.join(this.config.backupDir, 'rdb', targetFilename);

    // 复制文件 / Copy file (如果源文件存在)
    if (fs.existsSync(sourcePath)) {
      await fs.promises.copyFile(sourcePath, targetPath);
      return targetPath;
    }

    // 如果无法访问 RDB 文件，记录警告 / Log warning if RDB file not accessible
    console.warn('[RedisBackupManager] 无法访问 RDB 文件:', sourcePath);
    return null;
  }

  // ============================================
  // AOF 备份 / AOF Backup (DB-013)
  // ============================================

  /**
   * 触发 AOF 重写
   * Trigger AOF rewrite
   *
   * @returns {Promise<Object>} 结果 / Result
   */
  async triggerAOFRewrite() {
    const startTime = Date.now();

    try {
      // 检查 AOF 是否启用 / Check if AOF is enabled
      const config = await this.redis.client.configGet('appendonly');

      if (config.appendonly !== 'yes') {
        throw new Error('AOF is not enabled');
      }

      // 触发 AOF 重写 / Trigger AOF rewrite
      await this.redis.client.bgRewriteAof();

      // 等待重写完成 / Wait for rewrite to complete
      await this._waitForAOFRewriteComplete();

      const result = {
        success: true,
        duration: Date.now() - startTime,
        message: 'AOF rewrite completed',
      };

      this.emit('aof:rewrite', result);

      return result;

    } catch (error) {
      this.emit('error', { type: 'aof', error });
      throw error;
    }
  }

  /**
   * 等待 AOF 重写完成
   * Wait for AOF rewrite to complete
   * @private
   */
  async _waitForAOFRewriteComplete(timeout = 300000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const info = await this._getRedisInfo('persistence');
      const rewriteInProgress = info.includes('aof_rewrite_in_progress:1');

      if (!rewriteInProgress) {
        return true;
      }

      await this._sleep(1000);
    }

    throw new Error('AOF rewrite timeout');
  }

  /**
   * 获取 AOF 状态
   * Get AOF status
   */
  async getAOFStatus() {
    const info = await this._getRedisInfo('persistence');
    const config = await this.redis.client.configGet('appendonly');

    return {
      enabled: config.appendonly === 'yes',
      rewriteInProgress: info.includes('aof_rewrite_in_progress:1'),
      currentSize: this._parseInfoValue(info, 'aof_current_size'),
      baseSize: this._parseInfoValue(info, 'aof_base_size'),
      lastRewriteTime: this._parseInfoValue(info, 'aof_last_rewrite_time_sec'),
      lastBgrewriteStatus: this._parseInfoString(info, 'aof_last_bgrewrite_status'),
    };
  }

  // ============================================
  // JSON 备份 / JSON Backup (DB-016)
  // ============================================

  /**
   * 创建 JSON 备份
   * Create JSON backup
   *
   * @param {Object} options - 备份选项 / Backup options
   * @returns {Promise<Object>} 备份信息 / Backup info
   */
  async createJSONBackup(options = {}) {
    const startTime = Date.now();
    const backupId = this._generateBackupId();
    const type = options.type || 'scheduled';

    const backupInfo = {
      id: backupId,
      type: BACKUP_TYPE.JSON,
      subtype: type,
      status: BACKUP_STATUS.IN_PROGRESS,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      keyCount: 0,
      size: 0,
      compressed: this.config.compress,
      encrypted: this.config.encrypt,
      error: null,
    };

    this.currentBackup = backupInfo;
    this.emit('backup:start', backupInfo);

    try {
      // 导出所有数据 / Export all data
      const data = await this._exportAllData(options);

      backupInfo.keyCount = data.metadata.totalKeys;

      // 序列化 / Serialize
      let buffer = Buffer.from(JSON.stringify(data, null, 2));
      const originalSize = buffer.length;

      // 计算哈希 / Calculate hash
      const hash = this._computeHash(buffer);

      // 压缩 / Compress
      if (this.config.compress) {
        buffer = await gzip(buffer);
      }

      // 加密 / Encrypt
      if (this.config.encrypt && this.config.encryptionKey) {
        buffer = this._encrypt(buffer);
      }

      // 生成文件名 / Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = this.config.compress ? '.json.gz' : '.json';
      const encExt = this.config.encrypt ? '.enc' : '';
      const filename = `backup-${timestamp}-${backupId}${ext}${encExt}`;
      const filepath = path.join(this.config.backupDir, 'json', filename);

      // 写入文件 / Write file
      await fs.promises.writeFile(filepath, buffer);

      backupInfo.status = BACKUP_STATUS.COMPLETED;
      backupInfo.endTime = new Date().toISOString();
      backupInfo.duration = Date.now() - startTime;
      backupInfo.filepath = filepath;
      backupInfo.size = buffer.length;
      backupInfo.originalSize = originalSize;
      backupInfo.hash = hash;

      this.stats.totalBackups++;
      this.stats.successfulBackups++;
      this.stats.lastBackupTime = backupInfo.endTime;
      this.stats.totalDataSize += buffer.length;

      this.backupHistory.push(backupInfo);
      this._saveBackupHistory();

      await this._cleanupOldBackups();

      this.emit('backup:complete', backupInfo);

      return backupInfo;

    } catch (error) {
      backupInfo.status = BACKUP_STATUS.FAILED;
      backupInfo.endTime = new Date().toISOString();
      backupInfo.duration = Date.now() - startTime;
      backupInfo.error = error.message;

      this.stats.totalBackups++;
      this.stats.failedBackups++;

      this.backupHistory.push(backupInfo);
      this._saveBackupHistory();

      this.emit('backup:error', { backup: backupInfo, error });

      throw error;

    } finally {
      this.currentBackup = null;
    }
  }

  /**
   * 导出所有数据
   * Export all data
   * @private
   */
  async _exportAllData(options = {}) {
    const pattern = options.pattern || `${this.config.keyPrefix}*`;
    const data = {
      metadata: {
        version: '1.0',
        exportTime: new Date().toISOString(),
        keyPrefix: this.config.keyPrefix,
        totalKeys: 0,
        keyTypes: {},
      },
      keys: {},
    };

    // 扫描所有键 / Scan all keys
    let cursor = 0;
    const scannedKeys = [];

    do {
      const result = await this.redis.client.scan(cursor, {
        MATCH: pattern,
        COUNT: this.config.scanBatchSize,
      });

      cursor = result.cursor;
      scannedKeys.push(...result.keys);

    } while (cursor !== 0);

    data.metadata.totalKeys = scannedKeys.length;

    // 导出每个键 / Export each key
    for (const key of scannedKeys) {
      try {
        const keyType = await this.redis.client.type(key);
        const ttl = await this.redis.client.ttl(key);

        data.metadata.keyTypes[keyType] = (data.metadata.keyTypes[keyType] || 0) + 1;

        const keyData = {
          type: keyType,
          ttl: ttl > 0 ? ttl : null,
          value: null,
        };

        // 根据类型获取值 / Get value by type
        switch (keyType) {
          case 'string':
            keyData.value = await this.redis.client.get(key);
            break;
          case 'hash':
            keyData.value = await this.redis.client.hGetAll(key);
            break;
          case 'list':
            keyData.value = await this.redis.client.lRange(key, 0, -1);
            break;
          case 'set':
            keyData.value = await this.redis.client.sMembers(key);
            break;
          case 'zset':
            const members = await this.redis.client.zRangeWithScores(key, 0, -1);
            keyData.value = members.map(m => ({ value: m.value, score: m.score }));
            break;
          default:
            keyData.value = null;
        }

        data.keys[key] = keyData;

      } catch (error) {
        console.warn(`[RedisBackupManager] 导出键失败 ${key}:`, error.message);
      }
    }

    return data;
  }

  // ============================================
  // 数据恢复 / Data Recovery (DB-015)
  // ============================================

  /**
   * 从 JSON 备份恢复数据
   * Restore data from JSON backup
   *
   * @param {string} backupId - 备份 ID 或文件名 / Backup ID or filename
   * @param {Object} options - 恢复选项 / Restore options
   * @returns {Promise<Object>} 恢复结果 / Restore result
   */
  async restoreFromJSON(backupId, options = {}) {
    const startTime = Date.now();

    // 查找备份 / Find backup
    const backup = this.backupHistory.find(
      b => b.id === backupId || b.filepath?.includes(backupId)
    );

    if (!backup && !fs.existsSync(backupId)) {
      throw new Error(`备份不存在: ${backupId}`);
    }

    const filepath = backup?.filepath || backupId;

    this.emit('restore:start', { backupId, filepath });

    try {
      // 读取备份文件 / Read backup file
      let buffer = await fs.promises.readFile(filepath);

      // 解密 / Decrypt
      if (backup?.encrypted || filepath.endsWith('.enc')) {
        if (!this.config.encryptionKey) {
          throw new Error('需要加密密钥来恢复加密备份');
        }
        buffer = this._decrypt(buffer);
      }

      // 解压 / Decompress
      if (backup?.compressed || filepath.includes('.gz')) {
        buffer = await gunzip(buffer);
      }

      // 验证哈希 / Verify hash
      if (backup?.hash) {
        const hash = this._computeHash(buffer);
        if (hash !== backup.hash) {
          throw new Error('备份数据校验失败，文件可能已损坏');
        }
      }

      // 解析 JSON / Parse JSON
      const data = JSON.parse(buffer.toString('utf8'));

      // 恢复数据 / Restore data
      const result = await this._restoreData(data, options);

      result.duration = Date.now() - startTime;

      this.stats.lastRestoreTime = new Date().toISOString();

      this.emit('restore:complete', result);

      return result;

    } catch (error) {
      this.emit('restore:error', { backupId, error });
      throw error;
    }
  }

  /**
   * 恢复数据到 Redis
   * Restore data to Redis
   * @private
   */
  async _restoreData(data, options = {}) {
    const result = {
      success: true,
      restored: 0,
      skipped: 0,
      errors: [],
    };

    const {
      overwrite = false,        // 是否覆盖现有键 / Overwrite existing keys
      keyFilter = null,         // 键过滤器 / Key filter function
      dryRun = false,           // 干运行模式 / Dry run mode
    } = options;

    for (const [key, keyData] of Object.entries(data.keys)) {
      try {
        // 应用键过滤器 / Apply key filter
        if (keyFilter && !keyFilter(key, keyData)) {
          result.skipped++;
          continue;
        }

        // 检查键是否存在 / Check if key exists
        if (!overwrite) {
          const exists = await this.redis.client.exists(key);
          if (exists) {
            result.skipped++;
            continue;
          }
        }

        if (dryRun) {
          result.restored++;
          continue;
        }

        // 根据类型恢复 / Restore by type
        await this._restoreKey(key, keyData);

        result.restored++;

      } catch (error) {
        result.errors.push({ key, error: error.message });
      }
    }

    return result;
  }

  /**
   * 恢复单个键
   * Restore single key
   * @private
   */
  async _restoreKey(key, keyData) {
    const { type, value, ttl } = keyData;

    // 先删除现有键 / Delete existing key first
    await this.redis.client.del(key);

    switch (type) {
      case 'string':
        await this.redis.client.set(key, value);
        break;

      case 'hash':
        if (value && Object.keys(value).length > 0) {
          await this.redis.client.hSet(key, value);
        }
        break;

      case 'list':
        if (value && value.length > 0) {
          await this.redis.client.rPush(key, value);
        }
        break;

      case 'set':
        if (value && value.length > 0) {
          await this.redis.client.sAdd(key, value);
        }
        break;

      case 'zset':
        if (value && value.length > 0) {
          const members = value.map(m => ({
            score: m.score,
            value: m.value,
          }));
          await this.redis.client.zAdd(key, members);
        }
        break;

      default:
        throw new Error(`不支持的键类型: ${type}`);
    }

    // 设置 TTL / Set TTL
    if (ttl && ttl > 0) {
      await this.redis.client.expire(key, ttl);
    }
  }

  /**
   * 验证备份完整性
   * Verify backup integrity
   *
   * @param {string} backupId - 备份 ID / Backup ID
   * @returns {Promise<Object>} 验证结果 / Verification result
   */
  async verifyBackup(backupId) {
    const backup = this.backupHistory.find(
      b => b.id === backupId || b.filepath?.includes(backupId)
    );

    if (!backup) {
      return { valid: false, error: '备份不存在' };
    }

    try {
      // 检查文件是否存在 / Check if file exists
      if (!fs.existsSync(backup.filepath)) {
        return { valid: false, error: '备份文件不存在' };
      }

      // 读取文件 / Read file
      let buffer = await fs.promises.readFile(backup.filepath);

      // 解密 / Decrypt
      if (backup.encrypted) {
        if (!this.config.encryptionKey) {
          return { valid: false, error: '缺少加密密钥' };
        }
        buffer = this._decrypt(buffer);
      }

      // 解压 / Decompress
      if (backup.compressed) {
        buffer = await gunzip(buffer);
      }

      // 验证哈希 / Verify hash
      const hash = this._computeHash(buffer);
      const valid = hash === backup.hash;

      // 尝试解析 JSON / Try to parse JSON
      if (backup.type === BACKUP_TYPE.JSON) {
        JSON.parse(buffer.toString('utf8'));
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

  // ============================================
  // 备份管理 / Backup Management
  // ============================================

  /**
   * 获取备份列表
   * Get backup list
   */
  getBackups(options = {}) {
    let backups = [...this.backupHistory];

    // 按时间排序 / Sort by time
    backups.sort((a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    // 筛选类型 / Filter by type
    if (options.type) {
      backups = backups.filter(b => b.type === options.type);
    }

    // 筛选状态 / Filter by status
    if (options.status) {
      backups = backups.filter(b => b.status === options.status);
    }

    // 限制数量 / Limit count
    if (options.limit) {
      backups = backups.slice(0, options.limit);
    }

    return backups;
  }

  /**
   * 获取最新备份
   * Get latest backup
   */
  getLatestBackup(type = null) {
    const backups = this.getBackups({
      type,
      status: BACKUP_STATUS.COMPLETED,
      limit: 1,
    });

    return backups.length > 0 ? backups[0] : null;
  }

  /**
   * 删除备份
   * Delete backup
   */
  async deleteBackup(backupId) {
    const index = this.backupHistory.findIndex(b => b.id === backupId);

    if (index === -1) {
      throw new Error('备份不存在');
    }

    const backup = this.backupHistory[index];

    // 删除文件 / Delete file
    if (backup.filepath && fs.existsSync(backup.filepath)) {
      await fs.promises.unlink(backup.filepath);
    }

    // 从历史中移除 / Remove from history
    this.backupHistory.splice(index, 1);
    this._saveBackupHistory();

    this.emit('backup:deleted', backup);

    return backup;
  }

  /**
   * 清理旧备份
   * Cleanup old backups
   * @private
   */
  async _cleanupOldBackups() {
    const now = Date.now();
    const cutoffTime = now - this.config.retentionDays * 24 * 60 * 60 * 1000;
    const deleted = [];

    // 按时间排序 / Sort by time
    const sortedBackups = [...this.backupHistory].sort((a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    let kept = 0;

    for (const backup of sortedBackups) {
      const backupTime = new Date(backup.startTime).getTime();

      // 保留最小备份数 / Keep minimum backups
      if (kept < this.config.minBackups) {
        kept++;
        continue;
      }

      // 超过最大备份数或超过保留期限 / Exceeded max backups or retention
      if (kept >= this.config.maxBackups || backupTime < cutoffTime) {
        try {
          await this.deleteBackup(backup.id);
          deleted.push(backup);
        } catch (error) {
          console.error(`[RedisBackupManager] 清理备份失败 ${backup.id}:`, error.message);
        }
      } else {
        kept++;
      }
    }

    if (deleted.length > 0) {
      this.emit('cleanup', deleted);
    }

    return deleted;
  }

  // ============================================
  // 持久化状态 / Persistence Status
  // ============================================

  /**
   * 获取持久化状态
   * Get persistence status
   */
  async getPersistenceStatus() {
    const info = await this._getRedisInfo('persistence');

    return {
      // RDB 状态 / RDB status
      rdb: {
        enabled: true, // RDB 默认启用
        lastSaveTime: this._parseInfoValue(info, 'rdb_last_save_time'),
        lastSaveStatus: this._parseInfoString(info, 'rdb_last_bgsave_status'),
        changesSinceLastSave: this._parseInfoValue(info, 'rdb_changes_since_last_save'),
        bgsaveInProgress: info.includes('rdb_bgsave_in_progress:1'),
        lastBgsaveTime: this._parseInfoValue(info, 'rdb_last_bgsave_time_sec'),
        currentCowSize: this._parseInfoValue(info, 'rdb_last_cow_size'),
      },
      // AOF 状态 / AOF status
      aof: {
        enabled: info.includes('aof_enabled:1'),
        rewriteInProgress: info.includes('aof_rewrite_in_progress:1'),
        lastRewriteTime: this._parseInfoValue(info, 'aof_last_rewrite_time_sec'),
        lastRewriteStatus: this._parseInfoString(info, 'aof_last_bgrewrite_status'),
        currentSize: this._parseInfoValue(info, 'aof_current_size'),
        baseSize: this._parseInfoValue(info, 'aof_base_size'),
        pendingRewrite: info.includes('aof_rewrite_scheduled:1'),
      },
      // 备份统计 / Backup statistics
      backup: {
        ...this.stats,
        totalBackupsInHistory: this.backupHistory.length,
        latestRDBBackup: this.getLatestBackup(BACKUP_TYPE.RDB)?.startTime,
        latestJSONBackup: this.getLatestBackup(BACKUP_TYPE.JSON)?.startTime,
      },
    };
  }

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      currentBackup: this.currentBackup,
      backupCount: this.backupHistory.length,
      successRate: this.stats.totalBackups > 0
        ? (this.stats.successfulBackups / this.stats.totalBackups * 100).toFixed(2) + '%'
        : 'N/A',
    };
  }

  // ============================================
  // 工具方法 / Utility Methods
  // ============================================

  /**
   * 获取 Redis INFO
   * @private
   */
  async _getRedisInfo(section = null) {
    return this.redis.client.info(section);
  }

  /**
   * 解析 INFO 数值
   * @private
   */
  _parseInfoValue(info, key) {
    const match = info.match(new RegExp(`${key}:(\\d+)`));
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * 解析 INFO 字符串
   * @private
   */
  _parseInfoString(info, key) {
    const match = info.match(new RegExp(`${key}:(\\w+)`));
    return match ? match[1] : null;
  }

  /**
   * 生成备份 ID
   * @private
   */
  _generateBackupId() {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * 计算哈希
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
    const key = crypto.scryptSync(this.config.encryptionKey, 'redis-backup-salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(buffer),
      cipher.final(),
    ]);

    return Buffer.concat([iv, encrypted]);
  }

  /**
   * 解密数据
   * @private
   */
  _decrypt(buffer) {
    const iv = buffer.subarray(0, 16);
    const encrypted = buffer.subarray(16);

    const key = crypto.scryptSync(this.config.encryptionKey, 'redis-backup-salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
  }

  /**
   * 延迟
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export {
  RedisBackupManager,
  BACKUP_TYPE,
  BACKUP_STATUS,
};

export default RedisBackupManager;
