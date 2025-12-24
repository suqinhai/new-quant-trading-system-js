/**
 * Regime 切换元策略测试
 * Regime Switching Meta Strategy Tests
 * @module tests/unit/regimeSwitchingStrategy.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RegimeSwitchingStrategy,
  MarketRegime,
  RegimeEvent,
} from '../../src/strategies/RegimeSwitchingStrategy.js';

// ============================================
// Mock 数据生成函数
// ============================================

/**
 * 生成普通K线数据
 */
function generateCandles(count, startPrice = 50000, volatility = 100) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * volatility;
    price += change;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + volatility / 2,
      low: price - volatility / 2,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}

/**
 * 生成上涨趋势K线
 */
function generateTrendingUpCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const trend = 50 + Math.random() * 30;
    const noise = (Math.random() - 0.5) * 20;
    price += trend + noise;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - 25,
      high: price + 50,
      low: price - 50,
      close: price,
      volume: 1500,
    });
  }

  return candles;
}

/**
 * 生成震荡盘整K线
 */
function generateRangingCandles(count, centerPrice = 50000, range = 200) {
  const candles = [];

  for (let i = 0; i < count; i++) {
    const offset = Math.sin(i * 0.3) * range / 2 + (Math.random() - 0.5) * range / 4;
    const price = centerPrice + offset;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - 20,
      high: price + 30,
      low: price - 30,
      close: price,
      volume: 800,
    });
  }

  return candles;
}

// ============================================
// Mock Engine
// ============================================

function createMockEngine() {
  return {
    balance: 10000,
    positions: {},
    getBalance: vi.fn(() => 10000),
    getPosition: vi.fn((symbol) => null),
    buy: vi.fn(),
    sell: vi.fn(),
    log: vi.fn(),
  };
}

// ============================================
// RegimeSwitchingStrategy 测试
// ============================================

describe('RegimeSwitchingStrategy', () => {
  let strategy;
  let mockEngine;

  beforeEach(() => {
    mockEngine = createMockEngine();

    strategy = new RegimeSwitchingStrategy({
      symbol: 'BTC/USDT',
      positionPercent: 95,
      signalAggregation: 'weighted',
      weightedThreshold: 0.5,
      minRegimeDuration: 2,
    });

    // Mock engine methods
    strategy.engine = mockEngine;
    strategy.log = vi.fn();
    strategy.getPosition = vi.fn(() => null);
    strategy.buyPercent = vi.fn();
    strategy.closePosition = vi.fn();
    strategy.setBuySignal = vi.fn();
    strategy.setSellSignal = vi.fn();
    strategy.setState = vi.fn();
    strategy.setIndicator = vi.fn();
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners?.();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new RegimeSwitchingStrategy();

      expect(s.symbol).toBe('BTC/USDT');
      expect(s.basePositionPercent).toBe(95);
      expect(s.signalAggregation).toBe('weighted');
      expect(s.weightedThreshold).toBe(0.5);
    });

    it('应该使用自定义参数', () => {
      const s = new RegimeSwitchingStrategy({
        symbol: 'ETH/USDT',
        positionPercent: 80,
        signalAggregation: 'majority',
        weightedThreshold: 0.6,
      });

      expect(s.symbol).toBe('ETH/USDT');
      expect(s.basePositionPercent).toBe(80);
      expect(s.signalAggregation).toBe('majority');
      expect(s.weightedThreshold).toBe(0.6);
    });

    it('应该初始化 Regime 参数', () => {
      expect(strategy.regimeParams.adxPeriod).toBe(14);
      expect(strategy.regimeParams.adxTrendThreshold).toBe(25);
      expect(strategy.regimeParams.bbPeriod).toBe(20);
    });

    it('应该初始化策略参数', () => {
      expect(strategy.strategyParams.SMA).toBeDefined();
      expect(strategy.strategyParams.MACD).toBeDefined();
      expect(strategy.strategyParams.RSI).toBeDefined();
    });

    it('应该初始化为 RANGING 状态', () => {
      expect(strategy._currentRegime).toBe(MarketRegime.RANGING);
    });

    it('应该初始化内部状态', () => {
      expect(strategy._subStrategies).toEqual({});
      expect(strategy._activeStrategies).toEqual([]);
      expect(strategy._signalHistory).toEqual([]);
    });

    it('应该支持自定义 Regime 映射', () => {
      const customMap = {
        [MarketRegime.TRENDING_UP]: {
          strategies: ['RSI'],
          weights: { RSI: 1.0 },
        },
      };

      const s = new RegimeSwitchingStrategy({ regimeMap: customMap });
      expect(s.customRegimeMap).toEqual(customMap);
    });
  });

  describe('信号聚合', () => {
    beforeEach(() => {
      strategy._activeStrategies = ['SMA', 'MACD'];
    });

    describe('加权聚合 (weighted)', () => {
      it('应该在权重超过阈值时生成买入信号', () => {
        strategy.signalAggregation = 'weighted';
        strategy.weightedThreshold = 0.5;

        const signals = [
          { strategy: 'SMA', signal: { type: 'buy' }, weight: 0.6 },
          { strategy: 'MACD', signal: { type: 'buy' }, weight: 0.4 },
        ];

        const result = strategy._weightedAggregation(signals);

        expect(result.type).toBe('buy');
        expect(result.weight).toBe(1.0);
      });

      it('应该在权重超过阈值时生成卖出信号', () => {
        strategy.signalAggregation = 'weighted';
        strategy.weightedThreshold = 0.5;

        const signals = [
          { strategy: 'SMA', signal: { type: 'sell' }, weight: 0.6 },
          { strategy: 'MACD', signal: { type: 'sell' }, weight: 0.4 },
        ];

        const result = strategy._weightedAggregation(signals);

        expect(result.type).toBe('sell');
        expect(result.weight).toBe(1.0);
      });

      it('应该在权重不足时返回 null', () => {
        strategy.signalAggregation = 'weighted';
        strategy.weightedThreshold = 0.7;

        const signals = [
          { strategy: 'SMA', signal: { type: 'buy' }, weight: 0.3 },
          { strategy: 'MACD', signal: { type: 'sell' }, weight: 0.3 },
        ];

        const result = strategy._weightedAggregation(signals);

        expect(result).toBeNull();
      });

      it('应该在买卖冲突时选择权重高的', () => {
        const signals = [
          { strategy: 'SMA', signal: { type: 'buy' }, weight: 0.7 },
          { strategy: 'MACD', signal: { type: 'sell' }, weight: 0.3 },
        ];

        const result = strategy._weightedAggregation(signals);

        expect(result.type).toBe('buy');
      });
    });

    describe('多数决聚合 (majority)', () => {
      it('应该在多数策略发出买入信号时买入', () => {
        const signals = [
          { strategy: 'SMA', signal: { type: 'buy' }, weight: 0.5 },
          { strategy: 'MACD', signal: { type: 'buy' }, weight: 0.5 },
        ];

        const result = strategy._majorityAggregation(signals);

        expect(result.type).toBe('buy');
        expect(result.count).toBe(2);
      });

      it('应该在没有多数时返回 null', () => {
        const signals = [
          { strategy: 'SMA', signal: { type: 'buy' }, weight: 0.5 },
          { strategy: 'MACD', signal: { type: 'sell' }, weight: 0.5 },
        ];

        const result = strategy._majorityAggregation(signals);

        expect(result).toBeNull();
      });
    });

    describe('任意信号聚合 (any)', () => {
      it('应该优先返回卖出信号', () => {
        const signals = [
          { strategy: 'SMA', signal: { type: 'buy' }, weight: 0.5 },
          { strategy: 'MACD', signal: { type: 'sell' }, weight: 0.5 },
        ];

        const result = strategy._anyAggregation(signals);

        expect(result.type).toBe('sell');
      });

      it('应该在没有卖出信号时返回买入信号', () => {
        const signals = [
          { strategy: 'SMA', signal: { type: 'buy' }, weight: 0.5 },
        ];

        const result = strategy._anyAggregation(signals);

        expect(result.type).toBe('buy');
      });
    });
  });

  describe('策略推荐', () => {
    beforeEach(() => {
      // Mock _regimeDetector for recommendation tests
      strategy._regimeDetector = {
        getIndicators: vi.fn(() => ({})),
      };
    });

    it('趋势上涨时应该推荐全仓', () => {
      strategy._currentRegime = MarketRegime.TRENDING_UP;
      const recommendation = strategy._getStrategyRecommendation();

      expect(recommendation.positionSizing).toBe(1.0);
      expect(recommendation.riskLevel).toBe('normal');
    });

    it('趋势下跌时应该降低仓位', () => {
      strategy._currentRegime = MarketRegime.TRENDING_DOWN;
      const recommendation = strategy._getStrategyRecommendation();

      expect(recommendation.positionSizing).toBe(0.8);
      expect(recommendation.riskLevel).toBe('caution');
    });

    it('震荡市应该降低仓位', () => {
      strategy._currentRegime = MarketRegime.RANGING;
      const recommendation = strategy._getStrategyRecommendation();

      expect(recommendation.positionSizing).toBe(0.7);
      expect(recommendation.riskLevel).toBe('normal');
    });

    it('高波动应该大幅降低仓位', () => {
      strategy._currentRegime = MarketRegime.HIGH_VOLATILITY;
      const recommendation = strategy._getStrategyRecommendation();

      expect(recommendation.positionSizing).toBe(0.5);
      expect(recommendation.riskLevel).toBe('high');
    });

    it('极端情况应该停止交易', () => {
      strategy._currentRegime = MarketRegime.EXTREME;
      const recommendation = strategy._getStrategyRecommendation();

      expect(recommendation.positionSizing).toBe(0);
      expect(recommendation.riskLevel).toBe('extreme');
    });
  });

  describe('公共 API', () => {
    it('getCurrentRegime 应该返回当前状态', () => {
      strategy._currentRegime = MarketRegime.HIGH_VOLATILITY;
      expect(strategy.getCurrentRegime()).toBe(MarketRegime.HIGH_VOLATILITY);
    });

    it('getActiveStrategies 应该返回活跃策略列表', () => {
      strategy._activeStrategies = ['SMA', 'MACD'];
      const active = strategy.getActiveStrategies();

      expect(active).toEqual(['SMA', 'MACD']);
      // 应该返回副本
      active.push('RSI');
      expect(strategy._activeStrategies.length).toBe(2);
    });

    it('getRegimeStats 应该返回统计信息', () => {
      strategy._currentRegime = MarketRegime.TRENDING_UP;
      strategy._activeStrategies = ['SMA'];
      strategy._regimeStats.changes = 5;

      const stats = strategy.getRegimeStats();

      expect(stats.currentRegime).toBe(MarketRegime.TRENDING_UP);
      expect(stats.activeStrategies).toEqual(['SMA']);
      expect(stats.regimeChanges).toBe(5);
    });

    it('forceRegime 应该强制切换状态', () => {
      strategy._updateActiveStrategies = vi.fn();

      strategy.forceRegime(MarketRegime.HIGH_VOLATILITY);

      expect(strategy._currentRegime).toBe(MarketRegime.HIGH_VOLATILITY);
      expect(strategy._updateActiveStrategies).toHaveBeenCalled();
    });

    it('forceRegime 应该忽略无效状态', () => {
      const originalRegime = strategy._currentRegime;

      strategy.forceRegime('invalid_regime');

      expect(strategy._currentRegime).toBe(originalRegime);
    });
  });

  describe('风控设置', () => {
    it('应该默认在 Regime 切换时平仓', () => {
      const s = new RegimeSwitchingStrategy();
      expect(s.closeOnRegimeChange).toBe(true);
    });

    it('应该默认在极端情况强制平仓', () => {
      const s = new RegimeSwitchingStrategy();
      expect(s.forceCloseOnExtreme).toBe(true);
    });

    it('应该支持禁用 Regime 切换平仓', () => {
      const s = new RegimeSwitchingStrategy({ closeOnRegimeChange: false });
      expect(s.closeOnRegimeChange).toBe(false);
    });

    it('应该支持禁用极端情况平仓', () => {
      const s = new RegimeSwitchingStrategy({ forceCloseOnExtreme: false });
      expect(s.forceCloseOnExtreme).toBe(false);
    });
  });

  describe('策略权重', () => {
    it('应该返回配置的策略权重', () => {
      strategy._currentRegime = MarketRegime.TRENDING_UP;
      strategy._activeStrategies = ['SMA', 'MACD'];

      const smaWeight = strategy._getStrategyWeight('SMA');
      const macdWeight = strategy._getStrategyWeight('MACD');

      expect(smaWeight).toBe(0.6);
      expect(macdWeight).toBe(0.4);
    });

    it('未配置时应该返回平均权重', () => {
      strategy._currentRegime = MarketRegime.TRENDING_UP;
      strategy._activeStrategies = ['SMA', 'MACD', 'UNKNOWN'];

      const weight = strategy._getStrategyWeight('UNKNOWN');

      expect(weight).toBeCloseTo(1 / 3, 2);
    });
  });

  describe('活跃策略更新', () => {
    it('应该根据 Regime 更新活跃策略', () => {
      // Mock sub-strategies
      strategy._subStrategies = {
        SMA: { instance: {}, lastSignal: null, active: false },
        MACD: { instance: {}, lastSignal: null, active: false },
        RSI: { instance: {}, lastSignal: null, active: false },
      };

      strategy._currentRegime = MarketRegime.TRENDING_UP;
      strategy._updateActiveStrategies();

      expect(strategy._activeStrategies).toContain('SMA');
      expect(strategy._activeStrategies).toContain('MACD');
      expect(strategy._activeStrategies).not.toContain('RSI');
    });

    it('极端情况应该清空活跃策略', () => {
      strategy._subStrategies = {
        SMA: { instance: {}, lastSignal: null, active: true },
      };
      strategy._activeStrategies = ['SMA'];

      strategy._currentRegime = MarketRegime.EXTREME;
      strategy._updateActiveStrategies();

      expect(strategy._activeStrategies).toEqual([]);
    });
  });

  describe('信号历史', () => {
    it('应该记录信号历史', () => {
      strategy._subStrategies = {
        SMA: { instance: {}, lastSignal: null, active: true },
      };

      strategy._handleSubStrategySignal('SMA', { type: 'buy', price: 50000 });

      expect(strategy._signalHistory.length).toBe(1);
      expect(strategy._signalHistory[0].strategy).toBe('SMA');
      expect(strategy._signalHistory[0].signal.type).toBe('buy');
    });

    it('应该限制历史记录数量', () => {
      strategy._subStrategies = {
        SMA: { instance: {}, lastSignal: null, active: true },
      };

      // 添加超过 100 条记录
      for (let i = 0; i < 110; i++) {
        strategy._handleSubStrategySignal('SMA', { type: 'buy', price: 50000 + i });
      }

      expect(strategy._signalHistory.length).toBe(100);
    });
  });
});

// ============================================
// MarketRegime 枚举测试
// ============================================

describe('MarketRegime 枚举 (from RegimeSwitchingStrategy)', () => {
  it('应该包含所有市场状态', () => {
    expect(MarketRegime.TRENDING_UP).toBe('trending_up');
    expect(MarketRegime.TRENDING_DOWN).toBe('trending_down');
    expect(MarketRegime.RANGING).toBe('ranging');
    expect(MarketRegime.HIGH_VOLATILITY).toBe('high_volatility');
    expect(MarketRegime.EXTREME).toBe('extreme');
  });
});

// ============================================
// RegimeEvent 枚举测试
// ============================================

describe('RegimeEvent 枚举 (from RegimeSwitchingStrategy)', () => {
  it('应该包含所有事件类型', () => {
    expect(RegimeEvent.REGIME_CHANGE).toBe('regime_change');
    expect(RegimeEvent.VOLATILITY_SPIKE).toBe('volatility_spike');
    expect(RegimeEvent.TREND_REVERSAL).toBe('trend_reversal');
    expect(RegimeEvent.EXTREME_DETECTED).toBe('extreme_detected');
  });
});
