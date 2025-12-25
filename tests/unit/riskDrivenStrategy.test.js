/**
 * RiskDrivenStrategy 单元测试
 * Risk-Driven Strategy Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RiskDrivenStrategy,
  RiskMode,
  RiskLevel,
  RiskEvent,
} from '../../src/strategies/RiskDrivenStrategy.js';

// ============================================
// Mock Engine
// ============================================

function createMockEngine() {
  return {
    buy: vi.fn().mockReturnValue({ id: 'order-1', side: 'buy', status: 'filled' }),
    sell: vi.fn().mockReturnValue({ id: 'order-2', side: 'sell', status: 'filled' }),
    buyPercent: vi.fn().mockReturnValue({ id: 'order-3', side: 'buy', status: 'filled' }),
    closePosition: vi.fn().mockReturnValue({ id: 'order-4', side: 'sell', status: 'filled' }),
    getPosition: vi.fn().mockReturnValue(null),
    getCapital: vi.fn().mockReturnValue(100000),
    getEquity: vi.fn().mockReturnValue(100000),
  };
}

// ============================================
// 测试数据生成器
// ============================================

/**
 * 生成模拟K线数据
 */
function generateMockCandle(price, index, timestamp = null) {
  const volatility = price * 0.005;
  return {
    symbol: 'BTC/USDT',
    timestamp: timestamp || Date.now() - (100 - index) * 3600000,
    open: price - volatility,
    high: price + volatility,
    low: price - volatility * 1.5,
    close: price,
    volume: 10000000 + Math.random() * 50000000,
  };
}

/**
 * 生成价格序列
 */
function generatePriceSeries(count, startPrice = 50000, volatility = 0.02) {
  const prices = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * volatility * price;
    price += change;
    prices.push(price);
  }

  return prices;
}

/**
 * 生成K线历史数据
 */
function generateCandleHistory(count = 150, startPrice = 50000) {
  const prices = generatePriceSeries(count, startPrice);
  return prices.map((price, i) => generateMockCandle(price, i));
}

/**
 * 生成下跌趋势数据（用于测试回撤）
 */
function generateDowntrendPrices(count, startPrice = 50000, dropPercent = 0.2) {
  const prices = [];
  const dropPerCandle = dropPercent / count;

  for (let i = 0; i < count; i++) {
    const price = startPrice * (1 - dropPerCandle * i);
    prices.push(price);
  }

  return prices;
}

/**
 * 生成高波动数据
 */
function generateHighVolatilityPrices(count, startPrice = 50000) {
  const prices = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    // 高波动：每次变动 5-10%
    const change = (Math.random() - 0.5) * 0.15 * price;
    price += change;
    prices.push(Math.max(price, 1000));
  }

  return prices;
}

// ============================================
// RiskMode 常量测试
// ============================================

describe('RiskMode Constants', () => {
  it('should have all risk modes', () => {
    expect(RiskMode.TARGET_VOLATILITY).toBe('target_volatility');
    expect(RiskMode.RISK_PARITY).toBe('risk_parity');
    expect(RiskMode.MAX_DRAWDOWN).toBe('max_drawdown');
    expect(RiskMode.VOLATILITY_BREAKOUT).toBe('volatility_breakout');
    expect(RiskMode.CORRELATION_MONITOR).toBe('correlation_monitor');
    expect(RiskMode.COMBINED).toBe('combined');
  });
});

// ============================================
// RiskLevel 常量测试
// ============================================

describe('RiskLevel Constants', () => {
  it('should have all risk levels', () => {
    expect(RiskLevel.SAFE).toBe('safe');
    expect(RiskLevel.NORMAL).toBe('normal');
    expect(RiskLevel.ELEVATED).toBe('elevated');
    expect(RiskLevel.HIGH).toBe('high');
    expect(RiskLevel.CRITICAL).toBe('critical');
    expect(RiskLevel.EMERGENCY).toBe('emergency');
  });
});

// ============================================
// RiskEvent 常量测试
// ============================================

describe('RiskEvent Constants', () => {
  it('should have all risk events', () => {
    expect(RiskEvent.VOLATILITY_SPIKE).toBe('volatility_spike');
    expect(RiskEvent.DRAWDOWN_WARNING).toBe('drawdown_warning');
    expect(RiskEvent.DRAWDOWN_BREACH).toBe('drawdown_breach');
    expect(RiskEvent.CORRELATION_SURGE).toBe('correlation_surge');
    expect(RiskEvent.RISK_LEVEL_CHANGE).toBe('risk_level_change');
    expect(RiskEvent.POSITION_REDUCED).toBe('position_reduced');
    expect(RiskEvent.FORCED_LIQUIDATION).toBe('forced_liquidation');
    expect(RiskEvent.STRATEGY_SWITCH).toBe('strategy_switch');
  });
});

// ============================================
// RiskDrivenStrategy 构造函数测试
// ============================================

describe('RiskDrivenStrategy Constructor', () => {
  it('should initialize with default config', () => {
    const strategy = new RiskDrivenStrategy();

    expect(strategy.name).toBe('RiskDrivenStrategy');
    expect(strategy.symbol).toBe('BTC/USDT');
    expect(strategy.riskMode).toBe(RiskMode.COMBINED);
  });

  it('should accept custom config', () => {
    const strategy = new RiskDrivenStrategy({
      name: 'CustomRiskStrategy',
      symbol: 'ETH/USDT',
      riskMode: RiskMode.TARGET_VOLATILITY,
      targetVolatility: 0.12,
      maxDrawdown: 0.10,
    });

    expect(strategy.name).toBe('CustomRiskStrategy');
    expect(strategy.symbol).toBe('ETH/USDT');
    expect(strategy.riskMode).toBe(RiskMode.TARGET_VOLATILITY);
    expect(strategy.config.targetVolatility).toBe(0.12);
    expect(strategy.config.maxDrawdown).toBe(0.10);
  });

  it('should initialize volatility calculator', () => {
    const strategy = new RiskDrivenStrategy();
    expect(strategy.volatilityCalculator).toBeDefined();
  });

  it('should initialize drawdown monitor', () => {
    const strategy = new RiskDrivenStrategy();
    expect(strategy.drawdownMonitor).toBeDefined();
  });

  it('should initialize correlation monitor', () => {
    const strategy = new RiskDrivenStrategy();
    expect(strategy.correlationMonitor).toBeDefined();
  });

  it('should initialize target volatility manager', () => {
    const strategy = new RiskDrivenStrategy();
    expect(strategy.targetVolManager).toBeDefined();
  });

  it('should initialize risk parity manager', () => {
    const strategy = new RiskDrivenStrategy();
    expect(strategy.riskParityManager).toBeDefined();
  });

  it('should initialize internal state', () => {
    const strategy = new RiskDrivenStrategy();

    expect(strategy._currentRiskLevel).toBe(RiskLevel.NORMAL);
    expect(strategy._positionRatio).toBe(1.0);
    expect(strategy._priceHistory).toEqual([]);
    expect(strategy._eventHistory).toEqual([]);
    expect(strategy._isInLowRiskMode).toBe(false);
  });
});

// ============================================
// RiskDrivenStrategy onInit 测试
// ============================================

describe('RiskDrivenStrategy onInit', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy({
      riskMode: RiskMode.COMBINED,
    });
    engine = createMockEngine();
    strategy.engine = engine;
    strategy.getEquity = vi.fn().mockReturnValue(100000);
    strategy.log = vi.fn();
  });

  it('should initialize successfully', async () => {
    await strategy.onInit();
    // 不应该抛出错误
  });

  it('should update drawdown monitor with initial equity', async () => {
    await strategy.onInit();

    const stats = strategy.drawdownMonitor.getStats();
    expect(stats.peakEquity).toBe(100000);
  });
});

// ============================================
// VolatilityCalculator 测试
// ============================================

describe('VolatilityCalculator', () => {
  let strategy;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy({
      volatilityLookback: 20,
    });
  });

  describe('addReturn', () => {
    it('should add return values', () => {
      strategy.volatilityCalculator.addReturn(0.01);
      strategy.volatilityCalculator.addReturn(0.02);
      strategy.volatilityCalculator.addReturn(-0.01);

      expect(strategy.volatilityCalculator.returns.length).toBe(3);
    });

    it('should maintain max length', () => {
      for (let i = 0; i < 100; i++) {
        strategy.volatilityCalculator.addReturn(Math.random() * 0.02 - 0.01);
      }

      // lookback * 2 = 40
      expect(strategy.volatilityCalculator.returns.length).toBeLessThanOrEqual(40);
    });
  });

  describe('updateFromPrices', () => {
    it('should calculate returns from prices', () => {
      const prices = [100, 102, 101, 103, 105];
      prices.forEach((_, i) => {
        if (i > 0) {
          strategy.volatilityCalculator.updateFromPrices(prices.slice(0, i + 1));
        }
      });

      expect(strategy.volatilityCalculator.returns.length).toBe(4);
    });
  });

  describe('calculate', () => {
    it('should return null with insufficient data', () => {
      for (let i = 0; i < 10; i++) {
        strategy.volatilityCalculator.addReturn(0.01);
      }

      // 需要 20 个数据点
      expect(strategy.volatilityCalculator.calculate()).toBeNull();
    });

    it('should calculate annualized volatility', () => {
      // 添加足够的数据
      for (let i = 0; i < 30; i++) {
        strategy.volatilityCalculator.addReturn(Math.random() * 0.02 - 0.01);
      }

      const vol = strategy.volatilityCalculator.calculate();

      expect(vol).toBeGreaterThan(0);
      expect(vol).toBeLessThan(2); // 合理的年化波动率范围
    });
  });

  describe('detectBreakout', () => {
    it('should detect volatility breakout', () => {
      // 先填充正常波动率数据
      for (let i = 0; i < 60; i++) {
        strategy.volatilityCalculator.addReturn(Math.random() * 0.01 - 0.005);
      }

      // 添加高波动率数据
      for (let i = 0; i < 20; i++) {
        strategy.volatilityCalculator.addReturn(Math.random() * 0.1 - 0.05);
      }

      const breakout = strategy.volatilityCalculator.detectBreakout(2.0);

      expect(breakout).toHaveProperty('isBreakout');
      expect(breakout).toHaveProperty('ratio');
      expect(breakout).toHaveProperty('current');
      expect(breakout).toHaveProperty('historical');
    });
  });

  describe('getPercentile', () => {
    it('should return 50 with insufficient data', () => {
      expect(strategy.volatilityCalculator.getPercentile()).toBe(50);
    });

    it('should calculate percentile', () => {
      // 添加足够的波动率历史
      for (let i = 0; i < 50; i++) {
        strategy.volatilityCalculator.addReturn(Math.random() * 0.02 - 0.01);
        strategy.volatilityCalculator.calculate();
      }

      const percentile = strategy.volatilityCalculator.getPercentile();

      expect(percentile).toBeGreaterThanOrEqual(0);
      expect(percentile).toBeLessThanOrEqual(100);
    });
  });
});

// ============================================
// DrawdownMonitor 测试
// ============================================

describe('DrawdownMonitor', () => {
  let strategy;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy({
      maxDrawdown: 0.15,
      warningDrawdown: 0.10,
      criticalDrawdown: 0.20,
      emergencyDrawdown: 0.25,
    });
  });

  describe('update', () => {
    it('should track peak equity', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(110000);
      strategy.drawdownMonitor.update(105000);

      expect(strategy.drawdownMonitor.peakEquity).toBe(110000);
    });

    it('should track current equity', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(95000);

      expect(strategy.drawdownMonitor.currentEquity).toBe(95000);
    });

    it('should record drawdown history', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(95000);
      strategy.drawdownMonitor.update(90000);

      expect(strategy.drawdownMonitor.drawdownHistory.length).toBe(3);
    });
  });

  describe('calculateDrawdown', () => {
    it('should calculate current drawdown correctly', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(90000);

      const drawdown = strategy.drawdownMonitor.calculateDrawdown();

      expect(drawdown).toBeCloseTo(0.1, 5); // 10% 回撤
    });

    it('should return 0 when no peak', () => {
      expect(strategy.drawdownMonitor.calculateDrawdown()).toBe(0);
    });
  });

  describe('getRiskLevel', () => {
    it('should return SAFE for small drawdown', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(97000); // 3% drawdown

      expect(strategy.drawdownMonitor.getRiskLevel()).toBe(RiskLevel.SAFE);
    });

    it('should return NORMAL for moderate drawdown', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(93000); // 7% drawdown

      expect(strategy.drawdownMonitor.getRiskLevel()).toBe(RiskLevel.NORMAL);
    });

    it('should return ELEVATED for warning drawdown', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(88000); // 12% drawdown

      expect(strategy.drawdownMonitor.getRiskLevel()).toBe(RiskLevel.ELEVATED);
    });

    it('should return HIGH for max drawdown breach', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(82000); // 18% drawdown

      expect(strategy.drawdownMonitor.getRiskLevel()).toBe(RiskLevel.HIGH);
    });

    it('should return CRITICAL for critical drawdown', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(78000); // 22% drawdown

      expect(strategy.drawdownMonitor.getRiskLevel()).toBe(RiskLevel.CRITICAL);
    });

    it('should return EMERGENCY for emergency drawdown', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(72000); // 28% drawdown

      expect(strategy.drawdownMonitor.getRiskLevel()).toBe(RiskLevel.EMERGENCY);
    });
  });

  describe('getSuggestedPositionRatio', () => {
    it('should suggest 100% for safe level', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(99000);

      expect(strategy.drawdownMonitor.getSuggestedPositionRatio()).toBe(1.0);
    });

    it('should suggest 0% for emergency level', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(70000);

      expect(strategy.drawdownMonitor.getSuggestedPositionRatio()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return complete stats', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(90000);

      const stats = strategy.drawdownMonitor.getStats();

      expect(stats).toHaveProperty('currentDrawdown');
      expect(stats).toHaveProperty('maxHistoricalDrawdown');
      expect(stats).toHaveProperty('peakEquity');
      expect(stats).toHaveProperty('currentEquity');
      expect(stats).toHaveProperty('riskLevel');
      expect(stats).toHaveProperty('recoveryProgress');
    });
  });
});

// ============================================
// CorrelationMonitor 测试
// ============================================

describe('CorrelationMonitor', () => {
  let strategy;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy({
      correlationLookback: 30,
      correlationThreshold: 0.8,
      correlationSpikeMultiplier: 1.5,
      assets: ['BTC/USDT', 'ETH/USDT'],
    });
  });

  describe('updateReturn', () => {
    it('should store returns by symbol', () => {
      strategy.correlationMonitor.updateReturn('BTC/USDT', 0.01);
      strategy.correlationMonitor.updateReturn('BTC/USDT', 0.02);
      strategy.correlationMonitor.updateReturn('ETH/USDT', 0.015);

      expect(strategy.correlationMonitor.returnsSeries['BTC/USDT'].length).toBe(2);
      expect(strategy.correlationMonitor.returnsSeries['ETH/USDT'].length).toBe(1);
    });
  });

  describe('calculateCorrelation', () => {
    it('should return 0 for insufficient data', () => {
      strategy.correlationMonitor.updateReturn('BTC/USDT', 0.01);
      strategy.correlationMonitor.updateReturn('ETH/USDT', 0.01);

      const corr = strategy.correlationMonitor.calculateCorrelation('BTC/USDT', 'ETH/USDT');

      expect(corr).toBe(0);
    });

    it('should calculate correlation with enough data', () => {
      for (let i = 0; i < 30; i++) {
        const btcReturn = Math.random() * 0.02 - 0.01;
        const ethReturn = btcReturn * 0.8 + Math.random() * 0.004 - 0.002;

        strategy.correlationMonitor.updateReturn('BTC/USDT', btcReturn);
        strategy.correlationMonitor.updateReturn('ETH/USDT', ethReturn);
      }

      const corr = strategy.correlationMonitor.calculateCorrelation('BTC/USDT', 'ETH/USDT');

      expect(corr).toBeGreaterThan(0.5); // 应该是正相关
      expect(corr).toBeLessThanOrEqual(1);
    });
  });

  describe('getAverageCorrelation', () => {
    it('should return 0 for empty matrix', () => {
      expect(strategy.correlationMonitor.getAverageCorrelation()).toBe(0);
    });
  });

  describe('getDiversificationAdvice', () => {
    it('should provide diversification advice', () => {
      const advice = strategy.correlationMonitor.getDiversificationAdvice();

      expect(advice).toHaveProperty('wellDiversified');
      expect(advice).toHaveProperty('averageCorrelation');
      expect(advice).toHaveProperty('highCorrelationPairs');
      expect(advice).toHaveProperty('recommendation');
    });
  });
});

// ============================================
// TargetVolatilityManager 测试
// ============================================

describe('TargetVolatilityManager', () => {
  let strategy;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy({
      targetVolatility: 0.15,
      volatilityAdjustSpeed: 0.3,
      minPositionRatio: 0.1,
      maxPositionRatio: 1.5,
      volatilityLookback: 20,
    });
  });

  describe('update', () => {
    it('should return current ratio with insufficient data', () => {
      const prices = [100, 101, 102];
      const result = strategy.targetVolManager.update(prices);

      expect(result.targetRatio).toBe(1.0);
      expect(result.currentVolatility).toBeNull();
    });

    it('should calculate target ratio with enough data', () => {
      const prices = generatePriceSeries(30, 100, 0.02);
      const result = strategy.targetVolManager.update(prices);

      expect(result).toHaveProperty('targetRatio');
      expect(result).toHaveProperty('currentVolatility');
      expect(result).toHaveProperty('targetVolatility');
      expect(result).toHaveProperty('needsRebalance');
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const state = strategy.targetVolManager.getState();

      expect(state).toHaveProperty('currentRatio');
      expect(state).toHaveProperty('targetVol');
      expect(state).toHaveProperty('volatilityHistory');
    });
  });
});

// ============================================
// RiskParityManager 测试
// ============================================

describe('RiskParityManager', () => {
  let strategy;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy({
      riskParityRebalanceThreshold: 0.1,
      correlationLookback: 30,
    });
  });

  describe('updateAssetVolatility', () => {
    it('should update asset volatility', () => {
      const prices = generatePriceSeries(50, 100, 0.02);
      strategy.riskParityManager.updateAssetVolatility('BTC/USDT', prices);

      expect(strategy.riskParityManager.assetVolatilities['BTC/USDT']).toBeDefined();
      expect(strategy.riskParityManager.assetVolatilities['BTC/USDT']).toBeGreaterThan(0);
    });
  });

  describe('calculateRiskParityWeights', () => {
    it('should return empty object with no data', () => {
      const weights = strategy.riskParityManager.calculateRiskParityWeights();
      expect(weights).toEqual({});
    });

    it('should calculate weights inversely proportional to volatility', () => {
      strategy.riskParityManager.assetVolatilities = {
        'BTC/USDT': 0.5,
        'ETH/USDT': 1.0,
      };

      const weights = strategy.riskParityManager.calculateRiskParityWeights();

      // 低波动资产应该有更高权重
      expect(weights['BTC/USDT']).toBeGreaterThan(weights['ETH/USDT']);
      expect(weights['BTC/USDT'] + weights['ETH/USDT']).toBeCloseTo(1, 5);
    });
  });
});

// ============================================
// RiskDrivenStrategy 主逻辑测试
// ============================================

describe('RiskDrivenStrategy Main Logic', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy({
      riskMode: RiskMode.COMBINED,
      targetVolatility: 0.15,
      maxDrawdown: 0.15,
      volatilityBreakoutThreshold: 2.0,
    });

    engine = createMockEngine();
    strategy.engine = engine;
    strategy.buy = vi.fn();
    strategy.sell = vi.fn();
    strategy.closePosition = vi.fn();
    strategy.setBuySignal = vi.fn();
    strategy.setSellSignal = vi.fn();
    strategy.getPosition = vi.fn().mockReturnValue(null);
    strategy.getCapital = vi.fn().mockReturnValue(100000);
    strategy.getEquity = vi.fn().mockReturnValue(100000);
    strategy.log = vi.fn();
    strategy.setIndicator = vi.fn();
  });

  describe('getRiskStatus', () => {
    it('should return current risk status', () => {
      const status = strategy.getRiskStatus();

      expect(status).toHaveProperty('level');
      expect(status).toHaveProperty('positionRatio');
      expect(status).toHaveProperty('isLowRiskMode');
      expect(status).toHaveProperty('drawdown');
      expect(status).toHaveProperty('volatility');
    });
  });

  describe('getEventHistory', () => {
    it('should return empty array initially', () => {
      const history = strategy.getEventHistory();
      expect(history).toEqual([]);
    });

    it('should respect limit parameter', () => {
      // 手动添加一些事件
      for (let i = 0; i < 20; i++) {
        strategy._eventHistory.push({ type: 'test', timestamp: Date.now() });
      }

      const history = strategy.getEventHistory(10);
      expect(history.length).toBe(10);
    });
  });

  describe('getStats', () => {
    it('should return strategy stats', () => {
      const stats = strategy.getStats();

      expect(stats).toHaveProperty('riskLevel');
      expect(stats).toHaveProperty('positionRatio');
      expect(stats).toHaveProperty('isLowRiskMode');
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('recentEvents');
      expect(stats).toHaveProperty('volatility');
      expect(stats).toHaveProperty('drawdown');
      expect(stats).toHaveProperty('targetVolState');
    });
  });

  describe('forceRiskAssessment', () => {
    it('should return risk assessment', () => {
      const assessment = strategy.forceRiskAssessment();

      expect(assessment).toHaveProperty('overallLevel');
      expect(assessment).toHaveProperty('signals');
      expect(assessment).toHaveProperty('actions');
      expect(assessment).toHaveProperty('metrics');
    });
  });

  describe('setTargetVolatility', () => {
    it('should update target volatility', () => {
      strategy.setTargetVolatility(0.20);

      expect(strategy.config.targetVolatility).toBe(0.20);
      expect(strategy.targetVolManager.targetVol).toBe(0.20);
    });
  });

  describe('setMaxDrawdown', () => {
    it('should update max drawdown threshold', () => {
      strategy.setMaxDrawdown(0.12);

      expect(strategy.config.maxDrawdown).toBe(0.12);
      expect(strategy.drawdownMonitor.maxDrawdown).toBe(0.12);
    });
  });
});

// ============================================
// 风险评估测试
// ============================================

describe('Risk Assessment', () => {
  let strategy;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy({
      riskMode: RiskMode.COMBINED,
      targetVolatility: 0.15,
      maxDrawdown: 0.15,
      warningDrawdown: 0.10,
      volatilityBreakoutThreshold: 2.0,
    });

    strategy.log = vi.fn();
    strategy.setIndicator = vi.fn();
    strategy.getEquity = vi.fn().mockReturnValue(100000);
    strategy.getPosition = vi.fn().mockReturnValue(null);
    strategy.getCapital = vi.fn().mockReturnValue(100000);
  });

  describe('_assessRisk', () => {
    it('should detect volatility breakout', () => {
      // 填充低波动率历史
      for (let i = 0; i < 60; i++) {
        strategy.volatilityCalculator.addReturn(Math.random() * 0.005 - 0.0025);
        strategy.volatilityCalculator.calculate();
      }

      // 添加高波动率数据
      for (let i = 0; i < 20; i++) {
        strategy.volatilityCalculator.addReturn(Math.random() * 0.08 - 0.04);
        strategy.volatilityCalculator.calculate();
      }

      const assessment = strategy._assessRisk();

      // 检查是否检测到波动率信号
      expect(assessment.metrics).toHaveProperty('volatility');
    });

    it('should detect drawdown warning', () => {
      // 设置回撤状态
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(88000); // 12% 回撤

      const assessment = strategy._assessRisk();

      expect(assessment.metrics.drawdown).toBeDefined();
      expect(assessment.metrics.drawdown.riskLevel).toBe(RiskLevel.ELEVATED);
    });

    it('should detect emergency drawdown', () => {
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(70000); // 30% 回撤

      const assessment = strategy._assessRisk();

      expect(assessment.overallLevel).toBe(RiskLevel.EMERGENCY);
      expect(assessment.signals.some(s => s.type === RiskEvent.FORCED_LIQUIDATION)).toBe(true);
    });

    it('should return SAFE level when no risks detected', () => {
      // 正常状态
      strategy.drawdownMonitor.update(100000);
      strategy.drawdownMonitor.update(99000); // 1% 回撤

      const assessment = strategy._assessRisk();

      expect([RiskLevel.SAFE, RiskLevel.NORMAL]).toContain(assessment.overallLevel);
    });
  });
});

// ============================================
// 仓位计算测试
// ============================================

describe('Position Calculation', () => {
  let strategy;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy({
      riskMode: RiskMode.COMBINED,
      minPositionRatio: 0.1,
      maxPositionRatio: 1.5,
    });

    strategy.log = vi.fn();
  });

  describe('_calculateTargetPosition', () => {
    it('should return 0 for close_all action', () => {
      const assessment = {
        overallLevel: RiskLevel.EMERGENCY,
        signals: [],
        actions: [{ action: 'close_all', ratio: 0, reason: 'emergency' }],
        metrics: {},
      };

      const result = strategy._calculateTargetPosition(assessment);

      expect(result.ratio).toBe(0);
      expect(result.reasons).toContain('emergency_close');
    });

    it('should use minimum ratio from actions', () => {
      const assessment = {
        overallLevel: RiskLevel.HIGH,
        signals: [],
        actions: [
          { action: 'reduce_position', ratio: 0.5, reason: 'drawdown' },
          { action: 'reduce_position', ratio: 0.3, reason: 'volatility' },
        ],
        metrics: {},
      };

      const result = strategy._calculateTargetPosition(assessment);

      expect(result.ratio).toBe(0.3);
    });

    it('should clamp ratio to valid range', () => {
      const assessment = {
        overallLevel: RiskLevel.NORMAL,
        signals: [],
        actions: [{ action: 'adjust_position', ratio: 2.0, reason: 'target_vol' }],
        metrics: {},
      };

      const result = strategy._calculateTargetPosition(assessment);

      expect(result.ratio).toBeLessThanOrEqual(strategy.config.maxPositionRatio);
    });
  });
});

// ============================================
// 事件记录测试
// ============================================

describe('Event Recording', () => {
  let strategy;

  beforeEach(() => {
    strategy = new RiskDrivenStrategy();
  });

  describe('_recordEvent', () => {
    it('should add event to history', () => {
      const event = {
        type: RiskEvent.VOLATILITY_SPIKE,
        timestamp: Date.now(),
        data: { ratio: 2.5 },
      };

      strategy._recordEvent(event);

      expect(strategy._eventHistory.length).toBe(1);
      expect(strategy._eventHistory[0]).toEqual(event);
    });

    it('should maintain max history length', () => {
      for (let i = 0; i < 150; i++) {
        strategy._recordEvent({
          type: RiskEvent.RISK_LEVEL_CHANGE,
          timestamp: Date.now(),
        });
      }

      expect(strategy._eventHistory.length).toBeLessThanOrEqual(100);
    });

    it('should emit riskEvent', () => {
      const callback = vi.fn();
      strategy.on('riskEvent', callback);

      strategy._recordEvent({
        type: RiskEvent.VOLATILITY_SPIKE,
        timestamp: Date.now(),
      });

      expect(callback).toHaveBeenCalled();
    });
  });
});

// ============================================
// 集成测试
// ============================================

describe('RiskDrivenStrategy 集成测试', () => {
  it('应该正确继承 BaseStrategy', async () => {
    const { BaseStrategy } = await import('../../src/strategies/BaseStrategy.js');
    const strategy = new RiskDrivenStrategy();

    expect(strategy instanceof BaseStrategy).toBe(true);
  });

  it('应该能设置和获取状态', () => {
    const strategy = new RiskDrivenStrategy();

    strategy.setState('testKey', 'testValue');
    expect(strategy.getState('testKey')).toBe('testValue');
  });

  it('应该能设置和获取指标', () => {
    const strategy = new RiskDrivenStrategy();

    strategy.setIndicator('riskLevel', RiskLevel.HIGH);
    expect(strategy.getIndicator('riskLevel')).toBe(RiskLevel.HIGH);
  });

  it('应该能设置信号', () => {
    const strategy = new RiskDrivenStrategy();

    strategy.setSellSignal('Risk reduction');
    expect(strategy.getSignal().type).toBe('sell');
  });

  it('不同风险模式应该正确初始化', () => {
    const modes = [
      RiskMode.TARGET_VOLATILITY,
      RiskMode.MAX_DRAWDOWN,
      RiskMode.VOLATILITY_BREAKOUT,
      RiskMode.RISK_PARITY,
      RiskMode.CORRELATION_MONITOR,
      RiskMode.COMBINED,
    ];

    modes.forEach(mode => {
      const strategy = new RiskDrivenStrategy({ riskMode: mode });
      expect(strategy.riskMode).toBe(mode);
    });
  });

  it('应该支持多资产配置', () => {
    const strategy = new RiskDrivenStrategy({
      assets: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      riskMode: RiskMode.RISK_PARITY,
    });

    expect(strategy.config.assets.length).toBe(3);
  });

  it('应该支持动态参数更新', () => {
    const strategy = new RiskDrivenStrategy();
    strategy.log = vi.fn();

    strategy.setTargetVolatility(0.20);
    strategy.setMaxDrawdown(0.12);

    expect(strategy.config.targetVolatility).toBe(0.20);
    expect(strategy.config.maxDrawdown).toBe(0.12);
  });
});
