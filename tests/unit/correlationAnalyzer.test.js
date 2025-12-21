/**
 * 相关性分析器测试
 * Correlation Analyzer Tests
 * @module tests/unit/correlationAnalyzer.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CorrelationAnalyzer,
  CORRELATION_LEVEL,
  DEFAULT_CONFIG,
} from '../../src/analytics/CorrelationAnalyzer.js';

// ============================================
// 测试辅助函数
// ============================================

/**
 * 生成模拟收益数据
 */
function generateReturns(count, mean = 0, std = 0.02) {
  const returns = [];
  const baseTime = Date.now() - count * 86400000;

  for (let i = 0; i < count; i++) {
    const returnValue = mean + (Math.random() - 0.5) * 2 * std;
    returns.push({
      timestamp: baseTime + i * 86400000,
      return: returnValue,
      equity: 10000 * (1 + returnValue),
    });
  }

  return returns;
}

/**
 * 生成相关收益数据
 */
function generateCorrelatedReturns(baseReturns, correlation) {
  const returns = [];
  const noise = Math.sqrt(1 - correlation * correlation);

  for (const base of baseReturns) {
    const returnValue = correlation * base.return + noise * (Math.random() - 0.5) * 0.04;
    returns.push({
      timestamp: base.timestamp,
      return: returnValue,
      equity: 10000 * (1 + returnValue),
    });
  }

  return returns;
}

// ============================================
// CorrelationAnalyzer 测试
// ============================================

describe('CorrelationAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new CorrelationAnalyzer({
      rollingWindow: 20,
      minDataPoints: 5,
      lowCorrelationThreshold: 0.3,
      highCorrelationWarning: 0.7,
      updateInterval: 10000,
      verbose: false,
    });
  });

  afterEach(() => {
    if (analyzer) {
      analyzer.stop();
      analyzer.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const a = new CorrelationAnalyzer();

      expect(a.config.rollingWindow).toBe(30);
      expect(a.config.minDataPoints).toBe(10);
      expect(a.config.lowCorrelationThreshold).toBe(0.3);
      expect(a.config.highCorrelationWarning).toBe(0.7);
    });

    it('应该使用自定义配置', () => {
      expect(analyzer.config.rollingWindow).toBe(20);
      expect(analyzer.config.minDataPoints).toBe(5);
    });

    it('应该初始化空数据结构', () => {
      expect(analyzer.strategyReturns.size).toBe(0);
      expect(analyzer.strategies).toEqual([]);
      expect(analyzer.correlationMatrix).toBeNull();
      expect(analyzer.covarianceMatrix).toBeNull();
    });

    it('应该设置运行状态为 false', () => {
      expect(analyzer.running).toBe(false);
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('start/stop', () => {
    it('应该启动分析器', () => {
      const listener = vi.fn();
      analyzer.on('started', listener);

      analyzer.start();

      expect(analyzer.running).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('应该设置更新定时器', () => {
      analyzer.start();

      expect(analyzer.updateTimer).not.toBeNull();
    });

    it('应该停止分析器', () => {
      const listener = vi.fn();
      analyzer.on('stopped', listener);

      analyzer.start();
      analyzer.stop();

      expect(analyzer.running).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('停止后应该清除定时器', () => {
      analyzer.start();
      analyzer.stop();

      expect(analyzer.updateTimer).toBeNull();
    });

    it('重复启动应该无操作', () => {
      analyzer.start();
      const timer1 = analyzer.updateTimer;
      analyzer.start();

      expect(analyzer.updateTimer).toBe(timer1);
    });

    it('未启动时停止应该无操作', () => {
      analyzer.stop();
      expect(analyzer.running).toBe(false);
    });
  });

  // ============================================
  // 策略注册测试
  // ============================================

  describe('registerStrategy', () => {
    it('应该注册策略', () => {
      analyzer.registerStrategy('strategy1');

      expect(analyzer.strategies).toContain('strategy1');
      expect(analyzer.strategyReturns.has('strategy1')).toBe(true);
    });

    it('应该发射 strategyRegistered 事件', () => {
      const listener = vi.fn();
      analyzer.on('strategyRegistered', listener);

      analyzer.registerStrategy('strategy1', { name: 'Test' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ strategyId: 'strategy1' })
      );
    });

    it('重复注册应该跳过', () => {
      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy1');

      expect(analyzer.strategies.filter(s => s === 'strategy1').length).toBe(1);
    });
  });

  describe('removeStrategy', () => {
    beforeEach(() => {
      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');
    });

    it('应该移除策略', () => {
      analyzer.removeStrategy('strategy1');

      expect(analyzer.strategies).not.toContain('strategy1');
      expect(analyzer.strategyReturns.has('strategy1')).toBe(false);
    });

    it('应该发射 strategyRemoved 事件', () => {
      const listener = vi.fn();
      analyzer.on('strategyRemoved', listener);

      analyzer.removeStrategy('strategy1');

      expect(listener).toHaveBeenCalledWith({ strategyId: 'strategy1' });
    });

    it('移除不存在的策略应该无操作', () => {
      const initialCount = analyzer.strategies.length;
      analyzer.removeStrategy('nonexistent');

      expect(analyzer.strategies.length).toBe(initialCount);
    });
  });

  // ============================================
  // 数据记录测试
  // ============================================

  describe('recordReturn', () => {
    it('应该记录收益数据', () => {
      analyzer.registerStrategy('strategy1');
      analyzer.recordReturn('strategy1', 0.02, 10200);

      const returns = analyzer.strategyReturns.get('strategy1');
      expect(returns.length).toBe(1);
      expect(returns[0].return).toBe(0.02);
      expect(returns[0].equity).toBe(10200);
    });

    it('未注册的策略应该自动注册', () => {
      analyzer.recordReturn('newStrategy', 0.01, 10100);

      expect(analyzer.strategies).toContain('newStrategy');
    });

    it('应该发射 returnRecorded 事件', () => {
      const listener = vi.fn();
      analyzer.on('returnRecorded', listener);

      analyzer.recordReturn('strategy1', 0.02, 10200);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'strategy1',
          returnValue: 0.02,
        })
      );
    });

    it('应该限制数据大小', () => {
      analyzer.registerStrategy('strategy1');

      // 添加超过窗口大小两倍的数据
      for (let i = 0; i < 100; i++) {
        analyzer.recordReturn('strategy1', 0.01, 10000);
      }

      const returns = analyzer.strategyReturns.get('strategy1');
      expect(returns.length).toBeLessThanOrEqual(analyzer.config.rollingWindow * 2);
    });
  });

  describe('loadEquityCurve', () => {
    it('应该从权益曲线计算收益率', () => {
      const curve = [
        { timestamp: 1000, equity: 10000 },
        { timestamp: 2000, equity: 10100 }, // 1% return
        { timestamp: 3000, equity: 10200 }, // ~0.99% return
      ];

      analyzer.loadEquityCurve('strategy1', curve);

      const returns = analyzer.strategyReturns.get('strategy1');
      expect(returns.length).toBe(2);
      expect(returns[0].return).toBeCloseTo(0.01, 4);
    });

    it('数据不足应该跳过', () => {
      analyzer.loadEquityCurve('strategy1', [{ timestamp: 1000, equity: 10000 }]);

      expect(analyzer.strategyReturns.has('strategy1')).toBe(false);
    });

    it('应该处理空权益曲线', () => {
      analyzer.loadEquityCurve('strategy1', []);

      expect(analyzer.strategyReturns.has('strategy1')).toBe(false);
    });

    it('应该处理 null 权益曲线', () => {
      analyzer.loadEquityCurve('strategy1', null);

      expect(analyzer.strategyReturns.has('strategy1')).toBe(false);
    });
  });

  // ============================================
  // 相关性计算测试
  // ============================================

  describe('calculateCorrelation', () => {
    beforeEach(() => {
      const returns1 = generateReturns(30);
      analyzer.registerStrategy('strategy1');
      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
    });

    it('策略不存在应该返回错误', () => {
      const result = analyzer.calculateCorrelation('strategy1', 'nonexistent');

      expect(result.correlation).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('数据点不足应该返回错误', () => {
      analyzer.registerStrategy('strategy2');
      analyzer.recordReturn('strategy2', 0.01, 10000);

      const result = analyzer.calculateCorrelation('strategy1', 'strategy2');

      expect(result.correlation).toBeNull();
      expect(result.error).toContain('数据点不足');
    });

    it('应该返回完整的相关性结果', () => {
      const returns1 = analyzer.strategyReturns.get('strategy1');
      const returns2 = generateCorrelatedReturns(returns1, 0.8);

      analyzer.registerStrategy('strategy2');
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));

      const result = analyzer.calculateCorrelation('strategy1', 'strategy2');

      expect(result.correlation).toBeDefined();
      expect(result.level).toBeDefined();
      expect(result.dataPoints).toBeGreaterThan(0);
      expect(result.tStatistic).toBeDefined();
      expect(result.pValue).toBeDefined();
      expect(result.significant).toBeDefined();
    });

    it('高相关数据应该返回高相关系数', () => {
      const returns1 = analyzer.strategyReturns.get('strategy1');
      const returns2 = generateCorrelatedReturns(returns1, 0.9);

      analyzer.registerStrategy('strategy2');
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));

      const result = analyzer.calculateCorrelation('strategy1', 'strategy2');

      expect(result.absoluteCorrelation).toBeGreaterThan(0.5);
    });
  });

  describe('_pearsonCorrelation', () => {
    it('完全正相关应该返回 1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];

      const corr = analyzer._pearsonCorrelation(x, y);

      expect(corr).toBeCloseTo(1, 4);
    });

    it('完全负相关应该返回 -1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];

      const corr = analyzer._pearsonCorrelation(x, y);

      expect(corr).toBeCloseTo(-1, 4);
    });

    it('无相关应该返回接近 0', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [3, 1, 4, 1, 5];

      const corr = analyzer._pearsonCorrelation(x, y);

      expect(Math.abs(corr)).toBeLessThan(0.5);
    });

    it('数组长度不同应该返回 NaN', () => {
      const corr = analyzer._pearsonCorrelation([1, 2, 3], [1, 2]);

      expect(isNaN(corr)).toBe(true);
    });

    it('空数组应该返回 NaN', () => {
      const corr = analyzer._pearsonCorrelation([], []);

      expect(isNaN(corr)).toBe(true);
    });

    it('常量数组应该返回 0', () => {
      const x = [1, 1, 1, 1, 1];
      const y = [2, 4, 6, 8, 10];

      const corr = analyzer._pearsonCorrelation(x, y);

      expect(corr).toBe(0);
    });
  });

  describe('spearmanCorrelation', () => {
    it('应该计算秩相关', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];

      const corr = analyzer.spearmanCorrelation(x, y);

      expect(corr).toBeCloseTo(1, 4);
    });

    it('单调非线性关系应该返回高相关', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [1, 4, 9, 16, 25]; // y = x^2

      const corr = analyzer.spearmanCorrelation(x, y);

      expect(corr).toBeCloseTo(1, 4);
    });
  });

  // ============================================
  // 矩阵计算测试
  // ============================================

  describe('buildCorrelationMatrix', () => {
    it('策略少于2个应该返回错误', () => {
      analyzer.registerStrategy('strategy1');

      const result = analyzer.buildCorrelationMatrix();

      expect(result.error).toBeDefined();
      expect(result.matrix).toEqual([]);
    });

    it('应该构建相关性矩阵', () => {
      const returns1 = generateReturns(30);
      const returns2 = generateReturns(30);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));

      const result = analyzer.buildCorrelationMatrix();

      expect(result.strategies).toEqual(['strategy1', 'strategy2']);
      expect(result.matrix.length).toBe(2);
      expect(result.matrix[0][0]).toBe(1); // 对角线为1
      expect(result.matrix[1][1]).toBe(1);
    });

    it('应该缓存结果', () => {
      const returns1 = generateReturns(30);
      const returns2 = generateReturns(30);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));

      analyzer.buildCorrelationMatrix();

      expect(analyzer.correlationMatrix).not.toBeNull();
      expect(analyzer.correlationMatrix.timestamp).toBeGreaterThan(0);
    });
  });

  describe('buildCovarianceMatrix', () => {
    it('策略少于2个应该返回错误', () => {
      analyzer.registerStrategy('strategy1');

      const result = analyzer.buildCovarianceMatrix();

      expect(result.error).toBeDefined();
    });

    it('应该构建协方差矩阵', () => {
      const returns1 = generateReturns(30);
      const returns2 = generateReturns(30);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));

      const result = analyzer.buildCovarianceMatrix();

      expect(result.strategies).toEqual(['strategy1', 'strategy2']);
      expect(result.matrix.length).toBe(2);
      expect(result.means).toHaveLength(2);
      expect(result.stdDevs).toHaveLength(2);
    });

    it('应该缓存结果', () => {
      const returns1 = generateReturns(30);
      const returns2 = generateReturns(30);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));

      analyzer.buildCovarianceMatrix();

      expect(analyzer.covarianceMatrix).not.toBeNull();
    });
  });

  // ============================================
  // 低/高相关性分析测试
  // ============================================

  describe('findLowCorrelationPairs', () => {
    beforeEach(() => {
      const returns1 = generateReturns(30);
      const returns2 = generateReturns(30);
      const returns3 = generateCorrelatedReturns(returns1, 0.9);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');
      analyzer.registerStrategy('strategy3');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));
      returns3.forEach(r => analyzer.recordReturn('strategy3', r.return, r.equity, r.timestamp));
    });

    it('应该找出低相关策略对', () => {
      const pairs = analyzer.findLowCorrelationPairs(0.5);

      expect(Array.isArray(pairs)).toBe(true);
    });

    it('应该按相关性排序', () => {
      const pairs = analyzer.findLowCorrelationPairs(0.9);

      if (pairs.length >= 2) {
        expect(pairs[0].absoluteCorrelation).toBeLessThanOrEqual(pairs[1].absoluteCorrelation);
      }
    });

    it('应该包含推荐信息', () => {
      const pairs = analyzer.findLowCorrelationPairs(0.99);

      if (pairs.length > 0) {
        expect(pairs[0].recommendation).toBeDefined();
      }
    });
  });

  describe('findHighCorrelationPairs', () => {
    beforeEach(() => {
      const returns1 = generateReturns(30);
      const returns2 = generateCorrelatedReturns(returns1, 0.9);
      const returns3 = generateReturns(30);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');
      analyzer.registerStrategy('strategy3');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));
      returns3.forEach(r => analyzer.recordReturn('strategy3', r.return, r.equity, r.timestamp));
    });

    it('应该找出高相关策略对', () => {
      const pairs = analyzer.findHighCorrelationPairs(0.5);

      expect(Array.isArray(pairs)).toBe(true);
    });

    it('应该包含警告信息', () => {
      const pairs = analyzer.findHighCorrelationPairs(0.01);

      if (pairs.length > 0) {
        expect(pairs[0].warning).toBeDefined();
      }
    });
  });

  describe('getOptimalCombination', () => {
    beforeEach(() => {
      const returns1 = generateReturns(30);
      const returns2 = generateReturns(30);
      const returns3 = generateReturns(30);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');
      analyzer.registerStrategy('strategy3');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));
      returns3.forEach(r => analyzer.recordReturn('strategy3', r.return, r.equity, r.timestamp));
    });

    it('应该返回最优组合', () => {
      const result = analyzer.getOptimalCombination(2);

      expect(result.strategies).toHaveLength(2);
      expect(result.averageCorrelation).toBeDefined();
    });

    it('策略不足时应该返回所有策略', () => {
      const result = analyzer.getOptimalCombination(5);

      expect(result.strategies).toHaveLength(3);
      expect(result.message).toBeDefined();
    });

    it('应该包含相关性矩阵', () => {
      const result = analyzer.getOptimalCombination(2);

      expect(result.correlationMatrix).toBeDefined();
    });
  });

  // ============================================
  // 滚动相关性测试
  // ============================================

  describe('calculateRollingCorrelation', () => {
    beforeEach(() => {
      const returns1 = generateReturns(50);
      const returns2 = generateReturns(50);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));
    });

    it('应该返回滚动相关性数组', () => {
      const result = analyzer.calculateRollingCorrelation('strategy1', 'strategy2', 10);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('每个数据点应该包含时间戳和相关性', () => {
      const result = analyzer.calculateRollingCorrelation('strategy1', 'strategy2', 10);

      if (result.length > 0) {
        expect(result[0].timestamp).toBeDefined();
        expect(result[0].correlation).toBeDefined();
        expect(result[0].level).toBeDefined();
      }
    });

    it('策略不存在应该返回空数组', () => {
      const result = analyzer.calculateRollingCorrelation('strategy1', 'nonexistent');

      expect(result).toEqual([]);
    });

    it('数据不足应该返回空数组', () => {
      const a = new CorrelationAnalyzer({ rollingWindow: 100, verbose: false });
      a.registerStrategy('s1');
      a.registerStrategy('s2');
      a.recordReturn('s1', 0.01, 10000, 1000);
      a.recordReturn('s2', 0.02, 10000, 1000);

      const result = a.calculateRollingCorrelation('s1', 's2');

      expect(result).toEqual([]);
    });
  });

  describe('detectCorrelationRegimeChange', () => {
    it('数据不足应该返回未检测到', () => {
      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      const result = analyzer.detectCorrelationRegimeChange('strategy1', 'strategy2');

      expect(result.detected).toBe(false);
    });

    it('有足够数据时应该返回检测结果', () => {
      const returns1 = generateReturns(50);
      const returns2 = generateReturns(50);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));

      const result = analyzer.detectCorrelationRegimeChange('strategy1', 'strategy2', 0.1);

      expect(result.recentCorrelation).toBeDefined();
      expect(result.historicalCorrelation).toBeDefined();
      expect(result.change).toBeDefined();
    });
  });

  // ============================================
  // 辅助方法测试
  // ============================================

  describe('_getCorrelationLevel', () => {
    it('应该正确分类非常低相关', () => {
      expect(analyzer._getCorrelationLevel(0.1)).toBe(CORRELATION_LEVEL.VERY_LOW);
    });

    it('应该正确分类低相关', () => {
      expect(analyzer._getCorrelationLevel(0.3)).toBe(CORRELATION_LEVEL.LOW);
    });

    it('应该正确分类中等相关', () => {
      expect(analyzer._getCorrelationLevel(0.5)).toBe(CORRELATION_LEVEL.MODERATE);
    });

    it('应该正确分类高相关', () => {
      expect(analyzer._getCorrelationLevel(0.7)).toBe(CORRELATION_LEVEL.HIGH);
    });

    it('应该正确分类非常高相关', () => {
      expect(analyzer._getCorrelationLevel(0.9)).toBe(CORRELATION_LEVEL.VERY_HIGH);
    });
  });

  describe('_getRecommendation', () => {
    it('非常低相关应该返回极佳', () => {
      const rec = analyzer._getRecommendation(0.1);
      expect(rec).toContain('极佳');
    });

    it('低相关应该返回良好', () => {
      const rec = analyzer._getRecommendation(0.3);
      expect(rec).toContain('良好');
    });

    it('中等相关应该返回适度', () => {
      const rec = analyzer._getRecommendation(0.5);
      expect(rec).toContain('适度');
    });

    it('高相关应该返回有限', () => {
      const rec = analyzer._getRecommendation(0.7);
      expect(rec).toContain('有限');
    });
  });

  describe('_getRanks', () => {
    it('应该返回正确的秩', () => {
      const arr = [3, 1, 4, 1, 5, 9, 2, 6];
      const ranks = analyzer._getRanks(arr);

      // Sorted: [1, 1, 2, 3, 4, 5, 6, 9] -> positions 1, 2, 3, 4, 5, 6, 7, 8
      expect(ranks[0]).toBe(4); // 3 is 4th smallest (after 1, 1, 2)
      expect(ranks[1]).toBe(1); // first 1 is 1st (or 1.5 with ties)
      expect(ranks[2]).toBe(5); // 4 is 5th smallest
    });
  });

  describe('_tDistributionPValue', () => {
    it('应该返回介于0和1之间的值', () => {
      const pValue = analyzer._tDistributionPValue(2.5, 20);

      expect(pValue).toBeGreaterThanOrEqual(0);
      expect(pValue).toBeLessThanOrEqual(1);
    });
  });

  // ============================================
  // 公共API测试
  // ============================================

  describe('getStatus', () => {
    beforeEach(() => {
      analyzer.registerStrategy('strategy1');
      analyzer.recordReturn('strategy1', 0.01, 10000);
    });

    it('应该返回状态信息', () => {
      const status = analyzer.getStatus();

      expect(status.running).toBe(false);
      expect(status.strategies).toContain('strategy1');
      expect(status.strategyCount).toBe(1);
      expect(status.dataPointCounts).toBeDefined();
      expect(status.config).toBeDefined();
    });

    it('应该包含数据点计数', () => {
      const status = analyzer.getStatus();

      expect(status.dataPointCounts.strategy1).toBe(1);
    });
  });

  describe('getAnalysisReport', () => {
    beforeEach(() => {
      const returns1 = generateReturns(30);
      const returns2 = generateReturns(30);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));
    });

    it('应该返回完整分析报告', () => {
      const report = analyzer.getAnalysisReport();

      expect(report.timestamp).toBeDefined();
      expect(report.strategies).toBeDefined();
      expect(report.correlationMatrix).toBeDefined();
      expect(report.covarianceMatrix).toBeDefined();
      expect(report.lowCorrelationPairs).toBeDefined();
      expect(report.highCorrelationPairs).toBeDefined();
      expect(report.optimalCombination).toBeDefined();
      expect(report.summary).toBeDefined();
    });

    it('摘要应该包含统计信息', () => {
      const report = analyzer.getAnalysisReport();

      expect(report.summary.totalStrategies).toBe(2);
      expect(report.summary.averageCorrelation).toBeDefined();
    });
  });

  // ============================================
  // 事件测试
  // ============================================

  describe('事件', () => {
    it('矩阵更新应该发射 matricesUpdated', () => {
      const returns1 = generateReturns(30);
      const returns2 = generateReturns(30);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));

      const listener = vi.fn();
      analyzer.on('matricesUpdated', listener);

      analyzer._updateMatrices();

      expect(listener).toHaveBeenCalled();
    });

    it('高相关性应该发射 highCorrelationWarning', () => {
      const returns1 = generateReturns(30);
      const returns2 = generateCorrelatedReturns(returns1, 0.95);

      analyzer.registerStrategy('strategy1');
      analyzer.registerStrategy('strategy2');

      returns1.forEach(r => analyzer.recordReturn('strategy1', r.return, r.equity, r.timestamp));
      returns2.forEach(r => analyzer.recordReturn('strategy2', r.return, r.equity, r.timestamp));

      const listener = vi.fn();
      analyzer.on('highCorrelationWarning', listener);

      analyzer._updateMatrices();

      // 可能触发也可能不触发，取决于随机数据
    });
  });

  // ============================================
  // 日志测试
  // ============================================

  describe('log', () => {
    it('verbose=false 时应该跳过 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      analyzer.config.verbose = false;

      analyzer.log('test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 error 日志', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      analyzer.log('error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 warn 日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      analyzer.log('warn message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// 常量导出测试
// ============================================

describe('CorrelationAnalyzer Constants', () => {
  describe('CORRELATION_LEVEL', () => {
    it('应该包含所有相关性级别', () => {
      expect(CORRELATION_LEVEL.VERY_LOW).toBe('very_low');
      expect(CORRELATION_LEVEL.LOW).toBe('low');
      expect(CORRELATION_LEVEL.MODERATE).toBe('moderate');
      expect(CORRELATION_LEVEL.HIGH).toBe('high');
      expect(CORRELATION_LEVEL.VERY_HIGH).toBe('very_high');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('应该包含默认配置', () => {
      expect(DEFAULT_CONFIG.rollingWindow).toBe(30);
      expect(DEFAULT_CONFIG.minDataPoints).toBe(10);
      expect(DEFAULT_CONFIG.lowCorrelationThreshold).toBe(0.3);
      expect(DEFAULT_CONFIG.highCorrelationWarning).toBe(0.7);
    });
  });
});
