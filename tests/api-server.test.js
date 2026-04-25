import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ApiServer } from '../src/api/server.js';
import { DEFAULT_RATE_LIMIT_CONFIG, RateLimiter } from '../src/api/rateLimit.js';

function requestUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { body, ...requestOptions } = options;
    const req = request(url, { agent: false, ...requestOptions }, (res) => {
      let body = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body,
          headers: res.headers,
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function requestJson(url, options = {}) {
  const response = await requestUrl(url, options);
  return {
    ...response,
    payload: JSON.parse(response.body),
  };
}

test('ApiServer refuses to start without JWT_SECRET', async () => {
  const server = new ApiServer({
    host: '127.0.0.1',
    port: 0,
    jwtSecret: null,
  });

  await assert.rejects(
    server.start(),
    /JWT_SECRET is required to start the API server/
  );
});

test('ApiServer exposes public health endpoints', async (t) => {
  const server = new ApiServer({
    host: '127.0.0.1',
    port: 0,
    jwtSecret: 'test-secret',
    deps: {
      healthChecker: {
        async check() {
          return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
          };
        },
      },
    },
  });

  await server.start();
  t.after(async () => {
    await server.stop();
  });

  const address = server.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const healthResponse = await requestJson(`${baseUrl}/api/health`);
  assert.equal(healthResponse.statusCode, 200);

  const healthPayload = healthResponse.payload;
  assert.equal(healthPayload.status, 'healthy');

  const systemHealthResponse = await requestJson(`${baseUrl}/api/system/health`);
  assert.equal(systemHealthResponse.statusCode, 200);

  const systemHealthPayload = systemHealthResponse.payload;
  assert.equal(systemHealthPayload.status, 'healthy');
});

test('ApiServer serves frontend routes when a web dist directory is configured', async (t) => {
  const webDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quant-web-dist-'));
  fs.writeFileSync(
    path.join(webDistDir, 'index.html'),
    '<!DOCTYPE html><html><body><div id="app">frontend</div></body></html>',
    'utf8'
  );

  const server = new ApiServer({
    host: '127.0.0.1',
    port: 0,
    jwtSecret: 'test-secret',
    webDistDir,
  });

  await server.start();
  t.after(async () => {
    await server.stop();
    fs.rmSync(webDistDir, { recursive: true, force: true });
  });

  const address = server.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const loginResponse = await requestUrl(`${baseUrl}/login`);
  assert.equal(loginResponse.statusCode, 200);
  assert.match(loginResponse.headers['content-type'], /text\/html/);
  assert.match(loginResponse.body, /frontend/);
});

test('RateLimiter handles repeated sliding-window checks for non-whitelisted clients', async (t) => {
  const limiter = new RateLimiter({
    whitelist: [],
  });

  t.after(() => {
    limiter.destroy();
  });

  const req = {
    path: '/api/system/health',
    headers: {},
    ip: '203.0.113.10',
    connection: {},
  };

  const first = await limiter.check(req);
  const second = await limiter.check(req);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(limiter.stores.get('ip:203.0.113.10:/api/system/health').length, 2);
});

test('RateLimiter isolates login attempts by username on the same IP', async (t) => {
  const limiter = new RateLimiter({
    ...DEFAULT_RATE_LIMIT_CONFIG,
    whitelist: [],
    routes: {
      ...DEFAULT_RATE_LIMIT_CONFIG.routes,
      '/api/auth/login': {
        windowMs: 60 * 1000,
        maxRequests: 1,
        blockDuration: 60 * 1000,
      },
    },
  });

  t.after(() => {
    limiter.destroy();
  });

  const baseReq = {
    path: '/api/auth/login',
    headers: {},
    ip: '203.0.113.10',
    connection: {},
  };

  const aliceFirst = await limiter.check({ ...baseReq, body: { username: 'alice' } });
  const aliceSecond = await limiter.check({ ...baseReq, body: { username: 'alice' } });
  const bobFirst = await limiter.check({ ...baseReq, body: { username: 'bob' } });

  assert.equal(aliceFirst.allowed, true);
  assert.equal(aliceSecond.allowed, false);
  assert.equal(bobFirst.allowed, true);
});

test('ApiServer clears login rate limits after a successful login', async (t) => {
  const server = new ApiServer({
    host: '127.0.0.1',
    port: 0,
    jwtSecret: 'test-secret',
    rateLimit: {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      whitelist: [],
      routes: {
        ...DEFAULT_RATE_LIMIT_CONFIG.routes,
        '/api/auth/login': {
          windowMs: 15 * 60 * 1000,
          maxRequests: 2,
          blockDuration: 60 * 1000,
        },
      },
    },
  });

  server.authManager.createUser('ops-admin', 'StrongPass123', { role: 'admin' });

  await server.start();
  t.after(async () => {
    await server.stop();
  });

  const address = server.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = {
    'Content-Type': 'application/json',
  };

  const failedLogin = await requestJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'ops-admin', password: 'wrong-password' }),
  });
  assert.equal(failedLogin.statusCode, 401);

  const successfulLogin = await requestJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'ops-admin', password: 'StrongPass123' }),
  });
  assert.equal(successfulLogin.statusCode, 200);
  assert.equal(successfulLogin.payload.success, true);

  const retriedFailedLogin = await requestJson(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: 'ops-admin', password: 'wrong-password' }),
  });
  assert.equal(retriedFailedLogin.statusCode, 401);
  assert.equal(retriedFailedLogin.payload.code, 'UNAUTHORIZED');
});

test('ApiServer alert routes support AlertManager compatibility methods', async (t) => {
  const dismissedIds = [];
  const server = new ApiServer({
    host: '127.0.0.1',
    port: 0,
    jwtSecret: 'test-secret',
    deps: {
      alertManager: {
        getActiveAlerts() {
          return [
            { id: 'alert-1', level: 'warning', category: 'risk', dismissed: false, timestamp: Date.now() },
            { id: 'alert-2', level: 'info', category: 'system', dismissed: true, timestamp: Date.now() - 1000 },
          ];
        },
        clearAlert(id) {
          dismissedIds.push(id);
          return true;
        },
      },
    },
  });

  await server.start();
  t.after(async () => {
    await server.stop();
  });

  const address = server.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const token = server.authManager.generateToken({ username: 'admin', role: 'admin' });
  const headers = {
    Authorization: `Bearer ${token}`,
  };

  const dashboardAlertsResponse = await requestJson(`${baseUrl}/api/dashboard/alerts`, { headers });
  assert.equal(dashboardAlertsResponse.statusCode, 200);
  assert.equal(dashboardAlertsResponse.payload.success, true);
  assert.equal(dashboardAlertsResponse.payload.data.length, 1);
  assert.equal(dashboardAlertsResponse.payload.data[0].id, 'alert-1');

  const riskAlertsResponse = await requestJson(`${baseUrl}/api/risk/alerts`, { headers });
  assert.equal(riskAlertsResponse.statusCode, 200);
  assert.equal(riskAlertsResponse.payload.success, true);
  assert.equal(riskAlertsResponse.payload.total, 2);

  const dismissResponse = await requestJson(`${baseUrl}/api/risk/alerts/alert-1/dismiss`, {
    method: 'POST',
    headers,
  });
  assert.equal(dismissResponse.statusCode, 200);
  assert.equal(dismissResponse.payload.success, true);
  assert.deepEqual(dismissedIds, ['alert-1']);
});
