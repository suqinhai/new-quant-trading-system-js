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
