/**
 * 验证工具
 * Validation Utility
 *
 * 提供数据验证和模式匹配功能
 * Provides data validation and pattern matching functionality
 *
 * 支持 Zod 运行时类型验证
 * Supports Zod runtime type validation
 */

import { z } from 'zod';

// ============================================
// Zod Schema 定义
// ============================================

/**
 * 基础类型 Schema
 */
export const ZodSchemas = {
  // 数字类型
  positiveNumber: z.number().positive(),
  nonNegativeNumber: z.number().nonnegative(),
  percentage: z.number().min(0).max(1),
  percentage100: z.number().min(0).max(100),

  // 交易对 Schema
  symbol: z.string().min(1).regex(/^[A-Z0-9]+\/[A-Z0-9]+$/i, {
    message: 'Symbol must be in format BASE/QUOTE (e.g., BTC/USDT)',
  }),

  // 交易所名称 / Exchange name
  // 支持: binance, okx, bybit, gate, deribit, bitget
  // Supported: binance, okx, bybit, gate, deribit, bitget
  exchangeName: z.enum(['binance', 'okx', 'bybit', 'gate', 'deribit', 'bitget']),

  // 订单方向
  orderSide: z.enum(['buy', 'sell']),

  // 订单类型
  orderType: z.enum(['market', 'limit', 'stop_limit', 'stop_market']),

  // 时间周期
  timeframe: z.enum([
    '1m', '3m', '5m', '15m', '30m',
    '1h', '2h', '4h', '6h', '12h',
    '1d', '1w', '1M',
  ]),
};

/**
 * 订单配置 Schema
 */
export const OrderConfigSchema = z.object({
  symbol: ZodSchemas.symbol,
  side: ZodSchemas.orderSide,
  type: ZodSchemas.orderType.optional().default('limit'),
  amount: ZodSchemas.positiveNumber,
  price: ZodSchemas.positiveNumber.optional(),
  stopPrice: ZodSchemas.positiveNumber.optional(),
  reduceOnly: z.boolean().optional().default(false),
  postOnly: z.boolean().optional().default(false),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional().default('GTC'),
  leverage: z.number().min(1).max(125).optional(),
  clientOrderId: z.string().optional(),
}).refine(
  (data) => data.type === 'market' || data.price !== undefined,
  { message: 'Price is required for limit orders' }
).refine(
  (data) => !data.type?.startsWith('stop') || data.stopPrice !== undefined,
  { message: 'Stop price is required for stop orders' }
);

/**
 * 策略配置 Schemas
 */
export const StrategySchemas = {
  sma: z.object({
    shortPeriod: z.number().int().min(1).max(500).default(10),
    longPeriod: z.number().int().min(1).max(500).default(20),
    symbol: ZodSchemas.symbol,
    timeframe: ZodSchemas.timeframe.default('1h'),
    tradeAmount: ZodSchemas.positiveNumber.optional(),
    tradePercent: ZodSchemas.percentage.optional(),
  }).refine(
    (data) => data.shortPeriod < data.longPeriod,
    { message: 'Short period must be less than long period' }
  ),

  rsi: z.object({
    period: z.number().int().min(2).max(100).default(14),
    overbought: z.number().min(50).max(100).default(70),
    oversold: z.number().min(0).max(50).default(30),
    symbol: ZodSchemas.symbol,
    timeframe: ZodSchemas.timeframe.default('1h'),
    tradeAmount: ZodSchemas.positiveNumber.optional(),
    tradePercent: ZodSchemas.percentage.optional(),
  }).refine(
    (data) => data.oversold < data.overbought,
    { message: 'Oversold level must be less than overbought level' }
  ),

  macd: z.object({
    fastPeriod: z.number().int().min(1).max(100).default(12),
    slowPeriod: z.number().int().min(1).max(100).default(26),
    signalPeriod: z.number().int().min(1).max(100).default(9),
    symbol: ZodSchemas.symbol,
    timeframe: ZodSchemas.timeframe.default('1h'),
    tradeAmount: ZodSchemas.positiveNumber.optional(),
    tradePercent: ZodSchemas.percentage.optional(),
  }).refine(
    (data) => data.fastPeriod < data.slowPeriod,
    { message: 'Fast period must be less than slow period' }
  ),

  bollinger: z.object({
    period: z.number().int().min(2).max(200).default(20),
    stdDev: z.number().min(0.1).max(5).default(2),
    symbol: ZodSchemas.symbol,
    timeframe: ZodSchemas.timeframe.default('1h'),
    tradeAmount: ZodSchemas.positiveNumber.optional(),
    tradePercent: ZodSchemas.percentage.optional(),
  }),

  grid: z.object({
    symbol: ZodSchemas.symbol,
    upperPrice: ZodSchemas.positiveNumber,
    lowerPrice: ZodSchemas.positiveNumber,
    gridCount: z.number().int().min(2).max(500).default(10),
    totalAmount: ZodSchemas.positiveNumber,
    side: z.enum(['long', 'short', 'neutral']).default('neutral'),
  }).refine(
    (data) => data.lowerPrice < data.upperPrice,
    { message: 'Lower price must be less than upper price' }
  ),

  // 波动率策略 / Volatility strategies
  atrBreakout: z.object({
    symbol: ZodSchemas.symbol,
    timeframe: ZodSchemas.timeframe.default('1h'),
    atrPeriod: z.number().int().min(1).max(100).default(14),
    atrMultiplier: z.number().min(0.1).max(10).default(2.0),
    baselinePeriod: z.number().int().min(1).max(200).default(20),
    useTrailingStop: z.boolean().default(true),
    stopLossMultiplier: z.number().min(0.1).max(10).default(1.5),
    positionPercent: z.number().min(1).max(100).default(95),
  }),

  bollingerWidth: z.object({
    symbol: ZodSchemas.symbol,
    timeframe: ZodSchemas.timeframe.default('1h'),
    bbPeriod: z.number().int().min(2).max(200).default(20),
    bbStdDev: z.number().min(0.1).max(5).default(2.0),
    kcPeriod: z.number().int().min(2).max(200).default(20),
    kcMultiplier: z.number().min(0.1).max(5).default(1.5),
    squeezeThreshold: z.number().min(1).max(100).default(20),
    useMomentumConfirm: z.boolean().default(true),
    positionPercent: z.number().min(1).max(100).default(95),
  }),

  volatilityRegime: z.object({
    symbol: ZodSchemas.symbol,
    timeframe: ZodSchemas.timeframe.default('1h'),
    atrPeriod: z.number().int().min(1).max(100).default(14),
    volatilityLookback: z.number().int().min(10).max(500).default(100),
    lowVolThreshold: z.number().min(1).max(50).default(25),
    highVolThreshold: z.number().min(50).max(99).default(75),
    extremeVolThreshold: z.number().min(80).max(100).default(95),
    adxThreshold: z.number().min(10).max(50).default(25),
    disableInExtreme: z.boolean().default(true),
    positionPercent: z.number().min(1).max(100).default(95),
  }),

  // 订单流策略 / Order flow strategy
  orderFlow: z.object({
    symbol: ZodSchemas.symbol,
    timeframe: ZodSchemas.timeframe.default('1h'),
    // 成交量突增参数 / Volume spike parameters
    volumeMAPeriod: z.number().int().min(5).max(100).default(20),
    volumeSpikeMultiplier: z.number().min(1.1).max(10).default(2.0),
    // VWAP 参数 / VWAP parameters
    vwapPeriod: z.number().int().min(5).max(100).default(20),
    vwapDeviationThreshold: z.number().min(0.1).max(10).default(1.0),
    // 大单参数 / Large order parameters
    largeOrderMultiplier: z.number().min(1.5).max(20).default(3.0),
    largeOrderRatioThreshold: z.number().min(0.5).max(0.95).default(0.6),
    // Taker 参数 / Taker parameters
    takerWindow: z.number().int().min(3).max(50).default(10),
    takerBuyThreshold: z.number().min(0.5).max(0.9).default(0.6),
    takerSellThreshold: z.number().min(0.1).max(0.5).default(0.4),
    // 信号参数 / Signal parameters
    minSignalsForEntry: z.number().int().min(1).max(4).default(2),
    // 启用开关 / Enable flags
    useVolumeSpike: z.boolean().default(true),
    useVWAPDeviation: z.boolean().default(true),
    useLargeOrderRatio: z.boolean().default(true),
    useTakerBuyRatio: z.boolean().default(true),
    // 风控参数 / Risk parameters
    stopLossPercent: z.number().min(0.1).max(10).default(1.5),
    takeProfitPercent: z.number().min(0.5).max(20).default(3.0),
    useTrailingStop: z.boolean().default(true),
    trailingStopPercent: z.number().min(0.1).max(10).default(1.0),
    // 仓位参数 / Position parameters
    positionPercent: z.number().min(1).max(100).default(95),
  }).refine(
    (data) => data.takerSellThreshold < data.takerBuyThreshold,
    { message: 'Taker sell threshold must be less than taker buy threshold' }
  ),

  // ============================================
  // 统计套利策略 / Statistical Arbitrage Strategy
  // ============================================

  statisticalArbitrage: z.object({
    // 策略类型 / Strategy type
    arbType: z.enum([
      'pairs_trading',
      'cointegration',
      'cross_exchange',
      'perpetual_spot',
      'triangular',
    ]).default('pairs_trading'),

    // 配对配置 / Pairs configuration
    candidatePairs: z.array(z.object({
      assetA: z.string().min(1),
      assetB: z.string().min(1),
    })).min(1),

    // 最大同时持有配对数 / Max active pairs
    maxActivePairs: z.number().int().min(1).max(50).default(5),

    // 回看周期 / Lookback period
    lookbackPeriod: z.number().int().min(10).max(500).default(60),

    // 协整检验周期 / Cointegration test period
    cointegrationTestPeriod: z.number().int().min(30).max(1000).default(100),

    // 协整检验参数 / Cointegration test parameters
    adfSignificanceLevel: z.number().min(0.001).max(0.1).default(0.05),
    minCorrelation: z.number().min(0).max(1).default(0.7),
    minHalfLife: z.number().min(0.1).max(30).default(1),
    maxHalfLife: z.number().min(1).max(365).default(30),

    // Z-Score 信号参数 / Z-Score signal parameters
    entryZScore: z.number().min(0.5).max(5).default(2.0),
    exitZScore: z.number().min(0).max(3).default(0.5),
    stopLossZScore: z.number().min(2).max(10).default(4.0),

    // 最大持仓时间 (毫秒) / Max holding period (ms)
    maxHoldingPeriod: z.number().int().min(60000).default(7 * 24 * 60 * 60 * 1000),

    // 跨交易所套利参数 / Cross-exchange arbitrage parameters
    spreadEntryThreshold: z.number().min(0.0001).max(0.1).default(0.003),
    spreadExitThreshold: z.number().min(0).max(0.05).default(0.001),
    tradingCost: z.number().min(0).max(0.01).default(0.001),
    slippageEstimate: z.number().min(0).max(0.01).default(0.0005),

    // 永续-现货基差参数 / Perpetual-spot basis parameters
    basisEntryThreshold: z.number().min(0.01).max(1).default(0.15),
    basisExitThreshold: z.number().min(0).max(0.5).default(0.05),
    fundingRateThreshold: z.number().min(0).max(0.01).default(0.001),

    // 仓位管理 / Position management
    maxPositionPerPair: z.number().min(0.01).max(0.5).default(0.1),
    maxTotalPosition: z.number().min(0.1).max(1).default(0.5),
    symmetricPosition: z.boolean().default(true),

    // 风险控制 / Risk control
    maxLossPerPair: z.number().min(0.001).max(0.1).default(0.02),
    maxDrawdown: z.number().min(0.01).max(0.5).default(0.1),
    consecutiveLossLimit: z.number().int().min(1).max(20).default(3),
    coolingPeriod: z.number().int().min(0).default(24 * 60 * 60 * 1000),

    // 详细日志 / Verbose logging
    verbose: z.boolean().default(false),
  }).refine(
    (data) => data.exitZScore < data.entryZScore,
    { message: 'Exit Z-Score must be less than entry Z-Score' }
  ).refine(
    (data) => data.entryZScore < data.stopLossZScore,
    { message: 'Entry Z-Score must be less than stop loss Z-Score' }
  ).refine(
    (data) => data.minHalfLife < data.maxHalfLife,
    { message: 'Min half-life must be less than max half-life' }
  ).refine(
    (data) => data.spreadExitThreshold < data.spreadEntryThreshold,
    { message: 'Spread exit threshold must be less than entry threshold' }
  ).refine(
    (data) => data.basisExitThreshold < data.basisEntryThreshold,
    { message: 'Basis exit threshold must be less than entry threshold' }
  ),
};

/**
 * 风控配置 Schema
 */
export const RiskConfigSchema = z.object({
  maxPositions: z.number().int().min(1).max(100).default(10),
  maxPositionSize: ZodSchemas.percentage.default(0.1),
  maxLeverage: z.number().min(1).max(125).default(10),
  maxDailyLoss: ZodSchemas.percentage.default(0.05),
  maxDrawdown: ZodSchemas.percentage.default(0.2),
  maxConsecutiveLosses: z.number().int().min(1).max(50).default(5),
  defaultStopLoss: ZodSchemas.percentage.default(0.02),
  defaultTakeProfit: ZodSchemas.percentage.optional(),
  enableTrailingStop: z.boolean().default(false),
  trailingStopDistance: ZodSchemas.percentage.optional(),
  riskPerTrade: ZodSchemas.percentage.default(0.01),
  cooldownPeriod: z.number().int().min(0).default(3600000),
});

/**
 * 交易所配置 Schema
 */
export const ExchangeConfigSchema = z.object({
  exchange: ZodSchemas.exchangeName,
  apiKey: z.string().min(1),
  secret: z.string().min(1),
  password: z.string().optional(),
  testnet: z.boolean().default(false),
  options: z.record(z.unknown()).optional(),
});

/**
 * K线数据 Schema
 */
export const CandleSchema = z.object({
  timestamp: z.number().int().positive(),
  open: ZodSchemas.positiveNumber,
  high: ZodSchemas.positiveNumber,
  low: ZodSchemas.positiveNumber,
  close: ZodSchemas.positiveNumber,
  volume: ZodSchemas.nonNegativeNumber,
}).refine(
  (data) => data.low <= data.open && data.low <= data.close,
  { message: 'Low must be <= open and close' }
).refine(
  (data) => data.high >= data.open && data.high >= data.close,
  { message: 'High must be >= open and close' }
);

// ============================================
// Zod 验证辅助函数
// ============================================

/**
 * 使用 Zod schema 验证数据
 * @param {z.ZodSchema} schema - Zod schema
 * @param {any} data - 要验证的数据
 * @returns {{ success: boolean, data?: any, error?: string, errors?: any[] }}
 */
export function zodValidate(schema, data) {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Zod 使用 issues 而不是 errors
  const issues = result.error.issues || [];
  const errors = issues.map(e => {
    const path = e.path.join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });

  return {
    success: false,
    error: errors.join('; '),
    errors: issues,
  };
}

/**
 * 验证并抛出异常
 * @param {z.ZodSchema} schema - Zod schema
 * @param {any} data - 要验证的数据
 * @returns {any} 验证后的数据
 * @throws {Error} ValidationError
 */
export function zodValidateOrThrow(schema, data) {
  const result = zodValidate(schema, data);

  if (!result.success) {
    const error = new Error(result.error);
    error.name = 'ValidationError';
    error.errors = result.errors;
    throw error;
  }

  return result.data;
}

/**
 * 创建 Express 验证中间件
 * @param {z.ZodSchema} schema - Zod schema
 * @param {string} source - 数据来源 ('body', 'query', 'params')
 */
export function createZodMiddleware(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const result = zodValidate(schema, data);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: result.error,
        errors: result.errors,
      });
    }

    req[`validated${source.charAt(0).toUpperCase() + source.slice(1)}`] = result.data;
    next();
  };
}

// 导出 Zod 实例供自定义扩展
export { z };

// ============================================
// 交易参数验证 / Trading Parameter Validation
// ============================================

/**
 * 验证订单参数
 * Validate order parameters
 * @param {Object} order - 订单对象 / Order object
 * @returns {Object} 验证结果 { valid, errors } / Validation result
 */
export function validateOrder(order) {
  // 错误列表 / Error list
  const errors = [];

  // 检查必需字段 / Check required fields
  if (!order) {
    return { valid: false, errors: ['订单对象不能为空 / Order object cannot be null'] };
  }

  // 验证交易对 / Validate symbol
  if (!order.symbol || typeof order.symbol !== 'string') {
    errors.push('交易对无效 / Invalid symbol');
  } else if (!order.symbol.includes('/')) {
    errors.push('交易对格式错误，应为 BASE/QUOTE / Symbol format error, should be BASE/QUOTE');
  }

  // 验证订单类型 / Validate order type
  const validTypes = ['market', 'limit', 'stop', 'stop_limit'];
  if (!order.type || !validTypes.includes(order.type.toLowerCase())) {
    errors.push(`订单类型无效，应为: ${validTypes.join(', ')} / Invalid order type`);
  }

  // 验证订单方向 / Validate order side
  const validSides = ['buy', 'sell'];
  if (!order.side || !validSides.includes(order.side.toLowerCase())) {
    errors.push('订单方向无效，应为: buy, sell / Invalid order side');
  }

  // 验证数量 / Validate amount
  if (order.amount === undefined || order.amount === null) {
    errors.push('订单数量不能为空 / Order amount cannot be null');
  } else if (typeof order.amount !== 'number' || order.amount <= 0) {
    errors.push('订单数量必须为正数 / Order amount must be positive');
  }

  // 验证限价单价格 / Validate limit order price
  if (order.type === 'limit' || order.type === 'stop_limit') {
    if (order.price === undefined || order.price === null) {
      errors.push('限价单必须指定价格 / Limit order must specify price');
    } else if (typeof order.price !== 'number' || order.price <= 0) {
      errors.push('订单价格必须为正数 / Order price must be positive');
    }
  }

  // 返回验证结果 / Return validation result
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证策略配置
 * Validate strategy configuration
 * @param {Object} config - 策略配置 / Strategy configuration
 * @returns {Object} 验证结果 { valid, errors } / Validation result
 */
export function validateStrategyConfig(config) {
  // 错误列表 / Error list
  const errors = [];

  // 检查必需字段 / Check required fields
  if (!config) {
    return { valid: false, errors: ['策略配置不能为空 / Strategy config cannot be null'] };
  }

  // 验证交易对列表 / Validate symbols list
  if (!config.symbols || !Array.isArray(config.symbols) || config.symbols.length === 0) {
    errors.push('必须指定至少一个交易对 / Must specify at least one symbol');
  }

  // 验证时间周期 / Validate timeframe
  const validTimeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M'];
  if (config.timeframe && !validTimeframes.includes(config.timeframe)) {
    errors.push(`时间周期无效，应为: ${validTimeframes.join(', ')} / Invalid timeframe`);
  }

  // 验证资金比例 / Validate capital ratio
  if (config.capitalRatio !== undefined) {
    if (typeof config.capitalRatio !== 'number' || config.capitalRatio <= 0 || config.capitalRatio > 1) {
      errors.push('资金比例必须在 0-1 之间 / Capital ratio must be between 0 and 1');
    }
  }

  // 验证止损比例 / Validate stop loss ratio
  if (config.stopLoss !== undefined) {
    if (typeof config.stopLoss !== 'number' || config.stopLoss <= 0 || config.stopLoss >= 1) {
      errors.push('止损比例必须在 0-1 之间 / Stop loss must be between 0 and 1');
    }
  }

  // 验证止盈比例 / Validate take profit ratio
  if (config.takeProfit !== undefined) {
    if (typeof config.takeProfit !== 'number' || config.takeProfit <= 0) {
      errors.push('止盈比例必须为正数 / Take profit must be positive');
    }
  }

  // 返回验证结果 / Return validation result
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证风控配置
 * Validate risk management configuration
 * @param {Object} config - 风控配置 / Risk management configuration
 * @returns {Object} 验证结果 { valid, errors } / Validation result
 */
export function validateRiskConfig(config) {
  // 错误列表 / Error list
  const errors = [];

  // 检查必需字段 / Check required fields
  if (!config) {
    return { valid: false, errors: ['风控配置不能为空 / Risk config cannot be null'] };
  }

  // 验证最大持仓比例 / Validate max position ratio
  if (config.maxPositionRatio !== undefined) {
    if (typeof config.maxPositionRatio !== 'number' || config.maxPositionRatio <= 0 || config.maxPositionRatio > 1) {
      errors.push('最大持仓比例必须在 0-1 之间 / Max position ratio must be between 0 and 1');
    }
  }

  // 验证单笔风险比例 / Validate risk per trade
  if (config.riskPerTrade !== undefined) {
    if (typeof config.riskPerTrade !== 'number' || config.riskPerTrade <= 0 || config.riskPerTrade > 0.1) {
      errors.push('单笔风险比例必须在 0-10% 之间 / Risk per trade must be between 0 and 10%');
    }
  }

  // 验证最大回撤 / Validate max drawdown
  if (config.maxDrawdown !== undefined) {
    if (typeof config.maxDrawdown !== 'number' || config.maxDrawdown <= 0 || config.maxDrawdown > 1) {
      errors.push('最大回撤必须在 0-100% 之间 / Max drawdown must be between 0 and 100%');
    }
  }

  // 验证每日亏损限制 / Validate daily loss limit
  if (config.dailyLossLimit !== undefined) {
    if (typeof config.dailyLossLimit !== 'number' || config.dailyLossLimit <= 0) {
      errors.push('每日亏损限制必须为正数 / Daily loss limit must be positive');
    }
  }

  // 返回验证结果 / Return validation result
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// 数据验证 / Data Validation
// ============================================

/**
 * 验证 K 线数据
 * Validate candle data
 * @param {Object} candle - K 线对象 / Candle object
 * @returns {Object} 验证结果 { valid, errors } / Validation result
 */
export function validateCandle(candle) {
  // 错误列表 / Error list
  const errors = [];

  // 检查必需字段 / Check required fields
  if (!candle) {
    return { valid: false, errors: ['K线数据不能为空 / Candle data cannot be null'] };
  }

  // 验证时间戳 / Validate timestamp
  if (!candle.timestamp && !candle.time) {
    errors.push('缺少时间戳 / Missing timestamp');
  }

  // 验证 OHLCV 数据 / Validate OHLCV data
  const fields = ['open', 'high', 'low', 'close'];
  for (const field of fields) {
    if (candle[field] === undefined || candle[field] === null) {
      errors.push(`缺少 ${field} 字段 / Missing ${field} field`);
    } else if (typeof candle[field] !== 'number' || candle[field] < 0) {
      errors.push(`${field} 必须为非负数 / ${field} must be non-negative`);
    }
  }

  // 验证价格逻辑 / Validate price logic
  if (candle.high < candle.low) {
    errors.push('最高价不能低于最低价 / High cannot be less than low');
  }
  if (candle.high < candle.open || candle.high < candle.close) {
    errors.push('最高价必须大于等于开盘价和收盘价 / High must be >= open and close');
  }
  if (candle.low > candle.open || candle.low > candle.close) {
    errors.push('最低价必须小于等于开盘价和收盘价 / Low must be <= open and close');
  }

  // 验证成交量 / Validate volume
  if (candle.volume !== undefined && (typeof candle.volume !== 'number' || candle.volume < 0)) {
    errors.push('成交量必须为非负数 / Volume must be non-negative');
  }

  // 返回验证结果 / Return validation result
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证 K 线数据数组
 * Validate candle data array
 * @param {Object[]} candles - K 线数组 / Candle array
 * @returns {Object} 验证结果 { valid, errors, validCandles } / Validation result
 */
export function validateCandles(candles) {
  // 错误列表 / Error list
  const errors = [];

  // 有效 K 线列表 / Valid candles list
  const validCandles = [];

  // 检查数组 / Check array
  if (!candles || !Array.isArray(candles)) {
    return { valid: false, errors: ['K线数据必须为数组 / Candles must be an array'], validCandles: [] };
  }

  // 检查是否为空 / Check if empty
  if (candles.length === 0) {
    return { valid: false, errors: ['K线数据不能为空数组 / Candles cannot be empty'], validCandles: [] };
  }

  // 验证每根 K 线 / Validate each candle
  for (let i = 0; i < candles.length; i++) {
    const result = validateCandle(candles[i]);
    if (result.valid) {
      validCandles.push(candles[i]);
    } else {
      errors.push(`第 ${i + 1} 根K线无效: ${result.errors.join(', ')} / Candle ${i + 1} invalid`);
    }
  }

  // 返回验证结果 / Return validation result
  return {
    valid: errors.length === 0,
    errors,
    validCandles,
  };
}

// ============================================
// 类型验证 / Type Validation
// ============================================

/**
 * 检查是否为有效数字
 * Check if valid number
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为有效数字 / Is valid number
 */
export function isValidNumber(value) {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * 检查是否为正数
 * Check if positive number
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为正数 / Is positive number
 */
export function isPositiveNumber(value) {
  return isValidNumber(value) && value > 0;
}

/**
 * 检查是否为非负数
 * Check if non-negative number
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为非负数 / Is non-negative number
 */
export function isNonNegativeNumber(value) {
  return isValidNumber(value) && value >= 0;
}

/**
 * 检查是否为有效百分比
 * Check if valid percentage
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为有效百分比 (0-100) / Is valid percentage
 */
export function isValidPercentage(value) {
  return isValidNumber(value) && value >= 0 && value <= 100;
}

/**
 * 检查是否为有效比例
 * Check if valid ratio
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为有效比例 (0-1) / Is valid ratio
 */
export function isValidRatio(value) {
  return isValidNumber(value) && value >= 0 && value <= 1;
}

/**
 * 检查是否为非空字符串
 * Check if non-empty string
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为非空字符串 / Is non-empty string
 */
export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * 检查是否为有效日期
 * Check if valid date
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为有效日期 / Is valid date
 */
export function isValidDate(value) {
  // 如果是 Date 对象 / If Date object
  if (value instanceof Date) {
    return !isNaN(value.getTime());
  }

  // 尝试解析 / Try to parse
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * 检查是否为有效邮箱
 * Check if valid email
 * @param {string} email - 邮箱地址 / Email address
 * @returns {boolean} 是否为有效邮箱 / Is valid email
 */
export function isValidEmail(email) {
  // 基本邮箱正则 / Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && emailRegex.test(email);
}

/**
 * 检查是否为有效 URL
 * Check if valid URL
 * @param {string} url - URL 地址 / URL address
 * @returns {boolean} 是否为有效 URL / Is valid URL
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// 范围验证 / Range Validation
// ============================================

/**
 * 检查数字是否在范围内
 * Check if number is in range
 * @param {number} value - 要检查的值 / Value to check
 * @param {number} min - 最小值 / Minimum
 * @param {number} max - 最大值 / Maximum
 * @returns {boolean} 是否在范围内 / Is in range
 */
export function isInRange(value, min, max) {
  return isValidNumber(value) && value >= min && value <= max;
}

/**
 * 限制数字在范围内
 * Clamp number to range
 * @param {number} value - 要限制的值 / Value to clamp
 * @param {number} min - 最小值 / Minimum
 * @param {number} max - 最大值 / Maximum
 * @returns {number} 限制后的值 / Clamped value
 */
export function clamp(value, min, max) {
  if (!isValidNumber(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

// 默认导出所有函数 / Default export all functions
export default {
  // 交易参数验证 / Trading parameter validation
  validateOrder,
  validateStrategyConfig,
  validateRiskConfig,

  // 数据验证 / Data validation
  validateCandle,
  validateCandles,

  // 类型验证 / Type validation
  isValidNumber,
  isPositiveNumber,
  isNonNegativeNumber,
  isValidPercentage,
  isValidRatio,
  isNonEmptyString,
  isValidDate,
  isValidEmail,
  isValidUrl,

  // 范围验证 / Range validation
  isInRange,
  clamp,
};
