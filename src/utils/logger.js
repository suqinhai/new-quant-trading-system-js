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
import winston from 'winston';

// 导入路径模块 / Import path module
import path from 'path';

// 导入文件系统模块 / Import file system module
import fs from 'fs';

// 导入异步本地存储 / Import async local storage
import { AsyncLocalStorage } from 'async_hooks';

// 请求上下文存储（延迟初始化，避免循环依赖）
// Request context storage (lazy init to avoid circular deps)
let getContextFn = null;

/**
 * 设置上下文获取函数（由 requestTracing 模块调用）
 * Set context getter function (called by requestTracing module)
 */
export function setContextGetter(fn) {
  getContextFn = fn;
}

/**
 * 获取当前请求上下文
 * Get current request context
 */
function getCurrentContext() {
  if (getContextFn) {
    return getContextFn();
  }
  return null;
}

// 日志目录 / Log directory
const LOG_DIR = process.env.LOG_DIR || 'logs';

// 确保日志目录存在 / Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * 上下文注入格式
 * Context injection format
 */
const contextFormat = winston.format((info) => {
  const context = getCurrentContext();
  if (context) {
    info.requestId = context.requestId;
    info.traceId = context.traceId;
    if (context.userId) {
      info.userId = context.userId;
    }
  }
  return info;
});

/**
 * 自定义日志格式
 * Custom log format
 */
const customFormat = winston.format.combine(
  // 添加时间戳 / Add timestamp
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),

  // 添加错误堆栈 / Add error stack
  winston.format.errors({ stack: true }),

  // 注入请求上下文 / Inject request context
  contextFormat(),

  // 自定义输出格式 / Custom output format
  winston.format.printf(({ level, message, timestamp, stack, requestId, traceId, userId, ...metadata }) => {
    // 构建基础日志信息 / Build base log info
    let log = `[${timestamp}] [${level.toUpperCase()}]`;

    // 添加请求 ID / Add request ID
    if (requestId) {
      log += ` [${requestId}]`;
    }

    log += ` ${message}`;

    // 构建元数据对象 / Build metadata object
    const metaObj = { ...metadata };
    if (traceId && traceId !== requestId) {
      metaObj.traceId = traceId;
    }
    if (userId) {
      metaObj.userId = userId;
    }

    // 如果有元数据，添加到日志 / If metadata exists, add to log
    if (Object.keys(metaObj).length > 0) {
      log += ` ${JSON.stringify(metaObj)}`;
    }

    // 如果有错误堆栈，添加到日志 / If error stack exists, add to log
    if (stack) {
      log += `\n${stack}`;
    }

    return log;
  })
);

/**
 * 控制台格式 (带颜色)
 * Console format (with colors)
 */
const consoleFormat = winston.format.combine(
  // 添加颜色 / Add colors
  winston.format.colorize({ all: true }),

  // 添加时间戳 / Add timestamp
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS',
  }),

  // 注入请求上下文 / Inject request context
  contextFormat(),

  // 自定义输出格式 / Custom output format
  winston.format.printf(({ level, message, timestamp, requestId, ...metadata }) => {
    // 构建日志信息 / Build log info
    let log = `[${timestamp}]`;

    // 添加请求 ID (简短版本) / Add request ID (short version)
    if (requestId) {
      // 只显示请求 ID 的后 8 位
      const shortId = requestId.length > 12 ? requestId.slice(-8) : requestId;
      log += ` [${shortId}]`;
    }

    log += ` ${level}: ${message}`;

    // 如果有重要元数据，添加到日志 / If important metadata exists, add to log
    const metaKeys = Object.keys(metadata);
    if (metaKeys.length > 0 && metaKeys.some(k => !['stack', 'traceId', 'userId', 'service'].includes(k))) {
      const filteredMeta = {};
      for (const key of metaKeys) {
        if (!['stack', 'traceId', 'userId', 'service'].includes(key)) {
          filteredMeta[key] = metadata[key];
        }
      }
      if (Object.keys(filteredMeta).length > 0) {
        log += ` ${JSON.stringify(filteredMeta)}`;
      }
    }

    return log;
  })
);

/**
 * 创建日志记录器
 * Create logger instance
 * @param {string} name - 日志记录器名称 / Logger name
 * @param {Object} options - 配置选项 / Configuration options
 * @returns {winston.Logger} 日志记录器 / Logger instance
 */
export function createLogger(name, options = {}) {
  // 默认配置 / Default configuration
  const config = {
    // 日志级别 / Log level
    level: options.level || process.env.LOG_LEVEL || 'info',

    // 是否输出到控制台 / Whether to output to console
    console: options.console !== false,

    // 是否输出到文件 / Whether to output to file
    file: options.file !== false,

    // 日志文件前缀 / Log file prefix
    filePrefix: options.filePrefix || name || 'app',
  };

  // 传输器列表 / Transports list
  const transports = [];

  // 添加控制台传输器 / Add console transport
  if (config.console) {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
      })
    );
  }

  // 添加文件传输器 / Add file transports
  if (config.file) {
    // 普通日志文件 / Normal log file
    transports.push(
      new winston.transports.File({
        filename: path.join(LOG_DIR, `${config.filePrefix}.log`),
        format: customFormat,
        maxsize: 10 * 1024 * 1024,  // 10MB
        maxFiles: 5,
        tailable: true,
      })
    );

    // 错误日志文件 / Error log file
    transports.push(
      new winston.transports.File({
        filename: path.join(LOG_DIR, `${config.filePrefix}-error.log`),
        format: customFormat,
        level: 'error',
        maxsize: 10 * 1024 * 1024,  // 10MB
        maxFiles: 5,
        tailable: true,
      })
    );
  }

  // 创建日志记录器 / Create logger
  const logger = winston.createLogger({
    level: config.level,
    defaultMeta: { service: name },
    transports,
  });

  return logger;
}

/**
 * 默认日志记录器
 * Default logger instance
 */
export const logger = createLogger('quant-trading');

/**
 * 交易日志记录器
 * Trading logger instance
 */
export const tradingLogger = createLogger('trading', {
  filePrefix: 'trading',
});

/**
 * 策略日志记录器
 * Strategy logger instance
 */
export const strategyLogger = createLogger('strategy', {
  filePrefix: 'strategy',
});

/**
 * 风控日志记录器
 * Risk logger instance
 */
export const riskLogger = createLogger('risk', {
  filePrefix: 'risk',
});

/**
 * 性能日志记录器
 * Performance logger instance
 */
export const perfLogger = createLogger('performance', {
  filePrefix: 'performance',
  level: 'debug',
});

// 默认导出 / Default export
export default logger;
