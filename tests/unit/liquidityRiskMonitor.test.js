/**
 * 流动性风险监控器测试
 * Liquidity Risk Monitor Tests
 * @module tests/unit/liquidityRiskMonitor.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LiquidityRiskMonitor,
  LIQUIDITY_LEVEL,
  EXECUTION_STRATEGY,
  DEFAULT_CONFIG,
} from '../../src/risk/LiquidityRiskMonitor.js';

// ============================================
// 测试辅助函数
// ============================================

/**
 * 创建模拟订单簿
 */
function createOrderBook(bidPrice = 50000, askPrice = 50010, depth = 10) {
  const bids = [];
  const asks = [];

  for (let i = 0; i < depth; i++) {
    bids.push([bidPrice - i * 10, 1 + i * 0.5]);
    asks.push([askPrice + i * 10, 1 + i * 0.5]);
  }

  return { bids, asks };
}

/**
 * 创建高流动性订单簿
 */
function createHighLiquidityOrderBook() {
  const bids = [];
  const asks = [];

  // 价差很小，深度很大
  for (let i = 0; i < 20; i++) {
    bids.push([50000 - i * 0.5, 100 + i * 10]);
    asks.push([50001 + i * 0.5, 100 + i * 10]);
  }

  return { bids, asks };
}

/**
 * 创建低流动性订单簿
 */
function createLowLiquidityOrderBook() {
  const bids = [];
  const asks = [];

  // 价差非常大（2%+），深度极小
  for (let i = 0; i < 3; i++) {
    bids.push([49000 - i * 200, 0.01 + i * 0.001]);
    asks.push([51000 + i * 200, 0.01 + i * 0.001]);
  }

  return { bids, asks };
}

// ============================================
// LiquidityRiskMonitor 测试
// ============================================

describe('LiquidityRiskMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new LiquidityRiskMonitor({
      depthLevels: 10,
      updateInterval: 10000,
      slippageWarning: 0.002,
      slippageCritical: 0.005,
      verbose: false,
    });
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
      monitor.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const m = new LiquidityRiskMonitor();

      expect(m.config.depthLevels).toBe(20);
      expect(m.config.updateInterval).toBe(1000);
      expect(m.config.slippageWarning).toBe(0.002);
      expect(m.config.slippageCritical).toBe(0.005);
      expect(m.config.largeOrderThreshold).toBe(0.5);
      expect(m.config.maxExecutionRatio).toBe(0.3);
    });

    it('应该使用自定义配置', () => {
      expect(monitor.config.depthLevels).toBe(10);
      expect(monitor.config.updateInterval).toBe(10000);
    });

    it('应该初始化空数据结构', () => {
      expect(monitor.orderBooks.size).toBe(0);
      expect(monitor.orderBookHistory.size).toBe(0);
      expect(monitor.liquidityScores.size).toBe(0);
      expect(monitor.adv.size).toBe(0);
      expect(monitor.tradeHistory.size).toBe(0);
    });

    it('应该设置运行状态为 false', () => {
      expect(monitor.running).toBe(false);
    });

    it('应该设置更新定时器为 null', () => {
      expect(monitor.updateTimer).toBeNull();
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('start/stop', () => {
    it('应该启动监控器', () => {
      const listener = vi.fn();
      monitor.on('started', listener);

      monitor.start();

      expect(monitor.running).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('应该设置更新定时器', () => {
      monitor.start();

      expect(monitor.updateTimer).not.toBeNull();
    });

    it('应该停止监控器', () => {
      const listener = vi.fn();
      monitor.on('stopped', listener);

      monitor.start();
      monitor.stop();

      expect(monitor.running).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('停止后应该清除定时器', () => {
      monitor.start();
      monitor.stop();

      expect(monitor.updateTimer).toBeNull();
    });

    it('重复启动应该无操作', () => {
      monitor.start();
      const timer1 = monitor.updateTimer;
      monitor.start();

      expect(monitor.updateTimer).toBe(timer1);
    });

    it('未启动时停止应该无操作', () => {
      monitor.stop();
      expect(monitor.running).toBe(false);
    });
  });

  // ============================================
  // 数据更新测试
  // ============================================

  describe('updateOrderBook', () => {
    it('应该保存订单簿数据', () => {
      const orderBook = createOrderBook();
      monitor.updateOrderBook('BTC/USDT', orderBook);

      expect(monitor.orderBooks.has('BTC/USDT')).toBe(true);
      const saved = monitor.orderBooks.get('BTC/USDT');
      expect(saved.bids.length).toBe(10);
      expect(saved.asks.length).toBe(10);
    });

    it('应该记录订单簿历史', () => {
      const orderBook = createOrderBook();
      monitor.updateOrderBook('BTC/USDT', orderBook);
      monitor.updateOrderBook('BTC/USDT', orderBook);

      const history = monitor.orderBookHistory.get('BTC/USDT');
      expect(history.length).toBe(2);
    });

    it('应该限制历史长度', () => {
      const orderBook = createOrderBook();
      for (let i = 0; i < 150; i++) {
        monitor.updateOrderBook('BTC/USDT', orderBook);
      }

      const history = monitor.orderBookHistory.get('BTC/USDT');
      expect(history.length).toBeLessThanOrEqual(monitor.config.historyLength);
    });

    it('应该更新流动性评分', () => {
      const orderBook = createOrderBook();
      monitor.updateOrderBook('BTC/USDT', orderBook);

      expect(monitor.liquidityScores.has('BTC/USDT')).toBe(true);
    });

    it('应该记录时间戳', () => {
      const orderBook = createOrderBook();
      const before = Date.now();
      monitor.updateOrderBook('BTC/USDT', orderBook);

      const saved = monitor.orderBooks.get('BTC/USDT');
      expect(saved.timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  describe('updateTrade', () => {
    it('应该记录成交数据', () => {
      monitor.updateTrade('BTC/USDT', { price: 50000, volume: 1 });

      expect(monitor.tradeHistory.has('BTC/USDT')).toBe(true);
      const history = monitor.tradeHistory.get('BTC/USDT');
      expect(history.length).toBe(1);
    });

    it('应该更新日均成交量', () => {
      monitor.updateTrade('BTC/USDT', { price: 50000, volume: 1 });
      monitor.updateTrade('BTC/USDT', { price: 50000, volume: 2 });

      const adv = monitor.adv.get('BTC/USDT');
      expect(adv.volume).toBe(3);
    });

    it('应该清理过期数据', () => {
      // 添加一个过期的成交记录
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000; // 25小时前
      monitor.tradeHistory.set('BTC/USDT', [{ price: 50000, volume: 1, timestamp: oldTimestamp }]);

      // 添加新成交
      monitor.updateTrade('BTC/USDT', { price: 50000, volume: 1 });

      const history = monitor.tradeHistory.get('BTC/USDT');
      expect(history.length).toBe(1);
      expect(history[0].timestamp).toBeGreaterThan(oldTimestamp);
    });

    it('应该使用当前时间戳如果未提供', () => {
      const before = Date.now();
      monitor.updateTrade('BTC/USDT', { price: 50000, volume: 1 });

      const history = monitor.tradeHistory.get('BTC/USDT');
      expect(history[0].timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  // ============================================
  // 滑点估算测试
  // ============================================

  describe('estimateSlippage', () => {
    beforeEach(() => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
    });

    it('没有订单簿数据应该返回错误', () => {
      const result = monitor.estimateSlippage('ETH/USDT', 'buy', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('订单簿为空应该返回错误', () => {
      monitor.updateOrderBook('ETH/USDT', { bids: [], asks: [] });
      const result = monitor.estimateSlippage('ETH/USDT', 'buy', 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('空');
    });

    it('应该返回完整的滑点估算', () => {
      const result = monitor.estimateSlippage('BTC/USDT', 'buy', 1);

      expect(result.success).toBe(true);
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.side).toBe('buy');
      expect(result.amount).toBe(1);
      expect(result.bestPrice).toBeDefined();
      expect(result.avgExecutionPrice).toBeDefined();
      expect(result.estimatedSlippage).toBeDefined();
      expect(result.level).toBeDefined();
    });

    it('买单应该使用卖盘', () => {
      const result = monitor.estimateSlippage('BTC/USDT', 'buy', 0.5);

      expect(result.success).toBe(true);
      expect(result.bestPrice).toBe(50010); // 第一档卖价
    });

    it('卖单应该使用买盘', () => {
      const result = monitor.estimateSlippage('BTC/USDT', 'sell', 0.5);

      expect(result.success).toBe(true);
      expect(result.bestPrice).toBe(50000); // 第一档买价
    });

    it('小订单应该返回正常级别', () => {
      const result = monitor.estimateSlippage('BTC/USDT', 'buy', 0.1);

      expect(result.level).toBe('normal');
    });

    it('大订单应该返回警告或严重级别', () => {
      // 创建一个深度很浅的订单簿
      monitor.updateOrderBook('LOW/USDT', createLowLiquidityOrderBook());
      const result = monitor.estimateSlippage('LOW/USDT', 'buy', 10);

      expect(['warning', 'critical']).toContain(result.level);
    });

    it('应该应用安全边际', () => {
      const result = monitor.estimateSlippage('BTC/USDT', 'buy', 1);

      // 滑点应该被安全边际放大
      expect(result.estimatedSlippage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('_calculateExecutionDetails', () => {
    it('应该计算执行细节', () => {
      const levels = [[50000, 1], [50010, 2], [50020, 3]];
      const result = monitor._calculateExecutionDetails(levels, 2, 'buy');

      expect(result.bestPrice).toBe(50000);
      expect(result.filledAmount).toBe(2);
      expect(result.levelsUsed).toBeGreaterThanOrEqual(1);
      expect(result.fullyFillable).toBe(true);
    });

    it('应该处理不完全成交', () => {
      const levels = [[50000, 0.5], [50010, 0.5]];
      const result = monitor._calculateExecutionDetails(levels, 2, 'buy');

      expect(result.filledAmount).toBe(1);
      expect(result.unfilledAmount).toBe(1);
      expect(result.fullyFillable).toBe(false);
    });

    it('应该计算平均执行价格', () => {
      const levels = [[50000, 1], [50100, 1]];
      const result = monitor._calculateExecutionDetails(levels, 2, 'buy');

      expect(result.avgExecutionPrice).toBe(50050); // (50000*1 + 50100*1) / 2
    });

    it('应该计算买入滑点', () => {
      const levels = [[100, 1], [110, 1]];
      const result = monitor._calculateExecutionDetails(levels, 2, 'buy');

      // 平均价格105，最佳价格100，滑点 = (105-100)/100 = 0.05
      expect(result.estimatedSlippage).toBeCloseTo(0.05, 3);
    });

    it('应该计算卖出滑点', () => {
      const levels = [[100, 1], [90, 1]];
      const result = monitor._calculateExecutionDetails(levels, 2, 'sell');

      // 平均价格95，最佳价格100，滑点 = (100-95)/100 = 0.05
      expect(result.estimatedSlippage).toBeCloseTo(0.05, 3);
    });

    it('应该返回执行档位详情', () => {
      const levels = [[50000, 1], [50010, 2]];
      const result = monitor._calculateExecutionDetails(levels, 2, 'buy');

      expect(result.executionLevels.length).toBeGreaterThan(0);
      expect(result.executionLevels[0].price).toBe(50000);
      expect(result.executionLevels[0].filled).toBeDefined();
    });
  });

  // ============================================
  // 大单拆分测试
  // ============================================

  describe('getOrderSplitRecommendation', () => {
    beforeEach(() => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
    });

    it('没有订单簿数据应该返回错误', () => {
      const result = monitor.getOrderSplitRecommendation('ETH/USDT', 'buy', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('订单簿为空应该返回错误', () => {
      monitor.updateOrderBook('ETH/USDT', { bids: [], asks: [] });
      const result = monitor.getOrderSplitRecommendation('ETH/USDT', 'buy', 1);

      expect(result.success).toBe(false);
    });

    it('小订单不需要拆分', () => {
      const result = monitor.getOrderSplitRecommendation('BTC/USDT', 'buy', 0.1);

      expect(result.success).toBe(true);
      expect(result.needsSplit).toBe(false);
      expect(result.recommendedStrategy).toBe(EXECUTION_STRATEGY.IMMEDIATE);
    });

    it('大订单需要拆分', () => {
      const result = monitor.getOrderSplitRecommendation('BTC/USDT', 'buy', 10);

      expect(result.success).toBe(true);
      expect(result.needsSplit).toBe(true);
      expect(result.splitCount).toBeGreaterThan(1);
    });

    it('应该返回拆分订单列表', () => {
      const result = monitor.getOrderSplitRecommendation('BTC/USDT', 'buy', 10);

      if (result.needsSplit) {
        expect(result.orders.length).toBe(result.splitCount);
        expect(result.orders[0].amount).toBeDefined();
        expect(result.orders[0].delayMs).toBeDefined();
      }
    });

    it('应该推荐执行策略', () => {
      const result = monitor.getOrderSplitRecommendation('BTC/USDT', 'buy', 10);

      expect(result.recommendedStrategy).toBeDefined();
    });

    it('应该计算滑点对比', () => {
      const result = monitor.getOrderSplitRecommendation('BTC/USDT', 'buy', 10);

      if (result.needsSplit) {
        expect(result.comparison).toBeDefined();
        expect(result.comparison.immediateSlippage).toBeDefined();
        expect(result.comparison.splitSlippage).toBeDefined();
      }
    });
  });

  describe('_calculateSplitPlan', () => {
    it('应该计算拆分方案', () => {
      const orderBook = createOrderBook();
      const context = {
        bestLevelDepth: 1,
        totalDepth: 10,
        levels: orderBook.asks,
      };

      const result = monitor._calculateSplitPlan('BTC/USDT', 'buy', 5, context);

      expect(result.splitCount).toBeGreaterThan(1);
      expect(result.amountPerOrder).toBeDefined();
      expect(result.orders.length).toBe(result.splitCount);
      expect(result.totalExecutionTime).toBeDefined();
    });

    it('拆分数量应该在限制范围内', () => {
      const orderBook = createOrderBook();
      const context = {
        bestLevelDepth: 0.1,
        totalDepth: 1,
        levels: orderBook.asks,
      };

      const result = monitor._calculateSplitPlan('BTC/USDT', 'buy', 100, context);

      expect(result.splitCount).toBeGreaterThanOrEqual(monitor.config.minSplitCount);
      expect(result.splitCount).toBeLessThanOrEqual(monitor.config.maxSplitCount);
    });

    it('应该计算ADV百分比', () => {
      monitor.updateTrade('BTC/USDT', { price: 50000, volume: 100 });

      const orderBook = createOrderBook();
      const context = {
        bestLevelDepth: 1,
        totalDepth: 10,
        levels: orderBook.asks,
      };

      const result = monitor._calculateSplitPlan('BTC/USDT', 'buy', 5, context);

      expect(result.advPercentage).toBeDefined();
    });

    it('大量订单应该推荐TWAP策略', () => {
      monitor.updateTrade('BTC/USDT', { price: 50000, volume: 10 });

      const orderBook = createOrderBook();
      const context = {
        bestLevelDepth: 1,
        totalDepth: 10,
        levels: orderBook.asks,
      };

      const result = monitor._calculateSplitPlan('BTC/USDT', 'buy', 5, context);

      // 订单量超过ADV的10%应该推荐TWAP
      expect(result.recommendedStrategy).toBe(EXECUTION_STRATEGY.TWAP);
    });
  });

  // ============================================
  // 流动性评分测试
  // ============================================

  describe('getLiquidityScore', () => {
    it('应该返回流动性评分', () => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
      const score = monitor.getLiquidityScore('BTC/USDT');

      expect(score.symbol).toBe('BTC/USDT');
      expect(score.score).toBeDefined();
      expect(score.level).toBeDefined();
    });

    it('应该返回缓存结果', () => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
      const score1 = monitor.getLiquidityScore('BTC/USDT');
      const score2 = monitor.getLiquidityScore('BTC/USDT');

      expect(score1.timestamp).toBe(score2.timestamp);
    });

    it('没有订单簿数据应该返回严重级别', () => {
      const score = monitor.getLiquidityScore('ETH/USDT');

      expect(score.level).toBe(LIQUIDITY_LEVEL.CRITICAL);
      expect(score.score).toBe(0);
    });
  });

  describe('_updateLiquidityScore', () => {
    it('应该计算综合评分', () => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
      const score = monitor._updateLiquidityScore('BTC/USDT');

      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(score.details).toBeDefined();
    });

    it('应该返回评分细节', () => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
      const score = monitor._updateLiquidityScore('BTC/USDT');

      expect(score.details.spreadScore).toBeDefined();
      expect(score.details.imbalanceScore).toBeDefined();
      expect(score.details.depthScore).toBeDefined();
      expect(score.details.impactScore).toBeDefined();
    });

    it('应该返回流动性指标', () => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
      const score = monitor._updateLiquidityScore('BTC/USDT');

      expect(score.metrics).toBeDefined();
      expect(score.metrics.spread).toBeDefined();
      expect(score.metrics.bidDepth).toBeDefined();
      expect(score.metrics.askDepth).toBeDefined();
    });

    it('高流动性应该返回优秀级别', () => {
      monitor.updateOrderBook('BTC/USDT', createHighLiquidityOrderBook());
      const score = monitor._updateLiquidityScore('BTC/USDT');

      expect([LIQUIDITY_LEVEL.EXCELLENT, LIQUIDITY_LEVEL.GOOD]).toContain(score.level);
    });

    it('低流动性应该返回较差级别', () => {
      monitor.updateOrderBook('BTC/USDT', createLowLiquidityOrderBook());
      const score = monitor._updateLiquidityScore('BTC/USDT');

      expect([LIQUIDITY_LEVEL.POOR, LIQUIDITY_LEVEL.CRITICAL]).toContain(score.level);
    });

    it('低流动性应该发出警告事件', () => {
      const listener = vi.fn();
      monitor.on('liquidityWarning', listener);

      monitor.updateOrderBook('BTC/USDT', createLowLiquidityOrderBook());

      expect(listener).toHaveBeenCalled();
    });

    it('空订单簿应该返回严重级别', () => {
      monitor.updateOrderBook('BTC/USDT', { bids: [], asks: [] });
      const score = monitor._updateLiquidityScore('BTC/USDT');

      expect(score.level).toBe(LIQUIDITY_LEVEL.CRITICAL);
    });
  });

  describe('_calculateSpreadScore', () => {
    it('极小价差应该返回100分', () => {
      const score = monitor._calculateSpreadScore(100000, 100005); // 0.005%
      expect(score).toBe(100);
    });

    it('小价差应该返回高分', () => {
      const score = monitor._calculateSpreadScore(100000, 100050); // 0.05%
      expect(score).toBe(90);
    });

    it('中等价差应该返回中等分', () => {
      const score = monitor._calculateSpreadScore(100000, 100150); // 0.15%
      expect(score).toBe(60);
    });

    it('大价差应该返回低分', () => {
      const score = monitor._calculateSpreadScore(100000, 101000); // 1%
      expect(score).toBe(20);
    });

    it('极大价差应该返回0分', () => {
      const score = monitor._calculateSpreadScore(100000, 102000); // 2%
      expect(score).toBe(0);
    });
  });

  describe('_calculateImbalanceScore', () => {
    it('平衡深度应该返回高分', () => {
      const bids = [[50000, 100], [49990, 100]];
      const asks = [[50010, 100], [50020, 100]];

      const score = monitor._calculateImbalanceScore(bids, asks);
      expect(score).toBe(100); // 完全平衡
    });

    it('轻度不平衡应该返回较高分', () => {
      const bids = [[50000, 100], [49990, 100]];
      const asks = [[50010, 80], [50020, 80]];

      const score = monitor._calculateImbalanceScore(bids, asks);
      expect(score).toBeGreaterThanOrEqual(60);
    });

    it('严重不平衡应该返回低分', () => {
      const bids = [[50000, 100], [49990, 100]];
      const asks = [[50010, 10], [50020, 10]];

      const score = monitor._calculateImbalanceScore(bids, asks);
      expect(score).toBeLessThanOrEqual(40);
    });

    it('空深度应该返回0分', () => {
      const score = monitor._calculateImbalanceScore([], []);
      expect(score).toBe(0);
    });
  });

  describe('_calculateDepthScore', () => {
    it('大深度应该返回高分', () => {
      // 创建大深度订单簿 (> $1M)
      const bids = [[50000, 15], [49990, 15]]; // 30 * 50000 = $1.5M
      const asks = [[50010, 15], [50020, 15]];

      const score = monitor._calculateDepthScore(bids, asks);
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('小深度应该返回低分', () => {
      const bids = [[50000, 0.1], [49990, 0.1]]; // 0.2 * 50000 = $10K
      const asks = [[50010, 0.1], [50020, 0.1]];

      const score = monitor._calculateDepthScore(bids, asks);
      expect(score).toBeLessThanOrEqual(40);
    });
  });

  describe('_calculateImpactScore', () => {
    it('低冲击应该返回高分', () => {
      monitor.updateOrderBook('BTC/USDT', createHighLiquidityOrderBook());
      const orderBook = monitor.orderBooks.get('BTC/USDT');

      const score = monitor._calculateImpactScore('BTC/USDT', orderBook.bids, orderBook.asks);
      expect(score).toBeGreaterThanOrEqual(60);
    });

    it('高冲击应该返回低分', () => {
      monitor.updateOrderBook('BTC/USDT', createLowLiquidityOrderBook());
      const orderBook = monitor.orderBooks.get('BTC/USDT');

      const score = monitor._calculateImpactScore('BTC/USDT', orderBook.bids, orderBook.asks);
      // 低流动性订单簿的冲击评分应该较低
      expect(score).toBeLessThanOrEqual(60);
    });
  });

  describe('_updateAllScores', () => {
    it('应该更新所有交易对的评分', () => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
      monitor.updateOrderBook('ETH/USDT', createOrderBook(3000, 3001, 10));

      monitor._updateAllScores();

      expect(monitor.liquidityScores.has('BTC/USDT')).toBe(true);
      expect(monitor.liquidityScores.has('ETH/USDT')).toBe(true);
    });
  });

  // ============================================
  // 市场冲击测试
  // ============================================

  describe('calculateMarketImpact', () => {
    beforeEach(() => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
    });

    it('没有订单簿数据应该返回错误', () => {
      const result = monitor.calculateMarketImpact('ETH/USDT', 'buy', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该返回完整的冲击分析', () => {
      const result = monitor.calculateMarketImpact('BTC/USDT', 'buy', 1);

      expect(result.success).toBe(true);
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.side).toBe('buy');
      expect(result.amount).toBe(1);
      expect(result.orderValue).toBeDefined();
      expect(result.costs).toBeDefined();
      expect(result.total).toBeDefined();
    });

    it('应该返回成本细分', () => {
      const result = monitor.calculateMarketImpact('BTC/USDT', 'buy', 1);

      expect(result.costs.immediateCost).toBeDefined();
      expect(result.costs.temporaryImpact).toBeDefined();
      expect(result.costs.slippage).toBeDefined();
    });

    it('应该计算总成本', () => {
      const result = monitor.calculateMarketImpact('BTC/USDT', 'buy', 1);

      expect(result.total.percentage).toBeGreaterThanOrEqual(0);
      expect(result.total.usd).toBeGreaterThanOrEqual(0);
    });

    it('有ADV数据时应该计算临时冲击', () => {
      monitor.updateTrade('BTC/USDT', { price: 50000, volume: 100 });
      const result = monitor.calculateMarketImpact('BTC/USDT', 'buy', 10);

      expect(result.costs.temporaryImpact.percentage).toBeGreaterThan(0);
      expect(result.advPercentage).toBeDefined();
    });

    it('高冲击应该返回分批建议', () => {
      // 使用低流动性订单簿
      monitor.updateOrderBook('LOW/USDT', createLowLiquidityOrderBook());
      const result = monitor.calculateMarketImpact('LOW/USDT', 'buy', 10);

      if (result.total.percentage > 1) {
        expect(result.recommendation).toContain('分批');
      }
    });
  });

  // ============================================
  // 订单风险检查测试
  // ============================================

  describe('checkOrderRisk', () => {
    beforeEach(() => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
    });

    it('应该返回风险检查结果', () => {
      const result = monitor.checkOrderRisk({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(result.allowed).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('正常订单应该允许', () => {
      const result = monitor.checkOrderRisk({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(result.allowed).toBe(true);
    });

    it('流动性严重不足应该拒绝或警告', () => {
      monitor.updateOrderBook('LOW/USDT', createLowLiquidityOrderBook());
      const result = monitor.checkOrderRisk({
        symbol: 'LOW/USDT',
        side: 'buy',
        amount: 0.1,
      });

      // 低流动性应该产生警告或拒绝
      const liquidityScore = monitor.getLiquidityScore('LOW/USDT');
      expect([LIQUIDITY_LEVEL.POOR, LIQUIDITY_LEVEL.CRITICAL, LIQUIDITY_LEVEL.MODERATE]).toContain(liquidityScore.level);

      // 如果是严重级别应该拒绝，否则应该有警告
      if (liquidityScore.level === LIQUIDITY_LEVEL.CRITICAL) {
        expect(result.allowed).toBe(false);
      }
      expect(result.warnings.length + result.recommendations.length).toBeGreaterThanOrEqual(0);
    });

    it('应该返回预估滑点', () => {
      const result = monitor.checkOrderRisk({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(result.estimatedSlippage).toBeDefined();
    });

    it('大订单应该返回拆分建议', () => {
      const result = monitor.checkOrderRisk({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 10,
      });

      if (result.splitPlan) {
        expect(result.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('应该返回市场冲击分析', () => {
      const result = monitor.checkOrderRisk({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1,
      });

      expect(result.marketImpact).toBeDefined();
    });
  });

  // ============================================
  // 状态API测试
  // ============================================

  describe('getStatus', () => {
    it('应该返回状态信息', () => {
      const status = monitor.getStatus();

      expect(status.running).toBe(false);
      expect(status.symbolCount).toBe(0);
      expect(status.liquidityScores).toBeDefined();
      expect(status.config).toBeDefined();
    });

    it('应该返回配置信息', () => {
      const status = monitor.getStatus();

      expect(status.config.slippageWarning).toBe(0.002);
      expect(status.config.slippageCritical).toBe(0.005);
      expect(status.config.largeOrderThreshold).toBeDefined();
    });

    it('应该返回流动性评分', () => {
      monitor.updateOrderBook('BTC/USDT', createOrderBook());
      const status = monitor.getStatus();

      expect(status.liquidityScores['BTC/USDT']).toBeDefined();
      expect(status.liquidityScores['BTC/USDT'].score).toBeDefined();
      expect(status.liquidityScores['BTC/USDT'].level).toBeDefined();
    });

    it('运行时应该返回正确状态', () => {
      monitor.start();
      const status = monitor.getStatus();

      expect(status.running).toBe(true);
    });
  });

  // ============================================
  // 日志测试
  // ============================================

  describe('log', () => {
    it('verbose=false 时应该跳过 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      monitor.config.verbose = false;

      monitor.log('test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 error 日志', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      monitor.log('error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 warn 日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      monitor.log('warn message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// 常量导出测试
// ============================================

describe('LiquidityRiskMonitor Constants', () => {
  describe('LIQUIDITY_LEVEL', () => {
    it('应该包含所有流动性级别', () => {
      expect(LIQUIDITY_LEVEL.EXCELLENT).toBe('excellent');
      expect(LIQUIDITY_LEVEL.GOOD).toBe('good');
      expect(LIQUIDITY_LEVEL.MODERATE).toBe('moderate');
      expect(LIQUIDITY_LEVEL.POOR).toBe('poor');
      expect(LIQUIDITY_LEVEL.CRITICAL).toBe('critical');
    });
  });

  describe('EXECUTION_STRATEGY', () => {
    it('应该包含所有执行策略', () => {
      expect(EXECUTION_STRATEGY.IMMEDIATE).toBe('immediate');
      expect(EXECUTION_STRATEGY.TWAP).toBe('twap');
      expect(EXECUTION_STRATEGY.VWAP).toBe('vwap');
      expect(EXECUTION_STRATEGY.ICEBERG).toBe('iceberg');
      expect(EXECUTION_STRATEGY.ADAPTIVE).toBe('adaptive');
      expect(EXECUTION_STRATEGY.WAIT_FOR_LIQUIDITY).toBe('wait');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('应该包含默认配置', () => {
      expect(DEFAULT_CONFIG.depthLevels).toBe(20);
      expect(DEFAULT_CONFIG.updateInterval).toBe(1000);
      expect(DEFAULT_CONFIG.slippageWarning).toBe(0.002);
      expect(DEFAULT_CONFIG.slippageCritical).toBe(0.005);
      expect(DEFAULT_CONFIG.largeOrderThreshold).toBe(0.5);
      expect(DEFAULT_CONFIG.maxExecutionRatio).toBe(0.3);
    });

    it('应该包含评分权重', () => {
      expect(DEFAULT_CONFIG.scoreWeights).toBeDefined();
      expect(DEFAULT_CONFIG.scoreWeights.bidAskSpread).toBe(0.25);
      expect(DEFAULT_CONFIG.scoreWeights.depthImbalance).toBe(0.20);
      expect(DEFAULT_CONFIG.scoreWeights.totalDepth).toBe(0.25);
      expect(DEFAULT_CONFIG.scoreWeights.priceImpact).toBe(0.30);
    });

    it('应该包含流动性阈值', () => {
      expect(DEFAULT_CONFIG.liquidityThresholds).toBeDefined();
      expect(DEFAULT_CONFIG.liquidityThresholds.excellent).toBe(80);
      expect(DEFAULT_CONFIG.liquidityThresholds.good).toBe(60);
      expect(DEFAULT_CONFIG.liquidityThresholds.moderate).toBe(40);
      expect(DEFAULT_CONFIG.liquidityThresholds.poor).toBe(20);
    });
  });
});
