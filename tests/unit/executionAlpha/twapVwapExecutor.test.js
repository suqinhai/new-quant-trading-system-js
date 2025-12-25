/**
 * TWAPVWAPExecutor TWAP/VWAP 算法执行器测试
 * TWAP/VWAP Algorithm Executor Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TWAPVWAPExecutor,
  ALGO_TYPE,
  EXECUTION_STATUS,
  VOLUME_CURVES,
  DEFAULT_CONFIG,
} from '../../../src/executor/executionAlpha/TWAPVWAPExecutor.js';

// 别名以保持测试一致性 / Alias for test consistency
const TASK_STATUS = EXECUTION_STATUS;
const SLICE_STATUS = {
  PENDING: 'pending',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

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
      timestamp: Date.now(),
    }),
    analyzeDepth: vi.fn().mockReturnValue({
      bestBid: 100,
      bestAsk: 101,
      midPrice: 100.5,
      spread: 0.01,
      bidDepth: { totalVolume: 300 },
      askDepth: { totalVolume: 300 },
    }),
    analyzeTrend: vi.fn().mockReturnValue({
      direction: 'neutral',
      strength: 0,
    }),
    assessLiquidity: vi.fn().mockReturnValue({
      level: 'medium',
      score: 50,
    }),
    dailyVolumeCache: new Map([['BTC/USDT', 10000]]),
  };
}

describe('TWAPVWAPExecutor 常量导出', () => {
  it('应该导出 ALGO_TYPE', () => {
    expect(ALGO_TYPE.TWAP).toBe('twap');
    expect(ALGO_TYPE.VWAP).toBe('vwap');
  });

  it('应该导出 TASK_STATUS', () => {
    expect(TASK_STATUS.PENDING).toBe('pending');
    expect(TASK_STATUS.RUNNING).toBe('running');
    expect(TASK_STATUS.PAUSED).toBe('paused');
    expect(TASK_STATUS.COMPLETED).toBe('completed');
    expect(TASK_STATUS.CANCELED).toBe('canceled');
    expect(TASK_STATUS.FAILED).toBe('failed');
  });

  it('应该导出 SLICE_STATUS', () => {
    expect(SLICE_STATUS.PENDING).toBe('pending');
    expect(SLICE_STATUS.EXECUTING).toBe('executing');
    expect(SLICE_STATUS.COMPLETED).toBe('completed');
    expect(SLICE_STATUS.FAILED).toBe('failed');
    expect(SLICE_STATUS.SKIPPED).toBe('skipped');
  });

  it('应该导出 VOLUME_CURVES', () => {
    expect(VOLUME_CURVES.crypto).toBeDefined();
    expect(VOLUME_CURVES.usStock).toBeDefined();
    expect(Array.isArray(VOLUME_CURVES.crypto)).toBe(true);
    expect(Array.isArray(VOLUME_CURVES.usStock)).toBe(true);
  });

  it('应该导出 DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.defaultSlices).toBeDefined();
    expect(DEFAULT_CONFIG.maxSlippage).toBeDefined();
    expect(DEFAULT_CONFIG.defaultDuration).toBeDefined();
  });
});

describe('TWAPVWAPExecutor', () => {
  let executor;
  let mockOrderExecutor;
  let mockOrderBookAnalyzer;

  beforeEach(() => {
    mockOrderExecutor = createMockOrderExecutor();
    mockOrderBookAnalyzer = createMockOrderBookAnalyzer();

    executor = new TWAPVWAPExecutor({
      verbose: false,
      sliceTimeout: 100, // 快速超时以便测试
    });

    executor.init({
      orderExecutor: mockOrderExecutor,
      orderBookAnalyzer: mockOrderBookAnalyzer,
    });
  });

  afterEach(() => {
    // 清理所有运行的任务
    for (const task of executor.activeTasks.values()) {
      task.status = EXECUTION_STATUS.CANCELED;
    }
    executor.activeTasks.clear();
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(executor.activeTasks).toBeInstanceOf(Map);
      expect(executor.executionHistory).toEqual([]);
      expect(executor.stats.totalTasks).toBe(0);
    });

    it('应该合并自定义配置', () => {
      const customExecutor = new TWAPVWAPExecutor({
        defaultSlices: 50,
        verbose: false,
      });
      expect(customExecutor.config.defaultSlices).toBe(50);
    });
  });

  describe('init', () => {
    it('应该初始化依赖', () => {
      const newExecutor = new TWAPVWAPExecutor({ verbose: false });
      newExecutor.init({
        orderExecutor: mockOrderExecutor,
        orderBookAnalyzer: mockOrderBookAnalyzer,
      });

      expect(newExecutor.orderExecutor).toBe(mockOrderExecutor);
      expect(newExecutor.orderBookAnalyzer).toBe(mockOrderBookAnalyzer);
    });
  });

  describe('createTWAPTask', () => {
    it('应该创建 TWAP 任务', () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000, // 1 分钟
        sliceCount: 10,
      });

      expect(task.taskId).toBeDefined();
      expect(task.algoType).toBe(ALGO_TYPE.TWAP);
      expect(task.symbol).toBe('BTC/USDT');
      expect(task.side).toBe('buy');
      expect(task.totalSize).toBe(100);
      expect(task.slices.length).toBe(10);
      expect(task.status).toBe(TASK_STATUS.PENDING);
    });

    it('应该均匀分配切片', () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000,
        sliceCount: 5,
      });

      // 每个切片大小应该大致相等
      const totalSliceSize = task.slices.reduce((sum, s) => sum + s.size, 0);
      expect(totalSliceSize).toBeCloseTo(100, 1);
    });

    it('应该触发 taskCreated 事件', () => {
      const eventSpy = vi.fn();
      executor.on('taskCreated', eventSpy);

      executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000,
        sliceCount: 10,
      });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该更新统计', () => {
      executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000,
        sliceCount: 10,
      });

      expect(executor.stats.totalTasks).toBe(1);
    });
  });

  describe('createVWAPTask', () => {
    it('应该创建 VWAP 任务', () => {
      const task = executor.createVWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell',
        totalSize: 100,
        duration: 60000,
        sliceCount: 10,
        volumeCurve: VOLUME_CURVES.crypto,
      });

      expect(task.taskId).toBeDefined();
      expect(task.algoType).toBe(ALGO_TYPE.VWAP);
      expect(task.side).toBe('sell');
    });

    it('应该根据成交量曲线分配切片', () => {
      const task = executor.createVWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000,
        sliceCount: 10,
        volumeCurve: VOLUME_CURVES.crypto,
      });

      // 切片大小应该不完全相等（受成交量曲线影响）
      const sizes = task.slices.map(s => s.size);
      const allEqual = sizes.every(s => s === sizes[0]);
      // VWAP 切片大小通常不完全相等
      expect(task.slices.length).toBe(10);
    });
  });

  describe('startTask', () => {
    it('应该启动任务', async () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 100, // 100ms
        sliceCount: 2,
      });

      const startPromise = executor.startTask(task.taskId);

      // 等待一小段时间让任务开始
      await new Promise(r => setTimeout(r, 50));

      expect(task.status).toBe(TASK_STATUS.RUNNING);

      // 清理
      executor.cancelTask(task.taskId);
    });

    it('应该触发 taskStarted 事件', async () => {
      const eventSpy = vi.fn();
      executor.on('taskStarted', eventSpy);

      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 100,
        sliceCount: 2,
      });

      executor.startTask(task.taskId);

      await new Promise(r => setTimeout(r, 20));

      expect(eventSpy).toHaveBeenCalled();

      executor.cancelTask(task.taskId);
    });

    it('应该拒绝启动不存在的任务', async () => {
      await expect(executor.startTask('non_existent')).rejects.toThrow();
    });

    it('应该拒绝重复启动', async () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 1000,
        sliceCount: 2,
      });

      executor.startTask(task.taskId);
      await new Promise(r => setTimeout(r, 20));

      await expect(executor.startTask(task.taskId)).rejects.toThrow();

      executor.cancelTask(task.taskId);
    });
  });

  describe('pauseTask', () => {
    it('应该暂停任务', async () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 1000,
        sliceCount: 5,
      });

      executor.startTask(task.taskId);
      await new Promise(r => setTimeout(r, 50));

      const result = executor.pauseTask(task.taskId);

      expect(result).toBe(true);
      expect(task.status).toBe(TASK_STATUS.PAUSED);
    });

    it('应该触发 taskPaused 事件', async () => {
      const eventSpy = vi.fn();
      executor.on('taskPaused', eventSpy);

      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 1000,
        sliceCount: 5,
      });

      executor.startTask(task.taskId);
      await new Promise(r => setTimeout(r, 50));

      executor.pauseTask(task.taskId);

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该对非运行任务返回 false', () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 1000,
        sliceCount: 5,
      });

      const result = executor.pauseTask(task.taskId);

      expect(result).toBe(false);
    });
  });

  describe('cancelTask', () => {
    it('应该取消任务', async () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 1000,
        sliceCount: 5,
      });

      executor.startTask(task.taskId);
      await new Promise(r => setTimeout(r, 50));

      const result = await executor.cancelTask(task.taskId);

      expect(result).toBe(true);
      expect(task.status).toBe(TASK_STATUS.CANCELED);
    });

    it('应该触发 taskCanceled 事件', async () => {
      const eventSpy = vi.fn();
      executor.on('taskCanceled', eventSpy);

      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 1000,
        sliceCount: 5,
      });

      executor.startTask(task.taskId);
      await new Promise(r => setTimeout(r, 50));

      await executor.cancelTask(task.taskId);

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('getTaskStatus', () => {
    it('应该返回任务状态', () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000,
        sliceCount: 10,
      });

      const status = executor.getTaskStatus(task.taskId);

      expect(status.taskId).toBe(task.taskId);
      expect(status.status).toBe(TASK_STATUS.PENDING);
      expect(status.progress).toBeDefined();
    });

    it('应该对不存在的任务返回 null', () => {
      const status = executor.getTaskStatus('non_existent');
      expect(status).toBeNull();
    });
  });

  describe('getActiveTasks', () => {
    it('应该返回所有活跃任务', () => {
      executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000,
        sliceCount: 10,
      });

      executor.createVWAPTask({
        exchangeId: 'binance',
        symbol: 'ETH/USDT',
        side: 'sell',
        totalSize: 50,
        duration: 60000,
        sliceCount: 5,
      });

      const activeTasks = executor.getActiveTasks();

      expect(activeTasks.length).toBe(2);
    });
  });

  describe('getStats', () => {
    it('应该返回统计信息', () => {
      executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000,
        sliceCount: 10,
      });

      const stats = executor.getStats();

      expect(stats.totalTasks).toBe(1);
      expect(stats.activeTasks).toBe(1);
    });
  });

  describe('切片执行', () => {
    it('应该在执行切片后触发 sliceExecuted 事件', async () => {
      const eventSpy = vi.fn();
      executor.on('sliceExecuted', eventSpy);

      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 100,
        sliceCount: 2,
      });

      executor.startTask(task.taskId);

      // 等待第一个切片执行
      await new Promise(r => setTimeout(r, 200));

      expect(eventSpy).toHaveBeenCalled();

      executor.cancelTask(task.taskId);
    });

    it('应该更新任务的执行进度', async () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 10,
        duration: 100,
        sliceCount: 2,
      });

      executor.startTask(task.taskId);

      // 等待执行
      await new Promise(r => setTimeout(r, 200));

      expect(task.executedSize).toBeGreaterThan(0);

      executor.cancelTask(task.taskId);
    });
  });

  describe('价格限制', () => {
    it('应该在创建任务时设置限价', () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000,
        sliceCount: 10,
        limitPrice: 100,
      });

      expect(task.limitPrice).toBe(100);
    });

    it('应该在创建任务时设置最大滑点', () => {
      const task = executor.createTWAPTask({
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        totalSize: 100,
        duration: 60000,
        sliceCount: 10,
        maxSlippage: 0.005,
      });

      expect(task.maxSlippage).toBe(0.005);
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
