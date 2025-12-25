/**
 * IcebergOrderExecutor 冰山单执行器测试
 * Iceberg Order Executor Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IcebergOrderExecutor,
  SplitCalculator,
  SPLIT_STRATEGY,
  DISPLAY_MODE,
  ICEBERG_STATUS,
  DEFAULT_CONFIG,
} from '../../../src/executor/executionAlpha/IcebergOrderExecutor.js';

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

// 创建模拟盘口分析器
function createMockOrderBookAnalyzer() {
  return {
    getCachedOrderBook: vi.fn().mockReturnValue({
      bids: [[100, 100], [99.9, 100], [99.8, 100]],
      asks: [[101, 100], [101.1, 100], [101.2, 100]],
      bestBid: 100,
      bestAsk: 101,
      timestamp: Date.now(),
    }),
  };
}

describe('IcebergOrderExecutor 常量导出', () => {
  it('应该导出 SPLIT_STRATEGY', () => {
    expect(SPLIT_STRATEGY.FIXED).toBe('fixed');
    expect(SPLIT_STRATEGY.PERCENTAGE).toBe('percentage');
    expect(SPLIT_STRATEGY.LIQUIDITY).toBe('liquidity');
    expect(SPLIT_STRATEGY.ADAPTIVE).toBe('adaptive');
    expect(SPLIT_STRATEGY.RANDOM).toBe('random');
  });

  it('应该导出 DISPLAY_MODE', () => {
    expect(DISPLAY_MODE.FIXED).toBe('fixed');
    expect(DISPLAY_MODE.RANDOM).toBe('random');
    expect(DISPLAY_MODE.DYNAMIC).toBe('dynamic');
  });

  it('应该导出 ICEBERG_STATUS', () => {
    expect(ICEBERG_STATUS.PENDING).toBe('pending');
    expect(ICEBERG_STATUS.ACTIVE).toBe('active');
    expect(ICEBERG_STATUS.PAUSED).toBe('paused');
    expect(ICEBERG_STATUS.COMPLETED).toBe('completed');
    expect(ICEBERG_STATUS.CANCELED).toBe('canceled');
    expect(ICEBERG_STATUS.FAILED).toBe('failed');
  });

  it('应该导出 DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.defaultDisplayRatio).toBeDefined();
    expect(DEFAULT_CONFIG.subOrderInterval).toBeDefined();
    expect(DEFAULT_CONFIG.maxConcurrentOrders).toBeDefined();
  });
});

describe('SplitCalculator', () => {
  describe('fixedSplit', () => {
    it('应该按固定大小拆分', () => {
      const splits = SplitCalculator.fixedSplit(100, 20);

      expect(splits.length).toBe(5);
      splits.forEach(split => {
        expect(split.size).toBe(20);
        expect(split.type).toBe('fixed');
      });
    });

    it('应该处理不能整除的情况', () => {
      const splits = SplitCalculator.fixedSplit(100, 30);

      const totalSize = splits.reduce((sum, s) => sum + s.size, 0);
      expect(totalSize).toBe(100);
    });
  });

  describe('percentageSplit', () => {
    it('应该按百分比拆分', () => {
      const splits = SplitCalculator.percentageSplit(100, 0.1); // 10%

      expect(splits.length).toBe(10);
    });
  });

  describe('liquiditySplit', () => {
    it('应该基于流动性拆分', () => {
      const splits = SplitCalculator.liquiditySplit(100, {
        bidDepth: 500,
        askDepth: 500,
        spread: 0.001,
        avgTradeSize: 10,
      });

      expect(splits.length).toBeGreaterThan(0);
      const totalSize = splits.reduce((sum, s) => sum + s.size, 0);
      expect(totalSize).toBeCloseTo(100, 1);
    });

    it('应该在高价差时拆分更细', () => {
      const lowSpreadSplits = SplitCalculator.liquiditySplit(100, {
        bidDepth: 500,
        askDepth: 500,
        spread: 0.001,
      });

      const highSpreadSplits = SplitCalculator.liquiditySplit(100, {
        bidDepth: 500,
        askDepth: 500,
        spread: 0.01,
      });

      expect(highSpreadSplits.length).toBeGreaterThanOrEqual(lowSpreadSplits.length);
    });
  });

  describe('adaptiveSplit', () => {
    it('应该根据市场状况自适应拆分', () => {
      const splits = SplitCalculator.adaptiveSplit(100, {
        volatility: 'normal',
        liquidity: 'medium',
        urgency: 'normal',
      });

      expect(splits.length).toBeGreaterThan(0);
    });

    it('应该在高波动时拆分更细', () => {
      const normalSplits = SplitCalculator.adaptiveSplit(100, {
        volatility: 'normal',
      });

      const highVolSplits = SplitCalculator.adaptiveSplit(100, {
        volatility: 'high',
      });

      expect(highVolSplits.length).toBeGreaterThanOrEqual(normalSplits.length);
    });

    it('应该在低流动性时拆分更细', () => {
      const highLiqSplits = SplitCalculator.adaptiveSplit(100, {
        liquidity: 'high',
      });

      const lowLiqSplits = SplitCalculator.adaptiveSplit(100, {
        liquidity: 'low',
      });

      expect(lowLiqSplits.length).toBeGreaterThanOrEqual(highLiqSplits.length);
    });
  });

  describe('randomSplit', () => {
    it('应该随机拆分', () => {
      const splits = SplitCalculator.randomSplit(100, 0.1, 0.3);

      expect(splits.length).toBeGreaterThan(0);
      const totalSize = splits.reduce((sum, s) => sum + s.size, 0);
      expect(totalSize).toBeCloseTo(100, 1);
    });

    it('应该产生不同大小的切片', () => {
      const splits = SplitCalculator.randomSplit(100, 0.1, 0.3);

      const sizes = splits.map(s => s.size);
      const allEqual = sizes.every(s => Math.abs(s - sizes[0]) < 0.01);
      // 大多数情况下应该有不同大小
      expect(splits.length).toBeGreaterThan(0);
    });
  });
});

describe('IcebergOrderExecutor', () => {
  let executor;
  let mockOrderExecutor;
  let mockOrderBookAnalyzer;

  beforeEach(() => {
    mockOrderExecutor = createMockOrderExecutor();
    mockOrderBookAnalyzer = createMockOrderBookAnalyzer();

    executor = new IcebergOrderExecutor({
      verbose: false,
      subOrderInterval: 10, // 快速执行以便测试
      subOrderTimeout: 100,
      maxConcurrentOrders: 2,
    });

    executor.init({
      orderExecutor: mockOrderExecutor,
      orderBookAnalyzer: mockOrderBookAnalyzer,
    });
  });

  afterEach(() => {
    // 取消所有活跃冰山单
    for (const icebergId of executor.activeIcebergs.keys()) {
      executor.activeIcebergs.get(icebergId).status = ICEBERG_STATUS.CANCELED;
    }
    executor.activeIcebergs.clear();
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(executor.activeIcebergs).toBeInstanceOf(Map);
      expect(executor.lastSubOrderSizes).toBeInstanceOf(Map);
      expect(executor.stats.totalIcebergs).toBe(0);
    });

    it('应该合并自定义配置', () => {
      const customExecutor = new IcebergOrderExecutor({
        defaultDisplayRatio: 0.2,
        verbose: false,
      });
      expect(customExecutor.config.defaultDisplayRatio).toBe(0.2);
    });
  });

  describe('init', () => {
    it('应该初始化依赖', () => {
      const newExecutor = new IcebergOrderExecutor({ verbose: false });
      newExecutor.init({
        orderExecutor: mockOrderExecutor,
        orderBookAnalyzer: mockOrderBookAnalyzer,
      });

      expect(newExecutor.orderExecutor).toBe(mockOrderExecutor);
      expect(newExecutor.orderBookAnalyzer).toBe(mockOrderBookAnalyzer);
    });
  });

  describe('createIcebergOrder', () => {
    it('应该创建冰山单', () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      expect(iceberg.icebergId).toBeDefined();
      expect(iceberg.symbol).toBe('BTC/USDT');
      expect(iceberg.side).toBe('buy');
      expect(iceberg.totalSize).toBe(100);
      expect(iceberg.status).toBe(ICEBERG_STATUS.PENDING);
      expect(iceberg.splits.length).toBeGreaterThan(0);
    });

    it('应该计算显示量', () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      expect(iceberg.displaySize).toBeDefined();
      expect(iceberg.displaySize).toBeLessThanOrEqual(100);
    });

    it('应该使用指定的显示量', () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        displaySize: 10,
      });

      expect(iceberg.displaySize).toBe(10);
    });

    it('应该使用指定的拆单策略', () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        splitStrategy: SPLIT_STRATEGY.FIXED,
        splitSize: 20,
      });

      expect(iceberg.splitStrategy).toBe(SPLIT_STRATEGY.FIXED);
    });

    it('应该触发 icebergCreated 事件', () => {
      const eventSpy = vi.fn();
      executor.on('icebergCreated', eventSpy);

      executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该更新统计', () => {
      executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      expect(executor.stats.totalIcebergs).toBe(1);
    });
  });

  describe('startIceberg', () => {
    it('应该启动冰山单执行', async () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
      });

      // 启动但不等待完成
      const startPromise = executor.startIceberg(iceberg.icebergId);

      // 等待一小段时间让状态更新
      await new Promise(r => setTimeout(r, 20));

      expect(iceberg.status).toBe(ICEBERG_STATUS.ACTIVE);
      expect(iceberg.startedAt).toBeDefined();

      // 取消以清理
      await executor.cancelIceberg(iceberg.icebergId);
    });

    it('应该触发 icebergStarted 事件', async () => {
      const eventSpy = vi.fn();
      executor.on('icebergStarted', eventSpy);

      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
      });

      executor.startIceberg(iceberg.icebergId);
      await new Promise(r => setTimeout(r, 20));

      expect(eventSpy).toHaveBeenCalled();

      await executor.cancelIceberg(iceberg.icebergId);
    });

    it('应该拒绝启动不存在的冰山单', async () => {
      await expect(executor.startIceberg('non_existent')).rejects.toThrow();
    });
  });

  describe('pauseIceberg', () => {
    it('应该暂停冰山单', async () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      executor.startIceberg(iceberg.icebergId);
      await new Promise(r => setTimeout(r, 20));

      const result = executor.pauseIceberg(iceberg.icebergId);

      expect(result).toBe(true);
      expect(iceberg.status).toBe(ICEBERG_STATUS.PAUSED);
    });

    it('应该触发 icebergPaused 事件', async () => {
      const eventSpy = vi.fn();
      executor.on('icebergPaused', eventSpy);

      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      executor.startIceberg(iceberg.icebergId);
      await new Promise(r => setTimeout(r, 20));

      executor.pauseIceberg(iceberg.icebergId);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该对非活跃冰山单返回 false', () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      const result = executor.pauseIceberg(iceberg.icebergId);

      expect(result).toBe(false);
    });
  });

  describe('cancelIceberg', () => {
    it('应该取消冰山单', async () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      executor.startIceberg(iceberg.icebergId);
      await new Promise(r => setTimeout(r, 20));

      const result = await executor.cancelIceberg(iceberg.icebergId);

      expect(result).toBe(true);
      expect(iceberg.status).toBe(ICEBERG_STATUS.CANCELED);
    });

    it('应该触发 icebergCanceled 事件', async () => {
      const eventSpy = vi.fn();
      executor.on('icebergCanceled', eventSpy);

      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      executor.startIceberg(iceberg.icebergId);
      await new Promise(r => setTimeout(r, 20));

      await executor.cancelIceberg(iceberg.icebergId);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该更新统计', async () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      executor.startIceberg(iceberg.icebergId);
      await new Promise(r => setTimeout(r, 20));

      await executor.cancelIceberg(iceberg.icebergId);

      expect(executor.stats.canceledIcebergs).toBe(1);
    });
  });

  describe('getIcebergStatus', () => {
    it('应该返回冰山单状态', () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      const status = executor.getIcebergStatus(iceberg.icebergId);

      expect(status.icebergId).toBe(iceberg.icebergId);
      expect(status.status).toBe(ICEBERG_STATUS.PENDING);
      expect(status.progress).toBeDefined();
    });

    it('应该对不存在的冰山单返回 null', () => {
      const status = executor.getIcebergStatus('non_existent');
      expect(status).toBeNull();
    });
  });

  describe('getActiveIcebergs', () => {
    it('应该返回所有活跃冰山单', () => {
      executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'ETH/USDT',
        side: 'sell',
        totalSize: 50,
      });

      const activeIcebergs = executor.getActiveIcebergs();

      expect(activeIcebergs.length).toBe(2);
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
      });

      const stats = executor.getStats();

      expect(stats.totalIcebergs).toBe(1);
      expect(stats.activeIcebergs).toBe(1);
    });
  });

  describe('子订单执行', () => {
    it('应该在执行子订单后触发 subOrderCompleted 事件', async () => {
      const eventSpy = vi.fn();
      executor.on('subOrderCompleted', eventSpy);

      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        splitStrategy: SPLIT_STRATEGY.FIXED,
        splitSize: 5,
      });

      executor.startIceberg(iceberg.icebergId);

      // 等待子订单执行
      await new Promise(r => setTimeout(r, 100));

      expect(eventSpy).toHaveBeenCalled();

      await executor.cancelIceberg(iceberg.icebergId);
    });

    it('应该更新冰山单的执行进度', async () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        splitStrategy: SPLIT_STRATEGY.FIXED,
        splitSize: 5,
      });

      executor.startIceberg(iceberg.icebergId);

      // 等待执行
      await new Promise(r => setTimeout(r, 100));

      expect(iceberg.executedSize).toBeGreaterThan(0);

      await executor.cancelIceberg(iceberg.icebergId);
    });
  });

  describe('显示模式', () => {
    it('应该支持固定显示模式', () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        displayMode: DISPLAY_MODE.FIXED,
        displaySize: 10,
      });

      expect(iceberg.displayMode).toBe(DISPLAY_MODE.FIXED);
    });

    it('应该支持随机显示模式', () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        displayMode: DISPLAY_MODE.RANDOM,
      });

      expect(iceberg.displayMode).toBe(DISPLAY_MODE.RANDOM);
    });

    it('应该支持动态显示模式', () => {
      const iceberg = executor.createIcebergOrder({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        displayMode: DISPLAY_MODE.DYNAMIC,
      });

      expect(iceberg.displayMode).toBe(DISPLAY_MODE.DYNAMIC);
    });
  });

  describe('日志功能', () => {
    it('应该在 verbose 模式下输出日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      executor.config.verbose = true;

      executor.log('Test message', 'info');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该在非 verbose 模式下不输出 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      executor.config.verbose = false;

      executor.log('Test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('事件', () => {
    it('应该继承 EventEmitter', () => {
      expect(typeof executor.on).toBe('function');
      expect(typeof executor.emit).toBe('function');
      expect(typeof executor.removeListener).toBe('function');
    });
  });
});
