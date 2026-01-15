/**
 * 配置管理器
 * Configuration Manager
 *
 * 提供集中式配置管理，支持验证和热重载
 * Provides centralized config management with validation and hot reload
 *
 * @module src/config/ConfigManager
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

/**
 * 配置源类型
 */
const ConfigSource = {
  DEFAULT: 'default',
  FILE: 'file',
  ENV: 'env',
  RUNTIME: 'runtime',
};

/**
 * 配置管理器类
 * Configuration Manager Class
 */
class ConfigManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      // 配置文件路径
      configPath: options.configPath || './config',
      // 环境变量前缀
      envPrefix: options.envPrefix || 'QUANT_',
      // 是否监听文件变化
      watchFiles: options.watchFiles ?? false,
      // 是否冻结配置
      freeze: options.freeze ?? false,
      // 是否允许运行时修改
      allowRuntimeChanges: options.allowRuntimeChanges ?? true,
    };

    // 配置存储
    this.config = {};

    // 配置元数据
    this.metadata = new Map();

    // Schema 注册表
    this.schemas = new Map();

    // 文件监听器
    this.watchers = new Map();

    // 加载默认 Schema
    this._registerDefaultSchemas();
  }

  /**
   * 注册默认 Schema
   * @private
   */
  _registerDefaultSchemas() {
    // 交易所配置 Schema
    this.registerSchema('exchange', z.object({
      default: z.string().default('binance'),
      binance: z.object({
        apiKey: z.string().optional(),
        secret: z.string().optional(),
        sandbox: z.boolean().default(false),
        timeout: z.number().positive().default(30000),
        rateLimit: z.boolean().default(true),
      }).optional(),
      okx: z.object({
        apiKey: z.string().optional(),
        secret: z.string().optional(),
        passphrase: z.string().optional(),
        sandbox: z.boolean().default(false),
      }).optional(),
    }));

    // 风控配置 Schema
    this.registerSchema('risk', z.object({
      enabled: z.boolean().default(true),
      maxPositionRatio: z.number().min(0).max(1).default(0.3),
      maxRiskPerTrade: z.number().min(0).max(1).default(0.02),
      maxDailyLoss: z.number().positive().default(1000),
      maxDrawdown: z.number().min(0).max(1).default(0.2),
      maxPositions: z.number().int().positive().default(5),
      maxLeverage: z.number().positive().default(3),
      cooldownPeriod: z.number().nonnegative().default(300000),
    }));

    // 策略配置 Schema
    this.registerSchema('strategy', z.object({
      enabled: z.boolean().default(true),
      defaultTimeframe: z.string().default('1h'),
      capitalRatio: z.number().min(0).max(1).default(0.1),
    }));

    // 日志配置 Schema
    this.registerSchema('logging', z.object({
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
      format: z.enum(['json', 'text']).default('json'),
      destination: z.enum(['console', 'file', 'both']).default('both'),
      maxFiles: z.number().positive().default(10),
      maxFileSize: z.number().positive().default(10485760),
    }));

    // 数据库配置 Schema
    this.registerSchema('database', z.object({
      redis: z.object({
        enabled: z.boolean().default(false),
        host: z.string().optional(),
        port: z.number().optional(),
        password: z.string().optional(),
        db: z.number().optional(),
        url: z.string().optional(),
      }).optional(),
    }));

    // 备份配置 Schema
    this.registerSchema('backup', z.object({
      enabled: z.boolean().default(true),
      dir: z.string().default('./backups'),
      retentionDays: z.number().positive().default(30),
      compress: z.boolean().default(true),
      encrypt: z.boolean().default(false),
    }));

    // 健康检查配置 Schema
    this.registerSchema('health', z.object({
      enabled: z.boolean().default(true),
      port: z.number().int().positive().default(8080),
      path: z.string().default('/health'),
      interval: z.number().positive().default(30000),
    }));
  }

  /**
   * 注册配置 Schema
   * @param {string} section - 配置节名称
   * @param {z.ZodSchema} schema - Zod Schema
   */
  registerSchema(section, schema) {
    this.schemas.set(section, schema);
  }

  /**
   * 加载配置
   * @param {string} environment - 环境名称
   */
  async load(environment = process.env.NODE_ENV || 'development') {
    // 1. 加载默认配置
    const defaultConfig = this._loadDefaults();

    // 2. 加载文件配置
    const fileConfig = await this._loadFromFiles(environment);

    // 3. 加载环境变量
    const envConfig = this._loadFromEnv();

    // 4. 合并配置
    this.config = this._deepMerge(defaultConfig, fileConfig, envConfig);

    // 5. 验证配置
    this._validateAll();

    // 6. 冻结配置
    if (this.options.freeze) {
      this._freezeConfig();
    }

    // 7. 启动文件监听
    if (this.options.watchFiles) {
      this._startWatching();
    }

    this.emit('loaded', { environment, config: this.getAll() });

    return this.config;
  }

  /**
   * 加载默认配置
   * @private
   */
  _loadDefaults() {
    const defaults = {};

    for (const [section, schema] of this.schemas) {
      try {
        // 使用 Schema 的默认值
        defaults[section] = schema.parse({});
      } catch {
        defaults[section] = {};
      }
    }

    return defaults;
  }

  /**
   * 从文件加载配置
   * @private
   */
  async _loadFromFiles(environment) {
    const config = {};
    const configDir = this.options.configPath;

    if (!fs.existsSync(configDir)) {
      return config;
    }

    // 加载顺序：default.json -> {env}.json
    const files = [
      'default.json',
      `${environment}.json`,
    ];

    for (const file of files) {
      const filePath = path.join(configDir, file);

      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(content);
          Object.assign(config, this._deepMerge(config, parsed));

          this.metadata.set(filePath, {
            source: ConfigSource.FILE,
            loadedAt: Date.now(),
          });
        } catch (error) {
          console.error(`[ConfigManager] Failed to load ${file}:`, error.message);
        }
      }
    }

    return config;
  }

  /**
   * 从环境变量加载配置
   * @private
   */
  _loadFromEnv() {
    const config = {};
    const prefix = this.options.envPrefix;

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        // 转换 QUANT_RISK_MAX_POSITIONS -> risk.maxPositions
        const configPath = key
          .slice(prefix.length)
          .toLowerCase()
          .split('_')
          .reduce((acc, part, idx) => {
            if (idx === 0) return part;
            return acc + '.' + part;
          }, '');

        this._setByPath(config, configPath, this._parseEnvValue(value));
      }
    }

    return config;
  }

  /**
   * 解析环境变量值
   * @private
   */
  _parseEnvValue(value) {
    // 布尔值
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // 数字
    if (!isNaN(value) && value.trim() !== '') {
      return Number(value);
    }

    // JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    return value;
  }

  /**
   * 验证所有配置
   * @private
   */
  _validateAll() {
    const errors = [];

    for (const [section, schema] of this.schemas) {
      if (this.config[section]) {
        const result = schema.safeParse(this.config[section]);
        if (!result.success) {
          errors.push({
            section,
            errors: result.error.errors,
          });
        } else {
          // 使用验证后的值（包含默认值）
          this.config[section] = result.data;
        }
      }
    }

    if (errors.length > 0) {
      this.emit('validationError', errors);
      console.error('[ConfigManager] Validation errors:', JSON.stringify(errors, null, 2));
    }

    return errors.length === 0;
  }

  /**
   * 冻结配置
   * @private
   */
  _freezeConfig() {
    const deepFreeze = (obj) => {
      if (obj && typeof obj === 'object') {
        Object.freeze(obj);
        Object.values(obj).forEach(deepFreeze);
      }
      return obj;
    };

    deepFreeze(this.config);
  }

  /**
   * 启动文件监听
   * @private
   */
  _startWatching() {
    const configDir = this.options.configPath;

    if (!fs.existsSync(configDir)) return;

    try {
      const watcher = fs.watch(configDir, async (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
          console.log(`[ConfigManager] Config file changed: ${filename}`);
          await this.reload();
        }
      });

      this.watchers.set(configDir, watcher);
    } catch (error) {
      console.error('[ConfigManager] Failed to watch config directory:', error.message);
    }
  }

  /**
   * 停止文件监听
   */
  stopWatching() {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  /**
   * 重新加载配置
   */
  async reload() {
    const oldConfig = { ...this.config };

    await this.load();

    this.emit('reloaded', {
      old: oldConfig,
      new: this.config,
    });
  }

  // ============================================
  // 配置访问 API
  // ============================================

  /**
   * 获取配置值
   * @param {string} keyPath - 配置路径 (如 "risk.maxPositions")
   * @param {any} defaultValue - 默认值
   */
  get(keyPath, defaultValue = undefined) {
    return this._getByPath(this.config, keyPath, defaultValue);
  }

  /**
   * 设置配置值
   * @param {string} keyPath - 配置路径
   * @param {any} value - 值
   */
  set(keyPath, value) {
    if (!this.options.allowRuntimeChanges) {
      throw new Error('Runtime config changes are not allowed');
    }

    if (this.options.freeze) {
      throw new Error('Config is frozen');
    }

    const oldValue = this.get(keyPath);
    this._setByPath(this.config, keyPath, value);

    // 验证更改
    const section = keyPath.split('.')[0];
    if (this.schemas.has(section)) {
      const result = this.schemas.get(section).safeParse(this.config[section]);
      if (!result.success) {
        // 回滚
        this._setByPath(this.config, keyPath, oldValue);
        throw new Error(`Validation failed: ${result.error.message}`);
      }
    }

    this.emit('changed', { keyPath, oldValue, newValue: value });
  }

  /**
   * 检查配置是否存在
   * @param {string} keyPath - 配置路径
   */
  has(keyPath) {
    return this.get(keyPath) !== undefined;
  }

  /**
   * 获取整个配置节
   * @param {string} section - 配置节名称
   */
  getSection(section) {
    return this.config[section] || {};
  }

  /**
   * 获取所有配置
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * 导出配置为 JSON
   */
  toJSON() {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 保存配置到文件
   * @param {string} filename - 文件名
   */
  save(filename = 'runtime.json') {
    const filePath = path.join(this.options.configPath, filename);

    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, this.toJSON());

    this.emit('saved', { path: filePath });

    return filePath;
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 按路径获取值
   * @private
   */
  _getByPath(obj, path, defaultValue) {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return defaultValue;
      }
      current = current[part];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * 按路径设置值
   * @private
   */
  _setByPath(obj, path, value) {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * 深度合并对象
   * @private
   */
  _deepMerge(...objects) {
    const result = {};

    for (const obj of objects) {
      if (!obj) continue;

      for (const [key, value] of Object.entries(obj)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = this._deepMerge(result[key] || {}, value);
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * 获取配置摘要
   */
  getSummary() {
    return {
      sections: Object.keys(this.config),
      schemas: Array.from(this.schemas.keys()),
      watchingFiles: this.options.watchFiles,
      frozen: this.options.freeze,
      allowRuntimeChanges: this.options.allowRuntimeChanges,
    };
  }

  /**
   * 销毁配置管理器
   */
  destroy() {
    this.stopWatching();
    this.removeAllListeners();
  }
}

// 全局实例
let globalConfig = null;

/**
 * 获取全局配置管理器
 */
function getConfig() {
  if (!globalConfig) {
    globalConfig = new ConfigManager();
  }
  return globalConfig;
}

/**
 * 初始化全局配置
 */
async function initConfig(options = {}) {
  globalConfig = new ConfigManager(options);
  await globalConfig.load();
  return globalConfig;
}

export {
  ConfigManager,
  ConfigSource,
  getConfig,
  initConfig,
};

export default ConfigManager;
