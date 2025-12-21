/**
 * 结构化日志测试
 * Structured Logger Tests
 * @module tests/unit/logger.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, LogLevel, LogLevelNames, getLogger, initLogger } from '../../src/logging/index.js';
import fs from 'fs';
import path from 'path';

const TEST_LOG_DIR = './test-logs';

describe('Logger', () => {
  let logger;

  beforeEach(() => {
    logger = new Logger({
      level: 'debug',
      logDir: TEST_LOG_DIR,
      filePrefix: 'test',
      console: false, // 禁用控制台输出
      file: true,
      format: 'json',
    });
  });

  afterEach(async () => {
    await logger.close();

    // 清理测试目录
    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  describe('初始化', () => {
    it('应该正确初始化', () => {
      expect(logger).toBeDefined();
      expect(logger.config.level).toBe('debug');
      expect(logger.config.logDir).toBe(TEST_LOG_DIR);
    });

    it('应该创建日志目录', () => {
      expect(fs.existsSync(TEST_LOG_DIR)).toBe(true);
    });

    it('应该创建日志文件', () => {
      expect(logger.currentFile).toBeDefined();
      expect(fs.existsSync(logger.currentFile)).toBe(true);
    });
  });

  describe('日志级别', () => {
    it('应该按级别过滤日志', async () => {
      logger.setLevel('warn');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(2); // warn 和 error
    });

    it('应该设置和获取日志级别', () => {
      logger.setLevel('error');
      expect(logger.getLevel()).toBe('error');
    });
  });

  describe('日志方法', () => {
    it('应该记录 debug 日志', async () => {
      logger.debug('debug message', { key: 'value' });

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.level).toBe('DEBUG');
      expect(entry.message).toBe('debug message');
      expect(entry.key).toBe('value');
    });

    it('应该记录 info 日志', async () => {
      logger.info('info message');

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.level).toBe('INFO');
    });

    it('应该记录 warn 日志', async () => {
      logger.warn('warn message');

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.level).toBe('WARN');
    });

    it('应该记录 error 日志', async () => {
      logger.error('error message', new Error('test error'));

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.level).toBe('ERROR');
      expect(entry.error).toBe('test error');
      expect(entry.stack).toBeDefined();
    });

    it('应该记录 fatal 日志', async () => {
      logger.fatal('fatal message');

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.level).toBe('FATAL');
    });
  });

  describe('敏感数据脱敏', () => {
    it('应该脱敏敏感字段', async () => {
      logger.info('login attempt', {
        username: 'user123',
        password: 'secret123',
        apiKey: 'key-12345',
      });

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.username).toBe('user123');
      expect(entry.password).toBe('***REDACTED***');
      expect(entry.apiKey).toBe('***REDACTED***');
    });

    it('应该递归脱敏嵌套对象', async () => {
      logger.info('nested data', {
        user: {
          name: 'test',
          credentials: {
            password: 'secret',
          },
        },
      });

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.user.name).toBe('test');
      expect(entry.user.credentials.password).toBe('***REDACTED***');
    });
  });

  describe('时间戳', () => {
    it('应该包含时间戳', async () => {
      logger.info('timestamped message');

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp)).toBeInstanceOf(Date);
    });

    it('应该可以禁用时间戳', async () => {
      const noTimestampLogger = new Logger({
        logDir: TEST_LOG_DIR,
        filePrefix: 'no-timestamp',
        console: false,
        timestamp: false,
      });

      noTimestampLogger.info('no timestamp');

      await noTimestampLogger.flush();

      const content = fs.readFileSync(noTimestampLogger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.timestamp).toBeUndefined();

      await noTimestampLogger.close();
    });
  });

  describe('上下文', () => {
    it('应该在初始化时设置上下文', async () => {
      const contextLogger = new Logger({
        logDir: TEST_LOG_DIR,
        filePrefix: 'context',
        console: false,
        context: { service: 'test-service', version: '1.0.0' },
      });

      contextLogger.info('with context');

      await contextLogger.flush();

      const content = fs.readFileSync(contextLogger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.service).toBe('test-service');
      expect(entry.version).toBe('1.0.0');

      await contextLogger.close();
    });

    it('应该动态添加上下文', async () => {
      logger.addContext({ requestId: 'req-123' });
      logger.info('with added context');

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.requestId).toBe('req-123');
    });
  });

  describe('子日志器', () => {
    it('应该创建子日志器', () => {
      const childLogger = logger.child('child-service');

      expect(childLogger).toBeDefined();
      expect(childLogger).toBeInstanceOf(Logger);
    });

    it('应该返回相同的子日志器', () => {
      const child1 = logger.child('same-child');
      const child2 = logger.child('same-child');

      expect(child1).toBe(child2);
    });

    it('子日志器应该包含额外上下文', async () => {
      const childLogger = logger.child('my-module', { component: 'parser' });

      childLogger.info('child log');

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.logger).toBe('my-module');
      expect(entry.component).toBe('parser');
    });
  });

  describe('日志格式', () => {
    it('应该支持 JSON 格式', async () => {
      logger.info('json format');

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');

      expect(() => JSON.parse(content.trim())).not.toThrow();
    });

    it('应该支持文本格式', async () => {
      const textLogger = new Logger({
        logDir: TEST_LOG_DIR,
        filePrefix: 'text',
        console: false,
        format: 'text',
      });

      textLogger.info('text format', { key: 'value' });

      await textLogger.flush();

      const content = fs.readFileSync(textLogger.currentFile, 'utf8');

      expect(content).toContain('[INFO]');
      expect(content).toContain('text format');

      await textLogger.close();
    });
  });

  describe('日志轮换', () => {
    it('应该在达到大小限制时轮换', async () => {
      const smallLogger = new Logger({
        logDir: TEST_LOG_DIR,
        filePrefix: 'rotate',
        console: false,
        maxFileSize: 100, // 很小的大小限制
      });

      const rotateHandler = vi.fn();
      smallLogger.on('rotated', rotateHandler);

      // 写入足够的数据触发轮换
      for (let i = 0; i < 10; i++) {
        smallLogger.info('This is a log message that should trigger rotation');
      }

      await smallLogger.flush();

      // 应该触发了轮换
      expect(rotateHandler).toHaveBeenCalled();

      await smallLogger.close();
    });
  });

  describe('计时功能', () => {
    it('应该记录操作耗时', async () => {
      await logger.timeAsync('operation', async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'result';
      });

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.durationMs).toBeGreaterThan(5);
    });

    it('应该在操作失败时记录错误', async () => {
      try {
        await logger.timeAsync('failing-operation', async () => {
          throw new Error('operation failed');
        });
      } catch {
        // 预期的错误
      }

      await logger.flush();

      const content = fs.readFileSync(logger.currentFile, 'utf8');
      const entry = JSON.parse(content.trim());

      expect(entry.level).toBe('ERROR');
      expect(entry.error).toBe('operation failed');
    });
  });

  describe('事件发射', () => {
    it('应该在记录日志时发射事件', () => {
      const handler = vi.fn();
      logger.on('log', handler);

      logger.info('event test', { data: 123 });

      expect(handler).toHaveBeenCalledWith({
        level: 'INFO',
        message: 'event test',
        data: { data: 123 },
      });
    });
  });

  describe('统计信息', () => {
    it('应该返回日志统计', async () => {
      logger.info('test log 1');
      logger.info('test log 2');

      await logger.flush();

      const stats = logger.getStats();

      expect(stats.level).toBe('debug');
      expect(stats.logDir).toBe(TEST_LOG_DIR);
      expect(stats.fileCount).toBeGreaterThanOrEqual(1);
      expect(stats.currentFile).toBeDefined();
    });
  });

  describe('日志文件列表', () => {
    it('应该返回日志文件列表', () => {
      const files = logger.getLogFiles();

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('全局日志器', () => {
  afterEach(async () => {
    const logger = getLogger();
    await logger.close();

    if (fs.existsSync(TEST_LOG_DIR)) {
      fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
    }
  });

  it('应该获取全局日志器', () => {
    const logger = getLogger();

    expect(logger).toBeDefined();
    expect(logger).toBeInstanceOf(Logger);
  });

  it('应该获取命名子日志器', () => {
    const logger = getLogger();
    const childLogger = getLogger('my-module');

    expect(childLogger).toBeDefined();
    expect(logger.children.has('my-module')).toBe(true);
  });

  it('应该初始化自定义全局日志器', () => {
    const logger = initLogger({
      level: 'error',
      logDir: TEST_LOG_DIR,
      console: false,
    });

    expect(logger.getLevel()).toBe('error');
  });
});
