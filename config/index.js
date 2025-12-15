/**
 * 配置加载器
 * Configuration Loader
 *
 * 加载和合并配置，支持环境变量覆盖
 * Loads and merges configuration, supports environment variable overrides
 */

// 导入默认配置 / Import default configuration
import defaultConfig from './default.js';

// 导入辅助函数 / Import helper functions
import { deepMerge, get } from '../src/utils/helpers.js';

/**
 * 从环境变量获取值
 * Get value from environment variable
 * @param {string} key - 环境变量键 / Environment variable key
 * @param {any} defaultValue - 默认值 / Default value
 * @returns {any} 值 / Value
 */
function getEnv(key, defaultValue = undefined) {
  // 获取环境变量 / Get environment variable
  const value = process.env[key];

  // 如果不存在，返回默认值 / If not exists, return default
  if (value === undefined) {
    return defaultValue;
  }

  // 尝试解析 JSON / Try to parse JSON
  try {
    return JSON.parse(value);
  } catch {
    // 如果不是 JSON，返回原始字符串 / If not JSON, return raw string
    return value;
  }
}

/**
 * 从环境变量获取布尔值
 * Get boolean from environment variable
 * @param {string} key - 环境变量键 / Environment variable key
 * @param {boolean} defaultValue - 默认值 / Default value
 * @returns {boolean} 布尔值 / Boolean value
 */
function getEnvBool(key, defaultValue = false) {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * 从环境变量获取数字
 * Get number from environment variable
 * @param {string} key - 环境变量键 / Environment variable key
 * @param {number} defaultValue - 默认值 / Default value
 * @returns {number} 数字 / Number
 */
function getEnvNumber(key, defaultValue = 0) {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * 构建环境配置
 * Build environment configuration
 * @returns {Object} 环境配置 / Environment configuration
 */
function buildEnvConfig() {
  return {
    // 交易所配置 / Exchange configuration
    exchange: {
      default: getEnv('DEFAULT_EXCHANGE', 'binance'),
      binance: {
        apiKey: getEnv('BINANCE_API_KEY'),
        secret: getEnv('BINANCE_SECRET'),
        sandbox: getEnvBool('BINANCE_SANDBOX'),
      },
      okx: {
        apiKey: getEnv('OKX_API_KEY'),
        secret: getEnv('OKX_SECRET'),
        password: getEnv('OKX_PASSWORD'),
        sandbox: getEnvBool('OKX_SANDBOX'),
      },
    },

    // 风控配置 / Risk configuration
    risk: {
      maxPositionRatio: getEnvNumber('RISK_MAX_POSITION', 0.3),
      maxRiskPerTrade: getEnvNumber('RISK_PER_TRADE', 0.02),
      maxDailyLoss: getEnvNumber('RISK_DAILY_LOSS_LIMIT', 1000),
      maxDrawdown: getEnvNumber('RISK_MAX_DRAWDOWN', 0.2),
      maxLeverage: getEnvNumber('RISK_MAX_LEVERAGE', 3),
    },

    // 告警配置 / Alert configuration
    alert: {
      email: {
        enabled: !!getEnv('SMTP_HOST'),
        host: getEnv('SMTP_HOST'),
        port: getEnvNumber('SMTP_PORT', 587),
        user: getEnv('SMTP_USER'),
        pass: getEnv('SMTP_PASS'),
        to: getEnv('ALERT_EMAIL_TO'),
      },
      telegram: {
        enabled: !!getEnv('TELEGRAM_BOT_TOKEN'),
        botToken: getEnv('TELEGRAM_BOT_TOKEN'),
        chatId: getEnv('TELEGRAM_CHAT_ID'),
      },
      dingtalk: {
        enabled: !!getEnv('DINGTALK_WEBHOOK'),
        webhook: getEnv('DINGTALK_WEBHOOK'),
        secret: getEnv('DINGTALK_SECRET'),
      },
      webhook: {
        enabled: !!getEnv('ALERT_WEBHOOK_URL'),
        url: getEnv('ALERT_WEBHOOK_URL'),
      },
    },

    // 数据库配置 / Database configuration
    database: {
      type: getEnv('DB_TYPE', 'sqlite'),
      host: getEnv('DB_HOST'),
      port: getEnvNumber('DB_PORT'),
      name: getEnv('DB_NAME'),
      user: getEnv('DB_USER'),
      password: getEnv('DB_PASSWORD'),
      redis: {
        enabled: !!getEnv('REDIS_URL'),
        url: getEnv('REDIS_URL'),
      },
    },

    // 日志配置 / Logging configuration
    logging: {
      level: getEnv('LOG_LEVEL', 'info'),
      dir: getEnv('LOG_DIR', 'logs'),
    },

    // 服务端口配置 / Server port configuration
    server: {
      httpPort: getEnvNumber('HTTP_PORT', 3000),
      wsPort: getEnvNumber('WS_PORT', 3001),
      dashboardPort: getEnvNumber('DASHBOARD_PORT', 8080),
    },
  };
}

/**
 * 移除未定义的值
 * Remove undefined values
 * @param {Object} obj - 对象 / Object
 * @returns {Object} 清理后的对象 / Cleaned object
 */
function removeUndefined(obj) {
  const result = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      // 跳过 undefined / Skip undefined
      if (value === undefined) {
        continue;
      }

      // 递归处理对象 / Recursively process objects
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const cleaned = removeUndefined(value);
        // 只有非空对象才添加 / Only add non-empty objects
        if (Object.keys(cleaned).length > 0) {
          result[key] = cleaned;
        }
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * 加载配置
 * Load configuration
 * @param {Object} customConfig - 自定义配置 / Custom configuration
 * @returns {Object} 合并后的配置 / Merged configuration
 */
export function loadConfig(customConfig = {}) {
  // 构建环境配置 / Build environment configuration
  const envConfig = removeUndefined(buildEnvConfig());

  // 合并配置: 默认 -> 环境变量 -> 自定义
  // Merge config: default -> env -> custom
  let config = deepMerge(defaultConfig, envConfig);
  config = deepMerge(config, customConfig);

  return config;
}

/**
 * 获取配置值
 * Get configuration value
 * @param {string} path - 配置路径 / Configuration path
 * @param {any} defaultValue - 默认值 / Default value
 * @returns {any} 配置值 / Configuration value
 */
export function getConfig(path, defaultValue = undefined) {
  // 加载配置 / Load configuration
  const config = loadConfig();

  // 获取指定路径的值 / Get value at specified path
  return get(config, path, defaultValue);
}

// 导出配置对象 / Export configuration object
export const config = loadConfig();

// 默认导出 / Default export
export default config;
