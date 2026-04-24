import { HealthChecker, HealthStatus } from '../middleware/healthCheck.js';

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

function getEnvNumber(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getByPath(source, path, defaultValue = null) {
  if (!path) {
    return source ?? defaultValue;
  }

  const parts = String(path).split('.');
  let current = source;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return defaultValue;
    }

    current = current[part];
  }

  return current ?? defaultValue;
}

function setByPath(target, path, value) {
  const parts = String(path).split('.');
  let current = target;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!isPlainObject(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }

  current[parts[parts.length - 1]] = value;
}

function toTimestamp(value, fallback = null) {
  if (value == null || value === '') {
    return fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? fallback : timestamp;
}

function normalizeTrade(trade = {}) {
  const realizedPnl = Number(
    trade.realizedPnl
    ?? trade.realizedPnL
    ?? trade.pnl
    ?? trade.profit
    ?? 0
  );

  return {
    ...trade,
    id: trade.id || trade.tradeId || trade.orderId || null,
    tradeId: trade.tradeId || trade.id || null,
    realizedPnl,
    realizedPnL: realizedPnl,
    timestamp: toTimestamp(trade.timestamp, Date.now()),
    amount: Number(trade.amount || 0),
    price: Number(trade.price || 0),
    fee: Number(trade.fee || 0),
    cost: Number(trade.cost || (Number(trade.amount || 0) * Number(trade.price || 0))),
  };
}

function normalizeBalancePayload(payload = {}) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (isPlainObject(payload.total) || isPlainObject(payload.free) || isPlainObject(payload.used)) {
    const currencies = new Set([
      ...Object.keys(payload.total || {}),
      ...Object.keys(payload.free || {}),
      ...Object.keys(payload.used || {}),
    ]);

    return Array.from(currencies).map((currency) => ({
      currency,
      total: Number(payload.total?.[currency] || 0),
      free: Number(payload.free?.[currency] ?? payload.total?.[currency] ?? 0),
      used: Number(payload.used?.[currency] || 0),
    }));
  }

  return Object.entries(payload).map(([currency, value]) => ({
    currency,
    total: Number(value?.total ?? value?.balance ?? value ?? 0),
    free: Number(value?.free ?? value?.available ?? value?.total ?? value ?? 0),
    used: Number(value?.used ?? value?.locked ?? 0),
  }));
}

export class RuntimeConfigManager {
  constructor(initialConfig = {}) {
    this.config = deepClone(initialConfig) || {};
  }

  get(path, defaultValue = null) {
    return deepClone(getByPath(this.config, path, defaultValue));
  }

  getAll() {
    return deepClone(this.config);
  }

  set(path, value) {
    setByPath(this.config, path, deepClone(value));
    return true;
  }

  async update(updates = {}) {
    this.config = mergeDeep(this.config, updates);
    return this.getAll();
  }

  async save() {
    return this.getAll();
  }
}

export class RuntimeTradeRepository {
  constructor(redisDb) {
    this.redisDb = redisDb;
  }

  async _loadTrades(filters = {}) {
    if (!this.redisDb) {
      return [];
    }

    const startTime = toTimestamp(filters.startDate, 0);
    const endTime = toTimestamp(filters.endDate, Date.now());
    let trades = await this.redisDb.getTradesByTimeRange(startTime, endTime);

    if (filters.symbol) {
      trades = trades.filter(trade => trade.symbol === filters.symbol);
    }

    if (filters.side) {
      const side = String(filters.side).toLowerCase();
      trades = trades.filter(trade => String(trade.side).toLowerCase() === side);
    }

    if (filters.strategy) {
      trades = trades.filter(trade => trade.strategy === filters.strategy);
    }

    return trades.map(normalizeTrade);
  }

  async getTradeHistory(options = {}) {
    const {
      limit = 20,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = options;

    let trades = await this._loadTrades(options);
    const direction = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;

    trades.sort((left, right) => {
      const valueLeft = left?.[sortBy] ?? 0;
      const valueRight = right?.[sortBy] ?? 0;

      if (valueLeft === valueRight) {
        return 0;
      }

      return valueLeft > valueRight ? direction : -direction;
    });

    const start = Math.max(0, Number(offset) || 0);
    const size = Math.max(0, Number(limit) || 20);

    return {
      trades: trades.slice(start, start + size),
      total: trades.length,
    };
  }

  async getTradeStats(options = {}) {
    const trades = await this._loadTrades(options);
    const normalizedTrades = trades.map(normalizeTrade);
    const totalTrades = normalizedTrades.length;
    const buyCount = normalizedTrades.filter(trade => String(trade.side).toLowerCase() === 'buy').length;
    const sellCount = normalizedTrades.filter(trade => String(trade.side).toLowerCase() === 'sell').length;
    const totalVolume = normalizedTrades.reduce((sum, trade) => sum + Number(trade.amount || 0), 0);
    const totalFees = normalizedTrades.reduce((sum, trade) => sum + Number(trade.fee || 0), 0);
    const totalPnL = normalizedTrades.reduce((sum, trade) => sum + Number(trade.realizedPnL || 0), 0);
    const winningTrades = normalizedTrades.filter(trade => Number(trade.realizedPnL || 0) > 0);
    const losingTrades = normalizedTrades.filter(trade => Number(trade.realizedPnL || 0) < 0);

    return {
      totalTrades,
      buyCount,
      sellCount,
      totalVolume,
      totalFees,
      totalPnL,
      winCount: winningTrades.length,
      lossCount: losingTrades.length,
      winRate: totalTrades > 0 ? winningTrades.length / totalTrades : 0,
      avgPnL: totalTrades > 0 ? totalPnL / totalTrades : 0,
      avgWin: winningTrades.length > 0
        ? winningTrades.reduce((sum, trade) => sum + Number(trade.realizedPnL || 0), 0) / winningTrades.length
        : 0,
      avgLoss: losingTrades.length > 0
        ? losingTrades.reduce((sum, trade) => sum + Number(trade.realizedPnL || 0), 0) / losingTrades.length
        : 0,
    };
  }

  async getById(id) {
    if (!this.redisDb) {
      return null;
    }

    const trade = await this.redisDb.getTradeById(id);
    return trade ? normalizeTrade(trade) : null;
  }
}

async function getOpenPositions(positionStore) {
  if (!positionStore) {
    return [];
  }

  if (positionStore.getAll) {
    return await positionStore.getAll();
  }

  if (positionStore.getOpenPositions) {
    return await positionStore.getOpenPositions();
  }

  return [];
}

export class RuntimeDashboardService {
  constructor({ tradeRepository, positionStore, strategyStore, exchangeManager }) {
    this.tradeRepository = tradeRepository;
    this.positionStore = positionStore;
    this.strategyStore = strategyStore;
    this.exchangeManager = exchangeManager;
  }

  _getPeriodStart(period = '7d') {
    const now = Date.now();
    const mapping = {
      '1d': 1,
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };

    const days = mapping[period] || 7;
    return now - (days - 1) * 24 * 60 * 60 * 1000;
  }

  async getSummary() {
    const [positions, strategies, allStats, todayStats] = await Promise.all([
      getOpenPositions(this.positionStore),
      this.strategyStore?.getAll?.() || [],
      this.tradeRepository?.getTradeStats?.({}) || {
        totalTrades: 0,
        totalPnL: 0,
      },
      this.tradeRepository?.getTradeStats?.({
        startDate: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
        endDate: new Date().toISOString(),
      }) || {
        totalTrades: 0,
        totalPnL: 0,
      },
    ]);

    const positionValue = positions.reduce((sum, position) => (
      sum + (Number(position.currentPrice || 0) * Number(position.amount || 0))
    ), 0);
    const unrealizedPnL = positions.reduce((sum, position) => (
      sum + Number(position.unrealizedPnl || 0)
    ), 0);
    const runningStrategies = strategies.filter(strategy => strategy.state === 'running').length;

    let availableBalance = 0;
    const primaryExchange = this.exchangeManager?.getPrimaryExchangeId?.();
    if (primaryExchange && this.exchangeManager?.getBalance) {
      try {
        const balance = await this.exchangeManager.getBalance(primaryExchange);
        availableBalance = normalizeBalancePayload(balance)
          .reduce((sum, item) => sum + Number(item.free || 0), 0);
      } catch {
        availableBalance = 0;
      }
    }

    return {
      totalAssets: availableBalance + positionValue,
      availableBalance,
      positionValue,
      todayPnL: Number(todayStats.totalPnL || 0),
      todayPnLPercent: 0,
      totalPnL: Number(allStats.totalPnL || 0) + unrealizedPnL,
      totalPnLPercent: 0,
      runningStrategies,
      totalStrategies: strategies.length,
      openPositions: positions.length,
      todayTrades: Number(todayStats.totalTrades || 0),
    };
  }

  async getPnLHistory(period = '7d') {
    const start = this._getPeriodStart(period);
    const end = Date.now();
    const { trades = [] } = await this.tradeRepository.getTradeHistory({
      startDate: new Date(start).toISOString(),
      endDate: new Date(end).toISOString(),
      limit: 5000,
      offset: 0,
      sortBy: 'timestamp',
      sortOrder: 'asc',
    });

    const buckets = new Map();
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= end) {
      const key = cursor.toISOString().slice(0, 10);
      buckets.set(key, 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const trade of trades) {
      const key = new Date(trade.timestamp).toISOString().slice(0, 10);
      buckets.set(key, Number(buckets.get(key) || 0) + Number(trade.realizedPnL || 0));
    }

    const dates = Array.from(buckets.keys());
    const values = dates.map(date => buckets.get(date) || 0);
    let cumulativePnL = 0;
    const cumulative = values.map((value) => {
      cumulativePnL += value;
      return cumulativePnL;
    });

    return { dates, values, cumulative };
  }
}

export class RuntimeExchangeManager {
  constructor(runner) {
    this.runner = runner;
  }

  _getExchange(id) {
    return this.runner.exchanges?.get?.(id) || null;
  }

  getPrimaryExchangeId() {
    return this.runner.options.exchange
      || this.runner.config?.exchange?.default
      || this.runner.exchanges?.keys?.().next?.().value
      || null;
  }

  getExchanges() {
    return this.runner.exchanges || new Map();
  }

  async updateExchange() {
    return true;
  }

  async testConnection(id) {
    const exchange = this._getExchange(id);
    if (!exchange) {
      return { success: false, message: 'Exchange not connected' };
    }

    const start = Date.now();
    if (typeof exchange.fetchTime === 'function') {
      const serverTime = await exchange.fetchTime();
      return {
        success: true,
        latency: Date.now() - start,
        serverTime: new Date(serverTime).toISOString(),
      };
    }

    return {
      success: true,
      latency: Date.now() - start,
      serverTime: new Date().toISOString(),
    };
  }

  async getBalance(id) {
    const exchange = this._getExchange(id);
    if (!exchange?.fetchBalance) {
      throw new Error('Balance API unavailable for this exchange');
    }

    return exchange.fetchBalance();
  }

  async getMarkets(id) {
    const exchange = this._getExchange(id);
    if (!exchange) {
      throw new Error('Exchange not connected');
    }

    if (exchange.markets && Object.keys(exchange.markets).length > 0) {
      return Object.values(exchange.markets);
    }

    if (typeof exchange.loadMarkets === 'function') {
      const markets = await exchange.loadMarkets();
      return Object.values(markets || {});
    }

    throw new Error('Market metadata unavailable for this exchange');
  }

  async getTicker(id, symbol) {
    const exchange = this._getExchange(id);
    if (!exchange?.fetchTicker) {
      throw new Error('Ticker API unavailable for this exchange');
    }

    return exchange.fetchTicker(symbol);
  }
}

export class RuntimeTradingEngine {
  constructor(runner) {
    this.runner = runner;
  }

  _ensureCurrentStrategy(strategyId) {
    const currentId = this.runner.runtimeStrategyId;
    if (!currentId || strategyId !== currentId) {
      throw new Error(`Only the loaded strategy "${currentId}" can be controlled at runtime`);
    }
  }

  _getPrimaryExchangeId() {
    return this.runner.options.exchange
      || this.runner.config?.exchange?.default
      || this.runner.exchanges?.keys?.().next?.().value
      || null;
  }

  isRunning() {
    return this.runner.status === 'running';
  }

  getActiveStrategies() {
    return this.runner.isStrategyActive?.() ? [this.runner.runtimeStrategyId] : [];
  }

  getMetrics() {
    const status = this.runner.getStatus?.() || {};
    return {
      ...status.stats,
      mode: status.mode,
      strategyRunning: this.runner.isStrategyActive?.() || false,
    };
  }

  async startStrategy(strategyId) {
    this._ensureCurrentStrategy(strategyId);

    if (this.runner.status !== 'running') {
      throw new Error('Trading system is not running');
    }

    if (this.runner.isStrategyActive?.()) {
      throw new Error('Strategy is already running');
    }

    if (this.runner.strategy?.start) {
      await this.runner.strategy.start();
    }

    await this.runner.setStrategyExecutionState?.('running');

    return {
      success: true,
      strategyId,
      state: 'running',
    };
  }

  async stopStrategy(strategyId) {
    this._ensureCurrentStrategy(strategyId);

    if (!this.runner.isStrategyActive?.()) {
      throw new Error('Strategy is not running');
    }

    if (this.runner.strategy?.stop) {
      await this.runner.strategy.stop();
    }

    await this.runner.setStrategyExecutionState?.('stopped');

    return {
      success: true,
      strategyId,
      state: 'stopped',
    };
  }

  async closePosition(symbol, percentage = 100) {
    if (!this.runner.executor?.executeOrder) {
      throw new Error('Order executor unavailable');
    }

    const ratio = Math.max(0, Math.min(100, Number(percentage) || 100)) / 100;
    if (ratio <= 0) {
      throw new Error('percentage must be greater than 0');
    }

    let amount = 0;
    let side = 'sell';
    const exchangeId = this._getPrimaryExchangeId();
    const virtualPosition = this.runner._virtualPositions?.get(symbol);

    if (virtualPosition?.amount > 0) {
      amount = Number(virtualPosition.amount) * ratio;
      side = 'sell';
    } else {
      const exchange = this.runner.exchanges?.get?.(exchangeId);
      if (!exchange?.fetchPositions) {
        throw new Error('Position close is unavailable for this exchange');
      }

      const positions = await exchange.fetchPositions();
      const target = (positions || []).find((position) => position.symbol === symbol);

      if (!target) {
        throw new Error(`Open position not found for ${symbol}`);
      }

      const rawAmount = Number(target.contracts ?? target.size ?? target.amount ?? 0);
      if (!Number.isFinite(rawAmount) || rawAmount === 0) {
        throw new Error(`Open position not found for ${symbol}`);
      }

      amount = Math.abs(rawAmount) * ratio;
      side = rawAmount > 0 ? 'sell' : 'buy';
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Open position not found for ${symbol}`);
    }

    return this.runner.executor.executeOrder({
      exchangeId,
      symbol,
      side,
      amount,
      type: 'market',
      reduceOnly: true,
    });
  }
}

export function createRuntimeHealthChecker({ runner, redisDb }) {
  const checker = new HealthChecker({
    cacheTimeMs: 2000,
    memoryWarningPercent: getEnvNumber('HEALTH_MEMORY_WARNING_PERCENT', 99),
    memoryCriticalPercent: getEnvNumber('HEALTH_MEMORY_CRITICAL_PERCENT', 100),
  });

  checker.registerComponent('database', async () => {
    if (!redisDb?.redis) {
      return {
        status: HealthStatus.HEALTHY,
        message: 'Redis persistence disabled',
      };
    }

    const start = Date.now();
    await redisDb.redis.ping();

    return {
      status: HealthStatus.HEALTHY,
      message: 'Redis connection healthy',
      details: {
        latency: Date.now() - start,
      },
    };
  });

  checker.registerComponent('exchange', async () => {
    const connected = runner.exchanges?.size || 0;

    if (connected === 0) {
      return {
        status: HealthStatus.UNHEALTHY,
        message: 'No exchanges connected',
      };
    }

    return {
      status: HealthStatus.HEALTHY,
      message: `${connected} exchanges connected`,
      details: {
        connected,
      },
    };
  });

  checker.registerComponent('strategy', async () => ({
    status: HealthStatus.HEALTHY,
    message: runner.isStrategyActive?.() ? 'Strategy is running' : 'Strategy is stopped',
    details: {
      strategyId: runner.runtimeStrategyId || null,
      state: runner.strategyExecutionState || 'unknown',
    },
  }));

  return checker;
}
