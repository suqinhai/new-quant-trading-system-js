import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

import { ApiServer } from '../src/api/server.js';

function requestJson(url) {
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
          payload: JSON.parse(body),
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
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
