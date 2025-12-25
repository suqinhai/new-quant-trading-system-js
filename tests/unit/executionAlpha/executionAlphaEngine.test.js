/**
 * ExecutionAlphaEngine 执行 Alpha 引擎测试
 * Execution Alpha Engine Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExecutionAlphaEngine,
  EXECUTION_STRATEGY,
  ORDER_SIZE_CLASS,
  DEFAULT_CONFIG,
} from '../../../src/executor/executionAlpha/ExecutionAlphaEngine.js';
import { LIQUIDITY_LEVEL } from '../../../src/executor/executionAlpha/OrderBookAnalyzer.js';
import { SLIPPAGE_RISK } from '../../../src/executor/executionAlpha/SlippageAnalyzer.js';

// 创建模拟订单执行器
function createMockOrderExecutor() {
  return {
    executeSmartLimitOrder: vi.fn().mockImplementation(async (params) => {
      return {
        success: true,
        orderInfo: {
          orderId: `order_${Date.now()}`,
          filledAmount: params.amount,
          avgPrice: params.price || 100,
        },
      };
    }),
    cancelOrder: vi.fn().mockResolvedValue({ success: true }),
  };
}

describe('ExecutionAlphaEngine 常量导出', () => {
  it('应该导出 EXECUTION_STRATEGY', () => {
    expect(EXECUTION_STRATEGY.DIRECT).toBe('direct');
    expect(EXECUTION_STRATEGY.TWAP).toBe('twap');
    expect(EXECUTION_STRATEGY.VWAP).toBe('vwap');
    expect(EXECUTION_STRATEGY.ICEBERG).toBe('iceberg');
    expect(EXECUTION_STRATEGY.ADAPTIVE).toBe('adaptive');
    expect(EXECUTION_STRATEGY.AUTO).toBe('auto');
  });

  it('应该导出 ORDER_SIZE_CLASS', () => {
    expect(ORDER_SIZE_CLASS.TINY).toBe('tiny');
    expect(ORDER_SIZE_CLASS.SMALL).toBe('small');
    expect(ORDER_SIZE_CLASS.MEDIUM).toBe('medium');
    expect(ORDER_SIZE_CLASS.LARGE).toBe('large');
    expect(ORDER_SIZE_CLASS.VERY_LARGE).toBe('very_large');
  });

  it('应该导出 DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.sizeClassThresholds).toBeDefined();
    expect(DEFAULT_CONFIG.strategyWeights).toBeDefined();
    expect(DEFAULT_CONFIG.defaultTWAPDuration).toBeDefined();
  });
});

describe('ExecutionAlphaEngine', () => {
  let engine;
  let mockOrderExecutor;

  beforeEach(() => {
    mockOrderExecutor = createMockOrderExecutor();

    engine = new ExecutionAlphaEngine({
      verbose: false,
      defaultTWAPDuration: 1000, // 短时间以便测试
      defaultSliceCount: 2,
      enableAutoDelay: false, // 禁用自动延迟以便测试
    });
  });

  afterEach(() => {
    // 清理活跃任务
    engine.activeTasks.clear();
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(engine.activeTasks).toBeInstanceOf(Map);
      expect(engine.executionHistory).toEqual([]);
      expect(engine.dailyVolumeCache).toBeInstanceOf(Map);
      expect(engine.stats.totalExecutions).toBe(0);
    });

    it('应该初始化子组件', () => {
      expect(engine.orderBookAnalyzer).toBeDefined();
      expect(engine.twapVwapExecutor).toBeDefined();
      expect(engine.icebergExecutor).toBeDefined();
      expect(engine.slippageAnalyzer).toBeDefined();
    });

    it('应该合并自定义配置', () => {
      const customEngine = new ExecutionAlphaEngine({
        defaultSliceCount: 50,
        verbose: false,
      });
      expect(customEngine.config.defaultSliceCount).toBe(50);
    });
  });

  describe('init', () => {
    it('应该初始化依赖', async () => {
      await engine.init({
        orderExecutor: mockOrderExecutor,
      });

      expect(engine.orderExecutor).toBe(mockOrderExecutor);
    });

    it('应该初始化子组件', async () => {
      await engine.init({
        orderExecutor: mockOrderExecutor,
      });

      expect(engine.twapVwapExecutor.orderExecutor).toBe(mockOrderExecutor);
      expect(engine.icebergExecutor.orderExecutor).toBe(mockOrderExecutor);
    });
  });

  describe('analyzeMarket', () => {
    beforeEach(async () => {
      await engine.init({
        orderExecutor: mockOrderExecutor,
      });

      // 添加模拟盘口数据
      engine.updateOrderBook('BTC/USDT', {
        bids: [[100, 100], [99.9, 100], [99.8, 100]],
        asks: [[101, 100], [101.1, 100], [101.2, 100]],
        timestamp: Date.now(),
      });

      engine.updateDailyVolume('BTC/USDT', 10000);
    });

    it('应该返回市场分析结果', async () => {
      const analysis = await engine.analyzeMarket('BTC/USDT', 10, 'buy');

      expect(analysis.symbol).toBe('BTC/USDT');
      expect(analysis.orderSize).toBe(10);
      expect(analysis.side).toBe('buy');
      expect(analysis.timestamp).toBeDefined();
    });

    it('应该包含盘口分析', async () => {
      const analysis = await engine.analyzeMarket('BTC/USDT', 10, 'buy');

      expect(analysis.depthAnalysis).toBeDefined();
      expect(analysis.liquidityAssessment).toBeDefined();
      expect(analysis.impactEstimation).toBeDefined();
    });

    it('应该包含滑点风险评估', async () => {
      const analysis = await engine.analyzeMarket('BTC/USDT', 10, 'buy');

      expect(analysis.slippageRisk).toBeDefined();
    });

    it('应该包含订单大小分类', async () => {
      const analysis = await engine.analyzeMarket('BTC/USDT', 10, 'buy');

      expect(analysis.sizeClass).toBeDefined();
      expect(Object.values(ORDER_SIZE_CLASS)).toContain(analysis.sizeClass);
    });

    it('应该包含综合风险评估', async () => {
      const analysis = await engine.analyzeMarket('BTC/USDT', 10, 'buy');

      expect(analysis.overallRisk).toBeDefined();
    });
  });

  describe('getRecommendation', () => {
    beforeEach(async () => {
      await engine.init({
        orderExecutor: mockOrderExecutor,
      });

      engine.updateOrderBook('BTC/USDT', {
        bids: [[100, 100], [99.9, 100], [99.8, 100]],
        asks: [[101, 100], [101.1, 100], [101.2, 100]],
        timestamp: Date.now(),
      });

      engine.updateDailyVolume('BTC/USDT', 10000);
    });

    it('应该返回执行建议', async () => {
      const recommendation = await engine.getRecommendation('BTC/USDT', 10, 'buy');

      expect(recommendation.symbol).toBe('BTC/USDT');
      expect(recommendation.recommendedStrategy).toBeDefined();
      expect(recommendation.recommendations).toBeDefined();
      expect(Array.isArray(recommendation.recommendations)).toBe(true);
    });

    it('应该包含策略建议', async () => {
      const recommendation = await engine.getRecommendation('BTC/USDT', 10, 'buy');

      const strategyRec = recommendation.recommendations.find(r => r.type === 'strategy');
      expect(strategyRec).toBeDefined();
      expect(strategyRec.strategy).toBeDefined();
      expect(strategyRec.reason).toBeDefined();
    });
  });

  describe('smartExecute', () => {
    beforeEach(async () => {
      await engine.init({
        orderExecutor: mockOrderExecutor,
      });

      engine.updateOrderBook('BTC/USDT', {
        bids: [[100, 100], [99.9, 100], [99.8, 100]],
        asks: [[101, 100], [101.1, 100], [101.2, 100]],
        timestamp: Date.now(),
      });

      engine.updateDailyVolume('BTC/USDT', 10000);
    });

    it('应该执行直接策略', async () => {
      const result = await engine.smartExecute({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        size: 1, // 小订单
        strategy: EXECUTION_STRATEGY.DIRECT,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(EXECUTION_STRATEGY.DIRECT);
      expect(result.executedSize).toBeDefined();
    });

    it('应该触发 executionCompleted 事件', async () => {
      const eventSpy = vi.fn();
      engine.on('executionCompleted', eventSpy);

      await engine.smartExecute({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        size: 1,
        strategy: EXECUTION_STRATEGY.DIRECT,
      });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该更新执行历史', async () => {
      await engine.smartExecute({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        size: 1,
        strategy: EXECUTION_STRATEGY.DIRECT,
      });

      expect(engine.executionHistory.length).toBe(1);
    });

    it('应该更新统计', async () => {
      await engine.smartExecute({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        size: 1,
        strategy: EXECUTION_STRATEGY.DIRECT,
      });

      expect(engine.stats.totalExecutions).toBe(1);
      expect(engine.stats.directExecutions).toBe(1);
    });

    it('应该自动选择策略', async () => {
      const result = await engine.smartExecute({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        size: 1,
        strategy: EXECUTION_STRATEGY.AUTO,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBeDefined();
    });

    it('应该返回市场分析', async () => {
      const result = await engine.smartExecute({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        size: 1,
        strategy: EXECUTION_STRATEGY.DIRECT,
      });

      expect(result.marketAnalysis).toBeDefined();
    });

    it('应该处理执行失败', async () => {
      mockOrderExecutor.executeSmartLimitOrder.mockRejectedValueOnce(new Error('Execution failed'));

      await expect(
        engine.smartExecute({
          exchangeId: 'binance',
          symbol: 'BTC/USDT',
          side: 'buy',
          size: 1,
          strategy: EXECUTION_STRATEGY.DIRECT,
        })
      ).rejects.toThrow('Execution failed');
    });

    it('应该在失败时触发 executionFailed 事件', async () => {
      const eventSpy = vi.fn();
      engine.on('executionFailed', eventSpy);

      mockOrderExecutor.executeSmartLimitOrder.mockRejectedValueOnce(new Error('Execution failed'));

      try {
        await engine.smartExecute({
          exchangeId: 'binance',
          symbol: 'BTC/USDT',
          side: 'buy',
          size: 1,
          strategy: EXECUTION_STRATEGY.DIRECT,
        });
      } catch (e) {
        // 期望抛出错误
      }

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('_selectOptimalStrategy', () => {
    it('应该为紧急情况选择直接执行', () => {
      const analysis = {
        sizeClass: ORDER_SIZE_CLASS.LARGE,
        liquidityAssessment: { level: LIQUIDITY_LEVEL.HIGH },
        slippageRisk: { riskLevel: SLIPPAGE_RISK.LOW },
        impactEstimation: { impactLevel: 'low' },
      };

      const strategy = engine._selectOptimalStrategy(analysis, 100, 'critical');

      expect(strategy).toBe(EXECUTION_STRATEGY.DIRECT);
    });

    it('应该为极小订单选择直接执行', () => {
      const analysis = {
        sizeClass: ORDER_SIZE_CLASS.TINY,
        liquidityAssessment: { level: LIQUIDITY_LEVEL.MEDIUM },
        slippageRisk: { riskLevel: SLIPPAGE_RISK.MEDIUM },
        impactEstimation: { impactLevel: 'low' },
      };

      const strategy = engine._selectOptimalStrategy(analysis, 1, 'normal');

      expect(strategy).toBe(EXECUTION_STRATEGY.DIRECT);
    });

    it('应该为高冲击成本选择冰山单', () => {
      const analysis = {
        sizeClass: ORDER_SIZE_CLASS.LARGE,
        liquidityAssessment: { level: LIQUIDITY_LEVEL.LOW },
        slippageRisk: { riskLevel: SLIPPAGE_RISK.HIGH },
        impactEstimation: { impactLevel: 'extreme' },
      };

      const strategy = engine._selectOptimalStrategy(analysis, 1000, 'normal');

      expect(strategy).toBe(EXECUTION_STRATEGY.ICEBERG);
    });

    it('应该为中等订单选择 TWAP', () => {
      const analysis = {
        sizeClass: ORDER_SIZE_CLASS.MEDIUM,
        liquidityAssessment: { level: LIQUIDITY_LEVEL.MEDIUM },
        slippageRisk: { riskLevel: SLIPPAGE_RISK.MEDIUM },
        impactEstimation: { impactLevel: 'medium' },
      };

      const strategy = engine._selectOptimalStrategy(analysis, 100, 'normal');

      expect(strategy).toBe(EXECUTION_STRATEGY.TWAP);
    });
  });

  describe('_classifyOrderSize', () => {
    it('应该在无日均量时返回 MEDIUM', () => {
      const sizeClass = engine._classifyOrderSize('UNKNOWN/USDT', 100);

      expect(sizeClass).toBe(ORDER_SIZE_CLASS.MEDIUM);
    });

    it('应该正确分类极小订单', () => {
      engine.updateDailyVolume('BTC/USDT', 100000);

      const sizeClass = engine._classifyOrderSize('BTC/USDT', 10); // 0.01%

      expect(sizeClass).toBe(ORDER_SIZE_CLASS.TINY);
    });

    it('应该正确分类大订单', () => {
      engine.updateDailyVolume('BTC/USDT', 100000);

      const sizeClass = engine._classifyOrderSize('BTC/USDT', 4000); // 4%

      expect(sizeClass).toBe(ORDER_SIZE_CLASS.LARGE);
    });
  });

  describe('_calculateOverallRisk', () => {
    it('应该计算综合风险', () => {
      const liquidityAssessment = { level: LIQUIDITY_LEVEL.MEDIUM };
      const slippageRisk = { riskScore: 50 };
      const impactEstimation = { impactLevel: 'medium' };

      const risk = engine._calculateOverallRisk(liquidityAssessment, slippageRisk, impactEstimation);

      expect(risk).toBe('medium');
    });

    it('应该处理缺失数据', () => {
      const risk = engine._calculateOverallRisk(null, null, null);

      expect(risk).toBe('medium'); // 默认中等风险
    });
  });

  describe('updateOrderBook', () => {
    it('应该更新盘口数据', () => {
      const orderBook = {
        bids: [[100, 100]],
        asks: [[101, 100]],
        timestamp: Date.now(),
      };

      engine.updateOrderBook('BTC/USDT', orderBook);

      const cached = engine.orderBookAnalyzer.getCachedOrderBook('BTC/USDT');
      expect(cached).toBeDefined();
    });
  });

  describe('updateDailyVolume', () => {
    it('应该更新日均成交量', () => {
      engine.updateDailyVolume('BTC/USDT', 100000);

      expect(engine.dailyVolumeCache.get('BTC/USDT')).toBe(100000);
    });
  });

  describe('getActiveTasks', () => {
    it('应该返回活跃任务列表', () => {
      engine.activeTasks.set('test1', { type: 'twap' });
      engine.activeTasks.set('test2', { type: 'iceberg' });

      const tasks = engine.getActiveTasks();

      expect(tasks.length).toBe(2);
    });
  });

  describe('getExecutionHistory', () => {
    it('应该返回执行历史', () => {
      engine.executionHistory.push({ id: 1 });
      engine.executionHistory.push({ id: 2 });

      const history = engine.getExecutionHistory();

      expect(history.length).toBe(2);
    });

    it('应该限制返回数量', () => {
      for (let i = 0; i < 200; i++) {
        engine.executionHistory.push({ id: i });
      }

      const history = engine.getExecutionHistory(50);

      expect(history.length).toBe(50);
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      const stats = engine.getStats();

      expect(stats.totalExecutions).toBeDefined();
      expect(stats.activeTasks).toBeDefined();
      expect(stats.orderBookAnalyzer).toBeDefined();
      expect(stats.twapVwap).toBeDefined();
      expect(stats.iceberg).toBeDefined();
      expect(stats.slippage).toBeDefined();
    });
  });

  describe('getSlippageHeatmap', () => {
    it('应该返回滑点热力图', () => {
      const heatmap = engine.getSlippageHeatmap('BTC/USDT');

      expect(heatmap).toBeDefined();
    });
  });

  describe('事件转发', () => {
    it('应该转发 TWAP/VWAP 完成事件', () => {
      const eventSpy = vi.fn();
      engine.on('algoTaskCompleted', eventSpy);

      engine.twapVwapExecutor.emit('taskCompleted', { taskId: 'test' });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该转发冰山单完成事件', () => {
      const eventSpy = vi.fn();
      engine.on('algoTaskCompleted', eventSpy);

      engine.icebergExecutor.emit('icebergCompleted', { icebergId: 'test' });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该转发滑点警告事件', () => {
      const eventSpy = vi.fn();
      engine.on('slippageWarning', eventSpy);

      engine.slippageAnalyzer.emit('slippageWarning', { symbol: 'BTC/USDT' });

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('日志功能', () => {
    it('应该在 verbose 模式下输出日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      engine.config.verbose = true;

      engine.log('Test message', 'info');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该在非 verbose 模式下不输出 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      engine.config.verbose = false;

      engine.log('Test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('事件', () => {
    it('应该继承 EventEmitter', () => {
      expect(typeof engine.on).toBe('function');
      expect(typeof engine.emit).toBe('function');
      expect(typeof engine.removeListener).toBe('function');
    });
  });
});
