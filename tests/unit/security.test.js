/**
 * 安全中间件测试
 * Security Middleware Tests
 * @module tests/unit/security.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SecurityManager,
  RateLimiter,
  createSecurityMiddleware,
  generateSignature,
} from '../../src/middleware/security.js';

// ============================================
// RateLimiter 测试
// ============================================

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      windowMs: 1000, // 1秒窗口
      maxRequests: 5,
    });
  });

  afterEach(() => {
    limiter.stop();
  });

  it('应该允许在限制内的请求', () => {
    for (let i = 0; i < 5; i++) {
      const result = limiter.check('test-ip');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it('应该拒绝超过限制的请求', () => {
    // 用完配额
    for (let i = 0; i < 5; i++) {
      limiter.check('test-ip');
    }

    // 第6次应该被拒绝
    const result = limiter.check('test-ip');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('应该为不同的键独立计数', () => {
    // IP1 用完配额
    for (let i = 0; i < 5; i++) {
      limiter.check('ip1');
    }

    // IP2 应该仍然可以请求
    const result = limiter.check('ip2');
    expect(result.allowed).toBe(true);
  });

  it('应该在窗口重置后允许请求', async () => {
    // 用完配额
    for (let i = 0; i < 5; i++) {
      limiter.check('test-ip');
    }

    // 等待窗口重置
    await new Promise(r => setTimeout(r, 1100));

    // 应该可以再次请求
    const result = limiter.check('test-ip');
    expect(result.allowed).toBe(true);
  });
});

// ============================================
// SecurityManager 测试
// ============================================

describe('SecurityManager', () => {
  let securityManager;

  beforeEach(() => {
    securityManager = new SecurityManager({
      enableSignature: true,
      enableIpWhitelist: true,
      enableRateLimit: true,
      rateLimitWindow: 1000,
      rateLimitMax: 10,
      ipWhitelist: ['127.0.0.1', '192.168.1.0/24'],
    });

    // 添加测试 API Key
    securityManager.addApiKey('test-api-key', 'test-secret', {
      permissions: ['read', 'write'],
    });
  });

  afterEach(() => {
    securityManager.stop();
  });

  describe('API Key 管理', () => {
    it('应该正确添加 API Key', () => {
      securityManager.addApiKey('new-key', 'new-secret');
      expect(securityManager.config.apiKeys.has('new-key')).toBe(true);
    });

    it('应该正确移除 API Key', () => {
      securityManager.removeApiKey('test-api-key');
      expect(securityManager.config.apiKeys.has('test-api-key')).toBe(false);
    });
  });

  describe('签名验证', () => {
    it('应该验证有效签名', () => {
      const { timestamp, nonce, signature } = generateSignature({
        apiKey: 'test-api-key',
        secret: 'test-secret',
        body: '{"test":"data"}',
      });

      const result = securityManager.verifySignature({
        apiKey: 'test-api-key',
        timestamp,
        nonce,
        signature,
        body: '{"test":"data"}',
      });

      expect(result.valid).toBe(true);
    });

    it('应该拒绝无效的 API Key', () => {
      const result = securityManager.verifySignature({
        apiKey: 'invalid-key',
        timestamp: Date.now().toString(),
        nonce: 'test-nonce',
        signature: 'invalid',
        body: '',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });

    it('应该拒绝过期的请求', () => {
      const oldTimestamp = (Date.now() - 60000).toString(); // 1分钟前

      const result = securityManager.verifySignature({
        apiKey: 'test-api-key',
        timestamp: oldTimestamp,
        nonce: 'test-nonce',
        signature: 'some-signature',
        body: '',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('应该拒绝重复的 nonce (防重放)', () => {
      const { timestamp, nonce, signature } = generateSignature({
        apiKey: 'test-api-key',
        secret: 'test-secret',
        body: '',
      });

      // 第一次请求
      const result1 = securityManager.verifySignature({
        apiKey: 'test-api-key',
        timestamp,
        nonce,
        signature,
        body: '',
      });
      expect(result1.valid).toBe(true);

      // 重放请求
      const result2 = securityManager.verifySignature({
        apiKey: 'test-api-key',
        timestamp,
        nonce,
        signature,
        body: '',
      });
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('replay');
    });

    it('应该拒绝无效签名', () => {
      const result = securityManager.verifySignature({
        apiKey: 'test-api-key',
        timestamp: Date.now().toString(),
        nonce: 'unique-nonce-1',
        signature: 'a'.repeat(64), // 无效签名
        body: '',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid signature');
    });
  });

  describe('IP 白名单', () => {
    it('应该允许白名单中的 IP', () => {
      expect(securityManager.isIpAllowed('127.0.0.1')).toBe(true);
    });

    it('应该允许 CIDR 范围内的 IP', () => {
      expect(securityManager.isIpAllowed('192.168.1.100')).toBe(true);
      expect(securityManager.isIpAllowed('192.168.1.255')).toBe(true);
    });

    it('应该拒绝不在白名单中的 IP', () => {
      expect(securityManager.isIpAllowed('10.0.0.1')).toBe(false);
    });

    it('应该正确处理 IPv6 环回地址', () => {
      expect(securityManager.isIpAllowed('::1')).toBe(true);
    });

    it('应该正确添加和移除白名单 IP', () => {
      securityManager.addToWhitelist('10.0.0.1');
      expect(securityManager.isIpAllowed('10.0.0.1')).toBe(true);

      securityManager.removeFromWhitelist('10.0.0.1');
      expect(securityManager.isIpAllowed('10.0.0.1')).toBe(false);
    });
  });

  describe('禁用白名单时', () => {
    it('应该允许所有 IP', () => {
      const sm = new SecurityManager({
        enableIpWhitelist: false,
      });

      expect(sm.isIpAllowed('1.2.3.4')).toBe(true);
      expect(sm.isIpAllowed('any-ip')).toBe(true);

      sm.stop();
    });
  });
});

// ============================================
// 中间件测试
// ============================================

describe('createSecurityMiddleware', () => {
  let securityManager;
  let middleware;
  let mockReq;
  let mockRes;
  let nextFn;

  beforeEach(() => {
    securityManager = new SecurityManager({
      enableSignature: false,
      enableIpWhitelist: false,
      enableRateLimit: true,
      rateLimitWindow: 1000,
      rateLimitMax: 3,
      publicPaths: new Set(['/health']),
    });

    middleware = createSecurityMiddleware(securityManager);

    mockReq = {
      method: 'GET',
      path: '/api/test',
      headers: {},
      connection: { remoteAddress: '127.0.0.1' },
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      on: vi.fn(),
      statusCode: 200,
    };

    nextFn = vi.fn();
  });

  afterEach(() => {
    securityManager.stop();
  });

  it('应该允许公开路径', async () => {
    mockReq.path = '/health';
    await middleware(mockReq, mockRes, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });

  it('应该设置速率限制头', async () => {
    await middleware(mockReq, mockRes, nextFn);

    expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Limit', 3);
    expect(mockRes.set).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
  });

  it('应该在超过速率限制时返回 429', async () => {
    // 用完配额
    for (let i = 0; i < 3; i++) {
      await middleware(mockReq, mockRes, nextFn);
    }

    // 重置 mock
    mockRes.status.mockClear();
    mockRes.json.mockClear();
    nextFn.mockClear();

    // 第4次请求
    await middleware(mockReq, mockRes, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'RATE_LIMITED',
    }));
    expect(nextFn).not.toHaveBeenCalled();
  });
});

// ============================================
// generateSignature 测试
// ============================================

describe('generateSignature', () => {
  it('应该生成有效的签名', () => {
    const result = generateSignature({
      apiKey: 'my-api-key',
      secret: 'my-secret',
      body: '{"data":"test"}',
    });

    expect(result.timestamp).toBeDefined();
    expect(result.nonce).toBeDefined();
    expect(result.signature).toBeDefined();
    expect(result.signature).toHaveLength(64); // SHA256 hex
    expect(result.headers).toBeDefined();
  });

  it('应该生成不同的 nonce', () => {
    const result1 = generateSignature({
      apiKey: 'key',
      secret: 'secret',
    });

    const result2 = generateSignature({
      apiKey: 'key',
      secret: 'secret',
    });

    expect(result1.nonce).not.toBe(result2.nonce);
  });
});
