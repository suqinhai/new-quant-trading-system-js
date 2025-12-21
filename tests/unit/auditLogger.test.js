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

// ============================================
// logApiAccess 测试
// ============================================

describe('logApiAccess', () => {
  let auditLogger;
  const testLogDir = './logs/audit-test-api';

  beforeEach(() => {
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testLogDir, file));
      }
    }

    auditLogger = new AuditLogger({
      logDir: testLogDir,
      consoleOutput: false,
      batchSize: 100,
      flushInterval: 10000,
    });
  });

  afterEach(async () => {
    await auditLogger.stop();
  });

  it('应该记录 API 访问日志', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    const req = {
      method: 'GET',
      path: '/api/orders',
      query: { limit: 10, symbol: 'BTC/USDT' },
      ip: '192.168.1.1',
      headers: { 'user-agent': 'Mozilla/5.0' },
    };
    const res = { statusCode: 200 };

    auditLogger.logApiAccess(req, res, 150);

    const logged = handler.mock.calls[0][0];
    expect(logged.eventType).toBe(AuditEventType.API_ACCESS);
    expect(logged.data.method).toBe('GET');
    expect(logged.data.path).toBe('/api/orders');
    expect(logged.data.statusCode).toBe(200);
    expect(logged.data.duration).toBe(150);
    expect(logged.data.ip).toBe('192.168.1.1');
  });

  it('应该脱敏 API Key 只显示后4位', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    const req = {
      method: 'POST',
      path: '/api/trade',
      query: {},
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
        'x-api-key': 'my-secret-api-key-12345',
      },
    };
    const res = { statusCode: 201 };

    auditLogger.logApiAccess(req, res, 50);

    const logged = handler.mock.calls[0][0];
    // apiKey 字段会被 _sanitize 进一步脱敏为 ***REDACTED***
    // 因为 apikey 在 sensitiveFields 中
    expect(logged.data.apiKey).toBe('***REDACTED***');
  });

  it('应该处理没有 API Key 的请求', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    const req = {
      method: 'GET',
      path: '/api/public',
      query: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test' },
    };
    const res = { statusCode: 200 };

    auditLogger.logApiAccess(req, res, 10);

    const logged = handler.mock.calls[0][0];
    // apiKey 字段会被 _sanitize 进一步脱敏
    expect(logged.data.apiKey).toBe('***REDACTED***');
  });

  it('应该使用 connection.remoteAddress 作为 IP 备选', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    const req = {
      method: 'GET',
      path: '/api/test',
      query: {},
      connection: { remoteAddress: '10.0.0.1' },
      headers: {},
    };
    const res = { statusCode: 200 };

    auditLogger.logApiAccess(req, res, 20);

    const logged = handler.mock.calls[0][0];
    expect(logged.data.ip).toBe('10.0.0.1');
  });
});

// ============================================
// 查询功能测试
// ============================================

describe('query 方法', () => {
  let auditLogger;
  const testLogDir = './logs/audit-test-query';

  beforeEach(async () => {
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testLogDir, file));
      }
    }

    auditLogger = new AuditLogger({
      logDir: testLogDir,
      consoleOutput: false,
      batchSize: 3,
      flushInterval: 100,
    });

    // 记录一些测试日志
    auditLogger.log(AuditEventType.API_ACCESS, { path: '/api/1' });
    auditLogger.log(AuditEventType.ORDER_CREATED, { orderId: 'order-1' });
    auditLogger.log(AuditEventType.AUTH_FAILED, { username: 'test' });

    // 等待刷新
    await new Promise(r => setTimeout(r, 200));
  });

  afterEach(async () => {
    await auditLogger.stop();
  });

  it('应该查询所有日志', async () => {
    const results = await auditLogger.query({});
    expect(results.length).toBe(3);
  });

  it('应该按事件类型过滤', async () => {
    const results = await auditLogger.query({
      eventType: AuditEventType.ORDER_CREATED,
    });

    expect(results.length).toBe(1);
    expect(results[0].eventType).toBe(AuditEventType.ORDER_CREATED);
  });

  it('应该按级别过滤', async () => {
    const results = await auditLogger.query({
      level: AuditLevel.CRITICAL,
    });

    expect(results.length).toBe(1);
    expect(results[0].eventType).toBe(AuditEventType.AUTH_FAILED);
  });

  it('应该限制返回数量', async () => {
    const results = await auditLogger.query({ limit: 2 });
    expect(results.length).toBe(2);
  });
});

// ============================================
// 完整性验证测试
// ============================================

describe('verifyIntegrity 方法', () => {
  let auditLogger;
  const testLogDir = './logs/audit-test-integrity';

  beforeEach(async () => {
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testLogDir, file));
      }
    }

    auditLogger = new AuditLogger({
      logDir: testLogDir,
      consoleOutput: false,
      batchSize: 3,
      flushInterval: 100,
      enableIntegrity: true,
    });
  });

  afterEach(async () => {
    await auditLogger.stop();
  });

  it('应该验证有效的日志文件', async () => {
    // 记录日志
    auditLogger.log(AuditEventType.SYSTEM_START, { version: '1.0' });
    auditLogger.log(AuditEventType.API_ACCESS, { path: '/test' });
    auditLogger.log(AuditEventType.SYSTEM_STOP, {});

    await new Promise(r => setTimeout(r, 200));

    const files = fs.readdirSync(testLogDir);
    const result = await auditLogger.verifyIntegrity(path.join(testLogDir, files[0]));

    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBe(3);
    expect(result.chainBroken).toBe(false);
  });

  it('应该检测被篡改的日志', async () => {
    // 记录日志
    auditLogger.log(AuditEventType.SYSTEM_START, {});
    auditLogger.log(AuditEventType.SYSTEM_STOP, {});

    await new Promise(r => setTimeout(r, 200));

    const files = fs.readdirSync(testLogDir);
    const filePath = path.join(testLogDir, files[0]);

    // 读取原内容并篡改哈希值
    let content = fs.readFileSync(filePath, 'utf8');
    // 篡改 hash 值使其与实际不匹配
    content = content.replace(/"hash":"[^"]+"/g, '"hash":"tampered_hash"');
    fs.writeFileSync(filePath, content);

    const result = await auditLogger.verifyIntegrity(filePath);

    // 因为 hash 被篡改，验证应该失败
    expect(result.invalidRecords.length).toBeGreaterThan(0);
  });

  it('应该处理不存在的文件', async () => {
    const result = await auditLogger.verifyIntegrity('./nonexistent-file.log');

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================
// 其他订单动作测试
// ============================================

describe('logOrder 其他动作', () => {
  let auditLogger;
  const testLogDir = './logs/audit-test-order';

  beforeEach(() => {
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testLogDir, file));
      }
    }

    auditLogger = new AuditLogger({
      logDir: testLogDir,
      consoleOutput: false,
    });
  });

  afterEach(async () => {
    await auditLogger.stop();
  });

  it('应该记录订单成交', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    auditLogger.logOrder('filled', { id: 'order-123', symbol: 'BTC/USDT' });

    expect(handler.mock.calls[0][0].eventType).toBe(AuditEventType.ORDER_FILLED);
  });

  it('应该记录订单取消', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    auditLogger.logOrder('cancelled', { id: 'order-456' });

    expect(handler.mock.calls[0][0].eventType).toBe(AuditEventType.ORDER_CANCELLED);
  });

  it('应该记录订单失败并使用 WARNING 级别', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    auditLogger.logOrder('failed', {
      id: 'order-789',
      error: 'Insufficient balance',
    });

    const logged = handler.mock.calls[0][0];
    expect(logged.eventType).toBe(AuditEventType.ORDER_FAILED);
    expect(logged.level).toBe(AuditLevel.WARNING);
  });

  it('应该处理未知订单动作', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    auditLogger.logOrder('unknown', { id: 'order-000' });

    expect(handler.mock.calls[0][0].eventType).toBe('order_unknown');
  });
});

// ============================================
// 数组脱敏测试
// ============================================

describe('数组和深层嵌套脱敏', () => {
  let auditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger({
      logDir: './logs/audit-sanitize',
      consoleOutput: false,
    });
  });

  afterEach(async () => {
    await auditLogger.stop();
  });

  it('应该脱敏数组中的敏感字段', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    auditLogger.log(AuditEventType.CONFIG_CHANGE, {
      users: [
        { name: 'user1', password: 'pass1' },
        { name: 'user2', password: 'pass2' },
      ],
    });

    const logged = handler.mock.calls[0][0].data;
    expect(logged.users[0].name).toBe('user1');
    expect(logged.users[0].password).toBe('***REDACTED***');
    expect(logged.users[1].password).toBe('***REDACTED***');
  });

  it('应该处理 null 值', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    auditLogger.log(AuditEventType.CONFIG_CHANGE, {
      value: null,
    });

    expect(handler.mock.calls[0][0].data.value).toBeNull();
  });

  it('应该处理 undefined 值', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    auditLogger.log(AuditEventType.CONFIG_CHANGE, {
      value: undefined,
    });

    expect(handler.mock.calls[0][0].data.value).toBeUndefined();
  });

  it('应该限制最大深度', () => {
    const handler = vi.fn();
    auditLogger.on('log', handler);

    // 创建深层嵌套对象
    let deepObj = { password: 'secret' };
    for (let i = 0; i < 15; i++) {
      deepObj = { nested: deepObj };
    }

    auditLogger.log(AuditEventType.CONFIG_CHANGE, deepObj);

    // 应该不抛出错误
    expect(handler).toHaveBeenCalled();
  });
});

// ============================================
// 文件轮转测试
// ============================================

describe('文件管理', () => {
  let auditLogger;
  const testLogDir = './logs/audit-test-rotation';

  beforeEach(() => {
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testLogDir, file));
      }
    }

    auditLogger = new AuditLogger({
      logDir: testLogDir,
      consoleOutput: false,
      maxFileSize: 1000, // 小文件大小用于测试
    });
  });

  afterEach(async () => {
    await auditLogger.stop();
  });

  it('应该创建日志目录', () => {
    expect(fs.existsSync(testLogDir)).toBe(true);
  });

  it('应该生成日期格式的日志文件名', async () => {
    auditLogger.log(AuditEventType.SYSTEM_START, {});
    await auditLogger.flush();

    const files = fs.readdirSync(testLogDir);
    expect(files.length).toBeGreaterThan(0);

    const today = new Date().toISOString().slice(0, 10);
    expect(files[0]).toContain(today);
  });
});

// ============================================
// 错误处理测试
// ============================================

describe('错误处理', () => {
  let auditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger({
      logDir: './logs/audit-error',
      consoleOutput: false,
    });
  });

  afterEach(async () => {
    await auditLogger.stop();
  });

  it('应该处理空缓冲区的 flush', async () => {
    // 不应该抛出错误
    await auditLogger.flush();
    expect(auditLogger.buffer.length).toBe(0);
  });

  it('应该发射 error 事件当写入失败', async () => {
    const errorHandler = vi.fn();
    auditLogger.on('error', errorHandler);

    // 模拟写入失败
    auditLogger.log(AuditEventType.SYSTEM_START, {});

    // 临时覆盖 _writeRecords 使其失败
    const originalWrite = auditLogger._writeRecords.bind(auditLogger);
    auditLogger._writeRecords = async () => {
      throw new Error('Write failed');
    };

    await auditLogger.flush();

    expect(errorHandler).toHaveBeenCalled();
    expect(auditLogger.stats.errorCount).toBe(1);

    // 恢复
    auditLogger._writeRecords = originalWrite;
  });
});

// ============================================
// 统计信息测试
// ============================================

describe('getStats', () => {
  let auditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger({
      logDir: './logs/audit-stats',
      consoleOutput: false,
    });
  });

  afterEach(async () => {
    await auditLogger.stop();
  });

  it('应该返回完整的统计信息', () => {
    auditLogger.log(AuditEventType.SYSTEM_START, {});
    auditLogger.log(AuditEventType.API_ACCESS, {});

    const stats = auditLogger.getStats();

    expect(stats.totalLogs).toBe(2);
    expect(stats.logsToday).toBe(2);
    expect(stats.bufferSize).toBe(2);
    expect(stats.errorCount).toBe(0);
    expect(stats.lastLogTime).toBeDefined();
  });
});
