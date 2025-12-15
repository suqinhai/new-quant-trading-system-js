/**
 * Bybit 交易所实现
 * Bybit Exchange Implementation
 *
 * 继承自 BaseExchange，实现 Bybit 特定的功能
 * Extends BaseExchange to implement Bybit-specific functionality
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt';

// 导入基类 / Import base class
import { BaseExchange } from './BaseExchange.js';

/**
 * Bybit 交易所类
 * Bybit Exchange Class
 */
export class BybitExchange extends BaseExchange {
  /**
   * 构造函数
   * Constructor
   * @param {Object} config - 配置对象 / Configuration object
   * @param {string} config.apiKey - API 密钥 / API key
   * @param {string} config.secret - API 密钥 / API secret
   * @param {boolean} config.sandbox - 是否使用测试网 / Whether to use testnet
   * @param {string} config.defaultType - 交易类型 ('spot' | 'swap' | 'future' | 'option') / Trading type
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super(config);

    // 设置交易所名称 / Set exchange name
    this.name = 'bybit';
  }

  /**
   * 创建 CCXT 交易所实例 (覆盖父类方法)
   * Create CCXT exchange instance (override parent method)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() {
    // 创建并返回 CCXT Bybit 实例 / Create and return CCXT Bybit instance
    return new ccxt.bybit({
      // API 认证信息 / API authentication
      apiKey: this.config.apiKey,         // API 密钥 / API key
      secret: this.config.secret,         // API 密钥 / API secret

      // 是否启用速率限制 / Whether to enable rate limiting
      enableRateLimit: this.config.enableRateLimit,

      // 超时设置 (毫秒) / Timeout settings (milliseconds)
      timeout: this.config.timeout,

      // 代理设置 / Proxy settings
      proxy: this.config.proxy,

      // 配置选项 / Configuration options
      options: {
        // 默认交易类型 / Default trading type
        // spot = 现货 / Spot
        // swap = 永续合约 / Perpetual
        // future = 交割合约 / Futures
        // option = 期权 / Options
        defaultType: this.config.defaultType,

        // 调整时间戳 / Adjust timestamp
        adjustForTimeDifference: true,

        // Bybit V5 API
        // Bybit 使用统一账户，V5 API 是最新版本
        // Bybit uses unified account, V5 API is the latest version

        // 合并额外选项 / Merge additional options
        ...this.config.options,
      },
    });
  }

  // ============================================
  // Bybit 特有方法 / Bybit-Specific Methods
  // ============================================

  /**
   * 获取 Bybit 服务器时间
   * Get Bybit server time
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
   * 设置持仓模式 (单向/双向)
   * Set position mode (one-way/hedge)
   * @param {boolean} hedgeMode - 是否使用对冲模式 / Whether to use hedge mode
   * @param {string} symbol - 交易对 (可选，Bybit 可能需要) / Trading pair (optional, Bybit may require)
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setPositionMode(hedgeMode = false, symbol = undefined) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 检查是否为合约交易 / Check if futures trading
    if (this.config.defaultType === 'spot') {
      // 现货不支持持仓模式 / Spot doesn't support position mode
      throw this._createError('UNSUPPORTED', '持仓模式仅适用于合约交易 / Position mode only available for futures');
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      try {
        // Bybit 持仓模式设置
        // Bybit position mode settings
        // mode: 0 = 单向持仓 (MergedSingle), 3 = 双向持仓 (BothSide)
        // mode: 0 = One-way mode, 3 = Hedge mode
        const mode = hedgeMode ? 3 : 0;

        // 构建请求参数 / Build request parameters
        const params = {
          category: this.config.defaultType === 'swap' ? 'linear' : 'linear',
          mode,
        };

        // 如果指定了交易对 / If symbol is specified
        if (symbol) {
          params.symbol = this.exchange.marketId(symbol);
        }

        // 调用 Bybit API 设置持仓模式 / Call Bybit API to set position mode
        const result = await this.exchange.privatePostV5PositionSwitchMode(params);

        // 发出持仓模式设置事件 / Emit position mode set event
        this.emit('positionModeSet', { hedgeMode, exchange: this.name });

        // 记录日志 / Log
        console.log(`[${this.name}] ✓ 持仓模式已设置 / Position mode set: ${hedgeMode ? '双向/Hedge' : '单向/One-way'}`);

        // 返回结果 / Return result
        return result;

      } catch (error) {
        // 如果错误是因为已经是该模式，则返回成功 / If already in that mode, return success
        if (error.message && (error.message.includes('same') || error.message.includes('not modified'))) {
          console.log(`[${this.name}] ✓ 持仓模式无需更改 / Position mode already set`);
          return { success: true, message: 'Position mode already set' };
        }

        // 其他错误继续抛出 / Throw other errors
        throw error;
      }
    }, `设置持仓模式 / Set position mode: ${hedgeMode}`);
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
        if (error.message && (error.message.includes('same') || error.message.includes('not modified'))) {
          console.log(`[${this.name}] ✓ 保证金模式无需更改 / Margin mode already set`);
          return { success: true, message: 'Margin mode already set' };
        }

        // 其他错误继续抛出 / Throw other errors
        throw error;
      }
    }, `设置保证金模式 / Set margin mode: ${symbol} ${marginMode}`);
  }

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
  async createStopOrder(symbol, side, amount, options = {}) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 验证必要参数 / Validate required parameters
    if (!options.stopPrice && !options.takeProfit && !options.stopLoss) {
      throw this._createError('INVALID_PARAM', '止损订单必须指定 stopPrice, takeProfit 或 stopLoss / Stop order requires stopPrice, takeProfit or stopLoss');
    }

    // 记录日志 / Log
    console.log(`[${this.name}] 创建止损订单 / Creating stop order:`, {
      symbol,
      side,
      amount,
      ...options,
    });

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调整数量精度 / Adjust amount precision
      const adjustedAmount = this._adjustPrecision(symbol, 'amount', amount);

      // 构建订单参数 / Build order parameters
      const params = {};

      // 设置触发价格 / Set trigger price
      if (options.stopPrice) {
        params.triggerPrice = options.stopPrice;
      }

      // 设置止盈 / Set take profit
      if (options.takeProfit) {
        params.takeProfit = options.takeProfit;
      }

      // 设置止损 / Set stop loss
      if (options.stopLoss) {
        params.stopLoss = options.stopLoss;
      }

      // Bybit 止损订单类型
      // Bybit stop order type
      // 根据参数决定订单类型 / Determine order type based on params
      let orderType = 'market';
      if (options.stopPrice) {
        orderType = 'market';  // 触发后执行市价单 / Execute market order after trigger
      }

      // 调用 CCXT 创建订单 / Call CCXT to create order
      const order = await this.exchange.createOrder(
        symbol,           // 交易对 / Symbol
        orderType,        // 订单类型 / Order type
        side,             // 买卖方向 / Side
        adjustedAmount,   // 数量 / Amount
        undefined,        // 市价单不需要价格 / Market order doesn't need price
        params            // 额外参数 / Additional params
      );

      // 转换为统一格式 / Convert to unified format
      const unifiedOrder = this._normalizeOrder(order);

      // 发出止损订单创建事件 / Emit stop order created event
      this.emit('stopOrderCreated', unifiedOrder);

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 止损订单创建成功 / Stop order created: ${unifiedOrder.id}`);

      // 返回统一格式订单 / Return unified order
      return unifiedOrder;
    }, `创建止损订单 / Create stop order: ${symbol}`);
  }

  /**
   * 获取钱包余额 (统一账户)
   * Get wallet balance (unified account)
   * @param {string} accountType - 账户类型 ('UNIFIED' | 'CONTRACT' | 'SPOT') / Account type
   * @returns {Promise<Object>} 钱包余额 / Wallet balance
   */
  async fetchWalletBalance(accountType = 'UNIFIED') {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 构建请求参数 / Build request parameters
      const params = {
        accountType,
      };

      // 调用 Bybit API 获取钱包余额 / Call Bybit API to fetch wallet balance
      const response = await this.exchange.privateGetV5AccountWalletBalance(params);

      // 解析响应数据 / Parse response data
      const result = response.result?.list?.[0];

      // 如果没有数据，返回空对象 / If no data, return empty object
      if (!result) {
        return {
          accountType,
          totalEquity: 0,
          totalAvailableBalance: 0,
          coins: [],
          exchange: this.name,
          timestamp: Date.now(),
        };
      }

      // 返回格式化的钱包余额 / Return formatted wallet balance
      return {
        accountType: result.accountType,                           // 账户类型 / Account type
        totalEquity: parseFloat(result.totalEquity || 0),          // 总权益 / Total equity
        totalAvailableBalance: parseFloat(result.totalAvailableBalance || 0),  // 可用余额 / Available balance
        totalMarginBalance: parseFloat(result.totalMarginBalance || 0),        // 保证金余额 / Margin balance
        totalInitialMargin: parseFloat(result.totalInitialMargin || 0),        // 初始保证金 / Initial margin
        totalMaintenanceMargin: parseFloat(result.totalMaintenanceMargin || 0), // 维持保证金 / Maintenance margin
        coins: (result.coin || []).map(coin => ({
          coin: coin.coin,                                         // 币种 / Coin
          equity: parseFloat(coin.equity || 0),                    // 权益 / Equity
          walletBalance: parseFloat(coin.walletBalance || 0),      // 钱包余额 / Wallet balance
          availableToWithdraw: parseFloat(coin.availableToWithdraw || 0),  // 可提现 / Available to withdraw
          unrealisedPnl: parseFloat(coin.unrealisedPnl || 0),      // 未实现盈亏 / Unrealized PnL
          cumRealisedPnl: parseFloat(coin.cumRealisedPnl || 0),    // 累计已实现盈亏 / Cumulative realized PnL
        })),
        exchange: this.name,                                       // 交易所名称 / Exchange name
        timestamp: Date.now(),                                     // 时间戳 / Timestamp
      };
    }, `获取钱包余额 / Fetch wallet balance: ${accountType}`);
  }

  /**
   * 获取交易记录
   * Get execution list
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 交易记录列表 / Execution list
   */
  async fetchExecutionList(symbol = undefined, limit = 50) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 如果指定了交易对，验证 / If symbol specified, validate
    if (symbol) {
      this._validateSymbol(symbol);
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 构建请求参数 / Build request parameters
      const params = {
        category: this.config.defaultType === 'spot' ? 'spot' : 'linear',
        limit,
      };

      // 如果指定了交易对 / If symbol is specified
      if (symbol) {
        params.symbol = this.exchange.marketId(symbol);
      }

      // 调用 Bybit API 获取交易记录 / Call Bybit API to fetch execution list
      const response = await this.exchange.privateGetV5ExecutionList(params);

      // 返回格式化的交易记录 / Return formatted execution list
      return (response.result?.list || []).map(item => ({
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
      }));
    }, `获取交易记录 / Fetch execution list: ${symbol || 'all'}`);
  }

  /**
   * 获取持仓信息 (覆盖父类方法，使用 Bybit V5 API)
   * Fetch positions (override parent method, use Bybit V5 API)
   * @param {string[]} symbols - 交易对列表 (可选) / Symbol list (optional)
   * @returns {Promise<Object[]>} 统一格式的持仓列表 / Unified position list
   */
  async fetchPositions(symbols = undefined) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 如果是现货，返回空数组 / If spot, return empty array
    if (this.config.defaultType === 'spot') {
      return [];
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 构建请求参数 / Build request parameters
      const params = {
        category: this.config.defaultType === 'swap' ? 'linear' : 'linear',
        settleCoin: 'USDT',  // 结算币种 / Settlement coin
      };

      // 如果指定了交易对 / If symbols specified
      if (symbols && symbols.length === 1) {
        params.symbol = this.exchange.marketId(symbols[0]);
      }

      // 调用 Bybit API 获取持仓 / Call Bybit API to fetch positions
      const response = await this.exchange.privateGetV5PositionList(params);

      // 过滤有效持仓并转换为统一格式 / Filter valid positions and convert to unified format
      return (response.result?.list || [])
        .filter(pos => {
          // 过滤掉空仓位 / Filter out empty positions
          const size = Math.abs(parseFloat(pos.size || 0));
          return size > 0;
        })
        .map(pos => ({
          // 交易对 / Symbol
          symbol: pos.symbol,

          // 持仓方向 / Position side
          side: pos.side?.toLowerCase() === 'buy' ? 'long' : 'short',

          // 持仓数量 (合约数) / Position size (contracts)
          contracts: parseFloat(pos.size || 0),

          // 持仓价值 / Notional value
          notional: parseFloat(pos.positionValue || 0),

          // 开仓均价 / Entry price
          entryPrice: parseFloat(pos.avgPrice || 0),

          // 标记价格 / Mark price
          markPrice: parseFloat(pos.markPrice || 0),

          // 清算价格 / Liquidation price
          liquidationPrice: parseFloat(pos.liqPrice || 0),

          // 杠杆倍数 / Leverage
          leverage: parseFloat(pos.leverage || 1),

          // 未实现盈亏 / Unrealized PnL
          unrealizedPnl: parseFloat(pos.unrealisedPnl || 0),

          // 已实现盈亏 / Realized PnL
          realizedPnl: parseFloat(pos.cumRealisedPnl || 0),

          // 保证金模式 (cross/isolated) / Margin mode
          marginMode: pos.tradeMode === '0' ? 'cross' : 'isolated',

          // 保证金 / Collateral
          collateral: parseFloat(pos.positionIM || 0),

          // 止盈价格 / Take profit price
          takeProfit: parseFloat(pos.takeProfit || 0) || null,

          // 止损价格 / Stop loss price
          stopLoss: parseFloat(pos.stopLoss || 0) || null,

          // 交易所名称 / Exchange name
          exchange: this.name,

          // 时间戳 / Timestamp
          timestamp: parseInt(pos.updatedTime || Date.now()),

          // 原始数据 / Raw data
          raw: pos,
        }));
    }, '获取持仓 / Fetch positions');
  }

  /**
   * 获取交易历史 (最近 7 天)
   * Get trade history (last 7 days)
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Array>} 交易历史 / Trade history
   */
  async fetchRecentTrades(symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 计算 7 天前的时间戳 / Calculate timestamp 7 days ago
      const since = Date.now() - (7 * 24 * 60 * 60 * 1000);

      // 调用 CCXT 获取交易历史 / Call CCXT to fetch trade history
      const trades = await this.exchange.fetchMyTrades(symbol, since, 500);

      // 返回交易历史 / Return trade history
      return trades.map(trade => ({
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
      }));
    }, `获取近期交易 / Fetch recent trades: ${symbol}`);
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
export default BybitExchange;
