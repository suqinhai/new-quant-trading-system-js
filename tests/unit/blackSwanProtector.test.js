/**
 * 黑天鹅保护器测试
 * Black Swan Protector Tests
 * @module tests/unit/blackSwanProtector.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BlackSwanProtector,
  CIRCUIT_BREAKER_LEVEL,
  BLACK_SWAN_TYPE,
  DEFAULT_CONFIG,
} from '../../src/risk/BlackSwanProtector.js';

// ============================================
// Mock Executor
// ============================================

function createMockExecutor() {
  return {
    emergencyCloseAll: vi.fn().mockResolvedValue(true),
    reduceAllPositions: vi.fn().mockResolvedValue(true),
  };
}

// ============================================
// Mock Portfolio Risk Manager
// ============================================

function createMockPortfolioRiskManager() {
  return {
    pauseTrading: vi.fn(),
    resumeTrading: vi.fn(),
    emit: vi.fn(),
  };
}

// ============================================
// BlackSwanProtector 测试
// ============================================

describe('BlackSwanProtector', () => {
  let protector;
  let mockExecutor;
  let mockPortfolioRiskManager;

  beforeEach(() => {
    protector = new BlackSwanProtector({
      priceChange1mWarning: 0.03,
      priceChange1mCircuitBreaker: 0.05,
      priceChange5mWarning: 0.05,
      priceChange5mCircuitBreaker: 0.08,
      priceChange15mEmergency: 0.15,
      volatilitySpikeMultiplier: 3.0,
      checkInterval: 10000,
      recoveryCheckInterval: 10000,
      verbose: false,
    });
    mockExecutor = createMockExecutor();
    mockPortfolioRiskManager = createMockPortfolioRiskManager();
  });

  afterEach(() => {
    if (protector) {
      protector.stop();
      protector.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const p = new BlackSwanProtector();

      expect(p.config.priceChange1mWarning).toBe(0.03);
      expect(p.config.priceChange5mCircuitBreaker).toBe(0.08);
      expect(p.config.volatilitySpikeMultiplier).toBe(3.0);
      expect(p.config.enableAutoRecovery).toBe(true);
      expect(p.config.enableAutoEmergencyClose).toBe(true);
    });

    it('应该使用自定义配置', () => {
      expect(protector.config.priceChange1mWarning).toBe(0.03);
      expect(protector.config.priceChange5mCircuitBreaker).toBe(0.08);
    });

    it('应该初始化正常熔断状态', () => {
      expect(protector.circuitBreakerState.level).toBe(CIRCUIT_BREAKER_LEVEL.NORMAL);
      expect(protector.circuitBreakerState.triggeredAt).toBeNull();
      expect(protector.circuitBreakerState.reason).toBeNull();
    });

    it('应该初始化空数据结构', () => {
      expect(protector.priceHistory.size).toBe(0);
      expect(protector.baselinePrices.size).toBe(0);
      expect(protector.historicalVolatility.size).toBe(0);
      expect(protector.eventHistory).toEqual([]);
    });

    it('应该设置运行状态为 false', () => {
      expect(protector.running).toBe(false);
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('init', () => {
    it('应该初始化成功', async () => {
      await protector.init({
        executor: mockExecutor,
        portfolioRiskManager: mockPortfolioRiskManager,
      });

      expect(protector.executor).toBe(mockExecutor);
      expect(protector.portfolioRiskManager).toBe(mockPortfolioRiskManager);
    });

    it('没有参数时应该正常初始化', async () => {
      await protector.init();

      expect(protector.executor).toBeUndefined();
      expect(protector.portfolioRiskManager).toBeUndefined();
    });
  });

  describe('start/stop', () => {
    it('应该启动保护器', () => {
      const listener = vi.fn();
      protector.on('started', listener);

      protector.start();

      expect(protector.running).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('应该设置定时器', () => {
      protector.start();

      expect(protector.checkTimer).not.toBeNull();
      expect(protector.recoveryTimer).not.toBeNull();
    });

    it('禁用自动恢复时不应设置恢复定时器', () => {
      protector.config.enableAutoRecovery = false;
      protector.start();

      expect(protector.recoveryTimer).toBeNull();
    });

    it('应该停止保护器', () => {
      const listener = vi.fn();
      protector.on('stopped', listener);

      protector.start();
      protector.stop();

      expect(protector.running).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('停止后应该清除定时器', () => {
      protector.start();
      protector.stop();

      expect(protector.checkTimer).toBeNull();
      expect(protector.recoveryTimer).toBeNull();
    });

    it('重复启动应该无操作', () => {
      protector.start();
      const timer1 = protector.checkTimer;
      protector.start();

      expect(protector.checkTimer).toBe(timer1);
    });

    it('未启动时停止应该无操作', () => {
      protector.stop();
      expect(protector.running).toBe(false);
    });
  });

  // ============================================
  // 数据更新测试
  // ============================================

  describe('updatePrice', () => {
    it('应该记录价格历史', () => {
      protector.updatePrice('BTC/USDT', 50000, 100);

      const history = protector.priceHistory.get('BTC/USDT');
      expect(history.length).toBe(1);
      expect(history[0].price).toBe(50000);
      expect(history[0].volume).toBe(100);
    });

    it('应该更新最后价格时间', () => {
      const before = Date.now();
      protector.updatePrice('BTC/USDT', 50000);

      const lastUpdate = protector.lastPriceUpdate.get('BTC/USDT');
      expect(lastUpdate).toBeGreaterThanOrEqual(before);
    });

    it('应该初始化基准价格', () => {
      protector.updatePrice('BTC/USDT', 50000);

      const baseline = protector.baselinePrices.get('BTC/USDT');
      expect(baseline.price1m).toBe(50000);
      expect(baseline.price5m).toBe(50000);
      expect(baseline.price15m).toBe(50000);
    });

    it('应该限制历史长度', () => {
      for (let i = 0; i < 1100; i++) {
        protector.updatePrice('BTC/USDT', 50000 + i);
      }

      const history = protector.priceHistory.get('BTC/USDT');
      expect(history.length).toBeLessThanOrEqual(protector.config.priceHistoryLength);
    });

    it('应该更新点差和深度', () => {
      const orderBook = {
        bids: [[49900, 10], [49800, 20]],
        asks: [[50100, 10], [50200, 20]],
      };

      protector.updatePrice('BTC/USDT', 50000, 100, orderBook);

      expect(protector.baselineSpreads.has('BTC/USDT')).toBe(true);
      expect(protector.baselineDepths.has('BTC/USDT')).toBe(true);
    });
  });

  describe('_updateBaselinePrices', () => {
    it('应该初始化新交易对的基准价格', () => {
      const now = Date.now();
      protector._updateBaselinePrices('BTC/USDT', 50000, now);

      const baseline = protector.baselinePrices.get('BTC/USDT');
      expect(baseline.price1m).toBe(50000);
      expect(baseline.timestamp1m).toBe(now);
    });

    it('应该更新1分钟基准', () => {
      const now = Date.now();
      protector._updateBaselinePrices('BTC/USDT', 50000, now);

      // 模拟1分钟后
      protector._updateBaselinePrices('BTC/USDT', 51000, now + 61000);

      const baseline = protector.baselinePrices.get('BTC/USDT');
      expect(baseline.price1m).toBe(51000);
    });
  });

  describe('_updateSpreadAndDepth', () => {
    it('应该计算并存储点差', () => {
      const orderBook = {
        bids: [[49900, 10]],
        asks: [[50100, 10]],
      };

      protector._updateSpreadAndDepth('BTC/USDT', orderBook);

      const spread = protector.baselineSpreads.get('BTC/USDT');
      expect(spread.spread).toBeCloseTo(0.004, 4); // (50100-49900)/49900
    });

    it('应该计算并存储深度', () => {
      const orderBook = {
        bids: [[49900, 10], [49800, 20]],
        asks: [[50100, 15], [50200, 25]],
      };

      protector._updateSpreadAndDepth('BTC/USDT', orderBook);

      const depth = protector.baselineDepths.get('BTC/USDT');
      expect(depth.bidDepth).toBe(30);
      expect(depth.askDepth).toBe(40);
    });

    it('空订单簿应该跳过', () => {
      protector._updateSpreadAndDepth('BTC/USDT', { bids: [], asks: [] });

      expect(protector.baselineSpreads.has('BTC/USDT')).toBe(false);
    });

    it('应该使用EMA更新基准', () => {
      const orderBook1 = {
        bids: [[49900, 10]],
        asks: [[50100, 10]],
      };
      const orderBook2 = {
        bids: [[49800, 10]],
        asks: [[50200, 10]],
      };

      protector._updateSpreadAndDepth('BTC/USDT', orderBook1);
      const initialSpread = protector.baselineSpreads.get('BTC/USDT').spread;

      protector._updateSpreadAndDepth('BTC/USDT', orderBook2);
      const updatedSpread = protector.baselineSpreads.get('BTC/USDT').spread;

      // EMA 应该使新值介于初始值和新观测值之间
      expect(updatedSpread).not.toBe(initialSpread);
    });
  });

  // ============================================
  // 异常检测测试
  // ============================================

  describe('_detectPriceAnomaly', () => {
    beforeEach(() => {
      protector.baselinePrices.set('BTC/USDT', {
        price1m: 50000,
        price5m: 50000,
        price15m: 50000,
        timestamp1m: Date.now() - 30000,
        timestamp5m: Date.now() - 180000,
        timestamp15m: Date.now() - 600000,
      });
    });

    it('正常价格应该返回null', () => {
      const result = protector._detectPriceAnomaly('BTC/USDT', 50500);

      expect(result).toBeNull();
    });

    it('1分钟3%变动应该触发一级警告', () => {
      const result = protector._detectPriceAnomaly('BTC/USDT', 51600); // 3.2%

      expect(result).not.toBeNull();
      expect(result.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_1);
      expect(result.type).toBe(BLACK_SWAN_TYPE.FLASH_RALLY);
    });

    it('1分钟5%变动应该触发二级警告', () => {
      const result = protector._detectPriceAnomaly('BTC/USDT', 52600); // 5.2%

      expect(result).not.toBeNull();
      expect(result.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_2);
    });

    it('5分钟8%变动应该触发三级熔断', () => {
      const result = protector._detectPriceAnomaly('BTC/USDT', 54200); // 8.4%

      expect(result).not.toBeNull();
      expect(result.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_3);
    });

    it('15分钟15%变动应该触发紧急状态', () => {
      const result = protector._detectPriceAnomaly('BTC/USDT', 57600); // 15.2%

      expect(result).not.toBeNull();
      expect(result.level).toBe(CIRCUIT_BREAKER_LEVEL.EMERGENCY);
    });

    it('下跌应该检测为闪崩', () => {
      const result = protector._detectPriceAnomaly('BTC/USDT', 48400); // -3.2%

      expect(result).not.toBeNull();
      expect(result.type).toBe(BLACK_SWAN_TYPE.FLASH_CRASH);
    });

    it('没有基准价格应该返回null', () => {
      const result = protector._detectPriceAnomaly('ETH/USDT', 3000);

      expect(result).toBeNull();
    });
  });

  describe('_detectVolatilitySpike', () => {
    beforeEach(() => {
      // 添加足够的价格历史
      const history = [];
      const baseTime = Date.now() - 100000;

      for (let i = 0; i < 100; i++) {
        history.push({
          price: 50000 + Math.sin(i * 0.1) * 100, // 低波动
          timestamp: baseTime + i * 1000,
        });
      }

      protector.priceHistory.set('BTC/USDT', history);
    });

    it('数据不足应该返回null', () => {
      protector.priceHistory.set('ETH/USDT', [{ price: 3000 }]);

      const result = protector._detectVolatilitySpike('ETH/USDT');

      expect(result).toBeNull();
    });

    it('初始化时应该返回null并设置历史波动率', () => {
      const result = protector._detectVolatilitySpike('BTC/USDT');

      expect(result).toBeNull();
      expect(protector.historicalVolatility.has('BTC/USDT')).toBe(true);
    });

    it('波动率突变应该返回异常', () => {
      // 先初始化历史波动率
      protector._detectVolatilitySpike('BTC/USDT');

      // 设置很低的历史波动率
      protector.historicalVolatility.set('BTC/USDT', {
        volatility: 0.001,
        updatedAt: Date.now(),
      });

      // 添加高波动的价格数据
      const history = protector.priceHistory.get('BTC/USDT');
      for (let i = 0; i < 60; i++) {
        history.push({
          price: 50000 + Math.sin(i) * 2000, // 高波动
          timestamp: Date.now() - (60 - i) * 1000,
        });
      }

      const result = protector._detectVolatilitySpike('BTC/USDT');

      expect(result).not.toBeNull();
      expect(result.type).toBe(BLACK_SWAN_TYPE.VOLATILITY_SPIKE);
    });
  });

  describe('_calculateVolatility', () => {
    it('应该计算价格波动率', () => {
      const prices = [100, 101, 102, 101, 100, 99, 100, 101];

      const volatility = protector._calculateVolatility(prices);

      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(0.05);
    });

    it('单个价格应该返回0', () => {
      const volatility = protector._calculateVolatility([100]);

      expect(volatility).toBe(0);
    });

    it('常量价格应该返回0', () => {
      const volatility = protector._calculateVolatility([100, 100, 100, 100]);

      expect(volatility).toBe(0);
    });
  });

  describe('_detectSpreadAnomaly', () => {
    beforeEach(() => {
      protector.baselineSpreads.set('BTC/USDT', {
        spread: 0.001,
        updatedAt: Date.now(),
      });
    });

    it('正常点差应该返回null', () => {
      const orderBook = {
        bids: [[49950, 10]],
        asks: [[50050, 10]],
      };

      const result = protector._detectSpreadAnomaly('BTC/USDT', orderBook);

      expect(result).toBeNull();
    });

    it('点差扩大3倍应该触发一级警告', () => {
      // baseline spread is 0.001 (0.1%)
      // 3.5x baseline = 0.0035 (0.35%)
      // With bid=49900, ask=50075: spread = 175/49900 ≈ 0.0035 (3.5x)
      const orderBook = {
        bids: [[49900, 10]],
        asks: [[50075, 10]],
      };

      const result = protector._detectSpreadAnomaly('BTC/USDT', orderBook);

      expect(result).not.toBeNull();
      expect(result.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_1);
      expect(result.type).toBe(BLACK_SWAN_TYPE.SPREAD_BLOWOUT);
    });

    it('点差扩大5倍应该触发三级熔断', () => {
      const orderBook = {
        bids: [[49750, 10]],
        asks: [[50250, 10]],
      };

      const result = protector._detectSpreadAnomaly('BTC/USDT', orderBook);

      expect(result).not.toBeNull();
      expect(result.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_3);
    });

    it('绝对点差过大应该触发二级警告', () => {
      protector.config.maxSpreadPercent = 0.01;
      protector.baselineSpreads.delete('BTC/USDT');

      const orderBook = {
        bids: [[49400, 10]],
        asks: [[50600, 10]],
      };

      const result = protector._detectSpreadAnomaly('BTC/USDT', orderBook);

      expect(result).not.toBeNull();
      expect(result.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_2);
    });

    it('空订单簿应该返回null', () => {
      const result = protector._detectSpreadAnomaly('BTC/USDT', { bids: [], asks: [] });

      expect(result).toBeNull();
    });
  });

  describe('_detectDepthAnomaly', () => {
    beforeEach(() => {
      protector.baselineDepths.set('BTC/USDT', {
        bidDepth: 100,
        askDepth: 100,
        updatedAt: Date.now(),
      });
    });

    it('正常深度应该返回null', () => {
      const orderBook = {
        bids: [[49900, 80]],
        asks: [[50100, 80]],
      };

      const result = protector._detectDepthAnomaly('BTC/USDT', orderBook);

      expect(result).toBeNull();
    });

    it('深度减少50%应该触发一级警告', () => {
      const orderBook = {
        bids: [[49900, 45]],
        asks: [[50100, 80]],
      };

      const result = protector._detectDepthAnomaly('BTC/USDT', orderBook);

      expect(result).not.toBeNull();
      expect(result.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_1);
      expect(result.type).toBe(BLACK_SWAN_TYPE.LIQUIDITY_CRISIS);
    });

    it('深度减少80%应该触发三级熔断', () => {
      const orderBook = {
        bids: [[49900, 15]],
        asks: [[50100, 80]],
      };

      const result = protector._detectDepthAnomaly('BTC/USDT', orderBook);

      expect(result).not.toBeNull();
      expect(result.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_3);
    });

    it('没有基准深度应该返回null', () => {
      const orderBook = {
        bids: [[49900, 10]],
        asks: [[50100, 10]],
      };

      const result = protector._detectDepthAnomaly('ETH/USDT', orderBook);

      expect(result).toBeNull();
    });
  });

  // ============================================
  // 异常处理测试
  // ============================================

  describe('_processAnomalies', () => {
    it('应该找出最严重的异常', () => {
      const listener = vi.fn();
      protector.on('circuitBreakerTriggered', listener);

      const anomalies = [
        { level: CIRCUIT_BREAKER_LEVEL.LEVEL_1, type: BLACK_SWAN_TYPE.FLASH_CRASH, message: 'test1' },
        { level: CIRCUIT_BREAKER_LEVEL.LEVEL_3, type: BLACK_SWAN_TYPE.SPREAD_BLOWOUT, message: 'test2' },
        { level: CIRCUIT_BREAKER_LEVEL.LEVEL_2, type: BLACK_SWAN_TYPE.VOLATILITY_SPIKE, message: 'test3' },
      ];

      protector._processAnomalies('BTC/USDT', anomalies);

      expect(protector.circuitBreakerState.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_3);
    });

    it('应该记录事件', () => {
      const anomalies = [
        { level: CIRCUIT_BREAKER_LEVEL.LEVEL_1, type: BLACK_SWAN_TYPE.FLASH_CRASH, message: 'test' },
      ];

      protector._processAnomalies('BTC/USDT', anomalies);

      expect(protector.eventHistory.length).toBe(1);
    });

    it('较低级别不应该覆盖较高级别', () => {
      // 先设置高级别
      protector.circuitBreakerState.level = CIRCUIT_BREAKER_LEVEL.LEVEL_3;

      const anomalies = [
        { level: CIRCUIT_BREAKER_LEVEL.LEVEL_1, type: BLACK_SWAN_TYPE.FLASH_CRASH, message: 'test' },
      ];

      protector._processAnomalies('BTC/USDT', anomalies);

      expect(protector.circuitBreakerState.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_3);
    });
  });

  describe('_triggerCircuitBreaker', () => {
    beforeEach(async () => {
      await protector.init({
        executor: mockExecutor,
        portfolioRiskManager: mockPortfolioRiskManager,
      });
    });

    it('应该更新熔断状态', async () => {
      const anomaly = {
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2,
        type: BLACK_SWAN_TYPE.FLASH_CRASH,
        message: 'test message',
        details: {},
      };

      await protector._triggerCircuitBreaker('BTC/USDT', anomaly);

      expect(protector.circuitBreakerState.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_2);
      expect(protector.circuitBreakerState.reason).toBe('test message');
      expect(protector.circuitBreakerState.eventType).toBe(BLACK_SWAN_TYPE.FLASH_CRASH);
      expect(protector.circuitBreakerState.affectedSymbols).toContain('BTC/USDT');
    });

    it('应该发射 circuitBreakerTriggered 事件', async () => {
      const listener = vi.fn();
      protector.on('circuitBreakerTriggered', listener);

      await protector._triggerCircuitBreaker('BTC/USDT', {
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
        type: BLACK_SWAN_TYPE.FLASH_CRASH,
        message: 'test',
      });

      expect(listener).toHaveBeenCalled();
    });

    it('应该通知组合风控管理器', async () => {
      await protector._triggerCircuitBreaker('BTC/USDT', {
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2,
        type: BLACK_SWAN_TYPE.FLASH_CRASH,
        message: 'test',
      });

      expect(mockPortfolioRiskManager.emit).toHaveBeenCalledWith(
        'blackSwanEvent',
        expect.objectContaining({ level: CIRCUIT_BREAKER_LEVEL.LEVEL_2 })
      );
    });

    it('应该重置市场稳定计时', async () => {
      protector.stabilityStartTime = Date.now();

      await protector._triggerCircuitBreaker('BTC/USDT', {
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
        type: BLACK_SWAN_TYPE.FLASH_CRASH,
        message: 'test',
      });

      expect(protector.stabilityStartTime).toBeNull();
    });
  });

  describe('_executeCircuitBreakerActions', () => {
    beforeEach(async () => {
      await protector.init({
        executor: mockExecutor,
        portfolioRiskManager: mockPortfolioRiskManager,
      });
    });

    it('禁用自动紧急平仓时应该跳过', async () => {
      protector.config.enableAutoEmergencyClose = false;

      await protector._executeCircuitBreakerActions({
        level: CIRCUIT_BREAKER_LEVEL.EMERGENCY,
      });

      expect(mockExecutor.emergencyCloseAll).not.toHaveBeenCalled();
    });

    it('紧急状态应该全部平仓', async () => {
      await protector._executeCircuitBreakerActions({
        level: CIRCUIT_BREAKER_LEVEL.EMERGENCY,
        message: 'test',
      });

      expect(mockExecutor.emergencyCloseAll).toHaveBeenCalled();
    });

    it('三级熔断应该执行相应动作', async () => {
      await protector._executeCircuitBreakerActions({
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_3,
        message: 'test',
      });

      // 默认配置下，三级熔断执行紧急平仓
      expect(mockExecutor.emergencyCloseAll).toHaveBeenCalled();
    });

    it('二级警告应该部分平仓', async () => {
      await protector._executeCircuitBreakerActions({
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2,
        message: 'test',
      });

      expect(mockExecutor.reduceAllPositions).toHaveBeenCalledWith(0.5);
    });

    it('一级警告应该少量减仓', async () => {
      await protector._executeCircuitBreakerActions({
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
        message: 'test',
      });

      expect(mockExecutor.reduceAllPositions).toHaveBeenCalledWith(0.25);
    });

    it('非一级熔断应该暂停交易', async () => {
      await protector._executeCircuitBreakerActions({
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_2,
        message: 'test message',
      });

      expect(mockPortfolioRiskManager.pauseTrading).toHaveBeenCalled();
    });
  });

  describe('_emergencyCloseAll', () => {
    beforeEach(async () => {
      await protector.init({ executor: mockExecutor });
    });

    it('应该调用执行器紧急平仓', async () => {
      await protector._emergencyCloseAll('test reason');

      expect(mockExecutor.emergencyCloseAll).toHaveBeenCalledWith({ reason: 'test reason' });
    });

    it('应该发射 emergencyClose 事件', async () => {
      const listener = vi.fn();
      protector.on('emergencyClose', listener);

      await protector._emergencyCloseAll('test');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'test' })
      );
    });

    it('执行器失败应该捕获错误', async () => {
      mockExecutor.emergencyCloseAll.mockRejectedValue(new Error('test error'));

      // 不应该抛出错误
      await protector._emergencyCloseAll('test');
    });
  });

  describe('_partialClose', () => {
    beforeEach(async () => {
      await protector.init({ executor: mockExecutor });
    });

    it('应该调用执行器部分平仓', async () => {
      await protector._partialClose(0.3);

      expect(mockExecutor.reduceAllPositions).toHaveBeenCalledWith(0.3);
    });

    it('应该发射 partialClose 事件', async () => {
      const listener = vi.fn();
      protector.on('partialClose', listener);

      await protector._partialClose(0.5);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ ratio: 0.5 })
      );
    });
  });

  // ============================================
  // 恢复检测测试
  // ============================================

  describe('_checkRecovery', () => {
    it('正常状态应该直接返回', () => {
      protector.circuitBreakerState.level = CIRCUIT_BREAKER_LEVEL.NORMAL;

      protector._checkRecovery();

      // 不应该有任何变化
      expect(protector.stabilityStartTime).toBeNull();
    });

    it('冷却期内应该直接返回', () => {
      protector.circuitBreakerState.level = CIRCUIT_BREAKER_LEVEL.LEVEL_1;
      protector.circuitBreakerState.cooldownUntil = Date.now() + 60000;

      protector._checkRecovery();

      expect(protector.stabilityStartTime).toBeNull();
    });

    it('市场稳定应该设置稳定开始时间', () => {
      protector.circuitBreakerState.level = CIRCUIT_BREAKER_LEVEL.LEVEL_1;
      protector.circuitBreakerState.cooldownUntil = Date.now() - 1000;
      protector.circuitBreakerState.affectedSymbols = ['BTC/USDT'];

      // 添加稳定的价格历史
      const history = [];
      for (let i = 0; i < 20; i++) {
        history.push({ price: 50000, timestamp: Date.now() - i * 1000 });
      }
      protector.priceHistory.set('BTC/USDT', history);

      protector._checkRecovery();

      expect(protector.stabilityStartTime).not.toBeNull();
    });
  });

  describe('_isMarketStable', () => {
    beforeEach(() => {
      protector.circuitBreakerState.affectedSymbols = ['BTC/USDT'];
    });

    it('数据不足应该返回false', () => {
      protector.priceHistory.set('BTC/USDT', [{ price: 50000 }]);

      const result = protector._isMarketStable();

      expect(result).toBe(false);
    });

    it('低波动率应该返回true', () => {
      const history = [];
      for (let i = 0; i < 20; i++) {
        history.push({ price: 50000, timestamp: Date.now() - i * 1000 });
      }
      protector.priceHistory.set('BTC/USDT', history);

      const result = protector._isMarketStable();

      expect(result).toBe(true);
    });

    it('高波动率应该返回false', () => {
      const history = [];
      for (let i = 0; i < 20; i++) {
        history.push({
          price: 50000 + (i % 2 === 0 ? 1000 : -1000),
          timestamp: Date.now() - i * 1000,
        });
      }
      protector.priceHistory.set('BTC/USDT', history);

      const result = protector._isMarketStable();

      expect(result).toBe(false);
    });
  });

  describe('_recoverFromCircuitBreaker', () => {
    beforeEach(async () => {
      await protector.init({ portfolioRiskManager: mockPortfolioRiskManager });
      protector.circuitBreakerState.level = CIRCUIT_BREAKER_LEVEL.LEVEL_2;
    });

    it('应该重置熔断状态', () => {
      protector._recoverFromCircuitBreaker();

      expect(protector.circuitBreakerState.level).toBe(CIRCUIT_BREAKER_LEVEL.NORMAL);
      expect(protector.circuitBreakerState.triggeredAt).toBeNull();
      expect(protector.circuitBreakerState.affectedSymbols).toEqual([]);
    });

    it('应该恢复交易', () => {
      protector._recoverFromCircuitBreaker();

      expect(mockPortfolioRiskManager.resumeTrading).toHaveBeenCalled();
    });

    it('应该发射 recovered 事件', () => {
      const listener = vi.fn();
      protector.on('recovered', listener);

      protector._recoverFromCircuitBreaker();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ previousLevel: CIRCUIT_BREAKER_LEVEL.LEVEL_2 })
      );
    });

    it('应该重置稳定开始时间', () => {
      protector.stabilityStartTime = Date.now();

      protector._recoverFromCircuitBreaker();

      expect(protector.stabilityStartTime).toBeNull();
    });
  });

  // ============================================
  // 定时检查测试
  // ============================================

  describe('_performCheck', () => {
    it('应该检测价格更新超时', () => {
      const listener = vi.fn();
      protector.on('priceUpdateTimeout', listener);

      protector.lastPriceUpdate.set('BTC/USDT', Date.now() - 20000);

      protector._performCheck();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'BTC/USDT' })
      );
    });

    it('最近更新的价格不应触发超时', () => {
      const listener = vi.fn();
      protector.on('priceUpdateTimeout', listener);

      protector.lastPriceUpdate.set('BTC/USDT', Date.now() - 5000);

      protector._performCheck();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 事件记录测试
  // ============================================

  describe('_recordEvent', () => {
    it('应该记录事件', () => {
      protector._recordEvent('BTC/USDT', {
        type: BLACK_SWAN_TYPE.FLASH_CRASH,
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
        message: 'test',
      });

      expect(protector.eventHistory.length).toBe(1);
      expect(protector.eventHistory[0].symbol).toBe('BTC/USDT');
      expect(protector.eventHistory[0].type).toBe(BLACK_SWAN_TYPE.FLASH_CRASH);
    });

    it('应该限制历史长度', () => {
      for (let i = 0; i < 600; i++) {
        protector._recordEvent('BTC/USDT', {
          type: BLACK_SWAN_TYPE.FLASH_CRASH,
          level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
          message: `test ${i}`,
        });
      }

      expect(protector.eventHistory.length).toBeLessThanOrEqual(500);
    });
  });

  // ============================================
  // 公共 API 测试
  // ============================================

  describe('getStatus', () => {
    it('应该返回状态信息', () => {
      const status = protector.getStatus();

      expect(status.running).toBeDefined();
      expect(status.circuitBreakerState).toBeDefined();
      expect(status.recentEvents).toBeDefined();
      expect(status.config).toBeDefined();
    });

    it('应该包含最近事件', () => {
      protector._recordEvent('BTC/USDT', {
        type: BLACK_SWAN_TYPE.FLASH_CRASH,
        level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
        message: 'test',
      });

      const status = protector.getStatus();

      expect(status.recentEvents.length).toBe(1);
    });
  });

  describe('manualTrigger', () => {
    it('应该手动触发熔断', async () => {
      await protector.manualTrigger(CIRCUIT_BREAKER_LEVEL.LEVEL_2, '手动测试');

      expect(protector.circuitBreakerState.level).toBe(CIRCUIT_BREAKER_LEVEL.LEVEL_2);
      expect(protector.circuitBreakerState.reason).toBe('手动测试');
    });

    it('应该使用默认原因', async () => {
      await protector.manualTrigger(CIRCUIT_BREAKER_LEVEL.LEVEL_1);

      expect(protector.circuitBreakerState.reason).toBe('手动触发');
    });
  });

  describe('manualRecover', () => {
    it('应该手动恢复', () => {
      protector.circuitBreakerState.level = CIRCUIT_BREAKER_LEVEL.LEVEL_2;

      protector.manualRecover();

      expect(protector.circuitBreakerState.level).toBe(CIRCUIT_BREAKER_LEVEL.NORMAL);
    });
  });

  // ============================================
  // 日志测试
  // ============================================

  describe('log', () => {
    it('verbose=false 时应该跳过 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      protector.config.verbose = false;

      protector.log('test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 error 日志', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      protector.log('error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 warn 日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      protector.log('warn message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// 常量导出测试
// ============================================

describe('BlackSwanProtector Constants', () => {
  describe('CIRCUIT_BREAKER_LEVEL', () => {
    it('应该包含所有熔断级别', () => {
      expect(CIRCUIT_BREAKER_LEVEL.NORMAL).toBe('normal');
      expect(CIRCUIT_BREAKER_LEVEL.LEVEL_1).toBe('level_1');
      expect(CIRCUIT_BREAKER_LEVEL.LEVEL_2).toBe('level_2');
      expect(CIRCUIT_BREAKER_LEVEL.LEVEL_3).toBe('level_3');
      expect(CIRCUIT_BREAKER_LEVEL.EMERGENCY).toBe('emergency');
    });
  });

  describe('BLACK_SWAN_TYPE', () => {
    it('应该包含所有黑天鹅事件类型', () => {
      expect(BLACK_SWAN_TYPE.FLASH_CRASH).toBe('flash_crash');
      expect(BLACK_SWAN_TYPE.FLASH_RALLY).toBe('flash_rally');
      expect(BLACK_SWAN_TYPE.VOLATILITY_SPIKE).toBe('volatility_spike');
      expect(BLACK_SWAN_TYPE.LIQUIDITY_CRISIS).toBe('liquidity_crisis');
      expect(BLACK_SWAN_TYPE.SPREAD_BLOWOUT).toBe('spread_blowout');
      expect(BLACK_SWAN_TYPE.EXCHANGE_ANOMALY).toBe('exchange_anomaly');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('应该包含默认配置', () => {
      expect(DEFAULT_CONFIG.priceChange1mWarning).toBe(0.03);
      expect(DEFAULT_CONFIG.priceChange5mCircuitBreaker).toBe(0.08);
      expect(DEFAULT_CONFIG.volatilitySpikeMultiplier).toBe(3.0);
      expect(DEFAULT_CONFIG.enableAutoRecovery).toBe(true);
      expect(DEFAULT_CONFIG.enableAutoEmergencyClose).toBe(true);
    });
  });
});
