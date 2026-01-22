/**
 * 日志工具
 * Logger Utility
 *
 * 统一的日志管理器，支持多种输出格式和目标
 * Unified logger with support for multiple output formats and targets
 *
 * 支持请求上下文追踪，自动附加 requestId、traceId 等信息
 * Supports request context tracing with automatic requestId, traceId attachment
 */

// 导入 Winston 日志库 / Import Winston logging library
import winston from 'winston'; // 导入模块 winston

// 导入路径模块 / Import path module
import path from 'path'; // 导入模块 path

// 导入文件系统模块 / Import file system module
import fs from 'fs'; // 导入模块 fs

// 导入异步本地存储 / Import async local storage
import { AsyncLocalStorage } from 'async_hooks'; // 导入模块 async_hooks

// 请求上下文存储（延迟初始化，避免循环依赖）
// Request context storage (lazy init to avoid circular deps)
let getContextFn = null; // 定义变量 getContextFn

/**
 * 设置上下文获取函数（由 requestTracing 模块调用）
 * Set context getter function (called by requestTracing module)
 */
export function setContextGetter(fn) { // 导出函数 setContextGetter
  getContextFn = fn; // 赋值 getContextFn
} // 结束代码块

/**
 * 获取当前请求上下文
 * Get current request context
 */
function getCurrentContext() { // 定义函数 getCurrentContext
  if (getContextFn) { // 条件判断 getContextFn
    return getContextFn(); // 返回结果
  } // 结束代码块
  return null; // 返回结果
} // 结束代码块

// 日志目录 / Log directory
const LOG_DIR = process.env.LOG_DIR || 'logs'; // 定义常量 LOG_DIR

// 确保日志目录存在 / Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) { // 条件判断 !fs.existsSync(LOG_DIR)
  fs.mkdirSync(LOG_DIR, { recursive: true }); // 调用 fs.mkdirSync
} // 结束代码块

/**
 * 上下文注入格式
 * Context injection format
 */
const contextFormat = winston.format((info) => { // 定义函数 contextFormat
  const context = getCurrentContext(); // 定义常量 context
  if (context) { // 条件判断 context
    info.requestId = context.requestId; // 赋值 info.requestId
    info.traceId = context.traceId; // 赋值 info.traceId
    if (context.userId) { // 条件判断 context.userId
      info.userId = context.userId; // 赋值 info.userId
    } // 结束代码块
  } // 结束代码块
  return info; // 返回结果
}); // 结束代码块

/**
 * 自定义日志格式
 * Custom log format
 */
const customFormat = winston.format.combine( // 定义常量 customFormat
  // 添加时间戳 / Add timestamp
  winston.format.timestamp({ // 调用 winston.format.timestamp
    format: 'YYYY-MM-DD HH:mm:ss.SSS', // 格式
  }), // 结束代码块

  // 添加错误堆栈 / Add error stack
  winston.format.errors({ stack: true }), // 调用 winston.format.errors

  // 注入请求上下文 / Inject request context
  contextFormat(), // 调用 contextFormat

  // 自定义输出格式 / Custom output format
  winston.format.printf(({ level, message, timestamp, stack, requestId, traceId, userId, ...metadata }) => { // 调用 winston.format.printf
    // 构建基础日志信息 / Build base log info
    let log = `[${timestamp}] [${level.toUpperCase()}]`; // 定义变量 log

    // 添加请求 ID / Add request ID
    if (requestId) { // 条件判断 requestId
      log += ` [${requestId}]`; // 执行语句
    } // 结束代码块

    log += ` ${message}`; // 执行语句

    // 构建元数据对象 / Build metadata object
    const metaObj = { ...metadata }; // 定义常量 metaObj
    if (traceId && traceId !== requestId) { // 条件判断 traceId && traceId !== requestId
      metaObj.traceId = traceId; // 赋值 metaObj.traceId
    } // 结束代码块
    if (userId) { // 条件判断 userId
      metaObj.userId = userId; // 赋值 metaObj.userId
    } // 结束代码块

    // 如果有元数据，添加到日志 / If metadata exists, add to log
    if (Object.keys(metaObj).length > 0) { // 条件判断 Object.keys(metaObj).length > 0
      log += ` ${JSON.stringify(metaObj)}`; // 执行语句
    } // 结束代码块

    // 如果有错误堆栈，添加到日志 / If error stack exists, add to log
    if (stack) { // 条件判断 stack
      log += `\n${stack}`; // 执行语句
    } // 结束代码块

    return log; // 返回结果
  }) // 结束代码块
); // 结束调用或参数

/**
 * 控制台格式 (带颜色)
 * Console format (with colors)
 */
const consoleFormat = winston.format.combine( // 定义常量 consoleFormat
  // 添加颜色 / Add colors
  winston.format.colorize({ all: true }), // 调用 winston.format.colorize

  // 添加时间戳 / Add timestamp
  winston.format.timestamp({ // 调用 winston.format.timestamp
    format: 'HH:mm:ss.SSS', // 格式
  }), // 结束代码块

  // 注入请求上下文 / Inject request context
  contextFormat(), // 调用 contextFormat

  // 自定义输出格式 / Custom output format
  winston.format.printf(({ level, message, timestamp, requestId, ...metadata }) => { // 调用 winston.format.printf
    // 构建日志信息 / Build log info
    let log = `[${timestamp}]`; // 定义变量 log

    // 添加请求 ID (简短版本) / Add request ID (short version)
    if (requestId) { // 条件判断 requestId
      // 只显示请求 ID 的后 8 位
      const shortId = requestId.length > 12 ? requestId.slice(-8) : requestId; // 定义常量 shortId
      log += ` [${shortId}]`; // 执行语句
    } // 结束代码块

    log += ` ${level}: ${message}`; // 执行语句

    // 如果有重要元数据，添加到日志 / If important metadata exists, add to log
    const metaKeys = Object.keys(metadata); // 定义常量 metaKeys
    if (metaKeys.length > 0 && metaKeys.some(k => !['stack', 'traceId', 'userId', 'service'].includes(k))) { // 条件判断 metaKeys.length > 0 && metaKeys.some(k => !['...
      const filteredMeta = {}; // 定义常量 filteredMeta
      for (const key of metaKeys) { // 循环 const key of metaKeys
        if (!['stack', 'traceId', 'userId', 'service'].includes(key)) { // 条件判断 !['stack', 'traceId', 'userId', 'service'].in...
          filteredMeta[key] = metadata[key]; // 执行语句
        } // 结束代码块
      } // 结束代码块
      if (Object.keys(filteredMeta).length > 0) { // 条件判断 Object.keys(filteredMeta).length > 0
        log += ` ${JSON.stringify(filteredMeta)}`; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return log; // 返回结果
  }) // 结束代码块
); // 结束调用或参数

/**
 * 创建日志记录器
 * Create logger instance
 * @param {string} name - 日志记录器名称 / Logger name
 * @param {Object} options - 配置选项 / Configuration options
 * @returns {winston.Logger} 日志记录器 / Logger instance
 */
export function createLogger(name, options = {}) { // 导出函数 createLogger
  // 默认配置 / Default configuration
  const config = { // 定义常量 config
    // 日志级别 / Log level
    level: options.level || process.env.LOG_LEVEL || 'info', // 级别

    // 是否输出到控制台 / Whether to output to console
    console: options.console !== false, // 是否输出到控制台

    // 是否输出到文件 / Whether to output to file
    file: options.file !== false, // 文件

    // 日志文件前缀 / Log file prefix
    filePrefix: options.filePrefix || name || 'app', // 文件前缀
  }; // 结束代码块

  // 传输器列表 / Transports list
  const transports = []; // 定义常量 transports

  // 添加控制台传输器 / Add console transport
  if (config.console) { // 条件判断 config.console
    transports.push( // 调用 transports.push
      new winston.transports.Console({ // 创建 winston 实例
        format: consoleFormat, // 格式
      }) // 结束代码块
    ); // 结束调用或参数
  } // 结束代码块

  // 添加文件传输器 / Add file transports
  if (config.file) { // 条件判断 config.file
    // 普通日志文件 / Normal log file
    transports.push( // 调用 transports.push
      new winston.transports.File({ // 创建 winston 实例
        filename: path.join(LOG_DIR, `${config.filePrefix}.log`), // filename
        format: customFormat, // 格式
        maxsize: 10 * 1024 * 1024,  // maxsize
        maxFiles: 5, // 最大文件
        tailable: true, // tailable
      }) // 结束代码块
    ); // 结束调用或参数

    // 错误日志文件 / Error log file
    transports.push( // 调用 transports.push
      new winston.transports.File({ // 创建 winston 实例
        filename: path.join(LOG_DIR, `${config.filePrefix}-error.log`), // filename
        format: customFormat, // 格式
        level: 'error', // 级别
        maxsize: 10 * 1024 * 1024,  // maxsize
        maxFiles: 5, // 最大文件
        tailable: true, // tailable
      }) // 结束代码块
    ); // 结束调用或参数
  } // 结束代码块

  // 创建日志记录器 / Create logger
  const logger = winston.createLogger({ // 定义常量 logger
    level: config.level, // 级别
    defaultMeta: { service: name }, // 默认Meta
    transports, // 执行语句
  }); // 结束代码块

  return logger; // 返回结果
} // 结束代码块

/**
 * 默认日志记录器
 * Default logger instance
 */
export const logger = createLogger('quant-trading'); // 导出常量 logger

/**
 * 交易日志记录器
 * Trading logger instance
 */
export const tradingLogger = createLogger('trading', { // 导出常量 tradingLogger
  filePrefix: 'trading', // 文件前缀
}); // 结束代码块

/**
 * 策略日志记录器
 * Strategy logger instance
 */
export const strategyLogger = createLogger('strategy', { // 导出常量 strategyLogger
  filePrefix: 'strategy', // 文件前缀
}); // 结束代码块

/**
 * 风控日志记录器
 * Risk logger instance
 */
export const riskLogger = createLogger('risk', { // 导出常量 riskLogger
  filePrefix: 'risk', // 文件前缀
}); // 结束代码块

/**
 * 性能日志记录器
 * Performance logger instance
 */
export const perfLogger = createLogger('performance', { // 导出常量 perfLogger
  filePrefix: 'performance', // 文件前缀
  level: 'debug', // 级别
}); // 结束代码块

// 默认导出 / Default export
export default logger; // 默认导出
