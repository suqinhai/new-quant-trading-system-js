/**
 * 统一风控系统测试
 * Unified Risk System Tests
 * @module tests/unit/riskSystem.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RiskSystem,
  SYSTEM_STATUS,
  CIRCUIT_BREAKER_LEVEL,
  BLACK_SWAN_TYPE,
  LIQUIDITY_LEVEL,
  EXECUTION_STRATEGY,
  ACCOUNT_STATUS,
  GLOBAL_RISK_LEVEL,
  PORTFOLIO_RISK_LEVEL,
  RISK_ACTION,
} from '../../src/risk/RiskSystem.js';

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
// RiskSystem 测试
// ============================================

describe('RiskSystem', () => {
  let system;
  let mockExecutor;

  beforeEach(() => {
    system = new RiskSystem({
      verbose: false,
    });
    mockExecutor = createMockExecutor();
  });

  afterEach(() => {
    if (system) {
      system.stop();
      system.removeAllListeners();
    }
  });

  // ============================================
  // 构造函数测试
  // ============================================

  describe('构造函数', () => {
    it('应该使用默认配置', () => {
      const s = new RiskSystem();

      expect(s.config.enableBlackSwanProtection).toBe(true);
      expect(s.config.enableLiquidityMonitoring).toBe(true);
      expect(s.config.enableMultiAccountRisk).toBe(true);
      expect(s.config.enablePortfolioRisk).toBe(true);
      expect(s.config.verbose).toBe(true);
    });

    it('应该使用自定义配置', () => {
      expect(system.config.verbose).toBe(false);
    });

    it('应该初始化为 INITIALIZING 状态', () => {
      expect(system.status).toBe(SYSTEM_STATUS.INITIALIZING);
    });

    it('应该初始化空模块', () => {
      expect(system.modules.blackSwanProtector).toBeNull();
      expect(system.modules.liquidityMonitor).toBeNull();
      expect(system.modules.multiAccountAggregator).toBeNull();
      expect(system.modules.portfolioRiskManager).toBeNull();
      expect(system.modules.accountRiskManagers.size).toBe(0);
    });

    it('应该初始化空事件历史', () => {
      expect(system.eventHistory).toEqual([]);
    });

    it('应该初始化统计数据', () => {
      expect(system.statistics.totalChecks).toBe(0);
      expect(system.statistics.triggeredEvents).toBe(0);
      expect(system.statistics.blockedOrders).toBe(0);
      expect(system.statistics.emergencyActions).toBe(0);
      expect(system.statistics.startTime).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('init', () => {
    it('应该初始化所有模块', async () => {
      await system.init({
        executor: mockExecutor,
        initialEquity: 100000,
      });

      expect(system.modules.blackSwanProtector).not.toBeNull();
      expect(system.modules.liquidityMonitor).not.toBeNull();
      expect(system.modules.multiAccountAggregator).not.toBeNull();
      expect(system.modules.portfolioRiskManager).not.toBeNull();
    });

    it('应该设置为 RUNNING 状态', async () => {
      await system.init({});

      expect(system.status).toBe(SYSTEM_STATUS.RUNNING);
    });

    it('应该保存执行器引用', async () => {
      await system.init({ executor: mockExecutor });

      expect(system.executor).toBe(mockExecutor);
    });

    it('应该发射 initialized 事件', async () => {
      const listener = vi.fn();
      system.on('initialized', listener);

      await system.init({});

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          modules: expect.any(Object),
          timestamp: expect.any(Number),
        })
      );
    });

    it('禁用模块时不应该初始化', async () => {
      system.config.enableBlackSwanProtection = false;
      system.config.enableLiquidityMonitoring = false;
      system.config.enableMultiAccountRisk = false;
      system.config.enablePortfolioRisk = false;

      await system.init({});

      expect(system.modules.blackSwanProtector).toBeNull();
      expect(system.modules.liquidityMonitor).toBeNull();
      expect(system.modules.multiAccountAggregator).toBeNull();
      expect(system.modules.portfolioRiskManager).toBeNull();
    });
  });

  describe('start', () => {
    beforeEach(async () => {
      await system.init({});
      // After init, status is RUNNING. Set to STOPPED to test start properly
      system.status = SYSTEM_STATUS.STOPPED;
    });

    it('应该发射 started 事件', () => {
      const listener = vi.fn();
      system.on('started', listener);

      system.start();

      expect(listener).toHaveBeenCalled();
    });

    it('应该启动所有模块', () => {
      system.start();

      expect(system.modules.blackSwanProtector.running).toBe(true);
      expect(system.modules.liquidityMonitor.running).toBe(true);
      expect(system.modules.multiAccountAggregator.running).toBe(true);
      expect(system.modules.portfolioRiskManager.running).toBe(true);
    });

    it('重复启动应该跳过', () => {
      system.start();
      const listener = vi.fn();
      system.on('started', listener);

      system.start();

      // Should not emit again since already running
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      await system.init({});
      system.start();
    });

    it('应该发射 stopped 事件', () => {
      const listener = vi.fn();
      system.on('stopped', listener);

      system.stop();

      expect(listener).toHaveBeenCalled();
    });

    it('应该设置为 STOPPED 状态', () => {
      system.stop();

      expect(system.status).toBe(SYSTEM_STATUS.STOPPED);
    });

    it('应该停止所有模块', () => {
      system.stop();

      expect(system.modules.blackSwanProtector.running).toBe(false);
      expect(system.modules.liquidityMonitor.running).toBe(false);
      expect(system.modules.multiAccountAggregator.running).toBe(false);
      expect(system.modules.portfolioRiskManager.running).toBe(false);
    });

    it('重复停止应该无操作', () => {
      system.stop();
      system.stop();

      expect(system.status).toBe(SYSTEM_STATUS.STOPPED);
    });
  });

  // ============================================
  // 模块连接测试
  // ============================================

  describe('_connectModules', () => {
    it('应该连接黑天鹅保护器到组合风控', async () => {
      await system.init({});

      expect(system.modules.blackSwanProtector.portfolioRiskManager).toBe(
        system.modules.portfolioRiskManager
      );
    });
  });

  // ============================================
  // 事件设置测试
  // ============================================

  describe('事件设置', () => {
    beforeEach(async () => {
      await system.init({ executor: mockExecutor });
    });

    describe('_setupBlackSwanEvents', () => {
      it('应该转发 circuitBreakerTriggered 事件', () => {
        const listener = vi.fn();
        system.on('riskEvent', listener);

        system.modules.blackSwanProtector.emit('circuitBreakerTriggered', {
          level: CIRCUIT_BREAKER_LEVEL.LEVEL_1,
          message: 'test',
        });

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'blackSwan',
            type: 'circuitBreaker',
          })
        );
        expect(system.statistics.triggeredEvents).toBe(1);
      });

      it('应该转发 emergencyClose 事件', () => {
        const listener = vi.fn();
        system.on('riskEvent', listener);

        system.modules.blackSwanProtector.emit('emergencyClose', {
          reason: 'test',
        });

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'blackSwan',
            type: 'emergencyClose',
          })
        );
        expect(system.statistics.emergencyActions).toBe(1);
      });

      it('应该转发 recovered 事件', () => {
        const listener = vi.fn();
        system.on('riskEvent', listener);

        system.modules.blackSwanProtector.emit('recovered', {});

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'blackSwan',
            type: 'recovered',
          })
        );
      });
    });

    describe('_setupLiquidityEvents', () => {
      it('应该转发 liquidityWarning 事件', () => {
        const listener = vi.fn();
        system.on('riskEvent', listener);

        system.modules.liquidityMonitor.emit('liquidityWarning', {
          symbol: 'BTC/USDT',
        });

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'liquidity',
            type: 'warning',
          })
        );
      });
    });

    describe('_setupMultiAccountEvents', () => {
      it('应该转发 riskLevelChanged 事件', () => {
        const listener = vi.fn();
        system.on('riskEvent', listener);

        system.modules.multiAccountAggregator.emit('riskLevelChanged', {
          currentLevel: GLOBAL_RISK_LEVEL.HIGH,
        });

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'multiAccount',
            type: 'riskLevelChanged',
          })
        );
      });

      it('应该转发 globalEmergency 事件', () => {
        system.modules.multiAccountAggregator.emit('globalEmergency', {});

        expect(system.statistics.emergencyActions).toBe(1);
      });

      it('应该转发 accountWarning 事件', () => {
        const listener = vi.fn();
        system.on('riskEvent', listener);

        system.modules.multiAccountAggregator.emit('accountWarning', {
          accountId: 'test',
        });

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'multiAccount',
            type: 'accountWarning',
          })
        );
      });
    });

    describe('_setupPortfolioEvents', () => {
      it('应该转发 riskLevelChanged 事件', () => {
        const listener = vi.fn();
        system.on('riskEvent', listener);

        system.modules.portfolioRiskManager.emit('riskLevelChanged', {
          currentLevel: PORTFOLIO_RISK_LEVEL.HIGH,
        });

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'portfolio',
            type: 'riskLevelChanged',
          })
        );
      });

      it('应该转发 emergencyClose 事件', () => {
        system.modules.portfolioRiskManager.emit('emergencyClose', {});

        expect(system.statistics.emergencyActions).toBe(1);
      });

      it('应该转发 tradingPaused 事件', () => {
        const listener = vi.fn();
        system.on('riskEvent', listener);

        system.modules.portfolioRiskManager.emit('tradingPaused', {
          reason: 'test',
        });

        expect(listener).toHaveBeenCalledWith(
          expect.objectContaining({
            module: 'portfolio',
            type: 'tradingPaused',
          })
        );
      });
    });
  });

  // ============================================
  // 数据更新测试
  // ============================================

  describe('updateMarketData', () => {
    beforeEach(async () => {
      await system.init({});
    });

    it('应该更新黑天鹅保护器', () => {
      const spy = vi.spyOn(system.modules.blackSwanProtector, 'updatePrice');

      system.updateMarketData('BTC/USDT', {
        price: 50000,
        volume: 100,
      });

      expect(spy).toHaveBeenCalledWith('BTC/USDT', 50000, 100, undefined);
    });

    it('应该更新流动性监控器订单簿', () => {
      const spy = vi.spyOn(system.modules.liquidityMonitor, 'updateOrderBook');

      const orderBook = {
        bids: [[49900, 10]],
        asks: [[50100, 10]],
      };

      system.updateMarketData('BTC/USDT', { orderBook });

      expect(spy).toHaveBeenCalledWith('BTC/USDT', orderBook);
    });

    it('应该更新流动性监控器成交', () => {
      const spy = vi.spyOn(system.modules.liquidityMonitor, 'updateTrade');

      const trade = { price: 50000, volume: 1 };
      system.updateMarketData('BTC/USDT', { trade });

      expect(spy).toHaveBeenCalledWith('BTC/USDT', trade);
    });
  });

  describe('updateAccountData', () => {
    beforeEach(async () => {
      await system.init({ initialEquity: 100000 });
    });

    it('应该更新跨账户风险汇总器', () => {
      const spy = vi.spyOn(system.modules.multiAccountAggregator, 'updateAccount');

      system.updateAccountData('account1', {
        equity: 50000,
        positionValue: 20000,
      });

      expect(spy).toHaveBeenCalledWith('account1', expect.objectContaining({
        equity: 50000,
        positionValue: 20000,
      }));
    });

    it('应该更新组合风控管理器', () => {
      const spy = vi.spyOn(system.modules.portfolioRiskManager, 'updateStrategyState');

      system.updateAccountData('account1', {
        equity: 50000,
        positionValue: 20000,
        positions: [],
      });

      expect(spy).toHaveBeenCalledWith('account1', expect.objectContaining({
        equity: 50000,
        positionValue: 20000,
        positions: [],
      }));
    });
  });

  describe('registerAccount', () => {
    beforeEach(async () => {
      await system.init({ initialEquity: 100000 });
    });

    it('应该注册到跨账户风险汇总器', () => {
      const spy = vi.spyOn(system.modules.multiAccountAggregator, 'registerAccount');

      system.registerAccount('account1', { exchange: 'binance' });

      expect(spy).toHaveBeenCalledWith('account1', expect.objectContaining({
        exchange: 'binance',
      }));
    });

    it('应该注册到组合风控管理器', () => {
      const spy = vi.spyOn(system.modules.portfolioRiskManager, 'registerStrategy');

      system.registerAccount('account1', {});

      expect(spy).toHaveBeenCalledWith('account1', expect.any(Object));
    });

    it('应该创建账户级别风控管理器', () => {
      system.registerAccount('account1', {});

      expect(system.modules.accountRiskManagers.has('account1')).toBe(true);
    });

    it('应该将账户风控管理器注册到汇总器', () => {
      const spy = vi.spyOn(system.modules.multiAccountAggregator, 'setAccountRiskManager');

      system.registerAccount('account1', {});

      expect(spy).toHaveBeenCalledWith('account1', expect.any(Object));
    });
  });

  // ============================================
  // 订单检查测试
  // ============================================

  describe('checkOrder', () => {
    beforeEach(async () => {
      await system.init({ initialEquity: 100000 });
      system.registerAccount('account1', {});
    });

    it('应该返回检查结果', () => {
      // Setup normal state for black swan
      system.modules.blackSwanProtector.circuitBreakerState.level = CIRCUIT_BREAKER_LEVEL.NORMAL;

      const result = system.checkOrder({
        accountId: 'account1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBeDefined();
      expect(result.reasons).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.checks).toBeDefined();
    });

    it('应该增加检查计数', () => {
      const before = system.statistics.totalChecks;

      system.checkOrder({
        accountId: 'account1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(system.statistics.totalChecks).toBe(before + 1);
    });

    it('熔断状态应该拒绝订单', () => {
      system.modules.blackSwanProtector.circuitBreakerState.level = CIRCUIT_BREAKER_LEVEL.LEVEL_2;
      system.modules.blackSwanProtector.circuitBreakerState.reason = 'test';

      const result = system.checkOrder({
        accountId: 'account1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.allowed).toBe(false);
      expect(result.reasons.some(r => r.includes('熔断'))).toBe(true);
    });

    it('被阻止的订单应该增加计数', () => {
      system.modules.blackSwanProtector.circuitBreakerState.level = CIRCUIT_BREAKER_LEVEL.LEVEL_2;
      system.modules.blackSwanProtector.circuitBreakerState.reason = 'test';

      const before = system.statistics.blockedOrders;

      system.checkOrder({
        accountId: 'account1',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(system.statistics.blockedOrders).toBe(before + 1);
    });
  });

  describe('estimateSlippage', () => {
    it('流动性监控器未启用应该返回错误', () => {
      system.modules.liquidityMonitor = null;

      const result = system.estimateSlippage('BTC/USDT', 'buy', 1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('未启用');
    });

    it('应该调用流动性监控器', async () => {
      await system.init({});

      const spy = vi.spyOn(system.modules.liquidityMonitor, 'estimateSlippage');

      system.estimateSlippage('BTC/USDT', 'buy', 1);

      expect(spy).toHaveBeenCalledWith('BTC/USDT', 'buy', 1);
    });
  });

  describe('getOrderSplitRecommendation', () => {
    it('流动性监控器未启用应该返回错误', () => {
      system.modules.liquidityMonitor = null;

      const result = system.getOrderSplitRecommendation('BTC/USDT', 'buy', 10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('未启用');
    });

    it('应该调用流动性监控器', async () => {
      await system.init({});

      const spy = vi.spyOn(system.modules.liquidityMonitor, 'getOrderSplitRecommendation');

      system.getOrderSplitRecommendation('BTC/USDT', 'buy', 10);

      expect(spy).toHaveBeenCalledWith('BTC/USDT', 'buy', 10);
    });
  });

  // ============================================
  // 紧急操作测试
  // ============================================

  describe('triggerCircuitBreaker', () => {
    it('黑天鹅保护器未启用应该不做操作', async () => {
      system.modules.blackSwanProtector = null;

      await system.triggerCircuitBreaker(CIRCUIT_BREAKER_LEVEL.LEVEL_2, 'test');
      // 不应该抛错
    });

    it('应该调用手动触发', async () => {
      await system.init({ executor: mockExecutor });

      const spy = vi.spyOn(system.modules.blackSwanProtector, 'manualTrigger');

      await system.triggerCircuitBreaker(CIRCUIT_BREAKER_LEVEL.LEVEL_2, 'test');

      expect(spy).toHaveBeenCalledWith(CIRCUIT_BREAKER_LEVEL.LEVEL_2, 'test');
    });
  });

  describe('recoverFromCircuitBreaker', () => {
    it('应该调用手动恢复', async () => {
      await system.init({ executor: mockExecutor });

      const spy = vi.spyOn(system.modules.blackSwanProtector, 'manualRecover');

      system.recoverFromCircuitBreaker();

      expect(spy).toHaveBeenCalled();
    });

    it('黑天鹅保护器未启用应该不做操作', () => {
      system.modules.blackSwanProtector = null;

      system.recoverFromCircuitBreaker();
      // 不应该抛错
    });
  });

  describe('pauseAllTrading', () => {
    beforeEach(async () => {
      await system.init({ initialEquity: 100000 });
    });

    it('应该暂停组合风控交易', () => {
      const spy = vi.spyOn(system.modules.portfolioRiskManager, 'pauseTrading');

      system.pauseAllTrading('test');

      expect(spy).toHaveBeenCalledWith('test');
    });

    it('应该设置跨账户汇总器状态', () => {
      system.pauseAllTrading('test');

      expect(system.modules.multiAccountAggregator.globalState.tradingAllowed).toBe(false);
      expect(system.modules.multiAccountAggregator.globalState.pauseReason).toBe('test');
    });

    it('应该发射 tradingPaused 事件', () => {
      const listener = vi.fn();
      system.on('tradingPaused', listener);

      system.pauseAllTrading('test');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'test' })
      );
    });
  });

  describe('resumeAllTrading', () => {
    beforeEach(async () => {
      await system.init({ initialEquity: 100000 });
      system.pauseAllTrading('test');
    });

    it('应该恢复组合风控交易', () => {
      const spy = vi.spyOn(system.modules.portfolioRiskManager, 'resumeTrading');

      system.resumeAllTrading();

      expect(spy).toHaveBeenCalled();
    });

    it('应该恢复跨账户汇总器交易', () => {
      const spy = vi.spyOn(system.modules.multiAccountAggregator, 'resumeTrading');

      system.resumeAllTrading();

      expect(spy).toHaveBeenCalled();
    });

    it('应该发射 tradingResumed 事件', () => {
      const listener = vi.fn();
      system.on('tradingResumed', listener);

      system.resumeAllTrading();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ timestamp: expect.any(Number) })
      );
    });
  });

  // ============================================
  // 状态和报告测试
  // ============================================

  describe('getModuleStatus', () => {
    it('未初始化时应该返回 null', () => {
      const status = system.getModuleStatus();

      expect(status.blackSwanProtector).toBeNull();
      expect(status.liquidityMonitor).toBeNull();
      expect(status.multiAccountAggregator).toBeNull();
      expect(status.portfolioRiskManager).toBeNull();
    });

    it('初始化后应该返回模块状态', async () => {
      await system.init({});

      const status = system.getModuleStatus();

      expect(status.blackSwanProtector).not.toBeNull();
      expect(status.liquidityMonitor).not.toBeNull();
      expect(status.multiAccountAggregator).not.toBeNull();
      expect(status.portfolioRiskManager).not.toBeNull();
    });
  });

  describe('getRiskReport', () => {
    it('应该返回完整的风险报告', async () => {
      await system.init({});

      const report = system.getRiskReport();

      expect(report.timestamp).toBeDefined();
      expect(report.systemStatus).toBe(SYSTEM_STATUS.RUNNING);
      expect(report.statistics).toBeDefined();
      expect(report.modules).toBeDefined();
      expect(report.recentEvents).toBeDefined();
    });

    it('应该包含统计数据', async () => {
      await system.init({});

      const report = system.getRiskReport();

      expect(report.statistics.totalChecks).toBe(0);
      expect(report.statistics.triggeredEvents).toBe(0);
      expect(report.statistics.blockedOrders).toBe(0);
    });
  });

  describe('getLiquidityScore', () => {
    it('流动性监控器未启用应该返回错误', () => {
      system.modules.liquidityMonitor = null;

      const result = system.getLiquidityScore('BTC/USDT');

      expect(result.error).toContain('未启用');
    });

    it('应该调用流动性监控器', async () => {
      await system.init({});

      const spy = vi.spyOn(system.modules.liquidityMonitor, 'getLiquidityScore');

      system.getLiquidityScore('BTC/USDT');

      expect(spy).toHaveBeenCalledWith('BTC/USDT');
    });
  });

  // ============================================
  // 辅助方法测试
  // ============================================

  describe('_recordEvent', () => {
    it('应该记录事件', () => {
      system._recordEvent('test', 'testType', { message: 'test' });

      expect(system.eventHistory.length).toBe(1);
      expect(system.eventHistory[0].module).toBe('test');
      expect(system.eventHistory[0].type).toBe('testType');
    });

    it('应该限制历史长度', () => {
      for (let i = 0; i < 1100; i++) {
        system._recordEvent('test', 'type', {});
      }

      expect(system.eventHistory.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('log', () => {
    it('verbose=false 时应该跳过 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      system.config.verbose = false;

      system.log('test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 error 日志', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      system.log('error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出 warn 日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      system.log('warn message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// ============================================
// 常量导出测试
// ============================================

describe('RiskSystem Constants', () => {
  describe('SYSTEM_STATUS', () => {
    it('应该包含所有系统状态', () => {
      expect(SYSTEM_STATUS.INITIALIZING).toBe('initializing');
      expect(SYSTEM_STATUS.RUNNING).toBe('running');
      expect(SYSTEM_STATUS.PAUSED).toBe('paused');
      expect(SYSTEM_STATUS.STOPPED).toBe('stopped');
      expect(SYSTEM_STATUS.ERROR).toBe('error');
    });
  });

  describe('导出的常量', () => {
    it('应该导出 CIRCUIT_BREAKER_LEVEL', () => {
      expect(CIRCUIT_BREAKER_LEVEL.NORMAL).toBe('normal');
      expect(CIRCUIT_BREAKER_LEVEL.LEVEL_1).toBe('level_1');
    });

    it('应该导出 BLACK_SWAN_TYPE', () => {
      expect(BLACK_SWAN_TYPE.FLASH_CRASH).toBe('flash_crash');
    });

    it('应该导出 LIQUIDITY_LEVEL', () => {
      expect(LIQUIDITY_LEVEL.EXCELLENT).toBe('excellent');
    });

    it('应该导出 EXECUTION_STRATEGY', () => {
      expect(EXECUTION_STRATEGY.IMMEDIATE).toBe('immediate');
    });

    it('应该导出 ACCOUNT_STATUS', () => {
      expect(ACCOUNT_STATUS.ACTIVE).toBe('active');
    });

    it('应该导出 GLOBAL_RISK_LEVEL', () => {
      expect(GLOBAL_RISK_LEVEL.NORMAL).toBe('normal');
    });

    it('应该导出 PORTFOLIO_RISK_LEVEL', () => {
      expect(PORTFOLIO_RISK_LEVEL.NORMAL).toBe('normal');
    });

    it('应该导出 RISK_ACTION', () => {
      expect(RISK_ACTION.NONE).toBe('none');
    });
  });
});
