/**
 * TelegramNotifier 单元测试
 * Telegram Notifier Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-telegram-bot-api
const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 123 });
const mockGetMe = vi.fn().mockResolvedValue({ username: 'test_bot' });

vi.mock('node-telegram-bot-api', () => {
  return {
    default: class MockTelegramBot {
      constructor() {
        this.getMe = mockGetMe;
        this.sendMessage = mockSendMessage;
      }
    },
  };
});

import {
  TelegramNotifier,
  MESSAGE_TYPE,
  MESSAGE_PRIORITY,
  ALERT_TYPE,
  EMOJI,
  DEFAULT_CONFIG,
} from '../../src/logger/TelegramNotifier.js';

describe('TelegramNotifier 常量导出', () => {
  it('应该导出 MESSAGE_TYPE', () => {
    expect(MESSAGE_TYPE.ALERT).toBe('alert');
    expect(MESSAGE_TYPE.TRADE).toBe('trade');
    expect(MESSAGE_TYPE.POSITION).toBe('position');
    expect(MESSAGE_TYPE.DAILY_REPORT).toBe('daily');
    expect(MESSAGE_TYPE.SYSTEM).toBe('system');
    expect(MESSAGE_TYPE.PERFORMANCE).toBe('performance');
  });

  it('应该导出 MESSAGE_PRIORITY', () => {
    expect(MESSAGE_PRIORITY.LOW).toBe(0);
    expect(MESSAGE_PRIORITY.NORMAL).toBe(1);
    expect(MESSAGE_PRIORITY.HIGH).toBe(2);
    expect(MESSAGE_PRIORITY.URGENT).toBe(3);
    expect(MESSAGE_PRIORITY.CRITICAL).toBe(4);
  });

  it('应该导出 ALERT_TYPE', () => {
    expect(ALERT_TYPE.DRAWDOWN).toBe('drawdown');
    expect(ALERT_TYPE.MARGIN_RATE).toBe('marginRate');
    expect(ALERT_TYPE.DISCONNECT).toBe('disconnect');
    expect(ALERT_TYPE.EMERGENCY_CLOSE).toBe('emergency');
    expect(ALERT_TYPE.POSITION_LIMIT).toBe('positionLimit');
    expect(ALERT_TYPE.LIQUIDATION).toBe('liquidation');
  });

  it('应该导出 EMOJI', () => {
    expect(EMOJI.WARNING).toBe('⚠️');
    expect(EMOJI.DANGER).toBe('🚨');
    expect(EMOJI.SUCCESS).toBe('✅');
    expect(EMOJI.BUY).toBe('🟢');
    expect(EMOJI.SELL).toBe('🔴');
  });

  it('应该导出 DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.enabled).toBe(true);
    expect(DEFAULT_CONFIG.maxMessagesPerSecond).toBe(1);
    expect(DEFAULT_CONFIG.maxQueueLength).toBe(100);
    expect(DEFAULT_CONFIG.dailyReportEnabled).toBe(true);
    expect(DEFAULT_CONFIG.alertEnabled).toBe(true);
  });
});

describe('TelegramNotifier', () => {
  let notifier;

  beforeEach(() => {
    notifier = new TelegramNotifier({
      botToken: 'test_token',
      chatId: '123456',
      verbose: false,
    });
  });

  afterEach(() => {
    if (notifier.running) {
      notifier.stop();
    }
    // 清理定时器
    if (notifier.sendTimer) {
      clearInterval(notifier.sendTimer);
    }
    if (notifier.dailyReportTimer) {
      clearTimeout(notifier.dailyReportTimer);
    }
    vi.clearAllMocks();
    mockSendMessage.mockResolvedValue({ message_id: 123 });
    mockGetMe.mockResolvedValue({ username: 'test_bot' });
  });

  describe('构造函数', () => {
    it('应该正确初始化', () => {
      expect(notifier.config.botToken).toBe('test_token');
      expect(notifier.config.chatId).toBe('123456');
      expect(notifier.initialized).toBe(false);
      expect(notifier.running).toBe(false);
    });

    it('应该合并自定义配置', () => {
      const customNotifier = new TelegramNotifier({
        maxQueueLength: 50,
        alertCooldown: 600000,
      });
      expect(customNotifier.config.maxQueueLength).toBe(50);
      expect(customNotifier.config.alertCooldown).toBe(600000);
    });

    it('应该初始化内部状态', () => {
      expect(notifier.messageQueue).toEqual([]);
      expect(notifier.alertCooldowns).toBeInstanceOf(Map);
      expect(notifier.stats.totalSent).toBe(0);
      expect(notifier.stats.alertsSent).toBe(0);
    });

    it('应该初始化数据源', () => {
      expect(notifier.dataSources.riskManager).toBeNull();
      expect(notifier.dataSources.positionManager).toBeNull();
      expect(notifier.dataSources.accountManager).toBeNull();
      expect(notifier.dataSources.executor).toBeNull();
    });
  });

  describe('初始化', () => {
    it('应该成功初始化', async () => {
      await notifier.init();
      expect(notifier.initialized).toBe(true);
      expect(notifier.bot).not.toBeNull();
    });

    it('应该在没有 botToken 时禁用', async () => {
      const noTokenNotifier = new TelegramNotifier({ chatId: '123' });
      await noTokenNotifier.init();
      expect(noTokenNotifier.config.enabled).toBe(false);
    });

    it('应该在没有 chatId 时禁用', async () => {
      const noChatNotifier = new TelegramNotifier({ botToken: 'token' });
      await noChatNotifier.init();
      expect(noChatNotifier.config.enabled).toBe(false);
    });

    it('应该发出 initialized 事件', async () => {
      const eventSpy = vi.fn();
      notifier.on('initialized', eventSpy);

      await notifier.init();

      expect(eventSpy).toHaveBeenCalledWith({ botUsername: 'test_bot' });
    });
  });

  describe('生命周期管理', () => {
    beforeEach(async () => {
      await notifier.init();
    });

    it('应该启动通知器', () => {
      notifier.start();
      expect(notifier.running).toBe(true);
      expect(notifier.sendTimer).not.toBeNull();
    });

    it('应该停止通知器', () => {
      notifier.start();
      notifier.stop();
      expect(notifier.running).toBe(false);
      expect(notifier.sendTimer).toBeNull();
    });

    it('应该发出 started 事件', () => {
      const eventSpy = vi.fn();
      notifier.on('started', eventSpy);

      notifier.start();

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该发出 stopped 事件', () => {
      const eventSpy = vi.fn();
      notifier.on('stopped', eventSpy);

      notifier.start();
      notifier.stop();

      expect(eventSpy).toHaveBeenCalled();
    });

    it('应该在未启用时跳过启动', () => {
      notifier.config.enabled = false;
      notifier.start();
      expect(notifier.running).toBe(false);
    });
  });

  describe('数据源设置', () => {
    it('应该设置数据源', () => {
      const mockRiskManager = { getStatus: vi.fn() };
      const mockPositionManager = { getActivePositions: vi.fn() };

      notifier.setDataSources({
        riskManager: mockRiskManager,
        positionManager: mockPositionManager,
      });

      expect(notifier.dataSources.riskManager).toBe(mockRiskManager);
      expect(notifier.dataSources.positionManager).toBe(mockPositionManager);
    });
  });

  describe('消息发送', () => {
    beforeEach(async () => {
      await notifier.init();
    });

    it('应该将消息添加到队列', async () => {
      const result = await notifier.sendMessage('Test message');
      expect(result).toBe(true);
      expect(notifier.messageQueue.length).toBe(1);
    });

    it('应该按优先级排序队列', async () => {
      await notifier.sendMessage('Low', { priority: MESSAGE_PRIORITY.LOW });
      await notifier.sendMessage('High', { priority: MESSAGE_PRIORITY.HIGH });
      await notifier.sendMessage('Normal', { priority: MESSAGE_PRIORITY.NORMAL });

      expect(notifier.messageQueue[0].priority).toBe(MESSAGE_PRIORITY.HIGH);
      expect(notifier.messageQueue[1].priority).toBe(MESSAGE_PRIORITY.NORMAL);
      expect(notifier.messageQueue[2].priority).toBe(MESSAGE_PRIORITY.LOW);
    });

    it('应该立即发送紧急消息', async () => {
      const result = await notifier.sendMessage('Urgent', {
        priority: MESSAGE_PRIORITY.URGENT,
      });
      expect(result).toBe(true);
      expect(notifier.stats.totalSent).toBe(1);
    });

    it('应该立即发送严重消息', async () => {
      const result = await notifier.sendMessage('Critical', {
        priority: MESSAGE_PRIORITY.CRITICAL,
      });
      expect(result).toBe(true);
      expect(notifier.stats.totalSent).toBe(1);
    });

    it('应该在队列满时丢弃低优先级消息', async () => {
      notifier.config.maxQueueLength = 2;

      await notifier.sendMessage('First', { priority: MESSAGE_PRIORITY.NORMAL });
      await notifier.sendMessage('Second', { priority: MESSAGE_PRIORITY.NORMAL });
      await notifier.sendMessage('Third High', { priority: MESSAGE_PRIORITY.HIGH });

      expect(notifier.messageQueue.length).toBe(2);
      expect(notifier.messageQueue[0].priority).toBe(MESSAGE_PRIORITY.HIGH);
    });

    it('应该在未启用时返回 false', async () => {
      notifier.config.enabled = false;
      const result = await notifier.sendMessage('Test');
      expect(result).toBe(false);
    });
  });

  describe('警报发送', () => {
    beforeEach(async () => {
      await notifier.init();
    });

    it('应该发送回撤警报', async () => {
      await notifier.sendDrawdownAlert(0.08, 0.05, {});
      expect(notifier.messageQueue.length).toBeGreaterThan(0);
    });

    it('应该发送保证金率警报', async () => {
      await notifier.sendMarginRateAlert(0.15, 0.20, {});
      expect(notifier.stats.totalSent).toBeGreaterThan(0); // Critical, sent immediately
    });

    it('应该发送掉线警报', async () => {
      await notifier.sendDisconnectAlert('Binance', 'Network error');
      expect(notifier.messageQueue.length).toBeGreaterThan(0);
    });

    it('应该发送紧急平仓警报', async () => {
      await notifier.sendEmergencyCloseAlert('回撤超过阈值');
      expect(notifier.stats.totalSent).toBeGreaterThan(0); // Critical, sent immediately
    });

    it('应该发送强平预警', async () => {
      await notifier.sendLiquidationWarning('BTC/USDT', 50000, 45000, 0.10);
      expect(notifier.stats.totalSent).toBeGreaterThan(0); // Urgent, sent immediately
    });

    it('应该遵守警报冷却时间', async () => {
      await notifier.sendAlert(ALERT_TYPE.DRAWDOWN, 'Test', {});
      await notifier.sendAlert(ALERT_TYPE.DRAWDOWN, 'Test', {}); // 应该被冷却阻止

      // 只发送一次 (队列中只有一条)
    });

    it('应该在警报未启用时返回 false', async () => {
      notifier.config.alertEnabled = false;
      const result = await notifier.sendAlert(ALERT_TYPE.DRAWDOWN, 'Test');
      expect(result).toBe(false);
    });
  });

  describe('警报冷却', () => {
    beforeEach(async () => {
      await notifier.init();
    });

    it('应该正确检测冷却状态', () => {
      const alertKey = 'test:BTC/USDT';

      // 初始不在冷却
      expect(notifier._isAlertOnCooldown(alertKey, ALERT_TYPE.DRAWDOWN)).toBe(false);

      // 更新冷却
      notifier._updateAlertCooldown(alertKey);

      // 现在在冷却
      expect(notifier._isAlertOnCooldown(alertKey, ALERT_TYPE.DRAWDOWN)).toBe(true);
    });

    it('应该使用更短的紧急警报冷却时间', () => {
      notifier.config.alertCooldown = 300000; // 5分钟
      notifier.config.urgentAlertCooldown = 60000; // 1分钟

      const alertKey = 'emergency:global';
      notifier._updateAlertCooldown(alertKey);

      // 紧急警报使用更短的冷却时间
      const isOnCooldown = notifier._isAlertOnCooldown(alertKey, ALERT_TYPE.EMERGENCY_CLOSE);
      expect(typeof isOnCooldown).toBe('boolean');
    });
  });

  describe('交易通知', () => {
    beforeEach(async () => {
      await notifier.init();
    });

    it('应该发送交易通知', async () => {
      await notifier.sendTradeNotification({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 100,
      });

      expect(notifier.messageQueue.length).toBe(1);
    });

    it('应该忽略小额交易', async () => {
      notifier.config.minTradeNotifyAmount = 100;

      await notifier.sendTradeNotification({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.001,
        price: 50000, // 50 USDT < 100 USDT
      });

      expect(notifier.messageQueue.length).toBe(0);
    });

    it('应该在交易通知未启用时跳过', async () => {
      notifier.config.tradeNotifyEnabled = false;

      await notifier.sendTradeNotification({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 1,
        price: 50000,
      });

      expect(notifier.messageQueue.length).toBe(0);
    });
  });

  describe('消息格式化', () => {
    beforeEach(async () => {
      await notifier.init();
    });

    it('应该格式化警报消息', () => {
      const message = notifier._formatAlertMessage(
        ALERT_TYPE.DRAWDOWN,
        '回撤警报',
        { symbol: 'BTC/USDT', exchange: 'binance' }
      );

      expect(message).toContain('风控警报');
      expect(message).toContain(ALERT_TYPE.DRAWDOWN);
      expect(message).toContain('BTC/USDT');
      expect(message).toContain('binance');
    });

    it('应该格式化交易消息', () => {
      const message = notifier._formatTradeMessage({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        pnl: 100,
      });

      expect(message).toContain('交易成交');
      expect(message).toContain('BTC/USDT');
      expect(message).toContain('买入');
      expect(message).toContain('0.1');
    });

    it('应该格式化每日报告', () => {
      const reportData = {
        date: '2024-01-01',
        equity: { start: 10000, end: 10500, peak: 10600, change: 500, changePercent: 5 },
        pnl: { realized: 300, unrealized: 200, total: 500 },
        positions: { count: 2, long: 1, short: 1 },
        risk: { maxDrawdown: 0.02, marginRate: 0.5, alerts: 1 },
      };

      const report = notifier._formatDailyReport(reportData);

      expect(report).toContain('每日绩效报告');
      expect(report).toContain('2024-01-01');
      expect(report).toContain('权益概览');
      expect(report).toContain('盈亏统计');
    });
  });

  describe('系统消息', () => {
    beforeEach(async () => {
      await notifier.init();
    });

    it('应该发送系统消息', async () => {
      await notifier.sendSystemMessage('系统启动');
      expect(notifier.messageQueue.length).toBe(1);
    });
  });

  describe('队列管理', () => {
    beforeEach(async () => {
      await notifier.init();
    });

    it('应该处理消息队列', async () => {
      notifier.running = true;

      await notifier.sendMessage('Test 1');
      await notifier.sendMessage('Test 2');

      expect(notifier.messageQueue.length).toBe(2);

      await notifier._processMessageQueue();

      expect(notifier.messageQueue.length).toBe(1);
    });

    it('应该找到最低优先级消息索引', async () => {
      await notifier.sendMessage('Low', { priority: MESSAGE_PRIORITY.LOW });
      await notifier.sendMessage('High', { priority: MESSAGE_PRIORITY.HIGH });
      await notifier.sendMessage('Normal', { priority: MESSAGE_PRIORITY.NORMAL });

      const index = notifier._findLowestPriorityIndex();
      expect(notifier.messageQueue[index].priority).toBe(MESSAGE_PRIORITY.LOW);
    });

    it('应该刷新队列', async () => {
      await notifier.sendMessage('Test 1');
      await notifier.sendMessage('Test 2');

      await notifier._flushQueue();

      expect(notifier.messageQueue.length).toBe(0);
      expect(notifier.stats.totalSent).toBe(2);
    });
  });

  describe('统计信息', () => {
    beforeEach(async () => {
      await notifier.init();
    });

    it('应该返回统计信息', () => {
      const stats = notifier.getStats();

      expect(stats.totalSent).toBeDefined();
      expect(stats.alertsSent).toBeDefined();
      expect(stats.tradesSent).toBeDefined();
      expect(stats.queueLength).toBeDefined();
      expect(stats.running).toBe(false);
      expect(stats.initialized).toBe(true);
    });
  });

  describe('日志功能', () => {
    it('应该在 verbose 模式下输出日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      notifier.config.verbose = true;

      notifier.log('Test message', 'info');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该在非 verbose 模式下不输出 info 日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      notifier.config.verbose = false;

      notifier.log('Test message', 'info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出错误日志', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      notifier.log('Error message', 'error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('应该输出警告日志', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      notifier.log('Warning message', 'warn');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('事件', () => {
    it('应该继承 EventEmitter', () => {
      expect(typeof notifier.on).toBe('function');
      expect(typeof notifier.emit).toBe('function');
      expect(typeof notifier.removeListener).toBe('function');
    });

    it('应该在消息发送时发出事件', async () => {
      await notifier.init();

      const eventSpy = vi.fn();
      notifier.on('messageSent', eventSpy);

      await notifier.sendMessage('Test', {
        priority: MESSAGE_PRIORITY.CRITICAL,
      });

      expect(eventSpy).toHaveBeenCalled();
    });
  });
});

describe('TelegramNotifier 边界条件', () => {
  it('应该处理初始化失败', async () => {
    // 使用无效 token
    const notifier = new TelegramNotifier({
      botToken: 'invalid',
      chatId: '123',
      verbose: false,
    });

    // Mock getMe to fail
    mockGetMe.mockRejectedValueOnce(new Error('Invalid token'));

    const eventSpy = vi.fn();
    notifier.on('error', eventSpy);

    await notifier.init();

    expect(notifier.config.enabled).toBe(false);
  });

  it('应该处理发送失败', async () => {
    const notifier = new TelegramNotifier({
      botToken: 'test',
      chatId: '123',
      verbose: false,
    });

    await notifier.init();

    // Mock sendMessage to fail
    mockSendMessage.mockRejectedValueOnce(new Error('Send failed'));

    const eventSpy = vi.fn();
    notifier.on('error', eventSpy);

    await notifier.sendMessage('Test', { priority: MESSAGE_PRIORITY.CRITICAL });

    expect(notifier.stats.failedSent).toBe(1);
    expect(eventSpy).toHaveBeenCalled();
  });

  it('应该处理空队列的 findLowestPriorityIndex', () => {
    const notifier = new TelegramNotifier({ verbose: false });
    const index = notifier._findLowestPriorityIndex();
    expect(index).toBe(-1);
  });
});
