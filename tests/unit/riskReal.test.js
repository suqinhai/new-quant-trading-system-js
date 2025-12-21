/**
 * 真实风控模块测试
 * Real Risk Module Tests
 * @module tests/unit/riskReal.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiskManager } from '../../src/risk/RiskManager.js';
import { PositionCalculator } from '../../src/risk/PositionCalculator.js';

// ============================================
// RiskManager 测试
// ============================================

describe('RiskManager (Real)', () => {
  let riskManager;

  beforeEach(() => {
    riskManager = new RiskManager({
      maxLossPerTrade: 0.02,
      maxDailyLoss: 0.05,
      maxPositions: 5,
      maxPositionSize: 0.2,
      maxLeverage: 3,
      defaultStopLoss: 0.05,
      defaultTakeProfit: 0.1,
      enableTrailingStop: true,
      trailingStopDistance: 0.03,
      cooldownPeriod: 1000,
    });
  });

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const rm = new RiskManager();
      expect(rm.config.maxLossPerTrade).toBe(0.02);
      expect(rm.config.maxDailyLoss).toBe(0.05);
      expect(rm.config.maxPositions).toBe(10);
    });

    it('应该使用自定义配置', () => {
      expect(riskManager.config.maxPositions).toBe(5);
      expect(riskManager.config.maxLeverage).toBe(3);
    });

    it('应该初始化状态', () => {
      expect(riskManager.state.tradingAllowed).toBe(true);
      expect(riskManager.state.dailyPnL).toBe(0);
      expect(riskManager.state.currentPositions).toBe(0);
    });
  });

  describe('checkOpenPosition', () => {
    it('应该允许正常开仓', async () => {
      // 等待冷却期过去
      await new Promise(r => setTimeout(r, 1100));

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        leverage: 1,
      });

      expect(result.allowed).toBe(true);
      expect(result.reasons.length).toBe(0);
    });

    it('应该在交易禁止时拒绝', () => {
      riskManager.state.tradingAllowed = false;

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('禁止');
    });

    it('应该在冷却期内拒绝', () => {
      riskManager.state.lastTradeTime = Date.now();

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('冷却');
    });

    it('应该在达到最大持仓数时拒绝', async () => {
      await new Promise(r => setTimeout(r, 1100));
      riskManager.state.currentPositions = 5;

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('持仓');
    });

    it('应该在杠杆超限时拒绝', async () => {
      await new Promise(r => setTimeout(r, 1100));

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        leverage: 10,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('杠杆');
    });

    it('应该在每日亏损限制时拒绝', async () => {
      await new Promise(r => setTimeout(r, 1100));
      riskManager.state.dailyPnL = -0.06;

      const result = riskManager.checkOpenPosition({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons[0]).toContain('亏损');
    });

    it('应该在连续亏损过多时拒绝', async () => {
      await new Promise(r => setTimeout(r, 1100));
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
  });

  describe('calculatePositionSize', () => {
    it('应该正确计算仓位大小', () => {
      const result = riskManager.calculatePositionSize({
        capital: 10000,
        price: 50000,
        stopLossPrice: 48000,
      });

      expect(result.size).toBeGreaterThan(0);
      expect(result.value).toBeGreaterThan(0);
      expect(result.riskAmount).toBe(200); // 10000 * 0.02
    });

    it('应该在没有止损价时使用默认止损', () => {
      const result = riskManager.calculatePositionSize({
        capital: 10000,
        price: 50000,
      });

      expect(result.size).toBeGreaterThan(0);
      expect(result.stopLossDistance).toBe(2500); // 50000 * 0.05
    });

    it('应该限制仓位不超过最大占比', () => {
      const result = riskManager.calculatePositionSize({
        capital: 10000,
        price: 50000,
        stopLossPrice: 49999, // 极小止损距离，会导致大仓位
      });

      // 仓位价值不应超过 10000 * 0.2 = 2000
      expect(result.value).toBeLessThanOrEqual(2000);
    });
  });

  describe('registerPosition', () => {
    it('应该正确注册持仓', () => {
      const position = riskManager.registerPosition({
        symbol: 'BTC/USDT',
        side: 'long',
        amount: 0.1,
        entryPrice: 50000,
      });

      expect(position.symbol).toBe('BTC/USDT');
      expect(position.side).toBe('long');
      expect(position.amount).toBe(0.1);
      expect(position.entryPrice).toBe(50000);
      expect(position.stopLoss).toBeDefined();
      expect(position.takeProfit).toBeDefined();
    });

    it('应该更新持仓计数', () => {
      riskManager.registerPosition({
        symbol: 'BTC/USDT',
        side: 'long',
        amount: 0.1,
        entryPrice: 50000,
      });

      expect(riskManager.state.currentPositions).toBe(1);
    });

    it('应该更新交易次数', () => {
      riskManager.registerPosition({
        symbol: 'BTC/USDT',
        side: 'long',
        amount: 0.1,
        entryPrice: 50000,
      });

      expect(riskManager.state.dailyTradeCount).toBe(1);
    });

    it('应该更新最后交易时间', () => {
      const before = Date.now();
      riskManager.registerPosition({
        symbol: 'BTC/USDT',
        side: 'long',
        amount: 0.1,
        entryPrice: 50000,
      });
      const after = Date.now();

      expect(riskManager.state.lastTradeTime).toBeGreaterThanOrEqual(before);
      expect(riskManager.state.lastTradeTime).toBeLessThanOrEqual(after);
    });

    it('应该发射 positionRegistered 事件', () => {
      const listener = vi.fn();
      riskManager.on('positionRegistered', listener);

      riskManager.registerPosition({
        symbol: 'BTC/USDT',
        side: 'long',
        amount: 0.1,
        entryPrice: 50000,
      });

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('updatePrice', () => {
    beforeEach(() => {
      riskManager.registerPosition({
        symbol: 'BTC/USDT',
        side: 'long',
        amount: 0.1,
        entryPrice: 50000,
      });
    });

    it('应该更新未实现盈亏', () => {
      riskManager.updatePrice('BTC/USDT', 51000);

      const position = riskManager.positions.get('BTC/USDT');
      expect(position.unrealizedPnL).toBe(100); // (51000 - 50000) * 0.1
    });

    it('应该更新最高价', () => {
      riskManager.updatePrice('BTC/USDT', 52000);

      const position = riskManager.positions.get('BTC/USDT');
      expect(position.highestPrice).toBe(52000);
    });

    it('应该在价格触及止损时返回止损信息', () => {
      const position = riskManager.positions.get('BTC/USDT');
      const result = riskManager.updatePrice('BTC/USDT', position.stopLoss - 100);

      expect(result).not.toBeNull();
      expect(result.type).toBe('stopLoss');
    });

    it('应该在价格触及止盈时返回止盈信息', () => {
      const position = riskManager.positions.get('BTC/USDT');
      const result = riskManager.updatePrice('BTC/USDT', position.takeProfit + 100);

      expect(result).not.toBeNull();
      expect(result.type).toBe('takeProfit');
    });

    it('应该在价格未触及时返回 null', () => {
      const result = riskManager.updatePrice('BTC/USDT', 50500);
      expect(result).toBeNull();
    });

    it('对于不存在的持仓应该返回 null', () => {
      const result = riskManager.updatePrice('ETH/USDT', 3000);
      expect(result).toBeNull();
    });
  });

  describe('closePosition', () => {
    beforeEach(() => {
      riskManager.registerPosition({
        symbol: 'BTC/USDT',
        side: 'long',
        amount: 0.1,
        entryPrice: 50000,
      });
    });

    it('应该正确计算盈利', () => {
      const result = riskManager.closePosition('BTC/USDT', 51000, 'test');

      expect(result.realizedPnL).toBe(100); // (51000 - 50000) * 0.1
    });

    it('应该正确计算亏损', () => {
      const result = riskManager.closePosition('BTC/USDT', 49000, 'test');

      expect(result.realizedPnL).toBe(-100); // (49000 - 50000) * 0.1
    });

    it('应该更新每日盈亏', () => {
      riskManager.closePosition('BTC/USDT', 51000, 'test');

      expect(riskManager.state.dailyPnL).toBe(100);
    });

    it('应该减少持仓计数', () => {
      riskManager.closePosition('BTC/USDT', 51000, 'test');

      expect(riskManager.state.currentPositions).toBe(0);
    });

    it('应该更新连续亏损计数', () => {
      riskManager.closePosition('BTC/USDT', 49000, 'test');

      expect(riskManager.state.consecutiveLosses).toBe(1);
    });

    it('盈利时应该重置连续亏损计数', () => {
      riskManager.state.consecutiveLosses = 3;
      riskManager.closePosition('BTC/USDT', 51000, 'test');

      expect(riskManager.state.consecutiveLosses).toBe(0);
    });

    it('应该发射 positionClosed 事件', () => {
      const listener = vi.fn();
      riskManager.on('positionClosed', listener);

      riskManager.closePosition('BTC/USDT', 51000, 'test');

      expect(listener).toHaveBeenCalled();
    });

    it('对于不存在的持仓应该返回 null', () => {
      const result = riskManager.closePosition('ETH/USDT', 3000, 'test');
      expect(result).toBeNull();
    });
  });

  describe('状态管理', () => {
    it('disableTrading 应该禁止交易', () => {
      riskManager.disableTrading('测试原因');

      expect(riskManager.state.tradingAllowed).toBe(false);
    });

    it('enableTrading 应该允许交易', () => {
      riskManager.state.tradingAllowed = false;
      riskManager.enableTrading();

      expect(riskManager.state.tradingAllowed).toBe(true);
    });

    it('resetDaily 应该重置每日统计', () => {
      riskManager.state.dailyPnL = 100;
      riskManager.state.dailyTradeCount = 10;
      riskManager.state.consecutiveLosses = 3;

      riskManager.resetDaily();

      expect(riskManager.state.dailyPnL).toBe(0);
      expect(riskManager.state.dailyTradeCount).toBe(0);
      expect(riskManager.state.consecutiveLosses).toBe(0);
    });

    it('getStatus 应该返回状态快照', () => {
      const status = riskManager.getStatus();

      expect(status.tradingAllowed).toBe(true);
      expect(status.config).toBeDefined();
      expect(status.positions).toBeDefined();
    });
  });

  describe('事件发射', () => {
    it('应该在风险触发时发射事件', () => {
      const listener = vi.fn();
      riskManager.on('riskTriggered', listener);

      riskManager._triggerRisk('test', '测试风险');

      expect(listener).toHaveBeenCalled();
    });

    it('应该在交易禁止时发射事件', () => {
      const listener = vi.fn();
      riskManager.on('tradingDisabled', listener);

      riskManager.disableTrading('test');

      expect(listener).toHaveBeenCalled();
    });

    it('应该在交易恢复时发射事件', () => {
      const listener = vi.fn();
      riskManager.on('tradingEnabled', listener);

      riskManager.enableTrading();

      expect(listener).toHaveBeenCalled();
    });

    it('应该在每日重置时发射事件', () => {
      const listener = vi.fn();
      riskManager.on('dailyReset', listener);

      riskManager.resetDaily();

      expect(listener).toHaveBeenCalled();
    });
  });
});

// ============================================
// PositionCalculator 测试
// ============================================

describe('PositionCalculator (Real)', () => {
  describe('fixedAmount', () => {
    it('应该计算固定金额仓位', () => {
      const result = PositionCalculator.fixedAmount({
        fixedAmount: 1000,
        price: 50000,
      });

      expect(result.method).toBe('fixedAmount');
      expect(result.quantity).toBe(0.02); // 1000 / 50000
      expect(result.value).toBe(1000);
    });
  });

  describe('fixedPercent', () => {
    it('应该计算固定百分比仓位', () => {
      const result = PositionCalculator.fixedPercent({
        capital: 10000,
        percent: 10,
        price: 50000,
      });

      expect(result.method).toBe('fixedPercent');
      expect(result.value).toBe(1000); // 10000 * 10%
      expect(result.quantity).toBe(0.02); // 1000 / 50000
      expect(result.percent).toBe(10);
    });
  });

  describe('riskBased', () => {
    it('应该根据风险计算仓位', () => {
      const result = PositionCalculator.riskBased({
        capital: 10000,
        riskPercent: 0.02,
        entryPrice: 50000,
        stopLossPrice: 48000,
      });

      expect(result.method).toBe('riskBased');
      expect(result.riskAmount).toBe(200); // 10000 * 0.02
      expect(result.riskPerUnit).toBe(2000); // |50000 - 48000|
      expect(result.quantity).toBe(0.1); // 200 / 2000
    });
  });

  describe('volatilityAdjusted', () => {
    it('应该根据波动率调整仓位', () => {
      const result = PositionCalculator.volatilityAdjusted({
        capital: 10000,
        riskPercent: 0.02,
        price: 50000,
        atr: 1000,
        atrMultiplier: 2,
      });

      expect(result.method).toBe('volatilityAdjusted');
      expect(result.riskAmount).toBe(200);
      expect(result.stopDistance).toBe(2000); // 1000 * 2
      expect(result.quantity).toBe(0.1); // 200 / 2000
    });
  });

  describe('kellyCriterion', () => {
    it('应该使用凯利公式计算仓位', () => {
      const result = PositionCalculator.kellyCriterion({
        capital: 10000,
        winRate: 0.6,
        avgWin: 200,
        avgLoss: 100,
        price: 50000,
        fraction: 0.25,
      });

      expect(result.method).toBe('kellyCriterion');
      expect(result.odds).toBe(2); // 200 / 100
      expect(result.winRate).toBe(0.6);
      expect(result.kellyPercent).toBeGreaterThan(0);
      expect(result.adjustedPercent).toBe(result.kellyPercent * 0.25);
    });

    it('应该限制凯利比例在合理范围', () => {
      const result = PositionCalculator.kellyCriterion({
        capital: 10000,
        winRate: 0.99,
        avgWin: 1000,
        avgLoss: 10,
        price: 50000,
        fraction: 1,
      });

      expect(result.kellyPercent).toBeLessThanOrEqual(1);
      expect(result.kellyPercent).toBeGreaterThanOrEqual(0);
    });
  });

  describe('martingale', () => {
    it('应该计算马丁格尔仓位', () => {
      const result = PositionCalculator.martingale({
        baseAmount: 100,
        consecutiveLosses: 3,
        price: 50000,
      });

      expect(result.method).toBe('martingale');
      expect(result.multiplier).toBe(8); // 2^3
      expect(result.value).toBe(800); // 100 * 8
      expect(result.warning).toBeDefined();
    });

    it('应该限制最大倍数', () => {
      const result = PositionCalculator.martingale({
        baseAmount: 100,
        consecutiveLosses: 10,
        price: 50000,
        maxMultiplier: 8,
      });

      expect(result.multiplier).toBe(8);
    });
  });

  describe('antiMartingale', () => {
    it('应该计算反马丁格尔仓位', () => {
      const result = PositionCalculator.antiMartingale({
        baseAmount: 100,
        consecutiveWins: 2,
        price: 50000,
      });

      expect(result.method).toBe('antiMartingale');
      expect(result.multiplier).toBeCloseTo(2.25, 2); // 1.5^2
      expect(result.value).toBeCloseTo(225, 0); // 100 * 2.25
    });

    it('应该限制最大倍数', () => {
      const result = PositionCalculator.antiMartingale({
        baseAmount: 100,
        consecutiveWins: 10,
        price: 50000,
        maxMultiplier: 4,
      });

      expect(result.multiplier).toBe(4);
    });
  });

  describe('calculateATR', () => {
    it('应该计算 ATR', () => {
      const candles = [];
      for (let i = 0; i < 20; i++) {
        candles.push({
          high: 50000 + i * 100 + 200,
          low: 50000 + i * 100 - 200,
          close: 50000 + i * 100,
        });
      }

      const atr = PositionCalculator.calculateATR(candles, 14);

      expect(atr).toBeGreaterThan(0);
    });

    it('数据不足时应该返回 null', () => {
      const candles = [
        { high: 50200, low: 49800, close: 50000 },
        { high: 50300, low: 49700, close: 50100 },
      ];

      const atr = PositionCalculator.calculateATR(candles, 14);

      expect(atr).toBeNull();
    });
  });
});
