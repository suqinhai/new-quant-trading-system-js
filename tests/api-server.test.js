import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ApiServer } from '../src/api/server.js';
import { RateLimiter } from '../src/api/rateLimit.js';

function requestUrl(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, { agent: false }, (res) => {
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
    req.end();
  });
}

async function requestJson(url) {
  const response = await requestUrl(url);
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
