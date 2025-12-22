/**
 * 风控触发集成测试
 * Risk Control Trigger Integration Tests
 *
 * TEST-008: 测试风控规则触发、熔断机制和紧急停止
 * @module tests/integration/riskTrigger.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExchangeMock } from '../mocks/exchangeMock.js';

// ============================================
// 熔断器 Mock
// ============================================

const CIRCUIT_STATE = {
  CLOSED: 'closed',     // 正常运行
  OPEN: 'open',         // 熔断触发，拒绝所有请求
  HALF_OPEN: 'half_open', // 试探性恢复
};

class CircuitBreakerMock {
  constructor(config = {}) {
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 3,
      timeout: config.timeout || 30000,
      ...config,
    };

    this.state = CIRCUIT_STATE.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.events = [];
  }

  emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
  }

  async execute(fn) {
    if (this.state === CIRCUIT_STATE.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.timeout) {
        this.state = CIRCUIT_STATE.HALF_OPEN;
        this.emit('stateChange', { from: CIRCUIT_STATE.OPEN, to: CIRCUIT_STATE.HALF_OPEN });
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  _onSuccess() {
    this.failures = 0;
    this.successes++;

    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      if (this.successes >= this.config.successThreshold) {
        const prevState = this.state;
        this.state = CIRCUIT_STATE.CLOSED;
        this.emit('stateChange', { from: prevState, to: CIRCUIT_STATE.CLOSED });
      }
    }
  }

  _onFailure() {
    this.failures++;
    this.successes = 0;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold && this.state === CIRCUIT_STATE.CLOSED) {
      const prevState = this.state;
      this.state = CIRCUIT_STATE.OPEN;
      this.emit('stateChange', { from: prevState, to: CIRCUIT_STATE.OPEN });
    }
  }

  getState() {
    return this.state;
  }

  reset() {
    this.state = CIRCUIT_STATE.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }
}

// ============================================
// 综合风控系统 Mock
// ============================================

class RiskSystemMock {
  constructor(config = {}) {
    this.config = {
      initialEquity: config.initialEquity || 10000,
      maxDailyLoss: config.maxDailyLoss || 0.05, // 5%
      maxPositionSize: config.maxPositionSize || 0.20, // 20%
      maxLeverage: config.maxLeverage || 3,
      maxPositions: config.maxPositions || 10,
      maxDrawdown: config.maxDrawdown || 0.10, // 10%
      consecutiveLossLimit: config.consecutiveLossLimit || 5,
      volatilityThreshold: config.volatilityThreshold || 0.05, // 5%
      ...config,
    };

    this.state = {
      tradingAllowed: true,
      currentEquity: this.config.initialEquity,
      dailyPnL: 0,
      totalPnL: 0,
      maxEquity: this.config.initialEquity,
      positions: new Map(),
      consecutiveLosses: 0,
      alertLevel: 'normal', // normal, warning, critical, emergency
    };

    this.circuitBreaker = new CircuitBreakerMock();
    this.events = [];
    this.alerts = [];
  }

  emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
  }

  addAlert(level, message, data = {}) {
    const alert = {
      level,
      message,
      data,
      timestamp: Date.now(),
    };
    this.alerts.push(alert);
    this.emit('alert', alert);
    return alert;
  }

  // ============================================
  // 风控检查方法
  // ============================================

  checkOrder(order) {
    const checks = [];

    // 1. 交易是否允许
    if (!this.state.tradingAllowed) {
      checks.push({ passed: false, rule: 'trading_disabled', message: '交易已被禁止' });
      return { allowed: false, checks };
    }

    // 2. 熔断器状态
    if (this.circuitBreaker.getState() === CIRCUIT_STATE.OPEN) {
      checks.push({ passed: false, rule: 'circuit_breaker', message: '熔断器已触发' });
      return { allowed: false, checks };
    }

    // 3. 日亏损限制
    const dailyLossRate = Math.abs(this.state.dailyPnL) / this.config.initialEquity;
    if (this.state.dailyPnL < 0 && dailyLossRate >= this.config.maxDailyLoss) {
      checks.push({ passed: false, rule: 'daily_loss', message: `日亏损超过 ${this.config.maxDailyLoss * 100}%` });
      return { allowed: false, checks };
    }
    checks.push({ passed: true, rule: 'daily_loss' });

    // 4. 最大持仓数
    if (order.side === 'buy' && this.state.positions.size >= this.config.maxPositions) {
      checks.push({ passed: false, rule: 'max_positions', message: `超过最大持仓数 ${this.config.maxPositions}` });
      return { allowed: false, checks };
    }
    checks.push({ passed: true, rule: 'max_positions' });

    // 5. 单个持仓比例
    const orderValue = order.amount * order.price;
    const positionRatio = orderValue / this.state.currentEquity;
    if (positionRatio > this.config.maxPositionSize) {
      checks.push({ passed: false, rule: 'position_size', message: `持仓比例超过 ${this.config.maxPositionSize * 100}%` });
      return { allowed: false, checks };
    }
    checks.push({ passed: true, rule: 'position_size' });

    // 6. 杠杆检查
    if (order.leverage && order.leverage > this.config.maxLeverage) {
      checks.push({ passed: false, rule: 'leverage', message: `杠杆超过 ${this.config.maxLeverage}x` });
      return { allowed: false, checks };
    }
    checks.push({ passed: true, rule: 'leverage' });

    // 7. 连续亏损检查
    if (this.state.consecutiveLosses >= this.config.consecutiveLossLimit) {
      checks.push({ passed: false, rule: 'consecutive_loss', message: `连续亏损超过 ${this.config.consecutiveLossLimit} 次` });
      return { allowed: false, checks };
    }
    checks.push({ passed: true, rule: 'consecutive_loss' });

    // 8. 最大回撤检查
    const drawdown = (this.state.maxEquity - this.state.currentEquity) / this.state.maxEquity;
    if (drawdown >= this.config.maxDrawdown) {
      checks.push({ passed: false, rule: 'max_drawdown', message: `回撤超过 ${this.config.maxDrawdown * 100}%` });
      return { allowed: false, checks };
    }
    checks.push({ passed: true, rule: 'max_drawdown' });

    return { allowed: true, checks };
  }

  // ============================================
  // 市场风险检查
  // ============================================

  checkMarketConditions(marketData) {
    const alerts = [];

    // 波动率检查
    if (marketData.volatility && marketData.volatility > this.config.volatilityThreshold) {
      alerts.push({
        type: 'high_volatility',
        message: `市场波动率过高: ${(marketData.volatility * 100).toFixed(2)}%`,
        action: 'reduce_position',
      });
      this._updateAlertLevel('warning');
    }

    // 价格异常检查
    if (marketData.priceChange && Math.abs(marketData.priceChange) > 0.10) {
      alerts.push({
        type: 'price_spike',
        message: `价格剧烈波动: ${(marketData.priceChange * 100).toFixed(2)}%`,
        action: 'pause_trading',
      });
      this._updateAlertLevel('critical');
    }

    // 流动性检查
    if (marketData.spreadRatio && marketData.spreadRatio > 0.01) {
      alerts.push({
        type: 'low_liquidity',
        message: `流动性不足，价差过大: ${(marketData.spreadRatio * 100).toFixed(2)}%`,
        action: 'reduce_size',
      });
    }

    for (const alert of alerts) {
      this.addAlert(alert.type === 'price_spike' ? 'critical' : 'warning', alert.message, alert);
    }

    return alerts;
  }

  // ============================================
  // 状态更新方法
  // ============================================

  recordTrade(trade) {
    const pnl = trade.pnl || 0;
    this.state.dailyPnL += pnl;
    this.state.totalPnL += pnl;
    this.state.currentEquity += pnl;

    // 更新最高权益
    if (this.state.currentEquity > this.state.maxEquity) {
      this.state.maxEquity = this.state.currentEquity;
    }

    // 更新连续亏损
    if (pnl < 0) {
      this.state.consecutiveLosses++;
    } else if (pnl > 0) {
      this.state.consecutiveLosses = 0;
    }

    // 更新持仓
    if (trade.side === 'buy') {
      this.state.positions.set(trade.symbol, {
        symbol: trade.symbol,
        amount: trade.amount,
        price: trade.price,
        timestamp: Date.now(),
      });
    } else if (trade.side === 'sell') {
      this.state.positions.delete(trade.symbol);
    }

    // 检查是否需要触发告警
    this._checkRiskLevels();

    this.emit('tradeRecorded', { trade, state: this.getState() });
  }

  _checkRiskLevels() {
    const dailyLossRate = Math.abs(this.state.dailyPnL) / this.config.initialEquity;
    const drawdown = (this.state.maxEquity - this.state.currentEquity) / this.state.maxEquity;

    // 日亏损 80% 时警告
    if (this.state.dailyPnL < 0 && dailyLossRate >= this.config.maxDailyLoss * 0.8) {
      this.addAlert('warning', `日亏损接近限制: ${(dailyLossRate * 100).toFixed(2)}%`);
    }

    // 日亏损达到限制时触发
    if (this.state.dailyPnL < 0 && dailyLossRate >= this.config.maxDailyLoss) {
      this.addAlert('critical', `日亏损达到限制，停止交易`);
      this.pauseTrading('日亏损限制');
    }

    // 回撤 80% 时警告
    if (drawdown >= this.config.maxDrawdown * 0.8) {
      this.addAlert('warning', `回撤接近限制: ${(drawdown * 100).toFixed(2)}%`);
    }

    // 回撤达到限制时触发
    if (drawdown >= this.config.maxDrawdown) {
      this.addAlert('critical', `回撤达到限制，停止交易`);
      this.pauseTrading('最大回撤限制');
    }

    // 连续亏损限制
    if (this.state.consecutiveLosses >= this.config.consecutiveLossLimit) {
      this.addAlert('critical', `连续亏损 ${this.state.consecutiveLosses} 次，停止交易`);
      this.pauseTrading('连续亏损限制');
    }
  }

  _updateAlertLevel(level) {
    const levels = ['normal', 'warning', 'critical', 'emergency'];
    const currentIndex = levels.indexOf(this.state.alertLevel);
    const newIndex = levels.indexOf(level);

    if (newIndex > currentIndex) {
      this.state.alertLevel = level;
      this.emit('alertLevelChanged', { from: levels[currentIndex], to: level });
    }
  }

  // ============================================
  // 控制方法
  // ============================================

  pauseTrading(reason) {
    if (this.state.tradingAllowed) {
      this.state.tradingAllowed = false;
      this.emit('tradingPaused', { reason, timestamp: Date.now() });
    }
  }

  resumeTrading() {
    if (!this.state.tradingAllowed) {
      this.state.tradingAllowed = true;
      this.emit('tradingResumed', { timestamp: Date.now() });
    }
  }

  triggerEmergencyStop(reason) {
    this.pauseTrading(`紧急停止: ${reason}`);
    this.state.alertLevel = 'emergency';
    this.emit('emergencyStop', { reason, timestamp: Date.now() });
  }

  resetDaily() {
    this.state.dailyPnL = 0;
    this.state.consecutiveLosses = 0;
    this.state.alertLevel = 'normal';
    if (!this.state.tradingAllowed) {
      this.resumeTrading();
    }
    this.emit('dailyReset', { timestamp: Date.now() });
  }

  getState() {
    return {
      ...this.state,
      positions: Array.from(this.state.positions.values()),
      circuitBreakerState: this.circuitBreaker.getState(),
    };
  }

  getAlerts() {
    return [...this.alerts];
  }
}

// ============================================
// 测试用例
// ============================================

describe('Risk Control Trigger Integration', () => {
  let riskSystem;
  let mockExchange;

  beforeEach(() => {
    mockExchange = createExchangeMock();
    riskSystem = new RiskSystemMock({
      initialEquity: 10000,
      maxDailyLoss: 0.05,
      maxPositionSize: 0.20,
      maxPositions: 5,
      maxDrawdown: 0.10,
      consecutiveLossLimit: 3,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // 订单风控检查测试
  // ============================================

  describe('订单风控检查', () => {
    it('应该允许正常订单', () => {
      const order = {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      };

      const result = riskSystem.checkOrder(order);

      expect(result.allowed).toBe(true);
      expect(result.checks.every(c => c.passed)).toBe(true);
    });

    it('应该拒绝超过持仓比例的订单', () => {
      const order = {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.5, // 50% 持仓比例
        price: 50000,
      };

      const result = riskSystem.checkOrder(order);

      expect(result.allowed).toBe(false);
      expect(result.checks.some(c => c.rule === 'position_size' && !c.passed)).toBe(true);
    });

    it('应该拒绝超过最大持仓数的订单', () => {
      // 创建 5 个持仓
      for (let i = 0; i < 5; i++) {
        riskSystem.state.positions.set(`COIN${i}/USDT`, { symbol: `COIN${i}/USDT` });
      }

      const order = {
        symbol: 'NEW/USDT',
        side: 'buy',
        amount: 0.01,
        price: 100,
      };

      const result = riskSystem.checkOrder(order);

      expect(result.allowed).toBe(false);
      expect(result.checks.some(c => c.rule === 'max_positions' && !c.passed)).toBe(true);
    });

    it('应该拒绝超过杠杆限制的订单', () => {
      const order = {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
        leverage: 10, // 超过 3x 限制
      };

      const result = riskSystem.checkOrder(order);

      expect(result.allowed).toBe(false);
      expect(result.checks.some(c => c.rule === 'leverage' && !c.passed)).toBe(true);
    });

    it('应该在交易禁止时拒绝所有订单', () => {
      riskSystem.pauseTrading('test');

      const order = {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      };

      const result = riskSystem.checkOrder(order);

      expect(result.allowed).toBe(false);
      expect(result.checks.some(c => c.rule === 'trading_disabled')).toBe(true);
    });
  });

  // ============================================
  // 日亏损限制测试
  // ============================================

  describe('日亏损限制', () => {
    it('应该在日亏损达到限制时停止交易', () => {
      // 记录亏损交易
      riskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 49000,
        pnl: -500, // 5% 亏损
      });

      expect(riskSystem.state.tradingAllowed).toBe(false);

      const pauseEvent = riskSystem.events.find(e => e.event === 'tradingPaused');
      expect(pauseEvent).toBeDefined();
    });

    it('应该在接近日亏损限制时发出警告', () => {
      // 记录一笔接近限制的亏损（4.5% 接近 5% 限制）
      riskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 49500,
        pnl: -450, // 4.5% 亏损，超过 80% 的 5% 限制（即 4%）
      });

      // 检查是否有警告类型的告警
      const warningAlert = riskSystem.alerts.find(
        a => a.level === 'warning' && a.message.includes('接近')
      );
      expect(warningAlert).toBeDefined();
    });

    it('应该在日亏损时拒绝新订单', () => {
      riskSystem.state.dailyPnL = -600; // 超过 5% 限制

      const result = riskSystem.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.checks.some(c => c.rule === 'daily_loss')).toBe(true);
    });
  });

  // ============================================
  // 连续亏损限制测试
  // ============================================

  describe('连续亏损限制', () => {
    it('应该在连续亏损达到限制时停止交易', () => {
      // 记录 3 次连续亏损
      for (let i = 0; i < 3; i++) {
        riskSystem.recordTrade({
          symbol: 'BTC/USDT',
          side: 'sell',
          amount: 0.01,
          price: 49900,
          pnl: -10,
        });
      }

      expect(riskSystem.state.consecutiveLosses).toBe(3);
      expect(riskSystem.state.tradingAllowed).toBe(false);
    });

    it('应该在盈利后重置连续亏损计数', () => {
      riskSystem.state.consecutiveLosses = 2;

      riskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.01,
        price: 51000,
        pnl: 100,
      });

      expect(riskSystem.state.consecutiveLosses).toBe(0);
    });
  });

  // ============================================
  // 最大回撤限制测试
  // ============================================

  describe('最大回撤限制', () => {
    it('应该在回撤达到限制时停止交易', () => {
      // 设置最高权益
      riskSystem.state.maxEquity = 12000;
      riskSystem.state.currentEquity = 10000;

      // 再亏损以触发 10% 回撤
      riskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -800, // 从 12000 跌到 10800 再到 10000，超过 10% 回撤
      });

      expect(riskSystem.state.tradingAllowed).toBe(false);
    });

    it('应该正确计算回撤', () => {
      riskSystem.state.maxEquity = 15000;
      riskSystem.state.currentEquity = 12000;

      const result = riskSystem.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      });

      // 回撤 = (15000 - 12000) / 15000 = 20%，超过 10% 限制
      expect(result.allowed).toBe(false);
      expect(result.checks.some(c => c.rule === 'max_drawdown')).toBe(true);
    });
  });

  // ============================================
  // 市场风险检查测试
  // ============================================

  describe('市场风险检查', () => {
    it('应该在高波动率时发出警告', () => {
      const alerts = riskSystem.checkMarketConditions({
        symbol: 'BTC/USDT',
        volatility: 0.08, // 8% 波动率，超过 5% 阈值
      });

      expect(alerts.some(a => a.type === 'high_volatility')).toBe(true);
      expect(riskSystem.state.alertLevel).toBe('warning');
    });

    it('应该在价格剧烈波动时触发严重告警', () => {
      const alerts = riskSystem.checkMarketConditions({
        symbol: 'BTC/USDT',
        priceChange: 0.15, // 15% 价格变化
      });

      expect(alerts.some(a => a.type === 'price_spike')).toBe(true);
      expect(riskSystem.state.alertLevel).toBe('critical');
    });

    it('应该在流动性不足时发出警告', () => {
      const alerts = riskSystem.checkMarketConditions({
        symbol: 'BTC/USDT',
        spreadRatio: 0.02, // 2% 价差
      });

      expect(alerts.some(a => a.type === 'low_liquidity')).toBe(true);
    });
  });

  // ============================================
  // 熔断器测试
  // ============================================

  describe('熔断器', () => {
    it('应该在连续失败后触发熔断', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('API Error'));

      // 触发 5 次失败
      for (let i = 0; i < 5; i++) {
        try {
          await riskSystem.circuitBreaker.execute(failingFn);
        } catch {
          // 预期的错误
        }
      }

      expect(riskSystem.circuitBreaker.getState()).toBe(CIRCUIT_STATE.OPEN);
    });

    it('熔断器打开时应该拒绝订单', async () => {
      riskSystem.circuitBreaker.state = CIRCUIT_STATE.OPEN;
      riskSystem.circuitBreaker.lastFailureTime = Date.now();

      const result = riskSystem.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.checks.some(c => c.rule === 'circuit_breaker')).toBe(true);
    });

    it('应该在超时后进入半开状态', async () => {
      riskSystem.circuitBreaker.state = CIRCUIT_STATE.OPEN;
      riskSystem.circuitBreaker.lastFailureTime = Date.now() - 35000; // 超过 30 秒

      const successFn = vi.fn().mockResolvedValue('success');

      await riskSystem.circuitBreaker.execute(successFn);

      expect(riskSystem.circuitBreaker.getState()).toBe(CIRCUIT_STATE.HALF_OPEN);
    });

    it('应该在连续成功后恢复正常', async () => {
      riskSystem.circuitBreaker.state = CIRCUIT_STATE.HALF_OPEN;

      const successFn = vi.fn().mockResolvedValue('success');

      // 连续 3 次成功
      for (let i = 0; i < 3; i++) {
        await riskSystem.circuitBreaker.execute(successFn);
      }

      expect(riskSystem.circuitBreaker.getState()).toBe(CIRCUIT_STATE.CLOSED);
    });
  });

  // ============================================
  // 紧急停止测试
  // ============================================

  describe('紧急停止', () => {
    it('应该正确触发紧急停止', () => {
      riskSystem.triggerEmergencyStop('检测到异常活动');

      expect(riskSystem.state.tradingAllowed).toBe(false);
      expect(riskSystem.state.alertLevel).toBe('emergency');

      const emergencyEvent = riskSystem.events.find(e => e.event === 'emergencyStop');
      expect(emergencyEvent).toBeDefined();
      expect(emergencyEvent.data.reason).toContain('异常活动');
    });
  });

  // ============================================
  // 日重置测试
  // ============================================

  describe('日重置', () => {
    it('应该正确重置日统计', () => {
      riskSystem.state.dailyPnL = -300;
      riskSystem.state.consecutiveLosses = 2;
      riskSystem.state.alertLevel = 'warning';
      riskSystem.pauseTrading('test');

      riskSystem.resetDaily();

      expect(riskSystem.state.dailyPnL).toBe(0);
      expect(riskSystem.state.consecutiveLosses).toBe(0);
      expect(riskSystem.state.alertLevel).toBe('normal');
      expect(riskSystem.state.tradingAllowed).toBe(true);
    });
  });

  // ============================================
  // 状态和告警测试
  // ============================================

  describe('状态和告警', () => {
    it('应该返回完整的状态信息', () => {
      riskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 0,
      });

      const state = riskSystem.getState();

      expect(state.tradingAllowed).toBe(true);
      expect(state.currentEquity).toBe(10000);
      expect(state.positions.length).toBe(1);
      expect(state.circuitBreakerState).toBe(CIRCUIT_STATE.CLOSED);
    });

    it('应该记录所有告警', () => {
      riskSystem.addAlert('warning', 'Test warning');
      riskSystem.addAlert('critical', 'Test critical');

      const alerts = riskSystem.getAlerts();

      expect(alerts.length).toBe(2);
      expect(alerts[0].level).toBe('warning');
      expect(alerts[1].level).toBe('critical');
    });
  });

  // ============================================
  // 综合场景测试
  // ============================================

  describe('综合场景', () => {
    it('应该正确处理完整的交易生命周期', async () => {
      // 1. 初始状态检查
      expect(riskSystem.state.tradingAllowed).toBe(true);

      // 2. 执行一些成功的交易
      riskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 0,
      });

      riskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 51000,
        pnl: 100,
      });

      expect(riskSystem.state.currentEquity).toBe(10100);
      expect(riskSystem.state.dailyPnL).toBe(100);

      // 3. 执行一些亏损交易
      riskSystem.recordTrade({
        symbol: 'ETH/USDT',
        side: 'buy',
        amount: 1,
        price: 3000,
        pnl: 0,
      });

      riskSystem.recordTrade({
        symbol: 'ETH/USDT',
        side: 'sell',
        amount: 1,
        price: 2800,
        pnl: -200,
      });

      expect(riskSystem.state.currentEquity).toBe(9900);
      expect(riskSystem.state.consecutiveLosses).toBe(1);

      // 4. 验证风控检查仍然通过
      const check = riskSystem.checkOrder({
        symbol: 'BNB/USDT',
        side: 'buy',
        amount: 0.1,
        price: 300,
      });

      expect(check.allowed).toBe(true);
    });
  });
});
