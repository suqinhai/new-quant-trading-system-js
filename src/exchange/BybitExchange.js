/**
 * Bybit 交易所实现
 * Bybit Exchange Implementation
 *
 * 继承自 BaseExchange，实现 Bybit 特定的功能
 * Extends BaseExchange to implement Bybit-specific functionality
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt'; // 导入模块 ccxt

// 导入基类 / Import base class
import { BaseExchange } from './BaseExchange.js'; // 导入模块 ./BaseExchange.js

/**
 * Bybit 交易所类
 * Bybit Exchange Class
 */
export class BybitExchange extends BaseExchange { // 导出类 BybitExchange
  /**
   * 构造函数
   * Constructor
   * @param {Object} config - 配置对象 / Configuration object
   * @param {string} config.apiKey - API 密钥 / API key
   * @param {string} config.secret - API 密钥 / API secret
   * @param {boolean} config.sandbox - 是否使用测试网 / Whether to use testnet
   * @param {string} config.defaultType - 交易类型 ('spot' | 'swap' | 'future' | 'option') / Trading type
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(config); // 调用父类

    // 设置交易所名称 / Set exchange name
    this.name = 'bybit'; // 设置 name
  } // 结束代码块

  /**
   * 创建 CCXT 交易所实例 (覆盖父类方法)
   * Create CCXT exchange instance (override parent method)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() { // 调用 _createExchange
    // 构建配置对象，只在有值时添加 apiKey/secret / Build config object, only add apiKey/secret if they have values
    const exchangeConfig = { // 定义常量 exchangeConfig
      // 是否启用速率限制 / Whether to enable rate limiting
      enableRateLimit: this.config.enableRateLimit, // 是否启用速率限制

      // 超时设置 (毫秒) / Timeout settings (milliseconds)
      timeout: this.config.timeout, // 超时设置 (毫秒)

      // 配置选项 / Configuration options
      options: { // options
        // 默认交易类型 / Default trading type
        // spot = 现货 / Spot
        // swap = 永续合约 / Perpetual
        // future = 交割合约 / Futures
        // option = 期权 / Options
        defaultType: this.config.defaultType, // option = 期权

        // 调整时间戳 / Adjust timestamp
        adjustForTimeDifference: true, // adjust用于时间Difference

        // Bybit V5 API
        // Bybit 使用统一账户，V5 API 是最新版本
        // Bybit uses unified account, V5 API is the latest version

        // 合并额外选项 / Merge additional options
        ...this.config.options, // 展开对象或数组
      }, // 结束代码块
    }; // 结束代码块

    // 只在有 API 密钥时添加认证信息 / Only add auth info when API key exists
    if (this.config.apiKey) { // 条件判断 this.config.apiKey
      exchangeConfig.apiKey = this.config.apiKey; // 赋值 exchangeConfig.apiKey
    } // 结束代码块
    if (this.config.secret) { // 条件判断 this.config.secret
      exchangeConfig.secret = this.config.secret; // 赋值 exchangeConfig.secret
    } // 结束代码块

    // 只在有代理设置时添加 / Only add proxy if set
    if (this.config.proxy) { // 条件判断 this.config.proxy
      exchangeConfig.proxy = this.config.proxy; // 赋值 exchangeConfig.proxy
    } // 结束代码块

    // 创建并返回 CCXT Bybit 实例 / Create and return CCXT Bybit instance
    return new ccxt.bybit(exchangeConfig); // 返回结果
  } // 结束代码块

  // ============================================
  // Bybit 特有方法 / Bybit-Specific Methods
  // ============================================

  /**
   * 获取 Bybit 服务器时间
   * Get Bybit server time
   * @returns {Promise<number>} 服务器时间戳 / Server timestamp
   */
  async fetchServerTime() { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取服务器时间 / Call CCXT to fetch server time
      const response = await this.exchange.fetchTime(); // 定义常量 response

      // 返回服务器时间戳 / Return server timestamp
      return response; // 返回结果
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
   * @param {string} symbol - 交易对 (可选，Bybit 可能需要) / Trading pair (optional, Bybit may require)
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setPositionMode(hedgeMode = false, symbol = undefined) { // 执行语句
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
        // Bybit 持仓模式设置
        // Bybit position mode settings
        // mode: 0 = 单向持仓 (MergedSingle), 3 = 双向持仓 (BothSide)
        // mode: 0 = One-way mode, 3 = Hedge mode
        const mode = hedgeMode ? 3 : 0; // 定义常量 mode

        // 构建请求参数 / Build request parameters
        const params = { // 定义常量 params
          category: this.config.defaultType === 'swap' ? 'linear' : 'linear', // category
          mode, // 执行语句
        }; // 结束代码块

        // 如果指定了交易对 / If symbol is specified
        if (symbol) { // 条件判断 symbol
          params.symbol = this.exchange.marketId(symbol); // 赋值 params.symbol
        } // 结束代码块

        // 调用 Bybit API 设置持仓模式 / Call Bybit API to set position mode
        const result = await this.exchange.privatePostV5PositionSwitchMode(params); // 定义常量 result

        // 发出持仓模式设置事件 / Emit position mode set event
        this.emit('positionModeSet', { hedgeMode, exchange: this.name }); // 调用 emit

        // 记录日志 / Log
        console.log(`[${this.name}] ✓ 持仓模式已设置 / Position mode set: ${hedgeMode ? '双向/Hedge' : '单向/One-way'}`); // 控制台输出

        // 返回结果 / Return result
        return result; // 返回结果

      } catch (error) { // 执行语句
        // 如果错误是因为已经是该模式，则返回成功 / If already in that mode, return success
        if (error.message && (error.message.includes('same') || error.message.includes('not modified'))) { // 条件判断 error.message && (error.message.includes('sam...
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
        if (error.message && (error.message.includes('same') || error.message.includes('not modified'))) { // 条件判断 error.message && (error.message.includes('sam...
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
   * @param {number} options.takeProfit - 止盈价格 / Take profit price
   * @param {number} options.stopLoss - 止损价格 / Stop loss price
   * @returns {Promise<Object>} 订单信息 / Order information
   */
  async createStopOrder(symbol, side, amount, options = {}) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 验证必要参数 / Validate required parameters
    if (!options.stopPrice && !options.takeProfit && !options.stopLoss) { // 条件判断 !options.stopPrice && !options.takeProfit && ...
      throw this._createError('INVALID_PARAM', '止损订单必须指定 stopPrice, takeProfit 或 stopLoss / Stop order requires stopPrice, takeProfit or stopLoss'); // 抛出异常
    } // 结束代码块

    // 记录日志 / Log
    console.log(`[${this.name}] 创建止损订单 / Creating stop order:`, { // 控制台输出
      symbol, // 执行语句
      side, // 执行语句
      amount, // 执行语句
      ...options, // 展开对象或数组
    }); // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调整数量精度 / Adjust amount precision
      const adjustedAmount = this._adjustPrecision(symbol, 'amount', amount); // 定义常量 adjustedAmount

      // 构建订单参数 / Build order parameters
      const params = {}; // 定义常量 params

      // 设置触发价格 / Set trigger price
      if (options.stopPrice) { // 条件判断 options.stopPrice
        params.triggerPrice = options.stopPrice; // 赋值 params.triggerPrice
      } // 结束代码块

      // 设置止盈 / Set take profit
      if (options.takeProfit) { // 条件判断 options.takeProfit
        params.takeProfit = options.takeProfit; // 赋值 params.takeProfit
      } // 结束代码块

      // 设置止损 / Set stop loss
      if (options.stopLoss) { // 条件判断 options.stopLoss
        params.stopLoss = options.stopLoss; // 赋值 params.stopLoss
      } // 结束代码块

      // Bybit 止损订单类型
      // Bybit stop order type
      // 根据参数决定订单类型 / Determine order type based on params
      let orderType = 'market'; // 定义变量 orderType
      if (options.stopPrice) { // 条件判断 options.stopPrice
        orderType = 'market';  // 触发后执行市价单 / Execute market order after trigger
      } // 结束代码块

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
   * 获取钱包余额 (统一账户)
   * Get wallet balance (unified account)
   * @param {string} accountType - 账户类型 ('UNIFIED' | 'CONTRACT' | 'SPOT') / Account type
   * @returns {Promise<Object>} 钱包余额 / Wallet balance
   */
  async fetchWalletBalance(accountType = 'UNIFIED') { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 构建请求参数 / Build request parameters
      const params = { // 定义常量 params
        accountType, // 执行语句
      }; // 结束代码块

      // 调用 Bybit API 获取钱包余额 / Call Bybit API to fetch wallet balance
      const response = await this.exchange.privateGetV5AccountWalletBalance(params); // 定义常量 response

      // 解析响应数据 / Parse response data
      const result = response.result?.list?.[0]; // 定义常量 result

      // 如果没有数据，返回空对象 / If no data, return empty object
      if (!result) { // 条件判断 !result
        return { // 返回结果
          accountType, // 执行语句
          totalEquity: 0, // 总Equity
          totalAvailableBalance: 0, // 总Available余额
          coins: [], // coins
          exchange: this.name, // 交易所
          timestamp: Date.now(), // 时间戳
        }; // 结束代码块
      } // 结束代码块

      // 返回格式化的钱包余额 / Return formatted wallet balance
      return { // 返回结果
        accountType: result.accountType,                           // 账户类型 / Account type
        totalEquity: parseFloat(result.totalEquity || 0),          // 总权益 / Total equity
        totalAvailableBalance: parseFloat(result.totalAvailableBalance || 0),  // 可用余额 / Available balance
        totalMarginBalance: parseFloat(result.totalMarginBalance || 0),        // 保证金余额 / Margin balance
        totalInitialMargin: parseFloat(result.totalInitialMargin || 0),        // 初始保证金 / Initial margin
        totalMaintenanceMargin: parseFloat(result.totalMaintenanceMargin || 0), // 维持保证金 / Maintenance margin
        coins: (result.coin || []).map(coin => ({ // coins
          coin: coin.coin,                                         // 币种 / Coin
          equity: parseFloat(coin.equity || 0),                    // 权益 / Equity
          walletBalance: parseFloat(coin.walletBalance || 0),      // 钱包余额 / Wallet balance
          availableToWithdraw: parseFloat(coin.availableToWithdraw || 0),  // 可提现 / Available to withdraw
          unrealisedPnl: parseFloat(coin.unrealisedPnl || 0),      // 未实现盈亏 / Unrealized PnL
          cumRealisedPnl: parseFloat(coin.cumRealisedPnl || 0),    // 累计已实现盈亏 / Cumulative realized PnL
        })), // 结束代码块
        exchange: this.name,                                       // 交易所名称 / Exchange name
        timestamp: Date.now(),                                     // 时间戳 / Timestamp
      }; // 结束代码块
    }, `获取钱包余额 / Fetch wallet balance: ${accountType}`); // 执行语句
  } // 结束代码块

  /**
   * 获取交易记录
   * Get execution list
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 交易记录列表 / Execution list
   */
  async fetchExecutionList(symbol = undefined, limit = 50) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 如果指定了交易对，验证 / If symbol specified, validate
    if (symbol) { // 条件判断 symbol
      this._validateSymbol(symbol); // 调用 _validateSymbol
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 构建请求参数 / Build request parameters
      const params = { // 定义常量 params
        category: this.config.defaultType === 'spot' ? 'spot' : 'linear', // category
        limit, // 执行语句
      }; // 结束代码块

      // 如果指定了交易对 / If symbol is specified
      if (symbol) { // 条件判断 symbol
        params.symbol = this.exchange.marketId(symbol); // 赋值 params.symbol
      } // 结束代码块

      // 调用 Bybit API 获取交易记录 / Call Bybit API to fetch execution list
      const response = await this.exchange.privateGetV5ExecutionList(params); // 定义常量 response

      // 返回格式化的交易记录 / Return formatted execution list
      return (response.result?.list || []).map(item => ({ // 返回结果
        execId: item.execId,                               // 执行 ID / Execution ID
        orderId: item.orderId,                             // 订单 ID / Order ID
        orderLinkId: item.orderLinkId,                     // 客户端订单 ID / Client order ID
        symbol: item.symbol,                               // 交易对 / Trading pair
        side: item.side?.toLowerCase(),                    // 买卖方向 / Side
        execPrice: parseFloat(item.execPrice || 0),        // 成交价格 / Execution price
        execQty: parseFloat(item.execQty || 0),            // 成交数量 / Execution quantity
        execValue: parseFloat(item.execValue || 0),        // 成交价值 / Execution value
        execFee: parseFloat(item.execFee || 0),            // 手续费 / Fee
        feeCurrency: item.feeCurrency,                     // 手续费币种 / Fee currency
        execType: item.execType,                           // 执行类型 / Execution type
        execTime: parseInt(item.execTime),                 // 执行时间 / Execution time
        exchange: this.name,                               // 交易所名称 / Exchange name
      })); // 结束代码块
    }, `获取交易记录 / Fetch execution list: ${symbol || 'all'}`); // 执行语句
  } // 结束代码块

  /**
   * 获取持仓信息 (覆盖父类方法，使用 Bybit V5 API)
   * Fetch positions (override parent method, use Bybit V5 API)
   * @param {string[]} symbols - 交易对列表 (可选) / Symbol list (optional)
   * @returns {Promise<Object[]>} 统一格式的持仓列表 / Unified position list
   */
  async fetchPositions(symbols = undefined) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 如果是现货，返回空数组 / If spot, return empty array
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      return []; // 返回结果
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 构建请求参数 / Build request parameters
      const params = { // 定义常量 params
        category: this.config.defaultType === 'swap' ? 'linear' : 'linear', // category
        settleCoin: 'USDT',  // 结算币种 / Settlement coin
      }; // 结束代码块

      // 如果指定了交易对 / If symbols specified
      if (symbols && symbols.length === 1) { // 条件判断 symbols && symbols.length === 1
        params.symbol = this.exchange.marketId(symbols[0]); // 赋值 params.symbol
      } // 结束代码块

      // 调用 Bybit API 获取持仓 / Call Bybit API to fetch positions
      const response = await this.exchange.privateGetV5PositionList(params); // 定义常量 response

      // 过滤有效持仓并转换为统一格式 / Filter valid positions and convert to unified format
      return (response.result?.list || []) // 返回结果
        .filter(pos => { // 定义箭头函数
          // 过滤掉空仓位 / Filter out empty positions
          const size = Math.abs(parseFloat(pos.size || 0)); // 定义常量 size
          return size > 0; // 返回结果
        }) // 结束代码块
        .map(pos => ({ // 定义箭头函数
          // 交易对 / Symbol
          symbol: pos.symbol, // 交易对

          // 持仓方向 / Position side
          side: pos.side?.toLowerCase() === 'buy' ? 'long' : 'short', // 方向

          // 持仓数量 (合约数) / Position size (contracts)
          contracts: parseFloat(pos.size || 0), // 持仓数量 (合约数)

          // 持仓价值 / Notional value
          notional: parseFloat(pos.positionValue || 0), // notional

          // 开仓均价 / Entry price
          entryPrice: parseFloat(pos.avgPrice || 0), // 开仓均价

          // 标记价格 / Mark price
          markPrice: parseFloat(pos.markPrice || 0), // mark价格

          // 清算价格 / Liquidation price
          liquidationPrice: parseFloat(pos.liqPrice || 0), // 强平价格

          // 杠杆倍数 / Leverage
          leverage: parseFloat(pos.leverage || 1), // 杠杆

          // 未实现盈亏 / Unrealized PnL
          unrealizedPnl: parseFloat(pos.unrealisedPnl || 0), // 未实现盈亏

          // 已实现盈亏 / Realized PnL
          realizedPnl: parseFloat(pos.cumRealisedPnl || 0), // 已实现盈亏

          // 保证金模式 (cross/isolated) / Margin mode
          marginMode: pos.tradeMode === '0' ? 'cross' : 'isolated', // 保证金模式 (cross/isolated)

          // 保证金 / Collateral
          collateral: parseFloat(pos.positionIM || 0), // collateral

          // 止盈价格 / Take profit price
          takeProfit: parseFloat(pos.takeProfit || 0) || null, // 止盈价格

          // 止损价格 / Stop loss price
          stopLoss: parseFloat(pos.stopLoss || 0) || null, // 止损价格

          // 交易所名称 / Exchange name
          exchange: this.name, // 交易所

          // 时间戳 / Timestamp
          timestamp: parseInt(pos.updatedTime || Date.now()), // 时间戳

          // 原始数据 / Raw data
          raw: pos, // raw
        })); // 结束代码块
    }, '获取持仓 / Fetch positions'); // 执行语句
  } // 结束代码块

  /**
   * 获取交易历史 (最近 7 天)
   * Get trade history (last 7 days)
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

  /**
   * 获取订单历史
   * Get order history
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 订单历史 / Order history
   */
  async fetchOrderHistory(symbol = undefined, limit = 50) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 如果指定了交易对，验证 / If symbol specified, validate
    if (symbol) { // 条件判断 symbol
      this._validateSymbol(symbol); // 调用 _validateSymbol
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取订单历史 / Call CCXT to fetch order history
      const orders = await this.exchange.fetchOrders(symbol, undefined, limit); // 定义常量 orders

      // 返回统一格式的订单列表 / Return unified order list
      return orders.map(order => this._normalizeOrder(order)); // 返回结果
    }, `获取订单历史 / Fetch order history: ${symbol || 'all'}`); // 执行语句
  } // 结束代码块
} // 结束代码块

// 默认导出 / Default export
export default BybitExchange; // 默认导出
