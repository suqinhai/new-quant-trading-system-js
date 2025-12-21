# 量化交易系统生产级改进计划

## 改进目标

将系统从 **65% 就绪度** 提升到 **90%+ 生产级别**，预计工期 **6-8 周**。

---

## 阶段概览

| 阶段 | 任务 | 工期 | 优先级 |
|------|------|------|--------|
| P0-1 | 核心模块测试框架 | 2周 | 🔴 必须 |
| P0-2 | API安全增强 | 1周 | 🔴 必须 |
| P0-3 | 审计日志系统 | 1周 | 🔴 必须 |
| P1-1 | 熔断器与健康检查 | 1周 | 🟡 重要 |
| P1-2 | 运行时类型验证 | 3天 | 🟡 重要 |
| P2 | 性能优化 | 1周 | 🟢 建议 |

---

## P0-1: 核心模块测试框架（2周）

### 目标
- 测试覆盖率从 2.3% 提升到 60%+
- 覆盖所有关键路径

### 第一周：基础设施 + 订单执行测试

#### 1.1 安装测试依赖

```bash
pnpm add -D vitest @vitest/coverage-v8 msw
```

#### 1.2 创建测试配置

**vitest.config.js**:
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'examples/**',
        'scripts/**',
        '**/*.config.*',
      ],
      thresholds: {
        global: {
          statements: 60,
          branches: 50,
          functions: 60,
          lines: 60,
        },
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

#### 1.3 创建 Mock 工厂

**tests/mocks/exchangeMock.js**:
```javascript
/**
 * 交易所 Mock 工厂
 */
export function createExchangeMock(overrides = {}) {
  return {
    id: 'binance',
    name: 'Binance',

    // 账户方法
    fetchBalance: vi.fn().mockResolvedValue({
      USDT: { free: 10000, used: 0, total: 10000 },
      BTC: { free: 1, used: 0, total: 1 },
    }),

    fetchPositions: vi.fn().mockResolvedValue([]),

    // 行情方法
    fetchTicker: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      last: 50000,
      bid: 49990,
      ask: 50010,
      volume: 1000,
    }),

    fetchOrderBook: vi.fn().mockResolvedValue({
      bids: [[49990, 10], [49980, 20]],
      asks: [[50010, 10], [50020, 20]],
    }),

    // 交易方法
    createOrder: vi.fn().mockResolvedValue({
      id: 'order_123',
      symbol: 'BTC/USDT',
      type: 'limit',
      side: 'buy',
      amount: 0.1,
      price: 50000,
      status: 'open',
      filled: 0,
      remaining: 0.1,
      timestamp: Date.now(),
    }),

    cancelOrder: vi.fn().mockResolvedValue({
      id: 'order_123',
      status: 'canceled',
    }),

    fetchOrder: vi.fn().mockResolvedValue({
      id: 'order_123',
      status: 'closed',
      filled: 0.1,
    }),

    fetchOpenOrders: vi.fn().mockResolvedValue([]),

    // 市场信息
    markets: {
      'BTC/USDT': {
        id: 'BTCUSDT',
        symbol: 'BTC/USDT',
        precision: { amount: 6, price: 2 },
        limits: {
          amount: { min: 0.0001 },
          price: { min: 0.01 },
        },
      },
    },

    ...overrides,
  };
}

/**
 * 创建失败的交易所 Mock
 */
export function createFailingExchangeMock(errorType = 'network') {
  const errors = {
    network: new Error('Network timeout'),
    rateLimit: (() => {
      const e = new Error('Rate limit exceeded');
      e.name = 'RateLimitExceeded';
      return e;
    })(),
    nonce: (() => {
      const e = new Error('Invalid nonce');
      e.message = 'Timestamp for this request is outside of the recvWindow';
      return e;
    })(),
    insufficient: new Error('Insufficient balance'),
  };

  return createExchangeMock({
    createOrder: vi.fn().mockRejectedValue(errors[errorType]),
    fetchOrder: vi.fn().mockRejectedValue(errors[errorType]),
  });
}
```

#### 1.4 OrderExecutor 测试

**tests/unit/orderExecutor.test.js**:
```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrderExecutor } from '../../src/executor/orderExecutor.js';
import { createExchangeMock, createFailingExchangeMock } from '../mocks/exchangeMock.js';

describe('OrderExecutor', () => {
  let executor;
  let mockExchange;

  beforeEach(() => {
    mockExchange = createExchangeMock();
    executor = new OrderExecutor({
      maxRetries: 3,
      retryDelay: 100,
      orderTimeout: 5000,
    });
    executor.exchanges.set('binance', mockExchange);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('executeOrder', () => {
    it('应该成功执行订单', async () => {
      const order = {
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        type: 'limit',
      };

      const result = await executor.executeOrder(order);

      expect(result.success).toBe(true);
      expect(result.order.id).toBe('order_123');
      expect(mockExchange.createOrder).toHaveBeenCalledTimes(1);
    });

    it('应该在网络错误时重试', async () => {
      const failingExchange = createFailingExchangeMock('network');
      executor.exchanges.set('binance', failingExchange);

      // 第三次成功
      failingExchange.createOrder
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ id: 'order_123', status: 'open' });

      const order = {
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        type: 'limit',
      };

      const result = await executor.executeOrder(order);

      expect(result.success).toBe(true);
      expect(failingExchange.createOrder).toHaveBeenCalledTimes(3);
    });

    it('应该处理限频错误并等待', async () => {
      const failingExchange = createFailingExchangeMock('rateLimit');
      executor.exchanges.set('binance', failingExchange);

      failingExchange.createOrder
        .mockRejectedValueOnce((() => {
          const e = new Error('Rate limit');
          e.name = 'RateLimitExceeded';
          return e;
        })())
        .mockResolvedValueOnce({ id: 'order_123', status: 'open' });

      const order = {
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        type: 'limit',
      };

      const startTime = Date.now();
      await executor.executeOrder(order);
      const elapsed = Date.now() - startTime;

      // 应该有等待时间
      expect(elapsed).toBeGreaterThan(50);
    });

    it('应该在超过最大重试次数后失败', async () => {
      const failingExchange = createFailingExchangeMock('network');
      executor.exchanges.set('binance', failingExchange);

      const order = {
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        type: 'limit',
      };

      const result = await executor.executeOrder(order);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(failingExchange.createOrder).toHaveBeenCalledTimes(3);
    });
  });

  describe('cancelOrder', () => {
    it('应该成功取消订单', async () => {
      const result = await executor.cancelOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        orderId: 'order_123',
      });

      expect(result.success).toBe(true);
      expect(mockExchange.cancelOrder).toHaveBeenCalledWith('order_123', 'BTC/USDT');
    });
  });

  describe('并发控制', () => {
    it('应该限制同一账户的并发订单', async () => {
      const orders = Array(5).fill(null).map((_, i) => ({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000 + i,
        type: 'limit',
      }));

      // 记录并发数
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      mockExchange.createOrder.mockImplementation(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise(r => setTimeout(r, 50));
        currentConcurrent--;
        return { id: `order_${Date.now()}`, status: 'open' };
      });

      await Promise.all(orders.map(o => executor.executeOrder(o)));

      // 并发数应该受限
      expect(maxConcurrent).toBeLessThanOrEqual(executor.config.concurrency || 3);
    });
  });
});
```

#### 1.5 RiskManager 测试

**tests/unit/riskManager.test.js**:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { RiskManager } from '../../src/risk/RiskManager.js';

describe('RiskManager', () => {
  let riskManager;

  beforeEach(() => {
    riskManager = new RiskManager({
      enabled: true,
      maxPositionRatio: 0.3,
      maxRiskPerTrade: 0.02,
      maxDailyLoss: 1000,
      maxDrawdown: 0.2,
      maxPositions: 5,
      maxLeverage: 3,
    });
  });

  describe('checkOrder', () => {
    it('应该允许正常订单', () => {
      const result = riskManager.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        accountBalance: 100000,
      });

      expect(result.allowed).toBe(true);
    });

    it('应该拒绝超过仓位限制的订单', () => {
      const result = riskManager.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1,
        price: 50000,  // 50000 USDT = 50% 仓位
        accountBalance: 100000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('仓位');
    });

    it('应该拒绝超过日亏损限制后的订单', () => {
      // 模拟日亏损
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        pnl: -800,
      });

      riskManager.recordTrade({
        symbol: 'ETH/USDT',
        side: 'sell',
        pnl: -300,
      });

      // 日亏损已达 1100，超过限制
      const result = riskManager.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        accountBalance: 100000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('日亏损');
    });

    it('应该拒绝超过最大持仓数的订单', () => {
      // 模拟5个持仓
      for (let i = 0; i < 5; i++) {
        riskManager.recordTrade({
          symbol: `COIN${i}/USDT`,
          side: 'buy',
          amount: 1,
          price: 100,
          pnl: 0,
        });
      }

      const result = riskManager.checkOrder({
        symbol: 'NEWCOIN/USDT',
        side: 'buy',
        amount: 1,
        price: 100,
        accountBalance: 100000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('持仓数');
    });

    it('应该检查黑名单', () => {
      riskManager.config.blacklist = ['SCAM/USDT'];

      const result = riskManager.checkOrder({
        symbol: 'SCAM/USDT',
        side: 'buy',
        amount: 1,
        price: 100,
        accountBalance: 100000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('黑名单');
    });
  });

  describe('getState', () => {
    it('应该返回正确的状态', () => {
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 100,
      });

      const state = riskManager.getState();

      expect(state.dailyPnL).toBe(100);
      expect(state.openPositions).toBeGreaterThanOrEqual(0);
    });
  });
});
```

### 第二周：策略测试 + 集成测试

#### 1.6 策略测试

**tests/unit/strategies/smaStrategy.test.js**:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SMAStrategy } from '../../../src/strategies/SMAStrategy.js';

describe('SMAStrategy', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    mockEngine = {
      buy: vi.fn().mockResolvedValue({ success: true }),
      sell: vi.fn().mockResolvedValue({ success: true }),
      buyPercent: vi.fn().mockResolvedValue({ success: true }),
      closePosition: vi.fn().mockResolvedValue({ success: true }),
      getPosition: vi.fn().mockReturnValue(null),
      getCapital: vi.fn().mockReturnValue(10000),
      getEquity: vi.fn().mockReturnValue(10000),
    };

    strategy = new SMAStrategy({
      fastPeriod: 5,
      slowPeriod: 10,
      symbols: ['BTC/USDT'],
    });
    strategy.engine = mockEngine;
  });

  describe('onTick', () => {
    it('应该在金叉时发出买入信号', async () => {
      // 构造金叉数据：快线从下穿上
      const history = generateCrossingHistory('golden');
      const candle = history[history.length - 1];

      const signalSpy = vi.fn();
      strategy.on('signal', signalSpy);

      await strategy.onTick(candle, history);

      expect(signalSpy).toHaveBeenCalled();
      expect(signalSpy.mock.calls[0][0].type).toBe('buy');
    });

    it('应该在死叉时发出卖出信号', async () => {
      // 构造死叉数据：快线从上穿下
      const history = generateCrossingHistory('death');
      const candle = history[history.length - 1];

      // 模拟有持仓
      mockEngine.getPosition.mockReturnValue({ amount: 0.1 });

      const signalSpy = vi.fn();
      strategy.on('signal', signalSpy);

      await strategy.onTick(candle, history);

      expect(signalSpy).toHaveBeenCalled();
      expect(signalSpy.mock.calls[0][0].type).toBe('sell');
    });

    it('应该在历史数据不足时不产生信号', async () => {
      const history = [
        { close: 100 },
        { close: 101 },
        { close: 102 },
      ];
      const candle = history[history.length - 1];

      const signalSpy = vi.fn();
      strategy.on('signal', signalSpy);

      await strategy.onTick(candle, history);

      expect(signalSpy).not.toHaveBeenCalled();
    });
  });
});

// 辅助函数：生成交叉数据
function generateCrossingHistory(type) {
  const history = [];
  const basePrice = 100;

  for (let i = 0; i < 20; i++) {
    let price;
    if (type === 'golden') {
      // 金叉：价格先跌后涨
      price = basePrice - 10 + i * 1.5;
    } else {
      // 死叉：价格先涨后跌
      price = basePrice + 10 - i * 1.5;
    }
    history.push({
      timestamp: Date.now() - (20 - i) * 3600000,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000,
    });
  }

  return history;
}
```

#### 1.7 集成测试

**tests/integration/tradingFlow.test.js**:
```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEngine } from '../../src/index.js';
import { createExchangeMock } from '../mocks/exchangeMock.js';

describe('Trading Flow Integration', () => {
  let engine;
  let mockExchange;

  beforeEach(async () => {
    mockExchange = createExchangeMock();

    engine = createEngine({
      exchange: {
        default: 'binance',
        binance: { sandbox: true },
      },
      risk: {
        maxPositionRatio: 0.3,
        maxDailyLoss: 1000,
      },
    });

    // 注入 Mock
    engine.exchanges.set('binance', mockExchange);
  });

  afterEach(async () => {
    await engine.stop();
  });

  describe('完整交易流程', () => {
    it('应该完成从信号到成交的完整流程', async () => {
      const events = [];

      engine.on('signalGenerated', (data) => events.push({ type: 'signal', data }));
      engine.on('orderExecuted', (data) => events.push({ type: 'order', data }));

      await engine.start();

      // 模拟策略信号
      engine.emit('strategySignal', {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      // 等待处理
      await new Promise(r => setTimeout(r, 100));

      expect(events.some(e => e.type === 'order')).toBe(true);
      expect(mockExchange.createOrder).toHaveBeenCalled();
    });

    it('应该在风控拒绝时不下单', async () => {
      // 模拟超过日亏损
      engine.riskManager.recordTrade({ pnl: -1500 });

      const rejectedEvents = [];
      engine.on('signalRejected', (data) => rejectedEvents.push(data));

      await engine.start();

      engine.emit('strategySignal', {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      await new Promise(r => setTimeout(r, 100));

      expect(rejectedEvents.length).toBeGreaterThan(0);
      expect(mockExchange.createOrder).not.toHaveBeenCalled();
    });
  });
});
```

#### 1.8 更新 package.json

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

---

## P0-2: API安全增强（1周）

### 目标
- 添加请求签名验证
- 防止重放攻击
- 敏感数据脱敏

### 2.1 创建安全模块

**src/security/ApiSecurity.js**:
```javascript
/**
 * API 安全模块
 * @module security/ApiSecurity
 */

import crypto from 'crypto';

/**
 * API 安全管理器
 */
export class ApiSecurity {
  constructor(config = {}) {
    // 时间窗口（毫秒）
    this.recvWindow = config.recvWindow || 5000;

    // 已使用的 nonce 缓存
    this.usedNonces = new Map();

    // 清理间隔
    this.cleanupInterval = setInterval(() => {
      this._cleanupOldNonces();
    }, 60000);
  }

  /**
   * 生成请求签名
   * @param {Object} params - 请求参数
   * @param {string} secret - API Secret
   * @returns {string} 签名
   */
  generateSignature(params, secret) {
    const timestamp = Date.now();
    const nonce = this._generateNonce();

    const payload = {
      ...params,
      timestamp,
      nonce,
    };

    const queryString = Object.keys(payload)
      .sort()
      .map(key => `${key}=${payload[key]}`)
      .join('&');

    const signature = crypto
      .createHmac('sha256', secret)
      .update(queryString)
      .digest('hex');

    return {
      ...payload,
      signature,
    };
  }

  /**
   * 验证响应完整性
   * @param {Object} response - 响应数据
   * @param {string} expectedChecksum - 预期校验和
   * @returns {boolean}
   */
  verifyResponseIntegrity(response, expectedChecksum) {
    const data = JSON.stringify(response);
    const checksum = crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');

    return checksum === expectedChecksum;
  }

  /**
   * 检查请求是否过期（防重放）
   * @param {number} timestamp - 请求时间戳
   * @param {string} nonce - 唯一标识
   * @returns {Object} { valid: boolean, reason?: string }
   */
  checkRequestValidity(timestamp, nonce) {
    const now = Date.now();

    // 检查时间窗口
    if (Math.abs(now - timestamp) > this.recvWindow) {
      return {
        valid: false,
        reason: `请求已过期: ${Math.abs(now - timestamp)}ms > ${this.recvWindow}ms`,
      };
    }

    // 检查 nonce 是否已使用
    if (this.usedNonces.has(nonce)) {
      return {
        valid: false,
        reason: '重复的请求 nonce',
      };
    }

    // 记录 nonce
    this.usedNonces.set(nonce, timestamp);

    return { valid: true };
  }

  /**
   * 生成唯一 nonce
   */
  _generateNonce() {
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * 清理过期的 nonce
   */
  _cleanupOldNonces() {
    const now = Date.now();
    const expiry = this.recvWindow * 2;

    for (const [nonce, timestamp] of this.usedNonces) {
      if (now - timestamp > expiry) {
        this.usedNonces.delete(nonce);
      }
    }
  }

  /**
   * 销毁
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.usedNonces.clear();
  }
}

export default ApiSecurity;
```

### 2.2 敏感数据脱敏

**src/security/DataMasking.js**:
```javascript
/**
 * 敏感数据脱敏模块
 */

/**
 * 脱敏规则
 */
const MASKING_RULES = {
  apiKey: (value) => value ? `${value.slice(0, 4)}****${value.slice(-4)}` : '****',
  apiSecret: () => '********',
  password: () => '********',
  email: (value) => {
    if (!value) return '****';
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  },
  phone: (value) => value ? `${value.slice(0, 3)}****${value.slice(-4)}` : '****',
  balance: (value) => typeof value === 'number' ? value.toFixed(2) : value,
  orderId: (value) => value, // 订单ID不脱敏，用于追踪
};

/**
 * 敏感字段列表
 */
const SENSITIVE_FIELDS = [
  'apiKey', 'apiSecret', 'secret', 'password', 'passphrase',
  'token', 'accessToken', 'refreshToken',
  'privateKey', 'mnemonic', 'seed',
];

/**
 * 脱敏对象
 * @param {Object} obj - 原始对象
 * @param {Object} options - 选项
 * @returns {Object} 脱敏后的对象
 */
export function maskSensitiveData(obj, options = {}) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const masked = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    // 检查是否是敏感字段
    const isSensitive = SENSITIVE_FIELDS.some(field =>
      key.toLowerCase().includes(field.toLowerCase())
    );

    if (isSensitive) {
      // 应用脱敏规则
      const rule = MASKING_RULES[key] || MASKING_RULES.apiSecret;
      masked[key] = rule(value);
    } else if (typeof value === 'object' && value !== null) {
      // 递归处理嵌套对象
      masked[key] = maskSensitiveData(value, options);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * 创建安全的日志对象
 * @param {Object} data - 原始数据
 * @returns {Object} 安全的日志数据
 */
export function createSafeLogData(data) {
  return maskSensitiveData(data);
}

export default {
  maskSensitiveData,
  createSafeLogData,
  SENSITIVE_FIELDS,
};
```

### 2.3 修改日志模块使用脱敏

在所有日志记录处添加脱敏：

```javascript
import { createSafeLogData } from '../security/DataMasking.js';

// 修改日志调用
this.log(`订单执行: ${JSON.stringify(createSafeLogData(orderInfo))}`);
```

---

## P0-3: 审计日志系统（1周）

### 目标
- 记录所有关键操作
- 支持追溯查询
- 不可篡改

### 3.1 创建审计日志模块

**src/audit/AuditLogger.js**:
```javascript
/**
 * 审计日志模块
 * 记录所有关键操作，支持追溯和合规审计
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { maskSensitiveData } from '../security/DataMasking.js';

/**
 * 审计事件类型
 */
export const AuditEventType = {
  // 认证相关
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_KEY_LOADED: 'AUTH_KEY_LOADED',
  AUTH_KEY_ROTATED: 'AUTH_KEY_ROTATED',

  // 交易相关
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_FILLED: 'ORDER_FILLED',
  ORDER_FAILED: 'ORDER_FAILED',

  // 风控相关
  RISK_CHECK_PASSED: 'RISK_CHECK_PASSED',
  RISK_CHECK_FAILED: 'RISK_CHECK_FAILED',
  RISK_LIMIT_TRIGGERED: 'RISK_LIMIT_TRIGGERED',
  POSITION_CLOSED: 'POSITION_CLOSED',

  // 系统相关
  SYSTEM_START: 'SYSTEM_START',
  SYSTEM_STOP: 'SYSTEM_STOP',
  CONFIG_CHANGED: 'CONFIG_CHANGED',
  STRATEGY_STARTED: 'STRATEGY_STARTED',
  STRATEGY_STOPPED: 'STRATEGY_STOPPED',

  // 异常相关
  ERROR_OCCURRED: 'ERROR_OCCURRED',
  FAILOVER_TRIGGERED: 'FAILOVER_TRIGGERED',
  RECOVERY_COMPLETED: 'RECOVERY_COMPLETED',
};

/**
 * 审计日志器
 */
export class AuditLogger {
  constructor(config = {}) {
    this.config = {
      logDir: config.logDir || 'logs/audit',
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB
      rotationInterval: config.rotationInterval || 24 * 60 * 60 * 1000, // 1天
      enableIntegrity: config.enableIntegrity !== false,
      ...config,
    };

    this.currentFile = null;
    this.lastHash = null;
    this.eventCounter = 0;

    this._ensureLogDir();
    this._initNewFile();
  }

  /**
   * 记录审计事件
   * @param {string} eventType - 事件类型
   * @param {Object} data - 事件数据
   * @param {Object} context - 上下文信息
   */
  log(eventType, data = {}, context = {}) {
    const event = this._createEvent(eventType, data, context);
    this._writeEvent(event);
    return event.id;
  }

  /**
   * 记录订单事件
   */
  logOrder(action, orderInfo, result = {}) {
    const eventType = {
      create: AuditEventType.ORDER_CREATED,
      cancel: AuditEventType.ORDER_CANCELLED,
      fill: AuditEventType.ORDER_FILLED,
      fail: AuditEventType.ORDER_FAILED,
    }[action] || AuditEventType.ORDER_CREATED;

    return this.log(eventType, {
      order: maskSensitiveData(orderInfo),
      result: maskSensitiveData(result),
    }, {
      symbol: orderInfo.symbol,
      exchangeId: orderInfo.exchangeId,
    });
  }

  /**
   * 记录风控事件
   */
  logRiskEvent(passed, checkResult, orderInfo) {
    const eventType = passed
      ? AuditEventType.RISK_CHECK_PASSED
      : AuditEventType.RISK_CHECK_FAILED;

    return this.log(eventType, {
      checkResult,
      order: maskSensitiveData(orderInfo),
    }, {
      symbol: orderInfo?.symbol,
    });
  }

  /**
   * 记录系统事件
   */
  logSystemEvent(action, details = {}) {
    const eventType = {
      start: AuditEventType.SYSTEM_START,
      stop: AuditEventType.SYSTEM_STOP,
      configChange: AuditEventType.CONFIG_CHANGED,
    }[action] || AuditEventType.SYSTEM_START;

    return this.log(eventType, details);
  }

  /**
   * 创建审计事件
   */
  _createEvent(eventType, data, context) {
    this.eventCounter++;

    const event = {
      id: `${Date.now()}-${this.eventCounter}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      eventType,
      data,
      context: {
        ...context,
        hostname: process.env.HOSTNAME || 'unknown',
        pid: process.pid,
        nodeEnv: process.env.NODE_ENV,
      },
      previousHash: this.lastHash,
    };

    // 计算事件哈希（用于完整性验证）
    if (this.config.enableIntegrity) {
      event.hash = this._calculateHash(event);
      this.lastHash = event.hash;
    }

    return event;
  }

  /**
   * 计算事件哈希
   */
  _calculateHash(event) {
    const content = JSON.stringify({
      id: event.id,
      timestamp: event.timestamp,
      eventType: event.eventType,
      data: event.data,
      previousHash: event.previousHash,
    });

    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 写入事件
   */
  _writeEvent(event) {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.currentFile, line);

    // 检查是否需要轮换
    this._checkRotation();
  }

  /**
   * 验证日志完整性
   * @param {string} logFile - 日志文件路径
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  verifyIntegrity(logFile) {
    const errors = [];
    const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);

    let previousHash = null;

    for (let i = 0; i < lines.length; i++) {
      try {
        const event = JSON.parse(lines[i]);

        // 验证链接
        if (event.previousHash !== previousHash) {
          errors.push(`Line ${i + 1}: Hash chain broken`);
        }

        // 验证自身哈希
        const expectedHash = this._calculateHash({
          ...event,
          hash: undefined,
        });

        if (event.hash !== expectedHash) {
          errors.push(`Line ${i + 1}: Hash mismatch`);
        }

        previousHash = event.hash;
      } catch (e) {
        errors.push(`Line ${i + 1}: Parse error - ${e.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      totalEvents: lines.length,
    };
  }

  /**
   * 查询审计日志
   * @param {Object} query - 查询条件
   * @returns {Array} 匹配的事件
   */
  query(query = {}) {
    const results = [];
    const files = this._getLogFiles();

    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);

          if (this._matchesQuery(event, query)) {
            results.push(event);
          }
        } catch (e) {
          // 跳过损坏的行
        }
      }
    }

    return results;
  }

  /**
   * 检查事件是否匹配查询
   */
  _matchesQuery(event, query) {
    if (query.eventType && event.eventType !== query.eventType) {
      return false;
    }

    if (query.startTime && new Date(event.timestamp) < new Date(query.startTime)) {
      return false;
    }

    if (query.endTime && new Date(event.timestamp) > new Date(query.endTime)) {
      return false;
    }

    if (query.symbol && event.context?.symbol !== query.symbol) {
      return false;
    }

    return true;
  }

  /**
   * 确保日志目录存在
   */
  _ensureLogDir() {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * 初始化新日志文件
   */
  _initNewFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentFile = path.join(this.config.logDir, `audit-${timestamp}.jsonl`);
    this.lastHash = null;
  }

  /**
   * 检查是否需要轮换
   */
  _checkRotation() {
    try {
      const stats = fs.statSync(this.currentFile);
      if (stats.size >= this.config.maxFileSize) {
        this._initNewFile();
      }
    } catch (e) {
      // 文件不存在，重新初始化
      this._initNewFile();
    }
  }

  /**
   * 获取所有日志文件
   */
  _getLogFiles() {
    return fs.readdirSync(this.config.logDir)
      .filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'))
      .map(f => path.join(this.config.logDir, f))
      .sort();
  }
}

// 全局实例
let globalAuditLogger = null;

export function getAuditLogger(config) {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(config);
  }
  return globalAuditLogger;
}

export default AuditLogger;
```

### 3.2 集成审计日志到核心模块

在 `orderExecutor.js` 中添加：

```javascript
import { getAuditLogger, AuditEventType } from '../audit/AuditLogger.js';

// 在构造函数中
this.auditLogger = getAuditLogger();

// 在 executeOrder 方法中
async executeOrder(orderInfo) {
  // 记录订单创建
  this.auditLogger.logOrder('create', orderInfo);

  try {
    const result = await this._executeOrderWithRetry(orderInfo);

    // 记录成功
    this.auditLogger.logOrder('fill', orderInfo, result);

    return result;
  } catch (error) {
    // 记录失败
    this.auditLogger.logOrder('fail', orderInfo, { error: error.message });
    throw error;
  }
}
```

---

## P1-1: 熔断器与健康检查（1周）

### 4.1 熔断器模式

**src/resilience/CircuitBreaker.js**:
```javascript
/**
 * 熔断器模式实现
 */

/**
 * 熔断器状态
 */
export const CircuitState = {
  CLOSED: 'CLOSED',     // 正常运行
  OPEN: 'OPEN',         // 熔断，拒绝请求
  HALF_OPEN: 'HALF_OPEN', // 半开，允许探测
};

/**
 * 熔断器
 */
export class CircuitBreaker {
  constructor(config = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 5,      // 失败阈值
      successThreshold: config.successThreshold || 3,      // 半开状态成功阈值
      timeout: config.timeout || 30000,                    // 熔断超时时间
      monitorInterval: config.monitorInterval || 10000,    // 监控间隔
      ...config,
    };

    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * 执行受保护的操作
   * @param {Function} operation - 要执行的操作
   * @returns {Promise<any>}
   */
  async execute(operation) {
    // 检查熔断器状态
    if (!this.canExecute()) {
      throw new Error(`Circuit breaker is ${this.state}`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * 检查是否可以执行
   */
  canExecute() {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // 检查是否可以转为半开
      if (Date.now() >= this.nextAttemptTime) {
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN 状态允许执行
    return true;
  }

  /**
   * 成功回调
   */
  onSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.reset();
      }
    } else {
      this.failures = 0;
    }
  }

  /**
   * 失败回调
   */
  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.trip();
    } else if (this.failures >= this.config.failureThreshold) {
      this.trip();
    }
  }

  /**
   * 触发熔断
   */
  trip() {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.timeout;
  }

  /**
   * 重置熔断器
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  /**
   * 获取状态
   */
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}

export default CircuitBreaker;
```

### 4.2 健康检查端点

**src/health/HealthCheck.js**:
```javascript
/**
 * 健康检查模块
 */

import express from 'express';

/**
 * 健康检查管理器
 */
export class HealthCheckManager {
  constructor(config = {}) {
    this.config = {
      port: config.port || 8080,
      path: config.path || '/health',
      checks: config.checks || [],
      ...config,
    };

    this.app = express();
    this.checks = new Map();
    this.server = null;

    this._setupRoutes();
  }

  /**
   * 注册健康检查
   * @param {string} name - 检查名称
   * @param {Function} checkFn - 检查函数，返回 { healthy: boolean, details?: any }
   */
  register(name, checkFn) {
    this.checks.set(name, checkFn);
  }

  /**
   * 执行所有检查
   */
  async runChecks() {
    const results = {};
    let allHealthy = true;

    for (const [name, checkFn] of this.checks) {
      try {
        const result = await checkFn();
        results[name] = result;
        if (!result.healthy) {
          allHealthy = false;
        }
      } catch (error) {
        results[name] = {
          healthy: false,
          error: error.message,
        };
        allHealthy = false;
      }
    }

    return {
      healthy: allHealthy,
      timestamp: new Date().toISOString(),
      checks: results,
    };
  }

  /**
   * 设置路由
   */
  _setupRoutes() {
    // 简单存活检查
    this.app.get('/live', (req, res) => {
      res.status(200).json({ status: 'alive' });
    });

    // 就绪检查
    this.app.get('/ready', async (req, res) => {
      const result = await this.runChecks();
      res.status(result.healthy ? 200 : 503).json(result);
    });

    // 完整健康检查
    this.app.get(this.config.path, async (req, res) => {
      const result = await this.runChecks();
      res.status(result.healthy ? 200 : 503).json(result);
    });

    // Prometheus 指标
    this.app.get('/metrics', async (req, res) => {
      // 这里可以集成 prom-client
      res.set('Content-Type', 'text/plain');
      res.send('# Health metrics\n');
    });
  }

  /**
   * 启动服务
   */
  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`Health check server running on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * 停止服务
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }
}

/**
 * 创建默认健康检查
 */
export function createDefaultChecks(engine) {
  return {
    // 内存检查
    memory: async () => {
      const used = process.memoryUsage();
      const heapUsedMB = used.heapUsed / 1024 / 1024;
      return {
        healthy: heapUsedMB < 512,
        details: {
          heapUsedMB: heapUsedMB.toFixed(2),
          heapTotalMB: (used.heapTotal / 1024 / 1024).toFixed(2),
        },
      };
    },

    // 交易所连接检查
    exchange: async () => {
      try {
        const exchange = engine.exchanges.get(engine.config.exchange.default);
        if (!exchange) {
          return { healthy: false, error: 'Exchange not initialized' };
        }
        await exchange.fetchTicker('BTC/USDT');
        return { healthy: true };
      } catch (error) {
        return { healthy: false, error: error.message };
      }
    },

    // 数据库检查
    database: async () => {
      // 根据实际数据库实现
      return { healthy: true };
    },

    // 风控状态检查
    riskManager: async () => {
      const state = engine.riskManager?.getState();
      return {
        healthy: state && !state.emergencyStop,
        details: state,
      };
    },
  };
}

export default HealthCheckManager;
```

---

## P1-2: 运行时类型验证（3天）

不使用 TypeScript，改用运行时验证 + JSDoc 增强。

### 5.1 安装验证库

```bash
pnpm add zod
```

### 5.2 创建验证模式

**src/validation/schemas.js**:
```javascript
/**
 * Zod 验证模式定义
 */

import { z } from 'zod';

/**
 * 订单信息模式
 */
export const OrderInfoSchema = z.object({
  exchangeId: z.string().min(1, 'exchangeId is required'),
  symbol: z.string().regex(/^[A-Z]+\/[A-Z]+$/, 'Invalid symbol format'),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['market', 'limit', 'stop', 'stop_limit']).default('limit'),
  amount: z.number().positive('Amount must be positive'),
  price: z.number().positive('Price must be positive').optional(),
  stopPrice: z.number().positive().optional(),
  clientOrderId: z.string().optional(),
});

/**
 * 风控配置模式
 */
export const RiskConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxPositionRatio: z.number().min(0).max(1).default(0.3),
  maxRiskPerTrade: z.number().min(0).max(1).default(0.02),
  maxDailyLoss: z.number().positive().default(1000),
  maxDrawdown: z.number().min(0).max(1).default(0.2),
  maxPositions: z.number().int().positive().default(5),
  maxLeverage: z.number().positive().default(3),
});

/**
 * 策略配置模式
 */
export const StrategyConfigSchema = z.object({
  name: z.string().min(1),
  symbols: z.array(z.string()).min(1),
  timeframe: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d']).default('1h'),
  capitalRatio: z.number().min(0).max(1).default(0.1),
  stopLoss: z.number().min(0).max(1).optional(),
  takeProfit: z.number().min(0).max(1).optional(),
});

/**
 * 交易所配置模式
 */
export const ExchangeConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  secret: z.string().min(1, 'Secret is required'),
  passphrase: z.string().optional(),
  sandbox: z.boolean().default(false),
  timeout: z.number().positive().default(30000),
});

/**
 * 验证并返回类型安全的数据
 * @template T
 * @param {z.ZodSchema<T>} schema - Zod 模式
 * @param {unknown} data - 待验证数据
 * @returns {T}
 */
export function validate(schema, data) {
  return schema.parse(data);
}

/**
 * 安全验证，返回结果对象
 * @template T
 * @param {z.ZodSchema<T>} schema - Zod 模式
 * @param {unknown} data - 待验证数据
 * @returns {{ success: boolean, data?: T, error?: z.ZodError }}
 */
export function safeValidate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export default {
  OrderInfoSchema,
  RiskConfigSchema,
  StrategyConfigSchema,
  ExchangeConfigSchema,
  validate,
  safeValidate,
};
```

### 5.3 在核心模块中使用验证

```javascript
import { OrderInfoSchema, validate, safeValidate } from '../validation/schemas.js';

async executeOrder(orderInfo) {
  // 验证输入
  const validation = safeValidate(OrderInfoSchema, orderInfo);
  if (!validation.success) {
    throw new Error(`Invalid order: ${validation.error.message}`);
  }

  const validatedOrder = validation.data;
  // 继续处理...
}
```

### 5.4 增强 JSDoc 类型注释

**jsconfig.json**:
```json
{
  "compilerOptions": {
    "checkJs": true,
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

---

## 时间线总结

```
Week 1-2: P0-1 测试框架 + 核心测试
Week 3:   P0-2 API安全增强
Week 4:   P0-3 审计日志系统
Week 5:   P1-1 熔断器 + 健康检查
Week 6:   P1-2 运行时验证 + 集成测试
Week 7:   性能优化 + 压力测试
Week 8:   文档完善 + 最终验收
```

---

## 验收标准

完成后应达到：

- [ ] 测试覆盖率 ≥ 60%
- [ ] 所有 P0 问题已修复
- [ ] 健康检查端点可用
- [ ] 审计日志完整记录所有交易
- [ ] 通过 24 小时压力测试
- [ ] 安全审计无高危漏洞

---

## 附录：快速开始命令

```bash
# 1. 安装新依赖
pnpm add -D vitest @vitest/coverage-v8 msw
pnpm add zod

# 2. 运行测试
pnpm test

# 3. 查看覆盖率
pnpm test:coverage

# 4. 启动健康检查
node -e "import('./src/health/HealthCheck.js').then(m => new m.HealthCheckManager().start())"

# 5. 验证审计日志
node -e "import('./src/audit/AuditLogger.js').then(m => console.log(m.getAuditLogger().verifyIntegrity('logs/audit/audit-xxx.jsonl')))"
```
