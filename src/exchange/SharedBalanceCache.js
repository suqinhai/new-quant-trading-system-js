import Redis from 'ioredis';

const DEFAULTS = {
  ttlMs: 5000,
  staleMaxMs: 15000,
  lockTtlMs: 8000,
  waitTimeoutMs: 2000,
  dataKeyPrefix: 'balance:shared',
  lockKeyPrefix: 'lock:balance',
};

const normalizePrefix = (prefix) => {
  if (!prefix) return '';
  return prefix.endsWith(':') ? prefix : `${prefix}:`;
};

const resolveNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const buildRedisOptions = (config = {}) => {
  if (config.url) {
    return { url: config.url };
  }

  const host = config.host || process.env.REDIS_HOST || 'localhost';
  const port = resolveNumber(config.port || process.env.REDIS_PORT, 6379);
  const password = config.password || process.env.REDIS_PASSWORD || undefined;
  const db = resolveNumber(config.db || process.env.REDIS_DB, 0);

  return { host, port, password, db };
};

let sharedRedis = null;

function getSharedRedis(config = {}) {
  if (sharedRedis) return sharedRedis;

  const options = buildRedisOptions(config);
  if (options.url) {
    sharedRedis = new Redis(options.url);
  } else {
    sharedRedis = new Redis(options);
  }

  return sharedRedis;
}

export class SharedBalanceCache {
  constructor(config = {}) {
    this.redisConfig = config.redis || {};
    this.keyPrefix = normalizePrefix(
      config.keyPrefix || this.redisConfig.keyPrefix || process.env.REDIS_PREFIX || 'quant:'
    );
    this.dataKeyPrefix = config.dataKeyPrefix || DEFAULTS.dataKeyPrefix;
    this.lockKeyPrefix = config.lockKeyPrefix || DEFAULTS.lockKeyPrefix;
    this.ttlMs = resolveNumber(config.ttlMs, DEFAULTS.ttlMs);
    this.staleMaxMs = resolveNumber(
      config.staleMaxMs,
      Math.max(this.ttlMs * 3, DEFAULTS.staleMaxMs)
    );
    this.lockTtlMs = resolveNumber(
      config.lockTtlMs,
      Math.max(this.ttlMs * 2, DEFAULTS.lockTtlMs)
    );
    this.waitTimeoutMs = resolveNumber(config.waitTimeoutMs, DEFAULTS.waitTimeoutMs);

    this.redis = null;
    this._connectPromise = null;
    this._localCache = new Map();
  }

  async connect() {
    if (this.redis) return;

    this.redis = getSharedRedis(this.redisConfig);
    if (this.redis.status === 'ready') return;

    if (!this._connectPromise) {
      this._connectPromise = new Promise((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = (error) => {
          cleanup();
          reject(error);
        };
        const cleanup = () => {
          this.redis.off('ready', onReady);
          this.redis.off('error', onError);
        };
        this.redis.once('ready', onReady);
        this.redis.once('error', onError);
      });
    }

    return this._connectPromise;
  }

  _balanceKey(exchange) {
    return `${this.keyPrefix}${this.dataKeyPrefix}:${exchange}`;
  }

  _lockKey(exchange) {
    return `${this.keyPrefix}${this.lockKeyPrefix}:${exchange}`;
  }

  _getLocal(exchange) {
    const record = this._localCache.get(exchange);
    if (!record) return null;
    const ageMs = Date.now() - record.cachedAt;
    if (ageMs <= this.ttlMs) {
      return { balance: record.balance, cachedAt: record.cachedAt, ageMs };
    }
    return null;
  }

  async get(exchange) {
    const exchangeKey = (exchange || 'unknown').toLowerCase();
    const local = this._getLocal(exchangeKey);
    if (local) return local;

    if (!this.redis) await this.connect();

    const raw = await this.redis.get(this._balanceKey(exchangeKey));
    if (!raw) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!parsed || typeof parsed.cachedAt !== 'number' || !parsed.balance) {
      return null;
    }

    this._localCache.set(exchangeKey, parsed);
    return {
      balance: parsed.balance,
      cachedAt: parsed.cachedAt,
      ageMs: Date.now() - parsed.cachedAt,
    };
  }

  async set(exchange, balance) {
    const exchangeKey = (exchange || 'unknown').toLowerCase();
    if (!this.redis) await this.connect();

    const payload = { balance, cachedAt: Date.now() };
    const key = this._balanceKey(exchangeKey);
    await this.redis.set(key, JSON.stringify(payload), 'PX', this.staleMaxMs);
    this._localCache.set(exchangeKey, payload);
  }

  async acquireLock(exchange) {
    const exchangeKey = (exchange || 'unknown').toLowerCase();
    if (!this.redis) await this.connect();

    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await this.redis.set(
      this._lockKey(exchangeKey),
      token,
      'PX',
      this.lockTtlMs,
      'NX'
    );
    return result === 'OK' ? token : null;
  }

  async releaseLock(exchange, token) {
    const exchangeKey = (exchange || 'unknown').toLowerCase();
    if (!this.redis) await this.connect();

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    return this.redis.eval(script, 1, this._lockKey(exchangeKey), token);
  }

  async waitForFresh(exchange, waitMs = this.waitTimeoutMs, freshMs = this.ttlMs) {
    const deadline = Date.now() + Math.max(0, waitMs);
    const interval = 200;
    while (Date.now() < deadline) {
      const record = await this.get(exchange);
      if (record && record.ageMs <= freshMs) {
        return record;
      }
      await this._sleep(interval);
    }
    return null;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SharedBalanceCache;
