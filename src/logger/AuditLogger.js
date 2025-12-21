/**
 * 审计日志系统
 * Audit Logger System
 *
 * 记录所有关键操作，用于合规审计和安全分析
 * Records all critical operations for compliance and security analysis
 *
 * @module src/logger/AuditLogger
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';

/**
 * 审计事件类型
 */
const AuditEventType = {
  // 认证相关
  AUTH_SUCCESS: 'auth_success',
  AUTH_FAILED: 'auth_failed',
  API_KEY_CREATED: 'api_key_created',
  API_KEY_REVOKED: 'api_key_revoked',

  // API 访问
  API_ACCESS: 'api_access',
  IP_BLOCKED: 'ip_blocked',
  RATE_LIMITED: 'rate_limited',

  // 交易相关
  ORDER_CREATED: 'order_created',
  ORDER_FILLED: 'order_filled',
  ORDER_CANCELLED: 'order_cancelled',
  ORDER_FAILED: 'order_failed',
  POSITION_OPENED: 'position_opened',
  POSITION_CLOSED: 'position_closed',

  // 风控相关
  RISK_ALERT: 'risk_alert',
  RISK_LIMIT_HIT: 'risk_limit_hit',
  TRADING_DISABLED: 'trading_disabled',
  TRADING_ENABLED: 'trading_enabled',

  // 资金相关
  WITHDRAWAL_REQUEST: 'withdrawal_request',
  DEPOSIT_DETECTED: 'deposit_detected',
  BALANCE_CHANGE: 'balance_change',

  // 系统相关
  SYSTEM_START: 'system_start',
  SYSTEM_STOP: 'system_stop',
  CONFIG_CHANGE: 'config_change',
  ERROR_CRITICAL: 'error_critical',

  // 策略相关
  STRATEGY_STARTED: 'strategy_started',
  STRATEGY_STOPPED: 'strategy_stopped',
  SIGNAL_GENERATED: 'signal_generated',
};

/**
 * 审计日志级别
 */
const AuditLevel = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

/**
 * 审计日志记录器
 * Audit Logger
 */
class AuditLogger extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // 日志目录
      logDir: config.logDir || process.env.AUDIT_LOG_DIR || './logs/audit',
      // 日志文件前缀
      filePrefix: config.filePrefix || 'audit',
      // 单个文件最大大小 (字节)
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB
      // 最大保留天数
      maxRetentionDays: config.maxRetentionDays || 90,
      // 是否启用加密
      enableEncryption: config.enableEncryption ?? false,
      // 加密密钥 (应从安全存储获取)
      encryptionKey: config.encryptionKey || process.env.AUDIT_ENCRYPTION_KEY,
      // 是否启用签名 (防篡改)
      enableIntegrity: config.enableIntegrity ?? true,
      // 签名密钥
      integrityKey: config.integrityKey || process.env.AUDIT_INTEGRITY_KEY || 'audit-integrity-key',
      // 是否输出到控制台
      consoleOutput: config.consoleOutput ?? (process.env.NODE_ENV !== 'production'),
      // 批量写入配置
      batchSize: config.batchSize || 100,
      flushInterval: config.flushInterval || 5000, // 5秒
      // 敏感字段 (需要脱敏) - 全部使用小写，因为检查时会转换为小写
      sensitiveFields: new Set(config.sensitiveFields || [
        'password', 'secret', 'apikey', 'privatekey', 'token',
        'apisecret', 'passphrase', 'credential', 'accesstoken',
        'refreshtoken', 'secretkey', 'privatekey', 'authorization',
      ]),
    };

    // 确保目录存在
    this._ensureLogDir();

    // 当前日志文件
    this.currentFile = null;
    this.currentFileSize = 0;
    this.currentDate = null;

    // 写入缓冲
    this.buffer = [];
    this.flushTimer = null;

    // 链式哈希 (用于完整性验证)
    this.lastHash = crypto.randomBytes(32).toString('hex');

    // 统计
    this.stats = {
      totalLogs: 0,
      logsToday: 0,
      errorCount: 0,
      lastLogTime: null,
    };

    // 启动定时刷新
    this._startFlushTimer();

    // 启动日志轮转检查
    this._startRetentionCheck();
  }

  /**
   * 记录审计日志
   * @param {string} eventType - 事件类型
   * @param {Object} data - 事件数据
   * @param {Object} options - 选项
   */
  log(eventType, data = {}, options = {}) {
    const level = options.level || this._getDefaultLevel(eventType);
    const timestamp = new Date().toISOString();

    // 脱敏处理
    const sanitizedData = this._sanitize(data);

    // 构建审计记录
    const record = {
      id: this._generateId(),
      timestamp,
      eventType,
      level,
      data: sanitizedData,
      metadata: {
        hostname: process.env.HOSTNAME || 'localhost',
        pid: process.pid,
        version: process.env.npm_package_version || '1.0.0',
        env: process.env.NODE_ENV || 'development',
      },
    };

    // 添加完整性签名
    if (this.config.enableIntegrity) {
      record.prevHash = this.lastHash;
      record.hash = this._computeHash(record);
      this.lastHash = record.hash;
    }

    // 添加到缓冲
    this.buffer.push(record);

    // 更新统计
    this.stats.totalLogs++;
    this.stats.logsToday++;
    this.stats.lastLogTime = timestamp;

    // 控制台输出
    if (this.config.consoleOutput) {
      this._consoleOutput(record);
    }

    // 发射事件
    this.emit('log', record);

    // 如果是关键事件，立即刷新
    if (level === AuditLevel.CRITICAL || this.buffer.length >= this.config.batchSize) {
      this.flush();
    }

    return record.id;
  }

  /**
   * 便捷方法：记录信息
   */
  info(eventType, data) {
    return this.log(eventType, data, { level: AuditLevel.INFO });
  }

  /**
   * 便捷方法：记录警告
   */
  warning(eventType, data) {
    return this.log(eventType, data, { level: AuditLevel.WARNING });
  }

  /**
   * 便捷方法：记录关键事件
   */
  critical(eventType, data) {
    return this.log(eventType, data, { level: AuditLevel.CRITICAL });
  }

  /**
   * 记录 API 访问
   */
  logApiAccess(req, res, duration) {
    return this.log(AuditEventType.API_ACCESS, {
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      statusCode: res.statusCode,
      duration,
      apiKey: req.headers['x-api-key'] ? '***' + req.headers['x-api-key'].slice(-4) : null,
    });
  }

  /**
   * 记录订单事件
   */
  logOrder(action, orderData) {
    const eventType = {
      created: AuditEventType.ORDER_CREATED,
      filled: AuditEventType.ORDER_FILLED,
      cancelled: AuditEventType.ORDER_CANCELLED,
      failed: AuditEventType.ORDER_FAILED,
    }[action] || 'order_unknown';

    return this.log(eventType, {
      orderId: orderData.id || orderData.orderId,
      symbol: orderData.symbol,
      side: orderData.side,
      type: orderData.type,
      amount: orderData.amount,
      price: orderData.price,
      status: orderData.status,
      exchange: orderData.exchange,
      error: orderData.error,
    }, {
      level: action === 'failed' ? AuditLevel.WARNING : AuditLevel.INFO,
    });
  }

  /**
   * 记录风控事件
   */
  logRiskEvent(eventType, data) {
    return this.log(eventType, data, {
      level: [
        AuditEventType.RISK_LIMIT_HIT,
        AuditEventType.TRADING_DISABLED,
      ].includes(eventType) ? AuditLevel.CRITICAL : AuditLevel.WARNING,
    });
  }

  /**
   * 刷新缓冲到文件
   */
  async flush() {
    if (this.buffer.length === 0) return;

    const records = [...this.buffer];
    this.buffer = [];

    try {
      await this._writeRecords(records);
    } catch (error) {
      // 写入失败，放回缓冲
      this.buffer.unshift(...records);
      this.stats.errorCount++;
      this.emit('error', error);
      console.error('[AuditLogger] 写入失败:', error.message);
    }
  }

  /**
   * 查询审计日志
   * @param {Object} query - 查询条件
   * @returns {Promise<Array>} 匹配的记录
   */
  async query(query = {}) {
    const {
      startTime,
      endTime,
      eventType,
      level,
      limit = 1000,
    } = query;

    const results = [];
    const files = await this._getLogFiles();

    for (const file of files) {
      // 检查文件日期是否在范围内
      const fileDate = this._extractDateFromFilename(file);
      if (startTime && fileDate < startTime) continue;
      if (endTime && fileDate > endTime) continue;

      try {
        const content = await fs.promises.readFile(file, 'utf8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          if (!line) continue;

          let record;
          try {
            record = JSON.parse(line);
          } catch {
            continue;
          }

          // 应用过滤条件
          if (eventType && record.eventType !== eventType) continue;
          if (level && record.level !== level) continue;
          if (startTime && new Date(record.timestamp) < new Date(startTime)) continue;
          if (endTime && new Date(record.timestamp) > new Date(endTime)) continue;

          results.push(record);

          if (results.length >= limit) {
            return results;
          }
        }
      } catch (error) {
        console.error(`[AuditLogger] 读取文件失败 ${file}:`, error.message);
      }
    }

    return results;
  }

  /**
   * 验证日志完整性
   * @param {string} filePath - 日志文件路径
   * @returns {Promise<Object>} 验证结果
   */
  async verifyIntegrity(filePath) {
    const result = {
      valid: true,
      totalRecords: 0,
      invalidRecords: [],
      chainBroken: false,
    };

    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');

      let prevHash = null;

      for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue;

        let record;
        try {
          record = JSON.parse(lines[i]);
        } catch {
          result.invalidRecords.push({ line: i + 1, error: 'JSON parse error' });
          result.valid = false;
          continue;
        }

        result.totalRecords++;

        // 验证哈希链
        if (prevHash !== null && record.prevHash !== prevHash) {
          result.chainBroken = true;
          result.invalidRecords.push({
            line: i + 1,
            error: 'Chain broken - prevHash mismatch',
          });
          result.valid = false;
        }

        // 验证记录哈希
        const expectedHash = this._computeHash({ ...record, hash: undefined });
        if (record.hash !== expectedHash) {
          result.invalidRecords.push({
            line: i + 1,
            error: 'Hash mismatch - record may be tampered',
          });
          result.valid = false;
        }

        prevHash = record.hash;
      }
    } catch (error) {
      result.valid = false;
      result.error = error.message;
    }

    return result;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      bufferSize: this.buffer.length,
      currentFile: this.currentFile,
    };
  }

  /**
   * 停止审计日志记录器
   */
  async stop() {
    // 停止定时器
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }

    // 刷新剩余日志
    await this.flush();

    this.emit('stopped');
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 确保日志目录存在
   * @private
   */
  _ensureLogDir() {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * 生成记录 ID
   * @private
   */
  _generateId() {
    return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * 计算记录哈希
   * @private
   */
  _computeHash(record) {
    const data = JSON.stringify({
      id: record.id,
      timestamp: record.timestamp,
      eventType: record.eventType,
      level: record.level,
      data: record.data,
      prevHash: record.prevHash,
    });

    return crypto
      .createHmac('sha256', this.config.integrityKey)
      .update(data)
      .digest('hex');
  }

  /**
   * 脱敏处理
   * @private
   */
  _sanitize(data, depth = 0) {
    if (depth > 10) return '[MAX_DEPTH]';
    if (data === null || data === undefined) return data;

    if (typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this._sanitize(item, depth + 1));
    }

    const result = {};
    for (const [key, value] of Object.entries(data)) {
      if (this.config.sensitiveFields.has(key.toLowerCase())) {
        result[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this._sanitize(value, depth + 1);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 获取事件的默认级别
   * @private
   */
  _getDefaultLevel(eventType) {
    const criticalEvents = [
      AuditEventType.AUTH_FAILED,
      AuditEventType.RISK_LIMIT_HIT,
      AuditEventType.TRADING_DISABLED,
      AuditEventType.ERROR_CRITICAL,
      AuditEventType.WITHDRAWAL_REQUEST,
    ];

    const warningEvents = [
      AuditEventType.IP_BLOCKED,
      AuditEventType.RATE_LIMITED,
      AuditEventType.ORDER_FAILED,
      AuditEventType.RISK_ALERT,
    ];

    if (criticalEvents.includes(eventType)) {
      return AuditLevel.CRITICAL;
    }
    if (warningEvents.includes(eventType)) {
      return AuditLevel.WARNING;
    }
    return AuditLevel.INFO;
  }

  /**
   * 控制台输出
   * @private
   */
  _consoleOutput(record) {
    const levelColors = {
      info: '\x1b[36m',    // 青色
      warning: '\x1b[33m', // 黄色
      critical: '\x1b[31m', // 红色
    };
    const reset = '\x1b[0m';
    const color = levelColors[record.level] || '';

    console.log(
      `${color}[AUDIT]${reset} ${record.timestamp} [${record.level.toUpperCase()}] ${record.eventType}`,
      JSON.stringify(record.data)
    );
  }

  /**
   * 写入记录到文件
   * @private
   */
  async _writeRecords(records) {
    const today = new Date().toISOString().slice(0, 10);

    // 检查是否需要新文件
    if (this.currentDate !== today || !this.currentFile) {
      this.currentDate = today;
      this.currentFile = path.join(
        this.config.logDir,
        `${this.config.filePrefix}-${today}.log`
      );
      this.currentFileSize = 0;

      if (fs.existsSync(this.currentFile)) {
        const stats = await fs.promises.stat(this.currentFile);
        this.currentFileSize = stats.size;
      }
    }

    // 检查文件大小
    if (this.currentFileSize > this.config.maxFileSize) {
      const index = Math.floor(Date.now() / 1000);
      this.currentFile = path.join(
        this.config.logDir,
        `${this.config.filePrefix}-${today}-${index}.log`
      );
      this.currentFileSize = 0;
    }

    // 格式化记录
    const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n';

    // 加密 (如果启用)
    let content = lines;
    if (this.config.enableEncryption && this.config.encryptionKey) {
      content = this._encrypt(lines);
    }

    // 写入文件
    await fs.promises.appendFile(this.currentFile, content);
    this.currentFileSize += Buffer.byteLength(content);
  }

  /**
   * 加密内容
   * @private
   */
  _encrypt(content) {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted + '\n';
  }

  /**
   * 解密内容
   * @private
   */
  _decrypt(content) {
    const [ivHex, encrypted] = content.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 启动定时刷新
   * @private
   */
  _startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        console.error('[AuditLogger] 定时刷新失败:', err.message);
      });
    }, this.config.flushInterval);
  }

  /**
   * 启动日志保留检查
   * @private
   */
  _startRetentionCheck() {
    // 每天检查一次
    this.retentionTimer = setInterval(() => {
      this._cleanupOldLogs().catch(err => {
        console.error('[AuditLogger] 清理旧日志失败:', err.message);
      });
    }, 24 * 60 * 60 * 1000);

    // 启动时也执行一次
    this._cleanupOldLogs().catch(() => {});
  }

  /**
   * 清理旧日志
   * @private
   */
  async _cleanupOldLogs() {
    const files = await this._getLogFiles();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxRetentionDays);

    for (const file of files) {
      const fileDate = this._extractDateFromFilename(file);
      if (fileDate && fileDate < cutoffDate) {
        try {
          await fs.promises.unlink(file);
          console.log(`[AuditLogger] 已删除过期日志: ${file}`);
        } catch (error) {
          console.error(`[AuditLogger] 删除失败 ${file}:`, error.message);
        }
      }
    }
  }

  /**
   * 获取日志文件列表
   * @private
   */
  async _getLogFiles() {
    const files = await fs.promises.readdir(this.config.logDir);
    return files
      .filter(f => f.startsWith(this.config.filePrefix) && f.endsWith('.log'))
      .map(f => path.join(this.config.logDir, f))
      .sort();
  }

  /**
   * 从文件名提取日期
   * @private
   */
  _extractDateFromFilename(filename) {
    const match = path.basename(filename).match(/(\d{4}-\d{2}-\d{2})/);
    return match ? new Date(match[1]) : null;
  }
}

export {
  AuditLogger,
  AuditEventType,
  AuditLevel,
};

export default AuditLogger;
