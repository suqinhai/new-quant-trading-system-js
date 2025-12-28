/**
 * KuCoin 交易所实现
 * KuCoin Exchange Implementation
 *
 * 继承自 BaseExchange，实现 KuCoin 特定的功能
 * Extends BaseExchange to implement KuCoin-specific functionality
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt';

// 导入基类 / Import base class
import { BaseExchange } from './BaseExchange.js';

/**
 * KuCoin 交易所类
 * KuCoin Exchange Class
 */
export class KuCoinExchange extends BaseExchange {
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
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super(config);

    // 设置交易所名称 / Set exchange name
    this.name = 'kucoin';
  }

  /**
   * 创建 CCXT 交易所实例 (覆盖父类方法)
   * Create CCXT exchange instance (override parent method)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() {
    // 构建配置对象 / Build configuration object
    const exchangeConfig = {
      // 是否启用速率限制 / Whether to enable rate limiting
      enableRateLimit: this.config.enableRateLimit,

      // 超时设置 (毫秒) / Timeout settings (milliseconds)
      timeout: this.config.timeout,

      // 配置选项 / Configuration options
      options: {
        // 默认交易类型 / Default trading type
        // spot = 现货 / Spot trading
        // swap = 永续合约 / Perpetual swap
        // future = 交割合约 / Delivery futures
        defaultType: this.config.defaultType,

        // 调整时间戳 (解决服务器时间差问题) / Adjust timestamp
        adjustForTimeDifference: true,

        // 合并额外选项 / Merge additional options
        ...this.config.options,
      },
    };

    // 沙盒模式处理 / Sandbox mode handling
    if (this.config.sandbox) {
      // KuCoin 测试网配置 / KuCoin testnet configuration
      exchangeConfig.options.sandboxMode = true;
      console.log(`[${this.name}] 沙盒模式: 使用测试网 / Sandbox mode: Using testnet`);
    }

    // 只在有值时添加 API 认证信息 / Only add API auth when values exist
    if (!this.config.sandbox) {
      if (this.config.apiKey && typeof this.config.apiKey === 'string' && this.config.apiKey.length > 0) {
        exchangeConfig.apiKey = this.config.apiKey;
      }
      if (this.config.secret && typeof this.config.secret === 'string' && this.config.secret.length > 0) {
        exchangeConfig.secret = this.config.secret;
      }
      // KuCoin 需要 passphrase / KuCoin requires passphrase
      if (this.config.password && typeof this.config.password === 'string' && this.config.password.length > 0) {
        exchangeConfig.password = this.config.password;
      }
    } else {
      console.log(`[${this.name}] 沙盒模式: 不使用 API 密钥 (使用公开端点) / Sandbox mode: Not using API keys (using public endpoints)`);
    }

    // 只在有值时添加代理设置 / Only add proxy when value exists
    if (this.config.proxy) {
      exchangeConfig.proxy = this.config.proxy;
    }

    // 创建并返回 CCXT 交易所实例 / Create and return CCXT exchange instance
    // KuCoin 现货使用 'kucoin'，合约使用 'kucoinfutures' / KuCoin spot uses 'kucoin', futures uses 'kucoinfutures'
    if (this.config.defaultType === 'spot') {
      return new ccxt.kucoin(exchangeConfig);
    } else {
      // 合约交易使用 kucoinfutures / Use kucoinfutures for derivatives
      return new ccxt.kucoinfutures(exchangeConfig);
    }
  }

  // ============================================
  // KuCoin 特有方法 / KuCoin-Specific Methods
  // ============================================

  /**
   * 获取 KuCoin 服务器时间
   * Get KuCoin server time
   * @returns {Promise<number>} 服务器时间戳 / Server timestamp
   */
  async fetchServerTime() {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 获取服务器时间 / Fetch server time
      const response = await this.exchange.fetchTime();

      // 返回服务器时间戳 (毫秒) / Return server timestamp (milliseconds)
      return response;
    }, '获取服务器时间 / Fetch server time');
  }

  /**
   * 获取交易手续费率
   * Get trading fee rate
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 手续费信息 / Fee information
   */
  async fetchTradingFee(symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取手续费 / Call CCXT to fetch trading fee
      const fee = await this.exchange.fetchTradingFee(symbol);

      // 返回统一格式的手续费信息 / Return unified fee info
      return {
        symbol,                    // 交易对 / Trading pair
        maker: fee.maker,          // 挂单手续费率 / Maker fee rate
        taker: fee.taker,          // 吃单手续费率 / Taker fee rate
        exchange: this.name,       // 交易所名称 / Exchange name
        timestamp: Date.now(),     // 时间戳 / Timestamp
      };
    }, `获取手续费 / Fetch trading fee: ${symbol}`);
  }

  /**
   * 获取历史资金费率
   * Get historical funding rates
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 历史资金费率列表 / Historical funding rate list
   */
  async fetchFundingRateHistory(symbol, since = undefined, limit = 100) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') {
      // 现货不支持资金费率 / Spot doesn't support funding rate
      throw this._createError('UNSUPPORTED', '资金费率仅适用于合约交易 / Funding rate only available for futures');
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取历史资金费率 / Call CCXT to fetch funding rate history
      const history = await this.exchange.fetchFundingRateHistory(symbol, since, limit);

      // 转换为统一格式 / Convert to unified format
      return history.map(item => ({
        symbol: item.symbol,              // 交易对 / Trading pair
        fundingRate: item.fundingRate,    // 资金费率 / Funding rate
        timestamp: item.timestamp,        // 时间戳 / Timestamp
        datetime: item.datetime,          // ISO 时间 / ISO datetime
        exchange: this.name,              // 交易所名称 / Exchange name
      }));
    }, `获取历史资金费率 / Fetch funding rate history: ${symbol}`);
  }

  /**
   * 设置保证金模式 (逐仓/全仓)
   * Set margin mode (isolated/cross)
   * @param {string} marginMode - 保证金模式 ('isolated' | 'cross') / Margin mode
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setMarginMode(marginMode, symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') {
      // 现货不支持保证金模式 / Spot doesn't support margin mode
      throw this._createError('UNSUPPORTED', '保证金模式仅适用于合约交易 / Margin mode only available for futures');
    }

    // 验证保证金模式参数 / Validate margin mode parameter
    const validModes = ['isolated', 'cross'];
    if (!validModes.includes(marginMode?.toLowerCase())) {
      throw this._createError('INVALID_PARAM', `无效的保证金模式 / Invalid margin mode: ${marginMode}`);
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      try {
        // 调用 CCXT 设置保证金模式 / Call CCXT to set margin mode
        const result = await this.exchange.setMarginMode(marginMode, symbol);

        // 发出保证金模式设置事件 / Emit margin mode set event
        this.emit('marginModeSet', { symbol, marginMode, exchange: this.name });

        // 记录日志 / Log
        console.log(`[${this.name}] ✓ 保证金模式已设置 / Margin mode set: ${symbol} ${marginMode}`);

        // 返回结果 / Return result
        return result;

      } catch (error) {
        // 如果错误是因为已经是该模式，则返回成功 / If already in that mode, return success
        if (error.message && (error.message.includes('No need to change') || error.message.includes('same') || error.message.includes('already'))) {
          console.log(`[${this.name}] ✓ 保证金模式无需更改 / Margin mode already set`);
          return { success: true, message: 'Margin mode already set' };
        }

        // 其他错误继续抛出 / Throw other errors
        throw error;
      }
    }, `设置保证金模式 / Set margin mode: ${symbol} ${marginMode}`);
  }

  /**
   * 获取标记价格
   * Get mark price
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 标记价格信息 / Mark price info
   */
  async fetchMarkPrice(symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') {
      throw this._createError('UNSUPPORTED', '标记价格仅适用于合约交易 / Mark price only available for futures');
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取标记价格 / Call CCXT to fetch mark price
      const ticker = await this.exchange.fetchMarkPrice(symbol);

      return {
        symbol: ticker.symbol,
        markPrice: ticker.markPrice,
        indexPrice: ticker.indexPrice || null,
        timestamp: ticker.timestamp,
        datetime: ticker.datetime,
        exchange: this.name,
      };
    }, `获取标记价格 / Fetch mark price: ${symbol}`);
  }

  /**
   * 获取账户交易历史
   * Get account trade history
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 交易历史 / Trade history
   */
  async fetchMyTrades(symbol, since = undefined, limit = 100) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取交易历史 / Call CCXT to fetch trade history
      const trades = await this.exchange.fetchMyTrades(symbol, since, limit);

      // 返回交易历史 / Return trade history
      return trades.map(trade => ({
        id: trade.id,
        orderId: trade.order,
        symbol: trade.symbol,
        side: trade.side,
        price: trade.price,
        amount: trade.amount,
        cost: trade.cost,
        fee: trade.fee,
        timestamp: trade.timestamp,
        datetime: trade.datetime,
        exchange: this.name,
      }));
    }, `获取交易历史 / Fetch my trades: ${symbol}`);
  }

  /**
   * 获取提现历史
   * Get withdrawal history
   * @param {string} code - 币种代码 (可选) / Currency code (optional)
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 提现历史 / Withdrawal history
   */
  async fetchWithdrawalHistory(code = undefined, since = undefined, limit = 100) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      const withdrawals = await this.exchange.fetchWithdrawals(code, since, limit);

      return withdrawals.map(w => ({
        id: w.id,
        txid: w.txid,
        currency: w.currency,
        amount: w.amount,
        fee: w.fee,
        status: w.status,
        address: w.address,
        tag: w.tag,
        timestamp: w.timestamp,
        datetime: w.datetime,
        exchange: this.name,
      }));
    }, '获取提现历史 / Fetch withdrawal history');
  }

  /**
   * 获取充值历史
   * Get deposit history
   * @param {string} code - 币种代码 (可选) / Currency code (optional)
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 充值历史 / Deposit history
   */
  async fetchDepositHistory(code = undefined, since = undefined, limit = 100) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      const deposits = await this.exchange.fetchDeposits(code, since, limit);

      return deposits.map(d => ({
        id: d.id,
        txid: d.txid,
        currency: d.currency,
        amount: d.amount,
        status: d.status,
        address: d.address,
        tag: d.tag,
        timestamp: d.timestamp,
        datetime: d.datetime,
        exchange: this.name,
      }));
    }, '获取充值历史 / Fetch deposit history');
  }

  /**
   * 获取所有币种信息
   * Get all currencies info
   * @returns {Promise<Object>} 币种信息 / Currencies info
   */
  async fetchCurrencies() {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      return await this.exchange.fetchCurrencies();
    }, '获取币种信息 / Fetch currencies');
  }

  /**
   * 获取当前资金费率
   * Get current funding rate
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 资金费率信息 / Funding rate info
   */
  async fetchFundingRate(symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') {
      throw this._createError('UNSUPPORTED', '资金费率仅适用于合约交易 / Funding rate only available for futures');
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取资金费率 / Call CCXT to fetch funding rate
      const fundingRate = await this.exchange.fetchFundingRate(symbol);

      return {
        symbol: fundingRate.symbol,
        fundingRate: fundingRate.fundingRate,
        fundingTimestamp: fundingRate.fundingTimestamp,
        fundingDatetime: fundingRate.fundingDatetime,
        nextFundingRate: fundingRate.nextFundingRate || null,
        nextFundingTimestamp: fundingRate.nextFundingTimestamp || null,
        timestamp: fundingRate.timestamp,
        datetime: fundingRate.datetime,
        exchange: this.name,
      };
    }, `获取资金费率 / Fetch funding rate: ${symbol}`);
  }

  /**
   * 获取持仓信息
   * Fetch positions
   * @param {Array<string>} symbols - 交易对列表 / Symbol list
   * @returns {Promise<Array>} 持仓列表 / Position list
   */
  async fetchPositions(symbols = undefined) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') {
      throw this._createError('UNSUPPORTED', '持仓查询仅适用于合约交易 / Position query only available for futures');
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取持仓 / Call CCXT to fetch positions
      const positions = await this.exchange.fetchPositions(symbols);

      // 过滤并转换为统一格式 / Filter and convert to unified format
      return positions
        .filter(pos => parseFloat(pos.contracts) !== 0)
        .map(pos => this._normalizePosition(pos));
    }, '获取持仓 / Fetch positions');
  }

  /**
   * 获取订单簿
   * Get order book
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} limit - 深度限制 / Depth limit
   * @returns {Promise<Object>} 订单簿 / Order book
   */
  async fetchOrderBook(symbol, limit = 20) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      const orderBook = await this.exchange.fetchOrderBook(symbol, limit);

      return {
        symbol,
        bids: orderBook.bids,
        asks: orderBook.asks,
        timestamp: orderBook.timestamp,
        datetime: orderBook.datetime,
        nonce: orderBook.nonce,
        exchange: this.name,
      };
    }, `获取订单簿 / Fetch order book: ${symbol}`);
  }

  /**
   * 获取最近成交
   * Get recent trades
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 成交列表 / Trade list
   */
  async fetchTrades(symbol, limit = 100) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      const trades = await this.exchange.fetchTrades(symbol, undefined, limit);

      return trades.map(trade => ({
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        price: trade.price,
        amount: trade.amount,
        cost: trade.cost,
        timestamp: trade.timestamp,
        datetime: trade.datetime,
        exchange: this.name,
      }));
    }, `获取最近成交 / Fetch trades: ${symbol}`);
  }

  /**
   * 设置杠杆
   * Set leverage
   * @param {number} leverage - 杠杆倍数 / Leverage
   * @param {string} symbol - 交易对 / Trading pair
   * @param {Object} params - 额外参数 / Additional params
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setLeverage(leverage, symbol, params = {}) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') {
      throw this._createError('UNSUPPORTED', '杠杆设置仅适用于合约交易 / Leverage only available for futures');
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 设置杠杆 / Call CCXT to set leverage
      const result = await this.exchange.setLeverage(leverage, symbol, params);

      // 发出杠杆设置事件 / Emit leverage set event
      this.emit('leverageSet', { symbol, leverage, exchange: this.name });

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 杠杆已设置 / Leverage set: ${symbol} ${leverage}x`);

      return result;
    }, `设置杠杆 / Set leverage: ${symbol} ${leverage}x`);
  }

  /**
   * 获取账户信息
   * Get account info
   * @returns {Promise<Object>} 账户信息 / Account info
   */
  async fetchAccountInfo() {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // KuCoin 使用 fetchAccounts 获取账户信息 / KuCoin uses fetchAccounts
      const accounts = await this.exchange.fetchAccounts();

      return {
        accounts,
        exchange: this.name,
        timestamp: Date.now(),
      };
    }, '获取账户信息 / Fetch account info');
  }

  /**
   * 内部资金划转
   * Internal funds transfer
   * @param {string} code - 币种代码 / Currency code
   * @param {number} amount - 数量 / Amount
   * @param {string} fromAccount - 源账户 ('main' | 'trade' | 'margin') / Source account
   * @param {string} toAccount - 目标账户 ('main' | 'trade' | 'margin') / Target account
   * @returns {Promise<Object>} 划转结果 / Transfer result
   */
  async transfer(code, amount, fromAccount, toAccount) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证参数 / Validate parameters
    if (!code || !amount || !fromAccount || !toAccount) {
      throw this._createError('INVALID_PARAM', '缺少必要参数 / Missing required parameters');
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 进行划转 / Call CCXT to transfer
      const result = await this.exchange.transfer(code, amount, fromAccount, toAccount);

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 资金划转成功 / Transfer successful: ${amount} ${code} from ${fromAccount} to ${toAccount}`);

      return {
        ...result,
        exchange: this.name,
      };
    }, `资金划转 / Transfer: ${amount} ${code} from ${fromAccount} to ${toAccount}`);
  }
}

// 默认导出 / Default export
export default KuCoinExchange;
