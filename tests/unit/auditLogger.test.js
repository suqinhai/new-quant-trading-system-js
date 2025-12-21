/**
 * 审计日志系统测试
 * Audit Logger Tests
 * @module tests/unit/auditLogger.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  AuditLogger,
  AuditEventType,
  AuditLevel,
} from '../../src/logger/AuditLogger.js';

// ============================================
// AuditLogger 测试
// ============================================

describe('AuditLogger', () => {
  let auditLogger;
  const testLogDir = './logs/audit-test';

  beforeEach(() => {
    // 清理测试目录
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testLogDir, file));
      }
    }

    auditLogger = new AuditLogger({
      logDir: testLogDir,
      filePrefix: 'test-audit',
      consoleOutput: false,
      batchSize: 5,
      flushInterval: 100,
      enableIntegrity: true,
    });
  });

  afterEach(async () => {
    await auditLogger.stop();
  });

  // ============================================
  // 基本日志记录测试
  // ============================================

  describe('基本日志记录', () => {
    it('应该记录日志并返回 ID', () => {
      const logId = auditLogger.log(AuditEventType.API_ACCESS, {
        path: '/api/test',
        method: 'GET',
      });

      expect(logId).toBeDefined();
      expect(logId).toMatch(/^\d+-[a-f0-9]+$/);
    });

    it('应该正确记录不同级别的日志', () => {
      const infoId = auditLogger.info(AuditEventType.API_ACCESS, { test: 1 });
      const warnId = auditLogger.warning(AuditEventType.RISK_ALERT, { test: 2 });
      const critId = auditLogger.critical(AuditEventType.ERROR_CRITICAL, { test: 3 });

      expect(infoId).toBeDefined();
      expect(warnId).toBeDefined();
      expect(critId).toBeDefined();
    });

    it('应该发射日志事件', () => {
      const handler = vi.fn();
      auditLogger.on('log', handler);

      auditLogger.log(AuditEventType.API_ACCESS, { test: true });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.API_ACCESS,
          data: { test: true },
        })
      );
    });

    it('应该更新统计信息', () => {
      auditLogger.log(AuditEventType.API_ACCESS, {});
      auditLogger.log(AuditEventType.ORDER_CREATED, {});
      auditLogger.log(AuditEventType.RISK_ALERT, {});

      const stats = auditLogger.getStats();

      expect(stats.totalLogs).toBe(3);
      expect(stats.logsToday).toBe(3);
      expect(stats.lastLogTime).toBeDefined();
    });
  });

  // ============================================
  // 敏感信息脱敏测试
  // ============================================

  describe('敏感信息脱敏', () => {
    it('应该脱敏敏感字段', () => {
      const handler = vi.fn();
      auditLogger.on('log', handler);

      auditLogger.log(AuditEventType.AUTH_SUCCESS, {
        username: 'admin',
        password: 'secret123',
        apiKey: 'sk-12345',
        normalField: 'visible',
      });

      const loggedData = handler.mock.calls[0][0].data;

      expect(loggedData.username).toBe('admin');
      expect(loggedData.password).toBe('***REDACTED***');
      expect(loggedData.apiKey).toBe('***REDACTED***');
      expect(loggedData.normalField).toBe('visible');
    });

    it('应该递归脱敏嵌套对象', () => {
      const handler = vi.fn();
      auditLogger.on('log', handler);

      auditLogger.log(AuditEventType.CONFIG_CHANGE, {
        config: {
          database: {
            password: 'dbpass123',
            host: 'localhost',
          },
        },
      });

      const loggedData = handler.mock.calls[0][0].data;

      expect(loggedData.config.database.password).toBe('***REDACTED***');
      expect(loggedData.config.database.host).toBe('localhost');
    });
  });

  // ============================================
  // 完整性验证测试
  // ============================================

  describe('完整性验证', () => {
    it('应该生成哈希链', () => {
      const handler = vi.fn();
      auditLogger.on('log', handler);

      auditLogger.log(AuditEventType.API_ACCESS, { id: 1 });
      auditLogger.log(AuditEventType.API_ACCESS, { id: 2 });
      auditLogger.log(AuditEventType.API_ACCESS, { id: 3 });

      const logs = handler.mock.calls.map(c => c[0]);

      // 检查哈希链
      expect(logs[0].hash).toBeDefined();
      expect(logs[1].prevHash).toBe(logs[0].hash);
      expect(logs[2].prevHash).toBe(logs[1].hash);
    });
  });

  // ============================================
  // 便捷方法测试
  // ============================================

  describe('便捷方法', () => {
    it('logOrder 应该正确记录订单事件', () => {
      const handler = vi.fn();
      auditLogger.on('log', handler);

      auditLogger.logOrder('created', {
        id: 'order-123',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      const logged = handler.mock.calls[0][0];

      expect(logged.eventType).toBe(AuditEventType.ORDER_CREATED);
      expect(logged.data.orderId).toBe('order-123');
      expect(logged.data.symbol).toBe('BTC/USDT');
    });

    it('logRiskEvent 应该正确记录风控事件', () => {
      const handler = vi.fn();
      auditLogger.on('log', handler);

      auditLogger.logRiskEvent(AuditEventType.RISK_LIMIT_HIT, {
        type: 'dailyLoss',
        limit: 1000,
        current: 1200,
      });

      const logged = handler.mock.calls[0][0];

      expect(logged.eventType).toBe(AuditEventType.RISK_LIMIT_HIT);
      expect(logged.level).toBe(AuditLevel.CRITICAL);
    });
  });

  // ============================================
  // 批量写入测试
  // ============================================

  describe('批量写入', () => {
    it('应该在达到批量大小时刷新', async () => {
      // 设置批量大小为 5
      for (let i = 0; i < 5; i++) {
        auditLogger.log(AuditEventType.API_ACCESS, { index: i });
      }

      // 等待刷新
      await new Promise(r => setTimeout(r, 200));

      // 检查文件是否存在
      const files = fs.readdirSync(testLogDir);
      expect(files.length).toBeGreaterThan(0);

      // 读取并验证内容
      const content = fs.readFileSync(path.join(testLogDir, files[0]), 'utf8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(5);
    });

    it('应该在关键事件时立即刷新', async () => {
      auditLogger.critical(AuditEventType.ERROR_CRITICAL, {
        error: 'Critical error',
      });

      // 等待写入
      await new Promise(r => setTimeout(r, 50));

      const files = fs.readdirSync(testLogDir);
      expect(files.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 默认级别测试
  // ============================================

  describe('默认级别', () => {
    it('认证失败应该是 CRITICAL', () => {
      const handler = vi.fn();
      auditLogger.on('log', handler);

      auditLogger.log(AuditEventType.AUTH_FAILED, {});

      expect(handler.mock.calls[0][0].level).toBe(AuditLevel.CRITICAL);
    });

    it('IP 封禁应该是 WARNING', () => {
      const handler = vi.fn();
      auditLogger.on('log', handler);

      auditLogger.log(AuditEventType.IP_BLOCKED, {});

      expect(handler.mock.calls[0][0].level).toBe(AuditLevel.WARNING);
    });

    it('API 访问应该是 INFO', () => {
      const handler = vi.fn();
      auditLogger.on('log', handler);

      auditLogger.log(AuditEventType.API_ACCESS, {});

      expect(handler.mock.calls[0][0].level).toBe(AuditLevel.INFO);
    });
  });

  // ============================================
  // 停止和清理测试
  // ============================================

  describe('停止和清理', () => {
    it('应该在停止时刷新剩余日志', async () => {
      // 记录一些日志但不触发批量刷新
      auditLogger.log(AuditEventType.API_ACCESS, { test: 1 });
      auditLogger.log(AuditEventType.API_ACCESS, { test: 2 });

      // 停止
      await auditLogger.stop();

      // 检查日志是否被写入
      const files = fs.readdirSync(testLogDir);
      expect(files.length).toBeGreaterThan(0);

      const content = fs.readFileSync(path.join(testLogDir, files[0]), 'utf8');
      expect(content).toContain('test');
    });

    it('应该发射停止事件', async () => {
      const handler = vi.fn();
      auditLogger.on('stopped', handler);

      await auditLogger.stop();

      expect(handler).toHaveBeenCalled();
    });
  });
});

// ============================================
// 事件类型常量测试
// ============================================

describe('AuditEventType', () => {
  it('应该包含所有必需的事件类型', () => {
    expect(AuditEventType.AUTH_SUCCESS).toBe('auth_success');
    expect(AuditEventType.AUTH_FAILED).toBe('auth_failed');
    expect(AuditEventType.API_ACCESS).toBe('api_access');
    expect(AuditEventType.ORDER_CREATED).toBe('order_created');
    expect(AuditEventType.RISK_ALERT).toBe('risk_alert');
    expect(AuditEventType.SYSTEM_START).toBe('system_start');
  });
});

describe('AuditLevel', () => {
  it('应该包含所有级别', () => {
    expect(AuditLevel.INFO).toBe('info');
    expect(AuditLevel.WARNING).toBe('warning');
    expect(AuditLevel.CRITICAL).toBe('critical');
  });
});
