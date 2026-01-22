/**
 * 配置管理器
 * Configuration Manager
 *
 * 提供集中式配置管理，支持验证和热重载
 * Provides centralized config management with validation and hot reload
 *
 * @module src/config/ConfigManager
 */

import { EventEmitter } from 'events'; // 导入模块 events
import fs from 'fs'; // 导入模块 fs
import path from 'path'; // 导入模块 path
import { z } from 'zod'; // 导入模块 zod

/**
 * 配置源类型
 */
const ConfigSource = { // 定义常量 ConfigSource
  DEFAULT: 'default', // 设置 DEFAULT 字段
  FILE: 'file', // 设置 FILE 字段
  ENV: 'env', // 设置 ENV 字段
  RUNTIME: 'runtime', // 设置 RUNTIME 字段
}; // 结束代码块

/**
 * 配置管理器类
 * Configuration Manager Class
 */
class ConfigManager extends EventEmitter { // 定义类 ConfigManager(继承EventEmitter)
  constructor(options = {}) { // 构造函数
    super(); // 调用父类

    this.options = { // 设置 options
      // 配置文件路径
      configPath: options.configPath || './config', // 设置 configPath 字段
      // 环境变量前缀
      envPrefix: options.envPrefix || 'QUANT_', // 设置 envPrefix 字段
      // 是否监听文件变化
      watchFiles: options.watchFiles ?? false, // 设置 watchFiles 字段
      // 是否冻结配置
      freeze: options.freeze ?? false, // 设置 freeze 字段
      // 是否允许运行时修改
      allowRuntimeChanges: options.allowRuntimeChanges ?? true, // 设置 allowRuntimeChanges 字段
    }; // 结束代码块

    // 配置存储
    this.config = {}; // 设置 config

    // 配置元数据
    this.metadata = new Map(); // 设置 metadata

    // Schema 注册表
    this.schemas = new Map(); // 设置 schemas

    // 文件监听器
    this.watchers = new Map(); // 设置 watchers

    // 加载默认 Schema
    this._registerDefaultSchemas(); // 调用 _registerDefaultSchemas
  } // 结束代码块

  /**
   * 注册默认 Schema
   * @private
   */
  _registerDefaultSchemas() { // 调用 _registerDefaultSchemas
    // 交易所配置 Schema
    this.registerSchema('exchange', z.object({ // 调用 registerSchema
      default: z.string().default('binance'), // 默认分支
      binance: z.object({ // 设置 binance 字段
        apiKey: z.string().optional(), // 设置 apiKey 字段
        secret: z.string().optional(), // 设置 secret 字段
        sandbox: z.boolean().default(false), // 设置 sandbox 字段
        timeout: z.number().positive().default(30000), // 设置 timeout 字段
        rateLimit: z.boolean().default(true), // 设置 rateLimit 字段
      }).optional(), // 执行语句
      okx: z.object({ // 设置 okx 字段
        apiKey: z.string().optional(), // 设置 apiKey 字段
        secret: z.string().optional(), // 设置 secret 字段
        passphrase: z.string().optional(), // 设置 passphrase 字段
        sandbox: z.boolean().default(false), // 设置 sandbox 字段
      }).optional(), // 执行语句
    })); // 结束代码块

    // 风控配置 Schema
    this.registerSchema('risk', z.object({ // 调用 registerSchema
      enabled: z.boolean().default(true), // 设置 enabled 字段
      maxPositionRatio: z.number().min(0).max(1).default(0.3), // 设置 maxPositionRatio 字段
      maxRiskPerTrade: z.number().min(0).max(1).default(0.02), // 设置 maxRiskPerTrade 字段
      maxDailyLoss: z.number().positive().default(1000), // 设置 maxDailyLoss 字段
      maxDrawdown: z.number().min(0).max(1).default(0.2), // 设置 maxDrawdown 字段
      maxPositions: z.number().int().positive().default(5), // 设置 maxPositions 字段
      maxLeverage: z.number().positive().default(3), // 设置 maxLeverage 字段
      cooldownPeriod: z.number().nonnegative().default(300000), // 设置 cooldownPeriod 字段
    })); // 结束代码块

    // 策略配置 Schema
    this.registerSchema('strategy', z.object({ // 调用 registerSchema
      enabled: z.boolean().default(true), // 设置 enabled 字段
      defaultTimeframe: z.string().default('1h'), // 设置 defaultTimeframe 字段
      capitalRatio: z.number().min(0).max(1).default(0.1), // 设置 capitalRatio 字段
    })); // 结束代码块

    // 日志配置 Schema
    this.registerSchema('logging', z.object({ // 调用 registerSchema
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info'), // 设置 level 字段
      format: z.enum(['json', 'text']).default('json'), // 设置 format 字段
      destination: z.enum(['console', 'file', 'both']).default('both'), // 设置 destination 字段
      maxFiles: z.number().positive().default(10), // 设置 maxFiles 字段
      maxFileSize: z.number().positive().default(10485760), // 设置 maxFileSize 字段
    })); // 结束代码块

    // 数据库配置 Schema
    this.registerSchema('database', z.object({ // 调用 registerSchema
      redis: z.object({ // 设置 redis 字段
        enabled: z.boolean().default(false), // 设置 enabled 字段
        host: z.string().optional(), // 设置 host 字段
        port: z.number().optional(), // 设置 port 字段
        password: z.string().optional(), // 设置 password 字段
        db: z.number().optional(), // 设置 db 字段
        url: z.string().optional(), // 设置 url 字段
      }).optional(), // 执行语句
    })); // 结束代码块

    // 备份配置 Schema
    this.registerSchema('backup', z.object({ // 调用 registerSchema
      enabled: z.boolean().default(true), // 设置 enabled 字段
      dir: z.string().default('./backups'), // 设置 dir 字段
      retentionDays: z.number().positive().default(30), // 设置 retentionDays 字段
      compress: z.boolean().default(true), // 设置 compress 字段
      encrypt: z.boolean().default(false), // 设置 encrypt 字段
    })); // 结束代码块

    // 健康检查配置 Schema
    this.registerSchema('health', z.object({ // 调用 registerSchema
      enabled: z.boolean().default(true), // 设置 enabled 字段
      port: z.number().int().positive().default(8080), // 设置 port 字段
      path: z.string().default('/health'), // 设置 path 字段
      interval: z.number().positive().default(30000), // 设置 interval 字段
    })); // 结束代码块
  } // 结束代码块

  /**
   * 注册配置 Schema
   * @param {string} section - 配置节名称
   * @param {z.ZodSchema} schema - Zod Schema
   */
  registerSchema(section, schema) { // 调用 registerSchema
    this.schemas.set(section, schema); // 访问 schemas
  } // 结束代码块

  /**
   * 加载配置
   * @param {string} environment - 环境名称
   */
  async load(environment = process.env.NODE_ENV || 'development') { // 读取环境变量 NODE_ENV
    // 1. 加载默认配置
    const defaultConfig = this._loadDefaults(); // 定义常量 defaultConfig

    // 2. 加载文件配置
    const fileConfig = await this._loadFromFiles(environment); // 定义常量 fileConfig

    // 3. 加载环境变量
    const envConfig = this._loadFromEnv(); // 定义常量 envConfig

    // 4. 合并配置
    this.config = this._deepMerge(defaultConfig, fileConfig, envConfig); // 设置 config

    // 5. 验证配置
    this._validateAll(); // 调用 _validateAll

    // 6. 冻结配置
    if (this.options.freeze) { // 条件判断 this.options.freeze
      this._freezeConfig(); // 调用 _freezeConfig
    } // 结束代码块

    // 7. 启动文件监听
    if (this.options.watchFiles) { // 条件判断 this.options.watchFiles
      this._startWatching(); // 调用 _startWatching
    } // 结束代码块

    this.emit('loaded', { environment, config: this.getAll() }); // 调用 emit

    return this.config; // 返回结果
  } // 结束代码块

  /**
   * 加载默认配置
   * @private
   */
  _loadDefaults() { // 调用 _loadDefaults
    const defaults = {}; // 定义常量 defaults

    for (const [section, schema] of this.schemas) { // 循环 const [section, schema] of this.schemas
      try { // 尝试执行
        // 使用 Schema 的默认值
        defaults[section] = schema.parse({}); // 执行语句
      } catch { // 执行语句
        defaults[section] = {}; // 执行语句
      } // 结束代码块
    } // 结束代码块

    return defaults; // 返回结果
  } // 结束代码块

  /**
   * 从文件加载配置
   * @private
   */
  async _loadFromFiles(environment) { // 执行语句
    const config = {}; // 定义常量 config
    const configDir = this.options.configPath; // 定义常量 configDir

    if (!fs.existsSync(configDir)) { // 条件判断 !fs.existsSync(configDir)
      return config; // 返回结果
    } // 结束代码块

    // 加载顺序：default.json -> {env}.json
    const files = [ // 定义常量 files
      'default.json', // 执行语句
      `${environment}.json`, // 执行语句
    ]; // 结束数组或索引

    for (const file of files) { // 循环 const file of files
      const filePath = path.join(configDir, file); // 定义常量 filePath

      if (fs.existsSync(filePath)) { // 条件判断 fs.existsSync(filePath)
        try { // 尝试执行
          const content = fs.readFileSync(filePath, 'utf8'); // 定义常量 content
          const parsed = JSON.parse(content); // 定义常量 parsed
          Object.assign(config, this._deepMerge(config, parsed)); // 调用 Object.assign

          this.metadata.set(filePath, { // 访问 metadata
            source: ConfigSource.FILE, // 设置 source 字段
            loadedAt: Date.now(), // 设置 loadedAt 字段
          }); // 结束代码块
        } catch (error) { // 执行语句
          console.error(`[ConfigManager] Failed to load ${file}:`, error.message); // 控制台输出
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return config; // 返回结果
  } // 结束代码块

  /**
   * 从环境变量加载配置
   * @private
   */
  _loadFromEnv() { // 调用 _loadFromEnv
    const config = {}; // 定义常量 config
    const prefix = this.options.envPrefix; // 定义常量 prefix

    for (const [key, value] of Object.entries(process.env)) { // 循环 const [key, value] of Object.entries(process....
      if (key.startsWith(prefix)) { // 条件判断 key.startsWith(prefix)
        // 转换 QUANT_RISK_MAX_POSITIONS -> risk.maxPositions
        const configPath = key // 定义常量 configPath
          .slice(prefix.length) // 执行语句
          .toLowerCase() // 执行语句
          .split('_') // 执行语句
          .reduce((acc, part, idx) => { // 定义箭头函数
            if (idx === 0) return part; // 条件判断 idx === 0
            return acc + '.' + part; // 返回结果
          }, ''); // 执行语句

        this._setByPath(config, configPath, this._parseEnvValue(value)); // 调用 _setByPath
      } // 结束代码块
    } // 结束代码块

    return config; // 返回结果
  } // 结束代码块

  /**
   * 解析环境变量值
   * @private
   */
  _parseEnvValue(value) { // 调用 _parseEnvValue
    // 布尔值
    if (value.toLowerCase() === 'true') return true; // 条件判断 value.toLowerCase() === 'true'
    if (value.toLowerCase() === 'false') return false; // 条件判断 value.toLowerCase() === 'false'

    // 数字
    if (!isNaN(value) && value.trim() !== '') { // 条件判断 !isNaN(value) && value.trim() !== ''
      return Number(value); // 返回结果
    } // 结束代码块

    // JSON
    if (value.startsWith('{') || value.startsWith('[')) { // 条件判断 value.startsWith('{') || value.startsWith('[')
      try { // 尝试执行
        return JSON.parse(value); // 返回结果
      } catch { // 执行语句
        return value; // 返回结果
      } // 结束代码块
    } // 结束代码块

    return value; // 返回结果
  } // 结束代码块

  /**
   * 验证所有配置
   * @private
   */
  _validateAll() { // 调用 _validateAll
    const errors = []; // 定义常量 errors

    for (const [section, schema] of this.schemas) { // 循环 const [section, schema] of this.schemas
      if (this.config[section]) { // 条件判断 this.config[section]
        const result = schema.safeParse(this.config[section]); // 定义常量 result
        if (!result.success) { // 条件判断 !result.success
          errors.push({ // 调用 errors.push
            section, // 执行语句
            errors: result.error.errors, // 设置 errors 字段
          }); // 结束代码块
        } else { // 执行语句
          // 使用验证后的值（包含默认值）
          this.config[section] = result.data; // 访问 config
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    if (errors.length > 0) { // 条件判断 errors.length > 0
      this.emit('validationError', errors); // 调用 emit
      console.error('[ConfigManager] Validation errors:', JSON.stringify(errors, null, 2)); // 控制台输出
    } // 结束代码块

    return errors.length === 0; // 返回结果
  } // 结束代码块

  /**
   * 冻结配置
   * @private
   */
  _freezeConfig() { // 调用 _freezeConfig
    const deepFreeze = (obj) => { // 定义函数 deepFreeze
      if (obj && typeof obj === 'object') { // 条件判断 obj && typeof obj === 'object'
        Object.freeze(obj); // 调用 Object.freeze
        Object.values(obj).forEach(deepFreeze); // 调用 Object.values
      } // 结束代码块
      return obj; // 返回结果
    }; // 结束代码块

    deepFreeze(this.config); // 调用 deepFreeze
  } // 结束代码块

  /**
   * 启动文件监听
   * @private
   */
  _startWatching() { // 调用 _startWatching
    const configDir = this.options.configPath; // 定义常量 configDir

    if (!fs.existsSync(configDir)) return; // 条件判断 !fs.existsSync(configDir)

    try { // 尝试执行
      const watcher = fs.watch(configDir, async (eventType, filename) => { // 定义函数 watcher
        if (filename && filename.endsWith('.json')) { // 条件判断 filename && filename.endsWith('.json')
          console.log(`[ConfigManager] Config file changed: ${filename}`); // 控制台输出
          await this.reload(); // 等待异步结果
        } // 结束代码块
      }); // 结束代码块

      this.watchers.set(configDir, watcher); // 访问 watchers
    } catch (error) { // 执行语句
      console.error('[ConfigManager] Failed to watch config directory:', error.message); // 控制台输出
    } // 结束代码块
  } // 结束代码块

  /**
   * 停止文件监听
   */
  stopWatching() { // 调用 stopWatching
    for (const watcher of this.watchers.values()) { // 循环 const watcher of this.watchers.values()
      watcher.close(); // 调用 watcher.close
    } // 结束代码块
    this.watchers.clear(); // 访问 watchers
  } // 结束代码块

  /**
   * 重新加载配置
   */
  async reload() { // 执行语句
    const oldConfig = { ...this.config }; // 定义常量 oldConfig

    await this.load(); // 等待异步结果

    this.emit('reloaded', { // 调用 emit
      old: oldConfig, // 设置 old 字段
      new: this.config, // 设置 new 字段
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // 配置访问 API
  // ============================================

  /**
   * 获取配置值
   * @param {string} keyPath - 配置路径 (如 "risk.maxPositions")
   * @param {any} defaultValue - 默认值
   */
  get(keyPath, defaultValue = undefined) { // 调用 get
    return this._getByPath(this.config, keyPath, defaultValue); // 返回结果
  } // 结束代码块

  /**
   * 设置配置值
   * @param {string} keyPath - 配置路径
   * @param {any} value - 值
   */
  set(keyPath, value) { // 调用 set
    if (!this.options.allowRuntimeChanges) { // 条件判断 !this.options.allowRuntimeChanges
      throw new Error('Runtime config changes are not allowed'); // 抛出异常
    } // 结束代码块

    if (this.options.freeze) { // 条件判断 this.options.freeze
      throw new Error('Config is frozen'); // 抛出异常
    } // 结束代码块

    const oldValue = this.get(keyPath); // 定义常量 oldValue
    this._setByPath(this.config, keyPath, value); // 调用 _setByPath

    // 验证更改
    const section = keyPath.split('.')[0]; // 定义常量 section
    if (this.schemas.has(section)) { // 条件判断 this.schemas.has(section)
      const result = this.schemas.get(section).safeParse(this.config[section]); // 定义常量 result
      if (!result.success) { // 条件判断 !result.success
        // 回滚
        this._setByPath(this.config, keyPath, oldValue); // 调用 _setByPath
        throw new Error(`Validation failed: ${result.error.message}`); // 抛出异常
      } // 结束代码块
    } // 结束代码块

    this.emit('changed', { keyPath, oldValue, newValue: value }); // 调用 emit
  } // 结束代码块

  /**
   * 检查配置是否存在
   * @param {string} keyPath - 配置路径
   */
  has(keyPath) { // 调用 has
    return this.get(keyPath) !== undefined; // 返回结果
  } // 结束代码块

  /**
   * 获取整个配置节
   * @param {string} section - 配置节名称
   */
  getSection(section) { // 调用 getSection
    return this.config[section] || {}; // 返回结果
  } // 结束代码块

  /**
   * 获取所有配置
   */
  getAll() { // 调用 getAll
    return { ...this.config }; // 返回结果
  } // 结束代码块

  /**
   * 导出配置为 JSON
   */
  toJSON() { // 调用 toJSON
    return JSON.stringify(this.config, null, 2); // 返回结果
  } // 结束代码块

  /**
   * 保存配置到文件
   * @param {string} filename - 文件名
   */
  save(filename = 'runtime.json') { // 调用 save
    const filePath = path.join(this.options.configPath, filename); // 定义常量 filePath

    // 确保目录存在
    const dir = path.dirname(filePath); // 定义常量 dir
    if (!fs.existsSync(dir)) { // 条件判断 !fs.existsSync(dir)
      fs.mkdirSync(dir, { recursive: true }); // 调用 fs.mkdirSync
    } // 结束代码块

    fs.writeFileSync(filePath, this.toJSON()); // 调用 fs.writeFileSync

    this.emit('saved', { path: filePath }); // 调用 emit

    return filePath; // 返回结果
  } // 结束代码块

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 按路径获取值
   * @private
   */
  _getByPath(obj, path, defaultValue) { // 调用 _getByPath
    const parts = path.split('.'); // 定义常量 parts
    let current = obj; // 定义变量 current

    for (const part of parts) { // 循环 const part of parts
      if (current === null || current === undefined) { // 条件判断 current === null || current === undefined
        return defaultValue; // 返回结果
      } // 结束代码块
      current = current[part]; // 赋值 current
    } // 结束代码块

    return current !== undefined ? current : defaultValue; // 返回结果
  } // 结束代码块

  /**
   * 按路径设置值
   * @private
   */
  _setByPath(obj, path, value) { // 调用 _setByPath
    const parts = path.split('.'); // 定义常量 parts
    let current = obj; // 定义变量 current

    for (let i = 0; i < parts.length - 1; i++) { // 循环 let i = 0; i < parts.length - 1; i++
      const part = parts[i]; // 定义常量 part
      if (!(part in current)) { // 条件判断 !(part in current)
        current[part] = {}; // 执行语句
      } // 结束代码块
      current = current[part]; // 赋值 current
    } // 结束代码块

    current[parts[parts.length - 1]] = value; // 执行语句
  } // 结束代码块

  /**
   * 深度合并对象
   * @private
   */
  _deepMerge(...objects) { // 调用 _deepMerge
    const result = {}; // 定义常量 result

    for (const obj of objects) { // 循环 const obj of objects
      if (!obj) continue; // 条件判断 !obj

      for (const [key, value] of Object.entries(obj)) { // 循环 const [key, value] of Object.entries(obj)
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) { // 条件判断 value !== null && typeof value === 'object' &...
          result[key] = this._deepMerge(result[key] || {}, value); // 执行语句
        } else { // 执行语句
          result[key] = value; // 执行语句
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  /**
   * 获取配置摘要
   */
  getSummary() { // 调用 getSummary
    return { // 返回结果
      sections: Object.keys(this.config), // 设置 sections 字段
      schemas: Array.from(this.schemas.keys()), // 设置 schemas 字段
      watchingFiles: this.options.watchFiles, // 设置 watchingFiles 字段
      frozen: this.options.freeze, // 设置 frozen 字段
      allowRuntimeChanges: this.options.allowRuntimeChanges, // 设置 allowRuntimeChanges 字段
    }; // 结束代码块
  } // 结束代码块

  /**
   * 销毁配置管理器
   */
  destroy() { // 调用 destroy
    this.stopWatching(); // 调用 stopWatching
    this.removeAllListeners(); // 调用 removeAllListeners
  } // 结束代码块
} // 结束代码块

// 全局实例
let globalConfig = null; // 定义变量 globalConfig

/**
 * 获取全局配置管理器
 */
function getConfig() { // 定义函数 getConfig
  if (!globalConfig) { // 条件判断 !globalConfig
    globalConfig = new ConfigManager(); // 赋值 globalConfig
  } // 结束代码块
  return globalConfig; // 返回结果
} // 结束代码块

/**
 * 初始化全局配置
 */
async function initConfig(options = {}) { // 定义函数 initConfig
  globalConfig = new ConfigManager(options); // 赋值 globalConfig
  await globalConfig.load(); // 等待异步结果
  return globalConfig; // 返回结果
} // 结束代码块

export { // 导出命名成员
  ConfigManager, // 执行语句
  ConfigSource, // 执行语句
  getConfig, // 执行语句
  initConfig, // 执行语句
}; // 结束代码块

export default ConfigManager; // 默认导出
