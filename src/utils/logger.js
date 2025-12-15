/**
 * 日志工具
 * Logger Utility
 *
 * 统一的日志管理器，支持多种输出格式和目标
 * Unified logger with support for multiple output formats and targets
 */

// 导入 Winston 日志库 / Import Winston logging library
import winston from 'winston';

// 导入路径模块 / Import path module
import path from 'path';

// 导入文件系统模块 / Import file system module
import fs from 'fs';

// 日志目录 / Log directory
const LOG_DIR = process.env.LOG_DIR || 'logs';

// 确保日志目录存在 / Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

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

  // 自定义输出格式 / Custom output format
  winston.format.printf(({ level, message, timestamp, stack, ...metadata }) => {
    // 构建基础日志信息 / Build base log info
    let log = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // 如果有元数据，添加到日志 / If metadata exists, add to log
    if (Object.keys(metadata).length > 0) {
      log += ` ${JSON.stringify(metadata)}`;
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

  // 自定义输出格式 / Custom output format
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    // 构建日志信息 / Build log info
    let log = `[${timestamp}] ${level}: ${message}`;

    // 如果有重要元数据，添加到日志 / If important metadata exists, add to log
    const metaKeys = Object.keys(metadata);
    if (metaKeys.length > 0 && metaKeys.some(k => !['stack'].includes(k))) {
      const filteredMeta = {};
      for (const key of metaKeys) {
        if (key !== 'stack') {
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
