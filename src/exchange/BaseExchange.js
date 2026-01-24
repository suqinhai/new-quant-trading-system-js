/**
 * 交易所基类
 * Base Exchange Class
 *
 * 提供交易所的统一接口抽象，支持自动重试和统一错误处理
 * Provides unified interface abstraction for exchanges with auto-retry and unified error handling
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt'; // 导入模块 ccxt

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3'; // 导入模块 eventemitter3
import { SharedBalanceCache } from './SharedBalanceCache.js'; // 导入模块 ./SharedBalanceCache.js

const resolveNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeRole = (value) => {
  const role = (value || '').toString().toLowerCase();
  if (role === 'leader' || role === 'follower') return role;
  return 'auto';
};

/**
 * 统一订单格式
 * Unified Order Format
 * @typedef {Object} UnifiedOrder
 * @property {string} id - 订单ID / Order ID
 * @property {string} clientOrderId - 客户端订单ID / Client order ID
 * @property {string} symbol - 交易对 / Trading pair
 * @property {string} side - 方向 (buy/sell) / Side
 * @property {string} type - 类型 (market/limit) / Type
 * @property {number} amount - 数量 / Amount
 * @property {number} price - 价格 / Price
 * @property {number} filled - 已成交数量 / Filled amount
 * @property {number} remaining - 剩余数量 / Remaining amount
 * @property {number} cost - 成交金额 / Cost
 * @property {number} average - 平均成交价 / Average price
 * @property {string} status - 状态 (open/closed/canceled) / Status
 * @property {number} timestamp - 时间戳 / Timestamp
 * @property {Object} fee - 手续费信息 / Fee info
 * @property {Object} raw - 原始数据 / Raw data
 */

/**
 * 交易所基类
 * Base Exchange Class
 */
export class BaseExchange extends EventEmitter { // 导出类 BaseExchange
  /**
   * 构造函数
   * Constructor
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(); // 调用父类

    const sharedBalanceConfig = config.sharedBalance || {};
    const envSharedBalanceEnabled = ['true', '1'].includes(
      (process.env.SHARED_BALANCE_ENABLED || '').toLowerCase()
    );
    const sharedBalanceEnabled = sharedBalanceConfig.enabled !== undefined
      ? sharedBalanceConfig.enabled
      : envSharedBalanceEnabled;
    const sharedBalanceRole = normalizeRole(
      sharedBalanceConfig.role || process.env.SHARED_BALANCE_ROLE
    );
    const ttlMs = resolveNumber(
      sharedBalanceConfig.ttlMs ?? process.env.SHARED_BALANCE_TTL_MS,
      5000
    );
    const staleMaxMs = resolveNumber(
      sharedBalanceConfig.staleMaxMs ?? process.env.SHARED_BALANCE_STALE_MS,
      Math.max(ttlMs * 3, 15000)
    );
    const lockTtlMs = resolveNumber(
      sharedBalanceConfig.lockTtlMs ?? process.env.SHARED_BALANCE_LOCK_TTL_MS,
      Math.max(ttlMs * 2, 8000)
    );
    const waitTimeoutMs = resolveNumber(
      sharedBalanceConfig.waitTimeoutMs ?? process.env.SHARED_BALANCE_WAIT_MS,
      2000
    );

    // 交易所名称 (子类必须覆盖) / Exchange name (must be overridden by subclass)
    this.name = 'base'; // 设置 name

    // 配置参数 / Configuration parameters
    this.config = { // 设置 config
      // API 密钥 / API key
      apiKey: config.apiKey || null, // API密钥

      // API 密钥 / API secret
      secret: config.secret || null, // 密钥

      // API 密码 (OKX 等需要) / API password (required by OKX, etc.)
      password: config.password || null, // API 密码 (OKX 等需要)

      // 是否使用沙盒/测试网 / Whether to use sandbox/testnet
      sandbox: config.sandbox || false, // 是否使用沙盒/测试网

      // 默认交易类型: spot/swap/future / Default trade type
      defaultType: config.defaultType || 'swap', // 默认交易类型: spot/swap/future

      // 请求超时时间 (毫秒) / Request timeout (ms)
      timeout: config.timeout || 30000, // 请求超时时间 (毫秒)

      // 是否启用限速 / Whether to enable rate limiting
      enableRateLimit: config.enableRateLimit !== false, // 启用频率限制

      // 最大重试次数 / Maximum retry attempts
      maxRetries: config.maxRetries || 3, // 最大重试次数

      // 重试基础延迟 (毫秒) / Base retry delay (ms)
      retryDelay: config.retryDelay || 1000, // 重试基础延迟 (毫秒)

      // 代理设置 / Proxy settings
      proxy: config.proxy || null, // proxy

      // 额外选项 / Additional options
      options: config.options || {}, // options

      // Shared balance cache (multi-process)
      sharedBalance: {
        enabled: sharedBalanceEnabled,
        role: sharedBalanceRole,
        ttlMs,
        staleMaxMs,
        lockTtlMs,
        waitTimeoutMs,
        keyPrefix: sharedBalanceConfig.keyPrefix || process.env.SHARED_BALANCE_KEY_PREFIX,
        lockKeyPrefix: sharedBalanceConfig.lockKeyPrefix || process.env.SHARED_BALANCE_LOCK_PREFIX,
        dataKeyPrefix: sharedBalanceConfig.dataKeyPrefix,
        redis: sharedBalanceConfig.redis || config.redis || null,
      },
    }; // 结束代码块

    // CCXT 交易所实例 / CCXT exchange instance
    this.exchange = null; // 设置 exchange

    // 连接状态 / Connection status
    this.connected = false; // 设置 connected

    // 市场信息缓存 / Market info cache
    this.markets = {}; // 设置 markets

    // 精度信息缓存 / Precision info cache
    this.precisions = {}; // 设置 precisions

    // Shared balance cache (lazy)
    this._sharedBalanceCache = null; // 设置 _sharedBalanceCache
    this._sharedBalanceDisabled = false; // 设置 _sharedBalanceDisabled
  } // 结束代码块

  /**
   * 连接交易所 (包含初始化和验证)
   * Connect to exchange (includes initialization and verification)
   *
   * @param {Object} options - 连接选项 / Connection options
   * @param {boolean} options.loadMarkets - 是否加载市场信息 (默认: true) / Whether to load markets (default: true)
   * @param {boolean} options.skipPreflight - 是否跳过预检查 (默认: false) / Whether to skip preflight (default: false)
   * @returns {Promise<boolean>} 连接结果 / Connection result
   */
  async connect(options = {}) { // 执行语句
    // 解析选项 / Parse options
    const { loadMarkets = true, skipPreflight = false } = options; // 解构赋值

    // 记录日志 / Log
    console.log(`[${this.name}] 正在连接交易所... / Connecting to exchange...`); // 控制台输出
    if (!loadMarkets) { // 条件判断 !loadMarkets
      console.log(`[${this.name}] 轻量模式：跳过加载市场信息 / Lightweight mode: Skip loading markets`); // 控制台输出
    } // 结束代码块

    // 调试：打印配置信息 / Debug: print config info
    console.log(`[${this.name}] 配置信息 / Config info:`, { // 控制台输出
      hasApiKey: !!this.config.apiKey, // 是否有API密钥
      hasSecret: !!this.config.secret, // 是否有密钥
      hasPassword: !!this.config.password, // 是否有密码
      sandbox: this.config.sandbox, // 沙盒
      defaultType: this.config.defaultType, // 默认类型
      loadMarkets, // 执行语句
    }); // 结束代码块

    try { // 尝试执行
      // 1. 创建 CCXT 实例 / Create CCXT instance
      this.exchange = this._createExchange(); // 设置 exchange

      // 2. 设置沙盒模式 (如果子类没有在 _createExchange 中处理) / Set sandbox mode (if subclass didn't handle it in _createExchange)
      // 检查是否已经设置了 sandboxMode 选项 / Check if sandboxMode option is already set
      const alreadySandbox = this.exchange.options?.sandboxMode === true; // 定义常量 alreadySandbox
      if (this.config.sandbox && this.exchange.setSandboxMode && !alreadySandbox) { // 条件判断 this.config.sandbox && this.exchange.setSandb...
        // 启用沙盒/测试网 / Enable sandbox/testnet
        this.exchange.setSandboxMode(true); // 访问 exchange
        console.log(`[${this.name}] 已启用沙盒模式 (via setSandboxMode) / Sandbox mode enabled (via setSandboxMode)`); // 控制台输出
      } else if (this.config.sandbox) { // 执行语句
        console.log(`[${this.name}] 沙盒模式已在创建时配置 / Sandbox mode configured during creation`); // 控制台输出
      } // 结束代码块

      // 2.5 执行 API 预检查 (验证 IP 白名单和 API 权限) / Execute API preflight check (verify IP whitelist and API permissions)
      if (!skipPreflight) { // 条件判断 !skipPreflight
        await this._preflightCheck(); // 等待异步结果
      } // 结束代码块

      // 3. 加载市场信息 (如果需要) / Load market info (if needed)
      if (loadMarkets) { // 条件判断 loadMarkets
        await this._executeWithRetry(async () => { // 等待异步结果
          // 获取所有交易对信息 / Fetch all trading pair info
          this.markets = await this.exchange.loadMarkets(); // 设置 markets
        }, '加载市场信息 / Load markets'); // 执行语句

        // 4. 缓存精度信息 / Cache precision info
        this._cachePrecisions(); // 调用 _cachePrecisions

        console.log(`[${this.name}] ✓ 加载了 ${Object.keys(this.markets).length} 个交易对 / Loaded ${Object.keys(this.markets).length} markets`); // 控制台输出
      } else { // 执行语句
        // 轻量模式：不加载市场信息 / Lightweight mode: don't load markets
        this.markets = {}; // 设置 markets
        console.log(`[${this.name}] ✓ 轻量模式连接成功 / Lightweight mode connected`); // 控制台输出
      } // 结束代码块

      // 注意：API 验证已在步骤 2.5 的 _preflightCheck() 中完成
      // Note: API verification is already done in step 2.5 _preflightCheck()

      // 5. 更新连接状态 / Update connection status
      this.connected = true; // 设置 connected

      // 6. 发出连接成功事件 / Emit connected event
      this.emit('connected', { exchange: this.name, lightweight: !loadMarkets }); // 调用 emit

      // 7. 记录日志 / Log
      console.log(`[${this.name}] ✓ 连接成功 / Connected successfully`); // 控制台输出

      // 返回连接结果 / Return connection result
      return true; // 返回结果

    } catch (error) { // 执行语句
      // 更新连接状态 / Update connection status
      this.connected = false; // 设置 connected

      // 调试：打印原始错误信息 / Debug: print raw error info
      console.error(`[${this.name}] 原始错误 / Raw error:`, { // 控制台输出
        message: error?.message, // 消息
        name: error?.name, // name
        code: error?.code, // 代码
        type: typeof error, // 类型
      }); // 结束代码块
      // 打印完整堆栈 / Print full stack trace
      console.error(`[${this.name}] 完整堆栈 / Full stack trace:`); // 控制台输出
      console.error(error?.stack); // 控制台输出

      // 发出错误事件 / Emit error event
      this.emit('error', { type: 'connect', error: this._normalizeError(error) }); // 调用 emit

      // 记录错误 / Log error
      console.error(`[${this.name}] ✗ 连接失败 / Connection failed:`, error?.message || 'Unknown error'); // 控制台输出

      // 抛出标准化错误 / Throw normalized error
      throw this._normalizeError(error); // 抛出异常
    } // 结束代码块
  } // 结束代码块

  /**
   * 获取账户余额
   * Fetch account balance
   * @returns {Promise<Object>} 统一格式的余额信息 / Unified balance info
   */
  async fetchBalance() { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    const sharedCache = await this._getSharedBalanceCache(); // 定义常量 sharedCache
    if (!sharedCache) { // 条件判断 !sharedCache
      return this._fetchBalanceDirect(); // 返回结果
    } // 结束代码块

    return this._fetchBalanceShared(sharedCache); // 返回结果
  } // 结束代码块

  async _fetchBalanceDirect() { // 执行语句
    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取余额 / Call CCXT to fetch balance
      const balance = await this.exchange.fetchBalance(); // 定义常量 balance

      // 返回统一格式的余额 / Return unified balance format
      return { // 返回结果
        // 总余额 (包括冻结) / Total balance (including frozen)
        total: balance.total || {}, // 总余额 (包括冻结)

        // 可用余额 / Available balance
        free: balance.free || {}, // free

        // 冻结/已用余额 / Frozen/Used balance
        used: balance.used || {}, // used

        // 交易所名称 / Exchange name
        exchange: this.name, // 交易所

        // 时间戳 / Timestamp
        timestamp: Date.now(), // 时间戳

        // 原始数据 / Raw data
        raw: balance, // raw
      }; // 结束代码块
    }, '获取余额 / Fetch balance'); // 执行语句
  } // 结束代码块

  async _fetchBalanceShared(sharedCache) { // 执行语句
    const exchangeKey = (this.name || 'unknown').toLowerCase(); // 定义常量 exchangeKey
    const role = this.config.sharedBalance?.role || 'auto'; // 定义常量 role

    const cached = await sharedCache.get(exchangeKey); // 定义常量 cached
    if (cached && cached.ageMs <= sharedCache.ttlMs) { // 条件判断 cached && cached.ageMs <= sharedCache.ttlMs
      return cached.balance; // 返回结果
    } // 结束代码块

    if (role === 'follower') { // 条件判断 role === 'follower'
      if (cached && cached.ageMs <= sharedCache.staleMaxMs) { // 条件判断 cached && cached.ageMs <= sharedCache.staleMaxMs
        return cached.balance; // 返回结果
      } // 结束代码块
      const waited = await sharedCache.waitForFresh(exchangeKey); // 定义常量 waited
      if (waited) { // 条件判断 waited
        return waited.balance; // 返回结果
      } // 结束代码块
      throw new Error(`[${this.name}] Shared balance cache unavailable`); // 抛出异常
    } // 结束代码块

    if (role === 'leader') { // 条件判断 role === 'leader'
      const balance = await this._fetchBalanceDirect(); // 定义常量 balance
      await sharedCache.set(exchangeKey, balance); // 等待异步结果
      return balance; // 返回结果
    } // 结束代码块

    const lockToken = await sharedCache.acquireLock(exchangeKey); // 定义常量 lockToken
    if (lockToken) { // 条件判断 lockToken
      try { // 尝试执行
        const balance = await this._fetchBalanceDirect(); // 定义常量 balance
        await sharedCache.set(exchangeKey, balance); // 等待异步结果
        return balance; // 返回结果
      } finally { // 执行语句
        try { // 尝试执行
          await sharedCache.releaseLock(exchangeKey, lockToken); // 等待异步结果
        } catch { // 执行语句
          // Ignore release errors
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    if (cached && cached.ageMs <= sharedCache.staleMaxMs) { // 条件判断 cached && cached.ageMs <= sharedCache.staleMaxMs
      return cached.balance; // 返回结果
    } // 结束代码块

    const waited = await sharedCache.waitForFresh(exchangeKey); // 定义常量 waited
    if (waited) { // 条件判断 waited
      return waited.balance; // 返回结果
    } // 结束代码块

    const retryToken = await sharedCache.acquireLock(exchangeKey); // 定义常量 retryToken
    if (retryToken) { // 条件判断 retryToken
      try { // 尝试执行
        const balance = await this._fetchBalanceDirect(); // 定义常量 balance
        await sharedCache.set(exchangeKey, balance); // 等待异步结果
        return balance; // 返回结果
      } finally { // 执行语句
        try { // 尝试执行
          await sharedCache.releaseLock(exchangeKey, retryToken); // 等待异步结果
        } catch { // 执行语句
          // Ignore release errors
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    if (cached) { // 条件判断 cached
      return cached.balance; // 返回结果
    } // 结束代码块

    throw new Error(`[${this.name}] Shared balance cache unavailable`); // 抛出异常
  } // 结束代码块

  async _getSharedBalanceCache() { // 执行语句
    const config = this.config.sharedBalance; // 定义常量 config
    if (!config?.enabled) { // 条件判断 !config?.enabled
      return null; // 返回结果
    } // 结束代码块
    if (this._sharedBalanceDisabled) { // 条件判断 this._sharedBalanceDisabled
      return null; // 返回结果
    } // 结束代码块

    if (!this._sharedBalanceCache) { // 条件判断 !this._sharedBalanceCache
      this._sharedBalanceCache = new SharedBalanceCache(config); // 设置 _sharedBalanceCache
      try { // 尝试执行
        await this._sharedBalanceCache.connect(); // 等待异步结果
      } catch (error) { // 执行语句
        this._sharedBalanceDisabled = true; // 设置 _sharedBalanceDisabled
        console.warn(`[${this.name}] Shared balance disabled: ${error.message}`); // 控制台输出
        return null; // 返回结果
      } // 结束代码块
    } // 结束代码块

    return this._sharedBalanceCache; // 返回结果
  } // 结束代码块

  /**
   * 获取持仓信息 (合约/永续)
   * Fetch positions (futures/swap)
   * @param {string[]} symbols - 交易对列表 (可选) / Symbol list (optional)
   * @returns {Promise<Object[]>} 统一格式的持仓列表 / Unified position list
   */
  async fetchPositions(symbols = undefined) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 检查交易所是否支持 / Check if exchange supports this
    if (!this.exchange.has['fetchPositions']) { // 条件判断 !this.exchange.has['fetchPositions']
      // 返回空数组 / Return empty array
      console.warn(`[${this.name}] 该交易所不支持获取持仓 / Exchange does not support fetchPositions`); // 控制台输出
      return []; // 返回结果
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取持仓 / Call CCXT to fetch positions
      const positions = await this.exchange.fetchPositions(symbols); // 定义常量 positions

      // 过滤有效持仓并转换为统一格式 / Filter valid positions and convert to unified format
      return positions // 返回结果
        .filter(pos => { // 定义箭头函数
          // 过滤掉空仓位 / Filter out empty positions
          const contracts = Math.abs(pos.contracts || 0); // 定义常量 contracts
          const notional = Math.abs(pos.notional || 0); // 定义常量 notional
          return contracts > 0 || notional > 0; // 返回结果
        }) // 结束代码块
        .map(pos => this._normalizePosition(pos)); // 定义箭头函数
    }, '获取持仓 / Fetch positions'); // 执行语句
  } // 结束代码块

  /**
   * 获取资金费率
   * Fetch funding rate
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 统一格式的资金费率信息 / Unified funding rate info
   */
  async fetchFundingRate(symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 获取有效的交易对格式 (自动转换) / Get valid symbol format (auto convert)
    const validSymbol = this._getValidSymbol(symbol); // 定义常量 validSymbol

    // 验证交易对 / Validate symbol
    this._validateSymbol(validSymbol); // 调用 _validateSymbol

    // 检查交易所是否支持 / Check if exchange supports this
    if (!this.exchange.has['fetchFundingRate']) { // 条件判断 !this.exchange.has['fetchFundingRate']
      throw this._createError('UNSUPPORTED', '该交易所不支持获取资金费率 / Exchange does not support fetchFundingRate'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取资金费率 / Call CCXT to fetch funding rate
      const fundingRate = await this.exchange.fetchFundingRate(validSymbol); // 定义常量 fundingRate

      // 返回统一格式 / Return unified format
      return { // 返回结果
        // 交易对 / Symbol
        symbol: fundingRate.symbol, // 交易对

        // 当前资金费率 / Current funding rate
        fundingRate: fundingRate.fundingRate, // 资金费率频率

        // 预测资金费率 / Predicted funding rate
        fundingRatePredicted: fundingRate.fundingRatePredicted || null, // 资金费率频率Predicted

        // 下次结算时间戳 / Next funding timestamp
        fundingTimestamp: fundingRate.fundingTimestamp, // 资金费率时间戳

        // 下次结算时间 (ISO 字符串) / Next funding datetime (ISO string)
        fundingDatetime: fundingRate.fundingDatetime, // 下次结算时间 (ISO 字符串)

        // 标记价格 / Mark price
        markPrice: fundingRate.markPrice || null, // mark价格

        // 指数价格 / Index price
        indexPrice: fundingRate.indexPrice || null, // index价格

        // 交易所名称 / Exchange name
        exchange: this.name, // 交易所

        // 当前时间戳 / Current timestamp
        timestamp: Date.now(), // 时间戳

        // 原始数据 / Raw data
        raw: fundingRate, // raw
      }; // 结束代码块
    }, `获取资金费率 / Fetch funding rate: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 创建订单
   * Create order
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 方向 (buy/sell) / Side
   * @param {string} type - 类型 (market/limit) / Type
   * @param {number} amount - 数量 / Amount
   * @param {number} price - 价格 (限价单必填) / Price (required for limit)
   * @param {Object} params - 额外参数 / Additional params
   * @returns {Promise<UnifiedOrder>} 统一格式的订单对象 / Unified order object
   */
  async createOrder(symbol, side, type, amount, price = undefined, params = {}) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 获取有效的交易对格式 (自动转换) / Get valid symbol format (auto convert)
    const validSymbol = this._getValidSymbol(symbol); // 定义常量 validSymbol

    // 验证交易对 / Validate symbol
    this._validateSymbol(validSymbol); // 调用 _validateSymbol

    // 验证订单参数 / Validate order parameters
    this._validateOrderParams(side, type, amount, price); // 调用 _validateOrderParams

    // 调整数量精度 / Adjust amount precision
    const adjustedAmount = this._adjustPrecision(validSymbol, 'amount', amount); // 定义常量 adjustedAmount

    // 调整价格精度 (如果有价格) / Adjust price precision (if price exists)
    const adjustedPrice = price ? this._adjustPrecision(validSymbol, 'price', price) : undefined; // 定义常量 adjustedPrice

    // 记录日志 / Log
    console.log(`[${this.name}] 创建订单 / Creating order:`, { // 控制台输出
      symbol: validSymbol, // 交易对
      side, // 执行语句
      type, // 执行语句
      amount: adjustedAmount, // 数量
      price: adjustedPrice, // 价格
      params, // 执行语句
    }); // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 创建订单 / Call CCXT to create order
      const order = await this.exchange.createOrder( // 定义常量 order
        validSymbol,      // 交易对 / Symbol
        type,             // 订单类型 / Order type
        side,             // 买卖方向 / Side
        adjustedAmount,   // 数量 / Amount
        adjustedPrice,    // 价格 / Price
        params            // 额外参数 / Additional params
      ); // 结束调用或参数

      // 转换为统一格式 / Convert to unified format
      const unifiedOrder = this._normalizeOrder(order); // 定义常量 unifiedOrder

      // 发出订单创建事件 / Emit order created event
      this.emit('orderCreated', unifiedOrder); // 调用 emit

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 订单创建成功 / Order created: ${unifiedOrder.id}`); // 控制台输出

      // 返回统一格式订单 / Return unified order
      return unifiedOrder; // 返回结果
    }, `创建订单 / Create order: ${validSymbol} ${side} ${type}`); // 执行语句
  } // 结束代码块

  /**
   * 取消所有订单
   * Cancel all orders
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 取消结果 / Cancellation result
   */
  async cancelAllOrders(symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 获取有效的交易对格式 (自动转换) / Get valid symbol format (auto convert)
    const validSymbol = this._getValidSymbol(symbol); // 定义常量 validSymbol

    // 验证交易对 / Validate symbol
    this._validateSymbol(validSymbol); // 调用 _validateSymbol

    // 记录日志 / Log
    console.log(`[${this.name}] 取消所有订单 / Canceling all orders: ${validSymbol}`); // 控制台输出

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 结果对象 / Result object
      const result = { // 定义常量 result
        symbol: validSymbol,            // 交易对 / Symbol
        exchange: this.name,        // 交易所 / Exchange
        canceledCount: 0,           // 取消数量 / Canceled count
        failedCount: 0,             // 失败数量 / Failed count
        orders: [],                 // 订单详情 / Order details
        timestamp: Date.now(),      // 时间戳 / Timestamp
      }; // 结束代码块

      // 检查交易所是否原生支持批量取消 / Check if exchange natively supports batch cancel
      if (this.exchange.has['cancelAllOrders']) { // 条件判断 this.exchange.has['cancelAllOrders']
        // 直接调用批量取消 API / Call batch cancel API directly
        const response = await this.exchange.cancelAllOrders(validSymbol); // 定义常量 response

        // 更新结果 / Update result
        result.canceledCount = Array.isArray(response) ? response.length : 1; // 赋值 result.canceledCount
        result.orders = Array.isArray(response) ? response : [response]; // 赋值 result.orders
        result.raw = response; // 赋值 result.raw

      } else { // 执行语句
        // 不支持批量取消，逐个取消 / Batch cancel not supported, cancel one by one

        // 先获取所有未完成订单 / First fetch all open orders
        const openOrders = await this.exchange.fetchOpenOrders(validSymbol); // 定义常量 openOrders

        // 逐个取消订单 / Cancel orders one by one
        for (const order of openOrders) { // 循环 const order of openOrders
          try { // 尝试执行
            // 取消单个订单 / Cancel single order
            await this.exchange.cancelOrder(order.id, validSymbol); // 等待异步结果

            // 成功计数 / Success count
            result.canceledCount++; // 执行语句

            // 添加到详情 / Add to details
            result.orders.push({ // 调用 result.orders.push
              id: order.id, // ID
              status: 'canceled', // 状态
              success: true, // 成功标记
            }); // 结束代码块

          } catch (error) { // 执行语句
            // 失败计数 / Failed count
            result.failedCount++; // 执行语句

            // 添加到详情 / Add to details
            result.orders.push({ // 调用 result.orders.push
              id: order.id, // ID
              status: 'failed', // 状态
              success: false, // 成功标记
              error: error.message, // 错误
            }); // 结束代码块
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块

      // 发出订单取消事件 / Emit orders canceled event
      this.emit('allOrdersCanceled', result); // 调用 emit

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 已取消 ${result.canceledCount} 个订单 / Canceled ${result.canceledCount} orders`); // 控制台输出
      if (result.failedCount > 0) { // 条件判断 result.failedCount > 0
        console.warn(`[${this.name}] ⚠ ${result.failedCount} 个订单取消失败 / ${result.failedCount} orders failed to cancel`); // 控制台输出
      } // 结束代码块

      // 返回结果 / Return result
      return result; // 返回结果
    }, `取消所有订单 / Cancel all orders: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 取消单个订单
   * Cancel single order
   * @param {string} orderId - 订单ID / Order ID
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<UnifiedOrder>} 统一格式的取消订单 / Unified canceled order
   */
  async cancelOrder(orderId, symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 记录日志 / Log
    console.log(`[${this.name}] 取消订单 / Canceling order: ${orderId}`); // 控制台输出

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 取消订单 / Call CCXT to cancel order
      const order = await this.exchange.cancelOrder(orderId, symbol); // 定义常量 order

      // 转换为统一格式 / Convert to unified format
      const unifiedOrder = this._normalizeOrder(order); // 定义常量 unifiedOrder

      // 发出订单取消事件 / Emit order canceled event
      this.emit('orderCanceled', unifiedOrder); // 调用 emit

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 订单已取消 / Order canceled: ${orderId}`); // 控制台输出

      // 返回统一格式订单 / Return unified order
      return unifiedOrder; // 返回结果
    }, `取消订单 / Cancel order: ${orderId}`); // 执行语句
  } // 结束代码块

  /**
   * 获取订单信息
   * Fetch order info
   * @param {string} orderId - 订单ID / Order ID
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<UnifiedOrder>} 统一格式的订单 / Unified order
   */
  async fetchOrder(orderId, symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取订单 / Call CCXT to fetch order
      const order = await this.exchange.fetchOrder(orderId, symbol); // 定义常量 order

      // 转换为统一格式 / Convert to unified format
      return this._normalizeOrder(order); // 返回结果
    }, `获取订单 / Fetch order: ${orderId}`); // 执行语句
  } // 结束代码块

  /**
   * 获取未完成订单
   * Fetch open orders
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @returns {Promise<UnifiedOrder[]>} 统一格式的订单列表 / Unified order list
   */
  async fetchOpenOrders(symbol = undefined) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取未完成订单 / Call CCXT to fetch open orders
      const orders = await this.exchange.fetchOpenOrders(symbol); // 定义常量 orders

      // 转换为统一格式 / Convert to unified format
      return orders.map(order => this._normalizeOrder(order)); // 返回结果
    }, `获取未完成订单 / Fetch open orders: ${symbol || 'all'}`); // 执行语句
  } // 结束代码块

  /**
   * 获取 K 线数据
   * Fetch OHLCV data
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} timeframe - 时间周期 / Timeframe
   * @param {number} since - 开始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} K 线数据 / OHLCV data
   */
  async fetchOHLCV(symbol, timeframe = '1h', since = undefined, limit = 100) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 获取有效的交易对格式 (自动转换) / Get valid symbol format (auto convert)
    const validSymbol = this._getValidSymbol(symbol); // 定义常量 validSymbol

    // 验证交易对 / Validate symbol
    this._validateSymbol(validSymbol); // 调用 _validateSymbol

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取 K 线 / Call CCXT to fetch OHLCV
      return await this.exchange.fetchOHLCV(validSymbol, timeframe, since, limit); // 返回结果
    }, `获取 K 线 / Fetch OHLCV: ${validSymbol} ${timeframe}`); // 执行语句
  } // 结束代码块

  /**
   * 获取当前行情
   * Fetch ticker
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 行情数据 / Ticker data
   */
  async fetchTicker(symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 获取有效的交易对格式 (自动转换) / Get valid symbol format (auto convert)
    const validSymbol = this._getValidSymbol(symbol); // 定义常量 validSymbol

    // 验证交易对 / Validate symbol
    this._validateSymbol(validSymbol); // 调用 _validateSymbol

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取行情 / Call CCXT to fetch ticker
      return await this.exchange.fetchTicker(validSymbol); // 返回结果
    }, `获取行情 / Fetch ticker: ${validSymbol}`); // 执行语句
  } // 结束代码块

  /**
   * 设置杠杆倍数
   * Set leverage
   * @param {number} leverage - 杠杆倍数 / Leverage
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setLeverage(leverage, symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 获取有效的交易对格式 (自动转换) / Get valid symbol format (auto convert)
    const validSymbol = this._getValidSymbol(symbol); // 定义常量 validSymbol

    // 验证交易对 / Validate symbol
    this._validateSymbol(validSymbol); // 调用 _validateSymbol

    // 检查交易所是否支持 / Check if exchange supports this
    if (!this.exchange.has['setLeverage']) { // 条件判断 !this.exchange.has['setLeverage']
      throw this._createError('UNSUPPORTED', '该交易所不支持设置杠杆 / Exchange does not support setLeverage'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 设置杠杆 / Call CCXT to set leverage
      const result = await this.exchange.setLeverage(leverage, validSymbol); // 定义常量 result

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 杠杆已设置 / Leverage set: ${validSymbol} ${leverage}x`); // 控制台输出

      return result; // 返回结果
    }, `设置杠杆 / Set leverage: ${symbol} ${leverage}x`); // 执行语句
  } // 结束代码块

  /**
   * 关闭连接
   * Close connection
   */
  async close() { // 执行语句
    // 记录日志 / Log
    console.log(`[${this.name}] 关闭连接 / Closing connection`); // 控制台输出

    // 更新连接状态 / Update connection status
    this.connected = false; // 设置 connected

    // 关闭 CCXT 连接 (如果支持) / Close CCXT connection (if supported)
    if (this.exchange && typeof this.exchange.close === 'function') { // 条件判断 this.exchange && typeof this.exchange.close =...
      await this.exchange.close(); // 等待异步结果
    } // 结束代码块

    // 发出断开连接事件 / Emit disconnected event
    this.emit('disconnected', { exchange: this.name }); // 调用 emit
  } // 结束代码块

  /**
   * 断开连接 (close 的别名)
   * Disconnect (alias for close)
   */
  async disconnect() { // 执行语句
    return this.close(); // 返回结果
  } // 结束代码块

  /**
   * 获取交易对精度信息
   * Get precision info for a symbol
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 精度信息 / Precision info
   */
  getPrecision(symbol) { // 调用 getPrecision
    return this.precisions[symbol] || null; // 返回结果
  } // 结束代码块

  // ============================================
  // 受保护方法 (子类必须实现) / Protected Methods (must be implemented by subclass)
  // ============================================

  /**
   * 创建 CCXT 交易所实例 (子类必须实现)
   * Create CCXT exchange instance (must be implemented by subclass)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() { // 调用 _createExchange
    // 抛出错误，提示子类必须实现 / Throw error, subclass must implement
    throw new Error('子类必须实现 _createExchange 方法 / Subclass must implement _createExchange'); // 抛出异常
  } // 结束代码块

  // ============================================
  // 私有方法 - 预检查 / Private Methods - Preflight Check
  // ============================================

  /**
   * API 预检查 - 在加载市场信息前验证 IP 白名单和 API 权限
   * API Preflight Check - Verify IP whitelist and API permissions before loading markets
   *
   * 这个方法会在连接交易所时首先执行，用于提前发现：
   * This method runs first when connecting to exchange, to detect early:
   * - IP 是否在交易所白名单中 / Whether IP is in exchange whitelist
   * - API 密钥是否有效 / Whether API key is valid
   * - API 密钥权限是否足够 / Whether API key has sufficient permissions
   *
   * @returns {Promise<Object>} 检查结果 / Check result
   * @private
   */
  async _preflightCheck() { // 执行语句
    console.log(`[${this.name}] 🔍 执行 API 预检查... / Running API preflight check...`); // 控制台输出

    const result = { // 定义常量 result
      networkOk: false, // 网络Ok
      apiKeyOk: false, // API密钥Ok
      ipAllowed: false, // ipAllowed
      serverTime: null, // server时间
      serverIp: null, // serverIp
      error: null, // 错误
    }; // 结束代码块

    try { // 尝试执行
      // 步骤 1: 检查网络连通性 - 获取服务器时间（公开 API，不需要认证）
      // Step 1: Check network connectivity - fetch server time (public API, no auth required)
      console.log(`[${this.name}] 🌐 检查网络连通性... / Checking network connectivity...`); // 控制台输出

      let serverTime; // 定义变量 serverTime
      if (this.exchange.has['fetchTime']) { // 条件判断 this.exchange.has['fetchTime']
        serverTime = await this.exchange.fetchTime(); // 赋值 serverTime
      } else { // 执行语句
        // 如果不支持 fetchTime，尝试获取 ticker（也是公开 API）
        // If fetchTime not supported, try fetchTicker (also public API)
        serverTime = Date.now(); // 赋值 serverTime
      } // 结束代码块

      result.networkOk = true; // 赋值 result.networkOk
      result.serverTime = serverTime; // 赋值 result.serverTime
      console.log(`[${this.name}] ✓ 网络连通性正常 / Network connectivity OK`); // 控制台输出
      console.log(`[${this.name}]   服务器时间 / Server time: ${new Date(serverTime).toISOString()}`); // 控制台输出

      // 步骤 2: 检查 API 密钥和 IP 白名单（需要认证的 API）
      // Step 2: Check API key and IP whitelist (authenticated API)
      if (this.config.apiKey && this.config.secret) { // 条件判断 this.config.apiKey && this.config.secret
        console.log(`[${this.name}] 🔑 验证 API 密钥和 IP 白名单... / Verifying API key and IP whitelist...`); // 控制台输出

        // 尝试获取账户余额来验证 API 密钥和 IP
        // Try to fetch balance to verify API key and IP
        await this.exchange.fetchBalance(); // 等待异步结果

        result.apiKeyOk = true; // 赋值 result.apiKeyOk
        result.ipAllowed = true; // 赋值 result.ipAllowed
        console.log(`[${this.name}] ✓ API 密钥有效 / API key valid`); // 控制台输出
        console.log(`[${this.name}] ✓ IP 地址已在白名单中 / IP address is whitelisted`); // 控制台输出
      } else { // 执行语句
        console.log(`[${this.name}] ⚠ 未配置 API 密钥，跳过认证检查 / No API key configured, skipping auth check`); // 控制台输出
        console.log(`[${this.name}]   提示：部分功能可能受限 / Note: Some features may be limited`); // 控制台输出
      } // 结束代码块

      console.log(`[${this.name}] ✅ API 预检查通过 / API preflight check passed`); // 控制台输出

    } catch (error) { // 执行语句
      result.error = error; // 赋值 result.error

      // 分析错误类型并给出具体的错误信息
      // Analyze error type and provide specific error message
      if (error instanceof ccxt.AuthenticationError) { // 条件判断 error instanceof ccxt.AuthenticationError
        result.networkOk = true; // 网络是通的，只是认证失败 / Network is OK, just auth failed
        console.error(`[${this.name}] ❌ API 预检查失败: API 密钥无效或权限不足`); // 控制台输出
        console.error(`[${this.name}] ❌ Preflight check failed: Invalid API key or insufficient permissions`); // 控制台输出
        console.error(`[${this.name}]   错误码 / Error code: ${error.code || 'N/A'}`); // 控制台输出
        console.error(`[${this.name}]   错误信息 / Error message: ${error.message}`); // 控制台输出
        console.error(`[${this.name}]   解决方案 / Solution:`); // 控制台输出
        console.error(`[${this.name}]   1. 检查 API 密钥是否正确 / Check if API key is correct`); // 控制台输出
        console.error(`[${this.name}]   2. 检查 API 密钥是否过期 / Check if API key has expired`); // 控制台输出
        console.error(`[${this.name}]   3. 检查 API 密钥是否有期货交易权限 / Check if API key has futures trading permission`); // 控制台输出

      } else if (error instanceof ccxt.PermissionDenied) { // 执行语句
        result.networkOk = true; // 赋值 result.networkOk
        console.error(`[${this.name}] ❌ API 预检查失败: IP 地址不在白名单中`); // 控制台输出
        console.error(`[${this.name}] ❌ Preflight check failed: IP address not in whitelist`); // 控制台输出
        console.error(`[${this.name}]   错误码 / Error code: ${error.code || '50110'}`); // 控制台输出
        console.error(`[${this.name}]   错误信息 / Error message: ${error.message}`); // 控制台输出

        // 尝试从错误信息中提取 IP 地址
        // Try to extract IP address from error message
        const ipMatch = error.message.match(/IP\s+(\d+\.\d+\.\d+\.\d+)/i); // 定义常量 ipMatch
        if (ipMatch) { // 条件判断 ipMatch
          result.serverIp = ipMatch[1]; // 赋值 result.serverIp
          console.error(`[${this.name}]   ┌─────────────────────────────────────────────┐`); // 控制台输出
          console.error(`[${this.name}]   │  当前服务器 IP / Current Server IP:         │`); // 控制台输出
          console.error(`[${this.name}]   │  >>> ${ipMatch[1].padEnd(37)} <<<  │`); // 控制台输出
          console.error(`[${this.name}]   └─────────────────────────────────────────────┘`); // 控制台输出
        } // 结束代码块

        console.error(`[${this.name}]   解决方案 / Solution:`); // 控制台输出
        console.error(`[${this.name}]   1. 登录交易所，进入 API 管理页面`); // 控制台输出
        console.error(`[${this.name}]      Log in to exchange, go to API management page`); // 控制台输出
        console.error(`[${this.name}]   2. 将上述 IP 地址添加到 API 密钥的 IP 白名单中`); // 控制台输出
        console.error(`[${this.name}]      Add the above IP address to API key's IP whitelist`); // 控制台输出
        console.error(`[${this.name}]   3. 保存设置后重新启动系统`); // 控制台输出
        console.error(`[${this.name}]      Save settings and restart the system`); // 控制台输出

      } else if (error instanceof ccxt.NetworkError || error instanceof ccxt.RequestTimeout) { // 执行语句
        console.error(`[${this.name}] ❌ API 预检查失败: 网络连接失败`); // 控制台输出
        console.error(`[${this.name}] ❌ Preflight check failed: Network connection failed`); // 控制台输出
        console.error(`[${this.name}]   错误信息 / Error message: ${error.message}`); // 控制台输出
        console.error(`[${this.name}]   解决方案 / Solution:`); // 控制台输出
        console.error(`[${this.name}]   1. 检查网络连接 / Check network connection`); // 控制台输出
        console.error(`[${this.name}]   2. 检查是否需要配置代理 / Check if proxy is needed`); // 控制台输出
        console.error(`[${this.name}]   3. 检查交易所是否可访问 / Check if exchange is accessible`); // 控制台输出

      } else { // 执行语句
        console.error(`[${this.name}] ❌ API 预检查失败: 未知错误`); // 控制台输出
        console.error(`[${this.name}] ❌ Preflight check failed: Unknown error`); // 控制台输出
        console.error(`[${this.name}]   错误类型 / Error type: ${error.name || 'Unknown'}`); // 控制台输出
        console.error(`[${this.name}]   错误信息 / Error message: ${error.message}`); // 控制台输出
      } // 结束代码块

      // 沙盒模式下，只发出警告但不阻止连接
      // In sandbox mode, only warn but don't block connection
      if (this.config.sandbox) { // 条件判断 this.config.sandbox
        console.warn(`[${this.name}] ⚠ 沙盒模式: API 预检查失败，但将继续连接`); // 控制台输出
        console.warn(`[${this.name}] ⚠ Sandbox mode: Preflight check failed, but will continue`); // 控制台输出
        console.warn(`[${this.name}]   注意：部分功能可能受限 / Note: Some features may be limited`); // 控制台输出
        return result; // 返回结果
      } // 结束代码块

      // 非沙盒模式，抛出错误阻止连接继续
      // Non-sandbox mode, throw error to prevent connection from continuing
      throw error; // 抛出异常
    } // 结束代码块

    return result; // 返回结果
  } // 结束代码块

  // ============================================
  // 私有方法 - 重试机制 / Private Methods - Retry Mechanism
  // ============================================

  /**
   * 执行带重试的请求 (指数退避)
   * Execute request with retry (exponential backoff)
   * @param {Function} fn - 要执行的函数 / Function to execute
   * @param {string} operation - 操作描述 / Operation description
   * @returns {Promise<any>} 执行结果 / Execution result
   * @private
   */
  async _executeWithRetry(fn, operation = 'unknown') { // 执行语句
    // 当前重试次数 / Current retry count
    let attempt = 0; // 定义变量 attempt

    // 最大重试次数 / Max retries
    const maxRetries = this.config.maxRetries; // 定义常量 maxRetries

    // 基础延迟 / Base delay
    const baseDelay = this.config.retryDelay; // 定义常量 baseDelay

    // 循环重试 / Retry loop
    while (true) { // 循环条件 true
      try { // 尝试执行
        // 尝试执行函数 / Try to execute function
        return await fn(); // 返回结果

      } catch (error) { // 执行语句
        // 增加重试次数 / Increment retry count
        attempt++; // 执行语句

        // 判断是否需要重试 / Determine if retry is needed
        const shouldRetry = this._shouldRetry(error, attempt, maxRetries); // 定义常量 shouldRetry

        // 如果不需要重试，抛出标准化的错误 / If no retry needed, throw normalized error
        if (!shouldRetry) { // 条件判断 !shouldRetry
          // 调试：打印原始 ccxt 错误的完整信息 / Debug: print full original ccxt error info
          console.error(`[${this.name}] ❌ ${operation} 原始错误详情 / Original error details:`); // 控制台输出
          console.error(`[${this.name}]   消息 / Message: ${error?.message}`); // 控制台输出
          console.error(`[${this.name}]   名称 / Name: ${error?.name}`); // 控制台输出
          console.error(`[${this.name}]   代码 / Code: ${error?.code}`); // 控制台输出
          console.error(`[${this.name}]   原始堆栈 / Original stack:`); // 控制台输出
          console.error(error?.stack); // 控制台输出

          // 发出错误事件 / Emit error event
          this.emit('error', { // 调用 emit
            type: 'request', // 类型
            operation, // 执行语句
            error: this._normalizeError(error), // 错误
            originalStack: error?.stack,  // 保留原始堆栈 / Keep original stack
          }); // 结束代码块

          // 创建标准化错误并保留原始堆栈 / Create normalized error and keep original stack
          const normalizedError = this._normalizeError(error); // 定义常量 normalizedError
          normalizedError.originalStack = error?.stack; // 赋值 normalizedError.originalStack

          // 抛出错误 / Throw error
          throw normalizedError; // 抛出异常
        } // 结束代码块

        // 计算指数退避延迟 / Calculate exponential backoff delay
        // 公式: delay = baseDelay * 2^(attempt-1) / Formula: delay = baseDelay * 2^(attempt-1)
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1); // 定义常量 exponentialDelay

        // 添加随机抖动 (0-25%) 防止惊群效应 / Add random jitter (0-25%) to prevent thundering herd
        const jitter = exponentialDelay * Math.random() * 0.25; // 定义常量 jitter

        // 最终延迟，最大 30 秒 / Final delay, max 30 seconds
        const finalDelay = Math.min(exponentialDelay + jitter, 30000); // 定义常量 finalDelay

        // 记录重试日志 / Log retry
        console.warn(`[${this.name}] ⚠ ${operation} 失败，${Math.round(finalDelay)}ms 后重试 (${attempt}/${maxRetries})`); // 控制台输出
        console.warn(`[${this.name}] ⚠ ${operation} failed, retrying in ${Math.round(finalDelay)}ms (${attempt}/${maxRetries})`); // 控制台输出
        console.warn(`[${this.name}]   错误 / Error: ${error.message}`); // 控制台输出

        // 发出重试事件 / Emit retry event
        this.emit('retry', { // 调用 emit
          operation, // 执行语句
          attempt, // 执行语句
          maxRetries, // 执行语句
          delay: finalDelay, // 延迟
          error: error.message, // 错误
        }); // 结束代码块

        // 等待延迟 / Wait for delay
        await this._sleep(finalDelay); // 等待异步结果
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 判断是否应该重试
   * Determine if should retry
   * @param {Error} error - 错误对象 / Error object
   * @param {number} attempt - 当前重试次数 / Current attempt
   * @param {number} maxRetries - 最大重试次数 / Max retries
   * @returns {boolean} 是否重试 / Whether to retry
   * @private
   */
  _shouldRetry(error, attempt, maxRetries) { // 调用 _shouldRetry
    // 超过最大重试次数，不重试 / Exceeded max retries, don't retry
    if (attempt >= maxRetries) { // 条件判断 attempt >= maxRetries
      return false; // 返回结果
    } // 结束代码块

    // 可重试的错误类型 / Retryable error types

    // 网络错误 - 应该重试 / Network error - should retry
    if (error instanceof ccxt.NetworkError) { // 条件判断 error instanceof ccxt.NetworkError
      return true; // 返回结果
    } // 结束代码块

    // 请求超时 - 应该重试 / Request timeout - should retry
    if (error instanceof ccxt.RequestTimeout) { // 条件判断 error instanceof ccxt.RequestTimeout
      return true; // 返回结果
    } // 结束代码块

    // 交易所服务不可用 - 应该重试 / Exchange not available - should retry
    if (error instanceof ccxt.ExchangeNotAvailable) { // 条件判断 error instanceof ccxt.ExchangeNotAvailable
      return true; // 返回结果
    } // 结束代码块

    // DDoS 保护触发 - 应该重试 / DDoS protection triggered - should retry
    if (error instanceof ccxt.DDoSProtection) { // 条件判断 error instanceof ccxt.DDoSProtection
      return true; // 返回结果
    } // 结束代码块

    // 限速错误 - 应该重试 / Rate limit error - should retry
    if (error instanceof ccxt.RateLimitExceeded) { // 条件判断 error instanceof ccxt.RateLimitExceeded
      return true; // 返回结果
    } // 结束代码块

    // 不可重试的错误类型 / Non-retryable error types

    // 认证错误 - 不重试 / Authentication error - don't retry
    if (error instanceof ccxt.AuthenticationError) { // 条件判断 error instanceof ccxt.AuthenticationError
      return false; // 返回结果
    } // 结束代码块

    // 权限不足 - 不重试 / Permission denied - don't retry
    if (error instanceof ccxt.PermissionDenied) { // 条件判断 error instanceof ccxt.PermissionDenied
      return false; // 返回结果
    } // 结束代码块

    // 余额不足 - 不重试 / Insufficient funds - don't retry
    if (error instanceof ccxt.InsufficientFunds) { // 条件判断 error instanceof ccxt.InsufficientFunds
      return false; // 返回结果
    } // 结束代码块

    // 无效订单 - 不重试 / Invalid order - don't retry
    if (error instanceof ccxt.InvalidOrder) { // 条件判断 error instanceof ccxt.InvalidOrder
      return false; // 返回结果
    } // 结束代码块

    // 订单不存在 - 不重试 / Order not found - don't retry
    if (error instanceof ccxt.OrderNotFound) { // 条件判断 error instanceof ccxt.OrderNotFound
      return false; // 返回结果
    } // 结束代码块

    // 其他错误默认不重试 / Other errors don't retry by default
    return false; // 返回结果
  } // 结束代码块

  // ============================================
  // 私有方法 - 错误处理 / Private Methods - Error Handling
  // ============================================

  /**
   * 标准化错误
   * Normalize error
   * @param {Error} error - 原始错误 / Original error
   * @returns {Error} 标准化错误 / Normalized error
   * @private
   */
  _normalizeError(error) { // 调用 _normalizeError
    // 创建统一的错误对象 / Create unified error object
    // 处理 error 为 null 或 undefined 的情况 / Handle null or undefined error
    let errorMessage = 'Unknown error'; // 定义变量 errorMessage

    try { // 尝试执行
      if (error) { // 条件判断 error
        if (typeof error.message === 'string') { // 条件判断 typeof error.message === 'string'
          errorMessage = error.message; // 赋值 errorMessage
        } else if (typeof error === 'string') { // 执行语句
          errorMessage = error; // 赋值 errorMessage
        } else if (typeof error.toString === 'function') { // 执行语句
          const str = error.toString(); // 定义常量 str
          if (typeof str === 'string') { // 条件判断 typeof str === 'string'
            errorMessage = str; // 赋值 errorMessage
          } // 结束代码块
        } // 结束代码块
      } // 结束代码块
    } catch (e) { // 执行语句
      errorMessage = 'Error occurred (unable to extract message)'; // 赋值 errorMessage
    } // 结束代码块

    const normalizedError = new Error(errorMessage); // 定义常量 normalizedError

    // 错误类型 / Error type
    normalizedError.type = this._getErrorType(error); // 赋值 normalizedError.type

    // 错误代码 / Error code
    normalizedError.code = error.code || null; // 赋值 normalizedError.code

    // 交易所名称 / Exchange name
    normalizedError.exchange = this.name; // 赋值 normalizedError.exchange

    // HTTP 状态码 (如果有) / HTTP status code (if available)
    normalizedError.httpStatus = error.httpStatus || null; // 赋值 normalizedError.httpStatus

    // 是否可重试 / Is retryable
    normalizedError.retryable = this._shouldRetry(error, 0, 1); // 赋值 normalizedError.retryable

    // 时间戳 / Timestamp
    normalizedError.timestamp = Date.now(); // 赋值 normalizedError.timestamp

    // 原始错误 / Original error
    normalizedError.original = error; // 赋值 normalizedError.original

    // 返回标准化错误 / Return normalized error
    return normalizedError; // 返回结果
  } // 结束代码块

  /**
   * 获取错误类型
   * Get error type
   * @param {Error} error - 错误对象 / Error object
   * @returns {string} 错误类型 / Error type
   * @private
   */
  _getErrorType(error) { // 调用 _getErrorType
    // 如果 error 为空，返回未知错误 / If error is null, return unknown error
    if (!error) { // 条件判断 !error
      return 'UNKNOWN_ERROR'; // 返回结果
    } // 结束代码块

    // 根据 CCXT 错误类型判断 / Determine by CCXT error type
    if (error instanceof ccxt.AuthenticationError) { // 条件判断 error instanceof ccxt.AuthenticationError
      return 'AUTHENTICATION_ERROR';     // 认证错误 / Authentication error
    } // 结束代码块
    if (error instanceof ccxt.PermissionDenied) { // 条件判断 error instanceof ccxt.PermissionDenied
      return 'PERMISSION_DENIED';        // 权限不足 / Permission denied
    } // 结束代码块
    if (error instanceof ccxt.InsufficientFunds) { // 条件判断 error instanceof ccxt.InsufficientFunds
      return 'INSUFFICIENT_FUNDS';       // 余额不足 / Insufficient funds
    } // 结束代码块
    if (error instanceof ccxt.InvalidOrder) { // 条件判断 error instanceof ccxt.InvalidOrder
      return 'INVALID_ORDER';            // 无效订单 / Invalid order
    } // 结束代码块
    if (error instanceof ccxt.OrderNotFound) { // 条件判断 error instanceof ccxt.OrderNotFound
      return 'ORDER_NOT_FOUND';          // 订单不存在 / Order not found
    } // 结束代码块
    if (error instanceof ccxt.NetworkError) { // 条件判断 error instanceof ccxt.NetworkError
      return 'NETWORK_ERROR';            // 网络错误 / Network error
    } // 结束代码块
    if (error instanceof ccxt.RequestTimeout) { // 条件判断 error instanceof ccxt.RequestTimeout
      return 'REQUEST_TIMEOUT';          // 请求超时 / Request timeout
    } // 结束代码块
    if (error instanceof ccxt.RateLimitExceeded) { // 条件判断 error instanceof ccxt.RateLimitExceeded
      return 'RATE_LIMIT_EXCEEDED';      // 超过限速 / Rate limit exceeded
    } // 结束代码块
    if (error instanceof ccxt.ExchangeNotAvailable) { // 条件判断 error instanceof ccxt.ExchangeNotAvailable
      return 'EXCHANGE_NOT_AVAILABLE';   // 交易所不可用 / Exchange not available
    } // 结束代码块
    if (error instanceof ccxt.DDoSProtection) { // 条件判断 error instanceof ccxt.DDoSProtection
      return 'DDOS_PROTECTION';          // DDoS 保护 / DDoS protection
    } // 结束代码块
    if (error instanceof ccxt.ExchangeError) { // 条件判断 error instanceof ccxt.ExchangeError
      return 'EXCHANGE_ERROR';           // 交易所错误 / Exchange error
    } // 结束代码块

    // 未知错误 / Unknown error
    return 'UNKNOWN_ERROR'; // 返回结果
  } // 结束代码块

  /**
   * 创建自定义错误
   * Create custom error
   * @param {string} type - 错误类型 / Error type
   * @param {string} message - 错误消息 / Error message
   * @returns {Error} 错误对象 / Error object
   * @private
   */
  _createError(type, message) { // 调用 _createError
    const error = new Error(message); // 定义常量 error
    error.type = type; // 赋值 error.type
    error.exchange = this.name; // 赋值 error.exchange
    error.timestamp = Date.now(); // 赋值 error.timestamp
    return error; // 返回结果
  } // 结束代码块

  // ============================================
  // 私有方法 - 数据标准化 / Private Methods - Data Normalization
  // ============================================

  /**
   * 标准化订单格式
   * Normalize order format
   * @param {Object} order - 原始订单 / Raw order
   * @returns {UnifiedOrder} 统一格式订单 / Unified order
   * @private
   */
  _normalizeOrder(order) { // 调用 _normalizeOrder
    return { // 返回结果
      // 订单ID / Order ID
      id: order.id, // ID

      // 客户端订单ID / Client order ID
      clientOrderId: order.clientOrderId || null, // client订单ID

      // 交易对 / Symbol
      symbol: order.symbol, // 交易对

      // 买卖方向 / Side
      side: order.side, // 方向

      // 订单类型 / Order type
      type: order.type, // 类型订单类型

      // 订单数量 / Order amount
      amount: order.amount, // 订单数量

      // 订单价格 / Order price
      price: order.price, // 价格

      // 已成交数量 / Filled amount
      filled: order.filled || 0, // 已成交数量

      // 剩余数量 / Remaining amount
      remaining: order.remaining || (order.amount - (order.filled || 0)), // 剩余数量

      // 成交金额 / Cost
      cost: order.cost || 0, // cost

      // 平均成交价 / Average price
      average: order.average || order.price, // 平均

      // 订单状态 / Order status
      status: this._normalizeOrderStatus(order.status), // 状态订单状态

      // 手续费 / Fee
      fee: order.fee || null, // 手续费

      // 创建时间戳 / Creation timestamp
      timestamp: order.timestamp, // 时间戳

      // 创建时间 (ISO 字符串) / Creation datetime (ISO string)
      datetime: order.datetime, // 创建时间 (ISO 字符串)

      // 最后成交时间 / Last trade timestamp
      lastTradeTimestamp: order.lastTradeTimestamp || null, // last交易时间戳

      // 成交明细 / Trades
      trades: order.trades || [], // 成交

      // 交易所名称 / Exchange name
      exchange: this.name, // 交易所

      // 原始数据 / Raw data
      raw: order, // raw
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化持仓格式
   * Normalize position format
   * @param {Object} position - 原始持仓 / Raw position
   * @returns {Object} 统一格式持仓 / Unified position
   * @private
   */
  _normalizePosition(position) { // 调用 _normalizePosition
    return { // 返回结果
      // 交易对 / Symbol
      symbol: position.symbol, // 交易对

      // 持仓方向 / Position side
      side: position.side, // 方向

      // 持仓数量 (合约数) / Position size (contracts)
      contracts: position.contracts || 0, // 持仓数量 (合约数)

      // 持仓价值 / Notional value
      notional: position.notional || 0, // notional

      // 开仓均价 / Entry price
      entryPrice: position.entryPrice || 0, // 开仓均价

      // 标记价格 / Mark price
      markPrice: position.markPrice || 0, // mark价格

      // 清算价格 / Liquidation price
      liquidationPrice: position.liquidationPrice || 0, // 强平价格

      // 杠杆倍数 / Leverage
      leverage: position.leverage || 1, // 杠杆

      // 未实现盈亏 / Unrealized PnL
      unrealizedPnl: position.unrealizedPnl || 0, // 未实现盈亏

      // 未实现盈亏百分比 / Unrealized PnL percentage
      percentage: position.percentage || 0, // 未实现盈亏百分比

      // 已实现盈亏 / Realized PnL
      realizedPnl: position.realizedPnl || 0, // 已实现盈亏

      // 保证金模式 (cross/isolated) / Margin mode
      marginMode: position.marginMode || position.marginType || 'cross', // 保证金模式 (cross/isolated)

      // 保证金 / Collateral
      collateral: position.collateral || position.initialMargin || 0, // collateral

      // 交易所名称 / Exchange name
      exchange: this.name, // 交易所

      // 时间戳 / Timestamp
      timestamp: position.timestamp || Date.now(), // 时间戳

      // 原始数据 / Raw data
      raw: position, // raw
    }; // 结束代码块
  } // 结束代码块

  /**
   * 标准化订单状态
   * Normalize order status
   * @param {string} status - 原始状态 / Raw status
   * @returns {string} 统一状态 / Unified status
   * @private
   */
  _normalizeOrderStatus(status) { // 调用 _normalizeOrderStatus
    // 状态映射表 / Status mapping
    const statusMap = { // 定义常量 statusMap
      // 开放状态 / Open statuses
      'new': 'open', // new开放状态
      'NEW': 'open', // NEW
      'open': 'open', // 开盘
      'OPEN': 'open', // 开盘
      'partially_filled': 'open', // partiallyfilled
      'PARTIALLY_FILLED': 'open', // PARTIALLYFILLED

      // 完成状态 / Closed statuses
      'filled': 'closed', // filled完成状态
      'FILLED': 'closed', // FILLED
      'closed': 'closed', // closed
      'CLOSED': 'closed', // CLOSED权限

      // 取消状态 / Canceled statuses
      'canceled': 'canceled', // canceled取消状态
      'CANCELED': 'canceled', // CANCELED
      'cancelled': 'canceled', // cancelled
      'CANCELLED': 'canceled', // CANCELLED

      // 拒绝状态 / Rejected statuses
      'rejected': 'rejected', // rejected拒绝状态
      'REJECTED': 'rejected', // REJECTED

      // 过期状态 / Expired statuses
      'expired': 'expired', // expired过期状态
      'EXPIRED': 'expired', // EXPIRED
    }; // 结束代码块

    // 返回映射后的状态，默认为 open / Return mapped status, default to open
    return statusMap[status] || status || 'open'; // 返回结果
  } // 结束代码块

  // ============================================
  // 私有方法 - 验证和工具 / Private Methods - Validation and Utilities
  // ============================================

  /**
   * 确保已连接
   * Ensure connected
   * @private
   */
  _ensureConnected() { // 调用 _ensureConnected
    // 检查连接状态 / Check connection status
    if (!this.connected) { // 条件判断 !this.connected
      throw this._createError( // 抛出异常
        'NOT_CONNECTED', // 执行语句
        `[${this.name}] 未连接交易所，请先调用 connect() / Not connected, call connect() first` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块
  } // 结束代码块

  /**
   * 验证交易对
   * Validate symbol
   * @param {string} symbol - 交易对 / Trading pair
   * @private
   */
  _validateSymbol(symbol) { // 调用 _validateSymbol
    // 轻量模式下跳过验证 / Skip validation in lightweight mode
    if (Object.keys(this.markets).length === 0) { // 条件判断 Object.keys(this.markets).length === 0
      return; // 返回结果
    } // 结束代码块

    // 先尝试直接匹配 / Try direct match first
    if (this.markets[symbol]) { // 条件判断 this.markets[symbol]
      return; // 返回结果
    } // 结束代码块

    // 尝试自动转换格式后匹配 / Try match after auto format conversion
    const convertedSymbol = this._convertSymbolFormat(symbol); // 定义常量 convertedSymbol
    if (convertedSymbol && this.markets[convertedSymbol]) { // 条件判断 convertedSymbol && this.markets[convertedSymbol]
      return; // 返回结果
    } // 结束代码块

    // 都无法匹配，抛出错误 / Neither matched, throw error
    throw this._createError( // 抛出异常
      'INVALID_SYMBOL', // 执行语句
      `[${this.name}] 无效的交易对 / Invalid symbol: ${symbol}` // 执行语句
    ); // 结束调用或参数
  } // 结束代码块

  /**
   * 转换交易对格式 (自动匹配现货/永续格式)
   * Convert symbol format (auto match spot/perpetual format)
   *
   * 例如 / Examples:
   * - BTC/USDT -> BTC/USDT:USDT (如果 swap 市场存在 / if swap market exists)
   * - BTC/USDT:USDT -> BTC/USDT (如果 spot 市场存在 / if spot market exists)
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {string|null} 转换后的交易对或 null / Converted symbol or null
   * @private
   */
  _convertSymbolFormat(symbol) { // 调用 _convertSymbolFormat
    if (!symbol) return null; // 条件判断 !symbol

    // 轻量模式下使用 defaultType 进行格式转换 / In lightweight mode, use defaultType for format conversion
    const isLightweight = Object.keys(this.markets).length === 0; // 定义常量 isLightweight

    // 如果是永续格式 (包含 :)，尝试转换为现货格式
    // If perpetual format (contains :), try converting to spot format
    if (symbol.includes(':')) { // 条件判断 symbol.includes(':')
      const spotSymbol = symbol.split(':')[0]; // 定义常量 spotSymbol
      if (isLightweight) { // 条件判断 isLightweight
        // 轻量模式下，如果 defaultType 是 spot，直接返回现货格式
        // In lightweight mode, if defaultType is spot, return spot format
        if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
          return spotSymbol; // 返回结果
        } // 结束代码块
        return null; // 保持永续格式 / Keep perpetual format
      } // 结束代码块
      if (this.markets[spotSymbol]) { // 条件判断 this.markets[spotSymbol]
        return spotSymbol; // 返回结果
      } // 结束代码块
    } else { // 执行语句
      // 如果是现货格式，尝试转换为永续格式
      // If spot format, try converting to perpetual format

      if (isLightweight) { // 条件判断 isLightweight
        // 轻量模式下，如果 defaultType 是 swap/future，添加永续后缀
        // In lightweight mode, if defaultType is swap/future, add perpetual suffix
        if (this.config.defaultType === 'swap' || this.config.defaultType === 'future') { // 条件判断 this.config.defaultType === 'swap' || this.co...
          // 根据交易所选择正确的后缀 / Choose correct suffix based on exchange
          return symbol + ':USDT'; // 返回结果
        } // 结束代码块
        return null; // 保持现货格式 / Keep spot format
      } // 结束代码块

      // 尝试常见的永续合约后缀 / Try common perpetual suffixes
      const perpSuffixes = [':USDT', ':USD', ':BUSD']; // 定义常量 perpSuffixes
      for (const suffix of perpSuffixes) { // 循环 const suffix of perpSuffixes
        const perpSymbol = symbol + suffix; // 定义常量 perpSymbol
        if (this.markets[perpSymbol]) { // 条件判断 this.markets[perpSymbol]
          return perpSymbol; // 返回结果
        } // 结束代码块
      } // 结束代码块
    } // 结束代码块

    return null; // 返回结果
  } // 结束代码块

  /**
   * 获取有效的交易对 (自动格式转换)
   * Get valid symbol (with auto format conversion)
   *
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {string} 有效的交易对 / Valid symbol
   * @private
   */
  _getValidSymbol(symbol) { // 调用 _getValidSymbol
    // 轻量模式特殊处理 / Special handling for lightweight mode
    const isLightweight = Object.keys(this.markets).length === 0; // 定义常量 isLightweight

    if (isLightweight) { // 条件判断 isLightweight
      // 轻量模式下，根据 defaultType 和符号格式决定
      // In lightweight mode, decide based on defaultType and symbol format
      if (this.config.defaultType === 'swap' || this.config.defaultType === 'future') { // 条件判断 this.config.defaultType === 'swap' || this.co...
        // 永续合约模式 / Perpetual mode
        if (!symbol.includes(':')) { // 条件判断 !symbol.includes(':')
          // 现货格式，转为永续 / Spot format, convert to perpetual
          return symbol + ':USDT'; // 返回结果
        } // 结束代码块
      } else if (this.config.defaultType === 'spot') { // 执行语句
        // 现货模式 / Spot mode
        if (symbol.includes(':')) { // 条件判断 symbol.includes(':')
          // 永续格式，转为现货 / Perpetual format, convert to spot
          return symbol.split(':')[0]; // 返回结果
        } // 结束代码块
      } // 结束代码块
      return symbol; // 返回结果
    } // 结束代码块

    // 非轻量模式，检查市场映射 / Non-lightweight mode, check market mapping
    // 直接匹配 / Direct match
    if (this.markets[symbol]) { // 条件判断 this.markets[symbol]
      return symbol; // 返回结果
    } // 结束代码块

    // 尝试转换格式 / Try format conversion
    const convertedSymbol = this._convertSymbolFormat(symbol); // 定义常量 convertedSymbol
    if (convertedSymbol && this.markets[convertedSymbol]) { // 条件判断 convertedSymbol && this.markets[convertedSymbol]
      return convertedSymbol; // 返回结果
    } // 结束代码块

    // 返回原始格式 (让后续验证报错) / Return original (let validation throw error)
    return symbol; // 返回结果
  } // 结束代码块

  /**
   * 验证订单参数
   * Validate order parameters
   * @param {string} side - 方向 / Side
   * @param {string} type - 类型 / Type
   * @param {number} amount - 数量 / Amount
   * @param {number} price - 价格 / Price
   * @private
   */
  _validateOrderParams(side, type, amount, price) { // 调用 _validateOrderParams
    // 验证方向 / Validate side
    const validSides = ['buy', 'sell']; // 定义常量 validSides
    if (!validSides.includes(side?.toLowerCase())) { // 条件判断 !validSides.includes(side?.toLowerCase())
      throw this._createError( // 抛出异常
        'INVALID_SIDE', // 执行语句
        `[${this.name}] 无效的订单方向，应为 buy/sell / Invalid side: ${side}` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 验证类型 / Validate type
    const validTypes = ['market', 'limit', 'stop', 'stop_limit', 'stop_market']; // 定义常量 validTypes
    if (!validTypes.includes(type?.toLowerCase())) { // 条件判断 !validTypes.includes(type?.toLowerCase())
      throw this._createError( // 抛出异常
        'INVALID_TYPE', // 执行语句
        `[${this.name}] 无效的订单类型 / Invalid type: ${type}` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 验证数量 / Validate amount
    if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) { // 条件判断 typeof amount !== 'number' || amount <= 0 || ...
      throw this._createError( // 抛出异常
        'INVALID_AMOUNT', // 执行语句
        `[${this.name}] 无效的订单数量，必须为正数 / Invalid amount: ${amount}` // 执行语句
      ); // 结束调用或参数
    } // 结束代码块

    // 限价单必须有价格 / Limit order must have price
    if (type?.toLowerCase() === 'limit') { // 条件判断 type?.toLowerCase() === 'limit'
      if (typeof price !== 'number' || price <= 0 || !isFinite(price)) { // 条件判断 typeof price !== 'number' || price <= 0 || !i...
        throw this._createError( // 抛出异常
          'INVALID_PRICE', // 执行语句
          `[${this.name}] 限价单必须指定有效价格 / Limit order requires valid price: ${price}` // 执行语句
        ); // 结束调用或参数
      } // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 缓存精度信息
   * Cache precision info
   * @private
   */
  _cachePrecisions() { // 调用 _cachePrecisions
    // 遍历所有市场 / Iterate all markets
    for (const [symbol, market] of Object.entries(this.markets)) { // 循环 const [symbol, market] of Object.entries(this...
      // 保存精度信息 / Save precision info
      this.precisions[symbol] = { // 访问 precisions
        // 价格精度 / Price precision
        price: market.precision?.price || 8, // 价格

        // 数量精度 / Amount precision
        amount: market.precision?.amount || 8, // 数量精度

        // 最小订单数量 / Minimum order amount
        minAmount: market.limits?.amount?.min || 0, // 最小订单数量

        // 最大订单数量 / Maximum order amount
        maxAmount: market.limits?.amount?.max || Infinity, // 最大订单数量

        // 最小价格 / Minimum price
        minPrice: market.limits?.price?.min || 0, // 最小价格

        // 最大价格 / Maximum price
        maxPrice: market.limits?.price?.max || Infinity, // 最大价格

        // 最小成本/名义价值 / Minimum cost/notional
        minCost: market.limits?.cost?.min || 0, // 最小成本/名义价值
      }; // 结束代码块
    } // 结束代码块
  } // 结束代码块

  /**
   * 调整精度
   * Adjust precision
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} type - 类型 (price/amount) / Type
   * @param {number} value - 值 / Value
   * @returns {number} 调整后的值 / Adjusted value
   * @private
   */
  _adjustPrecision(symbol, type, value) { // 调用 _adjustPrecision
    // 获取精度 / Get precision
    const precision = this.precisions[symbol]?.[type]; // 定义常量 precision

    // 如果没有精度信息，返回原值 / If no precision info, return original value
    if (precision === undefined) { // 条件判断 precision === undefined
      return value; // 返回结果
    } // 结束代码块

    // 根据精度类型处理 / Handle based on precision type
    if (Number.isInteger(precision)) { // 条件判断 Number.isInteger(precision)
      // 如果精度是整数，表示小数位数 / If precision is integer, it's decimal places
      const multiplier = Math.pow(10, precision); // 定义常量 multiplier
      // 向下取整以避免超出余额 / Floor to avoid exceeding balance
      return Math.floor(value * multiplier) / multiplier; // 返回结果
    } else { // 执行语句
      // 如果精度是小数，表示最小变动单位 / If precision is decimal, it's tick size
      return Math.floor(value / precision) * precision; // 返回结果
    } // 结束代码块
  } // 结束代码块

  /**
   * 延迟函数
   * Sleep function
   * @param {number} ms - 毫秒数 / Milliseconds
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) { // 调用 _sleep
    return new Promise(resolve => setTimeout(resolve, ms)); // 返回结果
  } // 结束代码块
} // 结束代码块

// 默认导出 / Default export
export default BaseExchange; // 默认导出
