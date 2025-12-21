/**
 * 跨账户风险汇总器测试
 * Multi-Account Risk Aggregator Tests
 * @module tests/unit/multiAccountRiskAggregator.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MultiAccountRiskAggregator,
  ACCOUNT_STATUS,
  GLOBAL_RISK_LEVEL,
  DEFAULT_CONFIG,
} from '../../src/risk/MultiAccountRiskAggregator.js';

// ============================================
// Mock Risk Manager
// ============================================

function createMockRiskManager() {
  return {
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
    disableTrading: vi.fn(),
    enableTrading: vi.fn(),
  };
}

// ============================================
// MultiAccountRiskAggregator 测试
// ============================================

describe('MultiAccountRiskAggregator', () => {
  let aggregator;

  beforeEach(() => {
    aggregator = new MultiAccountRiskAggregator({
      maxTotalEquity: 1000000,
      maxTotalPositionValue: 500000,
      maxGlobalLeverage: 3.0,
      maxGlobalDrawdown: 0.15,
      maxDailyLoss: 0.05,
      maxSingleAccountRatio: 0.40,
      checkInterval: 10000,
      verbose: false,
    });
  });

  afterEach(() => {
    if (aggregator) {
      aggregator.stop();
      aggregator.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const a = new MultiAccountRiskAggregator();

      expect(a.config.maxTotalEquity).toBe(10000000);
      expect(a.config.maxTotalPositionValue).toBe(5000000);
      expect(a.config.maxGlobalLeverage).toBe(3.0);
      expect(a.config.maxGlobalDrawdown).toBe(0.15);
      expect(a.config.maxDailyLoss).toBe(0.05);
      expect(a.config.maxSingleAccountRatio).toBe(0.40);
      expect(a.config.accountCorrelationThreshold).toBe(0.70);
    });

    it('应该使用自定义配置', () => {
      expect(aggregator.config.maxTotalEquity).toBe(1000000);
      expect(aggregator.config.maxTotalPositionValue).toBe(500000);
    });

    it('应该初始化全局状态', () => {
      expect(aggregator.globalState.totalEquity).toBe(0);
      expect(aggregator.globalState.totalPositionValue).toBe(0);
      expect(aggregator.globalState.globalLeverage).toBe(0);
      expect(aggregator.globalState.riskLevel).toBe(GLOBAL_RISK_LEVEL.NORMAL);
      expect(aggregator.globalState.tradingAllowed).toBe(true);
      expect(aggregator.globalState.pauseReason).toBeNull();
    });

    it('应该初始化空账户列表', () => {
      expect(aggregator.accounts.size).toBe(0);
      expect(aggregator.accountRiskManagers.size).toBe(0);
      expect(aggregator.accountReturns.size).toBe(0);
    });

    it('应该初始化空风险事件历史', () => {
      expect(aggregator.riskEvents).toEqual([]);
    });

    it('应该设置运行状态为 false', () => {
      expect(aggregator.running).toBe(false);
    });

    it('应该设置定时器为 null', () => {
      expect(aggregator.checkTimer).toBeNull();
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('init', () => {
    it('应该初始化成功', async () => {
      await aggregator.init({
        initialEquity: 100000,
      });

      expect(aggregator.globalState.totalEquity).toBe(100000);
      expect(aggregator.peakEquity).toBe(100000);
      expect(aggregator.dailyStartEquity).toBe(100000);
    });

    it('没有初始权益时不应该修改状态', async () => {
      await aggregator.init({});

      expect(aggregator.globalState.totalEquity).toBe(0);
    });
  });

  describe('start/stop', () => {
    it('应该启动汇总器', () => {
      const listener = vi.fn();
      aggregator.on('started', listener);

      aggregator.start();

      expect(aggregator.running).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('应该设置定时器', () => {
      aggregator.start();

      expect(aggregator.checkTimer).not.toBeNull();
    });

    it('应该停止汇总器', () => {
      const listener = vi.fn();
      aggregator.on('stopped', listener);

      aggregator.start();
      aggregator.stop();

      expect(aggregator.running).toBe(false);
      expect(listener).toHaveBeenCalled();
    });

    it('停止后应该清除定时器', () => {
      aggregator.start();
      aggregator.stop();

      expect(aggregator.checkTimer).toBeNull();
    });

    it('重复启动应该无操作', () => {
      aggregator.start();
      const timer1 = aggregator.checkTimer;
      aggregator.start();

      expect(aggregator.checkTimer).toBe(timer1);
    });

    it('未启动时停止应该无操作', () => {
      aggregator.stop();
      expect(aggregator.running).toBe(false);
    });
  });

  // ============================================
  // 账户管理测试
  // ============================================

  describe('registerAccount', () => {
    it('应该注册账户', () => {
      aggregator.registerAccount('account1', { exchange: 'binance' });

      expect(aggregator.accounts.has('account1')).toBe(true);
      const account = aggregator.accounts.get('account1');
      expect(account.id).toBe('account1');
      expect(account.exchange).toBe('binance');
      expect(account.status).toBe(ACCOUNT_STATUS.ACTIVE);
    });

    it('应该发射 accountRegistered 事件', () => {
      const listener = vi.fn();
      aggregator.on('accountRegistered', listener);

      aggregator.registerAccount('account1', { exchange: 'binance' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'account1' })
      );
    });

    it('应该初始化账户收益历史', () => {
      aggregator.registerAccount('account1', {});

      expect(aggregator.accountReturns.has('account1')).toBe(true);
      expect(aggregator.accountReturns.get('account1')).toEqual([]);
    });

    it('应该使用初始权益', () => {
      aggregator.registerAccount('account1', { initialEquity: 50000 });

      const account = aggregator.accounts.get('account1');
      expect(account.equity).toBe(50000);
      expect(account.availableBalance).toBe(50000);
    });

    it('应该设置风险预算', () => {
      aggregator.registerAccount('account1', { riskBudget: 10000 });

      const account = aggregator.accounts.get('account1');
      expect(account.riskBudget).toBe(10000);
    });

    it('应该更新全局状态', () => {
      aggregator.registerAccount('account1', { initialEquity: 50000 });

      expect(aggregator.globalState.totalEquity).toBe(50000);
    });
  });

  describe('unregisterAccount', () => {
    beforeEach(() => {
      aggregator.registerAccount('account1', { initialEquity: 50000 });
    });

    it('应该注销账户', () => {
      aggregator.unregisterAccount('account1');

      expect(aggregator.accounts.has('account1')).toBe(false);
    });

    it('应该发射 accountUnregistered 事件', () => {
      const listener = vi.fn();
      aggregator.on('accountUnregistered', listener);

      aggregator.unregisterAccount('account1');

      expect(listener).toHaveBeenCalledWith({ accountId: 'account1' });
    });

    it('应该删除账户收益历史', () => {
      aggregator.unregisterAccount('account1');

      expect(aggregator.accountReturns.has('account1')).toBe(false);
    });

    it('应该删除账户风控管理器', () => {
      aggregator.setAccountRiskManager('account1', createMockRiskManager());
      aggregator.unregisterAccount('account1');

      expect(aggregator.accountRiskManagers.has('account1')).toBe(false);
    });

    it('注销不存在的账户应该无操作', () => {
      aggregator.unregisterAccount('nonexistent');
      // 不应该抛错
    });

    it('应该更新全局状态', () => {
      aggregator.unregisterAccount('account1');

      expect(aggregator.globalState.totalEquity).toBe(0);
    });
  });

  describe('updateAccount', () => {
    beforeEach(() => {
      aggregator.registerAccount('account1', { initialEquity: 50000 });
    });

    it('应该更新账户数据', () => {
      aggregator.updateAccount('account1', {
        equity: 55000,
        availableBalance: 50000,
      });

      const account = aggregator.accounts.get('account1');
      expect(account.equity).toBe(55000);
      expect(account.availableBalance).toBe(50000);
    });

    it('应该更新最后更新时间', () => {
      const before = Date.now();
      aggregator.updateAccount('account1', { equity: 55000 });

      const account = aggregator.accounts.get('account1');
      expect(account.lastUpdate).toBeGreaterThanOrEqual(before);
    });

    it('应该计算仓位价值', () => {
      aggregator.updateAccount('account1', {
        positions: [
          { symbol: 'BTC/USDT', size: 1, markPrice: 50000 },
          { symbol: 'ETH/USDT', size: 10, markPrice: 3000 },
        ],
      });

      const account = aggregator.accounts.get('account1');
      expect(account.positionValue).toBe(80000);
    });

    it('应该计算杠杆', () => {
      aggregator.updateAccount('account1', {
        equity: 50000,
        positions: [
          { symbol: 'BTC/USDT', size: 2, markPrice: 50000 },
        ],
      });

      const account = aggregator.accounts.get('account1');
      expect(account.leverage).toBe(2);
    });

    it('不存在的账户应该自动注册', () => {
      aggregator.updateAccount('newAccount', {
        exchange: 'okx',
        equity: 30000,
      });

      expect(aggregator.accounts.has('newAccount')).toBe(true);
    });

    it('应该记录收益用于相关性分析', () => {
      aggregator.updateAccount('account1', { equity: 51000 });

      const returns = aggregator.accountReturns.get('account1');
      expect(returns.length).toBe(1);
      expect(returns[0]).toBeCloseTo(0.02, 4);
    });

    it('应该限制收益历史长度', () => {
      for (let i = 0; i < 110; i++) {
        aggregator.updateAccount('account1', { equity: 50000 + i });
      }

      const returns = aggregator.accountReturns.get('account1');
      expect(returns.length).toBeLessThanOrEqual(100);
    });

    it('应该更新全局状态', () => {
      aggregator.updateAccount('account1', {
        equity: 60000,
        positions: [{ symbol: 'BTC/USDT', size: 0.5, markPrice: 50000 }],
      });

      expect(aggregator.globalState.totalEquity).toBe(60000);
      expect(aggregator.globalState.totalPositionValue).toBe(25000);
    });
  });

  describe('setAccountRiskManager', () => {
    beforeEach(() => {
      aggregator.registerAccount('account1', {});
    });

    it('应该设置账户风控管理器', () => {
      const riskManager = createMockRiskManager();
      aggregator.setAccountRiskManager('account1', riskManager);

      expect(aggregator.accountRiskManagers.get('account1')).toBe(riskManager);
    });

    it('应该监听 riskTriggered 事件', () => {
      const riskManager = createMockRiskManager();
      aggregator.setAccountRiskManager('account1', riskManager);

      const listener = vi.fn();
      aggregator.on('accountRiskEvent', listener);

      riskManager.emit('riskTriggered', { message: 'test' });

      expect(listener).toHaveBeenCalled();
    });

    it('应该监听 tradingDisabled 事件', () => {
      const riskManager = createMockRiskManager();
      aggregator.setAccountRiskManager('account1', riskManager);

      const listener = vi.fn();
      aggregator.on('accountStatusChanged', listener);

      riskManager.emit('tradingDisabled', { reason: 'test' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'account1',
          status: ACCOUNT_STATUS.SUSPENDED,
        })
      );
    });
  });

  // ============================================
  // 全局状态更新测试
  // ============================================

  describe('_updateGlobalState', () => {
    beforeEach(() => {
      aggregator.registerAccount('account1', { initialEquity: 50000 });
      aggregator.registerAccount('account2', { initialEquity: 30000 });
    });

    it('应该汇总总权益', () => {
      aggregator.updateAccount('account1', { equity: 60000 });
      aggregator.updateAccount('account2', { equity: 40000 });

      expect(aggregator.globalState.totalEquity).toBe(100000);
    });

    it('应该汇总总仓位价值', () => {
      aggregator.updateAccount('account1', {
        positions: [{ symbol: 'BTC/USDT', size: 1, markPrice: 50000 }],
      });
      aggregator.updateAccount('account2', {
        positions: [{ symbol: 'ETH/USDT', size: 5, markPrice: 3000 }],
      });

      expect(aggregator.globalState.totalPositionValue).toBe(65000);
    });

    it('应该计算全局杠杆', () => {
      // Update only account1 with positions, keeping only one account for cleaner calculation
      aggregator.unregisterAccount('account2');
      aggregator.updateAccount('account1', {
        equity: 50000,
        positions: [{ symbol: 'BTC/USDT', size: 2, markPrice: 50000 }],
      });

      // 50000权益，100000仓位 = 2倍杠杆
      expect(aggregator.globalState.globalLeverage).toBeCloseTo(2, 1);
    });

    it('应该更新峰值权益', () => {
      aggregator.updateAccount('account1', { equity: 100000 });

      expect(aggregator.peakEquity).toBe(130000);
    });

    it('应该计算全局回撤', () => {
      aggregator.updateAccount('account1', { equity: 100000 });
      aggregator.updateAccount('account1', { equity: 80000 });

      // 峰值130000，当前110000 (80000 + 30000)
      expect(aggregator.globalState.globalDrawdown).toBeCloseTo(0.154, 2);
    });

    it('应该忽略暂停账户', () => {
      const account = aggregator.accounts.get('account1');
      account.status = ACCOUNT_STATUS.SUSPENDED;
      aggregator._updateGlobalState();

      // account1 (50000) is suspended, account2 (30000) is active
      expect(aggregator.globalState.totalEquity).toBe(30000);
    });
  });

  // ============================================
  // 风险检查测试
  // ============================================

  describe('_checkEquityLimit', () => {
    it('权益在限制内应该通过', () => {
      aggregator.globalState.totalEquity = 500000;

      const result = aggregator._checkEquityLimit();

      expect(result.passed).toBe(true);
    });

    it('权益超限应该失败', () => {
      aggregator.globalState.totalEquity = 1500000;

      const result = aggregator._checkEquityLimit();

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('warning');
    });
  });

  describe('_checkPositionLimit', () => {
    it('仓位在限制内应该通过', () => {
      aggregator.globalState.totalPositionValue = 400000;

      const result = aggregator._checkPositionLimit();

      expect(result.passed).toBe(true);
    });

    it('仓位超限应该失败', () => {
      aggregator.globalState.totalPositionValue = 600000;

      const result = aggregator._checkPositionLimit();

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('high');
    });
  });

  describe('_checkGlobalLeverage', () => {
    it('杠杆在限制内应该通过', () => {
      aggregator.globalState.globalLeverage = 2.0;

      const result = aggregator._checkGlobalLeverage();

      expect(result.passed).toBe(true);
    });

    it('杠杆超限应该失败', () => {
      aggregator.globalState.globalLeverage = 4.0;

      const result = aggregator._checkGlobalLeverage();

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('high');
    });
  });

  describe('_checkGlobalDrawdown', () => {
    it('回撤在限制内应该通过', () => {
      aggregator.globalState.globalDrawdown = 0.10;

      const result = aggregator._checkGlobalDrawdown();

      expect(result.passed).toBe(true);
    });

    it('回撤超限应该失败', () => {
      aggregator.globalState.globalDrawdown = 0.20;

      const result = aggregator._checkGlobalDrawdown();

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('critical');
    });
  });

  describe('_checkDailyLoss', () => {
    it('日亏损在限制内应该通过', () => {
      aggregator.globalState.dailyPnLPercent = -0.03;

      const result = aggregator._checkDailyLoss();

      expect(result.passed).toBe(true);
    });

    it('日亏损超限应该失败', () => {
      aggregator.globalState.dailyPnLPercent = -0.06;

      const result = aggregator._checkDailyLoss();

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('critical');
    });
  });

  describe('_checkAccountConcentration', () => {
    beforeEach(() => {
      // Use 35%/35%/30% distribution to stay under 40% limit
      aggregator.registerAccount('account1', { initialEquity: 35000 });
      aggregator.registerAccount('account2', { initialEquity: 35000 });
      aggregator.registerAccount('account3', { initialEquity: 30000 });
    });

    it('账户集中度正常应该通过', () => {
      const result = aggregator._checkAccountConcentration();

      expect(result.passed).toBe(true);
    });

    it('账户集中度过高应该失败', () => {
      // account1 will have 90000 / (90000+35000+30000) = 58% > 40% limit
      aggregator.updateAccount('account1', { equity: 90000 });

      const result = aggregator._checkAccountConcentration();

      expect(result.passed).toBe(false);
      expect(result.details.length).toBeGreaterThan(0);
    });
  });

  describe('_checkExposureConcentration', () => {
    beforeEach(() => {
      aggregator.registerAccount('account1', { exchange: 'binance' });
      aggregator.updateAccount('account1', {
        equity: 100000,
        positions: [
          { symbol: 'BTC/USDT', size: 1, markPrice: 50000 },
        ],
      });
    });

    it('没有敞口分析时应该通过', () => {
      aggregator.exposureAnalysis = null;

      const result = aggregator._checkExposureConcentration();

      expect(result.passed).toBe(true);
    });

    it('敞口集中度正常应该通过', () => {
      const result = aggregator._checkExposureConcentration();

      expect(result.passed).toBe(true);
    });

    it('交易所敞口过高应该失败', () => {
      aggregator.config.maxSingleExchangeRatio = 0.3;
      // Invalidate cache and force refresh
      aggregator.exposureAnalysisTime = 0;
      aggregator._updateExposureAnalysis();

      const result = aggregator._checkExposureConcentration();

      expect(result.passed).toBe(false);
      expect(result.details.some(d => d.type === 'exchange')).toBe(true);
    });

    it('交易对敞口过高应该失败', () => {
      aggregator.config.maxSingleSymbolRatio = 0.1;
      // Invalidate cache and force refresh
      aggregator.exposureAnalysisTime = 0;
      aggregator._updateExposureAnalysis();

      const result = aggregator._checkExposureConcentration();

      expect(result.passed).toBe(false);
      expect(result.details.some(d => d.type === 'symbol')).toBe(true);
    });
  });

  describe('_checkAccountCorrelation', () => {
    it('少于2个账户应该通过', () => {
      aggregator.registerAccount('account1', {});

      const result = aggregator._checkAccountCorrelation();

      expect(result.passed).toBe(true);
    });

    it('数据不足应该通过', () => {
      aggregator.registerAccount('account1', {});
      aggregator.registerAccount('account2', {});

      const result = aggregator._checkAccountCorrelation();

      expect(result.passed).toBe(true);
    });

    it('有足够数据时应该检测相关性', () => {
      aggregator.registerAccount('account1', {});
      aggregator.registerAccount('account2', {});

      // 添加相关收益数据
      for (let i = 0; i < 15; i++) {
        const r = Math.random() * 0.02 - 0.01;
        aggregator.accountReturns.get('account1').push(r);
        aggregator.accountReturns.get('account2').push(r * 0.9 + Math.random() * 0.002);
      }

      const result = aggregator._checkAccountCorrelation();

      expect(result.highCorrelationPairs).toBeDefined();
    });
  });

  describe('_calculateCorrelation', () => {
    it('完全正相关应该返回 1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];

      const corr = aggregator._calculateCorrelation(x, y);

      expect(corr).toBeCloseTo(1, 4);
    });

    it('完全负相关应该返回 -1', () => {
      const x = [1, 2, 3, 4, 5];
      const y = [10, 8, 6, 4, 2];

      const corr = aggregator._calculateCorrelation(x, y);

      expect(corr).toBeCloseTo(-1, 4);
    });

    it('数据不足应该返回 0', () => {
      const corr = aggregator._calculateCorrelation([1], [2]);

      expect(corr).toBe(0);
    });
  });

  describe('_checkAccountRisk', () => {
    beforeEach(() => {
      // Use balanced accounts to avoid triggering concentration warnings
      aggregator.registerAccount('account1', { initialEquity: 30000 });
      aggregator.registerAccount('account2', { initialEquity: 40000 });
      aggregator.registerAccount('account3', { initialEquity: 30000 });
    });

    it('正常账户不应该产生警告', () => {
      const listener = vi.fn();
      aggregator.on('accountWarning', listener);

      aggregator._checkAccountRisk('account1');

      expect(listener).not.toHaveBeenCalled();
    });

    it('权益占比过高应该产生警告', () => {
      const listener = vi.fn();
      aggregator.on('accountWarning', listener);

      // Make account1 have 80% of total equity
      aggregator.updateAccount('account1', { equity: 150000 });
      aggregator._checkAccountRisk('account1');

      expect(listener).toHaveBeenCalled();
      const account = aggregator.accounts.get('account1');
      expect(account.status).toBe(ACCOUNT_STATUS.WARNING);
    });

    it('杠杆过高应该产生警告', () => {
      const listener = vi.fn();
      aggregator.on('accountWarning', listener);

      aggregator.updateAccount('account1', {
        equity: 50000,
        positions: [{ symbol: 'BTC/USDT', size: 4, markPrice: 50000 }],
      });
      aggregator._checkAccountRisk('account1');

      expect(listener).toHaveBeenCalled();
    });
  });

  // ============================================
  // 风险级别更新测试
  // ============================================

  describe('_updateGlobalRiskLevel', () => {
    it('所有检查通过应该设置正常级别', () => {
      const results = [
        { type: 'test1', passed: true },
        { type: 'test2', passed: true },
      ];

      aggregator._updateGlobalRiskLevel(results);

      expect(aggregator.globalState.riskLevel).toBe(GLOBAL_RISK_LEVEL.NORMAL);
    });

    it('警告级别应该设置升高', () => {
      const results = [
        { type: 'test1', passed: false, severity: 'warning' },
      ];

      aggregator._updateGlobalRiskLevel(results);

      expect(aggregator.globalState.riskLevel).toBe(GLOBAL_RISK_LEVEL.ELEVATED);
    });

    it('高级别应该设置高风险', () => {
      const results = [
        { type: 'test1', passed: false, severity: 'high' },
      ];

      aggregator._updateGlobalRiskLevel(results);

      expect(aggregator.globalState.riskLevel).toBe(GLOBAL_RISK_LEVEL.HIGH);
    });

    it('严重级别应该设置严重', () => {
      const results = [
        { type: 'test1', passed: false, severity: 'critical' },
      ];

      aggregator._updateGlobalRiskLevel(results);

      expect(aggregator.globalState.riskLevel).toBe(GLOBAL_RISK_LEVEL.CRITICAL);
    });

    it('风险级别变化应该发射事件', () => {
      const listener = vi.fn();
      aggregator.on('riskLevelChanged', listener);

      const results = [
        { type: 'test1', passed: false, severity: 'high' },
      ];

      aggregator._updateGlobalRiskLevel(results);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          previousLevel: GLOBAL_RISK_LEVEL.NORMAL,
          currentLevel: GLOBAL_RISK_LEVEL.HIGH,
        })
      );
    });

    it('接近限制应该设置升高', () => {
      aggregator.globalState.globalDrawdown = 0.12; // 80% of 0.15

      const results = [{ type: 'test1', passed: true }];

      aggregator._updateGlobalRiskLevel(results);

      expect(aggregator.globalState.riskLevel).toBe(GLOBAL_RISK_LEVEL.ELEVATED);
    });
  });

  describe('_executeGlobalRiskActions', () => {
    beforeEach(() => {
      aggregator.registerAccount('account1', {});
      const riskManager = createMockRiskManager();
      aggregator.setAccountRiskManager('account1', riskManager);
    });

    it('严重失败应该暂停交易', async () => {
      const results = [
        { type: 'test1', passed: false, severity: 'critical', message: 'test' },
      ];

      await aggregator._executeGlobalRiskActions(results);

      expect(aggregator.globalState.tradingAllowed).toBe(false);
    });

    it('严重失败应该通知账户风控管理器', async () => {
      const riskManager = aggregator.accountRiskManagers.get('account1');
      const results = [
        { type: 'test1', passed: false, severity: 'critical', message: 'test' },
      ];

      await aggregator._executeGlobalRiskActions(results);

      expect(riskManager.disableTrading).toHaveBeenCalled();
    });

    it('严重失败应该发射紧急事件', async () => {
      const listener = vi.fn();
      aggregator.on('globalEmergency', listener);

      const results = [
        { type: 'test1', passed: false, severity: 'critical', message: 'test' },
      ];

      await aggregator._executeGlobalRiskActions(results);

      expect(listener).toHaveBeenCalled();
    });

    it('严重失败应该记录风险事件', async () => {
      const results = [
        { type: 'test1', passed: false, severity: 'critical', message: 'test' },
      ];

      await aggregator._executeGlobalRiskActions(results);

      expect(aggregator.riskEvents.length).toBe(1);
    });
  });

  // ============================================
  // 辅助方法测试
  // ============================================

  describe('_checkAccountTimeouts', () => {
    it('活跃账户应该不变', () => {
      aggregator.registerAccount('account1', {});

      aggregator._checkAccountTimeouts();

      const account = aggregator.accounts.get('account1');
      expect(account.status).toBe(ACCOUNT_STATUS.ACTIVE);
    });

    it('超时账户应该变为非活跃', () => {
      aggregator.registerAccount('account1', {});
      const account = aggregator.accounts.get('account1');
      account.lastUpdate = Date.now() - 120000; // 2分钟前

      const listener = vi.fn();
      aggregator.on('accountTimeout', listener);

      aggregator._checkAccountTimeouts();

      expect(account.status).toBe(ACCOUNT_STATUS.INACTIVE);
      expect(listener).toHaveBeenCalledWith({ accountId: 'account1' });
    });
  });

  describe('_recordRiskEvent', () => {
    it('应该记录风险事件', () => {
      aggregator._recordRiskEvent('testType', { message: 'test' });

      expect(aggregator.riskEvents.length).toBe(1);
      expect(aggregator.riskEvents[0].type).toBe('testType');
      expect(aggregator.riskEvents[0].timestamp).toBeGreaterThan(0);
    });

    it('应该限制历史长度', () => {
      for (let i = 0; i < 600; i++) {
        aggregator._recordRiskEvent('test', {});
      }

      expect(aggregator.riskEvents.length).toBeLessThanOrEqual(500);
    });
  });

  describe('_updateExposureAnalysis', () => {
    it('应该计算交易所敞口', () => {
      aggregator.registerAccount('account1', { exchange: 'binance' });
      aggregator.updateAccount('account1', {
        equity: 100000,
        positions: [{ symbol: 'BTC/USDT', size: 1, markPrice: 50000 }],
      });
      // Invalidate cache to force recalculation
      aggregator.exposureAnalysisTime = 0;
      aggregator._updateExposureAnalysis();

      // The exchange exposure is based on positionValue which is calculated from positions
      expect(aggregator.exposureAnalysis.byExchange.binance).toBe(50000);
    });

    it('应该计算交易对敞口', () => {
      aggregator.registerAccount('account1', { exchange: 'binance' });
      aggregator.updateAccount('account1', {
        equity: 100000,
        positions: [{ symbol: 'BTC/USDT', size: 1, markPrice: 50000 }],
      });
      // Invalidate cache to force recalculation
      aggregator.exposureAnalysisTime = 0;
      aggregator._updateExposureAnalysis();

      expect(aggregator.exposureAnalysis.bySymbol['BTC/USDT']).toBe(50000);
    });

    it('应该使用缓存', () => {
      aggregator.registerAccount('account1', {});
      aggregator._updateExposureAnalysis();
      const firstTime = aggregator.exposureAnalysisTime;

      aggregator._updateExposureAnalysis();

      expect(aggregator.exposureAnalysisTime).toBe(firstTime);
    });
  });

  // ============================================
  // 公共 API 测试
  // ============================================

  describe('checkOrder', () => {
    beforeEach(() => {
      aggregator.registerAccount('account1', { initialEquity: 50000 });
      // Ensure global state is properly updated and risk level is normal
      aggregator.globalState.riskLevel = GLOBAL_RISK_LEVEL.NORMAL;
      aggregator.globalState.tradingAllowed = true;
    });

    it('正常情况应该允许', () => {
      // Clear exposure analysis to skip concentration check
      aggregator.exposureAnalysis = null;

      const result = aggregator.checkOrder('account1', {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(true);
    });

    it('全局交易暂停时应该拒绝', () => {
      aggregator.globalState.tradingAllowed = false;
      aggregator.globalState.pauseReason = 'test';

      const result = aggregator.checkOrder('account1', {});

      expect(result.allowed).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('账户暂停时应该拒绝', () => {
      const account = aggregator.accounts.get('account1');
      account.status = ACCOUNT_STATUS.SUSPENDED;

      const result = aggregator.checkOrder('account1', {});

      expect(result.allowed).toBe(false);
    });

    it('严重风险级别时应该拒绝', () => {
      aggregator.globalState.riskLevel = GLOBAL_RISK_LEVEL.CRITICAL;

      const result = aggregator.checkOrder('account1', {});

      expect(result.allowed).toBe(false);
    });

    it('高风险级别时应该警告', () => {
      aggregator.globalState.riskLevel = GLOBAL_RISK_LEVEL.HIGH;

      const result = aggregator.checkOrder('account1', {});

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('订单会导致敞口超限应该拒绝', () => {
      aggregator.config.maxSingleSymbolRatio = 0.1;
      aggregator.updateAccount('account1', {
        positions: [{ symbol: 'BTC/USDT', size: 1, markPrice: 50000 }],
      });

      const result = aggregator.checkOrder('account1', {
        symbol: 'BTC/USDT',
        amount: 1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe('getGlobalStatus', () => {
    it('应该返回全局状态', () => {
      aggregator.registerAccount('account1', {});

      const status = aggregator.getGlobalStatus();

      expect(status.running).toBe(false);
      expect(status.globalState).toBeDefined();
      expect(status.accountCount).toBe(1);
      expect(status.activeAccountCount).toBe(1);
      expect(status.peakEquity).toBeDefined();
    });
  });

  describe('getAccounts', () => {
    it('应该返回账户列表', () => {
      aggregator.registerAccount('account1', { exchange: 'binance' });
      aggregator.registerAccount('account2', { exchange: 'okx' });

      const accounts = aggregator.getAccounts();

      expect(accounts.length).toBe(2);
      expect(accounts[0].id).toBeDefined();
      expect(accounts[0].exchange).toBeDefined();
    });
  });

  describe('getRiskReport', () => {
    beforeEach(() => {
      aggregator.registerAccount('account1', { exchange: 'binance' });
    });

    it('应该返回风险报告', () => {
      const report = aggregator.getRiskReport();

      expect(report.timestamp).toBeDefined();
      expect(report.global).toBeDefined();
      expect(report.accounts).toBeDefined();
      expect(report.limits).toBeDefined();
    });

    it('应该包含全局信息', () => {
      const report = aggregator.getRiskReport();

      expect(report.global.totalEquity).toBeDefined();
      expect(report.global.riskLevel).toBeDefined();
      expect(report.global.tradingAllowed).toBeDefined();
    });

    it('应该包含限制信息', () => {
      const report = aggregator.getRiskReport();

      expect(report.limits.maxTotalEquity).toBe(1000000);
      expect(report.limits.maxGlobalLeverage).toBe(3.0);
    });
  });

  describe('resumeTrading', () => {
    beforeEach(() => {
      aggregator.registerAccount('account1', {});
      aggregator.globalState.tradingAllowed = false;
      aggregator.globalState.pauseReason = 'test';
      aggregator.accounts.get('account1').status = ACCOUNT_STATUS.SUSPENDED;
    });

    it('应该恢复全局交易', () => {
      aggregator.resumeTrading();

      expect(aggregator.globalState.tradingAllowed).toBe(true);
      expect(aggregator.globalState.pauseReason).toBeNull();
    });

    it('应该恢复暂停的账户', () => {
      aggregator.resumeTrading();

      const account = aggregator.accounts.get('account1');
      expect(account.status).toBe(ACCOUNT_STATUS.ACTIVE);
    });

    it('应该发射 tradingResumed 事件', () => {
      const listener = vi.fn();
      aggregator.on('tradingResumed', listener);

      aggregator.resumeTrading();

      expect(listener).toHaveBeenCalledWith({ reason: 'manual' });
    });

    it('应该通知账户风控管理器', () => {
      const riskManager = createMockRiskManager();
      aggregator.setAccountRiskManager('account1', riskManager);

      aggregator.resumeTrading();

      expect(riskManager.enableTrading).toHaveBeenCalled();
    });
  });

  // ============================================
  // 日志测试
  // ============================================

  describe('log', () => {
    it('verbose=false 时应该跳过 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      aggregator.config.verbose = false;

      aggregator.log('test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 error 日志', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      aggregator.log('error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 warn 日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      aggregator.log('warn message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// 常量导出测试
// ============================================

describe('MultiAccountRiskAggregator Constants', () => {
  describe('ACCOUNT_STATUS', () => {
    it('应该包含所有账户状态', () => {
      expect(ACCOUNT_STATUS.ACTIVE).toBe('active');
      expect(ACCOUNT_STATUS.INACTIVE).toBe('inactive');
      expect(ACCOUNT_STATUS.WARNING).toBe('warning');
      expect(ACCOUNT_STATUS.SUSPENDED).toBe('suspended');
      expect(ACCOUNT_STATUS.ERROR).toBe('error');
    });
  });

  describe('GLOBAL_RISK_LEVEL', () => {
    it('应该包含所有风险级别', () => {
      expect(GLOBAL_RISK_LEVEL.LOW).toBe('low');
      expect(GLOBAL_RISK_LEVEL.NORMAL).toBe('normal');
      expect(GLOBAL_RISK_LEVEL.ELEVATED).toBe('elevated');
      expect(GLOBAL_RISK_LEVEL.HIGH).toBe('high');
      expect(GLOBAL_RISK_LEVEL.CRITICAL).toBe('critical');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('应该包含默认配置', () => {
      expect(DEFAULT_CONFIG.maxTotalEquity).toBe(10000000);
      expect(DEFAULT_CONFIG.maxTotalPositionValue).toBe(5000000);
      expect(DEFAULT_CONFIG.maxGlobalLeverage).toBe(3.0);
      expect(DEFAULT_CONFIG.maxGlobalDrawdown).toBe(0.15);
      expect(DEFAULT_CONFIG.maxDailyLoss).toBe(0.05);
      expect(DEFAULT_CONFIG.maxSingleAccountRatio).toBe(0.40);
      expect(DEFAULT_CONFIG.accountCorrelationThreshold).toBe(0.70);
    });
  });
});
