/**
 * AlertManager 单元测试
 * Alert Manager Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AlertManager,
  ALERT_LEVEL,
  ALERT_CATEGORY,
  ALERT_ACTION,
  DEFAULT_CONFIG,
} from '../../src/logger/AlertManager.js';

describe('AlertManager 常量导出', () => {
  it('应该导出 ALERT_LEVEL', () => {
    expect(ALERT_LEVEL.INFO).toBe('info');
    expect(ALERT_LEVEL.WARNING).toBe('warning');
    expect(ALERT_LEVEL.DANGER).toBe('danger');
    expect(ALERT_LEVEL.CRITICAL).toBe('critical');
    expect(ALERT_LEVEL.EMERGENCY).toBe('emergency');
  });

  it('应该导出 ALERT_CATEGORY', () => {
    expect(ALERT_CATEGORY.RISK).toBe('risk');
    expect(ALERT_CATEGORY.POSITION).toBe('position');
    expect(ALERT_CATEGORY.MARGIN).toBe('margin');
    expect(ALERT_CATEGORY.DRAWDOWN).toBe('drawdown');
    expect(ALERT_CATEGORY.CONNECTION).toBe('connection');
    expect(ALERT_CATEGORY.EXECUTION).toBe('execution');
    expect(ALERT_CATEGORY.SYSTEM).toBe('system');
    expect(ALERT_CATEGORY.MARKET).toBe('market');
  });

  it('应该导出 ALERT_ACTION', () => {
    expect(ALERT_ACTION.NOTIFY_ONLY).toBe('notify');
    expect(ALERT_ACTION.LOG_ONLY).toBe('log');
    expect(ALERT_ACTION.PAUSE_TRADING).toBe('pause');
    expect(ALERT_ACTION.REDUCE_POSITION).toBe('reduce');
    expect(ALERT_ACTION.EMERGENCY_CLOSE).toBe('emergency');
  });

  it('应该导出 DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.defaultCooldown).toBe(300000);
    expect(DEFAULT_CONFIG.escalationEnabled).toBe(true);
    expect(DEFAULT_CONFIG.escalationTriggerCount).toBe(3);
    expect(DEFAULT_CONFIG.maxHistorySize).toBe(1000);
  });
});

describe('AlertManager', () => {
  let manager;

  beforeEach(() => {
    manager = new AlertManager({
      verbose: false,
      defaultCooldown: 100,
      cooldownByLevel: {
        [ALERT_LEVEL.INFO]: 200,
        [ALERT_LEVEL.WARNING]: 100,
        [ALERT_LEVEL.DANGER]: 50,
        [ALERT_LEVEL.CRITICAL]: 30,
        [ALERT_LEVEL.EMERGENCY]: 10,
      },
      escalationWindow: 1000,
      escalationTriggerCount: 3,
    });
  });

  afterEach(() => {
    if (manager.running) {
      manager.stop();
    }
    if (manager.checkTimer) {
      clearInterval(manager.checkTimer);
    }
    vi.clearAllMocks();
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(manager.cooldowns).toBeInstanceOf(Map);
      expect(manager.alertCounts).toBeInstanceOf(Map);
      expect(manager.history).toEqual([]);
      expect(manager.activeAlerts).toBeInstanceOf(Map);
      expect(manager.running).toBe(false);
    });

    it('应该合并自定义配置', () => {
      const customManager = new AlertManager({
        defaultCooldown: 60000,
        escalationEnabled: false,
      });
      expect(customManager.config.defaultCooldown).toBe(60000);
      expect(customManager.config.escalationEnabled).toBe(false);
    });

    it('应该初始化统计信息', () => {
      expect(manager.stats.totalAlerts).toBe(0);
      expect(manager.stats.byLevel[ALERT_LEVEL.INFO]).toBe(0);
      expect(manager.stats.escalations).toBe(0);
      expect(manager.stats.suppressed).toBe(0);
    });

    it('应该初始化通知器和数据源', () => {
      expect(manager.notifiers.telegram).toBeNull();
      expect(manager.notifiers.pnlLogger).toBeNull();
      expect(manager.dataSources.riskManager).toBeNull();
      expect(manager.dataSources.positionManager).toBeNull();
    });
  });

  describe('生命周期管理', () => {
    it('应该启动管理器', () => {
      manager.start();
      expect(manager.running).toBe(true);
      expect(manager.checkTimer).not.toBeNull();
    });

    it('应该停止管理器', () => {
      manager.start();
      manager.stop();
      expect(manager.running).toBe(false);
      expect(manager.checkTimer).toBeNull();
    });

    it('应该发出 started 事件', () => {
      const eventSpy = vi.fn();
      manager.on('started', eventSpy);
      manager.start();
      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该发出 stopped 事件', () => {
      const eventSpy = vi.fn();
      manager.on('stopped', eventSpy);
      manager.start();
      manager.stop();
      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('通知器和数据源设置', () => {
    it('应该设置通知器', () => {
      const mockTelegram = { sendAlert: vi.fn() };
      const mockPnlLogger = { logRiskEvent: vi.fn() };

      manager.setNotifiers({
        telegram: mockTelegram,
        pnlLogger: mockPnlLogger,
      });

      expect(manager.notifiers.telegram).toBe(mockTelegram);
      expect(manager.notifiers.pnlLogger).toBe(mockPnlLogger);
    });

    it('应该设置数据源并订阅事件', () => {
      const mockRiskManager = {
        on: vi.fn(),
      };
      const mockPositionManager = {};

      manager.setDataSources({
        riskManager: mockRiskManager,
        positionManager: mockPositionManager,
      });

      expect(manager.dataSources.riskManager).toBe(mockRiskManager);
      expect(manager.dataSources.positionManager).toBe(mockPositionManager);
      expect(mockRiskManager.on).toHaveBeenCalledWith('alert', expect.any(Function));
      expect(mockRiskManager.on).toHaveBeenCalledWith('emergencyClose', expect.any(Function));
      expect(mockRiskManager.on).toHaveBeenCalledWith('tradingPaused', expect.any(Function));
      expect(mockRiskManager.on).toHaveBeenCalledWith('riskTriggered', expect.any(Function));
    });
  });

  describe('核心警报触发', () => {
    it('应该触发警报并返回警报对象', () => {
      const alert = manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试警报',
        message: '这是一个测试',
      });

      expect(alert).not.toBeNull();
      expect(alert.id).toBeDefined();
      expect(alert.category).toBe(ALERT_CATEGORY.RISK);
      expect(alert.level).toBe(ALERT_LEVEL.WARNING);
      expect(alert.title).toBe('测试警报');
      expect(alert.message).toBe('这是一个测试');
    });

    it('应该更新统计信息', () => {
      manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });

      expect(manager.stats.totalAlerts).toBe(1);
      expect(manager.stats.byLevel[ALERT_LEVEL.WARNING]).toBe(1);
      expect(manager.stats.byCategory[ALERT_CATEGORY.RISK]).toBe(1);
    });

    it('应该添加到历史记录', () => {
      manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });

      expect(manager.history.length).toBe(1);
      expect(manager.history[0].title).toBe('测试');
    });

    it('应该添加到活跃警报', () => {
      const alert = manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });

      expect(manager.activeAlerts.has(alert.id)).toBe(true);
    });

    it('应该发出 alert 事件', () => {
      const eventSpy = vi.fn();
      manager.on('alert', eventSpy);

      manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该发出 alertTriggered 事件', () => {
      const eventSpy = vi.fn();
      manager.on('alertTriggered', eventSpy);

      manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该使用默认级别和动作', () => {
      const alert = manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        title: '测试',
        message: '测试',
      });

      expect(alert.level).toBe(ALERT_LEVEL.WARNING);
      expect(alert.action).toBe(ALERT_ACTION.NOTIFY_ONLY);
    });
  });

  describe('警报冷却', () => {
    it('应该在冷却期间抑制警报', async () => {
      // 第一次触发
      const alert1 = manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });
      expect(alert1).not.toBeNull();

      // 立即再次触发，应该被抑制
      const alert2 = manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });
      expect(alert2).toBeNull();

      // 检查抑制计数
      expect(manager.stats.suppressed).toBe(1);
    });

    it('应该在冷却期过后允许触发', async () => {
      // 第一次触发
      manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });

      // 等待冷却期过后
      await new Promise(r => setTimeout(r, 150));

      // 再次触发应该成功
      const alert2 = manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });
      expect(alert2).not.toBeNull();
    });

    it('应该为不同交易对生成不同的警报键', () => {
      const alert1 = manager.triggerAlert({
        category: ALERT_CATEGORY.POSITION,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
        symbol: 'BTC/USDT',
      });

      const alert2 = manager.triggerAlert({
        category: ALERT_CATEGORY.POSITION,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
        symbol: 'ETH/USDT',
      });

      expect(alert1).not.toBeNull();
      expect(alert2).not.toBeNull();
    });
  });

  describe('警报升级', () => {
    it('应该在达到阈值时升级警报', () => {
      // 清除冷却
      manager.cooldowns.clear();

      // 手动添加达到阈值的计数记录（模拟同一个 key 的历史）
      // 阈值是3，所以需要3条记录才能在检查时触发升级
      const testKey = 'risk:warning:BTC';
      manager.alertCounts.set(testKey, [
        { timestamp: Date.now() },
        { timestamp: Date.now() },
        { timestamp: Date.now() },
      ]);

      const alert = manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '升级测试',
        symbol: 'BTC',
      });

      // 应该被升级
      expect(alert.escalated).toBe(true);
      expect(alert.level).toBe(ALERT_LEVEL.DANGER);
      expect(manager.stats.escalations).toBe(1);
    });

    it('应该在禁用升级时不升级', () => {
      manager.config.escalationEnabled = false;

      // 手动设置计数达到阈值
      const testKey = 'risk:warning:BTC';
      manager.alertCounts.set(testKey, [
        { timestamp: Date.now() },
        { timestamp: Date.now() },
        { timestamp: Date.now() },
      ]);

      const alert = manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '3',
        symbol: 'BTC',
      });

      expect(alert.escalated).toBe(false);
      expect(alert.level).toBe(ALERT_LEVEL.WARNING);
    });

    it('应该正确升级各级别', () => {
      expect(manager._escalateLevel(ALERT_LEVEL.INFO)).toBe(ALERT_LEVEL.WARNING);
      expect(manager._escalateLevel(ALERT_LEVEL.WARNING)).toBe(ALERT_LEVEL.DANGER);
      expect(manager._escalateLevel(ALERT_LEVEL.DANGER)).toBe(ALERT_LEVEL.CRITICAL);
      expect(manager._escalateLevel(ALERT_LEVEL.CRITICAL)).toBe(ALERT_LEVEL.EMERGENCY);
      expect(manager._escalateLevel(ALERT_LEVEL.EMERGENCY)).toBe(ALERT_LEVEL.EMERGENCY);
    });
  });

  describe('风控警报处理', () => {
    it('应该处理保证金率警报', () => {
      manager.handleRiskAlert({
        details: {
          type: 'marginRate',
          marginRate: 0.30,
        },
      });

      expect(manager.stats.totalAlerts).toBe(1);
      expect(manager.stats.byCategory[ALERT_CATEGORY.MARGIN]).toBe(1);
    });

    it('应该处理回撤警报', () => {
      manager.handleRiskAlert({
        details: {
          type: 'dailyDrawdown',
          drawdown: 0.06,
        },
      });

      expect(manager.stats.totalAlerts).toBe(1);
      expect(manager.stats.byCategory[ALERT_CATEGORY.DRAWDOWN]).toBe(1);
    });

    it('应该处理仓位集中度警报', () => {
      manager.handleRiskAlert({
        details: {
          type: 'positionConcentration',
          exceededSymbols: [
            { symbol: 'BTC/USDT', ratio: 0.12 },
            { symbol: 'ETH/USDT', ratio: 0.11 },
          ],
        },
      });

      expect(manager.stats.totalAlerts).toBe(2);
    });

    it('应该处理强平风险警报', () => {
      manager.handleRiskAlert({
        details: {
          type: 'liquidationRisk',
          nearLiquidation: [
            { symbol: 'BTC/USDT', distance: 0.05, currentPrice: 50000, liquidationPrice: 47500 },
          ],
        },
      });

      expect(manager.stats.totalAlerts).toBe(1);
    });

    it('应该处理通用风控警报', () => {
      manager.handleRiskAlert({
        message: '未知风控警报',
        details: { type: 'unknown' },
      });

      expect(manager.stats.totalAlerts).toBe(1);
    });
  });

  describe('风控触发处理', () => {
    it('应该处理紧急平仓触发', () => {
      manager.handleRiskTrigger({
        type: 'emergencyClose',
        reason: '回撤超限',
        details: {},
      });

      const history = manager.getHistory();
      expect(history[0].level).toBe(ALERT_LEVEL.EMERGENCY);
    });

    it('应该处理暂停交易触发', () => {
      manager.handleRiskTrigger({
        type: 'pauseTrading',
        reason: '风险过高',
        details: {},
      });

      const history = manager.getHistory();
      expect(history[0].level).toBe(ALERT_LEVEL.DANGER);
    });

    it('应该处理减仓触发', () => {
      manager.handleRiskTrigger({
        type: 'reduceAltcoins',
        reason: '山寨币风险',
        details: {},
      });

      const history = manager.getHistory();
      expect(history[0].level).toBe(ALERT_LEVEL.CRITICAL);
    });
  });

  describe('连接警报', () => {
    it('应该触发断开连接警报', () => {
      manager.triggerDisconnectAlert('binance', 'Network error');

      expect(manager.stats.totalAlerts).toBe(1);
      expect(manager.stats.byCategory[ALERT_CATEGORY.CONNECTION]).toBe(1);
    });

    it('应该触发连接恢复通知', () => {
      manager.triggerReconnectNotification('binance');

      expect(manager.stats.totalAlerts).toBe(1);
      const history = manager.getHistory();
      expect(history[0].level).toBe(ALERT_LEVEL.INFO);
    });
  });

  describe('执行警报', () => {
    it('应该触发订单失败警报', () => {
      manager.triggerOrderFailedAlert(
        { symbol: 'BTC/USDT', side: 'buy', exchangeId: 'binance' },
        new Error('Insufficient balance')
      );

      expect(manager.stats.totalAlerts).toBe(1);
      expect(manager.stats.byCategory[ALERT_CATEGORY.EXECUTION]).toBe(1);
    });

    it('应该触发紧急平仓完成警报', () => {
      manager.triggerEmergencyCloseCompletedAlert({
        closedCount: 5,
        totalPnL: -100,
      });

      expect(manager.stats.totalAlerts).toBe(1);
    });
  });

  describe('通知发送', () => {
    it('应该发送 PnL 日志通知', () => {
      const mockPnlLogger = { logRiskEvent: vi.fn() };
      manager.setNotifiers({ pnlLogger: mockPnlLogger });

      manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });

      expect(mockPnlLogger.logRiskEvent).toHaveBeenCalled();
    });

    it('应该在紧急级别时发送 Telegram 通知', () => {
      const mockTelegram = { sendAlert: vi.fn() };
      manager.setNotifiers({ telegram: mockTelegram });

      manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.EMERGENCY,
        title: '紧急',
        message: '紧急测试',
      });

      expect(mockTelegram.sendAlert).toHaveBeenCalled();
    });
  });

  describe('查询方法', () => {
    beforeEach(() => {
      // 清除冷却以允许相同键的多次触发
      manager.cooldowns.clear();

      // 使用不同的 symbol 使警报有不同的 key
      manager.triggerAlert({ category: ALERT_CATEGORY.RISK, level: ALERT_LEVEL.WARNING, title: '警报1', message: 'm1', symbol: 'BTC' });
      manager.cooldowns.clear();
      manager.triggerAlert({ category: ALERT_CATEGORY.MARGIN, level: ALERT_LEVEL.DANGER, title: '警报2', message: 'm2', symbol: 'ETH' });
      manager.cooldowns.clear();
      manager.triggerAlert({ category: ALERT_CATEGORY.RISK, level: ALERT_LEVEL.WARNING, title: '警报3', message: 'm3', symbol: 'SOL' });
    });

    describe('getActiveAlerts', () => {
      it('应该返回所有活跃警报', () => {
        const alerts = manager.getActiveAlerts();
        expect(alerts.length).toBe(3);
      });

      it('应该按级别过滤', () => {
        const alerts = manager.getActiveAlerts({ level: ALERT_LEVEL.DANGER });
        expect(alerts.length).toBe(1);
        expect(alerts[0].title).toBe('警报2');
      });

      it('应该按类别过滤', () => {
        const alerts = manager.getActiveAlerts({ category: ALERT_CATEGORY.RISK });
        expect(alerts.length).toBe(2);
      });
    });

    describe('getHistory', () => {
      it('应该返回历史记录', () => {
        const history = manager.getHistory();
        expect(history.length).toBe(3);
      });

      it('应该按级别过滤', () => {
        const history = manager.getHistory({ level: ALERT_LEVEL.DANGER });
        expect(history.length).toBe(1);
      });

      it('应该按类别过滤', () => {
        const history = manager.getHistory({ category: ALERT_CATEGORY.MARGIN });
        expect(history.length).toBe(1);
      });

      it('应该限制数量', () => {
        const history = manager.getHistory({ limit: 2 });
        expect(history.length).toBe(2);
      });

      it('应该按时间排序 (最新优先)', () => {
        const history = manager.getHistory();
        // 由于时间戳可能相同,只检查排序是降序的
        for (let i = 0; i < history.length - 1; i++) {
          expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i + 1].timestamp);
        }
      });
    });

    describe('getStats', () => {
      it('应该返回完整统计信息', () => {
        const stats = manager.getStats();

        expect(stats.totalAlerts).toBe(3);
        expect(stats.byLevel[ALERT_LEVEL.WARNING]).toBe(2);
        expect(stats.byLevel[ALERT_LEVEL.DANGER]).toBe(1);
        expect(stats.activeAlertsCount).toBe(3);
        expect(stats.historyCount).toBe(3);
        expect(stats.running).toBe(false);
      });
    });
  });

  describe('警报清除', () => {
    it('应该清除指定警报', () => {
      const alert = manager.triggerAlert({
        category: ALERT_CATEGORY.RISK,
        level: ALERT_LEVEL.WARNING,
        title: '测试',
        message: '测试',
      });

      expect(manager.activeAlerts.has(alert.id)).toBe(true);

      const result = manager.clearAlert(alert.id);

      expect(result).toBe(true);
      expect(manager.activeAlerts.has(alert.id)).toBe(false);
    });

    it('应该清除所有活跃警报', () => {
      // 使用不同的 symbol 避免冷却
      manager.triggerAlert({ category: ALERT_CATEGORY.RISK, level: ALERT_LEVEL.WARNING, title: '1', message: '1', symbol: 'BTC' });
      manager.triggerAlert({ category: ALERT_CATEGORY.RISK, level: ALERT_LEVEL.WARNING, title: '2', message: '2', symbol: 'ETH' });

      expect(manager.activeAlerts.size).toBe(2);

      manager.clearAllAlerts();

      expect(manager.activeAlerts.size).toBe(0);
    });
  });

  describe('清理功能', () => {
    it('应该清理过期冷却', () => {
      manager.cooldowns.set('test:key', Date.now() - 1000000);

      manager._cleanup();

      expect(manager.cooldowns.has('test:key')).toBe(false);
    });

    it('应该清理过期警报计数', () => {
      manager.alertCounts.set('test:key', [{ timestamp: Date.now() - 1000000 }]);

      manager._cleanup();

      expect(manager.alertCounts.has('test:key')).toBe(false);
    });

    it('应该限制历史大小', () => {
      manager.config.maxHistorySize = 5;

      // 使用不同的 symbol 避免冷却
      for (let i = 0; i < 10; i++) {
        manager.triggerAlert({
          category: ALERT_CATEGORY.RISK,
          level: ALERT_LEVEL.WARNING,
          title: `测试${i}`,
          message: `消息${i}`,
          symbol: `SYM${i}`,  // 每次使用不同 symbol
        });
      }

      expect(manager.history.length).toBe(5);
    });
  });

  describe('日志功能', () => {
    it('应该在 verbose 模式下输出日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      manager.config.verbose = true;

      manager.log('Test message', 'info');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该在非 verbose 模式下不输出 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      manager.config.verbose = false;

      manager.log('Test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出错误日志', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      manager.log('Error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出警告日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      manager.log('Warning message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('事件', () => {
    it('应该继承 EventEmitter', () => {
      expect(typeof manager.on).toBe('function');
      expect(typeof manager.emit).toBe('function');
      expect(typeof manager.removeListener).toBe('function');
    });
  });
});

describe('AlertManager 通知器集成', () => {
  let manager;
  let mockTelegram;

  beforeEach(() => {
    manager = new AlertManager({ verbose: false });
    mockTelegram = {
      sendMarginRateAlert: vi.fn(),
      sendDrawdownAlert: vi.fn(),
      sendDisconnectAlert: vi.fn(),
      sendLiquidationWarning: vi.fn(),
      sendAlert: vi.fn(),
    };
    manager.setNotifiers({ telegram: mockTelegram });
  });

  afterEach(() => {
    if (manager.checkTimer) {
      clearInterval(manager.checkTimer);
    }
  });

  it('应该发送保证金率警报到 Telegram', () => {
    manager.handleRiskAlert({
      details: {
        type: 'marginRate',
        marginRate: 0.30,
        threshold: 0.50,
      },
    });

    expect(mockTelegram.sendMarginRateAlert).toHaveBeenCalledWith(
      0.30,
      0.50,
      expect.any(Object)
    );
  });

  it('应该发送回撤警报到 Telegram', () => {
    manager.handleRiskAlert({
      details: {
        type: 'dailyDrawdown',
        drawdown: 0.06,
        threshold: 0.05,
      },
    });

    expect(mockTelegram.sendDrawdownAlert).toHaveBeenCalledWith(
      0.06,
      0.05,
      expect.any(Object)
    );
  });

  it('应该发送断开连接警报到 Telegram', () => {
    manager.triggerDisconnectAlert('binance', 'Network error');

    expect(mockTelegram.sendDisconnectAlert).toHaveBeenCalledWith(
      'binance',
      'Network error'
    );
  });

  it('应该发送强平警告到 Telegram', () => {
    manager.handleRiskAlert({
      details: {
        type: 'liquidationRisk',
        nearLiquidation: [
          { symbol: 'BTC/USDT', distance: 0.05, currentPrice: 50000, liquidationPrice: 47500 },
        ],
      },
    });

    expect(mockTelegram.sendLiquidationWarning).toHaveBeenCalledWith(
      'BTC/USDT',
      50000,
      47500,
      0.05
    );
  });
});

describe('AlertManager 风控管理器集成', () => {
  let manager;

  beforeEach(() => {
    manager = new AlertManager({ verbose: false });
  });

  afterEach(() => {
    if (manager.checkTimer) {
      clearInterval(manager.checkTimer);
    }
  });

  it('应该响应风控 alert 事件', () => {
    const eventHandlers = {};
    const mockRiskManager = {
      on: vi.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
    };

    manager.setDataSources({ riskManager: mockRiskManager });

    // 模拟风控警报事件
    eventHandlers.alert({ details: { type: 'marginRate', marginRate: 0.35 } });

    expect(manager.stats.totalAlerts).toBe(1);
  });

  it('应该响应 emergencyClose 事件', () => {
    const eventHandlers = {};
    const mockRiskManager = {
      on: vi.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
    };

    manager.setDataSources({ riskManager: mockRiskManager });

    eventHandlers.emergencyClose({ reason: '回撤超限' });

    expect(manager.stats.totalAlerts).toBe(1);
    const history = manager.getHistory();
    expect(history[0].level).toBe(ALERT_LEVEL.EMERGENCY);
  });

  it('应该响应 tradingPaused 事件', () => {
    const eventHandlers = {};
    const mockRiskManager = {
      on: vi.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
    };

    manager.setDataSources({ riskManager: mockRiskManager });

    eventHandlers.tradingPaused({ reason: '风险过高' });

    expect(manager.stats.totalAlerts).toBe(1);
    const history = manager.getHistory();
    expect(history[0].level).toBe(ALERT_LEVEL.DANGER);
  });

  it('应该响应 riskTriggered 事件', () => {
    const eventHandlers = {};
    const mockRiskManager = {
      on: vi.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
    };

    manager.setDataSources({ riskManager: mockRiskManager });

    eventHandlers.riskTriggered({ type: 'emergencyClose', reason: '测试' });

    expect(manager.stats.totalAlerts).toBe(1);
  });
});
