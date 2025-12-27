/**
 * 交易所基类
 * Base Exchange Class
 *
 * 提供交易所的统一接口抽象，支持自动重试和统一错误处理
 * Provides unified interface abstraction for exchanges with auto-retry and unified error handling
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt';

// 导入事件发射器 / Import EventEmitter
import EventEmitter from 'eventemitter3';

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
export class BaseExchange extends EventEmitter {
  /**
   * 构造函数
   * Constructor
   * @param {Object} config - 配置对象 / Configuration object
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super();

    // 交易所名称 (子类必须覆盖) / Exchange name (must be overridden by subclass)
    this.name = 'base';

    // 配置参数 / Configuration parameters
    this.config = {
      // API 密钥 / API key
      apiKey: config.apiKey || null,

      // API 密钥 / API secret
      secret: config.secret || null,

      // API 密码 (OKX 等需要) / API password (required by OKX, etc.)
      password: config.password || null,

      // 是否使用沙盒/测试网 / Whether to use sandbox/testnet
      sandbox: config.sandbox || false,

      // 默认交易类型: spot/swap/future / Default trade type
      defaultType: config.defaultType || 'swap',

      // 请求超时时间 (毫秒) / Request timeout (ms)
      timeout: config.timeout || 30000,

      // 是否启用限速 / Whether to enable rate limiting
      enableRateLimit: config.enableRateLimit !== false,

      // 最大重试次数 / Maximum retry attempts
      maxRetries: config.maxRetries || 3,

      // 重试基础延迟 (毫秒) / Base retry delay (ms)
      retryDelay: config.retryDelay || 1000,

      // 代理设置 / Proxy settings
      proxy: config.proxy || null,

      // 额外选项 / Additional options
      options: config.options || {},
    };

    // CCXT 交易所实例 / CCXT exchange instance
    this.exchange = null;

    // 连接状态 / Connection status
    this.connected = false;

    // 市场信息缓存 / Market info cache
    this.markets = {};

    // 精度信息缓存 / Precision info cache
    this.precisions = {};
  }

  /**
   * 连接交易所 (包含初始化和验证)
   * Connect to exchange (includes initialization and verification)
   * @returns {Promise<boolean>} 连接结果 / Connection result
   */
  async connect() {
    // 记录日志 / Log
    console.log(`[${this.name}] 正在连接交易所... / Connecting to exchange...`);

    // 调试：打印配置信息 / Debug: print config info
    console.log(`[${this.name}] 配置信息 / Config info:`, {
      hasApiKey: !!this.config.apiKey,
      hasSecret: !!this.config.secret,
      hasPassword: !!this.config.password,
      sandbox: this.config.sandbox,
      defaultType: this.config.defaultType,
    });

    try {
      // 1. 创建 CCXT 实例 / Create CCXT instance
      this.exchange = this._createExchange();

      // 2. 设置沙盒模式 (如果子类没有在 _createExchange 中处理) / Set sandbox mode (if subclass didn't handle it in _createExchange)
      // 检查是否已经设置了 sandboxMode 选项 / Check if sandboxMode option is already set
      const alreadySandbox = this.exchange.options?.sandboxMode === true;
      if (this.config.sandbox && this.exchange.setSandboxMode && !alreadySandbox) {
        // 启用沙盒/测试网 / Enable sandbox/testnet
        this.exchange.setSandboxMode(true);
        console.log(`[${this.name}] 已启用沙盒模式 (via setSandboxMode) / Sandbox mode enabled (via setSandboxMode)`);
      } else if (this.config.sandbox) {
        console.log(`[${this.name}] 沙盒模式已在创建时配置 / Sandbox mode configured during creation`);
      }

      // 3. 加载市场信息 (带重试) / Load market info (with retry)
      await this._executeWithRetry(async () => {
        // 获取所有交易对信息 / Fetch all trading pair info
        this.markets = await this.exchange.loadMarkets();
      }, '加载市场信息 / Load markets');

      // 4. 缓存精度信息 / Cache precision info
      this._cachePrecisions();

      // 5. 验证 API 连接 (带重试) / Verify API connection (with retry)
      // 只在非沙盒模式 或 明确要求验证时才验证 API / Only verify API in non-sandbox mode or when explicitly requested
      // 沙盒/测试网的 API 密钥通常与主网不同 / Sandbox/testnet API keys are usually different from mainnet
      const shouldVerifyApi = this.config.apiKey && this.config.secret && !this.config.skipApiVerification;
      if (shouldVerifyApi) {
        try {
          await this._executeWithRetry(async () => {
            // 获取账户余额来验证连接 / Fetch balance to verify connection
            await this.exchange.fetchBalance();
          }, '验证 API 连接 / Verify API connection');
        } catch (apiError) {
          // 如果是沙盒模式且 API 验证失败，发出警告但不阻止连接 / If sandbox mode and API verification fails, warn but don't block
          if (this.config.sandbox) {
            console.warn(`[${this.name}] ⚠ API 验证失败，但沙盒模式将继续 / API verification failed, but sandbox mode will continue`);
            console.warn(`[${this.name}]   注意：部分功能可能受限 / Note: Some features may be limited`);
            console.warn(`[${this.name}]   提示：如需完整功能，请使用测试网专用 API 密钥 / Tip: Use testnet-specific API keys for full functionality`);
          } else {
            // 非沙盒模式，继续抛出错误 / Non-sandbox mode, continue to throw error
            throw apiError;
          }
        }
      }

      // 6. 更新连接状态 / Update connection status
      this.connected = true;

      // 7. 发出连接成功事件 / Emit connected event
      this.emit('connected', { exchange: this.name });

      // 8. 记录日志 / Log
      console.log(`[${this.name}] ✓ 连接成功，加载了 ${Object.keys(this.markets).length} 个交易对`);
      console.log(`[${this.name}] ✓ Connected, loaded ${Object.keys(this.markets).length} markets`);

      // 返回连接结果 / Return connection result
      return true;

    } catch (error) {
      // 更新连接状态 / Update connection status
      this.connected = false;

      // 调试：打印原始错误信息 / Debug: print raw error info
      console.error(`[${this.name}] 原始错误 / Raw error:`, {
        message: error?.message,
        name: error?.name,
        code: error?.code,
        type: typeof error,
      });
      // 打印完整堆栈 / Print full stack trace
      console.error(`[${this.name}] 完整堆栈 / Full stack trace:`);
      console.error(error?.stack);

      // 发出错误事件 / Emit error event
      this.emit('error', { type: 'connect', error: this._normalizeError(error) });

      // 记录错误 / Log error
      console.error(`[${this.name}] ✗ 连接失败 / Connection failed:`, error?.message || 'Unknown error');

      // 抛出标准化错误 / Throw normalized error
      throw this._normalizeError(error);
    }
  }

  /**
   * 获取账户余额
   * Fetch account balance
   * @returns {Promise<Object>} 统一格式的余额信息 / Unified balance info
   */
  async fetchBalance() {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取余额 / Call CCXT to fetch balance
      const balance = await this.exchange.fetchBalance();

      // 返回统一格式的余额 / Return unified balance format
      return {
        // 总余额 (包括冻结) / Total balance (including frozen)
        total: balance.total || {},

        // 可用余额 / Available balance
        free: balance.free || {},

        // 冻结/已用余额 / Frozen/Used balance
        used: balance.used || {},

        // 交易所名称 / Exchange name
        exchange: this.name,

        // 时间戳 / Timestamp
        timestamp: Date.now(),

        // 原始数据 / Raw data
        raw: balance,
      };
    }, '获取余额 / Fetch balance');
  }

  /**
   * 获取持仓信息 (合约/永续)
   * Fetch positions (futures/swap)
   * @param {string[]} symbols - 交易对列表 (可选) / Symbol list (optional)
   * @returns {Promise<Object[]>} 统一格式的持仓列表 / Unified position list
   */
  async fetchPositions(symbols = undefined) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 检查交易所是否支持 / Check if exchange supports this
    if (!this.exchange.has['fetchPositions']) {
      // 返回空数组 / Return empty array
      console.warn(`[${this.name}] 该交易所不支持获取持仓 / Exchange does not support fetchPositions`);
      return [];
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取持仓 / Call CCXT to fetch positions
      const positions = await this.exchange.fetchPositions(symbols);

      // 过滤有效持仓并转换为统一格式 / Filter valid positions and convert to unified format
      return positions
        .filter(pos => {
          // 过滤掉空仓位 / Filter out empty positions
          const contracts = Math.abs(pos.contracts || 0);
          const notional = Math.abs(pos.notional || 0);
          return contracts > 0 || notional > 0;
        })
        .map(pos => this._normalizePosition(pos));
    }, '获取持仓 / Fetch positions');
  }

  /**
   * 获取资金费率
   * Fetch funding rate
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 统一格式的资金费率信息 / Unified funding rate info
   */
  async fetchFundingRate(symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 检查交易所是否支持 / Check if exchange supports this
    if (!this.exchange.has['fetchFundingRate']) {
      throw this._createError('UNSUPPORTED', '该交易所不支持获取资金费率 / Exchange does not support fetchFundingRate');
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取资金费率 / Call CCXT to fetch funding rate
      const fundingRate = await this.exchange.fetchFundingRate(symbol);

      // 返回统一格式 / Return unified format
      return {
        // 交易对 / Symbol
        symbol: fundingRate.symbol,

        // 当前资金费率 / Current funding rate
        fundingRate: fundingRate.fundingRate,

        // 预测资金费率 / Predicted funding rate
        fundingRatePredicted: fundingRate.fundingRatePredicted || null,

        // 下次结算时间戳 / Next funding timestamp
        fundingTimestamp: fundingRate.fundingTimestamp,

        // 下次结算时间 (ISO 字符串) / Next funding datetime (ISO string)
        fundingDatetime: fundingRate.fundingDatetime,

        // 标记价格 / Mark price
        markPrice: fundingRate.markPrice || null,

        // 指数价格 / Index price
        indexPrice: fundingRate.indexPrice || null,

        // 交易所名称 / Exchange name
        exchange: this.name,

        // 当前时间戳 / Current timestamp
        timestamp: Date.now(),

        // 原始数据 / Raw data
        raw: fundingRate,
      };
    }, `获取资金费率 / Fetch funding rate: ${symbol}`);
  }

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
  async createOrder(symbol, side, type, amount, price = undefined, params = {}) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 验证订单参数 / Validate order parameters
    this._validateOrderParams(side, type, amount, price);

    // 调整数量精度 / Adjust amount precision
    const adjustedAmount = this._adjustPrecision(symbol, 'amount', amount);

    // 调整价格精度 (如果有价格) / Adjust price precision (if price exists)
    const adjustedPrice = price ? this._adjustPrecision(symbol, 'price', price) : undefined;

    // 记录日志 / Log
    console.log(`[${this.name}] 创建订单 / Creating order:`, {
      symbol,
      side,
      type,
      amount: adjustedAmount,
      price: adjustedPrice,
      params,
    });

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 创建订单 / Call CCXT to create order
      const order = await this.exchange.createOrder(
        symbol,           // 交易对 / Symbol
        type,             // 订单类型 / Order type
        side,             // 买卖方向 / Side
        adjustedAmount,   // 数量 / Amount
        adjustedPrice,    // 价格 / Price
        params            // 额外参数 / Additional params
      );

      // 转换为统一格式 / Convert to unified format
      const unifiedOrder = this._normalizeOrder(order);

      // 发出订单创建事件 / Emit order created event
      this.emit('orderCreated', unifiedOrder);

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 订单创建成功 / Order created: ${unifiedOrder.id}`);

      // 返回统一格式订单 / Return unified order
      return unifiedOrder;
    }, `创建订单 / Create order: ${symbol} ${side} ${type}`);
  }

  /**
   * 取消所有订单
   * Cancel all orders
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 取消结果 / Cancellation result
   */
  async cancelAllOrders(symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 记录日志 / Log
    console.log(`[${this.name}] 取消所有订单 / Canceling all orders: ${symbol}`);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 结果对象 / Result object
      const result = {
        symbol,                     // 交易对 / Symbol
        exchange: this.name,        // 交易所 / Exchange
        canceledCount: 0,           // 取消数量 / Canceled count
        failedCount: 0,             // 失败数量 / Failed count
        orders: [],                 // 订单详情 / Order details
        timestamp: Date.now(),      // 时间戳 / Timestamp
      };

      // 检查交易所是否原生支持批量取消 / Check if exchange natively supports batch cancel
      if (this.exchange.has['cancelAllOrders']) {
        // 直接调用批量取消 API / Call batch cancel API directly
        const response = await this.exchange.cancelAllOrders(symbol);

        // 更新结果 / Update result
        result.canceledCount = Array.isArray(response) ? response.length : 1;
        result.orders = Array.isArray(response) ? response : [response];
        result.raw = response;

      } else {
        // 不支持批量取消，逐个取消 / Batch cancel not supported, cancel one by one

        // 先获取所有未完成订单 / First fetch all open orders
        const openOrders = await this.exchange.fetchOpenOrders(symbol);

        // 逐个取消订单 / Cancel orders one by one
        for (const order of openOrders) {
          try {
            // 取消单个订单 / Cancel single order
            await this.exchange.cancelOrder(order.id, symbol);

            // 成功计数 / Success count
            result.canceledCount++;

            // 添加到详情 / Add to details
            result.orders.push({
              id: order.id,
              status: 'canceled',
              success: true,
            });

          } catch (error) {
            // 失败计数 / Failed count
            result.failedCount++;

            // 添加到详情 / Add to details
            result.orders.push({
              id: order.id,
              status: 'failed',
              success: false,
              error: error.message,
            });
          }
        }
      }

      // 发出订单取消事件 / Emit orders canceled event
      this.emit('allOrdersCanceled', result);

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 已取消 ${result.canceledCount} 个订单 / Canceled ${result.canceledCount} orders`);
      if (result.failedCount > 0) {
        console.warn(`[${this.name}] ⚠ ${result.failedCount} 个订单取消失败 / ${result.failedCount} orders failed to cancel`);
      }

      // 返回结果 / Return result
      return result;
    }, `取消所有订单 / Cancel all orders: ${symbol}`);
  }

  /**
   * 取消单个订单
   * Cancel single order
   * @param {string} orderId - 订单ID / Order ID
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<UnifiedOrder>} 统一格式的取消订单 / Unified canceled order
   */
  async cancelOrder(orderId, symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 记录日志 / Log
    console.log(`[${this.name}] 取消订单 / Canceling order: ${orderId}`);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 取消订单 / Call CCXT to cancel order
      const order = await this.exchange.cancelOrder(orderId, symbol);

      // 转换为统一格式 / Convert to unified format
      const unifiedOrder = this._normalizeOrder(order);

      // 发出订单取消事件 / Emit order canceled event
      this.emit('orderCanceled', unifiedOrder);

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 订单已取消 / Order canceled: ${orderId}`);

      // 返回统一格式订单 / Return unified order
      return unifiedOrder;
    }, `取消订单 / Cancel order: ${orderId}`);
  }

  /**
   * 获取订单信息
   * Fetch order info
   * @param {string} orderId - 订单ID / Order ID
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<UnifiedOrder>} 统一格式的订单 / Unified order
   */
  async fetchOrder(orderId, symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取订单 / Call CCXT to fetch order
      const order = await this.exchange.fetchOrder(orderId, symbol);

      // 转换为统一格式 / Convert to unified format
      return this._normalizeOrder(order);
    }, `获取订单 / Fetch order: ${orderId}`);
  }

  /**
   * 获取未完成订单
   * Fetch open orders
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @returns {Promise<UnifiedOrder[]>} 统一格式的订单列表 / Unified order list
   */
  async fetchOpenOrders(symbol = undefined) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取未完成订单 / Call CCXT to fetch open orders
      const orders = await this.exchange.fetchOpenOrders(symbol);

      // 转换为统一格式 / Convert to unified format
      return orders.map(order => this._normalizeOrder(order));
    }, `获取未完成订单 / Fetch open orders: ${symbol || 'all'}`);
  }

  /**
   * 获取 K 线数据
   * Fetch OHLCV data
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} timeframe - 时间周期 / Timeframe
   * @param {number} since - 开始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} K 线数据 / OHLCV data
   */
  async fetchOHLCV(symbol, timeframe = '1h', since = undefined, limit = 100) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取 K 线 / Call CCXT to fetch OHLCV
      return await this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
    }, `获取 K 线 / Fetch OHLCV: ${symbol} ${timeframe}`);
  }

  /**
   * 获取当前行情
   * Fetch ticker
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 行情数据 / Ticker data
   */
  async fetchTicker(symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取行情 / Call CCXT to fetch ticker
      return await this.exchange.fetchTicker(symbol);
    }, `获取行情 / Fetch ticker: ${symbol}`);
  }

  /**
   * 设置杠杆倍数
   * Set leverage
   * @param {number} leverage - 杠杆倍数 / Leverage
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setLeverage(leverage, symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 检查交易所是否支持 / Check if exchange supports this
    if (!this.exchange.has['setLeverage']) {
      throw this._createError('UNSUPPORTED', '该交易所不支持设置杠杆 / Exchange does not support setLeverage');
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 设置杠杆 / Call CCXT to set leverage
      const result = await this.exchange.setLeverage(leverage, symbol);

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 杠杆已设置 / Leverage set: ${symbol} ${leverage}x`);

      return result;
    }, `设置杠杆 / Set leverage: ${symbol} ${leverage}x`);
  }

  /**
   * 关闭连接
   * Close connection
   */
  async close() {
    // 记录日志 / Log
    console.log(`[${this.name}] 关闭连接 / Closing connection`);

    // 更新连接状态 / Update connection status
    this.connected = false;

    // 关闭 CCXT 连接 (如果支持) / Close CCXT connection (if supported)
    if (this.exchange && typeof this.exchange.close === 'function') {
      await this.exchange.close();
    }

    // 发出断开连接事件 / Emit disconnected event
    this.emit('disconnected', { exchange: this.name });
  }

  /**
   * 断开连接 (close 的别名)
   * Disconnect (alias for close)
   */
  async disconnect() {
    return this.close();
  }

  /**
   * 获取交易对精度信息
   * Get precision info for a symbol
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Object} 精度信息 / Precision info
   */
  getPrecision(symbol) {
    return this.precisions[symbol] || null;
  }

  // ============================================
  // 受保护方法 (子类必须实现) / Protected Methods (must be implemented by subclass)
  // ============================================

  /**
   * 创建 CCXT 交易所实例 (子类必须实现)
   * Create CCXT exchange instance (must be implemented by subclass)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() {
    // 抛出错误，提示子类必须实现 / Throw error, subclass must implement
    throw new Error('子类必须实现 _createExchange 方法 / Subclass must implement _createExchange');
  }

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
  async _executeWithRetry(fn, operation = 'unknown') {
    // 当前重试次数 / Current retry count
    let attempt = 0;

    // 最大重试次数 / Max retries
    const maxRetries = this.config.maxRetries;

    // 基础延迟 / Base delay
    const baseDelay = this.config.retryDelay;

    // 循环重试 / Retry loop
    while (true) {
      try {
        // 尝试执行函数 / Try to execute function
        return await fn();

      } catch (error) {
        // 增加重试次数 / Increment retry count
        attempt++;

        // 判断是否需要重试 / Determine if retry is needed
        const shouldRetry = this._shouldRetry(error, attempt, maxRetries);

        // 如果不需要重试，抛出标准化的错误 / If no retry needed, throw normalized error
        if (!shouldRetry) {
          // 调试：打印原始 ccxt 错误的完整信息 / Debug: print full original ccxt error info
          console.error(`[${this.name}] ❌ ${operation} 原始错误详情 / Original error details:`);
          console.error(`[${this.name}]   消息 / Message: ${error?.message}`);
          console.error(`[${this.name}]   名称 / Name: ${error?.name}`);
          console.error(`[${this.name}]   代码 / Code: ${error?.code}`);
          console.error(`[${this.name}]   原始堆栈 / Original stack:`);
          console.error(error?.stack);

          // 发出错误事件 / Emit error event
          this.emit('error', {
            type: 'request',
            operation,
            error: this._normalizeError(error),
            originalStack: error?.stack,  // 保留原始堆栈 / Keep original stack
          });

          // 创建标准化错误并保留原始堆栈 / Create normalized error and keep original stack
          const normalizedError = this._normalizeError(error);
          normalizedError.originalStack = error?.stack;

          // 抛出错误 / Throw error
          throw normalizedError;
        }

        // 计算指数退避延迟 / Calculate exponential backoff delay
        // 公式: delay = baseDelay * 2^(attempt-1) / Formula: delay = baseDelay * 2^(attempt-1)
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

        // 添加随机抖动 (0-25%) 防止惊群效应 / Add random jitter (0-25%) to prevent thundering herd
        const jitter = exponentialDelay * Math.random() * 0.25;

        // 最终延迟，最大 30 秒 / Final delay, max 30 seconds
        const finalDelay = Math.min(exponentialDelay + jitter, 30000);

        // 记录重试日志 / Log retry
        console.warn(`[${this.name}] ⚠ ${operation} 失败，${Math.round(finalDelay)}ms 后重试 (${attempt}/${maxRetries})`);
        console.warn(`[${this.name}] ⚠ ${operation} failed, retrying in ${Math.round(finalDelay)}ms (${attempt}/${maxRetries})`);
        console.warn(`[${this.name}]   错误 / Error: ${error.message}`);

        // 发出重试事件 / Emit retry event
        this.emit('retry', {
          operation,
          attempt,
          maxRetries,
          delay: finalDelay,
          error: error.message,
        });

        // 等待延迟 / Wait for delay
        await this._sleep(finalDelay);
      }
    }
  }

  /**
   * 判断是否应该重试
   * Determine if should retry
   * @param {Error} error - 错误对象 / Error object
   * @param {number} attempt - 当前重试次数 / Current attempt
   * @param {number} maxRetries - 最大重试次数 / Max retries
   * @returns {boolean} 是否重试 / Whether to retry
   * @private
   */
  _shouldRetry(error, attempt, maxRetries) {
    // 超过最大重试次数，不重试 / Exceeded max retries, don't retry
    if (attempt >= maxRetries) {
      return false;
    }

    // 可重试的错误类型 / Retryable error types

    // 网络错误 - 应该重试 / Network error - should retry
    if (error instanceof ccxt.NetworkError) {
      return true;
    }

    // 请求超时 - 应该重试 / Request timeout - should retry
    if (error instanceof ccxt.RequestTimeout) {
      return true;
    }

    // 交易所服务不可用 - 应该重试 / Exchange not available - should retry
    if (error instanceof ccxt.ExchangeNotAvailable) {
      return true;
    }

    // DDoS 保护触发 - 应该重试 / DDoS protection triggered - should retry
    if (error instanceof ccxt.DDoSProtection) {
      return true;
    }

    // 限速错误 - 应该重试 / Rate limit error - should retry
    if (error instanceof ccxt.RateLimitExceeded) {
      return true;
    }

    // 不可重试的错误类型 / Non-retryable error types

    // 认证错误 - 不重试 / Authentication error - don't retry
    if (error instanceof ccxt.AuthenticationError) {
      return false;
    }

    // 权限不足 - 不重试 / Permission denied - don't retry
    if (error instanceof ccxt.PermissionDenied) {
      return false;
    }

    // 余额不足 - 不重试 / Insufficient funds - don't retry
    if (error instanceof ccxt.InsufficientFunds) {
      return false;
    }

    // 无效订单 - 不重试 / Invalid order - don't retry
    if (error instanceof ccxt.InvalidOrder) {
      return false;
    }

    // 订单不存在 - 不重试 / Order not found - don't retry
    if (error instanceof ccxt.OrderNotFound) {
      return false;
    }

    // 其他错误默认不重试 / Other errors don't retry by default
    return false;
  }

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
  _normalizeError(error) {
    // 创建统一的错误对象 / Create unified error object
    // 处理 error 为 null 或 undefined 的情况 / Handle null or undefined error
    let errorMessage = 'Unknown error';

    try {
      if (error) {
        if (typeof error.message === 'string') {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (typeof error.toString === 'function') {
          const str = error.toString();
          if (typeof str === 'string') {
            errorMessage = str;
          }
        }
      }
    } catch (e) {
      errorMessage = 'Error occurred (unable to extract message)';
    }

    const normalizedError = new Error(errorMessage);

    // 错误类型 / Error type
    normalizedError.type = this._getErrorType(error);

    // 错误代码 / Error code
    normalizedError.code = error.code || null;

    // 交易所名称 / Exchange name
    normalizedError.exchange = this.name;

    // HTTP 状态码 (如果有) / HTTP status code (if available)
    normalizedError.httpStatus = error.httpStatus || null;

    // 是否可重试 / Is retryable
    normalizedError.retryable = this._shouldRetry(error, 0, 1);

    // 时间戳 / Timestamp
    normalizedError.timestamp = Date.now();

    // 原始错误 / Original error
    normalizedError.original = error;

    // 返回标准化错误 / Return normalized error
    return normalizedError;
  }

  /**
   * 获取错误类型
   * Get error type
   * @param {Error} error - 错误对象 / Error object
   * @returns {string} 错误类型 / Error type
   * @private
   */
  _getErrorType(error) {
    // 如果 error 为空，返回未知错误 / If error is null, return unknown error
    if (!error) {
      return 'UNKNOWN_ERROR';
    }

    // 根据 CCXT 错误类型判断 / Determine by CCXT error type
    if (error instanceof ccxt.AuthenticationError) {
      return 'AUTHENTICATION_ERROR';     // 认证错误 / Authentication error
    }
    if (error instanceof ccxt.PermissionDenied) {
      return 'PERMISSION_DENIED';        // 权限不足 / Permission denied
    }
    if (error instanceof ccxt.InsufficientFunds) {
      return 'INSUFFICIENT_FUNDS';       // 余额不足 / Insufficient funds
    }
    if (error instanceof ccxt.InvalidOrder) {
      return 'INVALID_ORDER';            // 无效订单 / Invalid order
    }
    if (error instanceof ccxt.OrderNotFound) {
      return 'ORDER_NOT_FOUND';          // 订单不存在 / Order not found
    }
    if (error instanceof ccxt.NetworkError) {
      return 'NETWORK_ERROR';            // 网络错误 / Network error
    }
    if (error instanceof ccxt.RequestTimeout) {
      return 'REQUEST_TIMEOUT';          // 请求超时 / Request timeout
    }
    if (error instanceof ccxt.RateLimitExceeded) {
      return 'RATE_LIMIT_EXCEEDED';      // 超过限速 / Rate limit exceeded
    }
    if (error instanceof ccxt.ExchangeNotAvailable) {
      return 'EXCHANGE_NOT_AVAILABLE';   // 交易所不可用 / Exchange not available
    }
    if (error instanceof ccxt.DDoSProtection) {
      return 'DDOS_PROTECTION';          // DDoS 保护 / DDoS protection
    }
    if (error instanceof ccxt.ExchangeError) {
      return 'EXCHANGE_ERROR';           // 交易所错误 / Exchange error
    }

    // 未知错误 / Unknown error
    return 'UNKNOWN_ERROR';
  }

  /**
   * 创建自定义错误
   * Create custom error
   * @param {string} type - 错误类型 / Error type
   * @param {string} message - 错误消息 / Error message
   * @returns {Error} 错误对象 / Error object
   * @private
   */
  _createError(type, message) {
    const error = new Error(message);
    error.type = type;
    error.exchange = this.name;
    error.timestamp = Date.now();
    return error;
  }

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
  _normalizeOrder(order) {
    return {
      // 订单ID / Order ID
      id: order.id,

      // 客户端订单ID / Client order ID
      clientOrderId: order.clientOrderId || null,

      // 交易对 / Symbol
      symbol: order.symbol,

      // 买卖方向 / Side
      side: order.side,

      // 订单类型 / Order type
      type: order.type,

      // 订单数量 / Order amount
      amount: order.amount,

      // 订单价格 / Order price
      price: order.price,

      // 已成交数量 / Filled amount
      filled: order.filled || 0,

      // 剩余数量 / Remaining amount
      remaining: order.remaining || (order.amount - (order.filled || 0)),

      // 成交金额 / Cost
      cost: order.cost || 0,

      // 平均成交价 / Average price
      average: order.average || order.price,

      // 订单状态 / Order status
      status: this._normalizeOrderStatus(order.status),

      // 手续费 / Fee
      fee: order.fee || null,

      // 创建时间戳 / Creation timestamp
      timestamp: order.timestamp,

      // 创建时间 (ISO 字符串) / Creation datetime (ISO string)
      datetime: order.datetime,

      // 最后成交时间 / Last trade timestamp
      lastTradeTimestamp: order.lastTradeTimestamp || null,

      // 成交明细 / Trades
      trades: order.trades || [],

      // 交易所名称 / Exchange name
      exchange: this.name,

      // 原始数据 / Raw data
      raw: order,
    };
  }

  /**
   * 标准化持仓格式
   * Normalize position format
   * @param {Object} position - 原始持仓 / Raw position
   * @returns {Object} 统一格式持仓 / Unified position
   * @private
   */
  _normalizePosition(position) {
    return {
      // 交易对 / Symbol
      symbol: position.symbol,

      // 持仓方向 / Position side
      side: position.side,

      // 持仓数量 (合约数) / Position size (contracts)
      contracts: position.contracts || 0,

      // 持仓价值 / Notional value
      notional: position.notional || 0,

      // 开仓均价 / Entry price
      entryPrice: position.entryPrice || 0,

      // 标记价格 / Mark price
      markPrice: position.markPrice || 0,

      // 清算价格 / Liquidation price
      liquidationPrice: position.liquidationPrice || 0,

      // 杠杆倍数 / Leverage
      leverage: position.leverage || 1,

      // 未实现盈亏 / Unrealized PnL
      unrealizedPnl: position.unrealizedPnl || 0,

      // 未实现盈亏百分比 / Unrealized PnL percentage
      percentage: position.percentage || 0,

      // 已实现盈亏 / Realized PnL
      realizedPnl: position.realizedPnl || 0,

      // 保证金模式 (cross/isolated) / Margin mode
      marginMode: position.marginMode || position.marginType || 'cross',

      // 保证金 / Collateral
      collateral: position.collateral || position.initialMargin || 0,

      // 交易所名称 / Exchange name
      exchange: this.name,

      // 时间戳 / Timestamp
      timestamp: position.timestamp || Date.now(),

      // 原始数据 / Raw data
      raw: position,
    };
  }

  /**
   * 标准化订单状态
   * Normalize order status
   * @param {string} status - 原始状态 / Raw status
   * @returns {string} 统一状态 / Unified status
   * @private
   */
  _normalizeOrderStatus(status) {
    // 状态映射表 / Status mapping
    const statusMap = {
      // 开放状态 / Open statuses
      'new': 'open',
      'NEW': 'open',
      'open': 'open',
      'OPEN': 'open',
      'partially_filled': 'open',
      'PARTIALLY_FILLED': 'open',

      // 完成状态 / Closed statuses
      'filled': 'closed',
      'FILLED': 'closed',
      'closed': 'closed',
      'CLOSED': 'closed',

      // 取消状态 / Canceled statuses
      'canceled': 'canceled',
      'CANCELED': 'canceled',
      'cancelled': 'canceled',
      'CANCELLED': 'canceled',

      // 拒绝状态 / Rejected statuses
      'rejected': 'rejected',
      'REJECTED': 'rejected',

      // 过期状态 / Expired statuses
      'expired': 'expired',
      'EXPIRED': 'expired',
    };

    // 返回映射后的状态，默认为 open / Return mapped status, default to open
    return statusMap[status] || status || 'open';
  }

  // ============================================
  // 私有方法 - 验证和工具 / Private Methods - Validation and Utilities
  // ============================================

  /**
   * 确保已连接
   * Ensure connected
   * @private
   */
  _ensureConnected() {
    // 检查连接状态 / Check connection status
    if (!this.connected) {
      throw this._createError(
        'NOT_CONNECTED',
        `[${this.name}] 未连接交易所，请先调用 connect() / Not connected, call connect() first`
      );
    }
  }

  /**
   * 验证交易对
   * Validate symbol
   * @param {string} symbol - 交易对 / Trading pair
   * @private
   */
  _validateSymbol(symbol) {
    // 检查交易对是否存在 / Check if symbol exists
    if (!this.markets[symbol]) {
      throw this._createError(
        'INVALID_SYMBOL',
        `[${this.name}] 无效的交易对 / Invalid symbol: ${symbol}`
      );
    }
  }

  /**
   * 验证订单参数
   * Validate order parameters
   * @param {string} side - 方向 / Side
   * @param {string} type - 类型 / Type
   * @param {number} amount - 数量 / Amount
   * @param {number} price - 价格 / Price
   * @private
   */
  _validateOrderParams(side, type, amount, price) {
    // 验证方向 / Validate side
    const validSides = ['buy', 'sell'];
    if (!validSides.includes(side?.toLowerCase())) {
      throw this._createError(
        'INVALID_SIDE',
        `[${this.name}] 无效的订单方向，应为 buy/sell / Invalid side: ${side}`
      );
    }

    // 验证类型 / Validate type
    const validTypes = ['market', 'limit', 'stop', 'stop_limit', 'stop_market'];
    if (!validTypes.includes(type?.toLowerCase())) {
      throw this._createError(
        'INVALID_TYPE',
        `[${this.name}] 无效的订单类型 / Invalid type: ${type}`
      );
    }

    // 验证数量 / Validate amount
    if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
      throw this._createError(
        'INVALID_AMOUNT',
        `[${this.name}] 无效的订单数量，必须为正数 / Invalid amount: ${amount}`
      );
    }

    // 限价单必须有价格 / Limit order must have price
    if (type?.toLowerCase() === 'limit') {
      if (typeof price !== 'number' || price <= 0 || !isFinite(price)) {
        throw this._createError(
          'INVALID_PRICE',
          `[${this.name}] 限价单必须指定有效价格 / Limit order requires valid price: ${price}`
        );
      }
    }
  }

  /**
   * 缓存精度信息
   * Cache precision info
   * @private
   */
  _cachePrecisions() {
    // 遍历所有市场 / Iterate all markets
    for (const [symbol, market] of Object.entries(this.markets)) {
      // 保存精度信息 / Save precision info
      this.precisions[symbol] = {
        // 价格精度 / Price precision
        price: market.precision?.price || 8,

        // 数量精度 / Amount precision
        amount: market.precision?.amount || 8,

        // 最小订单数量 / Minimum order amount
        minAmount: market.limits?.amount?.min || 0,

        // 最大订单数量 / Maximum order amount
        maxAmount: market.limits?.amount?.max || Infinity,

        // 最小价格 / Minimum price
        minPrice: market.limits?.price?.min || 0,

        // 最大价格 / Maximum price
        maxPrice: market.limits?.price?.max || Infinity,

        // 最小成本/名义价值 / Minimum cost/notional
        minCost: market.limits?.cost?.min || 0,
      };
    }
  }

  /**
   * 调整精度
   * Adjust precision
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} type - 类型 (price/amount) / Type
   * @param {number} value - 值 / Value
   * @returns {number} 调整后的值 / Adjusted value
   * @private
   */
  _adjustPrecision(symbol, type, value) {
    // 获取精度 / Get precision
    const precision = this.precisions[symbol]?.[type];

    // 如果没有精度信息，返回原值 / If no precision info, return original value
    if (precision === undefined) {
      return value;
    }

    // 根据精度类型处理 / Handle based on precision type
    if (Number.isInteger(precision)) {
      // 如果精度是整数，表示小数位数 / If precision is integer, it's decimal places
      const multiplier = Math.pow(10, precision);
      // 向下取整以避免超出余额 / Floor to avoid exceeding balance
      return Math.floor(value * multiplier) / multiplier;
    } else {
      // 如果精度是小数，表示最小变动单位 / If precision is decimal, it's tick size
      return Math.floor(value / precision) * precision;
    }
  }

  /**
   * 延迟函数
   * Sleep function
   * @param {number} ms - 毫秒数 / Milliseconds
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 默认导出 / Default export
export default BaseExchange;
