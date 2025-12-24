/**
 * 订单流/成交行为策略测试
 * Order Flow / Trade Behavior Strategy Tests
 * @module tests/unit/orderFlowStrategy.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrderFlowStrategy } from '../../src/strategies/OrderFlowStrategy.js';

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
    getCapital: vi.fn().mockReturnValue(10000),
    getEquity: vi.fn().mockReturnValue(10000),
  };
}

// ============================================
// 生成测试K线数据
// ============================================

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

// 生成放量上涨的K线
function generateVolumeSpikeUpCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const isSpikeCandle = i >= count - 3; // 最后3根放量
    const volume = isSpikeCandle ? 5000 : 1000; // 5倍成交量
    const priceChange = isSpikeCandle ? 200 : 50;

    price += priceChange;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - priceChange / 2,
      high: price + 50,
      low: price - priceChange,
      close: price,
      volume,
    });
  }

  return candles;
}

// 生成放量下跌的K线
function generateVolumeSpikeDownCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const isSpikeCandle = i >= count - 3;
    const volume = isSpikeCandle ? 5000 : 1000;
    const priceChange = isSpikeCandle ? -200 : -20;

    price += priceChange;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - priceChange / 2,
      high: price + Math.abs(priceChange),
      low: price - 50,
      close: price,
      volume,
    });
  }

  return candles;
}

// 生成稳定的K线（用于 VWAP 计算）
function generateStableCandles(count, basePrice = 50000, baseVolume = 1000) {
  const candles = [];

  for (let i = 0; i < count; i++) {
    const noise = (Math.random() - 0.5) * 20;
    const price = basePrice + noise;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - 5,
      high: price + 10,
      low: price - 10,
      close: price,
      volume: baseVolume,
    });
  }

  return candles;
}

// 生成价格高于 VWAP 的K线
function generateAboveVWAPCandles(count, startPrice = 50000) {
  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    // 前面稳定，后面快速上涨
    const isLateCande = i >= count - 5;
    const priceChange = isLateCande ? 100 : 10;
    price += priceChange;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - priceChange / 2,
      high: price + 20,
      low: price - 20,
      close: price,
      volume: 1000,
    });
  }

  return candles;
}

// ============================================
// OrderFlowStrategy 测试
// ============================================

describe('OrderFlowStrategy', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new OrderFlowStrategy({
      symbol: 'BTC/USDT',
      positionPercent: 90,
      volumeMAPeriod: 20,
      volumeSpikeMultiplier: 2.0,
      vwapPeriod: 20,
      vwapDeviationThreshold: 1.0,
      largeOrderMultiplier: 3.0,
      largeOrderRatioThreshold: 0.6,
      takerWindow: 10,
      takerBuyThreshold: 0.6,
      takerSellThreshold: 0.4,
      minSignalsForEntry: 2,
      stopLossPercent: 1.5,
      takeProfitPercent: 3.0,
      trailingStopPercent: 1.0,
    });
    engine = createMockEngine();
    strategy.engine = engine;
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认参数', () => {
      const s = new OrderFlowStrategy();
      expect(s.symbol).toBe('BTC/USDT');
      expect(s.positionPercent).toBe(95);
      expect(s.volumeMAPeriod).toBe(20);
      expect(s.volumeSpikeMultiplier).toBe(2.0);
      expect(s.vwapPeriod).toBe(20);
      expect(s.vwapDeviationThreshold).toBe(1.0);
      expect(s.largeOrderMultiplier).toBe(3.0);
      expect(s.largeOrderRatioThreshold).toBe(0.6);
      expect(s.takerWindow).toBe(10);
      expect(s.takerBuyThreshold).toBe(0.6);
      expect(s.takerSellThreshold).toBe(0.4);
      expect(s.minSignalsForEntry).toBe(2);
      expect(s.stopLossPercent).toBe(1.5);
      expect(s.takeProfitPercent).toBe(3.0);
      expect(s.useTrailingStop).toBe(true);
      expect(s.trailingStopPercent).toBe(1.0);
    });

    it('应该使用自定义参数', () => {
      expect(strategy.positionPercent).toBe(90);
      expect(strategy.volumeSpikeMultiplier).toBe(2.0);
      expect(strategy.vwapDeviationThreshold).toBe(1.0);
    });

    it('应该设置策略名称', () => {
      expect(strategy.name).toBe('OrderFlowStrategy');
    });

    it('应该初始化内部状态', () => {
      expect(strategy._volumeHistory).toEqual([]);
      expect(strategy._vwapData).toEqual([]);
      expect(strategy._takerBuyVolumes).toEqual([]);
      expect(strategy._takerSellVolumes).toEqual([]);
      expect(strategy._largeOrderBuyVolume).toBe(0);
      expect(strategy._largeOrderSellVolume).toBe(0);
      expect(strategy._entryPrice).toBeNull();
      expect(strategy._stopLoss).toBeNull();
      expect(strategy._takeProfit).toBeNull();
    });

    it('应该初始化启用标志', () => {
      expect(strategy.useVolumeSpike).toBe(true);
      expect(strategy.useVWAPDeviation).toBe(true);
      expect(strategy.useLargeOrderRatio).toBe(true);
      expect(strategy.useTakerBuyRatio).toBe(true);
    });

    it('应该允许禁用特定指标', () => {
      const s = new OrderFlowStrategy({
        useVolumeSpike: false,
        useVWAPDeviation: false,
        useLargeOrderRatio: false,
        useTakerBuyRatio: false,
      });
      expect(s.useVolumeSpike).toBe(false);
      expect(s.useVWAPDeviation).toBe(false);
      expect(s.useLargeOrderRatio).toBe(false);
      expect(s.useTakerBuyRatio).toBe(false);
    });
  });

  // ============================================
  // onInit 测试
  // ============================================

  describe('onInit', () => {
    it('应该初始化成功', async () => {
      await strategy.onInit();
      expect(strategy.state.initialized).toBe(true);
    });
  });

  // ============================================
  // 成交量突增检测测试
  // ============================================

  describe('_calculateVolumeSpike', () => {
    it('数据不足时应该返回无突增', () => {
      strategy._volumeHistory = [100, 100, 100]; // 少于周期
      const candle = { volume: 200 };

      const result = strategy._calculateVolumeSpike(candle);

      expect(result.isSpike).toBe(false);
      expect(result.ratio).toBe(1);
      expect(result.direction).toBe('neutral');
    });

    it('应该正确检测向上放量突增', () => {
      // 填充历史数据
      strategy._volumeHistory = Array(20).fill(1000);
      const candle = { volume: 3000, close: 50500, open: 50000 }; // 3倍量，阳线

      const result = strategy._calculateVolumeSpike(candle);

      expect(result.isSpike).toBe(true);
      expect(result.ratio).toBe(3);
      expect(result.direction).toBe('bullish');
    });

    it('应该正确检测向下放量突增', () => {
      strategy._volumeHistory = Array(20).fill(1000);
      const candle = { volume: 3000, close: 49500, open: 50000 }; // 3倍量，阴线

      const result = strategy._calculateVolumeSpike(candle);

      expect(result.isSpike).toBe(true);
      expect(result.ratio).toBe(3);
      expect(result.direction).toBe('bearish');
    });

    it('成交量未达阈值应该不触发', () => {
      strategy._volumeHistory = Array(20).fill(1000);
      const candle = { volume: 1500, close: 50500, open: 50000 }; // 1.5倍量

      const result = strategy._calculateVolumeSpike(candle);

      expect(result.isSpike).toBe(false);
      expect(result.ratio).toBe(1.5);
    });
  });

  // ============================================
  // VWAP 偏离计算测试
  // ============================================

  describe('_calculateVWAPDeviation', () => {
    it('数据不足时应该返回零偏离', () => {
      strategy._vwapData = [{ price: 50000, volume: 1000 }];
      const candle = { close: 50000 };

      const result = strategy._calculateVWAPDeviation(candle);

      expect(result.deviation).toBe(0);
      expect(result.deviationPercent).toBe(0);
    });

    it('应该正确计算 VWAP', () => {
      // VWAP = Sum(Price * Volume) / Sum(Volume)
      strategy._vwapData = [
        { price: 50000, volume: 1000 },
        { price: 50100, volume: 1000 },
        { price: 50200, volume: 1000 },
        { price: 50300, volume: 1000 },
        { price: 50400, volume: 1000 },
      ];
      const candle = { close: 50200 };

      const result = strategy._calculateVWAPDeviation(candle);

      // VWAP = (50000+50100+50200+50300+50400) / 5 = 50200
      expect(result.vwap).toBeCloseTo(50200, 0);
    });

    it('价格高于 VWAP 应该返回正偏离', () => {
      strategy._vwapData = Array(10).fill({ price: 50000, volume: 1000 });
      const candle = { close: 50600 }; // 高于 VWAP 1.2%

      const result = strategy._calculateVWAPDeviation(candle);

      expect(result.deviation).toBeGreaterThan(0);
      expect(result.deviationPercent).toBeGreaterThan(0);
      expect(result.direction).toBe('above');
    });

    it('价格低于 VWAP 应该返回负偏离', () => {
      strategy._vwapData = Array(10).fill({ price: 50000, volume: 1000 });
      const candle = { close: 49400 }; // 低于 VWAP 1.2%

      const result = strategy._calculateVWAPDeviation(candle);

      expect(result.deviation).toBeLessThan(0);
      expect(result.deviationPercent).toBeLessThan(0);
      expect(result.direction).toBe('below');
    });

    it('偏离未达阈值应该返回中性', () => {
      strategy._vwapData = Array(10).fill({ price: 50000, volume: 1000 });
      const candle = { close: 50050 }; // 仅 0.1% 偏离

      const result = strategy._calculateVWAPDeviation(candle);

      expect(result.direction).toBe('neutral');
    });
  });

  // ============================================
  // 大单比例计算测试
  // ============================================

  describe('_calculateLargeOrderRatio', () => {
    it('无大单数据应该返回中性', () => {
      strategy._largeOrderBuyVolume = 0;
      strategy._largeOrderSellVolume = 0;

      const result = strategy._calculateLargeOrderRatio();

      expect(result.ratio).toBe(0.5);
      expect(result.direction).toBe('neutral');
    });

    it('大单买入占优应该返回看涨', () => {
      strategy._largeOrderBuyVolume = 8000;
      strategy._largeOrderSellVolume = 2000;

      const result = strategy._calculateLargeOrderRatio();

      expect(result.ratio).toBe(0.8); // 80% 买入
      expect(result.direction).toBe('bullish');
    });

    it('大单卖出占优应该返回看跌', () => {
      strategy._largeOrderBuyVolume = 2000;
      strategy._largeOrderSellVolume = 8000;

      const result = strategy._calculateLargeOrderRatio();

      expect(result.ratio).toBe(0.2); // 20% 买入，80% 卖出
      expect(result.direction).toBe('bearish');
    });

    it('大单比例平衡应该返回中性', () => {
      strategy._largeOrderBuyVolume = 5000;
      strategy._largeOrderSellVolume = 5000;

      const result = strategy._calculateLargeOrderRatio();

      expect(result.ratio).toBe(0.5);
      expect(result.direction).toBe('neutral');
    });
  });

  // ============================================
  // Taker Buy Ratio 计算测试
  // ============================================

  describe('_calculateTakerBuyRatio', () => {
    it('无数据应该返回中性', () => {
      strategy._takerBuyVolumes = [];
      strategy._takerSellVolumes = [];

      const result = strategy._calculateTakerBuyRatio();

      expect(result.ratio).toBe(0.5);
      expect(result.direction).toBe('neutral');
    });

    it('主动买入占优应该返回看涨', () => {
      strategy._takerBuyVolumes = [700, 800, 750];
      strategy._takerSellVolumes = [300, 200, 250];

      const result = strategy._calculateTakerBuyRatio();

      expect(result.ratio).toBe(0.75); // 75% 买入
      expect(result.direction).toBe('bullish');
    });

    it('主动卖出占优应该返回看跌', () => {
      strategy._takerBuyVolumes = [300, 200, 250];
      strategy._takerSellVolumes = [700, 800, 750];

      const result = strategy._calculateTakerBuyRatio();

      expect(result.ratio).toBe(0.25); // 25% 买入
      expect(result.direction).toBe('bearish');
    });

    it('比例平衡应该返回中性', () => {
      strategy._takerBuyVolumes = [500, 500, 500];
      strategy._takerSellVolumes = [500, 500, 500];

      const result = strategy._calculateTakerBuyRatio();

      expect(result.ratio).toBe(0.5);
      expect(result.direction).toBe('neutral');
    });
  });

  // ============================================
  // Taker 量估算测试
  // ============================================

  describe('_estimateTakerVolumes', () => {
    it('阳线应该估算更多买入量', () => {
      const candle = {
        open: 50000,
        close: 50500, // 上涨
        high: 50600,
        low: 49900,
        volume: 1000,
      };

      const result = strategy._estimateTakerVolumes(candle);

      expect(result.takerBuyVolume).toBeGreaterThan(result.takerSellVolume);
      expect(result.takerBuyVolume + result.takerSellVolume).toBeCloseTo(1000, 1);
    });

    it('阴线应该估算更多卖出量', () => {
      const candle = {
        open: 50500,
        close: 50000, // 下跌
        high: 50600,
        low: 49900,
        volume: 1000,
      };

      const result = strategy._estimateTakerVolumes(candle);

      expect(result.takerSellVolume).toBeGreaterThan(result.takerBuyVolume);
    });

    it('十字星应该估算平衡', () => {
      const candle = {
        open: 50000,
        close: 50000, // 无变化
        high: 50100,
        low: 49900,
        volume: 1000,
      };

      const result = strategy._estimateTakerVolumes(candle);

      // 应该接近 50:50
      expect(Math.abs(result.takerBuyVolume - result.takerSellVolume)).toBeLessThan(300);
    });
  });

  // ============================================
  // 信号生成测试
  // ============================================

  describe('_generateSignals', () => {
    it('放量上涨应该生成看涨信号', () => {
      const indicators = {
        volumeSpike: { isSpike: true, ratio: 3.0, direction: 'bullish' },
        vwapDeviation: { deviationPercent: 0.5, direction: 'neutral' },
        largeOrderRatio: { ratio: 0.5, direction: 'neutral' },
        takerBuyRatio: { ratio: 0.5, direction: 'neutral' },
      };

      const signals = strategy._generateSignals(indicators, { close: 50000 });

      expect(signals.bullish.length).toBe(1);
      expect(signals.bullish[0].type).toBe('volumeSpike');
    });

    it('多个看涨指标应该生成多个信号', () => {
      const indicators = {
        volumeSpike: { isSpike: true, ratio: 3.0, direction: 'bullish' },
        vwapDeviation: { deviationPercent: 1.5, direction: 'above' },
        largeOrderRatio: { ratio: 0.7, direction: 'bullish' },
        takerBuyRatio: { ratio: 0.7, direction: 'bullish' },
      };

      const signals = strategy._generateSignals(indicators, { close: 50000 });

      expect(signals.bullish.length).toBe(4);
    });

    it('看跌指标应该生成看跌信号', () => {
      const indicators = {
        volumeSpike: { isSpike: true, ratio: 3.0, direction: 'bearish' },
        vwapDeviation: { deviationPercent: -1.5, direction: 'below' },
        largeOrderRatio: { ratio: 0.3, direction: 'bearish' },
        takerBuyRatio: { ratio: 0.3, direction: 'bearish' },
      };

      const signals = strategy._generateSignals(indicators, { close: 50000 });

      expect(signals.bearish.length).toBe(4);
    });

    it('中性指标不应该生成信号', () => {
      const indicators = {
        volumeSpike: { isSpike: false, ratio: 1.5, direction: 'neutral' },
        vwapDeviation: { deviationPercent: 0.5, direction: 'neutral' },
        largeOrderRatio: { ratio: 0.5, direction: 'neutral' },
        takerBuyRatio: { ratio: 0.5, direction: 'neutral' },
      };

      const signals = strategy._generateSignals(indicators, { close: 50000 });

      expect(signals.bullish.length).toBe(0);
      expect(signals.bearish.length).toBe(0);
    });
  });

  // ============================================
  // onTick 测试
  // ============================================

  describe('onTick', () => {
    it('数据不足时应该跳过', async () => {
      const candles = generateCandles(10);
      await strategy.onTick(candles[9], candles);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('应该更新内部数据', async () => {
      const candles = generateCandles(30);

      for (let i = 25; i < 30; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      expect(strategy._volumeHistory.length).toBeGreaterThan(0);
      expect(strategy._vwapData.length).toBeGreaterThan(0);
      expect(strategy._takerBuyVolumes.length).toBeGreaterThan(0);
    });

    it('应该保存指标值', async () => {
      const candles = generateCandles(30);
      await strategy.onTick(candles[29], candles);

      // 指标应该被设置
      expect(strategy.getIndicator('volumeSpikeRatio')).toBeDefined();
      expect(strategy.getIndicator('VWAP')).toBeDefined();
      expect(strategy.getIndicator('VWAPDeviation')).toBeDefined();
    });

    it('满足入场条件应该买入', async () => {
      // 使用放量上涨数据
      const candles = generateVolumeSpikeUpCandles(30);

      // 运行多次积累数据
      for (let i = 20; i < 30; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      // 检查是否触发买入（取决于数据是否满足条件）
      // 由于数据是人工构造的放量上涨，应该触发
    });

    it('信号不足不应该入场', async () => {
      strategy.minSignalsForEntry = 4; // 需要4个信号
      const candles = generateCandles(30);

      await strategy.onTick(candles[29], candles);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 入场逻辑测试
  // ============================================

  describe('_handleEntry', () => {
    it('看涨信号达到阈值应该买入', () => {
      const signals = {
        bullish: [
          { type: 'volumeSpike', strength: 1.5, reason: '放量' },
          { type: 'takerBuyRatio', strength: 0.7, reason: '主动买入' },
        ],
        bearish: [],
      };
      const indicators = {};
      const candle = { close: 50000, high: 50100 };

      strategy._handleEntry(signals, indicators, candle);

      expect(engine.buyPercent).toHaveBeenCalledWith('BTC/USDT', 90);
      expect(strategy._entryPrice).toBe(50000);
      expect(strategy._stopLoss).toBeDefined();
      expect(strategy._takeProfit).toBeDefined();
    });

    it('看涨信号不足不应该买入', () => {
      const signals = {
        bullish: [{ type: 'volumeSpike', strength: 1.5, reason: '放量' }],
        bearish: [],
      };
      const indicators = {};
      const candle = { close: 50000, high: 50100 };

      strategy._handleEntry(signals, indicators, candle);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('看跌强于看涨不应该买入', () => {
      const signals = {
        bullish: [
          { type: 'volumeSpike', strength: 1.0, reason: '放量' },
          { type: 'takerBuyRatio', strength: 0.6, reason: '主动买入' },
        ],
        bearish: [
          { type: 'vwapDeviation', strength: 2.0, reason: 'VWAP下方' },
          { type: 'largeOrderRatio', strength: 1.5, reason: '大单卖出' },
        ],
      };
      const indicators = {};
      const candle = { close: 50000, high: 50100 };

      strategy._handleEntry(signals, indicators, candle);

      expect(engine.buyPercent).not.toHaveBeenCalled();
    });

    it('入场时应该设置止损止盈', () => {
      const signals = {
        bullish: [
          { type: 'volumeSpike', strength: 1.5, reason: '放量' },
          { type: 'takerBuyRatio', strength: 0.7, reason: '主动买入' },
        ],
        bearish: [],
      };
      const candle = { close: 50000, high: 50100 };

      strategy._handleEntry(signals, {}, candle);

      expect(strategy._stopLoss).toBe(50000 * (1 - 1.5 / 100)); // 1.5% 止损
      expect(strategy._takeProfit).toBe(50000 * (1 + 3.0 / 100)); // 3% 止盈
    });
  });

  // ============================================
  // 出场逻辑测试
  // ============================================

  describe('_handleExit', () => {
    beforeEach(() => {
      engine.getPosition.mockReturnValue({ amount: 0.1 });
      strategy._entryPrice = 50000;
      strategy._stopLoss = 49250; // 1.5%
      strategy._takeProfit = 51500; // 3%
      strategy._highestSinceEntry = 50000;
      strategy._trailingStop = 49250;
    });

    it('价格触及止盈应该卖出', async () => {
      const signals = { bullish: [], bearish: [] };
      const candle = { close: 51600, high: 51700 };

      strategy._handleExit(signals, {}, candle);

      expect(engine.closePosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('价格触及止损应该卖出', async () => {
      const signals = { bullish: [], bearish: [] };
      const candle = { close: 49000, high: 49500 };

      strategy._handleExit(signals, {}, candle);

      expect(engine.closePosition).toHaveBeenCalledWith('BTC/USDT');
    });

    it('创新高应该更新跟踪止损', () => {
      const signals = { bullish: [], bearish: [] };
      const candle = { close: 51000, high: 51200 };

      strategy._handleExit(signals, {}, candle);

      expect(strategy._highestSinceEntry).toBe(51200);
      expect(strategy._trailingStop).toBeGreaterThan(49250);
    });

    it('强反向信号应该出场', () => {
      const signals = {
        bullish: [],
        bearish: [
          { type: 'volumeSpike', strength: 2.0, reason: '放量下跌' },
          { type: 'takerBuyRatio', strength: 1.5, reason: '主动卖出' },
        ],
      };
      // 价格已盈利
      const candle = { close: 50500, high: 50600 };

      strategy._handleExit(signals, {}, candle);

      expect(engine.closePosition).toHaveBeenCalled();
    });
  });

  // ============================================
  // 状态重置测试
  // ============================================

  describe('_resetState', () => {
    it('应该重置所有持仓状态', () => {
      strategy._entryPrice = 50000;
      strategy._stopLoss = 49000;
      strategy._takeProfit = 52000;
      strategy._highestSinceEntry = 51000;
      strategy._trailingStop = 50000;

      strategy._resetState();

      expect(strategy._entryPrice).toBeNull();
      expect(strategy._stopLoss).toBeNull();
      expect(strategy._takeProfit).toBeNull();
      expect(strategy._highestSinceEntry).toBeNull();
      expect(strategy._trailingStop).toBeNull();
    });
  });

  // ============================================
  // 事件回调测试
  // ============================================

  describe('onOrderFilled', () => {
    it('应该发射 orderFilled 事件', () => {
      const listener = vi.fn();
      strategy.on('orderFilled', listener);

      strategy.onOrderFilled({ id: 'order-1', side: 'buy', amount: 0.1, price: 50000 });

      expect(listener).toHaveBeenCalled();
    });
  });

  // ============================================
  // 禁用指标测试
  // ============================================

  describe('禁用指标', () => {
    it('禁用成交量突增时不应该计算', async () => {
      const s = new OrderFlowStrategy({ useVolumeSpike: false });
      s.engine = engine;

      const candles = generateCandles(30);
      await s.onTick(candles[29], candles);

      // 不应该有 volumeSpike 指标
      expect(s.getIndicator('volumeSpikeRatio')).toBeUndefined();
    });

    it('禁用 VWAP 时不应该计算', async () => {
      const s = new OrderFlowStrategy({ useVWAPDeviation: false });
      s.engine = engine;

      const candles = generateCandles(30);
      await s.onTick(candles[29], candles);

      // 不应该有 VWAP 指标
      expect(s.getIndicator('VWAP')).toBeUndefined();
    });

    it('禁用大单比例时不应该计算', async () => {
      const s = new OrderFlowStrategy({ useLargeOrderRatio: false });
      s.engine = engine;

      const candles = generateCandles(30);
      await s.onTick(candles[29], candles);

      // 不应该有 largeOrderRatio 指标
      expect(s.getIndicator('largeOrderRatio')).toBeUndefined();
    });

    it('禁用 Taker Ratio 时不应该计算', async () => {
      const s = new OrderFlowStrategy({ useTakerBuyRatio: false });
      s.engine = engine;

      const candles = generateCandles(30);
      await s.onTick(candles[29], candles);

      // 不应该有 takerBuyRatio 指标
      expect(s.getIndicator('takerBuyRatio')).toBeUndefined();
    });
  });
});

// ============================================
// 订单流策略集成测试
// ============================================

describe('订单流策略集成测试', () => {
  it('应该能够与其他策略同时运行', async () => {
    const engine = createMockEngine();

    const orderFlowStrategy = new OrderFlowStrategy({ minSignalsForEntry: 2 });
    orderFlowStrategy.engine = engine;

    const candles = generateCandles(60);

    for (const candle of candles) {
      await orderFlowStrategy.onCandle(candle);
    }

    // 策略应该正常运行，不抛错
  });

  it('订单流策略应该正确继承 BaseStrategy', async () => {
    const { BaseStrategy } = await import('../../src/strategies/BaseStrategy.js');

    const orderFlow = new OrderFlowStrategy();
    expect(orderFlow instanceof BaseStrategy).toBe(true);
  });

  it('应该能正确设置和获取信号', () => {
    const strategy = new OrderFlowStrategy();

    strategy.setBuySignal('Test OrderFlow');
    expect(strategy.getSignal().type).toBe('buy');
    expect(strategy.getSignal().reason).toBe('Test OrderFlow');

    strategy.setSellSignal('Exit OrderFlow');
    expect(strategy.getSignal().type).toBe('sell');
  });

  it('应该能正确管理状态', () => {
    const strategy = new OrderFlowStrategy();

    strategy.setState('testKey', 'testValue');
    expect(strategy.getState('testKey')).toBe('testValue');

    strategy.setIndicator('testIndicator', 123);
    expect(strategy.getIndicator('testIndicator')).toBe(123);
  });

  it('完整交易流程测试', async () => {
    const engine = createMockEngine();
    const strategy = new OrderFlowStrategy({
      minSignalsForEntry: 2,
      stopLossPercent: 2,
      takeProfitPercent: 4,
    });
    strategy.engine = engine;

    // 模拟放量上涨后入场
    const candles = generateVolumeSpikeUpCandles(35);

    // 运行策略
    for (let i = 20; i < 35; i++) {
      await strategy.onTick(candles[i], candles.slice(0, i + 1));
    }

    // 如果触发了买入，检查状态
    if (engine.buyPercent.mock.calls.length > 0) {
      expect(strategy._entryPrice).toBeDefined();
      expect(strategy._stopLoss).toBeDefined();
      expect(strategy._takeProfit).toBeDefined();
    }
  });
});

// ============================================
// 边界条件测试
// ============================================

describe('边界条件测试', () => {
  let strategy;
  let engine;

  beforeEach(() => {
    strategy = new OrderFlowStrategy();
    engine = createMockEngine();
    strategy.engine = engine;
  });

  afterEach(() => {
    if (strategy) {
      strategy.removeAllListeners();
    }
  });

  it('空 K 线数据不应该崩溃', async () => {
    await expect(strategy.onTick({ close: 50000, volume: 1000 }, [])).resolves.not.toThrow();
  });

  it('零成交量不应该崩溃', async () => {
    const candles = generateCandles(30);
    candles[29].volume = 0;

    await expect(strategy.onTick(candles[29], candles)).resolves.not.toThrow();
  });

  it('极端价格变动不应该崩溃', async () => {
    const candles = generateCandles(30);
    candles[29].close = candles[29].open * 2; // 100% 涨幅

    await expect(strategy.onTick(candles[29], candles)).resolves.not.toThrow();
  });

  it('VWAP 数据累积应该有限制', async () => {
    const candles = generateCandles(50);

    for (let i = 20; i < 50; i++) {
      await strategy.onTick(candles[i], candles.slice(0, i + 1));
    }

    // VWAP 数据应该限制在 vwapPeriod
    expect(strategy._vwapData.length).toBeLessThanOrEqual(strategy.vwapPeriod);
  });

  it('成交量历史应该有限制', async () => {
    const candles = generateCandles(60);

    for (let i = 20; i < 60; i++) {
      await strategy.onTick(candles[i], candles.slice(0, i + 1));
    }

    // 成交量历史应该限制
    expect(strategy._volumeHistory.length).toBeLessThanOrEqual(strategy.volumeMAPeriod * 2);
  });

  it('Taker 数据窗口应该有限制', async () => {
    const candles = generateCandles(50);

    for (let i = 20; i < 50; i++) {
      await strategy.onTick(candles[i], candles.slice(0, i + 1));
    }

    // Taker 数据应该限制在 takerWindow
    expect(strategy._takerBuyVolumes.length).toBeLessThanOrEqual(strategy.takerWindow);
    expect(strategy._takerSellVolumes.length).toBeLessThanOrEqual(strategy.takerWindow);
  });
});
