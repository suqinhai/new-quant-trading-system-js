/**
 * OKX 交易所实现
 * OKX Exchange Implementation
 *
 * 继承自 BaseExchange，实现 OKX 特定的功能
 * Extends BaseExchange to implement OKX-specific functionality
 */

// 导入 CCXT 库 / Import CCXT library
import ccxt from 'ccxt';

// 导入基类 / Import base class
import { BaseExchange } from './BaseExchange.js';

/**
 * OKX 交易所类
 * OKX Exchange Class
 */
export class OKXExchange extends BaseExchange {
  /**
   * 构造函数
   * Constructor
   * @param {Object} config - 配置对象 / Configuration object
   * @param {string} config.apiKey - API 密钥 / API key
   * @param {string} config.secret - API 密钥 / API secret
   * @param {string} config.password - API 密码短语 / API passphrase (OKX 特有)
   * @param {boolean} config.sandbox - 是否使用模拟盘 / Whether to use sandbox
   * @param {string} config.defaultType - 交易类型 ('spot' | 'swap' | 'future' | 'option') / Trading type
   */
  constructor(config = {}) {
    // 调用父类构造函数 / Call parent constructor
    super(config);

    // 设置交易所名称 / Set exchange name
    this.name = 'okx';
  }

  /**
   * 创建 CCXT 交易所实例 (覆盖父类方法)
   * Create CCXT exchange instance (override parent method)
   * @returns {ccxt.Exchange} CCXT 实例 / CCXT instance
   * @protected
   */
  _createExchange() {
    // 创建并返回 CCXT OKX 实例 / Create and return CCXT OKX instance
    return new ccxt.okx({
      // API 认证信息 / API authentication
      apiKey: this.config.apiKey,         // API 密钥 / API key
      secret: this.config.secret,         // API 密钥 / API secret
      password: this.config.password,     // OKX 特有的密码短语 / OKX-specific passphrase

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

        // 创建市价单时不需要价格 / Market order doesn't require price
        createMarketBuyOrderRequiresPrice: false,

        // 合并额外选项 / Merge additional options
        ...this.config.options,
      },
    });
  }

  // ============================================
  // OKX 特有方法 / OKX-Specific Methods
  // ============================================

  /**
   * 获取账户配置信息
   * Get account configuration
   * @returns {Promise<Object>} 账户配置 / Account configuration
   */
  async fetchAccountConfig() {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 OKX API 获取账户配置 / Call OKX API to fetch account config
      const response = await this.exchange.privateGetAccountConfig();

      // 解析响应数据 / Parse response data
      const data = response.data?.[0];

      // 返回账户配置 / Return account configuration
      return {
        posMode: data?.posMode,              // 持仓模式 (long_short_mode/net_mode) / Position mode
        autoLoan: data?.autoLoan,            // 自动借币 / Auto loan
        level: data?.level,                  // 账户等级 / Account level
        levelTmp: data?.levelTmp,            // 临时等级 / Temporary level
        acctLv: data?.acctLv,                // 账户模式 (1=简单, 2=单币种保证金, 3=跨币种保证金, 4=组合保证金) / Account mode
        uid: data?.uid,                      // 用户 ID / User ID
        exchange: this.name,                 // 交易所名称 / Exchange name
        timestamp: Date.now(),               // 时间戳 / Timestamp
      };
    }, '获取账户配置 / Fetch account config');
  }

  /**
   * 设置持仓模式
   * Set position mode
   * @param {string} posMode - 持仓模式 ('long_short_mode' | 'net_mode') / Position mode
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setPositionMode(posMode) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证持仓模式参数 / Validate position mode parameter
    const validModes = ['long_short_mode', 'net_mode'];
    if (!validModes.includes(posMode)) {
      throw this._createError('INVALID_PARAM', `无效的持仓模式 / Invalid position mode: ${posMode}`);
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      try {
        // 设置持仓模式 / Set position mode
        // long_short_mode: 双向持仓 / Hedge mode
        // net_mode: 单向持仓 / One-way mode
        const response = await this.exchange.privatePostAccountSetPositionMode({
          posMode,
        });

        // 发出持仓模式设置事件 / Emit position mode set event
        this.emit('positionModeSet', { posMode, exchange: this.name });

        // 记录日志 / Log
        console.log(`[${this.name}] ✓ 持仓模式已设置 / Position mode set: ${posMode}`);

        // 返回结果 / Return result
        return response;

      } catch (error) {
        // 如果已经是该模式，返回成功 / If already in that mode, return success
        if (error.message && error.message.includes('already')) {
          console.log(`[${this.name}] ✓ 持仓模式无需更改 / Position mode already set`);
          return { success: true, message: 'Position mode already set' };
        }

        // 其他错误继续抛出 / Throw other errors
        throw error;
      }
    }, `设置持仓模式 / Set position mode: ${posMode}`);
  }

  /**
   * 获取标记价格
   * Get mark price
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 标记价格信息 / Mark price information
   */
  async fetchMarkPrice(symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 获取标记价格 / Call CCXT to fetch mark price
      const markPrice = await this.exchange.fetchMarkPrice(symbol);

      // 返回标记价格信息 / Return mark price information
      return {
        symbol,                              // 交易对 / Trading pair
        markPrice: markPrice.markPrice,      // 标记价格 / Mark price
        indexPrice: markPrice.indexPrice,    // 指数价格 / Index price
        timestamp: markPrice.timestamp,      // 时间戳 / Timestamp
        exchange: this.name,                 // 交易所名称 / Exchange name
      };
    }, `获取标记价格 / Fetch mark price: ${symbol}`);
  }

  /**
   * 设置杠杆倍数 (覆盖父类方法，增加 OKX 特有参数)
   * Set leverage (override parent method, add OKX-specific parameters)
   * @param {number} leverage - 杠杆倍数 / Leverage multiplier
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} marginMode - 保证金模式 ('cross' | 'isolated') / Margin mode
   * @param {string} posSide - 持仓方向 ('long' | 'short' | 'net') / Position side
   * @returns {Promise<Object>} 设置结果 / Setting result
   */
  async setLeverage(leverage, symbol, marginMode = 'cross', posSide = 'net') {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 验证杠杆倍数 / Validate leverage
    if (typeof leverage !== 'number' || leverage < 1 || leverage > 125) {
      throw this._createError('INVALID_PARAM', `无效的杠杆倍数 / Invalid leverage: ${leverage}`);
    }

    // 验证保证金模式 / Validate margin mode
    const validModes = ['cross', 'isolated'];
    if (!validModes.includes(marginMode)) {
      throw this._createError('INVALID_PARAM', `无效的保证金模式 / Invalid margin mode: ${marginMode}`);
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 CCXT 设置杠杆 / Call CCXT to set leverage
      const result = await this.exchange.setLeverage(leverage, symbol, {
        mgnMode: marginMode,  // 保证金模式 / Margin mode
        posSide,              // 持仓方向 / Position side
      });

      // 发出杠杆设置事件 / Emit leverage set event
      this.emit('leverageSet', { symbol, leverage, marginMode, posSide, exchange: this.name });

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 杠杆已设置 / Leverage set: ${symbol} ${leverage}x (${marginMode})`);

      // 返回结果 / Return result
      return result;
    }, `设置杠杆 / Set leverage: ${symbol} ${leverage}x`);
  }

  /**
   * 创建算法订单 (包括冰山单、时间加权等)
   * Create algorithmic order (including iceberg, TWAP, etc.)
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} type - 订单类型 / Order type
   * @param {string} side - 买卖方向 / Side
   * @param {number} amount - 数量 / Amount
   * @param {Object} algoParams - 算法参数 / Algorithm parameters
   * @returns {Promise<Object>} 订单信息 / Order information
   */
  async createAlgoOrder(symbol, type, side, amount, algoParams = {}) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 记录日志 / Log
    console.log(`[${this.name}] 创建算法订单 / Creating algo order:`, {
      symbol,
      type,
      side,
      amount,
      ...algoParams,
    });

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调整数量精度 / Adjust amount precision
      const adjustedAmount = this._adjustPrecision(symbol, 'amount', amount);

      // 构建订单参数 / Build order parameters
      const params = {
        ...algoParams,
        tdMode: algoParams.marginMode || 'cross',  // 交易模式 / Trade mode
      };

      // 调用 CCXT 创建订单 / Call CCXT to create order
      const order = await this.exchange.createOrder(
        symbol,           // 交易对 / Symbol
        type,             // 订单类型 / Order type
        side,             // 买卖方向 / Side
        adjustedAmount,   // 数量 / Amount
        undefined,        // 价格 (根据类型可能需要) / Price (may need based on type)
        params            // 额外参数 / Additional params
      );

      // 转换为统一格式 / Convert to unified format
      const unifiedOrder = this._normalizeOrder(order);

      // 发出算法订单创建事件 / Emit algo order created event
      this.emit('algoOrderCreated', unifiedOrder);

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 算法订单创建成功 / Algo order created: ${unifiedOrder.id}`);

      // 返回统一格式订单 / Return unified order
      return unifiedOrder;
    }, `创建算法订单 / Create algo order: ${symbol}`);
  }

  /**
   * 获取未完成的算法订单
   * Get open algorithmic orders
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @param {string} algoType - 算法类型 / Algorithm type
   * @returns {Promise<Array>} 算法订单列表 / Algorithmic order list
   */
  async fetchOpenAlgoOrders(symbol = undefined, algoType = 'conditional') {
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
        ordType: algoType,  // 订单类型: conditional, oco, trigger, etc.
      };

      // 如果指定了交易对 / If symbol is specified
      if (symbol) {
        params.instId = this.exchange.marketId(symbol);
      }

      // 调用 OKX API 获取算法订单 / Call OKX API to fetch algo orders
      const response = await this.exchange.privateGetTradeOrdersAlgoPending(params);

      // 返回订单列表 / Return order list
      return (response.data || []).map(order => ({
        algoId: order.algoId,                          // 算法订单 ID / Algo order ID
        symbol: order.instId,                          // 交易对 / Trading pair
        ordType: order.ordType,                        // 订单类型 / Order type
        side: order.side?.toLowerCase(),               // 买卖方向 / Side
        sz: parseFloat(order.sz || 0),                 // 数量 / Size
        triggerPx: parseFloat(order.triggerPx || 0),   // 触发价格 / Trigger price
        ordPx: parseFloat(order.ordPx || 0),           // 订单价格 / Order price
        state: order.state,                            // 状态 / State
        cTime: parseInt(order.cTime),                  // 创建时间 / Create time
        exchange: this.name,                           // 交易所名称 / Exchange name
      }));
    }, `获取算法订单 / Fetch open algo orders: ${symbol || 'all'}`);
  }

  /**
   * 取消算法订单
   * Cancel algorithmic order
   * @param {string} algoId - 算法订单 ID / Algorithmic order ID
   * @param {string} symbol - 交易对 / Trading pair
   * @returns {Promise<Object>} 取消结果 / Cancellation result
   */
  async cancelAlgoOrder(algoId, symbol) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 记录日志 / Log
    console.log(`[${this.name}] 取消算法订单 / Canceling algo order: ${algoId}`);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 调用 OKX API 取消算法订单 / Call OKX API to cancel algo order
      const result = await this.exchange.privatePostTradeCancelAlgos([{
        algoId,
        instId: this.exchange.marketId(symbol),
      }]);

      // 发出算法订单取消事件 / Emit algo order cancelled event
      this.emit('algoOrderCancelled', { algoId, symbol, exchange: this.name });

      // 记录日志 / Log
      console.log(`[${this.name}] ✓ 算法订单已取消 / Algo order cancelled: ${algoId}`);

      // 返回结果 / Return result
      return result;
    }, `取消算法订单 / Cancel algo order: ${algoId}`);
  }

  /**
   * 获取最大可开仓数量
   * Get maximum available size
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 买卖方向 / Side
   * @param {number} price - 价格 (可选) / Price (optional)
   * @returns {Promise<Object>} 最大可开仓信息 / Maximum available size info
   */
  async fetchMaxAvailableSize(symbol, side, price = undefined) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 构建请求参数 / Build request parameters
      const params = {
        instId: this.exchange.marketId(symbol),
        tdMode: 'cross',  // 交易模式 / Trade mode
      };

      // 如果指定了价格 / If price is specified
      if (price) {
        params.px = price.toString();
      }

      // 调用 OKX API 获取最大可开仓数量 / Call OKX API to fetch max size
      const response = await this.exchange.privateGetAccountMaxSize(params);

      // 解析响应数据 / Parse response data
      const data = response.data?.[0];

      // 返回结果 / Return result
      return {
        symbol,                                              // 交易对 / Trading pair
        maxBuy: parseFloat(data?.maxBuy || 0),               // 最大可买 / Max buy
        maxSell: parseFloat(data?.maxSell || 0),             // 最大可卖 / Max sell
        exchange: this.name,                                 // 交易所名称 / Exchange name
        timestamp: Date.now(),                               // 时间戳 / Timestamp
      };
    }, `获取最大可开仓 / Fetch max available size: ${symbol}`);
  }

  /**
   * 获取持仓风险信息
   * Get position risk information
   * @param {string} symbol - 交易对 (可选) / Trading pair (optional)
   * @returns {Promise<Array>} 持仓风险列表 / Position risk list
   */
  async fetchPositionRisk(symbol = undefined) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 如果指定了交易对，验证 / If symbol specified, validate
    if (symbol) {
      this._validateSymbol(symbol);
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 获取持仓 / Fetch positions
      const positions = await this.exchange.fetchPositions(symbol ? [symbol] : undefined);

      // 过滤有效持仓并返回风险信息 / Filter valid positions and return risk info
      return positions
        .filter(pos => Math.abs(parseFloat(pos.contracts || 0)) > 0)
        .map(pos => ({
          symbol: pos.symbol,                            // 交易对 / Trading pair
          side: pos.side,                                // 持仓方向 / Position side
          contracts: pos.contracts,                      // 合约数量 / Number of contracts
          entryPrice: pos.entryPrice,                    // 开仓均价 / Entry price
          markPrice: pos.markPrice,                      // 标记价格 / Mark price
          leverage: pos.leverage,                        // 杠杆倍数 / Leverage
          unrealizedPnl: pos.unrealizedPnl,              // 未实现盈亏 / Unrealized PnL
          liquidationPrice: pos.liquidationPrice,        // 强平价格 / Liquidation price
          maintenanceMargin: pos.maintenanceMargin,      // 维持保证金 / Maintenance margin
          initialMargin: pos.initialMargin,              // 初始保证金 / Initial margin
          marginRatio: pos.marginRatio,                  // 保证金率 / Margin ratio
          exchange: this.name,                           // 交易所名称 / Exchange name
          timestamp: Date.now(),                         // 时间戳 / Timestamp
        }));
    }, `获取持仓风险 / Fetch position risk: ${symbol || 'all'}`);
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
   * 获取账户账单流水
   * Get account bills
   * @param {string} instType - 产品类型 ('SPOT' | 'MARGIN' | 'SWAP' | 'FUTURES' | 'OPTION') / Instrument type
   * @param {number} limit - 数量限制 / Limit
   * @returns {Promise<Array>} 账单列表 / Bills list
   */
  async fetchBills(instType = undefined, limit = 100) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 构建请求参数 / Build request parameters
      const params = { limit };

      // 如果指定了产品类型 / If instrument type specified
      if (instType) {
        params.instType = instType;
      }

      // 调用 OKX API 获取账单 / Call OKX API to fetch bills
      const response = await this.exchange.privateGetAccountBills(params);

      // 返回格式化的账单列表 / Return formatted bills list
      return (response.data || []).map(bill => ({
        billId: bill.billId,                           // 账单 ID / Bill ID
        instType: bill.instType,                       // 产品类型 / Instrument type
        instId: bill.instId,                           // 产品 ID / Instrument ID
        type: bill.type,                               // 账单类型 / Bill type
        subType: bill.subType,                         // 子类型 / Sub type
        sz: parseFloat(bill.sz || 0),                  // 数量 / Size
        pnl: parseFloat(bill.pnl || 0),                // 盈亏 / PnL
        fee: parseFloat(bill.fee || 0),                // 手续费 / Fee
        ccy: bill.ccy,                                 // 币种 / Currency
        bal: parseFloat(bill.bal || 0),                // 余额 / Balance
        ts: parseInt(bill.ts),                         // 时间戳 / Timestamp
        exchange: this.name,                           // 交易所名称 / Exchange name
      }));
    }, `获取账单流水 / Fetch bills: ${instType || 'all'}`);
  }

  /**
   * 获取持仓量历史数据
   * Fetch open interest history data
   *
   * 使用 OKX Rubik API: GET /api/v5/rubik/stat/contracts/open-interest-history
   * Using OKX Rubik API: GET /api/v5/rubik/stat/contracts/open-interest-history
   *
   * @param {string} symbol - 交易对 / Trading pair (例如: BTC/USDT:USDT)
   * @param {string} period - 时间周期 ('5m' | '1H' | '1D') / Time period
   * @returns {Promise<Array>} 持仓量历史数据 / Open interest history data
   */
  async fetchOpenInterestHistory(symbol, period = '5m') {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 验证周期参数 / Validate period parameter
    const validPeriods = ['5m', '1H', '1D'];
    if (!validPeriods.includes(period)) {
      throw this._createError('INVALID_PARAM', `无效的时间周期 / Invalid period: ${period}. 支持 / Supported: ${validPeriods.join(', ')}`);
    }

    // 执行带重试的请求 / Execute request with retry
    return this._executeWithRetry(async () => {
      // 获取 OKX 格式的 instId / Get OKX format instId
      // 将 BTC/USDT:USDT 转换为 BTC-USDT-SWAP / Convert BTC/USDT:USDT to BTC-USDT-SWAP
      const market = this.markets[symbol];
      let instId;

      if (market && market.id) {
        instId = market.id;
      } else {
        // 手动转换格式 / Manual format conversion
        instId = symbol.replace('/', '-').replace(':USDT', '') + '-SWAP';
      }

      // 调用 OKX Rubik API / Call OKX Rubik API
      const response = await this.exchange.publicGetRubikStatContractsOpenInterestHistory({
        instId,
        period,
      });

      // 获取数据列表 / Get data list
      // OKX 返回格式: [[timestamp, oi, oiValue], ...] / OKX return format
      const data = response.data || [];

      // 转换为统一格式 / Convert to unified format
      return data.map(item => ({
        timestamp: parseInt(item[0]),           // 时间戳 / Timestamp
        openInterest: parseFloat(item[1]),      // 持仓量（合约张数）/ OI (contracts)
        openInterestValue: parseFloat(item[2]), // 持仓价值（USD）/ OI value (USD)
        symbol,                                 // 交易对 / Trading pair
        exchange: this.name,                    // 交易所名称 / Exchange name
      }));
    }, `获取持仓量历史 / Fetch OI history: ${symbol}`);
  }

  /**
   * 创建止盈止损订单
   * Create take profit / stop loss order
   * @param {string} symbol - 交易对 / Trading pair
   * @param {string} side - 买卖方向 ('buy' | 'sell') / Side
   * @param {number} amount - 数量 / Amount
   * @param {Object} options - 选项 / Options
   * @param {number} options.triggerPrice - 触发价格 / Trigger price
   * @param {number} options.orderPrice - 订单价格 (限价单用) / Order price (for limit)
   * @param {string} options.triggerType - 触发类型 ('last' | 'index' | 'mark') / Trigger type
   * @returns {Promise<Object>} 订单信息 / Order information
   */
  async createStopOrder(symbol, side, amount, options = {}) {
    // 确保已连接 / Ensure connected
    this._ensureConnected();

    // 验证交易对 / Validate symbol
    this._validateSymbol(symbol);

    // 验证必要参数 / Validate required parameters
    if (!options.triggerPrice) {
      throw this._createError('INVALID_PARAM', '止损订单必须指定触发价格 / Stop order requires triggerPrice');
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
      const params = {
        triggerPx: options.triggerPrice.toString(),                     // 触发价格 / Trigger price
        triggerPxType: options.triggerType || 'last',                   // 触发类型 / Trigger type
        tdMode: 'cross',                                                // 交易模式 / Trade mode
      };

      // 确定订单类型 / Determine order type
      // 如果有订单价格，则为限价单，否则为市价单 / If order price, limit order; otherwise market order
      const orderType = options.orderPrice ? 'trigger' : 'trigger';
      if (options.orderPrice) {
        params.ordPx = options.orderPrice.toString();
      }

      // 调用 CCXT 创建订单 / Call CCXT to create order
      const order = await this.exchange.createOrder(
        symbol,           // 交易对 / Symbol
        orderType,        // 订单类型 / Order type
        side,             // 买卖方向 / Side
        adjustedAmount,   // 数量 / Amount
        options.orderPrice,  // 价格 / Price
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
}

// 默认导出 / Default export
export default OKXExchange;
