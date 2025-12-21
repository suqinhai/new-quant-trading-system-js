/**
 * RiskManager 单元测试
 * @module tests/unit/riskManager.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * RiskManager Mock 实现
 * 用于测试风控逻辑
 */
class RiskManagerMock {
  constructor(config = {}) {
    this.config = {
      maxLossPerTrade: config.maxLossPerTrade || 0.02,      // 2%
      maxDailyLoss: config.maxDailyLoss || 0.05,            // 5%
      maxPositions: config.maxPositions || 10,
      maxPositionSize: config.maxPositionSize || 0.2,       // 20%
      maxLeverage: config.maxLeverage || 3,
      defaultStopLoss: config.defaultStopLoss || 0.05,      // 5%
      defaultTakeProfit: config.defaultTakeProfit || 0.1,   // 10%
      enableTrailingStop: config.enableTrailingStop || false,
      trailingStopDistance: config.trailingStopDistance || 0.03,
      cooldownPeriod: config.cooldownPeriod || 60000,       // 1 分钟
      blacklist: config.blacklist || [],
      whitelist: config.whitelist || [],
    };

    this.state = {
      tradingAllowed: true,
      dailyPnL: 0,
      dailyTradeCount: 0,
      currentPositions: 0,
      lastTradeTime: 0,
      consecutiveLosses: 0,
      triggers: [],
    };

    this.positions = new Map();
    this.stopOrders = new Map();
    this.trailingStops = new Map();
    this.events = [];
  }

  emit(event, data) {
    this.events.push({ event, data });
  }

  /**
   * 检查是否允许开仓
   */
  checkOpenPosition(params) {
    const { symbol, side, amount, price, leverage = 1, accountBalance } = params;

    const result = {
      allowed: true,
      reasons: [],
      adjustedAmount: amount,
    };

    // 检查交易是否被禁止
    if (!this.state.tradingAllowed) {
      result.allowed = false;
      result.reasons.push('交易已被禁止');
      return result;
    }

    // 检查黑名单
    if (this.config.blacklist.includes(symbol)) {
      result.allowed = false;
      result.reasons.push(`${symbol} 在黑名单中`);
      return result;
    }

    // 检查白名单（如果有设置）
    if (this.config.whitelist.length > 0 && !this.config.whitelist.includes(symbol)) {
      result.allowed = false;
      result.reasons.push(`${symbol} 不在白名单中`);
      return result;
    }

    // 检查冷却期
    const timeSinceLastTrade = Date.now() - this.state.lastTradeTime;
    if (this.state.lastTradeTime > 0 && timeSinceLastTrade < this.config.cooldownPeriod) {
      result.allowed = false;
      result.reasons.push(`冷却期中`);
      return result;
    }

    // 检查持仓数量限制
    if (this.state.currentPositions >= this.config.maxPositions) {
      result.allowed = false;
      result.reasons.push(`已达到最大持仓数量: ${this.config.maxPositions}`);
      return result;
    }

    // 检查杠杆限制
    if (leverage > this.config.maxLeverage) {
      result.allowed = false;
      result.reasons.push(`杠杆超过限制: ${leverage} > ${this.config.maxLeverage}`);
      return result;
    }

    // 检查每日亏损限制
    if (accountBalance) {
      const maxLoss = accountBalance * this.config.maxDailyLoss;
      if (this.state.dailyPnL < 0 && Math.abs(this.state.dailyPnL) >= maxLoss) {
        result.allowed = false;
        result.reasons.push(`已达到每日最大亏损限制`);
        this._triggerRisk('dailyLossLimit');
        return result;
      }
    }

    // 检查连续亏损
    if (this.state.consecutiveLosses >= 5) {
      result.allowed = false;
      result.reasons.push(`连续亏损次数过多: ${this.state.consecutiveLosses}`);
      return result;
    }

    // 检查仓位大小限制
    if (accountBalance && price && amount) {
      const positionValue = amount * price;
      const maxPositionValue = accountBalance * this.config.maxPositionSize;
      if (positionValue > maxPositionValue) {
        result.adjustedAmount = maxPositionValue / price;
        result.reasons.push(`仓位已调整: ${amount} -> ${result.adjustedAmount.toFixed(6)}`);
      }
    }

    return result;
  }

  /**
   * 计算仓位大小
   */
  calculatePositionSize(params) {
    const { capital, price, stopLossPrice, riskPercent } = params;

    const risk = riskPercent || this.config.maxLossPerTrade;
    const riskAmount = capital * risk;

    const stopDistance = stopLossPrice
      ? Math.abs(price - stopLossPrice)
      : price * this.config.defaultStopLoss;

    const positionSize = riskAmount / stopDistance;
    const positionValue = positionSize * price;

    const maxPositionValue = capital * this.config.maxPositionSize;
    const adjustedSize = positionValue > maxPositionValue
      ? maxPositionValue / price
      : positionSize;

    return {
      size: adjustedSize,
      value: adjustedSize * price,
      riskAmount,
      stopLossDistance: stopDistance,
      riskPercent: risk,
    };
  }

  /**
   * 记录交易
   */
  recordTrade(trade) {
    const { symbol, side, amount, price, pnl = 0 } = trade;

    // 更新每日PnL
    this.state.dailyPnL += pnl;
    this.state.dailyTradeCount++;
    this.state.lastTradeTime = Date.now();

    // 更新连续亏损
    if (pnl < 0) {
      this.state.consecutiveLosses++;
    } else if (pnl > 0) {
      this.state.consecutiveLosses = 0;
    }

    // 更新持仓
    if (side === 'buy') {
      const existing = this.positions.get(symbol);
      if (existing) {
        existing.amount += amount;
        existing.avgPrice = (existing.avgPrice * (existing.amount - amount) + price * amount) / existing.amount;
      } else {
        this.positions.set(symbol, {
          symbol,
          amount,
          avgPrice: price,
          side: 'long',
          entryTime: Date.now(),
        });
        this.state.currentPositions++;
      }
    } else if (side === 'sell') {
      const existing = this.positions.get(symbol);
      if (existing) {
        existing.amount -= amount;
        if (existing.amount <= 0) {
          this.positions.delete(symbol);
          this.state.currentPositions--;
        }
      }
    }

    this.emit('tradeRecorded', trade);
  }

  /**
   * 设置止损
   */
  setStopLoss(symbol, stopPrice, amount) {
    this.stopOrders.set(`${symbol}_sl`, {
      symbol,
      type: 'stopLoss',
      price: stopPrice,
      amount,
      createdAt: Date.now(),
    });
  }

  /**
   * 设置止盈
   */
  setTakeProfit(symbol, targetPrice, amount) {
    this.stopOrders.set(`${symbol}_tp`, {
      symbol,
      type: 'takeProfit',
      price: targetPrice,
      amount,
      createdAt: Date.now(),
    });
  }

  /**
   * 检查止损止盈
   */
  checkStopOrders(symbol, currentPrice) {
    const triggered = [];

    const sl = this.stopOrders.get(`${symbol}_sl`);
    if (sl && currentPrice <= sl.price) {
      triggered.push({ ...sl, triggerPrice: currentPrice });
      this.stopOrders.delete(`${symbol}_sl`);
    }

    const tp = this.stopOrders.get(`${symbol}_tp`);
    if (tp && currentPrice >= tp.price) {
      triggered.push({ ...tp, triggerPrice: currentPrice });
      this.stopOrders.delete(`${symbol}_tp`);
    }

    return triggered;
  }

  /**
   * 更新追踪止损
   */
  updateTrailingStop(symbol, currentPrice) {
    if (!this.config.enableTrailingStop) return null;

    const position = this.positions.get(symbol);
    if (!position) return null;

    let trailing = this.trailingStops.get(symbol);
    if (!trailing) {
      trailing = {
        symbol,
        highPrice: currentPrice,
        stopPrice: currentPrice * (1 - this.config.trailingStopDistance),
      };
      this.trailingStops.set(symbol, trailing);
    }

    // 更新最高价和止损价
    if (currentPrice > trailing.highPrice) {
      trailing.highPrice = currentPrice;
      trailing.stopPrice = currentPrice * (1 - this.config.trailingStopDistance);
    }

    // 检查是否触发
    if (currentPrice <= trailing.stopPrice) {
      this.trailingStops.delete(symbol);
      return {
        triggered: true,
        stopPrice: trailing.stopPrice,
        highPrice: trailing.highPrice,
      };
    }

    return {
      triggered: false,
      stopPrice: trailing.stopPrice,
      highPrice: trailing.highPrice,
    };
  }

  /**
   * 禁止交易
   */
  disableTrading(reason) {
    this.state.tradingAllowed = false;
    this._triggerRisk('tradingDisabled', reason);
  }

  /**
   * 启用交易
   */
  enableTrading() {
    this.state.tradingAllowed = true;
  }

  /**
   * 重置每日统计
   */
  resetDailyStats() {
    this.state.dailyPnL = 0;
    this.state.dailyTradeCount = 0;
    this.state.consecutiveLosses = 0;
  }

  /**
   * 获取状态
   */
  getState() {
    return {
      ...this.state,
      positionCount: this.positions.size,
      stopOrderCount: this.stopOrders.size,
    };
  }

  /**
   * 触发风险事件
   */
  _triggerRisk(type, reason = '') {
    const trigger = {
      type,
      reason,
      timestamp: Date.now(),
    };
    this.state.triggers.push(trigger);
    this.emit('riskTriggered', trigger);
  }
}

// ============================================
// 测试用例
// ============================================

describe('RiskManager', () => {
  let riskManager;

  beforeEach(() => {
    riskManager = new RiskManagerMock({
      maxLossPerTrade: 0.02,
      maxDailyLoss: 0.05,
      maxPositions: 5,
      maxPositionSize: 0.2,
      maxLeverage: 3,
      cooldownPeriod: 1000, // 1 秒，便于测试
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // 开仓检查测试
  // ============================================

  describe('checkOpenPosition', () => {
    it('应该允许正常开仓', () => {
      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        accountBalance: 100000,
      });

      expect(result.allowed).toBe(true);
      expect(result.reasons.length).toBe(0);
    });

    it('应该拒绝超过最大持仓数量的开仓', () => {
      // 模拟已有5个持仓
      riskManager.state.currentPositions = 5;

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('最大持仓数量');
    });

    it('应该拒绝超过杠杆限制的开仓', () => {
      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        leverage: 5, // 超过限制的 3 倍
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('杠杆超过限制');
    });

    it('应该在每日亏损达到限制时拒绝开仓', () => {
      // 模拟亏损 5000（占 100000 的 5%）
      riskManager.state.dailyPnL = -5000;

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        accountBalance: 100000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('每日最大亏损限制');
    });

    it('应该在冷却期内拒绝开仓', () => {
      // 模拟刚交易过
      riskManager.state.lastTradeTime = Date.now();

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('冷却期');
    });

    it('应该在连续亏损5次后拒绝开仓', () => {
      riskManager.state.consecutiveLosses = 5;

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('连续亏损');
    });

    it('应该拒绝黑名单中的交易对', () => {
      riskManager.config.blacklist = ['SCAM/USDT'];

      const result = riskManager.checkOpenPosition({
        symbol: 'SCAM/USDT',
        side: 'buy',
        amount: 1,
        price: 100,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('黑名单');
    });

    it('应该在交易被禁止时拒绝所有开仓', () => {
      riskManager.disableTrading('紧急停止');

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('交易已被禁止');
    });

    it('应该调整超过仓位限制的数量', () => {
      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1,          // 1 BTC = 50000 USDT
        price: 50000,
        accountBalance: 100000,  // 最大仓位 = 20000 USDT = 0.4 BTC
      });

      expect(result.allowed).toBe(true);
      expect(result.adjustedAmount).toBeLessThan(1);
      expect(result.adjustedAmount).toBeCloseTo(0.4, 1);
    });
  });

  // ============================================
  // 仓位计算测试
  // ============================================

  describe('calculatePositionSize', () => {
    it('应该根据风险计算正确的仓位大小', () => {
      // 使用更高的 maxPositionSize 来测试风险计算逻辑
      const highLimitRiskManager = new RiskManagerMock({
        maxPositionSize: 1.0, // 100%，不限制
        maxLossPerTrade: 0.02,
      });

      const result = highLimitRiskManager.calculatePositionSize({
        capital: 100000,
        price: 50000,
        stopLossPrice: 49000, // 止损距离 1000
        riskPercent: 0.02,    // 风险 2% = 2000
      });

      // 仓位 = 2000 / 1000 = 2 BTC
      expect(result.size).toBeCloseTo(2, 1);
      expect(result.riskAmount).toBe(2000);
    });

    it('应该使用默认止损计算仓位', () => {
      // 使用更高的 maxPositionSize 来测试默认止损逻辑
      const highLimitRiskManager = new RiskManagerMock({
        maxPositionSize: 1.0, // 100%，不限制
        maxLossPerTrade: 0.02,
        defaultStopLoss: 0.05,
      });

      const result = highLimitRiskManager.calculatePositionSize({
        capital: 100000,
        price: 50000,
        // 无 stopLossPrice，使用默认 5%
      });

      // 默认止损距离 = 50000 * 0.05 = 2500
      // 风险金额 = 100000 * 0.02 = 2000
      // 仓位 = 2000 / 2500 = 0.8 BTC
      expect(result.size).toBeCloseTo(0.8, 1);
    });

    it('应该限制仓位不超过最大仓位占比', () => {
      const result = riskManager.calculatePositionSize({
        capital: 100000,
        price: 50000,
        stopLossPrice: 49900, // 很小的止损距离 100
        riskPercent: 0.02,    // 风险 2% = 2000
      });

      // 计算仓位 = 2000 / 100 = 20 BTC = 1000000 USDT
      // 最大仓位 = 100000 * 0.2 = 20000 USDT = 0.4 BTC
      expect(result.size).toBeCloseTo(0.4, 1);
      expect(result.value).toBeLessThanOrEqual(20000);
    });
  });

  // ============================================
  // 交易记录测试
  // ============================================

  describe('recordTrade', () => {
    it('应该正确记录盈利交易', () => {
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 100,
      });

      expect(riskManager.state.dailyPnL).toBe(100);
      expect(riskManager.state.dailyTradeCount).toBe(1);
      expect(riskManager.state.consecutiveLosses).toBe(0);
    });

    it('应该正确记录亏损交易', () => {
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 49000,
        pnl: -100,
      });

      expect(riskManager.state.dailyPnL).toBe(-100);
      expect(riskManager.state.consecutiveLosses).toBe(1);
    });

    it('应该正确计算连续亏损次数', () => {
      // 3次亏损
      for (let i = 0; i < 3; i++) {
        riskManager.recordTrade({
          symbol: 'BTC/USDT',
          side: 'sell',
          amount: 0.1,
          price: 49000,
          pnl: -100,
        });
      }

      expect(riskManager.state.consecutiveLosses).toBe(3);

      // 1次盈利，重置连续亏损
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 51000,
        pnl: 100,
      });

      expect(riskManager.state.consecutiveLosses).toBe(0);
    });

    it('应该正确更新持仓', () => {
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 0,
      });

      expect(riskManager.state.currentPositions).toBe(1);
      expect(riskManager.positions.has('BTC/USDT')).toBe(true);

      const position = riskManager.positions.get('BTC/USDT');
      expect(position.amount).toBe(0.1);
      expect(position.avgPrice).toBe(50000);
    });

    it('应该在平仓后减少持仓计数', () => {
      // 开仓
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 0,
      });

      expect(riskManager.state.currentPositions).toBe(1);

      // 平仓
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 51000,
        pnl: 100,
      });

      expect(riskManager.state.currentPositions).toBe(0);
      expect(riskManager.positions.has('BTC/USDT')).toBe(false);
    });
  });

  // ============================================
  // 止损止盈测试
  // ============================================

  describe('止损止盈', () => {
    it('应该正确设置止损', () => {
      riskManager.setStopLoss('BTC/USDT', 49000, 0.1);

      const sl = riskManager.stopOrders.get('BTC/USDT_sl');
      expect(sl).toBeDefined();
      expect(sl.price).toBe(49000);
      expect(sl.type).toBe('stopLoss');
    });

    it('应该正确设置止盈', () => {
      riskManager.setTakeProfit('BTC/USDT', 52000, 0.1);

      const tp = riskManager.stopOrders.get('BTC/USDT_tp');
      expect(tp).toBeDefined();
      expect(tp.price).toBe(52000);
      expect(tp.type).toBe('takeProfit');
    });

    it('应该在价格触及时触发止损', () => {
      riskManager.setStopLoss('BTC/USDT', 49000, 0.1);

      const triggered = riskManager.checkStopOrders('BTC/USDT', 48500);

      expect(triggered.length).toBe(1);
      expect(triggered[0].type).toBe('stopLoss');
      expect(riskManager.stopOrders.has('BTC/USDT_sl')).toBe(false);
    });

    it('应该在价格触及时触发止盈', () => {
      riskManager.setTakeProfit('BTC/USDT', 52000, 0.1);

      const triggered = riskManager.checkStopOrders('BTC/USDT', 53000);

      expect(triggered.length).toBe(1);
      expect(triggered[0].type).toBe('takeProfit');
    });

    it('应该在价格未触及时不触发', () => {
      riskManager.setStopLoss('BTC/USDT', 49000, 0.1);
      riskManager.setTakeProfit('BTC/USDT', 52000, 0.1);

      const triggered = riskManager.checkStopOrders('BTC/USDT', 50000);

      expect(triggered.length).toBe(0);
    });
  });

  // ============================================
  // 追踪止损测试
  // ============================================

  describe('追踪止损', () => {
    beforeEach(() => {
      riskManager.config.enableTrailingStop = true;
      riskManager.config.trailingStopDistance = 0.03; // 3%

      // 添加持仓
      riskManager.positions.set('BTC/USDT', {
        symbol: 'BTC/USDT',
        amount: 0.1,
        avgPrice: 50000,
        side: 'long',
      });
    });

    it('应该初始化追踪止损', () => {
      const result = riskManager.updateTrailingStop('BTC/USDT', 50000);

      expect(result.triggered).toBe(false);
      expect(result.highPrice).toBe(50000);
      expect(result.stopPrice).toBeCloseTo(48500, 0); // 50000 * 0.97
    });

    it('应该在价格上涨时更新止损价', () => {
      riskManager.updateTrailingStop('BTC/USDT', 50000);
      const result = riskManager.updateTrailingStop('BTC/USDT', 52000);

      expect(result.highPrice).toBe(52000);
      expect(result.stopPrice).toBeCloseTo(50440, 0); // 52000 * 0.97
    });

    it('应该在价格触及止损时触发', () => {
      riskManager.updateTrailingStop('BTC/USDT', 50000);
      riskManager.updateTrailingStop('BTC/USDT', 52000); // 最高价
      const result = riskManager.updateTrailingStop('BTC/USDT', 50000); // 回落触发

      expect(result.triggered).toBe(true);
    });

    it('应该在禁用追踪止损时返回 null', () => {
      riskManager.config.enableTrailingStop = false;

      const result = riskManager.updateTrailingStop('BTC/USDT', 50000);
      expect(result).toBeNull();
    });
  });

  // ============================================
  // 状态管理测试
  // ============================================

  describe('状态管理', () => {
    it('应该正确禁用和启用交易', () => {
      riskManager.disableTrading('测试');
      expect(riskManager.state.tradingAllowed).toBe(false);

      riskManager.enableTrading();
      expect(riskManager.state.tradingAllowed).toBe(true);
    });

    it('应该正确重置每日统计', () => {
      riskManager.state.dailyPnL = -500;
      riskManager.state.dailyTradeCount = 10;
      riskManager.state.consecutiveLosses = 3;

      riskManager.resetDailyStats();

      expect(riskManager.state.dailyPnL).toBe(0);
      expect(riskManager.state.dailyTradeCount).toBe(0);
      expect(riskManager.state.consecutiveLosses).toBe(0);
    });

    it('应该正确获取状态', () => {
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 100,
      });

      const state = riskManager.getState();

      expect(state.dailyPnL).toBe(100);
      expect(state.positionCount).toBe(1);
      expect(state.dailyTradeCount).toBe(1);
    });
  });

  // ============================================
  // 事件发射测试
  // ============================================

  describe('事件发射', () => {
    it('应该在记录交易时发射事件', () => {
      riskManager.recordTrade({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 0,
      });

      const event = riskManager.events.find(e => e.event === 'tradeRecorded');
      expect(event).toBeDefined();
    });

    it('应该在触发风险时发射事件', () => {
      riskManager.disableTrading('紧急停止');

      const event = riskManager.events.find(e => e.event === 'riskTriggered');
      expect(event).toBeDefined();
      expect(event.data.type).toBe('tradingDisabled');
    });
  });
});

// ============================================
// 边界条件测试
// ============================================

describe('RiskManager 边界条件', () => {
  it('应该处理零资金情况', () => {
    const rm = new RiskManagerMock();
    const result = rm.calculatePositionSize({
      capital: 0,
      price: 50000,
    });

    expect(result.size).toBe(0);
  });

  it('应该处理极小价格变动', () => {
    const rm = new RiskManagerMock();
    const result = rm.calculatePositionSize({
      capital: 100000,
      price: 50000,
      stopLossPrice: 49999.99,
    });

    // 极小止损距离会导致极大仓位，应该被限制
    expect(result.size).toBeLessThanOrEqual(100000 * 0.2 / 50000);
  });

  it('应该正确处理多个交易对的持仓', () => {
    const rm = new RiskManagerMock({ maxPositions: 3 });

    rm.recordTrade({ symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000 });
    rm.recordTrade({ symbol: 'ETH/USDT', side: 'buy', amount: 1, price: 3000 });
    rm.recordTrade({ symbol: 'BNB/USDT', side: 'buy', amount: 10, price: 300 });

    expect(rm.state.currentPositions).toBe(3);

    const result = rm.checkOpenPosition({
      symbol: 'SOL/USDT',
      side: 'buy',
      amount: 10,
      price: 100,
    });

    expect(result.allowed).toBe(false);
  });
});
