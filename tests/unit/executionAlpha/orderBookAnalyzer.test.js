/**
 * OrderBookAnalyzer 盘口分析器测试
 * Order Book Analyzer Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OrderBookAnalyzer,
  LIQUIDITY_LEVEL,
  PRESSURE_DIRECTION,
  DEFAULT_CONFIG,
} from '../../../src/executor/executionAlpha/OrderBookAnalyzer.js';

// 趋势方向常量（本地定义，因为未从模块导出）/ Trend direction constants (local since not exported)
const TREND_DIRECTION = {
  BULLISH: 'bullish',
  BEARISH: 'bearish',
  NEUTRAL: 'neutral',
};

// 创建模拟盘口数据
function createMockOrderBook(options = {}) {
  const {
    bidPrice = 100,
    askPrice = 101,
    bidDepthLevels = 10,
    askDepthLevels = 10,
    volumePerLevel = 10,
  } = options;

  const bids = [];
  const asks = [];

  for (let i = 0; i < bidDepthLevels; i++) {
    bids.push([bidPrice - i * 0.1, volumePerLevel + Math.random() * 5]);
  }

  for (let i = 0; i < askDepthLevels; i++) {
    asks.push([askPrice + i * 0.1, volumePerLevel + Math.random() * 5]);
  }

  return { bids, asks, timestamp: Date.now() };
}

describe('OrderBookAnalyzer 常量导出', () => {
  it('应该导出 LIQUIDITY_LEVEL', () => {
    expect(LIQUIDITY_LEVEL.VERY_HIGH).toBe('very_high');
    expect(LIQUIDITY_LEVEL.HIGH).toBe('high');
    expect(LIQUIDITY_LEVEL.MEDIUM).toBe('medium');
    expect(LIQUIDITY_LEVEL.LOW).toBe('low');
    expect(LIQUIDITY_LEVEL.VERY_LOW).toBe('very_low');
  });

  it('应该导出 PRESSURE_DIRECTION', () => {
    expect(PRESSURE_DIRECTION.BUY).toBe('buy');
    expect(PRESSURE_DIRECTION.SELL).toBe('sell');
    expect(PRESSURE_DIRECTION.NEUTRAL).toBe('neutral');
  });

  it('应该导出 DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.depthLevels).toBeDefined();
    expect(DEFAULT_CONFIG.cacheTime).toBeDefined();
    expect(DEFAULT_CONFIG.impactCostThresholds).toBeDefined();
  });
});

describe('OrderBookAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new OrderBookAnalyzer({
      verbose: false,
      updateThrottle: 0, // 禁用节流以便测试
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(analyzer.orderBookCache).toBeInstanceOf(Map);
      expect(analyzer.historicalSnapshots).toBeInstanceOf(Map);
      expect(analyzer.dailyVolumeCache).toBeInstanceOf(Map);
    });

    it('应该合并自定义配置', () => {
      const customAnalyzer = new OrderBookAnalyzer({
        depthLevels: 50,
        verbose: false,
      });
      expect(customAnalyzer.config.depthLevels).toBe(50);
    });
  });

  describe('updateOrderBook', () => {
    it('应该更新盘口数据', () => {
      const orderBook = createMockOrderBook();
      analyzer.updateOrderBook('BTC/USDT', orderBook);

      const cached = analyzer.getCachedOrderBook('BTC/USDT');
      expect(cached).not.toBeNull();
      expect(cached.bids).toBeDefined();
      expect(cached.asks).toBeDefined();
    });

    it('应该触发 orderBookUpdated 事件', () => {
      const eventSpy = vi.fn();
      analyzer.on('orderBookUpdated', eventSpy);

      const orderBook = createMockOrderBook();
      analyzer.updateOrderBook('BTC/USDT', orderBook);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该保存历史数据', () => {
      const orderBook = createMockOrderBook();
      analyzer.updateOrderBook('BTC/USDT', orderBook);

      const history = analyzer.historicalSnapshots.get('BTC/USDT');
      expect(history).toBeDefined();
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeDepth', () => {
    it('应该分析盘口深度', () => {
      const orderBook = createMockOrderBook();
      analyzer.updateOrderBook('BTC/USDT', orderBook);

      const analysis = analyzer.analyzeDepth(orderBook, 'BTC/USDT');

      expect(analysis.bestBid).toBeDefined();
      expect(analysis.bestAsk).toBeDefined();
      expect(analysis.spread).toBeDefined();
      expect(analysis.midPrice).toBeDefined();
      expect(analysis.bidDepth).toBeDefined();
      expect(analysis.askDepth).toBeDefined();
    });

    it('应该计算正确的价差', () => {
      const orderBook = createMockOrderBook({ bidPrice: 100, askPrice: 101 });
      const analysis = analyzer.analyzeDepth(orderBook, 'BTC/USDT');

      expect(analysis.spread).toBeCloseTo(0.01, 2); // 1%
    });

    it('应该计算盘口深度总量', () => {
      const orderBook = createMockOrderBook({
        bidDepthLevels: 5,
        askDepthLevels: 5,
        volumePerLevel: 10,
      });
      const analysis = analyzer.analyzeDepth(orderBook, 'BTC/USDT');

      expect(analysis.bidDepth.totalVolume).toBeGreaterThan(0);
      expect(analysis.askDepth.totalVolume).toBeGreaterThan(0);
    });

    it('应该计算买卖比率', () => {
      const orderBook = createMockOrderBook();
      const analysis = analyzer.analyzeDepth(orderBook, 'BTC/USDT');

      expect(analysis.pressure).toBeDefined();
      expect(analysis.pressure.ratio).toBeGreaterThan(0);
    });
  });

  describe('assessLiquidity', () => {
    beforeEach(() => {
      const orderBook = createMockOrderBook({
        volumePerLevel: 100,
        bidDepthLevels: 20,
        askDepthLevels: 20,
      });
      analyzer.updateOrderBook('BTC/USDT', orderBook);
      analyzer.updateDailyVolume('BTC/USDT', 10000);
    });

    it('应该评估流动性等级', () => {
      const orderBook = analyzer.getCachedOrderBook('BTC/USDT');
      const depthAnalysis = analyzer.analyzeDepth(orderBook, 'BTC/USDT');
      const assessment = analyzer.assessLiquidity('BTC/USDT', 10, depthAnalysis);

      expect(assessment.level).toBeDefined();
      expect(Object.values(LIQUIDITY_LEVEL)).toContain(assessment.level);
    });

    it('应该根据订单大小评估流动性', () => {
      const orderBook = analyzer.getCachedOrderBook('BTC/USDT');
      const depthAnalysis = analyzer.analyzeDepth(orderBook, 'BTC/USDT');

      // 小订单应该有更高的流动性评估（更低的风险等级）
      const smallOrder = analyzer.assessLiquidity('BTC/USDT', 1, depthAnalysis);
      const largeOrder = analyzer.assessLiquidity('BTC/USDT', 1000, depthAnalysis);

      expect(smallOrder.riskLevel).toBeLessThanOrEqual(largeOrder.riskLevel);
    });

    it('应该提供执行建议', () => {
      const orderBook = analyzer.getCachedOrderBook('BTC/USDT');
      const depthAnalysis = analyzer.analyzeDepth(orderBook, 'BTC/USDT');
      const assessment = analyzer.assessLiquidity('BTC/USDT', 10, depthAnalysis);

      expect(assessment.recommendations).toBeDefined();
    });
  });

  describe('estimateImpactCost', () => {
    beforeEach(() => {
      const orderBook = createMockOrderBook({
        volumePerLevel: 50,
        bidDepthLevels: 20,
        askDepthLevels: 20,
      });
      analyzer.updateOrderBook('BTC/USDT', orderBook);
    });

    it('应该估算买单的冲击成本', () => {
      const orderBook = analyzer.getCachedOrderBook('BTC/USDT');
      const impact = analyzer.estimateImpactCost('BTC/USDT', 'buy', 100, orderBook);

      expect(impact.impactBps).toBeDefined();
      expect(impact.filledSize).toBeDefined();
      expect(impact.estimatedPrice).toBeDefined();
      expect(impact.impactLevel).toBeDefined();
    });

    it('应该估算卖单的冲击成本', () => {
      const orderBook = analyzer.getCachedOrderBook('BTC/USDT');
      const impact = analyzer.estimateImpactCost('BTC/USDT', 'sell', 100, orderBook);

      expect(impact.impactBps).toBeDefined();
      expect(impact.filledSize).toBeDefined();
    });

    it('大订单应该有更高的冲击成本', () => {
      const orderBook = analyzer.getCachedOrderBook('BTC/USDT');
      const smallImpact = analyzer.estimateImpactCost('BTC/USDT', 'buy', 10, orderBook);
      const largeImpact = analyzer.estimateImpactCost('BTC/USDT', 'buy', 500, orderBook);

      expect(largeImpact.impactBps).toBeGreaterThanOrEqual(smallImpact.impactBps);
    });

    it('应该处理部分成交情况', () => {
      const orderBook = createMockOrderBook({
        volumePerLevel: 10,
        askDepthLevels: 5,
      });
      analyzer.updateOrderBook('TEST/USDT', orderBook);

      const cachedBook = analyzer.getCachedOrderBook('TEST/USDT');
      const impact = analyzer.estimateImpactCost('TEST/USDT', 'buy', 1000, cachedBook);

      // 流动性不足时应该有部分成交
      expect(impact.filledSize).toBeLessThanOrEqual(1000);
    });
  });

  describe('analyzeTrend', () => {
    it('应该分析盘口趋势', async () => {
      // 添加多个历史数据点
      for (let i = 0; i < 10; i++) {
        const orderBook = createMockOrderBook({
          bidPrice: 100 + i * 0.5,
          askPrice: 101 + i * 0.5,
        });
        analyzer.updateOrderBook('BTC/USDT', orderBook);
        await new Promise(r => setTimeout(r, 10));
      }

      const trend = analyzer.analyzeTrend('BTC/USDT', 60000);

      expect(trend.trendDirection).toBeDefined();
      expect(['bullish', 'bearish', 'neutral']).toContain(trend.trendDirection);
    });

    it('应该在数据不足时返回 hasTrend: false', () => {
      const trend = analyzer.analyzeTrend('UNKNOWN/USDT', 60000);
      expect(trend.hasTrend).toBe(false);
    });
  });

  describe('updateDailyVolume', () => {
    it('应该更新日均成交量', () => {
      analyzer.updateDailyVolume('BTC/USDT', 100000);

      expect(analyzer.dailyVolumeCache.get('BTC/USDT')).toBe(100000);
    });
  });

  describe('getCachedOrderBook', () => {
    it('应该返回缓存的盘口', () => {
      const orderBook = createMockOrderBook();
      analyzer.updateOrderBook('BTC/USDT', orderBook);

      const cached = analyzer.getCachedOrderBook('BTC/USDT');
      expect(cached).not.toBeNull();
    });

    it('应该对不存在的交易对返回 null', () => {
      const cached = analyzer.getCachedOrderBook('UNKNOWN/USDT');
      expect(cached).toBeNull();
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      const orderBook = createMockOrderBook();
      analyzer.updateOrderBook('BTC/USDT', orderBook);

      const stats = analyzer.getStats();

      expect(stats.cachedSymbols).toBe(1);
      expect(stats.impactEstimations).toBeDefined();
    });
  });

  describe('事件', () => {
    it('应该继承 EventEmitter', () => {
      expect(typeof analyzer.on).toBe('function');
      expect(typeof analyzer.emit).toBe('function');
      expect(typeof analyzer.removeListener).toBe('function');
    });
  });
});
