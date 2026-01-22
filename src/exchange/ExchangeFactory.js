/**
 * 交易所工厂类
 * Exchange Factory Class
 *
 * 用于创建和管理不同交易所的实例
 * Used to create and manage instances of different exchanges
 */

// 导入各个交易所实现 / Import exchange implementations
import { BinanceExchange } from './BinanceExchange.js'; // 导入模块 ./BinanceExchange.js
import { BybitExchange } from './BybitExchange.js'; // 导入模块 ./BybitExchange.js
import { OKXExchange } from './OKXExchange.js'; // 导入模块 ./OKXExchange.js
import { GateExchange } from './GateExchange.js'; // 导入模块 ./GateExchange.js
import { DeribitExchange } from './DeribitExchange.js'; // 导入模块 ./DeribitExchange.js
import { BitgetExchange } from './BitgetExchange.js'; // 导入模块 ./BitgetExchange.js
import { KuCoinExchange } from './KuCoinExchange.js'; // 导入模块 ./KuCoinExchange.js
import { KrakenExchange } from './KrakenExchange.js'; // 导入模块 ./KrakenExchange.js

/**
 * 交易所工厂
 * Exchange Factory
 *
 * 使用工厂模式创建交易所实例，方便扩展和维护
 * Uses factory pattern to create exchange instances for easy extension and maintenance
 */
export class ExchangeFactory { // 导出类 ExchangeFactory
  /**
   * 支持的交易所列表
   * List of supported exchanges
   * @private
   */
  static exchanges = { // 执行语句
    binance: BinanceExchange,    // Binance 交易所 / Binance exchange
    bybit: BybitExchange,        // Bybit 交易所 / Bybit exchange
    okx: OKXExchange,            // OKX 交易所 / OKX exchange
    gate: GateExchange,          // Gate.io 交易所 / Gate.io exchange
    deribit: DeribitExchange,    // Deribit 交易所 / Deribit exchange
    bitget: BitgetExchange,      // Bitget 交易所 / Bitget exchange
    kucoin: KuCoinExchange,      // KuCoin 交易所 / KuCoin exchange
    kraken: KrakenExchange,      // Kraken 交易所 / Kraken exchange
  }; // 结束代码块

  /**
   * 已创建的交易所实例缓存 (单例模式)
   * Cache of created exchange instances (singleton pattern)
   * @private
   */
  static instances = new Map(); // 执行语句

  /**
   * 创建交易所实例
   * Create exchange instance
   *
   * @param {string} exchangeName - 交易所名称 (binance, okx 等) / Exchange name
   * @param {Object} config - 交易所配置 / Exchange configuration
   * @param {string} config.apiKey - API 密钥 / API key
   * @param {string} config.apiSecret - API 密钥 / API secret
   * @param {boolean} config.sandbox - 是否使用沙盒/测试网 / Whether to use sandbox/testnet
   * @param {string} config.type - 交易类型 (spot, future, swap) / Trading type
   * @returns {BaseExchange} 交易所实例 / Exchange instance
   *
   * @example
   * // 创建 Binance 现货交易所实例 / Create Binance spot exchange instance
   * const binanceSpot = ExchangeFactory.create('binance', {
   *   apiKey: 'your-api-key',
   *   apiSecret: 'your-api-secret',
   *   type: 'spot',
   *   testnet: true
   * });
   *
   * @example
   * // 创建 OKX 合约交易所实例 / Create OKX swap exchange instance
   * const okxSwap = ExchangeFactory.create('okx', {
   *   apiKey: 'your-api-key',
   *   apiSecret: 'your-api-secret',
   *   passphrase: 'your-passphrase',
   *   type: 'swap',
   *   sandbox: true
   * });
   */
  static create(exchangeName, config = {}) { // 执行语句
    // 将交易所名称转换为小写，确保匹配 / Convert exchange name to lowercase for matching
    const normalizedName = exchangeName.toLowerCase(); // 定义常量 normalizedName

    // 检查是否支持该交易所 / Check if exchange is supported
    if (!this.exchanges[normalizedName]) { // 条件判断 !this.exchanges[normalizedName]
      // 获取所有支持的交易所名称 / Get all supported exchange names
      const supportedExchanges = Object.keys(this.exchanges).join(', '); // 定义常量 supportedExchanges
      throw new Error( // 抛出异常
        `不支持的交易所: ${exchangeName}。支持的交易所: ${supportedExchanges} / ` + // 执行语句
        `Unsupported exchange: ${exchangeName}. Supported: ${supportedExchanges}` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 获取交易所类 / Get exchange class
    const ExchangeClass = this.exchanges[normalizedName]; // 定义常量 ExchangeClass

    // 创建并返回新实例 / Create and return new instance
    const instance = new ExchangeClass(config); // 定义常量 instance

    // 返回实例 / Return instance
    return instance; // 返回结果
  } // 结束代码块

  /**
   * 获取或创建交易所单例
   * Get or create exchange singleton
   *
   * 使用单例模式，确保每个交易所配置只有一个实例
   * Uses singleton pattern to ensure only one instance per exchange configuration
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {Object} config - 交易所配置 / Exchange configuration
   * @param {string} instanceId - 实例唯一标识 (可选) / Instance unique identifier (optional)
   * @returns {BaseExchange} 交易所实例 / Exchange instance
   *
   * @example
   * // 第一次调用会创建实例 / First call creates instance
   * const exchange1 = ExchangeFactory.getInstance('binance', config);
   *
   * // 第二次调用返回同一个实例 / Second call returns same instance
   * const exchange2 = ExchangeFactory.getInstance('binance', config);
   *
   * console.log(exchange1 === exchange2); // true
   */
  static getInstance(exchangeName, config = {}, instanceId = 'default') { // 执行语句
    // 生成缓存键 / Generate cache key
    // 格式: exchangeName_type_instanceId (例如: binance_spot_default)
    const cacheKey = `${exchangeName.toLowerCase()}_${config.type || 'spot'}_${instanceId}`; // 定义常量 cacheKey

    // 检查缓存中是否已有实例 / Check if instance exists in cache
    if (this.instances.has(cacheKey)) { // 条件判断 this.instances.has(cacheKey)
      // 返回缓存的实例 / Return cached instance
      return this.instances.get(cacheKey); // 返回结果
    } // 结束代码块

    // 创建新实例 / Create new instance
    const instance = this.create(exchangeName, config); // 定义常量 instance

    // 缓存实例 / Cache instance
    this.instances.set(cacheKey, instance); // 访问 instances

    // 返回实例 / Return instance
    return instance; // 返回结果
  } // 结束代码块

  /**
   * 销毁交易所实例
   * Destroy exchange instance
   *
   * 关闭连接并从缓存中移除实例
   * Closes connection and removes instance from cache
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @param {string} type - 交易类型 / Trading type
   * @param {string} instanceId - 实例标识 / Instance identifier
   * @returns {Promise<boolean>} 是否成功销毁 / Whether destruction was successful
   */
  static async destroyInstance(exchangeName, type = 'spot', instanceId = 'default') { // 执行语句
    // 生成缓存键 / Generate cache key
    const cacheKey = `${exchangeName.toLowerCase()}_${type}_${instanceId}`; // 定义常量 cacheKey

    // 检查实例是否存在 / Check if instance exists
    if (!this.instances.has(cacheKey)) { // 条件判断 !this.instances.has(cacheKey)
      return false;  // 实例不存在 / Instance doesn't exist
    } // 结束代码块

    // 获取实例 / Get instance
    const instance = this.instances.get(cacheKey); // 定义常量 instance

    try { // 尝试执行
      // 关闭交易所连接 / Close exchange connection
      await instance.close(); // 等待异步结果
    } catch (error) { // 执行语句
      // 忽略关闭错误，继续清理 / Ignore close error, continue cleanup
      console.error(`关闭交易所连接时出错 / Error closing exchange connection: ${error.message}`); // 控制台输出
    } // 结束代码块

    // 从缓存中移除 / Remove from cache
    this.instances.delete(cacheKey); // 访问 instances

    return true; // 返回结果
  } // 结束代码块

  /**
   * 销毁所有交易所实例
   * Destroy all exchange instances
   *
   * 关闭所有连接并清空缓存
   * Closes all connections and clears cache
   *
   * @returns {Promise<void>}
   */
  static async destroyAll() { // 执行语句
    // 遍历所有实例 / Iterate all instances
    for (const [cacheKey, instance] of this.instances) { // 循环 const [cacheKey, instance] of this.instances
      try { // 尝试执行
        // 关闭连接 / Close connection
        await instance.close(); // 等待异步结果
        console.log(`已关闭交易所实例: ${cacheKey} / Closed exchange instance: ${cacheKey}`); // 控制台输出
      } catch (error) { // 执行语句
        // 忽略错误，继续清理其他实例 / Ignore error, continue cleaning other instances
        console.error(`关闭 ${cacheKey} 时出错 / Error closing ${cacheKey}: ${error.message}`); // 控制台输出
      } // 结束代码块
    } // 结束代码块

    // 清空缓存 / Clear cache
    this.instances.clear(); // 访问 instances
  } // 结束代码块

  /**
   * 获取所有支持的交易所列表
   * Get list of all supported exchanges
   *
   * @returns {Array<string>} 交易所名称列表 / List of exchange names
   */
  static getSupportedExchanges() { // 执行语句
    return Object.keys(this.exchanges); // 返回结果
  } // 结束代码块

  /**
   * 检查交易所是否受支持
   * Check if exchange is supported
   *
   * @param {string} exchangeName - 交易所名称 / Exchange name
   * @returns {boolean} 是否支持 / Whether supported
   */
  static isSupported(exchangeName) { // 执行语句
    return exchangeName.toLowerCase() in this.exchanges; // 返回结果
  } // 结束代码块

  /**
   * 注册新的交易所类型
   * Register new exchange type
   *
   * 允许动态添加新的交易所支持
   * Allows dynamic addition of new exchange support
   *
   * @param {string} name - 交易所名称 / Exchange name
   * @param {Class} ExchangeClass - 交易所类 / Exchange class
   *
   * @example
   * // 注册自定义交易所 / Register custom exchange
   * class MyExchange extends BaseExchange {
   *   // ... 实现 / implementation
   * }
   * ExchangeFactory.register('myexchange', MyExchange);
   */
  static register(name, ExchangeClass) { // 执行语句
    // 验证交易所类 / Validate exchange class
    if (typeof ExchangeClass !== 'function') { // 条件判断 typeof ExchangeClass !== 'function'
      throw new Error('ExchangeClass 必须是一个类 / ExchangeClass must be a class'); // 抛出异常
    } // 结束代码块

    // 注册交易所 / Register exchange
    this.exchanges[name.toLowerCase()] = ExchangeClass; // 访问 exchanges

    console.log(`已注册交易所: ${name} / Registered exchange: ${name}`); // 控制台输出
  } // 结束代码块

  /**
   * 获取当前活跃的实例数量
   * Get count of currently active instances
   *
   * @returns {number} 活跃实例数量 / Number of active instances
   */
  static getActiveInstanceCount() { // 执行语句
    return this.instances.size; // 返回结果
  } // 结束代码块

  /**
   * 获取所有活跃实例的信息
   * Get info of all active instances
   *
   * @returns {Array<Object>} 实例信息列表 / List of instance info
   */
  static getActiveInstancesInfo() { // 执行语句
    const info = []; // 定义常量 info

    // 遍历所有实例 / Iterate all instances
    for (const [cacheKey, instance] of this.instances) { // 循环 const [cacheKey, instance] of this.instances
      info.push({ // 调用 info.push
        cacheKey,                        // 缓存键 / Cache key
        name: instance.name,             // 交易所名称 / Exchange name
        initialized: instance.initialized,  // 是否已初始化 / Whether initialized
        tradingType: instance.tradingType,  // 交易类型 / Trading type
      }); // 结束代码块
    } // 结束代码块

    return info; // 返回结果
  } // 结束代码块
} // 结束代码块

// 导出默认工厂 / Export default factory
export default ExchangeFactory; // 默认导出
