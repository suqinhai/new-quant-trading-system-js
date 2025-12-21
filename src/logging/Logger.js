/**
 * 结构化日志记录器
 * Structured Logger
 *
 * 提供结构化日志记录，支持日志轮换和多目标输出
 * Provides structured logging with rotation and multi-target output
 *
 * @module src/logging/Logger
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

/**
 * 日志级别
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

const LogLevelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

/**
 * 结构化日志记录器类
 * Structured Logger Class
 */
class Logger extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // 日志级别
      level: config.level || 'info',
      // 日志格式
      format: config.format || 'json',
      // 日志目录
      logDir: config.logDir || './logs',
      // 日志文件名前缀
      filePrefix: config.filePrefix || 'app',
      // 最大文件大小 (bytes)
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024,
      // 最大文件数
      maxFiles: config.maxFiles || 10,
      // 是否输出到控制台
      console: config.console ?? true,
      // 是否输出到文件
      file: config.file ?? true,
      // 是否包含时间戳
      timestamp: config.timestamp ?? true,
      // 是否包含调用位置
      includeLocation: config.includeLocation ?? false,
      // 上下文
      context: config.context || {},
      // 敏感字段
      sensitiveFields: config.sensitiveFields || [
        'password', 'secret', 'apiKey', 'token', 'authorization',
      ],
    };

    // 当前日志级别
    this.levelValue = this._getLevelValue(this.config.level);

    // 当前日志文件
    this.currentFile = null;
    this.currentFileSize = 0;

    // 确保日志目录存在
    if (this.config.file) {
      this._ensureLogDir();
      this._initLogFile();
    }

    // 子日志器
    this.children = new Map();
  }

  /**
   * 获取日志级别值
   * @private
   */
  _getLevelValue(level) {
    const levelUpper = level.toUpperCase();
    return LogLevel[levelUpper] !== undefined ? LogLevel[levelUpper] : LogLevel.INFO;
  }

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
   * 初始化日志文件
   * @private
   */
  _initLogFile() {
    const timestamp = new Date().toISOString().split('T')[0];
    this.currentFile = path.join(
      this.config.logDir,
      `${this.config.filePrefix}-${timestamp}.log`
    );

    // 检查文件大小
    if (fs.existsSync(this.currentFile)) {
      const stats = fs.statSync(this.currentFile);
      this.currentFileSize = stats.size;

      if (this.currentFileSize >= this.config.maxFileSize) {
        this._rotateLog();
      }
    } else {
      this.currentFileSize = 0;
      // 确保文件存在
      fs.writeFileSync(this.currentFile, '');
    }
  }

  /**
   * 轮换日志文件
   * @private
   */
  _rotateLog() {
    // 重命名当前文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = this.currentFile.replace('.log', `-${timestamp}.log`);

    if (fs.existsSync(this.currentFile)) {
      fs.renameSync(this.currentFile, rotatedFile);
    }

    // 清理旧文件
    this._cleanupOldLogs();

    // 重新初始化
    this.currentFileSize = 0;
    // 确保新文件存在
    fs.writeFileSync(this.currentFile, '');

    this.emit('rotated', { oldFile: rotatedFile, newFile: this.currentFile });
  }

  /**
   * 清理旧日志文件
   * @private
   */
  _cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.config.logDir)
        .filter(f => f.startsWith(this.config.filePrefix) && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.config.logDir, f),
          mtime: fs.statSync(path.join(this.config.logDir, f)).mtime,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // 删除超过限制的文件
      const toDelete = files.slice(this.config.maxFiles);
      for (const file of toDelete) {
        fs.unlinkSync(file.path);
      }
    } catch (error) {
      console.error('[Logger] Failed to cleanup old logs:', error.message);
    }
  }

  /**
   * 格式化日志条目
   * @private
   */
  _formatEntry(level, message, data = {}) {
    const entry = {
      level: LogLevelNames[level],
      message,
      ...this.config.context,
      ...this._sanitizeData(data),
    };

    if (this.config.timestamp) {
      entry.timestamp = new Date().toISOString();
    }

    if (this.config.includeLocation) {
      entry.location = this._getCallLocation();
    }

    if (this.config.format === 'json') {
      return JSON.stringify(entry);
    }

    // 文本格式
    const parts = [];
    if (entry.timestamp) parts.push(entry.timestamp);
    parts.push(`[${entry.level}]`);
    parts.push(message);

    if (Object.keys(data).length > 0) {
      parts.push(JSON.stringify(this._sanitizeData(data)));
    }

    return parts.join(' ');
  }

  /**
   * 脱敏数据
   * @private
   */
  _sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      if (this.config.sensitiveFields.some(f =>
        key.toLowerCase().includes(f.toLowerCase())
      )) {
        sanitized[key] = '***REDACTED***';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this._sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 获取调用位置
   * @private
   */
  _getCallLocation() {
    const stack = new Error().stack;
    const lines = stack.split('\n');

    // 跳过 Error 行和 Logger 内部调用
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('Logger.js') && !line.includes('logging/')) {
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        if (match) {
          return {
            function: match[1],
            file: match[2],
            line: parseInt(match[3], 10),
          };
        }
      }
    }

    return null;
  }

  /**
   * 写入日志
   * @private
   */
  _write(level, message, data = {}) {
    if (level < this.levelValue) {
      return;
    }

    const formatted = this._formatEntry(level, message, data);

    // 输出到控制台
    if (this.config.console) {
      const consoleMethod = this._getConsoleMethod(level);
      consoleMethod(formatted);
    }

    // 输出到文件（使用同步写入确保可靠性）
    if (this.config.file && this.currentFile) {
      const line = formatted + '\n';
      fs.appendFileSync(this.currentFile, line);
      this.currentFileSize += Buffer.byteLength(line);

      // 检查是否需要轮换
      if (this.currentFileSize >= this.config.maxFileSize) {
        this._rotateLog();
      }
    }

    // 发射事件
    this.emit('log', { level: LogLevelNames[level], message, data });
  }

  /**
   * 获取控制台方法
   * @private
   */
  _getConsoleMethod(level) {
    switch (level) {
      case LogLevel.DEBUG: return console.debug;
      case LogLevel.INFO: return console.info;
      case LogLevel.WARN: return console.warn;
      case LogLevel.ERROR:
      case LogLevel.FATAL: return console.error;
      default: return console.log;
    }
  }

  // ============================================
  // 公共日志方法
  // ============================================

  /**
   * 调试日志
   */
  debug(message, data = {}) {
    this._write(LogLevel.DEBUG, message, data);
  }

  /**
   * 信息日志
   */
  info(message, data = {}) {
    this._write(LogLevel.INFO, message, data);
  }

  /**
   * 警告日志
   */
  warn(message, data = {}) {
    this._write(LogLevel.WARN, message, data);
  }

  /**
   * 错误日志
   */
  error(message, data = {}) {
    // 如果 data 是 Error 对象，提取信息
    if (data instanceof Error) {
      data = {
        error: data.message,
        stack: data.stack,
        name: data.name,
      };
    }
    this._write(LogLevel.ERROR, message, data);
  }

  /**
   * 致命错误日志
   */
  fatal(message, data = {}) {
    if (data instanceof Error) {
      data = {
        error: data.message,
        stack: data.stack,
        name: data.name,
      };
    }
    this._write(LogLevel.FATAL, message, data);
  }

  /**
   * 通用日志方法
   */
  log(level, message, data = {}) {
    const levelValue = this._getLevelValue(level);
    this._write(levelValue, message, data);
  }

  // ============================================
  // 子日志器
  // ============================================

  /**
   * 创建子日志器
   * @param {string} name - 子日志器名称
   * @param {Object} context - 额外上下文
   */
  child(name, context = {}) {
    if (this.children.has(name)) {
      return this.children.get(name);
    }

    const childContext = {
      ...this.config.context,
      logger: name,
      ...context,
    };

    const childLogger = new Logger({
      ...this.config,
      context: childContext,
      // 子日志器不创建新文件，共享父日志器的流
      file: false,
      console: this.config.console,
    });

    // 将子日志器的输出转发到父日志器
    childLogger.on('log', ({ level, message, data }) => {
      this._write(this._getLevelValue(level), message, {
        ...childContext,
        ...data,
        _childLogger: name,
      });
    });

    this.children.set(name, childLogger);

    return childLogger;
  }

  // ============================================
  // 计时功能
  // ============================================

  /**
   * 开始计时
   * @param {string} label - 计时标签
   */
  time(label) {
    return {
      label,
      start: process.hrtime.bigint(),
      end: () => {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - this.timers?.get(label)?.start || 0n) / 1e6;
        this.info(`${label}`, { durationMs });
        return durationMs;
      },
    };
  }

  /**
   * 记录操作耗时
   * @param {string} label - 标签
   * @param {Function} fn - 要计时的函数
   */
  async timeAsync(label, fn) {
    const start = process.hrtime.bigint();
    try {
      const result = await fn();
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      this.info(`${label} completed`, { durationMs });
      return result;
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      this.error(`${label} failed`, { durationMs, error: error.message });
      throw error;
    }
  }

  // ============================================
  // 配置和管理
  // ============================================

  /**
   * 设置日志级别
   */
  setLevel(level) {
    this.levelValue = this._getLevelValue(level);
    this.config.level = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel() {
    return this.config.level;
  }

  /**
   * 添加上下文
   */
  addContext(context) {
    Object.assign(this.config.context, context);
  }

  /**
   * 清除上下文
   */
  clearContext() {
    this.config.context = {};
  }

  /**
   * 刷新日志（同步写入已完成，无需操作）
   */
  flush() {
    return Promise.resolve();
  }

  /**
   * 关闭日志器
   */
  close() {
    // 关闭子日志器
    for (const child of this.children.values()) {
      child.close();
    }
    this.children.clear();
    return Promise.resolve();
  }

  /**
   * 获取日志文件列表
   */
  getLogFiles() {
    if (!fs.existsSync(this.config.logDir)) {
      return [];
    }

    return fs.readdirSync(this.config.logDir)
      .filter(f => f.startsWith(this.config.filePrefix) && f.endsWith('.log'))
      .map(f => path.join(this.config.logDir, f))
      .sort();
  }

  /**
   * 获取日志统计
   */
  getStats() {
    const files = this.getLogFiles();
    let totalSize = 0;

    for (const file of files) {
      try {
        totalSize += fs.statSync(file).size;
      } catch {
        // 忽略
      }
    }

    return {
      level: this.config.level,
      logDir: this.config.logDir,
      fileCount: files.length,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      currentFile: this.currentFile,
      currentFileSizeMB: Math.round(this.currentFileSize / 1024 / 1024 * 100) / 100,
    };
  }
}

// 全局日志器实例
let globalLogger = null;

/**
 * 获取全局日志器
 */
function getLogger(name = null, context = {}) {
  if (!globalLogger) {
    globalLogger = new Logger();
  }

  if (name) {
    return globalLogger.child(name, context);
  }

  return globalLogger;
}

/**
 * 初始化全局日志器
 */
function initLogger(config = {}) {
  globalLogger = new Logger(config);
  return globalLogger;
}

export {
  Logger,
  LogLevel,
  LogLevelNames,
  getLogger,
  initLogger,
};

export default Logger;
