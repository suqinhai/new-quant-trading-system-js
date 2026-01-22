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

import fs from 'fs'; // 导入模块 fs
import path from 'path'; // 导入模块 path
import { EventEmitter } from 'events'; // 导入模块 events
import crypto from 'crypto'; // 导入模块 crypto
import zlib from 'zlib'; // 导入模块 zlib
import { promisify } from 'util'; // 导入模块 util

const gzip = promisify(zlib.gzip); // 定义常量 gzip
const gunzip = promisify(zlib.gunzip); // 定义常量 gunzip

/**
 * 备份类型枚举
 * Backup type enum
 */
const BACKUP_TYPE = { // 定义常量 BACKUP_TYPE
  RDB: 'rdb',           // RDB 快照 / RDB snapshot
  AOF: 'aof',           // AOF 重写 / AOF rewrite
  JSON: 'json',         // JSON 导出 / JSON export
  FULL: 'full',         // 完整备份 (RDB + JSON) / Full backup
}; // 结束代码块

/**
 * 备份状态枚举
 * Backup status enum
 */
const BACKUP_STATUS = { // 定义常量 BACKUP_STATUS
  PENDING: 'pending', // 设置 PENDING 字段
  IN_PROGRESS: 'in_progress', // 设置 IN_PROGRESS 字段
  COMPLETED: 'completed', // 设置 COMPLETED 字段
  FAILED: 'failed', // 设置 FAILED 字段
}; // 结束代码块

/**
 * 默认配置
 * Default configuration
 */
const DEFAULT_CONFIG = { // 定义常量 DEFAULT_CONFIG
  // 备份目录 / Backup directory
  backupDir: process.env.REDIS_BACKUP_DIR || './backups/redis', // 读取环境变量 REDIS_BACKUP_DIR
  // 保留天数 / Retention days
  retentionDays: 30, // 设置 retentionDays 字段
  // 最小保留备份数 / Min backups to keep
  minBackups: 5, // 设置 minBackups 字段
  // 最大备份数 / Max backups
  maxBackups: 100, // 设置 maxBackups 字段
  // 是否压缩 JSON 备份 / Compress JSON backups
  compress: true, // 设置 compress 字段
  // 是否加密备份 / Encrypt backups
  encrypt: false, // 设置 encrypt 字段
  // 加密密钥 / Encryption key
  encryptionKey: process.env.REDIS_BACKUP_ENCRYPTION_KEY, // 读取环境变量 REDIS_BACKUP_ENCRYPTION_KEY
  // 定时备份间隔 (ms) / Scheduled backup interval
  scheduleInterval: 6 * 60 * 60 * 1000, // 6 hours
  // JSON 备份间隔 (ms) / JSON backup interval
  jsonBackupInterval: 24 * 60 * 60 * 1000, // 24 hours
  // 扫描批量大小 / Scan batch size
  scanBatchSize: 1000, // 设置 scanBatchSize 字段
  // 备份超时 (ms) / Backup timeout
  backupTimeout: 30 * 60 * 1000, // 30 minutes
  // 键前缀 / Key prefix to backup
  keyPrefix: process.env.REDIS_PREFIX || 'quant:', // 读取环境变量 REDIS_PREFIX
}; // 结束代码块

/**
 * Redis 备份管理器类
 * Redis Backup Manager Class
 */
class RedisBackupManager extends EventEmitter { // 定义类 RedisBackupManager(继承EventEmitter)
  constructor(redisClient, config = {}) { // 构造函数
    super(); // 调用父类

    this.redis = redisClient; // 设置 redis
    this.config = { ...DEFAULT_CONFIG, ...config }; // 设置 config

    // 确保备份目录存在 / Ensure backup directory exists
    this._ensureBackupDir(); // 调用 _ensureBackupDir

    // 定时器 / Timers
    this.rdbTimer = null; // 设置 rdbTimer
    this.jsonTimer = null; // 设置 jsonTimer

    // 状态 / State
    this.isRunning = false; // 设置 isRunning
    this.currentBackup = null; // 设置 currentBackup

    // 备份历史 / Backup history
    this.backupHistory = []; // 设置 backupHistory
    this._loadBackupHistory(); // 调用 _loadBackupHistory

    // 统计 / Statistics
    this.stats = { // 设置 stats
      totalBackups: 0, // 设置 totalBackups 字段
      successfulBackups: 0, // 设置 successfulBackups 字段
      failedBackups: 0, // 设置 failedBackups 字段
      lastBackupTime: null, // 设置 lastBackupTime 字段
      lastRestoreTime: null, // 设置 lastRestoreTime 字段
      totalDataSize: 0, // 设置 totalDataSize 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 确保备份目录存在
   * Ensure backup directory exists
   * @private
   */
  _ensureBackupDir() { // 调用 _ensureBackupDir
    const dirs = [ // 定义常量 dirs
      this.config.backupDir, // 访问 config
      path.join(this.config.backupDir, 'rdb'), // 调用 path.join
      path.join(this.config.backupDir, 'json'), // 调用 path.join
      path.join(this.config.backupDir, 'aof'), // 调用 path.join
    ]; // 结束数组或索引

    for (const dir of dirs) { // 循环 const dir of dirs
      if (!fs.existsSync(dir)) { // 条件判断 !fs.existsSync(dir)
        fs.mkdirSync(dir, { recursive: true }); // 调用 fs.mkdirSync
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 加载备份历史
   * Load backup history
   * @private
   */
  _loadBackupHistory() { // 调用 _loadBackupHistory
    const historyFile = path.join(this.config.backupDir, 'backup-history.json'); // 定义常量 historyFile

    try { // 尝试执行
      if (fs.existsSync(historyFile)) { // 条件判断 fs.existsSync(historyFile)
        const content = fs.readFileSync(historyFile, 'utf8'); // 定义常量 content
        this.backupHistory = JSON.parse(content); // 设置 backupHistory
      } // 结束代码块
    } catch (error) { // 执行语句
      console.error('[RedisBackupManager] 加载备份历史失败:', error.message); // 控制台输出
      this.backupHistory = []; // 设置 backupHistory
    } // 结束代码块
  } // 结束代码块

  /**
   * 保存备份历史
   * Save backup history
   * @private
   */
  _saveBackupHistory() { // 调用 _saveBackupHistory
    const historyFile = path.join(this.config.backupDir, 'backup-history.json'); // 定义常量 historyFile

    try { // 尝试执行
      fs.writeFileSync(historyFile, JSON.stringify(this.backupHistory, null, 2)); // 调用 fs.writeFileSync
    } catch (error) { // 执行语句
      console.error('[RedisBackupManager] 保存备份历史失败:', error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 启动/停止 / Start/Stop
  // ============================================

  /**
   * 启动定时备份
   * Start scheduled backups
   */
  start() { // 调用 start
    if (this.isRunning) return; // 条件判断 this.isRunning

    this.isRunning = true; // 设置 isRunning

    // 启动 RDB 定时备份 / Start RDB scheduled backup
    if (this.config.scheduleInterval > 0) { // 条件判断 this.config.scheduleInterval > 0
      this.rdbTimer = setInterval(async () => { // 设置 rdbTimer
        try { // 尝试执行
          await this.triggerRDBSave(); // 等待异步结果
        } catch (error) { // 执行语句
          this.emit('error', { type: 'rdb', error }); // 调用 emit
        } // 结束代码块
      }, this.config.scheduleInterval); // 执行语句
    } // 结束代码块

    // 启动 JSON 定时备份 / Start JSON scheduled backup
    if (this.config.jsonBackupInterval > 0) { // 条件判断 this.config.jsonBackupInterval > 0
      this.jsonTimer = setInterval(async () => { // 设置 jsonTimer
        try { // 尝试执行
          await this.createJSONBackup(); // 等待异步结果
        } catch (error) { // 执行语句
          this.emit('error', { type: 'json', error }); // 调用 emit
        } // 结束代码块
      }, this.config.jsonBackupInterval); // 执行语句
    } // 结束代码块

    this.emit('started'); // 调用 emit
  } // 结束代码块

  /**
   * 停止定时备份
   * Stop scheduled backups
   */
  stop() { // 调用 stop
    if (!this.isRunning) return; // 条件判断 !this.isRunning

    this.isRunning = false; // 设置 isRunning

    if (this.rdbTimer) { // 条件判断 this.rdbTimer
      clearInterval(this.rdbTimer); // 调用 clearInterval
      this.rdbTimer = null; // 设置 rdbTimer
    } // 结束代码块

    if (this.jsonTimer) { // 条件判断 this.jsonTimer
      clearInterval(this.jsonTimer); // 调用 clearInterval
      this.jsonTimer = null; // 设置 jsonTimer
    } // 结束代码块

    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // RDB 备份 / RDB Backup (DB-014)
  // ============================================

  /**
   * 触发 RDB 后台保存
   * Trigger RDB background save
   *
   * @returns {Promise<Object>} 备份结果 / Backup result
   */
  async triggerRDBSave() { // 执行语句
    const startTime = Date.now(); // 定义常量 startTime
    const backupId = this._generateBackupId(); // 定义常量 backupId

    const backupInfo = { // 定义常量 backupInfo
      id: backupId, // 设置 id 字段
      type: BACKUP_TYPE.RDB, // 设置 type 字段
      status: BACKUP_STATUS.IN_PROGRESS, // 设置 status 字段
      startTime: new Date().toISOString(), // 设置 startTime 字段
      endTime: null, // 设置 endTime 字段
      duration: 0, // 设置 duration 字段
      error: null, // 设置 error 字段
    }; // 结束代码块

    this.currentBackup = backupInfo; // 设置 currentBackup
    this.emit('backup:start', backupInfo); // 调用 emit

    try { // 尝试执行
      // 获取当前 RDB 保存状态 / Get current RDB save status
      const infoBefore = await this._getRedisInfo('persistence'); // 定义常量 infoBefore
      const lastSaveBefore = this._parseLastSave(infoBefore); // 定义常量 lastSaveBefore

      // 触发后台保存 / Trigger background save
      await this.redis.client.bgSave(); // 等待异步结果

      // 等待保存完成 / Wait for save to complete
      await this._waitForRDBComplete(lastSaveBefore); // 等待异步结果

      // 复制 RDB 文件到备份目录 / Copy RDB file to backup directory
      const rdbPath = await this._copyRDBFile(backupId); // 定义常量 rdbPath

      backupInfo.status = BACKUP_STATUS.COMPLETED; // 赋值 backupInfo.status
      backupInfo.endTime = new Date().toISOString(); // 赋值 backupInfo.endTime
      backupInfo.duration = Date.now() - startTime; // 赋值 backupInfo.duration
      backupInfo.filepath = rdbPath; // 赋值 backupInfo.filepath

      if (rdbPath && fs.existsSync(rdbPath)) { // 条件判断 rdbPath && fs.existsSync(rdbPath)
        backupInfo.size = fs.statSync(rdbPath).size; // 赋值 backupInfo.size
      } // 结束代码块

      this.stats.totalBackups++; // 访问 stats
      this.stats.successfulBackups++; // 访问 stats
      this.stats.lastBackupTime = backupInfo.endTime; // 访问 stats

      this.backupHistory.push(backupInfo); // 访问 backupHistory
      this._saveBackupHistory(); // 调用 _saveBackupHistory

      await this._cleanupOldBackups(); // 等待异步结果

      this.emit('backup:complete', backupInfo); // 调用 emit

      return backupInfo; // 返回结果

    } catch (error) { // 执行语句
      backupInfo.status = BACKUP_STATUS.FAILED; // 赋值 backupInfo.status
      backupInfo.endTime = new Date().toISOString(); // 赋值 backupInfo.endTime
      backupInfo.duration = Date.now() - startTime; // 赋值 backupInfo.duration
      backupInfo.error = error.message; // 赋值 backupInfo.error

      this.stats.totalBackups++; // 访问 stats
      this.stats.failedBackups++; // 访问 stats

      this.backupHistory.push(backupInfo); // 访问 backupHistory
      this._saveBackupHistory(); // 调用 _saveBackupHistory

      this.emit('backup:error', { backup: backupInfo, error }); // 调用 emit

      throw error; // 抛出异常

    } finally { // 执行语句
      this.currentBackup = null; // 设置 currentBackup
    } // 结束代码块
  } // 结束代码块

  /**
   * 等待 RDB 保存完成
   * Wait for RDB save to complete
   * @private
   */
  async _waitForRDBComplete(lastSaveBefore, timeout = 60000) { // 执行语句
    const startTime = Date.now(); // 定义常量 startTime

    while (Date.now() - startTime < timeout) { // 循环条件 Date.now() - startTime < timeout
      const info = await this._getRedisInfo('persistence'); // 定义常量 info
      const currentLastSave = this._parseLastSave(info); // 定义常量 currentLastSave
      const bgsaveInProgress = info.includes('rdb_bgsave_in_progress:1'); // 定义常量 bgsaveInProgress

      if (!bgsaveInProgress && currentLastSave > lastSaveBefore) { // 条件判断 !bgsaveInProgress && currentLastSave > lastSa...
        return true; // 返回结果
      } // 结束代码块

      await this._sleep(500); // 等待异步结果
    } // 结束代码块

    throw new Error('RDB save timeout'); // 抛出异常
  } // 结束代码块

  /**
   * 解析最后保存时间
   * Parse last save time
   * @private
   */
  _parseLastSave(info) { // 调用 _parseLastSave
    const match = info.match(/rdb_last_save_time:(\d+)/); // 定义常量 match
    return match ? parseInt(match[1], 10) : 0; // 返回结果
  } // 结束代码块

  /**
   * 复制 RDB 文件
   * Copy RDB file
   * @private
   */
  async _copyRDBFile(backupId) { // 执行语句
    // 获取 Redis 配置中的 RDB 路径 / Get RDB path from Redis config
    const info = await this._getRedisInfo('server'); // 定义常量 info
    const configDir = await this.redis.client.configGet('dir'); // 定义常量 configDir
    const configDbfilename = await this.redis.client.configGet('dbfilename'); // 定义常量 configDbfilename

    const rdbDir = configDir.dir || '/data/redis'; // 定义常量 rdbDir
    const rdbFilename = configDbfilename.dbfilename || 'dump.rdb'; // 定义常量 rdbFilename
    const sourcePath = path.join(rdbDir, rdbFilename); // 定义常量 sourcePath

    // 目标路径 / Target path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // 定义常量 timestamp
    const targetFilename = `dump-${timestamp}-${backupId}.rdb`; // 定义常量 targetFilename
    const targetPath = path.join(this.config.backupDir, 'rdb', targetFilename); // 定义常量 targetPath

    // 复制文件 / Copy file (如果源文件存在)
    if (fs.existsSync(sourcePath)) { // 条件判断 fs.existsSync(sourcePath)
      await fs.promises.copyFile(sourcePath, targetPath); // 等待异步结果
      return targetPath; // 返回结果
    } // 结束代码块

    // 如果无法访问 RDB 文件，记录警告 / Log warning if RDB file not accessible
    console.warn('[RedisBackupManager] 无法访问 RDB 文件:', sourcePath); // 控制台输出
    return null; // 返回结果
  } // 结束代码块

  // ============================================
  // AOF 备份 / AOF Backup (DB-013)
  // ============================================

  /**
   * 触发 AOF 重写
   * Trigger AOF rewrite
   *
   * @returns {Promise<Object>} 结果 / Result
   */
  async triggerAOFRewrite() { // 执行语句
    const startTime = Date.now(); // 定义常量 startTime

    try { // 尝试执行
      // 检查 AOF 是否启用 / Check if AOF is enabled
      const config = await this.redis.client.configGet('appendonly'); // 定义常量 config

      if (config.appendonly !== 'yes') { // 条件判断 config.appendonly !== 'yes'
        throw new Error('AOF is not enabled'); // 抛出异常
      } // 结束代码块

      // 触发 AOF 重写 / Trigger AOF rewrite
      await this.redis.client.bgRewriteAof(); // 等待异步结果

      // 等待重写完成 / Wait for rewrite to complete
      await this._waitForAOFRewriteComplete(); // 等待异步结果

      const result = { // 定义常量 result
        success: true, // 设置 success 字段
        duration: Date.now() - startTime, // 设置 duration 字段
        message: 'AOF rewrite completed', // 设置 message 字段
      }; // 结束代码块

      this.emit('aof:rewrite', result); // 调用 emit

      return result; // 返回结果

    } catch (error) { // 执行语句
      this.emit('error', { type: 'aof', error }); // 调用 emit
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 等待 AOF 重写完成
   * Wait for AOF rewrite to complete
   * @private
   */
  async _waitForAOFRewriteComplete(timeout = 300000) { // 执行语句
    const startTime = Date.now(); // 定义常量 startTime

    while (Date.now() - startTime < timeout) { // 循环条件 Date.now() - startTime < timeout
      const info = await this._getRedisInfo('persistence'); // 定义常量 info
      const rewriteInProgress = info.includes('aof_rewrite_in_progress:1'); // 定义常量 rewriteInProgress

      if (!rewriteInProgress) { // 条件判断 !rewriteInProgress
        return true; // 返回结果
      } // 结束代码块

      await this._sleep(1000); // 等待异步结果
    } // 结束代码块

    throw new Error('AOF rewrite timeout'); // 抛出异常
  } // 结束代码块

  /**
   * 获取 AOF 状态
   * Get AOF status
   */
  async getAOFStatus() { // 执行语句
    const info = await this._getRedisInfo('persistence'); // 定义常量 info
    const config = await this.redis.client.configGet('appendonly'); // 定义常量 config

    return { // 返回结果
      enabled: config.appendonly === 'yes', // 设置 enabled 字段
      rewriteInProgress: info.includes('aof_rewrite_in_progress:1'), // 设置 rewriteInProgress 字段
      currentSize: this._parseInfoValue(info, 'aof_current_size'), // 设置 currentSize 字段
      baseSize: this._parseInfoValue(info, 'aof_base_size'), // 设置 baseSize 字段
      lastRewriteTime: this._parseInfoValue(info, 'aof_last_rewrite_time_sec'), // 设置 lastRewriteTime 字段
      lastBgrewriteStatus: this._parseInfoString(info, 'aof_last_bgrewrite_status'), // 设置 lastBgrewriteStatus 字段
    }; // 结束代码块
  } // 结束代码块

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
  async createJSONBackup(options = {}) { // 执行语句
    const startTime = Date.now(); // 定义常量 startTime
    const backupId = this._generateBackupId(); // 定义常量 backupId
    const type = options.type || 'scheduled'; // 定义常量 type

    const backupInfo = { // 定义常量 backupInfo
      id: backupId, // 设置 id 字段
      type: BACKUP_TYPE.JSON, // 设置 type 字段
      subtype: type, // 设置 subtype 字段
      status: BACKUP_STATUS.IN_PROGRESS, // 设置 status 字段
      startTime: new Date().toISOString(), // 设置 startTime 字段
      endTime: null, // 设置 endTime 字段
      duration: 0, // 设置 duration 字段
      keyCount: 0, // 设置 keyCount 字段
      size: 0, // 设置 size 字段
      compressed: this.config.compress, // 设置 compressed 字段
      encrypted: this.config.encrypt, // 设置 encrypted 字段
      error: null, // 设置 error 字段
    }; // 结束代码块

    this.currentBackup = backupInfo; // 设置 currentBackup
    this.emit('backup:start', backupInfo); // 调用 emit

    try { // 尝试执行
      // 导出所有数据 / Export all data
      const data = await this._exportAllData(options); // 定义常量 data

      backupInfo.keyCount = data.metadata.totalKeys; // 赋值 backupInfo.keyCount

      // 序列化 / Serialize
      let buffer = Buffer.from(JSON.stringify(data, null, 2)); // 定义变量 buffer
      const originalSize = buffer.length; // 定义常量 originalSize

      // 计算哈希 / Calculate hash
      const hash = this._computeHash(buffer); // 定义常量 hash

      // 压缩 / Compress
      if (this.config.compress) { // 条件判断 this.config.compress
        buffer = await gzip(buffer); // 赋值 buffer
      } // 结束代码块

      // 加密 / Encrypt
      if (this.config.encrypt && this.config.encryptionKey) { // 条件判断 this.config.encrypt && this.config.encryptionKey
        buffer = this._encrypt(buffer); // 赋值 buffer
      } // 结束代码块

      // 生成文件名 / Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // 定义常量 timestamp
      const ext = this.config.compress ? '.json.gz' : '.json'; // 定义常量 ext
      const encExt = this.config.encrypt ? '.enc' : ''; // 定义常量 encExt
      const filename = `backup-${timestamp}-${backupId}${ext}${encExt}`; // 定义常量 filename
      const filepath = path.join(this.config.backupDir, 'json', filename); // 定义常量 filepath

      // 写入文件 / Write file
      await fs.promises.writeFile(filepath, buffer); // 等待异步结果

      backupInfo.status = BACKUP_STATUS.COMPLETED; // 赋值 backupInfo.status
      backupInfo.endTime = new Date().toISOString(); // 赋值 backupInfo.endTime
      backupInfo.duration = Date.now() - startTime; // 赋值 backupInfo.duration
      backupInfo.filepath = filepath; // 赋值 backupInfo.filepath
      backupInfo.size = buffer.length; // 赋值 backupInfo.size
      backupInfo.originalSize = originalSize; // 赋值 backupInfo.originalSize
      backupInfo.hash = hash; // 赋值 backupInfo.hash

      this.stats.totalBackups++; // 访问 stats
      this.stats.successfulBackups++; // 访问 stats
      this.stats.lastBackupTime = backupInfo.endTime; // 访问 stats
      this.stats.totalDataSize += buffer.length; // 访问 stats

      this.backupHistory.push(backupInfo); // 访问 backupHistory
      this._saveBackupHistory(); // 调用 _saveBackupHistory

      await this._cleanupOldBackups(); // 等待异步结果

      this.emit('backup:complete', backupInfo); // 调用 emit

      return backupInfo; // 返回结果

    } catch (error) { // 执行语句
      backupInfo.status = BACKUP_STATUS.FAILED; // 赋值 backupInfo.status
      backupInfo.endTime = new Date().toISOString(); // 赋值 backupInfo.endTime
      backupInfo.duration = Date.now() - startTime; // 赋值 backupInfo.duration
      backupInfo.error = error.message; // 赋值 backupInfo.error

      this.stats.totalBackups++; // 访问 stats
      this.stats.failedBackups++; // 访问 stats

      this.backupHistory.push(backupInfo); // 访问 backupHistory
      this._saveBackupHistory(); // 调用 _saveBackupHistory

      this.emit('backup:error', { backup: backupInfo, error }); // 调用 emit

      throw error; // 抛出异常

    } finally { // 执行语句
      this.currentBackup = null; // 设置 currentBackup
    } // 结束代码块
  } // 结束代码块

  /**
   * 导出所有数据
   * Export all data
   * @private
   */
  async _exportAllData(options = {}) { // 执行语句
    const pattern = options.pattern || `${this.config.keyPrefix}*`; // 定义常量 pattern
    const data = { // 定义常量 data
      metadata: { // 设置 metadata 字段
        version: '1.0', // 设置 version 字段
        exportTime: new Date().toISOString(), // 设置 exportTime 字段
        keyPrefix: this.config.keyPrefix, // 设置 keyPrefix 字段
        totalKeys: 0, // 设置 totalKeys 字段
        keyTypes: {}, // 设置 keyTypes 字段
      }, // 结束代码块
      keys: {}, // 设置 keys 字段
    }; // 结束代码块

    // 扫描所有键 / Scan all keys
    let cursor = 0; // 定义变量 cursor
    const scannedKeys = []; // 定义常量 scannedKeys

    do { // 执行语句
      const result = await this.redis.client.scan(cursor, { // 定义常量 result
        MATCH: pattern, // 设置 MATCH 字段
        COUNT: this.config.scanBatchSize, // 设置 COUNT 字段
      }); // 结束代码块

      cursor = result.cursor; // 赋值 cursor
      scannedKeys.push(...result.keys); // 调用 scannedKeys.push

    } while (cursor !== 0); // 执行语句

    data.metadata.totalKeys = scannedKeys.length; // 赋值 data.metadata.totalKeys

    // 导出每个键 / Export each key
    for (const key of scannedKeys) { // 循环 const key of scannedKeys
      try { // 尝试执行
        const keyType = await this.redis.client.type(key); // 定义常量 keyType
        const ttl = await this.redis.client.ttl(key); // 定义常量 ttl

        data.metadata.keyTypes[keyType] = (data.metadata.keyTypes[keyType] || 0) + 1; // 执行语句

        const keyData = { // 定义常量 keyData
          type: keyType, // 设置 type 字段
          ttl: ttl > 0 ? ttl : null, // 设置 ttl 字段
          value: null, // 设置 value 字段
        }; // 结束代码块

        // 根据类型获取值 / Get value by type
        switch (keyType) { // 分支选择 keyType
          case 'string': // 分支 'string'
            keyData.value = await this.redis.client.get(key); // 赋值 keyData.value
            break; // 跳出循环或分支
          case 'hash': // 分支 'hash'
            keyData.value = await this.redis.client.hGetAll(key); // 赋值 keyData.value
            break; // 跳出循环或分支
          case 'list': // 分支 'list'
            keyData.value = await this.redis.client.lRange(key, 0, -1); // 赋值 keyData.value
            break; // 跳出循环或分支
          case 'set': // 分支 'set'
            keyData.value = await this.redis.client.sMembers(key); // 赋值 keyData.value
            break; // 跳出循环或分支
          case 'zset': // 分支 'zset'
            const members = await this.redis.client.zRangeWithScores(key, 0, -1); // 定义常量 members
            keyData.value = members.map(m => ({ value: m.value, score: m.score })); // 赋值 keyData.value
            break; // 跳出循环或分支
          default: // 默认分支
            keyData.value = null; // 赋值 keyData.value
        } // 结束代码块

        data.keys[key] = keyData; // 执行语句

      } catch (error) { // 执行语句
        console.warn(`[RedisBackupManager] 导出键失败 ${key}:`, error.message); // 控制台输出
      } // 结束代码块
    } // 结束代码块

    return data; // 返回结果
  } // 结束代码块

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
  async restoreFromJSON(backupId, options = {}) { // 执行语句
    const startTime = Date.now(); // 定义常量 startTime

    // 查找备份 / Find backup
    const backup = this.backupHistory.find( // 定义常量 backup
      b => b.id === backupId || b.filepath?.includes(backupId) // 赋值 b
    ); // 结束调用或参数

    if (!backup && !fs.existsSync(backupId)) { // 条件判断 !backup && !fs.existsSync(backupId)
      throw new Error(`备份不存在: ${backupId}`); // 抛出异常
    } // 结束代码块

    const filepath = backup?.filepath || backupId; // 定义常量 filepath

    this.emit('restore:start', { backupId, filepath }); // 调用 emit

    try { // 尝试执行
      // 读取备份文件 / Read backup file
      let buffer = await fs.promises.readFile(filepath); // 定义变量 buffer

      // 解密 / Decrypt
      if (backup?.encrypted || filepath.endsWith('.enc')) { // 条件判断 backup?.encrypted || filepath.endsWith('.enc')
        if (!this.config.encryptionKey) { // 条件判断 !this.config.encryptionKey
          throw new Error('需要加密密钥来恢复加密备份'); // 抛出异常
        } // 结束代码块
        buffer = this._decrypt(buffer); // 赋值 buffer
      } // 结束代码块

      // 解压 / Decompress
      if (backup?.compressed || filepath.includes('.gz')) { // 条件判断 backup?.compressed || filepath.includes('.gz')
        buffer = await gunzip(buffer); // 赋值 buffer
      } // 结束代码块

      // 验证哈希 / Verify hash
      if (backup?.hash) { // 条件判断 backup?.hash
        const hash = this._computeHash(buffer); // 定义常量 hash
        if (hash !== backup.hash) { // 条件判断 hash !== backup.hash
          throw new Error('备份数据校验失败，文件可能已损坏'); // 抛出异常
        } // 结束代码块
      } // 结束代码块

      // 解析 JSON / Parse JSON
      const data = JSON.parse(buffer.toString('utf8')); // 定义常量 data

      // 恢复数据 / Restore data
      const result = await this._restoreData(data, options); // 定义常量 result

      result.duration = Date.now() - startTime; // 赋值 result.duration

      this.stats.lastRestoreTime = new Date().toISOString(); // 访问 stats

      this.emit('restore:complete', result); // 调用 emit

      return result; // 返回结果

    } catch (error) { // 执行语句
      this.emit('restore:error', { backupId, error }); // 调用 emit
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 恢复数据到 Redis
   * Restore data to Redis
   * @private
   */
  async _restoreData(data, options = {}) { // 执行语句
    const result = { // 定义常量 result
      success: true, // 设置 success 字段
      restored: 0, // 设置 restored 字段
      skipped: 0, // 设置 skipped 字段
      errors: [], // 设置 errors 字段
    }; // 结束代码块

    const { // 解构赋值
      overwrite = false,        // 是否覆盖现有键 / Overwrite existing keys
      keyFilter = null,         // 键过滤器 / Key filter function
      dryRun = false,           // 干运行模式 / Dry run mode
    } = options; // 执行语句

    for (const [key, keyData] of Object.entries(data.keys)) { // 循环 const [key, keyData] of Object.entries(data.k...
      try { // 尝试执行
        // 应用键过滤器 / Apply key filter
        if (keyFilter && !keyFilter(key, keyData)) { // 条件判断 keyFilter && !keyFilter(key, keyData)
          result.skipped++; // 执行语句
          continue; // 继续下一轮循环
        } // 结束代码块

        // 检查键是否存在 / Check if key exists
        if (!overwrite) { // 条件判断 !overwrite
          const exists = await this.redis.client.exists(key); // 定义常量 exists
          if (exists) { // 条件判断 exists
            result.skipped++; // 执行语句
            continue; // 继续下一轮循环
          } // 结束代码块
        } // 结束代码块

        if (dryRun) { // 条件判断 dryRun
          result.restored++; // 执行语句
          continue; // 继续下一轮循环
        } // 结束代码块

        // 根据类型恢复 / Restore by type
        await this._restoreKey(key, keyData); // 等待异步结果

        result.restored++; // 执行语句

      } catch (error) { // 执行语句
        result.errors.push({ key, error: error.message }); // 调用 result.errors.push
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 恢复单个键
   * Restore single key
   * @private
   */
  async _restoreKey(key, keyData) { // 执行语句
    const { type, value, ttl } = keyData; // 解构赋值

    // 先删除现有键 / Delete existing key first
    await this.redis.client.del(key); // 等待异步结果

    switch (type) { // 分支选择 type
      case 'string': // 分支 'string'
        await this.redis.client.set(key, value); // 等待异步结果
        break; // 跳出循环或分支

      case 'hash': // 分支 'hash'
        if (value && Object.keys(value).length > 0) { // 条件判断 value && Object.keys(value).length > 0
          await this.redis.client.hSet(key, value); // 等待异步结果
        } // 结束代码块
        break; // 跳出循环或分支

      case 'list': // 分支 'list'
        if (value && value.length > 0) { // 条件判断 value && value.length > 0
          await this.redis.client.rPush(key, value); // 等待异步结果
        } // 结束代码块
        break; // 跳出循环或分支

      case 'set': // 分支 'set'
        if (value && value.length > 0) { // 条件判断 value && value.length > 0
          await this.redis.client.sAdd(key, value); // 等待异步结果
        } // 结束代码块
        break; // 跳出循环或分支

      case 'zset': // 分支 'zset'
        if (value && value.length > 0) { // 条件判断 value && value.length > 0
          const members = value.map(m => ({ // 定义函数 members
            score: m.score, // 设置 score 字段
            value: m.value, // 设置 value 字段
          })); // 结束代码块
          await this.redis.client.zAdd(key, members); // 等待异步结果
        } // 结束代码块
        break; // 跳出循环或分支

      default: // 默认分支
        throw new Error(`不支持的键类型: ${type}`); // 抛出异常
    } // 结束代码块

    // 设置 TTL / Set TTL
    if (ttl && ttl > 0) { // 条件判断 ttl && ttl > 0
      await this.redis.client.expire(key, ttl); // 等待异步结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 验证备份完整性
   * Verify backup integrity
   *
   * @param {string} backupId - 备份 ID / Backup ID
   * @returns {Promise<Object>} 验证结果 / Verification result
   */
  async verifyBackup(backupId) { // 执行语句
    const backup = this.backupHistory.find( // 定义常量 backup
      b => b.id === backupId || b.filepath?.includes(backupId) // 赋值 b
    ); // 结束调用或参数

    if (!backup) { // 条件判断 !backup
      return { valid: false, error: '备份不存在' }; // 返回结果
    } // 结束代码块

    try { // 尝试执行
      // 检查文件是否存在 / Check if file exists
      if (!fs.existsSync(backup.filepath)) { // 条件判断 !fs.existsSync(backup.filepath)
        return { valid: false, error: '备份文件不存在' }; // 返回结果
      } // 结束代码块

      // 读取文件 / Read file
      let buffer = await fs.promises.readFile(backup.filepath); // 定义变量 buffer

      // 解密 / Decrypt
      if (backup.encrypted) { // 条件判断 backup.encrypted
        if (!this.config.encryptionKey) { // 条件判断 !this.config.encryptionKey
          return { valid: false, error: '缺少加密密钥' }; // 返回结果
        } // 结束代码块
        buffer = this._decrypt(buffer); // 赋值 buffer
      } // 结束代码块

      // 解压 / Decompress
      if (backup.compressed) { // 条件判断 backup.compressed
        buffer = await gunzip(buffer); // 赋值 buffer
      } // 结束代码块

      // 验证哈希 / Verify hash
      const hash = this._computeHash(buffer); // 定义常量 hash
      const valid = hash === backup.hash; // 定义常量 valid

      // 尝试解析 JSON / Try to parse JSON
      if (backup.type === BACKUP_TYPE.JSON) { // 条件判断 backup.type === BACKUP_TYPE.JSON
        JSON.parse(buffer.toString('utf8')); // 调用 JSON.parse
      } // 结束代码块

      return { // 返回结果
        valid, // 执行语句
        hash, // 执行语句
        expectedHash: backup.hash, // 设置 expectedHash 字段
        size: buffer.length, // 设置 size 字段
        error: valid ? null : '哈希不匹配', // 设置 error 字段
      }; // 结束代码块

    } catch (error) { // 执行语句
      return { valid: false, error: error.message }; // 返回结果
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 备份管理 / Backup Management
  // ============================================

  /**
   * 获取备份列表
   * Get backup list
   */
  getBackups(options = {}) { // 调用 getBackups
    let backups = [...this.backupHistory]; // 定义变量 backups

    // 按时间排序 / Sort by time
    backups.sort((a, b) => // 调用 backups.sort
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime() // 创建 Date 实例
    ); // 结束调用或参数

    // 筛选类型 / Filter by type
    if (options.type) { // 条件判断 options.type
      backups = backups.filter(b => b.type === options.type); // 赋值 backups
    } // 结束代码块

    // 筛选状态 / Filter by status
    if (options.status) { // 条件判断 options.status
      backups = backups.filter(b => b.status === options.status); // 赋值 backups
    } // 结束代码块

    // 限制数量 / Limit count
    if (options.limit) { // 条件判断 options.limit
      backups = backups.slice(0, options.limit); // 赋值 backups
    } // 结束代码块

    return backups; // 返回结果
  } // 结束代码块

  /**
   * 获取最新备份
   * Get latest backup
   */
  getLatestBackup(type = null) { // 调用 getLatestBackup
    const backups = this.getBackups({ // 定义常量 backups
      type, // 执行语句
      status: BACKUP_STATUS.COMPLETED, // 设置 status 字段
      limit: 1, // 设置 limit 字段
    }); // 结束代码块

    return backups.length > 0 ? backups[0] : null; // 返回结果
  } // 结束代码块

  /**
   * 删除备份
   * Delete backup
   */
  async deleteBackup(backupId) { // 执行语句
    const index = this.backupHistory.findIndex(b => b.id === backupId); // 定义函数 index

    if (index === -1) { // 条件判断 index === -1
      throw new Error('备份不存在'); // 抛出异常
    } // 结束代码块

    const backup = this.backupHistory[index]; // 定义常量 backup

    // 删除文件 / Delete file
    if (backup.filepath && fs.existsSync(backup.filepath)) { // 条件判断 backup.filepath && fs.existsSync(backup.filep...
      await fs.promises.unlink(backup.filepath); // 等待异步结果
    } // 结束代码块

    // 从历史中移除 / Remove from history
    this.backupHistory.splice(index, 1); // 访问 backupHistory
    this._saveBackupHistory(); // 调用 _saveBackupHistory

    this.emit('backup:deleted', backup); // 调用 emit

    return backup; // 返回结果
  } // 结束代码块

  /**
   * 清理旧备份
   * Cleanup old backups
   * @private
   */
  async _cleanupOldBackups() { // 执行语句
    const now = Date.now(); // 定义常量 now
    const cutoffTime = now - this.config.retentionDays * 24 * 60 * 60 * 1000; // 定义常量 cutoffTime
    const deleted = []; // 定义常量 deleted

    // 按时间排序 / Sort by time
    const sortedBackups = [...this.backupHistory].sort((a, b) => // 定义函数 sortedBackups
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime() // 创建 Date 实例
    ); // 结束调用或参数

    let kept = 0; // 定义变量 kept

    for (const backup of sortedBackups) { // 循环 const backup of sortedBackups
      const backupTime = new Date(backup.startTime).getTime(); // 定义常量 backupTime

      // 保留最小备份数 / Keep minimum backups
      if (kept < this.config.minBackups) { // 条件判断 kept < this.config.minBackups
        kept++; // 执行语句
        continue; // 继续下一轮循环
      } // 结束代码块

      // 超过最大备份数或超过保留期限 / Exceeded max backups or retention
      if (kept >= this.config.maxBackups || backupTime < cutoffTime) { // 条件判断 kept >= this.config.maxBackups || backupTime ...
        try { // 尝试执行
          await this.deleteBackup(backup.id); // 等待异步结果
          deleted.push(backup); // 调用 deleted.push
        } catch (error) { // 执行语句
          console.error(`[RedisBackupManager] 清理备份失败 ${backup.id}:`, error.message); // 控制台输出
        } // 结束代码块
      } else { // 执行语句
        kept++; // 执行语句
      } // 结束代码块
    } // 结束代码块

    if (deleted.length > 0) { // 条件判断 deleted.length > 0
      this.emit('cleanup', deleted); // 调用 emit
    } // 结束代码块

    return deleted; // 返回结果
  } // 结束代码块

  // ============================================
  // 持久化状态 / Persistence Status
  // ============================================

  /**
   * 获取持久化状态
   * Get persistence status
   */
  async getPersistenceStatus() { // 执行语句
    const info = await this._getRedisInfo('persistence'); // 定义常量 info

    return { // 返回结果
      // RDB 状态 / RDB status
      rdb: { // 设置 rdb 字段
        enabled: true, // RDB 默认启用
        lastSaveTime: this._parseInfoValue(info, 'rdb_last_save_time'), // 设置 lastSaveTime 字段
        lastSaveStatus: this._parseInfoString(info, 'rdb_last_bgsave_status'), // 设置 lastSaveStatus 字段
        changesSinceLastSave: this._parseInfoValue(info, 'rdb_changes_since_last_save'), // 设置 changesSinceLastSave 字段
        bgsaveInProgress: info.includes('rdb_bgsave_in_progress:1'), // 设置 bgsaveInProgress 字段
        lastBgsaveTime: this._parseInfoValue(info, 'rdb_last_bgsave_time_sec'), // 设置 lastBgsaveTime 字段
        currentCowSize: this._parseInfoValue(info, 'rdb_last_cow_size'), // 设置 currentCowSize 字段
      }, // 结束代码块
      // AOF 状态 / AOF status
      aof: { // 设置 aof 字段
        enabled: info.includes('aof_enabled:1'), // 设置 enabled 字段
        rewriteInProgress: info.includes('aof_rewrite_in_progress:1'), // 设置 rewriteInProgress 字段
        lastRewriteTime: this._parseInfoValue(info, 'aof_last_rewrite_time_sec'), // 设置 lastRewriteTime 字段
        lastRewriteStatus: this._parseInfoString(info, 'aof_last_bgrewrite_status'), // 设置 lastRewriteStatus 字段
        currentSize: this._parseInfoValue(info, 'aof_current_size'), // 设置 currentSize 字段
        baseSize: this._parseInfoValue(info, 'aof_base_size'), // 设置 baseSize 字段
        pendingRewrite: info.includes('aof_rewrite_scheduled:1'), // 设置 pendingRewrite 字段
      }, // 结束代码块
      // 备份统计 / Backup statistics
      backup: { // 设置 backup 字段
        ...this.stats, // 展开对象或数组
        totalBackupsInHistory: this.backupHistory.length, // 设置 totalBackupsInHistory 字段
        latestRDBBackup: this.getLatestBackup(BACKUP_TYPE.RDB)?.startTime, // 设置 latestRDBBackup 字段
        latestJSONBackup: this.getLatestBackup(BACKUP_TYPE.JSON)?.startTime, // 设置 latestJSONBackup 字段
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 获取统计信息
   * Get statistics
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      ...this.stats, // 展开对象或数组
      isRunning: this.isRunning, // 设置 isRunning 字段
      currentBackup: this.currentBackup, // 设置 currentBackup 字段
      backupCount: this.backupHistory.length, // 设置 backupCount 字段
      successRate: this.stats.totalBackups > 0 // 设置 successRate 字段
        ? (this.stats.successfulBackups / this.stats.totalBackups * 100).toFixed(2) + '%' // 执行语句
        : 'N/A', // 执行语句
    }; // 结束代码块
  } // 结束代码块

  // ============================================
  // 工具方法 / Utility Methods
  // ============================================

  /**
   * 获取 Redis INFO
   * @private
   */
  async _getRedisInfo(section = null) { // 执行语句
    return this.redis.client.info(section); // 返回结果
  } // 结束代码块

  /**
   * 解析 INFO 数值
   * @private
   */
  _parseInfoValue(info, key) { // 调用 _parseInfoValue
    const match = info.match(new RegExp(`${key}:(\\d+)`)); // 定义常量 match
    return match ? parseInt(match[1], 10) : 0; // 返回结果
  } // 结束代码块

  /**
   * 解析 INFO 字符串
   * @private
   */
  _parseInfoString(info, key) { // 调用 _parseInfoString
    const match = info.match(new RegExp(`${key}:(\\w+)`)); // 定义常量 match
    return match ? match[1] : null; // 返回结果
  } // 结束代码块

  /**
   * 生成备份 ID
   * @private
   */
  _generateBackupId() { // 调用 _generateBackupId
    return crypto.randomBytes(8).toString('hex'); // 返回结果
  } // 结束代码块

  /**
   * 计算哈希
   * @private
   */
  _computeHash(buffer) { // 调用 _computeHash
    return crypto.createHash('sha256').update(buffer).digest('hex'); // 返回结果
  } // 结束代码块

  /**
   * 加密数据
   * @private
   */
  _encrypt(buffer) { // 调用 _encrypt
    const iv = crypto.randomBytes(16); // 定义常量 iv
    const key = crypto.scryptSync(this.config.encryptionKey, 'redis-backup-salt', 32); // 定义常量 key
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv); // 定义常量 cipher

    const encrypted = Buffer.concat([ // 定义常量 encrypted
      cipher.update(buffer), // 调用 cipher.update
      cipher.final(), // 调用 cipher.final
    ]); // 结束数组或索引

    return Buffer.concat([iv, encrypted]); // 返回结果
  } // 结束代码块

  /**
   * 解密数据
   * @private
   */
  _decrypt(buffer) { // 调用 _decrypt
    const iv = buffer.subarray(0, 16); // 定义常量 iv
    const encrypted = buffer.subarray(16); // 定义常量 encrypted

    const key = crypto.scryptSync(this.config.encryptionKey, 'redis-backup-salt', 32); // 定义常量 key
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv); // 定义常量 decipher

    return Buffer.concat([ // 返回结果
      decipher.update(encrypted), // 调用 decipher.update
      decipher.final(), // 调用 decipher.final
    ]); // 结束数组或索引
  } // 结束代码块

  /**
   * 延迟
   * @private
   */
  _sleep(ms) { // 调用 _sleep
    return new Promise(resolve => setTimeout(resolve, ms)); // 返回结果
  } // 结束代码块
} // 结束代码块

export { // 导出命名成员
  RedisBackupManager, // 执行语句
  BACKUP_TYPE, // 执行语句
  BACKUP_STATUS, // 执行语句
}; // 结束代码块

export default RedisBackupManager; // 默认导出
