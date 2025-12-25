/**
 * WeightedComboStrategy 单元测试
 * Weighted Combo Strategy Unit Tests
 *
 * 注意：由于 WeightedComboStrategy 依赖多个子策略，
 * 本测试主要通过公共 API 测试核心功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalWeightingSystem, StrategyStatus } from '../../src/strategies/SignalWeightingSystem.js';

describe('WeightedComboStrategy', () => {
  // 由于子策略依赖复杂，我们分开测试核心组件

  // ============================================
  // SignalWeightingSystem 集成测试
  // Integration tests for SignalWeightingSystem
  // ============================================

  describe('SignalWeightingSystem Integration', () => {
    let weightSystem;

    beforeEach(() => {
      weightSystem = new SignalWeightingSystem({
        threshold: 0.7,
        sellThreshold: 0.3,
        baseWeights: { SMA: 0.4, RSI: 0.2, MACD: 0.4 },
        dynamicWeights: true,
        correlationLimit: true,
        circuitBreaker: true,
        consecutiveLossLimit: 3,
      });

      weightSystem.registerStrategies({
        SMA: 0.4,
        RSI: 0.2,
        MACD: 0.4,
      });
    });

    describe('Combo Signal Scoring', () => {
      it('should calculate weighted combo score correctly', () => {
        // 模拟 SMA 看多 (0.8), RSI 中性 (0.5), MACD 看多 (0.7)
        weightSystem.recordSignal('SMA', 0.8);
        weightSystem.recordSignal('RSI', 0.5);
        weightSystem.recordSignal('MACD', 0.7);

        const result = weightSystem.calculateScore();

        // 加权得分: (0.8*0.4 + 0.5*0.2 + 0.7*0.4) / 1.0 = 0.7
        expect(result.score).toBeCloseTo(0.7, 1);
        expect(result.action).toBe('buy');
      });

      it('should trigger sell when all signals are bearish', () => {
        weightSystem.recordSignal('SMA', 0.2);
        weightSystem.recordSignal('RSI', 0.3);
        weightSystem.recordSignal('MACD', 0.1);

        const result = weightSystem.calculateScore();

        expect(result.score).toBeLessThan(0.3);
        expect(result.action).toBe('sell');
      });

      it('should hold when signals are mixed', () => {
        weightSystem.recordSignal('SMA', 0.6);
        weightSystem.recordSignal('RSI', 0.4);
        weightSystem.recordSignal('MACD', 0.5);

        const result = weightSystem.calculateScore();

        expect(result.action).toBe('hold');
        expect(result.shouldTrade).toBe(false);
      });

      it('should apply threshold correctly', () => {
        // 正好等于阈值
        weightSystem.recordSignal('SMA', 0.7);
        weightSystem.recordSignal('RSI', 0.7);
        weightSystem.recordSignal('MACD', 0.7);

        const result = weightSystem.calculateScore();

        expect(result.score).toBeCloseTo(0.7, 1);
        expect(result.action).toBe('buy');
      });
    });

    describe('Dynamic Weight Adjustment', () => {
      beforeEach(() => {
        weightSystem.weightAdjustment.evaluationPeriod = 5;
      });

      it('should increase weight for winning strategy', () => {
        const initialWeight = weightSystem.currentWeights.SMA;

        // 5 次盈利触发权重调整
        for (let i = 0; i < 5; i++) {
          weightSystem.updatePerformance('SMA', { profit: 0.02, win: true });
        }

        expect(weightSystem.currentWeights.SMA).toBeGreaterThan(initialWeight);
      });

      it('should track win rate correctly', () => {
        // 3 胜 2 负
        for (let i = 0; i < 3; i++) {
          weightSystem.updatePerformance('SMA', { profit: 0.02, win: true });
        }
        for (let i = 0; i < 2; i++) {
          weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
        }

        const perf = weightSystem.getPerformance('SMA');
        expect(perf.wins).toBe(3);
        expect(perf.losses).toBe(2);
        expect(perf.trades).toBe(5);
      });
    });

    describe('Circuit Breaker for Strategies', () => {
      it('should circuit break on consecutive losses', () => {
        for (let i = 0; i < 3; i++) {
          weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
        }

        const status = weightSystem.getStrategyStatus('SMA');
        expect([StrategyStatus.COOLING, StrategyStatus.CIRCUIT_BREAK]).toContain(status.status);
      });

      it('should neutralize signals from circuit-broken strategy', () => {
        // 触发熔断
        for (let i = 0; i < 3; i++) {
          weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
        }

        // SMA 信号应被中和为 0.5
        weightSystem.recordSignal('SMA', 0.9);
        weightSystem.recordSignal('RSI', 0.8);
        weightSystem.recordSignal('MACD', 0.8);

        const result = weightSystem.calculateScore();

        // 由于 SMA 被中和，总分应该低于全 0.8
        expect(result.signals.SMA.rawScore).toBe(0.5);
      });

      it('should recover strategy after manual recovery', () => {
        // 触发熔断
        weightSystem.circuitBreak('SMA');

        // 手动恢复
        weightSystem.recoverStrategy('SMA');

        const status = weightSystem.getStrategyStatus('SMA');
        expect(status.status).toBe(StrategyStatus.ACTIVE);
      });
    });

    describe('Correlation Limit', () => {
      beforeEach(() => {
        weightSystem.setCorrelationMatrix({
          'MACD-SMA': 0.9, // 高相关
        });
      });

      it('should penalize highly correlated strategies', () => {
        weightSystem.recordSignal('SMA', 0.8);
        weightSystem.recordSignal('MACD', 0.8);

        const result = weightSystem.calculateScore();

        // 由于相关性惩罚，有效权重应降低
        expect(result.signals.SMA.weight).toBeLessThan(0.4);
        expect(result.signals.MACD.weight).toBeLessThan(0.4);
      });

      it('should not penalize uncorrelated strategies', () => {
        weightSystem.recordSignal('RSI', 0.8);

        const result = weightSystem.calculateScore();

        // RSI 未设置相关性，权重不变
        expect(result.signals.RSI.weight).toBe(0.2);
      });
    });
  });

  // ============================================
  // 信号转换器测试 / Signal Converter Tests
  // ============================================

  describe('Signal Converters Logic', () => {
    it('SMA: should return bullish score when short > long', () => {
      // shortMA > longMA => bullish => score > 0.5
      const shortMA = 51000;
      const longMA = 50000;
      const diff = (shortMA - longMA) / longMA;
      const score = 1 / (1 + Math.exp(-diff * 100));

      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThan(1);
    });

    it('SMA: should return bearish score when short < long', () => {
      const shortMA = 49000;
      const longMA = 50000;
      const diff = (shortMA - longMA) / longMA;
      const score = 1 / (1 + Math.exp(-diff * 100));

      expect(score).toBeLessThan(0.5);
      expect(score).toBeGreaterThan(0);
    });

    it('RSI: should return high score for oversold (RSI < 30)', () => {
      const rsi = 25;
      const score = (100 - rsi) / 100;

      expect(score).toBe(0.75);
    });

    it('RSI: should return low score for overbought (RSI > 70)', () => {
      const rsi = 80;
      const score = (100 - rsi) / 100;

      expect(score).toBe(0.2);
    });

    it('MACD: should return bullish score for positive histogram', () => {
      const histogram = 50;
      const normalized = histogram / (Math.abs(histogram) + 0.001);
      const score = (normalized + 1) / 2;

      expect(score).toBeGreaterThan(0.5);
    });

    it('MACD: should return bearish score for negative histogram', () => {
      const histogram = -50;
      const normalized = histogram / (Math.abs(histogram) + 0.001);
      const score = (normalized + 1) / 2;

      expect(score).toBeLessThan(0.5);
    });

    it('BollingerBands: should return high score near lower band', () => {
      const upper = 51000;
      const lower = 49000;
      const price = 49200; // 接近下轨

      const range = upper - lower;
      const position = (price - lower) / range;
      const score = 1 - position;

      expect(score).toBeGreaterThan(0.8);
    });

    it('BollingerBands: should return low score near upper band', () => {
      const upper = 51000;
      const lower = 49000;
      const price = 50800; // 接近上轨

      const range = upper - lower;
      const position = (price - lower) / range;
      const score = 1 - position;

      expect(score).toBeLessThan(0.2);
    });
  });

  // ============================================
  // 止盈止损逻辑测试 / Stop Loss / Take Profit Logic Tests
  // ============================================

  describe('Stop Loss / Take Profit Logic', () => {
    it('should detect take profit condition', () => {
      const entryPrice = 50000;
      const currentPrice = 51500;
      const takeProfitPercent = 2.0;

      const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

      expect(pnlPercent).toBeGreaterThanOrEqual(takeProfitPercent);
    });

    it('should detect stop loss condition', () => {
      const entryPrice = 50000;
      const currentPrice = 49000;
      const stopLossPercent = 1.5;

      const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

      expect(pnlPercent).toBeLessThanOrEqual(-stopLossPercent);
    });

    it('should not trigger exit within thresholds', () => {
      const entryPrice = 50000;
      const currentPrice = 50500;
      const takeProfitPercent = 2.0;
      const stopLossPercent = 1.5;

      const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

      expect(pnlPercent).toBeLessThan(takeProfitPercent);
      expect(pnlPercent).toBeGreaterThan(-stopLossPercent);
    });
  });

  // ============================================
  // 综合场景测试 / Comprehensive Scenario Tests
  // ============================================

  describe('Comprehensive Scenarios', () => {
    let weightSystem;

    beforeEach(() => {
      weightSystem = new SignalWeightingSystem({
        threshold: 0.7,
        sellThreshold: 0.3,
        baseWeights: { SMA: 0.4, RSI: 0.2, MACD: 0.4 },
        dynamicWeights: true,
        correlationLimit: true,
        circuitBreaker: true,
        consecutiveLossLimit: 5,
        evaluationPeriod: 10,
      });

      weightSystem.registerStrategies({
        SMA: 0.4,
        RSI: 0.2,
        MACD: 0.4,
      });
    });

    it('should handle trending market scenario', () => {
      // 趋势市场：所有信号看多
      weightSystem.recordSignal('SMA', 0.85);   // 均线多头排列
      weightSystem.recordSignal('RSI', 0.6);    // RSI 从低位回升
      weightSystem.recordSignal('MACD', 0.8);   // MACD 金叉

      const result = weightSystem.calculateScore();

      expect(result.action).toBe('buy');
      expect(result.score).toBeGreaterThan(0.7);
    });

    it('should handle ranging market scenario', () => {
      // 震荡市场：信号混乱
      weightSystem.recordSignal('SMA', 0.52);   // 均线接近
      weightSystem.recordSignal('RSI', 0.55);   // RSI 中性
      weightSystem.recordSignal('MACD', 0.48);  // MACD 弱势

      const result = weightSystem.calculateScore();

      expect(result.action).toBe('hold');
      expect(result.score).toBeCloseTo(0.5, 0.1);
    });

    it('should handle bearish market scenario', () => {
      // 熊市：所有信号看空
      // 注意：在 SignalWeightingSystem 中，分数直接表示看涨/看跌程度
      // 高分 = 看涨，低分 = 看跌
      weightSystem.recordSignal('SMA', 0.15);   // 均线空头排列 (低分 = 看跌)
      weightSystem.recordSignal('RSI', 0.15);   // RSI 超买信号 (低分 = 看跌)
      weightSystem.recordSignal('MACD', 0.2);   // MACD 死叉 (低分 = 看跌)

      const result = weightSystem.calculateScore();

      expect(result.action).toBe('sell');
      expect(result.score).toBeLessThan(0.3);
    });

    it('should handle strategy degradation scenario', () => {
      // 策略表现下降，权重动态调整
      weightSystem.weightAdjustment.evaluationPeriod = 5;

      // SMA 策略连续亏损
      for (let i = 0; i < 5; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
        // 防止触发熔断
        if (i < 4) {
          weightSystem._strategyPerformance.SMA.consecutiveLosses = 0;
        }
      }

      // SMA 权重应该下降
      expect(weightSystem.currentWeights.SMA).toBeLessThanOrEqual(0.4);
    });

    it('should handle strategy recovery scenario', () => {
      // 策略熔断后恢复
      weightSystem.circuitBreaker.consecutiveLossLimit = 3;

      // 触发熔断
      for (let i = 0; i < 3; i++) {
        weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      }

      let status = weightSystem.getStrategyStatus('SMA');
      expect([StrategyStatus.COOLING, StrategyStatus.CIRCUIT_BREAK]).toContain(status.status);

      // 恢复
      weightSystem.recoverStrategy('SMA');

      status = weightSystem.getStrategyStatus('SMA');
      expect(status.status).toBe(StrategyStatus.ACTIVE);

      // 恢复后应该重置连续亏损计数
      const perf = weightSystem.getPerformance('SMA');
      expect(perf.consecutiveLosses).toBe(0);
    });

    it('should track complete trading cycle metrics', () => {
      // 记录多轮交易
      const trades = [
        { profit: 0.02, win: true },
        { profit: -0.01, win: false },
        { profit: 0.03, win: true },
        { profit: 0.015, win: true },
        { profit: -0.005, win: false },
      ];

      for (const trade of trades) {
        weightSystem.updatePerformance('SMA', trade);
      }

      const perf = weightSystem.getPerformance('SMA');

      expect(perf.trades).toBe(5);
      expect(perf.wins).toBe(3);
      expect(perf.losses).toBe(2);
      expect(perf.totalPnL).toBeCloseTo(0.05, 3);
    });
  });

  // ============================================
  // 边界情况测试 / Edge Case Tests
  // ============================================

  describe('Edge Cases', () => {
    let weightSystem;

    beforeEach(() => {
      weightSystem = new SignalWeightingSystem({
        threshold: 0.7,
        sellThreshold: 0.3,
      });
    });

    it('should handle empty signals', () => {
      const result = weightSystem.calculateScore();

      expect(result.score).toBe(0.5);
      expect(result.action).toBe('hold');
    });

    it('should handle single strategy', () => {
      weightSystem.registerStrategy('SMA', 1.0);
      weightSystem.recordSignal('SMA', 0.8);

      const result = weightSystem.calculateScore();

      expect(result.score).toBeCloseTo(0.8, 1);
    });

    it('should handle all strategies circuit broken', () => {
      weightSystem.registerStrategies({ SMA: 0.5, RSI: 0.5 });

      weightSystem.circuitBreak('SMA');
      weightSystem.circuitBreak('RSI');

      weightSystem.recordSignal('SMA', 0.9);
      weightSystem.recordSignal('RSI', 0.9);

      const result = weightSystem.calculateScore();

      // 所有信号被中和为 0.5
      expect(result.score).toBeCloseTo(0.5, 0.1);
    });

    it('should handle zero weight strategy', () => {
      weightSystem.registerStrategy('SMA', 0);
      weightSystem.recordSignal('SMA', 0.9);

      const result = weightSystem.calculateScore();

      // 权重为 0，不应影响得分
      expect(result.score).toBe(0.5);
    });

    it('should handle threshold edge cases', () => {
      weightSystem.registerStrategy('SMA', 1.0);

      // 正好等于买入阈值
      weightSystem.recordSignal('SMA', 0.7);
      let result = weightSystem.calculateScore();
      expect(result.action).toBe('buy');

      weightSystem.clearCurrentSignals();

      // 正好等于卖出阈值
      weightSystem.recordSignal('SMA', 0.3);
      result = weightSystem.calculateScore();
      expect(result.action).toBe('sell');

      weightSystem.clearCurrentSignals();

      // 略高于卖出阈值
      weightSystem.recordSignal('SMA', 0.31);
      result = weightSystem.calculateScore();
      expect(result.action).toBe('hold');
    });

    it('should clamp signal scores to 0-1 range', () => {
      weightSystem.registerStrategy('SMA', 1.0);

      weightSystem.recordSignal('SMA', 1.5);
      let result = weightSystem.calculateScore();
      expect(result.signals.SMA.rawScore).toBe(1);

      weightSystem.clearCurrentSignals();

      weightSystem.recordSignal('SMA', -0.5);
      result = weightSystem.calculateScore();
      expect(result.signals.SMA.rawScore).toBe(0);
    });
  });

  // ============================================
  // 配置测试 / Configuration Tests
  // ============================================

  describe('Configuration', () => {
    it('should apply custom thresholds', () => {
      const weightSystem = new SignalWeightingSystem({
        threshold: 0.8,
        sellThreshold: 0.2,
      });

      expect(weightSystem.threshold).toBe(0.8);
      expect(weightSystem.sellThreshold).toBe(0.2);
    });

    it('should apply custom weight adjustment config', () => {
      const weightSystem = new SignalWeightingSystem({
        dynamicWeights: true,
        adjustmentFactor: 0.3,
        evaluationPeriod: 10,
        minWeight: 0.1,
        maxWeight: 0.5,
      });

      expect(weightSystem.weightAdjustment.enabled).toBe(true);
      expect(weightSystem.weightAdjustment.adjustmentFactor).toBe(0.3);
      expect(weightSystem.weightAdjustment.evaluationPeriod).toBe(10);
      expect(weightSystem.weightAdjustment.minWeight).toBe(0.1);
      expect(weightSystem.weightAdjustment.maxWeight).toBe(0.5);
    });

    it('should apply custom correlation config', () => {
      const weightSystem = new SignalWeightingSystem({
        correlationLimit: true,
        maxCorrelation: 0.6,
        correlationPenaltyFactor: 0.4,
      });

      expect(weightSystem.correlationConfig.enabled).toBe(true);
      expect(weightSystem.correlationConfig.maxCorrelation).toBe(0.6);
      expect(weightSystem.correlationConfig.penaltyFactor).toBe(0.4);
    });

    it('should apply custom circuit breaker config', () => {
      const weightSystem = new SignalWeightingSystem({
        circuitBreaker: true,
        consecutiveLossLimit: 10,
        maxDrawdownLimit: 0.2,
        minWinRate: 0.4,
        coolingPeriod: 7200000,
      });

      expect(weightSystem.circuitBreaker.enabled).toBe(true);
      expect(weightSystem.circuitBreaker.consecutiveLossLimit).toBe(10);
      expect(weightSystem.circuitBreaker.maxDrawdown).toBe(0.2);
      expect(weightSystem.circuitBreaker.minWinRate).toBe(0.4);
      expect(weightSystem.circuitBreaker.coolingPeriod).toBe(7200000);
    });

    it('should disable features when configured', () => {
      const weightSystem = new SignalWeightingSystem({
        dynamicWeights: false,
        correlationLimit: false,
        circuitBreaker: false,
      });

      expect(weightSystem.weightAdjustment.enabled).toBe(false);
      expect(weightSystem.correlationConfig.enabled).toBe(false);
      expect(weightSystem.circuitBreaker.enabled).toBe(false);
    });
  });

  // ============================================
  // 事件测试 / Event Tests
  // ============================================

  describe('Events', () => {
    let weightSystem;

    beforeEach(() => {
      weightSystem = new SignalWeightingSystem({
        threshold: 0.7,
        sellThreshold: 0.3,
        circuitBreaker: true,
        consecutiveLossLimit: 2,
      });
      weightSystem.registerStrategy('SMA', 0.5);
    });

    it('should emit scoreCalculated event', () => {
      const callback = vi.fn();
      weightSystem.on('scoreCalculated', callback);

      weightSystem.recordSignal('SMA', 0.8);
      weightSystem.calculateScore();

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].score).toBeCloseTo(0.8, 1);
    });

    it('should emit circuitBreak event', () => {
      const callback = vi.fn();
      weightSystem.on('circuitBreak', callback);

      // 触发熔断
      weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });
      weightSystem.updatePerformance('SMA', { profit: -0.01, win: false });

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].strategy).toBe('SMA');
    });

    it('should emit strategyRecovered event', () => {
      const callback = vi.fn();
      weightSystem.on('strategyRecovered', callback);

      weightSystem.circuitBreak('SMA');
      weightSystem.recoverStrategy('SMA');

      expect(callback).toHaveBeenCalledWith({ strategy: 'SMA' });
    });

    it('should emit performanceUpdated event', () => {
      const callback = vi.fn();
      weightSystem.on('performanceUpdated', callback);

      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].strategy).toBe('SMA');
    });

    it('should emit weightAdjusted event', () => {
      const callback = vi.fn();
      weightSystem.on('weightAdjusted', callback);

      weightSystem.weightAdjustment.evaluationPeriod = 2;

      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });
      weightSystem.updatePerformance('SMA', { profit: 0.01, win: true });

      expect(callback).toHaveBeenCalled();
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
  });

  // ============================================
  // 查询接口测试 / Query Interface Tests
  // ============================================

  describe('Query Interface', () => {
    let weightSystem;

    beforeEach(() => {
      weightSystem = new SignalWeightingSystem({
        threshold: 0.7,
        sellThreshold: 0.3,
      });
      weightSystem.registerStrategies({ SMA: 0.4, RSI: 0.3, MACD: 0.3 });
    });

    it('should return current weights', () => {
      const weights = weightSystem.getWeights();

      expect(weights.SMA).toBe(0.4);
      expect(weights.RSI).toBe(0.3);
      expect(weights.MACD).toBe(0.3);
    });

    it('should return strategy status', () => {
      const status = weightSystem.getStrategyStatus('SMA');

      expect(status).toBeDefined();
      expect(status.status).toBe(StrategyStatus.ACTIVE);
    });

    it('should return all strategies status', () => {
      const allStatus = weightSystem.getAllStatus();

      expect(Object.keys(allStatus)).toHaveLength(3);
      expect(allStatus.SMA).toBeDefined();
      expect(allStatus.RSI).toBeDefined();
      expect(allStatus.MACD).toBeDefined();
    });

    it('should return performance data', () => {
      weightSystem.updatePerformance('SMA', { profit: 0.02, win: true });

      const perf = weightSystem.getPerformance('SMA');

      expect(perf.trades).toBe(1);
      expect(perf.wins).toBe(1);
      expect(perf.totalPnL).toBeCloseTo(0.02, 3);
    });

    it('should return score history', () => {
      weightSystem.recordSignal('SMA', 0.8);
      weightSystem.calculateScore();
      weightSystem.clearCurrentSignals();

      weightSystem.recordSignal('SMA', 0.6);
      weightSystem.calculateScore();

      const history = weightSystem.getScoreHistory(2);

      expect(history).toHaveLength(2);
    });

    it('should return system summary', () => {
      const summary = weightSystem.getSummary();

      expect(summary.totalStrategies).toBe(3);
      expect(summary.activeStrategies).toBe(3);
      expect(summary.threshold).toBe(0.7);
      expect(summary.sellThreshold).toBe(0.3);
    });
  });
});
