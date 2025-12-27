/**
 * Deribit 交易所实现
 * Deribit Exchange Implementation
 *
 * 继承自 BaseExchange，实现 Deribit 特定的功能
 * Extends BaseExchange to implement Deribit-specific functionality
 *
 * Deribit 特点 / Deribit Features:
 * - 专注于加密货币衍生品 / Focused on crypto derivatives
 * - 支持 BTC 和 ETH 的期货和期权 / Supports BTC and ETH futures and options
 * - 永续合约使用反向合约 / Perpetuals use inverse contracts
 * - 有完善的期权交易支持 / Comprehensive options trading support
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt';

// 导入基类 / Import base class
import { BaseExchange } from './BaseExchange.js';

/**
 * Deribit 交易所类
 * Deribit Exchange Class
 */
export class DeribitExchange extends BaseExchange {
  /**
   * 构造函数
   * Constructor
   * @param {Object} config - 配置对象 / Configuration object
   * @param {string} config.apiKey - API 密钥 / API key
   * @param {string} config.secret - API 密钥 / API secret
   * @param {boolean} config.sandbox - 是否使用测试网 / Whether to use testnet
   * @param {string} config.defaultType - 交易类型 ('swap' | 'future' | 'option') / Trading type
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super(config);

    // 设置交易所名称 / Set exchange name
    this.name = 'deribit';

    // Deribit 默认交易类型为 swap (永续合约)
    // Deribit default trading type is swap (perpetual)
    if (!this.config.defaultType) {
      this.config.defaultType = 'swap';
    }
  }

  /**
   * 创建 CCXT 交易所实例 (覆盖父类方法)
   * Create CCXT exchange instance (override parent method)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() {
    // 创建并返回 CCXT Deribit 实例 / Create and return CCXT Deribit instance
    return new ccxt.deribit({
      // API 认证信息 / API authentication
      apiKey: this.config.apiKey,         // API 密钥 / API key
      secret: this.config.secret,         // API 密钥 / API secret

      // 是否启用速率限制 / Whether to enable rate limiting
      enableRateLimit: this.config.enableRateLimit,

      // 超时设置 (毫秒) / Timeout settings (milliseconds)
      timeout: this.config.timeout,

      // 代理设置 / Proxy settings
      proxy: this.config.proxy,

      // 沙盒/测试网模式 / Sandbox/Testnet mode
      sandbox: this.config.sandbox,

      // 配置选项 / Configuration options
      options: {
        // 默认交易类型 / Default trading type
        // swap = 永续合约 / Perpetual
        // future = 交割合约 / Futures
        // option = 期权 / Options
        defaultType: this.config.defaultType,

        // 调整时间戳 / Adjust timestamp
        adjustForTimeDifference: true,

        // 合并额外选项 / Merge additional options
        ...this.config.options,
      },
    });
  }

  // ============================================
  // Deribit 特有方法 / Deribit-Specific Methods
  // ============================================

  /**
   * 获取 Deribit 服务器时间
   * Get Deribit server time
   * @returns {Promise<number>} 服务器时间戳 / Server timestamp
   */
  async fetchServerTime() {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取服务器时间 / Call CCXT to fetch server time
      const response = await this.exchange.fetchTime();

      // 返回服务器时间戳 / Return server timestamp
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

    // 检查是否为永续合约交易 / Check if perpetual trading
    if (this.config.defaultType !== 'swap') {
      // 仅永续合约支持资金费率 / Only perpetuals support funding rate
      throw this._createError('UNSUPPORTED', '资金费率仅适用于永续合约交易 / Funding rate only available for perpetual swaps');
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
   * 获取期权链数据
   * Get option chain data
   * @param {string} baseAsset - 标的资产 ('BTC' | 'ETH') / Underlying asset
   * @returns {Promise<Array>} 期权链数据 / Option chain data
   */
  async fetchOptionChain(baseAsset = 'BTC') {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 获取所有市场 / Get all markets
      const markets = this.exchange.markets;

      // 过滤出期权市场 / Filter option markets
      const options = Object.values(markets).filter(market => {
        return market.type === 'option' &&
               market.base === baseAsset;
      });

      // 获取每个期权的行情 / Get ticker for each option
      const optionData = await Promise.all(
        options.slice(0, 50).map(async (option) => {  // 限制数量避免超时
          try {
            const ticker = await this.exchange.fetchTicker(option.symbol);
            return {
              symbol: option.symbol,
              strike: option.strike,
              optionType: option.optionType,  // 'call' or 'put'
              expiry: option.expiry,
              expiryDatetime: option.expiryDatetime,
              bid: ticker.bid,
              ask: ticker.ask,
              last: ticker.last,
              volume: ticker.baseVolume,
              openInterest: ticker.info?.open_interest,
              impliedVolatility: ticker.info?.mark_iv,
              delta: ticker.info?.greeks?.delta,
              gamma: ticker.info?.greeks?.gamma,
              theta: ticker.info?.greeks?.theta,
              vega: ticker.info?.greeks?.vega,
              exchange: this.name,
              timestamp: Date.now(),
            };
          } catch (error) {
            // 跳过获取失败的期权 / Skip failed options
            return null;
          }
        })
      );

      // 过滤掉失败的结果 / Filter out failed results
      return optionData.filter(item => item !== null);
    }, `获取期权链 / Fetch option chain: ${baseAsset}`);
  }

  /**
   * 获取标的资产指数价格
   * Get underlying index price
   * @param {string} baseAsset - 标的资产 ('BTC' | 'ETH') / Underlying asset
   * @returns {Promise<Object>} 指数价格信息 / Index price info
   */
  async fetchIndexPrice(baseAsset = 'BTC') {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // Deribit 使用特定的符号获取指数价格
      // Deribit uses specific symbol for index price
      const indexSymbol = `${baseAsset}_USD`;

      try {
        // 尝试通过私有 API 获取指数价格
        // Try to fetch index price via private API
        const response = await this.exchange.publicGetGetIndexPrice({
          index_name: `${baseAsset.toLowerCase()}_usd`,
        });

        return {
          asset: baseAsset,
          indexPrice: parseFloat(response.result?.index_price || 0),
          estimatedDeliveryPrice: parseFloat(response.result?.estimated_delivery_price || 0),
          exchange: this.name,
          timestamp: Date.now(),
        };
      } catch (error) {
        // 如果上面方法失败，尝试从永续合约行情获取
        // If above method fails, try to get from perpetual ticker
        const perpSymbol = `${baseAsset}/USD:${baseAsset}`;
        const ticker = await this.exchange.fetchTicker(perpSymbol);

        return {
          asset: baseAsset,
          indexPrice: ticker.info?.index_price ? parseFloat(ticker.info.index_price) : ticker.last,
          estimatedDeliveryPrice: null,
          exchange: this.name,
          timestamp: Date.now(),
        };
      }
    }, `获取指数价格 / Fetch index price: ${baseAsset}`);
  }

  /**
   * 获取账户摘要
   * Get account summary
   * @param {string} currency - 币种 ('BTC' | 'ETH') / Currency
   * @returns {Promise<Object>} 账户摘要 / Account summary
   */
  async fetchAccountSummary(currency = 'BTC') {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 Deribit API 获取账户摘要
      // Call Deribit API to fetch account summary
      const response = await this.exchange.privateGetGetAccountSummary({
        currency: currency.toUpperCase(),
      });

      const summary = response.result;

      // 返回格式化的账户摘要 / Return formatted account summary
      return {
        currency: summary.currency,                              // 币种 / Currency
        equity: parseFloat(summary.equity || 0),                 // 权益 / Equity
        balance: parseFloat(summary.balance || 0),               // 余额 / Balance
        availableBalance: parseFloat(summary.available_withdrawal_funds || 0),  // 可用余额 / Available balance
        marginBalance: parseFloat(summary.margin_balance || 0),  // 保证金余额 / Margin balance
        initialMargin: parseFloat(summary.initial_margin || 0),  // 初始保证金 / Initial margin
        maintenanceMargin: parseFloat(summary.maintenance_margin || 0),  // 维持保证金 / Maintenance margin
        unrealizedPnl: parseFloat(summary.total_pl || 0),        // 未实现盈亏 / Unrealized PnL
        realizedPnl: parseFloat(summary.session_rpl || 0),       // 已实现盈亏 / Realized PnL
        deltaTotal: parseFloat(summary.delta_total || 0),        // 总 Delta / Total Delta
        optionsGammaMap: summary.options_gamma_map,              // 期权 Gamma / Options Gamma
        optionsVega: parseFloat(summary.options_vega || 0),      // 期权 Vega / Options Vega
        optionsTheta: parseFloat(summary.options_theta || 0),    // 期权 Theta / Options Theta
        exchange: this.name,                                     // 交易所名称 / Exchange name
        timestamp: Date.now(),                                   // 时间戳 / Timestamp
      };
    }, `获取账户摘要 / Fetch account summary: ${currency}`);
  }

  /**
   * 获取持仓信息 (覆盖父类方法)
   * Fetch positions (override parent method)
   * @param {string[]} symbols - 交易对列表 (可选) / Symbol list (optional)
   * @returns {Promise<Object[]>} 统一格式的持仓列表 / Unified position list
   */
  async fetchPositions(symbols = undefined) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取持仓 / Call CCXT to fetch positions
      const positions = await this.exchange.fetchPositions(symbols);

      // 过滤有效持仓并转换为统一格式 / Filter valid positions and convert to unified format
      return positions
        .filter(pos => {
          // 过滤掉空仓位 / Filter out empty positions
          const size = Math.abs(parseFloat(pos.contracts || pos.info?.size || 0));
          return size > 0;
        })
        .map(pos => ({
          // 交易对 / Symbol
          symbol: pos.symbol,

          // 持仓方向 / Position side
          side: pos.side || (parseFloat(pos.info?.size || 0) > 0 ? 'long' : 'short'),

          // 持仓数量 (合约数) / Position size (contracts)
          contracts: Math.abs(parseFloat(pos.contracts || pos.info?.size || 0)),

          // 持仓价值 / Notional value
          notional: parseFloat(pos.notional || 0),

          // 开仓均价 / Entry price
          entryPrice: parseFloat(pos.entryPrice || pos.info?.average_price || 0),

          // 标记价格 / Mark price
          markPrice: parseFloat(pos.markPrice || pos.info?.mark_price || 0),

          // 清算价格 / Liquidation price
          liquidationPrice: parseFloat(pos.liquidationPrice || pos.info?.estimated_liquidation_price || 0),

          // 杠杆倍数 / Leverage
          leverage: parseFloat(pos.leverage || pos.info?.leverage || 1),

          // 未实现盈亏 / Unrealized PnL
          unrealizedPnl: parseFloat(pos.unrealizedPnl || pos.info?.total_profit_loss || 0),

          // 已实现盈亏 / Realized PnL
          realizedPnl: parseFloat(pos.info?.realized_profit_loss || 0),

          // 保证金模式 (Deribit 默认为 cross) / Margin mode
          marginMode: 'cross',

          // 保证金 / Collateral
          collateral: parseFloat(pos.collateral || pos.info?.initial_margin || 0),

          // Delta (期权/合约) / Delta
          delta: parseFloat(pos.info?.delta || 0),

          // 仓位类型 / Position type (future/option)
          instrumentType: pos.info?.kind || 'future',

          // 交易所名称 / Exchange name
          exchange: this.name,

          // 时间戳 / Timestamp
          timestamp: Date.now(),

          // 原始数据 / Raw data
          raw: pos,
        }));
    }, '获取持仓 / Fetch positions');
  }

  /**
   * 设置杠杆倍数 (覆盖父类方法)
   * Set leverage (override parent method)
   * @param {number} leverage - 杠杆倍数 / Leverage
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setLeverage(leverage, symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 验证杠杆倍数 / Validate leverage
    if (leverage < 1 || leverage > 100) {
      throw this._createError('INVALID_PARAM', `无效的杠杆倍数: ${leverage} (1-100) / Invalid leverage: ${leverage} (1-100)`);
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 设置杠杆 / Call CCXT to set leverage
      const result = await this.exchange.setLeverage(leverage, symbol);

      // 发出杠杆设置事件 / Emit leverage set event
      this.emit('leverageSet', { symbol, leverage, exchange: this.name });

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 杠杆已设置 / Leverage set: ${symbol} ${leverage}x`);

      // 返回结果 / Return result
      return result;
    }, `设置杠杆 / Set leverage: ${symbol} ${leverage}x`);
  }

  /**
   * 获取可用合约列表
   * Get available instruments
   * @param {string} currency - 币种 ('BTC' | 'ETH') / Currency
   * @param {string} kind - 类型 ('future' | 'option' | 'spot') / Kind
   * @returns {Promise<Array>} 合约列表 / Instrument list
   */
  async fetchInstruments(currency = 'BTC', kind = 'future') {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 Deribit API 获取合约列表
      // Call Deribit API to fetch instruments
      const response = await this.exchange.publicGetGetInstruments({
        currency: currency.toUpperCase(),
        kind,
        expired: false,
      });

      // 返回格式化的合约列表 / Return formatted instrument list
      return (response.result || []).map(inst => ({
        symbol: inst.instrument_name,                    // 合约名称 / Instrument name
        baseCurrency: inst.base_currency,                // 基础货币 / Base currency
        quoteCurrency: inst.quote_currency,              // 报价货币 / Quote currency
        kind: inst.kind,                                 // 类型 / Kind
        isActive: inst.is_active,                        // 是否活跃 / Is active
        contractSize: parseFloat(inst.contract_size),    // 合约大小 / Contract size
        tickSize: parseFloat(inst.tick_size),            // 最小变动 / Tick size
        minTradeAmount: parseFloat(inst.min_trade_amount), // 最小交易量 / Min trade amount
        expirationTimestamp: inst.expiration_timestamp,  // 到期时间 / Expiration timestamp
        strike: inst.strike,                             // 行权价 (期权) / Strike (options)
        optionType: inst.option_type,                    // 期权类型 / Option type
        settlementPeriod: inst.settlement_period,        // 结算周期 / Settlement period
        exchange: this.name,                             // 交易所名称 / Exchange name
      }));
    }, `获取合约列表 / Fetch instruments: ${currency} ${kind}`);
  }

  /**
   * 获取历史波动率
   * Get historical volatility
   * @param {string} currency - 币种 ('BTC' | 'ETH') / Currency
   * @returns {Promise<Object>} 历史波动率 / Historical volatility
   */
  async fetchHistoricalVolatility(currency = 'BTC') {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 Deribit API 获取历史波动率
      // Call Deribit API to fetch historical volatility
      const response = await this.exchange.publicGetGetHistoricalVolatility({
        currency: currency.toUpperCase(),
      });

      // 返回格式化的历史波动率 / Return formatted historical volatility
      return {
        currency,
        volatility: response.result || [],
        exchange: this.name,
        timestamp: Date.now(),
      };
    }, `获取历史波动率 / Fetch historical volatility: ${currency}`);
  }

  /**
   * 获取订单簿
   * Get order book
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} depth - 深度 / Depth
   * @returns {Promise<Object>} 订单簿 / Order book
   */
  async fetchOrderBook(symbol, depth = 20) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取订单簿 / Call CCXT to fetch order book
      const orderBook = await this.exchange.fetchOrderBook(symbol, depth);

      // 返回订单簿 / Return order book
      return {
        symbol,
        bids: orderBook.bids,        // 买单 / Bids
        asks: orderBook.asks,        // 卖单 / Asks
        timestamp: orderBook.timestamp,
        datetime: orderBook.datetime,
        nonce: orderBook.nonce,
        exchange: this.name,
      };
    }, `获取订单簿 / Fetch order book: ${symbol}`);
  }

  /**
   * 获取交易历史
   * Get recent trades
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 交易历史 / Trade history
   */
  async fetchRecentTrades(symbol, limit = 100) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取交易历史 / Call CCXT to fetch trades
      const trades = await this.exchange.fetchTrades(symbol, undefined, limit);

      // 返回交易历史 / Return trade history
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
    }, `获取交易历史 / Fetch recent trades: ${symbol}`);
  }

  /**
   * 获取我的交易历史
   * Get my trades
   * @param {string} symbol - 交易对 / Trading pair
   * @param {number} since - 起始时间戳 / Start timestamp
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 我的交易历史 / My trade history
   */
  async fetchMyTrades(symbol, since = undefined, limit = 100) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    if (symbol) {
      this._validateSymbol(symbol);
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取我的交易历史 / Call CCXT to fetch my trades
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
    }, `获取我的交易历史 / Fetch my trades: ${symbol || 'all'}`);
  }

  /**
   * 获取订单历史
   * Get order history
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 订单历史 / Order history
   */
  async fetchOrderHistory(symbol = undefined, limit = 50) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 如果指定了交易对，验证 / If symbol specified, validate
    if (symbol) {
      this._validateSymbol(symbol);
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取订单历史 / Call CCXT to fetch order history
      const orders = await this.exchange.fetchOrders(symbol, undefined, limit);

      // 返回统一格式的订单列表 / Return unified order list
      return orders.map(order => this._normalizeOrder(order));
    }, `获取订单历史 / Fetch order history: ${symbol || 'all'}`);
  }
}

// 默认导出 / Default export
export default DeribitExchange;
