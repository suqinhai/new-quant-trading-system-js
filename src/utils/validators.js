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

import { z } from 'zod'; // 导入模块 zod

// ============================================
// Zod Schema 定义
// ============================================

/**
 * 基础类型 Schema
 */
export const ZodSchemas = { // 导出常量 ZodSchemas
  // 数字类型
  positiveNumber: z.number().positive(), // positiveNumber数字类型
  nonNegativeNumber: z.number().nonnegative(), // nonNegativeNumber
  percentage: z.number().min(0).max(1), // 百分比
  percentage100: z.number().min(0).max(100), // percentage100

  // 交易对 Schema
  symbol: z.string().min(1).regex(/^[A-Z0-9]+\/[A-Z0-9]+$/i, { // 交易对 Schema
    message: 'Symbol must be in format BASE/QUOTE (e.g., BTC/USDT)', // 消息
  }), // 结束代码块

  // 交易所名称 / Exchange name
  // 支持: binance, okx, bybit, gate, deribit, bitget, kucoin, kraken
  // Supported: binance, okx, bybit, gate, deribit, bitget, kucoin, kraken
  exchangeName: z.enum(['binance', 'okx', 'bybit', 'gate', 'deribit', 'bitget', 'kucoin', 'kraken']), // Supported: binance, okx, bybit, gate, deribit, bitget, kucoin, kraken

  // 订单方向
  orderSide: z.enum(['buy', 'sell']), // 订单方向

  // 订单类型
  orderType: z.enum(['market', 'limit', 'stop_limit', 'stop_market']), // 订单类型

  // 时间周期
  timeframe: z.enum([ // 时间周期
    '1m', '3m', '5m', '15m', '30m', // 执行语句
    '1h', '2h', '4h', '6h', '12h', // 执行语句
    '1d', '1w', '1M', // 执行语句
  ]), // 结束数组或索引
}; // 结束代码块

/**
 * 订单配置 Schema
 */
export const OrderConfigSchema = z.object({ // 导出常量 OrderConfigSchema
  symbol: ZodSchemas.symbol, // 交易对
  side: ZodSchemas.orderSide, // 方向
  type: ZodSchemas.orderType.optional().default('limit'), // 类型
  amount: ZodSchemas.positiveNumber, // 数量
  price: ZodSchemas.positiveNumber.optional(), // 价格
  stopPrice: ZodSchemas.positiveNumber.optional(), // 停止价格
  reduceOnly: z.boolean().optional().default(false), // 减仓仅
  postOnly: z.boolean().optional().default(false), // 挂单仅
  timeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional().default('GTC'), // 时间在Force
  leverage: z.number().min(1).max(125).optional(), // 杠杆
  clientOrderId: z.string().optional(), // client订单ID
}).refine( // 执行语句
  (data) => data.type === 'market' || data.price !== undefined, // 定义箭头函数
  { message: 'Price is required for limit orders' } // 执行语句
).refine( // 执行语句
  (data) => !data.type?.startsWith('stop') || data.stopPrice !== undefined, // 定义箭头函数
  { message: 'Stop price is required for stop orders' } // 执行语句
); // 结束调用或参数

/**
 * 策略配置 Schemas
 */
export const StrategySchemas = { // 导出常量 StrategySchemas
  sma: z.object({ // SMA
    shortPeriod: z.number().int().min(1).max(500).default(10), // short周期
    longPeriod: z.number().int().min(1).max(500).default(20), // long周期
    symbol: ZodSchemas.symbol, // 交易对
    timeframe: ZodSchemas.timeframe.default('1h'), // 周期
    tradeAmount: ZodSchemas.positiveNumber.optional(), // 交易数量
    tradePercent: ZodSchemas.percentage.optional(), // 交易百分比
  }).refine( // 执行语句
    (data) => data.shortPeriod < data.longPeriod, // 定义箭头函数
    { message: 'Short period must be less than long period' } // 执行语句
  ), // 结束调用或参数

  rsi: z.object({ // RSI
    period: z.number().int().min(2).max(100).default(14), // 周期
    overbought: z.number().min(50).max(100).default(70), // overbought
    oversold: z.number().min(0).max(50).default(30), // oversold
    symbol: ZodSchemas.symbol, // 交易对
    timeframe: ZodSchemas.timeframe.default('1h'), // 周期
    tradeAmount: ZodSchemas.positiveNumber.optional(), // 交易数量
    tradePercent: ZodSchemas.percentage.optional(), // 交易百分比
  }).refine( // 执行语句
    (data) => data.oversold < data.overbought, // 定义箭头函数
    { message: 'Oversold level must be less than overbought level' } // 执行语句
  ), // 结束调用或参数

  macd: z.object({ // MACD
    fastPeriod: z.number().int().min(1).max(100).default(12), // fast周期
    slowPeriod: z.number().int().min(1).max(100).default(26), // slow周期
    signalPeriod: z.number().int().min(1).max(100).default(9), // 信号周期
    symbol: ZodSchemas.symbol, // 交易对
    timeframe: ZodSchemas.timeframe.default('1h'), // 周期
    tradeAmount: ZodSchemas.positiveNumber.optional(), // 交易数量
    tradePercent: ZodSchemas.percentage.optional(), // 交易百分比
  }).refine( // 执行语句
    (data) => data.fastPeriod < data.slowPeriod, // 定义箭头函数
    { message: 'Fast period must be less than slow period' } // 执行语句
  ), // 结束调用或参数

  bollinger: z.object({ // 布林带
    period: z.number().int().min(2).max(200).default(20), // 周期
    stdDev: z.number().min(0.1).max(5).default(2), // 标准差
    symbol: ZodSchemas.symbol, // 交易对
    timeframe: ZodSchemas.timeframe.default('1h'), // 周期
    tradeAmount: ZodSchemas.positiveNumber.optional(), // 交易数量
    tradePercent: ZodSchemas.percentage.optional(), // 交易百分比
  }), // 结束代码块

  grid: z.object({ // 网格
    symbol: ZodSchemas.symbol, // 交易对
    upperPrice: ZodSchemas.positiveNumber, // 上限价
    lowerPrice: ZodSchemas.positiveNumber, // 下限价
    gridCount: z.number().int().min(2).max(500).default(10), // 网格数量
    totalAmount: ZodSchemas.positiveNumber, // 总数量
    side: z.enum(['long', 'short', 'neutral']).default('neutral'), // 方向
  }).refine( // 执行语句
    (data) => data.lowerPrice < data.upperPrice, // 定义箭头函数
    { message: 'Lower price must be less than upper price' } // 执行语句
  ), // 结束调用或参数

  // 波动率策略 / Volatility strategies
  atrBreakout: z.object({ // ATR突破
    symbol: ZodSchemas.symbol, // 交易对
    timeframe: ZodSchemas.timeframe.default('1h'), // 周期
    atrPeriod: z.number().int().min(1).max(100).default(14), // ATR周期
    atrMultiplier: z.number().min(0.1).max(10).default(2.0), // ATR倍数
    baselinePeriod: z.number().int().min(1).max(200).default(20), // 基线周期
    useTrailingStop: z.boolean().default(true), // 是否使用跟踪止损
    stopLossMultiplier: z.number().min(0.1).max(10).default(1.5), // 止损倍数
    positionPercent: z.number().min(1).max(100).default(95), // 持仓百分比
  }), // 结束代码块

  bollingerWidth: z.object({ // 布林带宽度
    symbol: ZodSchemas.symbol, // 交易对
    timeframe: ZodSchemas.timeframe.default('1h'), // 周期
    bbPeriod: z.number().int().min(2).max(200).default(20), // 布林带周期
    bbStdDev: z.number().min(0.1).max(5).default(2.0), // 布林带标准差
    kcPeriod: z.number().int().min(2).max(200).default(20), // 肯特纳通道周期
    kcMultiplier: z.number().min(0.1).max(5).default(1.5), // 肯特纳通道倍数
    squeezeThreshold: z.number().min(1).max(100).default(20), // 挤压阈值
    useMomentumConfirm: z.boolean().default(true), // 是否使用动量确认
    positionPercent: z.number().min(1).max(100).default(95), // 持仓百分比
  }), // 结束代码块

  volatilityRegime: z.object({ // 波动率状态
    symbol: ZodSchemas.symbol, // 交易对
    timeframe: ZodSchemas.timeframe.default('1h'), // 周期
    atrPeriod: z.number().int().min(1).max(100).default(14), // ATR周期
    volatilityLookback: z.number().int().min(10).max(500).default(100), // 波动率回溯
    lowVolThreshold: z.number().min(1).max(50).default(25), // 最低波动率阈值
    highVolThreshold: z.number().min(50).max(99).default(75), // 最高波动率阈值
    extremeVolThreshold: z.number().min(80).max(100).default(95), // 极端波动率阈值
    adxThreshold: z.number().min(10).max(50).default(25), // ADX阈值
    disableInExtreme: z.boolean().default(true), // 极端时禁用
    positionPercent: z.number().min(1).max(100).default(95), // 持仓百分比
  }), // 结束代码块

  // 订单流策略 / Order flow strategy
  orderFlow: z.object({ // 订单流
    symbol: ZodSchemas.symbol, // 交易对
    timeframe: ZodSchemas.timeframe.default('1h'), // 周期
    // 成交量突增参数 / Volume spike parameters
    volumeMAPeriod: z.number().int().min(5).max(100).default(20), // 成交量均线周期
    volumeSpikeMultiplier: z.number().min(1.1).max(10).default(2.0), // 成交量尖峰倍数
    // VWAP 参数 / VWAP parameters
    vwapPeriod: z.number().int().min(5).max(100).default(20), // VWAP周期
    vwapDeviationThreshold: z.number().min(0.1).max(10).default(1.0), // VWAP偏离阈值
    // 大单参数 / Large order parameters
    largeOrderMultiplier: z.number().min(1.5).max(20).default(3.0), // 大额订单倍数
    largeOrderRatioThreshold: z.number().min(0.5).max(0.95).default(0.6), // 大额订单比例阈值
    // Taker 参数 / Taker parameters
    takerWindow: z.number().int().min(3).max(50).default(10), // Taker 参数
    takerBuyThreshold: z.number().min(0.5).max(0.9).default(0.6), // 主动成交Buy阈值
    takerSellThreshold: z.number().min(0.1).max(0.5).default(0.4), // 主动成交Sell阈值
    // 信号参数 / Signal parameters
    minSignalsForEntry: z.number().int().min(1).max(4).default(2), // 最小信号用于入场
    // 启用开关 / Enable flags
    useVolumeSpike: z.boolean().default(true), // 是否使用成交量尖峰
    useVWAPDeviation: z.boolean().default(true), // 是否使用VWAP偏离
    useLargeOrderRatio: z.boolean().default(true), // 是否使用大额订单比例
    useTakerBuyRatio: z.boolean().default(true), // 是否使用主动成交Buy比例
    // 风控参数 / Risk parameters
    stopLossPercent: z.number().min(0.1).max(10).default(1.5), // 止损百分比
    takeProfitPercent: z.number().min(0.5).max(20).default(3.0), // 止盈百分比
    useTrailingStop: z.boolean().default(true), // 是否使用跟踪止损
    trailingStopPercent: z.number().min(0.1).max(10).default(1.0), // 跟踪止损百分比
    // 仓位参数 / Position parameters
    positionPercent: z.number().min(1).max(100).default(95), // 持仓百分比
  }).refine( // 执行语句
    (data) => data.takerSellThreshold < data.takerBuyThreshold, // 定义箭头函数
    { message: 'Taker sell threshold must be less than taker buy threshold' } // 执行语句
  ), // 结束调用或参数

  // ============================================
  // 统计套利策略 / Statistical Arbitrage Strategy
  // ============================================

  statisticalArbitrage: z.object({ // 统计套利
    // 策略类型 / Strategy type
    arbType: z.enum([ // arb类型策略类型
      'pairs_trading', // 执行语句
      'cointegration', // 执行语句
      'cross_exchange', // 执行语句
      'perpetual_spot', // 执行语句
      'triangular', // 执行语句
    ]).default('pairs_trading'), // 执行语句

    // 配对配置 / Pairs configuration
    candidatePairs: z.array(z.object({ // 候选Pairs
      assetA: z.string().min(1), // 资产A
      assetB: z.string().min(1), // 资产B
    })).min(1), // 执行语句

    // 最大同时持有配对数 / Max active pairs
    maxActivePairs: z.number().int().min(1).max(50).default(5), // 最大同时持有配对数

    // 回看周期 / Lookback period
    lookbackPeriod: z.number().int().min(10).max(500).default(60), // 回看周期

    // 协整检验周期 / Cointegration test period
    cointegrationTestPeriod: z.number().int().min(30).max(1000).default(100), // 协整检验周期

    // 协整检验参数 / Cointegration test parameters
    adfSignificanceLevel: z.number().min(0.001).max(0.1).default(0.05), // ADF显著性级别
    minCorrelation: z.number().min(0).max(1).default(0.7), // 最小Correlation
    minHalfLife: z.number().min(0.1).max(30).default(1), // 最小半衰期
    maxHalfLife: z.number().min(1).max(365).default(30), // 最大半衰期

    // Z-Score 信号参数 / Z-Score signal parameters
    entryZScore: z.number().min(0.5).max(5).default(2.0), // Z-Score 信号参数
    exitZScore: z.number().min(0).max(3).default(0.5), // 出场Z分数
    stopLossZScore: z.number().min(2).max(10).default(4.0), // 止损Z分数

    // 最大持仓时间 (毫秒) / Max holding period (ms)
    maxHoldingPeriod: z.number().int().min(60000).default(7 * 24 * 60 * 60 * 1000), // 最大持仓时间 (毫秒)

    // 跨交易所套利参数 / Cross-exchange arbitrage parameters
    spreadEntryThreshold: z.number().min(0.0001).max(0.1).default(0.003), // 跨交易所套利参数
    spreadExitThreshold: z.number().min(0).max(0.05).default(0.001), // 价差出场阈值
    tradingCost: z.number().min(0).max(0.01).default(0.001), // 交易Cost
    slippageEstimate: z.number().min(0).max(0.01).default(0.0005), // 滑点Estimate

    // 永续-现货基差参数 / Perpetual-spot basis parameters
    basisEntryThreshold: z.number().min(0.01).max(1).default(0.15), // 永续-现货基差参数
    basisExitThreshold: z.number().min(0).max(0.5).default(0.05), // 基差出场阈值
    fundingRateThreshold: z.number().min(0).max(0.01).default(0.001), // 资金费率频率阈值

    // 仓位管理 / Position management
    maxPositionPerPair: z.number().min(0.01).max(0.5).default(0.1), // 最大持仓每个交易对
    maxTotalPosition: z.number().min(0.1).max(1).default(0.5), // 最大总持仓
    symmetricPosition: z.boolean().default(true), // 对称持仓

    // 风险控制 / Risk control
    maxLossPerPair: z.number().min(0.001).max(0.1).default(0.02), // 最大亏损每个交易对
    maxDrawdown: z.number().min(0.01).max(0.5).default(0.1), // 最大回撤
    consecutiveLossLimit: z.number().int().min(1).max(20).default(3), // consecutive亏损限制
    coolingPeriod: z.number().int().min(0).default(24 * 60 * 60 * 1000), // 冷却周期

    // 详细日志 / Verbose logging
    verbose: z.boolean().default(false), // 详细日志
  }).refine( // 执行语句
    (data) => data.exitZScore < data.entryZScore, // 定义箭头函数
    { message: 'Exit Z-Score must be less than entry Z-Score' } // 执行语句
  ).refine( // 执行语句
    (data) => data.entryZScore < data.stopLossZScore, // 定义箭头函数
    { message: 'Entry Z-Score must be less than stop loss Z-Score' } // 执行语句
  ).refine( // 执行语句
    (data) => data.minHalfLife < data.maxHalfLife, // 定义箭头函数
    { message: 'Min half-life must be less than max half-life' } // 执行语句
  ).refine( // 执行语句
    (data) => data.spreadExitThreshold < data.spreadEntryThreshold, // 定义箭头函数
    { message: 'Spread exit threshold must be less than entry threshold' } // 执行语句
  ).refine( // 执行语句
    (data) => data.basisExitThreshold < data.basisEntryThreshold, // 定义箭头函数
    { message: 'Basis exit threshold must be less than entry threshold' } // 执行语句
  ), // 结束调用或参数
}; // 结束代码块

/**
 * 风控配置 Schema
 */
export const RiskConfigSchema = z.object({ // 导出常量 RiskConfigSchema
  maxPositions: z.number().int().min(1).max(100).default(10), // 最大持仓
  maxPositionSize: ZodSchemas.percentage.default(0.1), // 最大持仓大小
  maxLeverage: z.number().min(1).max(125).default(10), // 最大杠杆
  maxDailyLoss: ZodSchemas.percentage.default(0.05), // 最大每日亏损
  maxDrawdown: ZodSchemas.percentage.default(0.2), // 最大回撤
  maxConsecutiveLosses: z.number().int().min(1).max(50).default(5), // 最大ConsecutiveLosses
  defaultStopLoss: ZodSchemas.percentage.default(0.02), // 默认止损
  defaultTakeProfit: ZodSchemas.percentage.optional(), // 默认止盈
  enableTrailingStop: z.boolean().default(false), // 启用跟踪止损
  trailingStopDistance: ZodSchemas.percentage.optional(), // 跟踪止损距离
  riskPerTrade: ZodSchemas.percentage.default(0.01), // 风险每笔交易
  cooldownPeriod: z.number().int().min(0).default(3600000), // 冷却周期
}); // 结束代码块

/**
 * 交易所配置 Schema
 */
export const ExchangeConfigSchema = z.object({ // 导出常量 ExchangeConfigSchema
  exchange: ZodSchemas.exchangeName, // 交易所
  apiKey: z.string().min(1), // API密钥
  secret: z.string().min(1), // 密钥
  password: z.string().optional(), // 密码
  testnet: z.boolean().default(false), // 测试网
  options: z.record(z.unknown()).optional(), // options
}); // 结束代码块

/**
 * K线数据 Schema
 */
export const CandleSchema = z.object({ // 导出常量 CandleSchema
  timestamp: z.number().int().positive(), // 时间戳
  open: ZodSchemas.positiveNumber, // 开盘
  high: ZodSchemas.positiveNumber, // 最高
  low: ZodSchemas.positiveNumber, // 最低
  close: ZodSchemas.positiveNumber, // 收盘
  volume: ZodSchemas.nonNegativeNumber, // 成交量
}).refine( // 执行语句
  (data) => data.low <= data.open && data.low <= data.close, // 定义箭头函数
  { message: 'Low must be <= open and close' } // 执行语句
).refine( // 执行语句
  (data) => data.high >= data.open && data.high >= data.close, // 定义箭头函数
  { message: 'High must be >= open and close' } // 执行语句
); // 结束调用或参数

// ============================================
// Zod 验证辅助函数
// ============================================

/**
 * 使用 Zod schema 验证数据
 * @param {z.ZodSchema} schema - Zod schema
 * @param {any} data - 要验证的数据
 * @returns {{ success: boolean, data?: any, error?: string, errors?: any[] }}
 */
export function zodValidate(schema, data) { // 导出函数 zodValidate
  const result = schema.safeParse(data); // 定义常量 result

  if (result.success) { // 条件判断 result.success
    return { success: true, data: result.data }; // 返回结果
  } // 结束代码块

  // Zod 使用 issues 而不是 errors
  const issues = result.error.issues || []; // 定义常量 issues
  const errors = issues.map(e => { // 定义函数 errors
    const path = e.path.join('.'); // 定义常量 path
    return path ? `${path}: ${e.message}` : e.message; // 返回结果
  }); // 结束代码块

  return { // 返回结果
    success: false, // 成功标记
    error: errors.join('; '), // 错误
    errors: issues, // 错误列表
  }; // 结束代码块
} // 结束代码块

/**
 * 验证并抛出异常
 * @param {z.ZodSchema} schema - Zod schema
 * @param {any} data - 要验证的数据
 * @returns {any} 验证后的数据
 * @throws {Error} ValidationError
 */
export function zodValidateOrThrow(schema, data) { // 导出函数 zodValidateOrThrow
  const result = zodValidate(schema, data); // 定义常量 result

  if (!result.success) { // 条件判断 !result.success
    const error = new Error(result.error); // 定义常量 error
    error.name = 'ValidationError'; // 赋值 error.name
    error.errors = result.errors; // 赋值 error.errors
    throw error; // 抛出异常
  } // 结束代码块

  return result.data; // 返回结果
} // 结束代码块

/**
 * 创建 Express 验证中间件
 * @param {z.ZodSchema} schema - Zod schema
 * @param {string} source - 数据来源 ('body', 'query', 'params')
 */
export function createZodMiddleware(schema, source = 'body') { // 导出函数 createZodMiddleware
  return (req, res, next) => { // 返回结果
    const data = req[source]; // 定义常量 data
    const result = zodValidate(schema, data); // 定义常量 result

    if (!result.success) { // 条件判断 !result.success
      return res.status(400).json({ // 返回结果
        success: false, // 成功标记
        code: 'VALIDATION_ERROR', // 代码
        message: result.error, // 消息
        errors: result.errors, // 错误列表
      }); // 结束代码块
    } // 结束代码块

    req[`validated${source.charAt(0).toUpperCase() + source.slice(1)}`] = result.data; // 执行语句
    next(); // 调用 next
  }; // 结束代码块
} // 结束代码块

// 导出 Zod 实例供自定义扩展
export { z }; // 导出命名成员

// ============================================
// 交易参数验证 / Trading Parameter Validation
// ============================================

/**
 * 验证订单参数
 * Validate order parameters
 * @param {Object} order - 订单对象 / Order object
 * @returns {Object} 验证结果 { valid, errors } / Validation result
 */
export function validateOrder(order) { // 导出函数 validateOrder
  // 错误列表 / Error list
  const errors = []; // 定义常量 errors

  // 检查必需字段 / Check required fields
  if (!order) { // 条件判断 !order
    return { valid: false, errors: ['订单对象不能为空 / Order object cannot be null'] }; // 返回结果
  } // 结束代码块

  // 验证交易对 / Validate symbol
  if (!order.symbol || typeof order.symbol !== 'string') { // 条件判断 !order.symbol || typeof order.symbol !== 'str...
    errors.push('交易对无效 / Invalid symbol'); // 调用 errors.push
  } else if (!order.symbol.includes('/')) { // 执行语句
    errors.push('交易对格式错误，应为 BASE/QUOTE / Symbol format error, should be BASE/QUOTE'); // 调用 errors.push
  } // 结束代码块

  // 验证订单类型 / Validate order type
  const validTypes = ['market', 'limit', 'stop', 'stop_limit']; // 定义常量 validTypes
  if (!order.type || !validTypes.includes(order.type.toLowerCase())) { // 条件判断 !order.type || !validTypes.includes(order.typ...
    errors.push(`订单类型无效，应为: ${validTypes.join(', ')} / Invalid order type`); // 调用 errors.push
  } // 结束代码块

  // 验证订单方向 / Validate order side
  const validSides = ['buy', 'sell']; // 定义常量 validSides
  if (!order.side || !validSides.includes(order.side.toLowerCase())) { // 条件判断 !order.side || !validSides.includes(order.sid...
    errors.push('订单方向无效，应为: buy, sell / Invalid order side'); // 调用 errors.push
  } // 结束代码块

  // 验证数量 / Validate amount
  if (order.amount === undefined || order.amount === null) { // 条件判断 order.amount === undefined || order.amount ==...
    errors.push('订单数量不能为空 / Order amount cannot be null'); // 调用 errors.push
  } else if (typeof order.amount !== 'number' || order.amount <= 0) { // 执行语句
    errors.push('订单数量必须为正数 / Order amount must be positive'); // 调用 errors.push
  } // 结束代码块

  // 验证限价单价格 / Validate limit order price
  if (order.type === 'limit' || order.type === 'stop_limit') { // 条件判断 order.type === 'limit' || order.type === 'sto...
    if (order.price === undefined || order.price === null) { // 条件判断 order.price === undefined || order.price === ...
      errors.push('限价单必须指定价格 / Limit order must specify price'); // 调用 errors.push
    } else if (typeof order.price !== 'number' || order.price <= 0) { // 执行语句
      errors.push('订单价格必须为正数 / Order price must be positive'); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 返回验证结果 / Return validation result
  return { // 返回结果
    valid: errors.length === 0, // 有效
    errors, // 执行语句
  }; // 结束代码块
} // 结束代码块

/**
 * 验证策略配置
 * Validate strategy configuration
 * @param {Object} config - 策略配置 / Strategy configuration
 * @returns {Object} 验证结果 { valid, errors } / Validation result
 */
export function validateStrategyConfig(config) { // 导出函数 validateStrategyConfig
  // 错误列表 / Error list
  const errors = []; // 定义常量 errors

  // 检查必需字段 / Check required fields
  if (!config) { // 条件判断 !config
    return { valid: false, errors: ['策略配置不能为空 / Strategy config cannot be null'] }; // 返回结果
  } // 结束代码块

  // 验证交易对列表 / Validate symbols list
  if (!config.symbols || !Array.isArray(config.symbols) || config.symbols.length === 0) { // 条件判断 !config.symbols || !Array.isArray(config.symb...
    errors.push('必须指定至少一个交易对 / Must specify at least one symbol'); // 调用 errors.push
  } // 结束代码块

  // 验证时间周期 / Validate timeframe
  const validTimeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M']; // 定义常量 validTimeframes
  if (config.timeframe && !validTimeframes.includes(config.timeframe)) { // 条件判断 config.timeframe && !validTimeframes.includes...
    errors.push(`时间周期无效，应为: ${validTimeframes.join(', ')} / Invalid timeframe`); // 调用 errors.push
  } // 结束代码块

  // 验证资金比例 / Validate capital ratio
  if (config.capitalRatio !== undefined) { // 条件判断 config.capitalRatio !== undefined
    if (typeof config.capitalRatio !== 'number' || config.capitalRatio <= 0 || config.capitalRatio > 1) { // 条件判断 typeof config.capitalRatio !== 'number' || co...
      errors.push('资金比例必须在 0-1 之间 / Capital ratio must be between 0 and 1'); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 验证止损比例 / Validate stop loss ratio
  if (config.stopLoss !== undefined) { // 条件判断 config.stopLoss !== undefined
    if (typeof config.stopLoss !== 'number' || config.stopLoss <= 0 || config.stopLoss >= 1) { // 条件判断 typeof config.stopLoss !== 'number' || config...
      errors.push('止损比例必须在 0-1 之间 / Stop loss must be between 0 and 1'); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 验证止盈比例 / Validate take profit ratio
  if (config.takeProfit !== undefined) { // 条件判断 config.takeProfit !== undefined
    if (typeof config.takeProfit !== 'number' || config.takeProfit <= 0) { // 条件判断 typeof config.takeProfit !== 'number' || conf...
      errors.push('止盈比例必须为正数 / Take profit must be positive'); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 返回验证结果 / Return validation result
  return { // 返回结果
    valid: errors.length === 0, // 有效
    errors, // 执行语句
  }; // 结束代码块
} // 结束代码块

/**
 * 验证风控配置
 * Validate risk management configuration
 * @param {Object} config - 风控配置 / Risk management configuration
 * @returns {Object} 验证结果 { valid, errors } / Validation result
 */
export function validateRiskConfig(config) { // 导出函数 validateRiskConfig
  // 错误列表 / Error list
  const errors = []; // 定义常量 errors

  // 检查必需字段 / Check required fields
  if (!config) { // 条件判断 !config
    return { valid: false, errors: ['风控配置不能为空 / Risk config cannot be null'] }; // 返回结果
  } // 结束代码块

  // 验证最大持仓比例 / Validate max position ratio
  if (config.maxPositionRatio !== undefined) { // 条件判断 config.maxPositionRatio !== undefined
    if (typeof config.maxPositionRatio !== 'number' || config.maxPositionRatio <= 0 || config.maxPositionRatio > 1) { // 条件判断 typeof config.maxPositionRatio !== 'number' |...
      errors.push('最大持仓比例必须在 0-1 之间 / Max position ratio must be between 0 and 1'); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 验证单笔风险比例 / Validate risk per trade
  if (config.riskPerTrade !== undefined) { // 条件判断 config.riskPerTrade !== undefined
    if (typeof config.riskPerTrade !== 'number' || config.riskPerTrade <= 0 || config.riskPerTrade > 0.1) { // 条件判断 typeof config.riskPerTrade !== 'number' || co...
      errors.push('单笔风险比例必须在 0-10% 之间 / Risk per trade must be between 0 and 10%'); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 验证最大回撤 / Validate max drawdown
  if (config.maxDrawdown !== undefined) { // 条件判断 config.maxDrawdown !== undefined
    if (typeof config.maxDrawdown !== 'number' || config.maxDrawdown <= 0 || config.maxDrawdown > 1) { // 条件判断 typeof config.maxDrawdown !== 'number' || con...
      errors.push('最大回撤必须在 0-100% 之间 / Max drawdown must be between 0 and 100%'); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 验证每日亏损限制 / Validate daily loss limit
  if (config.dailyLossLimit !== undefined) { // 条件判断 config.dailyLossLimit !== undefined
    if (typeof config.dailyLossLimit !== 'number' || config.dailyLossLimit <= 0) { // 条件判断 typeof config.dailyLossLimit !== 'number' || ...
      errors.push('每日亏损限制必须为正数 / Daily loss limit must be positive'); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 返回验证结果 / Return validation result
  return { // 返回结果
    valid: errors.length === 0, // 有效
    errors, // 执行语句
  }; // 结束代码块
} // 结束代码块

// ============================================
// 数据验证 / Data Validation
// ============================================

/**
 * 验证 K 线数据
 * Validate candle data
 * @param {Object} candle - K 线对象 / Candle object
 * @returns {Object} 验证结果 { valid, errors } / Validation result
 */
export function validateCandle(candle) { // 导出函数 validateCandle
  // 错误列表 / Error list
  const errors = []; // 定义常量 errors

  // 检查必需字段 / Check required fields
  if (!candle) { // 条件判断 !candle
    return { valid: false, errors: ['K线数据不能为空 / Candle data cannot be null'] }; // 返回结果
  } // 结束代码块

  // 验证时间戳 / Validate timestamp
  if (!candle.timestamp && !candle.time) { // 条件判断 !candle.timestamp && !candle.time
    errors.push('缺少时间戳 / Missing timestamp'); // 调用 errors.push
  } // 结束代码块

  // 验证 OHLCV 数据 / Validate OHLCV data
  const fields = ['open', 'high', 'low', 'close']; // 定义常量 fields
  for (const field of fields) { // 循环 const field of fields
    if (candle[field] === undefined || candle[field] === null) { // 条件判断 candle[field] === undefined || candle[field] ...
      errors.push(`缺少 ${field} 字段 / Missing ${field} field`); // 调用 errors.push
    } else if (typeof candle[field] !== 'number' || candle[field] < 0) { // 执行语句
      errors.push(`${field} 必须为非负数 / ${field} must be non-negative`); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 验证价格逻辑 / Validate price logic
  if (candle.high < candle.low) { // 条件判断 candle.high < candle.low
    errors.push('最高价不能低于最低价 / High cannot be less than low'); // 调用 errors.push
  } // 结束代码块
  if (candle.high < candle.open || candle.high < candle.close) { // 条件判断 candle.high < candle.open || candle.high < ca...
    errors.push('最高价必须大于等于开盘价和收盘价 / High must be >= open and close'); // 调用 errors.push
  } // 结束代码块
  if (candle.low > candle.open || candle.low > candle.close) { // 条件判断 candle.low > candle.open || candle.low > cand...
    errors.push('最低价必须小于等于开盘价和收盘价 / Low must be <= open and close'); // 调用 errors.push
  } // 结束代码块

  // 验证成交量 / Validate volume
  if (candle.volume !== undefined && (typeof candle.volume !== 'number' || candle.volume < 0)) { // 条件判断 candle.volume !== undefined && (typeof candle...
    errors.push('成交量必须为非负数 / Volume must be non-negative'); // 调用 errors.push
  } // 结束代码块

  // 返回验证结果 / Return validation result
  return { // 返回结果
    valid: errors.length === 0, // 有效
    errors, // 执行语句
  }; // 结束代码块
} // 结束代码块

/**
 * 验证 K 线数据数组
 * Validate candle data array
 * @param {Object[]} candles - K 线数组 / Candle array
 * @returns {Object} 验证结果 { valid, errors, validCandles } / Validation result
 */
export function validateCandles(candles) { // 导出函数 validateCandles
  // 错误列表 / Error list
  const errors = []; // 定义常量 errors

  // 有效 K 线列表 / Valid candles list
  const validCandles = []; // 定义常量 validCandles

  // 检查数组 / Check array
  if (!candles || !Array.isArray(candles)) { // 条件判断 !candles || !Array.isArray(candles)
    return { valid: false, errors: ['K线数据必须为数组 / Candles must be an array'], validCandles: [] }; // 返回结果
  } // 结束代码块

  // 检查是否为空 / Check if empty
  if (candles.length === 0) { // 条件判断 candles.length === 0
    return { valid: false, errors: ['K线数据不能为空数组 / Candles cannot be empty'], validCandles: [] }; // 返回结果
  } // 结束代码块

  // 验证每根 K 线 / Validate each candle
  for (let i = 0; i < candles.length; i++) { // 循环 let i = 0; i < candles.length; i++
    const result = validateCandle(candles[i]); // 定义常量 result
    if (result.valid) { // 条件判断 result.valid
      validCandles.push(candles[i]); // 调用 validCandles.push
    } else { // 执行语句
      errors.push(`第 ${i + 1} 根K线无效: ${result.errors.join(', ')} / Candle ${i + 1} invalid`); // 调用 errors.push
    } // 结束代码块
  } // 结束代码块

  // 返回验证结果 / Return validation result
  return { // 返回结果
    valid: errors.length === 0, // 有效
    errors, // 执行语句
    validCandles, // 执行语句
  }; // 结束代码块
} // 结束代码块

// ============================================
// 类型验证 / Type Validation
// ============================================

/**
 * 检查是否为有效数字
 * Check if valid number
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为有效数字 / Is valid number
 */
export function isValidNumber(value) { // 导出函数 isValidNumber
  return typeof value === 'number' && !isNaN(value) && isFinite(value); // 返回结果
} // 结束代码块

/**
 * 检查是否为正数
 * Check if positive number
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为正数 / Is positive number
 */
export function isPositiveNumber(value) { // 导出函数 isPositiveNumber
  return isValidNumber(value) && value > 0; // 返回结果
} // 结束代码块

/**
 * 检查是否为非负数
 * Check if non-negative number
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为非负数 / Is non-negative number
 */
export function isNonNegativeNumber(value) { // 导出函数 isNonNegativeNumber
  return isValidNumber(value) && value >= 0; // 返回结果
} // 结束代码块

/**
 * 检查是否为有效百分比
 * Check if valid percentage
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为有效百分比 (0-100) / Is valid percentage
 */
export function isValidPercentage(value) { // 导出函数 isValidPercentage
  return isValidNumber(value) && value >= 0 && value <= 100; // 返回结果
} // 结束代码块

/**
 * 检查是否为有效比例
 * Check if valid ratio
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为有效比例 (0-1) / Is valid ratio
 */
export function isValidRatio(value) { // 导出函数 isValidRatio
  return isValidNumber(value) && value >= 0 && value <= 1; // 返回结果
} // 结束代码块

/**
 * 检查是否为非空字符串
 * Check if non-empty string
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为非空字符串 / Is non-empty string
 */
export function isNonEmptyString(value) { // 导出函数 isNonEmptyString
  return typeof value === 'string' && value.trim().length > 0; // 返回结果
} // 结束代码块

/**
 * 检查是否为有效日期
 * Check if valid date
 * @param {any} value - 要检查的值 / Value to check
 * @returns {boolean} 是否为有效日期 / Is valid date
 */
export function isValidDate(value) { // 导出函数 isValidDate
  // 如果是 Date 对象 / If Date object
  if (value instanceof Date) { // 条件判断 value instanceof Date
    return !isNaN(value.getTime()); // 返回结果
  } // 结束代码块

  // 尝试解析 / Try to parse
  const date = new Date(value); // 定义常量 date
  return !isNaN(date.getTime()); // 返回结果
} // 结束代码块

/**
 * 检查是否为有效邮箱
 * Check if valid email
 * @param {string} email - 邮箱地址 / Email address
 * @returns {boolean} 是否为有效邮箱 / Is valid email
 */
export function isValidEmail(email) { // 导出函数 isValidEmail
  // 基本邮箱正则 / Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // 定义常量 emailRegex
  return typeof email === 'string' && emailRegex.test(email); // 返回结果
} // 结束代码块

/**
 * 检查是否为有效 URL
 * Check if valid URL
 * @param {string} url - URL 地址 / URL address
 * @returns {boolean} 是否为有效 URL / Is valid URL
 */
export function isValidUrl(url) { // 导出函数 isValidUrl
  try { // 尝试执行
    new URL(url); // 创建 URL 实例
    return true; // 返回结果
  } catch { // 执行语句
    return false; // 返回结果
  } // 结束代码块
} // 结束代码块

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
export function isInRange(value, min, max) { // 导出函数 isInRange
  return isValidNumber(value) && value >= min && value <= max; // 返回结果
} // 结束代码块

/**
 * 限制数字在范围内
 * Clamp number to range
 * @param {number} value - 要限制的值 / Value to clamp
 * @param {number} min - 最小值 / Minimum
 * @param {number} max - 最大值 / Maximum
 * @returns {number} 限制后的值 / Clamped value
 */
export function clamp(value, min, max) { // 导出函数 clamp
  if (!isValidNumber(value)) { // 条件判断 !isValidNumber(value)
    return min; // 返回结果
  } // 结束代码块
  return Math.max(min, Math.min(max, value)); // 返回结果
} // 结束代码块

// 默认导出所有函数 / Default export all functions
export default { // 默认导出
  // 交易参数验证 / Trading parameter validation
  validateOrder, // 执行语句
  validateStrategyConfig, // 执行语句
  validateRiskConfig, // 执行语句

  // 数据验证 / Data validation
  validateCandle, // 执行语句
  validateCandles, // 执行语句

  // 类型验证 / Type validation
  isValidNumber, // 执行语句
  isPositiveNumber, // 执行语句
  isNonNegativeNumber, // 执行语句
  isValidPercentage, // 执行语句
  isValidRatio, // 执行语句
  isNonEmptyString, // 执行语句
  isValidDate, // 执行语句
  isValidEmail, // 执行语句
  isValidUrl, // 执行语句

  // 范围验证 / Range validation
  isInRange, // 执行语句
  clamp, // 执行语句
}; // 结束代码块
