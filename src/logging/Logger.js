/**
 * 结构化日志记录器
 * Structured Logger
 *
 * 提供结构化日志记录，支持日志轮换和多目标输出
 * Provides structured logging with rotation and multi-target output
 *
 * @module src/logging/Logger
 */

import fs from 'fs'; // 导入模块 fs
import path from 'path'; // 导入模块 path
import { EventEmitter } from 'events'; // 导入模块 events

/**
 * 日志级别
 */
const LogLevel = { // 定义常量 LogLevel
  DEBUG: 0, // DEBUG
  INFO: 1, // INFO
  WARN: 2, // WARN
  ERROR: 3, // 错误
  FATAL: 4, // FATAL
}; // 结束代码块

const LogLevelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']; // 定义常量 LogLevelNames

/**
 * 结构化日志记录器类
 * Structured Logger Class
 */
class Logger extends EventEmitter { // 定义类 Logger(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { // 设置 config
      // 日志级别
      level: config.level || 'info', // 级别
      // 日志格式
      format: config.format || 'json', // 格式
      // 日志目录
      logDir: config.logDir || './logs', // 日志Dir
      // 日志文件名前缀
      filePrefix: config.filePrefix || 'app', // 文件前缀
      // 最大文件大小 (bytes)
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 最大文件大小 (bytes)
      // 最大文件数
      maxFiles: config.maxFiles || 10, // 最大文件
      // 是否输出到控制台
      console: config.console ?? true, // 是否输出到控制台
      // 是否输出到文件
      file: config.file ?? true, // 文件
      // 是否包含时间戳
      timestamp: config.timestamp ?? true, // 时间戳
      // 是否包含调用位置
      includeLocation: config.includeLocation ?? false, // 是否包含调用位置
      // 上下文
      context: config.context || {}, // context
      // 敏感字段
      sensitiveFields: config.sensitiveFields || [ // sensitiveFields
        'password', 'secret', 'apiKey', 'token', 'authorization', // 执行语句
        'apikey', 'api_key', 'api_secret', 'secretKey', 'secret_key', // 执行语句
        'accessToken', 'access_token', 'refreshToken', 'refresh_token', // 执行语句
        'privateKey', 'private_key', 'passphrase', 'credential', // 执行语句
        'botToken', 'bot_token', 'chatId', 'chat_id', // 执行语句
        'smtpPass', 'smtp_pass', 'emailPassword', 'email_password', // 执行语句
        'masterKey', 'master_key', 'encryptionKey', 'encryption_key', // 执行语句
        'sessionId', 'session_id', 'cookie', 'jwt', 'bearer', // 执行语句
      ], // 结束数组或索引
      // 敏感值模式 (正则匹配)
      sensitivePatterns: config.sensitivePatterns || [ // 敏感值模式 (正则匹配)
        /^[A-Za-z0-9]{32,}$/,  // 长字符串可能是密钥
        /^\d{10,}:[A-Za-z0-9_-]{30,}$/,  // Telegram Bot Token 格式
        /^sk-[A-Za-z0-9]{20,}$/,  // API Key 格式
        /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,  // JWT 格式
      ], // 结束数组或索引
    }; // 结束代码块

    // 当前日志级别
    this.levelValue = this._getLevelValue(this.config.level); // 设置 levelValue

    // 当前日志文件
    this.currentFile = null; // 设置 currentFile
    this.currentFileSize = 0; // 设置 currentFileSize

    // 确保日志目录存在
    if (this.config.file) { // 条件判断 this.config.file
      this._ensureLogDir(); // 调用 _ensureLogDir
      this._initLogFile(); // 调用 _initLogFile
    } // 结束代码块

    // 子日志器
    this.children = new Map(); // 设置 children
  } // 结束代码块

  /**
   * 获取日志级别值
   * @private
   */
  _getLevelValue(level) { // 调用 _getLevelValue
    const levelUpper = level.toUpperCase(); // 定义常量 levelUpper
    return LogLevel[levelUpper] !== undefined ? LogLevel[levelUpper] : LogLevel.INFO; // 返回结果
  } // 结束代码块

  /**
   * 确保日志目录存在
   * @private
   */
  _ensureLogDir() { // 调用 _ensureLogDir
    if (!fs.existsSync(this.config.logDir)) { // 条件判断 !fs.existsSync(this.config.logDir)
      fs.mkdirSync(this.config.logDir, { recursive: true }); // 调用 fs.mkdirSync
    } // 结束代码块
  } // 结束代码块

  /**
   * 初始化日志文件
   * @private
   */
  _initLogFile() { // 调用 _initLogFile
    const timestamp = new Date().toISOString().split('T')[0]; // 定义常量 timestamp
    this.currentFile = path.join( // 设置 currentFile
      this.config.logDir, // 访问 config
      `${this.config.filePrefix}-${timestamp}.log` // 执行语句
    ); // 结束调用或参数

    // 检查文件大小
    if (fs.existsSync(this.currentFile)) { // 条件判断 fs.existsSync(this.currentFile)
      const stats = fs.statSync(this.currentFile); // 定义常量 stats
      this.currentFileSize = stats.size; // 设置 currentFileSize

      if (this.currentFileSize >= this.config.maxFileSize) { // 条件判断 this.currentFileSize >= this.config.maxFileSize
        this._rotateLog(); // 调用 _rotateLog
      } // 结束代码块
    } else { // 执行语句
      this.currentFileSize = 0; // 设置 currentFileSize
      // 确保文件存在
      fs.writeFileSync(this.currentFile, ''); // 调用 fs.writeFileSync
    } // 结束代码块
  } // 结束代码块

  /**
   * 轮换日志文件
   * @private
   */
  _rotateLog() { // 调用 _rotateLog
    // 重命名当前文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // 定义常量 timestamp
    const rotatedFile = this.currentFile.replace('.log', `-${timestamp}.log`); // 定义常量 rotatedFile

    if (fs.existsSync(this.currentFile)) { // 条件判断 fs.existsSync(this.currentFile)
      fs.renameSync(this.currentFile, rotatedFile); // 调用 fs.renameSync
    } // 结束代码块

    // 清理旧文件
    this._cleanupOldLogs(); // 调用 _cleanupOldLogs

    // 重新初始化
    this.currentFileSize = 0; // 设置 currentFileSize
    // 确保新文件存在
    fs.writeFileSync(this.currentFile, ''); // 调用 fs.writeFileSync

    this.emit('rotated', { oldFile: rotatedFile, newFile: this.currentFile }); // 调用 emit
  } // 结束代码块

  /**
   * 清理旧日志文件
   * @private
   */
  _cleanupOldLogs() { // 调用 _cleanupOldLogs
    try { // 尝试执行
      const files = fs.readdirSync(this.config.logDir) // 定义常量 files
        .filter(f => f.startsWith(this.config.filePrefix) && f.endsWith('.log')) // 定义箭头函数
        .map(f => ({ // 定义箭头函数
          name: f, // name
          path: path.join(this.config.logDir, f), // 路径
          mtime: fs.statSync(path.join(this.config.logDir, f)).mtime, // mtime
        })) // 结束代码块
        .sort((a, b) => b.mtime - a.mtime); // 定义箭头函数

      // 删除超过限制的文件
      const toDelete = files.slice(this.config.maxFiles); // 定义常量 toDelete
      for (const file of toDelete) { // 循环 const file of toDelete
        fs.unlinkSync(file.path); // 调用 fs.unlinkSync
      } // 结束代码块
    } catch (error) { // 执行语句
      console.error('[Logger] Failed to cleanup old logs:', error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  /**
   * 格式化日志条目
   * @private
   */
  _formatEntry(level, message, data = {}) { // 调用 _formatEntry
    const entry = { // 定义常量 entry
      level: LogLevelNames[level], // 级别
      message, // 执行语句
      ...this.config.context, // 展开对象或数组
      ...this._sanitizeData(data), // 展开对象或数组
    }; // 结束代码块

    if (this.config.timestamp) { // 条件判断 this.config.timestamp
      entry.timestamp = new Date().toISOString(); // 赋值 entry.timestamp
    } // 结束代码块

    if (this.config.includeLocation) { // 条件判断 this.config.includeLocation
      entry.location = this._getCallLocation(); // 赋值 entry.location
    } // 结束代码块

    if (this.config.format === 'json') { // 条件判断 this.config.format === 'json'
      return JSON.stringify(entry); // 返回结果
    } // 结束代码块

    // 文本格式
    const parts = []; // 定义常量 parts
    if (entry.timestamp) parts.push(entry.timestamp); // 条件判断 entry.timestamp
    parts.push(`[${entry.level}]`); // 调用 parts.push
    parts.push(message); // 调用 parts.push

    if (Object.keys(data).length > 0) { // 条件判断 Object.keys(data).length > 0
      parts.push(JSON.stringify(this._sanitizeData(data))); // 调用 parts.push
    } // 结束代码块

    return parts.join(' '); // 返回结果
  } // 结束代码块

  /**
   * 检查键名是否为敏感字段
   * Check if a key is a sensitive field
   * @private
   */
  _isSensitiveField(key) { // 调用 _isSensitiveField
    const lowerKey = key.toLowerCase(); // 定义常量 lowerKey

    for (const field of this.config.sensitiveFields) { // 循环 const field of this.config.sensitiveFields
      const lowerField = field.toLowerCase(); // 定义常量 lowerField

      // 精确匹配 / Exact match
      if (lowerKey === lowerField) return true; // 条件判断 lowerKey === lowerField

      // 下划线分隔后缀 (e.g., user_password)
      if (lowerKey.endsWith('_' + lowerField)) return true; // 条件判断 lowerKey.endsWith('_' + lowerField)

      // 下划线分隔前缀 (e.g., password_hash)
      if (lowerKey.startsWith(lowerField + '_')) return true; // 条件判断 lowerKey.startsWith(lowerField + '_')

      // 驼峰命名边界 (e.g., userPassword)
      // 检查敏感字段是否以大写字母开头出现在键名中
      const camelCaseField = field.charAt(0).toUpperCase() + field.slice(1).toLowerCase(); // 定义常量 camelCaseField
      if (key.includes(camelCaseField)) return true; // 条件判断 key.includes(camelCaseField)
    } // 结束代码块

    return false; // 返回结果
  } // 结束代码块

  /**
   * 脱敏数据
   * @private
   */
  _sanitizeData(data) { // 调用 _sanitizeData
    if (!data || typeof data !== 'object') { // 条件判断 !data || typeof data !== 'object'
      // 检查字符串值是否匹配敏感模式
      if (typeof data === 'string') { // 条件判断 typeof data === 'string'
        return this._sanitizeValue(data); // 返回结果
      } // 结束代码块
      return data; // 返回结果
    } // 结束代码块

    const sanitized = Array.isArray(data) ? [] : {}; // 定义常量 sanitized

    for (const [key, value] of Object.entries(data)) { // 循环 const [key, value] of Object.entries(data)
      // 检查键名是否是敏感字段（使用单词边界检测）
      if (this._isSensitiveField(key)) { // 条件判断 this._isSensitiveField(key)
        sanitized[key] = '***REDACTED***'; // 执行语句
      } else if (typeof value === 'string') { // 执行语句
        // 检查值是否匹配敏感模式
        sanitized[key] = this._sanitizeValue(value); // 执行语句
      } else if (typeof value === 'object' && value !== null) { // 执行语句
        sanitized[key] = this._sanitizeData(value); // 执行语句
      } else { // 执行语句
        sanitized[key] = value; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return sanitized; // 返回结果
  } // 结束代码块

  /**
   * 脱敏单个值
   * @private
   */
  _sanitizeValue(value) { // 调用 _sanitizeValue
    if (typeof value !== 'string') { // 条件判断 typeof value !== 'string'
      return value; // 返回结果
    } // 结束代码块

    // 检查是否匹配敏感模式
    for (const pattern of this.config.sensitivePatterns) { // 循环 const pattern of this.config.sensitivePatterns
      if (pattern.test(value)) { // 条件判断 pattern.test(value)
        // 保留前4位和后4位，中间用*替换
        if (value.length > 12) { // 条件判断 value.length > 12
          return value.slice(0, 4) + '****' + value.slice(-4); // 返回结果
        } // 结束代码块
        return '***REDACTED***'; // 返回结果
      } // 结束代码块
    } // 结束代码块

    // 检查是否是邮箱地址 (部分脱敏)
    const emailMatch = value.match(/^([^@]{1,3})[^@]*@(.+)$/); // 定义常量 emailMatch
    if (emailMatch) { // 条件判断 emailMatch
      return `${emailMatch[1]}***@${emailMatch[2]}`; // 返回结果
    } // 结束代码块

    // 检查是否是 IP 地址 (不脱敏，但标记为内部)
    if (/^(?:192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(value)) { // 条件判断 /^(?:192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[...
      return value; // 内网 IP 可以保留
    } // 结束代码块

    return value; // 返回结果
  } // 结束代码块

  /**
   * 获取调用位置
   * @private
   */
  _getCallLocation() { // 调用 _getCallLocation
    const stack = new Error().stack; // 定义常量 stack
    const lines = stack.split('\n'); // 定义常量 lines

    // 跳过 Error 行和 Logger 内部调用
    for (let i = 3; i < lines.length; i++) { // 循环 let i = 3; i < lines.length; i++
      const line = lines[i]; // 定义常量 line
      if (!line.includes('Logger.js') && !line.includes('logging/')) { // 条件判断 !line.includes('Logger.js') && !line.includes...
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/); // 定义常量 match
        if (match) { // 条件判断 match
          return { // 返回结果
            function: match[1], // function
            file: match[2], // 文件
            line: parseInt(match[3], 10), // line
          }; // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 写入日志
   * @private
   */
  _write(level, message, data = {}) { // 调用 _write
    if (level < this.levelValue) { // 条件判断 level < this.levelValue
      return; // 返回结果
    } // 结束代码块

    const formatted = this._formatEntry(level, message, data); // 定义常量 formatted

    // 输出到控制台
    if (this.config.console) { // 条件判断 this.config.console
      const consoleMethod = this._getConsoleMethod(level); // 定义常量 consoleMethod
      consoleMethod(formatted); // 调用 consoleMethod
    } // 结束代码块

    // 输出到文件（使用同步写入确保可靠性）
    if (this.config.file && this.currentFile) { // 条件判断 this.config.file && this.currentFile
      const line = formatted + '\n'; // 定义常量 line
      fs.appendFileSync(this.currentFile, line); // 调用 fs.appendFileSync
      this.currentFileSize += Buffer.byteLength(line); // 访问 currentFileSize

      // 检查是否需要轮换
      if (this.currentFileSize >= this.config.maxFileSize) { // 条件判断 this.currentFileSize >= this.config.maxFileSize
        this._rotateLog(); // 调用 _rotateLog
      } // 结束代码块
    } // 结束代码块

    // 发射事件
    this.emit('log', { level: LogLevelNames[level], message, data }); // 调用 emit
  } // 结束代码块

  /**
   * 获取控制台方法
   * @private
   */
  _getConsoleMethod(level) { // 调用 _getConsoleMethod
    switch (level) { // 分支选择 level
      case LogLevel.DEBUG: return console.debug; // 分支 LogLevel.DEBUG: return console.debug;
      case LogLevel.INFO: return console.info; // 分支 LogLevel.INFO: return console.info;
      case LogLevel.WARN: return console.warn; // 分支 LogLevel.WARN: return console.warn;
      case LogLevel.ERROR: // 分支 LogLevel.ERROR
      case LogLevel.FATAL: return console.error; // 分支 LogLevel.FATAL: return console.error;
      default: return console.log; // 默认
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 公共日志方法
  // ============================================

  /**
   * 调试日志
   */
  debug(message, data = {}) { // 调用 debug
    this._write(LogLevel.DEBUG, message, data); // 调用 _write
  } // 结束代码块

  /**
   * 信息日志
   */
  info(message, data = {}) { // 调用 info
    this._write(LogLevel.INFO, message, data); // 调用 _write
  } // 结束代码块

  /**
   * 警告日志
   */
  warn(message, data = {}) { // 调用 warn
    this._write(LogLevel.WARN, message, data); // 调用 _write
  } // 结束代码块

  /**
   * 错误日志
   */
  error(message, data = {}) { // 调用 error
    // 如果 data 是 Error 对象，提取信息
    if (data instanceof Error) { // 条件判断 data instanceof Error
      data = { // 赋值 data
        error: data.message, // 错误
        stack: data.stack, // stack
        name: data.name, // name
      }; // 结束代码块
    } // 结束代码块
    this._write(LogLevel.ERROR, message, data); // 调用 _write
  } // 结束代码块

  /**
   * 致命错误日志
   */
  fatal(message, data = {}) { // 调用 fatal
    if (data instanceof Error) { // 条件判断 data instanceof Error
      data = { // 赋值 data
        error: data.message, // 错误
        stack: data.stack, // stack
        name: data.name, // name
      }; // 结束代码块
    } // 结束代码块
    this._write(LogLevel.FATAL, message, data); // 调用 _write
  } // 结束代码块

  /**
   * 通用日志方法
   */
  log(level, message, data = {}) { // 调用 log
    const levelValue = this._getLevelValue(level); // 定义常量 levelValue
    this._write(levelValue, message, data); // 调用 _write
  } // 结束代码块

  // ============================================
  // 子日志器
  // ============================================

  /**
   * 创建子日志器
   * @param {string} name - 子日志器名称
   * @param {Object} context - 额外上下文
   */
  child(name, context = {}) { // 调用 child
    if (this.children.has(name)) { // 条件判断 this.children.has(name)
      return this.children.get(name); // 返回结果
    } // 结束代码块

    const childContext = { // 定义常量 childContext
      ...this.config.context, // 展开对象或数组
      logger: name, // 日志
      ...context, // 展开对象或数组
    }; // 结束代码块

    const childLogger = new Logger({ // 定义常量 childLogger
      ...this.config, // 展开对象或数组
      context: childContext, // context
      // 子日志器不创建新文件，共享父日志器的流
      file: false, // 子日志器不创建新文件，共享父日志器的流
      console: this.config.console, // console
    }); // 结束代码块

    // 将子日志器的输出转发到父日志器
    childLogger.on('log', ({ level, message, data }) => { // 注册事件监听
      this._write(this._getLevelValue(level), message, { // 调用 _write
        ...childContext, // 展开对象或数组
        ...data, // 展开对象或数组
        _childLogger: name, // child日志
      }); // 结束代码块
    }); // 结束代码块

    this.children.set(name, childLogger); // 访问 children

    return childLogger; // 返回结果
  } // 结束代码块

  // ============================================
  // 计时功能
  // ============================================

  /**
   * 开始计时
   * @param {string} label - 计时标签
   */
  time(label) { // 调用 time
    return { // 返回结果
      label, // 执行语句
      start: process.hrtime.bigint(), // 启动
      end: () => { // end
        const end = process.hrtime.bigint(); // 定义常量 end
        const durationMs = Number(end - this.timers?.get(label)?.start || 0n) / 1e6; // 定义常量 durationMs
        this.info(`${label}`, { durationMs }); // 调用 info
        return durationMs; // 返回结果
      }, // 结束代码块
    }; // 结束代码块
  } // 结束代码块

  /**
   * 记录操作耗时
   * @param {string} label - 标签
   * @param {Function} fn - 要计时的函数
   */
  async timeAsync(label, fn) { // 执行语句
    const start = process.hrtime.bigint(); // 定义常量 start
    try { // 尝试执行
      const result = await fn(); // 定义常量 result
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6; // 定义常量 durationMs
      this.info(`${label} completed`, { durationMs }); // 调用 info
      return result; // 返回结果
    } catch (error) { // 执行语句
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6; // 定义常量 durationMs
      this.error(`${label} failed`, { durationMs, error: error.message }); // 调用 error
      throw error; // 抛出异常
    } // 结束代码块
  } // 结束代码块

  // ============================================
  // 配置和管理
  // ============================================

  /**
   * 设置日志级别
   */
  setLevel(level) { // 调用 setLevel
    this.levelValue = this._getLevelValue(level); // 设置 levelValue
    this.config.level = level; // 访问 config
  } // 结束代码块

  /**
   * 获取当前日志级别
   */
  getLevel() { // 调用 getLevel
    return this.config.level; // 返回结果
  } // 结束代码块

  /**
   * 添加上下文
   */
  addContext(context) { // 调用 addContext
    Object.assign(this.config.context, context); // 调用 Object.assign
  } // 结束代码块

  /**
   * 清除上下文
   */
  clearContext() { // 调用 clearContext
    this.config.context = {}; // 访问 config
  } // 结束代码块

  /**
   * 刷新日志（同步写入已完成，无需操作）
   */
  flush() { // 调用 flush
    return Promise.resolve(); // 返回结果
  } // 结束代码块

  /**
   * 关闭日志器
   */
  close() { // 调用 close
    // 关闭子日志器
    for (const child of this.children.values()) { // 循环 const child of this.children.values()
      child.close(); // 调用 child.close
    } // 结束代码块
    this.children.clear(); // 访问 children
    return Promise.resolve(); // 返回结果
  } // 结束代码块

  /**
   * 获取日志文件列表
   */
  getLogFiles() { // 调用 getLogFiles
    if (!fs.existsSync(this.config.logDir)) { // 条件判断 !fs.existsSync(this.config.logDir)
      return []; // 返回结果
    } // 结束代码块

    return fs.readdirSync(this.config.logDir) // 返回结果
      .filter(f => f.startsWith(this.config.filePrefix) && f.endsWith('.log')) // 定义箭头函数
      .map(f => path.join(this.config.logDir, f)) // 定义箭头函数
      .sort(); // 执行语句
  } // 结束代码块

  /**
   * 获取日志统计
   */
  getStats() { // 调用 getStats
    const files = this.getLogFiles(); // 定义常量 files
    let totalSize = 0; // 定义变量 totalSize

    for (const file of files) { // 循环 const file of files
      try { // 尝试执行
        totalSize += fs.statSync(file).size; // 执行语句
      } catch { // 执行语句
        // 忽略
      } // 结束代码块
    } // 结束代码块

    return { // 返回结果
      level: this.config.level, // 级别
      logDir: this.config.logDir, // 日志Dir
      fileCount: files.length, // 文件数量
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100, // 总大小MB
      currentFile: this.currentFile, // current文件
      currentFileSizeMB: Math.round(this.currentFileSize / 1024 / 1024 * 100) / 100, // current文件大小MB
    }; // 结束代码块
  } // 结束代码块
} // 结束代码块

// 全局日志器实例
let globalLogger = null; // 定义变量 globalLogger

/**
 * 获取全局日志器
 */
function getLogger(name = null, context = {}) { // 定义函数 getLogger
  if (!globalLogger) { // 条件判断 !globalLogger
    globalLogger = new Logger(); // 赋值 globalLogger
  } // 结束代码块

  if (name) { // 条件判断 name
    return globalLogger.child(name, context); // 返回结果
  } // 结束代码块

  return globalLogger; // 返回结果
} // 结束代码块

/**
 * 初始化全局日志器
 */
function initLogger(config = {}) { // 定义函数 initLogger
  globalLogger = new Logger(config); // 赋值 globalLogger
  return globalLogger; // 返回结果
} // 结束代码块

export { // 导出命名成员
  Logger, // 执行语句
  LogLevel, // 执行语句
  LogLevelNames, // 执行语句
  getLogger, // 执行语句
  initLogger, // 执行语句
}; // 结束代码块

export default Logger; // 默认导出
