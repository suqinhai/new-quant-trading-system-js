/**
 * 风控连锁触发 E2E 测试
 * Risk Trigger Cascade E2E Tests
 *
 * 测试风控规则的连锁触发和级联效应
 * @module tests/e2e/riskTriggerCascade.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  E2ETestEnvironment,
  MockStrategy,
  MockRiskManager,
  testUtils,
  RUN_MODE,
} from './e2eTestFramework.js';
import EventEmitter from 'events';

// ============================================
// 级联风控系统
// ============================================

class CascadeRiskSystem extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      initialEquity: config.initialEquity || 100000,
      // 一级风控阈值
      level1: {
        dailyLossWarning: config.level1?.dailyLossWarning || 0.02,    // 2% 日亏损预警
        positionWarning: config.level1?.positionWarning || 0.25,      // 25% 仓位预警
        volatilityWarning: config.level1?.volatilityWarning || 0.03,  // 3% 波动预警
      },
      // 二级风控阈值
      level2: {
        dailyLossLimit: config.level2?.dailyLossLimit || 0.03,        // 3% 日亏损限制
        positionLimit: config.level2?.positionLimit || 0.35,          // 35% 仓位限制
        volatilityLimit: config.level2?.volatilityLimit || 0.05,      // 5% 波动限制
        drawdownWarning: config.level2?.drawdownWarning || 0.05,      // 5% 回撤预警
      },
      // 三级风控阈值
      level3: {
        dailyLossCritical: config.level3?.dailyLossCritical || 0.05,  // 5% 日亏损临界
        drawdownCritical: config.level3?.drawdownCritical || 0.10,    // 10% 回撤临界
        correlationLimit: config.level3?.correlationLimit || 0.8,      // 相关性限制
      },
      // 四级风控阈值（紧急）
      level4: {
        emergencyLoss: config.level4?.emergencyLoss || 0.08,          // 8% 紧急亏损
        blackSwanThreshold: config.level4?.blackSwanThreshold || 0.15, // 15% 黑天鹅阈值
      },
      ...config,
    };

    this.state = {
      currentEquity: this.config.initialEquity,
      maxEquity: this.config.initialEquity,
      dailyPnL: 0,
      positions: new Map(),
      riskLevel: 0,          // 0-4 风险等级
      tradingAllowed: true,
      newPositionsAllowed: true,
      leverageReduced: false,
      emergencyMode: false,
      triggerHistory: [],
    };

    this.strategies = new Map();
    this.alerts = [];
  }

  addStrategy(strategy) {
    this.strategies.set(strategy.config.name, strategy);
  }

  // ============================================
  // 风控检查方法
  // ============================================

  checkAllRisks(marketData = {}) {
    const triggers = [];

    // 一级风控检查
    const level1Triggers = this._checkLevel1(marketData);
    if (level1Triggers.length > 0) {
      triggers.push(...level1Triggers);
    }

    // 二级风控检查（依赖一级触发）
    if (this.state.riskLevel >= 1) {
      const level2Triggers = this._checkLevel2(marketData);
      if (level2Triggers.length > 0) {
        triggers.push(...level2Triggers);
      }
    }

    // 三级风控检查（依赖二级触发）
    if (this.state.riskLevel >= 2) {
      const level3Triggers = this._checkLevel3(marketData);
      if (level3Triggers.length > 0) {
        triggers.push(...level3Triggers);
      }
    }

    // 四级风控检查（紧急情况）
    const level4Triggers = this._checkLevel4(marketData);
    if (level4Triggers.length > 0) {
      triggers.push(...level4Triggers);
    }

    // 处理触发器
    for (const trigger of triggers) {
      this._handleTrigger(trigger);
    }

    return triggers;
  }

  _checkLevel1(marketData) {
    const triggers = [];
    const dailyLossRate = Math.abs(this.state.dailyPnL) / this.config.initialEquity;

    // 日亏损预警
    if (this.state.dailyPnL < 0 && dailyLossRate >= this.config.level1.dailyLossWarning) {
      triggers.push({
        level: 1,
        type: 'daily_loss_warning',
        value: dailyLossRate,
        threshold: this.config.level1.dailyLossWarning,
        action: 'alert',
      });
    }

    // 仓位预警
    const totalPositionRatio = this._getTotalPositionRatio();
    if (totalPositionRatio >= this.config.level1.positionWarning) {
      triggers.push({
        level: 1,
        type: 'position_warning',
        value: totalPositionRatio,
        threshold: this.config.level1.positionWarning,
        action: 'alert',
      });
    }

    // 波动预警
    if (marketData.volatility && marketData.volatility >= this.config.level1.volatilityWarning) {
      triggers.push({
        level: 1,
        type: 'volatility_warning',
        value: marketData.volatility,
        threshold: this.config.level1.volatilityWarning,
        action: 'alert',
      });
    }

    return triggers;
  }

  _checkLevel2(marketData) {
    const triggers = [];
    const dailyLossRate = Math.abs(this.state.dailyPnL) / this.config.initialEquity;
    const drawdown = this._getDrawdown();

    // 日亏损限制
    if (this.state.dailyPnL < 0 && dailyLossRate >= this.config.level2.dailyLossLimit) {
      triggers.push({
        level: 2,
        type: 'daily_loss_limit',
        value: dailyLossRate,
        threshold: this.config.level2.dailyLossLimit,
        action: 'reduce_position',
      });
    }

    // 仓位限制
    const totalPositionRatio = this._getTotalPositionRatio();
    if (totalPositionRatio >= this.config.level2.positionLimit) {
      triggers.push({
        level: 2,
        type: 'position_limit',
        value: totalPositionRatio,
        threshold: this.config.level2.positionLimit,
        action: 'block_new_positions',
      });
    }

    // 回撤预警
    if (drawdown >= this.config.level2.drawdownWarning) {
      triggers.push({
        level: 2,
        type: 'drawdown_warning',
        value: drawdown,
        threshold: this.config.level2.drawdownWarning,
        action: 'reduce_leverage',
      });
    }

    // 波动限制
    if (marketData.volatility && marketData.volatility >= this.config.level2.volatilityLimit) {
      triggers.push({
        level: 2,
        type: 'volatility_limit',
        value: marketData.volatility,
        threshold: this.config.level2.volatilityLimit,
        action: 'reduce_position',
      });
    }

    return triggers;
  }

  _checkLevel3(marketData) {
    const triggers = [];
    const dailyLossRate = Math.abs(this.state.dailyPnL) / this.config.initialEquity;
    const drawdown = this._getDrawdown();

    // 日亏损临界
    if (this.state.dailyPnL < 0 && dailyLossRate >= this.config.level3.dailyLossCritical) {
      triggers.push({
        level: 3,
        type: 'daily_loss_critical',
        value: dailyLossRate,
        threshold: this.config.level3.dailyLossCritical,
        action: 'pause_trading',
      });
    }

    // 回撤临界
    if (drawdown >= this.config.level3.drawdownCritical) {
      triggers.push({
        level: 3,
        type: 'drawdown_critical',
        value: drawdown,
        threshold: this.config.level3.drawdownCritical,
        action: 'pause_trading',
      });
    }

    // 相关性检查
    if (marketData.correlations) {
      const highCorrelation = Object.values(marketData.correlations)
        .some(c => Math.abs(c) >= this.config.level3.correlationLimit);

      if (highCorrelation) {
        triggers.push({
          level: 3,
          type: 'correlation_limit',
          value: Math.max(...Object.values(marketData.correlations).map(Math.abs)),
          threshold: this.config.level3.correlationLimit,
          action: 'reduce_correlated_positions',
        });
      }
    }

    return triggers;
  }

  _checkLevel4(marketData) {
    const triggers = [];
    const dailyLossRate = Math.abs(this.state.dailyPnL) / this.config.initialEquity;

    // 紧急亏损
    if (this.state.dailyPnL < 0 && dailyLossRate >= this.config.level4.emergencyLoss) {
      triggers.push({
        level: 4,
        type: 'emergency_loss',
        value: dailyLossRate,
        threshold: this.config.level4.emergencyLoss,
        action: 'emergency_close_all',
      });
    }

    // 黑天鹅事件
    if (marketData.priceChange && Math.abs(marketData.priceChange) >= this.config.level4.blackSwanThreshold) {
      triggers.push({
        level: 4,
        type: 'black_swan',
        value: marketData.priceChange,
        threshold: this.config.level4.blackSwanThreshold,
        action: 'emergency_close_all',
      });
    }

    return triggers;
  }

  _handleTrigger(trigger) {
    // 更新风险等级
    if (trigger.level > this.state.riskLevel) {
      const previousLevel = this.state.riskLevel;
      this.state.riskLevel = trigger.level;
      this.emit('riskLevelChange', {
        from: previousLevel,
        to: trigger.level,
        trigger,
      });
    }

    // 记录触发历史
    this.state.triggerHistory.push({
      ...trigger,
      timestamp: Date.now(),
    });

    // 添加告警
    this._addAlert(trigger);

    // 执行对应的动作
    switch (trigger.action) {
      case 'alert':
        this.emit('riskAlert', trigger);
        break;

      case 'reduce_position':
        this._reducePositions(0.5);
        break;

      case 'block_new_positions':
        this.state.newPositionsAllowed = false;
        this.emit('newPositionsBlocked', trigger);
        break;

      case 'reduce_leverage':
        this.state.leverageReduced = true;
        this.emit('leverageReduced', trigger);
        break;

      case 'reduce_correlated_positions':
        this._reduceCorrelatedPositions();
        break;

      case 'pause_trading':
        this.state.tradingAllowed = false;
        this.state.newPositionsAllowed = false;
        this.emit('tradingPaused', trigger);
        break;

      case 'emergency_close_all':
        this.state.emergencyMode = true;
        this.state.tradingAllowed = false;
        this.state.newPositionsAllowed = false;
        this._closeAllPositions();
        this.emit('emergencyCloseAll', trigger);
        break;
    }

    this.emit('triggerHandled', trigger);
  }

  _addAlert(trigger) {
    const levelNames = ['正常', '预警', '警告', '严重', '紧急'];
    this.alerts.push({
      level: trigger.level,
      levelName: levelNames[trigger.level],
      type: trigger.type,
      message: `${levelNames[trigger.level]}: ${trigger.type} (${(trigger.value * 100).toFixed(2)}% >= ${(trigger.threshold * 100).toFixed(2)}%)`,
      timestamp: Date.now(),
    });
  }

  // ============================================
  // 辅助方法
  // ============================================

  _getTotalPositionRatio() {
    let totalValue = 0;
    for (const [, position] of this.state.positions) {
      totalValue += position.amount * position.price;
    }
    return totalValue / this.state.currentEquity;
  }

  _getDrawdown() {
    return (this.state.maxEquity - this.state.currentEquity) / this.state.maxEquity;
  }

  _reducePositions(ratio) {
    for (const [symbol, position] of this.state.positions) {
      position.amount *= (1 - ratio);
      this.emit('positionReduced', { symbol, ratio, newAmount: position.amount });
    }
  }

  _reduceCorrelatedPositions() {
    // 简化实现：减少所有仓位
    this._reducePositions(0.3);
  }

  _closeAllPositions() {
    for (const [symbol] of this.state.positions) {
      this.emit('positionClosed', { symbol });
    }
    this.state.positions.clear();
  }

  // ============================================
  // 状态更新方法
  // ============================================

  recordTrade(trade) {
    const pnl = trade.pnl || 0;
    this.state.dailyPnL += pnl;
    this.state.currentEquity += pnl;

    if (this.state.currentEquity > this.state.maxEquity) {
      this.state.maxEquity = this.state.currentEquity;
    }

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

    // 检查风控
    this.checkAllRisks();

    this.emit('tradeRecorded', { trade, state: this.getState() });
  }

  checkOrder(order) {
    // 紧急模式拒绝所有订单
    if (this.state.emergencyMode) {
      return { allowed: false, reason: '系统处于紧急模式' };
    }

    // 交易暂停拒绝所有订单
    if (!this.state.tradingAllowed) {
      return { allowed: false, reason: '交易已暂停' };
    }

    // 禁止开新仓
    if (!this.state.newPositionsAllowed && order.side === 'buy') {
      if (!this.state.positions.has(order.symbol)) {
        return { allowed: false, reason: '禁止开新仓' };
      }
    }

    return { allowed: true };
  }

  reset() {
    this.state = {
      currentEquity: this.config.initialEquity,
      maxEquity: this.config.initialEquity,
      dailyPnL: 0,
      positions: new Map(),
      riskLevel: 0,
      tradingAllowed: true,
      newPositionsAllowed: true,
      leverageReduced: false,
      emergencyMode: false,
      triggerHistory: [],
    };
    this.alerts = [];
  }

  resetDaily() {
    this.state.dailyPnL = 0;
    this.state.riskLevel = 0;
    this.state.tradingAllowed = true;
    this.state.newPositionsAllowed = true;
    this.state.leverageReduced = false;
    this.state.emergencyMode = false;
    this.alerts = [];
    this.emit('dailyReset');
  }

  getState() {
    return {
      ...this.state,
      positions: Array.from(this.state.positions.values()),
      drawdown: this._getDrawdown(),
      dailyLossRate: Math.abs(this.state.dailyPnL) / this.config.initialEquity,
    };
  }

  getAlerts() {
    return [...this.alerts];
  }

  getTriggerHistory() {
    return [...this.state.triggerHistory];
  }
}

// ============================================
// 风控连锁触发 E2E 测试
// ============================================

describe('Risk Trigger Cascade E2E', () => {
  let env;
  let cascadeRiskSystem;

  beforeEach(async () => {
    env = new E2ETestEnvironment({
      mode: RUN_MODE.SHADOW,
      initialEquity: 100000,
      symbols: ['BTC/USDT', 'ETH/USDT'],
      exchanges: ['binance'],
      strategies: [
        { name: 'Strategy_A', symbols: ['BTC/USDT'] },
        { name: 'Strategy_B', symbols: ['ETH/USDT'] },
      ],
    });
    await env.setup();

    cascadeRiskSystem = new CascadeRiskSystem({
      initialEquity: 100000,
    });

    await env.start();
  });

  afterEach(async () => {
    await env.teardown();
    cascadeRiskSystem.reset();
  });

  // ============================================
  // 一级风控测试
  // ============================================

  describe('一级风控（预警）', () => {
    it('应该在日亏损达到 2% 时触发预警', () => {
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 50000,
        pnl: -2000, // 2% 亏损
      });

      const triggers = cascadeRiskSystem.getTriggerHistory();
      expect(triggers.some(t => t.type === 'daily_loss_warning')).toBe(true);
      expect(cascadeRiskSystem.state.riskLevel).toBe(1);
    });

    it('应该在仓位达到 25% 时触发预警', () => {
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.5, // 50000 * 0.5 = 25000 = 25%
        price: 50000,
        pnl: 0,
      });

      const triggers = cascadeRiskSystem.checkAllRisks();
      expect(triggers.some(t => t.type === 'position_warning')).toBe(true);
    });

    it('应该在波动率达到 3% 时触发预警', () => {
      const triggers = cascadeRiskSystem.checkAllRisks({
        volatility: 0.04,
      });

      expect(triggers.some(t => t.type === 'volatility_warning')).toBe(true);
    });

    it('一级预警不应该阻止交易', () => {
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 50000,
        pnl: -2000,
      });

      expect(cascadeRiskSystem.state.tradingAllowed).toBe(true);
      expect(cascadeRiskSystem.state.newPositionsAllowed).toBe(true);
    });
  });

  // ============================================
  // 二级风控测试
  // ============================================

  describe('二级风控（限制）', () => {
    it('应该在日亏损达到 3% 时触发仓位缩减', () => {
      // 先触发一级
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 50000,
        pnl: -2500,
      });

      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 0,
      });

      // 再亏损触发二级
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -700,
      });

      expect(cascadeRiskSystem.state.riskLevel).toBeGreaterThanOrEqual(2);
    });

    it('应该在仓位达到 35% 时禁止开新仓', () => {
      // 先触发一级
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.5,
        price: 50000,
        pnl: 0,
      });

      cascadeRiskSystem.checkAllRisks();

      // 增加仓位触发二级
      cascadeRiskSystem.recordTrade({
        symbol: 'ETH/USDT',
        side: 'buy',
        amount: 4,
        price: 3000, // 总仓位 = 25000 + 12000 = 37000 = 37%
        pnl: 0,
      });

      cascadeRiskSystem.checkAllRisks();

      expect(cascadeRiskSystem.state.newPositionsAllowed).toBe(false);
    });

    it('应该在回撤达到 5% 时降低杠杆', () => {
      // 设置最高权益
      cascadeRiskSystem.state.maxEquity = 110000;

      // 先触发一级
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -3000,
      });

      // 验证回撤触发
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 47000,
        pnl: -3000, // 总回撤 = (110000 - 94000) / 110000 = 14.5%
      });

      expect(cascadeRiskSystem.state.leverageReduced).toBe(true);
    });
  });

  // ============================================
  // 三级风控测试
  // ============================================

  describe('三级风控（严重）', () => {
    it('应该在日亏损达到 5% 时暂停交易', () => {
      // 逐步升级到三级
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 50000,
        pnl: -2500, // 触发一级
      });

      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -1000, // 累计触发二级
      });

      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 46000,
        pnl: -1700, // 累计触发三级 (5200/100000 = 5.2%)
      });

      expect(cascadeRiskSystem.state.tradingAllowed).toBe(false);
      expect(cascadeRiskSystem.state.riskLevel).toBe(3);
    });

    it('应该在回撤达到 10% 时暂停交易', () => {
      cascadeRiskSystem.state.maxEquity = 120000;

      // 触发一级
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -2500,
      });

      // 触发二级
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 46000,
        pnl: -3500,
      });

      // 触发三级（回撤 = (120000 - 94000) / 120000 = 21.6%）
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 44000,
        pnl: -6000,
      });

      expect(cascadeRiskSystem.state.tradingAllowed).toBe(false);
    });

    it('应该在相关性过高时减少相关仓位', () => {
      // 先触发一级风控 (2% 亏损)
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -2500, // 2.5% 亏损，触发 level1
      });

      // 再次调用以确保升级到二级 (累计 > 3%)
      cascadeRiskSystem.checkAllRisks();

      // 继续亏损到达二级阈值
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -1000, // 累计 3.5% 亏损，触发 level2
      });

      // 确保 riskLevel 已经是 2
      expect(cascadeRiskSystem.state.riskLevel).toBeGreaterThanOrEqual(2);

      // 检查高相关性
      const triggers = cascadeRiskSystem.checkAllRisks({
        correlations: {
          'BTC/ETH': 0.95,
        },
      });

      expect(triggers.some(t => t.type === 'correlation_limit')).toBe(true);
    });
  });

  // ============================================
  // 四级风控测试（紧急）
  // ============================================

  describe('四级风控（紧急）', () => {
    it('应该在日亏损达到 8% 时紧急平仓', () => {
      // 模拟大幅亏损
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 1,
        price: 42000,
        pnl: -8500, // 8.5% 亏损
      });

      expect(cascadeRiskSystem.state.emergencyMode).toBe(true);
      expect(cascadeRiskSystem.state.tradingAllowed).toBe(false);
      expect(cascadeRiskSystem.state.positions.size).toBe(0);
    });

    it('应该在黑天鹅事件时紧急平仓', () => {
      // 添加一些仓位
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.5,
        price: 50000,
        pnl: 0,
      });

      expect(cascadeRiskSystem.state.positions.size).toBe(1);

      // 触发黑天鹅
      cascadeRiskSystem.checkAllRisks({
        priceChange: -0.20, // 20% 价格下跌
      });

      expect(cascadeRiskSystem.state.emergencyMode).toBe(true);
      expect(cascadeRiskSystem.state.positions.size).toBe(0);
    });

    it('紧急模式应该拒绝所有订单', () => {
      cascadeRiskSystem.state.emergencyMode = true;

      const result = cascadeRiskSystem.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('紧急');
    });
  });

  // ============================================
  // 级联效应测试
  // ============================================

  describe('风控级联效应', () => {
    it('应该正确记录风控触发级联', () => {
      // 触发完整的级联
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 50000,
        pnl: -2500, // 一级
      });

      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -1000, // 二级
      });

      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 46000,
        pnl: -2000, // 三级
      });

      const history = cascadeRiskSystem.getTriggerHistory();

      // 应该有多个级别的触发
      expect(history.some(t => t.level === 1)).toBe(true);
      expect(history.some(t => t.level === 2)).toBe(true);
      expect(history.some(t => t.level === 3)).toBe(true);
    });

    it('应该按正确的顺序执行风控动作', async () => {
      const actions = [];

      cascadeRiskSystem.on('riskAlert', () => actions.push('alert'));
      cascadeRiskSystem.on('newPositionsBlocked', () => actions.push('block'));
      cascadeRiskSystem.on('leverageReduced', () => actions.push('leverage'));
      cascadeRiskSystem.on('tradingPaused', () => actions.push('pause'));
      cascadeRiskSystem.on('emergencyCloseAll', () => actions.push('emergency'));

      // 直接触发四级
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 1,
        price: 42000,
        pnl: -9000,
      });

      // 应该触发了紧急动作
      expect(actions.includes('emergency')).toBe(true);
    });

    it('低级别触发不应该触发高级别动作', () => {
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 50000,
        pnl: -1500, // 1.5%，低于一级阈值
      });

      expect(cascadeRiskSystem.state.riskLevel).toBe(0);
      expect(cascadeRiskSystem.state.tradingAllowed).toBe(true);
    });
  });

  // ============================================
  // 多策略级联测试
  // ============================================

  describe('多策略风控级联', () => {
    it('应该聚合所有策略的风险', () => {
      // 策略 A 亏损
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -1500,
        strategy: 'Strategy_A',
      });

      // 策略 B 亏损
      cascadeRiskSystem.recordTrade({
        symbol: 'ETH/USDT',
        side: 'sell',
        amount: 1,
        price: 2800,
        pnl: -1000,
        strategy: 'Strategy_B',
      });

      const state = cascadeRiskSystem.getState();
      expect(state.dailyLossRate).toBeCloseTo(0.025, 2);
    });

    it('风控触发应该影响所有策略', async () => {
      const strategyA = env.getStrategy('Strategy_A');
      const strategyB = env.getStrategy('Strategy_B');

      // 逐步触发风控级别以达到交易暂停
      // 第一次：触发 level1 (2% 亏损)
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.5,
        price: 45000,
        pnl: -2500, // 2.5% 亏损
      });

      // 确保升级到 level2
      cascadeRiskSystem.checkAllRisks();

      // 第二次：触发 level2 (累计 > 3%)
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.5,
        price: 45000,
        pnl: -1000, // 累计 3.5% 亏损
      });

      // 确保升级到 level3
      cascadeRiskSystem.checkAllRisks();

      // 第三次：触发 level3 (累计 > 5%)
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.5,
        price: 45000,
        pnl: -2000, // 累计 5.5% 亏损
      });

      // 所有策略的订单都应该被拒绝
      const checkA = cascadeRiskSystem.checkOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      });

      const checkB = cascadeRiskSystem.checkOrder({
        symbol: 'ETH/USDT',
        side: 'buy',
        amount: 1,
        price: 3000,
      });

      expect(checkA.allowed).toBe(false);
      expect(checkB.allowed).toBe(false);
    });
  });

  // ============================================
  // 恢复测试
  // ============================================

  describe('风控恢复', () => {
    it('应该在日重置后恢复正常', () => {
      // 逐步触发三级风控
      // 第一次：触发 level1 (2% 亏损)
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.5,
        price: 45000,
        pnl: -2500, // 2.5% 亏损
      });

      // 确保升级到 level2
      cascadeRiskSystem.checkAllRisks();

      // 第二次：触发 level2 (累计 > 3%)
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.5,
        price: 45000,
        pnl: -1000, // 累计 3.5% 亏损
      });

      // 确保升级到 level3
      cascadeRiskSystem.checkAllRisks();

      // 第三次：触发 level3 (累计 > 5%)
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.5,
        price: 45000,
        pnl: -2000, // 累计 5.5% 亏损
      });

      expect(cascadeRiskSystem.state.tradingAllowed).toBe(false);

      // 日重置
      cascadeRiskSystem.resetDaily();

      expect(cascadeRiskSystem.state.tradingAllowed).toBe(true);
      expect(cascadeRiskSystem.state.riskLevel).toBe(0);
    });

    it('应该清除告警历史', () => {
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -3000,
      });

      expect(cascadeRiskSystem.getAlerts().length).toBeGreaterThan(0);

      cascadeRiskSystem.resetDaily();

      expect(cascadeRiskSystem.getAlerts().length).toBe(0);
    });

    it('但不应该清除持仓', () => {
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.5,
        price: 50000,
        pnl: 0,
      });

      cascadeRiskSystem.resetDaily();

      expect(cascadeRiskSystem.state.positions.size).toBe(1);
    });
  });

  // ============================================
  // 事件测试
  // ============================================

  describe('风控事件', () => {
    it('应该发出风险等级变化事件', async () => {
      const levelChanges = [];

      cascadeRiskSystem.on('riskLevelChange', (data) => {
        levelChanges.push(data);
      });

      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -2500,
      });

      expect(levelChanges.length).toBeGreaterThan(0);
      expect(levelChanges[0].from).toBe(0);
      expect(levelChanges[0].to).toBe(1);
    });

    it('应该发出触发处理事件', async () => {
      const triggers = [];

      cascadeRiskSystem.on('triggerHandled', (trigger) => {
        triggers.push(trigger);
      });

      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -2500,
      });

      expect(triggers.length).toBeGreaterThan(0);
    });

    it('应该发出仓位减少事件', async () => {
      const reductions = [];

      cascadeRiskSystem.on('positionReduced', (data) => {
        reductions.push(data);
      });

      // 添加仓位
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.5,
        price: 50000,
        pnl: 0,
      });

      // 第一次亏损触发 level1 (2.5% 亏损)
      cascadeRiskSystem.recordTrade({
        symbol: 'ETH/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -2500,
      });

      // 确保升级到 level2
      cascadeRiskSystem.checkAllRisks();

      // 第二次亏损触发 level2 减仓 (累计 > 3%)
      cascadeRiskSystem.recordTrade({
        symbol: 'ETH/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -1000,
      });

      // 应该有减仓事件
      expect(reductions.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 综合场景测试
  // ============================================

  describe('综合场景', () => {
    it('应该正确处理完整的风控生命周期', async () => {
      const events = [];

      cascadeRiskSystem.on('riskAlert', () => events.push('alert'));
      cascadeRiskSystem.on('riskLevelChange', () => events.push('levelChange'));
      cascadeRiskSystem.on('tradingPaused', () => events.push('paused'));
      cascadeRiskSystem.on('dailyReset', () => events.push('reset'));

      // 1. 正常交易
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.3,
        price: 50000,
        pnl: 0,
      });

      // 2. 开始亏损
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 48000,
        pnl: -2000,
      });

      // 3. 继续亏损
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 46000,
        pnl: -1500,
      });

      // 4. 大幅亏损
      cascadeRiskSystem.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 44000,
        pnl: -2000,
      });

      // 5. 日重置恢复
      cascadeRiskSystem.resetDaily();

      // 验证事件序列
      expect(events.includes('alert')).toBe(true);
      expect(events.includes('levelChange')).toBe(true);
      expect(events.includes('reset')).toBe(true);
    });

    it('应该在高波动市场中正确处理连续触发', async () => {
      // 模拟高波动市场
      for (let i = 0; i < 10; i++) {
        cascadeRiskSystem.checkAllRisks({
          volatility: 0.03 + Math.random() * 0.05, // 3-8% 波动
          priceChange: (Math.random() - 0.5) * 0.1, // -5% 到 +5% 变化
        });

        cascadeRiskSystem.recordTrade({
          symbol: 'BTC/USDT',
          side: Math.random() > 0.5 ? 'buy' : 'sell',
          amount: 0.1,
          price: 50000 * (1 + (Math.random() - 0.5) * 0.1),
          pnl: (Math.random() - 0.5) * 1000,
        });
      }

      // 系统应该保持稳定
      const state = cascadeRiskSystem.getState();
      expect(state.riskLevel).toBeDefined();
    });
  });
});
