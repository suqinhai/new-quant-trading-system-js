/**
 * Zod 运行时验证测试
 * Zod Runtime Validation Tests
 * @module tests/unit/zodValidators.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  z,
  ZodSchemas,
  OrderConfigSchema,
  StrategySchemas,
  RiskConfigSchema,
  ExchangeConfigSchema,
  CandleSchema,
  zodValidate,
  zodValidateOrThrow,
  createZodMiddleware,
} from '../../src/utils/validators.js';

// ============================================
// 基础类型 Schema 测试
// ============================================

describe('ZodSchemas 基础类型', () => {
  describe('positiveNumber', () => {
    it('应该接受正数', () => {
      expect(ZodSchemas.positiveNumber.safeParse(1).success).toBe(true);
      expect(ZodSchemas.positiveNumber.safeParse(0.001).success).toBe(true);
      expect(ZodSchemas.positiveNumber.safeParse(1000000).success).toBe(true);
    });

    it('应该拒绝零和负数', () => {
      expect(ZodSchemas.positiveNumber.safeParse(0).success).toBe(false);
      expect(ZodSchemas.positiveNumber.safeParse(-1).success).toBe(false);
    });
  });

  describe('percentage', () => {
    it('应该接受 0-1 之间的值', () => {
      expect(ZodSchemas.percentage.safeParse(0).success).toBe(true);
      expect(ZodSchemas.percentage.safeParse(0.5).success).toBe(true);
      expect(ZodSchemas.percentage.safeParse(1).success).toBe(true);
    });

    it('应该拒绝范围外的值', () => {
      expect(ZodSchemas.percentage.safeParse(-0.1).success).toBe(false);
      expect(ZodSchemas.percentage.safeParse(1.1).success).toBe(false);
    });
  });

  describe('symbol', () => {
    it('应该接受有效的交易对格式', () => {
      expect(ZodSchemas.symbol.safeParse('BTC/USDT').success).toBe(true);
      expect(ZodSchemas.symbol.safeParse('ETH/BTC').success).toBe(true);
      expect(ZodSchemas.symbol.safeParse('DOGE/USDT').success).toBe(true);
    });

    it('应该拒绝无效格式', () => {
      expect(ZodSchemas.symbol.safeParse('BTCUSDT').success).toBe(false);
      expect(ZodSchemas.symbol.safeParse('BTC-USDT').success).toBe(false);
      expect(ZodSchemas.symbol.safeParse('').success).toBe(false);
    });
  });

  describe('orderSide', () => {
    it('应该接受 buy 和 sell', () => {
      expect(ZodSchemas.orderSide.safeParse('buy').success).toBe(true);
      expect(ZodSchemas.orderSide.safeParse('sell').success).toBe(true);
    });

    it('应该拒绝其他值', () => {
      expect(ZodSchemas.orderSide.safeParse('long').success).toBe(false);
      expect(ZodSchemas.orderSide.safeParse('short').success).toBe(false);
    });
  });

  describe('timeframe', () => {
    it('应该接受有效的时间周期', () => {
      expect(ZodSchemas.timeframe.safeParse('1m').success).toBe(true);
      expect(ZodSchemas.timeframe.safeParse('1h').success).toBe(true);
      expect(ZodSchemas.timeframe.safeParse('1d').success).toBe(true);
    });

    it('应该拒绝无效的时间周期', () => {
      expect(ZodSchemas.timeframe.safeParse('1s').success).toBe(false);
      expect(ZodSchemas.timeframe.safeParse('2m').success).toBe(false);
    });
  });
});

// ============================================
// 订单配置 Schema 测试
// ============================================

describe('OrderConfigSchema', () => {
  it('应该接受有效的限价单配置', () => {
    const result = zodValidate(OrderConfigSchema, {
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.1,
      price: 50000,
    });

    expect(result.success).toBe(true);
    expect(result.data.reduceOnly).toBe(false);
    expect(result.data.timeInForce).toBe('GTC');
  });

  it('应该接受有效的市价单配置 (无价格)', () => {
    const result = zodValidate(OrderConfigSchema, {
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'market',
      amount: 0.5,
    });

    expect(result.success).toBe(true);
  });

  it('应该拒绝没有价格的限价单', () => {
    const result = zodValidate(OrderConfigSchema, {
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      amount: 0.1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Price is required');
  });

  it('应该拒绝无效的交易对', () => {
    const result = zodValidate(OrderConfigSchema, {
      symbol: 'BTCUSDT',
      side: 'buy',
      amount: 0.1,
      price: 50000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('BASE/QUOTE');
  });

  it('应该拒绝零或负数的数量', () => {
    const result = zodValidate(OrderConfigSchema, {
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: 0,
      price: 50000,
    });

    expect(result.success).toBe(false);
  });
});

// ============================================
// 策略配置 Schema 测试
// ============================================

describe('StrategySchemas', () => {
  describe('SMA 策略', () => {
    it('应该接受有效的 SMA 配置', () => {
      const result = zodValidate(StrategySchemas.sma, {
        shortPeriod: 10,
        longPeriod: 20,
        symbol: 'BTC/USDT',
      });

      expect(result.success).toBe(true);
      expect(result.data.timeframe).toBe('1h');
    });

    it('应该拒绝 shortPeriod >= longPeriod', () => {
      const result = zodValidate(StrategySchemas.sma, {
        shortPeriod: 20,
        longPeriod: 20,
        symbol: 'BTC/USDT',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Short period must be less');
    });
  });

  describe('RSI 策略', () => {
    it('应该接受有效的 RSI 配置', () => {
      const result = zodValidate(StrategySchemas.rsi, {
        period: 14,
        overbought: 70,
        oversold: 30,
        symbol: 'ETH/USDT',
      });

      expect(result.success).toBe(true);
    });

    it('应该拒绝 oversold >= overbought', () => {
      const result = zodValidate(StrategySchemas.rsi, {
        period: 14,
        overbought: 30,
        oversold: 70,
        symbol: 'ETH/USDT',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Oversold level must be less');
    });
  });

  describe('MACD 策略', () => {
    it('应该接受有效的 MACD 配置', () => {
      const result = zodValidate(StrategySchemas.macd, {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        symbol: 'BTC/USDT',
      });

      expect(result.success).toBe(true);
    });

    it('应该拒绝 fastPeriod >= slowPeriod', () => {
      const result = zodValidate(StrategySchemas.macd, {
        fastPeriod: 26,
        slowPeriod: 12,
        signalPeriod: 9,
        symbol: 'BTC/USDT',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Grid 策略', () => {
    it('应该接受有效的网格配置', () => {
      const result = zodValidate(StrategySchemas.grid, {
        symbol: 'BTC/USDT',
        upperPrice: 60000,
        lowerPrice: 40000,
        gridCount: 20,
        totalAmount: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data.side).toBe('neutral');
    });

    it('应该拒绝 lowerPrice >= upperPrice', () => {
      const result = zodValidate(StrategySchemas.grid, {
        symbol: 'BTC/USDT',
        upperPrice: 40000,
        lowerPrice: 60000,
        totalAmount: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lower price must be less');
    });
  });
});

// ============================================
// 风控配置 Schema 测试
// ============================================

describe('RiskConfigSchema', () => {
  it('应该接受有效的风控配置', () => {
    const result = zodValidate(RiskConfigSchema, {
      maxPositions: 5,
      maxPositionSize: 0.1,
      maxDailyLoss: 0.05,
    });

    expect(result.success).toBe(true);
    expect(result.data.maxLeverage).toBe(10);
    expect(result.data.defaultStopLoss).toBe(0.02);
  });

  it('应该使用默认值', () => {
    const result = zodValidate(RiskConfigSchema, {});

    expect(result.success).toBe(true);
    expect(result.data.maxPositions).toBe(10);
    expect(result.data.maxConsecutiveLosses).toBe(5);
  });

  it('应该拒绝超过范围的杠杆', () => {
    const result = zodValidate(RiskConfigSchema, {
      maxLeverage: 200,
    });

    expect(result.success).toBe(false);
  });
});

// ============================================
// 交易所配置 Schema 测试
// ============================================

describe('ExchangeConfigSchema', () => {
  it('应该接受有效的交易所配置', () => {
    const result = zodValidate(ExchangeConfigSchema, {
      exchange: 'binance',
      apiKey: 'my-api-key',
      secret: 'my-secret',
    });

    expect(result.success).toBe(true);
    expect(result.data.testnet).toBe(false);
  });

  it('应该拒绝无效的交易所名称', () => {
    const result = zodValidate(ExchangeConfigSchema, {
      exchange: 'invalid',
      apiKey: 'key',
      secret: 'secret',
    });

    expect(result.success).toBe(false);
  });

  it('应该拒绝空的 API Key', () => {
    const result = zodValidate(ExchangeConfigSchema, {
      exchange: 'binance',
      apiKey: '',
      secret: 'secret',
    });

    expect(result.success).toBe(false);
  });
});

// ============================================
// K线数据 Schema 测试
// ============================================

describe('CandleSchema', () => {
  it('应该接受有效的 K 线数据', () => {
    const result = zodValidate(CandleSchema, {
      timestamp: Date.now(),
      open: 50000,
      high: 51000,
      low: 49000,
      close: 50500,
      volume: 1000,
    });

    expect(result.success).toBe(true);
  });

  it('应该拒绝 low > open 的数据', () => {
    const result = zodValidate(CandleSchema, {
      timestamp: Date.now(),
      open: 50000,
      high: 51000,
      low: 50001, // 大于 open
      close: 50500,
      volume: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Low must be');
  });

  it('应该拒绝 high < close 的数据', () => {
    const result = zodValidate(CandleSchema, {
      timestamp: Date.now(),
      open: 50000,
      high: 50400, // 小于 close
      low: 49000,
      close: 50500,
      volume: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('High must be');
  });
});

// ============================================
// zodValidateOrThrow 测试
// ============================================

describe('zodValidateOrThrow', () => {
  it('应该在验证成功时返回数据', () => {
    const data = zodValidateOrThrow(ZodSchemas.positiveNumber, 42);
    expect(data).toBe(42);
  });

  it('应该在验证失败时抛出 ValidationError', () => {
    expect(() => {
      zodValidateOrThrow(ZodSchemas.positiveNumber, -1);
    }).toThrow();

    // 验证抛出的是 ValidationError
    try {
      zodValidateOrThrow(ZodSchemas.positiveNumber, 0);
    } catch (e) {
      expect(e.name).toBe('ValidationError');
    }
  });

  it('抛出的错误应该包含 errors 数组', () => {
    try {
      zodValidateOrThrow(OrderConfigSchema, { symbol: 'invalid' });
    } catch (error) {
      expect(error.name).toBe('ValidationError');
      expect(error.errors).toBeDefined();
      expect(Array.isArray(error.errors)).toBe(true);
    }
  });
});

// ============================================
// createZodMiddleware 测试
// ============================================

describe('createZodMiddleware', () => {
  it('应该在验证成功时调用 next', () => {
    const middleware = createZodMiddleware(OrderConfigSchema, 'body');

    const req = {
      body: {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      },
    };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);

    expect(nextCalled).toBe(true);
    expect(req.validatedBody).toBeDefined();
    expect(req.validatedBody.symbol).toBe('BTC/USDT');
  });

  it('应该在验证失败时返回 400', () => {
    const middleware = createZodMiddleware(OrderConfigSchema, 'body');

    const req = {
      body: {
        symbol: 'invalid',
      },
    };
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonResponse = data;
        return res;
      },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);

    expect(nextCalled).toBe(false);
    expect(statusCode).toBe(400);
    expect(jsonResponse.success).toBe(false);
    expect(jsonResponse.code).toBe('VALIDATION_ERROR');
  });
});

// ============================================
// Zod 实例导出测试
// ============================================

describe('Zod 实例', () => {
  it('应该导出可用的 z 实例', () => {
    expect(z).toBeDefined();
    expect(typeof z.string).toBe('function');
    expect(typeof z.number).toBe('function');
    expect(typeof z.object).toBe('function');
  });

  it('应该能够创建自定义 Schema', () => {
    const customSchema = z.object({
      name: z.string(),
      age: z.number().min(0),
    });

    const result = customSchema.safeParse({ name: 'Test', age: 25 });
    expect(result.success).toBe(true);
  });
});

// ============================================
// 传统验证函数测试
// ============================================

import {
  validateOrder,
  validateStrategyConfig,
  validateRiskConfig,
  validateCandle,
  validateCandles,
  isValidNumber,
  isPositiveNumber,
  isNonNegativeNumber,
  isValidPercentage,
  isValidRatio,
  isNonEmptyString,
  isValidDate,
  isValidEmail,
  isValidUrl,
  isInRange,
  clamp,
} from '../../src/utils/validators.js';

// ============================================
// validateOrder 测试
// ============================================

describe('validateOrder', () => {
  it('应该验证有效的订单', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'buy',
      amount: 0.1,
      price: 50000,
    });

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('应该验证市价单（无需价格）', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'market',
      side: 'sell',
      amount: 0.1,
    });

    expect(result.valid).toBe(true);
  });

  it('空订单对象应该返回错误', () => {
    const result = validateOrder(null);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('不能为空');
  });

  it('无效交易对应该返回错误', () => {
    const result = validateOrder({
      symbol: 'BTCUSDT', // 缺少 /
      type: 'limit',
      side: 'buy',
      amount: 0.1,
      price: 50000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('格式错误'))).toBe(true);
  });

  it('缺少交易对应该返回错误', () => {
    const result = validateOrder({
      type: 'limit',
      side: 'buy',
      amount: 0.1,
      price: 50000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('symbol') || e.includes('交易对'))).toBe(true);
  });

  it('无效订单类型应该返回错误', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'invalid',
      side: 'buy',
      amount: 0.1,
      price: 50000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('订单类型无效'))).toBe(true);
  });

  it('无效订单方向应该返回错误', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'long',
      amount: 0.1,
      price: 50000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('订单方向无效'))).toBe(true);
  });

  it('缺少数量应该返回错误', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'buy',
      price: 50000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('数量'))).toBe(true);
  });

  it('负数量应该返回错误', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'buy',
      amount: -0.1,
      price: 50000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('正数'))).toBe(true);
  });

  it('限价单缺少价格应该返回错误', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'buy',
      amount: 0.1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('价格'))).toBe(true);
  });

  it('止损限价单缺少价格应该返回错误', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'stop_limit',
      side: 'buy',
      amount: 0.1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('价格'))).toBe(true);
  });

  it('限价单价格为负数应该返回错误', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'buy',
      amount: 0.1,
      price: -50000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('价格必须为正数'))).toBe(true);
  });

  it('数量为非数字应该返回错误', () => {
    const result = validateOrder({
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'buy',
      amount: 'invalid',
      price: 50000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('正数'))).toBe(true);
  });
});

// ============================================
// validateStrategyConfig 测试
// ============================================

describe('validateStrategyConfig', () => {
  it('应该验证有效的策略配置', () => {
    const result = validateStrategyConfig({
      symbols: ['BTC/USDT', 'ETH/USDT'],
      timeframe: '1h',
      capitalRatio: 0.1,
      stopLoss: 0.02,
      takeProfit: 0.05,
    });

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('空配置应该返回错误', () => {
    const result = validateStrategyConfig(null);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('不能为空');
  });

  it('缺少交易对列表应该返回错误', () => {
    const result = validateStrategyConfig({
      timeframe: '1h',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('交易对'))).toBe(true);
  });

  it('空交易对列表应该返回错误', () => {
    const result = validateStrategyConfig({
      symbols: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('至少一个交易对'))).toBe(true);
  });

  it('无效时间周期应该返回错误', () => {
    const result = validateStrategyConfig({
      symbols: ['BTC/USDT'],
      timeframe: '2m',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('时间周期无效'))).toBe(true);
  });

  it('资金比例超出范围应该返回错误', () => {
    const result = validateStrategyConfig({
      symbols: ['BTC/USDT'],
      capitalRatio: 1.5,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('资金比例'))).toBe(true);
  });

  it('资金比例为负数应该返回错误', () => {
    const result = validateStrategyConfig({
      symbols: ['BTC/USDT'],
      capitalRatio: -0.1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('资金比例'))).toBe(true);
  });

  it('止损比例无效应该返回错误', () => {
    const result = validateStrategyConfig({
      symbols: ['BTC/USDT'],
      stopLoss: 1.5, // 超出 0-1 范围
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('止损比例'))).toBe(true);
  });

  it('止损比例为负数应该返回错误', () => {
    const result = validateStrategyConfig({
      symbols: ['BTC/USDT'],
      stopLoss: -0.02,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('止损比例'))).toBe(true);
  });

  it('止盈比例为负数应该返回错误', () => {
    const result = validateStrategyConfig({
      symbols: ['BTC/USDT'],
      takeProfit: -0.05,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('止盈比例'))).toBe(true);
  });
});

// ============================================
// validateRiskConfig 测试
// ============================================

describe('validateRiskConfig', () => {
  it('应该验证有效的风控配置', () => {
    const result = validateRiskConfig({
      maxPositionRatio: 0.2,
      riskPerTrade: 0.01,
      maxDrawdown: 0.2,
      dailyLossLimit: 1000,
    });

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('空配置应该返回错误', () => {
    const result = validateRiskConfig(null);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('不能为空');
  });

  it('最大持仓比例超出范围应该返回错误', () => {
    const result = validateRiskConfig({
      maxPositionRatio: 1.5,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('最大持仓比例'))).toBe(true);
  });

  it('最大持仓比例为负数应该返回错误', () => {
    const result = validateRiskConfig({
      maxPositionRatio: -0.2,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('最大持仓比例'))).toBe(true);
  });

  it('单笔风险比例超出范围应该返回错误', () => {
    const result = validateRiskConfig({
      riskPerTrade: 0.15, // 超过 10%
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('单笔风险比例'))).toBe(true);
  });

  it('单笔风险比例为负数应该返回错误', () => {
    const result = validateRiskConfig({
      riskPerTrade: -0.01,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('单笔风险比例'))).toBe(true);
  });

  it('最大回撤超出范围应该返回错误', () => {
    const result = validateRiskConfig({
      maxDrawdown: 1.5,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('最大回撤'))).toBe(true);
  });

  it('最大回撤为负数应该返回错误', () => {
    const result = validateRiskConfig({
      maxDrawdown: -0.1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('最大回撤'))).toBe(true);
  });

  it('每日亏损限制为负数应该返回错误', () => {
    const result = validateRiskConfig({
      dailyLossLimit: -100,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('每日亏损限制'))).toBe(true);
  });
});

// ============================================
// validateCandle 测试
// ============================================

describe('validateCandle', () => {
  it('应该验证有效的 K 线数据', () => {
    const result = validateCandle({
      timestamp: Date.now(),
      open: 50000,
      high: 51000,
      low: 49000,
      close: 50500,
      volume: 1000,
    });

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('使用 time 字段也应该有效', () => {
    const result = validateCandle({
      time: Date.now(),
      open: 50000,
      high: 51000,
      low: 49000,
      close: 50500,
    });

    expect(result.valid).toBe(true);
  });

  it('空数据应该返回错误', () => {
    const result = validateCandle(null);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('不能为空');
  });

  it('缺少时间戳应该返回错误', () => {
    const result = validateCandle({
      open: 50000,
      high: 51000,
      low: 49000,
      close: 50500,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('时间戳'))).toBe(true);
  });

  it('缺少 OHLC 字段应该返回错误', () => {
    const result = validateCandle({
      timestamp: Date.now(),
      high: 51000,
      low: 49000,
      close: 50500,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('open'))).toBe(true);
  });

  it('负价格应该返回错误', () => {
    const result = validateCandle({
      timestamp: Date.now(),
      open: -50000,
      high: 51000,
      low: 49000,
      close: 50500,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('非负数'))).toBe(true);
  });

  it('最高价低于最低价应该返回错误', () => {
    const result = validateCandle({
      timestamp: Date.now(),
      open: 50000,
      high: 48000, // 低于 low
      low: 49000,
      close: 50500,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('最高价不能低于最低价'))).toBe(true);
  });

  it('最高价低于开盘价应该返回错误', () => {
    const result = validateCandle({
      timestamp: Date.now(),
      open: 51500, // 高于 high
      high: 51000,
      low: 49000,
      close: 50500,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('最高价必须大于等于'))).toBe(true);
  });

  it('最低价高于收盘价应该返回错误', () => {
    const result = validateCandle({
      timestamp: Date.now(),
      open: 50000,
      high: 51000,
      low: 50600, // 高于 close
      close: 50500,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('最低价必须小于等于'))).toBe(true);
  });

  it('负成交量应该返回错误', () => {
    const result = validateCandle({
      timestamp: Date.now(),
      open: 50000,
      high: 51000,
      low: 49000,
      close: 50500,
      volume: -100,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('成交量'))).toBe(true);
  });
});

// ============================================
// validateCandles 测试
// ============================================

describe('validateCandles', () => {
  it('应该验证有效的 K 线数组', () => {
    const result = validateCandles([
      { timestamp: 1000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
      { timestamp: 2000, open: 105, high: 115, low: 100, close: 110, volume: 1200 },
    ]);

    expect(result.valid).toBe(true);
    expect(result.validCandles.length).toBe(2);
  });

  it('非数组应该返回错误', () => {
    const result = validateCandles('not an array');

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('必须为数组');
    expect(result.validCandles.length).toBe(0);
  });

  it('null 应该返回错误', () => {
    const result = validateCandles(null);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('必须为数组');
  });

  it('空数组应该返回错误', () => {
    const result = validateCandles([]);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('不能为空');
  });

  it('应该过滤出有效的 K 线', () => {
    const result = validateCandles([
      { timestamp: 1000, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
      { timestamp: 2000, open: -100, high: 115, low: 100, close: 110, volume: 1200 }, // 无效
      { timestamp: 3000, open: 110, high: 120, low: 105, close: 115, volume: 1100 },
    ]);

    expect(result.valid).toBe(false);
    expect(result.validCandles.length).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('第 2 根');
  });
});

// ============================================
// 类型验证函数测试
// ============================================

describe('isValidNumber', () => {
  it('应该返回 true 对于有效数字', () => {
    expect(isValidNumber(42)).toBe(true);
    expect(isValidNumber(0)).toBe(true);
    expect(isValidNumber(-10)).toBe(true);
    expect(isValidNumber(3.14)).toBe(true);
  });

  it('应该返回 false 对于 NaN', () => {
    expect(isValidNumber(NaN)).toBe(false);
  });

  it('应该返回 false 对于 Infinity', () => {
    expect(isValidNumber(Infinity)).toBe(false);
    expect(isValidNumber(-Infinity)).toBe(false);
  });

  it('应该返回 false 对于非数字类型', () => {
    expect(isValidNumber('42')).toBe(false);
    expect(isValidNumber(null)).toBe(false);
    expect(isValidNumber(undefined)).toBe(false);
    expect(isValidNumber({})).toBe(false);
  });
});

describe('isPositiveNumber', () => {
  it('应该返回 true 对于正数', () => {
    expect(isPositiveNumber(1)).toBe(true);
    expect(isPositiveNumber(0.001)).toBe(true);
    expect(isPositiveNumber(1000000)).toBe(true);
  });

  it('应该返回 false 对于零', () => {
    expect(isPositiveNumber(0)).toBe(false);
  });

  it('应该返回 false 对于负数', () => {
    expect(isPositiveNumber(-1)).toBe(false);
    expect(isPositiveNumber(-0.001)).toBe(false);
  });

  it('应该返回 false 对于非数字类型', () => {
    expect(isPositiveNumber('1')).toBe(false);
    expect(isPositiveNumber(null)).toBe(false);
  });
});

describe('isNonNegativeNumber', () => {
  it('应该返回 true 对于非负数', () => {
    expect(isNonNegativeNumber(0)).toBe(true);
    expect(isNonNegativeNumber(1)).toBe(true);
    expect(isNonNegativeNumber(0.001)).toBe(true);
  });

  it('应该返回 false 对于负数', () => {
    expect(isNonNegativeNumber(-1)).toBe(false);
    expect(isNonNegativeNumber(-0.001)).toBe(false);
  });

  it('应该返回 false 对于非数字类型', () => {
    expect(isNonNegativeNumber('0')).toBe(false);
  });
});

describe('isValidPercentage', () => {
  it('应该返回 true 对于 0-100 之间的值', () => {
    expect(isValidPercentage(0)).toBe(true);
    expect(isValidPercentage(50)).toBe(true);
    expect(isValidPercentage(100)).toBe(true);
  });

  it('应该返回 false 对于范围外的值', () => {
    expect(isValidPercentage(-1)).toBe(false);
    expect(isValidPercentage(101)).toBe(false);
  });

  it('应该返回 false 对于非数字类型', () => {
    expect(isValidPercentage('50')).toBe(false);
  });
});

describe('isValidRatio', () => {
  it('应该返回 true 对于 0-1 之间的值', () => {
    expect(isValidRatio(0)).toBe(true);
    expect(isValidRatio(0.5)).toBe(true);
    expect(isValidRatio(1)).toBe(true);
  });

  it('应该返回 false 对于范围外的值', () => {
    expect(isValidRatio(-0.1)).toBe(false);
    expect(isValidRatio(1.1)).toBe(false);
  });

  it('应该返回 false 对于非数字类型', () => {
    expect(isValidRatio('0.5')).toBe(false);
  });
});

describe('isNonEmptyString', () => {
  it('应该返回 true 对于非空字符串', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString('a')).toBe(true);
    expect(isNonEmptyString('  hello  ')).toBe(true);
  });

  it('应该返回 false 对于空字符串', () => {
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('   ')).toBe(false);
  });

  it('应该返回 false 对于非字符串类型', () => {
    expect(isNonEmptyString(123)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
  });
});

describe('isValidDate', () => {
  it('应该返回 true 对于有效的 Date 对象', () => {
    expect(isValidDate(new Date())).toBe(true);
    expect(isValidDate(new Date('2024-01-01'))).toBe(true);
  });

  it('应该返回 true 对于有效的日期字符串', () => {
    expect(isValidDate('2024-01-01')).toBe(true);
    expect(isValidDate('2024/01/01')).toBe(true);
  });

  it('应该返回 true 对于时间戳', () => {
    expect(isValidDate(Date.now())).toBe(true);
    expect(isValidDate(1704067200000)).toBe(true);
  });

  it('应该返回 false 对于无效日期', () => {
    expect(isValidDate(new Date('invalid'))).toBe(false);
    expect(isValidDate('not a date')).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('应该返回 true 对于有效的邮箱', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('user.name@domain.co')).toBe(true);
    expect(isValidEmail('a@b.c')).toBe(true);
  });

  it('应该返回 false 对于无效的邮箱', () => {
    expect(isValidEmail('invalid')).toBe(false);
    expect(isValidEmail('test@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('test@example')).toBe(false);
  });

  it('应该返回 false 对于非字符串类型', () => {
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('应该返回 true 对于有效的 URL', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('ftp://files.example.com')).toBe(true);
  });

  it('应该返回 false 对于无效的 URL', () => {
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('example.com')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

// ============================================
// 范围验证函数测试
// ============================================

describe('isInRange', () => {
  it('应该返回 true 对于范围内的值', () => {
    expect(isInRange(5, 0, 10)).toBe(true);
    expect(isInRange(0, 0, 10)).toBe(true);
    expect(isInRange(10, 0, 10)).toBe(true);
  });

  it('应该返回 false 对于范围外的值', () => {
    expect(isInRange(-1, 0, 10)).toBe(false);
    expect(isInRange(11, 0, 10)).toBe(false);
  });

  it('应该返回 false 对于非数字类型', () => {
    expect(isInRange('5', 0, 10)).toBe(false);
    expect(isInRange(NaN, 0, 10)).toBe(false);
  });
});

describe('clamp', () => {
  it('应该返回范围内的值不变', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('应该限制到最小值', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(-100, 0, 10)).toBe(0);
  });

  it('应该限制到最大值', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(100, 0, 10)).toBe(10);
  });

  it('无效数字应该返回最小值', () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
    expect(clamp('5', 0, 10)).toBe(0);
    expect(clamp(Infinity, 0, 10)).toBe(0);
  });
});
