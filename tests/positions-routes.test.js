import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import express from 'express';

import { createPositionRoutes } from '../src/api/routes/positions.js';

async function startServer(deps, user = { role: 'admin', username: 'tester' }) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/positions', createPositionRoutes(deps));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { agent: false, ...options }, (res) => {
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

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

test('position list falls back to getOpenPositions()', async (t) => {
  const positionStore = {
    async getOpenPositions() {
      return [
        {
          id: 'pos-1',
          symbol: 'BTC/USDT',
          exchange: 'binance',
          amount: 1,
          currentPrice: 100,
        },
      ];
    },
  };

  const server = await startServer({ positionStore });
  t.after(async () => {
    await server.close();
  });

  const response = await requestJson(`${server.baseUrl}/api/positions`);
  assert.equal(response.statusCode, 200);

  const payload = response.payload;
  assert.equal(payload.success, true);
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].symbol, 'BTC/USDT');
});

test('close endpoint returns 503 when runtime close support is unavailable', async (t) => {
  const positionStore = {
    async getById(id) {
      return {
        id,
        symbol: 'BTC/USDT',
        exchange: 'binance',
      };
    },
  };

  const server = await startServer({ positionStore, tradingEngine: {} });
  t.after(async () => {
    await server.close();
  });

  const response = await requestJson(`${server.baseUrl}/api/positions/BTC%2FUSDT/close`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(JSON.stringify({ percentage: 100 })),
    },
    body: JSON.stringify({ percentage: 100 }),
  });

  assert.equal(response.statusCode, 503);

  const payload = response.payload;
  assert.equal(payload.success, false);
  assert.equal(payload.code, 'SERVICE_UNAVAILABLE');
});
