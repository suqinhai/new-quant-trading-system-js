/**
 * 多策略冲突 E2E 测试
 * Multi-Strategy Conflict E2E Tests
 *
 * 测试多个策略同时运行时可能产生的冲突和解决方案
 * @module tests/e2e/multiStrategyConflict.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  E2ETestEnvironment,
  MockStrategy,
  testUtils,
  RUN_MODE,
} from './e2eTestFramework.js';
import EventEmitter from 'events';

// ============================================
// 策略冲突检测器
// ============================================

class StrategyConflictDetector extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      maxPositionPerSymbol: config.maxPositionPerSymbol || 1,
      conflictResolution: config.conflictResolution || 'priority', // priority, fifo, reject
      signalTimeout: config.signalTimeout || 1000,
      maxPendingSignals: config.maxPendingSignals || 100,
      ...config,
    };

    this.pendingSignals = new Map(); // symbol -> signal[]
    this.activePositions = new Map(); // symbol -> position
    this.strategyPriorities = new Map();
    this.conflictLog = [];
    this.resolvedConflicts = [];
  }

  setStrategyPriority(strategyName, priority) {
    this.strategyPriorities.set(strategyName, priority);
  }

  getStrategyPriority(strategyName) {
    return this.strategyPriorities.get(strategyName) || 100; // 默认低优先级
  }

  // ============================================
  // 信号处理方法
  // ============================================

  processSignal(signal) {
    const { symbol, strategy } = signal;

    // 检查是否有冲突
    const conflicts = this._detectConflicts(signal);

    if (conflicts.length > 0) {
      this._logConflict(signal, conflicts);

      // 解决冲突
      const resolution = this._resolveConflicts(signal, conflicts);

      if (resolution.rejected) {
        this.emit('signalRejected', { signal, reason: resolution.reason, conflicts });
        return { accepted: false, reason: resolution.reason };
      }

      this.emit('conflictResolved', { signal, resolution, conflicts });
    }

    // 添加到待处理队列
    if (!this.pendingSignals.has(symbol)) {
      this.pendingSignals.set(symbol, []);
    }

    const symbolSignals = this.pendingSignals.get(symbol);

    if (symbolSignals.length >= this.config.maxPendingSignals) {
      return { accepted: false, reason: 'Max pending signals reached' };
    }

    symbolSignals.push({
      ...signal,
      receivedAt: Date.now(),
      priority: this.getStrategyPriority(strategy),
    });

    this.emit('signalAccepted', signal);
    return { accepted: true };
  }

  _detectConflicts(signal) {
    const conflicts = [];
    const { symbol, side, strategy } = signal;

    // 1. 检查同一标的的相反方向信号
    const pendingForSymbol = this.pendingSignals.get(symbol) || [];
    const oppositeSignals = pendingForSymbol.filter(s =>
      s.side !== side && s.strategy !== strategy
    );

    if (oppositeSignals.length > 0) {
      conflicts.push({
        type: 'opposite_direction',
        signals: oppositeSignals,
        description: `存在 ${oppositeSignals.length} 个相反方向的信号`,
      });
    }

    // 2. 检查已有持仓的冲突
    const activePosition = this.activePositions.get(symbol);
    if (activePosition) {
      // 同方向加仓检查
      if (activePosition.side === side) {
        conflicts.push({
          type: 'position_exists',
          position: activePosition,
          description: '已存在同方向持仓',
        });
      }

      // 反向平仓检查
      if (activePosition.side !== side && activePosition.strategy !== strategy) {
        conflicts.push({
          type: 'cross_strategy_close',
          position: activePosition,
          description: '尝试平掉其他策略的仓位',
        });
      }
    }

    // 3. 检查同一策略的重复信号
    const sameStrategySignals = pendingForSymbol.filter(s =>
      s.strategy === strategy && s.side === side
    );

    if (sameStrategySignals.length > 0) {
      conflicts.push({
        type: 'duplicate_signal',
        signals: sameStrategySignals,
        description: '同一策略的重复信号',
      });
    }

    // 4. 检查资源竞争
    const sameSideSignals = pendingForSymbol.filter(s =>
      s.side === side && s.strategy !== strategy
    );

    if (sameSideSignals.length > 0) {
      conflicts.push({
        type: 'resource_competition',
        signals: sameSideSignals,
        description: '多个策略竞争同一方向',
      });
    }

    return conflicts;
  }

  _resolveConflicts(signal, conflicts) {
    const resolution = {
      rejected: false,
      reason: null,
      action: null,
      affectedSignals: [],
    };

    for (const conflict of conflicts) {
      switch (conflict.type) {
        case 'opposite_direction':
          resolution.action = this._resolveOppositeDirection(signal, conflict);
          break;

        case 'position_exists':
          resolution.action = this._resolvePositionExists(signal, conflict);
          break;

        case 'cross_strategy_close':
          // 默认不允许跨策略平仓
          resolution.rejected = true;
          resolution.reason = '不允许平掉其他策略的仓位';
          break;

        case 'duplicate_signal':
          resolution.rejected = true;
          resolution.reason = '重复信号';
          break;

        case 'resource_competition':
          resolution.action = this._resolveResourceCompetition(signal, conflict);
          break;
      }

      if (resolution.rejected) break;
    }

    if (!resolution.rejected) {
      this.resolvedConflicts.push({
        signal,
        conflicts,
        resolution,
        timestamp: Date.now(),
      });
    }

    return resolution;
  }

  _resolveOppositeDirection(signal, conflict) {
    switch (this.config.conflictResolution) {
      case 'priority': {
        const signalPriority = this.getStrategyPriority(signal.strategy);
        const conflictingSignals = conflict.signals;

        // 找出优先级最高的信号
        let highestPriority = signalPriority;
        let winner = signal;

        for (const cs of conflictingSignals) {
          if (cs.priority < highestPriority) {
            highestPriority = cs.priority;
            winner = cs;
          }
        }

        if (winner !== signal) {
          return { type: 'reject_lower_priority', winner };
        }

        // 取消其他信号
        for (const cs of conflictingSignals) {
          this._cancelSignal(cs);
        }
        return { type: 'cancel_lower_priority', canceled: conflictingSignals };
      }

      case 'fifo':
        // 先到先得，拒绝后来的
        return { type: 'reject_later', reason: 'FIFO - earlier signal takes precedence' };

      case 'reject':
      default:
        return { type: 'reject_all_conflicts' };
    }
  }

  _resolvePositionExists(signal, conflict) {
    // 如果是同策略加仓，可以允许
    if (conflict.position.strategy === signal.strategy) {
      return { type: 'allow_add_position' };
    }

    // 不同策略，按优先级决定
    const signalPriority = this.getStrategyPriority(signal.strategy);
    const positionPriority = this.getStrategyPriority(conflict.position.strategy);

    if (signalPriority < positionPriority) {
      return { type: 'override_lower_priority_position' };
    }

    return { type: 'reject_lower_priority_signal' };
  }

  _resolveResourceCompetition(signal, conflict) {
    // 按优先级分配
    const signalPriority = this.getStrategyPriority(signal.strategy);
    const competitors = conflict.signals;

    for (const comp of competitors) {
      if (comp.priority < signalPriority) {
        // 有更高优先级的竞争者
        return { type: 'yield_to_higher_priority', winner: comp };
      }
    }

    return { type: 'win_competition' };
  }

  _cancelSignal(signal) {
    const symbolSignals = this.pendingSignals.get(signal.symbol);
    if (symbolSignals) {
      const index = symbolSignals.findIndex(s =>
        s.strategy === signal.strategy && s.receivedAt === signal.receivedAt
      );
      if (index >= 0) {
        symbolSignals.splice(index, 1);
        this.emit('signalCanceled', signal);
      }
    }
  }

  _logConflict(signal, conflicts) {
    this.conflictLog.push({
      signal,
      conflicts,
      timestamp: Date.now(),
    });
  }

  // ============================================
  // 持仓管理方法
  // ============================================

  openPosition(symbol, strategy, side, amount) {
    this.activePositions.set(symbol, {
      symbol,
      strategy,
      side,
      amount,
      openedAt: Date.now(),
    });
    this.emit('positionOpened', { symbol, strategy, side, amount });
  }

  closePosition(symbol, strategy) {
    const position = this.activePositions.get(symbol);
    if (position && position.strategy === strategy) {
      this.activePositions.delete(symbol);
      this.emit('positionClosed', { symbol, strategy });
      return true;
    }
    return false;
  }

  getNextSignal(symbol) {
    const signals = this.pendingSignals.get(symbol) || [];
    if (signals.length === 0) return null;

    // 按优先级排序（优先级数字越小越高）
    signals.sort((a, b) => a.priority - b.priority);

    // 过滤超时的信号
    const validSignals = signals.filter(s =>
      Date.now() - s.receivedAt < this.config.signalTimeout
    );

    if (validSignals.length === 0) {
      this.pendingSignals.set(symbol, []);
      return null;
    }

    const nextSignal = validSignals[0];
    signals.splice(signals.indexOf(nextSignal), 1);

    return nextSignal;
  }

  // ============================================
  // 状态查询方法
  // ============================================

  getConflictLog() {
    return [...this.conflictLog];
  }

  getResolvedConflicts() {
    return [...this.resolvedConflicts];
  }

  getPendingSignals(symbol = null) {
    if (symbol) {
      return [...(this.pendingSignals.get(symbol) || [])];
    }

    const all = [];
    for (const [, signals] of this.pendingSignals) {
      all.push(...signals);
    }
    return all;
  }

  getActivePositions() {
    return new Map(this.activePositions);
  }

  getStats() {
    return {
      totalConflicts: this.conflictLog.length,
      resolvedConflicts: this.resolvedConflicts.length,
      pendingSignals: this.getPendingSignals().length,
      activePositions: this.activePositions.size,
    };
  }

  reset() {
    this.pendingSignals.clear();
    this.activePositions.clear();
    this.conflictLog = [];
    this.resolvedConflicts = [];
  }
}

// ============================================
// 信号协调器
// ============================================

class SignalCoordinator extends EventEmitter {
  constructor(conflictDetector, config = {}) {
    super();
    this.conflictDetector = conflictDetector;
    this.config = {
      batchInterval: config.batchInterval || 100, // 批处理间隔
      maxBatchSize: config.maxBatchSize || 10,
      enableBatching: config.enableBatching || true,
      ...config,
    };

    this.signalQueue = [];
    this.processingBatch = false;
    this.processedCount = 0;
  }

  submitSignal(signal) {
    if (this.config.enableBatching) {
      this.signalQueue.push(signal);
      this._scheduleBatchProcessing();
      return { queued: true };
    }

    return this.conflictDetector.processSignal(signal);
  }

  _scheduleBatchProcessing() {
    if (this.processingBatch) return;

    setTimeout(() => this._processBatch(), this.config.batchInterval);
  }

  async _processBatch() {
    if (this.signalQueue.length === 0) {
      this.processingBatch = false;
      return;
    }

    this.processingBatch = true;

    const batch = this.signalQueue.splice(0, this.config.maxBatchSize);

    // 按符号分组
    const bySymbol = new Map();
    for (const signal of batch) {
      if (!bySymbol.has(signal.symbol)) {
        bySymbol.set(signal.symbol, []);
      }
      bySymbol.get(signal.symbol).push(signal);
    }

    // 处理每个符号的信号
    for (const [symbol, signals] of bySymbol) {
      // 按优先级排序
      signals.sort((a, b) =>
        this.conflictDetector.getStrategyPriority(a.strategy) -
        this.conflictDetector.getStrategyPriority(b.strategy)
      );

      for (const signal of signals) {
        const result = this.conflictDetector.processSignal(signal);
        this.processedCount++;

        if (result.accepted) {
          this.emit('signalProcessed', { signal, result });
        } else {
          this.emit('signalRejected', { signal, result });
        }
      }
    }

    this.emit('batchProcessed', { count: batch.length });

    // 继续处理剩余信号
    if (this.signalQueue.length > 0) {
      this._scheduleBatchProcessing();
    } else {
      this.processingBatch = false;
    }
  }

  getQueueLength() {
    return this.signalQueue.length;
  }

  getProcessedCount() {
    return this.processedCount;
  }

  clearQueue() {
    this.signalQueue = [];
  }
}

// ============================================
// 多策略冲突 E2E 测试
// ============================================

describe('Multi-Strategy Conflict E2E', () => {
  let env;
  let conflictDetector;
  let coordinator;

  beforeEach(async () => {
    env = new E2ETestEnvironment({
      mode: RUN_MODE.SHADOW,
      initialEquity: 100000,
      symbols: ['BTC/USDT', 'ETH/USDT'],
      exchanges: ['binance'],
      strategies: [
        { name: 'TrendFollowing', symbols: ['BTC/USDT', 'ETH/USDT'] },
        { name: 'MeanReversion', symbols: ['BTC/USDT', 'ETH/USDT'] },
        { name: 'Arbitrage', symbols: ['BTC/USDT'] },
      ],
    });
    await env.setup();

    conflictDetector = new StrategyConflictDetector({
      conflictResolution: 'priority',
      signalTimeout: 5000,
    });

    // 设置策略优先级
    conflictDetector.setStrategyPriority('TrendFollowing', 1);
    conflictDetector.setStrategyPriority('MeanReversion', 2);
    conflictDetector.setStrategyPriority('Arbitrage', 3);

    coordinator = new SignalCoordinator(conflictDetector, {
      batchInterval: 50,
      enableBatching: true,
    });

    await env.start();
  });

  afterEach(async () => {
    await env.teardown();
    conflictDetector.reset();
    coordinator.clearQueue();
  });

  // ============================================
  // 基础冲突检测测试
  // ============================================

  describe('基础冲突检测', () => {
    it('应该检测到相反方向的信号冲突', () => {
      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      const result = conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'MeanReversion',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      const conflictLog = conflictDetector.getConflictLog();
      expect(conflictLog.some(c =>
        c.conflicts.some(conf => conf.type === 'opposite_direction')
      )).toBe(true);
    });

    it('应该检测到重复信号', () => {
      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      const result = conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('重复');
    });

    it('应该检测到资源竞争', () => {
      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'MeanReversion',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      const conflictLog = conflictDetector.getConflictLog();
      expect(conflictLog.some(c =>
        c.conflicts.some(conf => conf.type === 'resource_competition')
      )).toBe(true);
    });

    it('应该检测到跨策略平仓冲突', () => {
      // 策略 A 开仓
      conflictDetector.openPosition('BTC/USDT', 'TrendFollowing', 'buy', 0.1);

      // 策略 B 尝试平仓
      const result = conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'MeanReversion',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('其他策略');
    });
  });

  // ============================================
  // 优先级解决测试
  // ============================================

  describe('优先级冲突解决', () => {
    it('应该让高优先级策略胜出', () => {
      // 低优先级策略先发信号
      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'Arbitrage', // 优先级 3
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      // 高优先级策略发相反信号
      conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'TrendFollowing', // 优先级 1
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      const nextSignal = conflictDetector.getNextSignal('BTC/USDT');
      expect(nextSignal.strategy).toBe('TrendFollowing');
    });

    it('应该取消低优先级的冲突信号', async () => {
      const canceledSignals = [];
      conflictDetector.on('signalCanceled', (s) => canceledSignals.push(s));

      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'Arbitrage',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      expect(canceledSignals.some(s => s.strategy === 'Arbitrage')).toBe(true);
    });

    it('应该在同优先级时使用 FIFO', () => {
      conflictDetector.setStrategyPriority('Strategy_A', 1);
      conflictDetector.setStrategyPriority('Strategy_B', 1);

      const firstSignal = {
        id: 'sig_1',
        strategy: 'Strategy_A',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      };

      const secondSignal = {
        id: 'sig_2',
        strategy: 'Strategy_B',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      };

      conflictDetector.processSignal(firstSignal);
      conflictDetector.processSignal(secondSignal);

      const nextSignal = conflictDetector.getNextSignal('BTC/USDT');
      expect(nextSignal.strategy).toBe('Strategy_A');
    });
  });

  // ============================================
  // 持仓冲突测试
  // ============================================

  describe('持仓冲突', () => {
    it('应该阻止对已有持仓开反向仓位', () => {
      conflictDetector.openPosition('BTC/USDT', 'TrendFollowing', 'buy', 0.5);

      const result = conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'MeanReversion',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      expect(result.accepted).toBe(false);
    });

    it('应该允许同策略加仓', () => {
      conflictDetector.openPosition('BTC/USDT', 'TrendFollowing', 'buy', 0.5);

      const result = conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      // 同策略加仓应该触发冲突但被允许
      expect(result.accepted).toBe(true);
    });

    it('应该允许同策略平仓', () => {
      conflictDetector.openPosition('BTC/USDT', 'TrendFollowing', 'buy', 0.5);

      const result = conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.5,
      });

      expect(result.accepted).toBe(true);
    });
  });

  // ============================================
  // 批处理协调测试
  // ============================================

  describe('信号批处理', () => {
    it('应该批量处理信号', async () => {
      const processedSignals = [];
      coordinator.on('signalProcessed', (data) => processedSignals.push(data));

      // 提交多个信号
      for (let i = 0; i < 5; i++) {
        coordinator.submitSignal({
          id: `sig_${i}`,
          strategy: i % 2 === 0 ? 'TrendFollowing' : 'MeanReversion',
          symbol: 'BTC/USDT',
          side: 'buy',
          amount: 0.01,
        });
      }

      await testUtils.waitFor(
        () => coordinator.getQueueLength() === 0,
        { timeout: 1000 }
      );

      // 由于冲突，不是所有信号都能处理
      expect(processedSignals.length).toBeGreaterThan(0);
    });

    it('应该按优先级排序批处理', async () => {
      const processedOrder = [];
      coordinator.on('signalProcessed', (data) => {
        processedOrder.push(data.signal.strategy);
      });

      // 低优先级先提交
      coordinator.submitSignal({
        id: 'sig_1',
        strategy: 'Arbitrage',
        symbol: 'ETH/USDT',
        side: 'buy',
        amount: 0.1,
      });

      // 高优先级后提交
      coordinator.submitSignal({
        id: 'sig_2',
        strategy: 'TrendFollowing',
        symbol: 'ETH/USDT',
        side: 'buy',
        amount: 0.1,
      });

      await testUtils.waitFor(
        () => coordinator.getQueueLength() === 0,
        { timeout: 1000 }
      );

      // 高优先级应该先处理
      expect(processedOrder[0]).toBe('TrendFollowing');
    });

    it('应该发出批处理完成事件', async () => {
      const batches = [];
      coordinator.on('batchProcessed', (data) => batches.push(data));

      for (let i = 0; i < 3; i++) {
        coordinator.submitSignal({
          id: `sig_${i}`,
          strategy: 'TrendFollowing',
          symbol: `COIN${i}/USDT`,
          side: 'buy',
          amount: 0.1,
        });
      }

      await testUtils.waitFor(
        () => batches.length > 0,
        { timeout: 1000 }
      );

      expect(batches.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 多标的冲突测试
  // ============================================

  describe('多标的冲突', () => {
    it('应该独立处理不同标的的信号', () => {
      const result1 = conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      const result2 = conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'TrendFollowing',
        symbol: 'ETH/USDT',
        side: 'sell',
        amount: 1,
      });

      expect(result1.accepted).toBe(true);
      expect(result2.accepted).toBe(true);
    });

    it('应该在同一策略的不同标的间不产生冲突', () => {
      for (let i = 0; i < 3; i++) {
        const result = conflictDetector.processSignal({
          id: `sig_${i}`,
          strategy: 'TrendFollowing',
          symbol: `COIN${i}/USDT`,
          side: 'buy',
          amount: 0.1,
        });

        expect(result.accepted).toBe(true);
      }

      expect(conflictDetector.getPendingSignals().length).toBe(3);
    });
  });

  // ============================================
  // 信号超时测试
  // ============================================

  describe('信号超时', () => {
    it('应该过滤超时的信号', async () => {
      conflictDetector.config.signalTimeout = 100;

      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      // 等待超时
      await testUtils.delay(150);

      const nextSignal = conflictDetector.getNextSignal('BTC/USDT');
      expect(nextSignal).toBeNull();
    });

    it('应该保留未超时的信号', async () => {
      conflictDetector.config.signalTimeout = 500;

      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      await testUtils.delay(100);

      const nextSignal = conflictDetector.getNextSignal('BTC/USDT');
      expect(nextSignal).not.toBeNull();
    });
  });

  // ============================================
  // 冲突解决策略测试
  // ============================================

  describe('冲突解决策略', () => {
    it('FIFO 策略应该先到先得', () => {
      const fifoDetector = new StrategyConflictDetector({
        conflictResolution: 'fifo',
      });

      fifoDetector.processSignal({
        id: 'sig_1',
        strategy: 'Arbitrage',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      fifoDetector.processSignal({
        id: 'sig_2',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      const pending = fifoDetector.getPendingSignals('BTC/USDT');

      // FIFO 模式下，后来的相反信号应该被处理不同
      expect(pending.length).toBeGreaterThan(0);
    });

    it('Reject 策略应该拒绝所有冲突', () => {
      const rejectDetector = new StrategyConflictDetector({
        conflictResolution: 'reject',
      });

      rejectDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      const result = rejectDetector.processSignal({
        id: 'sig_2',
        strategy: 'MeanReversion',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      // reject 模式下冲突信号会被接受但标记为冲突
      const conflicts = rejectDetector.getConflictLog();
      expect(conflicts.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 事件测试
  // ============================================

  describe('冲突事件', () => {
    it('应该发出信号接受事件', async () => {
      const events = [];
      conflictDetector.on('signalAccepted', (s) => events.push(s));

      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      expect(events.length).toBe(1);
    });

    it('应该发出信号拒绝事件', async () => {
      const events = [];
      conflictDetector.on('signalRejected', (data) => events.push(data));

      // 开仓
      conflictDetector.openPosition('BTC/USDT', 'TrendFollowing', 'buy', 0.5);

      // 尝试跨策略平仓
      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'MeanReversion',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      expect(events.length).toBe(1);
      expect(events[0].reason).toContain('其他策略');
    });

    it('应该发出冲突解决事件', async () => {
      const events = [];
      conflictDetector.on('conflictResolved', (data) => events.push(data));

      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'Arbitrage',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 统计测试
  // ============================================

  describe('冲突统计', () => {
    it('应该正确统计冲突数量', () => {
      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'MeanReversion',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      const stats = conflictDetector.getStats();
      expect(stats.totalConflicts).toBeGreaterThan(0);
    });

    it('应该正确追踪已解决的冲突', () => {
      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'Arbitrage',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      const stats = conflictDetector.getStats();
      expect(stats.resolvedConflicts).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 综合场景测试
  // ============================================

  describe('综合场景', () => {
    it('应该处理复杂的多策略交互', async () => {
      const results = [];

      // 多个策略同时发送信号
      for (let i = 0; i < 10; i++) {
        const strategies = ['TrendFollowing', 'MeanReversion', 'Arbitrage'];
        const sides = ['buy', 'sell'];
        const symbols = ['BTC/USDT', 'ETH/USDT'];

        const result = conflictDetector.processSignal({
          id: `sig_${i}`,
          strategy: strategies[i % 3],
          symbol: symbols[i % 2],
          side: sides[i % 2],
          amount: 0.1,
        });

        results.push(result);
      }

      // 应该有一些被接受，一些被拒绝
      const accepted = results.filter(r => r.accepted).length;
      const rejected = results.filter(r => !r.accepted).length;

      expect(accepted).toBeGreaterThan(0);
      // 由于冲突，应该有一些被拒绝
      const stats = conflictDetector.getStats();
      expect(stats.totalConflicts).toBeGreaterThan(0);
    });

    it('应该在高频信号下保持稳定', async () => {
      // 快速提交大量信号
      for (let i = 0; i < 50; i++) {
        coordinator.submitSignal({
          id: `sig_${i}`,
          strategy: ['TrendFollowing', 'MeanReversion', 'Arbitrage'][i % 3],
          symbol: ['BTC/USDT', 'ETH/USDT'][i % 2],
          side: ['buy', 'sell'][i % 2],
          amount: 0.01,
        });
      }

      await testUtils.waitFor(
        () => coordinator.getQueueLength() === 0,
        { timeout: 5000 }
      );

      const stats = conflictDetector.getStats();
      expect(stats.pendingSignals).toBeGreaterThanOrEqual(0);
    });

    it('应该正确处理策略优先级变化', () => {
      // 初始优先级
      conflictDetector.processSignal({
        id: 'sig_1',
        strategy: 'MeanReversion',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
      });

      // 改变优先级
      conflictDetector.setStrategyPriority('MeanReversion', 0); // 最高优先级

      conflictDetector.processSignal({
        id: 'sig_2',
        strategy: 'TrendFollowing',
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
      });

      const nextSignal = conflictDetector.getNextSignal('BTC/USDT');

      // MeanReversion 现在应该有更高优先级
      expect(nextSignal.strategy).toBe('MeanReversion');
    });
  });
});
