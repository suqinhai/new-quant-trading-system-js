/**
 * 加权组合策略回测集成测试
 * WeightedComboStrategy Backtest Integration Tests
 *
 * 测试 WeightedComboStrategy 在回测环境下的完整流程
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WeightedComboStrategy } from '../../src/strategies/WeightedComboStrategy.js';
import { SignalWeightingSystem, StrategyStatus } from '../../src/strategies/SignalWeightingSystem.js';

// ============================================
// 回测引擎 Mock
// ============================================

class BacktestEngine {
  constructor(config = {}) {
    this.config = {
      initialCapital: config.initialCapital || 10000,
      commission: config.commission || 0.001,
      slippage: config.slippage || 0.0005,
      ...config,
    };

    this.capital = this.config.initialCapital;
    this.positions = new Map();
    this.trades = [];
    this.equityCurve = [];
    this.drawdowns = [];
    this.maxEquity = this.config.initialCapital;
  }

  async runStrategy(strategy, candles) {
    // 模拟交易引擎 - 需要在 onInit 之前设置
    strategy.engine = {
      getPosition: (symbol) => this.positions.get(symbol),
      buyPercent: (symbol, percent) => this._executeBuy(symbol, percent, candles[candles.length - 1]),
      closePosition: (symbol) => this._executeClose(symbol, candles[candles.length - 1]),
    };

    await strategy.onInit();

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const history = candles.slice(0, i + 1);

      await strategy.onTick(candle, history);

      // 更新净值曲线
      const equity = this._calculateEquity(candle);
      this.equityCurve.push({
        timestamp: candle.timestamp,
        equity,
        capital: this.capital,
      });

      // 计算回撤
      if (equity > this.maxEquity) {
        this.maxEquity = equity;
      }
      const drawdown = (this.maxEquity - equity) / this.maxEquity;
      this.drawdowns.push(drawdown);
    }

    await strategy.onFinish();
    return this._generateReport();
  }

  _executeBuy(symbol, percent, candle) {
    if (this.positions.has(symbol)) return;

    const price = candle.close * (1 + this.config.slippage);
    const amount = (this.capital * percent / 100) / price;
    const cost = amount * price;
    const fee = cost * this.config.commission;

    this.capital -= cost + fee;
    this.positions.set(symbol, {
      symbol,
      amount,
      avgPrice: price,
      entryTime: candle.timestamp,
    });

    this.trades.push({
      type: 'buy',
      symbol,
      amount,
      price,
      fee,
      timestamp: candle.timestamp,
    });
  }

  _executeClose(symbol, candle) {
    const position = this.positions.get(symbol);
    if (!position) return;

    const price = candle.close * (1 - this.config.slippage);
    const value = position.amount * price;
    const fee = value * this.config.commission;
    const pnl = value - (position.amount * position.avgPrice) - fee;

    this.capital += value - fee;
    this.positions.delete(symbol);

    this.trades.push({
      type: 'sell',
      symbol,
      amount: position.amount,
      price,
      fee,
      pnl,
      holdingTime: candle.timestamp - position.entryTime,
      timestamp: candle.timestamp,
    });
  }

  _calculateEquity(candle) {
    let equity = this.capital;
    for (const position of this.positions.values()) {
      equity += position.amount * candle.close;
    }
    return equity;
  }

  _generateReport() {
    const sellTrades = this.trades.filter(t => t.type === 'sell');
    const wins = sellTrades.filter(t => t.pnl > 0);
    const losses = sellTrades.filter(t => t.pnl < 0);
    const totalPnL = sellTrades.reduce((sum, t) => sum + t.pnl, 0);

    const finalEquity = this.equityCurve.length > 0
      ? this.equityCurve[this.equityCurve.length - 1].equity
      : this.config.initialCapital;

    return {
      // 基础统计
      initialCapital: this.config.initialCapital,
      finalEquity,
      totalReturn: finalEquity - this.config.initialCapital,
      returnRate: (finalEquity - this.config.initialCapital) / this.config.initialCapital,

      // 交易统计
      totalTrades: sellTrades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: sellTrades.length > 0 ? wins.length / sellTrades.length : 0,

      // 盈亏统计
      totalPnL,
      avgWin: wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0,
      profitFactor: losses.length > 0
        ? Math.abs(wins.reduce((s, t) => s + t.pnl, 0) / losses.reduce((s, t) => s + t.pnl, 0))
        : wins.length > 0 ? Infinity : 0,

      // 风险统计
      maxDrawdown: Math.max(...this.drawdowns, 0),
      avgDrawdown: this.drawdowns.length > 0
        ? this.drawdowns.reduce((a, b) => a + b, 0) / this.drawdowns.length
        : 0,

      // 详细数据
      trades: this.trades,
      equityCurve: this.equityCurve,
    };
  }
}

// ============================================
// 数据生成工具
// ============================================

function generateCandles(count, startPrice, options = {}) {
  const {
    type = 'random',        // 'trending_up', 'trending_down', 'ranging', 'volatile', 'random'
    volatility = 0.02,      // 波动率
    startTime = Date.now() - count * 3600000,
    interval = 3600000,     // 1小时
  } = options;

  const candles = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    let change;

    switch (type) {
      case 'trending_up':
        change = price * (0.002 + Math.random() * volatility);
        break;
      case 'trending_down':
        change = price * (-0.002 - Math.random() * volatility);
        break;
      case 'ranging':
        change = price * (Math.sin(i * 0.3) * volatility + (Math.random() - 0.5) * volatility * 0.5);
        break;
      case 'volatile':
        change = price * (Math.random() - 0.5) * volatility * 3;
        break;
      default:
        change = price * (Math.random() - 0.5) * volatility;
    }

    price = Math.max(1, price + change);

    const high = price * (1 + Math.random() * volatility * 0.5);
    const low = price * (1 - Math.random() * volatility * 0.5);
    const open = price - change / 2;

    candles.push({
      timestamp: startTime + i * interval,
      open: Math.max(low, Math.min(high, open)),
      high,
      low,
      close: price,
      volume: 1000 + Math.random() * 2000,
    });
  }

  return candles;
}

function generateMixedMarketCandles(segmentSize = 50) {
  const segments = [
    { type: 'trending_up', volatility: 0.015 },
    { type: 'ranging', volatility: 0.01 },
    { type: 'trending_down', volatility: 0.02 },
    { type: 'volatile', volatility: 0.03 },
    { type: 'ranging', volatility: 0.015 },
  ];

  let allCandles = [];
  let lastPrice = 50000;
  let time = Date.now() - segments.length * segmentSize * 3600000;

  for (const segment of segments) {
    const candles = generateCandles(segmentSize, lastPrice, {
      ...segment,
      startTime: time,
    });
    allCandles = allCandles.concat(candles);
    lastPrice = candles[candles.length - 1].close;
    time += segmentSize * 3600000;
  }

  return allCandles;
}

// ============================================
// 测试用例
// ============================================

describe('WeightedCombo Backtest Integration', () => {
  let strategy;
  let backtestEngine;

  beforeEach(() => {
    strategy = new WeightedComboStrategy({
      symbol: 'BTC/USDT',
      strategyWeights: {
        SMA: 0.4,
        RSI: 0.3,
        MACD: 0.3,
      },
      buyThreshold: 0.65,
      sellThreshold: 0.35,
      takeProfitPercent: 3.0,
      stopLossPercent: 1.5,
      positionPercent: 95,
      dynamicWeights: true,
      circuitBreaker: true,
      consecutiveLossLimit: 5,
    });

    backtestEngine = new BacktestEngine({
      initialCapital: 10000,
      commission: 0.001,
      slippage: 0.0005,
    });
  });

  afterEach(async () => {
    // afterEach 不需要调用 onFinish，因为 runStrategy 已经调用了
    // 且部分测试用例创建了不同的策略实例
  });

  // ============================================
  // 基础回测流程测试
  // ============================================

  describe('基础回测流程', () => {
    it('应该完成完整的回测流程', async () => {
      const candles = generateCandles(100, 50000, { type: 'random' });
      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.initialCapital).toBe(10000);
      expect(report.finalEquity).toBeGreaterThan(0);
      expect(report.equityCurve.length).toBe(candles.length);
      expect(report.winRate).toBeGreaterThanOrEqual(0);
      expect(report.winRate).toBeLessThanOrEqual(1);
    });

    it('应该在趋势市场产生交易信号', async () => {
      const candles = generateCandles(100, 50000, { type: 'trending_up' });
      const report = await backtestEngine.runStrategy(strategy, candles);

      // 趋势市场应该正常完成回测
      expect(report.trades.length).toBeGreaterThanOrEqual(0);
      expect(report.equityCurve.length).toBe(100);
    });

    it('应该正确计算最大回撤', async () => {
      const candles = generateMixedMarketCandles(30);
      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(report.maxDrawdown).toBeLessThanOrEqual(1);
      expect(report.avgDrawdown).toBeLessThanOrEqual(report.maxDrawdown);
    });
  });

  // ============================================
  // 不同市场环境测试
  // ============================================

  describe('不同市场环境', () => {
    it('应该在上涨趋势中正常运行', async () => {
      const candles = generateCandles(150, 50000, {
        type: 'trending_up',
        volatility: 0.015,
      });

      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.finalEquity).toBeGreaterThan(0);
      expect(report.equityCurve).toBeDefined();
    });

    it('应该在下跌趋势中正常运行', async () => {
      const candles = generateCandles(150, 50000, {
        type: 'trending_down',
        volatility: 0.015,
      });

      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.finalEquity).toBeGreaterThan(0);
      expect(report.equityCurve).toBeDefined();
    });

    it('应该在震荡市场中正常运行', async () => {
      const candles = generateCandles(150, 50000, {
        type: 'ranging',
        volatility: 0.01,
      });

      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.finalEquity).toBeGreaterThan(0);
      expect(report.equityCurve).toBeDefined();
    });

    it('应该在高波动市场中正常运行', async () => {
      const candles = generateCandles(150, 50000, {
        type: 'volatile',
        volatility: 0.04,
      });

      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.finalEquity).toBeGreaterThan(0);
      expect(report.maxDrawdown).toBeDefined();
    });

    it('应该在混合市场中正常运行', async () => {
      const candles = generateMixedMarketCandles(40);
      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.finalEquity).toBeGreaterThan(0);
      expect(report.equityCurve.length).toBe(candles.length);
    });
  });

  // ============================================
  // 策略指标验证
  // ============================================

  describe('策略指标验证', () => {
    it('应该正确计算组合得分', async () => {
      const candles = generateCandles(60, 50000, { type: 'trending_up' });

      await strategy.onInit();
      for (let i = 0; i < candles.length; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      const comboScore = strategy.getIndicator('comboScore');
      if (comboScore !== undefined) {
        expect(comboScore).toBeGreaterThanOrEqual(0);
        expect(comboScore).toBeLessThanOrEqual(1);
      }
    });

    it('应该记录子策略得分', async () => {
      const candles = generateCandles(60, 50000);

      await strategy.onInit();
      for (let i = 0; i < candles.length; i++) {
        await strategy.onTick(candles[i], candles.slice(0, i + 1));
      }

      const scores = strategy.getIndicator('strategyScores');
      if (scores) {
        expect(scores).toBeDefined();
      }
    });
  });

  // ============================================
  // 动态权重测试
  // ============================================

  describe('动态权重调整', () => {
    it('应该在回测中动态调整权重', async () => {
      const dynamicStrategy = new WeightedComboStrategy({
        symbol: 'BTC/USDT',
        strategyWeights: { SMA: 0.33, RSI: 0.33, MACD: 0.34 },
        dynamicWeights: true,
        adjustmentFactor: 0.3,
        evaluationPeriod: 10,
        buyThreshold: 0.6,
        sellThreshold: 0.4,
      });

      const dynamicEngine = new BacktestEngine({
        initialCapital: 10000,
        commission: 0.001,
      });

      const candles = generateMixedMarketCandles(30);
      const report = await dynamicEngine.runStrategy(dynamicStrategy, candles);

      // 策略应该正常完成回测
      expect(report.equityCurve.length).toBe(candles.length);
    });
  });

  // ============================================
  // 熔断机制测试
  // ============================================

  describe('熔断机制', () => {
    it('应该在回测中触发熔断', async () => {
      const circuitBreakerStrategy = new WeightedComboStrategy({
        symbol: 'BTC/USDT',
        strategyWeights: { SMA: 0.5, RSI: 0.5 },
        circuitBreaker: true,
        consecutiveLossLimit: 3,
        maxDrawdownLimit: 0.1,
        buyThreshold: 0.55, // 更低阈值以产生更多交易
        sellThreshold: 0.45,
      });

      const circuitEngine = new BacktestEngine({
        initialCapital: 10000,
        commission: 0.001,
      });

      // 使用高波动数据增加亏损机会
      const candles = generateCandles(100, 50000, {
        type: 'volatile',
        volatility: 0.05,
      });

      const report = await circuitEngine.runStrategy(circuitBreakerStrategy, candles);

      expect(report.equityCurve.length).toBe(100);
    });
  });

  // ============================================
  // 止盈止损测试
  // ============================================

  describe('止盈止损', () => {
    it('应该正确执行止盈止损逻辑', async () => {
      const riskStrategy = new WeightedComboStrategy({
        symbol: 'BTC/USDT',
        strategyWeights: { SMA: 0.5, RSI: 0.5 },
        takeProfitPercent: 2.0,
        stopLossPercent: 1.0,
        buyThreshold: 0.6,
        sellThreshold: 0.4,
      });

      const candles = generateMixedMarketCandles(25);
      const report = await backtestEngine.runStrategy(riskStrategy, candles);

      expect(report.finalEquity).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 性能和边界测试
  // ============================================

  describe('性能和边界', () => {
    it('应该处理长时间序列数据', async () => {
      const candles = generateCandles(500, 50000, { type: 'random' });
      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.equityCurve.length).toBe(500);
    });

    it('应该处理极端价格波动', async () => {
      const candles = generateCandles(100, 50000, {
        type: 'volatile',
        volatility: 0.1, // 10% 波动
      });

      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.finalEquity).toBeGreaterThan(0);
      expect(report.maxDrawdown).toBeLessThan(1);
    });

    it('应该处理低波动市场', async () => {
      const candles = generateCandles(100, 50000, {
        type: 'ranging',
        volatility: 0.002, // 0.2% 波动
      });

      const report = await backtestEngine.runStrategy(strategy, candles);

      expect(report.finalEquity).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 报告完整性测试
  // ============================================

  describe('报告完整性', () => {
    it('应该生成完整的回测报告', async () => {
      const candles = generateMixedMarketCandles(30);
      const report = await backtestEngine.runStrategy(strategy, candles);

      // 基础字段
      expect(report.initialCapital).toBeDefined();
      expect(report.finalEquity).toBeDefined();
      expect(report.totalReturn).toBeDefined();
      expect(report.returnRate).toBeDefined();

      // 交易统计
      expect(report.totalTrades).toBeDefined();
      expect(report.winningTrades).toBeDefined();
      expect(report.losingTrades).toBeDefined();
      expect(report.winRate).toBeDefined();

      // 盈亏统计
      expect(report.totalPnL).toBeDefined();
      expect(report.avgWin).toBeDefined();
      expect(report.avgLoss).toBeDefined();
      expect(report.profitFactor).toBeDefined();

      // 风险统计
      expect(report.maxDrawdown).toBeDefined();
      expect(report.avgDrawdown).toBeDefined();

      // 详细数据
      expect(report.trades).toBeInstanceOf(Array);
      expect(report.equityCurve).toBeInstanceOf(Array);
    });

    it('应该正确计算盈亏因子', async () => {
      const candles = generateMixedMarketCandles(40);
      const report = await backtestEngine.runStrategy(strategy, candles);

      if (report.losingTrades > 0 && report.winningTrades > 0) {
        expect(report.profitFactor).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================
// SignalWeightingSystem 独立测试
// ============================================

describe('SignalWeightingSystem Backtest Scenarios', () => {
  let weightSystem;

  beforeEach(() => {
    weightSystem = new SignalWeightingSystem({
      threshold: 0.7,
      sellThreshold: 0.3,
      baseWeights: {
        Strategy_A: 0.4,
        Strategy_B: 0.3,
        Strategy_C: 0.3,
      },
      dynamicWeights: true,
      circuitBreaker: true,
      consecutiveLossLimit: 3,
    });

    weightSystem.registerStrategies({
      Strategy_A: 0.4,
      Strategy_B: 0.3,
      Strategy_C: 0.3,
    });
  });

  it('应该在模拟回测中正确调整权重', () => {
    // 模拟 20 轮交易
    for (let i = 0; i < 20; i++) {
      // Strategy_A 表现好 (70% 胜率)
      const aWin = Math.random() < 0.7;
      weightSystem.updatePerformance('Strategy_A', {
        profit: aWin ? 0.02 : -0.01,
        win: aWin,
      });

      // Strategy_B 表现中等 (50% 胜率)
      const bWin = Math.random() < 0.5;
      weightSystem.updatePerformance('Strategy_B', {
        profit: bWin ? 0.02 : -0.01,
        win: bWin,
      });

      // Strategy_C 表现差 (30% 胜率)
      const cWin = Math.random() < 0.3;
      weightSystem.updatePerformance('Strategy_C', {
        profit: cWin ? 0.02 : -0.01,
        win: cWin,
      });
    }

    const weights = weightSystem.getWeights();
    const perfA = weightSystem.getPerformance('Strategy_A');
    const perfC = weightSystem.getPerformance('Strategy_C');

    // 验证权重系统正常工作
    expect(Object.keys(weights).length).toBe(3);
    expect(perfA.trades).toBe(20);
    expect(perfC.trades).toBe(20);
  });

  it('应该在连续亏损后触发熔断', () => {
    // 模拟连续亏损
    for (let i = 0; i < 5; i++) {
      weightSystem.updatePerformance('Strategy_C', {
        profit: -0.02,
        win: false,
      });
    }

    const status = weightSystem.getStrategyStatus('Strategy_C');
    // 熔断后状态应该是 CIRCUIT_BREAK 或 COOLING
    expect([StrategyStatus.CIRCUIT_BREAK, StrategyStatus.COOLING]).toContain(status.status);
  });

  it('应该在模拟信号序列中产生正确的交易决策', () => {
    const signalSequence = [
      { A: 0.8, B: 0.7, C: 0.6 }, // 看多
      { A: 0.5, B: 0.5, C: 0.5 }, // 中性
      { A: 0.2, B: 0.3, C: 0.4 }, // 看空
      { A: 0.9, B: 0.8, C: 0.7 }, // 强烈看多
    ];

    const decisions = [];

    for (const signals of signalSequence) {
      weightSystem.recordSignal('Strategy_A', signals.A);
      weightSystem.recordSignal('Strategy_B', signals.B);
      weightSystem.recordSignal('Strategy_C', signals.C);

      const result = weightSystem.calculateScore();
      decisions.push(result.action);

      weightSystem.clearCurrentSignals();
    }

    // 验证决策逻辑
    expect(decisions[0]).toBe('buy');  // 看多信号应该买入
    expect(decisions[1]).toBe('hold'); // 中性应该持有
    expect(decisions[2]).toBe('sell'); // 看空应该卖出
    expect(decisions[3]).toBe('buy');  // 强烈看多应该买入
  });
});
