/**
 * RESTful API 路由 - 交易所管理
 * Exchange Management Routes
 *
 * @module src/api/routes/exchanges
 */

import { Router } from 'express';

const SUPPORTED_EXCHANGES = [
  { id: 'binance', name: 'Binance' },
  { id: 'okx', name: 'OKX' },
  { id: 'bybit', name: 'Bybit' },
  { id: 'gate', name: 'Gate.io' },
  { id: 'deribit', name: 'Deribit' },
  { id: 'bitget', name: 'Bitget' },
  { id: 'kucoin', name: 'KuCoin' },
  { id: 'kraken', name: 'Kraken' },
];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(base = {}, updates = {}) {
  const output = isPlainObject(base) ? deepClone(base) : {};

  for (const [key, value] of Object.entries(updates || {})) {
    if (value === undefined) {
      continue;
    }

    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeDeep(output[key], value);
      continue;
    }

    output[key] = deepClone(value);
  }

  return output;
}

function maskApiKey(value) {
  if (!value) {
    return null;
  }

  const key = String(value);
  return key.length > 8 ? `${key.slice(0, 8)}******` : '******';
}

function normalizeExchangeCollection(collection) {
  if (!collection) {
    return [];
  }

  if (Array.isArray(collection)) {
    return collection;
  }

  if (collection instanceof Map) {
    return Array.from(collection.entries()).map(([id, value]) => ({
      id,
      ...(isPlainObject(value) ? value : {}),
    }));
  }

  if (isPlainObject(collection)) {
    return Object.entries(collection).map(([id, value]) => ({
      id,
      ...(isPlainObject(value) ? value : {}),
    }));
  }

  return [];
}

function toPlainExchangeData(exchange = {}) {
  if (!exchange || typeof exchange !== 'object') {
    return {};
  }

  const config = exchange.config || {};
  const data = {
    id: exchange.id || exchange.name,
    name: exchange.displayName || exchange.name,
    status: exchange.status,
    connected: exchange.connected,
    sandbox: exchange.sandbox ?? exchange.testnet ?? config.sandbox ?? config.testnet,
    testnet: exchange.testnet ?? config.testnet,
    apiKey: exchange.apiKey ?? config.apiKey,
    secret: exchange.secret ?? config.secret,
    password: exchange.password ?? config.password,
    passphrase: exchange.passphrase ?? config.passphrase,
  };

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function normalizeExchangeConfigPayload(payload = {}) {
  return {
    apiKey: payload.apiKey || null,
    secret: payload.secret || null,
    password: payload.password || payload.passphrase || null,
    passphrase: payload.password || payload.passphrase || null,
    sandbox: payload.sandbox ?? payload.testnet ?? false,
    testnet: payload.testnet ?? payload.sandbox ?? false,
  };
}

function normalizeExchangeRecord(exchange = {}, fallback = {}, connectedOverride) {
  const merged = {
    ...fallback,
    ...exchange,
  };

  const configured = !!(merged.apiKey || merged.secret || merged.password || merged.passphrase);
  const connected = typeof connectedOverride === 'boolean'
    ? connectedOverride
    : merged.connected === true || merged.status === 'connected';

  return {
    ...merged,
    id: merged.id || fallback.id,
    name: merged.name || fallback.name || merged.id || fallback.id,
    sandbox: merged.sandbox ?? merged.testnet ?? false,
    connected,
    configured,
    status: connected ? 'connected' : (configured ? 'configured' : 'disconnected'),
    apiKey: maskApiKey(merged.apiKey),
    secret: merged.secret ? '******' : null,
    password: merged.password || merged.passphrase ? '******' : null,
    passphrase: undefined,
    testnet: undefined,
  };
}

function buildBalanceMap(payload) {
  if (!payload) {
    return {};
  }

  if (Array.isArray(payload)) {
    return payload.reduce((accumulator, item) => {
      const currency = item.currency || item.asset || item.code || item.symbol;
      if (!currency) {
        return accumulator;
      }

      const total = Number(item.total ?? item.balance ?? item.equity ?? 0);
      const free = Number(item.free ?? item.available ?? item.availableBalance ?? total);
      const used = Number(item.used ?? item.locked ?? Math.max(total - free, 0));

      accumulator[currency] = { total, free, used };
      return accumulator;
    }, {});
  }

  if (isPlainObject(payload.total) || isPlainObject(payload.free) || isPlainObject(payload.used)) {
    const currencies = new Set([
      ...Object.keys(payload.total || {}),
      ...Object.keys(payload.free || {}),
      ...Object.keys(payload.used || {}),
    ]);

    return Array.from(currencies).reduce((accumulator, currency) => {
      const total = Number(payload.total?.[currency] ?? 0);
      const free = Number(payload.free?.[currency] ?? total);
      const used = Number(payload.used?.[currency] ?? Math.max(total - free, 0));
      accumulator[currency] = { total, free, used };
      return accumulator;
    }, {});
  }

  return Object.entries(payload).reduce((accumulator, [currency, value]) => {
    if (isPlainObject(value)) {
      const total = Number(value.total ?? value.balance ?? value.equity ?? 0);
      const free = Number(value.free ?? value.available ?? total);
      const used = Number(value.used ?? value.locked ?? Math.max(total - free, 0));
      accumulator[currency] = { total, free, used };
    } else {
      const total = Number(value ?? 0);
      accumulator[currency] = { total, free: total, used: 0 };
    }

    return accumulator;
  }, {});
}

function applyConfigManagerExchangeUpdate(configManager, exchangeId, payload) {
  if (!configManager?.set) {
    return;
  }

  for (const [key, value] of Object.entries(payload)) {
    configManager.set(`exchange.${exchangeId}.${key}`, value);
  }
}

function getExchangeConfigMap(configManager, runtimeExchangeConfig) {
  const managerConfig = configManager?.getAll?.()?.exchange || {};
  return mergeDeep(runtimeExchangeConfig, managerConfig);
}

function getSupportedExchangeBase(id) {
  return SUPPORTED_EXCHANGES.find(exchange => exchange.id === id) || { id, name: id };
}

/**
 * 创建交易所管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createExchangeRoutes(deps = {}) {
  const router = Router();
  const { exchangeManager, configManager } = deps;
  let runtimeExchangeConfig = deepClone(configManager?.getAll?.()?.exchange || {});
  const connectionStates = new Map();
  const handleUpdateExchangeConfig = async (req, res) => {
    try {
      const { id } = req.params;
      const normalizedPayload = normalizeExchangeConfigPayload(req.body || {});

      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN',
        });
      }

      await persistExchangeConfig(id, normalizedPayload);
      connectionStates.set(id, false);

      const updatedExchange = await getExchangeById(id);

      res.json({
        success: true,
        message: 'Exchange configuration updated',
        data: updatedExchange,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  const buildExchangeList = async () => {
    const configuredExchanges = getExchangeConfigMap(configManager, runtimeExchangeConfig);
    const managerExchanges = normalizeExchangeCollection(exchangeManager?.getExchanges?.())
      .map(exchange => toPlainExchangeData(exchange));
    const managerById = new Map(managerExchanges.map(exchange => [exchange.id, exchange]));
    const configuredIds = Object.keys(configuredExchanges || {}).filter(id => id !== 'default');
    const allIds = new Set([
      ...SUPPORTED_EXCHANGES.map(exchange => exchange.id),
      ...configuredIds,
      ...managerExchanges.map(exchange => exchange.id).filter(Boolean),
    ]);

    return Array.from(allIds).map((id) => {
      const base = getSupportedExchangeBase(id);
      const configured = configuredExchanges?.[id] || {};
      const managed = managerById.get(id) || {};
      const connectedOverride = connectionStates.has(id) ? connectionStates.get(id) : undefined;

      return normalizeExchangeRecord(
        mergeDeep(configured, managed),
        base,
        connectedOverride
      );
    });
  };

  const getExchangeById = async (id) => {
    const list = await buildExchangeList();
    return list.find(exchange => exchange.id === id) || null;
  };

  const persistExchangeConfig = async (id, payload) => {
    runtimeExchangeConfig[id] = mergeDeep(runtimeExchangeConfig[id] || {}, payload);

    if (exchangeManager?.updateExchange) {
      await exchangeManager.updateExchange(id, payload);
    }

    if (typeof configManager?.update === 'function') {
      await configManager.update({
        exchange: {
          [id]: payload,
        },
      });
    } else if (typeof configManager?.set === 'function') {
      applyConfigManagerExchangeUpdate(configManager, id, payload);
      if (typeof configManager.save === 'function') {
        await configManager.save();
      }
    }
  };

  router.get('/', async (req, res) => {
    try {
      const exchanges = await buildExchangeList();
      res.json({ success: true, data: exchanges });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.put('/:id', handleUpdateExchangeConfig);
  router.put('/:id/config', handleUpdateExchangeConfig);

  router.post('/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      const exchange = await getExchangeById(id);

      if (!exchange) {
        return res.status(404).json({
          success: false,
          error: 'Exchange not found',
          code: 'NOT_FOUND',
        });
      }

      let result;

      if (exchangeManager?.testConnection) {
        result = await exchangeManager.testConnection(id);
      } else if (!exchange.configured) {
        result = {
          success: false,
          message: 'API credentials not configured',
        };
      } else {
        return res.status(503).json({
          success: false,
          error: 'Exchange connectivity check is unavailable',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      if (result === false || result?.success === false) {
        connectionStates.set(id, false);
        return res.status(502).json({
          success: false,
          error: result?.message || result?.error || 'Exchange connection test failed',
          data: result,
        });
      }

      connectionStates.set(id, true);
      const normalizedResult = result === true
        ? { success: true }
        : (isPlainObject(result) ? result : { success: true });
      res.json({
        success: true,
        data: {
          success: true,
          ...normalizedResult,
        },
      });
    } catch (error) {
      connectionStates.set(req.params.id, false);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/:id/balance', async (req, res) => {
    try {
      const { id } = req.params;

      let balance;

      if (exchangeManager?.getBalance) {
        balance = await exchangeManager.getBalance(id);
      } else {
        return res.status(503).json({
          success: false,
          error: 'Balance query is unavailable',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      res.json({ success: true, data: buildBalanceMap(balance) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/:id/markets', async (req, res) => {
    try {
      const { id } = req.params;
      const { quote, type } = req.query;

      let markets = [];

      if (exchangeManager?.getMarkets) {
        markets = await exchangeManager.getMarkets(id);
      } else {
        return res.status(503).json({
          success: false,
          error: 'Market metadata is unavailable',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      if (quote) {
        markets = markets.filter(market => market.quote === quote);
      }

      if (type) {
        markets = markets.filter(market => market.type === type);
      }

      res.json({ success: true, data: markets });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/:id/ticker/:symbol', async (req, res) => {
    try {
      const { id, symbol } = req.params;

      let ticker = null;

      if (exchangeManager?.getTicker) {
        ticker = await exchangeManager.getTicker(id, symbol);
      } else {
        return res.status(503).json({
          success: false,
          error: 'Ticker query is unavailable',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      res.json({ success: true, data: ticker });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const exchange = await getExchangeById(id);

      if (!exchange) {
        return res.status(404).json({
          success: false,
          error: 'Exchange not found',
          code: 'NOT_FOUND',
        });
      }

      res.json({ success: true, data: exchange });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

export default createExchangeRoutes;
