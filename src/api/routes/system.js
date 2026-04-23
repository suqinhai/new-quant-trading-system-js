/**
 * RESTful API 路由 - 系统管理
 * System Management Routes
 *
 * @module src/api/routes/system
 */

import { Router } from 'express';

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
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = mergeDeep(output[key], value);
      continue;
    }

    output[key] = deepClone(value);
  }

  return output;
}

function applyUpdatesWithSetter(configManager, updates, prefix = '') {
  for (const [key, value] of Object.entries(updates || {})) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(value)) {
      applyUpdatesWithSetter(configManager, value, path);
      continue;
    }

    configManager.set(path, value);
  }
}

function buildDefaultConfig() {
  return {
    runMode: process.env.RUN_MODE || 'shadow',
    refreshInterval: Number(process.env.REFRESH_INTERVAL || 10),
    logging: {
      level: process.env.LOG_LEVEL || 'info',
    },
    server: {
      httpPort: Number(process.env.HTTP_PORT || process.env.PORT || 3000),
      wsPort: Number(process.env.WS_PORT || 3001),
    },
    database: {
      type: process.env.DB_TYPE || 'SQLite',
      redis: {
        enabled: !!(process.env.REDIS_URL || process.env.REDIS_HOST),
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        db: Number(process.env.REDIS_DB || 0),
      },
    },
    alert: {
      email: {
        enabled: false,
      },
      telegram: {
        enabled: false,
      },
      webhook: {
        enabled: false,
      },
    },
  };
}

function buildSafeConfig(config) {
  const safeConfig = mergeDeep(buildDefaultConfig(), config || {});

  if (safeConfig.exchange) {
    for (const [exchangeId, exchangeConfig] of Object.entries(safeConfig.exchange)) {
      if (!isPlainObject(exchangeConfig)) {
        continue;
      }

      if (exchangeConfig.secret) {
        exchangeConfig.secret = '******';
      }

      if (exchangeConfig.password) {
        exchangeConfig.password = '******';
      }

      if (exchangeConfig.apiKey) {
        const value = String(exchangeConfig.apiKey);
        exchangeConfig.apiKey = value.length > 8 ? `${value.slice(0, 8)}******` : '******';
      }

      safeConfig.exchange[exchangeId] = exchangeConfig;
    }
  }

  return safeConfig;
}

function buildSystemStatus(config, deps = {}, tradingEngine) {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const startTime = new Date(Date.now() - (process.uptime() * 1000)).toISOString();
  const databaseConfig = config.database || {};
  const redisConfig = databaseConfig.redis || {};
  const redisClient = deps.redis
    || deps.redisClient
    || deps.redisService
    || deps.notificationService?.redis
    || deps.marketDataEngine?.redis
    || deps.tradingEngine?.marketDataEngine?.redis
    || null;

  const redisConnected = redisClient?.status === 'ready'
    || redisClient?.isOpen === true
    || redisClient?.connected === true
    || false;

  const status = {
    version: process.env.npm_package_version || '1.0.0',
    nodeVersion: process.version,
    uptime: process.uptime(),
    memoryUsage,
    cpuUsage,
    timestamp: new Date().toISOString(),
    startTime,
    mode: config.runMode || process.env.RUN_MODE || 'shadow',
    runMode: config.runMode || process.env.RUN_MODE || 'shadow',
    pid: process.pid,
    database: {
      type: databaseConfig.type || process.env.DB_TYPE || 'SQLite',
      connected: true,
    },
    redis: {
      enabled: !!redisConfig.enabled,
      connected: !!redisConnected,
      host: redisConfig.host || process.env.REDIS_HOST || 'localhost',
      port: redisConfig.port || Number(process.env.REDIS_PORT || 6379),
      db: redisConfig.db || Number(process.env.REDIS_DB || 0),
    },
  };

  if (tradingEngine) {
    status.engine = {
      running: tradingEngine.isRunning?.() || false,
      strategies: tradingEngine.getActiveStrategies?.()?.length || 0,
    };
  }

  return status;
}

async function persistConfigUpdates(configManager, updates) {
  if (!configManager) {
    return;
  }

  if (typeof configManager.update === 'function') {
    await configManager.update(updates);
  } else if (typeof configManager.set === 'function') {
    applyUpdatesWithSetter(configManager, updates);
    if (typeof configManager.save === 'function') {
      await configManager.save();
    }
  }
}

/**
 * 创建系统管理路由
 * @param {Object} deps - 依赖注入
 * @returns {Router}
 */
export function createSystemRoutes(deps = {}) {
  const router = Router();
  const { configManager, healthChecker, tradingEngine } = deps;
  let runtimeConfig = mergeDeep(buildDefaultConfig(), configManager?.getAll?.() || {});

  const getCurrentConfig = () => {
    const managerConfig = configManager?.getAll?.() || {};
    runtimeConfig = mergeDeep(runtimeConfig, managerConfig);
    return mergeDeep(buildDefaultConfig(), runtimeConfig);
  };

  router.get('/status', async (req, res) => {
    try {
      const config = getCurrentConfig();
      const status = buildSystemStatus(config, deps, tradingEngine);
      res.json({ success: true, data: status });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/config', async (req, res) => {
    try {
      const config = getCurrentConfig();
      res.json({ success: true, data: buildSafeConfig(config) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.put('/config', async (req, res) => {
    try {
      const updates = req.body || {};

      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin permission required',
          code: 'FORBIDDEN',
        });
      }

      runtimeConfig = mergeDeep(runtimeConfig, updates);
      await persistConfigUpdates(configManager, updates);

      if (updates.runMode) {
        process.env.RUN_MODE = updates.runMode;
      }

      if (updates.logging?.level) {
        process.env.LOG_LEVEL = updates.logging.level;
      }

      if (updates.refreshInterval !== undefined) {
        process.env.REFRESH_INTERVAL = String(updates.refreshInterval);
      }

      const savedConfig = getCurrentConfig();

      res.json({
        success: true,
        message: 'Configuration updated',
        data: buildSafeConfig(savedConfig),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/metrics', async (req, res) => {
    try {
      const metrics = {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
        timestamp: Date.now(),
      };

      if (tradingEngine?.getMetrics) {
        metrics.trading = tradingEngine.getMetrics();
      }

      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/health', async (req, res) => {
    try {
      if (healthChecker) {
        const health = await healthChecker.check();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        return res.status(statusCode).json(health);
      }

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(503).json({ status: 'unhealthy', error: error.message });
    }
  });

  return router;
}

export default createSystemRoutes;
