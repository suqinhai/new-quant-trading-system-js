/**
 * Kraken 交易所实现
 * Kraken Exchange Implementation
 *
 * 继承自 BaseExchange，实现 Kraken 特定的功能
 * Extends BaseExchange to implement Kraken-specific functionality
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt'; // 导入模块 ccxt

// 导入基类 / Import base class
import { BaseExchange } from './BaseExchange.js'; // 导入模块 ./BaseExchange.js

/**
 * Kraken 交易所类
 * Kraken Exchange Class
 */
export class KrakenExchange extends BaseExchange { // 导出类 KrakenExchange
  /**
   * 构造函数
   * Constructor
   * @param {Object} config - 配置对象 / Configuration object
   * @param {string} config.apiKey - API 密钥 / API key
   * @param {string} config.secret - API 密钥 / API secret
   * @param {boolean} config.sandbox - 是否使用测试网 / Whether to use testnet
   * @param {string} config.defaultType - 交易类型 ('spot' | 'swap' | 'future') / Trading type
   */
  constructor(config = {}) { // 构造函数
    // 调用父类构造函数 / Call parent constructor
    super(config); // 调用父类

    // 设置交易所名称 / Set exchange name
    this.name = 'kraken'; // 设置 name
  } // 结束代码块

  /**
   * 创建 CCXT 交易所实例 (覆盖父类方法)
   * Create CCXT exchange instance (override parent method)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() { // 调用 _createExchange
    // 根据交易类型选择使用 kraken 或 krakenfutures
    // Select kraken or krakenfutures based on trading type
    const isFutures = ['swap', 'future'].includes(this.config.defaultType); // 定义常量 isFutures
    const ExchangeClass = isFutures ? ccxt.krakenfutures : ccxt.kraken; // 定义常量 ExchangeClass

    // 创建并返回 CCXT Kraken 实例 / Create and return CCXT Kraken instance
    return new ExchangeClass({ // 返回结果
      // API 认证信息 / API authentication
      apiKey: this.config.apiKey,         // API 密钥 / API key
      secret: this.config.secret,         // API 密钥 / API secret

      // 是否启用速率限制 / Whether to enable rate limiting
      enableRateLimit: this.config.enableRateLimit, // 是否启用速率限制

      // 超时设置 (毫秒) / Timeout settings (milliseconds)
      timeout: this.config.timeout, // 超时设置 (毫秒)

      // 代理设置 / Proxy settings
      proxy: this.config.proxy, // proxy

      // 配置选项 / Configuration options
      options: { // options
        // 默认交易类型 / Default trading type
        // spot = 现货 / Spot
        // swap = 永续合约 / Perpetual
        // future = 交割合约 / Futures
        defaultType: this.config.defaultType, // future = 交割合约

        // 调整时间戳 / Adjust timestamp
        adjustForTimeDifference: true, // adjust用于时间Difference

        // Kraken 特定设置 / Kraken-specific settings
        // Kraken 使用 nonce 进行请求签名
        // Kraken uses nonce for request signing

        // 合并额外选项 / Merge additional options
        ...this.config.options, // 展开对象或数组
      }, // 结束代码块
    }); // 结束代码块
  } // 结束代码块

  // ============================================
  // Kraken 特有方法 / Kraken-Specific Methods
  // ============================================

  /**
   * 获取 Kraken 服务器时间
   * Get Kraken server time
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
   * 获取历史资金费率 (仅合约)
   * Get historical funding rates (futures only)
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
   * 设置杠杆倍数 (覆盖父类方法，添加 Kraken 特定逻辑)
   * Set leverage (override parent method, add Kraken-specific logic)
   * @param {number} leverage - 杠杆倍数 / Leverage multiplier
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setLeverage(leverage, symbol) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') { // 条件判断 this.config.defaultType === 'spot'
      // 现货不支持杠杆设置 / Spot doesn't support leverage
      throw this._createError('UNSUPPORTED', '杠杆仅适用于合约交易 / Leverage only available for futures'); // 抛出异常
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      try { // 尝试执行
        // 调用 CCXT 设置杠杆 / Call CCXT to set leverage
        const result = await this.exchange.setLeverage(leverage, symbol); // 定义常量 result

        // 发出杠杆设置事件 / Emit leverage set event
        this.emit('leverageSet', { symbol, leverage, exchange: this.name }); // 调用 emit

        // 记录日志 / Log
        console.log(`[${this.name}] ✓ 杠杆已设置 / Leverage set: ${symbol} ${leverage}x`); // 控制台输出

        // 返回结果 / Return result
        return result; // 返回结果

      } catch (error) { // 执行语句
        // 如果错误是因为已经是该杠杆，则返回成功 / If already at that leverage, return success
        if (error.message && (error.message.includes('same') || error.message.includes('not modified'))) { // 条件判断 error.message && (error.message.includes('sam...
          console.log(`[${this.name}] ✓ 杠杆无需更改 / Leverage already set`); // 控制台输出
          return { success: true, message: 'Leverage already set' }; // 返回结果
        } // 结束代码块

        // 其他错误继续抛出 / Throw other errors
        throw error; // 抛出异常
      } // 结束代码块
    }, `设置杠杆 / Set leverage: ${symbol} ${leverage}x`); // 执行语句
  } // 结束代码块

  /**
   * 获取账户交易量等级
   * Get account trade volume tier
   * @returns {Promise<Object>} 交易量等级信息 / Trade volume tier info
   */
  async fetchTradingVolume() { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 Kraken API 获取交易量 / Call Kraken API to fetch trade volume
      const response = await this.exchange.privatePostTradeVolume(); // 定义常量 response

      // 返回格式化的交易量信息 / Return formatted trade volume info
      return { // 返回结果
        currency: response.result?.currency || 'USD', // currency
        volume: parseFloat(response.result?.volume || 0), // 成交量
        fees: response.result?.fees || {}, // fees
        feesMaker: response.result?.fees_maker || {}, // fees挂单
        exchange: this.name, // 交易所
        timestamp: Date.now(), // 时间戳
      }; // 结束代码块
    }, '获取交易量等级 / Fetch trading volume tier'); // 执行语句
  } // 结束代码块

  /**
   * 获取可用的交易对列表
   * Get available trading pairs
   * @returns {Promise<Array>} 交易对列表 / List of trading pairs
   */
  async fetchTradingPairs() { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 获取市场信息 / Fetch market info
      const markets = await this.exchange.loadMarkets(); // 定义常量 markets

      // 转换为交易对列表 / Convert to trading pairs list
      return Object.values(markets).map(market => ({ // 返回结果
        symbol: market.symbol,           // 统一交易对符号 / Unified symbol
        base: market.base,               // 基础货币 / Base currency
        quote: market.quote,             // 报价货币 / Quote currency
        active: market.active,           // 是否活跃 / Whether active
        type: market.type,               // 市场类型 / Market type
        spot: market.spot,               // 是否现货 / Whether spot
        future: market.future,           // 是否期货 / Whether future
        swap: market.swap,               // 是否永续 / Whether swap
        precision: market.precision,     // 精度 / Precision
        limits: market.limits,           // 限制 / Limits
        exchange: this.name,             // 交易所名称 / Exchange name
      })); // 结束代码块
    }, '获取交易对列表 / Fetch trading pairs'); // 执行语句
  } // 结束代码块

  /**
   * 获取最近交易记录
   * Get recent trades
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 交易记录列表 / Trade list
   */
  async fetchRecentTrades(symbol, limit = 100) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol); // 调用 _validateSymbol

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取最近交易 / Call CCXT to fetch recent trades
      const trades = await this.exchange.fetchTrades(symbol, undefined, limit); // 定义常量 trades

      // 返回交易记录 / Return trade records
      return trades.map(trade => ({ // 返回结果
        id: trade.id,                      // 交易 ID / Trade ID
        symbol: trade.symbol,              // 交易对 / Trading pair
        side: trade.side,                  // 买卖方向 / Side
        price: trade.price,                // 成交价格 / Price
        amount: trade.amount,              // 成交数量 / Amount
        cost: trade.cost,                  // 成交金额 / Cost
        timestamp: trade.timestamp,        // 时间戳 / Timestamp
        datetime: trade.datetime,          // ISO 时间 / ISO datetime
        exchange: this.name,               // 交易所名称 / Exchange name
      })); // 结束代码块
    }, `获取最近交易 / Fetch recent trades: ${symbol}`); // 执行语句
  } // 结束代码块

  /**
   * 获取我的交易历史
   * Get my trade history
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 交易历史 / Trade history
   */
  async fetchMyTrades(symbol = undefined, since = undefined, limit = 50) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 如果指定了交易对，验证 / If symbol specified, validate
    if (symbol) { // 条件判断 symbol
      this._validateSymbol(symbol); // 调用 _validateSymbol
    } // 结束代码块

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取我的交易历史 / Call CCXT to fetch my trade history
      const trades = await this.exchange.fetchMyTrades(symbol, since, limit); // 定义常量 trades

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
    }, `获取我的交易历史 / Fetch my trades: ${symbol || 'all'}`); // 执行语句
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
      const orders = await this.exchange.fetchClosedOrders(symbol, undefined, limit); // 定义常量 orders

      // 返回统一格式的订单列表 / Return unified order list
      return orders.map(order => this._normalizeOrder(order)); // 返回结果
    }, `获取订单历史 / Fetch order history: ${symbol || 'all'}`); // 执行语句
  } // 结束代码块

  /**
   * 获取持仓信息 (覆盖父类方法，使用 Kraken Futures API)
   * Fetch positions (override parent method, use Kraken Futures API)
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
      // 调用 CCXT 获取持仓 / Call CCXT to fetch positions
      const positions = await this.exchange.fetchPositions(symbols); // 定义常量 positions

      // 过滤有效持仓并转换为统一格式 / Filter valid positions and convert to unified format
      return positions // 返回结果
        .filter(pos => { // 定义箭头函数
          // 过滤掉空仓位 / Filter out empty positions
          const size = Math.abs(parseFloat(pos.contracts || 0)); // 定义常量 size
          return size > 0; // 返回结果
        }) // 结束代码块
        .map(pos => ({ // 定义箭头函数
          // 交易对 / Symbol
          symbol: pos.symbol, // 交易对

          // 持仓方向 / Position side
          side: pos.side?.toLowerCase() === 'long' ? 'long' : 'short', // 方向

          // 持仓数量 (合约数) / Position size (contracts)
          contracts: Math.abs(parseFloat(pos.contracts || 0)), // 持仓数量 (合约数)

          // 持仓价值 / Notional value
          notional: parseFloat(pos.notional || 0), // notional

          // 开仓均价 / Entry price
          entryPrice: parseFloat(pos.entryPrice || 0), // 开仓均价

          // 标记价格 / Mark price
          markPrice: parseFloat(pos.markPrice || 0), // mark价格

          // 清算价格 / Liquidation price
          liquidationPrice: parseFloat(pos.liquidationPrice || 0), // 强平价格

          // 杠杆倍数 / Leverage
          leverage: parseFloat(pos.leverage || 1), // 杠杆

          // 未实现盈亏 / Unrealized PnL
          unrealizedPnl: parseFloat(pos.unrealizedPnl || 0), // 未实现盈亏

          // 已实现盈亏 / Realized PnL
          realizedPnl: parseFloat(pos.realizedPnl || 0), // 已实现盈亏

          // 保证金模式 (cross/isolated) / Margin mode
          marginMode: pos.marginMode || 'cross', // 保证金模式 (cross/isolated)

          // 保证金 / Collateral
          collateral: parseFloat(pos.collateral || 0), // collateral

          // 交易所名称 / Exchange name
          exchange: this.name, // 交易所

          // 时间戳 / Timestamp
          timestamp: pos.timestamp || Date.now(), // 时间戳

          // 原始数据 / Raw data
          raw: pos, // raw
        })); // 结束代码块
    }, '获取持仓 / Fetch positions'); // 执行语句
  } // 结束代码块

  /**
   * 获取存款地址
   * Get deposit address
   * @param {string} currency - 币种 / Currency
   * @param {Object} params - 额外参数 / Additional params
   * @returns {Promise<Object>} 存款地址信息 / Deposit address info
   */
  async fetchDepositAddress(currency, params = {}) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取存款地址 / Call CCXT to fetch deposit address
      const address = await this.exchange.fetchDepositAddress(currency, params); // 定义常量 address

      // 返回存款地址信息 / Return deposit address info
      return { // 返回结果
        currency: address.currency,        // 币种 / Currency
        address: address.address,          // 存款地址 / Deposit address
        tag: address.tag,                  // 标签 (如 memo) / Tag (like memo)
        network: address.network,          // 网络 / Network
        exchange: this.name,               // 交易所名称 / Exchange name
        timestamp: Date.now(),             // 时间戳 / Timestamp
      }; // 结束代码块
    }, `获取存款地址 / Fetch deposit address: ${currency}`); // 执行语句
  } // 结束代码块

  /**
   * 获取提款记录
   * Get withdrawal history
   * @param {string} currency - 币种 (可选) / Currency (optional)
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 提款记录列表 / Withdrawal history list
   */
  async fetchWithdrawals(currency = undefined, since = undefined, limit = 50) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取提款记录 / Call CCXT to fetch withdrawals
      const withdrawals = await this.exchange.fetchWithdrawals(currency, since, limit); // 定义常量 withdrawals

      // 返回提款记录 / Return withdrawals
      return withdrawals.map(w => ({ // 返回结果
        id: w.id,                          // 提款 ID / Withdrawal ID
        txid: w.txid,                      // 交易哈希 / Transaction hash
        currency: w.currency,              // 币种 / Currency
        amount: w.amount,                  // 金额 / Amount
        fee: w.fee,                        // 手续费 / Fee
        address: w.address,                // 目标地址 / Destination address
        tag: w.tag,                        // 标签 / Tag
        status: w.status,                  // 状态 / Status
        timestamp: w.timestamp,            // 时间戳 / Timestamp
        datetime: w.datetime,              // ISO 时间 / ISO datetime
        exchange: this.name,               // 交易所名称 / Exchange name
      })); // 结束代码块
    }, `获取提款记录 / Fetch withdrawals: ${currency || 'all'}`); // 执行语句
  } // 结束代码块

  /**
   * 获取存款记录
   * Get deposit history
   * @param {string} currency - 币种 (可选) / Currency (optional)
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 存款记录列表 / Deposit history list
   */
  async fetchDeposits(currency = undefined, since = undefined, limit = 50) { // 执行语句
    // 确保已连接 / Ensure connected
    this._ensureConnected(); // 调用 _ensureConnected

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => { // 返回结果
      // 调用 CCXT 获取存款记录 / Call CCXT to fetch deposits
      const deposits = await this.exchange.fetchDeposits(currency, since, limit); // 定义常量 deposits

      // 返回存款记录 / Return deposits
      return deposits.map(d => ({ // 返回结果
        id: d.id,                          // 存款 ID / Deposit ID
        txid: d.txid,                      // 交易哈希 / Transaction hash
        currency: d.currency,              // 币种 / Currency
        amount: d.amount,                  // 金额 / Amount
        fee: d.fee,                        // 手续费 / Fee
        address: d.address,                // 存款地址 / Deposit address
        tag: d.tag,                        // 标签 / Tag
        status: d.status,                  // 状态 / Status
        timestamp: d.timestamp,            // 时间戳 / Timestamp
        datetime: d.datetime,              // ISO 时间 / ISO datetime
        exchange: this.name,               // 交易所名称 / Exchange name
      })); // 结束代码块
    }, `获取存款记录 / Fetch deposits: ${currency || 'all'}`); // 执行语句
  } // 结束代码块
} // 结束代码块

// 默认导出 / Default export
export default KrakenExchange; // 默认导出
