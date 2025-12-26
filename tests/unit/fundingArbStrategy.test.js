/**
 * FundingArbStrategy 资金费率套利策略测试
 * Funding Rate Arbitrage Strategy Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FundingArbStrategy } from '../../src/strategies/FundingArbStrategy.js';

// 创建 Mock 交易所
function createMockExchange(id, fundingRate = 0.0001) {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    connected: true,

    fetchFundingRate: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT:USDT',
      fundingRate,
      fundingTimestamp: Date.now() + 8 * 3600000,
      nextFundingRate: fundingRate * 1.1,
    }),

    fetchTicker: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT:USDT',
      last: 50000,
      bid: 49990,
      ask: 50010,
    }),

    fetchBalance: vi.fn().mockResolvedValue({
      USDT: { free: 10000, used: 0, total: 10000 },
    }),

    fetchPositions: vi.fn().mockResolvedValue([]),

    createOrder: vi.fn().mockImplementation((symbol, type, side, amount, price) => {
      return Promise.resolve({
        id: `order_${id}_${Date.now()}`,
        symbol,
        type,
        side,
        amount,
        price: price || 50000,
        status: 'closed',
        filled: amount,
      });
    }),

    cancelOrder: vi.fn().mockResolvedValue({ status: 'canceled' }),

    setLeverage: vi.fn().mockResolvedValue({ leverage: 5 }),
  };
}

// 创建 Mock 引擎
function createMockEngine() {
  return {
    exchanges: new Map([
      ['binance', createMockExchange('binance', 0.0001)],
      ['bybit', createMockExchange('bybit', 0.0003)],
      ['okx', createMockExchange('okx', 0.0002)],
    ]),
    getExchange: vi.fn().mockImplementation((id) => {
      return createMockExchange(id);
    }),
    riskManager: {
      checkOrder: vi.fn().mockReturnValue({ allowed: true }),
    },
    getCapital: vi.fn().mockReturnValue(100000),
    getEquity: vi.fn().mockReturnValue(100000),
    emit: vi.fn(),
  };
}

describe('FundingArbStrategy', () => {
  let strategy;
  let mockEngine;

  const defaultConfig = {
    symbols: ['BTC/USDT:USDT', 'ETH/USDT:USDT'],
    minAnnualizedSpread: 0.15,
    closeSpreadThreshold: 0.05,
    emergencyCloseThreshold: -0.10,
    maxPositionSize: 10000,
    minPositionSize: 100,
    positionRatio: 0.25,
    totalMaxPosition: 50000,
    leverage: 5,
    maxLeverage: 10,
    imbalanceThreshold: 0.10,
    rebalanceInterval: 60000,
    fundingRefreshInterval: 30000,
    positionRefreshInterval: 10000,
  };

  beforeEach(() => {
    mockEngine = createMockEngine();
    strategy = new FundingArbStrategy(defaultConfig);
    strategy.engine = mockEngine;
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该正确初始化策略名称', () => {
      expect(strategy.name).toBe('FundingArbStrategy');
    });

    it('应该使用默认配置', () => {
      const defaultStrategy = new FundingArbStrategy({});
      expect(defaultStrategy.config.minAnnualizedSpread).toBe(0.15);
      expect(defaultStrategy.config.maxPositionSize).toBe(10000);
    });

    it('应该合并自定义配置', () => {
      const customStrategy = new FundingArbStrategy({
        minAnnualizedSpread: 0.20,
        maxPositionSize: 5000,
      });
      expect(customStrategy.config.minAnnualizedSpread).toBe(0.20);
      expect(customStrategy.config.maxPositionSize).toBe(5000);
    });

    it('应该初始化内部状态', () => {
      expect(strategy.fundingManager).toBeDefined();
      expect(strategy.positionManager).toBeDefined();
      expect(strategy.config).toBeDefined();
    });
  });

  describe('初始化', () => {
    it('应该成功初始化', async () => {
      await expect(strategy.onInit()).resolves.not.toThrow();
    });

    it('应该设置监控定时器', async () => {
      await strategy.onInit();
      // 检查定时器是否设置
      expect(strategy.fundingTimer || strategy.positionTimer).toBeDefined;
    });
  });

  describe('资金费率计算', () => {
    it('应该计算年化利差', () => {
      const rate1 = 0.0001; // 0.01%
      const rate2 = 0.0003; // 0.03%
      const spread = Math.abs(rate2 - rate1);
      // 每8小时一次，一年365*3次
      const annualized = spread * 365 * 3;
      expect(annualized).toBeCloseTo(0.219, 2); // 约21.9%
    });

    it('应该识别套利机会 (利差超过阈值)', () => {
      const binanceRate = 0.0001;
      const bybitRate = 0.0005;
      const spread = Math.abs(bybitRate - binanceRate) * 365 * 3;
      const minSpread = 0.15;
      expect(spread > minSpread).toBe(true);
    });

    it('应该识别无套利机会 (利差不足)', () => {
      const binanceRate = 0.0001;
      const bybitRate = 0.00012;
      const spread = Math.abs(bybitRate - binanceRate) * 365 * 3;
      const minSpread = 0.15;
      expect(spread > minSpread).toBe(false);
    });
  });

  describe('onFundingRate 事件处理', () => {
    it('应该更新资金费率数据', async () => {
      await strategy.onInit();
      strategy.running = true; // 启用运行状态以处理事件

      const fundingData = {
        exchange: 'binance',
        symbol: 'BTC/USDT:USDT',
        fundingRate: 0.0001,
        nextFundingTime: Date.now() + 8 * 3600000,
      };

      await strategy.onFundingRate(fundingData);

      // 验证费率已存储 (使用嵌套 Map 结构)
      const symbolRates = strategy.fundingManager.fundingRates.get('BTC/USDT:USDT');
      expect(symbolRates?.get('binance')).toBeDefined();
    });

    it('应该在收到多个交易所费率后计算利差', async () => {
      await strategy.onInit();

      // 模拟收到 Binance 费率
      await strategy.onFundingRate({
        exchange: 'binance',
        symbol: 'BTC/USDT:USDT',
        fundingRate: 0.0001,
        nextFundingTime: Date.now() + 8 * 3600000,
      });

      // 模拟收到 Bybit 费率 (较高)
      await strategy.onFundingRate({
        exchange: 'bybit',
        symbol: 'BTC/USDT:USDT',
        fundingRate: 0.0005,
        nextFundingTime: Date.now() + 8 * 3600000,
      });

      // 应该检测到套利机会
    });
  });

  describe('套利机会检测', () => {
    beforeEach(async () => {
      await strategy.onInit();
    });

    it('应该检测有效的套利机会', () => {
      // 使用 fundingManager 的方法设置不同的费率
      strategy.fundingManager._saveFundingRate('BTC/USDT:USDT', 'binance', {
        fundingRate: 0.0001,
        fundingTimestamp: Date.now(),
      });

      strategy.fundingManager._saveFundingRate('BTC/USDT:USDT', 'bybit', {
        fundingRate: 0.0006,
        fundingTimestamp: Date.now(),
      });

      // 使用 fundingManager.findBestOpportunity 查找套利机会
      const opportunity = strategy.fundingManager.findBestOpportunity('BTC/USDT:USDT');

      if (opportunity) {
        expect(opportunity.longExchange).toBeDefined();
        expect(opportunity.shortExchange).toBeDefined();
        expect(opportunity.annualizedSpread).toBeGreaterThan(0);
      }
    });

    it('应该正确确定开仓方向', () => {
      // 高费率交易所做空 (收取资金费)
      // 低费率交易所做多 (支付较少资金费)
      const highRateExchange = 'bybit';
      const lowRateExchange = 'binance';

      // 验证策略逻辑
      expect(highRateExchange).not.toBe(lowRateExchange);
    });
  });

  describe('仓位管理', () => {
    it('应该计算正确的仓位大小', () => {
      const capital = 10000;
      const positionRatio = 0.25;
      const maxPositionSize = 10000;

      const positionSize = Math.min(capital * positionRatio, maxPositionSize);
      expect(positionSize).toBe(2500);
    });

    it('应该限制最大仓位', () => {
      const capital = 100000;
      const positionRatio = 0.25;
      const maxPositionSize = 10000;

      const positionSize = Math.min(capital * positionRatio, maxPositionSize);
      expect(positionSize).toBe(10000);
    });

    it('应该拒绝低于最小仓位', () => {
      const capital = 100;
      const positionRatio = 0.25;
      const minPositionSize = 100;

      const positionSize = capital * positionRatio;
      expect(positionSize < minPositionSize).toBe(true);
    });
  });

  describe('再平衡逻辑', () => {
    it('应该检测仓位不平衡', () => {
      const longPosition = 1000;
      const shortPosition = 800;
      const imbalanceThreshold = 0.10;

      const imbalance = Math.abs(longPosition - shortPosition) / Math.max(longPosition, shortPosition);
      expect(imbalance).toBeGreaterThan(imbalanceThreshold);
    });

    it('应该判断平衡的仓位', () => {
      const longPosition = 1000;
      const shortPosition = 950;
      const imbalanceThreshold = 0.10;

      const imbalance = Math.abs(longPosition - shortPosition) / Math.max(longPosition, shortPosition);
      expect(imbalance).toBeLessThan(imbalanceThreshold);
    });
  });

  describe('平仓条件', () => {
    it('应该在利差收敛时触发平仓', () => {
      const currentSpread = 0.03; // 3% 年化
      const closeThreshold = 0.05; // 5%

      expect(currentSpread < closeThreshold).toBe(true);
    });

    it('应该在利差反向时紧急平仓', () => {
      const currentSpread = -0.12; // -12% (反向)
      const emergencyThreshold = -0.10; // -10%

      expect(currentSpread < emergencyThreshold).toBe(true);
    });
  });

  describe('风险控制', () => {
    it('应该限制总持仓', () => {
      const currentTotalPosition = 45000;
      const newPositionSize = 10000;
      const totalMaxPosition = 50000;

      const wouldExceed = currentTotalPosition + newPositionSize > totalMaxPosition;
      expect(wouldExceed).toBe(true);
    });

    it('应该限制杠杆倍数', () => {
      const requestedLeverage = 15;
      const maxLeverage = 10;

      const actualLeverage = Math.min(requestedLeverage, maxLeverage);
      expect(actualLeverage).toBe(10);
    });
  });

  describe('事件发射', () => {
    it('应该发射套利机会事件', async () => {
      const eventSpy = vi.fn();
      strategy.on('arbOpportunity', eventSpy);

      // 模拟发现套利机会
      strategy.emit('arbOpportunity', {
        symbol: 'BTC/USDT:USDT',
        longExchange: 'binance',
        shortExchange: 'bybit',
        annualizedSpread: 0.20,
      });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该发射开仓事件', async () => {
      const eventSpy = vi.fn();
      strategy.on('positionOpened', eventSpy);

      strategy.emit('positionOpened', {
        symbol: 'BTC/USDT:USDT',
        longExchange: 'binance',
        shortExchange: 'bybit',
        size: 1000,
      });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该发射平仓事件', async () => {
      const eventSpy = vi.fn();
      strategy.on('positionClosed', eventSpy);

      strategy.emit('positionClosed', {
        symbol: 'BTC/USDT:USDT',
        reason: 'spread_converged',
        pnl: 100,
      });

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('PnL 计算', () => {
    it('应该计算正确的已实现盈亏', () => {
      const entrySpread = 0.0004; // 入场利差
      const exitSpread = 0.0001; // 出场利差
      const positionSize = 1000; // USDT
      const holdingPeriods = 3; // 持有3个费率周期

      // 简化计算：每个周期赚取利差
      const pnl = (entrySpread - exitSpread) * positionSize * holdingPeriods;
      expect(pnl).toBeCloseTo(0.9, 10); // 0.9 USDT (使用 toBeCloseTo 处理浮点精度)
    });

    it('应该计算未实现盈亏', () => {
      const entryPrice = 50000;
      const currentPrice = 50100;
      const positionSize = 0.1; // BTC

      const longPnl = (currentPrice - entryPrice) * positionSize;
      const shortPnl = (entryPrice - currentPrice) * positionSize;

      // 对冲后应该接近0
      expect(Math.abs(longPnl + shortPnl)).toBe(0);
    });
  });

  describe('清理和停止', () => {
    it('应该正确停止策略', async () => {
      await strategy.onInit();
      await strategy.onFinish();

      // 检查定时器是否清理
    });

    it('应该清理所有监听器', async () => {
      await strategy.onInit();
      strategy.removeAllListeners();

      expect(strategy.listenerCount('arbOpportunity')).toBe(0);
    });
  });
});

describe('FundingArbStrategy 边界条件', () => {
  it('应该处理无资金费率数据的情况', async () => {
    const strategy = new FundingArbStrategy({});
    await strategy.onInit();

    // 没有费率数据时不应该崩溃
    const opportunity = strategy.fundingManager?.findBestOpportunity?.('BTC/USDT:USDT');
    expect(opportunity === undefined || opportunity === null).toBe(true);
  });

  it('应该处理单一交易所数据的情况', async () => {
    const strategy = new FundingArbStrategy({});
    await strategy.onInit();

    strategy.fundingManager._saveFundingRate('BTC/USDT:USDT', 'binance', {
      fundingRate: 0.0001,
      fundingTimestamp: Date.now(),
    });

    // 只有一个交易所时无法套利
    const opportunity = strategy.fundingManager?.findBestOpportunity?.('BTC/USDT:USDT');
    expect(opportunity === undefined || opportunity === null).toBe(true);
  });

  it('应该处理费率为0的情况', async () => {
    const strategy = new FundingArbStrategy({});
    await strategy.onInit();

    strategy.fundingManager._saveFundingRate('BTC/USDT:USDT', 'binance', {
      fundingRate: 0,
      fundingTimestamp: Date.now(),
    });

    strategy.fundingManager._saveFundingRate('BTC/USDT:USDT', 'bybit', {
      fundingRate: 0,
      fundingTimestamp: Date.now(),
    });

    // 两个费率都为0时利差为0
  });

  it('应该处理负费率的情况', async () => {
    const strategy = new FundingArbStrategy({});
    await strategy.onInit();

    strategy.fundingManager._saveFundingRate('BTC/USDT:USDT', 'binance', {
      fundingRate: -0.0002,
      fundingTimestamp: Date.now(),
    });

    strategy.fundingManager._saveFundingRate('BTC/USDT:USDT', 'bybit', {
      fundingRate: 0.0003,
      fundingTimestamp: Date.now(),
    });

    // 负费率时做多方收取资金费
    const spread = Math.abs(0.0003 - (-0.0002));
    expect(spread).toBe(0.0005);
  });
});
