# 统计套利策略开发指南 / Statistical Arbitrage Strategy Guide

## 目录

1. [策略概述](#策略概述)
2. [支持的套利类型](#支持的套利类型)
3. [核心组件](#核心组件)
4. [快速开始](#快速开始)
5. [配置参数](#配置参数)
6. [API 参考](#api-参考)
7. [回测示例](#回测示例)
8. [最佳实践](#最佳实践)

---

## 策略概述

统计套利（Statistical Arbitrage）是一种基于统计学原理的量化交易策略，通过识别资产之间的统计关系（如协整、相关性）来发现套利机会。

### 核心特点

- **市场中性**: 同时持有多空仓位，降低市场系统性风险
- **均值回归**: 基于价差/基差的均值回归特性进行交易
- **统计驱动**: 使用 Z-Score、协整检验、半衰期等统计指标
- **多种套利形式**: 支持配对交易、跨交易所、期现套利等

### 策略优势

| 优势 | 说明 |
|------|------|
| 低相关性 | 与趋势策略收益相关性低，适合组合配置 |
| 收益稳定 | 均值回归特性使收益曲线更平滑 |
| 风险可控 | 多空对冲降低单边风险 |
| 容量较大 | 适合较大资金规模运作 |

---

## 支持的套利类型

### 1. 配对交易 (Pairs Trading)

基于两个高相关资产的价格比值进行交易。

```javascript
import { StatisticalArbitrageStrategy, STAT_ARB_TYPE } from './src/strategies/index.js';

const strategy = new StatisticalArbitrageStrategy({
  arbType: STAT_ARB_TYPE.PAIRS_TRADING,
  candidatePairs: [
    { assetA: 'BTC/USDT', assetB: 'ETH/USDT' },
  ],
  entryZScore: 2.0,
  exitZScore: 0.5,
});
```

**适用场景**: 同板块高相关资产（如 BTC/ETH、主流币对）

### 2. 协整交易 (Cointegration Trading)

更严格的配对交易，要求资产价格序列通过协整检验。

```javascript
const strategy = new StatisticalArbitrageStrategy({
  arbType: STAT_ARB_TYPE.COINTEGRATION,
  candidatePairs: [
    { assetA: 'BTC/USDT', assetB: 'ETH/USDT' },
  ],
  adfSignificanceLevel: 0.01,  // 1% 显著性水平
  minCorrelation: 0.8,
  minHalfLife: 2,
  maxHalfLife: 15,
});
```

**适用场景**: 需要更强统计保证的配对交易

### 3. 跨交易所价差套利 (Cross-Exchange Spread)

利用同一资产在不同交易所的价格差异进行套利。

```javascript
const strategy = new StatisticalArbitrageStrategy({
  arbType: STAT_ARB_TYPE.CROSS_EXCHANGE,
  candidatePairs: [
    { assetA: 'BTC/USDT:Binance', assetB: 'BTC/USDT:OKX' },
  ],
  spreadEntryThreshold: 0.003,  // 0.3% 价差入场
  spreadExitThreshold: 0.001,   // 0.1% 价差出场
  tradingCost: 0.001,           // 0.1% 交易成本
});
```

**适用场景**: 多交易所账户、高频执行能力

### 4. 永续-现货基差套利 (Perpetual-Spot Basis)

利用永续合约与现货之间的基差进行套利。

```javascript
const strategy = new StatisticalArbitrageStrategy({
  arbType: STAT_ARB_TYPE.PERPETUAL_SPOT,
  candidatePairs: [
    { assetA: 'BTC/USDT:PERP', assetB: 'BTC/USDT:SPOT' },
  ],
  basisEntryThreshold: 0.15,    // 15% 年化基差入场
  basisExitThreshold: 0.05,     // 5% 年化基差出场
  fundingRateThreshold: 0.001,  // 0.1% 资金费率阈值
});
```

**适用场景**: 期现对冲、资金费率收割

---

## 核心组件

### 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                   StatisticalArbitrageStrategy                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ PriceSeriesStore │  │   PairManager   │  │ StatisticalCalculator│  │
│  │  - 价格序列存储   │  │  - 配对管理      │  │  - 统计计算          │  │
│  │  - 收益率计算     │  │  - 仓位跟踪      │  │  - 协整检验          │  │
│  │  - 数据窗口管理   │  │  - 绩效统计      │  │  - Z-Score 计算      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                      SpreadCalculator                            │ │
│  │  - ratioSpread (价格比)    - logSpread (对数价差)                 │ │
│  │  - residualSpread (残差)   - basis (基差)                        │ │
│  │  - percentageSpread (百分比价差)                                  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### PriceSeriesStore

价格序列存储器，管理多资产的历史价格数据。

```javascript
const store = new PriceSeriesStore(500);  // 最大存储 500 个数据点

store.addPrice('BTC/USDT', 50000);
store.addPrice('BTC/USDT', 50100);

const prices = store.getPrices('BTC/USDT', 100);  // 获取最近 100 个价格
const returns = store.getReturns('BTC/USDT');     // 获取收益率序列
```

### StatisticalCalculator

统计计算工具类，提供各种统计分析方法。

```javascript
// 基础统计
const mean = StatisticalCalculator.mean(data);
const std = StatisticalCalculator.std(data);
const zScore = StatisticalCalculator.zScore(value, mean, std);

// 相关性分析
const correlation = StatisticalCalculator.correlation(seriesA, seriesB);

// OLS 回归
const { alpha, beta, residuals } = StatisticalCalculator.ols(x, y);

// 协整检验
const { isStationary, testStat, pValue } = StatisticalCalculator.adfTest(spread, 0.05);

// 半衰期计算
const halfLife = StatisticalCalculator.calculateHalfLife(spread);

// Hurst 指数
const hurst = StatisticalCalculator.hurstExponent(series);
```

### PairManager

配对管理器，跟踪所有交易配对的状态和绩效。

```javascript
const manager = new PairManager({
  maxActivePairs: 5,
  minCorrelation: 0.7,
});

// 添加配对
manager.addPair('BTC/USDT', 'ETH/USDT');

// 更新统计信息
manager.updatePairStats('BTC/USDT:ETH/USDT', {
  correlation: 0.85,
  halfLife: 5,
  cointegration: { isStationary: true },
});

// 激活/停用配对
manager.activatePair('BTC/USDT:ETH/USDT');
manager.deactivatePair('BTC/USDT:ETH/USDT');

// 设置仓位
manager.setPosition('BTC/USDT:ETH/USDT', position);

// 记录交易结果
manager.recordTradeResult('BTC/USDT:ETH/USDT', pnl, isWin);
```

### SpreadCalculator

价差计算器，支持多种价差计算方式。

```javascript
// 价格比
const ratio = SpreadCalculator.ratioSpread(priceA, priceB);

// 对数价差
const logSpread = SpreadCalculator.logSpread(priceA, priceB, beta);

// 残差价差 (基于 OLS)
const residual = SpreadCalculator.residualSpread(priceA, priceB, alpha, beta);

// 百分比价差
const pctSpread = SpreadCalculator.percentageSpread(priceA, priceB);

// 基差
const basis = SpreadCalculator.basis(perpPrice, spotPrice);

// 年化基差
const annualized = SpreadCalculator.annualizedBasis(basis, daysToExpiry);
```

---

## 快速开始

### 基本用法

```javascript
import { BacktestEngine } from './src/backtest/index.js';
import { StatisticalArbitrageStrategy, STAT_ARB_TYPE } from './src/strategies/index.js';

// 1. 创建策略
const strategy = new StatisticalArbitrageStrategy({
  name: 'BTC-ETH配对交易',
  arbType: STAT_ARB_TYPE.PAIRS_TRADING,

  candidatePairs: [
    { assetA: 'BTC/USDT', assetB: 'ETH/USDT' },
  ],

  // 信号参数
  entryZScore: 2.0,
  exitZScore: 0.5,
  stopLossZScore: 3.5,

  // 仓位管理
  maxPositionPerPair: 0.2,
  maxTotalPosition: 0.6,

  verbose: true,
});

// 2. 创建回测引擎
const backtest = new BacktestEngine({
  initialCapital: 100000,
  commission: 0.001,
  slippage: 0.0005,
});

backtest.setStrategy(strategy);

// 3. 加载数据
backtest.loadData('BTC/USDT', btcData);
backtest.loadData('ETH/USDT', ethData);

// 4. 运行回测
const results = await backtest.run();

console.log('收益率:', results.returnRate);
console.log('夏普比:', results.sharpeRatio);
console.log('最大回撤:', results.maxDrawdown);
```

### 实盘运行

```bash
# 影子模式 (模拟交易)
pm2 start ecosystem.config.cjs --only quant-shadow-statarb

# 实盘模式
pm2 start ecosystem.config.cjs --only quant-live-statarb
```

---

## 配置参数

### 基础配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `arbType` | string | `'pairs_trading'` | 套利类型 |
| `candidatePairs` | array | `[]` | 候选配对列表 |
| `maxActivePairs` | number | `5` | 最大活跃配对数 |
| `lookbackPeriod` | number | `60` | 统计回看周期 |
| `cointegrationTestPeriod` | number | `100` | 协整检验周期 |

### 协整检验参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `adfSignificanceLevel` | number | `0.05` | ADF 检验显著性水平 |
| `minCorrelation` | number | `0.7` | 最小相关性阈值 |
| `minHalfLife` | number | `1` | 最小半衰期 (天) |
| `maxHalfLife` | number | `30` | 最大半衰期 (天) |

### Z-Score 信号参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `entryZScore` | number | `2.0` | 开仓 Z-Score 阈值 |
| `exitZScore` | number | `0.5` | 平仓 Z-Score 阈值 |
| `stopLossZScore` | number | `4.0` | 止损 Z-Score 阈值 |
| `maxHoldingPeriod` | number | `7d` | 最大持仓时间 |

### 跨交易所参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `spreadEntryThreshold` | number | `0.003` | 价差入场阈值 (0.3%) |
| `spreadExitThreshold` | number | `0.001` | 价差出场阈值 (0.1%) |
| `tradingCost` | number | `0.001` | 单边交易成本 (0.1%) |
| `slippageEstimate` | number | `0.0005` | 滑点估计 (0.05%) |

### 期现基差参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `basisEntryThreshold` | number | `0.15` | 年化基差入场阈值 (15%) |
| `basisExitThreshold` | number | `0.05` | 年化基差出场阈值 (5%) |
| `fundingRateThreshold` | number | `0.001` | 资金费率阈值 (0.1%) |

### 仓位管理参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxPositionPerPair` | number | `0.1` | 单配对最大仓位 (10%) |
| `maxTotalPosition` | number | `0.5` | 总最大仓位 (50%) |
| `symmetricPosition` | boolean | `true` | 是否对称持仓 |

### 风控参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxLossPerPair` | number | `0.02` | 单配对最大亏损 (2%) |
| `maxDrawdown` | number | `0.1` | 最大回撤 (10%) |
| `consecutiveLossLimit` | number | `3` | 连续亏损次数限制 |
| `coolingPeriod` | number | `24h` | 冷却时间 |

---

## API 参考

### 策略方法

```javascript
// 获取策略状态
const status = strategy.getStatus();

// 获取配对详情
const pair = strategy.getPairDetails('BTC/USDT:ETH/USDT');

// 获取所有配对摘要
const summary = strategy.getAllPairsSummary();

// 手动添加配对
strategy.addPair('SOL/USDT', 'AVAX/USDT');

// 手动移除配对
strategy.removePair('SOL/USDT:AVAX/USDT');

// 重新分析所有配对
await strategy.reanalyzeAllPairs();
```

### 信号类型

```javascript
import { SIGNAL_TYPE } from './src/strategies/index.js';

SIGNAL_TYPE.OPEN_LONG_SPREAD   // 做多价差 (买A卖B)
SIGNAL_TYPE.OPEN_SHORT_SPREAD  // 做空价差 (卖A买B)
SIGNAL_TYPE.CLOSE_SPREAD       // 平仓价差
SIGNAL_TYPE.NO_SIGNAL          // 无信号
```

### 配对状态

```javascript
import { PAIR_STATUS } from './src/strategies/index.js';

PAIR_STATUS.PENDING    // 待验证
PAIR_STATUS.ACTIVE     // 活跃
PAIR_STATUS.SUSPENDED  // 暂停
PAIR_STATUS.BROKEN     // 失效
```

---

## 回测示例

完整示例请参考: `examples/runStatisticalArbitrage.js`

```bash
node examples/runStatisticalArbitrage.js
```

---

## 最佳实践

### 1. 配对选择

- 选择同板块、高相关性的资产
- 优先选择流动性好的主流币对
- 定期重新验证协整关系

### 2. 参数调优

- Z-Score 入场阈值通常设置在 1.5-2.5 之间
- 半衰期控制在 2-20 天为宜
- 根据波动率调整仓位大小

### 3. 风险控制

- 设置合理的止损 Z-Score (通常 3-4)
- 限制单配对仓位不超过 10-20%
- 监控协整关系是否失效

### 4. 组合建议

- 与趋势策略组合，降低整体波动
- 不同套利类型之间分散配置
- 预留足够的现金应对极端行情

---

## 常见问题

### Q: 如何判断配对关系是否有效？

A: 需要满足以下条件：
1. 相关性 > 0.7
2. ADF 检验通过 (p-value < 0.05)
3. 半衰期在合理范围 (1-30 天)

### Q: 为什么信号不触发？

A: 检查以下几点：
1. 数据是否足够 (至少需要 lookbackPeriod 个数据点)
2. Z-Score 是否达到阈值
3. 仓位是否已满
4. 是否处于冷却期

### Q: 如何处理协整关系失效？

A: 策略会自动：
1. 监控配对的统计指标
2. 当协整检验失败时标记为 BROKEN
3. 触发平仓信号

---

## 更新日志

- **v1.0.0** (2024-12): 初始版本，支持配对交易、协整、跨交易所、期现套利

---

## 相关文档

- [因子投资文档 / Factor Investing](./FACTOR_INVESTING.md) - Alpha 因子库，多因子打分排名系统
- [横截面策略文档 / Cross-Sectional Strategies](./CROSS_SECTIONAL_STRATEGIES.md) - 多资产排名策略
- [策略开发指南 / Strategy Development](./STRATEGY_DEVELOPMENT.md) - 通用策略开发指南
