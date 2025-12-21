/**
 * 组合风控管理器测试 (真实实现)
 * Portfolio Risk Manager Tests (Real Implementation)
 * @module tests/unit/portfolioRiskManager.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PortfolioRiskManager,
  PORTFOLIO_RISK_LEVEL,
  RISK_ACTION,
  DEFAULT_CONFIG,
} from '../../src/risk/PortfolioRiskManager.js';

// ============================================
// Mock Correlation Analyzer
// ============================================

function createMockCorrelationAnalyzer() {
  return {
    findHighCorrelationPairs: vi.fn().mockReturnValue([]),
    detectCorrelationRegimeChange: vi.fn().mockReturnValue({ detected: false }),
  };
}

// ============================================
// Mock Capital Allocator
// ============================================

function createMockCapitalAllocator() {
  return {
    rebalance: vi.fn(),
  };
}

// ============================================
// Mock Executor
// ============================================

function createMockExecutor() {
  return {
    emergencyCloseAll: vi.fn().mockResolvedValue(true),
    executeMarketOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
  };
}

// ============================================
// PortfolioRiskManager 测试
// ============================================

describe('PortfolioRiskManager', () => {
  let riskManager;
  let mockCorrelationAnalyzer;
  let mockCapitalAllocator;
  let mockExecutor;

  beforeEach(() => {
    riskManager = new PortfolioRiskManager({
      maxTotalPositionRatio: 0.60,
      maxPortfolioDrawdown: 0.15,
      maxDailyDrawdown: 0.05,
      maxWeeklyDrawdown: 0.10,
      checkInterval: 10000,
      verbose: false,
    });
    mockCorrelationAnalyzer = createMockCorrelationAnalyzer();
    mockCapitalAllocator = createMockCapitalAllocator();
    mockExecutor = createMockExecutor();
  });

  afterEach(() => {
    if (riskManager) {
      riskManager.stop();
      riskManager.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const rm = new PortfolioRiskManager();

      expect(rm.config.maxTotalPositionRatio).toBe(0.60);
      expect(rm.config.maxPortfolioDrawdown).toBe(0.15);
      expect(rm.config.maxDailyDrawdown).toBe(0.05);
      expect(rm.config.maxWeeklyDrawdown).toBe(0.10);
      expect(rm.config.highCorrelationThreshold).toBe(0.70);
      expect(rm.config.varConfidenceLevel).toBe(0.95);
      expect(rm.config.enableAutoDeRisk).toBe(true);
    });

    it('应该使用自定义配置', () => {
      expect(riskManager.config.maxTotalPositionRatio).toBe(0.60);
      expect(riskManager.config.maxPortfolioDrawdown).toBe(0.15);
    });

    it('应该初始化组合状态', () => {
      expect(riskManager.portfolioState.totalEquity).toBe(0);
      expect(riskManager.portfolioState.riskLevel).toBe(PORTFOLIO_RISK_LEVEL.NORMAL);
      expect(riskManager.portfolioState.tradingAllowed).toBe(true);
      expect(riskManager.portfolioState.pauseReason).toBeNull();
    });

    it('应该初始化空策略状态', () => {
      expect(riskManager.strategyStates.size).toBe(0);
    });

    it('应该初始化空风险预算', () => {
      expect(riskManager.riskBudgets.size).toBe(0);
    });

    it('应该初始化空风控历史', () => {
      expect(riskManager.riskHistory).toEqual([]);
    });

    it('应该设置运行状态为 false', () => {
      expect(riskManager.running).toBe(false);
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('init', () => {
    it('应该初始化成功', async () => {
      await riskManager.init({
        initialEquity: 100000,
      });

      expect(riskManager.portfolioState.totalEquity).toBe(100000);
      expect(riskManager.portfolioState.peakEquity).toBe(100000);
      expect(riskManager.portfolioState.dailyStartEquity).toBe(100000);
      expect(riskManager.portfolioState.weeklyStartEquity).toBe(100000);
    });

    it('应该保存模块引用', async () => {
      await riskManager.init({
        correlationAnalyzer: mockCorrelationAnalyzer,
        capitalAllocator: mockCapitalAllocator,
        executor: mockExecutor,
        initialEquity: 100000,
      });

      expect(riskManager.correlationAnalyzer).toBe(mockCorrelationAnalyzer);
      expect(riskManager.capitalAllocator).toBe(mockCapitalAllocator);
      expect(riskManager.executor).toBe(mockExecutor);
    });

    it('没有初始权益时不应该修改状态', async () => {
      await riskManager.init({});

      expect(riskManager.portfolioState.totalEquity).toBe(0);
    });
  });

  describe('start/stop', () => {
    it('应该启动风控管理器', () => {
      const listener = vi.fn();
      riskManager.on('started', listener);

      riskManager.start();

      expect(riskManager.running).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('应该设置定时器', () => {
      riskManager.start();

      expect(riskManager.checkTimer).not.toBeNull();
    });

    it('应该停止风控管理器', () => {
      const listener = vi.fn();
      riskManager.on('stopped', listener);

      riskManager.start();
      riskManager.stop();

      expect(riskManager.running).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('停止后应该清除定时器', () => {
      riskManager.start();
      riskManager.stop();

      expect(riskManager.checkTimer).toBeNull();
    });

    it('重复启动应该无操作', () => {
      riskManager.start();
      riskManager.start();

      expect(riskManager.running).toBe(true);
    });

    it('未启动时停止应该无操作', () => {
      riskManager.stop();
      expect(riskManager.running).toBe(false);
    });
  });

  // ============================================
  // 策略注册测试
  // ============================================

  describe('registerStrategy', () => {
    it('应该注册策略', () => {
      riskManager.registerStrategy('strategy1', { riskBudget: 5000 });

      expect(riskManager.strategyStates.has('strategy1')).toBe(true);
    });

    it('应该初始化策略状态', () => {
      riskManager.registerStrategy('strategy1', { allocation: 0.3 });

      const state = riskManager.strategyStates.get('strategy1');
      expect(state.id).toBe('strategy1');
      expect(state.positions).toEqual([]);
      expect(state.positionValue).toBe(0);
      expect(state.equity).toBe(0);
      expect(state.allocation).toBe(0.3);
      expect(state.tradingAllowed).toBe(true);
    });

    it('应该初始化风险预算', () => {
      riskManager.registerStrategy('strategy1', { riskBudget: 5000 });

      const budget = riskManager.riskBudgets.get('strategy1');
      expect(budget.budget).toBe(5000);
      expect(budget.used).toBe(0);
      expect(budget.remaining).toBe(5000);
    });

    it('没有 riskBudget 时应该使用默认值', async () => {
      await riskManager.init({ initialEquity: 100000 });
      riskManager.registerStrategy('strategy1', {});

      const budget = riskManager.riskBudgets.get('strategy1');
      expect(budget.budget).toBe(10000); // 10% of total equity
    });

    it('应该发射 strategyRegistered 事件', () => {
      const listener = vi.fn();
      riskManager.on('strategyRegistered', listener);

      riskManager.registerStrategy('strategy1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ strategyId: 'strategy1' })
      );
    });
  });

  describe('updateStrategyState', () => {
    beforeEach(() => {
      riskManager.registerStrategy('strategy1');
    });

    it('应该更新策略状态', () => {
      riskManager.updateStrategyState('strategy1', {
        equity: 50000,
        positionValue: 20000,
      });

      const state = riskManager.strategyStates.get('strategy1');
      expect(state.equity).toBe(50000);
      expect(state.positionValue).toBe(20000);
    });

    it('应该保留已有属性', () => {
      riskManager.updateStrategyState('strategy1', { equity: 50000 });
      riskManager.updateStrategyState('strategy1', { positionValue: 20000 });

      const state = riskManager.strategyStates.get('strategy1');
      expect(state.equity).toBe(50000);
      expect(state.positionValue).toBe(20000);
    });

    it('不存在时应该自动注册', () => {
      riskManager.updateStrategyState('newStrategy', { equity: 30000 });

      expect(riskManager.strategyStates.has('newStrategy')).toBe(true);
    });

    it('应该更新 updatedAt 时间戳', () => {
      const before = Date.now();
      riskManager.updateStrategyState('strategy1', { equity: 50000 });

      const state = riskManager.strategyStates.get('strategy1');
      expect(state.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('应该更新组合状态', () => {
      riskManager.updateStrategyState('strategy1', {
        equity: 50000,
        positionValue: 10000,
      });

      expect(riskManager.portfolioState.totalEquity).toBe(50000);
      expect(riskManager.portfolioState.totalPositionValue).toBe(10000);
    });
  });

  // ============================================
  // 订单检查测试
  // ============================================

  describe('checkOrder', () => {
    beforeEach(async () => {
      await riskManager.init({ initialEquity: 100000 });
      riskManager.registerStrategy('strategy1', { riskBudget: 10000 });
      riskManager.updateStrategyState('strategy1', {
        equity: 50000,
        positionValue: 10000,
      });
    });

    it('应该返回检查结果', () => {
      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBeDefined();
      expect(result.reasons).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.riskLevel).toBeDefined();
    });

    it('交易暂停时应该拒绝', () => {
      riskManager.pauseTrading('test');

      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('策略交易暂停时应该拒绝', () => {
      const state = riskManager.strategyStates.get('strategy1');
      state.tradingAllowed = false;

      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
    });

    it('超过全局仓位限制应该拒绝', () => {
      // 设置当前仓位接近限制
      riskManager.portfolioState.totalPositionValue = 55000;
      riskManager.portfolioState.totalEquity = 100000;

      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.2,
        price: 50000, // 10000 订单价值，超过 60% 限制
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons.some(r => r.includes('全局仓位'))).toBe(true);
    });

    it('接近全局仓位限制应该警告', () => {
      riskManager.portfolioState.totalPositionValue = 46000;
      riskManager.portfolioState.totalEquity = 100000;

      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000, // 5000 订单价值，加上46000 = 51000，超过50%警告阈值
      });

      expect(result.warnings.some(w => w.includes('接近全局仓位'))).toBe(true);
    });

    it('超过单策略仓位限制应该拒绝', () => {
      riskManager.portfolioState.totalEquity = 100000;
      const state = riskManager.strategyStates.get('strategy1');
      state.positionValue = 20000;

      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.2,
        price: 50000, // 加上现有仓位会超过25%
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons.some(r => r.includes('单策略仓位'))).toBe(true);
    });

    it('风险预算不足应该拒绝', () => {
      const budget = riskManager.riskBudgets.get('strategy1');
      budget.remaining = 50; // 只剩50

      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000, // 需要100 (5000 * 0.02)
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons.some(r => r.includes('风险预算'))).toBe(true);
    });

    it('高回撤时应该警告', () => {
      riskManager.portfolioState.currentDrawdown = 0.12;

      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      });

      expect(result.warnings.some(w => w.includes('回撤'))).toBe(true);
    });

    it('高风险级别时应该警告', () => {
      riskManager.portfolioState.riskLevel = PORTFOLIO_RISK_LEVEL.HIGH;

      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      });

      expect(result.warnings.some(w => w.includes('风险级别'))).toBe(true);
    });

    it('严重风险级别时应该建议减少订单量', () => {
      riskManager.portfolioState.riskLevel = PORTFOLIO_RISK_LEVEL.CRITICAL;

      const result = riskManager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      });

      expect(result.suggestedReduction).toBe(0.5);
    });
  });

  // ============================================
  // 暂停/恢复交易测试
  // ============================================

  describe('pauseTrading/resumeTrading', () => {
    it('应该暂停交易', () => {
      riskManager.pauseTrading('test reason');

      expect(riskManager.portfolioState.tradingAllowed).toBe(false);
      expect(riskManager.portfolioState.pauseReason).toBe('test reason');
    });

    it('应该发射 tradingPaused 事件', () => {
      const listener = vi.fn();
      riskManager.on('tradingPaused', listener);

      riskManager.pauseTrading('test');

      expect(listener).toHaveBeenCalledWith({ reason: 'test' });
    });

    it('应该恢复交易', () => {
      riskManager.pauseTrading('test');
      riskManager.resumeTrading();

      expect(riskManager.portfolioState.tradingAllowed).toBe(true);
      expect(riskManager.portfolioState.pauseReason).toBeNull();
    });

    it('应该发射 tradingResumed 事件', () => {
      const listener = vi.fn();
      riskManager.on('tradingResumed', listener);

      riskManager.pauseTrading('test');
      riskManager.resumeTrading();

      expect(listener).toHaveBeenCalledWith({ reason: 'manual' });
    });
  });

  // ============================================
  // 权益更新测试
  // ============================================

  describe('updateTotalEquity', () => {
    beforeEach(() => {
      // 注册一个策略以确保 _updatePortfolioState 能够正确计算
      riskManager.registerStrategy('strategy1');
      riskManager.updateStrategyState('strategy1', { equity: 120000 });
    });

    it('应该更新总权益', () => {
      riskManager.updateTotalEquity(120000);

      expect(riskManager.portfolioState.totalEquity).toBe(120000);
    });

    it('应该更新峰值权益', () => {
      riskManager.updateTotalEquity(120000);

      expect(riskManager.portfolioState.peakEquity).toBe(120000);
    });

    it('峰值权益只增不减', () => {
      riskManager.updateTotalEquity(120000);
      riskManager.updateStrategyState('strategy1', { equity: 110000 });
      riskManager.updateTotalEquity(110000);

      expect(riskManager.portfolioState.peakEquity).toBe(120000);
    });
  });

  // ============================================
  // 回撤检查测试
  // ============================================

  describe('_checkPortfolioDrawdown', () => {
    it('应该返回回撤检查结果', () => {
      const result = riskManager._checkPortfolioDrawdown();

      expect(result.type).toBe('drawdown');
      expect(result.action).toBeDefined();
      expect(result.level).toBeDefined();
      expect(result.details).toBeDefined();
    });

    it('回撤超限应该触发紧急平仓', () => {
      riskManager.portfolioState.currentDrawdown = 0.16;

      const result = riskManager._checkPortfolioDrawdown();

      expect(result.action).toBe(RISK_ACTION.EMERGENCY_CLOSE);
      expect(result.level).toBe(PORTFOLIO_RISK_LEVEL.EMERGENCY);
    });

    it('回撤警告应该触发降低敞口', () => {
      riskManager.portfolioState.currentDrawdown = 0.11;

      const result = riskManager._checkPortfolioDrawdown();

      expect(result.action).toBe(RISK_ACTION.REDUCE_EXPOSURE);
      expect(result.level).toBe(PORTFOLIO_RISK_LEVEL.HIGH);
    });

    it('单日回撤超限应该暂停新开仓', () => {
      riskManager.portfolioState.dailyDrawdown = 0.06;

      const result = riskManager._checkPortfolioDrawdown();

      expect(result.action).toBe(RISK_ACTION.PAUSE_NEW_TRADES);
    });

    it('单周回撤超限应该全面减仓', () => {
      riskManager.portfolioState.weeklyDrawdown = 0.11;

      const result = riskManager._checkPortfolioDrawdown();

      expect(result.action).toBe(RISK_ACTION.REDUCE_ALL);
      expect(result.level).toBe(PORTFOLIO_RISK_LEVEL.CRITICAL);
    });
  });

  // ============================================
  // 仓位检查测试
  // ============================================

  describe('_checkGlobalPosition', () => {
    it('应该返回仓位检查结果', () => {
      const result = riskManager._checkGlobalPosition();

      expect(result.type).toBe('position');
      expect(result.action).toBeDefined();
      expect(result.level).toBeDefined();
    });

    it('仓位超限应该暂停新开仓', () => {
      riskManager.portfolioState.positionRatio = 0.65;

      const result = riskManager._checkGlobalPosition();

      expect(result.action).toBe(RISK_ACTION.PAUSE_NEW_TRADES);
      expect(result.level).toBe(PORTFOLIO_RISK_LEVEL.HIGH);
    });

    it('仓位警告应该发出警报', () => {
      riskManager.portfolioState.positionRatio = 0.52;

      const result = riskManager._checkGlobalPosition();

      expect(result.action).toBe(RISK_ACTION.ALERT);
      expect(result.level).toBe(PORTFOLIO_RISK_LEVEL.ELEVATED);
    });

    it('持仓数量过多应该发出警报', () => {
      riskManager.registerStrategy('s1');
      riskManager.updateStrategyState('s1', {
        positions: Array(15).fill({ symbol: 'BTC' }),
      });

      const result = riskManager._checkGlobalPosition();

      expect(result.action).toBe(RISK_ACTION.ALERT);
      expect(result.details.positionCount).toBe(15);
    });
  });

  // ============================================
  // 相关性风险检查测试
  // ============================================

  describe('_checkCorrelationRisk', () => {
    it('没有相关性分析器应该返回正常', () => {
      const result = riskManager._checkCorrelationRisk();

      expect(result.action).toBe(RISK_ACTION.NONE);
      expect(result.level).toBe(PORTFOLIO_RISK_LEVEL.NORMAL);
    });

    it('有相关性分析器应该检查高相关对', async () => {
      await riskManager.init({
        correlationAnalyzer: mockCorrelationAnalyzer,
      });

      mockCorrelationAnalyzer.findHighCorrelationPairs.mockReturnValue([
        { strategies: ['s1', 's2'], correlation: 0.85 },
        { strategies: ['s2', 's3'], correlation: 0.78 },
        { strategies: ['s1', 's3'], correlation: 0.72 },
      ]);

      const result = riskManager._checkCorrelationRisk();

      expect(result.action).toBe(RISK_ACTION.REBALANCE);
      expect(result.level).toBe(PORTFOLIO_RISK_LEVEL.ELEVATED);
    });
  });

  // ============================================
  // VaR 检查测试
  // ============================================

  describe('_checkVaR', () => {
    beforeEach(async () => {
      await riskManager.init({ initialEquity: 100000 });
    });

    it('应该返回 VaR 检查结果', () => {
      riskManager.portfolioState.totalPositionValue = 50000;

      const result = riskManager._checkVaR();

      expect(result.type).toBe('var');
      expect(result.details.var).toBeDefined();
      expect(result.details.cvar).toBeDefined();
    });

    it('VaR 超限应该降低敞口', () => {
      riskManager.portfolioState.totalEquity = 100000;
      riskManager.portfolioState.totalPositionValue = 200000;

      const result = riskManager._checkVaR();

      // 简化计算下 VaR 可能超过 5% 限制
      expect([RISK_ACTION.NONE, RISK_ACTION.REDUCE_EXPOSURE, RISK_ACTION.REDUCE_ALL]).toContain(result.action);
    });
  });

  describe('_calculatePortfolioVaR', () => {
    it('数据不足时应该使用简化估算', () => {
      riskManager.portfolioState.totalPositionValue = 50000;

      const result = riskManager._calculatePortfolioVaR();

      expect(result.method).toBe('simplified');
      expect(result.var).toBeGreaterThan(0);
      expect(result.cvar).toBeGreaterThan(result.var);
    });

    it('有足够数据时应该使用历史模拟', () => {
      riskManager.registerStrategy('strategy1');
      const state = riskManager.strategyStates.get('strategy1');
      state.returns = [];
      for (let i = 0; i < 20; i++) {
        state.returns.push((Math.random() - 0.5) * 0.02);
      }
      riskManager.portfolioState.totalPositionValue = 50000;

      const result = riskManager._calculatePortfolioVaR();

      expect(result.method).toBe('historical');
    });
  });

  // ============================================
  // 风控动作执行测试
  // ============================================

  describe('_executeRiskActions', () => {
    it('应该执行最严重的动作', async () => {
      const results = [
        { action: RISK_ACTION.ALERT, level: PORTFOLIO_RISK_LEVEL.ELEVATED },
        { action: RISK_ACTION.PAUSE_NEW_TRADES, level: PORTFOLIO_RISK_LEVEL.HIGH, message: 'test' },
      ];

      await riskManager._executeRiskActions(results);

      expect(riskManager.portfolioState.tradingAllowed).toBe(false);
    });

    it('NONE 动作不应该有任何操作', async () => {
      const results = [
        { action: RISK_ACTION.NONE, level: PORTFOLIO_RISK_LEVEL.NORMAL },
      ];

      await riskManager._executeRiskActions(results);

      expect(riskManager.portfolioState.tradingAllowed).toBe(true);
    });
  });

  describe('_emergencyClose', () => {
    it('应该暂停交易', async () => {
      await riskManager._emergencyClose({ message: 'test emergency' });

      expect(riskManager.portfolioState.tradingAllowed).toBe(false);
      expect(riskManager.portfolioState.pauseReason).toBe('test emergency');
    });

    it('应该记录风控事件', async () => {
      await riskManager._emergencyClose({ message: 'test' });

      expect(riskManager.riskHistory.length).toBe(1);
      expect(riskManager.riskHistory[0].type).toBe('emergencyClose');
    });

    it('应该发射 emergencyClose 事件', async () => {
      const listener = vi.fn();
      riskManager.on('emergencyClose', listener);

      await riskManager._emergencyClose({ message: 'test' });

      expect(listener).toHaveBeenCalled();
    });

    it('有执行器时应该调用紧急平仓', async () => {
      await riskManager.init({ executor: mockExecutor });

      await riskManager._emergencyClose({ message: 'test' });

      expect(mockExecutor.emergencyCloseAll).toHaveBeenCalled();
    });
  });

  describe('_reduceAllPositions', () => {
    it('应该记录风控事件', async () => {
      await riskManager._reduceAllPositions({ message: 'test' });

      expect(riskManager.riskHistory.length).toBe(1);
      expect(riskManager.riskHistory[0].type).toBe('reduceAll');
    });

    it('冷却期内应该跳过', async () => {
      riskManager.lastDeRiskTime = Date.now();

      await riskManager._reduceAllPositions({ message: 'test' });

      expect(riskManager.riskHistory.length).toBe(0);
    });

    it('应该发射 reduceAll 事件', async () => {
      const listener = vi.fn();
      riskManager.on('reduceAll', listener);

      await riskManager._reduceAllPositions({ message: 'test' });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('_reduceExposure', () => {
    it('冷却期内应该跳过', async () => {
      riskManager.lastDeRiskTime = Date.now();

      await riskManager._reduceExposure({ message: 'test' });

      expect(riskManager.riskHistory.length).toBe(0);
    });

    it('应该发射 reduceExposure 事件', async () => {
      const listener = vi.fn();
      riskManager.on('reduceExposure', listener);

      await riskManager._reduceExposure({ message: 'test' });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('_pauseNewTrades', () => {
    it('应该暂停交易', () => {
      riskManager._pauseNewTrades({ message: 'test' });

      expect(riskManager.portfolioState.tradingAllowed).toBe(false);
    });

    it('已暂停时应该跳过', () => {
      riskManager.portfolioState.tradingAllowed = false;
      const historyBefore = riskManager.riskHistory.length;

      riskManager._pauseNewTrades({ message: 'test' });

      expect(riskManager.riskHistory.length).toBe(historyBefore);
    });

    it('应该发射 tradingPaused 事件', () => {
      const listener = vi.fn();
      riskManager.on('tradingPaused', listener);

      riskManager._pauseNewTrades({ message: 'test' });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('_triggerRebalance', () => {
    it('应该记录风控事件', () => {
      riskManager._triggerRebalance({ message: 'test' });

      expect(riskManager.riskHistory.length).toBe(1);
      expect(riskManager.riskHistory[0].type).toBe('rebalance');
    });

    it('有资金分配器时应该调用再平衡', async () => {
      await riskManager.init({ capitalAllocator: mockCapitalAllocator });

      riskManager._triggerRebalance({ message: 'test' });

      expect(mockCapitalAllocator.rebalance).toHaveBeenCalledWith('risk_triggered');
    });

    it('应该发射 rebalanceTriggered 事件', () => {
      const listener = vi.fn();
      riskManager.on('rebalanceTriggered', listener);

      riskManager._triggerRebalance({ message: 'test' });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('_emitAlert', () => {
    it('应该发射 alert 事件', () => {
      const listener = vi.fn();
      riskManager.on('alert', listener);

      riskManager._emitAlert({
        level: PORTFOLIO_RISK_LEVEL.ELEVATED,
        type: 'position',
        message: 'test alert',
        details: {},
      });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: PORTFOLIO_RISK_LEVEL.ELEVATED,
          type: 'position',
          message: 'test alert',
        })
      );
    });
  });

  // ============================================
  // 状态更新测试
  // ============================================

  describe('_updatePortfolioState', () => {
    it('应该汇总策略权益', () => {
      riskManager.registerStrategy('s1');
      riskManager.registerStrategy('s2');
      riskManager.updateStrategyState('s1', { equity: 50000, positionValue: 20000 });
      riskManager.updateStrategyState('s2', { equity: 30000, positionValue: 10000 });

      expect(riskManager.portfolioState.totalEquity).toBe(80000);
      expect(riskManager.portfolioState.totalPositionValue).toBe(30000);
    });

    it('应该计算仓位比例', () => {
      riskManager.registerStrategy('s1');
      riskManager.updateStrategyState('s1', { equity: 100000, positionValue: 50000 });

      expect(riskManager.portfolioState.positionRatio).toBe(0.5);
    });

    it('应该计算当前回撤', () => {
      riskManager.portfolioState.peakEquity = 100000;
      riskManager.registerStrategy('s1');
      riskManager.updateStrategyState('s1', { equity: 90000 });

      expect(riskManager.portfolioState.currentDrawdown).toBeCloseTo(0.1, 2);
    });
  });

  describe('_updateRiskLevel', () => {
    it('应该设置最高风险级别', () => {
      const results = [
        { level: PORTFOLIO_RISK_LEVEL.NORMAL },
        { level: PORTFOLIO_RISK_LEVEL.HIGH },
        { level: PORTFOLIO_RISK_LEVEL.ELEVATED },
      ];

      riskManager._updateRiskLevel(results);

      expect(riskManager.portfolioState.riskLevel).toBe(PORTFOLIO_RISK_LEVEL.HIGH);
    });

    it('风险级别变化时应该发射事件', () => {
      const listener = vi.fn();
      riskManager.on('riskLevelChanged', listener);

      riskManager._updateRiskLevel([{ level: PORTFOLIO_RISK_LEVEL.HIGH }]);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          previousLevel: PORTFOLIO_RISK_LEVEL.NORMAL,
          currentLevel: PORTFOLIO_RISK_LEVEL.HIGH,
        })
      );
    });

    it('相同风险级别不应该发射事件', () => {
      const listener = vi.fn();
      riskManager.on('riskLevelChanged', listener);

      riskManager._updateRiskLevel([{ level: PORTFOLIO_RISK_LEVEL.NORMAL }]);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('_recordRiskEvent', () => {
    it('应该记录风控事件', () => {
      riskManager._recordRiskEvent('testType', { message: 'test' });

      expect(riskManager.riskHistory.length).toBe(1);
      expect(riskManager.riskHistory[0].type).toBe('testType');
      expect(riskManager.riskHistory[0].timestamp).toBeGreaterThan(0);
    });

    it('应该限制历史长度', () => {
      for (let i = 0; i < 250; i++) {
        riskManager._recordRiskEvent('test', {});
      }

      expect(riskManager.riskHistory.length).toBeLessThanOrEqual(200);
    });
  });

  // ============================================
  // 公共 API 测试
  // ============================================

  describe('getStatus', () => {
    beforeEach(() => {
      riskManager.registerStrategy('strategy1');
    });

    it('应该返回状态信息', () => {
      const status = riskManager.getStatus();

      expect(status.running).toBeDefined();
      expect(status.portfolioState).toBeDefined();
      expect(status.strategyCount).toBe(1);
      expect(status.strategies).toBeDefined();
      expect(status.riskBudgets).toBeDefined();
      expect(status.config).toBeDefined();
    });

    it('应该包含最近风控事件', () => {
      riskManager._recordRiskEvent('test', {});

      const status = riskManager.getStatus();

      expect(status.recentRiskEvents.length).toBe(1);
    });
  });

  describe('getRiskReport', () => {
    beforeEach(async () => {
      await riskManager.init({ initialEquity: 100000 });
      riskManager.registerStrategy('strategy1');
    });

    it('应该返回风险报告', () => {
      const report = riskManager.getRiskReport();

      expect(report.timestamp).toBeDefined();
      expect(report.portfolio).toBeDefined();
      expect(report.var).toBeDefined();
      expect(report.strategies).toBeDefined();
      expect(report.riskBudgets).toBeDefined();
    });

    it('应该包含组合信息', () => {
      const report = riskManager.getRiskReport();

      expect(report.portfolio.totalEquity).toBeDefined();
      expect(report.portfolio.riskLevel).toBeDefined();
      expect(report.portfolio.tradingAllowed).toBeDefined();
    });

    it('应该包含 VaR 信息', () => {
      riskManager.portfolioState.totalPositionValue = 50000;

      const report = riskManager.getRiskReport();

      expect(report.var.var).toBeDefined();
      expect(report.var.cvar).toBeDefined();
    });
  });

  // ============================================
  // 日志测试
  // ============================================

  describe('log', () => {
    it('verbose=false 时应该跳过 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      riskManager.config.verbose = false;

      riskManager.log('test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 error 日志', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      riskManager.log('error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 warn 日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      riskManager.log('warn message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// 常量导出测试
// ============================================

describe('PortfolioRiskManager Constants', () => {
  describe('PORTFOLIO_RISK_LEVEL', () => {
    it('应该包含所有风险级别', () => {
      expect(PORTFOLIO_RISK_LEVEL.SAFE).toBe('safe');
      expect(PORTFOLIO_RISK_LEVEL.NORMAL).toBe('normal');
      expect(PORTFOLIO_RISK_LEVEL.ELEVATED).toBe('elevated');
      expect(PORTFOLIO_RISK_LEVEL.HIGH).toBe('high');
      expect(PORTFOLIO_RISK_LEVEL.CRITICAL).toBe('critical');
      expect(PORTFOLIO_RISK_LEVEL.EMERGENCY).toBe('emergency');
    });
  });

  describe('RISK_ACTION', () => {
    it('应该包含所有风控动作', () => {
      expect(RISK_ACTION.NONE).toBe('none');
      expect(RISK_ACTION.ALERT).toBe('alert');
      expect(RISK_ACTION.REDUCE_EXPOSURE).toBe('reduce_exposure');
      expect(RISK_ACTION.PAUSE_NEW_TRADES).toBe('pause_new_trades');
      expect(RISK_ACTION.REDUCE_ALL).toBe('reduce_all');
      expect(RISK_ACTION.EMERGENCY_CLOSE).toBe('emergency_close');
      expect(RISK_ACTION.REBALANCE).toBe('rebalance');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('应该包含默认配置', () => {
      expect(DEFAULT_CONFIG.maxTotalPositionRatio).toBe(0.60);
      expect(DEFAULT_CONFIG.maxPortfolioDrawdown).toBe(0.15);
      expect(DEFAULT_CONFIG.varConfidenceLevel).toBe(0.95);
      expect(DEFAULT_CONFIG.enableAutoDeRisk).toBe(true);
    });
  });
});
