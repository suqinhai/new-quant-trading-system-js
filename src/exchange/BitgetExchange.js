/**
 * Bitget 交易所实现
 * Bitget Exchange Implementation
 *
 * 继承自 BaseExchange，实现 Bitget 特定的功能
 * Extends BaseExchange to implement Bitget-specific functionality
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt'; // 导入模块 ccxt

// 导入基类 / Import base class
import { BaseExchange } from './BaseExchange.js'; // 导入模块 ./BaseExchange.js

/**
 * Bitget 交易所类
 * Bitget Exchange Class
 */
export class BitgetExchange extends BaseExchange { // 导出类 BitgetExchange
  /**
   * 构造函数
   * Constructor
   * @param {Object} config - 配置对象 / Configuration object
   * @param {string} config.apiKey - API 密钥 / API key
   * @param {string} config.secret - API 密钥 / API secret
   * @param {string} config.password - API 密码 (passphrase) / API password (passphrase)
   * @param {boolean} config.sandbox - 是否使用测试网 / Whether to use testnet
   * @param {string} config.defaultType - 交易类型 ('spot' | 'swap' | 'future') / Trading type
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(config); // 调用父类

    // 设置交易所名称 / Set exchange name
    this.name = 'bitget'; // 设置 name
  } // 结束代码块

  /**
   * 创建 CCXT 交易所实例 (覆盖父类方法)
   * Create CCXT exchange instance (override parent method)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() { // 调用 _createExchange
    // 构建配置对象 / Build configuration object
    const exchangeConfig = { // 定义常量 exchangeConfig
      // 是否启用速率限制 / Whether to enable rate limiting
      enableRateLimit: this.config.enableRateLimit, // 设置 enableRateLimit 字段

      // 超时设置 (毫秒) / Timeout settings (milliseconds)
      timeout: this.config.timeout, // 设置 timeout 字段

      // 配置选项 / Configuration options
      options: { // 设置 options 字段
        // 默认交易类型 / Default trading type
        // spot = 现货 / Spot trading
        // swap = 永续合约 / Perpetual swap
        // future = 交割合约 / Delivery futures
        defaultType: this.config.defaultType, // 设置 defaultType 字段

        // 调整时间戳 (解决服务器时间差问题) / Adjust timestamp
        adjustForTimeDifference: true, // 设置 adjustForTimeDifference 字段

        // Bitget 需要设置市场类型 / Bitget requires market type
        // USDT 合约使用 'umcbl' / USDT contracts use 'umcbl'
        // 币本位合约使用 'dmcbl' / Coin-margined contracts use 'dmcbl'
        defaultSubType: 'linear', // 设置 defaultSubType 字段

        // 合并额外选项 / Merge additional options
        ...this.config.options, // 展开对象或数组
      }, // 结束代码块
    }; // 结束代码块

    // 沙盒模式处理 / Sandbox mode handling
    if (this.config.sandbox) { // 条件判断 this.config.sandbox
      // Bitget 测试网配置 / Bitget testnet configuration
      exchangeConfig.options.sandboxMode = true; // 赋值 exchangeConfig.options.sandboxMode
      console.log(`[${this.name}] 沙盒模式: 使用测试网 / Sandbox mode: Using testnet`); // 控制台输出
    } // 结束代码块

    // 只在有值时添加 API 认证信息 / Only add API auth when values exist
    if (!this.config.sandbox) { // 条件判断 !this.config.sandbox
      if (this.config.apiKey && typeof this.config.apiKey === 'string' && this.config.apiKey.length > 0) { // 条件判断 this.config.apiKey && typeof this.config.apiK...
        exchangeConfig.apiKey = this.config.apiKey; // 赋值 exchangeConfig.apiKey
      } // 结束代码块
      if (this.config.secret && typeof this.config.secret === 'string' && this.config.secret.length > 0) { // 条件判断 this.config.secret && typeof this.config.secr...
        exchangeConfig.secret = this.config.secret; // 赋值 exchangeConfig.secret
      } // 结束代码块
      // Bitget 需要 passphrase / Bitget requires passphrase
      if (this.config.password && typeof this.config.password === 'string' && this.config.password.length > 0) { // 条件判断 this.config.password && typeof this.config.pa...
        exchangeConfig.password = this.config.password; // 赋值 exchangeConfig.password
      } // 结束代码块
    } else { // 执行语句
      console.log(`[${this.name}] 沙盒模式: 不使用 API 密钥 (使用公开端点) / Sandbox mode: Not using API keys (using public endpoints)`); // 控制台输出
    } // 结束代码块

    // 只在有值时添加代理设置 / Only add proxy when value exists
    if (this.config.proxy) { // 条件判断 this.config.proxy
      exchangeConfig.proxy = this.config.proxy; // 赋值 exchangeConfig.proxy
    } // 结束代码块

    // 创建并返回 CCXT 交易所实例 / Create and return CCXT exchange instance
    // Bitget 在 CCXT 中使用 'bitget' 类 / Bitget uses 'bitget' class in CCXT
    return new ccxt.bitget(exchangeConfig); // 返回结果
  } // 结束代码块

  // ============================================
  // Bitget 特有方法 / Bitget-Specific Methods
  // ============================================

  /**
   * 获取 Bitget 服务器时间
   * Get Bitget server time
   * @returns {Promise<number>} 服务器时间戳 / Server timestamp
   */
  async fetchServerTime() { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 获取服务器时间 / Fetch server time
      const response = await this.exchange.publicSpotGetPublicTime(); // 定义常量 response

      // 返回服务器时间戳 (毫秒) / Return server timestamp (milliseconds)
      return parseInt(response.data.serverTime); // 返回结果
    }, '获取服务器时间 / Fetch server time'); // 执行语句
  } // 结束代码块

  /**
   * 获取交易手续费率
   * Get trading fee rate
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 手续费信息 / Fee information
   */
  async fetchTradingFee(symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取手续费 / Call CCXT to fetch trading fee
      const fee = await this.exchange.fetchTradingFee(symbol); // 定义常量 fee

      // 返回统一格式的手续费信息 / Return unified fee info
      return { // 返回结果
        symbol,                    // 交易对 / Trading pair
        maker: fee.maker,          // 挂单手续费率 / Maker fee rate
        taker: fee.taker,          // 吃单手续费率 / Taker fee rate
        exchange: this.name,       // 交易所名称 / Exchange name
        timestamp: Date.now(),     // 时间戳 / Timestamp
      }; // 结束代码块
    }, `获取手续费 / Fetch trading fee: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 获取历史资金费率
   * Get historical funding rates
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 历史资金费率列表 / Historical funding rate list
   */
  async fetchFundingRateHistory(symbol, since = undefined, limit = 100) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      // 现货不支持资金费率 / Spot doesn't support funding rate
      throw this._createError('UNSUPPORTED', '资金费率仅适用于合约交易 / Funding rate only available for futures'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取历史资金费率 / Call CCXT to fetch funding rate history
      const history = await this.exchange.fetchFundingRateHistory(symbol, since, limit); // 定义常量 history

      // 转换为统一格式 / Convert to unified format
      return history.map(item => ({ // 返回结果
        symbol: item.symbol,              // 交易对 / Trading pair
        fundingRate: item.fundingRate,    // 资金费率 / Funding rate
        timestamp: item.timestamp,        // 时间戳 / Timestamp
        datetime: item.datetime,          // ISO 时间 / ISO datetime
        exchange: this.name,              // 交易所名称 / Exchange name
      })); // 结束代码块
    }, `获取历史资金费率 / Fetch funding rate history: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 设置持仓模式 (单向/双向)
   * Set position mode (one-way/hedge)
   * @param {boolean} hedgeMode - 是否使用对冲模式 / Whether to use hedge mode
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setPositionMode(hedgeMode = false) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      // 现货不支持持仓模式 / Spot doesn't support position mode
      throw this._createError('UNSUPPORTED', '持仓模式仅适用于合约交易 / Position mode only available for futures'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      try { // 尝试执行
        // Bitget 使用 setPositionMode 方法 / Bitget uses setPositionMode method
        // hedgeMode = true -> 双向持仓 / Dual position mode (hedge)
        // hedgeMode = false -> 单向持仓 / Single position mode (one-way)
        const result = await this.exchange.setPositionMode(hedgeMode); // 定义常量 result

        // 发出持仓模式设置事件 / Emit position mode set event
        this.emit('positionModeSet', { hedgeMode, exchange: this.name }); // 调用 emit

        // 记录日志 / Log
        console.log(`[${this.name}] ✓ 持仓模式已设置 / Position mode set: ${hedgeMode ? '双向/Hedge' : '单向/One-way'}`); // 控制台输出

        // 返回结果 / Return result
        return result; // 返回结果

      } catch (error) { // 执行语句
        // 如果错误是因为已经是该模式，则返回成功 / If already in that mode, return success
        if (error.message && (error.message.includes('No need to change') || error.message.includes('same') || error.message.includes('already'))) { // 条件判断 error.message && (error.message.includes('No ...
          console.log(`[${this.name}] ✓ 持仓模式无需更改 / Position mode already set`); // 控制台输出
          return { success: true, message: 'Position mode already set' }; // 返回结果
        } // 结束代码块

        // 其他错误继续抛出 / Throw other errors
        throw error; // 抛出异常
      } // 结束代码块
    }, `设置持仓模式 / Set position mode: ${hedgeMode}`); // 执行语句
  } // 结束代码块

  /**
   * 设置保证金模式 (逐仓/全仓)
   * Set margin mode (isolated/cross)
   * @param {string} marginMode - 保证金模式 ('isolated' | 'cross') / Margin mode
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setMarginMode(marginMode, symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      // 现货不支持保证金模式 / Spot doesn't support margin mode
      throw this._createError('UNSUPPORTED', '保证金模式仅适用于合约交易 / Margin mode only available for futures'); // 抛出异常
    } // 结束代码块

    // 验证保证金模式参数 / Validate margin mode parameter
    const validModes = ['isolated', 'cross']; // 定义常量 validModes
    if (!validModes.includes(marginMode?.toLowerCase())) { // 条件判断 !validModes.includes(marginMode?.toLowerCase())
      throw this._createError('INVALID_PARAM', `无效的保证金模式 / Invalid margin mode: ${marginMode}`); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      try { // 尝试执行
        // 调用 CCXT 设置保证金模式 / Call CCXT to set margin mode
        const result = await this.exchange.setMarginMode(marginMode, symbol); // 定义常量 result

        // 发出保证金模式设置事件 / Emit margin mode set event
        this.emit('marginModeSet', { symbol, marginMode, exchange: this.name }); // 调用 emit

        // 记录日志 / Log
        console.log(`[${this.name}] ✓ 保证金模式已设置 / Margin mode set: ${symbol} ${marginMode}`); // 控制台输出

        // 返回结果 / Return result
        return result; // 返回结果

      } catch (error) { // 执行语句
        // 如果错误是因为已经是该模式，则返回成功 / If already in that mode, return success
        if (error.message && (error.message.includes('No need to change') || error.message.includes('same') || error.message.includes('already'))) { // 条件判断 error.message && (error.message.includes('No ...
          console.log(`[${this.name}] ✓ 保证金模式无需更改 / Margin mode already set`); // 控制台输出
          return { success: true, message: 'Margin mode already set' }; // 返回结果
        } // 结束代码块

        // 其他错误继续抛出 / Throw other errors
        throw error; // 抛出异常
      } // 结束代码块
    }, `设置保证金模式 / Set margin mode: ${symbol} ${marginMode}`); // 执行语句
  } // 结束代码块

  /**
   * 获取标记价格
   * Get mark price
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 标记价格信息 / Mark price info
   */
  async fetchMarkPrice(symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      throw this._createError('UNSUPPORTED', '标记价格仅适用于合约交易 / Mark price only available for futures'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取标记价格 / Call CCXT to fetch mark price
      const ticker = await this.exchange.fetchMarkPrice(symbol); // 定义常量 ticker

      return { // 返回结果
        symbol: ticker.symbol, // 设置 symbol 字段
        markPrice: ticker.markPrice, // 设置 markPrice 字段
        indexPrice: ticker.indexPrice || null, // 设置 indexPrice 字段
        timestamp: ticker.timestamp, // 设置 timestamp 字段
        datetime: ticker.datetime, // 设置 datetime 字段
        exchange: this.name, // 设置 exchange 字段
      }; // 结束代码块
    }, `获取标记价格 / Fetch mark price: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 创建止盈止损订单
   * Create take profit / stop loss order
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 买卖方向 ('buy' | 'sell') / Side
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @param {number} options.stopPrice - 触发价格 / Trigger price
   * @param {string} options.stopType - 止损类型 ('stop_loss' | 'take_profit') / Stop type
   * @returns {Promise<Object>} 订单信息 / Order information
   */
  async createStopOrder(symbol, side, amount, options = {}) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 验证必要参数 / Validate required parameters
    if (!options.stopPrice) { // 条件判断 !options.stopPrice
      throw this._createError('INVALID_PARAM', '止损订单必须指定触发价格 / Stop order requires stopPrice'); // 抛出异常
    } // 结束代码块

    // 记录日志 / Log
    console.log(`[${this.name}] 创建止损订单 / Creating stop order:`, { // 控制台输出
      symbol, // 执行语句
      side, // 执行语句
      amount, // 执行语句
      stopPrice: options.stopPrice, // 设置 stopPrice 字段
      stopType: options.stopType || 'stop_loss', // 设置 stopType 字段
    }); // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调整数量精度 / Adjust amount precision
      const adjustedAmount = this._adjustPrecision(symbol, 'amount', amount); // 定义常量 adjustedAmount

      // 构建订单参数 / Build order parameters
      const params = { // 定义常量 params
        stopPrice: options.stopPrice, // 设置 stopPrice 字段
        triggerPrice: options.stopPrice, // 设置 triggerPrice 字段
      }; // 结束代码块

      // 确定订单类型 / Determine order type
      const orderType = options.stopType === 'take_profit' ? 'takeProfit' : 'stopLoss'; // 定义常量 orderType

      // 调用 CCXT 创建止损订单 / Call CCXT to create stop order
      const order = await this.exchange.createOrder( // 定义常量 order
        symbol, // 执行语句
        orderType, // 执行语句
        side, // 执行语句
        adjustedAmount, // 执行语句
        undefined,  // 市价单不需要价格 / Market order doesn't need price
        params // 执行语句
      ); // 结束调用或参数

      // 转换为统一格式 / Convert to unified format
      const unifiedOrder = this._normalizeOrder(order); // 定义常量 unifiedOrder

      // 发出止损订单创建事件 / Emit stop order created event
      this.emit('stopOrderCreated', unifiedOrder); // 调用 emit

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 止损订单创建成功 / Stop order created: ${unifiedOrder.id}`); // 控制台输出

      // 返回统一格式订单 / Return unified order
      return unifiedOrder; // 返回结果
    }, `创建止损订单 / Create stop order: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 获取账户交易历史
   * Get account trade history
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 交易历史 / Trade history
   */
  async fetchMyTrades(symbol, since = undefined, limit = 100) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取交易历史 / Call CCXT to fetch trade history
      const trades = await this.exchange.fetchMyTrades(symbol, since, limit); // 定义常量 trades

      // 返回交易历史 / Return trade history
      return trades.map(trade => ({ // 返回结果
        id: trade.id, // 设置 id 字段
        orderId: trade.order, // 设置 orderId 字段
        symbol: trade.symbol, // 设置 symbol 字段
        side: trade.side, // 设置 side 字段
        price: trade.price, // 设置 price 字段
        amount: trade.amount, // 设置 amount 字段
        cost: trade.cost, // 设置 cost 字段
        fee: trade.fee, // 设置 fee 字段
        timestamp: trade.timestamp, // 设置 timestamp 字段
        datetime: trade.datetime, // 设置 datetime 字段
        exchange: this.name, // 设置 exchange 字段
      })); // 结束代码块
    }, `获取交易历史 / Fetch my trades: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 获取提现历史
   * Get withdrawal history
   * @param {string} code - 币种代码 (可选) / Currency code (optional)
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 提现历史 / Withdrawal history
   */
  async fetchWithdrawalHistory(code = undefined, since = undefined, limit = 100) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      const withdrawals = await this.exchange.fetchWithdrawals(code, since, limit); // 定义常量 withdrawals

      return withdrawals.map(w => ({ // 返回结果
        id: w.id, // 设置 id 字段
        txid: w.txid, // 设置 txid 字段
        currency: w.currency, // 设置 currency 字段
        amount: w.amount, // 设置 amount 字段
        fee: w.fee, // 设置 fee 字段
        status: w.status, // 设置 status 字段
        address: w.address, // 设置 address 字段
        tag: w.tag, // 设置 tag 字段
        timestamp: w.timestamp, // 设置 timestamp 字段
        datetime: w.datetime, // 设置 datetime 字段
        exchange: this.name, // 设置 exchange 字段
      })); // 结束代码块
    }, '获取提现历史 / Fetch withdrawal history'); // 执行语句
  } // 结束代码块

  /**
   * 获取充值历史
   * Get deposit history
   * @param {string} code - 币种代码 (可选) / Currency code (optional)
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 充值历史 / Deposit history
   */
  async fetchDepositHistory(code = undefined, since = undefined, limit = 100) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      const deposits = await this.exchange.fetchDeposits(code, since, limit); // 定义常量 deposits

      return deposits.map(d => ({ // 返回结果
        id: d.id, // 设置 id 字段
        txid: d.txid, // 设置 txid 字段
        currency: d.currency, // 设置 currency 字段
        amount: d.amount, // 设置 amount 字段
        status: d.status, // 设置 status 字段
        address: d.address, // 设置 address 字段
        tag: d.tag, // 设置 tag 字段
        timestamp: d.timestamp, // 设置 timestamp 字段
        datetime: d.datetime, // 设置 datetime 字段
        exchange: this.name, // 设置 exchange 字段
      })); // 结束代码块
    }, '获取充值历史 / Fetch deposit history'); // 执行语句
  } // 结束代码块

  /**
   * 获取所有币种信息
   * Get all currencies info
   * @returns {Promise<Object>} 币种信息 / Currencies info
   */
  async fetchCurrencies() { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      return await this.exchange.fetchCurrencies(); // 返回结果
    }, '获取币种信息 / Fetch currencies'); // 执行语句
  } // 结束代码块

  /**
   * 获取当前资金费率
   * Get current funding rate
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 资金费率信息 / Funding rate info
   */
  async fetchFundingRate(symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      throw this._createError('UNSUPPORTED', '资金费率仅适用于合约交易 / Funding rate only available for futures'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取资金费率 / Call CCXT to fetch funding rate
      const fundingRate = await this.exchange.fetchFundingRate(symbol); // 定义常量 fundingRate

      return { // 返回结果
        symbol: fundingRate.symbol, // 设置 symbol 字段
        fundingRate: fundingRate.fundingRate, // 设置 fundingRate 字段
        fundingTimestamp: fundingRate.fundingTimestamp, // 设置 fundingTimestamp 字段
        fundingDatetime: fundingRate.fundingDatetime, // 设置 fundingDatetime 字段
        nextFundingRate: fundingRate.nextFundingRate || null, // 设置 nextFundingRate 字段
        nextFundingTimestamp: fundingRate.nextFundingTimestamp || null, // 设置 nextFundingTimestamp 字段
        timestamp: fundingRate.timestamp, // 设置 timestamp 字段
        datetime: fundingRate.datetime, // 设置 datetime 字段
        exchange: this.name, // 设置 exchange 字段
      }; // 结束代码块
    }, `获取资金费率 / Fetch funding rate: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 获取持仓信息 (覆盖父类以支持 Bitget 特有参数)
   * Fetch positions (override parent for Bitget-specific params)
   * @param {Array<string>} symbols - 交易对列表 / Symbol list
   * @returns {Promise<Array>} 持仓列表 / Position list
   */
  async fetchPositions(symbols = undefined) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      throw this._createError('UNSUPPORTED', '持仓查询仅适用于合约交易 / Position query only available for futures'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取持仓 / Call CCXT to fetch positions
      const positions = await this.exchange.fetchPositions(symbols); // 定义常量 positions

      // 过滤并转换为统一格式 / Filter and convert to unified format
      return positions // 返回结果
        .filter(pos => parseFloat(pos.contracts) !== 0) // 定义箭头函数
        .map(pos => this._normalizePosition(pos)); // 定义箭头函数
    }, '获取持仓 / Fetch positions'); // 执行语句
  } // 结束代码块

  /**
   * 获取订单簿
   * Get order book
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} limit - 深度限制 / Depth limit
   * @returns {Promise<Object>} 订单簿 / Order book
   */
  async fetchOrderBook(symbol, limit = 20) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      const orderBook = await this.exchange.fetchOrderBook(symbol, limit); // 定义常量 orderBook

      return { // 返回结果
        symbol, // 执行语句
        bids: orderBook.bids, // 设置 bids 字段
        asks: orderBook.asks, // 设置 asks 字段
        timestamp: orderBook.timestamp, // 设置 timestamp 字段
        datetime: orderBook.datetime, // 设置 datetime 字段
        nonce: orderBook.nonce, // 设置 nonce 字段
        exchange: this.name, // 设置 exchange 字段
      }; // 结束代码块
    }, `获取订单簿 / Fetch order book: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 获取最近成交
   * Get recent trades
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 成交列表 / Trade list
   */
  async fetchTrades(symbol, limit = 100) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      const trades = await this.exchange.fetchTrades(symbol, undefined, limit); // 定义常量 trades

      return trades.map(trade => ({ // 返回结果
        id: trade.id, // 设置 id 字段
        symbol: trade.symbol, // 设置 symbol 字段
        side: trade.side, // 设置 side 字段
        price: trade.price, // 设置 price 字段
        amount: trade.amount, // 设置 amount 字段
        cost: trade.cost, // 设置 cost 字段
        timestamp: trade.timestamp, // 设置 timestamp 字段
        datetime: trade.datetime, // 设置 datetime 字段
        exchange: this.name, // 设置 exchange 字段
      })); // 结束代码块
    }, `获取最近成交 / Fetch trades: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 设置杠杆 (覆盖父类以支持 Bitget 特有参数)
   * Set leverage (override parent for Bitget-specific params)
   * @param {number} leverage - 杠杆倍数 / Leverage
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} params - 额外参数 / Additional params
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setLeverage(leverage, symbol, params = {}) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      throw this._createError('UNSUPPORTED', '杠杆设置仅适用于合约交易 / Leverage only available for futures'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 设置杠杆 / Call CCXT to set leverage
      const result = await this.exchange.setLeverage(leverage, symbol, params); // 定义常量 result

      // 发出杠杆设置事件 / Emit leverage set event
      this.emit('leverageSet', { symbol, leverage, exchange: this.name }); // 调用 emit

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 杠杆已设置 / Leverage set: ${symbol} ${leverage}x`); // 控制台输出

      return result; // 返回结果
    }, `设置杠杆 / Set leverage: ${symbol} ${leverage}x`); // 执行语句
  } // 结束代码块
} // 结束代码块

// 默认导出 / Default export
export default BitgetExchange; // 默认导出
