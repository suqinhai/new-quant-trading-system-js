# 策略开发指南

## 目录

1. [策略架构](#策略架构)
2. [快速开始](#快速开始)
3. [策略基类详解](#策略基类详解)
4. [开发自定义策略](#开发自定义策略)
5. [技术指标使用](#技术指标使用)
6. [信号生成](#信号生成)
7. [风控集成](#风控集成)
8. [回测验证](#回测验证)
9. [策略优化](#策略优化)
10. [最佳实践](#最佳实践)

---

## 策略架构

### 整体架构

```
┌─────────────────────────────────────────────────────┐
│                 Strategy Registry                    │
│  趋势: SMA, MACD  震荡: RSI, BollingerBands        │
│  波动率: ATRBreakout, BollingerWidth, VolRegime    │
│  套利: Grid, FundingArb                             │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                  BaseStrategy                        │
│  - 生命周期管理 (init, start, stop)                  │
│  - 事件处理 (onTick, onCandle, onTicker)            │
│  - 信号发送 (emit signal)                            │
│  - 状态管理 (position, orders)                       │
└─────────────────────┬───────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
     ┌─────────┐ ┌─────────┐ ┌─────────┐
     │ 行情引擎 │ │ 风控系统 │ │ 执行器  │
     └─────────┘ └─────────┘ └─────────┘
```

### 策略生命周期

```
创建 → 初始化 → 运行 → 停止 → 销毁
  │       │        │       │
  │       │        │       └─ onStop()
  │       │        └─ onTick()/onCandle()
  │       └─ onInit()
  └─ constructor()
```

---

## 快速开始

### 最简策略示例

```javascript
// src/strategies/MyFirstStrategy.js
const BaseStrategy = require('./BaseStrategy');

class MyFirstStrategy extends BaseStrategy {
  constructor(config) {
    super(config);
    this.name = 'MyFirstStrategy';
  }

  async onInit() {
    console.log('策略初始化');
  }

  async onCandle(candle) {
    // 简单策略：价格上涨买入，下跌卖出
    if (candle.close > candle.open) {
      this.emit('signal', {
        action: 'buy',
        symbol: this.config.symbol,
        amount: 0.01
      });
    } else {
      this.emit('signal', {
        action: 'sell',
        symbol: this.config.symbol,
        amount: 0.01
      });
    }
  }
}

module.exports = MyFirstStrategy;
```

### 注册策略

```javascript
// src/strategies/index.js
const StrategyRegistry = require('./StrategyRegistry');
const MyFirstStrategy = require('./MyFirstStrategy');

StrategyRegistry.register('MyFirst', MyFirstStrategy);
```

### 使用策略

```javascript
// 通过配置使用
const strategyConfig = {
  type: 'MyFirst',
  symbol: 'BTC/USDT',
  timeframe: '1h'
};
```

---

## 策略基类详解

### BaseStrategy 类

```javascript
const EventEmitter = require('events');

class BaseStrategy extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.symbol = config.symbol;
    this.timeframe = config.timeframe;
    this.position = null;
    this.orders = [];
    this.status = 'stopped';
  }

  // ========== 生命周期方法 ==========

  /**
   * 策略初始化
   * 在这里加载历史数据、初始化指标等
   */
  async onInit() {}

  /**
   * 策略启动
   */
  async start() {
    this.status = 'running';
    await this.onInit();
  }

  /**
   * 策略停止
   */
  async stop() {
    this.status = 'stopped';
  }

  // ========== 数据事件处理 ==========

  /**
   * K线数据更新（回测模式）
   * @param {Object} candle - K线数据
   */
  async onTick(candle) {}

  /**
   * K线数据更新（实盘模式）
   * @param {Object} data - { symbol, timeframe, candle }
   */
  async onCandle(data) {}

  /**
   * Ticker 数据更新
   * @param {Object} data - { symbol, price, volume, ... }
   */
  async onTicker(data) {}

  /**
   * 订单簿数据更新
   * @param {Object} data - { symbol, bids, asks }
   */
  async onOrderBook(data) {}

  /**
   * 资金费率更新
   * @param {Object} data - { symbol, rate, nextFundingTime }
   */
  async onFundingRate(data) {}

  // ========== 订单事件处理 ==========

  /**
   * 订单成交回调
   * @param {Object} order - 订单信息
   */
  async onOrderFilled(order) {}

  /**
   * 订单取消回调
   * @param {Object} order - 订单信息
   */
  async onOrderCancelled(order) {}

  // ========== 工具方法 ==========

  /**
   * 发送交易信号
   * @param {Object} signal - { action, symbol, amount, price, ... }
   */
  sendSignal(signal) {
    this.emit('signal', {
      ...signal,
      strategyId: this.id,
      strategyName: this.name,
      timestamp: Date.now()
    });
  }
}
```

### 可用属性

| 属性 | 类型 | 描述 |
|------|------|------|
| config | Object | 策略配置 |
| symbol | String | 交易对 |
| timeframe | String | 时间周期 |
| position | Object | 当前持仓 |
| orders | Array | 待处理订单 |
| status | String | 策略状态 |

### 可用事件

| 事件 | 数据 | 描述 |
|------|------|------|
| signal | Signal 对象 | 发送交易信号 |
| error | Error 对象 | 报告错误 |
| log | 日志对象 | 记录日志 |

---

## 开发自定义策略

### 完整策略模板

```javascript
// src/strategies/CustomStrategy.js
const BaseStrategy = require('./BaseStrategy');
const { SMA, RSI, MACD } = require('technicalindicators');
const Decimal = require('decimal.js');

class CustomStrategy extends BaseStrategy {
  constructor(config) {
    super(config);
    this.name = 'CustomStrategy';

    // 策略参数
    this.params = {
      smaPeriod: config.params?.smaPeriod || 20,
      rsiPeriod: config.params?.rsiPeriod || 14,
      rsiOverbought: config.params?.rsiOverbought || 70,
      rsiOversold: config.params?.rsiOversold || 30,
      positionSize: config.params?.positionSize || 0.01
    };

    // 数据缓存
    this.candles = [];
    this.indicators = {
      sma: [],
      rsi: []
    };
  }

  /**
   * 初始化
   */
  async onInit() {
    console.log(`${this.name} 初始化，参数:`, this.params);

    // 可以在这里加载历史数据
    // const history = await this.fetchHistory();
    // this.candles = history;
    // this.calculateIndicators();
  }

  /**
   * 处理 K 线数据
   */
  async onCandle(data) {
    const { candle } = data;

    // 添加新 K 线
    this.candles.push(candle);

    // 保持数据窗口大小
    if (this.candles.length > 200) {
      this.candles.shift();
    }

    // 计算指标
    this.calculateIndicators();

    // 生成信号
    await this.generateSignal();
  }

  /**
   * 计算技术指标
   */
  calculateIndicators() {
    const closes = this.candles.map(c => c.close);

    // 计算 SMA
    if (closes.length >= this.params.smaPeriod) {
      this.indicators.sma = SMA.calculate({
        period: this.params.smaPeriod,
        values: closes
      });
    }

    // 计算 RSI
    if (closes.length >= this.params.rsiPeriod) {
      this.indicators.rsi = RSI.calculate({
        period: this.params.rsiPeriod,
        values: closes
      });
    }
  }

  /**
   * 生成交易信号
   */
  async generateSignal() {
    // 确保有足够数据
    if (this.indicators.sma.length < 2 || this.indicators.rsi.length < 1) {
      return;
    }

    const currentPrice = this.candles[this.candles.length - 1].close;
    const currentSMA = this.indicators.sma[this.indicators.sma.length - 1];
    const currentRSI = this.indicators.rsi[this.indicators.rsi.length - 1];

    // 买入条件：价格在 SMA 上方，RSI 超卖
    if (currentPrice > currentSMA && currentRSI < this.params.rsiOversold) {
      if (!this.position || this.position.side !== 'long') {
        this.sendSignal({
          action: 'buy',
          symbol: this.symbol,
          amount: this.params.positionSize,
          reason: `价格 ${currentPrice} > SMA ${currentSMA.toFixed(2)}, RSI ${currentRSI.toFixed(2)} 超卖`
        });
      }
    }

    // 卖出条件：价格在 SMA 下方，RSI 超买
    if (currentPrice < currentSMA && currentRSI > this.params.rsiOverbought) {
      if (!this.position || this.position.side !== 'short') {
        this.sendSignal({
          action: 'sell',
          symbol: this.symbol,
          amount: this.params.positionSize,
          reason: `价格 ${currentPrice} < SMA ${currentSMA.toFixed(2)}, RSI ${currentRSI.toFixed(2)} 超买`
        });
      }
    }
  }

  /**
   * 订单成交处理
   */
  async onOrderFilled(order) {
    console.log(`订单成交: ${order.side} ${order.amount} @ ${order.price}`);

    // 更新持仓状态
    if (order.side === 'buy') {
      this.position = {
        side: 'long',
        size: order.amount,
        entryPrice: order.price
      };
    } else {
      this.position = null;
    }
  }
}

module.exports = CustomStrategy;
```

### 策略配置参数

```javascript
// 使用策略时的配置
const config = {
  type: 'Custom',
  symbol: 'BTC/USDT',
  timeframe: '1h',
  params: {
    smaPeriod: 20,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    positionSize: 0.01
  },
  risk: {
    maxPositionSize: 0.1,
    stopLoss: 0.02,
    takeProfit: 0.05
  }
};
```

---

## 技术指标使用

### 内置指标库

系统使用 `technicalindicators` 库，支持以下指标：

#### 趋势指标

```javascript
const { SMA, EMA, WMA, WEMA, MACD } = require('technicalindicators');

// 简单移动平均
const sma = SMA.calculate({ period: 20, values: closes });

// 指数移动平均
const ema = EMA.calculate({ period: 20, values: closes });

// MACD
const macd = MACD.calculate({
  values: closes,
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  SimpleMAOscillator: false,
  SimpleMASignal: false
});
// 返回: [{ MACD, signal, histogram }, ...]
```

#### 震荡指标

```javascript
const { RSI, Stochastic, CCI, WilliamsR } = require('technicalindicators');

// RSI
const rsi = RSI.calculate({ period: 14, values: closes });

// 随机指标
const stoch = Stochastic.calculate({
  high: highs,
  low: lows,
  close: closes,
  period: 14,
  signalPeriod: 3
});
// 返回: [{ k, d }, ...]

// CCI
const cci = CCI.calculate({
  high: highs,
  low: lows,
  close: closes,
  period: 20
});
```

#### 波动率指标

```javascript
const { BollingerBands, ATR } = require('technicalindicators');

// 布林带
const bb = BollingerBands.calculate({
  period: 20,
  values: closes,
  stdDev: 2
});
// 返回: [{ upper, middle, lower, pb }, ...]

// ATR
const atr = ATR.calculate({
  high: highs,
  low: lows,
  close: closes,
  period: 14
});
```

#### 成交量指标

```javascript
const { OBV, VWAP, MFI } = require('technicalindicators');

// OBV
const obv = OBV.calculate({
  close: closes,
  volume: volumes
});

// VWAP
const vwap = VWAP.calculate({
  high: highs,
  low: lows,
  close: closes,
  volume: volumes
});
```

### 自定义指标

```javascript
// src/utils/customIndicators.js

/**
 * 计算动量
 */
function momentum(values, period) {
  const result = [];
  for (let i = period; i < values.length; i++) {
    result.push(values[i] - values[i - period]);
  }
  return result;
}

/**
 * 计算价格通道
 */
function priceChannel(highs, lows, period) {
  const result = [];
  for (let i = period - 1; i < highs.length; i++) {
    const highSlice = highs.slice(i - period + 1, i + 1);
    const lowSlice = lows.slice(i - period + 1, i + 1);
    result.push({
      upper: Math.max(...highSlice),
      lower: Math.min(...lowSlice),
      middle: (Math.max(...highSlice) + Math.min(...lowSlice)) / 2
    });
  }
  return result;
}

module.exports = { momentum, priceChannel };
```

---

## 信号生成

### 信号格式

```javascript
// 标准信号格式
const signal = {
  // 必填字段
  action: 'buy',         // 'buy' | 'sell' | 'close'
  symbol: 'BTC/USDT',    // 交易对
  amount: 0.01,          // 数量

  // 可选字段
  type: 'market',        // 'market' | 'limit'
  price: 45000,          // 限价单价格
  stopLoss: 44000,       // 止损价
  takeProfit: 47000,     // 止盈价
  reason: '买入原因',     // 信号原因（用于日志）

  // 自动添加
  strategyId: 1,
  strategyName: 'MyStrategy',
  timestamp: 1705312800000
};
```

### 信号发送

```javascript
// 方法一：使用 sendSignal（推荐）
this.sendSignal({
  action: 'buy',
  symbol: this.symbol,
  amount: 0.01
});

// 方法二：直接 emit
this.emit('signal', {
  action: 'buy',
  symbol: this.symbol,
  amount: 0.01,
  strategyId: this.id,
  timestamp: Date.now()
});
```

### 信号过滤

```javascript
class MyStrategy extends BaseStrategy {
  constructor(config) {
    super(config);
    this.lastSignalTime = 0;
    this.minSignalInterval = 60000; // 最小信号间隔 1 分钟
  }

  async generateSignal() {
    // 检查信号间隔
    if (Date.now() - this.lastSignalTime < this.minSignalInterval) {
      return;
    }

    // 检查是否已有持仓
    if (this.position && this.position.side === 'long') {
      return; // 已有多仓，不再开仓
    }

    // 发送信号
    this.sendSignal({ ... });
    this.lastSignalTime = Date.now();
  }
}
```

---

## 风控集成

### 策略内风控

```javascript
class MyStrategy extends BaseStrategy {
  constructor(config) {
    super(config);

    // 风控参数
    this.riskParams = {
      maxPositionSize: 0.1,    // 最大仓位比例
      stopLossPercent: 0.02,   // 止损百分比
      takeProfitPercent: 0.05, // 止盈百分比
      maxDailyTrades: 10,      // 日最大交易次数
      maxConsecutiveLosses: 3  // 最大连续亏损次数
    };

    this.dailyTradeCount = 0;
    this.consecutiveLosses = 0;
  }

  async generateSignal() {
    // 检查日交易次数
    if (this.dailyTradeCount >= this.riskParams.maxDailyTrades) {
      this.emit('log', { level: 'warn', message: '已达日交易上限' });
      return;
    }

    // 检查连续亏损
    if (this.consecutiveLosses >= this.riskParams.maxConsecutiveLosses) {
      this.emit('log', { level: 'warn', message: '连续亏损，暂停交易' });
      return;
    }

    // 计算仓位大小
    const positionSize = this.calculatePositionSize();

    // 发送带止损止盈的信号
    const currentPrice = this.candles[this.candles.length - 1].close;
    this.sendSignal({
      action: 'buy',
      symbol: this.symbol,
      amount: positionSize,
      stopLoss: currentPrice * (1 - this.riskParams.stopLossPercent),
      takeProfit: currentPrice * (1 + this.riskParams.takeProfitPercent)
    });

    this.dailyTradeCount++;
  }

  calculatePositionSize() {
    // 固定比例仓位
    const accountBalance = 10000; // 从账户获取
    return accountBalance * this.riskParams.maxPositionSize /
           this.candles[this.candles.length - 1].close;
  }

  async onOrderFilled(order) {
    if (order.pnl !== undefined) {
      if (order.pnl < 0) {
        this.consecutiveLosses++;
      } else {
        this.consecutiveLosses = 0;
      }
    }
  }

  // 每日重置
  resetDaily() {
    this.dailyTradeCount = 0;
  }
}
```

### 凯利公式仓位

```javascript
calculateKellyPosition(winRate, avgWinLossRatio) {
  // 凯利公式: f = (p * b - q) / b
  // p = 胜率, q = 1 - p, b = 盈亏比
  const f = (winRate * avgWinLossRatio - (1 - winRate)) / avgWinLossRatio;

  // 使用半凯利降低风险
  const halfKelly = Math.max(0, f / 2);

  // 限制最大仓位
  return Math.min(halfKelly, this.riskParams.maxPositionSize);
}
```

---

## 回测验证

### 运行回测

```bash
# 命令行回测
npm run backtest

# 指定策略回测
node src/backtest/runner.js --strategy MyStrategy --symbol BTC/USDT --start 2024-01-01 --end 2024-06-01
```

### 回测配置

```javascript
// backtest.config.js
module.exports = {
  strategy: 'CustomStrategy',
  symbol: 'BTC/USDT',
  timeframe: '1h',
  startDate: '2024-01-01',
  endDate: '2024-06-01',
  initialCapital: 10000,
  commission: 0.001,    // 手续费 0.1%
  slippage: 0.0005,     // 滑点 0.05%
  params: {
    smaPeriod: 20,
    rsiPeriod: 14
  }
};
```

### 回测报告

```javascript
// 回测结果示例
{
  summary: {
    totalReturn: 0.25,         // 总收益率 25%
    totalReturnAbs: 2500,      // 绝对收益
    annualizedReturn: 0.5,     // 年化收益率
    maxDrawdown: 0.08,         // 最大回撤 8%
    sharpeRatio: 1.8,          // 夏普比率
    sortinoRatio: 2.1,         // 索提诺比率
    calmarRatio: 3.1,          // 卡玛比率
    winRate: 0.58,             // 胜率 58%
    profitFactor: 1.8,         // 盈亏因子
    avgWin: 150,               // 平均盈利
    avgLoss: -80,              // 平均亏损
    tradesCount: 120,          // 交易次数
    winCount: 70,              // 盈利次数
    lossCount: 50              // 亏损次数
  },
  trades: [...],               // 交易记录
  equityCurve: [...],          // 权益曲线
  drawdownCurve: [...]         // 回撤曲线
}
```

### 回测分析

```javascript
// 分析回测结果
function analyzeBacktest(result) {
  const { trades, equityCurve } = result;

  // 按月统计
  const monthlyStats = groupByMonth(trades);

  // 盈利分布
  const pnlDistribution = calculateDistribution(trades.map(t => t.pnl));

  // 最长连续盈利/亏损
  const streaks = calculateStreaks(trades);

  // 风险调整收益
  const riskMetrics = {
    sharpe: calculateSharpe(equityCurve),
    sortino: calculateSortino(equityCurve),
    maxDrawdown: calculateMaxDrawdown(equityCurve)
  };

  return { monthlyStats, pnlDistribution, streaks, riskMetrics };
}
```

---

## 策略优化

### 参数优化

```javascript
// 网格搜索优化
async function gridSearchOptimization(strategyClass, paramRanges, backtestConfig) {
  const results = [];

  // 生成参数组合
  const paramCombinations = generateCombinations(paramRanges);

  for (const params of paramCombinations) {
    const config = { ...backtestConfig, params };
    const result = await runBacktest(strategyClass, config);

    results.push({
      params,
      sharpeRatio: result.summary.sharpeRatio,
      totalReturn: result.summary.totalReturn,
      maxDrawdown: result.summary.maxDrawdown
    });
  }

  // 按夏普比率排序
  results.sort((a, b) => b.sharpeRatio - a.sharpeRatio);

  return results;
}

// 参数范围
const paramRanges = {
  smaPeriod: [10, 15, 20, 25, 30],
  rsiPeriod: [7, 14, 21],
  rsiOverbought: [70, 75, 80],
  rsiOversold: [20, 25, 30]
};
```

### Walk-Forward 分析

```javascript
async function walkForwardAnalysis(strategy, data, trainRatio = 0.7) {
  const results = [];
  const windowSize = Math.floor(data.length * trainRatio);
  const stepSize = Math.floor(data.length * 0.1);

  for (let i = 0; i + windowSize < data.length; i += stepSize) {
    // 训练窗口
    const trainData = data.slice(i, i + windowSize);

    // 测试窗口
    const testData = data.slice(i + windowSize, i + windowSize + stepSize);

    // 在训练数据上优化参数
    const optimalParams = await optimizeParams(strategy, trainData);

    // 在测试数据上验证
    const testResult = await backtest(strategy, testData, optimalParams);

    results.push({
      trainPeriod: { start: i, end: i + windowSize },
      testPeriod: { start: i + windowSize, end: i + windowSize + stepSize },
      params: optimalParams,
      testReturn: testResult.totalReturn
    });
  }

  return results;
}
```

### 蒙特卡洛模拟

```javascript
function monteCarloSimulation(trades, iterations = 1000) {
  const results = [];

  for (let i = 0; i < iterations; i++) {
    // 随机打乱交易顺序
    const shuffledTrades = shuffle([...trades]);

    // 计算权益曲线
    let equity = 10000;
    const equityCurve = [equity];

    for (const trade of shuffledTrades) {
      equity += trade.pnl;
      equityCurve.push(equity);
    }

    results.push({
      finalEquity: equity,
      maxDrawdown: calculateMaxDrawdown(equityCurve),
      equityCurve
    });
  }

  // 统计分析
  const finalEquities = results.map(r => r.finalEquity);
  const maxDrawdowns = results.map(r => r.maxDrawdown);

  return {
    meanReturn: mean(finalEquities) / 10000 - 1,
    medianReturn: median(finalEquities) / 10000 - 1,
    worstCase: Math.min(...finalEquities) / 10000 - 1,
    bestCase: Math.max(...finalEquities) / 10000 - 1,
    percentile5: percentile(finalEquities, 5) / 10000 - 1,
    percentile95: percentile(finalEquities, 95) / 10000 - 1,
    avgMaxDrawdown: mean(maxDrawdowns),
    worstDrawdown: Math.max(...maxDrawdowns)
  };
}
```

---

## 最佳实践

### 1. 代码组织

```
src/strategies/
├── BaseStrategy.js       # 策略基类
├── index.js              # 策略注册
├── indicators/           # 自定义指标
│   └── customIndicators.js
├── trend/                # 趋势策略
│   ├── SMAStrategy.js
│   └── MACDStrategy.js
├── oscillator/           # 震荡策略
│   └── RSIStrategy.js
└── arbitrage/            # 套利策略
    └── FundingArbStrategy.js
```

### 2. 使用高精度计算

```javascript
const Decimal = require('decimal.js');

// 错误做法
const profit = price * amount * 0.001;

// 正确做法
const profit = new Decimal(price)
  .times(amount)
  .times(0.001)
  .toNumber();
```

### 3. 错误处理

```javascript
async onCandle(data) {
  try {
    // 策略逻辑
    await this.generateSignal();
  } catch (error) {
    this.emit('error', {
      message: '策略执行错误',
      error: error.message,
      stack: error.stack
    });

    // 不要让错误中断策略
    // 记录日志并继续运行
  }
}
```

### 4. 日志记录

```javascript
// 记录关键决策
this.emit('log', {
  level: 'info',
  message: '买入信号',
  data: {
    price: currentPrice,
    sma: currentSMA,
    rsi: currentRSI,
    reason: '价格突破 SMA，RSI 超卖'
  }
});
```

### 5. 参数验证

```javascript
constructor(config) {
  super(config);

  // 验证必要参数
  if (!config.symbol) {
    throw new Error('symbol 参数必须');
  }

  if (!config.timeframe) {
    throw new Error('timeframe 参数必须');
  }

  // 验证参数范围
  const period = config.params?.period || 14;
  if (period < 1 || period > 200) {
    throw new Error('period 必须在 1-200 之间');
  }
}
```

### 6. 策略测试

```javascript
// tests/strategies/CustomStrategy.test.js
const { describe, it, expect } = require('vitest');
const CustomStrategy = require('../../src/strategies/CustomStrategy');

describe('CustomStrategy', () => {
  it('应该正确初始化', async () => {
    const strategy = new CustomStrategy({
      symbol: 'BTC/USDT',
      timeframe: '1h'
    });

    await strategy.onInit();
    expect(strategy.status).toBe('stopped');
  });

  it('应该在条件满足时生成买入信号', async () => {
    const strategy = new CustomStrategy({
      symbol: 'BTC/USDT',
      timeframe: '1h'
    });

    const signals = [];
    strategy.on('signal', (signal) => signals.push(signal));

    // 模拟数据
    for (let i = 0; i < 50; i++) {
      await strategy.onCandle({
        candle: { open: 100, high: 105, low: 95, close: 102 + i * 0.1 }
      });
    }

    expect(signals.length).toBeGreaterThan(0);
  });
});
```

---

## 附录

### 内置策略源码参考

| 策略 | 文件 | 类型 |
|------|------|------|
| SMA | src/strategies/SMAStrategy.js | 趋势 |
| RSI | src/strategies/RSIStrategy.js | 震荡 |
| MACD | src/strategies/MACDStrategy.js | 趋势 |
| 布林带 | src/strategies/BollingerBandsStrategy.js | 震荡 |
| ATR突破 | src/strategies/ATRBreakoutStrategy.js | 波动率 |
| 布林宽度 | src/strategies/BollingerWidthStrategy.js | 波动率 |
| 波动Regime | src/strategies/VolatilityRegimeStrategy.js | 波动率 |
| Regime切换 | src/strategies/RegimeSwitchingStrategy.js | 元策略 |
| 网格 | src/strategies/GridStrategy.js | 套利 |
| 资金费率套利 | src/strategies/FundingArbStrategy.js | 套利 |

### 波动率策略说明

波动率策略与趋势/震荡类策略相关性低，适合捕捉大行情：

#### ATRBreakoutStrategy
基于 ATR 动态通道的突破策略，价格突破通道且波动率扩张时入场。
```javascript
const strategy = new ATRBreakoutStrategy({
  symbol: 'BTC/USDT',
  atrPeriod: 14,
  atrMultiplier: 2.0,
  useTrailingStop: true
});
```

#### BollingerWidthStrategy
布林带宽度挤压突破策略，检测 BB 收敛进入 Keltner 通道（Squeeze），释放时入场。
```javascript
const strategy = new BollingerWidthStrategy({
  symbol: 'BTC/USDT',
  bbPeriod: 20,
  kcPeriod: 20,
  squeezeThreshold: 20
});
```

#### VolatilityRegimeStrategy
波动率 Regime 切换策略，识别 LOW/NORMAL/HIGH/EXTREME 四种状态，动态调整仓位。
```javascript
const strategy = new VolatilityRegimeStrategy({
  symbol: 'BTC/USDT',
  lowVolThreshold: 25,
  highVolThreshold: 75,
  disableInExtreme: true
});
```

### 市场状态切换策略 (Regime Switching)

#### 概述

RegimeSwitchingStrategy 是一个元策略，根据市场状态自动切换子策略组合：

| 市场状态 | 说明 | 推荐策略 | 仓位比例 |
|---------|------|---------|---------|
| trending_up | 上涨趋势 | SMA, MACD | 100% |
| trending_down | 下跌趋势 | SMA, MACD | 80% |
| ranging | 震荡盘整 | RSI, 布林带, 网格 | 70% |
| high_volatility | 高波动 | ATR 突破 | 50% |
| extreme | 极端情况 | 停止交易 | 0% |

#### 状态检测指标

- **ADX (平均趋向指数)**: 衡量趋势强度，> 25 表示有趋势
- **Bollinger Band Width**: 衡量波动率，宽度收缩表示盘整
- **ATR (真实波幅)**: 衡量市场波动程度
- **Hurst 指数**: 衡量趋势持续性，> 0.55 趋势性，< 0.45 均值回归

#### 基础用法

```javascript
const { RegimeSwitchingStrategy } = require('./strategies');

const strategy = new RegimeSwitchingStrategy({
  symbol: 'BTC/USDT',
  positionPercent: 95,
  signalAggregation: 'weighted',  // 信号聚合模式
  weightedThreshold: 0.5,         // 加权阈值
  closeOnRegimeChange: true,      // 状态切换时平仓
  forceCloseOnExtreme: true,      // 极端情况强制平仓
});

// 监听状态切换事件
strategy.on('regime_change', (event) => {
  console.log(`状态切换: ${event.from} → ${event.to}`);
  console.log(`活跃策略: ${event.activeStrategies.join(', ')}`);
});

// 监听信号
strategy.on('signal', (signal) => {
  console.log(`信号: ${signal.type} @ ${signal.price}`);
});
```

#### 信号聚合模式

| 模式 | 说明 |
|------|------|
| weighted | 加权聚合，根据策略权重计算总信号 |
| majority | 多数决，超过半数策略同意才生成信号 |
| any | 任意策略发出信号即生效，卖出优先 |

```javascript
// 加权聚合示例
const strategy = new RegimeSwitchingStrategy({
  signalAggregation: 'weighted',
  weightedThreshold: 0.5,  // 总权重 > 0.5 才生成信号
});

// 多数决示例
const strategy = new RegimeSwitchingStrategy({
  signalAggregation: 'majority',
});

// 任意信号示例
const strategy = new RegimeSwitchingStrategy({
  signalAggregation: 'any',
});
```

#### 自定义 Regime 映射

```javascript
const { MarketRegime } = require('./strategies/RegimeSwitchingStrategy');

const customRegimeMap = {
  [MarketRegime.TRENDING_UP]: {
    strategies: ['SMA', 'MACD'],
    weights: { SMA: 0.7, MACD: 0.3 },
  },
  [MarketRegime.RANGING]: {
    strategies: ['RSI', 'BollingerBands'],
    weights: { RSI: 0.6, BollingerBands: 0.4 },
  },
  // ... 其他状态
};

const strategy = new RegimeSwitchingStrategy({
  regimeMap: customRegimeMap,
});
```

#### 配置参数

```javascript
const config = {
  // 基础配置
  symbol: 'BTC/USDT',
  timeframe: '1h',
  positionPercent: 95,

  // 信号聚合
  signalAggregation: 'weighted',
  weightedThreshold: 0.5,

  // Regime 检测参数
  regimeParams: {
    adxPeriod: 14,
    adxTrendThreshold: 25,
    adxStrongTrendThreshold: 40,
    bbPeriod: 20,
    atrPeriod: 14,
    lowVolPercentile: 25,
    highVolPercentile: 75,
    extremeVolPercentile: 95,
    hurstPeriod: 50,
    minRegimeDuration: 3,  // 状态确认需要的 K 线数
  },

  // 子策略参数
  strategyParams: {
    SMA: { shortPeriod: 10, longPeriod: 30 },
    MACD: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    RSI: { period: 14, overbought: 70, oversold: 30 },
    // ...
  },

  // 风控
  closeOnRegimeChange: true,
  forceCloseOnExtreme: true,
};
```

#### 独立使用 MarketRegimeDetector

```javascript
const { MarketRegimeDetector, RegimeEvent } = require('./utils/MarketRegimeDetector');

const detector = new MarketRegimeDetector({
  adxPeriod: 14,
  adxTrendThreshold: 25,
  minRegimeDuration: 3,
});

// 监听事件
detector.on(RegimeEvent.REGIME_CHANGE, (event) => {
  console.log(`状态切换: ${event.from} → ${event.to}`);
});

detector.on(RegimeEvent.EXTREME_DETECTED, (event) => {
  console.log('检测到极端市场情况！');
});

// 更新检测器
const result = detector.update(candle, candleHistory);
console.log(`当前状态: ${result.regime}`);
console.log(`置信度: ${result.confidence}%`);
console.log(`推荐策略: ${result.recommendation.strategies}`);
```

#### 公共 API

```javascript
// 获取当前状态
strategy.getCurrentRegime();  // 'trending_up' | 'ranging' | ...

// 获取活跃策略
strategy.getActiveStrategies();  // ['SMA', 'MACD']

// 获取统计信息
strategy.getRegimeStats();
// {
//   currentRegime: 'trending_up',
//   activeStrategies: ['SMA', 'MACD'],
//   regimeChanges: 5,
//   ...
// }

// 强制切换状态（测试用）
strategy.forceRegime(MarketRegime.HIGH_VOLATILITY);
```

### 相关文档

- [代码开发文档](./DEVELOPMENT.md)
- [API 参考文档](./API_REFERENCE.md)
- [用户使用手册](./USER_MANUAL.md)
