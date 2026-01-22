/**
 * Binance 交易所实现
 * Binance Exchange Implementation
 *
 * 继承自 BaseExchange，实现 Binance 特定的功能
 * Extends BaseExchange to implement Binance-specific functionality
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt'; // 导入模块 ccxt

// 导入基类 / Import base class
import { BaseExchange } from './BaseExchange.js'; // 导入模块 ./BaseExchange.js

/**
 * Binance 交易所类
 * Binance Exchange Class
 */
export class BinanceExchange extends BaseExchange { // 导出类 BinanceExchange
  /**
   * 构造函数
   * Constructor
   * @param {Object} config - 配置对象 / Configuration object
   * @param {string} config.apiKey - API 密钥 / API key
   * @param {string} config.secret - API 密钥 / API secret
   * @param {boolean} config.sandbox - 是否使用测试网 / Whether to use testnet
   * @param {string} config.defaultType - 交易类型 ('spot' | 'future' | 'swap') / Trading type
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(config); // 调用父类

    // 设置交易所名称 / Set exchange name
    this.name = 'binance'; // 设置 name
  } // 结束代码块

  /**
   * 创建 CCXT 交易所实例 (覆盖父类方法)
   * Create CCXT exchange instance (override parent method)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() { // 调用 _createExchange
    // 根据交易类型选择不同的 CCXT 类 / Select CCXT class based on trading type
    // spot = 现货 / Spot trading
    // swap = U 本位永续合约 / USDT-margined perpetual
    // future = U 本位交割合约 / USDT-margined futures
    const ExchangeClass = this.config.defaultType === 'spot' // 定义常量 ExchangeClass
      ? ccxt.binance           // 现货交易 / Spot trading
      : ccxt.binanceusdm;      // U 本位合约 (包含 swap 和 future) / USDT-margined (swap and future)

    // 构建配置对象 / Build configuration object
    const exchangeConfig = { // 定义常量 exchangeConfig
      // 是否启用速率限制 / Whether to enable rate limiting
      enableRateLimit: this.config.enableRateLimit, // 是否启用速率限制

      // 超时设置 (毫秒) / Timeout settings (milliseconds)
      timeout: this.config.timeout, // 超时设置 (毫秒)

      // 配置选项 / Configuration options
      options: { // options
        // 默认交易类型 / Default trading type
        defaultType: this.config.defaultType, // 默认类型默认交易类型

        // 调整时间戳 (解决服务器时间差问题) / Adjust timestamp (solve server time difference)
        adjustForTimeDifference: true, // 调整时间戳 (解决服务器时间差问题)

        // 接收窗口 (毫秒)，防止时间戳过期 / Receive window (ms), prevent timestamp expiry
        recvWindow: 10000, // 接收窗口 (毫秒)，防止时间戳过期

        // 合并额外选项 / Merge additional options
        ...this.config.options, // 展开对象或数组
      }, // 结束代码块
    }; // 结束代码块

    // 沙盒模式处理 / Sandbox mode handling
    if (this.config.sandbox) { // 条件判断 this.config.sandbox
      // 对于 binanceusdm (USDT-M 合约)，设置测试网 URL / For binanceusdm (USDT-M futures), set testnet URLs
      if (this.config.defaultType !== 'spot') { // 条件判断 this.config.defaultType !== 'spot'
        exchangeConfig.options.sandboxMode = true; // 赋值 exchangeConfig.options.sandboxMode
        // 设置测试网 hostname / Set testnet hostname
        exchangeConfig.hostname = 'testnet.binancefuture.com'; // 赋值 exchangeConfig.hostname
      } // 结束代码块
      // 沙盒模式下不传递 API 密钥（除非是测试网专用密钥）/ In sandbox mode, don't pass API keys (unless testnet-specific)
      // 主网 API 密钥在测试网会返回 Invalid Api-Key ID / Mainnet API keys return Invalid Api-Key ID on testnet
      console.log(`[${this.name}] 沙盒模式: 不使用 API 密钥 (使用公开端点) / Sandbox mode: Not using API keys (using public endpoints)`); // 控制台输出
    } else { // 执行语句
      // 只在有值时添加 API 认证信息 / Only add API auth when values exist
      // 避免传递 null/undefined 导致 CCXT 内部错误 / Avoid passing null/undefined causing CCXT internal errors
      if (this.config.apiKey && typeof this.config.apiKey === 'string' && this.config.apiKey.length > 0) { // 条件判断 this.config.apiKey && typeof this.config.apiK...
        exchangeConfig.apiKey = this.config.apiKey; // 赋值 exchangeConfig.apiKey
      } // 结束代码块
      if (this.config.secret && typeof this.config.secret === 'string' && this.config.secret.length > 0) { // 条件判断 this.config.secret && typeof this.config.secr...
        exchangeConfig.secret = this.config.secret; // 赋值 exchangeConfig.secret
      } // 结束代码块
    } // 结束代码块

    // 只在有值时添加代理设置 / Only add proxy when value exists
    if (this.config.proxy) { // 条件判断 this.config.proxy
      exchangeConfig.proxy = this.config.proxy; // 赋值 exchangeConfig.proxy
    } // 结束代码块

    // 创建并返回 CCXT 交易所实例 / Create and return CCXT exchange instance
    return new ExchangeClass(exchangeConfig); // 返回结果
  } // 结束代码块

  // ============================================
  // Binance 特有方法 / Binance-Specific Methods
  // ============================================

  /**
   * 获取 Binance 服务器时间
   * Get Binance server time
   * @returns {Promise<number>} 服务器时间戳 / Server timestamp
   */
  async fetchServerTime() { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 获取服务器时间 / Fetch server time
      const response = await this.exchange.publicGetTime(); // 定义常量 response

      // 返回服务器时间戳 / Return server timestamp
      return response.serverTime; // 返回结果
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
        // 设置持仓模式 / Set position mode
        // hedgeMode: true = 双向持仓 (long_short_mode), false = 单向持仓 (net_mode)
        // hedgeMode: true = hedge mode, false = one-way mode
        const result = await this.exchange.fapiPrivatePostPositionSideDual({ // 定义常量 result
          dualSidePosition: hedgeMode.toString(), // dual方向持仓
        }); // 结束代码块

        // 发出持仓模式设置事件 / Emit position mode set event
        this.emit('positionModeSet', { hedgeMode, exchange: this.name }); // 调用 emit

        // 记录日志 / Log
        console.log(`[${this.name}] ✓ 持仓模式已设置 / Position mode set: ${hedgeMode ? '双向/Hedge' : '单向/One-way'}`); // 控制台输出

        // 返回结果 / Return result
        return result; // 返回结果

      } catch (error) { // 执行语句
        // 如果错误是因为已经是该模式，则返回成功 / If already in that mode, return success
        if (error.message && error.message.includes('No need to change')) { // 条件判断 error.message && error.message.includes('No n...
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
        if (error.message && error.message.includes('No need to change')) { // 条件判断 error.message && error.message.includes('No n...
          console.log(`[${this.name}] ✓ 保证金模式无需更改 / Margin mode already set`); // 控制台输出
          return { success: true, message: 'Margin mode already set' }; // 返回结果
        } // 结束代码块

        // 其他错误继续抛出 / Throw other errors
        throw error; // 抛出异常
      } // 结束代码块
    }, `设置保证金模式 / Set margin mode: ${symbol} ${marginMode}`); // 执行语句
  } // 结束代码块

  /**
   * 创建止盈止损订单
   * Create take profit / stop loss order
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 买卖方向 ('buy' | 'sell') / Side
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @param {number} options.stopPrice - 触发价格 / Trigger price
   * @param {string} options.stopType - 止损类型 ('STOP_MARKET' | 'TAKE_PROFIT_MARKET') / Stop type
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
      stopPrice: options.stopPrice, // 停止价格
      stopType: options.stopType || 'STOP_MARKET', // 停止类型
    }); // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调整数量精度 / Adjust amount precision
      const adjustedAmount = this._adjustPrecision(symbol, 'amount', amount); // 定义常量 adjustedAmount

      // 构建订单参数 / Build order parameters
      const params = { // 定义常量 params
        stopPrice: options.stopPrice,  // 触发价格 / Trigger price
      }; // 结束代码块

      // 确定订单类型 / Determine order type
      // STOP_MARKET = 止损市价单 / Stop market order
      // TAKE_PROFIT_MARKET = 止盈市价单 / Take profit market order
      const orderType = options.stopType || 'STOP_MARKET'; // 定义常量 orderType

      // 调用 CCXT 创建订单 / Call CCXT to create order
      const order = await this.exchange.createOrder( // 定义常量 order
        symbol,           // 交易对 / Symbol
        orderType,        // 订单类型 / Order type
        side,             // 买卖方向 / Side
        adjustedAmount,   // 数量 / Amount
        undefined,        // 市价单不需要价格 / Market order doesn't need price
        params            // 额外参数 / Additional params
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
   * 获取账户收入历史 (包括手续费、资金费等)
   * Get account income history (including fees, funding fees, etc.)
   * @param {string} incomeType - 收入类型 / Income type
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 收入历史 / Income history
   */
  async fetchIncomeHistory(incomeType = undefined, symbol = undefined, limit = 100) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      // 现货不支持收入历史 / Spot doesn't support income history
      throw this._createError('UNSUPPORTED', '收入历史仅适用于合约交易 / Income history only available for futures'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 构建请求参数 / Build request parameters
      const params = { limit }; // 定义常量 params

      // 如果指定了收入类型 / If income type is specified
      // 可选类型: TRANSFER, WELCOME_BONUS, REALIZED_PNL, FUNDING_FEE, COMMISSION, etc.
      if (incomeType) { // 条件判断 incomeType
        params.incomeType = incomeType; // 赋值 params.incomeType
      } // 结束代码块

      // 如果指定了交易对 / If symbol is specified
      if (symbol) { // 条件判断 symbol
        params.symbol = this.exchange.marketId(symbol); // 赋值 params.symbol
      } // 结束代码块

      // 调用 Binance API 获取收入历史 / Call Binance API to fetch income history
      const response = await this.exchange.fapiPrivateGetIncome(params); // 定义常量 response

      // 返回格式化的收入历史 / Return formatted income history
      return response.map(item => ({ // 返回结果
        symbol: item.symbol || null,             // 交易对 / Trading pair
        incomeType: item.incomeType,             // 收入类型 / Income type
        income: parseFloat(item.income),         // 收入金额 / Income amount
        asset: item.asset,                       // 资产类型 / Asset type
        info: item.info || null,                 // 详情 / Info
        timestamp: parseInt(item.time),          // 时间戳 / Timestamp
        tranId: item.tranId,                     // 交易 ID / Transaction ID
        exchange: this.name,                     // 交易所名称 / Exchange name
      })); // 结束代码块
    }, '获取收入历史 / Fetch income history'); // 执行语句
  } // 结束代码块

  /**
   * 获取账户交易历史 (最近 7 天)
   * Get account trade history (last 7 days)
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Array>} 交易历史 / Trade history
   */
  async fetchRecentTrades(symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 计算 7 天前的时间戳 / Calculate timestamp 7 days ago
      const since = Date.now() - (7 * 24 * 60 * 60 * 1000); // 定义常量 since

      // 调用 CCXT 获取交易历史 / Call CCXT to fetch trade history
      const trades = await this.exchange.fetchMyTrades(symbol, since, 500); // 定义常量 trades

      // 返回交易历史 / Return trade history
      return trades.map(trade => ({ // 返回结果
        id: trade.id,                          // 交易 ID / Trade ID
        orderId: trade.order,                  // 订单 ID / Order ID
        symbol: trade.symbol,                  // 交易对 / Trading pair
        side: trade.side,                      // 买卖方向 / Side
        price: trade.price,                    // 成交价格 / Price
        amount: trade.amount,                  // 成交数量 / Amount
        cost: trade.cost,                      // 成交金额 / Cost
        fee: trade.fee,                        // 手续费 / Fee
        timestamp: trade.timestamp,            // 时间戳 / Timestamp
        datetime: trade.datetime,              // ISO 时间 / ISO datetime
        exchange: this.name,                   // 交易所名称 / Exchange name
      })); // 结束代码块
    }, `获取近期交易 / Fetch recent trades: ${symbol}`); // 执行语句
  } // 结束代码块
} // 结束代码块

// 默认导出 / Default export
export default BinanceExchange; // 默认导出
