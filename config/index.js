/**
 * 配置加载器
 * Configuration Loader
 *
 * 加载和合并配置，支持环境变量覆盖和加密密钥
 * Loads and merges configuration, supports environment variable overrides and encrypted keys
 */

// 导入默认配置 / Import default configuration
import defaultConfig from './default.js';

// 导入辅助函数 / Import helper functions
import { deepMerge, get } from '../src/utils/helpers.js';

// 导入加密工具 / Import encryption utilities
import {
  loadEncryptedKeys,
  hasEncryptedKeys,
  getMasterPassword,
  decryptValue,
  isEncrypted,
  ENCRYPTED_KEYS_FILE,
  MASTER_KEY_ENV,
} from '../src/utils/crypto.js';

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
 * 缓存的加密密钥 / Cached encrypted keys
 * @type {Object|null}
 */
let cachedEncryptedKeys = null;

/**
 * 是否已尝试加载加密密钥 / Whether attempted to load encrypted keys
 * @type {boolean}
 */
let encryptedKeysLoadAttempted = false;

/**
 * 加载加密的API密钥
 * Load encrypted API keys
 * @returns {Object|null} 解密后的密钥对象 / Decrypted keys object
 */
function loadEncryptedApiKeys() {
  // 只尝试加载一次 / Only attempt to load once
  if (encryptedKeysLoadAttempted) {
    return cachedEncryptedKeys;
  }

  encryptedKeysLoadAttempted = true;

  // 检查是否存在加密文件 / Check if encrypted file exists
  if (!hasEncryptedKeys()) {
    return null;
  }

  // 获取主密码 / Get master password
  const masterPassword = getMasterPassword();

  if (!masterPassword) {
    console.warn(
      `[Config] 发现加密密钥文件但未设置 ${MASTER_KEY_ENV} 环境变量 / ` +
      `Found encrypted keys file but ${MASTER_KEY_ENV} not set`
    );
    return null;
  }

  try {
    cachedEncryptedKeys = loadEncryptedKeys(masterPassword);
    console.log('[Config] ✓ 已加载加密的API密钥 / Encrypted API keys loaded');
    return cachedEncryptedKeys;
  } catch (error) {
    console.error(
      `[Config] ✗ 加密密钥解密失败 / Failed to decrypt keys: ${error.message}`
    );
    return null;
  }
}

/**
 * 从环境变量获取值（支持解密）
 * Get value from environment variable (with decryption support)
 * @param {string} key - 环境变量键 / Environment variable key
 * @param {any} defaultValue - 默认值 / Default value
 * @returns {any} 解密后的值 / Decrypted value
 */
function getEnvDecrypted(key, defaultValue = undefined) {
  const value = process.env[key];

  if (value === undefined) {
    return defaultValue;
  }

  // 检查是否是加密值 / Check if encrypted value
  if (isEncrypted(value)) {
    const masterPassword = getMasterPassword();
    if (!masterPassword) {
      console.warn(
        `[Config] 环境变量 ${key} 已加密但未设置 ${MASTER_KEY_ENV} / ` +
        `Env ${key} is encrypted but ${MASTER_KEY_ENV} not set`
      );
      return defaultValue;
    }

    try {
      return decryptValue(value, masterPassword);
    } catch (error) {
      console.error(
        `[Config] 解密环境变量 ${key} 失败 / Failed to decrypt ${key}: ${error.message}`
      );
      return defaultValue;
    }
  }

  // 非加密值，尝试解析JSON / Non-encrypted, try to parse JSON
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * 获取交易所API密钥（优先使用加密存储）
 * Get exchange API key (prefer encrypted storage)
 * @param {string} exchange - 交易所名称 / Exchange name
 * @param {string} keyName - 密钥名称 / Key name
 * @param {string} envKey - 环境变量名 / Environment variable name
 * @returns {string|undefined} API密钥 / API key
 */
function getExchangeKey(exchange, keyName, envKey) {
  // 优先使用加密存储的密钥 / Prefer encrypted stored keys
  const encryptedKeys = loadEncryptedApiKeys();

  if (encryptedKeys && encryptedKeys[exchange] && encryptedKeys[exchange][keyName]) {
    return encryptedKeys[exchange][keyName];
  }

  // 回退到环境变量（支持加密值）/ Fallback to env (with decryption)
  return getEnvDecrypted(envKey);
}

/**
 * 解析 COMBO_STRATEGIES 环境变量为策略权重对象
 * Parse COMBO_STRATEGIES env var to strategy weights object
 * @param {string} comboStr - 逗号分隔的策略列表 / Comma-separated strategy list
 * @returns {Object|undefined} 策略权重对象 / Strategy weights object
 */
function parseComboStrategies(comboStr) {
  if (!comboStr) {
    return undefined;
  }

  // 解析策略列表 / Parse strategy list
  const strategies = comboStr.split(',').map(s => s.trim()).filter(s => s);

  if (strategies.length === 0) {
    return undefined;
  }

  // 计算平均权重 / Calculate average weight
  const weight = 1 / strategies.length;

  // 构建权重对象 / Build weights object
  const weights = {};
  for (const strategy of strategies) {
    weights[strategy] = weight;
  }

  console.log(`[Config] 解析 COMBO_STRATEGIES: ${comboStr} -> ${JSON.stringify(weights)}`);
  return weights;
}

/**
 * 构建环境配置
 * Build environment configuration
 * @returns {Object} 环境配置 / Environment configuration
 */
function buildEnvConfig() {
  // 解析策略权重 / Parse strategy weights
  const comboStrategies = getEnv('COMBO_STRATEGIES');
  const strategyWeights = parseComboStrategies(comboStrategies);

  return {
    // 策略配置 / Strategy configuration
    strategy: {
      // WeightedCombo 策略配置 / WeightedCombo strategy config
      // 注意: 键名必须与策略类名匹配 (大小写敏感)
      // Note: Key name must match strategy class name (case sensitive)
      WeightedCombo: strategyWeights ? {
        // 策略权重 / Strategy weights
        strategyWeights,
        // 默认时间周期 / Default timeframe
        defaultTimeframe: getEnv('DEFAULT_TIMEFRAME'),
        // 买入阈值 / Buy threshold
        buyThreshold: getEnvNumber('BUY_THRESHOLD'),
        // 卖出阈值 / Sell threshold
        sellThreshold: getEnvNumber('SELL_THRESHOLD'),
        // 最大持仓数 / Max positions
        maxPositions: getEnvNumber('MAX_POSITIONS'),
        // 是否使用追踪止损 / Use trailing stop
        useTrailingStop: getEnvBool('USE_TRAILING_STOP'),
        // 追踪止损百分比 / Trailing stop percent
        trailingStopPercent: getEnvNumber('TRAILING_STOP_PERCENT'),
        // 止损百分比 / Stop loss percent
        stopLossPercent: getEnvNumber('STOP_LOSS_PERCENT'),
        // 止盈百分比 / Take profit percent
        takeProfitPercent: getEnvNumber('TAKE_PROFIT_PERCENT'),
      } : undefined,
    },

    // 交易所配置 / Exchange configuration
    exchange: {
      default: getEnv('DEFAULT_EXCHANGE', 'binance'),
      binance: {
        apiKey: getExchangeKey('binance', 'apiKey', 'BINANCE_API_KEY'),
        secret: getExchangeKey('binance', 'secret', 'BINANCE_SECRET') ||
                getExchangeKey('binance', 'secret', 'BINANCE_API_SECRET'),
        sandbox: getEnvBool('BINANCE_SANDBOX') || getEnvBool('BINANCE_TESTNET'),
      },
      okx: {
        apiKey: getExchangeKey('okx', 'apiKey', 'OKX_API_KEY'),
        secret: getExchangeKey('okx', 'secret', 'OKX_SECRET') ||
                getExchangeKey('okx', 'secret', 'OKX_API_SECRET'),
        password: getExchangeKey('okx', 'passphrase', 'OKX_PASSWORD') ||
                  getExchangeKey('okx', 'passphrase', 'OKX_PASSPHRASE'),
        sandbox: getEnvBool('OKX_SANDBOX'),
      },
      bybit: {
        apiKey: getExchangeKey('bybit', 'apiKey', 'BYBIT_API_KEY'),
        secret: getExchangeKey('bybit', 'secret', 'BYBIT_SECRET') ||
                getExchangeKey('bybit', 'secret', 'BYBIT_API_SECRET'),
        sandbox: getEnvBool('BYBIT_SANDBOX') || getEnvBool('BYBIT_TESTNET'),
      },
      gate: {
        apiKey: getExchangeKey('gate', 'apiKey', 'GATE_API_KEY'),
        secret: getExchangeKey('gate', 'secret', 'GATE_SECRET') ||
                getExchangeKey('gate', 'secret', 'GATE_API_SECRET'),
        sandbox: getEnvBool('GATE_SANDBOX') || getEnvBool('GATE_TESTNET'),
      },
      deribit: {
        apiKey: getExchangeKey('deribit', 'apiKey', 'DERIBIT_API_KEY'),
        secret: getExchangeKey('deribit', 'secret', 'DERIBIT_SECRET') ||
                getExchangeKey('deribit', 'secret', 'DERIBIT_API_SECRET'),
        sandbox: getEnvBool('DERIBIT_SANDBOX') || getEnvBool('DERIBIT_TESTNET'),
      },
      bitget: {
        apiKey: getExchangeKey('bitget', 'apiKey', 'BITGET_API_KEY'),
        secret: getExchangeKey('bitget', 'secret', 'BITGET_SECRET') ||
                getExchangeKey('bitget', 'secret', 'BITGET_API_SECRET'),
        password: getExchangeKey('bitget', 'passphrase', 'BITGET_PASSWORD') ||
                  getExchangeKey('bitget', 'passphrase', 'BITGET_PASSPHRASE'),
        sandbox: getEnvBool('BITGET_SANDBOX') || getEnvBool('BITGET_TESTNET'),
      },
      kucoin: {
        apiKey: getExchangeKey('kucoin', 'apiKey', 'KUCOIN_API_KEY'),
        secret: getExchangeKey('kucoin', 'secret', 'KUCOIN_SECRET') ||
                getExchangeKey('kucoin', 'secret', 'KUCOIN_API_SECRET'),
        password: getExchangeKey('kucoin', 'passphrase', 'KUCOIN_PASSWORD') ||
                  getExchangeKey('kucoin', 'passphrase', 'KUCOIN_PASSPHRASE'),
        sandbox: getEnvBool('KUCOIN_SANDBOX') || getEnvBool('KUCOIN_TESTNET'),
      },
      kraken: {
        apiKey: getExchangeKey('kraken', 'apiKey', 'KRAKEN_API_KEY'),
        secret: getExchangeKey('kraken', 'secret', 'KRAKEN_SECRET') ||
                getExchangeKey('kraken', 'secret', 'KRAKEN_API_SECRET'),
        sandbox: getEnvBool('KRAKEN_SANDBOX') || getEnvBool('KRAKEN_TESTNET'),
        defaultType: getEnv('KRAKEN_DEFAULT_TYPE', 'spot'),
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
        user: getEnvDecrypted('SMTP_USER'),
        pass: getEnvDecrypted('SMTP_PASS'),
        to: getEnv('ALERT_EMAIL_TO'),
      },
      telegram: {
        enabled: getEnvBool('TELEGRAM_ENABLED', false),
        botToken: getEnvDecrypted('TELEGRAM_BOT_TOKEN'),
        chatId: getEnvDecrypted('TELEGRAM_CHAT_ID'),
      },
      dingtalk: {
        enabled: !!getEnv('DINGTALK_WEBHOOK'),
        webhook: getEnvDecrypted('DINGTALK_WEBHOOK'),
        secret: getEnvDecrypted('DINGTALK_SECRET'),
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
      user: getEnvDecrypted('DB_USER'),
      password: getEnvDecrypted('DB_PASSWORD'),
      redis: {
        enabled: !!getEnv('REDIS_URL'),
        url: getEnvDecrypted('REDIS_URL'),
        password: getEnvDecrypted('REDIS_PASSWORD'),
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
      metricsPort: getEnvNumber('METRICS_PORT', 9090),
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
