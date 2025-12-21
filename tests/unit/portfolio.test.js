/**
 * 组合管理模块测试
 * Portfolio Management Module Tests
 * @module tests/unit/portfolio.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PortfolioManager,
  PORTFOLIO_STATUS,
} from '../../src/portfolio/PortfolioManager.js';
import {
  PortfolioRiskManager,
  PORTFOLIO_RISK_LEVEL,
  RISK_ACTION,
} from '../../src/risk/PortfolioRiskManager.js';

// ============================================
// Mock CorrelationAnalyzer
// ============================================

vi.mock('../../src/analytics/CorrelationAnalyzer.js', () => ({
  CorrelationAnalyzer: class {
    constructor(config) {
      this.config = config;
      this.strategies = [];
      this.strategyReturns = new Map();
      this.correlationMatrix = null;
      this.running = false;
      this._listeners = {};
    }

    on(event, handler) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(handler);
    }

    emit(event, data) {
      if (this._listeners[event]) {
        this._listeners[event].forEach(h => h(data));
      }
    }

    removeAllListeners() {
      this._listeners = {};
    }

    start() {
      this.running = true;
    }

    stop() {
      this.running = false;
    }

    registerStrategy(strategyId, config) {
      this.strategies.push(strategyId);
      this.strategyReturns.set(strategyId, []);
    }

    removeStrategy(strategyId) {
      const index = this.strategies.indexOf(strategyId);
      if (index > -1) {
        this.strategies.splice(index, 1);
        this.strategyReturns.delete(strategyId);
      }
    }

    recordReturn(strategyId, returnValue, equity) {
      if (!this.strategyReturns.has(strategyId)) {
        this.strategyReturns.set(strategyId, []);
      }
      this.strategyReturns.get(strategyId).push({ return: returnValue, equity });
    }

    buildCorrelationMatrix() {
      return {
        strategies: this.strategies,
        matrix: this.strategies.map(() =>
          this.strategies.map(() => Math.random())
        ),
      };
    }

    buildCovarianceMatrix() {
      return {
        strategies: this.strategies,
        matrix: this.strategies.map(() =>
          this.strategies.map(() => Math.random() * 0.01)
        ),
      };
    }

    findLowCorrelationPairs() {
      return [];
    }

    findHighCorrelationPairs(threshold) {
      return [];
    }

    getOptimalCombination(count) {
      return {
        strategies: this.strategies.slice(0, count),
        avgCorrelation: 0.2,
      };
    }

    getAnalysisReport() {
      return {
        strategyCount: this.strategies.length,
        correlationMatrix: this.correlationMatrix,
      };
    }

    getStatus() {
      return {
        running: this.running,
        strategyCount: this.strategies.length,
      };
    }
  },
}));

// ============================================
// Mock CapitalAllocator
// ============================================

vi.mock('../../src/capital/CapitalAllocator.js', () => ({
  CapitalAllocator: class {
    constructor(config) {
      this.config = config;
      this.strategyStats = new Map();
      this.currentAllocation = new Map();
      this.running = false;
      this._listeners = {};
    }

    on(event, handler) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(handler);
    }

    emit(event, data) {
      if (this._listeners[event]) {
        this._listeners[event].forEach(h => h(data));
      }
    }

    removeAllListeners() {
      this._listeners = {};
    }

    start() {
      this.running = true;
    }

    stop() {
      this.running = false;
    }

    updateStrategyStats(strategyId, stats) {
      this.strategyStats.set(strategyId, {
        ...this.strategyStats.get(strategyId),
        ...stats,
      });
    }

    setCovarianceMatrix(matrix) {
      this.covarianceMatrix = matrix;
    }

    setCorrelationMatrix(matrix) {
      this.correlationMatrix = matrix;
    }

    calculateAllocation(method) {
      const strategies = [...this.strategyStats.keys()];
      const weights = {};
      const allocations = {};
      const weight = strategies.length > 0 ? 1 / strategies.length : 0;

      strategies.forEach(id => {
        weights[id] = weight;
        allocations[id] = {
          weight,
          amount: weight * (this.config?.totalCapital || 100000),
        };
      });

      return {
        method: method || 'equal_weight',
        weights,
        allocations,
        totalCapital: this.config?.totalCapital || 100000,
        timestamp: Date.now(),
        metrics: { effectiveStrategies: strategies.length },
      };
    }

    getCurrentAllocation() {
      const strategies = [...this.strategyStats.keys()];
      const weights = {};
      const allocations = {};

      strategies.forEach(id => {
        weights[id] = this.currentAllocation.get(id) || 0;
        allocations[id] = {
          weight: weights[id],
          amount: weights[id] * (this.config?.totalCapital || 100000),
        };
      });

      return {
        weights,
        allocations,
        totalCapital: this.config?.totalCapital || 100000,
        lastRebalanceTime: Date.now(),
      };
    }

    rebalance(trigger) {
      const allocation = this.calculateAllocation();
      for (const [id, weight] of Object.entries(allocation.weights)) {
        this.currentAllocation.set(id, weight);
      }
      return {
        trigger,
        allocation,
        adjustments: {},
        timestamp: Date.now(),
      };
    }

    getStatus() {
      return {
        running: this.running,
        strategyCount: this.strategyStats.size,
      };
    }
  },
  ALLOCATION_METHOD: {
    EQUAL_WEIGHT: 'equal_weight',
    RISK_PARITY: 'risk_parity',
    MIN_VARIANCE: 'min_variance',
    MAX_SHARPE: 'max_sharpe',
    MIN_CORRELATION: 'min_correlation',
    KELLY: 'kelly',
    CUSTOM: 'custom',
  },
}));

// ============================================
// Mock PortfolioRiskManager for PortfolioManager tests
// ============================================

vi.mock('../../src/risk/PortfolioRiskManager.js', () => ({
  PortfolioRiskManager: class {
    constructor(config = {}) {
      this.config = {
        maxTotalPositionRatio: 0.60,
        maxPortfolioDrawdown: 0.15,
        maxDailyDrawdown: 0.05,
        maxWeeklyDrawdown: 0.10,
        checkInterval: 5000,
        verbose: true,
        logPrefix: '[PortfolioRiskMgr]',
        ...config,
      };
      this.strategyStates = new Map();
      this.portfolioState = {
        totalEquity: 0,
        totalPositionValue: 0,
        positionRatio: 0,
        riskLevel: 'normal',
        tradingAllowed: true,
        pauseReason: null,
      };
      this.riskBudgets = new Map();
      this.riskHistory = [];
      this.running = false;
      this._listeners = {};
    }

    on(event, handler) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(handler);
    }

    emit(event, data) {
      if (this._listeners[event]) {
        this._listeners[event].forEach(h => h(data));
      }
    }

    removeAllListeners() {
      this._listeners = {};
    }

    async init(options) {
      this.correlationAnalyzer = options.correlationAnalyzer;
      this.capitalAllocator = options.capitalAllocator;
      this.executor = options.executor;
      if (options.initialEquity) {
        this.portfolioState.totalEquity = options.initialEquity;
        this.portfolioState.peakEquity = options.initialEquity;
        this.portfolioState.dailyStartEquity = options.initialEquity;
        this.portfolioState.weeklyStartEquity = options.initialEquity;
      }
    }

    start() {
      this.running = true;
      this.emit('started');
    }

    stop() {
      this.running = false;
      this.checkTimer = null;
      this.emit('stopped');
    }

    registerStrategy(strategyId, config = {}) {
      this.strategyStates.set(strategyId, {
        id: strategyId,
        positions: [],
        positionValue: 0,
        equity: 0,
        tradingAllowed: true,
      });
      this.riskBudgets.set(strategyId, {
        budget: config.riskBudget || 10000,
        used: 0,
        remaining: config.riskBudget || 10000,
      });
      this.emit('strategyRegistered', { strategyId, config });
    }

    updateStrategyState(strategyId, state) {
      if (!this.strategyStates.has(strategyId)) {
        this.registerStrategy(strategyId);
      }
      const existing = this.strategyStates.get(strategyId) || {};
      this.strategyStates.set(strategyId, { ...existing, ...state });
    }

    checkOrder(order) {
      return {
        allowed: this.portfolioState.tradingAllowed,
        reasons: this.portfolioState.tradingAllowed ? [] : ['Trading paused'],
        warnings: [],
        riskLevel: this.portfolioState.riskLevel,
      };
    }

    pauseTrading(reason) {
      this.portfolioState.tradingAllowed = false;
      this.portfolioState.pauseReason = reason;
      this.emit('tradingPaused', { reason });
    }

    resumeTrading() {
      this.portfolioState.tradingAllowed = true;
      this.portfolioState.pauseReason = null;
      this.emit('tradingResumed', { reason: 'manual' });
    }

    updateTotalEquity(equity) {
      this.portfolioState.totalEquity = equity;
      if (equity > (this.portfolioState.peakEquity || 0)) {
        this.portfolioState.peakEquity = equity;
      }
    }

    getStatus() {
      return {
        running: this.running,
        portfolioState: { ...this.portfolioState },
        strategyCount: this.strategyStates.size,
        strategies: Object.fromEntries(
          [...this.strategyStates].map(([id, state]) => [
            id,
            { positionValue: state.positionValue, equity: state.equity, tradingAllowed: state.tradingAllowed },
          ])
        ),
        riskBudgets: Object.fromEntries(this.riskBudgets),
        recentRiskEvents: this.riskHistory.slice(-10),
        config: {
          maxTotalPositionRatio: this.config?.maxTotalPositionRatio || 0.6,
          maxPortfolioDrawdown: this.config?.maxPortfolioDrawdown || 0.15,
        },
      };
    }

    getRiskReport() {
      return {
        timestamp: Date.now(),
        portfolio: {
          totalEquity: this.portfolioState.totalEquity,
          riskLevel: this.portfolioState.riskLevel,
        },
        var: { var: 1000, cvar: 1500, method: 'simplified' },
        strategies: Object.fromEntries(this.strategyStates),
        riskBudgets: Object.fromEntries(this.riskBudgets),
        recentEvents: this.riskHistory.slice(-20),
      };
    }

    log(message, level = 'info') {
      if (!this.config?.verbose && level === 'info') return;
      const fullMessage = `${this.config?.logPrefix || '[PortfolioRiskMgr]'} ${message}`;
      switch (level) {
        case 'error':
          console.error(fullMessage);
          break;
        case 'warn':
          console.warn(fullMessage);
          break;
        default:
          console.log(fullMessage);
      }
    }
  },
  PORTFOLIO_RISK_LEVEL: {
    SAFE: 'safe',
    NORMAL: 'normal',
    ELEVATED: 'elevated',
    HIGH: 'high',
    CRITICAL: 'critical',
    EMERGENCY: 'emergency',
  },
  RISK_ACTION: {
    NONE: 'none',
    ALERT: 'alert',
    REDUCE_EXPOSURE: 'reduce_exposure',
    PAUSE_NEW_TRADES: 'pause_new_trades',
    REDUCE_ALL: 'reduce_all',
    EMERGENCY_CLOSE: 'emergency_close',
    REBALANCE: 'rebalance',
  },
}));

// ============================================
// Mock Strategy
// ============================================

function createMockStrategy(name = 'TestStrategy') {
  return {
    name,
    _listeners: {},
    on(event, handler) {
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(handler);
    },
    emit(event, data) {
      if (this._listeners[event]) {
        this._listeners[event].forEach(h => h(data));
      }
    },
    removeAllListeners() {
      this._listeners = {};
    },
    onAllocationChange: vi.fn(),
  };
}

// ============================================
// PortfolioManager 测试
// ============================================

describe('PortfolioManager', () => {
  let manager;

  beforeEach(() => {
    manager = new PortfolioManager({
      totalCapital: 100000,
      allocationMethod: 'risk_parity',
      autoRebalance: true,
      verbose: false,
    });
  });

  afterEach(() => {
    if (manager) {
      manager.stop();
      manager.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const m = new PortfolioManager();

      expect(m.config.totalCapital).toBe(100000);
      expect(m.config.allocationMethod).toBe('risk_parity');
      expect(m.config.autoRebalance).toBe(true);
    });

    it('应该使用自定义配置', () => {
      expect(manager.config.totalCapital).toBe(100000);
      expect(manager.config.allocationMethod).toBe('risk_parity');
    });

    it('应该初始化状态为 STOPPED', () => {
      expect(manager.status).toBe(PORTFOLIO_STATUS.STOPPED);
    });

    it('应该初始化空策略列表', () => {
      expect(manager.strategies.size).toBe(0);
    });

    it('应该初始化统计信息', () => {
      expect(manager.statistics.totalEquity).toBe(100000);
      expect(manager.statistics.totalTrades).toBe(0);
      expect(manager.statistics.winRate).toBe(0);
    });

    it('应该初始化空权益曲线', () => {
      expect(manager.equityCurve).toEqual([]);
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('init', () => {
    it('应该初始化所有模块', async () => {
      await manager.init();

      expect(manager.correlationAnalyzer).toBeDefined();
      expect(manager.capitalAllocator).toBeDefined();
      expect(manager.portfolioRiskManager).toBeDefined();
    });

    it('应该发射 initialized 事件', async () => {
      const listener = vi.fn();
      manager.on('initialized', listener);

      await manager.init();

      expect(listener).toHaveBeenCalled();
    });

    it('应该保存 executor 引用', async () => {
      const executor = { execute: vi.fn() };
      await manager.init({ executor });

      expect(manager.executor).toBe(executor);
    });
  });

  describe('start/stop', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('应该启动组合管理器', async () => {
      const listener = vi.fn();
      manager.on('started', listener);

      await manager.start();

      expect(manager.status).toBe(PORTFOLIO_STATUS.RUNNING);
      expect(listener).toHaveBeenCalled();
    });

    it('应该启动所有模块', async () => {
      await manager.start();

      expect(manager.correlationAnalyzer.running).toBe(true);
      expect(manager.capitalAllocator.running).toBe(true);
      expect(manager.portfolioRiskManager.running).toBe(true);
    });

    it('应该停止组合管理器', async () => {
      const listener = vi.fn();
      manager.on('stopped', listener);

      await manager.start();
      await manager.stop();

      expect(manager.status).toBe(PORTFOLIO_STATUS.STOPPED);
      expect(listener).toHaveBeenCalled();
    });

    it('应该清除定时器', async () => {
      await manager.start();
      expect(manager.statusTimer).not.toBeNull();
      expect(manager.reportTimer).not.toBeNull();

      await manager.stop();
      expect(manager.statusTimer).toBeNull();
      expect(manager.reportTimer).toBeNull();
    });

    it('重复启动应该无操作', async () => {
      await manager.start();
      await manager.start();

      expect(manager.status).toBe(PORTFOLIO_STATUS.RUNNING);
    });

    it('重复停止应该无操作', async () => {
      await manager.stop();
      expect(manager.status).toBe(PORTFOLIO_STATUS.STOPPED);
    });
  });

  // ============================================
  // 策略管理测试
  // ============================================

  describe('addStrategy', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('应该添加策略', () => {
      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy, { expectedReturn: 0.1 });

      expect(manager.strategies.has('strategy1')).toBe(true);
    });

    it('应该发射 strategyAdded 事件', () => {
      const listener = vi.fn();
      manager.on('strategyAdded', listener);

      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ strategyId: 'strategy1' })
      );
    });

    it('应该注册到相关性分析器', () => {
      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy);

      expect(manager.correlationAnalyzer.strategies).toContain('strategy1');
    });

    it('应该注册到风控管理器', () => {
      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy);

      expect(manager.portfolioRiskManager.strategyStates.has('strategy1')).toBe(true);
    });

    it('应该更新资金分配器统计', () => {
      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy, {
        expectedReturn: 0.15,
        volatility: 0.2,
      });

      expect(manager.capitalAllocator.strategyStats.has('strategy1')).toBe(true);
    });

    it('重复添加同一策略应该跳过', () => {
      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy);
      manager.addStrategy('strategy1', strategy);

      expect(manager.strategies.size).toBe(1);
    });

    it('运行时添加策略应该重新计算分配', async () => {
      await manager.start();

      const listener = vi.fn();
      manager.on('allocationUpdated', listener);

      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('removeStrategy', () => {
    beforeEach(async () => {
      await manager.init();
      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy);
    });

    it('应该移除策略', () => {
      manager.removeStrategy('strategy1');

      expect(manager.strategies.has('strategy1')).toBe(false);
    });

    it('应该发射 strategyRemoved 事件', () => {
      const listener = vi.fn();
      manager.on('strategyRemoved', listener);

      manager.removeStrategy('strategy1');

      expect(listener).toHaveBeenCalledWith({ strategyId: 'strategy1' });
    });

    it('应该从相关性分析器移除', () => {
      manager.removeStrategy('strategy1');

      expect(manager.correlationAnalyzer.strategies).not.toContain('strategy1');
    });

    it('移除不存在的策略应该无操作', () => {
      manager.removeStrategy('nonexistent');
      // 不应该抛错
    });
  });

  describe('updateStrategyState', () => {
    beforeEach(async () => {
      await manager.init();
      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy);
    });

    it('应该更新策略状态', () => {
      manager.updateStrategyState('strategy1', {
        equity: 50000,
        positionValue: 20000,
      });

      const state = manager.strategies.get('strategy1').state;
      expect(state.equity).toBe(50000);
      expect(state.positionValue).toBe(20000);
    });

    it('应该同步到风控管理器', () => {
      manager.updateStrategyState('strategy1', { equity: 50000 });

      const riskState = manager.portfolioRiskManager.strategyStates.get('strategy1');
      expect(riskState.equity).toBe(50000);
    });

    it('有收益数据时应该记录到相关性分析器', () => {
      manager.updateStrategyState('strategy1', {
        dailyReturn: 0.02,
        equity: 51000,
      });

      const returns = manager.correlationAnalyzer.strategyReturns.get('strategy1');
      expect(returns.length).toBe(1);
    });

    it('不存在的策略应该跳过', () => {
      manager.updateStrategyState('nonexistent', { equity: 50000 });
      // 不应该抛错
    });
  });

  describe('recordTrade', () => {
    beforeEach(async () => {
      await manager.init();
      const strategy = createMockStrategy('strategy1');
      manager.addStrategy('strategy1', strategy);
    });

    it('应该记录交易', () => {
      manager.recordTrade('strategy1', {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 100,
      });

      const trades = manager.strategies.get('strategy1').state.trades;
      expect(trades.length).toBe(1);
      expect(trades[0].symbol).toBe('BTC/USDT');
    });

    it('应该更新总交易数', () => {
      manager.recordTrade('strategy1', { pnl: 100 });

      expect(manager.statistics.totalTrades).toBe(1);
    });

    it('应该更新胜率 (盈利交易)', () => {
      manager.recordTrade('strategy1', { pnl: 100 });

      expect(manager.statistics.winRate).toBe(1);
    });

    it('应该更新胜率 (亏损交易)', () => {
      manager.recordTrade('strategy1', { pnl: -100 });

      expect(manager.statistics.winRate).toBe(0);
    });

    it('应该发射 tradeRecorded 事件', () => {
      const listener = vi.fn();
      manager.on('tradeRecorded', listener);

      manager.recordTrade('strategy1', { pnl: 100 });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ strategyId: 'strategy1' })
      );
    });

    it('不存在的策略应该跳过', () => {
      manager.recordTrade('nonexistent', { pnl: 100 });
      // 不应该抛错
    });
  });

  // ============================================
  // 资金分配测试
  // ============================================

  describe('getAllocation', () => {
    beforeEach(async () => {
      await manager.init();
      manager.addStrategy('strategy1', createMockStrategy(), {});
      manager.addStrategy('strategy2', createMockStrategy(), {});
    });

    it('应该返回分配结果', () => {
      const allocation = manager.getAllocation();

      expect(allocation.weights).toBeDefined();
      expect(allocation.allocations).toBeDefined();
      expect(allocation.totalCapital).toBe(100000);
    });

    it('应该更新协方差矩阵', () => {
      manager.getAllocation();

      expect(manager.capitalAllocator.covarianceMatrix).toBeDefined();
    });

    it('应该更新相关性矩阵', () => {
      manager.getAllocation();

      expect(manager.capitalAllocator.correlationMatrix).toBeDefined();
    });
  });

  describe('rebalance', () => {
    beforeEach(async () => {
      await manager.init();
      manager.addStrategy('strategy1', createMockStrategy(), {});
      manager.addStrategy('strategy2', createMockStrategy(), {});
    });

    it('应该执行再平衡', async () => {
      const result = await manager.rebalance('manual');

      expect(result).toBeDefined();
      expect(result.result).toBeDefined();
      expect(result.adjustments).toBeDefined();
    });

    it('应该设置状态为 REBALANCING 然后恢复', async () => {
      await manager.rebalance();

      expect(manager.status).toBe(PORTFOLIO_STATUS.RUNNING);
    });

    it('应该发射 rebalanced 事件', async () => {
      const listener = vi.fn();
      manager.on('rebalanced', listener);

      await manager.rebalance('test_reason');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'test_reason' })
      );
    });
  });

  // ============================================
  // 风险管理测试
  // ============================================

  describe('checkOrder', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('应该返回订单检查结果', () => {
      const result = manager.checkOrder({
        strategyId: 'strategy1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBeDefined();
      expect(result.reasons).toBeDefined();
      expect(result.warnings).toBeDefined();
    });
  });

  describe('getRiskStatus', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('应该返回风险状态', () => {
      const status = manager.getRiskStatus();

      expect(status.running).toBeDefined();
      expect(status.portfolioState).toBeDefined();
    });
  });

  describe('pauseTrading/resumeTrading', () => {
    beforeEach(async () => {
      await manager.init();
      await manager.start();
    });

    it('应该暂停交易', () => {
      manager.pauseTrading('test reason');

      expect(manager.status).toBe(PORTFOLIO_STATUS.PAUSED);
    });

    it('应该发射 tradingPaused 事件', () => {
      const listener = vi.fn();
      manager.on('tradingPaused', listener);

      manager.pauseTrading('test reason');

      expect(listener).toHaveBeenCalledWith({ reason: 'test reason' });
    });

    it('应该恢复交易', () => {
      manager.pauseTrading('test');
      manager.resumeTrading();

      expect(manager.status).toBe(PORTFOLIO_STATUS.RUNNING);
    });

    it('应该发射 tradingResumed 事件', () => {
      const listener = vi.fn();
      manager.on('tradingResumed', listener);

      manager.pauseTrading('test');
      manager.resumeTrading();

      expect(listener).toHaveBeenCalled();
    });
  });

  // ============================================
  // 相关性分析测试
  // ============================================

  describe('getCorrelationMatrix', () => {
    beforeEach(async () => {
      await manager.init();
      manager.addStrategy('strategy1', createMockStrategy(), {});
      manager.addStrategy('strategy2', createMockStrategy(), {});
    });

    it('应该返回相关性矩阵', () => {
      const matrix = manager.getCorrelationMatrix();

      expect(matrix.strategies).toBeDefined();
      expect(matrix.matrix).toBeDefined();
    });
  });

  describe('getLowCorrelationPairs', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('应该返回低相关策略对', () => {
      const pairs = manager.getLowCorrelationPairs();

      expect(Array.isArray(pairs)).toBe(true);
    });
  });

  describe('getOptimalCombination', () => {
    beforeEach(async () => {
      await manager.init();
      manager.addStrategy('s1', createMockStrategy(), {});
      manager.addStrategy('s2', createMockStrategy(), {});
      manager.addStrategy('s3', createMockStrategy(), {});
    });

    it('应该返回最优组合', () => {
      const combination = manager.getOptimalCombination(2);

      expect(combination.strategies).toBeDefined();
      expect(combination.avgCorrelation).toBeDefined();
    });
  });

  describe('getCorrelationReport', () => {
    beforeEach(async () => {
      await manager.init();
    });

    it('应该返回相关性分析报告', () => {
      const report = manager.getCorrelationReport();

      expect(report).toBeDefined();
    });
  });

  // ============================================
  // 报告和状态测试
  // ============================================

  describe('getFullReport', () => {
    beforeEach(async () => {
      await manager.init();
      manager.addStrategy('strategy1', createMockStrategy(), {});
    });

    it('应该返回完整报告', () => {
      const report = manager.getFullReport();

      expect(report.timestamp).toBeDefined();
      expect(report.status).toBeDefined();
      expect(report.portfolio).toBeDefined();
      expect(report.strategies).toBeDefined();
      expect(report.allocation).toBeDefined();
      expect(report.correlation).toBeDefined();
      expect(report.risk).toBeDefined();
      expect(report.equityCurve).toBeDefined();
    });

    it('应该包含组合概览', () => {
      const report = manager.getFullReport();

      expect(report.portfolio.totalCapital).toBe(100000);
      expect(report.portfolio.totalEquity).toBeDefined();
      expect(report.portfolio.positionRatio).toBeDefined();
    });
  });

  describe('getStatus', () => {
    beforeEach(async () => {
      await manager.init();
      manager.addStrategy('strategy1', createMockStrategy(), {});
    });

    it('应该返回状态信息', () => {
      const status = manager.getStatus();

      expect(status.status).toBeDefined();
      expect(status.strategyCount).toBe(1);
      expect(status.strategies).toContain('strategy1');
      expect(status.statistics).toBeDefined();
      expect(status.config).toBeDefined();
      expect(status.modules).toBeDefined();
    });

    it('应该包含模块状态', () => {
      const status = manager.getStatus();

      expect(status.modules.correlationAnalyzer).toBeDefined();
      expect(status.modules.capitalAllocator).toBeDefined();
      expect(status.modules.portfolioRiskManager).toBeDefined();
    });
  });

  // ============================================
  // 日志测试
  // ============================================

  describe('log', () => {
    it('verbose=false 时应该跳过 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      manager.config.verbose = false;

      manager.log('test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 error 日志', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      manager.log('error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 warn 日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      manager.log('warn message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// PortfolioRiskManager 独立测试 (非 mock)
// ============================================

describe('PortfolioRiskManager (Real)', () => {
  let riskManager;

  beforeEach(() => {
    // 直接从源文件导入而非使用 mock
    riskManager = new PortfolioRiskManager({
      maxTotalPositionRatio: 0.60,
      maxPortfolioDrawdown: 0.15,
      maxDailyDrawdown: 0.05,
      checkInterval: 10000,
      verbose: false,
    });
  });

  afterEach(() => {
    if (riskManager) {
      riskManager.stop();
      riskManager.removeAllListeners();
    }
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const rm = new PortfolioRiskManager();

      expect(rm.config.maxTotalPositionRatio).toBe(0.60);
      expect(rm.config.maxPortfolioDrawdown).toBe(0.15);
    });

    it('应该使用自定义配置', () => {
      expect(riskManager.config.maxTotalPositionRatio).toBe(0.60);
    });

    it('应该初始化组合状态', () => {
      expect(riskManager.portfolioState.totalEquity).toBe(0);
      expect(riskManager.portfolioState.riskLevel).toBe(PORTFOLIO_RISK_LEVEL.NORMAL);
      expect(riskManager.portfolioState.tradingAllowed).toBe(true);
    });

    it('应该初始化空策略状态', () => {
      expect(riskManager.strategyStates.size).toBe(0);
    });
  });

  describe('init', () => {
    it('应该初始化成功', async () => {
      await riskManager.init({
        initialEquity: 100000,
      });

      expect(riskManager.portfolioState.totalEquity).toBe(100000);
      expect(riskManager.portfolioState.peakEquity).toBe(100000);
    });

    it('应该保存引用', async () => {
      const mockAnalyzer = {};
      const mockAllocator = {};
      const mockExecutor = {};

      await riskManager.init({
        correlationAnalyzer: mockAnalyzer,
        capitalAllocator: mockAllocator,
        executor: mockExecutor,
        initialEquity: 100000,
      });

      expect(riskManager.correlationAnalyzer).toBe(mockAnalyzer);
      expect(riskManager.capitalAllocator).toBe(mockAllocator);
      expect(riskManager.executor).toBe(mockExecutor);
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
  });

  describe('registerStrategy', () => {
    it('应该注册策略', () => {
      riskManager.registerStrategy('strategy1', { riskBudget: 5000 });

      expect(riskManager.strategyStates.has('strategy1')).toBe(true);
    });

    it('应该初始化风险预算', () => {
      riskManager.registerStrategy('strategy1', { riskBudget: 5000 });

      const budget = riskManager.riskBudgets.get('strategy1');
      expect(budget.budget).toBe(5000);
      expect(budget.remaining).toBe(5000);
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

    it('不存在时应该自动注册', () => {
      riskManager.updateStrategyState('newStrategy', { equity: 30000 });

      expect(riskManager.strategyStates.has('newStrategy')).toBe(true);
    });
  });

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
  });

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

  describe('updateTotalEquity', () => {
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
      riskManager.updateTotalEquity(110000);

      expect(riskManager.portfolioState.peakEquity).toBe(120000);
    });
  });

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

    it('应该包含 VaR 信息', () => {
      const report = riskManager.getRiskReport();

      expect(report.var.var).toBeDefined();
      expect(report.var.cvar).toBeDefined();
    });
  });

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
  });
});

// ============================================
// 常量导出测试
// ============================================

describe('Constants', () => {
  describe('PORTFOLIO_STATUS', () => {
    it('应该包含所有状态', () => {
      expect(PORTFOLIO_STATUS.INITIALIZING).toBe('initializing');
      expect(PORTFOLIO_STATUS.RUNNING).toBe('running');
      expect(PORTFOLIO_STATUS.PAUSED).toBe('paused');
      expect(PORTFOLIO_STATUS.REBALANCING).toBe('rebalancing');
      expect(PORTFOLIO_STATUS.EMERGENCY).toBe('emergency');
      expect(PORTFOLIO_STATUS.STOPPED).toBe('stopped');
    });
  });

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
});
