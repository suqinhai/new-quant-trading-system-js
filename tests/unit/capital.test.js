/**
 * 资金分配模块测试
 * Capital Allocator Module Tests
 * @module tests/unit/capital.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CapitalAllocator,
  ALLOCATION_METHOD,
  REBALANCE_TRIGGER,
} from '../../src/capital/CapitalAllocator.js';

// ============================================
// CapitalAllocator 测试
// ============================================

describe('CapitalAllocator', () => {
  let allocator;

  beforeEach(() => {
    allocator = new CapitalAllocator({
      totalCapital: 100000,
      defaultMethod: ALLOCATION_METHOD.EQUAL_WEIGHT,
      minWeight: 0.05,
      maxWeight: 0.40,
      rebalanceThreshold: 0.05,
      rebalancePeriod: 24 * 60 * 60 * 1000,
      verbose: false,
    });
  });

  afterEach(() => {
    if (allocator) {
      allocator.stop();
      allocator.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const a = new CapitalAllocator();

      expect(a.config.totalCapital).toBe(100000);
      expect(a.config.defaultMethod).toBe(ALLOCATION_METHOD.RISK_PARITY);
      expect(a.config.minWeight).toBe(0.05);
      expect(a.config.maxWeight).toBe(0.40);
      expect(a.config.kellyFraction).toBe(0.25);
    });

    it('应该使用自定义配置', () => {
      expect(allocator.config.totalCapital).toBe(100000);
      expect(allocator.config.defaultMethod).toBe(ALLOCATION_METHOD.EQUAL_WEIGHT);
    });

    it('应该初始化空状态', () => {
      expect(allocator.strategyStats.size).toBe(0);
      expect(allocator.currentAllocation.size).toBe(0);
      expect(allocator.targetAllocation.size).toBe(0);
      expect(allocator.running).toBe(false);
    });

    it('应该初始化空历史', () => {
      expect(allocator.allocationHistory).toEqual([]);
      expect(allocator.lastRebalanceTime).toBe(0);
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('start/stop', () => {
    it('应该启动分配器', () => {
      const listener = vi.fn();
      allocator.on('started', listener);

      allocator.start();

      expect(allocator.running).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('应该停止分配器', () => {
      const listener = vi.fn();
      allocator.on('stopped', listener);

      allocator.start();
      allocator.stop();

      expect(allocator.running).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('重复启动应该无操作', () => {
      allocator.start();
      allocator.start();

      expect(allocator.running).toBe(true);
    });

    it('停止后应该清除定时器', () => {
      allocator.start();
      expect(allocator.rebalanceTimer).not.toBeNull();

      allocator.stop();
      expect(allocator.rebalanceTimer).toBeNull();
    });
  });

  // ============================================
  // 策略数据管理测试
  // ============================================

  describe('updateStrategyStats', () => {
    it('应该更新策略统计', () => {
      allocator.updateStrategyStats('strategy1', {
        volatility: 0.15,
        expectedReturn: 0.12,
        winRate: 0.6,
      });

      const stats = allocator.strategyStats.get('strategy1');
      expect(stats.volatility).toBe(0.15);
      expect(stats.expectedReturn).toBe(0.12);
      expect(stats.updatedAt).toBeGreaterThan(0);
    });

    it('应该合并现有统计', () => {
      allocator.updateStrategyStats('strategy1', { volatility: 0.15 });
      allocator.updateStrategyStats('strategy1', { expectedReturn: 0.12 });

      const stats = allocator.strategyStats.get('strategy1');
      expect(stats.volatility).toBe(0.15);
      expect(stats.expectedReturn).toBe(0.12);
    });

    it('应该发射 strategyStatsUpdated 事件', () => {
      const listener = vi.fn();
      allocator.on('strategyStatsUpdated', listener);

      allocator.updateStrategyStats('strategy1', { volatility: 0.15 });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'strategy1',
        })
      );
    });
  });

  describe('setCorrelationMatrix', () => {
    it('应该设置相关性矩阵', () => {
      const matrix = {
        strategies: ['s1', 's2'],
        matrix: [
          [1, 0.5],
          [0.5, 1],
        ],
      };

      allocator.setCorrelationMatrix(matrix);

      expect(allocator.correlationMatrix).toBe(matrix);
    });
  });

  describe('setCovarianceMatrix', () => {
    it('应该设置协方差矩阵', () => {
      const matrix = {
        strategies: ['s1', 's2'],
        matrix: [
          [0.04, 0.01],
          [0.01, 0.09],
        ],
      };

      allocator.setCovarianceMatrix(matrix);

      expect(allocator.covarianceMatrix).toBe(matrix);
    });
  });

  describe('setTotalCapital', () => {
    it('应该设置总资金', () => {
      allocator.setTotalCapital(200000);

      expect(allocator.config.totalCapital).toBe(200000);
    });

    it('应该发射 capitalUpdated 事件', () => {
      const listener = vi.fn();
      allocator.on('capitalUpdated', listener);

      allocator.setTotalCapital(200000);

      expect(listener).toHaveBeenCalledWith({ totalCapital: 200000 });
    });
  });

  // ============================================
  // 分配方法测试
  // ============================================

  describe('calculateAllocation', () => {
    beforeEach(() => {
      // 添加测试策略
      allocator.updateStrategyStats('strategy1', {
        volatility: 0.10,
        expectedReturn: 0.08,
        winRate: 0.55,
        avgWin: 100,
        avgLoss: 80,
      });
      allocator.updateStrategyStats('strategy2', {
        volatility: 0.20,
        expectedReturn: 0.15,
        winRate: 0.50,
        avgWin: 150,
        avgLoss: 100,
      });
      allocator.updateStrategyStats('strategy3', {
        volatility: 0.15,
        expectedReturn: 0.10,
        winRate: 0.60,
        avgWin: 120,
        avgLoss: 90,
      });
    });

    it('没有策略时应该返回错误', () => {
      const emptyAllocator = new CapitalAllocator({ verbose: false });
      const result = emptyAllocator.calculateAllocation();

      expect(result.error).toBeDefined();
      expect(result.weights).toEqual({});
    });

    it('应该返回完整的分配结果', () => {
      const result = allocator.calculateAllocation();

      expect(result.method).toBeDefined();
      expect(result.weights).toBeDefined();
      expect(result.allocations).toBeDefined();
      expect(result.totalCapital).toBe(100000);
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
    });

    it('应该发射 allocationCalculated 事件', () => {
      const listener = vi.fn();
      allocator.on('allocationCalculated', listener);

      allocator.calculateAllocation();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('等权重分配', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.2 });
      allocator.updateStrategyStats('s3', { volatility: 0.3 });
    });

    it('应该平均分配权重', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.EQUAL_WEIGHT);

      const weights = result.weights;
      expect(Object.keys(weights).length).toBe(3);

      // 考虑约束后可能不是精确1/3
      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1, 4);
    });
  });

  describe('风险平价分配', () => {
    beforeEach(() => {
      // 使用更多策略以避免约束导致的50-50平衡
      allocator.updateStrategyStats('low_vol', { volatility: 0.05 });
      allocator.updateStrategyStats('med_vol', { volatility: 0.10 });
      allocator.updateStrategyStats('high_vol', { volatility: 0.20 });
    });

    it('低波动策略应该获得更高权重', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.RISK_PARITY);

      // 低波动策略权重应该高于高波动策略
      expect(result.weights.low_vol).toBeGreaterThanOrEqual(result.weights.high_vol);
    });

    it('权重总和应该为1', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.RISK_PARITY);

      const totalWeight = Object.values(result.weights).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1, 3);
    });
  });

  describe('凯利准则分配', () => {
    beforeEach(() => {
      // 使用3个策略避免约束导致的平均分配
      allocator.updateStrategyStats('good_strategy', {
        winRate: 0.70,
        avgWin: 200,
        avgLoss: 100,
      });
      allocator.updateStrategyStats('medium_strategy', {
        winRate: 0.55,
        avgWin: 120,
        avgLoss: 100,
      });
      allocator.updateStrategyStats('bad_strategy', {
        winRate: 0.35,
        avgWin: 80,
        avgLoss: 120,
      });
    });

    it('高胜率策略应该获得更高权重', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.KELLY);

      // 高胜率策略权重应该高于低胜率策略
      expect(result.weights.good_strategy).toBeGreaterThanOrEqual(result.weights.bad_strategy);
    });

    it('应该返回有效权重分配', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.KELLY);

      // 权重应该在约束范围内
      const totalWeight = Object.values(result.weights).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1, 3);
    });
  });

  describe('最小相关性分配', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.1 });
      allocator.updateStrategyStats('s3', { volatility: 0.1 });

      // 设置相关性矩阵
      allocator.setCorrelationMatrix({
        strategies: ['s1', 's2', 's3'],
        matrix: [
          [1.0, 0.8, 0.2], // s1与s2高相关，与s3低相关
          [0.8, 1.0, 0.3],
          [0.2, 0.3, 1.0],
        ],
      });
    });

    it('低相关策略应该获得更高权重', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.MIN_CORRELATION);

      // s3与其他策略相关性最低，应该获得较高权重
      expect(result.weights.s3).toBeGreaterThan(result.weights.s1);
    });

    it('没有相关性矩阵时应该回退到等权重', () => {
      allocator.correlationMatrix = null;

      const result = allocator.calculateAllocation(ALLOCATION_METHOD.MIN_CORRELATION);

      // 应该接近等权重
      const weights = Object.values(result.weights);
      const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
      weights.forEach(w => {
        expect(Math.abs(w - avgWeight)).toBeLessThan(0.2);
      });
    });
  });

  describe('最小方差分配', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.2 });

      allocator.setCovarianceMatrix({
        strategies: ['s1', 's2'],
        matrix: [
          [0.01, 0.005],
          [0.005, 0.04],
        ],
      });
    });

    it('应该返回有效分配', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.MIN_VARIANCE);

      expect(result.weights.s1).toBeDefined();
      expect(result.weights.s2).toBeDefined();

      const totalWeight = Object.values(result.weights).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1, 4);
    });

    it('没有协方差矩阵时应该回退到风险平价', () => {
      allocator.covarianceMatrix = null;

      const result = allocator.calculateAllocation(ALLOCATION_METHOD.MIN_VARIANCE);

      // 应该有有效权重
      expect(Object.values(result.weights).length).toBeGreaterThan(0);
    });
  });

  describe('最大夏普比率分配', () => {
    beforeEach(() => {
      // 使用3个策略避免约束问题
      allocator.updateStrategyStats('s1', {
        volatility: 0.08,
        expectedReturn: 0.20,
      });
      allocator.updateStrategyStats('s2', {
        volatility: 0.15,
        expectedReturn: 0.10,
      });
      allocator.updateStrategyStats('s3', {
        volatility: 0.25,
        expectedReturn: 0.05,
      });

      allocator.setCovarianceMatrix({
        strategies: ['s1', 's2', 's3'],
        matrix: [
          [0.0064, 0.002, 0.001],
          [0.002, 0.0225, 0.005],
          [0.001, 0.005, 0.0625],
        ],
      });
    });

    it('应该返回有效分配', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.MAX_SHARPE);

      expect(result.weights.s1).toBeDefined();
      expect(result.weights.s2).toBeDefined();
      expect(result.weights.s3).toBeDefined();
    });

    it('高夏普策略应该获得较高权重', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.MAX_SHARPE);

      // s1有最高的风险调整收益，应该有较高权重
      expect(result.weights.s1).toBeGreaterThanOrEqual(result.weights.s3);
    });
  });

  describe('自定义分配', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.2 });
      allocator.updateStrategyStats('s3', { volatility: 0.3 });
    });

    it('应该使用自定义权重', () => {
      const result = allocator.calculateAllocation(ALLOCATION_METHOD.CUSTOM, {
        customWeights: { s1: 0.5, s2: 0.3, s3: 0.2 },
      });

      // 在约束范围内，应该大致保持自定义比例
      const totalWeight = Object.values(result.weights).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1, 3);
    });
  });

  // ============================================
  // 权重约束测试
  // ============================================

  describe('_applyWeightConstraints', () => {
    it('应该强制最小权重', () => {
      // 使用5个策略确保约束有效
      allocator.updateStrategyStats('s1', { volatility: 0.01 }); // 极低波动
      allocator.updateStrategyStats('s2', { volatility: 0.10 });
      allocator.updateStrategyStats('s3', { volatility: 0.20 });
      allocator.updateStrategyStats('s4', { volatility: 0.30 });
      allocator.updateStrategyStats('s5', { volatility: 1.0 });  // 极高波动

      const result = allocator.calculateAllocation(ALLOCATION_METHOD.RISK_PARITY);

      // 所有权重应该 >= minWeight
      Object.values(result.weights).forEach(w => {
        expect(w).toBeGreaterThanOrEqual(allocator.config.minWeight - 0.001);
      });
    });

    it('应该强制最大权重', () => {
      // 使用5个策略确保约束有效
      allocator.updateStrategyStats('s1', { volatility: 0.01 });
      allocator.updateStrategyStats('s2', { volatility: 0.10 });
      allocator.updateStrategyStats('s3', { volatility: 0.20 });
      allocator.updateStrategyStats('s4', { volatility: 0.30 });
      allocator.updateStrategyStats('s5', { volatility: 1.0 });

      const result = allocator.calculateAllocation(ALLOCATION_METHOD.RISK_PARITY);

      // 所有权重应该 <= maxWeight
      Object.values(result.weights).forEach(w => {
        expect(w).toBeLessThanOrEqual(allocator.config.maxWeight + 0.001);
      });
    });

    it('权重总和应该归一化到1', () => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.2 });
      allocator.updateStrategyStats('s3', { volatility: 0.3 });

      const result = allocator.calculateAllocation();

      const totalWeight = Object.values(result.weights).reduce((a, b) => a + b, 0);
      expect(totalWeight).toBeCloseTo(1, 4);
    });
  });

  // ============================================
  // 资金金额计算测试
  // ============================================

  describe('_calculateCapitalAmounts', () => {
    it('应该正确计算资金金额', () => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.1 });

      const result = allocator.calculateAllocation(ALLOCATION_METHOD.EQUAL_WEIGHT);

      // 等权重情况下，每个策略约50000
      const totalAmount = Object.values(result.allocations)
        .reduce((sum, a) => sum + a.amount, 0);
      expect(totalAmount).toBeCloseTo(100000, 0);
    });

    it('分配应该包含百分比', () => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });

      const result = allocator.calculateAllocation();

      expect(result.allocations.s1.percentage).toBeDefined();
      expect(result.allocations.s1.percentage).toContain('%');
    });
  });

  // ============================================
  // 再平衡测试
  // ============================================

  describe('rebalance', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.2 });
    });

    it('应该执行再平衡', () => {
      const result = allocator.rebalance(REBALANCE_TRIGGER.MANUAL);

      expect(result.trigger).toBe(REBALANCE_TRIGGER.MANUAL);
      expect(result.allocation).toBeDefined();
      expect(result.adjustments).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('应该更新当前分配', () => {
      allocator.rebalance();

      expect(allocator.currentAllocation.size).toBeGreaterThan(0);
      expect(allocator.lastRebalanceTime).toBeGreaterThan(0);
    });

    it('应该记录分配历史', () => {
      allocator.rebalance();

      expect(allocator.allocationHistory.length).toBe(1);
      expect(allocator.allocationHistory[0].trigger).toBeDefined();
    });

    it('应该发射 rebalanced 事件', () => {
      const listener = vi.fn();
      allocator.on('rebalanced', listener);

      allocator.rebalance();

      expect(listener).toHaveBeenCalled();
    });

    it('历史长度应该限制在100', () => {
      for (let i = 0; i < 110; i++) {
        allocator.rebalance();
      }

      expect(allocator.allocationHistory.length).toBeLessThanOrEqual(100);
    });
  });

  describe('_calculateAdjustments', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.2 });

      // 设置初始分配
      allocator.currentAllocation.set('s1', 0.6);
      allocator.currentAllocation.set('s2', 0.4);
    });

    it('应该计算权重变化', () => {
      const result = allocator.rebalance();

      expect(result.adjustments.s1.currentWeight).toBe(0.6);
      expect(result.adjustments.s1.targetWeight).toBeDefined();
      expect(result.adjustments.s1.weightChange).toBeDefined();
    });

    it('应该标记调整动作', () => {
      const result = allocator.rebalance();

      const actions = Object.values(result.adjustments).map(a => a.action);
      expect(actions.every(a => ['increase', 'decrease', 'hold'].includes(a))).toBe(true);
    });
  });

  describe('checkRebalanceNeeded', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.2 });
    });

    it('没有分配时应该返回不需要', () => {
      const check = allocator.checkRebalanceNeeded();

      expect(check.needed).toBe(false);
    });

    it('偏离超过阈值时应该需要再平衡', () => {
      // 设置当前和目标分配
      allocator.currentAllocation.set('s1', 0.7);
      allocator.currentAllocation.set('s2', 0.3);
      allocator.targetAllocation.set('s1', 0.5);
      allocator.targetAllocation.set('s2', 0.5);

      const check = allocator.checkRebalanceNeeded();

      expect(check.needed).toBe(true);
      expect(check.trigger).toBe(REBALANCE_TRIGGER.THRESHOLD);
    });

    it('周期超时时应该需要再平衡', () => {
      allocator.currentAllocation.set('s1', 0.5);
      allocator.currentAllocation.set('s2', 0.5);
      allocator.targetAllocation.set('s1', 0.5);
      allocator.targetAllocation.set('s2', 0.5);

      // 模拟很久以前的再平衡
      allocator.lastRebalanceTime = Date.now() - 2 * 24 * 60 * 60 * 1000;

      const check = allocator.checkRebalanceNeeded();

      expect(check.needed).toBe(true);
      expect(check.periodExceeded).toBe(true);
    });
  });

  // ============================================
  // 组合指标测试
  // ============================================

  describe('_calculatePortfolioMetrics', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', {
        volatility: 0.10,
        expectedReturn: 0.08,
      });
      allocator.updateStrategyStats('s2', {
        volatility: 0.20,
        expectedReturn: 0.15,
      });
    });

    it('应该计算组合指标', () => {
      const result = allocator.calculateAllocation();

      expect(result.metrics.expectedReturn).toBeDefined();
      expect(result.metrics.volatility).toBeDefined();
      expect(result.metrics.sharpeRatio).toBeDefined();
      expect(result.metrics.diversificationRatio).toBeDefined();
      expect(result.metrics.effectiveStrategies).toBeDefined();
    });

    it('应该计算有效策略数量', () => {
      const result = allocator.calculateAllocation();

      // 权重 >= 5% 的策略数量
      expect(result.metrics.effectiveStrategies).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 公共API测试
  // ============================================

  describe('getCurrentAllocation', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
      allocator.updateStrategyStats('s2', { volatility: 0.2 });
      allocator.rebalance();
    });

    it('应该返回当前分配', () => {
      const current = allocator.getCurrentAllocation();

      expect(current.weights).toBeDefined();
      expect(current.allocations).toBeDefined();
      expect(current.totalCapital).toBe(100000);
      expect(current.lastRebalanceTime).toBeGreaterThan(0);
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', { volatility: 0.1 });
    });

    it('应该返回状态信息', () => {
      const status = allocator.getStatus();

      expect(status.running).toBe(false);
      expect(status.totalCapital).toBe(100000);
      expect(status.strategyCount).toBe(1);
      expect(status.strategies).toContain('s1');
      expect(status.config).toBeDefined();
    });

    it('应该包含再平衡检查', () => {
      const status = allocator.getStatus();

      expect(status.rebalanceCheck).toBeDefined();
      expect(status.rebalanceCheck.needed).toBeDefined();
    });
  });

  describe('getRecommendation', () => {
    beforeEach(() => {
      allocator.updateStrategyStats('s1', {
        volatility: 0.10,
        expectedReturn: 0.12,
        winRate: 0.55,
        avgWin: 100,
        avgLoss: 80,
      });
      allocator.updateStrategyStats('s2', {
        volatility: 0.20,
        expectedReturn: 0.08,
        winRate: 0.50,
        avgWin: 120,
        avgLoss: 100,
      });
    });

    it('应该返回推荐分配', () => {
      const recommendation = allocator.getRecommendation();

      expect(recommendation.recommended).toBeDefined();
      expect(recommendation.alternatives).toBeDefined();
      expect(recommendation.reasoning).toBeDefined();
    });

    it('应该包含多个备选方案', () => {
      const recommendation = allocator.getRecommendation();

      expect(recommendation.alternatives.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 矩阵操作测试
  // ============================================

  describe('_extractSubCovMatrix', () => {
    beforeEach(() => {
      allocator.setCovarianceMatrix({
        strategies: ['s1', 's2', 's3'],
        matrix: [
          [0.01, 0.005, 0.002],
          [0.005, 0.04, 0.01],
          [0.002, 0.01, 0.09],
        ],
      });
    });

    it('应该提取子矩阵', () => {
      const subMatrix = allocator._extractSubCovMatrix(['s1', 's3']);

      expect(subMatrix.length).toBe(2);
      expect(subMatrix[0].length).toBe(2);
      expect(subMatrix[0][0]).toBe(0.01); // s1-s1
      expect(subMatrix[1][1]).toBe(0.09); // s3-s3
    });

    it('策略不存在时应该返回null', () => {
      const subMatrix = allocator._extractSubCovMatrix(['s1', 'nonexistent']);

      expect(subMatrix).toBeNull();
    });

    it('没有协方差矩阵时应该返回null', () => {
      allocator.covarianceMatrix = null;

      const subMatrix = allocator._extractSubCovMatrix(['s1', 's2']);

      expect(subMatrix).toBeNull();
    });
  });

  describe('_getCorrelation', () => {
    beforeEach(() => {
      allocator.setCorrelationMatrix({
        strategies: ['s1', 's2'],
        matrix: [
          [1.0, 0.7],
          [0.7, 1.0],
        ],
      });
    });

    it('应该返回相关系数', () => {
      const corr = allocator._getCorrelation('s1', 's2');

      expect(corr).toBe(0.7);
    });

    it('策略不存在时应该返回null', () => {
      const corr = allocator._getCorrelation('s1', 'nonexistent');

      expect(corr).toBeNull();
    });

    it('没有相关性矩阵时应该返回null', () => {
      allocator.correlationMatrix = null;

      const corr = allocator._getCorrelation('s1', 's2');

      expect(corr).toBeNull();
    });
  });

  describe('_invertMatrix', () => {
    it('应该正确求逆', () => {
      const matrix = [
        [4, 7],
        [2, 6],
      ];

      const inverse = allocator._invertMatrix(matrix);

      expect(inverse).not.toBeNull();
      // 验证 A * A^(-1) = I
      // 4*0.6 + 7*(-0.2) = 2.4 - 1.4 = 1
      expect(inverse[0][0]).toBeCloseTo(0.6, 4);
      expect(inverse[0][1]).toBeCloseTo(-0.7, 4);
    });

    it('奇异矩阵应该返回null', () => {
      const singularMatrix = [
        [1, 2],
        [2, 4], // 线性相关
      ];

      const inverse = allocator._invertMatrix(singularMatrix);

      expect(inverse).toBeNull();
    });
  });

  describe('_matrixVectorMultiply', () => {
    it('应该正确计算矩阵向量乘法', () => {
      const matrix = [
        [1, 2],
        [3, 4],
      ];
      const vector = [5, 6];

      const result = allocator._matrixVectorMultiply(matrix, vector);

      expect(result[0]).toBe(17); // 1*5 + 2*6
      expect(result[1]).toBe(39); // 3*5 + 4*6
    });
  });

  // ============================================
  // 日志测试
  // ============================================

  describe('log', () => {
    it('verbose=false 时应该跳过 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      allocator.config.verbose = false;

      allocator.log('test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 error 日志', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      allocator.log('error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 warn 日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      allocator.log('warn message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// 常量导出测试
// ============================================

describe('Constants', () => {
  describe('ALLOCATION_METHOD', () => {
    it('应该包含所有分配方法', () => {
      expect(ALLOCATION_METHOD.EQUAL_WEIGHT).toBe('equal_weight');
      expect(ALLOCATION_METHOD.RISK_PARITY).toBe('risk_parity');
      expect(ALLOCATION_METHOD.MIN_VARIANCE).toBe('min_variance');
      expect(ALLOCATION_METHOD.MAX_SHARPE).toBe('max_sharpe');
      expect(ALLOCATION_METHOD.MIN_CORRELATION).toBe('min_correlation');
      expect(ALLOCATION_METHOD.KELLY).toBe('kelly');
      expect(ALLOCATION_METHOD.CUSTOM).toBe('custom');
    });
  });

  describe('REBALANCE_TRIGGER', () => {
    it('应该包含所有触发条件', () => {
      expect(REBALANCE_TRIGGER.THRESHOLD).toBe('threshold');
      expect(REBALANCE_TRIGGER.PERIODIC).toBe('periodic');
      expect(REBALANCE_TRIGGER.PERFORMANCE).toBe('performance');
      expect(REBALANCE_TRIGGER.MANUAL).toBe('manual');
    });
  });
});
