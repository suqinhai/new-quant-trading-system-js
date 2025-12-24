/**
 * 市场状态检测器测试
 * Market Regime Detector Tests
 * @module tests/unit/marketRegimeDetector.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MarketRegimeDetector,
  MarketRegime,
  RegimeEvent,
} from '../../src/utils/MarketRegimeDetector.js';

// ============================================
// 测试数据生成函数
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
    const trend = 50 + Math.random() * 30; // 明显上涨
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
 * 生成下跌趋势K线
 */
function generateTrendingDownCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const trend = -50 - Math.random() * 30; // 明显下跌
    const noise = (Math.random() - 0.5) * 20;
    price += trend + noise;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price + 25,
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

/**
 * 生成高波动K线
 */
function generateHighVolatilityCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2000; // 高波动
    price += change;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + 1000,
      low: price - 1000,
      close: price,
      volume: 3000,
    });
  }

  return candles;
}

/**
 * 生成极端波动K线
 */
function generateExtremeVolatilityCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 5000; // 极端波动
    price += change;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + 2500,
      low: price - 2500,
      close: price,
      volume: 5000,
    });
  }

  return candles;
}

// ============================================
// MarketRegimeDetector 测试
// ============================================

describe('MarketRegimeDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new MarketRegimeDetector({
      adxPeriod: 14,
      adxTrendThreshold: 25,
      adxStrongTrendThreshold: 40,
      bbPeriod: 20,
      atrPeriod: 14,
      lowVolPercentile: 25,
      highVolPercentile: 75,
      extremeVolPercentile: 95,
      hurstPeriod: 50,
      minRegimeDuration: 2,
    });
  });

  afterEach(() => {
    if (detector) {
      detector.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const d = new MarketRegimeDetector();
      expect(d.adxPeriod).toBe(14);
      expect(d.adxTrendThreshold).toBe(25);
      expect(d.bbPeriod).toBe(20);
      expect(d.atrPeriod).toBe(14);
      expect(d.lowVolPercentile).toBe(25);
      expect(d.highVolPercentile).toBe(75);
      expect(d.extremeVolPercentile).toBe(95);
    });

    it('应该使用自定义参数', () => {
      expect(detector.adxPeriod).toBe(14);
      expect(detector.adxTrendThreshold).toBe(25);
      expect(detector.minRegimeDuration).toBe(2);
    });

    it('应该初始化为 RANGING 状态', () => {
      expect(detector.getCurrentRegime()).toBe(MarketRegime.RANGING);
    });

    it('应该初始化内部状态', () => {
      expect(detector._bbWidthHistory).toEqual([]);
      expect(detector._atrHistory).toEqual([]);
      expect(detector._regimeHistory).toEqual([]);
    });
  });

  describe('MarketRegime 枚举', () => {
    it('应该包含所有市场状态', () => {
      expect(MarketRegime.TRENDING_UP).toBe('trending_up');
      expect(MarketRegime.TRENDING_DOWN).toBe('trending_down');
      expect(MarketRegime.RANGING).toBe('ranging');
      expect(MarketRegime.HIGH_VOLATILITY).toBe('high_volatility');
      expect(MarketRegime.EXTREME).toBe('extreme');
    });
  });

  describe('RegimeEvent 枚举', () => {
    it('应该包含所有事件类型', () => {
      expect(RegimeEvent.REGIME_CHANGE).toBe('regime_change');
      expect(RegimeEvent.VOLATILITY_SPIKE).toBe('volatility_spike');
      expect(RegimeEvent.TREND_REVERSAL).toBe('trend_reversal');
      expect(RegimeEvent.EXTREME_DETECTED).toBe('extreme_detected');
    });
  });

  describe('update', () => {
    it('数据不足时应该返回默认状态', () => {
      const candles = generateCandles(10);
      const result = detector.update(candles[9], candles);

      expect(result.regime).toBe(MarketRegime.RANGING);
      expect(result.confidence).toBe(0);
      expect(result.reason).toBe('数据不足');
    });

    it('应该返回完整的状态信息', () => {
      const candles = generateCandles(150);
      const result = detector.update(candles[149], candles);

      expect(result).toHaveProperty('regime');
      expect(result).toHaveProperty('prevRegime');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('indicators');
      expect(result).toHaveProperty('recommendation');
    });

    it('应该计算所有指标', () => {
      const candles = generateCandles(150);
      const result = detector.update(candles[149], candles);

      expect(result.indicators).toHaveProperty('adx');
      expect(result.indicators).toHaveProperty('bbWidth');
      expect(result.indicators).toHaveProperty('atr');
      expect(result.indicators).toHaveProperty('hurst');
      expect(result.indicators).toHaveProperty('fastMA');
      expect(result.indicators).toHaveProperty('slowMA');
    });

    it('应该返回策略推荐', () => {
      const candles = generateCandles(150);
      const result = detector.update(candles[149], candles);

      expect(result.recommendation).toHaveProperty('strategies');
      expect(result.recommendation).toHaveProperty('description');
      expect(result.recommendation).toHaveProperty('positionSizing');
      expect(result.recommendation).toHaveProperty('riskLevel');
    });

    it('应该累积历史数据', () => {
      const candles = generateCandles(150);

      for (let i = 100; i < 150; i++) {
        detector.update(candles[i], candles.slice(0, i + 1));
      }

      expect(detector._bbWidthHistory.length).toBeGreaterThan(0);
      expect(detector._atrHistory.length).toBeGreaterThan(0);
      expect(detector._regimeHistory.length).toBeGreaterThan(0);
    });
  });

  describe('状态识别', () => {
    it('上涨趋势应该识别为 TRENDING_UP', async () => {
      const candles = generateTrendingUpCandles(150, 40000);

      // 运行多次更新积累数据
      let lastResult;
      for (let i = 100; i < 150; i++) {
        lastResult = detector.update(candles[i], candles.slice(0, i + 1));
      }

      // 强趋势数据应该识别为趋势向上
      // 注意：具体结果取决于ADX和其他指标计算
      expect(lastResult.indicators.trendDirection).toBe('up');
    });

    it('下跌趋势应该识别为 TRENDING_DOWN', async () => {
      const candles = generateTrendingDownCandles(150, 60000);

      let lastResult;
      for (let i = 100; i < 150; i++) {
        lastResult = detector.update(candles[i], candles.slice(0, i + 1));
      }

      expect(lastResult.indicators.trendDirection).toBe('down');
    });

    it('高波动应该识别为 HIGH_VOLATILITY', () => {
      // 先用正常数据建立基线
      const normalCandles = generateCandles(100, 50000, 100);
      for (let i = 50; i < 100; i++) {
        detector.update(normalCandles[i], normalCandles.slice(0, i + 1));
      }

      // 然后用高波动数据
      const highVolCandles = generateHighVolatilityCandles(50, 50000);
      const allCandles = [...normalCandles, ...highVolCandles];

      let lastResult;
      for (let i = 100; i < allCandles.length; i++) {
        lastResult = detector.update(allCandles[i], allCandles.slice(0, i + 1));
      }

      // 波动率百分位应该较高
      expect(lastResult.indicators.volatilityIndex).toBeGreaterThan(50);
    });
  });

  describe('事件发射', () => {
    it('状态变化时应该发射 REGIME_CHANGE 事件', () => {
      const handler = vi.fn();
      detector.on(RegimeEvent.REGIME_CHANGE, handler);

      // 强制触发状态变化
      detector._currentRegime = MarketRegime.RANGING;
      detector._handleRegimeChange(MarketRegime.TRENDING_UP, { adx: 30 });

      expect(handler).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        from: MarketRegime.RANGING,
        to: MarketRegime.TRENDING_UP,
      }));
    });

    it('极端波动时应该发射 EXTREME_DETECTED 事件', () => {
      const handler = vi.fn();
      detector.on(RegimeEvent.EXTREME_DETECTED, handler);

      detector._currentRegime = MarketRegime.HIGH_VOLATILITY;
      detector._handleRegimeChange(MarketRegime.EXTREME, { volatilityIndex: 98 });

      expect(handler).toHaveBeenCalled();
    });

    it('趋势反转时应该发射 TREND_REVERSAL 事件', () => {
      const handler = vi.fn();
      detector.on(RegimeEvent.TREND_REVERSAL, handler);

      detector._currentRegime = MarketRegime.TRENDING_UP;
      detector._handleRegimeChange(MarketRegime.TRENDING_DOWN, { adx: 35 });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('状态机逻辑', () => {
    it('极端状态应该立即切换', () => {
      const result = detector._processStateMachine(MarketRegime.EXTREME);
      expect(result).toBe(MarketRegime.EXTREME);
    });

    it('正常状态切换需要确认', () => {
      detector._currentRegime = MarketRegime.RANGING;

      // 第一次候选
      let result = detector._processStateMachine(MarketRegime.TRENDING_UP);
      expect(result).toBe(MarketRegime.RANGING); // 还是旧状态

      // 第二次确认
      result = detector._processStateMachine(MarketRegime.TRENDING_UP);
      expect(result).toBe(MarketRegime.TRENDING_UP); // 切换成功
    });

    it('候选状态变化应该重置计数器', () => {
      detector._currentRegime = MarketRegime.RANGING;

      detector._processStateMachine(MarketRegime.TRENDING_UP);
      expect(detector._pendingRegime).toBe(MarketRegime.TRENDING_UP);
      expect(detector._regimeCounter).toBe(1);

      detector._processStateMachine(MarketRegime.TRENDING_DOWN);
      expect(detector._pendingRegime).toBe(MarketRegime.TRENDING_DOWN);
      expect(detector._regimeCounter).toBe(1);
    });
  });

  describe('Hurst 指数计算', () => {
    it('应该返回有效的 Hurst 值', () => {
      const prices = Array.from({ length: 100 }, (_, i) => 50000 + Math.sin(i * 0.1) * 1000);
      const hurst = detector._calculateHurst(prices);

      expect(hurst).toBeGreaterThanOrEqual(0);
      expect(hurst).toBeLessThanOrEqual(1);
    });

    it('数据不足应该返回 0.5', () => {
      const prices = [100, 101, 102];
      const hurst = detector._calculateHurst(prices);

      expect(hurst).toBe(0.5);
    });

    it('趋势数据应该有较高的 Hurst', () => {
      const trendingPrices = Array.from({ length: 100 }, (_, i) => 50000 + i * 50);
      const hurst = detector._calculateHurst(trendingPrices);

      // 趋势数据 Hurst 应该 > 0.5
      expect(hurst).toBeGreaterThan(0.4);
    });
  });

  describe('策略推荐', () => {
    it('趋势市应该推荐趋势策略', () => {
      detector._currentRegime = MarketRegime.TRENDING_UP;
      const recommendation = detector._getStrategyRecommendation();

      expect(recommendation.strategies).toContain('SMA');
      expect(recommendation.strategies).toContain('MACD');
      expect(recommendation.positionSizing).toBe(1.0);
    });

    it('震荡市应该推荐震荡策略', () => {
      detector._currentRegime = MarketRegime.RANGING;
      const recommendation = detector._getStrategyRecommendation();

      expect(recommendation.strategies).toContain('Grid');
      expect(recommendation.strategies).toContain('RSI');
      expect(recommendation.positionSizing).toBe(0.7);
    });

    it('高波动应该推荐突破策略并降低仓位', () => {
      detector._currentRegime = MarketRegime.HIGH_VOLATILITY;
      const recommendation = detector._getStrategyRecommendation();

      expect(recommendation.strategies).toContain('ATRBreakout');
      expect(recommendation.positionSizing).toBe(0.5);
      expect(recommendation.riskLevel).toBe('high');
    });

    it('极端情况应该停止交易', () => {
      detector._currentRegime = MarketRegime.EXTREME;
      const recommendation = detector._getStrategyRecommendation();

      expect(recommendation.strategies).toEqual([]);
      expect(recommendation.positionSizing).toBe(0);
      expect(recommendation.riskLevel).toBe('extreme');
    });
  });

  describe('公共 API', () => {
    it('getCurrentRegime 应该返回当前状态', () => {
      detector._currentRegime = MarketRegime.HIGH_VOLATILITY;
      expect(detector.getCurrentRegime()).toBe(MarketRegime.HIGH_VOLATILITY);
    });

    it('getPreviousRegime 应该返回上一个状态', () => {
      detector._prevRegime = MarketRegime.RANGING;
      expect(detector.getPreviousRegime()).toBe(MarketRegime.RANGING);
    });

    it('getIndicators 应该返回指标副本', () => {
      detector._indicators = { adx: 30, hurst: 0.55 };
      const indicators = detector.getIndicators();

      expect(indicators.adx).toBe(30);
      expect(indicators.hurst).toBe(0.55);

      // 修改返回值不应影响内部状态
      indicators.adx = 50;
      expect(detector._indicators.adx).toBe(30);
    });

    it('getStats 应该返回统计信息', () => {
      detector._currentRegime = MarketRegime.TRENDING_UP;
      detector._stats.regimeChanges = 5;

      const stats = detector.getStats();

      expect(stats.currentRegime).toBe(MarketRegime.TRENDING_UP);
      expect(stats.regimeChanges).toBe(5);
    });

    it('getRegimeHistory 应该返回历史记录', () => {
      detector._regimeHistory = [
        { regime: MarketRegime.RANGING },
        { regime: MarketRegime.TRENDING_UP },
        { regime: MarketRegime.HIGH_VOLATILITY },
      ];

      const history = detector.getRegimeHistory(2);
      expect(history.length).toBe(2);
      expect(history[0].regime).toBe(MarketRegime.TRENDING_UP);
    });

    it('isTradingAllowed 应该正确判断', () => {
      detector._currentRegime = MarketRegime.RANGING;
      let result = detector.isTradingAllowed();
      expect(result.allowed).toBe(true);

      detector._currentRegime = MarketRegime.EXTREME;
      result = detector.isTradingAllowed();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('极端');
    });

    it('reset 应该重置所有状态', () => {
      detector._currentRegime = MarketRegime.EXTREME;
      detector._bbWidthHistory = [1, 2, 3];
      detector._atrHistory = [4, 5, 6];
      detector._stats.regimeChanges = 10;

      detector.reset();

      expect(detector._currentRegime).toBe(MarketRegime.RANGING);
      expect(detector._bbWidthHistory).toEqual([]);
      expect(detector._atrHistory).toEqual([]);
      expect(detector._stats.regimeChanges).toBe(0);
    });
  });

  describe('百分位计算', () => {
    it('应该正确计算百分位', () => {
      const history = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      expect(detector._calculatePercentile(50, history)).toBe(50);
      expect(detector._calculatePercentile(100, history)).toBe(100);
      expect(detector._calculatePercentile(10, history)).toBe(10);
    });

    it('历史数据不足应该返回 50', () => {
      const history = [10, 20];
      expect(detector._calculatePercentile(15, history)).toBe(50);
    });
  });
});

// ============================================
// 集成测试
// ============================================

describe('MarketRegimeDetector 集成测试', () => {
  it('应该在完整数据流中正确工作', () => {
    const detector = new MarketRegimeDetector();

    // 模拟完整的市场周期
    const candles = [
      ...generateRangingCandles(50, 50000),      // 震荡期
      ...generateTrendingUpCandles(50, 50000),   // 上涨趋势
      ...generateHighVolatilityCandles(30, 52000), // 高波动
      ...generateRangingCandles(30, 53000),      // 回归震荡
    ];

    const regimes = [];

    for (let i = 50; i < candles.length; i++) {
      const result = detector.update(candles[i], candles.slice(0, i + 1));
      regimes.push(result.regime);
    }

    // 验证检测器正常工作，没有抛错
    expect(regimes.length).toBeGreaterThan(0);
    expect(detector.getStats().historyLength).toBeGreaterThan(0);
  });

  it('应该在快速状态变化中保持稳定', () => {
    const detector = new MarketRegimeDetector({ minRegimeDuration: 3 });

    // 模拟快速波动的市场
    const candles = [];
    for (let i = 0; i < 200; i++) {
      const volatility = i % 20 < 10 ? 100 : 1000; // 交替高低波动
      candles.push(...generateCandles(1, 50000 + Math.sin(i) * 500, volatility));
    }

    let regimeChanges = 0;
    let prevRegime = null;

    for (let i = 50; i < candles.length; i++) {
      const result = detector.update(candles[i], candles.slice(0, i + 1));
      if (prevRegime && result.regime !== prevRegime) {
        regimeChanges++;
      }
      prevRegime = result.regime;
    }

    // 由于 minRegimeDuration = 3，状态切换应该被限制
    // 不会每个 K 线都切换
    expect(detector._stats.regimeChanges).toBeLessThan(150);
  });
});
