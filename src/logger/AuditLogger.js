/**
 * 审计日志系统
 * Audit Logger System
 *
 * 记录所有关键操作，用于合规审计和安全分析
 * Records all critical operations for compliance and security analysis
 *
 * @module src/logger/AuditLogger
 */

import fs from 'fs'; // 导入模块 fs
import path from 'path'; // 导入模块 path
import crypto from 'crypto'; // 导入模块 crypto
import { EventEmitter } from 'events'; // 导入模块 events

/**
 * 审计事件类型
 */
const AuditEventType = { // 定义常量 AuditEventType
  // 认证相关
  AUTH_SUCCESS: 'auth_success', // AUTH成功标记
  AUTH_FAILED: 'auth_failed', // AUTHFAILED
  API_KEY_CREATED: 'api_key_created', // API密钥CREATED权限
  API_KEY_REVOKED: 'api_key_revoked', // API密钥REVOKED

  // API 访问
  API_ACCESS: 'api_access', // APIACCESS
  IP_BLOCKED: 'ip_blocked', // IPBLOCKED
  RATE_LIMITED: 'rate_limited', // 频率LIMITED

  // 交易相关
  ORDER_CREATED: 'order_created', // 订单CREATED权限
  ORDER_FILLED: 'order_filled', // 订单FILLED
  ORDER_CANCELLED: 'order_cancelled', // 订单CANCELLED
  ORDER_FAILED: 'order_failed', // 订单FAILED
  POSITION_OPENED: 'position_opened', // 持仓OPENED
  POSITION_CLOSED: 'position_closed', // 持仓CLOSED权限

  // 风控相关
  RISK_ALERT: 'risk_alert', // 风险告警
  RISK_LIMIT_HIT: 'risk_limit_hit', // 风险限制HIT
  TRADING_DISABLED: 'trading_disabled', // 交易DISABLED权限
  TRADING_ENABLED: 'trading_enabled', // 交易启用权限

  // 资金相关
  WITHDRAWAL_REQUEST: 'withdrawal_request', // WITHDRAWALREQUEST
  DEPOSIT_DETECTED: 'deposit_detected', // DEPOSITDETECTED
  BALANCE_CHANGE: 'balance_change', // 余额修改权限

  // 系统相关
  SYSTEM_START: 'system_start', // 系统启动权限
  SYSTEM_STOP: 'system_stop', // 系统停止权限
  CONFIG_CHANGE: 'config_change', // 配置修改权限
  ERROR_CRITICAL: 'error_critical', // 错误CRITICAL

  // 策略相关
  STRATEGY_STARTED: 'strategy_started', // 策略STARTED权限
  STRATEGY_STOPPED: 'strategy_stopped', // 策略STOPPED权限
  SIGNAL_GENERATED: 'signal_generated', // 信号GENERATED
}; // 结束代码块

/**
 * 审计日志级别
 */
const AuditLevel = { // 定义常量 AuditLevel
  INFO: 'info', // INFO
  WARNING: 'warning', // 警告
  CRITICAL: 'critical', // CRITICAL
}; // 结束代码块

/**
 * 审计日志记录器
 * Audit Logger
 */
class AuditLogger extends EventEmitter { // 定义类 AuditLogger(继承EventEmitter)
  constructor(config = {}) { // 构造函数
    super(); // 调用父类

    this.config = { // 设置 config
      // 日志目录
      logDir: config.logDir || process.env.AUDIT_LOG_DIR || './logs/audit', // 日志Dir
      // 日志文件前缀
      filePrefix: config.filePrefix || 'audit', // 文件前缀
      // 单个文件最大大小 (字节)
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 单个文件最大大小 (字节)
      // 最大保留天数
      maxRetentionDays: config.maxRetentionDays || 90, // 最大保留天数
      // 是否启用加密
      enableEncryption: config.enableEncryption ?? false, // 启用Encryption
      // 加密密钥 (应从安全存储获取)
      encryptionKey: config.encryptionKey || process.env.AUDIT_ENCRYPTION_KEY, // 加密密钥 (应从安全存储获取)
      // 是否启用签名 (防篡改)
      enableIntegrity: config.enableIntegrity ?? true, // 是否启用签名 (防篡改)
      // 签名密钥
      integrityKey: config.integrityKey || process.env.AUDIT_INTEGRITY_KEY || 'audit-integrity-key', // integrity密钥
      // 是否输出到控制台
      consoleOutput: config.consoleOutput ?? (process.env.NODE_ENV !== 'production'), // 是否输出到控制台
      // 批量写入配置
      batchSize: config.batchSize || 100, // 批次大小
      flushInterval: config.flushInterval || 5000, // flush间隔
      // 敏感字段 (需要脱敏) - 全部使用小写，因为检查时会转换为小写
      sensitiveFields: new Set(config.sensitiveFields || [ // 敏感字段 (需要脱敏) - 全部使用小写，因为检查时会转换为小写
        'password', 'secret', 'apikey', 'privatekey', 'token', // 执行语句
        'apisecret', 'passphrase', 'credential', 'accesstoken', // 执行语句
        'refreshtoken', 'secretkey', 'privatekey', 'authorization', // 执行语句
      ]), // 结束数组或索引
    }; // 结束代码块

    // 确保目录存在
    this._ensureLogDir(); // 调用 _ensureLogDir

    // 当前日志文件
    this.currentFile = null; // 设置 currentFile
    this.currentFileSize = 0; // 设置 currentFileSize
    this.currentDate = null; // 设置 currentDate

    // 写入缓冲
    this.buffer = []; // 设置 buffer
    this.flushTimer = null; // 设置 flushTimer

    // 链式哈希 (用于完整性验证)
    this.lastHash = crypto.randomBytes(32).toString('hex'); // 设置 lastHash

    // 统计
    this.stats = { // 设置 stats
      totalLogs: 0, // 总Logs
      logsToday: 0, // logsToday
      errorCount: 0, // 错误数量
      lastLogTime: null, // last日志时间
    }; // 结束代码块

    // 启动定时刷新
    this._startFlushTimer(); // 调用 _startFlushTimer

    // 启动日志轮转检查
    this._startRetentionCheck(); // 调用 _startRetentionCheck
  } // 结束代码块

  /**
   * 记录审计日志
   * @param {string} eventType - 事件类型
   * @param {Object} data - 事件数据
   * @param {Object} options - 选项
   */
  log(eventType, data = {}, options = {}) { // 调用 log
    const level = options.level || this._getDefaultLevel(eventType); // 定义常量 level
    const timestamp = new Date().toISOString(); // 定义常量 timestamp

    // 脱敏处理
    const sanitizedData = this._sanitize(data); // 定义常量 sanitizedData

    // 构建审计记录
    const record = { // 定义常量 record
      id: this._generateId(), // ID
      timestamp, // 执行语句
      eventType, // 执行语句
      level, // 执行语句
      data: sanitizedData, // 数据
      metadata: { // 元数据
        hostname: process.env.HOSTNAME || 'localhost', // hostname
        pid: process.pid, // pid
        version: process.env.npm_package_version || '1.0.0', // version
        env: process.env.NODE_ENV || 'development', // env
      }, // 结束代码块
    }; // 结束代码块

    // 添加完整性签名
    if (this.config.enableIntegrity) { // 条件判断 this.config.enableIntegrity
      record.prevHash = this.lastHash; // 赋值 record.prevHash
      record.hash = this._computeHash(record); // 赋值 record.hash
      this.lastHash = record.hash; // 设置 lastHash
    } // 结束代码块

    // 添加到缓冲
    this.buffer.push(record); // 访问 buffer

    // 更新统计
    this.stats.totalLogs++; // 访问 stats
    this.stats.logsToday++; // 访问 stats
    this.stats.lastLogTime = timestamp; // 访问 stats

    // 控制台输出
    if (this.config.consoleOutput) { // 条件判断 this.config.consoleOutput
      this._consoleOutput(record); // 调用 _consoleOutput
    } // 结束代码块

    // 发射事件
    this.emit('log', record); // 调用 emit

    // 如果是关键事件，立即刷新
    if (level === AuditLevel.CRITICAL || this.buffer.length >= this.config.batchSize) { // 条件判断 level === AuditLevel.CRITICAL || this.buffer....
      this.flush(); // 调用 flush
    } // 结束代码块

    return record.id; // 返回结果
  } // 结束代码块

  /**
   * 便捷方法：记录信息
   */
  info(eventType, data) { // 调用 info
    return this.log(eventType, data, { level: AuditLevel.INFO }); // 返回结果
  } // 结束代码块

  /**
   * 便捷方法：记录警告
   */
  warning(eventType, data) { // 调用 warning
    return this.log(eventType, data, { level: AuditLevel.WARNING }); // 返回结果
  } // 结束代码块

  /**
   * 便捷方法：记录关键事件
   */
  critical(eventType, data) { // 调用 critical
    return this.log(eventType, data, { level: AuditLevel.CRITICAL }); // 返回结果
  } // 结束代码块

  /**
   * 记录 API 访问
   */
  logApiAccess(req, res, duration) { // 调用 logApiAccess
    return this.log(AuditEventType.API_ACCESS, { // 返回结果
      method: req.method, // method
      path: req.path, // 路径
      query: req.query, // query
      ip: req.ip || req.connection?.remoteAddress, // ip
      userAgent: req.headers['user-agent'], // 用户Agent
      statusCode: res.statusCode, // 状态代码
      duration, // 执行语句
      apiKey: req.headers['x-api-key'] ? '***' + req.headers['x-api-key'].slice(-4) : null, // API密钥
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录订单事件
   */
  logOrder(action, orderData) { // 调用 logOrder
    const eventType = { // 定义常量 eventType
      created: AuditEventType.ORDER_CREATED, // created
      filled: AuditEventType.ORDER_FILLED, // filled
      cancelled: AuditEventType.ORDER_CANCELLED, // cancelled
      failed: AuditEventType.ORDER_FAILED, // failed
    }[action] || 'order_unknown'; // 执行语句

    return this.log(eventType, { // 返回结果
      orderId: orderData.id || orderData.orderId, // 订单ID
      symbol: orderData.symbol, // 交易对
      side: orderData.side, // 方向
      type: orderData.type, // 类型
      amount: orderData.amount, // 数量
      price: orderData.price, // 价格
      status: orderData.status, // 状态
      exchange: orderData.exchange, // 交易所
      error: orderData.error, // 错误
    }, { // 执行语句
      level: action === 'failed' ? AuditLevel.WARNING : AuditLevel.INFO, // 级别
    }); // 结束代码块
  } // 结束代码块

  /**
   * 记录风控事件
   */
  logRiskEvent(eventType, data) { // 调用 logRiskEvent
    return this.log(eventType, data, { // 返回结果
      level: [ // 级别
        AuditEventType.RISK_LIMIT_HIT, // 执行语句
        AuditEventType.TRADING_DISABLED, // 执行语句
      ].includes(eventType) ? AuditLevel.CRITICAL : AuditLevel.WARNING, // 执行语句
    }); // 结束代码块
  } // 结束代码块

  /**
   * 刷新缓冲到文件
   */
  async flush() { // 执行语句
    if (this.buffer.length === 0) return; // 条件判断 this.buffer.length === 0

    const records = [...this.buffer]; // 定义常量 records
    this.buffer = []; // 设置 buffer

    try { // 尝试执行
      await this._writeRecords(records); // 等待异步结果
    } catch (error) { // 执行语句
      // 写入失败，放回缓冲
      this.buffer.unshift(...records); // 访问 buffer
      this.stats.errorCount++; // 访问 stats
      this.emit('error', error); // 调用 emit
      console.error('[AuditLogger] 写入失败:', error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  /**
   * 查询审计日志
   * @param {Object} query - 查询条件
   * @returns {Promise<Array>} 匹配的记录
   */
  async query(query = {}) { // 执行语句
    const { // 解构赋值
      startTime, // 执行语句
      endTime, // 执行语句
      eventType, // 执行语句
      level, // 执行语句
      limit = 1000, // 赋值 limit
    } = query; // 执行语句

    const results = []; // 定义常量 results
    const files = await this._getLogFiles(); // 定义常量 files

    for (const file of files) { // 循环 const file of files
      // 检查文件日期是否在范围内
      const fileDate = this._extractDateFromFilename(file); // 定义常量 fileDate
      if (startTime && fileDate < startTime) continue; // 条件判断 startTime && fileDate < startTime
      if (endTime && fileDate > endTime) continue; // 条件判断 endTime && fileDate > endTime

      try { // 尝试执行
        const content = await fs.promises.readFile(file, 'utf8'); // 定义常量 content
        const lines = content.trim().split('\n'); // 定义常量 lines

        for (const line of lines) { // 循环 const line of lines
          if (!line) continue; // 条件判断 !line

          let record; // 定义变量 record
          try { // 尝试执行
            record = JSON.parse(line); // 赋值 record
          } catch { // 执行语句
            continue; // 继续下一轮循环
          } // 结束代码块

          // 应用过滤条件
          if (eventType && record.eventType !== eventType) continue; // 条件判断 eventType && record.eventType !== eventType
          if (level && record.level !== level) continue; // 条件判断 level && record.level !== level
          if (startTime && new Date(record.timestamp) < new Date(startTime)) continue; // 条件判断 startTime && new Date(record.timestamp) < new...
          if (endTime && new Date(record.timestamp) > new Date(endTime)) continue; // 条件判断 endTime && new Date(record.timestamp) > new D...

          results.push(record); // 调用 results.push

          if (results.length >= limit) { // 条件判断 results.length >= limit
            return results; // 返回结果
          } // 结束代码块
        } // 结束代码块
      } catch (error) { // 执行语句
        console.error(`[AuditLogger] 读取文件失败 ${file}:`, error.message); // 控制台输出
      } // 结束代码块
    } // 结束代码块

    return results; // 返回结果
  } // 结束代码块

  /**
   * 验证日志完整性
   * @param {string} filePath - 日志文件路径
   * @returns {Promise<Object>} 验证结果
   */
  async verifyIntegrity(filePath) { // 执行语句
    const result = { // 定义常量 result
      valid: true, // 有效
      totalRecords: 0, // 总Records
      invalidRecords: [], // 无效Records
      chainBroken: false, // chainBroken
    }; // 结束代码块

    try { // 尝试执行
      const content = await fs.promises.readFile(filePath, 'utf8'); // 定义常量 content
      const lines = content.trim().split('\n'); // 定义常量 lines

      let prevHash = null; // 定义变量 prevHash

      for (let i = 0; i < lines.length; i++) { // 循环 let i = 0; i < lines.length; i++
        if (!lines[i]) continue; // 条件判断 !lines[i]

        let record; // 定义变量 record
        try { // 尝试执行
          record = JSON.parse(lines[i]); // 赋值 record
        } catch { // 执行语句
          result.invalidRecords.push({ line: i + 1, error: 'JSON parse error' }); // 调用 result.invalidRecords.push
          result.valid = false; // 赋值 result.valid
          continue; // 继续下一轮循环
        } // 结束代码块

        result.totalRecords++; // 执行语句

        // 验证哈希链
        if (prevHash !== null && record.prevHash !== prevHash) { // 条件判断 prevHash !== null && record.prevHash !== prev...
          result.chainBroken = true; // 赋值 result.chainBroken
          result.invalidRecords.push({ // 调用 result.invalidRecords.push
            line: i + 1, // line
            error: 'Chain broken - prevHash mismatch', // 错误
          }); // 结束代码块
          result.valid = false; // 赋值 result.valid
        } // 结束代码块

        // 验证记录哈希
        const expectedHash = this._computeHash({ ...record, hash: undefined }); // 定义常量 expectedHash
        if (record.hash !== expectedHash) { // 条件判断 record.hash !== expectedHash
          result.invalidRecords.push({ // 调用 result.invalidRecords.push
            line: i + 1, // line
            error: 'Hash mismatch - record may be tampered', // 错误
          }); // 结束代码块
          result.valid = false; // 赋值 result.valid
        } // 结束代码块

        prevHash = record.hash; // 赋值 prevHash
      } // 结束代码块
    } catch (error) { // 执行语句
      result.valid = false; // 赋值 result.valid
      result.error = error.message; // 赋值 result.error
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取统计信息
   */
  getStats() { // 调用 getStats
    return { // 返回结果
      ...this.stats, // 展开对象或数组
      bufferSize: this.buffer.length, // buffer大小
      currentFile: this.currentFile, // current文件
    }; // 结束代码块
  } // 结束代码块

  /**
   * 停止审计日志记录器
   */
  async stop() { // 执行语句
    // 停止定时器
    if (this.flushTimer) { // 条件判断 this.flushTimer
      clearInterval(this.flushTimer); // 调用 clearInterval
      this.flushTimer = null; // 设置 flushTimer
    } // 结束代码块

    if (this.retentionTimer) { // 条件判断 this.retentionTimer
      clearInterval(this.retentionTimer); // 调用 clearInterval
      this.retentionTimer = null; // 设置 retentionTimer
    } // 结束代码块

    // 刷新剩余日志
    await this.flush(); // 等待异步结果

    this.emit('stopped'); // 调用 emit
  } // 结束代码块

  // ============================================
  // 私有方法
  // ============================================

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
   * 生成记录 ID
   * @private
   */
  _generateId() { // 调用 _generateId
    return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`; // 返回结果
  } // 结束代码块

  /**
   * 计算记录哈希
   * @private
   */
  _computeHash(record) { // 调用 _computeHash
    const data = JSON.stringify({ // 定义常量 data
      id: record.id, // ID
      timestamp: record.timestamp, // 时间戳
      eventType: record.eventType, // 事件类型
      level: record.level, // 级别
      data: record.data, // 数据
      prevHash: record.prevHash, // prevHash
    }); // 结束代码块

    return crypto // 返回结果
      .createHmac('sha256', this.config.integrityKey) // 执行语句
      .update(data) // 执行语句
      .digest('hex'); // 执行语句
  } // 结束代码块

  /**
   * 脱敏处理
   * @private
   */
  _sanitize(data, depth = 0) { // 调用 _sanitize
    if (depth > 10) return '[MAX_DEPTH]'; // 条件判断 depth > 10
    if (data === null || data === undefined) return data; // 条件判断 data === null || data === undefined

    if (typeof data !== 'object') { // 条件判断 typeof data !== 'object'
      return data; // 返回结果
    } // 结束代码块

    if (Array.isArray(data)) { // 条件判断 Array.isArray(data)
      return data.map(item => this._sanitize(item, depth + 1)); // 返回结果
    } // 结束代码块

    const result = {}; // 定义常量 result
    for (const [key, value] of Object.entries(data)) { // 循环 const [key, value] of Object.entries(data)
      if (this.config.sensitiveFields.has(key.toLowerCase())) { // 条件判断 this.config.sensitiveFields.has(key.toLowerCa...
        result[key] = '***REDACTED***'; // 执行语句
      } else if (typeof value === 'object' && value !== null) { // 执行语句
        result[key] = this._sanitize(value, depth + 1); // 执行语句
      } else { // 执行语句
        result[key] = value; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取事件的默认级别
   * @private
   */
  _getDefaultLevel(eventType) { // 调用 _getDefaultLevel
    const criticalEvents = [ // 定义常量 criticalEvents
      AuditEventType.AUTH_FAILED, // 执行语句
      AuditEventType.RISK_LIMIT_HIT, // 执行语句
      AuditEventType.TRADING_DISABLED, // 执行语句
      AuditEventType.ERROR_CRITICAL, // 执行语句
      AuditEventType.WITHDRAWAL_REQUEST, // 执行语句
    ]; // 结束数组或索引

    const warningEvents = [ // 定义常量 warningEvents
      AuditEventType.IP_BLOCKED, // 执行语句
      AuditEventType.RATE_LIMITED, // 执行语句
      AuditEventType.ORDER_FAILED, // 执行语句
      AuditEventType.RISK_ALERT, // 执行语句
    ]; // 结束数组或索引

    if (criticalEvents.includes(eventType)) { // 条件判断 criticalEvents.includes(eventType)
      return AuditLevel.CRITICAL; // 返回结果
    } // 结束代码块
    if (warningEvents.includes(eventType)) { // 条件判断 warningEvents.includes(eventType)
      return AuditLevel.WARNING; // 返回结果
    } // 结束代码块
    return AuditLevel.INFO; // 返回结果
  } // 结束代码块

  /**
   * 控制台输出
   * @private
   */
  _consoleOutput(record) { // 调用 _consoleOutput
    const levelColors = { // 定义常量 levelColors
      info: '\x1b[36m',    // info
      warning: '\x1b[33m', // 警告
      critical: '\x1b[31m', // critical
    }; // 结束代码块
    const reset = '\x1b[0m'; // 定义常量 reset
    const color = levelColors[record.level] || ''; // 定义常量 color

    console.log( // 控制台输出
      `${color}[AUDIT]${reset} ${record.timestamp} [${record.level.toUpperCase()}] ${record.eventType}`, // 执行语句
      JSON.stringify(record.data) // 调用 JSON.stringify
    ); // 结束调用或参数
  } // 结束代码块

  /**
   * 写入记录到文件
   * @private
   */
  async _writeRecords(records) { // 执行语句
    const today = new Date().toISOString().slice(0, 10); // 定义常量 today

    // 检查是否需要新文件
    if (this.currentDate !== today || !this.currentFile) { // 条件判断 this.currentDate !== today || !this.currentFile
      this.currentDate = today; // 设置 currentDate
      this.currentFile = path.join( // 设置 currentFile
        this.config.logDir, // 访问 config
        `${this.config.filePrefix}-${today}.log` // 执行语句
      ); // 结束调用或参数
      this.currentFileSize = 0; // 设置 currentFileSize

      if (fs.existsSync(this.currentFile)) { // 条件判断 fs.existsSync(this.currentFile)
        const stats = await fs.promises.stat(this.currentFile); // 定义常量 stats
        this.currentFileSize = stats.size; // 设置 currentFileSize
      } // 结束代码块
    } // 结束代码块

    // 检查文件大小
    if (this.currentFileSize > this.config.maxFileSize) { // 条件判断 this.currentFileSize > this.config.maxFileSize
      const index = Math.floor(Date.now() / 1000); // 定义常量 index
      this.currentFile = path.join( // 设置 currentFile
        this.config.logDir, // 访问 config
        `${this.config.filePrefix}-${today}-${index}.log` // 执行语句
      ); // 结束调用或参数
      this.currentFileSize = 0; // 设置 currentFileSize
    } // 结束代码块

    // 格式化记录
    const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n'; // 定义函数 lines

    // 加密 (如果启用)
    let content = lines; // 定义变量 content
    if (this.config.enableEncryption && this.config.encryptionKey) { // 条件判断 this.config.enableEncryption && this.config.e...
      content = this._encrypt(lines); // 赋值 content
    } // 结束代码块

    // 写入文件
    await fs.promises.appendFile(this.currentFile, content); // 等待异步结果
    this.currentFileSize += Buffer.byteLength(content); // 访问 currentFileSize
  } // 结束代码块

  /**
   * 加密内容
   * @private
   */
  _encrypt(content) { // 调用 _encrypt
    const iv = crypto.randomBytes(16); // 定义常量 iv
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32); // 定义常量 key
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv); // 定义常量 cipher

    let encrypted = cipher.update(content, 'utf8', 'hex'); // 定义变量 encrypted
    encrypted += cipher.final('hex'); // 执行语句

    return iv.toString('hex') + ':' + encrypted + '\n'; // 返回结果
  } // 结束代码块

  /**
   * 解密内容
   * @private
   */
  _decrypt(content) { // 调用 _decrypt
    const [ivHex, encrypted] = content.split(':'); // 解构赋值
    const iv = Buffer.from(ivHex, 'hex'); // 定义常量 iv
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32); // 定义常量 key
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv); // 定义常量 decipher

    let decrypted = decipher.update(encrypted, 'hex', 'utf8'); // 定义变量 decrypted
    decrypted += decipher.final('utf8'); // 执行语句

    return decrypted; // 返回结果
  } // 结束代码块

  /**
   * 启动定时刷新
   * @private
   */
  _startFlushTimer() { // 调用 _startFlushTimer
    this.flushTimer = setInterval(() => { // 设置 flushTimer
      this.flush().catch(err => { // 调用 flush
        console.error('[AuditLogger] 定时刷新失败:', err.message); // 控制台输出
      }); // 结束代码块
    }, this.config.flushInterval); // 执行语句
  } // 结束代码块

  /**
   * 启动日志保留检查
   * @private
   */
  _startRetentionCheck() { // 调用 _startRetentionCheck
    // 每天检查一次
    this.retentionTimer = setInterval(() => { // 设置 retentionTimer
      this._cleanupOldLogs().catch(err => { // 调用 _cleanupOldLogs
        console.error('[AuditLogger] 清理旧日志失败:', err.message); // 控制台输出
      }); // 结束代码块
    }, 24 * 60 * 60 * 1000); // 执行语句

    // 启动时也执行一次
    this._cleanupOldLogs().catch(() => {}); // 调用 _cleanupOldLogs
  } // 结束代码块

  /**
   * 清理旧日志
   * @private
   */
  async _cleanupOldLogs() { // 执行语句
    const files = await this._getLogFiles(); // 定义常量 files
    const cutoffDate = new Date(); // 定义常量 cutoffDate
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxRetentionDays); // 调用 cutoffDate.setDate

    for (const file of files) { // 循环 const file of files
      const fileDate = this._extractDateFromFilename(file); // 定义常量 fileDate
      if (fileDate && fileDate < cutoffDate) { // 条件判断 fileDate && fileDate < cutoffDate
        try { // 尝试执行
          await fs.promises.unlink(file); // 等待异步结果
          console.log(`[AuditLogger] 已删除过期日志: ${file}`); // 控制台输出
        } catch (error) { // 执行语句
          console.error(`[AuditLogger] 删除失败 ${file}:`, error.message); // 控制台输出
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取日志文件列表
   * @private
   */
  async _getLogFiles() { // 执行语句
    const files = await fs.promises.readdir(this.config.logDir); // 定义常量 files
    return files // 返回结果
      .filter(f => f.startsWith(this.config.filePrefix) && f.endsWith('.log')) // 定义箭头函数
      .map(f => path.join(this.config.logDir, f)) // 定义箭头函数
      .sort(); // 执行语句
  } // 结束代码块

  /**
   * 从文件名提取日期
   * @private
   */
  _extractDateFromFilename(filename) { // 调用 _extractDateFromFilename
    const match = path.basename(filename).match(/(\d{4}-\d{2}-\d{2})/); // 定义常量 match
    return match ? new Date(match[1]) : null; // 返回结果
  } // 结束代码块
} // 结束代码块

export { // 导出命名成员
  AuditLogger, // 执行语句
  AuditEventType, // 执行语句
  AuditLevel, // 执行语句
}; // 结束代码块

export default AuditLogger; // 默认导出
