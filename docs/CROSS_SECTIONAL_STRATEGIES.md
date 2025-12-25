# 横截面策略开发指南 / Cross-Sectional Strategy Development Guide

## 目录

1. [横截面策略概述](#横截面策略概述)
2. [架构设计](#架构设计)
3. [核心组件](#核心组件)
4. [策略类型](#策略类型)
5. [快速开始](#快速开始)
6. [配置参数](#配置参数)
7. [API参考](#api参考)
8. [最佳实践](#最佳实践)

---

## 横截面策略概述

横截面策略（Cross-Sectional Strategy）是一种同时对多个资产进行排名和交易的策略类型。与单资产策略不同，横截面策略利用资产之间的相对关系来进行交易决策。

### 核心特点

- **多资产并行处理**: 同时监控和分析多个交易对
- **相对排名**: 基于各类指标对资产进行排名
- **多空配对**: 支持做多强势资产、做空弱势资产
- **市场中性**: 可配置为市场中性策略，降低系统性风险
- **周期性再平衡**: 定期调整持仓以适应市场变化

### 策略类型

| 策略类型 | 说明 | 适用场景 |
|---------|------|---------|
| `MomentumRankStrategy` | 动量排名策略 | 趋势跟踪 |
| `RotationStrategy` | 强弱轮动策略 | 资产轮动 |
| `FundingRateExtremeStrategy` | 资金费率极值策略 | 费率套利 |
| `CrossExchangeSpreadStrategy` | 跨交易所价差策略 | 跨所套利 |

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    CrossSectionalStrategy                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ AssetDataManager │  │ PortfolioManager │  │  EventEmitter  │  │
│  │  - 多资产数据管理 │  │  - 组合管理       │  │  - 事件通知    │  │
│  │  - 指标计算       │  │  - 仓位分配       │  │               │  │
│  │  - 排名生成       │  │  - 再平衡执行     │  │               │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│MomentumRank   │      │Rotation       │      │FundingExtreme │
│Strategy       │      │Strategy       │      │Strategy       │
├───────────────┤      ├───────────────┤      ├───────────────┤
│- 复合动量     │      │- 相对强弱     │      │- 费率管理     │
│- 动量加速     │      │- 趋势过滤     │      │- 极值检测     │
│- 波动率过滤   │      │- 缓冲区机制   │      │- 费率记录     │
└───────────────┘      └───────────────┘      └───────────────┘
```

### 数据流

```
Market Data → AssetDataManager → Metrics Calculation → Ranking
                                                          ↓
                                                    Asset Selection
                                                          ↓
Execution ← PortfolioManager ← Weight Calculation ← Position Adjustment
```

---

## 核心组件

### AssetDataManager

资产数据管理器负责管理多个资产的历史数据和指标计算。

```javascript
import { AssetDataManager } from './strategies/CrossSectionalStrategy.js';

const manager = new AssetDataManager({
  lookbackPeriod: 20,
  minDailyVolume: 10000000,
  minPrice: 0.0001,
});

// 更新资产数据
manager.updateAssetData('BTC/USDT', candle);

// 批量更新
const candleMap = new Map([
  ['BTC/USDT', btcCandle],
  ['ETH/USDT', ethCandle],
]);
manager.batchUpdate(candleMap);

// 获取指标
const metrics = manager.getMetrics('BTC/USDT');
// { returns, volatility, sharpe, momentum, avgVolume, latestPrice, rsi }

// 获取排名
const ranking = manager.getRanking('returns', 'descending');
// [{ symbol, value, rank, metrics }, ...]

// 获取 Top/Bottom N
const topAssets = manager.getTopN(3, 'sharpe');
const bottomAssets = manager.getBottomN(3, 'returns');
```

**计算的指标**:
- `returns`: 累计收益率
- `volatility`: 波动率 (标准差)
- `sharpe`: 夏普比率
- `momentum`: 动量 (收盘价变化率)
- `avgVolume`: 平均成交量
- `latestPrice`: 最新价格
- `rsi`: 相对强弱指数

### PortfolioManager

组合管理器负责管理目标持仓和当前持仓，计算仓位调整。

```javascript
import { PortfolioManager } from './strategies/CrossSectionalStrategy.js';

const portfolio = new PortfolioManager({
  maxPositionPerAsset: 0.15,
  maxPositionPerSide: 0.5,
  minPositionSize: 0.01,
  equalWeight: true,
  rebalancePeriod: 24 * 60 * 60 * 1000, // 24小时
});

// 设置目标持仓
portfolio.setTargetPositions(
  longAssets,   // [{ symbol, metrics, rank }]
  shortAssets   // [{ symbol, metrics, rank }]
);

// 获取仓位调整
const adjustments = portfolio.getPositionAdjustments();
// { toOpen, toClose, toAdjust }

// 更新当前持仓
portfolio.updateCurrentPosition('BTC/USDT', { side: 'long', weight: 0.1 });

// 检查是否需要再平衡
if (portfolio.needsRebalance()) {
  // 执行再平衡...
  portfolio.markRebalanced();
}

// 获取持仓摘要
const summary = portfolio.getSummary();
// { longCount, shortCount, longWeight, shortWeight, netExposure, grossExposure }
```

---

## 策略类型

### 1. MomentumRankStrategy - 动量排名策略

基于动量指标对资产进行排名，做多动量最强的资产，做空动量最弱的资产。

```javascript
import { MomentumRankStrategy, MOMENTUM_METRICS } from './strategies/MomentumRankStrategy.js';

const strategy = new MomentumRankStrategy({
  symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', ...],

  // 动量配置
  momentumMetric: MOMENTUM_METRICS.RETURNS, // returns, sharpe, momentum, rsi, risk_adjusted
  useCompositeMomentum: true,
  compositeMomentumWeights: {
    returns: 0.3,
    sharpe: 0.2,
    momentum: 0.3,
    rsi: 0.2,
  },

  // 选股配置
  topN: 5,
  bottomN: 3,
  lookbackPeriod: 14,

  // 增强功能
  useMomentumEnhancement: true,
  useVolatilityFilter: true,
  minVolatility: 0.01,
  maxVolatility: 0.15,

  // 市场中性
  marketNeutral: true,
});
```

**特有功能**:
- 复合动量计算
- 动量加速度跟踪
- 波动率过滤
- 动量反转过滤

### 2. RotationStrategy - 强弱轮动策略

基于综合强弱指标的轮动策略，支持多种触发机制。

```javascript
import { RotationStrategy, STRENGTH_METRICS, ROTATION_TRIGGERS } from './strategies/RotationStrategy.js';

const strategy = new RotationStrategy({
  symbols: ['BTC/USDT', 'ETH/USDT', ...],
  benchmarkSymbol: 'BTC/USDT',

  // 强弱指标
  strengthMetric: STRENGTH_METRICS.COMPOSITE, // relative_strength, momentum, risk_adjusted, trend_strength, composite

  // 轮动触发
  rotationTrigger: ROTATION_TRIGGERS.HYBRID, // periodic, rank_change, threshold, hybrid
  minRankChangeToRotate: 3,
  strengthChangeThreshold: 0.05,

  // 缓冲区
  useBufferZone: true,
  bufferZoneSize: 2,

  // 趋势过滤
  useTrendFilter: true,
  trendPeriod: 20,

  // 权重
  strengthWeighted: true,
  equalWeight: false,
});
```

**特有功能**:
- 相对强弱 (RS) 计算
- 趋势强度计算
- 缓冲区机制防止频繁轮动
- 最小持仓周期

### 3. FundingRateExtremeStrategy - 资金费率极值策略

利用永续合约资金费率的极值进行套利。

```javascript
import { FundingRateExtremeStrategy, EXTREME_DETECTION, FUNDING_FREQUENCY } from './strategies/FundingRateExtremeStrategy.js';

const strategy = new FundingRateExtremeStrategy({
  symbols: ['BTC/USDT:USDT', 'ETH/USDT:USDT', ...],

  // 费率配置
  fundingFrequency: FUNDING_FREQUENCY.EIGHT_HOURLY, // hourly, 8h, 4h

  // 极值检测
  extremeDetection: EXTREME_DETECTION.PERCENTILE, // percentile, z_score, absolute, historical
  highRatePercentile: 90,
  lowRatePercentile: 10,
  zScoreThreshold: 2.0,

  // 利差阈值
  minAnnualizedSpread: 0.20, // 20% 年化

  // 持仓配置
  targetHoldingHours: 8,
  maxHoldingHours: 72,
  minHoldingHours: 4,

  // 平仓条件
  rateReversionThreshold: 0.50,
  combinedStopLoss: 0.03,
});

// 处理费率更新
strategy.onFundingRate({
  symbol: 'BTC/USDT:USDT',
  fundingRate: 0.0002,
  fundingRatePredicted: 0.00018,
  fundingTimestamp: Date.now() + 8 * 3600000,
});
```

**特有功能**:
- 费率历史统计
- Z分数/百分位极值检测
- 费率收益累计
- 综合止损 (价格 + 费率)

### 4. CrossExchangeSpreadStrategy - 跨交易所价差策略

跨多个交易所的价差套利策略。

```javascript
import { CrossExchangeSpreadStrategy, SUPPORTED_EXCHANGES, SPREAD_TYPES } from './strategies/CrossExchangeSpreadStrategy.js';

const strategy = new CrossExchangeSpreadStrategy({
  symbols: ['BTC/USDT', 'ETH/USDT', ...],
  exchanges: [
    SUPPORTED_EXCHANGES.BINANCE,
    SUPPORTED_EXCHANGES.BYBIT,
    SUPPORTED_EXCHANGES.OKX,
  ],

  // 价差配置
  spreadType: SPREAD_TYPES.PERP_PERP, // spot_spot, perp_perp, spot_perp, futures_spot
  minSpreadToOpen: 0.003, // 0.3%
  closeSpreadThreshold: 0.001, // 0.1%
  emergencyCloseSpread: -0.002, // -0.2%

  // 仓位配置
  maxPositionPerOpportunity: 0.08,
  maxTotalPosition: 0.40,
  leverage: 3,

  // 执行配置
  simultaneousExecution: true,
  maxSlippage: 0.001,
  orderTimeout: 5000,
});

// 处理 Ticker 更新
strategy.onTicker({
  symbol: 'BTC/USDT',
  exchange: 'binance',
  bid: 50000,
  ask: 50010,
  last: 50005,
  volume: 1000000,
});

// 手动开仓
await strategy.manualOpenArbitrage('BTC/USDT', 'binance', 'bybit', 0.05);

// 手动平仓
await strategy.manualCloseArbitrage(positionId);

// 关闭所有
await strategy.closeAllArbitrages();
```

**特有功能**:
- 实时价差监控
- 自动套利机会检测
- 多交易所价格管理
- 套利仓位跟踪

---

## 快速开始

### 1. 创建策略实例

```javascript
import { MomentumRankStrategy } from './strategies/MomentumRankStrategy.js';

const strategy = new MomentumRankStrategy({
  symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT'],
  topN: 2,
  bottomN: 1,
  lookbackPeriod: 14,
  rebalancePeriod: 24 * 60 * 60 * 1000, // 24小时
  positionType: 'long_short',
  marketNeutral: true,
});
```

### 2. 初始化并启动

```javascript
// 初始化
await strategy.onInit();

// 模拟接收数据
for (const candle of candleData) {
  await strategy.onCandle(candle);
}

// 批量更新
await strategy.batchUpdateCandles(candleMap);

// 强制再平衡
await strategy.forceRebalance();
```

### 3. 获取状态

```javascript
// 获取策略状态
const status = strategy.getStatus();

// 获取当前排名
const ranking = strategy.getCurrentRanking();

// 获取持仓摘要
const portfolio = strategy.portfolioManager.getSummary();
```

---

## 配置参数

### 通用配置

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `symbols` | Array | - | 监控的交易对列表 |
| `lookbackPeriod` | Number | 20 | 回看周期 |
| `rebalancePeriod` | Number | 86400000 | 再平衡周期 (毫秒) |
| `topN` | Number | 3 | 选取Top N个资产做多 |
| `bottomN` | Number | 3 | 选取Bottom N个资产做空 |
| `positionType` | String | 'long_short' | 仓位类型 |
| `maxPositionPerAsset` | Number | 0.10 | 单资产最大仓位 |
| `maxPositionPerSide` | Number | 0.50 | 单边最大仓位 |
| `minDailyVolume` | Number | 10000000 | 最小日成交量 |
| `minPrice` | Number | 0.0001 | 最小价格 |
| `verbose` | Boolean | true | 详细日志 |

### 仓位类型

```javascript
import { POSITION_TYPE } from './strategies/CrossSectionalStrategy.js';

POSITION_TYPE.LONG_ONLY      // 只做多
POSITION_TYPE.SHORT_ONLY     // 只做空
POSITION_TYPE.LONG_SHORT     // 多空双向
POSITION_TYPE.MARKET_NEUTRAL // 市场中性
```

---

## API参考

### CrossSectionalStrategy

```javascript
// 生命周期
async onInit()                    // 初始化
async onCandle(candle)            // 处理K线
async batchUpdateCandles(map)     // 批量更新
async forceRebalance()            // 强制再平衡
async onFinish()                  // 结束

// 查询
getCurrentRanking()               // 获取当前排名
getStatus()                       // 获取策略状态

// 事件
on('rebalanced', callback)        // 再平衡完成
on('positionOpened', callback)    // 开仓
on('positionClosed', callback)    // 平仓
```

### AssetDataManager

```javascript
updateAssetData(symbol, candle)   // 更新数据
batchUpdate(candleMap)            // 批量更新
getMetrics(symbol)                // 获取指标
getRanking(metric, direction)     // 获取排名
getTopN(n, metric)                // Top N
getBottomN(n, metric)             // Bottom N
hasEnoughData(symbol)             // 检查数据是否充足
getAssetsWithEnoughData()         // 获取有效资产
calculateCorrelationMatrix()      // 计算相关性矩阵
getCorrelation(symbol1, symbol2)  // 获取相关性
clear(symbol?)                    // 清除数据
```

### PortfolioManager

```javascript
setTargetPositions(long, short)   // 设置目标仓位
getPositionAdjustments()          // 获取仓位调整
updateCurrentPosition(symbol, pos) // 更新当前仓位
needsRebalance()                  // 检查是否需要再平衡
markRebalanced()                  // 标记已再平衡
getSummary()                      // 获取摘要
recordPositionChange(change)      // 记录仓位变化
clear()                           // 清除所有仓位
```

---

## 最佳实践

### 1. 资产选择

```javascript
// 选择流动性好的资产
const symbols = liquidSymbols.filter(s =>
  dailyVolume[s] > 10000000 && // 日成交量 > 1000万
  price[s] > 0.01              // 价格 > 0.01
);

// 避免高度相关的资产
const correlation = manager.getCorrelation('BTC/USDT', 'ETH/USDT');
if (correlation < 0.8) {
  // 相关性较低，可以一起使用
}
```

### 2. 风险控制

```javascript
const strategy = new MomentumRankStrategy({
  // 分散化
  topN: 5,
  bottomN: 3,

  // 仓位限制
  maxPositionPerAsset: 0.10,  // 单资产 10%
  maxPositionPerSide: 0.40,   // 单边 40%

  // 市场中性降低系统性风险
  marketNeutral: true,

  // 波动率过滤
  useVolatilityFilter: true,
  maxVolatility: 0.15,
});
```

### 3. 避免过拟合

```javascript
// 使用适当的回看周期
const lookbackPeriod = 14; // 不宜过短

// 使用再平衡周期避免过度交易
const rebalancePeriod = 24 * 60 * 60 * 1000; // 至少24小时

// 使用缓冲区避免频繁轮动
const useBufferZone = true;
const bufferZoneSize = 2;
```

### 4. 监控和日志

```javascript
// 监听事件
strategy.on('rebalanced', ({ ranking, adjustments }) => {
  console.log('再平衡完成:', adjustments);
});

strategy.on('positionOpened', ({ symbol, side, weight }) => {
  console.log(`开仓: ${symbol} ${side} ${weight}`);
});

// 定期输出状态
setInterval(() => {
  const status = strategy.getStatus();
  console.log('策略状态:', JSON.stringify(status, null, 2));
}, 60000);
```

---

## 示例

### 完整策略运行示例

```javascript
import { MomentumRankStrategy } from './strategies/MomentumRankStrategy.js';

async function runStrategy() {
  // 1. 创建策略
  const strategy = new MomentumRankStrategy({
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT'],
    topN: 2,
    bottomN: 1,
    lookbackPeriod: 14,
    useCompositeMomentum: true,
    marketNeutral: true,
    verbose: true,
  });

  // 2. 设置事件监听
  strategy.on('rebalanced', (data) => {
    console.log('再平衡:', data);
  });

  // 3. 初始化
  await strategy.onInit();

  // 4. 模拟数据流
  const symbols = strategy.config.symbols;

  for (let i = 0; i < 100; i++) {
    const candleMap = new Map();

    for (const symbol of symbols) {
      candleMap.set(symbol, {
        symbol,
        timestamp: Date.now(),
        open: 100 + Math.random() * 10,
        high: 110 + Math.random() * 10,
        low: 90 + Math.random() * 10,
        close: 100 + Math.random() * 10,
        volume: 1000000 + Math.random() * 500000,
      });
    }

    await strategy.batchUpdateCandles(candleMap);

    // 每20根K线检查再平衡
    if (i > 0 && i % 20 === 0) {
      strategy.portfolioManager.lastRebalanceTime = 0;
      await strategy.forceRebalance();
    }
  }

  // 5. 输出最终状态
  console.log('最终状态:', strategy.getStatus());
  console.log('排名:', strategy.getMomentumRankingDetails());

  // 6. 停止
  await strategy.onFinish();
}

runStrategy().catch(console.error);
```

---

## 常见问题

### Q: 策略不触发再平衡？

A: 检查以下条件:
1. 是否有足够的历史数据 (`lookbackPeriod`)
2. 再平衡周期是否已到 (`rebalancePeriod`)
3. 是否有足够的有效资产

### Q: 排名返回空数组？

A: 确保:
1. 已添加足够的K线数据
2. 交易对名称与配置中的 `symbols` 匹配
3. 资产满足最小成交量和价格要求

### Q: 如何调整仓位权重？

A: 使用以下配置:
```javascript
{
  equalWeight: true,           // 等权重
  strengthWeighted: true,      // 按强弱加权 (RotationStrategy)
  maxPositionPerAsset: 0.10,   // 单资产上限
}
```

---

## 更新日志

- **v1.0.0**: 初始版本，包含 CrossSectionalStrategy 基类
- **v1.1.0**: 添加 MomentumRankStrategy
- **v1.2.0**: 添加 RotationStrategy
- **v1.3.0**: 添加 FundingRateExtremeStrategy
- **v1.4.0**: 添加 CrossExchangeSpreadStrategy
