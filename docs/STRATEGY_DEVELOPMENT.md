# 策略开发指南

## 目录

1. [概述](#1-概述)
2. [策略架构](#2-策略架构)
3. [开发入门](#3-开发入门)
4. [策略接口详解](#4-策略接口详解)
5. [技术指标使用](#5-技术指标使用)
6. [交易操作](#6-交易操作)
7. [状态管理](#7-状态管理)
8. [策略优化](#8-策略优化)
9. [回测验证](#9-回测验证)
10. [最佳实践](#10-最佳实践)

---

## 1. 概述

### 1.1 策略开发流程

```
需求分析 → 策略设计 → 代码实现 → 单元测试 → 回测验证 → 参数优化 → 影子测试 → 实盘部署
```

### 1.2 内置策略

| 策略名称 | 类型 | 文件 |
|----------|------|------|
| SMAStrategy | 趋势跟踪 | `src/strategies/SMAStrategy.js` |
| RSIStrategy | 震荡指标 | `src/strategies/RSIStrategy.js` |
| MACDStrategy | 趋势动量 | `src/strategies/MACDStrategy.js` |
| BollingerBandsStrategy | 均值回归 | `src/strategies/BollingerBandsStrategy.js` |
| GridStrategy | 网格交易 | `src/strategies/GridStrategy.js` |
| FundingArbStrategy | 套利 | `src/strategies/FundingArbStrategy.js` |

### 1.3 目录结构

```
src/strategies/
├── BaseStrategy.js         # 策略基类
├── SMAStrategy.js          # SMA 策略
├── RSIStrategy.js          # RSI 策略
├── MACDStrategy.js         # MACD 策略
├── BollingerBandsStrategy.js
├── GridStrategy.js         # 网格策略
├── FundingArbStrategy.js   # 资金费率套利
├── index.js                # 策略导出
└── custom/                 # 自定义策略目录
    └── MyStrategy.js
```

---

## 2. 策略架构

### 2.1 基类结构

所有策略必须继承 `BaseStrategy` 基类：

```javascript
import { BaseStrategy } from './BaseStrategy.js';

class MyStrategy extends BaseStrategy {
  constructor(params = {}) {
    super({
      name: 'MyStrategy',
      ...params,
    });
    // 初始化参数
  }

  async onInit() {
    // 策略初始化
    await super.onInit();
  }

  async onTick(candle, history) {
    // 每根 K 线触发
  }

  async onFinish() {
    // 策略结束
    await super.onFinish();
  }
}
```

### 2.2 生命周期

```
┌─────────────┐
│ constructor │  实例化，设置参数
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   onInit    │  初始化，准备资源
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   onTick    │  每根 K 线触发 (循环)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  onFinish   │  结束清理
└─────────────┘
```

### 2.3 事件系统

策略继承 `EventEmitter`，支持以下事件：

| 事件名 | 触发时机 | 数据 |
|--------|----------|------|
| `initialized` | 初始化完成 | 无 |
| `signal` | 生成信号 | `{ type, reason, timestamp }` |
| `orderFilled` | 订单成交 | 订单对象 |
| `orderCancelled` | 订单取消 | 订单对象 |
| `error` | 发生错误 | 错误对象 |
| `finished` | 策略结束 | 无 |

---

## 3. 开发入门

### 3.1 创建新策略

**步骤 1：创建文件**

```bash
touch src/strategies/custom/MyMomentumStrategy.js
```

**步骤 2：编写策略代码**

```javascript
/**
 * 动量策略示例
 * Momentum Strategy Example
 */
import { BaseStrategy } from '../BaseStrategy.js';

export class MyMomentumStrategy extends BaseStrategy {
  constructor(params = {}) {
    super({
      name: 'MyMomentumStrategy',
      ...params,
    });

    // 策略参数
    this.lookbackPeriod = params.lookbackPeriod || 20;
    this.threshold = params.threshold || 0.02;  // 2%
    this.symbol = params.symbol || 'BTC/USDT';
    this.positionPercent = params.positionPercent || 90;
  }

  async onInit() {
    await super.onInit();
    this.log(`动量策略初始化: 回看周期=${this.lookbackPeriod}, 阈值=${this.threshold * 100}%`);
  }

  async onTick(candle, history) {
    // 确保有足够数据
    if (history.length < this.lookbackPeriod) {
      return;
    }

    // 计算动量 (当前价格 vs N 周期前价格)
    const currentPrice = candle.close;
    const pastPrice = history[history.length - this.lookbackPeriod].close;
    const momentum = (currentPrice - pastPrice) / pastPrice;

    // 保存指标
    this.setIndicator('momentum', momentum);

    // 获取持仓状态
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // 交易逻辑
    if (momentum > this.threshold && !hasPosition) {
      // 动量突破，买入
      this.log(`动量突破买入信号: ${(momentum * 100).toFixed(2)}%`);
      this.setBuySignal(`Momentum: ${(momentum * 100).toFixed(2)}%`);
      this.buyPercent(this.symbol, this.positionPercent);
    } else if (momentum < -this.threshold && hasPosition) {
      // 动量下跌，卖出
      this.log(`动量下跌卖出信号: ${(momentum * 100).toFixed(2)}%`);
      this.setSellSignal(`Momentum: ${(momentum * 100).toFixed(2)}%`);
      this.closePosition(this.symbol);
    }
  }
}

export default MyMomentumStrategy;
```

**步骤 3：注册策略**

在 `src/strategies/index.js` 中添加导出：

```javascript
export { MyMomentumStrategy } from './custom/MyMomentumStrategy.js';
```

**步骤 4：测试策略**

```javascript
// examples/testMyStrategy.js
import { BacktestEngine } from '../src/backtest/BacktestEngine.js';
import { MyMomentumStrategy } from '../src/strategies/index.js';

const engine = new BacktestEngine({
  initialCapital: 10000,
  commissionRate: 0.001,
});

// 加载数据...
const strategy = new MyMomentumStrategy({
  lookbackPeriod: 20,
  threshold: 0.02,
  symbol: 'BTC/USDT',
});

engine.setStrategy(strategy);
const stats = await engine.run();
console.log(stats);
```

---

## 4. 策略接口详解

### 4.1 核心方法

#### `constructor(params)`

构造函数，初始化策略参数。

```javascript
constructor(params = {}) {
  super({
    name: 'StrategyName',  // 必须设置
    ...params,
  });

  // 设置策略参数
  this.param1 = params.param1 || defaultValue;
}
```

#### `onInit()`

初始化方法，在回测/交易开始前调用。

```javascript
async onInit() {
  await super.onInit();  // 必须调用父类方法

  // 执行初始化逻辑
  // - 加载历史数据
  // - 初始化指标
  // - 准备外部资源
}
```

#### `onTick(candle, history)`

核心方法，每根 K 线触发。

```javascript
async onTick(candle, history) {
  // candle 结构
  // {
  //   symbol: 'BTC/USDT',
  //   timestamp: 1703318400000,
  //   open: 42000,
  //   high: 42500,
  //   low: 41800,
  //   close: 42200,
  //   volume: 1000,
  // }

  // history: 历史 K 线数组，最新的在最后
}
```

#### `onFinish()`

结束方法，在回测/交易结束时调用。

```javascript
async onFinish() {
  await super.onFinish();

  // 清理资源
  // 输出统计信息
}
```

### 4.2 事件回调

#### `onCandle(data)`

K 线更新事件（实盘模式）。

```javascript
async onCandle(data) {
  // 接收实时 K 线数据
  // 自动调用 onTick
}
```

#### `onTicker(data)`

Ticker 更新事件（高频数据）。

```javascript
async onTicker(data) {
  // data: { symbol, last, bid, ask, ... }
  // 用于获取实时价格
}
```

#### `onFundingRate(data)`

资金费率更新事件（套利策略使用）。

```javascript
async onFundingRate(data) {
  // data: { symbol, rate, nextFundingTime, ... }
}
```

#### `onOrderFilled(order)`

订单成交回调。

```javascript
onOrderFilled(order) {
  // 处理订单成交逻辑
  // 例如：记录成交、调整止损等
}
```

---

## 5. 技术指标使用

### 5.1 使用 technicalindicators 库

系统已集成 `technicalindicators` 库：

```javascript
import { SMA, EMA, RSI, MACD, BollingerBands } from 'technicalindicators';

// 计算 SMA
const smaValues = SMA.calculate({
  period: 14,
  values: closePrices,
});

// 计算 RSI
const rsiValues = RSI.calculate({
  period: 14,
  values: closePrices,
});

// 计算 MACD
const macdValues = MACD.calculate({
  values: closePrices,
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  SimpleMAOscillator: false,
  SimpleMASignal: false,
});

// 计算布林带
const bbValues = BollingerBands.calculate({
  period: 20,
  values: closePrices,
  stdDev: 2,
});
```

### 5.2 常用指标

| 指标 | 类名 | 参数 |
|------|------|------|
| 简单移动平均 | `SMA` | period, values |
| 指数移动平均 | `EMA` | period, values |
| RSI | `RSI` | period, values |
| MACD | `MACD` | fastPeriod, slowPeriod, signalPeriod, values |
| 布林带 | `BollingerBands` | period, stdDev, values |
| ATR | `ATR` | period, high, low, close |
| ADX | `ADX` | period, high, low, close |
| Stochastic | `Stochastic` | period, signalPeriod, high, low, close |

### 5.3 指标缓存

使用 `setIndicator` / `getIndicator` 缓存指标值：

```javascript
// 保存指标
this.setIndicator('rsi', rsiValue);
this.setIndicator('macd', { macd, signal, histogram });

// 获取指标
const rsi = this.getIndicator('rsi');
const { macd, signal } = this.getIndicator('macd');
```

---

## 6. 交易操作

### 6.1 买入操作

```javascript
// 固定数量买入
this.buy(symbol, amount);

// 按百分比买入 (使用可用资金的百分比)
this.buyPercent(symbol, 90);  // 买入 90% 资金

// 带选项买入
this.buy(symbol, amount, {
  price: 42000,      // 限价单价格
  type: 'limit',     // 订单类型
  stopLoss: 0.02,    // 止损 2%
  takeProfit: 0.04,  // 止盈 4%
});
```

### 6.2 卖出操作

```javascript
// 固定数量卖出
this.sell(symbol, amount);

// 平仓 (卖出全部持仓)
this.closePosition(symbol);
```

### 6.3 查询持仓

```javascript
const position = this.getPosition(symbol);
// position 结构:
// {
//   symbol: 'BTC/USDT',
//   amount: 0.5,
//   avgPrice: 40000,
//   currentPrice: 42000,
//   pnl: 1000,
//   pnlPercent: 5,
// }

if (position && position.amount > 0) {
  // 有持仓
}
```

### 6.4 查询资金

```javascript
// 可用资金
const capital = this.getCapital();

// 总权益 (资金 + 持仓市值)
const equity = this.getEquity();
```

---

## 7. 状态管理

### 7.1 策略状态

```javascript
// 设置状态
this.setState('lastTradePrice', currentPrice);
this.setState('consecutiveLosses', 0);

// 获取状态
const lastPrice = this.getState('lastTradePrice', 0);
const losses = this.getState('consecutiveLosses', 0);
```

### 7.2 信号管理

```javascript
// 设置买入信号
this.setBuySignal('Golden Cross detected');

// 设置卖出信号
this.setSellSignal('RSI overbought');

// 获取当前信号
const signal = this.getSignal();
// { type: 'buy', reason: 'Golden Cross detected', timestamp: ... }

// 清除信号
this.clearSignal();
```

### 7.3 日志输出

```javascript
// 信息日志
this.log('策略执行中...');

// 警告日志
this.log('风险较高', 'warn');

// 错误日志
this.log('执行失败', 'error');

// 调试日志 (仅开发环境)
this.log('调试信息', 'debug');
```

---

## 8. 策略优化

### 8.1 参数网格搜索

```javascript
import { GridSearch, OptimizationTarget } from '../src/optimization/index.js';

const gridSearch = new GridSearch({
  target: OptimizationTarget.SHARPE_RATIO,
  minTrades: 10,
});

// 定义参数空间
const parameterSpace = {
  shortPeriod: { min: 5, max: 20, step: 5 },   // [5, 10, 15, 20]
  longPeriod: { min: 20, max: 60, step: 10 },  // [20, 30, 40, 50, 60]
};

const result = await gridSearch.run({
  data: historicalData,
  strategyClass: SMAStrategy,
  parameterSpace,
  fixedParams: { symbol: 'BTC/USDT' },
});

console.log('最优参数:', result.bestParams);
console.log('最优夏普比率:', result.bestStats.sharpeRatio);
```

### 8.2 Walk-Forward 分析

```javascript
import { WalkForwardAnalysis, WalkForwardType } from '../src/optimization/index.js';

const wfa = new WalkForwardAnalysis({
  type: WalkForwardType.ROLLING,
  trainingWindow: 0.6,  // 60% 训练
  testWindow: 0.2,      // 20% 测试
});

const result = await wfa.run({
  data: historicalData,
  strategyClass: SMAStrategy,
  parameterSpace,
});

console.log('稳健性得分:', result.robustnessScore);
console.log('建议:', result.recommendations);
```

### 8.3 蒙特卡洛模拟

```javascript
import { MonteCarloSimulation, SimulationType } from '../src/optimization/index.js';

const mc = new MonteCarloSimulation({
  numSimulations: 1000,
  type: SimulationType.TRADE_RESAMPLING,
  confidenceLevels: [0.95, 0.99],
});

const result = await mc.run({
  trades: backtestTrades,
});

console.log('盈利概率:', result.statistics.profitProbability);
console.log('95% VaR:', result.riskMetrics.VaR['95%']);
```

---

## 9. 回测验证

### 9.1 基本回测

```javascript
import { BacktestEngine } from '../src/backtest/BacktestEngine.js';

const engine = new BacktestEngine({
  initialCapital: 10000,
  commissionRate: 0.001,  // 0.1%
  slippage: 0.0005,       // 0.05%
});

// 加载数据
engine.loadData(historicalData);

// 设置策略
engine.setStrategy(myStrategy);

// 运行回测
const stats = await engine.run();

// 查看结果
console.log('总收益率:', stats.totalReturn, '%');
console.log('夏普比率:', stats.sharpeRatio);
console.log('最大回撤:', stats.maxDrawdownPercent, '%');
console.log('胜率:', stats.winRate, '%');
```

### 9.2 回测指标

| 指标 | 说明 | 理想值 |
|------|------|--------|
| totalReturn | 总收益率 | > 0 |
| annualReturn | 年化收益率 | > 10% |
| sharpeRatio | 夏普比率 | > 1 |
| maxDrawdownPercent | 最大回撤 | < 20% |
| winRate | 胜率 | > 50% |
| profitFactor | 盈亏比 | > 1.5 |
| totalTrades | 总交易次数 | 适中 |

### 9.3 回测报告

```javascript
// 获取详细报告
const report = engine.getReport();

// 导出为 JSON
fs.writeFileSync('backtest-report.json', JSON.stringify(report, null, 2));

// 获取交易记录
const trades = engine.getTrades();
```

---

## 10. 最佳实践

### 10.1 代码规范

```javascript
// 1. 使用有意义的变量名
const shortPeriod = 10;  // Good
const sp = 10;           // Bad

// 2. 添加注释
// 计算 RSI 指标
const rsi = this._calculateRSI(closes, this.period);

// 3. 使用常量
const OVERBOUGHT = 70;
const OVERSOLD = 30;

// 4. 错误处理
try {
  await this.buy(symbol, amount);
} catch (error) {
  this.log(`买入失败: ${error.message}`, 'error');
}
```

### 10.2 风险管理

```javascript
// 1. 仓位控制
const maxPositionSize = this.getCapital() * 0.2;  // 单仓最大 20%

// 2. 止损设置
this.buy(symbol, amount, {
  stopLoss: 0.02,  // 固定止损 2%
});

// 3. 动态止损
if (position.pnlPercent > 0.05) {
  // 盈利 5% 后，设置保本止损
  this.setTrailingStop(symbol, 0.03);
}

// 4. 日亏损限制
if (this.dailyLoss > this.maxDailyLoss) {
  this.log('达到日亏损限制，停止交易', 'warn');
  return;
}
```

### 10.3 避免过拟合

```javascript
// 1. 使用合理的参数数量
// 参数越少越好，避免过度优化

// 2. 使用样本外测试
// 将数据分为训练集和测试集

// 3. 使用 Walk-Forward 分析
// 验证策略在不同时期的表现

// 4. 关注稳健性
// 小幅调整参数，收益不应大幅变化
```

### 10.4 性能优化

```javascript
// 1. 避免重复计算
// 使用 setIndicator 缓存指标值

// 2. 减少不必要的日志
if (process.env.NODE_ENV === 'development') {
  this.log('调试信息', 'debug');
}

// 3. 使用增量计算
// 对于均线等指标，可以使用增量方式更新

// 4. 限制历史数据长度
// 只保留必要的历史数据
```

### 10.5 测试策略

```javascript
// 单元测试示例
describe('MyStrategy', () => {
  it('should generate buy signal on golden cross', async () => {
    const strategy = new MyStrategy({ shortPeriod: 5, longPeriod: 10 });
    // ... 模拟数据
    expect(strategy.getSignal().type).toBe('buy');
  });

  it('should not trade with insufficient data', async () => {
    const strategy = new MyStrategy({ shortPeriod: 5, longPeriod: 10 });
    await strategy.onTick(candle, shortHistory);  // 数据不足
    expect(strategy.getSignal()).toBeNull();
  });
});
```

---

## 附录

### A. 策略模板

```javascript
/**
 * 策略模板
 * Strategy Template
 */
import { BaseStrategy } from '../BaseStrategy.js';

export class TemplateStrategy extends BaseStrategy {
  constructor(params = {}) {
    super({
      name: 'TemplateStrategy',
      ...params,
    });

    // === 参数定义 ===
    this.param1 = params.param1 || defaultValue1;
    this.param2 = params.param2 || defaultValue2;
    this.symbol = params.symbol || 'BTC/USDT';
    this.positionPercent = params.positionPercent || 90;
  }

  async onInit() {
    await super.onInit();
    this.log(`策略初始化: param1=${this.param1}, param2=${this.param2}`);
  }

  async onTick(candle, history) {
    // === 数据验证 ===
    if (history.length < this.requiredLength) {
      return;
    }

    // === 指标计算 ===
    const indicator = this._calculateIndicator(history);
    this.setIndicator('myIndicator', indicator);

    // === 持仓查询 ===
    const position = this.getPosition(this.symbol);
    const hasPosition = position && position.amount > 0;

    // === 信号生成 ===
    const buySignal = this._checkBuySignal(indicator);
    const sellSignal = this._checkSellSignal(indicator);

    // === 交易执行 ===
    if (buySignal && !hasPosition) {
      this.setBuySignal('Buy condition met');
      this.buyPercent(this.symbol, this.positionPercent);
    } else if (sellSignal && hasPosition) {
      this.setSellSignal('Sell condition met');
      this.closePosition(this.symbol);
    }
  }

  _calculateIndicator(history) {
    // 实现指标计算
  }

  _checkBuySignal(indicator) {
    // 实现买入条件
    return false;
  }

  _checkSellSignal(indicator) {
    // 实现卖出条件
    return false;
  }
}

export default TemplateStrategy;
```

### B. 常见问题

**Q: 策略不生成信号？**
- 检查历史数据是否足够
- 检查条件判断逻辑
- 添加调试日志

**Q: 回测和实盘结果不一致？**
- 考虑滑点和手续费
- 检查时间颗粒度
- 验证数据质量

**Q: 如何处理多交易对？**
- 为每个交易对维护独立状态
- 使用 Map 存储各交易对数据

### C. 参考资源

- [technicalindicators 文档](https://github.com/anandanand84/technicalindicators)
- [ccxt 文档](https://docs.ccxt.com/)
- [量化交易入门指南](https://www.quantstart.com/)

---

*文档版本: 1.0.0*
*最后更新: 2024-12-23*
