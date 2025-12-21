/**
 * 交易流程集成测试
 * @module tests/integration/tradingFlow.test.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExchangeMock, createFailingExchangeMock } from '../mocks/exchangeMock.js';

// ============================================
// 模拟交易引擎
// ============================================

class TradingEngineMock {
  constructor(config = {}) {
    this.config = {
      exchange: config.exchange || { default: 'binance' },
      risk: config.risk || {},
      ...config,
    };

    this.exchanges = new Map();
    this.strategies = new Map();
    this.positions = new Map();
    this.orders = [];
    this.events = [];
    this.running = false;

    // 风控管理器
    this.riskManager = {
      state: {
        tradingAllowed: true,
        dailyPnL: 0,
        currentPositions: 0,
        consecutiveLosses: 0,
      },
      checkOpenPosition: (params) => {
        if (!this.riskManager.state.tradingAllowed) {
          return { allowed: false, reasons: ['交易已被禁止'] };
        }
        if (this.riskManager.state.currentPositions >= (this.config.risk.maxPositions || 10)) {
          return { allowed: false, reasons: ['超过最大持仓数'] };
        }
        const maxDailyLoss = (this.config.risk.maxDailyLoss || 1000);
        if (Math.abs(this.riskManager.state.dailyPnL) >= maxDailyLoss && this.riskManager.state.dailyPnL < 0) {
          return { allowed: false, reasons: ['超过日亏损限制'] };
        }
        return { allowed: true, reasons: [] };
      },
      recordTrade: (trade) => {
        this.riskManager.state.dailyPnL += trade.pnl || 0;
        if (trade.side === 'buy') {
          this.riskManager.state.currentPositions++;
        } else if (trade.side === 'sell') {
          this.riskManager.state.currentPositions = Math.max(0, this.riskManager.state.currentPositions - 1);
        }
        if (trade.pnl < 0) {
          this.riskManager.state.consecutiveLosses++;
        } else if (trade.pnl > 0) {
          this.riskManager.state.consecutiveLosses = 0;
        }
      },
      getState: () => ({ ...this.riskManager.state }),
    };

    // 订单执行器
    this.orderExecutor = {
      executeOrder: async (orderInfo) => {
        const exchange = this.exchanges.get(orderInfo.exchangeId);
        if (!exchange) {
          throw new Error(`Exchange ${orderInfo.exchangeId} not found`);
        }

        try {
          const order = await exchange.createOrder(
            orderInfo.symbol,
            orderInfo.type || 'limit',
            orderInfo.side,
            orderInfo.amount,
            orderInfo.price
          );

          this.orders.push({
            ...orderInfo,
            orderId: order.id,
            status: 'filled',
            filledAt: Date.now(),
          });

          return { success: true, order };
        } catch (error) {
          this.orders.push({
            ...orderInfo,
            status: 'failed',
            error: error.message,
          });
          throw error;
        }
      },
    };
  }

  emit(event, data) {
    this.events.push({ event, data, timestamp: Date.now() });
  }

  async initialize() {
    this.emit('initialized');
  }

  async start() {
    this.running = true;
    this.emit('started');
  }

  async stop() {
    this.running = false;
    for (const [name, strategy] of this.strategies) {
      await strategy.onFinish?.();
    }
    this.emit('stopped');
  }

  addExchange(id, exchange) {
    this.exchanges.set(id, exchange);
  }

  async runStrategy(name, config) {
    const strategy = {
      name,
      config,
      running: true,
    };
    this.strategies.set(name, strategy);
    this.emit('strategyStarted', { name, config });
    return strategy;
  }

  async stopStrategy(name) {
    const strategy = this.strategies.get(name);
    if (strategy) {
      strategy.running = false;
      this.strategies.delete(name);
      this.emit('strategyStopped', { name });
    }
  }

  async processSignal(signal) {
    // 检查风控
    const riskCheck = this.riskManager.checkOpenPosition({
      symbol: signal.symbol,
      side: signal.side,
      amount: signal.amount,
      price: signal.price,
    });

    if (!riskCheck.allowed) {
      this.emit('signalRejected', { signal, reasons: riskCheck.reasons });
      return { success: false, reasons: riskCheck.reasons };
    }

    // 执行订单
    try {
      const result = await this.orderExecutor.executeOrder({
        exchangeId: this.config.exchange.default,
        symbol: signal.symbol,
        side: signal.side,
        amount: signal.amount,
        price: signal.price,
        type: signal.type || 'limit',
      });

      // 更新持仓
      if (signal.side === 'buy') {
        this.positions.set(signal.symbol, {
          symbol: signal.symbol,
          amount: signal.amount,
          avgPrice: signal.price,
          side: 'long',
        });
      } else {
        this.positions.delete(signal.symbol);
      }

      // 记录交易
      this.riskManager.recordTrade({
        symbol: signal.symbol,
        side: signal.side,
        amount: signal.amount,
        price: signal.price,
        pnl: signal.pnl || 0,
      });

      this.emit('orderExecuted', { signal, result });
      return { success: true, result };
    } catch (error) {
      this.emit('orderFailed', { signal, error });
      return { success: false, error };
    }
  }

  getPosition(symbol) {
    return this.positions.get(symbol);
  }

  getStatus() {
    return {
      running: this.running,
      exchanges: this.exchanges.size,
      strategies: this.strategies.size,
      positions: this.positions.size,
      orders: this.orders.length,
    };
  }

  getAccountInfo() {
    const positions = Array.from(this.positions.values());
    return {
      positions,
      totalPositions: positions.length,
      riskState: this.riskManager.getState(),
    };
  }
}

// ============================================
// 测试用例
// ============================================

describe('Trading Flow Integration', () => {
  let engine;
  let mockExchange;

  beforeEach(async () => {
    mockExchange = createExchangeMock();
    engine = new TradingEngineMock({
      exchange: { default: 'binance' },
      risk: {
        maxPositions: 5,
        maxDailyLoss: 1000,
      },
    });
    engine.addExchange('binance', mockExchange);
    await engine.initialize();
    await engine.start();
  });

  afterEach(async () => {
    await engine.stop();
    vi.clearAllMocks();
  });

  // ============================================
  // 基本流程测试
  // ============================================

  describe('基本交易流程', () => {
    it('应该完成从信号到成交的完整流程', async () => {
      const signal = {
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
        type: 'limit',
      };

      const result = await engine.processSignal(signal);

      expect(result.success).toBe(true);
      expect(engine.orders.length).toBe(1);
      expect(engine.orders[0].status).toBe('filled');
      expect(engine.positions.has('BTC/USDT')).toBe(true);

      const executedEvent = engine.events.find(e => e.event === 'orderExecuted');
      expect(executedEvent).toBeDefined();
    });

    it('应该正确处理买入和卖出流程', async () => {
      // 买入
      await engine.processSignal({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(engine.positions.has('BTC/USDT')).toBe(true);
      expect(engine.riskManager.state.currentPositions).toBe(1);

      // 卖出
      await engine.processSignal({
        symbol: 'BTC/USDT',
        side: 'sell',
        amount: 0.1,
        price: 51000,
        pnl: 100,
      });

      expect(engine.positions.has('BTC/USDT')).toBe(false);
      expect(engine.riskManager.state.currentPositions).toBe(0);
      expect(engine.riskManager.state.dailyPnL).toBe(100);
    });

    it('应该正确更新风控状态', async () => {
      await engine.processSignal({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      await engine.processSignal({
        symbol: 'ETH/USDT',
        side: 'buy',
        amount: 1,
        price: 3000,
      });

      const state = engine.riskManager.getState();
      expect(state.currentPositions).toBe(2);
    });
  });

  // ============================================
  // 风控拦截测试
  // ============================================

  describe('风控拦截', () => {
    it('应该在超过最大持仓数时拒绝订单', async () => {
      // 创建 5 个持仓（达到限制）
      for (let i = 0; i < 5; i++) {
        await engine.processSignal({
          symbol: `COIN${i}/USDT`,
          side: 'buy',
          amount: 1,
          price: 100,
        });
      }

      // 第 6 个应该被拒绝
      const result = await engine.processSignal({
        symbol: 'COIN5/USDT',
        side: 'buy',
        amount: 1,
        price: 100,
      });

      expect(result.success).toBe(false);
      expect(result.reasons[0]).toContain('持仓');

      const rejectedEvent = engine.events.find(e => e.event === 'signalRejected');
      expect(rejectedEvent).toBeDefined();
    });

    it('应该在超过日亏损限制时拒绝订单', async () => {
      // 模拟亏损
      engine.riskManager.state.dailyPnL = -1000;

      const result = await engine.processSignal({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(false);
      expect(result.reasons[0]).toContain('日亏损');
    });

    it('应该在交易被禁止时拒绝所有订单', async () => {
      engine.riskManager.state.tradingAllowed = false;

      const result = await engine.processSignal({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(false);
      expect(result.reasons[0]).toContain('禁止');
    });
  });

  // ============================================
  // 错误处理测试
  // ============================================

  describe('错误处理', () => {
    it('应该在交易所不存在时返回错误', async () => {
      engine.exchanges.clear(); // 移除所有交易所

      const result = await engine.processSignal({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该在下单失败时正确处理', async () => {
      const failingExchange = createFailingExchangeMock('network', Infinity);
      engine.exchanges.set('binance', failingExchange);

      const result = await engine.processSignal({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      expect(result.success).toBe(false);
      expect(engine.orders[0].status).toBe('failed');

      const failedEvent = engine.events.find(e => e.event === 'orderFailed');
      expect(failedEvent).toBeDefined();
    });
  });

  // ============================================
  // 策略管理测试
  // ============================================

  describe('策略管理', () => {
    it('应该正确启动和停止策略', async () => {
      await engine.runStrategy('sma', {
        symbols: ['BTC/USDT'],
        fastPeriod: 10,
        slowPeriod: 20,
      });

      expect(engine.strategies.has('sma')).toBe(true);

      const startedEvent = engine.events.find(e => e.event === 'strategyStarted');
      expect(startedEvent).toBeDefined();
      expect(startedEvent.data.name).toBe('sma');

      await engine.stopStrategy('sma');

      expect(engine.strategies.has('sma')).toBe(false);

      const stoppedEvent = engine.events.find(e => e.event === 'strategyStopped');
      expect(stoppedEvent).toBeDefined();
    });

    it('应该支持同时运行多个策略', async () => {
      await engine.runStrategy('sma', { symbols: ['BTC/USDT'] });
      await engine.runStrategy('rsi', { symbols: ['ETH/USDT'] });
      await engine.runStrategy('macd', { symbols: ['BNB/USDT'] });

      expect(engine.strategies.size).toBe(3);
    });
  });

  // ============================================
  // 状态查询测试
  // ============================================

  describe('状态查询', () => {
    it('应该返回正确的引擎状态', async () => {
      await engine.runStrategy('sma', { symbols: ['BTC/USDT'] });
      await engine.processSignal({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      const status = engine.getStatus();

      expect(status.running).toBe(true);
      expect(status.exchanges).toBe(1);
      expect(status.strategies).toBe(1);
      expect(status.positions).toBe(1);
      expect(status.orders).toBe(1);
    });

    it('应该返回正确的账户信息', async () => {
      await engine.processSignal({
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.1,
        price: 50000,
      });

      const account = engine.getAccountInfo();

      expect(account.positions.length).toBe(1);
      expect(account.positions[0].symbol).toBe('BTC/USDT');
      expect(account.riskState.currentPositions).toBe(1);
    });
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('生命周期', () => {
    it('应该正确处理初始化-启动-停止流程', async () => {
      const newEngine = new TradingEngineMock({
        exchange: { default: 'binance' },
      });

      await newEngine.initialize();
      expect(newEngine.events.some(e => e.event === 'initialized')).toBe(true);

      await newEngine.start();
      expect(newEngine.running).toBe(true);
      expect(newEngine.events.some(e => e.event === 'started')).toBe(true);

      await newEngine.stop();
      expect(newEngine.running).toBe(false);
      expect(newEngine.events.some(e => e.event === 'stopped')).toBe(true);
    });
  });

  // ============================================
  // 并发处理测试
  // ============================================

  describe('并发处理', () => {
    it('应该正确处理并发订单', async () => {
      const signals = [
        { symbol: 'BTC/USDT', side: 'buy', amount: 0.1, price: 50000 },
        { symbol: 'ETH/USDT', side: 'buy', amount: 1, price: 3000 },
        { symbol: 'BNB/USDT', side: 'buy', amount: 10, price: 300 },
      ];

      const results = await Promise.all(
        signals.map(signal => engine.processSignal(signal))
      );

      expect(results.every(r => r.success)).toBe(true);
      expect(engine.orders.length).toBe(3);
      expect(engine.positions.size).toBe(3);
    });
  });
});

// ============================================
// 回测集成测试
// ============================================

describe('Backtest Integration', () => {
  class BacktestEngineMock {
    constructor(config = {}) {
      this.config = {
        initialCapital: config.initialCapital || 10000,
        commission: config.commission || 0.001,
        slippage: config.slippage || 0.0005,
        ...config,
      };

      this.capital = this.config.initialCapital;
      this.equity = this.config.initialCapital;
      this.positions = new Map();
      this.trades = [];
      this.strategy = null;
    }

    setStrategy(strategy) {
      this.strategy = strategy;
    }

    loadData(symbol, data) {
      this.data = { symbol, candles: data };
    }

    async run() {
      if (!this.strategy || !this.data) {
        throw new Error('Strategy and data must be set');
      }

      const { candles } = this.data;

      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const history = candles.slice(0, i + 1);

        // 调用策略
        await this.strategy.onTick(candle, history);

        // 处理信号
        const signal = this.strategy.getSignal();
        if (signal) {
          this._executeTrade(signal, candle);
          this.strategy.clearSignal();
        }
      }

      return this._generateReport();
    }

    _executeTrade(signal, candle) {
      const slippage = signal.type === 'buy' ? this.config.slippage : -this.config.slippage;
      const price = candle.close * (1 + slippage);
      const amount = Math.min(
        (this.capital * 0.1) / price, // 使用 10% 资金
        signal.amount || 1
      );

      const cost = amount * price;
      const fee = cost * this.config.commission;

      if (signal.type === 'buy') {
        this.capital -= cost + fee;
        this.positions.set(this.data.symbol, {
          amount,
          avgPrice: price,
          entryTime: candle.timestamp,
        });
      } else if (signal.type === 'sell') {
        const position = this.positions.get(this.data.symbol);
        if (position) {
          const sellValue = position.amount * price;
          const pnl = sellValue - (position.amount * position.avgPrice) - fee;
          this.capital += sellValue - fee;
          this.trades.push({
            symbol: this.data.symbol,
            side: 'sell',
            amount: position.amount,
            entryPrice: position.avgPrice,
            exitPrice: price,
            pnl,
            timestamp: candle.timestamp,
          });
          this.positions.delete(this.data.symbol);
        }
      }
    }

    _generateReport() {
      const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0);
      const winningTrades = this.trades.filter(t => t.pnl > 0);
      const losingTrades = this.trades.filter(t => t.pnl < 0);

      return {
        initialCapital: this.config.initialCapital,
        finalCapital: this.capital,
        totalReturn: totalPnL,
        returnRate: totalPnL / this.config.initialCapital,
        totalTrades: this.trades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: this.trades.length > 0 ? winningTrades.length / this.trades.length : 0,
        avgWin: winningTrades.length > 0
          ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length
          : 0,
        avgLoss: losingTrades.length > 0
          ? Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length)
          : 0,
        trades: this.trades,
      };
    }
  }

  it('应该完成完整的回测流程', async () => {
    // 简单的策略 Mock
    const strategy = {
      indicators: {},
      signal: null,
      onTick: async function(candle, history) {
        if (history.length < 10) return;

        const closes = history.slice(-10).map(h => h.close);
        const sma = closes.reduce((a, b) => a + b, 0) / 10;

        const prevSMA = this.indicators.sma;
        this.indicators.sma = sma;

        if (prevSMA && candle.close > sma && history[history.length - 2]?.close <= prevSMA) {
          this.signal = { type: 'buy' };
        } else if (prevSMA && candle.close < sma && history[history.length - 2]?.close >= prevSMA) {
          this.signal = { type: 'sell' };
        }
      },
      getSignal: function() { return this.signal; },
      clearSignal: function() { this.signal = null; },
    };

    // 生成测试数据
    const candles = [];
    let price = 100;
    for (let i = 0; i < 100; i++) {
      const change = (Math.sin(i / 10) * 5) + (Math.random() - 0.5) * 2;
      price += change;
      candles.push({
        timestamp: Date.now() - (100 - i) * 3600000,
        open: price - 0.5,
        high: price + 1,
        low: price - 1,
        close: price,
        volume: 1000,
      });
    }

    const backtest = new BacktestEngineMock({
      initialCapital: 10000,
      commission: 0.001,
    });

    backtest.setStrategy(strategy);
    backtest.loadData('TEST/USDT', candles);

    const result = await backtest.run();

    expect(result.initialCapital).toBe(10000);
    expect(result.totalTrades).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
  });
});
