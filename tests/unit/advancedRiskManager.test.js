/**
 * 高级风险管理器测试
 * Advanced Risk Manager Tests
 * @module tests/unit/advancedRiskManager.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdvancedRiskManager, {
  RISK_LEVEL,
  RISK_ACTION,
  POSITION_SIDE,
  DEFAULT_CONFIG,
} from '../../src/risk/manager.js';

// ============================================
// Mock Exchange
// ============================================

function createMockExchange(name = 'binance') {
  return {
    name,
    fetchBalance: vi.fn().mockResolvedValue({
      total: { USDT: 10000 },
      free: { USDT: 5000 },
      used: { USDT: 5000 },
    }),
    fetchPositions: vi.fn().mockResolvedValue([]),
    fetchTicker: vi.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      last: 50000,
      bid: 49990,
      ask: 50010,
    }),
  };
}

// ============================================
// Mock Executor
// ============================================

function createMockExecutor() {
  return {
    emergencyCloseAll: vi.fn().mockResolvedValue(true),
    reducePosition: vi.fn().mockResolvedValue(true),
  };
}

// ============================================
// AdvancedRiskManager 测试
// ============================================

describe('AdvancedRiskManager', () => {
  let riskManager;
  let mockExchanges;
  let mockExecutor;

  beforeEach(() => {
    riskManager = new AdvancedRiskManager({
      verbose: false,
      checkInterval: 10000,
      marginRefreshInterval: 10000,
      priceRefreshInterval: 10000,
    });
    mockExchanges = new Map();
    mockExchanges.set('binance', createMockExchange('binance'));
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
      const rm = new AdvancedRiskManager();

      expect(rm.config.emergencyMarginRate).toBe(0.35);
      expect(rm.config.warningMarginRate).toBe(0.50);
      expect(rm.config.dangerMarginRate).toBe(0.40);
      expect(rm.config.maxSinglePositionRatio).toBe(0.15);
      expect(rm.config.maxDailyDrawdown).toBe(0.08);
      expect(rm.config.btcCrashThreshold).toBe(-0.03);
      expect(rm.config.altcoinReduceRatio).toBe(0.50);
    });

    it('应该使用自定义配置', () => {
      const rm = new AdvancedRiskManager({
        emergencyMarginRate: 0.30,
        maxDailyDrawdown: 0.10,
      });

      expect(rm.config.emergencyMarginRate).toBe(0.30);
      expect(rm.config.maxDailyDrawdown).toBe(0.10);
    });

    it('应该初始化空交易所映射', () => {
      expect(riskManager.exchanges.size).toBe(0);
    });

    it('应该初始化为正常状态', () => {
      expect(riskManager.state.riskLevel).toBe(RISK_LEVEL.NORMAL);
      expect(riskManager.state.tradingAllowed).toBe(true);
      expect(riskManager.state.pauseReason).toBeNull();
      expect(riskManager.state.running).toBe(false);
    });

    it('应该初始化每日权益', () => {
      expect(riskManager.dailyEquity.startEquity).toBe(0);
      expect(riskManager.dailyEquity.peakEquity).toBe(0);
      expect(riskManager.dailyEquity.currentDrawdown).toBe(0);
    });

    it('应该初始化空定时器', () => {
      expect(riskManager.checkTimer).toBeNull();
      expect(riskManager.marginTimer).toBeNull();
      expect(riskManager.priceTimer).toBeNull();
    });

    it('应该初始化空缓存', () => {
      expect(riskManager.accountData.size).toBe(0);
      expect(riskManager.positionData.size).toBe(0);
      expect(riskManager.priceData.size).toBe(0);
      expect(riskManager.liquidationPrices.size).toBe(0);
    });

    it('应该初始化空 BTC 价格历史', () => {
      expect(riskManager.btcPriceHistory).toEqual([]);
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('init', () => {
    it('应该保存交易所和执行器引用', async () => {
      await riskManager.init(mockExchanges, mockExecutor);

      expect(riskManager.exchanges).toBe(mockExchanges);
      expect(riskManager.executor).toBe(mockExecutor);
    });
  });

  describe('start', () => {
    it('应该设置运行状态', () => {
      riskManager.start();

      expect(riskManager.state.running).toBe(true);
    });

    it('应该设置定时器', () => {
      riskManager.start();

      expect(riskManager.checkTimer).not.toBeNull();
      expect(riskManager.marginTimer).not.toBeNull();
      expect(riskManager.priceTimer).not.toBeNull();
    });

    it('应该发射 started 事件', () => {
      const listener = vi.fn();
      riskManager.on('started', listener);

      riskManager.start();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      riskManager.start();
    });

    it('应该设置停止状态', () => {
      riskManager.stop();

      expect(riskManager.state.running).toBe(false);
    });

    it('应该清除定时器', () => {
      riskManager.stop();

      expect(riskManager.checkTimer).toBeNull();
      expect(riskManager.marginTimer).toBeNull();
      expect(riskManager.priceTimer).toBeNull();
    });

    it('应该发射 stopped 事件', () => {
      const listener = vi.fn();
      riskManager.on('stopped', listener);

      riskManager.stop();

      expect(listener).toHaveBeenCalled();
    });
  });

  // ============================================
  // 保证金率检查测试
  // ============================================

  describe('_checkMarginRate', () => {
    it('没有账户数据时应该返回无动作', async () => {
      const result = await riskManager._checkMarginRate();

      expect(result.action).toBe(RISK_ACTION.NONE);
      expect(result.marginRate).toBe(Infinity);
    });

    it('保证金率正常时应该返回无动作', async () => {
      riskManager.accountData.set('binance', {
        equity: 10000,
        usedMargin: 5000, // 200% margin rate
      });

      const result = await riskManager._checkMarginRate();

      expect(result.action).toBe(RISK_ACTION.NONE);
      expect(result.marginRate).toBe(2);
    });

    it('保证金率低于紧急阈值应该返回紧急平仓', async () => {
      riskManager.accountData.set('binance', {
        equity: 3000,
        usedMargin: 10000, // 30% margin rate < 35%
      });

      const result = await riskManager._checkMarginRate();

      expect(result.action).toBe(RISK_ACTION.EMERGENCY_CLOSE);
      expect(result.level).toBe(RISK_LEVEL.EMERGENCY);
    });

    it('保证金率低于危险阈值应该返回警报', async () => {
      riskManager.accountData.set('binance', {
        equity: 3800,
        usedMargin: 10000, // 38% margin rate < 40%
      });

      const result = await riskManager._checkMarginRate();

      expect(result.action).toBe(RISK_ACTION.ALERT);
      expect(result.level).toBe(RISK_LEVEL.DANGER);
    });

    it('保证金率低于警告阈值应该返回警报', async () => {
      riskManager.accountData.set('binance', {
        equity: 4500,
        usedMargin: 10000, // 45% margin rate < 50%
      });

      const result = await riskManager._checkMarginRate();

      expect(result.action).toBe(RISK_ACTION.ALERT);
      expect(result.level).toBe(RISK_LEVEL.WARNING);
    });
  });

  // ============================================
  // 每日回撤检查测试
  // ============================================

  describe('_checkDailyDrawdown', () => {
    beforeEach(() => {
      riskManager.dailyEquity = {
        startEquity: 10000,
        peakEquity: 10000,
        dayStart: Date.now(),
        currentDrawdown: 0,
      };
      // 需要有账户数据才能计算回撤
      riskManager.accountData.set('binance', { equity: 10000 });
    });

    it('无回撤时应该返回无动作', () => {
      const result = riskManager._checkDailyDrawdown();

      expect(result.action).toBe(RISK_ACTION.NONE);
      expect(result.level).toBe(RISK_LEVEL.NORMAL);
    });

    it('回撤超过阈值应该返回暂停交易', () => {
      // 设置当前权益为9000，峰值10000 -> 10%回撤 > 8%阈值
      riskManager.accountData.set('binance', { equity: 9000 });
      riskManager.dailyEquity.peakEquity = 10000;

      const result = riskManager._checkDailyDrawdown();

      expect(result.action).toBe(RISK_ACTION.PAUSE_TRADING);
      expect(result.level).toBe(RISK_LEVEL.DANGER);
    });

    it('回撤超过警告阈值应该返回警报', () => {
      // 设置回撤在5%-8%之间
      riskManager.accountData.set('binance', { equity: 9400 }); // 6%回撤
      riskManager.dailyEquity.peakEquity = 10000;

      const result = riskManager._checkDailyDrawdown();

      expect(result.action).toBe(RISK_ACTION.ALERT);
      expect(result.level).toBe(RISK_LEVEL.WARNING);
    });
  });

  // ============================================
  // BTC 急跌检查测试
  // ============================================

  describe('_checkBtcCrash', () => {
    it('没有 BTC 价格数据时应该返回无动作', () => {
      const result = riskManager._checkBtcCrash();

      expect(result.action).toBe(RISK_ACTION.NONE);
    });

    it('BTC 价格历史不足时应该返回无动作', () => {
      riskManager.priceData.set('BTC/USDT', { price: 50000, timestamp: Date.now() });

      const result = riskManager._checkBtcCrash();

      // 第一次调用会添加到历史，但历史不足2条
      expect(result.action).toBe(RISK_ACTION.NONE);
    });

    it('BTC 价格稳定时应该返回无动作', () => {
      const now = Date.now();
      riskManager.btcPriceHistory = [
        { price: 50000, timestamp: now - 300000 },
        { price: 50100, timestamp: now - 200000 },
        { price: 50050, timestamp: now },
      ];
      riskManager.priceData.set('BTC/USDT', { price: 50050, timestamp: now });

      const result = riskManager._checkBtcCrash();

      expect(result.action).toBe(RISK_ACTION.NONE);
    });
  });

  // ============================================
  // 仓位集中度检查测试
  // ============================================

  describe('_checkPositionConcentration', () => {
    it('没有持仓时应该返回无动作', () => {
      const result = riskManager._checkPositionConcentration();

      expect(result.action).toBe(RISK_ACTION.NONE);
    });

    it('仓位集中度正常时应该返回无动作', () => {
      riskManager.accountData.set('binance', { equity: 10000 });
      // 设置多个币种，每个币种占比 < 15%
      riskManager.positionData.set('binance', {
        'BTC/USDT': { notional: 100, size: 0.002 },  // 10% of total
        'ETH/USDT': { notional: 100, size: 0.03 },   // 10% of total
        'SOL/USDT': { notional: 100, size: 0.5 },    // 10% of total
        'DOGE/USDT': { notional: 100, size: 100 },   // 10% of total
        'LINK/USDT': { notional: 100, size: 5 },     // 10% of total
        'AVAX/USDT': { notional: 100, size: 2 },     // 10% of total
        'DOT/USDT': { notional: 100, size: 10 },     // 10% of total
        'MATIC/USDT': { notional: 100, size: 50 },   // 10% of total
        'XRP/USDT': { notional: 100, size: 100 },    // 10% of total
        'ADA/USDT': { notional: 100, size: 150 },    // 10% of total
      });

      const result = riskManager._checkPositionConcentration();

      expect(result.action).toBe(RISK_ACTION.NONE);
    });

    it('仓位集中度超过阈值应该返回警报', () => {
      riskManager.accountData.set('binance', { equity: 10000 });
      riskManager.positionData.set('binance', {
        'BTC/USDT': { notional: 2000, size: 0.04 }, // 20% > 15%
      });

      const result = riskManager._checkPositionConcentration();

      expect(result.action).toBe(RISK_ACTION.ALERT);
    });
  });

  // ============================================
  // 强平价格检查测试
  // ============================================

  describe('_checkLiquidationRisk', () => {
    it('没有强平价格数据时应该返回无动作', () => {
      const result = riskManager._checkLiquidationRisk();

      expect(result.action).toBe(RISK_ACTION.NONE);
    });

    it('远离强平价格时应该返回无动作', () => {
      // 设置强平价格和当前价格
      riskManager.positionData.set('binance', {
        'BTC/USDT': {
          side: POSITION_SIDE.LONG,
          liquidationPrice: 40000,
          entryPrice: 50000,
          size: 1,
        },
      });
      riskManager.priceData.set('BTC/USDT', { price: 50000 });

      const result = riskManager._checkLiquidationRisk();

      expect(result.action).toBe(RISK_ACTION.NONE);
    });
  });

  // ============================================
  // 风险级别更新测试
  // ============================================

  describe('_updateRiskLevel', () => {
    it('正常时应该设置正常级别', () => {
      riskManager.state.tradingAllowed = true;
      riskManager.dailyEquity.currentDrawdown = 0;

      riskManager._updateRiskLevel();

      expect(riskManager.state.riskLevel).toBe(RISK_LEVEL.NORMAL);
    });

    it('交易被暂停时应该设置危险级别', () => {
      riskManager.state.tradingAllowed = false;

      riskManager._updateRiskLevel();

      expect(riskManager.state.riskLevel).toBe(RISK_LEVEL.DANGER);
    });
  });

  // ============================================
  // 暂停交易测试
  // ============================================

  describe('_pauseTrading', () => {
    it('应该设置暂停状态', () => {
      riskManager._pauseTrading('test reason', {});

      expect(riskManager.state.tradingAllowed).toBe(false);
      expect(riskManager.state.pauseReason).toBe('test reason');
    });

    it('应该发射 tradingPaused 事件', () => {
      const listener = vi.fn();
      riskManager.on('tradingPaused', listener);

      riskManager._pauseTrading('test', {});

      expect(listener).toHaveBeenCalled();
    });
  });

  // ============================================
  // 紧急平仓测试
  // ============================================

  describe('_triggerEmergencyClose', () => {
    beforeEach(() => {
      riskManager.executor = mockExecutor;
    });

    it('应该调用执行器紧急平仓', async () => {
      await riskManager._triggerEmergencyClose('test', {});

      expect(mockExecutor.emergencyCloseAll).toHaveBeenCalled();
    });

    it('应该暂停交易', async () => {
      await riskManager._triggerEmergencyClose('test', {});

      expect(riskManager.state.tradingAllowed).toBe(false);
    });

    it('应该发射 emergencyClose 事件', async () => {
      const listener = vi.fn();
      riskManager.on('emergencyClose', listener);

      await riskManager._triggerEmergencyClose('test', {});

      expect(listener).toHaveBeenCalled();
    });

    it('没有执行器时应该只记录日志', async () => {
      riskManager.executor = null;

      await riskManager._triggerEmergencyClose('test', {});
      // 不应该抛错
    });
  });

  // ============================================
  // 公共 API 测试
  // ============================================

  describe('resumeTrading', () => {
    beforeEach(() => {
      riskManager.state.tradingAllowed = false;
      riskManager.state.pauseReason = 'test';
    });

    it('应该恢复交易', () => {
      riskManager.resumeTrading();

      expect(riskManager.state.tradingAllowed).toBe(true);
      expect(riskManager.state.pauseReason).toBeNull();
    });

    it('应该发射 tradingResumed 事件', () => {
      const listener = vi.fn();
      riskManager.on('tradingResumed', listener);

      riskManager.resumeTrading();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('manualPauseTrading', () => {
    it('应该暂停交易', () => {
      riskManager.manualPauseTrading('手动测试');

      expect(riskManager.state.tradingAllowed).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('应该返回状态信息', () => {
      const status = riskManager.getStatus();

      expect(status.running).toBe(false);
      expect(status.riskLevel).toBe(RISK_LEVEL.NORMAL);
      expect(status.tradingAllowed).toBe(true);
      expect(status.accounts).toBeDefined();
      expect(status.dailyEquity).toBeDefined();
      expect(status.liquidationPrices).toBeDefined();
      expect(status.config).toBeDefined();
    });

    it('应该包含配置信息', () => {
      const status = riskManager.getStatus();

      expect(status.config.emergencyMarginRate).toBe(0.35);
      expect(status.config.maxSinglePositionRatio).toBe(0.15);
      expect(status.config.maxDailyDrawdown).toBe(0.08);
    });
  });

  describe('isTradingAllowed', () => {
    it('应该返回交易状态', () => {
      expect(riskManager.isTradingAllowed()).toBe(true);

      riskManager.state.tradingAllowed = false;

      expect(riskManager.isTradingAllowed()).toBe(false);
    });
  });

  describe('getRiskLevel', () => {
    it('应该返回风险级别', () => {
      expect(riskManager.getRiskLevel()).toBe(RISK_LEVEL.NORMAL);

      riskManager.state.riskLevel = RISK_LEVEL.WARNING;

      expect(riskManager.getRiskLevel()).toBe(RISK_LEVEL.WARNING);
    });
  });

  // ============================================
  // 辅助方法测试
  // ============================================

  describe('_getDayStart', () => {
    it('应该返回今日开始时间戳', () => {
      const dayStart = riskManager._getDayStart();
      const now = new Date();
      const expected = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      expect(dayStart).toBe(expected);
    });
  });

  describe('_checkDayReset', () => {
    it('跨天时应该重置每日权益', () => {
      riskManager.dailyEquity.dayStart = Date.now() - 86400000 * 2; // 2天前
      riskManager.dailyEquity.currentDrawdown = 0.05;

      riskManager._checkDayReset();

      expect(riskManager.dailyEquity.currentDrawdown).toBe(0);
    });

    it('同一天内不应该重置', () => {
      const originalDayStart = riskManager._getDayStart();
      riskManager.dailyEquity.dayStart = originalDayStart;
      riskManager.dailyEquity.currentDrawdown = 0.05;

      riskManager._checkDayReset();

      expect(riskManager.dailyEquity.dayStart).toBe(originalDayStart);
    });
  });

  // ============================================
  // 数据更新测试
  // ============================================

  describe('updatePrice', () => {
    it('应该更新价格缓存', () => {
      riskManager.updatePrice('BTC/USDT', 50000);

      const priceData = riskManager.priceData.get('BTC/USDT');
      expect(priceData.price).toBe(50000);
      expect(priceData.timestamp).toBeGreaterThan(0);
    });
  });
});

// ============================================
// 常量导出测试
// ============================================

describe('AdvancedRiskManager Constants', () => {
  describe('RISK_LEVEL', () => {
    it('应该包含所有风险级别', () => {
      expect(RISK_LEVEL.NORMAL).toBe('normal');
      expect(RISK_LEVEL.WARNING).toBe('warning');
      expect(RISK_LEVEL.DANGER).toBe('danger');
      expect(RISK_LEVEL.CRITICAL).toBe('critical');
      expect(RISK_LEVEL.EMERGENCY).toBe('emergency');
    });
  });

  describe('RISK_ACTION', () => {
    it('应该包含所有风控动作', () => {
      expect(RISK_ACTION.NONE).toBe('none');
      expect(RISK_ACTION.ALERT).toBe('alert');
      expect(RISK_ACTION.REDUCE_POSITION).toBe('reduce');
      expect(RISK_ACTION.PAUSE_TRADING).toBe('pause');
      expect(RISK_ACTION.EMERGENCY_CLOSE).toBe('emergency');
    });
  });

  describe('POSITION_SIDE', () => {
    it('应该包含所有持仓方向', () => {
      expect(POSITION_SIDE.LONG).toBe('long');
      expect(POSITION_SIDE.SHORT).toBe('short');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('应该包含默认配置', () => {
      expect(DEFAULT_CONFIG.emergencyMarginRate).toBe(0.35);
      expect(DEFAULT_CONFIG.warningMarginRate).toBe(0.50);
      expect(DEFAULT_CONFIG.dangerMarginRate).toBe(0.40);
      expect(DEFAULT_CONFIG.maxSinglePositionRatio).toBe(0.15);
      expect(DEFAULT_CONFIG.maxDailyDrawdown).toBe(0.08);
      expect(DEFAULT_CONFIG.btcCrashThreshold).toBe(-0.03);
    });
  });
});
