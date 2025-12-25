/**
 * SignalWeightingSystem 单元测试
 * Signal Weighting System Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SignalWeightingSystem,
  StrategyStatus,
  CircuitBreakReason,
} from '../../src/strategies/SignalWeightingSystem.js';

describe('SignalWeightingSystem', () => {
  let weightSystem;

  beforeEach(() => {
    // 创建基础实例
    weightSystem = new SignalWeightingSystem({
      threshold: 0.7,
      sellThreshold: 0.3,
      baseWeights: {},
      dynamicWeights: true,
      correlationLimit: true,
      circuitBreaker: true,
    });
  });

  // ============================================
  // 构造函数测试 / Constructor Tests
  // ============================================

  describe('Constructor', () => {
    it('should create instance with default config', () => {
      const system = new SignalWeightingSystem();

      expect(system.threshold).toBe(0.7);
      expect(system.sellThreshold).toBe(0.3);
      expect(system.weightAdjustment.enabled).toBe(true);
      expect(system.correlationConfig.enabled).toBe(true);
      expect(system.circuitBreaker.enabled).toBe(true);
    });

    it('should create instance with custom config', () => {
      const system = new SignalWeightingSystem({
        threshold: 0.8,
        sellThreshold: 0.2,
        dynamicWeights: false,
        correlationLimit: false,
        circuitBreaker: false,
        consecutiveLossLimit: 10,
        maxDrawdownLimit: 0.25,
      });

      expect(system.threshold).toBe(0.8);
      expect(system.sellThreshold).toBe(0.2);
      expect(system.weightAdjustment.enabled).toBe(false);
      expect(system.correlationConfig.enabled).toBe(false);
      expect(system.circuitBreaker.enabled).toBe(false);
      expect(system.circuitBreaker.consecutiveLossLimit).toBe(10);
      expect(system.circuitBreaker.maxDrawdown).toBe(0.25);
    });

    it('should initialize with base weights', () => {
      const system = new SignalWeightingSystem({
        baseWeights: { SMA: 0.4, RSI: 0.3, MACD: 0.3 },
      });

      expect(system.baseWeights).toEqual({ SMA: 0.4, RSI: 0.3, MACD: 0.3 });
      expect(system.currentWeights).toEqual({ SMA: 0.4, RSI: 0.3, MACD: 0.3 });
    });
  });

  // ============================================
  // 策略注册测试 / Strategy Registration Tests
  // ============================================

  describe('Strategy Registration', () => {
    it('should register single strategy', () => {
      weightSystem.registerStrategy('SMA', 0.5);

      expect(weightSystem.baseWeights.SMA).toBe(0.5);
      expect(weightSystem.currentWeights.SMA).toBe(0.5);
      expect(weightSystem.getStrategyStatus('SMA').status).toBe(StrategyStatus.ACTIVE);
    });

    it('should clamp weight to 0-1 range', () => {
      weightSystem.registerStrategy('A', 1.5);
      weightSystem.registerStrategy('B', -0.5);

      expect(weightSystem.baseWeights.A).toBe(1);
      expect(weightSystem.baseWeights.B).toBe(0);
    });

    it('should register multiple strategies', () => {
      weightSystem.registerStrategies({
        SMA: 0.4,
        RSI: 0.3,
        MACD: 0.3,
      });

      expect(weightSystem.baseWeights.SMA).toBe(0.4);
      expect(weightSystem.baseWeights.RSI).toBe(0.3);
      expect(weightSystem.baseWeights.MACD).toBe(0.3);
    });

    it('should initialize performance data on registration', () => {
      weightSystem.registerStrategy('SMA', 0.5);

      const perf = weightSystem.getPerformance('SMA');
      expect(perf).toBeDefined();
      expect(perf.trades).toBe(0);
      expect(perf.wins).toBe(0);
      expect(perf.losses).toBe(0);
      expect(perf.totalPnL).toBe(0);
    });

    it('should emit strategyRegistered event', () => {
      const callback = vi.fn();
      weightSystem.on('strategyRegistered', callback);

      weightSystem.registerStrategy('SMA', 0.5);

      expect(callback).toHaveBeenCalledWith({
        name: 'SMA',
        weight: 0.5,
        options: {},
      });
    });
  });

  // ============================================
  // 信号记录测试 / Signal Recording Tests
  // ============================================

  describe('Signal Recording', () => {
    beforeEach(() => {
      weightSystem.registerStrategies({ SMA: 0.4, RSI: 0.3, MACD: 0.3 });
    });

    it('should record signal for registered strategy', () => {
      weightSystem.recordSignal('SMA', 0.8);

      const result = weightSystem.calculateScore();
      expect(result.signals.SMA.rawScore).toBe(0.8);
    });

    it('should clamp score to 0-1 range', () => {
      weightSystem.recordSignal('SMA', 1.5);
      weightSystem.recordSignal('RSI', -0.5);

      const result = weightSystem.calculateScore();
      expect(result.signals.SMA.rawScore).toBe(1);
      expect(result.signals.RSI.rawScore).toBe(0);
    });

    it('should ignore unregistered strategy', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      weightSystem.recordSignal('UnknownStrategy', 0.8);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should neutralize signal for circuit-broken strategy', () => {
      // 触发熔断
      for (let i = 0; i < 5; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      }

      // 记录信号
      weightSystem.recordSignal('SMA', 0.9);

      const result = weightSystem.calculateScore();
      expect(result.signals.SMA.rawScore).toBe(0.5); // 被中和为 0.5
    });

    it('should clear current signals', () => {
      weightSystem.recordSignal('SMA', 0.8);
      weightSystem.recordSignal('RSI', 0.7);

      weightSystem.clearCurrentSignals();

      const result = weightSystem.calculateScore();
      expect(Object.keys(result.signals).length).toBe(0);
    });
  });

  // ============================================
  // 得分计算测试 / Score Calculation Tests
  // ============================================

  describe('Score Calculation', () => {
    beforeEach(() => {
      weightSystem.registerStrategies({ SMA: 0.4, RSI: 0.3, MACD: 0.3 });
    });

    it('should return neutral score when no signals', () => {
      const result = weightSystem.calculateScore();

      expect(result.score).toBe(0.5);
      expect(result.action).toBe('hold');
      expect(result.shouldTrade).toBe(false);
    });

    it('should calculate weighted score correctly', () => {
      weightSystem.recordSignal('SMA', 0.8);   // 0.8 * 0.4 = 0.32
      weightSystem.recordSignal('RSI', 0.7);   // 0.7 * 0.3 = 0.21
      weightSystem.recordSignal('MACD', 0.9);  // 0.9 * 0.3 = 0.27

      const result = weightSystem.calculateScore();

      // 总分 = (0.32 + 0.21 + 0.27) / 1.0 = 0.8
      expect(result.score).toBeCloseTo(0.8, 2);
    });

    it('should trigger buy action when score >= threshold', () => {
      weightSystem.recordSignal('SMA', 0.9);
      weightSystem.recordSignal('RSI', 0.9);
      weightSystem.recordSignal('MACD', 0.9);

      const result = weightSystem.calculateScore();

      expect(result.action).toBe('buy');
      expect(result.shouldTrade).toBe(true);
    });

    it('should trigger sell action when score <= sellThreshold', () => {
      weightSystem.recordSignal('SMA', 0.1);
      weightSystem.recordSignal('RSI', 0.2);
      weightSystem.recordSignal('MACD', 0.1);

      const result = weightSystem.calculateScore();

      expect(result.action).toBe('sell');
      expect(result.shouldTrade).toBe(true);
    });

    it('should hold when score is between thresholds', () => {
      weightSystem.recordSignal('SMA', 0.5);
      weightSystem.recordSignal('RSI', 0.5);
      weightSystem.recordSignal('MACD', 0.5);

      const result = weightSystem.calculateScore();

      expect(result.action).toBe('hold');
      expect(result.shouldTrade).toBe(false);
    });

    it('should calculate buy and sell scores separately', () => {
      weightSystem.recordSignal('SMA', 0.8);   // buyScore += (0.8-0.5)*2*0.4 = 0.24
      weightSystem.recordSignal('RSI', 0.3);   // sellScore += (0.5-0.3)*2*0.3 = 0.12
      weightSystem.recordSignal('MACD', 0.6);  // buyScore += (0.6-0.5)*2*0.3 = 0.06

      const result = weightSystem.calculateScore();

      expect(result.buyScore).toBeGreaterThan(0);
      expect(result.sellScore).toBeGreaterThan(0);
    });

    it('should emit scoreCalculated event', () => {
      const callback = vi.fn();
      weightSystem.on('scoreCalculated', callback);

      weightSystem.recordSignal('SMA', 0.8);
      weightSystem.calculateScore();

      expect(callback).toHaveBeenCalled();
    });

    it('should store score history', () => {
      weightSystem.recordSignal('SMA', 0.8);
      weightSystem.calculateScore();

      const history = weightSystem.getScoreHistory(1);
      expect(history.length).toBe(1);
      expect(history[0].score).toBeCloseTo(0.8, 2);
    });
  });

  // ============================================
  // 动态权重调整测试 / Dynamic Weight Adjustment Tests
  // ============================================

  describe('Dynamic Weight Adjustment', () => {
    beforeEach(() => {
      weightSystem = new SignalWeightingSystem({
        dynamicWeights: true,
        adjustmentFactor: 0.3,
        evaluationPeriod: 5,
        minWeight: 0.1,
        maxWeight: 0.6,
      });
      weightSystem.registerStrategy('SMA', 0.4);
    });

    it('should not adjust weight before evaluation period', () => {
      // 只更新 3 次，未达到评估周期
      for (let i = 0; i < 3; i++) {
        weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      }

      expect(weightSystem.currentWeights.SMA).toBe(0.4);
    });

    it('should increase weight for high win rate', () => {
      // 5 次全胜 (100% 胜率)
      for (let i = 0; i < 5; i++) {
        weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      }

      expect(weightSystem.currentWeights.SMA).toBeGreaterThan(0.4);
    });

    it('should decrease weight for low win rate', () => {
      // 5 次全败 (0% 胜率)
      for (let i = 0; i < 5; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      }

      // 注意：由于熔断机制，连续 5 次亏损可能触发熔断
      // 但权重在熔断前应该已调整
      const weight = weightSystem.currentWeights.SMA;
      expect(weight).toBeLessThanOrEqual(0.4);
    });

    it('should respect minWeight limit', () => {
      // 20 次全败 (触发多次评估)
      for (let i = 0; i < 20; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
        // 如果熔断了就恢复
        if (weightSystem.getStrategyStatus('SMA').status !== StrategyStatus.ACTIVE) {
          weightSystem.recoverStrategy('SMA');
        }
      }

      expect(weightSystem.currentWeights.SMA).toBeGreaterThanOrEqual(0.1);
    });

    it('should respect maxWeight limit', () => {
      // 20 次全胜
      for (let i = 0; i < 20; i++) {
        weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      }

      expect(weightSystem.currentWeights.SMA).toBeLessThanOrEqual(0.6);
    });

    it('should emit weightAdjusted event', () => {
      const callback = vi.fn();
      weightSystem.on('weightAdjusted', callback);

      // 5 次更新触发评估
      for (let i = 0; i < 5; i++) {
        weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      }

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].strategy).toBe('SMA');
    });

    it('should not adjust when dynamicWeights is disabled', () => {
      const system = new SignalWeightingSystem({
        dynamicWeights: false,
        evaluationPeriod: 5,
      });
      system.registerStrategy('SMA', 0.4);

      for (let i = 0; i < 10; i++) {
        system.updatePerformance('SMA', { profit: 0.01, win: true });
      }

      expect(system.currentWeights.SMA).toBe(0.4);
    });
  });

  // ============================================
  // 相关性限制测试 / Correlation Limit Tests
  // ============================================

  describe('Correlation Limit', () => {
    beforeEach(() => {
      weightSystem = new SignalWeightingSystem({
        correlationLimit: true,
        maxCorrelation: 0.5,
        correlationPenaltyFactor: 0.6,
        correlationMatrix: {
          'SMA-MACD': 0.8,  // 高相关
          'SMA-RSI': 0.3,   // 低相关
        },
      });
      weightSystem.registerStrategies({ SMA: 0.4, RSI: 0.3, MACD: 0.3 });
    });

    it('should penalize highly correlated strategies', () => {
      weightSystem.recordSignal('SMA', 0.8);
      weightSystem.recordSignal('MACD', 0.8);

      const result = weightSystem.calculateScore();

      // SMA-MACD 相关性 0.8 > 0.5，应被惩罚
      // 有效权重应低于原始权重
      expect(result.signals.SMA.weight).toBeLessThan(0.4);
      expect(result.signals.MACD.weight).toBeLessThan(0.3);
    });

    it('should not penalize uncorrelated strategies', () => {
      weightSystem.recordSignal('RSI', 0.8);

      const result = weightSystem.calculateScore();

      // RSI 单独使用，无相关性惩罚
      expect(result.signals.RSI.weight).toBe(0.3);
    });

    it('should reduce total weight when correlation is high', () => {
      weightSystem.recordSignal('SMA', 0.8);
      weightSystem.recordSignal('MACD', 0.8);

      const result = weightSystem.calculateScore();

      // 由于相关性惩罚，总权重应小于 0.4 + 0.3
      expect(result.totalWeight).toBeLessThan(0.7);
    });

    it('should not apply penalty when correlationLimit is disabled', () => {
      const system = new SignalWeightingSystem({
        correlationLimit: false,
        correlationMatrix: { 'SMA-MACD': 0.9 },
      });
      system.registerStrategies({ SMA: 0.5, MACD: 0.5 });

      system.recordSignal('SMA', 0.8);
      system.recordSignal('MACD', 0.8);

      const result = system.calculateScore();

      expect(result.signals.SMA.weight).toBe(0.5);
      expect(result.signals.MACD.weight).toBe(0.5);
    });

    it('should set correlation via setCorrelation method', () => {
      weightSystem.setCorrelation('RSI', 'MACD', 0.9);

      const matrix = weightSystem.getCorrelationMatrix();
      expect(matrix['MACD-RSI']).toBe(0.9);
    });

    it('should generate consistent correlation key regardless of order', () => {
      weightSystem.setCorrelation('A', 'B', 0.5);
      weightSystem.setCorrelation('B', 'A', 0.6);

      const matrix = weightSystem.getCorrelationMatrix();
      // 后设置的会覆盖前面的
      expect(matrix['A-B']).toBe(0.6);
    });
  });

  // ============================================
  // 熔断机制测试 / Circuit Breaker Tests
  // ============================================

  describe('Circuit Breaker', () => {
    beforeEach(() => {
      weightSystem = new SignalWeightingSystem({
        circuitBreaker: true,
        consecutiveLossLimit: 3,
        maxDrawdownLimit: 0.1,
        minWinRate: 0.35,
        evaluationWindow: 10,
        coolingPeriod: 1000,
        autoRecover: true,
      });
      weightSystem.registerStrategy('SMA', 0.5);
    });

    it('should trigger circuit break on consecutive losses', () => {
      const callback = vi.fn();
      weightSystem.on('circuitBreak', callback);

      // 连续 3 次亏损
      for (let i = 0; i < 3; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      }

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].reason).toBe(CircuitBreakReason.CONSECUTIVE_LOSS);

      const status = weightSystem.getStrategyStatus('SMA');
      expect(status.status).toBe(StrategyStatus.COOLING);
    });

    it('should trigger circuit break on max drawdown', () => {
      const callback = vi.fn();
      weightSystem.on('circuitBreak', callback);

      // 先盈利建立峰值
      weightSystem.updatePerformance('SMA', { profit: 0.1, win: true });
      // 大幅亏损超过 10%
      weightSystem.updatePerformance('SMA', { profit: -0.12, win: false });

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].reason).toBe(CircuitBreakReason.DRAWDOWN);
    });

    it('should trigger circuit break on low win rate', () => {
      // 需要足够样本 (evaluationWindow = 10)
      // 3 胜 7 负 = 30% < 35%
      for (let i = 0; i < 3; i++) {
        weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      }
      for (let i = 0; i < 7; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.005, win: false });
        // 防止先触发连续亏损熔断
        if (i < 6) {
          const perf = weightSystem.getPerformance('SMA');
          perf.consecutiveLosses = 0;
        }
      }

      const status = weightSystem.getStrategyStatus('SMA');
      // 可能已经触发熔断
      expect([StrategyStatus.COOLING, StrategyStatus.CIRCUIT_BREAK]).toContain(status.status);
    });

    it('should neutralize signals during circuit break', () => {
      // 触发熔断
      for (let i = 0; i < 3; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      }

      weightSystem.recordSignal('SMA', 0.9);
      const result = weightSystem.calculateScore();

      // 熔断期间信号被中和为 0.5
      expect(result.signals.SMA.rawScore).toBe(0.5);
    });

    it('should allow manual circuit break', () => {
      weightSystem.circuitBreak('SMA');

      const status = weightSystem.getStrategyStatus('SMA');
      expect([StrategyStatus.COOLING, StrategyStatus.CIRCUIT_BREAK]).toContain(status.status);
      expect(status.reason).toBe(CircuitBreakReason.MANUAL);
    });

    it('should recover strategy manually', () => {
      // 触发熔断
      for (let i = 0; i < 3; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      }

      // 手动恢复
      weightSystem.recoverStrategy('SMA');

      const status = weightSystem.getStrategyStatus('SMA');
      expect(status.status).toBe(StrategyStatus.ACTIVE);
    });

    it('should emit strategyRecovered event', () => {
      const callback = vi.fn();
      weightSystem.on('strategyRecovered', callback);

      // 触发熔断
      weightSystem.circuitBreak('SMA');
      // 恢复
      weightSystem.recoverStrategy('SMA');

      expect(callback).toHaveBeenCalledWith({ strategy: 'SMA' });
    });

    it('should reset consecutive losses on recovery', () => {
      // 触发熔断
      for (let i = 0; i < 3; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      }

      weightSystem.recoverStrategy('SMA');

      const perf = weightSystem.getPerformance('SMA');
      expect(perf.consecutiveLosses).toBe(0);
    });

    it('should not trigger circuit break when disabled', () => {
      const system = new SignalWeightingSystem({
        circuitBreaker: false,
      });
      system.registerStrategy('SMA', 0.5);

      // 连续 10 次亏损
      for (let i = 0; i < 10; i++) {
        system.updatePerformance('SMA', { profit: -0.01, win: false });
      }

      const status = system.getStrategyStatus('SMA');
      expect(status.status).toBe(StrategyStatus.ACTIVE);
    });

    it('should auto recover after cooling period', async () => {
      // 触发熔断
      for (let i = 0; i < 3; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      }

      // 模拟冷却期过后
      const status = weightSystem.getStrategyStatus('SMA');
      status.cooldownUntil = Date.now() - 1; // 设置为过去时间

      // 记录新信号会检查冷却期
      weightSystem.recordSignal('SMA', 0.8);

      const newStatus = weightSystem.getStrategyStatus('SMA');
      expect(newStatus.status).toBe(StrategyStatus.ACTIVE);
    });
  });

  // ============================================
  // 表现更新测试 / Performance Update Tests
  // ============================================

  describe('Performance Update', () => {
    beforeEach(() => {
      weightSystem.registerStrategy('SMA', 0.5);
    });

    it('should update trade count', () => {
      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });

      const perf = weightSystem.getPerformance('SMA');
      expect(perf.trades).toBe(2);
    });

    it('should update wins and losses', () => {
      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      weightSystem.updatePerformance('SMA', { profit: 0.02, win: true });
      weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });

      const perf = weightSystem.getPerformance('SMA');
      expect(perf.wins).toBe(2);
      expect(perf.losses).toBe(1);
    });

    it('should track consecutive losses', () => {
      weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });

      const perf = weightSystem.getPerformance('SMA');
      expect(perf.consecutiveLosses).toBe(2);
    });

    it('should reset consecutive losses on win', () => {
      weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });

      const perf = weightSystem.getPerformance('SMA');
      expect(perf.consecutiveLosses).toBe(0);
    });

    it('should update total PnL', () => {
      weightSystem.updatePerformance('SMA', { profit: 0.02, win: true });
      weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });

      const perf = weightSystem.getPerformance('SMA');
      expect(perf.totalPnL).toBeCloseTo(0.01, 4);
    });

    it('should track max drawdown', () => {
      // 先盈利建立峰值
      weightSystem.updatePerformance('SMA', { profit: 0.1, win: true });
      // 亏损 5%
      weightSystem.updatePerformance('SMA', { profit: -0.05, win: false });

      const perf = weightSystem.getPerformance('SMA');
      // drawdown = (0.1 - 0.05) / 0.1 = 0.5
      expect(perf.maxDrawdown).toBeCloseTo(0.5, 2);
    });

    it('should emit performanceUpdated event', () => {
      const callback = vi.fn();
      weightSystem.on('performanceUpdated', callback);

      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].strategy).toBe('SMA');
    });
  });

  // ============================================
  // 查询接口测试 / Query Interface Tests
  // ============================================

  describe('Query Interface', () => {
    beforeEach(() => {
      weightSystem.registerStrategies({ SMA: 0.4, RSI: 0.3, MACD: 0.3 });
    });

    it('should get strategy status', () => {
      const status = weightSystem.getStrategyStatus('SMA');

      expect(status).toBeDefined();
      expect(status.status).toBe(StrategyStatus.ACTIVE);
    });

    it('should return null for unknown strategy', () => {
      const status = weightSystem.getStrategyStatus('Unknown');
      expect(status).toBeNull();
    });

    it('should get all strategies status', () => {
      const allStatus = weightSystem.getAllStatus();

      expect(Object.keys(allStatus).length).toBe(3);
      expect(allStatus.SMA).toBeDefined();
      expect(allStatus.RSI).toBeDefined();
      expect(allStatus.MACD).toBeDefined();
    });

    it('should get current weights', () => {
      const weights = weightSystem.getWeights();

      expect(weights).toEqual({ SMA: 0.4, RSI: 0.3, MACD: 0.3 });
    });

    it('should get performance data', () => {
      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });

      const perf = weightSystem.getPerformance('SMA');
      expect(perf.trades).toBe(1);
      expect(perf.wins).toBe(1);
    });

    it('should get correlation matrix', () => {
      weightSystem.setCorrelation('SMA', 'RSI', 0.5);

      const matrix = weightSystem.getCorrelationMatrix();
      expect(matrix['RSI-SMA']).toBe(0.5);
    });

    it('should get score history', () => {
      weightSystem.recordSignal('SMA', 0.8);
      weightSystem.calculateScore();
      weightSystem.clearCurrentSignals();

      weightSystem.recordSignal('SMA', 0.6);
      weightSystem.calculateScore();

      const history = weightSystem.getScoreHistory(2);
      expect(history.length).toBe(2);
    });

    it('should get system summary', () => {
      const summary = weightSystem.getSummary();

      expect(summary.totalStrategies).toBe(3);
      expect(summary.activeStrategies).toBe(3);
      expect(summary.circuitBrokenStrategies).toBe(0);
      expect(summary.threshold).toBe(0.7);
      expect(summary.sellThreshold).toBe(0.3);
    });
  });

  // ============================================
  // 配置更新测试 / Configuration Update Tests
  // ============================================

  describe('Configuration Update', () => {
    beforeEach(() => {
      weightSystem.registerStrategies({ SMA: 0.4, RSI: 0.3 });
    });

    it('should update thresholds', () => {
      weightSystem.setThresholds(0.8, 0.2);

      expect(weightSystem.threshold).toBe(0.8);
      expect(weightSystem.sellThreshold).toBe(0.2);
    });

    it('should emit thresholdsUpdated event', () => {
      const callback = vi.fn();
      weightSystem.on('thresholdsUpdated', callback);

      weightSystem.setThresholds(0.8, 0.2);

      expect(callback).toHaveBeenCalledWith({
        buyThreshold: 0.8,
        sellThreshold: 0.2,
      });
    });

    it('should reset weights to base values', () => {
      // 修改权重
      weightSystem.currentWeights.SMA = 0.5;

      weightSystem.resetWeights();

      expect(weightSystem.currentWeights.SMA).toBe(0.4);
    });

    it('should emit weightsReset event', () => {
      const callback = vi.fn();
      weightSystem.on('weightsReset', callback);

      weightSystem.resetWeights();

      expect(callback).toHaveBeenCalled();
    });

    it('should reset single strategy performance', () => {
      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      weightSystem.resetPerformance('SMA');

      const perf = weightSystem.getPerformance('SMA');
      expect(perf.trades).toBe(0);
      expect(perf.wins).toBe(0);
    });

    it('should reset all strategies performance', () => {
      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      weightSystem.updatePerformance('RSI', { profit: 0.02, win: true });

      weightSystem.resetPerformance();

      expect(weightSystem.getPerformance('SMA').trades).toBe(0);
      expect(weightSystem.getPerformance('RSI').trades).toBe(0);
    });
  });

  // ============================================
  // 自动相关性计算测试 / Auto Correlation Calculation Tests
  // ============================================

  describe('Auto Correlation Calculation', () => {
    beforeEach(() => {
      weightSystem.registerStrategies({ SMA: 0.5, RSI: 0.5 });
    });

    it('should calculate correlation from signal history', () => {
      // 生成相关信号
      for (let i = 0; i < 20; i++) {
        const score = 0.5 + Math.sin(i * 0.5) * 0.3;
        weightSystem.recordSignal('SMA', score);
        weightSystem.recordSignal('RSI', score + 0.05); // 高度相关
        weightSystem.clearCurrentSignals();
      }

      const matrix = weightSystem.calculateSignalCorrelation();

      expect(matrix['RSI-SMA']).toBeDefined();
      expect(matrix['RSI-SMA']).toBeGreaterThan(0.8); // 应该高度正相关
    });

    it('should emit correlationUpdated event', () => {
      const callback = vi.fn();
      weightSystem.on('correlationUpdated', callback);

      // 生成足够信号
      for (let i = 0; i < 15; i++) {
        weightSystem.recordSignal('SMA', Math.random());
        weightSystem.recordSignal('RSI', Math.random());
        weightSystem.clearCurrentSignals();
      }

      weightSystem.calculateSignalCorrelation();

      expect(callback).toHaveBeenCalled();
    });

    it('should skip calculation with insufficient data', () => {
      // 只有 5 个信号，不足 10 个
      for (let i = 0; i < 5; i++) {
        weightSystem.recordSignal('SMA', Math.random());
        weightSystem.recordSignal('RSI', Math.random());
        weightSystem.clearCurrentSignals();
      }

      const matrix = weightSystem.calculateSignalCorrelation();

      // 由于数据不足，矩阵应为空
      expect(Object.keys(matrix).length).toBe(0);
    });
  });

  // ============================================
  // 边界情况测试 / Edge Cases Tests
  // ============================================

  describe('Edge Cases', () => {
    it('should handle empty strategy weights', () => {
      const system = new SignalWeightingSystem({ baseWeights: {} });

      const result = system.calculateScore();

      expect(result.score).toBe(0.5);
      expect(result.action).toBe('hold');
    });

    it('should handle all strategies in circuit break', () => {
      weightSystem.registerStrategies({ SMA: 0.5, RSI: 0.5 });

      // 触发所有策略熔断
      weightSystem.circuitBreak('SMA');
      weightSystem.circuitBreak('RSI');

      weightSystem.recordSignal('SMA', 0.9);
      weightSystem.recordSignal('RSI', 0.9);

      const result = weightSystem.calculateScore();

      // 所有信号被中和
      expect(result.score).toBeCloseTo(0.5, 1);
    });

    it('should handle zero total weight', () => {
      weightSystem.registerStrategy('SMA', 0);

      weightSystem.recordSignal('SMA', 0.8);
      const result = weightSystem.calculateScore();

      // 权重为 0 时不应出错
      expect(result.score).toBe(0.5);
    });

    it('should handle rapid consecutive signals', () => {
      weightSystem.registerStrategy('SMA', 0.5);

      // 快速连续记录信号
      for (let i = 0; i < 100; i++) {
        weightSystem.recordSignal('SMA', Math.random());
        weightSystem.calculateScore();
        weightSystem.clearCurrentSignals();
      }

      const history = weightSystem.getScoreHistory(100);
      expect(history.length).toBe(100);
    });
  });
});
